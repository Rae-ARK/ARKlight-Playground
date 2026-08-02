import { isAncestorOfActiveElement } from "../../../../../base/browser/dom.js";
import { alert } from "../../../../../base/browser/ui/aria/aria.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { timeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { safeIntl } from "../../../../../base/common/date.js";
import { Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { language } from "../../../../../base/common/platform.js";
import { basename } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { EditorAction2 } from "../../../../../editor/browser/editorExtensions.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsLinuxContext, IsWindowsContext } from "../../../../../platform/contextkey/common/contextkeys.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import product from "../../../../../platform/product/common/product.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IAgentHostEnablementService } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ActiveEditorContext } from "../../../../common/contextkeys.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, SIDE_GROUP } from "../../../../services/editor/common/editorService.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../../services/layout/browser/layoutService.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { EXTENSIONS_CATEGORY, IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { SCMHistoryItemChangeRangeContentProvider } from "../../../scm/browser/scmHistoryChatContext.js";
import { ISCMService } from "../../../scm/common/scm.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { ChatMode } from "../../common/chatModes.js";
import { ElicitationState, IChatService, IChatToolInvocation } from "../../common/chatService/chatService.js";
import { isRequestVM } from "../../common/model/chatViewModel.js";
import { IChatWidgetHistoryService } from "../../common/widget/chatWidgetHistoryService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, getDefaultNewChatSessionResource, resolveDefaultNewChatSessionType } from "../../common/constants.js";
import { markPreferredCopilotHarness } from "../../common/chatSessionTypePreference.js";
import { AICustomizationManagementCommands } from "../aiCustomization/aiCustomizationManagement.js";
import { ILanguageModelsService } from "../../common/languageModels.js";
import { CopilotUsageExtensionFeatureId } from "../../common/languageModelStats.js";
import { ILanguageModelToolsConfirmationService } from "../../common/tools/languageModelToolsConfirmationService.js";
import { ILanguageModelToolsService, isToolSet, ToolAndToolSetEnablementMap } from "../../common/tools/languageModelToolsService.js";
import { ChatViewId, IChatWidgetService, isIChatViewViewContext } from "../chat.js";
import { ChatEditorInput, showClearEditingSessionConfirmation } from "../widgetHosts/editor/chatEditorInput.js";
import { convertBufferToScreenshotVariable } from "../attachments/chatScreenshotContext.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { IChatSessionsService, localChatSessionType } from "../../common/chatSessionsService.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
const CHAT_CATEGORY = localize2("chat.category", "Chat");
const COPILOT_CLI_AGENT_HOST_PROVIDER_ID = "copilotcli";
const ACTION_ID_NEW_CHAT = `workbench.action.chat.newChat`;
const ACTION_ID_NEW_EDIT_SESSION = `workbench.action.chat.newEditSession`;
const ACTION_ID_OPEN_CHAT = "workbench.action.openChat";
const CHAT_OPEN_ACTION_ID = "workbench.action.chat.open";
const CHAT_SETUP_ACTION_ID = "workbench.action.chat.triggerSetup";
const CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID = "workbench.action.chat.triggerSetupSupportAnonymousAction";
const TOGGLE_CHAT_ACTION_ID = "workbench.action.chat.toggle";
const GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID = "workbench.action.chat.generateAgentInstructions";
const GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID = "workbench.action.chat.generateOnDemandInstructions";
const GENERATE_PROMPT_COMMAND_ID = "workbench.action.chat.generatePrompt";
const GENERATE_SKILL_COMMAND_ID = "workbench.action.chat.generateSkill";
const GENERATE_AGENT_COMMAND_ID = "workbench.action.chat.generateAgent";
const GENERATE_HOOK_COMMAND_ID = "workbench.action.chat.generateHook";
const INSERT_FORK_CONVERSATION_COMMAND_ID = "workbench.action.chat.insertForkConversationCommand";
const INSERT_TROUBLESHOOT_COMMAND_ID = "workbench.action.chat.insertTroubleshootCommand";
const defaultChat = {
  provider: product.defaultChatAgent?.provider ?? { enterprise: { id: "" } },
  completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? "",
  completionsMenuCommand: product.defaultChatAgent?.completionsMenuCommand ?? ""
};
const CHAT_CONFIG_MENU_ID = new MenuId("workbench.chat.menu.config");
const OPEN_CHAT_QUOTA_EXCEEDED_DIALOG = "workbench.action.chat.openQuotaExceededDialog";
class OpenChatGlobalAction extends Action2 {
  constructor(overrides, mode) {
    super({
      ...overrides,
      icon: Codicon.chatSparkle,
      f1: true,
      category: CHAT_CATEGORY,
      precondition: ContextKeyExpr.and(
        ChatContextKeys.Setup.hidden.negate(),
        ChatContextKeys.Setup.disabledInWorkspace.negate()
      )
    });
    this.mode = mode;
  }
  async run(accessor, opts) {
    opts = typeof opts === "string" ? { query: opts } : opts;
    const chatService = accessor.get(IChatService);
    const widgetService = accessor.get(IChatWidgetService);
    const toolsService = accessor.get(ILanguageModelToolsService);
    const hostService = accessor.get(IHostService);
    const chatAgentService = accessor.get(IChatAgentService);
    const instaService = accessor.get(IInstantiationService);
    const commandService = accessor.get(ICommandService);
    const fileService = accessor.get(IFileService);
    const languageModelService = accessor.get(ILanguageModelsService);
    const scmService = accessor.get(ISCMService);
    const logService = accessor.get(ILogService);
    const configurationService = accessor.get(IConfigurationService);
    let chatWidget = widgetService.lastFocusedWidget;
    if (!this.mode || !chatWidget || !isAncestorOfActiveElement(chatWidget.domNode)) {
      chatWidget = await widgetService.revealWidget();
    }
    if (!chatWidget) {
      return;
    }
    const switchToMode = opts?.mode ? chatWidget.input.currentChatModesObs.get().findModeByName(opts.mode) : this.mode;
    if (switchToMode) {
      await this.handleSwitchToMode(switchToMode, chatWidget, instaService, commandService);
    }
    if (opts?.modelSelector) {
      const ids = await languageModelService.selectLanguageModels(opts.modelSelector);
      const id = ids.sort().at(0);
      if (!id) {
        throw new Error(`No language models found matching selector: ${JSON.stringify(opts.modelSelector)}.`);
      }
      const model = languageModelService.lookupLanguageModel(id);
      if (!model) {
        throw new Error(`Language model not loaded: ${id}.`);
      }
      chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id }, true);
    }
    if (opts?.toolsInclude || opts?.toolsExclude) {
      const model = chatWidget.input.selectedLanguageModel.get()?.metadata;
      const allTools = Array.from(toolsService.getTools(model));
      const allToolSets = Array.from(toolsService.getToolSetsForModel(model));
      const result = computeToolEnablementMap({
        allTools,
        allToolSets,
        toolsInclude: opts.toolsInclude,
        toolsExclude: opts.toolsExclude
      });
      for (const identifier of result.unknownIdentifiers) {
        logService.warn(`Tool filtering: Unknown identifier '${identifier}' - no matching tool or toolset found.`);
      }
      chatWidget.input.selectedToolsModel.set(result.enablementMap, true);
    }
    if (opts?.previousRequests?.length && chatWidget.viewModel) {
      for (const { request, response } of opts.previousRequests) {
        chatService.addCompleteRequest(chatWidget.viewModel.sessionResource, request, void 0, 0, { message: response });
      }
    }
    if (opts?.attachScreenshot) {
      const screenshot = await hostService.getScreenshot();
      if (screenshot) {
        chatWidget.attachmentModel.addContext(convertBufferToScreenshotVariable(screenshot));
      }
    }
    if (opts?.attachFiles) {
      for (const file of opts.attachFiles) {
        const uri = file instanceof URI ? file : file.uri;
        const range = file instanceof URI ? void 0 : file.range;
        if (await fileService.exists(uri)) {
          chatWidget.attachmentModel.addFile(uri, range);
        }
      }
    }
    if (opts?.attachHistoryItemChanges) {
      for (const historyItemChange of opts.attachHistoryItemChanges) {
        const repository = scmService.getRepository(URI.file(historyItemChange.uri.path));
        const historyProvider = repository?.provider.historyProvider.get();
        if (!historyProvider) {
          continue;
        }
        const historyItem = await historyProvider.resolveHistoryItem(historyItemChange.historyItemId);
        if (!historyItem) {
          continue;
        }
        chatWidget.attachmentModel.addContext({
          id: historyItemChange.uri.toString(),
          name: `${basename(historyItemChange.uri)}`,
          value: historyItemChange.uri,
          historyItem,
          kind: "scmHistoryItemChange"
        });
      }
    }
    if (opts?.attachHistoryItemChangeRanges) {
      for (const historyItemChangeRange of opts.attachHistoryItemChangeRanges) {
        const repository = scmService.getRepository(URI.file(historyItemChangeRange.end.uri.path));
        const historyProvider = repository?.provider.historyProvider.get();
        if (!repository || !historyProvider) {
          continue;
        }
        const [historyItemStart, historyItemEnd] = await Promise.all([
          historyProvider.resolveHistoryItem(historyItemChangeRange.start.historyItemId),
          historyProvider.resolveHistoryItem(historyItemChangeRange.end.historyItemId)
        ]);
        if (!historyItemStart || !historyItemEnd) {
          continue;
        }
        const uri = historyItemChangeRange.end.uri.with({
          scheme: SCMHistoryItemChangeRangeContentProvider.scheme,
          query: JSON.stringify({
            repositoryId: repository.id,
            start: historyItemStart.id,
            end: historyItemChangeRange.end.historyItemId
          })
        });
        chatWidget.attachmentModel.addContext({
          id: uri.toString(),
          name: `${basename(uri)}`,
          value: uri,
          historyItemChangeStart: {
            uri: historyItemChangeRange.start.uri,
            historyItem: historyItemStart
          },
          historyItemChangeEnd: {
            uri: historyItemChangeRange.end.uri,
            historyItem: {
              ...historyItemEnd,
              displayId: historyItemChangeRange.end.historyItemId
            }
          },
          kind: "scmHistoryItemChangeRange"
        });
      }
    }
    let resp;
    if (opts?.query) {
      if (opts.isPartialQuery) {
        chatWidget.input.showScrollbarUntilAccept();
        chatWidget.setInput(opts.query);
      } else {
        if (!chatWidget.viewModel) {
          await Event.toPromise(chatWidget.onDidChangeViewModel);
        }
        await waitForDefaultAgent(chatAgentService, chatWidget.input.currentModeKind);
        if (opts.preserveInput) {
          resp = chatWidget.acceptInput(opts.query, { preserveInput: true });
        } else {
          chatWidget.setInput(opts.query);
          resp = chatWidget.acceptInput();
        }
      }
    }
    if (opts?.toolIds && opts.toolIds.length > 0) {
      for (const toolId of opts.toolIds) {
        const tool = toolsService.getTool(toolId);
        if (tool) {
          chatWidget.attachmentModel.addContext({
            id: tool.id,
            name: tool.displayName,
            fullName: tool.displayName,
            value: void 0,
            icon: ThemeIcon.isThemeIcon(tool.icon) ? tool.icon : void 0,
            kind: "tool"
          });
        }
      }
    }
    chatWidget.focusInput();
    if (opts?.blockOnResponse) {
      const response = await resp;
      if (response) {
        const autoReplyEnabled = configurationService.getValue(ChatConfiguration.AutoReply);
        await new Promise((resolve) => {
          const d = response.onDidChange(async () => {
            if (response.isComplete) {
              d.dispose();
              resolve();
              return;
            }
            const pendingConfirmation = response.isPendingConfirmation.get();
            if (pendingConfirmation) {
              const hasPendingQuestionCarousel = response.response.value.some(
                (part) => part.kind === "questionCarousel" && !part.isUsed
              );
              if (autoReplyEnabled && hasPendingQuestionCarousel) {
                return;
              }
              d.dispose();
              resolve();
            }
          });
        });
        const confirmationInfo = getPendingConfirmationInfo(response);
        if (confirmationInfo) {
          return { ...response.result, ...confirmationInfo };
        }
        return { ...response.result };
      }
    }
    return void 0;
  }
  async handleSwitchToMode(switchToMode, chatWidget, instaService, commandService) {
    const currentMode = chatWidget.input.currentModeKind;
    if (switchToMode) {
      const model = chatWidget.viewModel?.model;
      const chatModeCheck = model ? await instaService.invokeFunction(handleModeSwitch, currentMode, switchToMode.kind, model.getRequests().length, model) : { needToClearSession: false };
      if (!chatModeCheck) {
        return;
      }
      chatWidget.input.setChatMode(switchToMode.id, true, true);
      if (chatModeCheck.needToClearSession) {
        await commandService.executeCommand(ACTION_ID_NEW_CHAT);
      }
    }
  }
}
async function waitForDefaultAgent(chatAgentService, mode) {
  const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode);
  if (defaultAgent) {
    return;
  }
  await Promise.race([
    Event.toPromise(Event.filter(chatAgentService.onDidChangeAgents, () => {
      const defaultAgent2 = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode);
      return Boolean(defaultAgent2);
    })),
    timeout(6e4).then(() => {
      throw new Error("Timed out waiting for default agent");
    })
  ]);
}
function getPendingConfirmationInfo(response) {
  for (const part of response.response.value) {
    if (part.kind === "toolInvocation") {
      const state = part.state.get();
      if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
        return {
          type: "confirmation",
          kind: "toolInvocation",
          toolId: part.toolId
        };
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
        return {
          type: "confirmation",
          kind: "toolPostApproval",
          toolId: part.toolId
        };
      }
    }
    if (part.kind === "confirmation" && !part.isUsed) {
      return {
        type: "confirmation",
        kind: "confirmation",
        title: part.title,
        data: part.data
      };
    }
    if (part.kind === "questionCarousel" && !part.isUsed) {
      return {
        type: "confirmation",
        kind: "questionCarousel",
        questions: part.questions
      };
    }
    if (part.kind === "elicitation2" && part.state.get() === ElicitationState.Pending) {
      const title = part.title;
      return {
        type: "confirmation",
        kind: "elicitation",
        title: typeof title === "string" ? title : title.value
      };
    }
  }
  return void 0;
}
class PrimaryOpenChatGlobalAction extends OpenChatGlobalAction {
  constructor() {
    super({
      id: CHAT_OPEN_ACTION_ID,
      title: localize2("openChat", "Open Chat"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyI,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.WinCtrl | KeyCode.KeyI
        }
      },
      menu: [{
        id: MenuId.ChatTitleBarMenu,
        group: "a_open",
        order: 1
      }]
    });
  }
}
function getOpenChatActionIdForMode(mode) {
  return `workbench.action.chat.open${mode.name.get()}`;
}
class ModeOpenChatGlobalAction extends OpenChatGlobalAction {
  constructor(mode, keybinding) {
    super({
      id: getOpenChatActionIdForMode(mode),
      title: localize2("openChatMode", "Open Chat ({0})", mode.label.get()),
      keybinding
    }, mode);
  }
}
function registerChatActions() {
  var _a, _b, _c, _d, _e, _f;
  function getNewChatEditorSessionUri(accessor) {
    return getDefaultNewChatSessionResource(accessor.get(IConfigurationService), accessor.get(IChatSessionsService), accessor.get(IStorageService), accessor.get(IWorkspaceContextService).getWorkspace(), accessor.get(IAgentHostEnablementService).enabled.get());
  }
  registerAction2(PrimaryOpenChatGlobalAction);
  registerAction2(class extends ModeOpenChatGlobalAction {
    constructor() {
      super(ChatMode.Ask);
    }
  });
  registerAction2(class extends ModeOpenChatGlobalAction {
    constructor() {
      super(ChatMode.Agent, {
        when: ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI,
        linux: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyI
        }
      });
    }
  });
  registerAction2(class extends ModeOpenChatGlobalAction {
    constructor() {
      super(ChatMode.Edit);
    }
  });
  registerAction2(class ToggleChatAction extends Action2 {
    constructor() {
      super({
        id: TOGGLE_CHAT_ACTION_ID,
        title: localize2("toggleChat", "Toggle Chat"),
        category: CHAT_CATEGORY
      });
    }
    async run(accessor) {
      const layoutService = accessor.get(IWorkbenchLayoutService);
      const viewsService = accessor.get(IViewsService);
      const viewDescriptorService = accessor.get(IViewDescriptorService);
      const widgetService = accessor.get(IChatWidgetService);
      const chatLocation = viewDescriptorService.getViewLocationById(ChatViewId);
      const chatVisible = viewsService.isViewVisible(ChatViewId);
      if (chatVisible) {
        this.updatePartVisibility(layoutService, chatLocation, false);
      } else {
        this.updatePartVisibility(layoutService, chatLocation, true);
        (await widgetService.revealWidget())?.focusInput();
      }
    }
    updatePartVisibility(layoutService, location, visible) {
      let part;
      switch (location) {
        case ViewContainerLocation.Panel:
          part = Parts.PANEL_PART;
          break;
        case ViewContainerLocation.Sidebar:
          part = Parts.SIDEBAR_PART;
          break;
        case ViewContainerLocation.AuxiliaryBar:
          part = Parts.AUXILIARYBAR_PART;
          break;
      }
      if (part) {
        layoutService.setPartHidden(!visible, part);
      }
    }
  });
  registerAction2(class NewChatEditorAction extends Action2 {
    constructor() {
      super({
        id: ACTION_ID_OPEN_CHAT,
        title: localize2("interactiveSession.open", "New Chat Editor"),
        icon: Codicon.plus,
        f1: true,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyCode.KeyN,
          when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatEditor)
        },
        menu: [{
          id: MenuId.ChatTitleBarMenu,
          group: "b_new",
          order: 0
        }, {
          id: MenuId.ChatNewMenu,
          group: "2_new",
          order: 2
        }, {
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("copilot"), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("new-session"), ChatContextKeys.newChatButtonExperimentIcon.notEqualsTo("comment")),
          order: 1
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), ACTIVE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatEditorCopilotIconAction extends Action2 {
    constructor() {
      super({
        id: ACTION_ID_OPEN_CHAT + ".copilotIcon",
        title: localize2("interactiveSession.open", "New Chat Editor"),
        icon: Codicon.copilot,
        f1: false,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: [{
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo("copilot")),
          order: 1
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), ACTIVE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatEditorNewSessionIconAction extends Action2 {
    constructor() {
      super({
        id: ACTION_ID_OPEN_CHAT + ".newSessionIcon",
        title: localize2("interactiveSession.open", "New Chat Editor"),
        icon: Codicon.newSession,
        f1: false,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: [{
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo("new-session")),
          order: 1
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), ACTIVE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatEditorCommentIconAction extends Action2 {
    constructor() {
      super({
        id: ACTION_ID_OPEN_CHAT + ".commentIcon",
        title: localize2("interactiveSession.open", "New Chat Editor"),
        icon: Codicon.comment,
        f1: false,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: [{
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID), ChatContextKeys.newChatButtonExperimentIcon.isEqualTo("comment")),
          order: 1
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), ACTIVE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatEditorToSideAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.openChatToSide",
        title: localize2("interactiveSession.openToSide", "New Chat Editor to the Side"),
        f1: true,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), SIDE_GROUP, { pinned: true });
    }
  });
  registerAction2(class NewChatWindowAction extends Action2 {
    constructor() {
      super({
        id: `workbench.action.newChatWindow`,
        title: localize2("interactiveSession.newChatWindow", "New Chat Window"),
        f1: true,
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: [{
          id: MenuId.ChatTitleBarMenu,
          group: "b_new",
          order: 1
        }, {
          id: MenuId.ChatNewMenu,
          group: "2_new",
          order: 3
        }]
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      await widgetService.openSession(getNewChatEditorSessionUri(accessor), AUX_WINDOW_GROUP, { pinned: true, auxiliary: { compact: true, bounds: { width: 640, height: 640 } } });
    }
  });
  registerAction2(class ClearChatInputHistoryAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.clearInputHistory",
        title: localize2("interactiveSession.clearHistory.label", "Clear Input History"),
        precondition: ChatContextKeys.enabled,
        category: CHAT_CATEGORY,
        f1: true
      });
    }
    async run(accessor, ...args) {
      const historyService = accessor.get(IChatWidgetHistoryService);
      historyService.clearHistory();
    }
  });
  registerAction2(class FocusChatAction extends EditorAction2 {
    constructor() {
      super({
        id: "chat.action.focus",
        title: localize2("actions.interactiveSession.focus", "Focus Chat List"),
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatInput),
        category: CHAT_CATEGORY,
        keybinding: [
          // On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
          {
            when: ContextKeyExpr.and(ChatContextKeys.inputCursorAtTop, ChatContextKeys.inQuickChat.negate()),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
            weight: KeybindingWeight.EditorContrib
          },
          // On win/linux, ctrl+up can always focus the chat list
          {
            when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
            weight: KeybindingWeight.EditorContrib
          },
          {
            when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
            primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
            weight: KeybindingWeight.WorkbenchContrib
          }
        ]
      });
    }
    runEditorCommand(accessor, editor) {
      const editorUri = editor.getModel()?.uri;
      if (editorUri) {
        const widgetService = accessor.get(IChatWidgetService);
        widgetService.getWidgetByInputUri(editorUri)?.focusResponseItem();
      }
    }
  });
  registerAction2(class FocusMostRecentlyFocusedChatAction extends EditorAction2 {
    constructor() {
      super({
        id: "workbench.chat.action.focusLastFocused",
        title: localize2("actions.interactiveSession.focusLastFocused", "Focus Last Focused Chat List Item"),
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatInput),
        category: CHAT_CATEGORY,
        keybinding: [
          // On mac, require that the cursor is at the top of the input, to avoid stealing cmd+up to move the cursor to the top
          {
            when: ContextKeyExpr.and(ChatContextKeys.inputCursorAtTop, ChatContextKeys.inQuickChat.negate()),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow | KeyMod.Shift,
            weight: KeybindingWeight.EditorContrib + 1
          },
          // On win/linux, ctrl+up can always focus the chat list
          {
            when: ContextKeyExpr.and(ContextKeyExpr.or(IsWindowsContext, IsLinuxContext), ChatContextKeys.inQuickChat.negate()),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow | KeyMod.Shift,
            weight: KeybindingWeight.EditorContrib + 1
          },
          {
            when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inQuickChat),
            primary: KeyMod.CtrlCmd | KeyCode.DownArrow | KeyMod.Shift,
            weight: KeybindingWeight.WorkbenchContrib + 1
          }
        ]
      });
    }
    runEditorCommand(accessor, editor) {
      const editorUri = editor.getModel()?.uri;
      if (editorUri) {
        const widgetService = accessor.get(IChatWidgetService);
        widgetService.getWidgetByInputUri(editorUri)?.focusResponseItem(true);
      }
    }
  });
  registerAction2(class FocusChatInputAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.focusInput",
        title: localize2("interactiveSession.focusInput.label", "Focus Chat Input"),
        f1: false,
        keybinding: [
          {
            primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
            weight: KeybindingWeight.WorkbenchContrib,
            when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat.negate())
          },
          {
            when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate(), ChatContextKeys.inQuickChat),
            primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
            weight: KeybindingWeight.WorkbenchContrib
          }
        ]
      });
    }
    run(accessor, ...args) {
      const widgetService = accessor.get(IChatWidgetService);
      widgetService.lastFocusedWidget?.focusInput();
    }
  });
  registerAction2((_a = class extends Action2 {
    constructor() {
      super({
        id: _a.ID,
        title: localize2("interactiveSession.focusTodosView.label", "Toggle Focus Between TODOs and Input"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib + 1,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT,
          when: ContextKeyExpr.or(
            ContextKeyExpr.and(ChatContextKeys.inChatInput, ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent)),
            ContextKeyExpr.and(ChatContextKeys.inChatTodoList, ChatContextKeys.chatModeKind.isEqualTo(ChatModeKind.Agent))
          )
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      const widget = widgetService.lastFocusedWidget;
      if (!widget || !widget.toggleTodosViewFocus()) {
        alert(localize("chat.todoList.focusUnavailable", "No agent todos to focus right now."));
      }
    }
  }, _a.ID = "workbench.action.chat.focusTodosView", _a));
  registerAction2((_b = class extends Action2 {
    constructor() {
      super({
        id: _b.ID,
        title: localize2("interactiveSession.focusQuestionCarousel.label", "Chat: Toggle Focus Between Question and Input"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.inChatSession,
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
          when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel)
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      const widget = widgetService.lastFocusedWidget;
      if (!widget || !widget.toggleQuestionCarouselFocus()) {
        alert(localize("chat.questionCarousel.focusUnavailable", "No chat question to focus right now."));
      }
    }
  }, _b.ID = "workbench.action.chat.focusQuestionCarousel", _b));
  registerAction2((_c = class extends Action2 {
    constructor() {
      super({
        id: _c.ID,
        title: localize2("interactiveSession.previousQuestion.label", "Chat: Previous Question"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.Alt | KeyCode.KeyP,
          when: ContextKeyExpr.and(ChatContextKeys.inChatQuestionCarousel, ChatContextKeys.Editing.hasQuestionCarousel)
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      widgetService.lastFocusedWidget?.navigateToPreviousQuestion();
    }
  }, _c.ID = "workbench.action.chat.previousQuestion", _c));
  registerAction2((_d = class extends Action2 {
    constructor() {
      super({
        id: _d.ID,
        title: localize2("interactiveSession.nextQuestion.label", "Chat: Next Question"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.Alt | KeyCode.KeyN,
          when: ContextKeyExpr.and(ChatContextKeys.inChatQuestionCarousel, ChatContextKeys.Editing.hasQuestionCarousel)
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      widgetService.lastFocusedWidget?.navigateToNextQuestion();
    }
  }, _d.ID = "workbench.action.chat.nextQuestion", _d));
  registerAction2((_e = class extends Action2 {
    constructor() {
      super({
        id: _e.ID,
        title: localize2("interactiveSession.focusQuestionCarouselTerminal.label", "Chat: Focus Terminal from Question Carousel"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.Editing.hasQuestionCarousel, ChatContextKeys.chatQuestionCarouselHasTerminal),
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.Alt | KeyCode.KeyT,
          when: ContextKeyExpr.and(ChatContextKeys.inChatQuestionCarousel, ChatContextKeys.Editing.hasQuestionCarousel, ChatContextKeys.chatQuestionCarouselHasTerminal)
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      widgetService.lastFocusedWidget?.focusQuestionCarouselTerminal();
    }
  }, _e.ID = "workbench.action.chat.focusQuestionCarouselTerminal", _e));
  registerAction2((_f = class extends Action2 {
    constructor() {
      super({
        id: _f.ID,
        title: localize2("interactiveSession.focusTip.label", "Chat: Toggle Focus Between Tip and Input"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.inChatSession,
        keybinding: [{
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Slash,
          when: ContextKeyExpr.or(
            ChatContextKeys.inChatSession,
            ChatContextKeys.inChatTip
          )
        }]
      });
    }
    run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      const widget = widgetService.lastFocusedWidget;
      if (!widget || !widget.toggleTipFocus()) {
        alert(localize("chat.tip.focusUnavailable", "No chat tip."));
      }
    }
  }, _f.ID = "workbench.action.chat.focusTip", _f));
  registerAction2(class ShowContextUsageAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.showContextUsage",
        title: localize2("interactiveSession.showContextUsage.label", "Show Context Window Usage"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const widgetService = accessor.get(IChatWidgetService);
      const widget = widgetService.lastFocusedWidget ?? await widgetService.revealWidget();
      widget?.input.showContextUsageDetails();
    }
  });
  registerAction2(class CompactAgentHostConversationAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.compactAgentHostConversation",
        title: localize2("interactiveSession.compactAgentHostConversation.label", "Compact Conversation"),
        category: CHAT_CATEGORY,
        precondition: ChatContextKeys.enabled,
        menu: {
          id: MenuId.ChatContextUsageActions,
          group: "navigation",
          when: ContextKeyExpr.and(
            ChatContextKeys.chatIsAgentHostSession,
            ChatContextKeys.chatAgentHostProviderId.isEqualTo(COPILOT_CLI_AGENT_HOST_PROVIDER_ID)
          )
        }
      });
    }
    async run(_accessor, widget) {
      await widget?.acceptInput("/compact", { preserveInput: true });
    }
  });
  registerAction2(class ToggleShowContextUsageAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.toggleShowContextUsage",
        title: localize2("chat.showContextUsage", "Show Context Usage"),
        category: CHAT_CATEGORY,
        toggled: ContextKeyExpr.equals(`config.${ChatConfiguration.ChatContextUsageEnabled}`, true),
        menu: {
          id: MenuId.ChatWelcomeContext,
          group: "1_display",
          order: 1,
          when: ChatContextKeys.inChatEditor.negate()
        }
      });
    }
    async run(accessor) {
      const configurationService = accessor.get(IConfigurationService);
      const currentValue = configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled);
      await configurationService.updateValue(ChatConfiguration.ChatContextUsageEnabled, !currentValue);
    }
  });
  const nonEnterpriseCopilotUsers = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.notEquals(`config.${defaultChat.completionsAdvancedSetting}.authProvider`, defaultChat.provider.enterprise.id));
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.manageSettings",
        title: localize2("manageChat", "Manage Copilot Settings"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ContextKeyExpr.and(
          ContextKeyExpr.or(
            ChatContextKeys.Entitlement.planFree,
            ChatContextKeys.Entitlement.planEdu,
            ChatContextKeys.Entitlement.planPro,
            ChatContextKeys.Entitlement.planProPlus,
            ChatContextKeys.Entitlement.planMax
          ),
          nonEnterpriseCopilotUsers
        ),
        menu: {
          id: MenuId.ChatTitleBarMenu,
          group: "y_manage",
          order: 1,
          when: nonEnterpriseCopilotUsers
        }
      });
    }
    async run(accessor) {
      const openerService = accessor.get(IOpenerService);
      const defaultAccountService = accessor.get(IDefaultAccountService);
      openerService.open(URI.parse(defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings)));
    }
  });
  registerAction2(class ShowExtensionsUsingCopilot extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.showExtensionsUsingCopilot",
        title: localize2("showCopilotUsageExtensions", "Show Extensions using Copilot"),
        f1: true,
        category: EXTENSIONS_CATEGORY,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
      extensionsWorkbenchService.openSearch(`@contribute:${CopilotUsageExtensionFeatureId}`);
    }
  });
  registerAction2(class ConfigureCopilotCompletions extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.configureCodeCompletions",
        title: localize2("configureCompletions", "Configure Inline Suggestions..."),
        precondition: ContextKeyExpr.and(
          ChatContextKeys.Setup.installed,
          ChatContextKeys.Setup.disabled.negate(),
          ChatContextKeys.Setup.untrusted.negate()
        ),
        menu: {
          id: MenuId.ChatTitleBarMenu,
          group: "f_completions",
          order: 10
        }
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      commandService.executeCommand(defaultChat.completionsMenuCommand);
    }
  });
  registerAction2(class ShowQuotaExceededDialogAction extends Action2 {
    constructor() {
      super({
        id: OPEN_CHAT_QUOTA_EXCEEDED_DIALOG,
        title: localize("upgradeChat", "Upgrade GitHub Copilot Plan")
      });
    }
    async run(accessor) {
      const chatEntitlementService = accessor.get(IChatEntitlementService);
      const commandService = accessor.get(ICommandService);
      const dialogService = accessor.get(IDialogService);
      const telemetryService = accessor.get(ITelemetryService);
      let message;
      const chatQuotaExceeded = chatEntitlementService.quotas.chat?.percentRemaining === 0;
      const completionsQuotaExceeded = chatEntitlementService.quotas.completions?.percentRemaining === 0;
      if (chatQuotaExceeded && !completionsQuotaExceeded) {
        message = localize("chatQuotaExceeded", "You've reached your monthly chat messages quota. You still have free inline suggestions available.");
      } else if (completionsQuotaExceeded && !chatQuotaExceeded) {
        message = localize("completionsQuotaExceeded", "You've reached your monthly inline suggestions quota. You still have free chat messages available.");
      } else {
        message = localize("chatAndCompletionsQuotaExceeded", "You've reached your monthly chat messages and inline suggestions quota.");
      }
      if (chatEntitlementService.quotas.resetDate) {
        const dateFormatter = chatEntitlementService.quotas.resetDateHasTime ? safeIntl.DateTimeFormat(language, { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" }) : safeIntl.DateTimeFormat(language, { year: "numeric", month: "long", day: "numeric" });
        const quotaResetDate = new Date(chatEntitlementService.quotas.resetDate);
        message = [message, localize("quotaResetDate", "The allowance will reset on {0}.", dateFormatter.value.format(quotaResetDate))].join(" ");
      }
      const free = chatEntitlementService.entitlement === ChatEntitlement.Free;
      const upgradeToPro = free ? localize("upgradeToPro", "Upgrade to GitHub Copilot Pro for:\n- Unlimited inline suggestions\n- Unlimited chat messages\n- Access to premium models") : void 0;
      await dialogService.prompt({
        type: "none",
        message: localize("copilotQuotaReached", "GitHub Copilot Quota Reached"),
        cancelButton: {
          label: localize("dismiss", "Dismiss"),
          run: () => {
          }
        },
        buttons: [
          {
            label: free ? localize("upgradePro", "Upgrade to GitHub Copilot Pro") : localize("upgradePlan", "Upgrade GitHub Copilot Plan"),
            run: () => {
              const commandId = "workbench.action.chat.upgradePlan";
              telemetryService.publicLog2("workbenchActionExecuted", { id: commandId, from: "chat-dialog" });
              commandService.executeCommand(commandId);
            }
          }
        ],
        custom: {
          icon: Codicon.copilotWarningLarge,
          markdownDetails: coalesce([
            { markdown: new MarkdownString(message, true) },
            upgradeToPro ? { markdown: new MarkdownString(upgradeToPro, true) } : void 0
          ])
        }
      });
    }
  });
  registerAction2(class ResetTrustedToolsAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.resetTrustedTools",
        title: localize2("resetTrustedTools", "Reset Tool Confirmations"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    run(accessor) {
      accessor.get(ILanguageModelToolsConfirmationService).resetToolAutoConfirmation();
      accessor.get(INotificationService).info(localize("resetTrustedToolsSuccess", "Tool confirmation preferences have been reset."));
    }
  });
  registerAction2(class GenerateInstructionsAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
        title: localize2("generateInstructions", "Generate Agent Instructions"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/init",
        isPartialQuery: false
      });
    }
  });
  registerAction2(class GenerateInstructionAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
        title: localize2("generateOnDemandInstructions", "Generate On-Demand Instructions"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-instructions ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class GeneratePromptAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_PROMPT_COMMAND_ID,
        title: localize2("generatePrompt", "Generate Prompt File"),
        shortTitle: localize2("generatePrompt.short", "Generate Prompt"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-prompt ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class GenerateSkillAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_SKILL_COMMAND_ID,
        title: localize2("generateSkill", "Generate Skill"),
        shortTitle: localize2("generateSkill.short", "Generate Skill"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-skill ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class GenerateAgentAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_AGENT_COMMAND_ID,
        title: localize2("generateAgent", "Generate Custom Agent"),
        shortTitle: localize2("generateAgent.short", "Generate Agent"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-agent ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class GenerateHookAction extends Action2 {
    constructor() {
      super({
        id: GENERATE_HOOK_COMMAND_ID,
        title: localize2("generateHook", "Generate Hook"),
        shortTitle: localize2("generateHook.short", "Generate Hook"),
        category: CHAT_CATEGORY,
        icon: Codicon.sparkle,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        mode: "agent",
        query: "/create-hook ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class InsertForkConversationSlashCommandAction extends Action2 {
    constructor() {
      super({
        id: INSERT_FORK_CONVERSATION_COMMAND_ID,
        title: localize2("insertForkConversationSlashCommand", "Insert Fork Command"),
        shortTitle: localize2("insertForkConversationSlashCommand.short", "Insert /fork"),
        category: CHAT_CATEGORY,
        icon: Codicon.repoForked,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        query: "/fork ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class InsertTroubleshootSlashCommandAction extends Action2 {
    constructor() {
      super({
        id: INSERT_TROUBLESHOOT_COMMAND_ID,
        title: localize2("insertTroubleshootSlashCommand", "Insert Troubleshoot Command"),
        shortTitle: localize2("insertTroubleshootSlashCommand.short", "Insert /troubleshoot"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      await commandService.executeCommand("workbench.action.chat.open", {
        query: "/troubleshoot ",
        isPartialQuery: true
      });
    }
  });
  registerAction2(class OpenChatFeatureSettingsAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.openFeatureSettings",
        title: localize2("openChatFeatureSettings", "Chat Settings"),
        shortTitle: localize("openChatFeatureSettings.short", "Chat Settings"),
        category: CHAT_CATEGORY,
        f1: true,
        precondition: ChatContextKeys.enabled,
        menu: [
          {
            id: CHAT_CONFIG_MENU_ID,
            when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
            order: 15,
            group: "3_configure"
          },
          {
            id: MenuId.ChatWelcomeContext,
            group: "2_settings",
            order: 1
          },
          {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
            order: 15,
            group: "3_configure"
          }
        ]
      });
    }
    async run(accessor) {
      const preferencesService = accessor.get(IPreferencesService);
      preferencesService.openSettings({ query: "@feature:chat " });
    }
  });
  MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
    command: {
      id: AICustomizationManagementCommands.OpenEditor,
      title: localize2("openChatCustomizations", "Open Customizations"),
      category: CHAT_CATEGORY,
      icon: Codicon.gear
    },
    group: "navigation",
    when: ContextKeyExpr.and(
      ChatContextKeys.enabled,
      ContextKeyExpr.equals("view", ChatViewId)
    ),
    order: 6
  });
}
function stringifyItem(item, includeName = true) {
  if (isRequestVM(item)) {
    return (includeName ? `${item.username}: ` : "") + item.messageText;
  } else {
    return (includeName ? `${item.username}: ` : "") + item.response.toString();
  }
}
function computeToolEnablementMap(options) {
  const { allTools, allToolSets, toolsInclude, toolsExclude } = options;
  const enablementMap = /* @__PURE__ */ new Map();
  const matchedIdentifiers = /* @__PURE__ */ new Set();
  const toolMatches = (tool, identifiers) => {
    if (identifiers.has(tool.id)) {
      matchedIdentifiers.add(tool.id);
      return true;
    }
    if (tool.toolReferenceName && identifiers.has(tool.toolReferenceName)) {
      matchedIdentifiers.add(tool.toolReferenceName);
      return true;
    }
    return false;
  };
  const toolSetMatches = (toolSet, identifiers) => {
    if (identifiers.has(toolSet.id)) {
      matchedIdentifiers.add(toolSet.id);
      return true;
    }
    if (identifiers.has(toolSet.referenceName)) {
      matchedIdentifiers.add(toolSet.referenceName);
      return true;
    }
    return false;
  };
  const explicitlyIncludedTools = /* @__PURE__ */ new Set();
  if (toolsInclude) {
    const includeSet = new Set(toolsInclude);
    for (const toolSet of allToolSets) {
      if (toolSetMatches(toolSet, includeSet)) {
        for (const tool of toolSet.getTools()) {
          enablementMap.set(tool, true);
        }
      }
    }
    for (const tool of allTools) {
      if (toolMatches(tool, includeSet)) {
        enablementMap.set(tool, true);
        explicitlyIncludedTools.add(tool);
      } else if (!enablementMap.has(tool)) {
        enablementMap.set(tool, false);
      }
    }
    for (const toolSet of allToolSets) {
      for (const tool of toolSet.getTools()) {
        if (toolMatches(tool, includeSet)) {
          enablementMap.set(tool, true);
          explicitlyIncludedTools.add(tool);
        } else if (!enablementMap.has(tool)) {
          enablementMap.set(tool, false);
        }
      }
    }
  } else {
    for (const tool of allTools) {
      enablementMap.set(tool, true);
    }
    for (const toolSet of allToolSets) {
      for (const tool of toolSet.getTools()) {
        enablementMap.set(tool, true);
      }
    }
  }
  if (toolsExclude) {
    const excludeSet = new Set(toolsExclude);
    for (const toolSet of allToolSets) {
      if (toolSetMatches(toolSet, excludeSet)) {
        for (const tool of toolSet.getTools()) {
          if (!explicitlyIncludedTools.has(tool)) {
            enablementMap.set(tool, false);
          }
        }
      }
    }
    for (const tool of allTools) {
      if (toolMatches(tool, excludeSet)) {
        enablementMap.set(tool, false);
      }
    }
    for (const toolSet of allToolSets) {
      for (const tool of toolSet.getTools()) {
        if (toolMatches(tool, excludeSet)) {
          enablementMap.set(tool, false);
        }
      }
    }
  }
  const allIdentifiers = /* @__PURE__ */ new Set([...toolsInclude ?? [], ...toolsExclude ?? []]);
  const unknownIdentifiers = [];
  for (const identifier of allIdentifiers) {
    if (!matchedIdentifiers.has(identifier)) {
      unknownIdentifiers.push(identifier);
    }
  }
  const enabledToolCount = Array.from(enablementMap.entries()).filter(([item, enabled]) => enabled && !isToolSet(item)).length;
  if (enabledToolCount === 0) {
    throw new Error("Tool filtering resulted in zero enabled tools. At least one tool must be enabled.");
  }
  for (const toolSet of allToolSets) {
    const toolSetTools = Array.from(toolSet.getTools());
    const allToolsEnabled = toolSetTools.length > 0 && toolSetTools.every((t) => enablementMap.get(t) === true);
    enablementMap.set(toolSet, allToolsEnabled);
  }
  return { enablementMap: ToolAndToolSetEnablementMap.fromMap(enablementMap), unknownIdentifiers };
}
async function handleCurrentEditingSession(model, phrase, dialogService) {
  return showClearEditingSessionConfirmation(model, dialogService, { messageOverride: phrase });
}
async function handleModeSwitch(accessor, fromMode, toMode, requestCount, model) {
  if (!model?.editingSession || fromMode === toMode) {
    return { needToClearSession: false };
  }
  const dialogService = accessor.get(IDialogService);
  const needToClearEdits = (fromMode === ChatModeKind.Edit || toMode === ChatModeKind.Edit) && requestCount > 0;
  if (needToClearEdits) {
    const phrase = localize("switchMode.confirmPhrase", "Switching agents will end your current edit session.");
    const currentEdits = model.editingSession.entries.get();
    const undecidedEdits = currentEdits.filter((edit) => edit.state.get() === ModifiedFileEntryState.Modified);
    if (undecidedEdits.length > 0) {
      if (!await handleCurrentEditingSession(model, phrase, dialogService)) {
        return false;
      }
      return { needToClearSession: true };
    } else {
      const confirmation = await dialogService.confirm({
        title: localize("agent.newSession", "Start new session?"),
        message: localize("agent.newSessionMessage", "Changing the agent will end your current edit session. Would you like to change the agent?"),
        primaryButton: localize("agent.newSession.confirm", "Yes"),
        type: "info"
      });
      if (!confirmation.confirmed) {
        return false;
      }
      return { needToClearSession: true };
    }
  }
  return { needToClearSession: false };
}
async function clearChatSessionPreservingType(accessor, widget, sessionType) {
  const viewsService = accessor.get(IViewsService);
  const storageService = accessor.get(IStorageService);
  const currentResource = widget.viewModel?.model.sessionResource;
  const currentSessionType = currentResource ? getChatSessionType(currentResource) : void 0;
  const { sessionType: newSessionType, isPreferCopilotHarnessSwap } = resolveDefaultNewChatSessionType(accessor, { explicitOverride: sessionType, currentSessionType });
  if (isIChatViewViewContext(widget.viewContext)) {
    const view = await viewsService.openView(ChatViewId);
    if (newSessionType !== localChatSessionType) {
      await view.loadSession(URI.from({ scheme: newSessionType, path: `/untitled-${generateUuid()}` }));
      if (isPreferCopilotHarnessSwap) {
        markPreferredCopilotHarness(storageService);
      }
    } else {
      await view.startNewLocalSession();
    }
  } else {
    await widget.clear(newSessionType);
    if (isPreferCopilotHarnessSwap) {
      markPreferredCopilotHarness(storageService);
    }
  }
}
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  submenu: MenuId.ChatTextEditorMenu,
  group: "1_chat",
  order: 5,
  title: localize("generateCode", "Generate Code"),
  when: ContextKeyExpr.and(
    ChatContextKeys.Setup.hidden.negate(),
    ChatContextKeys.Setup.disabledInWorkspace.negate()
  )
});
registerAction2(class ToggleDefaultVisibilityAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.toggleDefaultVisibility",
      title: localize2("chat.toggleDefaultVisibility.label", "Show View by Default"),
      toggled: ContextKeyExpr.equals("config.workbench.secondarySideBar.defaultVisibility", "hidden").negate(),
      f1: false,
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("view", ChatViewId),
          ChatContextKeys.panelLocation.isEqualTo(ViewContainerLocation.AuxiliaryBar)
        ),
        order: 0,
        group: "5_configure"
      }
    });
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const currentValue = configurationService.getValue("workbench.secondarySideBar.defaultVisibility");
    configurationService.updateValue("workbench.secondarySideBar.defaultVisibility", currentValue !== "hidden" ? "hidden" : "visible");
  }
});
registerAction2(class EditToolApproval extends Action2 {
  constructor() {
    super({
      id: "workbench.action.chat.editToolApproval",
      title: localize2("chat.editToolApproval.label", "Manage Tool Approval"),
      metadata: {
        description: localize2("chat.editToolApproval.description", "Edit/manage the tool approval and confirmation preferences for AI chat agents.")
      },
      precondition: ChatContextKeys.enabled,
      f1: true,
      category: CHAT_CATEGORY
    });
  }
  async run(accessor, scope) {
    const confirmationService = accessor.get(ILanguageModelToolsConfirmationService);
    const toolsService = accessor.get(ILanguageModelToolsService);
    confirmationService.manageConfirmationPreferences([...toolsService.getAllToolsIncludingDisabled()], scope ? { defaultScope: scope } : void 0);
  }
});
export {
  ACTION_ID_NEW_CHAT,
  ACTION_ID_NEW_EDIT_SESSION,
  ACTION_ID_OPEN_CHAT,
  CHAT_CATEGORY,
  CHAT_CONFIG_MENU_ID,
  CHAT_OPEN_ACTION_ID,
  CHAT_SETUP_ACTION_ID,
  CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID,
  GENERATE_AGENT_COMMAND_ID,
  GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID,
  GENERATE_HOOK_COMMAND_ID,
  GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID,
  GENERATE_PROMPT_COMMAND_ID,
  GENERATE_SKILL_COMMAND_ID,
  INSERT_FORK_CONVERSATION_COMMAND_ID,
  INSERT_TROUBLESHOOT_COMMAND_ID,
  ModeOpenChatGlobalAction,
  clearChatSessionPreservingType,
  computeToolEnablementMap,
  getOpenChatActionIdForMode,
  handleCurrentEditingSession,
  handleModeSwitch,
  registerChatActions,
  stringifyItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgc2FmZUludGwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElDb21tYW5kUGFsZXR0ZU9wdGlvbnMsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc0xpbnV4Q29udGV4dCwgSXNXaW5kb3dzQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IEdpdEh1YlBhdGhzLCBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGl2ZUVkaXRvckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgQVVYX1dJTkRPV19HUk9VUCwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRVhURU5TSU9OU19DQVRFR09SWSwgSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlQ29udGVudFByb3ZpZGVyLCBTY21IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVXJpRmllbGRzIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2Jyb3dzZXIvc2NtSGlzdG9yeUNoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFJlc3VsdCwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCwgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSwgSUNoYXRNb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBFbGljaXRhdGlvblN0YXRlLCBJQ2hhdFNlcnZpY2UsIElDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VWYXJpYWJsZUVudHJ5LCBJU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0Vmlld01vZGVsLCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBpc1JlcXVlc3RWTSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vd2lkZ2V0L2NoYXRXaWRnZXRIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uUmVzb3VyY2UsIHJlc29sdmVEZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBtYXJrUHJlZmVycmVkQ29waWxvdEhhcm5lc3MgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25UeXBlUHJlZmVyZW5jZS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMgfSBmcm9tICcuLi9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3RvciwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDb3BpbG90VXNhZ2VFeHRlbnNpb25GZWF0dXJlSWQgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbFN0YXRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sRGF0YSwgSVRvb2xTZXQsIGlzVG9vbFNldCwgVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdJZCwgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSwgaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3IuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvcklucHV0LCBzaG93Q2xlYXJFZGl0aW5nU2Vzc2lvbkNvbmZpcm1hdGlvbiB9IGZyb20gJy4uL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgY29udmVydEJ1ZmZlclRvU2NyZWVuc2hvdFZhcmlhYmxlIH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdFNjcmVlbnNob3RDb250ZXh0LmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdQYW5lIH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvdmlld1BhbmUvY2hhdFZpZXdQYW5lLmpzJztcblxuZXhwb3J0IGNvbnN0IENIQVRfQ0FURUdPUlkgPSBsb2NhbGl6ZTIoJ2NoYXQuY2F0ZWdvcnknLCAnQ2hhdCcpO1xuXG5jb25zdCBDT1BJTE9UX0NMSV9BR0VOVF9IT1NUX1BST1ZJREVSX0lEID0gJ2NvcGlsb3RjbGknO1xuXG5leHBvcnQgY29uc3QgQUNUSU9OX0lEX05FV19DSEFUID0gYHdvcmtiZW5jaC5hY3Rpb24uY2hhdC5uZXdDaGF0YDtcbmV4cG9ydCBjb25zdCBBQ1RJT05fSURfTkVXX0VESVRfU0VTU0lPTiA9IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQubmV3RWRpdFNlc3Npb25gO1xuZXhwb3J0IGNvbnN0IEFDVElPTl9JRF9PUEVOX0NIQVQgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuQ2hhdCc7XG5leHBvcnQgY29uc3QgQ0hBVF9PUEVOX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbic7XG5leHBvcnQgY29uc3QgQ0hBVF9TRVRVUF9BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cCc7XG5leHBvcnQgY29uc3QgQ0hBVF9TRVRVUF9TVVBQT1JUX0FOT05ZTU9VU19BQ1RJT05fSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cFN1cHBvcnRBbm9ueW1vdXNBY3Rpb24nO1xuY29uc3QgVE9HR0xFX0NIQVRfQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50b2dnbGUnO1xuXG5leHBvcnQgY29uc3QgR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmdlbmVyYXRlQWdlbnRJbnN0cnVjdGlvbnMnO1xuZXhwb3J0IGNvbnN0IEdFTkVSQVRFX09OX0RFTUFORF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZ2VuZXJhdGVPbkRlbWFuZEluc3RydWN0aW9ucyc7XG5leHBvcnQgY29uc3QgR0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmdlbmVyYXRlUHJvbXB0JztcbmV4cG9ydCBjb25zdCBHRU5FUkFURV9TS0lMTF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5nZW5lcmF0ZVNraWxsJztcbmV4cG9ydCBjb25zdCBHRU5FUkFURV9BR0VOVF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5nZW5lcmF0ZUFnZW50JztcbmV4cG9ydCBjb25zdCBHRU5FUkFURV9IT09LX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmdlbmVyYXRlSG9vayc7XG5leHBvcnQgY29uc3QgSU5TRVJUX0ZPUktfQ09OVkVSU0FUSU9OX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc2VydEZvcmtDb252ZXJzYXRpb25Db21tYW5kJztcbmV4cG9ydCBjb25zdCBJTlNFUlRfVFJPVUJMRVNIT09UX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc2VydFRyb3VibGVzaG9vdENvbW1hbmQnO1xuXG5jb25zdCBkZWZhdWx0Q2hhdCA9IHtcblx0cHJvdmlkZXI6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJvdmlkZXIgPz8geyBlbnRlcnByaXNlOiB7IGlkOiAnJyB9IH0sXG5cdGNvbXBsZXRpb25zQWR2YW5jZWRTZXR0aW5nOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNvbXBsZXRpb25zQWR2YW5jZWRTZXR0aW5nID8/ICcnLFxuXHRjb21wbGV0aW9uc01lbnVDb21tYW5kOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNvbXBsZXRpb25zTWVudUNvbW1hbmQgPz8gJycsXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Vmlld09wZW5PcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSBxdWVyeSBmb3IgY2hhdC5cblx0ICovXG5cdHF1ZXJ5OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBxdWVyeSBpcyBwYXJ0aWFsIGFuZCB3aWxsIGF3YWl0IG1vcmUgaW5wdXQgZnJvbSB0aGUgdXNlci5cblx0ICovXG5cdGlzUGFydGlhbFF1ZXJ5PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEEgbGlzdCBvZiB0b29scyBJRHMgd2l0aCBgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHRgIHRoYXQgd2lsbCBiZSByZXNvbHZlZCBhbmQgYXR0YWNoZWQgaWYgdGhleSBleGlzdC5cblx0ICovXG5cdHRvb2xJZHM/OiBzdHJpbmdbXTtcblx0LyoqXG5cdCAqIEFueSBwcmV2aW91cyBjaGF0IHJlcXVlc3RzIGFuZCByZXNwb25zZXMgdGhhdCBzaG91bGQgYmUgc2hvd24gaW4gdGhlIGNoYXQgdmlldy5cblx0ICovXG5cdHByZXZpb3VzUmVxdWVzdHM/OiBJQ2hhdFZpZXdPcGVuUmVxdWVzdEVudHJ5W107XG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgc2NyZWVuc2hvdCBvZiB0aGUgZm9jdXNlZCB3aW5kb3cgc2hvdWxkIGJlIHRha2VuIGFuZCBhdHRhY2hlZFxuXHQgKi9cblx0YXR0YWNoU2NyZWVuc2hvdD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBBIGxpc3Qgb2YgZmlsZSBVUklzIHRvIGF0dGFjaCB0byB0aGUgY2hhdCBhcyBjb250ZXh0LlxuXHQgKi9cblx0YXR0YWNoRmlsZXM/OiAoVVJJIHwgeyB1cmk6IFVSSTsgcmFuZ2U6IElSYW5nZSB9KVtdO1xuXHQvKipcblx0ICogQSBsaXN0IG9mIHNvdXJjZSBjb250cm9sIGhpc3RvcnkgaXRlbSBjaGFuZ2VzIHRvIGF0dGFjaCB0byB0aGUgY2hhdCBhcyBjb250ZXh0LlxuXHQgKi9cblx0YXR0YWNoSGlzdG9yeUl0ZW1DaGFuZ2VzPzogeyB1cmk6IFVSSTsgaGlzdG9yeUl0ZW1JZDogc3RyaW5nIH1bXTtcblx0LyoqXG5cdCAqIEEgbGlzdCBvZiBzb3VyY2UgY29udHJvbCBoaXN0b3J5IGl0ZW0gY2hhbmdlIHJhbmdlcyB0byBhdHRhY2ggdG8gdGhlIGNoYXQgYXMgY29udGV4dC5cblx0ICovXG5cdGF0dGFjaEhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2VzPzoge1xuXHRcdHN0YXJ0OiB7IHVyaTogVVJJOyBoaXN0b3J5SXRlbUlkOiBzdHJpbmcgfTtcblx0XHRlbmQ6IHsgdXJpOiBVUkk7IGhpc3RvcnlJdGVtSWQ6IHN0cmluZyB9O1xuXHR9W107XG5cdC8qKlxuXHQgKiBUaGUgbW9kZSBJRCBvciBuYW1lIHRvIG9wZW4gdGhlIGNoYXQgaW4uXG5cdCAqL1xuXHRtb2RlPzogQ2hhdE1vZGVLaW5kIHwgc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgbGFuZ3VhZ2UgbW9kZWwgc2VsZWN0b3IgdG8gdXNlIGZvciB0aGUgY2hhdC5cblx0ICogQW4gRXJyb3Igd2lsbCBiZSB0aHJvd24gaWYgdGhlcmUncyBubyBtYXRjaC4gSWYgdGhlcmUgYXJlIG11bHRpcGxlXG5cdCAqIG1hdGNoZXMsIHRoZSBmaXJzdCBtYXRjaCB3aWxsIGJlIHVzZWQuXG5cdCAqXG5cdCAqIEV4YW1wbGVzOlxuXHQgKlxuXHQgKiBgYGBcblx0ICoge1xuXHQgKiAgIGlkOiAnY2xhdWRlLXNvbm5ldC00Jyxcblx0ICogICB2ZW5kb3I6ICdjb3BpbG90J1xuXHQgKiB9XG5cdCAqIGBgYFxuXHQgKlxuXHQgKiBVc2UgYGNsYXVkZS1zb25uZXQtNGAgZnJvbSBhbnkgdmVuZG9yOlxuXHQgKlxuXHQgKiBgYGBcblx0ICoge1xuXHQgKiAgIGlkOiAnY2xhdWRlLXNvbm5ldC00Jyxcblx0ICogfVxuXHQgKiBgYGBcblx0ICovXG5cdG1vZGVsU2VsZWN0b3I/OiBJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3RvcjtcblxuXHQvKipcblx0ICogV2FpdCB0byByZXNvbHZlIHRoZSBjb21tYW5kIHVudGlsIHRoZSBjaGF0IHJlc3BvbnNlIHJlYWNoZXMgYSB0ZXJtaW5hbCBzdGF0ZSAoY29tcGxldGUsIGVycm9yLCBvciBwZW5kaW5nIHVzZXIgY29uZmlybWF0aW9uLCBldGMuKS5cblx0ICovXG5cdGJsb2NrT25SZXNwb25zZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEEgbGlzdCBvZiB0b29sIGlkZW50aWZpZXJzIHRvIGluY2x1ZGUuIFdoZW4gc3BlY2lmaWVkIGFsb25lLCBvbmx5IHRoZXNlIHRvb2xzIHdpbGwgYmUgZW5hYmxlZC5cblx0ICogSWRlbnRpZmllcnMgY2FuIGJlIHRvb2wgSURzLCB0b29sIHJlZmVyZW5jZSBuYW1lcyAoYHRvb2xSZWZlcmVuY2VOYW1lYCksXG5cdCAqIHRvb2xzZXQgSURzLCBvciB0b29sc2V0IHJlZmVyZW5jZSBuYW1lcyAoYHJlZmVyZW5jZU5hbWVgKS5cblx0ICogV2hlbiBhIHRvb2xzZXQgaWRlbnRpZmllciBtYXRjaGVzLCBhbGwgdG9vbHMgaW4gdGhhdCB0b29sc2V0IGFyZSBpbmNsdWRlZC5cblx0ICogQ2FuIGJlIGNvbWJpbmVkIHdpdGggYHRvb2xzRXhjbHVkZWAgZm9yIGZpbmUtZ3JhaW5lZCBjb250cm9sLlxuXHQgKi9cblx0dG9vbHNJbmNsdWRlPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIEEgbGlzdCBvZiB0b29sIGlkZW50aWZpZXJzIHRvIGV4Y2x1ZGUuIFdoZW4gc3BlY2lmaWVkIGFsb25lLCBhbGwgdG9vbHMgZXhjZXB0IHRoZXNlIHdpbGwgYmUgZW5hYmxlZC5cblx0ICogSWRlbnRpZmllcnMgY2FuIGJlIHRvb2wgSURzLCB0b29sIHJlZmVyZW5jZSBuYW1lcyAoYHRvb2xSZWZlcmVuY2VOYW1lYCksXG5cdCAqIHRvb2xzZXQgSURzLCBvciB0b29sc2V0IHJlZmVyZW5jZSBuYW1lcyAoYHJlZmVyZW5jZU5hbWVgKS5cblx0ICogV2hlbiBhIHRvb2xzZXQgaWRlbnRpZmllciBtYXRjaGVzLCBhbGwgdG9vbHMgaW4gdGhhdCB0b29sc2V0IGFyZSBleGNsdWRlZC5cblx0ICogQ2FuIGJlIGNvbWJpbmVkIHdpdGggYHRvb2xzSW5jbHVkZWAgLSBleGNsdXNpb25zIGFyZSBhcHBsaWVkIGFmdGVyIGluY2x1c2lvbnMuXG5cdCAqIEV4cGxpY2l0IHRvb2wgcmVmZXJlbmNlcyBpbiBgdG9vbHNJbmNsdWRlYCBvdmVycmlkZSB0b29sc2V0IGV4Y2x1c2lvbnMsXG5cdCAqIGJ1dCBleHBsaWNpdCB0b29sIGV4Y2x1c2lvbnMgYWx3YXlzIHdpbi5cblx0ICovXG5cdHRvb2xzRXhjbHVkZT86IHN0cmluZ1tdO1xuXG5cdC8qKlxuXHQgKiBTdWJtaXRzIGBxdWVyeWAgd2l0aG91dCB0YWtpbmcgb3ZlciB0aGUgaW5wdXQgYm94LCBrZWVwaW5nIGFueSBkcmFmdCB0aGUgdXNlclxuXHQgKiBoYXMgdHlwZWQgYW5kIG9taXR0aW5nIGl0cyBhdHRhY2htZW50cyBmcm9tIHRoZSByZXF1ZXN0LiBGb3IgbWFpbnRlbmFuY2Vcblx0ICogY29tbWFuZHMgc3VjaCBhcyBgL2NvbXBhY3RgIHRoYXQgYXJlIG5vdCB1c2VyIG1lc3NhZ2VzLlxuXHQgKlxuXHQgKiBNdXR1YWxseSBleGNsdXNpdmUgd2l0aCBgYXR0YWNoU2NyZWVuc2hvdGAsIGBhdHRhY2hGaWxlc2AsXG5cdCAqIGBhdHRhY2hIaXN0b3J5SXRlbUNoYW5nZXNgLCBgYXR0YWNoSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZXNgIGFuZCBgdG9vbElkc2A6XG5cdCAqIHRob3NlIGF0dGFjaCBjb250ZXh0IHZpYSB0aGUgaW5wdXQgYm94LCB3aGljaCB0aGlzIG9wdGlvbiBkZWxpYmVyYXRlbHlcblx0ICogZXhjbHVkZXMgZnJvbSB0aGUgcmVxdWVzdC5cblx0ICovXG5cdHByZXNlcnZlSW5wdXQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Vmlld09wZW5SZXF1ZXN0RW50cnkge1xuXHRyZXF1ZXN0OiBzdHJpbmc7XG5cdHJlc3BvbnNlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBDSEFUX0NPTkZJR19NRU5VX0lEID0gbmV3IE1lbnVJZCgnd29ya2JlbmNoLmNoYXQubWVudS5jb25maWcnKTtcblxuY29uc3QgT1BFTl9DSEFUX1FVT1RBX0VYQ0VFREVEX0RJQUxPRyA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblF1b3RhRXhjZWVkZWREaWFsb2cnO1xuXG5hYnN0cmFjdCBjbGFzcyBPcGVuQ2hhdEdsb2JhbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihvdmVycmlkZXM6IFBpY2s8SUNvbW1hbmRQYWxldHRlT3B0aW9ucywgJ2tleWJpbmRpbmcnIHwgJ3RpdGxlJyB8ICdpZCcgfCAnbWVudSc+LCBwcml2YXRlIHJlYWRvbmx5IG1vZGU/OiBJQ2hhdE1vZGUpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vdmVycmlkZXMsXG5cdFx0XHRpY29uOiBDb2RpY29uLmNoYXRTcGFya2xlLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLFxuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSxcblx0XHRcdClcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3B0cz86IHN0cmluZyB8IElDaGF0Vmlld09wZW5PcHRpb25zKTogUHJvbWlzZTxJQ2hhdEFnZW50UmVzdWx0ICYgeyB0eXBlPzogJ2NvbmZpcm1hdGlvbicgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdG9wdHMgPSB0eXBlb2Ygb3B0cyA9PT0gJ3N0cmluZycgPyB7IHF1ZXJ5OiBvcHRzIH0gOiBvcHRzO1xuXG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgdG9vbHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNoYXRBZ2VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRBZ2VudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRjb25zdCBzY21TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTQ01TZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0bGV0IGNoYXRXaWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdC8vIFdoZW4gdGhpcyB3YXMgaW52b2tlZCB0byBzd2l0Y2ggdG8gYSBtb2RlIHZpYSBrZXliaW5kaW5nLCBhbmQgc29tZSBjaGF0IHdpZGdldCBpcyBmb2N1c2VkLCB1c2UgdGhhdCBvbmUuXG5cdFx0Ly8gT3RoZXJ3aXNlLCBvcGVuIHRoZSB2aWV3LlxuXHRcdGlmICghdGhpcy5tb2RlIHx8ICFjaGF0V2lkZ2V0IHx8ICFpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGNoYXRXaWRnZXQuZG9tTm9kZSkpIHtcblx0XHRcdGNoYXRXaWRnZXQgPSBhd2FpdCB3aWRnZXRTZXJ2aWNlLnJldmVhbFdpZGdldCgpO1xuXHRcdH1cblxuXHRcdGlmICghY2hhdFdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN3aXRjaFRvTW9kZSA9IG9wdHM/Lm1vZGUgPyBjaGF0V2lkZ2V0LmlucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCkuZmluZE1vZGVCeU5hbWUob3B0cy5tb2RlKSA6IHRoaXMubW9kZTtcblx0XHRpZiAoc3dpdGNoVG9Nb2RlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmhhbmRsZVN3aXRjaFRvTW9kZShzd2l0Y2hUb01vZGUsIGNoYXRXaWRnZXQsIGluc3RhU2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRzPy5tb2RlbFNlbGVjdG9yKSB7XG5cdFx0XHRjb25zdCBpZHMgPSBhd2FpdCBsYW5ndWFnZU1vZGVsU2VydmljZS5zZWxlY3RMYW5ndWFnZU1vZGVscyhvcHRzLm1vZGVsU2VsZWN0b3IpO1xuXHRcdFx0Y29uc3QgaWQgPSBpZHMuc29ydCgpLmF0KDApO1xuXHRcdFx0aWYgKCFpZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGxhbmd1YWdlIG1vZGVscyBmb3VuZCBtYXRjaGluZyBzZWxlY3RvcjogJHtKU09OLnN0cmluZ2lmeShvcHRzLm1vZGVsU2VsZWN0b3IpfS5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBsYW5ndWFnZU1vZGVsU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKGlkKTtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZSBtb2RlbCBub3QgbG9hZGVkOiAke2lkfS5gKTtcblx0XHRcdH1cblxuXHRcdFx0Y2hhdFdpZGdldC5pbnB1dC5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbCh7IG1ldGFkYXRhOiBtb2RlbCwgaWRlbnRpZmllcjogaWQgfSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdHM/LnRvb2xzSW5jbHVkZSB8fCBvcHRzPy50b29sc0V4Y2x1ZGUpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY2hhdFdpZGdldC5pbnB1dC5zZWxlY3RlZExhbmd1YWdlTW9kZWwuZ2V0KCk/Lm1ldGFkYXRhO1xuXHRcdFx0Y29uc3QgYWxsVG9vbHMgPSBBcnJheS5mcm9tKHRvb2xzU2VydmljZS5nZXRUb29scyhtb2RlbCkpO1xuXHRcdFx0Y29uc3QgYWxsVG9vbFNldHMgPSBBcnJheS5mcm9tKHRvb2xzU2VydmljZS5nZXRUb29sU2V0c0Zvck1vZGVsKG1vZGVsKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVUb29sRW5hYmxlbWVudE1hcCh7XG5cdFx0XHRcdGFsbFRvb2xzLFxuXHRcdFx0XHRhbGxUb29sU2V0cyxcblx0XHRcdFx0dG9vbHNJbmNsdWRlOiBvcHRzLnRvb2xzSW5jbHVkZSxcblx0XHRcdFx0dG9vbHNFeGNsdWRlOiBvcHRzLnRvb2xzRXhjbHVkZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgcmVzdWx0LnVua25vd25JZGVudGlmaWVycykge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFRvb2wgZmlsdGVyaW5nOiBVbmtub3duIGlkZW50aWZpZXIgJyR7aWRlbnRpZmllcn0nIC0gbm8gbWF0Y2hpbmcgdG9vbCBvciB0b29sc2V0IGZvdW5kLmApO1xuXHRcdFx0fVxuXG5cdFx0XHRjaGF0V2lkZ2V0LmlucHV0LnNlbGVjdGVkVG9vbHNNb2RlbC5zZXQocmVzdWx0LmVuYWJsZW1lbnRNYXAsIHRydWUpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRzPy5wcmV2aW91c1JlcXVlc3RzPy5sZW5ndGggJiYgY2hhdFdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdGZvciAoY29uc3QgeyByZXF1ZXN0LCByZXNwb25zZSB9IG9mIG9wdHMucHJldmlvdXNSZXF1ZXN0cykge1xuXHRcdFx0XHRjaGF0U2VydmljZS5hZGRDb21wbGV0ZVJlcXVlc3QoY2hhdFdpZGdldC52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0LCB1bmRlZmluZWQsIDAsIHsgbWVzc2FnZTogcmVzcG9uc2UgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChvcHRzPy5hdHRhY2hTY3JlZW5zaG90KSB7XG5cdFx0XHRjb25zdCBzY3JlZW5zaG90ID0gYXdhaXQgaG9zdFNlcnZpY2UuZ2V0U2NyZWVuc2hvdCgpO1xuXHRcdFx0aWYgKHNjcmVlbnNob3QpIHtcblx0XHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dChjb252ZXJ0QnVmZmVyVG9TY3JlZW5zaG90VmFyaWFibGUoc2NyZWVuc2hvdCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAob3B0cz8uYXR0YWNoRmlsZXMpIHtcblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBvcHRzLmF0dGFjaEZpbGVzKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IGZpbGUgaW5zdGFuY2VvZiBVUkkgPyBmaWxlIDogZmlsZS51cmk7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gZmlsZSBpbnN0YW5jZW9mIFVSSSA/IHVuZGVmaW5lZCA6IGZpbGUucmFuZ2U7XG5cblx0XHRcdFx0aWYgKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpKSB7XG5cdFx0XHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkRmlsZSh1cmksIHJhbmdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAob3B0cz8uYXR0YWNoSGlzdG9yeUl0ZW1DaGFuZ2VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGhpc3RvcnlJdGVtQ2hhbmdlIG9mIG9wdHMuYXR0YWNoSGlzdG9yeUl0ZW1DaGFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBzY21TZXJ2aWNlLmdldFJlcG9zaXRvcnkoVVJJLmZpbGUoaGlzdG9yeUl0ZW1DaGFuZ2UudXJpLnBhdGgpKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdFx0XHRpZiAoIWhpc3RvcnlQcm92aWRlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXIucmVzb2x2ZUhpc3RvcnlJdGVtKGhpc3RvcnlJdGVtQ2hhbmdlLmhpc3RvcnlJdGVtSWQpO1xuXHRcdFx0XHRpZiAoIWhpc3RvcnlJdGVtKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KHtcblx0XHRcdFx0XHRpZDogaGlzdG9yeUl0ZW1DaGFuZ2UudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogYCR7YmFzZW5hbWUoaGlzdG9yeUl0ZW1DaGFuZ2UudXJpKX1gLFxuXHRcdFx0XHRcdHZhbHVlOiBoaXN0b3J5SXRlbUNoYW5nZS51cmksXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW06IGhpc3RvcnlJdGVtLFxuXHRcdFx0XHRcdGtpbmQ6ICdzY21IaXN0b3J5SXRlbUNoYW5nZSdcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVNDTUhpc3RvcnlJdGVtQ2hhbmdlVmFyaWFibGVFbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChvcHRzPy5hdHRhY2hIaXN0b3J5SXRlbUNoYW5nZVJhbmdlcykge1xuXHRcdFx0Zm9yIChjb25zdCBoaXN0b3J5SXRlbUNoYW5nZVJhbmdlIG9mIG9wdHMuYXR0YWNoSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHNjbVNlcnZpY2UuZ2V0UmVwb3NpdG9yeShVUkkuZmlsZShoaXN0b3J5SXRlbUNoYW5nZVJhbmdlLmVuZC51cmkucGF0aCkpO1xuXHRcdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSByZXBvc2l0b3J5Py5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0XHRcdGlmICghcmVwb3NpdG9yeSB8fCAhaGlzdG9yeVByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBbaGlzdG9yeUl0ZW1TdGFydCwgaGlzdG9yeUl0ZW1FbmRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdGhpc3RvcnlQcm92aWRlci5yZXNvbHZlSGlzdG9yeUl0ZW0oaGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZS5zdGFydC5oaXN0b3J5SXRlbUlkKSxcblx0XHRcdFx0XHRoaXN0b3J5UHJvdmlkZXIucmVzb2x2ZUhpc3RvcnlJdGVtKGhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2UuZW5kLmhpc3RvcnlJdGVtSWQpLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0aWYgKCFoaXN0b3J5SXRlbVN0YXJ0IHx8ICFoaXN0b3J5SXRlbUVuZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdXJpID0gaGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZS5lbmQudXJpLndpdGgoe1xuXHRcdFx0XHRcdHNjaGVtZTogU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUNvbnRlbnRQcm92aWRlci5zY2hlbWUsXG5cdFx0XHRcdFx0cXVlcnk6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRcdHJlcG9zaXRvcnlJZDogcmVwb3NpdG9yeS5pZCxcblx0XHRcdFx0XHRcdHN0YXJ0OiBoaXN0b3J5SXRlbVN0YXJ0LmlkLFxuXHRcdFx0XHRcdFx0ZW5kOiBoaXN0b3J5SXRlbUNoYW5nZVJhbmdlLmVuZC5oaXN0b3J5SXRlbUlkXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgU2NtSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZVVyaUZpZWxkcylcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCh7XG5cdFx0XHRcdFx0aWQ6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6IGAke2Jhc2VuYW1lKHVyaSl9YCxcblx0XHRcdFx0XHR2YWx1ZTogdXJpLFxuXHRcdFx0XHRcdGhpc3RvcnlJdGVtQ2hhbmdlU3RhcnQ6IHtcblx0XHRcdFx0XHRcdHVyaTogaGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZS5zdGFydC51cmksXG5cdFx0XHRcdFx0XHRoaXN0b3J5SXRlbTogaGlzdG9yeUl0ZW1TdGFydFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1DaGFuZ2VFbmQ6IHtcblx0XHRcdFx0XHRcdHVyaTogaGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZS5lbmQudXJpLFxuXHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW06IHtcblx0XHRcdFx0XHRcdFx0Li4uaGlzdG9yeUl0ZW1FbmQsXG5cdFx0XHRcdFx0XHRcdGRpc3BsYXlJZDogaGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZS5lbmQuaGlzdG9yeUl0ZW1JZFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0a2luZDogJ3NjbUhpc3RvcnlJdGVtQ2hhbmdlUmFuZ2UnXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTQ01IaXN0b3J5SXRlbUNoYW5nZVJhbmdlVmFyaWFibGVFbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHJlc3A6IFByb21pc2U8SUNoYXRSZXNwb25zZU1vZGVsIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChvcHRzPy5xdWVyeSkge1xuXG5cdFx0XHRpZiAob3B0cy5pc1BhcnRpYWxRdWVyeSkge1xuXHRcdFx0XHRjaGF0V2lkZ2V0LmlucHV0LnNob3dTY3JvbGxiYXJVbnRpbEFjY2VwdCgpO1xuXHRcdFx0XHRjaGF0V2lkZ2V0LnNldElucHV0KG9wdHMucXVlcnkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKCFjaGF0V2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShjaGF0V2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01vZGVsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB3YWl0Rm9yRGVmYXVsdEFnZW50KGNoYXRBZ2VudFNlcnZpY2UsIGNoYXRXaWRnZXQuaW5wdXQuY3VycmVudE1vZGVLaW5kKTtcblx0XHRcdFx0aWYgKG9wdHMucHJlc2VydmVJbnB1dCkge1xuXHRcdFx0XHRcdC8vIFN1Ym1pdCB0aGUgcXVlcnkgZGlyZWN0bHkgc28gdGhlIHVzZXIncyBkcmFmdCBpcyBuZXZlciBvdmVyd3JpdHRlbi5cblx0XHRcdFx0XHRyZXNwID0gY2hhdFdpZGdldC5hY2NlcHRJbnB1dChvcHRzLnF1ZXJ5LCB7IHByZXNlcnZlSW5wdXQ6IHRydWUgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2hhdFdpZGdldC5zZXRJbnB1dChvcHRzLnF1ZXJ5KTsgLy8gd2FpdCB1bnRpbCB0aGUgbW9kZWwgaXMgcmVzdG9yZWQgYmVmb3JlIHNldHRpbmcgdGhlIGlucHV0LCBvciBpdCB3aWxsIGJlIGNsZWFyZWQgd2hlbiB0aGUgbW9kZWwgaXMgcmVzdG9yZWRcblx0XHRcdFx0XHRyZXNwID0gY2hhdFdpZGdldC5hY2NlcHRJbnB1dCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG9wdHM/LnRvb2xJZHMgJiYgb3B0cy50b29sSWRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgdG9vbElkIG9mIG9wdHMudG9vbElkcykge1xuXHRcdFx0XHRjb25zdCB0b29sID0gdG9vbHNTZXJ2aWNlLmdldFRvb2wodG9vbElkKTtcblx0XHRcdFx0aWYgKHRvb2wpIHtcblx0XHRcdFx0XHRjaGF0V2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KHtcblx0XHRcdFx0XHRcdGlkOiB0b29sLmlkLFxuXHRcdFx0XHRcdFx0bmFtZTogdG9vbC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdGZ1bGxOYW1lOiB0b29sLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGljb246IFRoZW1lSWNvbi5pc1RoZW1lSWNvbih0b29sLmljb24pID8gdG9vbC5pY29uIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0a2luZDogJ3Rvb2wnXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjaGF0V2lkZ2V0LmZvY3VzSW5wdXQoKTtcblxuXHRcdGlmIChvcHRzPy5ibG9ja09uUmVzcG9uc2UpIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVzcDtcblx0XHRcdGlmIChyZXNwb25zZSkge1xuXHRcdFx0XHRjb25zdCBhdXRvUmVwbHlFbmFibGVkID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQXV0b1JlcGx5KTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZCA9IHJlc3BvbnNlLm9uRGlkQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChyZXNwb25zZS5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdFx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgcGVuZGluZ0NvbmZpcm1hdGlvbiA9IHJlc3BvbnNlLmlzUGVuZGluZ0NvbmZpcm1hdGlvbi5nZXQoKTtcblx0XHRcdFx0XHRcdGlmIChwZW5kaW5nQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdC8vIENoZWNrIGlmIHRoZSBwZW5kaW5nIGNvbmZpcm1hdGlvbiBpcyBhIHF1ZXN0aW9uIGNhcm91c2VsIHRoYXQgd2lsbCBiZSBhdXRvLXJlcGxpZWQuXG5cdFx0XHRcdFx0XHRcdC8vIE9ubHkgcXVlc3Rpb24gY2Fyb3VzZWxzIGFyZSBhdXRvLXJlcGxpZWQ7IG90aGVyIGNvbmZpcm1hdGlvbiB0eXBlcyAodG9vbCBhcHByb3ZhbHMsXG5cdFx0XHRcdFx0XHRcdC8vIGVsaWNpdGF0aW9ucywgZXRjLikgc2hvdWxkIGNhdXNlIHVzIHRvIHJlc29sdmUgaW1tZWRpYXRlbHkuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGhhc1BlbmRpbmdRdWVzdGlvbkNhcm91c2VsID0gcmVzcG9uc2UucmVzcG9uc2UudmFsdWUuc29tZShcblx0XHRcdFx0XHRcdFx0XHRwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnICYmICFwYXJ0LmlzVXNlZFxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHRpZiAoYXV0b1JlcGx5RW5hYmxlZCAmJiBoYXNQZW5kaW5nUXVlc3Rpb25DYXJvdXNlbCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIEF1dG8tcmVwbHkgd2lsbCBoYW5kbGUgdGhpcyBxdWVzdGlvbiBjYXJvdXNlbCwga2VlcCB3YWl0aW5nXG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvbkluZm8gPSBnZXRQZW5kaW5nQ29uZmlybWF0aW9uSW5mbyhyZXNwb25zZSk7XG5cdFx0XHRcdGlmIChjb25maXJtYXRpb25JbmZvKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4ucmVzcG9uc2UucmVzdWx0LCAuLi5jb25maXJtYXRpb25JbmZvIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgLi4ucmVzcG9uc2UucmVzdWx0IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlU3dpdGNoVG9Nb2RlKHN3aXRjaFRvTW9kZTogSUNoYXRNb2RlLCBjaGF0V2lkZ2V0OiBJQ2hhdFdpZGdldCwgaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdXJyZW50TW9kZSA9IGNoYXRXaWRnZXQuaW5wdXQuY3VycmVudE1vZGVLaW5kO1xuXG5cdFx0aWYgKHN3aXRjaFRvTW9kZSkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjaGF0V2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWw7XG5cdFx0XHRjb25zdCBjaGF0TW9kZUNoZWNrID0gbW9kZWwgPyBhd2FpdCBpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24oaGFuZGxlTW9kZVN3aXRjaCwgY3VycmVudE1vZGUsIHN3aXRjaFRvTW9kZS5raW5kLCBtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCwgbW9kZWwpIDogeyBuZWVkVG9DbGVhclNlc3Npb246IGZhbHNlIH07XG5cdFx0XHRpZiAoIWNoYXRNb2RlQ2hlY2spIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y2hhdFdpZGdldC5pbnB1dC5zZXRDaGF0TW9kZShzd2l0Y2hUb01vZGUuaWQsIHRydWUsIHRydWUpO1xuXG5cdFx0XHRpZiAoY2hhdE1vZGVDaGVjay5uZWVkVG9DbGVhclNlc3Npb24pIHtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUNUSU9OX0lEX05FV19DSEFUKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckRlZmF1bHRBZ2VudChjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSwgbW9kZTogQ2hhdE1vZGVLaW5kKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGRlZmF1bHRBZ2VudCA9IGNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGUpO1xuXHRpZiAoZGVmYXVsdEFnZW50KSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0YXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRFdmVudC50b1Byb21pc2UoRXZlbnQuZmlsdGVyKGNoYXRBZ2VudFNlcnZpY2Uub25EaWRDaGFuZ2VBZ2VudHMsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZmF1bHRBZ2VudCA9IGNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGUpO1xuXHRcdFx0cmV0dXJuIEJvb2xlYW4oZGVmYXVsdEFnZW50KTtcblx0XHR9KSksXG5cdFx0dGltZW91dCg2MF8wMDApLnRoZW4oKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1RpbWVkIG91dCB3YWl0aW5nIGZvciBkZWZhdWx0IGFnZW50Jyk7IH0pXG5cdF0pO1xufVxuXG4vKipcbiAqIEluZm9ybWF0aW9uIGFib3V0IGEgcGVuZGluZyBjb25maXJtYXRpb24gaW4gYSBjaGF0IHJlc3BvbnNlLlxuICovXG5leHBvcnQgdHlwZSBJQ2hhdFBlbmRpbmdDb25maXJtYXRpb25JbmZvID1cblx0fCB7IHR5cGU6ICdjb25maXJtYXRpb24nOyBraW5kOiAndG9vbEludm9jYXRpb24nOyB0b29sSWQ6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiAnY29uZmlybWF0aW9uJzsga2luZDogJ3Rvb2xQb3N0QXBwcm92YWwnOyB0b29sSWQ6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiAnY29uZmlybWF0aW9uJzsga2luZDogJ2NvbmZpcm1hdGlvbic7IHRpdGxlOiBzdHJpbmc7IGRhdGE6IHVua25vd24gfVxuXHR8IHsgdHlwZTogJ2NvbmZpcm1hdGlvbic7IGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJzsgcXVlc3Rpb25zOiB1bmtub3duW10gfVxuXHR8IHsgdHlwZTogJ2NvbmZpcm1hdGlvbic7IGtpbmQ6ICdlbGljaXRhdGlvbic7IHRpdGxlOiBzdHJpbmcgfTtcblxuLyoqXG4gKiBFeHRyYWN0cyBkZXRhaWxlZCBpbmZvcm1hdGlvbiBhYm91dCB0aGUgcGVuZGluZyBjb25maXJtYXRpb24gZnJvbSBhIGNoYXQgcmVzcG9uc2UuXG4gKiBSZXR1cm5zIHVuZGVmaW5lZCBpZiB0aGVyZSBpcyBubyBwZW5kaW5nIGNvbmZpcm1hdGlvbi5cbiAqL1xuZnVuY3Rpb24gZ2V0UGVuZGluZ0NvbmZpcm1hdGlvbkluZm8ocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCk6IElDaGF0UGVuZGluZ0NvbmZpcm1hdGlvbkluZm8gfCB1bmRlZmluZWQge1xuXHRmb3IgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2UucmVzcG9uc2UudmFsdWUpIHtcblx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuc3RhdGUuZ2V0KCk7XG5cdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicsXG5cdFx0XHRcdFx0dG9vbElkOiBwYXJ0LnRvb2xJZCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdFx0a2luZDogJ3Rvb2xQb3N0QXBwcm92YWwnLFxuXHRcdFx0XHRcdHRvb2xJZDogcGFydC50b29sSWQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICdjb25maXJtYXRpb24nICYmICFwYXJ0LmlzVXNlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGtpbmQ6ICdjb25maXJtYXRpb24nLFxuXHRcdFx0XHR0aXRsZTogcGFydC50aXRsZSxcblx0XHRcdFx0ZGF0YTogcGFydC5kYXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnICYmICFwYXJ0LmlzVXNlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGtpbmQ6ICdxdWVzdGlvbkNhcm91c2VsJyxcblx0XHRcdFx0cXVlc3Rpb25zOiBwYXJ0LnF1ZXN0aW9ucyxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICdlbGljaXRhdGlvbjInICYmIHBhcnQuc3RhdGUuZ2V0KCkgPT09IEVsaWNpdGF0aW9uU3RhdGUuUGVuZGluZykge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBwYXJ0LnRpdGxlO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGtpbmQ6ICdlbGljaXRhdGlvbicsXG5cdFx0XHRcdHRpdGxlOiB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS52YWx1ZSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIFByaW1hcnlPcGVuQ2hhdEdsb2JhbEFjdGlvbiBleHRlbmRzIE9wZW5DaGF0R2xvYmFsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENIQVRfT1BFTl9BQ1RJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuQ2hhdCcsIFwiT3BlbiBDaGF0XCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlJLFxuXHRcdFx0XHRtYWM6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlJXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkNoYXRUaXRsZUJhck1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnYV9vcGVuJyxcblx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE9wZW5DaGF0QWN0aW9uSWRGb3JNb2RlKG1vZGU6IElDaGF0TW9kZSk6IHN0cmluZyB7XG5cdHJldHVybiBgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4ke21vZGUubmFtZS5nZXQoKX1gO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTW9kZU9wZW5DaGF0R2xvYmFsQWN0aW9uIGV4dGVuZHMgT3BlbkNoYXRHbG9iYWxBY3Rpb24ge1xuXHRjb25zdHJ1Y3Rvcihtb2RlOiBJQ2hhdE1vZGUsIGtleWJpbmRpbmc/OiBJQ29tbWFuZFBhbGV0dGVPcHRpb25zWydrZXliaW5kaW5nJ10pIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogZ2V0T3BlbkNoYXRBY3Rpb25JZEZvck1vZGUobW9kZSksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuQ2hhdE1vZGUnLCBcIk9wZW4gQ2hhdCAoezB9KVwiLCBtb2RlLmxhYmVsLmdldCgpKSxcblx0XHRcdGtleWJpbmRpbmdcblx0XHR9LCBtb2RlKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDaGF0QWN0aW9ucygpIHtcblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHNlc3Npb24gVVJJIHRvIHVzZSB3aGVuIG9wZW5pbmcgYSBicmFuZC1uZXcgY2hhdCBlZGl0b3IsXG5cdCAqIGhvbm9yaW5nIHRoZSByZW1lbWJlcmVkIGhhcm5lc3MgcHJlZmVyZW5jZSBhbmQgdGhlbiB0aGUgY29uZmlndXJlZCBkZWZhdWx0LlxuXHQgKi9cblx0ZnVuY3Rpb24gZ2V0TmV3Q2hhdEVkaXRvclNlc3Npb25VcmkoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBVUkkge1xuXHRcdHJldHVybiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25SZXNvdXJjZShhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElDaGF0U2Vzc2lvbnNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSksIGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpLmdldFdvcmtzcGFjZSgpLCBhY2Nlc3Nvci5nZXQoSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlKS5lbmFibGVkLmdldCgpKTtcblx0fVxuXG5cdHJlZ2lzdGVyQWN0aW9uMihQcmltYXJ5T3BlbkNoYXRHbG9iYWxBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBNb2RlT3BlbkNoYXRHbG9iYWxBY3Rpb24ge1xuXHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihDaGF0TW9kZS5Bc2spOyB9XG5cdH0pO1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBNb2RlT3BlbkNoYXRHbG9iYWxBY3Rpb24ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoQ2hhdE1vZGUuQWdlbnQsIHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuaGFzKGBjb25maWcuJHtDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWR9YCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5SSxcblx0XHRcdFx0bGludXg6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUlcblx0XHRcdFx0fVxuXHRcdFx0fSwpO1xuXHRcdH1cblx0fSk7XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE1vZGVPcGVuQ2hhdEdsb2JhbEFjdGlvbiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKENoYXRNb2RlLkVkaXQpOyB9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVDaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBUT0dHTEVfQ0hBVF9BQ1RJT05fSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZUNoYXQnLCBcIlRvZ2dsZSBDaGF0XCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgY2hhdExvY2F0aW9uID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQoQ2hhdFZpZXdJZCk7XG5cdFx0XHRjb25zdCBjaGF0VmlzaWJsZSA9IHZpZXdzU2VydmljZS5pc1ZpZXdWaXNpYmxlKENoYXRWaWV3SWQpO1xuXHRcdFx0aWYgKGNoYXRWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlUGFydFZpc2liaWxpdHkobGF5b3V0U2VydmljZSwgY2hhdExvY2F0aW9uLCBmYWxzZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVBhcnRWaXNpYmlsaXR5KGxheW91dFNlcnZpY2UsIGNoYXRMb2NhdGlvbiwgdHJ1ZSk7XG5cdFx0XHRcdChhd2FpdCB3aWRnZXRTZXJ2aWNlLnJldmVhbFdpZGdldCgpKT8uZm9jdXNJbnB1dCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHByaXZhdGUgdXBkYXRlUGFydFZpc2liaWxpdHkobGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfCBudWxsLCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRsZXQgcGFydDogUGFydHMuUEFORUxfUEFSVCB8IFBhcnRzLlNJREVCQVJfUEFSVCB8IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUIHwgdW5kZWZpbmVkO1xuXHRcdFx0c3dpdGNoIChsb2NhdGlvbikge1xuXHRcdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbDpcblx0XHRcdFx0XHRwYXJ0ID0gUGFydHMuUEFORUxfUEFSVDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcjpcblx0XHRcdFx0XHRwYXJ0ID0gUGFydHMuU0lERUJBUl9QQVJUO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXI6XG5cdFx0XHRcdFx0cGFydCA9IFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocGFydCkge1xuXHRcdFx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oIXZpc2libGUsIHBhcnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdEVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogQUNUSU9OX0lEX09QRU5fQ0hBVCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm9wZW4nLCBcIk5ldyBDaGF0IEVkaXRvclwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5wbHVzLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5Tixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIENoYXRDb250ZXh0S2V5cy5pbkNoYXRFZGl0b3IpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnYl9uZXcnLFxuXHRcdFx0XHRcdG9yZGVyOiAwXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXROZXdNZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnMl9uZXcnLFxuXHRcdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKENoYXRFZGl0b3JJbnB1dC5FZGl0b3JJRCksIENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24ubm90RXF1YWxzVG8oJ2NvcGlsb3QnKSwgQ2hhdENvbnRleHRLZXlzLm5ld0NoYXRCdXR0b25FeHBlcmltZW50SWNvbi5ub3RFcXVhbHNUbygnbmV3LXNlc3Npb24nKSwgQ2hhdENvbnRleHRLZXlzLm5ld0NoYXRCdXR0b25FeHBlcmltZW50SWNvbi5ub3RFcXVhbHNUbygnY29tbWVudCcpKSxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgd2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbihnZXROZXdDaGF0RWRpdG9yU2Vzc2lvblVyaShhY2Nlc3NvciksIEFDVElWRV9HUk9VUCwgeyBwaW5uZWQ6IHRydWUgfSBzYXRpc2ZpZXMgSUNoYXRFZGl0b3JPcHRpb25zKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXdDaGF0RWRpdG9yQ29waWxvdEljb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEFDVElPTl9JRF9PUEVOX0NIQVQgKyAnLmNvcGlsb3RJY29uJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm9wZW4nLCBcIk5ldyBDaGF0IEVkaXRvclwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jb3BpbG90LFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oQ2hhdEVkaXRvcklucHV0LkVkaXRvcklEKSwgQ2hhdENvbnRleHRLZXlzLm5ld0NoYXRCdXR0b25FeHBlcmltZW50SWNvbi5pc0VxdWFsVG8oJ2NvcGlsb3QnKSksXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oZ2V0TmV3Q2hhdEVkaXRvclNlc3Npb25VcmkoYWNjZXNzb3IpLCBBQ1RJVkVfR1JPVVAsIHsgcGlubmVkOiB0cnVlIH0gc2F0aXNmaWVzIElDaGF0RWRpdG9yT3B0aW9ucyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdEVkaXRvck5ld1Nlc3Npb25JY29uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBBQ1RJT05fSURfT1BFTl9DSEFUICsgJy5uZXdTZXNzaW9uSWNvbicsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuJywgXCJOZXcgQ2hhdCBFZGl0b3JcIiksXG5cdFx0XHRcdGljb246IENvZGljb24ubmV3U2Vzc2lvbixcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKENoYXRFZGl0b3JJbnB1dC5FZGl0b3JJRCksIENoYXRDb250ZXh0S2V5cy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24uaXNFcXVhbFRvKCduZXctc2Vzc2lvbicpKSxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgd2lkZ2V0U2VydmljZS5vcGVuU2Vzc2lvbihnZXROZXdDaGF0RWRpdG9yU2Vzc2lvblVyaShhY2Nlc3NvciksIEFDVElWRV9HUk9VUCwgeyBwaW5uZWQ6IHRydWUgfSBzYXRpc2ZpZXMgSUNoYXRFZGl0b3JPcHRpb25zKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXdDaGF0RWRpdG9yQ29tbWVudEljb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEFDVElPTl9JRF9PUEVOX0NIQVQgKyAnLmNvbW1lbnRJY29uJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm9wZW4nLCBcIk5ldyBDaGF0IEVkaXRvclwiKSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jb21tZW50LFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oQ2hhdEVkaXRvcklucHV0LkVkaXRvcklEKSwgQ2hhdENvbnRleHRLZXlzLm5ld0NoYXRCdXR0b25FeHBlcmltZW50SWNvbi5pc0VxdWFsVG8oJ2NvbW1lbnQnKSksXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oZ2V0TmV3Q2hhdEVkaXRvclNlc3Npb25VcmkoYWNjZXNzb3IpLCBBQ1RJVkVfR1JPVVAsIHsgcGlubmVkOiB0cnVlIH0gc2F0aXNmaWVzIElDaGF0RWRpdG9yT3B0aW9ucyk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdEVkaXRvclRvU2lkZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlbkNoYXRUb1NpZGUnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24ub3BlblRvU2lkZScsIFwiTmV3IENoYXQgRWRpdG9yIHRvIHRoZSBTaWRlXCIpLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oZ2V0TmV3Q2hhdEVkaXRvclNlc3Npb25VcmkoYWNjZXNzb3IpLCBTSURFX0dST1VQLCB7IHBpbm5lZDogdHJ1ZSB9IHNhdGlzZmllcyBJQ2hhdEVkaXRvck9wdGlvbnMpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5ld0NoYXRXaW5kb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLm5ld0NoYXRXaW5kb3dgLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24ubmV3Q2hhdFdpbmRvdycsIFwiTmV3IENoYXQgV2luZG93XCIpLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnYl9uZXcnLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXROZXdNZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnMl9uZXcnLFxuXHRcdFx0XHRcdG9yZGVyOiAzXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IHdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oZ2V0TmV3Q2hhdEVkaXRvclNlc3Npb25VcmkoYWNjZXNzb3IpLCBBVVhfV0lORE9XX0dST1VQLCB7IHBpbm5lZDogdHJ1ZSwgYXV4aWxpYXJ5OiB7IGNvbXBhY3Q6IHRydWUsIGJvdW5kczogeyB3aWR0aDogNjQwLCBoZWlnaHQ6IDY0MCB9IH0gfSBzYXRpc2ZpZXMgSUNoYXRFZGl0b3JPcHRpb25zKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDbGVhckNoYXRJbnB1dEhpc3RvcnlBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuY2xlYXJJbnB1dEhpc3RvcnknLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24uY2xlYXJIaXN0b3J5LmxhYmVsJywgXCJDbGVhciBJbnB1dCBIaXN0b3J5XCIpLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UpO1xuXHRcdFx0aGlzdG9yeVNlcnZpY2UuY2xlYXJIaXN0b3J5KCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNDaGF0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnY2hhdC5hY3Rpb24uZm9jdXMnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdhY3Rpb25zLmludGVyYWN0aXZlU2Vzc2lvbi5mb2N1cycsICdGb2N1cyBDaGF0IExpc3QnKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0KSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0XHQvLyBPbiBtYWMsIHJlcXVpcmUgdGhhdCB0aGUgY3Vyc29yIGlzIGF0IHRoZSB0b3Agb2YgdGhlIGlucHV0LCB0byBhdm9pZCBzdGVhbGluZyBjbWQrdXAgdG8gbW92ZSB0aGUgY3Vyc29yIHRvIHRoZSB0b3Bcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmlucHV0Q3Vyc29yQXRUb3AsIENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSksXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ly8gT24gd2luL2xpbnV4LCBjdHJsK3VwIGNhbiBhbHdheXMgZm9jdXMgdGhlIGNoYXQgbGlzdFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5vcihJc1dpbmRvd3NDb250ZXh0LCBJc0xpbnV4Q29udGV4dCksIENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSksXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGVkaXRvclVyaSA9IGVkaXRvci5nZXRNb2RlbCgpPy51cmk7XG5cdFx0XHRpZiAoZWRpdG9yVXJpKSB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdFx0d2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKGVkaXRvclVyaSk/LmZvY3VzUmVzcG9uc2VJdGVtKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNNb3N0UmVjZW50bHlGb2N1c2VkQ2hhdEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5jaGF0LmFjdGlvbi5mb2N1c0xhc3RGb2N1c2VkJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignYWN0aW9ucy5pbnRlcmFjdGl2ZVNlc3Npb24uZm9jdXNMYXN0Rm9jdXNlZCcsICdGb2N1cyBMYXN0IEZvY3VzZWQgQ2hhdCBMaXN0IEl0ZW0nKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0KSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0XHQvLyBPbiBtYWMsIHJlcXVpcmUgdGhhdCB0aGUgY3Vyc29yIGlzIGF0IHRoZSB0b3Agb2YgdGhlIGlucHV0LCB0byBhdm9pZCBzdGVhbGluZyBjbWQrdXAgdG8gbW92ZSB0aGUgY3Vyc29yIHRvIHRoZSB0b3Bcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmlucHV0Q3Vyc29yQXRUb3AsIENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSksXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuVXBBcnJvdyB8IEtleU1vZC5TaGlmdCxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliICsgMSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdC8vIE9uIHdpbi9saW51eCwgY3RybCt1cCBjYW4gYWx3YXlzIGZvY3VzIHRoZSBjaGF0IGxpc3Rcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIub3IoSXNXaW5kb3dzQ29udGV4dCwgSXNMaW51eENvbnRleHQpLCBDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQubmVnYXRlKCkpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3cgfCBLZXlNb2QuU2hpZnQsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYiArIDEsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdCksXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93IHwgS2V5TW9kLlNoaWZ0LFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGVkaXRvclVyaSA9IGVkaXRvci5nZXRNb2RlbCgpPy51cmk7XG5cdFx0XHRpZiAoZWRpdG9yVXJpKSB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdFx0d2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKGVkaXRvclVyaSk/LmZvY3VzUmVzcG9uc2VJdGVtKHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzQ2hhdElucHV0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmZvY3VzSW5wdXQnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24uZm9jdXNJbnB1dC5sYWJlbCcsIFwiRm9jdXMgQ2hhdCBJbnB1dFwiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQubmVnYXRlKCksIENoYXRDb250ZXh0S2V5cy5pblF1aWNrQ2hhdC5uZWdhdGUoKSksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIENoYXRDb250ZXh0S2V5cy5pbkNoYXRJbnB1dC5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLmluUXVpY2tDaGF0KSxcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ/LmZvY3VzSW5wdXQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c1RvZG9zVmlld0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZm9jdXNUb2Rvc1ZpZXcnO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBGb2N1c1RvZG9zVmlld0FjdGlvbi5JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLmZvY3VzVG9kb3NWaWV3LmxhYmVsJywgXCJUb2dnbGUgRm9jdXMgQmV0d2VlbiBUT0RPcyBhbmQgSW5wdXRcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmlzRXF1YWxUbyhDaGF0TW9kZUtpbmQuQWdlbnQpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5VCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQsIENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuaXNFcXVhbFRvKENoYXRNb2RlS2luZC5BZ2VudCkpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRUb2RvTGlzdCwgQ2hhdENvbnRleHRLZXlzLmNoYXRNb2RlS2luZC5pc0VxdWFsVG8oQ2hhdE1vZGVLaW5kLkFnZW50KSlcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXG5cdFx0XHRpZiAoIXdpZGdldCB8fCAhd2lkZ2V0LnRvZ2dsZVRvZG9zVmlld0ZvY3VzKCkpIHtcblx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2NoYXQudG9kb0xpc3QuZm9jdXNVbmF2YWlsYWJsZScsIFwiTm8gYWdlbnQgdG9kb3MgdG8gZm9jdXMgcmlnaHQgbm93LlwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNRdWVzdGlvbkNhcm91c2VsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5mb2N1c1F1ZXN0aW9uQ2Fyb3VzZWwnO1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBGb2N1c1F1ZXN0aW9uQ2Fyb3VzZWxBY3Rpb24uSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5mb2N1c1F1ZXN0aW9uQ2Fyb3VzZWwubGFiZWwnLCBcIkNoYXQ6IFRvZ2dsZSBGb2N1cyBCZXR3ZWVuIFF1ZXN0aW9uIGFuZCBJbnB1dFwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlBLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbiwgQ2hhdENvbnRleHRLZXlzLkVkaXRpbmcuaGFzUXVlc3Rpb25DYXJvdXNlbCksXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cblx0XHRcdGlmICghd2lkZ2V0IHx8ICF3aWRnZXQudG9nZ2xlUXVlc3Rpb25DYXJvdXNlbEZvY3VzKCkpIHtcblx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbC5mb2N1c1VuYXZhaWxhYmxlJywgXCJObyBjaGF0IHF1ZXN0aW9uIHRvIGZvY3VzIHJpZ2h0IG5vdy5cIikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFByZXZpb3VzUXVlc3Rpb25DYXJvdXNlbFF1ZXN0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5wcmV2aW91c1F1ZXN0aW9uJztcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogUHJldmlvdXNRdWVzdGlvbkNhcm91c2VsUXVlc3Rpb25BY3Rpb24uSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5wcmV2aW91c1F1ZXN0aW9uLmxhYmVsJywgXCJDaGF0OiBQcmV2aW91cyBRdWVzdGlvblwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbiwgQ2hhdENvbnRleHRLZXlzLkVkaXRpbmcuaGFzUXVlc3Rpb25DYXJvdXNlbCksXG5cdFx0XHRcdGtleWJpbmRpbmc6IFt7XG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5UCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1F1ZXN0aW9uQ2Fyb3VzZWwpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py5uYXZpZ2F0ZVRvUHJldmlvdXNRdWVzdGlvbigpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE5leHRRdWVzdGlvbkNhcm91c2VsUXVlc3Rpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm5leHRRdWVzdGlvbic7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IE5leHRRdWVzdGlvbkNhcm91c2VsUXVlc3Rpb25BY3Rpb24uSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5uZXh0UXVlc3Rpb24ubGFiZWwnLCBcIkNoYXQ6IE5leHQgUXVlc3Rpb25cIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1F1ZXN0aW9uQ2Fyb3VzZWwpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleU4sXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRRdWVzdGlvbkNhcm91c2VsLCBDaGF0Q29udGV4dEtleXMuRWRpdGluZy5oYXNRdWVzdGlvbkNhcm91c2VsKSxcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0d2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldD8ubmF2aWdhdGVUb05leHRRdWVzdGlvbigpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzUXVlc3Rpb25DYXJvdXNlbFRlcm1pbmFsQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5mb2N1c1F1ZXN0aW9uQ2Fyb3VzZWxUZXJtaW5hbCc7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEZvY3VzUXVlc3Rpb25DYXJvdXNlbFRlcm1pbmFsQWN0aW9uLklELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24uZm9jdXNRdWVzdGlvbkNhcm91c2VsVGVybWluYWwubGFiZWwnLCBcIkNoYXQ6IEZvY3VzIFRlcm1pbmFsIGZyb20gUXVlc3Rpb24gQ2Fyb3VzZWxcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIENoYXRDb250ZXh0S2V5cy5FZGl0aW5nLmhhc1F1ZXN0aW9uQ2Fyb3VzZWwsIENoYXRDb250ZXh0S2V5cy5jaGF0UXVlc3Rpb25DYXJvdXNlbEhhc1Rlcm1pbmFsKSxcblx0XHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlULFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0UXVlc3Rpb25DYXJvdXNlbCwgQ2hhdENvbnRleHRLZXlzLkVkaXRpbmcuaGFzUXVlc3Rpb25DYXJvdXNlbCwgQ2hhdENvbnRleHRLZXlzLmNoYXRRdWVzdGlvbkNhcm91c2VsSGFzVGVybWluYWwpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHR3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py5mb2N1c1F1ZXN0aW9uQ2Fyb3VzZWxUZXJtaW5hbCgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzVGlwQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5mb2N1c1RpcCc7XG5cblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEZvY3VzVGlwQWN0aW9uLklELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZVNlc3Npb24uZm9jdXNUaXAubGFiZWwnLCBcIkNoYXQ6IFRvZ2dsZSBGb2N1cyBCZXR3ZWVuIFRpcCBhbmQgSW5wdXRcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbixcblx0XHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuU2xhc2gsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbixcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRUaXBcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRjb25zdCB3aWRnZXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSB3aWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXG5cdFx0XHRpZiAoIXdpZGdldCB8fCAhd2lkZ2V0LnRvZ2dsZVRpcEZvY3VzKCkpIHtcblx0XHRcdFx0YWxlcnQobG9jYWxpemUoJ2NoYXQudGlwLmZvY3VzVW5hdmFpbGFibGUnLCBcIk5vIGNoYXQgdGlwLlwiKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd0NvbnRleHRVc2FnZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zaG93Q29udGV4dFVzYWdlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLnNob3dDb250ZXh0VXNhZ2UubGFiZWwnLCBcIlNob3cgQ29udGV4dCBXaW5kb3cgVXNhZ2VcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gd2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldCA/PyAoYXdhaXQgd2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKSk7XG5cdFx0XHR3aWRnZXQ/LmlucHV0LnNob3dDb250ZXh0VXNhZ2VEZXRhaWxzKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29tcGFjdEFnZW50SG9zdENvbnZlcnNhdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb21wYWN0QWdlbnRIb3N0Q29udmVyc2F0aW9uJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLmNvbXBhY3RBZ2VudEhvc3RDb252ZXJzYXRpb24ubGFiZWwnLCBcIkNvbXBhY3QgQ29udmVyc2F0aW9uXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdENvbnRleHRVc2FnZUFjdGlvbnMsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdElzQWdlbnRIb3N0U2Vzc2lvbixcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0QWdlbnRIb3N0UHJvdmlkZXJJZC5pc0VxdWFsVG8oQ09QSUxPVF9DTElfQUdFTlRfSE9TVF9QUk9WSURFUl9JRClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0PzogSUNoYXRXaWRnZXQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdC8vIENvbXBhY3Rpb24gaXMgYSBtYWludGVuYW5jZSBjb21tYW5kLCBzbyBrZWVwIGFueSBkcmFmdCB0aGUgdXNlciB0eXBlZCAoIzMxNDY2NCkuXG5cdFx0XHRhd2FpdCB3aWRnZXQ/LmFjY2VwdElucHV0KCcvY29tcGFjdCcsIHsgcHJlc2VydmVJbnB1dDogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVTaG93Q29udGV4dFVzYWdlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZVNob3dDb250ZXh0VXNhZ2UnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LnNob3dDb250ZXh0VXNhZ2UnLCBcIlNob3cgQ29udGV4dCBVc2FnZVwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Q2hhdENvbmZpZ3VyYXRpb24uQ2hhdENvbnRleHRVc2FnZUVuYWJsZWR9YCwgdHJ1ZSksXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRXZWxjb21lQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJzFfZGlzcGxheScsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdEVkaXRvci5uZWdhdGUoKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q29udGV4dFVzYWdlRW5hYmxlZCk7XG5cdFx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q29udGV4dFVzYWdlRW5hYmxlZCwgIWN1cnJlbnRWYWx1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCBub25FbnRlcnByaXNlQ29waWxvdFVzZXJzID0gQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke2RlZmF1bHRDaGF0LmNvbXBsZXRpb25zQWR2YW5jZWRTZXR0aW5nfS5hdXRoUHJvdmlkZXJgLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLmlkKSk7XG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5tYW5hZ2VTZXR0aW5ncycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hbmFnZUNoYXQnLCBcIk1hbmFnZSBDb3BpbG90IFNldHRpbmdzXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5GcmVlLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5FZHUsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblBybyxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuUHJvUGx1cyxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuTWF4XG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRub25FbnRlcnByaXNlQ29waWxvdFVzZXJzXG5cdFx0XHRcdCksXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRUaXRsZUJhck1lbnUsXG5cdFx0XHRcdFx0Z3JvdXA6ICd5X21hbmFnZScsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdFx0d2hlbjogbm9uRW50ZXJwcmlzZUNvcGlsb3RVc2Vyc1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdEFjY291bnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEZWZhdWx0QWNjb3VudFNlcnZpY2UpO1xuXHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVzb2x2ZUdpdEh1YlVybChHaXRIdWJQYXRocy5jb3BpbG90U2V0dGluZ3MpKSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd0V4dGVuc2lvbnNVc2luZ0NvcGlsb3QgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5zaG93RXh0ZW5zaW9uc1VzaW5nQ29waWxvdCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3dDb3BpbG90VXNhZ2VFeHRlbnNpb25zJywgXCJTaG93IEV4dGVuc2lvbnMgdXNpbmcgQ29waWxvdFwiKSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGNhdGVnb3J5OiBFWFRFTlNJT05TX0NBVEVHT1JZLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0XHRleHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGBAY29udHJpYnV0ZToke0NvcGlsb3RVc2FnZUV4dGVuc2lvbkZlYXR1cmVJZH1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb25maWd1cmVDb3BpbG90Q29tcGxldGlvbnMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb25maWd1cmVDb2RlQ29tcGxldGlvbnMnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25maWd1cmVDb21wbGV0aW9ucycsIFwiQ29uZmlndXJlIElubGluZSBTdWdnZXN0aW9ucy4uLlwiKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmluc3RhbGxlZCxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWQubmVnYXRlKCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLnVudHJ1c3RlZC5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRcdGdyb3VwOiAnZl9jb21wbGV0aW9ucycsXG5cdFx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc01lbnVDb21tYW5kKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93UXVvdGFFeGNlZWRlZERpYWxvZ0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBPUEVOX0NIQVRfUVVPVEFfRVhDRUVERURfRElBTE9HLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3VwZ3JhZGVDaGF0JywgXCJVcGdyYWRlIEdpdEh1YiBDb3BpbG90IFBsYW5cIilcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0Y29uc3QgY2hhdEVudGl0bGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEVudGl0bGVtZW50U2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRcdGNvbnN0IGNoYXRRdW90YUV4Y2VlZGVkID0gY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMuY2hhdD8ucGVyY2VudFJlbWFpbmluZyA9PT0gMDtcblx0XHRcdGNvbnN0IGNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZCA9IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLmNvbXBsZXRpb25zPy5wZXJjZW50UmVtYWluaW5nID09PSAwO1xuXHRcdFx0aWYgKGNoYXRRdW90YUV4Y2VlZGVkICYmICFjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWQpIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0UXVvdGFFeGNlZWRlZCcsIFwiWW91J3ZlIHJlYWNoZWQgeW91ciBtb250aGx5IGNoYXQgbWVzc2FnZXMgcXVvdGEuIFlvdSBzdGlsbCBoYXZlIGZyZWUgaW5saW5lIHN1Z2dlc3Rpb25zIGF2YWlsYWJsZS5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbXBsZXRpb25zUXVvdGFFeGNlZWRlZCAmJiAhY2hhdFF1b3RhRXhjZWVkZWQpIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjb21wbGV0aW9uc1F1b3RhRXhjZWVkZWQnLCBcIllvdSd2ZSByZWFjaGVkIHlvdXIgbW9udGhseSBpbmxpbmUgc3VnZ2VzdGlvbnMgcXVvdGEuIFlvdSBzdGlsbCBoYXZlIGZyZWUgY2hhdCBtZXNzYWdlcyBhdmFpbGFibGUuXCIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdjaGF0QW5kQ29tcGxldGlvbnNRdW90YUV4Y2VlZGVkJywgXCJZb3UndmUgcmVhY2hlZCB5b3VyIG1vbnRobHkgY2hhdCBtZXNzYWdlcyBhbmQgaW5saW5lIHN1Z2dlc3Rpb25zIHF1b3RhLlwiKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnJlc2V0RGF0ZSkge1xuXHRcdFx0XHRjb25zdCBkYXRlRm9ybWF0dGVyID0gY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMucmVzZXREYXRlSGFzVGltZSA/IHNhZmVJbnRsLkRhdGVUaW1lRm9ybWF0KGxhbmd1YWdlLCB7IHllYXI6ICdudW1lcmljJywgbW9udGg6ICdsb25nJywgZGF5OiAnbnVtZXJpYycsIGhvdXI6ICdudW1lcmljJywgbWludXRlOiAnbnVtZXJpYycgfSkgOiBzYWZlSW50bC5EYXRlVGltZUZvcm1hdChsYW5ndWFnZSwgeyB5ZWFyOiAnbnVtZXJpYycsIG1vbnRoOiAnbG9uZycsIGRheTogJ251bWVyaWMnIH0pO1xuXHRcdFx0XHRjb25zdCBxdW90YVJlc2V0RGF0ZSA9IG5ldyBEYXRlKGNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnJlc2V0RGF0ZSk7XG5cdFx0XHRcdG1lc3NhZ2UgPSBbbWVzc2FnZSwgbG9jYWxpemUoJ3F1b3RhUmVzZXREYXRlJywgXCJUaGUgYWxsb3dhbmNlIHdpbGwgcmVzZXQgb24gezB9LlwiLCBkYXRlRm9ybWF0dGVyLnZhbHVlLmZvcm1hdChxdW90YVJlc2V0RGF0ZSkpXS5qb2luKCcgJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyZWUgPSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRnJlZTtcblx0XHRcdGNvbnN0IHVwZ3JhZGVUb1BybyA9IGZyZWUgPyBsb2NhbGl6ZSgndXBncmFkZVRvUHJvJywgXCJVcGdyYWRlIHRvIEdpdEh1YiBDb3BpbG90IFBybyBmb3I6XFxuLSBVbmxpbWl0ZWQgaW5saW5lIHN1Z2dlc3Rpb25zXFxuLSBVbmxpbWl0ZWQgY2hhdCBtZXNzYWdlc1xcbi0gQWNjZXNzIHRvIHByZW1pdW0gbW9kZWxzXCIpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6ICdub25lJyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvcGlsb3RRdW90YVJlYWNoZWQnLCBcIkdpdEh1YiBDb3BpbG90IFF1b3RhIFJlYWNoZWRcIiksXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZGlzbWlzcycsIFwiRGlzbWlzc1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHsgLyogbm9vcCAqLyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogZnJlZSA/IGxvY2FsaXplKCd1cGdyYWRlUHJvJywgXCJVcGdyYWRlIHRvIEdpdEh1YiBDb3BpbG90IFByb1wiKSA6IGxvY2FsaXplKCd1cGdyYWRlUGxhbicsIFwiVXBncmFkZSBHaXRIdWIgQ29waWxvdCBQbGFuXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nO1xuXHRcdFx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogY29tbWFuZElkLCBmcm9tOiAnY2hhdC1kaWFsb2cnIH0pO1xuXHRcdFx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdGljb246IENvZGljb24uY29waWxvdFdhcm5pbmdMYXJnZSxcblx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IGNvYWxlc2NlKFtcblx0XHRcdFx0XHRcdHsgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlLCB0cnVlKSB9LFxuXHRcdFx0XHRcdFx0dXBncmFkZVRvUHJvID8geyBtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKHVwZ3JhZGVUb1BybywgdHJ1ZSkgfSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc2V0VHJ1c3RlZFRvb2xzQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc2V0VHJ1c3RlZFRvb2xzJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzZXRUcnVzdGVkVG9vbHMnLCBcIlJlc2V0IFRvb2wgQ29uZmlybWF0aW9uc1wiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0XHRhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UpLnJlc2V0VG9vbEF1dG9Db25maXJtYXRpb24oKTtcblx0XHRcdGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSkuaW5mbyhsb2NhbGl6ZSgncmVzZXRUcnVzdGVkVG9vbHNTdWNjZXNzJywgXCJUb29sIGNvbmZpcm1hdGlvbiBwcmVmZXJlbmNlcyBoYXZlIGJlZW4gcmVzZXQuXCIpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHZW5lcmF0ZUluc3RydWN0aW9uc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlSW5zdHJ1Y3Rpb25zJywgXCJHZW5lcmF0ZSBBZ2VudCBJbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7XG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHF1ZXJ5OiAnL2luaXQnLFxuXHRcdFx0XHRpc1BhcnRpYWxRdWVyeTogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHZW5lcmF0ZUluc3RydWN0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBHRU5FUkFURV9PTl9ERU1BTkRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlT25EZW1hbmRJbnN0cnVjdGlvbnMnLCBcIkdlbmVyYXRlIE9uLURlbWFuZCBJbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7XG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHF1ZXJ5OiAnL2NyZWF0ZS1pbnN0cnVjdGlvbnMgJyxcblx0XHRcdFx0aXNQYXJ0aWFsUXVlcnk6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHZW5lcmF0ZVByb21wdEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogR0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlUHJvbXB0JywgXCJHZW5lcmF0ZSBQcm9tcHQgRmlsZVwiKSxcblx0XHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUyKCdnZW5lcmF0ZVByb21wdC5zaG9ydCcsIFwiR2VuZXJhdGUgUHJvbXB0XCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zcGFya2xlLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJywge1xuXHRcdFx0XHRtb2RlOiAnYWdlbnQnLFxuXHRcdFx0XHRxdWVyeTogJy9jcmVhdGUtcHJvbXB0ICcsXG5cdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgR2VuZXJhdGVTa2lsbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogR0VORVJBVEVfU0tJTExfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZ2VuZXJhdGVTa2lsbCcsIFwiR2VuZXJhdGUgU2tpbGxcIiksXG5cdFx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignZ2VuZXJhdGVTa2lsbC5zaG9ydCcsIFwiR2VuZXJhdGUgU2tpbGxcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7XG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHF1ZXJ5OiAnL2NyZWF0ZS1za2lsbCAnLFxuXHRcdFx0XHRpc1BhcnRpYWxRdWVyeTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEdlbmVyYXRlQWdlbnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEdFTkVSQVRFX0FHRU5UX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlQWdlbnQnLCBcIkdlbmVyYXRlIEN1c3RvbSBBZ2VudFwiKSxcblx0XHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUyKCdnZW5lcmF0ZUFnZW50LnNob3J0JywgXCJHZW5lcmF0ZSBBZ2VudFwiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24uc3BhcmtsZSxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbicsIHtcblx0XHRcdFx0bW9kZTogJ2FnZW50Jyxcblx0XHRcdFx0cXVlcnk6ICcvY3JlYXRlLWFnZW50ICcsXG5cdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgR2VuZXJhdGVIb29rQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBHRU5FUkFURV9IT09LX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlSG9vaycsIFwiR2VuZXJhdGUgSG9va1wiKSxcblx0XHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUyKCdnZW5lcmF0ZUhvb2suc2hvcnQnLCBcIkdlbmVyYXRlIEhvb2tcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGUsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nLCB7XG5cdFx0XHRcdG1vZGU6ICdhZ2VudCcsXG5cdFx0XHRcdHF1ZXJ5OiAnL2NyZWF0ZS1ob29rICcsXG5cdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgSW5zZXJ0Rm9ya0NvbnZlcnNhdGlvblNsYXNoQ29tbWFuZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogSU5TRVJUX0ZPUktfQ09OVkVSU0FUSU9OX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydEZvcmtDb252ZXJzYXRpb25TbGFzaENvbW1hbmQnLCBcIkluc2VydCBGb3JrIENvbW1hbmRcIiksXG5cdFx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignaW5zZXJ0Rm9ya0NvbnZlcnNhdGlvblNsYXNoQ29tbWFuZC5zaG9ydCcsIFwiSW5zZXJ0IC9mb3JrXCIpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZXBvRm9ya2VkLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJywge1xuXHRcdFx0XHRxdWVyeTogJy9mb3JrICcsXG5cdFx0XHRcdGlzUGFydGlhbFF1ZXJ5OiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgSW5zZXJ0VHJvdWJsZXNob290U2xhc2hDb21tYW5kQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBJTlNFUlRfVFJPVUJMRVNIT09UX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydFRyb3VibGVzaG9vdFNsYXNoQ29tbWFuZCcsIFwiSW5zZXJ0IFRyb3VibGVzaG9vdCBDb21tYW5kXCIpLFxuXHRcdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydFRyb3VibGVzaG9vdFNsYXNoQ29tbWFuZC5zaG9ydCcsIFwiSW5zZXJ0IC90cm91Ymxlc2hvb3RcIiksXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuJywge1xuXHRcdFx0XHRxdWVyeTogJy90cm91Ymxlc2hvb3QgJyxcblx0XHRcdFx0aXNQYXJ0aWFsUXVlcnk6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuQ2hhdEZlYXR1cmVTZXR0aW5nc0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuRmVhdHVyZVNldHRpbmdzJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkNoYXRGZWF0dXJlU2V0dGluZ3MnLCBcIkNoYXQgU2V0dGluZ3NcIiksXG5cdFx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplKCdvcGVuQ2hhdEZlYXR1cmVTZXR0aW5ncy5zaG9ydCcsIFwiQ2hhdCBTZXR0aW5nc1wiKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdGlkOiBDSEFUX0NPTkZJR19NRU5VX0lELFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQ2hhdFZpZXdJZCkpLFxuXHRcdFx0XHRcdG9yZGVyOiAxNSxcblx0XHRcdFx0XHRncm91cDogJzNfY29uZmlndXJlJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0V2VsY29tZUNvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICcyX3NldHRpbmdzJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBDaGF0Vmlld0lkKSksXG5cdFx0XHRcdFx0b3JkZXI6IDE1LFxuXHRcdFx0XHRcdGdyb3VwOiAnM19jb25maWd1cmUnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IHByZWZlcmVuY2VzU2VydmljZSA9IGFjY2Vzc29yLmdldChJUHJlZmVyZW5jZXNTZXJ2aWNlKTtcblx0XHRcdHByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3MoeyBxdWVyeTogJ0BmZWF0dXJlOmNoYXQgJyB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIFNob3cgYSBkaXJlY3QgZ2VhciBhY3Rpb24gdG8gb3BlbiB0aGUgQ3VzdG9taXphdGlvbnMgZWRpdG9yXG5cdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVmlld1RpdGxlLCB7XG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcy5PcGVuRWRpdG9yLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbkNoYXRDdXN0b21pemF0aW9ucycsIFwiT3BlbiBDdXN0b21pemF0aW9uc1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nZWFyXG5cdFx0fSxcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQ2hhdFZpZXdJZCksXG5cdFx0KSxcblx0XHRvcmRlcjogNlxuXHR9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmluZ2lmeUl0ZW0oaXRlbTogSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaW5jbHVkZU5hbWUgPSB0cnVlKTogc3RyaW5nIHtcblx0aWYgKGlzUmVxdWVzdFZNKGl0ZW0pKSB7XG5cdFx0cmV0dXJuIChpbmNsdWRlTmFtZSA/IGAke2l0ZW0udXNlcm5hbWV9OiBgIDogJycpICsgaXRlbS5tZXNzYWdlVGV4dDtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gKGluY2x1ZGVOYW1lID8gYCR7aXRlbS51c2VybmFtZX06IGAgOiAnJykgKyBpdGVtLnJlc3BvbnNlLnRvU3RyaW5nKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVG9vbEZpbHRlcmluZ09wdGlvbnMge1xuXHRhbGxUb29sczogSVRvb2xEYXRhW107XG5cdGFsbFRvb2xTZXRzOiBJVG9vbFNldFtdO1xuXHR0b29sc0luY2x1ZGU/OiBzdHJpbmdbXTtcblx0dG9vbHNFeGNsdWRlPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRvb2xGaWx0ZXJpbmdSZXN1bHQge1xuXHRlbmFibGVtZW50TWFwOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXA7XG5cdHVua25vd25JZGVudGlmaWVyczogc3RyaW5nW107XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIHRvb2wgZW5hYmxlbWVudCBtYXAgYmFzZWQgb24gaW5jbHVkZS9leGNsdWRlIGZpbHRlcnMuXG4gKlxuICogUmVzb2x1dGlvbiBhbGdvcml0aG06XG4gKiAxLiBJZiBgdG9vbHNJbmNsdWRlYCBpcyBzcGVjaWZpZWQsIHN0YXJ0IHdpdGggb25seSB0aG9zZSB0b29scy90b29sc2V0cyBlbmFibGVkXG4gKiAyLiBJZiBgdG9vbHNFeGNsdWRlYCBpcyBzcGVjaWZpZWQsIHJlbW92ZSB0aG9zZSB0b29scy90b29sc2V0c1xuICogMy4gRXhwbGljaXQgdG9vbCByZWZlcmVuY2VzIGluIGB0b29sc0luY2x1ZGVgIG92ZXJyaWRlIHRvb2xzZXQgZXhjbHVzaW9uc1xuICogNC4gRXhwbGljaXQgdG9vbCBleGNsdXNpb25zIGFsd2F5cyB3aW5cbiAqIDUuIFRvb2xzZXQgZW5hYmxlbWVudCBpcyBjYWxjdWxhdGVkIGJhc2VkIG9uIHdoZXRoZXIgYWxsIG1lbWJlciB0b29scyBhcmUgZW5hYmxlZFxuICpcbiAqIEB0aHJvd3MgRXJyb3IgaWYgZmlsdGVyaW5nIHJlc3VsdHMgaW4gemVybyBlbmFibGVkIHRvb2xzXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wdXRlVG9vbEVuYWJsZW1lbnRNYXAob3B0aW9uczogSVRvb2xGaWx0ZXJpbmdPcHRpb25zKTogSVRvb2xGaWx0ZXJpbmdSZXN1bHQge1xuXHRjb25zdCB7IGFsbFRvb2xzLCBhbGxUb29sU2V0cywgdG9vbHNJbmNsdWRlLCB0b29sc0V4Y2x1ZGUgfSA9IG9wdGlvbnM7XG5cblx0Y29uc3QgZW5hYmxlbWVudE1hcCA9IG5ldyBNYXA8SVRvb2xEYXRhIHwgSVRvb2xTZXQsIGJvb2xlYW4+KCk7XG5cdGNvbnN0IG1hdGNoZWRJZGVudGlmaWVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8vIEhlbHBlciB0byBjaGVjayBpZiBhIHRvb2wgbWF0Y2hlcyBhbnkgaWRlbnRpZmllciAoYnkgaWQgb3IgdG9vbFJlZmVyZW5jZU5hbWUpXG5cdGNvbnN0IHRvb2xNYXRjaGVzID0gKHRvb2w6IElUb29sRGF0YSwgaWRlbnRpZmllcnM6IFNldDxzdHJpbmc+KTogYm9vbGVhbiA9PiB7XG5cdFx0aWYgKGlkZW50aWZpZXJzLmhhcyh0b29sLmlkKSkge1xuXHRcdFx0bWF0Y2hlZElkZW50aWZpZXJzLmFkZCh0b29sLmlkKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodG9vbC50b29sUmVmZXJlbmNlTmFtZSAmJiBpZGVudGlmaWVycy5oYXModG9vbC50b29sUmVmZXJlbmNlTmFtZSkpIHtcblx0XHRcdG1hdGNoZWRJZGVudGlmaWVycy5hZGQodG9vbC50b29sUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXG5cdC8vIEhlbHBlciB0byBjaGVjayBpZiBhIHRvb2xzZXQgbWF0Y2hlcyBhbnkgaWRlbnRpZmllciAoYnkgaWQgb3IgcmVmZXJlbmNlTmFtZSlcblx0Y29uc3QgdG9vbFNldE1hdGNoZXMgPSAodG9vbFNldDogSVRvb2xTZXQsIGlkZW50aWZpZXJzOiBTZXQ8c3RyaW5nPik6IGJvb2xlYW4gPT4ge1xuXHRcdGlmIChpZGVudGlmaWVycy5oYXModG9vbFNldC5pZCkpIHtcblx0XHRcdG1hdGNoZWRJZGVudGlmaWVycy5hZGQodG9vbFNldC5pZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGlkZW50aWZpZXJzLmhhcyh0b29sU2V0LnJlZmVyZW5jZU5hbWUpKSB7XG5cdFx0XHRtYXRjaGVkSWRlbnRpZmllcnMuYWRkKHRvb2xTZXQucmVmZXJlbmNlTmFtZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9O1xuXG5cdC8vIFRyYWNrIHdoaWNoIHRvb2xzIGFyZSBleHBsaWNpdGx5IHJlZmVyZW5jZWQgaW4gdG9vbHNJbmNsdWRlXG5cdGNvbnN0IGV4cGxpY2l0bHlJbmNsdWRlZFRvb2xzID0gbmV3IFNldDxJVG9vbERhdGE+KCk7XG5cblx0Ly8gU3RlcCAxOiBCdWlsZCBpbml0aWFsIHNldCBiYXNlZCBvbiB0b29sc0luY2x1ZGVcblx0aWYgKHRvb2xzSW5jbHVkZSkge1xuXHRcdGNvbnN0IGluY2x1ZGVTZXQgPSBuZXcgU2V0KHRvb2xzSW5jbHVkZSk7XG5cblx0XHQvLyBGaXJzdCwgcHJvY2VzcyB0b29sc2V0cyAtIGlmIGEgdG9vbHNldCBtYXRjaGVzLCBlbmFibGUgYWxsIGl0cyB0b29sc1xuXHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiBhbGxUb29sU2V0cykge1xuXHRcdFx0aWYgKHRvb2xTZXRNYXRjaGVzKHRvb2xTZXQsIGluY2x1ZGVTZXQpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcblx0XHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFRoZW4gcHJvY2VzcyBpbmRpdmlkdWFsIHRvb2xzXG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIGFsbFRvb2xzKSB7XG5cdFx0XHRpZiAodG9vbE1hdGNoZXModG9vbCwgaW5jbHVkZVNldCkpIHtcblx0XHRcdFx0ZW5hYmxlbWVudE1hcC5zZXQodG9vbCwgdHJ1ZSk7XG5cdFx0XHRcdGV4cGxpY2l0bHlJbmNsdWRlZFRvb2xzLmFkZCh0b29sKTtcblx0XHRcdH0gZWxzZSBpZiAoIWVuYWJsZW1lbnRNYXAuaGFzKHRvb2wpKSB7XG5cdFx0XHRcdGVuYWJsZW1lbnRNYXAuc2V0KHRvb2wsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gQWxzbyBwcm9jZXNzIHRvb2xzIGZyb20gdG9vbHNldHMgdGhhdCBtYXkgbm90IGJlIGluIGFsbFRvb2xzXG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIGFsbFRvb2xTZXRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbFNldC5nZXRUb29scygpKSB7XG5cdFx0XHRcdGlmICh0b29sTWF0Y2hlcyh0b29sLCBpbmNsdWRlU2V0KSkge1xuXHRcdFx0XHRcdGVuYWJsZW1lbnRNYXAuc2V0KHRvb2wsIHRydWUpO1xuXHRcdFx0XHRcdGV4cGxpY2l0bHlJbmNsdWRlZFRvb2xzLmFkZCh0b29sKTtcblx0XHRcdFx0fSBlbHNlIGlmICghZW5hYmxlbWVudE1hcC5oYXModG9vbCkpIHtcblx0XHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gTm8gdG9vbHNJbmNsdWRlIHNwZWNpZmllZCAtIHN0YXJ0IHdpdGggYWxsIHRvb2xzIGVuYWJsZWRcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgYWxsVG9vbHMpIHtcblx0XHRcdGVuYWJsZW1lbnRNYXAuc2V0KHRvb2wsIHRydWUpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgYWxsVG9vbFNldHMpIHtcblx0XHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcblx0XHRcdFx0ZW5hYmxlbWVudE1hcC5zZXQodG9vbCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gU3RlcCAyOiBSZW1vdmUgdG9vbHMgbWF0Y2hpbmcgdG9vbHNFeGNsdWRlXG5cdGlmICh0b29sc0V4Y2x1ZGUpIHtcblx0XHRjb25zdCBleGNsdWRlU2V0ID0gbmV3IFNldCh0b29sc0V4Y2x1ZGUpO1xuXG5cdFx0Ly8gRmlyc3QsIHByb2Nlc3MgdG9vbHNldHMgLSBpZiBhIHRvb2xzZXQgbWF0Y2hlcywgZGlzYWJsZSBhbGwgaXRzIHRvb2xzXG5cdFx0Ly8gKHVubGVzcyBleHBsaWNpdGx5IGluY2x1ZGVkIGFzIGluZGl2aWR1YWwgdG9vbHMpXG5cdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIGFsbFRvb2xTZXRzKSB7XG5cdFx0XHRpZiAodG9vbFNldE1hdGNoZXModG9vbFNldCwgZXhjbHVkZVNldCkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMoKSkge1xuXHRcdFx0XHRcdC8vIEV4cGxpY2l0IHRvb2wgcmVmZXJlbmNlIG92ZXJyaWRlcyB0b29sc2V0IGV4Y2x1c2lvblxuXHRcdFx0XHRcdGlmICghZXhwbGljaXRseUluY2x1ZGVkVG9vbHMuaGFzKHRvb2wpKSB7XG5cdFx0XHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCBmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhlbiBwcm9jZXNzIGluZGl2aWR1YWwgdG9vbHMgLSBleHBsaWNpdCBleGNsdXNpb24gYWx3YXlzIHdpbnNcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgYWxsVG9vbHMpIHtcblx0XHRcdGlmICh0b29sTWF0Y2hlcyh0b29sLCBleGNsdWRlU2V0KSkge1xuXHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiBhbGxUb29sU2V0cykge1xuXHRcdFx0Zm9yIChjb25zdCB0b29sIG9mIHRvb2xTZXQuZ2V0VG9vbHMoKSkge1xuXHRcdFx0XHRpZiAodG9vbE1hdGNoZXModG9vbCwgZXhjbHVkZVNldCkpIHtcblx0XHRcdFx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBDb2xsZWN0IHVua25vd24gaWRlbnRpZmllcnNcblx0Y29uc3QgYWxsSWRlbnRpZmllcnMgPSBuZXcgU2V0KFsuLi4odG9vbHNJbmNsdWRlID8/IFtdKSwgLi4uKHRvb2xzRXhjbHVkZSA/PyBbXSldKTtcblx0Y29uc3QgdW5rbm93bklkZW50aWZpZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGlkZW50aWZpZXIgb2YgYWxsSWRlbnRpZmllcnMpIHtcblx0XHRpZiAoIW1hdGNoZWRJZGVudGlmaWVycy5oYXMoaWRlbnRpZmllcikpIHtcblx0XHRcdHVua25vd25JZGVudGlmaWVycy5wdXNoKGlkZW50aWZpZXIpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFZhbGlkYXRlIGF0IGxlYXN0IG9uZSB0b29sIGlzIGVuYWJsZWRcblx0Y29uc3QgZW5hYmxlZFRvb2xDb3VudCA9IEFycmF5LmZyb20oZW5hYmxlbWVudE1hcC5lbnRyaWVzKCkpLmZpbHRlcigoW2l0ZW0sIGVuYWJsZWRdKSA9PiBlbmFibGVkICYmICFpc1Rvb2xTZXQoaXRlbSkpLmxlbmd0aDtcblx0aWYgKGVuYWJsZWRUb29sQ291bnQgPT09IDApIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rvb2wgZmlsdGVyaW5nIHJlc3VsdGVkIGluIHplcm8gZW5hYmxlZCB0b29scy4gQXQgbGVhc3Qgb25lIHRvb2wgbXVzdCBiZSBlbmFibGVkLicpO1xuXHR9XG5cblx0Ly8gQ2FsY3VsYXRlIHRvb2xzZXQgZW5hYmxlbWVudCBiYXNlZCBvbiB3aGV0aGVyIGFsbCBtZW1iZXIgdG9vbHMgYXJlIGVuYWJsZWRcblx0Zm9yIChjb25zdCB0b29sU2V0IG9mIGFsbFRvb2xTZXRzKSB7XG5cdFx0Y29uc3QgdG9vbFNldFRvb2xzID0gQXJyYXkuZnJvbSh0b29sU2V0LmdldFRvb2xzKCkpO1xuXHRcdGNvbnN0IGFsbFRvb2xzRW5hYmxlZCA9IHRvb2xTZXRUb29scy5sZW5ndGggPiAwICYmIHRvb2xTZXRUb29scy5ldmVyeSh0ID0+IGVuYWJsZW1lbnRNYXAuZ2V0KHQpID09PSB0cnVlKTtcblx0XHRlbmFibGVtZW50TWFwLnNldCh0b29sU2V0LCBhbGxUb29sc0VuYWJsZWQpO1xuXHR9XG5cblx0cmV0dXJuIHsgZW5hYmxlbWVudE1hcDogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21NYXAoZW5hYmxlbWVudE1hcCksIHVua25vd25JZGVudGlmaWVycyB9O1xufVxuXG5cbi8qKlxuICogUmV0dXJucyB3aGV0aGVyIHdlIGNhbiBjb250aW51ZSBjbGVhcmluZy9zd2l0Y2hpbmcgY2hhdCBzZXNzaW9ucywgZmFsc2UgdG8gY2FuY2VsLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gaGFuZGxlQ3VycmVudEVkaXRpbmdTZXNzaW9uKG1vZGVsOiBJQ2hhdE1vZGVsLCBwaHJhc2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0cmV0dXJuIHNob3dDbGVhckVkaXRpbmdTZXNzaW9uQ29uZmlybWF0aW9uKG1vZGVsLCBkaWFsb2dTZXJ2aWNlLCB7IG1lc3NhZ2VPdmVycmlkZTogcGhyYXNlIH0pO1xufVxuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciB3ZSBjYW4gc3dpdGNoIHRoZSBhZ2VudCwgYmFzZWQgb24gd2hldGhlciB0aGUgdXNlciBoYWQgdG8gYWdyZWUgdG8gY2xlYXIgdGhlIHNlc3Npb24sIGZhbHNlIHRvIGNhbmNlbC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGhhbmRsZU1vZGVTd2l0Y2goXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRmcm9tTW9kZTogQ2hhdE1vZGVLaW5kLFxuXHR0b01vZGU6IENoYXRNb2RlS2luZCxcblx0cmVxdWVzdENvdW50OiBudW1iZXIsXG5cdG1vZGVsOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkLFxuKTogUHJvbWlzZTxmYWxzZSB8IHsgbmVlZFRvQ2xlYXJTZXNzaW9uOiBib29sZWFuIH0+IHtcblx0aWYgKCFtb2RlbD8uZWRpdGluZ1Nlc3Npb24gfHwgZnJvbU1vZGUgPT09IHRvTW9kZSkge1xuXHRcdHJldHVybiB7IG5lZWRUb0NsZWFyU2Vzc2lvbjogZmFsc2UgfTtcblx0fVxuXG5cdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRjb25zdCBuZWVkVG9DbGVhckVkaXRzID0gKGZyb21Nb2RlID09PSBDaGF0TW9kZUtpbmQuRWRpdCB8fCB0b01vZGUgPT09IENoYXRNb2RlS2luZC5FZGl0KSAmJiByZXF1ZXN0Q291bnQgPiAwO1xuXHRpZiAobmVlZFRvQ2xlYXJFZGl0cykge1xuXHRcdC8vIFN3aXRjaGluZyBpbnRvIG9yIG91dCBvZiBlZGl0IG1vZGUsIGFzayB0byBkaXNjYXJkIHRoZSBzZXNzaW9uXG5cdFx0Y29uc3QgcGhyYXNlID0gbG9jYWxpemUoJ3N3aXRjaE1vZGUuY29uZmlybVBocmFzZScsIFwiU3dpdGNoaW5nIGFnZW50cyB3aWxsIGVuZCB5b3VyIGN1cnJlbnQgZWRpdCBzZXNzaW9uLlwiKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRFZGl0cyA9IG1vZGVsLmVkaXRpbmdTZXNzaW9uLmVudHJpZXMuZ2V0KCk7XG5cdFx0Y29uc3QgdW5kZWNpZGVkRWRpdHMgPSBjdXJyZW50RWRpdHMuZmlsdGVyKChlZGl0KSA9PiBlZGl0LnN0YXRlLmdldCgpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblx0XHRpZiAodW5kZWNpZGVkRWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKCFhd2FpdCBoYW5kbGVDdXJyZW50RWRpdGluZ1Nlc3Npb24obW9kZWwsIHBocmFzZSwgZGlhbG9nU2VydmljZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBuZWVkVG9DbGVhclNlc3Npb246IHRydWUgfTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY29uZmlybWF0aW9uID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudC5uZXdTZXNzaW9uJywgXCJTdGFydCBuZXcgc2Vzc2lvbj9cIiksXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudC5uZXdTZXNzaW9uTWVzc2FnZScsIFwiQ2hhbmdpbmcgdGhlIGFnZW50IHdpbGwgZW5kIHlvdXIgY3VycmVudCBlZGl0IHNlc3Npb24uIFdvdWxkIHlvdSBsaWtlIHRvIGNoYW5nZSB0aGUgYWdlbnQ/XCIpLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnYWdlbnQubmV3U2Vzc2lvbi5jb25maXJtJywgXCJZZXNcIiksXG5cdFx0XHRcdHR5cGU6ICdpbmZvJ1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIWNvbmZpcm1hdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4geyBuZWVkVG9DbGVhclNlc3Npb246IHRydWUgfTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBuZWVkVG9DbGVhclNlc3Npb246IGZhbHNlIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNsZWFyRWRpdGluZ1Nlc3Npb25Db25maXJtYXRpb25PcHRpb25zIHtcblx0dGl0bGVPdmVycmlkZT86IHN0cmluZztcblx0bWVzc2FnZU92ZXJyaWRlPzogc3RyaW5nO1xuXHRpc0FyY2hpdmVBY3Rpb24/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIENsZWFycyB0aGUgY3VycmVudCBjaGF0IHNlc3Npb24gYW5kIHN0YXJ0cyBhIG5ldyBvbmUgdXNpbmcgdGhlIHNoYXJlZFxuICogbmV3LXNlc3Npb24gaGFybmVzcyByZXNvbHZlci5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNsZWFyQ2hhdFNlc3Npb25QcmVzZXJ2aW5nVHlwZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgd2lkZ2V0OiBJQ2hhdFdpZGdldCwgc2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdGNvbnN0IGN1cnJlbnRSZXNvdXJjZSA9IHdpZGdldC52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0Y29uc3QgY3VycmVudFNlc3Npb25UeXBlID0gY3VycmVudFJlc291cmNlID8gZ2V0Q2hhdFNlc3Npb25UeXBlKGN1cnJlbnRSZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHsgc2Vzc2lvblR5cGU6IG5ld1Nlc3Npb25UeXBlLCBpc1ByZWZlckNvcGlsb3RIYXJuZXNzU3dhcCB9ID0gcmVzb2x2ZURlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoYWNjZXNzb3IsIHsgZXhwbGljaXRPdmVycmlkZTogc2Vzc2lvblR5cGUsIGN1cnJlbnRTZXNzaW9uVHlwZSB9KTtcblx0aWYgKGlzSUNoYXRWaWV3Vmlld0NvbnRleHQod2lkZ2V0LnZpZXdDb250ZXh0KSkge1xuXHRcdGNvbnN0IHZpZXcgPSBhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXcoQ2hhdFZpZXdJZCkgYXMgQ2hhdFZpZXdQYW5lO1xuXHRcdGlmIChuZXdTZXNzaW9uVHlwZSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdC8vIExvYWQgYSBzZXNzaW9uIG9mIHRoZSByZXNvbHZlZCB0eXBlIGluIHRoZSBzaWRlYmFyLlxuXHRcdFx0YXdhaXQgdmlldy5sb2FkU2Vzc2lvbihVUkkuZnJvbSh7IHNjaGVtZTogbmV3U2Vzc2lvblR5cGUsIHBhdGg6IGAvdW50aXRsZWQtJHtnZW5lcmF0ZVV1aWQoKX1gIH0pKTtcblx0XHRcdC8vIENvbnN1bWUgdGhlIG9uZS10aW1lIG1pZ3JhdGlvbiBvbmx5IG5vdyB0aGF0IHRoZSBzd2FwIGhhcyBiZWVuIGFwcGxpZWQuXG5cdFx0XHRpZiAoaXNQcmVmZXJDb3BpbG90SGFybmVzc1N3YXApIHtcblx0XHRcdFx0bWFya1ByZWZlcnJlZENvcGlsb3RIYXJuZXNzKHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVGhlIHJlc29sdmVkIHR5cGUgaXMgbG9jYWwgKGFuIGV4cGxpY2l0IHJlcXVlc3Qgb3Igc2Vzc2lvblxuXHRcdFx0Ly8gcHJlc2VydmF0aW9uKS4gQSBwbGFpbiBgd2lkZ2V0LmNsZWFyKClgIHJlLWFjcXVpcmVzIHRoZSBjb21wdXRlZFxuXHRcdFx0Ly8gZGVmYXVsdCAoYSBub24tbG9jYWwgaGFybmVzcyB3aGVuIHRoZSBhZ2VudCBob3N0IGlzIGVuYWJsZWQpLCBzb1xuXHRcdFx0Ly8gc3RhcnQgYSBsb2NhbCBzZXNzaW9uIGV4cGxpY2l0bHkgdG8gaG9ub3IgdGhlIHJlc29sdmVkIHR5cGUuXG5cdFx0XHRhd2FpdCB2aWV3LnN0YXJ0TmV3TG9jYWxTZXNzaW9uKCk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdC8vIEZvciB0aGUgZWRpdG9yLCB0aHJlYWQgdGhlIHJlc29sdmVkIHR5cGUgdGhyb3VnaCB0aGUgY2xlYXIgcGF0aCBzb1xuXHRcdC8vIGNsZWFyQ2hhdEVkaXRvciBvcGVucyBhIHNlc3Npb24gb2YgdGhhdCB0eXBlIGluc3RlYWQgb2YgcmVjb21wdXRpbmdcblx0XHQvLyB0aGUgZGVmYXVsdCAod2hpY2ggd291bGQgZHJvcCBhbiBleHBsaWNpdCBvciBwcmVzZXJ2ZWQgbG9jYWwgcmVxdWVzdCkuXG5cdFx0YXdhaXQgd2lkZ2V0LmNsZWFyKG5ld1Nlc3Npb25UeXBlKTtcblx0XHRpZiAoaXNQcmVmZXJDb3BpbG90SGFybmVzc1N3YXApIHtcblx0XHRcdG1hcmtQcmVmZXJyZWRDb3BpbG90SGFybmVzcyhzdG9yYWdlU2VydmljZSk7XG5cdFx0fVxuXHR9XG59XG5cblxuLy8gLS0tIENoYXQgU3VibWVudXMgaW4gdmFyaW91cyBDb21wb25lbnRzXG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQ29udGV4dCwge1xuXHRzdWJtZW51OiBNZW51SWQuQ2hhdFRleHRFZGl0b3JNZW51LFxuXHRncm91cDogJzFfY2hhdCcsXG5cdG9yZGVyOiA1LFxuXHR0aXRsZTogbG9jYWxpemUoJ2dlbmVyYXRlQ29kZScsIFwiR2VuZXJhdGUgQ29kZVwiKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdClcbn0pO1xuXG4vLyAtLS0gQ2hhdCBEZWZhdWx0IFZpc2liaWxpdHlcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZURlZmF1bHRWaXNpYmlsaXR5QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZURlZmF1bHRWaXNpYmlsaXR5Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQudG9nZ2xlRGVmYXVsdFZpc2liaWxpdHkubGFiZWwnLCBcIlNob3cgVmlldyBieSBEZWZhdWx0XCIpLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLnNlY29uZGFyeVNpZGVCYXIuZGVmYXVsdFZpc2liaWxpdHknLCAnaGlkZGVuJykubmVnYXRlKCksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgQ2hhdFZpZXdJZCksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLnBhbmVsTG9jYXRpb24uaXNFcXVhbFRvKFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0Z3JvdXA6ICc1X2NvbmZpZ3VyZSdcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY3VycmVudFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2hpZGRlbicgfCB1bmtub3duPignd29ya2JlbmNoLnNlY29uZGFyeVNpZGVCYXIuZGVmYXVsdFZpc2liaWxpdHknKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnd29ya2JlbmNoLnNlY29uZGFyeVNpZGVCYXIuZGVmYXVsdFZpc2liaWxpdHknLCBjdXJyZW50VmFsdWUgIT09ICdoaWRkZW4nID8gJ2hpZGRlbicgOiAndmlzaWJsZScpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEVkaXRUb29sQXBwcm92YWwgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZWRpdFRvb2xBcHByb3ZhbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjaGF0LmVkaXRUb29sQXBwcm92YWwubGFiZWwnLCBcIk1hbmFnZSBUb29sIEFwcHJvdmFsXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplMignY2hhdC5lZGl0VG9vbEFwcHJvdmFsLmRlc2NyaXB0aW9uJywgXCJFZGl0L21hbmFnZSB0aGUgdG9vbCBhcHByb3ZhbCBhbmQgY29uZmlybWF0aW9uIHByZWZlcmVuY2VzIGZvciBBSSBjaGF0IGFnZW50cy5cIiksXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNjb3BlPzogJ3dvcmtzcGFjZScgfCAncHJvZmlsZScgfCAnc2Vzc2lvbicpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maXJtYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRcdGNvbmZpcm1hdGlvblNlcnZpY2UubWFuYWdlQ29uZmlybWF0aW9uUHJlZmVyZW5jZXMoWy4uLnRvb2xzU2VydmljZS5nZXRBbGxUb29sc0luY2x1ZGluZ0Rpc2FibGVkKCldLCBzY29wZSA/IHsgZGVmYXVsdFNjb3BlOiBzY29wZSB9IDogdW5kZWZpbmVkKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGFBQWE7QUFFdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBRXBCLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFpQyxRQUFRLGNBQWMsdUJBQXVCO0FBQ3ZGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZC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
