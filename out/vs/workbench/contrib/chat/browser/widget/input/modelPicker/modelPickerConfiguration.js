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
import * as dom from "../../../../../../../base/browser/dom.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { formatTokenCount } from "../../../../../../../base/common/numbers.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { localize } from "../../../../../../../nls.js";
import { ActionListItemKind } from "../../../../../../../platform/actionWidget/browser/actionList.js";
import { IActionWidgetService } from "../../../../../../../platform/actionWidget/browser/actionWidget.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { TelemetryTrustedValue } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { withChatInputPickerMotion } from "../chatInputPickerActionItem.js";
let ModelPickerConfiguration = class {
  constructor(_host, _actionWidgetService, _telemetryService) {
    this._host = _host;
    this._actionWidgetService = _actionWidgetService;
    this._telemetryService = _telemetryService;
  }
  renderButton(button, compact, noModelsAvailable) {
    const model = this._host.getSelectedModel();
    const effortConfig = this._getConfigProperty("navigation");
    const tokensConfig = this._getConfigProperty("tokens");
    if (compact || !model || noModelsAvailable || !effortConfig && !tokensConfig) {
      button.style.display = "none";
      return;
    }
    const labelParts = [];
    const ariaParts = [];
    if (effortConfig) {
      const enumIndex = effortConfig.schema.enum?.indexOf(effortConfig.value) ?? -1;
      const effortLabel = enumIndex >= 0 && effortConfig.schema.enumItemLabels?.[enumIndex] ? effortConfig.schema.enumItemLabels[enumIndex] : String(effortConfig.value);
      labelParts.push(effortLabel);
      ariaParts.push(localize("chat.modelPicker.effortAriaLabel", "Thinking Effort: {0}", effortLabel));
    }
    if (tokensConfig) {
      const enumIndex = tokensConfig.schema.enum?.indexOf(tokensConfig.value) ?? -1;
      const tokensLabel = enumIndex >= 0 && tokensConfig.schema.enumItemLabels?.[enumIndex] ? tokensConfig.schema.enumItemLabels[enumIndex] : formatTokenCount(Number(tokensConfig.value));
      labelParts.push(tokensLabel);
      ariaParts.push(localize("chat.modelPicker.tokensAriaLabel", "Context Size: {0}", tokensLabel));
    }
    dom.reset(button, dom.$("span.chat-input-picker-label", void 0, labelParts.join(" ")));
    button.style.display = "";
    button.ariaLabel = ariaParts.join(", ");
  }
  show(button, focusGroup) {
    if (this._host.isDisabled() || !button || !this._host.getSelectedModel()) {
      return;
    }
    const items = this._buildItems();
    if (!items.length) {
      return;
    }
    const previouslyFocusedElement = dom.getActiveElement();
    const delegate = {
      onSelect: async (action) => {
        this._actionWidgetService.focusItemById(action.id);
        await action.run();
        this._actionWidgetService.updateItems(this._buildItems(), action.id);
      },
      onHide: () => {
        button.setAttribute("aria-expanded", "false");
        if (dom.isHTMLElement(previouslyFocusedElement)) {
          previouslyFocusedElement.focus();
        }
      }
    };
    button.setAttribute("aria-expanded", "true");
    const showCacheBreakHint = this._host.shouldShowCacheBreakHint();
    this._actionWidgetService.show(
      "ChatModelConfigPicker",
      false,
      items,
      delegate,
      button,
      void 0,
      [],
      {
        isChecked: (element) => element.kind === ActionListItemKind.Action ? !!element.item?.checked : void 0,
        getRole: (element) => element.kind === ActionListItemKind.Action ? "menuitemradio" : "separator",
        getWidgetRole: () => "menu"
      },
      withChatInputPickerMotion({
        headerText: showCacheBreakHint ? localize("chat.config.cacheBreakHint", "Changing these options mid-session resets the prompt cache and may increase cost.") : void 0,
        headerIcon: showCacheBreakHint ? Codicon.info : void 0,
        headerLink: showCacheBreakHint ? this._host.getCacheBreakLearnMoreLink() : void 0,
        headerDismiss: showCacheBreakHint ? this._host.dismissCacheBreakHint : void 0,
        reserveSubmenuSpace: false
      })
    );
    if (focusGroup) {
      const groupItem = items.find((item) => item.kind === ActionListItemKind.Action && item.item?.id?.startsWith(`${focusGroup}.`));
      if (groupItem?.kind === ActionListItemKind.Action && groupItem.item) {
        this._actionWidgetService.focusItemById(groupItem.item.id);
      }
    }
  }
  _getConfigProperty(group) {
    const model = this._host.getSelectedModel();
    if (!model) {
      return void 0;
    }
    const schema = model.metadata.configurationSchema;
    if (!schema?.properties) {
      return void 0;
    }
    const configurationAccess = this._host.getConfigurationAccess();
    const currentConfig = configurationAccess.getModelConfiguration(model.identifier) ?? {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (propSchema.group !== group || !propSchema.enum?.length) {
        continue;
      }
      return { key, value: currentConfig[key] ?? propSchema.default, schema: propSchema };
    }
    return void 0;
  }
  _buildItems() {
    const model = this._host.getSelectedModel();
    if (!model) {
      return [];
    }
    const modelIdentifier = model.identifier;
    const configurationAccess = this._host.getConfigurationAccess();
    const items = [];
    const defaultLabel = localize("models.configDefault", "Default");
    const appendConfigSection = (group, headerLabel, formatValueLabel, logChange) => {
      const config = this._getConfigProperty(group);
      if (!config) {
        return;
      }
      const previousValue = String(config.value ?? "");
      const enumValues = config.schema.enum ?? [];
      if (items.length) {
        items.push({ kind: ActionListItemKind.Separator });
      }
      items.push({ kind: ActionListItemKind.Header, label: headerLabel });
      for (let index = 0; index < enumValues.length; index++) {
        const value = enumValues[index];
        const isDefault = value === config.schema.default;
        const displayLabel = formatValueLabel(value, config.schema.enumItemLabels?.[index]);
        const enumDescription = config.schema.enumDescriptions?.[index];
        const ariaDescriptionParts = [isDefault ? defaultLabel : void 0, enumDescription].filter((part) => !!part);
        const checked = config.value === value;
        items.push({
          item: {
            id: `${group}.${value}`,
            enabled: true,
            checked,
            class: void 0,
            tooltip: enumDescription ?? "",
            label: displayLabel,
            run: () => {
              logChange(value, previousValue);
              return configurationAccess.setModelConfiguration(modelIdentifier, { [config.key]: value });
            }
          },
          kind: ActionListItemKind.Action,
          className: "chat-model-picker-config-option",
          label: displayLabel,
          description: isDefault ? defaultLabel : void 0,
          ariaDescription: ariaDescriptionParts.length ? ariaDescriptionParts.join(", ") : void 0,
          hover: enumDescription ? { content: enumDescription } : void 0,
          group: { title: "", icon: ThemeIcon.fromId(checked ? Codicon.check.id : Codicon.blank.id) },
          hideIcon: false
        });
      }
    };
    appendConfigSection(
      "navigation",
      localize("chat.effort.header", "Thinking Effort"),
      (value, enumLabel) => enumLabel ?? String(value),
      (value, previousValue) => this._telemetryService.publicLog2("chat.thinkingEffortChange", {
        model: model.metadata.vendor === "copilot" ? new TelemetryTrustedValue(modelIdentifier) : "unknown",
        fromValue: previousValue,
        toValue: String(value)
      })
    );
    appendConfigSection(
      "tokens",
      localize("chat.tokens.header", "Context Size"),
      (value, enumLabel) => enumLabel ?? formatTokenCount(Number(value)),
      (value, previousValue) => this._telemetryService.publicLog2("chat.contextSizeChange", {
        model: model.metadata.vendor === "copilot" ? new TelemetryTrustedValue(modelIdentifier) : "unknown",
        fromValue: previousValue,
        toValue: String(value)
      })
    );
    return items;
  }
};
ModelPickerConfiguration = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, ITelemetryService)
], ModelPickerConfiguration);
export {
  ModelPickerConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJDb25maWd1cmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGZvcm1hdFRva2VuQ291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQsIElBY3Rpb25MaXN0SGVhZGVyTGluaywgSUFjdGlvbkxpc3RJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IHdpdGhDaGF0SW5wdXRQaWNrZXJNb3Rpb24gfSBmcm9tICcuLi9jaGF0SW5wdXRQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElNb2RlbENvbmZpZ3VyYXRpb25BY2Nlc3MgfSBmcm9tICcuL21vZGVsUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5cbnR5cGUgQ2hhdFRoaW5raW5nRWZmb3J0Q2hhbmdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnbHJhbW9zMTUnO1xuXHRjb21tZW50OiAnUmVwb3J0aW5nIHdoZW4gdGhlIHRoaW5raW5nIGVmZm9ydCBpcyBjaGFuZ2VkJztcblx0bW9kZWw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbW9kZWwgdGhlIHRoaW5raW5nIGVmZm9ydCB3YXMgY2hhbmdlZCBmb3InIH07XG5cdGZyb21WYWx1ZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBwcmV2aW91cyB0aGlua2luZyBlZmZvcnQgdmFsdWUnIH07XG5cdHRvVmFsdWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmV3IHRoaW5raW5nIGVmZm9ydCB2YWx1ZScgfTtcbn07XG5cbnR5cGUgQ2hhdFRoaW5raW5nRWZmb3J0Q2hhbmdlRXZlbnQgPSB7XG5cdG1vZGVsOiBzdHJpbmcgfCBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPjtcblx0ZnJvbVZhbHVlOiBzdHJpbmc7XG5cdHRvVmFsdWU6IHN0cmluZztcbn07XG5cbnR5cGUgQ2hhdENvbnRleHRTaXplQ2hhbmdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnbHJhbW9zMTUnO1xuXHRjb21tZW50OiAnUmVwb3J0aW5nIHdoZW4gdGhlIGNvbnRleHQgd2luZG93IHNpemUgaXMgY2hhbmdlZCc7XG5cdG1vZGVsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG1vZGVsIHRoZSBjb250ZXh0IHNpemUgd2FzIGNoYW5nZWQgZm9yJyB9O1xuXHRmcm9tVmFsdWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcHJldmlvdXMgY29udGV4dCBzaXplIHZhbHVlJyB9O1xuXHR0b1ZhbHVlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5ldyBjb250ZXh0IHNpemUgdmFsdWUnIH07XG59O1xuXG50eXBlIENoYXRDb250ZXh0U2l6ZUNoYW5nZUV2ZW50ID0ge1xuXHRtb2RlbDogc3RyaW5nIHwgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdGZyb21WYWx1ZTogc3RyaW5nO1xuXHR0b1ZhbHVlOiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb25Ib3N0IHtcblx0cmVhZG9ubHkgZ2V0U2VsZWN0ZWRNb2RlbDogKCkgPT4gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBnZXRDb25maWd1cmF0aW9uQWNjZXNzOiAoKSA9PiBJTW9kZWxDb25maWd1cmF0aW9uQWNjZXNzO1xuXHRyZWFkb25seSBpc0Rpc2FibGVkOiAoKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSBzaG91bGRTaG93Q2FjaGVCcmVha0hpbnQ6ICgpID0+IGJvb2xlYW47XG5cdHJlYWRvbmx5IGdldENhY2hlQnJlYWtMZWFybk1vcmVMaW5rOiAoKSA9PiBJQWN0aW9uTGlzdEhlYWRlckxpbmsgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRpc21pc3NDYWNoZUJyZWFrSGludDogKCkgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIE1vZGVsUGlja2VyQ29uZmlndXJhdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG9zdDogSU1vZGVsUGlja2VyQ29uZmlndXJhdGlvbkhvc3QsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJCdXR0b24oYnV0dG9uOiBIVE1MRWxlbWVudCwgY29tcGFjdDogYm9vbGVhbiwgbm9Nb2RlbHNBdmFpbGFibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2hvc3QuZ2V0U2VsZWN0ZWRNb2RlbCgpO1xuXHRcdGNvbnN0IGVmZm9ydENvbmZpZyA9IHRoaXMuX2dldENvbmZpZ1Byb3BlcnR5KCduYXZpZ2F0aW9uJyk7XG5cdFx0Y29uc3QgdG9rZW5zQ29uZmlnID0gdGhpcy5fZ2V0Q29uZmlnUHJvcGVydHkoJ3Rva2VucycpO1xuXHRcdGlmIChjb21wYWN0IHx8ICFtb2RlbCB8fCBub01vZGVsc0F2YWlsYWJsZSB8fCAoIWVmZm9ydENvbmZpZyAmJiAhdG9rZW5zQ29uZmlnKSkge1xuXHRcdFx0YnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWxQYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBhcmlhUGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGVmZm9ydENvbmZpZykge1xuXHRcdFx0Y29uc3QgZW51bUluZGV4ID0gZWZmb3J0Q29uZmlnLnNjaGVtYS5lbnVtPy5pbmRleE9mKGVmZm9ydENvbmZpZy52YWx1ZSkgPz8gLTE7XG5cdFx0XHRjb25zdCBlZmZvcnRMYWJlbCA9IGVudW1JbmRleCA+PSAwICYmIGVmZm9ydENvbmZpZy5zY2hlbWEuZW51bUl0ZW1MYWJlbHM/LltlbnVtSW5kZXhdXG5cdFx0XHRcdD8gZWZmb3J0Q29uZmlnLnNjaGVtYS5lbnVtSXRlbUxhYmVsc1tlbnVtSW5kZXhdXG5cdFx0XHRcdDogU3RyaW5nKGVmZm9ydENvbmZpZy52YWx1ZSk7XG5cdFx0XHRsYWJlbFBhcnRzLnB1c2goZWZmb3J0TGFiZWwpO1xuXHRcdFx0YXJpYVBhcnRzLnB1c2gobG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIuZWZmb3J0QXJpYUxhYmVsJywgXCJUaGlua2luZyBFZmZvcnQ6IHswfVwiLCBlZmZvcnRMYWJlbCkpO1xuXHRcdH1cblx0XHRpZiAodG9rZW5zQ29uZmlnKSB7XG5cdFx0XHRjb25zdCBlbnVtSW5kZXggPSB0b2tlbnNDb25maWcuc2NoZW1hLmVudW0/LmluZGV4T2YodG9rZW5zQ29uZmlnLnZhbHVlKSA/PyAtMTtcblx0XHRcdGNvbnN0IHRva2Vuc0xhYmVsID0gZW51bUluZGV4ID49IDAgJiYgdG9rZW5zQ29uZmlnLnNjaGVtYS5lbnVtSXRlbUxhYmVscz8uW2VudW1JbmRleF1cblx0XHRcdFx0PyB0b2tlbnNDb25maWcuc2NoZW1hLmVudW1JdGVtTGFiZWxzW2VudW1JbmRleF1cblx0XHRcdFx0OiBmb3JtYXRUb2tlbkNvdW50KE51bWJlcih0b2tlbnNDb25maWcudmFsdWUpKTtcblx0XHRcdGxhYmVsUGFydHMucHVzaCh0b2tlbnNMYWJlbCk7XG5cdFx0XHRhcmlhUGFydHMucHVzaChsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci50b2tlbnNBcmlhTGFiZWwnLCBcIkNvbnRleHQgU2l6ZTogezB9XCIsIHRva2Vuc0xhYmVsKSk7XG5cdFx0fVxuXG5cdFx0ZG9tLnJlc2V0KGJ1dHRvbiwgZG9tLiQoJ3NwYW4uY2hhdC1pbnB1dC1waWNrZXItbGFiZWwnLCB1bmRlZmluZWQsIGxhYmVsUGFydHMuam9pbignICcpKSk7XG5cdFx0YnV0dG9uLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRidXR0b24uYXJpYUxhYmVsID0gYXJpYVBhcnRzLmpvaW4oJywgJyk7XG5cdH1cblxuXHRzaG93KGJ1dHRvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQsIGZvY3VzR3JvdXA/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faG9zdC5pc0Rpc2FibGVkKCkgfHwgIWJ1dHRvbiB8fCAhdGhpcy5faG9zdC5nZXRTZWxlY3RlZE1vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2J1aWxkSXRlbXMoKTtcblx0XHRpZiAoIWl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzbHlGb2N1c2VkRWxlbWVudCA9IGRvbS5nZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSB7XG5cdFx0XHRvblNlbGVjdDogYXN5bmMgKGFjdGlvbjogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuZm9jdXNJdGVtQnlJZChhY3Rpb24uaWQpO1xuXHRcdFx0XHRhd2FpdCBhY3Rpb24ucnVuKCk7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UudXBkYXRlSXRlbXModGhpcy5fYnVpbGRJdGVtcygpLCBhY3Rpb24uaWQpO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHRidXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0cHJldmlvdXNseUZvY3VzZWRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0Y29uc3Qgc2hvd0NhY2hlQnJlYWtIaW50ID0gdGhpcy5faG9zdC5zaG91bGRTaG93Q2FjaGVCcmVha0hpbnQoKTtcblx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLnNob3coXG5cdFx0XHQnQ2hhdE1vZGVsQ29uZmlnUGlja2VyJyxcblx0XHRcdGZhbHNlLFxuXHRcdFx0aXRlbXMsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdGJ1dHRvbixcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFtdLFxuXHRcdFx0e1xuXHRcdFx0XHRpc0NoZWNrZWQ6IGVsZW1lbnQgPT4gZWxlbWVudC5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uID8gISFlbGVtZW50Lml0ZW0/LmNoZWNrZWQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldFJvbGU6IGVsZW1lbnQgPT4gZWxlbWVudC5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uID8gJ21lbnVpdGVtcmFkaW8nIGFzIGNvbnN0IDogJ3NlcGFyYXRvcicgYXMgY29uc3QsXG5cdFx0XHRcdGdldFdpZGdldFJvbGU6ICgpID0+ICdtZW51JyBhcyBjb25zdCxcblx0XHRcdH0sXG5cdFx0XHR3aXRoQ2hhdElucHV0UGlja2VyTW90aW9uKHtcblx0XHRcdFx0aGVhZGVyVGV4dDogc2hvd0NhY2hlQnJlYWtIaW50ID8gbG9jYWxpemUoJ2NoYXQuY29uZmlnLmNhY2hlQnJlYWtIaW50JywgXCJDaGFuZ2luZyB0aGVzZSBvcHRpb25zIG1pZC1zZXNzaW9uIHJlc2V0cyB0aGUgcHJvbXB0IGNhY2hlIGFuZCBtYXkgaW5jcmVhc2UgY29zdC5cIikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGhlYWRlckljb246IHNob3dDYWNoZUJyZWFrSGludCA/IENvZGljb24uaW5mbyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aGVhZGVyTGluazogc2hvd0NhY2hlQnJlYWtIaW50ID8gdGhpcy5faG9zdC5nZXRDYWNoZUJyZWFrTGVhcm5Nb3JlTGluaygpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRoZWFkZXJEaXNtaXNzOiBzaG93Q2FjaGVCcmVha0hpbnQgPyB0aGlzLl9ob3N0LmRpc21pc3NDYWNoZUJyZWFrSGludCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzZXJ2ZVN1Ym1lbnVTcGFjZTogZmFsc2UsXG5cdFx0XHR9KSxcblx0XHQpO1xuXG5cdFx0aWYgKGZvY3VzR3JvdXApIHtcblx0XHRcdGNvbnN0IGdyb3VwSXRlbSA9IGl0ZW1zLmZpbmQoaXRlbSA9PiBpdGVtLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24gJiYgaXRlbS5pdGVtPy5pZD8uc3RhcnRzV2l0aChgJHtmb2N1c0dyb3VwfS5gKSk7XG5cdFx0XHRpZiAoZ3JvdXBJdGVtPy5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uICYmIGdyb3VwSXRlbS5pdGVtKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuZm9jdXNJdGVtQnlJZChncm91cEl0ZW0uaXRlbS5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29uZmlnUHJvcGVydHkoZ3JvdXA6IHN0cmluZykge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5faG9zdC5nZXRTZWxlY3RlZE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2NoZW1hID0gbW9kZWwubWV0YWRhdGEuY29uZmlndXJhdGlvblNjaGVtYTtcblx0XHRpZiAoIXNjaGVtYT8ucHJvcGVydGllcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbkFjY2VzcyA9IHRoaXMuX2hvc3QuZ2V0Q29uZmlndXJhdGlvbkFjY2VzcygpO1xuXHRcdGNvbnN0IGN1cnJlbnRDb25maWcgPSBjb25maWd1cmF0aW9uQWNjZXNzLmdldE1vZGVsQ29uZmlndXJhdGlvbihtb2RlbC5pZGVudGlmaWVyKSA/PyB7fTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHByb3BTY2hlbWFdIG9mIE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0aWYgKHByb3BTY2hlbWEuZ3JvdXAgIT09IGdyb3VwIHx8ICFwcm9wU2NoZW1hLmVudW0/Lmxlbmd0aCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGtleSwgdmFsdWU6IGN1cnJlbnRDb25maWdba2V5XSA/PyBwcm9wU2NoZW1hLmRlZmF1bHQsIHNjaGVtYTogcHJvcFNjaGVtYSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRJdGVtcygpOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2hvc3QuZ2V0U2VsZWN0ZWRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbElkZW50aWZpZXIgPSBtb2RlbC5pZGVudGlmaWVyO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25BY2Nlc3MgPSB0aGlzLl9ob3N0LmdldENvbmZpZ3VyYXRpb25BY2Nlc3MoKTtcblx0XHRjb25zdCBpdGVtczogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSA9IFtdO1xuXHRcdGNvbnN0IGRlZmF1bHRMYWJlbCA9IGxvY2FsaXplKCdtb2RlbHMuY29uZmlnRGVmYXVsdCcsIFwiRGVmYXVsdFwiKTtcblx0XHRjb25zdCBhcHBlbmRDb25maWdTZWN0aW9uID0gKFxuXHRcdFx0Z3JvdXA6IHN0cmluZyxcblx0XHRcdGhlYWRlckxhYmVsOiBzdHJpbmcsXG5cdFx0XHRmb3JtYXRWYWx1ZUxhYmVsOiAodmFsdWU6IHVua25vd24sIGVudW1MYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBzdHJpbmcsXG5cdFx0XHRsb2dDaGFuZ2U6ICh2YWx1ZTogdW5rbm93biwgcHJldmlvdXNWYWx1ZTogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdCk6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fZ2V0Q29uZmlnUHJvcGVydHkoZ3JvdXApO1xuXHRcdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJldmlvdXNWYWx1ZSA9IFN0cmluZyhjb25maWcudmFsdWUgPz8gJycpO1xuXHRcdFx0Y29uc3QgZW51bVZhbHVlcyA9IGNvbmZpZy5zY2hlbWEuZW51bSA/PyBbXTtcblx0XHRcdGlmIChpdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0aXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgfSk7XG5cdFx0XHR9XG5cdFx0XHRpdGVtcy5wdXNoKHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkhlYWRlciwgbGFiZWw6IGhlYWRlckxhYmVsIH0pO1xuXHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGVudW1WYWx1ZXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gZW51bVZhbHVlc1tpbmRleF07XG5cdFx0XHRcdGNvbnN0IGlzRGVmYXVsdCA9IHZhbHVlID09PSBjb25maWcuc2NoZW1hLmRlZmF1bHQ7XG5cdFx0XHRcdGNvbnN0IGRpc3BsYXlMYWJlbCA9IGZvcm1hdFZhbHVlTGFiZWwodmFsdWUsIGNvbmZpZy5zY2hlbWEuZW51bUl0ZW1MYWJlbHM/LltpbmRleF0pO1xuXHRcdFx0XHRjb25zdCBlbnVtRGVzY3JpcHRpb24gPSBjb25maWcuc2NoZW1hLmVudW1EZXNjcmlwdGlvbnM/LltpbmRleF07XG5cdFx0XHRcdGNvbnN0IGFyaWFEZXNjcmlwdGlvblBhcnRzID0gW2lzRGVmYXVsdCA/IGRlZmF1bHRMYWJlbCA6IHVuZGVmaW5lZCwgZW51bURlc2NyaXB0aW9uXS5maWx0ZXIoKHBhcnQpOiBwYXJ0IGlzIHN0cmluZyA9PiAhIXBhcnQpO1xuXHRcdFx0XHRjb25zdCBjaGVja2VkID0gY29uZmlnLnZhbHVlID09PSB2YWx1ZTtcblx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdFx0aWQ6IGAke2dyb3VwfS4ke3ZhbHVlfWAsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y2hlY2tlZCxcblx0XHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBlbnVtRGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdFx0XHRsYWJlbDogZGlzcGxheUxhYmVsLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGxvZ0NoYW5nZSh2YWx1ZSwgcHJldmlvdXNWYWx1ZSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjb25maWd1cmF0aW9uQWNjZXNzLnNldE1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkZW50aWZpZXIsIHsgW2NvbmZpZy5rZXldOiB2YWx1ZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0Y2xhc3NOYW1lOiAnY2hhdC1tb2RlbC1waWNrZXItY29uZmlnLW9wdGlvbicsXG5cdFx0XHRcdFx0bGFiZWw6IGRpc3BsYXlMYWJlbCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogaXNEZWZhdWx0ID8gZGVmYXVsdExhYmVsIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGFyaWFEZXNjcmlwdGlvbjogYXJpYURlc2NyaXB0aW9uUGFydHMubGVuZ3RoID8gYXJpYURlc2NyaXB0aW9uUGFydHMuam9pbignLCAnKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRob3ZlcjogZW51bURlc2NyaXB0aW9uID8geyBjb250ZW50OiBlbnVtRGVzY3JpcHRpb24gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IFRoZW1lSWNvbi5mcm9tSWQoY2hlY2tlZCA/IENvZGljb24uY2hlY2suaWQgOiBDb2RpY29uLmJsYW5rLmlkKSB9LFxuXHRcdFx0XHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGFwcGVuZENvbmZpZ1NlY3Rpb24oXG5cdFx0XHQnbmF2aWdhdGlvbicsXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdC5lZmZvcnQuaGVhZGVyJywgXCJUaGlua2luZyBFZmZvcnRcIiksXG5cdFx0XHQodmFsdWUsIGVudW1MYWJlbCkgPT4gZW51bUxhYmVsID8/IFN0cmluZyh2YWx1ZSksXG5cdFx0XHQodmFsdWUsIHByZXZpb3VzVmFsdWUpID0+IHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0VGhpbmtpbmdFZmZvcnRDaGFuZ2VFdmVudCwgQ2hhdFRoaW5raW5nRWZmb3J0Q2hhbmdlQ2xhc3NpZmljYXRpb24+KCdjaGF0LnRoaW5raW5nRWZmb3J0Q2hhbmdlJywge1xuXHRcdFx0XHRtb2RlbDogbW9kZWwubWV0YWRhdGEudmVuZG9yID09PSAnY29waWxvdCcgPyBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKG1vZGVsSWRlbnRpZmllcikgOiAndW5rbm93bicsXG5cdFx0XHRcdGZyb21WYWx1ZTogcHJldmlvdXNWYWx1ZSxcblx0XHRcdFx0dG9WYWx1ZTogU3RyaW5nKHZhbHVlKSxcblx0XHRcdH0pLFxuXHRcdCk7XG5cdFx0YXBwZW5kQ29uZmlnU2VjdGlvbihcblx0XHRcdCd0b2tlbnMnLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXQudG9rZW5zLmhlYWRlcicsIFwiQ29udGV4dCBTaXplXCIpLFxuXHRcdFx0KHZhbHVlLCBlbnVtTGFiZWwpID0+IGVudW1MYWJlbCA/PyBmb3JtYXRUb2tlbkNvdW50KE51bWJlcih2YWx1ZSkpLFxuXHRcdFx0KHZhbHVlLCBwcmV2aW91c1ZhbHVlKSA9PiB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdENvbnRleHRTaXplQ2hhbmdlRXZlbnQsIENoYXRDb250ZXh0U2l6ZUNoYW5nZUNsYXNzaWZpY2F0aW9uPignY2hhdC5jb250ZXh0U2l6ZUNoYW5nZScsIHtcblx0XHRcdFx0bW9kZWw6IG1vZGVsLm1ldGFkYXRhLnZlbmRvciA9PT0gJ2NvcGlsb3QnID8gbmV3IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZShtb2RlbElkZW50aWZpZXIpIDogJ3Vua25vd24nLFxuXHRcdFx0XHRmcm9tVmFsdWU6IHByZXZpb3VzVmFsdWUsXG5cdFx0XHRcdHRvVmFsdWU6IFN0cmluZyh2YWx1ZSksXG5cdFx0XHR9KSxcblx0XHQpO1xuXG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBa0U7QUFDM0UsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxpQ0FBaUM7QUF3Q25DLElBQU0sMkJBQU4sTUFBK0I7QUFBQSxFQUVyQyxZQUNrQixPQUNzQixzQkFDSCxtQkFDbkM7QUFIZ0I7QUFDc0I7QUFDSDtBQUFBLEVBQ2pDO0FBQUEsRUFFSixhQUFhLFFBQXFCLFNBQWtCLG1CQUFrQztBQUNyRixVQUFNLFFBQVEsS0FBSyxNQUFNLGlCQUFpQjtBQUMxQyxVQUFNLGVBQWUsS0FBSyxtQkFBbUIsWUFBWTtBQUN6RCxVQUFNLGVBQWUsS0FBSyxtQkFBbUIsUUFBUTtBQUNyRCxRQUFJLFdBQVcsQ0FBQyxTQUFTLHFCQUFzQixDQUFDLGdCQUFnQixDQUFDLGNBQWU7QUFDL0UsYUFBTyxNQUFNLFVBQVU7QUFDdkI7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUF1QixDQUFDO0FBQzlCLFVBQU0sWUFBc0IsQ0FB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
