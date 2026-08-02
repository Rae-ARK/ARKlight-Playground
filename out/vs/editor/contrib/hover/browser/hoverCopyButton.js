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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { localize } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { SimpleButton } from "../../find/browser/findWidget.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
let HoverCopyButton = class extends Disposable {
  constructor(_container, _getContent, _clipboardService, _hoverService) {
    super();
    this._container = _container;
    this._getContent = _getContent;
    this._clipboardService = _clipboardService;
    this._hoverService = _hoverService;
    this._container.classList.add("hover-row-with-copy");
    this._button = this._register(new SimpleButton({
      label: localize("hover.copy", "Copy"),
      icon: Codicon.copy,
      onTrigger: () => this._copyContent(),
      className: "hover-copy-button"
    }, this._hoverService));
    this._container.appendChild(this._button.domNode);
  }
  async _copyContent() {
    const content = this._getContent();
    if (content) {
      await this._clipboardService.writeText(content);
      status(localize("hover.copied", "Copied to clipboard"));
    }
  }
};
HoverCopyButton = __decorateClass([
  __decorateParam(2, IClipboardService),
  __decorateParam(3, IHoverService)
], HoverCopyButton);
export {
  HoverCopyButton
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvaG92ZXJDb3B5QnV0dG9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgU2ltcGxlQnV0dG9uIH0gZnJvbSAnLi4vLi4vZmluZC9icm93c2VyL2ZpbmRXaWRnZXQuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5cbi8qKlxuICogQSBidXR0b24gdGhhdCBhcHBlYXJzIGluIGhvdmVyIHBhcnRzIHRvIGNvcHkgdGhlaXIgY29udGVudCB0byB0aGUgY2xpcGJvYXJkLlxuICovXG5leHBvcnQgY2xhc3MgSG92ZXJDb3B5QnV0dG9uIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnV0dG9uOiBTaW1wbGVCdXR0b247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRDb250ZW50OiAoKSA9PiBzdHJpbmcsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdob3Zlci1yb3ctd2l0aC1jb3B5Jyk7XG5cblx0XHR0aGlzLl9idXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgU2ltcGxlQnV0dG9uKHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaG92ZXIuY29weScsIFwiQ29weVwiKSxcblx0XHRcdGljb246IENvZGljb24uY29weSxcblx0XHRcdG9uVHJpZ2dlcjogKCkgPT4gdGhpcy5fY29weUNvbnRlbnQoKSxcblx0XHRcdGNsYXNzTmFtZTogJ2hvdmVyLWNvcHktYnV0dG9uJyxcblx0XHR9LCB0aGlzLl9ob3ZlclNlcnZpY2UpKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9idXR0b24uZG9tTm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb3B5Q29udGVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZW50ID0gdGhpcy5fZ2V0Q29udGVudCgpO1xuXHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChjb250ZW50KTtcblx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgnaG92ZXIuY29waWVkJywgXCJDb3BpZWQgdG8gY2xpcGJvYXJkXCIpKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsY0FBYztBQUtoQixJQUFNLGtCQUFOLGNBQThCLFdBQVc7QUFBQSxFQUkvQyxZQUNrQixZQUNBLGFBQ21CLG1CQUNKLGVBQy9CO0FBQ0QsVUFBTTtBQUxXO0FBQ0E7QUFDbUI7QUFDSjtBQUloQyxTQUFLLFdBQVcsVUFBVSxJQUFJLHFCQUFxQjtBQUVuRCxTQUFLLFVBQVUsS0FBSyxVQUFVLElBQUksYUFBYTtBQUFBLE1BQzlDLE9BQU8sU0FBUyxjQUFjLE1BQU07QUFBQSxNQUNwQyxNQUFNLFFBQVE7QUFBQSxNQUNkLFdBQVcsTUFBTSxLQUFLLGFBQWE7QUFBQSxNQUNuQyxXQUFXO0FBQUEsSUFDWixHQUFHLEtBQUssYUFBYSxDQUFDO0FBRXRCLFNBQUssV0FBVyxZQUFZLEtBQUssUUFBUSxPQUFPO0FBQUEsRUFDakQ7QUFBQSxFQUVBLE1BQWMsZUFBOEI7QUFDM0MsVUFBTSxVQUFVLEtBQUssWUFBWTtBQUNqQyxRQUFJLFNBQVM7QUFDWixZQUFNLEtBQUssa0JBQWtCLFVBQVUsT0FBTztBQUM5QyxhQUFPLFNBQVMsZ0JBQWdCLHFCQUFxQixDQUFDO0FBQUEsSUFDdkQ7QUFBQSxFQUNEO0FBQ0Q7QUEvQmEsa0JBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
