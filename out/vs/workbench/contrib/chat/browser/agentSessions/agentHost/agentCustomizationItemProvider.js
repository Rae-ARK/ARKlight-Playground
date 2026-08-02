var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { URI } from "../../../../../../base/common/uri.js";
import { extUriBiasedIgnorePathCase } from "../../../../../../base/common/resources.js";
import { CustomizationLoadStatus, CustomizationType } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../../../../services/agentHost/common/agentHostFileSystemService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { toAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { readAgentCustomizationMeta } from "../../../../../../platform/agentHost/common/meta/agentCustomizationMeta.js";
import { AICustomizationSources } from "../../../common/aiCustomizationWorkspaceService.js";
import { PromptsType, Target } from "../../../common/promptSyntax/promptTypes.js";
import { AgentCustomizationContentExpander } from "./agentCustomizationContentExpander.js";
import { IAgentHostCustomizationService } from "./agentHostCustomizationService.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
import { localize } from "../../../../../../nls.js";
const REMOTE_HOST_GROUP = "remote-host";
const REMOTE_CLIENT_GROUP = "remote-client";
let AgentCustomizationItemProvider = class extends Disposable {
  constructor(_connectionAuthority, _getItemActions, _resolveSyncedOrigin, _fileService, _logService, _customAgentsService) {
    super();
    this._connectionAuthority = _connectionAuthority;
    this._getItemActions = _getItemActions;
    this._resolveSyncedOrigin = _resolveSyncedOrigin;
    this._fileService = _fileService;
    this._logService = _logService;
    this._customAgentsService = _customAgentsService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    /** Cache: pluginUri → last expansion (keyed by nonce and label so we re-fetch on content or display-name changes). */
    this._expansionCache = new ResourceMap();
    this._contentExpander = new AgentCustomizationContentExpander(this._fileService, this._logService);
    this._register(this._customAgentsService.onDidChangeCustomizations(() => {
      this._onDidChange.fire();
    }));
  }
  toRemoteUri(customizationUri) {
    const original = URI.parse(customizationUri);
    if (original.scheme === SYNCED_CUSTOMIZATION_SCHEME) {
      return original;
    }
    return toAgentHostUri(original, this._connectionAuthority);
  }
  toBadge(customization, fromClient) {
    if (fromClient) {
      return {
        groupKey: REMOTE_CLIENT_GROUP
      };
    }
    return {
      groupKey: REMOTE_HOST_GROUP
    };
  }
  toItem(customization, source) {
    const clientId = customization.clientId;
    const badge = this.toBadge(customization, clientId !== void 0);
    const uri = this.toRemoteUri(customization.uri);
    return {
      itemKey: customizationItemKey(customization, clientId),
      uri,
      type: "plugin",
      name: customization.name,
      description: void 0,
      source,
      status: toStatusString(customization.load),
      statusMessage: toStatusMessage(customization.load),
      enabled: customization.enabled,
      badge: badge.badge,
      badgeTooltip: badge.badgeTooltip,
      groupKey: badge.groupKey,
      extensionId: void 0,
      pluginUri: uri,
      userInvocable: void 0,
      actions: this._getItemActions?.(customization, clientId)
    };
  }
  toDirectoryItems(customization, source, isRemote) {
    const items = [];
    for (const child of customization.children ?? []) {
      const item = this.toDirectoryChildItem(child, source, isRemote);
      if (item) {
        items.push(item);
      }
    }
    return items;
  }
  toDirectoryChildItem(child, source, isRemote) {
    const type = toPromptsType(child.type);
    if (!type) {
      return void 0;
    }
    let userInvocable = void 0;
    if (child.type === CustomizationType.Agent) {
      userInvocable = readAgentCustomizationMeta(child).userInvocable !== false;
    }
    let groupKey = isRemote ? REMOTE_CLIENT_GROUP : void 0;
    let badge = void 0;
    let badgeTooltip = void 0;
    if (!groupKey && child.type === CustomizationType.Rule) {
      const pattern = child.globs?.[0];
      if (child.globs && child.globs.length > 0) {
        groupKey = "context-instructions";
        badge = pattern === "**" ? localize("alwaysAdded", "always added") : pattern;
        badgeTooltip = pattern === "**" ? localize("alwaysIncluded", "This instruction is automatically included in every interaction.") : localize("contextInstructions", "This instruction is automatically included when files matching '{0}' are in context.", pattern);
      } else if (child.alwaysApply) {
        groupKey = "agent-instructions";
      } else {
        groupKey = "on-demand-instructions";
      }
    }
    return {
      itemKey: child.id,
      uri: this.toRemoteUri(child.uri),
      type,
      name: child.name,
      description: getChildDescription(child),
      source,
      groupKey,
      badge,
      badgeTooltip,
      extensionId: void 0,
      pluginUri: void 0,
      userInvocable
    };
  }
  async provideSourceFolders(sessionResource, type, _token) {
    const workingDirectories = this._customAgentsService.getWorkingDirectories(sessionResource);
    const folders = [];
    for (const customization of this._customAgentsService.getCustomizations(sessionResource)) {
      if (!isDirectoryCustomization(customization) || !customization.writable) {
        continue;
      }
      if (toPromptsType(customization.contents) !== type) {
        continue;
      }
      const source = isUnderAnyRoot(workingDirectories, customization.uri) ? AICustomizationSources.local : AICustomizationSources.user;
      folders.push({
        uri: this.toRemoteUri(customization.uri),
        label: customization.name,
        source
      });
    }
    return folders;
  }
  async provideCustomAgents(sessionResource) {
    const agents = this._customAgentsService.getCustomAgents(sessionResource);
    const sessionTypes = [getChatSessionType(sessionResource)];
    return agents.map((agent) => ({
      id: agent.uri,
      uri: this.toRemoteUri(agent.uri),
      name: agent.name,
      description: agent.description,
      sessionTypes,
      enabled: true,
      // fill default/empty values for all other properties they will not be used by the UI
      // when making a request, all that's needed is the agent id.
      source: { storage: PromptsStorage.local },
      tools: void 0,
      agents: void 0,
      argumentHint: void 0,
      handOffs: void 0,
      hooks: void 0,
      model: void 0,
      agentInstructions: { content: "", toolReferences: [] },
      visibility: {
        agentInvocable: true,
        userInvocable: readAgentCustomizationMeta(agent).userInvocable !== false
      },
      target: Target.Undefined
    }));
  }
  async provideChatSessionCustomizations(sessionResource, token) {
    const items = /* @__PURE__ */ new Map();
    const plugins = [];
    const expandPromises = [];
    const customizations = this._customAgentsService.getCustomizations(sessionResource);
    const directoryCustomizations = [];
    for (const sessionCustomization of customizations) {
      if (isDirectoryCustomization(sessionCustomization)) {
        directoryCustomizations.push(sessionCustomization);
      } else if (sessionCustomization.type === CustomizationType.McpServer) {
        continue;
      } else {
        const isBundleItem = isSyntheticBundle(sessionCustomization);
        const isClientSynced = sessionCustomization.clientId !== void 0;
        const childGroupKey = isClientSynced ? REMOTE_CLIENT_GROUP : REMOTE_HOST_GROUP;
        let item;
        if (!isBundleItem) {
          item = this.toItem(sessionCustomization, AICustomizationSources.plugin);
          items.set(customizationItemKey(sessionCustomization, sessionCustomization.clientId), item);
        } else {
          item = { uri: this.toRemoteUri(sessionCustomization.uri), type: "plugin", source: AICustomizationSources.plugin, name: "", groupKey: childGroupKey, extensionId: void 0, pluginUri: void 0 };
        }
        const pluginMeta = {
          item,
          nonce: sessionCustomization.nonce,
          status: toStatusString(sessionCustomization.load),
          statusMessage: toStatusMessage(sessionCustomization.load),
          enabled: sessionCustomization.enabled,
          childGroupKey,
          isBundleItem,
          pluginLabel: isBundleItem ? void 0 : item.name
        };
        plugins.push(pluginMeta);
        expandPromises.push(this._expandPluginContents(pluginMeta, token));
      }
    }
    const expansions = await Promise.all(expandPromises);
    if (token.isCancellationRequested) {
      return [];
    }
    for (let i = 0; i < plugins.length; i++) {
      const p = plugins[i];
      for (const child of expansions[i]) {
        const enriched = p.isBundleItem ? this._applySyncedOrigin(child) : child;
        items.set(`${p.item.itemKey ?? p.item.uri.toString()}::${enriched.type}::${enriched.name}`, {
          ...enriched,
          status: p.status,
          statusMessage: p.statusMessage,
          enabled: p.enabled
        });
      }
    }
    const workingDirectories = this._customAgentsService.getWorkingDirectories(sessionResource);
    for (const sessionCustomization of directoryCustomizations) {
      const source = isUnderAnyRoot(workingDirectories, sessionCustomization.uri) ? AICustomizationSources.local : AICustomizationSources.user;
      const isRemote = sessionCustomization.clientId !== void 0;
      for (const child of this.toDirectoryItems(sessionCustomization, source, isRemote)) {
        items.set(child.itemKey ?? child.uri.toString(), {
          ...child,
          status: toStatusString(sessionCustomization.load),
          statusMessage: toStatusMessage(sessionCustomization.load),
          enabled: sessionCustomization.enabled
        });
      }
    }
    return [...items.values()];
  }
  /**
   * Rewrites a bundle child item to reflect the original source location of
   * the flattened file, when it can be recovered from the synthetic bundle's
   * reverse map. The synced (in-memory) URI is replaced with the real local
   * URI so the item points at its true origin, and the source/extension/plugin
   * metadata is restored. Returns the item unchanged when no origin is known.
   */
  _applySyncedOrigin(child) {
    const origin = this._resolveSyncedOrigin?.(child.uri);
    if (!origin) {
      return child;
    }
    return {
      ...child,
      uri: origin.uri,
      source: origin.source,
      extensionId: origin.extensionId,
      pluginUri: origin.pluginUri,
      groupKey: origin.source === AICustomizationSources.user ? child.groupKey : void 0
    };
  }
  /**
   * Reads a plugin's directory contents through the agent-host
   * filesystem provider and returns one {@link ICustomizationItem} per
   * supported file (agents/skills/instructions/prompts).
   */
  async _expandPluginContents(plugin, token) {
    const cached = this._expansionCache.get(plugin.item.uri);
    if (cached && cached.nonce === plugin.nonce && cached.pluginLabel === plugin.pluginLabel) {
      return cached.children;
    }
    const children = await this._contentExpander.expandPluginContents(plugin.item.uri, plugin.childGroupKey, plugin.isBundleItem, plugin.item.source, plugin.pluginLabel, token);
    this._expansionCache.set(plugin.item.uri, { nonce: plugin.nonce, pluginLabel: plugin.pluginLabel, children });
    return children;
  }
};
AgentCustomizationItemProvider = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IAgentHostCustomizationService)
], AgentCustomizationItemProvider);
function isParentOrEqual(folderURI, childURI) {
  try {
    return extUriBiasedIgnorePathCase.isEqualOrParent(URI.parse(childURI), URI.parse(folderURI));
  } catch {
    return childURI === folderURI || childURI.startsWith(folderURI + "/");
  }
}
function isUnderAnyRoot(roots, childURI) {
  return roots.some((root) => isParentOrEqual(root, childURI));
}
function toStatusString(load) {
  return load?.kind;
}
function toStatusMessage(load) {
  if (load?.kind === CustomizationLoadStatus.Degraded || load?.kind === CustomizationLoadStatus.Error) {
    return load.message;
  }
  return void 0;
}
function customizationKey(customization) {
  return customization.id;
}
function customizationItemKey(customization, clientId) {
  return clientId !== void 0 ? `${customizationKey(customization)}::${clientId}` : customizationKey(customization);
}
function isDirectoryCustomization(customization) {
  return customization.type === CustomizationType.Directory;
}
function toPromptsType(type) {
  switch (type) {
    case CustomizationType.Agent:
      return PromptsType.agent;
    case CustomizationType.Skill:
      return PromptsType.skill;
    case CustomizationType.Rule:
      return PromptsType.instructions;
    case CustomizationType.Prompt:
      return PromptsType.prompt;
    case CustomizationType.Hook:
      return PromptsType.hook;
    default:
      return void 0;
  }
}
function getChildDescription(child) {
  switch (child.type) {
    case CustomizationType.Agent:
    case CustomizationType.Skill:
    case CustomizationType.Prompt:
    case CustomizationType.Rule:
      return child.description;
    default:
      return void 0;
  }
}
function isSyntheticBundle(customization) {
  try {
    return URI.parse(customization.uri).scheme === SYNCED_CUSTOMIZATION_SCHEME;
  } catch {
    return false;
  }
}
export {
  AgentCustomizationItemProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLCBDdXN0b21pemF0aW9uVHlwZSwgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb24sIHR5cGUgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbiwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb25Mb2FkU3RhdGUsIHR5cGUgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiwgUGx1Z2luQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25JdGVtLCBJQ3VzdG9taXphdGlvbkl0ZW1BY3Rpb24sIElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLCBJQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyByZWFkQWdlbnRDdXN0b21pemF0aW9uTWV0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudEN1c3RvbWl6YXRpb25NZXRhLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvblNvdXJjZSwgQUlDdXN0b21pemF0aW9uU291cmNlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlciB9IGZyb20gJy4vYWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJU3luY2VkQ3VzdG9taXphdGlvbk9yaWdpbiB9IGZyb20gJy4vc3luY2VkQ3VzdG9taXphdGlvbkJ1bmRsZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50U291cmNlLCBJQ3VzdG9tQWdlbnQsIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuXG5jb25zdCBSRU1PVEVfSE9TVF9HUk9VUCA9ICdyZW1vdGUtaG9zdCc7XG5jb25zdCBSRU1PVEVfQ0xJRU5UX0dST1VQID0gJ3JlbW90ZS1jbGllbnQnO1xuXG5cbnR5cGUgUGx1Z2luTWV0YSA9IHsgaXRlbTogSUN1c3RvbWl6YXRpb25JdGVtOyBub25jZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBzdGF0dXM6IFJldHVyblR5cGU8dHlwZW9mIHRvU3RhdHVzU3RyaW5nPjsgc3RhdHVzTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBlbmFibGVkOiBib29sZWFuIHwgdW5kZWZpbmVkOyBjaGlsZEdyb3VwS2V5OiBzdHJpbmc7IGlzQnVuZGxlSXRlbTogYm9vbGVhbjsgcGx1Z2luTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXG5cbmV4cG9ydCBjbGFzcyBBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHQvKiogQ2FjaGU6IHBsdWdpblVyaSBcdTIxOTIgbGFzdCBleHBhbnNpb24gKGtleWVkIGJ5IG5vbmNlIGFuZCBsYWJlbCBzbyB3ZSByZS1mZXRjaCBvbiBjb250ZW50IG9yIGRpc3BsYXktbmFtZSBjaGFuZ2VzKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZXhwYW5zaW9uQ2FjaGUgPSBuZXcgUmVzb3VyY2VNYXA8eyBub25jZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBwbHVnaW5MYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkOyBjaGlsZHJlbjogcmVhZG9ubHkgSUN1c3RvbWl6YXRpb25JdGVtW10gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudEV4cGFuZGVyOiBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldEl0ZW1BY3Rpb25zOiAoKGN1c3RvbWl6YXRpb246IFBsdWdpbkN1c3RvbWl6YXRpb24sIGNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IElDdXN0b21pemF0aW9uSXRlbUFjdGlvbltdIHwgdW5kZWZpbmVkKSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlU3luY2VkT3JpZ2luOiAoKHN5bmNlZFVyaTogVVJJKSA9PiBJU3luY2VkQ3VzdG9taXphdGlvbk9yaWdpbiB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbUFnZW50c1NlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb250ZW50RXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKHRoaXMuX2ZpbGVTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2N1c3RvbUFnZW50c1NlcnZpY2Uub25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b1JlbW90ZVVyaShjdXN0b21pemF0aW9uVXJpOiBzdHJpbmcpOiBVUkkge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gVVJJLnBhcnNlKGN1c3RvbWl6YXRpb25VcmkpO1xuXHRcdC8vIFRoZSBzeW50aGV0aWMgc3luY2VkLWN1c3RvbWl6YXRpb24gYnVuZGxlIGxpdmVzIGluIHRoZSBjbGllbnQnc1xuXHRcdC8vIGluLW1lbW9yeSBmaWxlc3lzdGVtLiBEb24ndCB3cmFwIGl0IGFzIGFuIGFnZW50LWhvc3Q6Ly8gVVJJIFx1MjAxNFxuXHRcdC8vIHRoZSBzZXJ2ZXIgZG9lc24ndCBoYXZlIHRoaXMgc2NoZW1lIHJlZ2lzdGVyZWQsIHNvIHdyYXBwaW5nIGl0XG5cdFx0Ly8gd291bGQgbWFrZSBleHBhbnNpb24gKGFuZCBhbnkgZGlyZWN0IHJlYWQpIGZhaWwuXG5cdFx0aWYgKG9yaWdpbmFsLnNjaGVtZSA9PT0gU1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FKSB7XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWw7XG5cdFx0fVxuXHRcdHJldHVybiB0b0FnZW50SG9zdFVyaShvcmlnaW5hbCwgdGhpcy5fY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdH1cblxuXHRwcml2YXRlIHRvQmFkZ2UoY3VzdG9taXphdGlvbjogUGx1Z2luQ3VzdG9taXphdGlvbiwgZnJvbUNsaWVudDogYm9vbGVhbik6IHsgYmFkZ2U/OiBzdHJpbmc7IGJhZGdlVG9vbHRpcD86IHN0cmluZzsgZ3JvdXBLZXk/OiBzdHJpbmcgfSB7XG5cdFx0aWYgKGZyb21DbGllbnQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGdyb3VwS2V5OiBSRU1PVEVfQ0xJRU5UX0dST1VQLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Z3JvdXBLZXk6IFJFTU9URV9IT1NUX0dST1VQLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHRvSXRlbShjdXN0b21pemF0aW9uOiBQbHVnaW5DdXN0b21pemF0aW9uLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZSk6IElDdXN0b21pemF0aW9uSXRlbSB7XG5cdFx0Y29uc3QgY2xpZW50SWQgPSBjdXN0b21pemF0aW9uLmNsaWVudElkOyAvLyBzZXQgaWYgdGhlIGNvbmZpZ3VyYXRpb24gY2FtZSBmcm9tIHRoZSBjbGllbnRcblx0XHRjb25zdCBiYWRnZSA9IHRoaXMudG9CYWRnZShjdXN0b21pemF0aW9uLCBjbGllbnRJZCAhPT0gdW5kZWZpbmVkKTtcblx0XHRjb25zdCB1cmkgPSB0aGlzLnRvUmVtb3RlVXJpKGN1c3RvbWl6YXRpb24udXJpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aXRlbUtleTogY3VzdG9taXphdGlvbkl0ZW1LZXkoY3VzdG9taXphdGlvbiwgY2xpZW50SWQpLFxuXHRcdFx0dXJpOiB1cmksXG5cdFx0XHR0eXBlOiAncGx1Z2luJyxcblx0XHRcdG5hbWU6IGN1c3RvbWl6YXRpb24ubmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRzb3VyY2UsXG5cdFx0XHRzdGF0dXM6IHRvU3RhdHVzU3RyaW5nKGN1c3RvbWl6YXRpb24ubG9hZCksXG5cdFx0XHRzdGF0dXNNZXNzYWdlOiB0b1N0YXR1c01lc3NhZ2UoY3VzdG9taXphdGlvbi5sb2FkKSxcblx0XHRcdGVuYWJsZWQ6IGN1c3RvbWl6YXRpb24uZW5hYmxlZCxcblx0XHRcdGJhZGdlOiBiYWRnZS5iYWRnZSxcblx0XHRcdGJhZGdlVG9vbHRpcDogYmFkZ2UuYmFkZ2VUb29sdGlwLFxuXHRcdFx0Z3JvdXBLZXk6IGJhZGdlLmdyb3VwS2V5LFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHBsdWdpblVyaTogdXJpLFxuXHRcdFx0dXNlckludm9jYWJsZTogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uczogdGhpcy5fZ2V0SXRlbUFjdGlvbnM/LihjdXN0b21pemF0aW9uLCBjbGllbnRJZCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdG9EaXJlY3RvcnlJdGVtcyhjdXN0b21pemF0aW9uOiBEaXJlY3RvcnlDdXN0b21pemF0aW9uLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZSwgaXNSZW1vdGU6IGJvb2xlYW4pOiBJQ3VzdG9taXphdGlvbkl0ZW1bXSB7XG5cdFx0Y29uc3QgaXRlbXM6IElDdXN0b21pemF0aW9uSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjdXN0b21pemF0aW9uLmNoaWxkcmVuID8/IFtdKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy50b0RpcmVjdG9yeUNoaWxkSXRlbShjaGlsZCwgc291cmNlLCBpc1JlbW90ZSk7XG5cdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRpdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHRwcml2YXRlIHRvRGlyZWN0b3J5Q2hpbGRJdGVtKGNoaWxkOiBDaGlsZEN1c3RvbWl6YXRpb24sIHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlLCBpc1JlbW90ZTogYm9vbGVhbik6IElDdXN0b21pemF0aW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdHlwZSA9IHRvUHJvbXB0c1R5cGUoY2hpbGQudHlwZSk7XG5cdFx0aWYgKCF0eXBlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgdXNlckludm9jYWJsZTogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoY2hpbGQudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuQWdlbnQpIHtcblx0XHRcdHVzZXJJbnZvY2FibGUgPSByZWFkQWdlbnRDdXN0b21pemF0aW9uTWV0YShjaGlsZCkudXNlckludm9jYWJsZSAhPT0gZmFsc2U7XG5cdFx0fVxuXHRcdGxldCBncm91cEtleSA9IGlzUmVtb3RlID8gUkVNT1RFX0NMSUVOVF9HUk9VUCA6IHVuZGVmaW5lZDtcblx0XHRsZXQgYmFkZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgYmFkZ2VUb29sdGlwOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKCFncm91cEtleSAmJiBjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5SdWxlKSB7XG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gY2hpbGQuZ2xvYnM/LlswXTtcblx0XHRcdGlmIChjaGlsZC5nbG9icyAmJiBjaGlsZC5nbG9icy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGdyb3VwS2V5ID0gJ2NvbnRleHQtaW5zdHJ1Y3Rpb25zJztcblx0XHRcdFx0YmFkZ2UgPSBwYXR0ZXJuID09PSAnKionXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWx3YXlzQWRkZWQnLCAnYWx3YXlzIGFkZGVkJylcblx0XHRcdFx0XHQ6IHBhdHRlcm47XG5cdFx0XHRcdGJhZGdlVG9vbHRpcCA9IHBhdHRlcm4gPT09ICcqKidcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhbHdheXNJbmNsdWRlZCcsICdUaGlzIGluc3RydWN0aW9uIGlzIGF1dG9tYXRpY2FsbHkgaW5jbHVkZWQgaW4gZXZlcnkgaW50ZXJhY3Rpb24uJylcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb250ZXh0SW5zdHJ1Y3Rpb25zJywgJ1RoaXMgaW5zdHJ1Y3Rpb24gaXMgYXV0b21hdGljYWxseSBpbmNsdWRlZCB3aGVuIGZpbGVzIG1hdGNoaW5nIFxcJ3swfVxcJyBhcmUgaW4gY29udGV4dC4nLCBwYXR0ZXJuKTtcblx0XHRcdH0gZWxzZSBpZiAoY2hpbGQuYWx3YXlzQXBwbHkpIHtcblx0XHRcdFx0Z3JvdXBLZXkgPSAnYWdlbnQtaW5zdHJ1Y3Rpb25zJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdyb3VwS2V5ID0gJ29uLWRlbWFuZC1pbnN0cnVjdGlvbnMnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpdGVtS2V5OiBjaGlsZC5pZCxcblx0XHRcdHVyaTogdGhpcy50b1JlbW90ZVVyaShjaGlsZC51cmkpLFxuXHRcdFx0dHlwZSxcblx0XHRcdG5hbWU6IGNoaWxkLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZ2V0Q2hpbGREZXNjcmlwdGlvbihjaGlsZCksXG5cdFx0XHRzb3VyY2UsXG5cdFx0XHRncm91cEtleSxcblx0XHRcdGJhZGdlLFxuXHRcdFx0YmFkZ2VUb29sdGlwLFxuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0dXNlckludm9jYWJsZSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZVNvdXJjZUZvbGRlcnMoc2Vzc2lvblJlc291cmNlOiBVUkksIHR5cGU6IFByb21wdHNUeXBlLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlcltdPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY3VzdG9tQWdlbnRzU2VydmljZS5nZXRXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdGNvbnN0IGZvbGRlcnM6IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgdGhpcy5fY3VzdG9tQWdlbnRzU2VydmljZS5nZXRDdXN0b21pemF0aW9ucyhzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRpZiAoIWlzRGlyZWN0b3J5Q3VzdG9taXphdGlvbihjdXN0b21pemF0aW9uKSB8fCAhY3VzdG9taXphdGlvbi53cml0YWJsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0b1Byb21wdHNUeXBlKGN1c3RvbWl6YXRpb24uY29udGVudHMpICE9PSB0eXBlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc291cmNlID0gaXNVbmRlckFueVJvb3Qod29ya2luZ0RpcmVjdG9yaWVzLCBjdXN0b21pemF0aW9uLnVyaSkgPyBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmxvY2FsIDogQUlDdXN0b21pemF0aW9uU291cmNlcy51c2VyO1xuXHRcdFx0Zm9sZGVycy5wdXNoKHtcblx0XHRcdFx0dXJpOiB0aGlzLnRvUmVtb3RlVXJpKGN1c3RvbWl6YXRpb24udXJpKSxcblx0XHRcdFx0bGFiZWw6IGN1c3RvbWl6YXRpb24ubmFtZSxcblx0XHRcdFx0c291cmNlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBmb2xkZXJzO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUN1c3RvbUFnZW50cyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgSUN1c3RvbUFnZW50W10+IHtcblx0XHRjb25zdCBhZ2VudHMgPSB0aGlzLl9jdXN0b21BZ2VudHNTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlcyA9IFtnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKV07XG5cdFx0cmV0dXJuIGFnZW50cy5tYXAoYWdlbnQgPT4gKHtcblx0XHRcdGlkOiBhZ2VudC51cmksXG5cdFx0XHR1cmk6IHRoaXMudG9SZW1vdGVVcmkoYWdlbnQudXJpKSxcblx0XHRcdG5hbWU6IGFnZW50Lm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogYWdlbnQuZGVzY3JpcHRpb24sXG5cdFx0XHRzZXNzaW9uVHlwZXM6IHNlc3Npb25UeXBlcyxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHQvLyBmaWxsIGRlZmF1bHQvZW1wdHkgdmFsdWVzIGZvciBhbGwgb3RoZXIgcHJvcGVydGllcyB0aGV5IHdpbGwgbm90IGJlIHVzZWQgYnkgdGhlIFVJXG5cdFx0XHQvLyB3aGVuIG1ha2luZyBhIHJlcXVlc3QsIGFsbCB0aGF0J3MgbmVlZGVkIGlzIHRoZSBhZ2VudCBpZC5cblx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9IHNhdGlzZmllcyBJQWdlbnRTb3VyY2UsXG5cdFx0XHR0b29sczogdW5kZWZpbmVkLFxuXHRcdFx0YWdlbnRzOiB1bmRlZmluZWQsXG5cdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGhhbmRPZmZzOiB1bmRlZmluZWQsXG5cdFx0XHRob29rczogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICcnLCB0b29sUmVmZXJlbmNlczogW10gfSxcblx0XHRcdHZpc2liaWxpdHk6IHtcblx0XHRcdFx0YWdlbnRJbnZvY2FibGU6IHRydWUsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGU6IHJlYWRBZ2VudEN1c3RvbWl6YXRpb25NZXRhKGFnZW50KS51c2VySW52b2NhYmxlICE9PSBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZFxuXHRcdH0gc2F0aXNmaWVzIElDdXN0b21BZ2VudCkpO1xuXG5cdH1cblxuXHRhc3luYyBwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdGNvbnN0IGl0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIElDdXN0b21pemF0aW9uSXRlbT4oKTtcblxuXHRcdC8vIEJ1aWxkIHBhcmVudCBwbHVnaW4gaXRlbXMga2V5ZWQgYnkgY3VzdG9taXphdGlvbiByZWZcblx0XHRjb25zdCBwbHVnaW5zOiBQbHVnaW5NZXRhW10gPSBbXTtcblx0XHRjb25zdCBleHBhbmRQcm9taXNlczogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1bXT5bXSA9IFtdO1xuXG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IHRoaXMuX2N1c3RvbUFnZW50c1NlcnZpY2UuZ2V0Q3VzdG9taXphdGlvbnMoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdGNvbnN0IGRpcmVjdG9yeUN1c3RvbWl6YXRpb25zID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uQ3VzdG9taXphdGlvbiBvZiBjdXN0b21pemF0aW9ucykge1xuXHRcdFx0aWYgKGlzRGlyZWN0b3J5Q3VzdG9taXphdGlvbihzZXNzaW9uQ3VzdG9taXphdGlvbikpIHtcblx0XHRcdFx0ZGlyZWN0b3J5Q3VzdG9taXphdGlvbnMucHVzaChzZXNzaW9uQ3VzdG9taXphdGlvbik7XG5cdFx0XHR9IGVsc2UgaWYgKHNlc3Npb25DdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcikge1xuXHRcdFx0XHQvLyBCYXJlIE1DUCBzZXJ2ZXIgZW50cmllcyBhcmVuJ3Qgc2hvd24gYXMgcGx1Z2luIGl0ZW1zIGluIHRoaXMgdmlldy5cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpc0J1bmRsZUl0ZW0gPSBpc1N5bnRoZXRpY0J1bmRsZShzZXNzaW9uQ3VzdG9taXphdGlvbik7XG5cdFx0XHRcdGNvbnN0IGlzQ2xpZW50U3luY2VkID0gc2Vzc2lvbkN1c3RvbWl6YXRpb24uY2xpZW50SWQgIT09IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgY2hpbGRHcm91cEtleSA9IGlzQ2xpZW50U3luY2VkID8gUkVNT1RFX0NMSUVOVF9HUk9VUCA6IFJFTU9URV9IT1NUX0dST1VQO1xuXG5cdFx0XHRcdC8vIEFsd2F5cyBzaG93IHNlc3Npb24gY3VzdG9taXphdGlvbnMgYXMgZGlzdGluY3QgcGx1Z2luIGVudHJpZXMgXHUyMDE0XG5cdFx0XHRcdC8vIGNsaWVudC1zeW5jZWQgaXRlbXMgYXBwZWFyIGluIHRoZSBcIkxvY2FsXCIgZ3JvdXAsIGhvc3Qtb3duZWQgaW5cblx0XHRcdFx0Ly8gdGhlIFwiUmVtb3RlXCIgZ3JvdXAuIFRoZSBzeW50aGV0aWMgYnVuZGxlIGlzIGFuIGltcGxlbWVudGF0aW9uXG5cdFx0XHRcdC8vIGRldGFpbCBhbmQgaXMgbm90IHNob3duIGFzIGEgc3RhbmRhbG9uZSBlbnRyeSwgYnV0IGlzIHN0aWxsXG5cdFx0XHRcdC8vIGV4cGFuZGVkIGJlbG93IHNvIGluZGl2aWR1YWwgdXNlciBmaWxlcyBhcHBlYXIgaW4gcGVyLXR5cGUgdGFicy5cblx0XHRcdFx0bGV0IGl0ZW06IElDdXN0b21pemF0aW9uSXRlbTtcblx0XHRcdFx0aWYgKCFpc0J1bmRsZUl0ZW0pIHtcblx0XHRcdFx0XHRpdGVtID0gdGhpcy50b0l0ZW0oc2Vzc2lvbkN1c3RvbWl6YXRpb24sIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luKTtcblx0XHRcdFx0XHRpdGVtcy5zZXQoY3VzdG9taXphdGlvbkl0ZW1LZXkoc2Vzc2lvbkN1c3RvbWl6YXRpb24sIHNlc3Npb25DdXN0b21pemF0aW9uLmNsaWVudElkKSwgaXRlbSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gY3JlYXRlIGEgZHVtbXkgcGFyZW50IGl0ZW0gZm9yIHRoZSBzeW50aGV0aWMgYnVuZGxlLCBpdCBkb2VzIG5vdCBnbyBpbnRvIHRoZSBpdGVtcyBtYXAsIGp1c3QgbmVlZCBpdCB0byBleHBhbmQuXG5cdFx0XHRcdFx0aXRlbSA9IHsgdXJpOiB0aGlzLnRvUmVtb3RlVXJpKHNlc3Npb25DdXN0b21pemF0aW9uLnVyaSksIHR5cGU6ICdwbHVnaW4nLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBuYW1lOiAnJywgZ3JvdXBLZXk6IGNoaWxkR3JvdXBLZXksIGV4dGVuc2lvbklkOiB1bmRlZmluZWQsIHBsdWdpblVyaTogdW5kZWZpbmVkIH0gc2F0aXNmaWVzIElDdXN0b21pemF0aW9uSXRlbTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwbHVnaW5NZXRhID0ge1xuXHRcdFx0XHRcdGl0ZW0sXG5cdFx0XHRcdFx0bm9uY2U6IChzZXNzaW9uQ3VzdG9taXphdGlvbiBhcyBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uKS5ub25jZSxcblx0XHRcdFx0XHRzdGF0dXM6IHRvU3RhdHVzU3RyaW5nKHNlc3Npb25DdXN0b21pemF0aW9uLmxvYWQpLFxuXHRcdFx0XHRcdHN0YXR1c01lc3NhZ2U6IHRvU3RhdHVzTWVzc2FnZShzZXNzaW9uQ3VzdG9taXphdGlvbi5sb2FkKSxcblx0XHRcdFx0XHRlbmFibGVkOiBzZXNzaW9uQ3VzdG9taXphdGlvbi5lbmFibGVkLFxuXHRcdFx0XHRcdGNoaWxkR3JvdXBLZXksXG5cdFx0XHRcdFx0aXNCdW5kbGVJdGVtLFxuXHRcdFx0XHRcdHBsdWdpbkxhYmVsOiBpc0J1bmRsZUl0ZW0gPyB1bmRlZmluZWQgOiBpdGVtLm5hbWUsXG5cdFx0XHRcdH0gc2F0aXNmaWVzIFBsdWdpbk1ldGE7XG5cdFx0XHRcdHBsdWdpbnMucHVzaChwbHVnaW5NZXRhKTtcblx0XHRcdFx0ZXhwYW5kUHJvbWlzZXMucHVzaCh0aGlzLl9leHBhbmRQbHVnaW5Db250ZW50cyhwbHVnaW5NZXRhLCB0b2tlbikpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEV4cGFuZCBlYWNoIHBsdWdpbiBkaXJlY3RvcnkgaW4gcGFyYWxsZWwgdG8gZGlzY292ZXIgaW5kaXZpZHVhbCBza2lsbHMsIGFnZW50cywgaW5zdHJ1Y3Rpb25zLCBhbmQgcHJvbXB0cyBpbnNpZGUuXG5cdFx0Y29uc3QgZXhwYW5zaW9ucyA9IGF3YWl0IFByb21pc2UuYWxsKGV4cGFuZFByb21pc2VzKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcGx1Z2lucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcCA9IHBsdWdpbnNbaV07XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGV4cGFuc2lvbnNbaV0pIHtcblx0XHRcdFx0Ly8gRmlsZXMgZmxhdHRlbmVkIGludG8gdGhlIHN5bnRoZXRpYyBidW5kbGUgbG9zdCB0aGVpciBvcmlnaW5hbFxuXHRcdFx0XHQvLyBwcm92ZW5hbmNlOyByZWNvdmVyIGl0IChleHRlbnNpb24vcGx1Z2luL2J1aWx0LWluIGFuZCBzb3VyY2Vcblx0XHRcdFx0Ly8gbG9jYXRpb24pIHNvIHRoZSBpdGVtIHJlZmxlY3RzIHdoZXJlIGl0IGFjdHVhbGx5IGNhbWUgZnJvbS5cblx0XHRcdFx0Y29uc3QgZW5yaWNoZWQgPSBwLmlzQnVuZGxlSXRlbSA/IHRoaXMuX2FwcGx5U3luY2VkT3JpZ2luKGNoaWxkKSA6IGNoaWxkO1xuXHRcdFx0XHQvLyBDaGlsZHJlbiBpbmhlcml0IHRoZSBwYXJlbnQgcGx1Z2luJ3Mgc3RhdHVzL2VuYWJsZWQgc3RhdGUuXG5cdFx0XHRcdGl0ZW1zLnNldChgJHtwLml0ZW0uaXRlbUtleSA/PyBwLml0ZW0udXJpLnRvU3RyaW5nKCl9Ojoke2VucmljaGVkLnR5cGV9Ojoke2VucmljaGVkLm5hbWV9YCwge1xuXHRcdFx0XHRcdC4uLmVucmljaGVkLFxuXHRcdFx0XHRcdHN0YXR1czogcC5zdGF0dXMsXG5cdFx0XHRcdFx0c3RhdHVzTWVzc2FnZTogcC5zdGF0dXNNZXNzYWdlLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHAuZW5hYmxlZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY3VzdG9tQWdlbnRzU2VydmljZS5nZXRXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbkN1c3RvbWl6YXRpb24gb2YgZGlyZWN0b3J5Q3VzdG9taXphdGlvbnMpIHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IGlzVW5kZXJBbnlSb290KHdvcmtpbmdEaXJlY3Rvcmllcywgc2Vzc2lvbkN1c3RvbWl6YXRpb24udXJpKSA/IEFJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWwgOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXI7XG5cdFx0XHRjb25zdCBpc1JlbW90ZSA9IHNlc3Npb25DdXN0b21pemF0aW9uLmNsaWVudElkICE9PSB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHRoaXMudG9EaXJlY3RvcnlJdGVtcyhzZXNzaW9uQ3VzdG9taXphdGlvbiwgc291cmNlLCBpc1JlbW90ZSkpIHtcblx0XHRcdFx0aXRlbXMuc2V0KGNoaWxkLml0ZW1LZXkgPz8gY2hpbGQudXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHQuLi5jaGlsZCxcblx0XHRcdFx0XHRzdGF0dXM6IHRvU3RhdHVzU3RyaW5nKHNlc3Npb25DdXN0b21pemF0aW9uLmxvYWQpLFxuXHRcdFx0XHRcdHN0YXR1c01lc3NhZ2U6IHRvU3RhdHVzTWVzc2FnZShzZXNzaW9uQ3VzdG9taXphdGlvbi5sb2FkKSxcblx0XHRcdFx0XHRlbmFibGVkOiBzZXNzaW9uQ3VzdG9taXphdGlvbi5lbmFibGVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5pdGVtcy52YWx1ZXMoKV07XG5cdH1cblxuXHQvKipcblx0ICogUmV3cml0ZXMgYSBidW5kbGUgY2hpbGQgaXRlbSB0byByZWZsZWN0IHRoZSBvcmlnaW5hbCBzb3VyY2UgbG9jYXRpb24gb2Zcblx0ICogdGhlIGZsYXR0ZW5lZCBmaWxlLCB3aGVuIGl0IGNhbiBiZSByZWNvdmVyZWQgZnJvbSB0aGUgc3ludGhldGljIGJ1bmRsZSdzXG5cdCAqIHJldmVyc2UgbWFwLiBUaGUgc3luY2VkIChpbi1tZW1vcnkpIFVSSSBpcyByZXBsYWNlZCB3aXRoIHRoZSByZWFsIGxvY2FsXG5cdCAqIFVSSSBzbyB0aGUgaXRlbSBwb2ludHMgYXQgaXRzIHRydWUgb3JpZ2luLCBhbmQgdGhlIHNvdXJjZS9leHRlbnNpb24vcGx1Z2luXG5cdCAqIG1ldGFkYXRhIGlzIHJlc3RvcmVkLiBSZXR1cm5zIHRoZSBpdGVtIHVuY2hhbmdlZCB3aGVuIG5vIG9yaWdpbiBpcyBrbm93bi5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5U3luY2VkT3JpZ2luKGNoaWxkOiBJQ3VzdG9taXphdGlvbkl0ZW0pOiBJQ3VzdG9taXphdGlvbkl0ZW0ge1xuXHRcdGNvbnN0IG9yaWdpbiA9IHRoaXMuX3Jlc29sdmVTeW5jZWRPcmlnaW4/LihjaGlsZC51cmkpO1xuXHRcdGlmICghb3JpZ2luKSB7XG5cdFx0XHRyZXR1cm4gY2hpbGQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jaGlsZCxcblx0XHRcdHVyaTogb3JpZ2luLnVyaSxcblx0XHRcdHNvdXJjZTogb3JpZ2luLnNvdXJjZSxcblx0XHRcdGV4dGVuc2lvbklkOiBvcmlnaW4uZXh0ZW5zaW9uSWQsXG5cdFx0XHRwbHVnaW5Vcmk6IG9yaWdpbi5wbHVnaW5VcmksXG5cdFx0XHRncm91cEtleTogb3JpZ2luLnNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy51c2VyID8gY2hpbGQuZ3JvdXBLZXkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBhIHBsdWdpbidzIGRpcmVjdG9yeSBjb250ZW50cyB0aHJvdWdoIHRoZSBhZ2VudC1ob3N0XG5cdCAqIGZpbGVzeXN0ZW0gcHJvdmlkZXIgYW5kIHJldHVybnMgb25lIHtAbGluayBJQ3VzdG9taXphdGlvbkl0ZW19IHBlclxuXHQgKiBzdXBwb3J0ZWQgZmlsZSAoYWdlbnRzL3NraWxscy9pbnN0cnVjdGlvbnMvcHJvbXB0cykuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9leHBhbmRQbHVnaW5Db250ZW50cyhwbHVnaW46IFBsdWdpbk1ldGEsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgSUN1c3RvbWl6YXRpb25JdGVtW10+IHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9leHBhbnNpb25DYWNoZS5nZXQocGx1Z2luLml0ZW0udXJpKTtcblx0XHRpZiAoY2FjaGVkICYmIGNhY2hlZC5ub25jZSA9PT0gcGx1Z2luLm5vbmNlICYmIGNhY2hlZC5wbHVnaW5MYWJlbCA9PT0gcGx1Z2luLnBsdWdpbkxhYmVsKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkLmNoaWxkcmVuO1xuXHRcdH1cblx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IHRoaXMuX2NvbnRlbnRFeHBhbmRlci5leHBhbmRQbHVnaW5Db250ZW50cyhwbHVnaW4uaXRlbS51cmksIHBsdWdpbi5jaGlsZEdyb3VwS2V5LCBwbHVnaW4uaXNCdW5kbGVJdGVtLCBwbHVnaW4uaXRlbS5zb3VyY2UsIHBsdWdpbi5wbHVnaW5MYWJlbCwgdG9rZW4pO1xuXHRcdHRoaXMuX2V4cGFuc2lvbkNhY2hlLnNldChwbHVnaW4uaXRlbS51cmksIHsgbm9uY2U6IHBsdWdpbi5ub25jZSwgcGx1Z2luTGFiZWw6IHBsdWdpbi5wbHVnaW5MYWJlbCwgY2hpbGRyZW4gfSk7XG5cdFx0cmV0dXJuIGNoaWxkcmVuO1xuXHR9XG59XG5mdW5jdGlvbiBpc1BhcmVudE9yRXF1YWwoZm9sZGVyVVJJOiBzdHJpbmcsIGNoaWxkVVJJOiBzdHJpbmcpOiBib29sZWFuIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KFVSSS5wYXJzZShjaGlsZFVSSSksIFVSSS5wYXJzZShmb2xkZXJVUkkpKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGNoaWxkVVJJID09PSBmb2xkZXJVUkkgfHwgY2hpbGRVUkkuc3RhcnRzV2l0aChmb2xkZXJVUkkgKyAnLycpO1xuXHR9XG59XG5cbi8qKiBUcnVlIHdoZW4gYGNoaWxkVVJJYCBpcyBjb250YWluZWQgYnkgKG9yIGVxdWFsIHRvKSBhbnkgb2YgdGhlIHdvcmtzcGFjZSByb290cy4gKi9cbmZ1bmN0aW9uIGlzVW5kZXJBbnlSb290KHJvb3RzOiByZWFkb25seSBzdHJpbmdbXSwgY2hpbGRVUkk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcm9vdHMuc29tZShyb290ID0+IGlzUGFyZW50T3JFcXVhbChyb290LCBjaGlsZFVSSSkpO1xufVxuXG5mdW5jdGlvbiB0b1N0YXR1c1N0cmluZyhsb2FkOiBDdXN0b21pemF0aW9uTG9hZFN0YXRlIHwgdW5kZWZpbmVkKTogJ2xvYWRpbmcnIHwgJ2xvYWRlZCcgfCAnZGVncmFkZWQnIHwgJ2Vycm9yJyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBsb2FkPy5raW5kO1xufVxuXG5mdW5jdGlvbiB0b1N0YXR1c01lc3NhZ2UobG9hZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0ZSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChsb2FkPy5raW5kID09PSBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5EZWdyYWRlZCB8fCBsb2FkPy5raW5kID09PSBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5FcnJvcikge1xuXHRcdHJldHVybiBsb2FkLm1lc3NhZ2U7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gY3VzdG9taXphdGlvbktleShjdXN0b21pemF0aW9uOiBDdXN0b21pemF0aW9uKTogc3RyaW5nIHtcblx0cmV0dXJuIGN1c3RvbWl6YXRpb24uaWQ7XG59XG5cbmZ1bmN0aW9uIGN1c3RvbWl6YXRpb25JdGVtS2V5KGN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24sIGNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRyZXR1cm4gY2xpZW50SWQgIT09IHVuZGVmaW5lZFxuXHRcdD8gYCR7Y3VzdG9taXphdGlvbktleShjdXN0b21pemF0aW9uKX06OiR7Y2xpZW50SWR9YFxuXHRcdDogY3VzdG9taXphdGlvbktleShjdXN0b21pemF0aW9uKTtcbn1cblxuZnVuY3Rpb24gaXNEaXJlY3RvcnlDdXN0b21pemF0aW9uKGN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24pOiBjdXN0b21pemF0aW9uIGlzIERpcmVjdG9yeUN1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4gY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3Rvcnk7XG59XG5cbmZ1bmN0aW9uIHRvUHJvbXB0c1R5cGUodHlwZTogQ2hpbGRDdXN0b21pemF0aW9uWyd0eXBlJ10pOiBQcm9tcHRzVHlwZSB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuQWdlbnQ6XG5cdFx0XHRyZXR1cm4gUHJvbXB0c1R5cGUuYWdlbnQ7XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbDpcblx0XHRcdHJldHVybiBQcm9tcHRzVHlwZS5za2lsbDtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLlJ1bGU6XG5cdFx0XHRyZXR1cm4gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zO1xuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuUHJvbXB0OlxuXHRcdFx0cmV0dXJuIFByb21wdHNUeXBlLnByb21wdDtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLkhvb2s6XG5cdFx0XHRyZXR1cm4gUHJvbXB0c1R5cGUuaG9vaztcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRDaGlsZERlc2NyaXB0aW9uKGNoaWxkOiBDaGlsZEN1c3RvbWl6YXRpb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKGNoaWxkLnR5cGUpIHtcblx0XHRjYXNlIEN1c3RvbWl6YXRpb25UeXBlLkFnZW50OlxuXHRcdGNhc2UgQ3VzdG9taXphdGlvblR5cGUuU2tpbGw6XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5Qcm9tcHQ6XG5cdFx0Y2FzZSBDdXN0b21pemF0aW9uVHlwZS5SdWxlOlxuXHRcdFx0cmV0dXJuIGNoaWxkLmRlc2NyaXB0aW9uO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyBgdHJ1ZWAgZm9yIHRoZSBzeW50aGV0aWMgXCJWUyBDb2RlIFN5bmNlZCBEYXRhXCIgYnVuZGxlIHBsdWdpbixcbiAqIHdoaWNoIGlzIGFuIGltcGxlbWVudGF0aW9uIGRldGFpbCBvZiB0aGUgY3VzdG9taXphdGlvbiBzeW5jIHBpcGVsaW5lXG4gKiBhbmQgc2hvdWxkIG5vdCBiZSBzdXJmYWNlZCBhcyBhIHN0YW5kYWxvbmUgaXRlbSBpbiB0aGUgVUkuXG4gKi9cbmZ1bmN0aW9uIGlzU3ludGhldGljQnVuZGxlKGN1c3RvbWl6YXRpb246IEN1c3RvbWl6YXRpb24pOiBib29sZWFuIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gVVJJLnBhcnNlKGN1c3RvbWl6YXRpb24udXJpKS5zY2hlbWUgPT09IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMseUJBQXlCLHlCQUFxTDtBQUN2TixTQUFTLG1CQUFtQjtBQUU1QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtDQUFrQztBQUMzQyxTQUFnQyw4QkFBOEI7QUFDOUQsU0FBUyxhQUFhLGNBQWM7QUFDcEMsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxzQ0FBc0M7QUFFL0MsU0FBcUMsc0JBQXNCO0FBQzNELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBR3pCLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sc0JBQXNCO0FBTXJCLElBQU0saUNBQU4sY0FBNkMsV0FB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
