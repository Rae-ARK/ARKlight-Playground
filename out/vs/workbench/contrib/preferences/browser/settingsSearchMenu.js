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
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { Separator } from "../../../../base/common/actions.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { localize } from "../../../../nls.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ADVANCED_SETTING_TAG, EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, GENERAL_TAG_SETTING_TAG, ID_SETTING_TAG, LANGUAGE_SETTING_TAG, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG } from "../common/preferences.js";
let SettingsSearchFilterDropdownMenuActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(action, options, actionRunner, searchWidget, contextMenuService) {
    super(
      action,
      { getActions: () => this.getActions() },
      contextMenuService,
      {
        ...options,
        actionRunner,
        classNames: action.class,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
        menuAsChild: true
      }
    );
    this.searchWidget = searchWidget;
    this.suggestController = SuggestController.get(this.searchWidget.inputWidget);
  }
  render(container) {
    super.render(container);
  }
  doSearchWidgetAction(queryToAppend, triggerSuggest) {
    this.searchWidget.setValue(this.searchWidget.getValue().trimEnd() + " " + queryToAppend);
    this.searchWidget.focus();
    if (triggerSuggest && this.suggestController) {
      this.suggestController.triggerSuggest();
    }
  }
  /**
   * The created action appends a query to the search widget search string. It optionally triggers suggestions.
   */
  createAction(id, label, tooltip, queryToAppend, triggerSuggest) {
    return {
      id,
      label,
      tooltip,
      class: void 0,
      enabled: true,
      run: () => {
        this.doSearchWidgetAction(queryToAppend, triggerSuggest);
      }
    };
  }
  /**
   * The created action appends a query to the search widget search string, if the query does not exist.
   * Otherwise, it removes the query from the search widget search string.
   * The action does not trigger suggestions after adding or removing the query.
   */
  createToggleAction(id, label, tooltip, queryToAppend) {
    const splitCurrentQuery = this.searchWidget.getValue().split(" ");
    const queryContainsQueryToAppend = splitCurrentQuery.includes(queryToAppend);
    return {
      id,
      label,
      tooltip,
      class: void 0,
      enabled: true,
      checked: queryContainsQueryToAppend,
      run: () => {
        if (!queryContainsQueryToAppend) {
          const trimmedCurrentQuery = this.searchWidget.getValue().trimEnd();
          const newQuery = trimmedCurrentQuery ? trimmedCurrentQuery + " " + queryToAppend : queryToAppend;
          this.searchWidget.setValue(newQuery);
        } else {
          const queryWithRemovedTags = this.searchWidget.getValue().split(" ").filter((word) => word !== queryToAppend).join(" ");
          this.searchWidget.setValue(queryWithRemovedTags);
        }
        this.searchWidget.focus();
      }
    };
  }
  createMutuallyExclusiveToggleAction(id, label, tooltip, filter, excludeFilters) {
    const isFilterEnabled = this.searchWidget.getValue().split(" ").includes(filter);
    return {
      id,
      label,
      tooltip,
      class: void 0,
      enabled: true,
      checked: isFilterEnabled,
      run: () => {
        if (isFilterEnabled) {
          const queryWithRemovedTags = this.searchWidget.getValue().split(" ").filter((word) => word !== filter).join(" ");
          this.searchWidget.setValue(queryWithRemovedTags);
        } else {
          let newQuery = this.searchWidget.getValue().split(" ").filter((word) => !excludeFilters.includes(word) && word !== filter).join(" ").trimEnd();
          newQuery = newQuery ? newQuery + " " + filter : filter;
          this.searchWidget.setValue(newQuery);
        }
        this.searchWidget.focus();
      }
    };
  }
  getActions() {
    return [
      this.createToggleAction(
        "modifiedSettingsSearch",
        localize("modifiedSettingsSearch", "Modified"),
        localize("modifiedSettingsSearchTooltip", "Add or remove modified settings filter"),
        `@${MODIFIED_SETTING_TAG}`
      ),
      new Separator(),
      this.createAction(
        "extSettingsSearch",
        localize("extSettingsSearch", "Extension ID..."),
        localize("extSettingsSearchTooltip", "Add extension ID filter"),
        `@${EXTENSION_SETTING_TAG}`,
        true
      ),
      this.createAction(
        "featuresSettingsSearch",
        localize("featureSettingsSearch", "Feature..."),
        localize("featureSettingsSearchTooltip", "Add feature filter"),
        `@${FEATURE_SETTING_TAG}`,
        true
      ),
      this.createAction(
        "tagSettingsSearch",
        localize("tagSettingsSearch", "Tag..."),
        localize("tagSettingsSearchTooltip", "Add tag filter"),
        `@${GENERAL_TAG_SETTING_TAG}`,
        true
      ),
      this.createAction(
        "langSettingsSearch",
        localize("langSettingsSearch", "Language..."),
        localize("langSettingsSearchTooltip", "Add language ID filter"),
        `@${LANGUAGE_SETTING_TAG}`,
        true
      ),
      this.createAction(
        "idSettingsSearch",
        localize("idSettingsSearch", "Setting ID..."),
        localize("idSettingsSearchTooltip", "Add Setting ID filter"),
        `@${ID_SETTING_TAG}`,
        false
      ),
      new Separator(),
      this.createToggleAction(
        "onlineSettingsSearch",
        localize("onlineSettingsSearch", "Online services"),
        localize("onlineSettingsSearchTooltip", "Show settings for online services"),
        "@tag:usesOnlineServices"
      ),
      this.createToggleAction(
        "policySettingsSearch",
        localize("policySettingsSearch", "Organization policies"),
        localize("policySettingsSearchTooltip", "Show organization policy settings"),
        `@${POLICY_SETTING_TAG}`
      ),
      new Separator(),
      this.createMutuallyExclusiveToggleAction(
        "stableSettingsSearch",
        localize("stableSettings", "Stable"),
        localize("stableSettingsSearchTooltip", "Show stable settings"),
        `@stable`,
        ["@tag:preview", "@tag:experimental"]
      ),
      this.createMutuallyExclusiveToggleAction(
        "previewSettingsSearch",
        localize("previewSettings", "Preview"),
        localize("previewSettingsSearchTooltip", "Show preview settings"),
        `@tag:preview`,
        ["@stable", "@tag:experimental"]
      ),
      this.createMutuallyExclusiveToggleAction(
        "experimentalSettingsSearch",
        localize("experimental", "Experimental"),
        localize("experimentalSettingsSearchTooltip", "Show experimental settings"),
        `@tag:experimental`,
        ["@stable", "@tag:preview"]
      ),
      new Separator(),
      this.createToggleAction(
        "advancedSettingsSearch",
        localize("advancedSettingsSearch", "Advanced"),
        localize("advancedSettingsSearchTooltip", "Show advanced settings"),
        `@tag:${ADVANCED_SETTING_TAG}`
      )
    ];
  }
};
SettingsSearchFilterDropdownMenuActionViewItem = __decorateClass([
  __decorateParam(4, IContextMenuService)
], SettingsSearchFilterDropdownMenuActionViewItem);
export {
  SettingsSearchFilterDropdownMenuActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvc2V0dGluZ3NTZWFyY2hNZW51LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIElBY3Rpb25SdW5uZXIsIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdEVuYWJsZWRJbnB1dCB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zdWdnZXN0RW5hYmxlZElucHV0L3N1Z2dlc3RFbmFibGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgQURWQU5DRURfU0VUVElOR19UQUcsIEVYVEVOU0lPTl9TRVRUSU5HX1RBRywgRkVBVFVSRV9TRVRUSU5HX1RBRywgR0VORVJBTF9UQUdfU0VUVElOR19UQUcsIElEX1NFVFRJTkdfVEFHLCBMQU5HVUFHRV9TRVRUSU5HX1RBRywgTU9ESUZJRURfU0VUVElOR19UQUcsIFBPTElDWV9TRVRUSU5HX1RBRyB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1NlYXJjaEZpbHRlckRyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0ge1xuXHRwcml2YXRlIHJlYWRvbmx5IHN1Z2dlc3RDb250cm9sbGVyOiBTdWdnZXN0Q29udHJvbGxlciB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0YWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoV2lkZ2V0OiBTdWdnZXN0RW5hYmxlZElucHV0LFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihhY3Rpb24sXG5cdFx0XHR7IGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZ2V0QWN0aW9ucygpIH0sXG5cdFx0XHRjb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdGFjdGlvblJ1bm5lcixcblx0XHRcdFx0Y2xhc3NOYW1lczogYWN0aW9uLmNsYXNzLFxuXHRcdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogKCkgPT4gQW5jaG9yQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0XHRtZW51QXNDaGlsZDogdHJ1ZVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR0aGlzLnN1Z2dlc3RDb250cm9sbGVyID0gU3VnZ2VzdENvbnRyb2xsZXIuZ2V0KHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0V2lkZ2V0KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGRvU2VhcmNoV2lkZ2V0QWN0aW9uKHF1ZXJ5VG9BcHBlbmQ6IHN0cmluZywgdHJpZ2dlclN1Z2dlc3Q6IGJvb2xlYW4pIHtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZSh0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLnRyaW1FbmQoKSArICcgJyArIHF1ZXJ5VG9BcHBlbmQpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKCk7XG5cdFx0aWYgKHRyaWdnZXJTdWdnZXN0ICYmIHRoaXMuc3VnZ2VzdENvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMuc3VnZ2VzdENvbnRyb2xsZXIudHJpZ2dlclN1Z2dlc3QoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGNyZWF0ZWQgYWN0aW9uIGFwcGVuZHMgYSBxdWVyeSB0byB0aGUgc2VhcmNoIHdpZGdldCBzZWFyY2ggc3RyaW5nLiBJdCBvcHRpb25hbGx5IHRyaWdnZXJzIHN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBjcmVhdGVBY3Rpb24oaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgdG9vbHRpcDogc3RyaW5nLCBxdWVyeVRvQXBwZW5kOiBzdHJpbmcsIHRyaWdnZXJTdWdnZXN0OiBib29sZWFuKTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHR0b29sdGlwLFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRydW46ICgpID0+IHsgdGhpcy5kb1NlYXJjaFdpZGdldEFjdGlvbihxdWVyeVRvQXBwZW5kLCB0cmlnZ2VyU3VnZ2VzdCk7IH1cblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBjcmVhdGVkIGFjdGlvbiBhcHBlbmRzIGEgcXVlcnkgdG8gdGhlIHNlYXJjaCB3aWRnZXQgc2VhcmNoIHN0cmluZywgaWYgdGhlIHF1ZXJ5IGRvZXMgbm90IGV4aXN0LlxuXHQgKiBPdGhlcndpc2UsIGl0IHJlbW92ZXMgdGhlIHF1ZXJ5IGZyb20gdGhlIHNlYXJjaCB3aWRnZXQgc2VhcmNoIHN0cmluZy5cblx0ICogVGhlIGFjdGlvbiBkb2VzIG5vdCB0cmlnZ2VyIHN1Z2dlc3Rpb25zIGFmdGVyIGFkZGluZyBvciByZW1vdmluZyB0aGUgcXVlcnkuXG5cdCAqL1xuXHRwcml2YXRlIGNyZWF0ZVRvZ2dsZUFjdGlvbihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCB0b29sdGlwOiBzdHJpbmcsIHF1ZXJ5VG9BcHBlbmQ6IHN0cmluZyk6IElBY3Rpb24ge1xuXHRcdGNvbnN0IHNwbGl0Q3VycmVudFF1ZXJ5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS5zcGxpdCgnICcpO1xuXHRcdGNvbnN0IHF1ZXJ5Q29udGFpbnNRdWVyeVRvQXBwZW5kID0gc3BsaXRDdXJyZW50UXVlcnkuaW5jbHVkZXMocXVlcnlUb0FwcGVuZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHR0b29sdGlwLFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjaGVja2VkOiBxdWVyeUNvbnRhaW5zUXVlcnlUb0FwcGVuZCxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXF1ZXJ5Q29udGFpbnNRdWVyeVRvQXBwZW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgdHJpbW1lZEN1cnJlbnRRdWVyeSA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkudHJpbUVuZCgpO1xuXHRcdFx0XHRcdGNvbnN0IG5ld1F1ZXJ5ID0gdHJpbW1lZEN1cnJlbnRRdWVyeSA/IHRyaW1tZWRDdXJyZW50UXVlcnkgKyAnICcgKyBxdWVyeVRvQXBwZW5kIDogcXVlcnlUb0FwcGVuZDtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShuZXdRdWVyeSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgcXVlcnlXaXRoUmVtb3ZlZFRhZ3MgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLnNwbGl0KCcgJylcblx0XHRcdFx0XHRcdC5maWx0ZXIod29yZCA9PiB3b3JkICE9PSBxdWVyeVRvQXBwZW5kKS5qb2luKCcgJyk7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUocXVlcnlXaXRoUmVtb3ZlZFRhZ3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTXV0dWFsbHlFeGNsdXNpdmVUb2dnbGVBY3Rpb24oaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgdG9vbHRpcDogc3RyaW5nLCBmaWx0ZXI6IHN0cmluZywgZXhjbHVkZUZpbHRlcnM6IHN0cmluZ1tdKTogSUFjdGlvbiB7XG5cdFx0Y29uc3QgaXNGaWx0ZXJFbmFibGVkID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS5zcGxpdCgnICcpLmluY2x1ZGVzKGZpbHRlcik7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHR0b29sdGlwLFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjaGVja2VkOiBpc0ZpbHRlckVuYWJsZWQsXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0aWYgKGlzRmlsdGVyRW5hYmxlZCkge1xuXHRcdFx0XHRcdGNvbnN0IHF1ZXJ5V2l0aFJlbW92ZWRUYWdzID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS5zcGxpdCgnICcpXG5cdFx0XHRcdFx0XHQuZmlsdGVyKHdvcmQgPT4gd29yZCAhPT0gZmlsdGVyKS5qb2luKCcgJyk7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUocXVlcnlXaXRoUmVtb3ZlZFRhZ3MpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxldCBuZXdRdWVyeSA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkuc3BsaXQoJyAnKVxuXHRcdFx0XHRcdFx0LmZpbHRlcih3b3JkID0+ICFleGNsdWRlRmlsdGVycy5pbmNsdWRlcyh3b3JkKSAmJiB3b3JkICE9PSBmaWx0ZXIpXG5cdFx0XHRcdFx0XHQuam9pbignICcpXG5cdFx0XHRcdFx0XHQudHJpbUVuZCgpO1xuXHRcdFx0XHRcdG5ld1F1ZXJ5ID0gbmV3UXVlcnkgPyBuZXdRdWVyeSArICcgJyArIGZpbHRlciA6IGZpbHRlcjtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShuZXdRdWVyeSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Z2V0QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHR0aGlzLmNyZWF0ZVRvZ2dsZUFjdGlvbihcblx0XHRcdFx0J21vZGlmaWVkU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbW9kaWZpZWRTZXR0aW5nc1NlYXJjaCcsIFwiTW9kaWZpZWRcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdtb2RpZmllZFNldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiQWRkIG9yIHJlbW92ZSBtb2RpZmllZCBzZXR0aW5ncyBmaWx0ZXJcIiksXG5cdFx0XHRcdGBAJHtNT0RJRklFRF9TRVRUSU5HX1RBR31gXG5cdFx0XHQpLFxuXHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0dGhpcy5jcmVhdGVBY3Rpb24oXG5cdFx0XHRcdCdleHRTZXR0aW5nc1NlYXJjaCcsXG5cdFx0XHRcdGxvY2FsaXplKCdleHRTZXR0aW5nc1NlYXJjaCcsIFwiRXh0ZW5zaW9uIElELi4uXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZXh0U2V0dGluZ3NTZWFyY2hUb29sdGlwJywgXCJBZGQgZXh0ZW5zaW9uIElEIGZpbHRlclwiKSxcblx0XHRcdFx0YEAke0VYVEVOU0lPTl9TRVRUSU5HX1RBR31gLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpLFxuXHRcdFx0dGhpcy5jcmVhdGVBY3Rpb24oXG5cdFx0XHRcdCdmZWF0dXJlc1NldHRpbmdzU2VhcmNoJyxcblx0XHRcdFx0bG9jYWxpemUoJ2ZlYXR1cmVTZXR0aW5nc1NlYXJjaCcsIFwiRmVhdHVyZS4uLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2ZlYXR1cmVTZXR0aW5nc1NlYXJjaFRvb2x0aXAnLCBcIkFkZCBmZWF0dXJlIGZpbHRlclwiKSxcblx0XHRcdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9YCxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KSxcblx0XHRcdHRoaXMuY3JlYXRlQWN0aW9uKFxuXHRcdFx0XHQndGFnU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgndGFnU2V0dGluZ3NTZWFyY2gnLCBcIlRhZy4uLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3RhZ1NldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiQWRkIHRhZyBmaWx0ZXJcIiksXG5cdFx0XHRcdGBAJHtHRU5FUkFMX1RBR19TRVRUSU5HX1RBR31gLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpLFxuXHRcdFx0dGhpcy5jcmVhdGVBY3Rpb24oXG5cdFx0XHRcdCdsYW5nU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbGFuZ1NldHRpbmdzU2VhcmNoJywgXCJMYW5ndWFnZS4uLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2xhbmdTZXR0aW5nc1NlYXJjaFRvb2x0aXAnLCBcIkFkZCBsYW5ndWFnZSBJRCBmaWx0ZXJcIiksXG5cdFx0XHRcdGBAJHtMQU5HVUFHRV9TRVRUSU5HX1RBR31gLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpLFxuXHRcdFx0dGhpcy5jcmVhdGVBY3Rpb24oXG5cdFx0XHRcdCdpZFNldHRpbmdzU2VhcmNoJyxcblx0XHRcdFx0bG9jYWxpemUoJ2lkU2V0dGluZ3NTZWFyY2gnLCBcIlNldHRpbmcgSUQuLi5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdpZFNldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiQWRkIFNldHRpbmcgSUQgZmlsdGVyXCIpLFxuXHRcdFx0XHRgQCR7SURfU0VUVElOR19UQUd9YCxcblx0XHRcdFx0ZmFsc2Vcblx0XHRcdCksXG5cdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHR0aGlzLmNyZWF0ZVRvZ2dsZUFjdGlvbihcblx0XHRcdFx0J29ubGluZVNldHRpbmdzU2VhcmNoJyxcblx0XHRcdFx0bG9jYWxpemUoJ29ubGluZVNldHRpbmdzU2VhcmNoJywgXCJPbmxpbmUgc2VydmljZXNcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdvbmxpbmVTZXR0aW5nc1NlYXJjaFRvb2x0aXAnLCBcIlNob3cgc2V0dGluZ3MgZm9yIG9ubGluZSBzZXJ2aWNlc1wiKSxcblx0XHRcdFx0J0B0YWc6dXNlc09ubGluZVNlcnZpY2VzJ1xuXHRcdFx0KSxcblx0XHRcdHRoaXMuY3JlYXRlVG9nZ2xlQWN0aW9uKFxuXHRcdFx0XHQncG9saWN5U2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgncG9saWN5U2V0dGluZ3NTZWFyY2gnLCBcIk9yZ2FuaXphdGlvbiBwb2xpY2llc1wiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3BvbGljeVNldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiU2hvdyBvcmdhbml6YXRpb24gcG9saWN5IHNldHRpbmdzXCIpLFxuXHRcdFx0XHRgQCR7UE9MSUNZX1NFVFRJTkdfVEFHfWBcblx0XHRcdCksXG5cdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHR0aGlzLmNyZWF0ZU11dHVhbGx5RXhjbHVzaXZlVG9nZ2xlQWN0aW9uKFxuXHRcdFx0XHQnc3RhYmxlU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc3RhYmxlU2V0dGluZ3MnLCBcIlN0YWJsZVwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3N0YWJsZVNldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiU2hvdyBzdGFibGUgc2V0dGluZ3NcIiksXG5cdFx0XHRcdGBAc3RhYmxlYCxcblx0XHRcdFx0WydAdGFnOnByZXZpZXcnLCAnQHRhZzpleHBlcmltZW50YWwnXVxuXHRcdFx0KSxcblx0XHRcdHRoaXMuY3JlYXRlTXV0dWFsbHlFeGNsdXNpdmVUb2dnbGVBY3Rpb24oXG5cdFx0XHRcdCdwcmV2aWV3U2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgncHJldmlld1NldHRpbmdzJywgXCJQcmV2aWV3XCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgncHJldmlld1NldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiU2hvdyBwcmV2aWV3IHNldHRpbmdzXCIpLFxuXHRcdFx0XHRgQHRhZzpwcmV2aWV3YCxcblx0XHRcdFx0WydAc3RhYmxlJywgJ0B0YWc6ZXhwZXJpbWVudGFsJ11cblx0XHRcdCksXG5cdFx0XHR0aGlzLmNyZWF0ZU11dHVhbGx5RXhjbHVzaXZlVG9nZ2xlQWN0aW9uKFxuXHRcdFx0XHQnZXhwZXJpbWVudGFsU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZXhwZXJpbWVudGFsJywgXCJFeHBlcmltZW50YWxcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdleHBlcmltZW50YWxTZXR0aW5nc1NlYXJjaFRvb2x0aXAnLCBcIlNob3cgZXhwZXJpbWVudGFsIHNldHRpbmdzXCIpLFxuXHRcdFx0XHRgQHRhZzpleHBlcmltZW50YWxgLFxuXHRcdFx0XHRbJ0BzdGFibGUnLCAnQHRhZzpwcmV2aWV3J11cblx0XHRcdCksXG5cdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHR0aGlzLmNyZWF0ZVRvZ2dsZUFjdGlvbihcblx0XHRcdFx0J2FkdmFuY2VkU2V0dGluZ3NTZWFyY2gnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWR2YW5jZWRTZXR0aW5nc1NlYXJjaCcsIFwiQWR2YW5jZWRcIiksXG5cdFx0XHRcdGxvY2FsaXplKCdhZHZhbmNlZFNldHRpbmdzU2VhcmNoVG9vbHRpcCcsIFwiU2hvdyBhZHZhbmNlZCBzZXR0aW5nc1wiKSxcblx0XHRcdFx0YEB0YWc6JHtBRFZBTkNFRF9TRVRUSU5HX1RBR31gLFxuXHRcdFx0KSxcblx0XHRdO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQWlDLGlCQUFpQjtBQUNsRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHNCQUFzQix1QkFBdUIscUJBQXFCLHlCQUF5Qixn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
