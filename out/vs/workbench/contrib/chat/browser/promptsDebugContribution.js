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
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { OS } from "../../../../base/common/platform.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IChatDebugService } from "../common/chatDebugService.js";
import { isAgentHostTarget } from "../common/chatSessionsService.js";
import { getChatSessionType } from "../common/model/chatUri.js";
import { IChatAgentService } from "../common/participants/chatAgents.js";
import { IChatService } from "../common/chatService/chatService.js";
import { formatHookCommandLabel } from "../common/promptSyntax/hookSchema.js";
import { HookType } from "../common/promptSyntax/hookTypes.js";
import { PromptsType } from "../common/promptSyntax/promptTypes.js";
import { IPromptsService } from "../common/promptSyntax/service/promptsService.js";
import { lastInstructionsCollectionResult } from "../common/promptSyntax/computeAutomaticInstructions.js";
let PromptsDebugContribution = class extends Disposable {
  constructor(promptsService, chatAgentService, chatService, chatDebugService, logService) {
    super();
    this.promptsService = promptsService;
    /**
     * Maps debug event IDs to their discovery info, so that
     * {@link IChatDebugService.resolveEvent} can return rich details.
     */
    this._discoveryEventDetails = /* @__PURE__ */ new Map();
    this._customizationEventDetails = /* @__PURE__ */ new Map();
    this._loggedSessions = /* @__PURE__ */ new Set();
    this._register(chatService.onDidDisposeSession((e) => {
      for (const sessionResource of e.sessionResources) {
        this._loggedSessions.delete(sessionResource.toString());
      }
    }));
    this._register(chatAgentService.onWillInvokeAgent(async (e) => {
      const sessionKey = e.request.sessionResource.toString();
      const isFirstInvocation = !this._loggedSessions.has(sessionKey);
      this._loggedSessions.add(sessionKey);
      const sessionResource = e.request.sessionResource;
      if (isFirstInvocation) {
        const cts = new CancellationTokenSource();
        try {
          const discoveryTypes = isAgentHostTarget(getChatSessionType(sessionResource)) ? [PromptsType.instructions, PromptsType.hook] : [PromptsType.agent, PromptsType.instructions, PromptsType.prompt, PromptsType.skill, PromptsType.hook];
          const discoveryInfos = await Promise.all(discoveryTypes.map((type) => this.promptsService.getDiscoveryInfo(type, cts.token)));
          for (const discoveryInfo of discoveryInfos) {
            const { name, details } = this.getDiscoveryLogEntry(discoveryInfo);
            const eventId = generateUuid();
            this._discoveryEventDetails.set(eventId, discoveryInfo);
            if (this._discoveryEventDetails.size > PromptsDebugContribution.MAX_DISCOVERY_DETAILS) {
              const first = this._discoveryEventDetails.keys().next().value;
              if (first !== void 0) {
                this._discoveryEventDetails.delete(first);
              }
            }
            const loaded = discoveryInfo.files.filter((f) => f.status === "loaded").map((f) => f.promptPath.name ?? f.promptPath.uri.path.split("/").pop() ?? f.promptPath.uri.toString());
            const skipped = discoveryInfo.files.filter((f) => f.status === "skipped").map((f) => {
              const label = f.promptPath.uri.toString();
              return f.skipReason ? `${label} (${f.skipReason})` : label;
            });
            const folders = discoveryInfo.sourceFolders?.map((sf) => sf.uri.path) ?? [];
            const parts = [];
            if (details) {
              parts.push(details);
            }
            if (loaded.length > 0) {
              parts.push(`loaded: [${truncateList(loaded)}]`);
            }
            if (skipped.length > 0) {
              parts.push(`skipped: [${truncateList(skipped)}]`);
            }
            if (folders.length > 0) {
              parts.push(`folders: [${truncateList(folders)}]`);
            }
            const newDetails = parts.join(" | ") || void 0;
            chatDebugService.log(
              sessionResource,
              name,
              newDetails,
              void 0,
              { id: eventId, category: "discovery" }
            );
          }
        } catch (error) {
          logService.error("Error while logging prompt discovery info to chat debug service", error);
        } finally {
          cts.dispose();
        }
      }
      const lastResult = lastInstructionsCollectionResult;
      if (!isFirstInvocation && lastResult) {
        const { telemetryEvent: collectionEvent, debugInfo } = lastResult;
        let resolvedHooks;
        try {
          const hookDiscoveryInfo = await this.promptsService.getDiscoveryInfo(PromptsType.hook, CancellationToken.None);
          resolvedHooks = hookDiscoveryInfo.hooksInfo?.hooks;
        } catch (error) {
          logService.warn("Error while fetching hooks for customization debug event", error);
        }
        const parts = [];
        if (collectionEvent.applyingInstructionsCount > 0) {
          parts.push(localize("customizations.applying", "{0} applying", collectionEvent.applyingInstructionsCount));
        }
        if (collectionEvent.referencedInstructionsCount > 0) {
          parts.push(localize("customizations.referenced", "{0} referenced", collectionEvent.referencedInstructionsCount));
        }
        if (collectionEvent.agentInstructionsCount > 0) {
          parts.push(localize("customizations.agent", "{0} agent", collectionEvent.agentInstructionsCount));
        }
        if (collectionEvent.listedInstructionsCount > 0) {
          parts.push(localize("customizations.listed", "{0} listed", collectionEvent.listedInstructionsCount));
        }
        const durationStr = debugInfo.durationInMillis.toFixed(1);
        const summary = parts.length > 0 ? localize("customizationsResolved.details", "Resolved {0} customizations ({1}) in {2}ms", collectionEvent.totalInstructionsCount, parts.join(", "), durationStr) : localize("customizationsResolved.none", "No customizations resolved");
        const detailSummaries = debugInfo.debugDetails.map((e2) => {
          const detail = e2.reason ? `${e2.name} \u2014 ${e2.reason}` : e2.name;
          return `[${e2.category}] ${detail}`;
        });
        const details = detailSummaries.length > 0 ? `${summary} | ${detailSummaries.join(", ")}` : summary;
        const customizationEventId = generateUuid();
        this._customizationEventDetails.set(customizationEventId, { debugInfo, hooks: resolvedHooks });
        if (this._customizationEventDetails.size > PromptsDebugContribution.MAX_DISCOVERY_DETAILS) {
          const first = this._customizationEventDetails.keys().next().value;
          if (first !== void 0) {
            this._customizationEventDetails.delete(first);
          }
        }
        chatDebugService.log(
          sessionResource,
          localize("customizationsResolved", "Resolve Customizations"),
          details,
          void 0,
          { id: customizationEventId, category: "customization" }
        );
      }
    }));
    this._register(chatDebugService.registerProvider({
      provideChatDebugLog: async () => void 0,
      resolveChatDebugLogEvent: async (eventId) => {
        return this._resolveDiscoveryEvent(eventId) ?? this._resolveCustomizationEvent(eventId);
      }
    }));
  }
  getDiscoveryLogEntry(discoveryInfo) {
    const durationInMillis = discoveryInfo.durationInMillis.toFixed(1);
    const loadedCount = discoveryInfo.files.filter((file) => file.status === "loaded").length;
    const skippedCount = discoveryInfo.files.length - loadedCount;
    switch (discoveryInfo.type) {
      case PromptsType.prompt:
        return {
          name: localize("promptsService.loadSlashCommands", "Slash Commands Discovery"),
          details: loadedCount === 1 ? localize("promptsDebugContribution.resolvedSlashCommand", "Resolved {0} slash command in {1}ms", loadedCount, durationInMillis) : localize("promptsDebugContribution.resolvedSlashCommands", "Resolved {0} slash commands in {1}ms", loadedCount, durationInMillis)
        };
      case PromptsType.agent:
        return {
          name: localize("promptsService.loadAgents", "Agent Discovery"),
          details: loadedCount === 1 ? localize("promptsDebugContribution.resolvedAgent", "Resolved {0} agent in {1}ms", loadedCount, durationInMillis) : localize("promptsDebugContribution.resolvedAgents", "Resolved {0} agents in {1}ms", loadedCount, durationInMillis)
        };
      case PromptsType.skill:
        return {
          name: localize("promptsService.loadSkills", "Skill Discovery"),
          details: loadedCount === 1 ? localize("promptsDebugContribution.resolvedSkill", "Resolved {0} skill in {1}ms", loadedCount, durationInMillis) : localize("promptsDebugContribution.resolvedSkills", "Resolved {0} skills in {1}ms", loadedCount, durationInMillis)
        };
      case PromptsType.instructions:
        return {
          name: localize("promptsService.loadInstructions", "Instructions Discovery"),
          details: loadedCount === 1 ? localize("promptsDebugContribution.resolvedInstruction", "Resolved {0} instruction in {1}ms", loadedCount, durationInMillis) : localize("promptsDebugContribution.resolvedInstructions", "Resolved {0} instructions in {1}ms", loadedCount, durationInMillis)
        };
      case PromptsType.hook: {
        const hookDiscoveryInfo = discoveryInfo;
        const hookCount = hookDiscoveryInfo.hooksInfo ? Object.values(hookDiscoveryInfo.hooksInfo.hooks).reduce((total, hooks) => total + hooks.length, 0) : loadedCount;
        const details = skippedCount > 0 ? localize("promptsDebugContribution.resolvedHooksWithSkipped", "Resolved {0} hooks from {1} files in {2}ms, skipped {3}", hookCount, loadedCount, durationInMillis, skippedCount) : hookCount === 1 ? localize("promptsDebugContribution.resolvedHook", "Resolved {0} hook in {1}ms", hookCount, durationInMillis) : localize("promptsDebugContribution.resolvedHooks", "Resolved {0} hooks in {1}ms", hookCount, durationInMillis);
        return {
          name: localize("promptsService.loadHooks", "Hook Discovery"),
          details
        };
      }
    }
  }
  _resolveDiscoveryEvent(eventId) {
    const info = this._discoveryEventDetails.get(eventId);
    if (!info) {
      return void 0;
    }
    return this._toFileListContent(info);
  }
  _resolveCustomizationEvent(eventId) {
    const data = this._customizationEventDetails.get(eventId);
    if (!data) {
      return void 0;
    }
    const { debugInfo, hooks } = data;
    const logs = [...debugInfo.debugDetails];
    if (hooks) {
      for (const hookType of Object.values(HookType)) {
        const commands = hooks[hookType];
        if (commands && commands.length > 0) {
          for (const cmd of commands) {
            const commandLabel = formatHookCommandLabel(cmd, OS) || localize("hook.unknownCommand", "(unknown command)");
            logs.push({
              category: "hook",
              name: commandLabel,
              reason: hookType,
              uri: cmd.sourceUri
            });
          }
        }
      }
    }
    return {
      kind: "customizationSummary",
      resolutionLogs: logs,
      durationInMillis: debugInfo.durationInMillis,
      counts: {
        instructions: logs.filter((e) => e.category === "applying" || e.category === "referenced").length,
        skills: logs.filter((e) => e.category === "skill").length,
        agents: logs.filter((e) => e.category === "custom-agent").length,
        hooks: logs.filter((e) => e.category === "hook").length,
        skipped: logs.filter((e) => e.category === "skipped").length
      }
    };
  }
  _toFileListContent(info) {
    return {
      kind: "fileList",
      discoveryType: info.type,
      durationInMillis: info.durationInMillis,
      files: info.files.map((f) => ({
        uri: f.promptPath.uri,
        name: f.promptPath.name,
        status: f.status,
        storage: f.promptPath.storage,
        extensionId: f.promptPath.extension?.identifier.value,
        skipReason: f.skipReason,
        errorMessage: f.errorMessage,
        duplicateOf: f.duplicateOf
      })),
      sourceFolders: info.sourceFolders?.map((sf) => ({
        uri: sf.uri,
        storage: sf.storage
      }))
    };
  }
};
PromptsDebugContribution.ID = "workbench.contrib.promptsDebug";
PromptsDebugContribution.MAX_DISCOVERY_DETAILS = 1e4;
PromptsDebugContribution = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatDebugService),
  __decorateParam(4, ILogService)
], PromptsDebugContribution);
const MAX_LIST_ITEMS = 100;
function truncateList(items) {
  if (items.length <= MAX_LIST_ITEMS) {
    return items.join(", ");
  }
  return items.slice(0, MAX_LIST_ITEMS).join(", ") + ` (+${items.length - MAX_LIST_ITEMS} more)`;
}
export {
  PromptsDebugContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wcm9tcHRzRGVidWdDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXREZWJ1Z0N1c3RvbWl6YXRpb25Mb2dFbnRyeSwgSUNoYXREZWJ1Z0V2ZW50RmlsZUxpc3RDb250ZW50LCBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQsIElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEhvc3RUYXJnZXQgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RIb29rcywgZm9ybWF0SG9va0NvbW1hbmRMYWJlbCB9IGZyb20gJy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1NjaGVtYS5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJSG9va0Rpc2NvdmVyeUluZm8sIHR5cGUgSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkRlYnVnSW5mbywgSVByb21wdERpc2NvdmVyeUluZm8sIElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBsYXN0SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvblJlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucy5qcyc7XG5cbmludGVyZmFjZSBJQ3VzdG9taXphdGlvbkV2ZW50RGF0YSB7XG5cdHJlYWRvbmx5IGRlYnVnSW5mbzogSW5zdHJ1Y3Rpb25zQ29sbGVjdGlvbkRlYnVnSW5mbztcblx0cmVhZG9ubHkgaG9va3M6IENoYXRSZXF1ZXN0SG9va3MgfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQnJpZGdlcyBwcm9tcHQgZGlzY292ZXJ5IGluZm9ybWF0aW9uIHRvIHtAbGluayBJQ2hhdERlYnVnU2VydmljZX0uXG4gKi9cbmV4cG9ydCBjbGFzcyBQcm9tcHRzRGVidWdDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnByb21wdHNEZWJ1Zyc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTUFYX0RJU0NPVkVSWV9ERVRBSUxTID0gMTBfMDAwO1xuXG5cdC8qKlxuXHQgKiBNYXBzIGRlYnVnIGV2ZW50IElEcyB0byB0aGVpciBkaXNjb3ZlcnkgaW5mbywgc28gdGhhdFxuXHQgKiB7QGxpbmsgSUNoYXREZWJ1Z1NlcnZpY2UucmVzb2x2ZUV2ZW50fSBjYW4gcmV0dXJuIHJpY2ggZGV0YWlscy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc2NvdmVyeUV2ZW50RGV0YWlscyA9IG5ldyBNYXA8c3RyaW5nLCBJUHJvbXB0RGlzY292ZXJ5SW5mbz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvbkV2ZW50RGV0YWlscyA9IG5ldyBNYXA8c3RyaW5nLCBJQ3VzdG9taXphdGlvbkV2ZW50RGF0YT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VkU2Vzc2lvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb21wdHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvbXB0c1NlcnZpY2U6IElQcm9tcHRzU2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdERlYnVnU2VydmljZSBjaGF0RGVidWdTZXJ2aWNlOiBJQ2hhdERlYnVnU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBDbGVhbiB1cCBsb2dnZWQtc2Vzc2lvbiBlbnRyaWVzIHdoZW4gc2Vzc2lvbnMgYXJlIGRpc3Bvc2VkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRTZXJ2aWNlLm9uRGlkRGlzcG9zZVNlc3Npb24oZSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb25SZXNvdXJjZSBvZiBlLnNlc3Npb25SZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VkU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBGb3J3YXJkIGRpc2NvdmVyeSBsb2cgZXZlbnRzIHRvIHRoZSBkZWJ1ZyBzZXJ2aWNlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRBZ2VudFNlcnZpY2Uub25XaWxsSW52b2tlQWdlbnQoYXN5bmMgZSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gZS5yZXF1ZXN0LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgaXNGaXJzdEludm9jYXRpb24gPSAhdGhpcy5fbG9nZ2VkU2Vzc2lvbnMuaGFzKHNlc3Npb25LZXkpO1xuXHRcdFx0dGhpcy5fbG9nZ2VkU2Vzc2lvbnMuYWRkKHNlc3Npb25LZXkpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBlLnJlcXVlc3Quc2Vzc2lvblJlc291cmNlO1xuXG5cdFx0XHRpZiAoaXNGaXJzdEludm9jYXRpb24pIHtcblx0XHRcdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gRm9yIGFnZW50LWhvc3QgKENvcGlsb3QgQ0xJKSBzZXNzaW9ucywgVlMgQ29kZSBjb3JlIHN0aWxsIGNvbGxlY3RzXG5cdFx0XHRcdFx0Ly8gaW5zdHJ1Y3Rpb25zIGFuZCBob29rcyBhbmQgcGFzc2VzIHRoZW0gaW50byB0aGUgYWdlbnQtaG9zdCByZXF1ZXN0LFxuXHRcdFx0XHRcdC8vIHNvIHRob3NlIGRpc2NvdmVyeSBldmVudHMgYXJlIHJlbGV2YW50LiBBZ2VudCAvIHNraWxsIC8gc2xhc2gtY29tbWFuZFxuXHRcdFx0XHRcdC8vIGRpc2NvdmVyeSByZWZsZWN0cyBWUyBDb2RlJ3Mgb3duIGNoYXQtcGFydGljaXBhbnQgZGlzY292ZXJ5LCB3aGljaCB0aGVcblx0XHRcdFx0XHQvLyBhZ2VudCBob3N0IGRvZXMgbm90IGNvbnN1bWUgKHRoZSBhZ2VudCBob3N0IHN1cmZhY2VzIGl0cyBhY3R1YWxseSBsb2FkZWRcblx0XHRcdFx0XHQvLyBjdXN0b21pemF0aW9ucyBzZXBhcmF0ZWx5KSwgc28gd2Ugc3VwcHJlc3MgdGhvc2UgdG8gYXZvaWQgbm9pc2UuXG5cdFx0XHRcdFx0Y29uc3QgZGlzY292ZXJ5VHlwZXMgPSBpc0FnZW50SG9zdFRhcmdldChnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSlcblx0XHRcdFx0XHRcdD8gW1Byb21wdHNUeXBlLmluc3RydWN0aW9ucywgUHJvbXB0c1R5cGUuaG9va11cblx0XHRcdFx0XHRcdDogW1Byb21wdHNUeXBlLmFnZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIFByb21wdHNUeXBlLnByb21wdCwgUHJvbXB0c1R5cGUuc2tpbGwsIFByb21wdHNUeXBlLmhvb2tdO1xuXHRcdFx0XHRcdGNvbnN0IGRpc2NvdmVyeUluZm9zID0gYXdhaXQgUHJvbWlzZS5hbGwoZGlzY292ZXJ5VHlwZXMubWFwKHR5cGUgPT4gdGhpcy5wcm9tcHRzU2VydmljZS5nZXREaXNjb3ZlcnlJbmZvKHR5cGUsIGN0cy50b2tlbikpKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRpc2NvdmVyeUluZm8gb2YgZGlzY292ZXJ5SW5mb3MpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHsgbmFtZSwgZGV0YWlscyB9ID0gdGhpcy5nZXREaXNjb3ZlcnlMb2dFbnRyeShkaXNjb3ZlcnlJbmZvKTtcblx0XHRcdFx0XHRcdGNvbnN0IGV2ZW50SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5fZGlzY292ZXJ5RXZlbnREZXRhaWxzLnNldChldmVudElkLCBkaXNjb3ZlcnlJbmZvKTtcblxuXHRcdFx0XHRcdFx0Ly8gRXZpY3Qgb2xkZXN0IGVudHJpZXMgd2hlbiB0aGUgbWFwIGV4Y2VlZHMgdGhlIGNhcC5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9kaXNjb3ZlcnlFdmVudERldGFpbHMuc2l6ZSA+IFByb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5NQVhfRElTQ09WRVJZX0RFVEFJTFMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZmlyc3QgPSB0aGlzLl9kaXNjb3ZlcnlFdmVudERldGFpbHMua2V5cygpLm5leHQoKS52YWx1ZTtcblx0XHRcdFx0XHRcdFx0aWYgKGZpcnN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9kaXNjb3ZlcnlFdmVudERldGFpbHMuZGVsZXRlKGZpcnN0KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBFbnJpY2ggZGV0YWlscyB3aXRoIGZpbGUgcGF0aHMgc28gdGhleSBhcHBlYXIgaW4gdGhlIGV2ZW50XG5cdFx0XHRcdFx0XHQvLyBwYXlsb2FkIChlLmcuIGZvcndhcmRlZCB2aWEgb25EaWRSZWNlaXZlQ2hhdERlYnVnRXZlbnQgdG8gdGhlXG5cdFx0XHRcdFx0XHQvLyBleHRlbnNpb24ncyBKU09OTCBmaWxlIGxvZ2dlcikuXG5cdFx0XHRcdFx0XHRjb25zdCBsb2FkZWQgPSBkaXNjb3ZlcnlJbmZvLmZpbGVzXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIoZiA9PiBmLnN0YXR1cyA9PT0gJ2xvYWRlZCcpXG5cdFx0XHRcdFx0XHRcdC5tYXAoZiA9PiBmLnByb21wdFBhdGgubmFtZSA/PyBmLnByb21wdFBhdGgudXJpLnBhdGguc3BsaXQoJy8nKS5wb3AoKSA/PyBmLnByb21wdFBhdGgudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2tpcHBlZCA9IGRpc2NvdmVyeUluZm8uZmlsZXMuZmlsdGVyKGYgPT4gZi5zdGF0dXMgPT09ICdza2lwcGVkJykubWFwKGYgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGYucHJvbXB0UGF0aC51cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGYuc2tpcFJlYXNvbiA/IGAke2xhYmVsfSAoJHtmLnNraXBSZWFzb259KWAgOiBsYWJlbDtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0Y29uc3QgZm9sZGVycyA9IGRpc2NvdmVyeUluZm8uc291cmNlRm9sZGVycz8ubWFwKHNmID0+IHNmLnVyaS5wYXRoKSA/PyBbXTtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRcdFx0aWYgKGRldGFpbHMpIHtcblx0XHRcdFx0XHRcdFx0cGFydHMucHVzaChkZXRhaWxzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChsb2FkZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKGBsb2FkZWQ6IFske3RydW5jYXRlTGlzdChsb2FkZWQpfV1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChza2lwcGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0cGFydHMucHVzaChgc2tpcHBlZDogWyR7dHJ1bmNhdGVMaXN0KHNraXBwZWQpfV1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChmb2xkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0cGFydHMucHVzaChgZm9sZGVyczogWyR7dHJ1bmNhdGVMaXN0KGZvbGRlcnMpfV1gKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IG5ld0RldGFpbHMgPSBwYXJ0cy5qb2luKCcgfCAnKSB8fCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRcdGNoYXREZWJ1Z1NlcnZpY2UubG9nKFxuXHRcdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0XHRcdG5ld0RldGFpbHMsXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0eyBpZDogZXZlbnRJZCwgY2F0ZWdvcnk6ICdkaXNjb3ZlcnknIH0sXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdFcnJvciB3aGlsZSBsb2dnaW5nIHByb21wdCBkaXNjb3ZlcnkgaW5mbyB0byBjaGF0IGRlYnVnIHNlcnZpY2UnLCBlcnJvcik7XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0Y3RzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb2cgcmVzb2x2ZWQgY3VzdG9taXphdGlvbnMgZnJvbSB0aGUgbGFzdCBpbnN0cnVjdGlvbnMgY29sbGVjdGlvbi5cblx0XHRcdGNvbnN0IGxhc3RSZXN1bHQgPSBsYXN0SW5zdHJ1Y3Rpb25zQ29sbGVjdGlvblJlc3VsdDtcblx0XHRcdGlmICghaXNGaXJzdEludm9jYXRpb24gJiYgbGFzdFJlc3VsdCkge1xuXHRcdFx0XHRjb25zdCB7IHRlbGVtZXRyeUV2ZW50OiBjb2xsZWN0aW9uRXZlbnQsIGRlYnVnSW5mbyB9ID0gbGFzdFJlc3VsdDtcblx0XHRcdFx0Ly8gRmV0Y2ggdGhlIGNhY2hlZCBob29rIGRpc2NvdmVyeSBpbmZvLlxuXHRcdFx0XHRsZXQgcmVzb2x2ZWRIb29rczogQ2hhdFJlcXVlc3RIb29rcyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBob29rRGlzY292ZXJ5SW5mbyA9IGF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0RGlzY292ZXJ5SW5mbyhQcm9tcHRzVHlwZS5ob29rLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSBhcyBJSG9va0Rpc2NvdmVyeUluZm87XG5cdFx0XHRcdFx0cmVzb2x2ZWRIb29rcyA9IGhvb2tEaXNjb3ZlcnlJbmZvLmhvb2tzSW5mbz8uaG9va3M7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS53YXJuKCdFcnJvciB3aGlsZSBmZXRjaGluZyBob29rcyBmb3IgY3VzdG9taXphdGlvbiBkZWJ1ZyBldmVudCcsIGVycm9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHRpZiAoY29sbGVjdGlvbkV2ZW50LmFwcGx5aW5nSW5zdHJ1Y3Rpb25zQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnY3VzdG9taXphdGlvbnMuYXBwbHlpbmcnLCAnezB9IGFwcGx5aW5nJywgY29sbGVjdGlvbkV2ZW50LmFwcGx5aW5nSW5zdHJ1Y3Rpb25zQ291bnQpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29sbGVjdGlvbkV2ZW50LnJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudCA+IDApIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdjdXN0b21pemF0aW9ucy5yZWZlcmVuY2VkJywgJ3swfSByZWZlcmVuY2VkJywgY29sbGVjdGlvbkV2ZW50LnJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb2xsZWN0aW9uRXZlbnQuYWdlbnRJbnN0cnVjdGlvbnNDb3VudCA+IDApIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKGxvY2FsaXplKCdjdXN0b21pemF0aW9ucy5hZ2VudCcsICd7MH0gYWdlbnQnLCBjb2xsZWN0aW9uRXZlbnQuYWdlbnRJbnN0cnVjdGlvbnNDb3VudCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb2xsZWN0aW9uRXZlbnQubGlzdGVkSW5zdHJ1Y3Rpb25zQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0cGFydHMucHVzaChsb2NhbGl6ZSgnY3VzdG9taXphdGlvbnMubGlzdGVkJywgJ3swfSBsaXN0ZWQnLCBjb2xsZWN0aW9uRXZlbnQubGlzdGVkSW5zdHJ1Y3Rpb25zQ291bnQpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkdXJhdGlvblN0ciA9IGRlYnVnSW5mby5kdXJhdGlvbkluTWlsbGlzLnRvRml4ZWQoMSk7XG5cdFx0XHRcdGNvbnN0IHN1bW1hcnkgPSBwYXJ0cy5sZW5ndGggPiAwXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY3VzdG9taXphdGlvbnNSZXNvbHZlZC5kZXRhaWxzJywgJ1Jlc29sdmVkIHswfSBjdXN0b21pemF0aW9ucyAoezF9KSBpbiB7Mn1tcycsIGNvbGxlY3Rpb25FdmVudC50b3RhbEluc3RydWN0aW9uc0NvdW50LCBwYXJ0cy5qb2luKCcsICcpLCBkdXJhdGlvblN0cilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjdXN0b21pemF0aW9uc1Jlc29sdmVkLm5vbmUnLCAnTm8gY3VzdG9taXphdGlvbnMgcmVzb2x2ZWQnKTtcblx0XHRcdFx0Y29uc3QgZGV0YWlsU3VtbWFyaWVzID0gZGVidWdJbmZvLmRlYnVnRGV0YWlscy5tYXAoZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZGV0YWlsID0gZS5yZWFzb24gPyBgJHtlLm5hbWV9IFx1MjAxNCAke2UucmVhc29ufWAgOiBlLm5hbWU7XG5cdFx0XHRcdFx0cmV0dXJuIGBbJHtlLmNhdGVnb3J5fV0gJHtkZXRhaWx9YDtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGRldGFpbHMgPSBkZXRhaWxTdW1tYXJpZXMubGVuZ3RoID4gMFxuXHRcdFx0XHRcdD8gYCR7c3VtbWFyeX0gfCAke2RldGFpbFN1bW1hcmllcy5qb2luKCcsICcpfWBcblx0XHRcdFx0XHQ6IHN1bW1hcnk7XG5cblx0XHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbkV2ZW50SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0dGhpcy5fY3VzdG9taXphdGlvbkV2ZW50RGV0YWlscy5zZXQoY3VzdG9taXphdGlvbkV2ZW50SWQsIHsgZGVidWdJbmZvLCBob29rczogcmVzb2x2ZWRIb29rcyB9KTtcblxuXHRcdFx0XHQvLyBFdmljdCBvbGRlc3QgZW50cmllcyB3aGVuIHRoZSBtYXAgZXhjZWVkcyB0aGUgY2FwLlxuXHRcdFx0XHRpZiAodGhpcy5fY3VzdG9taXphdGlvbkV2ZW50RGV0YWlscy5zaXplID4gUHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLk1BWF9ESVNDT1ZFUllfREVUQUlMUykge1xuXHRcdFx0XHRcdGNvbnN0IGZpcnN0ID0gdGhpcy5fY3VzdG9taXphdGlvbkV2ZW50RGV0YWlscy5rZXlzKCkubmV4dCgpLnZhbHVlO1xuXHRcdFx0XHRcdGlmIChmaXJzdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jdXN0b21pemF0aW9uRXZlbnREZXRhaWxzLmRlbGV0ZShmaXJzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hhdERlYnVnU2VydmljZS5sb2coXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdjdXN0b21pemF0aW9uc1Jlc29sdmVkJywgJ1Jlc29sdmUgQ3VzdG9taXphdGlvbnMnKSxcblx0XHRcdFx0XHRkZXRhaWxzLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR7IGlkOiBjdXN0b21pemF0aW9uRXZlbnRJZCwgY2F0ZWdvcnk6ICdjdXN0b21pemF0aW9uJyB9LFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHQvLyBSZWdpc3RlciBhIHJlc29sdmUgcHJvdmlkZXIgc28gZXhwYW5kaW5nIGEgZGlzY292ZXJ5IGV2ZW50XG5cdFx0Ly8gaW4gdGhlIEFnZW50IERlYnVnIExvZ3Mgc2hvd3MgdGhlIGZ1bGwgZmlsZSBsaXN0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXREZWJ1Z1NlcnZpY2UucmVnaXN0ZXJQcm92aWRlcih7XG5cdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRyZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQ6IGFzeW5jIChldmVudElkKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlRGlzY292ZXJ5RXZlbnQoZXZlbnRJZCkgPz8gdGhpcy5fcmVzb2x2ZUN1c3RvbWl6YXRpb25FdmVudChldmVudElkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldERpc2NvdmVyeUxvZ0VudHJ5KGRpc2NvdmVyeUluZm86IElQcm9tcHREaXNjb3ZlcnlJbmZvKTogeyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGRldGFpbHM/OiBzdHJpbmcgfSB7XG5cblx0XHRjb25zdCBkdXJhdGlvbkluTWlsbGlzID0gZGlzY292ZXJ5SW5mby5kdXJhdGlvbkluTWlsbGlzLnRvRml4ZWQoMSk7XG5cdFx0Y29uc3QgbG9hZGVkQ291bnQgPSBkaXNjb3ZlcnlJbmZvLmZpbGVzLmZpbHRlcihmaWxlID0+IGZpbGUuc3RhdHVzID09PSAnbG9hZGVkJykubGVuZ3RoO1xuXHRcdGNvbnN0IHNraXBwZWRDb3VudCA9IGRpc2NvdmVyeUluZm8uZmlsZXMubGVuZ3RoIC0gbG9hZGVkQ291bnQ7XG5cblx0XHRzd2l0Y2ggKGRpc2NvdmVyeUluZm8udHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ3Byb21wdHNTZXJ2aWNlLmxvYWRTbGFzaENvbW1hbmRzJywgJ1NsYXNoIENvbW1hbmRzIERpc2NvdmVyeScpLFxuXHRcdFx0XHRcdGRldGFpbHM6IGxvYWRlZENvdW50ID09PSAxXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdwcm9tcHRzRGVidWdDb250cmlidXRpb24ucmVzb2x2ZWRTbGFzaENvbW1hbmQnLCAnUmVzb2x2ZWQgezB9IHNsYXNoIGNvbW1hbmQgaW4gezF9bXMnLCBsb2FkZWRDb3VudCwgZHVyYXRpb25Jbk1pbGxpcylcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZFNsYXNoQ29tbWFuZHMnLCAnUmVzb2x2ZWQgezB9IHNsYXNoIGNvbW1hbmRzIGluIHsxfW1zJywgbG9hZGVkQ291bnQsIGR1cmF0aW9uSW5NaWxsaXMpXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdwcm9tcHRzU2VydmljZS5sb2FkQWdlbnRzJywgJ0FnZW50IERpc2NvdmVyeScpLFxuXHRcdFx0XHRcdGRldGFpbHM6IGxvYWRlZENvdW50ID09PSAxXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdwcm9tcHRzRGVidWdDb250cmlidXRpb24ucmVzb2x2ZWRBZ2VudCcsICdSZXNvbHZlZCB7MH0gYWdlbnQgaW4gezF9bXMnLCBsb2FkZWRDb3VudCwgZHVyYXRpb25Jbk1pbGxpcylcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZEFnZW50cycsICdSZXNvbHZlZCB7MH0gYWdlbnRzIGluIHsxfW1zJywgbG9hZGVkQ291bnQsIGR1cmF0aW9uSW5NaWxsaXMpXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdwcm9tcHRzU2VydmljZS5sb2FkU2tpbGxzJywgJ1NraWxsIERpc2NvdmVyeScpLFxuXHRcdFx0XHRcdGRldGFpbHM6IGxvYWRlZENvdW50ID09PSAxXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdwcm9tcHRzRGVidWdDb250cmlidXRpb24ucmVzb2x2ZWRTa2lsbCcsICdSZXNvbHZlZCB7MH0gc2tpbGwgaW4gezF9bXMnLCBsb2FkZWRDb3VudCwgZHVyYXRpb25Jbk1pbGxpcylcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZFNraWxscycsICdSZXNvbHZlZCB7MH0gc2tpbGxzIGluIHsxfW1zJywgbG9hZGVkQ291bnQsIGR1cmF0aW9uSW5NaWxsaXMpXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgncHJvbXB0c1NlcnZpY2UubG9hZEluc3RydWN0aW9ucycsICdJbnN0cnVjdGlvbnMgRGlzY292ZXJ5JyksXG5cdFx0XHRcdFx0ZGV0YWlsczogbG9hZGVkQ291bnQgPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZEluc3RydWN0aW9uJywgJ1Jlc29sdmVkIHswfSBpbnN0cnVjdGlvbiBpbiB7MX1tcycsIGxvYWRlZENvdW50LCBkdXJhdGlvbkluTWlsbGlzKVxuXHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgncHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLnJlc29sdmVkSW5zdHJ1Y3Rpb25zJywgJ1Jlc29sdmVkIHswfSBpbnN0cnVjdGlvbnMgaW4gezF9bXMnLCBsb2FkZWRDb3VudCwgZHVyYXRpb25Jbk1pbGxpcylcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaG9vazoge1xuXHRcdFx0XHRjb25zdCBob29rRGlzY292ZXJ5SW5mbyA9IGRpc2NvdmVyeUluZm8gYXMgSUhvb2tEaXNjb3ZlcnlJbmZvO1xuXHRcdFx0XHRjb25zdCBob29rQ291bnQgPSBob29rRGlzY292ZXJ5SW5mby5ob29rc0luZm9cblx0XHRcdFx0XHQ/IE9iamVjdC52YWx1ZXMoaG9va0Rpc2NvdmVyeUluZm8uaG9va3NJbmZvLmhvb2tzKS5yZWR1Y2UoKHRvdGFsLCBob29rcykgPT4gdG90YWwgKyBob29rcy5sZW5ndGgsIDApXG5cdFx0XHRcdFx0OiBsb2FkZWRDb3VudDtcblx0XHRcdFx0Y29uc3QgZGV0YWlscyA9IHNraXBwZWRDb3VudCA+IDBcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdwcm9tcHRzRGVidWdDb250cmlidXRpb24ucmVzb2x2ZWRIb29rc1dpdGhTa2lwcGVkJywgJ1Jlc29sdmVkIHswfSBob29rcyBmcm9tIHsxfSBmaWxlcyBpbiB7Mn1tcywgc2tpcHBlZCB7M30nLCBob29rQ291bnQsIGxvYWRlZENvdW50LCBkdXJhdGlvbkluTWlsbGlzLCBza2lwcGVkQ291bnQpXG5cdFx0XHRcdFx0OiBob29rQ291bnQgPT09IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3Byb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbi5yZXNvbHZlZEhvb2snLCAnUmVzb2x2ZWQgezB9IGhvb2sgaW4gezF9bXMnLCBob29rQ291bnQsIGR1cmF0aW9uSW5NaWxsaXMpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdwcm9tcHRzRGVidWdDb250cmlidXRpb24ucmVzb2x2ZWRIb29rcycsICdSZXNvbHZlZCB7MH0gaG9va3MgaW4gezF9bXMnLCBob29rQ291bnQsIGR1cmF0aW9uSW5NaWxsaXMpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdwcm9tcHRzU2VydmljZS5sb2FkSG9va3MnLCAnSG9vayBEaXNjb3ZlcnknKSxcblx0XHRcdFx0XHRkZXRhaWxzXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZURpc2NvdmVyeUV2ZW50KGV2ZW50SWQ6IHN0cmluZyk6IElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2Rpc2NvdmVyeUV2ZW50RGV0YWlscy5nZXQoZXZlbnRJZCk7XG5cdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl90b0ZpbGVMaXN0Q29udGVudChpbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVDdXN0b21pemF0aW9uRXZlbnQoZXZlbnRJZDogc3RyaW5nKTogSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fY3VzdG9taXphdGlvbkV2ZW50RGV0YWlscy5nZXQoZXZlbnRJZCk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZGVidWdJbmZvLCBob29rcyB9ID0gZGF0YTtcblx0XHRjb25zdCBsb2dzOiBJQ2hhdERlYnVnQ3VzdG9taXphdGlvbkxvZ0VudHJ5W10gPSBbLi4uZGVidWdJbmZvLmRlYnVnRGV0YWlsc107XG5cblx0XHQvLyBBZGQgaG9vayBlbnRyaWVzIGZyb20gdGhlIHJlc29sdmVkIGhvb2tzIFx1MjAxNCBlYWNoIGNvbW1hbmQgY2FycmllcyBpdHMgc291cmNlVXJpLlxuXHRcdGlmIChob29rcykge1xuXHRcdFx0Zm9yIChjb25zdCBob29rVHlwZSBvZiBPYmplY3QudmFsdWVzKEhvb2tUeXBlKSkge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kcyA9IGhvb2tzW2hvb2tUeXBlXTtcblx0XHRcdFx0aWYgKGNvbW1hbmRzICYmIGNvbW1hbmRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNtZCBvZiBjb21tYW5kcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tbWFuZExhYmVsID0gZm9ybWF0SG9va0NvbW1hbmRMYWJlbChjbWQsIE9TKSB8fCBsb2NhbGl6ZSgnaG9vay51bmtub3duQ29tbWFuZCcsICcodW5rbm93biBjb21tYW5kKScpO1xuXHRcdFx0XHRcdFx0bG9ncy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0Y2F0ZWdvcnk6ICdob29rJyxcblx0XHRcdFx0XHRcdFx0bmFtZTogY29tbWFuZExhYmVsLFxuXHRcdFx0XHRcdFx0XHRyZWFzb246IGhvb2tUeXBlLFxuXHRcdFx0XHRcdFx0XHR1cmk6IGNtZC5zb3VyY2VVcmksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2N1c3RvbWl6YXRpb25TdW1tYXJ5Jyxcblx0XHRcdHJlc29sdXRpb25Mb2dzOiBsb2dzLFxuXHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogZGVidWdJbmZvLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRjb3VudHM6IHtcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBsb2dzLmZpbHRlcihlID0+IGUuY2F0ZWdvcnkgPT09ICdhcHBseWluZycgfHwgZS5jYXRlZ29yeSA9PT0gJ3JlZmVyZW5jZWQnKS5sZW5ndGgsXG5cdFx0XHRcdHNraWxsczogbG9ncy5maWx0ZXIoZSA9PiBlLmNhdGVnb3J5ID09PSAnc2tpbGwnKS5sZW5ndGgsXG5cdFx0XHRcdGFnZW50czogbG9ncy5maWx0ZXIoZSA9PiBlLmNhdGVnb3J5ID09PSAnY3VzdG9tLWFnZW50JykubGVuZ3RoLFxuXHRcdFx0XHRob29rczogbG9ncy5maWx0ZXIoZSA9PiBlLmNhdGVnb3J5ID09PSAnaG9vaycpLmxlbmd0aCxcblx0XHRcdFx0c2tpcHBlZDogbG9ncy5maWx0ZXIoZSA9PiBlLmNhdGVnb3J5ID09PSAnc2tpcHBlZCcpLmxlbmd0aCxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RvRmlsZUxpc3RDb250ZW50KGluZm86IElQcm9tcHREaXNjb3ZlcnlJbmZvKTogSUNoYXREZWJ1Z0V2ZW50RmlsZUxpc3RDb250ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2ZpbGVMaXN0Jyxcblx0XHRcdGRpc2NvdmVyeVR5cGU6IGluZm8udHlwZSxcblx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IGluZm8uZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdGZpbGVzOiBpbmZvLmZpbGVzLm1hcChmID0+ICh7XG5cdFx0XHRcdHVyaTogZi5wcm9tcHRQYXRoLnVyaSxcblx0XHRcdFx0bmFtZTogZi5wcm9tcHRQYXRoLm5hbWUsXG5cdFx0XHRcdHN0YXR1czogZi5zdGF0dXMsXG5cdFx0XHRcdHN0b3JhZ2U6IGYucHJvbXB0UGF0aC5zdG9yYWdlLFxuXHRcdFx0XHRleHRlbnNpb25JZDogZi5wcm9tcHRQYXRoLmV4dGVuc2lvbj8uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0c2tpcFJlYXNvbjogZi5za2lwUmVhc29uLFxuXHRcdFx0XHRlcnJvck1lc3NhZ2U6IGYuZXJyb3JNZXNzYWdlLFxuXHRcdFx0XHRkdXBsaWNhdGVPZjogZi5kdXBsaWNhdGVPZixcblx0XHRcdH0pKSxcblx0XHRcdHNvdXJjZUZvbGRlcnM6IGluZm8uc291cmNlRm9sZGVycz8ubWFwKHNmID0+ICh7XG5cdFx0XHRcdHVyaTogc2YudXJpLFxuXHRcdFx0XHRzdG9yYWdlOiBzZi5zdG9yYWdlLFxuXHRcdFx0fSkpLFxuXHRcdH07XG5cdH1cbn1cblxuY29uc3QgTUFYX0xJU1RfSVRFTVMgPSAxMDA7XG5cbi8qKlxuICogSm9pbiBhIGxpc3Qgb2Ygc3RyaW5ncywgdHJ1bmNhdGluZyBhZnRlciB7QGxpbmsgTUFYX0xJU1RfSVRFTVN9IGVudHJpZXMuXG4gKiBGdWxsIGRldGFpbHMgYXJlIGF2YWlsYWJsZSB2aWEge0BsaW5rIElDaGF0RGVidWdTZXJ2aWNlLnJlc29sdmVFdmVudH0uXG4gKi9cbmZ1bmN0aW9uIHRydW5jYXRlTGlzdChpdGVtczogc3RyaW5nW10pOiBzdHJpbmcge1xuXHRpZiAoaXRlbXMubGVuZ3RoIDw9IE1BWF9MSVNUX0lURU1TKSB7XG5cdFx0cmV0dXJuIGl0ZW1zLmpvaW4oJywgJyk7XG5cdH1cblxuXHRyZXR1cm4gaXRlbXMuc2xpY2UoMCwgTUFYX0xJU1RfSVRFTVMpLmpvaW4oJywgJykgKyBgICgrJHtpdGVtcy5sZW5ndGggLSBNQVhfTElTVF9JVEVNU30gbW9yZSlgO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVO0FBQ25CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBRTVCLFNBQTBHLHlCQUF5QjtBQUNuSSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUM3QixTQUEyQiw4QkFBOEI7QUFDekQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBeUYsdUJBQXVCO0FBQ2hILFNBQVMsd0NBQXdDO0FBVTFDLElBQU0sMkJBQU4sY0FBdUMsV0FBNkM7QUFBQSxFQWMxRixZQUNtQyxnQkFDZixrQkFDTCxhQUNLLGtCQUNOLFlBQ1o7QUFDRCxV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
