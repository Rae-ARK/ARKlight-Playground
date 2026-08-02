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
import "./media/chatExtensionsContent.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ExtensionsList, getExtensions } from "../../../../extensions/browser/extensionsViewer.js";
import { IExtensionsWorkbenchService } from "../../../../extensions/common/extensions.js";
import { ChatViewId } from "../../chat.js";
import { PagedModel } from "../../../../../../base/common/paging.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
let ChatExtensionsContentPart = class extends Disposable {
  constructor(extensionsContent, extensionsWorkbenchService, instantiationService) {
    super();
    this.extensionsContent = extensionsContent;
    this.domNode = dom.$(".chat-extensions-content-part");
    const loadingElement = dom.append(this.domNode, dom.$(".loading-extensions-element"));
    dom.append(loadingElement, dom.$(ThemeIcon.asCSSSelector(ThemeIcon.modify(Codicon.loading, "spin"))), dom.$("span.loading-message", void 0, localize("chat.extensions.loading", "Loading extensions...")));
    const extensionsList = dom.append(this.domNode, dom.$(".extensions-list"));
    const list = this._register(instantiationService.createInstance(ExtensionsList, extensionsList, ChatViewId, { alwaysConsumeMouseWheel: false }, { onFocus: Event.None, onBlur: Event.None, filters: {} }));
    getExtensions(extensionsContent.extensions, extensionsWorkbenchService).then((extensions) => {
      loadingElement.remove();
      if (this._store.isDisposed) {
        return;
      }
      list.setModel(new PagedModel(extensions));
      list.layout();
    });
  }
  get codeblocks() {
    return [];
  }
  get codeblocksPartId() {
    return void 0;
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "extensions" && other.extensions.length === this.extensionsContent.extensions.length && other.extensions.every((ext) => this.extensionsContent.extensions.includes(ext));
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatExtensionsContentPart = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IInstantiationService)
], ChatExtensionsContentPart);
export {
  ChatExtensionsContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRFeHRlbnNpb25zQ29udGVudC5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNMaXN0LCBnZXRFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvbnNWaWV3ZXIuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEV4dGVuc2lvbnNDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVuZGVyZXJDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBDaGF0Vmlld0lkLCBJQ2hhdENvZGVCbG9ja0luZm8gfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgUGFnZWRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhZ2luZy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRFeHRlbnNpb25zQ29udGVudFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRDb250ZW50UGFydCB7XG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3MoKTogSUNoYXRDb2RlQmxvY2tJbmZvW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29kZWJsb2Nrc1BhcnRJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNDb250ZW50OiBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmNoYXQtZXh0ZW5zaW9ucy1jb250ZW50LXBhcnQnKTtcblx0XHRjb25zdCBsb2FkaW5nRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmxvYWRpbmctZXh0ZW5zaW9ucy1lbGVtZW50JykpO1xuXHRcdGRvbS5hcHBlbmQobG9hZGluZ0VsZW1lbnQsIGRvbS4kKFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpKSksIGRvbS4kKCdzcGFuLmxvYWRpbmctbWVzc2FnZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ2NoYXQuZXh0ZW5zaW9ucy5sb2FkaW5nJywgJ0xvYWRpbmcgZXh0ZW5zaW9ucy4uLicpKSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zTGlzdCA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmV4dGVuc2lvbnMtbGlzdCcpKTtcblx0XHRjb25zdCBsaXN0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc0xpc3QsIGV4dGVuc2lvbnNMaXN0LCBDaGF0Vmlld0lkLCB7IGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiBmYWxzZSB9LCB7IG9uRm9jdXM6IEV2ZW50Lk5vbmUsIG9uQmx1cjogRXZlbnQuTm9uZSwgZmlsdGVyczoge30gfSkpO1xuXHRcdGdldEV4dGVuc2lvbnMoZXh0ZW5zaW9uc0NvbnRlbnQuZXh0ZW5zaW9ucywgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpLnRoZW4oZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRsb2FkaW5nRWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxpc3Quc2V0TW9kZWwobmV3IFBhZ2VkTW9kZWwoZXh0ZW5zaW9ucykpO1xuXHRcdFx0bGlzdC5sYXlvdXQoKTtcblx0XHR9KTtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09ICdleHRlbnNpb25zJyAmJiBvdGhlci5leHRlbnNpb25zLmxlbmd0aCA9PT0gdGhpcy5leHRlbnNpb25zQ29udGVudC5leHRlbnNpb25zLmxlbmd0aCAmJiBvdGhlci5leHRlbnNpb25zLmV2ZXJ5KGV4dCA9PiB0aGlzLmV4dGVuc2lvbnNDb250ZW50LmV4dGVuc2lvbnMuaW5jbHVkZXMoZXh0KSk7XG5cdH1cblxuXHRhZGREaXNwb3NhYmxlKGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0IscUJBQXFCO0FBQzlDLFNBQVMsbUNBQW1DO0FBRzVDLFNBQXVCLGtCQUFzQztBQUU3RCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFFbEIsSUFBTSw0QkFBTixjQUF3QyxXQUF1QztBQUFBLEVBV3JGLFlBQ2tCLG1CQUNZLDRCQUNOLHNCQUN0QjtBQUNELFVBQU07QUFKVztBQU1qQixTQUFLLFVBQVUsSUFBSSxFQUFFLCtCQUErQjtBQUNwRCxVQUFNLGlCQUFpQixJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksRUFBRSw2QkFBNkIsQ0FBQztBQUNwRixRQUFJLE9BQU8sZ0JBQWdCLElBQUksRUFBRSxVQUFVLGNBQWMsVUFBVSxPQUFPLFFBQVEsU0FBUyxNQUFNLENBQUMsQ0FBQyxHQUFHLElBQUksRUFBRSx3QkFBd0IsUUFBVyxTQUFTLDJCQUEyQix1QkFBdUIsQ0FBQyxDQUFDO0FBRTVNLFVBQU0saUJBQWlCLElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxFQUFFLGtCQUFrQixDQUFDO0FBQ3pFLFVBQU0sT0FBTyxLQUFLLFVBQVUscUJBQXFCLGVBQWUsZ0JBQWdCLGdCQUFnQixZQUFZLEVBQUUseUJBQXlCLE1BQU0sR0FBRyxFQUFFLFNBQVMsTUFBTSxNQUFNLFFBQVEsTUFBTSxNQUFNLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUN6TSxrQkFBYyxrQkFBa0IsWUFBWSwwQkFBMEIsRUFBRSxLQUFLLGdCQUFjO0FBQzFGLHFCQUFlLE9BQU87QUFDdEIsVUFBSSxLQUFLLE9BQU8sWUFBWTtBQUMzQjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFNBQVMsSUFBSSxXQUFXLFVBQVUsQ0FBQztBQUN4QyxXQUFLLE9BQU87QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGO0FBQUEsRUE3QkEsSUFBVyxhQUFtQztBQUM3QyxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQUEsRUFFQSxJQUFXLG1CQUF1QztBQUNqRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBeUJBLGVBQWUsT0FBNkIsa0JBQTBDLFNBQWdDO0FBQ3JILFdBQU8sTUFBTSxTQUFTLGdCQUFnQixNQUFNLFdBQVcsV0FBVyxLQUFLLGtCQUFrQixXQUFXLFVBQVUsTUFBTSxXQUFXLE1BQU0sU0FBTyxLQUFLLGtCQUFrQixXQUFXLFNBQVMsR0FBRyxDQUFDO0FBQUEsRUFDNUw7QUFBQSxFQUVBLGNBQWMsWUFBK0I7QUFDNUMsU0FBSyxVQUFVLFVBQVU7QUFBQSxFQUMxQjtBQUNEO0FBekNhLDRCQUFOO0FBQUEsRUFhSjtBQUFBLEVBQ0E7QUFBQSxHQWRVOyIsCiAgIm5hbWVzIjogW10KfQo=
