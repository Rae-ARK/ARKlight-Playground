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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { derived } from "../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { observableCodeEditor } from "../../../../../browser/observableCodeEditor.js";
import { Range } from "../../../../../common/core/range.js";
import { TextReplacement, TextEdit } from "../../../../../common/core/edits/textEdit.js";
import { InlineEditWithChanges } from "./inlineEditWithChanges.js";
import { ModelPerInlineEdit } from "./inlineEditsModel.js";
import { InlineEditsView } from "./inlineEditsView.js";
import { InlineEditTabAction } from "./inlineEditsViewInterface.js";
import { InlineSuggestionGutterMenuData, SimpleInlineSuggestModel } from "./components/gutterIndicatorView.js";
let InlineEditsViewAndDiffProducer = class extends Disposable {
  constructor(_editor, _model, _showCollapsed, instantiationService) {
    super();
    this._editor = _editor;
    this._model = _model;
    this._showCollapsed = _showCollapsed;
    this._inlineEdit = derived(this, (reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return void 0;
      }
      const textModel = this._editor.getModel();
      if (!textModel) {
        return void 0;
      }
      const state = model.inlineEditState.read(reader);
      if (!state) {
        return void 0;
      }
      const action = state.inlineSuggestion.action;
      let diffEdits;
      if (action?.kind === "edit") {
        const editOffset = action.stringEdit;
        const t = state.inlineSuggestion.originalTextRef.getTransformer();
        const edits = editOffset.replacements.map((e) => {
          const innerEditRange = Range.fromPositions(
            t.getPosition(e.replaceRange.start),
            t.getPosition(e.replaceRange.endExclusive)
          );
          return new TextReplacement(innerEditRange, e.newText);
        });
        diffEdits = new TextEdit(edits);
      } else {
        diffEdits = void 0;
      }
      return new InlineEditWithChanges(
        state.inlineSuggestion.originalTextRef,
        action,
        diffEdits,
        model.primaryPosition.read(void 0),
        model.allPositions.read(void 0),
        state.inlineSuggestion.source.inlineSuggestions.commands ?? [],
        state.inlineSuggestion
      );
    });
    this._inlineEditModel = derived(this, (reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return void 0;
      }
      const edit = this._inlineEdit.read(reader);
      if (!edit) {
        return void 0;
      }
      const tabAction = derived(this, (reader2) => {
        if (this._editorObs.isFocused.read(reader2)) {
          if (model.tabShouldJumpToInlineEdit.read(reader2)) {
            return InlineEditTabAction.Jump;
          }
          if (model.tabShouldAcceptInlineEdit.read(reader2)) {
            return InlineEditTabAction.Accept;
          }
        }
        return InlineEditTabAction.Inactive;
      });
      return new ModelPerInlineEdit(model, edit, tabAction);
    });
    this._editorObs = observableCodeEditor(this._editor);
    this.view = this._register(instantiationService.createInstance(
      InlineEditsView,
      this._editor,
      this._inlineEditModel,
      this._model.map((model) => model ? SimpleInlineSuggestModel.fromInlineCompletionModel(model) : void 0),
      this._inlineEdit.map((e) => e ? InlineSuggestionGutterMenuData.fromInlineSuggestion(e.inlineCompletion) : void 0),
      this._showCollapsed
    ));
  }
};
InlineEditsViewAndDiffProducer = __decorateClass([
  __decorateParam(3, IInstantiationService)
], InlineEditsViewAndDiffProducer);
export {
  InlineEditsViewAndDiffProducer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdQcm9kdWNlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZUNvZGVFZGl0b3IsIG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRleHRSZXBsYWNlbWVudCwgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vbW9kZWwvaW5saW5lQ29tcGxldGlvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0V2l0aENoYW5nZXMgfSBmcm9tICcuL2lubGluZUVkaXRXaXRoQ2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBNb2RlbFBlcklubGluZUVkaXQgfSBmcm9tICcuL2lubGluZUVkaXRzTW9kZWwuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdHNWaWV3IH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXcuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdFRhYkFjdGlvbiB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3Rpb25HdXR0ZXJNZW51RGF0YSwgU2ltcGxlSW5saW5lU3VnZ2VzdE1vZGVsIH0gZnJvbSAnLi9jb21wb25lbnRzL2d1dHRlckluZGljYXRvclZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lRWRpdHNWaWV3QW5kRGlmZlByb2R1Y2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7IC8vIFRPRE86IFRoaXMgY2xhc3MgaXMgbm8gbG9uZ2VyIGEgZGlmZiBwcm9kdWNlci4gUmVuYW1lIGl0IG9yIGdldCByaWQgb2YgaXRcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yT2JzOiBPYnNlcnZhYmxlQ29kZUVkaXRvcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pbmxpbmVFZGl0ID0gZGVyaXZlZDxJbmxpbmVFZGl0V2l0aENoYW5nZXMgfCB1bmRlZmluZWQ+KHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIW1vZGVsKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRjb25zdCB0ZXh0TW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIXRleHRNb2RlbCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRjb25zdCBzdGF0ZSA9IG1vZGVsLmlubGluZUVkaXRTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0Y29uc3QgYWN0aW9uID0gc3RhdGUuaW5saW5lU3VnZ2VzdGlvbi5hY3Rpb247XG5cblx0XHRsZXQgZGlmZkVkaXRzOiBUZXh0RWRpdCB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChhY3Rpb24/LmtpbmQgPT09ICdlZGl0Jykge1xuXHRcdFx0Y29uc3QgZWRpdE9mZnNldCA9IGFjdGlvbi5zdHJpbmdFZGl0O1xuXHRcdFx0Y29uc3QgdCA9IHN0YXRlLmlubGluZVN1Z2dlc3Rpb24ub3JpZ2luYWxUZXh0UmVmLmdldFRyYW5zZm9ybWVyKCk7XG5cdFx0XHRjb25zdCBlZGl0cyA9IGVkaXRPZmZzZXQucmVwbGFjZW1lbnRzLm1hcChlID0+IHtcblx0XHRcdFx0Y29uc3QgaW5uZXJFZGl0UmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKFxuXHRcdFx0XHRcdHQuZ2V0UG9zaXRpb24oZS5yZXBsYWNlUmFuZ2Uuc3RhcnQpLFxuXHRcdFx0XHRcdHQuZ2V0UG9zaXRpb24oZS5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFRleHRSZXBsYWNlbWVudChpbm5lckVkaXRSYW5nZSwgZS5uZXdUZXh0KTtcblx0XHRcdH0pO1xuXHRcdFx0ZGlmZkVkaXRzID0gbmV3IFRleHRFZGl0KGVkaXRzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlmZkVkaXRzID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgSW5saW5lRWRpdFdpdGhDaGFuZ2VzKFxuXHRcdFx0c3RhdGUuaW5saW5lU3VnZ2VzdGlvbi5vcmlnaW5hbFRleHRSZWYsXG5cdFx0XHRhY3Rpb24sXG5cdFx0XHRkaWZmRWRpdHMsXG5cdFx0XHRtb2RlbC5wcmltYXJ5UG9zaXRpb24ucmVhZCh1bmRlZmluZWQpLFxuXHRcdFx0bW9kZWwuYWxsUG9zaXRpb25zLnJlYWQodW5kZWZpbmVkKSxcblx0XHRcdHN0YXRlLmlubGluZVN1Z2dlc3Rpb24uc291cmNlLmlubGluZVN1Z2dlc3Rpb25zLmNvbW1hbmRzID8/IFtdLFxuXHRcdFx0c3RhdGUuaW5saW5lU3VnZ2VzdGlvblxuXHRcdCk7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSBfaW5saW5lRWRpdE1vZGVsID0gZGVyaXZlZDxNb2RlbFBlcklubGluZUVkaXQgfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFtb2RlbCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2lubGluZUVkaXQucmVhZChyZWFkZXIpO1xuXHRcdGlmICghZWRpdCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRjb25zdCB0YWJBY3Rpb24gPSBkZXJpdmVkPElubGluZUVkaXRUYWJBY3Rpb24+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHRhYkFjdGlvbiAqL1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvck9icy5pc0ZvY3VzZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdGlmIChtb2RlbC50YWJTaG91bGRKdW1wVG9JbmxpbmVFZGl0LnJlYWQocmVhZGVyKSkgeyByZXR1cm4gSW5saW5lRWRpdFRhYkFjdGlvbi5KdW1wOyB9XG5cdFx0XHRcdGlmIChtb2RlbC50YWJTaG91bGRBY2NlcHRJbmxpbmVFZGl0LnJlYWQocmVhZGVyKSkgeyByZXR1cm4gSW5saW5lRWRpdFRhYkFjdGlvbi5BY2NlcHQ7IH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBJbmxpbmVFZGl0VGFiQWN0aW9uLkluYWN0aXZlO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG5ldyBNb2RlbFBlcklubGluZUVkaXQobW9kZWwsIGVkaXQsIHRhYkFjdGlvbik7XG5cdH0pO1xuXG5cdHB1YmxpYyByZWFkb25seSB2aWV3OiBJbmxpbmVFZGl0c1ZpZXc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSU9ic2VydmFibGU8SW5saW5lQ29tcGxldGlvbnNNb2RlbCB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2hvd0NvbGxhcHNlZDogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fZWRpdG9yKTtcblxuXHRcdHRoaXMudmlldyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUVkaXRzVmlldywgdGhpcy5fZWRpdG9yLCB0aGlzLl9pbmxpbmVFZGl0TW9kZWwsXG5cdFx0XHR0aGlzLl9tb2RlbC5tYXAobW9kZWwgPT4gbW9kZWwgPyBTaW1wbGVJbmxpbmVTdWdnZXN0TW9kZWwuZnJvbUlubGluZUNvbXBsZXRpb25Nb2RlbChtb2RlbCkgOiB1bmRlZmluZWQpLFxuXHRcdFx0dGhpcy5faW5saW5lRWRpdC5tYXAoZSA9PiBlID8gSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhLmZyb21JbmxpbmVTdWdnZXN0aW9uKGUuaW5saW5lQ29tcGxldGlvbikgOiB1bmRlZmluZWQpLFxuXHRcdFx0dGhpcy5fc2hvd0NvbGxhcHNlZCxcblx0XHQpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQStCLDRCQUE0QjtBQUMzRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUIsZ0JBQWdCO0FBRTFDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0NBQWdDLGdDQUFnQztBQUVsRSxJQUFNLGlDQUFOLGNBQTZDLFdBQVc7QUFBQSxFQTZEOUQsWUFDa0IsU0FDQSxRQUNBLGdCQUNNLHNCQUN0QjtBQUNELFVBQU07QUFMVztBQUNBO0FBQ0E7QUE3RGxCLFNBQWlCLGNBQWMsUUFBMkMsTUFBTSxDQUFDLFdBQVc7QUFDM0YsWUFBTSxRQUFRLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDckMsVUFBSSxDQUFDLE9BQU87QUFBRSxlQUFPO0FBQUEsTUFBVztBQUNoQyxZQUFNLFlBQVksS0FBSyxRQUFRLFNBQVM7QUFDeEMsVUFBSSxDQUFDLFdBQVc7QUFBRSxlQUFPO0FBQUEsTUFBVztBQUVwQyxZQUFNLFFBQVEsTUFBTSxnQkFBZ0IsS0FBSyxNQUFNO0FBQy9DLFVBQUksQ0FBQyxPQUFPO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFDaEMsWUFBTSxTQUFTLE1BQU0saUJBQWlCO0FBRXRDLFVBQUk7QUFFSixVQUFJLFFBQVEsU0FBUyxRQUFRO0FBQzVCLGNBQU0sYUFBYSxPQUFPO0FBQzFCLGNBQU0sSUFBSSxNQUFNLGlCQUFpQixnQkFBZ0IsZUFBZTtBQUNoRSxjQUFNLFFBQVEsV0FBVyxhQUFhLElBQUksT0FBSztBQUM5QyxnQkFBTSxpQkFBaUIsTUFBTTtBQUFBLFlBQzVCLEVBQUUsWUFBWSxFQUFFLGFBQWEsS0FBSztBQUFBLFlBQ2xDLEVBQUUsWUFBWSxFQUFFLGFBQWEsWUFBWTtBQUFBLFVBQzFDO0FBQ0EsaUJBQU8sSUFBSSxnQkFBZ0IsZ0JBQWdCLEVBQUUsT0FBTztBQUFBLFFBQ3JELENBQUM7QUFDRCxvQkFBWSxJQUFJLFNBQVMsS0FBSztBQUFBLE1BQy9CLE9BQU87QUFDTixvQkFBWTtBQUFBLE1BQ2I7QUFFQSxhQUFPLElBQUk7QUFBQSxRQUNWLE1BQU0saUJBQWlCO0FBQUEsUUFDdkI7QUFBQSxRQUNBO0FBQUEsUUFDQSxNQUFNLGdCQUFnQixLQUFLLE1BQVM7QUFBQSxRQUNwQyxNQUFNLGFBQWEsS0FBSyxNQUFTO0FBQUEsUUFDakMsTUFBTSxpQkFBaUIsT0FBTyxrQkFBa0IsWUFBWSxDQUFDO0FBQUEsUUFDN0QsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFnQixtQkFBbUIsUUFBd0MsTUFBTSxZQUFVO0FBQzFGLFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFDaEMsWUFBTSxPQUFPLEtBQUssWUFBWSxLQUFLLE1BQU07QUFDekMsVUFBSSxDQUFDLE1BQU07QUFBRSxlQUFPO0FBQUEsTUFBVztBQUUvQixZQUFNLFlBQVksUUFBNkIsTUFBTSxDQUFBQSxZQUFVO0FBRTlELFlBQUksS0FBSyxXQUFXLFVBQVUsS0FBS0EsT0FBTSxHQUFHO0FBQzNDLGNBQUksTUFBTSwwQkFBMEIsS0FBS0EsT0FBTSxHQUFHO0FBQUUsbUJBQU8sb0JBQW9CO0FBQUEsVUFBTTtBQUNyRixjQUFJLE1BQU0sMEJBQTBCLEtBQUtBLE9BQU0sR0FBRztBQUFFLG1CQUFPLG9CQUFvQjtBQUFBLFVBQVE7QUFBQSxRQUN4RjtBQUNBLGVBQU8sb0JBQW9CO0FBQUEsTUFDNUIsQ0FBQztBQUVELGFBQU8sSUFBSSxtQkFBbUIsT0FBTyxNQUFNLFNBQVM7QUFBQSxJQUNyRCxDQUFDO0FBWUEsU0FBSyxhQUFhLHFCQUFxQixLQUFLLE9BQU87QUFFbkQsU0FBSyxPQUFPLEtBQUssVUFBVSxxQkFBcUI7QUFBQSxNQUFlO0FBQUEsTUFBaUIsS0FBSztBQUFBLE1BQVMsS0FBSztBQUFBLE1BQ2xHLEtBQUssT0FBTyxJQUFJLFdBQVMsUUFBUSx5QkFBeUIsMEJBQTBCLEtBQUssSUFBSSxNQUFTO0FBQUEsTUFDdEcsS0FBSyxZQUFZLElBQUksT0FBSyxJQUFJLCtCQUErQixxQkFBcUIsRUFBRSxnQkFBZ0IsSUFBSSxNQUFTO0FBQUEsTUFDakgsS0FBSztBQUFBLElBQ04sQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTdFYSxpQ0FBTjtBQUFBLEVBaUVKO0FBQUEsR0FqRVU7IiwKICAibmFtZXMiOiBbInJlYWRlciJdCn0K
