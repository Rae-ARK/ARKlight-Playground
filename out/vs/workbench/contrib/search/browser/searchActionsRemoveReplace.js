import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { getSelectionKeyboardEvent } from "../../../../platform/list/browser/listService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { searchRemoveIcon, searchReplaceIcon } from "./searchIcons.js";
import * as Constants from "../common/constants.js";
import { IReplaceService } from "./replace.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { category, getElementsToOperateOn, getSearchView, shouldRefocus } from "./searchActionsBase.js";
import { equals } from "../../../../base/common/arrays.js";
import { arrayContainsElementOrParent, isSearchTreeFileMatch, isSearchTreeFolderMatch, isSearchTreeMatch, isSearchResult, isTextSearchHeading } from "./searchTreeModel/searchTreeCommon.js";
import { MatchInNotebook } from "./notebookSearch/notebookSearchModel.js";
import { AITextSearchHeadingImpl } from "./AISearch/aiSearchModel.js";
registerAction2(class RemoveAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.RemoveActionId,
      title: nls.localize2("RemoveAction.label", "Dismiss"),
      category,
      icon: searchRemoveIcon,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
        primary: KeyCode.Delete,
        mac: {
          primary: KeyMod.CtrlCmd | KeyCode.Backspace
        }
      },
      menu: [
        {
          id: MenuId.SearchContext,
          group: "search",
          order: 2
        },
        {
          id: MenuId.SearchActionMenu,
          group: "inline",
          when: ContextKeyExpr.or(Constants.SearchContext.FileFocusKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.FolderFocusKey),
          order: 2
        }
      ]
    });
  }
  async run(accessor, context) {
    const viewsService = accessor.get(IViewsService);
    const configurationService = accessor.get(IConfigurationService);
    const searchView = getSearchView(viewsService);
    if (!searchView) {
      return;
    }
    let element = context?.element;
    let viewer = context?.viewer;
    if (!viewer) {
      viewer = searchView.getControl();
    }
    if (!element) {
      element = viewer.getFocus()[0] ?? void 0;
    }
    const elementsToRemove = getElementsToOperateOn(viewer, element, configurationService.getValue("search"));
    let focusElement = viewer.getFocus()[0] ?? void 0;
    if (elementsToRemove.length === 0) {
      return;
    }
    if (!focusElement || isSearchResult(focusElement)) {
      focusElement = element;
    }
    let nextFocusElement;
    const shouldRefocusMatch = shouldRefocus(elementsToRemove, focusElement);
    if (focusElement && shouldRefocusMatch) {
      nextFocusElement = await getElementToFocusAfterRemoved(viewer, focusElement, elementsToRemove);
    }
    const searchResult = searchView.searchResult;
    if (searchResult) {
      searchResult.batchRemove(elementsToRemove);
    }
    await searchView.queueRefreshTree();
    if (focusElement && shouldRefocusMatch) {
      if (!nextFocusElement) {
        nextFocusElement = await getLastNodeFromSameType(viewer, focusElement).catch(() => {
        });
      }
      if (nextFocusElement && !arrayContainsElementOrParent(nextFocusElement, elementsToRemove)) {
        viewer.reveal(nextFocusElement);
        viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
        viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());
      }
    } else if (!equals(viewer.getFocus(), viewer.getSelection())) {
      viewer.setSelection(viewer.getFocus());
    }
    viewer.domFocus();
    return;
  }
});
registerAction2(class ReplaceAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ReplaceActionId,
      title: nls.localize2("match.replace.label", "Replace"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
        primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1
      },
      icon: searchReplaceIcon,
      menu: [
        {
          id: MenuId.SearchContext,
          when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
          group: "search",
          order: 1
        },
        {
          id: MenuId.SearchActionMenu,
          when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.MatchFocusKey, Constants.SearchContext.IsEditableItemKey),
          group: "inline",
          order: 1
        }
      ]
    });
  }
  async run(accessor, context) {
    return performReplace(accessor, context);
  }
});
registerAction2(class ReplaceAllAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ReplaceAllInFileActionId,
      title: nls.localize2("file.replaceAll.label", "Replace All"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
        primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1,
        secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter]
      },
      icon: searchReplaceIcon,
      menu: [
        {
          id: MenuId.SearchContext,
          when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
          group: "search",
          order: 1
        },
        {
          id: MenuId.SearchActionMenu,
          when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FileFocusKey, Constants.SearchContext.IsEditableItemKey),
          group: "inline",
          order: 1
        }
      ]
    });
  }
  async run(accessor, context) {
    return performReplace(accessor, context);
  }
});
registerAction2(class ReplaceAllInFolderAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ReplaceAllInFolderActionId,
      title: nls.localize2("file.replaceAll.label", "Replace All"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
        primary: KeyMod.Shift | KeyMod.CtrlCmd | KeyCode.Digit1,
        secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter]
      },
      icon: searchReplaceIcon,
      menu: [
        {
          id: MenuId.SearchContext,
          when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
          group: "search",
          order: 1
        },
        {
          id: MenuId.SearchActionMenu,
          when: ContextKeyExpr.and(Constants.SearchContext.ReplaceActiveKey, Constants.SearchContext.FolderFocusKey, Constants.SearchContext.IsEditableItemKey),
          group: "inline",
          order: 1
        }
      ]
    });
  }
  async run(accessor, context) {
    return performReplace(accessor, context);
  }
});
async function performReplace(accessor, context) {
  const configurationService = accessor.get(IConfigurationService);
  const viewsService = accessor.get(IViewsService);
  const instantiationService = accessor.get(IInstantiationService);
  const viewlet = getSearchView(viewsService);
  const viewer = context?.viewer ?? viewlet?.getControl();
  if (!viewer) {
    return;
  }
  const element = context?.element ?? viewer.getFocus()[0];
  const elementsToReplace = getElementsToOperateOn(viewer, element ?? void 0, configurationService.getValue("search"));
  let focusElement = viewer.getFocus()[0];
  if (!focusElement || focusElement && !arrayContainsElementOrParent(focusElement, elementsToReplace) || isSearchResult(focusElement)) {
    focusElement = element;
  }
  if (elementsToReplace.length === 0) {
    return;
  }
  let nextFocusElement;
  if (focusElement) {
    nextFocusElement = await getElementToFocusAfterRemoved(viewer, focusElement, elementsToReplace);
  }
  const searchResult = viewlet?.searchResult;
  if (searchResult) {
    await searchResult.batchReplace(elementsToReplace);
  }
  await viewlet?.queueRefreshTree();
  if (focusElement) {
    if (!nextFocusElement) {
      nextFocusElement = await getLastNodeFromSameType(viewer, focusElement);
    }
    if (nextFocusElement) {
      viewer.reveal(nextFocusElement);
      viewer.setFocus([nextFocusElement], getSelectionKeyboardEvent());
      viewer.setSelection([nextFocusElement], getSelectionKeyboardEvent());
      if (isSearchTreeMatch(nextFocusElement)) {
        const useReplacePreview = configurationService.getValue().search?.useReplacePreview;
        if (!useReplacePreview || instantiationService.invokeFunction((accessor2) => hasToOpenFile(accessor2, nextFocusElement)) || nextFocusElement instanceof MatchInNotebook) {
          viewlet?.open(nextFocusElement, true);
        } else {
          instantiationService.invokeFunction((accessor2) => accessor2.get(IReplaceService)).openReplacePreview(nextFocusElement, true);
        }
      } else if (isSearchTreeFileMatch(nextFocusElement)) {
        viewlet?.open(nextFocusElement, true);
      }
    }
  }
  viewer.domFocus();
}
function hasToOpenFile(accessor, currBottomElem) {
  if (!isSearchTreeMatch(currBottomElem)) {
    return false;
  }
  const activeEditor = accessor.get(IEditorService).activeEditor;
  const file = activeEditor?.resource;
  if (file) {
    return accessor.get(IUriIdentityService).extUri.isEqual(file, currBottomElem.parent().resource);
  }
  return false;
}
function compareLevels(elem1, elem2) {
  if (isSearchTreeMatch(elem1)) {
    if (isSearchTreeMatch(elem2)) {
      return 0;
    } else {
      return -1;
    }
  } else if (isSearchTreeFileMatch(elem1)) {
    if (isSearchTreeMatch(elem2)) {
      return 1;
    } else if (isSearchTreeFileMatch(elem2)) {
      return 0;
    } else {
      return -1;
    }
  } else if (isSearchTreeFolderMatch(elem1)) {
    if (isTextSearchHeading(elem2)) {
      return -1;
    } else if (isSearchTreeFolderMatch(elem2)) {
      return 0;
    } else {
      return 1;
    }
  } else {
    if (isTextSearchHeading(elem2)) {
      return 0;
    } else {
      return 1;
    }
  }
}
async function getElementToFocusAfterRemoved(viewer, element, elementsToRemove) {
  const navigator = viewer.navigate(element);
  if (isSearchTreeFolderMatch(element)) {
    while (!!navigator.next() && (!isSearchTreeFolderMatch(navigator.current()) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
    }
  } else if (isSearchTreeFileMatch(element)) {
    while (!!navigator.next() && (!isSearchTreeFileMatch(navigator.current()) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
      if (navigator.current() instanceof AITextSearchHeadingImpl) {
        return navigator.current();
      }
      await viewer.expand(navigator.current());
    }
  } else {
    while (navigator.next() && (!isSearchTreeMatch(navigator.current()) || arrayContainsElementOrParent(navigator.current(), elementsToRemove))) {
      if (navigator.current() instanceof AITextSearchHeadingImpl) {
        return navigator.current();
      }
      await viewer.expand(navigator.current());
    }
  }
  return navigator.current();
}
async function getLastNodeFromSameType(viewer, element) {
  let lastElem = viewer.lastVisibleElement ?? null;
  while (lastElem) {
    const compareVal = compareLevels(element, lastElem);
    if (compareVal === -1) {
      const expanded = await viewer.expand(lastElem);
      if (!expanded) {
        return lastElem;
      }
      lastElem = viewer.lastVisibleElement;
    } else if (compareVal === 1) {
      const potentialLastElem = viewer.getParentElement(lastElem);
      if (isSearchResult(potentialLastElem)) {
        break;
      } else {
        lastElem = potentialLastElem;
      }
    } else {
      return lastElem;
    }
  }
  return void 0;
}
export {
  getElementToFocusAfterRemoved,
  getLastNodeFromSameType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaEFjdGlvbnNSZW1vdmVSZXBsYWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVRyZWVOYXZpZ2F0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQsIFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2VhcmNoUmVtb3ZlSWNvbiwgc2VhcmNoUmVwbGFjZUljb24gfSBmcm9tICcuL3NlYXJjaEljb25zLmpzJztcbmltcG9ydCB7IFNlYXJjaFZpZXcgfSBmcm9tICcuL3NlYXJjaFZpZXcuanMnO1xuaW1wb3J0ICogYXMgQ29uc3RhbnRzIGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVJlcGxhY2VTZXJ2aWNlIH0gZnJvbSAnLi9yZXBsYWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZWFyY2hDb25maWd1cmF0aW9uLCBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgY2F0ZWdvcnksIGdldEVsZW1lbnRzVG9PcGVyYXRlT24sIGdldFNlYXJjaFZpZXcsIHNob3VsZFJlZm9jdXMgfSBmcm9tICcuL3NlYXJjaEFjdGlvbnNCYXNlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBhcnJheUNvbnRhaW5zRWxlbWVudE9yUGFyZW50LCBSZW5kZXJhYmxlTWF0Y2gsIElTZWFyY2hSZXN1bHQsIGlzU2VhcmNoVHJlZUZpbGVNYXRjaCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIGlzU2VhcmNoVHJlZU1hdGNoLCBpc1NlYXJjaFJlc3VsdCwgaXNUZXh0U2VhcmNoSGVhZGluZyB9IGZyb20gJy4vc2VhcmNoVHJlZU1vZGVsL3NlYXJjaFRyZWVDb21tb24uanMnO1xuaW1wb3J0IHsgTWF0Y2hJbk5vdGVib29rIH0gZnJvbSAnLi9ub3RlYm9va1NlYXJjaC9ub3RlYm9va1NlYXJjaE1vZGVsLmpzJztcbmltcG9ydCB7IEFJVGV4dFNlYXJjaEhlYWRpbmdJbXBsIH0gZnJvbSAnLi9BSVNlYXJjaC9haVNlYXJjaE1vZGVsLmpzJztcblxuXG4vLyNyZWdpb24gSW50ZXJmYWNlc1xuZXhwb3J0IGludGVyZmFjZSBJU2VhcmNoQWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IHZpZXdlcjogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+O1xuXHRyZWFkb25seSBlbGVtZW50OiBSZW5kZXJhYmxlTWF0Y2g7XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJRmluZEluRmlsZXNBcmdzIHtcblx0cXVlcnk/OiBzdHJpbmc7XG5cdHJlcGxhY2U/OiBzdHJpbmc7XG5cdHByZXNlcnZlQ2FzZT86IGJvb2xlYW47XG5cdHRyaWdnZXJTZWFyY2g/OiBib29sZWFuO1xuXHRmaWxlc1RvSW5jbHVkZT86IHN0cmluZztcblx0ZmlsZXNUb0V4Y2x1ZGU/OiBzdHJpbmc7XG5cdGlzUmVnZXg/OiBib29sZWFuO1xuXHRpc0Nhc2VTZW5zaXRpdmU/OiBib29sZWFuO1xuXHRtYXRjaFdob2xlV29yZD86IGJvb2xlYW47XG5cdHVzZUV4Y2x1ZGVTZXR0aW5nc0FuZElnbm9yZUZpbGVzPzogYm9vbGVhbjtcblx0b25seU9wZW5FZGl0b3JzPzogYm9vbGVhbjtcbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBBY3Rpb25zXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVtb3ZlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5SZW1vdmVBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdSZW1vdmVBY3Rpb24ubGFiZWwnLCBcIkRpc21pc3NcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGljb246IHNlYXJjaFJlbW92ZUljb24sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVNYXRjaE9yTWF0Y2hGb2N1c0tleSksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRGVsZXRlLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU2VhcmNoQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNlYXJjaEFjdGlvbk1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVGb2N1c0tleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuTWF0Y2hGb2N1c0tleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRm9sZGVyRm9jdXNLZXkpLFxuXHRcdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJU2VhcmNoQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KHZpZXdzU2VydmljZSk7XG5cblx0XHRpZiAoIXNlYXJjaFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZWxlbWVudCA9IGNvbnRleHQ/LmVsZW1lbnQ7XG5cdFx0bGV0IHZpZXdlciA9IGNvbnRleHQ/LnZpZXdlcjtcblx0XHRpZiAoIXZpZXdlcikge1xuXHRcdFx0dmlld2VyID0gc2VhcmNoVmlldy5nZXRDb250cm9sKCk7XG5cdFx0fVxuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0ZWxlbWVudCA9IHZpZXdlci5nZXRGb2N1cygpWzBdID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50c1RvUmVtb3ZlID0gZ2V0RWxlbWVudHNUb09wZXJhdGVPbih2aWV3ZXIsIGVsZW1lbnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpKTtcblx0XHRsZXQgZm9jdXNFbGVtZW50ID0gdmlld2VyLmdldEZvY3VzKClbMF0gPz8gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGVsZW1lbnRzVG9SZW1vdmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFmb2N1c0VsZW1lbnQgfHwgKGlzU2VhcmNoUmVzdWx0KGZvY3VzRWxlbWVudCkpKSB7XG5cdFx0XHRmb2N1c0VsZW1lbnQgPSBlbGVtZW50O1xuXHRcdH1cblxuXHRcdGxldCBuZXh0Rm9jdXNFbGVtZW50O1xuXHRcdGNvbnN0IHNob3VsZFJlZm9jdXNNYXRjaCA9IHNob3VsZFJlZm9jdXMoZWxlbWVudHNUb1JlbW92ZSwgZm9jdXNFbGVtZW50KTtcblx0XHRpZiAoZm9jdXNFbGVtZW50ICYmIHNob3VsZFJlZm9jdXNNYXRjaCkge1xuXHRcdFx0bmV4dEZvY3VzRWxlbWVudCA9IGF3YWl0IGdldEVsZW1lbnRUb0ZvY3VzQWZ0ZXJSZW1vdmVkKHZpZXdlciwgZm9jdXNFbGVtZW50LCBlbGVtZW50c1RvUmVtb3ZlKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWFyY2hSZXN1bHQgPSBzZWFyY2hWaWV3LnNlYXJjaFJlc3VsdDtcblxuXHRcdGlmIChzZWFyY2hSZXN1bHQpIHtcblx0XHRcdHNlYXJjaFJlc3VsdC5iYXRjaFJlbW92ZShlbGVtZW50c1RvUmVtb3ZlKTtcblx0XHR9XG5cblx0XHRhd2FpdCBzZWFyY2hWaWV3LnF1ZXVlUmVmcmVzaFRyZWUoKTsgLy8gd2FpdCBmb3IgcmVmcmVzaFRyZWUgdG8gZmluaXNoXG5cblx0XHRpZiAoZm9jdXNFbGVtZW50ICYmIHNob3VsZFJlZm9jdXNNYXRjaCkge1xuXHRcdFx0aWYgKCFuZXh0Rm9jdXNFbGVtZW50KSB7XG5cdFx0XHRcdC8vIElnbm9yZSBlcnJvciBpZiB0aGVyZSBhcmUgbm8gZWxlbWVudHMgbGVmdFxuXHRcdFx0XHRuZXh0Rm9jdXNFbGVtZW50ID0gYXdhaXQgZ2V0TGFzdE5vZGVGcm9tU2FtZVR5cGUodmlld2VyLCBmb2N1c0VsZW1lbnQpLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChuZXh0Rm9jdXNFbGVtZW50ICYmICFhcnJheUNvbnRhaW5zRWxlbWVudE9yUGFyZW50KG5leHRGb2N1c0VsZW1lbnQsIGVsZW1lbnRzVG9SZW1vdmUpKSB7XG5cdFx0XHRcdHZpZXdlci5yZXZlYWwobmV4dEZvY3VzRWxlbWVudCk7XG5cdFx0XHRcdHZpZXdlci5zZXRGb2N1cyhbbmV4dEZvY3VzRWxlbWVudF0sIGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQoKSk7XG5cdFx0XHRcdHZpZXdlci5zZXRTZWxlY3Rpb24oW25leHRGb2N1c0VsZW1lbnRdLCBnZXRTZWxlY3Rpb25LZXlib2FyZEV2ZW50KCkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIWVxdWFscyh2aWV3ZXIuZ2V0Rm9jdXMoKSwgdmlld2VyLmdldFNlbGVjdGlvbigpKSkge1xuXHRcdFx0dmlld2VyLnNldFNlbGVjdGlvbih2aWV3ZXIuZ2V0Rm9jdXMoKSk7XG5cdFx0fVxuXG5cdFx0dmlld2VyLmRvbUZvY3VzKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlcGxhY2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoXG5cdCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5SZXBsYWNlQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignbWF0Y2gucmVwbGFjZS5sYWJlbCcsIFwiUmVwbGFjZVwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdWaXNpYmxlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXBsYWNlQWN0aXZlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5NYXRjaEZvY3VzS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5Jc0VkaXRhYmxlSXRlbUtleSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5EaWdpdDEsXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogc2VhcmNoUmVwbGFjZUljb24sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNlYXJjaENvbnRleHQsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlJlcGxhY2VBY3RpdmVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lk1hdGNoRm9jdXNLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LklzRWRpdGFibGVJdGVtS2V5KSxcblx0XHRcdFx0XHRncm91cDogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU2VhcmNoQWN0aW9uTWVudSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuUmVwbGFjZUFjdGl2ZUtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuTWF0Y2hGb2N1c0tleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSXNFZGl0YWJsZUl0ZW1LZXkpLFxuXHRcdFx0XHRcdGdyb3VwOiAnaW5saW5lJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElTZWFyY2hBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gcGVyZm9ybVJlcGxhY2UoYWNjZXNzb3IsIGNvbnRleHQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlcGxhY2VBbGxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlJlcGxhY2VBbGxJbkZpbGVBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdmaWxlLnJlcGxhY2VBbGwubGFiZWwnLCBcIlJlcGxhY2UgQWxsXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlJlcGxhY2VBY3RpdmVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVGb2N1c0tleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSXNFZGl0YWJsZUl0ZW1LZXkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRGlnaXQxLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXJdLFxuXHRcdFx0fSxcblx0XHRcdGljb246IHNlYXJjaFJlcGxhY2VJY29uLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TZWFyY2hDb250ZXh0LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXBsYWNlQWN0aXZlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlRm9jdXNLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LklzRWRpdGFibGVJdGVtS2V5KSxcblx0XHRcdFx0XHRncm91cDogJ3NlYXJjaCcsXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU2VhcmNoQWN0aW9uTWVudSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuUmVwbGFjZUFjdGl2ZUtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRmlsZUZvY3VzS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5Jc0VkaXRhYmxlSXRlbUtleSksXG5cdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSVNlYXJjaEFjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiBwZXJmb3JtUmVwbGFjZShhY2Nlc3NvciwgY29udGV4dCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVwbGFjZUFsbEluRm9sZGVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuUmVwbGFjZUFsbEluRm9sZGVyQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignZmlsZS5yZXBsYWNlQWxsLmxhYmVsJywgXCJSZXBsYWNlIEFsbFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdWaXNpYmxlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXBsYWNlQWN0aXZlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5Gb2xkZXJGb2N1c0tleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSXNFZGl0YWJsZUl0ZW1LZXkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRGlnaXQxLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXJdLFxuXHRcdFx0fSxcblx0XHRcdGljb246IHNlYXJjaFJlcGxhY2VJY29uLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TZWFyY2hDb250ZXh0LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXBsYWNlQWN0aXZlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5Gb2xkZXJGb2N1c0tleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSXNFZGl0YWJsZUl0ZW1LZXkpLFxuXHRcdFx0XHRcdGdyb3VwOiAnc2VhcmNoJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TZWFyY2hBY3Rpb25NZW51LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXBsYWNlQWN0aXZlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5Gb2xkZXJGb2N1c0tleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSXNFZGl0YWJsZUl0ZW1LZXkpLFxuXHRcdFx0XHRcdGdyb3VwOiAnaW5saW5lJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElTZWFyY2hBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gcGVyZm9ybVJlcGxhY2UoYWNjZXNzb3IsIGNvbnRleHQpO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBIZWxwZXJzXG5cbmFzeW5jIGZ1bmN0aW9uIHBlcmZvcm1SZXBsYWNlKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRjb250ZXh0OiBJU2VhcmNoQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCkge1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0Y29uc3Qgdmlld2xldDogU2VhcmNoVmlldyB8IHVuZGVmaW5lZCA9IGdldFNlYXJjaFZpZXcodmlld3NTZXJ2aWNlKTtcblx0Y29uc3Qgdmlld2VyOiBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPElTZWFyY2hSZXN1bHQsIFJlbmRlcmFibGVNYXRjaD4gfCB1bmRlZmluZWQgPSBjb250ZXh0Py52aWV3ZXIgPz8gdmlld2xldD8uZ2V0Q29udHJvbCgpO1xuXG5cdGlmICghdmlld2VyKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IGVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCB8IG51bGwgPSBjb250ZXh0Py5lbGVtZW50ID8/IHZpZXdlci5nZXRGb2N1cygpWzBdO1xuXG5cdC8vIHNpbmNlIG11bHRpcGxlIGVsZW1lbnRzIGNhbiBiZSBzZWxlY3RlZCwgd2UgbmVlZCB0byBjaGVjayB0aGUgdHlwZSBvZiB0aGUgRm9sZGVyTWF0Y2gvRmlsZU1hdGNoL01hdGNoIGJlZm9yZSB3ZSBwZXJmb3JtIHRoZSByZXBsYWNlLlxuXHRjb25zdCBlbGVtZW50c1RvUmVwbGFjZSA9IGdldEVsZW1lbnRzVG9PcGVyYXRlT24odmlld2VyLCBlbGVtZW50ID8/IHVuZGVmaW5lZCwgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJykpO1xuXHRsZXQgZm9jdXNFbGVtZW50ID0gdmlld2VyLmdldEZvY3VzKClbMF07XG5cblx0aWYgKCFmb2N1c0VsZW1lbnQgfHwgKGZvY3VzRWxlbWVudCAmJiAhYXJyYXlDb250YWluc0VsZW1lbnRPclBhcmVudChmb2N1c0VsZW1lbnQsIGVsZW1lbnRzVG9SZXBsYWNlKSkgfHwgKGlzU2VhcmNoUmVzdWx0KGZvY3VzRWxlbWVudCkpKSB7XG5cdFx0Zm9jdXNFbGVtZW50ID0gZWxlbWVudDtcblx0fVxuXG5cdGlmIChlbGVtZW50c1RvUmVwbGFjZS5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0bGV0IG5leHRGb2N1c0VsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCB8IHVuZGVmaW5lZDtcblx0aWYgKGZvY3VzRWxlbWVudCkge1xuXHRcdG5leHRGb2N1c0VsZW1lbnQgPSBhd2FpdCBnZXRFbGVtZW50VG9Gb2N1c0FmdGVyUmVtb3ZlZCh2aWV3ZXIsIGZvY3VzRWxlbWVudCwgZWxlbWVudHNUb1JlcGxhY2UpO1xuXHR9XG5cblx0Y29uc3Qgc2VhcmNoUmVzdWx0ID0gdmlld2xldD8uc2VhcmNoUmVzdWx0O1xuXG5cdGlmIChzZWFyY2hSZXN1bHQpIHtcblx0XHRhd2FpdCBzZWFyY2hSZXN1bHQuYmF0Y2hSZXBsYWNlKGVsZW1lbnRzVG9SZXBsYWNlKTtcblx0fVxuXG5cdGF3YWl0IHZpZXdsZXQ/LnF1ZXVlUmVmcmVzaFRyZWUoKTsgLy8gd2FpdCBmb3IgcmVmcmVzaFRyZWUgdG8gZmluaXNoXG5cblx0aWYgKGZvY3VzRWxlbWVudCkge1xuXHRcdGlmICghbmV4dEZvY3VzRWxlbWVudCkge1xuXHRcdFx0bmV4dEZvY3VzRWxlbWVudCA9IGF3YWl0IGdldExhc3ROb2RlRnJvbVNhbWVUeXBlKHZpZXdlciwgZm9jdXNFbGVtZW50KTtcblx0XHR9XG5cblx0XHRpZiAobmV4dEZvY3VzRWxlbWVudCkge1xuXHRcdFx0dmlld2VyLnJldmVhbChuZXh0Rm9jdXNFbGVtZW50KTtcblx0XHRcdHZpZXdlci5zZXRGb2N1cyhbbmV4dEZvY3VzRWxlbWVudF0sIGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQoKSk7XG5cdFx0XHR2aWV3ZXIuc2V0U2VsZWN0aW9uKFtuZXh0Rm9jdXNFbGVtZW50XSwgZ2V0U2VsZWN0aW9uS2V5Ym9hcmRFdmVudCgpKTtcblxuXHRcdFx0aWYgKGlzU2VhcmNoVHJlZU1hdGNoKG5leHRGb2N1c0VsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnN0IHVzZVJlcGxhY2VQcmV2aWV3ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KCkuc2VhcmNoPy51c2VSZXBsYWNlUHJldmlldztcblx0XHRcdFx0aWYgKCF1c2VSZXBsYWNlUHJldmlldyB8fCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBoYXNUb09wZW5GaWxlKGFjY2Vzc29yLCBuZXh0Rm9jdXNFbGVtZW50ISkpIHx8IG5leHRGb2N1c0VsZW1lbnQgaW5zdGFuY2VvZiBNYXRjaEluTm90ZWJvb2spIHtcblx0XHRcdFx0XHR2aWV3bGV0Py5vcGVuKG5leHRGb2N1c0VsZW1lbnQsIHRydWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJUmVwbGFjZVNlcnZpY2UpKS5vcGVuUmVwbGFjZVByZXZpZXcobmV4dEZvY3VzRWxlbWVudCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNTZWFyY2hUcmVlRmlsZU1hdGNoKG5leHRGb2N1c0VsZW1lbnQpKSB7XG5cdFx0XHRcdHZpZXdsZXQ/Lm9wZW4obmV4dEZvY3VzRWxlbWVudCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cblxuXHR2aWV3ZXIuZG9tRm9jdXMoKTtcbn1cblxuZnVuY3Rpb24gaGFzVG9PcGVuRmlsZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY3VyckJvdHRvbUVsZW06IFJlbmRlcmFibGVNYXRjaCk6IGJvb2xlYW4ge1xuXHRpZiAoIShpc1NlYXJjaFRyZWVNYXRjaChjdXJyQm90dG9tRWxlbSkpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yO1xuXHRjb25zdCBmaWxlID0gYWN0aXZlRWRpdG9yPy5yZXNvdXJjZTtcblx0aWYgKGZpbGUpIHtcblx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElVcmlJZGVudGl0eVNlcnZpY2UpLmV4dFVyaS5pc0VxdWFsKGZpbGUsIGN1cnJCb3R0b21FbGVtLnBhcmVudCgpLnJlc291cmNlKTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVMZXZlbHMoZWxlbTE6IFJlbmRlcmFibGVNYXRjaCwgZWxlbTI6IFJlbmRlcmFibGVNYXRjaCkge1xuXHRpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbTEpKSB7XG5cdFx0aWYgKGlzU2VhcmNoVHJlZU1hdGNoKGVsZW0yKSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZWxlbTEpKSB7XG5cdFx0aWYgKGlzU2VhcmNoVHJlZU1hdGNoKGVsZW0yKSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVGaWxlTWF0Y2goZWxlbTIpKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChlbGVtMSkpIHtcblx0XHRpZiAoaXNUZXh0U2VhcmNoSGVhZGluZyhlbGVtMikpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9IGVsc2UgaWYgKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoKGVsZW0yKSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRpZiAoaXNUZXh0U2VhcmNoSGVhZGluZyhlbGVtMikpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIGVsZW1lbnQgdG8gZm9jdXMgYWZ0ZXIgcmVtb3ZpbmcgdGhlIGdpdmVuIGVsZW1lbnRcbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEVsZW1lbnRUb0ZvY3VzQWZ0ZXJSZW1vdmVkKHZpZXdlcjogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+LCBlbGVtZW50OiBSZW5kZXJhYmxlTWF0Y2gsIGVsZW1lbnRzVG9SZW1vdmU6IFJlbmRlcmFibGVNYXRjaFtdKTogUHJvbWlzZTxSZW5kZXJhYmxlTWF0Y2ggfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgbmF2aWdhdG9yOiBJVHJlZU5hdmlnYXRvcjxhbnk+ID0gdmlld2VyLm5hdmlnYXRlKGVsZW1lbnQpO1xuXHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZWxlbWVudCkpIHtcblx0XHR3aGlsZSAoISFuYXZpZ2F0b3IubmV4dCgpICYmICghaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2gobmF2aWdhdG9yLmN1cnJlbnQoKSkgfHwgYXJyYXlDb250YWluc0VsZW1lbnRPclBhcmVudChuYXZpZ2F0b3IuY3VycmVudCgpLCBlbGVtZW50c1RvUmVtb3ZlKSkpIHsgfVxuXHR9IGVsc2UgaWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChlbGVtZW50KSkge1xuXHRcdHdoaWxlICghIW5hdmlnYXRvci5uZXh0KCkgJiYgKCFpc1NlYXJjaFRyZWVGaWxlTWF0Y2gobmF2aWdhdG9yLmN1cnJlbnQoKSkgfHwgYXJyYXlDb250YWluc0VsZW1lbnRPclBhcmVudChuYXZpZ2F0b3IuY3VycmVudCgpLCBlbGVtZW50c1RvUmVtb3ZlKSkpIHtcblx0XHRcdC8vIE5ldmVyIGV4cGFuZCBBSSBzZWFyY2ggcmVzdWx0cyBieSBkZWZhdWx0XG5cdFx0XHRpZiAobmF2aWdhdG9yLmN1cnJlbnQoKSBpbnN0YW5jZW9mIEFJVGV4dFNlYXJjaEhlYWRpbmdJbXBsKSB7XG5cdFx0XHRcdHJldHVybiBuYXZpZ2F0b3IuY3VycmVudCgpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdmlld2VyLmV4cGFuZChuYXZpZ2F0b3IuY3VycmVudCgpKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0d2hpbGUgKG5hdmlnYXRvci5uZXh0KCkgJiYgKCFpc1NlYXJjaFRyZWVNYXRjaChuYXZpZ2F0b3IuY3VycmVudCgpKSB8fCBhcnJheUNvbnRhaW5zRWxlbWVudE9yUGFyZW50KG5hdmlnYXRvci5jdXJyZW50KCksIGVsZW1lbnRzVG9SZW1vdmUpKSkge1xuXHRcdFx0Ly8gTmV2ZXIgZXhwYW5kIEFJIHNlYXJjaCByZXN1bHRzIGJ5IGRlZmF1bHRcblx0XHRcdGlmIChuYXZpZ2F0b3IuY3VycmVudCgpIGluc3RhbmNlb2YgQUlUZXh0U2VhcmNoSGVhZGluZ0ltcGwpIHtcblx0XHRcdFx0cmV0dXJuIG5hdmlnYXRvci5jdXJyZW50KCk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB2aWV3ZXIuZXhwYW5kKG5hdmlnYXRvci5jdXJyZW50KCkpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gbmF2aWdhdG9yLmN1cnJlbnQoKTtcbn1cblxuLyoqKlxuICogRmluZHMgdGhlIGxhc3QgZWxlbWVudCBpbiB0aGUgdHJlZSB3aXRoIHRoZSBzYW1lIHR5cGUgYXMgYGVsZW1lbnRgXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZXRMYXN0Tm9kZUZyb21TYW1lVHlwZSh2aWV3ZXI6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNlYXJjaFJlc3VsdCwgUmVuZGVyYWJsZU1hdGNoPiwgZWxlbWVudDogUmVuZGVyYWJsZU1hdGNoKTogUHJvbWlzZTxSZW5kZXJhYmxlTWF0Y2ggfCB1bmRlZmluZWQ+IHtcblx0bGV0IGxhc3RFbGVtOiBSZW5kZXJhYmxlTWF0Y2ggfCBudWxsID0gdmlld2VyLmxhc3RWaXNpYmxlRWxlbWVudCA/PyBudWxsO1xuXG5cdHdoaWxlIChsYXN0RWxlbSkge1xuXHRcdGNvbnN0IGNvbXBhcmVWYWwgPSBjb21wYXJlTGV2ZWxzKGVsZW1lbnQsIGxhc3RFbGVtKTtcblx0XHRpZiAoY29tcGFyZVZhbCA9PT0gLTEpIHtcblx0XHRcdGNvbnN0IGV4cGFuZGVkID0gYXdhaXQgdmlld2VyLmV4cGFuZChsYXN0RWxlbSk7XG5cdFx0XHRpZiAoIWV4cGFuZGVkKSB7XG5cdFx0XHRcdHJldHVybiBsYXN0RWxlbTtcblx0XHRcdH1cblx0XHRcdGxhc3RFbGVtID0gdmlld2VyLmxhc3RWaXNpYmxlRWxlbWVudDtcblx0XHR9IGVsc2UgaWYgKGNvbXBhcmVWYWwgPT09IDEpIHtcblx0XHRcdGNvbnN0IHBvdGVudGlhbExhc3RFbGVtID0gdmlld2VyLmdldFBhcmVudEVsZW1lbnQobGFzdEVsZW0pO1xuXHRcdFx0aWYgKGlzU2VhcmNoUmVzdWx0KHBvdGVudGlhbExhc3RFbGVtKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhc3RFbGVtID0gcG90ZW50aWFsTGFzdEVsZW07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBsYXN0RWxlbTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLGlDQUFxRTtBQUM5RSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQix5QkFBeUI7QUFFcEQsWUFBWSxlQUFlO0FBQzNCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFVBQVUsd0JBQXdCLGVBQWUscUJBQXFCO0FBQy9FLFNBQVMs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QUFzQiw4QkFBOEIsUUFBNEUsU0FBMEIsa0JBQTJFO0FBQ3BPLFFBQU0sWUFBaUMsT0FBTyxTQUFTLE9BQU87QUFDOUQsTUFBSSx3QkFBd0IsT0FBTyxHQUFHO0FBQ3JDLFdBQU8sQ0FBQyxDQUFDLFVBQVUsS0FBSyxNQUFNLENBQUMsd0JBQXdCLFVBQVUsUUFBUSxDQUFDLEtBQUssNkJBQTZCLFVBQVUsUUFBUSxHQUFHLGdCQUFnQixJQUFJO0FBQUEsSUFBRTtBQUFBLEVBQ3hKLFdBQVcsc0JBQXNCLE9BQU8sR0FBRztBQUMxQyxXQUFPLENBQUMsQ0FBQyxVQUFVLEtBQUssTUFBTSxDQUFDLHNCQUFzQixVQUFVLFFBQVEsQ0FBQyxLQUFLLDZCQUE2QixVQUFVLFFBQVEsR0FBRyxnQkFBZ0IsSUFBSTtBQUVsSixVQUFJLFVBQVUsUUFBUSxhQUFhLHlCQUF5QjtBQUMzRCxlQUFPLFVBQVUsUUFBUTtBQUFBLE1BQzFCO0FBQ0EsWUFBTSxPQUFPLE9BQU8sVUFBVSxRQUFRLENBQUM7QUFBQSxJQUN4QztBQUFBLEVBQ0QsT0FBTztBQUNOLFdBQU8sVUFBVSxLQUFLLE1BQU0sQ0FBQyxrQkFBa0IsVUFBVSxRQUFRLENBQUMsS0FBSyw2QkFBNkIsVUFBVSxRQUFRLEdBQUcsZ0JBQWdCLElBQUk7QUFFNUksVUFBSSxVQUFVLFFBQVEsYUFBYSx5QkFBeUI7QUFDM0QsZUFBTyxVQUFVLFFBQVE7QUFBQSxNQUMxQjtBQUNBLFlBQU0sT0FBTyxPQUFPLFVBQVUsUUFBUSxDQUFDO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBQ0EsU0FBTyxVQUFVLFFBQVE7QUFDMUI7QUFLQSxlQUFzQix3QkFBd0IsUUFBNEUsU0FBZ0U7QUFDekwsTUFBSSxXQUFtQyxPQUFPLHNCQUFzQjtBQUVwRSxTQUFPLFVBQVU7QUFDaEIsVUFBTSxhQUFhLGNBQWMsU0FBUyxRQUFRO0FBQ2xELFFBQUksZUFBZSxJQUFJO0FBQ3RCLFlBQU0sV0FBVyxNQUFNLE9BQU8sT0FBTyxRQUFRO0FBQzdDLFVBQUksQ0FBQyxVQUFVO0FBQ2QsZUFBTztBQUFBLE1BQ1I7QUFDQSxpQkFBVyxPQUFPO0FBQUEsSUFDbkIsV0FBVyxlQUFlLEdBQUc7QUFDNUIsWUFBTSxvQkFBb0IsT0FBTyxpQkFBaUIsUUFBUTtBQUMxRCxVQUFJLGVBQWUsaUJBQWlCLEdBQUc7QUFDdEM7QUFBQSxNQUNELE9BQU87QUFDTixtQkFBVztBQUFBLE1BQ1o7QUFBQSxJQUNELE9BQU87QUFDTixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImFjY2Vzc29yIl0KfQo=
