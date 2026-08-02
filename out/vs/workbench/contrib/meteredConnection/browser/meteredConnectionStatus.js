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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IMeteredConnectionService } from "../../../../platform/meteredConnection/common/meteredConnection.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
let MeteredConnectionStatusContribution = class extends Disposable {
  constructor(meteredConnectionService, statusbarService) {
    super();
    this.meteredConnectionService = meteredConnectionService;
    this.statusbarService = statusbarService;
    this.statusBarEntry = this._register(new MutableDisposable());
    this.updateStatusBarEntry(this.meteredConnectionService.isConnectionMetered);
    this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered((isMetered) => {
      this.updateStatusBarEntry(isMetered);
    }));
  }
  updateStatusBarEntry(isMetered) {
    if (isMetered) {
      if (!this.statusBarEntry.value) {
        this.statusBarEntry.value = this.statusbarService.addEntry(
          this.getStatusBarEntry(),
          MeteredConnectionStatusContribution.ID,
          StatusbarAlignment.RIGHT,
          -Number.MAX_VALUE
          // Show at the far right
        );
      }
    } else {
      this.statusBarEntry.clear();
    }
  }
  getStatusBarEntry() {
    return {
      name: localize("status.meteredConnection", "Metered Connection"),
      text: "$(radio-tower)",
      ariaLabel: localize("status.meteredConnection.ariaLabel", "Metered Connection Enabled"),
      tooltip: localize("status.meteredConnection.tooltip", "Metered connection enabled. Some automatic features like extension updates, Settings Sync, and automatic Git operations are paused to reduce data usage."),
      command: {
        id: "workbench.action.configureMeteredConnection",
        title: localize("status.meteredConnection.configure", "Configure")
      },
      showInAllWindows: true
    };
  }
};
MeteredConnectionStatusContribution.ID = "workbench.contrib.meteredConnectionStatus";
MeteredConnectionStatusContribution = __decorateClass([
  __decorateParam(0, IMeteredConnectionService),
  __decorateParam(1, IStatusbarService)
], MeteredConnectionStatusContribution);
export {
  MeteredConnectionStatusContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21ldGVyZWRDb25uZWN0aW9uL2Jyb3dzZXIvbWV0ZXJlZENvbm5lY3Rpb25TdGF0dXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWV0ZXJlZENvbm5lY3Rpb24vY29tbW9uL21ldGVyZWRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJFbnRyeSwgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJTZXJ2aWNlLCBTdGF0dXNiYXJBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIE1ldGVyZWRDb25uZWN0aW9uU3RhdHVzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5tZXRlcmVkQ29ubmVjdGlvblN0YXR1cyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzdGF0dXNCYXJFbnRyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZXRlcmVkQ29ubmVjdGlvblNlcnZpY2U6IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0YXR1c0JhckVudHJ5KHRoaXMubWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlLmlzQ29ubmVjdGlvbk1ldGVyZWQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VJc0Nvbm5lY3Rpb25NZXRlcmVkKGlzTWV0ZXJlZCA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1c0JhckVudHJ5KGlzTWV0ZXJlZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0dXNCYXJFbnRyeShpc01ldGVyZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoaXNNZXRlcmVkKSB7XG5cdFx0XHRpZiAoIXRoaXMuc3RhdHVzQmFyRW50cnkudmFsdWUpIHtcblx0XHRcdFx0dGhpcy5zdGF0dXNCYXJFbnRyeS52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShcblx0XHRcdFx0XHR0aGlzLmdldFN0YXR1c0JhckVudHJ5KCksXG5cdFx0XHRcdFx0TWV0ZXJlZENvbm5lY3Rpb25TdGF0dXNDb250cmlidXRpb24uSUQsXG5cdFx0XHRcdFx0U3RhdHVzYmFyQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0XHRcdC1OdW1iZXIuTUFYX1ZBTFVFIC8vIFNob3cgYXQgdGhlIGZhciByaWdodFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0YXR1c0JhckVudHJ5LmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdGF0dXNCYXJFbnRyeSgpOiBJU3RhdHVzYmFyRW50cnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBsb2NhbGl6ZSgnc3RhdHVzLm1ldGVyZWRDb25uZWN0aW9uJywgXCJNZXRlcmVkIENvbm5lY3Rpb25cIiksXG5cdFx0XHR0ZXh0OiAnJChyYWRpby10b3dlciknLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnc3RhdHVzLm1ldGVyZWRDb25uZWN0aW9uLmFyaWFMYWJlbCcsIFwiTWV0ZXJlZCBDb25uZWN0aW9uIEVuYWJsZWRcIiksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc3RhdHVzLm1ldGVyZWRDb25uZWN0aW9uLnRvb2x0aXAnLCBcIk1ldGVyZWQgY29ubmVjdGlvbiBlbmFibGVkLiBTb21lIGF1dG9tYXRpYyBmZWF0dXJlcyBsaWtlIGV4dGVuc2lvbiB1cGRhdGVzLCBTZXR0aW5ncyBTeW5jLCBhbmQgYXV0b21hdGljIEdpdCBvcGVyYXRpb25zIGFyZSBwYXVzZWQgdG8gcmVkdWNlIGRhdGEgdXNhZ2UuXCIpLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY29uZmlndXJlTWV0ZXJlZENvbm5lY3Rpb24nLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3N0YXR1cy5tZXRlcmVkQ29ubmVjdGlvbi5jb25maWd1cmUnLCBcIkNvbmZpZ3VyZVwiKVxuXHRcdFx0fSxcblx0XHRcdHNob3dJbkFsbFdpbmRvd3M6IHRydWVcblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBbUQsbUJBQW1CLDBCQUEwQjtBQUd6RixJQUFNLHNDQUFOLGNBQWtELFdBQTZDO0FBQUEsRUFNckcsWUFDNkMsMEJBQ1Isa0JBQ25DO0FBQ0QsVUFBTTtBQUhzQztBQUNSO0FBSnJDLFNBQWlCLGlCQUFpQixLQUFLLFVBQVUsSUFBSSxrQkFBMkMsQ0FBQztBQVFoRyxTQUFLLHFCQUFxQixLQUFLLHlCQUF5QixtQkFBbUI7QUFFM0UsU0FBSyxVQUFVLEtBQUsseUJBQXlCLCtCQUErQixlQUFhO0FBQ3hGLFdBQUsscUJBQXFCLFNBQVM7QUFBQSxJQUNwQyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxxQkFBcUIsV0FBMEI7QUFDdEQsUUFBSSxXQUFXO0FBQ2QsVUFBSSxDQUFDLEtBQUssZUFBZSxPQUFPO0FBQy9CLGFBQUssZUFBZSxRQUFRLEtBQUssaUJBQWlCO0FBQUEsVUFDakQsS0FBSyxrQkFBa0I7QUFBQSxVQUN2QixvQ0FBb0M7QUFBQSxVQUNwQyxtQkFBbUI7QUFBQSxVQUNuQixDQUFDLE9BQU87QUFBQTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxlQUFlLE1BQU07QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFxQztBQUM1QyxXQUFPO0FBQUEsTUFDTixNQUFNLFNBQVMsNEJBQTRCLG9CQUFvQjtBQUFBLE1BQy9ELE1BQU07QUFBQSxNQUNOLFdBQVcsU0FBUyxzQ0FBc0MsNEJBQTRCO0FBQUEsTUFDdEYsU0FBUyxTQUFTLG9DQUFvQywwSkFBMEo7QUFBQSxNQUNoTixTQUFTO0FBQUEsUUFDUixJQUFJO0FBQUEsUUFDSixPQUFPLFNBQVMsc0NBQXNDLFdBQVc7QUFBQSxNQUNsRTtBQUFBLE1BQ0Esa0JBQWtCO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQ0Q7QUEvQ2Esb0NBRUksS0FBSztBQUZULHNDQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogW10KfQo=
