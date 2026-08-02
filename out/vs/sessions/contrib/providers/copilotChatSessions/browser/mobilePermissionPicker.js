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
import { URI } from "../../../../../base/common/uri.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { localize } from "../../../../../nls.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkbenchLayoutService } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { DEFAULT_PERMISSION_LEVELS, PermissionPicker } from "./permissionPicker.js";
import { isPhoneLayout } from "../../../../browser/parts/mobile/mobileLayout.js";
import { showMobilePickerSheet } from "../../../../browser/parts/mobile/mobilePickerSheet.js";
const LEARN_MORE_ID = "learn-more";
let MobilePermissionPicker = class extends PermissionPicker {
  constructor(_delegate, actionWidgetService, configurationService, dialogService, openerService, storageService, telemetryService, hoverService, _layoutService) {
    super(_delegate, actionWidgetService, configurationService, dialogService, openerService, storageService, telemetryService, hoverService);
    this._layoutService = _layoutService;
  }
  showPicker() {
    if (!this._triggerElement || this.actionWidgetService.isVisible) {
      return;
    }
    if (!isPhoneLayout(this._layoutService)) {
      super.showPicker();
      return;
    }
    const policyRestricted = this.configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false;
    const levels = this._delegate.availableLevels ?? DEFAULT_PERMISSION_LEVELS;
    const items = levels.map((level) => {
      const meta = this._getPermissionLevelMeta(level);
      return {
        id: level,
        label: meta.label,
        description: meta.detail,
        icon: meta.icon,
        checked: this._currentLevel === level,
        // Default is never policy-restricted; elevated levels are
        // disabled when enterprise policy turns off auto-approval.
        ...level !== ChatPermissionLevel.Default && policyRestricted ? { disabled: true } : {}
      };
    });
    items.push({
      id: LEARN_MORE_ID,
      label: localize("permissions.learnMore", "Learn more about permissions"),
      icon: Codicon.linkExternal,
      sectionTitle: ""
    });
    const trigger = this._triggerElement;
    trigger.setAttribute("aria-expanded", "true");
    showMobilePickerSheet(
      this._layoutService.mainContainer,
      localize("permissionPicker.title", "Approvals"),
      items
    ).then(async (id) => {
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
      if (!id) {
        return;
      }
      if (id === LEARN_MORE_ID) {
        await this.openerService.open(URI.parse("https://aka.ms/vscode/docs/permissions"));
        return;
      }
      await this._selectLevel(id);
    });
  }
};
MobilePermissionPicker = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IHoverService),
  __decorateParam(8, IWorkbenchLayoutService)
], MobilePermissionPicker);
export {
  MobilePermissionPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2NvcGlsb3RDaGF0U2Vzc2lvbnMvYnJvd3Nlci9tb2JpbGVQZXJtaXNzaW9uUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0UGVybWlzc2lvbkxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IERFRkFVTFRfUEVSTUlTU0lPTl9MRVZFTFMsIElQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsIFBlcm1pc3Npb25QaWNrZXIgfSBmcm9tICcuL3Blcm1pc3Npb25QaWNrZXIuanMnO1xuaW1wb3J0IHsgaXNQaG9uZUxheW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvbW9iaWxlL21vYmlsZUxheW91dC5qcyc7XG5pbXBvcnQgeyBJTW9iaWxlUGlja2VyU2hlZXRJdGVtLCBzaG93TW9iaWxlUGlja2VyU2hlZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVQaWNrZXJTaGVldC5qcyc7XG5cbmNvbnN0IExFQVJOX01PUkVfSUQgPSAnbGVhcm4tbW9yZSc7XG5cbi8qKlxuICogUGhvbmUgdmFyaWFudCBvZiB7QGxpbmsgUGVybWlzc2lvblBpY2tlcn0gdGhhdCBzdXJmYWNlcyB0aGUgYXZhaWxhYmxlXG4gKiBhcHByb3ZhbCBsZXZlbHMgKHByb3ZpZGVkIGJ5IHRoZSBkZWxlZ2F0ZSwgZGVmYXVsdGluZyB0b1xuICogRGVmYXVsdC9CeXBhc3MvQXV0b3BpbG90KSBhcyBhIHtAbGluayBzaG93TW9iaWxlUGlja2VyU2hlZXR9IGJvdHRvbSBzaGVldFxuICogcmF0aGVyIHRoYW4gdGhlIGRlc2t0b3AgYWN0aW9uLXdpZGdldCBwb3B1cC5cbiAqXG4gKiBGYWxscyBiYWNrIHRvIHRoZSBpbmhlcml0ZWQgZHJvcGRvd24gd2hlbiB0aGUgdmlld3BvcnQgaXMgbm90IHBob25lXG4gKiAoZS5nLiB1c2VyIHJlc2l6ZWQgcGFzdCB0aGUgYnJlYWtwb2ludCBhZnRlciB0aGUgcGlja2VyIHJlbmRlcmVkKS5cbiAqL1xuZXhwb3J0IGNsYXNzIE1vYmlsZVBlcm1pc3Npb25QaWNrZXIgZXh0ZW5kcyBQZXJtaXNzaW9uUGlja2VyIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfZGVsZWdhdGU6IElQZXJtaXNzaW9uUGlja2VyRGVsZWdhdGUsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoX2RlbGVnYXRlLCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZGlhbG9nU2VydmljZSwgb3BlbmVyU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSBzaG93UGlja2VyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdHJpZ2dlckVsZW1lbnQgfHwgdGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLmlzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWlzUGhvbmVMYXlvdXQodGhpcy5fbGF5b3V0U2VydmljZSkpIHtcblx0XHRcdHN1cGVyLnNob3dQaWNrZXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwb2xpY3lSZXN0cmljdGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKS5wb2xpY3lWYWx1ZSA9PT0gZmFsc2U7XG5cblx0XHRjb25zdCBsZXZlbHMgPSB0aGlzLl9kZWxlZ2F0ZS5hdmFpbGFibGVMZXZlbHMgPz8gREVGQVVMVF9QRVJNSVNTSU9OX0xFVkVMUztcblx0XHRjb25zdCBpdGVtczogSU1vYmlsZVBpY2tlclNoZWV0SXRlbVtdID0gbGV2ZWxzLm1hcChsZXZlbCA9PiB7XG5cdFx0XHRjb25zdCBtZXRhID0gdGhpcy5fZ2V0UGVybWlzc2lvbkxldmVsTWV0YShsZXZlbCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogbGV2ZWwsXG5cdFx0XHRcdGxhYmVsOiBtZXRhLmxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbWV0YS5kZXRhaWwsXG5cdFx0XHRcdGljb246IG1ldGEuaWNvbixcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy5fY3VycmVudExldmVsID09PSBsZXZlbCxcblx0XHRcdFx0Ly8gRGVmYXVsdCBpcyBuZXZlciBwb2xpY3ktcmVzdHJpY3RlZDsgZWxldmF0ZWQgbGV2ZWxzIGFyZVxuXHRcdFx0XHQvLyBkaXNhYmxlZCB3aGVuIGVudGVycHJpc2UgcG9saWN5IHR1cm5zIG9mZiBhdXRvLWFwcHJvdmFsLlxuXHRcdFx0XHQuLi4obGV2ZWwgIT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCAmJiBwb2xpY3lSZXN0cmljdGVkID8geyBkaXNhYmxlZDogdHJ1ZSB9IDoge30pLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSU1vYmlsZVBpY2tlclNoZWV0SXRlbTtcblx0XHR9KTtcblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdGlkOiBMRUFSTl9NT1JFX0lELFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwZXJtaXNzaW9ucy5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmUgYWJvdXQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpbmtFeHRlcm5hbCxcblx0XHRcdHNlY3Rpb25UaXRsZTogJycsXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmlnZ2VyID0gdGhpcy5fdHJpZ2dlckVsZW1lbnQ7XG5cdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHRcdHNob3dNb2JpbGVQaWNrZXJTaGVldChcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lcixcblx0XHRcdGxvY2FsaXplKCdwZXJtaXNzaW9uUGlja2VyLnRpdGxlJywgXCJBcHByb3ZhbHNcIiksXG5cdFx0XHRpdGVtcyxcblx0XHQpLnRoZW4oYXN5bmMgaWQgPT4ge1xuXHRcdFx0dHJpZ2dlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdHRyaWdnZXIuZm9jdXMoKTtcblx0XHRcdGlmICghaWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlkID09PSBMRUFSTl9NT1JFX0lEKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSgnaHR0cHM6Ly9ha2EubXMvdnNjb2RlL2RvY3MvcGVybWlzc2lvbnMnKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX3NlbGVjdExldmVsKGlkIGFzIENoYXRQZXJtaXNzaW9uTGV2ZWwpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUIsMkJBQTJCO0FBQ3ZELFNBQVMsMkJBQXNELHdCQUF3QjtBQUN2RixTQUFTLHFCQUFxQjtBQUM5QixTQUFpQyw2QkFBNkI7QUFFOUQsTUFBTSxnQkFBZ0I7QUFXZixJQUFNLHlCQUFOLGNBQXFDLGlCQUFpQjtBQUFBLEVBRTVELFlBQ0MsV0FDc0IscUJBQ0Msc0JBQ1AsZUFDQSxlQUNDLGdCQUNFLGtCQUNKLGNBQzJCLGdCQUN6QztBQUNELFVBQU0sV0FBVyxxQkFBcUIsc0JBQXNCLGVBQWUsZUFBZSxnQkFBZ0Isa0JBQWtCLFlBQVk7QUFGOUY7QUFBQSxFQUczQztBQUFBLEVBRVMsYUFBbUI7QUFDM0IsUUFBSSxDQUFDLEtBQUssbUJBQW1CLEtBQUssb0JBQW9CLFdBQVc7QUFDaEU7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLGNBQWMsS0FBSyxjQUFjLEdBQUc7QUFDeEMsWUFBTSxXQUFXO0FBQ2pCO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQW1CLEtBQUsscUJBQXFCLFFBQWlCLGtCQUFrQixpQkFBaUIsRUFBRSxnQkFBZ0I7QUFFekgsVUFBTSxTQUFTLEtBQUssVUFBVSxtQkFBbUI7QUFDakQsVUFBTSxRQUFrQyxPQUFPLElBQUksV0FBUztBQUMzRCxZQUFNLE9BQU8sS0FBSyx3QkFBd0IsS0FBSztBQUMvQyxhQUFPO0FBQUEsUUFDTixJQUFJO0FBQUEsUUFDSixPQUFPLEtBQUs7QUFBQSxRQUNaLGFBQWEsS0FBSztBQUFBLFFBQ2xCLE1BQU0sS0FBSztBQUFBLFFBQ1gsU0FBUyxLQUFLLGtCQUFrQjtBQUFBO0FBQUE7QUFBQSxRQUdoQyxHQUFJLFVBQVUsb0JBQW9CLFdBQVcsbUJBQW1CLEVBQUUsVUFBVSxLQUFLLElBQUksQ0FBQztBQUFBLE1BQ3ZGO0FBQUEsSUFDRCxDQUFDO0FBQ0QsVUFBTSxLQUFLO0FBQUEsTUFDVixJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMseUJBQXlCLDhCQUE4QjtBQUFBLE1BQ3ZFLE1BQU0sUUFBUTtBQUFBLE1BQ2QsY0FBYztBQUFBLElBQ2YsQ0FBQztBQUVELFVBQU0sVUFBVSxLQUFLO0FBQ3JCLFlBQVEsYUFBYSxpQkFBaUIsTUFBTTtBQUM1QztBQUFBLE1BQ0MsS0FBSyxlQUFlO0FBQUEsTUFDcEIsU0FBUywwQkFBMEIsV0FBVztBQUFBLE1BQzlDO0FBQUEsSUFDRCxFQUFFLEtBQUssT0FBTSxPQUFNO0FBQ2xCLGNBQVEsYUFBYSxpQkFBaUIsT0FBTztBQUM3QyxjQUFRLE1BQU07QUFDZCxVQUFJLENBQUMsSUFBSTtBQUNSO0FBQUEsTUFDRDtBQUNBLFVBQUksT0FBTyxlQUFlO0FBQ3pCLGNBQU0sS0FBSyxjQUFjLEtBQUssSUFBSSxNQUFNLHdDQUF3QyxDQUFDO0FBQ2pGO0FBQUEsTUFDRDtBQUNBLFlBQU0sS0FBSyxhQUFhLEVBQXlCO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQW5FYSx5QkFBTjtBQUFBLEVBSUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYVTsiLAogICJuYW1lcyI6IFtdCn0K
