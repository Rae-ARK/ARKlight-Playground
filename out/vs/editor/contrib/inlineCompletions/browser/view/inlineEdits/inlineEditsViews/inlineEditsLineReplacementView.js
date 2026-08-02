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
import { Disposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorunDelta, constObservable, derived } from "../../../../../../../base/common/observable.js";
import { scrollbarShadow } from "../../../../../../../platform/theme/common/colorRegistry.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { EditorMouseEvent } from "../../../../../../browser/editorDom.js";
import { LineSource, renderLines, RenderOptions } from "../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { Range } from "../../../../../../common/core/range.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { ILanguageService } from "../../../../../../common/languages/language.js";
import { LineTokens, TokenArray } from "../../../../../../common/tokens/lineTokens.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../../common/viewModel/inlineDecorations.js";
import { InlineCompletionEditorType } from "../../../model/provideInlineCompletions.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { getEditorBackgroundColor, getEditorBlendedColor, getModifiedBorderColor, getOriginalBorderColor, INLINE_EDITS_BORDER_RADIUS, modifiedChangedLineBackgroundColor, originalBackgroundColor } from "../theme.js";
import { getEditorValidOverlayRect, getPrefixTrim, mapOutFalsy, rectToProps } from "../utils/utils.js";
let InlineEditsLineReplacementView = class extends Disposable {
  constructor(_editor, _edit, _editorType, _tabAction, _languageService, _themeService) {
    super();
    this._editor = _editor;
    this._edit = _edit;
    this._editorType = _editorType;
    this._tabAction = _tabAction;
    this._languageService = _languageService;
    this._themeService = _themeService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._maxPrefixTrim = this._edit.map((e, reader) => e ? getPrefixTrim(e.replacements.flatMap((r) => [r.originalRange, r.modifiedRange]), e.originalRange, e.modifiedLines, this._editor.editor, reader) : void 0);
    this._modifiedLineElements = derived(this, (reader) => {
      const lines = [];
      let requiredWidth = 0;
      const prefixTrim = this._maxPrefixTrim.read(reader);
      const edit = this._edit.read(reader);
      if (!edit || !prefixTrim) {
        return void 0;
      }
      const maxPrefixTrim = prefixTrim.prefixTrim;
      const modifiedBubbles = rangesToBubbleRanges(edit.replacements.map((r) => r.modifiedRange)).map((r) => new Range(r.startLineNumber, r.startColumn - maxPrefixTrim, r.endLineNumber, r.endColumn - maxPrefixTrim));
      const textModel = this._editor.model.get();
      const startLineNumber = edit.modifiedRange.startLineNumber;
      for (let i = 0; i < edit.modifiedRange.length; i++) {
        const line = document.createElement("div");
        const lineNumber = startLineNumber + i;
        const modLine = edit.modifiedLines[i].slice(maxPrefixTrim);
        const t = textModel.tokenization.tokenizeLinesAt(lineNumber, [modLine])?.[0];
        let tokens;
        if (t) {
          tokens = TokenArray.fromLineTokens(t).toLineTokens(modLine, this._languageService.languageIdCodec);
        } else {
          tokens = LineTokens.createEmpty(modLine, this._languageService.languageIdCodec);
        }
        const decorations = [];
        for (const modified of modifiedBubbles.filter((b) => b.startLineNumber === lineNumber)) {
          const validatedEndColumn = Math.min(modified.endColumn, modLine.length + 1);
          decorations.push(new InlineDecoration(new Range(1, modified.startColumn, 1, validatedEndColumn), "inlineCompletions-modified-bubble", InlineDecorationType.Regular));
        }
        const result = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false).withScrollBeyondLastColumn(0), decorations, line, true);
        this._editor.getOption(EditorOption.fontInfo).read(reader);
        requiredWidth = Math.max(requiredWidth, result.minWidthInPx);
        lines.push(line);
      }
      return { lines, requiredWidth };
    });
    this._layout = derived(this, (reader) => {
      const modifiedLines = this._modifiedLineElements.read(reader);
      const maxPrefixTrim = this._maxPrefixTrim.read(reader);
      const edit = this._edit.read(reader);
      if (!modifiedLines || !maxPrefixTrim || !edit) {
        return void 0;
      }
      const { prefixLeftOffset } = maxPrefixTrim;
      const { requiredWidth } = modifiedLines;
      const originalLineHeights = this._editor.observeLineHeightsForLineRange(edit.originalRange).read(reader);
      const modifiedLineHeights = (() => {
        const lineHeights = originalLineHeights.slice(0, edit.modifiedRange.length);
        while (lineHeights.length < edit.modifiedRange.length) {
          lineHeights.push(originalLineHeights[originalLineHeights.length - 1]);
        }
        return lineHeights;
      })();
      const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
      const verticalScrollbarWidth = this._editor.layoutInfoVerticalScrollbarWidth.read(reader);
      const scrollLeft = this._editor.scrollLeft.read(reader);
      const scrollTop = this._editor.scrollTop.read(reader);
      const editorLeftOffset = contentLeft - scrollLeft;
      const textModel = this._editor.editor.getModel();
      const originalLineWidths = edit.originalRange.mapToLineArray((line) => this._editor.editor.getOffsetForColumn(line, textModel.getLineMaxColumn(line)) - prefixLeftOffset);
      const maxLineWidth = Math.max(...originalLineWidths, requiredWidth);
      const startLineNumber = edit.originalRange.startLineNumber;
      const endLineNumber = edit.originalRange.endLineNumberExclusive - 1;
      const topOfOriginalLines = this._editor.editor.getTopForLineNumber(startLineNumber) - scrollTop;
      const bottomOfOriginalLines = this._editor.editor.getBottomForLineNumber(endLineNumber) - scrollTop;
      const originalLinesOverlay = Rect.fromLeftTopWidthHeight(
        editorLeftOffset + prefixLeftOffset,
        topOfOriginalLines,
        maxLineWidth,
        bottomOfOriginalLines - topOfOriginalLines
      );
      const modifiedLinesOverlay = Rect.fromLeftTopWidthHeight(
        originalLinesOverlay.left,
        originalLinesOverlay.bottom,
        originalLinesOverlay.width,
        modifiedLineHeights.reduce((sum, h) => sum + h, 0)
      );
      const background = Rect.hull([originalLinesOverlay, modifiedLinesOverlay]);
      const lowerBackground = background.intersectVertical(new OffsetRange(originalLinesOverlay.bottom, Number.MAX_SAFE_INTEGER));
      const lowerText = new Rect(lowerBackground.left, lowerBackground.top, lowerBackground.right, lowerBackground.bottom);
      return {
        originalLinesOverlay,
        modifiedLinesOverlay,
        background,
        lowerBackground,
        lowerText,
        modifiedLineHeights,
        minContentWidthRequired: prefixLeftOffset + maxLineWidth + verticalScrollbarWidth
      };
    });
    this._viewZoneInfo = derived((reader) => {
      const shouldShowViewZone = this._editor.getOption(EditorOption.inlineSuggest).map((o) => o.edits.allowCodeShifting === "always").read(reader);
      if (!shouldShowViewZone) {
        return void 0;
      }
      const layout = this._layout.read(reader);
      const edit = this._edit.read(reader);
      if (!layout || !edit) {
        return void 0;
      }
      const viewZoneHeight = layout.lowerBackground.height;
      const viewZoneLineNumber = edit.originalRange.endLineNumberExclusive;
      return { height: viewZoneHeight, lineNumber: viewZoneLineNumber };
    });
    this.minEditorScrollHeight = derived(this, (reader) => {
      const layout = mapOutFalsy(this._layout).read(reader);
      if (!layout || this._viewZoneInfo.read(reader) !== void 0) {
        return 0;
      }
      return layout.read(reader).lowerText.bottom + this._editor.editor.getScrollTop();
    });
    this._div = n.div({
      class: "line-replacement"
    }, [
      derived(this, (reader) => {
        const layout = mapOutFalsy(this._layout).read(reader);
        const modifiedLineElements = this._modifiedLineElements.read(reader);
        if (!layout || !modifiedLineElements) {
          return [];
        }
        const layoutProps = layout.read(reader);
        const contentLeft = this._editor.layoutInfoContentLeft.read(reader);
        const separatorWidth = this._editorType.read(reader) === InlineCompletionEditorType.DiffEditor ? 3 : 1;
        modifiedLineElements.lines.forEach((l, i) => {
          l.style.width = `${layoutProps.lowerText.width}px`;
          l.style.height = `${layoutProps.modifiedLineHeights[i]}px`;
          l.style.position = "relative";
        });
        const modifiedBorderColor = getModifiedBorderColor(this._tabAction).read(reader);
        const originalBorderColor = getOriginalBorderColor(this._tabAction).read(reader);
        const editorBackground = getEditorBackgroundColor(this._editorType.read(reader));
        return [
          n.div({
            style: {
              position: "absolute",
              ...rectToProps((r) => getEditorValidOverlayRect(this._editor).read(r)),
              overflow: "hidden",
              pointerEvents: "none"
            }
          }, [
            n.div({
              class: "borderAroundLineReplacement",
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).background.translateX(-contentLeft).withMargin(separatorWidth)),
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                border: `${separatorWidth + 1}px solid ${editorBackground}`,
                boxSizing: "border-box",
                pointerEvents: "none"
              }
            }),
            n.div({
              class: "originalOverlayLineReplacement",
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).background.translateX(-contentLeft)),
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                border: getEditorBlendedColor(originalBorderColor, this._themeService).map((c) => `1px solid ${c.toString()}`),
                pointerEvents: "none",
                boxSizing: "border-box",
                background: asCssVariable(originalBackgroundColor)
              }
            }),
            n.div({
              class: "modifiedOverlayLineReplacement",
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).lowerBackground.translateX(-contentLeft)),
                borderRadius: `0 0 ${INLINE_EDITS_BORDER_RADIUS}px ${INLINE_EDITS_BORDER_RADIUS}px`,
                background: editorBackground,
                boxShadow: `${asCssVariable(scrollbarShadow)} 0 6px 6px -6px`,
                border: `1px solid ${asCssVariable(modifiedBorderColor)}`,
                boxSizing: "border-box",
                overflow: "hidden",
                cursor: "pointer",
                pointerEvents: "auto"
              },
              onmousedown: (e) => {
                e.preventDefault();
              },
              onclick: (e) => this._onDidClick.fire(InlineEditClickEvent.create(e))
            }, [
              n.div({
                style: {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  background: asCssVariable(modifiedChangedLineBackgroundColor)
                }
              })
            ]),
            n.div({
              class: "modifiedLinesLineReplacement",
              style: {
                position: "absolute",
                boxSizing: "border-box",
                ...rectToProps((reader2) => layout.read(reader2).lowerText.translateX(-contentLeft)),
                fontFamily: this._editor.getOption(EditorOption.fontFamily),
                fontSize: this._editor.getOption(EditorOption.fontSize),
                fontWeight: this._editor.getOption(EditorOption.fontWeight),
                pointerEvents: "none",
                whiteSpace: "nowrap",
                borderRadius: `0 0 ${INLINE_EDITS_BORDER_RADIUS}px ${INLINE_EDITS_BORDER_RADIUS}px`,
                overflow: "hidden"
              }
            }, [...modifiedLineElements.lines])
          ])
        ];
      })
    ]).keepUpdated(this._store);
    this.isHovered = this._editor.isTargetHovered((e) => this._isMouseOverWidget(e), this._store);
    this._previousViewZoneInfo = void 0;
    this._register(toDisposable(() => this._editor.editor.changeViewZones((accessor) => this.removePreviousViewZone(accessor))));
    this._register(autorunDelta(this._viewZoneInfo, ({ lastValue, newValue }) => {
      if (lastValue === newValue || lastValue?.height === newValue?.height && lastValue?.lineNumber === newValue?.lineNumber) {
        return;
      }
      this._editor.editor.changeViewZones((changeAccessor) => {
        this.removePreviousViewZone(changeAccessor);
        if (!newValue) {
          return;
        }
        this.addViewZone(newValue, changeAccessor);
      });
    }));
    this._register(this._editor.createOverlayWidget({
      domNode: this._div.element,
      minContentWidthInPx: derived(this, (reader) => {
        return this._layout.read(reader)?.minContentWidthRequired ?? 0;
      }),
      position: constObservable({ preference: { top: 0, left: 0 } }),
      allowEditorOverflow: false
    }));
  }
  _isMouseOverWidget(e) {
    const layout = this._layout.get();
    if (!layout || !(e.event instanceof EditorMouseEvent)) {
      return false;
    }
    return layout.lowerBackground.containsPoint(new Point(e.event.relativePos.x, e.event.relativePos.y));
  }
  removePreviousViewZone(changeAccessor) {
    if (!this._previousViewZoneInfo) {
      return;
    }
    changeAccessor.removeZone(this._previousViewZoneInfo.id);
    const cursorLineNumber = this._editor.cursorLineNumber.get();
    if (cursorLineNumber !== null && cursorLineNumber >= this._previousViewZoneInfo.lineNumber) {
      this._editor.editor.setScrollTop(this._editor.scrollTop.get() - this._previousViewZoneInfo.height);
    }
    this._previousViewZoneInfo = void 0;
  }
  addViewZone(viewZoneInfo, changeAccessor) {
    const activeViewZone = changeAccessor.addZone({
      afterLineNumber: viewZoneInfo.lineNumber - 1,
      heightInPx: viewZoneInfo.height,
      // move computation to layout?
      domNode: $("div")
    });
    this._previousViewZoneInfo = { height: viewZoneInfo.height, lineNumber: viewZoneInfo.lineNumber, id: activeViewZone };
    const cursorLineNumber = this._editor.cursorLineNumber.get();
    if (cursorLineNumber !== null && cursorLineNumber >= viewZoneInfo.lineNumber) {
      this._editor.editor.setScrollTop(this._editor.scrollTop.get() + viewZoneInfo.height);
    }
  }
};
InlineEditsLineReplacementView = __decorateClass([
  __decorateParam(4, ILanguageService),
  __decorateParam(5, IThemeService)
], InlineEditsLineReplacementView);
function rangesToBubbleRanges(ranges) {
  const result = [];
  while (ranges.length) {
    let range = ranges.shift();
    if (range.startLineNumber !== range.endLineNumber) {
      ranges.push(new Range(range.startLineNumber + 1, 1, range.endLineNumber, range.endColumn));
      range = new Range(range.startLineNumber, range.startColumn, range.startLineNumber, Number.MAX_SAFE_INTEGER);
    }
    result.push(range);
  }
  return result;
}
export {
  InlineEditsLineReplacementView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzTGluZVJlcGxhY2VtZW50Vmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1bkRlbHRhLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBzY3JvbGxiYXJTaGFkb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck1vdXNlRXZlbnQsIElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckRvbS5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgTGluZVNvdXJjZSwgcmVuZGVyTGluZXMsIFJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9yZW5kZXJMaW5lcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9pbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9wb2ludC5qcyc7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcmVjdC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucywgVG9rZW5BcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uLCBJbmxpbmVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvaW5saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUgfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgSUlubGluZUVkaXRzVmlldywgSW5saW5lRWRpdENsaWNrRXZlbnQsIElubGluZUVkaXRUYWJBY3Rpb24gfSBmcm9tICcuLi9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yQmFja2dyb3VuZENvbG9yLCBnZXRFZGl0b3JCbGVuZGVkQ29sb3IsIGdldE1vZGlmaWVkQm9yZGVyQ29sb3IsIGdldE9yaWdpbmFsQm9yZGVyQ29sb3IsIElOTElORV9FRElUU19CT1JERVJfUkFESVVTLCBtb2RpZmllZENoYW5nZWRMaW5lQmFja2dyb3VuZENvbG9yLCBvcmlnaW5hbEJhY2tncm91bmRDb2xvciB9IGZyb20gJy4uL3RoZW1lLmpzJztcbmltcG9ydCB7IGdldEVkaXRvclZhbGlkT3ZlcmxheVJlY3QsIGdldFByZWZpeFRyaW0sIG1hcE91dEZhbHN5LCByZWN0VG9Qcm9wcyB9IGZyb20gJy4uL3V0aWxzL3V0aWxzLmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzTGluZVJlcGxhY2VtZW50VmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSW5saW5lRWRpdHNWaWV3IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SW5saW5lRWRpdENsaWNrRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrID0gdGhpcy5fb25EaWRDbGljay5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXhQcmVmaXhUcmltO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkTGluZUVsZW1lbnRzO1xuXG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGF5b3V0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdab25lSW5mbztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXY7XG5cblx0cmVhZG9ubHkgaXNIb3ZlcmVkO1xuXG5cdHJlYWRvbmx5IG1pbkVkaXRvclNjcm9sbEhlaWdodDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IE9ic2VydmFibGVDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXQ6IElPYnNlcnZhYmxlPHtcblx0XHRcdG9yaWdpbmFsUmFuZ2U6IExpbmVSYW5nZTtcblx0XHRcdG1vZGlmaWVkUmFuZ2U6IExpbmVSYW5nZTtcblx0XHRcdG1vZGlmaWVkTGluZXM6IHN0cmluZ1tdO1xuXHRcdFx0cmVwbGFjZW1lbnRzOiBSZXBsYWNlbWVudFtdO1xuXHRcdH0gfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclR5cGU6IElPYnNlcnZhYmxlPElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YWJBY3Rpb246IElPYnNlcnZhYmxlPElubGluZUVkaXRUYWJBY3Rpb24+LFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbWF4UHJlZml4VHJpbSA9IHRoaXMuX2VkaXQubWFwKChlLCByZWFkZXIpID0+IGUgPyBnZXRQcmVmaXhUcmltKGUucmVwbGFjZW1lbnRzLmZsYXRNYXAociA9PiBbci5vcmlnaW5hbFJhbmdlLCByLm1vZGlmaWVkUmFuZ2VdKSwgZS5vcmlnaW5hbFJhbmdlLCBlLm1vZGlmaWVkTGluZXMsIHRoaXMuX2VkaXRvci5lZGl0b3IsIHJlYWRlcikgOiB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX21vZGlmaWVkTGluZUVsZW1lbnRzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGluZXMgPSBbXTtcblx0XHRcdGxldCByZXF1aXJlZFdpZHRoID0gMDtcblxuXHRcdFx0Y29uc3QgcHJlZml4VHJpbSA9IHRoaXMuX21heFByZWZpeFRyaW0ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2VkaXQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFlZGl0IHx8ICFwcmVmaXhUcmltKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1heFByZWZpeFRyaW0gPSBwcmVmaXhUcmltLnByZWZpeFRyaW07XG5cdFx0XHRjb25zdCBtb2RpZmllZEJ1YmJsZXMgPSByYW5nZXNUb0J1YmJsZVJhbmdlcyhlZGl0LnJlcGxhY2VtZW50cy5tYXAociA9PiByLm1vZGlmaWVkUmFuZ2UpKS5tYXAociA9PiBuZXcgUmFuZ2Uoci5zdGFydExpbmVOdW1iZXIsIHIuc3RhcnRDb2x1bW4gLSBtYXhQcmVmaXhUcmltLCByLmVuZExpbmVOdW1iZXIsIHIuZW5kQ29sdW1uIC0gbWF4UHJlZml4VHJpbSkpO1xuXG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9lZGl0b3IubW9kZWwuZ2V0KCkhO1xuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gZWRpdC5tb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWRpdC5tb2RpZmllZFJhbmdlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlciArIGk7XG5cdFx0XHRcdGNvbnN0IG1vZExpbmUgPSBlZGl0Lm1vZGlmaWVkTGluZXNbaV0uc2xpY2UobWF4UHJlZml4VHJpbSk7XG5cblx0XHRcdFx0Y29uc3QgdCA9IHRleHRNb2RlbC50b2tlbml6YXRpb24udG9rZW5pemVMaW5lc0F0KGxpbmVOdW1iZXIsIFttb2RMaW5lXSk/LlswXTtcblx0XHRcdFx0bGV0IHRva2VuczogTGluZVRva2Vucztcblx0XHRcdFx0aWYgKHQpIHtcblx0XHRcdFx0XHR0b2tlbnMgPSBUb2tlbkFycmF5LmZyb21MaW5lVG9rZW5zKHQpLnRvTGluZVRva2Vucyhtb2RMaW5lLCB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0b2tlbnMgPSBMaW5lVG9rZW5zLmNyZWF0ZUVtcHR5KG1vZExpbmUsIHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBtb2RpZmllZCBvZiBtb2RpZmllZEJ1YmJsZXMuZmlsdGVyKGIgPT4gYi5zdGFydExpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsaWRhdGVkRW5kQ29sdW1uID0gTWF0aC5taW4obW9kaWZpZWQuZW5kQ29sdW1uLCBtb2RMaW5lLmxlbmd0aCArIDEpO1xuXHRcdFx0XHRcdGRlY29yYXRpb25zLnB1c2gobmV3IElubGluZURlY29yYXRpb24obmV3IFJhbmdlKDEsIG1vZGlmaWVkLnN0YXJ0Q29sdW1uLCAxLCB2YWxpZGF0ZWRFbmRDb2x1bW4pLCAnaW5saW5lQ29tcGxldGlvbnMtbW9kaWZpZWQtYnViYmxlJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcikpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVE9ETzogQWxsIGxpbmVzIHNob3VsZCBiZSByZW5kZXJlZCBhdCBvbmNlIGZvciBvbmUgZG9tIGVsZW1lbnRcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVuZGVyTGluZXMobmV3IExpbmVTb3VyY2UoW3Rva2Vuc10pLCBSZW5kZXJPcHRpb25zLmZyb21FZGl0b3IodGhpcy5fZWRpdG9yLmVkaXRvcikud2l0aFNldFdpZHRoKGZhbHNlKS53aXRoU2Nyb2xsQmV5b25kTGFzdENvbHVtbigwKSwgZGVjb3JhdGlvbnMsIGxpbmUsIHRydWUpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbykucmVhZChyZWFkZXIpOyAvLyB1cGRhdGUgd2hlbiBmb250IGluZm8gY2hhbmdlc1xuXG5cdFx0XHRcdHJlcXVpcmVkV2lkdGggPSBNYXRoLm1heChyZXF1aXJlZFdpZHRoLCByZXN1bHQubWluV2lkdGhJblB4KTtcblxuXHRcdFx0XHRsaW5lcy5wdXNoKGxpbmUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBsaW5lcywgcmVxdWlyZWRXaWR0aDogcmVxdWlyZWRXaWR0aCB9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX2xheW91dCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZXMgPSB0aGlzLl9tb2RpZmllZExpbmVFbGVtZW50cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBtYXhQcmVmaXhUcmltID0gdGhpcy5fbWF4UHJlZml4VHJpbS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBlZGl0ID0gdGhpcy5fZWRpdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGlmaWVkTGluZXMgfHwgIW1heFByZWZpeFRyaW0gfHwgIWVkaXQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyBwcmVmaXhMZWZ0T2Zmc2V0IH0gPSBtYXhQcmVmaXhUcmltO1xuXHRcdFx0Y29uc3QgeyByZXF1aXJlZFdpZHRoIH0gPSBtb2RpZmllZExpbmVzO1xuXG5cdFx0XHRjb25zdCBvcmlnaW5hbExpbmVIZWlnaHRzID0gdGhpcy5fZWRpdG9yLm9ic2VydmVMaW5lSGVpZ2h0c0ZvckxpbmVSYW5nZShlZGl0Lm9yaWdpbmFsUmFuZ2UpLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZUhlaWdodHMgPSAoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBsaW5lSGVpZ2h0cyA9IG9yaWdpbmFsTGluZUhlaWdodHMuc2xpY2UoMCwgZWRpdC5tb2RpZmllZFJhbmdlLmxlbmd0aCk7XG5cdFx0XHRcdHdoaWxlIChsaW5lSGVpZ2h0cy5sZW5ndGggPCBlZGl0Lm1vZGlmaWVkUmFuZ2UubGVuZ3RoKSB7XG5cdFx0XHRcdFx0bGluZUhlaWdodHMucHVzaChvcmlnaW5hbExpbmVIZWlnaHRzW29yaWdpbmFsTGluZUhlaWdodHMubGVuZ3RoIC0gMV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBsaW5lSGVpZ2h0cztcblx0XHRcdH0pKCk7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnRMZWZ0ID0gdGhpcy5fZWRpdG9yLmxheW91dEluZm9Db250ZW50TGVmdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoID0gdGhpcy5fZWRpdG9yLmxheW91dEluZm9WZXJ0aWNhbFNjcm9sbGJhcldpZHRoLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHNjcm9sbExlZnQgPSB0aGlzLl9lZGl0b3Iuc2Nyb2xsTGVmdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLl9lZGl0b3Iuc2Nyb2xsVG9wLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVkaXRvckxlZnRPZmZzZXQgPSBjb250ZW50TGVmdCAtIHNjcm9sbExlZnQ7XG5cblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5lZGl0b3IuZ2V0TW9kZWwoKSE7XG5cblx0XHRcdGNvbnN0IG9yaWdpbmFsTGluZVdpZHRocyA9IGVkaXQub3JpZ2luYWxSYW5nZS5tYXBUb0xpbmVBcnJheShsaW5lID0+IHRoaXMuX2VkaXRvci5lZGl0b3IuZ2V0T2Zmc2V0Rm9yQ29sdW1uKGxpbmUsIHRleHRNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmUpKSAtIHByZWZpeExlZnRPZmZzZXQpO1xuXHRcdFx0Y29uc3QgbWF4TGluZVdpZHRoID0gTWF0aC5tYXgoLi4ub3JpZ2luYWxMaW5lV2lkdGhzLCByZXF1aXJlZFdpZHRoKTtcblxuXHRcdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gZWRpdC5vcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBlZGl0Lm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDE7XG5cdFx0XHRjb25zdCB0b3BPZk9yaWdpbmFsTGluZXMgPSB0aGlzLl9lZGl0b3IuZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIoc3RhcnRMaW5lTnVtYmVyKSAtIHNjcm9sbFRvcDtcblx0XHRcdGNvbnN0IGJvdHRvbU9mT3JpZ2luYWxMaW5lcyA9IHRoaXMuX2VkaXRvci5lZGl0b3IuZ2V0Qm90dG9tRm9yTGluZU51bWJlcihlbmRMaW5lTnVtYmVyKSAtIHNjcm9sbFRvcDtcblxuXHRcdFx0Ly8gQm94IFdpZGdldCBwb3NpdGlvbmluZ1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxMaW5lc092ZXJsYXkgPSBSZWN0LmZyb21MZWZ0VG9wV2lkdGhIZWlnaHQoXG5cdFx0XHRcdGVkaXRvckxlZnRPZmZzZXQgKyBwcmVmaXhMZWZ0T2Zmc2V0LFxuXHRcdFx0XHR0b3BPZk9yaWdpbmFsTGluZXMsXG5cdFx0XHRcdG1heExpbmVXaWR0aCxcblx0XHRcdFx0Ym90dG9tT2ZPcmlnaW5hbExpbmVzIC0gdG9wT2ZPcmlnaW5hbExpbmVzXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRMaW5lc092ZXJsYXkgPSBSZWN0LmZyb21MZWZ0VG9wV2lkdGhIZWlnaHQoXG5cdFx0XHRcdG9yaWdpbmFsTGluZXNPdmVybGF5LmxlZnQsXG5cdFx0XHRcdG9yaWdpbmFsTGluZXNPdmVybGF5LmJvdHRvbSxcblx0XHRcdFx0b3JpZ2luYWxMaW5lc092ZXJsYXkud2lkdGgsXG5cdFx0XHRcdG1vZGlmaWVkTGluZUhlaWdodHMucmVkdWNlKChzdW0sIGgpID0+IHN1bSArIGgsIDApXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgYmFja2dyb3VuZCA9IFJlY3QuaHVsbChbb3JpZ2luYWxMaW5lc092ZXJsYXksIG1vZGlmaWVkTGluZXNPdmVybGF5XSk7XG5cblx0XHRcdGNvbnN0IGxvd2VyQmFja2dyb3VuZCA9IGJhY2tncm91bmQuaW50ZXJzZWN0VmVydGljYWwobmV3IE9mZnNldFJhbmdlKG9yaWdpbmFsTGluZXNPdmVybGF5LmJvdHRvbSwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpKTtcblx0XHRcdGNvbnN0IGxvd2VyVGV4dCA9IG5ldyBSZWN0KGxvd2VyQmFja2dyb3VuZC5sZWZ0LCBsb3dlckJhY2tncm91bmQudG9wLCBsb3dlckJhY2tncm91bmQucmlnaHQsIGxvd2VyQmFja2dyb3VuZC5ib3R0b20pO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRvcmlnaW5hbExpbmVzT3ZlcmxheSxcblx0XHRcdFx0bW9kaWZpZWRMaW5lc092ZXJsYXksXG5cdFx0XHRcdGJhY2tncm91bmQsXG5cdFx0XHRcdGxvd2VyQmFja2dyb3VuZCxcblx0XHRcdFx0bG93ZXJUZXh0LFxuXHRcdFx0XHRtb2RpZmllZExpbmVIZWlnaHRzLFxuXHRcdFx0XHRtaW5Db250ZW50V2lkdGhSZXF1aXJlZDogcHJlZml4TGVmdE9mZnNldCArIG1heExpbmVXaWR0aCArIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX3ZpZXdab25lSW5mbyA9IGRlcml2ZWQ8eyBoZWlnaHQ6IG51bWJlcjsgbGluZU51bWJlcjogbnVtYmVyIH0gfCB1bmRlZmluZWQ+KHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzaG91bGRTaG93Vmlld1pvbmUgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5tYXAobyA9PiBvLmVkaXRzLmFsbG93Q29kZVNoaWZ0aW5nID09PSAnYWx3YXlzJykucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzaG91bGRTaG93Vmlld1pvbmUpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fbGF5b3V0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVkaXQgPSB0aGlzLl9lZGl0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGF5b3V0IHx8ICFlZGl0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpZXdab25lSGVpZ2h0ID0gbGF5b3V0Lmxvd2VyQmFja2dyb3VuZC5oZWlnaHQ7XG5cdFx0XHRjb25zdCB2aWV3Wm9uZUxpbmVOdW1iZXIgPSBlZGl0Lm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZTtcblx0XHRcdHJldHVybiB7IGhlaWdodDogdmlld1pvbmVIZWlnaHQsIGxpbmVOdW1iZXI6IHZpZXdab25lTGluZU51bWJlciB9O1xuXHRcdH0pO1xuXHRcdHRoaXMubWluRWRpdG9yU2Nyb2xsSGVpZ2h0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0ID0gbWFwT3V0RmFsc3kodGhpcy5fbGF5b3V0KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWxheW91dCB8fCB0aGlzLl92aWV3Wm9uZUluZm8ucmVhZChyZWFkZXIpICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGF5b3V0LnJlYWQocmVhZGVyKS5sb3dlclRleHQuYm90dG9tICsgdGhpcy5fZWRpdG9yLmVkaXRvci5nZXRTY3JvbGxUb3AoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9kaXYgPSBuLmRpdih7XG5cdFx0XHRjbGFzczogJ2xpbmUtcmVwbGFjZW1lbnQnLFxuXHRcdH0sIFtcblx0XHRcdGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgbGF5b3V0ID0gbWFwT3V0RmFsc3kodGhpcy5fbGF5b3V0KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkTGluZUVsZW1lbnRzID0gdGhpcy5fbW9kaWZpZWRMaW5lRWxlbWVudHMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWxheW91dCB8fCAhbW9kaWZpZWRMaW5lRWxlbWVudHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsYXlvdXRQcm9wcyA9IGxheW91dC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnRMZWZ0ID0gdGhpcy5fZWRpdG9yLmxheW91dEluZm9Db250ZW50TGVmdC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdFx0Y29uc3Qgc2VwYXJhdG9yV2lkdGggPSB0aGlzLl9lZGl0b3JUeXBlLnJlYWQocmVhZGVyKSA9PT0gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuRGlmZkVkaXRvciA/IDMgOiAxO1xuXG5cdFx0XHRcdG1vZGlmaWVkTGluZUVsZW1lbnRzLmxpbmVzLmZvckVhY2goKGwsIGkpID0+IHtcblx0XHRcdFx0XHRsLnN0eWxlLndpZHRoID0gYCR7bGF5b3V0UHJvcHMubG93ZXJUZXh0LndpZHRofXB4YDtcblx0XHRcdFx0XHRsLnN0eWxlLmhlaWdodCA9IGAke2xheW91dFByb3BzLm1vZGlmaWVkTGluZUhlaWdodHNbaV19cHhgO1xuXHRcdFx0XHRcdGwuc3R5bGUucG9zaXRpb24gPSAncmVsYXRpdmUnO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBtb2RpZmllZEJvcmRlckNvbG9yID0gZ2V0TW9kaWZpZWRCb3JkZXJDb2xvcih0aGlzLl90YWJBY3Rpb24pLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxCb3JkZXJDb2xvciA9IGdldE9yaWdpbmFsQm9yZGVyQ29sb3IodGhpcy5fdGFiQWN0aW9uKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGVkaXRvckJhY2tncm91bmQgPSBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IodGhpcy5fZWRpdG9yVHlwZS5yZWFkKHJlYWRlcikpO1xuXG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdC4uLnJlY3RUb1Byb3BzKChyKSA9PiBnZXRFZGl0b3JWYWxpZE92ZXJsYXlSZWN0KHRoaXMuX2VkaXRvcikucmVhZChyKSksXG5cdFx0XHRcdFx0XHRcdG92ZXJmbG93OiAnaGlkZGVuJyxcblx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0Y2xhc3M6ICdib3JkZXJBcm91bmRMaW5lUmVwbGFjZW1lbnQnLFxuXHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHRcdC4uLnJlY3RUb1Byb3BzKHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLmJhY2tncm91bmQudHJhbnNsYXRlWCgtY29udGVudExlZnQpLndpdGhNYXJnaW4oc2VwYXJhdG9yV2lkdGgpKSxcblx0XHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblxuXHRcdFx0XHRcdFx0XHRcdGJvcmRlcjogYCR7c2VwYXJhdG9yV2lkdGggKyAxfXB4IHNvbGlkICR7ZWRpdG9yQmFja2dyb3VuZH1gLFxuXHRcdFx0XHRcdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0XHRcdGNsYXNzOiAnb3JpZ2luYWxPdmVybGF5TGluZVJlcGxhY2VtZW50Jyxcblx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5iYWNrZ3JvdW5kLnRyYW5zbGF0ZVgoLWNvbnRlbnRMZWZ0KSksXG5cdFx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cblx0XHRcdFx0XHRcdFx0XHRib3JkZXI6IGdldEVkaXRvckJsZW5kZWRDb2xvcihvcmlnaW5hbEJvcmRlckNvbG9yLCB0aGlzLl90aGVtZVNlcnZpY2UpLm1hcChjID0+IGAxcHggc29saWQgJHtjLnRvU3RyaW5nKCl9YCksXG5cdFx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ25vbmUnLFxuXHRcdFx0XHRcdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUob3JpZ2luYWxCYWNrZ3JvdW5kQ29sb3IpLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0Y2xhc3M6ICdtb2RpZmllZE92ZXJsYXlMaW5lUmVwbGFjZW1lbnQnLFxuXHRcdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHRcdC4uLnJlY3RUb1Byb3BzKHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLmxvd2VyQmFja2dyb3VuZC50cmFuc2xhdGVYKC1jb250ZW50TGVmdCkpLFxuXHRcdFx0XHRcdFx0XHRcdGJvcmRlclJhZGl1czogYDAgMCAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4ICR7SU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVN9cHhgLFxuXHRcdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0XHRcdFx0Ym94U2hhZG93OiBgJHthc0Nzc1ZhcmlhYmxlKHNjcm9sbGJhclNoYWRvdyl9IDAgNnB4IDZweCAtNnB4YCxcblx0XHRcdFx0XHRcdFx0XHRib3JkZXI6IGAxcHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKG1vZGlmaWVkQm9yZGVyQ29sb3IpfWAsXG5cdFx0XHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRcdFx0b3ZlcmZsb3c6ICdoaWRkZW4nLFxuXHRcdFx0XHRcdFx0XHRcdGN1cnNvcjogJ3BvaW50ZXInLFxuXHRcdFx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdhdXRvJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b25tb3VzZWRvd246IGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTsgLy8gVGhpcyBwcmV2ZW50cyB0aGF0IHRoZSBlZGl0b3IgbG9zZXMgZm9jdXNcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b25jbGljazogKGUpID0+IHRoaXMuX29uRGlkQ2xpY2suZmlyZShJbmxpbmVFZGl0Q2xpY2tFdmVudC5jcmVhdGUoZSkpLFxuXHRcdFx0XHRcdFx0fSwgW1xuXHRcdFx0XHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLCB0b3A6IDAsIGxlZnQ6IDAsIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0YmFja2dyb3VuZDogYXNDc3NWYXJpYWJsZShtb2RpZmllZENoYW5nZWRMaW5lQmFja2dyb3VuZENvbG9yKSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0XHRcdGNsYXNzOiAnbW9kaWZpZWRMaW5lc0xpbmVSZXBsYWNlbWVudCcsXG5cdFx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikubG93ZXJUZXh0LnRyYW5zbGF0ZVgoLWNvbnRlbnRMZWZ0KSksXG5cdFx0XHRcdFx0XHRcdFx0Zm9udEZhbWlseTogdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEZhbWlseSksXG5cdFx0XHRcdFx0XHRcdFx0Zm9udFNpemU6IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRTaXplKSxcblx0XHRcdFx0XHRcdFx0XHRmb250V2VpZ2h0OiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250V2VpZ2h0KSxcblx0XHRcdFx0XHRcdFx0XHRwb2ludGVyRXZlbnRzOiAnbm9uZScsXG5cdFx0XHRcdFx0XHRcdFx0d2hpdGVTcGFjZTogJ25vd3JhcCcsXG5cdFx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgMCAwICR7SU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVN9cHggJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdFx0XHRcdFx0b3ZlcmZsb3c6ICdoaWRkZW4nLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LCBbLi4ubW9kaWZpZWRMaW5lRWxlbWVudHMubGluZXNdKSxcblx0XHRcdFx0XHRdKVxuXHRcdFx0XHRdO1xuXHRcdFx0fSlcblx0XHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5pc0hvdmVyZWQgPSB0aGlzLl9lZGl0b3IuaXNUYXJnZXRIb3ZlcmVkKChlKSA9PiB0aGlzLl9pc01vdXNlT3ZlcldpZGdldChlKSwgdGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuX3ByZXZpb3VzVmlld1pvbmVJbmZvID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2VkaXRvci5lZGl0b3IuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHRoaXMucmVtb3ZlUHJldmlvdXNWaWV3Wm9uZShhY2Nlc3NvcikpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuRGVsdGEodGhpcy5fdmlld1pvbmVJbmZvLCAoeyBsYXN0VmFsdWUsIG5ld1ZhbHVlIH0pID0+IHtcblx0XHRcdGlmIChsYXN0VmFsdWUgPT09IG5ld1ZhbHVlIHx8IChsYXN0VmFsdWU/LmhlaWdodCA9PT0gbmV3VmFsdWU/LmhlaWdodCAmJiBsYXN0VmFsdWU/LmxpbmVOdW1iZXIgPT09IG5ld1ZhbHVlPy5saW5lTnVtYmVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lZGl0b3IuZWRpdG9yLmNoYW5nZVZpZXdab25lcygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0dGhpcy5yZW1vdmVQcmV2aW91c1ZpZXdab25lKGNoYW5nZUFjY2Vzc29yKTtcblx0XHRcdFx0aWYgKCFuZXdWYWx1ZSkgeyByZXR1cm47IH1cblx0XHRcdFx0dGhpcy5hZGRWaWV3Wm9uZShuZXdWYWx1ZSwgY2hhbmdlQWNjZXNzb3IpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLmNyZWF0ZU92ZXJsYXlXaWRnZXQoe1xuXHRcdFx0ZG9tTm9kZTogdGhpcy5fZGl2LmVsZW1lbnQsXG5cdFx0XHRtaW5Db250ZW50V2lkdGhJblB4OiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9sYXlvdXQucmVhZChyZWFkZXIpPy5taW5Db250ZW50V2lkdGhSZXF1aXJlZCA/PyAwO1xuXHRcdFx0fSksXG5cdFx0XHRwb3NpdGlvbjogY29uc3RPYnNlcnZhYmxlKHsgcHJlZmVyZW5jZTogeyB0b3A6IDAsIGxlZnQ6IDAgfSB9KSxcblx0XHRcdGFsbG93RWRpdG9yT3ZlcmZsb3c6IGZhbHNlLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzTW91c2VPdmVyV2lkZ2V0KGU6IElFZGl0b3JNb3VzZUV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fbGF5b3V0LmdldCgpO1xuXHRcdGlmICghbGF5b3V0IHx8ICEoZS5ldmVudCBpbnN0YW5jZW9mIEVkaXRvck1vdXNlRXZlbnQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxheW91dC5sb3dlckJhY2tncm91bmQuY29udGFpbnNQb2ludChuZXcgUG9pbnQoZS5ldmVudC5yZWxhdGl2ZVBvcy54LCBlLmV2ZW50LnJlbGF0aXZlUG9zLnkpKTtcblx0fVxuXG5cdC8vIFZpZXcgWm9uZXNcblx0cHJpdmF0ZSBfcHJldmlvdXNWaWV3Wm9uZUluZm86IHsgaGVpZ2h0OiBudW1iZXI7IGxpbmVOdW1iZXI6IG51bWJlcjsgaWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVtb3ZlUHJldmlvdXNWaWV3Wm9uZShjaGFuZ2VBY2Nlc3NvcjogSVZpZXdab25lQ2hhbmdlQWNjZXNzb3IpIHtcblx0XHRpZiAoIXRoaXMuX3ByZXZpb3VzVmlld1pvbmVJbmZvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y2hhbmdlQWNjZXNzb3IucmVtb3ZlWm9uZSh0aGlzLl9wcmV2aW91c1ZpZXdab25lSW5mby5pZCk7XG5cblx0XHRjb25zdCBjdXJzb3JMaW5lTnVtYmVyID0gdGhpcy5fZWRpdG9yLmN1cnNvckxpbmVOdW1iZXIuZ2V0KCk7XG5cdFx0aWYgKGN1cnNvckxpbmVOdW1iZXIgIT09IG51bGwgJiYgY3Vyc29yTGluZU51bWJlciA+PSB0aGlzLl9wcmV2aW91c1ZpZXdab25lSW5mby5saW5lTnVtYmVyKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZWRpdG9yLnNldFNjcm9sbFRvcCh0aGlzLl9lZGl0b3Iuc2Nyb2xsVG9wLmdldCgpIC0gdGhpcy5fcHJldmlvdXNWaWV3Wm9uZUluZm8uaGVpZ2h0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9wcmV2aW91c1ZpZXdab25lSW5mbyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYWRkVmlld1pvbmUodmlld1pvbmVJbmZvOiB7IGhlaWdodDogbnVtYmVyOyBsaW5lTnVtYmVyOiBudW1iZXIgfSwgY2hhbmdlQWNjZXNzb3I6IElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yKSB7XG5cdFx0Y29uc3QgYWN0aXZlVmlld1pvbmUgPSBjaGFuZ2VBY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdGFmdGVyTGluZU51bWJlcjogdmlld1pvbmVJbmZvLmxpbmVOdW1iZXIgLSAxLFxuXHRcdFx0aGVpZ2h0SW5QeDogdmlld1pvbmVJbmZvLmhlaWdodCwgLy8gbW92ZSBjb21wdXRhdGlvbiB0byBsYXlvdXQ/XG5cdFx0XHRkb21Ob2RlOiAkKCdkaXYnKSxcblx0XHR9KTtcblxuXHRcdHRoaXMuX3ByZXZpb3VzVmlld1pvbmVJbmZvID0geyBoZWlnaHQ6IHZpZXdab25lSW5mby5oZWlnaHQsIGxpbmVOdW1iZXI6IHZpZXdab25lSW5mby5saW5lTnVtYmVyLCBpZDogYWN0aXZlVmlld1pvbmUgfTtcblxuXHRcdGNvbnN0IGN1cnNvckxpbmVOdW1iZXIgPSB0aGlzLl9lZGl0b3IuY3Vyc29yTGluZU51bWJlci5nZXQoKTtcblx0XHRpZiAoY3Vyc29yTGluZU51bWJlciAhPT0gbnVsbCAmJiBjdXJzb3JMaW5lTnVtYmVyID49IHZpZXdab25lSW5mby5saW5lTnVtYmVyKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3IuZWRpdG9yLnNldFNjcm9sbFRvcCh0aGlzLl9lZGl0b3Iuc2Nyb2xsVG9wLmdldCgpICsgdmlld1pvbmVJbmZvLmhlaWdodCk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHJhbmdlc1RvQnViYmxlUmFuZ2VzKHJhbmdlczogUmFuZ2VbXSk6IFJhbmdlW10ge1xuXHRjb25zdCByZXN1bHQ6IFJhbmdlW10gPSBbXTtcblx0d2hpbGUgKHJhbmdlcy5sZW5ndGgpIHtcblx0XHRsZXQgcmFuZ2UgPSByYW5nZXMuc2hpZnQoKSE7XG5cdFx0aWYgKHJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmFuZ2VzLnB1c2gobmV3IFJhbmdlKHJhbmdlLnN0YXJ0TGluZU51bWJlciArIDEsIDEsIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbikpO1xuXHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUik7IC8vIFRPRE86IHRoaXMgaXMgbm90IGNvcnJlY3Rcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaChyYW5nZSk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlcGxhY2VtZW50IHtcblx0b3JpZ2luYWxSYW5nZTogUmFuZ2U7XG5cdG1vZGlmaWVkUmFuZ2U6IFJhbmdlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLGNBQWMsaUJBQWlCLGVBQTRCO0FBQ3BFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsWUFBWSxhQUFhLHFCQUFxQjtBQUN2RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsYUFBYTtBQUV0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFlBQVksa0JBQWtCO0FBQ3ZDLFNBQVMsa0JBQWtCLDRCQUE0QjtBQUN2RCxTQUFTLGtDQUFrQztBQUMzQyxTQUEyQiw0QkFB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
