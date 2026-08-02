import { dirname } from "../../../../base/common/resources.js";
import * as nls from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import * as Constants from "../common/constants.js";
import * as SearchEditorConstants from "../../searchEditor/browser/constants.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { resolveResourcesForSearchIncludes } from "../../../services/search/common/queryBuilder.js";
import { getMultiSelectedResources, IExplorerService } from "../../files/browser/files.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ExplorerFolderContext, ExplorerRootContext, FilesExplorerFocusCondition, VIEWLET_ID as VIEWLET_ID_FILES } from "../../files/common/files.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { category, findInFilesCommand, getElementsToOperateOn, getSearchView, openSearchView } from "./searchActionsBase.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { forcedExpandRecursively } from "./searchActionsTopBar.js";
import { isSearchTreeFileMatch, isSearchTreeMatch } from "./searchTreeModel/searchTreeCommon.js";
registerAction2(class RestrictSearchToFolderAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.RestrictSearchToFolderId,
      title: nls.localize2("restrictResultsToFolder", "Restrict Search to Folder"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ResourceFolderFocusKey),
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF
      },
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 3,
          when: ContextKeyExpr.and(Constants.SearchContext.ResourceFolderFocusKey)
        }
      ]
    });
  }
  async run(accessor, folderMatch) {
    await searchWithFolderCommand(accessor, false, true, void 0, folderMatch);
  }
});
registerAction2(class ExpandSelectedTreeCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ExpandRecursivelyCommandId,
      title: nls.localize("search.expandRecursively", "Expand Recursively"),
      category,
      menu: [{
        id: MenuId.SearchContext,
        when: ContextKeyExpr.and(
          Constants.SearchContext.FolderFocusKey,
          Constants.SearchContext.HasSearchResults
        ),
        group: "search",
        order: 4
      }]
    });
  }
  async run(accessor) {
    return expandSelectSubtree(accessor);
  }
});
registerAction2(class ExcludeFolderFromSearchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ExcludeFolderFromSearchId,
      title: nls.localize2("excludeFolderFromSearch", "Exclude Folder from Search"),
      category,
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 4,
          when: Constants.SearchContext.ResourceFolderFocusKey
        }
      ]
    });
  }
  async run(accessor, folderMatch) {
    await searchWithFolderCommand(accessor, false, false, void 0, folderMatch);
  }
});
registerAction2(class ExcludeFileTypeFromSearchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ExcludeFileTypeFromSearchId,
      title: nls.localize2("excludeFileTypeFromSearch", "Exclude File Type from Search"),
      category,
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 5,
          when: Constants.SearchContext.FileFocusKey
        }
      ]
    });
  }
  async run(accessor, fileMatch) {
    await modifySearchFileTypePattern(accessor, fileMatch, true);
  }
});
registerAction2(class IncludeFileTypeInSearchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.IncludeFileTypeInSearchId,
      title: nls.localize2("includeFileTypeInSearch", "Include File Type from Search"),
      category,
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 6,
          when: Constants.SearchContext.FileFocusKey
        }
      ]
    });
  }
  async run(accessor, fileMatch) {
    await modifySearchFileTypePattern(accessor, fileMatch, false);
  }
});
registerAction2(class RevealInSideBarForSearchResultsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.RevealInSideBarForSearchResults,
      title: nls.localize2("revealInSideBar", "Reveal in Explorer View"),
      category,
      menu: [{
        id: MenuId.SearchContext,
        when: ContextKeyExpr.and(Constants.SearchContext.FileFocusKey, Constants.SearchContext.HasSearchResults),
        group: "search_3",
        order: 1
      }]
    });
  }
  async run(accessor, args) {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const explorerService = accessor.get(IExplorerService);
    const contextService = accessor.get(IWorkspaceContextService);
    const searchView = getSearchView(accessor.get(IViewsService));
    if (!searchView) {
      return;
    }
    let fileMatch;
    if (isSearchTreeFileMatch(args)) {
      fileMatch = args;
    } else {
      args = searchView.getControl().getFocus()[0];
      return;
    }
    paneCompositeService.openPaneComposite(VIEWLET_ID_FILES, ViewContainerLocation.Sidebar, false).then((viewlet) => {
      if (!viewlet) {
        return;
      }
      const explorerViewContainer = viewlet.getViewPaneContainer();
      const uri = fileMatch.resource;
      if (uri && contextService.isInsideWorkspace(uri)) {
        const explorerView = explorerViewContainer.getExplorerView();
        explorerView.setExpanded(true);
        explorerService.select(uri, true).then(() => explorerView.focus(), onUnexpectedError);
      }
    });
  }
});
registerAction2(class FindInFilesAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FindInFilesActionId,
      title: {
        ...nls.localize2("findInFiles", "Find in Files"),
        mnemonicTitle: nls.localize({ key: "miFindInFiles", comment: ["&& denotes a mnemonic"] }, "Find &&in Files")
      },
      metadata: {
        description: nls.localize("findInFiles.description", "Open a workspace search"),
        args: [
          {
            name: nls.localize("findInFiles.args", "A set of options for the search"),
            schema: {
              type: "object",
              properties: {
                query: { "type": "string" },
                replace: { "type": "string" },
                preserveCase: { "type": "boolean" },
                triggerSearch: { "type": "boolean" },
                filesToInclude: { "type": "string" },
                filesToExclude: { "type": "string" },
                isRegex: { "type": "boolean" },
                isCaseSensitive: { "type": "boolean" },
                matchWholeWord: { "type": "boolean" },
                useExcludeSettingsAndIgnoreFiles: { "type": "boolean" },
                onlyOpenEditors: { "type": "boolean" },
                showIncludesExcludes: { "type": "boolean" }
              }
            }
          }
        ]
      },
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyF
      },
      menu: [{
        id: MenuId.MenubarEditMenu,
        group: "4_find_global",
        order: 1,
        when: IsSessionsWindowContext.negate()
      }],
      f1: true,
      precondition: IsSessionsWindowContext.negate()
    });
  }
  async run(accessor, args = {}) {
    findInFilesCommand(accessor, args);
  }
});
registerAction2(class FindInFolderAction extends Action2 {
  // from explorer
  constructor() {
    super({
      id: Constants.SearchCommandIds.FindInFolderId,
      title: nls.localize2("findInFolder", "Find in Folder..."),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(FilesExplorerFocusCondition, ExplorerFolderContext),
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF
      },
      menu: [
        {
          id: MenuId.ExplorerContext,
          group: "4_search",
          order: 10,
          when: ExplorerFolderContext
        }
      ]
    });
  }
  async run(accessor, resource) {
    await searchWithFolderCommand(accessor, true, true, resource);
  }
});
registerAction2(class FindInWorkspaceAction extends Action2 {
  // from explorer
  constructor() {
    super({
      id: Constants.SearchCommandIds.FindInWorkspaceId,
      title: nls.localize2("findInWorkspace", "Find in Workspace..."),
      category,
      menu: [
        {
          id: MenuId.ExplorerContext,
          group: "4_search",
          order: 10,
          when: ContextKeyExpr.and(ExplorerRootContext, ExplorerFolderContext.toNegated())
        }
      ]
    });
  }
  async run(accessor) {
    const searchConfig = accessor.get(IConfigurationService).getValue().search;
    const mode = searchConfig?.mode;
    if (mode === "view") {
      const searchView = await openSearchView(accessor.get(IViewsService), true);
      searchView?.searchInFolders();
    } else {
      await accessor.get(ICommandService).executeCommand(SearchEditorConstants.OpenEditorCommandId, {
        location: mode === "newEditor" ? "new" : "reuse",
        filesToInclude: ""
      });
    }
  }
});
async function expandSelectSubtree(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  if (searchView) {
    const viewer = searchView.getControl();
    const selected = viewer.getFocus()[0];
    await forcedExpandRecursively(viewer, selected);
  }
}
function extractSearchFilePattern(fileName) {
  const parts = fileName.split(".");
  if (parts.length <= 1) {
    return fileName;
  }
  const extensionParts = parts.slice(1);
  return `*.${extensionParts.join(".")}`;
}
function mergeSearchPatternIfNotExists(currentPatterns, newPattern) {
  if (!currentPatterns.trim()) {
    return newPattern;
  }
  const existingPatterns = currentPatterns.split(",").map((pattern) => pattern.trim()).filter((pattern) => pattern.length > 0);
  if (existingPatterns.includes(newPattern)) {
    return currentPatterns;
  }
  return `${currentPatterns}, ${newPattern}`;
}
async function searchWithFolderCommand(accessor, isFromExplorer, isIncludes, resource, folderMatch) {
  const fileService = accessor.get(IFileService);
  const viewsService = accessor.get(IViewsService);
  const contextService = accessor.get(IWorkspaceContextService);
  const commandService = accessor.get(ICommandService);
  const searchConfig = accessor.get(IConfigurationService).getValue().search;
  const mode = searchConfig?.mode;
  let resources;
  if (isFromExplorer) {
    resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
  } else {
    const searchView = getSearchView(viewsService);
    if (!searchView) {
      return;
    }
    resources = getMultiSelectedSearchResources(searchView.getControl(), folderMatch, searchConfig);
  }
  const resolvedResources = fileService.resolveAll(resources.map((resource2) => ({ resource: resource2 }))).then((results) => {
    const folders = [];
    results.forEach((result) => {
      if (result.success && result.stat) {
        folders.push(result.stat.isDirectory ? result.stat.resource : dirname(result.stat.resource));
      }
    });
    return resolveResourcesForSearchIncludes(folders, contextService);
  });
  if (mode === "view") {
    const searchView = await openSearchView(viewsService, true);
    if (resources && resources.length && searchView) {
      if (isIncludes) {
        searchView.searchInFolders(await resolvedResources);
      } else {
        searchView.searchOutsideOfFolders(await resolvedResources);
      }
    }
    return void 0;
  } else {
    if (isIncludes) {
      return commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, {
        filesToInclude: (await resolvedResources).join(", "),
        showIncludesExcludes: true,
        location: mode === "newEditor" ? "new" : "reuse"
      });
    } else {
      return commandService.executeCommand(SearchEditorConstants.OpenEditorCommandId, {
        filesToExclude: (await resolvedResources).join(", "),
        showIncludesExcludes: true,
        location: mode === "newEditor" ? "new" : "reuse"
      });
    }
  }
}
function getMultiSelectedSearchResources(viewer, currElement, sortConfig) {
  return getElementsToOperateOn(viewer, currElement, sortConfig).map((renderableMatch) => isSearchTreeMatch(renderableMatch) ? null : renderableMatch.resource).filter((renderableMatch) => renderableMatch !== null);
}
async function modifySearchFileTypePattern(accessor, fileMatch, isExclude) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  if (!searchView || !fileMatch) {
    return;
  }
  const resource = fileMatch.resource;
  const fileName = resource.path.split("/").pop() || "";
  const newPattern = extractSearchFilePattern(fileName);
  const patternWidget = isExclude ? searchView.searchExcludePattern : searchView.searchIncludePattern;
  const currentPatterns = patternWidget.getValue();
  const updatedPatterns = mergeSearchPatternIfNotExists(currentPatterns, newPattern);
  if (updatedPatterns !== currentPatterns) {
    patternWidget.setValue(updatedPatterns);
    searchView.toggleQueryDetails(false, true);
    searchView.triggerQueryChange({ preserveFocus: false });
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaEFjdGlvbnNGaW5kLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIENvbnN0YW50cyBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCAqIGFzIFNlYXJjaEVkaXRvckNvbnN0YW50cyBmcm9tICcuLi8uLi9zZWFyY2hFZGl0b3IvYnJvd3Nlci9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVNlYXJjaENvbmZpZ3VyYXRpb24sIElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IHJlc29sdmVSZXNvdXJjZXNGb3JTZWFyY2hJbmNsdWRlcyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vcXVlcnlCdWlsZGVyLmpzJztcbmltcG9ydCB7IGdldE11bHRpU2VsZWN0ZWRSZXNvdXJjZXMsIElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9icm93c2VyL2ZpbGVzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlckZvbGRlckNvbnRleHQsIEV4cGxvcmVyUm9vdENvbnRleHQsIEZpbGVzRXhwbG9yZXJGb2N1c0NvbmRpdGlvbiwgVklFV0xFVF9JRCBhcyBWSUVXTEVUX0lEX0ZJTEVTIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBFeHBsb3JlclZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vZmlsZXMvYnJvd3Nlci9leHBsb3JlclZpZXdsZXQuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgY2F0ZWdvcnksIGZpbmRJbkZpbGVzQ29tbWFuZCwgZ2V0RWxlbWVudHNUb09wZXJhdGVPbiwgZ2V0U2VhcmNoVmlldywgSUZpbmRJbkZpbGVzQXJncywgb3BlblNlYXJjaFZpZXcgfSBmcm9tICcuL3NlYXJjaEFjdGlvbnNCYXNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGZvcmNlZEV4cGFuZFJlY3Vyc2l2ZWx5IH0gZnJvbSAnLi9zZWFyY2hBY3Rpb25zVG9wQmFyLmpzJztcbmltcG9ydCB7IFJlbmRlcmFibGVNYXRjaCwgSVNlYXJjaFRyZWVGaWxlTWF0Y2gsIElTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2UsIElTZWFyY2hSZXN1bHQsIGlzU2VhcmNoVHJlZUZpbGVNYXRjaCwgaXNTZWFyY2hUcmVlTWF0Y2ggfSBmcm9tICcuL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hUcmVlQ29tbW9uLmpzJztcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc3RyaWN0U2VhcmNoVG9Gb2xkZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlJlc3RyaWN0U2VhcmNoVG9Gb2xkZXJJZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZXN0cmljdFJlc3VsdHNUb0ZvbGRlcicsIFwiUmVzdHJpY3QgU2VhcmNoIHRvIEZvbGRlclwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdWaXNpYmxlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXNvdXJjZUZvbGRlckZvY3VzS2V5KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNlYXJjaENvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICdzZWFyY2gnLFxuXHRcdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXNvdXJjZUZvbGRlckZvY3VzS2V5KVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBmb2xkZXJNYXRjaD86IElTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2UpIHtcblx0XHRhd2FpdCBzZWFyY2hXaXRoRm9sZGVyQ29tbWFuZChhY2Nlc3NvciwgZmFsc2UsIHRydWUsIHVuZGVmaW5lZCwgZm9sZGVyTWF0Y2gpO1xuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhwYW5kU2VsZWN0ZWRUcmVlQ29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3Rvcihcblx0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkV4cGFuZFJlY3Vyc2l2ZWx5Q29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2VhcmNoLmV4cGFuZFJlY3Vyc2l2ZWx5JywgXCJFeHBhbmQgUmVjdXJzaXZlbHlcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuU2VhcmNoQ29udGV4dCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZvbGRlckZvY3VzS2V5LFxuXHRcdFx0XHRcdENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHNcblx0XHRcdFx0KSxcblx0XHRcdFx0Z3JvdXA6ICdzZWFyY2gnLFxuXHRcdFx0XHRvcmRlcjogNFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogYW55KSB7XG5cdFx0cmV0dXJuIGV4cGFuZFNlbGVjdFN1YnRyZWUoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4Y2x1ZGVGb2xkZXJGcm9tU2VhcmNoQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5FeGNsdWRlRm9sZGVyRnJvbVNlYXJjaElkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2V4Y2x1ZGVGb2xkZXJGcm9tU2VhcmNoJywgXCJFeGNsdWRlIEZvbGRlciBmcm9tIFNlYXJjaFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TZWFyY2hDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnc2VhcmNoJyxcblx0XHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0XHR3aGVuOiBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXNvdXJjZUZvbGRlckZvY3VzS2V5XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZvbGRlck1hdGNoPzogSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZSkge1xuXHRcdGF3YWl0IHNlYXJjaFdpdGhGb2xkZXJDb21tYW5kKGFjY2Vzc29yLCBmYWxzZSwgZmFsc2UsIHVuZGVmaW5lZCwgZm9sZGVyTWF0Y2gpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4Y2x1ZGVGaWxlVHlwZUZyb21TZWFyY2hBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkV4Y2x1ZGVGaWxlVHlwZUZyb21TZWFyY2hJZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdleGNsdWRlRmlsZVR5cGVGcm9tU2VhcmNoJywgXCJFeGNsdWRlIEZpbGUgVHlwZSBmcm9tIFNlYXJjaFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TZWFyY2hDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnc2VhcmNoJyxcblx0XHRcdFx0XHRvcmRlcjogNSxcblx0XHRcdFx0XHR3aGVuOiBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlRm9jdXNLZXlcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZmlsZU1hdGNoPzogSVNlYXJjaFRyZWVGaWxlTWF0Y2gpIHtcblx0XHRhd2FpdCBtb2RpZnlTZWFyY2hGaWxlVHlwZVBhdHRlcm4oYWNjZXNzb3IsIGZpbGVNYXRjaCwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgSW5jbHVkZUZpbGVUeXBlSW5TZWFyY2hBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkluY2x1ZGVGaWxlVHlwZUluU2VhcmNoSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignaW5jbHVkZUZpbGVUeXBlSW5TZWFyY2gnLCBcIkluY2x1ZGUgRmlsZSBUeXBlIGZyb20gU2VhcmNoXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNlYXJjaENvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICdzZWFyY2gnLFxuXHRcdFx0XHRcdG9yZGVyOiA2LFxuXHRcdFx0XHRcdHdoZW46IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVGb2N1c0tleVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBmaWxlTWF0Y2g/OiBJU2VhcmNoVHJlZUZpbGVNYXRjaCkge1xuXHRcdGF3YWl0IG1vZGlmeVNlYXJjaEZpbGVUeXBlUGF0dGVybihhY2Nlc3NvciwgZmlsZU1hdGNoLCBmYWxzZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmV2ZWFsSW5TaWRlQmFyRm9yU2VhcmNoUmVzdWx0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuUmV2ZWFsSW5TaWRlQmFyRm9yU2VhcmNoUmVzdWx0cyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdyZXZlYWxJblNpZGVCYXInLCBcIlJldmVhbCBpbiBFeHBsb3JlciBWaWV3XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlNlYXJjaENvbnRleHQsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlRm9jdXNLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMpLFxuXHRcdFx0XHRncm91cDogJ3NlYXJjaF8zJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogYW55KTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBwYW5lQ29tcG9zaXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlKTtcblx0XHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0aWYgKCFzZWFyY2hWaWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGZpbGVNYXRjaDogSVNlYXJjaFRyZWVGaWxlTWF0Y2g7XG5cdFx0aWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChhcmdzKSkge1xuXHRcdFx0ZmlsZU1hdGNoID0gYXJncztcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJncyA9IHNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLmdldEZvY3VzKClbMF07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUoVklFV0xFVF9JRF9GSUxFUywgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIGZhbHNlKS50aGVuKCh2aWV3bGV0KSA9PiB7XG5cdFx0XHRpZiAoIXZpZXdsZXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBleHBsb3JlclZpZXdDb250YWluZXIgPSB2aWV3bGV0LmdldFZpZXdQYW5lQ29udGFpbmVyKCkgYXMgRXhwbG9yZXJWaWV3UGFuZUNvbnRhaW5lcjtcblx0XHRcdGNvbnN0IHVyaSA9IGZpbGVNYXRjaC5yZXNvdXJjZTtcblx0XHRcdGlmICh1cmkgJiYgY29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UodXJpKSkge1xuXHRcdFx0XHRjb25zdCBleHBsb3JlclZpZXcgPSBleHBsb3JlclZpZXdDb250YWluZXIuZ2V0RXhwbG9yZXJWaWV3KCk7XG5cdFx0XHRcdGV4cGxvcmVyVmlldy5zZXRFeHBhbmRlZCh0cnVlKTtcblx0XHRcdFx0ZXhwbG9yZXJTZXJ2aWNlLnNlbGVjdCh1cmksIHRydWUpLnRoZW4oKCkgPT4gZXhwbG9yZXJWaWV3LmZvY3VzKCksIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufSk7XG5cbi8vIEZpbmQgaW4gRmlsZXMgYnkgZGVmYXVsdCBpcyB0aGUgc2FtZSBhcyBWaWV3OiBTaG93IFNlYXJjaCwgYnV0IGNhbiBiZSBjb25maWd1cmVkIHRvIG9wZW4gYSBzZWFyY2ggZWRpdG9yIGluc3RlYWQgd2l0aCB0aGUgYHNlYXJjaC5tb2RlYCBiaW5kaW5nXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRmluZEluRmlsZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkZpbmRJbkZpbGVzQWN0aW9uSWQsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5ubHMubG9jYWxpemUyKCdmaW5kSW5GaWxlcycsIFwiRmluZCBpbiBGaWxlc1wiKSxcblx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlGaW5kSW5GaWxlcycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJGaW5kICYmaW4gRmlsZXNcIiksXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZEluRmlsZXMuZGVzY3JpcHRpb24nLCBcIk9wZW4gYSB3b3Jrc3BhY2Ugc2VhcmNoXCIpLFxuXHRcdFx0XHRhcmdzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplKCdmaW5kSW5GaWxlcy5hcmdzJywgXCJBIHNldCBvZiBvcHRpb25zIGZvciB0aGUgc2VhcmNoXCIpLFxuXHRcdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0cXVlcnk6IHsgJ3R5cGUnOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRcdHJlcGxhY2U6IHsgJ3R5cGUnOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRcdHByZXNlcnZlQ2FzZTogeyAndHlwZSc6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdFx0XHRcdHRyaWdnZXJTZWFyY2g6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0XHRcdFx0XHRmaWxlc1RvSW5jbHVkZTogeyAndHlwZSc6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRcdFx0ZmlsZXNUb0V4Y2x1ZGU6IHsgJ3R5cGUnOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRcdGlzUmVnZXg6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0XHRcdFx0XHRpc0Nhc2VTZW5zaXRpdmU6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0XHRcdFx0XHRtYXRjaFdob2xlV29yZDogeyAndHlwZSc6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdFx0XHRcdHVzZUV4Y2x1ZGVTZXR0aW5nc0FuZElnbm9yZUZpbGVzOiB7ICd0eXBlJzogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdFx0XHRcdFx0b25seU9wZW5FZGl0b3JzOiB7ICd0eXBlJzogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdFx0XHRcdFx0c2hvd0luY2x1ZGVzRXhjbHVkZXM6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUYsXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRWRpdE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnNF9maW5kX2dsb2JhbCcsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdH1dLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpXG5cdFx0fSk7XG5cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogSUZpbmRJbkZpbGVzQXJncyA9IHt9KTogUHJvbWlzZTxhbnk+IHtcblx0XHRmaW5kSW5GaWxlc0NvbW1hbmQoYWNjZXNzb3IsIGFyZ3MpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZpbmRJbkZvbGRlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHQvLyBmcm9tIGV4cGxvcmVyXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5GaW5kSW5Gb2xkZXJJZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdmaW5kSW5Gb2xkZXInLCBcIkZpbmQgaW4gRm9sZGVyLi4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRmlsZXNFeHBsb3JlckZvY3VzQ29uZGl0aW9uLCBFeHBsb3JlckZvbGRlckNvbnRleHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlGLFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRXhwbG9yZXJDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnNF9zZWFyY2gnLFxuXHRcdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0XHR3aGVuOiBFeHBsb3JlckZvbGRlckNvbnRleHRcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U/OiBVUkkpIHtcblx0XHRhd2FpdCBzZWFyY2hXaXRoRm9sZGVyQ29tbWFuZChhY2Nlc3NvciwgdHJ1ZSwgdHJ1ZSwgcmVzb3VyY2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZpbmRJbldvcmtzcGFjZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHQvLyBmcm9tIGV4cGxvcmVyXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5GaW5kSW5Xb3Jrc3BhY2VJZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdmaW5kSW5Xb3Jrc3BhY2UnLCBcIkZpbmQgaW4gV29ya3NwYWNlLi4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkV4cGxvcmVyQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJzRfc2VhcmNoJyxcblx0XHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEV4cGxvcmVyUm9vdENvbnRleHQsIEV4cGxvcmVyRm9sZGVyQ29udGV4dC50b05lZ2F0ZWQoKSlcblxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2VhcmNoQ29uZmlnID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KCkuc2VhcmNoO1xuXHRcdGNvbnN0IG1vZGUgPSBzZWFyY2hDb25maWc/Lm1vZGU7XG5cblx0XHRpZiAobW9kZSA9PT0gJ3ZpZXcnKSB7XG5cdFx0XHRjb25zdCBzZWFyY2hWaWV3ID0gYXdhaXQgb3BlblNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLCB0cnVlKTtcblx0XHRcdHNlYXJjaFZpZXc/LnNlYXJjaEluRm9sZGVycygpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdGF3YWl0IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpLmV4ZWN1dGVDb21tYW5kKFNlYXJjaEVkaXRvckNvbnN0YW50cy5PcGVuRWRpdG9yQ29tbWFuZElkLCB7XG5cdFx0XHRcdGxvY2F0aW9uOiBtb2RlID09PSAnbmV3RWRpdG9yJyA/ICduZXcnIDogJ3JldXNlJyxcblx0XHRcdFx0ZmlsZXNUb0luY2x1ZGU6ICcnLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8jcmVnaW9uIEhlbHBlcnNcbmFzeW5jIGZ1bmN0aW9uIGV4cGFuZFNlbGVjdFN1YnRyZWUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyh2aWV3c1NlcnZpY2UpO1xuXHRpZiAoc2VhcmNoVmlldykge1xuXHRcdGNvbnN0IHZpZXdlciA9IHNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gdmlld2VyLmdldEZvY3VzKClbMF07XG5cdFx0YXdhaXQgZm9yY2VkRXhwYW5kUmVjdXJzaXZlbHkodmlld2VyLCBzZWxlY3RlZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZXh0cmFjdFNlYXJjaEZpbGVQYXR0ZXJuKGZpbGVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBwYXJ0cyA9IGZpbGVOYW1lLnNwbGl0KCcuJyk7XG5cblx0aWYgKHBhcnRzLmxlbmd0aCA8PSAxKSB7XG5cdFx0cmV0dXJuIGZpbGVOYW1lO1xuXHR9XG5cblx0Y29uc3QgZXh0ZW5zaW9uUGFydHMgPSBwYXJ0cy5zbGljZSgxKTtcblx0cmV0dXJuIGAqLiR7ZXh0ZW5zaW9uUGFydHMuam9pbignLicpfWA7XG59XG5cbmZ1bmN0aW9uIG1lcmdlU2VhcmNoUGF0dGVybklmTm90RXhpc3RzKGN1cnJlbnRQYXR0ZXJuczogc3RyaW5nLCBuZXdQYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoIWN1cnJlbnRQYXR0ZXJucy50cmltKCkpIHtcblx0XHRyZXR1cm4gbmV3UGF0dGVybjtcblx0fVxuXG5cdGNvbnN0IGV4aXN0aW5nUGF0dGVybnMgPSBjdXJyZW50UGF0dGVybnMuc3BsaXQoJywnKS5tYXAocGF0dGVybiA9PiBwYXR0ZXJuLnRyaW0oKSkuZmlsdGVyKHBhdHRlcm4gPT4gcGF0dGVybi5sZW5ndGggPiAwKTtcblxuXHRpZiAoZXhpc3RpbmdQYXR0ZXJucy5pbmNsdWRlcyhuZXdQYXR0ZXJuKSkge1xuXHRcdHJldHVybiBjdXJyZW50UGF0dGVybnM7XG5cdH1cblxuXHRyZXR1cm4gYCR7Y3VycmVudFBhdHRlcm5zfSwgJHtuZXdQYXR0ZXJufWA7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHNlYXJjaFdpdGhGb2xkZXJDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBpc0Zyb21FeHBsb3JlcjogYm9vbGVhbiwgaXNJbmNsdWRlczogYm9vbGVhbiwgcmVzb3VyY2U/OiBVUkksIGZvbGRlck1hdGNoPzogSVNlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZSkge1xuXHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdGNvbnN0IHNlYXJjaENvbmZpZyA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPigpLnNlYXJjaDtcblx0Y29uc3QgbW9kZSA9IHNlYXJjaENvbmZpZz8ubW9kZTtcblxuXHRsZXQgcmVzb3VyY2VzOiBVUklbXTtcblxuXHRpZiAoaXNGcm9tRXhwbG9yZXIpIHtcblx0XHRyZXNvdXJjZXMgPSBnZXRNdWx0aVNlbGVjdGVkUmVzb3VyY2VzKHJlc291cmNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpKTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyh2aWV3c1NlcnZpY2UpO1xuXHRcdGlmICghc2VhcmNoVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXNvdXJjZXMgPSBnZXRNdWx0aVNlbGVjdGVkU2VhcmNoUmVzb3VyY2VzKHNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLCBmb2xkZXJNYXRjaCwgc2VhcmNoQ29uZmlnKTtcblx0fVxuXG5cdGNvbnN0IHJlc29sdmVkUmVzb3VyY2VzID0gZmlsZVNlcnZpY2UucmVzb2x2ZUFsbChyZXNvdXJjZXMubWFwKHJlc291cmNlID0+ICh7IHJlc291cmNlIH0pKSkudGhlbihyZXN1bHRzID0+IHtcblx0XHRjb25zdCBmb2xkZXJzOiBVUklbXSA9IFtdO1xuXHRcdHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdC5zdWNjZXNzICYmIHJlc3VsdC5zdGF0KSB7XG5cdFx0XHRcdGZvbGRlcnMucHVzaChyZXN1bHQuc3RhdC5pc0RpcmVjdG9yeSA/IHJlc3VsdC5zdGF0LnJlc291cmNlIDogZGlybmFtZShyZXN1bHQuc3RhdC5yZXNvdXJjZSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiByZXNvbHZlUmVzb3VyY2VzRm9yU2VhcmNoSW5jbHVkZXMoZm9sZGVycywgY29udGV4dFNlcnZpY2UpO1xuXHR9KTtcblxuXHRpZiAobW9kZSA9PT0gJ3ZpZXcnKSB7XG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGF3YWl0IG9wZW5TZWFyY2hWaWV3KHZpZXdzU2VydmljZSwgdHJ1ZSk7XG5cdFx0aWYgKHJlc291cmNlcyAmJiByZXNvdXJjZXMubGVuZ3RoICYmIHNlYXJjaFZpZXcpIHtcblx0XHRcdGlmIChpc0luY2x1ZGVzKSB7XG5cdFx0XHRcdHNlYXJjaFZpZXcuc2VhcmNoSW5Gb2xkZXJzKGF3YWl0IHJlc29sdmVkUmVzb3VyY2VzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlYXJjaFZpZXcuc2VhcmNoT3V0c2lkZU9mRm9sZGVycyhhd2FpdCByZXNvbHZlZFJlc291cmNlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH0gZWxzZSB7XG5cdFx0aWYgKGlzSW5jbHVkZXMpIHtcblx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTZWFyY2hFZGl0b3JDb25zdGFudHMuT3BlbkVkaXRvckNvbW1hbmRJZCwge1xuXHRcdFx0XHRmaWxlc1RvSW5jbHVkZTogKGF3YWl0IHJlc29sdmVkUmVzb3VyY2VzKS5qb2luKCcsICcpLFxuXHRcdFx0XHRzaG93SW5jbHVkZXNFeGNsdWRlczogdHJ1ZSxcblx0XHRcdFx0bG9jYXRpb246IG1vZGUgPT09ICduZXdFZGl0b3InID8gJ25ldycgOiAncmV1c2UnLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNlYXJjaEVkaXRvckNvbnN0YW50cy5PcGVuRWRpdG9yQ29tbWFuZElkLCB7XG5cdFx0XHRcdGZpbGVzVG9FeGNsdWRlOiAoYXdhaXQgcmVzb2x2ZWRSZXNvdXJjZXMpLmpvaW4oJywgJyksXG5cdFx0XHRcdHNob3dJbmNsdWRlc0V4Y2x1ZGVzOiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbjogbW9kZSA9PT0gJ25ld0VkaXRvcicgPyAnbmV3JyA6ICdyZXVzZScsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0TXVsdGlTZWxlY3RlZFNlYXJjaFJlc291cmNlcyh2aWV3ZXI6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNlYXJjaFJlc3VsdCwgUmVuZGVyYWJsZU1hdGNoLCB2b2lkPiwgY3VyckVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCB8IHVuZGVmaW5lZCwgc29ydENvbmZpZzogSVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHwgdW5kZWZpbmVkKTogVVJJW10ge1xuXHRyZXR1cm4gZ2V0RWxlbWVudHNUb09wZXJhdGVPbih2aWV3ZXIsIGN1cnJFbGVtZW50LCBzb3J0Q29uZmlnKVxuXHRcdC5tYXAoKHJlbmRlcmFibGVNYXRjaCkgPT4gKChpc1NlYXJjaFRyZWVNYXRjaChyZW5kZXJhYmxlTWF0Y2gpKSA/IG51bGwgOiByZW5kZXJhYmxlTWF0Y2gucmVzb3VyY2UpKVxuXHRcdC5maWx0ZXIoKHJlbmRlcmFibGVNYXRjaCk6IHJlbmRlcmFibGVNYXRjaCBpcyBVUkkgPT4gKHJlbmRlcmFibGVNYXRjaCAhPT0gbnVsbCkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBtb2RpZnlTZWFyY2hGaWxlVHlwZVBhdHRlcm4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZpbGVNYXRjaDogSVNlYXJjaFRyZWVGaWxlTWF0Y2ggfCB1bmRlZmluZWQsIGlzRXhjbHVkZTogYm9vbGVhbikge1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KHZpZXdzU2VydmljZSk7XG5cblx0aWYgKCFzZWFyY2hWaWV3IHx8ICFmaWxlTWF0Y2gpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCByZXNvdXJjZSA9IGZpbGVNYXRjaC5yZXNvdXJjZTtcblx0Y29uc3QgZmlsZU5hbWUgPSByZXNvdXJjZS5wYXRoLnNwbGl0KCcvJykucG9wKCkgfHwgJyc7XG5cblx0Y29uc3QgbmV3UGF0dGVybiA9IGV4dHJhY3RTZWFyY2hGaWxlUGF0dGVybihmaWxlTmFtZSk7XG5cdGNvbnN0IHBhdHRlcm5XaWRnZXQgPSBpc0V4Y2x1ZGUgPyBzZWFyY2hWaWV3LnNlYXJjaEV4Y2x1ZGVQYXR0ZXJuIDogc2VhcmNoVmlldy5zZWFyY2hJbmNsdWRlUGF0dGVybjtcblx0Y29uc3QgY3VycmVudFBhdHRlcm5zID0gcGF0dGVybldpZGdldC5nZXRWYWx1ZSgpO1xuXHRjb25zdCB1cGRhdGVkUGF0dGVybnMgPSBtZXJnZVNlYXJjaFBhdHRlcm5JZk5vdEV4aXN0cyhjdXJyZW50UGF0dGVybnMsIG5ld1BhdHRlcm4pO1xuXG5cdGlmICh1cGRhdGVkUGF0dGVybnMgIT09IGN1cnJlbnRQYXR0ZXJucykge1xuXHRcdHBhdHRlcm5XaWRnZXQuc2V0VmFsdWUodXBkYXRlZFBhdHRlcm5zKTtcblx0XHRzZWFyY2hWaWV3LnRvZ2dsZVF1ZXJ5RGV0YWlscyhmYWxzZSwgdHJ1ZSk7XG5cdFx0c2VhcmNoVmlldy50cmlnZ2VyUXVlcnlDaGFuZ2UoeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9KTtcblx0fVxufVxuXG5cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsU0FBUyxlQUFlO0FBQ3hCLFlBQVksU0FBUztBQUNyQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLG9CQUF3RDtBQUNqRSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixZQUFZLGVBQWU7QUFDM0IsWUFBWSwyQkFBMkI7QUFHdkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsMkJBQTJCLHdCQUF3QjtBQUM1RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVCQUF1QixxQkFBcUIsNkJBQTZCLGNBQWMsd0JBQXdCO0FBQ3hILFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsVUFBVSxvQkFBb0Isd0JBQXdCLGVBQWlDLHNCQUFzQjtBQUN0SCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUFtRyx1QkFBdUIseUJBQXlC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
