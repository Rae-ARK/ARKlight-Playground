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
import { IModelService } from "./model.js";
import { ITextModelService } from "./resolverService.js";
import { Disposable, dispose } from "../../../base/common/lifecycle.js";
import { IUndoRedoService } from "../../../platform/undoRedo/common/undoRedo.js";
import { MultiModelEditStackElement } from "../model/editStack.js";
let ModelUndoRedoParticipant = class extends Disposable {
  constructor(_modelService, _textModelService, _undoRedoService) {
    super();
    this._modelService = _modelService;
    this._textModelService = _textModelService;
    this._undoRedoService = _undoRedoService;
    this._register(this._modelService.onModelRemoved((model) => {
      const elements = this._undoRedoService.getElements(model.uri);
      if (elements.past.length === 0 && elements.future.length === 0) {
        return;
      }
      for (const element of elements.past) {
        if (element instanceof MultiModelEditStackElement) {
          element.setDelegate(this);
        }
      }
      for (const element of elements.future) {
        if (element instanceof MultiModelEditStackElement) {
          element.setDelegate(this);
        }
      }
    }));
  }
  prepareUndoRedo(element) {
    const missingModels = element.getMissingModels();
    if (missingModels.length === 0) {
      return Disposable.None;
    }
    const disposablesPromises = missingModels.map(async (uri) => {
      try {
        const reference = await this._textModelService.createModelReference(uri);
        return reference;
      } catch (err) {
        return Disposable.None;
      }
    });
    return Promise.all(disposablesPromises).then((disposables) => {
      return {
        dispose: () => dispose(disposables)
      };
    });
  }
};
ModelUndoRedoParticipant = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, ITextModelService),
  __decorateParam(2, IUndoRedoService)
], ModelUndoRedoParticipant);
export {
  ModelUndoRedoParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxVbmRvUmVkb1BhcnRpY2lwYW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IElVbmRvUmVkb0RlbGVnYXRlLCBNdWx0aU1vZGVsRWRpdFN0YWNrRWxlbWVudCB9IGZyb20gJy4uL21vZGVsL2VkaXRTdGFjay5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNb2RlbFVuZG9SZWRvUGFydGljaXBhbnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVVuZG9SZWRvRGVsZWdhdGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJVW5kb1JlZG9TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VuZG9SZWRvU2VydmljZTogSVVuZG9SZWRvU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tb2RlbFNlcnZpY2Uub25Nb2RlbFJlbW92ZWQoKG1vZGVsKSA9PiB7XG5cdFx0XHQvLyBhIG1vZGVsIHdpbGwgZ2V0IGRpc3Bvc2VkLCBzbyBsZXQncyBjaGVjayBpZiB0aGUgdW5kbyByZWRvIHN0YWNrIGlzIG1haW50YWluZWRcblx0XHRcdGNvbnN0IGVsZW1lbnRzID0gdGhpcy5fdW5kb1JlZG9TZXJ2aWNlLmdldEVsZW1lbnRzKG1vZGVsLnVyaSk7XG5cdFx0XHRpZiAoZWxlbWVudHMucGFzdC5sZW5ndGggPT09IDAgJiYgZWxlbWVudHMuZnV0dXJlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMucGFzdCkge1xuXHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50KSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zZXREZWxlZ2F0ZSh0aGlzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzLmZ1dHVyZSkge1xuXHRcdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE11bHRpTW9kZWxFZGl0U3RhY2tFbGVtZW50KSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zZXREZWxlZ2F0ZSh0aGlzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBwcmVwYXJlVW5kb1JlZG8oZWxlbWVudDogTXVsdGlNb2RlbEVkaXRTdGFja0VsZW1lbnQpOiBJRGlzcG9zYWJsZSB8IFByb21pc2U8SURpc3Bvc2FibGU+IHtcblx0XHQvLyBMb2FkIGFsbCB0aGUgbmVlZGVkIHRleHQgbW9kZWxzXG5cdFx0Y29uc3QgbWlzc2luZ01vZGVscyA9IGVsZW1lbnQuZ2V0TWlzc2luZ01vZGVscygpO1xuXHRcdGlmIChtaXNzaW5nTW9kZWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gQWxsIG1vZGVscyBhcmUgYXZhaWxhYmxlIVxuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlc1Byb21pc2VzID0gbWlzc2luZ01vZGVscy5tYXAoYXN5bmMgKHVyaSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh1cmkpO1xuXHRcdFx0XHRyZXR1cm4gPElEaXNwb3NhYmxlPnJlZmVyZW5jZTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHQvLyBUaGlzIG1vZGVsIGNvdWxkIG5vdCBiZSBsb2FkZWQsIG1heWJlIGl0IHdhcyBkZWxldGVkIGluIHRoZSBtZWFudGltZT9cblx0XHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBQcm9taXNlLmFsbChkaXNwb3NhYmxlc1Byb21pc2VzKS50aGVuKGRpc3Bvc2FibGVzID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2UoZGlzcG9zYWJsZXMpXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBeUIsZUFBZTtBQUNqRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUE0QixrQ0FBa0M7QUFFdkQsSUFBTSwyQkFBTixjQUF1QyxXQUF3QztBQUFBLEVBQ3JGLFlBQ2lDLGVBQ0ksbUJBQ0Qsa0JBQ2xDO0FBQ0QsVUFBTTtBQUowQjtBQUNJO0FBQ0Q7QUFHbkMsU0FBSyxVQUFVLEtBQUssY0FBYyxlQUFlLENBQUMsVUFBVTtBQUUzRCxZQUFNLFdBQVcsS0FBSyxpQkFBaUIsWUFBWSxNQUFNLEdBQUc7QUFDNUQsVUFBSSxTQUFTLEtBQUssV0FBVyxLQUFLLFNBQVMsT0FBTyxXQUFXLEdBQUc7QUFDL0Q7QUFBQSxNQUNEO0FBQ0EsaUJBQVcsV0FBVyxTQUFTLE1BQU07QUFDcEMsWUFBSSxtQkFBbUIsNEJBQTRCO0FBQ2xELGtCQUFRLFlBQVksSUFBSTtBQUFBLFFBQ3pCO0FBQUEsTUFDRDtBQUNBLGlCQUFXLFdBQVcsU0FBUyxRQUFRO0FBQ3RDLFlBQUksbUJBQW1CLDRCQUE0QjtBQUNsRCxrQkFBUSxZQUFZLElBQUk7QUFBQSxRQUN6QjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVPLGdCQUFnQixTQUF5RTtBQUUvRixVQUFNLGdCQUFnQixRQUFRLGlCQUFpQjtBQUMvQyxRQUFJLGNBQWMsV0FBVyxHQUFHO0FBRS9CLGFBQU8sV0FBVztBQUFBLElBQ25CO0FBRUEsVUFBTSxzQkFBc0IsY0FBYyxJQUFJLE9BQU8sUUFBUTtBQUM1RCxVQUFJO0FBQ0gsY0FBTSxZQUFZLE1BQU0sS0FBSyxrQkFBa0IscUJBQXFCLEdBQUc7QUFDdkUsZUFBb0I7QUFBQSxNQUNyQixTQUFTLEtBQUs7QUFFYixlQUFPLFdBQVc7QUFBQSxNQUNuQjtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sUUFBUSxJQUFJLG1CQUFtQixFQUFFLEtBQUssaUJBQWU7QUFDM0QsYUFBTztBQUFBLFFBQ04sU0FBUyxNQUFNLFFBQVEsV0FBVztBQUFBLE1BQ25DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBbERhLDJCQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
