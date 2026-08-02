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
import "./media/chatReadOnlyBanner.css";
import * as dom from "../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
const CHAT_READ_ONLY_BANNER_HEIGHT = 26;
let ChatReadOnlyBanner = class extends Disposable {
  constructor(hoverService) {
    super();
    this._visible = false;
    this.domNode = dom.$(".chat-readonly-banner");
    this.domNode.setAttribute("role", "status");
    const icon = dom.append(this.domNode, dom.$(".chat-readonly-banner-icon"));
    const renderedIcon = renderIcon(Codicon.lock);
    renderedIcon.setAttribute("aria-hidden", "true");
    icon.appendChild(renderedIcon);
    const text = dom.append(this.domNode, dom.$("span.chat-readonly-banner-text"));
    const message = localize("chatReadOnlyBanner.message", "Archived sessions are read-only.");
    text.textContent = message;
    this._register(hoverService.setupDelayedHover(text, { content: message }));
    this.setVisible(false);
  }
  get visible() {
    return this._visible;
  }
  setVisible(visible) {
    this._visible = visible;
    this.domNode.classList.toggle("hidden", !visible);
  }
};
ChatReadOnlyBanner = __decorateClass([
  __decorateParam(0, IHoverService)
], ChatReadOnlyBanner);
export {
  CHAT_READ_ONLY_BANNER_HEIGHT,
  ChatReadOnlyBanner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFJlYWRPbmx5QmFubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRSZWFkT25seUJhbm5lci5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmV4cG9ydCBjb25zdCBDSEFUX1JFQURfT05MWV9CQU5ORVJfSEVJR0hUID0gMjY7XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVhZE9ubHlCYW5uZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIF92aXNpYmxlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJy5jaGF0LXJlYWRvbmx5LWJhbm5lcicpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnc3RhdHVzJyk7XG5cblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcuY2hhdC1yZWFkb25seS1iYW5uZXItaWNvbicpKTtcblx0XHRjb25zdCByZW5kZXJlZEljb24gPSByZW5kZXJJY29uKENvZGljb24ubG9jayk7XG5cdFx0cmVuZGVyZWRJY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGljb24uYXBwZW5kQ2hpbGQocmVuZGVyZWRJY29uKTtcblxuXHRcdGNvbnN0IHRleHQgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJ3NwYW4uY2hhdC1yZWFkb25seS1iYW5uZXItdGV4dCcpKTtcblx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ2NoYXRSZWFkT25seUJhbm5lci5tZXNzYWdlJywgXCJBcmNoaXZlZCBzZXNzaW9ucyBhcmUgcmVhZC1vbmx5LlwiKTtcblx0XHR0ZXh0LnRleHRDb250ZW50ID0gbWVzc2FnZTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGV4dCwgeyBjb250ZW50OiBtZXNzYWdlIH0pKTtcblxuXHRcdHRoaXMuc2V0VmlzaWJsZShmYWxzZSk7XG5cdH1cblxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZTtcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhdmlzaWJsZSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUI7QUFFdkIsTUFBTSwrQkFBK0I7QUFFckMsSUFBTSxxQkFBTixjQUFpQyxXQUFXO0FBQUEsRUFNbEQsWUFDZ0IsY0FDZDtBQUNELFVBQU07QUFMUCxTQUFRLFdBQVc7QUFPbEIsU0FBSyxVQUFVLElBQUksRUFBRSx1QkFBdUI7QUFDNUMsU0FBSyxRQUFRLGFBQWEsUUFBUSxRQUFRO0FBRTFDLFVBQU0sT0FBTyxJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksRUFBRSw0QkFBNEIsQ0FBQztBQUN6RSxVQUFNLGVBQWUsV0FBVyxRQUFRLElBQUk7QUFDNUMsaUJBQWEsYUFBYSxlQUFlLE1BQU07QUFDL0MsU0FBSyxZQUFZLFlBQVk7QUFFN0IsVUFBTSxPQUFPLElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxFQUFFLGdDQUFnQyxDQUFDO0FBQzdFLFVBQU0sVUFBVSxTQUFTLDhCQUE4QixrQ0FBa0M7QUFDekYsU0FBSyxjQUFjO0FBQ25CLFNBQUssVUFBVSxhQUFhLGtCQUFrQixNQUFNLEVBQUUsU0FBUyxRQUFRLENBQUMsQ0FBQztBQUV6RSxTQUFLLFdBQVcsS0FBSztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxJQUFJLFVBQW1CO0FBQ3RCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFdBQVcsU0FBd0I7QUFDbEMsU0FBSyxXQUFXO0FBQ2hCLFNBQUssUUFBUSxVQUFVLE9BQU8sVUFBVSxDQUFDLE9BQU87QUFBQSxFQUNqRDtBQUNEO0FBbkNhLHFCQUFOO0FBQUEsRUFPSjtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
