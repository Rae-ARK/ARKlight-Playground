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
import { $, n } from "../../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { constObservable, derived, observableValue } from "../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { LineSource, renderLines, RenderOptions } from "../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { Position } from "../../../../../../common/core/position.js";
import { Range } from "../../../../../../common/core/range.js";
import { LineRange } from "../../../../../../common/core/ranges/lineRange.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { ILanguageService } from "../../../../../../common/languages/language.js";
import { LineTokens, TokenArray } from "../../../../../../common/tokens/lineTokens.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../../common/viewModel/inlineDecorations.js";
import { GhostText, GhostTextPart } from "../../../model/ghostText.js";
import { InlineCompletionEditorType } from "../../../model/provideInlineCompletions.js";
import { GhostTextView } from "../../ghostText/ghostTextView.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { getEditorBackgroundColor, getModifiedBorderColor, INLINE_EDITS_BORDER_RADIUS, modifiedBackgroundColor } from "../theme.js";
import { getPrefixTrim, mapOutFalsy } from "../utils/utils.js";
const BORDER_WIDTH = 1;
const WIDGET_SEPARATOR_WIDTH = 1;
const WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH = 3;
const BORDER_RADIUS = INLINE_EDITS_BORDER_RADIUS;
let InlineEditsInsertionView = class extends Disposable {
  constructor(_editor, _input, _tabAction, instantiationService, _languageService) {
    super();
    this._editor = _editor;
    this._input = _input;
    this._tabAction = _tabAction;
    this._languageService = _languageService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._state = derived(this, (reader) => {
      const state = this._input.read(reader);
      if (!state) {
        return void 0;
      }
      const textModel = this._editor.getModel();
      const eol = textModel.getEOL();
      if (state.startColumn === 1 && state.lineNumber > 1 && textModel.getLineLength(state.lineNumber) !== 0 && state.text.endsWith(eol) && !state.text.startsWith(eol)) {
        const endOfLineColumn = textModel.getLineLength(state.lineNumber - 1) + 1;
        return { lineNumber: state.lineNumber - 1, column: endOfLineColumn, text: eol + state.text.slice(0, -eol.length) };
      }
      return { lineNumber: state.lineNumber, column: state.startColumn, text: state.text };
    });
    this._trimVertically = derived(this, (reader) => {
      const state = this._state.read(reader);
      if (!state) {
        return { topOffset: 0, contentHeight: 0, linesTop: 0, linesBottom: 0 };
      }
      const text = state.text;
      const lineHeight = this._editor.getLineHeightForPosition(new Position(state.lineNumber, 1));
      const eol = this._editor.getModel().getEOL();
      const lineCount = text.split(eol).length;
      let linesTop = 0;
      let linesBottom = 0;
      if (text.trim() !== "") {
        let i = 0;
        for (; i < text.length && text.startsWith(eol, i); i += eol.length) {
          linesTop += 1;
        }
        for (let j = text.length; j > i && text.endsWith(eol, j); j -= eol.length) {
          linesBottom += 1;
        }
      }
      return {
        topOffset: linesTop * lineHeight,
        contentHeight: (lineCount - linesTop - linesBottom) * lineHeight,
        linesTop,
        linesBottom
      };
    });
    this._maxPrefixTrim = derived(this, (reader) => {
      const state = this._state.read(reader);
      if (!state) {
        return { prefixLeftOffset: 0, prefixTrim: 0 };
      }
      const textModel = this._editor.getModel();
      const eol = textModel.getEOL();
      const trimVertically = this._trimVertically.read(reader);
      const lines = state.text.split(eol);
      const modifiedLines = lines.slice(trimVertically.linesTop, lines.length - trimVertically.linesBottom);
      if (trimVertically.linesTop === 0) {
        modifiedLines[0] = textModel.getLineContent(state.lineNumber) + modifiedLines[0];
      }
      const originalRange = new LineRange(state.lineNumber, state.lineNumber + (trimVertically.linesTop > 0 ? 0 : 1));
      return getPrefixTrim([], originalRange, modifiedLines, this._editor);
    });
    this._ghostText = derived((reader) => {
      const state = this._state.read(reader);
      const prefixTrim = this._maxPrefixTrim.read(reader);
      if (!state) {
        return void 0;
      }
      const textModel = this._editor.getModel();
      const eol = textModel.getEOL();
      const modifiedLines = state.text.split(eol);
      const inlineDecorations = modifiedLines.map((line, i) => new InlineDecoration(
        new Range(i + 1, i === 0 ? 1 : prefixTrim.prefixTrim + 1, i + 1, line.length + 1),
        "modified-background",
        InlineDecorationType.Regular
      ));
      return new GhostText(state.lineNumber, [new GhostTextPart(state.column, state.text, false, inlineDecorations)]);
    });
    this._display = derived(this, (reader) => !!this._state.read(reader) ? "block" : "none");
    this._editorMaxContentWidthInRange = derived(this, (reader) => {
      const state = this._state.read(reader);
      if (!state) {
        return 0;
      }
      this._editorObs.versionId.read(reader);
      const textModel = this._editor.getModel();
      const eol = textModel.getEOL();
      const textBeforeInsertion = state.text.startsWith(eol) ? "" : textModel.getValueInRange(new Range(state.lineNumber, 1, state.lineNumber, state.column));
      const textAfterInsertion = textModel.getValueInRange(new Range(state.lineNumber, state.column, state.lineNumber, textModel.getLineLength(state.lineNumber) + 1));
      const text = textBeforeInsertion + state.text + textAfterInsertion;
      const lines = text.split(eol);
      const renderOptions = RenderOptions.fromEditor(this._editor).withSetWidth(false).withScrollBeyondLastColumn(0);
      const lineWidths = lines.map((line) => {
        const t = textModel.tokenization.tokenizeLinesAt(state.lineNumber, [line])?.[0];
        let tokens;
        if (t) {
          tokens = TokenArray.fromLineTokens(t).toLineTokens(line, this._languageService.languageIdCodec);
        } else {
          tokens = LineTokens.createEmpty(line, this._languageService.languageIdCodec);
        }
        return renderLines(new LineSource([tokens]), renderOptions, [], $("div"), true).minWidthInPx;
      });
      return Math.max(...lineWidths);
    });
    this.startLineOffset = this._trimVertically.map((v) => v.topOffset);
    this.originalLines = this._state.map(
      (s) => s ? new LineRange(
        s.lineNumber,
        Math.min(s.lineNumber + 2, this._editor.getModel().getLineCount() + 1)
      ) : void 0
    );
    this._overlayLayout = derived(this, (reader) => {
      this._ghostText.read(reader);
      const state = this._state.read(reader);
      if (!state) {
        return null;
      }
      this._editorObs.observePosition(observableValue(this, new Position(state.lineNumber, state.column)), reader.store).read(reader);
      const editorLayout = this._editorObs.layoutInfo.read(reader);
      const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);
      const verticalScrollbarWidth = this._editorObs.layoutInfoVerticalScrollbarWidth.read(reader);
      const right = editorLayout.contentLeft + this._editorMaxContentWidthInRange.read(reader) - horizontalScrollOffset;
      const prefixLeftOffset = this._maxPrefixTrim.read(reader).prefixLeftOffset ?? 0;
      const left = editorLayout.contentLeft + prefixLeftOffset - horizontalScrollOffset;
      if (right <= left) {
        return null;
      }
      const { topOffset: topTrim, contentHeight: height } = this._trimVertically.read(reader);
      const scrollTop = this._editorObs.scrollTop.read(reader);
      const top = this._editor.getTopForLineNumber(state.lineNumber) - scrollTop + topTrim;
      const bottom = top + height;
      const overlay = new Rect(left, top, right, bottom);
      return {
        overlay,
        startsAtContentLeft: prefixLeftOffset === 0,
        contentLeft: editorLayout.contentLeft,
        minContentWidthRequired: prefixLeftOffset + overlay.width + verticalScrollbarWidth
      };
    }).recomputeInitiallyAndOnChange(this._store);
    this._modifiedOverlay = n.div({
      style: { pointerEvents: "none" }
    }, derived(this, (reader) => {
      const overlayLayoutObs = mapOutFalsy(this._overlayLayout).read(reader);
      if (!overlayLayoutObs) {
        return void 0;
      }
      const overlayHider = overlayLayoutObs.map((layoutInfo) => Rect.fromLeftTopRightBottom(
        layoutInfo.contentLeft - BORDER_RADIUS - BORDER_WIDTH,
        layoutInfo.overlay.top,
        layoutInfo.contentLeft,
        layoutInfo.overlay.bottom
      )).read(reader);
      const separatorWidth = this._input.map((i) => i?.editorType === InlineCompletionEditorType.DiffEditor ? WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH : WIDGET_SEPARATOR_WIDTH).read(reader);
      const overlayRect = overlayLayoutObs.map((l) => l.overlay.withMargin(0, BORDER_WIDTH, BORDER_WIDTH, l.startsAtContentLeft ? 0 : BORDER_WIDTH).intersectHorizontal(new OffsetRange(overlayHider.left, Number.MAX_SAFE_INTEGER)));
      const underlayRect = overlayRect.map((rect) => rect.withMargin(separatorWidth, separatorWidth));
      const editorBackground = getEditorBackgroundColor(this._input.read(void 0)?.editorType ?? InlineCompletionEditorType.TextEditor);
      return [
        n.div({
          class: "originalUnderlayInsertion",
          style: {
            ...underlayRect.read(reader).toStyles(),
            borderRadius: BORDER_RADIUS,
            border: `${BORDER_WIDTH + separatorWidth}px solid ${editorBackground}`,
            boxSizing: "border-box"
          }
        }),
        n.div({
          class: "originalOverlayInsertion",
          style: {
            ...overlayRect.read(reader).toStyles(),
            borderRadius: BORDER_RADIUS,
            border: getModifiedBorderColor(this._tabAction).map((bc) => `${BORDER_WIDTH}px solid ${asCssVariable(bc)}`),
            boxSizing: "border-box",
            backgroundColor: asCssVariable(modifiedBackgroundColor)
          }
        }),
        n.div({
          class: "originalOverlayHiderInsertion",
          style: {
            ...overlayHider.toStyles(),
            backgroundColor: editorBackground
          }
        })
      ];
    })).keepUpdated(this._store);
    this._view = n.div({
      class: "inline-edits-view",
      style: {
        position: "absolute",
        overflow: "visible",
        top: "0px",
        left: "0px",
        display: this._display
      }
    }, [
      [this._modifiedOverlay]
    ]).keepUpdated(this._store);
    this._editorObs = observableCodeEditor(this._editor);
    this._ghostTextView = this._register(instantiationService.createInstance(
      GhostTextView,
      this._editor,
      derived((reader) => {
        const ghostText = this._ghostText.read(reader);
        if (!ghostText) {
          return void 0;
        }
        return {
          ghostText,
          handleInlineCompletionShown: (data) => {
          },
          warning: void 0
        };
      }),
      {
        extraClasses: ["inline-edit"],
        isClickable: true,
        shouldKeepCursorStable: true
      }
    ));
    this.isHovered = this._ghostTextView.isHovered;
    this._register(this._ghostTextView.onDidClick((e) => {
      this._onDidClick.fire(new InlineEditClickEvent(e));
    }));
    this._register(this._editorObs.createOverlayWidget({
      domNode: this._view.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: derived(this, (reader) => {
        const info = this._overlayLayout.read(reader);
        if (info === null) {
          return 0;
        }
        return info.minContentWidthRequired;
      })
    }));
  }
};
InlineEditsInsertionView = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILanguageService)
], InlineEditsInsertionView);
export {
  InlineEditsInsertionView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzSW5zZXJ0aW9uVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyAkLCBuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVDb2RlRWRpdG9yLCBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgTGluZVNvdXJjZSwgcmVuZGVyTGluZXMsIFJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9yZW5kZXJMaW5lcy5qcyc7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcmVjdC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBMaW5lVG9rZW5zLCBUb2tlbkFycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb24sIElubGluZURlY29yYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBHaG9zdFRleHQsIEdob3N0VGV4dFBhcnQgfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9naG9zdFRleHQuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUgfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgR2hvc3RUZXh0VmlldywgSUdob3N0VGV4dFdpZGdldERhdGEgfSBmcm9tICcuLi8uLi9naG9zdFRleHQvZ2hvc3RUZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5saW5lRWRpdHNWaWV3LCBJbmxpbmVFZGl0Q2xpY2tFdmVudCwgSW5saW5lRWRpdFRhYkFjdGlvbiB9IGZyb20gJy4uL2lubGluZUVkaXRzVmlld0ludGVyZmFjZS5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IsIGdldE1vZGlmaWVkQm9yZGVyQ29sb3IsIElOTElORV9FRElUU19CT1JERVJfUkFESVVTLCBtb2RpZmllZEJhY2tncm91bmRDb2xvciB9IGZyb20gJy4uL3RoZW1lLmpzJztcbmltcG9ydCB7IGdldFByZWZpeFRyaW0sIG1hcE91dEZhbHN5IH0gZnJvbSAnLi4vdXRpbHMvdXRpbHMuanMnO1xuXG5jb25zdCBCT1JERVJfV0lEVEggPSAxO1xuY29uc3QgV0lER0VUX1NFUEFSQVRPUl9XSURUSCA9IDE7XG5jb25zdCBXSURHRVRfU0VQQVJBVE9SX0RJRkZfRURJVE9SX1dJRFRIID0gMztcbmNvbnN0IEJPUkRFUl9SQURJVVMgPSBJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVUztcblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzSW5zZXJ0aW9uVmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSW5saW5lRWRpdHNWaWV3IHtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yT2JzOiBPYnNlcnZhYmxlQ29kZUVkaXRvcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5saW5lRWRpdENsaWNrRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrID0gdGhpcy5fb25EaWRDbGljay5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX2lucHV0LnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXN0YXRlKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpITtcblx0XHRjb25zdCBlb2wgPSB0ZXh0TW9kZWwuZ2V0RU9MKCk7XG5cblx0XHRpZiAoc3RhdGUuc3RhcnRDb2x1bW4gPT09IDEgJiYgc3RhdGUubGluZU51bWJlciA+IDEgJiYgdGV4dE1vZGVsLmdldExpbmVMZW5ndGgoc3RhdGUubGluZU51bWJlcikgIT09IDAgJiYgc3RhdGUudGV4dC5lbmRzV2l0aChlb2wpICYmICFzdGF0ZS50ZXh0LnN0YXJ0c1dpdGgoZW9sKSkge1xuXHRcdFx0Y29uc3QgZW5kT2ZMaW5lQ29sdW1uID0gdGV4dE1vZGVsLmdldExpbmVMZW5ndGgoc3RhdGUubGluZU51bWJlciAtIDEpICsgMTtcblx0XHRcdHJldHVybiB7IGxpbmVOdW1iZXI6IHN0YXRlLmxpbmVOdW1iZXIgLSAxLCBjb2x1bW46IGVuZE9mTGluZUNvbHVtbiwgdGV4dDogZW9sICsgc3RhdGUudGV4dC5zbGljZSgwLCAtZW9sLmxlbmd0aCkgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBsaW5lTnVtYmVyOiBzdGF0ZS5saW5lTnVtYmVyLCBjb2x1bW46IHN0YXRlLnN0YXJ0Q29sdW1uLCB0ZXh0OiBzdGF0ZS50ZXh0IH07XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyaW1WZXJ0aWNhbGx5ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybiB7IHRvcE9mZnNldDogMCwgY29udGVudEhlaWdodDogMCwgbGluZXNUb3A6IDAsIGxpbmVzQm90dG9tOiAwIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHN0YXRlLnRleHQ7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24obmV3IFBvc2l0aW9uKHN0YXRlLmxpbmVOdW1iZXIsIDEpKTtcblx0XHRjb25zdCBlb2wgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0RU9MKCk7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gdGV4dC5zcGxpdChlb2wpLmxlbmd0aDtcblxuXHRcdC8vIENvdW50IGxlYWRpbmcvdHJhaWxpbmcgYmxhbmsgbGluZXMgc28gdGhlIG92ZXJsYXkgY2FuIGJlIHRyaW1tZWQgdG8gdGhlIGFjdHVhbCBpbnNlcnRlZCBjb250ZW50LlxuXHRcdGxldCBsaW5lc1RvcCA9IDA7XG5cdFx0bGV0IGxpbmVzQm90dG9tID0gMDtcblx0XHRpZiAodGV4dC50cmltKCkgIT09ICcnKSB7XG5cdFx0XHRsZXQgaSA9IDA7XG5cdFx0XHRmb3IgKDsgaSA8IHRleHQubGVuZ3RoICYmIHRleHQuc3RhcnRzV2l0aChlb2wsIGkpOyBpICs9IGVvbC5sZW5ndGgpIHtcblx0XHRcdFx0bGluZXNUb3AgKz0gMTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChsZXQgaiA9IHRleHQubGVuZ3RoOyBqID4gaSAmJiB0ZXh0LmVuZHNXaXRoKGVvbCwgaik7IGogLT0gZW9sLmxlbmd0aCkge1xuXHRcdFx0XHRsaW5lc0JvdHRvbSArPSAxO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0b3BPZmZzZXQ6IGxpbmVzVG9wICogbGluZUhlaWdodCxcblx0XHRcdGNvbnRlbnRIZWlnaHQ6IChsaW5lQ291bnQgLSBsaW5lc1RvcCAtIGxpbmVzQm90dG9tKSAqIGxpbmVIZWlnaHQsXG5cdFx0XHRsaW5lc1RvcCxcblx0XHRcdGxpbmVzQm90dG9tLFxuXHRcdH07XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21heFByZWZpeFRyaW0gPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHsgcHJlZml4TGVmdE9mZnNldDogMCwgcHJlZml4VHJpbTogMCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpITtcblx0XHRjb25zdCBlb2wgPSB0ZXh0TW9kZWwuZ2V0RU9MKCk7XG5cblx0XHRjb25zdCB0cmltVmVydGljYWxseSA9IHRoaXMuX3RyaW1WZXJ0aWNhbGx5LnJlYWQocmVhZGVyKTtcblxuXHRcdGNvbnN0IGxpbmVzID0gc3RhdGUudGV4dC5zcGxpdChlb2wpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSBsaW5lcy5zbGljZSh0cmltVmVydGljYWxseS5saW5lc1RvcCwgbGluZXMubGVuZ3RoIC0gdHJpbVZlcnRpY2FsbHkubGluZXNCb3R0b20pO1xuXHRcdGlmICh0cmltVmVydGljYWxseS5saW5lc1RvcCA9PT0gMCkge1xuXHRcdFx0bW9kaWZpZWRMaW5lc1swXSA9IHRleHRNb2RlbC5nZXRMaW5lQ29udGVudChzdGF0ZS5saW5lTnVtYmVyKSArIG1vZGlmaWVkTGluZXNbMF07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxSYW5nZSA9IG5ldyBMaW5lUmFuZ2Uoc3RhdGUubGluZU51bWJlciwgc3RhdGUubGluZU51bWJlciArICh0cmltVmVydGljYWxseS5saW5lc1RvcCA+IDAgPyAwIDogMSkpO1xuXG5cdFx0cmV0dXJuIGdldFByZWZpeFRyaW0oW10sIG9yaWdpbmFsUmFuZ2UsIG1vZGlmaWVkTGluZXMsIHRoaXMuX2VkaXRvcik7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dob3N0VGV4dCA9IGRlcml2ZWQ8R2hvc3RUZXh0IHwgdW5kZWZpbmVkPihyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHByZWZpeFRyaW0gPSB0aGlzLl9tYXhQcmVmaXhUcmltLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXN0YXRlKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpITtcblx0XHRjb25zdCBlb2wgPSB0ZXh0TW9kZWwuZ2V0RU9MKCk7XG5cdFx0Y29uc3QgbW9kaWZpZWRMaW5lcyA9IHN0YXRlLnRleHQuc3BsaXQoZW9sKTtcblxuXHRcdGNvbnN0IGlubGluZURlY29yYXRpb25zID0gbW9kaWZpZWRMaW5lcy5tYXAoKGxpbmUsIGkpID0+IG5ldyBJbmxpbmVEZWNvcmF0aW9uKFxuXHRcdFx0bmV3IFJhbmdlKGkgKyAxLCBpID09PSAwID8gMSA6IHByZWZpeFRyaW0ucHJlZml4VHJpbSArIDEsIGkgKyAxLCBsaW5lLmxlbmd0aCArIDEpLFxuXHRcdFx0J21vZGlmaWVkLWJhY2tncm91bmQnLFxuXHRcdFx0SW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhclxuXHRcdCkpO1xuXG5cdFx0cmV0dXJuIG5ldyBHaG9zdFRleHQoc3RhdGUubGluZU51bWJlciwgW25ldyBHaG9zdFRleHRQYXJ0KHN0YXRlLmNvbHVtbiwgc3RhdGUudGV4dCwgZmFsc2UsIGlubGluZURlY29yYXRpb25zKV0pO1xuXHR9KTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2dob3N0VGV4dFZpZXc6IEdob3N0VGV4dFZpZXc7XG5cdHJlYWRvbmx5IGlzSG92ZXJlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pbnB1dDogSU9ic2VydmFibGU8e1xuXHRcdFx0bGluZU51bWJlcjogbnVtYmVyO1xuXHRcdFx0c3RhcnRDb2x1bW46IG51bWJlcjtcblx0XHRcdHRleHQ6IHN0cmluZztcblx0XHRcdGVkaXRvclR5cGU6IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlO1xuXHRcdH0gfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhYkFjdGlvbjogSU9ic2VydmFibGU8SW5saW5lRWRpdFRhYkFjdGlvbj4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2VkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcik7XG5cblx0XHR0aGlzLl9naG9zdFRleHRWaWV3ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRHaG9zdFRleHRWaWV3LFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0ZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBnaG9zdFRleHQgPSB0aGlzLl9naG9zdFRleHQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWdob3N0VGV4dCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRnaG9zdFRleHQ6IGdob3N0VGV4dCxcblx0XHRcdFx0XHRoYW5kbGVJbmxpbmVDb21wbGV0aW9uU2hvd246IChkYXRhKSA9PiB7XG5cdFx0XHRcdFx0XHQvLyBUaGlzIGlzIGEgbm8tb3AgZm9yIHRoZSBpbnNlcnRpb24gdmlldywgYXMgaXQgaXMgaGFuZGxlZCBieSB0aGUgSW5saW5lRWRpdHNWaWV3LlxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2FybmluZzogdW5kZWZpbmVkLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJR2hvc3RUZXh0V2lkZ2V0RGF0YTtcblx0XHRcdH0pLFxuXHRcdFx0e1xuXHRcdFx0XHRleHRyYUNsYXNzZXM6IFsnaW5saW5lLWVkaXQnXSxcblx0XHRcdFx0aXNDbGlja2FibGU6IHRydWUsXG5cdFx0XHRcdHNob3VsZEtlZXBDdXJzb3JTdGFibGU6IHRydWUsXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHR0aGlzLmlzSG92ZXJlZCA9IHRoaXMuX2dob3N0VGV4dFZpZXcuaXNIb3ZlcmVkO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZ2hvc3RUZXh0Vmlldy5vbkRpZENsaWNrKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUobmV3IElubGluZUVkaXRDbGlja0V2ZW50KGUpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JPYnMuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRkb21Ob2RlOiB0aGlzLl92aWV3LmVsZW1lbnQsXG5cdFx0XHRwb3NpdGlvbjogY29uc3RPYnNlcnZhYmxlKG51bGwpLFxuXHRcdFx0YWxsb3dFZGl0b3JPdmVyZmxvdzogZmFsc2UsXG5cdFx0XHRtaW5Db250ZW50V2lkdGhJblB4OiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9vdmVybGF5TGF5b3V0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKGluZm8gPT09IG51bGwpIHsgcmV0dXJuIDA7IH1cblx0XHRcdFx0cmV0dXJuIGluZm8ubWluQ29udGVudFdpZHRoUmVxdWlyZWQ7XG5cdFx0XHR9KSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwbGF5ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gISF0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcikgPyAnYmxvY2snIDogJ25vbmUnKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JNYXhDb250ZW50V2lkdGhJblJhbmdlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHR0aGlzLl9lZGl0b3JPYnMudmVyc2lvbklkLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0Y29uc3QgZW9sID0gdGV4dE1vZGVsLmdldEVPTCgpO1xuXG5cdFx0Y29uc3QgdGV4dEJlZm9yZUluc2VydGlvbiA9IHN0YXRlLnRleHQuc3RhcnRzV2l0aChlb2wpID8gJycgOiB0ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShzdGF0ZS5saW5lTnVtYmVyLCAxLCBzdGF0ZS5saW5lTnVtYmVyLCBzdGF0ZS5jb2x1bW4pKTtcblx0XHRjb25zdCB0ZXh0QWZ0ZXJJbnNlcnRpb24gPSB0ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShzdGF0ZS5saW5lTnVtYmVyLCBzdGF0ZS5jb2x1bW4sIHN0YXRlLmxpbmVOdW1iZXIsIHRleHRNb2RlbC5nZXRMaW5lTGVuZ3RoKHN0YXRlLmxpbmVOdW1iZXIpICsgMSkpO1xuXHRcdGNvbnN0IHRleHQgPSB0ZXh0QmVmb3JlSW5zZXJ0aW9uICsgc3RhdGUudGV4dCArIHRleHRBZnRlckluc2VydGlvbjtcblx0XHRjb25zdCBsaW5lcyA9IHRleHQuc3BsaXQoZW9sKTtcblxuXHRcdGNvbnN0IHJlbmRlck9wdGlvbnMgPSBSZW5kZXJPcHRpb25zLmZyb21FZGl0b3IodGhpcy5fZWRpdG9yKS53aXRoU2V0V2lkdGgoZmFsc2UpLndpdGhTY3JvbGxCZXlvbmRMYXN0Q29sdW1uKDApO1xuXHRcdGNvbnN0IGxpbmVXaWR0aHMgPSBsaW5lcy5tYXAobGluZSA9PiB7XG5cdFx0XHRjb25zdCB0ID0gdGV4dE1vZGVsLnRva2VuaXphdGlvbi50b2tlbml6ZUxpbmVzQXQoc3RhdGUubGluZU51bWJlciwgW2xpbmVdKT8uWzBdO1xuXHRcdFx0bGV0IHRva2VuczogTGluZVRva2Vucztcblx0XHRcdGlmICh0KSB7XG5cdFx0XHRcdHRva2VucyA9IFRva2VuQXJyYXkuZnJvbUxpbmVUb2tlbnModCkudG9MaW5lVG9rZW5zKGxpbmUsIHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dG9rZW5zID0gTGluZVRva2Vucy5jcmVhdGVFbXB0eShsaW5lLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlbmRlckxpbmVzKG5ldyBMaW5lU291cmNlKFt0b2tlbnNdKSwgcmVuZGVyT3B0aW9ucywgW10sICQoJ2RpdicpLCB0cnVlKS5taW5XaWR0aEluUHg7XG5cdFx0fSk7XG5cblx0XHQvLyBUYWtlIHRoZSBtYXggdmFsdWUgdGhhdCB3ZSBvYnNlcnZlZC5cblx0XHQvLyBSZXNldCB3aGVuIGVpdGhlciB0aGUgZWRpdCBjaGFuZ2VzIG9yIHRoZSBlZGl0b3IgdGV4dCB2ZXJzaW9uLlxuXHRcdHJldHVybiBNYXRoLm1heCguLi5saW5lV2lkdGhzKTtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHN0YXJ0TGluZU9mZnNldCA9IHRoaXMuX3RyaW1WZXJ0aWNhbGx5Lm1hcCh2ID0+IHYudG9wT2Zmc2V0KTtcblx0cHVibGljIHJlYWRvbmx5IG9yaWdpbmFsTGluZXMgPSB0aGlzLl9zdGF0ZS5tYXAocyA9PiBzID9cblx0XHRuZXcgTGluZVJhbmdlKFxuXHRcdFx0cy5saW5lTnVtYmVyLFxuXHRcdFx0TWF0aC5taW4ocy5saW5lTnVtYmVyICsgMiwgdGhpcy5fZWRpdG9yLmdldE1vZGVsKCkhLmdldExpbmVDb3VudCgpICsgMSlcblx0XHQpIDogdW5kZWZpbmVkXG5cdCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3ZlcmxheUxheW91dCA9IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdHRoaXMuX2dob3N0VGV4dC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSBvdmVybGF5IHdoZW4gdGhlIHBvc2l0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9lZGl0b3JPYnMub2JzZXJ2ZVBvc2l0aW9uKG9ic2VydmFibGVWYWx1ZSh0aGlzLCBuZXcgUG9zaXRpb24oc3RhdGUubGluZU51bWJlciwgc3RhdGUuY29sdW1uKSksIHJlYWRlci5zdG9yZSkucmVhZChyZWFkZXIpO1xuXG5cdFx0Y29uc3QgZWRpdG9yTGF5b3V0ID0gdGhpcy5fZWRpdG9yT2JzLmxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGhvcml6b250YWxTY3JvbGxPZmZzZXQgPSB0aGlzLl9lZGl0b3JPYnMuc2Nyb2xsTGVmdC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgdmVydGljYWxTY3JvbGxiYXJXaWR0aCA9IHRoaXMuX2VkaXRvck9icy5sYXlvdXRJbmZvVmVydGljYWxTY3JvbGxiYXJXaWR0aC5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCByaWdodCA9IGVkaXRvckxheW91dC5jb250ZW50TGVmdCArIHRoaXMuX2VkaXRvck1heENvbnRlbnRXaWR0aEluUmFuZ2UucmVhZChyZWFkZXIpIC0gaG9yaXpvbnRhbFNjcm9sbE9mZnNldDtcblx0XHRjb25zdCBwcmVmaXhMZWZ0T2Zmc2V0ID0gdGhpcy5fbWF4UHJlZml4VHJpbS5yZWFkKHJlYWRlcikucHJlZml4TGVmdE9mZnNldCA/PyAwIC8qIGZpeCBkdWUgdG8gb2JzZXJ2YWJsZSBidWc/ICovO1xuXHRcdGNvbnN0IGxlZnQgPSBlZGl0b3JMYXlvdXQuY29udGVudExlZnQgKyBwcmVmaXhMZWZ0T2Zmc2V0IC0gaG9yaXpvbnRhbFNjcm9sbE9mZnNldDtcblx0XHRpZiAocmlnaHQgPD0gbGVmdCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0b3BPZmZzZXQ6IHRvcFRyaW0sIGNvbnRlbnRIZWlnaHQ6IGhlaWdodCB9ID0gdGhpcy5fdHJpbVZlcnRpY2FsbHkucmVhZChyZWFkZXIpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5fZWRpdG9yT2JzLnNjcm9sbFRvcC5yZWFkKHJlYWRlcik7XG5cdFx0Ly8gRGVyaXZlIHRoZSBvdmVybGF5IGhlaWdodCBzeW5jaHJvbm91c2x5IGZyb20gdGhlIG1vZGVsICh2aWEgX3RyaW1WZXJ0aWNhbGx5KSByYXRoZXIgdGhhbiB0aGVcblx0XHQvLyBhc3luY2hyb25vdXNseSBtZWFzdXJlZCBnaG9zdCB0ZXh0IHZpZXcgem9uZSBoZWlnaHQsIHdoaWNoIGlzIHRyYW5zaWVudGx5IGp1c3QgYSBzaW5nbGUgbGluZSB3aGlsZVxuXHRcdC8vIHRoZSB2aWV3IHpvbmUgaXMgKHJlKWNyZWF0ZWQuIEJlY2F1c2UgaXQgdXNlcyB0aGUgc2FtZSBsaW5lIGhlaWdodCBhbmQgbGluZSBhY2NvdW50aW5nIGFzIHRoZSB0cmltcyxcblx0XHQvLyB0b3AvaGVpZ2h0L2JvdHRvbSBzdGF5IGNvbnNpc3RlbnQgYW5kIGhlaWdodCBpcyBhbHdheXMgcG9zaXRpdmU6IGxlYWRpbmcgYW5kIHRyYWlsaW5nIGJsYW5rIGxpbmVzXG5cdFx0Ly8gY2FuIG5ldmVyIGNvdmVyIGV2ZXJ5IGluc2VydGVkIGxpbmUuXG5cdFx0Y29uc3QgdG9wID0gdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIoc3RhdGUubGluZU51bWJlcikgLSBzY3JvbGxUb3AgKyB0b3BUcmltO1xuXHRcdGNvbnN0IGJvdHRvbSA9IHRvcCArIGhlaWdodDtcblxuXHRcdGNvbnN0IG92ZXJsYXkgPSBuZXcgUmVjdChsZWZ0LCB0b3AsIHJpZ2h0LCBib3R0b20pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG92ZXJsYXksXG5cdFx0XHRzdGFydHNBdENvbnRlbnRMZWZ0OiBwcmVmaXhMZWZ0T2Zmc2V0ID09PSAwLFxuXHRcdFx0Y29udGVudExlZnQ6IGVkaXRvckxheW91dC5jb250ZW50TGVmdCxcblx0XHRcdG1pbkNvbnRlbnRXaWR0aFJlcXVpcmVkOiBwcmVmaXhMZWZ0T2Zmc2V0ICsgb3ZlcmxheS53aWR0aCArIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgsXG5cdFx0fTtcblx0fSkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkT3ZlcmxheSA9IG4uZGl2KHtcblx0XHRzdHlsZTogeyBwb2ludGVyRXZlbnRzOiAnbm9uZScsIH1cblx0fSwgZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IG92ZXJsYXlMYXlvdXRPYnMgPSBtYXBPdXRGYWxzeSh0aGlzLl9vdmVybGF5TGF5b3V0KS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFvdmVybGF5TGF5b3V0T2JzKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdC8vIENyZWF0ZSBhbiBvdmVybGF5IHdoaWNoIGhpZGVzIHRoZSBsZWZ0IGhhbmQgc2lkZSBvZiB0aGUgb3JpZ2luYWwgb3ZlcmxheSB3aGVuIGl0IG92ZXJmbG93cyB0byB0aGUgbGVmdFxuXHRcdC8vIHN1Y2ggdGhhdCB0aGVyZSBpcyBhIHNtb290aCB0cmFuc2l0aW9uIGF0IHRoZSBlZGdlIG9mIGNvbnRlbnQgbGVmdFxuXHRcdGNvbnN0IG92ZXJsYXlIaWRlciA9IG92ZXJsYXlMYXlvdXRPYnMubWFwKGxheW91dEluZm8gPT4gUmVjdC5mcm9tTGVmdFRvcFJpZ2h0Qm90dG9tKFxuXHRcdFx0bGF5b3V0SW5mby5jb250ZW50TGVmdCAtIEJPUkRFUl9SQURJVVMgLSBCT1JERVJfV0lEVEgsXG5cdFx0XHRsYXlvdXRJbmZvLm92ZXJsYXkudG9wLFxuXHRcdFx0bGF5b3V0SW5mby5jb250ZW50TGVmdCxcblx0XHRcdGxheW91dEluZm8ub3ZlcmxheS5ib3R0b21cblx0XHQpKS5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCBzZXBhcmF0b3JXaWR0aCA9IHRoaXMuX2lucHV0Lm1hcChpID0+IGk/LmVkaXRvclR5cGUgPT09IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlLkRpZmZFZGl0b3IgPyBXSURHRVRfU0VQQVJBVE9SX0RJRkZfRURJVE9SX1dJRFRIIDogV0lER0VUX1NFUEFSQVRPUl9XSURUSCkucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IG92ZXJsYXlSZWN0ID0gb3ZlcmxheUxheW91dE9icy5tYXAobCA9PiBsLm92ZXJsYXkud2l0aE1hcmdpbigwLCBCT1JERVJfV0lEVEgsIEJPUkRFUl9XSURUSCwgbC5zdGFydHNBdENvbnRlbnRMZWZ0ID8gMCA6IEJPUkRFUl9XSURUSCkuaW50ZXJzZWN0SG9yaXpvbnRhbChuZXcgT2Zmc2V0UmFuZ2Uob3ZlcmxheUhpZGVyLmxlZnQsIE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSkpO1xuXHRcdGNvbnN0IHVuZGVybGF5UmVjdCA9IG92ZXJsYXlSZWN0Lm1hcChyZWN0ID0+IHJlY3Qud2l0aE1hcmdpbihzZXBhcmF0b3JXaWR0aCwgc2VwYXJhdG9yV2lkdGgpKTtcblxuXHRcdGNvbnN0IGVkaXRvckJhY2tncm91bmQgPSBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IodGhpcy5faW5wdXQucmVhZCh1bmRlZmluZWQpPy5lZGl0b3JUeXBlID8/IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlLlRleHRFZGl0b3IpO1xuXHRcdHJldHVybiBbXG5cdFx0XHRuLmRpdih7XG5cdFx0XHRcdGNsYXNzOiAnb3JpZ2luYWxVbmRlcmxheUluc2VydGlvbicsXG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0Li4udW5kZXJsYXlSZWN0LnJlYWQocmVhZGVyKS50b1N0eWxlcygpLFxuXHRcdFx0XHRcdGJvcmRlclJhZGl1czogQk9SREVSX1JBRElVUyxcblx0XHRcdFx0XHRib3JkZXI6IGAke0JPUkRFUl9XSURUSCArIHNlcGFyYXRvcldpZHRofXB4IHNvbGlkICR7ZWRpdG9yQmFja2dyb3VuZH1gLFxuXHRcdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdG4uZGl2KHtcblx0XHRcdFx0Y2xhc3M6ICdvcmlnaW5hbE92ZXJsYXlJbnNlcnRpb24nLFxuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdC4uLm92ZXJsYXlSZWN0LnJlYWQocmVhZGVyKS50b1N0eWxlcygpLFxuXHRcdFx0XHRcdGJvcmRlclJhZGl1czogQk9SREVSX1JBRElVUyxcblx0XHRcdFx0XHRib3JkZXI6IGdldE1vZGlmaWVkQm9yZGVyQ29sb3IodGhpcy5fdGFiQWN0aW9uKS5tYXAoYmMgPT4gYCR7Qk9SREVSX1dJRFRIfXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShiYyl9YCksXG5cdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiBhc0Nzc1ZhcmlhYmxlKG1vZGlmaWVkQmFja2dyb3VuZENvbG9yKSxcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRuLmRpdih7XG5cdFx0XHRcdGNsYXNzOiAnb3JpZ2luYWxPdmVybGF5SGlkZXJJbnNlcnRpb24nLFxuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdC4uLm92ZXJsYXlIaWRlci50b1N0eWxlcygpLFxuXHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHRdO1xuXHR9KSkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXcgPSBuLmRpdih7XG5cdFx0Y2xhc3M6ICdpbmxpbmUtZWRpdHMtdmlldycsXG5cdFx0c3R5bGU6IHtcblx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0b3ZlcmZsb3c6ICd2aXNpYmxlJyxcblx0XHRcdHRvcDogJzBweCcsXG5cdFx0XHRsZWZ0OiAnMHB4Jyxcblx0XHRcdGRpc3BsYXk6IHRoaXMuX2Rpc3BsYXksXG5cdFx0fSxcblx0fSwgW1xuXHRcdFt0aGlzLl9tb2RpZmllZE92ZXJsYXldLFxuXHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLFNBQVMsR0FBRyxTQUFTO0FBQ3JCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQixTQUFzQix1QkFBdUI7QUFDdkUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFFOUIsU0FBK0IsNEJBQTRCO0FBQzNELFNBQVMsWUFBWSxhQUFhLHFCQUFxQjtBQUN2RCxTQUFTLFlBQVk7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsWUFBWSxrQkFBa0I7QUFDdkMsU0FBUyxrQkFBa0IsNEJBQTRCO0FBQ3ZELFNBQVMsV0FBVyxxQkFBcUI7QUFDekMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxxQkFBMkM7QUFDcEQsU0FBMkIsNEJBQWlEO0FBQzVFLFNBQVMsMEJBQTBCLHdCQUF3Qiw0QkFBNEIsK0JBQStCO0FBQ3RILFNBQVMsZUFBZSxtQkFBbUI7QUFFM0MsTUFBTSxlQUFlO0FBQ3JCLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0scUNBQXFDO0FBQzNDLE1BQU0sZ0JBQWdCO0FBRWYsSUFBTSwyQkFBTixjQUF1QyxXQUF1QztBQUFBLEVBaUdwRixZQUNrQixTQUNBLFFBTUEsWUFDTSxzQkFDWSxrQkFDbEM7QUFDRCxVQUFNO0FBWFc7QUFDQTtBQU1BO0FBRWtCO0FBeEdwQyxTQUFpQixjQUFjLEtBQUssVUFBVSxJQUFJLFFBQThCLENBQUM7QUFDakYsU0FBUyxhQUFhLEtBQUssWUFBWTtBQUV2QyxTQUFpQixTQUFTLFFBQVEsTUFBTSxZQUFVO0FBQ2pELFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFaEMsWUFBTSxZQUFZLEtBQUssUUFBUSxTQUFTO0FBQ3hDLFlBQU0sTUFBTSxVQUFVLE9BQU87QUFFN0IsVUFBSSxNQUFNLGdCQUFnQixLQUFLLE1BQU0sYUFBYSxLQUFLLFVBQVUsY0FBYyxNQUFNLFVBQVUsTUFBTSxLQUFLLE1BQU0sS0FBSyxTQUFTLEdBQUcsS0FBSyxDQUFDLE1BQU0sS0FBSyxXQUFXLEdBQUcsR0FBRztBQUNsSyxjQUFNLGtCQUFrQixVQUFVLGNBQWMsTUFBTSxhQUFhLENBQUMsSUFBSTtBQUN4RSxlQUFPLEVBQUUsWUFBWSxNQUFNLGFBQWEsR0FBRyxRQUFRLGlCQUFpQixNQUFNLE1BQU0sTUFBTSxLQUFLLE1BQU0sR0FBRyxDQUFDLElBQUksTUFBTSxFQUFFO0FBQUEsTUFDbEg7QUFFQSxhQUFPLEVBQUUsWUFBWSxNQUFNLFlBQVksUUFBUSxNQUFNLGFBQWEsTUFBTSxNQUFNLEtBQUs7QUFBQSxJQUNwRixDQUFDO0FBRUQsU0FBaUIsa0JBQWtCLFFBQVEsTUFBTSxZQUFVO0FBQzFELFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsZUFBTyxFQUFFLFdBQVcsR0FBRyxlQUFlLEdBQUcsVUFBVSxHQUFHLGFBQWEsRUFBRTtBQUFBLE1BQ3RFO0FBRUEsWUFBTSxPQUFPLE1BQU07QUFDbkIsWUFBTSxhQUFhLEtBQUssUUFBUSx5QkFBeUIsSUFBSSxTQUFTLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFDMUYsWUFBTSxNQUFNLEtBQUssUUFBUSxTQUFTLEVBQUcsT0FBTztBQUM1QyxZQUFNLFlBQVksS0FBSyxNQUFNLEdBQUcsRUFBRTtBQUdsQyxVQUFJLFdBQVc7QUFDZixVQUFJLGNBQWM7QUFDbEIsVUFBSSxLQUFLLEtBQUssTUFBTSxJQUFJO0FBQ3ZCLFlBQUksSUFBSTtBQUNSLGVBQU8sSUFBSSxLQUFLLFVBQVUsS0FBSyxXQUFXLEtBQUssQ0FBQyxHQUFHLEtBQUssSUFBSSxRQUFRO0FBQ25FLHNCQUFZO0FBQUEsUUFDYjtBQUVBLGlCQUFTLElBQUksS0FBSyxRQUFRLElBQUksS0FBSyxLQUFLLFNBQVMsS0FBSyxDQUFDLEdBQUcsS0FBSyxJQUFJLFFBQVE7QUFDMUUseUJBQWU7QUFBQSxRQUNoQjtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTixXQUFXLFdBQVc7QUFBQSxRQUN0QixnQkFBZ0IsWUFBWSxXQUFXLGVBQWU7QUFBQSxRQUN0RDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBaUIsaUJBQWlCLFFBQVEsTUFBTSxZQUFVO0FBQ3pELFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsZUFBTyxFQUFFLGtCQUFrQixHQUFHLFlBQVksRUFBRTtBQUFBLE1BQzdDO0FBRUEsWUFBTSxZQUFZLEtBQUssUUFBUSxTQUFTO0FBQ3hDLFlBQU0sTUFBTSxVQUFVLE9BQU87QUFFN0IsWUFBTSxpQkFBaUIsS0FBSyxnQkFBZ0IsS0FBSyxNQUFNO0FBRXZELFlBQU0sUUFBUSxNQUFNLEtBQUssTUFBTSxHQUFHO0FBQ2xDLFlBQU0sZ0JBQWdCLE1BQU0sTUFBTSxlQUFlLFVBQVUsTUFBTSxTQUFTLGVBQWUsV0FBVztBQUNwRyxVQUFJLGVBQWUsYUFBYSxHQUFHO0FBQ2xDLHNCQUFjLENBQUMsSUFBSSxVQUFVLGVBQWUsTUFBTSxVQUFVLElBQUksY0FBYyxDQUFDO0FBQUEsTUFDaEY7QUFFQSxZQUFNLGdCQUFnQixJQUFJLFVBQVUsTUFBTSxZQUFZLE1BQU0sY0FBYyxlQUFlLFdBQVcsSUFBSSxJQUFJLEVBQUU7QUFFOUcsYUFBTyxjQUFjLENBQUMsR0FBRyxlQUFlLGVBQWUsS0FBSyxPQUFPO0FBQUEsSUFDcEUsQ0FBQztBQUVELFNBQWlCLGFBQWEsUUFBK0IsWUFBVTtBQUN0RSxZQUFNLFFBQVEsS0FBSyxPQUFPLEtBQUssTUFBTTtBQUNyQyxZQUFNLGFBQWEsS0FBSyxlQUFlLEtBQUssTUFBTTtBQUNsRCxVQUFJLENBQUMsT0FBTztBQUFFLGVBQU87QUFBQSxNQUFXO0FBRWhDLFlBQU0sWUFBWSxLQUFLLFFBQVEsU0FBUztBQUN4QyxZQUFNLE1BQU0sVUFBVSxPQUFPO0FBQzdCLFlBQU0sZ0JBQWdCLE1BQU0sS0FBSyxNQUFNLEdBQUc7QUFFMUMsWUFBTSxvQkFBb0IsY0FBYyxJQUFJLENBQUMsTUFBTSxNQUFNLElBQUk7QUFBQSxRQUM1RCxJQUFJLE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxJQUFJLFdBQVcsYUFBYSxHQUFHLElBQUksR0FBRyxLQUFLLFNBQVMsQ0FBQztBQUFBLFFBQ2hGO0FBQUEsUUFDQSxxQkFBcUI7QUFBQSxNQUN0QixDQUFDO0FBRUQsYUFBTyxJQUFJLFVBQVUsTUFBTSxZQUFZLENBQUMsSUFBSSxjQUFjLE1BQU0sUUFBUSxNQUFNLE1BQU0sT0FBTyxpQkFBaUIsQ0FBQyxDQUFDO0FBQUEsSUFDL0csQ0FBQztBQThERCxTQUFpQixXQUFXLFFBQVEsTUFBTSxZQUFVLENBQUMsQ0FBQyxLQUFLLE9BQU8sS0FBSyxNQUFNLElBQUksVUFBVSxNQUFNO0FBRWpHLFNBQWlCLGdDQUFnQyxRQUFRLE1BQU0sWUFBVTtBQUN4RSxZQUFNLFFBQVEsS0FBSyxPQUFPLEtBQUssTUFBTTtBQUNyQyxVQUFJLENBQUMsT0FBTztBQUNYLGVBQU87QUFBQSxNQUNSO0FBQ0EsV0FBSyxXQUFXLFVBQVUsS0FBSyxNQUFNO0FBQ3JDLFlBQU0sWUFBWSxLQUFLLFFBQVEsU0FBUztBQUN4QyxZQUFNLE1BQU0sVUFBVSxPQUFPO0FBRTdCLFlBQU0sc0JBQXNCLE1BQU0sS0FBSyxXQUFXLEdBQUcsSUFBSSxLQUFLLFVBQVUsZ0JBQWdCLElBQUksTUFBTSxNQUFNLFlBQVksR0FBRyxNQUFNLFlBQVksTUFBTSxNQUFNLENBQUM7QUFDdEosWUFBTSxxQkFBcUIsVUFBVSxnQkFBZ0IsSUFBSSxNQUFNLE1BQU0sWUFBWSxNQUFNLFFBQVEsTUFBTSxZQUFZLFVBQVUsY0FBYyxNQUFNLFVBQVUsSUFBSSxDQUFDLENBQUM7QUFDL0osWUFBTSxPQUFPLHNCQUFzQixNQUFNLE9BQU87QUFDaEQsWUFBTSxRQUFRLEtBQUssTUFBTSxHQUFHO0FBRTVCLFlBQU0sZ0JBQWdCLGNBQWMsV0FBVyxLQUFLLE9BQU8sRUFBRSxhQUFhLEtBQUssRUFBRSwyQkFBMkIsQ0FBQztBQUM3RyxZQUFNLGFBQWEsTUFBTSxJQUFJLFVBQVE7QUFDcEMsY0FBTSxJQUFJLFVBQVUsYUFBYSxnQkFBZ0IsTUFBTSxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQztBQUM5RSxZQUFJO0FBQ0osWUFBSSxHQUFHO0FBQ04sbUJBQVMsV0FBVyxlQUFlLENBQUMsRUFBRSxhQUFhLE1BQU0sS0FBSyxpQkFBaUIsZUFBZTtBQUFBLFFBQy9GLE9BQU87QUFDTixtQkFBUyxXQUFXLFlBQVksTUFBTSxLQUFLLGlCQUFpQixlQUFlO0FBQUEsUUFDNUU7QUFFQSxlQUFPLFlBQVksSUFBSSxXQUFXLENBQUMsTUFBTSxDQUFDLEdBQUcsZUFBZSxDQUFDLEdBQUcsRUFBRSxLQUFLLEdBQUcsSUFBSSxFQUFFO0FBQUEsTUFDakYsQ0FBQztBQUlELGFBQU8sS0FBSyxJQUFJLEdBQUcsVUFBVTtBQUFBLElBQzlCLENBQUM7QUFFRCxTQUFnQixrQkFBa0IsS0FBSyxnQkFBZ0IsSUFBSSxPQUFLLEVBQUUsU0FBUztBQUMzRSxTQUFnQixnQkFBZ0IsS0FBSyxPQUFPO0FBQUEsTUFBSSxPQUFLLElBQ3BELElBQUk7QUFBQSxRQUNILEVBQUU7QUFBQSxRQUNGLEtBQUssSUFBSSxFQUFFLGFBQWEsR0FBRyxLQUFLLFFBQVEsU0FBUyxFQUFHLGFBQWEsSUFBSSxDQUFDO0FBQUEsTUFDdkUsSUFBSTtBQUFBLElBQ0w7QUFFQSxTQUFpQixpQkFBaUIsUUFBUSxNQUFNLENBQUMsV0FBVztBQUMzRCxXQUFLLFdBQVcsS0FBSyxNQUFNO0FBQzNCLFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsZUFBTztBQUFBLE1BQ1I7QUFHQSxXQUFLLFdBQVcsZ0JBQWdCLGdCQUFnQixNQUFNLElBQUksU0FBUyxNQUFNLFlBQVksTUFBTSxNQUFNLENBQUMsR0FBRyxPQUFPLEtBQUssRUFBRSxLQUFLLE1BQU07QUFFOUgsWUFBTSxlQUFlLEtBQUssV0FBVyxXQUFXLEtBQUssTUFBTTtBQUMzRCxZQUFNLHlCQUF5QixLQUFLLFdBQVcsV0FBVyxLQUFLLE1BQU07QUFDckUsWUFBTSx5QkFBeUIsS0FBSyxXQUFXLGlDQUFpQyxLQUFLLE1BQU07QUFFM0YsWUFBTSxRQUFRLGFBQWEsY0FBYyxLQUFLLDhCQUE4QixLQUFLLE1BQU0sSUFBSTtBQUMzRixZQUFNLG1CQUFtQixLQUFLLGVBQWUsS0FBSyxNQUFNLEVBQUUsb0JBQW9CO0FBQzlFLFlBQU0sT0FBTyxhQUFhLGNBQWMsbUJBQW1CO0FBQzNELFVBQUksU0FBUyxNQUFNO0FBQ2xCLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxFQUFFLFdBQVcsU0FBUyxlQUFlLE9BQU8sSUFBSSxLQUFLLGdCQUFnQixLQUFLLE1BQU07QUFFdEYsWUFBTSxZQUFZLEtBQUssV0FBVyxVQUFVLEtBQUssTUFBTTtBQU12RCxZQUFNLE1BQU0sS0FBSyxRQUFRLG9CQUFvQixNQUFNLFVBQVUsSUFBSSxZQUFZO0FBQzdFLFlBQU0sU0FBUyxNQUFNO0FBRXJCLFlBQU0sVUFBVSxJQUFJLEtBQUssTUFBTSxLQUFLLE9BQU8sTUFBTTtBQUVqRCxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EscUJBQXFCLHFCQUFxQjtBQUFBLFFBQzFDLGFBQWEsYUFBYTtBQUFBLFFBQzFCLHlCQUF5QixtQkFBbUIsUUFBUSxRQUFRO0FBQUEsTUFDN0Q7QUFBQSxJQUNELENBQUMsRUFBRSw4QkFBOEIsS0FBSyxNQUFNO0FBRTVDLFNBQWlCLG1CQUFtQixFQUFFLElBQUk7QUFBQSxNQUN6QyxPQUFPLEVBQUUsZUFBZSxPQUFRO0FBQUEsSUFDakMsR0FBRyxRQUFRLE1BQU0sWUFBVTtBQUMxQixZQUFNLG1CQUFtQixZQUFZLEtBQUssY0FBYyxFQUFFLEtBQUssTUFBTTtBQUNyRSxVQUFJLENBQUMsa0JBQWtCO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFJM0MsWUFBTSxlQUFlLGlCQUFpQixJQUFJLGdCQUFjLEtBQUs7QUFBQSxRQUM1RCxXQUFXLGNBQWMsZ0JBQWdCO0FBQUEsUUFDekMsV0FBVyxRQUFRO0FBQUEsUUFDbkIsV0FBVztBQUFBLFFBQ1gsV0FBVyxRQUFRO0FBQUEsTUFDcEIsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUVkLFlBQU0saUJBQWlCLEtBQUssT0FBTyxJQUFJLE9BQUssR0FBRyxlQUFlLDJCQUEyQixhQUFhLHFDQUFxQyxzQkFBc0IsRUFBRSxLQUFLLE1BQU07QUFDOUssWUFBTSxjQUFjLGlCQUFpQixJQUFJLE9BQUssRUFBRSxRQUFRLFdBQVcsR0FBRyxjQUFjLGNBQWMsRUFBRSxzQkFBc0IsSUFBSSxZQUFZLEVBQUUsb0JBQW9CLElBQUksWUFBWSxhQUFhLE1BQU0sT0FBTyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQzVOLFlBQU0sZUFBZSxZQUFZLElBQUksVUFBUSxLQUFLLFdBQVcsZ0JBQWdCLGNBQWMsQ0FBQztBQUU1RixZQUFNLG1CQUFtQix5QkFBeUIsS0FBSyxPQUFPLEtBQUssTUFBUyxHQUFHLGNBQWMsMkJBQTJCLFVBQVU7QUFDbEksYUFBTztBQUFBLFFBQ04sRUFBRSxJQUFJO0FBQUEsVUFDTCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsWUFDTixHQUFHLGFBQWEsS0FBSyxNQUFNLEVBQUUsU0FBUztBQUFBLFlBQ3RDLGNBQWM7QUFBQSxZQUNkLFFBQVEsR0FBRyxlQUFlLGNBQWMsWUFBWSxnQkFBZ0I7QUFBQSxZQUNwRSxXQUFXO0FBQUEsVUFDWjtBQUFBLFFBQ0QsQ0FBQztBQUFBLFFBQ0QsRUFBRSxJQUFJO0FBQUEsVUFDTCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsWUFDTixHQUFHLFlBQVksS0FBSyxNQUFNLEVBQUUsU0FBUztBQUFBLFlBQ3JDLGNBQWM7QUFBQSxZQUNkLFFBQVEsdUJBQXVCLEtBQUssVUFBVSxFQUFFLElBQUksUUFBTSxHQUFHLFlBQVksWUFBWSxjQUFjLEVBQUUsQ0FBQyxFQUFFO0FBQUEsWUFDeEcsV0FBVztBQUFBLFlBQ1gsaUJBQWlCLGNBQWMsdUJBQXVCO0FBQUEsVUFDdkQ7QUFBQSxRQUNELENBQUM7QUFBQSxRQUNELEVBQUUsSUFBSTtBQUFBLFVBQ0wsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFlBQ04sR0FBRyxhQUFhLFNBQVM7QUFBQSxZQUN6QixpQkFBaUI7QUFBQSxVQUNsQjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUMsQ0FBQyxFQUFFLFlBQVksS0FBSyxNQUFNO0FBRTNCLFNBQWlCLFFBQVEsRUFBRSxJQUFJO0FBQUEsTUFDOUIsT0FBTztBQUFBLE1BQ1AsT0FBTztBQUFBLFFBQ04sVUFBVTtBQUFBLFFBQ1YsVUFBVTtBQUFBLFFBQ1YsS0FBSztBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQ04sU0FBUyxLQUFLO0FBQUEsTUFDZjtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsQ0FBQyxLQUFLLGdCQUFnQjtBQUFBLElBQ3ZCLENBQUMsRUFBRSxZQUFZLEtBQUssTUFBTTtBQTVMekIsU0FBSyxhQUFhLHFCQUFxQixLQUFLLE9BQU87QUFFbkQsU0FBSyxpQkFBaUIsS0FBSyxVQUFVLHFCQUFxQjtBQUFBLE1BQ3pEO0FBQUEsTUFDQSxLQUFLO0FBQUEsTUFDTCxRQUFRLFlBQVU7QUFDakIsY0FBTSxZQUFZLEtBQUssV0FBVyxLQUFLLE1BQU07QUFDN0MsWUFBSSxDQUFDLFdBQVc7QUFDZixpQkFBTztBQUFBLFFBQ1I7QUFDQSxlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0EsNkJBQTZCLENBQUMsU0FBUztBQUFBLFVBRXZDO0FBQUEsVUFDQSxTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxRQUNDLGNBQWMsQ0FBQyxhQUFhO0FBQUEsUUFDNUIsYUFBYTtBQUFBLFFBQ2Isd0JBQXdCO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLFlBQVksS0FBSyxlQUFlO0FBRXJDLFNBQUssVUFBVSxLQUFLLGVBQWUsV0FBVyxDQUFDLE1BQU07QUFDcEQsV0FBSyxZQUFZLEtBQUssSUFBSSxxQkFBcUIsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssV0FBVyxvQkFBb0I7QUFBQSxNQUNsRCxTQUFTLEtBQUssTUFBTTtBQUFBLE1BQ3BCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxNQUM5QixxQkFBcUI7QUFBQSxNQUNyQixxQkFBcUIsUUFBUSxNQUFNLFlBQVU7QUFDNUMsY0FBTSxPQUFPLEtBQUssZUFBZSxLQUFLLE1BQU07QUFDNUMsWUFBSSxTQUFTLE1BQU07QUFBRSxpQkFBTztBQUFBLFFBQUc7QUFDL0IsZUFBTyxLQUFLO0FBQUEsTUFDYixDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFBQSxFQUNIO0FBb0pEO0FBNVNhLDJCQUFOO0FBQUEsRUEwR0o7QUFBQSxFQUNBO0FBQUEsR0EzR1U7IiwKICAibmFtZXMiOiBbXQp9Cg==
