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
import { addDisposableListener, isKeyboardEvent } from "../../../../base/browser/dom.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { memoize } from "../../../../base/common/decorators.js";
import { illegalArgument, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { visit } from "../../../../base/common/json.js";
import { setProperty } from "../../../../base/common/jsonEdit.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, MutableDisposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { basename } from "../../../../base/common/path.js";
import * as env from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import { assertType, isDefined } from "../../../../base/common/types.js";
import { Constants } from "../../../../base/common/uint.js";
import { URI } from "../../../../base/common/uri.js";
import { CoreEditingCommands } from "../../../../editor/browser/coreCommands.js";
import { MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { DEFAULT_WORD_REGEXP } from "../../../../editor/common/core/wordHelper.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { StandardTokenType } from "../../../../editor/common/encodedTokenAttributes.js";
import { InjectedTextCursorStops } from "../../../../editor/common/model.js";
import { ILanguageFeatureDebounceService } from "../../../../editor/common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ContentHoverController } from "../../../../editor/contrib/hover/browser/contentHoverController.js";
import { HoverStartMode, HoverStartSource } from "../../../../editor/contrib/hover/browser/hoverOperation.js";
import * as nls from "../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DebugHoverWidget, ShowDebugHoverResult } from "./debugHover.js";
import { ExceptionWidget } from "./exceptionWidget.js";
import { CONTEXT_EXCEPTION_WIDGET_VISIBLE, IDebugService, State } from "../common/debug.js";
import { Expression } from "../common/debugModel.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { InsertLineAfterAction } from "../../../../editor/contrib/linesOperations/browser/linesOperations.js";
const MAX_NUM_INLINE_VALUES = 100;
const MAX_INLINE_DECORATOR_LENGTH = 150;
const MAX_TOKENIZATION_LINE_LEN = 500;
const DEAFULT_INLINE_DEBOUNCE_DELAY = 200;
const debugInlineForeground = registerColor("editor.inlineValuesForeground", {
  dark: "#ffffff80",
  light: "#00000080",
  hcDark: "#ffffff80",
  hcLight: "#00000080"
}, nls.localize("editor.inlineValuesForeground", "Color for the debug inline value text."));
const debugInlineBackground = registerColor("editor.inlineValuesBackground", "#ffc80033", nls.localize("editor.inlineValuesBackground", "Color for the debug inline value background."));
class InlineSegment {
  constructor(column, text) {
    this.column = column;
    this.text = text;
  }
}
function formatHoverContent(contentText) {
  if (contentText.includes(",") && contentText.includes("=")) {
    const customSplit = (text) => {
      const splits = [];
      let equalsFound = 0;
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "=") {
          if (equalsFound === 0) {
            equalsFound++;
            continue;
          }
          const commaIndex = text.lastIndexOf(",", i);
          if (commaIndex !== -1 && commaIndex >= start) {
            splits.push(commaIndex);
            start = commaIndex + 1;
          }
          equalsFound++;
        }
      }
      const result = [];
      let s = 0;
      for (const index of splits) {
        result.push(text.substring(s, index).trim());
        s = index + 1;
      }
      if (s < text.length) {
        result.push(text.substring(s).trim());
      }
      return result;
    };
    const pairs = customSplit(contentText);
    const formattedPairs = pairs.map((pair) => {
      const equalsIndex = pair.indexOf("=");
      if (equalsIndex !== -1) {
        const indent = " ".repeat(equalsIndex + 2);
        const [firstLine, ...restLines] = pair.split(/\r?\n/);
        return [firstLine, ...restLines.map((line) => indent + line)].join("\n");
      }
      return pair;
    });
    return new MarkdownString().appendCodeblock("", formattedPairs.join(",\n"));
  }
  return new MarkdownString().appendCodeblock("", contentText);
}
function createInlineValueDecoration(lineNumber, contentText, classNamePrefix, column = Constants.MAX_SAFE_SMALL_INTEGER, viewportMaxCol = MAX_INLINE_DECORATOR_LENGTH) {
  const rawText = contentText;
  if (contentText.length > viewportMaxCol) {
    contentText = contentText.substring(0, viewportMaxCol) + "...";
  }
  return [
    {
      range: {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: column,
        endColumn: column
      },
      options: {
        description: `${classNamePrefix}-inline-value-decoration-spacer`,
        after: {
          content: strings.noBreakWhitespace,
          cursorStops: InjectedTextCursorStops.None
        },
        showIfCollapsed: true
      }
    },
    {
      range: {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: column,
        endColumn: column
      },
      options: {
        description: `${classNamePrefix}-inline-value-decoration`,
        after: {
          content: replaceWsWithNoBreakWs(contentText),
          inlineClassName: `${classNamePrefix}-inline-value`,
          inlineClassNameAffectsLetterSpacing: true,
          cursorStops: InjectedTextCursorStops.None
        },
        showIfCollapsed: true,
        hoverMessage: formatHoverContent(rawText)
      }
    }
  ];
}
function replaceWsWithNoBreakWs(str) {
  return str.replace(/[ \t\n]/g, strings.noBreakWhitespace);
}
function createInlineValueDecorationsInsideRange(expressions, ranges, model, wordToLineNumbersMap) {
  const nameValueMap = /* @__PURE__ */ new Map();
  for (const expr of expressions) {
    nameValueMap.set(expr.name, expr.value);
    if (nameValueMap.size >= MAX_NUM_INLINE_VALUES) {
      break;
    }
  }
  const lineToNamesMap = /* @__PURE__ */ new Map();
  nameValueMap.forEach((_value, name) => {
    const lineNumbers = wordToLineNumbersMap.get(name);
    if (lineNumbers) {
      for (const lineNumber of lineNumbers) {
        if (ranges.some((r) => lineNumber >= r.startLineNumber && lineNumber <= r.endLineNumber)) {
          if (!lineToNamesMap.has(lineNumber)) {
            lineToNamesMap.set(lineNumber, []);
          }
          if (lineToNamesMap.get(lineNumber).indexOf(name) === -1) {
            lineToNamesMap.get(lineNumber).push(name);
          }
        }
      }
    }
  });
  return [...lineToNamesMap].map(([line, names]) => ({
    line,
    variables: names.sort((first, second) => {
      const content = model.getLineContent(line);
      return content.indexOf(first) - content.indexOf(second);
    }).map((name) => ({ name, value: nameValueMap.get(name) }))
  }));
}
function getWordToLineNumbersMap(model, lineNumber, result) {
  const lineLength = model.getLineLength(lineNumber);
  if (lineLength > MAX_TOKENIZATION_LINE_LEN) {
    return;
  }
  const lineContent = model.getLineContent(lineNumber);
  model.tokenization.forceTokenization(lineNumber);
  const lineTokens = model.tokenization.getLineTokens(lineNumber);
  for (let tokenIndex = 0, tokenCount = lineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
    const tokenType = lineTokens.getStandardTokenType(tokenIndex);
    if (tokenType === StandardTokenType.Other) {
      DEFAULT_WORD_REGEXP.lastIndex = 0;
      const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
      const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);
      const tokenStr = lineContent.substring(tokenStartOffset, tokenEndOffset);
      const wordMatch = DEFAULT_WORD_REGEXP.exec(tokenStr);
      if (wordMatch) {
        const word = wordMatch[0];
        if (!result.has(word)) {
          result.set(word, []);
        }
        result.get(word).push(lineNumber);
      }
    }
  }
}
let DebugEditorContribution = class {
  constructor(editor, debugService, instantiationService, commandService, configurationService, hostService, uriIdentityService, contextKeyService, languageFeaturesService, featureDebounceService, editorService) {
    this.editor = editor;
    this.debugService = debugService;
    this.instantiationService = instantiationService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.uriIdentityService = uriIdentityService;
    this.languageFeaturesService = languageFeaturesService;
    this.editorService = editorService;
    this.mouseDown = false;
    this.gutterIsHovered = false;
    this.altListener = new MutableDisposable();
    this.altPressed = false;
    this.displayedStore = new DisposableStore();
    this.allowScrollToExceptionWidget = true;
    this.shouldScrollToExceptionWidget = () => this.allowScrollToExceptionWidget;
    // Holds a Disposable that prevents the default editor hover behavior while it exists.
    this.defaultHoverLockout = new MutableDisposable();
    this.oldDecorations = this.editor.createDecorationsCollection();
    this.debounceInfo = featureDebounceService.for(languageFeaturesService.inlineValuesProvider, "InlineValues", { min: DEAFULT_INLINE_DEBOUNCE_DELAY });
    this.hoverWidget = this.instantiationService.createInstance(DebugHoverWidget, this.editor);
    this.toDispose = [this.defaultHoverLockout, this.altListener, this.displayedStore];
    this.registerListeners();
    this.exceptionWidgetVisible = CONTEXT_EXCEPTION_WIDGET_VISIBLE.bindTo(contextKeyService);
    this.toggleExceptionWidget();
  }
  registerListeners() {
    this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame((e) => this.onFocusStackFrame(e.stackFrame)));
    this.toDispose.push(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
    this.toDispose.push(this.editor.onMouseUp(() => this.mouseDown = false));
    this.toDispose.push(this.editor.onMouseMove((e) => this.onEditorMouseMove(e)));
    this.toDispose.push(this.editor.onMouseLeave((e) => {
      const hoverDomNode = this.hoverWidget.getDomNode();
      if (!hoverDomNode) {
        return;
      }
      const rect = hoverDomNode.getBoundingClientRect();
      if (e.event.posx < rect.left || e.event.posx > rect.right || e.event.posy < rect.top || e.event.posy > rect.bottom) {
        this.hideHoverWidget();
      }
    }));
    this.toDispose.push(this.editor.onKeyDown((e) => this.onKeyDown(e)));
    this.toDispose.push(this.editor.onDidChangeModelContent(() => {
      this._wordToLineNumbersMap = void 0;
      this.updateInlineValuesScheduler.schedule();
    }));
    this.toDispose.push(this.debugService.getViewModel().onWillUpdateViews(() => this.updateInlineValuesScheduler.schedule()));
    this.toDispose.push(this.debugService.getViewModel().onDidEvaluateLazyExpression(() => this.updateInlineValuesScheduler.schedule()));
    this.toDispose.push(this.editor.onDidChangeModel(async () => {
      this.addDocumentListeners();
      this.toggleExceptionWidget();
      this.hideHoverWidget();
      this._wordToLineNumbersMap = void 0;
      const stackFrame = this.debugService.getViewModel().focusedStackFrame;
      await this.updateInlineValueDecorations(stackFrame);
    }));
    this.toDispose.push(this.editor.onDidScrollChange(() => {
      this.hideHoverWidget();
      const model = this.editor.getModel();
      if (model && this.languageFeaturesService.inlineValuesProvider.has(model)) {
        this.updateInlineValuesScheduler.schedule();
      }
    }));
    this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.hover")) {
        this.updateHoverConfiguration();
      }
    }));
    this.toDispose.push(this.debugService.onDidChangeState((state) => {
      if (state !== State.Stopped) {
        this.toggleExceptionWidget();
      }
    }));
    this.updateHoverConfiguration();
  }
  updateHoverConfiguration() {
    const model = this.editor.getModel();
    if (model) {
      this.editorHoverOptions = this.configurationService.getValue("editor.hover", {
        resource: model.uri,
        overrideIdentifier: model.getLanguageId()
      });
    }
  }
  addDocumentListeners() {
    const stackFrame = this.debugService.getViewModel().focusedStackFrame;
    const model = this.editor.getModel();
    if (model) {
      this.applyDocumentListeners(model, stackFrame);
    }
  }
  applyDocumentListeners(model, stackFrame) {
    if (!stackFrame || !this.uriIdentityService.extUri.isEqual(model.uri, stackFrame.source.uri)) {
      this.altListener.clear();
      return;
    }
    const ownerDocument = this.editor.getContainerDomNode().ownerDocument;
    this.altListener.value = addDisposableListener(ownerDocument, "keydown", (keydownEvent) => {
      const standardKeyboardEvent = new StandardKeyboardEvent(keydownEvent);
      if (standardKeyboardEvent.keyCode === KeyCode.Alt) {
        this.altPressed = true;
        const debugHoverWasVisible = this.hoverWidget.isVisible();
        this.hoverWidget.hide();
        this.defaultHoverLockout.clear();
        if (debugHoverWasVisible && this.hoverPosition) {
          this.showEditorHover(this.hoverPosition.position, false);
        }
        const onKeyUp = new DomEmitter(ownerDocument, "keyup");
        const listener = Event.any(this.hostService.onDidChangeFocus, onKeyUp.event)((keyupEvent) => {
          let standardKeyboardEvent2 = void 0;
          if (isKeyboardEvent(keyupEvent)) {
            standardKeyboardEvent2 = new StandardKeyboardEvent(keyupEvent);
          }
          if (!standardKeyboardEvent2 || standardKeyboardEvent2.keyCode === KeyCode.Alt) {
            this.altPressed = false;
            this.preventDefaultEditorHover();
            listener.dispose();
            onKeyUp.dispose();
          }
        });
      }
    });
  }
  async showHover(position, focus, mouseEvent) {
    this.preventDefaultEditorHover();
    const sf = this.debugService.getViewModel().focusedStackFrame;
    const model = this.editor.getModel();
    if (sf && model && this.uriIdentityService.extUri.isEqual(sf.source.uri, model.uri)) {
      const result = await this.hoverWidget.showAt(position, focus, mouseEvent);
      if (result === ShowDebugHoverResult.NOT_AVAILABLE) {
        this.showEditorHover(position, focus);
      }
    } else {
      this.showEditorHover(position, focus);
    }
  }
  preventDefaultEditorHover() {
    if (this.defaultHoverLockout.value || this.editorHoverOptions?.enabled === "off") {
      return;
    }
    const hoverController = this.editor.getContribution(ContentHoverController.ID);
    hoverController?.hideContentHover();
    this.editor.updateOptions({ hover: { enabled: "off" } });
    this.defaultHoverLockout.value = {
      dispose: () => {
        this.editor.updateOptions({
          hover: { enabled: this.editorHoverOptions?.enabled ?? "on" }
        });
      }
    };
  }
  showEditorHover(position, focus) {
    const hoverController = this.editor.getContribution(ContentHoverController.ID);
    const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
    this.defaultHoverLockout.clear();
    hoverController?.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Mouse, focus);
  }
  async onFocusStackFrame(sf) {
    const model = this.editor.getModel();
    if (model) {
      this.applyDocumentListeners(model, sf);
      if (sf && this.uriIdentityService.extUri.isEqual(sf.source.uri, model.uri)) {
        await this.toggleExceptionWidget();
      } else {
        this.hideHoverWidget();
      }
    }
    await this.updateInlineValueDecorations(sf);
  }
  get hoverDelay() {
    const baseDelay = this.editorHoverOptions?.delay || 0;
    const delayFactor = clamp(2 - (baseDelay - 300) / 600, 1, 2);
    return baseDelay * delayFactor;
  }
  get showHoverScheduler() {
    const scheduler = new RunOnceScheduler(() => {
      if (this.hoverPosition && !this.altPressed) {
        this.showHover(this.hoverPosition.position, false, this.hoverPosition.event);
      }
    }, this.hoverDelay);
    this.toDispose.push(scheduler);
    return scheduler;
  }
  hideHoverWidget() {
    if (this.hoverWidget.willBeVisible()) {
      this.hoverWidget.hide();
    }
    this.showHoverScheduler.cancel();
    this.defaultHoverLockout.clear();
  }
  // hover business
  onEditorMouseDown(mouseEvent) {
    this.mouseDown = true;
    if (mouseEvent.target.type === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === DebugHoverWidget.ID) {
      return;
    }
    this.hideHoverWidget();
  }
  onEditorMouseMove(mouseEvent) {
    if (this.debugService.state !== State.Stopped) {
      return;
    }
    const target = mouseEvent.target;
    const stopKey = env.isMacintosh ? "metaKey" : "ctrlKey";
    if (!this.altPressed) {
      if (target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
        this.defaultHoverLockout.clear();
        this.gutterIsHovered = true;
      } else if (this.gutterIsHovered) {
        this.gutterIsHovered = false;
        this.updateHoverConfiguration();
      }
    }
    if (target.type === MouseTargetType.CONTENT_WIDGET && target.detail === DebugHoverWidget.ID || this.hoverWidget.isInSafeTriangle(mouseEvent.event.posx, mouseEvent.event.posy)) {
      const sticky = this.editorHoverOptions?.sticky ?? true;
      if (sticky || this.hoverWidget.isShowingComplexValue || mouseEvent.event[stopKey]) {
        return;
      }
    }
    if (target.type === MouseTargetType.CONTENT_TEXT) {
      if (target.position && !Position.equals(target.position, this.hoverPosition?.position || null) && !this.hoverWidget.isInSafeTriangle(mouseEvent.event.posx, mouseEvent.event.posy)) {
        this.hoverPosition = { position: target.position, event: mouseEvent.event };
        this.preventDefaultEditorHover();
        this.showHoverScheduler.schedule(this.hoverDelay);
      }
    } else if (!this.mouseDown) {
      this.hideHoverWidget();
    }
  }
  onKeyDown(e) {
    const stopKey = env.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
    if (e.keyCode !== stopKey && e.keyCode !== KeyCode.Alt) {
      this.hideHoverWidget();
    }
  }
  // end hover business
  // exception widget
  async toggleExceptionWidget() {
    const model = this.editor.getModel();
    const focusedSf = this.debugService.getViewModel().focusedStackFrame;
    const callStack = focusedSf ? focusedSf.thread.getCallStack() : null;
    if (!model || !focusedSf || !callStack || callStack.length === 0) {
      this.closeExceptionWidget();
      return;
    }
    const exceptionSf = callStack.find((sf) => !!(sf && sf.source && sf.source.available && sf.source.presentationHint !== "deemphasize"));
    if (!exceptionSf || exceptionSf !== focusedSf) {
      this.closeExceptionWidget();
      return;
    }
    const sameUri = this.uriIdentityService.extUri.isEqual(exceptionSf.source.uri, model.uri);
    if (this.exceptionWidget && !sameUri) {
      this.closeExceptionWidget();
    } else if (sameUri) {
      const activeControl = this.editorService.activeTextEditorControl;
      const isActiveEditor = activeControl === this.editor;
      const exceptionInfo = await focusedSf.thread.exceptionInfo;
      if (exceptionInfo) {
        if (isActiveEditor) {
          this.showExceptionWidget(exceptionInfo, this.debugService.getViewModel().focusedSession, exceptionSf.range.startLineNumber, exceptionSf.range.startColumn);
        } else {
          this.showExceptionWidgetWithoutScroll(exceptionInfo, this.debugService.getViewModel().focusedSession, exceptionSf.range.startLineNumber, exceptionSf.range.startColumn);
        }
      }
    }
  }
  showExceptionWidget(exceptionInfo, debugSession, lineNumber, column) {
    if (this.exceptionWidget) {
      this.exceptionWidget.dispose();
    }
    this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
    this.exceptionWidget.show({ lineNumber, column }, 0);
    this.exceptionWidget.focus();
    this.editor.revealRangeInCenter({
      startLineNumber: lineNumber,
      startColumn: column,
      endLineNumber: lineNumber,
      endColumn: column
    });
    this.exceptionWidgetVisible.set(true);
  }
  showExceptionWidgetWithoutScroll(exceptionInfo, debugSession, lineNumber, column) {
    if (this.exceptionWidget) {
      this.exceptionWidget.dispose();
    }
    this.allowScrollToExceptionWidget = false;
    const currentScrollTop = this.editor.getScrollTop();
    const visibleRanges = this.editor.getVisibleRanges();
    if (visibleRanges.length === 0) {
      this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
      this.exceptionWidget.show({ lineNumber, column }, 0);
      this.exceptionWidgetVisible.set(true);
      this.allowScrollToExceptionWidget = true;
      return;
    }
    const firstVisibleLine = visibleRanges[0].startLineNumber;
    this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
    this.exceptionWidget.show({ lineNumber, column }, 0);
    this.exceptionWidgetVisible.set(true);
    if (lineNumber < firstVisibleLine) {
      const scrollAdjustment = this.exceptionWidget.getWhitespaceHeight();
      this.editor.setScrollTop(currentScrollTop + scrollAdjustment, ScrollType.Immediate);
    }
    this.allowScrollToExceptionWidget = true;
  }
  closeExceptionWidget() {
    if (this.exceptionWidget) {
      const shouldFocusEditor = this.exceptionWidget.hasFocus();
      this.exceptionWidget.dispose();
      this.exceptionWidget = void 0;
      this.exceptionWidgetVisible.set(false);
      if (shouldFocusEditor) {
        this.editor.focus();
      }
    }
  }
  async addLaunchConfiguration() {
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    let configurationsArrayPosition;
    let lastProperty;
    const getConfigurationPosition = () => {
      let depthInArray = 0;
      visit(model.getValue(), {
        onObjectProperty: (property) => {
          lastProperty = property;
        },
        onArrayBegin: (offset) => {
          if (lastProperty === "configurations" && depthInArray === 0) {
            configurationsArrayPosition = model.getPositionAt(offset + 1);
          }
          depthInArray++;
        },
        onArrayEnd: () => {
          depthInArray--;
        }
      });
    };
    getConfigurationPosition();
    if (!configurationsArrayPosition) {
      const { tabSize, insertSpaces } = model.getOptions();
      const eol = model.getEOL();
      const edit = basename(model.uri.fsPath) === "launch.json" ? setProperty(model.getValue(), ["configurations"], [], { tabSize, insertSpaces, eol })[0] : setProperty(model.getValue(), ["launch"], { "configurations": [] }, { tabSize, insertSpaces, eol })[0];
      const startPosition = model.getPositionAt(edit.offset);
      const lineNumber = startPosition.lineNumber;
      const range = new Range(lineNumber, startPosition.column, lineNumber, model.getLineMaxColumn(lineNumber));
      model.pushEditOperations(null, [EditOperation.replace(range, edit.content)], () => null);
      getConfigurationPosition();
    }
    if (!configurationsArrayPosition) {
      return;
    }
    this.editor.focus();
    const insertLine = (position) => {
      if (model.getLineLastNonWhitespaceColumn(position.lineNumber) > position.column) {
        this.editor.setPosition(position);
        this.instantiationService.invokeFunction((accessor) => {
          CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, this.editor, null);
        });
      }
      this.editor.setPosition(position);
      return this.commandService.executeCommand(InsertLineAfterAction.ID);
    };
    await insertLine(configurationsArrayPosition);
    await this.commandService.executeCommand("editor.action.triggerSuggest");
  }
  get removeInlineValuesScheduler() {
    return new RunOnceScheduler(
      () => {
        this.displayedStore.clear();
        this.oldDecorations.clear();
      },
      100
    );
  }
  get updateInlineValuesScheduler() {
    const model = this.editor.getModel();
    return new RunOnceScheduler(
      async () => await this.updateInlineValueDecorations(this.debugService.getViewModel().focusedStackFrame),
      model ? this.debounceInfo.get(model) : DEAFULT_INLINE_DEBOUNCE_DELAY
    );
  }
  async updateInlineValueDecorations(stackFrame) {
    const var_value_format = "{0} = {1}";
    const separator = ", ";
    const model = this.editor.getModel();
    const inlineValuesSetting = this.configurationService.getValue("debug").inlineValues;
    const inlineValuesTurnedOn = inlineValuesSetting === true || inlineValuesSetting === "on" || inlineValuesSetting === "auto" && model && this.languageFeaturesService.inlineValuesProvider.has(model);
    if (!inlineValuesTurnedOn || !model || !stackFrame || model.uri.toString() !== stackFrame.source.uri.toString()) {
      if (!this.removeInlineValuesScheduler.isScheduled()) {
        this.removeInlineValuesScheduler.schedule();
      }
      return;
    }
    this.removeInlineValuesScheduler.cancel();
    this.displayedStore.clear();
    const viewRanges = this.editor.getVisibleRangesPlusViewportAboveBelow();
    let allDecorations;
    const cts = new CancellationTokenSource();
    this.displayedStore.add(toDisposable(() => cts.dispose(true)));
    if (this.languageFeaturesService.inlineValuesProvider.has(model)) {
      const findVariable = async (_key, caseSensitiveLookup) => {
        const scopes = await stackFrame.getMostSpecificScopes(stackFrame.range);
        const key = caseSensitiveLookup ? _key : _key.toLowerCase();
        for (const scope of scopes) {
          const variables = await scope.getChildren();
          const found = variables.find((v) => caseSensitiveLookup ? v.name === key : v.name.toLowerCase() === key);
          if (found) {
            return found.value;
          }
        }
        return void 0;
      };
      const ctx = {
        frameId: stackFrame.frameId,
        stoppedLocation: new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn + 1, stackFrame.range.endLineNumber, stackFrame.range.endColumn + 1)
      };
      const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();
      allDecorations = [];
      const lineDecorations = /* @__PURE__ */ new Map();
      const promises = providers.flatMap((provider) => viewRanges.map((range) => Promise.resolve(provider.provideInlineValues(model, range, ctx, cts.token)).then(async (result) => {
        if (result) {
          for (const iv of result) {
            let text = void 0;
            switch (iv.type) {
              case "text":
                text = iv.text;
                break;
              case "variable": {
                let va = iv.variableName;
                if (!va) {
                  const lineContent = model.getLineContent(iv.range.startLineNumber);
                  va = lineContent.substring(iv.range.startColumn - 1, iv.range.endColumn - 1);
                }
                const value = await findVariable(va, iv.caseSensitiveLookup);
                if (value) {
                  text = strings.format(var_value_format, va, value);
                }
                break;
              }
              case "expression": {
                let expr = iv.expression;
                if (!expr) {
                  const lineContent = model.getLineContent(iv.range.startLineNumber);
                  expr = lineContent.substring(iv.range.startColumn - 1, iv.range.endColumn - 1);
                }
                if (expr) {
                  const expression = new Expression(expr);
                  await expression.evaluate(stackFrame.thread.session, stackFrame, "watch", true);
                  if (expression.available) {
                    text = strings.format(var_value_format, expr, expression.value);
                  }
                }
                break;
              }
            }
            if (text) {
              const line = iv.range.startLineNumber;
              let lineSegments = lineDecorations.get(line);
              if (!lineSegments) {
                lineSegments = [];
                lineDecorations.set(line, lineSegments);
              }
              if (!lineSegments.some((iv2) => iv2.text === text)) {
                lineSegments.push(new InlineSegment(iv.range.startColumn, text));
              }
            }
          }
        }
      }, (err) => {
        onUnexpectedExternalError(err);
      })));
      const startTime = Date.now();
      await Promise.all(promises);
      this.updateInlineValuesScheduler.delay = this.debounceInfo.update(model, Date.now() - startTime);
      lineDecorations.forEach((segments, line) => {
        if (segments.length > 0) {
          segments = segments.sort((a, b) => a.column - b.column);
          const text = segments.map((s) => s.text).join(separator);
          const editorWidth = this.editor.getLayoutInfo().width;
          const fontInfo = this.editor.getOption(EditorOption.fontInfo);
          const viewportMaxCol = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
          allDecorations.push(...createInlineValueDecoration(line, text, "debug", void 0, viewportMaxCol));
        }
      });
    } else {
      const scopes = await stackFrame.getMostSpecificScopes(stackFrame.range);
      const scopesWithVariables = await Promise.all(scopes.map(async (scope) => ({ scope, variables: await scope.getChildren() })));
      const valuesPerLine = /* @__PURE__ */ new Map();
      for (const { scope, variables } of scopesWithVariables) {
        let scopeRange = new Range(0, 0, stackFrame.range.startLineNumber, stackFrame.range.startColumn);
        if (scope.range) {
          scopeRange = scopeRange.setStartPosition(scope.range.startLineNumber, scope.range.startColumn);
        }
        const ownRanges = viewRanges.map((r) => r.intersectRanges(scopeRange)).filter(isDefined);
        this._wordToLineNumbersMap ??= new WordsToLineNumbersCache(model);
        for (const range of ownRanges) {
          this._wordToLineNumbersMap.ensureRangePopulated(range);
        }
        const mapped = createInlineValueDecorationsInsideRange(variables, ownRanges, model, this._wordToLineNumbersMap.value);
        for (const { line, variables: variables2 } of mapped) {
          let values = valuesPerLine.get(line);
          if (!values) {
            values = /* @__PURE__ */ new Map();
            valuesPerLine.set(line, values);
          }
          for (const { name, value } of variables2) {
            if (!values.has(name)) {
              values.set(name, value);
            }
          }
        }
      }
      allDecorations = [...valuesPerLine.entries()].flatMap(([line, values]) => {
        const text = [...values].map(([n, v]) => `${n} = ${v}`).join(", ");
        const editorWidth = this.editor.getLayoutInfo().width;
        const fontInfo = this.editor.getOption(EditorOption.fontInfo);
        const viewportMaxCol = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
        return createInlineValueDecoration(line, text, "debug", void 0, viewportMaxCol);
      });
    }
    if (cts.token.isCancellationRequested) {
      return;
    }
    let preservePosition;
    if (this.editor.getOption(EditorOption.wordWrap) !== "off") {
      const position = this.editor.getPosition();
      if (position && this.editor.getVisibleRanges().some((r) => r.containsPosition(position))) {
        preservePosition = { position, top: this.editor.getTopForPosition(position.lineNumber, position.column) };
      }
    }
    this.oldDecorations.set(allDecorations);
    if (preservePosition) {
      const top = this.editor.getTopForPosition(preservePosition.position.lineNumber, preservePosition.position.column);
      this.editor.setScrollTop(this.editor.getScrollTop() - (preservePosition.top - top), ScrollType.Immediate);
    }
  }
  dispose() {
    this.hoverWidget?.dispose();
    this.configurationWidget?.dispose();
    this.exceptionWidget?.dispose();
    this.toDispose = dispose(this.toDispose);
  }
};
__decorateClass([
  memoize
], DebugEditorContribution.prototype, "showHoverScheduler", 1);
__decorateClass([
  memoize
], DebugEditorContribution.prototype, "removeInlineValuesScheduler", 1);
__decorateClass([
  memoize
], DebugEditorContribution.prototype, "updateInlineValuesScheduler", 1);
DebugEditorContribution = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IHostService),
  __decorateParam(6, IUriIdentityService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, ILanguageFeaturesService),
  __decorateParam(9, ILanguageFeatureDebounceService),
  __decorateParam(10, IEditorService)
], DebugEditorContribution);
class WordsToLineNumbersCache {
  constructor(model) {
    this.model = model;
    this.value = /* @__PURE__ */ new Map();
    this.intervals = new Uint8Array(Math.ceil(model.getLineCount() / 8));
  }
  /** Ensures that variables names in the given range have been identified. */
  ensureRangePopulated(range) {
    for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
      const bin = lineNumber >> 3;
      const bit = 1 << (lineNumber & 7);
      if (!(this.intervals[bin] & bit)) {
        getWordToLineNumbersMap(this.model, lineNumber, this.value);
        this.intervals[bin] |= bit;
      }
    }
  }
}
CommandsRegistry.registerCommand(
  "_executeInlineValueProvider",
  async (accessor, uri, iRange, context) => {
    assertType(URI.isUri(uri));
    assertType(Range.isIRange(iRange));
    if (!context || typeof context.frameId !== "number" || !Range.isIRange(context.stoppedLocation)) {
      throw illegalArgument("context");
    }
    const model = accessor.get(IModelService).getModel(uri);
    if (!model) {
      throw illegalArgument("uri");
    }
    const range = Range.lift(iRange);
    const { inlineValuesProvider } = accessor.get(ILanguageFeaturesService);
    const providers = inlineValuesProvider.ordered(model);
    const providerResults = await Promise.all(providers.map((provider) => provider.provideInlineValues(model, range, context, CancellationToken.None)));
    return providerResults.flat().filter(isDefined);
  }
);
export {
  DebugEditorContribution,
  createInlineValueDecoration,
  debugInlineBackground,
  debugInlineForeground,
  formatHoverContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdFZGl0b3JDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGlzS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9ldmVudC5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCwgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IGlsbGVnYWxBcmd1bWVudCwgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHZpc2l0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBzZXRQcm9wZXJ0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FZGl0LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0ICogYXMgZW52IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlLCBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBDb25zdGFudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91aW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRWRpdG9yTW91c2VFdmVudCwgSVBhcnRpYWxFZGl0b3JNb3VzZUV2ZW50LCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgSUVkaXRvckhvdmVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9XT1JEX1JFR0VYUCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24sIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVWYWx1ZSwgSW5saW5lVmFsdWVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsLCBJbmplY3RlZFRleHRDdXJzb3JTdG9wcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uLCBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29udGVudEhvdmVyQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvY29udGVudEhvdmVyQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0YXJ0TW9kZSwgSG92ZXJTdGFydFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvaG92ZXJPcGVyYXRpb24uanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IEZsb2F0aW5nRWRpdG9yQ2xpY2tXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvZGVlZGl0b3IuanMnO1xuaW1wb3J0IHsgRGVidWdIb3ZlcldpZGdldCwgU2hvd0RlYnVnSG92ZXJSZXN1bHQgfSBmcm9tICcuL2RlYnVnSG92ZXIuanMnO1xuaW1wb3J0IHsgRXhjZXB0aW9uV2lkZ2V0IH0gZnJvbSAnLi9leGNlcHRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9FWENFUFRJT05fV0lER0VUX1ZJU0lCTEUsIElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElEZWJ1Z0VkaXRvckNvbnRyaWJ1dGlvbiwgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgSUV4Y2VwdGlvbkluZm8sIElFeHByZXNzaW9uLCBJU3RhY2tGcmFtZSwgU3RhdGUgfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgRXhwcmVzc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z01vZGVsLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSW5zZXJ0TGluZUFmdGVyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvbGluZXNPcGVyYXRpb25zL2Jyb3dzZXIvbGluZXNPcGVyYXRpb25zLmpzJztcblxuY29uc3QgTUFYX05VTV9JTkxJTkVfVkFMVUVTID0gMTAwOyAvLyBKUyBHbG9iYWwgc2NvcGUgY2FuIGhhdmUgNzAwKyBlbnRyaWVzLiBXZSB3YW50IHRvIGxpbWl0IG91cnNlbHZlcyBmb3IgcGVyZiByZWFzb25zXG5jb25zdCBNQVhfSU5MSU5FX0RFQ09SQVRPUl9MRU5HVEggPSAxNTA7IC8vIE1heCBzdHJpbmcgbGVuZ3RoIG9mIGVhY2ggaW5saW5lIGRlY29yYXRvciB3aGVuIGRlYnVnZ2luZy4gSWYgZXhjZWVkZWQgLi4uIGlzIGFkZGVkXG5jb25zdCBNQVhfVE9LRU5JWkFUSU9OX0xJTkVfTEVOID0gNTAwOyAvLyBJZiBsaW5lIGlzIHRvbyBsb25nLCB0aGVuIGlubGluZSB2YWx1ZXMgZm9yIHRoZSBsaW5lIGFyZSBza2lwcGVkXG5cbmNvbnN0IERFQUZVTFRfSU5MSU5FX0RFQk9VTkNFX0RFTEFZID0gMjAwO1xuXG5leHBvcnQgY29uc3QgZGVidWdJbmxpbmVGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yLmlubGluZVZhbHVlc0ZvcmVncm91bmQnLCB7XG5cdGRhcms6ICcjZmZmZmZmODAnLFxuXHRsaWdodDogJyMwMDAwMDA4MCcsXG5cdGhjRGFyazogJyNmZmZmZmY4MCcsXG5cdGhjTGlnaHQ6ICcjMDAwMDAwODAnXG59LCBubHMubG9jYWxpemUoJ2VkaXRvci5pbmxpbmVWYWx1ZXNGb3JlZ3JvdW5kJywgXCJDb2xvciBmb3IgdGhlIGRlYnVnIGlubGluZSB2YWx1ZSB0ZXh0LlwiKSk7XG5cbmV4cG9ydCBjb25zdCBkZWJ1Z0lubGluZUJhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuaW5saW5lVmFsdWVzQmFja2dyb3VuZCcsICcjZmZjODAwMzMnLCBubHMubG9jYWxpemUoJ2VkaXRvci5pbmxpbmVWYWx1ZXNCYWNrZ3JvdW5kJywgXCJDb2xvciBmb3IgdGhlIGRlYnVnIGlubGluZSB2YWx1ZSBiYWNrZ3JvdW5kLlwiKSk7XG5cbmNsYXNzIElubGluZVNlZ21lbnQge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgY29sdW1uOiBudW1iZXIsIHB1YmxpYyB0ZXh0OiBzdHJpbmcpIHtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0SG92ZXJDb250ZW50KGNvbnRlbnRUZXh0OiBzdHJpbmcpOiBNYXJrZG93blN0cmluZyB7XG5cdGlmIChjb250ZW50VGV4dC5pbmNsdWRlcygnLCcpICYmIGNvbnRlbnRUZXh0LmluY2x1ZGVzKCc9JykpIHtcblx0XHQvLyBDdXN0b20gc3BsaXQ6IGZvciBlYWNoIGVxdWFscyBzaWduIGFmdGVyIHRoZSBmaXJzdCwgYmFja3RyYWNrIHRvIHRoZSBuZWFyZXN0IGNvbW1hXG5cdFx0Y29uc3QgY3VzdG9tU3BsaXQgPSAodGV4dDogc3RyaW5nKTogc3RyaW5nW10gPT4ge1xuXHRcdFx0Y29uc3Qgc3BsaXRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0bGV0IGVxdWFsc0ZvdW5kID0gMDtcblx0XHRcdGxldCBzdGFydCA9IDA7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHRleHRbaV0gPT09ICc9Jykge1xuXHRcdFx0XHRcdGlmIChlcXVhbHNGb3VuZCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0ZXF1YWxzRm91bmQrKztcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjb21tYUluZGV4ID0gdGV4dC5sYXN0SW5kZXhPZignLCcsIGkpO1xuXHRcdFx0XHRcdGlmIChjb21tYUluZGV4ICE9PSAtMSAmJiBjb21tYUluZGV4ID49IHN0YXJ0KSB7XG5cdFx0XHRcdFx0XHRzcGxpdHMucHVzaChjb21tYUluZGV4KTtcblx0XHRcdFx0XHRcdHN0YXJ0ID0gY29tbWFJbmRleCArIDE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVxdWFsc0ZvdW5kKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGxldCBzID0gMDtcblx0XHRcdGZvciAoY29uc3QgaW5kZXggb2Ygc3BsaXRzKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRleHQuc3Vic3RyaW5nKHMsIGluZGV4KS50cmltKCkpO1xuXHRcdFx0XHRzID0gaW5kZXggKyAxO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHMgPCB0ZXh0Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh0ZXh0LnN1YnN0cmluZyhzKS50cmltKCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcGFpcnMgPSBjdXN0b21TcGxpdChjb250ZW50VGV4dCk7XG5cdFx0Y29uc3QgZm9ybWF0dGVkUGFpcnMgPSBwYWlycy5tYXAocGFpciA9PiB7XG5cdFx0XHRjb25zdCBlcXVhbHNJbmRleCA9IHBhaXIuaW5kZXhPZignPScpO1xuXHRcdFx0aWYgKGVxdWFsc0luZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRjb25zdCBpbmRlbnQgPSAnICcucmVwZWF0KGVxdWFsc0luZGV4ICsgMik7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdExpbmUsIC4uLnJlc3RMaW5lc10gPSBwYWlyLnNwbGl0KC9cXHI/XFxuLyk7XG5cdFx0XHRcdHJldHVybiBbZmlyc3RMaW5lLCAuLi5yZXN0TGluZXMubWFwKGxpbmUgPT4gaW5kZW50ICsgbGluZSldLmpvaW4oJ1xcbicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhaXI7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZENvZGVibG9jaygnJywgZm9ybWF0dGVkUGFpcnMuam9pbignLFxcbicpKTtcblx0fVxuXHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKCcnLCBjb250ZW50VGV4dCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbmxpbmVWYWx1ZURlY29yYXRpb24obGluZU51bWJlcjogbnVtYmVyLCBjb250ZW50VGV4dDogc3RyaW5nLCBjbGFzc05hbWVQcmVmaXg6IHN0cmluZywgY29sdW1uID0gQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsIHZpZXdwb3J0TWF4Q29sOiBudW1iZXIgPSBNQVhfSU5MSU5FX0RFQ09SQVRPUl9MRU5HVEgpOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSB7XG5cdGNvbnN0IHJhd1RleHQgPSBjb250ZW50VGV4dDsgLy8gc3RvcmUgcmF3IHRleHQgZm9yIGhvdmVyIG1lc3NhZ2VcblxuXHQvLyBUcnVuY2F0ZSBjb250ZW50VGV4dCBpZiBpdCBleGNlZWRzIHRoZSB2aWV3cG9ydCBtYXggY29sdW1uXG5cdGlmIChjb250ZW50VGV4dC5sZW5ndGggPiB2aWV3cG9ydE1heENvbCkge1xuXHRcdGNvbnRlbnRUZXh0ID0gY29udGVudFRleHQuc3Vic3RyaW5nKDAsIHZpZXdwb3J0TWF4Q29sKSArICcuLi4nO1xuXHR9XG5cblx0cmV0dXJuIFtcblx0XHR7XG5cdFx0XHRyYW5nZToge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBjb2x1bW4sXG5cdFx0XHRcdGVuZENvbHVtbjogY29sdW1uXG5cdFx0XHR9LFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogYCR7Y2xhc3NOYW1lUHJlZml4fS1pbmxpbmUtdmFsdWUtZGVjb3JhdGlvbi1zcGFjZXJgLFxuXHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IHN0cmluZ3Mubm9CcmVha1doaXRlc3BhY2UsXG5cdFx0XHRcdFx0Y3Vyc29yU3RvcHM6IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLk5vbmVcblx0XHRcdFx0fSxcblx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLFxuXHRcdFx0XHRzdGFydENvbHVtbjogY29sdW1uLFxuXHRcdFx0XHRlbmRDb2x1bW46IGNvbHVtblxuXHRcdFx0fSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGAke2NsYXNzTmFtZVByZWZpeH0taW5saW5lLXZhbHVlLWRlY29yYXRpb25gLFxuXHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdGNvbnRlbnQ6IHJlcGxhY2VXc1dpdGhOb0JyZWFrV3MoY29udGVudFRleHQpLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogYCR7Y2xhc3NOYW1lUHJlZml4fS1pbmxpbmUtdmFsdWVgLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiB0cnVlLFxuXHRcdFx0XHRcdGN1cnNvclN0b3BzOiBJbmplY3RlZFRleHRDdXJzb3JTdG9wcy5Ob25lXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0aG92ZXJNZXNzYWdlOiBmb3JtYXRIb3ZlckNvbnRlbnQocmF3VGV4dClcblx0XHRcdH1cblx0XHR9LFxuXHRdO1xufVxuXG5mdW5jdGlvbiByZXBsYWNlV3NXaXRoTm9CcmVha1dzKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHN0ci5yZXBsYWNlKC9bIFxcdFxcbl0vZywgc3RyaW5ncy5ub0JyZWFrV2hpdGVzcGFjZSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbnNJbnNpZGVSYW5nZShleHByZXNzaW9uczogUmVhZG9ubHlBcnJheTxJRXhwcmVzc2lvbj4sIHJhbmdlczogUmFuZ2VbXSwgbW9kZWw6IElUZXh0TW9kZWwsIHdvcmRUb0xpbmVOdW1iZXJzTWFwOiBNYXA8c3RyaW5nLCBudW1iZXJbXT4pIHtcblx0Y29uc3QgbmFtZVZhbHVlTWFwID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCBleHByIG9mIGV4cHJlc3Npb25zKSB7XG5cdFx0bmFtZVZhbHVlTWFwLnNldChleHByLm5hbWUsIGV4cHIudmFsdWUpO1xuXHRcdC8vIExpbWl0IHRoZSBzaXplIG9mIG1hcC4gVG9vIGxhcmdlIGNhbiBoYXZlIGEgcGVyZiBpbXBhY3Rcblx0XHRpZiAobmFtZVZhbHVlTWFwLnNpemUgPj0gTUFYX05VTV9JTkxJTkVfVkFMVUVTKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRjb25zdCBsaW5lVG9OYW1lc01hcDogTWFwPG51bWJlciwgc3RyaW5nW10+ID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZ1tdPigpO1xuXG5cdC8vIENvbXB1dGUgdW5pcXVlIHNldCBvZiBuYW1lcyBvbiBlYWNoIGxpbmVcblx0bmFtZVZhbHVlTWFwLmZvckVhY2goKF92YWx1ZSwgbmFtZSkgPT4ge1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJzID0gd29yZFRvTGluZU51bWJlcnNNYXAuZ2V0KG5hbWUpO1xuXHRcdGlmIChsaW5lTnVtYmVycykge1xuXHRcdFx0Zm9yIChjb25zdCBsaW5lTnVtYmVyIG9mIGxpbmVOdW1iZXJzKSB7XG5cdFx0XHRcdGlmIChyYW5nZXMuc29tZShyID0+IGxpbmVOdW1iZXIgPj0gci5zdGFydExpbmVOdW1iZXIgJiYgbGluZU51bWJlciA8PSByLmVuZExpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0aWYgKCFsaW5lVG9OYW1lc01hcC5oYXMobGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRcdGxpbmVUb05hbWVzTWFwLnNldChsaW5lTnVtYmVyLCBbXSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGxpbmVUb05hbWVzTWFwLmdldChsaW5lTnVtYmVyKSEuaW5kZXhPZihuYW1lKSA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdGxpbmVUb05hbWVzTWFwLmdldChsaW5lTnVtYmVyKSEucHVzaChuYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdC8vIENvbXB1dGUgZGVjb3JhdG9ycyBmb3IgZWFjaCBsaW5lXG5cdHJldHVybiBbLi4ubGluZVRvTmFtZXNNYXBdLm1hcCgoW2xpbmUsIG5hbWVzXSkgPT4gKHtcblx0XHRsaW5lLFxuXHRcdHZhcmlhYmxlczogbmFtZXMuc29ydCgoZmlyc3QsIHNlY29uZCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmUpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQuaW5kZXhPZihmaXJzdCkgLSBjb250ZW50LmluZGV4T2Yoc2Vjb25kKTtcblx0XHR9KS5tYXAobmFtZSA9PiAoeyBuYW1lLCB2YWx1ZTogbmFtZVZhbHVlTWFwLmdldChuYW1lKSEgfSkpXG5cdH0pKTtcbn1cblxuZnVuY3Rpb24gZ2V0V29yZFRvTGluZU51bWJlcnNNYXAobW9kZWw6IElUZXh0TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgcmVzdWx0OiBNYXA8c3RyaW5nLCBudW1iZXJbXT4pIHtcblx0Y29uc3QgbGluZUxlbmd0aCA9IG1vZGVsLmdldExpbmVMZW5ndGgobGluZU51bWJlcik7XG5cdC8vIElmIGxpbmUgaXMgdG9vIGxvbmcgdGhlbiBza2lwIHRoZSBsaW5lXG5cdGlmIChsaW5lTGVuZ3RoID4gTUFYX1RPS0VOSVpBVElPTl9MSU5FX0xFTikge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0Y29uc3QgbGluZVRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRmb3IgKGxldCB0b2tlbkluZGV4ID0gMCwgdG9rZW5Db3VudCA9IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTsgdG9rZW5JbmRleCA8IHRva2VuQ291bnQ7IHRva2VuSW5kZXgrKykge1xuXHRcdGNvbnN0IHRva2VuVHlwZSA9IGxpbmVUb2tlbnMuZ2V0U3RhbmRhcmRUb2tlblR5cGUodG9rZW5JbmRleCk7XG5cblx0XHQvLyBUb2tlbiBpcyBhIHdvcmQgYW5kIG5vdCBhIGNvbW1lbnRcblx0XHRpZiAodG9rZW5UeXBlID09PSBTdGFuZGFyZFRva2VuVHlwZS5PdGhlcikge1xuXHRcdFx0REVGQVVMVF9XT1JEX1JFR0VYUC5sYXN0SW5kZXggPSAwOyAvLyBXZSBhc3N1bWUgdG9rZW5zIHdpbGwgdXN1YWxseSBtYXAgMToxIHRvIHdvcmRzIGlmIHRoZXkgbWF0Y2hcblxuXHRcdFx0Y29uc3QgdG9rZW5TdGFydE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRjb25zdCB0b2tlbkVuZE9mZnNldCA9IGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KHRva2VuSW5kZXgpO1xuXHRcdFx0Y29uc3QgdG9rZW5TdHIgPSBsaW5lQ29udGVudC5zdWJzdHJpbmcodG9rZW5TdGFydE9mZnNldCwgdG9rZW5FbmRPZmZzZXQpO1xuXHRcdFx0Y29uc3Qgd29yZE1hdGNoID0gREVGQVVMVF9XT1JEX1JFR0VYUC5leGVjKHRva2VuU3RyKTtcblxuXHRcdFx0aWYgKHdvcmRNYXRjaCkge1xuXG5cdFx0XHRcdGNvbnN0IHdvcmQgPSB3b3JkTWF0Y2hbMF07XG5cdFx0XHRcdGlmICghcmVzdWx0Lmhhcyh3b3JkKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5zZXQod29yZCwgW10pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzdWx0LmdldCh3b3JkKSEucHVzaChsaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlYnVnRWRpdG9yQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSURlYnVnRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHRvRGlzcG9zZTogSURpc3Bvc2FibGVbXTtcblx0cHJpdmF0ZSBob3ZlcldpZGdldDogRGVidWdIb3ZlcldpZGdldDtcblx0cHJpdmF0ZSBob3ZlclBvc2l0aW9uPzogeyBwb3NpdGlvbjogUG9zaXRpb247IGV2ZW50OiBJTW91c2VFdmVudCB9O1xuXHRwcml2YXRlIG1vdXNlRG93biA9IGZhbHNlO1xuXHRwcml2YXRlIGV4Y2VwdGlvbldpZGdldFZpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGd1dHRlcklzSG92ZXJlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgZXhjZXB0aW9uV2lkZ2V0OiBFeGNlcHRpb25XaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29uZmlndXJhdGlvbldpZGdldDogRmxvYXRpbmdFZGl0b3JDbGlja1dpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBhbHRMaXN0ZW5lciA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpO1xuXHRwcml2YXRlIGFsdFByZXNzZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBvbGREZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwbGF5ZWRTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBlZGl0b3JIb3Zlck9wdGlvbnM6IElFZGl0b3JIb3Zlck9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVib3VuY2VJbmZvOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb247XG5cdHByaXZhdGUgYWxsb3dTY3JvbGxUb0V4Y2VwdGlvbldpZGdldCA9IHRydWU7XG5cdHByaXZhdGUgc2hvdWxkU2Nyb2xsVG9FeGNlcHRpb25XaWRnZXQgPSAoKSA9PiB0aGlzLmFsbG93U2Nyb2xsVG9FeGNlcHRpb25XaWRnZXQ7XG5cblx0Ly8gSG9sZHMgYSBEaXNwb3NhYmxlIHRoYXQgcHJldmVudHMgdGhlIGRlZmF1bHQgZWRpdG9yIGhvdmVyIGJlaGF2aW9yIHdoaWxlIGl0IGV4aXN0cy5cblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0SG92ZXJMb2Nrb3V0ID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSBmZWF0dXJlRGVib3VuY2VTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMub2xkRGVjb3JhdGlvbnMgPSB0aGlzLmVkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLmRlYm91bmNlSW5mbyA9IGZlYXR1cmVEZWJvdW5jZVNlcnZpY2UuZm9yKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZVZhbHVlc1Byb3ZpZGVyLCAnSW5saW5lVmFsdWVzJywgeyBtaW46IERFQUZVTFRfSU5MSU5FX0RFQk9VTkNFX0RFTEFZIH0pO1xuXHRcdHRoaXMuaG92ZXJXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlYnVnSG92ZXJXaWRnZXQsIHRoaXMuZWRpdG9yKTtcblx0XHR0aGlzLnRvRGlzcG9zZSA9IFt0aGlzLmRlZmF1bHRIb3ZlckxvY2tvdXQsIHRoaXMuYWx0TGlzdGVuZXIsIHRoaXMuZGlzcGxheWVkU3RvcmVdO1xuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldFZpc2libGUgPSBDT05URVhUX0VYQ0VQVElPTl9XSURHRVRfVklTSUJMRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudG9nZ2xlRXhjZXB0aW9uV2lkZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkub25EaWRGb2N1c1N0YWNrRnJhbWUoZSA9PiB0aGlzLm9uRm9jdXNTdGFja0ZyYW1lKGUuc3RhY2tGcmFtZSkpKTtcblxuXHRcdC8vIGhvdmVyIGxpc3RlbmVycyAmIGhvdmVyIHdpZGdldFxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25Nb3VzZURvd24oKGU6IElFZGl0b3JNb3VzZUV2ZW50KSA9PiB0aGlzLm9uRWRpdG9yTW91c2VEb3duKGUpKSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbk1vdXNlVXAoKCkgPT4gdGhpcy5tb3VzZURvd24gPSBmYWxzZSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25Nb3VzZU1vdmUoKGU6IElFZGl0b3JNb3VzZUV2ZW50KSA9PiB0aGlzLm9uRWRpdG9yTW91c2VNb3ZlKGUpKSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbk1vdXNlTGVhdmUoKGU6IElQYXJ0aWFsRWRpdG9yTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgaG92ZXJEb21Ob2RlID0gdGhpcy5ob3ZlcldpZGdldC5nZXREb21Ob2RlKCk7XG5cdFx0XHRpZiAoIWhvdmVyRG9tTm9kZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlY3QgPSBob3ZlckRvbU5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHQvLyBPbmx5IGhpZGUgdGhlIGhvdmVyIHdpZGdldCBpZiB0aGUgZWRpdG9yIG1vdXNlIGxlYXZlIGV2ZW50IGlzIG91dHNpZGUgdGhlIGhvdmVyIHdpZGdldCAjMzUyOFxuXHRcdFx0aWYgKGUuZXZlbnQucG9zeCA8IHJlY3QubGVmdCB8fCBlLmV2ZW50LnBvc3ggPiByZWN0LnJpZ2h0IHx8IGUuZXZlbnQucG9zeSA8IHJlY3QudG9wIHx8IGUuZXZlbnQucG9zeSA+IHJlY3QuYm90dG9tKSB7XG5cdFx0XHRcdHRoaXMuaGlkZUhvdmVyV2lkZ2V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25LZXlEb3duKChlOiBJS2V5Ym9hcmRFdmVudCkgPT4gdGhpcy5vbktleURvd24oZSkpKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdHRoaXMuX3dvcmRUb0xpbmVOdW1iZXJzTWFwID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy51cGRhdGVJbmxpbmVWYWx1ZXNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbldpbGxVcGRhdGVWaWV3cygoKSA9PiB0aGlzLnVwZGF0ZUlubGluZVZhbHVlc1NjaGVkdWxlci5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEV2YWx1YXRlTGF6eUV4cHJlc3Npb24oKCkgPT4gdGhpcy51cGRhdGVJbmxpbmVWYWx1ZXNTY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbChhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLmFkZERvY3VtZW50TGlzdGVuZXJzKCk7XG5cdFx0XHR0aGlzLnRvZ2dsZUV4Y2VwdGlvbldpZGdldCgpO1xuXHRcdFx0dGhpcy5oaWRlSG92ZXJXaWRnZXQoKTtcblx0XHRcdHRoaXMuX3dvcmRUb0xpbmVOdW1iZXJzTWFwID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdFx0YXdhaXQgdGhpcy51cGRhdGVJbmxpbmVWYWx1ZURlY29yYXRpb25zKHN0YWNrRnJhbWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuaGlkZUhvdmVyV2lkZ2V0KCk7XG5cblx0XHRcdC8vIElubGluZSB2YWx1ZSBwcm92aWRlciBzaG91bGQgZ2V0IGNhbGxlZCBvbiB2aWV3IHBvcnQgY2hhbmdlXG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAobW9kZWwgJiYgdGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVWYWx1ZXNQcm92aWRlci5oYXMobW9kZWwpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW5saW5lVmFsdWVzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuaG92ZXInKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUhvdmVyQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZGVidWdTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUoKHN0YXRlOiBTdGF0ZSkgPT4ge1xuXHRcdFx0aWYgKHN0YXRlICE9PSBTdGF0ZS5TdG9wcGVkKSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlRXhjZXB0aW9uV2lkZ2V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVIb3ZlckNvbmZpZ3VyYXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX3dvcmRUb0xpbmVOdW1iZXJzTWFwOiBXb3Jkc1RvTGluZU51bWJlcnNDYWNoZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHVwZGF0ZUhvdmVyQ29uZmlndXJhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHR0aGlzLmVkaXRvckhvdmVyT3B0aW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvckhvdmVyT3B0aW9ucz4oJ2VkaXRvci5ob3ZlcicsIHtcblx0XHRcdFx0cmVzb3VyY2U6IG1vZGVsLnVyaSxcblx0XHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiBtb2RlbC5nZXRMYW5ndWFnZUlkKClcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkRG9jdW1lbnRMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhY2tGcmFtZSA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHRoaXMuYXBwbHlEb2N1bWVudExpc3RlbmVycyhtb2RlbCwgc3RhY2tGcmFtZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBseURvY3VtZW50TGlzdGVuZXJzKG1vZGVsOiBJVGV4dE1vZGVsLCBzdGFja0ZyYW1lOiBJU3RhY2tGcmFtZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghc3RhY2tGcmFtZSB8fCAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwobW9kZWwudXJpLCBzdGFja0ZyYW1lLnNvdXJjZS51cmkpKSB7XG5cdFx0XHR0aGlzLmFsdExpc3RlbmVyLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3duZXJEb2N1bWVudCA9IHRoaXMuZWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKS5vd25lckRvY3VtZW50O1xuXG5cdFx0Ly8gV2hlbiB0aGUgYWx0IGtleSBpcyBwcmVzc2VkIHNob3cgcmVndWxhciBlZGl0b3IgaG92ZXIgYW5kIGhpZGUgdGhlIGRlYnVnIGhvdmVyICM4NDU2MVxuXHRcdHRoaXMuYWx0TGlzdGVuZXIudmFsdWUgPSBhZGREaXNwb3NhYmxlTGlzdGVuZXIob3duZXJEb2N1bWVudCwgJ2tleWRvd24nLCBrZXlkb3duRXZlbnQgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhbmRhcmRLZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChrZXlkb3duRXZlbnQpO1xuXHRcdFx0aWYgKHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkFsdCkge1xuXHRcdFx0XHR0aGlzLmFsdFByZXNzZWQgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBkZWJ1Z0hvdmVyV2FzVmlzaWJsZSA9IHRoaXMuaG92ZXJXaWRnZXQuaXNWaXNpYmxlKCk7XG5cdFx0XHRcdHRoaXMuaG92ZXJXaWRnZXQuaGlkZSgpO1xuXHRcdFx0XHR0aGlzLmRlZmF1bHRIb3ZlckxvY2tvdXQuY2xlYXIoKTtcblxuXHRcdFx0XHRpZiAoZGVidWdIb3Zlcldhc1Zpc2libGUgJiYgdGhpcy5ob3ZlclBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlIGRlYnVnIGhvdmVyIHdhcyB2aXNpYmxlIGltbWVkaWF0ZWx5IHNob3cgdGhlIGVkaXRvciBob3ZlciBmb3IgdGhlIGFsdCB0cmFuc2l0aW9uIHRvIGJlIHNtb290aFxuXHRcdFx0XHRcdHRoaXMuc2hvd0VkaXRvckhvdmVyKHRoaXMuaG92ZXJQb3NpdGlvbi5wb3NpdGlvbiwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgb25LZXlVcCA9IG5ldyBEb21FbWl0dGVyKG93bmVyRG9jdW1lbnQsICdrZXl1cCcpO1xuXHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IEV2ZW50LmFueTxLZXlib2FyZEV2ZW50IHwgYm9vbGVhbj4odGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzLCBvbktleVVwLmV2ZW50KShrZXl1cEV2ZW50ID0+IHtcblx0XHRcdFx0XHRsZXQgc3RhbmRhcmRLZXlib2FyZEV2ZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChpc0tleWJvYXJkRXZlbnQoa2V5dXBFdmVudCkpIHtcblx0XHRcdFx0XHRcdHN0YW5kYXJkS2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoa2V5dXBFdmVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghc3RhbmRhcmRLZXlib2FyZEV2ZW50IHx8IHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkFsdCkge1xuXHRcdFx0XHRcdFx0dGhpcy5hbHRQcmVzc2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR0aGlzLnByZXZlbnREZWZhdWx0RWRpdG9ySG92ZXIoKTtcblx0XHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdG9uS2V5VXAuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBzaG93SG92ZXIocG9zaXRpb246IFBvc2l0aW9uLCBmb2N1czogYm9vbGVhbiwgbW91c2VFdmVudD86IElNb3VzZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gbm9ybWFsbHkgd2lsbCBhbHJlYWR5IGJlIHNldCBpbiBgc2hvd0hvdmVyU2NoZWR1bGVyYCwgYnV0IHB1YmxpYyBjYWxsZXJzIG1heSBoaXQgdGhpcyBkaXJlY3RseTpcblx0XHR0aGlzLnByZXZlbnREZWZhdWx0RWRpdG9ySG92ZXIoKTtcblxuXHRcdGNvbnN0IHNmID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChzZiAmJiBtb2RlbCAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzZi5zb3VyY2UudXJpLCBtb2RlbC51cmkpKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmhvdmVyV2lkZ2V0LnNob3dBdChwb3NpdGlvbiwgZm9jdXMsIG1vdXNlRXZlbnQpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gU2hvd0RlYnVnSG92ZXJSZXN1bHQuTk9UX0FWQUlMQUJMRSkge1xuXHRcdFx0XHQvLyBXaGVuIG5vIGV4cHJlc3Npb24gYXZhaWxhYmxlIGZhbGxiYWNrIHRvIGVkaXRvciBob3ZlclxuXHRcdFx0XHR0aGlzLnNob3dFZGl0b3JIb3Zlcihwb3NpdGlvbiwgZm9jdXMpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNob3dFZGl0b3JIb3Zlcihwb3NpdGlvbiwgZm9jdXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJldmVudERlZmF1bHRFZGl0b3JIb3ZlcigpIHtcblx0XHRpZiAodGhpcy5kZWZhdWx0SG92ZXJMb2Nrb3V0LnZhbHVlIHx8IHRoaXMuZWRpdG9ySG92ZXJPcHRpb25zPy5lbmFibGVkID09PSAnb2ZmJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvdmVyQ29udHJvbGxlciA9IHRoaXMuZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxDb250ZW50SG92ZXJDb250cm9sbGVyPihDb250ZW50SG92ZXJDb250cm9sbGVyLklEKTtcblx0XHRob3ZlckNvbnRyb2xsZXI/LmhpZGVDb250ZW50SG92ZXIoKTtcblxuXHRcdHRoaXMuZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBob3ZlcjogeyBlbmFibGVkOiAnb2ZmJyB9IH0pO1xuXHRcdHRoaXMuZGVmYXVsdEhvdmVyTG9ja291dC52YWx1ZSA9IHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0aG92ZXI6IHsgZW5hYmxlZDogdGhpcy5lZGl0b3JIb3Zlck9wdGlvbnM/LmVuYWJsZWQgPz8gJ29uJyB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHNob3dFZGl0b3JIb3Zlcihwb3NpdGlvbjogUG9zaXRpb24sIGZvY3VzOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgaG92ZXJDb250cm9sbGVyID0gdGhpcy5lZGl0b3IuZ2V0Q29udHJpYnV0aW9uPENvbnRlbnRIb3ZlckNvbnRyb2xsZXI+KENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuSUQpO1xuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHQvLyBlbmFibGUgdGhlIGVkaXRvciBob3Zlciwgb3RoZXJ3aXNlIHRoZSBjb250ZW50IGNvbnRyb2xsZXIgd2lsbCBzZWUgaXRcblx0XHQvLyBhcyBkaXNhYmxlZCBhbmQgaGlkZSBpdCBvbiB0aGUgZmlyc3QgbW91c2UgbW92ZSAoIzE5MzE0OSlcblx0XHR0aGlzLmRlZmF1bHRIb3ZlckxvY2tvdXQuY2xlYXIoKTtcblx0XHRob3ZlckNvbnRyb2xsZXI/LnNob3dDb250ZW50SG92ZXIocmFuZ2UsIEhvdmVyU3RhcnRNb2RlLkltbWVkaWF0ZSwgSG92ZXJTdGFydFNvdXJjZS5Nb3VzZSwgZm9jdXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvbkZvY3VzU3RhY2tGcmFtZShzZjogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHR0aGlzLmFwcGx5RG9jdW1lbnRMaXN0ZW5lcnMobW9kZWwsIHNmKTtcblx0XHRcdGlmIChzZiAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChzZi5zb3VyY2UudXJpLCBtb2RlbC51cmkpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudG9nZ2xlRXhjZXB0aW9uV2lkZ2V0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmhpZGVIb3ZlcldpZGdldCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlSW5saW5lVmFsdWVEZWNvcmF0aW9ucyhzZik7XG5cdH1cblxuXHRwcml2YXRlIGdldCBob3ZlckRlbGF5KCkge1xuXHRcdGNvbnN0IGJhc2VEZWxheSA9IHRoaXMuZWRpdG9ySG92ZXJPcHRpb25zPy5kZWxheSB8fCAwO1xuXG5cdFx0Ly8gaGV1cmlzdGljIHRvIGdldCBhICdnb29kJyBidXQgY29uZmlndXJhYmxlIGRlbGF5IGZvciBldmFsdWF0aW9uLiBUaGVcblx0XHQvLyBkZWJ1ZyBob3ZlciBjYW4gYmUgdmVyeSBsYXJnZSwgc28gd2UgdGVuZCB0byBiZSBtb3JlIGNvbnNlcnZhdGl2ZSBhYm91dFxuXHRcdC8vIHdoZW4gdG8gc2hvdyBpdCAoIzE4MDYyMSkuIFdpdGggdGhpcyBlcXVhdGlvbjpcblx0XHQvLyAtIGRlZmF1bHQgMzAwbXMgaG92ZXIgPT4gKiAyICAgPSA2MDBtc1xuXHRcdC8vIC0gc2hvcnQgICAxMDBtcyBob3ZlciA9PiAqIDIgICA9IDIwMG1zXG5cdFx0Ly8gLSBsb25nZXIgIDYwMG1zIGhvdmVyID0+ICogMS41ID0gOTAwbXNcblx0XHQvLyAtIGxvbmcgICAxMDAwbXMgaG92ZXIgPT4gKiAxLjAgPSAxMDAwbXNcblx0XHRjb25zdCBkZWxheUZhY3RvciA9IGNsYW1wKDIgLSAoYmFzZURlbGF5IC0gMzAwKSAvIDYwMCwgMSwgMik7XG5cblx0XHRyZXR1cm4gYmFzZURlbGF5ICogZGVsYXlGYWN0b3I7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRwcml2YXRlIGdldCBzaG93SG92ZXJTY2hlZHVsZXIoKSB7XG5cdFx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaG92ZXJQb3NpdGlvbiAmJiAhdGhpcy5hbHRQcmVzc2VkKSB7XG5cdFx0XHRcdHRoaXMuc2hvd0hvdmVyKHRoaXMuaG92ZXJQb3NpdGlvbi5wb3NpdGlvbiwgZmFsc2UsIHRoaXMuaG92ZXJQb3NpdGlvbi5ldmVudCk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcy5ob3ZlckRlbGF5KTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHNjaGVkdWxlcik7XG5cblx0XHRyZXR1cm4gc2NoZWR1bGVyO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlSG92ZXJXaWRnZXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaG92ZXJXaWRnZXQud2lsbEJlVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLmhvdmVyV2lkZ2V0LmhpZGUoKTtcblx0XHR9XG5cdFx0dGhpcy5zaG93SG92ZXJTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5kZWZhdWx0SG92ZXJMb2Nrb3V0LmNsZWFyKCk7XG5cdH1cblxuXHQvLyBob3ZlciBidXNpbmVzc1xuXG5cdHByaXZhdGUgb25FZGl0b3JNb3VzZURvd24obW91c2VFdmVudDogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLm1vdXNlRG93biA9IHRydWU7XG5cdFx0aWYgKG1vdXNlRXZlbnQudGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1dJREdFVCAmJiBtb3VzZUV2ZW50LnRhcmdldC5kZXRhaWwgPT09IERlYnVnSG92ZXJXaWRnZXQuSUQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmhpZGVIb3ZlcldpZGdldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlTW92ZShtb3VzZUV2ZW50OiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSAhPT0gU3RhdGUuU3RvcHBlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IG1vdXNlRXZlbnQudGFyZ2V0O1xuXHRcdGNvbnN0IHN0b3BLZXkgPSBlbnYuaXNNYWNpbnRvc2ggPyAnbWV0YUtleScgOiAnY3RybEtleSc7XG5cblx0XHRpZiAoIXRoaXMuYWx0UHJlc3NlZCkge1xuXHRcdFx0aWYgKHRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuR1VUVEVSX0dMWVBIX01BUkdJTikge1xuXHRcdFx0XHR0aGlzLmRlZmF1bHRIb3ZlckxvY2tvdXQuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5ndXR0ZXJJc0hvdmVyZWQgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmd1dHRlcklzSG92ZXJlZCkge1xuXHRcdFx0XHR0aGlzLmd1dHRlcklzSG92ZXJlZCA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUhvdmVyQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdCh0YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfV0lER0VUICYmIHRhcmdldC5kZXRhaWwgPT09IERlYnVnSG92ZXJXaWRnZXQuSUQpXG5cdFx0XHR8fCB0aGlzLmhvdmVyV2lkZ2V0LmlzSW5TYWZlVHJpYW5nbGUobW91c2VFdmVudC5ldmVudC5wb3N4LCBtb3VzZUV2ZW50LmV2ZW50LnBvc3kpXG5cdFx0KSB7XG5cdFx0XHQvLyBtb3VzZSBtb3ZlZCBvbiB0b3Agb2YgZGVidWcgaG92ZXIgd2lkZ2V0XG5cblx0XHRcdGNvbnN0IHN0aWNreSA9IHRoaXMuZWRpdG9ySG92ZXJPcHRpb25zPy5zdGlja3kgPz8gdHJ1ZTtcblx0XHRcdGlmIChzdGlja3kgfHwgdGhpcy5ob3ZlcldpZGdldC5pc1Nob3dpbmdDb21wbGV4VmFsdWUgfHwgbW91c2VFdmVudC5ldmVudFtzdG9wS2V5XSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUKSB7XG5cdFx0XHRpZiAodGFyZ2V0LnBvc2l0aW9uICYmICFQb3NpdGlvbi5lcXVhbHModGFyZ2V0LnBvc2l0aW9uLCB0aGlzLmhvdmVyUG9zaXRpb24/LnBvc2l0aW9uIHx8IG51bGwpICYmICF0aGlzLmhvdmVyV2lkZ2V0LmlzSW5TYWZlVHJpYW5nbGUobW91c2VFdmVudC5ldmVudC5wb3N4LCBtb3VzZUV2ZW50LmV2ZW50LnBvc3kpKSB7XG5cdFx0XHRcdHRoaXMuaG92ZXJQb3NpdGlvbiA9IHsgcG9zaXRpb246IHRhcmdldC5wb3NpdGlvbiwgZXZlbnQ6IG1vdXNlRXZlbnQuZXZlbnQgfTtcblx0XHRcdFx0Ly8gRGlzYWJsZSB0aGUgZWRpdG9yIGhvdmVyIGR1cmluZyB0aGUgcmVxdWVzdCB0byBhdm9pZCBmbGlja2VyaW5nXG5cdFx0XHRcdHRoaXMucHJldmVudERlZmF1bHRFZGl0b3JIb3ZlcigpO1xuXHRcdFx0XHR0aGlzLnNob3dIb3ZlclNjaGVkdWxlci5zY2hlZHVsZSh0aGlzLmhvdmVyRGVsYXkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXRoaXMubW91c2VEb3duKSB7XG5cdFx0XHQvLyBEbyBub3QgaGlkZSBkZWJ1ZyBob3ZlciB3aGVuIHRoZSBtb3VzZSBpcyBwcmVzc2VkIGJlY2F1c2UgaXQgdXN1YWxseSBsZWFkcyB0byBhY2NpZGVudGFsIGNsb3NpbmcgIzY0NjIwXG5cdFx0XHR0aGlzLmhpZGVIb3ZlcldpZGdldCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25LZXlEb3duKGU6IElLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcEtleSA9IGVudi5pc01hY2ludG9zaCA/IEtleUNvZGUuTWV0YSA6IEtleUNvZGUuQ3RybDtcblx0XHRpZiAoZS5rZXlDb2RlICE9PSBzdG9wS2V5ICYmIGUua2V5Q29kZSAhPT0gS2V5Q29kZS5BbHQpIHtcblx0XHRcdC8vIGRvIG5vdCBoaWRlIGhvdmVyIHdoZW4gQ3RybC9NZXRhIGlzIHByZXNzZWQsIGFuZCBhbHQgaXMgaGFuZGxlZCBzZXBhcmF0ZWx5XG5cdFx0XHR0aGlzLmhpZGVIb3ZlcldpZGdldCgpO1xuXHRcdH1cblx0fVxuXHQvLyBlbmQgaG92ZXIgYnVzaW5lc3NcblxuXHQvLyBleGNlcHRpb24gd2lkZ2V0XG5cdHByaXZhdGUgYXN5bmMgdG9nZ2xlRXhjZXB0aW9uV2lkZ2V0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFRvZ2dsZXMgZXhjZXB0aW9uIHdpZGdldCBiYXNlZCBvbiB0aGUgc3RhdGUgb2YgdGhlIGN1cnJlbnQgZWRpdG9yIG1vZGVsIGFuZCBkZWJ1ZyBzdGFjayBmcmFtZVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBmb2N1c2VkU2YgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRjb25zdCBjYWxsU3RhY2sgPSBmb2N1c2VkU2YgPyBmb2N1c2VkU2YudGhyZWFkLmdldENhbGxTdGFjaygpIDogbnVsbDtcblx0XHRpZiAoIW1vZGVsIHx8ICFmb2N1c2VkU2YgfHwgIWNhbGxTdGFjayB8fCBjYWxsU3RhY2subGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLmNsb3NlRXhjZXB0aW9uV2lkZ2V0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRmlyc3QgY2FsbCBzdGFjayBmcmFtZSB0aGF0IGlzIGF2YWlsYWJsZSBpcyB0aGUgZnJhbWUgd2hlcmUgZXhjZXB0aW9uIGhhcyBiZWVuIHRocm93blxuXHRcdGNvbnN0IGV4Y2VwdGlvblNmID0gY2FsbFN0YWNrLmZpbmQoc2YgPT4gISEoc2YgJiYgc2Yuc291cmNlICYmIHNmLnNvdXJjZS5hdmFpbGFibGUgJiYgc2Yuc291cmNlLnByZXNlbnRhdGlvbkhpbnQgIT09ICdkZWVtcGhhc2l6ZScpKTtcblx0XHRpZiAoIWV4Y2VwdGlvblNmIHx8IGV4Y2VwdGlvblNmICE9PSBmb2N1c2VkU2YpIHtcblx0XHRcdHRoaXMuY2xvc2VFeGNlcHRpb25XaWRnZXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzYW1lVXJpID0gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZXhjZXB0aW9uU2Yuc291cmNlLnVyaSwgbW9kZWwudXJpKTtcblx0XHRpZiAodGhpcy5leGNlcHRpb25XaWRnZXQgJiYgIXNhbWVVcmkpIHtcblx0XHRcdHRoaXMuY2xvc2VFeGNlcHRpb25XaWRnZXQoKTtcblx0XHR9IGVsc2UgaWYgKHNhbWVVcmkpIHtcblx0XHRcdC8vIFNob3cgZXhjZXB0aW9uIHdpZGdldCBpbiBhbGwgZWRpdG9ycyB3aXRoIHRoZSBzYW1lIGZpbGUsIGJ1dCBvbmx5IHNjcm9sbCBpbiB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdFx0Y29uc3QgYWN0aXZlQ29udHJvbCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdGNvbnN0IGlzQWN0aXZlRWRpdG9yID0gYWN0aXZlQ29udHJvbCA9PT0gdGhpcy5lZGl0b3I7XG5cdFx0XHRjb25zdCBleGNlcHRpb25JbmZvID0gYXdhaXQgZm9jdXNlZFNmLnRocmVhZC5leGNlcHRpb25JbmZvO1xuXG5cdFx0XHRpZiAoZXhjZXB0aW9uSW5mbykge1xuXHRcdFx0XHRpZiAoaXNBY3RpdmVFZGl0b3IpIHtcblx0XHRcdFx0XHQvLyBBY3RpdmUgZWRpdG9yOiBzaG93IHdpZGdldCBhbmQgc2Nyb2xsIHRvIGl0XG5cdFx0XHRcdFx0dGhpcy5zaG93RXhjZXB0aW9uV2lkZ2V0KGV4Y2VwdGlvbkluZm8sIHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uLCBleGNlcHRpb25TZi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGV4Y2VwdGlvblNmLnJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBJbmFjdGl2ZSBlZGl0b3I6IHNob3cgd2lkZ2V0IHdpdGhvdXQgc2Nyb2xsaW5nXG5cdFx0XHRcdFx0dGhpcy5zaG93RXhjZXB0aW9uV2lkZ2V0V2l0aG91dFNjcm9sbChleGNlcHRpb25JbmZvLCB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbiwgZXhjZXB0aW9uU2YucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBleGNlcHRpb25TZi5yYW5nZS5zdGFydENvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3dFeGNlcHRpb25XaWRnZXQoZXhjZXB0aW9uSW5mbzogSUV4Y2VwdGlvbkluZm8sIGRlYnVnU2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmV4Y2VwdGlvbldpZGdldCkge1xuXHRcdFx0dGhpcy5leGNlcHRpb25XaWRnZXQuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuZXhjZXB0aW9uV2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeGNlcHRpb25XaWRnZXQsIHRoaXMuZWRpdG9yLCBleGNlcHRpb25JbmZvLCBkZWJ1Z1Nlc3Npb24sIHRoaXMuc2hvdWxkU2Nyb2xsVG9FeGNlcHRpb25XaWRnZXQpO1xuXHRcdHRoaXMuZXhjZXB0aW9uV2lkZ2V0LnNob3coeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSwgMCk7XG5cdFx0dGhpcy5leGNlcHRpb25XaWRnZXQuZm9jdXMoKTtcblx0XHR0aGlzLmVkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVyKHtcblx0XHRcdHN0YXJ0TGluZU51bWJlcjogbGluZU51bWJlcixcblx0XHRcdHN0YXJ0Q29sdW1uOiBjb2x1bW4sXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLFxuXHRcdFx0ZW5kQ29sdW1uOiBjb2x1bW4sXG5cdFx0fSk7XG5cdFx0dGhpcy5leGNlcHRpb25XaWRnZXRWaXNpYmxlLnNldCh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0V4Y2VwdGlvbldpZGdldFdpdGhvdXRTY3JvbGwoZXhjZXB0aW9uSW5mbzogSUV4Y2VwdGlvbkluZm8sIGRlYnVnU2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmV4Y2VwdGlvbldpZGdldCkge1xuXHRcdFx0dGhpcy5leGNlcHRpb25XaWRnZXQuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIERpc2FibGUgc2Nyb2xsaW5nIHRvIGV4Y2VwdGlvbiB3aWRnZXRcblx0XHR0aGlzLmFsbG93U2Nyb2xsVG9FeGNlcHRpb25XaWRnZXQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGN1cnJlbnRTY3JvbGxUb3AgPSB0aGlzLmVkaXRvci5nZXRTY3JvbGxUb3AoKTtcblx0XHRjb25zdCB2aXNpYmxlUmFuZ2VzID0gdGhpcy5lZGl0b3IuZ2V0VmlzaWJsZVJhbmdlcygpO1xuXHRcdGlmICh2aXNpYmxlUmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gRWRpdG9yIG5vdCBmdWxseSBpbml0aWFsaXplZCBvciBub3QgdmlzaWJsZTsgc2tpcCBzY3JvbGwgYWRqdXN0bWVudFxuXHRcdFx0dGhpcy5leGNlcHRpb25XaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4Y2VwdGlvbldpZGdldCwgdGhpcy5lZGl0b3IsIGV4Y2VwdGlvbkluZm8sIGRlYnVnU2Vzc2lvbiwgdGhpcy5zaG91bGRTY3JvbGxUb0V4Y2VwdGlvbldpZGdldCk7XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldC5zaG93KHsgbGluZU51bWJlciwgY29sdW1uIH0sIDApO1xuXHRcdFx0dGhpcy5leGNlcHRpb25XaWRnZXRWaXNpYmxlLnNldCh0cnVlKTtcblx0XHRcdHRoaXMuYWxsb3dTY3JvbGxUb0V4Y2VwdGlvbldpZGdldCA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RWaXNpYmxlTGluZSA9IHZpc2libGVSYW5nZXNbMF0uc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0Ly8gQ3JlYXRlIHdpZGdldCAtIHRoaXMgbWF5IGFkZCBhIHpvbmUgdGhhdCBwdXNoZXMgY29udGVudCBkb3duXG5cdFx0dGhpcy5leGNlcHRpb25XaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4Y2VwdGlvbldpZGdldCwgdGhpcy5lZGl0b3IsIGV4Y2VwdGlvbkluZm8sIGRlYnVnU2Vzc2lvbiwgdGhpcy5zaG91bGRTY3JvbGxUb0V4Y2VwdGlvbldpZGdldCk7XG5cdFx0dGhpcy5leGNlcHRpb25XaWRnZXQuc2hvdyh7IGxpbmVOdW1iZXIsIGNvbHVtbiB9LCAwKTtcblx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldFZpc2libGUuc2V0KHRydWUpO1xuXG5cdFx0Ly8gb25seSBhZGp1c3Qgc2Nyb2xsIGlmIHRoZSBleGNlcHRpb24gd2lkZ2V0IGlzIGFib3ZlIHRoZSBmaXJzdCB2aXNpYmxlIGxpbmVcblx0XHRpZiAobGluZU51bWJlciA8IGZpcnN0VmlzaWJsZUxpbmUpIHtcblx0XHRcdC8vIEdldCB0aGUgYWN0dWFsIGhlaWdodCBvZiB0aGUgd2lkZ2V0IHRoYXQgd2FzIGp1c3QgYWRkZWQgZnJvbSB0aGUgd2hpdGVzcGFjZVxuXHRcdFx0Ly8gVGhlIHdoaXRlc3BhY2UgaGVpZ2h0IGlzIG1vcmUgYWNjdXJhdGUgdGhhbiB0aGUgY29udGFpbmVyIGhlaWdodFxuXHRcdFx0Y29uc3Qgc2Nyb2xsQWRqdXN0bWVudCA9IHRoaXMuZXhjZXB0aW9uV2lkZ2V0LmdldFdoaXRlc3BhY2VIZWlnaHQoKTtcblxuXHRcdFx0Ly8gU2Nyb2xsIGRvd24gYnkgdGhlIGFjdHVhbCB3aWRnZXQgaGVpZ2h0IHRvIGtlZXAgdGhlIGZpcnN0IHZpc2libGUgbGluZSB0aGUgc2FtZVxuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2Nyb2xsVG9wKGN1cnJlbnRTY3JvbGxUb3AgKyBzY3JvbGxBZGp1c3RtZW50LCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmUtZW5hYmxlIHNjcm9sbGluZyB0byBleGNlcHRpb24gd2lkZ2V0XG5cdFx0dGhpcy5hbGxvd1Njcm9sbFRvRXhjZXB0aW9uV2lkZ2V0ID0gdHJ1ZTtcblx0fVxuXG5cdGNsb3NlRXhjZXB0aW9uV2lkZ2V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmV4Y2VwdGlvbldpZGdldCkge1xuXHRcdFx0Y29uc3Qgc2hvdWxkRm9jdXNFZGl0b3IgPSB0aGlzLmV4Y2VwdGlvbldpZGdldC5oYXNGb2N1cygpO1xuXHRcdFx0dGhpcy5leGNlcHRpb25XaWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5leGNlcHRpb25XaWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldFZpc2libGUuc2V0KGZhbHNlKTtcblx0XHRcdGlmIChzaG91bGRGb2N1c0VkaXRvcikge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFkZExhdW5jaENvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgY29uZmlndXJhdGlvbnNBcnJheVBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFzdFByb3BlcnR5OiBzdHJpbmc7XG5cblx0XHRjb25zdCBnZXRDb25maWd1cmF0aW9uUG9zaXRpb24gPSAoKSA9PiB7XG5cdFx0XHRsZXQgZGVwdGhJbkFycmF5ID0gMDtcblx0XHRcdHZpc2l0KG1vZGVsLmdldFZhbHVlKCksIHtcblx0XHRcdFx0b25PYmplY3RQcm9wZXJ0eTogKHByb3BlcnR5OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRsYXN0UHJvcGVydHkgPSBwcm9wZXJ0eTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25BcnJheUJlZ2luOiAob2Zmc2V0OiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRpZiAobGFzdFByb3BlcnR5ID09PSAnY29uZmlndXJhdGlvbnMnICYmIGRlcHRoSW5BcnJheSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Y29uZmlndXJhdGlvbnNBcnJheVBvc2l0aW9uID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQgKyAxKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVwdGhJbkFycmF5Kys7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uQXJyYXlFbmQ6ICgpID0+IHtcblx0XHRcdFx0XHRkZXB0aEluQXJyYXktLTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGdldENvbmZpZ3VyYXRpb25Qb3NpdGlvbigpO1xuXG5cdFx0aWYgKCFjb25maWd1cmF0aW9uc0FycmF5UG9zaXRpb24pIHtcblx0XHRcdC8vIFwiY29uZmlndXJhdGlvbnNcIiBhcnJheSBkb2Vzbid0IGV4aXN0LiBBZGQgaXQgaGVyZS5cblx0XHRcdGNvbnN0IHsgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzIH0gPSBtb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0XHRjb25zdCBlb2wgPSBtb2RlbC5nZXRFT0woKTtcblx0XHRcdGNvbnN0IGVkaXQgPSAoYmFzZW5hbWUobW9kZWwudXJpLmZzUGF0aCkgPT09ICdsYXVuY2guanNvbicpID9cblx0XHRcdFx0c2V0UHJvcGVydHkobW9kZWwuZ2V0VmFsdWUoKSwgWydjb25maWd1cmF0aW9ucyddLCBbXSwgeyB0YWJTaXplLCBpbnNlcnRTcGFjZXMsIGVvbCB9KVswXSA6XG5cdFx0XHRcdHNldFByb3BlcnR5KG1vZGVsLmdldFZhbHVlKCksIFsnbGF1bmNoJ10sIHsgJ2NvbmZpZ3VyYXRpb25zJzogW10gfSwgeyB0YWJTaXplLCBpbnNlcnRTcGFjZXMsIGVvbCB9KVswXTtcblx0XHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KGVkaXQub2Zmc2V0KTtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShsaW5lTnVtYmVyLCBzdGFydFBvc2l0aW9uLmNvbHVtbiwgbGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSk7XG5cdFx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgW0VkaXRPcGVyYXRpb24ucmVwbGFjZShyYW5nZSwgZWRpdC5jb250ZW50KV0sICgpID0+IG51bGwpO1xuXHRcdFx0Ly8gR28gdGhyb3VnaCB0aGUgZmlsZSBhZ2FpbiBzaW5jZSB3ZSd2ZSBlZGl0ZWQgaXRcblx0XHRcdGdldENvbmZpZ3VyYXRpb25Qb3NpdGlvbigpO1xuXHRcdH1cblx0XHRpZiAoIWNvbmZpZ3VyYXRpb25zQXJyYXlQb3NpdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cblx0XHRjb25zdCBpbnNlcnRMaW5lID0gKHBvc2l0aW9uOiBQb3NpdGlvbik6IFByb21pc2U8YW55PiA9PiB7XG5cdFx0XHQvLyBDaGVjayBpZiB0aGVyZSBhcmUgbW9yZSBjaGFyYWN0ZXJzIG9uIGEgbGluZSBhZnRlciBhIFwiY29uZmlndXJhdGlvbnNcIjogWywgaWYgeWVzIGVudGVyIGEgbmV3bGluZVxuXHRcdFx0aWYgKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSA+IHBvc2l0aW9uLmNvbHVtbikge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdFx0Q29yZUVkaXRpbmdDb21tYW5kcy5MaW5lQnJlYWtJbnNlcnQucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgdGhpcy5lZGl0b3IsIG51bGwpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZWRpdG9yLnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdHJldHVybiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEluc2VydExpbmVBZnRlckFjdGlvbi5JRCk7XG5cdFx0fTtcblxuXHRcdGF3YWl0IGluc2VydExpbmUoY29uZmlndXJhdGlvbnNBcnJheVBvc2l0aW9uKTtcblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdlZGl0b3IuYWN0aW9uLnRyaWdnZXJTdWdnZXN0Jyk7XG5cdH1cblxuXHQvLyBJbmxpbmUgRGVjb3JhdGlvbnNcblxuXHRAbWVtb2l6ZVxuXHRwcml2YXRlIGdldCByZW1vdmVJbmxpbmVWYWx1ZXNTY2hlZHVsZXIoKTogUnVuT25jZVNjaGVkdWxlciB7XG5cdFx0cmV0dXJuIG5ldyBSdW5PbmNlU2NoZWR1bGVyKFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRpc3BsYXllZFN0b3JlLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMub2xkRGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdH0sXG5cdFx0XHQxMDBcblx0XHQpO1xuXHR9XG5cblx0QG1lbW9pemVcblx0cHJpdmF0ZSBnZXQgdXBkYXRlSW5saW5lVmFsdWVzU2NoZWR1bGVyKCk6IFJ1bk9uY2VTY2hlZHVsZXIge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRyZXR1cm4gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoXG5cdFx0XHRhc3luYyAoKSA9PiBhd2FpdCB0aGlzLnVwZGF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbnModGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWUpLFxuXHRcdFx0bW9kZWwgPyB0aGlzLmRlYm91bmNlSW5mby5nZXQobW9kZWwpIDogREVBRlVMVF9JTkxJTkVfREVCT1VOQ0VfREVMQVlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVJbmxpbmVWYWx1ZURlY29yYXRpb25zKHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCB2YXJfdmFsdWVfZm9ybWF0ID0gJ3swfSA9IHsxfSc7XG5cdFx0Y29uc3Qgc2VwYXJhdG9yID0gJywgJztcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBpbmxpbmVWYWx1ZXNTZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5pbmxpbmVWYWx1ZXM7XG5cdFx0Y29uc3QgaW5saW5lVmFsdWVzVHVybmVkT24gPSBpbmxpbmVWYWx1ZXNTZXR0aW5nID09PSB0cnVlIHx8IGlubGluZVZhbHVlc1NldHRpbmcgPT09ICdvbicgfHwgKGlubGluZVZhbHVlc1NldHRpbmcgPT09ICdhdXRvJyAmJiBtb2RlbCAmJiB0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZVZhbHVlc1Byb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdGlmICghaW5saW5lVmFsdWVzVHVybmVkT24gfHwgIW1vZGVsIHx8ICFzdGFja0ZyYW1lIHx8IG1vZGVsLnVyaS50b1N0cmluZygpICE9PSBzdGFja0ZyYW1lLnNvdXJjZS51cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0aWYgKCF0aGlzLnJlbW92ZUlubGluZVZhbHVlc1NjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlSW5saW5lVmFsdWVzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW1vdmVJbmxpbmVWYWx1ZXNTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5kaXNwbGF5ZWRTdG9yZS5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgdmlld1JhbmdlcyA9IHRoaXMuZWRpdG9yLmdldFZpc2libGVSYW5nZXNQbHVzVmlld3BvcnRBYm92ZUJlbG93KCk7XG5cdFx0bGV0IGFsbERlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuZGlzcGxheWVkU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXG5cdFx0aWYgKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lVmFsdWVzUHJvdmlkZXIuaGFzKG1vZGVsKSkge1xuXG5cdFx0XHRjb25zdCBmaW5kVmFyaWFibGUgPSBhc3luYyAoX2tleTogc3RyaW5nLCBjYXNlU2Vuc2l0aXZlTG9va3VwOiBib29sZWFuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0Y29uc3Qgc2NvcGVzID0gYXdhaXQgc3RhY2tGcmFtZS5nZXRNb3N0U3BlY2lmaWNTY29wZXMoc3RhY2tGcmFtZS5yYW5nZSk7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGNhc2VTZW5zaXRpdmVMb29rdXAgPyBfa2V5IDogX2tleS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNjb3BlIG9mIHNjb3Blcykge1xuXHRcdFx0XHRcdGNvbnN0IHZhcmlhYmxlcyA9IGF3YWl0IHNjb3BlLmdldENoaWxkcmVuKCk7XG5cdFx0XHRcdFx0Y29uc3QgZm91bmQgPSB2YXJpYWJsZXMuZmluZCh2ID0+IGNhc2VTZW5zaXRpdmVMb29rdXAgPyAodi5uYW1lID09PSBrZXkpIDogKHYubmFtZS50b0xvd2VyQ2FzZSgpID09PSBrZXkpKTtcblx0XHRcdFx0XHRpZiAoZm91bmQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmb3VuZC52YWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGN0eDogSW5saW5lVmFsdWVDb250ZXh0ID0ge1xuXHRcdFx0XHRmcmFtZUlkOiBzdGFja0ZyYW1lLmZyYW1lSWQsXG5cdFx0XHRcdHN0b3BwZWRMb2NhdGlvbjogbmV3IFJhbmdlKHN0YWNrRnJhbWUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFja0ZyYW1lLnJhbmdlLnN0YXJ0Q29sdW1uICsgMSwgc3RhY2tGcmFtZS5yYW5nZS5lbmRMaW5lTnVtYmVyLCBzdGFja0ZyYW1lLnJhbmdlLmVuZENvbHVtbiArIDEpXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZVZhbHVlc1Byb3ZpZGVyLm9yZGVyZWQobW9kZWwpLnJldmVyc2UoKTtcblxuXHRcdFx0YWxsRGVjb3JhdGlvbnMgPSBbXTtcblx0XHRcdGNvbnN0IGxpbmVEZWNvcmF0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBJbmxpbmVTZWdtZW50W10+KCk7XG5cblx0XHRcdGNvbnN0IHByb21pc2VzID0gcHJvdmlkZXJzLmZsYXRNYXAocHJvdmlkZXIgPT4gdmlld1Jhbmdlcy5tYXAocmFuZ2UgPT4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyLnByb3ZpZGVJbmxpbmVWYWx1ZXMobW9kZWwsIHJhbmdlLCBjdHgsIGN0cy50b2tlbikpLnRoZW4oYXN5bmMgKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBpdiBvZiByZXN1bHQpIHtcblxuXHRcdFx0XHRcdFx0bGV0IHRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHN3aXRjaCAoaXYudHlwZSkge1xuXHRcdFx0XHRcdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0XHRcdFx0XHR0ZXh0ID0gaXYudGV4dDtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0Y2FzZSAndmFyaWFibGUnOiB7XG5cdFx0XHRcdFx0XHRcdFx0bGV0IHZhID0gaXYudmFyaWFibGVOYW1lO1xuXHRcdFx0XHRcdFx0XHRcdGlmICghdmEpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoaXYucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdFx0XHRcdHZhID0gbGluZUNvbnRlbnQuc3Vic3RyaW5nKGl2LnJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgaXYucmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgZmluZFZhcmlhYmxlKHZhLCBpdi5jYXNlU2Vuc2l0aXZlTG9va3VwKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRleHQgPSBzdHJpbmdzLmZvcm1hdCh2YXJfdmFsdWVfZm9ybWF0LCB2YSwgdmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjYXNlICdleHByZXNzaW9uJzoge1xuXHRcdFx0XHRcdFx0XHRcdGxldCBleHByID0gaXYuZXhwcmVzc2lvbjtcblx0XHRcdFx0XHRcdFx0XHRpZiAoIWV4cHIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoaXYucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdFx0XHRcdGV4cHIgPSBsaW5lQ29udGVudC5zdWJzdHJpbmcoaXYucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBpdi5yYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGV4cHIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGV4cHJlc3Npb24gPSBuZXcgRXhwcmVzc2lvbihleHByKTtcblx0XHRcdFx0XHRcdFx0XHRcdGF3YWl0IGV4cHJlc3Npb24uZXZhbHVhdGUoc3RhY2tGcmFtZS50aHJlYWQuc2Vzc2lvbiwgc3RhY2tGcmFtZSwgJ3dhdGNoJywgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoZXhwcmVzc2lvbi5hdmFpbGFibGUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGV4dCA9IHN0cmluZ3MuZm9ybWF0KHZhcl92YWx1ZV9mb3JtYXQsIGV4cHIsIGV4cHJlc3Npb24udmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAodGV4dCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsaW5lID0gaXYucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRsZXQgbGluZVNlZ21lbnRzID0gbGluZURlY29yYXRpb25zLmdldChsaW5lKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFsaW5lU2VnbWVudHMpIHtcblx0XHRcdFx0XHRcdFx0XHRsaW5lU2VnbWVudHMgPSBbXTtcblx0XHRcdFx0XHRcdFx0XHRsaW5lRGVjb3JhdGlvbnMuc2V0KGxpbmUsIGxpbmVTZWdtZW50cyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKCFsaW5lU2VnbWVudHMuc29tZShpdiA9PiBpdi50ZXh0ID09PSB0ZXh0KSkge1x0Ly8gZGUtZHVwZVxuXHRcdFx0XHRcdFx0XHRcdGxpbmVTZWdtZW50cy5wdXNoKG5ldyBJbmxpbmVTZWdtZW50KGl2LnJhbmdlLnN0YXJ0Q29sdW1uLCB0ZXh0KSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IoZXJyKTtcblx0XHRcdH0pKSk7XG5cblx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IERhdGUubm93KCk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblxuXHRcdFx0Ly8gdXBkYXRlIGRlYm91bmNlIGluZm9cblx0XHRcdHRoaXMudXBkYXRlSW5saW5lVmFsdWVzU2NoZWR1bGVyLmRlbGF5ID0gdGhpcy5kZWJvdW5jZUluZm8udXBkYXRlKG1vZGVsLCBEYXRlLm5vdygpIC0gc3RhcnRUaW1lKTtcblxuXHRcdFx0Ly8gc29ydCBsaW5lIHNlZ21lbnRzIGFuZCBjb25jYXRlbmF0ZSB0aGVtIGludG8gYSBkZWNvcmF0aW9uXG5cblx0XHRcdGxpbmVEZWNvcmF0aW9ucy5mb3JFYWNoKChzZWdtZW50cywgbGluZSkgPT4ge1xuXHRcdFx0XHRpZiAoc2VnbWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHNlZ21lbnRzID0gc2VnbWVudHMuc29ydCgoYSwgYikgPT4gYS5jb2x1bW4gLSBiLmNvbHVtbik7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dCA9IHNlZ21lbnRzLm1hcChzID0+IHMudGV4dCkuam9pbihzZXBhcmF0b3IpO1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvcldpZHRoID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLndpZHRoO1xuXHRcdFx0XHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0XHRcdFx0Y29uc3Qgdmlld3BvcnRNYXhDb2wgPSBNYXRoLmZsb29yKChlZGl0b3JXaWR0aCAtIDUwKSAvIGZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCk7XG5cdFx0XHRcdFx0YWxsRGVjb3JhdGlvbnMucHVzaCguLi5jcmVhdGVJbmxpbmVWYWx1ZURlY29yYXRpb24obGluZSwgdGV4dCwgJ2RlYnVnJywgdW5kZWZpbmVkLCB2aWV3cG9ydE1heENvbCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBvbGQgXCJvbmUtc2l6ZS1maXRzLWFsbFwiIHN0cmF0ZWd5XG5cblx0XHRcdGNvbnN0IHNjb3BlcyA9IGF3YWl0IHN0YWNrRnJhbWUuZ2V0TW9zdFNwZWNpZmljU2NvcGVzKHN0YWNrRnJhbWUucmFuZ2UpO1xuXHRcdFx0Y29uc3Qgc2NvcGVzV2l0aFZhcmlhYmxlcyA9IGF3YWl0IFByb21pc2UuYWxsKHNjb3Blcy5tYXAoYXN5bmMgc2NvcGUgPT5cblx0XHRcdFx0KHsgc2NvcGUsIHZhcmlhYmxlczogYXdhaXQgc2NvcGUuZ2V0Q2hpbGRyZW4oKSB9KSkpO1xuXG5cdFx0XHQvLyBNYXAgb2YgaW5saW5lIHZhbHVlcyBwZXIgbGluZSB0aGF0J3MgcG9wdWxhdGVkIGluIHNjb3BlIG9yZGVyLCBmcm9tXG5cdFx0XHQvLyBuYXJyb3dlc3QgdG8gd2lkZXN0LiBUaGlzIGlzIGRvbmUgdG8gYXZvaWQgZHVwbGljYXRpbmcgdmFsdWVzIGlmXG5cdFx0XHQvLyB0aGV5IGFwcGVhciBpbiBtdWx0aXBsZSBzY29wZXMgb3IgYXJlIHNoYWRvd2VkICgjMTI5NzcwLCAjMjE3MzI2KVxuXHRcdFx0Y29uc3QgdmFsdWVzUGVyTGluZSA9IG5ldyBNYXA8LyogbGluZSAqL251bWJlciwgTWFwPC8qIHZhciAqL3N0cmluZywgLyogdmFsdWUgKi8gc3RyaW5nPj4oKTtcblxuXHRcdFx0Zm9yIChjb25zdCB7IHNjb3BlLCB2YXJpYWJsZXMgfSBvZiBzY29wZXNXaXRoVmFyaWFibGVzKSB7XG5cdFx0XHRcdGxldCBzY29wZVJhbmdlID0gbmV3IFJhbmdlKDAsIDAsIHN0YWNrRnJhbWUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFja0ZyYW1lLnJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdFx0aWYgKHNjb3BlLnJhbmdlKSB7XG5cdFx0XHRcdFx0c2NvcGVSYW5nZSA9IHNjb3BlUmFuZ2Uuc2V0U3RhcnRQb3NpdGlvbihzY29wZS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHNjb3BlLnJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG93blJhbmdlcyA9IHZpZXdSYW5nZXMubWFwKHIgPT4gci5pbnRlcnNlY3RSYW5nZXMoc2NvcGVSYW5nZSkpLmZpbHRlcihpc0RlZmluZWQpO1xuXHRcdFx0XHR0aGlzLl93b3JkVG9MaW5lTnVtYmVyc01hcCA/Pz0gbmV3IFdvcmRzVG9MaW5lTnVtYmVyc0NhY2hlKG1vZGVsKTtcblx0XHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiBvd25SYW5nZXMpIHtcblx0XHRcdFx0XHR0aGlzLl93b3JkVG9MaW5lTnVtYmVyc01hcC5lbnN1cmVSYW5nZVBvcHVsYXRlZChyYW5nZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBtYXBwZWQgPSBjcmVhdGVJbmxpbmVWYWx1ZURlY29yYXRpb25zSW5zaWRlUmFuZ2UodmFyaWFibGVzLCBvd25SYW5nZXMsIG1vZGVsLCB0aGlzLl93b3JkVG9MaW5lTnVtYmVyc01hcC52YWx1ZSk7XG5cdFx0XHRcdGZvciAoY29uc3QgeyBsaW5lLCB2YXJpYWJsZXMgfSBvZiBtYXBwZWQpIHtcblx0XHRcdFx0XHRsZXQgdmFsdWVzID0gdmFsdWVzUGVyTGluZS5nZXQobGluZSk7XG5cdFx0XHRcdFx0aWYgKCF2YWx1ZXMpIHtcblx0XHRcdFx0XHRcdHZhbHVlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdFx0XHR2YWx1ZXNQZXJMaW5lLnNldChsaW5lLCB2YWx1ZXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGZvciAoY29uc3QgeyBuYW1lLCB2YWx1ZSB9IG9mIHZhcmlhYmxlcykge1xuXHRcdFx0XHRcdFx0aWYgKCF2YWx1ZXMuaGFzKG5hbWUpKSB7XG5cdFx0XHRcdFx0XHRcdHZhbHVlcy5zZXQobmFtZSwgdmFsdWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhbGxEZWNvcmF0aW9ucyA9IFsuLi52YWx1ZXNQZXJMaW5lLmVudHJpZXMoKV0uZmxhdE1hcCgoW2xpbmUsIHZhbHVlc10pID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IFsuLi52YWx1ZXNdLm1hcCgoW24sIHZdKSA9PiBgJHtufSA9ICR7dn1gKS5qb2luKCcsICcpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JXaWR0aCA9IHRoaXMuZWRpdG9yLmdldExheW91dEluZm8oKS53aWR0aDtcblx0XHRcdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRcdFx0Y29uc3Qgdmlld3BvcnRNYXhDb2wgPSBNYXRoLmZsb29yKChlZGl0b3JXaWR0aCAtIDUwKSAvIGZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCk7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVJbmxpbmVWYWx1ZURlY29yYXRpb24obGluZSwgdGV4dCwgJ2RlYnVnJywgdW5kZWZpbmVkLCB2aWV3cG9ydE1heENvbCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd29yZCB3cmFwIGlzIG9uLCBhcHBsaWNhdGlvbiBvZiBpbmxpbmUgZGVjb3JhdGlvbnMgbWF5IGNoYW5nZSB0aGUgc2Nyb2xsIHBvc2l0aW9uLlxuXHRcdC8vIEVuc3VyZSB0aGUgY3Vyc29yIG1haW50YWlucyBpdHMgdmVydGljYWwgcG9zaXRpb24gcmVsYXRpdmUgdG8gdGhlIHZpZXdwb3J0IHdoZW5cblx0XHQvLyB3ZSBhcHBseSBkZWNvcmF0aW9ucy5cblx0XHRsZXQgcHJlc2VydmVQb3NpdGlvbjogeyBwb3NpdGlvbjogUG9zaXRpb247IHRvcDogbnVtYmVyIH0gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFdyYXApICE9PSAnb2ZmJykge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLmVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdFx0aWYgKHBvc2l0aW9uICYmIHRoaXMuZWRpdG9yLmdldFZpc2libGVSYW5nZXMoKS5zb21lKHIgPT4gci5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkpIHtcblx0XHRcdFx0cHJlc2VydmVQb3NpdGlvbiA9IHsgcG9zaXRpb24sIHRvcDogdGhpcy5lZGl0b3IuZ2V0VG9wRm9yUG9zaXRpb24ocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMub2xkRGVjb3JhdGlvbnMuc2V0KGFsbERlY29yYXRpb25zKTtcblxuXHRcdGlmIChwcmVzZXJ2ZVBvc2l0aW9uKSB7XG5cdFx0XHRjb25zdCB0b3AgPSB0aGlzLmVkaXRvci5nZXRUb3BGb3JQb3NpdGlvbihwcmVzZXJ2ZVBvc2l0aW9uLnBvc2l0aW9uLmxpbmVOdW1iZXIsIHByZXNlcnZlUG9zaXRpb24ucG9zaXRpb24uY29sdW1uKTtcblx0XHRcdHRoaXMuZWRpdG9yLnNldFNjcm9sbFRvcCh0aGlzLmVkaXRvci5nZXRTY3JvbGxUb3AoKSAtIChwcmVzZXJ2ZVBvc2l0aW9uLnRvcCAtIHRvcCksIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuaG92ZXJXaWRnZXQ/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25XaWRnZXQ/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMudG9EaXNwb3NlID0gZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdH1cbn1cblxuY2xhc3MgV29yZHNUb0xpbmVOdW1iZXJzQ2FjaGUge1xuXHQvLyB3ZSB1c2UgdGhpcyBhcyBhbiBhcnJheSBvZiBiaXRzIHdoZXJlIGVhY2ggMSBiaXQgaXMgYSBsaW5lIG51bWJlciB0aGF0J3MgYmVlbiBwYXJzZWRcblx0cHJpdmF0ZSByZWFkb25seSBpbnRlcnZhbHM6IFVpbnQ4QXJyYXk7XG5cdHB1YmxpYyByZWFkb25seSB2YWx1ZSA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXJbXT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0dGhpcy5pbnRlcnZhbHMgPSBuZXcgVWludDhBcnJheShNYXRoLmNlaWwobW9kZWwuZ2V0TGluZUNvdW50KCkgLyA4KSk7XG5cdH1cblxuXHQvKiogRW5zdXJlcyB0aGF0IHZhcmlhYmxlcyBuYW1lcyBpbiB0aGUgZ2l2ZW4gcmFuZ2UgaGF2ZSBiZWVuIGlkZW50aWZpZWQuICovXG5cdHB1YmxpYyBlbnN1cmVSYW5nZVBvcHVsYXRlZChyYW5nZTogUmFuZ2UpIHtcblx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHJhbmdlLmVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgYmluID0gbGluZU51bWJlciA+PiAzOyAgLyogTWF0aC5mbG9vcihpIC8gOCkgKi9cblx0XHRcdGNvbnN0IGJpdCA9IDEgPDwgKGxpbmVOdW1iZXIgJiAwYjExMSk7IC8qIDEgPDwgKGkgJSA4KSAqL1xuXHRcdFx0aWYgKCEodGhpcy5pbnRlcnZhbHNbYmluXSAmIGJpdCkpIHtcblx0XHRcdFx0Z2V0V29yZFRvTGluZU51bWJlcnNNYXAodGhpcy5tb2RlbCwgbGluZU51bWJlciwgdGhpcy52YWx1ZSk7XG5cdFx0XHRcdHRoaXMuaW50ZXJ2YWxzW2Jpbl0gfD0gYml0O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFxuXHQnX2V4ZWN1dGVJbmxpbmVWYWx1ZVByb3ZpZGVyJyxcblx0YXN5bmMgKFxuXHRcdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRcdHVyaTogVVJJLFxuXHRcdGlSYW5nZTogSVJhbmdlLFxuXHRcdGNvbnRleHQ6IElubGluZVZhbHVlQ29udGV4dFxuXHQpOiBQcm9taXNlPElubGluZVZhbHVlW10gfCBudWxsPiA9PiB7XG5cdFx0YXNzZXJ0VHlwZShVUkkuaXNVcmkodXJpKSk7XG5cdFx0YXNzZXJ0VHlwZShSYW5nZS5pc0lSYW5nZShpUmFuZ2UpKTtcblxuXHRcdGlmICghY29udGV4dCB8fCB0eXBlb2YgY29udGV4dC5mcmFtZUlkICE9PSAnbnVtYmVyJyB8fCAhUmFuZ2UuaXNJUmFuZ2UoY29udGV4dC5zdG9wcGVkTG9jYXRpb24pKSB7XG5cdFx0XHR0aHJvdyBpbGxlZ2FsQXJndW1lbnQoJ2NvbnRleHQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKS5nZXRNb2RlbCh1cmkpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgndXJpJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5saWZ0KGlSYW5nZSk7XG5cdFx0Y29uc3QgeyBpbmxpbmVWYWx1ZXNQcm92aWRlciB9ID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gaW5saW5lVmFsdWVzUHJvdmlkZXIub3JkZXJlZChtb2RlbCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJSZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvdmlkZXJzLm1hcChwcm92aWRlciA9PiBwcm92aWRlci5wcm92aWRlSW5saW5lVmFsdWVzKG1vZGVsLCByYW5nZSwgY29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpKTtcblx0XHRyZXR1cm4gcHJvdmlkZXJSZXN1bHRzLmZsYXQoKS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0fSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCLHVCQUF1QjtBQUN2RCxTQUFTLGtCQUFrQjtBQUMzQixTQUF5Qiw2QkFBNkI7QUFFdEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixpQ0FBaUM7QUFDM0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUN0QixTQUFTLG1CQUFtQjtB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QUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsQ1U7QUE0c0JiLE1BQU0sd0JBQXdCO0FBQUEsRUFLN0IsWUFBNkIsT0FBbUI7QUFBbkI7QUFGN0IsU0FBZ0IsUUFBUSxvQkFBSSxJQUFzQjtBQUdqRCxTQUFLLFlBQVksSUFBSSxXQUFXLEtBQUssS0FBSyxNQUFNLGFBQWEsSUFBSSxDQUFDLENBQUM7QUFBQSxFQUNwRTtBQUFBO0FBQUEsRUFHTyxxQkFBcUIsT0FBYztBQUN6QyxhQUFTLGFBQWEsTUFBTSxpQkFBaUIsY0FBYyxNQUFNLGVBQWUsY0FBYztBQUM3RixZQUFNLE1BQU0sY0FBYztBQUMxQixZQUFNLE1BQU0sTUFBTSxhQUFhO0FBQy9CLFVBQUksRUFBRSxLQUFLLFVBQVUsR0FBRyxJQUFJLE1BQU07QUFDakMsZ0NBQXdCLEtBQUssT0FBTyxZQUFZLEtBQUssS0FBSztBQUMxRCxhQUFLLFVBQVUsR0FBRyxLQUFLO0FBQUEsTUFDeEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBR0EsaUJBQWlCO0FBQUEsRUFDaEI7QUFBQSxFQUNBLE9BQ0MsVUFDQSxLQUNBLFFBQ0EsWUFDbUM7QUFDbkMsZUFBVyxJQUFJLE1BQU0sR0FBRyxDQUFDO0FBQ3pCLGVBQVcsTUFBTSxTQUFTLE1BQU0sQ0FBQztBQUVqQyxRQUFJLENBQUMsV0FBVyxPQUFPLFFBQVEsWUFBWSxZQUFZLENBQUMsTUFBTSxTQUFTLFFBQVEsZUFBZSxHQUFHO0FBQ2hHLFlBQU0sZ0JBQWdCLFNBQVM7QUFBQSxJQUNoQztBQUVBLFVBQU0sUUFBUSxTQUFTLElBQUksYUFBYSxFQUFFLFNBQVMsR0FBRztBQUN0RCxRQUFJLENBQUMsT0FBTztBQUNYLFlBQU0sZ0JBQWdCLEtBQUs7QUFBQSxJQUM1QjtBQUVBLFVBQU0sUUFBUSxNQUFNLEtBQUssTUFBTTtBQUMvQixVQUFNLEVBQUUscUJBQXFCLElBQUksU0FBUyxJQUFJLHdCQUF3QjtBQUN0RSxVQUFNLFlBQVkscUJBQXFCLFFBQVEsS0FBSztBQUNwRCxVQUFNLGtCQUFrQixNQUFNLFFBQVEsSUFBSSxVQUFVLElBQUksY0FBWSxTQUFTLG9CQUFvQixPQUFPLE9BQU8sU0FBUyxrQkFBa0IsSUFBSSxDQUFDLENBQUM7QUFDaEosV0FBTyxnQkFBZ0IsS0FBSyxFQUFFLE9BQU8sU0FBUztBQUFBLEVBQy9DO0FBQUM7IiwKICAibmFtZXMiOiBbInN0YW5kYXJkS2V5Ym9hcmRFdmVudCIsICJpdiIsICJ2YXJpYWJsZXMiXQp9Cg==
