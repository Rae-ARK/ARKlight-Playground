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
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorunWithStore, derived, observableFromEvent } from "../../../../../../base/common/observable.js";
import { ThrottledDelayer } from "../../../../../../base/common/async.js";
import { IEditorWorkerService } from "../../../../../../editor/common/services/editorWorker.js";
import { EditorOption } from "../../../../../../editor/common/config/editorOptions.js";
import { themeColorFromId } from "../../../../../../base/common/themables.js";
import { RenderOptions, LineSource, renderLines } from "../../../../../../editor/browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { diffAddDecoration, diffWholeLineAddDecoration, diffDeleteDecoration } from "../../../../../../editor/browser/widget/diffEditor/registrations.contribution.js";
import { TrackedRangeStickiness, MinimapPosition, OverviewRulerLane } from "../../../../../../editor/common/model.js";
import { ModelDecorationOptions } from "../../../../../../editor/common/model/textModel.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { minimapGutterAddedBackground, minimapGutterDeletedBackground, minimapGutterModifiedBackground, overviewRulerAddedForeground, overviewRulerDeletedForeground, overviewRulerModifiedForeground } from "../../../../scm/common/quickDiff.js";
import { INotebookOriginalCellModelFactory } from "./notebookOriginalCellModelFactory.js";
import { InlineDecoration, InlineDecorationType } from "../../../../../../editor/common/viewModel/inlineDecorations.js";
let NotebookCellDiffDecorator = class extends DisposableStore {
  constructor(notebookEditor, modifiedCell, originalCell, editor, _editorWorkerService, originalCellModelFactory) {
    super();
    this.modifiedCell = modifiedCell;
    this.originalCell = originalCell;
    this.editor = editor;
    this._editorWorkerService = _editorWorkerService;
    this.originalCellModelFactory = originalCellModelFactory;
    this._viewZones = [];
    this.throttledDecorator = this.add(new ThrottledDelayer(50));
    this.perEditorDisposables = this.add(new DisposableStore());
    const onDidChangeVisibleRanges = observableFromEvent(notebookEditor.onDidChangeVisibleRanges, () => notebookEditor.visibleRanges);
    const editorObs = derived((r) => {
      const visibleRanges = onDidChangeVisibleRanges.read(r);
      const visibleCellHandles = visibleRanges.map((range) => notebookEditor.getCellsInRange(range)).flat().map((c) => c.handle);
      if (!visibleCellHandles.includes(modifiedCell.handle)) {
        return;
      }
      const editor2 = notebookEditor.codeEditors.find((item) => item[0].handle === modifiedCell.handle)?.[1];
      if (editor2?.getModel() !== this.modifiedCell.textModel) {
        return;
      }
      return editor2;
    });
    this.add(autorunWithStore((r, store) => {
      const editor2 = editorObs.read(r);
      this.perEditorDisposables.clear();
      if (editor2) {
        store.add(editor2.onDidChangeModel(() => {
          this.perEditorDisposables.clear();
        }));
        store.add(editor2.onDidChangeModelContent(() => {
          this.update(editor2);
        }));
        store.add(editor2.onDidChangeConfiguration((e) => {
          if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)) {
            this.update(editor2);
          }
        }));
        this.update(editor2);
      }
    }));
  }
  update(editor) {
    this.throttledDecorator.trigger(() => this._updateImpl(editor));
  }
  async _updateImpl(editor) {
    if (this.isDisposed) {
      return;
    }
    if (editor.getOption(EditorOption.inDiffEditor)) {
      this.perEditorDisposables.clear();
      return;
    }
    const model = editor.getModel();
    if (!model || model !== this.modifiedCell.textModel) {
      this.perEditorDisposables.clear();
      return;
    }
    const originalModel = this.getOrCreateOriginalModel(editor);
    if (!originalModel) {
      this.perEditorDisposables.clear();
      return;
    }
    const version = model.getVersionId();
    const diff = await this._editorWorkerService.computeDiff(
      originalModel.uri,
      model.uri,
      { computeMoves: true, ignoreTrimWhitespace: false, maxComputationTimeMs: Number.MAX_SAFE_INTEGER },
      "advanced"
    );
    if (this.isDisposed) {
      return;
    }
    if (diff && !diff.identical && this.modifiedCell.textModel && originalModel && model === editor.getModel() && editor.getModel()?.getVersionId() === version) {
      this._updateWithDiff(editor, originalModel, diff, this.modifiedCell.textModel);
    } else {
      this.perEditorDisposables.clear();
    }
  }
  getOrCreateOriginalModel(editor) {
    if (!this._originalModel) {
      const model = editor.getModel();
      if (!model) {
        return;
      }
      this._originalModel = this.add(this.originalCellModelFactory.getOrCreate(model.uri, this.originalCell.getValue(), model.getLanguageId(), this.modifiedCell.cellKind)).object;
    }
    return this._originalModel;
  }
  _updateWithDiff(editor, originalModel, diff, currentModel) {
    if (areDiffsEqual(diff, this.diffForPreviouslyAppliedDecorators)) {
      return;
    }
    this.perEditorDisposables.clear();
    const decorations = editor.createDecorationsCollection();
    this.perEditorDisposables.add(toDisposable(() => {
      editor.changeViewZones((viewZoneChangeAccessor) => {
        for (const id of this._viewZones) {
          viewZoneChangeAccessor.removeZone(id);
        }
      });
      this._viewZones = [];
      decorations.clear();
      this.diffForPreviouslyAppliedDecorators = void 0;
    }));
    this.diffForPreviouslyAppliedDecorators = diff;
    const chatDiffAddDecoration = ModelDecorationOptions.createDynamic({
      ...diffAddDecoration,
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
    const chatDiffWholeLineAddDecoration = ModelDecorationOptions.createDynamic({
      ...diffWholeLineAddDecoration,
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
    const createOverviewDecoration = (overviewRulerColor, minimapColor) => {
      return ModelDecorationOptions.createDynamic({
        description: "chat-editing-decoration",
        overviewRuler: { color: themeColorFromId(overviewRulerColor), position: OverviewRulerLane.Left },
        minimap: { color: themeColorFromId(minimapColor), position: MinimapPosition.Gutter }
      });
    };
    const modifiedDecoration = createOverviewDecoration(overviewRulerModifiedForeground, minimapGutterModifiedBackground);
    const addedDecoration = createOverviewDecoration(overviewRulerAddedForeground, minimapGutterAddedBackground);
    const deletedDecoration = createOverviewDecoration(overviewRulerDeletedForeground, minimapGutterDeletedBackground);
    editor.changeViewZones((viewZoneChangeAccessor) => {
      for (const id of this._viewZones) {
        viewZoneChangeAccessor.removeZone(id);
      }
      this._viewZones = [];
      const modifiedVisualDecorations = [];
      const mightContainNonBasicASCII = originalModel.mightContainNonBasicASCII();
      const mightContainRTL = originalModel.mightContainRTL();
      const renderOptions = RenderOptions.fromEditor(this.editor);
      const editorLineCount = currentModel.getLineCount();
      for (const diffEntry of diff.changes) {
        const originalRange = diffEntry.original;
        originalModel.tokenization.forceTokenization(Math.max(1, originalRange.endLineNumberExclusive - 1));
        const source = new LineSource(
          originalRange.mapToLineArray((l) => originalModel.tokenization.getLineTokens(l)),
          [],
          mightContainNonBasicASCII,
          mightContainRTL
        );
        const decorations2 = [];
        for (const i of diffEntry.innerChanges || []) {
          decorations2.push(new InlineDecoration(
            i.originalRange.delta(-(diffEntry.original.startLineNumber - 1)),
            diffDeleteDecoration.className,
            InlineDecorationType.Regular
          ));
          if (!(i.originalRange.isEmpty() && i.originalRange.startLineNumber === 1 && i.modifiedRange.endLineNumber === editorLineCount) && !i.modifiedRange.isEmpty()) {
            modifiedVisualDecorations.push({
              range: i.modifiedRange,
              options: chatDiffAddDecoration
            });
          }
        }
        const isCreatedContent = decorations2.length === 1 && decorations2[0].range.isEmpty() && diffEntry.original.startLineNumber === 1;
        if (!diffEntry.modified.isEmpty && !(isCreatedContent && diffEntry.modified.endLineNumberExclusive - 1 === editorLineCount)) {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: chatDiffWholeLineAddDecoration
          });
        }
        if (diffEntry.original.isEmpty) {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: addedDecoration
          });
        } else if (diffEntry.modified.isEmpty) {
          modifiedVisualDecorations.push({
            range: new Range(diffEntry.modified.startLineNumber - 1, 1, diffEntry.modified.startLineNumber, 1),
            options: deletedDecoration
          });
        } else {
          modifiedVisualDecorations.push({
            range: diffEntry.modified.toInclusiveRange(),
            options: modifiedDecoration
          });
        }
        const domNode = document.createElement("div");
        domNode.className = "chat-editing-original-zone view-lines line-delete monaco-mouse-cursor-text";
        const result = renderLines(source, renderOptions, decorations2, domNode);
        if (!isCreatedContent) {
          const viewZoneData = {
            afterLineNumber: diffEntry.modified.startLineNumber - 1,
            heightInLines: result.heightInLines,
            domNode,
            ordinal: 5e4 + 2
            // more than https://github.com/microsoft/vscode/blob/bf52a5cfb2c75a7327c9adeaefbddc06d529dcad/src/vs/workbench/contrib/inlineChat/browser/inlineChatZoneWidget.ts#L42
          };
          this._viewZones.push(viewZoneChangeAccessor.addZone(viewZoneData));
        }
      }
      decorations.set(modifiedVisualDecorations);
    });
  }
};
NotebookCellDiffDecorator = __decorateClass([
  __decorateParam(4, IEditorWorkerService),
  __decorateParam(5, INotebookOriginalCellModelFactory)
], NotebookCellDiffDecorator);
function areDiffsEqual(a, b) {
  if (a && b) {
    if (a.changes.length !== b.changes.length) {
      return false;
    }
    if (a.moves.length !== b.moves.length) {
      return false;
    }
    if (!areLineRangeMappinsEqual(a.changes, b.changes)) {
      return false;
    }
    if (!a.moves.some((move, i) => {
      const bMove = b.moves[i];
      if (!areLineRangeMappinsEqual(move.changes, bMove.changes)) {
        return true;
      }
      if (move.lineRangeMapping.changedLineCount !== bMove.lineRangeMapping.changedLineCount) {
        return true;
      }
      if (!move.lineRangeMapping.modified.equals(bMove.lineRangeMapping.modified)) {
        return true;
      }
      if (!move.lineRangeMapping.original.equals(bMove.lineRangeMapping.original)) {
        return true;
      }
      return false;
    })) {
      return false;
    }
    return true;
  } else if (!a && !b) {
    return true;
  } else {
    return false;
  }
}
function areLineRangeMappinsEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  if (a.some((c, i) => {
    const bChange = b[i];
    if (c.changedLineCount !== bChange.changedLineCount) {
      return true;
    }
    if ((c.innerChanges || []).length !== (bChange.innerChanges || []).length) {
      return true;
    }
    if ((c.innerChanges || []).some((innerC, innerIdx) => {
      const bInnerC = bChange.innerChanges[innerIdx];
      if (!innerC.modifiedRange.equalsRange(bInnerC.modifiedRange)) {
        return true;
      }
      if (!innerC.originalRange.equalsRange(bInnerC.originalRange)) {
        return true;
      }
      return false;
    })) {
      return true;
    }
    return false;
  })) {
    return false;
  }
  return true;
}
export {
  NotebookCellDiffDecorator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvZGlmZi9pbmxpbmVEaWZmL25vdGVib29rQ2VsbERpZmZEZWNvcmF0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuV2l0aFN0b3JlLCBkZXJpdmVkLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJVmlld1pvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFJlbmRlck9wdGlvbnMsIExpbmVTb3VyY2UsIHJlbmRlckxpbmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2RpZmZFZGl0b3IvY29tcG9uZW50cy9kaWZmRWRpdG9yVmlld1pvbmVzL3JlbmRlckxpbmVzLmpzJztcbmltcG9ydCB7IGRpZmZBZGREZWNvcmF0aW9uLCBkaWZmV2hvbGVMaW5lQWRkRGVjb3JhdGlvbiwgZGlmZkRlbGV0ZURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9yZWdpc3RyYXRpb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJRG9jdW1lbnREaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL2RvY3VtZW50RGlmZlByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MsIE1pbmltYXBQb3NpdGlvbiwgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBPdmVydmlld1J1bGVyTGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBtaW5pbWFwR3V0dGVyQWRkZWRCYWNrZ3JvdW5kLCBtaW5pbWFwR3V0dGVyRGVsZXRlZEJhY2tncm91bmQsIG1pbmltYXBHdXR0ZXJNb2RpZmllZEJhY2tncm91bmQsIG92ZXJ2aWV3UnVsZXJBZGRlZEZvcmVncm91bmQsIG92ZXJ2aWV3UnVsZXJEZWxldGVkRm9yZWdyb3VuZCwgb3ZlcnZpZXdSdWxlck1vZGlmaWVkRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3NjbS9jb21tb24vcXVpY2tEaWZmLmpzJztcbmltcG9ydCB7IElOb3RlYm9va09yaWdpbmFsQ2VsbE1vZGVsRmFjdG9yeSB9IGZyb20gJy4vbm90ZWJvb2tPcmlnaW5hbENlbGxNb2RlbEZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSW5saW5lRGVjb3JhdGlvbiwgSW5saW5lRGVjb3JhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5cbi8vVE9ETzogYWxsb3cgY2xpZW50IHRvIHNldCByZWFkLW9ubHkgLSBjaGF0ZWRpdHNlc3Npb24gc2hvdWxkIHNldCByZWFkLW9ubHkgd2hpbGUgbWFraW5nIGNoYW5nZXNcbmV4cG9ydCBjbGFzcyBOb3RlYm9va0NlbGxEaWZmRGVjb3JhdG9yIGV4dGVuZHMgRGlzcG9zYWJsZVN0b3JlIHtcblx0cHJpdmF0ZSBfdmlld1pvbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRocm90dGxlZERlY29yYXRvciA9IHRoaXMuYWRkKG5ldyBUaHJvdHRsZWREZWxheWVyKDUwKSk7XG5cdHByaXZhdGUgZGlmZkZvclByZXZpb3VzbHlBcHBsaWVkRGVjb3JhdG9ycz86IElEb2N1bWVudERpZmY7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwZXJFZGl0b3JEaXNwb3NhYmxlcyA9IHRoaXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdG5vdGVib29rRWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsXG5cdFx0cHVibGljIHJlYWRvbmx5IG1vZGlmaWVkQ2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsLFxuXHRcdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbENlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElFZGl0b3JXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcldvcmtlclNlcnZpY2U6IElFZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tPcmlnaW5hbENlbGxNb2RlbEZhY3RvcnkgcHJpdmF0ZSByZWFkb25seSBvcmlnaW5hbENlbGxNb2RlbEZhY3Rvcnk6IElOb3RlYm9va09yaWdpbmFsQ2VsbE1vZGVsRmFjdG9yeSxcblxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VWaXNpYmxlUmFuZ2VzID0gb2JzZXJ2YWJsZUZyb21FdmVudChub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZVZpc2libGVSYW5nZXMsICgpID0+IG5vdGVib29rRWRpdG9yLnZpc2libGVSYW5nZXMpO1xuXHRcdGNvbnN0IGVkaXRvck9icyA9IGRlcml2ZWQoKHIpID0+IHtcblx0XHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSBvbkRpZENoYW5nZVZpc2libGVSYW5nZXMucmVhZChyKTtcblx0XHRcdGNvbnN0IHZpc2libGVDZWxsSGFuZGxlcyA9IHZpc2libGVSYW5nZXMubWFwKHJhbmdlID0+IG5vdGVib29rRWRpdG9yLmdldENlbGxzSW5SYW5nZShyYW5nZSkpLmZsYXQoKS5tYXAoYyA9PiBjLmhhbmRsZSk7XG5cdFx0XHRpZiAoIXZpc2libGVDZWxsSGFuZGxlcy5pbmNsdWRlcyhtb2RpZmllZENlbGwuaGFuZGxlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBub3RlYm9va0VkaXRvci5jb2RlRWRpdG9ycy5maW5kKGl0ZW0gPT4gaXRlbVswXS5oYW5kbGUgPT09IG1vZGlmaWVkQ2VsbC5oYW5kbGUpPy5bMV07XG5cdFx0XHRpZiAoZWRpdG9yPy5nZXRNb2RlbCgpICE9PSB0aGlzLm1vZGlmaWVkQ2VsbC50ZXh0TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVkaXRvcjtcblx0XHR9KTtcblxuXHRcdHRoaXMuYWRkKGF1dG9ydW5XaXRoU3RvcmUoKHIsIHN0b3JlKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSBlZGl0b3JPYnMucmVhZChyKTtcblx0XHRcdHRoaXMucGVyRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRzdG9yZS5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucGVyRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZShlZGl0b3IpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHN0b3JlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pIHx8IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGluZUhlaWdodCkpIHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlKGVkaXRvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMudXBkYXRlKGVkaXRvcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZShlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0dGhpcy50aHJvdHRsZWREZWNvcmF0b3IudHJpZ2dlcigoKSA9PiB0aGlzLl91cGRhdGVJbXBsKGVkaXRvcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlSW1wbChlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5EaWZmRWRpdG9yKSkge1xuXHRcdFx0dGhpcy5wZXJFZGl0b3JEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwgfHwgbW9kZWwgIT09IHRoaXMubW9kaWZpZWRDZWxsLnRleHRNb2RlbCkge1xuXHRcdFx0dGhpcy5wZXJFZGl0b3JEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSB0aGlzLmdldE9yQ3JlYXRlT3JpZ2luYWxNb2RlbChlZGl0b3IpO1xuXHRcdGlmICghb3JpZ2luYWxNb2RlbCkge1xuXHRcdFx0dGhpcy5wZXJFZGl0b3JEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2ZXJzaW9uID0gbW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3QgZGlmZiA9IGF3YWl0IHRoaXMuX2VkaXRvcldvcmtlclNlcnZpY2UuY29tcHV0ZURpZmYoXG5cdFx0XHRvcmlnaW5hbE1vZGVsLnVyaSxcblx0XHRcdG1vZGVsLnVyaSxcblx0XHRcdHsgY29tcHV0ZU1vdmVzOiB0cnVlLCBpZ25vcmVUcmltV2hpdGVzcGFjZTogZmFsc2UsIG1heENvbXB1dGF0aW9uVGltZU1zOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiB9LFxuXHRcdFx0J2FkdmFuY2VkJ1xuXHRcdCk7XG5cblxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdGlmIChkaWZmICYmICFkaWZmLmlkZW50aWNhbCAmJiB0aGlzLm1vZGlmaWVkQ2VsbC50ZXh0TW9kZWwgJiYgb3JpZ2luYWxNb2RlbCAmJiBtb2RlbCA9PT0gZWRpdG9yLmdldE1vZGVsKCkgJiYgZWRpdG9yLmdldE1vZGVsKCk/LmdldFZlcnNpb25JZCgpID09PSB2ZXJzaW9uKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVXaXRoRGlmZihlZGl0b3IsIG9yaWdpbmFsTW9kZWwsIGRpZmYsIHRoaXMubW9kaWZpZWRDZWxsLnRleHRNb2RlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucGVyRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vcmlnaW5hbE1vZGVsPzogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSBnZXRPckNyZWF0ZU9yaWdpbmFsTW9kZWwoZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdGlmICghdGhpcy5fb3JpZ2luYWxNb2RlbCkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb3JpZ2luYWxNb2RlbCA9IHRoaXMuYWRkKHRoaXMub3JpZ2luYWxDZWxsTW9kZWxGYWN0b3J5LmdldE9yQ3JlYXRlKG1vZGVsLnVyaSwgdGhpcy5vcmlnaW5hbENlbGwuZ2V0VmFsdWUoKSwgbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCB0aGlzLm1vZGlmaWVkQ2VsbC5jZWxsS2luZCkpLm9iamVjdDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX29yaWdpbmFsTW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVXaXRoRGlmZihlZGl0b3I6IElDb2RlRWRpdG9yLCBvcmlnaW5hbE1vZGVsOiBJVGV4dE1vZGVsLCBkaWZmOiBJRG9jdW1lbnREaWZmLCBjdXJyZW50TW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkIHtcblx0XHRpZiAoYXJlRGlmZnNFcXVhbChkaWZmLCB0aGlzLmRpZmZGb3JQcmV2aW91c2x5QXBwbGllZERlY29yYXRvcnMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucGVyRWRpdG9yRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IGVkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLnBlckVkaXRvckRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZWRpdG9yLmNoYW5nZVZpZXdab25lcygodmlld1pvbmVDaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIHRoaXMuX3ZpZXdab25lcykge1xuXHRcdFx0XHRcdHZpZXdab25lQ2hhbmdlQWNjZXNzb3IucmVtb3ZlWm9uZShpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fdmlld1pvbmVzID0gW107XG5cdFx0XHRkZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0dGhpcy5kaWZmRm9yUHJldmlvdXNseUFwcGxpZWREZWNvcmF0b3JzID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlmZkZvclByZXZpb3VzbHlBcHBsaWVkRGVjb3JhdG9ycyA9IGRpZmY7XG5cblx0XHRjb25zdCBjaGF0RGlmZkFkZERlY29yYXRpb24gPSBNb2RlbERlY29yYXRpb25PcHRpb25zLmNyZWF0ZUR5bmFtaWMoe1xuXHRcdFx0Li4uZGlmZkFkZERlY29yYXRpb24sXG5cdFx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlc1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXREaWZmV2hvbGVMaW5lQWRkRGVjb3JhdGlvbiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyh7XG5cdFx0XHQuLi5kaWZmV2hvbGVMaW5lQWRkRGVjb3JhdGlvbixcblx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNyZWF0ZU92ZXJ2aWV3RGVjb3JhdGlvbiA9IChvdmVydmlld1J1bGVyQ29sb3I6IHN0cmluZywgbWluaW1hcENvbG9yOiBzdHJpbmcpID0+IHtcblx0XHRcdHJldHVybiBNb2RlbERlY29yYXRpb25PcHRpb25zLmNyZWF0ZUR5bmFtaWMoe1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2NoYXQtZWRpdGluZy1kZWNvcmF0aW9uJyxcblx0XHRcdFx0b3ZlcnZpZXdSdWxlcjogeyBjb2xvcjogdGhlbWVDb2xvckZyb21JZChvdmVydmlld1J1bGVyQ29sb3IpLCBwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuTGVmdCB9LFxuXHRcdFx0XHRtaW5pbWFwOiB7IGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKG1pbmltYXBDb2xvciksIHBvc2l0aW9uOiBNaW5pbWFwUG9zaXRpb24uR3V0dGVyIH0sXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdGNvbnN0IG1vZGlmaWVkRGVjb3JhdGlvbiA9IGNyZWF0ZU92ZXJ2aWV3RGVjb3JhdGlvbihvdmVydmlld1J1bGVyTW9kaWZpZWRGb3JlZ3JvdW5kLCBtaW5pbWFwR3V0dGVyTW9kaWZpZWRCYWNrZ3JvdW5kKTtcblx0XHRjb25zdCBhZGRlZERlY29yYXRpb24gPSBjcmVhdGVPdmVydmlld0RlY29yYXRpb24ob3ZlcnZpZXdSdWxlckFkZGVkRm9yZWdyb3VuZCwgbWluaW1hcEd1dHRlckFkZGVkQmFja2dyb3VuZCk7XG5cdFx0Y29uc3QgZGVsZXRlZERlY29yYXRpb24gPSBjcmVhdGVPdmVydmlld0RlY29yYXRpb24ob3ZlcnZpZXdSdWxlckRlbGV0ZWRGb3JlZ3JvdW5kLCBtaW5pbWFwR3V0dGVyRGVsZXRlZEJhY2tncm91bmQpO1xuXG5cdFx0ZWRpdG9yLmNoYW5nZVZpZXdab25lcygodmlld1pvbmVDaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiB0aGlzLl92aWV3Wm9uZXMpIHtcblx0XHRcdFx0dmlld1pvbmVDaGFuZ2VBY2Nlc3Nvci5yZW1vdmVab25lKGlkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3ZpZXdab25lcyA9IFtdO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRWaXN1YWxEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkgPSBvcmlnaW5hbE1vZGVsLm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKTtcblx0XHRcdGNvbnN0IG1pZ2h0Q29udGFpblJUTCA9IG9yaWdpbmFsTW9kZWwubWlnaHRDb250YWluUlRMKCk7XG5cdFx0XHRjb25zdCByZW5kZXJPcHRpb25zID0gUmVuZGVyT3B0aW9ucy5mcm9tRWRpdG9yKHRoaXMuZWRpdG9yKTtcblx0XHRcdGNvbnN0IGVkaXRvckxpbmVDb3VudCA9IGN1cnJlbnRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGZvciAoY29uc3QgZGlmZkVudHJ5IG9mIGRpZmYuY2hhbmdlcykge1xuXG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsUmFuZ2UgPSBkaWZmRW50cnkub3JpZ2luYWw7XG5cdFx0XHRcdG9yaWdpbmFsTW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKE1hdGgubWF4KDEsIG9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAtIDEpKTtcblx0XHRcdFx0Y29uc3Qgc291cmNlID0gbmV3IExpbmVTb3VyY2UoXG5cdFx0XHRcdFx0b3JpZ2luYWxSYW5nZS5tYXBUb0xpbmVBcnJheShsID0+IG9yaWdpbmFsTW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobCkpLFxuXHRcdFx0XHRcdFtdLFxuXHRcdFx0XHRcdG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUksXG5cdFx0XHRcdFx0bWlnaHRDb250YWluUlRMLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uczogSW5saW5lRGVjb3JhdGlvbltdID0gW107XG5cblx0XHRcdFx0Zm9yIChjb25zdCBpIG9mIGRpZmZFbnRyeS5pbm5lckNoYW5nZXMgfHwgW10pIHtcblx0XHRcdFx0XHRkZWNvcmF0aW9ucy5wdXNoKG5ldyBJbmxpbmVEZWNvcmF0aW9uKFxuXHRcdFx0XHRcdFx0aS5vcmlnaW5hbFJhbmdlLmRlbHRhKC0oZGlmZkVudHJ5Lm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciAtIDEpKSxcblx0XHRcdFx0XHRcdGRpZmZEZWxldGVEZWNvcmF0aW9uLmNsYXNzTmFtZSEsXG5cdFx0XHRcdFx0XHRJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyXG5cdFx0XHRcdFx0KSk7XG5cblx0XHRcdFx0XHQvLyBJZiB0aGUgb3JpZ2luYWwgcmFuZ2UgaXMgZW1wdHksIHRoZSBzdGFydCBsaW5lIG51bWJlciBpcyAxIGFuZCB0aGUgbmV3IHJhbmdlIHNwYW5zIHRoZSBlbnRpcmUgZmlsZSwgZG9uJ3QgZHJhdyBhbiBBZGRlZCBkZWNvcmF0aW9uXG5cdFx0XHRcdFx0aWYgKCEoaS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSAmJiBpLm9yaWdpbmFsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSAxICYmIGkubW9kaWZpZWRSYW5nZS5lbmRMaW5lTnVtYmVyID09PSBlZGl0b3JMaW5lQ291bnQpICYmICFpLm1vZGlmaWVkUmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0XHRtb2RpZmllZFZpc3VhbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRyYW5nZTogaS5tb2RpZmllZFJhbmdlLCBvcHRpb25zOiBjaGF0RGlmZkFkZERlY29yYXRpb25cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlbmRlciBhbiBhZGRlZCBkZWNvcmF0aW9uIGJ1dCBkb24ndCBhbHNvIHJlbmRlciBhIGRlbGV0ZWQgZGVjb3JhdGlvbiBmb3IgbmV3bHkgaW5zZXJ0ZWQgY29udGVudCBhdCB0aGUgc3RhcnQgb2YgdGhlIGZpbGVcblx0XHRcdFx0Ly8gTm90ZSwgdGhpcyBpcyBhIHdvcmthcm91bmQgZm9yIHRoZSBgTGluZVJhbmdlLmlzRW1wdHkoKWAgaW4gZGlmZkVudHJ5Lm9yaWdpbmFsIGJlaW5nIGBmYWxzZWAgZm9yIG5ld2x5IGluc2VydGVkIGNvbnRlbnRcblx0XHRcdFx0Y29uc3QgaXNDcmVhdGVkQ29udGVudCA9IGRlY29yYXRpb25zLmxlbmd0aCA9PT0gMSAmJiBkZWNvcmF0aW9uc1swXS5yYW5nZS5pc0VtcHR5KCkgJiYgZGlmZkVudHJ5Lm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciA9PT0gMTtcblxuXHRcdFx0XHRpZiAoIWRpZmZFbnRyeS5tb2RpZmllZC5pc0VtcHR5ICYmICEoaXNDcmVhdGVkQ29udGVudCAmJiAoZGlmZkVudHJ5Lm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxKSA9PT0gZWRpdG9yTGluZUNvdW50KSkge1xuXHRcdFx0XHRcdG1vZGlmaWVkVmlzdWFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZTogZGlmZkVudHJ5Lm1vZGlmaWVkLnRvSW5jbHVzaXZlUmFuZ2UoKSEsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiBjaGF0RGlmZldob2xlTGluZUFkZERlY29yYXRpb25cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChkaWZmRW50cnkub3JpZ2luYWwuaXNFbXB0eSkge1xuXHRcdFx0XHRcdC8vIGluc2VydGlvblxuXHRcdFx0XHRcdG1vZGlmaWVkVmlzdWFsRGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRyYW5nZTogZGlmZkVudHJ5Lm1vZGlmaWVkLnRvSW5jbHVzaXZlUmFuZ2UoKSEsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiBhZGRlZERlY29yYXRpb25cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChkaWZmRW50cnkubW9kaWZpZWQuaXNFbXB0eSkge1xuXHRcdFx0XHRcdC8vIGRlbGV0aW9uXG5cdFx0XHRcdFx0bW9kaWZpZWRWaXN1YWxEZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoZGlmZkVudHJ5Lm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciAtIDEsIDEsIGRpZmZFbnRyeS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXIsIDEpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogZGVsZXRlZERlY29yYXRpb25cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBtb2RpZmljYXRpb25cblx0XHRcdFx0XHRtb2RpZmllZFZpc3VhbERlY29yYXRpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IGRpZmZFbnRyeS5tb2RpZmllZC50b0luY2x1c2l2ZVJhbmdlKCkhLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogbW9kaWZpZWREZWNvcmF0aW9uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGRvbU5vZGUuY2xhc3NOYW1lID0gJ2NoYXQtZWRpdGluZy1vcmlnaW5hbC16b25lIHZpZXctbGluZXMgbGluZS1kZWxldGUgbW9uYWNvLW1vdXNlLWN1cnNvci10ZXh0Jztcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVuZGVyTGluZXMoc291cmNlLCByZW5kZXJPcHRpb25zLCBkZWNvcmF0aW9ucywgZG9tTm9kZSk7XG5cblx0XHRcdFx0aWYgKCFpc0NyZWF0ZWRDb250ZW50KSB7XG5cblx0XHRcdFx0XHRjb25zdCB2aWV3Wm9uZURhdGE6IElWaWV3Wm9uZSA9IHtcblx0XHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogZGlmZkVudHJ5Lm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciAtIDEsXG5cdFx0XHRcdFx0XHRoZWlnaHRJbkxpbmVzOiByZXN1bHQuaGVpZ2h0SW5MaW5lcyxcblx0XHRcdFx0XHRcdGRvbU5vZGUsXG5cdFx0XHRcdFx0XHRvcmRpbmFsOiA1MDAwMCArIDIgLy8gbW9yZSB0aGFuIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvYmY1MmE1Y2ZiMmM3NWE3MzI3YzlhZGVhZWZiZGRjMDZkNTI5ZGNhZC9zcmMvdnMvd29ya2JlbmNoL2NvbnRyaWIvaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRab25lV2lkZ2V0LnRzI0w0MlxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHR0aGlzLl92aWV3Wm9uZXMucHVzaCh2aWV3Wm9uZUNoYW5nZUFjY2Vzc29yLmFkZFpvbmUodmlld1pvbmVEYXRhKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZGVjb3JhdGlvbnMuc2V0KG1vZGlmaWVkVmlzdWFsRGVjb3JhdGlvbnMpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFyZURpZmZzRXF1YWwoYTogSURvY3VtZW50RGlmZiB8IHVuZGVmaW5lZCwgYjogSURvY3VtZW50RGlmZiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoYSAmJiBiKSB7XG5cdFx0aWYgKGEuY2hhbmdlcy5sZW5ndGggIT09IGIuY2hhbmdlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGEubW92ZXMubGVuZ3RoICE9PSBiLm1vdmVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWFyZUxpbmVSYW5nZU1hcHBpbnNFcXVhbChhLmNoYW5nZXMsIGIuY2hhbmdlcykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFhLm1vdmVzLnNvbWUoKG1vdmUsIGkpID0+IHtcblx0XHRcdGNvbnN0IGJNb3ZlID0gYi5tb3Zlc1tpXTtcblx0XHRcdGlmICghYXJlTGluZVJhbmdlTWFwcGluc0VxdWFsKG1vdmUuY2hhbmdlcywgYk1vdmUuY2hhbmdlcykpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW92ZS5saW5lUmFuZ2VNYXBwaW5nLmNoYW5nZWRMaW5lQ291bnQgIT09IGJNb3ZlLmxpbmVSYW5nZU1hcHBpbmcuY2hhbmdlZExpbmVDb3VudCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmVxdWFscyhiTW92ZS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghbW92ZS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmVxdWFscyhiTW92ZS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBlbHNlIGlmICghYSAmJiAhYikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG5mdW5jdGlvbiBhcmVMaW5lUmFuZ2VNYXBwaW5zRXF1YWwoYTogcmVhZG9ubHkgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10sIGI6IHJlYWRvbmx5IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdKTogYm9vbGVhbiB7XG5cdGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGEuc29tZSgoYywgaSkgPT4ge1xuXHRcdGNvbnN0IGJDaGFuZ2UgPSBiW2ldO1xuXHRcdGlmIChjLmNoYW5nZWRMaW5lQ291bnQgIT09IGJDaGFuZ2UuY2hhbmdlZExpbmVDb3VudCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICgoYy5pbm5lckNoYW5nZXMgfHwgW10pLmxlbmd0aCAhPT0gKGJDaGFuZ2UuaW5uZXJDaGFuZ2VzIHx8IFtdKS5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoKGMuaW5uZXJDaGFuZ2VzIHx8IFtdKS5zb21lKChpbm5lckMsIGlubmVySWR4KSA9PiB7XG5cdFx0XHRjb25zdCBiSW5uZXJDID0gYkNoYW5nZS5pbm5lckNoYW5nZXMhW2lubmVySWR4XTtcblx0XHRcdGlmICghaW5uZXJDLm1vZGlmaWVkUmFuZ2UuZXF1YWxzUmFuZ2UoYklubmVyQy5tb2RpZmllZFJhbmdlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghaW5uZXJDLm9yaWdpbmFsUmFuZ2UuZXF1YWxzUmFuZ2UoYklubmVyQy5vcmlnaW5hbFJhbmdlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsa0JBQWtCLFNBQVMsMkJBQTJCO0FBRS9ELFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBZSxZQUFZLG1CQUFtQjtBQUN2RCxTQUFTLG1CQUFtQiw0QkFBNEIsNEJBQTRCO0FBRXBGLFNBQXFCLHdCQUF3QixpQkFBd0MseUJBQXlCO0FBQzlHLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsYUFBYTtBQUd0QixTQUFTLDhCQUE4QixnQ0FBZ0MsaUNBQWlDLDhCQUE4QixnQ0FBZ0MsdUNBQXVDO0FBQzdNLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsa0JBQWtCLDRCQUE0QjtBQUdoRCxJQUFNLDRCQUFOLGNBQXdDLGdCQUFnQjtBQUFBLEVBTTlELFlBQ0MsZ0JBQ2dCLGNBQ0EsY0FDQyxRQUNzQixzQkFDYSwwQkFFbkQ7QUFDRCxVQUFNO0FBUFU7QUFDQTtBQUNDO0FBQ3NCO0FBQ2E7QUFYckQsU0FBUSxhQUF1QixDQUFDO0FBQ2hDLFNBQWlCLHFCQUFxQixLQUFLLElBQUksSUFBSSxpQkFBaUIsRUFBRSxDQUFDO0FBR3ZFLFNBQWlCLHVCQUF1QixLQUFLLElBQUksSUFBSSxnQkFBZ0IsQ0FBQztBQVlyRSxVQUFNLDJCQUEyQixvQkFBb0IsZUFBZSwwQkFBMEIsTUFBTSxlQUFlLGFBQWE7QUFDaEksVUFBTSxZQUFZLFFBQVEsQ0FBQyxNQUFNO0FBQ2hDLFlBQU0sZ0JBQWdC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
