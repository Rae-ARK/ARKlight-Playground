import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../../base/test/common/utils.js";
import { ExtensionIdentifier } from "../../../../../../../../platform/extensions/common/extensions.js";
import { ActionListItemKind } from "../../../../../../../../platform/actionWidget/browser/actionList.js";
import { ModelPickerConfiguration } from "../../../../../browser/widget/input/modelPicker/modelPickerConfiguration.js";
function createModel() {
  return {
    identifier: "copilot/test-model",
    metadata: {
      extension: new ExtensionIdentifier("test.extension"),
      id: "test-model",
      name: "Test Model",
      vendor: "copilot",
      version: "1.0",
      family: "test",
      maxInputTokens: 128e3,
      maxOutputTokens: 4096,
      isDefaultForLocation: {},
      configurationSchema: {
        properties: {
          effort: {
            type: "string",
            group: "navigation",
            enum: ["low", "medium"],
            enumItemLabels: ["Low", "Medium"],
            enumDescriptions: ["Faster", "Balanced"],
            default: "low"
          },
          context: {
            type: "number",
            group: "tokens",
            enum: [32768, 65536],
            enumItemLabels: ["32K", "64K"],
            default: 32768
          }
        }
      }
    }
  };
}
suite("ModelPickerConfiguration", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("renders the combined label and builds accessible option sections", () => {
    const model = createModel();
    const configuration = { effort: "medium", context: 65536 };
    const access = {
      getModelConfiguration: () => configuration,
      setModelConfiguration: async (_modelId, values) => {
        Object.assign(configuration, values);
      },
      getModelConfigurationActions: () => []
    };
    let shownItems = [];
    let shownOptions;
    const actionWidgetService = {
      show: (_id, _supportsPreview, items, _delegate, _anchor, _container, _actions, _accessibilityProvider, options) => {
        shownItems = items;
        shownOptions = options;
      },
      focusItemById: () => {
      },
      updateItems: () => {
      }
    };
    const controller = new ModelPickerConfiguration({
      getSelectedModel: () => model,
      getConfigurationAccess: () => access,
      isDisabled: () => false,
      shouldShowCacheBreakHint: () => false,
      getCacheBreakLearnMoreLink: () => void 0,
      dismissCacheBreakHint: () => {
      }
    }, actionWidgetService, { publicLog2: () => {
    } });
    const button = document.createElement("a");
    controller.renderButton(button, false, false);
    controller.show(button);
    assert.deepStrictEqual({
      label: button.textContent,
      ariaLabel: button.ariaLabel,
      listOptions: {
        reserveSubmenuSpace: shownOptions?.reserveSubmenuSpace
      },
      sections: shownItems.map((item) => item.kind === ActionListItemKind.Action ? {
        className: item.className,
        label: item.label,
        checked: item.item.checked,
        ariaDescription: item.ariaDescription
      } : { kind: item.kind, label: item.label })
    }, {
      label: "Medium 64K",
      ariaLabel: "Thinking Effort: Medium, Context Size: 64K",
      listOptions: {
        reserveSubmenuSpace: false
      },
      sections: [
        { kind: ActionListItemKind.Header, label: "Thinking Effort" },
        { className: "chat-model-picker-config-option", label: "Low", checked: false, ariaDescription: "Default, Faster" },
        { className: "chat-model-picker-config-option", label: "Medium", checked: true, ariaDescription: "Balanced" },
        { kind: ActionListItemKind.Separator, label: void 0 },
        { kind: ActionListItemKind.Header, label: "Context Size" },
        { className: "chat-model-picker-config-option", label: "32K", checked: false, ariaDescription: "Default" },
        { className: "chat-model-picker-config-option", label: "64K", checked: true, ariaDescription: void 0 }
      ]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9pbnB1dC9tb2RlbFBpY2tlci9tb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdEl0ZW0sIElBY3Rpb25MaXN0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9tb2RlbFBpY2tlci9tb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29uZmlndXJhdGlvbkFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2lucHV0L21vZGVsUGlja2VyL21vZGVsUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlTW9kZWwoKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHtcblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyOiAnY29waWxvdC90ZXN0LW1vZGVsJyxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHRlbnNpb24nKSxcblx0XHRcdGlkOiAndGVzdC1tb2RlbCcsXG5cdFx0XHRuYW1lOiAnVGVzdCBNb2RlbCcsXG5cdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0ZmFtaWx5OiAndGVzdCcsXG5cdFx0XHRtYXhJbnB1dFRva2VuczogMTI4MDAwLFxuXHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA0MDk2LFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0Y29uZmlndXJhdGlvblNjaGVtYToge1xuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0ZWZmb3J0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0XHRlbnVtOiBbJ2xvdycsICdtZWRpdW0nXSxcblx0XHRcdFx0XHRcdGVudW1JdGVtTGFiZWxzOiBbJ0xvdycsICdNZWRpdW0nXSxcblx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFsnRmFzdGVyJywgJ0JhbGFuY2VkJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnbG93Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbnRleHQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICd0b2tlbnMnLFxuXHRcdFx0XHRcdFx0ZW51bTogWzMyNzY4LCA2NTUzNl0sXG5cdFx0XHRcdFx0XHRlbnVtSXRlbUxhYmVsczogWyczMksnLCAnNjRLJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAzMjc2OCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9IGFzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHR9O1xufVxuXG5zdWl0ZSgnTW9kZWxQaWNrZXJDb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlbmRlcnMgdGhlIGNvbWJpbmVkIGxhYmVsIGFuZCBidWlsZHMgYWNjZXNzaWJsZSBvcHRpb24gc2VjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVNb2RlbCgpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB7IGVmZm9ydDogJ21lZGl1bScsIGNvbnRleHQ6IDY1NTM2IH07XG5cdFx0Y29uc3QgYWNjZXNzOiBJTW9kZWxDb25maWd1cmF0aW9uQWNjZXNzID0ge1xuXHRcdFx0Z2V0TW9kZWxDb25maWd1cmF0aW9uOiAoKSA9PiBjb25maWd1cmF0aW9uLFxuXHRcdFx0c2V0TW9kZWxDb25maWd1cmF0aW9uOiBhc3luYyAoX21vZGVsSWQsIHZhbHVlcykgPT4geyBPYmplY3QuYXNzaWduKGNvbmZpZ3VyYXRpb24sIHZhbHVlcyk7IH0sXG5cdFx0XHRnZXRNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zOiAoKSA9PiBbXSxcblx0XHR9O1xuXHRcdGxldCBzaG93bkl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdID0gW107XG5cdFx0bGV0IHNob3duT3B0aW9uczogSUFjdGlvbkxpc3RPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFjdGlvbldpZGdldFNlcnZpY2UgPSB7XG5cdFx0XHRzaG93OiAoXG5cdFx0XHRcdF9pZDogc3RyaW5nLFxuXHRcdFx0XHRfc3VwcG9ydHNQcmV2aWV3OiBib29sZWFuLFxuXHRcdFx0XHRpdGVtczogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSxcblx0XHRcdFx0X2RlbGVnYXRlOiB1bmtub3duLFxuXHRcdFx0XHRfYW5jaG9yOiB1bmtub3duLFxuXHRcdFx0XHRfY29udGFpbmVyOiB1bmtub3duLFxuXHRcdFx0XHRfYWN0aW9uczogdW5rbm93bixcblx0XHRcdFx0X2FjY2Vzc2liaWxpdHlQcm92aWRlcjogdW5rbm93bixcblx0XHRcdFx0b3B0aW9uczogSUFjdGlvbkxpc3RPcHRpb25zLFxuXHRcdFx0KSA9PiB7XG5cdFx0XHRcdHNob3duSXRlbXMgPSBpdGVtcztcblx0XHRcdFx0c2hvd25PcHRpb25zID0gb3B0aW9ucztcblx0XHRcdH0sXG5cdFx0XHRmb2N1c0l0ZW1CeUlkOiAoKSA9PiB7IH0sXG5cdFx0XHR1cGRhdGVJdGVtczogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWN0aW9uV2lkZ2V0U2VydmljZTtcblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IE1vZGVsUGlja2VyQ29uZmlndXJhdGlvbih7XG5cdFx0XHRnZXRTZWxlY3RlZE1vZGVsOiAoKSA9PiBtb2RlbCxcblx0XHRcdGdldENvbmZpZ3VyYXRpb25BY2Nlc3M6ICgpID0+IGFjY2Vzcyxcblx0XHRcdGlzRGlzYWJsZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0c2hvdWxkU2hvd0NhY2hlQnJlYWtIaW50OiAoKSA9PiBmYWxzZSxcblx0XHRcdGdldENhY2hlQnJlYWtMZWFybk1vcmVMaW5rOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRkaXNtaXNzQ2FjaGVCcmVha0hpbnQ6ICgpID0+IHsgfSxcblx0XHR9LCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCB7IHB1YmxpY0xvZzI6ICgpID0+IHsgfSB9IGFzIHVua25vd24gYXMgSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblxuXHRcdGNvbnRyb2xsZXIucmVuZGVyQnV0dG9uKGJ1dHRvbiwgZmFsc2UsIGZhbHNlKTtcblx0XHRjb250cm9sbGVyLnNob3coYnV0dG9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGFiZWw6IGJ1dHRvbi50ZXh0Q29udGVudCxcblx0XHRcdGFyaWFMYWJlbDogYnV0dG9uLmFyaWFMYWJlbCxcblx0XHRcdGxpc3RPcHRpb25zOiB7XG5cdFx0XHRcdHJlc2VydmVTdWJtZW51U3BhY2U6IHNob3duT3B0aW9ucz8ucmVzZXJ2ZVN1Ym1lbnVTcGFjZSxcblx0XHRcdH0sXG5cdFx0XHRzZWN0aW9uczogc2hvd25JdGVtcy5tYXAoaXRlbSA9PiBpdGVtLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24gPyB7XG5cdFx0XHRcdGNsYXNzTmFtZTogaXRlbS5jbGFzc05hbWUsXG5cdFx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRjaGVja2VkOiBpdGVtLml0ZW0hLmNoZWNrZWQsXG5cdFx0XHRcdGFyaWFEZXNjcmlwdGlvbjogaXRlbS5hcmlhRGVzY3JpcHRpb24sXG5cdFx0XHR9IDogeyBraW5kOiBpdGVtLmtpbmQsIGxhYmVsOiBpdGVtLmxhYmVsIH0pLFxuXHRcdH0sIHtcblx0XHRcdGxhYmVsOiAnTWVkaXVtIDY0SycsXG5cdFx0XHRhcmlhTGFiZWw6ICdUaGlua2luZyBFZmZvcnQ6IE1lZGl1bSwgQ29udGV4dCBTaXplOiA2NEsnLFxuXHRcdFx0bGlzdE9wdGlvbnM6IHtcblx0XHRcdFx0cmVzZXJ2ZVN1Ym1lbnVTcGFjZTogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0c2VjdGlvbnM6IFtcblx0XHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCBsYWJlbDogJ1RoaW5raW5nIEVmZm9ydCcgfSxcblx0XHRcdFx0eyBjbGFzc05hbWU6ICdjaGF0LW1vZGVsLXBpY2tlci1jb25maWctb3B0aW9uJywgbGFiZWw6ICdMb3cnLCBjaGVja2VkOiBmYWxzZSwgYXJpYURlc2NyaXB0aW9uOiAnRGVmYXVsdCwgRmFzdGVyJyB9LFxuXHRcdFx0XHR7IGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLWNvbmZpZy1vcHRpb24nLCBsYWJlbDogJ01lZGl1bScsIGNoZWNrZWQ6IHRydWUsIGFyaWFEZXNjcmlwdGlvbjogJ0JhbGFuY2VkJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IsIGxhYmVsOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCBsYWJlbDogJ0NvbnRleHQgU2l6ZScgfSxcblx0XHRcdFx0eyBjbGFzc05hbWU6ICdjaGF0LW1vZGVsLXBpY2tlci1jb25maWctb3B0aW9uJywgbGFiZWw6ICczMksnLCBjaGVja2VkOiBmYWxzZSwgYXJpYURlc2NyaXB0aW9uOiAnRGVmYXVsdCcgfSxcblx0XHRcdFx0eyBjbGFzc05hbWU6ICdjaGF0LW1vZGVsLXBpY2tlci1jb25maWctb3B0aW9uJywgbGFiZWw6ICc2NEsnLCBjaGVja2VkOiB0cnVlLCBhcmlhRGVzY3JpcHRpb246IHVuZGVmaW5lZCB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUErRDtBQUl4RSxTQUFTLGdDQUFnQztBQUl6QyxTQUFTLGNBQXVEO0FBQy9ELFNBQU87QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLFVBQVU7QUFBQSxNQUNULFdBQVcsSUFBSSxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDbkQsSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsTUFDakIsc0JBQXNCLENBQUM7QUFBQSxNQUN2QixxQkFBcUI7QUFBQSxRQUNwQixZQUFZO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsWUFDUCxNQUFNLENBQUMsT0FBTyxRQUFRO0FBQUEsWUFDdEIsZ0JBQWdCLENBQUMsT0FBTyxRQUFRO0FBQUEsWUFDaEMsa0JBQWtCLENBQUMsVUFBVSxVQUFVO0FBQUEsWUFDdkMsU0FBUztBQUFBLFVBQ1Y7QUFBQSxVQUNBLFNBQVM7QUFBQSxZQUNSLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxZQUNQLE1BQU0sQ0FBQyxPQUFPLEtBQUs7QUFBQSxZQUNuQixnQkFBZ0IsQ0FBQyxPQUFPLEtBQUs7QUFBQSxZQUM3QixTQUFTO0FBQUEsVUFDVjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sNEJBQTRCLE1BQU07QUFFdkMsMENBQXdDO0FBRXhDLE9BQUssb0VBQW9FLE1BQU07QUFDOUUsVUFBTSxRQUFRLFlBQVk7QUFDMUIsVUFBTSxnQkFBZ0IsRUFBRSxRQUFRLFVBQVUsU0FBUyxNQUFNO0FBQ3pELFVBQU0sU0FBb0M7QUFBQSxNQUN6Qyx1QkFBdUIsTUFBTTtBQUFBLE1BQzdCLHVCQUF1QixPQUFPLFVBQVUsV0FBVztBQUFFLGVBQU8sT0FBTyxlQUFlLE1BQU07QUFBQSxNQUFHO0FBQUEsTUFDM0YsOEJBQThCLE1BQU0sQ0FBQztBQUFBLElBQ3RDO0FBQ0EsUUFBSSxhQUE2RCxDQUFDO0FBQ2xFLFFBQUk7QUFDSixVQUFNLHNCQUFzQjtBQUFBLE1BQzNCLE1BQU0sQ0FDTCxLQUNBLGtCQUNBLE9BQ0EsV0FDQSxTQUNBLFlBQ0EsVUFDQSx3QkFDQSxZQUNJO0FBQ0oscUJBQWE7QUFDYix1QkFBZTtBQUFBLE1BQ2hCO0FBQUEsTUFDQSxlQUFlLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDdkIsYUFBYSxNQUFNO0FBQUEsTUFBRTtBQUFBLElBQ3RCO0FBQ0EsVUFBTSxhQUFhLElBQUkseUJBQXlCO0FBQUEsTUFDL0Msa0JBQWtCLE1BQU07QUFBQSxNQUN4Qix3QkFBd0IsTUFBTTtBQUFBLE1BQzlCLFlBQVksTUFBTTtBQUFBLE1BQ2xCLDBCQUEwQixNQUFNO0FBQUEsTUFDaEMsNEJBQTRCLE1BQU07QUFBQSxNQUNsQyx1QkFBdUIsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNoQyxHQUFHLHFCQUFxQixFQUFFLFlBQVksTUFBTTtBQUFBLElBQUUsRUFBRSxDQUFpQztBQUNqRixVQUFNLFNBQVMsU0FBUyxjQUFjLEdBQUc7QUFFekMsZUFBVyxhQUFhLFFBQVEsT0FBTyxLQUFLO0FBQzVDLGVBQVcsS0FBSyxNQUFNO0FBRXRCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTyxPQUFPO0FBQUEsTUFDZCxXQUFXLE9BQU87QUFBQSxNQUNsQixhQUFhO0FBQUEsUUFDWixxQkFBcUIsY0FBYztBQUFBLE1BQ3BDO0FBQUEsTUFDQSxVQUFVLFdBQVcsSUFBSSxVQUFRLEtBQUssU0FBUyxtQkFBbUIsU0FBUztBQUFBLFFBQzFFLFdBQVcsS0FBSztBQUFBLFFBQ2hCLE9BQU8sS0FBSztBQUFBLFFBQ1osU0FBUyxLQUFLLEtBQU07QUFBQSxRQUNwQixpQkFBaUIsS0FBSztBQUFBLE1BQ3ZCLElBQUksRUFBRSxNQUFNLEtBQUssTUFBTSxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDM0MsR0FBRztBQUFBLE1BQ0YsT0FBTztBQUFBLE1BQ1AsV0FBVztBQUFBLE1BQ1gsYUFBYTtBQUFBLFFBQ1oscUJBQXFCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULEVBQUUsTUFBTSxtQkFBbUIsUUFBUSxPQUFPLGtCQUFrQjtBQUFBLFFBQzVELEVBQUUsV0FBVyxtQ0FBbUMsT0FBTyxPQUFPLFNBQVMsT0FBTyxpQkFBaUIsa0JBQWtCO0FBQUEsUUFDakgsRUFBRSxXQUFXLG1DQUFtQyxPQUFPLFVBQVUsU0FBUyxNQUFNLGlCQUFpQixXQUFXO0FBQUEsUUFDNUcsRUFBRSxNQUFNLG1CQUFtQixXQUFXLE9BQU8sT0FBVTtBQUFBLFFBQ3ZELEVBQUUsTUFBTSxtQkFBbUIsUUFBUSxPQUFPLGVBQWU7QUFBQSxRQUN6RCxFQUFFLFdBQVcsbUNBQW1DLE9BQU8sT0FBTyxTQUFTLE9BQU8saUJBQWlCLFVBQVU7QUFBQSxRQUN6RyxFQUFFLFdBQVcsbUNBQW1DLE9BQU8sT0FBTyxTQUFTLE1BQU0saUJBQWlCLE9BQVU7QUFBQSxNQUN6RztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
