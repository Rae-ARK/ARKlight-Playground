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
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { getEditorFeatures } from "../../../../editor/common/editorFeatures.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
let EditorFeaturesInstantiator = class extends Disposable {
  constructor(codeEditorService, _instantiationService) {
    super();
    this._instantiationService = _instantiationService;
    this._instantiated = false;
    this._register(codeEditorService.onWillCreateCodeEditor(() => this._instantiate()));
    this._register(codeEditorService.onWillCreateDiffEditor(() => this._instantiate()));
    if (codeEditorService.listCodeEditors().length > 0 || codeEditorService.listDiffEditors().length > 0) {
      this._instantiate();
    }
  }
  _instantiate() {
    if (this._instantiated) {
      return;
    }
    this._instantiated = true;
    const editorFeatures = getEditorFeatures();
    for (const feature of editorFeatures) {
      try {
        const instance = this._instantiationService.createInstance(feature);
        if (typeof instance.dispose === "function") {
          this._register(instance);
        }
      } catch (err) {
        onUnexpectedError(err);
      }
    }
  }
};
EditorFeaturesInstantiator.ID = "workbench.contrib.editorFeaturesInstantiator";
EditorFeaturesInstantiator = __decorateClass([
  __decorateParam(0, ICodeEditorService),
  __decorateParam(1, IInstantiationService)
], EditorFeaturesInstantiator);
registerWorkbenchContribution2(EditorFeaturesInstantiator.ID, EditorFeaturesInstantiator, WorkbenchPhase.BlockRestore);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9lZGl0b3JGZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldEVkaXRvckZlYXR1cmVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5cbmNsYXNzIEVkaXRvckZlYXR1cmVzSW5zdGFudGlhdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5lZGl0b3JGZWF0dXJlc0luc3RhbnRpYXRvcic7XG5cblx0cHJpdmF0ZSBfaW5zdGFudGlhdGVkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29kZUVkaXRvclNlcnZpY2Uub25XaWxsQ3JlYXRlQ29kZUVkaXRvcigoKSA9PiB0aGlzLl9pbnN0YW50aWF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29kZUVkaXRvclNlcnZpY2Uub25XaWxsQ3JlYXRlRGlmZkVkaXRvcigoKSA9PiB0aGlzLl9pbnN0YW50aWF0ZSgpKSk7XG5cdFx0aWYgKGNvZGVFZGl0b3JTZXJ2aWNlLmxpc3RDb2RlRWRpdG9ycygpLmxlbmd0aCA+IDAgfHwgY29kZUVkaXRvclNlcnZpY2UubGlzdERpZmZFZGl0b3JzKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5faW5zdGFudGlhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pbnN0YW50aWF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5zdGFudGlhdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2luc3RhbnRpYXRlZCA9IHRydWU7XG5cblx0XHQvLyBJbnN0YW50aWF0ZSBhbGwgZWRpdG9yIGZlYXR1cmVzXG5cdFx0Y29uc3QgZWRpdG9yRmVhdHVyZXMgPSBnZXRFZGl0b3JGZWF0dXJlcygpO1xuXHRcdGZvciAoY29uc3QgZmVhdHVyZSBvZiBlZGl0b3JGZWF0dXJlcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShmZWF0dXJlKTtcblx0XHRcdFx0aWYgKHR5cGVvZiAoPElEaXNwb3NhYmxlPmluc3RhbmNlKS5kaXNwb3NlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoKDxJRGlzcG9zYWJsZT5pbnN0YW5jZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEVkaXRvckZlYXR1cmVzSW5zdGFudGlhdG9yLklELCBFZGl0b3JGZWF0dXJlc0luc3RhbnRpYXRvciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBaUMsZ0JBQWdCLHNDQUFzQztBQUV2RixJQUFNLDZCQUFOLGNBQXlDLFdBQTZDO0FBQUEsRUFNckYsWUFDcUIsbUJBQ29CLHVCQUN2QztBQUNELFVBQU07QUFGa0M7QUFKekMsU0FBUSxnQkFBZ0I7QUFRdkIsU0FBSyxVQUFVLGtCQUFrQix1QkFBdUIsTUFBTSxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQ2xGLFNBQUssVUFBVSxrQkFBa0IsdUJBQXVCLE1BQU0sS0FBSyxhQUFhLENBQUMsQ0FBQztBQUNsRixRQUFJLGtCQUFrQixnQkFBZ0IsRUFBRSxTQUFTLEtBQUssa0JBQWtCLGdCQUFnQixFQUFFLFNBQVMsR0FBRztBQUNyRyxXQUFLLGFBQWE7QUFBQSxJQUNuQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQXFCO0FBQzVCLFFBQUksS0FBSyxlQUFlO0FBQ3ZCO0FBQUEsSUFDRDtBQUNBLFNBQUssZ0JBQWdCO0FBR3JCLFVBQU0saUJBQWlCLGtCQUFrQjtBQUN6QyxlQUFXLFdBQVcsZ0JBQWdCO0FBQ3JDLFVBQUk7QUFDSCxjQUFNLFdBQVcsS0FBSyxzQkFBc0IsZUFBZSxPQUFPO0FBQ2xFLFlBQUksT0FBcUIsU0FBVSxZQUFZLFlBQVk7QUFDMUQsZUFBSyxVQUF3QixRQUFTO0FBQUEsUUFDdkM7QUFBQSxNQUNELFNBQVMsS0FBSztBQUNiLDBCQUFrQixHQUFHO0FBQUEsTUFDdEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBdENNLDJCQUVXLEtBQUs7QUFGaEIsNkJBQU47QUFBQSxFQU9HO0FBQUEsRUFDQTtBQUFBLEdBUkc7QUF3Q04sK0JBQStCLDJCQUEyQixJQUFJLDRCQUE0QixlQUFlLFlBQVk7IiwKICAibmFtZXMiOiBbXQp9Cg==
