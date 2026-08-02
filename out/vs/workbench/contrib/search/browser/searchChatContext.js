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
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { getExcludes, ISearchService, QueryType, VIEW_ID } from "../../../services/search/common/search.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IChatContextPickService, picksWithPromiseFn } from "../../chat/browser/attachments/chatContextPickService.js";
import { SearchContext } from "../common/constants.js";
import { SearchView } from "./searchView.js";
import { basename, dirname, joinPath, relativePath } from "../../../../base/common/resources.js";
import { compare } from "../../../../base/common/strings.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileKind, FileType, IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import * as glob from "../../../../base/common/glob.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { SymbolsQuickAccessProvider } from "./symbolsQuickAccess.js";
import { SymbolKinds } from "../../../../editor/common/languages.js";
import { isSupportedChatFileScheme } from "../../chat/common/constants.js";
let SearchChatContextContribution = class extends Disposable {
  constructor(instantiationService, chatContextPickService) {
    super();
    this._store.add(chatContextPickService.registerChatContextItem(instantiationService.createInstance(SearchViewResultChatContextPick)));
    this._store.add(chatContextPickService.registerChatContextItem(instantiationService.createInstance(FilesAndFoldersPickerPick)));
    this._store.add(chatContextPickService.registerChatContextItem(this._store.add(instantiationService.createInstance(SymbolsContextPickerPick))));
  }
};
SearchChatContextContribution.ID = "workbench.contributions.searchChatContextContribution";
SearchChatContextContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IChatContextPickService)
], SearchChatContextContribution);
let SearchViewResultChatContextPick = class {
  constructor(_contextKeyService, _viewsService, _labelService) {
    this._contextKeyService = _contextKeyService;
    this._viewsService = _viewsService;
    this._labelService = _labelService;
    this.type = "valuePick";
    this.label = localize("chatContext.searchResults", "Search Results");
    this.icon = Codicon.search;
    this.ordinal = 500;
  }
  isEnabled(widget) {
    return !!SearchContext.HasSearchResults.getValue(this._contextKeyService) && !!widget.attachmentCapabilities.supportsSearchResultAttachments;
  }
  async asAttachment() {
    const searchView = this._viewsService.getViewWithId(VIEW_ID);
    if (!(searchView instanceof SearchView)) {
      return [];
    }
    return searchView.model.searchResult.matches().map((result) => ({
      kind: "file",
      id: result.resource.toString(),
      value: result.resource,
      name: this._labelService.getUriBasenameLabel(result.resource)
    }));
  }
};
SearchViewResultChatContextPick = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IViewsService),
  __decorateParam(2, ILabelService)
], SearchViewResultChatContextPick);
let SymbolsContextPickerPick = class {
  constructor(_instantiationService) {
    this._instantiationService = _instantiationService;
    this.type = "pickerPick";
    this.label = localize("symbols", "Symbols...");
    this.icon = Codicon.symbolField;
    this.ordinal = -200;
  }
  dispose() {
    this._provider?.dispose();
  }
  isEnabled(widget) {
    return !!widget.attachmentCapabilities.supportsSymbolAttachments;
  }
  asPicker() {
    return {
      placeholder: localize("select.symb", "Select a symbol"),
      picks: picksWithPromiseFn((query, token) => {
        this._provider ??= this._instantiationService.createInstance(SymbolsQuickAccessProvider);
        return this._provider.getSymbolPicks(query, void 0, token).then((symbolItems) => {
          const result = [];
          for (const item of symbolItems) {
            if (!item.symbol) {
              continue;
            }
            const attachment = {
              kind: "symbol",
              id: JSON.stringify(item.symbol.location),
              value: item.symbol.location,
              symbolKind: item.symbol.kind,
              icon: SymbolKinds.toIcon(item.symbol.kind),
              fullName: item.label,
              name: item.symbol.name
            };
            result.push({
              label: item.symbol.name,
              iconClass: ThemeIcon.asClassName(SymbolKinds.toIcon(item.symbol.kind)),
              asAttachment() {
                return attachment;
              }
            });
          }
          return result;
        });
      })
    };
  }
};
SymbolsContextPickerPick = __decorateClass([
  __decorateParam(0, IInstantiationService)
], SymbolsContextPickerPick);
let FilesAndFoldersPickerPick = class {
  constructor(_searchService, _labelService, _modelService, _languageService, _configurationService, _workspaceService, _fileService, _historyService, _instantiationService) {
    this._searchService = _searchService;
    this._labelService = _labelService;
    this._modelService = _modelService;
    this._languageService = _languageService;
    this._configurationService = _configurationService;
    this._workspaceService = _workspaceService;
    this._fileService = _fileService;
    this._historyService = _historyService;
    this._instantiationService = _instantiationService;
    this.type = "pickerPick";
    this.label = localize("chatContext.folder", "Files & Folders...");
    this.icon = Codicon.folder;
    this.ordinal = 600;
  }
  asPicker() {
    return {
      placeholder: localize("chatContext.attach.files.placeholder", "Search file or folder by name"),
      picks: picksWithPromiseFn(async (value, token) => {
        const workspaces = this._workspaceService.getWorkspace().folders.map((folder) => folder.uri);
        const defaultItems = [];
        (await getTopLevelFolders(workspaces, this._fileService)).forEach((uri) => defaultItems.push(this._createPickItem(uri, FileKind.FOLDER)));
        this._historyService.getHistory().filter((a) => a.resource && this._instantiationService.invokeFunction((accessor) => isSupportedChatFileScheme(accessor, a.resource.scheme))).slice(0, 30).forEach((uri) => defaultItems.push(this._createPickItem(uri.resource, FileKind.FILE)));
        if (value === "") {
          return defaultItems;
        }
        const result = [];
        await Promise.all(workspaces.map(async (workspace) => {
          const { folders, files } = await searchFilesAndFolders(
            workspace,
            value,
            true,
            token,
            void 0,
            this._configurationService,
            this._searchService
          );
          for (const folder of folders) {
            result.push(this._createPickItem(folder, FileKind.FOLDER));
          }
          for (const file of files) {
            result.push(this._createPickItem(file, FileKind.FILE));
          }
        }));
        result.sort((a, b) => compare(a.label, b.label));
        return result;
      })
    };
  }
  _createPickItem(resource, kind) {
    return {
      label: basename(resource),
      description: this._labelService.getUriLabel(dirname(resource), { relative: true }),
      iconClasses: getIconClasses(this._modelService, this._languageService, resource, kind),
      asAttachment: () => {
        return {
          kind: kind === FileKind.FILE ? "file" : "directory",
          id: resource.toString(),
          value: resource,
          name: basename(resource)
        };
      }
    };
  }
};
FilesAndFoldersPickerPick = __decorateClass([
  __decorateParam(0, ISearchService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IModelService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IHistoryService),
  __decorateParam(8, IInstantiationService)
], FilesAndFoldersPickerPick);
async function searchFilesAndFolders(workspace, pattern, fuzzyMatch, token, cacheKey, configurationService, searchService) {
  const segmentMatchPattern = fuzzyMatch ? fuzzyMatchingGlobPattern(pattern) : continousMatchingGlobPattern(pattern);
  const searchExcludePattern = getExcludes(configurationService.getValue({ resource: workspace })) || {};
  const searchOptions = {
    folderQueries: [{
      folder: workspace,
      disregardIgnoreFiles: configurationService.getValue("explorer.excludeGitIgnore")
    }],
    type: QueryType.File,
    shouldGlobMatchFilePattern: true,
    cacheKey,
    excludePattern: searchExcludePattern,
    sortByScore: true,
    ignoreGlobCase: true
  };
  let searchResult;
  try {
    searchResult = await searchService.fileSearch({ ...searchOptions, filePattern: `{**/${segmentMatchPattern}/**,**/${segmentMatchPattern}}` }, token);
  } catch (e) {
    if (!isCancellationError(e)) {
      throw e;
    }
  }
  if (!searchResult || token?.isCancellationRequested) {
    return { files: [], folders: [] };
  }
  const fileResources = searchResult.results.map((result) => result.resource);
  const folderResources = getMatchingFoldersFromFiles(fileResources, workspace, segmentMatchPattern);
  return { folders: folderResources, files: fileResources };
}
function fuzzyMatchingGlobPattern(pattern) {
  if (!pattern) {
    return "*";
  }
  return "*" + pattern.split("").join("*") + "*";
}
function continousMatchingGlobPattern(pattern) {
  if (!pattern) {
    return "*";
  }
  return "*" + pattern + "*";
}
function getMatchingFoldersFromFiles(resources, workspace, segmentMatchPattern) {
  const uniqueFolders = new ResourceSet();
  for (const resource of resources) {
    const relativePathToRoot = relativePath(workspace, resource);
    if (!relativePathToRoot) {
      throw new Error("Resource is not a child of the workspace");
    }
    let dirResource = workspace;
    const stats = relativePathToRoot.split("/").slice(0, -1);
    for (const stat of stats) {
      dirResource = dirResource.with({ path: `${dirResource.path}/${stat}` });
      uniqueFolders.add(dirResource);
    }
  }
  const matchingFolders = [];
  for (const folderResource of uniqueFolders) {
    const stats = folderResource.path.split("/");
    const dirStat = stats[stats.length - 1];
    if (!dirStat || !glob.match(segmentMatchPattern, dirStat, { ignoreCase: true })) {
      continue;
    }
    matchingFolders.push(folderResource);
  }
  return matchingFolders;
}
async function getTopLevelFolders(workspaces, fileService) {
  const folders = [];
  for (const workspace of workspaces) {
    const fileSystemProvider = fileService.getProvider(workspace.scheme);
    if (!fileSystemProvider) {
      continue;
    }
    const entries = await fileSystemProvider.readdir(workspace);
    for (const [name, type] of entries) {
      const entryResource = joinPath(workspace, name);
      if (type === FileType.Directory) {
        folders.push(entryResource);
      }
    }
  }
  return folders;
}
export {
  SearchChatContextContribution,
  getTopLevelFolders,
  searchFilesAndFolders
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaENoYXRDb250ZXh0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRFeGNsdWRlcywgSUZpbGVRdWVyeSwgSVNlYXJjaENvbXBsZXRlLCBJU2VhcmNoQ29uZmlndXJhdGlvbiwgSVNlYXJjaFNlcnZpY2UsIFF1ZXJ5VHlwZSwgVklFV19JRCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGV4dFBpY2tlckl0ZW0sIElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtLCBJQ2hhdENvbnRleHRQaWNrU2VydmljZSwgSUNoYXRDb250ZXh0VmFsdWVJdGVtLCBwaWNrc1dpdGhQcm9taXNlRm4gfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBJU3ltYm9sVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgU2VhcmNoQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgU2VhcmNoVmlldyB9IGZyb20gJy4vc2VhcmNoVmlldy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pblBhdGgsIHJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGdldEljb25DbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBGaWxlVHlwZSwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgKiBhcyBnbG9iIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIgfSBmcm9tICcuL3N5bWJvbHNRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBTeW1ib2xLaW5kcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGlzU3VwcG9ydGVkQ2hhdEZpbGVTY2hlbWUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTZWFyY2hDaGF0Q29udGV4dENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWJ1dGlvbnMuc2VhcmNoQ2hhdENvbnRleHRDb250cmlidXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRDb250ZXh0UGlja1NlcnZpY2UgY2hhdENvbnRleHRQaWNrU2VydmljZTogSUNoYXRDb250ZXh0UGlja1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoY2hhdENvbnRleHRQaWNrU2VydmljZS5yZWdpc3RlckNoYXRDb250ZXh0SXRlbShpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hWaWV3UmVzdWx0Q2hhdENvbnRleHRQaWNrKSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChjaGF0Q29udGV4dFBpY2tTZXJ2aWNlLnJlZ2lzdGVyQ2hhdENvbnRleHRJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVzQW5kRm9sZGVyc1BpY2tlclBpY2spKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKGNoYXRDb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0odGhpcy5fc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN5bWJvbHNDb250ZXh0UGlja2VyUGljaykpKSk7XG5cdH1cbn1cblxuY2xhc3MgU2VhcmNoVmlld1Jlc3VsdENoYXRDb250ZXh0UGljayBpbXBsZW1lbnRzIElDaGF0Q29udGV4dFZhbHVlSXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd2YWx1ZVBpY2snO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gbG9jYWxpemUoJ2NoYXRDb250ZXh0LnNlYXJjaFJlc3VsdHMnLCAnU2VhcmNoIFJlc3VsdHMnKTtcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uID0gQ29kaWNvbi5zZWFyY2g7XG5cdHJlYWRvbmx5IG9yZGluYWwgPSA1MDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0aXNFbmFibGVkKHdpZGdldDogSUNoYXRXaWRnZXQpOiBQcm9taXNlPGJvb2xlYW4+IHwgYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhU2VhcmNoQ29udGV4dC5IYXNTZWFyY2hSZXN1bHRzLmdldFZhbHVlKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSAmJiAhIXdpZGdldC5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzU2VhcmNoUmVzdWx0QXR0YWNobWVudHM7XG5cdH1cblxuXHRhc3luYyBhc0F0dGFjaG1lbnQoKTogUHJvbWlzZTxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10+IHtcblx0XHRjb25zdCBzZWFyY2hWaWV3ID0gdGhpcy5fdmlld3NTZXJ2aWNlLmdldFZpZXdXaXRoSWQoVklFV19JRCk7XG5cdFx0aWYgKCEoc2VhcmNoVmlldyBpbnN0YW5jZW9mIFNlYXJjaFZpZXcpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNlYXJjaFZpZXcubW9kZWwuc2VhcmNoUmVzdWx0Lm1hdGNoZXMoKS5tYXAocmVzdWx0ID0+ICh7XG5cdFx0XHRraW5kOiAnZmlsZScsXG5cdFx0XHRpZDogcmVzdWx0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHR2YWx1ZTogcmVzdWx0LnJlc291cmNlLFxuXHRcdFx0bmFtZTogdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwocmVzdWx0LnJlc291cmNlKSxcblx0XHR9KSk7XG5cdH1cbn1cblxuY2xhc3MgU3ltYm9sc0NvbnRleHRQaWNrZXJQaWNrIGltcGxlbWVudHMgSUNoYXRDb250ZXh0UGlja2VySXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdwaWNrZXJQaWNrJztcblxuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gbG9jYWxpemUoJ3N5bWJvbHMnLCAnU3ltYm9scy4uLicpO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb24gPSBDb2RpY29uLnN5bWJvbEZpZWxkO1xuXHRyZWFkb25seSBvcmRpbmFsID0gLTIwMDtcblxuXHRwcml2YXRlIF9wcm92aWRlcjogU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvdmlkZXI/LmRpc3Bvc2UoKTtcblx0fVxuXG5cdGlzRW5hYmxlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNTeW1ib2xBdHRhY2htZW50cztcblx0fVxuXHRhc1BpY2tlcigpIHtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ3NlbGVjdC5zeW1iJywgXCJTZWxlY3QgYSBzeW1ib2xcIiksXG5cdFx0XHRwaWNrczogcGlja3NXaXRoUHJvbWlzZUZuKChxdWVyeTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblxuXHRcdFx0XHR0aGlzLl9wcm92aWRlciA/Pz0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIpO1xuXG5cdFx0XHRcdHJldHVybiB0aGlzLl9wcm92aWRlci5nZXRTeW1ib2xQaWNrcyhxdWVyeSwgdW5kZWZpbmVkLCB0b2tlbikudGhlbihzeW1ib2xJdGVtcyA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdENvbnRleHRQaWNrZXJQaWNrSXRlbVtdID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHN5bWJvbEl0ZW1zKSB7XG5cdFx0XHRcdFx0XHRpZiAoIWl0ZW0uc3ltYm9sKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBhdHRhY2htZW50OiBJU3ltYm9sVmFyaWFibGVFbnRyeSA9IHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ3N5bWJvbCcsXG5cdFx0XHRcdFx0XHRcdGlkOiBKU09OLnN0cmluZ2lmeShpdGVtLnN5bWJvbC5sb2NhdGlvbiksXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBpdGVtLnN5bWJvbC5sb2NhdGlvbixcblx0XHRcdFx0XHRcdFx0c3ltYm9sS2luZDogaXRlbS5zeW1ib2wua2luZCxcblx0XHRcdFx0XHRcdFx0aWNvbjogU3ltYm9sS2luZHMudG9JY29uKGl0ZW0uc3ltYm9sLmtpbmQpLFxuXHRcdFx0XHRcdFx0XHRmdWxsTmFtZTogaXRlbS5sYWJlbCxcblx0XHRcdFx0XHRcdFx0bmFtZTogaXRlbS5zeW1ib2wubmFtZSxcblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGl0ZW0uc3ltYm9sLm5hbWUsXG5cdFx0XHRcdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKFN5bWJvbEtpbmRzLnRvSWNvbihpdGVtLnN5bWJvbC5raW5kKSksXG5cdFx0XHRcdFx0XHRcdGFzQXR0YWNobWVudCgpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gYXR0YWNobWVudDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSksXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBGaWxlc0FuZEZvbGRlcnNQaWNrZXJQaWNrIGltcGxlbWVudHMgSUNoYXRDb250ZXh0UGlja2VySXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdwaWNrZXJQaWNrJztcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQuZm9sZGVyJywgJ0ZpbGVzICYgRm9sZGVycy4uLicpO1xuXHRyZWFkb25seSBpY29uID0gQ29kaWNvbi5mb2xkZXI7XG5cdHJlYWRvbmx5IG9yZGluYWwgPSA2MDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTZWFyY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3NlYXJjaFNlcnZpY2U6IElTZWFyY2hTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9oaXN0b3J5U2VydmljZTogSUhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRhc1BpY2tlcigpIHtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2NoYXRDb250ZXh0LmF0dGFjaC5maWxlcy5wbGFjZWhvbGRlcicsIFwiU2VhcmNoIGZpbGUgb3IgZm9sZGVyIGJ5IG5hbWVcIiksXG5cdFx0XHRwaWNrczogcGlja3NXaXRoUHJvbWlzZUZuKGFzeW5jICh2YWx1ZSwgdG9rZW4pID0+IHtcblxuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VzID0gdGhpcy5fd29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSk7XG5cblx0XHRcdFx0Y29uc3QgZGVmYXVsdEl0ZW1zOiBJQ2hhdENvbnRleHRQaWNrZXJQaWNrSXRlbVtdID0gW107XG5cdFx0XHRcdChhd2FpdCBnZXRUb3BMZXZlbEZvbGRlcnMod29ya3NwYWNlcywgdGhpcy5fZmlsZVNlcnZpY2UpKS5mb3JFYWNoKHVyaSA9PiBkZWZhdWx0SXRlbXMucHVzaCh0aGlzLl9jcmVhdGVQaWNrSXRlbSh1cmksIEZpbGVLaW5kLkZPTERFUikpKTtcblx0XHRcdFx0dGhpcy5faGlzdG9yeVNlcnZpY2UuZ2V0SGlzdG9yeSgpXG5cdFx0XHRcdFx0LmZpbHRlcihhID0+IGEucmVzb3VyY2UgJiYgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gaXNTdXBwb3J0ZWRDaGF0RmlsZVNjaGVtZShhY2Nlc3NvciwgYS5yZXNvdXJjZSEuc2NoZW1lKSkpXG5cdFx0XHRcdFx0LnNsaWNlKDAsIDMwKVxuXHRcdFx0XHRcdC5mb3JFYWNoKHVyaSA9PiBkZWZhdWx0SXRlbXMucHVzaCh0aGlzLl9jcmVhdGVQaWNrSXRlbSh1cmkucmVzb3VyY2UhLCBGaWxlS2luZC5GSUxFKSkpO1xuXG5cdFx0XHRcdGlmICh2YWx1ZSA9PT0gJycpIHtcblx0XHRcdFx0XHRyZXR1cm4gZGVmYXVsdEl0ZW1zO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBJQ2hhdENvbnRleHRQaWNrZXJQaWNrSXRlbVtdID0gW107XG5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwod29ya3NwYWNlcy5tYXAoYXN5bmMgd29ya3NwYWNlID0+IHtcblx0XHRcdFx0XHRjb25zdCB7IGZvbGRlcnMsIGZpbGVzIH0gPSBhd2FpdCBzZWFyY2hGaWxlc0FuZEZvbGRlcnMoXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRcdFx0XHR2YWx1ZSxcblx0XHRcdFx0XHRcdHRydWUsXG5cdFx0XHRcdFx0XHR0b2tlbixcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRcdFx0dGhpcy5fc2VhcmNoU2VydmljZVxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBmb2xkZXJzKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLl9jcmVhdGVQaWNrSXRlbShmb2xkZXIsIEZpbGVLaW5kLkZPTERFUikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuX2NyZWF0ZVBpY2tJdGVtKGZpbGUsIEZpbGVLaW5kLkZJTEUpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRyZXN1bHQuc29ydCgoYSwgYikgPT4gY29tcGFyZShhLmxhYmVsLCBiLmxhYmVsKSk7XG5cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVQaWNrSXRlbShyZXNvdXJjZTogVVJJLCBraW5kOiBGaWxlS2luZCk6IElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IGJhc2VuYW1lKHJlc291cmNlKSxcblx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShyZXNvdXJjZSksIHsgcmVsYXRpdmU6IHRydWUgfSksXG5cdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXModGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UsIHJlc291cmNlLCBraW5kKSxcblx0XHRcdGFzQXR0YWNobWVudDogKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6IGtpbmQgPT09IEZpbGVLaW5kLkZJTEUgPyAnZmlsZScgOiAnZGlyZWN0b3J5Jyxcblx0XHRcdFx0XHRpZDogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR2YWx1ZTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUocmVzb3VyY2UpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxufVxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlYXJjaEZpbGVzQW5kRm9sZGVycyhcblx0d29ya3NwYWNlOiBVUkksXG5cdHBhdHRlcm46IHN0cmluZyxcblx0ZnV6enlNYXRjaDogYm9vbGVhbixcblx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkLFxuXHRjYWNoZUtleTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRzZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZVxuKTogUHJvbWlzZTx7IGZvbGRlcnM6IFVSSVtdOyBmaWxlczogVVJJW10gfT4ge1xuXHRjb25zdCBzZWdtZW50TWF0Y2hQYXR0ZXJuID0gZnV6enlNYXRjaCA/IGZ1enp5TWF0Y2hpbmdHbG9iUGF0dGVybihwYXR0ZXJuKSA6IGNvbnRpbm91c01hdGNoaW5nR2xvYlBhdHRlcm4ocGF0dGVybik7XG5cblx0Y29uc3Qgc2VhcmNoRXhjbHVkZVBhdHRlcm4gPSBnZXRFeGNsdWRlcyhjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvbj4oeyByZXNvdXJjZTogd29ya3NwYWNlIH0pKSB8fCB7fTtcblx0Y29uc3Qgc2VhcmNoT3B0aW9uczogSUZpbGVRdWVyeSA9IHtcblx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0Zm9sZGVyOiB3b3Jrc3BhY2UsXG5cdFx0XHRkaXNyZWdhcmRJZ25vcmVGaWxlczogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2V4cGxvcmVyLmV4Y2x1ZGVHaXRJZ25vcmUnKSxcblx0XHR9XSxcblx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRzaG91bGRHbG9iTWF0Y2hGaWxlUGF0dGVybjogdHJ1ZSxcblx0XHRjYWNoZUtleSxcblx0XHRleGNsdWRlUGF0dGVybjogc2VhcmNoRXhjbHVkZVBhdHRlcm4sXG5cdFx0c29ydEJ5U2NvcmU6IHRydWUsXG5cdFx0aWdub3JlR2xvYkNhc2U6IHRydWUsXG5cdH07XG5cblx0bGV0IHNlYXJjaFJlc3VsdDogSVNlYXJjaENvbXBsZXRlIHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdHNlYXJjaFJlc3VsdCA9IGF3YWl0IHNlYXJjaFNlcnZpY2UuZmlsZVNlYXJjaCh7IC4uLnNlYXJjaE9wdGlvbnMsIGZpbGVQYXR0ZXJuOiBgeyoqLyR7c2VnbWVudE1hdGNoUGF0dGVybn0vKiosKiovJHtzZWdtZW50TWF0Y2hQYXR0ZXJufX1gIH0sIHRva2VuKTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRpZiAoIXNlYXJjaFJlc3VsdCB8fCB0b2tlbj8uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRyZXR1cm4geyBmaWxlczogW10sIGZvbGRlcnM6IFtdIH07XG5cdH1cblxuXHRjb25zdCBmaWxlUmVzb3VyY2VzID0gc2VhcmNoUmVzdWx0LnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVzb3VyY2UpO1xuXHRjb25zdCBmb2xkZXJSZXNvdXJjZXMgPSBnZXRNYXRjaGluZ0ZvbGRlcnNGcm9tRmlsZXMoZmlsZVJlc291cmNlcywgd29ya3NwYWNlLCBzZWdtZW50TWF0Y2hQYXR0ZXJuKTtcblxuXHRyZXR1cm4geyBmb2xkZXJzOiBmb2xkZXJSZXNvdXJjZXMsIGZpbGVzOiBmaWxlUmVzb3VyY2VzIH07XG59XG5cbmZ1bmN0aW9uIGZ1enp5TWF0Y2hpbmdHbG9iUGF0dGVybihwYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIXBhdHRlcm4pIHtcblx0XHRyZXR1cm4gJyonO1xuXHR9XG5cdHJldHVybiAnKicgKyBwYXR0ZXJuLnNwbGl0KCcnKS5qb2luKCcqJykgKyAnKic7XG59XG5cbmZ1bmN0aW9uIGNvbnRpbm91c01hdGNoaW5nR2xvYlBhdHRlcm4ocGF0dGVybjogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFwYXR0ZXJuKSB7XG5cdFx0cmV0dXJuICcqJztcblx0fVxuXHRyZXR1cm4gJyonICsgcGF0dGVybiArICcqJztcbn1cblxuLy8gVE9ETzogcmVtb3ZlIHRoaXMgYW5kIGhhdmUgc3VwcG9ydCBmcm9tIHRoZSBzZWFyY2ggc2VydmljZVxuZnVuY3Rpb24gZ2V0TWF0Y2hpbmdGb2xkZXJzRnJvbUZpbGVzKHJlc291cmNlczogVVJJW10sIHdvcmtzcGFjZTogVVJJLCBzZWdtZW50TWF0Y2hQYXR0ZXJuOiBzdHJpbmcpOiBVUklbXSB7XG5cdGNvbnN0IHVuaXF1ZUZvbGRlcnMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZXNvdXJjZXMpIHtcblx0XHRjb25zdCByZWxhdGl2ZVBhdGhUb1Jvb3QgPSByZWxhdGl2ZVBhdGgod29ya3NwYWNlLCByZXNvdXJjZSk7XG5cdFx0aWYgKCFyZWxhdGl2ZVBhdGhUb1Jvb3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVzb3VyY2UgaXMgbm90IGEgY2hpbGQgb2YgdGhlIHdvcmtzcGFjZScpO1xuXHRcdH1cblxuXHRcdGxldCBkaXJSZXNvdXJjZSA9IHdvcmtzcGFjZTtcblx0XHRjb25zdCBzdGF0cyA9IHJlbGF0aXZlUGF0aFRvUm9vdC5zcGxpdCgnLycpLnNsaWNlKDAsIC0xKTtcblx0XHRmb3IgKGNvbnN0IHN0YXQgb2Ygc3RhdHMpIHtcblx0XHRcdGRpclJlc291cmNlID0gZGlyUmVzb3VyY2Uud2l0aCh7IHBhdGg6IGAke2RpclJlc291cmNlLnBhdGh9LyR7c3RhdH1gIH0pO1xuXHRcdFx0dW5pcXVlRm9sZGVycy5hZGQoZGlyUmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IG1hdGNoaW5nRm9sZGVyczogVVJJW10gPSBbXTtcblx0Zm9yIChjb25zdCBmb2xkZXJSZXNvdXJjZSBvZiB1bmlxdWVGb2xkZXJzKSB7XG5cdFx0Y29uc3Qgc3RhdHMgPSBmb2xkZXJSZXNvdXJjZS5wYXRoLnNwbGl0KCcvJyk7XG5cdFx0Y29uc3QgZGlyU3RhdCA9IHN0YXRzW3N0YXRzLmxlbmd0aCAtIDFdO1xuXHRcdGlmICghZGlyU3RhdCB8fCAhZ2xvYi5tYXRjaChzZWdtZW50TWF0Y2hQYXR0ZXJuLCBkaXJTdGF0LCB7IGlnbm9yZUNhc2U6IHRydWUgfSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdG1hdGNoaW5nRm9sZGVycy5wdXNoKGZvbGRlclJlc291cmNlKTtcblx0fVxuXG5cdHJldHVybiBtYXRjaGluZ0ZvbGRlcnM7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRUb3BMZXZlbEZvbGRlcnMod29ya3NwYWNlczogVVJJW10sIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPFVSSVtdPiB7XG5cdGNvbnN0IGZvbGRlcnM6IFVSSVtdID0gW107XG5cdGZvciAoY29uc3Qgd29ya3NwYWNlIG9mIHdvcmtzcGFjZXMpIHtcblx0XHRjb25zdCBmaWxlU3lzdGVtUHJvdmlkZXIgPSBmaWxlU2VydmljZS5nZXRQcm92aWRlcih3b3Jrc3BhY2Uuc2NoZW1lKTtcblx0XHRpZiAoIWZpbGVTeXN0ZW1Qcm92aWRlcikge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IGZpbGVTeXN0ZW1Qcm92aWRlci5yZWFkZGlyKHdvcmtzcGFjZSk7XG5cdFx0Zm9yIChjb25zdCBbbmFtZSwgdHlwZV0gb2YgZW50cmllcykge1xuXHRcdFx0Y29uc3QgZW50cnlSZXNvdXJjZSA9IGpvaW5QYXRoKHdvcmtzcGFjZSwgbmFtZSk7XG5cdFx0XHRpZiAodHlwZSA9PT0gRmlsZVR5cGUuRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGZvbGRlcnMucHVzaChlbnRyeVJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZm9sZGVycztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsYUFBZ0UsZ0JBQWdCLFdBQVcsZUFBZTtBQUNuSCxTQUFTLHFCQUFxQjtBQUM5QixTQUE2RCx5QkFBZ0QsMEJBQTBCO0FBRXZJLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsVUFBVSxTQUFTLFVBQVUsb0JBQW9CO0FBQzFELFNBQVMsZUFBZTtBQUV4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFVBQVUsVUFBVSxvQkFBb0I7QUFDakQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFDcEMsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsbUJBQW1C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
