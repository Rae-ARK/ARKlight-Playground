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
import { createTrustedTypesPolicy } from "../../../../../../base/browser/trustedTypes.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, constObservable, derived, derivedOpts, observableSignalFromEvent, observableValue } from "../../../../../../base/common/observable.js";
import * as strings from "../../../../../../base/common/strings.js";
import { applyFontInfo } from "../../../../../browser/config/domFontInfo.js";
import { ContentWidgetPositionPreference, MouseTargetType } from "../../../../../browser/editorBrowser.js";
import { observableCodeEditor } from "../../../../../browser/observableCodeEditor.js";
import { EditorFontLigatures, EditorOption } from "../../../../../common/config/editorOptions.js";
import { StringEdit, StringReplacement } from "../../../../../common/core/edits/stringEdit.js";
import { Position } from "../../../../../common/core/position.js";
import { Range } from "../../../../../common/core/range.js";
import { StringBuilder } from "../../../../../common/core/stringBuilder.js";
import { ILanguageService } from "../../../../../common/languages/language.js";
import { InjectedTextCursorStops, PositionAffinity } from "../../../../../common/model.js";
import { LineTokens } from "../../../../../common/tokens/lineTokens.js";
import { LineDecoration } from "../../../../../common/viewLayout/lineDecorations.js";
import { RenderLineInput, renderViewLine } from "../../../../../common/viewLayout/viewLineRenderer.js";
import { GhostTextReplacement } from "../../model/ghostText.js";
import { RangeSingleLine } from "../../../../../common/core/ranges/rangeSingleLine.js";
import { ColumnRange } from "../../../../../common/core/ranges/columnRange.js";
import { addDisposableListener, getWindow, isHTMLElement, n } from "../../../../../../base/browser/dom.js";
import "./ghostTextView.css";
import { StandardMouseEvent } from "../../../../../../base/browser/mouseEvent.js";
import { CodeEditorWidget } from "../../../../../browser/widget/codeEditor/codeEditorWidget.js";
import { TokenWithTextArray } from "../../../../../common/tokens/tokenWithTextArray.js";
import { InlineCompletionViewData } from "../inlineEdits/inlineEditsViewInterface.js";
import { InlineDecorationType } from "../../../../../common/viewModel/inlineDecorations.js";
import { equals, sum } from "../../../../../../base/common/arrays.js";
import { equalsIfDefinedC, thisEqualsC } from "../../../../../../base/common/equals.js";
class GhostTextWidgetWarning {
  constructor(icon = Codicon.warning) {
    this.icon = icon;
  }
  static from(warning) {
    if (!warning) {
      return void 0;
    }
    return new GhostTextWidgetWarning(warning.icon);
  }
}
const USE_SQUIGGLES_FOR_WARNING = true;
const GHOST_TEXT_CLASS_NAME = "ghost-text";
let GhostTextView = class extends Disposable {
  constructor(_editor, _data, options, _languageService) {
    super();
    this._editor = _editor;
    this._data = _data;
    this._languageService = _languageService;
    this._isDisposed = observableValue(this, false);
    this._warningState = derived((reader) => {
      const model = this._data.read(reader);
      const warning = model?.warning;
      if (!model || !warning) {
        return void 0;
      }
      const gt = model.ghostText;
      return { lineNumber: gt.lineNumber, position: new Position(gt.lineNumber, gt.parts[0].column), icon: warning.icon };
    });
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._nonWhitespaceCount = derived(this, (reader) => {
      const data = this._data.read(reader);
      if (!data) {
        return void 0;
      }
      const ghostText = data.ghostText;
      const allText = ghostText.parts.map((p) => p.lines.map((l) => l.line).join("")).join("");
      return allText.replace(/\s/g, "").length;
    });
    this._extraClassNames = derived(this, (reader) => {
      const extraClasses = this._extraClasses.slice();
      if (USE_SQUIGGLES_FOR_WARNING && this._warningState.read(reader)) {
        extraClasses.push("warning");
      }
      const nonWhitespaceCount = this._nonWhitespaceCount.read(reader);
      if (this._highlightShortText && nonWhitespaceCount && nonWhitespaceCount < 3) {
        extraClasses.push("short-text");
      } else if (this._useSyntaxHighlighting.read(reader)) {
        extraClasses.push("syntax-highlighted");
      }
      const extraClassNames = extraClasses.map((c) => ` ${c}`).join("");
      return extraClassNames;
    });
    this._state = derived(this, (reader) => {
      if (this._isDisposed.read(reader)) {
        return void 0;
      }
      const props = this._data.read(reader);
      if (!props) {
        return void 0;
      }
      const textModel = this._editorObs.model.read(reader);
      if (!textModel) {
        return void 0;
      }
      const ghostText = props.ghostText;
      const replacedRange = ghostText instanceof GhostTextReplacement ? ghostText.columnRange : void 0;
      const syntaxHighlightingEnabled = this._useSyntaxHighlighting.read(reader);
      const extraClassNames = this._extraClassNames.read(reader);
      const { inlineTexts, additionalLines, hiddenRange, additionalLinesOriginalSuffix } = computeGhostTextViewData(ghostText, textModel, GHOST_TEXT_CLASS_NAME + extraClassNames);
      const currentLine = textModel.getLineContent(ghostText.lineNumber);
      const edit = new StringEdit(inlineTexts.map((t) => StringReplacement.insert(t.column - 1, t.text)));
      const tokens = syntaxHighlightingEnabled ? textModel.tokenization.tokenizeLinesAt(ghostText.lineNumber, [edit.apply(currentLine), ...additionalLines.map((l) => l.content)]) : void 0;
      const newRanges = edit.getNewRanges();
      const inlineTextsWithTokens = inlineTexts.map((t, idx) => ({ ...t, tokens: tokens?.[0]?.getTokensInRange(newRanges[idx]) }));
      const tokenizedAdditionalLines = additionalLines.map((l, idx) => {
        let content = tokens?.[idx + 1] ?? LineTokens.createEmpty(l.content, this._languageService.languageIdCodec);
        if (idx === additionalLines.length - 1 && additionalLinesOriginalSuffix) {
          const t = TokenWithTextArray.fromLineTokens(textModel.tokenization.getLineTokens(additionalLinesOriginalSuffix.lineNumber));
          const existingContent = t.slice(additionalLinesOriginalSuffix.columnRange.toZeroBasedOffsetRange());
          content = TokenWithTextArray.fromLineTokens(content).append(existingContent).toLineTokens(content.languageIdCodec);
        }
        return new LineData(
          content,
          l.decorations
        );
      });
      const cursorColumn = this._editor.getSelection()?.getStartPosition().column;
      const disjointInlineTexts = inlineTextsWithTokens.filter((inline) => inline.text !== "");
      const hasInsertionOnCurrentLine = disjointInlineTexts.length !== 0;
      const telemetryViewData = new InlineCompletionViewData(
        (hasInsertionOnCurrentLine ? disjointInlineTexts[0].column : 1) - cursorColumn,
        hasInsertionOnCurrentLine ? 0 : additionalLines.findIndex((line) => line.content !== "") + 1,
        hasInsertionOnCurrentLine ? 1 : 0,
        additionalLines.length + (hasInsertionOnCurrentLine ? 1 : 0),
        0,
        sum(disjointInlineTexts.map((inline) => inline.text.length)) + sum(tokenizedAdditionalLines.map((line) => line.content.getTextLength())),
        disjointInlineTexts.length + (additionalLines.length > 0 ? 1 : 0),
        disjointInlineTexts.length > 1 && tokenizedAdditionalLines.length === 0 ? disjointInlineTexts.every((inline) => inline.text === disjointInlineTexts[0].text) : void 0
      );
      return {
        replacedRange,
        inlineTexts: inlineTextsWithTokens,
        additionalLines: tokenizedAdditionalLines,
        hiddenRange,
        lineNumber: ghostText.lineNumber,
        additionalReservedLineCount: this._minReservedLineCount.read(reader),
        targetTextModel: textModel,
        syntaxHighlightingEnabled,
        telemetryViewData,
        handleInlineCompletionShown: props.handleInlineCompletionShown
      };
    });
    this._decorations = derived(this, (reader) => {
      const uiState = this._state.read(reader);
      if (!uiState) {
        return [];
      }
      const decorations = [];
      const extraClassNames = this._extraClassNames.read(reader);
      if (uiState.replacedRange) {
        decorations.push({
          range: uiState.replacedRange.toRange(uiState.lineNumber),
          options: { inlineClassName: "inline-completion-text-to-replace" + extraClassNames, description: "GhostTextReplacement" }
        });
      }
      if (uiState.hiddenRange) {
        decorations.push({
          range: uiState.hiddenRange.toRange(uiState.lineNumber),
          options: { inlineClassName: "ghost-text-hidden", description: "ghost-text-hidden" }
        });
      }
      for (const p of uiState.inlineTexts) {
        let inlineExtraClassNames = "";
        if (this._highlightShortText && p.text.length < 5) {
          inlineExtraClassNames += " short-text";
        }
        decorations.push({
          range: Range.fromPositions(new Position(uiState.lineNumber, p.column)),
          options: {
            description: "ghost-text-decoration",
            after: {
              content: p.text,
              tokens: p.tokens,
              inlineClassName: (p.preview ? "ghost-text-decoration-preview" : "ghost-text-decoration") + (this._isClickable ? " clickable" : "") + extraClassNames + inlineExtraClassNames + p.lineDecorations.map((d) => " " + d.className).join(" "),
              // TODO: take the ranges into account for line decorations
              cursorStops: InjectedTextCursorStops.Left,
              attachedData: new GhostTextAttachedData(this)
            },
            showIfCollapsed: true
          }
        });
      }
      return decorations;
    });
    this.isHovered = derived(this, (reader) => {
      if (this._isDisposed.read(reader)) {
        return false;
      }
      return this._isInlineTextHovered.read(reader) || this._additionalLinesWidget.isHovered.read(reader);
    });
    this.height = derived(this, (reader) => {
      const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
      return lineHeight + (this._additionalLinesWidget.viewZoneHeight.read(reader) ?? 0);
    });
    this._extraClasses = options.extraClasses ?? [];
    this._isClickable = options.isClickable ?? false;
    this._shouldKeepCursorStable = options.shouldKeepCursorStable ?? false;
    this._minReservedLineCount = options.minReservedLineCount ?? constObservable(0);
    this._useSyntaxHighlighting = options.useSyntaxHighlighting ?? constObservable(true);
    this._highlightShortText = options.highlightShortSuggestions ?? false;
    this._editorObs = observableCodeEditor(this._editor);
    this._additionalLinesWidget = this._register(
      new AdditionalLinesWidget(
        this._editor,
        derivedOpts({ owner: this, equalsFn: equalsIfDefinedC(thisEqualsC()) }, (reader) => {
          const uiState = this._state.read(reader);
          return uiState ? new AdditionalLinesData(
            uiState.lineNumber,
            uiState.additionalLines,
            uiState.additionalReservedLineCount
          ) : void 0;
        }),
        this._shouldKeepCursorStable,
        this._isClickable
      )
    );
    this._isInlineTextHovered = this._editorObs.isTargetHovered(
      (p) => p.target.type === MouseTargetType.CONTENT_TEXT && p.target.detail.injectedText?.options.attachedData instanceof GhostTextAttachedData && p.target.detail.injectedText.options.attachedData.owner === this,
      this._store
    );
    this._register(toDisposable(() => {
      this._isDisposed.set(true, void 0);
    }));
    this._register(this._editorObs.setDecorations(this._decorations));
    if (this._isClickable) {
      this._register(this._additionalLinesWidget.onDidClick((e) => this._onDidClick.fire(e)));
      this._register(this._editor.onMouseUp((e) => {
        if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
          return;
        }
        const a = e.target.detail.injectedText?.options.attachedData;
        if (a instanceof GhostTextAttachedData && a.owner === this) {
          this._onDidClick.fire(e.event);
        }
      }));
    }
    this._register(autorun((reader) => {
      const state = this._state.read(reader);
      state?.handleInlineCompletionShown(state.telemetryViewData);
    }));
    this._register(autorunWithStore((reader, store) => {
      if (USE_SQUIGGLES_FOR_WARNING) {
        return;
      }
      const state = this._warningState.read(reader);
      if (!state) {
        return;
      }
      const lineHeight = this._editorObs.getOption(EditorOption.lineHeight);
      store.add(this._editorObs.createContentWidget({
        position: constObservable({
          position: new Position(state.lineNumber, Number.MAX_SAFE_INTEGER),
          preference: [ContentWidgetPositionPreference.EXACT],
          positionAffinity: PositionAffinity.Right
        }),
        allowEditorOverflow: false,
        domNode: n.div({
          class: "ghost-text-view-warning-widget",
          style: {
            width: lineHeight,
            height: lineHeight,
            marginLeft: 4,
            color: "orange"
          },
          ref: (dom) => {
            dom.ghostTextViewWarningWidgetData = { range: Range.fromPositions(state.position) };
          }
        }, [
          n.div(
            {
              class: "ghost-text-view-warning-widget-icon",
              style: {
                width: "100%",
                height: "100%",
                display: "flex",
                alignContent: "center",
                alignItems: "center"
              }
            },
            [renderIcon(state.icon)]
          )
        ]).keepUpdated(store).element
      }));
    }));
  }
  static getWarningWidgetContext(domNode) {
    const data = domNode.ghostTextViewWarningWidgetData;
    if (data) {
      return data;
    } else if (domNode.parentElement) {
      return this.getWarningWidgetContext(domNode.parentElement);
    }
    return void 0;
  }
  ownsViewZone(viewZoneId) {
    return this._additionalLinesWidget.viewZoneId === viewZoneId;
  }
};
GhostTextView = __decorateClass([
  __decorateParam(3, ILanguageService)
], GhostTextView);
class GhostTextAttachedData {
  constructor(owner) {
    this.owner = owner;
  }
}
function computeGhostTextViewData(ghostText, textModel, ghostTextClassName) {
  const inlineTexts = [];
  const additionalLines = [];
  function addToAdditionalLines(ghLines, className) {
    if (additionalLines.length > 0) {
      const lastLine = additionalLines[additionalLines.length - 1];
      if (className) {
        lastLine.decorations.push(new LineDecoration(
          lastLine.content.length + 1,
          lastLine.content.length + 1 + ghLines[0].line.length,
          className,
          InlineDecorationType.Regular
        ));
      }
      lastLine.content += ghLines[0].line;
      ghLines = ghLines.slice(1);
    }
    for (const ghLine of ghLines) {
      additionalLines.push({
        content: ghLine.line,
        decorations: className ? [new LineDecoration(
          1,
          ghLine.line.length + 1,
          className,
          InlineDecorationType.Regular
        ), ...ghLine.lineDecorations] : [...ghLine.lineDecorations]
      });
    }
  }
  const textBufferLine = textModel.getLineContent(ghostText.lineNumber);
  let hiddenTextStartColumn = void 0;
  let lastIdx = 0;
  for (const part of ghostText.parts) {
    let ghLines = part.lines;
    if (hiddenTextStartColumn === void 0) {
      inlineTexts.push({ column: part.column, text: ghLines[0].line, preview: part.preview, lineDecorations: ghLines[0].lineDecorations });
      ghLines = ghLines.slice(1);
    } else {
      addToAdditionalLines([{ line: textBufferLine.substring(lastIdx, part.column - 1), lineDecorations: [] }], void 0);
    }
    if (ghLines.length > 0) {
      addToAdditionalLines(ghLines, ghostTextClassName);
      if (hiddenTextStartColumn === void 0 && part.column <= textBufferLine.length) {
        hiddenTextStartColumn = part.column;
      }
    }
    lastIdx = part.column - 1;
  }
  let additionalLinesOriginalSuffix = void 0;
  if (hiddenTextStartColumn !== void 0) {
    additionalLinesOriginalSuffix = new RangeSingleLine(ghostText.lineNumber, new ColumnRange(lastIdx + 1, textBufferLine.length + 1));
  }
  const hiddenRange = hiddenTextStartColumn !== void 0 ? new ColumnRange(hiddenTextStartColumn, textBufferLine.length + 1) : void 0;
  return {
    inlineTexts,
    additionalLines,
    hiddenRange,
    additionalLinesOriginalSuffix
  };
}
class AdditionalLinesData {
  constructor(lineNumber, additionalLines, minReservedLineCount) {
    this.lineNumber = lineNumber;
    this.additionalLines = additionalLines;
    this.minReservedLineCount = minReservedLineCount;
  }
  equals(other) {
    if (this.lineNumber !== other.lineNumber) {
      return false;
    }
    if (this.minReservedLineCount !== other.minReservedLineCount) {
      return false;
    }
    return equals(this.additionalLines, other.additionalLines, thisEqualsC());
  }
}
class AdditionalLinesWidget extends Disposable {
  constructor(_editor, _lines, _shouldKeepCursorStable, _isClickable) {
    super();
    this._editor = _editor;
    this._lines = _lines;
    this._shouldKeepCursorStable = _shouldKeepCursorStable;
    this._isClickable = _isClickable;
    this._viewZoneHeight = observableValue("viewZoneHeight", void 0);
    this.editorOptionsChanged = observableSignalFromEvent("editorOptionChanged", Event.filter(
      this._editor.onDidChangeConfiguration,
      (e) => e.hasChanged(EditorOption.disableMonospaceOptimizations) || e.hasChanged(EditorOption.stopRenderingLineAfter) || e.hasChanged(EditorOption.renderWhitespace) || e.hasChanged(EditorOption.renderControlCharacters) || e.hasChanged(EditorOption.fontLigatures) || e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)
    ));
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._viewZoneListener = this._register(new MutableDisposable());
    this.isHovered = observableCodeEditor(this._editor).isTargetHovered(
      (p) => isTargetGhostText(p.target.element),
      this._store
    );
    this.hasBeenAccepted = false;
    if (this._editor instanceof CodeEditorWidget && this._shouldKeepCursorStable) {
      this._register(this._editor.onBeforeExecuteEdit((e) => this.hasBeenAccepted = e.source === "inlineSuggestion.accept"));
    }
    this._register(autorun((reader) => {
      const lines = this._lines.read(reader);
      this.editorOptionsChanged.read(reader);
      if (lines) {
        this.hasBeenAccepted = false;
        this.updateLines(lines.lineNumber, lines.additionalLines, lines.minReservedLineCount);
      } else {
        this.clear();
      }
    }));
  }
  get viewZoneId() {
    return this._viewZoneInfo?.viewZoneId;
  }
  get viewZoneHeight() {
    return this._viewZoneHeight;
  }
  dispose() {
    super.dispose();
    this.clear();
  }
  clear() {
    this._viewZoneListener.clear();
    this._editor.changeViewZones((changeAccessor) => {
      this.removeActiveViewZone(changeAccessor);
    });
  }
  updateLines(lineNumber, additionalLines, minReservedLineCount) {
    const textModel = this._editor.getModel();
    if (!textModel) {
      return;
    }
    const { tabSize } = textModel.getOptions();
    observableCodeEditor(this._editor).transaction((_) => {
      this._editor.changeViewZones((changeAccessor) => {
        const store = new DisposableStore();
        this.removeActiveViewZone(changeAccessor);
        const heightInLines = Math.max(additionalLines.length, minReservedLineCount);
        if (heightInLines > 0) {
          const domNode = document.createElement("div");
          renderLines(domNode, tabSize, additionalLines, this._editor.getOptions(), this._isClickable);
          if (this._isClickable) {
            store.add(addDisposableListener(domNode, "mousedown", (e) => {
              e.preventDefault();
            }));
            store.add(addDisposableListener(domNode, "click", (e) => {
              if (isTargetGhostText(e.target)) {
                this._onDidClick.fire(new StandardMouseEvent(getWindow(e), e));
              }
            }));
          }
          this.addViewZone(changeAccessor, lineNumber, heightInLines, domNode);
        }
        this._viewZoneListener.value = store;
      });
    });
  }
  addViewZone(changeAccessor, afterLineNumber, heightInLines, domNode) {
    const id = changeAccessor.addZone({
      afterLineNumber,
      heightInLines,
      domNode,
      afterColumnAffinity: PositionAffinity.Right,
      onComputedHeight: (height) => {
        this._viewZoneHeight.set(height, void 0);
      }
    });
    this.keepCursorStable(afterLineNumber, heightInLines);
    this._viewZoneInfo = { viewZoneId: id, heightInLines, lineNumber: afterLineNumber };
  }
  removeActiveViewZone(changeAccessor) {
    if (this._viewZoneInfo) {
      changeAccessor.removeZone(this._viewZoneInfo.viewZoneId);
      if (!this.hasBeenAccepted) {
        this.keepCursorStable(this._viewZoneInfo.lineNumber, -this._viewZoneInfo.heightInLines);
      }
      this._viewZoneInfo = void 0;
      this._viewZoneHeight.set(void 0, void 0);
    }
  }
  keepCursorStable(lineNumber, heightInLines) {
    if (!this._shouldKeepCursorStable) {
      return;
    }
    const cursorLineNumber = this._editor.getSelection()?.getStartPosition()?.lineNumber;
    if (cursorLineNumber !== void 0 && lineNumber < cursorLineNumber) {
      this._editor.setScrollTop(this._editor.getScrollTop() + heightInLines * this._editor.getOption(EditorOption.lineHeight));
    }
  }
}
function isTargetGhostText(target) {
  return isHTMLElement(target) && target.classList.contains(GHOST_TEXT_CLASS_NAME);
}
class LineData {
  constructor(content, decorations) {
    this.content = content;
    this.decorations = decorations;
  }
  equals(other) {
    if (!this.content.equals(other.content)) {
      return false;
    }
    return LineDecoration.equalsArr(this.decorations, other.decorations);
  }
}
function renderLines(domNode, tabSize, lines, opts, isClickable) {
  const disableMonospaceOptimizations = opts.get(EditorOption.disableMonospaceOptimizations);
  const stopRenderingLineAfter = opts.get(EditorOption.stopRenderingLineAfter);
  const renderWhitespace = "none";
  const renderControlCharacters = opts.get(EditorOption.renderControlCharacters);
  const fontLigatures = opts.get(EditorOption.fontLigatures);
  const fontInfo = opts.get(EditorOption.fontInfo);
  const lineHeight = opts.get(EditorOption.lineHeight);
  let classNames = "suggest-preview-text";
  if (isClickable) {
    classNames += " clickable";
  }
  const sb = new StringBuilder(1e4);
  sb.appendString(`<div class="${classNames}">`);
  for (let i = 0, len = lines.length; i < len; i++) {
    const lineData = lines[i];
    const lineTokens = lineData.content;
    sb.appendString('<div class="view-line');
    sb.appendString('" style="top:');
    sb.appendString(String(i * lineHeight));
    sb.appendString('px;width:1000000px;">');
    const line = lineTokens.getLineContent();
    const isBasicASCII = strings.isBasicASCII(line);
    const containsRTL = strings.containsRTL(line);
    renderViewLine(new RenderLineInput(
      fontInfo.isMonospace && !disableMonospaceOptimizations,
      fontInfo.canUseHalfwidthRightwardsArrow,
      line,
      false,
      isBasicASCII,
      containsRTL,
      0,
      lineTokens,
      lineData.decorations.slice(),
      tabSize,
      0,
      fontInfo.spaceWidth,
      fontInfo.middotWidth,
      fontInfo.wsmiddotWidth,
      stopRenderingLineAfter,
      renderWhitespace,
      renderControlCharacters,
      fontLigatures !== EditorFontLigatures.OFF,
      null,
      null,
      0
    ), sb);
    sb.appendString("</div>");
  }
  sb.appendString("</div>");
  applyFontInfo(domNode, fontInfo);
  const html = sb.build();
  const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
  domNode.innerHTML = trustedhtml;
}
const ttPolicy = createTrustedTypesPolicy("editorGhostText", { createHTML: (value) => value });
export {
  AdditionalLinesWidget,
  GhostTextView,
  GhostTextWidgetWarning,
  LineData,
  ttPolicy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9naG9zdFRleHQvZ2hvc3RUZXh0Vmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZVRydXN0ZWRUeXBlc1BvbGljeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90cnVzdGVkVHlwZXMuanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIGF1dG9ydW4sIGF1dG9ydW5XaXRoU3RvcmUsIGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGFwcGx5Rm9udEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2NvbmZpZy9kb21Gb250SW5mby5qcyc7XG5pbXBvcnQgeyBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiwgSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yRm9udExpZ2F0dXJlcywgRWRpdG9yT3B0aW9uLCBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFN0cmluZ0VkaXQsIFN0cmluZ1JlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvc3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU3RyaW5nQnVpbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3N0cmluZ0J1aWxkZXIuanMnO1xuaW1wb3J0IHsgSWNvblBhdGgsIElubGluZUNvbXBsZXRpb25XYXJuaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwsIEluamVjdGVkVGV4dEN1cnNvclN0b3BzLCBQb3NpdGlvbkFmZmluaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IExpbmVUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgTGluZURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdmlld0xheW91dC9saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgUmVuZGVyTGluZUlucHV0LCByZW5kZXJWaWV3TGluZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgR2hvc3RUZXh0LCBHaG9zdFRleHRSZXBsYWNlbWVudCwgSUdob3N0VGV4dExpbmUgfSBmcm9tICcuLi8uLi9tb2RlbC9naG9zdFRleHQuanMnO1xuaW1wb3J0IHsgUmFuZ2VTaW5nbGVMaW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL3JhbmdlU2luZ2xlTGluZS5qcyc7XG5pbXBvcnQgeyBDb2x1bW5SYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9jb2x1bW5SYW5nZS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGdldFdpbmRvdywgaXNIVE1MRWxlbWVudCwgbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICcuL2dob3N0VGV4dFZpZXcuY3NzJztcbmltcG9ydCB7IElNb3VzZUV2ZW50LCBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IFRva2VuV2l0aFRleHRBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvdG9rZW5XaXRoVGV4dEFycmF5LmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25WaWV3RGF0YSB9IGZyb20gJy4uL2lubGluZUVkaXRzL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgZXF1YWxzLCBzdW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZXF1YWxzSWZEZWZpbmVkQywgSUVxdWF0YWJsZSwgdGhpc0VxdWFsc0MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElHaG9zdFRleHRXaWRnZXREYXRhIHtcblx0cmVhZG9ubHkgZ2hvc3RUZXh0OiBHaG9zdFRleHQgfCBHaG9zdFRleHRSZXBsYWNlbWVudDtcblx0cmVhZG9ubHkgd2FybmluZzogR2hvc3RUZXh0V2lkZ2V0V2FybmluZyB8IHVuZGVmaW5lZDtcblx0aGFuZGxlSW5saW5lQ29tcGxldGlvblNob3duKHZpZXdEYXRhOiBJbmxpbmVDb21wbGV0aW9uVmlld0RhdGEpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgR2hvc3RUZXh0V2lkZ2V0V2FybmluZyB7XG5cdHB1YmxpYyBzdGF0aWMgZnJvbSh3YXJuaW5nOiBJbmxpbmVDb21wbGV0aW9uV2FybmluZyB8IHVuZGVmaW5lZCk6IEdob3N0VGV4dFdpZGdldFdhcm5pbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghd2FybmluZykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBHaG9zdFRleHRXaWRnZXRXYXJuaW5nKHdhcm5pbmcuaWNvbik7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgaWNvbjogSWNvblBhdGggPSBDb2RpY29uLndhcm5pbmcsXG5cdCkgeyB9XG59XG5cbmNvbnN0IFVTRV9TUVVJR0dMRVNfRk9SX1dBUk5JTkcgPSB0cnVlO1xuY29uc3QgR0hPU1RfVEVYVF9DTEFTU19OQU1FID0gJ2dob3N0LXRleHQnO1xuXG5leHBvcnQgY2xhc3MgR2hvc3RUZXh0VmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0Rpc3Bvc2VkID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yT2JzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93YXJuaW5nU3RhdGUgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9kYXRhLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCB3YXJuaW5nID0gbW9kZWw/Lndhcm5pbmc7XG5cdFx0aWYgKCFtb2RlbCB8fCAhd2FybmluZykgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0Y29uc3QgZ3QgPSBtb2RlbC5naG9zdFRleHQ7XG5cdFx0cmV0dXJuIHsgbGluZU51bWJlcjogZ3QubGluZU51bWJlciwgcG9zaXRpb246IG5ldyBQb3NpdGlvbihndC5saW5lTnVtYmVyLCBndC5wYXJ0c1swXS5jb2x1bW4pLCBpY29uOiB3YXJuaW5nLmljb24gfTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNb3VzZUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2xpY2sgPSB0aGlzLl9vbkRpZENsaWNrLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dHJhQ2xhc3NlczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQ2xpY2thYmxlOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRLZWVwQ3Vyc29yU3RhYmxlOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9taW5SZXNlcnZlZExpbmVDb3VudDogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdXNlU3ludGF4SGlnaGxpZ2h0aW5nOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGlnaGxpZ2h0U2hvcnRUZXh0OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGF0YTogSU9ic2VydmFibGU8SUdob3N0VGV4dFdpZGdldERhdGEgfCB1bmRlZmluZWQ+LFxuXHRcdG9wdGlvbnM6IHtcblx0XHRcdGV4dHJhQ2xhc3Nlcz86IHJlYWRvbmx5IHN0cmluZ1tdOyAvLyBUT0RPQGJlbmliZW5qIGltcHJvdmVcblx0XHRcdGlzQ2xpY2thYmxlPzogYm9vbGVhbjtcblx0XHRcdHNob3VsZEtlZXBDdXJzb3JTdGFibGU/OiBib29sZWFuO1xuXHRcdFx0bWluUmVzZXJ2ZWRMaW5lQ291bnQ/OiBJT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRcdFx0dXNlU3ludGF4SGlnaGxpZ2h0aW5nPzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdFx0XHRoaWdobGlnaHRTaG9ydFN1Z2dlc3Rpb25zPzogYm9vbGVhbjtcblx0XHR9LFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZXh0cmFDbGFzc2VzID0gb3B0aW9ucy5leHRyYUNsYXNzZXMgPz8gW107XG5cdFx0dGhpcy5faXNDbGlja2FibGUgPSBvcHRpb25zLmlzQ2xpY2thYmxlID8/IGZhbHNlO1xuXHRcdHRoaXMuX3Nob3VsZEtlZXBDdXJzb3JTdGFibGUgPSBvcHRpb25zLnNob3VsZEtlZXBDdXJzb3JTdGFibGUgPz8gZmFsc2U7XG5cdFx0dGhpcy5fbWluUmVzZXJ2ZWRMaW5lQ291bnQgPSBvcHRpb25zLm1pblJlc2VydmVkTGluZUNvdW50ID8/IGNvbnN0T2JzZXJ2YWJsZSgwKTtcblx0XHR0aGlzLl91c2VTeW50YXhIaWdobGlnaHRpbmcgPSBvcHRpb25zLnVzZVN5bnRheEhpZ2hsaWdodGluZyA/PyBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdFx0dGhpcy5faGlnaGxpZ2h0U2hvcnRUZXh0ID0gb3B0aW9ucy5oaWdobGlnaHRTaG9ydFN1Z2dlc3Rpb25zID8/IGZhbHNlO1xuXG5cdFx0dGhpcy5fZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fZWRpdG9yKTtcblx0XHR0aGlzLl9hZGRpdGlvbmFsTGluZXNXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcihcblx0XHRcdG5ldyBBZGRpdGlvbmFsTGluZXNXaWRnZXQoXG5cdFx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdFx0ZGVyaXZlZE9wdHMoeyBvd25lcjogdGhpcywgZXF1YWxzRm46IGVxdWFsc0lmRGVmaW5lZEModGhpc0VxdWFsc0MoKSkgfSwgcmVhZGVyID0+IHtcblx0XHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIGxpbmVzICovXG5cdFx0XHRcdFx0Y29uc3QgdWlTdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRyZXR1cm4gdWlTdGF0ZSA/IG5ldyBBZGRpdGlvbmFsTGluZXNEYXRhKFxuXHRcdFx0XHRcdFx0dWlTdGF0ZS5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0dWlTdGF0ZS5hZGRpdGlvbmFsTGluZXMsXG5cdFx0XHRcdFx0XHR1aVN0YXRlLmFkZGl0aW9uYWxSZXNlcnZlZExpbmVDb3VudCxcblx0XHRcdFx0XHQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0dGhpcy5fc2hvdWxkS2VlcEN1cnNvclN0YWJsZSxcblx0XHRcdFx0dGhpcy5faXNDbGlja2FibGVcblx0XHRcdClcblx0XHQpO1xuXHRcdHRoaXMuX2lzSW5saW5lVGV4dEhvdmVyZWQgPSB0aGlzLl9lZGl0b3JPYnMuaXNUYXJnZXRIb3ZlcmVkKFxuXHRcdFx0cCA9PiBwLnRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUICYmXG5cdFx0XHRcdHAudGFyZ2V0LmRldGFpbC5pbmplY3RlZFRleHQ/Lm9wdGlvbnMuYXR0YWNoZWREYXRhIGluc3RhbmNlb2YgR2hvc3RUZXh0QXR0YWNoZWREYXRhICYmXG5cdFx0XHRcdHAudGFyZ2V0LmRldGFpbC5pbmplY3RlZFRleHQub3B0aW9ucy5hdHRhY2hlZERhdGEub3duZXIgPT09IHRoaXMsXG5cdFx0XHR0aGlzLl9zdG9yZVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4geyB0aGlzLl9pc0Rpc3Bvc2VkLnNldCh0cnVlLCB1bmRlZmluZWQpOyB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yT2JzLnNldERlY29yYXRpb25zKHRoaXMuX2RlY29yYXRpb25zKSk7XG5cblx0XHRpZiAodGhpcy5faXNDbGlja2FibGUpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FkZGl0aW9uYWxMaW5lc1dpZGdldC5vbkRpZENsaWNrKChlKSA9PiB0aGlzLl9vbkRpZENsaWNrLmZpcmUoZSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbk1vdXNlVXAoZSA9PiB7XG5cdFx0XHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGEgPSBlLnRhcmdldC5kZXRhaWwuaW5qZWN0ZWRUZXh0Py5vcHRpb25zLmF0dGFjaGVkRGF0YTtcblx0XHRcdFx0aWYgKGEgaW5zdGFuY2VvZiBHaG9zdFRleHRBdHRhY2hlZERhdGEgJiYgYS5vd25lciA9PT0gdGhpcykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZShlLmV2ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0c3RhdGU/LmhhbmRsZUlubGluZUNvbXBsZXRpb25TaG93bihzdGF0ZS50ZWxlbWV0cnlWaWV3RGF0YSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0aWYgKFVTRV9TUVVJR0dMRVNfRk9SX1dBUk5JTkcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3dhcm5pbmdTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXHRcdFx0c3RvcmUuYWRkKHRoaXMuX2VkaXRvck9icy5jcmVhdGVDb250ZW50V2lkZ2V0KHtcblx0XHRcdFx0cG9zaXRpb246IGNvbnN0T2JzZXJ2YWJsZTxJQ29udGVudFdpZGdldFBvc2l0aW9uPih7XG5cdFx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbihzdGF0ZS5saW5lTnVtYmVyLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiksXG5cdFx0XHRcdFx0cHJlZmVyZW5jZTogW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuRVhBQ1RdLFxuXHRcdFx0XHRcdHBvc2l0aW9uQWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkuUmlnaHQsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHRcdFx0ZG9tTm9kZTogbi5kaXYoe1xuXHRcdFx0XHRcdGNsYXNzOiAnZ2hvc3QtdGV4dC12aWV3LXdhcm5pbmctd2lkZ2V0Jyxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0d2lkdGg6IGxpbmVIZWlnaHQsXG5cdFx0XHRcdFx0XHRoZWlnaHQ6IGxpbmVIZWlnaHQsXG5cdFx0XHRcdFx0XHRtYXJnaW5MZWZ0OiA0LFxuXHRcdFx0XHRcdFx0Y29sb3I6ICdvcmFuZ2UnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVmOiAoZG9tKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRcdChkb20gYXMgYW55IGFzIFdpZGdldERvbUVsZW1lbnQpLmdob3N0VGV4dFZpZXdXYXJuaW5nV2lkZ2V0RGF0YSA9IHsgcmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMoc3RhdGUucG9zaXRpb24pIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCBbXG5cdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0Y2xhc3M6ICdnaG9zdC10ZXh0LXZpZXctd2FybmluZy13aWRnZXQtaWNvbicsXG5cdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHR3aWR0aDogJzEwMCUnLFxuXHRcdFx0XHRcdFx0XHRoZWlnaHQ6ICcxMDAlJyxcblx0XHRcdFx0XHRcdFx0ZGlzcGxheTogJ2ZsZXgnLFxuXHRcdFx0XHRcdFx0XHRhbGlnbkNvbnRlbnQ6ICdjZW50ZXInLFxuXHRcdFx0XHRcdFx0XHRhbGlnbkl0ZW1zOiAnY2VudGVyJyxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0W3JlbmRlckljb24oc3RhdGUuaWNvbildXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHRdKS5rZWVwVXBkYXRlZChzdG9yZSkuZWxlbWVudCxcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldFdhcm5pbmdXaWRnZXRDb250ZXh0KGRvbU5vZGU6IEhUTUxFbGVtZW50KTogeyByYW5nZTogUmFuZ2UgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgZGF0YSA9IChkb21Ob2RlIGFzIGFueSBhcyBXaWRnZXREb21FbGVtZW50KS5naG9zdFRleHRWaWV3V2FybmluZ1dpZGdldERhdGE7XG5cdFx0aWYgKGRhdGEpIHtcblx0XHRcdHJldHVybiBkYXRhO1xuXHRcdH0gZWxzZSBpZiAoZG9tTm9kZS5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRXYXJuaW5nV2lkZ2V0Q29udGV4dChkb21Ob2RlLnBhcmVudEVsZW1lbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbm9uV2hpdGVzcGFjZUNvdW50ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWRhdGEpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdGNvbnN0IGdob3N0VGV4dCA9IGRhdGEuZ2hvc3RUZXh0O1xuXHRcdGNvbnN0IGFsbFRleHQgPSBnaG9zdFRleHQucGFydHMubWFwKHAgPT4gcC5saW5lcy5tYXAobCA9PiBsLmxpbmUpLmpvaW4oJycpKS5qb2luKCcnKTtcblx0XHRyZXR1cm4gYWxsVGV4dC5yZXBsYWNlKC9cXHMvZywgJycpLmxlbmd0aDtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZXh0cmFDbGFzc05hbWVzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGV4dHJhQ2xhc3NlcyA9IHRoaXMuX2V4dHJhQ2xhc3Nlcy5zbGljZSgpO1xuXHRcdGlmIChVU0VfU1FVSUdHTEVTX0ZPUl9XQVJOSU5HICYmIHRoaXMuX3dhcm5pbmdTdGF0ZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdGV4dHJhQ2xhc3Nlcy5wdXNoKCd3YXJuaW5nJyk7XG5cdFx0fVxuXHRcdGNvbnN0IG5vbldoaXRlc3BhY2VDb3VudCA9IHRoaXMuX25vbldoaXRlc3BhY2VDb3VudC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKHRoaXMuX2hpZ2hsaWdodFNob3J0VGV4dCAmJiBub25XaGl0ZXNwYWNlQ291bnQgJiYgbm9uV2hpdGVzcGFjZUNvdW50IDwgMykge1xuXHRcdFx0ZXh0cmFDbGFzc2VzLnB1c2goJ3Nob3J0LXRleHQnKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX3VzZVN5bnRheEhpZ2hsaWdodGluZy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdGV4dHJhQ2xhc3Nlcy5wdXNoKCdzeW50YXgtaGlnaGxpZ2h0ZWQnKTtcblx0XHR9XG5cdFx0Y29uc3QgZXh0cmFDbGFzc05hbWVzID0gZXh0cmFDbGFzc2VzLm1hcChjID0+IGAgJHtjfWApLmpvaW4oJycpO1xuXHRcdHJldHVybiBleHRyYUNsYXNzTmFtZXM7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRjb25zdCBwcm9wcyA9IHRoaXMuX2RhdGEucmVhZChyZWFkZXIpO1xuXHRcdGlmICghcHJvcHMpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXRleHRNb2RlbCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRjb25zdCBnaG9zdFRleHQgPSBwcm9wcy5naG9zdFRleHQ7XG5cdFx0Y29uc3QgcmVwbGFjZWRSYW5nZSA9IGdob3N0VGV4dCBpbnN0YW5jZW9mIEdob3N0VGV4dFJlcGxhY2VtZW50ID8gZ2hvc3RUZXh0LmNvbHVtblJhbmdlIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZCA9IHRoaXMuX3VzZVN5bnRheEhpZ2hsaWdodGluZy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZXh0cmFDbGFzc05hbWVzID0gdGhpcy5fZXh0cmFDbGFzc05hbWVzLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCB7IGlubGluZVRleHRzLCBhZGRpdGlvbmFsTGluZXMsIGhpZGRlblJhbmdlLCBhZGRpdGlvbmFsTGluZXNPcmlnaW5hbFN1ZmZpeCB9ID0gY29tcHV0ZUdob3N0VGV4dFZpZXdEYXRhKGdob3N0VGV4dCwgdGV4dE1vZGVsLCBHSE9TVF9URVhUX0NMQVNTX05BTUUgKyBleHRyYUNsYXNzTmFtZXMpO1xuXG5cdFx0Y29uc3QgY3VycmVudExpbmUgPSB0ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQoZ2hvc3RUZXh0LmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGVkaXQgPSBuZXcgU3RyaW5nRWRpdChpbmxpbmVUZXh0cy5tYXAodCA9PiBTdHJpbmdSZXBsYWNlbWVudC5pbnNlcnQodC5jb2x1bW4gLSAxLCB0LnRleHQpKSk7XG5cdFx0Y29uc3QgdG9rZW5zID0gc3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZCA/IHRleHRNb2RlbC50b2tlbml6YXRpb24udG9rZW5pemVMaW5lc0F0KGdob3N0VGV4dC5saW5lTnVtYmVyLCBbZWRpdC5hcHBseShjdXJyZW50TGluZSksIC4uLmFkZGl0aW9uYWxMaW5lcy5tYXAobCA9PiBsLmNvbnRlbnQpXSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbmV3UmFuZ2VzID0gZWRpdC5nZXROZXdSYW5nZXMoKTtcblx0XHRjb25zdCBpbmxpbmVUZXh0c1dpdGhUb2tlbnMgPSBpbmxpbmVUZXh0cy5tYXAoKHQsIGlkeCkgPT4gKHsgLi4udCwgdG9rZW5zOiB0b2tlbnM/LlswXT8uZ2V0VG9rZW5zSW5SYW5nZShuZXdSYW5nZXNbaWR4XSkgfSkpO1xuXG5cdFx0Y29uc3QgdG9rZW5pemVkQWRkaXRpb25hbExpbmVzOiBMaW5lRGF0YVtdID0gYWRkaXRpb25hbExpbmVzLm1hcCgobCwgaWR4KSA9PiB7XG5cdFx0XHRsZXQgY29udGVudCA9IHRva2Vucz8uW2lkeCArIDFdID8/IExpbmVUb2tlbnMuY3JlYXRlRW1wdHkobC5jb250ZW50LCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjKTtcblx0XHRcdGlmIChpZHggPT09IGFkZGl0aW9uYWxMaW5lcy5sZW5ndGggLSAxICYmIGFkZGl0aW9uYWxMaW5lc09yaWdpbmFsU3VmZml4KSB7XG5cdFx0XHRcdGNvbnN0IHQgPSBUb2tlbldpdGhUZXh0QXJyYXkuZnJvbUxpbmVUb2tlbnModGV4dE1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGFkZGl0aW9uYWxMaW5lc09yaWdpbmFsU3VmZml4LmxpbmVOdW1iZXIpKTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdDb250ZW50ID0gdC5zbGljZShhZGRpdGlvbmFsTGluZXNPcmlnaW5hbFN1ZmZpeC5jb2x1bW5SYW5nZS50b1plcm9CYXNlZE9mZnNldFJhbmdlKCkpO1xuXHRcdFx0XHRjb250ZW50ID0gVG9rZW5XaXRoVGV4dEFycmF5LmZyb21MaW5lVG9rZW5zKGNvbnRlbnQpLmFwcGVuZChleGlzdGluZ0NvbnRlbnQpLnRvTGluZVRva2Vucyhjb250ZW50Lmxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IExpbmVEYXRhKFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRsLmRlY29yYXRpb25zLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGN1cnNvckNvbHVtbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKT8uZ2V0U3RhcnRQb3NpdGlvbigpLmNvbHVtbiE7XG5cdFx0Y29uc3QgZGlzam9pbnRJbmxpbmVUZXh0cyA9IGlubGluZVRleHRzV2l0aFRva2Vucy5maWx0ZXIoaW5saW5lID0+IGlubGluZS50ZXh0ICE9PSAnJyk7XG5cdFx0Y29uc3QgaGFzSW5zZXJ0aW9uT25DdXJyZW50TGluZSA9IGRpc2pvaW50SW5saW5lVGV4dHMubGVuZ3RoICE9PSAwO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVZpZXdEYXRhID0gbmV3IElubGluZUNvbXBsZXRpb25WaWV3RGF0YShcblx0XHRcdChoYXNJbnNlcnRpb25PbkN1cnJlbnRMaW5lID8gZGlzam9pbnRJbmxpbmVUZXh0c1swXS5jb2x1bW4gOiAxKSAtIGN1cnNvckNvbHVtbixcblx0XHRcdGhhc0luc2VydGlvbk9uQ3VycmVudExpbmUgPyAwIDogKGFkZGl0aW9uYWxMaW5lcy5maW5kSW5kZXgobGluZSA9PiBsaW5lLmNvbnRlbnQgIT09ICcnKSArIDEpLFxuXHRcdFx0aGFzSW5zZXJ0aW9uT25DdXJyZW50TGluZSA/IDEgOiAwLFxuXHRcdFx0YWRkaXRpb25hbExpbmVzLmxlbmd0aCArIChoYXNJbnNlcnRpb25PbkN1cnJlbnRMaW5lID8gMSA6IDApLFxuXHRcdFx0MCxcblx0XHRcdHN1bShkaXNqb2ludElubGluZVRleHRzLm1hcChpbmxpbmUgPT4gaW5saW5lLnRleHQubGVuZ3RoKSkgKyBzdW0odG9rZW5pemVkQWRkaXRpb25hbExpbmVzLm1hcChsaW5lID0+IGxpbmUuY29udGVudC5nZXRUZXh0TGVuZ3RoKCkpKSxcblx0XHRcdGRpc2pvaW50SW5saW5lVGV4dHMubGVuZ3RoICsgKGFkZGl0aW9uYWxMaW5lcy5sZW5ndGggPiAwID8gMSA6IDApLFxuXHRcdFx0ZGlzam9pbnRJbmxpbmVUZXh0cy5sZW5ndGggPiAxICYmIHRva2VuaXplZEFkZGl0aW9uYWxMaW5lcy5sZW5ndGggPT09IDAgPyBkaXNqb2ludElubGluZVRleHRzLmV2ZXJ5KGlubGluZSA9PiBpbmxpbmUudGV4dCA9PT0gZGlzam9pbnRJbmxpbmVUZXh0c1swXS50ZXh0KSA6IHVuZGVmaW5lZFxuXHRcdCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVwbGFjZWRSYW5nZSxcblx0XHRcdGlubGluZVRleHRzOiBpbmxpbmVUZXh0c1dpdGhUb2tlbnMsXG5cdFx0XHRhZGRpdGlvbmFsTGluZXM6IHRva2VuaXplZEFkZGl0aW9uYWxMaW5lcyxcblx0XHRcdGhpZGRlblJhbmdlLFxuXHRcdFx0bGluZU51bWJlcjogZ2hvc3RUZXh0LmxpbmVOdW1iZXIsXG5cdFx0XHRhZGRpdGlvbmFsUmVzZXJ2ZWRMaW5lQ291bnQ6IHRoaXMuX21pblJlc2VydmVkTGluZUNvdW50LnJlYWQocmVhZGVyKSxcblx0XHRcdHRhcmdldFRleHRNb2RlbDogdGV4dE1vZGVsLFxuXHRcdFx0c3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZCxcblx0XHRcdHRlbGVtZXRyeVZpZXdEYXRhLFxuXHRcdFx0aGFuZGxlSW5saW5lQ29tcGxldGlvblNob3duOiBwcm9wcy5oYW5kbGVJbmxpbmVDb21wbGV0aW9uU2hvd24sXG5cdFx0fTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgdWlTdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXVpU3RhdGUpIHsgcmV0dXJuIFtdOyB9XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IGV4dHJhQ2xhc3NOYW1lcyA9IHRoaXMuX2V4dHJhQ2xhc3NOYW1lcy5yZWFkKHJlYWRlcik7XG5cblx0XHRpZiAodWlTdGF0ZS5yZXBsYWNlZFJhbmdlKSB7XG5cdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IHVpU3RhdGUucmVwbGFjZWRSYW5nZS50b1JhbmdlKHVpU3RhdGUubGluZU51bWJlciksXG5cdFx0XHRcdG9wdGlvbnM6IHsgaW5saW5lQ2xhc3NOYW1lOiAnaW5saW5lLWNvbXBsZXRpb24tdGV4dC10by1yZXBsYWNlJyArIGV4dHJhQ2xhc3NOYW1lcywgZGVzY3JpcHRpb246ICdHaG9zdFRleHRSZXBsYWNlbWVudCcgfVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHVpU3RhdGUuaGlkZGVuUmFuZ2UpIHtcblx0XHRcdGRlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRyYW5nZTogdWlTdGF0ZS5oaWRkZW5SYW5nZS50b1JhbmdlKHVpU3RhdGUubGluZU51bWJlciksXG5cdFx0XHRcdG9wdGlvbnM6IHsgaW5saW5lQ2xhc3NOYW1lOiAnZ2hvc3QtdGV4dC1oaWRkZW4nLCBkZXNjcmlwdGlvbjogJ2dob3N0LXRleHQtaGlkZGVuJywgfVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBwIG9mIHVpU3RhdGUuaW5saW5lVGV4dHMpIHtcblx0XHRcdGxldCBpbmxpbmVFeHRyYUNsYXNzTmFtZXMgPSAnJztcblx0XHRcdGlmICh0aGlzLl9oaWdobGlnaHRTaG9ydFRleHQgJiYgcC50ZXh0Lmxlbmd0aCA8IDUpIHtcblx0XHRcdFx0aW5saW5lRXh0cmFDbGFzc05hbWVzICs9ICcgc2hvcnQtdGV4dCc7XG5cdFx0XHR9XG5cdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3IFBvc2l0aW9uKHVpU3RhdGUubGluZU51bWJlciwgcC5jb2x1bW4pKSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnZ2hvc3QtdGV4dC1kZWNvcmF0aW9uJyxcblx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0Y29udGVudDogcC50ZXh0LFxuXHRcdFx0XHRcdFx0dG9rZW5zOiBwLnRva2Vucyxcblx0XHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogKHAucHJldmlldyA/ICdnaG9zdC10ZXh0LWRlY29yYXRpb24tcHJldmlldycgOiAnZ2hvc3QtdGV4dC1kZWNvcmF0aW9uJylcblx0XHRcdFx0XHRcdFx0KyAodGhpcy5faXNDbGlja2FibGUgPyAnIGNsaWNrYWJsZScgOiAnJylcblx0XHRcdFx0XHRcdFx0KyBleHRyYUNsYXNzTmFtZXNcblx0XHRcdFx0XHRcdFx0KyBpbmxpbmVFeHRyYUNsYXNzTmFtZXNcblx0XHRcdFx0XHRcdFx0KyBwLmxpbmVEZWNvcmF0aW9ucy5tYXAoZCA9PiAnICcgKyBkLmNsYXNzTmFtZSkuam9pbignICcpLCAvLyBUT0RPOiB0YWtlIHRoZSByYW5nZXMgaW50byBhY2NvdW50IGZvciBsaW5lIGRlY29yYXRpb25zXG5cdFx0XHRcdFx0XHRjdXJzb3JTdG9wczogSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuTGVmdCxcblx0XHRcdFx0XHRcdGF0dGFjaGVkRGF0YTogbmV3IEdob3N0VGV4dEF0dGFjaGVkRGF0YSh0aGlzKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlY29yYXRpb25zO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hZGRpdGlvbmFsTGluZXNXaWRnZXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNJbmxpbmVUZXh0SG92ZXJlZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNIb3ZlcmVkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkLnJlYWQocmVhZGVyKSkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRyZXR1cm4gdGhpcy5faXNJbmxpbmVUZXh0SG92ZXJlZC5yZWFkKHJlYWRlcikgfHwgdGhpcy5fYWRkaXRpb25hbExpbmVzV2lkZ2V0LmlzSG92ZXJlZC5yZWFkKHJlYWRlcik7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBoZWlnaHQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gbGluZUhlaWdodCArICh0aGlzLl9hZGRpdGlvbmFsTGluZXNXaWRnZXQudmlld1pvbmVIZWlnaHQucmVhZChyZWFkZXIpID8/IDApO1xuXHR9KTtcblxuXHRwdWJsaWMgb3duc1ZpZXdab25lKHZpZXdab25lSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hZGRpdGlvbmFsTGluZXNXaWRnZXQudmlld1pvbmVJZCA9PT0gdmlld1pvbmVJZDtcblx0fVxufVxuXG5jbGFzcyBHaG9zdFRleHRBdHRhY2hlZERhdGEge1xuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgb3duZXI6IEdob3N0VGV4dFZpZXcpIHsgfVxufVxuXG5pbnRlcmZhY2UgV2lkZ2V0RG9tRWxlbWVudCB7XG5cdGdob3N0VGV4dFZpZXdXYXJuaW5nV2lkZ2V0RGF0YT86IHtcblx0XHRyYW5nZTogUmFuZ2U7XG5cdH07XG59XG5cbmZ1bmN0aW9uIGNvbXB1dGVHaG9zdFRleHRWaWV3RGF0YShnaG9zdFRleHQ6IEdob3N0VGV4dCB8IEdob3N0VGV4dFJlcGxhY2VtZW50LCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIGdob3N0VGV4dENsYXNzTmFtZTogc3RyaW5nKSB7XG5cdGNvbnN0IGlubGluZVRleHRzOiB7IGNvbHVtbjogbnVtYmVyOyB0ZXh0OiBzdHJpbmc7IHByZXZpZXc6IGJvb2xlYW47IGxpbmVEZWNvcmF0aW9uczogTGluZURlY29yYXRpb25bXSB9W10gPSBbXTtcblx0Y29uc3QgYWRkaXRpb25hbExpbmVzOiB7IGNvbnRlbnQ6IHN0cmluZzsgZGVjb3JhdGlvbnM6IExpbmVEZWNvcmF0aW9uW10gfVtdID0gW107XG5cblx0ZnVuY3Rpb24gYWRkVG9BZGRpdGlvbmFsTGluZXMoZ2hMaW5lczogcmVhZG9ubHkgSUdob3N0VGV4dExpbmVbXSwgY2xhc3NOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoYWRkaXRpb25hbExpbmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGxhc3RMaW5lID0gYWRkaXRpb25hbExpbmVzW2FkZGl0aW9uYWxMaW5lcy5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChjbGFzc05hbWUpIHtcblx0XHRcdFx0bGFzdExpbmUuZGVjb3JhdGlvbnMucHVzaChuZXcgTGluZURlY29yYXRpb24oXG5cdFx0XHRcdFx0bGFzdExpbmUuY29udGVudC5sZW5ndGggKyAxLFxuXHRcdFx0XHRcdGxhc3RMaW5lLmNvbnRlbnQubGVuZ3RoICsgMSArIGdoTGluZXNbMF0ubGluZS5sZW5ndGgsXG5cdFx0XHRcdFx0Y2xhc3NOYW1lLFxuXHRcdFx0XHRcdElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXJcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0XHRsYXN0TGluZS5jb250ZW50ICs9IGdoTGluZXNbMF0ubGluZTtcblxuXHRcdFx0Z2hMaW5lcyA9IGdoTGluZXMuc2xpY2UoMSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZ2hMaW5lIG9mIGdoTGluZXMpIHtcblx0XHRcdGFkZGl0aW9uYWxMaW5lcy5wdXNoKHtcblx0XHRcdFx0Y29udGVudDogZ2hMaW5lLmxpbmUsXG5cdFx0XHRcdGRlY29yYXRpb25zOiBjbGFzc05hbWUgPyBbbmV3IExpbmVEZWNvcmF0aW9uKFxuXHRcdFx0XHRcdDEsXG5cdFx0XHRcdFx0Z2hMaW5lLmxpbmUubGVuZ3RoICsgMSxcblx0XHRcdFx0XHRjbGFzc05hbWUsXG5cdFx0XHRcdFx0SW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhclxuXHRcdFx0XHQpLCAuLi5naExpbmUubGluZURlY29yYXRpb25zXSA6IFsuLi5naExpbmUubGluZURlY29yYXRpb25zXVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgdGV4dEJ1ZmZlckxpbmUgPSB0ZXh0TW9kZWwuZ2V0TGluZUNvbnRlbnQoZ2hvc3RUZXh0LmxpbmVOdW1iZXIpO1xuXG5cdGxldCBoaWRkZW5UZXh0U3RhcnRDb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0bGV0IGxhc3RJZHggPSAwO1xuXHRmb3IgKGNvbnN0IHBhcnQgb2YgZ2hvc3RUZXh0LnBhcnRzKSB7XG5cdFx0bGV0IGdoTGluZXMgPSBwYXJ0LmxpbmVzO1xuXHRcdGlmIChoaWRkZW5UZXh0U3RhcnRDb2x1bW4gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aW5saW5lVGV4dHMucHVzaCh7IGNvbHVtbjogcGFydC5jb2x1bW4sIHRleHQ6IGdoTGluZXNbMF0ubGluZSwgcHJldmlldzogcGFydC5wcmV2aWV3LCBsaW5lRGVjb3JhdGlvbnM6IGdoTGluZXNbMF0ubGluZURlY29yYXRpb25zIH0pO1xuXHRcdFx0Z2hMaW5lcyA9IGdoTGluZXMuc2xpY2UoMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFkZFRvQWRkaXRpb25hbExpbmVzKFt7IGxpbmU6IHRleHRCdWZmZXJMaW5lLnN1YnN0cmluZyhsYXN0SWR4LCBwYXJ0LmNvbHVtbiAtIDEpLCBsaW5lRGVjb3JhdGlvbnM6IFtdIH1dLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGlmIChnaExpbmVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGFkZFRvQWRkaXRpb25hbExpbmVzKGdoTGluZXMsIGdob3N0VGV4dENsYXNzTmFtZSk7XG5cdFx0XHRpZiAoaGlkZGVuVGV4dFN0YXJ0Q29sdW1uID09PSB1bmRlZmluZWQgJiYgcGFydC5jb2x1bW4gPD0gdGV4dEJ1ZmZlckxpbmUubGVuZ3RoKSB7XG5cdFx0XHRcdGhpZGRlblRleHRTdGFydENvbHVtbiA9IHBhcnQuY29sdW1uO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxhc3RJZHggPSBwYXJ0LmNvbHVtbiAtIDE7XG5cdH1cblx0bGV0IGFkZGl0aW9uYWxMaW5lc09yaWdpbmFsU3VmZml4OiBSYW5nZVNpbmdsZUxpbmUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGlmIChoaWRkZW5UZXh0U3RhcnRDb2x1bW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdGFkZGl0aW9uYWxMaW5lc09yaWdpbmFsU3VmZml4ID0gbmV3IFJhbmdlU2luZ2xlTGluZShnaG9zdFRleHQubGluZU51bWJlciwgbmV3IENvbHVtblJhbmdlKGxhc3RJZHggKyAxLCB0ZXh0QnVmZmVyTGluZS5sZW5ndGggKyAxKSk7XG5cdH1cblxuXHRjb25zdCBoaWRkZW5SYW5nZSA9IGhpZGRlblRleHRTdGFydENvbHVtbiAhPT0gdW5kZWZpbmVkID8gbmV3IENvbHVtblJhbmdlKGhpZGRlblRleHRTdGFydENvbHVtbiwgdGV4dEJ1ZmZlckxpbmUubGVuZ3RoICsgMSkgOiB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIHtcblx0XHRpbmxpbmVUZXh0cyxcblx0XHRhZGRpdGlvbmFsTGluZXMsXG5cdFx0aGlkZGVuUmFuZ2UsXG5cdFx0YWRkaXRpb25hbExpbmVzT3JpZ2luYWxTdWZmaXgsXG5cdH07XG59XG5cbmNsYXNzIEFkZGl0aW9uYWxMaW5lc0RhdGEgaW1wbGVtZW50cyBJRXF1YXRhYmxlPEFkZGl0aW9uYWxMaW5lc0RhdGE+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGxpbmVOdW1iZXI6IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgYWRkaXRpb25hbExpbmVzOiByZWFkb25seSBMaW5lRGF0YVtdLFxuXHRcdHB1YmxpYyByZWFkb25seSBtaW5SZXNlcnZlZExpbmVDb3VudDogbnVtYmVyLFxuXHQpIHsgfVxuXG5cdGVxdWFscyhvdGhlcjogQWRkaXRpb25hbExpbmVzRGF0YSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmxpbmVOdW1iZXIgIT09IG90aGVyLmxpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubWluUmVzZXJ2ZWRMaW5lQ291bnQgIT09IG90aGVyLm1pblJlc2VydmVkTGluZUNvdW50KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBlcXVhbHModGhpcy5hZGRpdGlvbmFsTGluZXMsIG90aGVyLmFkZGl0aW9uYWxMaW5lcywgdGhpc0VxdWFsc0MoKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFkZGl0aW9uYWxMaW5lc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF92aWV3Wm9uZUluZm86IHsgdmlld1pvbmVJZDogc3RyaW5nOyBoZWlnaHRJbkxpbmVzOiBudW1iZXI7IGxpbmVOdW1iZXI6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZ2V0IHZpZXdab25lSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3ZpZXdab25lSW5mbz8udmlld1pvbmVJZDsgfVxuXG5cdHByaXZhdGUgX3ZpZXdab25lSGVpZ2h0O1xuXHRwdWJsaWMgZ2V0IHZpZXdab25lSGVpZ2h0KCk6IElPYnNlcnZhYmxlPG51bWJlciB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fdmlld1pvbmVIZWlnaHQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvck9wdGlvbnNDaGFuZ2VkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2s7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENsaWNrO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdab25lTGlzdGVuZXI7XG5cblx0cmVhZG9ubHkgaXNIb3ZlcmVkO1xuXG5cdHByaXZhdGUgaGFzQmVlbkFjY2VwdGVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGluZXM6IElPYnNlcnZhYmxlPEFkZGl0aW9uYWxMaW5lc0RhdGEgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nob3VsZEtlZXBDdXJzb3JTdGFibGU6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNDbGlja2FibGU6IGJvb2xlYW4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdmlld1pvbmVIZWlnaHQgPSBvYnNlcnZhYmxlVmFsdWU8dW5kZWZpbmVkIHwgbnVtYmVyPigndmlld1pvbmVIZWlnaHQnLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuZWRpdG9yT3B0aW9uc0NoYW5nZWQgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KCdlZGl0b3JPcHRpb25DaGFuZ2VkJywgRXZlbnQuZmlsdGVyKFxuXHRcdFx0dGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbixcblx0XHRcdGUgPT4gZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5kaXNhYmxlTW9ub3NwYWNlT3B0aW1pemF0aW9ucylcblx0XHRcdFx0fHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5zdG9wUmVuZGVyaW5nTGluZUFmdGVyKVxuXHRcdFx0XHR8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnJlbmRlcldoaXRlc3BhY2UpXG5cdFx0XHRcdHx8IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ucmVuZGVyQ29udHJvbENoYXJhY3RlcnMpXG5cdFx0XHRcdHx8IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udExpZ2F0dXJlcylcblx0XHRcdFx0fHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbylcblx0XHRcdFx0fHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KVxuXHRcdCkpO1xuXHRcdHRoaXMuX29uRGlkQ2xpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTW91c2VFdmVudD4oKSk7XG5cdFx0dGhpcy5vbkRpZENsaWNrID0gdGhpcy5fb25EaWRDbGljay5ldmVudDtcblx0XHR0aGlzLl92aWV3Wm9uZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdHRoaXMuaXNIb3ZlcmVkID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fZWRpdG9yKS5pc1RhcmdldEhvdmVyZWQoXG5cdFx0XHRwID0+IGlzVGFyZ2V0R2hvc3RUZXh0KHAudGFyZ2V0LmVsZW1lbnQpLFxuXHRcdFx0dGhpcy5fc3RvcmVcblx0XHQpO1xuXHRcdHRoaXMuaGFzQmVlbkFjY2VwdGVkID0gZmFsc2U7XG5cblx0XHRpZiAodGhpcy5fZWRpdG9yIGluc3RhbmNlb2YgQ29kZUVkaXRvcldpZGdldCAmJiB0aGlzLl9zaG91bGRLZWVwQ3Vyc29yU3RhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25CZWZvcmVFeGVjdXRlRWRpdChlID0+IHRoaXMuaGFzQmVlbkFjY2VwdGVkID0gZS5zb3VyY2UgPT09ICdpbmxpbmVTdWdnZXN0aW9uLmFjY2VwdCcpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSB2aWV3IHpvbmUgKi9cblx0XHRcdGNvbnN0IGxpbmVzID0gdGhpcy5fbGluZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5lZGl0b3JPcHRpb25zQ2hhbmdlZC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmIChsaW5lcykge1xuXHRcdFx0XHR0aGlzLmhhc0JlZW5BY2NlcHRlZCA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUxpbmVzKGxpbmVzLmxpbmVOdW1iZXIsIGxpbmVzLmFkZGl0aW9uYWxMaW5lcywgbGluZXMubWluUmVzZXJ2ZWRMaW5lQ291bnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3ZpZXdab25lTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHR0aGlzLnJlbW92ZUFjdGl2ZVZpZXdab25lKGNoYW5nZUFjY2Vzc29yKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGluZXMobGluZU51bWJlcjogbnVtYmVyLCBhZGRpdGlvbmFsTGluZXM6IHJlYWRvbmx5IExpbmVEYXRhW10sIG1pblJlc2VydmVkTGluZUNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIXRleHRNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdGFiU2l6ZSB9ID0gdGV4dE1vZGVsLmdldE9wdGlvbnMoKTtcblxuXHRcdG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcikudHJhbnNhY3Rpb24oXyA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlVmlld1pvbmVzKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0XHR0aGlzLnJlbW92ZUFjdGl2ZVZpZXdab25lKGNoYW5nZUFjY2Vzc29yKTtcblxuXHRcdFx0XHRjb25zdCBoZWlnaHRJbkxpbmVzID0gTWF0aC5tYXgoYWRkaXRpb25hbExpbmVzLmxlbmd0aCwgbWluUmVzZXJ2ZWRMaW5lQ291bnQpO1xuXHRcdFx0XHRpZiAoaGVpZ2h0SW5MaW5lcyA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBkb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0cmVuZGVyTGluZXMoZG9tTm9kZSwgdGFiU2l6ZSwgYWRkaXRpb25hbExpbmVzLCB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9ucygpLCB0aGlzLl9pc0NsaWNrYWJsZSk7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5faXNDbGlja2FibGUpIHtcblx0XHRcdFx0XHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZG9tTm9kZSwgJ21vdXNlZG93bicsIChlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTsgLy8gVGhpcyBwcmV2ZW50cyB0aGF0IHRoZSBlZGl0b3IgbG9zZXMgZm9jdXNcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZG9tTm9kZSwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGlzVGFyZ2V0R2hvc3RUZXh0KGUudGFyZ2V0KSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZShuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhlKSwgZSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5hZGRWaWV3Wm9uZShjaGFuZ2VBY2Nlc3NvciwgbGluZU51bWJlciwgaGVpZ2h0SW5MaW5lcywgZG9tTm9kZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl92aWV3Wm9uZUxpc3RlbmVyLnZhbHVlID0gc3RvcmU7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVmlld1pvbmUoY2hhbmdlQWNjZXNzb3I6IElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yLCBhZnRlckxpbmVOdW1iZXI6IG51bWJlciwgaGVpZ2h0SW5MaW5lczogbnVtYmVyLCBkb21Ob2RlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGlkID0gY2hhbmdlQWNjZXNzb3IuYWRkWm9uZSh7XG5cdFx0XHRhZnRlckxpbmVOdW1iZXI6IGFmdGVyTGluZU51bWJlcixcblx0XHRcdGhlaWdodEluTGluZXM6IGhlaWdodEluTGluZXMsXG5cdFx0XHRkb21Ob2RlLFxuXHRcdFx0YWZ0ZXJDb2x1bW5BZmZpbml0eTogUG9zaXRpb25BZmZpbml0eS5SaWdodCxcblx0XHRcdG9uQ29tcHV0ZWRIZWlnaHQ6IChoZWlnaHQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHR0aGlzLl92aWV3Wm9uZUhlaWdodC5zZXQoaGVpZ2h0LCB1bmRlZmluZWQpOyAvLyBUT0RPOiBjYW4gYSB0cmFuc2FjdGlvbiBiZSB1c2VkIHRvIGF2b2lkIGZsaWNrZXJpbmc/XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmtlZXBDdXJzb3JTdGFibGUoYWZ0ZXJMaW5lTnVtYmVyLCBoZWlnaHRJbkxpbmVzKTtcblxuXHRcdHRoaXMuX3ZpZXdab25lSW5mbyA9IHsgdmlld1pvbmVJZDogaWQsIGhlaWdodEluTGluZXMsIGxpbmVOdW1iZXI6IGFmdGVyTGluZU51bWJlciB9O1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVBY3RpdmVWaWV3Wm9uZShjaGFuZ2VBY2Nlc3NvcjogSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdmlld1pvbmVJbmZvKSB7XG5cdFx0XHRjaGFuZ2VBY2Nlc3Nvci5yZW1vdmVab25lKHRoaXMuX3ZpZXdab25lSW5mby52aWV3Wm9uZUlkKTtcblxuXHRcdFx0aWYgKCF0aGlzLmhhc0JlZW5BY2NlcHRlZCkge1xuXHRcdFx0XHR0aGlzLmtlZXBDdXJzb3JTdGFibGUodGhpcy5fdmlld1pvbmVJbmZvLmxpbmVOdW1iZXIsIC10aGlzLl92aWV3Wm9uZUluZm8uaGVpZ2h0SW5MaW5lcyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3ZpZXdab25lSW5mbyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3ZpZXdab25lSGVpZ2h0LnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBrZWVwQ3Vyc29yU3RhYmxlKGxpbmVOdW1iZXI6IG51bWJlciwgaGVpZ2h0SW5MaW5lczogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zaG91bGRLZWVwQ3Vyc29yU3RhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3Vyc29yTGluZU51bWJlciA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKT8uZ2V0U3RhcnRQb3NpdGlvbigpPy5saW5lTnVtYmVyO1xuXHRcdGlmIChjdXJzb3JMaW5lTnVtYmVyICE9PSB1bmRlZmluZWQgJiYgbGluZU51bWJlciA8IGN1cnNvckxpbmVOdW1iZXIpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5zZXRTY3JvbGxUb3AodGhpcy5fZWRpdG9yLmdldFNjcm9sbFRvcCgpICsgaGVpZ2h0SW5MaW5lcyAqIHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNUYXJnZXRHaG9zdFRleHQodGFyZ2V0OiBFdmVudFRhcmdldCB8IG51bGwpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzSFRNTEVsZW1lbnQodGFyZ2V0KSAmJiB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKEdIT1NUX1RFWFRfQ0xBU1NfTkFNRSk7XG59XG5cbmV4cG9ydCBjbGFzcyBMaW5lRGF0YSBpbXBsZW1lbnRzIElFcXVhdGFibGU8TGluZURhdGE+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNvbnRlbnQ6IExpbmVUb2tlbnMsIC8vIE11c3Qgbm90IGNvbnRhaW4gYSBsaW5lYnJlYWshXG5cdFx0cHVibGljIHJlYWRvbmx5IGRlY29yYXRpb25zOiByZWFkb25seSBMaW5lRGVjb3JhdGlvbltdXG5cdCkgeyB9XG5cblx0ZXF1YWxzKG90aGVyOiBMaW5lRGF0YSk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5jb250ZW50LmVxdWFscyhvdGhlci5jb250ZW50KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gTGluZURlY29yYXRpb24uZXF1YWxzQXJyKHRoaXMuZGVjb3JhdGlvbnMsIG90aGVyLmRlY29yYXRpb25zKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW5kZXJMaW5lcyhkb21Ob2RlOiBIVE1MRWxlbWVudCwgdGFiU2l6ZTogbnVtYmVyLCBsaW5lczogcmVhZG9ubHkgTGluZURhdGFbXSwgb3B0czogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgaXNDbGlja2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0Y29uc3QgZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnMgPSBvcHRzLmdldChFZGl0b3JPcHRpb24uZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpO1xuXHRjb25zdCBzdG9wUmVuZGVyaW5nTGluZUFmdGVyID0gb3B0cy5nZXQoRWRpdG9yT3B0aW9uLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIpO1xuXHQvLyBUbyBhdm9pZCB2aXN1YWwgY29uZnVzaW9uLCB3ZSBkb24ndCB3YW50IHRvIHJlbmRlciB2aXNpYmxlIHdoaXRlc3BhY2Vcblx0Y29uc3QgcmVuZGVyV2hpdGVzcGFjZSA9ICdub25lJztcblx0Y29uc3QgcmVuZGVyQ29udHJvbENoYXJhY3RlcnMgPSBvcHRzLmdldChFZGl0b3JPcHRpb24ucmVuZGVyQ29udHJvbENoYXJhY3RlcnMpO1xuXHRjb25zdCBmb250TGlnYXR1cmVzID0gb3B0cy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRMaWdhdHVyZXMpO1xuXHRjb25zdCBmb250SW5mbyA9IG9wdHMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdGNvbnN0IGxpbmVIZWlnaHQgPSBvcHRzLmdldChFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cblx0bGV0IGNsYXNzTmFtZXMgPSAnc3VnZ2VzdC1wcmV2aWV3LXRleHQnO1xuXHRpZiAoaXNDbGlja2FibGUpIHtcblx0XHRjbGFzc05hbWVzICs9ICcgY2xpY2thYmxlJztcblx0fVxuXG5cdGNvbnN0IHNiID0gbmV3IFN0cmluZ0J1aWxkZXIoMTAwMDApO1xuXHRzYi5hcHBlbmRTdHJpbmcoYDxkaXYgY2xhc3M9XCIke2NsYXNzTmFtZXN9XCI+YCk7XG5cblx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0Y29uc3QgbGluZURhdGEgPSBsaW5lc1tpXTtcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gbGluZURhdGEuY29udGVudDtcblx0XHRzYi5hcHBlbmRTdHJpbmcoJzxkaXYgY2xhc3M9XCJ2aWV3LWxpbmUnKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoJ1wiIHN0eWxlPVwidG9wOicpO1xuXHRcdHNiLmFwcGVuZFN0cmluZyhTdHJpbmcoaSAqIGxpbmVIZWlnaHQpKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoJ3B4O3dpZHRoOjEwMDAwMDBweDtcIj4nKTtcblxuXHRcdGNvbnN0IGxpbmUgPSBsaW5lVG9rZW5zLmdldExpbmVDb250ZW50KCk7XG5cdFx0Y29uc3QgaXNCYXNpY0FTQ0lJID0gc3RyaW5ncy5pc0Jhc2ljQVNDSUkobGluZSk7XG5cdFx0Y29uc3QgY29udGFpbnNSVEwgPSBzdHJpbmdzLmNvbnRhaW5zUlRMKGxpbmUpO1xuXG5cdFx0cmVuZGVyVmlld0xpbmUobmV3IFJlbmRlckxpbmVJbnB1dChcblx0XHRcdChmb250SW5mby5pc01vbm9zcGFjZSAmJiAhZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpLFxuXHRcdFx0Zm9udEluZm8uY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93LFxuXHRcdFx0bGluZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0aXNCYXNpY0FTQ0lJLFxuXHRcdFx0Y29udGFpbnNSVEwsXG5cdFx0XHQwLFxuXHRcdFx0bGluZVRva2Vucyxcblx0XHRcdGxpbmVEYXRhLmRlY29yYXRpb25zLnNsaWNlKCksXG5cdFx0XHR0YWJTaXplLFxuXHRcdFx0MCxcblx0XHRcdGZvbnRJbmZvLnNwYWNlV2lkdGgsXG5cdFx0XHRmb250SW5mby5taWRkb3RXaWR0aCxcblx0XHRcdGZvbnRJbmZvLndzbWlkZG90V2lkdGgsXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZSxcblx0XHRcdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzLFxuXHRcdFx0Zm9udExpZ2F0dXJlcyAhPT0gRWRpdG9yRm9udExpZ2F0dXJlcy5PRkYsXG5cdFx0XHRudWxsLFxuXHRcdFx0bnVsbCxcblx0XHRcdDBcblx0XHQpLCBzYik7XG5cblx0XHRzYi5hcHBlbmRTdHJpbmcoJzwvZGl2PicpO1xuXHR9XG5cdHNiLmFwcGVuZFN0cmluZygnPC9kaXY+Jyk7XG5cblx0YXBwbHlGb250SW5mbyhkb21Ob2RlLCBmb250SW5mbyk7XG5cdGNvbnN0IGh0bWwgPSBzYi5idWlsZCgpO1xuXHRjb25zdCB0cnVzdGVkaHRtbCA9IHR0UG9saWN5ID8gdHRQb2xpY3kuY3JlYXRlSFRNTChodG1sKSA6IGh0bWw7XG5cdGRvbU5vZGUuaW5uZXJIVE1MID0gdHJ1c3RlZGh0bWwgYXMgc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgdHRQb2xpY3kgPSBjcmVhdGVUcnVzdGVkVHlwZXNQb2xpY3koJ2VkaXRvckdob3N0VGV4dCcsIHsgY3JlYXRlSFRNTDogdmFsdWUgPT4gdmFsdWUgfSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBc0IsU0FBUyxrQkFBa0IsaUJBQWlCLFNBQVMsYUFBYSwyQkFBMkIsdUJBQXVCO0FBQzFJLFlBQVksYUFBYTtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlDQUErRix1QkFBdUI7QUFDL0gsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUIsb0JBQTRDO0FBQzFFLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQTRDLHlCQUF5Qix3QkFBd0I7QUFDN0YsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsc0JBQXNCO0FBQ2hELFNBQW9CLDRCQUE0QztBQUNoRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QixXQUFXLGVBQWUsU0FBUztBQUNuRSxPQUFPO0FBQ1AsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsUUFBUSxXQUFXO0FBQzVCLFNBQVMsa0JBQThCLG1CQUFtQjtBQVFuRCxNQUFNLHVCQUF1QjtBQUFBLEVBUW5DLFlBQ2lCLE9BQWlCLFFBQVEsU0FDeEM7QUFEZTtBQUFBLEVBQ2I7QUFBQSxFQVRKLE9BQWMsS0FBSyxTQUFrRjtBQUNwRyxRQUFJLENBQUMsU0FBUztBQUNiLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxJQUFJLHVCQUF1QixRQUFRLElBQUk7QUFBQSxFQUMvQztBQUtEO0FBRUEsTUFBTSw0QkFBNEI7QUFDbEMsTUFBTSx3QkFBd0I7QUFFdkIsSUFBTSxnQkFBTixjQUE0QixXQUFXO0FBQUEsRUFxQjdDLFlBQ2tCLFNBQ0EsT0FDakIsU0FRbUMsa0JBQ2xDO0FBQ0QsVUFBTTtBQVpXO0FBQ0E7QUFTa0I7QUEvQnBDLFNBQWlCLGNBQWMsZ0JBQWdCLE1BQU0sS0FBSztBQUUxRCxTQUFpQixnQkFBZ0IsUUFBUSxZQUFVO0FBQ2xELFlBQU0sUUFBUSxLQUFLLE1BQU0sS0FBSyxNQUFNO0FBQ3BDLFlBQU0sVUFBVSxPQUFPO0FBQ3ZCLFVBQUksQ0FBQyxTQUFTLENBQUMsU0FBUztBQUFFLGVBQU87QUFBQSxNQUFXO0FBQzVDLFlBQU0sS0FBSyxNQUFNO0FBQ2pCLGFBQU8sRUFBRSxZQUFZLEdBQUcsWUFBWSxVQUFVLElBQUksU0FBUyxHQUFHLFlBQVksR0FBRyxNQUFNLENBQUMsRUFBRSxNQUFNLEdBQUcsTUFBTSxRQUFRLEtBQUs7QUFBQSxJQUNuSCxDQUFDO0FBRUQsU0FBaUIsY0FBYyxLQUFLLFVBQVUsSUFBSSxRQUFxQixDQUFDO0FBQ3hFLFNBQWdCLGFBQWEsS0FBSyxZQUFZO0FBdUk5QyxTQUFpQixzQkFBc0IsUUFBUSxNQUFNLFlBQVU7QUFDOUQsWUFBTSxPQUFPLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbkMsVUFBSSxDQUFDLE1BQU07QUFBRSxlQUFPO0FBQUEsTUFBVztBQUMvQixZQUFNLFlBQVksS0FBSztBQUN2QixZQUFNLFVBQVUsVUFBVSxNQUFNLElBQUksT0FBSyxFQUFFLE1BQU0sSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFO0FBQ25GLGFBQU8sUUFBUSxRQUFRLE9BQU8sRUFBRSxFQUFFO0FBQUEsSUFDbkMsQ0FBQztBQUVELFNBQWlCLG1CQUFtQixRQUFRLE1BQU0sWUFBVTtBQUMzRCxZQUFNLGVBQWUsS0FBSyxjQUFjLE1BQU07QUFDOUMsVUFBSSw2QkFBNkIsS0FBSyxjQUFjLEtBQUssTUFBTSxHQUFHO0FBQ2pFLHFCQUFhLEtBQUssU0FBUztBQUFBLE1BQzVCO0FBQ0EsWUFBTSxxQkFBcUIsS0FBSyxvQkFBb0IsS0FBSyxNQUFNO0FBQy9ELFVBQUksS0FBSyx1QkFBdUIsc0JBQXNCLHFCQUFxQixHQUFHO0FBQzdFLHFCQUFhLEtBQUssWUFBWTtBQUFBLE1BQy9CLFdBQVcsS0FBSyx1QkFBdUIsS0FBSyxNQUFNLEdBQUc7QUFDcEQscUJBQWEsS0FBSyxvQkFBb0I7QUFBQSxNQUN2QztBQUNBLFlBQU0sa0JBQWtCLGFBQWEsSUFBSSxPQUFLLElBQUksQ0FBQyxFQUFFLEVBQUUsS0FBSyxFQUFFO0FBQzlELGFBQU87QUFBQSxJQUNSLENBQUM7QUFFRCxTQUFpQixTQUFTLFFBQVEsTUFBTSxZQUFVO0FBQ2pELFVBQUksS0FBSyxZQUFZLEtBQUssTUFBTSxHQUFHO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFdkQsWUFBTSxRQUFRLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDcEMsVUFBSSxDQUFDLE9BQU87QUFBRSxlQUFPO0FBQUEsTUFBVztBQUVoQyxZQUFNLFlBQVksS0FBSyxXQUFXLE1BQU0sS0FBSyxNQUFNO0FBQ25ELFVBQUksQ0FBQyxXQUFXO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFcEMsWUFBTSxZQUFZLE1BQU07QUFDeEIsWUFBTSxnQkFBZ0IscUJBQXFCLHVCQUF1QixVQUFVLGNBQWM7QUFFMUYsWUFBTSw0QkFBNEIsS0FBSyx1QkFBdUIsS0FBSyxNQUFNO0FBQ3pFLFlBQU0sa0JBQWtCLEtBQUssaUJBQWlCLEtBQUssTUFBTTtBQUN6RCxZQUFNLEVBQUUsYUFBYSxpQkFBaUIsYUFBYSw4QkFBOEIsSUFBSSx5QkFBeUIsV0FBVyxXQUFXLHdCQUF3QixlQUFlO0FBRTNLLFlBQU0sY0FBYyxVQUFVLGVBQWUsVUFBVSxVQUFVO0FBQ2pFLFlBQU0sT0FBTyxJQUFJLFdBQVcsWUFBWSxJQUFJLE9BQUssa0JBQWtCLE9BQU8sRUFBRSxTQUFTLEdBQUcsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUNoRyxZQUFNLFNBQVMsNEJBQTRCLFVBQVUsYUFBYSxnQkFBZ0IsVUFBVSxZQUFZLENBQUMsS0FBSyxNQUFNLFdBQVcsR0FBRyxHQUFHLGdCQUFnQixJQUFJLE9BQUssRUFBRSxPQUFPLENBQUMsQ0FBQyxJQUFJO0FBQzdLLFlBQU0sWUFBWSxLQUFLLGFBQWE7QUFDcEMsWUFBTSx3QkFBd0IsWUFBWSxJQUFJLENBQUMsR0FBRyxTQUFTLEVBQUUsR0FBRyxHQUFHLFFBQVEsU0FBUyxDQUFDLEdBQUcsaUJBQWlCLFVBQVUsR0FBRyxDQUFDLEVBQUUsRUFBRTtBQUUzSCxZQUFNLDJCQUF1QyxnQkFBZ0IsSUFBSSxDQUFDLEdBQUcsUUFBUTtBQUM1RSxZQUFJLFVBQVUsU0FBUyxNQUFNLENBQUMsS0FBSyxXQUFXLFlBQVksRUFBRSxTQUFTLEtBQUssaUJBQWlCLGVBQWU7QUFDMUcsWUFBSSxRQUFRLGdCQUFnQixTQUFTLEtBQUssK0JBQStCO0FBQ3hFLGdCQUFNLElBQUksbUJBQW1CLGVBQWUsVUFBVSxhQUFhLGNBQWMsOEJBQThCLFVBQVUsQ0FBQztBQUMxSCxnQkFBTSxrQkFBa0IsRUFBRSxNQUFNLDhCQUE4QixZQUFZLHVCQUF1QixDQUFDO0FBQ2xHLG9CQUFVLG1CQUFtQixlQUFlLE9BQU8sRUFBRSxPQUFPLGVBQWUsRUFBRSxhQUFhLFFBQVEsZUFBZTtBQUFBLFFBQ2xIO0FBQ0EsZUFBTyxJQUFJO0FBQUEsVUFDVjtBQUFBLFVBQ0EsRUFBRTtBQUFBLFFBQ0g7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLGVBQWUsS0FBSyxRQUFRLGFBQWEsR0FBRyxpQkFBaUIsRUFBRTtBQUNyRSxZQUFNLHNCQUFzQixzQkFBc0IsT0FBTyxZQUFVLE9BQU8sU0FBUyxFQUFFO0FBQ3JGLFlBQU0sNEJBQTRCLG9CQUFvQixXQUFXO0FBQ2pFLFlBQU0sb0JBQW9CLElBQUk7QUFBQSxTQUM1Qiw0QkFBNEIsb0JBQW9CLENBQUMsRUFBRSxTQUFTLEtBQUs7QUFBQSxRQUNsRSw0QkFBNEIsSUFBSyxnQkFBZ0IsVUFBVSxVQUFRLEtBQUssWUFBWSxFQUFFLElBQUk7QUFBQSxRQUMxRiw0QkFBNEIsSUFBSTtBQUFBLFFBQ2hDLGdCQUFnQixVQUFVLDRCQUE0QixJQUFJO0FBQUEsUUFDMUQ7QUFBQSxRQUNBLElBQUksb0JBQW9CLElBQUksWUFBVSxPQUFPLEtBQUssTUFBTSxDQUFDLElBQUksSUFBSSx5QkFBeUIsSUFBSSxVQUFRLEtBQUssUUFBUSxjQUFjLENBQUMsQ0FBQztBQUFBLFFBQ25JLG9CQUFvQixVQUFVLGdCQUFnQixTQUFTLElBQUksSUFBSTtBQUFBLFFBQy9ELG9CQUFvQixTQUFTLEtBQUsseUJBQXlCLFdBQVcsSUFBSSxvQkFBb0IsTUFBTSxZQUFVLE9BQU8sU0FBUyxvQkFBb0IsQ0FBQyxFQUFFLElBQUksSUFBSTtBQUFBLE1BQzlKO0FBRUEsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLGFBQWE7QUFBQSxRQUNiLGlCQUFpQjtBQUFBLFFBQ2pCO0FBQUEsUUFDQSxZQUFZLFVBQVU7QUFBQSxRQUN0Qiw2QkFBNkIsS0FBSyxzQkFBc0IsS0FBSyxNQUFNO0FBQUEsUUFDbkUsaUJBQWlCO0FBQUEsUUFDakI7QUFBQSxRQUNBO0FBQUEsUUFDQSw2QkFBNkIsTUFBTTtBQUFBLE1BQ3BDO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBaUIsZUFBZSxRQUFRLE1BQU0sWUFBVTtBQUN2RCxZQUFNLFVBQVUsS0FBSyxPQUFPLEtBQUssTUFBTTtBQUN2QyxVQUFJLENBQUMsU0FBUztBQUFFLGVBQU8sQ0FBQztBQUFBLE1BQUc7QUFFM0IsWUFBTSxjQUF1QyxDQUFDO0FBRTlDLFlBQU0sa0JBQWtCLEtBQUssaUJBQWlCLEtBQUssTUFBTTtBQUV6RCxVQUFJLFFBQVEsZUFBZTtBQUMxQixvQkFBWSxLQUFLO0FBQUEsVUFDaEIsT0FBTyxRQUFRLGNBQWMsUUFBUSxRQUFRLFVBQVU7QUFBQSxVQUN2RCxTQUFTLEVBQUUsaUJBQWlCLHNDQUFzQyxpQkFBaUIsYUFBYSx1QkFBdUI7QUFBQSxRQUN4SCxDQUFDO0FBQUEsTUFDRjtBQUVBLFVBQUksUUFBUSxhQUFhO0FBQ3hCLG9CQUFZLEtBQUs7QUFBQSxVQUNoQixPQUFPLFFBQVEsWUFBWSxRQUFRLFFBQVEsVUFBVTtBQUFBLFVBQ3JELFNBQVMsRUFBRSxpQkFBaUIscUJBQXFCLGFBQWEsb0JBQXFCO0FBQUEsUUFDcEYsQ0FBQztBQUFBLE1BQ0Y7QUFFQSxpQkFBVyxLQUFLLFFBQVEsYUFBYTtBQUNwQyxZQUFJLHdCQUF3QjtBQUM1QixZQUFJLEtBQUssdUJBQXVCLEVBQUUsS0FBSyxTQUFTLEdBQUc7QUFDbEQsbUNBQXlCO0FBQUEsUUFDMUI7QUFDQSxvQkFBWSxLQUFLO0FBQUEsVUFDaEIsT0FBTyxNQUFNLGNBQWMsSUFBSSxTQUFTLFFBQVEsWUFBWSxFQUFFLE1BQU0sQ0FBQztBQUFBLFVBQ3JFLFNBQVM7QUFBQSxZQUNSLGFBQWE7QUFBQSxZQUNiLE9BQU87QUFBQSxjQUNOLFNBQVMsRUFBRTtBQUFBLGNBQ1gsUUFBUSxFQUFFO0FBQUEsY0FDVixrQkFBa0IsRUFBRSxVQUFVLGtDQUFrQyw0QkFDNUQsS0FBSyxlQUFlLGVBQWUsTUFDcEMsa0JBQ0Esd0JBQ0EsRUFBRSxnQkFBZ0IsSUFBSSxPQUFLLE1BQU0sRUFBRSxTQUFTLEVBQUUsS0FBSyxHQUFHO0FBQUE7QUFBQSxjQUN6RCxhQUFhLHdCQUF3QjtBQUFBLGNBQ3JDLGNBQWMsSUFBSSxzQkFBc0IsSUFBSTtBQUFBLFlBQzdDO0FBQUEsWUFDQSxpQkFBaUI7QUFBQSxVQUNsQjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFFQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBTUQsU0FBZ0IsWUFBWSxRQUFRLE1BQU0sWUFBVTtBQUNuRCxVQUFJLEtBQUssWUFBWSxLQUFLLE1BQU0sR0FBRztBQUFFLGVBQU87QUFBQSxNQUFPO0FBQ25ELGFBQU8sS0FBSyxxQkFBcUIsS0FBSyxNQUFNLEtBQUssS0FBSyx1QkFBdUIsVUFBVSxLQUFLLE1BQU07QUFBQSxJQUNuRyxDQUFDO0FBRUQsU0FBZ0IsU0FBUyxRQUFRLE1BQU0sWUFBVTtBQUNoRCxZQUFNLGFBQWEsS0FBSyxXQUFXLFVBQVUsYUFBYSxVQUFVLEVBQUUsS0FBSyxNQUFNO0FBQ2pGLGFBQU8sY0FBYyxLQUFLLHVCQUF1QixlQUFlLEtBQUssTUFBTSxLQUFLO0FBQUEsSUFDakYsQ0FBQztBQW5RQSxTQUFLLGdCQUFnQixRQUFRLGdCQUFnQixDQUFDO0FBQzlDLFNBQUssZUFBZSxRQUFRLGVBQWU7QUFDM0MsU0FBSywwQkFBMEIsUUFBUSwwQkFBMEI7QUFDakUsU0FBSyx3QkFBd0IsUUFBUSx3QkFBd0IsZ0JBQWdCLENBQUM7QUFDOUUsU0FBSyx5QkFBeUIsUUFBUSx5QkFBeUIsZ0JBQWdCLElBQUk7QUFDbkYsU0FBSyxzQkFBc0IsUUFBUSw2QkFBNkI7QUFFaEUsU0FBSyxhQUFhLHFCQUFxQixLQUFLLE9BQU87QUFDbkQsU0FBSyx5QkFBeUIsS0FBSztBQUFBLE1BQ2xDLElBQUk7QUFBQSxRQUNILEtBQUs7QUFBQSxRQUNMLFlBQVksRUFBRSxPQUFPLE1BQU0sVUFBVSxpQkFBaUIsWUFBWSxDQUFDLEVBQUUsR0FBRyxZQUFVO0FBRWpGLGdCQUFNLFVBQVUsS0FBSyxPQUFPLEtBQUssTUFBTTtBQUN2QyxpQkFBTyxVQUFVLElBQUk7QUFBQSxZQUNwQixRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsWUFDUixRQUFRO0FBQUEsVUFDVCxJQUFJO0FBQUEsUUFDTCxDQUFDO0FBQUEsUUFDRCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDTjtBQUFBLElBQ0Q7QUFDQSxTQUFLLHVCQUF1QixLQUFLLFdBQVc7QUFBQSxNQUMzQyxPQUFLLEVBQUUsT0FBTyxTQUFTLGdCQUFnQixnQkFDdEMsRUFBRSxPQUFPLE9BQU8sY0FBYyxRQUFRLHdCQUF3Qix5QkFDOUQsRUFBRSxPQUFPLE9BQU8sYUFBYSxRQUFRLGFBQWEsVUFBVTtBQUFBLE1BQzdELEtBQUs7QUFBQSxJQUNOO0FBRUEsU0FBSyxVQUFVLGFBQWEsTUFBTTtBQUFFLFdBQUssWUFBWSxJQUFJLE1BQU0sTUFBUztBQUFBLElBQUcsQ0FBQyxDQUFDO0FBQzdFLFNBQUssVUFBVSxLQUFLLFdBQVcsZUFBZSxLQUFLLFlBQVksQ0FBQztBQUVoRSxRQUFJLEtBQUssY0FBYztBQUN0QixXQUFLLFVBQVUsS0FBSyx1QkFBdUIsV0FBVyxDQUFDLE1BQU0sS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFDdEYsV0FBSyxVQUFVLEtBQUssUUFBUSxVQUFVLE9BQUs7QUFDMUMsWUFBSSxFQUFFLE9BQU8sU0FBUyxnQkFBZ0IsY0FBYztBQUNuRDtBQUFBLFFBQ0Q7QUFDQSxjQUFNLElBQUksRUFBRSxPQUFPLE9BQU8sY0FBYyxRQUFRO0FBQ2hELFlBQUksYUFBYSx5QkFBeUIsRUFBRSxVQUFVLE1BQU07QUFDM0QsZUFBSyxZQUFZLEtBQUssRUFBRSxLQUFLO0FBQUEsUUFDOUI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLGFBQU8sNEJBQTRCLE1BQU0saUJBQWlCO0FBQUEsSUFDM0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLGlCQUFpQixDQUFDLFFBQVEsVUFBVTtBQUNsRCxVQUFJLDJCQUEyQjtBQUM5QjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFFBQVEsS0FBSyxjQUFjLEtBQUssTUFBTTtBQUM1QyxVQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsTUFDRDtBQUVBLFlBQU0sYUFBYSxLQUFLLFdBQVcsVUFBVSxhQUFhLFVBQVU7QUFDcEUsWUFBTSxJQUFJLEtBQUssV0FBVyxvQkFBb0I7QUFBQSxRQUM3QyxVQUFVLGdCQUF3QztBQUFBLFVBQ2pELFVBQVUsSUFBSSxTQUFTLE1BQU0sWUFBWSxPQUFPLGdCQUFnQjtBQUFBLFVBQ2hFLFlBQVksQ0FBQyxnQ0FBZ0MsS0FBSztBQUFBLFVBQ2xELGtCQUFrQixpQkFBaUI7QUFBQSxRQUNwQyxDQUFDO0FBQUEsUUFDRCxxQkFBcUI7QUFBQSxRQUNyQixTQUFTLEVBQUUsSUFBSTtBQUFBLFVBQ2QsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFlBQ04sT0FBTztBQUFBLFlBQ1AsUUFBUTtBQUFBLFlBQ1IsWUFBWTtBQUFBLFlBQ1osT0FBTztBQUFBLFVBQ1I7QUFBQSxVQUNBLEtBQUssQ0FBQyxRQUFRO0FBRWIsWUFBQyxJQUFnQyxpQ0FBaUMsRUFBRSxPQUFPLE1BQU0sY0FBYyxNQUFNLFFBQVEsRUFBRTtBQUFBLFVBQ2hIO0FBQUEsUUFDRCxHQUFHO0FBQUEsVUFDRixFQUFFO0FBQUEsWUFBSTtBQUFBLGNBQ0wsT0FBTztBQUFBLGNBQ1AsT0FBTztBQUFBLGdCQUNOLE9BQU87QUFBQSxnQkFDUCxRQUFRO0FBQUEsZ0JBQ1IsU0FBUztBQUFBLGdCQUNULGNBQWM7QUFBQSxnQkFDZCxZQUFZO0FBQUEsY0FDYjtBQUFBLFlBQ0Q7QUFBQSxZQUNDLENBQUMsV0FBVyxNQUFNLElBQUksQ0FBQztBQUFBLFVBQ3hCO0FBQUEsUUFDRCxDQUFDLEVBQUUsWUFBWSxLQUFLLEVBQUU7QUFBQSxNQUN2QixDQUFDLENBQUM7QUFBQSxJQUNILENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE9BQWMsd0JBQXdCLFNBQW9EO0FBRXpGLFVBQU0sT0FBUSxRQUFvQztBQUNsRCxRQUFJLE1BQU07QUFDVCxhQUFPO0FBQUEsSUFDUixXQUFXLFFBQVEsZUFBZTtBQUNqQyxhQUFPLEtBQUssd0JBQXdCLFFBQVEsYUFBYTtBQUFBLElBQzFEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQXdKTyxhQUFhLFlBQTZCO0FBQ2hELFdBQU8sS0FBSyx1QkFBdUIsZUFBZTtBQUFBLEVBQ25EO0FBQ0Q7QUE1U2EsZ0JBQU47QUFBQSxFQWdDSjtBQUFBLEdBaENVO0FBOFNiLE1BQU0sc0JBQXNCO0FBQUEsRUFDM0IsWUFBNEIsT0FBc0I7QUFBdEI7QUFBQSxFQUF3QjtBQUNyRDtBQVFBLFNBQVMseUJBQXlCLFdBQTZDLFdBQXVCLG9CQUE0QjtBQUNqSSxRQUFNLGNBQXVHLENBQUM7QUFDOUcsUUFBTSxrQkFBd0UsQ0FBQztBQUUvRSxXQUFTLHFCQUFxQixTQUFvQyxXQUErQjtBQUNoRyxRQUFJLGdCQUFnQixTQUFTLEdBQUc7QUFDL0IsWUFBTSxXQUFXLGdCQUFnQixnQkFBZ0IsU0FBUyxDQUFDO0FBQzNELFVBQUksV0FBVztBQUNkLGlCQUFTLFlBQVksS0FBSyxJQUFJO0FBQUEsVUFDN0IsU0FBUyxRQUFRLFNBQVM7QUFBQSxVQUMxQixTQUFTLFFBQVEsU0FBUyxJQUFJLFFBQVEsQ0FBQyxFQUFFLEtBQUs7QUFBQSxVQUM5QztBQUFBLFVBQ0EscUJBQXFCO0FBQUEsUUFDdEIsQ0FBQztBQUFBLE1BQ0Y7QUFDQSxlQUFTLFdBQVcsUUFBUSxDQUFDLEVBQUU7QUFFL0IsZ0JBQVUsUUFBUSxNQUFNLENBQUM7QUFBQSxJQUMxQjtBQUNBLGVBQVcsVUFBVSxTQUFTO0FBQzdCLHNCQUFnQixLQUFLO0FBQUEsUUFDcEIsU0FBUyxPQUFPO0FBQUEsUUFDaEIsYUFBYSxZQUFZLENBQUMsSUFBSTtBQUFBLFVBQzdCO0FBQUEsVUFDQSxPQUFPLEtBQUssU0FBUztBQUFBLFVBQ3JCO0FBQUEsVUFDQSxxQkFBcUI7QUFBQSxRQUN0QixHQUFHLEdBQUcsT0FBTyxlQUFlLElBQUksQ0FBQyxHQUFHLE9BQU8sZUFBZTtBQUFBLE1BQzNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUVBLFFBQU0saUJBQWlCLFVBQVUsZUFBZSxVQUFVLFVBQVU7QUFFcEUsTUFBSSx3QkFBNEM7QUFDaEQsTUFBSSxVQUFVO0FBQ2QsYUFBVyxRQUFRLFVBQVUsT0FBTztBQUNuQyxRQUFJLFVBQVUsS0FBSztBQUNuQixRQUFJLDBCQUEwQixRQUFXO0FBQ3hDLGtCQUFZLEtBQUssRUFBRSxRQUFRLEtBQUssUUFBUSxNQUFNLFFBQVEsQ0FBQyxFQUFFLE1BQU0sU0FBUyxLQUFLLFNBQVMsaUJBQWlCLFFBQVEsQ0FBQyxFQUFFLGdCQUFnQixDQUFDO0FBQ25JLGdCQUFVLFFBQVEsTUFBTSxDQUFDO0FBQUEsSUFDMUIsT0FBTztBQUNOLDJCQUFxQixDQUFDLEVBQUUsTUFBTSxlQUFlLFVBQVUsU0FBUyxLQUFLLFNBQVMsQ0FBQyxHQUFHLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxHQUFHLE1BQVM7QUFBQSxJQUNwSDtBQUVBLFFBQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsMkJBQXFCLFNBQVMsa0JBQWtCO0FBQ2hELFVBQUksMEJBQTBCLFVBQWEsS0FBSyxVQUFVLGVBQWUsUUFBUTtBQUNoRixnQ0FBd0IsS0FBSztBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUVBLGNBQVUsS0FBSyxTQUFTO0FBQUEsRUFDekI7QUFDQSxNQUFJLGdDQUE2RDtBQUNqRSxNQUFJLDBCQUEwQixRQUFXO0FBQ3hDLG9DQUFnQyxJQUFJLGdCQUFnQixVQUFVLFlBQVksSUFBSSxZQUFZLFVBQVUsR0FBRyxlQUFlLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDbEk7QUFFQSxRQUFNLGNBQWMsMEJBQTBCLFNBQVksSUFBSSxZQUFZLHVCQUF1QixlQUFlLFNBQVMsQ0FBQyxJQUFJO0FBRTlILFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxvQkFBK0Q7QUFBQSxFQUNwRSxZQUNpQixZQUNBLGlCQUNBLHNCQUNmO0FBSGU7QUFDQTtBQUNBO0FBQUEsRUFDYjtBQUFBLEVBRUosT0FBTyxPQUFxQztBQUMzQyxRQUFJLEtBQUssZUFBZSxNQUFNLFlBQVk7QUFDekMsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUsseUJBQXlCLE1BQU0sc0JBQXNCO0FBQzdELGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxPQUFPLEtBQUssaUJBQWlCLE1BQU0saUJBQWlCLFlBQVksQ0FBQztBQUFBLEVBQ3pFO0FBQ0Q7QUFFTyxNQUFNLDhCQUE4QixXQUFXO0FBQUEsRUFrQnJELFlBQ2tCLFNBQ0EsUUFDQSx5QkFDQSxjQUNoQjtBQUNELFVBQU07QUFMVztBQUNBO0FBQ0E7QUFDQTtBQUdqQixTQUFLLGtCQUFrQixnQkFBb0Msa0JBQWtCLE1BQVM7QUFDdEYsU0FBSyx1QkFBdUIsMEJBQTBCLHVCQUF1QixNQUFNO0FBQUEsTUFDbEYsS0FBSyxRQUFRO0FBQUEsTUFDYixPQUFLLEVBQUUsV0FBVyxhQUFhLDZCQUE2QixLQUN4RCxFQUFFLFdBQVcsYUFBYSxzQkFBc0IsS0FDaEQsRUFBRSxXQUFXLGFBQWEsZ0JBQWdCLEtBQzFDLEVBQUUsV0FBVyxhQUFhLHVCQUF1QixLQUNqRCxFQUFFLFdBQVcsYUFBYSxhQUFhLEtBQ3ZDLEVBQUUsV0FBVyxhQUFhLFFBQVEsS0FDbEMsRUFBRSxXQUFXLGFBQWEsVUFBVTtBQUFBLElBQ3pDLENBQUM7QUFDRCxTQUFLLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBcUIsQ0FBQztBQUM1RCxTQUFLLGFBQWEsS0FBSyxZQUFZO0FBQ25DLFNBQUssb0JBQW9CLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBQy9ELFNBQUssWUFBWSxxQkFBcUIsS0FBSyxPQUFPLEVBQUU7QUFBQSxNQUNuRCxPQUFLLGtCQUFrQixFQUFFLE9BQU8sT0FBTztBQUFBLE1BQ3ZDLEtBQUs7QUFBQSxJQUNOO0FBQ0EsU0FBSyxrQkFBa0I7QUFFdkIsUUFBSSxLQUFLLG1CQUFtQixvQkFBb0IsS0FBSyx5QkFBeUI7QUFDN0UsV0FBSyxVQUFVLEtBQUssUUFBUSxvQkFBb0IsT0FBSyxLQUFLLGtCQUFrQixFQUFFLFdBQVcseUJBQXlCLENBQUM7QUFBQSxJQUNwSDtBQUVBLFNBQUssVUFBVSxRQUFRLFlBQVU7QUFFaEMsWUFBTSxRQUFRLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDckMsV0FBSyxxQkFBcUIsS0FBSyxNQUFNO0FBRXJDLFVBQUksT0FBTztBQUNWLGFBQUssa0JBQWtCO0FBQ3ZCLGFBQUssWUFBWSxNQUFNLFlBQVksTUFBTSxpQkFBaUIsTUFBTSxvQkFBb0I7QUFBQSxNQUNyRixPQUFPO0FBQ04sYUFBSyxNQUFNO0FBQUEsTUFDWjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBM0RBLElBQVcsYUFBaUM7QUFBRSxXQUFPLEtBQUssZUFBZTtBQUFBLEVBQVk7QUFBQSxFQUdyRixJQUFXLGlCQUFrRDtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQWlCO0FBQUEsRUEwRDVFLFVBQWdCO0FBQy9CLFVBQU0sUUFBUTtBQUNkLFNBQUssTUFBTTtBQUFBLEVBQ1o7QUFBQSxFQUVRLFFBQWM7QUFDckIsU0FBSyxrQkFBa0IsTUFBTTtBQUU3QixTQUFLLFFBQVEsZ0JBQWdCLENBQUMsbUJBQW1CO0FBQ2hELFdBQUsscUJBQXFCLGNBQWM7QUFBQSxJQUN6QyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsWUFBWSxZQUFvQixpQkFBc0Msc0JBQW9DO0FBQ2pILFVBQU0sWUFBWSxLQUFLLFFBQVEsU0FBUztBQUN4QyxRQUFJLENBQUMsV0FBVztBQUNmO0FBQUEsSUFDRDtBQUVBLFVBQU0sRUFBRSxRQUFRLElBQUksVUFBVSxXQUFXO0FBRXpDLHlCQUFxQixLQUFLLE9BQU8sRUFBRSxZQUFZLE9BQUs7QUFDbkQsV0FBSyxRQUFRLGdCQUFnQixDQUFDLG1CQUFtQjtBQUNoRCxjQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFFbEMsYUFBSyxxQkFBcUIsY0FBYztBQUV4QyxjQUFNLGdCQUFnQixLQUFLLElBQUksZ0JBQWdCLFFBQVEsb0JBQW9CO0FBQzNFLFlBQUksZ0JBQWdCLEdBQUc7QUFDdEIsZ0JBQU0sVUFBVSxTQUFTLGNBQWMsS0FBSztBQUM1QyxzQkFBWSxTQUFTLFNBQVMsaUJBQWlCLEtBQUssUUFBUSxXQUFXLEdBQUcsS0FBSyxZQUFZO0FBRTNGLGNBQUksS0FBSyxjQUFjO0FBQ3RCLGtCQUFNLElBQUksc0JBQXNCLFNBQVMsYUFBYSxDQUFDLE1BQU07QUFDNUQsZ0JBQUUsZUFBZTtBQUFBLFlBQ2xCLENBQUMsQ0FBQztBQUNGLGtCQUFNLElBQUksc0JBQXNCLFNBQVMsU0FBUyxDQUFDLE1BQU07QUFDeEQsa0JBQUksa0JBQWtCLEVBQUUsTUFBTSxHQUFHO0FBQ2hDLHFCQUFLLFlBQVksS0FBSyxJQUFJLG1CQUFtQixVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxjQUM5RDtBQUFBLFlBQ0QsQ0FBQyxDQUFDO0FBQUEsVUFDSDtBQUVBLGVBQUssWUFBWSxnQkFBZ0IsWUFBWSxlQUFlLE9BQU87QUFBQSxRQUNwRTtBQUVBLGFBQUssa0JBQWtCLFFBQVE7QUFBQSxNQUNoQyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsWUFBWSxnQkFBeUMsaUJBQXlCLGVBQXVCLFNBQTRCO0FBQ3hJLFVBQU0sS0FBSyxlQUFlLFFBQVE7QUFBQSxNQUNqQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxxQkFBcUIsaUJBQWlCO0FBQUEsTUFDdEMsa0JBQWtCLENBQUMsV0FBbUI7QUFDckMsYUFBSyxnQkFBZ0IsSUFBSSxRQUFRLE1BQVM7QUFBQSxNQUMzQztBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaUJBQWlCLGlCQUFpQixhQUFhO0FBRXBELFNBQUssZ0JBQWdCLEVBQUUsWUFBWSxJQUFJLGVBQWUsWUFBWSxnQkFBZ0I7QUFBQSxFQUNuRjtBQUFBLEVBRVEscUJBQXFCLGdCQUErQztBQUMzRSxRQUFJLEtBQUssZUFBZTtBQUN2QixxQkFBZSxXQUFXLEtBQUssY0FBYyxVQUFVO0FBRXZELFVBQUksQ0FBQyxLQUFLLGlCQUFpQjtBQUMxQixhQUFLLGlCQUFpQixLQUFLLGNBQWMsWUFBWSxDQUFDLEtBQUssY0FBYyxhQUFhO0FBQUEsTUFDdkY7QUFFQSxXQUFLLGdCQUFnQjtBQUNyQixXQUFLLGdCQUFnQixJQUFJLFFBQVcsTUFBUztBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLFlBQW9CLGVBQTZCO0FBQ3pFLFFBQUksQ0FBQyxLQUFLLHlCQUF5QjtBQUNsQztBQUFBLElBQ0Q7QUFFQSxVQUFNLG1CQUFtQixLQUFLLFFBQVEsYUFBYSxHQUFHLGlCQUFpQixHQUFHO0FBQzFFLFFBQUkscUJBQXFCLFVBQWEsYUFBYSxrQkFBa0I7QUFDcEUsV0FBSyxRQUFRLGFBQWEsS0FBSyxRQUFRLGFBQWEsSUFBSSxnQkFBZ0IsS0FBSyxRQUFRLFVBQVUsYUFBYSxVQUFVLENBQUM7QUFBQSxJQUN4SDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsa0JBQWtCLFFBQXFDO0FBQy9ELFNBQU8sY0FBYyxNQUFNLEtBQUssT0FBTyxVQUFVLFNBQVMscUJBQXFCO0FBQ2hGO0FBRU8sTUFBTSxTQUF5QztBQUFBLEVBQ3JELFlBQ2lCLFNBQ0EsYUFDZjtBQUZlO0FBQ0E7QUFBQSxFQUNiO0FBQUEsRUFFSixPQUFPLE9BQTBCO0FBQ2hDLFFBQUksQ0FBQyxLQUFLLFFBQVEsT0FBTyxNQUFNLE9BQU8sR0FBRztBQUN4QyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sZUFBZSxVQUFVLEtBQUssYUFBYSxNQUFNLFdBQVc7QUFBQSxFQUNwRTtBQUNEO0FBRUEsU0FBUyxZQUFZLFNBQXNCLFNBQWlCLE9BQTRCLE1BQThCLGFBQTRCO0FBQ2pKLFFBQU0sZ0NBQWdDLEtBQUssSUFBSSxhQUFhLDZCQUE2QjtBQUN6RixRQUFNLHlCQUF5QixLQUFLLElBQUksYUFBYSxzQkFBc0I7QUFFM0UsUUFBTSxtQkFBbUI7QUFDekIsUUFBTSwwQkFBMEIsS0FBSyxJQUFJLGFBQWEsdUJBQXVCO0FBQzdFLFFBQU0sZ0JBQWdCLEtBQUssSUFBSSxhQUFhLGFBQWE7QUFDekQsUUFBTSxXQUFXLEtBQUssSUFBSSxhQUFhLFFBQVE7QUFDL0MsUUFBTSxhQUFhLEtBQUssSUFBSSxhQUFhLFVBQVU7QUFFbkQsTUFBSSxhQUFhO0FBQ2pCLE1BQUksYUFBYTtBQUNoQixrQkFBYztBQUFBLEVBQ2Y7QUFFQSxRQUFNLEtBQUssSUFBSSxjQUFjLEdBQUs7QUFDbEMsS0FBRyxhQUFhLGVBQWUsVUFBVSxJQUFJO0FBRTdDLFdBQVMsSUFBSSxHQUFHLE1BQU0sTUFBTSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQ2pELFVBQU0sV0FBVyxNQUFNLENBQUM7QUFDeEIsVUFBTSxhQUFhLFNBQVM7QUFDNUIsT0FBRyxhQUFhLHVCQUF1QjtBQUN2QyxPQUFHLGFBQWEsZUFBZTtBQUMvQixPQUFHLGFBQWEsT0FBTyxJQUFJLFVBQVUsQ0FBQztBQUN0QyxPQUFHLGFBQWEsdUJBQXVCO0FBRXZDLFVBQU0sT0FBTyxXQUFXLGVBQWU7QUFDdkMsVUFBTSxlQUFlLFFBQVEsYUFBYSxJQUFJO0FBQzlDLFVBQU0sY0FBYyxRQUFRLFlBQVksSUFBSTtBQUU1QyxtQkFBZSxJQUFJO0FBQUEsTUFDakIsU0FBUyxlQUFlLENBQUM7QUFBQSxNQUMxQixTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxTQUFTLFlBQVksTUFBTTtBQUFBLE1BQzNCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0Esa0JBQWtCLG9CQUFvQjtBQUFBLE1BQ3RDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsRUFBRTtBQUVMLE9BQUcsYUFBYSxRQUFRO0FBQUEsRUFDekI7QUFDQSxLQUFHLGFBQWEsUUFBUTtBQUV4QixnQkFBYyxTQUFTLFFBQVE7QUFDL0IsUUFBTSxPQUFPLEdBQUcsTUFBTTtBQUN0QixRQUFNLGNBQWMsV0FBVyxTQUFTLFdBQVcsSUFBSSxJQUFJO0FBQzNELFVBQVEsWUFBWTtBQUNyQjtBQUVPLE1BQU0sV0FBVyx5QkFBeUIsbUJBQW1CLEVBQUUsWUFBWSxXQUFTLE1BQU0sQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
