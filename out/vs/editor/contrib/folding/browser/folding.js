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
import { createCancelablePromise, Delayer, RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { illegalArgument, onUnexpectedError } from "../../../../base/common/errors.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import * as types from "../../../../base/common/types.js";
import "./folding.css";
import { StableEditorScrollState } from "../../../browser/stableEditorScroll.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution, registerInstantiatedEditorAction } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { FoldingRangeKind } from "../../../common/languages.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { FoldingModel, getNextFoldLine, getParentFoldLine, getPreviousFoldLine, setCollapseStateAtLevel, setCollapseStateForMatchingLines, setCollapseStateForRest, setCollapseStateForType, setCollapseStateLevelsDown, setCollapseStateLevelsUp, setCollapseStateUp, toggleCollapseState } from "./foldingModel.js";
import { HiddenRangeModel } from "./hiddenRangeModel.js";
import { IndentRangeProvider } from "./indentRangeProvider.js";
import * as nls from "../../../../nls.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { FoldingDecorationProvider } from "./foldingDecorations.js";
import { FoldingRegions, FoldSource } from "./foldingRanges.js";
import { SyntaxRangeProvider } from "./syntaxRangeProvider.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { Emitter } from "../../../../base/common/event.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { URI } from "../../../../base/common/uri.js";
import { IModelService } from "../../../common/services/model.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
const CONTEXT_FOLDING_ENABLED = new RawContextKey("foldingEnabled", false);
let FoldingController = class extends Disposable {
  constructor(editor, contextKeyService, languageConfigurationService, notificationService, languageFeatureDebounceService, languageFeaturesService) {
    super();
    this.contextKeyService = contextKeyService;
    this.languageConfigurationService = languageConfigurationService;
    this.languageFeaturesService = languageFeaturesService;
    this.localToDispose = this._register(new DisposableStore());
    this.editor = editor;
    this._foldingLimitReporter = this._register(new RangesLimitReporter(editor));
    const options = this.editor.getOptions();
    this._isEnabled = options.get(EditorOption.folding);
    this._useFoldingProviders = options.get(EditorOption.foldingStrategy) !== "indentation";
    this._unfoldOnClickAfterEndOfLine = options.get(EditorOption.unfoldOnClickAfterEndOfLine);
    this._restoringViewState = false;
    this._currentModelHasFoldedImports = false;
    this._foldingImportsByDefault = options.get(EditorOption.foldingImportsByDefault);
    this.updateDebounceInfo = languageFeatureDebounceService.for(languageFeaturesService.foldingRangeProvider, "Folding", { min: 200 });
    this.foldingModel = null;
    this.hiddenRangeModel = null;
    this.rangeProvider = null;
    this.foldingRegionPromise = null;
    this.foldingModelPromise = null;
    this.updateScheduler = null;
    this.cursorChangedScheduler = null;
    this.mouseDownInfo = null;
    this.foldingDecorationProvider = new FoldingDecorationProvider(editor);
    this.foldingDecorationProvider.showFoldingControls = options.get(EditorOption.showFoldingControls);
    this.foldingDecorationProvider.showFoldingHighlights = options.get(EditorOption.foldingHighlight);
    this.foldingEnabled = CONTEXT_FOLDING_ENABLED.bindTo(this.contextKeyService);
    this.foldingEnabled.set(this._isEnabled);
    this._register(this.editor.onDidChangeModel(() => this.onModelChanged()));
    this._register(this.editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.folding)) {
        this._isEnabled = this.editor.getOptions().get(EditorOption.folding);
        this.foldingEnabled.set(this._isEnabled);
        this.onModelChanged();
      }
      if (e.hasChanged(EditorOption.foldingMaximumRegions)) {
        this.onModelChanged();
      }
      if (e.hasChanged(EditorOption.showFoldingControls) || e.hasChanged(EditorOption.foldingHighlight)) {
        const options2 = this.editor.getOptions();
        this.foldingDecorationProvider.showFoldingControls = options2.get(EditorOption.showFoldingControls);
        this.foldingDecorationProvider.showFoldingHighlights = options2.get(EditorOption.foldingHighlight);
        this.triggerFoldingModelChanged();
      }
      if (e.hasChanged(EditorOption.foldingStrategy)) {
        this._useFoldingProviders = this.editor.getOptions().get(EditorOption.foldingStrategy) !== "indentation";
        this.onFoldingStrategyChanged();
      }
      if (e.hasChanged(EditorOption.unfoldOnClickAfterEndOfLine)) {
        this._unfoldOnClickAfterEndOfLine = this.editor.getOptions().get(EditorOption.unfoldOnClickAfterEndOfLine);
      }
      if (e.hasChanged(EditorOption.foldingImportsByDefault)) {
        this._foldingImportsByDefault = this.editor.getOptions().get(EditorOption.foldingImportsByDefault);
      }
    }));
    this.onModelChanged();
  }
  static get(editor) {
    return editor.getContribution(FoldingController.ID);
  }
  static getFoldingRangeProviders(languageFeaturesService, model) {
    const foldingRangeProviders = languageFeaturesService.foldingRangeProvider.ordered(model);
    return FoldingController._foldingRangeSelector?.(foldingRangeProviders, model) ?? foldingRangeProviders;
  }
  static setFoldingRangeProviderSelector(foldingRangeSelector) {
    FoldingController._foldingRangeSelector = foldingRangeSelector;
    return { dispose: () => {
      FoldingController._foldingRangeSelector = void 0;
    } };
  }
  get limitReporter() {
    return this._foldingLimitReporter;
  }
  /**
   * Store view state.
   */
  saveViewState() {
    const model = this.editor.getModel();
    if (!model || !this._isEnabled || model.isTooLargeForTokenization()) {
      return {};
    }
    if (this.foldingModel) {
      const collapsedRegions = this.foldingModel.getMemento();
      const provider = this.rangeProvider ? this.rangeProvider.id : void 0;
      return { collapsedRegions, lineCount: model.getLineCount(), provider, foldedImports: this._currentModelHasFoldedImports };
    }
    return void 0;
  }
  /**
   * Restore view state.
   */
  restoreViewState(state) {
    const model = this.editor.getModel();
    if (!model || !this._isEnabled || model.isTooLargeForTokenization() || !this.hiddenRangeModel) {
      return;
    }
    if (!state) {
      return;
    }
    this._currentModelHasFoldedImports = !!state.foldedImports;
    if (state.collapsedRegions && state.collapsedRegions.length > 0 && this.foldingModel) {
      this._restoringViewState = true;
      try {
        this.foldingModel.applyMemento(state.collapsedRegions);
      } finally {
        this._restoringViewState = false;
      }
    }
  }
  onModelChanged() {
    this.localToDispose.clear();
    const model = this.editor.getModel();
    if (!this._isEnabled || !model || model.isTooLargeForTokenization()) {
      return;
    }
    this._currentModelHasFoldedImports = false;
    this.foldingModel = new FoldingModel(model, this.foldingDecorationProvider);
    this.localToDispose.add(this.foldingModel);
    this.hiddenRangeModel = new HiddenRangeModel(this.foldingModel);
    this.localToDispose.add(this.hiddenRangeModel);
    this.localToDispose.add(this.hiddenRangeModel.onDidChange((hr) => this.onHiddenRangesChanges(hr)));
    this.updateScheduler = new Delayer(this.updateDebounceInfo.get(model));
    this.localToDispose.add(this.updateScheduler);
    this.cursorChangedScheduler = new RunOnceScheduler(() => this.revealCursor(), 200);
    this.localToDispose.add(this.cursorChangedScheduler);
    this.localToDispose.add(this.languageFeaturesService.foldingRangeProvider.onDidChange(() => this.onFoldingStrategyChanged()));
    this.localToDispose.add(this.editor.onDidChangeModelLanguageConfiguration(() => this.onFoldingStrategyChanged()));
    this.localToDispose.add(this.editor.onDidChangeModelContent((e) => this.onDidChangeModelContent(e)));
    this.localToDispose.add(this.editor.onDidChangeCursorPosition(() => this.onCursorPositionChanged()));
    this.localToDispose.add(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
    this.localToDispose.add(this.editor.onMouseUp((e) => this.onEditorMouseUp(e)));
    this.localToDispose.add({
      dispose: () => {
        if (this.foldingRegionPromise) {
          this.foldingRegionPromise.cancel();
          this.foldingRegionPromise = null;
        }
        this.updateScheduler?.cancel();
        this.updateScheduler = null;
        this.foldingModel = null;
        this.foldingModelPromise = null;
        this.hiddenRangeModel = null;
        this.cursorChangedScheduler = null;
        this.rangeProvider?.dispose();
        this.rangeProvider = null;
      }
    });
    this.triggerFoldingModelChanged();
  }
  onFoldingStrategyChanged() {
    this.rangeProvider?.dispose();
    this.rangeProvider = null;
    this.triggerFoldingModelChanged();
  }
  getRangeProvider(editorModel) {
    if (this.rangeProvider) {
      return this.rangeProvider;
    }
    const indentRangeProvider = new IndentRangeProvider(editorModel, this.languageConfigurationService, this._foldingLimitReporter);
    this.rangeProvider = indentRangeProvider;
    if (this._useFoldingProviders && this.foldingModel) {
      const selectedProviders = FoldingController.getFoldingRangeProviders(this.languageFeaturesService, editorModel);
      if (selectedProviders.length > 0) {
        this.rangeProvider = new SyntaxRangeProvider(editorModel, selectedProviders, () => this.triggerFoldingModelChanged(), this._foldingLimitReporter, indentRangeProvider);
      }
    }
    return this.rangeProvider;
  }
  getFoldingModel() {
    return this.foldingModelPromise;
  }
  onDidChangeModelContent(e) {
    this.hiddenRangeModel?.notifyChangeModelContent(e);
    this.triggerFoldingModelChanged();
  }
  triggerFoldingModelChanged() {
    if (this.updateScheduler) {
      if (this.foldingRegionPromise) {
        this.foldingRegionPromise.cancel();
        this.foldingRegionPromise = null;
      }
      this.foldingModelPromise = this.updateScheduler.trigger(() => {
        const foldingModel = this.foldingModel;
        if (!foldingModel) {
          return null;
        }
        const sw = new StopWatch();
        const provider = this.getRangeProvider(foldingModel.textModel);
        const foldingRegionPromise = this.foldingRegionPromise = createCancelablePromise((token) => provider.compute(token));
        return foldingRegionPromise.then((foldingRanges) => {
          if (foldingRanges && foldingRegionPromise === this.foldingRegionPromise) {
            let scrollState;
            if (this._foldingImportsByDefault && !this._currentModelHasFoldedImports) {
              const hasChanges = foldingRanges.setCollapsedAllOfType(FoldingRangeKind.Imports.value, true);
              if (hasChanges) {
                scrollState = StableEditorScrollState.capture(this.editor);
                this._currentModelHasFoldedImports = hasChanges;
              }
            }
            const selections = this.editor.getSelections();
            foldingModel.update(foldingRanges, toSelectedLines(selections));
            scrollState?.restore(this.editor);
            const newValue = this.updateDebounceInfo.update(foldingModel.textModel, sw.elapsed());
            if (this.updateScheduler) {
              this.updateScheduler.defaultDelay = newValue;
            }
          }
          return foldingModel;
        });
      }).then(void 0, (err) => {
        onUnexpectedError(err);
        return null;
      });
    }
  }
  onHiddenRangesChanges(hiddenRanges) {
    if (this.hiddenRangeModel && hiddenRanges.length && !this._restoringViewState) {
      const selections = this.editor.getSelections();
      if (selections) {
        if (this.hiddenRangeModel.adjustSelections(selections)) {
          this.editor.setSelections(selections);
        }
      }
    }
    this.editor.setHiddenAreas(hiddenRanges, this);
  }
  onCursorPositionChanged() {
    if (this.hiddenRangeModel && this.hiddenRangeModel.hasRanges()) {
      this.cursorChangedScheduler.schedule();
    }
  }
  revealCursor() {
    const foldingModel = this.getFoldingModel();
    if (!foldingModel) {
      return;
    }
    foldingModel.then((foldingModel2) => {
      if (foldingModel2) {
        const selections = this.editor.getSelections();
        if (selections && selections.length > 0) {
          const toToggle = [];
          for (const selection of selections) {
            const lineNumber = selection.selectionStartLineNumber;
            if (this.hiddenRangeModel && this.hiddenRangeModel.isHidden(lineNumber)) {
              toToggle.push(...foldingModel2.getAllRegionsAtLine(lineNumber, (r) => r.isCollapsed && lineNumber > r.startLineNumber));
            }
          }
          if (toToggle.length) {
            foldingModel2.toggleCollapseState(toToggle);
            this.reveal(selections[0].getPosition());
          }
        }
      }
    }).then(void 0, onUnexpectedError);
  }
  onEditorMouseDown(e) {
    this.mouseDownInfo = null;
    if (!this.hiddenRangeModel || !e.target || !e.target.range) {
      return;
    }
    if (!e.event.leftButton && !e.event.middleButton) {
      return;
    }
    const range = e.target.range;
    let iconClicked = false;
    switch (e.target.type) {
      case MouseTargetType.GUTTER_LINE_DECORATIONS: {
        const data = e.target.detail;
        const offsetLeftInGutter = e.target.element.offsetLeft;
        const gutterOffsetX = data.offsetX - offsetLeftInGutter;
        if (gutterOffsetX < 4) {
          return;
        }
        iconClicked = true;
        break;
      }
      case MouseTargetType.CONTENT_EMPTY: {
        if (this._unfoldOnClickAfterEndOfLine && this.hiddenRangeModel.hasRanges()) {
          const data = e.target.detail;
          if (!data.isAfterLines) {
            break;
          }
        }
        return;
      }
      case MouseTargetType.CONTENT_TEXT: {
        if (this.hiddenRangeModel.hasRanges()) {
          const model = this.editor.getModel();
          if (model && range.startColumn === model.getLineMaxColumn(range.startLineNumber)) {
            break;
          }
        }
        return;
      }
      default:
        return;
    }
    this.mouseDownInfo = { lineNumber: range.startLineNumber, iconClicked };
  }
  onEditorMouseUp(e) {
    const foldingModel = this.foldingModel;
    if (!foldingModel || !this.mouseDownInfo || !e.target) {
      return;
    }
    const lineNumber = this.mouseDownInfo.lineNumber;
    const iconClicked = this.mouseDownInfo.iconClicked;
    const range = e.target.range;
    if (!range || range.startLineNumber !== lineNumber) {
      return;
    }
    if (iconClicked) {
      if (e.target.type !== MouseTargetType.GUTTER_LINE_DECORATIONS) {
        return;
      }
    } else {
      const model = this.editor.getModel();
      if (!model || range.startColumn !== model.getLineMaxColumn(lineNumber)) {
        return;
      }
    }
    const region = foldingModel.getRegionAtLine(lineNumber);
    if (region && region.startLineNumber === lineNumber) {
      const isCollapsed = region.isCollapsed;
      if (iconClicked || isCollapsed) {
        const surrounding = e.event.altKey;
        let toToggle = [];
        if (surrounding) {
          const filter = (otherRegion) => !otherRegion.containedBy(region) && !region.containedBy(otherRegion);
          const toMaybeToggle = foldingModel.getRegionsInside(null, filter);
          for (const r of toMaybeToggle) {
            if (r.isCollapsed) {
              toToggle.push(r);
            }
          }
          if (toToggle.length === 0) {
            toToggle = toMaybeToggle;
          }
        } else {
          const recursive = e.event.middleButton || e.event.shiftKey;
          if (recursive) {
            for (const r of foldingModel.getRegionsInside(region)) {
              if (r.isCollapsed === isCollapsed) {
                toToggle.push(r);
              }
            }
          }
          if (isCollapsed || !recursive || toToggle.length === 0) {
            toToggle.push(region);
          }
        }
        foldingModel.toggleCollapseState(toToggle);
        this.reveal({ lineNumber, column: 1 });
      }
    }
  }
  reveal(position) {
    this.editor.revealPositionInCenterIfOutsideViewport(position, ScrollType.Smooth);
  }
};
FoldingController.ID = "editor.contrib.folding";
FoldingController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ILanguageConfigurationService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ILanguageFeatureDebounceService),
  __decorateParam(5, ILanguageFeaturesService)
], FoldingController);
class RangesLimitReporter extends Disposable {
  constructor(editor) {
    super();
    this.editor = editor;
    this._onDidChange = this._register(new Emitter());
    this._computed = 0;
    this._limited = false;
  }
  get limit() {
    return this.editor.getOptions().get(EditorOption.foldingMaximumRegions);
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get computed() {
    return this._computed;
  }
  get limited() {
    return this._limited;
  }
  update(computed, limited) {
    if (computed !== this._computed || limited !== this._limited) {
      this._computed = computed;
      this._limited = limited;
      this._onDidChange.fire();
    }
  }
}
class FoldingAction extends EditorAction {
  runEditorCommand(accessor, editor, args) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const foldingController = FoldingController.get(editor);
    if (!foldingController) {
      return;
    }
    const foldingModelPromise = foldingController.getFoldingModel();
    if (foldingModelPromise) {
      this.reportTelemetry(accessor, editor);
      return foldingModelPromise.then((foldingModel) => {
        if (foldingModel) {
          this.invoke(foldingController, foldingModel, editor, args, languageConfigurationService);
          const selection = editor.getSelection();
          if (selection) {
            foldingController.reveal(selection.getStartPosition());
          }
        }
      });
    }
  }
  getSelectedLines(editor) {
    const selections = editor.getSelections();
    return selections ? selections.map((s) => s.startLineNumber) : [];
  }
  getLineNumbers(args, editor) {
    if (args && args.selectionLines) {
      return args.selectionLines.map((l) => l + 1);
    }
    return this.getSelectedLines(editor);
  }
  run(_accessor, _editor) {
  }
}
function toSelectedLines(selections) {
  if (!selections || selections.length === 0) {
    return {
      startsInside: () => false
    };
  }
  return {
    startsInside(startLine, endLine) {
      for (const s of selections) {
        const line = s.startLineNumber;
        if (line >= startLine && line <= endLine) {
          return true;
        }
      }
      return false;
    }
  };
}
function foldingArgumentsConstraint(args) {
  if (!types.isUndefined(args)) {
    if (!types.isObject(args)) {
      return false;
    }
    const foldingArgs = args;
    if (!types.isUndefined(foldingArgs.levels) && !types.isNumber(foldingArgs.levels)) {
      return false;
    }
    if (!types.isUndefined(foldingArgs.direction) && !types.isString(foldingArgs.direction)) {
      return false;
    }
    if (!types.isUndefined(foldingArgs.selectionLines) && (!Array.isArray(foldingArgs.selectionLines) || !foldingArgs.selectionLines.every(types.isNumber))) {
      return false;
    }
  }
  return true;
}
class UnfoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfold",
      label: nls.localize2("unfoldAction.label", "Unfold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketRight
        },
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: "Unfold the content in the editor",
        args: [
          {
            name: "Unfold editor argument",
            description: `Property-value pairs that can be passed through this argument:
						* 'levels': Number of levels to unfold. If not set, defaults to 1.
						* 'direction': If 'up', unfold given number of levels up otherwise unfolds down.
						* 'selectionLines': Array of the start lines (0-based) of the editor selections to apply the unfold action to. If not set, the active selection(s) will be used.
						`,
            constraint: foldingArgumentsConstraint,
            schema: {
              "type": "object",
              "properties": {
                "levels": {
                  "type": "number",
                  "default": 1
                },
                "direction": {
                  "type": "string",
                  "enum": ["up", "down"],
                  "default": "down"
                },
                "selectionLines": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  }
                }
              }
            }
          }
        ]
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args) {
    const levels = args && args.levels || 1;
    const lineNumbers = this.getLineNumbers(args, editor);
    if (args && args.direction === "up") {
      setCollapseStateLevelsUp(foldingModel, false, levels, lineNumbers);
    } else {
      setCollapseStateLevelsDown(foldingModel, false, levels, lineNumbers);
    }
  }
}
class UnFoldRecursivelyAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfoldRecursively",
      label: nls.localize2("unFoldRecursivelyAction.label", "Unfold Recursively"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.BracketRight),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, _args) {
    setCollapseStateLevelsDown(foldingModel, false, Number.MAX_VALUE, this.getSelectedLines(editor));
  }
}
class FoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.fold",
      label: nls.localize2("foldAction.label", "Fold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketLeft
        },
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: "Fold the content in the editor",
        args: [
          {
            name: "Fold editor argument",
            description: `Property-value pairs that can be passed through this argument:
							* 'levels': Number of levels to fold.
							* 'direction': If 'up', folds given number of levels up otherwise folds down.
							* 'selectionLines': Array of the start lines (0-based) of the editor selections to apply the fold action to. If not set, the active selection(s) will be used.
							If no levels or direction is set, folds the region at the locations or if already collapsed, the first uncollapsed parent instead.
						`,
            constraint: foldingArgumentsConstraint,
            schema: {
              "type": "object",
              "properties": {
                "levels": {
                  "type": "number"
                },
                "direction": {
                  "type": "string",
                  "enum": ["up", "down"]
                },
                "selectionLines": {
                  "type": "array",
                  "items": {
                    "type": "number"
                  }
                }
              }
            }
          }
        ]
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args) {
    const lineNumbers = this.getLineNumbers(args, editor);
    const levels = args && args.levels;
    const direction = args && args.direction;
    if (typeof levels !== "number" && typeof direction !== "string") {
      setCollapseStateUp(foldingModel, true, lineNumbers);
    } else {
      if (direction === "up") {
        setCollapseStateLevelsUp(foldingModel, true, levels || 1, lineNumbers);
      } else {
        setCollapseStateLevelsDown(foldingModel, true, levels || 1, lineNumbers);
      }
    }
  }
}
class ToggleFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.toggleFold",
      label: nls.localize2("toggleFoldAction.label", "Toggle Fold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyL),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    toggleCollapseState(foldingModel, 1, selectedLines);
  }
}
class FoldRecursivelyAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldRecursively",
      label: nls.localize2("foldRecursivelyAction.label", "Fold Recursively"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.BracketLeft),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    setCollapseStateLevelsDown(foldingModel, true, Number.MAX_VALUE, selectedLines);
  }
}
class ToggleFoldRecursivelyAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.toggleFoldRecursively",
      label: nls.localize2("toggleFoldRecursivelyAction.label", "Toggle Fold Recursively"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    toggleCollapseState(foldingModel, Number.MAX_VALUE, selectedLines);
  }
}
class FoldAllBlockCommentsAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldAllBlockComments",
      label: nls.localize2("foldAllBlockComments.label", "Fold All Block Comments"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Slash),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
    if (foldingModel.regions.hasTypes()) {
      setCollapseStateForType(foldingModel, FoldingRangeKind.Comment.value, true);
    } else {
      const editorModel = editor.getModel();
      if (!editorModel) {
        return;
      }
      const comments = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).comments;
      if (comments && comments.blockCommentStartToken) {
        const regExp = new RegExp("^\\s*" + escapeRegExpCharacters(comments.blockCommentStartToken));
        setCollapseStateForMatchingLines(foldingModel, regExp, true);
      }
    }
  }
}
class FoldAllRegionsAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldAllMarkerRegions",
      label: nls.localize2("foldAllMarkerRegions.label", "Fold All Regions"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit8),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
    if (foldingModel.regions.hasTypes()) {
      setCollapseStateForType(foldingModel, FoldingRangeKind.Region.value, true);
    } else {
      const editorModel = editor.getModel();
      if (!editorModel) {
        return;
      }
      const foldingRules = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).foldingRules;
      if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
        const regExp = new RegExp(foldingRules.markers.start);
        setCollapseStateForMatchingLines(foldingModel, regExp, true);
      }
    }
  }
}
class UnfoldAllRegionsAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfoldAllMarkerRegions",
      label: nls.localize2("unfoldAllMarkerRegions.label", "Unfold All Regions"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit9),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor, args, languageConfigurationService) {
    if (foldingModel.regions.hasTypes()) {
      setCollapseStateForType(foldingModel, FoldingRangeKind.Region.value, false);
    } else {
      const editorModel = editor.getModel();
      if (!editorModel) {
        return;
      }
      const foldingRules = languageConfigurationService.getLanguageConfiguration(editorModel.getLanguageId()).foldingRules;
      if (foldingRules && foldingRules.markers && foldingRules.markers.start) {
        const regExp = new RegExp(foldingRules.markers.start);
        setCollapseStateForMatchingLines(foldingModel, regExp, false);
      }
    }
  }
}
class FoldAllExceptAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldAllExcept",
      label: nls.localize2("foldAllExcept.label", "Fold All Except Selected"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Minus),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    setCollapseStateForRest(foldingModel, true, selectedLines);
  }
}
class UnfoldAllExceptAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfoldAllExcept",
      label: nls.localize2("unfoldAllExcept.label", "Unfold All Except Selected"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Equal),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    setCollapseStateForRest(foldingModel, false, selectedLines);
  }
}
class FoldAllAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.foldAll",
      label: nls.localize2("foldAllAction.label", "Fold All"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit0),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, _editor) {
    setCollapseStateLevelsDown(foldingModel, true);
  }
}
class UnfoldAllAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.unfoldAll",
      label: nls.localize2("unfoldAllAction.label", "Unfold All"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyJ),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, _editor) {
    setCollapseStateLevelsDown(foldingModel, false);
  }
}
const _FoldLevelAction = class _FoldLevelAction extends FoldingAction {
  getFoldingLevel() {
    return parseInt(this.id.substr(_FoldLevelAction.ID_PREFIX.length));
  }
  invoke(_foldingController, foldingModel, editor) {
    setCollapseStateAtLevel(foldingModel, this.getFoldingLevel(), true, this.getSelectedLines(editor));
  }
};
_FoldLevelAction.ID_PREFIX = "editor.foldLevel";
_FoldLevelAction.ID = (level) => _FoldLevelAction.ID_PREFIX + level;
let FoldLevelAction = _FoldLevelAction;
class GotoParentFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.gotoParentFold",
      label: nls.localize2("gotoParentFold.label", "Go to Parent Fold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    if (selectedLines.length > 0) {
      const startLineNumber = getParentFoldLine(selectedLines[0], foldingModel);
      if (startLineNumber !== null) {
        editor.setSelection({
          startLineNumber,
          startColumn: 1,
          endLineNumber: startLineNumber,
          endColumn: 1
        });
      }
    }
  }
}
class GotoPreviousFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.gotoPreviousFold",
      label: nls.localize2("gotoPreviousFold.label", "Go to Previous Folding Range"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    if (selectedLines.length > 0) {
      const startLineNumber = getPreviousFoldLine(selectedLines[0], foldingModel);
      if (startLineNumber !== null) {
        editor.setSelection({
          startLineNumber,
          startColumn: 1,
          endLineNumber: startLineNumber,
          endColumn: 1
        });
      }
    }
  }
}
class GotoNextFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.gotoNextFold",
      label: nls.localize2("gotoNextFold.label", "Go to Next Folding Range"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const selectedLines = this.getSelectedLines(editor);
    if (selectedLines.length > 0) {
      const startLineNumber = getNextFoldLine(selectedLines[0], foldingModel);
      if (startLineNumber !== null) {
        editor.setSelection({
          startLineNumber,
          startColumn: 1,
          endLineNumber: startLineNumber,
          endColumn: 1
        });
      }
    }
  }
}
class FoldRangeFromSelectionAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.createFoldingRangeFromSelection",
      label: nls.localize2("createManualFoldRange.label", "Create Folding Range from Selection"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Comma),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(_foldingController, foldingModel, editor) {
    const collapseRanges = [];
    const selections = editor.getSelections();
    if (selections) {
      for (const selection of selections) {
        let endLineNumber = selection.endLineNumber;
        if (selection.endColumn === 1) {
          --endLineNumber;
        }
        if (endLineNumber > selection.startLineNumber) {
          collapseRanges.push({
            startLineNumber: selection.startLineNumber,
            endLineNumber,
            type: void 0,
            isCollapsed: true,
            source: FoldSource.userDefined
          });
          editor.setSelection({
            startLineNumber: selection.startLineNumber,
            startColumn: 1,
            endLineNumber: selection.startLineNumber,
            endColumn: 1
          });
        }
      }
      if (collapseRanges.length > 0) {
        collapseRanges.sort((a, b) => {
          return a.startLineNumber - b.startLineNumber;
        });
        const newRanges = FoldingRegions.sanitizeAndMerge(foldingModel.regions, collapseRanges, editor.getModel()?.getLineCount());
        foldingModel.updatePost(FoldingRegions.fromFoldRanges(newRanges));
      }
    }
  }
}
class RemoveFoldRangeFromSelectionAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.removeManualFoldingRanges",
      label: nls.localize2("removeManualFoldingRanges.label", "Remove Manual Folding Ranges"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Period),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  invoke(foldingController, foldingModel, editor) {
    const selections = editor.getSelections();
    if (selections) {
      foldingModel.removeManualRanges(selections);
      foldingController.triggerFoldingModelChanged();
    }
  }
}
class ToggleImportFoldAction extends FoldingAction {
  constructor() {
    super({
      id: "editor.toggleImportFold",
      label: nls.localize2("toggleImportFold.label", "Toggle Import Fold"),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  async invoke(foldingController, foldingModel) {
    const regionsToToggle = [];
    const regions = foldingModel.regions;
    for (let i = regions.length - 1; i >= 0; i--) {
      if (regions.getType(i) === FoldingRangeKind.Imports.value) {
        regionsToToggle.push(regions.toRegion(i));
      }
    }
    foldingModel.toggleCollapseState(regionsToToggle);
    foldingController.triggerFoldingModelChanged();
  }
}
registerEditorContribution(FoldingController.ID, FoldingController, EditorContributionInstantiation.Eager);
registerEditorAction(UnfoldAction);
registerEditorAction(UnFoldRecursivelyAction);
registerEditorAction(FoldAction);
registerEditorAction(FoldRecursivelyAction);
registerEditorAction(ToggleFoldRecursivelyAction);
registerEditorAction(FoldAllAction);
registerEditorAction(UnfoldAllAction);
registerEditorAction(FoldAllBlockCommentsAction);
registerEditorAction(FoldAllRegionsAction);
registerEditorAction(UnfoldAllRegionsAction);
registerEditorAction(FoldAllExceptAction);
registerEditorAction(UnfoldAllExceptAction);
registerEditorAction(ToggleFoldAction);
registerEditorAction(GotoParentFoldAction);
registerEditorAction(GotoPreviousFoldAction);
registerEditorAction(GotoNextFoldAction);
registerEditorAction(FoldRangeFromSelectionAction);
registerEditorAction(RemoveFoldRangeFromSelectionAction);
registerEditorAction(ToggleImportFoldAction);
for (let i = 1; i <= 7; i++) {
  registerInstantiatedEditorAction(
    new FoldLevelAction({
      id: FoldLevelAction.ID(i),
      label: nls.localize2("foldLevelAction.label", "Fold Level {0}", i),
      precondition: CONTEXT_FOLDING_ENABLED,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.Digit0 + i),
        weight: KeybindingWeight.EditorContrib
      }
    })
  );
}
CommandsRegistry.registerCommand("_executeFoldingRangeProvider", async function(accessor, ...args) {
  const [resource] = args;
  if (!(resource instanceof URI)) {
    throw illegalArgument();
  }
  const languageFeaturesService = accessor.get(ILanguageFeaturesService);
  const model = accessor.get(IModelService).getModel(resource);
  if (!model) {
    throw illegalArgument();
  }
  const configurationService = accessor.get(IConfigurationService);
  if (!configurationService.getValue("editor.folding", { resource })) {
    return [];
  }
  const languageConfigurationService = accessor.get(ILanguageConfigurationService);
  const strategy = configurationService.getValue("editor.foldingStrategy", { resource });
  const foldingLimitReporter = {
    get limit() {
      return configurationService.getValue("editor.foldingMaximumRegions", { resource });
    },
    update: (computed, limited) => {
    }
  };
  const indentRangeProvider = new IndentRangeProvider(model, languageConfigurationService, foldingLimitReporter);
  let rangeProvider = indentRangeProvider;
  if (strategy !== "indentation") {
    const providers = FoldingController.getFoldingRangeProviders(languageFeaturesService, model);
    if (providers.length) {
      rangeProvider = new SyntaxRangeProvider(model, providers, () => {
      }, foldingLimitReporter, indentRangeProvider);
    }
  }
  const ranges = await rangeProvider.compute(CancellationToken.None);
  const result = [];
  try {
    if (ranges) {
      for (let i = 0; i < ranges.length; i++) {
        const type = ranges.getType(i);
        result.push({ start: ranges.getStartLineNumber(i), end: ranges.getEndLineNumber(i), kind: type ? FoldingRangeKind.fromValue(type) : void 0 });
      }
    }
    return result;
  } finally {
    rangeProvider.dispose();
  }
});
export {
  FoldingController,
  RangesLimitReporter,
  toSelectedLines
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2ZvbGRpbmcvYnJvd3Nlci9mb2xkaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWxheWVyLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaWxsZWdhbEFyZ3VtZW50LCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBLZXlDaG9yZCwgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgJy4vZm9sZGluZy5jc3MnO1xuaW1wb3J0IHsgU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3N0YWJsZUVkaXRvclNjcm9sbC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSUVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJJbnN0YW50aWF0ZWRFZGl0b3JBY3Rpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IEZvbGRpbmdSYW5nZSwgRm9sZGluZ1JhbmdlS2luZCwgRm9sZGluZ1JhbmdlUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb2xsYXBzZU1lbWVudG8sIEZvbGRpbmdNb2RlbCwgZ2V0TmV4dEZvbGRMaW5lLCBnZXRQYXJlbnRGb2xkTGluZSwgZ2V0UHJldmlvdXNGb2xkTGluZSwgc2V0Q29sbGFwc2VTdGF0ZUF0TGV2ZWwsIHNldENvbGxhcHNlU3RhdGVGb3JNYXRjaGluZ0xpbmVzLCBzZXRDb2xsYXBzZVN0YXRlRm9yUmVzdCwgc2V0Q29sbGFwc2VTdGF0ZUZvclR5cGUsIHNldENvbGxhcHNlU3RhdGVMZXZlbHNEb3duLCBzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzVXAsIHNldENvbGxhcHNlU3RhdGVVcCwgdG9nZ2xlQ29sbGFwc2VTdGF0ZSB9IGZyb20gJy4vZm9sZGluZ01vZGVsLmpzJztcbmltcG9ydCB7IEhpZGRlblJhbmdlTW9kZWwgfSBmcm9tICcuL2hpZGRlblJhbmdlTW9kZWwuanMnO1xuaW1wb3J0IHsgSW5kZW50UmFuZ2VQcm92aWRlciB9IGZyb20gJy4vaW5kZW50UmFuZ2VQcm92aWRlci5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEZvbGRpbmdEZWNvcmF0aW9uUHJvdmlkZXIgfSBmcm9tICcuL2ZvbGRpbmdEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nUmVnaW9uLCBGb2xkaW5nUmVnaW9ucywgRm9sZFJhbmdlLCBGb2xkU291cmNlIH0gZnJvbSAnLi9mb2xkaW5nUmFuZ2VzLmpzJztcbmltcG9ydCB7IFN5bnRheFJhbmdlUHJvdmlkZXIgfSBmcm9tICcuL3N5bnRheFJhbmdlUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24sIElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcblxuY29uc3QgQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignZm9sZGluZ0VuYWJsZWQnLCBmYWxzZSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmFuZ2VQcm92aWRlciB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdGNvbXB1dGUoY2FuY2VsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEZvbGRpbmdSZWdpb25zIHwgbnVsbD47XG5cdGRpc3Bvc2UoKTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIEZvbGRpbmdTdGF0ZU1lbWVudG8ge1xuXHRjb2xsYXBzZWRSZWdpb25zPzogQ29sbGFwc2VNZW1lbnRvO1xuXHRsaW5lQ291bnQ/OiBudW1iZXI7XG5cdHByb3ZpZGVyPzogc3RyaW5nO1xuXHRmb2xkZWRJbXBvcnRzPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBGb2xkaW5nTGltaXRSZXBvcnRlciB7XG5cdHJlYWRvbmx5IGxpbWl0OiBudW1iZXI7XG5cdHVwZGF0ZShjb21wdXRlZDogbnVtYmVyLCBsaW1pdGVkOiBudW1iZXIgfCBmYWxzZSk6IHZvaWQ7XG59XG5cbmV4cG9ydCB0eXBlIEZvbGRpbmdSYW5nZVByb3ZpZGVyU2VsZWN0b3IgPSAocHJvdmlkZXI6IEZvbGRpbmdSYW5nZVByb3ZpZGVyW10sIGRvY3VtZW50OiBJVGV4dE1vZGVsKSA9PiBGb2xkaW5nUmFuZ2VQcm92aWRlcltdIHwgdW5kZWZpbmVkO1xuXG5leHBvcnQgY2xhc3MgRm9sZGluZ0NvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5mb2xkaW5nJztcblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogRm9sZGluZ0NvbnRyb2xsZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxGb2xkaW5nQ29udHJvbGxlcj4oRm9sZGluZ0NvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZvbGRpbmdSYW5nZVNlbGVjdG9yOiBGb2xkaW5nUmFuZ2VQcm92aWRlclNlbGVjdG9yIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0Rm9sZGluZ1JhbmdlUHJvdmlkZXJzKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG1vZGVsOiBJVGV4dE1vZGVsKTogRm9sZGluZ1JhbmdlUHJvdmlkZXJbXSB7XG5cdFx0Y29uc3QgZm9sZGluZ1JhbmdlUHJvdmlkZXJzID0gbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZm9sZGluZ1JhbmdlUHJvdmlkZXIub3JkZXJlZChtb2RlbCk7XG5cdFx0cmV0dXJuIChGb2xkaW5nQ29udHJvbGxlci5fZm9sZGluZ1JhbmdlU2VsZWN0b3I/Lihmb2xkaW5nUmFuZ2VQcm92aWRlcnMsIG1vZGVsKSkgPz8gZm9sZGluZ1JhbmdlUHJvdmlkZXJzO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzZXRGb2xkaW5nUmFuZ2VQcm92aWRlclNlbGVjdG9yKGZvbGRpbmdSYW5nZVNlbGVjdG9yOiBGb2xkaW5nUmFuZ2VQcm92aWRlclNlbGVjdG9yKTogSURpc3Bvc2FibGUge1xuXHRcdEZvbGRpbmdDb250cm9sbGVyLl9mb2xkaW5nUmFuZ2VTZWxlY3RvciA9IGZvbGRpbmdSYW5nZVNlbGVjdG9yO1xuXHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgRm9sZGluZ0NvbnRyb2xsZXIuX2ZvbGRpbmdSYW5nZVNlbGVjdG9yID0gdW5kZWZpbmVkOyB9IH07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgX2lzRW5hYmxlZDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdXNlRm9sZGluZ1Byb3ZpZGVyczogYm9vbGVhbjtcblx0cHJpdmF0ZSBfdW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lOiBib29sZWFuO1xuXHRwcml2YXRlIF9yZXN0b3JpbmdWaWV3U3RhdGU6IGJvb2xlYW47XG5cdHByaXZhdGUgX2ZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0OiBib29sZWFuO1xuXHRwcml2YXRlIF9jdXJyZW50TW9kZWxIYXNGb2xkZWRJbXBvcnRzOiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZm9sZGluZ0RlY29yYXRpb25Qcm92aWRlcjogRm9sZGluZ0RlY29yYXRpb25Qcm92aWRlcjtcblxuXHRwcml2YXRlIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsIHwgbnVsbDtcblx0cHJpdmF0ZSBoaWRkZW5SYW5nZU1vZGVsOiBIaWRkZW5SYW5nZU1vZGVsIHwgbnVsbDtcblxuXHRwcml2YXRlIHJhbmdlUHJvdmlkZXI6IFJhbmdlUHJvdmlkZXIgfCBudWxsO1xuXHRwcml2YXRlIGZvbGRpbmdSZWdpb25Qcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxGb2xkaW5nUmVnaW9ucyB8IG51bGw+IHwgbnVsbDtcblxuXHRwcml2YXRlIGZvbGRpbmdNb2RlbFByb21pc2U6IFByb21pc2U8Rm9sZGluZ01vZGVsIHwgbnVsbD4gfCBudWxsO1xuXHRwcml2YXRlIHVwZGF0ZVNjaGVkdWxlcjogRGVsYXllcjxGb2xkaW5nTW9kZWwgfCBudWxsPiB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlRGVib3VuY2VJbmZvOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb247XG5cblx0cHJpdmF0ZSBmb2xkaW5nRW5hYmxlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY3Vyc29yQ2hhbmdlZFNjaGVkdWxlcjogUnVuT25jZVNjaGVkdWxlciB8IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbFRvRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgbW91c2VEb3duSW5mbzogeyBsaW5lTnVtYmVyOiBudW1iZXI7IGljb25DbGlja2VkOiBib29sZWFuIH0gfCBudWxsO1xuXG5cdHB1YmxpYyByZWFkb25seSBfZm9sZGluZ0xpbWl0UmVwb3J0ZXI6IFJhbmdlc0xpbWl0UmVwb3J0ZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWRpdG9yID0gZWRpdG9yO1xuXG5cdFx0dGhpcy5fZm9sZGluZ0xpbWl0UmVwb3J0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmFuZ2VzTGltaXRSZXBvcnRlcihlZGl0b3IpKTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmVkaXRvci5nZXRPcHRpb25zKCk7XG5cdFx0dGhpcy5faXNFbmFibGVkID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbGRpbmcpO1xuXHRcdHRoaXMuX3VzZUZvbGRpbmdQcm92aWRlcnMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9sZGluZ1N0cmF0ZWd5KSAhPT0gJ2luZGVudGF0aW9uJztcblx0XHR0aGlzLl91bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24udW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lKTtcblx0XHR0aGlzLl9yZXN0b3JpbmdWaWV3U3RhdGUgPSBmYWxzZTtcblx0XHR0aGlzLl9jdXJyZW50TW9kZWxIYXNGb2xkZWRJbXBvcnRzID0gZmFsc2U7XG5cdFx0dGhpcy5fZm9sZGluZ0ltcG9ydHNCeURlZmF1bHQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9sZGluZ0ltcG9ydHNCeURlZmF1bHQpO1xuXHRcdHRoaXMudXBkYXRlRGVib3VuY2VJbmZvID0gbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLmZvcihsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5mb2xkaW5nUmFuZ2VQcm92aWRlciwgJ0ZvbGRpbmcnLCB7IG1pbjogMjAwIH0pO1xuXG5cdFx0dGhpcy5mb2xkaW5nTW9kZWwgPSBudWxsO1xuXHRcdHRoaXMuaGlkZGVuUmFuZ2VNb2RlbCA9IG51bGw7XG5cdFx0dGhpcy5yYW5nZVByb3ZpZGVyID0gbnVsbDtcblx0XHR0aGlzLmZvbGRpbmdSZWdpb25Qcm9taXNlID0gbnVsbDtcblx0XHR0aGlzLmZvbGRpbmdNb2RlbFByb21pc2UgPSBudWxsO1xuXHRcdHRoaXMudXBkYXRlU2NoZWR1bGVyID0gbnVsbDtcblx0XHR0aGlzLmN1cnNvckNoYW5nZWRTY2hlZHVsZXIgPSBudWxsO1xuXHRcdHRoaXMubW91c2VEb3duSW5mbyA9IG51bGw7XG5cblx0XHR0aGlzLmZvbGRpbmdEZWNvcmF0aW9uUHJvdmlkZXIgPSBuZXcgRm9sZGluZ0RlY29yYXRpb25Qcm92aWRlcihlZGl0b3IpO1xuXHRcdHRoaXMuZm9sZGluZ0RlY29yYXRpb25Qcm92aWRlci5zaG93Rm9sZGluZ0NvbnRyb2xzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMpO1xuXHRcdHRoaXMuZm9sZGluZ0RlY29yYXRpb25Qcm92aWRlci5zaG93Rm9sZGluZ0hpZ2hsaWdodHMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9sZGluZ0hpZ2hsaWdodCk7XG5cdFx0dGhpcy5mb2xkaW5nRW5hYmxlZCA9IENPTlRFWFRfRk9MRElOR19FTkFCTEVELmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmZvbGRpbmdFbmFibGVkLnNldCh0aGlzLl9pc0VuYWJsZWQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB0aGlzLm9uTW9kZWxDaGFuZ2VkKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZTogQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9sZGluZykpIHtcblx0XHRcdFx0dGhpcy5faXNFbmFibGVkID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9ucygpLmdldChFZGl0b3JPcHRpb24uZm9sZGluZyk7XG5cdFx0XHRcdHRoaXMuZm9sZGluZ0VuYWJsZWQuc2V0KHRoaXMuX2lzRW5hYmxlZCk7XG5cdFx0XHRcdHRoaXMub25Nb2RlbENoYW5nZWQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbGRpbmdNYXhpbXVtUmVnaW9ucykpIHtcblx0XHRcdFx0dGhpcy5vbk1vZGVsQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uc2hvd0ZvbGRpbmdDb250cm9scykgfHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb2xkaW5nSGlnaGxpZ2h0KSkge1xuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9ucygpO1xuXHRcdFx0XHR0aGlzLmZvbGRpbmdEZWNvcmF0aW9uUHJvdmlkZXIuc2hvd0ZvbGRpbmdDb250cm9scyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zaG93Rm9sZGluZ0NvbnRyb2xzKTtcblx0XHRcdFx0dGhpcy5mb2xkaW5nRGVjb3JhdGlvblByb3ZpZGVyLnNob3dGb2xkaW5nSGlnaGxpZ2h0cyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nSGlnaGxpZ2h0KTtcblx0XHRcdFx0dGhpcy50cmlnZ2VyRm9sZGluZ01vZGVsQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9sZGluZ1N0cmF0ZWd5KSkge1xuXHRcdFx0XHR0aGlzLl91c2VGb2xkaW5nUHJvdmlkZXJzID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9ucygpLmdldChFZGl0b3JPcHRpb24uZm9sZGluZ1N0cmF0ZWd5KSAhPT0gJ2luZGVudGF0aW9uJztcblx0XHRcdFx0dGhpcy5vbkZvbGRpbmdTdHJhdGVneUNoYW5nZWQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnVuZm9sZE9uQ2xpY2tBZnRlckVuZE9mTGluZSkpIHtcblx0XHRcdFx0dGhpcy5fdW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9ucygpLmdldChFZGl0b3JPcHRpb24udW5mb2xkT25DbGlja0FmdGVyRW5kT2ZMaW5lKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0KSkge1xuXHRcdFx0XHR0aGlzLl9mb2xkaW5nSW1wb3J0c0J5RGVmYXVsdCA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbnMoKS5nZXQoRWRpdG9yT3B0aW9uLmZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5vbk1vZGVsQ2hhbmdlZCgpO1xuXHR9XG5cblx0cHVibGljIGdldCBsaW1pdFJlcG9ydGVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9mb2xkaW5nTGltaXRSZXBvcnRlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdG9yZSB2aWV3IHN0YXRlLlxuXHQgKi9cblx0cHVibGljIHNhdmVWaWV3U3RhdGUoKTogRm9sZGluZ1N0YXRlTWVtZW50byB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwgfHwgIXRoaXMuX2lzRW5hYmxlZCB8fCBtb2RlbC5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZm9sZGluZ01vZGVsKSB7IC8vIGRpc3Bvc2VkID9cblx0XHRcdGNvbnN0IGNvbGxhcHNlZFJlZ2lvbnMgPSB0aGlzLmZvbGRpbmdNb2RlbC5nZXRNZW1lbnRvKCk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMucmFuZ2VQcm92aWRlciA/IHRoaXMucmFuZ2VQcm92aWRlci5pZCA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB7IGNvbGxhcHNlZFJlZ2lvbnMsIGxpbmVDb3VudDogbW9kZWwuZ2V0TGluZUNvdW50KCksIHByb3ZpZGVyLCBmb2xkZWRJbXBvcnRzOiB0aGlzLl9jdXJyZW50TW9kZWxIYXNGb2xkZWRJbXBvcnRzIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVzdG9yZSB2aWV3IHN0YXRlLlxuXHQgKi9cblx0cHVibGljIHJlc3RvcmVWaWV3U3RhdGUoc3RhdGU6IEZvbGRpbmdTdGF0ZU1lbWVudG8pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCAhdGhpcy5faXNFbmFibGVkIHx8IG1vZGVsLmlzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24oKSB8fCAhdGhpcy5oaWRkZW5SYW5nZU1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50TW9kZWxIYXNGb2xkZWRJbXBvcnRzID0gISFzdGF0ZS5mb2xkZWRJbXBvcnRzO1xuXHRcdGlmIChzdGF0ZS5jb2xsYXBzZWRSZWdpb25zICYmIHN0YXRlLmNvbGxhcHNlZFJlZ2lvbnMubGVuZ3RoID4gMCAmJiB0aGlzLmZvbGRpbmdNb2RlbCkge1xuXHRcdFx0dGhpcy5fcmVzdG9yaW5nVmlld1N0YXRlID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuZm9sZGluZ01vZGVsLmFwcGx5TWVtZW50byhzdGF0ZS5jb2xsYXBzZWRSZWdpb25zKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3RvcmluZ1ZpZXdTdGF0ZSA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Nb2RlbENoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5jbGVhcigpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghdGhpcy5faXNFbmFibGVkIHx8ICFtb2RlbCB8fCBtb2RlbC5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkpIHtcblx0XHRcdC8vIGh1Z2UgZmlsZXMgZ2V0IG5vIHZpZXcgbW9kZWwsIHNvIHRoZXkgY2Fubm90IHN1cHBvcnQgaGlkZGVuIGFyZWFzXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudE1vZGVsSGFzRm9sZGVkSW1wb3J0cyA9IGZhbHNlO1xuXHRcdHRoaXMuZm9sZGluZ01vZGVsID0gbmV3IEZvbGRpbmdNb2RlbChtb2RlbCwgdGhpcy5mb2xkaW5nRGVjb3JhdGlvblByb3ZpZGVyKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmZvbGRpbmdNb2RlbCk7XG5cblx0XHR0aGlzLmhpZGRlblJhbmdlTW9kZWwgPSBuZXcgSGlkZGVuUmFuZ2VNb2RlbCh0aGlzLmZvbGRpbmdNb2RlbCk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5oaWRkZW5SYW5nZU1vZGVsKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmhpZGRlblJhbmdlTW9kZWwub25EaWRDaGFuZ2UoaHIgPT4gdGhpcy5vbkhpZGRlblJhbmdlc0NoYW5nZXMoaHIpKSk7XG5cblx0XHR0aGlzLnVwZGF0ZVNjaGVkdWxlciA9IG5ldyBEZWxheWVyPEZvbGRpbmdNb2RlbD4odGhpcy51cGRhdGVEZWJvdW5jZUluZm8uZ2V0KG1vZGVsKSk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy51cGRhdGVTY2hlZHVsZXIpO1xuXG5cdFx0dGhpcy5jdXJzb3JDaGFuZ2VkU2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5yZXZlYWxDdXJzb3IoKSwgMjAwKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmN1cnNvckNoYW5nZWRTY2hlZHVsZXIpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZm9sZGluZ1JhbmdlUHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5vbkZvbGRpbmdTdHJhdGVneUNoYW5nZWQoKSkpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb24oKCkgPT4gdGhpcy5vbkZvbGRpbmdTdHJhdGVneUNoYW5nZWQoKSkpOyAvLyBjb3ZlcnMgbW9kZWwgbGFuZ3VhZ2UgY2hhbmdlcyBhcyB3ZWxsXG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoZSA9PiB0aGlzLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KGUpKSk7XG5cdFx0dGhpcy5sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoKSA9PiB0aGlzLm9uQ3Vyc29yUG9zaXRpb25DaGFuZ2VkKCkpKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbk1vdXNlRG93bihlID0+IHRoaXMub25FZGl0b3JNb3VzZURvd24oZSkpKTtcblx0XHR0aGlzLmxvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLmVkaXRvci5vbk1vdXNlVXAoZSA9PiB0aGlzLm9uRWRpdG9yTW91c2VVcChlKSkpO1xuXHRcdHRoaXMubG9jYWxUb0Rpc3Bvc2UuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuZm9sZGluZ1JlZ2lvblByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLmZvbGRpbmdSZWdpb25Qcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0XHRcdHRoaXMuZm9sZGluZ1JlZ2lvblByb21pc2UgPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudXBkYXRlU2NoZWR1bGVyPy5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVTY2hlZHVsZXIgPSBudWxsO1xuXHRcdFx0XHR0aGlzLmZvbGRpbmdNb2RlbCA9IG51bGw7XG5cdFx0XHRcdHRoaXMuZm9sZGluZ01vZGVsUHJvbWlzZSA9IG51bGw7XG5cdFx0XHRcdHRoaXMuaGlkZGVuUmFuZ2VNb2RlbCA9IG51bGw7XG5cdFx0XHRcdHRoaXMuY3Vyc29yQ2hhbmdlZFNjaGVkdWxlciA9IG51bGw7XG5cdFx0XHRcdHRoaXMucmFuZ2VQcm92aWRlcj8uZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLnJhbmdlUHJvdmlkZXIgPSBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMudHJpZ2dlckZvbGRpbmdNb2RlbENoYW5nZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Gb2xkaW5nU3RyYXRlZ3lDaGFuZ2VkKCkge1xuXHRcdHRoaXMucmFuZ2VQcm92aWRlcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMucmFuZ2VQcm92aWRlciA9IG51bGw7XG5cdFx0dGhpcy50cmlnZ2VyRm9sZGluZ01vZGVsQ2hhbmdlZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSYW5nZVByb3ZpZGVyKGVkaXRvck1vZGVsOiBJVGV4dE1vZGVsKTogUmFuZ2VQcm92aWRlciB7XG5cdFx0aWYgKHRoaXMucmFuZ2VQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMucmFuZ2VQcm92aWRlcjtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZW50UmFuZ2VQcm92aWRlciA9IG5ldyBJbmRlbnRSYW5nZVByb3ZpZGVyKGVkaXRvck1vZGVsLCB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX2ZvbGRpbmdMaW1pdFJlcG9ydGVyKTtcblx0XHR0aGlzLnJhbmdlUHJvdmlkZXIgPSBpbmRlbnRSYW5nZVByb3ZpZGVyOyAvLyBmYWxsYmFja1xuXHRcdGlmICh0aGlzLl91c2VGb2xkaW5nUHJvdmlkZXJzICYmIHRoaXMuZm9sZGluZ01vZGVsKSB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZFByb3ZpZGVycyA9IEZvbGRpbmdDb250cm9sbGVyLmdldEZvbGRpbmdSYW5nZVByb3ZpZGVycyh0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBlZGl0b3JNb2RlbCk7XG5cdFx0XHRpZiAoc2VsZWN0ZWRQcm92aWRlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLnJhbmdlUHJvdmlkZXIgPSBuZXcgU3ludGF4UmFuZ2VQcm92aWRlcihlZGl0b3JNb2RlbCwgc2VsZWN0ZWRQcm92aWRlcnMsICgpID0+IHRoaXMudHJpZ2dlckZvbGRpbmdNb2RlbENoYW5nZWQoKSwgdGhpcy5fZm9sZGluZ0xpbWl0UmVwb3J0ZXIsIGluZGVudFJhbmdlUHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yYW5nZVByb3ZpZGVyO1xuXHR9XG5cblx0cHVibGljIGdldEZvbGRpbmdNb2RlbCgpOiBQcm9taXNlPEZvbGRpbmdNb2RlbCB8IG51bGw+IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuZm9sZGluZ01vZGVsUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoZTogSU1vZGVsQ29udGVudENoYW5nZWRFdmVudCkge1xuXHRcdHRoaXMuaGlkZGVuUmFuZ2VNb2RlbD8ubm90aWZ5Q2hhbmdlTW9kZWxDb250ZW50KGUpO1xuXHRcdHRoaXMudHJpZ2dlckZvbGRpbmdNb2RlbENoYW5nZWQoKTtcblx0fVxuXG5cblx0cHVibGljIHRyaWdnZXJGb2xkaW5nTW9kZWxDaGFuZ2VkKCkge1xuXHRcdGlmICh0aGlzLnVwZGF0ZVNjaGVkdWxlcikge1xuXHRcdFx0aWYgKHRoaXMuZm9sZGluZ1JlZ2lvblByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5mb2xkaW5nUmVnaW9uUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5mb2xkaW5nUmVnaW9uUHJvbWlzZSA9IG51bGw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmZvbGRpbmdNb2RlbFByb21pc2UgPSB0aGlzLnVwZGF0ZVNjaGVkdWxlci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gdGhpcy5mb2xkaW5nTW9kZWw7XG5cdFx0XHRcdGlmICghZm9sZGluZ01vZGVsKSB7IC8vIG51bGwgaWYgZWRpdG9yIGhhcyBiZWVuIGRpc3Bvc2VkLCBvciBmb2xkaW5nIHR1cm5lZCBvZmZcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmdldFJhbmdlUHJvdmlkZXIoZm9sZGluZ01vZGVsLnRleHRNb2RlbCk7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdSZWdpb25Qcm9taXNlID0gdGhpcy5mb2xkaW5nUmVnaW9uUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHByb3ZpZGVyLmNvbXB1dGUodG9rZW4pKTtcblx0XHRcdFx0cmV0dXJuIGZvbGRpbmdSZWdpb25Qcm9taXNlLnRoZW4oZm9sZGluZ1JhbmdlcyA9PiB7XG5cdFx0XHRcdFx0aWYgKGZvbGRpbmdSYW5nZXMgJiYgZm9sZGluZ1JlZ2lvblByb21pc2UgPT09IHRoaXMuZm9sZGluZ1JlZ2lvblByb21pc2UpIHsgLy8gbmV3IHJlcXVlc3Qgb3IgY2FuY2VsbGVkIGluIHRoZSBtZWFudGltZT9cblx0XHRcdFx0XHRcdGxldCBzY3JvbGxTdGF0ZTogU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9mb2xkaW5nSW1wb3J0c0J5RGVmYXVsdCAmJiAhdGhpcy5fY3VycmVudE1vZGVsSGFzRm9sZGVkSW1wb3J0cykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBoYXNDaGFuZ2VzID0gZm9sZGluZ1Jhbmdlcy5zZXRDb2xsYXBzZWRBbGxPZlR5cGUoRm9sZGluZ1JhbmdlS2luZC5JbXBvcnRzLnZhbHVlLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0aWYgKGhhc0NoYW5nZXMpIHtcblx0XHRcdFx0XHRcdFx0XHRzY3JvbGxTdGF0ZSA9IFN0YWJsZUVkaXRvclNjcm9sbFN0YXRlLmNhcHR1cmUodGhpcy5lZGl0b3IpO1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRNb2RlbEhhc0ZvbGRlZEltcG9ydHMgPSBoYXNDaGFuZ2VzO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIHNvbWUgY3Vyc29ycyBtaWdodCBoYXZlIG1vdmVkIGludG8gaGlkZGVuIHJlZ2lvbnMsIG1ha2Ugc3VyZSB0aGV5IGFyZSBpbiBleHBhbmRlZCByZWdpb25zXG5cdFx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0XHRcdFx0Zm9sZGluZ01vZGVsLnVwZGF0ZShmb2xkaW5nUmFuZ2VzLCB0b1NlbGVjdGVkTGluZXMoc2VsZWN0aW9ucykpO1xuXG5cdFx0XHRcdFx0XHRzY3JvbGxTdGF0ZT8ucmVzdG9yZSh0aGlzLmVkaXRvcik7XG5cblx0XHRcdFx0XHRcdC8vIHVwZGF0ZSBkZWJvdW5jZSBpbmZvXG5cdFx0XHRcdFx0XHRjb25zdCBuZXdWYWx1ZSA9IHRoaXMudXBkYXRlRGVib3VuY2VJbmZvLnVwZGF0ZShmb2xkaW5nTW9kZWwudGV4dE1vZGVsLCBzdy5lbGFwc2VkKCkpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMudXBkYXRlU2NoZWR1bGVyKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlU2NoZWR1bGVyLmRlZmF1bHREZWxheSA9IG5ld1ZhbHVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZm9sZGluZ01vZGVsO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pLnRoZW4odW5kZWZpbmVkLCAoZXJyKSA9PiB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkhpZGRlblJhbmdlc0NoYW5nZXMoaGlkZGVuUmFuZ2VzOiBJUmFuZ2VbXSkge1xuXHRcdGlmICh0aGlzLmhpZGRlblJhbmdlTW9kZWwgJiYgaGlkZGVuUmFuZ2VzLmxlbmd0aCAmJiAhdGhpcy5fcmVzdG9yaW5nVmlld1N0YXRlKSB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0aWYgKHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0aWYgKHRoaXMuaGlkZGVuUmFuZ2VNb2RlbC5hZGp1c3RTZWxlY3Rpb25zKHNlbGVjdGlvbnMpKSB7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2VsZWN0aW9ucyhzZWxlY3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmVkaXRvci5zZXRIaWRkZW5BcmVhcyhoaWRkZW5SYW5nZXMsIHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkN1cnNvclBvc2l0aW9uQ2hhbmdlZCgpIHtcblx0XHRpZiAodGhpcy5oaWRkZW5SYW5nZU1vZGVsICYmIHRoaXMuaGlkZGVuUmFuZ2VNb2RlbC5oYXNSYW5nZXMoKSkge1xuXHRcdFx0dGhpcy5jdXJzb3JDaGFuZ2VkU2NoZWR1bGVyIS5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmV2ZWFsQ3Vyc29yKCkge1xuXHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IHRoaXMuZ2V0Rm9sZGluZ01vZGVsKCk7XG5cdFx0aWYgKCFmb2xkaW5nTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9sZGluZ01vZGVsLnRoZW4oZm9sZGluZ01vZGVsID0+IHsgLy8gbnVsbCBpcyByZXR1cm5lZCBpZiBmb2xkaW5nIGdvdCBkaXNhYmxlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdGlmIChmb2xkaW5nTW9kZWwpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdFx0aWYgKHNlbGVjdGlvbnMgJiYgc2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgdG9Ub2dnbGU6IEZvbGRpbmdSZWdpb25bXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBzZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuaGlkZGVuUmFuZ2VNb2RlbCAmJiB0aGlzLmhpZGRlblJhbmdlTW9kZWwuaXNIaWRkZW4obGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRcdFx0dG9Ub2dnbGUucHVzaCguLi5mb2xkaW5nTW9kZWwuZ2V0QWxsUmVnaW9uc0F0TGluZShsaW5lTnVtYmVyLCByID0+IHIuaXNDb2xsYXBzZWQgJiYgbGluZU51bWJlciA+IHIuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0b1RvZ2dsZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGZvbGRpbmdNb2RlbC50b2dnbGVDb2xsYXBzZVN0YXRlKHRvVG9nZ2xlKTtcblx0XHRcdFx0XHRcdHRoaXMucmV2ZWFsKHNlbGVjdGlvbnNbMF0uZ2V0UG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkudGhlbih1bmRlZmluZWQsIG9uVW5leHBlY3RlZEVycm9yKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlRG93bihlOiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMubW91c2VEb3duSW5mbyA9IG51bGw7XG5cblxuXHRcdGlmICghdGhpcy5oaWRkZW5SYW5nZU1vZGVsIHx8ICFlLnRhcmdldCB8fCAhZS50YXJnZXQucmFuZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFlLmV2ZW50LmxlZnRCdXR0b24gJiYgIWUuZXZlbnQubWlkZGxlQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlID0gZS50YXJnZXQucmFuZ2U7XG5cdFx0bGV0IGljb25DbGlja2VkID0gZmFsc2U7XG5cdFx0c3dpdGNoIChlLnRhcmdldC50eXBlKSB7XG5cdFx0XHRjYXNlIE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUzoge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gZS50YXJnZXQuZGV0YWlsO1xuXHRcdFx0XHRjb25zdCBvZmZzZXRMZWZ0SW5HdXR0ZXIgPSBlLnRhcmdldC5lbGVtZW50IS5vZmZzZXRMZWZ0O1xuXHRcdFx0XHRjb25zdCBndXR0ZXJPZmZzZXRYID0gZGF0YS5vZmZzZXRYIC0gb2Zmc2V0TGVmdEluR3V0dGVyO1xuXG5cdFx0XHRcdC8vIGNvbnN0IGd1dHRlck9mZnNldFggPSBkYXRhLm9mZnNldFggLSBkYXRhLmdseXBoTWFyZ2luV2lkdGggLSBkYXRhLmxpbmVOdW1iZXJzV2lkdGggLSBkYXRhLmdseXBoTWFyZ2luTGVmdDtcblxuXHRcdFx0XHQvLyBUT0RPQGpvYW8gVE9ET0BhbGV4IFRPRE9AbWFydGluIHRoaXMgaXMgc3VjaCB0aGF0IHdlIGRvbid0IGNvbGxpZGUgd2l0aCBkaXJ0eSBkaWZmXG5cdFx0XHRcdGlmIChndXR0ZXJPZmZzZXRYIDwgNCkgeyAvLyB0aGUgd2hpdGVzcGFjZSBiZXR3ZWVuIHRoZSBib3JkZXIgYW5kIHRoZSByZWFsIGZvbGRpbmcgaWNvbiBib3JkZXIgaXMgNHB4XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWNvbkNsaWNrZWQgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfRU1QVFk6IHtcblx0XHRcdFx0aWYgKHRoaXMuX3VuZm9sZE9uQ2xpY2tBZnRlckVuZE9mTGluZSAmJiB0aGlzLmhpZGRlblJhbmdlTW9kZWwuaGFzUmFuZ2VzKCkpIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gZS50YXJnZXQuZGV0YWlsO1xuXHRcdFx0XHRcdGlmICghZGF0YS5pc0FmdGVyTGluZXMpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQ6IHtcblx0XHRcdFx0aWYgKHRoaXMuaGlkZGVuUmFuZ2VNb2RlbC5oYXNSYW5nZXMoKSkge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0XHRpZiAobW9kZWwgJiYgcmFuZ2Uuc3RhcnRDb2x1bW4gPT09IG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm1vdXNlRG93bkluZm8gPSB7IGxpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0TGluZU51bWJlciwgaWNvbkNsaWNrZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgb25FZGl0b3JNb3VzZVVwKGU6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gdGhpcy5mb2xkaW5nTW9kZWw7XG5cdFx0aWYgKCFmb2xkaW5nTW9kZWwgfHwgIXRoaXMubW91c2VEb3duSW5mbyB8fCAhZS50YXJnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMubW91c2VEb3duSW5mby5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGljb25DbGlja2VkID0gdGhpcy5tb3VzZURvd25JbmZvLmljb25DbGlja2VkO1xuXG5cdFx0Y29uc3QgcmFuZ2UgPSBlLnRhcmdldC5yYW5nZTtcblx0XHRpZiAoIXJhbmdlIHx8IHJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gbGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpY29uQ2xpY2tlZCkge1xuXHRcdFx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfTElORV9ERUNPUkFUSU9OUykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghbW9kZWwgfHwgcmFuZ2Uuc3RhcnRDb2x1bW4gIT09IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlZ2lvbiA9IGZvbGRpbmdNb2RlbC5nZXRSZWdpb25BdExpbmUobGluZU51bWJlcik7XG5cdFx0aWYgKHJlZ2lvbiAmJiByZWdpb24uc3RhcnRMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyKSB7XG5cdFx0XHRjb25zdCBpc0NvbGxhcHNlZCA9IHJlZ2lvbi5pc0NvbGxhcHNlZDtcblx0XHRcdGlmIChpY29uQ2xpY2tlZCB8fCBpc0NvbGxhcHNlZCkge1xuXHRcdFx0XHRjb25zdCBzdXJyb3VuZGluZyA9IGUuZXZlbnQuYWx0S2V5O1xuXHRcdFx0XHRsZXQgdG9Ub2dnbGUgPSBbXTtcblx0XHRcdFx0aWYgKHN1cnJvdW5kaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsdGVyID0gKG90aGVyUmVnaW9uOiBGb2xkaW5nUmVnaW9uKSA9PiAhb3RoZXJSZWdpb24uY29udGFpbmVkQnkocmVnaW9uKSAmJiAhcmVnaW9uLmNvbnRhaW5lZEJ5KG90aGVyUmVnaW9uKTtcblx0XHRcdFx0XHRjb25zdCB0b01heWJlVG9nZ2xlID0gZm9sZGluZ01vZGVsLmdldFJlZ2lvbnNJbnNpZGUobnVsbCwgZmlsdGVyKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHIgb2YgdG9NYXliZVRvZ2dsZSkge1xuXHRcdFx0XHRcdFx0aWYgKHIuaXNDb2xsYXBzZWQpIHtcblx0XHRcdFx0XHRcdFx0dG9Ub2dnbGUucHVzaChyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gaWYgYW55IHN1cnJvdW5kaW5nIHJlZ2lvbnMgYXJlIGZvbGRlZCwgdW5mb2xkIHRob3NlLiBPdGhlcndpc2UsIGZvbGQgYWxsIHN1cnJvdW5kaW5nXG5cdFx0XHRcdFx0aWYgKHRvVG9nZ2xlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dG9Ub2dnbGUgPSB0b01heWJlVG9nZ2xlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjb25zdCByZWN1cnNpdmUgPSBlLmV2ZW50Lm1pZGRsZUJ1dHRvbiB8fCBlLmV2ZW50LnNoaWZ0S2V5O1xuXHRcdFx0XHRcdGlmIChyZWN1cnNpdmUpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgciBvZiBmb2xkaW5nTW9kZWwuZ2V0UmVnaW9uc0luc2lkZShyZWdpb24pKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChyLmlzQ29sbGFwc2VkID09PSBpc0NvbGxhcHNlZCkge1xuXHRcdFx0XHRcdFx0XHRcdHRvVG9nZ2xlLnB1c2gocik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gd2hlbiByZWN1cnNpdmUsIGZpcnN0IG9ubHkgY29sbGFwc2UgYWxsIGNoaWxkcmVuLiBJZiBhbGwgYXJlIGFscmVhZHkgZm9sZGVkIG9yIHRoZXJlIGFyZSBubyBjaGlsZHJlbiwgYWxzbyBmb2xkIHBhcmVudC5cblx0XHRcdFx0XHRpZiAoaXNDb2xsYXBzZWQgfHwgIXJlY3Vyc2l2ZSB8fCB0b1RvZ2dsZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHRvVG9nZ2xlLnB1c2gocmVnaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUodG9Ub2dnbGUpO1xuXHRcdFx0XHR0aGlzLnJldmVhbCh7IGxpbmVOdW1iZXIsIGNvbHVtbjogMSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsKHBvc2l0aW9uOiBJUG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvci5yZXZlYWxQb3NpdGlvbkluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocG9zaXRpb24sIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmFuZ2VzTGltaXRSZXBvcnRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBGb2xkaW5nTGltaXRSZXBvcnRlciB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGxpbWl0KCkge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvci5nZXRPcHRpb25zKCkuZ2V0KEVkaXRvck9wdGlvbi5mb2xkaW5nTWF4aW11bVJlZ2lvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZSgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDsgfVxuXG5cdHByaXZhdGUgX2NvbXB1dGVkOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9saW1pdGVkOiBudW1iZXIgfCBmYWxzZSA9IGZhbHNlO1xuXHRwdWJsaWMgZ2V0IGNvbXB1dGVkKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXB1dGVkO1xuXHR9XG5cdHB1YmxpYyBnZXQgbGltaXRlZCgpOiBudW1iZXIgfCBmYWxzZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbWl0ZWQ7XG5cdH1cblx0cHVibGljIHVwZGF0ZShjb21wdXRlZDogbnVtYmVyLCBsaW1pdGVkOiBudW1iZXIgfCBmYWxzZSkge1xuXHRcdGlmIChjb21wdXRlZCAhPT0gdGhpcy5fY29tcHV0ZWQgfHwgbGltaXRlZCAhPT0gdGhpcy5fbGltaXRlZCkge1xuXHRcdFx0dGhpcy5fY29tcHV0ZWQgPSBjb21wdXRlZDtcblx0XHRcdHRoaXMuX2xpbWl0ZWQgPSBsaW1pdGVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBGb2xkaW5nQWN0aW9uPFQ+IGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRhYnN0cmFjdCBpbnZva2UoZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogVCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpOiB2b2lkO1xuXG5cdHB1YmxpYyBvdmVycmlkZSBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBUKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGZvbGRpbmdDb250cm9sbGVyID0gRm9sZGluZ0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFmb2xkaW5nQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmb2xkaW5nTW9kZWxQcm9taXNlID0gZm9sZGluZ0NvbnRyb2xsZXIuZ2V0Rm9sZGluZ01vZGVsKCk7XG5cdFx0aWYgKGZvbGRpbmdNb2RlbFByb21pc2UpIHtcblx0XHRcdHRoaXMucmVwb3J0VGVsZW1ldHJ5KGFjY2Vzc29yLCBlZGl0b3IpO1xuXHRcdFx0cmV0dXJuIGZvbGRpbmdNb2RlbFByb21pc2UudGhlbihmb2xkaW5nTW9kZWwgPT4ge1xuXHRcdFx0XHRpZiAoZm9sZGluZ01vZGVsKSB7XG5cdFx0XHRcdFx0dGhpcy5pbnZva2UoZm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbCwgZWRpdG9yLCBhcmdzLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0Zm9sZGluZ0NvbnRyb2xsZXIucmV2ZWFsKHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGdldFNlbGVjdGVkTGluZXMoZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdHJldHVybiBzZWxlY3Rpb25zID8gc2VsZWN0aW9ucy5tYXAocyA9PiBzLnN0YXJ0TGluZU51bWJlcikgOiBbXTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRMaW5lTnVtYmVycyhhcmdzOiBGb2xkaW5nQXJndW1lbnRzLCBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0aWYgKGFyZ3MgJiYgYXJncy5zZWxlY3Rpb25MaW5lcykge1xuXHRcdFx0cmV0dXJuIGFyZ3Muc2VsZWN0aW9uTGluZXMubWFwKGwgPT4gbCArIDEpOyAvLyB0byAwLWJhc2VzIGxpbmUgbnVtYmVyc1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRTZWxlY3RlZExpbmVzKGVkaXRvcik7XG5cdH1cblxuXHRwdWJsaWMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgX2VkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGVkTGluZXMge1xuXHRzdGFydHNJbnNpZGUoc3RhcnRMaW5lOiBudW1iZXIsIGVuZExpbmU6IG51bWJlcik6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1NlbGVjdGVkTGluZXMoc2VsZWN0aW9uczogU2VsZWN0aW9uW10gfCBudWxsKTogU2VsZWN0ZWRMaW5lcyB7XG5cdGlmICghc2VsZWN0aW9ucyB8fCBzZWxlY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydHNJbnNpZGU6ICgpID0+IGZhbHNlXG5cdFx0fTtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0c0luc2lkZShzdGFydExpbmU6IG51bWJlciwgZW5kTGluZTogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0XHRmb3IgKGNvbnN0IHMgb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0XHRjb25zdCBsaW5lID0gcy5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdGlmIChsaW5lID49IHN0YXJ0TGluZSAmJiBsaW5lIDw9IGVuZExpbmUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fTtcbn1cblxuaW50ZXJmYWNlIEZvbGRpbmdBcmd1bWVudHMge1xuXHRsZXZlbHM/OiBudW1iZXI7XG5cdGRpcmVjdGlvbj86ICd1cCcgfCAnZG93bic7XG5cdHNlbGVjdGlvbkxpbmVzPzogbnVtYmVyW107XG59XG5cbmZ1bmN0aW9uIGZvbGRpbmdBcmd1bWVudHNDb25zdHJhaW50KGFyZ3M6IHVua25vd24pIHtcblx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChhcmdzKSkge1xuXHRcdGlmICghdHlwZXMuaXNPYmplY3QoYXJncykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZm9sZGluZ0FyZ3M6IEZvbGRpbmdBcmd1bWVudHMgPSBhcmdzO1xuXHRcdGlmICghdHlwZXMuaXNVbmRlZmluZWQoZm9sZGluZ0FyZ3MubGV2ZWxzKSAmJiAhdHlwZXMuaXNOdW1iZXIoZm9sZGluZ0FyZ3MubGV2ZWxzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXR5cGVzLmlzVW5kZWZpbmVkKGZvbGRpbmdBcmdzLmRpcmVjdGlvbikgJiYgIXR5cGVzLmlzU3RyaW5nKGZvbGRpbmdBcmdzLmRpcmVjdGlvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChmb2xkaW5nQXJncy5zZWxlY3Rpb25MaW5lcykgJiYgKCFBcnJheS5pc0FycmF5KGZvbGRpbmdBcmdzLnNlbGVjdGlvbkxpbmVzKSB8fCAhZm9sZGluZ0FyZ3Muc2VsZWN0aW9uTGluZXMuZXZlcnkodHlwZXMuaXNOdW1iZXIpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuY2xhc3MgVW5mb2xkQWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjxGb2xkaW5nQXJndW1lbnRzPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IudW5mb2xkJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd1bmZvbGRBY3Rpb24ubGFiZWwnLCBcIlVuZm9sZFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdVbmZvbGQgdGhlIGNvbnRlbnQgaW4gdGhlIGVkaXRvcicsXG5cdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnVW5mb2xkIGVkaXRvciBhcmd1bWVudCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYFByb3BlcnR5LXZhbHVlIHBhaXJzIHRoYXQgY2FuIGJlIHBhc3NlZCB0aHJvdWdoIHRoaXMgYXJndW1lbnQ6XG5cdFx0XHRcdFx0XHQqICdsZXZlbHMnOiBOdW1iZXIgb2YgbGV2ZWxzIHRvIHVuZm9sZC4gSWYgbm90IHNldCwgZGVmYXVsdHMgdG8gMS5cblx0XHRcdFx0XHRcdCogJ2RpcmVjdGlvbic6IElmICd1cCcsIHVuZm9sZCBnaXZlbiBudW1iZXIgb2YgbGV2ZWxzIHVwIG90aGVyd2lzZSB1bmZvbGRzIGRvd24uXG5cdFx0XHRcdFx0XHQqICdzZWxlY3Rpb25MaW5lcyc6IEFycmF5IG9mIHRoZSBzdGFydCBsaW5lcyAoMC1iYXNlZCkgb2YgdGhlIGVkaXRvciBzZWxlY3Rpb25zIHRvIGFwcGx5IHRoZSB1bmZvbGQgYWN0aW9uIHRvLiBJZiBub3Qgc2V0LCB0aGUgYWN0aXZlIHNlbGVjdGlvbihzKSB3aWxsIGJlIHVzZWQuXG5cdFx0XHRcdFx0XHRgLFxuXHRcdFx0XHRcdFx0Y29uc3RyYWludDogZm9sZGluZ0FyZ3VtZW50c0NvbnN0cmFpbnQsXG5cdFx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0J2xldmVscyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6IDFcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdCdkaXJlY3Rpb24nOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2VudW0nOiBbJ3VwJywgJ2Rvd24nXSxcblx0XHRcdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogJ2Rvd24nXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHQnc2VsZWN0aW9uTGluZXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0XHQnaXRlbXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcidcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogRm9sZGluZ0FyZ3VtZW50cyk6IHZvaWQge1xuXHRcdGNvbnN0IGxldmVscyA9IGFyZ3MgJiYgYXJncy5sZXZlbHMgfHwgMTtcblx0XHRjb25zdCBsaW5lTnVtYmVycyA9IHRoaXMuZ2V0TGluZU51bWJlcnMoYXJncywgZWRpdG9yKTtcblx0XHRpZiAoYXJncyAmJiBhcmdzLmRpcmVjdGlvbiA9PT0gJ3VwJykge1xuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUxldmVsc1VwKGZvbGRpbmdNb2RlbCwgZmFsc2UsIGxldmVscywgbGluZU51bWJlcnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIGZhbHNlLCBsZXZlbHMsIGxpbmVOdW1iZXJzKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVW5Gb2xkUmVjdXJzaXZlbHlBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci51bmZvbGRSZWN1cnNpdmVseScsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMigndW5Gb2xkUmVjdXJzaXZlbHlBY3Rpb24ubGFiZWwnLCBcIlVuZm9sZCBSZWN1cnNpdmVseVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvciwgX2FyZ3M6IHVua25vd24pOiB2b2lkIHtcblx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIGZhbHNlLCBOdW1iZXIuTUFYX1ZBTFVFLCB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKSk7XG5cdH1cbn1cblxuY2xhc3MgRm9sZEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248Rm9sZGluZ0FyZ3VtZW50cz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmZvbGQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZvbGRBY3Rpb24ubGFiZWwnLCBcIkZvbGRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldExlZnQsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuQnJhY2tldExlZnRcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0ZvbGQgdGhlIGNvbnRlbnQgaW4gdGhlIGVkaXRvcicsXG5cdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAnRm9sZCBlZGl0b3IgYXJndW1lbnQnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGBQcm9wZXJ0eS12YWx1ZSBwYWlycyB0aGF0IGNhbiBiZSBwYXNzZWQgdGhyb3VnaCB0aGlzIGFyZ3VtZW50OlxuXHRcdFx0XHRcdFx0XHQqICdsZXZlbHMnOiBOdW1iZXIgb2YgbGV2ZWxzIHRvIGZvbGQuXG5cdFx0XHRcdFx0XHRcdCogJ2RpcmVjdGlvbic6IElmICd1cCcsIGZvbGRzIGdpdmVuIG51bWJlciBvZiBsZXZlbHMgdXAgb3RoZXJ3aXNlIGZvbGRzIGRvd24uXG5cdFx0XHRcdFx0XHRcdCogJ3NlbGVjdGlvbkxpbmVzJzogQXJyYXkgb2YgdGhlIHN0YXJ0IGxpbmVzICgwLWJhc2VkKSBvZiB0aGUgZWRpdG9yIHNlbGVjdGlvbnMgdG8gYXBwbHkgdGhlIGZvbGQgYWN0aW9uIHRvLiBJZiBub3Qgc2V0LCB0aGUgYWN0aXZlIHNlbGVjdGlvbihzKSB3aWxsIGJlIHVzZWQuXG5cdFx0XHRcdFx0XHRcdElmIG5vIGxldmVscyBvciBkaXJlY3Rpb24gaXMgc2V0LCBmb2xkcyB0aGUgcmVnaW9uIGF0IHRoZSBsb2NhdGlvbnMgb3IgaWYgYWxyZWFkeSBjb2xsYXBzZWQsIHRoZSBmaXJzdCB1bmNvbGxhcHNlZCBwYXJlbnQgaW5zdGVhZC5cblx0XHRcdFx0XHRcdGAsXG5cdFx0XHRcdFx0XHRjb25zdHJhaW50OiBmb2xkaW5nQXJndW1lbnRzQ29uc3RyYWludCxcblx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdFx0XHQnbGV2ZWxzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdCdkaXJlY3Rpb24nOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2VudW0nOiBbJ3VwJywgJ2Rvd24nXSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdCdzZWxlY3Rpb25MaW5lcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRcdCdpdGVtcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiBGb2xkaW5nQXJndW1lbnRzKTogdm9pZCB7XG5cdFx0Y29uc3QgbGluZU51bWJlcnMgPSB0aGlzLmdldExpbmVOdW1iZXJzKGFyZ3MsIGVkaXRvcik7XG5cblx0XHRjb25zdCBsZXZlbHMgPSBhcmdzICYmIGFyZ3MubGV2ZWxzO1xuXHRcdGNvbnN0IGRpcmVjdGlvbiA9IGFyZ3MgJiYgYXJncy5kaXJlY3Rpb247XG5cblx0XHRpZiAodHlwZW9mIGxldmVscyAhPT0gJ251bWJlcicgJiYgdHlwZW9mIGRpcmVjdGlvbiAhPT0gJ3N0cmluZycpIHtcblx0XHRcdC8vIGZvbGQgdGhlIHJlZ2lvbiBhdCB0aGUgbG9jYXRpb24gb3IgaWYgYWxyZWFkeSBjb2xsYXBzZWQsIHRoZSBmaXJzdCB1bmNvbGxhcHNlZCBwYXJlbnQgaW5zdGVhZC5cblx0XHRcdHNldENvbGxhcHNlU3RhdGVVcChmb2xkaW5nTW9kZWwsIHRydWUsIGxpbmVOdW1iZXJzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGRpcmVjdGlvbiA9PT0gJ3VwJykge1xuXHRcdFx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzVXAoZm9sZGluZ01vZGVsLCB0cnVlLCBsZXZlbHMgfHwgMSwgbGluZU51bWJlcnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUxldmVsc0Rvd24oZm9sZGluZ01vZGVsLCB0cnVlLCBsZXZlbHMgfHwgMSwgbGluZU51bWJlcnMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5cbmNsYXNzIFRvZ2dsZUZvbGRBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci50b2dnbGVGb2xkJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd0b2dnbGVGb2xkQWN0aW9uLmxhYmVsJywgXCJUb2dnbGUgRm9sZFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5TCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3RlZExpbmVzID0gdGhpcy5nZXRTZWxlY3RlZExpbmVzKGVkaXRvcik7XG5cdFx0dG9nZ2xlQ29sbGFwc2VTdGF0ZShmb2xkaW5nTW9kZWwsIDEsIHNlbGVjdGVkTGluZXMpO1xuXHR9XG59XG5cblxuY2xhc3MgRm9sZFJlY3Vyc2l2ZWx5QWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZm9sZFJlY3Vyc2l2ZWx5Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdmb2xkUmVjdXJzaXZlbHlBY3Rpb24ubGFiZWwnLCBcIkZvbGQgUmVjdXJzaXZlbHlcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJyYWNrZXRMZWZ0KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkTGluZXMgPSB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKTtcblx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIHRydWUsIE51bWJlci5NQVhfVkFMVUUsIHNlbGVjdGVkTGluZXMpO1xuXHR9XG59XG5cblxuY2xhc3MgVG9nZ2xlRm9sZFJlY3Vyc2l2ZWx5QWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IudG9nZ2xlRm9sZFJlY3Vyc2l2ZWx5Jyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd0b2dnbGVGb2xkUmVjdXJzaXZlbHlBY3Rpb24ubGFiZWwnLCBcIlRvZ2dsZSBGb2xkIFJlY3Vyc2l2ZWx5XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlMKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGVkTGluZXMgPSB0aGlzLmdldFNlbGVjdGVkTGluZXMoZWRpdG9yKTtcblx0XHR0b2dnbGVDb2xsYXBzZVN0YXRlKGZvbGRpbmdNb2RlbCwgTnVtYmVyLk1BWF9WQUxVRSwgc2VsZWN0ZWRMaW5lcyk7XG5cdH1cbn1cblxuXG5jbGFzcyBGb2xkQWxsQmxvY2tDb21tZW50c0FjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmZvbGRBbGxCbG9ja0NvbW1lbnRzJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdmb2xkQWxsQmxvY2tDb21tZW50cy5sYWJlbCcsIFwiRm9sZCBBbGwgQmxvY2sgQ29tbWVudHNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlNsYXNoKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdm9pZCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpOiB2b2lkIHtcblx0XHRpZiAoZm9sZGluZ01vZGVsLnJlZ2lvbnMuaGFzVHlwZXMoKSkge1xuXHRcdFx0c2V0Q29sbGFwc2VTdGF0ZUZvclR5cGUoZm9sZGluZ01vZGVsLCBGb2xkaW5nUmFuZ2VLaW5kLkNvbW1lbnQudmFsdWUsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBlZGl0b3JNb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFlZGl0b3JNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb21tZW50cyA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSkuY29tbWVudHM7XG5cdFx0XHRpZiAoY29tbWVudHMgJiYgY29tbWVudHMuYmxvY2tDb21tZW50U3RhcnRUb2tlbikge1xuXHRcdFx0XHRjb25zdCByZWdFeHAgPSBuZXcgUmVnRXhwKCdeXFxcXHMqJyArIGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMoY29tbWVudHMuYmxvY2tDb21tZW50U3RhcnRUb2tlbikpO1xuXHRcdFx0XHRzZXRDb2xsYXBzZVN0YXRlRm9yTWF0Y2hpbmdMaW5lcyhmb2xkaW5nTW9kZWwsIHJlZ0V4cCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEZvbGRBbGxSZWdpb25zQWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZm9sZEFsbE1hcmtlclJlZ2lvbnMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2ZvbGRBbGxNYXJrZXJSZWdpb25zLmxhYmVsJywgXCJGb2xkIEFsbCBSZWdpb25zXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5EaWdpdDgpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB2b2lkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IHZvaWQge1xuXHRcdGlmIChmb2xkaW5nTW9kZWwucmVnaW9ucy5oYXNUeXBlcygpKSB7XG5cdFx0XHRzZXRDb2xsYXBzZVN0YXRlRm9yVHlwZShmb2xkaW5nTW9kZWwsIEZvbGRpbmdSYW5nZUtpbmQuUmVnaW9uLnZhbHVlLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghZWRpdG9yTW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9sZGluZ1J1bGVzID0gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24oZWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKS5mb2xkaW5nUnVsZXM7XG5cdFx0XHRpZiAoZm9sZGluZ1J1bGVzICYmIGZvbGRpbmdSdWxlcy5tYXJrZXJzICYmIGZvbGRpbmdSdWxlcy5tYXJrZXJzLnN0YXJ0KSB7XG5cdFx0XHRcdGNvbnN0IHJlZ0V4cCA9IG5ldyBSZWdFeHAoZm9sZGluZ1J1bGVzLm1hcmtlcnMuc3RhcnQpO1xuXHRcdFx0XHRzZXRDb2xsYXBzZVN0YXRlRm9yTWF0Y2hpbmdMaW5lcyhmb2xkaW5nTW9kZWwsIHJlZ0V4cCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFVuZm9sZEFsbFJlZ2lvbnNBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci51bmZvbGRBbGxNYXJrZXJSZWdpb25zJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCd1bmZvbGRBbGxNYXJrZXJSZWdpb25zLmxhYmVsJywgXCJVbmZvbGQgQWxsIFJlZ2lvbnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRpZ2l0OSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IHZvaWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0aWYgKGZvbGRpbmdNb2RlbC5yZWdpb25zLmhhc1R5cGVzKCkpIHtcblx0XHRcdHNldENvbGxhcHNlU3RhdGVGb3JUeXBlKGZvbGRpbmdNb2RlbCwgRm9sZGluZ1JhbmdlS2luZC5SZWdpb24udmFsdWUsIGZhbHNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghZWRpdG9yTW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9sZGluZ1J1bGVzID0gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24oZWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKS5mb2xkaW5nUnVsZXM7XG5cdFx0XHRpZiAoZm9sZGluZ1J1bGVzICYmIGZvbGRpbmdSdWxlcy5tYXJrZXJzICYmIGZvbGRpbmdSdWxlcy5tYXJrZXJzLnN0YXJ0KSB7XG5cdFx0XHRcdGNvbnN0IHJlZ0V4cCA9IG5ldyBSZWdFeHAoZm9sZGluZ1J1bGVzLm1hcmtlcnMuc3RhcnQpO1xuXHRcdFx0XHRzZXRDb2xsYXBzZVN0YXRlRm9yTWF0Y2hpbmdMaW5lcyhmb2xkaW5nTW9kZWwsIHJlZ0V4cCwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBGb2xkQWxsRXhjZXB0QWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZm9sZEFsbEV4Y2VwdCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZm9sZEFsbEV4Y2VwdC5sYWJlbCcsIFwiRm9sZCBBbGwgRXhjZXB0IFNlbGVjdGVkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5NaW51cyksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3RlZExpbmVzID0gdGhpcy5nZXRTZWxlY3RlZExpbmVzKGVkaXRvcik7XG5cdFx0c2V0Q29sbGFwc2VTdGF0ZUZvclJlc3QoZm9sZGluZ01vZGVsLCB0cnVlLCBzZWxlY3RlZExpbmVzKTtcblx0fVxuXG59XG5cbmNsYXNzIFVuZm9sZEFsbEV4Y2VwdEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLnVuZm9sZEFsbEV4Y2VwdCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMigndW5mb2xkQWxsRXhjZXB0LmxhYmVsJywgXCJVbmZvbGQgQWxsIEV4Y2VwdCBTZWxlY3RlZFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRXF1YWwpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0aW52b2tlKF9mb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRMaW5lcyA9IHRoaXMuZ2V0U2VsZWN0ZWRMaW5lcyhlZGl0b3IpO1xuXHRcdHNldENvbGxhcHNlU3RhdGVGb3JSZXN0KGZvbGRpbmdNb2RlbCwgZmFsc2UsIHNlbGVjdGVkTGluZXMpO1xuXHR9XG59XG5cbmNsYXNzIEZvbGRBbGxBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5mb2xkQWxsJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdmb2xkQWxsQWN0aW9uLmxhYmVsJywgXCJGb2xkIEFsbFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRGlnaXQwKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgX2VkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIHRydWUpO1xuXHR9XG59XG5cbmNsYXNzIFVuZm9sZEFsbEFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLnVuZm9sZEFsbCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMigndW5mb2xkQWxsQWN0aW9uLmxhYmVsJywgXCJVbmZvbGQgQWxsXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlKKSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgX2VkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRzZXRDb2xsYXBzZVN0YXRlTGV2ZWxzRG93bihmb2xkaW5nTW9kZWwsIGZhbHNlKTtcblx0fVxufVxuXG5jbGFzcyBGb2xkTGV2ZWxBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSURfUFJFRklYID0gJ2VkaXRvci5mb2xkTGV2ZWwnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gKGxldmVsOiBudW1iZXIpID0+IEZvbGRMZXZlbEFjdGlvbi5JRF9QUkVGSVggKyBsZXZlbDtcblxuXHRwcml2YXRlIGdldEZvbGRpbmdMZXZlbCgpIHtcblx0XHRyZXR1cm4gcGFyc2VJbnQodGhpcy5pZC5zdWJzdHIoRm9sZExldmVsQWN0aW9uLklEX1BSRUZJWC5sZW5ndGgpKTtcblx0fVxuXG5cdGludm9rZShfZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdHNldENvbGxhcHNlU3RhdGVBdExldmVsKGZvbGRpbmdNb2RlbCwgdGhpcy5nZXRGb2xkaW5nTGV2ZWwoKSwgdHJ1ZSwgdGhpcy5nZXRTZWxlY3RlZExpbmVzKGVkaXRvcikpO1xuXHR9XG59XG5cbi8qKiBBY3Rpb24gdG8gZ28gdG8gdGhlIHBhcmVudCBmb2xkIG9mIGN1cnJlbnQgbGluZSAqL1xuY2xhc3MgR290b1BhcmVudEZvbGRBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZ290b1BhcmVudEZvbGQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2dvdG9QYXJlbnRGb2xkLmxhYmVsJywgXCJHbyB0byBQYXJlbnQgRm9sZFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3RlZExpbmVzID0gdGhpcy5nZXRTZWxlY3RlZExpbmVzKGVkaXRvcik7XG5cdFx0aWYgKHNlbGVjdGVkTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gZ2V0UGFyZW50Rm9sZExpbmUoc2VsZWN0ZWRMaW5lc1swXSwgZm9sZGluZ01vZGVsKTtcblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgIT09IG51bGwpIHtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbih7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLyoqIEFjdGlvbiB0byBnbyB0byB0aGUgcHJldmlvdXMgZm9sZCBvZiBjdXJyZW50IGxpbmUgKi9cbmNsYXNzIEdvdG9QcmV2aW91c0ZvbGRBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZ290b1ByZXZpb3VzRm9sZCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZ290b1ByZXZpb3VzRm9sZC5sYWJlbCcsIFwiR28gdG8gUHJldmlvdXMgRm9sZGluZyBSYW5nZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3RlZExpbmVzID0gdGhpcy5nZXRTZWxlY3RlZExpbmVzKGVkaXRvcik7XG5cdFx0aWYgKHNlbGVjdGVkTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gZ2V0UHJldmlvdXNGb2xkTGluZShzZWxlY3RlZExpbmVzWzBdLCBmb2xkaW5nTW9kZWwpO1xuXHRcdFx0aWYgKHN0YXJ0TGluZU51bWJlciAhPT0gbnVsbCkge1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vKiogQWN0aW9uIHRvIGdvIHRvIHRoZSBuZXh0IGZvbGQgb2YgY3VycmVudCBsaW5lICovXG5jbGFzcyBHb3RvTmV4dEZvbGRBY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuZ290b05leHRGb2xkJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdnb3RvTmV4dEZvbGQubGFiZWwnLCBcIkdvIHRvIE5leHQgRm9sZGluZyBSYW5nZVwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9GT0xESU5HX0VOQUJMRUQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3RlZExpbmVzID0gdGhpcy5nZXRTZWxlY3RlZExpbmVzKGVkaXRvcik7XG5cdFx0aWYgKHNlbGVjdGVkTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gZ2V0TmV4dEZvbGRMaW5lKHNlbGVjdGVkTGluZXNbMF0sIGZvbGRpbmdNb2RlbCk7XG5cdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVyICE9PSBudWxsKSB7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24oe1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDFcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEZvbGRSYW5nZUZyb21TZWxlY3Rpb25BY3Rpb24gZXh0ZW5kcyBGb2xkaW5nQWN0aW9uPHZvaWQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5jcmVhdGVGb2xkaW5nUmFuZ2VGcm9tU2VsZWN0aW9uJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdjcmVhdGVNYW51YWxGb2xkUmFuZ2UubGFiZWwnLCBcIkNyZWF0ZSBGb2xkaW5nIFJhbmdlIGZyb20gU2VsZWN0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Db21tYSksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoX2ZvbGRpbmdDb250cm9sbGVyOiBGb2xkaW5nQ29udHJvbGxlciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb2xsYXBzZVJhbmdlczogRm9sZFJhbmdlW10gPSBbXTtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRpZiAoc2VsZWN0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2Ygc2VsZWN0aW9ucykge1xuXHRcdFx0XHRsZXQgZW5kTGluZU51bWJlciA9IHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHRpZiAoc2VsZWN0aW9uLmVuZENvbHVtbiA9PT0gMSkge1xuXHRcdFx0XHRcdC0tZW5kTGluZU51bWJlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZW5kTGluZU51bWJlciA+IHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRjb2xsYXBzZVJhbmdlcy5wdXNoKHtcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHR0eXBlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRpc0NvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdHNvdXJjZTogRm9sZFNvdXJjZS51c2VyRGVmaW5lZFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24oe1xuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChjb2xsYXBzZVJhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbGxhcHNlUmFuZ2VzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gYS5zdGFydExpbmVOdW1iZXIgLSBiLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IG5ld1JhbmdlcyA9IEZvbGRpbmdSZWdpb25zLnNhbml0aXplQW5kTWVyZ2UoZm9sZGluZ01vZGVsLnJlZ2lvbnMsIGNvbGxhcHNlUmFuZ2VzLCBlZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0XHRmb2xkaW5nTW9kZWwudXBkYXRlUG9zdChGb2xkaW5nUmVnaW9ucy5mcm9tRm9sZFJhbmdlcyhuZXdSYW5nZXMpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUmVtb3ZlRm9sZFJhbmdlRnJvbVNlbGVjdGlvbkFjdGlvbiBleHRlbmRzIEZvbGRpbmdBY3Rpb248dm9pZD4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLnJlbW92ZU1hbnVhbEZvbGRpbmdSYW5nZXMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3JlbW92ZU1hbnVhbEZvbGRpbmdSYW5nZXMubGFiZWwnLCBcIlJlbW92ZSBNYW51YWwgRm9sZGluZyBSYW5nZXNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfRk9MRElOR19FTkFCTEVELFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBlcmlvZCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRpbnZva2UoZm9sZGluZ0NvbnRyb2xsZXI6IEZvbGRpbmdDb250cm9sbGVyLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHRmb2xkaW5nTW9kZWwucmVtb3ZlTWFudWFsUmFuZ2VzKHNlbGVjdGlvbnMpO1xuXHRcdFx0Zm9sZGluZ0NvbnRyb2xsZXIudHJpZ2dlckZvbGRpbmdNb2RlbENoYW5nZWQoKTtcblx0XHR9XG5cdH1cbn1cblxuXG5jbGFzcyBUb2dnbGVJbXBvcnRGb2xkQWN0aW9uIGV4dGVuZHMgRm9sZGluZ0FjdGlvbjx2b2lkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IudG9nZ2xlSW1wb3J0Rm9sZCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMigndG9nZ2xlSW1wb3J0Rm9sZC5sYWJlbCcsIFwiVG9nZ2xlIEltcG9ydCBGb2xkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShmb2xkaW5nQ29udHJvbGxlcjogRm9sZGluZ0NvbnRyb2xsZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVnaW9uc1RvVG9nZ2xlOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0XHRjb25zdCByZWdpb25zID0gZm9sZGluZ01vZGVsLnJlZ2lvbnM7XG5cdFx0Zm9yIChsZXQgaSA9IHJlZ2lvbnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmIChyZWdpb25zLmdldFR5cGUoaSkgPT09IEZvbGRpbmdSYW5nZUtpbmQuSW1wb3J0cy52YWx1ZSkge1xuXHRcdFx0XHRyZWdpb25zVG9Ub2dnbGUucHVzaChyZWdpb25zLnRvUmVnaW9uKGkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9sZGluZ01vZGVsLnRvZ2dsZUNvbGxhcHNlU3RhdGUocmVnaW9uc1RvVG9nZ2xlKTtcblx0XHRmb2xkaW5nQ29udHJvbGxlci50cmlnZ2VyRm9sZGluZ01vZGVsQ2hhbmdlZCgpO1xuXHR9XG59XG5cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oRm9sZGluZ0NvbnRyb2xsZXIuSUQsIEZvbGRpbmdDb250cm9sbGVyLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkVhZ2VyKTsgLy8gZWFnZXIgYmVjYXVzZSBpdCB1c2VzIGBzYXZlVmlld1N0YXRlYC9gcmVzdG9yZVZpZXdTdGF0ZWBcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFVuZm9sZEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihVbkZvbGRSZWN1cnNpdmVseUFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihGb2xkQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEZvbGRSZWN1cnNpdmVseUFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihUb2dnbGVGb2xkUmVjdXJzaXZlbHlBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRm9sZEFsbEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihVbmZvbGRBbGxBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRm9sZEFsbEJsb2NrQ29tbWVudHNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRm9sZEFsbFJlZ2lvbnNBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oVW5mb2xkQWxsUmVnaW9uc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihGb2xkQWxsRXhjZXB0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFVuZm9sZEFsbEV4Y2VwdEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihUb2dnbGVGb2xkQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEdvdG9QYXJlbnRGb2xkQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEdvdG9QcmV2aW91c0ZvbGRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oR290b05leHRGb2xkQWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEZvbGRSYW5nZUZyb21TZWxlY3Rpb25BY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUmVtb3ZlRm9sZFJhbmdlRnJvbVNlbGVjdGlvbkFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihUb2dnbGVJbXBvcnRGb2xkQWN0aW9uKTtcblxuZm9yIChsZXQgaSA9IDE7IGkgPD0gNzsgaSsrKSB7XG5cdHJlZ2lzdGVySW5zdGFudGlhdGVkRWRpdG9yQWN0aW9uKFxuXHRcdG5ldyBGb2xkTGV2ZWxBY3Rpb24oe1xuXHRcdFx0aWQ6IEZvbGRMZXZlbEFjdGlvbi5JRChpKSxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdmb2xkTGV2ZWxBY3Rpb24ubGFiZWwnLCBcIkZvbGQgTGV2ZWwgezB9XCIsIGkpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0ZPTERJTkdfRU5BQkxFRCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgKEtleUNvZGUuRGlnaXQwICsgaSkpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pXG5cdCk7XG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfZXhlY3V0ZUZvbGRpbmdSYW5nZVByb3ZpZGVyJywgYXN5bmMgZnVuY3Rpb24gKGFjY2Vzc29yLCAuLi5hcmdzKSB7XG5cdGNvbnN0IFtyZXNvdXJjZV0gPSBhcmdzO1xuXHRpZiAoIShyZXNvdXJjZSBpbnN0YW5jZW9mIFVSSSkpIHtcblx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoKTtcblx0fVxuXG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cblx0Y29uc3QgbW9kZWwgPSBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSkuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRpZiAoIW1vZGVsKSB7XG5cdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCk7XG5cdH1cblxuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRpZiAoIWNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuZm9sZGluZycsIHsgcmVzb3VyY2UgfSkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRjb25zdCBzdHJhdGVneSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuZm9sZGluZ1N0cmF0ZWd5JywgeyByZXNvdXJjZSB9KTtcblx0Y29uc3QgZm9sZGluZ0xpbWl0UmVwb3J0ZXIgPSB7XG5cdFx0Z2V0IGxpbWl0KCkge1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ2VkaXRvci5mb2xkaW5nTWF4aW11bVJlZ2lvbnMnLCB7IHJlc291cmNlIH0pO1xuXHRcdH0sXG5cdFx0dXBkYXRlOiAoY29tcHV0ZWQ6IG51bWJlciwgbGltaXRlZDogbnVtYmVyIHwgZmFsc2UpID0+IHsgfVxuXHR9O1xuXG5cdGNvbnN0IGluZGVudFJhbmdlUHJvdmlkZXIgPSBuZXcgSW5kZW50UmFuZ2VQcm92aWRlcihtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgZm9sZGluZ0xpbWl0UmVwb3J0ZXIpO1xuXHRsZXQgcmFuZ2VQcm92aWRlcjogUmFuZ2VQcm92aWRlciA9IGluZGVudFJhbmdlUHJvdmlkZXI7XG5cdGlmIChzdHJhdGVneSAhPT0gJ2luZGVudGF0aW9uJykge1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IEZvbGRpbmdDb250cm9sbGVyLmdldEZvbGRpbmdSYW5nZVByb3ZpZGVycyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgbW9kZWwpO1xuXHRcdGlmIChwcm92aWRlcnMubGVuZ3RoKSB7XG5cdFx0XHRyYW5nZVByb3ZpZGVyID0gbmV3IFN5bnRheFJhbmdlUHJvdmlkZXIobW9kZWwsIHByb3ZpZGVycywgKCkgPT4geyB9LCBmb2xkaW5nTGltaXRSZXBvcnRlciwgaW5kZW50UmFuZ2VQcm92aWRlcik7XG5cdFx0fVxuXHR9XG5cdGNvbnN0IHJhbmdlcyA9IGF3YWl0IHJhbmdlUHJvdmlkZXIuY29tcHV0ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0Y29uc3QgcmVzdWx0OiBGb2xkaW5nUmFuZ2VbXSA9IFtdO1xuXHR0cnkge1xuXHRcdGlmIChyYW5nZXMpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmFuZ2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSByYW5nZXMuZ2V0VHlwZShpKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyBzdGFydDogcmFuZ2VzLmdldFN0YXJ0TGluZU51bWJlcihpKSwgZW5kOiByYW5nZXMuZ2V0RW5kTGluZU51bWJlcihpKSwga2luZDogdHlwZSA/IEZvbGRpbmdSYW5nZUtpbmQuZnJvbVZhbHVlKHR5cGUpIDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9IGZpbmFsbHkge1xuXHRcdHJhbmdlUHJvdmlkZXIuZGlzcG9zZSgpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBNEIseUJBQXlCLFNBQVMsd0JBQXdCO0FBQ3RGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUJBQWlCLHlCQUF5QjtBQUNuRCxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyw4QkFBOEI7QUFDdkMsWUFBWSxXQUFXO0FBQ3ZCLE9BQU87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
