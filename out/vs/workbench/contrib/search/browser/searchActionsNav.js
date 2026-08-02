var _a;
import { isMacintosh } from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import * as Constants from "../common/constants.js";
import * as SearchEditorConstants from "../../searchEditor/browser/constants.js";
import { SearchEditorInput } from "../../searchEditor/browser/searchEditorInput.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleWholeWordKeybinding } from "../../../../editor/contrib/find/browser/findModel.js";
import { category, getSearchView, openSearchView } from "./searchActionsBase.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { getActiveElement } from "../../../../base/browser/dom.js";
import { isSearchTreeFolderMatch } from "./searchTreeModel/searchTreeCommon.js";
registerAction2(class ToggleQueryDetailsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleQueryDetailsActionId,
      title: nls.localize2("ToggleQueryDetailsAction.label", "Toggle Query Details"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.or(Constants.SearchContext.SearchViewFocusedKey, SearchEditorConstants.InSearchEditor),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyJ
      }
    });
  }
  run(accessor, ...args) {
    const options = args[0];
    const contextService = accessor.get(IContextKeyService).getContext(getActiveElement());
    if (contextService.getValue(SearchEditorConstants.InSearchEditor.serialize())) {
      accessor.get(IEditorService).activeEditorPane.toggleQueryDetails(options?.show);
    } else if (contextService.getValue(Constants.SearchContext.SearchViewFocusedKey.serialize())) {
      const searchView = getSearchView(accessor.get(IViewsService));
      assertReturnsDefined(searchView).toggleQueryDetails(void 0, options?.show);
    }
  }
});
registerAction2(class CloseReplaceAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.CloseReplaceWidgetActionId,
      title: nls.localize2("CloseReplaceWidget.label", "Close Replace Widget"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.ReplaceInputBoxFocusedKey),
        primary: KeyCode.Escape
      }
    });
  }
  run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      searchView.searchAndReplaceWidget.toggleReplace(false);
      searchView.searchAndReplaceWidget.focus();
    }
    return Promise.resolve(null);
  }
});
registerAction2(class ToggleCaseSensitiveCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleCaseSensitiveCommandId,
      title: nls.localize2("ToggleCaseSensitiveCommandId.label", "Toggle Case Sensitive"),
      category,
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: isMacintosh ? ContextKeyExpr.and(Constants.SearchContext.SearchViewFocusedKey, Constants.SearchContext.FileMatchOrFolderMatchFocusKey.toNegated()) : Constants.SearchContext.SearchViewFocusedKey
      }, ToggleCaseSensitiveKeybinding)
    });
  }
  async run(accessor) {
    toggleCaseSensitiveCommand(accessor);
  }
});
registerAction2(class ToggleWholeWordCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleWholeWordCommandId,
      title: nls.localize2("ToggleWholeWordCommandId.label", "Toggle Whole Word"),
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: Constants.SearchContext.SearchViewFocusedKey
      }, ToggleWholeWordKeybinding),
      category
    });
  }
  async run(accessor) {
    return toggleWholeWordCommand(accessor);
  }
});
registerAction2(class ToggleRegexCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleRegexCommandId,
      title: nls.localize2("ToggleRegexCommandId.label", "Toggle Regex"),
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: Constants.SearchContext.SearchViewFocusedKey
      }, ToggleRegexKeybinding),
      category
    });
  }
  async run(accessor) {
    return toggleRegexCommand(accessor);
  }
});
registerAction2(class TogglePreserveCaseAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.TogglePreserveCaseId,
      title: nls.localize2("TogglePreserveCaseId.label", "Toggle Preserve Case"),
      keybinding: Object.assign({
        weight: KeybindingWeight.WorkbenchContrib,
        when: Constants.SearchContext.SearchViewFocusedKey
      }, TogglePreserveCaseKeybinding),
      category
    });
  }
  async run(accessor) {
    return togglePreserveCaseCommand(accessor);
  }
});
registerAction2(class OpenMatchAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.OpenMatch,
      title: nls.localize2("OpenMatch.label", "Open Match"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
        primary: KeyCode.Enter,
        mac: {
          primary: KeyCode.Enter,
          secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
        }
      }
    });
  }
  run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      const tree = searchView.getControl();
      const viewer = searchView.getControl();
      const focus = tree.getFocus()[0];
      if (isSearchTreeFolderMatch(focus)) {
        viewer.toggleCollapsed(focus);
      } else {
        searchView.open(tree.getFocus()[0], false, false, true);
      }
    }
  }
});
registerAction2(class OpenMatchToSideAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.OpenMatchToSide,
      title: nls.localize2("OpenMatchToSide.label", "Open Match To Side"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.Enter
        }
      }
    });
  }
  run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      const tree = searchView.getControl();
      searchView.open(tree.getFocus()[0], false, true, true);
    }
  }
});
registerAction2(class AddCursorsAtSearchResultsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.AddCursorsAtSearchResults,
      title: nls.localize2("AddCursorsAtSearchResults.label", "Add Cursors at Search Results"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.FileMatchOrMatchFocusKey),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL
      },
      category
    });
  }
  async run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    if (searchView) {
      const tree = searchView.getControl();
      searchView.openEditorWithMultiCursor(tree.getFocus()[0]);
    }
  }
});
registerAction2(class FocusNextInputAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusNextInputActionId,
      title: nls.localize2("FocusNextInputAction.label", "Focus Next Input"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.or(
          ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.SearchContext.InputBoxFocusedKey),
          ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.InputBoxFocusedKey)
        ),
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
      editorService.activeEditorPane.focusNextInput();
    }
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.focusNextInputBox();
  }
});
registerAction2(class FocusPreviousInputAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusPreviousInputActionId,
      title: nls.localize2("FocusPreviousInputAction.label", "Focus Previous Input"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.or(
          ContextKeyExpr.and(SearchEditorConstants.InSearchEditor, Constants.SearchContext.InputBoxFocusedKey),
          ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, Constants.SearchContext.InputBoxFocusedKey, Constants.SearchContext.SearchInputBoxFocusedKey.toNegated())
        ),
        primary: KeyMod.CtrlCmd | KeyCode.UpArrow
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const input = editorService.activeEditor;
    if (input instanceof SearchEditorInput) {
      editorService.activeEditorPane.focusPrevInput();
    }
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.focusPreviousInputBox();
  }
});
registerAction2(class FocusSearchFromResultsAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusSearchFromResults,
      title: nls.localize2("FocusSearchFromResults.label", "Focus Search From Results"),
      category,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(Constants.SearchContext.SearchViewVisibleKey, ContextKeyExpr.or(Constants.SearchContext.FirstMatchFocusKey, CONTEXT_ACCESSIBILITY_MODE_ENABLED)),
        primary: KeyMod.CtrlCmd | KeyCode.UpArrow
      }
    });
  }
  run(accessor) {
    const searchView = getSearchView(accessor.get(IViewsService));
    searchView?.focusPreviousInputBox();
  }
});
registerAction2((_a = class extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ToggleSearchOnTypeActionId,
      title: nls.localize2("toggleTabs", "Toggle Search on Type"),
      category
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const searchOnType = configurationService.getValue(_a.searchOnTypeKey);
    return configurationService.updateValue(_a.searchOnTypeKey, !searchOnType);
  }
}, _a.searchOnTypeKey = "search.searchOnType", _a));
registerAction2(class FocusSearchListCommandAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusSearchListCommandID,
      title: nls.localize2("focusSearchListCommandLabel", "Focus List"),
      category,
      f1: true
    });
  }
  async run(accessor) {
    focusSearchListCommand(accessor);
  }
});
registerAction2(class FocusNextSearchResultAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusNextSearchResultActionId,
      title: nls.localize2("FocusNextSearchResult.label", "Focus Next Search Result"),
      keybinding: [{
        primary: KeyCode.F4,
        weight: KeybindingWeight.WorkbenchContrib
      }],
      category,
      f1: true,
      precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, SearchEditorConstants.InSearchEditor)
    });
  }
  async run(accessor) {
    return await focusNextSearchResult(accessor);
  }
});
registerAction2(class FocusPreviousSearchResultAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.FocusPreviousSearchResultActionId,
      title: nls.localize2("FocusPreviousSearchResult.label", "Focus Previous Search Result"),
      keybinding: [{
        primary: KeyMod.Shift | KeyCode.F4,
        weight: KeybindingWeight.WorkbenchContrib
      }],
      category,
      f1: true,
      precondition: ContextKeyExpr.or(Constants.SearchContext.HasSearchResults, SearchEditorConstants.InSearchEditor)
    });
  }
  async run(accessor) {
    return await focusPreviousSearchResult(accessor);
  }
});
registerAction2(class ReplaceInFilesAction extends Action2 {
  constructor() {
    super({
      id: Constants.SearchCommandIds.ReplaceInFilesActionId,
      title: nls.localize2("replaceInFiles", "Replace in Files"),
      keybinding: [{
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyH,
        weight: KeybindingWeight.WorkbenchContrib
      }],
      category,
      f1: true,
      precondition: IsSessionsWindowContext.negate(),
      menu: [{
        id: MenuId.MenubarEditMenu,
        group: "4_find_global",
        order: 2,
        when: IsSessionsWindowContext.negate()
      }]
    });
  }
  async run(accessor) {
    return await findOrReplaceInFiles(accessor, true);
  }
});
function toggleCaseSensitiveCommand(accessor) {
  const searchView = getSearchView(accessor.get(IViewsService));
  searchView?.toggleCaseSensitive();
}
function toggleWholeWordCommand(accessor) {
  const searchView = getSearchView(accessor.get(IViewsService));
  searchView?.toggleWholeWords();
}
function toggleRegexCommand(accessor) {
  const searchView = getSearchView(accessor.get(IViewsService));
  searchView?.toggleRegex();
}
function togglePreserveCaseCommand(accessor) {
  const searchView = getSearchView(accessor.get(IViewsService));
  searchView?.togglePreserveCase();
}
const focusSearchListCommand = (accessor) => {
  const viewsService = accessor.get(IViewsService);
  openSearchView(viewsService).then((searchView) => {
    searchView?.moveFocusToResults();
  });
};
async function focusNextSearchResult(accessor) {
  const editorService = accessor.get(IEditorService);
  const input = editorService.activeEditor;
  if (input instanceof SearchEditorInput) {
    return editorService.activeEditorPane.focusNextResult();
  }
  return openSearchView(accessor.get(IViewsService)).then((searchView) => searchView?.selectNextMatch());
}
async function focusPreviousSearchResult(accessor) {
  const editorService = accessor.get(IEditorService);
  const input = editorService.activeEditor;
  if (input instanceof SearchEditorInput) {
    return editorService.activeEditorPane.focusPreviousResult();
  }
  return openSearchView(accessor.get(IViewsService)).then((searchView) => searchView?.selectPreviousMatch());
}
async function findOrReplaceInFiles(accessor, expandSearchReplaceWidget) {
  return openSearchView(accessor.get(IViewsService), false).then((openedView) => {
    if (openedView) {
      const searchAndReplaceWidget = openedView.searchAndReplaceWidget;
      searchAndReplaceWidget.toggleReplace(expandSearchReplaceWidget);
      const updatedText = openedView.updateTextFromFindWidgetOrSelection({ allowUnselectedWord: !expandSearchReplaceWidget });
      openedView.searchAndReplaceWidget.focus(void 0, updatedText, updatedText);
    }
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NlYXJjaC9icm93c2VyL3NlYXJjaEFjdGlvbnNOYXYudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRIYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBDb25zdGFudHMgZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgKiBhcyBTZWFyY2hFZGl0b3JDb25zdGFudHMgZnJvbSAnLi4vLi4vc2VhcmNoRWRpdG9yL2Jyb3dzZXIvY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IFNlYXJjaEVkaXRvciB9IGZyb20gJy4uLy4uL3NlYXJjaEVkaXRvci9icm93c2VyL3NlYXJjaEVkaXRvci5qcyc7XG5pbXBvcnQgeyBTZWFyY2hFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL3NlYXJjaEVkaXRvci9icm93c2VyL3NlYXJjaEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFRvZ2dsZUNhc2VTZW5zaXRpdmVLZXliaW5kaW5nLCBUb2dnbGVQcmVzZXJ2ZUNhc2VLZXliaW5kaW5nLCBUb2dnbGVSZWdleEtleWJpbmRpbmcsIFRvZ2dsZVdob2xlV29yZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9maW5kL2Jyb3dzZXIvZmluZE1vZGVsLmpzJztcbmltcG9ydCB7IGNhdGVnb3J5LCBnZXRTZWFyY2hWaWV3LCBvcGVuU2VhcmNoVmlldyB9IGZyb20gJy4vc2VhcmNoQWN0aW9uc0Jhc2UuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRmlsZU1hdGNoT3JNYXRjaCwgUmVuZGVyYWJsZU1hdGNoLCBJU2VhcmNoUmVzdWx0LCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaCB9IGZyb20gJy4vc2VhcmNoVHJlZU1vZGVsL3NlYXJjaFRyZWVDb21tb24uanMnO1xuXG4vLyNyZWdpb24gQWN0aW9uczogQ2hhbmdpbmcgU2VhcmNoIElucHV0IE9wdGlvbnNcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVRdWVyeURldGFpbHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlRvZ2dsZVF1ZXJ5RGV0YWlsc0FjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1RvZ2dsZVF1ZXJ5RGV0YWlsc0FjdGlvbi5sYWJlbCcsIFwiVG9nZ2xlIFF1ZXJ5IERldGFpbHNcIiksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5LCBTZWFyY2hFZGl0b3JDb25zdGFudHMuSW5TZWFyY2hFZGl0b3IpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Sixcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBvcHRpb25zID0gYXJnc1swXSBhcyB7IHNob3c/OiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKS5nZXRDb250ZXh0KGdldEFjdGl2ZUVsZW1lbnQoKSk7XG5cdFx0aWYgKGNvbnRleHRTZXJ2aWNlLmdldFZhbHVlKFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvci5zZXJpYWxpemUoKSkpIHtcblx0XHRcdChhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUgYXMgU2VhcmNoRWRpdG9yKS50b2dnbGVRdWVyeURldGFpbHMob3B0aW9ucz8uc2hvdyk7XG5cdFx0fSBlbHNlIGlmIChjb250ZXh0U2VydmljZS5nZXRWYWx1ZShDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3Rm9jdXNlZEtleS5zZXJpYWxpemUoKSkpIHtcblx0XHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZChzZWFyY2hWaWV3KS50b2dnbGVRdWVyeURldGFpbHModW5kZWZpbmVkLCBvcHRpb25zPy5zaG93KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xvc2VSZXBsYWNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5DbG9zZVJlcGxhY2VXaWRnZXRBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdDbG9zZVJlcGxhY2VXaWRnZXQubGFiZWwnLCBcIkNsb3NlIFJlcGxhY2UgV2lkZ2V0XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlJlcGxhY2VJbnB1dEJveEZvY3VzZWRLZXkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cblx0XHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRcdGlmIChzZWFyY2hWaWV3KSB7XG5cdFx0XHRzZWFyY2hWaWV3LnNlYXJjaEFuZFJlcGxhY2VXaWRnZXQudG9nZ2xlUmVwbGFjZShmYWxzZSk7XG5cdFx0XHRzZWFyY2hWaWV3LnNlYXJjaEFuZFJlcGxhY2VXaWRnZXQuZm9jdXMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVDYXNlU2Vuc2l0aXZlQ29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHQpIHtcblxuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Ub2dnbGVDYXNlU2Vuc2l0aXZlQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1RvZ2dsZUNhc2VTZW5zaXRpdmVDb21tYW5kSWQubGFiZWwnLCBcIlRvZ2dsZSBDYXNlIFNlbnNpdGl2ZVwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzogT2JqZWN0LmFzc2lnbih7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBpc01hY2ludG9zaCA/IENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3Rm9jdXNlZEtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRmlsZU1hdGNoT3JGb2xkZXJNYXRjaEZvY3VzS2V5LnRvTmVnYXRlZCgpKSA6IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5LFxuXHRcdFx0fSwgVG9nZ2xlQ2FzZVNlbnNpdGl2ZUtleWJpbmRpbmcpXG5cblx0XHR9KTtcblxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHR0b2dnbGVDYXNlU2Vuc2l0aXZlQ29tbWFuZChhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlV2hvbGVXb3JkQ29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlV2hvbGVXb3JkQ29tbWFuZElkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1RvZ2dsZVdob2xlV29yZENvbW1hbmRJZC5sYWJlbCcsIFwiVG9nZ2xlIFdob2xlIFdvcmRcIiksXG5cdFx0XHRrZXliaW5kaW5nOiBPYmplY3QuYXNzaWduKHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5LFxuXHRcdFx0fSwgVG9nZ2xlV2hvbGVXb3JkS2V5YmluZGluZyksXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHRvZ2dsZVdob2xlV29yZENvbW1hbmQoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZVJlZ2V4Q29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlUmVnZXhDb21tYW5kSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignVG9nZ2xlUmVnZXhDb21tYW5kSWQubGFiZWwnLCBcIlRvZ2dsZSBSZWdleFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IE9iamVjdC5hc3NpZ24oe1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld0ZvY3VzZWRLZXksXG5cdFx0XHR9LCBUb2dnbGVSZWdleEtleWJpbmRpbmcpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiB0b2dnbGVSZWdleENvbW1hbmQoYWNjZXNzb3IpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZVByZXNlcnZlQ2FzZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlUHJlc2VydmVDYXNlSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignVG9nZ2xlUHJlc2VydmVDYXNlSWQubGFiZWwnLCBcIlRvZ2dsZSBQcmVzZXJ2ZSBDYXNlXCIpLFxuXHRcdFx0a2V5YmluZGluZzogT2JqZWN0LmFzc2lnbih7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3Rm9jdXNlZEtleSxcblx0XHRcdH0sIFRvZ2dsZVByZXNlcnZlQ2FzZUtleWJpbmRpbmcpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiB0b2dnbGVQcmVzZXJ2ZUNhc2VDb21tYW5kKGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbi8vI2VuZHJlZ2lvblxuLy8jcmVnaW9uIEFjdGlvbnM6IE9wZW5pbmcgTWF0Y2hlc1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5NYXRjaEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuT3Blbk1hdGNoLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ09wZW5NYXRjaC5sYWJlbCcsIFwiT3BlbiBNYXRjaFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdWaXNpYmxlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlTWF0Y2hPck1hdGNoRm9jdXNLZXkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3ddXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRcdGNvbnN0IHRyZWU6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNlYXJjaFJlc3VsdCwgUmVuZGVyYWJsZU1hdGNoPiA9IHNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpO1xuXHRcdFx0Y29uc3Qgdmlld2VyID0gc2VhcmNoVmlldy5nZXRDb250cm9sKCk7XG5cdFx0XHRjb25zdCBmb2N1cyA9IHRyZWUuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdFx0aWYgKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoKGZvY3VzKSkge1xuXHRcdFx0XHR2aWV3ZXIudG9nZ2xlQ29sbGFwc2VkKGZvY3VzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlYXJjaFZpZXcub3Blbig8RmlsZU1hdGNoT3JNYXRjaD50cmVlLmdldEZvY3VzKClbMF0sIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5NYXRjaFRvU2lkZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuT3Blbk1hdGNoVG9TaWRlLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ09wZW5NYXRjaFRvU2lkZS5sYWJlbCcsIFwiT3BlbiBNYXRjaCBUbyBTaWRlXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVNYXRjaE9yTWF0Y2hGb2N1c0tleSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLkVudGVyXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0aWYgKHNlYXJjaFZpZXcpIHtcblx0XHRcdGNvbnN0IHRyZWU6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNlYXJjaFJlc3VsdCwgUmVuZGVyYWJsZU1hdGNoPiA9IHNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpO1xuXHRcdFx0c2VhcmNoVmlldy5vcGVuKDxGaWxlTWF0Y2hPck1hdGNoPnRyZWUuZ2V0Rm9jdXMoKVswXSwgZmFsc2UsIHRydWUsIHRydWUpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBBZGRDdXJzb3JzQXRTZWFyY2hSZXN1bHRzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5BZGRDdXJzb3JzQXRTZWFyY2hSZXN1bHRzLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0FkZEN1cnNvcnNBdFNlYXJjaFJlc3VsdHMubGFiZWwnLCBcIkFkZCBDdXJzb3JzIGF0IFNlYXJjaCBSZXN1bHRzXCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdWaXNpYmxlS2V5LCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlTWF0Y2hPck1hdGNoRm9jdXNLZXkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5TCxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRpZiAoc2VhcmNoVmlldykge1xuXHRcdFx0Y29uc3QgdHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+ID0gc2VhcmNoVmlldy5nZXRDb250cm9sKCk7XG5cdFx0XHRzZWFyY2hWaWV3Lm9wZW5FZGl0b3JXaXRoTXVsdGlDdXJzb3IoPEZpbGVNYXRjaE9yTWF0Y2g+dHJlZS5nZXRGb2N1cygpWzBdKTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cbi8vI3JlZ2lvbiBBY3Rpb25zOiBUb2dnbGluZyBGb2N1c1xucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzTmV4dElucHV0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Gb2N1c05leHRJbnB1dEFjdGlvbklkLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0ZvY3VzTmV4dElucHV0QWN0aW9uLmxhYmVsJywgXCJGb2N1cyBOZXh0IElucHV0XCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoU2VhcmNoRWRpdG9yQ29uc3RhbnRzLkluU2VhcmNoRWRpdG9yLCBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5JbnB1dEJveEZvY3VzZWRLZXkpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hWaWV3VmlzaWJsZUtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSW5wdXRCb3hGb2N1c2VkS2V5KSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnB1dCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFNlYXJjaEVkaXRvcklucHV0KSB7XG5cdFx0XHQvLyBjYXN0IGFzIHdlIGNhbm5vdCBpbXBvcnQgU2VhcmNoRWRpdG9yIGFzIGEgdmFsdWUgYi9jIGN5Y2xpYyBkZXBlbmRlbmN5LlxuXHRcdFx0KGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSBhcyBTZWFyY2hFZGl0b3IpLmZvY3VzTmV4dElucHV0KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRzZWFyY2hWaWV3Py5mb2N1c05leHRJbnB1dEJveCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzUHJldmlvdXNJbnB1dEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuRm9jdXNQcmV2aW91c0lucHV0QWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignRm9jdXNQcmV2aW91c0lucHV0QWN0aW9uLmxhYmVsJywgXCJGb2N1cyBQcmV2aW91cyBJbnB1dFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFNlYXJjaEVkaXRvckNvbnN0YW50cy5JblNlYXJjaEVkaXRvciwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuSW5wdXRCb3hGb2N1c2VkS2V5KSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnN0YW50cy5TZWFyY2hDb250ZXh0LklucHV0Qm94Rm9jdXNlZEtleSwgQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoSW5wdXRCb3hGb2N1c2VkS2V5LnRvTmVnYXRlZCgpKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgaW5wdXQgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBTZWFyY2hFZGl0b3JJbnB1dCkge1xuXHRcdFx0Ly8gY2FzdCBhcyB3ZSBjYW5ub3QgaW1wb3J0IFNlYXJjaEVkaXRvciBhcyBhIHZhbHVlIGIvYyBjeWNsaWMgZGVwZW5kZW5jeS5cblx0XHRcdChlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUgYXMgU2VhcmNoRWRpdG9yKS5mb2N1c1ByZXZJbnB1dCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlYXJjaFZpZXcgPSBnZXRTZWFyY2hWaWV3KGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKSk7XG5cdFx0c2VhcmNoVmlldz8uZm9jdXNQcmV2aW91c0lucHV0Qm94KCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNTZWFyY2hGcm9tUmVzdWx0c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuRm9jdXNTZWFyY2hGcm9tUmVzdWx0cyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdGb2N1c1NlYXJjaEZyb21SZXN1bHRzLmxhYmVsJywgXCJGb2N1cyBTZWFyY2ggRnJvbSBSZXN1bHRzXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoVmlld1Zpc2libGVLZXksIENvbnRleHRLZXlFeHByLm9yKENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpcnN0TWF0Y2hGb2N1c0tleSwgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0XHRzZWFyY2hWaWV3Py5mb2N1c1ByZXZpb3VzSW5wdXRCb3goKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVTZWFyY2hPblR5cGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgc2VhcmNoT25UeXBlS2V5ID0gJ3NlYXJjaC5zZWFyY2hPblR5cGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlU2VhcmNoT25UeXBlQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigndG9nZ2xlVGFicycsIFwiVG9nZ2xlIFNlYXJjaCBvbiBUeXBlXCIpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0fSk7XG5cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBzZWFyY2hPblR5cGUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihUb2dnbGVTZWFyY2hPblR5cGVBY3Rpb24uc2VhcmNoT25UeXBlS2V5KTtcblx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVG9nZ2xlU2VhcmNoT25UeXBlQWN0aW9uLnNlYXJjaE9uVHlwZUtleSwgIXNlYXJjaE9uVHlwZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNTZWFyY2hMaXN0Q29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuRm9jdXNTZWFyY2hMaXN0Q29tbWFuZElELFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ2ZvY3VzU2VhcmNoTGlzdENvbW1hbmRMYWJlbCcsIFwiRm9jdXMgTGlzdFwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8YW55PiB7XG5cdFx0Zm9jdXNTZWFyY2hMaXN0Q29tbWFuZChhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNOZXh0U2VhcmNoUmVzdWx0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Gb2N1c05leHRTZWFyY2hSZXN1bHRBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdGb2N1c05leHRTZWFyY2hSZXN1bHQubGFiZWwnLCBcIkZvY3VzIE5leHQgU2VhcmNoIFJlc3VsdFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRjQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0fV0sXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihDb25zdGFudHMuU2VhcmNoQ29udGV4dC5IYXNTZWFyY2hSZXN1bHRzLCBTZWFyY2hFZGl0b3JDb25zdGFudHMuSW5TZWFyY2hFZGl0b3IpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gYXdhaXQgZm9jdXNOZXh0U2VhcmNoUmVzdWx0KGFjY2Vzc29yKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1ByZXZpb3VzU2VhcmNoUmVzdWx0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5Gb2N1c1ByZXZpb3VzU2VhcmNoUmVzdWx0QWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignRm9jdXNQcmV2aW91c1NlYXJjaFJlc3VsdC5sYWJlbCcsIFwiRm9jdXMgUHJldmlvdXMgU2VhcmNoIFJlc3VsdFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0fV0sXG5cdFx0XHRjYXRlZ29yeSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihDb25zdGFudHMuU2VhcmNoQ29udGV4dC5IYXNTZWFyY2hSZXN1bHRzLCBTZWFyY2hFZGl0b3JDb25zdGFudHMuSW5TZWFyY2hFZGl0b3IpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gYXdhaXQgZm9jdXNQcmV2aW91c1NlYXJjaFJlc3VsdChhY2Nlc3Nvcik7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgUmVwbGFjZUluRmlsZXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLlJlcGxhY2VJbkZpbGVzQWN0aW9uSWQsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplMigncmVwbGFjZUluRmlsZXMnLCBcIlJlcGxhY2UgaW4gRmlsZXNcIiksXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5SCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHR9XSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5NZW51YmFyRWRpdE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnNF9maW5kX2dsb2JhbCcsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gYXdhaXQgZmluZE9yUmVwbGFjZUluRmlsZXMoYWNjZXNzb3IsIHRydWUpO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBIZWxwZXJzXG5mdW5jdGlvbiB0b2dnbGVDYXNlU2Vuc2l0aXZlQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRzZWFyY2hWaWV3Py50b2dnbGVDYXNlU2Vuc2l0aXZlKCk7XG59XG5cbmZ1bmN0aW9uIHRvZ2dsZVdob2xlV29yZENvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0c2VhcmNoVmlldz8udG9nZ2xlV2hvbGVXb3JkcygpO1xufVxuXG5mdW5jdGlvbiB0b2dnbGVSZWdleENvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0Y29uc3Qgc2VhcmNoVmlldyA9IGdldFNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKTtcblx0c2VhcmNoVmlldz8udG9nZ2xlUmVnZXgoKTtcbn1cblxuZnVuY3Rpb24gdG9nZ2xlUHJlc2VydmVDYXNlQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRjb25zdCBzZWFyY2hWaWV3ID0gZ2V0U2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpO1xuXHRzZWFyY2hWaWV3Py50b2dnbGVQcmVzZXJ2ZUNhc2UoKTtcbn1cblxuY29uc3QgZm9jdXNTZWFyY2hMaXN0Q29tbWFuZDogSUNvbW1hbmRIYW5kbGVyID0gYWNjZXNzb3IgPT4ge1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdG9wZW5TZWFyY2hWaWV3KHZpZXdzU2VydmljZSkudGhlbihzZWFyY2hWaWV3ID0+IHtcblx0XHRzZWFyY2hWaWV3Py5tb3ZlRm9jdXNUb1Jlc3VsdHMoKTtcblx0fSk7XG59O1xuXG5hc3luYyBmdW5jdGlvbiBmb2N1c05leHRTZWFyY2hSZXN1bHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGFueT4ge1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3QgaW5wdXQgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0aWYgKGlucHV0IGluc3RhbmNlb2YgU2VhcmNoRWRpdG9ySW5wdXQpIHtcblx0XHQvLyBjYXN0IGFzIHdlIGNhbm5vdCBpbXBvcnQgU2VhcmNoRWRpdG9yIGFzIGEgdmFsdWUgYi9jIGN5Y2xpYyBkZXBlbmRlbmN5LlxuXHRcdHJldHVybiAoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lIGFzIFNlYXJjaEVkaXRvcikuZm9jdXNOZXh0UmVzdWx0KCk7XG5cdH1cblxuXHRyZXR1cm4gb3BlblNlYXJjaFZpZXcoYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpKS50aGVuKHNlYXJjaFZpZXcgPT4gc2VhcmNoVmlldz8uc2VsZWN0TmV4dE1hdGNoKCkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmb2N1c1ByZXZpb3VzU2VhcmNoUmVzdWx0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxhbnk+IHtcblx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdGNvbnN0IGlucHV0ID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdGlmIChpbnB1dCBpbnN0YW5jZW9mIFNlYXJjaEVkaXRvcklucHV0KSB7XG5cdFx0Ly8gY2FzdCBhcyB3ZSBjYW5ub3QgaW1wb3J0IFNlYXJjaEVkaXRvciBhcyBhIHZhbHVlIGIvYyBjeWNsaWMgZGVwZW5kZW5jeS5cblx0XHRyZXR1cm4gKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSBhcyBTZWFyY2hFZGl0b3IpLmZvY3VzUHJldmlvdXNSZXN1bHQoKTtcblx0fVxuXG5cdHJldHVybiBvcGVuU2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSkpLnRoZW4oc2VhcmNoVmlldyA9PiBzZWFyY2hWaWV3Py5zZWxlY3RQcmV2aW91c01hdGNoKCkpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmaW5kT3JSZXBsYWNlSW5GaWxlcyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXhwYW5kU2VhcmNoUmVwbGFjZVdpZGdldDogYm9vbGVhbik6IFByb21pc2U8YW55PiB7XG5cdHJldHVybiBvcGVuU2VhcmNoVmlldyhhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSksIGZhbHNlKS50aGVuKG9wZW5lZFZpZXcgPT4ge1xuXHRcdGlmIChvcGVuZWRWaWV3KSB7XG5cdFx0XHRjb25zdCBzZWFyY2hBbmRSZXBsYWNlV2lkZ2V0ID0gb3BlbmVkVmlldy5zZWFyY2hBbmRSZXBsYWNlV2lkZ2V0O1xuXHRcdFx0c2VhcmNoQW5kUmVwbGFjZVdpZGdldC50b2dnbGVSZXBsYWNlKGV4cGFuZFNlYXJjaFJlcGxhY2VXaWRnZXQpO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVkVGV4dCA9IG9wZW5lZFZpZXcudXBkYXRlVGV4dEZyb21GaW5kV2lkZ2V0T3JTZWxlY3Rpb24oeyBhbGxvd1Vuc2VsZWN0ZWRXb3JkOiAhZXhwYW5kU2VhcmNoUmVwbGFjZVdpZGdldCB9KTtcblx0XHRcdG9wZW5lZFZpZXcuc2VhcmNoQW5kUmVwbGFjZVdpZGdldC5mb2N1cyh1bmRlZmluZWQsIHVwZGF0ZWRUZXh0LCB1cGRhdGVkVGV4dCk7XG5cdFx0fVxuXHR9KTtcbn1cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBQUE7QUFLQSxTQUFTLG1CQUFtQjtBQUM1QixZQUFZLFNBQVM7QUFFckIsU0FBUyw2QkFBNkI7QUFHdEMsU0FBUyxxQkFBcUI7QUFDOUIsWUFBWSxlQUFlO0FBQzNCLFlBQVksMkJBQTJCO0FBRXZDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUywrQkFBK0IsOEJBQThCLHVCQUF1QixpQ0FBaUM7QUFDOUgsU0FBUyxVQUFVLGVBQWUsc0JBQXNCO0FB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
