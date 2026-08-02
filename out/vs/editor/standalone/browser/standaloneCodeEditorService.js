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
import { windowOpenNoOpener } from "../../../base/browser/dom.js";
import { Schemas } from "../../../base/common/network.js";
import { AbstractCodeEditorService } from "../../browser/services/abstractCodeEditorService.js";
import { ICodeEditorService } from "../../browser/services/codeEditorService.js";
import { ScrollType } from "../../common/editorCommon.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { InstantiationType, registerSingleton } from "../../../platform/instantiation/common/extensions.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
let StandaloneCodeEditorService = class extends AbstractCodeEditorService {
  constructor(contextKeyService, themeService) {
    super(themeService);
    this._register(this.onCodeEditorAdd(() => this._checkContextKey()));
    this._register(this.onCodeEditorRemove(() => this._checkContextKey()));
    this._editorIsOpen = contextKeyService.createKey("editorIsOpen", false);
    this._activeCodeEditor = null;
    this._register(this.registerCodeEditorOpenHandler(async (input, source, sideBySide) => {
      if (!source) {
        return null;
      }
      return this.doOpenEditor(source, input);
    }));
  }
  _checkContextKey() {
    let hasCodeEditor = false;
    for (const editor of this.listCodeEditors()) {
      if (!editor.isSimpleWidget) {
        hasCodeEditor = true;
        break;
      }
    }
    this._editorIsOpen.set(hasCodeEditor);
  }
  setActiveCodeEditor(activeCodeEditor) {
    this._activeCodeEditor = activeCodeEditor;
  }
  getActiveCodeEditor() {
    return this._activeCodeEditor;
  }
  doOpenEditor(editor, input) {
    const model = this.findModel(editor, input.resource);
    if (!model) {
      if (input.resource) {
        const schema = input.resource.scheme;
        if (schema === Schemas.http || schema === Schemas.https) {
          windowOpenNoOpener(input.resource.toString());
          return editor;
        }
      }
      return null;
    }
    const selection = input.options ? input.options.selection : null;
    if (selection) {
      if (typeof selection.endLineNumber === "number" && typeof selection.endColumn === "number") {
        editor.setSelection(selection);
        editor.revealRangeInCenter(selection, ScrollType.Immediate);
      } else {
        const pos = {
          lineNumber: selection.startLineNumber,
          column: selection.startColumn
        };
        editor.setPosition(pos);
        editor.revealPositionInCenter(pos, ScrollType.Immediate);
      }
    }
    return editor;
  }
  findModel(editor, resource) {
    const model = editor.getModel();
    if (model && model.uri.toString() !== resource.toString()) {
      return null;
    }
    return model;
  }
};
StandaloneCodeEditorService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IThemeService)
], StandaloneCodeEditorService);
registerSingleton(ICodeEditorService, StandaloneCodeEditorService, InstantiationType.Eager);
export {
  StandaloneCodeEditorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZUNvZGVFZGl0b3JTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgd2luZG93T3Blbk5vT3BlbmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvYWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTdGFuZGFsb25lQ29kZUVkaXRvclNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdENvZGVFZGl0b3JTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JJc09wZW46IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF9hY3RpdmVDb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uQ29kZUVkaXRvckFkZCgoKSA9PiB0aGlzLl9jaGVja0NvbnRleHRLZXkoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25Db2RlRWRpdG9yUmVtb3ZlKCgpID0+IHRoaXMuX2NoZWNrQ29udGV4dEtleSgpKSk7XG5cdFx0dGhpcy5fZWRpdG9ySXNPcGVuID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdlZGl0b3JJc09wZW4nLCBmYWxzZSk7XG5cdFx0dGhpcy5fYWN0aXZlQ29kZUVkaXRvciA9IG51bGw7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlZ2lzdGVyQ29kZUVkaXRvck9wZW5IYW5kbGVyKGFzeW5jIChpbnB1dCwgc291cmNlLCBzaWRlQnlTaWRlKSA9PiB7XG5cdFx0XHRpZiAoIXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmRvT3BlbkVkaXRvcihzb3VyY2UsIGlucHV0KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja0NvbnRleHRLZXkoKTogdm9pZCB7XG5cdFx0bGV0IGhhc0NvZGVFZGl0b3IgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLmxpc3RDb2RlRWRpdG9ycygpKSB7XG5cdFx0XHRpZiAoIWVkaXRvci5pc1NpbXBsZVdpZGdldCkge1xuXHRcdFx0XHRoYXNDb2RlRWRpdG9yID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2VkaXRvcklzT3Blbi5zZXQoaGFzQ29kZUVkaXRvcik7XG5cdH1cblxuXHRwdWJsaWMgc2V0QWN0aXZlQ29kZUVkaXRvcihhY3RpdmVDb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVDb2RlRWRpdG9yID0gYWN0aXZlQ29kZUVkaXRvcjtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3RpdmVDb2RlRWRpdG9yKCk6IElDb2RlRWRpdG9yIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUNvZGVFZGl0b3I7XG5cdH1cblxuXG5cdHByaXZhdGUgZG9PcGVuRWRpdG9yKGVkaXRvcjogSUNvZGVFZGl0b3IsIGlucHV0OiBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpOiBJQ29kZUVkaXRvciB8IG51bGwge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5maW5kTW9kZWwoZWRpdG9yLCBpbnB1dC5yZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0aWYgKGlucHV0LnJlc291cmNlKSB7XG5cblx0XHRcdFx0Y29uc3Qgc2NoZW1hID0gaW5wdXQucmVzb3VyY2Uuc2NoZW1lO1xuXHRcdFx0XHRpZiAoc2NoZW1hID09PSBTY2hlbWFzLmh0dHAgfHwgc2NoZW1hID09PSBTY2hlbWFzLmh0dHBzKSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBpcyBhIGZ1bGx5IHF1YWxpZmllZCBodHRwIG9yIGh0dHBzIFVSTFxuXHRcdFx0XHRcdHdpbmRvd09wZW5Ob09wZW5lcihpbnB1dC5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSA8SVJhbmdlPihpbnB1dC5vcHRpb25zID8gaW5wdXQub3B0aW9ucy5zZWxlY3Rpb24gOiBudWxsKTtcblx0XHRpZiAoc2VsZWN0aW9uKSB7XG5cdFx0XHRpZiAodHlwZW9mIHNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyID09PSAnbnVtYmVyJyAmJiB0eXBlb2Ygc2VsZWN0aW9uLmVuZENvbHVtbiA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihzZWxlY3Rpb24pO1xuXHRcdFx0XHRlZGl0b3IucmV2ZWFsUmFuZ2VJbkNlbnRlcihzZWxlY3Rpb24sIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHBvcyA9IHtcblx0XHRcdFx0XHRsaW5lTnVtYmVyOiBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdGNvbHVtbjogc2VsZWN0aW9uLnN0YXJ0Q29sdW1uXG5cdFx0XHRcdH07XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdFx0XHRlZGl0b3IucmV2ZWFsUG9zaXRpb25JbkNlbnRlcihwb3MsIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdG9yO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kTW9kZWwoZWRpdG9yOiBJQ29kZUVkaXRvciwgcmVzb3VyY2U6IFVSSSk6IElUZXh0TW9kZWwgfCBudWxsIHtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCAmJiBtb2RlbC51cmkudG9TdHJpbmcoKSAhPT0gcmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDb2RlRWRpdG9yU2VydmljZSwgU3RhbmRhbG9uZUNvZGVFZGl0b3JTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUd4QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGtCQUFrQjtBQUUzQixTQUFzQiwwQkFBMEI7QUFFaEQsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMscUJBQXFC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
