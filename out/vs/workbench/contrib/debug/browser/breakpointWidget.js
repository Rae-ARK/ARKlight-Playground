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
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as lifecycle from "../../../../base/common/lifecycle.js";
import { URI as uri } from "../../../../base/common/uri.js";
import { EditorCommand, registerEditorCommand } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { CompletionOptions, provideSuggestionItems } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { ZoneWidget } from "../../../../editor/contrib/zoneWidget/browser/zoneWidget.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService, createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { defaultButtonStyles, defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { editorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, CONTEXT_IN_BREAKPOINT_WIDGET, BreakpointWidgetContext as Context, DEBUG_SCHEME, IDebugService } from "../common/debug.js";
import "./media/breakpointWidget.css";
const $ = dom.$;
const IPrivateBreakpointWidgetService = createDecorator("privateBreakpointWidgetService");
const DECORATION_KEY = "breakpointwidgetdecoration";
function isPositionInCurlyBracketBlock(input) {
  const model = input.getModel();
  const bracketPairs = model.bracketPairs.getBracketPairsInRange(Range.fromPositions(input.getPosition()));
  return bracketPairs.some((p) => p.openingBracketInfo.bracketText === "{");
}
function createDecorations(theme, placeHolder) {
  const transparentForeground = theme.getColor(editorForeground)?.transparent(0.4);
  return [{
    range: {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: 0,
      endColumn: 1
    },
    renderOptions: {
      after: {
        contentText: placeHolder,
        color: transparentForeground ? transparentForeground.toString() : void 0
      }
    }
  }];
}
let BreakpointWidget = class extends ZoneWidget {
  constructor(editor, lineNumber, column, context, contextViewService, debugService, themeService, instantiationService, modelService, codeEditorService, _configurationService, languageFeaturesService, keybindingService, labelService, textModelService, hoverService) {
    super(editor, { showFrame: true, showArrow: false, frameWidth: 1, isAccessible: true });
    this.lineNumber = lineNumber;
    this.column = column;
    this.contextViewService = contextViewService;
    this.debugService = debugService;
    this.themeService = themeService;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.codeEditorService = codeEditorService;
    this._configurationService = _configurationService;
    this.languageFeaturesService = languageFeaturesService;
    this.keybindingService = keybindingService;
    this.labelService = labelService;
    this.textModelService = textModelService;
    this.hoverService = hoverService;
    this.conditionInput = "";
    this.hitCountInput = "";
    this.logMessageInput = "";
    this.availableBreakpoints = [];
    this.store = new lifecycle.DisposableStore();
    const model = this.editor.getModel();
    if (model) {
      const uri2 = model.uri;
      const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber: this.lineNumber, column: this.column, uri: uri2 });
      this.breakpoint = breakpoints.length ? breakpoints[0] : void 0;
    }
    if (context === void 0) {
      if (this.breakpoint && !this.breakpoint.condition && !this.breakpoint.hitCondition && this.breakpoint.logMessage) {
        this.context = Context.LOG_MESSAGE;
      } else if (this.breakpoint && !this.breakpoint.condition && this.breakpoint.hitCondition) {
        this.context = Context.HIT_COUNT;
      } else if (this.breakpoint && this.breakpoint.triggeredBy) {
        this.context = Context.TRIGGER_POINT;
      } else {
        this.context = Context.CONDITION;
      }
    } else {
      this.context = context;
    }
    this.store.add(this.debugService.getModel().onDidChangeBreakpoints((e) => {
      if (this.breakpoint && e && e.removed && e.removed.indexOf(this.breakpoint) >= 0) {
        this.dispose();
      }
      if (this.context === Context.TRIGGER_POINT && this.selectBreakpointBox) {
        this.updateTriggerBreakpointList();
      }
    }));
    this.store.add(this.codeEditorService.registerDecorationType("breakpoint-widget", DECORATION_KEY, {}));
    this.create();
  }
  get placeholder() {
    const acceptString = this.keybindingService.lookupKeybinding(AcceptBreakpointWidgetInputAction.ID)?.getLabel() || "Enter";
    const closeString = this.keybindingService.lookupKeybinding(CloseBreakpointWidgetCommand.ID)?.getLabel() || "Escape";
    switch (this.context) {
      case Context.LOG_MESSAGE:
        return nls.localize("breakpointWidgetLogMessagePlaceholder", "Message to log when breakpoint is hit. Expressions within {} are interpolated. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
      case Context.HIT_COUNT:
        return nls.localize("breakpointWidgetHitCountPlaceholder", "Break when hit count condition is met. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
      default:
        return nls.localize("breakpointWidgetExpressionPlaceholder", "Break when expression evaluates to true. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
    }
  }
  getInputValue(breakpoint) {
    switch (this.context) {
      case Context.LOG_MESSAGE:
        return breakpoint && breakpoint.logMessage ? breakpoint.logMessage : this.logMessageInput;
      case Context.HIT_COUNT:
        return breakpoint && breakpoint.hitCondition ? breakpoint.hitCondition : this.hitCountInput;
      default:
        return breakpoint && breakpoint.condition ? breakpoint.condition : this.conditionInput;
    }
  }
  rememberInput() {
    if (this.context !== Context.TRIGGER_POINT) {
      const value = this.input.getModel().getValue();
      switch (this.context) {
        case Context.LOG_MESSAGE:
          this.logMessageInput = value;
          break;
        case Context.HIT_COUNT:
          this.hitCountInput = value;
          break;
        default:
          this.conditionInput = value;
      }
    }
  }
  setInputMode() {
    if (this.editor.hasModel()) {
      const languageId = this.context === Context.LOG_MESSAGE ? PLAINTEXT_LANGUAGE_ID : this.editor.getModel().getLanguageId();
      this.input.getModel().setLanguage(languageId);
    }
  }
  show(rangeOrPos) {
    const lineNum = this.input.getModel().getLineCount();
    super.show(rangeOrPos, lineNum + 1);
  }
  fitHeightToContent() {
    const lineNum = this.input.getModel().getLineCount();
    this._relayout(lineNum + 1);
  }
  _fillContainer(container) {
    this.setCssClass("breakpoint-widget");
    const selectBox = this.store.add(new SelectBox([
      { text: nls.localize("expression", "Expression") },
      { text: nls.localize("hitCount", "Hit Count") },
      { text: nls.localize("logMessage", "Log Message") },
      { text: nls.localize("triggeredBy", "Wait for Breakpoint") }
    ], this.context, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize("breakpointType", "Breakpoint Type"), useCustomDrawn: !hasNativeContextMenu(this._configurationService) }));
    this.selectContainer = $(".breakpoint-select-container");
    selectBox.render(dom.append(container, this.selectContainer));
    this.store.add(selectBox.onDidSelect((e) => {
      this.rememberInput();
      this.context = e.index;
      this.updateContextInput();
    }));
    this.createModesInput(container);
    this.inputContainer = $(".inputContainer");
    this.store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.inputContainer, this.placeholder));
    this.createBreakpointInput(dom.append(container, this.inputContainer));
    this.input.getModel().setValue(this.getInputValue(this.breakpoint));
    this.store.add(this.input.getModel().onDidChangeContent(() => {
      this.fitHeightToContent();
    }));
    this.input.setPosition({ lineNumber: 1, column: this.input.getModel().getLineMaxColumn(1) });
    this.createTriggerBreakpointInput(container);
    this.updateContextInput();
    setTimeout(() => this.focusInput(), 150);
  }
  createModesInput(container) {
    const modes = this.debugService.getModel().getBreakpointModes("source");
    if (modes.length <= 1) {
      return;
    }
    const sb = this.selectModeBox = new SelectBox(
      [
        { text: nls.localize("bpMode", "Mode"), isDisabled: true },
        ...modes.map((mode) => ({ text: mode.label, description: mode.description }))
      ],
      modes.findIndex((m) => m.mode === this.breakpoint?.mode) + 1,
      this.contextViewService,
      defaultSelectBoxStyles,
      { useCustomDrawn: !hasNativeContextMenu(this._configurationService) }
    );
    this.store.add(sb);
    this.store.add(sb.onDidSelect((e) => {
      this.modeInput = modes[e.index - 1];
    }));
    const modeWrapper = $(".select-mode-container");
    const selectionWrapper = $(".select-box-container");
    dom.append(modeWrapper, selectionWrapper);
    sb.render(selectionWrapper);
    dom.append(container, modeWrapper);
  }
  createTriggerBreakpointInput(container) {
    this.availableBreakpoints = this.debugService.getModel().getBreakpoints().filter((bp) => bp !== this.breakpoint && !bp.logMessage);
    const breakpointOptions = this.buildBreakpointOptions();
    const index = this.availableBreakpoints.findIndex((bp) => this.breakpoint?.triggeredBy === bp.getId());
    let selectedIndex = 0;
    if (index !== -1) {
      this.triggeredByBreakpointInput = this.availableBreakpoints[index];
      selectedIndex = index + 1;
    } else if (!this.breakpoint?.triggeredBy && this.availableBreakpoints.length > 0) {
      this.triggeredByBreakpointInput = this.availableBreakpoints[0];
      selectedIndex = 1;
    } else {
      this.triggeredByBreakpointInput = void 0;
    }
    const selectBreakpointBox = this.selectBreakpointBox = this.store.add(new SelectBox(breakpointOptions, selectedIndex, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize("selectBreakpoint", "Select breakpoint"), useCustomDrawn: !hasNativeContextMenu(this._configurationService) }));
    this.store.add(selectBreakpointBox.onDidSelect((e) => {
      if (e.index === 0) {
        this.triggeredByBreakpointInput = void 0;
      } else {
        this.triggeredByBreakpointInput = this.availableBreakpoints[e.index - 1];
      }
    }));
    this.selectBreakpointContainer = $(".select-breakpoint-container");
    this.store.add(dom.addDisposableListener(this.selectBreakpointContainer, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Escape)) {
        this.close(false);
      }
    }));
    const selectionWrapper = $(".select-box-container");
    dom.append(this.selectBreakpointContainer, selectionWrapper);
    selectBreakpointBox.render(selectionWrapper);
    dom.append(container, this.selectBreakpointContainer);
    const closeButton = new Button(this.selectBreakpointContainer, defaultButtonStyles);
    closeButton.label = nls.localize("ok", "OK");
    this.store.add(closeButton.onDidClick(() => this.close(true)));
    this.store.add(closeButton);
  }
  buildBreakpointOptions() {
    const breakpointOptions = [
      { text: nls.localize("noTriggerByBreakpoint", "None"), isDisabled: true },
      ...this.availableBreakpoints.map((bp) => ({
        text: `${this.labelService.getUriLabel(bp.uri, { relative: true })}: ${bp.lineNumber}`,
        description: nls.localize("triggerByLoading", "Loading...")
      }))
    ];
    for (const [i, bp] of this.availableBreakpoints.entries()) {
      this.textModelService.createModelReference(bp.uri).then((ref) => {
        try {
          breakpointOptions[i + 1].description = ref.object.textEditorModel.getLineContent(bp.lineNumber).trim();
        } finally {
          ref.dispose();
        }
      }).catch(() => {
        breakpointOptions[i + 1].description = nls.localize("noBpSource", "Could not load source.");
      });
    }
    return breakpointOptions;
  }
  updateTriggerBreakpointList() {
    this.availableBreakpoints = this.debugService.getModel().getBreakpoints().filter((bp) => bp !== this.breakpoint && !bp.logMessage);
    let selectedIndex = 0;
    if (this.triggeredByBreakpointInput) {
      const newIndex = this.availableBreakpoints.findIndex((bp) => bp.getId() === this.triggeredByBreakpointInput?.getId());
      if (newIndex !== -1) {
        selectedIndex = newIndex + 1;
      } else {
        this.triggeredByBreakpointInput = void 0;
      }
    }
    const breakpointOptions = this.buildBreakpointOptions();
    this.selectBreakpointBox.setOptions(breakpointOptions, selectedIndex);
  }
  updateContextInput() {
    if (this.context === Context.TRIGGER_POINT) {
      this.inputContainer.hidden = true;
      this.selectBreakpointContainer.hidden = false;
      if (this.selectBreakpointBox) {
        this.updateTriggerBreakpointList();
      }
    } else {
      this.inputContainer.hidden = false;
      this.selectBreakpointContainer.hidden = true;
      this.setInputMode();
      const value = this.getInputValue(this.breakpoint);
      this.input.getModel().setValue(value);
      this.focusInput();
    }
  }
  _doLayout(heightInPixel, widthInPixel) {
    this.heightInPx = heightInPixel;
    this.input.layout({ height: heightInPixel, width: widthInPixel - 113 });
    this.centerInputVertically();
  }
  _onWidth(widthInPixel) {
    if (typeof this.heightInPx === "number") {
      this._doLayout(this.heightInPx, widthInPixel);
    }
  }
  createBreakpointInput(container) {
    const scopedInstatiationService = this.instantiationService.createChild(new ServiceCollection(
      [IPrivateBreakpointWidgetService, this]
    ));
    this.store.add(scopedInstatiationService);
    const options = this.createEditorOptions();
    const codeEditorWidgetOptions = getSimpleCodeEditorWidgetOptions();
    this.input = scopedInstatiationService.createInstance(CodeEditorWidget, container, options, codeEditorWidgetOptions);
    CONTEXT_IN_BREAKPOINT_WIDGET.bindTo(this.input.contextKeyService).set(true);
    const model = this.modelService.createModel("", null, uri.parse(`${DEBUG_SCHEME}:${this.editor.getId()}:breakpointinput`), true);
    if (this.editor.hasModel()) {
      model.setLanguage(this.editor.getModel().getLanguageId());
    }
    this.input.setModel(model);
    this.setInputMode();
    this.store.add(model);
    const setDecorations = () => {
      const value = this.input.getModel().getValue();
      const decorations = !!value ? [] : createDecorations(this.themeService.getColorTheme(), this.placeholder);
      this.input.setDecorationsByType("breakpoint-widget", DECORATION_KEY, decorations);
    };
    this.store.add(this.input.getModel().onDidChangeContent(() => setDecorations()));
    this.store.add(this.themeService.onDidColorThemeChange(() => setDecorations()));
    this.store.add(this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, hasAccessToAllModels: true }, {
      _debugDisplayName: "breakpointWidget",
      provideCompletionItems: (model2, position, _context, token) => {
        let suggestionsPromise;
        const underlyingModel = this.editor.getModel();
        if (underlyingModel && (this.context === Context.CONDITION || this.context === Context.LOG_MESSAGE && isPositionInCurlyBracketBlock(this.input))) {
          suggestionsPromise = provideSuggestionItems(this.languageFeaturesService.completionProvider, underlyingModel, new Position(this.lineNumber, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(CompletionItemKind.Snippet)), _context, token).then((suggestions) => {
            let overwriteBefore = 0;
            if (this.context === Context.CONDITION) {
              overwriteBefore = position.column - 1;
            } else {
              const value = this.input.getModel().getValue();
              while (position.column - 2 - overwriteBefore >= 0 && value[position.column - 2 - overwriteBefore] !== "{" && value[position.column - 2 - overwriteBefore] !== " ") {
                overwriteBefore++;
              }
            }
            return {
              suggestions: suggestions.items.map((s) => {
                s.completion.range = Range.fromPositions(position.delta(0, -overwriteBefore), position);
                return s.completion;
              })
            };
          });
        } else {
          suggestionsPromise = Promise.resolve({ suggestions: [] });
        }
        return suggestionsPromise;
      }
    }));
    this.store.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.fontSize") || e.affectsConfiguration("editor.lineHeight")) {
        this.input.updateOptions(this.createEditorOptions());
        this.centerInputVertically();
      }
    }));
  }
  createEditorOptions() {
    const editorConfig = this._configurationService.getValue("editor");
    const options = getSimpleEditorOptions(this._configurationService);
    options.fontSize = editorConfig.fontSize;
    options.fontFamily = editorConfig.fontFamily;
    options.lineHeight = editorConfig.lineHeight;
    options.fontLigatures = editorConfig.fontLigatures;
    options.ariaLabel = this.placeholder;
    return options;
  }
  centerInputVertically() {
    if (this.container && typeof this.heightInPx === "number") {
      const lineHeight = this.input.getOption(EditorOption.lineHeight);
      const lineNum = this.input.getModel().getLineCount();
      const newTopMargin = (this.heightInPx - lineNum * lineHeight) / 2;
      this.inputContainer.style.marginTop = newTopMargin + "px";
    }
  }
  close(success) {
    if (success) {
      let condition = void 0;
      let hitCondition = void 0;
      let logMessage = void 0;
      let triggeredBy = void 0;
      let mode = void 0;
      let modeLabel = void 0;
      this.rememberInput();
      if (this.conditionInput || this.context === Context.CONDITION) {
        condition = this.conditionInput;
      }
      if (this.hitCountInput || this.context === Context.HIT_COUNT) {
        hitCondition = this.hitCountInput;
      }
      if (this.logMessageInput || this.context === Context.LOG_MESSAGE) {
        logMessage = this.logMessageInput;
      }
      if (this.selectModeBox) {
        mode = this.modeInput?.mode;
        modeLabel = this.modeInput?.label;
      }
      if (this.context === Context.TRIGGER_POINT) {
        condition = void 0;
        hitCondition = void 0;
        logMessage = void 0;
        triggeredBy = this.triggeredByBreakpointInput?.getId();
      }
      if (this.breakpoint) {
        const data = /* @__PURE__ */ new Map();
        data.set(this.breakpoint.getId(), {
          condition,
          hitCondition,
          logMessage,
          triggeredBy,
          mode,
          modeLabel
        });
        this.debugService.updateBreakpoints(this.breakpoint.originalUri, data, false).then(void 0, onUnexpectedError);
      } else {
        const model = this.editor.getModel();
        if (model) {
          this.debugService.addBreakpoints(model.uri, [{
            lineNumber: this.lineNumber,
            column: this.column,
            enabled: true,
            condition,
            hitCondition,
            logMessage,
            triggeredBy,
            mode,
            modeLabel
          }]);
        }
      }
    }
    this.dispose();
  }
  focusInput() {
    if (this.context === Context.TRIGGER_POINT) {
      this.selectBreakpointBox.focus();
    } else {
      this.input.focus();
    }
  }
  dispose() {
    super.dispose();
    this.input.dispose();
    lifecycle.dispose(this.store);
    setTimeout(() => this.editor.focus(), 0);
  }
};
BreakpointWidget = __decorateClass([
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IDebugService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IModelService),
  __decorateParam(9, ICodeEditorService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, ILanguageFeaturesService),
  __decorateParam(12, IKeybindingService),
  __decorateParam(13, ILabelService),
  __decorateParam(14, ITextModelService),
  __decorateParam(15, IHoverService)
], BreakpointWidget);
const _AcceptBreakpointWidgetInputAction = class _AcceptBreakpointWidgetInputAction extends EditorCommand {
  constructor() {
    super({
      id: _AcceptBreakpointWidgetInputAction.ID,
      precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
      kbOpts: {
        kbExpr: CONTEXT_IN_BREAKPOINT_WIDGET,
        primary: KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  runEditorCommand(accessor, editor) {
    accessor.get(IPrivateBreakpointWidgetService).close(true);
  }
};
_AcceptBreakpointWidgetInputAction.ID = "breakpointWidget.action.acceptInput";
let AcceptBreakpointWidgetInputAction = _AcceptBreakpointWidgetInputAction;
const _CloseBreakpointWidgetCommand = class _CloseBreakpointWidgetCommand extends EditorCommand {
  constructor() {
    super({
      id: _CloseBreakpointWidgetCommand.ID,
      precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyCode.Escape,
        secondary: [KeyMod.Shift | KeyCode.Escape],
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  runEditorCommand(accessor, editor, args) {
    const debugContribution = editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
    if (debugContribution) {
      return debugContribution.closeBreakpointWidget();
    }
    accessor.get(IPrivateBreakpointWidgetService).close(false);
  }
};
_CloseBreakpointWidgetCommand.ID = "closeBreakpointWidget";
let CloseBreakpointWidgetCommand = _CloseBreakpointWidgetCommand;
registerEditorCommand(new AcceptBreakpointWidgetInputAction());
registerEditorCommand(new CloseBreakpointWidgetCommand());
export {
  BreakpointWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvYnJlYWtwb2ludFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElTZWxlY3RPcHRpb25JdGVtLCBTZWxlY3RCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgKiBhcyBsaWZlY3ljbGUgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSBhcyB1cmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZUNvZGVFZGl0b3IsIElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb21tYW5kLCBTZXJ2aWNlc0FjY2Vzc29yLCByZWdpc3RlckVkaXRvckNvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkxpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25PcHRpb25zLCBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3QuanMnO1xuaW1wb3J0IHsgWm9uZVdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3pvbmVXaWRnZXQvYnJvd3Nlci96b25lV2lkZ2V0LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdFNlbGVjdEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBlZGl0b3JGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhc05hdGl2ZUNvbnRleHRNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgZ2V0U2ltcGxlQ29kZUVkaXRvcldpZGdldE9wdGlvbnMsIGdldFNpbXBsZUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2ltcGxlRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBCUkVBS1BPSU5UX0VESVRPUl9DT05UUklCVVRJT05fSUQsIENPTlRFWFRfQlJFQUtQT0lOVF9XSURHRVRfVklTSUJMRSwgQ09OVEVYVF9JTl9CUkVBS1BPSU5UX1dJREdFVCwgQnJlYWtwb2ludFdpZGdldENvbnRleHQgYXMgQ29udGV4dCwgREVCVUdfU0NIRU1FLCBJQnJlYWtwb2ludCwgSUJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24sIElCcmVha3BvaW50VXBkYXRlRGF0YSwgSURlYnVnU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvYnJlYWtwb2ludFdpZGdldC5jc3MnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5jb25zdCBJUHJpdmF0ZUJyZWFrcG9pbnRXaWRnZXRTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElQcml2YXRlQnJlYWtwb2ludFdpZGdldFNlcnZpY2U+KCdwcml2YXRlQnJlYWtwb2ludFdpZGdldFNlcnZpY2UnKTtcbmludGVyZmFjZSBJUHJpdmF0ZUJyZWFrcG9pbnRXaWRnZXRTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRjbG9zZShzdWNjZXNzOiBib29sZWFuKTogdm9pZDtcbn1cbmNvbnN0IERFQ09SQVRJT05fS0VZID0gJ2JyZWFrcG9pbnR3aWRnZXRkZWNvcmF0aW9uJztcblxuZnVuY3Rpb24gaXNQb3NpdGlvbkluQ3VybHlCcmFja2V0QmxvY2soaW5wdXQ6IElBY3RpdmVDb2RlRWRpdG9yKTogYm9vbGVhbiB7XG5cdGNvbnN0IG1vZGVsID0gaW5wdXQuZ2V0TW9kZWwoKTtcblx0Y29uc3QgYnJhY2tldFBhaXJzID0gbW9kZWwuYnJhY2tldFBhaXJzLmdldEJyYWNrZXRQYWlyc0luUmFuZ2UoUmFuZ2UuZnJvbVBvc2l0aW9ucyhpbnB1dC5nZXRQb3NpdGlvbigpKSk7XG5cdHJldHVybiBicmFja2V0UGFpcnMuc29tZShwID0+IHAub3BlbmluZ0JyYWNrZXRJbmZvLmJyYWNrZXRUZXh0ID09PSAneycpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVEZWNvcmF0aW9ucyh0aGVtZTogSUNvbG9yVGhlbWUsIHBsYWNlSG9sZGVyOiBzdHJpbmcpOiBJRGVjb3JhdGlvbk9wdGlvbnNbXSB7XG5cdGNvbnN0IHRyYW5zcGFyZW50Rm9yZWdyb3VuZCA9IHRoZW1lLmdldENvbG9yKGVkaXRvckZvcmVncm91bmQpPy50cmFuc3BhcmVudCgwLjQpO1xuXHRyZXR1cm4gW3tcblx0XHRyYW5nZToge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAwLFxuXHRcdFx0ZW5kTGluZU51bWJlcjogMCxcblx0XHRcdHN0YXJ0Q29sdW1uOiAwLFxuXHRcdFx0ZW5kQ29sdW1uOiAxXG5cdFx0fSxcblx0XHRyZW5kZXJPcHRpb25zOiB7XG5cdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRjb250ZW50VGV4dDogcGxhY2VIb2xkZXIsXG5cdFx0XHRcdGNvbG9yOiB0cmFuc3BhcmVudEZvcmVncm91bmQgPyB0cmFuc3BhcmVudEZvcmVncm91bmQudG9TdHJpbmcoKSA6IHVuZGVmaW5lZFxuXHRcdFx0fVxuXHRcdH1cblx0fV07XG59XG5cbmV4cG9ydCBjbGFzcyBCcmVha3BvaW50V2lkZ2V0IGV4dGVuZHMgWm9uZVdpZGdldCBpbXBsZW1lbnRzIElQcml2YXRlQnJlYWtwb2ludFdpZGdldFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHNlbGVjdENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGlucHV0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VsZWN0QnJlYWtwb2ludENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGlucHV0ITogSUFjdGl2ZUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgc2VsZWN0QnJlYWtwb2ludEJveCE6IFNlbGVjdEJveDtcblx0cHJpdmF0ZSBzZWxlY3RNb2RlQm94PzogU2VsZWN0Qm94O1xuXHRwcml2YXRlIHN0b3JlOiBsaWZlY3ljbGUuRGlzcG9zYWJsZVN0b3JlO1xuXHRwcml2YXRlIGNvbmRpdGlvbklucHV0ID0gJyc7XG5cdHByaXZhdGUgaGl0Q291bnRJbnB1dCA9ICcnO1xuXHRwcml2YXRlIGxvZ01lc3NhZ2VJbnB1dCA9ICcnO1xuXHRwcml2YXRlIG1vZGVJbnB1dD86IERlYnVnUHJvdG9jb2wuQnJlYWtwb2ludE1vZGU7XG5cdHByaXZhdGUgYnJlYWtwb2ludDogSUJyZWFrcG9pbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGV4dDogQ29udGV4dDtcblx0cHJpdmF0ZSBoZWlnaHRJblB4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdHJpZ2dlcmVkQnlCcmVha3BvaW50SW5wdXQ6IElCcmVha3BvaW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGF2YWlsYWJsZUJyZWFrcG9pbnRzOiBJQnJlYWtwb2ludFtdID0gW107XG5cblx0Y29uc3RydWN0b3IoZWRpdG9yOiBJQ29kZUVkaXRvciwgcHJpdmF0ZSBsaW5lTnVtYmVyOiBudW1iZXIsIHByaXZhdGUgY29sdW1uOiBudW1iZXIgfCB1bmRlZmluZWQsIGNvbnRleHQ6IENvbnRleHQgfCB1bmRlZmluZWQsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvciwgeyBzaG93RnJhbWU6IHRydWUsIHNob3dBcnJvdzogZmFsc2UsIGZyYW1lV2lkdGg6IDEsIGlzQWNjZXNzaWJsZTogdHJ1ZSB9KTtcblxuXHRcdHRoaXMuc3RvcmUgPSBuZXcgbGlmZWN5Y2xlLkRpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdGNvbnN0IHVyaSA9IG1vZGVsLnVyaTtcblx0XHRcdGNvbnN0IGJyZWFrcG9pbnRzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cyh7IGxpbmVOdW1iZXI6IHRoaXMubGluZU51bWJlciwgY29sdW1uOiB0aGlzLmNvbHVtbiwgdXJpIH0pO1xuXHRcdFx0dGhpcy5icmVha3BvaW50ID0gYnJlYWtwb2ludHMubGVuZ3RoID8gYnJlYWtwb2ludHNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKHRoaXMuYnJlYWtwb2ludCAmJiAhdGhpcy5icmVha3BvaW50LmNvbmRpdGlvbiAmJiAhdGhpcy5icmVha3BvaW50LmhpdENvbmRpdGlvbiAmJiB0aGlzLmJyZWFrcG9pbnQubG9nTWVzc2FnZSkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHQgPSBDb250ZXh0LkxPR19NRVNTQUdFO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmJyZWFrcG9pbnQgJiYgIXRoaXMuYnJlYWtwb2ludC5jb25kaXRpb24gJiYgdGhpcy5icmVha3BvaW50LmhpdENvbmRpdGlvbikge1xuXHRcdFx0XHR0aGlzLmNvbnRleHQgPSBDb250ZXh0LkhJVF9DT1VOVDtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5icmVha3BvaW50ICYmIHRoaXMuYnJlYWtwb2ludC50cmlnZ2VyZWRCeSkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHQgPSBDb250ZXh0LlRSSUdHRVJfUE9JTlQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNvbnRleHQgPSBDb250ZXh0LkNPTkRJVElPTjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb250ZXh0ID0gY29udGV4dDtcblx0XHR9XG5cblx0XHR0aGlzLnN0b3JlLmFkZCh0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLm9uRGlkQ2hhbmdlQnJlYWtwb2ludHMoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5icmVha3BvaW50ICYmIGUgJiYgZS5yZW1vdmVkICYmIGUucmVtb3ZlZC5pbmRleE9mKHRoaXMuYnJlYWtwb2ludCkgPj0gMCkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdC8vIFVwZGF0ZSB0aGUgYnJlYWtwb2ludCBsaXN0IHdoZW4gaW4gdHJpZ2dlciBwb2ludCBjb250ZXh0XG5cdFx0XHRpZiAodGhpcy5jb250ZXh0ID09PSBDb250ZXh0LlRSSUdHRVJfUE9JTlQgJiYgdGhpcy5zZWxlY3RCcmVha3BvaW50Qm94KSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVHJpZ2dlckJyZWFrcG9pbnRMaXN0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKHRoaXMuY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZSgnYnJlYWtwb2ludC13aWRnZXQnLCBERUNPUkFUSU9OX0tFWSwge30pKTtcblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCBwbGFjZWhvbGRlcigpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGFjY2VwdFN0cmluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2NlcHRCcmVha3BvaW50V2lkZ2V0SW5wdXRBY3Rpb24uSUQpPy5nZXRMYWJlbCgpIHx8ICdFbnRlcic7XG5cdFx0Y29uc3QgY2xvc2VTdHJpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQ2xvc2VCcmVha3BvaW50V2lkZ2V0Q29tbWFuZC5JRCk/LmdldExhYmVsKCkgfHwgJ0VzY2FwZSc7XG5cdFx0c3dpdGNoICh0aGlzLmNvbnRleHQpIHtcblx0XHRcdGNhc2UgQ29udGV4dC5MT0dfTUVTU0FHRTpcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYnJlYWtwb2ludFdpZGdldExvZ01lc3NhZ2VQbGFjZWhvbGRlcicsIFwiTWVzc2FnZSB0byBsb2cgd2hlbiBicmVha3BvaW50IGlzIGhpdC4gRXhwcmVzc2lvbnMgd2l0aGluIHt9IGFyZSBpbnRlcnBvbGF0ZWQuICd7MH0nIHRvIGFjY2VwdCwgJ3sxfScgdG8gY2FuY2VsLlwiLCBhY2NlcHRTdHJpbmcsIGNsb3NlU3RyaW5nKTtcblx0XHRcdGNhc2UgQ29udGV4dC5ISVRfQ09VTlQ6XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2JyZWFrcG9pbnRXaWRnZXRIaXRDb3VudFBsYWNlaG9sZGVyJywgXCJCcmVhayB3aGVuIGhpdCBjb3VudCBjb25kaXRpb24gaXMgbWV0LiAnezB9JyB0byBhY2NlcHQsICd7MX0nIHRvIGNhbmNlbC5cIiwgYWNjZXB0U3RyaW5nLCBjbG9zZVN0cmluZyk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdicmVha3BvaW50V2lkZ2V0RXhwcmVzc2lvblBsYWNlaG9sZGVyJywgXCJCcmVhayB3aGVuIGV4cHJlc3Npb24gZXZhbHVhdGVzIHRvIHRydWUuICd7MH0nIHRvIGFjY2VwdCwgJ3sxfScgdG8gY2FuY2VsLlwiLCBhY2NlcHRTdHJpbmcsIGNsb3NlU3RyaW5nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldElucHV0VmFsdWUoYnJlYWtwb2ludDogSUJyZWFrcG9pbnQgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodGhpcy5jb250ZXh0KSB7XG5cdFx0XHRjYXNlIENvbnRleHQuTE9HX01FU1NBR0U6XG5cdFx0XHRcdHJldHVybiBicmVha3BvaW50ICYmIGJyZWFrcG9pbnQubG9nTWVzc2FnZSA/IGJyZWFrcG9pbnQubG9nTWVzc2FnZSA6IHRoaXMubG9nTWVzc2FnZUlucHV0O1xuXHRcdFx0Y2FzZSBDb250ZXh0LkhJVF9DT1VOVDpcblx0XHRcdFx0cmV0dXJuIGJyZWFrcG9pbnQgJiYgYnJlYWtwb2ludC5oaXRDb25kaXRpb24gPyBicmVha3BvaW50LmhpdENvbmRpdGlvbiA6IHRoaXMuaGl0Q291bnRJbnB1dDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBicmVha3BvaW50ICYmIGJyZWFrcG9pbnQuY29uZGl0aW9uID8gYnJlYWtwb2ludC5jb25kaXRpb24gOiB0aGlzLmNvbmRpdGlvbklucHV0O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtZW1iZXJJbnB1dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jb250ZXh0ICE9PSBDb250ZXh0LlRSSUdHRVJfUE9JTlQpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5pbnB1dC5nZXRNb2RlbCgpLmdldFZhbHVlKCk7XG5cdFx0XHRzd2l0Y2ggKHRoaXMuY29udGV4dCkge1xuXHRcdFx0XHRjYXNlIENvbnRleHQuTE9HX01FU1NBR0U6XG5cdFx0XHRcdFx0dGhpcy5sb2dNZXNzYWdlSW5wdXQgPSB2YWx1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDb250ZXh0LkhJVF9DT1VOVDpcblx0XHRcdFx0XHR0aGlzLmhpdENvdW50SW5wdXQgPSB2YWx1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHR0aGlzLmNvbmRpdGlvbklucHV0ID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRJbnB1dE1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdC8vIFVzZSBwbGFpbnRleHQgbGFuZ3VhZ2UgZm9yIGxvZyBtZXNzYWdlcywgb3RoZXJ3aXNlIHJlc3BlY3QgdW5kZXJseWluZyBlZGl0b3IgbGFuZ3VhZ2UgIzEyNTYxOVxuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMuY29udGV4dCA9PT0gQ29udGV4dC5MT0dfTUVTU0FHRSA/IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCA6IHRoaXMuZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0dGhpcy5pbnB1dC5nZXRNb2RlbCgpLnNldExhbmd1YWdlKGxhbmd1YWdlSWQpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHNob3cocmFuZ2VPclBvczogSVJhbmdlIHwgSVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgbGluZU51bSA9IHRoaXMuaW5wdXQuZ2V0TW9kZWwoKS5nZXRMaW5lQ291bnQoKTtcblx0XHRzdXBlci5zaG93KHJhbmdlT3JQb3MsIGxpbmVOdW0gKyAxKTtcblx0fVxuXG5cdGZpdEhlaWdodFRvQ29udGVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBsaW5lTnVtID0gdGhpcy5pbnB1dC5nZXRNb2RlbCgpLmdldExpbmVDb3VudCgpO1xuXHRcdHRoaXMuX3JlbGF5b3V0KGxpbmVOdW0gKyAxKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZmlsbENvbnRhaW5lcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5zZXRDc3NDbGFzcygnYnJlYWtwb2ludC13aWRnZXQnKTtcblx0XHRjb25zdCBzZWxlY3RCb3ggPSB0aGlzLnN0b3JlLmFkZChuZXcgU2VsZWN0Qm94KFtcblx0XHRcdHsgdGV4dDogbmxzLmxvY2FsaXplKCdleHByZXNzaW9uJywgXCJFeHByZXNzaW9uXCIpIH0sXG5cdFx0XHR7IHRleHQ6IG5scy5sb2NhbGl6ZSgnaGl0Q291bnQnLCBcIkhpdCBDb3VudFwiKSB9LFxuXHRcdFx0eyB0ZXh0OiBubHMubG9jYWxpemUoJ2xvZ01lc3NhZ2UnLCBcIkxvZyBNZXNzYWdlXCIpIH0sXG5cdFx0XHR7IHRleHQ6IG5scy5sb2NhbGl6ZSgndHJpZ2dlcmVkQnknLCBcIldhaXQgZm9yIEJyZWFrcG9pbnRcIikgfSxcblx0XHRdIHNhdGlzZmllcyBJU2VsZWN0T3B0aW9uSXRlbVtdLCB0aGlzLmNvbnRleHQsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLCB7IGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCdicmVha3BvaW50VHlwZScsICdCcmVha3BvaW50IFR5cGUnKSwgdXNlQ3VzdG9tRHJhd246ICFoYXNOYXRpdmVDb250ZXh0TWVudSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkgfSkpO1xuXHRcdHRoaXMuc2VsZWN0Q29udGFpbmVyID0gJCgnLmJyZWFrcG9pbnQtc2VsZWN0LWNvbnRhaW5lcicpO1xuXHRcdHNlbGVjdEJveC5yZW5kZXIoZG9tLmFwcGVuZChjb250YWluZXIsIHRoaXMuc2VsZWN0Q29udGFpbmVyKSk7XG5cdFx0dGhpcy5zdG9yZS5hZGQoc2VsZWN0Qm94Lm9uRGlkU2VsZWN0KGUgPT4ge1xuXHRcdFx0dGhpcy5yZW1lbWJlcklucHV0KCk7XG5cdFx0XHR0aGlzLmNvbnRleHQgPSBlLmluZGV4O1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZXh0SW5wdXQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmNyZWF0ZU1vZGVzSW5wdXQoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuaW5wdXRDb250YWluZXIgPSAkKCcuaW5wdXRDb250YWluZXInKTtcblx0XHR0aGlzLnN0b3JlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGhpcy5pbnB1dENvbnRhaW5lciwgdGhpcy5wbGFjZWhvbGRlcikpO1xuXHRcdHRoaXMuY3JlYXRlQnJlYWtwb2ludElucHV0KGRvbS5hcHBlbmQoY29udGFpbmVyLCB0aGlzLmlucHV0Q29udGFpbmVyKSk7XG5cblx0XHR0aGlzLmlucHV0LmdldE1vZGVsKCkuc2V0VmFsdWUodGhpcy5nZXRJbnB1dFZhbHVlKHRoaXMuYnJlYWtwb2ludCkpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKHRoaXMuaW5wdXQuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5maXRIZWlnaHRUb0NvbnRlbnQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5pbnB1dC5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogdGhpcy5pbnB1dC5nZXRNb2RlbCgpLmdldExpbmVNYXhDb2x1bW4oMSkgfSk7XG5cblx0XHR0aGlzLmNyZWF0ZVRyaWdnZXJCcmVha3BvaW50SW5wdXQoY29udGFpbmVyKTtcblxuXHRcdHRoaXMudXBkYXRlQ29udGV4dElucHV0KCk7XG5cdFx0Ly8gRHVlIHRvIGFuIGVsZWN0cm9uIGJ1ZyB3ZSBoYXZlIHRvIGRvIHRoZSB0aW1lb3V0LCBvdGhlcndpc2Ugd2UgZG8gbm90IGdldCBmb2N1c1xuXHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5mb2N1c0lucHV0KCksIDE1MCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1vZGVzSW5wdXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IG1vZGVzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50TW9kZXMoJ3NvdXJjZScpO1xuXHRcdGlmIChtb2Rlcy5sZW5ndGggPD0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNiID0gdGhpcy5zZWxlY3RNb2RlQm94ID0gbmV3IFNlbGVjdEJveChcblx0XHRcdFtcblx0XHRcdFx0eyB0ZXh0OiBubHMubG9jYWxpemUoJ2JwTW9kZScsICdNb2RlJyksIGlzRGlzYWJsZWQ6IHRydWUgfSxcblx0XHRcdFx0Li4ubW9kZXMubWFwKG1vZGUgPT4gKHsgdGV4dDogbW9kZS5sYWJlbCwgZGVzY3JpcHRpb246IG1vZGUuZGVzY3JpcHRpb24gfSkpLFxuXHRcdFx0XSxcblx0XHRcdG1vZGVzLmZpbmRJbmRleChtID0+IG0ubW9kZSA9PT0gdGhpcy5icmVha3BvaW50Py5tb2RlKSArIDEsXG5cdFx0XHR0aGlzLmNvbnRleHRWaWV3U2VydmljZSxcblx0XHRcdGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsXG5cdFx0XHR7IHVzZUN1c3RvbURyYXduOiAhaGFzTmF0aXZlQ29udGV4dE1lbnUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpIH1cblx0XHQpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKHNiKTtcblx0XHR0aGlzLnN0b3JlLmFkZChzYi5vbkRpZFNlbGVjdChlID0+IHtcblx0XHRcdHRoaXMubW9kZUlucHV0ID0gbW9kZXNbZS5pbmRleCAtIDFdO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVXcmFwcGVyID0gJCgnLnNlbGVjdC1tb2RlLWNvbnRhaW5lcicpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbldyYXBwZXIgPSAkKCcuc2VsZWN0LWJveC1jb250YWluZXInKTtcblx0XHRkb20uYXBwZW5kKG1vZGVXcmFwcGVyLCBzZWxlY3Rpb25XcmFwcGVyKTtcblx0XHRzYi5yZW5kZXIoc2VsZWN0aW9uV3JhcHBlcik7XG5cdFx0ZG9tLmFwcGVuZChjb250YWluZXIsIG1vZGVXcmFwcGVyKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVHJpZ2dlckJyZWFrcG9pbnRJbnB1dChjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0dGhpcy5hdmFpbGFibGVCcmVha3BvaW50cyA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkuZ2V0QnJlYWtwb2ludHMoKS5maWx0ZXIoYnAgPT4gYnAgIT09IHRoaXMuYnJlYWtwb2ludCAmJiAhYnAubG9nTWVzc2FnZSk7XG5cdFx0Y29uc3QgYnJlYWtwb2ludE9wdGlvbnMgPSB0aGlzLmJ1aWxkQnJlYWtwb2ludE9wdGlvbnMoKTtcblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5hdmFpbGFibGVCcmVha3BvaW50cy5maW5kSW5kZXgoYnAgPT4gdGhpcy5icmVha3BvaW50Py50cmlnZ2VyZWRCeSA9PT0gYnAuZ2V0SWQoKSk7XG5cblx0XHRsZXQgc2VsZWN0ZWRJbmRleCA9IDA7XG5cblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJlZEJ5QnJlYWtwb2ludElucHV0ID0gdGhpcy5hdmFpbGFibGVCcmVha3BvaW50c1tpbmRleF07XG5cdFx0XHRzZWxlY3RlZEluZGV4ID0gaW5kZXggKyAxO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuYnJlYWtwb2ludD8udHJpZ2dlcmVkQnkgJiYgdGhpcy5hdmFpbGFibGVCcmVha3BvaW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJlZEJ5QnJlYWtwb2ludElucHV0ID0gdGhpcy5hdmFpbGFibGVCcmVha3BvaW50c1swXTtcblx0XHRcdHNlbGVjdGVkSW5kZXggPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJlZEJ5QnJlYWtwb2ludElucHV0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdEJyZWFrcG9pbnRCb3ggPSB0aGlzLnNlbGVjdEJyZWFrcG9pbnRCb3ggPSB0aGlzLnN0b3JlLmFkZChuZXcgU2VsZWN0Qm94KGJyZWFrcG9pbnRPcHRpb25zLCBzZWxlY3RlZEluZGV4LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwgZGVmYXVsdFNlbGVjdEJveFN0eWxlcywgeyBhcmlhTGFiZWw6IG5scy5sb2NhbGl6ZSgnc2VsZWN0QnJlYWtwb2ludCcsICdTZWxlY3QgYnJlYWtwb2ludCcpLCB1c2VDdXN0b21EcmF3bjogIWhhc05hdGl2ZUNvbnRleHRNZW51KHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSB9KSk7XG5cdFx0dGhpcy5zdG9yZS5hZGQoc2VsZWN0QnJlYWtwb2ludEJveC5vbkRpZFNlbGVjdChlID0+IHtcblx0XHRcdGlmIChlLmluZGV4ID09PSAwKSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcmVkQnlCcmVha3BvaW50SW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJlZEJ5QnJlYWtwb2ludElucHV0ID0gdGhpcy5hdmFpbGFibGVCcmVha3BvaW50c1tlLmluZGV4IC0gMV07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuc2VsZWN0QnJlYWtwb2ludENvbnRhaW5lciA9ICQoJy5zZWxlY3QtYnJlYWtwb2ludC1jb250YWluZXInKTtcblx0XHR0aGlzLnN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc2VsZWN0QnJlYWtwb2ludENvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHR0aGlzLmNsb3NlKGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb25XcmFwcGVyID0gJCgnLnNlbGVjdC1ib3gtY29udGFpbmVyJyk7XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLnNlbGVjdEJyZWFrcG9pbnRDb250YWluZXIsIHNlbGVjdGlvbldyYXBwZXIpO1xuXHRcdHNlbGVjdEJyZWFrcG9pbnRCb3gucmVuZGVyKHNlbGVjdGlvbldyYXBwZXIpO1xuXG5cdFx0ZG9tLmFwcGVuZChjb250YWluZXIsIHRoaXMuc2VsZWN0QnJlYWtwb2ludENvbnRhaW5lcik7XG5cblx0XHRjb25zdCBjbG9zZUJ1dHRvbiA9IG5ldyBCdXR0b24odGhpcy5zZWxlY3RCcmVha3BvaW50Q29udGFpbmVyLCBkZWZhdWx0QnV0dG9uU3R5bGVzKTtcblx0XHRjbG9zZUJ1dHRvbi5sYWJlbCA9IG5scy5sb2NhbGl6ZSgnb2snLCBcIk9LXCIpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKGNsb3NlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5jbG9zZSh0cnVlKSkpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKGNsb3NlQnV0dG9uKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRCcmVha3BvaW50T3B0aW9ucygpOiBJU2VsZWN0T3B0aW9uSXRlbVtdIHtcblx0XHRjb25zdCBicmVha3BvaW50T3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSA9IFtcblx0XHRcdHsgdGV4dDogbmxzLmxvY2FsaXplKCdub1RyaWdnZXJCeUJyZWFrcG9pbnQnLCAnTm9uZScpLCBpc0Rpc2FibGVkOiB0cnVlIH0sXG5cdFx0XHQuLi50aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzLm1hcChicCA9PiAoe1xuXHRcdFx0XHR0ZXh0OiBgJHt0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChicC51cmksIHsgcmVsYXRpdmU6IHRydWUgfSl9OiAke2JwLmxpbmVOdW1iZXJ9YCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndHJpZ2dlckJ5TG9hZGluZycsICdMb2FkaW5nLi4uJylcblx0XHRcdH0pKSxcblx0XHRdO1xuXG5cdFx0Ly8gTG9hZCB0aGUgc291cmNlIGNvZGUgZm9yIGVhY2ggYnJlYWtwb2ludCBhc3luY2hyb25vdXNseVxuXHRcdGZvciAoY29uc3QgW2ksIGJwXSBvZiB0aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzLmVudHJpZXMoKSkge1xuXHRcdFx0dGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGJwLnVyaSkudGhlbihyZWYgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGJyZWFrcG9pbnRPcHRpb25zW2kgKyAxXS5kZXNjcmlwdGlvbiA9IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLmdldExpbmVDb250ZW50KGJwLmxpbmVOdW1iZXIpLnRyaW0oKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KS5jYXRjaCgoKSA9PiB7XG5cdFx0XHRcdGJyZWFrcG9pbnRPcHRpb25zW2kgKyAxXS5kZXNjcmlwdGlvbiA9IG5scy5sb2NhbGl6ZSgnbm9CcFNvdXJjZScsICdDb3VsZCBub3QgbG9hZCBzb3VyY2UuJyk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYnJlYWtwb2ludE9wdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRyaWdnZXJCcmVha3BvaW50TGlzdCgpOiB2b2lkIHtcblx0XHR0aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cygpLmZpbHRlcihicCA9PiBicCAhPT0gdGhpcy5icmVha3BvaW50ICYmICFicC5sb2dNZXNzYWdlKTtcblxuXHRcdGxldCBzZWxlY3RlZEluZGV4ID0gMDtcblxuXHRcdGlmICh0aGlzLnRyaWdnZXJlZEJ5QnJlYWtwb2ludElucHV0KSB7XG5cdFx0XHRjb25zdCBuZXdJbmRleCA9IHRoaXMuYXZhaWxhYmxlQnJlYWtwb2ludHMuZmluZEluZGV4KGJwID0+IGJwLmdldElkKCkgPT09IHRoaXMudHJpZ2dlcmVkQnlCcmVha3BvaW50SW5wdXQ/LmdldElkKCkpO1xuXHRcdFx0aWYgKG5ld0luZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRzZWxlY3RlZEluZGV4ID0gbmV3SW5kZXggKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50cmlnZ2VyZWRCeUJyZWFrcG9pbnRJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBicmVha3BvaW50T3B0aW9ucyA9IHRoaXMuYnVpbGRCcmVha3BvaW50T3B0aW9ucygpO1xuXHRcdHRoaXMuc2VsZWN0QnJlYWtwb2ludEJveC5zZXRPcHRpb25zKGJyZWFrcG9pbnRPcHRpb25zLCBzZWxlY3RlZEluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGV4dElucHV0KCkge1xuXHRcdGlmICh0aGlzLmNvbnRleHQgPT09IENvbnRleHQuVFJJR0dFUl9QT0lOVCkge1xuXHRcdFx0dGhpcy5pbnB1dENvbnRhaW5lci5oaWRkZW4gPSB0cnVlO1xuXHRcdFx0dGhpcy5zZWxlY3RCcmVha3BvaW50Q29udGFpbmVyLmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0Ly8gVXBkYXRlIHRoZSBicmVha3BvaW50IGxpc3Qgd2hlbiBzd2l0Y2hpbmcgdG8gdHJpZ2dlciBwb2ludCBjb250ZXh0XG5cdFx0XHRpZiAodGhpcy5zZWxlY3RCcmVha3BvaW50Qm94KSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVHJpZ2dlckJyZWFrcG9pbnRMaXN0KCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaW5wdXRDb250YWluZXIuaGlkZGVuID0gZmFsc2U7XG5cdFx0XHR0aGlzLnNlbGVjdEJyZWFrcG9pbnRDb250YWluZXIuaGlkZGVuID0gdHJ1ZTtcblx0XHRcdHRoaXMuc2V0SW5wdXRNb2RlKCk7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuZ2V0SW5wdXRWYWx1ZSh0aGlzLmJyZWFrcG9pbnQpO1xuXHRcdFx0dGhpcy5pbnB1dC5nZXRNb2RlbCgpLnNldFZhbHVlKHZhbHVlKTtcblx0XHRcdHRoaXMuZm9jdXNJbnB1dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZG9MYXlvdXQoaGVpZ2h0SW5QaXhlbDogbnVtYmVyLCB3aWR0aEluUGl4ZWw6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuaGVpZ2h0SW5QeCA9IGhlaWdodEluUGl4ZWw7XG5cdFx0dGhpcy5pbnB1dC5sYXlvdXQoeyBoZWlnaHQ6IGhlaWdodEluUGl4ZWwsIHdpZHRoOiB3aWR0aEluUGl4ZWwgLSAxMTMgfSk7XG5cdFx0dGhpcy5jZW50ZXJJbnB1dFZlcnRpY2FsbHkoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25XaWR0aCh3aWR0aEluUGl4ZWw6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5oZWlnaHRJblB4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5fZG9MYXlvdXQodGhpcy5oZWlnaHRJblB4LCB3aWR0aEluUGl4ZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQnJlYWtwb2ludElucHV0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzY29wZWRJbnN0YXRpYXRpb25TZXJ2aWNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSVByaXZhdGVCcmVha3BvaW50V2lkZ2V0U2VydmljZSwgdGhpc11cblx0XHQpKTtcblx0XHR0aGlzLnN0b3JlLmFkZChzY29wZWRJbnN0YXRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmNyZWF0ZUVkaXRvck9wdGlvbnMoKTtcblx0XHRjb25zdCBjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyA9IGdldFNpbXBsZUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zKCk7XG5cdFx0dGhpcy5pbnB1dCA9IDxJQWN0aXZlQ29kZUVkaXRvcj5zY29wZWRJbnN0YXRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIGNvbnRhaW5lciwgb3B0aW9ucywgY29kZUVkaXRvcldpZGdldE9wdGlvbnMpO1xuXG5cdFx0Q09OVEVYVF9JTl9CUkVBS1BPSU5UX1dJREdFVC5iaW5kVG8odGhpcy5pbnB1dC5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIG51bGwsIHVyaS5wYXJzZShgJHtERUJVR19TQ0hFTUV9OiR7dGhpcy5lZGl0b3IuZ2V0SWQoKX06YnJlYWtwb2ludGlucHV0YCksIHRydWUpO1xuXHRcdGlmICh0aGlzLmVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRtb2RlbC5zZXRMYW5ndWFnZSh0aGlzLmVkaXRvci5nZXRNb2RlbCgpLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0fVxuXHRcdHRoaXMuaW5wdXQuc2V0TW9kZWwobW9kZWwpO1xuXHRcdHRoaXMuc2V0SW5wdXRNb2RlKCk7XG5cdFx0dGhpcy5zdG9yZS5hZGQobW9kZWwpO1xuXHRcdGNvbnN0IHNldERlY29yYXRpb25zID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmlucHV0LmdldE1vZGVsKCkuZ2V0VmFsdWUoKTtcblx0XHRcdGNvbnN0IGRlY29yYXRpb25zID0gISF2YWx1ZSA/IFtdIDogY3JlYXRlRGVjb3JhdGlvbnModGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLCB0aGlzLnBsYWNlaG9sZGVyKTtcblx0XHRcdHRoaXMuaW5wdXQuc2V0RGVjb3JhdGlvbnNCeVR5cGUoJ2JyZWFrcG9pbnQtd2lkZ2V0JywgREVDT1JBVElPTl9LRVksIGRlY29yYXRpb25zKTtcblx0XHR9O1xuXHRcdHRoaXMuc3RvcmUuYWRkKHRoaXMuaW5wdXQuZ2V0TW9kZWwoKS5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gc2V0RGVjb3JhdGlvbnMoKSkpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiBzZXREZWNvcmF0aW9ucygpKSk7XG5cblx0XHR0aGlzLnN0b3JlLmFkZCh0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogREVCVUdfU0NIRU1FLCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ2JyZWFrcG9pbnRXaWRnZXQnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxDb21wbGV0aW9uTGlzdD4gPT4ge1xuXHRcdFx0XHRsZXQgc3VnZ2VzdGlvbnNQcm9taXNlOiBQcm9taXNlPENvbXBsZXRpb25MaXN0Pjtcblx0XHRcdFx0Y29uc3QgdW5kZXJseWluZ01vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdFx0aWYgKHVuZGVybHlpbmdNb2RlbCAmJiAodGhpcy5jb250ZXh0ID09PSBDb250ZXh0LkNPTkRJVElPTiB8fCAodGhpcy5jb250ZXh0ID09PSBDb250ZXh0LkxPR19NRVNTQUdFICYmIGlzUG9zaXRpb25JbkN1cmx5QnJhY2tldEJsb2NrKHRoaXMuaW5wdXQpKSkpIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uc1Byb21pc2UgPSBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLCB1bmRlcmx5aW5nTW9kZWwsIG5ldyBQb3NpdGlvbih0aGlzLmxpbmVOdW1iZXIsIDEpLCBuZXcgQ29tcGxldGlvbk9wdGlvbnModW5kZWZpbmVkLCBuZXcgU2V0PENvbXBsZXRpb25JdGVtS2luZD4oKS5hZGQoQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQpKSwgX2NvbnRleHQsIHRva2VuKS50aGVuKHN1Z2dlc3Rpb25zID0+IHtcblxuXHRcdFx0XHRcdFx0bGV0IG92ZXJ3cml0ZUJlZm9yZSA9IDA7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5jb250ZXh0ID09PSBDb250ZXh0LkNPTkRJVElPTikge1xuXHRcdFx0XHRcdFx0XHRvdmVyd3JpdGVCZWZvcmUgPSBwb3NpdGlvbi5jb2x1bW4gLSAxO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gSW5zaWRlIHRoZSBjdXJybHkgYnJhY2tldHMsIG5lZWQgdG8gY291bnQgaG93IG1hbnkgdXNlZnVsIGNoYXJhY3RlcnMgYXJlIGJlaGluZCB0aGUgcG9zaXRpb24gc28gdGhleSB3b3VsZCBhbGwgYmUgdGFrZW4gaW50byBhY2NvdW50XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5pbnB1dC5nZXRNb2RlbCgpLmdldFZhbHVlKCk7XG5cdFx0XHRcdFx0XHRcdHdoaWxlICgocG9zaXRpb24uY29sdW1uIC0gMiAtIG92ZXJ3cml0ZUJlZm9yZSA+PSAwKSAmJiB2YWx1ZVtwb3NpdGlvbi5jb2x1bW4gLSAyIC0gb3ZlcndyaXRlQmVmb3JlXSAhPT0gJ3snICYmIHZhbHVlW3Bvc2l0aW9uLmNvbHVtbiAtIDIgLSBvdmVyd3JpdGVCZWZvcmVdICE9PSAnICcpIHtcblx0XHRcdFx0XHRcdFx0XHRvdmVyd3JpdGVCZWZvcmUrKztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRzdWdnZXN0aW9uczogc3VnZ2VzdGlvbnMuaXRlbXMubWFwKHMgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHMuY29tcGxldGlvbi5yYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24uZGVsdGEoMCwgLW92ZXJ3cml0ZUJlZm9yZSksIHBvc2l0aW9uKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gcy5jb21wbGV0aW9uO1xuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uc1Byb21pc2UgPSBQcm9taXNlLnJlc29sdmUoeyBzdWdnZXN0aW9uczogW10gfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gc3VnZ2VzdGlvbnNQcm9taXNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuc3RvcmUuYWRkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5mb250U2l6ZScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5saW5lSGVpZ2h0JykpIHtcblx0XHRcdFx0dGhpcy5pbnB1dC51cGRhdGVPcHRpb25zKHRoaXMuY3JlYXRlRWRpdG9yT3B0aW9ucygpKTtcblx0XHRcdFx0dGhpcy5jZW50ZXJJbnB1dFZlcnRpY2FsbHkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVkaXRvck9wdGlvbnMoKTogSUVkaXRvck9wdGlvbnMge1xuXHRcdGNvbnN0IGVkaXRvckNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJyk7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGdldFNpbXBsZUVkaXRvck9wdGlvbnModGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdG9wdGlvbnMuZm9udFNpemUgPSBlZGl0b3JDb25maWcuZm9udFNpemU7XG5cdFx0b3B0aW9ucy5mb250RmFtaWx5ID0gZWRpdG9yQ29uZmlnLmZvbnRGYW1pbHk7XG5cdFx0b3B0aW9ucy5saW5lSGVpZ2h0ID0gZWRpdG9yQ29uZmlnLmxpbmVIZWlnaHQ7XG5cdFx0b3B0aW9ucy5mb250TGlnYXR1cmVzID0gZWRpdG9yQ29uZmlnLmZvbnRMaWdhdHVyZXM7XG5cdFx0b3B0aW9ucy5hcmlhTGFiZWwgPSB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBjZW50ZXJJbnB1dFZlcnRpY2FsbHkoKSB7XG5cdFx0aWYgKHRoaXMuY29udGFpbmVyICYmIHR5cGVvZiB0aGlzLmhlaWdodEluUHggPT09ICdudW1iZXInKSB7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5pbnB1dC5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdFx0Y29uc3QgbGluZU51bSA9IHRoaXMuaW5wdXQuZ2V0TW9kZWwoKS5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGNvbnN0IG5ld1RvcE1hcmdpbiA9ICh0aGlzLmhlaWdodEluUHggLSBsaW5lTnVtICogbGluZUhlaWdodCkgLyAyO1xuXHRcdFx0dGhpcy5pbnB1dENvbnRhaW5lci5zdHlsZS5tYXJnaW5Ub3AgPSBuZXdUb3BNYXJnaW4gKyAncHgnO1xuXHRcdH1cblx0fVxuXG5cdGNsb3NlKHN1Y2Nlc3M6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0Ly8gaWYgdGhlcmUgaXMgYWxyZWFkeSBhIGJyZWFrcG9pbnQgb24gdGhpcyBsb2NhdGlvbiAtIHJlbW92ZSBpdC5cblxuXHRcdFx0bGV0IGNvbmRpdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGhpdENvbmRpdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGxvZ01lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCB0cmlnZ2VyZWRCeTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IG1vZGU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBtb2RlTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0dGhpcy5yZW1lbWJlcklucHV0KCk7XG5cblx0XHRcdGlmICh0aGlzLmNvbmRpdGlvbklucHV0IHx8IHRoaXMuY29udGV4dCA9PT0gQ29udGV4dC5DT05ESVRJT04pIHtcblx0XHRcdFx0Y29uZGl0aW9uID0gdGhpcy5jb25kaXRpb25JbnB1dDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmhpdENvdW50SW5wdXQgfHwgdGhpcy5jb250ZXh0ID09PSBDb250ZXh0LkhJVF9DT1VOVCkge1xuXHRcdFx0XHRoaXRDb25kaXRpb24gPSB0aGlzLmhpdENvdW50SW5wdXQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5sb2dNZXNzYWdlSW5wdXQgfHwgdGhpcy5jb250ZXh0ID09PSBDb250ZXh0LkxPR19NRVNTQUdFKSB7XG5cdFx0XHRcdGxvZ01lc3NhZ2UgPSB0aGlzLmxvZ01lc3NhZ2VJbnB1dDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnNlbGVjdE1vZGVCb3gpIHtcblx0XHRcdFx0bW9kZSA9IHRoaXMubW9kZUlucHV0Py5tb2RlO1xuXHRcdFx0XHRtb2RlTGFiZWwgPSB0aGlzLm1vZGVJbnB1dD8ubGFiZWw7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5jb250ZXh0ID09PSBDb250ZXh0LlRSSUdHRVJfUE9JTlQpIHtcblx0XHRcdFx0Ly8gY3VycmVudGx5LCB0cmlnZ2VyIHBvaW50cyBkb24ndCBzdXBwb3J0IGFkZGl0aW9uYWwgY29uZGl0aW9uczpcblx0XHRcdFx0Y29uZGl0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRoaXRDb25kaXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGxvZ01lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRyaWdnZXJlZEJ5ID0gdGhpcy50cmlnZ2VyZWRCeUJyZWFrcG9pbnRJbnB1dD8uZ2V0SWQoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuYnJlYWtwb2ludCkge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gbmV3IE1hcDxzdHJpbmcsIElCcmVha3BvaW50VXBkYXRlRGF0YT4oKTtcblx0XHRcdFx0ZGF0YS5zZXQodGhpcy5icmVha3BvaW50LmdldElkKCksIHtcblx0XHRcdFx0XHRjb25kaXRpb24sXG5cdFx0XHRcdFx0aGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdGxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0dHJpZ2dlcmVkQnksXG5cdFx0XHRcdFx0bW9kZSxcblx0XHRcdFx0XHRtb2RlTGFiZWwsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS51cGRhdGVCcmVha3BvaW50cyh0aGlzLmJyZWFrcG9pbnQub3JpZ2luYWxVcmksIGRhdGEsIGZhbHNlKS50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0XHR0aGlzLmRlYnVnU2VydmljZS5hZGRCcmVha3BvaW50cyhtb2RlbC51cmksIFt7XG5cdFx0XHRcdFx0XHRsaW5lTnVtYmVyOiB0aGlzLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRjb2x1bW46IHRoaXMuY29sdW1uLFxuXHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGNvbmRpdGlvbixcblx0XHRcdFx0XHRcdGhpdENvbmRpdGlvbixcblx0XHRcdFx0XHRcdGxvZ01lc3NhZ2UsXG5cdFx0XHRcdFx0XHR0cmlnZ2VyZWRCeSxcblx0XHRcdFx0XHRcdG1vZGUsXG5cdFx0XHRcdFx0XHRtb2RlTGFiZWwsXG5cdFx0XHRcdFx0fV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzSW5wdXQoKSB7XG5cdFx0aWYgKHRoaXMuY29udGV4dCA9PT0gQ29udGV4dC5UUklHR0VSX1BPSU5UKSB7XG5cdFx0XHR0aGlzLnNlbGVjdEJyZWFrcG9pbnRCb3guZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnB1dC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuaW5wdXQuZGlzcG9zZSgpO1xuXHRcdGxpZmVjeWNsZS5kaXNwb3NlKHRoaXMuc3RvcmUpO1xuXHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy5lZGl0b3IuZm9jdXMoKSwgMCk7XG5cdH1cbn1cblxuY2xhc3MgQWNjZXB0QnJlYWtwb2ludFdpZGdldElucHV0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQ29tbWFuZCB7XG5cdHN0YXRpYyBJRCA9ICdicmVha3BvaW50V2lkZ2V0LmFjdGlvbi5hY2NlcHRJbnB1dCc7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBBY2NlcHRCcmVha3BvaW50V2lkZ2V0SW5wdXRBY3Rpb24uSUQsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfQlJFQUtQT0lOVF9XSURHRVRfVklTSUJMRSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IENPTlRFWFRfSU5fQlJFQUtQT0lOVF9XSURHRVQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0YWNjZXNzb3IuZ2V0KElQcml2YXRlQnJlYWtwb2ludFdpZGdldFNlcnZpY2UpLmNsb3NlKHRydWUpO1xuXHR9XG59XG5cbmNsYXNzIENsb3NlQnJlYWtwb2ludFdpZGdldENvbW1hbmQgZXh0ZW5kcyBFZGl0b3JDb21tYW5kIHtcblx0c3RhdGljIElEID0gJ2Nsb3NlQnJlYWtwb2ludFdpZGdldCc7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDbG9zZUJyZWFrcG9pbnRXaWRnZXRDb21tYW5kLklELFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDT05URVhUX0JSRUFLUE9JTlRfV0lER0VUX1ZJU0lCTEUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuRXNjYXBlXSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBkZWJ1Z0NvbnRyaWJ1dGlvbiA9IGVkaXRvci5nZXRDb250cmlidXRpb248SUJyZWFrcG9pbnRFZGl0b3JDb250cmlidXRpb24+KEJSRUFLUE9JTlRfRURJVE9SX0NPTlRSSUJVVElPTl9JRCk7XG5cdFx0aWYgKGRlYnVnQ29udHJpYnV0aW9uKSB7XG5cdFx0XHQvLyBpZiBmb2N1cyBpcyBpbiBvdXRlciBlZGl0b3Igd2UgbmVlZCB0byB1c2UgdGhlIGRlYnVnIGNvbnRyaWJ1dGlvbiB0byBjbG9zZVxuXHRcdFx0cmV0dXJuIGRlYnVnQ29udHJpYnV0aW9uLmNsb3NlQnJlYWtwb2ludFdpZGdldCgpO1xuXHRcdH1cblxuXHRcdGFjY2Vzc29yLmdldChJUHJpdmF0ZUJyZWFrcG9pbnRXaWRnZXRTZXJ2aWNlKS5jbG9zZShmYWxzZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBBY2NlcHRCcmVha3BvaW50V2lkZ2V0SW5wdXRBY3Rpb24oKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IENsb3NlQnJlYWtwb2ludFdpZGdldENvbW1hbmQoKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUywrQkFBK0I7QUFDeEMsU0FBNEIsaUJBQWlCO0FBRTdDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFlBQVksZUFBZTtBQUMzQixTQUFTLE9BQU8sV0FBVztBQUUzQixTQUFTLGVBQWlDLDZCQUE2QjtBQUN2RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQztBQUM3QyxTQUFvQixnQkFBZ0I7QUFDcEMsU0FBaUIsYUFBYTtBQUU5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUE0QiwwQkFBMEM7QUFDdEUsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUIsOEJBQThCO0FBQzFELFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1Qix1QkFBdUI7QUFDdkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUIsOEJBQThCO0FBQzVELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQXNCLHFCQUFxQjtBQUMzQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtDQUFrQyw4QkFBOEI7QUFDekUsU0FBUyxtQ0FBbUMsbUNBQW1DLDhCQUE4QiwyQkFBMkIsU0FBUyxjQUFpRixxQkFBcUI7QUFDdlAsT0FBTztBQUVQLE1BQU0sSUFBSSxJQUFJO0FBQ2QsTUFBTSxrQ0FBa0MsZ0JBQWlELGdDQUFnQztBQUt6SCxNQUFNLGlCQUFpQjtBQUV2QixTQUFTLDhCQUE4QixPQUFtQztBQUN6RSxRQUFNLFFBQVEsTUFBTSxTQUFTO0FBQzdCLFFBQU0sZUFBZSxNQUFNLGFBQWEsdUJBQXVCLE1BQU0sY0FBYyxNQUFNLFlBQVksQ0FBQyxDQUFDO0FBQ3ZHLFNBQU8sYUFBYSxLQUFLLE9BQUssRUFBRSxtQkFBbUIsZ0JBQWdCLEdBQUc7QUFDdkU7QUFFQSxTQUFTLGtCQUFrQixPQUFvQixhQUEyQztBQUN6RixRQUFNLHdCQUF3QixNQUFNLFNBQVMsZ0JBQWdCLEdBQUcsWUFBWSxHQUFHO0FBQy9FLFNBQU8sQ0FBQztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ04saUJBQWlCO0FBQUEsTUFDakIsZUFBZTtBQUFBLE1BQ2YsYUFBYTtBQUFBLE1BQ2IsV0FBVztBQUFBLElBQ1o7QUFBQSxJQUNBLGVBQWU7QUFBQSxNQUNkLE9BQU87QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLE9BQU8sd0JBQXdCLHNCQUFzQixTQUFTLElBQUk7QUFBQSxNQUNuRTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRjtBQUVPLElBQU0sbUJBQU4sY0FBK0IsV0FBc0Q7QUFBQSxFQW9CM0YsWUFBWSxRQUE2QixZQUE0QixRQUE0QixTQUMxRCxvQkFDTixjQUNBLGNBQ1Esc0JBQ1IsY0FDSyxtQkFDRyx1QkFDRyx5QkFDTixtQkFDTCxjQUNJLGtCQUNKLGNBQy9CO0FBQ0QsVUFBTSxRQUFRLEVBQUUsV0FBVyxNQUFNLFdBQVcsT0FBTyxZQUFZLEdBQUcsY0FBYyxLQUFLLENBQUM7QUFkOUM7QUFBNEI7QUFDOUI7QUFDTjtBQUNBO0FBQ1E7QUFDUjtBQUNLO0FBQ0c7QUFDRztBQUNOO0FBQ0w7QUFDSTtBQUNKO0FBdEJqQyxTQUFRLGlCQUFpQjtBQUN6QixTQUFRLGdCQUFnQjtBQUN4QixTQUFRLGtCQUFrQjtBQU0xQixTQUFRLHVCQUFzQyxDQUFDO0FBa0I5QyxTQUFLLFFBQVEsSUFBSSxVQUFVLGdCQUFnQjtBQUMzQyxVQUFNLFFBQVEsS0FBSyxPQUFPLFNBQVM7QUFDbkMsUUFBSSxPQUFPO0FBQ1YsWUFBTUEsT0FBTSxNQUFNO0FBQ2xCLFlBQU0sY0FBYyxLQUFLLGFBQWEsU0FBUyxFQUFFLGVBQWUsRUFBRSxZQUFZLEtBQUssWUFBWSxRQUFRLEtBQUssUUFBUSxLQUFBQSxLQUFJLENBQUM7QUFDekgsV0FBSyxhQUFhLFlBQVksU0FBUyxZQUFZLENBQUMsSUFBSTtBQUFBLElBQ3pEO0FBRUEsUUFBSSxZQUFZLFFBQVc7QUFDMUIsVUFBSSxLQUFLLGNBQWMsQ0FBQyxLQUFLLFdBQVcsYUFBYSxDQUFDLEtBQUssV0FBVyxnQkFBZ0IsS0FBSyxXQUFXLFlBQVk7QUFDakgsYUFBSyxVQUFVLFFBQVE7QUFBQSxNQUN4QixXQUFXLEtBQUssY0FBYyxDQUFDLEtBQUssV0FBVyxhQUFhLEtBQUssV0FBVyxjQUFjO0FBQ3pGLGFBQUssVUFBVSxRQUFRO0FBQUEsTUFDeEIsV0FBVyxLQUFLLGNBQWMsS0FBSyxXQUFXLGFBQWE7QUFDMUQsYUFBSyxVQUFVLFFBQVE7QUFBQSxNQUN4QixPQUFPO0FBQ04sYUFBSyxVQUFVLFFBQVE7QUFBQSxNQUN4QjtBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssVUFBVTtBQUFBLElBQ2hCO0FBRUEsU0FBSyxNQUFNLElBQUksS0FBSyxhQUFhLFNBQVMsRUFBRSx1QkFBdUIsT0FBSztBQUN2RSxVQUFJLEtBQUssY0FBYyxLQUFLLEVBQUUsV0FBVyxFQUFFLFFBQVEsUUFBUSxLQUFLLFVBQVUsS0FBSyxHQUFHO0FBQ2pGLGFBQUssUUFBUTtBQUFBLE1BQ2Q7QUFFQSxVQUFJLEtBQUssWUFBWSxRQUFRLGlCQUFpQixLQUFLLHFCQUFxQjtBQUN2RSxhQUFLLDRCQUE0QjtBQUFBLE1BQ2xDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLE1BQU0sSUFBSSxLQUFLLGtCQUFrQix1QkFBdUIscUJBQXFCLGdCQUFnQixDQUFDLENBQUMsQ0FBQztBQUVyRyxTQUFLLE9BQU87QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFZLGNBQXNCO0FBQ2pDLFVBQU0sZUFBZSxLQUFLLGtCQUFrQixpQkFBaUIsa0NBQWtDLEVBQUUsR0FBRyxTQUFTLEtBQUs7QUFDbEgsVUFBTSxjQUFjLEtBQUssa0JBQWtCLGlCQUFpQiw2QkFBNkIsRUFBRSxHQUFHLFNBQVMsS0FBSztBQUM1RyxZQUFRLEtBQUssU0FBUztBQUFBLE1BQ3JCLEtBQUssUUFBUTtBQUNaLGVBQU8sSUFBSSxTQUFTLHlDQUF5QyxvSEFBb0gsY0FBYyxXQUFXO0FBQUEsTUFDM00sS0FBSyxRQUFRO0FBQ1osZUFBTyxJQUFJLFNBQVMsdUNBQXVDLDRFQUE0RSxjQUFjLFdBQVc7QUFBQSxNQUNqSztBQUNDLGVBQU8sSUFBSSxTQUFTLHlDQUF5Qyw4RUFBOEUsY0FBYyxXQUFXO0FBQUEsSUFDdEs7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLFlBQTZDO0FBQ2xFLFlBQVEsS0FBSyxTQUFTO0FBQUEsTUFDckIsS0FBSyxRQUFRO0FBQ1osZUFBTyxjQUFjLFdBQVcsYUFBYSxXQUFXLGFBQWEsS0FBSztBQUFBLE1BQzNFLEtBQUssUUFBUTtBQUNaLGVBQU8sY0FBYyxXQUFXLGVBQWUsV0FBVyxlQUFlLEtBQUs7QUFBQSxNQUMvRTtBQUNDLGVBQU8sY0FBYyxXQUFXLFlBQVksV0FBVyxZQUFZLEtBQUs7QUFBQSxJQUMxRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFzQjtBQUM3QixRQUFJLEtBQUssWUFBWSxRQUFRLGVBQWU7QUFDM0MsWUFBTSxRQUFRLEtBQUssTUFBTSxTQUFTLEVBQUUsU0FBUztBQUM3QyxjQUFRLEtBQUssU0FBUztBQUFBLFFBQ3JCLEtBQUssUUFBUTtBQUNaLGVBQUssa0JBQWtCO0FBQ3ZCO0FBQUEsUUFDRCxLQUFLLFFBQVE7QUFDWixlQUFLLGdCQUFnQjtBQUNyQjtBQUFBLFFBQ0Q7QUFDQyxlQUFLLGlCQUFpQjtBQUFBLE1BQ3hCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQXFCO0FBQzVCLFFBQUksS0FBSyxPQUFPLFNBQVMsR0FBRztBQUUzQixZQUFNLGFBQWEsS0FBSyxZQUFZLFFBQVEsY0FBYyx3QkFBd0IsS0FBSyxPQUFPLFNBQVMsRUFBRSxjQUFjO0FBQ3ZILFdBQUssTUFBTSxTQUFTLEVBQUUsWUFBWSxVQUFVO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQUEsRUFFUyxLQUFLLFlBQXNDO0FBQ25ELFVBQU0sVUFBVSxLQUFLLE1BQU0sU0FBUyxFQUFFLGFBQWE7QUFDbkQsVUFBTSxLQUFLLFlBQVksVUFBVSxDQUFDO0FBQUEsRUFDbkM7QUFBQSxFQUVBLHFCQUEyQjtBQUMxQixVQUFNLFVBQVUsS0FBSyxNQUFNLFNBQVMsRUFBRSxhQUFhO0FBQ25ELFNBQUssVUFBVSxVQUFVLENBQUM7QUFBQSxFQUMzQjtBQUFBLEVBRVUsZUFBZSxXQUE4QjtBQUN0RCxTQUFLLFlBQVksbUJBQW1CO0FBQ3BDLFVBQU0sWUFBWSxLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVU7QUFBQSxNQUM5QyxFQUFFLE1BQU0sSUFBSSxTQUFTLGNBQWMsWUFBWSxFQUFFO0FBQUEsTUFDakQsRUFBRSxNQUFNLElBQUksU0FBUyxZQUFZLFdBQVcsRUFBRTtBQUFBLE1BQzlDLEVBQUUsTUFBTSxJQUFJLFNBQVMsY0FBYyxhQUFhLEVBQUU7QUFBQSxNQUNsRCxFQUFFLE1BQU0sSUFBSSxTQUFTLGVBQWUscUJBQXFCLEVBQUU7QUFBQSxJQUM1RCxHQUFpQyxLQUFLLFNBQVMsS0FBSyxvQkFBb0Isd0JBQXdCLEVBQUUsV0FBVyxJQUFJLFNBQVMsa0JBQWtCLGlCQUFpQixHQUFHLGdCQUFnQixDQUFDLHFCQUFxQixLQUFLLHFCQUFxQixFQUFFLENBQUMsQ0FBQztBQUNwTyxTQUFLLGtCQUFrQixFQUFFLDhCQUE4QjtBQUN2RCxjQUFVLE9BQU8sSUFBSSxPQUFPLFdBQVcsS0FBSyxlQUFlLENBQUM7QUFDNUQsU0FBSyxNQUFNLElBQUksVUFBVSxZQUFZLE9BQUs7QUFDekMsV0FBSyxjQUFjO0FBQ25CLFdBQUssVUFBVSxFQUFFO0FBQ2pCLFdBQUssbUJBQW1CO0FBQUEsSUFDekIsQ0FBQyxDQUFDO0FBRUYsU0FBSyxpQkFBaUIsU0FBUztBQUUvQixTQUFLLGlCQUFpQixFQUFFLGlCQUFpQjtBQUN6QyxTQUFLLE1BQU0sSUFBSSxLQUFLLGFBQWEsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxnQkFBZ0IsS0FBSyxXQUFXLENBQUM7QUFDM0gsU0FBSyxzQkFBc0IsSUFBSSxPQUFPLFdBQVcsS0FBSyxjQUFjLENBQUM7QUFFckUsU0FBSyxNQUFNLFNBQVMsRUFBRSxTQUFTLEtBQUssY0FBYyxLQUFLLFVBQVUsQ0FBQztBQUNsRSxTQUFLLE1BQU0sSUFBSSxLQUFLLE1BQU0sU0FBUyxFQUFFLG1CQUFtQixNQUFNO0FBQzdELFdBQUssbUJBQW1CO0FBQUEsSUFDekIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxNQUFNLFlBQVksRUFBRSxZQUFZLEdBQUcsUUFBUSxLQUFLLE1BQU0sU0FBUyxFQUFFLGlCQUFpQixDQUFDLEVBQUUsQ0FBQztBQUUzRixTQUFLLDZCQUE2QixTQUFTO0FBRTNDLFNBQUssbUJBQW1CO0FBRXhCLGVBQVcsTUFBTSxLQUFLLFdBQVcsR0FBRyxHQUFHO0FBQUEsRUFDeEM7QUFBQSxFQUVRLGlCQUFpQixXQUF3QjtBQUNoRCxVQUFNLFFBQVEsS0FBSyxhQUFhLFNBQVMsRUFBRSxtQkFBbUIsUUFBUTtBQUN0RSxRQUFJLE1BQU0sVUFBVSxHQUFHO0FBQ3RCO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyxLQUFLLGdCQUFnQixJQUFJO0FBQUEsTUFDbkM7QUFBQSxRQUNDLEVBQUUsTUFBTSxJQUFJLFNBQVMsVUFBVSxNQUFNLEdBQUcsWUFBWSxLQUFLO0FBQUEsUUFDekQsR0FBRyxNQUFNLElBQUksV0FBUyxFQUFFLE1BQU0sS0FBSyxPQUFPLGFBQWEsS0FBSyxZQUFZLEVBQUU7QUFBQSxNQUMzRTtBQUFBLE1BQ0EsTUFBTSxVQUFVLE9BQUssRUFBRSxTQUFTLEtBQUssWUFBWSxJQUFJLElBQUk7QUFBQSxNQUN6RCxLQUFLO0FBQUEsTUFDTDtBQUFBLE1BQ0EsRUFBRSxnQkFBZ0IsQ0FBQyxxQkFBcUIsS0FBSyxxQkFBcUIsRUFBRTtBQUFBLElBQ3JFO0FBQ0EsU0FBSyxNQUFNLElBQUksRUFBRTtBQUNqQixTQUFLLE1BQU0sSUFBSSxHQUFHLFlBQVksT0FBSztBQUNsQyxXQUFLLFlBQVksTUFBTSxFQUFFLFFBQVEsQ0FBQztBQUFBLElBQ25DLENBQUMsQ0FBQztBQUVGLFVBQU0sY0FBYyxFQUFFLHdCQUF3QjtBQUM5QyxVQUFNLG1CQUFtQixFQUFFLHVCQUF1QjtBQUNsRCxRQUFJLE9BQU8sYUFBYSxnQkFBZ0I7QUFDeEMsT0FBRyxPQUFPLGdCQUFnQjtBQUMxQixRQUFJLE9BQU8sV0FBVyxXQUFXO0FBQUEsRUFDbEM7QUFBQSxFQUVRLDZCQUE2QixXQUF3QjtBQUM1RCxTQUFLLHVCQUF1QixLQUFLLGFBQWEsU0FBUyxFQUFFLGVBQWUsRUFBRSxPQUFPLFFBQU0sT0FBTyxLQUFLLGNBQWMsQ0FBQyxHQUFHLFVBQVU7QUFDL0gsVUFBTSxvQkFBb0IsS0FBSyx1QkFBdUI7QUFFdEQsVUFBTSxRQUFRLEtBQUsscUJBQXFCLFVBQVUsUUFBTSxLQUFLLFlBQVksZ0JBQWdCLEdBQUcsTUFBTSxDQUFDO0FBRW5HLFFBQUksZ0JBQWdCO0FBRXBCLFFBQUksVUFBVSxJQUFJO0FBQ2pCLFdBQUssNkJBQTZCLEtBQUsscUJBQXFCLEtBQUs7QUFDakUsc0JBQWdCLFFBQVE7QUFBQSxJQUN6QixXQUFXLENBQUMsS0FBSyxZQUFZLGVBQWUsS0FBSyxxQkFBcUIsU0FBUyxHQUFHO0FBQ2pGLFdBQUssNkJBQTZCLEtBQUsscUJBQXFCLENBQUM7QUFDN0Qsc0JBQWdCO0FBQUEsSUFDakIsT0FBTztBQUNOLFdBQUssNkJBQTZCO0FBQUEsSUFDbkM7QUFFQSxVQUFNLHNCQUFzQixLQUFLLHNCQUFzQixLQUFLLE1BQU0sSUFBSSxJQUFJLFVBQVUsbUJBQW1CLGVBQWUsS0FBSyxvQkFBb0Isd0JBQXdCLEVBQUUsV0FBVyxJQUFJLFNBQVMsb0JBQW9CLG1CQUFtQixHQUFHLGdCQUFnQixDQUFDLHFCQUFxQixLQUFLLHFCQUFxQixFQUFFLENBQUMsQ0FBQztBQUMvUyxTQUFLLE1BQU0sSUFBSSxvQkFBb0IsWUFBWSxPQUFLO0FBQ25ELFVBQUksRUFBRSxVQUFVLEdBQUc7QUFDbEIsYUFBSyw2QkFBNkI7QUFBQSxNQUNuQyxPQUFPO0FBQ04sYUFBSyw2QkFBNkIsS0FBSyxxQkFBcUIsRUFBRSxRQUFRLENBQUM7QUFBQSxNQUN4RTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyw0QkFBNEIsRUFBRSw4QkFBOEI7QUFDakUsU0FBSyxNQUFNLElBQUksSUFBSSxzQkFBc0IsS0FBSywyQkFBMkIsSUFBSSxVQUFVLFVBQVUsT0FBSztBQUNyRyxZQUFNLFFBQVEsSUFBSSxzQkFBc0IsQ0FBQztBQUN6QyxVQUFJLE1BQU0sT0FBTyxRQUFRLE1BQU0sR0FBRztBQUNqQyxhQUFLLE1BQU0sS0FBSztBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLG1CQUFtQixFQUFFLHVCQUF1QjtBQUNsRCxRQUFJLE9BQU8sS0FBSywyQkFBMkIsZ0JBQWdCO0FBQzNELHdCQUFvQixPQUFPLGdCQUFnQjtBQUUzQyxRQUFJLE9BQU8sV0FBVyxLQUFLLHlCQUF5QjtBQUVwRCxVQUFNLGNBQWMsSUFBSSxPQUFPLEtBQUssMkJBQTJCLG1CQUFtQjtBQUNsRixnQkFBWSxRQUFRLElBQUksU0FBUyxNQUFNLElBQUk7QUFDM0MsU0FBSyxNQUFNLElBQUksWUFBWSxXQUFXLE1BQU0sS0FBSyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBQzdELFNBQUssTUFBTSxJQUFJLFdBQVc7QUFBQSxFQUMzQjtBQUFBLEVBRVEseUJBQThDO0FBQ3JELFVBQU0sb0JBQXlDO0FBQUEsTUFDOUMsRUFBRSxNQUFNLElBQUksU0FBUyx5QkFBeUIsTUFBTSxHQUFHLFlBQVksS0FBSztBQUFBLE1BQ3hFLEdBQUcsS0FBSyxxQkFBcUIsSUFBSSxTQUFPO0FBQUEsUUFDdkMsTUFBTSxHQUFHLEtBQUssYUFBYSxZQUFZLEdBQUcsS0FBSyxFQUFFLFVBQVUsS0FBSyxDQUFDLENBQUMsS0FBSyxHQUFHLFVBQVU7QUFBQSxRQUNwRixhQUFhLElBQUksU0FBUyxvQkFBb0IsWUFBWTtBQUFBLE1BQzNELEVBQUU7QUFBQSxJQUNIO0FBR0EsZUFBVyxDQUFDLEdBQUcsRUFBRSxLQUFLLEtBQUsscUJBQXFCLFFBQVEsR0FBRztBQUMxRCxXQUFLLGlCQUFpQixxQkFBcUIsR0FBRyxHQUFHLEVBQUUsS0FBSyxTQUFPO0FBQzlELFlBQUk7QUFDSCw0QkFBa0IsSUFBSSxDQUFDLEVBQUUsY0FBYyxJQUFJLE9BQU8sZ0JBQWdCLGVBQWUsR0FBRyxVQUFVLEVBQUUsS0FBSztBQUFBLFFBQ3RHLFVBQUU7QUFDRCxjQUFJLFFBQVE7QUFBQSxRQUNiO0FBQUEsTUFDRCxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQ2QsMEJBQWtCLElBQUksQ0FBQyxFQUFFLGNBQWMsSUFBSSxTQUFTLGNBQWMsd0JBQXdCO0FBQUEsTUFDM0YsQ0FBQztBQUFBLElBQ0Y7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsOEJBQW9DO0FBQzNDLFNBQUssdUJBQXVCLEtBQUssYUFBYSxTQUFTLEVBQUUsZUFBZSxFQUFFLE9BQU8sUUFBTSxPQUFPLEtBQUssY0FBYyxDQUFDLEdBQUcsVUFBVTtBQUUvSCxRQUFJLGdCQUFnQjtBQUVwQixRQUFJLEtBQUssNEJBQTRCO0FBQ3BDLFlBQU0sV0FBVyxLQUFLLHFCQUFxQixVQUFVLFFBQU0sR0FBRyxNQUFNLE1BQU0sS0FBSyw0QkFBNEIsTUFBTSxDQUFDO0FBQ2xILFVBQUksYUFBYSxJQUFJO0FBQ3BCLHdCQUFnQixXQUFXO0FBQUEsTUFDNUIsT0FBTztBQUNOLGFBQUssNkJBQTZCO0FBQUEsTUFDbkM7QUFBQSxJQUNEO0FBRUEsVUFBTSxvQkFBb0IsS0FBSyx1QkFBdUI7QUFDdEQsU0FBSyxvQkFBb0IsV0FBVyxtQkFBbUIsYUFBYTtBQUFBLEVBQ3JFO0FBQUEsRUFFUSxxQkFBcUI7QUFDNUIsUUFBSSxLQUFLLFlBQVksUUFBUSxlQUFlO0FBQzNDLFdBQUssZUFBZSxTQUFTO0FBQzdCLFdBQUssMEJBQTBCLFNBQVM7QUFFeEMsVUFBSSxLQUFLLHFCQUFxQjtBQUM3QixhQUFLLDRCQUE0QjtBQUFBLE1BQ2xDO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxlQUFlLFNBQVM7QUFDN0IsV0FBSywwQkFBMEIsU0FBUztBQUN4QyxXQUFLLGFBQWE7QUFDbEIsWUFBTSxRQUFRLEtBQUssY0FBYyxLQUFLLFVBQVU7QUFDaEQsV0FBSyxNQUFNLFNBQVMsRUFBRSxTQUFTLEtBQUs7QUFDcEMsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFbUIsVUFBVSxlQUF1QixjQUE0QjtBQUMvRSxTQUFLLGFBQWE7QUFDbEIsU0FBSyxNQUFNLE9BQU8sRUFBRSxRQUFRLGVBQWUsT0FBTyxlQUFlLElBQUksQ0FBQztBQUN0RSxTQUFLLHNCQUFzQjtBQUFBLEVBQzVCO0FBQUEsRUFFbUIsU0FBUyxjQUE0QjtBQUN2RCxRQUFJLE9BQU8sS0FBSyxlQUFlLFVBQVU7QUFDeEMsV0FBSyxVQUFVLEtBQUssWUFBWSxZQUFZO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBc0IsV0FBOEI7QUFDM0QsVUFBTSw0QkFBNEIsS0FBSyxxQkFBcUIsWUFBWSxJQUFJO0FBQUEsTUFDM0UsQ0FBQyxpQ0FBaUMsSUFBSTtBQUFBLElBQ3ZDLENBQUM7QUFDRCxTQUFLLE1BQU0sSUFBSSx5QkFBeUI7QUFFeEMsVUFBTSxVQUFVLEtBQUssb0JBQW9CO0FBQ3pDLFVBQU0sMEJBQTBCLGlDQUFpQztBQUNqRSxTQUFLLFFBQTJCLDBCQUEwQixlQUFlLGtCQUFrQixXQUFXLFNBQVMsdUJBQXVCO0FBRXRJLGlDQUE2QixPQUFPLEtBQUssTUFBTSxpQkFBaUIsRUFBRSxJQUFJLElBQUk7QUFDMUUsVUFBTSxRQUFRLEtBQUssYUFBYSxZQUFZLElBQUksTUFBTSxJQUFJLE1BQU0sR0FBRyxZQUFZLElBQUksS0FBSyxPQUFPLE1BQU0sQ0FBQyxrQkFBa0IsR0FBRyxJQUFJO0FBQy9ILFFBQUksS0FBSyxPQUFPLFNBQVMsR0FBRztBQUMzQixZQUFNLFlBQVksS0FBSyxPQUFPLFNBQVMsRUFBRSxjQUFjLENBQUM7QUFBQSxJQUN6RDtBQUNBLFNBQUssTUFBTSxTQUFTLEtBQUs7QUFDekIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssTUFBTSxJQUFJLEtBQUs7QUFDcEIsVUFBTSxpQkFBaUIsTUFBTTtBQUM1QixZQUFNLFFBQVEsS0FBSyxNQUFNLFNBQVMsRUFBRSxTQUFTO0FBQzdDLFlBQU0sY0FBYyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksa0JBQWtCLEtBQUssYUFBYSxjQUFjLEdBQUcsS0FBSyxXQUFXO0FBQ3hHLFdBQUssTUFBTSxxQkFBcUIscUJBQXFCLGdCQUFnQixXQUFXO0FBQUEsSUFDakY7QUFDQSxTQUFLLE1BQU0sSUFBSSxLQUFLLE1BQU0sU0FBUyxFQUFFLG1CQUFtQixNQUFNLGVBQWUsQ0FBQyxDQUFDO0FBQy9FLFNBQUssTUFBTSxJQUFJLEtBQUssYUFBYSxzQkFBc0IsTUFBTSxlQUFlLENBQUMsQ0FBQztBQUU5RSxTQUFLLE1BQU0sSUFBSSxLQUFLLHdCQUF3QixtQkFBbUIsU0FBUyxFQUFFLFFBQVEsY0FBYyxzQkFBc0IsS0FBSyxHQUFHO0FBQUEsTUFDN0gsbUJBQW1CO0FBQUEsTUFDbkIsd0JBQXdCLENBQUNDLFFBQW1CLFVBQW9CLFVBQTZCLFVBQXNEO0FBQ2xKLFlBQUk7QUFDSixjQUFNLGtCQUFrQixLQUFLLE9BQU8sU0FBUztBQUM3QyxZQUFJLG9CQUFvQixLQUFLLFlBQVksUUFBUSxhQUFjLEtBQUssWUFBWSxRQUFRLGVBQWUsOEJBQThCLEtBQUssS0FBSyxJQUFLO0FBQ25KLCtCQUFxQix1QkFBdUIsS0FBSyx3QkFBd0Isb0JBQW9CLGlCQUFpQixJQUFJLFNBQVMsS0FBSyxZQUFZLENBQUMsR0FBRyxJQUFJLGtCQUFrQixTQUFXLG9CQUFJLElBQXdCLEdBQUUsSUFBSSxtQkFBbUIsT0FBTyxDQUFDLEdBQUcsVUFBVSxLQUFLLEVBQUUsS0FBSyxpQkFBZTtBQUVyUixnQkFBSSxrQkFBa0I7QUFDdEIsZ0JBQUksS0FBSyxZQUFZLFFBQVEsV0FBVztBQUN2QyxnQ0FBa0IsU0FBUyxTQUFTO0FBQUEsWUFDckMsT0FBTztBQUVOLG9CQUFNLFFBQVEsS0FBSyxNQUFNLFNBQVMsRUFBRSxTQUFTO0FBQzdDLHFCQUFRLFNBQVMsU0FBUyxJQUFJLG1CQUFtQixLQUFNLE1BQU0sU0FBUyxTQUFTLElBQUksZUFBZSxNQUFNLE9BQU8sTUFBTSxTQUFTLFNBQVMsSUFBSSxlQUFlLE1BQU0sS0FBSztBQUNwSztBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBRUEsbUJBQU87QUFBQSxjQUNOLGFBQWEsWUFBWSxNQUFNLElBQUksT0FBSztBQUN2QyxrQkFBRSxXQUFXLFFBQVEsTUFBTSxjQUFjLFNBQVMsTUFBTSxHQUFHLENBQUMsZUFBZSxHQUFHLFFBQVE7QUFDdEYsdUJBQU8sRUFBRTtBQUFBLGNBQ1YsQ0FBQztBQUFBLFlBQ0Y7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGLE9BQU87QUFDTiwrQkFBcUIsUUFBUSxRQUFRLEVBQUUsYUFBYSxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQ3pEO0FBRUEsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssTUFBTSxJQUFJLEtBQUssc0JBQXNCLHlCQUF5QixDQUFDLE1BQU07QUFDekUsVUFBSSxFQUFFLHFCQUFxQixpQkFBaUIsS0FBSyxFQUFFLHFCQUFxQixtQkFBbUIsR0FBRztBQUM3RixhQUFLLE1BQU0sY0FBYyxLQUFLLG9CQUFvQixDQUFDO0FBQ25ELGFBQUssc0JBQXNCO0FBQUEsTUFDNUI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLHNCQUFzQztBQUM3QyxVQUFNLGVBQWUsS0FBSyxzQkFBc0IsU0FBeUIsUUFBUTtBQUNqRixVQUFNLFVBQVUsdUJBQXVCLEtBQUsscUJBQXFCO0FBQ2pFLFlBQVEsV0FBVyxhQUFhO0FBQ2hDLFlBQVEsYUFBYSxhQUFhO0FBQ2xDLFlBQVEsYUFBYSxhQUFhO0FBQ2xDLFlBQVEsZ0JBQWdCLGFBQWE7QUFDckMsWUFBUSxZQUFZLEtBQUs7QUFDekIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHdCQUF3QjtBQUMvQixRQUFJLEtBQUssYUFBYSxPQUFPLEtBQUssZUFBZSxVQUFVO0FBQzFELFlBQU0sYUFBYSxLQUFLLE1BQU0sVUFBVSxhQUFhLFVBQVU7QUFDL0QsWUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTLEVBQUUsYUFBYTtBQUNuRCxZQUFNLGdCQUFnQixLQUFLLGFBQWEsVUFBVSxjQUFjO0FBQ2hFLFdBQUssZUFBZSxNQUFNLFlBQVksZUFBZTtBQUFBLElBQ3REO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxTQUF3QjtBQUM3QixRQUFJLFNBQVM7QUFHWixVQUFJLFlBQWdDO0FBQ3BDLFVBQUksZUFBbUM7QUFDdkMsVUFBSSxhQUFpQztBQUNyQyxVQUFJLGNBQWtDO0FBQ3RDLFVBQUksT0FBMkI7QUFDL0IsVUFBSSxZQUFnQztBQUVwQyxXQUFLLGNBQWM7QUFFbkIsVUFBSSxLQUFLLGtCQUFrQixLQUFLLFlBQVksUUFBUSxXQUFXO0FBQzlELG9CQUFZLEtBQUs7QUFBQSxNQUNsQjtBQUNBLFVBQUksS0FBSyxpQkFBaUIsS0FBSyxZQUFZLFFBQVEsV0FBVztBQUM3RCx1QkFBZSxLQUFLO0FBQUEsTUFDckI7QUFDQSxVQUFJLEtBQUssbUJBQW1CLEtBQUssWUFBWSxRQUFRLGFBQWE7QUFDakUscUJBQWEsS0FBSztBQUFBLE1BQ25CO0FBQ0EsVUFBSSxLQUFLLGVBQWU7QUFDdkIsZUFBTyxLQUFLLFdBQVc7QUFDdkIsb0JBQVksS0FBSyxXQUFXO0FBQUEsTUFDN0I7QUFDQSxVQUFJLEtBQUssWUFBWSxRQUFRLGVBQWU7QUFFM0Msb0JBQVk7QUFDWix1QkFBZTtBQUNmLHFCQUFhO0FBQ2Isc0JBQWMsS0FBSyw0QkFBNEIsTUFBTTtBQUFBLE1BQ3REO0FBRUEsVUFBSSxLQUFLLFlBQVk7QUFDcEIsY0FBTSxPQUFPLG9CQUFJLElBQW1DO0FBQ3BELGFBQUssSUFBSSxLQUFLLFdBQVcsTUFBTSxHQUFHO0FBQUEsVUFDakM7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0QsQ0FBQztBQUNELGFBQUssYUFBYSxrQkFBa0IsS0FBSyxXQUFXLGFBQWEsTUFBTSxLQUFLLEVBQUUsS0FBSyxRQUFXLGlCQUFpQjtBQUFBLE1BQ2hILE9BQU87QUFDTixjQUFNLFFBQVEsS0FBSyxPQUFPLFNBQVM7QUFDbkMsWUFBSSxPQUFPO0FBQ1YsZUFBSyxhQUFhLGVBQWUsTUFBTSxLQUFLLENBQUM7QUFBQSxZQUM1QyxZQUFZLEtBQUs7QUFBQSxZQUNqQixRQUFRLEtBQUs7QUFBQSxZQUNiLFNBQVM7QUFBQSxZQUNUO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxVQUNELENBQUMsQ0FBQztBQUFBLFFBQ0g7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVRLGFBQWE7QUFDcEIsUUFBSSxLQUFLLFlBQVksUUFBUSxlQUFlO0FBQzNDLFdBQUssb0JBQW9CLE1BQU07QUFBQSxJQUNoQyxPQUFPO0FBQ04sV0FBSyxNQUFNLE1BQU07QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUNkLFNBQUssTUFBTSxRQUFRO0FBQ25CLGNBQVUsUUFBUSxLQUFLLEtBQUs7QUFDNUIsZUFBVyxNQUFNLEtBQUssT0FBTyxNQUFNLEdBQUcsQ0FBQztBQUFBLEVBQ3hDO0FBQ0Q7QUFoZWEsbUJBQU47QUFBQSxFQXFCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FoQ1U7QUFrZWIsTUFBTSxxQ0FBTixNQUFNLDJDQUEwQyxjQUFjO0FBQUEsRUFFN0QsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUksbUNBQWtDO0FBQUEsTUFDdEMsY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ1AsUUFBUTtBQUFBLFFBQ1IsU0FBUyxRQUFRO0FBQUEsUUFDakIsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGlCQUFpQixVQUE0QixRQUEyQjtBQUN2RSxhQUFTLElBQUksK0JBQStCLEVBQUUsTUFBTSxJQUFJO0FBQUEsRUFDekQ7QUFDRDtBQWpCTSxtQ0FDRSxLQUFLO0FBRGIsSUFBTSxvQ0FBTjtBQW1CQSxNQUFNLGdDQUFOLE1BQU0sc0NBQXFDLGNBQWM7QUFBQSxFQUV4RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSSw4QkFBNkI7QUFBQSxNQUNqQyxjQUFjO0FBQUEsTUFDZCxRQUFRO0FBQUEsUUFDUCxRQUFRLGtCQUFrQjtBQUFBLFFBQzFCLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLFdBQVcsQ0FBQyxPQUFPLFFBQVEsUUFBUSxNQUFNO0FBQUEsUUFDekMsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGlCQUFpQixVQUE0QixRQUFxQixNQUFxQjtBQUN0RixVQUFNLG9CQUFvQixPQUFPLGdCQUErQyxpQ0FBaUM7QUFDakgsUUFBSSxtQkFBbUI7QUFFdEIsYUFBTyxrQkFBa0Isc0JBQXNCO0FBQUEsSUFDaEQ7QUFFQSxhQUFTLElBQUksK0JBQStCLEVBQUUsTUFBTSxLQUFLO0FBQUEsRUFDMUQ7QUFDRDtBQXhCTSw4QkFDRSxLQUFLO0FBRGIsSUFBTSwrQkFBTjtBQTBCQSxzQkFBc0IsSUFBSSxrQ0FBa0MsQ0FBQztBQUM3RCxzQkFBc0IsSUFBSSw2QkFBNkIsQ0FBQzsiLAogICJuYW1lcyI6IFsidXJpIiwgIm1vZGVsIl0KfQo=
