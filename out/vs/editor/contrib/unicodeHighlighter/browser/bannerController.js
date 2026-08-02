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
import "./bannerController.css";
import { localize } from "../../../../nls.js";
import { $, append, clearNode } from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Action } from "../../../../base/common/actions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { widgetClose } from "../../../../platform/theme/common/iconRegistry.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
const BANNER_ELEMENT_HEIGHT = 26;
let BannerController = class extends Disposable {
  constructor(_editor, instantiationService) {
    super();
    this._editor = _editor;
    this.instantiationService = instantiationService;
    this.banner = this._register(this.instantiationService.createInstance(Banner));
  }
  hide() {
    this._editor.setBanner(null, 0);
    this.banner.clear();
  }
  show(item) {
    this.banner.show({
      ...item,
      onClose: () => {
        this.hide();
        item.onClose?.();
      }
    });
    this._editor.setBanner(this.banner.element, BANNER_ELEMENT_HEIGHT);
  }
};
BannerController = __decorateClass([
  __decorateParam(1, IInstantiationService)
], BannerController);
let Banner = class extends Disposable {
  constructor(instantiationService, markdownRendererService) {
    super();
    this.instantiationService = instantiationService;
    this.markdownRendererService = markdownRendererService;
    this.element = $("div.editor-banner");
    this.element.tabIndex = 0;
  }
  getAriaLabel(item) {
    if (item.ariaLabel) {
      return item.ariaLabel;
    }
    if (typeof item.message === "string") {
      return item.message;
    }
    return void 0;
  }
  getBannerMessage(message) {
    if (typeof message === "string") {
      const element = $("span");
      element.innerText = message;
      return element;
    }
    return this.markdownRendererService.render(message).element;
  }
  clear() {
    clearNode(this.element);
  }
  show(item) {
    clearNode(this.element);
    const ariaLabel = this.getAriaLabel(item);
    if (ariaLabel) {
      this.element.setAttribute("aria-label", ariaLabel);
    }
    const iconContainer = append(this.element, $("div.icon-container"));
    iconContainer.setAttribute("aria-hidden", "true");
    if (item.icon) {
      iconContainer.appendChild($(`div${ThemeIcon.asCSSSelector(item.icon)}`));
    }
    const messageContainer = append(this.element, $("div.message-container"));
    messageContainer.setAttribute("aria-hidden", "true");
    messageContainer.appendChild(this.getBannerMessage(item.message));
    this.messageActionsContainer = append(this.element, $("div.message-actions-container"));
    if (item.actions) {
      for (const action of item.actions) {
        this._register(this.instantiationService.createInstance(Link, this.messageActionsContainer, { ...action, tabIndex: -1 }, {}));
      }
    }
    const actionBarContainer = append(this.element, $("div.action-container"));
    this.actionBar = this._register(new ActionBar(actionBarContainer));
    this.actionBar.push(this._register(
      new Action(
        "banner.close",
        localize("closeBanner", "Close Banner"),
        ThemeIcon.asClassName(widgetClose),
        true,
        () => {
          if (typeof item.onClose === "function") {
            item.onClose();
          }
        }
      )
    ), { icon: true, label: false });
    this.actionBar.setFocusable(false);
  }
};
Banner = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IMarkdownRendererService)
], Banner);
export {
  BannerController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3VuaWNvZGVIaWdobGlnaHRlci9icm93c2VyL2Jhbm5lckNvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICcuL2Jhbm5lckNvbnRyb2xsZXIuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgY2xlYXJOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlua0Rlc2NyaXB0b3IsIExpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvYnJvd3Nlci9saW5rLmpzJztcbmltcG9ydCB7IHdpZGdldENsb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuXG5jb25zdCBCQU5ORVJfRUxFTUVOVF9IRUlHSFQgPSAyNjtcblxuZXhwb3J0IGNsYXNzIEJhbm5lckNvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBiYW5uZXI6IEJhbm5lcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5iYW5uZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJhbm5lcikpO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKSB7XG5cdFx0dGhpcy5fZWRpdG9yLnNldEJhbm5lcihudWxsLCAwKTtcblx0XHR0aGlzLmJhbm5lci5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljIHNob3coaXRlbTogSUJhbm5lckl0ZW0pIHtcblx0XHR0aGlzLmJhbm5lci5zaG93KHtcblx0XHRcdC4uLml0ZW0sXG5cdFx0XHRvbkNsb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0XHRpdGVtLm9uQ2xvc2U/LigpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2VkaXRvci5zZXRCYW5uZXIodGhpcy5iYW5uZXIuZWxlbWVudCwgQkFOTkVSX0VMRU1FTlRfSEVJR0hUKTtcblx0fVxufVxuXG4vLyBUT0RPQGhlZGlldDogSW52ZXN0aWdhdGUgaWYgdGhpcyBjYW4gYmUgcmV1c2VkIGJ5IHRoZSB3b3Jrc3BhY2UgYmFubmVyIChiYW5uZXJQYXJ0LnRzKS5cbmNsYXNzIEJhbm5lciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBtZXNzYWdlQWN0aW9uc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBhY3Rpb25CYXI6IEFjdGlvbkJhciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9ICQoJ2Rpdi5lZGl0b3ItYmFubmVyJyk7XG5cdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gMDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QXJpYUxhYmVsKGl0ZW06IElCYW5uZXJJdGVtKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXRlbS5hcmlhTGFiZWwpIHtcblx0XHRcdHJldHVybiBpdGVtLmFyaWFMYWJlbDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBpdGVtLm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gaXRlbS5tZXNzYWdlO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEJhbm5lck1lc3NhZ2UobWVzc2FnZTogTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG5cdFx0aWYgKHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9ICQoJ3NwYW4nKTtcblx0XHRcdGVsZW1lbnQuaW5uZXJUZXh0ID0gbWVzc2FnZTtcblx0XHRcdHJldHVybiBlbGVtZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihtZXNzYWdlKS5lbGVtZW50O1xuXHR9XG5cblx0cHVibGljIGNsZWFyKCkge1xuXHRcdGNsZWFyTm9kZSh0aGlzLmVsZW1lbnQpO1xuXHR9XG5cblx0cHVibGljIHNob3coaXRlbTogSUJhbm5lckl0ZW0pIHtcblx0XHQvLyBDbGVhciBwcmV2aW91cyBpdGVtXG5cdFx0Y2xlYXJOb2RlKHRoaXMuZWxlbWVudCk7XG5cblx0XHQvLyBCYW5uZXIgYXJpYSBsYWJlbFxuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IHRoaXMuZ2V0QXJpYUxhYmVsKGl0ZW0pO1xuXHRcdGlmIChhcmlhTGFiZWwpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXHRcdH1cblxuXHRcdC8vIEljb25cblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnZGl2Lmljb24tY29udGFpbmVyJykpO1xuXHRcdGljb25Db250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHRpZiAoaXRlbS5pY29uKSB7XG5cdFx0XHRpY29uQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoYGRpdiR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaXRlbS5pY29uKX1gKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWVzc2FnZVxuXHRcdGNvbnN0IG1lc3NhZ2VDb250YWluZXIgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdkaXYubWVzc2FnZS1jb250YWluZXInKSk7XG5cdFx0bWVzc2FnZUNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRtZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZ2V0QmFubmVyTWVzc2FnZShpdGVtLm1lc3NhZ2UpKTtcblxuXHRcdC8vIE1lc3NhZ2UgQWN0aW9uc1xuXHRcdHRoaXMubWVzc2FnZUFjdGlvbnNDb250YWluZXIgPSBhcHBlbmQodGhpcy5lbGVtZW50LCAkKCdkaXYubWVzc2FnZS1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHRpZiAoaXRlbS5hY3Rpb25zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBpdGVtLmFjdGlvbnMpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaW5rLCB0aGlzLm1lc3NhZ2VBY3Rpb25zQ29udGFpbmVyLCB7IC4uLmFjdGlvbiwgdGFiSW5kZXg6IC0xIH0sIHt9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWN0aW9uXG5cdFx0Y29uc3QgYWN0aW9uQmFyQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnZGl2LmFjdGlvbi1jb250YWluZXInKSk7XG5cdFx0dGhpcy5hY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGFjdGlvbkJhckNvbnRhaW5lcikpO1xuXHRcdHRoaXMuYWN0aW9uQmFyLnB1c2godGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRuZXcgQWN0aW9uKFxuXHRcdFx0XHQnYmFubmVyLmNsb3NlJyxcblx0XHRcdFx0bG9jYWxpemUoJ2Nsb3NlQmFubmVyJywgXCJDbG9zZSBCYW5uZXJcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZSh3aWRnZXRDbG9zZSksXG5cdFx0XHRcdHRydWUsXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGl0ZW0ub25DbG9zZSA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRcdFx0aXRlbS5vbkNsb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHQpXG5cdFx0KSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0dGhpcy5hY3Rpb25CYXIuc2V0Rm9jdXNhYmxlKGZhbHNlKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCYW5uZXJJdGVtIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtZXNzYWdlOiBzdHJpbmcgfCBNYXJrZG93blN0cmluZztcblx0cmVhZG9ubHkgYWN0aW9ucz86IElMaW5rRGVzY3JpcHRvcltdO1xuXHRyZWFkb25seSBhcmlhTGFiZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9uQ2xvc2U/OiAoKSA9PiB2b2lkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxPQUFPO0FBQ1AsU0FBUyxnQkFB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
