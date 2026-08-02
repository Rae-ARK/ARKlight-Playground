import * as nls from "../../../../nls.js";
import { WorkbenchListFocusContextKey } from "../../../../platform/list/browser/listService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { searchClearIcon, searchCollapseAllIcon, searchExpandAllIcon, searchRefreshIcon, searchShowAsList, searchShowAsTree, searchStopIcon } from "./searchIcons.js";
import * as Constants from "../common/constants.js";
import { ISearchHistoryService } from "../common/searchHistoryService.js";
import { VIEW_ID } from "../../../services/search/common/search.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { SearchStateKey, SearchUIState } from "../common/search.js";
import { category, getSearchView } from "./searchActionsBase.js";
import { isSearchTreeMatch, isSearchTreeFolderMatch, isSearchTreeFolderMatchNoRoot, isSearchTreeFolderMatchWorkspaceRoot, isSearchResult, isTextSearchHeading, isSearchTreeFileMatch } from "./searchTreeModel/searchTreeCommon.js";
registerAction2(class ClearSearchHistoryCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ClearSearchHistoryCommandId,
      title: nls.localize2("clearSearchHistoryLabel", "Clear Search History"),
      category,
      f1: true
    });
  }
  async run(accessor) {
    clearHistoryCommand(accessor);
  }
});
registerAction2(class CancelSearchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.CancelSearchActionId,
      title: nls.localize2("CancelSearchAction.label", "Cancel Search"),
      icon: searchStopIcon,
      category,
      f1: true,
      precondition: SearchStateKey.isEqualTo(SearchUIState.Idle).negate(),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, WorkbenchListFocusContextKey),
        primary: KeyCode.Escape
      },
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), SearchStateKey.isEqualTo(SearchUIState.SlowSearch))
      }]
    });
  }
  run(accessor) {
    return cancelSearch(accessor);
  }
});
registerAction2(class RefreshAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.RefreshSearchResultsActionId,
      title: nls.localize2("RefreshAction.label", "Refresh"),
      icon: searchRefreshIcon,
      precondition: Constants.SearchContext.ViewHasSearchPatternKey,
      category,
      f1: true,
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), SearchStateKey.isEqualTo(SearchUIState.SlowSearch).negate())
      }]
    });
  }
  run(accessor, ...args) {
    return refreshSearch(accessor);
  }
});
registerAction2(class CollapseDeepestExpandedLevelAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.CollapseSearchResultsActionId,
      title: nls.localize2("CollapseDeepestExpandedLevelAction.label", "Collapse All"),
      category,
      icon: searchCollapseAllIcon,
      f1: true,
      precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 4,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), ContextKeyExpr.or(Constants.SearchContext.HasSearchResults.negate(), Constants.SearchContext.ViewHasSomeCollapsibleKey))
      }]
    });
  }
  run(accessor, ...args) {
    return collapseDeepestExpandedLevel(accessor);
  }
});
registerAction2(class ExpandAllAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ExpandSearchResultsActionId,
      title: nls.localize2("ExpandAllAction.label", "Expand All"),
      category,
      icon: searchExpandAllIcon,
      f1: true,
      precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey.toNegated()),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 4,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSomeCollapsibleKey.toNegated())
      }]
    });
  }
  async run(accessor, ...args) {
    return expandAll(accessor);
  }
});
registerAction2(class ClearSearchResultsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ClearSearchResultsActionId,
      title: nls.localize2("ClearSearchResultsAction.label", "Clear Search Results"),
      category,
      icon: searchClearIcon,
      f1: true,
      precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, Constants.SearchContext.ViewHasSearchPatternKey, Constants.SearchContext.ViewHasReplacePatternKey, Constants.SearchContext.ViewHasFilePatternKey),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 1,
        when: ContextKeyExpr.equals("view", VIEW_ID)
      }]
    });
  }
  run(accessor, ...args) {
    return clearSearchResults(accessor);
  }
});
registerAction2(class ViewAsTreeAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ViewAsTreeActionId,
      title: nls.localize2("ViewAsTreeAction.label", "View as Tree"),
      category,
      icon: searchShowAsList,
      f1: true,
      precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.InTreeViewKey.toNegated()),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), Constants.SearchContext.InTreeViewKey.toNegated())
      }]
    });
  }
  async run(accessor, ...args) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      await searchView.setTreeView(true);
    }
  }
});
registerAction2(class ViewAsListAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ViewAsListActionId,
      title: nls.localize2("ViewAsListAction.label", "View as List"),
      category,
      icon: searchShowAsTree,
      f1: true,
      precondition: ContextKeyExpr.and(Constants.SearchContext.HasSearchResults, Constants.SearchContext.InTreeViewKey),
      menu: [{
        id: MenuId.ViewTitle,
        group: "navigation",
        order: 2,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_ID), Constants.SearchContext.InTreeViewKey)
      }]
    });
  }
  async run(accessor, ...args) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      await searchView.setTreeView(false);
    }
  }
});
registerAction2(class SearchWithAIAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.SearchWithAIActionId,
      title: nls.localize2("SearchWithAIAction.label", "Search with AI"),
      category,
      f1: true,
      precondition: Constants.SearchContext.hasAIResultProvider,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.hasAIResultProvider, Constants.SearchContext.SearchViewFocusedKey),
        primary: KeyMod.CtrlCmd | KeyCode.KeyI
      }
    });
  }
  async run(accessor, ...args) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      searchView.requestAIResults();
    }
  }
});
const clearHistoryCommand = (accessor) => {
  const searchHistoryService = accessor.get(ISearchHistoryService);
  searchHistoryService.clearHistory();
};
async function expandAll(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  if (searchView) {
    const viewer = searchView.getControl();
    await forcedExpandRecursively(viewer, void 0);
  }
}
async function forcedExpandRecursively(viewer, element) {
  if (element) {
    if (!viewer.hasNode(element)) {
      return;
    }
    await viewer.expand(element, true);
  }
  const children = viewer.getNode(element)?.children;
  if (children) {
    for (const child of children) {
      if (isSearchResult(child.element)) {
        throw Error("SearchResult should not be a child of a RenderableMatch");
      }
      forcedExpandRecursively(viewer, child.element);
    }
  }
}
function clearSearchResults(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  searchView?.clearSearchResults();
}
function cancelSearch(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  searchView?.cancelSearch();
}
function refreshSearch(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  searchView?.triggerQueryChange({ preserveFocus: false, shouldUpdateAISearch: !searchView.model.searchResult.aiTextSearchResult.hidden });
}
function collapseDeepestExpandedLevel(accessor) {
  const viewsService = accessor.get(IViewsService);
  const searchView = getSearchView(viewsService);
  if (searchView) {
    const viewer = searchView.getControl();
    const navigator = viewer.navigate();
    let node = navigator.first();
    let canCollapseFileMatchLevel = false;
    let canCollapseFirstLevel = false;
    do {
      node = navigator.next();
    } while (isTextSearchHeading(node));
    if (isSearchTreeFolderMatchWorkspaceRoot(node) || searchView.isTreeLayoutViewVisible) {
      while (node = navigator.next()) {
        if (isTextSearchHeading(node)) {
          continue;
        }
        if (isSearchTreeMatch(node)) {
          canCollapseFileMatchLevel = true;
          break;
        }
        if (searchView.isTreeLayoutViewVisible && !canCollapseFirstLevel) {
          let nodeToTest = node;
          if (isSearchTreeFolderMatch(node)) {
            const compressionStartNode = viewer.getCompressedTreeNode(node)?.elements[0].element;
            nodeToTest = compressionStartNode && !isSearchTreeMatch(compressionStartNode) && !isTextSearchHeading(compressionStartNode) && !isSearchResult(compressionStartNode) ? compressionStartNode : node;
          }
          const immediateParent = nodeToTest.parent();
          if (!(isTextSearchHeading(immediateParent) || isSearchTreeFolderMatchWorkspaceRoot(immediateParent) || isSearchTreeFolderMatchNoRoot(immediateParent) || isSearchResult(immediateParent))) {
            canCollapseFirstLevel = true;
          }
        }
      }
    }
    if (canCollapseFileMatchLevel) {
      node = navigator.first();
      do {
        if (isSearchTreeFileMatch(node)) {
          viewer.collapse(node);
        }
      } while (node = navigator.next());
    } else if (canCollapseFirstLevel) {
      node = navigator.first();
      if (node) {
        do {
          let nodeToTest = node;
          if (isSearchTreeFolderMatch(node)) {
            const compressionStartNode = viewer.getCompressedTreeNode(node)?.elements[0].element;
            nodeToTest = compressionStartNode && !isSearchTreeMatch(compressionStartNode) && !isSearchResult(compressionStartNode) ? compressionStartNode : node;
          }
          const immediateParent = nodeToTest.parent();
          if (isSearchTreeFolderMatchWorkspaceRoot(immediateParent) || isSearchTreeFolderMatchNoRoot(immediateParent)) {
            if (viewer.hasNode(node)) {
              viewer.collapse(node, true);
            } else {
              viewer.collapseAll();
            }
          }
        } while (node = navigator.next());
      }
    } else if (isTextSearchHeading(navigator.first())) {
      node = navigator.first();
      do {
        if (!node) {
          break;
        }
        if (isTextSearchHeading(viewer.getParentElement(node))) {
          viewer.collapse(node);
        }
      } while (node = navigator.next());
    } else {
      viewer.collapseAll();
    }
    const firstFocusParent = viewer.getFocus()[0]?.parent();
    if (firstFocusParent && (isSearchTreeFolderMatch(firstFocusParent) || isSearchTreeFileMatch(firstFocusParent)) && viewer.hasNode(firstFocusParent) && viewer.isCollapsed(firstFocusParent)) {
      viewer.domFocus();
      viewer.focusFirst();
      viewer.setSelection(viewer.getFocus());
    }
  }
}
export {
  forcedExpandRecursively
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaEFjdGlvbnNUb3BCYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlLCBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNlYXJjaENsZWFySWNvbiwgc2VhcmNoQ29sbGFwc2VBbGxJY29uLCBzZWFyY2hFeHBhbmRBbGxJY29uLCBzZWFyY2hSZWZyZXNoSWNvbiwgc2VhcmNoU2hvd0FzTGlzdCwgc2VhcmNoU2hvd0FzVHJlZSwgc2VhcmNoU3RvcEljb24gfSBmcm9tICcuL3NlYXJjaEljb25zLmpzJztcbmltcG9ydCAqIGFzIENvbnN0YW50cyBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElTZWFyY2hIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2hIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBWSUVXX0lEIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hTdGF0ZUtleSwgU2VhcmNoVUlTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgY2F0ZWdvcnksIGdldFNlYXJjaFZpZXcgfSBmcm9tICcuL3NlYXJjaEFjdGlvbnNCYXNlLmpzJztcbmltcG9ydCB7IGlzU2VhcmNoVHJlZU1hdGNoLCBSZW5kZXJhYmxlTWF0Y2gsIElTZWFyY2hSZXN1bHQsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoLCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaE5vUm9vdCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290LCBpc1NlYXJjaFJlc3VsdCwgaXNUZXh0U2VhcmNoSGVhZGluZywgaXNTZWFyY2hUcmVlRmlsZU1hdGNoIH0gZnJvbSAnLi9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoVHJlZUNvbW1vbi5qcyc7XG5cbi8vI3JlZ2lvbiBBY3Rpb25zXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xlYXJTZWFyY2hIaXN0b3J5Q29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuQ2xlYXJTZWFyY2hIaXN0b3J5Q29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2NsZWFyU2VhcmNoSGlzdG9yeUxhYmVsJywgXCJDbGVhciBTZWFyY2ggSGlzdG9yeVwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjbGVhckhpc3RvcnlDb21tYW5kKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDYW5jZWxTZWFyY2hBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkNhbmNlbFNlYXJjaEFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0NhbmNlbFNlYXJjaEFjdGlvbi5sYWJlbCcsIFwiQ2FuY2VsIFNlYXJjaFwiKSxcblx0XHRcdGljb246IHNlYXJjaFN0b3BJY29uLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogU2VhcmNoU3RhdGVLZXkuaXNFcXVhbFRvKFNlYXJjaFVJU3RhdGUuSWRsZSkubmVnYXRlKCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSwgU2VhcmNoU3RhdGVLZXkuaXNFcXVhbFRvKFNlYXJjaFVJU3RhdGUuU2xvd1NlYXJjaCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRyZXR1cm4gY2FuY2VsU2VhcmNoKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZWZyZXNoQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5SZWZyZXNoU2VhcmNoUmVzdWx0c0FjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1JlZnJlc2hBY3Rpb24ubGFiZWwnLCBcIlJlZnJlc2hcIiksXG5cdFx0XHRpY29uOiBzZWFyY2hSZWZyZXNoSWNvbixcblx0XHRcdHByZWNvbmRpdGlvbjogQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuVmlld0hhc1NlYXJjaFBhdHRlcm5LZXksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19JRCksIFNlYXJjaFN0YXRlS2V5LmlzRXF1YWxUbyhTZWFyY2hVSVN0YXRlLlNsb3dTZWFyY2gpLm5lZ2F0ZSgpKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRyZXR1cm4gcmVmcmVzaFNlYXJjaChhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29sbGFwc2VEZWVwZXN0RXhwYW5kZWRMZXZlbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuQ29sbGFwc2VTZWFyY2hSZXN1bHRzQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignQ29sbGFwc2VEZWVwZXN0RXhwYW5kZWRMZXZlbEFjdGlvbi5sYWJlbCcsIFwiQ29sbGFwc2UgQWxsXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBzZWFyY2hDb2xsYXBzZUFsbEljb24sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlZpZXdIYXNTb21lQ29sbGFwc2libGVLZXkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19JRCksIENvbnRleHRLZXlFeHByLm9yKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMubmVnYXRlKCksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlZpZXdIYXNTb21lQ29sbGFwc2libGVLZXkpKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRyZXR1cm4gY29sbGFwc2VEZWVwZXN0RXhwYW5kZWRMZXZlbChhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhwYW5kQWxsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5FeHBhbmRTZWFyY2hSZXN1bHRzQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignRXhwYW5kQWxsQWN0aW9uLmxhYmVsJywgXCJFeHBhbmQgQWxsXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRpY29uOiBzZWFyY2hFeHBhbmRBbGxJY29uLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5IYXNTZWFyY2hSZXN1bHRzLCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5WaWV3SGFzU29tZUNvbGxhcHNpYmxlS2V5LnRvTmVnYXRlZCgpKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFZJRVdfSUQpLCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5IYXNTZWFyY2hSZXN1bHRzLCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5WaWV3SGFzU29tZUNvbGxhcHNpYmxlS2V5LnRvTmVnYXRlZCgpKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRyZXR1cm4gZXhwYW5kQWxsKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDbGVhclNlYXJjaFJlc3VsdHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLkNsZWFyU2VhcmNoUmVzdWx0c0FjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0NsZWFyU2VhcmNoUmVzdWx0c0FjdGlvbi5sYWJlbCcsIFwiQ2xlYXIgU2VhcmNoIFJlc3VsdHNcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IHNlYXJjaENsZWFySWNvbixcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihDb25zdGFudHMuU2VhcmNoQ29udGV4dC5IYXNTZWFyY2hSZXN1bHRzLCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5WaWV3SGFzU2VhcmNoUGF0dGVybktleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuVmlld0hhc1JlcGxhY2VQYXR0ZXJuS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5WaWV3SGFzRmlsZVBhdHRlcm5LZXkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX0lEKSxcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRyZXR1cm4gY2xlYXJTZWFyY2hSZXN1bHRzKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFZpZXdBc1RyZWVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlZpZXdBc1RyZWVBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdWaWV3QXNUcmVlQWN0aW9uLmxhYmVsJywgXCJWaWV3IGFzIFRyZWVcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IHNlYXJjaFNob3dBc0xpc3QsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkluVHJlZVZpZXdLZXkudG9OZWdhdGVkKCkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19JRCksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkluVHJlZVZpZXdLZXkudG9OZWdhdGVkKCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRcdGF3YWl0IHNlYXJjaFZpZXcuc2V0VHJlZVZpZXcodHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFZpZXdBc0xpc3RBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlZpZXdBc0xpc3RBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdWaWV3QXNMaXN0QWN0aW9uLmxhYmVsJywgXCJWaWV3IGFzIExpc3RcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IHNlYXJjaFNob3dBc1RyZWUsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lkhhc1NlYXJjaFJlc3VsdHMsIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkluVHJlZVZpZXdLZXkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19JRCksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkluVHJlZVZpZXdLZXkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRcdGF3YWl0IHNlYXJjaFZpZXcuc2V0VHJlZVZpZXcoZmFsc2UpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTZWFyY2hXaXRoQUlBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlNlYXJjaFdpdGhBSUFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1NlYXJjaFdpdGhBSUFjdGlvbi5sYWJlbCcsIFwiU2VhcmNoIHdpdGggQUlcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5oYXNBSVJlc3VsdFByb3ZpZGVyLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lmhhc0FJUmVzdWx0UHJvdmlkZXIsIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRpZiAoc2VhcmNoVmlldykge1xuXHRcdFx0c2VhcmNoVmlldy5yZXF1ZXN0QUlSZXN1bHRzKCk7XG5cdFx0fVxuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBIZWxwZXJzXG5jb25zdCBjbGVhckhpc3RvcnlDb21tYW5kOiBJQ29tbWFuZEhhbmRsZXIgPSBhY2Nlc3NvciA9PiB7XG5cdGNvbnN0IHNlYXJjaEhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZWFyY2hIaXN0b3J5U2VydmljZSk7XG5cdHNlYXJjaEhpc3RvcnlTZXJ2aWNlLmNsZWFySGlzdG9yeSgpO1xufTtcblxuYXN5bmMgZnVuY3Rpb24gZXhwYW5kQWxsKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKTtcblx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRjb25zdCB2aWV3ZXIgPSBzZWFyY2hWaWV3LmdldENvbnRyb2woKTtcblx0XHRhd2FpdCBmb3JjZWRFeHBhbmRSZWN1cnNpdmVseSh2aWV3ZXIsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZWN1cnNpdmVseSBleHBhbmQgYWxsIG5vZGVzIGluIHRoZSBzZWFyY2ggcmVzdWx0cyB0cmVlIHRoYXQgYXJlIGEgY2hpbGQgb2YgYGVsZW1lbnRgXG4gKiBJZiBgZWxlbWVudGAgaXMgbm90IHByb3ZpZGVkLCBpdCBpcyB0aGUgcm9vdCBub2RlLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZm9yY2VkRXhwYW5kUmVjdXJzaXZlbHkoXG5cdHZpZXdlcjogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2gsIHZvaWQ+LFxuXHRlbGVtZW50OiBSZW5kZXJhYmxlTWF0Y2ggfCB1bmRlZmluZWRcbikge1xuXHRpZiAoZWxlbWVudCkge1xuXHRcdGlmICghdmlld2VyLmhhc05vZGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdmlld2VyLmV4cGFuZChlbGVtZW50LCB0cnVlKTtcblx0fVxuXG5cdGNvbnN0IGNoaWxkcmVuID0gdmlld2VyLmdldE5vZGUoZWxlbWVudCk/LmNoaWxkcmVuO1xuXG5cdGlmIChjaGlsZHJlbikge1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdGlmIChpc1NlYXJjaFJlc3VsdChjaGlsZC5lbGVtZW50KSkge1xuXHRcdFx0XHR0aHJvdyBFcnJvcignU2VhcmNoUmVzdWx0IHNob3VsZCBub3QgYmUgYSBjaGlsZCBvZiBhIFJlbmRlcmFibGVNYXRjaCcpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yY2VkRXhwYW5kUmVjdXJzaXZlbHkodmlld2VyLCBjaGlsZC5lbGVtZW50KTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gY2xlYXJTZWFyY2hSZXN1bHRzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKTtcblx0c2VhcmNoVmlldz8uY2xlYXJTZWFyY2hSZXN1bHRzKCk7XG59XG5cbmZ1bmN0aW9uIGNhbmNlbFNlYXJjaChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KHZpZXdzU2VydmljZSk7XG5cdHNlYXJjaFZpZXc/LmNhbmNlbFNlYXJjaCgpO1xufVxuXG5mdW5jdGlvbiByZWZyZXNoU2VhcmNoKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKTtcblx0c2VhcmNoVmlldz8udHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgcHJlc2VydmVGb2N1czogZmFsc2UsIHNob3VsZFVwZGF0ZUFJU2VhcmNoOiAhc2VhcmNoVmlldy5tb2RlbC5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0LmhpZGRlbiB9KTtcbn1cblxuZnVuY3Rpb24gY29sbGFwc2VEZWVwZXN0RXhwYW5kZWRMZXZlbChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXG5cdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKTtcblx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRjb25zdCB2aWV3ZXIgPSBzZWFyY2hWaWV3LmdldENvbnRyb2woKTtcblxuXHRcdC8qKlxuXHRcdCAqIG9uZSBsZXZlbCB0byBjb2xsYXBzZSBzbyBjb2xsYXBzZSBldmVyeXRoaW5nLiBJZiBGb2xkZXJNYXRjaCwgY2hlY2sgaWYgdGhlcmUgYXJlIHZpc2libGUgZ3JhbmRjaGlsZHJlbixcblx0XHQgKiBpLmUuIGlmIE1hdGNoZXMgYXJlIHJldHVybmVkIGJ5IHRoZSBuYXZpZ2F0b3IsIGFuZCBpZiBzbywgY29sbGFwc2UgdG8gdGhlbSwgb3RoZXJ3aXNlIGNvbGxhcHNlIGFsbCBsZXZlbHMuXG5cdFx0ICovXG5cdFx0Y29uc3QgbmF2aWdhdG9yID0gdmlld2VyLm5hdmlnYXRlKCk7XG5cdFx0bGV0IG5vZGUgPSBuYXZpZ2F0b3IuZmlyc3QoKTtcblx0XHRsZXQgY2FuQ29sbGFwc2VGaWxlTWF0Y2hMZXZlbCA9IGZhbHNlO1xuXHRcdGxldCBjYW5Db2xsYXBzZUZpcnN0TGV2ZWwgPSBmYWxzZTtcblxuXHRcdGRvIHtcblx0XHRcdG5vZGUgPSBuYXZpZ2F0b3IubmV4dCgpO1xuXHRcdH0gd2hpbGUgKGlzVGV4dFNlYXJjaEhlYWRpbmcobm9kZSkpO1xuXHRcdC8vIGdvIHRvIHRoZSBmaXJzdCBub24tVGV4dFNlYXJjaFJlc3VsdCBub2RlXG5cblx0XHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290KG5vZGUpIHx8IHNlYXJjaFZpZXcuaXNUcmVlTGF5b3V0Vmlld1Zpc2libGUpIHtcblx0XHRcdHdoaWxlIChub2RlID0gbmF2aWdhdG9yLm5leHQoKSkge1xuXHRcdFx0XHRpZiAoaXNUZXh0U2VhcmNoSGVhZGluZyhub2RlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVNYXRjaChub2RlKSkge1xuXHRcdFx0XHRcdGNhbkNvbGxhcHNlRmlsZU1hdGNoTGV2ZWwgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZWFyY2hWaWV3LmlzVHJlZUxheW91dFZpZXdWaXNpYmxlICYmICFjYW5Db2xsYXBzZUZpcnN0TGV2ZWwpIHtcblx0XHRcdFx0XHRsZXQgbm9kZVRvVGVzdCA9IG5vZGU7XG5cblx0XHRcdFx0XHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2gobm9kZSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbXByZXNzaW9uU3RhcnROb2RlID0gdmlld2VyLmdldENvbXByZXNzZWRUcmVlTm9kZShub2RlKT8uZWxlbWVudHNbMF0uZWxlbWVudDtcblx0XHRcdFx0XHRcdC8vIE1hdGNoIGVsZW1lbnRzIHNob3VsZCBuZXZlciBiZSBjb21wcmVzc2VkLCBzbyBgIShjb21wcmVzc2lvblN0YXJ0Tm9kZSBpbnN0YW5jZW9mIE1hdGNoKWAgc2hvdWxkIGFsd2F5cyBiZSB0cnVlIGhlcmUuIFNhbWUgd2l0aCBgIShjb21wcmVzc2lvblN0YXJ0Tm9kZSBpbnN0YW5jZW9mIFRleHRTZWFyY2hSZXN1bHQpYFxuXHRcdFx0XHRcdFx0bm9kZVRvVGVzdCA9IGNvbXByZXNzaW9uU3RhcnROb2RlICYmICEoaXNTZWFyY2hUcmVlTWF0Y2goY29tcHJlc3Npb25TdGFydE5vZGUpKSAmJiAhaXNUZXh0U2VhcmNoSGVhZGluZyhjb21wcmVzc2lvblN0YXJ0Tm9kZSkgJiYgIShpc1NlYXJjaFJlc3VsdChjb21wcmVzc2lvblN0YXJ0Tm9kZSkpID8gY29tcHJlc3Npb25TdGFydE5vZGUgOiBub2RlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGltbWVkaWF0ZVBhcmVudCA9IG5vZGVUb1Rlc3QucGFyZW50KCk7XG5cblx0XHRcdFx0XHRpZiAoIShpc1RleHRTZWFyY2hIZWFkaW5nKGltbWVkaWF0ZVBhcmVudCkgfHwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290KGltbWVkaWF0ZVBhcmVudCkgfHwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hOb1Jvb3QoaW1tZWRpYXRlUGFyZW50KSB8fCBpc1NlYXJjaFJlc3VsdChpbW1lZGlhdGVQYXJlbnQpKSkge1xuXHRcdFx0XHRcdFx0Y2FuQ29sbGFwc2VGaXJzdExldmVsID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY2FuQ29sbGFwc2VGaWxlTWF0Y2hMZXZlbCkge1xuXHRcdFx0bm9kZSA9IG5hdmlnYXRvci5maXJzdCgpO1xuXHRcdFx0ZG8ge1xuXHRcdFx0XHRpZiAoaXNTZWFyY2hUcmVlRmlsZU1hdGNoKG5vZGUpKSB7XG5cdFx0XHRcdFx0dmlld2VyLmNvbGxhcHNlKG5vZGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IHdoaWxlIChub2RlID0gbmF2aWdhdG9yLm5leHQoKSk7XG5cdFx0fSBlbHNlIGlmIChjYW5Db2xsYXBzZUZpcnN0TGV2ZWwpIHtcblx0XHRcdG5vZGUgPSBuYXZpZ2F0b3IuZmlyc3QoKTtcblx0XHRcdGlmIChub2RlKSB7XG5cdFx0XHRcdGRvIHtcblxuXHRcdFx0XHRcdGxldCBub2RlVG9UZXN0ID0gbm9kZTtcblxuXHRcdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChub2RlKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY29tcHJlc3Npb25TdGFydE5vZGUgPSB2aWV3ZXIuZ2V0Q29tcHJlc3NlZFRyZWVOb2RlKG5vZGUpPy5lbGVtZW50c1swXS5lbGVtZW50O1xuXHRcdFx0XHRcdFx0Ly8gTWF0Y2ggZWxlbWVudHMgc2hvdWxkIG5ldmVyIGJlIGNvbXByZXNzZWQsIHNvICEoY29tcHJlc3Npb25TdGFydE5vZGUgaW5zdGFuY2VvZiBNYXRjaCkgc2hvdWxkIGFsd2F5cyBiZSB0cnVlIGhlcmVcblx0XHRcdFx0XHRcdG5vZGVUb1Rlc3QgPSAoY29tcHJlc3Npb25TdGFydE5vZGUgJiYgIShpc1NlYXJjaFRyZWVNYXRjaChjb21wcmVzc2lvblN0YXJ0Tm9kZSkpICYmICEoaXNTZWFyY2hSZXN1bHQoY29tcHJlc3Npb25TdGFydE5vZGUpKSA/IGNvbXByZXNzaW9uU3RhcnROb2RlIDogbm9kZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGltbWVkaWF0ZVBhcmVudCA9IG5vZGVUb1Rlc3QucGFyZW50KCk7XG5cblx0XHRcdFx0XHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290KGltbWVkaWF0ZVBhcmVudCkgfHwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hOb1Jvb3QoaW1tZWRpYXRlUGFyZW50KSkge1xuXHRcdFx0XHRcdFx0aWYgKHZpZXdlci5oYXNOb2RlKG5vZGUpKSB7XG5cdFx0XHRcdFx0XHRcdHZpZXdlci5jb2xsYXBzZShub2RlLCB0cnVlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHZpZXdlci5jb2xsYXBzZUFsbCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSB3aGlsZSAobm9kZSA9IG5hdmlnYXRvci5uZXh0KCkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNUZXh0U2VhcmNoSGVhZGluZyhuYXZpZ2F0b3IuZmlyc3QoKSkpIHtcblx0XHRcdC8vIGlmIEFJIHJlc3VsdHMgYXJlIHZpc2libGUsIGp1c3QgY29sbGFwc2UgZXZlcnl0aGluZyB1bmRlciB0aGUgVGV4dFNlYXJjaFJlc3VsdC5cblx0XHRcdG5vZGUgPSBuYXZpZ2F0b3IuZmlyc3QoKTtcblx0XHRcdGRvIHtcblx0XHRcdFx0aWYgKCFub2RlKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc1RleHRTZWFyY2hIZWFkaW5nKHZpZXdlci5nZXRQYXJlbnRFbGVtZW50KG5vZGUpKSkge1xuXHRcdFx0XHRcdHZpZXdlci5jb2xsYXBzZShub2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSB3aGlsZSAobm9kZSA9IG5hdmlnYXRvci5uZXh0KCkpO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHZpZXdlci5jb2xsYXBzZUFsbCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpcnN0Rm9jdXNQYXJlbnQgPSB2aWV3ZXIuZ2V0Rm9jdXMoKVswXT8ucGFyZW50KCk7XG5cblx0XHRpZiAoZmlyc3RGb2N1c1BhcmVudCAmJiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZmlyc3RGb2N1c1BhcmVudCkgfHwgaXNTZWFyY2hUcmVlRmlsZU1hdGNoKGZpcnN0Rm9jdXNQYXJlbnQpKSAmJlxuXHRcdFx0dmlld2VyLmhhc05vZGUoZmlyc3RGb2N1c1BhcmVudCkgJiYgdmlld2VyLmlzQ29sbGFwc2VkKGZpcnN0Rm9jdXNQYXJlbnQpKSB7XG5cdFx0XHR2aWV3ZXIuZG9tRm9jdXMoKTtcblx0XHRcdHZpZXdlci5mb2N1c0ZpcnN0KCk7XG5cdFx0XHR2aWV3ZXIuc2V0U2VsZWN0aW9uKHZpZXdlci5nZXRGb2N1cygpKTtcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFHckIsU0FBNkMsb0NBQW9DO0FBQ2pGLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCLHVCQUF1QixxQkFBcUIsbUJBQW1CLGtCQUFrQixrQkFBa0Isc0JBQXNCO0FBQ25KLFlBQVksZUFBZTtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsZ0JBQWdCLHFCQUFxQjtBQUM5QyxTQUFTLFVBQVUscUJBQXFCO0FBQ3hDLFNBQVMsbUJBQW1ELHlCQUF5QiwrQkFBK0Isc0NBQXNDLGdCQUFnQixxQkFBcUIsNkJBQTZCO0FBRzVOLGdCQUFnQixNQUFNLHdDQUF3QyxRQUFRO0FBQUEsRUFFckUsY0FDRTtBQUNELFVBQU07QUFBQSxNQUNMLElBQUksVUFBVSxpQkFBaUI7QUFBQSxNQUMvQixPQUFPLElBQUksVUFBVSwyQkFBMkIsc0JBQXNCO0FBQUEsTUFDdEU7QUFBQSxNQUNBLElBQUk7QUFBQSxJQUNMLENBQUM7QUFBQSxFQUVGO0FBQUEsRUFFQSxNQUFlLElBQUksVUFBMEM7QUFDNUQsd0JBQW9CLFFBQVE7QUFBQSxFQUM3QjtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSwyQkFBMkIsUUFBUTtB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
