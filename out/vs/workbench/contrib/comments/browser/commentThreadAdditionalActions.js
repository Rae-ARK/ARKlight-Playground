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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../base/common/marshallingIds.js";
import { CommentFormActions } from "./commentFormActions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
let CommentThreadAdditionalActions = class extends Disposable {
  constructor(container, _commentThread, _contextKeyService, _commentMenus, _actionRunDelegate, _keybindingService, _contextMenuService) {
    super();
    this._commentThread = _commentThread;
    this._contextKeyService = _contextKeyService;
    this._commentMenus = _commentMenus;
    this._actionRunDelegate = _actionRunDelegate;
    this._keybindingService = _keybindingService;
    this._contextMenuService = _contextMenuService;
    this._container = dom.append(container, dom.$(".comment-additional-actions"));
    dom.append(this._container, dom.$(".section-separator"));
    this._buttonBar = dom.append(this._container, dom.$(".button-bar"));
    this._createAdditionalActions(this._buttonBar);
  }
  _showMenu() {
    this._container?.classList.remove("hidden");
  }
  _hideMenu() {
    this._container?.classList.add("hidden");
  }
  _enableDisableMenu(menu) {
    const groups = menu.getActions({ shouldForwardArgs: true });
    for (const group of groups) {
      const [, actions] = group;
      for (const action of actions) {
        if (action.enabled) {
          this._showMenu();
          return;
        }
        for (const subAction of action.actions ?? []) {
          if (subAction.enabled) {
            this._showMenu();
            return;
          }
        }
      }
    }
    this._hideMenu();
  }
  _createAdditionalActions(container) {
    const menu = this._commentMenus.getCommentThreadAdditionalActions(this._contextKeyService);
    this._register(menu);
    this._register(menu.onDidChange(() => {
      this._commentFormActions.setActions(
        menu,
        /*hasOnlySecondaryActions*/
        true
      );
      this._enableDisableMenu(menu);
    }));
    this._commentFormActions = new CommentFormActions(this._keybindingService, this._contextKeyService, this._contextMenuService, container, async (action) => {
      this._actionRunDelegate?.();
      action.run({
        thread: this._commentThread,
        $mid: MarshalledId.CommentThreadInstance
      });
    }, 4, true);
    this._register(this._commentFormActions);
    this._commentFormActions.setActions(
      menu,
      /*hasOnlySecondaryActions*/
      true
    );
    this._enableDisableMenu(menu);
  }
};
CommentThreadAdditionalActions = __decorateClass([
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IContextMenuService)
], CommentThreadAdditionalActions);
export {
  CommentThreadAdditionalActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvbW1lbnRzL2Jyb3dzZXIvY29tbWVudFRocmVhZEFkZGl0aW9uYWxBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuXG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWVudSwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCAqIGFzIGxhbmd1YWdlcyBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbW1lbnRGb3JtQWN0aW9ucyB9IGZyb20gJy4vY29tbWVudEZvcm1BY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1lbnRNZW51cyB9IGZyb20gJy4vY29tbWVudE1lbnVzLmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcblxuZXhwb3J0IGNsYXNzIENvbW1lbnRUaHJlYWRBZGRpdGlvbmFsQWN0aW9uczxUIGV4dGVuZHMgSVJhbmdlIHwgSUNlbGxSYW5nZT4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGw7XG5cdHByaXZhdGUgX2J1dHRvbkJhcjogSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRwcml2YXRlIF9jb21tZW50Rm9ybUFjdGlvbnMhOiBDb21tZW50Rm9ybUFjdGlvbnM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIF9jb21tZW50VGhyZWFkOiBsYW5ndWFnZXMuQ29tbWVudFRocmVhZDxUPixcblx0XHRwcml2YXRlIF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX2NvbW1lbnRNZW51czogQ29tbWVudE1lbnVzLFxuXHRcdHByaXZhdGUgX2FjdGlvblJ1bkRlbGVnYXRlOiAoKCkgPT4gdm9pZCkgfCBudWxsLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5jb21tZW50LWFkZGl0aW9uYWwtYWN0aW9ucycpKTtcblx0XHRkb20uYXBwZW5kKHRoaXMuX2NvbnRhaW5lciwgZG9tLiQoJy5zZWN0aW9uLXNlcGFyYXRvcicpKTtcblxuXHRcdHRoaXMuX2J1dHRvbkJhciA9IGRvbS5hcHBlbmQodGhpcy5fY29udGFpbmVyLCBkb20uJCgnLmJ1dHRvbi1iYXInKSk7XG5cdFx0dGhpcy5fY3JlYXRlQWRkaXRpb25hbEFjdGlvbnModGhpcy5fYnV0dG9uQmFyKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dNZW51KCkge1xuXHRcdHRoaXMuX2NvbnRhaW5lcj8uY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlTWVudSgpIHtcblx0XHR0aGlzLl9jb250YWluZXI/LmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5hYmxlRGlzYWJsZU1lbnUobWVudTogSU1lbnUpIHtcblx0XHRjb25zdCBncm91cHMgPSBtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblxuXHRcdC8vIFNob3cgdGhlIG1lbnUgaWYgYXQgbGVhc3Qgb25lIGFjdGlvbiBpcyBlbmFibGVkLlxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRjb25zdCBbLCBhY3Rpb25zXSA9IGdyb3VwO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmVuYWJsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9zaG93TWVudSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3Qgc3ViQWN0aW9uIG9mIChhY3Rpb24gYXMgU3VibWVudUl0ZW1BY3Rpb24pLmFjdGlvbnMgPz8gW10pIHtcblx0XHRcdFx0XHRpZiAoc3ViQWN0aW9uLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3dNZW51KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5faGlkZU1lbnUoKTtcblx0fVxuXG5cblx0cHJpdmF0ZSBfY3JlYXRlQWRkaXRpb25hbEFjdGlvbnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9jb21tZW50TWVudXMuZ2V0Q29tbWVudFRocmVhZEFkZGl0aW9uYWxBY3Rpb25zKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihtZW51KTtcblx0XHR0aGlzLl9yZWdpc3RlcihtZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucy5zZXRBY3Rpb25zKG1lbnUsIC8qaGFzT25seVNlY29uZGFyeUFjdGlvbnMqLyB0cnVlKTtcblx0XHRcdHRoaXMuX2VuYWJsZURpc2FibGVNZW51KG1lbnUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucyA9IG5ldyBDb21tZW50Rm9ybUFjdGlvbnModGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UsIGNvbnRhaW5lciwgYXN5bmMgKGFjdGlvbjogSUFjdGlvbikgPT4ge1xuXHRcdFx0dGhpcy5fYWN0aW9uUnVuRGVsZWdhdGU/LigpO1xuXG5cdFx0XHRhY3Rpb24ucnVuKHtcblx0XHRcdFx0dGhyZWFkOiB0aGlzLl9jb21tZW50VGhyZWFkLFxuXHRcdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ29tbWVudFRocmVhZEluc3RhbmNlXG5cdFx0XHR9KTtcblx0XHR9LCA0LCB0cnVlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbW1lbnRGb3JtQWN0aW9ucyk7XG5cdFx0dGhpcy5fY29tbWVudEZvcm1BY3Rpb25zLnNldEFjdGlvbnMobWVudSwgLypoYXNPbmx5U2Vjb25kYXJ5QWN0aW9ucyovIHRydWUpO1xuXHRcdHRoaXMuX2VuYWJsZURpc2FibGVNZW51KG1lbnUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUlyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG9CQUFvQjtBQUk3QixTQUFTLDBCQUEwQjtBQUduQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUU3QixJQUFNLGlDQUFOLGNBQTRFLFdBQVc7QUFBQSxFQUs3RixZQUNDLFdBQ1EsZ0JBQ0Esb0JBQ0EsZUFDQSxvQkFDb0Isb0JBQ0MscUJBQzVCO0FBQ0QsVUFBTTtBQVBFO0FBQ0E7QUFDQTtBQUNBO0FBQ29CO0FBQ0M7QUFJN0IsU0FBSyxhQUFhLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSw2QkFBNkIsQ0FBQztBQUM1RSxRQUFJLE9BQU8sS0FBSyxZQUFZLElBQUksRUFBRSxvQkFBb0IsQ0FBQztBQUV2RCxTQUFLLGFBQWEsSUFBSSxPQUFPLEtBQUssWUFBWSxJQUFJLEVBQUUsYUFBYSxDQUFDO0FBQ2xFLFNBQUsseUJBQXlCLEtBQUssVUFBVTtBQUFBLEVBQzlDO0FBQUEsRUFFUSxZQUFZO0FBQ25CLFNBQUssWUFBWSxVQUFVLE9BQU8sUUFBUTtBQUFBLEVBQzNDO0FBQUEsRUFFUSxZQUFZO0FBQ25CLFNBQUssWUFBWSxVQUFVLElBQUksUUFBUTtBQUFBLEVBQ3hDO0FBQUEsRUFFUSxtQkFBbUIsTUFBYTtBQUN2QyxVQUFNLFNBQVMsS0FBSyxXQUFXLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUcxRCxlQUFXLFNBQVMsUUFBUTtBQUMzQixZQUFNLENBQUMsRUFBRSxPQUFPLElBQUk7QUFDcEIsaUJBQVcsVUFBVSxTQUFTO0FBQzdCLFlBQUksT0FBTyxTQUFTO0FBQ25CLGVBQUssVUFBVTtBQUNmO0FBQUEsUUFDRDtBQUVBLG1CQUFXLGFBQWMsT0FBNkIsV0FBVyxDQUFDLEdBQUc7QUFDcEUsY0FBSSxVQUFVLFNBQVM7QUFDdEIsaUJBQUssVUFBVTtBQUNmO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFHUSx5QkFBeUIsV0FBd0I7QUFDeEQsVUFBTSxPQUFPLEtBQUssY0FBYyxrQ0FBa0MsS0FBSyxrQkFBa0I7QUFDekYsU0FBSyxVQUFVLElBQUk7QUFDbkIsU0FBSyxVQUFVLEtBQUssWUFBWSxNQUFNO0FBQ3JDLFdBQUssb0JBQW9CO0FBQUEsUUFBVztBQUFBO0FBQUEsUUFBa0M7QUFBQSxNQUFJO0FBQzFFLFdBQUssbUJBQW1CLElBQUk7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFFRixTQUFLLHNCQUFzQixJQUFJLG1CQUFtQixLQUFLLG9CQUFvQixLQUFLLG9CQUFvQixLQUFLLHFCQUFxQixXQUFXLE9BQU8sV0FBb0I7QUFDbkssV0FBSyxxQkFBcUI7QUFFMUIsYUFBTyxJQUFJO0FBQUEsUUFDVixRQUFRLEtBQUs7QUFBQSxRQUNiLE1BQU0sYUFBYTtBQUFBLE1BQ3BCLENBQUM7QUFBQSxJQUNGLEdBQUcsR0FBRyxJQUFJO0FBRVYsU0FBSyxVQUFVLEtBQUssbUJBQW1CO0FBQ3ZDLFNBQUssb0JBQW9CO0FBQUEsTUFBVztBQUFBO0FBQUEsTUFBa0M7QUFBQSxJQUFJO0FBQzFFLFNBQUssbUJBQW1CLElBQUk7QUFBQSxFQUM3QjtBQUNEO0FBN0VhLGlDQUFOO0FBQUEsRUFXSjtBQUFBLEVBQ0E7QUFBQSxHQVpVOyIsCiAgIm5hbWVzIjogW10KfQo=
