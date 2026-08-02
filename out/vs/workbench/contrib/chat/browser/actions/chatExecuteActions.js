import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { basename } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { assertType } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { getModeNameForTelemetry, buildCustomAgentHandoffsInfo, getHandoffId, IChatModeService } from "../../common/chatModes.js";
import { chatVariableLeader } from "../../common/requestParser/chatParserTypes.js";
import { ChatStopCancellationNoopEventName, IChatService } from "../../common/chatService/chatService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../common/constants.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { isInClaudeAgentsFolder } from "../../common/promptSyntax/config/promptFileLocations.js";
import { IChatSessionsService, localChatSessionType } from "../../common/chatSessionsService.js";
import { IChatWidgetService } from "../chat.js";
import { getAgentSessionProvider, AgentSessionProviders } from "../agentSessions/agentSessions.js";
import { getEditingSessionContext } from "../chatEditing/chatEditingActions.js";
import { ctxHasEditorModification, ctxHasRequestInProgress, ctxIsGlobalEditingSession } from "../chatEditing/chatEditingEditorContextKeys.js";
import { ACTION_ID_NEW_CHAT, CHAT_CATEGORY, clearChatSessionPreservingType, handleCurrentEditingSession, handleModeSwitch } from "./chatActions.js";
import { CreateRemoteAgentJobAction } from "./chatContinueInAction.js";
class SubmitAction extends Action2 {
  async run(accessor, ...args) {
    const context = args[0];
    const telemetryService = accessor.get(ITelemetryService);
    const widgetService = accessor.get(IChatWidgetService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    const pendingDelegationTarget = widget?.input.pendingDelegationTarget;
    if (pendingDelegationTarget && pendingDelegationTarget !== AgentSessionProviders.Local) {
      return await this.handleDelegation(accessor, widget, pendingDelegationTarget);
    }
    if (widget?.viewModel?.editing) {
      const configurationService = accessor.get(IConfigurationService);
      const dialogService = accessor.get(IDialogService);
      const chatService = accessor.get(IChatService);
      const chatModel = chatService.getSession(widget.viewModel.sessionResource);
      if (!chatModel) {
        return;
      }
      const session = chatModel.editingSession;
      if (!session) {
        return;
      }
      const requestId = widget.viewModel?.editing.id;
      if (requestId) {
        const chatRequests = chatModel.getRequests();
        const itemIndex = chatRequests.findIndex((request) => request.id === requestId);
        const editsToUndo = chatRequests.length - itemIndex;
        const requestsToRemove = chatRequests.slice(itemIndex);
        const requestIdsToRemove = new Set(requestsToRemove.map((request) => request.id));
        const entriesModifiedInRequestsToRemove = session.entries.get().filter((entry) => requestIdsToRemove.has(entry.lastModifyingRequestId)) ?? [];
        const shouldPrompt = entriesModifiedInRequestsToRemove.length > 0 && configurationService.getValue("chat.editing.confirmEditRequestRemoval") === true;
        let message;
        if (editsToUndo === 1) {
          if (entriesModifiedInRequestsToRemove.length === 1) {
            message = localize("chat.removeLast.confirmation.message2", "This will remove your last request and undo the edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
          } else {
            message = localize("chat.removeLast.confirmation.multipleEdits.message", "This will remove your last request and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
          }
        } else {
          if (entriesModifiedInRequestsToRemove.length === 1) {
            message = localize("chat.remove.confirmation.message2", "This will remove all subsequent requests and undo edits made to {0}. Do you want to proceed?", basename(entriesModifiedInRequestsToRemove[0].modifiedURI));
          } else {
            message = localize("chat.remove.confirmation.multipleEdits.message", "This will remove all subsequent requests and undo edits made to {0} files in your working set. Do you want to proceed?", entriesModifiedInRequestsToRemove.length);
          }
        }
        const confirmation = shouldPrompt ? await dialogService.confirm({
          title: editsToUndo === 1 ? localize("chat.removeLast.confirmation.title", "Do you want to undo your last edit?") : localize("chat.remove.confirmation.title", "Do you want to undo {0} edits?", editsToUndo),
          message,
          primaryButton: localize("chat.remove.confirmation.primaryButton", "Yes"),
          checkbox: { label: localize("chat.remove.confirmation.checkbox", "Don't ask again"), checked: false },
          type: "info"
        }) : { confirmed: true };
        if (!confirmation.confirmed) {
          telemetryService.publicLog2("chat.undoEditsConfirmation", {
            editRequestType: configurationService.getValue("chat.editRequests"),
            outcome: "cancelled",
            editsUndoCount: editsToUndo
          });
          return;
        } else if (editsToUndo > 0) {
          telemetryService.publicLog2("chat.undoEditsConfirmation", {
            editRequestType: configurationService.getValue("chat.editRequests"),
            outcome: "applied",
            editsUndoCount: editsToUndo
          });
        }
        if (confirmation.checkboxChecked) {
          await configurationService.updateValue("chat.editing.confirmEditRequestRemoval", false);
        }
        const snapshotRequestId = chatRequests[itemIndex].id;
        await session.restoreSnapshot(snapshotRequestId, void 0);
      }
    } else if (widget?.viewModel?.model.checkpoint) {
      widget.viewModel.model.setCheckpoint(void 0);
    }
    widget?.acceptInput(context?.inputValue, context?.acceptInputOptions);
  }
  async handleDelegation(accessor, widget, delegationTarget) {
    const chatSessionsService = accessor.get(IChatSessionsService);
    const contributions = chatSessionsService.getAllChatSessionContributions();
    const targetContribution = contributions.find((contrib) => {
      const providerType = getAgentSessionProvider(contrib.type);
      return providerType === delegationTarget || contrib.type === delegationTarget;
    });
    if (!targetContribution) {
      throw new Error(`No contribution found for delegation target: ${delegationTarget}`);
    }
    if (targetContribution.canDelegate === false) {
      throw new Error(`The contribution for delegation target: ${delegationTarget} does not support delegation.`);
    }
    return new CreateRemoteAgentJobAction().run(accessor, targetContribution, widget);
  }
}
const whenNoActiveRequest = ChatContextKeys.hasActiveRequest.negate();
const whenNotInProgress = ChatContextKeys.requestInProgress.negate();
const _ChatSubmitAction = class _ChatSubmitAction extends SubmitAction {
  constructor() {
    const menuCondition = ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask);
    const precondition = ContextKeyExpr.and(
      ChatContextKeys.inputHasSendableContent,
      ContextKeyExpr.or(whenNotInProgress, ChatContextKeys.editingRequestType.isEqualTo(ChatContextKeys.EditingRequestType.Sent)),
      ChatContextKeys.chatSessionOptionsValid
    );
    super({
      id: _ChatSubmitAction.ID,
      title: localize2("interactive.submit.label", "Send"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.arrowUpCompact,
      precondition,
      toggled: {
        condition: ChatContextKeys.lockedToCodingAgent,
        icon: Codicon.arrowUpCompact,
        tooltip: localize("sendToAgent", "Send to Agent")
      },
      keybinding: {
        when: ContextKeyExpr.and(
          ChatContextKeys.inChatInput,
          ChatContextKeys.withinEditSessionDiff.negate()
        ),
        primary: KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [
        {
          id: MenuId.ChatExecute,
          order: 4,
          when: ContextKeyExpr.and(
            whenNoActiveRequest,
            menuCondition,
            ChatContextKeys.withinEditSessionDiff.negate()
          ),
          group: "navigation",
          alt: {
            id: "workbench.action.chat.sendToNewChat",
            title: localize2("chat.newChat.label", "Send to New Chat"),
            icon: Codicon.plus
          }
        },
        {
          id: MenuId.ChatEditorInlineExecute,
          group: "navigation",
          order: 4,
          when: ContextKeyExpr.and(
            ContextKeyExpr.or(ctxHasEditorModification.negate(), ChatContextKeys.inputHasText),
            whenNoActiveRequest,
            menuCondition
          )
        }
      ]
    });
  }
};
_ChatSubmitAction.ID = "workbench.action.chat.submit";
let ChatSubmitAction = _ChatSubmitAction;
const ToggleAgentModeActionId = "workbench.action.chat.toggleAgentMode";
const _ToggleChatModeAction = class _ToggleChatModeAction extends Action2 {
  constructor() {
    super({
      id: _ToggleChatModeAction.ID,
      title: localize2("interactive.toggleAgent.label", "Switch to Next Agent"),
      f1: true,
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.enabled,
        ChatContextKeys.requestInProgress.negate()
      )
    });
  }
  async run(accessor, ...args) {
    const commandService = accessor.get(ICommandService);
    const instaService = accessor.get(IInstantiationService);
    const telemetryService = accessor.get(ITelemetryService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    const arg = args.at(0);
    let widget;
    if (arg?.sessionResource) {
      widget = chatWidgetService.getWidgetBySessionResource(arg.sessionResource);
    } else {
      widget = getEditingSessionContext(accessor, args)?.chatWidget;
    }
    if (!widget) {
      return;
    }
    const chatSession = widget.viewModel?.model;
    const requestCount = chatSession?.getRequests().length ?? 0;
    const modes = widget.input.currentChatModesObs.get();
    const switchToMode = (arg && (modes.findModeById(arg.modeId) || modes.findModeByName(arg.modeId))) ?? this.getNextMode(widget, requestCount, modes);
    const currentMode = widget.input.currentModeObs.get();
    if (switchToMode.id === currentMode.id) {
      return;
    }
    const chatModeCheck = await instaService.invokeFunction(handleModeSwitch, widget.input.currentModeKind, switchToMode.kind, requestCount, widget.viewModel?.model);
    if (!chatModeCheck) {
      return;
    }
    const storage = switchToMode.source?.storage ?? "builtin";
    const extensionId = switchToMode.source?.storage === "extension" ? switchToMode.source.extensionId.value : void 0;
    const toolsCount = switchToMode.customTools?.get()?.length ?? 0;
    const handoffsCount = switchToMode.handOffs?.get()?.length ?? 0;
    const modeUri = switchToMode.uri?.get();
    const isClaudeAgent = modeUri ? isInClaudeAgentsFolder(modeUri) : void 0;
    telemetryService.publicLog2("chat.modeChange", {
      fromMode: getModeNameForTelemetry(currentMode),
      mode: getModeNameForTelemetry(switchToMode),
      requestCount,
      storage,
      extensionId,
      toolsCount,
      handoffsCount,
      isClaudeAgent
    });
    widget.input.setChatMode(switchToMode.id, true, true);
    if (chatModeCheck.needToClearSession) {
      await commandService.executeCommand(ACTION_ID_NEW_CHAT);
    }
  }
  getNextMode(chatWidget, requestCount, modes) {
    const flat = [
      ...modes.builtin.filter((mode) => {
        return mode.kind !== ChatModeKind.Edit || requestCount === 0;
      }),
      ...modes.custom ?? []
    ];
    const curModeIndex = flat.findIndex((mode) => mode.id === chatWidget.input.currentModeObs.get().id);
    const newMode = flat[(curModeIndex + 1) % flat.length];
    return newMode;
  }
};
_ToggleChatModeAction.ID = ToggleAgentModeActionId;
let ToggleChatModeAction = _ToggleChatModeAction;
const _SwitchToNextModelAction = class _SwitchToNextModelAction extends Action2 {
  constructor() {
    super({
      id: _SwitchToNextModelAction.ID,
      title: localize2("interactive.switchToNextModel.label", "Switch to Next Model"),
      category: CHAT_CATEGORY,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    widget?.input.switchToNextModel();
  }
};
_SwitchToNextModelAction.ID = "workbench.action.chat.switchToNextModel";
let SwitchToNextModelAction = _SwitchToNextModelAction;
const _SwitchToNextPinnedModelAction = class _SwitchToNextPinnedModelAction extends Action2 {
  constructor() {
    super({
      id: _SwitchToNextPinnedModelAction.ID,
      title: localize2("interactive.switchToNextPinnedModel.label", "Switch to Next Pinned Model"),
      category: CHAT_CATEGORY,
      f1: true,
      precondition: ChatContextKeys.enabled
    });
  }
  run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    widget?.input.switchToNextPinnedModel();
  }
};
_SwitchToNextPinnedModelAction.ID = "workbench.action.chat.switchToNextPinnedModel";
let SwitchToNextPinnedModelAction = _SwitchToNextPinnedModelAction;
const _OpenModelPickerAction = class _OpenModelPickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenModelPickerAction.ID,
      title: localize2("interactive.openModelPicker.label", "Open Model Picker"),
      category: CHAT_CATEGORY,
      f1: false,
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Period,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ChatContextKeys.inChatInput
      },
      precondition: ChatContextKeys.enabled,
      menu: {
        id: MenuId.ChatInput,
        order: 3,
        group: "navigation",
        when: ContextKeyExpr.and(
          // Hide the model picker while a delegation (continue in) target is pending
          ChatContextKeys.hasPendingDelegationTarget.negate(),
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.chatSessionHasTargetedModels
          ),
          ContextKeyExpr.or(
            ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Chat),
            ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.EditorInline),
            ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Notebook),
            ContextKeyExpr.equals(ChatContextKeys.location.key, ChatAgentLocation.Terminal)
          ),
          // Hide in welcome view when session type is not local
          ContextKeyExpr.or(
            ChatContextKeys.inAgentSessionsWelcome.negate(),
            ChatContextKeys.chatSessionHasTargetedModels,
            ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)
          )
        )
      }
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      await widgetService.reveal(widget);
      widget.input.openModelPicker();
    }
  }
};
_OpenModelPickerAction.ID = "workbench.action.chat.openModelPicker";
let OpenModelPickerAction = _OpenModelPickerAction;
const _OpenPermissionPickerAction = class _OpenPermissionPickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenPermissionPickerAction.ID,
      title: localize2("interactive.openPermissionPicker.label", "Open Permission Picker"),
      tooltip: localize("setPermissionLevel", "Set Permissions"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: {
        id: MenuId.ChatInputSecondary,
        order: 1,
        group: "navigation",
        when: ContextKeyExpr.and(
          ChatContextKeys.enabled,
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask),
          ChatContextKeys.inQuickChat.negate(),
          ContextKeyExpr.or(
            ChatContextKeys.lockedToCodingAgent.negate(),
            ChatContextKeys.lockedCodingAgentId.isEqualTo(AgentSessionProviders.Background),
            ChatContextKeys.lockedCodingAgentId.isEqualTo(AgentSessionProviders.Claude)
          )
        )
      }
    });
  }
  async run(accessor) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openPermissionPicker();
    }
  }
};
_OpenPermissionPickerAction.ID = "workbench.action.chat.openPermissionPicker";
let OpenPermissionPickerAction = _OpenPermissionPickerAction;
const _OpenModePickerAction = class _OpenModePickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenModePickerAction.ID,
      title: localize2("interactive.openModePicker.label", "Open Agent Picker"),
      tooltip: localize("setChatMode", "Set Agent"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ChatContextKeys.enabled,
      keybinding: {
        when: ContextKeyExpr.and(
          ChatContextKeys.inChatInput,
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat)
        ),
        primary: KeyMod.CtrlCmd | KeyCode.Period,
        weight: KeybindingWeight.EditorContrib
      },
      menu: [
        {
          id: MenuId.ChatInput,
          order: 1,
          when: ContextKeyExpr.and(
            ChatContextKeys.enabled,
            ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
            ChatContextKeys.inQuickChat.negate(),
            // Hide the agent picker while a delegation (continue in) target is pending
            ChatContextKeys.hasPendingDelegationTarget.negate(),
            ContextKeyExpr.or(
              ChatContextKeys.lockedToCodingAgent.negate(),
              ChatContextKeys.chatSessionHasCustomAgentTarget
            ),
            // Show in welcome view for local sessions or sessions with custom agent target
            ContextKeyExpr.or(
              ChatContextKeys.inAgentSessionsWelcome.negate(),
              ChatContextKeys.chatSessionHasCustomAgentTarget,
              ChatContextKeys.agentSessionType.isEqualTo(AgentSessionProviders.Local)
            )
          ),
          group: "navigation"
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openModePicker();
    }
  }
};
_OpenModePickerAction.ID = "workbench.action.chat.openModePicker";
let OpenModePickerAction = _OpenModePickerAction;
const _OpenSessionTargetPickerAction = class _OpenSessionTargetPickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenSessionTargetPickerAction.ID,
      title: localize2("interactive.openSessionTargetPicker.label", "Open Session Target Picker"),
      tooltip: localize("setSessionTarget", "Set Session Target"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.or(ChatContextKeys.chatSessionIsEmpty, ChatContextKeys.inAgentSessionsWelcome), ChatContextKeys.currentlyEditingInput.negate(), ChatContextKeys.currentlyEditing.negate()),
      menu: [
        {
          id: MenuId.ChatInput,
          order: 0,
          when: ContextKeyExpr.and(
            ChatContextKeys.enabled,
            ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
            ChatContextKeys.inQuickChat.negate(),
            ChatContextKeys.chatSessionIsEmpty,
            IsSessionsWindowContext
          ),
          group: "navigation"
        },
        {
          id: MenuId.ChatInputSecondary,
          order: 0,
          when: ContextKeyExpr.and(
            ChatContextKeys.enabled,
            ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
            ChatContextKeys.inQuickChat.negate(),
            IsSessionsWindowContext.negate(),
            ChatContextKeys.chatSessionIsEmpty
          ),
          group: "navigation"
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openSessionTargetPicker();
    }
  }
};
_OpenSessionTargetPickerAction.ID = "workbench.action.chat.openSessionTargetPicker";
let OpenSessionTargetPickerAction = _OpenSessionTargetPickerAction;
const _OpenDelegationPickerAction = class _OpenDelegationPickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenDelegationPickerAction.ID,
      title: localize2("interactive.openDelegationPicker.label", "Open Delegation Picker"),
      tooltip: localize("delegateSession", "Delegate Session"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.chatSessionIsEmpty.negate(), ChatContextKeys.currentlyEditingInput.negate(), ChatContextKeys.currentlyEditing.negate()),
      menu: [
        {
          id: MenuId.ChatInputSecondary,
          order: 0.5,
          when: ContextKeyExpr.and(
            ChatContextKeys.enabled,
            ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
            ChatContextKeys.inQuickChat.negate(),
            ChatContextKeys.chatSessionSupportsDelegation,
            ChatContextKeys.chatSessionIsEmpty.negate(),
            IsSessionsWindowContext.negate()
          ),
          group: "navigation"
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openDelegationPicker();
    }
  }
};
_OpenDelegationPickerAction.ID = "workbench.action.chat.openDelegationPicker";
let OpenDelegationPickerAction = _OpenDelegationPickerAction;
const _OpenWorkspacePickerAction = class _OpenWorkspacePickerAction extends Action2 {
  constructor() {
    super({
      id: _OpenWorkspacePickerAction.ID,
      title: localize2("interactive.openWorkspacePicker.label", "Open Workspace Picker"),
      tooltip: localize("selectWorkspace", "Select Target Workspace"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.inAgentSessionsWelcome),
      menu: [
        {
          id: MenuId.ChatInputSecondary,
          order: 0.6,
          when: ContextKeyExpr.and(
            ChatContextKeys.inAgentSessionsWelcome,
            ChatContextKeys.chatSessionType.isEqualTo(localChatSessionType)
          ),
          group: "navigation"
        }
      ]
    });
  }
  async run(accessor, ...args) {
  }
};
_OpenWorkspacePickerAction.ID = "workbench.action.chat.openWorkspacePicker";
let OpenWorkspacePickerAction = _OpenWorkspacePickerAction;
const _ChatSessionPrimaryPickerAction = class _ChatSessionPrimaryPickerAction extends Action2 {
  constructor() {
    super({
      id: _ChatSessionPrimaryPickerAction.ID,
      title: localize2("interactive.openChatSessionPrimaryPicker.label", "Open Primary Session Picker"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ChatContextKeys.enabled,
      menu: [
        {
          // Cloud sessions: keep on the primary chat input toolbar
          id: MenuId.ChatInput,
          order: 4,
          group: "navigation",
          when: ContextKeyExpr.and(
            ChatContextKeys.chatSessionHasModels,
            ChatContextKeys.chatSessionType.isEqualTo(AgentSessionProviders.Cloud),
            ContextKeyExpr.or(
              ChatContextKeys.lockedToCodingAgent,
              ContextKeyExpr.and(
                ChatContextKeys.inAgentSessionsWelcome,
                ChatContextKeys.chatSessionType.notEqualsTo("local")
              )
            )
          )
        },
        {
          // All other coding agents (Claude, etc.): show in the secondary toolbar.
          // In the Agents window only, hide the worktree/branch pickers for Copilot
          // CLI sessions because their option groups are surfaced through the CLI
          // session UI there. They remain visible in the regular VS Code workbench.
          id: MenuId.ChatInputSecondary,
          order: 4,
          group: "navigation",
          when: ContextKeyExpr.and(
            ChatContextKeys.chatSessionHasModels,
            ChatContextKeys.chatSessionType.notEqualsTo(AgentSessionProviders.Cloud),
            ContextKeyExpr.or(
              IsSessionsWindowContext.negate(),
              ChatContextKeys.chatSessionType.notEqualsTo(AgentSessionProviders.Background)
            ),
            ContextKeyExpr.or(
              ChatContextKeys.lockedToCodingAgent,
              ContextKeyExpr.and(
                ChatContextKeys.inAgentSessionsWelcome,
                ChatContextKeys.chatSessionType.notEqualsTo("local")
              )
            )
          )
        }
      ]
    });
  }
  async run(accessor, ...args) {
    const widgetService = accessor.get(IChatWidgetService);
    const widget = widgetService.lastFocusedWidget;
    if (widget) {
      widget.input.openChatSessionPicker();
    }
  }
};
_ChatSessionPrimaryPickerAction.ID = "workbench.action.chat.chatSessionPrimaryPicker";
let ChatSessionPrimaryPickerAction = _ChatSessionPrimaryPickerAction;
const ChangeChatModelActionId = "workbench.action.chat.changeModel";
const _ChangeChatModelAction = class _ChangeChatModelAction extends Action2 {
  constructor() {
    super({
      id: _ChangeChatModelAction.ID,
      title: localize2("interactive.changeModel.label", "Change Model"),
      category: CHAT_CATEGORY,
      f1: false,
      precondition: ChatContextKeys.enabled
    });
  }
  run(accessor, ...args) {
    const modelInfo = args[0];
    assertType(typeof modelInfo.vendor === "string" && typeof modelInfo.id === "string" && typeof modelInfo.family === "string");
    const widgetService = accessor.get(IChatWidgetService);
    const widgets = widgetService.getAllWidgets();
    for (const widget of widgets) {
      widget.input.switchModel(modelInfo);
    }
  }
};
_ChangeChatModelAction.ID = ChangeChatModelActionId;
let ChangeChatModelAction = _ChangeChatModelAction;
const _ChatEditingSessionSubmitAction = class _ChatEditingSessionSubmitAction extends SubmitAction {
  constructor() {
    const notInProgressOrEditing = ContextKeyExpr.and(
      ContextKeyExpr.or(whenNoActiveRequest, ChatContextKeys.editingRequestType.isEqualTo(ChatContextKeys.EditingRequestType.Sent)),
      ChatContextKeys.editingRequestType.notEqualsTo(ChatContextKeys.EditingRequestType.Queue),
      ChatContextKeys.editingRequestType.notEqualsTo(ChatContextKeys.EditingRequestType.Steer)
    );
    const menuCondition = ChatContextKeys.chatModeKind.notEqualsTo(ChatModeKind.Ask);
    const precondition = ContextKeyExpr.and(
      ChatContextKeys.inputHasSendableContent,
      notInProgressOrEditing,
      ChatContextKeys.chatSessionOptionsValid
    );
    super({
      id: _ChatEditingSessionSubmitAction.ID,
      title: localize2("edits.submit.label", "Send"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.arrowUpCompact,
      precondition,
      menu: [
        {
          id: MenuId.ChatExecute,
          order: 4,
          when: ContextKeyExpr.and(
            notInProgressOrEditing,
            menuCondition
          ),
          group: "navigation",
          alt: {
            id: "workbench.action.chat.sendToNewChat",
            title: localize2("chat.newChat.label", "Send to New Chat"),
            icon: Codicon.plus
          }
        }
      ]
    });
  }
};
_ChatEditingSessionSubmitAction.ID = "workbench.action.edits.submit";
let ChatEditingSessionSubmitAction = _ChatEditingSessionSubmitAction;
const _SubmitWithoutDispatchingAction = class _SubmitWithoutDispatchingAction extends Action2 {
  constructor() {
    const precondition = ContextKeyExpr.and(
      ChatContextKeys.inputHasText,
      whenNotInProgress,
      ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Ask)
    );
    super({
      id: _SubmitWithoutDispatchingAction.ID,
      title: localize2("interactive.submitWithoutDispatch.label", "Send"),
      f1: false,
      category: CHAT_CATEGORY,
      precondition,
      keybinding: {
        when: ChatContextKeys.inChatInput,
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    widget?.acceptInput(context?.inputValue, { noCommandDetection: true });
  }
};
_SubmitWithoutDispatchingAction.ID = "workbench.action.chat.submitWithoutDispatching";
let SubmitWithoutDispatchingAction = _SubmitWithoutDispatchingAction;
const _ChatSubmitWithCodebaseAction = class _ChatSubmitWithCodebaseAction extends Action2 {
  constructor() {
    const precondition = ContextKeyExpr.and(
      ChatContextKeys.inputHasText,
      whenNotInProgress
    );
    super({
      id: _ChatSubmitWithCodebaseAction.ID,
      title: localize2("actions.chat.submitWithCodebase", "Send with {0}", `${chatVariableLeader}codebase`),
      precondition,
      keybinding: {
        when: ChatContextKeys.inChatInput,
        primary: KeyMod.CtrlCmd | KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const languageModelToolsService = accessor.get(ILanguageModelToolsService);
    const codebaseTool = languageModelToolsService.getToolByName("codebase");
    if (!codebaseTool) {
      return;
    }
    widget.input.attachmentModel.addContext({
      id: codebaseTool.id,
      name: codebaseTool.displayName ?? "",
      fullName: codebaseTool.displayName ?? "",
      value: void 0,
      icon: ThemeIcon.isThemeIcon(codebaseTool.icon) ? codebaseTool.icon : void 0,
      kind: "tool"
    });
    widget.acceptInput();
  }
};
_ChatSubmitWithCodebaseAction.ID = "workbench.action.chat.submitWithCodebase";
let ChatSubmitWithCodebaseAction = _ChatSubmitWithCodebaseAction;
class SendToNewChatAction extends Action2 {
  constructor() {
    const precondition = ChatContextKeys.inputHasText;
    super({
      id: "workbench.action.chat.sendToNewChat",
      title: localize2("chat.newChat.label", "Send to New Chat"),
      precondition,
      category: CHAT_CATEGORY,
      f1: false,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
        when: ChatContextKeys.inChatInput
      }
    });
  }
  async run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const dialogService = accessor.get(IDialogService);
    const chatService = accessor.get(IChatService);
    const instantiationService = accessor.get(IInstantiationService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const inputBeforeClear = widget.getInput();
    if (widget.viewModel) {
      await chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource, "newSessionAction");
    }
    if (widget.viewModel?.model) {
      if (!await handleCurrentEditingSession(widget.viewModel.model, void 0, dialogService)) {
        return;
      }
    }
    widget.setInput("");
    await instantiationService.invokeFunction(clearChatSessionPreservingType, widget, void 0);
    widget.acceptInput(inputBeforeClear, { storeToHistory: true });
  }
}
const CancelChatActionId = "workbench.action.chat.cancel";
const _CancelAction = class _CancelAction extends Action2 {
  constructor() {
    super({
      id: _CancelAction.ID,
      title: localize2("interactive.cancel.label", "Cancel"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.stopCircle,
      menu: [
        {
          id: MenuId.ChatExecute,
          when: ContextKeyExpr.and(
            ChatContextKeys.hasActiveRequest,
            ChatContextKeys.remoteJobCreating.negate(),
            ChatContextKeys.currentlyEditing.negate()
          ),
          order: 4,
          group: "navigation"
        },
        {
          id: MenuId.ChatEditorInlineExecute,
          when: ContextKeyExpr.and(
            ctxIsGlobalEditingSession.negate(),
            ctxHasRequestInProgress
          ),
          order: 4,
          group: "navigation"
        }
      ],
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.Escape,
        when: ContextKeyExpr.and(
          ChatContextKeys.hasActiveRequest,
          ChatContextKeys.remoteJobCreating.negate()
        ),
        win: { primary: KeyMod.Alt | KeyCode.Backspace }
      }
    });
  }
  async run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const logService = accessor.get(ILogService);
    const telemetryService = accessor.get(ITelemetryService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
        source: "cancelAction",
        reason: "noWidget",
        requestInProgress: "unknown",
        pendingRequests: 0
      });
      logService.info("ChatCancelAction#run: No focused chat widget was found");
      return;
    }
    const chatService = accessor.get(IChatService);
    if (widget.viewModel) {
      await chatService.cancelCurrentRequestForSession(widget.viewModel.sessionResource, "cancelAction");
    } else {
      telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
        source: "cancelAction",
        reason: "noViewModel",
        requestInProgress: "unknown",
        pendingRequests: 0
      });
      logService.info("ChatCancelAction#run: Canceled chat widget has no view model");
    }
  }
};
_CancelAction.ID = CancelChatActionId;
let CancelAction = _CancelAction;
const CancelChatEditId = "workbench.edit.chat.cancel";
const _CancelEdit = class _CancelEdit extends Action2 {
  constructor() {
    super({
      id: _CancelEdit.ID,
      title: localize2("interactive.cancelEdit.label", "Cancel Edit"),
      f1: false,
      category: CHAT_CATEGORY,
      icon: Codicon.x,
      menu: [
        {
          id: MenuId.ChatMessageTitle,
          group: "navigation",
          order: 1,
          when: ContextKeyExpr.and(ChatContextKeys.isRequest, ChatContextKeys.currentlyEditing, ContextKeyExpr.equals(`config.${ChatConfiguration.EditRequests}`, "input"))
        }
      ],
      keybinding: {
        primary: KeyCode.Escape,
        when: ContextKeyExpr.and(
          ChatContextKeys.inChatInput,
          EditorContextKeys.hoverVisible.toNegated(),
          EditorContextKeys.hasNonEmptySelection.toNegated(),
          EditorContextKeys.hasMultipleSelections.toNegated(),
          ContextKeyExpr.or(ChatContextKeys.currentlyEditing, ChatContextKeys.currentlyEditingInput)
        ),
        weight: KeybindingWeight.EditorContrib - 5
      }
    });
  }
  run(accessor, ...args) {
    const context = args[0];
    const widgetService = accessor.get(IChatWidgetService);
    const widget = context?.widget ?? widgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    widget.finishedEditing();
  }
};
_CancelEdit.ID = CancelChatEditId;
let CancelEdit = _CancelEdit;
const GetHandoffsActionId = "workbench.action.chat.getHandoffs";
const _GetHandoffsAction = class _GetHandoffsAction extends Action2 {
  constructor() {
    super({
      id: _GetHandoffsAction.ID,
      title: localize2("chat.getHandoffs.label", "Get Handoffs"),
      f1: false,
      category: CHAT_CATEGORY
    });
  }
  async run(accessor, ...args) {
    const modeService = accessor.get(IChatModeService);
    const arg = args.at(0);
    const { builtin, custom } = await modeService.getLocalModes();
    let allModes = [...builtin, ...custom];
    if (arg?.sourceCustomAgent) {
      const filterName = arg.sourceCustomAgent;
      allModes = allModes.filter((m) => m.name.get().toLowerCase() === filterName.toLowerCase());
    }
    return buildCustomAgentHandoffsInfo(allModes);
  }
};
_GetHandoffsAction.ID = GetHandoffsActionId;
let GetHandoffsAction = _GetHandoffsAction;
const ExecuteHandoffActionId = "workbench.action.chat.executeHandoff";
const _ExecuteHandoffAction = class _ExecuteHandoffAction extends Action2 {
  constructor() {
    super({
      id: _ExecuteHandoffAction.ID,
      title: localize2("chat.executeHandoff.label", "Execute Handoff"),
      f1: false,
      category: CHAT_CATEGORY
    });
  }
  async run(accessor, ...args) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const arg = args.at(0);
    if (!arg?.id && !arg?.label) {
      return { success: false, error: "Either id or label is required" };
    }
    let widget;
    if (arg.sessionResource) {
      let sessionResource;
      try {
        sessionResource = URI.parse(arg.sessionResource);
      } catch {
        return { success: false, error: `Invalid sessionResource URI: '${arg.sessionResource}'` };
      }
      widget = chatWidgetService.getWidgetBySessionResource(sessionResource);
    } else {
      widget = chatWidgetService.lastFocusedWidget;
    }
    if (!widget) {
      return { success: false, error: "No chat widget found. Provide sessionResource or focus a chat widget." };
    }
    let sourceMode;
    if (arg.sourceCustomAgent) {
      const filterName = arg.sourceCustomAgent.toLowerCase();
      const { builtin, custom } = widget.input.currentChatModesObs.get();
      sourceMode = [...builtin, ...custom].find((m) => m.name.get().toLowerCase() === filterName || m.id.toLowerCase() === filterName);
    }
    if (!sourceMode) {
      sourceMode = widget.input.currentModeObs.get();
    }
    const handoffs = sourceMode?.handOffs?.get();
    if (!handoffs || handoffs.length === 0) {
      return { success: false, error: `No handoffs available for mode '${sourceMode?.name.get()}'` };
    }
    let matchedHandoff = arg.id ? handoffs.find((h) => getHandoffId(h) === arg.id) : void 0;
    if (!matchedHandoff && arg.label) {
      const labelLower = arg.label.trim().toLowerCase();
      matchedHandoff = handoffs.find((h) => h.label.trim().toLowerCase() === labelLower);
    }
    if (!matchedHandoff) {
      const identifier = arg.id ?? arg.label;
      return { success: false, error: `No handoff with identifier '${identifier}' found for mode '${sourceMode?.name.get()}'` };
    }
    await widget.executeHandoff(matchedHandoff);
    return { success: true, targetMode: matchedHandoff.agent };
  }
};
_ExecuteHandoffAction.ID = ExecuteHandoffActionId;
let ExecuteHandoffAction = _ExecuteHandoffAction;
function registerChatExecuteActions() {
  const store = new DisposableStore();
  store.add(registerAction2(ChatSubmitAction));
  store.add(registerAction2(ChatEditingSessionSubmitAction));
  store.add(registerAction2(SubmitWithoutDispatchingAction));
  store.add(registerAction2(CancelAction));
  store.add(registerAction2(SendToNewChatAction));
  store.add(registerAction2(ChatSubmitWithCodebaseAction));
  store.add(registerAction2(ToggleChatModeAction));
  store.add(registerAction2(SwitchToNextModelAction));
  store.add(registerAction2(SwitchToNextPinnedModelAction));
  store.add(registerAction2(OpenModelPickerAction));
  store.add(registerAction2(OpenPermissionPickerAction));
  store.add(registerAction2(OpenModePickerAction));
  store.add(registerAction2(OpenSessionTargetPickerAction));
  store.add(registerAction2(OpenDelegationPickerAction));
  store.add(registerAction2(OpenWorkspacePickerAction));
  store.add(registerAction2(ChatSessionPrimaryPickerAction));
  store.add(registerAction2(ChangeChatModelAction));
  store.add(registerAction2(CancelEdit));
  store.add(registerAction2(GetHandoffsAction));
  store.add(registerAction2(ExecuteHandoffAction));
  return store;
}
export {
  CancelAction,
  CancelChatActionId,
  CancelChatEditId,
  CancelEdit,
  ChangeChatModelActionId,
  ChatEditingSessionSubmitAction,
  ChatSessionPrimaryPickerAction,
  ChatSubmitAction,
  ChatSubmitWithCodebaseAction,
  ExecuteHandoffActionId,
  GetHandoffsActionId,
  OpenDelegationPickerAction,
  OpenModePickerAction,
  OpenModelPickerAction,
  OpenPermissionPickerAction,
  OpenSessionTargetPickerAction,
  OpenWorkspacePickerAction,
  ToggleAgentModeActionId,
  registerChatExecuteActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRFeGVjdXRlQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGdldE1vZGVOYW1lRm9yVGVsZW1ldHJ5LCBidWlsZEN1c3RvbUFnZW50SGFuZG9mZnNJbmZvLCBnZXRIYW5kb2ZmSWQsIElDaGF0TW9kZSwgSUNoYXRNb2RlU2VydmljZSwgSUNoYXRNb2RlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgY2hhdFZhcmlhYmxlTGVhZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcENsYXNzaWZpY2F0aW9uLCBDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BFdmVudCwgQ2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wRXZlbnROYW1lLCBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNJbkNsYXVkZUFnZW50c0ZvbGRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ2hhdEFjY2VwdElucHV0T3B0aW9ucywgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIsIEFnZW50U2Vzc2lvblByb3ZpZGVycywgQWdlbnRTZXNzaW9uVGFyZ2V0IH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IGdldEVkaXRpbmdTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24sIGN0eEhhc1JlcXVlc3RJblByb2dyZXNzLCBjdHhJc0dsb2JhbEVkaXRpbmdTZXNzaW9uIH0gZnJvbSAnLi4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdFZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBBQ1RJT05fSURfTkVXX0NIQVQsIENIQVRfQ0FURUdPUlksIGNsZWFyQ2hhdFNlc3Npb25QcmVzZXJ2aW5nVHlwZSwgaGFuZGxlQ3VycmVudEVkaXRpbmdTZXNzaW9uLCBoYW5kbGVNb2RlU3dpdGNoIH0gZnJvbSAnLi9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDcmVhdGVSZW1vdGVBZ2VudEpvYkFjdGlvbiB9IGZyb20gJy4vY2hhdENvbnRpbnVlSW5BY3Rpb24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IGRpc2FibGVUaW1lb3V0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IHtcblx0d2lkZ2V0PzogSUNoYXRXaWRnZXQ7XG5cdGlucHV0VmFsdWU/OiBzdHJpbmc7XG5cdGFjY2VwdElucHV0T3B0aW9ucz86IElDaGF0QWNjZXB0SW5wdXRPcHRpb25zO1xuXHR2b2ljZT86IElWb2ljZUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dDtcbn1cblxuYWJzdHJhY3QgY2xhc3MgU3VibWl0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGFyZ3NbMF0gYXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY29udGV4dD8ud2lkZ2V0ID8/IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cblx0XHQvLyBDaGVjayBpZiB0aGVyZSdzIGEgcGVuZGluZyBkZWxlZ2F0aW9uIHRhcmdldFxuXHRcdGNvbnN0IHBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0ID0gd2lkZ2V0Py5pbnB1dC5wZW5kaW5nRGVsZWdhdGlvblRhcmdldDtcblx0XHRpZiAocGVuZGluZ0RlbGVnYXRpb25UYXJnZXQgJiYgcGVuZGluZ0RlbGVnYXRpb25UYXJnZXQgIT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuaGFuZGxlRGVsZWdhdGlvbihhY2Nlc3Nvciwgd2lkZ2V0LCBwZW5kaW5nRGVsZWdhdGlvblRhcmdldCk7XG5cdFx0fVxuXG5cdFx0aWYgKHdpZGdldD8udmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbih3aWRnZXQudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWNoYXRNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjaGF0TW9kZWwuZWRpdGluZ1Nlc3Npb247XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXF1ZXN0SWQgPSB3aWRnZXQudmlld01vZGVsPy5lZGl0aW5nLmlkO1xuXG5cdFx0XHRpZiAocmVxdWVzdElkKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXRSZXF1ZXN0cyA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdFx0XHRjb25zdCBpdGVtSW5kZXggPSBjaGF0UmVxdWVzdHMuZmluZEluZGV4KHJlcXVlc3QgPT4gcmVxdWVzdC5pZCA9PT0gcmVxdWVzdElkKTtcblx0XHRcdFx0Y29uc3QgZWRpdHNUb1VuZG8gPSBjaGF0UmVxdWVzdHMubGVuZ3RoIC0gaXRlbUluZGV4O1xuXG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RzVG9SZW1vdmUgPSBjaGF0UmVxdWVzdHMuc2xpY2UoaXRlbUluZGV4KTtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdElkc1RvUmVtb3ZlID0gbmV3IFNldChyZXF1ZXN0c1RvUmVtb3ZlLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QuaWQpKTtcblx0XHRcdFx0Y29uc3QgZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlID0gc2Vzc2lvbi5lbnRyaWVzLmdldCgpLmZpbHRlcigoZW50cnkpID0+IHJlcXVlc3RJZHNUb1JlbW92ZS5oYXMoZW50cnkubGFzdE1vZGlmeWluZ1JlcXVlc3RJZCkpID8/IFtdO1xuXHRcdFx0XHRjb25zdCBzaG91bGRQcm9tcHQgPSBlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUubGVuZ3RoID4gMCAmJiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnY2hhdC5lZGl0aW5nLmNvbmZpcm1FZGl0UmVxdWVzdFJlbW92YWwnKSA9PT0gdHJ1ZTtcblxuXHRcdFx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXHRcdFx0XHRpZiAoZWRpdHNUb1VuZG8gPT09IDEpIHtcblx0XHRcdFx0XHRpZiAoZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0LnJlbW92ZUxhc3QuY29uZmlybWF0aW9uLm1lc3NhZ2UyJywgXCJUaGlzIHdpbGwgcmVtb3ZlIHlvdXIgbGFzdCByZXF1ZXN0IGFuZCB1bmRvIHRoZSBlZGl0cyBtYWRlIHRvIHswfS4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD9cIiwgYmFzZW5hbWUoZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlWzBdLm1vZGlmaWVkVVJJKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2hhdC5yZW1vdmVMYXN0LmNvbmZpcm1hdGlvbi5tdWx0aXBsZUVkaXRzLm1lc3NhZ2UnLCBcIlRoaXMgd2lsbCByZW1vdmUgeW91ciBsYXN0IHJlcXVlc3QgYW5kIHVuZG8gZWRpdHMgbWFkZSB0byB7MH0gZmlsZXMgaW4geW91ciB3b3JraW5nIHNldC4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD9cIiwgZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlLmxlbmd0aCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2NoYXQucmVtb3ZlLmNvbmZpcm1hdGlvbi5tZXNzYWdlMicsIFwiVGhpcyB3aWxsIHJlbW92ZSBhbGwgc3Vic2VxdWVudCByZXF1ZXN0cyBhbmQgdW5kbyBlZGl0cyBtYWRlIHRvIHswfS4gRG8geW91IHdhbnQgdG8gcHJvY2VlZD9cIiwgYmFzZW5hbWUoZW50cmllc01vZGlmaWVkSW5SZXF1ZXN0c1RvUmVtb3ZlWzBdLm1vZGlmaWVkVVJJKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2hhdC5yZW1vdmUuY29uZmlybWF0aW9uLm11bHRpcGxlRWRpdHMubWVzc2FnZScsIFwiVGhpcyB3aWxsIHJlbW92ZSBhbGwgc3Vic2VxdWVudCByZXF1ZXN0cyBhbmQgdW5kbyBlZGl0cyBtYWRlIHRvIHswfSBmaWxlcyBpbiB5b3VyIHdvcmtpbmcgc2V0LiBEbyB5b3Ugd2FudCB0byBwcm9jZWVkP1wiLCBlbnRyaWVzTW9kaWZpZWRJblJlcXVlc3RzVG9SZW1vdmUubGVuZ3RoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjb25maXJtYXRpb24gPSBzaG91bGRQcm9tcHRcblx0XHRcdFx0XHQ/IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHR0aXRsZTogZWRpdHNUb1VuZG8gPT09IDFcblx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5yZW1vdmVMYXN0LmNvbmZpcm1hdGlvbi50aXRsZScsIFwiRG8geW91IHdhbnQgdG8gdW5kbyB5b3VyIGxhc3QgZWRpdD9cIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5yZW1vdmUuY29uZmlybWF0aW9uLnRpdGxlJywgXCJEbyB5b3Ugd2FudCB0byB1bmRvIHswfSBlZGl0cz9cIiwgZWRpdHNUb1VuZG8pLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbWVzc2FnZSxcblx0XHRcdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdjaGF0LnJlbW92ZS5jb25maXJtYXRpb24ucHJpbWFyeUJ1dHRvbicsIFwiWWVzXCIpLFxuXHRcdFx0XHRcdFx0Y2hlY2tib3g6IHsgbGFiZWw6IGxvY2FsaXplKCdjaGF0LnJlbW92ZS5jb25maXJtYXRpb24uY2hlY2tib3gnLCBcIkRvbid0IGFzayBhZ2FpblwiKSwgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRcdFx0XHRcdHR5cGU6ICdpbmZvJ1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0OiB7IGNvbmZpcm1lZDogdHJ1ZSB9O1xuXG5cdFx0XHRcdHR5cGUgRWRpdFVuZG9FdmVudCA9IHtcblx0XHRcdFx0XHRlZGl0UmVxdWVzdFR5cGU6IHN0cmluZztcblx0XHRcdFx0XHRvdXRjb21lOiAnY2FuY2VsbGVkJyB8ICdhcHBsaWVkJztcblx0XHRcdFx0XHRlZGl0c1VuZG9Db3VudDogbnVtYmVyO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHR5cGUgRWRpdFVuZG9FdmVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAnanVzdHNjaGVuJztcblx0XHRcdFx0XHRjb21tZW50OiAnRXZlbnQgdXNlZCB0byBnYWluIGluc2lnaHRzIGludG8gd2hlbiB0aGVyZSBhcmUgcGVuZGluZyBjaGFuZ2VzIHRvIHVuZG8sIGFuZCB3aGV0aGVyIGVkaXRlZCByZXF1ZXN0cyBhcmUgYXBwbGllZCBvciBjYW5jZWxsZWQuJztcblx0XHRcdFx0XHRlZGl0UmVxdWVzdFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdDdXJyZW50IGVudHJ5IHBvaW50IGZvciBlZGl0aW5nIGEgcmVxdWVzdC4nIH07XG5cdFx0XHRcdFx0b3V0Y29tZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGVkaXQgd2FzIGNhbmNlbGxlZCBvciBhcHBsaWVkLicgfTtcblx0XHRcdFx0XHRlZGl0c1VuZG9Db3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ051bWJlciBvZiBlZGl0cyB0aGF0IHdvdWxkIGJlIHVuZG9uZS4nOyAnaXNNZWFzdXJlbWVudCc6IHRydWUgfTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRpZiAoIWNvbmZpcm1hdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RWRpdFVuZG9FdmVudCwgRWRpdFVuZG9FdmVudENsYXNzaWZpY2F0aW9uPignY2hhdC51bmRvRWRpdHNDb25maXJtYXRpb24nLCB7XG5cdFx0XHRcdFx0XHRlZGl0UmVxdWVzdFR5cGU6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJyksXG5cdFx0XHRcdFx0XHRvdXRjb21lOiAnY2FuY2VsbGVkJyxcblx0XHRcdFx0XHRcdGVkaXRzVW5kb0NvdW50OiBlZGl0c1RvVW5kb1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmIChlZGl0c1RvVW5kbyA+IDApIHtcblx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RWRpdFVuZG9FdmVudCwgRWRpdFVuZG9FdmVudENsYXNzaWZpY2F0aW9uPignY2hhdC51bmRvRWRpdHNDb25maXJtYXRpb24nLCB7XG5cdFx0XHRcdFx0XHRlZGl0UmVxdWVzdFR5cGU6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJyksXG5cdFx0XHRcdFx0XHRvdXRjb21lOiAnYXBwbGllZCcsXG5cdFx0XHRcdFx0XHRlZGl0c1VuZG9Db3VudDogZWRpdHNUb1VuZG9cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChjb25maXJtYXRpb24uY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2NoYXQuZWRpdGluZy5jb25maXJtRWRpdFJlcXVlc3RSZW1vdmFsJywgZmFsc2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVzdG9yZSB0aGUgc25hcHNob3QgdG8gd2hhdCBpdCB3YXMgYmVmb3JlIHRoZSByZXF1ZXN0KHMpIHRoYXQgd2UgZGVsZXRlZFxuXHRcdFx0XHRjb25zdCBzbmFwc2hvdFJlcXVlc3RJZCA9IGNoYXRSZXF1ZXN0c1tpdGVtSW5kZXhdLmlkO1xuXHRcdFx0XHRhd2FpdCBzZXNzaW9uLnJlc3RvcmVTbmFwc2hvdChzbmFwc2hvdFJlcXVlc3RJZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHdpZGdldD8udmlld01vZGVsPy5tb2RlbC5jaGVja3BvaW50KSB7XG5cdFx0XHR3aWRnZXQudmlld01vZGVsLm1vZGVsLnNldENoZWNrcG9pbnQodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0d2lkZ2V0Py5hY2NlcHRJbnB1dChjb250ZXh0Py5pbnB1dFZhbHVlLCBjb250ZXh0Py5hY2NlcHRJbnB1dE9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVEZWxlZ2F0aW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB3aWRnZXQ6IElDaGF0V2lkZ2V0LCBkZWxlZ2F0aW9uVGFyZ2V0OiBFeGNsdWRlPEFnZW50U2Vzc2lvblRhcmdldCwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Ly8gRmluZCB0aGUgY29udHJpYnV0aW9uIGZvciB0aGUgZGVsZWdhdGlvbiB0YXJnZXRcblx0XHRjb25zdCBjb250cmlidXRpb25zID0gY2hhdFNlc3Npb25zU2VydmljZS5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKTtcblx0XHRjb25zdCB0YXJnZXRDb250cmlidXRpb24gPSBjb250cmlidXRpb25zLmZpbmQoY29udHJpYiA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlclR5cGUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihjb250cmliLnR5cGUpO1xuXHRcdFx0cmV0dXJuIHByb3ZpZGVyVHlwZSA9PT0gZGVsZWdhdGlvblRhcmdldCB8fCBjb250cmliLnR5cGUgPT09IGRlbGVnYXRpb25UYXJnZXQ7XG5cdFx0fSk7XG5cblx0XHRpZiAoIXRhcmdldENvbnRyaWJ1dGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBjb250cmlidXRpb24gZm91bmQgZm9yIGRlbGVnYXRpb24gdGFyZ2V0OiAke2RlbGVnYXRpb25UYXJnZXR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldENvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZSA9PT0gZmFsc2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGhlIGNvbnRyaWJ1dGlvbiBmb3IgZGVsZWdhdGlvbiB0YXJnZXQ6ICR7ZGVsZWdhdGlvblRhcmdldH0gZG9lcyBub3Qgc3VwcG9ydCBkZWxlZ2F0aW9uLmApO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgQ3JlYXRlUmVtb3RlQWdlbnRKb2JBY3Rpb24oKS5ydW4oYWNjZXNzb3IsIHRhcmdldENvbnRyaWJ1dGlvbiwgd2lkZ2V0KTtcblx0fVxufVxuXG5jb25zdCB3aGVuTm9BY3RpdmVSZXF1ZXN0ID0gQ2hhdENvbnRleHRLZXlzLmhhc0FjdGl2ZVJlcXVlc3QubmVnYXRlKCk7XG5jb25zdCB3aGVuTm90SW5Qcm9ncmVzcyA9IENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0SW5Qcm9ncmVzcy5uZWdhdGUoKTtcblxuZXhwb3J0IGNsYXNzIENoYXRTdWJtaXRBY3Rpb24gZXh0ZW5kcyBTdWJtaXRBY3Rpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnN1Ym1pdCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgbWVudUNvbmRpdGlvbiA9IENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuaXNFcXVhbFRvKENoYXRNb2RlS2luZC5Bc2spO1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc1NlbmRhYmxlQ29udGVudCxcblx0XHRcdENvbnRleHRLZXlFeHByLm9yKHdoZW5Ob3RJblByb2dyZXNzLCBDaGF0Q29udGV4dEtleXMuZWRpdGluZ1JlcXVlc3RUeXBlLmlzRXF1YWxUbyhDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlNlbnQpKSxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbk9wdGlvbnNWYWxpZCxcblx0XHQpO1xuXG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYXRTdWJtaXRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5zdWJtaXQubGFiZWwnLCBcIlNlbmRcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dVcENvbXBhY3QsXG5cdFx0XHRwcmVjb25kaXRpb24sXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQsXG5cdFx0XHRcdGljb246IENvZGljb24uYXJyb3dVcENvbXBhY3QsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzZW5kVG9BZ2VudCcsIFwiU2VuZCB0byBBZ2VudFwiKSxcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLndpdGhpbkVkaXRTZXNzaW9uRGlmZi5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdHdoZW5Ob0FjdGl2ZVJlcXVlc3QsXG5cdFx0XHRcdFx0XHRtZW51Q29uZGl0aW9uLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLndpdGhpbkVkaXRTZXNzaW9uRGlmZi5uZWdhdGUoKSxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0YWx0OiB7XG5cdFx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zZW5kVG9OZXdDaGF0Jyxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQubmV3Q2hhdC5sYWJlbCcsIFwiU2VuZCB0byBOZXcgQ2hhdFwiKSxcblx0XHRcdFx0XHRcdGljb246IENvZGljb24ucGx1c1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZUV4ZWN1dGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihjdHhIYXNFZGl0b3JNb2RpZmljYXRpb24ubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc1RleHQpLFxuXHRcdFx0XHRcdFx0d2hlbk5vQWN0aXZlUmVxdWVzdCxcblx0XHRcdFx0XHRcdG1lbnVDb25kaXRpb25cblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59XG5cblxuZXhwb3J0IGNvbnN0IFRvZ2dsZUFnZW50TW9kZUFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50b2dnbGVBZ2VudE1vZGUnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUb2dnbGVDaGF0TW9kZUFyZ3Mge1xuXHRtb2RlSWQ6IENoYXRNb2RlS2luZCB8IHN0cmluZztcblx0c2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG59XG5cbnR5cGUgQ2hhdE1vZGVDaGFuZ2VDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdkaWdpdGFyYWxkJztcblx0Y29tbWVudDogJ1JlcG9ydGluZyB3aGVuIGFnZW50IGlzIHN3aXRjaGVkIGJldHdlZW4gZGlmZmVyZW50IG1vZGVzJztcblx0ZnJvbU1vZGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHByZXZpb3VzIGFnZW50IG5hbWUnIH07XG5cdG1vZGU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG5ldyBhZ2VudCBuYW1lJyB9O1xuXHRyZXF1ZXN0Q291bnQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTnVtYmVyIG9mIHJlcXVlc3RzIGluIHRoZSBjdXJyZW50IGNoYXQgc2Vzc2lvbic7ICdpc01lYXN1cmVtZW50JzogdHJ1ZSB9O1xuXHRzdG9yYWdlPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1NvdXJjZSBvZiB0aGUgdGFyZ2V0IG1vZGUgKGJ1aWx0aW4sIGxvY2FsLCB1c2VyLCBleHRlbnNpb24pJyB9O1xuXHRleHRlbnNpb25JZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdFeHRlbnNpb24gSUQgaWYgdGhlIHRhcmdldCBtb2RlIGlzIGZyb20gYW4gZXh0ZW5zaW9uJyB9O1xuXHR0b29sc0NvdW50PzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ051bWJlciBvZiBjdXN0b20gdG9vbHMgaW4gdGhlIHRhcmdldCBtb2RlJzsgJ2lzTWVhc3VyZW1lbnQnOiB0cnVlIH07XG5cdGhhbmRvZmZzQ291bnQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTnVtYmVyIG9mIGhhbmRvZmZzIGluIHRoZSB0YXJnZXQgbW9kZSc7ICdpc01lYXN1cmVtZW50JzogdHJ1ZSB9O1xuXHRpc0NsYXVkZUFnZW50PzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHRhcmdldCBtb2RlIGlzIGEgQ2xhdWRlIGFnZW50IGZpbGUgZnJvbSAuY2xhdWRlL2FnZW50cy8nIH07XG59O1xuXG50eXBlIENoYXRNb2RlQ2hhbmdlRXZlbnQgPSB7XG5cdGZyb21Nb2RlOiBzdHJpbmc7XG5cdG1vZGU6IHN0cmluZztcblx0cmVxdWVzdENvdW50OiBudW1iZXI7XG5cdHN0b3JhZ2U/OiBzdHJpbmc7XG5cdGV4dGVuc2lvbklkPzogc3RyaW5nO1xuXHR0b29sc0NvdW50PzogbnVtYmVyO1xuXHRoYW5kb2Zmc0NvdW50PzogbnVtYmVyO1xuXHRpc0NsYXVkZUFnZW50PzogYm9vbGVhbjtcbn07XG5cbmNsYXNzIFRvZ2dsZUNoYXRNb2RlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gVG9nZ2xlQWdlbnRNb2RlQWN0aW9uSWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRvZ2dsZUNoYXRNb2RlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUudG9nZ2xlQWdlbnQubGFiZWwnLCBcIlN3aXRjaCB0byBOZXh0IEFnZW50XCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlcXVlc3RJblByb2dyZXNzLm5lZ2F0ZSgpKVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cblx0XHRjb25zdCBhcmcgPSBhcmdzLmF0KDApIGFzIElUb2dnbGVDaGF0TW9kZUFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHdpZGdldDogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFyZz8uc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShhcmcuc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0d2lkZ2V0ID0gZ2V0RWRpdGluZ1Nlc3Npb25Db250ZXh0KGFjY2Vzc29yLCBhcmdzKT8uY2hhdFdpZGdldDtcblx0XHR9XG5cblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRTZXNzaW9uID0gd2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWw7XG5cdFx0Y29uc3QgcmVxdWVzdENvdW50ID0gY2hhdFNlc3Npb24/LmdldFJlcXVlc3RzKCkubGVuZ3RoID8/IDA7XG5cdFx0Y29uc3QgbW9kZXMgPSB3aWRnZXQuaW5wdXQuY3VycmVudENoYXRNb2Rlc09icy5nZXQoKTtcblx0XHRjb25zdCBzd2l0Y2hUb01vZGUgPSAoYXJnICYmIChtb2Rlcy5maW5kTW9kZUJ5SWQoYXJnLm1vZGVJZCkgfHwgbW9kZXMuZmluZE1vZGVCeU5hbWUoYXJnLm1vZGVJZCkpKSA/PyB0aGlzLmdldE5leHRNb2RlKHdpZGdldCwgcmVxdWVzdENvdW50LCBtb2Rlcyk7XG5cblx0XHRjb25zdCBjdXJyZW50TW9kZSA9IHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKTtcblx0XHRpZiAoc3dpdGNoVG9Nb2RlLmlkID09PSBjdXJyZW50TW9kZS5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRNb2RlQ2hlY2sgPSBhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oaGFuZGxlTW9kZVN3aXRjaCwgd2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCwgc3dpdGNoVG9Nb2RlLmtpbmQsIHJlcXVlc3RDb3VudCwgd2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWwpO1xuXHRcdGlmICghY2hhdE1vZGVDaGVjaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNlbmQgdGVsZW1ldHJ5IGZvciBtb2RlIGNoYW5nZVxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBzd2l0Y2hUb01vZGUuc291cmNlPy5zdG9yYWdlID8/ICdidWlsdGluJztcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IHN3aXRjaFRvTW9kZS5zb3VyY2U/LnN0b3JhZ2UgPT09ICdleHRlbnNpb24nID8gc3dpdGNoVG9Nb2RlLnNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0b29sc0NvdW50ID0gc3dpdGNoVG9Nb2RlLmN1c3RvbVRvb2xzPy5nZXQoKT8ubGVuZ3RoID8/IDA7XG5cdFx0Y29uc3QgaGFuZG9mZnNDb3VudCA9IHN3aXRjaFRvTW9kZS5oYW5kT2Zmcz8uZ2V0KCk/Lmxlbmd0aCA/PyAwO1xuXG5cdFx0Y29uc3QgbW9kZVVyaSA9IHN3aXRjaFRvTW9kZS51cmk/LmdldCgpO1xuXHRcdGNvbnN0IGlzQ2xhdWRlQWdlbnQgPSBtb2RlVXJpID8gaXNJbkNsYXVkZUFnZW50c0ZvbGRlcihtb2RlVXJpKSA6IHVuZGVmaW5lZDtcblxuXHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0TW9kZUNoYW5nZUV2ZW50LCBDaGF0TW9kZUNoYW5nZUNsYXNzaWZpY2F0aW9uPignY2hhdC5tb2RlQ2hhbmdlJywge1xuXHRcdFx0ZnJvbU1vZGU6IGdldE1vZGVOYW1lRm9yVGVsZW1ldHJ5KGN1cnJlbnRNb2RlKSxcblx0XHRcdG1vZGU6IGdldE1vZGVOYW1lRm9yVGVsZW1ldHJ5KHN3aXRjaFRvTW9kZSksXG5cdFx0XHRyZXF1ZXN0Q291bnQ6IHJlcXVlc3RDb3VudCxcblx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRleHRlbnNpb25JZCxcblx0XHRcdHRvb2xzQ291bnQsXG5cdFx0XHRoYW5kb2Zmc0NvdW50LFxuXHRcdFx0aXNDbGF1ZGVBZ2VudFxuXHRcdH0pO1xuXG5cdFx0d2lkZ2V0LmlucHV0LnNldENoYXRNb2RlKHN3aXRjaFRvTW9kZS5pZCwgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRpZiAoY2hhdE1vZGVDaGVjay5uZWVkVG9DbGVhclNlc3Npb24pIHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFDVElPTl9JRF9ORVdfQ0hBVCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXROZXh0TW9kZShjaGF0V2lkZ2V0OiBJQ2hhdFdpZGdldCwgcmVxdWVzdENvdW50OiBudW1iZXIsIG1vZGVzOiBJQ2hhdE1vZGVzKTogSUNoYXRNb2RlIHtcblx0XHRjb25zdCBmbGF0ID0gW1xuXHRcdFx0Li4ubW9kZXMuYnVpbHRpbi5maWx0ZXIobW9kZSA9PiB7XG5cdFx0XHRcdHJldHVybiBtb2RlLmtpbmQgIT09IENoYXRNb2RlS2luZC5FZGl0IHx8IHJlcXVlc3RDb3VudCA9PT0gMDtcblx0XHRcdH0pLFxuXHRcdFx0Li4uKG1vZGVzLmN1c3RvbSA/PyBbXSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGN1ck1vZGVJbmRleCA9IGZsYXQuZmluZEluZGV4KG1vZGUgPT4gbW9kZS5pZCA9PT0gY2hhdFdpZGdldC5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKS5pZCk7XG5cdFx0Y29uc3QgbmV3TW9kZSA9IGZsYXRbKGN1ck1vZGVJbmRleCArIDEpICUgZmxhdC5sZW5ndGhdO1xuXHRcdHJldHVybiBuZXdNb2RlO1xuXHR9XG59XG5cbmNsYXNzIFN3aXRjaFRvTmV4dE1vZGVsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3dpdGNoVG9OZXh0TW9kZWwnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTd2l0Y2hUb05leHRNb2RlbEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLnN3aXRjaFRvTmV4dE1vZGVsLmxhYmVsJywgXCJTd2l0Y2ggdG8gTmV4dCBNb2RlbFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHR3aWRnZXQ/LmlucHV0LnN3aXRjaFRvTmV4dE1vZGVsKCk7XG5cdH1cbn1cblxuY2xhc3MgU3dpdGNoVG9OZXh0UGlubmVkTW9kZWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zd2l0Y2hUb05leHRQaW5uZWRNb2RlbCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFN3aXRjaFRvTmV4dFBpbm5lZE1vZGVsQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuc3dpdGNoVG9OZXh0UGlubmVkTW9kZWwubGFiZWwnLCBcIlN3aXRjaCB0byBOZXh0IFBpbm5lZCBNb2RlbFwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHR3aWRnZXQ/LmlucHV0LnN3aXRjaFRvTmV4dFBpbm5lZE1vZGVsKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Nb2RlbFBpY2tlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Nb2RlbFBpY2tlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5Nb2RlbFBpY2tlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLm9wZW5Nb2RlbFBpY2tlci5sYWJlbCcsIFwiT3BlbiBNb2RlbCBQaWNrZXJcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5QZXJpb2QsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXRcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dCxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46XG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Ly8gSGlkZSB0aGUgbW9kZWwgcGlja2VyIHdoaWxlIGEgZGVsZWdhdGlvbiAoY29udGludWUgaW4pIHRhcmdldCBpcyBwZW5kaW5nXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbkhhc1RhcmdldGVkTW9kZWxzKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoQ2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmtleSwgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhDaGF0Q29udGV4dEtleXMubG9jYXRpb24ua2V5LCBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoQ2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmtleSwgQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2spLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoQ2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmtleSwgQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwpKSxcblx0XHRcdFx0XHRcdC8vIEhpZGUgaW4gd2VsY29tZSB2aWV3IHdoZW4gc2Vzc2lvbiB0eXBlIGlzIG5vdCBsb2NhbFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkFnZW50U2Vzc2lvbnNXZWxjb21lLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25IYXNUYXJnZXRlZE1vZGVscyxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUuaXNFcXVhbFRvKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCkpXG5cdFx0XHRcdFx0KVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRhd2FpdCB3aWRnZXRTZXJ2aWNlLnJldmVhbCh3aWRnZXQpO1xuXHRcdFx0d2lkZ2V0LmlucHV0Lm9wZW5Nb2RlbFBpY2tlcigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlblBlcm1pc3Npb25QaWNrZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuUGVybWlzc2lvblBpY2tlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5QZXJtaXNzaW9uUGlja2VyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUub3BlblBlcm1pc3Npb25QaWNrZXIubGFiZWwnLCBcIk9wZW4gUGVybWlzc2lvbiBQaWNrZXJcIiksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc2V0UGVybWlzc2lvbkxldmVsJywgXCJTZXQgUGVybWlzc2lvbnNcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0U2Vjb25kYXJ5LFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjpcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLm5vdEVxdWFsc1RvKENoYXRNb2RlS2luZC5Bc2spLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NrZWRUb0NvZGluZ0FnZW50Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkQ29kaW5nQWdlbnRJZC5pc0VxdWFsVG8oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQpLFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkQ29kaW5nQWdlbnRJZC5pc0VxdWFsVG8oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsYXVkZSksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHdpZGdldC5pbnB1dC5vcGVuUGVybWlzc2lvblBpY2tlcigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3Blbk1vZGVQaWNrZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZVBpY2tlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5Nb2RlUGlja2VyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUub3Blbk1vZGVQaWNrZXIubGFiZWwnLCBcIk9wZW4gQWdlbnQgUGlja2VyXCIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3NldENoYXRNb2RlJywgXCJTZXQgQWdlbnRcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QZXJpb2QsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXQsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Ly8gSGlkZSB0aGUgYWdlbnQgcGlja2VyIHdoaWxlIGEgZGVsZWdhdGlvbiAoY29udGludWUgaW4pIHRhcmdldCBpcyBwZW5kaW5nXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbkhhc0N1c3RvbUFnZW50VGFyZ2V0KSxcblx0XHRcdFx0XHRcdC8vIFNob3cgaW4gd2VsY29tZSB2aWV3IGZvciBsb2NhbCBzZXNzaW9ucyBvciBzZXNzaW9ucyB3aXRoIGN1c3RvbSBhZ2VudCB0YXJnZXRcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5BZ2VudFNlc3Npb25zV2VsY29tZS5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSGFzQ3VzdG9tQWdlbnRUYXJnZXQsXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25UeXBlLmlzRXF1YWxUbyhBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwpKSksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0d2lkZ2V0LmlucHV0Lm9wZW5Nb2RlUGlja2VyKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuU2Vzc2lvblRhcmdldFBpY2tlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogT3BlblNlc3Npb25UYXJnZXRQaWNrZXJBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5vcGVuU2Vzc2lvblRhcmdldFBpY2tlci5sYWJlbCcsIFwiT3BlbiBTZXNzaW9uIFRhcmdldCBQaWNrZXJcIiksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnc2V0U2Vzc2lvblRhcmdldCcsIFwiU2V0IFNlc3Npb24gVGFyZ2V0XCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgQ29udGV4dEtleUV4cHIub3IoQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSXNFbXB0eSwgQ2hhdENvbnRleHRLZXlzLmluQWdlbnRTZXNzaW9uc1dlbGNvbWUpLCBDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZ0lucHV0Lm5lZ2F0ZSgpLCBDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5uZWdhdGUoKSksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dCxcblx0XHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25Jc0VtcHR5LFxuXHRcdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbklzRW1wdHkpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHdpZGdldC5pbnB1dC5vcGVuU2Vzc2lvblRhcmdldFBpY2tlcigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlbkRlbGVnYXRpb25QaWNrZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuRGVsZWdhdGlvblBpY2tlcic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5EZWxlZ2F0aW9uUGlja2VyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUub3BlbkRlbGVnYXRpb25QaWNrZXIubGFiZWwnLCBcIk9wZW4gRGVsZWdhdGlvbiBQaWNrZXJcIiksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZGVsZWdhdGVTZXNzaW9uJywgXCJEZWxlZ2F0ZSBTZXNzaW9uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSXNFbXB0eS5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLmN1cnJlbnRseUVkaXRpbmdJbnB1dC5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLmN1cnJlbnRseUVkaXRpbmcubmVnYXRlKCkpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdFx0b3JkZXI6IDAuNSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5pc0VxdWFsVG8oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25TdXBwb3J0c0RlbGVnYXRpb24sXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25Jc0VtcHR5Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHdpZGdldC5pbnB1dC5vcGVuRGVsZWdhdGlvblBpY2tlcigpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3BlbldvcmtzcGFjZVBpY2tlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Xb3Jrc3BhY2VQaWNrZXInO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuV29ya3NwYWNlUGlja2VyQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUub3BlbldvcmtzcGFjZVBpY2tlci5sYWJlbCcsIFwiT3BlbiBXb3Jrc3BhY2UgUGlja2VyXCIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3NlbGVjdFdvcmtzcGFjZScsIFwiU2VsZWN0IFRhcmdldCBXb3Jrc3BhY2VcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDaGF0Q29udGV4dEtleXMuaW5BZ2VudFNlc3Npb25zV2VsY29tZSksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeSxcblx0XHRcdFx0XHRvcmRlcjogMC42LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkFnZW50U2Vzc2lvbnNXZWxjb21lLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5pc0VxdWFsVG8obG9jYWxDaGF0U2Vzc2lvblR5cGUpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBUaGUgcGlja2VyIGlzIG9wZW5lZCB2aWEgdGhlIGFjdGlvbiB2aWV3IGl0ZW1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFNlc3Npb25QcmltYXJ5UGlja2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY2hhdFNlc3Npb25QcmltYXJ5UGlja2VyJztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYXRTZXNzaW9uUHJpbWFyeVBpY2tlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLm9wZW5DaGF0U2Vzc2lvblByaW1hcnlQaWNrZXIubGFiZWwnLCBcIk9wZW4gUHJpbWFyeSBTZXNzaW9uIFBpY2tlclwiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIENsb3VkIHNlc3Npb25zOiBrZWVwIG9uIHRoZSBwcmltYXJ5IGNoYXQgaW5wdXQgdG9vbGJhclxuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdElucHV0LFxuXHRcdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjpcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSGFzTW9kZWxzLFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmlzRXF1YWxUbyhBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudCxcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5BZ2VudFNlc3Npb25zV2VsY29tZSxcblx0XHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUubm90RXF1YWxzVG8oJ2xvY2FsJylcblx0XHRcdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdC8vIEFsbCBvdGhlciBjb2RpbmcgYWdlbnRzIChDbGF1ZGUsIGV0Yy4pOiBzaG93IGluIHRoZSBzZWNvbmRhcnkgdG9vbGJhci5cblx0XHRcdFx0XHQvLyBJbiB0aGUgQWdlbnRzIHdpbmRvdyBvbmx5LCBoaWRlIHRoZSB3b3JrdHJlZS9icmFuY2ggcGlja2VycyBmb3IgQ29waWxvdFxuXHRcdFx0XHRcdC8vIENMSSBzZXNzaW9ucyBiZWNhdXNlIHRoZWlyIG9wdGlvbiBncm91cHMgYXJlIHN1cmZhY2VkIHRocm91Z2ggdGhlIENMSVxuXHRcdFx0XHRcdC8vIHNlc3Npb24gVUkgdGhlcmUuIFRoZXkgcmVtYWluIHZpc2libGUgaW4gdGhlIHJlZ3VsYXIgVlMgQ29kZSB3b3JrYmVuY2guXG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksXG5cdFx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHR3aGVuOlxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25IYXNNb2RlbHMsXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUubm90RXF1YWxzVG8oQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkKSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uVHlwZS5ub3RFcXVhbHNUbyhBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZClcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQsXG5cdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQWdlbnRTZXNzaW9uc1dlbGNvbWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLm5vdEVxdWFsc1RvKCdsb2NhbCcpXG5cdFx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHdpZGdldC5pbnB1dC5vcGVuQ2hhdFNlc3Npb25QaWNrZXIoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IENoYW5nZUNoYXRNb2RlbEFjdGlvbklkID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jaGFuZ2VNb2RlbCc7XG5jbGFzcyBDaGFuZ2VDaGF0TW9kZWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQ2hhbmdlQ2hhdE1vZGVsQWN0aW9uSWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENoYW5nZUNoYXRNb2RlbEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmNoYW5nZU1vZGVsLmxhYmVsJywgXCJDaGFuZ2UgTW9kZWxcIiksXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsSW5mbyA9IGFyZ3NbMF0gYXMgUGljazxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgJ3ZlbmRvcicgfCAnaWQnIHwgJ2ZhbWlseSc+O1xuXHRcdC8vIFR5cGUgY2hlY2sgdGhlIGFyZ1xuXHRcdGFzc2VydFR5cGUodHlwZW9mIG1vZGVsSW5mby52ZW5kb3IgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBtb2RlbEluZm8uaWQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiBtb2RlbEluZm8uZmFtaWx5ID09PSAnc3RyaW5nJyk7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldHMgPSB3aWRnZXRTZXJ2aWNlLmdldEFsbFdpZGdldHMoKTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB3aWRnZXRzKSB7XG5cdFx0XHR3aWRnZXQuaW5wdXQuc3dpdGNoTW9kZWwobW9kZWxJbmZvKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nU2Vzc2lvblN1Ym1pdEFjdGlvbiBleHRlbmRzIFN1Ym1pdEFjdGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRzLnN1Ym1pdCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3Qgbm90SW5Qcm9ncmVzc09yRWRpdGluZyA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLm9yKHdoZW5Ob0FjdGl2ZVJlcXVlc3QsIENoYXRDb250ZXh0S2V5cy5lZGl0aW5nUmVxdWVzdFR5cGUuaXNFcXVhbFRvKENoYXRDb250ZXh0S2V5cy5FZGl0aW5nUmVxdWVzdFR5cGUuU2VudCkpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmVkaXRpbmdSZXF1ZXN0VHlwZS5ub3RFcXVhbHNUbyhDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlF1ZXVlKSxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5lZGl0aW5nUmVxdWVzdFR5cGUubm90RXF1YWxzVG8oQ2hhdENvbnRleHRLZXlzLkVkaXRpbmdSZXF1ZXN0VHlwZS5TdGVlcilcblx0XHQpO1xuXG5cdFx0Y29uc3QgbWVudUNvbmRpdGlvbiA9IENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQubm90RXF1YWxzVG8oQ2hhdE1vZGVLaW5kLkFzayk7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmlucHV0SGFzU2VuZGFibGVDb250ZW50LFxuXHRcdFx0bm90SW5Qcm9ncmVzc09yRWRpdGluZyxcblx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbk9wdGlvbnNWYWxpZFxuXHRcdCk7XG5cblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2hhdEVkaXRpbmdTZXNzaW9uU3VibWl0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZWRpdHMuc3VibWl0LmxhYmVsJywgXCJTZW5kXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93VXBDb21wYWN0LFxuXHRcdFx0cHJlY29uZGl0aW9uLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0RXhlY3V0ZSxcblx0XHRcdFx0XHRvcmRlcjogNCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRub3RJblByb2dyZXNzT3JFZGl0aW5nLFxuXHRcdFx0XHRcdFx0bWVudUNvbmRpdGlvbiksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRhbHQ6IHtcblx0XHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnNlbmRUb05ld0NoYXQnLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5uZXdDaGF0LmxhYmVsJywgXCJTZW5kIHRvIE5ldyBDaGF0XCIpLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5wbHVzXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFN1Ym1pdFdpdGhvdXREaXNwYXRjaGluZ0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnN1Ym1pdFdpdGhvdXREaXNwYXRjaGluZyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmlucHV0SGFzVGV4dCxcblx0XHRcdHdoZW5Ob3RJblByb2dyZXNzLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFzayksXG5cdFx0KTtcblxuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTdWJtaXRXaXRob3V0RGlzcGF0Y2hpbmdBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5zdWJtaXRXaXRob3V0RGlzcGF0Y2gubGFiZWwnLCBcIlNlbmRcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbixcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGFyZ3NbMF0gYXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBjb250ZXh0Py53aWRnZXQgPz8gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHR3aWRnZXQ/LmFjY2VwdElucHV0KGNvbnRleHQ/LmlucHV0VmFsdWUsIHsgbm9Db21tYW5kRGV0ZWN0aW9uOiB0cnVlIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0U3VibWl0V2l0aENvZGViYXNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3VibWl0V2l0aENvZGViYXNlJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBwcmVjb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuaW5wdXRIYXNUZXh0LFxuXHRcdFx0d2hlbk5vdEluUHJvZ3Jlc3MsXG5cdFx0KTtcblxuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDaGF0U3VibWl0V2l0aENvZGViYXNlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWN0aW9ucy5jaGF0LnN1Ym1pdFdpdGhDb2RlYmFzZScsIFwiU2VuZCB3aXRoIHswfVwiLCBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9Y29kZWJhc2VgKSxcblx0XHRcdHByZWNvbmRpdGlvbixcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0LFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXSBhcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNvbnRleHQ/LndpZGdldCA/PyB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk7XG5cdFx0Y29uc3QgY29kZWJhc2VUb29sID0gbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRUb29sQnlOYW1lKCdjb2RlYmFzZScpO1xuXHRcdGlmICghY29kZWJhc2VUb29sKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0d2lkZ2V0LmlucHV0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KHtcblx0XHRcdGlkOiBjb2RlYmFzZVRvb2wuaWQsXG5cdFx0XHRuYW1lOiBjb2RlYmFzZVRvb2wuZGlzcGxheU5hbWUgPz8gJycsXG5cdFx0XHRmdWxsTmFtZTogY29kZWJhc2VUb29sLmRpc3BsYXlOYW1lID8/ICcnLFxuXHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdGljb246IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihjb2RlYmFzZVRvb2wuaWNvbikgPyBjb2RlYmFzZVRvb2wuaWNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdGtpbmQ6ICd0b29sJ1xuXHRcdH0pO1xuXHRcdHdpZGdldC5hY2NlcHRJbnB1dCgpO1xuXHR9XG59XG5cbmNsYXNzIFNlbmRUb05ld0NoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgcHJlY29uZGl0aW9uID0gQ2hhdENvbnRleHRLZXlzLmlucHV0SGFzVGV4dDtcblxuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnNlbmRUb05ld0NoYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5uZXdDaGF0LmxhYmVsJywgXCJTZW5kIHRvIE5ldyBDaGF0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dCxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGFyZ3NbMF0gYXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY29udGV4dD8ud2lkZ2V0ID8/IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dEJlZm9yZUNsZWFyID0gd2lkZ2V0LmdldElucHV0KCk7XG5cblx0XHQvLyBDYW5jZWwgYW55IGluLXByb2dyZXNzIHJlcXVlc3QgYmVmb3JlIGNsZWFyaW5nXG5cdFx0aWYgKHdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdGF3YWl0IGNoYXRTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbih3aWRnZXQudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ25ld1Nlc3Npb25BY3Rpb24nKTtcblx0XHR9XG5cblx0XHRpZiAod2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWwpIHtcblx0XHRcdGlmICghKGF3YWl0IGhhbmRsZUN1cnJlbnRFZGl0aW5nU2Vzc2lvbih3aWRnZXQudmlld01vZGVsLm1vZGVsLCB1bmRlZmluZWQsIGRpYWxvZ1NlcnZpY2UpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgdGhlIGlucHV0IGZyb20gdGhlIGN1cnJlbnQgc2Vzc2lvbiBiZWZvcmUgY3JlYXRpbmcgYSBuZXcgb25lXG5cdFx0d2lkZ2V0LnNldElucHV0KCcnKTtcblxuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNsZWFyQ2hhdFNlc3Npb25QcmVzZXJ2aW5nVHlwZSwgd2lkZ2V0LCB1bmRlZmluZWQpO1xuXG5cdFx0d2lkZ2V0LmFjY2VwdElucHV0KGlucHV0QmVmb3JlQ2xlYXIsIHsgc3RvcmVUb0hpc3Rvcnk6IHRydWUgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IENhbmNlbENoYXRBY3Rpb25JZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY2FuY2VsJztcbmV4cG9ydCBjbGFzcyBDYW5jZWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQ2FuY2VsQ2hhdEFjdGlvbklkO1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2FuY2VsQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuY2FuY2VsLmxhYmVsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdGljb246IENvZGljb24uc3RvcENpcmNsZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEV4ZWN1dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaGFzQWN0aXZlUmVxdWVzdCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMucmVtb3RlSm9iQ3JlYXRpbmcubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmN1cnJlbnRseUVkaXRpbmcubmVnYXRlKCksXG5cdFx0XHRcdCksXG5cdFx0XHRcdG9yZGVyOiA0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRFZGl0b3JJbmxpbmVFeGVjdXRlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Y3R4SXNHbG9iYWxFZGl0aW5nU2Vzc2lvbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRjdHhIYXNSZXF1ZXN0SW5Qcm9ncmVzcyxcblx0XHRcdFx0KSxcblx0XHRcdFx0b3JkZXI6IDQsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5oYXNBY3RpdmVSZXF1ZXN0LFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5yZW1vdGVKb2JDcmVhdGluZy5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuQmFja3NwYWNlIH0sXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhcmdzWzBdIGFzIElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNvbnRleHQ/LndpZGdldCA/PyB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wRXZlbnQsIENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcENsYXNzaWZpY2F0aW9uPihDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BFdmVudE5hbWUsIHtcblx0XHRcdFx0c291cmNlOiAnY2FuY2VsQWN0aW9uJyxcblx0XHRcdFx0cmVhc29uOiAnbm9XaWRnZXQnLFxuXHRcdFx0XHRyZXF1ZXN0SW5Qcm9ncmVzczogJ3Vua25vd24nLFxuXHRcdFx0XHRwZW5kaW5nUmVxdWVzdHM6IDAsXG5cdFx0XHR9KTtcblx0XHRcdGxvZ1NlcnZpY2UuaW5mbygnQ2hhdENhbmNlbEFjdGlvbiNydW46IE5vIGZvY3VzZWQgY2hhdCB3aWRnZXQgd2FzIGZvdW5kJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRpZiAod2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0YXdhaXQgY2hhdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHdpZGdldC52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCAnY2FuY2VsQWN0aW9uJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BFdmVudCwgQ2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wQ2xhc3NpZmljYXRpb24+KENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcEV2ZW50TmFtZSwge1xuXHRcdFx0XHRzb3VyY2U6ICdjYW5jZWxBY3Rpb24nLFxuXHRcdFx0XHRyZWFzb246ICdub1ZpZXdNb2RlbCcsXG5cdFx0XHRcdHJlcXVlc3RJblByb2dyZXNzOiAndW5rbm93bicsXG5cdFx0XHRcdHBlbmRpbmdSZXF1ZXN0czogMCxcblx0XHRcdH0pO1xuXHRcdFx0bG9nU2VydmljZS5pbmZvKCdDaGF0Q2FuY2VsQWN0aW9uI3J1bjogQ2FuY2VsZWQgY2hhdCB3aWRnZXQgaGFzIG5vIHZpZXcgbW9kZWwnKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IENhbmNlbENoYXRFZGl0SWQgPSAnd29ya2JlbmNoLmVkaXQuY2hhdC5jYW5jZWwnO1xuZXhwb3J0IGNsYXNzIENhbmNlbEVkaXQgZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQ2FuY2VsQ2hhdEVkaXRJZDtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENhbmNlbEVkaXQuSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5jYW5jZWxFZGl0LmxhYmVsJywgXCJDYW5jZWwgRWRpdFwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi54LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0TWVzc2FnZVRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pc1JlcXVlc3QsIENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkVkaXRSZXF1ZXN0c31gLCAnaW5wdXQnKSlcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQsXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaG92ZXJWaXNpYmxlLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc011bHRpcGxlU2VsZWN0aW9ucy50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZywgQ2hhdENvbnRleHRLZXlzLmN1cnJlbnRseUVkaXRpbmdJbnB1dCkpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiAtIDVcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29udGV4dCA9IGFyZ3NbMF0gYXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBjb250ZXh0Py53aWRnZXQgPz8gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR3aWRnZXQuZmluaXNoZWRFZGl0aW5nKCk7XG5cdH1cbn1cblxuLy8gLS0tIEhhbmRvZmYgRGlzY292ZXJ5ICYgRXhlY3V0aW9uIENvbW1hbmRzIC0tLVxuXG5leHBvcnQgY29uc3QgR2V0SGFuZG9mZnNBY3Rpb25JZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZ2V0SGFuZG9mZnMnO1xuXG5pbnRlcmZhY2UgSUdldEhhbmRvZmZzQXJncyB7XG5cdC8qKlxuXHQgKiBOYW1lIG9mIHRoZSBjdXN0b20gYWdlbnQgKGRlZmluZWQgaW4gYW4gYC5hZ2VudC5tZGAgZmlsZSkgd2hvc2UgaGFuZG9mZnNcblx0ICogeW91IHdhbnQgdG8gcmV0cmlldmUuIElmIG9taXR0ZWQsIGFsbFxuXHQgKiBoYW5kb2ZmcyBmcm9tIGFsbCBhZ2VudHMgYW5kIGJ1aWx0LWluIG1vZGVzIGFyZSByZXR1cm5lZC5cblx0ICovXG5cdHNvdXJjZUN1c3RvbUFnZW50Pzogc3RyaW5nO1xuXG59XG5cbi8qKlxuICogRGlzY292ZXJzIHRoZSBoYW5kb2ZmcyBhdmFpbGFibGUgYWNyb3NzIGN1c3RvbSBhZ2VudHMgKGFuZCBidWlsdC1pbiBtb2RlcykuXG4gKlxuICogKipSZXR1cm4gdmFsdWUqKjogYElDdXN0b21BZ2VudEluZm9bXWAgXHUyMDE0IGFuIGFycmF5IHdoZXJlIGVhY2ggZWxlbWVudFxuICogcmVwcmVzZW50cyBhbiBhZ2VudC9tb2RlIHdpdGggaXRzIGBpZGAsIGBuYW1lYCwgYGlzQnVpbHRpbmAsXG4gKiBgdmlzaWJpbGl0eWAsIGFuZCBgaGFuZG9mZnNgIGxpc3QuXG4gKlxuICogQHNlZSBJQ3VzdG9tQWdlbnRJbmZvXG4gKiBAc2VlIElIYW5kb2ZmSW5mb1xuICovXG5jbGFzcyBHZXRIYW5kb2Zmc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEdldEhhbmRvZmZzQWN0aW9uSWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEdldEhhbmRvZmZzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5nZXRIYW5kb2Zmcy5sYWJlbCcsIFwiR2V0IEhhbmRvZmZzXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IG1vZGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0TW9kZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGFyZyA9IGFyZ3MuYXQoMCkgYXMgSUdldEhhbmRvZmZzQXJncyB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHsgYnVpbHRpbiwgY3VzdG9tIH0gPSBhd2FpdCBtb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCk7XG5cdFx0bGV0IGFsbE1vZGVzOiByZWFkb25seSBJQ2hhdE1vZGVbXSA9IFsuLi5idWlsdGluLCAuLi5jdXN0b21dO1xuXG5cdFx0aWYgKGFyZz8uc291cmNlQ3VzdG9tQWdlbnQpIHtcblx0XHRcdGNvbnN0IGZpbHRlck5hbWUgPSBhcmcuc291cmNlQ3VzdG9tQWdlbnQ7XG5cdFx0XHRhbGxNb2RlcyA9IGFsbE1vZGVzLmZpbHRlcihtID0+IG0ubmFtZS5nZXQoKS50b0xvd2VyQ2FzZSgpID09PSBmaWx0ZXJOYW1lLnRvTG93ZXJDYXNlKCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBidWlsZEN1c3RvbUFnZW50SGFuZG9mZnNJbmZvKGFsbE1vZGVzKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgRXhlY3V0ZUhhbmRvZmZBY3Rpb25JZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZXhlY3V0ZUhhbmRvZmYnO1xuXG5pbnRlcmZhY2UgSUV4ZWN1dGVIYW5kb2ZmQXJncyB7XG5cdC8qKlxuXHQgKiBUaGUgc3RhYmxlIGhhbmRvZmYgSUQgKGZyb20gZ2V0SGFuZG9mZnMpLiBQcmltYXJ5IG1hdGNoIGtleS5cblx0ICogSURzIGFyZSB1bmlxdWUgd2l0aGluIGEgZ2l2ZW4gc291cmNlIGFnZW50OyB3aGVuIGhhbmRvZmZzIGZyb21cblx0ICogbXVsdGlwbGUgc291cmNlIGFnZW50cyBzaGFyZSB0aGUgc2FtZSB0YXJnZXQrbGFiZWwsIGFsc28gcHJvdmlkZVxuXHQgKiBgc291cmNlQ3VzdG9tQWdlbnRgIHRvIGRpc2FtYmlndWF0ZS5cblx0ICovXG5cdGlkPzogc3RyaW5nO1xuXHQvKiogRmFsbGJhY2s6IGhhbmRvZmYgbGFiZWwgdG8gbWF0Y2guIENhc2UtaW5zZW5zaXRpdmUuICovXG5cdGxhYmVsPzogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIGNoYXQgc2Vzc2lvbiBVUkkgaWRlbnRpZnlpbmcgd2hpY2ggY2hhdCB3aWRnZXQgdG8gZXhlY3V0ZSBpbi5cblx0ICogSWYgb21pdHRlZCwgZmFsbHMgYmFjayB0byB0aGUgbGFzdC1mb2N1c2VkIGNoYXQgd2lkZ2V0LlxuXHQgKi9cblx0c2Vzc2lvblJlc291cmNlPzogc3RyaW5nO1xuXHQvKipcblx0ICogTmFtZSBvZiB0aGUgKnNvdXJjZSogY3VzdG9tIGFnZW50IChmcm9tIGAuYWdlbnQubWRgKSB0aGF0IGRlY2xhcmVzIHRoZSBoYW5kb2ZmIHRvXG5cdCAqIGV4ZWN1dGUuIElmIG9taXR0ZWQsIGZhbGxzIGJhY2sgdG8gdGhlIHNlc3Npb24ncyBjdXJyZW50bHkgYWN0aXZlIG1vZGUvYWdlbnQuXG5cdCAqL1xuXHRzb3VyY2VDdXN0b21BZ2VudD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElFeGVjdXRlSGFuZG9mZlJlc3VsdCB7XG5cdHN1Y2Nlc3M6IGJvb2xlYW47XG5cdHRhcmdldE1vZGU/OiBzdHJpbmc7XG5cdGVycm9yPzogc3RyaW5nO1xufVxuXG5jbGFzcyBFeGVjdXRlSGFuZG9mZkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEV4ZWN1dGVIYW5kb2ZmQWN0aW9uSWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEV4ZWN1dGVIYW5kb2ZmQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5leGVjdXRlSGFuZG9mZi5sYWJlbCcsIFwiRXhlY3V0ZSBIYW5kb2ZmXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8SUV4ZWN1dGVIYW5kb2ZmUmVzdWx0PiB7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFyZyA9IGFyZ3MuYXQoMCkgYXMgSUV4ZWN1dGVIYW5kb2ZmQXJncyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWFyZz8uaWQgJiYgIWFyZz8ubGFiZWwpIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0VpdGhlciBpZCBvciBsYWJlbCBpcyByZXF1aXJlZCcgfTtcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIHRoZSB0YXJnZXQgd2lkZ2V0OiBleHBsaWNpdCBzZXNzaW9uUmVzb3VyY2UsIG9yIGZhbGwgYmFjayB0byBsYXN0LWZvY3VzZWRcblx0XHRsZXQgd2lkZ2V0OiBJQ2hhdFdpZGdldCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYXJnLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0bGV0IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShhcmcuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm4geyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGBJbnZhbGlkIHNlc3Npb25SZXNvdXJjZSBVUkk6ICcke2FyZy5zZXNzaW9uUmVzb3VyY2V9J2AgfTtcblx0XHRcdH1cblx0XHRcdHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdH1cblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnTm8gY2hhdCB3aWRnZXQgZm91bmQuIFByb3ZpZGUgc2Vzc2lvblJlc291cmNlIG9yIGZvY3VzIGEgY2hhdCB3aWRnZXQuJyB9O1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGhlIHNvdXJjZSBjdXN0b20gYWdlbnQgd2hvc2UgaGFuZG9mZnMgd2Ugc2VhcmNoIChjYXNlLWluc2Vuc2l0aXZlKVxuXHRcdGxldCBzb3VyY2VNb2RlOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGFyZy5zb3VyY2VDdXN0b21BZ2VudCkge1xuXHRcdFx0Y29uc3QgZmlsdGVyTmFtZSA9IGFyZy5zb3VyY2VDdXN0b21BZ2VudC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0Y29uc3QgeyBidWlsdGluLCBjdXN0b20gfSA9IHdpZGdldC5pbnB1dC5jdXJyZW50Q2hhdE1vZGVzT2JzLmdldCgpO1xuXHRcdFx0c291cmNlTW9kZSA9IFsuLi5idWlsdGluLCAuLi5jdXN0b21dLmZpbmQobSA9PiBtLm5hbWUuZ2V0KCkudG9Mb3dlckNhc2UoKSA9PT0gZmlsdGVyTmFtZSB8fCBtLmlkLnRvTG93ZXJDYXNlKCkgPT09IGZpbHRlck5hbWUpO1xuXHRcdH1cblx0XHRpZiAoIXNvdXJjZU1vZGUpIHtcblx0XHRcdHNvdXJjZU1vZGUgPSB3aWRnZXQuaW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFuZG9mZnMgPSBzb3VyY2VNb2RlPy5oYW5kT2Zmcz8uZ2V0KCk7XG5cdFx0aWYgKCFoYW5kb2ZmcyB8fCBoYW5kb2Zmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogYE5vIGhhbmRvZmZzIGF2YWlsYWJsZSBmb3IgbW9kZSAnJHtzb3VyY2VNb2RlPy5uYW1lLmdldCgpfSdgIH07XG5cdFx0fVxuXG5cdFx0Ly8gTWF0Y2ggYnkgaWQgZmlyc3QsIHRoZW4gYnkgbGFiZWxcblx0XHRsZXQgbWF0Y2hlZEhhbmRvZmYgPSBhcmcuaWRcblx0XHRcdD8gaGFuZG9mZnMuZmluZChoID0+IGdldEhhbmRvZmZJZChoKSA9PT0gYXJnLmlkKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRpZiAoIW1hdGNoZWRIYW5kb2ZmICYmIGFyZy5sYWJlbCkge1xuXHRcdFx0Y29uc3QgbGFiZWxMb3dlciA9IGFyZy5sYWJlbC50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0XHRcdG1hdGNoZWRIYW5kb2ZmID0gaGFuZG9mZnMuZmluZChoID0+IGgubGFiZWwudHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IGxhYmVsTG93ZXIpO1xuXHRcdH1cblxuXHRcdGlmICghbWF0Y2hlZEhhbmRvZmYpIHtcblx0XHRcdGNvbnN0IGlkZW50aWZpZXIgPSBhcmcuaWQgPz8gYXJnLmxhYmVsO1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiBgTm8gaGFuZG9mZiB3aXRoIGlkZW50aWZpZXIgJyR7aWRlbnRpZmllcn0nIGZvdW5kIGZvciBtb2RlICcke3NvdXJjZU1vZGU/Lm5hbWUuZ2V0KCl9J2AgfTtcblx0XHR9XG5cblx0XHRhd2FpdCB3aWRnZXQuZXhlY3V0ZUhhbmRvZmYobWF0Y2hlZEhhbmRvZmYpO1xuXHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHRhcmdldE1vZGU6IG1hdGNoZWRIYW5kb2ZmLmFnZW50IH07XG5cdH1cbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDaGF0RXhlY3V0ZUFjdGlvbnMoKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQ2hhdFN1Ym1pdEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKENoYXRFZGl0aW5nU2Vzc2lvblN1Ym1pdEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKFN1Ym1pdFdpdGhvdXREaXNwYXRjaGluZ0FjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKENhbmNlbEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKFNlbmRUb05ld0NoYXRBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihDaGF0U3VibWl0V2l0aENvZGViYXNlQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoVG9nZ2xlQ2hhdE1vZGVBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihTd2l0Y2hUb05leHRNb2RlbEFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKFN3aXRjaFRvTmV4dFBpbm5lZE1vZGVsQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoT3Blbk1vZGVsUGlja2VyQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoT3BlblBlcm1pc3Npb25QaWNrZXJBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihPcGVuTW9kZVBpY2tlckFjdGlvbikpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKE9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoT3BlbkRlbGVnYXRpb25QaWNrZXJBY3Rpb24pKTtcblx0c3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihPcGVuV29ya3NwYWNlUGlja2VyQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQ2hhdFNlc3Npb25QcmltYXJ5UGlja2VyQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQ2hhbmdlQ2hhdE1vZGVsQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoQ2FuY2VsRWRpdCkpO1xuXHRzdG9yZS5hZGQocmVnaXN0ZXJBY3Rpb24yKEdldEhhbmRvZmZzQWN0aW9uKSk7XG5cdHN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoRXhlY3V0ZUhhbmRvZmZBY3Rpb24pKTtcblx0cmV0dXJuIHN0b3JlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hC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
