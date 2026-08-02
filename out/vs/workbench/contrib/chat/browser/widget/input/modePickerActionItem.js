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
import * as dom from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { coalesce } from "../../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { groupBy } from "../../../../../../base/common/collections.js";
import { autorun, observableValue } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { getFlatActionBarActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatMode } from "../../../common/chatModes.js";
import { isOrganizationPromptFile } from "../../../common/promptSyntax/utils/promptsServiceUtils.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../../common/constants.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { Target } from "../../../common/promptSyntax/promptTypes.js";
import { getOpenChatActionIdForMode } from "../../actions/chatActions.js";
import { ToggleAgentModeActionId } from "../../actions/chatExecuteActions.js";
import { ChatInputPickerActionViewItem } from "./chatInputPickerActionItem.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IWorkbenchAssignmentService } from "../../../../../services/assignment/common/assignmentService.js";
const builtinDefaultIcon = (mode) => {
  switch (mode.name.get().toLowerCase()) {
    case "ask":
      return Codicon.ask;
    case "plan":
      return Codicon.tasklist;
    default:
      return void 0;
  }
};
let ModePickerActionItem = class extends ChatInputPickerActionViewItem {
  constructor(action, delegate, pickerOptions, actionWidgetService, chatAgentService, keybindingService, configurationService, contextKeyService, menuService, commandService, _productService, telemetryService, openerService, assignmentService) {
    const assignments = observableValue("modePickerAssignments", { showOldAskMode: false });
    const getCustomAgentTarget = () => delegate.customAgentTarget?.() ?? Target.Undefined;
    const builtInCategory = { label: localize("built-in", "Built-In"), order: 0 };
    const customCategory = { label: localize("custom", "Custom"), order: 1 };
    const policyDisabledCategory = { label: localize("managedByOrganization", "Managed by your organization"), order: 999, showHeader: true };
    const agentModeDisabledViaPolicy = configurationService.inspect(ChatConfiguration.AgentEnabled).policyValue === false;
    const makeAction = (mode, currentMode) => {
      const isDisabledViaPolicy = mode.kind === ChatModeKind.Agent && agentModeDisabledViaPolicy;
      const tooltip = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip;
      const toolbarActions = [];
      if (mode.kind === ChatModeKind.Agent && !isDisabledViaPolicy) {
        if (mode.uri) {
          let label, icon, id;
          if (mode.source?.storage === PromptsStorage.extension) {
            icon = Codicon.file;
            id = `viewAgent:${mode.id}`;
            label = localize("viewModeConfiguration", "View {0} agent", mode.label.get());
          } else {
            icon = Codicon.edit;
            id = `editAgent:${mode.id}`;
            label = localize("editModeConfiguration", "Edit {0} agent", mode.label.get());
          }
          const modeResource = mode.uri;
          toolbarActions.push({
            id,
            label,
            tooltip: label,
            class: ThemeIcon.asClassName(icon),
            enabled: true,
            run: async () => {
              openerService.open(modeResource.get());
            }
          });
        }
      }
      return {
        ...action,
        id: getOpenChatActionIdForMode(mode),
        label: mode.label.get(),
        icon: isDisabledViaPolicy ? ThemeIcon.fromId(Codicon.lock.id) : mode.icon.get(),
        class: isDisabledViaPolicy ? "disabled-by-policy" : void 0,
        enabled: !isDisabledViaPolicy,
        checked: !isDisabledViaPolicy && currentMode.id === mode.id,
        tooltip: "",
        hover: { content: tooltip },
        toolbarActions,
        run: async () => {
          if (isDisabledViaPolicy) {
            return;
          }
          if (this.delegate.setMode && !this.delegate.sessionResource()) {
            this.delegate.setMode(mode);
            if (this.element) {
              this.renderLabel(this.element);
            }
            return;
          }
          const result = await commandService.executeCommand(
            ToggleAgentModeActionId,
            { modeId: mode.id, sessionResource: this.delegate.sessionResource() }
          );
          if (this.element) {
            this.renderLabel(this.element);
          }
          return result;
        },
        category: isDisabledViaPolicy ? policyDisabledCategory : builtInCategory
      };
    };
    const makeActionFromCustomMode = (mode, currentMode) => {
      return {
        ...makeAction(mode, currentMode),
        tooltip: "",
        hover: { content: mode.description.get() ?? chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip },
        icon: mode.icon.get() ?? (isModeConsideredBuiltIn(mode, this._productService) ? builtinDefaultIcon(mode) : void 0),
        category: agentModeDisabledViaPolicy ? policyDisabledCategory : customCategory
      };
    };
    const getActionsForCustomAgentTarget = (currentTarget) => {
      const modes = delegate.currentChatModes.get();
      const currentMode = delegate.currentMode.get();
      const filteredCustomModes = modes.custom.filter((mode) => {
        const target = mode.target.get();
        if (target !== currentTarget && target !== Target.Undefined) {
          return false;
        }
        return true;
      });
      const customModes = groupBy(
        filteredCustomModes,
        (mode) => isModeConsideredBuiltIn(mode, this._productService) ? "builtin" : "custom"
      );
      const checked = currentMode.id === ChatMode.Agent.id;
      const defaultAction = { ...makeAction(ChatMode.Agent, ChatMode.Agent), checked };
      defaultAction.category = builtInCategory;
      const builtInActions = customModes.builtin?.map((mode) => {
        const action2 = makeActionFromCustomMode(mode, currentMode);
        action2.category = builtInCategory;
        return action2;
      }) ?? [];
      const customActions = customModes.custom?.map((mode) => makeActionFromCustomMode(mode, currentMode)) ?? [];
      return [defaultAction, ...builtInActions, ...customActions];
    };
    const actionProvider = {
      getActions: () => {
        const modes = delegate.currentChatModes.get();
        const currentMode = delegate.currentMode.get();
        const agentMode = modes.builtin.find((mode) => mode.id === ChatMode.Agent.id);
        const otherBuiltinModes = modes.builtin.filter((mode) => {
          return mode.id !== ChatMode.Agent.id && shouldShowBuiltInMode(mode, assignments.get(), agentModeDisabledViaPolicy);
        });
        const filteredCustomModes = modes.custom.filter((mode) => {
          if (isModeConsideredBuiltIn(mode, this._productService)) {
            return shouldShowBuiltInMode(mode, assignments.get(), agentModeDisabledViaPolicy);
          }
          return true;
        });
        const customModes = groupBy(
          filteredCustomModes,
          (mode) => isModeConsideredBuiltIn(mode, this._productService) ? "builtin" : "custom"
        );
        const customBuiltinModeActions = customModes.builtin?.map((mode) => {
          const action2 = makeActionFromCustomMode(mode, currentMode);
          action2.category = agentModeDisabledViaPolicy ? policyDisabledCategory : builtInCategory;
          return action2;
        }) ?? [];
        customBuiltinModeActions.sort((a, b) => a.label.localeCompare(b.label));
        const customModeActions = customModes.custom?.map((mode) => makeActionFromCustomMode(mode, currentMode)) ?? [];
        customModeActions.sort((a, b) => a.label.localeCompare(b.label));
        const orderedModes = coalesce([
          agentMode && makeAction(agentMode, currentMode),
          ...otherBuiltinModes.map((mode) => mode && makeAction(mode, currentMode)),
          ...customBuiltinModeActions,
          ...customModeActions
        ]);
        return orderedModes;
      }
    };
    const dynamicActionProvider = {
      getActions: () => {
        const currentTarget = getCustomAgentTarget();
        if (currentTarget !== Target.Undefined) {
          return getActionsForCustomAgentTarget(currentTarget);
        }
        return actionProvider.getActions();
      }
    };
    const modePickerActionWidgetOptions = {
      actionProvider: dynamicActionProvider,
      actionBarActionProvider: {
        getActions: () => this.getModePickerActionBarActions()
      },
      showItemKeybindings: true,
      reporter: { id: "ChatModePicker", name: "ChatModePicker", includeOptions: true }
    };
    super(action, modePickerActionWidgetOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.delegate = delegate;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this._productService = _productService;
    this._register(autorun((reader) => {
      this.delegate.currentMode.read(reader).label.read(reader);
      if (this.element) {
        this.renderLabel(this.element);
      }
    }));
    assignmentService.getTreatment("chat.showOldAskMode").then((showOldAskMode) => {
      assignments.set({ showOldAskMode: showOldAskMode === "enabled" }, void 0);
    });
    this._register(assignmentService.onDidRefetchAssignments(async () => {
      assignments.set({ showOldAskMode: await assignmentService.getTreatment("chat.showOldAskMode") === "enabled" }, void 0);
    }));
  }
  getModePickerActionBarActions() {
    const menuActions = this.menuService.createMenu(MenuId.ChatModePicker, this.contextKeyService);
    const menuContributions = getFlatActionBarActions(menuActions.getActions({ renderShortTitle: true }));
    menuActions.dispose();
    return menuContributions;
  }
  render(container) {
    super.render(container);
    container.classList.add("chat-mode-picker-item");
  }
  renderLabel(element) {
    this.setAriaLabelAttributes(element);
    const currentMode = this.delegate.currentMode.get();
    const state = currentMode.label.get();
    let icon = currentMode.icon.get();
    if (!icon && isModeConsideredBuiltIn(currentMode, this._productService)) {
      icon = builtinDefaultIcon(currentMode);
    }
    const labelElements = [];
    const collapsed = this.pickerOptions.compact.get();
    if (icon) {
      labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
    }
    if (!collapsed || !icon) {
      labelElements.push(dom.$("span.chat-input-picker-label", void 0, state));
    }
    dom.reset(element, ...labelElements);
    return null;
  }
};
ModePickerActionItem = __decorateClass([
  __decorateParam(3, IActionWidgetService),
  __decorateParam(4, IChatAgentService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IProductService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IWorkbenchAssignmentService)
], ModePickerActionItem);
function isModeConsideredBuiltIn(mode, productService) {
  if (mode.isBuiltin) {
    return true;
  }
  if (mode.source?.storage !== PromptsStorage.extension) {
    return false;
  }
  const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
  if (!chatExtensionId || mode.source.extensionId.value !== chatExtensionId) {
    return false;
  }
  const modeUri = mode.uri?.get();
  if (!modeUri) {
    return true;
  }
  return !isOrganizationPromptFile(modeUri, mode.source.extensionId, productService);
}
function shouldShowBuiltInMode(mode, assignments, agentModeDisabledViaPolicy) {
  if (mode.id === ChatMode.Edit.id) {
    return agentModeDisabledViaPolicy;
  }
  if (mode.id === ChatMode.Ask.id || mode.name.get().toLowerCase() === "ask") {
    if (mode.id === ChatMode.Ask.id) {
      return assignments.showOldAskMode || agentModeDisabledViaPolicy;
    } else {
      return !(assignments.showOldAskMode || agentModeDisabledViaPolicy);
    }
  }
  return true;
}
export {
  ModePickerActionItem,
  isModeConsideredBuiltIn
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvbW9kZVBpY2tlckFjdGlvbkl0ZW0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZ3JvdXBCeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24sIElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblByb3ZpZGVyLCBJQWN0aW9uV2lkZ2V0RHJvcGRvd25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUsIElDaGF0TW9kZSwgSUNoYXRNb2RlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgaXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC91dGlscy9wcm9tcHRzU2VydmljZVV0aWxzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IGdldE9wZW5DaGF0QWN0aW9uSWRGb3JNb2RlIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVG9nZ2xlQ2hhdE1vZGVBcmdzLCBUb2dnbGVBZ2VudE1vZGVBY3Rpb25JZCB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEV4ZWN1dGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtLCBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyB9IGZyb20gJy4vY2hhdElucHV0UGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTW9kZVBpY2tlckRlbGVnYXRlIHtcblx0cmVhZG9ubHkgY3VycmVudE1vZGU6IElPYnNlcnZhYmxlPElDaGF0TW9kZT47XG5cdHJlYWRvbmx5IGN1cnJlbnRDaGF0TW9kZXM6IElPYnNlcnZhYmxlPElDaGF0TW9kZXM+O1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6ICgpID0+IFVSSSB8IHVuZGVmaW5lZDtcblx0LyoqIERpcmVjdCBtb2RlLWNoYW5nZSBjYWxsYmFjayBmb3IgaG9zdHMgd2l0aG91dCBhIHJlZ2lzdGVyZWQgSUNoYXRXaWRnZXQgKGJ5cGFzc2VzIFRvZ2dsZUFnZW50TW9kZUFjdGlvbklkKS4gKi9cblx0cmVhZG9ubHkgc2V0TW9kZT86IChtb2RlOiBJQ2hhdE1vZGUpID0+IHZvaWQ7XG5cdC8qKlxuXHQgKiBXaGVuIHNldCwgdGhlIG1vZGUgcGlja2VyIHdpbGwgc2hvdyBjdXN0b20gYWdlbnRzIHdob3NlIHRhcmdldCBtYXRjaGVzIHRoaXMgdmFsdWUuXG5cdCAqIEN1c3RvbSBhZ2VudHMgd2l0aG91dCBhIHRhcmdldCBhcmUgYWx3YXlzIHNob3duIGluIGFsbCBzZXNzaW9uIHR5cGVzLiBJZiBubyBhZ2VudHMgbWF0Y2ggdGhlIHRhcmdldCwgc2hvd3MgYSBkZWZhdWx0IFwiQWdlbnRcIiBvcHRpb24uXG5cdCAqL1xuXHRyZWFkb25seSBjdXN0b21BZ2VudFRhcmdldD86ICgpID0+IFRhcmdldDtcbn1cblxuLy8gVE9ETzogdGhlcmUgc2hvdWxkIGJlIGFuIGljb24gY29udHJpYnV0ZWQgZm9yIGJ1aWx0LWluIG1vZGVzXG5jb25zdCBidWlsdGluRGVmYXVsdEljb24gPSAobW9kZTogSUNoYXRNb2RlKSA9PiB7XG5cdHN3aXRjaCAobW9kZS5uYW1lLmdldCgpLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRjYXNlICdhc2snOiByZXR1cm4gQ29kaWNvbi5hc2s7XG5cdFx0Y2FzZSAncGxhbic6IHJldHVybiBDb2RpY29uLnRhc2tsaXN0O1xuXHRcdGRlZmF1bHQ6IHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn07XG5cbmV4cG9ydCBjbGFzcyBNb2RlUGlja2VyQWN0aW9uSXRlbSBleHRlbmRzIENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBNZW51SXRlbUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlbGVnYXRlOiBJTW9kZVBpY2tlckRlbGVnYXRlLFxuXHRcdHBpY2tlck9wdGlvbnM6IElDaGF0SW5wdXRQaWNrZXJPcHRpb25zLFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBhY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSBhc3NpZ25tZW50U2VydmljZTogSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBhc3NpZ25tZW50cyA9IG9ic2VydmFibGVWYWx1ZTx7IHNob3dPbGRBc2tNb2RlOiBib29sZWFuIH0+KCdtb2RlUGlja2VyQXNzaWdubWVudHMnLCB7IHNob3dPbGRBc2tNb2RlOiBmYWxzZSB9KTtcblxuXHRcdC8vIEdldCBjdXN0b20gYWdlbnQgdGFyZ2V0IGR5bmFtaWNhbGx5IChtYXkgY2hhbmdlIHdoZW4gc3dpdGNoaW5nIHNlc3Npb24gdHlwZXMpXG5cdFx0Y29uc3QgZ2V0Q3VzdG9tQWdlbnRUYXJnZXQgPSAoKSA9PiBkZWxlZ2F0ZS5jdXN0b21BZ2VudFRhcmdldD8uKCkgPz8gVGFyZ2V0LlVuZGVmaW5lZDtcblxuXHRcdC8vIENhdGVnb3J5IGRlZmluaXRpb25zXG5cdFx0Y29uc3QgYnVpbHRJbkNhdGVnb3J5ID0geyBsYWJlbDogbG9jYWxpemUoJ2J1aWx0LWluJywgXCJCdWlsdC1JblwiKSwgb3JkZXI6IDAgfTtcblx0XHRjb25zdCBjdXN0b21DYXRlZ29yeSA9IHsgbGFiZWw6IGxvY2FsaXplKCdjdXN0b20nLCBcIkN1c3RvbVwiKSwgb3JkZXI6IDEgfTtcblx0XHRjb25zdCBwb2xpY3lEaXNhYmxlZENhdGVnb3J5ID0geyBsYWJlbDogbG9jYWxpemUoJ21hbmFnZWRCeU9yZ2FuaXphdGlvbicsIFwiTWFuYWdlZCBieSB5b3VyIG9yZ2FuaXphdGlvblwiKSwgb3JkZXI6IDk5OSwgc2hvd0hlYWRlcjogdHJ1ZSB9O1xuXG5cdFx0Y29uc3QgYWdlbnRNb2RlRGlzYWJsZWRWaWFQb2xpY3kgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCkucG9saWN5VmFsdWUgPT09IGZhbHNlO1xuXG5cdFx0Y29uc3QgbWFrZUFjdGlvbiA9IChtb2RlOiBJQ2hhdE1vZGUsIGN1cnJlbnRNb2RlOiBJQ2hhdE1vZGUpOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24gPT4ge1xuXHRcdFx0Y29uc3QgaXNEaXNhYmxlZFZpYVBvbGljeSA9XG5cdFx0XHRcdG1vZGUua2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50ICYmXG5cdFx0XHRcdGFnZW50TW9kZURpc2FibGVkVmlhUG9saWN5O1xuXG5cdFx0XHRjb25zdCB0b29sdGlwID0gY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgbW9kZS5raW5kKT8uZGVzY3JpcHRpb24gPz8gYWN0aW9uLnRvb2x0aXA7XG5cblx0XHRcdC8vIEFkZCB0b29sYmFyIGFjdGlvbnMgZm9yIEFnZW50IG1vZGVzXG5cdFx0XHRjb25zdCB0b29sYmFyQWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRpZiAobW9kZS5raW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQgJiYgIWlzRGlzYWJsZWRWaWFQb2xpY3kpIHtcblx0XHRcdFx0aWYgKG1vZGUudXJpKSB7XG5cdFx0XHRcdFx0bGV0IGxhYmVsLCBpY29uLCBpZDtcblx0XHRcdFx0XHRpZiAobW9kZS5zb3VyY2U/LnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbikge1xuXHRcdFx0XHRcdFx0aWNvbiA9IENvZGljb24uZmlsZTtcblx0XHRcdFx0XHRcdGlkID0gYHZpZXdBZ2VudDoke21vZGUuaWR9YDtcblx0XHRcdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ3ZpZXdNb2RlQ29uZmlndXJhdGlvbicsIFwiVmlldyB7MH0gYWdlbnRcIiwgbW9kZS5sYWJlbC5nZXQoKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGljb24gPSBDb2RpY29uLmVkaXQ7XG5cdFx0XHRcdFx0XHRpZCA9IGBlZGl0QWdlbnQ6JHttb2RlLmlkfWA7XG5cdFx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdlZGl0TW9kZUNvbmZpZ3VyYXRpb24nLCBcIkVkaXQgezB9IGFnZW50XCIsIG1vZGUubGFiZWwuZ2V0KCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IG1vZGVSZXNvdXJjZSA9IG1vZGUudXJpO1xuXHRcdFx0XHRcdHRvb2xiYXJBY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQsXG5cdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxhYmVsLFxuXHRcdFx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKSxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKG1vZGVSZXNvdXJjZS5nZXQoKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uYWN0aW9uLFxuXHRcdFx0XHRpZDogZ2V0T3BlbkNoYXRBY3Rpb25JZEZvck1vZGUobW9kZSksXG5cdFx0XHRcdGxhYmVsOiBtb2RlLmxhYmVsLmdldCgpLFxuXHRcdFx0XHRpY29uOiBpc0Rpc2FibGVkVmlhUG9saWN5ID8gVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmxvY2suaWQpIDogbW9kZS5pY29uLmdldCgpLFxuXHRcdFx0XHRjbGFzczogaXNEaXNhYmxlZFZpYVBvbGljeSA/ICdkaXNhYmxlZC1ieS1wb2xpY3knIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlbmFibGVkOiAhaXNEaXNhYmxlZFZpYVBvbGljeSxcblx0XHRcdFx0Y2hlY2tlZDogIWlzRGlzYWJsZWRWaWFQb2xpY3kgJiYgY3VycmVudE1vZGUuaWQgPT09IG1vZGUuaWQsXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRob3ZlcjogeyBjb250ZW50OiB0b29sdGlwIH0sXG5cdFx0XHRcdHRvb2xiYXJBY3Rpb25zLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpZiAoaXNEaXNhYmxlZFZpYVBvbGljeSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuOyAvLyBCbG9jayBpbnRlcmFjdGlvbiBpZiBkaXNhYmxlZCBieSBwb2xpY3lcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gU2Vzc2lvbi1sZXNzIGhvc3RzIChlLmcuIHRoZSBhdXRvbWF0aW9ucyBkaWFsb2cpIHByb3ZpZGVcblx0XHRcdFx0XHQvLyBgc2V0TW9kZWAgYW5kIGEgYHNlc3Npb25SZXNvdXJjZWAgdGhhdCByZXR1cm5zIHVuZGVmaW5lZC5cblx0XHRcdFx0XHQvLyBTa2lwIHRoZSBjb21tYW5kIHBhdGggYmVjYXVzZSBpdCByZXF1aXJlcyBhIHJlZ2lzdGVyZWRcblx0XHRcdFx0XHQvLyBgSUNoYXRXaWRnZXRgLiBSb3V0ZSB0aGUgY2hhbmdlIHRvIHRoZSBob3N0IGRpcmVjdGx5IHNvIHRoZVxuXHRcdFx0XHRcdC8vIGlucHV0J3MgbW9kZSBvYnNlcnZhYmxlIGlzIGFjdHVhbGx5IHVwZGF0ZWQuIFJlYWwgY2hhdFxuXHRcdFx0XHRcdC8vIHdpZGdldHMgYWx3YXlzIGhhdmUgYSBzZXNzaW9uIFVSSS4gVGhleSBhbHdheXMgdGFrZSB0aGVcblx0XHRcdFx0XHQvLyBjb21tYW5kIHBhdGggKHRlbGVtZXRyeSwgY29uZmlybWF0aW9uLCBuZXctY2hhdC1vbi1jbGVhcikuXG5cdFx0XHRcdFx0aWYgKHRoaXMuZGVsZWdhdGUuc2V0TW9kZSAmJiAhdGhpcy5kZWxlZ2F0ZS5zZXNzaW9uUmVzb3VyY2UoKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXRNb2RlKG1vZGUpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFxuXHRcdFx0XHRcdFx0VG9nZ2xlQWdlbnRNb2RlQWN0aW9uSWQsXG5cdFx0XHRcdFx0XHR7IG1vZGVJZDogbW9kZS5pZCwgc2Vzc2lvblJlc291cmNlOiB0aGlzLmRlbGVnYXRlLnNlc3Npb25SZXNvdXJjZSgpIH0gc2F0aXNmaWVzIElUb2dnbGVDaGF0TW9kZUFyZ3Ncblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2F0ZWdvcnk6IGlzRGlzYWJsZWRWaWFQb2xpY3kgPyBwb2xpY3lEaXNhYmxlZENhdGVnb3J5IDogYnVpbHRJbkNhdGVnb3J5XG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHRjb25zdCBtYWtlQWN0aW9uRnJvbUN1c3RvbU1vZGUgPSAobW9kZTogSUNoYXRNb2RlLCBjdXJyZW50TW9kZTogSUNoYXRNb2RlKTogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLm1ha2VBY3Rpb24obW9kZSwgY3VycmVudE1vZGUpLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0aG92ZXI6IHsgY29udGVudDogbW9kZS5kZXNjcmlwdGlvbi5nZXQoKSA/PyBjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBtb2RlLmtpbmQpPy5kZXNjcmlwdGlvbiA/PyBhY3Rpb24udG9vbHRpcCB9LFxuXHRcdFx0XHRpY29uOiBtb2RlLmljb24uZ2V0KCkgPz8gKGlzTW9kZUNvbnNpZGVyZWRCdWlsdEluKG1vZGUsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlKSA/IGJ1aWx0aW5EZWZhdWx0SWNvbihtb2RlKSA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdGNhdGVnb3J5OiBhZ2VudE1vZGVEaXNhYmxlZFZpYVBvbGljeSA/IHBvbGljeURpc2FibGVkQ2F0ZWdvcnkgOiBjdXN0b21DYXRlZ29yeVxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZ2V0QWN0aW9uc0ZvckN1c3RvbUFnZW50VGFyZ2V0ID0gKGN1cnJlbnRUYXJnZXQ6IFRhcmdldCk6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbltdID0+IHtcblx0XHRcdGNvbnN0IG1vZGVzID0gZGVsZWdhdGUuY3VycmVudENoYXRNb2Rlcy5nZXQoKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlID0gZGVsZWdhdGUuY3VycmVudE1vZGUuZ2V0KCk7XG5cdFx0XHRjb25zdCBmaWx0ZXJlZEN1c3RvbU1vZGVzID0gbW9kZXMuY3VzdG9tLmZpbHRlcihtb2RlID0+IHtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gbW9kZS50YXJnZXQuZ2V0KCk7XG5cdFx0XHRcdGlmICh0YXJnZXQgIT09IGN1cnJlbnRUYXJnZXQgJiYgdGFyZ2V0ICE9PSBUYXJnZXQuVW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjdXN0b21Nb2RlcyA9IGdyb3VwQnkoXG5cdFx0XHRcdGZpbHRlcmVkQ3VzdG9tTW9kZXMsXG5cdFx0XHRcdG1vZGUgPT4gaXNNb2RlQ29uc2lkZXJlZEJ1aWx0SW4obW9kZSwgdGhpcy5fcHJvZHVjdFNlcnZpY2UpID8gJ2J1aWx0aW4nIDogJ2N1c3RvbScpO1xuXHRcdFx0Ly8gQWx3YXlzIGluY2x1ZGUgdGhlIGRlZmF1bHQgXCJBZ2VudFwiIG9wdGlvbiBmaXJzdFxuXHRcdFx0Y29uc3QgY2hlY2tlZCA9IGN1cnJlbnRNb2RlLmlkID09PSBDaGF0TW9kZS5BZ2VudC5pZDtcblx0XHRcdGNvbnN0IGRlZmF1bHRBY3Rpb24gPSB7IC4uLm1ha2VBY3Rpb24oQ2hhdE1vZGUuQWdlbnQsIENoYXRNb2RlLkFnZW50KSwgY2hlY2tlZCB9O1xuXHRcdFx0ZGVmYXVsdEFjdGlvbi5jYXRlZ29yeSA9IGJ1aWx0SW5DYXRlZ29yeTtcblx0XHRcdGNvbnN0IGJ1aWx0SW5BY3Rpb25zID0gY3VzdG9tTW9kZXMuYnVpbHRpbj8ubWFwKG1vZGUgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBtYWtlQWN0aW9uRnJvbUN1c3RvbU1vZGUobW9kZSwgY3VycmVudE1vZGUpO1xuXHRcdFx0XHRhY3Rpb24uY2F0ZWdvcnkgPSBidWlsdEluQ2F0ZWdvcnk7XG5cdFx0XHRcdHJldHVybiBhY3Rpb247XG5cdFx0XHR9KSA/PyBbXTtcblx0XHRcdC8vIEFkZCBmaWx0ZXJlZCBjdXN0b20gbW9kZXNcblx0XHRcdGNvbnN0IGN1c3RvbUFjdGlvbnMgPSBjdXN0b21Nb2Rlcy5jdXN0b20/Lm1hcChtb2RlID0+IG1ha2VBY3Rpb25Gcm9tQ3VzdG9tTW9kZShtb2RlLCBjdXJyZW50TW9kZSkpID8/IFtdO1xuXHRcdFx0cmV0dXJuIFtkZWZhdWx0QWN0aW9uLCAuLi5idWlsdEluQWN0aW9ucywgLi4uY3VzdG9tQWN0aW9uc107XG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvblByb3ZpZGVyOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciA9IHtcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZXMgPSBkZWxlZ2F0ZS5jdXJyZW50Q2hhdE1vZGVzLmdldCgpO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50TW9kZSA9IGRlbGVnYXRlLmN1cnJlbnRNb2RlLmdldCgpO1xuXHRcdFx0XHRjb25zdCBhZ2VudE1vZGUgPSBtb2Rlcy5idWlsdGluLmZpbmQobW9kZSA9PiBtb2RlLmlkID09PSBDaGF0TW9kZS5BZ2VudC5pZCk7XG5cblx0XHRcdFx0Y29uc3Qgb3RoZXJCdWlsdGluTW9kZXMgPSBtb2Rlcy5idWlsdGluLmZpbHRlcihtb2RlID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gbW9kZS5pZCAhPT0gQ2hhdE1vZGUuQWdlbnQuaWQgJiYgc2hvdWxkU2hvd0J1aWx0SW5Nb2RlKG1vZGUsIGFzc2lnbm1lbnRzLmdldCgpLCBhZ2VudE1vZGVEaXNhYmxlZFZpYVBvbGljeSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZEN1c3RvbU1vZGVzID0gbW9kZXMuY3VzdG9tLmZpbHRlcihtb2RlID0+IHtcblx0XHRcdFx0XHRpZiAoaXNNb2RlQ29uc2lkZXJlZEJ1aWx0SW4obW9kZSwgdGhpcy5fcHJvZHVjdFNlcnZpY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc2hvdWxkU2hvd0J1aWx0SW5Nb2RlKG1vZGUsIGFzc2lnbm1lbnRzLmdldCgpLCBhZ2VudE1vZGVEaXNhYmxlZFZpYVBvbGljeSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Ly8gRmlsdGVyIG91dCAnaW1wbGVtZW50JyBtb2RlIGZyb20gdGhlIGRyb3Bkb3duIC0gaXQncyBhdmFpbGFibGUgZm9yIGhhbmRvZmZzIGJ1dCBub3QgdXNlci1zZWxlY3RhYmxlXG5cdFx0XHRcdGNvbnN0IGN1c3RvbU1vZGVzID0gZ3JvdXBCeShcblx0XHRcdFx0XHRmaWx0ZXJlZEN1c3RvbU1vZGVzLFxuXHRcdFx0XHRcdG1vZGUgPT4gaXNNb2RlQ29uc2lkZXJlZEJ1aWx0SW4obW9kZSwgdGhpcy5fcHJvZHVjdFNlcnZpY2UpID8gJ2J1aWx0aW4nIDogJ2N1c3RvbScpO1xuXG5cdFx0XHRcdGNvbnN0IGN1c3RvbUJ1aWx0aW5Nb2RlQWN0aW9ucyA9IGN1c3RvbU1vZGVzLmJ1aWx0aW4/Lm1hcChtb2RlID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSBtYWtlQWN0aW9uRnJvbUN1c3RvbU1vZGUobW9kZSwgY3VycmVudE1vZGUpO1xuXHRcdFx0XHRcdGFjdGlvbi5jYXRlZ29yeSA9IGFnZW50TW9kZURpc2FibGVkVmlhUG9saWN5ID8gcG9saWN5RGlzYWJsZWRDYXRlZ29yeSA6IGJ1aWx0SW5DYXRlZ29yeTtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdFx0XHR9KSA/PyBbXTtcblx0XHRcdFx0Y3VzdG9tQnVpbHRpbk1vZGVBY3Rpb25zLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cblx0XHRcdFx0Y29uc3QgY3VzdG9tTW9kZUFjdGlvbnMgPSBjdXN0b21Nb2Rlcy5jdXN0b20/Lm1hcChtb2RlID0+IG1ha2VBY3Rpb25Gcm9tQ3VzdG9tTW9kZShtb2RlLCBjdXJyZW50TW9kZSkpID8/IFtdO1xuXHRcdFx0XHRjdXN0b21Nb2RlQWN0aW9ucy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG5cdFx0XHRcdGNvbnN0IG9yZGVyZWRNb2RlcyA9IGNvYWxlc2NlKFtcblx0XHRcdFx0XHRhZ2VudE1vZGUgJiYgbWFrZUFjdGlvbihhZ2VudE1vZGUsIGN1cnJlbnRNb2RlKSxcblx0XHRcdFx0XHQuLi5vdGhlckJ1aWx0aW5Nb2Rlcy5tYXAobW9kZSA9PiBtb2RlICYmIG1ha2VBY3Rpb24obW9kZSwgY3VycmVudE1vZGUpKSxcblx0XHRcdFx0XHQuLi5jdXN0b21CdWlsdGluTW9kZUFjdGlvbnMsXG5cdFx0XHRcdFx0Li4uY3VzdG9tTW9kZUFjdGlvbnNcblx0XHRcdFx0XSk7XG5cdFx0XHRcdHJldHVybiBvcmRlcmVkTW9kZXM7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGR5bmFtaWNBY3Rpb25Qcm92aWRlcjogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRUYXJnZXQgPSBnZXRDdXN0b21BZ2VudFRhcmdldCgpO1xuXHRcdFx0XHRpZiAoY3VycmVudFRhcmdldCAhPT0gVGFyZ2V0LlVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBnZXRBY3Rpb25zRm9yQ3VzdG9tQWdlbnRUYXJnZXQoY3VycmVudFRhcmdldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFjdGlvblByb3ZpZGVyLmdldEFjdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZVBpY2tlckFjdGlvbldpZGdldE9wdGlvbnM6IE9taXQ8SUFjdGlvbldpZGdldERyb3Bkb3duT3B0aW9ucywgJ2xhYmVsJyB8ICdsYWJlbFJlbmRlcmVyJz4gPSB7XG5cdFx0XHRhY3Rpb25Qcm92aWRlcjogZHluYW1pY0FjdGlvblByb3ZpZGVyLFxuXHRcdFx0YWN0aW9uQmFyQWN0aW9uUHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXRNb2RlUGlja2VyQWN0aW9uQmFyQWN0aW9ucygpXG5cdFx0XHR9LFxuXHRcdFx0c2hvd0l0ZW1LZXliaW5kaW5nczogdHJ1ZSxcblx0XHRcdHJlcG9ydGVyOiB7IGlkOiAnQ2hhdE1vZGVQaWNrZXInLCBuYW1lOiAnQ2hhdE1vZGVQaWNrZXInLCBpbmNsdWRlT3B0aW9uczogdHJ1ZSB9LFxuXHRcdH07XG5cblx0XHRzdXBlcihhY3Rpb24sIG1vZGVQaWNrZXJBY3Rpb25XaWRnZXRPcHRpb25zLCBwaWNrZXJPcHRpb25zLCBhY3Rpb25XaWRnZXRTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGNoYW5nZXMgaW4gdGhlIGN1cnJlbnQgbW9kZSBhbmQgaXRzIHByb3BlcnRpZXNcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLmRlbGVnYXRlLmN1cnJlbnRNb2RlLnJlYWQocmVhZGVyKS5sYWJlbC5yZWFkKHJlYWRlcik7IC8vIHVzZSB0aGUgcmVhZGVyIHNvIGF1dG9ydW4gdHJhY2tzIGl0XG5cdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRhc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQoJ2NoYXQuc2hvd09sZEFza01vZGUnKS50aGVuKHNob3dPbGRBc2tNb2RlID0+IHtcblx0XHRcdGFzc2lnbm1lbnRzLnNldCh7IHNob3dPbGRBc2tNb2RlOiBzaG93T2xkQXNrTW9kZSA9PT0gJ2VuYWJsZWQnIH0sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXNzaWdubWVudFNlcnZpY2Uub25EaWRSZWZldGNoQXNzaWdubWVudHMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzaWdubWVudHMuc2V0KHsgc2hvd09sZEFza01vZGU6IGF3YWl0IGFzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudCgnY2hhdC5zaG93T2xkQXNrTW9kZScpID09PSAnZW5hYmxlZCcgfSwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1vZGVQaWNrZXJBY3Rpb25CYXJBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgbWVudUFjdGlvbnMgPSB0aGlzLm1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLkNoYXRNb2RlUGlja2VyLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBtZW51Q29udHJpYnV0aW9ucyA9IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKG1lbnVBY3Rpb25zLmdldEFjdGlvbnMoeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0pKTtcblx0XHRtZW51QWN0aW9ucy5kaXNwb3NlKCk7XG5cblx0XHRyZXR1cm4gbWVudUNvbnRyaWJ1dGlvbnM7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LW1vZGUtcGlja2VyLWl0ZW0nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJMYWJlbChlbGVtZW50OiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHwgbnVsbCB7XG5cdFx0dGhpcy5zZXRBcmlhTGFiZWxBdHRyaWJ1dGVzKGVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSB0aGlzLmRlbGVnYXRlLmN1cnJlbnRNb2RlLmdldCgpO1xuXHRcdGNvbnN0IHN0YXRlID0gY3VycmVudE1vZGUubGFiZWwuZ2V0KCk7XG5cdFx0bGV0IGljb24gPSBjdXJyZW50TW9kZS5pY29uLmdldCgpO1xuXG5cdFx0Ly8gRXZlcnkgYnVpbHQtaW4gbW9kZSBzaG91bGQgaGF2ZSBhbiBpY29uLiAvLyBUT0RPOiB0aGlzIHNob3VsZCBiZSBwcm92aWRlZCBieSB0aGUgbW9kZSBpdHNlbGZcblx0XHRpZiAoIWljb24gJiYgaXNNb2RlQ29uc2lkZXJlZEJ1aWx0SW4oY3VycmVudE1vZGUsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlKSkge1xuXHRcdFx0aWNvbiA9IGJ1aWx0aW5EZWZhdWx0SWNvbihjdXJyZW50TW9kZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWxFbGVtZW50cyA9IFtdO1xuXHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMucGlja2VyT3B0aW9ucy5jb21wYWN0LmdldCgpO1xuXHRcdGlmIChpY29uKSB7XG5cdFx0XHRsYWJlbEVsZW1lbnRzLnB1c2goLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoJHtpY29uLmlkfSlgKSk7XG5cdFx0fVxuXHRcdGlmICghY29sbGFwc2VkIHx8ICFpY29uKSB7XG5cdFx0XHRsYWJlbEVsZW1lbnRzLnB1c2goZG9tLiQoJ3NwYW4uY2hhdC1pbnB1dC1waWNrZXItbGFiZWwnLCB1bmRlZmluZWQsIHN0YXRlKSk7XG5cdFx0fVxuXG5cdFx0ZG9tLnJlc2V0KGVsZW1lbnQsIC4uLmxhYmVsRWxlbWVudHMpO1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01vZGVDb25zaWRlcmVkQnVpbHRJbihtb2RlOiBJQ2hhdE1vZGUsIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UpOiBib29sZWFuIHtcblx0aWYgKG1vZGUuaXNCdWlsdGluKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Ly8gTm90IGJ1aWx0LWluIGlmIG5vdCBmcm9tIHRoZSBidWlsdC1pbiBjaGF0IGV4dGVuc2lvblxuXHRpZiAobW9kZS5zb3VyY2U/LnN0b3JhZ2UgIT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBjaGF0RXh0ZW5zaW9uSWQgPSBwcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQ7XG5cdGlmICghY2hhdEV4dGVuc2lvbklkIHx8IG1vZGUuc291cmNlLmV4dGVuc2lvbklkLnZhbHVlICE9PSBjaGF0RXh0ZW5zaW9uSWQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Ly8gT3JnYW5pemF0aW9uLXByb3ZpZGVkIGFnZW50cyAodW5kZXIgL2dpdGh1Yi8gcGF0aCkgYXJlIGFsc28gbm90IGNvbnNpZGVyZWQgYnVpbHQtaW5cblx0Y29uc3QgbW9kZVVyaSA9IG1vZGUudXJpPy5nZXQoKTtcblx0aWYgKCFtb2RlVXJpKSB7XG5cdFx0Ly8gSWYgc29tZWhvdyB0aGVyZSBpcyBubyBVUkksIGJ1dCBpdCdzIGZyb20gdGhlIGJ1aWx0LWluIGNoYXQgZXh0ZW5zaW9uLCBjb25zaWRlciBpdCBidWlsdC1pblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiAhaXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlKG1vZGVVcmksIG1vZGUuc291cmNlLmV4dGVuc2lvbklkLCBwcm9kdWN0U2VydmljZSk7XG59XG5cbmZ1bmN0aW9uIHNob3VsZFNob3dCdWlsdEluTW9kZShtb2RlOiBJQ2hhdE1vZGUsIGFzc2lnbm1lbnRzOiB7IHNob3dPbGRBc2tNb2RlOiBib29sZWFuIH0sIGFnZW50TW9kZURpc2FibGVkVmlhUG9saWN5OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdC8vIFRoZSBidWlsdC1pbiBcIkVkaXRcIiBtb2RlIGlzIGRlcHJlY2F0ZWQsIGJ1dCBzdGlsbCBzaG93biB3aGVuIGFnZW50IG1vZGUgaXMgZGlzYWJsZWQgdmlhIHBvbGljeS5cblx0aWYgKG1vZGUuaWQgPT09IENoYXRNb2RlLkVkaXQuaWQpIHtcblx0XHRyZXR1cm4gYWdlbnRNb2RlRGlzYWJsZWRWaWFQb2xpY3k7XG5cdH1cblxuXHQvLyBUaGUgXCJBc2tcIiBtb2RlIGlzIGEgc3BlY2lhbCBjYXNlIC0gd2Ugd2FudCB0byBzaG93IGVpdGhlciB0aGUgb2xkIG9yIG5ldyB2ZXJzaW9uIGJhc2VkIG9uIHRoZSBhc3NpZ25tZW50IG9yIGFnZW50IGRpc2FibGVtZW50LCBidXQgbm90IGJvdGhcblx0Ly8gV2Ugc3RpbGwgc3VwcG9ydCB0aGUgb2xkIFwiQXNrXCIgbW9kZSBmb3IgY29udmVyc2F0aW9ucyB0aGF0IGFscmVhZHkgdXNlIGl0LlxuXHRpZiAobW9kZS5pZCA9PT0gQ2hhdE1vZGUuQXNrLmlkIHx8IG1vZGUubmFtZS5nZXQoKS50b0xvd2VyQ2FzZSgpID09PSAnYXNrJykge1xuXHRcdGlmIChtb2RlLmlkID09PSBDaGF0TW9kZS5Bc2suaWQpIHtcblx0XHRcdHJldHVybiBhc3NpZ25tZW50cy5zaG93T2xkQXNrTW9kZSB8fCBhZ2VudE1vZGVEaXNhYmxlZFZpYVBvbGljeTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuICEoYXNzaWdubWVudHMuc2hvd09sZEFza01vZGUgfHwgYWdlbnRNb2RlRGlzYWJsZWRWaWFQb2xpY3kpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUV4QixT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
