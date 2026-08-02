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
import * as nls from "../../../../nls.js";
import * as path from "../../../../base/common/path.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
let LargeFileOptimizationsWarner = class extends Disposable {
  constructor(_editor, _notificationService, _configurationService) {
    super();
    this._editor = _editor;
    this._notificationService = _notificationService;
    this._configurationService = _configurationService;
    this._register(this._editor.onDidChangeModel((e) => this._update()));
    this._update();
  }
  _update() {
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    if (model.isTooLargeForTokenization()) {
      const message = nls.localize(
        {
          key: "largeFile",
          comment: [
            "Variable 0 will be a file name."
          ]
        },
        "{0}: tokenization, wrapping, folding, codelens, word highlighting and sticky scroll have been turned off for this large file in order to reduce memory usage and avoid freezing or crashing.",
        path.basename(model.uri.path)
      );
      this._notificationService.prompt(Severity.Info, message, [
        {
          label: nls.localize("removeOptimizations", "Forcefully Enable Features"),
          run: () => {
            this._configurationService.updateValue(`editor.largeFileOptimizations`, false).then(() => {
              this._notificationService.info(nls.localize("reopenFilePrompt", "Please reopen file in order for this setting to take effect."));
            }, (err) => {
              this._notificationService.error(err);
            });
          }
        }
      ], { neverShowAgain: { id: "editor.contrib.largeFileOptimizationsWarner" } });
    }
  }
};
LargeFileOptimizationsWarner.ID = "editor.contrib.largeFileOptimizationsWarner";
LargeFileOptimizationsWarner = __decorateClass([
  __decorateParam(1, INotificationService),
  __decorateParam(2, IConfigurationService)
], LargeFileOptimizationsWarner);
registerEditorContribution(LargeFileOptimizationsWarner.ID, LargeFileOptimizationsWarner, EditorContributionInstantiation.AfterFirstRender);
export {
  LargeFileOptimizationsWarner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9sYXJnZUZpbGVPcHRpbWl6YXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcblxuLyoqXG4gKiBTaG93cyBhIG1lc3NhZ2Ugd2hlbiBvcGVuaW5nIGEgbGFyZ2UgZmlsZSB3aGljaCBoYXMgYmVlbiBtZW1vcnkgb3B0aW1pemVkIChhbmQgZmVhdHVyZXMgZGlzYWJsZWQpLlxuICovXG5leHBvcnQgY2xhc3MgTGFyZ2VGaWxlT3B0aW1pemF0aW9uc1dhcm5lciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmxhcmdlRmlsZU9wdGltaXphdGlvbnNXYXJuZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKChlKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbC5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBubHMubG9jYWxpemUoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRrZXk6ICdsYXJnZUZpbGUnLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdCdWYXJpYWJsZSAwIHdpbGwgYmUgYSBmaWxlIG5hbWUuJ1xuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0XCJ7MH06IHRva2VuaXphdGlvbiwgd3JhcHBpbmcsIGZvbGRpbmcsIGNvZGVsZW5zLCB3b3JkIGhpZ2hsaWdodGluZyBhbmQgc3RpY2t5IHNjcm9sbCBoYXZlIGJlZW4gdHVybmVkIG9mZiBmb3IgdGhpcyBsYXJnZSBmaWxlIGluIG9yZGVyIHRvIHJlZHVjZSBtZW1vcnkgdXNhZ2UgYW5kIGF2b2lkIGZyZWV6aW5nIG9yIGNyYXNoaW5nLlwiLFxuXHRcdFx0XHRwYXRoLmJhc2VuYW1lKG1vZGVsLnVyaS5wYXRoKVxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgncmVtb3ZlT3B0aW1pemF0aW9ucycsIFwiRm9yY2VmdWxseSBFbmFibGUgRmVhdHVyZXNcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShgZWRpdG9yLmxhcmdlRmlsZU9wdGltaXphdGlvbnNgLCBmYWxzZSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuaW5mbyhubHMubG9jYWxpemUoJ3Jlb3BlbkZpbGVQcm9tcHQnLCBcIlBsZWFzZSByZW9wZW4gZmlsZSBpbiBvcmRlciBmb3IgdGhpcyBzZXR0aW5nIHRvIHRha2UgZWZmZWN0LlwiKSk7XG5cdFx0XHRcdFx0XHR9LCAoZXJyKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XSwgeyBuZXZlclNob3dBZ2FpbjogeyBpZDogJ2VkaXRvci5jb250cmliLmxhcmdlRmlsZU9wdGltaXphdGlvbnNXYXJuZXInIH0gfSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKExhcmdlRmlsZU9wdGltaXphdGlvbnNXYXJuZXIuSUQsIExhcmdlRmlsZU9wdGltaXphdGlvbnNXYXJuZXIsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQWZ0ZXJGaXJzdFJlbmRlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFVBQVU7QUFDdEIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxpQ0FBaUMsa0NBQWtDO0FBRTVFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUt4QyxJQUFNLCtCQUFOLGNBQTJDLFdBQTBDO0FBQUEsRUFJM0YsWUFDa0IsU0FDc0Isc0JBQ0MsdUJBQ3ZDO0FBQ0QsVUFBTTtBQUpXO0FBQ3NCO0FBQ0M7QUFJeEMsU0FBSyxVQUFVLEtBQUssUUFBUSxpQkFBaUIsQ0FBQyxNQUFNLEtBQUssUUFBUSxDQUFDLENBQUM7QUFDbkUsU0FBSyxRQUFRO0FBQUEsRUFDZDtBQUFBLEVBRVEsVUFBZ0I7QUFDdkIsVUFBTSxRQUFRLEtBQUssUUFBUSxTQUFTO0FBQ3BDLFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBRUEsUUFBSSxNQUFNLDBCQUEwQixHQUFHO0FBQ3RDLFlBQU0sVUFBVSxJQUFJO0FBQUEsUUFDbkI7QUFBQSxVQUNDLEtBQUs7QUFBQSxVQUNMLFNBQVM7QUFBQSxZQUNSO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsUUFDQSxLQUFLLFNBQVMsTUFBTSxJQUFJLElBQUk7QUFBQSxNQUM3QjtBQUVBLFdBQUsscUJBQXFCLE9BQU8sU0FBUyxNQUFNLFNBQVM7QUFBQSxRQUN4RDtBQUFBLFVBQ0MsT0FBTyxJQUFJLFNBQVMsdUJBQXVCLDRCQUE0QjtBQUFBLFVBQ3ZFLEtBQUssTUFBTTtBQUNWLGlCQUFLLHNCQUFzQixZQUFZLGlDQUFpQyxLQUFLLEVBQUUsS0FBSyxNQUFNO0FBQ3pGLG1CQUFLLHFCQUFxQixLQUFLLElBQUksU0FBUyxvQkFBb0IsOERBQThELENBQUM7QUFBQSxZQUNoSSxHQUFHLENBQUMsUUFBUTtBQUNYLG1CQUFLLHFCQUFxQixNQUFNLEdBQUc7QUFBQSxZQUNwQyxDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxNQUNELEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJLDhDQUE4QyxFQUFFLENBQUM7QUFBQSxJQUM3RTtBQUFBLEVBQ0Q7QUFDRDtBQS9DYSw2QkFFVyxLQUFLO0FBRmhCLCtCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVO0FBaURiLDJCQUEyQiw2QkFBNkIsSUFBSSw4QkFBOEIsZ0NBQWdDLGdCQUFnQjsiLAogICJuYW1lcyI6IFtdCn0K
