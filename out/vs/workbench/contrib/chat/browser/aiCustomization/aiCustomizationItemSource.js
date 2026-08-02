import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { parse as parseJSONC } from "../../../../../base/common/json.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { OS } from "../../../../../base/common/platform.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { localize } from "../../../../../nls.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { AICustomizationSources } from "../../common/aiCustomizationWorkspaceService.js";
import { parseHooksFromFile } from "../../common/promptSyntax/hookCompatibility.js";
import { formatHookCommandLabel } from "../../common/promptSyntax/hookSchema.js";
import { HOOK_METADATA } from "../../common/promptSyntax/hookTypes.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { sourceToIcon } from "./aiCustomizationIcons.js";
import { BUILTIN_STORAGE } from "./aiCustomizationManagement.js";
function isChatExtensionItem(extensionId, productService) {
  const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
  return !!chatExtensionId && ExtensionIdentifier.equals(extensionId, chatExtensionId);
}
function getFriendlyName(filename) {
  let name = filename.replace(/\.instructions\.md$/i, "").replace(/\.prompt\.md$/i, "").replace(/\.agent\.md$/i, "").replace(/\.md$/i, "");
  name = name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return name || filename;
}
async function expandHookFileItems(hookFileItems, workspaceService, fileService, pathService) {
  const items = [];
  const activeRoot = workspaceService.getActiveProjectRoot();
  const userHomeUri = await pathService.userHome();
  const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
  for (const item of hookFileItems) {
    let parsedHooks = false;
    try {
      const content = await fileService.readFile(item.uri);
      const json = parseJSONC(content.value.toString());
      const { hooks } = parseHooksFromFile(item.uri, json, activeRoot, userHome);
      if (hooks.size > 0) {
        parsedHooks = true;
        for (const [hookType, entry] of hooks) {
          const hookMeta = HOOK_METADATA[hookType];
          for (let i = 0; i < entry.hooks.length; i++) {
            const hook = entry.hooks[i];
            const cmdLabel = formatHookCommandLabel(hook, OS);
            const truncatedCmd = cmdLabel.length > 60 ? cmdLabel.substring(0, 57) + "..." : cmdLabel;
            items.push({
              uri: item.uri,
              type: PromptsType.hook,
              name: hookMeta?.label ?? entry.originalId,
              description: truncatedCmd || localize("hookUnset", "(unset)"),
              enabled: item.enabled,
              groupKey: item.groupKey,
              source: item.source,
              extensionId: item.extensionId,
              pluginUri: item.pluginUri,
              userInvocable: item.userInvocable
            });
          }
        }
      }
    } catch {
    }
    if (!parsedHooks) {
      items.push(item);
    }
  }
  return items;
}
class AICustomizationItemNormalizer {
  constructor(labelService, productService) {
    this.labelService = labelService;
    this.productService = productService;
  }
  normalizeItems(items, promptType) {
    const uriUseCounts = new ResourceMap();
    return items.filter((item) => item.type === promptType).map((item) => this.normalizeItem(item, promptType, uriUseCounts)).sort((a, b) => a.name.localeCompare(b.name));
  }
  normalizeItem(item, promptType, uriUseCounts = new ResourceMap()) {
    const { source, groupKey, isBuiltin, extensionId, pluginUri } = this.inferStorageAndGroup(item);
    const seenCount = uriUseCounts.get(item.uri) ?? 0;
    uriUseCounts.set(item.uri, seenCount + 1);
    const duplicateSuffix = seenCount === 0 ? "" : `#${seenCount}`;
    const isWorkspaceItem = source === AICustomizationSources.local;
    return {
      id: `${item.uri.toString()}${duplicateSuffix}`,
      uri: item.uri,
      name: item.name,
      filename: item.uri.scheme === Schemas.file ? this.labelService.getUriLabel(item.uri, { relative: isWorkspaceItem }) : basename(item.uri),
      description: item.description,
      source,
      promptType,
      disabled: item.enabled === false,
      groupKey,
      pluginUri,
      displayName: item.name,
      badge: item.badge,
      badgeTooltip: item.badgeTooltip,
      typeIcon: promptType === PromptsType.instructions && source ? sourceToIcon(source) : void 0,
      isBuiltin,
      extensionId,
      status: item.status,
      statusMessage: item.statusMessage
    };
  }
  inferStorageAndGroup(item) {
    const groupKey = item.groupKey;
    const hasBuiltinStorage = item.source === AICustomizationSources.builtin;
    const isBuiltin = groupKey === BUILTIN_STORAGE || hasBuiltinStorage;
    if (hasBuiltinStorage) {
      return { source: AICustomizationSources.builtin, groupKey: groupKey ?? BUILTIN_STORAGE, isBuiltin: true, extensionId: item.extensionId };
    }
    if (item.source === AICustomizationSources.plugin) {
      return { source: AICustomizationSources.plugin, pluginUri: item.pluginUri, groupKey, isBuiltin };
    }
    if (item.source === AICustomizationSources.extension) {
      if (item.extensionId) {
        const extensionIdentifier = new ExtensionIdentifier(item.extensionId);
        if (isChatExtensionItem(extensionIdentifier, this.productService)) {
          return { source: AICustomizationSources.extension, groupKey: BUILTIN_STORAGE, isBuiltin: true, extensionId: item.extensionId };
        }
      }
      return { source: AICustomizationSources.extension, extensionId: item.extensionId, groupKey, isBuiltin };
    }
    return { source: item.source, groupKey, isBuiltin, pluginUri: item.pluginUri, extensionId: item.extensionId };
  }
}
class ItemProviderItemSource extends Disposable {
  constructor(sessionResource, itemProvider, promptsService, workspaceService, fileService, pathService, itemNormalizer) {
    super();
    this.sessionResource = sessionResource;
    this.itemProvider = itemProvider;
    this.promptsService = promptsService;
    this.workspaceService = workspaceService;
    this.fileService = fileService;
    this.pathService = pathService;
    this.itemNormalizer = itemNormalizer;
    this.onDidAICustomizationItemsChange = Event.any(
      this.itemProvider.onDidChange,
      this.promptsService.onDidChangeSkills
    );
    this._register(this.onDidAICustomizationItemsChange(() => {
      this.cachedPromise = void 0;
    }));
  }
  dispose() {
    super.dispose();
    this.cachedPromise = void 0;
  }
  async fetchProviderItems() {
    if (!this.cachedPromise) {
      this.cachedPromise = this.itemProvider.provideChatSessionCustomizations(this.sessionResource, CancellationToken.None);
    }
    const cached = this.cachedPromise;
    const allItems = await cached;
    if (cached !== this.cachedPromise || !allItems) {
      return [];
    }
    return allItems;
  }
  async fetchAICustomizationItems(promptType) {
    const allItems = await this.fetchProviderItems();
    let providerItems;
    if (promptType === PromptsType.hook) {
      const hookItems = allItems.filter((item) => item.type === PromptsType.hook);
      const toExpand = hookItems.filter((item) => item.source !== AICustomizationSources.plugin);
      const preExpanded = hookItems.filter((item) => item.source === AICustomizationSources.plugin);
      const expanded = await expandHookFileItems(
        toExpand,
        this.workspaceService,
        this.fileService,
        this.pathService
      );
      providerItems = [...expanded, ...preExpanded];
    } else {
      providerItems = allItems.filter((item) => item.type === promptType);
    }
    if (promptType === PromptsType.skill) {
      providerItems = await this.addSkillDescriptionFallbacks(providerItems);
    }
    const normalized = this.itemNormalizer.normalizeItems(providerItems, promptType);
    if (promptType === PromptsType.skill) {
      return this.mergeBuiltinSkills(normalized, promptType);
    }
    return normalized;
  }
  async fetchSourceFolders(promptType) {
    if (!this.itemProvider.provideSourceFolders) {
      return [];
    }
    return await this.itemProvider.provideSourceFolders(this.sessionResource, promptType, CancellationToken.None) ?? [];
  }
  /**
   * Merges built-in skills (bundled with the app under `vs/sessions/skills/`)
   * into the provider's items. The provider may re-discover the bundled
   * copies when scanning disk — those duplicates are dropped (deduped by
   * URI) and replaced with the authoritative built-in entry tagged
   * `groupKey: BUILTIN_STORAGE` so the UI renders them in the "Built-in"
   * group. User-authored overrides (different URI, same name) are preserved.
   *
   * A workbench that uses the base `PromptsService` contributes no built-in
   * skills, so `builtinPaths` is empty and the items are returned unchanged.
   */
  async mergeBuiltinSkills(items, promptType) {
    const builtinPaths = await this.promptsService.listPromptFilesForStorage(PromptsType.skill, PromptsStorage.builtIn, CancellationToken.None);
    if (builtinPaths.length === 0) {
      return [...items];
    }
    const builtinUris = new ResourceMap();
    for (const p of builtinPaths) {
      builtinUris.set(p.uri, p);
    }
    const deduped = items.filter((item) => !builtinUris.has(item.uri));
    const uiIntegrations = this.workspaceService.getSkillUIIntegrations();
    const uiIntegrationBadge = localize("uiIntegrationBadge", "UI Integration");
    const overriddenNames = /* @__PURE__ */ new Set();
    for (const item of deduped) {
      if (item.source === AICustomizationSources.local || item.source === AICustomizationSources.user) {
        if (item.name) {
          overriddenNames.add(item.name);
        }
      }
    }
    const uriUseCounts = new ResourceMap();
    for (const item of deduped) {
      uriUseCounts.set(item.uri, (uriUseCounts.get(item.uri) ?? 0) + 1);
    }
    const appended = [];
    const disabledPromptFiles = this.promptsService.getDisabledPromptFiles(PromptsType.skill);
    for (const p of builtinPaths) {
      const name = p.name ?? basename(p.uri);
      if (overriddenNames.has(name)) {
        continue;
      }
      const folderName = basename(dirname(p.uri));
      const uiTooltip = uiIntegrations.get(folderName);
      const builtinItem = {
        uri: p.uri,
        type: PromptsType.skill,
        name,
        description: p.description,
        source: AICustomizationSources.builtin,
        groupKey: BUILTIN_STORAGE,
        enabled: !disabledPromptFiles.has(p.uri),
        badge: uiTooltip ? uiIntegrationBadge : void 0,
        badgeTooltip: uiTooltip,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      };
      appended.push(this.itemNormalizer.normalizeItem(builtinItem, promptType, uriUseCounts));
    }
    return [...deduped, ...appended];
  }
  async addSkillDescriptionFallbacks(items) {
    const descriptionsByUri = /* @__PURE__ */ new Map();
    const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
    for (const skill of skills ?? []) {
      if (skill.description) {
        descriptionsByUri.set(skill.uri.toString(), skill.description);
      }
    }
    return items.map((item) => item.description ? item : { ...item, description: descriptionsByUri.get(item.uri.toString()) });
  }
}
class EmptyItemProviderItemSource extends Disposable {
  constructor(sessionResource) {
    super();
    this.sessionResource = sessionResource;
    this.onDidAICustomizationItemsChange = Event.None;
  }
  fetchAICustomizationItems(promptType) {
    return Promise.resolve([]);
  }
  fetchProviderItems() {
    return Promise.resolve([]);
  }
  fetchSourceFolders(_promptType) {
    return Promise.resolve([]);
  }
}
class PureItemProviderItemSource extends Disposable {
  constructor(sessionResource, itemProvider, itemNormalizer) {
    super();
    this.sessionResource = sessionResource;
    this.itemProvider = itemProvider;
    this.itemNormalizer = itemNormalizer;
    this.onDidAICustomizationItemsChange = this.itemProvider.onDidChange;
    this._register(this.itemProvider.onDidChange(() => {
      this.cachedPromise = void 0;
    }));
  }
  async fetchProviderItems() {
    if (!this.cachedPromise) {
      const promise = this.itemProvider.provideChatSessionCustomizations(this.sessionResource, CancellationToken.None);
      this.cachedPromise = promise;
      promise.catch(() => {
        if (this.cachedPromise === promise) {
          this.cachedPromise = void 0;
        }
      });
    }
    const cached = this.cachedPromise;
    const allItems = await cached;
    if (cached !== this.cachedPromise || !allItems) {
      return [];
    }
    return allItems;
  }
  async fetchAICustomizationItems(promptType) {
    const allItems = await this.fetchProviderItems();
    return this.itemNormalizer.normalizeItems(allItems, promptType);
  }
  async fetchSourceFolders(promptType) {
    if (!this.itemProvider.provideSourceFolders) {
      return [];
    }
    return await this.itemProvider.provideSourceFolders(this.sessionResource, promptType, CancellationToken.None) ?? [];
  }
}
export {
  AICustomizationItemNormalizer,
  EmptyItemProviderItemSource,
  ItemProviderItemSource,
  PureItemProviderItemSource,
  expandHookFileItems,
  getFriendlyName,
  isChatExtensionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uSXRlbVNvdXJjZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZUpTT05DIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uU291cmNlcywgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkl0ZW0sIElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLCBJQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgcGFyc2VIb29rc0Zyb21GaWxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rQ29tcGF0aWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBmb3JtYXRIb29rQ29tbWFuZExhYmVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IEhPT0tfTUVUQURBVEEgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzb3VyY2VUb0ljb24gfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbkljb25zLmpzJztcbmltcG9ydCB7IHR5cGUgQUlDdXN0b21pemF0aW9uU291cmNlLCBCVUlMVElOX1NUT1JBR0UgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuanMnO1xuXG4vLyAjcmVnaW9uIEludGVyZmFjZXNcblxuLyoqXG4gKiBSZXByZXNlbnRzIGFuIEFJIGN1c3RvbWl6YXRpb24gaXRlbSBpbiB0aGUgbGlzdCB3aWRnZXQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZmlsZW5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdC8qKiBTdG9yYWdlIG9yIHByb3ZpZGVyIG9yaWdpbi4gQWxsIGl0ZW1zLCBpbmNsdWRpbmcgdGhvc2UgZnJvbSBleHRlcm5hbCBwcm92aWRlcnMsIG11c3QgcHJvdmlkZSBhIHNvdXJjZS4gKi9cblx0cmVhZG9ubHkgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2U7XG5cdHJlYWRvbmx5IHByb21wdFR5cGU6IFByb21wdHNUeXBlO1xuXHRyZWFkb25seSBkaXNhYmxlZDogYm9vbGVhbjtcblx0LyoqIFdoZW4gc2V0LCBvdmVycmlkZXMgYHNvdXJjZWAgZm9yIGRpc3BsYXkgZ3JvdXBpbmcgcHVycG9zZXMuICovXG5cdHJlYWRvbmx5IGdyb3VwS2V5Pzogc3RyaW5nO1xuXHQvKiogVVJJIG9mIHRoZSBwYXJlbnQgcGx1Z2luLCB3aGVuIHRoaXMgaXRlbSBjb21lcyBmcm9tIGFuIGluc3RhbGxlZCBwbHVnaW4uICovXG5cdHJlYWRvbmx5IHBsdWdpblVyaT86IFVSSTtcblx0LyoqIFdoZW4gc2V0LCBvdmVycmlkZXMgdGhlIGZvcm1hdHRlZCBuYW1lIGZvciBkaXNwbGF5LiAqL1xuXHRyZWFkb25seSBkaXNwbGF5TmFtZT86IHN0cmluZztcblx0LyoqIFdoZW4gc2V0LCBzaG93cyBhIHNtYWxsIGlubGluZSBiYWRnZSBuZXh0IHRvIHRoZSBpdGVtIG5hbWUuICovXG5cdHJlYWRvbmx5IGJhZGdlPzogc3RyaW5nO1xuXHQvKiogVG9vbHRpcCBzaG93biB3aGVuIGhvdmVyaW5nIHRoZSBiYWRnZS4gKi9cblx0cmVhZG9ubHkgYmFkZ2VUb29sdGlwPzogc3RyaW5nO1xuXHQvKiogV2hlbiBzZXQsIG92ZXJyaWRlcyB0aGUgZGVmYXVsdCBwcm9tcHQtdHlwZSBpY29uLiAqL1xuXHRyZWFkb25seSB0eXBlSWNvbj86IFRoZW1lSWNvbjtcblx0LyoqIFRydWUgd2hlbiBpdGVtIGNvbWVzIGZyb20gdGhlIGRlZmF1bHQgY2hhdCBleHRlbnNpb24gKGdyb3VwZWQgdW5kZXIgQnVpbHQtaW4pLiAqL1xuXHRyZWFkb25seSBpc0J1aWx0aW4/OiBib29sZWFuO1xuXHQvKiogRGlzcGxheSBuYW1lIG9mIHRoZSBjb250cmlidXRpbmcgZXh0ZW5zaW9uIChmb3Igbm9uLWJ1aWx0LWluIGV4dGVuc2lvbiBpdGVtcykuICovXG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkPzogc3RyaW5nO1xuXHQvKiogU2VydmVyLXJlcG9ydGVkIGxvYWRpbmcvc3luYyBzdGF0dXMgZm9yIHJlbW90ZSBjdXN0b21pemF0aW9ucy4gKi9cblx0cmVhZG9ubHkgc3RhdHVzPzogJ2xvYWRpbmcnIHwgJ2xvYWRlZCcgfCAnZGVncmFkZWQnIHwgJ2Vycm9yJztcblx0LyoqIEh1bWFuLXJlYWRhYmxlIHN0YXR1cyBkZXRhaWwgKGUuZy4gZXJyb3IgbWVzc2FnZSBvciB3YXJuaW5nKS4gKi9cblx0cmVhZG9ubHkgc3RhdHVzTWVzc2FnZT86IHN0cmluZztcblx0LyoqIFdoZW4gdHJ1ZSwgdGhpcyBpdGVtIGNhbiBiZSBzZWxlY3RlZCBmb3Igc3luY2luZyB0byBhIHJlbW90ZSBoYXJuZXNzLiAqL1xuXHRyZWFkb25seSBzeW5jYWJsZT86IGJvb2xlYW47XG5cdC8qKiBXaGVuIHRydWUsIHRoaXMgc3luY2FibGUgaXRlbSBpcyBjdXJyZW50bHkgc2VsZWN0ZWQgZm9yIHN5bmNpbmcuICovXG5cdHJlYWRvbmx5IHN5bmNlZD86IGJvb2xlYW47XG5cdG5hbWVNYXRjaGVzPzogSU1hdGNoW107XG5cdGRlc2NyaXB0aW9uTWF0Y2hlcz86IElNYXRjaFtdO1xufVxuXG4vKipcbiAqIEJyb3dzZXItaW50ZXJuYWwgaXRlbSBzb3VyY2UgY29uc3VtZWQgYnkgdGhlIGxpc3Qgd2lkZ2V0LlxuICpcbiAqIEl0ZW0gc291cmNlcyBmZXRjaCBwcm92aWRlci1zaGFwZWQgY3VzdG9taXphdGlvbiByb3dzLCBub3JtYWxpemUgdGhlbSBpbnRvXG4gKiB0aGUgYnJvd3Nlci1vbmx5IGxpc3QgaXRlbSBzaGFwZSwgYW5kIGFkZCB2aWV3LW9ubHkgb3ZlcmxheXMgc3VjaCBhcyBzeW5jIHN0YXRlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBSUN1c3RvbWl6YXRpb25JdGVtU291cmNlIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgb25EaWRBSUN1c3RvbWl6YXRpb25JdGVtc0NoYW5nZTogRXZlbnQ8dm9pZD47XG5cdGZldGNoUHJvdmlkZXJJdGVtcygpOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdPjtcblx0ZmV0Y2hBSUN1c3RvbWl6YXRpb25JdGVtcyhwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8SUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10+O1xuXHRmZXRjaFNvdXJjZUZvbGRlcnMocHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyW10+O1xufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gVXRpbGl0aWVzXG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBnaXZlbiBleHRlbnNpb24gaWRlbnRpZmllciBtYXRjaGVzIHRoZSBkZWZhdWx0XG4gKiBjaGF0IGV4dGVuc2lvbiAoZS5nLiBHaXRIdWIgQ29waWxvdCBDaGF0KS4gVXNlZCB0byBncm91cCBpdGVtcyBmcm9tXG4gKiB0aGUgY2hhdCBleHRlbnNpb24gdW5kZXIgXCJCdWlsdC1pblwiIGluc3RlYWQgb2YgXCJFeHRlbnNpb25zXCIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRFeHRlbnNpb25JdGVtKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdGNvbnN0IGNoYXRFeHRlbnNpb25JZCA9IHByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZDtcblx0cmV0dXJuICEhY2hhdEV4dGVuc2lvbklkICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbklkLCBjaGF0RXh0ZW5zaW9uSWQpO1xufVxuXG4vKipcbiAqIERlcml2ZXMgYSBmcmllbmRseSBuYW1lIGZyb20gYSBmaWxlbmFtZSBieSByZW1vdmluZyBleHRlbnNpb24gc3VmZml4ZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRGcmllbmRseU5hbWUoZmlsZW5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBuYW1lID0gZmlsZW5hbWVcblx0XHQucmVwbGFjZSgvXFwuaW5zdHJ1Y3Rpb25zXFwubWQkL2ksICcnKVxuXHRcdC5yZXBsYWNlKC9cXC5wcm9tcHRcXC5tZCQvaSwgJycpXG5cdFx0LnJlcGxhY2UoL1xcLmFnZW50XFwubWQkL2ksICcnKVxuXHRcdC5yZXBsYWNlKC9cXC5tZCQvaSwgJycpO1xuXG5cdG5hbWUgPSBuYW1lXG5cdFx0LnJlcGxhY2UoL1stX10vZywgJyAnKVxuXHRcdC5yZXBsYWNlKC9cXGJcXHcvZywgYyA9PiBjLnRvVXBwZXJDYXNlKCkpO1xuXG5cdHJldHVybiBuYW1lIHx8IGZpbGVuYW1lO1xufVxuXG4vKipcbiAqIEV4cGFuZHMgaG9vayBmaWxlIGl0ZW1zIGludG8gaW5kaXZpZHVhbCBob29rIGVudHJpZXMgYnkgcGFyc2luZyBob29rXG4gKiBkZWZpbml0aW9ucyBmcm9tIHRoZSBmaWxlIGNvbnRlbnQuIEZhbGxzIGJhY2sgdG8gdGhlIG9yaWdpbmFsIGl0ZW1cbiAqIHdoZW4gcGFyc2luZyBmYWlscy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4cGFuZEhvb2tGaWxlSXRlbXMoXG5cdGhvb2tGaWxlSXRlbXM6IHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdLFxuXHR3b3Jrc3BhY2VTZXJ2aWNlOiBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0cGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcbik6IFByb21pc2U8SUN1c3RvbWl6YXRpb25JdGVtW10+IHtcblx0Y29uc3QgaXRlbXM6IElDdXN0b21pemF0aW9uSXRlbVtdID0gW107XG5cdGNvbnN0IGFjdGl2ZVJvb3QgPSB3b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCk7XG5cdGNvbnN0IHVzZXJIb21lVXJpID0gYXdhaXQgcGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0Y29uc3QgdXNlckhvbWUgPSB1c2VySG9tZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHVzZXJIb21lVXJpLmZzUGF0aCA6IHVzZXJIb21lVXJpLnBhdGg7XG5cblx0Zm9yIChjb25zdCBpdGVtIG9mIGhvb2tGaWxlSXRlbXMpIHtcblx0XHRsZXQgcGFyc2VkSG9va3MgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKGl0ZW0udXJpKTtcblx0XHRcdGNvbnN0IGpzb24gPSBwYXJzZUpTT05DKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCB7IGhvb2tzIH0gPSBwYXJzZUhvb2tzRnJvbUZpbGUoaXRlbS51cmksIGpzb24sIGFjdGl2ZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0aWYgKGhvb2tzLnNpemUgPiAwKSB7XG5cdFx0XHRcdHBhcnNlZEhvb2tzID0gdHJ1ZTtcblx0XHRcdFx0Zm9yIChjb25zdCBbaG9va1R5cGUsIGVudHJ5XSBvZiBob29rcykge1xuXHRcdFx0XHRcdGNvbnN0IGhvb2tNZXRhID0gSE9PS19NRVRBREFUQVtob29rVHlwZV07XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbnRyeS5ob29rcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgaG9vayA9IGVudHJ5Lmhvb2tzW2ldO1xuXHRcdFx0XHRcdFx0Y29uc3QgY21kTGFiZWwgPSBmb3JtYXRIb29rQ29tbWFuZExhYmVsKGhvb2ssIE9TKTtcblx0XHRcdFx0XHRcdGNvbnN0IHRydW5jYXRlZENtZCA9IGNtZExhYmVsLmxlbmd0aCA+IDYwID8gY21kTGFiZWwuc3Vic3RyaW5nKDAsIDU3KSArICcuLi4nIDogY21kTGFiZWw7XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dXJpOiBpdGVtLnVyaSxcblx0XHRcdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaG9vayxcblx0XHRcdFx0XHRcdFx0bmFtZTogaG9va01ldGE/LmxhYmVsID8/IGVudHJ5Lm9yaWdpbmFsSWQsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0cnVuY2F0ZWRDbWQgfHwgbG9jYWxpemUoJ2hvb2tVbnNldCcsIFwiKHVuc2V0KVwiKSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogaXRlbS5lbmFibGVkLFxuXHRcdFx0XHRcdFx0XHRncm91cEtleTogaXRlbS5ncm91cEtleSxcblx0XHRcdFx0XHRcdFx0c291cmNlOiBpdGVtLnNvdXJjZSxcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGl0ZW0uZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdFx0XHRcdHBsdWdpblVyaTogaXRlbS5wbHVnaW5VcmksXG5cdFx0XHRcdFx0XHRcdHVzZXJJbnZvY2FibGU6IGl0ZW0udXNlckludm9jYWJsZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gUGFyc2UgZmFpbGVkIFx1MjAxNCBmYWxsIHRocm91Z2ggdG8gc2hvdyByYXcgZmlsZS5cblx0XHR9XG5cblx0XHRpZiAoIXBhcnNlZEhvb2tzKSB7XG5cdFx0XHRpdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBpdGVtcztcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIE5vcm1hbGl6ZXJcblxuLyoqXG4gKiBDb252ZXJ0cyBwcm92aWRlci1zaGFwZWQgY3VzdG9taXphdGlvbiByb3dzIGludG8gdGhlIHJpY2ggbGlzdCBtb2RlbCB1c2VkIGJ5IHRoZSBtYW5hZ2VtZW50IFVJLlxuICovXG5leHBvcnQgY2xhc3MgQUlDdXN0b21pemF0aW9uSXRlbU5vcm1hbGl6ZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0bm9ybWFsaXplSXRlbXMoaXRlbXM6IHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSk6IElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbVtdIHtcblx0XHRjb25zdCB1cmlVc2VDb3VudHMgPSBuZXcgUmVzb3VyY2VNYXA8bnVtYmVyPigpO1xuXHRcdHJldHVybiBpdGVtc1xuXHRcdFx0LmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSA9PT0gcHJvbXB0VHlwZSlcblx0XHRcdC5tYXAoaXRlbSA9PiB0aGlzLm5vcm1hbGl6ZUl0ZW0oaXRlbSwgcHJvbXB0VHlwZSwgdXJpVXNlQ291bnRzKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKTtcblx0fVxuXG5cdG5vcm1hbGl6ZUl0ZW0oaXRlbTogSUN1c3RvbWl6YXRpb25JdGVtLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgdXJpVXNlQ291bnRzID0gbmV3IFJlc291cmNlTWFwPG51bWJlcj4oKSk6IElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbSB7XG5cdFx0Y29uc3QgeyBzb3VyY2UsIGdyb3VwS2V5LCBpc0J1aWx0aW4sIGV4dGVuc2lvbklkLCBwbHVnaW5VcmkgfSA9IHRoaXMuaW5mZXJTdG9yYWdlQW5kR3JvdXAoaXRlbSk7XG5cdFx0Y29uc3Qgc2VlbkNvdW50ID0gdXJpVXNlQ291bnRzLmdldChpdGVtLnVyaSkgPz8gMDtcblx0XHR1cmlVc2VDb3VudHMuc2V0KGl0ZW0udXJpLCBzZWVuQ291bnQgKyAxKTtcblx0XHRjb25zdCBkdXBsaWNhdGVTdWZmaXggPSBzZWVuQ291bnQgPT09IDAgPyAnJyA6IGAjJHtzZWVuQ291bnR9YDtcblx0XHRjb25zdCBpc1dvcmtzcGFjZUl0ZW0gPSBzb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWw7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGAke2l0ZW0udXJpLnRvU3RyaW5nKCl9JHtkdXBsaWNhdGVTdWZmaXh9YCxcblx0XHRcdHVyaTogaXRlbS51cmksXG5cdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRmaWxlbmFtZTogaXRlbS51cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGVcblx0XHRcdFx0PyB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChpdGVtLnVyaSwgeyByZWxhdGl2ZTogaXNXb3Jrc3BhY2VJdGVtIH0pXG5cdFx0XHRcdDogYmFzZW5hbWUoaXRlbS51cmkpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRzb3VyY2UsXG5cdFx0XHRwcm9tcHRUeXBlLFxuXHRcdFx0ZGlzYWJsZWQ6IGl0ZW0uZW5hYmxlZCA9PT0gZmFsc2UsXG5cdFx0XHRncm91cEtleSxcblx0XHRcdHBsdWdpblVyaSxcblx0XHRcdGRpc3BsYXlOYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRiYWRnZTogaXRlbS5iYWRnZSxcblx0XHRcdGJhZGdlVG9vbHRpcDogaXRlbS5iYWRnZVRvb2x0aXAsXG5cdFx0XHR0eXBlSWNvbjogcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zICYmIHNvdXJjZSA/IHNvdXJjZVRvSWNvbihzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0aXNCdWlsdGluLFxuXHRcdFx0ZXh0ZW5zaW9uSWQsXG5cdFx0XHRzdGF0dXM6IGl0ZW0uc3RhdHVzLFxuXHRcdFx0c3RhdHVzTWVzc2FnZTogaXRlbS5zdGF0dXNNZXNzYWdlLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGluZmVyU3RvcmFnZUFuZEdyb3VwKGl0ZW06IElDdXN0b21pemF0aW9uSXRlbSk6IHsgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2U7IGdyb3VwS2V5Pzogc3RyaW5nOyBpc0J1aWx0aW4/OiBib29sZWFuOyBleHRlbnNpb25JZD86IHN0cmluZzsgcGx1Z2luVXJpPzogVVJJIH0ge1xuXHRcdGNvbnN0IGdyb3VwS2V5ID0gaXRlbS5ncm91cEtleTtcblx0XHRjb25zdCBoYXNCdWlsdGluU3RvcmFnZSA9IGl0ZW0uc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW47XG5cdFx0Y29uc3QgaXNCdWlsdGluID0gZ3JvdXBLZXkgPT09IEJVSUxUSU5fU1RPUkFHRSB8fCBoYXNCdWlsdGluU3RvcmFnZTtcblxuXHRcdGlmIChoYXNCdWlsdGluU3RvcmFnZSkge1xuXHRcdFx0cmV0dXJuIHsgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4sIGdyb3VwS2V5OiBncm91cEtleSA/PyBCVUlMVElOX1NUT1JBR0UsIGlzQnVpbHRpbjogdHJ1ZSwgZXh0ZW5zaW9uSWQ6IGl0ZW0uZXh0ZW5zaW9uSWQgfTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0uc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbikge1xuXHRcdFx0cmV0dXJuIHsgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgcGx1Z2luVXJpOiBpdGVtLnBsdWdpblVyaSwgZ3JvdXBLZXksIGlzQnVpbHRpbiB9O1xuXHRcdH1cblx0XHRpZiAoaXRlbS5zb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRpZiAoaXRlbS5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25JZGVudGlmaWVyID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoaXRlbS5leHRlbnNpb25JZCk7XG5cdFx0XHRcdGlmIChpc0NoYXRFeHRlbnNpb25JdGVtKGV4dGVuc2lvbklkZW50aWZpZXIsIHRoaXMucHJvZHVjdFNlcnZpY2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmV4dGVuc2lvbiwgZ3JvdXBLZXk6IEJVSUxUSU5fU1RPUkFHRSwgaXNCdWlsdGluOiB0cnVlLCBleHRlbnNpb25JZDogaXRlbS5leHRlbnNpb25JZCB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuZXh0ZW5zaW9uLCBleHRlbnNpb25JZDogaXRlbS5leHRlbnNpb25JZCwgZ3JvdXBLZXksIGlzQnVpbHRpbiB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBzb3VyY2U6IGl0ZW0uc291cmNlLCBncm91cEtleSwgaXNCdWlsdGluLCBwbHVnaW5Vcmk6IGl0ZW0ucGx1Z2luVXJpLCBleHRlbnNpb25JZDogaXRlbS5leHRlbnNpb25JZCB9O1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLyoqXG4gKiBJdGVtIHNvdXJjZSBiYWNrZWQgYnkgYSBzZXNzaW9uLXNjb3BlZCBjdXN0b21pemF0aW9uIGl0ZW0gcHJvdmlkZXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBJdGVtUHJvdmlkZXJJdGVtU291cmNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBSUN1c3RvbWl6YXRpb25JdGVtU291cmNlIHtcblxuXHRyZWFkb25seSBvbkRpZEFJQ3VzdG9taXphdGlvbkl0ZW1zQ2hhbmdlOiBFdmVudDx2b2lkPjtcblx0cHJpdmF0ZSBjYWNoZWRQcm9taXNlOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1Qcm92aWRlcjogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1Ob3JtYWxpemVyOiBBSUN1c3RvbWl6YXRpb25JdGVtTm9ybWFsaXplcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9uRGlkQUlDdXN0b21pemF0aW9uSXRlbXNDaGFuZ2UgPSBFdmVudC5hbnkoXG5cdFx0XHR0aGlzLml0ZW1Qcm92aWRlci5vbkRpZENoYW5nZSxcblx0XHRcdHRoaXMucHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VTa2lsbHNcblx0XHQpO1xuXG5cdFx0Ly8gSW52YWxpZGF0ZSBjYWNoZSB3aGVuIHByb3ZpZGVyIG9yIHNraWxscyBjaGFuZ2Vcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQUlDdXN0b21pemF0aW9uSXRlbXNDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5jYWNoZWRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuY2FjaGVkUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGZldGNoUHJvdmlkZXJJdGVtcygpOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdPiB7XG5cdFx0aWYgKCF0aGlzLmNhY2hlZFByb21pc2UpIHtcblx0XHRcdHRoaXMuY2FjaGVkUHJvbWlzZSA9IHRoaXMuaXRlbVByb3ZpZGVyLnByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHRoaXMuc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jYWNoZWRQcm9taXNlO1xuXHRcdGNvbnN0IGFsbEl0ZW1zID0gYXdhaXQgY2FjaGVkO1xuXHRcdGlmIChjYWNoZWQgIT09IHRoaXMuY2FjaGVkUHJvbWlzZSB8fCAhYWxsSXRlbXMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbEl0ZW1zO1xuXHR9XG5cblx0YXN5bmMgZmV0Y2hBSUN1c3RvbWl6YXRpb25JdGVtcyhwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8SUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10+IHtcblx0XHRjb25zdCBhbGxJdGVtcyA9IGF3YWl0IHRoaXMuZmV0Y2hQcm92aWRlckl0ZW1zKCk7XG5cblx0XHRsZXQgcHJvdmlkZXJJdGVtczogcmVhZG9ubHkgSUN1c3RvbWl6YXRpb25JdGVtW107XG5cdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmhvb2spIHtcblx0XHRcdGNvbnN0IGhvb2tJdGVtcyA9IGFsbEl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSA9PT0gUHJvbXB0c1R5cGUuaG9vayk7XG5cdFx0XHQvLyBQbHVnaW4gaG9va3MgYXJlIHByZS1leHBhbmRlZCBieSBwbHVnaW4gbWFuaWZlc3RzIFx1MjAxNCBza2lwIHJlLWV4cGFuc2lvbi5cblx0XHRcdGNvbnN0IHRvRXhwYW5kID0gaG9va0l0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0uc291cmNlICE9PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbik7XG5cdFx0XHRjb25zdCBwcmVFeHBhbmRlZCA9IGhvb2tJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4pO1xuXHRcdFx0Y29uc3QgZXhwYW5kZWQgPSBhd2FpdCBleHBhbmRIb29rRmlsZUl0ZW1zKFxuXHRcdFx0XHR0b0V4cGFuZCwgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnBhdGhTZXJ2aWNlLFxuXHRcdFx0KTtcblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbLi4uZXhwYW5kZWQsIC4uLnByZUV4cGFuZGVkXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvdmlkZXJJdGVtcyA9IGFsbEl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0udHlwZSA9PT0gcHJvbXB0VHlwZSk7XG5cdFx0fVxuXG5cdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHRwcm92aWRlckl0ZW1zID0gYXdhaXQgdGhpcy5hZGRTa2lsbERlc2NyaXB0aW9uRmFsbGJhY2tzKHByb3ZpZGVySXRlbXMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vcm1hbGl6ZWQgPSB0aGlzLml0ZW1Ob3JtYWxpemVyLm5vcm1hbGl6ZUl0ZW1zKHByb3ZpZGVySXRlbXMsIHByb21wdFR5cGUpO1xuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMubWVyZ2VCdWlsdGluU2tpbGxzKG5vcm1hbGl6ZWQsIHByb21wdFR5cGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9ybWFsaXplZDtcblx0fVxuXG5cdGFzeW5jIGZldGNoU291cmNlRm9sZGVycyhwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8cmVhZG9ubHkgSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXJbXT4ge1xuXHRcdGlmICghdGhpcy5pdGVtUHJvdmlkZXIucHJvdmlkZVNvdXJjZUZvbGRlcnMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuaXRlbVByb3ZpZGVyLnByb3ZpZGVTb3VyY2VGb2xkZXJzKHRoaXMuc2Vzc2lvblJlc291cmNlLCBwcm9tcHRUeXBlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkgPz8gW107XG5cdH1cblxuXHQvKipcblx0ICogTWVyZ2VzIGJ1aWx0LWluIHNraWxscyAoYnVuZGxlZCB3aXRoIHRoZSBhcHAgdW5kZXIgYHZzL3Nlc3Npb25zL3NraWxscy9gKVxuXHQgKiBpbnRvIHRoZSBwcm92aWRlcidzIGl0ZW1zLiBUaGUgcHJvdmlkZXIgbWF5IHJlLWRpc2NvdmVyIHRoZSBidW5kbGVkXG5cdCAqIGNvcGllcyB3aGVuIHNjYW5uaW5nIGRpc2sgXHUyMDE0IHRob3NlIGR1cGxpY2F0ZXMgYXJlIGRyb3BwZWQgKGRlZHVwZWQgYnlcblx0ICogVVJJKSBhbmQgcmVwbGFjZWQgd2l0aCB0aGUgYXV0aG9yaXRhdGl2ZSBidWlsdC1pbiBlbnRyeSB0YWdnZWRcblx0ICogYGdyb3VwS2V5OiBCVUlMVElOX1NUT1JBR0VgIHNvIHRoZSBVSSByZW5kZXJzIHRoZW0gaW4gdGhlIFwiQnVpbHQtaW5cIlxuXHQgKiBncm91cC4gVXNlci1hdXRob3JlZCBvdmVycmlkZXMgKGRpZmZlcmVudCBVUkksIHNhbWUgbmFtZSkgYXJlIHByZXNlcnZlZC5cblx0ICpcblx0ICogQSB3b3JrYmVuY2ggdGhhdCB1c2VzIHRoZSBiYXNlIGBQcm9tcHRzU2VydmljZWAgY29udHJpYnV0ZXMgbm8gYnVpbHQtaW5cblx0ICogc2tpbGxzLCBzbyBgYnVpbHRpblBhdGhzYCBpcyBlbXB0eSBhbmQgdGhlIGl0ZW1zIGFyZSByZXR1cm5lZCB1bmNoYW5nZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIG1lcmdlQnVpbHRpblNraWxscyhpdGVtczogcmVhZG9ubHkgSUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10sIHByb21wdFR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxJQUlDdXN0b21pemF0aW9uTGlzdEl0ZW1bXT4ge1xuXHRcdGNvbnN0IGJ1aWx0aW5QYXRoczogcmVhZG9ubHkgeyB1cmk6IFVSSTsgbmFtZT86IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfVtdID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKFByb21wdHNUeXBlLnNraWxsLCBQcm9tcHRzU3RvcmFnZS5idWlsdEluLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoYnVpbHRpblBhdGhzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFsuLi5pdGVtc107XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVpbHRpblVyaXMgPSBuZXcgUmVzb3VyY2VNYXA8dHlwZW9mIGJ1aWx0aW5QYXRoc1tudW1iZXJdPigpO1xuXHRcdGZvciAoY29uc3QgcCBvZiBidWlsdGluUGF0aHMpIHtcblx0XHRcdGJ1aWx0aW5VcmlzLnNldChwLnVyaSwgcCk7XG5cdFx0fVxuXG5cdFx0Ly8gRHJvcCBwcm92aWRlciBpdGVtcyB0aGF0IGFyZSB0aGUgc2FtZSBVUkkgYXMgYSBidWlsdC1pbiAodGhlIHByb3ZpZGVyXG5cdFx0Ly8gcmUtZGlzY292ZXJlZCB0aGUgYnVuZGxlZCBjb3B5IGJ5IHNjYW5uaW5nIGRpc2spLlxuXHRcdGNvbnN0IGRlZHVwZWQgPSBpdGVtcy5maWx0ZXIoaXRlbSA9PiAhYnVpbHRpblVyaXMuaGFzKGl0ZW0udXJpKSk7XG5cblx0XHRjb25zdCB1aUludGVncmF0aW9ucyA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRTa2lsbFVJSW50ZWdyYXRpb25zKCk7XG5cdFx0Y29uc3QgdWlJbnRlZ3JhdGlvbkJhZGdlID0gbG9jYWxpemUoJ3VpSW50ZWdyYXRpb25CYWRnZScsIFwiVUkgSW50ZWdyYXRpb25cIik7XG5cblx0XHQvLyBDb2xsZWN0IG5hbWVzIG9mIHVzZXIvd29ya3NwYWNlIHNraWxscyBzbyB3ZSBjYW4gaGlkZSB0aGUgYnVpbHQtaW5cblx0XHQvLyBjb3B5IG9uY2UgdGhlIHVzZXIgaGFzIGFkZGVkIGFuIG92ZXJyaWRlIGF0IGVpdGhlciBsZXZlbC5cblx0XHRjb25zdCBvdmVycmlkZGVuTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZGVkdXBlZCkge1xuXHRcdFx0aWYgKGl0ZW0uc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmxvY2FsIHx8IGl0ZW0uc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXIpIHtcblx0XHRcdFx0aWYgKGl0ZW0ubmFtZSkge1xuXHRcdFx0XHRcdG92ZXJyaWRkZW5OYW1lcy5hZGQoaXRlbS5uYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFwcGVuZCBhdXRob3JpdGF0aXZlIGJ1aWx0LWluIGVudHJpZXMgKGV4Y2x1ZGluZyBhbnkgdGhhdCBoYXZlIGJlZW5cblx0XHQvLyBvdmVycmlkZGVuIGJ5IGEgd29ya3NwYWNlIG9yIHVzZXIgY29weSB3aXRoIHRoZSBzYW1lIG5hbWUpLlxuXHRcdGNvbnN0IHVyaVVzZUNvdW50cyA9IG5ldyBSZXNvdXJjZU1hcDxudW1iZXI+KCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGRlZHVwZWQpIHtcblx0XHRcdHVyaVVzZUNvdW50cy5zZXQoaXRlbS51cmksICh1cmlVc2VDb3VudHMuZ2V0KGl0ZW0udXJpKSA/PyAwKSArIDEpO1xuXHRcdH1cblx0XHRjb25zdCBhcHBlbmRlZDogSUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10gPSBbXTtcblx0XHRjb25zdCBkaXNhYmxlZFByb21wdEZpbGVzID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXREaXNhYmxlZFByb21wdEZpbGVzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRmb3IgKGNvbnN0IHAgb2YgYnVpbHRpblBhdGhzKSB7XG5cdFx0XHRjb25zdCBuYW1lID0gcC5uYW1lID8/IGJhc2VuYW1lKHAudXJpKTtcblx0XHRcdGlmIChvdmVycmlkZGVuTmFtZXMuaGFzKG5hbWUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9sZGVyTmFtZSA9IGJhc2VuYW1lKGRpcm5hbWUocC51cmkpKTtcblx0XHRcdGNvbnN0IHVpVG9vbHRpcCA9IHVpSW50ZWdyYXRpb25zLmdldChmb2xkZXJOYW1lKTtcblx0XHRcdGNvbnN0IGJ1aWx0aW5JdGVtOiBJQ3VzdG9taXphdGlvbkl0ZW0gPSB7XG5cdFx0XHRcdHVyaTogcC51cmksXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogcC5kZXNjcmlwdGlvbixcblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4sXG5cdFx0XHRcdGdyb3VwS2V5OiBCVUlMVElOX1NUT1JBR0UsXG5cdFx0XHRcdGVuYWJsZWQ6ICFkaXNhYmxlZFByb21wdEZpbGVzLmhhcyhwLnVyaSksXG5cdFx0XHRcdGJhZGdlOiB1aVRvb2x0aXAgPyB1aUludGVncmF0aW9uQmFkZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGJhZGdlVG9vbHRpcDogdWlUb29sdGlwLFxuXHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlckludm9jYWJsZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0XHRhcHBlbmRlZC5wdXNoKHRoaXMuaXRlbU5vcm1hbGl6ZXIubm9ybWFsaXplSXRlbShidWlsdGluSXRlbSwgcHJvbXB0VHlwZSwgdXJpVXNlQ291bnRzKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5kZWR1cGVkLCAuLi5hcHBlbmRlZF07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZFNraWxsRGVzY3JpcHRpb25GYWxsYmFja3MoaXRlbXM6IHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uc0J5VXJpID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRjb25zdCBza2lsbHMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRmb3IgKGNvbnN0IHNraWxsIG9mIHNraWxscyA/PyBbXSkge1xuXHRcdFx0aWYgKHNraWxsLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uc0J5VXJpLnNldChza2lsbC51cmkudG9TdHJpbmcoKSwgc2tpbGwuZGVzY3JpcHRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmRlc2NyaXB0aW9uID8gaXRlbSA6IHsgLi4uaXRlbSwgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uc0J5VXJpLmdldChpdGVtLnVyaS50b1N0cmluZygpKSB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW1wdHlJdGVtUHJvdmlkZXJJdGVtU291cmNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBSUN1c3RvbWl6YXRpb25JdGVtU291cmNlIHtcblxuXHRyZWFkb25seSBvbkRpZEFJQ3VzdG9taXphdGlvbkl0ZW1zQ2hhbmdlID0gRXZlbnQuTm9uZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGZldGNoQUlDdXN0b21pemF0aW9uSXRlbXMocHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbVtdPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdH1cblxuXHRmZXRjaFByb3ZpZGVySXRlbXMoKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHR9XG5cblx0ZmV0Y2hTb3VyY2VGb2xkZXJzKF9wcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8cmVhZG9ubHkgSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXJbXT4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBQdXJlSXRlbVByb3ZpZGVySXRlbVNvdXJjZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQUlDdXN0b21pemF0aW9uSXRlbVNvdXJjZSB7XG5cblx0cmVhZG9ubHkgb25EaWRBSUN1c3RvbWl6YXRpb25JdGVtc0NoYW5nZTogRXZlbnQ8dm9pZD47XG5cdC8vIENhY2hlcyB0aGUgcmF3LCB1bmZpbHRlcmVkIGl0ZW1zIHJldHVybmVkIGJ5IHRoZSBwcm92aWRlciBzbyBlYWNoXG5cdC8vIGBmZXRjaEFJQ3VzdG9taXphdGlvbkl0ZW1zYCBjYWxsIGNhbiBhcHBseSBpdHMgb3duIGBwcm9tcHRUeXBlYCBmaWx0ZXIuXG5cdC8vIFByZXZpb3VzbHkgdGhlIGNhY2hlIHN0b3JlZCBpdGVtcyBhbHJlYWR5IGZpbHRlcmVkL25vcm1hbGl6ZWQgZm9yIHRoZVxuXHQvLyBmaXJzdCByZXF1ZXN0ZWQgYHByb21wdFR5cGVgLCB3aGljaCBjYXVzZWQgZXZlcnkgc3Vic2VxdWVudCBzZWN0aW9uXG5cdC8vIChJbnN0cnVjdGlvbnMsIFNraWxscywgXHUyMDI2KSB0byBzZWUgYW4gZW1wdHkgbGlzdCB3aGVuZXZlciB0aGUgQWdlbnRzIHRhYlxuXHQvLyB3YXMgbG9hZGVkIGZpcnN0LlxuXHRwcml2YXRlIGNhY2hlZFByb21pc2U6IFByb21pc2U8cmVhZG9ubHkgSUN1c3RvbWl6YXRpb25JdGVtW10gfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXRlbVByb3ZpZGVyOiBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1Ob3JtYWxpemVyOiBBSUN1c3RvbWl6YXRpb25JdGVtTm9ybWFsaXplcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9uRGlkQUlDdXN0b21pemF0aW9uSXRlbXNDaGFuZ2UgPSB0aGlzLml0ZW1Qcm92aWRlci5vbkRpZENoYW5nZTtcblxuXHRcdC8vIEludmFsaWRhdGUgY2FjaGUgd2hlbiB0aGUgcHJvdmlkZXIgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaXRlbVByb3ZpZGVyLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuY2FjaGVkUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBmZXRjaFByb3ZpZGVySXRlbXMoKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvbkl0ZW1bXT4ge1xuXHRcdGlmICghdGhpcy5jYWNoZWRQcm9taXNlKSB7XG5cdFx0XHRjb25zdCBwcm9taXNlID0gdGhpcy5pdGVtUHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnModGhpcy5zZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0dGhpcy5jYWNoZWRQcm9taXNlID0gcHJvbWlzZTtcblx0XHRcdHByb21pc2UuY2F0Y2goKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5jYWNoZWRQcm9taXNlID09PSBwcm9taXNlKSB7XG5cdFx0XHRcdFx0dGhpcy5jYWNoZWRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jYWNoZWRQcm9taXNlO1xuXHRcdGNvbnN0IGFsbEl0ZW1zID0gYXdhaXQgY2FjaGVkO1xuXHRcdGlmIChjYWNoZWQgIT09IHRoaXMuY2FjaGVkUHJvbWlzZSB8fCAhYWxsSXRlbXMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIGFsbEl0ZW1zO1xuXHR9XG5cblx0YXN5bmMgZmV0Y2hBSUN1c3RvbWl6YXRpb25JdGVtcyhwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8SUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10+IHtcblx0XHRjb25zdCBhbGxJdGVtcyA9IGF3YWl0IHRoaXMuZmV0Y2hQcm92aWRlckl0ZW1zKCk7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbU5vcm1hbGl6ZXIubm9ybWFsaXplSXRlbXMoYWxsSXRlbXMsIHByb21wdFR5cGUpO1xuXHR9XG5cblx0YXN5bmMgZmV0Y2hTb3VyY2VGb2xkZXJzKHByb21wdFR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlcltdPiB7XG5cdFx0aWYgKCF0aGlzLml0ZW1Qcm92aWRlci5wcm92aWRlU291cmNlRm9sZGVycykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5pdGVtUHJvdmlkZXIucHJvdmlkZVNvdXJjZUZvbGRlcnModGhpcy5zZXNzaW9uUmVzb3VyY2UsIHByb21wdFR5cGUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKSA/PyBb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
