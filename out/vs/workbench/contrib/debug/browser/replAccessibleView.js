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
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from "../../../../platform/accessibility/browser/accessibleView.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { getReplView } from "./repl.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Position } from "../../../../editor/common/core/position.js";
class ReplAccessibleView {
  constructor() {
    this.priority = 70;
    this.name = "debugConsole";
    this.when = ContextKeyExpr.equals("focusedView", "workbench.panel.repl.view");
    this.type = AccessibleViewType.View;
  }
  getProvider(accessor) {
    const viewsService = accessor.get(IViewsService);
    const accessibleViewService = accessor.get(IAccessibleViewService);
    const replView = getReplView(viewsService);
    if (!replView) {
      return void 0;
    }
    const focusedElement = replView.getFocusedElement();
    return new ReplOutputAccessibleViewProvider(replView, focusedElement, accessibleViewService);
  }
}
let ReplOutputAccessibleViewProvider = class extends Disposable {
  constructor(_replView, _focusedElement, _accessibleViewService) {
    super();
    this._replView = _replView;
    this._focusedElement = _focusedElement;
    this._accessibleViewService = _accessibleViewService;
    this.id = AccessibleViewProviderId.Repl;
    this._onDidChangeContent = this._register(new Emitter());
    this.onDidChangeContent = this._onDidChangeContent.event;
    this._onDidResolveChildren = this._register(new Emitter());
    this.onDidResolveChildren = this._onDidResolveChildren.event;
    this.verbositySettingKey = AccessibilityVerbositySettingId.Debug;
    this.options = {
      type: AccessibleViewType.View
    };
    this._elementPositionMap = /* @__PURE__ */ new Map();
    this._treeHadFocus = false;
    this._treeHadFocus = !!_focusedElement;
  }
  provideContent() {
    const debugSession = this._replView.getDebugSession();
    if (!debugSession) {
      return "No debug session available.";
    }
    const elements = debugSession.getReplElements();
    if (!elements.length) {
      return "No output in the debug console.";
    }
    if (!this._content) {
      this._updateContent(elements);
    }
    return this._content ?? elements.map((e) => e.toString(true)).join("\n");
  }
  onClose() {
    this._content = void 0;
    this._elementPositionMap.clear();
    if (this._treeHadFocus) {
      return this._replView.focusTree();
    }
    this._replView.getReplInput().focus();
  }
  onOpen() {
    this._register(this.onDidResolveChildren(() => {
      this._onDidChangeContent.fire();
      queueMicrotask(() => {
        if (this._focusedElement) {
          const position = this._elementPositionMap.get(this._focusedElement.getId());
          if (position) {
            this._accessibleViewService.setPosition(position, true);
          }
        }
      });
    }));
  }
  async _updateContent(elements) {
    const dataSource = this._replView.getReplDataSource();
    if (!dataSource) {
      return;
    }
    let line = 1;
    const content = [];
    for (const e of elements) {
      content.push(e.toString().replace(/\n/g, ""));
      this._elementPositionMap.set(e.getId(), new Position(line, 1));
      line++;
      if (dataSource.hasChildren(e)) {
        const childContent = [];
        const children = await dataSource.getChildren(e);
        for (const child of children) {
          const id = child.getId();
          if (!this._elementPositionMap.has(id)) {
            this._elementPositionMap.set(id, new Position(line, 1));
          }
          childContent.push("  " + child.toString());
          line++;
        }
        content.push(childContent.join("\n"));
      }
    }
    this._content = content.join("\n");
    this._onDidResolveChildren.fire();
  }
};
ReplOutputAccessibleViewProvider = __decorateClass([
  __decorateParam(2, IAccessibleViewService)
], ReplOutputAccessibleViewProvider);
export {
  ReplAccessibleView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvcmVwbEFjY2Vzc2libGVWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLCBBY2Nlc3NpYmxlVmlld1R5cGUsIElBY2Nlc3NpYmxlVmlld0NvbnRlbnRQcm92aWRlciwgSUFjY2Vzc2libGVWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElSZXBsRWxlbWVudCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJsZVZpZXdJbXBsZW1lbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGdldFJlcGxWaWV3LCBSZXBsIH0gZnJvbSAnLi9yZXBsLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuXG5leHBvcnQgY2xhc3MgUmVwbEFjY2Vzc2libGVWaWV3IGltcGxlbWVudHMgSUFjY2Vzc2libGVWaWV3SW1wbGVtZW50YXRpb24ge1xuXHRwcmlvcml0eSA9IDcwO1xuXHRuYW1lID0gJ2RlYnVnQ29uc29sZSc7XG5cdHdoZW4gPSBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2ZvY3VzZWRWaWV3JywgJ3dvcmtiZW5jaC5wYW5lbC5yZXBsLnZpZXcnKTtcblx0dHlwZTogQWNjZXNzaWJsZVZpZXdUeXBlID0gQWNjZXNzaWJsZVZpZXdUeXBlLlZpZXc7XG5cdGdldFByb3ZpZGVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdGNvbnN0IGFjY2Vzc2libGVWaWV3U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlKTtcblx0XHRjb25zdCByZXBsVmlldyA9IGdldFJlcGxWaWV3KHZpZXdzU2VydmljZSk7XG5cdFx0aWYgKCFyZXBsVmlldykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IHJlcGxWaWV3LmdldEZvY3VzZWRFbGVtZW50KCk7XG5cdFx0cmV0dXJuIG5ldyBSZXBsT3V0cHV0QWNjZXNzaWJsZVZpZXdQcm92aWRlcihyZXBsVmlldywgZm9jdXNlZEVsZW1lbnQsIGFjY2Vzc2libGVWaWV3U2VydmljZSk7XG5cdH1cbn1cblxuY2xhc3MgUmVwbE91dHB1dEFjY2Vzc2libGVWaWV3UHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFjY2Vzc2libGVWaWV3Q29udGVudFByb3ZpZGVyIHtcblx0cHVibGljIHJlYWRvbmx5IGlkID0gQWNjZXNzaWJsZVZpZXdQcm92aWRlcklkLlJlcGw7XG5cdHByaXZhdGUgX2NvbnRlbnQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50OiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc29sdmVDaGlsZHJlbjogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRSZXNvbHZlQ2hpbGRyZW46IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRSZXNvbHZlQ2hpbGRyZW4uZXZlbnQ7XG5cblx0cHVibGljIHJlYWRvbmx5IHZlcmJvc2l0eVNldHRpbmdLZXkgPSBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkRlYnVnO1xuXHRwdWJsaWMgcmVhZG9ubHkgb3B0aW9ucyA9IHtcblx0XHR0eXBlOiBBY2Nlc3NpYmxlVmlld1R5cGUuVmlld1xuXHR9O1xuXG5cdHByaXZhdGUgX2VsZW1lbnRQb3NpdGlvbk1hcDogTWFwPHN0cmluZywgUG9zaXRpb24+ID0gbmV3IE1hcDxzdHJpbmcsIFBvc2l0aW9uPigpO1xuXHRwcml2YXRlIF90cmVlSGFkRm9jdXMgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXBsVmlldzogUmVwbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9mb2N1c2VkRWxlbWVudDogSVJlcGxFbGVtZW50IHwgdW5kZWZpbmVkLFxuXHRcdEBJQWNjZXNzaWJsZVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2libGVWaWV3U2VydmljZTogSUFjY2Vzc2libGVWaWV3U2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdHJlZUhhZEZvY3VzID0gISFfZm9jdXNlZEVsZW1lbnQ7XG5cdH1cblx0cHVibGljIHByb3ZpZGVDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGVidWdTZXNzaW9uID0gdGhpcy5fcmVwbFZpZXcuZ2V0RGVidWdTZXNzaW9uKCk7XG5cdFx0aWYgKCFkZWJ1Z1Nlc3Npb24pIHtcblx0XHRcdHJldHVybiAnTm8gZGVidWcgc2Vzc2lvbiBhdmFpbGFibGUuJztcblx0XHR9XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBkZWJ1Z1Nlc3Npb24uZ2V0UmVwbEVsZW1lbnRzKCk7XG5cdFx0aWYgKCFlbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiAnTm8gb3V0cHV0IGluIHRoZSBkZWJ1ZyBjb25zb2xlLic7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY29udGVudCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29udGVudChlbGVtZW50cyk7XG5cdFx0fVxuXHRcdC8vIENvbnRlbnQgaXMgbG9hZGVkIGFzeW5jaHJvbm91c2x5LCBzbyB3ZSBuZWVkIHRvIGNoZWNrIGlmIGl0J3MgYXZhaWxhYmxlIG9yIGZhbGxiYWNrIHRvIHRoZSBlbGVtZW50cyB0aGF0IGFyZSBhbHJlYWR5IGF2YWlsYWJsZS5cblx0XHRyZXR1cm4gdGhpcy5fY29udGVudCA/PyBlbGVtZW50cy5tYXAoZSA9PiBlLnRvU3RyaW5nKHRydWUpKS5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHB1YmxpYyBvbkNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZWxlbWVudFBvc2l0aW9uTWFwLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX3RyZWVIYWRGb2N1cykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlcGxWaWV3LmZvY3VzVHJlZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9yZXBsVmlldy5nZXRSZXBsSW5wdXQoKS5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIG9uT3BlbigpOiB2b2lkIHtcblx0XHQvLyBDaGlsZHJlbiBhcmUgcmVzb2x2ZWQgYXN5bmMsIHNvIHdlIG5lZWQgdG8gdXBkYXRlIHRoZSBjb250ZW50IHdoZW4gdGhleSBhcmUgcmVzb2x2ZWQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZFJlc29sdmVDaGlsZHJlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnQuZmlyZSgpO1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fZm9jdXNlZEVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VsZW1lbnRQb3NpdGlvbk1hcC5nZXQodGhpcy5fZm9jdXNlZEVsZW1lbnQuZ2V0SWQoKSk7XG5cdFx0XHRcdFx0aWYgKHBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmxlVmlld1NlcnZpY2Uuc2V0UG9zaXRpb24ocG9zaXRpb24sIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlQ29udGVudChlbGVtZW50czogSVJlcGxFbGVtZW50W10pIHtcblx0XHRjb25zdCBkYXRhU291cmNlID0gdGhpcy5fcmVwbFZpZXcuZ2V0UmVwbERhdGFTb3VyY2UoKTtcblx0XHRpZiAoIWRhdGFTb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGxpbmUgPSAxO1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBlIG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRjb250ZW50LnB1c2goZS50b1N0cmluZygpLnJlcGxhY2UoL1xcbi9nLCAnJykpO1xuXHRcdFx0dGhpcy5fZWxlbWVudFBvc2l0aW9uTWFwLnNldChlLmdldElkKCksIG5ldyBQb3NpdGlvbihsaW5lLCAxKSk7XG5cdFx0XHRsaW5lKys7XG5cdFx0XHRpZiAoZGF0YVNvdXJjZS5oYXNDaGlsZHJlbihlKSkge1xuXHRcdFx0XHRjb25zdCBjaGlsZENvbnRlbnQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihlKTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvbnN0IGlkID0gY2hpbGQuZ2V0SWQoKTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX2VsZW1lbnRQb3NpdGlvbk1hcC5oYXMoaWQpKSB7XG5cdFx0XHRcdFx0XHQvLyBkb24ndCBvdmVyd3JpdGUgcGFyZW50IHBvc2l0aW9uXG5cdFx0XHRcdFx0XHR0aGlzLl9lbGVtZW50UG9zaXRpb25NYXAuc2V0KGlkLCBuZXcgUG9zaXRpb24obGluZSwgMSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjaGlsZENvbnRlbnQucHVzaCgnICAnICsgY2hpbGQudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0bGluZSsrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRlbnQucHVzaChjaGlsZENvbnRlbnQuam9pbignXFxuJykpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2NvbnRlbnQgPSBjb250ZW50LmpvaW4oJ1xcbicpO1xuXHRcdHRoaXMuX29uRGlkUmVzb2x2ZUNoaWxkcmVuLmZpcmUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDBCQUEwQixvQkFBb0QsOEJBQThCO0FBQ3JILFNBQVMsdUNBQXVDO0FBSWhELFNBQVMsbUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFFbEIsTUFBTSxtQkFBNEQ7QUFBQSxFQUFsRTtBQUNOLG9CQUFXO0FBQ1gsZ0JBQU87QUFDUCxnQkFBTyxlQUFlLE9BQU8sZUFBZSwyQkFBMkI7QUFDdkUsZ0JBQTJCLG1CQUFtQjtBQUFBO0FBQUEsRUFDOUMsWUFBWSxVQUE0QjtBQUN2QyxVQUFNLGVBQWUsU0FBUyxJQUFJLGFBQWE7QUFDL0MsVUFBTSx3QkFBd0IsU0FBUyxJQUFJLHNCQUFzQjtBQUNqRSxVQUFNLFdBQVcsWUFBWSxZQUFZO0FBQ3pDLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGlCQUFpQixTQUFTLGtCQUFrQjtBQUNsRCxXQUFPLElBQUksaUNBQWlDLFVBQVUsZ0JBQWdCLHFCQUFxQjtBQUFBLEVBQzVGO0FBQ0Q7QUFF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
