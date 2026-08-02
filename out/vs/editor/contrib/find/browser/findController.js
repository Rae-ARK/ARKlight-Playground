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
import { alert as alertFn } from "../../../../base/browser/ui/aria/aria.js";
import { Delayer } from "../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { EditorAction, EditorCommand, EditorContributionInstantiation, MultiEditorAction, registerEditorAction, registerEditorCommand, registerEditorContribution, registerMultiEditorAction } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { overviewRulerRangeHighlight } from "../../../common/core/editorColorRegistry.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { OverviewRulerLane } from "../../../common/model.js";
import { CONTEXT_FIND_INPUT_FOCUSED, CONTEXT_FIND_WIDGET_VISIBLE, CONTEXT_REPLACE_INPUT_FOCUSED, FindModelBoundToEditorModel, FIND_IDS, ToggleCaseSensitiveKeybinding, TogglePreserveCaseKeybinding, ToggleRegexKeybinding, ToggleSearchScopeKeybinding, ToggleWholeWordKeybinding } from "./findModel.js";
import { FindOptionsWidget } from "./findOptionsWidget.js";
import { FindReplaceState } from "./findState.js";
import { FindWidget, NLS_NO_RESULTS } from "./findWidget.js";
import * as nls from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { FindWidgetSearchHistory } from "./findWidgetSearchHistory.js";
import { ReplaceWidgetHistory } from "./replaceWidgetHistory.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
const SEARCH_STRING_MAX_LENGTH = 524288;
function getSelectionSearchString(editor, seedSearchStringFromSelection = "single", seedSearchStringFromNonEmptySelection = false) {
  if (!editor.hasModel()) {
    return null;
  }
  const selection = editor.getSelection();
  if (seedSearchStringFromSelection === "single" && selection.startLineNumber === selection.endLineNumber || seedSearchStringFromSelection === "multiple") {
    if (selection.isEmpty()) {
      const wordAtPosition = editor.getConfiguredWordAtPosition(selection.getStartPosition());
      if (wordAtPosition && false === seedSearchStringFromNonEmptySelection) {
        return wordAtPosition.word;
      }
    } else {
      if (editor.getModel().getValueLengthInRange(selection) < SEARCH_STRING_MAX_LENGTH) {
        return editor.getModel().getValueInRange(selection);
      }
    }
  }
  return null;
}
var FindStartFocusAction = /* @__PURE__ */ ((FindStartFocusAction2) => {
  FindStartFocusAction2[FindStartFocusAction2["NoFocusChange"] = 0] = "NoFocusChange";
  FindStartFocusAction2[FindStartFocusAction2["FocusFindInput"] = 1] = "FocusFindInput";
  FindStartFocusAction2[FindStartFocusAction2["FocusReplaceInput"] = 2] = "FocusReplaceInput";
  return FindStartFocusAction2;
})(FindStartFocusAction || {});
let CommonFindController = class extends Disposable {
  get editor() {
    return this._editor;
  }
  static get(editor) {
    return editor.getContribution(CommonFindController.ID);
  }
  constructor(editor, contextKeyService, storageService, clipboardService, notificationService, hoverService) {
    super();
    this._editor = editor;
    this._findWidgetVisible = CONTEXT_FIND_WIDGET_VISIBLE.bindTo(contextKeyService);
    this._contextKeyService = contextKeyService;
    this._storageService = storageService;
    this._clipboardService = clipboardService;
    this._notificationService = notificationService;
    this._hoverService = hoverService;
    this._updateHistoryDelayer = this._register(new Delayer(500));
    this._state = this._register(new FindReplaceState());
    this.loadQueryState();
    this._register(this._state.onFindReplaceStateChange((e) => this._onStateChanged(e)));
    this._model = null;
    this._register(this._editor.onDidChangeModel(() => {
      const shouldRestartFind = this._editor.getModel() && this._state.isRevealed;
      this.disposeModel();
      this._state.change({
        searchScope: null,
        matchCase: this._storageService.getBoolean("editor.matchCase", StorageScope.WORKSPACE, false),
        wholeWord: this._storageService.getBoolean("editor.wholeWord", StorageScope.WORKSPACE, false),
        isRegex: this._storageService.getBoolean("editor.isRegex", StorageScope.WORKSPACE, false),
        preserveCase: this._storageService.getBoolean("editor.preserveCase", StorageScope.WORKSPACE, false)
      }, false);
      if (shouldRestartFind) {
        this._start({
          forceRevealReplace: false,
          seedSearchStringFromSelection: "none",
          seedSearchStringFromNonEmptySelection: false,
          seedSearchStringFromGlobalClipboard: false,
          shouldFocus: 0 /* NoFocusChange */,
          shouldAnimate: false,
          updateSearchScope: false,
          loop: this._editor.getOption(EditorOption.find).loop
        });
      }
    }));
  }
  dispose() {
    this.disposeModel();
    super.dispose();
  }
  disposeModel() {
    if (this._model) {
      this._model.dispose();
      this._model = null;
    }
  }
  _onStateChanged(e) {
    this.saveQueryState(e);
    if (e.isRevealed) {
      if (this._state.isRevealed) {
        this._findWidgetVisible.set(true);
      } else {
        this._findWidgetVisible.reset();
        this.disposeModel();
      }
    }
    if (e.searchString) {
      this.setGlobalBufferTerm(this._state.searchString);
    }
  }
  saveQueryState(e) {
    if (e.isRegex) {
      this._storageService.store("editor.isRegex", this._state.actualIsRegex, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    if (e.wholeWord) {
      this._storageService.store("editor.wholeWord", this._state.actualWholeWord, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    if (e.matchCase) {
      this._storageService.store("editor.matchCase", this._state.actualMatchCase, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
    if (e.preserveCase) {
      this._storageService.store("editor.preserveCase", this._state.actualPreserveCase, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  loadQueryState() {
    this._state.change({
      matchCase: this._storageService.getBoolean("editor.matchCase", StorageScope.WORKSPACE, this._state.matchCase),
      wholeWord: this._storageService.getBoolean("editor.wholeWord", StorageScope.WORKSPACE, this._state.wholeWord),
      isRegex: this._storageService.getBoolean("editor.isRegex", StorageScope.WORKSPACE, this._state.isRegex),
      preserveCase: this._storageService.getBoolean("editor.preserveCase", StorageScope.WORKSPACE, this._state.preserveCase)
    }, false);
  }
  isFindInputFocused() {
    return !!CONTEXT_FIND_INPUT_FOCUSED.getValue(this._contextKeyService);
  }
  /**
   * Returns whether the Replace input was the last focused input in the find widget.
   * Returns false by default; overridden in FindController.
   */
  wasReplaceInputLastFocused() {
    return false;
  }
  /**
   * Focuses the last focused element in the find widget.
   * Implemented by FindController; base implementation does nothing.
   */
  focusLastElement() {
  }
  getState() {
    return this._state;
  }
  closeFindWidget() {
    this._state.change({
      isRevealed: false,
      searchScope: null
    }, false);
    this._editor.focus();
  }
  toggleCaseSensitive() {
    this._state.change({ matchCase: !this._state.matchCase }, false);
    if (!this._state.isRevealed) {
      this.highlightFindOptions();
    }
  }
  toggleWholeWords() {
    this._state.change({ wholeWord: !this._state.wholeWord }, false);
    if (!this._state.isRevealed) {
      this.highlightFindOptions();
    }
  }
  toggleRegex() {
    this._state.change({ isRegex: !this._state.isRegex }, false);
    if (!this._state.isRevealed) {
      this.highlightFindOptions();
    }
  }
  togglePreserveCase() {
    this._state.change({ preserveCase: !this._state.preserveCase }, false);
    if (!this._state.isRevealed) {
      this.highlightFindOptions();
    }
  }
  toggleSearchScope() {
    if (this._state.searchScope) {
      this._state.change({ searchScope: null }, true);
    } else {
      if (this._editor.hasModel()) {
        let selections = this._editor.getSelections();
        selections = selections.map((selection) => {
          if (selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber) {
            selection = selection.setEndPosition(
              selection.endLineNumber - 1,
              this._editor.getModel().getLineMaxColumn(selection.endLineNumber - 1)
            );
          }
          if (!selection.isEmpty()) {
            return selection;
          }
          return null;
        }).filter((element) => !!element);
        if (selections.length) {
          this._state.change({ searchScope: selections }, true);
        }
      }
    }
  }
  setSearchString(searchString) {
    if (this._state.isRegex) {
      searchString = strings.escapeRegExpCharacters(searchString);
    }
    this._state.change({ searchString }, false);
  }
  highlightFindOptions(ignoreWhenVisible = false) {
  }
  async _start(opts, newState) {
    this.disposeModel();
    if (!this._editor.hasModel()) {
      return;
    }
    const stateChanges = {
      ...newState,
      isRevealed: true
    };
    if (opts.seedSearchStringFromSelection === "single") {
      const selectionSearchString = getSelectionSearchString(this._editor, opts.seedSearchStringFromSelection, opts.seedSearchStringFromNonEmptySelection);
      if (selectionSearchString) {
        if (this._state.isRegex) {
          stateChanges.searchString = strings.escapeRegExpCharacters(selectionSearchString);
        } else {
          stateChanges.searchString = selectionSearchString;
        }
      }
    } else if (opts.seedSearchStringFromSelection === "multiple" && !opts.updateSearchScope) {
      const selectionSearchString = getSelectionSearchString(this._editor, opts.seedSearchStringFromSelection);
      if (selectionSearchString) {
        stateChanges.searchString = selectionSearchString;
      }
    }
    if (!stateChanges.searchString && opts.seedSearchStringFromGlobalClipboard) {
      const selectionSearchString = await this.getGlobalBufferTerm();
      if (!this._editor.hasModel()) {
        return;
      }
      if (selectionSearchString) {
        stateChanges.searchString = selectionSearchString;
      }
    }
    if (opts.forceRevealReplace || stateChanges.isReplaceRevealed) {
      stateChanges.isReplaceRevealed = true;
    } else if (!this._findWidgetVisible.get()) {
      stateChanges.isReplaceRevealed = false;
    }
    if (opts.updateSearchScope) {
      const currentSelections = this._editor.getSelections();
      if (currentSelections.some((selection) => !selection.isEmpty())) {
        stateChanges.searchScope = currentSelections;
      }
    }
    stateChanges.loop = opts.loop;
    this._state.change(stateChanges, false);
    if (!this._model) {
      this._model = new FindModelBoundToEditorModel(this._editor, this._state);
    }
  }
  start(opts, newState) {
    return this._start(opts, newState);
  }
  moveToNextMatch() {
    if (this._model) {
      this._model.moveToNextMatch();
      return true;
    }
    return false;
  }
  moveToPrevMatch() {
    if (this._model) {
      this._model.moveToPrevMatch();
      return true;
    }
    return false;
  }
  goToMatch(index) {
    if (this._model) {
      this._model.moveToMatch(index);
      return true;
    }
    return false;
  }
  replace() {
    if (this._model) {
      this._model.replace();
      return true;
    }
    return false;
  }
  replaceAll() {
    if (this._model) {
      if (this._editor.getModel()?.isTooLargeForHeapOperation()) {
        this._notificationService.warn(nls.localize("too.large.for.replaceall", "The file is too large to perform a replace all operation."));
        return false;
      }
      this._model.replaceAll();
      return true;
    }
    return false;
  }
  selectAllMatches() {
    if (this._model) {
      this._model.selectAllMatches();
      this._editor.focus();
      return true;
    }
    return false;
  }
  async getGlobalBufferTerm() {
    if (this._editor.getOption(EditorOption.find).globalFindClipboard && this._editor.hasModel() && !this._editor.getModel().isTooLargeForSyncing()) {
      return this._clipboardService.readFindText();
    }
    return "";
  }
  setGlobalBufferTerm(text) {
    if (this._editor.getOption(EditorOption.find).globalFindClipboard && this._editor.hasModel() && !this._editor.getModel().isTooLargeForSyncing()) {
      this._clipboardService.writeFindText(text);
    }
  }
};
CommonFindController.ID = "editor.contrib.findController";
CommonFindController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IHoverService)
], CommonFindController);
let FindController = class extends CommonFindController {
  constructor(editor, _contextViewService, _contextKeyService, _keybindingService, notificationService, _storageService, clipboardService, hoverService, _configurationService, _accessibilityService) {
    super(editor, _contextKeyService, _storageService, clipboardService, notificationService, hoverService);
    this._contextViewService = _contextViewService;
    this._keybindingService = _keybindingService;
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._widget = null;
    this._findOptionsWidget = null;
    this._findWidgetSearchHistory = FindWidgetSearchHistory.getOrCreate(_storageService);
    this._replaceWidgetHistory = ReplaceWidgetHistory.getOrCreate(_storageService);
  }
  async _start(opts, newState) {
    if (!this._widget) {
      this._createFindWidget();
    }
    const selection = this._editor.getSelection();
    let updateSearchScope = false;
    switch (this._editor.getOption(EditorOption.find).autoFindInSelection) {
      case "always":
        updateSearchScope = true;
        break;
      case "never":
        updateSearchScope = false;
        break;
      case "multiline": {
        const isSelectionMultipleLine = !!selection && selection.startLineNumber !== selection.endLineNumber;
        updateSearchScope = isSelectionMultipleLine;
        break;
      }
      default:
        break;
    }
    opts.updateSearchScope = opts.updateSearchScope || updateSearchScope;
    await super._start(opts, newState);
    if (this._widget) {
      if (opts.shouldFocus === 2 /* FocusReplaceInput */) {
        this._widget.focusReplaceInput();
      } else if (opts.shouldFocus === 1 /* FocusFindInput */) {
        this._widget.focusFindInput();
      }
    }
  }
  highlightFindOptions(ignoreWhenVisible = false) {
    if (!this._widget) {
      this._createFindWidget();
    }
    if (this._state.isRevealed && !ignoreWhenVisible) {
      this._widget.highlightFindOptions();
    } else {
      this._findOptionsWidget.highlightFindOptions();
    }
  }
  _createFindWidget() {
    this._widget = this._register(new FindWidget(this._editor, this, this._state, this._contextViewService, this._keybindingService, this._contextKeyService, this._hoverService, this._findWidgetSearchHistory, this._replaceWidgetHistory, this._configurationService, this._accessibilityService));
    this._findOptionsWidget = this._register(new FindOptionsWidget(this._editor, this._state, this._keybindingService));
  }
  /**
   * Returns whether the Replace input was the last focused input in the find widget.
   */
  wasReplaceInputLastFocused() {
    return this._widget?.lastFocusedInputWasReplace ?? false;
  }
  /**
   * Focuses the last focused element in the find widget.
   * This is more precise than just focusing the Find or Replace input,
   * as it can restore focus to checkboxes, buttons, etc.
   */
  focusLastElement() {
    this._widget?.focusLastElement();
  }
  saveViewState() {
    return this._widget?.getViewState();
  }
  restoreViewState(state) {
    this._widget?.setViewState(state);
  }
};
FindController = __decorateClass([
  __decorateParam(1, IContextViewService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IClipboardService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IAccessibilityService)
], FindController);
const StartFindAction = registerMultiEditorAction(new MultiEditorAction({
  id: FIND_IDS.StartFindAction,
  label: nls.localize2("startFindAction", "Find"),
  precondition: ContextKeyExpr.or(EditorContextKeys.focus, ContextKeyExpr.has("editorIsOpen")),
  kbOpts: {
    kbExpr: null,
    primary: KeyMod.CtrlCmd | KeyCode.KeyF,
    weight: KeybindingWeight.EditorContrib
  },
  menuOpts: {
    menuId: MenuId.MenubarEditMenu,
    group: "3_find",
    title: nls.localize({ key: "miFind", comment: ["&& denotes a mnemonic"] }, "&&Find"),
    order: 1
  }
}));
StartFindAction.addImplementation(0, (accessor, editor, args) => {
  const controller = CommonFindController.get(editor);
  if (!controller) {
    return false;
  }
  return controller.start({
    forceRevealReplace: false,
    seedSearchStringFromSelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" ? "single" : "none",
    seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
    seedSearchStringFromGlobalClipboard: editor.getOption(EditorOption.find).globalFindClipboard,
    shouldFocus: 1 /* FocusFindInput */,
    shouldAnimate: true,
    updateSearchScope: false,
    loop: editor.getOption(EditorOption.find).loop
  });
});
const findArgDescription = {
  description: "Open a new In-Editor Find Widget.",
  args: [{
    name: "Open a new In-Editor Find Widget args",
    schema: {
      properties: {
        searchString: { type: "string" },
        replaceString: { type: "string" },
        isRegex: { type: "boolean" },
        matchWholeWord: { type: "boolean" },
        isCaseSensitive: { type: "boolean" },
        preserveCase: { type: "boolean" },
        findInSelection: { type: "boolean" }
      }
    }
  }]
};
class StartFindWithArgsAction extends EditorAction {
  constructor() {
    super({
      id: FIND_IDS.StartFindWithArgs,
      label: nls.localize2("startFindWithArgsAction", "Find with Arguments"),
      precondition: void 0,
      kbOpts: {
        kbExpr: null,
        primary: 0,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: findArgDescription
    });
  }
  async run(accessor, editor, args) {
    const controller = CommonFindController.get(editor);
    if (controller) {
      const newState = args ? {
        searchString: args.searchString,
        replaceString: args.replaceString,
        isReplaceRevealed: args.replaceString !== void 0,
        isRegex: args.isRegex,
        // isRegexOverride: args.regexOverride,
        wholeWord: args.matchWholeWord,
        // wholeWordOverride: args.wholeWordOverride,
        matchCase: args.isCaseSensitive,
        // matchCaseOverride: args.matchCaseOverride,
        preserveCase: args.preserveCase
        // preserveCaseOverride: args.preserveCaseOverride,
      } : {};
      await controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: controller.getState().searchString.length === 0 && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" ? "single" : "none",
        seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
        seedSearchStringFromGlobalClipboard: true,
        shouldFocus: 1 /* FocusFindInput */,
        shouldAnimate: true,
        updateSearchScope: args?.findInSelection || false,
        loop: editor.getOption(EditorOption.find).loop
      }, newState);
      controller.setGlobalBufferTerm(controller.getState().searchString);
    }
  }
}
class StartFindWithSelectionAction extends EditorAction {
  constructor() {
    super({
      id: FIND_IDS.StartFindWithSelection,
      label: nls.localize2("startFindWithSelectionAction", "Find with Selection"),
      precondition: void 0,
      kbOpts: {
        kbExpr: null,
        primary: 0,
        mac: {
          primary: KeyMod.CtrlCmd | KeyCode.KeyE
        },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async run(accessor, editor) {
    const controller = CommonFindController.get(editor);
    if (controller) {
      await controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "multiple",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: 0 /* NoFocusChange */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: editor.getOption(EditorOption.find).loop
      });
      controller.setGlobalBufferTerm(controller.getState().searchString);
    }
  }
}
class MatchFindAction extends EditorAction {
  async run(accessor, editor) {
    const controller = CommonFindController.get(editor);
    if (controller && !this._run(controller)) {
      await controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: controller.getState().searchString.length === 0 && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" ? "single" : "none",
        seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
        seedSearchStringFromGlobalClipboard: true,
        shouldFocus: 0 /* NoFocusChange */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: editor.getOption(EditorOption.find).loop
      });
      this._run(controller);
    }
  }
}
async function matchFindAction(editor, next) {
  const controller = CommonFindController.get(editor);
  if (!controller) {
    return;
  }
  const shouldCloseOnResult = editor.getOption(EditorOption.find).closeOnResult;
  const wasFindWidgetVisible = controller.getState().isRevealed;
  const runMatch = () => {
    const previousSelection = controller.editor.getSelection();
    const result = next ? controller.moveToNextMatch() : controller.moveToPrevMatch();
    let landedOnMatch = false;
    if (result) {
      const currentSelection = controller.editor.getSelection();
      if (!previousSelection && currentSelection) {
        landedOnMatch = true;
      } else if (previousSelection && currentSelection && !previousSelection.equalsSelection(currentSelection)) {
        landedOnMatch = true;
      }
    }
    if (landedOnMatch) {
      controller.editor.pushUndoStop();
      if (shouldCloseOnResult && wasFindWidgetVisible && controller.isFindInputFocused()) {
        controller.closeFindWidget();
      }
      return true;
    }
    return false;
  };
  if (!runMatch()) {
    await controller.start({
      forceRevealReplace: false,
      seedSearchStringFromSelection: controller.getState().searchString.length === 0 && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" ? "single" : "none",
      seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
      seedSearchStringFromGlobalClipboard: true,
      shouldFocus: 0 /* NoFocusChange */,
      shouldAnimate: true,
      updateSearchScope: false,
      loop: editor.getOption(EditorOption.find).loop
    });
    if (!runMatch()) {
      const state = controller.getState();
      if (wasFindWidgetVisible && state.matchesCount === 0 && state.searchString) {
        alertFn(nls.localize("ariaSearchNoResult", "{0} found for '{1}'", NLS_NO_RESULTS, state.searchString));
      }
    }
  }
}
const NextMatchFindAction = registerMultiEditorAction(new MultiEditorAction({
  id: FIND_IDS.NextMatchFindAction,
  label: nls.localize2("findNextMatchAction", "Find Next"),
  precondition: void 0,
  kbOpts: [{
    kbExpr: EditorContextKeys.focus,
    primary: KeyCode.F3,
    mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyG, secondary: [KeyCode.F3] },
    weight: KeybindingWeight.EditorContrib
  }, {
    kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
    primary: KeyCode.Enter,
    weight: KeybindingWeight.EditorContrib
  }]
}));
NextMatchFindAction.addImplementation(0, async (accessor, editor, args) => {
  return matchFindAction(editor, true);
});
const PreviousMatchFindAction = registerMultiEditorAction(new MultiEditorAction({
  id: FIND_IDS.PreviousMatchFindAction,
  label: nls.localize2("findPreviousMatchAction", "Find Previous"),
  precondition: void 0,
  kbOpts: [{
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.Shift | KeyCode.F3,
    mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG, secondary: [KeyMod.Shift | KeyCode.F3] },
    weight: KeybindingWeight.EditorContrib
  }, {
    kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_FIND_INPUT_FOCUSED),
    primary: KeyMod.Shift | KeyCode.Enter,
    weight: KeybindingWeight.EditorContrib
  }]
}));
PreviousMatchFindAction.addImplementation(0, async (accessor, editor, args) => {
  return matchFindAction(editor, false);
});
class MoveToMatchFindAction extends EditorAction {
  constructor() {
    super({
      id: FIND_IDS.GoToMatchFindAction,
      label: nls.localize2("findMatchAction.goToMatch", "Go to Match..."),
      precondition: CONTEXT_FIND_WIDGET_VISIBLE
    });
    this._highlightDecorations = [];
  }
  run(accessor, editor) {
    const controller = CommonFindController.get(editor);
    if (!controller) {
      return;
    }
    const matchesCount = controller.getState().matchesCount;
    if (matchesCount < 1) {
      const notificationService = accessor.get(INotificationService);
      notificationService.notify({
        severity: Severity.Warning,
        message: nls.localize("findMatchAction.noResults", "No matches. Try searching for something else.")
      });
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const disposables = new DisposableStore();
    const inputBox = disposables.add(quickInputService.createInputBox());
    inputBox.placeholder = nls.localize("findMatchAction.inputPlaceHolder", "Type a number to go to a specific match (between 1 and {0})", matchesCount);
    const toFindMatchIndex = (value) => {
      const index = parseInt(value);
      if (isNaN(index)) {
        return void 0;
      }
      const matchCount = controller.getState().matchesCount;
      if (index > 0 && index <= matchCount) {
        return index - 1;
      } else if (index < 0 && index >= -matchCount) {
        return matchCount + index;
      }
      return void 0;
    };
    const updatePickerAndEditor = (value) => {
      const index = toFindMatchIndex(value);
      if (typeof index === "number") {
        inputBox.validationMessage = void 0;
        controller.goToMatch(index);
        const currentMatch = controller.getState().currentMatch;
        if (currentMatch) {
          this.addDecorations(editor, currentMatch);
        }
      } else {
        inputBox.validationMessage = nls.localize("findMatchAction.inputValidationMessage", "Please type a number between 1 and {0}", controller.getState().matchesCount);
        this.clearDecorations(editor);
      }
    };
    disposables.add(inputBox.onDidChangeValue((value) => {
      updatePickerAndEditor(value);
    }));
    disposables.add(inputBox.onDidAccept(() => {
      const index = toFindMatchIndex(inputBox.value);
      if (typeof index === "number") {
        controller.goToMatch(index);
        inputBox.hide();
      } else {
        inputBox.validationMessage = nls.localize("findMatchAction.inputValidationMessage", "Please type a number between 1 and {0}", controller.getState().matchesCount);
      }
    }));
    disposables.add(inputBox.onDidHide(() => {
      this.clearDecorations(editor);
      disposables.dispose();
    }));
    inputBox.show();
  }
  clearDecorations(editor) {
    editor.changeDecorations((changeAccessor) => {
      this._highlightDecorations = changeAccessor.deltaDecorations(this._highlightDecorations, []);
    });
  }
  addDecorations(editor, range) {
    editor.changeDecorations((changeAccessor) => {
      this._highlightDecorations = changeAccessor.deltaDecorations(this._highlightDecorations, [
        {
          range,
          options: {
            description: "find-match-quick-access-range-highlight",
            className: "rangeHighlight",
            isWholeLine: true
          }
        },
        {
          range,
          options: {
            description: "find-match-quick-access-range-highlight-overview",
            overviewRuler: {
              color: themeColorFromId(overviewRulerRangeHighlight),
              position: OverviewRulerLane.Full
            }
          }
        }
      ]);
    });
  }
}
class SelectionMatchFindAction extends EditorAction {
  async run(accessor, editor) {
    const controller = CommonFindController.get(editor);
    if (!controller) {
      return;
    }
    const selectionSearchString = getSelectionSearchString(editor, "single", false);
    if (selectionSearchString) {
      controller.setSearchString(selectionSearchString);
    }
    if (!this._run(controller)) {
      await controller.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "none",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: 0 /* NoFocusChange */,
        shouldAnimate: true,
        updateSearchScope: false,
        loop: editor.getOption(EditorOption.find).loop
      });
      this._run(controller);
    }
  }
}
class NextSelectionMatchFindAction extends SelectionMatchFindAction {
  constructor() {
    super({
      id: FIND_IDS.NextSelectionMatchFindAction,
      label: nls.localize2("nextSelectionMatchFindAction", "Find Next Selection"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyCode.F3,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  _run(controller) {
    return controller.moveToNextMatch();
  }
}
class PreviousSelectionMatchFindAction extends SelectionMatchFindAction {
  constructor() {
    super({
      id: FIND_IDS.PreviousSelectionMatchFindAction,
      label: nls.localize2("previousSelectionMatchFindAction", "Find Previous Selection"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F3,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  _run(controller) {
    return controller.moveToPrevMatch();
  }
}
const StartFindReplaceAction = registerMultiEditorAction(new MultiEditorAction({
  id: FIND_IDS.StartFindReplaceAction,
  label: nls.localize2("startReplace", "Replace"),
  precondition: ContextKeyExpr.or(EditorContextKeys.focus, ContextKeyExpr.has("editorIsOpen")),
  kbOpts: {
    kbExpr: null,
    primary: KeyMod.CtrlCmd | KeyCode.KeyH,
    mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF },
    weight: KeybindingWeight.EditorContrib
  },
  menuOpts: {
    menuId: MenuId.MenubarEditMenu,
    group: "3_find",
    title: nls.localize({ key: "miReplace", comment: ["&& denotes a mnemonic"] }, "&&Replace"),
    order: 2
  }
}));
StartFindReplaceAction.addImplementation(0, (accessor, editor, args) => {
  if (!editor.hasModel() || editor.getOption(EditorOption.readOnly)) {
    return false;
  }
  const controller = CommonFindController.get(editor);
  if (!controller) {
    return false;
  }
  const currentSelection = editor.getSelection();
  const findInputFocused = controller.isFindInputFocused();
  const seedSearchStringFromSelection = !currentSelection.isEmpty() && currentSelection.startLineNumber === currentSelection.endLineNumber && editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never" && !findInputFocused;
  const shouldFocus = findInputFocused || seedSearchStringFromSelection ? 2 /* FocusReplaceInput */ : 1 /* FocusFindInput */;
  return controller.start({
    forceRevealReplace: true,
    seedSearchStringFromSelection: seedSearchStringFromSelection ? "single" : "none",
    seedSearchStringFromNonEmptySelection: editor.getOption(EditorOption.find).seedSearchStringFromSelection === "selection",
    seedSearchStringFromGlobalClipboard: editor.getOption(EditorOption.find).seedSearchStringFromSelection !== "never",
    shouldFocus,
    shouldAnimate: true,
    updateSearchScope: false,
    loop: editor.getOption(EditorOption.find).loop
  });
});
registerEditorContribution(CommonFindController.ID, FindController, EditorContributionInstantiation.Eager);
registerEditorAction(StartFindWithArgsAction);
registerEditorAction(StartFindWithSelectionAction);
registerEditorAction(MoveToMatchFindAction);
registerEditorAction(NextSelectionMatchFindAction);
registerEditorAction(PreviousSelectionMatchFindAction);
const FindCommand = EditorCommand.bindToContribution(CommonFindController.get);
registerEditorCommand(new FindCommand({
  id: FIND_IDS.CloseFindWidgetCommand,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.closeFindWidget(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: KeyCode.Escape,
    secondary: [KeyMod.Shift | KeyCode.Escape]
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ToggleCaseSensitiveCommand,
  precondition: void 0,
  handler: (x) => x.toggleCaseSensitive(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: ToggleCaseSensitiveKeybinding.primary,
    mac: ToggleCaseSensitiveKeybinding.mac,
    win: ToggleCaseSensitiveKeybinding.win,
    linux: ToggleCaseSensitiveKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ToggleWholeWordCommand,
  precondition: void 0,
  handler: (x) => x.toggleWholeWords(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: ToggleWholeWordKeybinding.primary,
    mac: ToggleWholeWordKeybinding.mac,
    win: ToggleWholeWordKeybinding.win,
    linux: ToggleWholeWordKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ToggleRegexCommand,
  precondition: void 0,
  handler: (x) => x.toggleRegex(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: ToggleRegexKeybinding.primary,
    mac: ToggleRegexKeybinding.mac,
    win: ToggleRegexKeybinding.win,
    linux: ToggleRegexKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ToggleSearchScopeCommand,
  precondition: void 0,
  handler: (x) => x.toggleSearchScope(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: ToggleSearchScopeKeybinding.primary,
    mac: ToggleSearchScopeKeybinding.mac,
    win: ToggleSearchScopeKeybinding.win,
    linux: ToggleSearchScopeKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.TogglePreserveCaseCommand,
  precondition: void 0,
  handler: (x) => x.togglePreserveCase(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: TogglePreserveCaseKeybinding.primary,
    mac: TogglePreserveCaseKeybinding.mac,
    win: TogglePreserveCaseKeybinding.win,
    linux: TogglePreserveCaseKeybinding.linux
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ReplaceOneAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.replace(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit1
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ReplaceOneAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.replace(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_REPLACE_INPUT_FOCUSED),
    primary: KeyCode.Enter
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ReplaceAllAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.replaceAll(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.ReplaceAllAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.replaceAll(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: ContextKeyExpr.and(EditorContextKeys.focus, CONTEXT_REPLACE_INPUT_FOCUSED),
    primary: void 0,
    mac: {
      primary: KeyMod.CtrlCmd | KeyCode.Enter
    }
  }
}));
registerEditorCommand(new FindCommand({
  id: FIND_IDS.SelectAllMatchesAction,
  precondition: CONTEXT_FIND_WIDGET_VISIBLE,
  handler: (x) => x.selectAllMatches(),
  kbOpts: {
    weight: KeybindingWeight.EditorContrib + 5,
    kbExpr: EditorContextKeys.focus,
    primary: KeyMod.Alt | KeyCode.Enter
  }
}));
export {
  CommonFindController,
  FindController,
  FindStartFocusAction,
  MatchFindAction,
  MoveToMatchFindAction,
  NextMatchFindAction,
  NextSelectionMatchFindAction,
  PreviousMatchFindAction,
  PreviousSelectionMatchFindAction,
  SelectionMatchFindAction,
  StartFindAction,
  StartFindReplaceAction,
  StartFindWithArgsAction,
  StartFindWithSelectionAction,
  getSelectionSearchString
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZpbmQvYnJvd3Nlci9maW5kQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFsZXJ0IGFzIGFsZXJ0Rm4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgRWRpdG9yQ29tbWFuZCwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgTXVsdGlFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbW1hbmQsIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCByZWdpc3Rlck11bHRpRWRpdG9yQWN0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBvdmVydmlld1J1bGVyUmFuZ2VIaWdobGlnaHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IENPTlRFWFRfRklORF9JTlBVVF9GT0NVU0VELCBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUsIENPTlRFWFRfUkVQTEFDRV9JTlBVVF9GT0NVU0VELCBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwsIEZJTkRfSURTLCBUb2dnbGVDYXNlU2Vuc2l0aXZlS2V5YmluZGluZywgVG9nZ2xlUHJlc2VydmVDYXNlS2V5YmluZGluZywgVG9nZ2xlUmVnZXhLZXliaW5kaW5nLCBUb2dnbGVTZWFyY2hTY29wZUtleWJpbmRpbmcsIFRvZ2dsZVdob2xlV29yZEtleWJpbmRpbmcgfSBmcm9tICcuL2ZpbmRNb2RlbC5qcyc7XG5pbXBvcnQgeyBGaW5kT3B0aW9uc1dpZGdldCB9IGZyb20gJy4vZmluZE9wdGlvbnNXaWRnZXQuanMnO1xuaW1wb3J0IHsgRmluZFJlcGxhY2VTdGF0ZSwgRmluZFJlcGxhY2VTdGF0ZUNoYW5nZWRFdmVudCwgSU5ld0ZpbmRSZXBsYWNlU3RhdGUgfSBmcm9tICcuL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBGaW5kV2lkZ2V0LCBJRmluZENvbnRyb2xsZXIsIE5MU19OT19SRVNVTFRTIH0gZnJvbSAnLi9maW5kV2lkZ2V0LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgRmluZFdpZGdldFNlYXJjaEhpc3RvcnkgfSBmcm9tICcuL2ZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5LmpzJztcbmltcG9ydCB7IFJlcGxhY2VXaWRnZXRIaXN0b3J5IH0gZnJvbSAnLi9yZXBsYWNlV2lkZ2V0SGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuXG5jb25zdCBTRUFSQ0hfU1RSSU5HX01BWF9MRU5HVEggPSA1MjQyODg7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZWxlY3Rpb25TZWFyY2hTdHJpbmcoZWRpdG9yOiBJQ29kZUVkaXRvciwgc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246ICdzaW5nbGUnIHwgJ211bHRpcGxlJyA9ICdzaW5nbGUnLCBzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBib29sZWFuID0gZmFsc2UpOiBzdHJpbmcgfCBudWxsIHtcblx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3Qgc2VsZWN0aW9uID0gZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHQvLyBpZiBzZWxlY3Rpb24gc3BhbnMgbXVsdGlwbGUgbGluZXMsIGRlZmF1bHQgc2VhcmNoIHN0cmluZyB0byBlbXB0eVxuXG5cdGlmICgoc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdzaW5nbGUnICYmIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgPT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKVxuXHRcdHx8IHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uID09PSAnbXVsdGlwbGUnKSB7XG5cdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdGNvbnN0IHdvcmRBdFBvc2l0aW9uID0gZWRpdG9yLmdldENvbmZpZ3VyZWRXb3JkQXRQb3NpdGlvbihzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdGlmICh3b3JkQXRQb3NpdGlvbiAmJiAoZmFsc2UgPT09IHNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB3b3JkQXRQb3NpdGlvbi53b3JkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoZWRpdG9yLmdldE1vZGVsKCkuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHNlbGVjdGlvbikgPCBTRUFSQ0hfU1RSSU5HX01BWF9MRU5HVEgpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvci5nZXRNb2RlbCgpLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBGaW5kU3RhcnRGb2N1c0FjdGlvbiB7XG5cdE5vRm9jdXNDaGFuZ2UsXG5cdEZvY3VzRmluZElucHV0LFxuXHRGb2N1c1JlcGxhY2VJbnB1dFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaW5kU3RhcnRPcHRpb25zIHtcblx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBib29sZWFuO1xuXHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogJ25vbmUnIHwgJ3NpbmdsZScgfCAnbXVsdGlwbGUnO1xuXHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBib29sZWFuO1xuXHRzZWVkU2VhcmNoU3RyaW5nRnJvbUdsb2JhbENsaXBib2FyZDogYm9vbGVhbjtcblx0c2hvdWxkRm9jdXM6IEZpbmRTdGFydEZvY3VzQWN0aW9uO1xuXHRzaG91bGRBbmltYXRlOiBib29sZWFuO1xuXHR1cGRhdGVTZWFyY2hTY29wZTogYm9vbGVhbjtcblx0bG9vcDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmluZFN0YXJ0QXJndW1lbnRzIHtcblx0c2VhcmNoU3RyaW5nPzogc3RyaW5nO1xuXHRyZXBsYWNlU3RyaW5nPzogc3RyaW5nO1xuXHRpc1JlZ2V4PzogYm9vbGVhbjtcblx0bWF0Y2hXaG9sZVdvcmQ/OiBib29sZWFuO1xuXHRpc0Nhc2VTZW5zaXRpdmU/OiBib29sZWFuO1xuXHRwcmVzZXJ2ZUNhc2U/OiBib29sZWFuO1xuXHRmaW5kSW5TZWxlY3Rpb24/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgQ29tbW9uRmluZENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5maW5kQ29udHJvbGxlcic7XG5cblx0cHJvdGVjdGVkIF9lZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maW5kV2lkZ2V0VmlzaWJsZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByb3RlY3RlZCBfc3RhdGU6IEZpbmRSZXBsYWNlU3RhdGU7XG5cdHByb3RlY3RlZCBfdXBkYXRlSGlzdG9yeURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgX21vZGVsOiBGaW5kTW9kZWxCb3VuZFRvRWRpdG9yTW9kZWwgfCBudWxsO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlO1xuXG5cdGdldCBlZGl0b3IoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvcjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBDb21tb25GaW5kQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPENvbW1vbkZpbmRDb250cm9sbGVyPihDb21tb25GaW5kQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5fZmluZFdpZGdldFZpc2libGUgPSBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IGNvbnRleHRLZXlTZXJ2aWNlO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlID0gc3RvcmFnZVNlcnZpY2U7XG5cdFx0dGhpcy5fY2xpcGJvYXJkU2VydmljZSA9IGNsaXBib2FyZFNlcnZpY2U7XG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZSA9IG5vdGlmaWNhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5faG92ZXJTZXJ2aWNlID0gaG92ZXJTZXJ2aWNlO1xuXG5cdFx0dGhpcy5fdXBkYXRlSGlzdG9yeURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPig1MDApKTtcblx0XHR0aGlzLl9zdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBGaW5kUmVwbGFjZVN0YXRlKCkpO1xuXHRcdHRoaXMubG9hZFF1ZXJ5U3RhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoKGUpID0+IHRoaXMuX29uU3RhdGVDaGFuZ2VkKGUpKSk7XG5cblx0XHR0aGlzLl9tb2RlbCA9IG51bGw7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzaG91bGRSZXN0YXJ0RmluZCA9ICh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSAmJiB0aGlzLl9zdGF0ZS5pc1JldmVhbGVkKTtcblxuXHRcdFx0dGhpcy5kaXNwb3NlTW9kZWwoKTtcblxuXHRcdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHtcblx0XHRcdFx0c2VhcmNoU2NvcGU6IG51bGwsXG5cdFx0XHRcdG1hdGNoQ2FzZTogdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignZWRpdG9yLm1hdGNoQ2FzZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGZhbHNlKSxcblx0XHRcdFx0d2hvbGVXb3JkOiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdlZGl0b3Iud2hvbGVXb3JkJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZmFsc2UpLFxuXHRcdFx0XHRpc1JlZ2V4OiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdlZGl0b3IuaXNSZWdleCcsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGZhbHNlKSxcblx0XHRcdFx0cHJlc2VydmVDYXNlOiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKCdlZGl0b3IucHJlc2VydmVDYXNlJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZmFsc2UpXG5cdFx0XHR9LCBmYWxzZSk7XG5cblx0XHRcdGlmIChzaG91bGRSZXN0YXJ0RmluZCkge1xuXHRcdFx0XHR0aGlzLl9zdGFydCh7XG5cdFx0XHRcdFx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBmYWxzZSxcblx0XHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogJ25vbmUnLFxuXHRcdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb246IGZhbHNlLFxuXHRcdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiBmYWxzZSxcblx0XHRcdFx0XHRzaG91bGRGb2N1czogRmluZFN0YXJ0Rm9jdXNBY3Rpb24uTm9Gb2N1c0NoYW5nZSxcblx0XHRcdFx0XHRzaG91bGRBbmltYXRlOiBmYWxzZSxcblx0XHRcdFx0XHR1cGRhdGVTZWFyY2hTY29wZTogZmFsc2UsXG5cdFx0XHRcdFx0bG9vcDogdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkubG9vcFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2VNb2RlbCgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZU1vZGVsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbW9kZWwgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uU3RhdGVDaGFuZ2VkKGU6IEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnNhdmVRdWVyeVN0YXRlKGUpO1xuXG5cdFx0aWYgKGUuaXNSZXZlYWxlZCkge1xuXHRcdFx0aWYgKHRoaXMuX3N0YXRlLmlzUmV2ZWFsZWQpIHtcblx0XHRcdFx0dGhpcy5fZmluZFdpZGdldFZpc2libGUuc2V0KHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fZmluZFdpZGdldFZpc2libGUucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5kaXNwb3NlTW9kZWwoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGUuc2VhcmNoU3RyaW5nKSB7XG5cdFx0XHR0aGlzLnNldEdsb2JhbEJ1ZmZlclRlcm0odGhpcy5fc3RhdGUuc2VhcmNoU3RyaW5nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNhdmVRdWVyeVN0YXRlKGU6IEZpbmRSZXBsYWNlU3RhdGVDaGFuZ2VkRXZlbnQpIHtcblx0XHRpZiAoZS5pc1JlZ2V4KSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSgnZWRpdG9yLmlzUmVnZXgnLCB0aGlzLl9zdGF0ZS5hY3R1YWxJc1JlZ2V4LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHRpZiAoZS53aG9sZVdvcmQpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdlZGl0b3Iud2hvbGVXb3JkJywgdGhpcy5fc3RhdGUuYWN0dWFsV2hvbGVXb3JkLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHRpZiAoZS5tYXRjaENhc2UpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdlZGl0b3IubWF0Y2hDYXNlJywgdGhpcy5fc3RhdGUuYWN0dWFsTWF0Y2hDYXNlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHRpZiAoZS5wcmVzZXJ2ZUNhc2UpIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdlZGl0b3IucHJlc2VydmVDYXNlJywgdGhpcy5fc3RhdGUuYWN0dWFsUHJlc2VydmVDYXNlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9hZFF1ZXJ5U3RhdGUoKSB7XG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHtcblx0XHRcdG1hdGNoQ2FzZTogdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignZWRpdG9yLm1hdGNoQ2FzZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRoaXMuX3N0YXRlLm1hdGNoQ2FzZSksXG5cdFx0XHR3aG9sZVdvcmQ6IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2VkaXRvci53aG9sZVdvcmQnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCB0aGlzLl9zdGF0ZS53aG9sZVdvcmQpLFxuXHRcdFx0aXNSZWdleDogdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignZWRpdG9yLmlzUmVnZXgnLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCB0aGlzLl9zdGF0ZS5pc1JlZ2V4KSxcblx0XHRcdHByZXNlcnZlQ2FzZTogdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbignZWRpdG9yLnByZXNlcnZlQ2FzZScsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIHRoaXMuX3N0YXRlLnByZXNlcnZlQ2FzZSlcblx0XHR9LCBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgaXNGaW5kSW5wdXRGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIUNPTlRFWFRfRklORF9JTlBVVF9GT0NVU0VELmdldFZhbHVlKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHdoZXRoZXIgdGhlIFJlcGxhY2UgaW5wdXQgd2FzIHRoZSBsYXN0IGZvY3VzZWQgaW5wdXQgaW4gdGhlIGZpbmQgd2lkZ2V0LlxuXHQgKiBSZXR1cm5zIGZhbHNlIGJ5IGRlZmF1bHQ7IG92ZXJyaWRkZW4gaW4gRmluZENvbnRyb2xsZXIuXG5cdCAqL1xuXHRwdWJsaWMgd2FzUmVwbGFjZUlucHV0TGFzdEZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGxhc3QgZm9jdXNlZCBlbGVtZW50IGluIHRoZSBmaW5kIHdpZGdldC5cblx0ICogSW1wbGVtZW50ZWQgYnkgRmluZENvbnRyb2xsZXI7IGJhc2UgaW1wbGVtZW50YXRpb24gZG9lcyBub3RoaW5nLlxuXHQgKi9cblx0cHVibGljIGZvY3VzTGFzdEVsZW1lbnQoKTogdm9pZCB7XG5cdFx0Ly8gQmFzZSBpbXBsZW1lbnRhdGlvbiAtIG92ZXJyaWRkZW4gaW4gRmluZENvbnRyb2xsZXJcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGF0ZSgpOiBGaW5kUmVwbGFjZVN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdH1cblxuXHRwdWJsaWMgY2xvc2VGaW5kV2lkZ2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7XG5cdFx0XHRpc1JldmVhbGVkOiBmYWxzZSxcblx0XHRcdHNlYXJjaFNjb3BlOiBudWxsXG5cdFx0fSwgZmFsc2UpO1xuXHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIHRvZ2dsZUNhc2VTZW5zaXRpdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgbWF0Y2hDYXNlOiAhdGhpcy5fc3RhdGUubWF0Y2hDYXNlIH0sIGZhbHNlKTtcblx0XHRpZiAoIXRoaXMuX3N0YXRlLmlzUmV2ZWFsZWQpIHtcblx0XHRcdHRoaXMuaGlnaGxpZ2h0RmluZE9wdGlvbnMoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdG9nZ2xlV2hvbGVXb3JkcygpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyB3aG9sZVdvcmQ6ICF0aGlzLl9zdGF0ZS53aG9sZVdvcmQgfSwgZmFsc2UpO1xuXHRcdGlmICghdGhpcy5fc3RhdGUuaXNSZXZlYWxlZCkge1xuXHRcdFx0dGhpcy5oaWdobGlnaHRGaW5kT3B0aW9ucygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB0b2dnbGVSZWdleCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBpc1JlZ2V4OiAhdGhpcy5fc3RhdGUuaXNSZWdleCB9LCBmYWxzZSk7XG5cdFx0aWYgKCF0aGlzLl9zdGF0ZS5pc1JldmVhbGVkKSB7XG5cdFx0XHR0aGlzLmhpZ2hsaWdodEZpbmRPcHRpb25zKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRvZ2dsZVByZXNlcnZlQ2FzZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdGF0ZS5jaGFuZ2UoeyBwcmVzZXJ2ZUNhc2U6ICF0aGlzLl9zdGF0ZS5wcmVzZXJ2ZUNhc2UgfSwgZmFsc2UpO1xuXHRcdGlmICghdGhpcy5fc3RhdGUuaXNSZXZlYWxlZCkge1xuXHRcdFx0dGhpcy5oaWdobGlnaHRGaW5kT3B0aW9ucygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB0b2dnbGVTZWFyY2hTY29wZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUuc2VhcmNoU2NvcGUpIHtcblx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFNjb3BlOiBudWxsIH0sIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0bGV0IHNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0XHRzZWxlY3Rpb25zID0gc2VsZWN0aW9ucy5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uLmVuZENvbHVtbiA9PT0gMSAmJiBzZWxlY3Rpb24uZW5kTGluZU51bWJlciA+IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHNlbGVjdGlvbiA9IHNlbGVjdGlvbi5zZXRFbmRQb3NpdGlvbihcblx0XHRcdFx0XHRcdFx0c2VsZWN0aW9uLmVuZExpbmVOdW1iZXIgLSAxLFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZU1heENvbHVtbihzZWxlY3Rpb24uZW5kTGluZU51bWJlciAtIDEpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIXNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBzZWxlY3Rpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9KS5maWx0ZXIoKGVsZW1lbnQpOiBlbGVtZW50IGlzIFNlbGVjdGlvbiA9PiAhIWVsZW1lbnQpO1xuXG5cdFx0XHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlLmNoYW5nZSh7IHNlYXJjaFNjb3BlOiBzZWxlY3Rpb25zIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldFNlYXJjaFN0cmluZyhzZWFyY2hTdHJpbmc6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGF0ZS5pc1JlZ2V4KSB7XG5cdFx0XHRzZWFyY2hTdHJpbmcgPSBzdHJpbmdzLmVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoc2VhcmNoU3RyaW5nKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiBzZWFyY2hTdHJpbmcgfSwgZmFsc2UpO1xuXHR9XG5cblx0cHVibGljIGhpZ2hsaWdodEZpbmRPcHRpb25zKGlnbm9yZVdoZW5WaXNpYmxlOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHQvLyBvdmVyd3JpdHRlbiBpbiBzdWJjbGFzc1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9zdGFydChvcHRzOiBJRmluZFN0YXJ0T3B0aW9ucywgbmV3U3RhdGU/OiBJTmV3RmluZFJlcGxhY2VTdGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzcG9zZU1vZGVsKCk7XG5cblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHQvLyBjYW5ub3QgZG8gYW55dGhpbmcgd2l0aCBhbiBlZGl0b3IgdGhhdCBkb2Vzbid0IGhhdmUgYSBtb2RlbC4uLlxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlQ2hhbmdlczogSU5ld0ZpbmRSZXBsYWNlU3RhdGUgPSB7XG5cdFx0XHQuLi5uZXdTdGF0ZSxcblx0XHRcdGlzUmV2ZWFsZWQ6IHRydWVcblx0XHR9O1xuXG5cdFx0aWYgKG9wdHMuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdzaW5nbGUnKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25TZWFyY2hTdHJpbmcgPSBnZXRTZWxlY3Rpb25TZWFyY2hTdHJpbmcodGhpcy5fZWRpdG9yLCBvcHRzLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uLCBvcHRzLnNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb24pO1xuXHRcdFx0aWYgKHNlbGVjdGlvblNlYXJjaFN0cmluZykge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhdGUuaXNSZWdleCkge1xuXHRcdFx0XHRcdHN0YXRlQ2hhbmdlcy5zZWFyY2hTdHJpbmcgPSBzdHJpbmdzLmVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoc2VsZWN0aW9uU2VhcmNoU3RyaW5nKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdGF0ZUNoYW5nZXMuc2VhcmNoU3RyaW5nID0gc2VsZWN0aW9uU2VhcmNoU3RyaW5nO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChvcHRzLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uID09PSAnbXVsdGlwbGUnICYmICFvcHRzLnVwZGF0ZVNlYXJjaFNjb3BlKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25TZWFyY2hTdHJpbmcgPSBnZXRTZWxlY3Rpb25TZWFyY2hTdHJpbmcodGhpcy5fZWRpdG9yLCBvcHRzLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uKTtcblx0XHRcdGlmIChzZWxlY3Rpb25TZWFyY2hTdHJpbmcpIHtcblx0XHRcdFx0c3RhdGVDaGFuZ2VzLnNlYXJjaFN0cmluZyA9IHNlbGVjdGlvblNlYXJjaFN0cmluZztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXN0YXRlQ2hhbmdlcy5zZWFyY2hTdHJpbmcgJiYgb3B0cy5zZWVkU2VhcmNoU3RyaW5nRnJvbUdsb2JhbENsaXBib2FyZCkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uU2VhcmNoU3RyaW5nID0gYXdhaXQgdGhpcy5nZXRHbG9iYWxCdWZmZXJUZXJtKCk7XG5cblx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0Ly8gdGhlIGVkaXRvciBoYXMgbG9zdCBpdHMgbW9kZWwgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlbGVjdGlvblNlYXJjaFN0cmluZykge1xuXHRcdFx0XHRzdGF0ZUNoYW5nZXMuc2VhcmNoU3RyaW5nID0gc2VsZWN0aW9uU2VhcmNoU3RyaW5nO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE92ZXJ3cml0ZSBpc1JlcGxhY2VSZXZlYWxlZFxuXHRcdGlmIChvcHRzLmZvcmNlUmV2ZWFsUmVwbGFjZSB8fCBzdGF0ZUNoYW5nZXMuaXNSZXBsYWNlUmV2ZWFsZWQpIHtcblx0XHRcdHN0YXRlQ2hhbmdlcy5pc1JlcGxhY2VSZXZlYWxlZCA9IHRydWU7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5fZmluZFdpZGdldFZpc2libGUuZ2V0KCkpIHtcblx0XHRcdHN0YXRlQ2hhbmdlcy5pc1JlcGxhY2VSZXZlYWxlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChvcHRzLnVwZGF0ZVNlYXJjaFNjb3BlKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50U2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0XHRpZiAoY3VycmVudFNlbGVjdGlvbnMuc29tZShzZWxlY3Rpb24gPT4gIXNlbGVjdGlvbi5pc0VtcHR5KCkpKSB7XG5cdFx0XHRcdHN0YXRlQ2hhbmdlcy5zZWFyY2hTY29wZSA9IGN1cnJlbnRTZWxlY3Rpb25zO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHN0YXRlQ2hhbmdlcy5sb29wID0gb3B0cy5sb29wO1xuXG5cdFx0dGhpcy5fc3RhdGUuY2hhbmdlKHN0YXRlQ2hhbmdlcywgZmFsc2UpO1xuXG5cdFx0aWYgKCF0aGlzLl9tb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWwgPSBuZXcgRmluZE1vZGVsQm91bmRUb0VkaXRvck1vZGVsKHRoaXMuX2VkaXRvciwgdGhpcy5fc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGFydChvcHRzOiBJRmluZFN0YXJ0T3B0aW9ucywgbmV3U3RhdGU/OiBJTmV3RmluZFJlcGxhY2VTdGF0ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGFydChvcHRzLCBuZXdTdGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgbW92ZVRvTmV4dE1hdGNoKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWwubW92ZVRvTmV4dE1hdGNoKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIG1vdmVUb1ByZXZNYXRjaCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fbW9kZWwpIHtcblx0XHRcdHRoaXMuX21vZGVsLm1vdmVUb1ByZXZNYXRjaCgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnb1RvTWF0Y2goaW5kZXg6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWwubW92ZVRvTWF0Y2goaW5kZXgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyByZXBsYWNlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWwucmVwbGFjZSgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyByZXBsYWNlQWxsKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5pc1Rvb0xhcmdlRm9ySGVhcE9wZXJhdGlvbigpKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihubHMubG9jYWxpemUoJ3Rvby5sYXJnZS5mb3IucmVwbGFjZWFsbCcsIFwiVGhlIGZpbGUgaXMgdG9vIGxhcmdlIHRvIHBlcmZvcm0gYSByZXBsYWNlIGFsbCBvcGVyYXRpb24uXCIpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbW9kZWwucmVwbGFjZUFsbCgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzZWxlY3RBbGxNYXRjaGVzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbCkge1xuXHRcdFx0dGhpcy5fbW9kZWwuc2VsZWN0QWxsTWF0Y2hlcygpO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldEdsb2JhbEJ1ZmZlclRlcm0oKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAodGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuZ2xvYmFsRmluZENsaXBib2FyZFxuXHRcdFx0JiYgdGhpcy5fZWRpdG9yLmhhc01vZGVsKClcblx0XHRcdCYmICF0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS5pc1Rvb0xhcmdlRm9yU3luY2luZygpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2xpcGJvYXJkU2VydmljZS5yZWFkRmluZFRleHQoKTtcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHVibGljIHNldEdsb2JhbEJ1ZmZlclRlcm0odGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmdsb2JhbEZpbmRDbGlwYm9hcmRcblx0XHRcdCYmIHRoaXMuX2VkaXRvci5oYXNNb2RlbCgpXG5cdFx0XHQmJiAhdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkuaXNUb29MYXJnZUZvclN5bmNpbmcoKVxuXHRcdCkge1xuXHRcdFx0Ly8gaW50ZW50aW9uYWxseSBub3QgYXdhaXRlZFxuXHRcdFx0dGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZUZpbmRUZXh0KHRleHQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmluZENvbnRyb2xsZXIgZXh0ZW5kcyBDb21tb25GaW5kQ29udHJvbGxlciBpbXBsZW1lbnRzIElGaW5kQ29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSBfd2lkZ2V0OiBGaW5kV2lkZ2V0IHwgbnVsbDtcblx0cHJpdmF0ZSBfZmluZE9wdGlvbnNXaWRnZXQ6IEZpbmRPcHRpb25zV2lkZ2V0IHwgbnVsbDtcblx0cHJpdmF0ZSBfZmluZFdpZGdldFNlYXJjaEhpc3Rvcnk6IEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5O1xuXHRwcml2YXRlIF9yZXBsYWNlV2lkZ2V0SGlzdG9yeTogUmVwbGFjZVdpZGdldEhpc3Rvcnk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IsIF9jb250ZXh0S2V5U2VydmljZSwgX3N0b3JhZ2VTZXJ2aWNlLCBjbGlwYm9hcmRTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHRcdHRoaXMuX3dpZGdldCA9IG51bGw7XG5cdFx0dGhpcy5fZmluZE9wdGlvbnNXaWRnZXQgPSBudWxsO1xuXHRcdHRoaXMuX2ZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5ID0gRmluZFdpZGdldFNlYXJjaEhpc3RvcnkuZ2V0T3JDcmVhdGUoX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZXBsYWNlV2lkZ2V0SGlzdG9yeSA9IFJlcGxhY2VXaWRnZXRIaXN0b3J5LmdldE9yQ3JlYXRlKF9zdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX3N0YXJ0KG9wdHM6IElGaW5kU3RhcnRPcHRpb25zLCBuZXdTdGF0ZT86IElOZXdGaW5kUmVwbGFjZVN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl93aWRnZXQpIHtcblx0XHRcdHRoaXMuX2NyZWF0ZUZpbmRXaWRnZXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0bGV0IHVwZGF0ZVNlYXJjaFNjb3BlID0gZmFsc2U7XG5cblx0XHRzd2l0Y2ggKHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmF1dG9GaW5kSW5TZWxlY3Rpb24pIHtcblx0XHRcdGNhc2UgJ2Fsd2F5cyc6XG5cdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICduZXZlcic6XG5cdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlID0gZmFsc2U7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbXVsdGlsaW5lJzoge1xuXHRcdFx0XHRjb25zdCBpc1NlbGVjdGlvbk11bHRpcGxlTGluZSA9ICEhc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgIT09IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHR1cGRhdGVTZWFyY2hTY29wZSA9IGlzU2VsZWN0aW9uTXVsdGlwbGVMaW5lO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdG9wdHMudXBkYXRlU2VhcmNoU2NvcGUgPSBvcHRzLnVwZGF0ZVNlYXJjaFNjb3BlIHx8IHVwZGF0ZVNlYXJjaFNjb3BlO1xuXG5cdFx0YXdhaXQgc3VwZXIuX3N0YXJ0KG9wdHMsIG5ld1N0YXRlKTtcblxuXHRcdGlmICh0aGlzLl93aWRnZXQpIHtcblx0XHRcdGlmIChvcHRzLnNob3VsZEZvY3VzID09PSBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Gb2N1c1JlcGxhY2VJbnB1dCkge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQuZm9jdXNSZXBsYWNlSW5wdXQoKTtcblx0XHRcdH0gZWxzZSBpZiAob3B0cy5zaG91bGRGb2N1cyA9PT0gRmluZFN0YXJ0Rm9jdXNBY3Rpb24uRm9jdXNGaW5kSW5wdXQpIHtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LmZvY3VzRmluZElucHV0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGhpZ2hsaWdodEZpbmRPcHRpb25zKGlnbm9yZVdoZW5WaXNpYmxlOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3dpZGdldCkge1xuXHRcdFx0dGhpcy5fY3JlYXRlRmluZFdpZGdldCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RhdGUuaXNSZXZlYWxlZCAmJiAhaWdub3JlV2hlblZpc2libGUpIHtcblx0XHRcdHRoaXMuX3dpZGdldCEuaGlnaGxpZ2h0RmluZE9wdGlvbnMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZmluZE9wdGlvbnNXaWRnZXQhLmhpZ2hsaWdodEZpbmRPcHRpb25zKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRmluZFdpZGdldCgpIHtcblx0XHR0aGlzLl93aWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmluZFdpZGdldCh0aGlzLl9lZGl0b3IsIHRoaXMsIHRoaXMuX3N0YXRlLCB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5faG92ZXJTZXJ2aWNlLCB0aGlzLl9maW5kV2lkZ2V0U2VhcmNoSGlzdG9yeSwgdGhpcy5fcmVwbGFjZVdpZGdldEhpc3RvcnksIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZSkpO1xuXHRcdHRoaXMuX2ZpbmRPcHRpb25zV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEZpbmRPcHRpb25zV2lkZ2V0KHRoaXMuX2VkaXRvciwgdGhpcy5fc3RhdGUsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSBSZXBsYWNlIGlucHV0IHdhcyB0aGUgbGFzdCBmb2N1c2VkIGlucHV0IGluIHRoZSBmaW5kIHdpZGdldC5cblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSB3YXNSZXBsYWNlSW5wdXRMYXN0Rm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0Py5sYXN0Rm9jdXNlZElucHV0V2FzUmVwbGFjZSA/PyBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBsYXN0IGZvY3VzZWQgZWxlbWVudCBpbiB0aGUgZmluZCB3aWRnZXQuXG5cdCAqIFRoaXMgaXMgbW9yZSBwcmVjaXNlIHRoYW4ganVzdCBmb2N1c2luZyB0aGUgRmluZCBvciBSZXBsYWNlIGlucHV0LFxuXHQgKiBhcyBpdCBjYW4gcmVzdG9yZSBmb2N1cyB0byBjaGVja2JveGVzLCBidXR0b25zLCBldGMuXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgZm9jdXNMYXN0RWxlbWVudCgpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQ/LmZvY3VzTGFzdEVsZW1lbnQoKTtcblx0fVxuXG5cdHNhdmVWaWV3U3RhdGUoKTogYW55IHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0Py5nZXRWaWV3U3RhdGUoKTtcblx0fVxuXG5cdHJlc3RvcmVWaWV3U3RhdGUoc3RhdGU6IGFueSk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldD8uc2V0Vmlld1N0YXRlKHN0YXRlKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgU3RhcnRGaW5kQWN0aW9uID0gcmVnaXN0ZXJNdWx0aUVkaXRvckFjdGlvbihuZXcgTXVsdGlFZGl0b3JBY3Rpb24oe1xuXHRpZDogRklORF9JRFMuU3RhcnRGaW5kQWN0aW9uLFxuXHRsYWJlbDogbmxzLmxvY2FsaXplMignc3RhcnRGaW5kQWN0aW9uJywgXCJGaW5kXCIpLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLm9yKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBDb250ZXh0S2V5RXhwci5oYXMoJ2VkaXRvcklzT3BlbicpKSxcblx0a2JPcHRzOiB7XG5cdFx0a2JFeHByOiBudWxsLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlGLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdH0sXG5cdG1lbnVPcHRzOiB7XG5cdFx0bWVudUlkOiBNZW51SWQuTWVudWJhckVkaXRNZW51LFxuXHRcdGdyb3VwOiAnM19maW5kJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlGaW5kJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRmluZFwiKSxcblx0XHRvcmRlcjogMVxuXHR9XG59KSk7XG5cblN0YXJ0RmluZEFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbigwLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IGFueSk6IGJvb2xlYW4gfCBQcm9taXNlPHZvaWQ+ID0+IHtcblx0Y29uc3QgY29udHJvbGxlciA9IENvbW1vbkZpbmRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIGNvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdGZvcmNlUmV2ZWFsUmVwbGFjZTogZmFsc2UsXG5cdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uICE9PSAnbmV2ZXInID8gJ3NpbmdsZScgOiAnbm9uZScsXG5cdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdzZWxlY3Rpb24nLFxuXHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5nbG9iYWxGaW5kQ2xpcGJvYXJkLFxuXHRcdHNob3VsZEZvY3VzOiBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Gb2N1c0ZpbmRJbnB1dCxcblx0XHRzaG91bGRBbmltYXRlOiB0cnVlLFxuXHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiBmYWxzZSxcblx0XHRsb29wOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5sb29wXG5cdH0pO1xufSk7XG5cbmNvbnN0IGZpbmRBcmdEZXNjcmlwdGlvbiA9IHtcblx0ZGVzY3JpcHRpb246ICdPcGVuIGEgbmV3IEluLUVkaXRvciBGaW5kIFdpZGdldC4nLFxuXHRhcmdzOiBbe1xuXHRcdG5hbWU6ICdPcGVuIGEgbmV3IEluLUVkaXRvciBGaW5kIFdpZGdldCBhcmdzJyxcblx0XHRzY2hlbWE6IHtcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0c2VhcmNoU3RyaW5nOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdHJlcGxhY2VTdHJpbmc6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0aXNSZWdleDogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0bWF0Y2hXaG9sZVdvcmQ6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdGlzQ2FzZVNlbnNpdGl2ZTogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0cHJlc2VydmVDYXNlOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRmaW5kSW5TZWxlY3Rpb246IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHR9XG5cdFx0fVxuXHR9XVxufSBhcyBjb25zdDtcblxuZXhwb3J0IGNsYXNzIFN0YXJ0RmluZFdpdGhBcmdzQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRklORF9JRFMuU3RhcnRGaW5kV2l0aEFyZ3MsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc3RhcnRGaW5kV2l0aEFyZ3NBY3Rpb24nLCBcIkZpbmQgd2l0aCBBcmd1bWVudHNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IG51bGwsXG5cdFx0XHRcdHByaW1hcnk6IDAsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IGZpbmRBcmdEZXNjcmlwdGlvblxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJncz86IElGaW5kU3RhcnRBcmd1bWVudHMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKGNvbnRyb2xsZXIpIHtcblx0XHRcdGNvbnN0IG5ld1N0YXRlOiBJTmV3RmluZFJlcGxhY2VTdGF0ZSA9IGFyZ3MgPyB7XG5cdFx0XHRcdHNlYXJjaFN0cmluZzogYXJncy5zZWFyY2hTdHJpbmcsXG5cdFx0XHRcdHJlcGxhY2VTdHJpbmc6IGFyZ3MucmVwbGFjZVN0cmluZyxcblx0XHRcdFx0aXNSZXBsYWNlUmV2ZWFsZWQ6IGFyZ3MucmVwbGFjZVN0cmluZyAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0XHRpc1JlZ2V4OiBhcmdzLmlzUmVnZXgsXG5cdFx0XHRcdC8vIGlzUmVnZXhPdmVycmlkZTogYXJncy5yZWdleE92ZXJyaWRlLFxuXHRcdFx0XHR3aG9sZVdvcmQ6IGFyZ3MubWF0Y2hXaG9sZVdvcmQsXG5cdFx0XHRcdC8vIHdob2xlV29yZE92ZXJyaWRlOiBhcmdzLndob2xlV29yZE92ZXJyaWRlLFxuXHRcdFx0XHRtYXRjaENhc2U6IGFyZ3MuaXNDYXNlU2Vuc2l0aXZlLFxuXHRcdFx0XHQvLyBtYXRjaENhc2VPdmVycmlkZTogYXJncy5tYXRjaENhc2VPdmVycmlkZSxcblx0XHRcdFx0cHJlc2VydmVDYXNlOiBhcmdzLnByZXNlcnZlQ2FzZSxcblx0XHRcdFx0Ly8gcHJlc2VydmVDYXNlT3ZlcnJpZGU6IGFyZ3MucHJlc2VydmVDYXNlT3ZlcnJpZGUsXG5cdFx0XHR9IDoge307XG5cblx0XHRcdGF3YWl0IGNvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdFx0XHRmb3JjZVJldmVhbFJlcGxhY2U6IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogKGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTdHJpbmcubGVuZ3RoID09PSAwKSAmJiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiAhPT0gJ25ldmVyJyA/ICdzaW5nbGUnIDogJ25vbmUnLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA9PT0gJ3NlbGVjdGlvbicsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiB0cnVlLFxuXHRcdFx0XHRzaG91bGRGb2N1czogRmluZFN0YXJ0Rm9jdXNBY3Rpb24uRm9jdXNGaW5kSW5wdXQsXG5cdFx0XHRcdHNob3VsZEFuaW1hdGU6IHRydWUsXG5cdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiBhcmdzPy5maW5kSW5TZWxlY3Rpb24gfHwgZmFsc2UsXG5cdFx0XHRcdGxvb3A6IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmxvb3Bcblx0XHRcdH0sIG5ld1N0YXRlKTtcblxuXHRcdFx0Y29udHJvbGxlci5zZXRHbG9iYWxCdWZmZXJUZXJtKGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTdHJpbmcpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhcnRGaW5kV2l0aFNlbGVjdGlvbkFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZJTkRfSURTLlN0YXJ0RmluZFdpdGhTZWxlY3Rpb24sXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc3RhcnRGaW5kV2l0aFNlbGVjdGlvbkFjdGlvbicsIFwiRmluZCB3aXRoIFNlbGVjdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogbnVsbCxcblx0XHRcdFx0cHJpbWFyeTogMCxcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbW1vbkZpbmRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHRhd2FpdCBjb250cm9sbGVyLnN0YXJ0KHtcblx0XHRcdFx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBmYWxzZSxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246ICdtdWx0aXBsZScsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb246IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbUdsb2JhbENsaXBib2FyZDogZmFsc2UsXG5cdFx0XHRcdHNob3VsZEZvY3VzOiBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Ob0ZvY3VzQ2hhbmdlLFxuXHRcdFx0XHRzaG91bGRBbmltYXRlOiB0cnVlLFxuXHRcdFx0XHR1cGRhdGVTZWFyY2hTY29wZTogZmFsc2UsXG5cdFx0XHRcdGxvb3A6IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLmxvb3Bcblx0XHRcdH0pO1xuXG5cdFx0XHRjb250cm9sbGVyLnNldEdsb2JhbEJ1ZmZlclRlcm0oY29udHJvbGxlci5nZXRTdGF0ZSgpLnNlYXJjaFN0cmluZyk7XG5cdFx0fVxuXHR9XG59XG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTWF0Y2hGaW5kQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoY29udHJvbGxlciAmJiAhdGhpcy5fcnVuKGNvbnRyb2xsZXIpKSB7XG5cdFx0XHRhd2FpdCBjb250cm9sbGVyLnN0YXJ0KHtcblx0XHRcdFx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBmYWxzZSxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246IChjb250cm9sbGVyLmdldFN0YXRlKCkuc2VhcmNoU3RyaW5nLmxlbmd0aCA9PT0gMCkgJiYgZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gIT09ICduZXZlcicgPyAnc2luZ2xlJyA6ICdub25lJyxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdzZWxlY3Rpb24nLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbUdsb2JhbENsaXBib2FyZDogdHJ1ZSxcblx0XHRcdFx0c2hvdWxkRm9jdXM6IEZpbmRTdGFydEZvY3VzQWN0aW9uLk5vRm9jdXNDaGFuZ2UsXG5cdFx0XHRcdHNob3VsZEFuaW1hdGU6IHRydWUsXG5cdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiBmYWxzZSxcblx0XHRcdFx0bG9vcDogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkubG9vcFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9ydW4oY29udHJvbGxlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9ydW4oY29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiBib29sZWFuO1xufVxuXG5hc3luYyBmdW5jdGlvbiBtYXRjaEZpbmRBY3Rpb24oZWRpdG9yOiBJQ29kZUVkaXRvciwgbmV4dDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBjb250cm9sbGVyID0gQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdGlmICghY29udHJvbGxlcikge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBzaG91bGRDbG9zZU9uUmVzdWx0ID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuY2xvc2VPblJlc3VsdDtcblx0Y29uc3Qgd2FzRmluZFdpZGdldFZpc2libGUgPSBjb250cm9sbGVyLmdldFN0YXRlKCkuaXNSZXZlYWxlZDtcblxuXHRjb25zdCBydW5NYXRjaCA9ICgpOiBib29sZWFuID0+IHtcblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGlvbiA9IGNvbnRyb2xsZXIuZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5leHQgPyBjb250cm9sbGVyLm1vdmVUb05leHRNYXRjaCgpIDogY29udHJvbGxlci5tb3ZlVG9QcmV2TWF0Y2goKTtcblxuXHRcdGxldCBsYW5kZWRPbk1hdGNoID0gZmFsc2U7XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0Y29uc3QgY3VycmVudFNlbGVjdGlvbiA9IGNvbnRyb2xsZXIuZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0aWYgKCFwcmV2aW91c1NlbGVjdGlvbiAmJiBjdXJyZW50U2VsZWN0aW9uKSB7XG5cdFx0XHRcdGxhbmRlZE9uTWF0Y2ggPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmIChwcmV2aW91c1NlbGVjdGlvbiAmJiBjdXJyZW50U2VsZWN0aW9uICYmICFwcmV2aW91c1NlbGVjdGlvbi5lcXVhbHNTZWxlY3Rpb24oY3VycmVudFNlbGVjdGlvbikpIHtcblx0XHRcdFx0bGFuZGVkT25NYXRjaCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGxhbmRlZE9uTWF0Y2gpIHtcblx0XHRcdGNvbnRyb2xsZXIuZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0aWYgKHNob3VsZENsb3NlT25SZXN1bHQgJiYgd2FzRmluZFdpZGdldFZpc2libGUgJiYgY29udHJvbGxlci5pc0ZpbmRJbnB1dEZvY3VzZWQoKSkge1xuXHRcdFx0XHRjb250cm9sbGVyLmNsb3NlRmluZFdpZGdldCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fTtcblxuXHRpZiAoIXJ1bk1hdGNoKCkpIHtcblx0XHRhd2FpdCBjb250cm9sbGVyLnN0YXJ0KHtcblx0XHRcdGZvcmNlUmV2ZWFsUmVwbGFjZTogZmFsc2UsXG5cdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogKGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTdHJpbmcubGVuZ3RoID09PSAwKSAmJiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiAhPT0gJ25ldmVyJyA/ICdzaW5nbGUnIDogJ25vbmUnLFxuXHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdzZWxlY3Rpb24nLFxuXHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21HbG9iYWxDbGlwYm9hcmQ6IHRydWUsXG5cdFx0XHRzaG91bGRGb2N1czogRmluZFN0YXJ0Rm9jdXNBY3Rpb24uTm9Gb2N1c0NoYW5nZSxcblx0XHRcdHNob3VsZEFuaW1hdGU6IHRydWUsXG5cdFx0XHR1cGRhdGVTZWFyY2hTY29wZTogZmFsc2UsXG5cdFx0XHRsb29wOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5sb29wXG5cdFx0fSk7XG5cdFx0aWYgKCFydW5NYXRjaCgpKSB7XG5cdFx0XHQvLyBSZS1hbm5vdW5jZSBcIm5vIHJlc3VsdHNcIiBmb3Igc2NyZWVuIHJlYWRlcnMgb24gZXhwbGljaXQgbmF2aWdhdGlvbiAoIzMwMTEyNilcblx0XHRcdGNvbnN0IHN0YXRlID0gY29udHJvbGxlci5nZXRTdGF0ZSgpO1xuXHRcdFx0aWYgKHdhc0ZpbmRXaWRnZXRWaXNpYmxlICYmIHN0YXRlLm1hdGNoZXNDb3VudCA9PT0gMCAmJiBzdGF0ZS5zZWFyY2hTdHJpbmcpIHtcblx0XHRcdFx0YWxlcnRGbihubHMubG9jYWxpemUoJ2FyaWFTZWFyY2hOb1Jlc3VsdCcsIFwiezB9IGZvdW5kIGZvciAnezF9J1wiLCBOTFNfTk9fUkVTVUxUUywgc3RhdGUuc2VhcmNoU3RyaW5nKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBOZXh0TWF0Y2hGaW5kQWN0aW9uID0gcmVnaXN0ZXJNdWx0aUVkaXRvckFjdGlvbihuZXcgTXVsdGlFZGl0b3JBY3Rpb24oe1xuXHRpZDogRklORF9JRFMuTmV4dE1hdGNoRmluZEFjdGlvbixcblx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZpbmROZXh0TWF0Y2hBY3Rpb24nLCBcIkZpbmQgTmV4dFwiKSxcblx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdGtiT3B0czogW3tcblx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRjMsXG5cdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlHLCBzZWNvbmRhcnk6IFtLZXlDb2RlLkYzXSB9LFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdH0sIHtcblx0XHRrYkV4cHI6IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgQ09OVEVYVF9GSU5EX0lOUFVUX0ZPQ1VTRUQpLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0fV1cbn0pKTtcblxuTmV4dE1hdGNoRmluZEFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbigwLCBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IGFueSk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRyZXR1cm4gbWF0Y2hGaW5kQWN0aW9uKGVkaXRvciwgdHJ1ZSk7XG59KTtcblxuXG5leHBvcnQgY29uc3QgUHJldmlvdXNNYXRjaEZpbmRBY3Rpb24gPSByZWdpc3Rlck11bHRpRWRpdG9yQWN0aW9uKG5ldyBNdWx0aUVkaXRvckFjdGlvbih7XG5cdGlkOiBGSU5EX0lEUy5QcmV2aW91c01hdGNoRmluZEFjdGlvbixcblx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZpbmRQcmV2aW91c01hdGNoQWN0aW9uJywgXCJGaW5kIFByZXZpb3VzXCIpLFxuXHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0a2JPcHRzOiBbe1xuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5GMyxcblx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUcsIHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRjNdIH0sXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0fSwge1xuXHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBDT05URVhUX0ZJTkRfSU5QVVRfRk9DVVNFRCksXG5cdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbnRlcixcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHR9XVxufSkpO1xuXG5QcmV2aW91c01hdGNoRmluZEFjdGlvbi5hZGRJbXBsZW1lbnRhdGlvbigwLCBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IGFueSk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRyZXR1cm4gbWF0Y2hGaW5kQWN0aW9uKGVkaXRvciwgZmFsc2UpO1xufSk7XG5cbmV4cG9ydCBjbGFzcyBNb3ZlVG9NYXRjaEZpbmRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHByaXZhdGUgX2hpZ2hsaWdodERlY29yYXRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRklORF9JRFMuR29Ub01hdGNoRmluZEFjdGlvbixcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdmaW5kTWF0Y2hBY3Rpb24uZ29Ub01hdGNoJywgXCJHbyB0byBNYXRjaC4uLlwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaGVzQ291bnQgPSBjb250cm9sbGVyLmdldFN0YXRlKCkubWF0Y2hlc0NvdW50O1xuXHRcdGlmIChtYXRjaGVzQ291bnQgPCAxKSB7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZmluZE1hdGNoQWN0aW9uLm5vUmVzdWx0cycsIFwiTm8gbWF0Y2hlcy4gVHJ5IHNlYXJjaGluZyBmb3Igc29tZXRoaW5nIGVsc2UuXCIpXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGlucHV0Qm94ID0gZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZUlucHV0Qm94KCkpO1xuXHRcdGlucHV0Qm94LnBsYWNlaG9sZGVyID0gbmxzLmxvY2FsaXplKCdmaW5kTWF0Y2hBY3Rpb24uaW5wdXRQbGFjZUhvbGRlcicsIFwiVHlwZSBhIG51bWJlciB0byBnbyB0byBhIHNwZWNpZmljIG1hdGNoIChiZXR3ZWVuIDEgYW5kIHswfSlcIiwgbWF0Y2hlc0NvdW50KTtcblxuXHRcdGNvbnN0IHRvRmluZE1hdGNoSW5kZXggPSAodmFsdWU6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHBhcnNlSW50KHZhbHVlKTtcblx0XHRcdGlmIChpc05hTihpbmRleCkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF0Y2hDb3VudCA9IGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5tYXRjaGVzQ291bnQ7XG5cdFx0XHRpZiAoaW5kZXggPiAwICYmIGluZGV4IDw9IG1hdGNoQ291bnQpIHtcblx0XHRcdFx0cmV0dXJuIGluZGV4IC0gMTsgLy8gemVybyBiYXNlZFxuXHRcdFx0fSBlbHNlIGlmIChpbmRleCA8IDAgJiYgaW5kZXggPj0gLW1hdGNoQ291bnQpIHtcblx0XHRcdFx0cmV0dXJuIG1hdGNoQ291bnQgKyBpbmRleDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXBkYXRlUGlja2VyQW5kRWRpdG9yID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdG9GaW5kTWF0Y2hJbmRleCh2YWx1ZSk7XG5cdFx0XHRpZiAodHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHQvLyB2YWxpZFxuXHRcdFx0XHRpbnB1dEJveC52YWxpZGF0aW9uTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29udHJvbGxlci5nb1RvTWF0Y2goaW5kZXgpO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50TWF0Y2ggPSBjb250cm9sbGVyLmdldFN0YXRlKCkuY3VycmVudE1hdGNoO1xuXHRcdFx0XHRpZiAoY3VycmVudE1hdGNoKSB7XG5cdFx0XHRcdFx0dGhpcy5hZGREZWNvcmF0aW9ucyhlZGl0b3IsIGN1cnJlbnRNYXRjaCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKCdmaW5kTWF0Y2hBY3Rpb24uaW5wdXRWYWxpZGF0aW9uTWVzc2FnZScsIFwiUGxlYXNlIHR5cGUgYSBudW1iZXIgYmV0d2VlbiAxIGFuZCB7MH1cIiwgY29udHJvbGxlci5nZXRTdGF0ZSgpLm1hdGNoZXNDb3VudCk7XG5cdFx0XHRcdHRoaXMuY2xlYXJEZWNvcmF0aW9ucyhlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Qm94Lm9uRGlkQ2hhbmdlVmFsdWUodmFsdWUgPT4ge1xuXHRcdFx0dXBkYXRlUGlja2VyQW5kRWRpdG9yKHZhbHVlKTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0b0ZpbmRNYXRjaEluZGV4KGlucHV0Qm94LnZhbHVlKTtcblx0XHRcdGlmICh0eXBlb2YgaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGNvbnRyb2xsZXIuZ29Ub01hdGNoKGluZGV4KTtcblx0XHRcdFx0aW5wdXRCb3guaGlkZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5wdXRCb3gudmFsaWRhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ2ZpbmRNYXRjaEFjdGlvbi5pbnB1dFZhbGlkYXRpb25NZXNzYWdlJywgXCJQbGVhc2UgdHlwZSBhIG51bWJlciBiZXR3ZWVuIDEgYW5kIHswfVwiLCBjb250cm9sbGVyLmdldFN0YXRlKCkubWF0Y2hlc0NvdW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdHRoaXMuY2xlYXJEZWNvcmF0aW9ucyhlZGl0b3IpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdGlucHV0Qm94LnNob3coKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJEZWNvcmF0aW9ucyhlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0ZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKGNoYW5nZUFjY2Vzc29yID0+IHtcblx0XHRcdHRoaXMuX2hpZ2hsaWdodERlY29yYXRpb25zID0gY2hhbmdlQWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLl9oaWdobGlnaHREZWNvcmF0aW9ucywgW10pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGREZWNvcmF0aW9ucyhlZGl0b3I6IElDb2RlRWRpdG9yLCByYW5nZTogSVJhbmdlKTogdm9pZCB7XG5cdFx0ZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKGNoYW5nZUFjY2Vzc29yID0+IHtcblx0XHRcdHRoaXMuX2hpZ2hsaWdodERlY29yYXRpb25zID0gY2hhbmdlQWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyh0aGlzLl9oaWdobGlnaHREZWNvcmF0aW9ucywgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdmaW5kLW1hdGNoLXF1aWNrLWFjY2Vzcy1yYW5nZS1oaWdobGlnaHQnLFxuXHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiAncmFuZ2VIaWdobGlnaHQnLFxuXHRcdFx0XHRcdFx0aXNXaG9sZUxpbmU6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2ZpbmQtbWF0Y2gtcXVpY2stYWNjZXNzLXJhbmdlLWhpZ2hsaWdodC1vdmVydmlldycsXG5cdFx0XHRcdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdFx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKG92ZXJ2aWV3UnVsZXJSYW5nZUhpZ2hsaWdodCksXG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5GdWxsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgU2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25TZWFyY2hTdHJpbmcgPSBnZXRTZWxlY3Rpb25TZWFyY2hTdHJpbmcoZWRpdG9yLCAnc2luZ2xlJywgZmFsc2UpO1xuXHRcdGlmIChzZWxlY3Rpb25TZWFyY2hTdHJpbmcpIHtcblx0XHRcdGNvbnRyb2xsZXIuc2V0U2VhcmNoU3RyaW5nKHNlbGVjdGlvblNlYXJjaFN0cmluZyk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fcnVuKGNvbnRyb2xsZXIpKSB7XG5cdFx0XHRhd2FpdCBjb250cm9sbGVyLnN0YXJ0KHtcblx0XHRcdFx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBmYWxzZSxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246ICdub25lJyxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZmFsc2UsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiBmYWxzZSxcblx0XHRcdFx0c2hvdWxkRm9jdXM6IEZpbmRTdGFydEZvY3VzQWN0aW9uLk5vRm9jdXNDaGFuZ2UsXG5cdFx0XHRcdHNob3VsZEFuaW1hdGU6IHRydWUsXG5cdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiBmYWxzZSxcblx0XHRcdFx0bG9vcDogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkubG9vcFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9ydW4oY29udHJvbGxlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9ydW4oY29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgTmV4dFNlbGVjdGlvbk1hdGNoRmluZEFjdGlvbiBleHRlbmRzIFNlbGVjdGlvbk1hdGNoRmluZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZJTkRfSURTLk5leHRTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24sXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbmV4dFNlbGVjdGlvbk1hdGNoRmluZEFjdGlvbicsIFwiRmluZCBOZXh0IFNlbGVjdGlvblwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5GMyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcnVuKGNvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNvbnRyb2xsZXIubW92ZVRvTmV4dE1hdGNoKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFByZXZpb3VzU2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uIGV4dGVuZHMgU2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRklORF9JRFMuUHJldmlvdXNTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24sXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMigncHJldmlvdXNTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24nLCBcIkZpbmQgUHJldmlvdXMgU2VsZWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkYzLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9ydW4oY29udHJvbGxlcjogQ29tbW9uRmluZENvbnRyb2xsZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29udHJvbGxlci5tb3ZlVG9QcmV2TWF0Y2goKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgU3RhcnRGaW5kUmVwbGFjZUFjdGlvbiA9IHJlZ2lzdGVyTXVsdGlFZGl0b3JBY3Rpb24obmV3IE11bHRpRWRpdG9yQWN0aW9uKHtcblx0aWQ6IEZJTkRfSURTLlN0YXJ0RmluZFJlcGxhY2VBY3Rpb24sXG5cdGxhYmVsOiBubHMubG9jYWxpemUyKCdzdGFydFJlcGxhY2UnLCBcIlJlcGxhY2VcIiksXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsIENvbnRleHRLZXlFeHByLmhhcygnZWRpdG9ySXNPcGVuJykpLFxuXHRrYk9wdHM6IHtcblx0XHRrYkV4cHI6IG51bGwsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUgsXG5cdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5RiB9LFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdH0sXG5cdG1lbnVPcHRzOiB7XG5cdFx0bWVudUlkOiBNZW51SWQuTWVudWJhckVkaXRNZW51LFxuXHRcdGdyb3VwOiAnM19maW5kJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlSZXBsYWNlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmVwbGFjZVwiKSxcblx0XHRvcmRlcjogMlxuXHR9XG59KSk7XG5cblN0YXJ0RmluZFJlcGxhY2VBY3Rpb24uYWRkSW1wbGVtZW50YXRpb24oMCwgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBhbnkpOiBib29sZWFuIHwgUHJvbWlzZTx2b2lkPiA9PiB7XG5cdGlmICghZWRpdG9yLmhhc01vZGVsKCkgfHwgZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGNvbnRyb2xsZXIgPSBDb21tb25GaW5kQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgY3VycmVudFNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0Y29uc3QgZmluZElucHV0Rm9jdXNlZCA9IGNvbnRyb2xsZXIuaXNGaW5kSW5wdXRGb2N1c2VkKCk7XG5cdC8vIHdlIG9ubHkgc2VlZCBzZWFyY2ggc3RyaW5nIGZyb20gc2VsZWN0aW9uIHdoZW4gdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGlzIHNpbmdsZSBsaW5lIGFuZCBub3QgZW1wdHksXG5cdC8vICsgdGhlIGZpbmQgaW5wdXQgaXMgbm90IGZvY3VzZWRcblx0Y29uc3Qgc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPSAhY3VycmVudFNlbGVjdGlvbi5pc0VtcHR5KClcblx0XHQmJiBjdXJyZW50U2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA9PT0gY3VycmVudFNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyXG5cdFx0JiYgKGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZpbmQpLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uICE9PSAnbmV2ZXInKVxuXHRcdCYmICFmaW5kSW5wdXRGb2N1c2VkO1xuXHQvKlxuXHQqIGlmIHRoZSBleGlzdGluZyBzZWFyY2ggc3RyaW5nIGluIGZpbmQgd2lkZ2V0IGlzIGVtcHR5IGFuZCB3ZSBkb24ndCBzZWVkIHNlYXJjaCBzdHJpbmcgZnJvbSBzZWxlY3Rpb24sIGl0IG1lYW5zIHRoZSBGaW5kIElucHV0IGlzIHN0aWxsIGVtcHR5LCBzbyB3ZSBzaG91bGQgZm9jdXMgdGhlIEZpbmQgSW5wdXQgaW5zdGVhZCBvZiBSZXBsYWNlIElucHV0LlxuXG5cdCogZmluZElucHV0Rm9jdXNlZCB0cnVlIC0+IHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uIGZhbHNlLCBGb2N1c1JlcGxhY2VJbnB1dFxuXHQqIGZpbmRJbnB1dEZvY3VzZWQgZmFsc2UsIHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uIHRydWUgRm9jdXNSZXBsYWNlSW5wdXRcblx0KiBmaW5kSW5wdXRGb2N1c2VkIGZhbHNlIHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uIGZhbHNlIEZvY3VzRmluZElucHV0XG5cdCovXG5cdGNvbnN0IHNob3VsZEZvY3VzID0gKGZpbmRJbnB1dEZvY3VzZWQgfHwgc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24pID9cblx0XHRGaW5kU3RhcnRGb2N1c0FjdGlvbi5Gb2N1c1JlcGxhY2VJbnB1dCA6IEZpbmRTdGFydEZvY3VzQWN0aW9uLkZvY3VzRmluZElucHV0O1xuXG5cdHJldHVybiBjb250cm9sbGVyLnN0YXJ0KHtcblx0XHRmb3JjZVJldmVhbFJlcGxhY2U6IHRydWUsXG5cdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246IHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uID8gJ3NpbmdsZScgOiAnbm9uZScsXG5cdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdzZWxlY3Rpb24nLFxuXHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5maW5kKS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiAhPT0gJ25ldmVyJyxcblx0XHRzaG91bGRGb2N1czogc2hvdWxkRm9jdXMsXG5cdFx0c2hvdWxkQW5pbWF0ZTogdHJ1ZSxcblx0XHR1cGRhdGVTZWFyY2hTY29wZTogZmFsc2UsXG5cdFx0bG9vcDogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZmluZCkubG9vcFxuXHR9KTtcbn0pO1xuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihDb21tb25GaW5kQ29udHJvbGxlci5JRCwgRmluZENvbnRyb2xsZXIsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uRWFnZXIpOyAvLyBlYWdlciBiZWNhdXNlIGl0IHVzZXMgYHNhdmVWaWV3U3RhdGVgL2ByZXN0b3JlVmlld1N0YXRlYFxuXG5yZWdpc3RlckVkaXRvckFjdGlvbihTdGFydEZpbmRXaXRoQXJnc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihTdGFydEZpbmRXaXRoU2VsZWN0aW9uQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKE1vdmVUb01hdGNoRmluZEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihOZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFByZXZpb3VzU2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uKTtcblxuY29uc3QgRmluZENvbW1hbmQgPSBFZGl0b3JDb21tYW5kLmJpbmRUb0NvbnRyaWJ1dGlvbjxDb21tb25GaW5kQ29udHJvbGxlcj4oQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBGaW5kQ29tbWFuZCh7XG5cdGlkOiBGSU5EX0lEUy5DbG9zZUZpbmRXaWRnZXRDb21tYW5kLFxuXHRwcmVjb25kaXRpb246IENPTlRFWFRfRklORF9XSURHRVRfVklTSUJMRSxcblx0aGFuZGxlcjogeCA9PiB4LmNsb3NlRmluZFdpZGdldCgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVzY2FwZV1cblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlRvZ2dsZUNhc2VTZW5zaXRpdmVDb21tYW5kLFxuXHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0aGFuZGxlcjogeCA9PiB4LnRvZ2dsZUNhc2VTZW5zaXRpdmUoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA1LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0cHJpbWFyeTogVG9nZ2xlQ2FzZVNlbnNpdGl2ZUtleWJpbmRpbmcucHJpbWFyeSxcblx0XHRtYWM6IFRvZ2dsZUNhc2VTZW5zaXRpdmVLZXliaW5kaW5nLm1hYyxcblx0XHR3aW46IFRvZ2dsZUNhc2VTZW5zaXRpdmVLZXliaW5kaW5nLndpbixcblx0XHRsaW51eDogVG9nZ2xlQ2FzZVNlbnNpdGl2ZUtleWJpbmRpbmcubGludXhcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlRvZ2dsZVdob2xlV29yZENvbW1hbmQsXG5cdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRoYW5kbGVyOiB4ID0+IHgudG9nZ2xlV2hvbGVXb3JkcygpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBUb2dnbGVXaG9sZVdvcmRLZXliaW5kaW5nLnByaW1hcnksXG5cdFx0bWFjOiBUb2dnbGVXaG9sZVdvcmRLZXliaW5kaW5nLm1hYyxcblx0XHR3aW46IFRvZ2dsZVdob2xlV29yZEtleWJpbmRpbmcud2luLFxuXHRcdGxpbnV4OiBUb2dnbGVXaG9sZVdvcmRLZXliaW5kaW5nLmxpbnV4XG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBGaW5kQ29tbWFuZCh7XG5cdGlkOiBGSU5EX0lEUy5Ub2dnbGVSZWdleENvbW1hbmQsXG5cdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRoYW5kbGVyOiB4ID0+IHgudG9nZ2xlUmVnZXgoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA1LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0cHJpbWFyeTogVG9nZ2xlUmVnZXhLZXliaW5kaW5nLnByaW1hcnksXG5cdFx0bWFjOiBUb2dnbGVSZWdleEtleWJpbmRpbmcubWFjLFxuXHRcdHdpbjogVG9nZ2xlUmVnZXhLZXliaW5kaW5nLndpbixcblx0XHRsaW51eDogVG9nZ2xlUmVnZXhLZXliaW5kaW5nLmxpbnV4XG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBGaW5kQ29tbWFuZCh7XG5cdGlkOiBGSU5EX0lEUy5Ub2dnbGVTZWFyY2hTY29wZUNvbW1hbmQsXG5cdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRoYW5kbGVyOiB4ID0+IHgudG9nZ2xlU2VhcmNoU2NvcGUoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA1LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0cHJpbWFyeTogVG9nZ2xlU2VhcmNoU2NvcGVLZXliaW5kaW5nLnByaW1hcnksXG5cdFx0bWFjOiBUb2dnbGVTZWFyY2hTY29wZUtleWJpbmRpbmcubWFjLFxuXHRcdHdpbjogVG9nZ2xlU2VhcmNoU2NvcGVLZXliaW5kaW5nLndpbixcblx0XHRsaW51eDogVG9nZ2xlU2VhcmNoU2NvcGVLZXliaW5kaW5nLmxpbnV4XG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBGaW5kQ29tbWFuZCh7XG5cdGlkOiBGSU5EX0lEUy5Ub2dnbGVQcmVzZXJ2ZUNhc2VDb21tYW5kLFxuXHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0aGFuZGxlcjogeCA9PiB4LnRvZ2dsZVByZXNlcnZlQ2FzZSgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBUb2dnbGVQcmVzZXJ2ZUNhc2VLZXliaW5kaW5nLnByaW1hcnksXG5cdFx0bWFjOiBUb2dnbGVQcmVzZXJ2ZUNhc2VLZXliaW5kaW5nLm1hYyxcblx0XHR3aW46IFRvZ2dsZVByZXNlcnZlQ2FzZUtleWJpbmRpbmcud2luLFxuXHRcdGxpbnV4OiBUb2dnbGVQcmVzZXJ2ZUNhc2VLZXliaW5kaW5nLmxpbnV4XG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBGaW5kQ29tbWFuZCh7XG5cdGlkOiBGSU5EX0lEUy5SZXBsYWNlT25lQWN0aW9uLFxuXHRwcmVjb25kaXRpb246IENPTlRFWFRfRklORF9XSURHRVRfVklTSUJMRSxcblx0aGFuZGxlcjogeCA9PiB4LnJlcGxhY2UoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA1LFxuXHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXMsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRpZ2l0MVxuXHR9XG59KSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRmluZENvbW1hbmQoe1xuXHRpZDogRklORF9JRFMuUmVwbGFjZU9uZUFjdGlvbixcblx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZJTkRfV0lER0VUX1ZJU0lCTEUsXG5cdGhhbmRsZXI6IHggPT4geC5yZXBsYWNlKCksXG5cdGtiT3B0czoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgNSxcblx0XHRrYkV4cHI6IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy5mb2N1cywgQ09OVEVYVF9SRVBMQUNFX0lOUFVUX0ZPQ1VTRUQpLFxuXHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXJcblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlJlcGxhY2VBbGxBY3Rpb24sXG5cdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFLFxuXHRoYW5kbGVyOiB4ID0+IHgucmVwbGFjZUFsbCgpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkVudGVyXG5cdH1cbn0pKTtcblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBGaW5kQ29tbWFuZCh7XG5cdGlkOiBGSU5EX0lEUy5SZXBsYWNlQWxsQWN0aW9uLFxuXHRwcmVjb25kaXRpb246IENPTlRFWFRfRklORF9XSURHRVRfVklTSUJMRSxcblx0aGFuZGxlcjogeCA9PiB4LnJlcGxhY2VBbGwoKSxcblx0a2JPcHRzOiB7XG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA1LFxuXHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLCBDT05URVhUX1JFUExBQ0VfSU5QVVRfRk9DVVNFRCksXG5cdFx0cHJpbWFyeTogdW5kZWZpbmVkLFxuXHRcdG1hYzoge1xuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdH1cblx0fVxufSkpO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEZpbmRDb21tYW5kKHtcblx0aWQ6IEZJTkRfSURTLlNlbGVjdEFsbE1hdGNoZXNBY3Rpb24sXG5cdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GSU5EX1dJREdFVF9WSVNJQkxFLFxuXHRoYW5kbGVyOiB4ID0+IHguc2VsZWN0QWxsTWF0Y2hlcygpLFxuXHRrYk9wdHM6IHtcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDUsXG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5mb2N1cyxcblx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5FbnRlclxuXHR9XG59KSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxlQUFlO0FBQ2pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFlBQVksYUFBYTtBQUV6QixTQUFTLGNBQWMsZUFBZSxpQ0FBaUMsbUJBQW1CLHNCQUFzQix1QkFBdUIsNEJBQTRCLGlDQUFtRDtBQUN0TixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1DQUFtQztBQUc1QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0Qiw2QkFBNkIsK0JBQStCLDZCQUE2QixVQUFVLCtCQUErQiw4QkFBOEIsdUJBQXVCLDZCQUE2QixpQ0FBaUM7QUFDMVIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBNEU7QUFDckYsU0FBUyxZQUE2QixzQkFBc0I7QUFDNUQsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUN2QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUE2QiwwQkFBMEI7QUFDaEUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FB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
