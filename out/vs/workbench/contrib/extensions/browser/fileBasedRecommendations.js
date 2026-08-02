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
import { ExtensionRecommendations } from "./extensionRecommendations.js";
import { EnablementState } from "../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionRecommendationReason, IExtensionIgnoredRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { localize } from "../../../../nls.js";
import { StorageScope, IStorageService, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, extname } from "../../../../base/common/resources.js";
import { match } from "../../../../base/common/glob.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { IExtensionRecommendationNotificationService, RecommendationsNotificationResult, RecommendationSource } from "../../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { distinct } from "../../../../base/common/arrays.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { CellUri } from "../../notebook/common/notebookCommon.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { isEmptyObject } from "../../../../base/common/types.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { IUntitledTextEditorService } from "../../../services/untitled/common/untitledTextEditorService.js";
const promptedRecommendationsStorageKey = "fileBasedRecommendations/promptedRecommendations";
const recommendationsStorageKey = "extensionsAssistant/recommendations";
const milliSecondsInADay = 1e3 * 60 * 60 * 24;
const untitledFileRecommendationsMinLength = 1e3;
let FileBasedRecommendations = class extends ExtensionRecommendations {
  constructor(extensionsWorkbenchService, modelService, languageService, productService, storageService, extensionRecommendationNotificationService, extensionIgnoredRecommendationsService, workspaceContextService, untitledTextEditorService) {
    super();
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.storageService = storageService;
    this.extensionRecommendationNotificationService = extensionRecommendationNotificationService;
    this.extensionIgnoredRecommendationsService = extensionIgnoredRecommendationsService;
    this.workspaceContextService = workspaceContextService;
    this.untitledTextEditorService = untitledTextEditorService;
    this.recommendationsByPattern = /* @__PURE__ */ new Map();
    this.fileBasedRecommendations = /* @__PURE__ */ new Map();
    this.fileBasedImportantRecommendations = /* @__PURE__ */ new Set();
    this.fileOpenRecommendations = {};
    if (productService.extensionRecommendations) {
      for (const [extensionId, recommendation] of Object.entries(productService.extensionRecommendations)) {
        if (recommendation.onFileOpen) {
          this.fileOpenRecommendations[extensionId.toLowerCase()] = recommendation.onFileOpen;
        }
      }
    }
  }
  get recommendations() {
    const recommendations = [];
    [...this.fileBasedRecommendations.keys()].sort((a, b) => {
      if (this.fileBasedRecommendations.get(a).recommendedTime === this.fileBasedRecommendations.get(b).recommendedTime) {
        if (this.fileBasedImportantRecommendations.has(a)) {
          return -1;
        }
        if (this.fileBasedImportantRecommendations.has(b)) {
          return 1;
        }
      }
      return this.fileBasedRecommendations.get(a).recommendedTime > this.fileBasedRecommendations.get(b).recommendedTime ? -1 : 1;
    }).forEach((extensionId) => {
      recommendations.push({
        extension: extensionId,
        reason: {
          reasonId: ExtensionRecommendationReason.File,
          reasonText: localize("fileBasedRecommendation", "This extension is recommended based on the files you recently opened.")
        }
      });
    });
    return recommendations;
  }
  get importantRecommendations() {
    return this.recommendations.filter((e) => this.fileBasedImportantRecommendations.has(e.extension));
  }
  get otherRecommendations() {
    return this.recommendations.filter((e) => !this.fileBasedImportantRecommendations.has(e.extension));
  }
  async doActivate() {
    if (isEmptyObject(this.fileOpenRecommendations)) {
      return;
    }
    await this.extensionsWorkbenchService.whenInitialized;
    const cachedRecommendations = this.getCachedRecommendations();
    const now = Date.now();
    Object.entries(cachedRecommendations).forEach(([key, value]) => {
      const diff = (now - value) / milliSecondsInADay;
      if (diff <= 7 && this.fileOpenRecommendations[key]) {
        this.fileBasedRecommendations.set(key.toLowerCase(), { recommendedTime: value });
      }
    });
    this._register(this.modelService.onModelAdded((model) => this.onModelAdded(model)));
    this.modelService.getModels().forEach((model) => this.onModelAdded(model));
  }
  onModelAdded(model) {
    const uri = model.uri.scheme === Schemas.vscodeNotebookCell ? CellUri.parse(model.uri)?.notebook : model.uri;
    if (!uri) {
      return;
    }
    const supportedSchemes = distinct([Schemas.untitled, Schemas.file, Schemas.vscodeRemote, ...this.workspaceContextService.getWorkspace().folders.map((folder) => folder.uri.scheme)]);
    if (!uri || !supportedSchemes.includes(uri.scheme)) {
      return;
    }
    disposableTimeout(() => this.promptImportantRecommendations(uri, model), 0, this._store);
  }
  /**
   * Prompt the user to either install the recommended extension for the file type in the current editor model
   * or prompt to search the marketplace if it has extensions that can support the file type
   */
  promptImportantRecommendations(uri, model, extensionRecommendations) {
    if (model.isDisposed()) {
      return;
    }
    const pattern = extname(uri).toLowerCase();
    extensionRecommendations = extensionRecommendations ?? this.recommendationsByPattern.get(pattern) ?? this.fileOpenRecommendations;
    const extensionRecommendationEntries = Object.entries(extensionRecommendations);
    if (extensionRecommendationEntries.length === 0) {
      return;
    }
    const processedPathGlobs = /* @__PURE__ */ new Map();
    const installed = this.extensionsWorkbenchService.local;
    const recommendationsByPattern = {};
    const matchedRecommendations = {};
    const unmatchedRecommendations = {};
    let listenOnLanguageChange = false;
    const languageId = model.getLanguageId();
    const untitledModel = this.untitledTextEditorService.get(uri);
    const allowLanguageMatch = !untitledModel || untitledModel.hasLanguageSetExplicitly || model.getValueLength() > untitledFileRecommendationsMinLength;
    for (const [extensionId, conditions] of extensionRecommendationEntries) {
      const conditionsByPattern = [];
      const matchedConditions = [];
      const unmatchedConditions = [];
      for (const condition of conditions) {
        let languageMatched = false;
        let pathGlobMatched = false;
        const isLanguageCondition = !!condition.languages;
        const isFileContentCondition = !!condition.contentPattern;
        if (isLanguageCondition || isFileContentCondition) {
          conditionsByPattern.push(condition);
        }
        if (isLanguageCondition && allowLanguageMatch) {
          if (condition.languages.includes(languageId)) {
            languageMatched = true;
          }
        }
        const pathGlob = condition.pathGlob;
        if (pathGlob) {
          if (processedPathGlobs.get(pathGlob) ?? match(pathGlob, uri.with({ fragment: "" }).toString(), { ignoreCase: true })) {
            pathGlobMatched = true;
          }
          processedPathGlobs.set(pathGlob, pathGlobMatched);
        }
        let matched = languageMatched || pathGlobMatched;
        if (pattern && !matched) {
          continue;
        }
        if (matched && condition.whenInstalled) {
          if (!condition.whenInstalled.every((id) => installed.some((local) => areSameExtensions({ id }, local.identifier)))) {
            matched = false;
          }
        }
        if (matched && condition.whenNotInstalled) {
          if (installed.some((local) => condition.whenNotInstalled?.some((id) => areSameExtensions({ id }, local.identifier)))) {
            matched = false;
          }
        }
        if (matched && isFileContentCondition) {
          if (!model.findMatches(condition.contentPattern, false, true, false, null, false).length) {
            matched = false;
          }
        }
        if (matched) {
          matchedConditions.push(condition);
          conditionsByPattern.pop();
        } else {
          if (isLanguageCondition || isFileContentCondition) {
            unmatchedConditions.push(condition);
            if (isLanguageCondition) {
              listenOnLanguageChange = true;
            }
          }
        }
      }
      if (matchedConditions.length) {
        matchedRecommendations[extensionId] = matchedConditions;
      }
      if (unmatchedConditions.length) {
        unmatchedRecommendations[extensionId] = unmatchedConditions;
      }
      if (conditionsByPattern.length) {
        recommendationsByPattern[extensionId] = conditionsByPattern;
      }
    }
    if (pattern) {
      this.recommendationsByPattern.set(pattern, recommendationsByPattern);
    }
    if (Object.keys(unmatchedRecommendations).length) {
      if (listenOnLanguageChange) {
        const disposables = new DisposableStore();
        disposables.add(model.onDidChangeLanguage(() => {
          disposableTimeout(() => {
            if (!disposables.isDisposed) {
              this.promptImportantRecommendations(uri, model, unmatchedRecommendations);
              disposables.dispose();
            }
          }, 0, disposables);
        }));
        disposables.add(model.onWillDispose(() => disposables.dispose()));
      }
    }
    if (Object.keys(matchedRecommendations).length) {
      this.promptFromRecommendations(uri, model, matchedRecommendations);
    }
  }
  promptFromRecommendations(uri, model, extensionRecommendations) {
    let isImportantRecommendationForLanguage = false;
    const importantRecommendations = /* @__PURE__ */ new Set();
    const fileBasedRecommendations = /* @__PURE__ */ new Set();
    for (const [extensionId, conditions] of Object.entries(extensionRecommendations)) {
      for (const condition of conditions) {
        fileBasedRecommendations.add(extensionId);
        if (condition.important) {
          importantRecommendations.add(extensionId);
          this.fileBasedImportantRecommendations.add(extensionId);
        }
        if (condition.languages) {
          isImportantRecommendationForLanguage = true;
        }
      }
    }
    for (const recommendation of fileBasedRecommendations) {
      const filedBasedRecommendation = this.fileBasedRecommendations.get(recommendation) || { recommendedTime: Date.now(), sources: [] };
      filedBasedRecommendation.recommendedTime = Date.now();
      this.fileBasedRecommendations.set(recommendation, filedBasedRecommendation);
    }
    this.storeCachedRecommendations();
    if (this.extensionRecommendationNotificationService.hasToIgnoreRecommendationNotifications()) {
      return;
    }
    const language = model.getLanguageId();
    const languageName = this.languageService.getLanguageName(language);
    if (importantRecommendations.size && this.promptRecommendedExtensionForFileType(languageName && isImportantRecommendationForLanguage && language !== PLAINTEXT_LANGUAGE_ID ? localize("languageName", "the {0} language", languageName) : basename(uri), language, [...importantRecommendations])) {
      return;
    }
  }
  promptRecommendedExtensionForFileType(name, language, recommendations) {
    recommendations = this.filterIgnoredOrNotAllowed(recommendations);
    if (recommendations.length === 0) {
      return false;
    }
    recommendations = this.filterInstalled(recommendations, this.extensionsWorkbenchService.local).filter((extensionId) => this.fileBasedImportantRecommendations.has(extensionId));
    const promptedRecommendations = language !== PLAINTEXT_LANGUAGE_ID ? this.getPromptedRecommendations()[language] : void 0;
    if (promptedRecommendations) {
      recommendations = recommendations.filter((extensionId) => !promptedRecommendations.includes(extensionId));
    }
    if (recommendations.length === 0) {
      return false;
    }
    this.promptImportantExtensionsInstallNotification(recommendations, name, language);
    return true;
  }
  async promptImportantExtensionsInstallNotification(extensions, name, language) {
    try {
      const result = await this.extensionRecommendationNotificationService.promptImportantExtensionsInstallNotification({ extensions, name, source: RecommendationSource.FILE });
      if (result === RecommendationsNotificationResult.Accepted) {
        this.addToPromptedRecommendations(language, extensions);
      }
    } catch (error) {
    }
  }
  getPromptedRecommendations() {
    return JSON.parse(this.storageService.get(promptedRecommendationsStorageKey, StorageScope.PROFILE, "{}"));
  }
  addToPromptedRecommendations(language, extensions) {
    const promptedRecommendations = this.getPromptedRecommendations();
    promptedRecommendations[language] = distinct([...promptedRecommendations[language] ?? [], ...extensions]);
    this.storageService.store(promptedRecommendationsStorageKey, JSON.stringify(promptedRecommendations), StorageScope.PROFILE, StorageTarget.USER);
  }
  filterIgnoredOrNotAllowed(recommendationsToSuggest) {
    const ignoredRecommendations = [...this.extensionIgnoredRecommendationsService.ignoredRecommendations, ...this.extensionRecommendationNotificationService.ignoredRecommendations];
    return recommendationsToSuggest.filter((id) => !ignoredRecommendations.includes(id));
  }
  filterInstalled(recommendationsToSuggest, installed) {
    const installedExtensionsIds = installed.reduce((result, i) => {
      if (i.enablementState !== EnablementState.DisabledByExtensionKind) {
        result.add(i.identifier.id.toLowerCase());
      }
      return result;
    }, /* @__PURE__ */ new Set());
    return recommendationsToSuggest.filter((id) => !installedExtensionsIds.has(id.toLowerCase()));
  }
  getCachedRecommendations() {
    let storedRecommendations = JSON.parse(this.storageService.get(recommendationsStorageKey, StorageScope.PROFILE, "[]"));
    if (Array.isArray(storedRecommendations)) {
      storedRecommendations = storedRecommendations.reduce((result2, id) => {
        result2[id] = Date.now();
        return result2;
      }, {});
    }
    const result = {};
    Object.entries(storedRecommendations).forEach(([key, value]) => {
      if (typeof value === "number") {
        result[key.toLowerCase()] = value;
      }
    });
    return result;
  }
  storeCachedRecommendations() {
    const storedRecommendations = {};
    this.fileBasedRecommendations.forEach((value, key) => storedRecommendations[key] = value.recommendedTime);
    this.storageService.store(recommendationsStorageKey, JSON.stringify(storedRecommendations), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
};
FileBasedRecommendations = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IExtensionRecommendationNotificationService),
  __decorateParam(6, IExtensionIgnoredRecommendationsService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IUntitledTextEditorService)
], FileBasedRecommendations);
export {
  FileBasedRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9maWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMsIEdhbGxlcnlFeHRlbnNpb25SZWNvbW1lbmRhdGlvbiB9IGZyb20gJy4vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IEVuYWJsZW1lbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24sIElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy9jb21tb24vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgSUV4dGVuc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSwgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZUNvbnRlbnRDb25kaXRpb24sIElGaWxlUGF0aENvbmRpdGlvbiwgSUZpbGVMYW5ndWFnZUNvbmRpdGlvbiwgSUZpbGVPcGVuQ29uZGl0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBleHRuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IG1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UsIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdCwgUmVjb21tZW5kYXRpb25Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgaXNFbXB0eU9iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5qcyc7XG5cbmNvbnN0IHByb21wdGVkUmVjb21tZW5kYXRpb25zU3RvcmFnZUtleSA9ICdmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMvcHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnMnO1xuY29uc3QgcmVjb21tZW5kYXRpb25zU3RvcmFnZUtleSA9ICdleHRlbnNpb25zQXNzaXN0YW50L3JlY29tbWVuZGF0aW9ucyc7XG5jb25zdCBtaWxsaVNlY29uZHNJbkFEYXkgPSAxMDAwICogNjAgKiA2MCAqIDI0O1xuXG4vLyBNaW5pbXVtIGxlbmd0aCBvZiB1bnRpdGxlZCBmaWxlIHRvIGFsbG93IHRyaWdnZXJpbmcgZXh0ZW5zaW9uIHJlY29tbWVuZGF0aW9ucyBmb3IgYXV0by1kZXRlY3RlZCBsYW5ndWFnZS5cbmNvbnN0IHVudGl0bGVkRmlsZVJlY29tbWVuZGF0aW9uc01pbkxlbmd0aCA9IDEwMDA7XG5cbmV4cG9ydCBjbGFzcyBGaWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMgZXh0ZW5kcyBFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnMge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZU9wZW5SZWNvbW1lbmRhdGlvbnM6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlT3BlbkNvbmRpdGlvbltdPjtcblx0cHJpdmF0ZSByZWFkb25seSByZWNvbW1lbmRhdGlvbnNCeVBhdHRlcm4gPSBuZXcgTWFwPHN0cmluZywgSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVPcGVuQ29uZGl0aW9uW10+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlY29tbWVuZGVkVGltZTogbnVtYmVyIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZUJhc2VkSW1wb3J0YW50UmVjb21tZW5kYXRpb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Z2V0IHJlY29tbWVuZGF0aW9ucygpOiBSZWFkb25seUFycmF5PEdhbGxlcnlFeHRlbnNpb25SZWNvbW1lbmRhdGlvbj4ge1xuXHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uczogR2FsbGVyeUV4dGVuc2lvblJlY29tbWVuZGF0aW9uW10gPSBbXTtcblx0XHRbLi4udGhpcy5maWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMua2V5cygpXVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zLmdldChhKSEucmVjb21tZW5kZWRUaW1lID09PSB0aGlzLmZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy5nZXQoYikhLnJlY29tbWVuZGVkVGltZSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmZpbGVCYXNlZEltcG9ydGFudFJlY29tbWVuZGF0aW9ucy5oYXMoYSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMuZmlsZUJhc2VkSW1wb3J0YW50UmVjb21tZW5kYXRpb25zLmhhcyhiKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy5nZXQoYSkhLnJlY29tbWVuZGVkVGltZSA+IHRoaXMuZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zLmdldChiKSEucmVjb21tZW5kZWRUaW1lID8gLTEgOiAxO1xuXHRcdFx0fSlcblx0XHRcdC5mb3JFYWNoKGV4dGVuc2lvbklkID0+IHtcblx0XHRcdFx0cmVjb21tZW5kYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdGV4dGVuc2lvbjogZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdFx0cmVhc29uOiB7XG5cdFx0XHRcdFx0XHRyZWFzb25JZDogRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25SZWFzb24uRmlsZSxcblx0XHRcdFx0XHRcdHJlYXNvblRleHQ6IGxvY2FsaXplKCdmaWxlQmFzZWRSZWNvbW1lbmRhdGlvbicsIFwiVGhpcyBleHRlbnNpb24gaXMgcmVjb21tZW5kZWQgYmFzZWQgb24gdGhlIGZpbGVzIHlvdSByZWNlbnRseSBvcGVuZWQuXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdHJldHVybiByZWNvbW1lbmRhdGlvbnM7XG5cdH1cblxuXHRnZXQgaW1wb3J0YW50UmVjb21tZW5kYXRpb25zKCk6IFJlYWRvbmx5QXJyYXk8R2FsbGVyeUV4dGVuc2lvblJlY29tbWVuZGF0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVjb21tZW5kYXRpb25zLmZpbHRlcihlID0+IHRoaXMuZmlsZUJhc2VkSW1wb3J0YW50UmVjb21tZW5kYXRpb25zLmhhcyhlLmV4dGVuc2lvbikpO1xuXHR9XG5cblx0Z2V0IG90aGVyUmVjb21tZW5kYXRpb25zKCk6IFJlYWRvbmx5QXJyYXk8R2FsbGVyeUV4dGVuc2lvblJlY29tbWVuZGF0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVjb21tZW5kYXRpb25zLmZpbHRlcihlID0+ICF0aGlzLmZpbGVCYXNlZEltcG9ydGFudFJlY29tbWVuZGF0aW9ucy5oYXMoZS5leHRlbnNpb24pKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZTogSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2U6IElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlOiBJVW50aXRsZWRUZXh0RWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmZpbGVPcGVuUmVjb21tZW5kYXRpb25zID0ge307XG5cdFx0aWYgKHByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvblJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBbZXh0ZW5zaW9uSWQsIHJlY29tbWVuZGF0aW9uXSBvZiBPYmplY3QuZW50cmllcyhwcm9kdWN0U2VydmljZS5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRcdGlmIChyZWNvbW1lbmRhdGlvbi5vbkZpbGVPcGVuKSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlT3BlblJlY29tbWVuZGF0aW9uc1tleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpXSA9IHJlY29tbWVuZGF0aW9uLm9uRmlsZU9wZW47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZG9BY3RpdmF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoaXNFbXB0eU9iamVjdCh0aGlzLmZpbGVPcGVuUmVjb21tZW5kYXRpb25zKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uud2hlbkluaXRpYWxpemVkO1xuXG5cdFx0Y29uc3QgY2FjaGVkUmVjb21tZW5kYXRpb25zID0gdGhpcy5nZXRDYWNoZWRSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdC8vIFJldGlyZSBleGlzdGluZyByZWNvbW1lbmRhdGlvbnMgaWYgdGhleSBhcmUgb2xkZXIgdGhhbiBhIHdlZWsgb3IgYXJlIG5vdCBwYXJ0IG9mIHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uVGlwcyBhbnltb3JlXG5cdFx0T2JqZWN0LmVudHJpZXMoY2FjaGVkUmVjb21tZW5kYXRpb25zKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSAobm93IC0gdmFsdWUpIC8gbWlsbGlTZWNvbmRzSW5BRGF5O1xuXHRcdFx0aWYgKGRpZmYgPD0gNyAmJiB0aGlzLmZpbGVPcGVuUmVjb21tZW5kYXRpb25zW2tleV0pIHtcblx0XHRcdFx0dGhpcy5maWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMuc2V0KGtleS50b0xvd2VyQ2FzZSgpLCB7IHJlY29tbWVuZGVkVGltZTogdmFsdWUgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQobW9kZWwgPT4gdGhpcy5vbk1vZGVsQWRkZWQobW9kZWwpKSk7XG5cdFx0dGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWxzKCkuZm9yRWFjaChtb2RlbCA9PiB0aGlzLm9uTW9kZWxBZGRlZChtb2RlbCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1vZGVsQWRkZWQobW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkIHtcblx0XHRjb25zdCB1cmkgPSBtb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCA/IENlbGxVcmkucGFyc2UobW9kZWwudXJpKT8ubm90ZWJvb2sgOiBtb2RlbC51cmk7XG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdXBwb3J0ZWRTY2hlbWVzID0gZGlzdGluY3QoW1NjaGVtYXMudW50aXRsZWQsIFNjaGVtYXMuZmlsZSwgU2NoZW1hcy52c2NvZGVSZW1vdGUsIC4uLnRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkuc2NoZW1lKV0pO1xuXHRcdGlmICghdXJpIHx8ICFzdXBwb3J0ZWRTY2hlbWVzLmluY2x1ZGVzKHVyaS5zY2hlbWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gcmUtc2NoZWR1bGUgdGhpcyBiaXQgb2YgdGhlIG9wZXJhdGlvbiB0byBiZSBvZmYgdGhlIGNyaXRpY2FsIHBhdGggLSBpbiBjYXNlIGdsb2ItbWF0Y2ggaXMgc2xvd1xuXHRcdGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHRoaXMucHJvbXB0SW1wb3J0YW50UmVjb21tZW5kYXRpb25zKHVyaSwgbW9kZWwpLCAwLCB0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvbXB0IHRoZSB1c2VyIHRvIGVpdGhlciBpbnN0YWxsIHRoZSByZWNvbW1lbmRlZCBleHRlbnNpb24gZm9yIHRoZSBmaWxlIHR5cGUgaW4gdGhlIGN1cnJlbnQgZWRpdG9yIG1vZGVsXG5cdCAqIG9yIHByb21wdCB0byBzZWFyY2ggdGhlIG1hcmtldHBsYWNlIGlmIGl0IGhhcyBleHRlbnNpb25zIHRoYXQgY2FuIHN1cHBvcnQgdGhlIGZpbGUgdHlwZVxuXHQgKi9cblx0cHJpdmF0ZSBwcm9tcHRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnModXJpOiBVUkksIG1vZGVsOiBJVGV4dE1vZGVsLCBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnM/OiBJU3RyaW5nRGljdGlvbmFyeTxJRmlsZU9wZW5Db25kaXRpb25bXT4pOiB2b2lkIHtcblx0XHRpZiAobW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0dGVybiA9IGV4dG5hbWUodXJpKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucyA9IGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucyA/PyB0aGlzLnJlY29tbWVuZGF0aW9uc0J5UGF0dGVybi5nZXQocGF0dGVybikgPz8gdGhpcy5maWxlT3BlblJlY29tbWVuZGF0aW9ucztcblx0XHRjb25zdCBleHRlbnNpb25SZWNvbW1lbmRhdGlvbkVudHJpZXMgPSBPYmplY3QuZW50cmllcyhleHRlbnNpb25SZWNvbW1lbmRhdGlvbnMpO1xuXHRcdGlmIChleHRlbnNpb25SZWNvbW1lbmRhdGlvbkVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvY2Vzc2VkUGF0aEdsb2JzID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5sb2NhbDtcblx0XHRjb25zdCByZWNvbW1lbmRhdGlvbnNCeVBhdHRlcm46IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlT3BlbkNvbmRpdGlvbltdPiA9IHt9O1xuXHRcdGNvbnN0IG1hdGNoZWRSZWNvbW1lbmRhdGlvbnM6IElTdHJpbmdEaWN0aW9uYXJ5PElGaWxlT3BlbkNvbmRpdGlvbltdPiA9IHt9O1xuXHRcdGNvbnN0IHVubWF0Y2hlZFJlY29tbWVuZGF0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8SUZpbGVPcGVuQ29uZGl0aW9uW10+ID0ge307XG5cdFx0bGV0IGxpc3Rlbk9uTGFuZ3VhZ2VDaGFuZ2UgPSBmYWxzZTtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXG5cdFx0Ly8gQWxsb3cgbGFuZ3VhZ2Utc3BlY2lmaWMgcmVjb21tZW5kYXRpb25zIGZvciB1bnRpdGxlZCBmaWxlcyB3aGVuIGxhbmd1YWdlIGlzIGF1dG8tZGV0ZWN0ZWQgb25seSB3aGVuIHRoZSBmaWxlIGlzIGxhcmdlLlxuXHRcdGNvbnN0IHVudGl0bGVkTW9kZWwgPSB0aGlzLnVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UuZ2V0KHVyaSk7XG5cdFx0Y29uc3QgYWxsb3dMYW5ndWFnZU1hdGNoID1cblx0XHRcdCF1bnRpdGxlZE1vZGVsIHx8XG5cdFx0XHR1bnRpdGxlZE1vZGVsLmhhc0xhbmd1YWdlU2V0RXhwbGljaXRseSB8fFxuXHRcdFx0bW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSA+IHVudGl0bGVkRmlsZVJlY29tbWVuZGF0aW9uc01pbkxlbmd0aDtcblxuXHRcdGZvciAoY29uc3QgW2V4dGVuc2lvbklkLCBjb25kaXRpb25zXSBvZiBleHRlbnNpb25SZWNvbW1lbmRhdGlvbkVudHJpZXMpIHtcblx0XHRcdGNvbnN0IGNvbmRpdGlvbnNCeVBhdHRlcm46IElGaWxlT3BlbkNvbmRpdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBtYXRjaGVkQ29uZGl0aW9uczogSUZpbGVPcGVuQ29uZGl0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IHVubWF0Y2hlZENvbmRpdGlvbnM6IElGaWxlT3BlbkNvbmRpdGlvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGNvbmRpdGlvbiBvZiBjb25kaXRpb25zKSB7XG5cdFx0XHRcdGxldCBsYW5ndWFnZU1hdGNoZWQgPSBmYWxzZTtcblx0XHRcdFx0bGV0IHBhdGhHbG9iTWF0Y2hlZCA9IGZhbHNlO1xuXG5cdFx0XHRcdGNvbnN0IGlzTGFuZ3VhZ2VDb25kaXRpb24gPSAhISg8SUZpbGVMYW5ndWFnZUNvbmRpdGlvbj5jb25kaXRpb24pLmxhbmd1YWdlcztcblx0XHRcdFx0Y29uc3QgaXNGaWxlQ29udGVudENvbmRpdGlvbiA9ICEhKDxJRmlsZUNvbnRlbnRDb25kaXRpb24+Y29uZGl0aW9uKS5jb250ZW50UGF0dGVybjtcblx0XHRcdFx0aWYgKGlzTGFuZ3VhZ2VDb25kaXRpb24gfHwgaXNGaWxlQ29udGVudENvbmRpdGlvbikge1xuXHRcdFx0XHRcdGNvbmRpdGlvbnNCeVBhdHRlcm4ucHVzaChjb25kaXRpb24pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzTGFuZ3VhZ2VDb25kaXRpb24gJiYgYWxsb3dMYW5ndWFnZU1hdGNoKSB7XG5cdFx0XHRcdFx0aWYgKCg8SUZpbGVMYW5ndWFnZUNvbmRpdGlvbj5jb25kaXRpb24pLmxhbmd1YWdlcy5pbmNsdWRlcyhsYW5ndWFnZUlkKSkge1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VNYXRjaGVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwYXRoR2xvYiA9ICg8SUZpbGVQYXRoQ29uZGl0aW9uPmNvbmRpdGlvbikucGF0aEdsb2I7XG5cdFx0XHRcdGlmIChwYXRoR2xvYikge1xuXHRcdFx0XHRcdGlmIChwcm9jZXNzZWRQYXRoR2xvYnMuZ2V0KHBhdGhHbG9iKSA/PyBtYXRjaChwYXRoR2xvYiwgdXJpLndpdGgoeyBmcmFnbWVudDogJycgfSkudG9TdHJpbmcoKSwgeyBpZ25vcmVDYXNlOiB0cnVlIH0pKSB7XG5cdFx0XHRcdFx0XHRwYXRoR2xvYk1hdGNoZWQgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcm9jZXNzZWRQYXRoR2xvYnMuc2V0KHBhdGhHbG9iLCBwYXRoR2xvYk1hdGNoZWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IG1hdGNoZWQgPSBsYW5ndWFnZU1hdGNoZWQgfHwgcGF0aEdsb2JNYXRjaGVkO1xuXG5cdFx0XHRcdC8vIElmIHRoZSByZXNvdXJjZSBoYXMgcGF0dGVybiAoZXh0ZW5zaW9uKSBhbmQgbm90IG1hdGNoZWQsIHRoZW4gd2UgZG9uJ3QgbmVlZCB0byBjaGVjayB0aGUgb3RoZXIgY29uZGl0aW9uc1xuXHRcdFx0XHRpZiAocGF0dGVybiAmJiAhbWF0Y2hlZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1hdGNoZWQgJiYgY29uZGl0aW9uLndoZW5JbnN0YWxsZWQpIHtcblx0XHRcdFx0XHRpZiAoIWNvbmRpdGlvbi53aGVuSW5zdGFsbGVkLmV2ZXJ5KGlkID0+IGluc3RhbGxlZC5zb21lKGxvY2FsID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgbG9jYWwuaWRlbnRpZmllcikpKSkge1xuXHRcdFx0XHRcdFx0bWF0Y2hlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtYXRjaGVkICYmIGNvbmRpdGlvbi53aGVuTm90SW5zdGFsbGVkKSB7XG5cdFx0XHRcdFx0aWYgKGluc3RhbGxlZC5zb21lKGxvY2FsID0+IGNvbmRpdGlvbi53aGVuTm90SW5zdGFsbGVkPy5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgbG9jYWwuaWRlbnRpZmllcikpKSkge1xuXHRcdFx0XHRcdFx0bWF0Y2hlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtYXRjaGVkICYmIGlzRmlsZUNvbnRlbnRDb25kaXRpb24pIHtcblx0XHRcdFx0XHRpZiAoIW1vZGVsLmZpbmRNYXRjaGVzKCg8SUZpbGVDb250ZW50Q29uZGl0aW9uPmNvbmRpdGlvbikuY29udGVudFBhdHRlcm4sIGZhbHNlLCB0cnVlLCBmYWxzZSwgbnVsbCwgZmFsc2UpLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0bWF0Y2hlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtYXRjaGVkKSB7XG5cdFx0XHRcdFx0bWF0Y2hlZENvbmRpdGlvbnMucHVzaChjb25kaXRpb24pO1xuXHRcdFx0XHRcdGNvbmRpdGlvbnNCeVBhdHRlcm4ucG9wKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGlzTGFuZ3VhZ2VDb25kaXRpb24gfHwgaXNGaWxlQ29udGVudENvbmRpdGlvbikge1xuXHRcdFx0XHRcdFx0dW5tYXRjaGVkQ29uZGl0aW9ucy5wdXNoKGNvbmRpdGlvbik7XG5cdFx0XHRcdFx0XHRpZiAoaXNMYW5ndWFnZUNvbmRpdGlvbikge1xuXHRcdFx0XHRcdFx0XHRsaXN0ZW5Pbkxhbmd1YWdlQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdFx0aWYgKG1hdGNoZWRDb25kaXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRtYXRjaGVkUmVjb21tZW5kYXRpb25zW2V4dGVuc2lvbklkXSA9IG1hdGNoZWRDb25kaXRpb25zO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVubWF0Y2hlZENvbmRpdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHVubWF0Y2hlZFJlY29tbWVuZGF0aW9uc1tleHRlbnNpb25JZF0gPSB1bm1hdGNoZWRDb25kaXRpb25zO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbmRpdGlvbnNCeVBhdHRlcm4ubGVuZ3RoKSB7XG5cdFx0XHRcdHJlY29tbWVuZGF0aW9uc0J5UGF0dGVybltleHRlbnNpb25JZF0gPSBjb25kaXRpb25zQnlQYXR0ZXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwYXR0ZXJuKSB7XG5cdFx0XHR0aGlzLnJlY29tbWVuZGF0aW9uc0J5UGF0dGVybi5zZXQocGF0dGVybiwgcmVjb21tZW5kYXRpb25zQnlQYXR0ZXJuKTtcblx0XHR9XG5cdFx0aWYgKE9iamVjdC5rZXlzKHVubWF0Y2hlZFJlY29tbWVuZGF0aW9ucykubGVuZ3RoKSB7XG5cdFx0XHRpZiAobGlzdGVuT25MYW5ndWFnZUNoYW5nZSkge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlTGFuZ3VhZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIHJlLXNjaGVkdWxlIHRoaXMgYml0IG9mIHRoZSBvcGVyYXRpb24gdG8gYmUgb2ZmIHRoZSBjcml0aWNhbCBwYXRoIC0gaW4gY2FzZSBnbG9iLW1hdGNoIGlzIHNsb3dcblx0XHRcdFx0XHRkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIWRpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5wcm9tcHRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnModXJpLCBtb2RlbCwgdW5tYXRjaGVkUmVjb21tZW5kYXRpb25zKTtcblx0XHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIDAsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25XaWxsRGlzcG9zZSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoT2JqZWN0LmtleXMobWF0Y2hlZFJlY29tbWVuZGF0aW9ucykubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnByb21wdEZyb21SZWNvbW1lbmRhdGlvbnModXJpLCBtb2RlbCwgbWF0Y2hlZFJlY29tbWVuZGF0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwcm9tcHRGcm9tUmVjb21tZW5kYXRpb25zKHVyaTogVVJJLCBtb2RlbDogSVRleHRNb2RlbCwgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zOiBJU3RyaW5nRGljdGlvbmFyeTxJRmlsZU9wZW5Db25kaXRpb25bXT4pOiB2b2lkIHtcblx0XHRsZXQgaXNJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbkZvckxhbmd1YWdlID0gZmFsc2U7XG5cdFx0Y29uc3QgaW1wb3J0YW50UmVjb21tZW5kYXRpb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBbZXh0ZW5zaW9uSWQsIGNvbmRpdGlvbnNdIG9mIE9iamVjdC5lbnRyaWVzKGV4dGVuc2lvblJlY29tbWVuZGF0aW9ucykpIHtcblx0XHRcdGZvciAoY29uc3QgY29uZGl0aW9uIG9mIGNvbmRpdGlvbnMpIHtcblx0XHRcdFx0ZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zLmFkZChleHRlbnNpb25JZCk7XG5cdFx0XHRcdGlmIChjb25kaXRpb24uaW1wb3J0YW50KSB7XG5cdFx0XHRcdFx0aW1wb3J0YW50UmVjb21tZW5kYXRpb25zLmFkZChleHRlbnNpb25JZCk7XG5cdFx0XHRcdFx0dGhpcy5maWxlQmFzZWRJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMuYWRkKGV4dGVuc2lvbklkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKDxJRmlsZUxhbmd1YWdlQ29uZGl0aW9uPmNvbmRpdGlvbikubGFuZ3VhZ2VzKSB7XG5cdFx0XHRcdFx0aXNJbXBvcnRhbnRSZWNvbW1lbmRhdGlvbkZvckxhbmd1YWdlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBmaWxlIGJhc2VkIHJlY29tbWVuZGF0aW9uc1xuXHRcdGZvciAoY29uc3QgcmVjb21tZW5kYXRpb24gb2YgZmlsZUJhc2VkUmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRjb25zdCBmaWxlZEJhc2VkUmVjb21tZW5kYXRpb24gPSB0aGlzLmZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy5nZXQocmVjb21tZW5kYXRpb24pIHx8IHsgcmVjb21tZW5kZWRUaW1lOiBEYXRlLm5vdygpLCBzb3VyY2VzOiBbXSB9O1xuXHRcdFx0ZmlsZWRCYXNlZFJlY29tbWVuZGF0aW9uLnJlY29tbWVuZGVkVGltZSA9IERhdGUubm93KCk7XG5cdFx0XHR0aGlzLmZpbGVCYXNlZFJlY29tbWVuZGF0aW9ucy5zZXQocmVjb21tZW5kYXRpb24sIGZpbGVkQmFzZWRSZWNvbW1lbmRhdGlvbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yZUNhY2hlZFJlY29tbWVuZGF0aW9ucygpO1xuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLmhhc1RvSWdub3JlUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25zKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZSA9IG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRjb25zdCBsYW5ndWFnZU5hbWUgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2UpO1xuXHRcdGlmIChpbXBvcnRhbnRSZWNvbW1lbmRhdGlvbnMuc2l6ZSAmJlxuXHRcdFx0dGhpcy5wcm9tcHRSZWNvbW1lbmRlZEV4dGVuc2lvbkZvckZpbGVUeXBlKGxhbmd1YWdlTmFtZSAmJiBpc0ltcG9ydGFudFJlY29tbWVuZGF0aW9uRm9yTGFuZ3VhZ2UgJiYgbGFuZ3VhZ2UgIT09IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCA/IGxvY2FsaXplKCdsYW5ndWFnZU5hbWUnLCBcInRoZSB7MH0gbGFuZ3VhZ2VcIiwgbGFuZ3VhZ2VOYW1lKSA6IGJhc2VuYW1lKHVyaSksIGxhbmd1YWdlLCBbLi4uaW1wb3J0YW50UmVjb21tZW5kYXRpb25zXSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHByb21wdFJlY29tbWVuZGVkRXh0ZW5zaW9uRm9yRmlsZVR5cGUobmFtZTogc3RyaW5nLCBsYW5ndWFnZTogc3RyaW5nLCByZWNvbW1lbmRhdGlvbnM6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0cmVjb21tZW5kYXRpb25zID0gdGhpcy5maWx0ZXJJZ25vcmVkT3JOb3RBbGxvd2VkKHJlY29tbWVuZGF0aW9ucyk7XG5cdFx0aWYgKHJlY29tbWVuZGF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZWNvbW1lbmRhdGlvbnMgPSB0aGlzLmZpbHRlckluc3RhbGxlZChyZWNvbW1lbmRhdGlvbnMsIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwpXG5cdFx0XHQuZmlsdGVyKGV4dGVuc2lvbklkID0+IHRoaXMuZmlsZUJhc2VkSW1wb3J0YW50UmVjb21tZW5kYXRpb25zLmhhcyhleHRlbnNpb25JZCkpO1xuXG5cdFx0Y29uc3QgcHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnMgPSBsYW5ndWFnZSAhPT0gUExBSU5URVhUX0xBTkdVQUdFX0lEID8gdGhpcy5nZXRQcm9tcHRlZFJlY29tbWVuZGF0aW9ucygpW2xhbmd1YWdlXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAocHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdHJlY29tbWVuZGF0aW9ucyA9IHJlY29tbWVuZGF0aW9ucy5maWx0ZXIoZXh0ZW5zaW9uSWQgPT4gIXByb21wdGVkUmVjb21tZW5kYXRpb25zLmluY2x1ZGVzKGV4dGVuc2lvbklkKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlY29tbWVuZGF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnByb21wdEltcG9ydGFudEV4dGVuc2lvbnNJbnN0YWxsTm90aWZpY2F0aW9uKHJlY29tbWVuZGF0aW9ucywgbmFtZSwgbGFuZ3VhZ2UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm9tcHRJbXBvcnRhbnRFeHRlbnNpb25zSW5zdGFsbE5vdGlmaWNhdGlvbihleHRlbnNpb25zOiBzdHJpbmdbXSwgbmFtZTogc3RyaW5nLCBsYW5ndWFnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlLnByb21wdEltcG9ydGFudEV4dGVuc2lvbnNJbnN0YWxsTm90aWZpY2F0aW9uKHsgZXh0ZW5zaW9ucywgbmFtZSwgc291cmNlOiBSZWNvbW1lbmRhdGlvblNvdXJjZS5GSUxFIH0pO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LkFjY2VwdGVkKSB7XG5cdFx0XHRcdHRoaXMuYWRkVG9Qcm9tcHRlZFJlY29tbWVuZGF0aW9ucyhsYW5ndWFnZSwgZXh0ZW5zaW9ucyk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHsgLyogSWdub3JlICovIH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnMoKTogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChwcm9tcHRlZFJlY29tbWVuZGF0aW9uc1N0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAne30nKSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZFRvUHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnMobGFuZ3VhZ2U6IHN0cmluZywgZXh0ZW5zaW9uczogc3RyaW5nW10pIHtcblx0XHRjb25zdCBwcm9tcHRlZFJlY29tbWVuZGF0aW9ucyA9IHRoaXMuZ2V0UHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnMoKTtcblx0XHRwcm9tcHRlZFJlY29tbWVuZGF0aW9uc1tsYW5ndWFnZV0gPSBkaXN0aW5jdChbLi4uKHByb21wdGVkUmVjb21tZW5kYXRpb25zW2xhbmd1YWdlXSA/PyBbXSksIC4uLmV4dGVuc2lvbnNdKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHByb21wdGVkUmVjb21tZW5kYXRpb25zU3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkocHJvbXB0ZWRSZWNvbW1lbmRhdGlvbnMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVySWdub3JlZE9yTm90QWxsb3dlZChyZWNvbW1lbmRhdGlvbnNUb1N1Z2dlc3Q6IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGlnbm9yZWRSZWNvbW1lbmRhdGlvbnMgPSBbLi4udGhpcy5leHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZS5pZ25vcmVkUmVjb21tZW5kYXRpb25zLCAuLi50aGlzLmV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZS5pZ25vcmVkUmVjb21tZW5kYXRpb25zXTtcblx0XHRyZXR1cm4gcmVjb21tZW5kYXRpb25zVG9TdWdnZXN0LmZpbHRlcihpZCA9PiAhaWdub3JlZFJlY29tbWVuZGF0aW9ucy5pbmNsdWRlcyhpZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJJbnN0YWxsZWQocmVjb21tZW5kYXRpb25zVG9TdWdnZXN0OiBzdHJpbmdbXSwgaW5zdGFsbGVkOiBJRXh0ZW5zaW9uW10pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uc0lkcyA9IGluc3RhbGxlZC5yZWR1Y2UoKHJlc3VsdCwgaSkgPT4ge1xuXHRcdFx0aWYgKGkuZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbktpbmQpIHtcblx0XHRcdFx0cmVzdWx0LmFkZChpLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblx0XHRyZXR1cm4gcmVjb21tZW5kYXRpb25zVG9TdWdnZXN0LmZpbHRlcihpZCA9PiAhaW5zdGFsbGVkRXh0ZW5zaW9uc0lkcy5oYXMoaWQudG9Mb3dlckNhc2UoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDYWNoZWRSZWNvbW1lbmRhdGlvbnMoKTogSVN0cmluZ0RpY3Rpb25hcnk8bnVtYmVyPiB7XG5cdFx0bGV0IHN0b3JlZFJlY29tbWVuZGF0aW9ucyA9IEpTT04ucGFyc2UodGhpcy5zdG9yYWdlU2VydmljZS5nZXQocmVjb21tZW5kYXRpb25zU3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShzdG9yZWRSZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRzdG9yZWRSZWNvbW1lbmRhdGlvbnMgPSBzdG9yZWRSZWNvbW1lbmRhdGlvbnMucmVkdWNlPElTdHJpbmdEaWN0aW9uYXJ5PG51bWJlcj4+KChyZXN1bHQsIGlkKSA9PiB7IHJlc3VsdFtpZF0gPSBEYXRlLm5vdygpOyByZXR1cm4gcmVzdWx0OyB9LCB7fSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogSVN0cmluZ0RpY3Rpb25hcnk8bnVtYmVyPiA9IHt9O1xuXHRcdE9iamVjdC5lbnRyaWVzKHN0b3JlZFJlY29tbWVuZGF0aW9ucykuZm9yRWFjaCgoW2tleSwgdmFsdWVdKSA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRyZXN1bHRba2V5LnRvTG93ZXJDYXNlKCldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc3RvcmVDYWNoZWRSZWNvbW1lbmRhdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmVkUmVjb21tZW5kYXRpb25zOiBJU3RyaW5nRGljdGlvbmFyeTxudW1iZXI+ID0ge307XG5cdFx0dGhpcy5maWxlQmFzZWRSZWNvbW1lbmRhdGlvbnMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4gc3RvcmVkUmVjb21tZW5kYXRpb25zW2tleV0gPSB2YWx1ZS5yZWNvbW1lbmRlZFRpbWUpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUocmVjb21tZW5kYXRpb25zU3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkoc3RvcmVkUmVjb21tZW5kYXRpb25zKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQ0FBZ0U7QUFDekUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQkFBK0IsK0NBQStDO0FBQ3ZGLFNBQVMsbUNBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYyxpQkFBaUIscUJBQXFCO0FBQzdELFNBQVMsdUJBQXVCO0FBSWhDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLGFBQWE7QUFFdEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2Q0FBNkMsbUNBQW1DLDRCQUE0QjtBQUNySCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQ0FBa0M7QUFFM0MsTUFBTSxvQ0FBb0M7QUFDMUMsTUFBTSw0QkFBNEI7QUFDbEMs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
