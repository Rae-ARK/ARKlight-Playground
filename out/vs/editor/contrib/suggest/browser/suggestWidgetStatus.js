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
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { MenuEntryActionViewItem, TextOnlyMenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
let SuggestWidgetStatus = class {
  constructor(container, _menuId, options, instantiationService, _menuService, _contextKeyService) {
    this._menuId = _menuId;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._menuDisposables = new DisposableStore();
    this.element = dom.append(container, dom.$(".suggest-status-bar"));
    const actionViewItemProvider = ((action) => {
      if (options?.showIconsNoKeybindings) {
        return action instanceof MenuItemAction ? instantiationService.createInstance(MenuEntryActionViewItem, action, void 0) : void 0;
      } else {
        return action instanceof MenuItemAction ? instantiationService.createInstance(TextOnlyMenuEntryActionViewItem, action, { useComma: false }) : void 0;
      }
    });
    this._leftActions = new ActionBar(this.element, { actionViewItemProvider });
    this._rightActions = new ActionBar(this.element, { actionViewItemProvider });
    this._leftActions.domNode.classList.add("left");
    this._rightActions.domNode.classList.add("right");
  }
  dispose() {
    this._menuDisposables.dispose();
    this._leftActions.dispose();
    this._rightActions.dispose();
    this.element.remove();
  }
  show() {
    const menu = this._menuService.createMenu(this._menuId, this._contextKeyService);
    const renderMenu = () => {
      const left = [];
      const right = [];
      for (const [group, actions] of menu.getActions()) {
        if (group === "left") {
          left.push(...actions);
        } else {
          right.push(...actions);
        }
      }
      this._leftActions.clear();
      this._leftActions.push(left);
      this._rightActions.clear();
      this._rightActions.push(right);
    };
    this._menuDisposables.add(menu.onDidChange(() => renderMenu()));
    this._menuDisposables.add(menu);
  }
  hide() {
    this._menuDisposables.clear();
  }
};
SuggestWidgetStatus = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService)
], SuggestWidgetStatus);
export {
  SuggestWidgetStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0V2lkZ2V0U3RhdHVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgVGV4dE9ubHlNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN1Z2dlc3RXaWRnZXRTdGF0dXNPcHRpb25zIHtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gc2hvdyBpY29ucyBpbnN0ZWFkIG9mIHRleHQgd2hlcmUgcG9zc2libGUgYW5kIGF2b2lkXG5cdCAqIGtleWJpbmRpbmdzIGFsbCB0b2dldGhlci5cblx0ICovXG5cdHJlYWRvbmx5IHNob3dJY29uc05vS2V5YmluZGluZ3M/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgU3VnZ2VzdFdpZGdldFN0YXR1cyB7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGVmdEFjdGlvbnM6IEFjdGlvbkJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmlnaHRBY3Rpb25zOiBBY3Rpb25CYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbnVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21lbnVJZDogTWVudUlkLFxuXHRcdG9wdGlvbnM6IElTdWdnZXN0V2lkZ2V0U3RhdHVzT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5lbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc3VnZ2VzdC1zdGF0dXMtYmFyJykpO1xuXG5cdFx0Y29uc3QgYWN0aW9uVmlld0l0ZW1Qcm92aWRlciA9IDxJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcj4oYWN0aW9uID0+IHtcblx0XHRcdGlmIChvcHRpb25zPy5zaG93SWNvbnNOb0tleWJpbmRpbmdzKSB7XG5cdFx0XHRcdHJldHVybiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiA/IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHVuZGVmaW5lZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24gPyBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0T25seU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgdXNlQ29tbWE6IGZhbHNlIH0pIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2xlZnRBY3Rpb25zID0gbmV3IEFjdGlvbkJhcih0aGlzLmVsZW1lbnQsIHsgYWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9KTtcblx0XHR0aGlzLl9yaWdodEFjdGlvbnMgPSBuZXcgQWN0aW9uQmFyKHRoaXMuZWxlbWVudCwgeyBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0pO1xuXG5cdFx0dGhpcy5fbGVmdEFjdGlvbnMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdsZWZ0Jyk7XG5cdFx0dGhpcy5fcmlnaHRBY3Rpb25zLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgncmlnaHQnKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWVudURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9sZWZ0QWN0aW9ucy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcmlnaHRBY3Rpb25zLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlKCk7XG5cdH1cblxuXHRzaG93KCk6IHZvaWQge1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9tZW51U2VydmljZS5jcmVhdGVNZW51KHRoaXMuX21lbnVJZCwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJlbmRlck1lbnUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBsZWZ0OiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdGNvbnN0IHJpZ2h0OiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgW2dyb3VwLCBhY3Rpb25zXSBvZiBtZW51LmdldEFjdGlvbnMoKSkge1xuXHRcdFx0XHRpZiAoZ3JvdXAgPT09ICdsZWZ0Jykge1xuXHRcdFx0XHRcdGxlZnQucHVzaCguLi5hY3Rpb25zKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyaWdodC5wdXNoKC4uLmFjdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sZWZ0QWN0aW9ucy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fbGVmdEFjdGlvbnMucHVzaChsZWZ0KTtcblx0XHRcdHRoaXMuX3JpZ2h0QWN0aW9ucy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fcmlnaHRBY3Rpb25zLnB1c2gocmlnaHQpO1xuXHRcdH07XG5cdFx0dGhpcy5fbWVudURpc3Bvc2FibGVzLmFkZChtZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHJlbmRlck1lbnUoKSkpO1xuXHRcdHRoaXMuX21lbnVEaXNwb3NhYmxlcy5hZGQobWVudSk7XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX21lbnVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUEwQztBQUVuRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5Qix1Q0FBdUM7QUFDekUsU0FBUyxjQUFzQixzQkFBc0I7QUFDckQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFVL0IsSUFBTSxzQkFBTixNQUEwQjtBQUFBLEVBUWhDLFlBQ0MsV0FDaUIsU0FDakIsU0FDdUIsc0JBQ0QsY0FDTSxvQkFDM0I7QUFMZ0I7QUFHSztBQUNNO0FBUjdCLFNBQWlCLG1CQUFtQixJQUFJLGdCQUFnQjtBQVV2RCxTQUFLLFVBQVUsSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLHFCQUFxQixDQUFDO0FBRWpFLFVBQU0sMEJBQW1ELFlBQVU7QUFDbEUsVUFBSSxTQUFTLHdCQUF3QjtBQUNwQyxlQUFPLGtCQUFrQixpQkFBaUIscUJBQXFCLGVBQWUseUJBQXlCLFFBQVEsTUFBUyxJQUFJO0FBQUEsTUFDN0gsT0FBTztBQUNOLGVBQU8sa0JBQWtCLGlCQUFpQixxQkFBcUIsZUFBZSxpQ0FBaUMsUUFBUSxFQUFFLFVBQVUsTUFBTSxDQUFDLElBQUk7QUFBQSxNQUMvSTtBQUFBLElBQ0Q7QUFDQSxTQUFLLGVBQWUsSUFBSSxVQUFVLEtBQUssU0FBUyxFQUFFLHVCQUF1QixDQUFDO0FBQzFFLFNBQUssZ0JBQWdCLElBQUksVUFBVSxLQUFLLFNBQVMsRUFBRSx1QkFBdUIsQ0FBQztBQUUzRSxTQUFLLGFBQWEsUUFBUSxVQUFVLElBQUksTUFBTTtBQUM5QyxTQUFLLGNBQWMsUUFBUSxVQUFVLElBQUksT0FBTztBQUFBLEVBQ2pEO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssaUJBQWlCLFFBQVE7QUFDOUIsU0FBSyxhQUFhLFFBQVE7QUFDMUIsU0FBSyxjQUFjLFFBQVE7QUFDM0IsU0FBSyxRQUFRLE9BQU87QUFBQSxFQUNyQjtBQUFBLEVBRUEsT0FBYTtBQUNaLFVBQU0sT0FBTyxLQUFLLGFBQWEsV0FBVyxLQUFLLFNBQVMsS0FBSyxrQkFBa0I7QUFDL0UsVUFBTSxhQUFhLE1BQU07QUFDeEIsWUFBTSxPQUFrQixDQUFDO0FBQ3pCLFlBQU0sUUFBbUIsQ0FBQztBQUMxQixpQkFBVyxDQUFDLE9BQU8sT0FBTyxLQUFLLEtBQUssV0FBVyxHQUFHO0FBQ2pELFlBQUksVUFBVSxRQUFRO0FBQ3JCLGVBQUssS0FBSyxHQUFHLE9BQU87QUFBQSxRQUNyQixPQUFPO0FBQ04sZ0JBQU0sS0FBSyxHQUFHLE9BQU87QUFBQSxRQUN0QjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGFBQWEsTUFBTTtBQUN4QixXQUFLLGFBQWEsS0FBSyxJQUFJO0FBQzNCLFdBQUssY0FBYyxNQUFNO0FBQ3pCLFdBQUssY0FBYyxLQUFLLEtBQUs7QUFBQSxJQUM5QjtBQUNBLFNBQUssaUJBQWlCLElBQUksS0FBSyxZQUFZLE1BQU0sV0FBVyxDQUFDLENBQUM7QUFDOUQsU0FBSyxpQkFBaUIsSUFBSSxJQUFJO0FBQUEsRUFDL0I7QUFBQSxFQUVBLE9BQWE7QUFDWixTQUFLLGlCQUFpQixNQUFNO0FBQUEsRUFDN0I7QUFDRDtBQS9EYSxzQkFBTjtBQUFBLEVBWUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBZFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
