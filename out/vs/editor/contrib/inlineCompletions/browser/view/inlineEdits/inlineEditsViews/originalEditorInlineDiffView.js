import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { autorunWithStore, derived, observableFromEvent } from "../../../../../../../base/common/observable.js";
import { MouseTargetType } from "../../../../../../browser/editorBrowser.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { rangeIsSingleLine } from "../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/diffEditorViewZones.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { Range } from "../../../../../../common/core/range.js";
import { EndOfLinePreference, InjectedTextCursorStops } from "../../../../../../common/model.js";
import { ModelDecorationOptions } from "../../../../../../common/model/textModel.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { classNames } from "../utils/utils.js";
import { InlineCompletionEditorType } from "../../../model/provideInlineCompletions.js";
class OriginalEditorInlineDiffView extends Disposable {
  constructor(_originalEditor, _state, _modifiedTextModel) {
    super();
    this._originalEditor = _originalEditor;
    this._state = _state;
    this._modifiedTextModel = _modifiedTextModel;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this.isHovered = observableCodeEditor(this._originalEditor).isTargetHovered(
      (p) => p.target.type === MouseTargetType.CONTENT_TEXT && p.target.detail.injectedText?.options.attachedData instanceof InlineEditAttachedData && p.target.detail.injectedText.options.attachedData.owner === this,
      this._store
    );
    this._tokenizationFinished = modelTokenizationFinished(this._modifiedTextModel);
    this._decorations = derived(this, (reader) => {
      const diff = this._state.read(reader);
      if (!diff) {
        return void 0;
      }
      const modified = diff.modifiedText;
      const showInline = diff.mode === "insertionInline";
      const hasOneInnerChange = diff.diff.length === 1 && diff.diff[0].innerChanges?.length === 1;
      const showEmptyDecorations = true;
      const originalDecorations = [];
      const modifiedDecorations = [];
      const diffLineAddDecorationBackground = ModelDecorationOptions.register({
        className: "inlineCompletions-line-insert",
        description: "line-insert",
        isWholeLine: true,
        marginClassName: "gutter-insert"
      });
      const diffLineDeleteDecorationBackground = ModelDecorationOptions.register({
        className: "inlineCompletions-line-delete",
        description: "line-delete",
        isWholeLine: true,
        marginClassName: "gutter-delete"
      });
      const diffWholeLineDeleteDecoration = ModelDecorationOptions.register({
        className: "inlineCompletions-char-delete",
        description: "char-delete",
        isWholeLine: false,
        zIndex: 1
        // be on top of diff background decoration
      });
      const diffWholeLineAddDecoration = ModelDecorationOptions.register({
        className: "inlineCompletions-char-insert",
        description: "char-insert",
        isWholeLine: true
      });
      const diffAddDecoration = ModelDecorationOptions.register({
        className: "inlineCompletions-char-insert",
        description: "char-insert",
        shouldFillLineOnLineBreak: true
      });
      const diffAddDecorationEmpty = ModelDecorationOptions.register({
        className: "inlineCompletions-char-insert diff-range-empty",
        description: "char-insert diff-range-empty"
      });
      const NESOriginalBackground = ModelDecorationOptions.register({
        className: "inlineCompletions-original-lines",
        description: "inlineCompletions-original-lines",
        isWholeLine: false,
        shouldFillLineOnLineBreak: true
      });
      const showFullLineDecorations = diff.mode !== "sideBySide" && diff.mode !== "deletion" && diff.mode !== "insertionInline" && diff.mode !== "lineReplacement";
      const hideEmptyInnerDecorations = diff.mode === "lineReplacement";
      for (const m of diff.diff) {
        if (showFullLineDecorations) {
          if (!m.original.isEmpty) {
            originalDecorations.push({
              range: m.original.toInclusiveRange(),
              options: diffLineDeleteDecorationBackground
            });
          }
          if (!m.modified.isEmpty) {
            modifiedDecorations.push({
              range: m.modified.toInclusiveRange(),
              options: diffLineAddDecorationBackground
            });
          }
        }
        if (m.modified.isEmpty || m.original.isEmpty) {
          if (!m.original.isEmpty) {
            originalDecorations.push({ range: m.original.toInclusiveRange(), options: diffWholeLineDeleteDecoration });
          }
          if (!m.modified.isEmpty) {
            modifiedDecorations.push({ range: m.modified.toInclusiveRange(), options: diffWholeLineAddDecoration });
          }
        } else {
          const useInlineDiff = showInline && allowsTrueInlineDiffRendering(m);
          for (const i2 of m.innerChanges || []) {
            if (m.original.contains(i2.originalRange.startLineNumber) && !(hideEmptyInnerDecorations && i2.originalRange.isEmpty())) {
              const replacedText = this._originalEditor.getModel()?.getValueInRange(i2.originalRange, EndOfLinePreference.LF);
              originalDecorations.push({
                range: i2.originalRange,
                options: {
                  description: "char-delete",
                  shouldFillLineOnLineBreak: false,
                  className: classNames(
                    "inlineCompletions-char-delete",
                    i2.originalRange.isSingleLine() && diff.mode === "insertionInline" && "single-line-inline",
                    i2.originalRange.isEmpty() && "empty",
                    (i2.originalRange.isEmpty() && hasOneInnerChange || diff.mode === "deletion" && replacedText === "\n") && showEmptyDecorations && !useInlineDiff && "diff-range-empty"
                  ),
                  inlineClassName: useInlineDiff ? classNames("strike-through", "inlineCompletions") : null,
                  zIndex: 1
                }
              });
            }
            if (m.modified.contains(i2.modifiedRange.startLineNumber)) {
              modifiedDecorations.push({
                range: i2.modifiedRange,
                options: i2.modifiedRange.isEmpty() && showEmptyDecorations && !useInlineDiff && hasOneInnerChange ? diffAddDecorationEmpty : diffAddDecoration
              });
            }
            if (useInlineDiff) {
              const insertedText = modified.getValueOfRange(i2.modifiedRange);
              const textSegments = insertedText.length > 3 ? [
                { text: insertedText.slice(0, 1), extraClasses: ["start"], offsetRange: new OffsetRange(i2.modifiedRange.startColumn - 1, i2.modifiedRange.startColumn) },
                { text: insertedText.slice(1, -1), extraClasses: [], offsetRange: new OffsetRange(i2.modifiedRange.startColumn, i2.modifiedRange.endColumn - 2) },
                { text: insertedText.slice(-1), extraClasses: ["end"], offsetRange: new OffsetRange(i2.modifiedRange.endColumn - 2, i2.modifiedRange.endColumn - 1) }
              ] : [
                { text: insertedText, extraClasses: ["start", "end"], offsetRange: new OffsetRange(i2.modifiedRange.startColumn - 1, i2.modifiedRange.endColumn) }
              ];
              this._tokenizationFinished.read(reader);
              const lineTokens = this._modifiedTextModel.tokenization.getLineTokens(i2.modifiedRange.startLineNumber);
              for (const { text, extraClasses, offsetRange } of textSegments) {
                originalDecorations.push({
                  range: Range.fromPositions(i2.originalRange.getEndPosition()),
                  options: {
                    description: "inserted-text",
                    before: {
                      tokens: lineTokens.getTokensInRange(offsetRange),
                      content: text,
                      inlineClassName: classNames(
                        "inlineCompletions-char-insert",
                        i2.modifiedRange.isSingleLine() && diff.mode === "insertionInline" && "single-line-inline",
                        ...extraClasses
                        // include extraClasses for additional styling if provided
                      ),
                      cursorStops: InjectedTextCursorStops.None,
                      attachedData: new InlineEditAttachedData(this)
                    },
                    zIndex: 2,
                    showIfCollapsed: true
                  }
                });
              }
            }
          }
        }
      }
      if (diff.editorType === InlineCompletionEditorType.DiffEditor) {
        for (const m of diff.diff) {
          if (!m.original.isEmpty) {
            originalDecorations.push({
              range: m.original.toExclusiveRange(),
              options: NESOriginalBackground
            });
          }
        }
      }
      return { originalDecorations, modifiedDecorations };
    });
    this._register(observableCodeEditor(this._originalEditor).setDecorations(this._decorations.map((d) => d?.originalDecorations ?? [])));
    const modifiedCodeEditor = this._state.map((s) => s?.modifiedCodeEditor);
    this._register(autorunWithStore((reader, store) => {
      const e = modifiedCodeEditor.read(reader);
      if (e) {
        store.add(observableCodeEditor(e).setDecorations(this._decorations.map((d) => d?.modifiedDecorations ?? [])));
      }
    }));
    this._register(this._originalEditor.onMouseUp((e) => {
      if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
        return;
      }
      const a = e.target.detail.injectedText?.options.attachedData;
      if (a instanceof InlineEditAttachedData && a.owner === this) {
        this._onDidClick.fire(new InlineEditClickEvent(e.event));
      }
    }));
  }
  static supportsInlineDiffRendering(mapping) {
    return allowsTrueInlineDiffRendering(mapping);
  }
}
class InlineEditAttachedData {
  constructor(owner) {
    this.owner = owner;
  }
}
function allowsTrueInlineDiffRendering(mapping) {
  if (!mapping.innerChanges) {
    return false;
  }
  return mapping.innerChanges.every((c) => rangeIsSingleLine(c.modifiedRange) && rangeIsSingleLine(c.originalRange));
}
let i = 0;
function modelTokenizationFinished(model) {
  return observableFromEvent(model.onDidChangeTokens, () => i++);
}
export {
  OriginalEditorInlineDiffView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL29yaWdpbmFsRWRpdG9ySW5saW5lRGlmZlZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuV2l0aFN0b3JlLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgcmFuZ2VJc1NpbmdsZUxpbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9kaWZmRWRpdG9yVmlld1pvbmVzLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dC9hYnN0cmFjdFRleHQuanMnO1xuaW1wb3J0IHsgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUlubGluZUVkaXRzVmlldywgSW5saW5lRWRpdENsaWNrRXZlbnQgfSBmcm9tICcuLi9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgY2xhc3NOYW1lcyB9IGZyb20gJy4uL3V0aWxzL3V0aWxzLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlIH0gZnJvbSAnLi4vLi4vLi4vbW9kZWwvcHJvdmlkZUlubGluZUNvbXBsZXRpb25zLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJT3JpZ2luYWxFZGl0b3JJbmxpbmVEaWZmVmlld1N0YXRlIHtcblx0ZGlmZjogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW107XG5cdG1vZGlmaWVkVGV4dDogQWJzdHJhY3RUZXh0O1xuXHRtb2RlOiAnaW5zZXJ0aW9uSW5saW5lJyB8ICdzaWRlQnlTaWRlJyB8ICdkZWxldGlvbicgfCAnbGluZVJlcGxhY2VtZW50Jztcblx0ZWRpdG9yVHlwZTogSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGU7XG5cblx0bW9kaWZpZWRDb2RlRWRpdG9yOiBJQ29kZUVkaXRvcjtcbn1cblxuZXhwb3J0IGNsYXNzIE9yaWdpbmFsRWRpdG9ySW5saW5lRGlmZlZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUlubGluZUVkaXRzVmlldyB7XG5cdHB1YmxpYyBzdGF0aWMgc3VwcG9ydHNJbmxpbmVEaWZmUmVuZGVyaW5nKG1hcHBpbmc6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBhbGxvd3NUcnVlSW5saW5lRGlmZlJlbmRlcmluZyhtYXBwaW5nKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJbmxpbmVFZGl0Q2xpY2tFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2sgPSB0aGlzLl9vbkRpZENsaWNrLmV2ZW50O1xuXG5cdHJlYWRvbmx5IGlzSG92ZXJlZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90b2tlbml6YXRpb25GaW5pc2hlZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbEVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGU6IElPYnNlcnZhYmxlPElPcmlnaW5hbEVkaXRvcklubGluZURpZmZWaWV3U3RhdGUgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkVGV4dE1vZGVsOiBJVGV4dE1vZGVsLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuaXNIb3ZlcmVkID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fb3JpZ2luYWxFZGl0b3IpLmlzVGFyZ2V0SG92ZXJlZChcblx0XHRcdHAgPT4gcC50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCAmJlxuXHRcdFx0XHRwLnRhcmdldC5kZXRhaWwuaW5qZWN0ZWRUZXh0Py5vcHRpb25zLmF0dGFjaGVkRGF0YSBpbnN0YW5jZW9mIElubGluZUVkaXRBdHRhY2hlZERhdGEgJiZcblx0XHRcdFx0cC50YXJnZXQuZGV0YWlsLmluamVjdGVkVGV4dC5vcHRpb25zLmF0dGFjaGVkRGF0YS5vd25lciA9PT0gdGhpcyxcblx0XHRcdHRoaXMuX3N0b3JlXG5cdFx0KTtcblx0XHR0aGlzLl90b2tlbml6YXRpb25GaW5pc2hlZCA9IG1vZGVsVG9rZW5pemF0aW9uRmluaXNoZWQodGhpcy5fbW9kaWZpZWRUZXh0TW9kZWwpO1xuXHRcdHRoaXMuX2RlY29yYXRpb25zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghZGlmZikgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkID0gZGlmZi5tb2RpZmllZFRleHQ7XG5cdFx0XHRjb25zdCBzaG93SW5saW5lID0gZGlmZi5tb2RlID09PSAnaW5zZXJ0aW9uSW5saW5lJztcblx0XHRcdGNvbnN0IGhhc09uZUlubmVyQ2hhbmdlID0gZGlmZi5kaWZmLmxlbmd0aCA9PT0gMSAmJiBkaWZmLmRpZmZbMF0uaW5uZXJDaGFuZ2VzPy5sZW5ndGggPT09IDE7XG5cblx0XHRcdGNvbnN0IHNob3dFbXB0eURlY29yYXRpb25zID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IG1vZGlmaWVkRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cblx0XHRcdGNvbnN0IGRpZmZMaW5lQWRkRGVjb3JhdGlvbkJhY2tncm91bmQgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRcdFx0Y2xhc3NOYW1lOiAnaW5saW5lQ29tcGxldGlvbnMtbGluZS1pbnNlcnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2xpbmUtaW5zZXJ0Jyxcblx0XHRcdFx0aXNXaG9sZUxpbmU6IHRydWUsXG5cdFx0XHRcdG1hcmdpbkNsYXNzTmFtZTogJ2d1dHRlci1pbnNlcnQnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGRpZmZMaW5lRGVsZXRlRGVjb3JhdGlvbkJhY2tncm91bmQgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRcdFx0Y2xhc3NOYW1lOiAnaW5saW5lQ29tcGxldGlvbnMtbGluZS1kZWxldGUnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2xpbmUtZGVsZXRlJyxcblx0XHRcdFx0aXNXaG9sZUxpbmU6IHRydWUsXG5cdFx0XHRcdG1hcmdpbkNsYXNzTmFtZTogJ2d1dHRlci1kZWxldGUnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGRpZmZXaG9sZUxpbmVEZWxldGVEZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0XHRcdGNsYXNzTmFtZTogJ2lubGluZUNvbXBsZXRpb25zLWNoYXItZGVsZXRlJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdjaGFyLWRlbGV0ZScsXG5cdFx0XHRcdGlzV2hvbGVMaW5lOiBmYWxzZSxcblx0XHRcdFx0ekluZGV4OiAxLCAvLyBiZSBvbiB0b3Agb2YgZGlmZiBiYWNrZ3JvdW5kIGRlY29yYXRpb25cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBkaWZmV2hvbGVMaW5lQWRkRGVjb3JhdGlvbiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdFx0XHRjbGFzc05hbWU6ICdpbmxpbmVDb21wbGV0aW9ucy1jaGFyLWluc2VydCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhci1pbnNlcnQnLFxuXHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBkaWZmQWRkRGVjb3JhdGlvbiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdFx0XHRjbGFzc05hbWU6ICdpbmxpbmVDb21wbGV0aW9ucy1jaGFyLWluc2VydCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhci1pbnNlcnQnLFxuXHRcdFx0XHRzaG91bGRGaWxsTGluZU9uTGluZUJyZWFrOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGRpZmZBZGREZWNvcmF0aW9uRW1wdHkgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRcdFx0Y2xhc3NOYW1lOiAnaW5saW5lQ29tcGxldGlvbnMtY2hhci1pbnNlcnQgZGlmZi1yYW5nZS1lbXB0eScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnY2hhci1pbnNlcnQgZGlmZi1yYW5nZS1lbXB0eScsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgTkVTT3JpZ2luYWxCYWNrZ3JvdW5kID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0XHRcdGNsYXNzTmFtZTogJ2lubGluZUNvbXBsZXRpb25zLW9yaWdpbmFsLWxpbmVzJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdpbmxpbmVDb21wbGV0aW9ucy1vcmlnaW5hbC1saW5lcycsXG5cdFx0XHRcdGlzV2hvbGVMaW5lOiBmYWxzZSxcblx0XHRcdFx0c2hvdWxkRmlsbExpbmVPbkxpbmVCcmVhazogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzaG93RnVsbExpbmVEZWNvcmF0aW9ucyA9IGRpZmYubW9kZSAhPT0gJ3NpZGVCeVNpZGUnICYmIGRpZmYubW9kZSAhPT0gJ2RlbGV0aW9uJyAmJiBkaWZmLm1vZGUgIT09ICdpbnNlcnRpb25JbmxpbmUnICYmIGRpZmYubW9kZSAhPT0gJ2xpbmVSZXBsYWNlbWVudCc7XG5cdFx0XHRjb25zdCBoaWRlRW1wdHlJbm5lckRlY29yYXRpb25zID0gZGlmZi5tb2RlID09PSAnbGluZVJlcGxhY2VtZW50Jztcblx0XHRcdGZvciAoY29uc3QgbSBvZiBkaWZmLmRpZmYpIHtcblx0XHRcdFx0aWYgKHNob3dGdWxsTGluZURlY29yYXRpb25zKSB7XG5cdFx0XHRcdFx0aWYgKCFtLm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBtLm9yaWdpbmFsLnRvSW5jbHVzaXZlUmFuZ2UoKSEsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IGRpZmZMaW5lRGVsZXRlRGVjb3JhdGlvbkJhY2tncm91bmQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFtLm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBtLm1vZGlmaWVkLnRvSW5jbHVzaXZlUmFuZ2UoKSEsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IGRpZmZMaW5lQWRkRGVjb3JhdGlvbkJhY2tncm91bmQsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobS5tb2RpZmllZC5pc0VtcHR5IHx8IG0ub3JpZ2luYWwuaXNFbXB0eSkge1xuXHRcdFx0XHRcdGlmICghbS5vcmlnaW5hbC5pc0VtcHR5KSB7XG5cdFx0XHRcdFx0XHRvcmlnaW5hbERlY29yYXRpb25zLnB1c2goeyByYW5nZTogbS5vcmlnaW5hbC50b0luY2x1c2l2ZVJhbmdlKCkhLCBvcHRpb25zOiBkaWZmV2hvbGVMaW5lRGVsZXRlRGVjb3JhdGlvbiB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFtLm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdG1vZGlmaWVkRGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBtLm1vZGlmaWVkLnRvSW5jbHVzaXZlUmFuZ2UoKSEsIG9wdGlvbnM6IGRpZmZXaG9sZUxpbmVBZGREZWNvcmF0aW9uIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCB1c2VJbmxpbmVEaWZmID0gc2hvd0lubGluZSAmJiBhbGxvd3NUcnVlSW5saW5lRGlmZlJlbmRlcmluZyhtKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGkgb2YgbS5pbm5lckNoYW5nZXMgfHwgW10pIHtcblx0XHRcdFx0XHRcdC8vIERvbid0IHNob3cgZW1wdHkgbWFya2VycyBvdXRzaWRlIHRoZSBsaW5lIHJhbmdlXG5cdFx0XHRcdFx0XHRpZiAobS5vcmlnaW5hbC5jb250YWlucyhpLm9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSAmJiAhKGhpZGVFbXB0eUlubmVyRGVjb3JhdGlvbnMgJiYgaS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVwbGFjZWRUZXh0ID0gdGhpcy5fb3JpZ2luYWxFZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0VmFsdWVJblJhbmdlKGkub3JpZ2luYWxSYW5nZSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRik7XG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IGkub3JpZ2luYWxSYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2NoYXItZGVsZXRlJyxcblx0XHRcdFx0XHRcdFx0XHRcdHNob3VsZEZpbGxMaW5lT25MaW5lQnJlYWs6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiBjbGFzc05hbWVzKFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQnaW5saW5lQ29tcGxldGlvbnMtY2hhci1kZWxldGUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRpLm9yaWdpbmFsUmFuZ2UuaXNTaW5nbGVMaW5lKCkgJiYgZGlmZi5tb2RlID09PSAnaW5zZXJ0aW9uSW5saW5lJyAmJiAnc2luZ2xlLWxpbmUtaW5saW5lJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0aS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSAmJiAnZW1wdHknLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQoKGkub3JpZ2luYWxSYW5nZS5pc0VtcHR5KCkgJiYgaGFzT25lSW5uZXJDaGFuZ2UgfHwgZGlmZi5tb2RlID09PSAnZGVsZXRpb24nICYmIHJlcGxhY2VkVGV4dCA9PT0gJ1xcbicpICYmIHNob3dFbXB0eURlY29yYXRpb25zICYmICF1c2VJbmxpbmVEaWZmKSAmJiAnZGlmZi1yYW5nZS1lbXB0eSdcblx0XHRcdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6IHVzZUlubGluZURpZmYgPyBjbGFzc05hbWVzKCdzdHJpa2UtdGhyb3VnaCcsICdpbmxpbmVDb21wbGV0aW9ucycpIDogbnVsbCxcblx0XHRcdFx0XHRcdFx0XHRcdHpJbmRleDogMVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobS5tb2RpZmllZC5jb250YWlucyhpLm1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdFx0XHRtb2RpZmllZERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHJhbmdlOiBpLm1vZGlmaWVkUmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0b3B0aW9uczogKGkubW9kaWZpZWRSYW5nZS5pc0VtcHR5KCkgJiYgc2hvd0VtcHR5RGVjb3JhdGlvbnMgJiYgIXVzZUlubGluZURpZmYgJiYgaGFzT25lSW5uZXJDaGFuZ2UpXG5cdFx0XHRcdFx0XHRcdFx0XHQ/IGRpZmZBZGREZWNvcmF0aW9uRW1wdHlcblx0XHRcdFx0XHRcdFx0XHRcdDogZGlmZkFkZERlY29yYXRpb25cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodXNlSW5saW5lRGlmZikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpbnNlcnRlZFRleHQgPSBtb2RpZmllZC5nZXRWYWx1ZU9mUmFuZ2UoaS5tb2RpZmllZFJhbmdlKTtcblx0XHRcdFx0XHRcdFx0Ly8gd2hlbiB0aGUgaW5qZWN0ZWQgdGV4dCBiZWNvbWVzIGxvbmcsIHRoZSBlZGl0b3Igd2lsbCBzcGxpdCBpdCBpbnRvIG11bHRpcGxlIHNwYW5zXG5cdFx0XHRcdFx0XHRcdC8vIHRvIGJlIGFibGUgdG8gZ2V0IHRoZSBib3JkZXIgYXJvdW5kIHRoZSBzdGFydCBhbmQgZW5kIG9mIHRoZSB0ZXh0LCB3ZSBuZWVkIHRvIHNwbGl0IGl0IGludG8gbXVsdGlwbGUgc2VnbWVudHNcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGV4dFNlZ21lbnRzID0gaW5zZXJ0ZWRUZXh0Lmxlbmd0aCA+IDMgP1xuXHRcdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdGV4dDogaW5zZXJ0ZWRUZXh0LnNsaWNlKDAsIDEpLCBleHRyYUNsYXNzZXM6IFsnc3RhcnQnXSwgb2Zmc2V0UmFuZ2U6IG5ldyBPZmZzZXRSYW5nZShpLm1vZGlmaWVkUmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBpLm1vZGlmaWVkUmFuZ2Uuc3RhcnRDb2x1bW4pIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHRleHQ6IGluc2VydGVkVGV4dC5zbGljZSgxLCAtMSksIGV4dHJhQ2xhc3NlczogW10sIG9mZnNldFJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2UoaS5tb2RpZmllZFJhbmdlLnN0YXJ0Q29sdW1uLCBpLm1vZGlmaWVkUmFuZ2UuZW5kQ29sdW1uIC0gMikgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgdGV4dDogaW5zZXJ0ZWRUZXh0LnNsaWNlKC0xKSwgZXh0cmFDbGFzc2VzOiBbJ2VuZCddLCBvZmZzZXRSYW5nZTogbmV3IE9mZnNldFJhbmdlKGkubW9kaWZpZWRSYW5nZS5lbmRDb2x1bW4gLSAyLCBpLm1vZGlmaWVkUmFuZ2UuZW5kQ29sdW1uIC0gMSkgfVxuXHRcdFx0XHRcdFx0XHRcdF0gOlxuXHRcdFx0XHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdGV4dDogaW5zZXJ0ZWRUZXh0LCBleHRyYUNsYXNzZXM6IFsnc3RhcnQnLCAnZW5kJ10sIG9mZnNldFJhbmdlOiBuZXcgT2Zmc2V0UmFuZ2UoaS5tb2RpZmllZFJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgaS5tb2RpZmllZFJhbmdlLmVuZENvbHVtbikgfVxuXHRcdFx0XHRcdFx0XHRcdF07XG5cblx0XHRcdFx0XHRcdFx0Ly8gVG9rZW5pemF0aW9uXG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rva2VuaXphdGlvbkZpbmlzaGVkLnJlYWQocmVhZGVyKTsgLy8gcmVjb25zaWRlciB3aGVuIHRva2VuaXphdGlvbiBpcyBmaW5pc2hlZFxuXHRcdFx0XHRcdFx0XHRjb25zdCBsaW5lVG9rZW5zID0gdGhpcy5fbW9kaWZpZWRUZXh0TW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMoaS5tb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlcik7XG5cblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCB7IHRleHQsIGV4dHJhQ2xhc3Nlcywgb2Zmc2V0UmFuZ2UgfSBvZiB0ZXh0U2VnbWVudHMpIHtcblx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnMoaS5vcmlnaW5hbFJhbmdlLmdldEVuZFBvc2l0aW9uKCkpLFxuXHRcdFx0XHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2luc2VydGVkLXRleHQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRiZWZvcmU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0b2tlbnM6IGxpbmVUb2tlbnMuZ2V0VG9rZW5zSW5SYW5nZShvZmZzZXRSYW5nZSksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y29udGVudDogdGV4dCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6IGNsYXNzTmFtZXMoXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnaW5saW5lQ29tcGxldGlvbnMtY2hhci1pbnNlcnQnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0aS5tb2RpZmllZFJhbmdlLmlzU2luZ2xlTGluZSgpICYmIGRpZmYubW9kZSA9PT0gJ2luc2VydGlvbklubGluZScgJiYgJ3NpbmdsZS1saW5lLWlubGluZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQuLi5leHRyYUNsYXNzZXMgLy8gaW5jbHVkZSBleHRyYUNsYXNzZXMgZm9yIGFkZGl0aW9uYWwgc3R5bGluZyBpZiBwcm92aWRlZFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y3Vyc29yU3RvcHM6IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLk5vbmUsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0YXR0YWNoZWREYXRhOiBuZXcgSW5saW5lRWRpdEF0dGFjaGVkRGF0YSh0aGlzKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ekluZGV4OiAyLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGRpZmYuZWRpdG9yVHlwZSA9PT0gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuRGlmZkVkaXRvcikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG0gb2YgZGlmZi5kaWZmKSB7XG5cdFx0XHRcdFx0aWYgKCFtLm9yaWdpbmFsLmlzRW1wdHkpIHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlOiBtLm9yaWdpbmFsLnRvRXhjbHVzaXZlUmFuZ2UoKSxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogTkVTT3JpZ2luYWxCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IG9yaWdpbmFsRGVjb3JhdGlvbnMsIG1vZGlmaWVkRGVjb3JhdGlvbnMgfTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX29yaWdpbmFsRWRpdG9yKS5zZXREZWNvcmF0aW9ucyh0aGlzLl9kZWNvcmF0aW9ucy5tYXAoZCA9PiBkPy5vcmlnaW5hbERlY29yYXRpb25zID8/IFtdKSkpO1xuXG5cdFx0Y29uc3QgbW9kaWZpZWRDb2RlRWRpdG9yID0gdGhpcy5fc3RhdGUubWFwKHMgPT4gcz8ubW9kaWZpZWRDb2RlRWRpdG9yKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuV2l0aFN0b3JlKChyZWFkZXIsIHN0b3JlKSA9PiB7XG5cdFx0XHRjb25zdCBlID0gbW9kaWZpZWRDb2RlRWRpdG9yLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChlKSB7XG5cdFx0XHRcdHN0b3JlLmFkZChvYnNlcnZhYmxlQ29kZUVkaXRvcihlKS5zZXREZWNvcmF0aW9ucyh0aGlzLl9kZWNvcmF0aW9ucy5tYXAoZCA9PiBkPy5tb2RpZmllZERlY29yYXRpb25zID8/IFtdKSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX29yaWdpbmFsRWRpdG9yLm9uTW91c2VVcChlID0+IHtcblx0XHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGEgPSBlLnRhcmdldC5kZXRhaWwuaW5qZWN0ZWRUZXh0Py5vcHRpb25zLmF0dGFjaGVkRGF0YTtcblx0XHRcdGlmIChhIGluc3RhbmNlb2YgSW5saW5lRWRpdEF0dGFjaGVkRGF0YSAmJiBhLm93bmVyID09PSB0aGlzKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZShuZXcgSW5saW5lRWRpdENsaWNrRXZlbnQoZS5ldmVudCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zO1xufVxuXG5jbGFzcyBJbmxpbmVFZGl0QXR0YWNoZWREYXRhIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IG93bmVyOiBPcmlnaW5hbEVkaXRvcklubGluZURpZmZWaWV3KSB7IH1cbn1cblxuZnVuY3Rpb24gYWxsb3dzVHJ1ZUlubGluZURpZmZSZW5kZXJpbmcobWFwcGluZzogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKTogYm9vbGVhbiB7XG5cdGlmICghbWFwcGluZy5pbm5lckNoYW5nZXMpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cmV0dXJuIG1hcHBpbmcuaW5uZXJDaGFuZ2VzLmV2ZXJ5KGMgPT5cblx0XHQocmFuZ2VJc1NpbmdsZUxpbmUoYy5tb2RpZmllZFJhbmdlKSAmJiByYW5nZUlzU2luZ2xlTGluZShjLm9yaWdpbmFsUmFuZ2UpKSk7XG59XG5cbmxldCBpID0gMDtcbmZ1bmN0aW9uIG1vZGVsVG9rZW5pemF0aW9uRmluaXNoZWQobW9kZWw6IElUZXh0TW9kZWwpOiBJT2JzZXJ2YWJsZTxudW1iZXI+IHtcblx0cmV0dXJuIG9ic2VydmFibGVGcm9tRXZlbnQobW9kZWwub25EaWRDaGFuZ2VUb2tlbnMsICgpID0+IGkrKyk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0IsU0FBc0IsMkJBQTJCO0FBQzVFLFNBQXNCLHVCQUF1QjtBQUM3QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFHdEIsU0FBUyxxQkFBNEMsK0JBQTJDO0FBQ2hHLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQTJCLDRCQUE0QjtBQUN2RCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtDQUFrQztBQVdwQyxNQUFNLHFDQUFxQyxXQUF1QztBQUFBLEVBWXhGLFlBQ2tCLGlCQUNBLFFBQ0Esb0JBQ2hCO0FBQ0QsVUFBTTtBQUpXO0FBQ0E7QUFDQTtBQVZsQixTQUFpQixjQUFjLEtBQUssVUFBVSxJQUFJLFFBQThCLENBQUM7QUFDakYsU0FBUyxhQUFhLEtBQUssWUFBWTtBQVl0QyxTQUFLLFlBQVkscUJBQXFCLEtBQUssZUFBZSxFQUFFO0FBQUEsTUFDM0QsT0FBSyxFQUFFLE9BQU8sU0FBUyxnQkFBZ0IsZ0JBQ3RDLEVBQUUsT0FBTyxPQUFPLGNBQWMsUUFBUSx3QkFBd0IsMEJBQzlELEVBQUUsT0FBTyxPQUFPLGFBQWEsUUFBUSxhQUFhLFVBQVU7QUFBQSxNQUM3RCxLQUFLO0FBQUEsSUFDTjtBQUNBLFNBQUssd0JBQXdCLDBC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
