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
import { timeout } from "../../../../base/common/async.js";
import { MarkdownString, isMarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import * as nls from "../../../../nls.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import { SessionConfigKey } from "../../../../platform/agentHost/common/sessionConfigKeys.js";
import { ActionType } from "../../../../platform/agentHost/common/state/protocol/actions.js";
import { StateComponents } from "../../../../platform/agentHost/common/state/sessionState.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IChatAgentService } from "../common/participants/chatAgents.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { IChatSlashCommandService } from "../common/participants/chatSlashCommands.js";
import { IChatService } from "../common/chatService/chatService.js";
import { IChatSessionsService, SessionType } from "../common/chatSessionsService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel } from "../common/constants.js";
import { getChatSessionType, isUntitledChatSession } from "../common/model/chatUri.js";
import { ACTION_ID_NEW_CHAT } from "./actions/chatActions.js";
import { ChatSubmitAction, OpenModePickerAction, OpenModelPickerAction } from "./actions/chatExecuteActions.js";
import { ManagePluginsAction } from "./actions/chatPluginActions.js";
import { ConfigureToolsAction } from "./actions/chatToolActions.js";
import { IAgentSessionsService } from "./agentSessions/agentSessionsService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "./agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js";
import { toAgentHostBackendSessionUri } from "./agentSessions/agentHost/agentHostSessionUri.js";
import { IAgentHostUntitledProvisionalSessionService } from "./agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js";
import { CONFIGURE_INSTRUCTIONS_ACTION_ID } from "./promptSyntax/attachInstructionsAction.js";
import { showConfigureHooksQuickPick } from "./promptSyntax/hookActions.js";
import { CONFIGURE_PROMPTS_ACTION_ID } from "./promptSyntax/runPromptAction.js";
import { CONFIGURE_SKILLS_ACTION_ID } from "./promptSyntax/skillActions.js";
import { IChatWidgetService } from "./chat.js";
import { agentSlashCommandToMarkdown, agentToMarkdown } from "./widget/chatContentParts/chatMarkdownDecorationsRenderer.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { AICustomizationManagementCommands, AICustomizationManagementSection } from "./aiCustomization/aiCustomizationManagement.js";
import { IChatPetService } from "./chatPetService.js";
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId, getChatSessionArchiveActionWording } from "../../../../platform/chat/common/sessionArchiveActions.js";
let ChatSlashCommandsContribution = class extends Disposable {
  constructor(slashCommandService, commandService, chatAgentService, instantiationService, agentSessionsService, chatService, configurationService, chatWidgetService, agentHostService, agentHostProvisionalService, agentHostWorkingDirectoryResolver, workspaceContextService, chatPetService, environmentService) {
    super();
    this.environmentService = environmentService;
    this._store.add(slashCommandService.registerSlashCommand({
      command: "vscode-pet",
      detail: nls.localize("vscodePet", "Toggle an interactive VS Code pet (Experimental)"),
      sortText: "z3_vscodePet",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat]
    }, async () => {
      chatPetService.toggle();
    }));
    const clearCommandRegistration = this._register(new MutableDisposable());
    const registerClearCommand = () => {
      const wording = getChatSessionArchiveActionWording(configurationService);
      clearCommandRegistration.clear();
      clearCommandRegistration.value = slashCommandService.registerSlashCommand({
        command: "clear",
        detail: wording === ChatSessionArchiveActionWording.MarkAsDone ? nls.localize("clear.markDone", "Start a new chat and mark the current one as done") : nls.localize("clear.archive", "Start a new chat and archive the current one"),
        sortText: "z2_clear",
        executeImmediately: true,
        locations: [ChatAgentLocation.Chat]
      }, async (_prompt, _progress, _history, _location, sessionResource) => {
        agentSessionsService.getSession(sessionResource)?.setArchived(true);
        commandService.executeCommand(ACTION_ID_NEW_CHAT);
      });
    };
    registerClearCommand();
    this._register(configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(ChatSessionArchiveActionWordingSettingId)) {
        registerClearCommand();
      }
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "hooks",
      detail: nls.localize("hooks", "Configure hooks"),
      sortText: "z3_hooks",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [SessionType.Local, SessionType.AgentHostCopilot]
    }, async (_prompt, _progress, _history, _location, sessionResource) => {
      if (getChatSessionType(sessionResource) === SessionType.AgentHostCopilot) {
        await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Hooks);
      } else {
        await instantiationService.invokeFunction(showConfigureHooksQuickPick);
      }
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "models",
      detail: nls.localize("models", "Open the model picker"),
      sortText: "z3_models",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat]
    }, async (_promp) => {
      await commandService.executeCommand(OpenModelPickerAction.ID);
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "tools",
      detail: nls.localize("tools", "Configure tools"),
      sortText: "z3_tools",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [SessionType.Local]
    }, async () => {
      await commandService.executeCommand(ConfigureToolsAction.ID);
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "plugins",
      detail: nls.localize("plugins", "Manage plugins"),
      sortText: "z3_plugins",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [SessionType.Local]
    }, async () => {
      await commandService.executeCommand(ManagePluginsAction.ID);
    }));
    if (!this.environmentService.isSessionsWindow) {
      this._store.add(slashCommandService.registerSlashCommand({
        command: "debug",
        detail: nls.localize("debug", "Show Chat Debug View"),
        sortText: "z3_debug",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat]
      }, async () => {
        await commandService.executeCommand("github.copilot.debug.showChatLogView");
      }));
    }
    this._store.add(slashCommandService.registerSlashCommand({
      command: "agents",
      detail: nls.localize("agents", "Configure custom agents"),
      sortText: "z3_agents",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [SessionType.Local, SessionType.AgentHostCopilot]
    }, async (_prompt, _progress, _history, _location, sessionResource) => {
      if (getChatSessionType(sessionResource) === SessionType.AgentHostCopilot) {
        await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Agents);
      } else {
        await commandService.executeCommand(OpenModePickerAction.ID);
      }
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "skills",
      detail: nls.localize("skills", "Configure skills"),
      sortText: "z3_skills",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [SessionType.Local, SessionType.AgentHostCopilot]
    }, async (_prompt, _progress, _history, _location, sessionResource) => {
      if (getChatSessionType(sessionResource) === SessionType.AgentHostCopilot) {
        await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Skills);
      } else {
        await commandService.executeCommand(CONFIGURE_SKILLS_ACTION_ID);
      }
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "instructions",
      detail: nls.localize("instructions", "Configure instructions"),
      sortText: "z3_instructions",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [SessionType.Local, SessionType.AgentHostCopilot]
    }, async (_prompt, _progress, _history, _location, sessionResource) => {
      if (getChatSessionType(sessionResource) === SessionType.AgentHostCopilot) {
        await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Instructions);
      } else {
        await commandService.executeCommand(CONFIGURE_INSTRUCTIONS_ACTION_ID);
      }
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "prompts",
      detail: nls.localize("prompts", "Configure prompt files"),
      sortText: "z3_prompts",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [SessionType.Local, SessionType.AgentHostCopilot]
    }, async (_prompt, _progress, _history, _location, sessionResource) => {
      if (getChatSessionType(sessionResource) === SessionType.AgentHostCopilot) {
        await commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, AICustomizationManagementSection.Prompts);
      } else {
        await commandService.executeCommand(CONFIGURE_PROMPTS_ACTION_ID);
      }
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "fork",
      detail: nls.localize("fork", "Fork conversation into a new chat session"),
      sortText: "z2_fork",
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      when: ContextKeyExpr.or(
        ChatContextKeys.lockedToCodingAgent.negate(),
        ChatContextKeys.chatSessionSupportsFork
      )
    }, async (_prompt, _progress, _history, _location, sessionResource) => {
      await commandService.executeCommand("workbench.action.chat.forkConversation", sessionResource);
    }));
    this._store.add(slashCommandService.registerSlashCommand({
      command: "rename",
      detail: nls.localize("rename", "Rename this chat"),
      sortText: "z2_rename",
      executeImmediately: false,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [SessionType.Local]
    }, async (prompt, _progress, _history, _location, sessionResource) => {
      const title = prompt.trim();
      if (title) {
        chatService.setChatSessionTitle(sessionResource, title);
      }
    }));
    const getAgentHostWorkingDirectory = (sessionResource) => {
      return agentHostWorkingDirectoryResolver.resolve(sessionResource) ?? workspaceContextService.getWorkspace().folders[0]?.uri;
    };
    const readAgentHostConfigValues = (backendSession) => {
      const state = agentHostService.getSubscriptionUnmanaged(StateComponents.Session, backendSession)?.value;
      return state && !(state instanceof Error) ? state.config?.values : void 0;
    };
    const setPermissionLevelForSession = async (sessionResource, level) => {
      const backendSession = toAgentHostBackendSessionUri(sessionResource);
      if (backendSession) {
        const permittedLevel = configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue === false ? ChatPermissionLevel.Default : level;
        const partial = { [SessionConfigKey.AutoApprove]: permittedLevel };
        const workingDirectory = getAgentHostWorkingDirectory(sessionResource);
        if (isUntitledChatSession(sessionResource)) {
          await agentHostProvisionalService.applyConfigChange(sessionResource, backendSession.scheme, workingDirectory, partial);
          return;
        }
        agentHostService.dispatch(backendSession.toString(), {
          type: ActionType.SessionConfigChanged,
          config: partial
        });
        const nextConfig = { ...readAgentHostConfigValues(backendSession) ?? {}, ...partial };
        void agentHostProvisionalService.refreshResolvedConfig(sessionResource, backendSession.scheme, workingDirectory, nextConfig);
        return;
      }
      const widget = chatWidgetService.getWidgetBySessionResource(sessionResource) ?? chatWidgetService.lastFocusedWidget;
      if (widget) {
        widget.input.setPermissionLevel(level);
      }
    };
    const autoApprovePolicyValue = configurationService.inspect(ChatConfiguration.GlobalAutoApprove).policyValue;
    if (autoApprovePolicyValue !== false) {
      this._store.add(slashCommandService.registerSlashCommand({
        command: "autoApprove",
        detail: nls.localize("autoApprove", "Set permissions to bypass approvals"),
        sortText: "z1_autoApprove",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat],
        sessionTypes: [SessionType.Local, SessionType.CopilotCLI]
      }, async (_prompt, _progress, _history, _location, sessionResource) => {
        await setPermissionLevelForSession(sessionResource, ChatPermissionLevel.AutoApprove);
      }));
      this._store.add(slashCommandService.registerSlashCommand({
        command: "disableAutoApprove",
        detail: nls.localize("disableAutoApprove", "Set permissions back to default"),
        sortText: "z1_disableAutoApprove",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat],
        sessionTypes: [SessionType.Local, SessionType.CopilotCLI]
      }, async (_prompt, _progress, _history, _location, sessionResource) => {
        await setPermissionLevelForSession(sessionResource, ChatPermissionLevel.Default);
      }));
      this._store.add(slashCommandService.registerSlashCommand({
        command: "yolo",
        detail: nls.localize("yolo", "Set permissions to bypass approvals"),
        sortText: "z1_yolo",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat],
        sessionTypes: [SessionType.Local, SessionType.CopilotCLI]
      }, async (_prompt, _progress, _history, _location, sessionResource) => {
        await setPermissionLevelForSession(sessionResource, ChatPermissionLevel.AutoApprove);
      }));
      this._store.add(slashCommandService.registerSlashCommand({
        command: "disableYolo",
        detail: nls.localize("disableYolo", "Set permissions back to default"),
        sortText: "z1_disableYolo",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat],
        sessionTypes: [SessionType.Local, SessionType.CopilotCLI]
      }, async (_prompt, _progress, _history, _location, sessionResource) => {
        await setPermissionLevelForSession(sessionResource, ChatPermissionLevel.Default);
      }));
      this._store.add(slashCommandService.registerSlashCommand({
        command: "autopilot",
        detail: nls.localize("autopilot", "Set permissions to autopilot mode"),
        sortText: "z1_autopilot",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat],
        sessionTypes: [SessionType.Local, SessionType.CopilotCLI]
      }, async (_prompt, _progress, _history, _location, sessionResource) => {
        await setPermissionLevelForSession(sessionResource, ChatPermissionLevel.Autopilot);
      }));
      this._store.add(slashCommandService.registerSlashCommand({
        command: "exitAutopilot",
        detail: nls.localize("exitAutopilot", "Set permissions back to default"),
        sortText: "z1_exitAutopilot",
        executeImmediately: true,
        silent: true,
        locations: [ChatAgentLocation.Chat],
        sessionTypes: [SessionType.Local, SessionType.CopilotCLI]
      }, async (_prompt, _progress, _history, _location, sessionResource) => {
        await setPermissionLevelForSession(sessionResource, ChatPermissionLevel.Default);
      }));
    }
    this._store.add(slashCommandService.registerSlashCommand({
      command: "help",
      detail: "",
      sortText: "z1_help",
      executeImmediately: true,
      locations: [ChatAgentLocation.Chat],
      modes: [ChatModeKind.Ask],
      sessionTypes: [SessionType.Local]
    }, async (prompt, progress, _history, _location, sessionResource) => {
      const defaultAgent = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
      const agents = chatAgentService.getAgents();
      if (defaultAgent?.metadata.helpTextPrefix) {
        if (isMarkdownString(defaultAgent.metadata.helpTextPrefix)) {
          progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: "markdownContent" });
        } else {
          progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPrefix), kind: "markdownContent" });
        }
        progress.report({ content: new MarkdownString("\n\n"), kind: "markdownContent" });
      }
      const agentText = (await Promise.all(agents.filter((a) => !a.isDefault && !a.isCore).filter((a) => a.locations.includes(ChatAgentLocation.Chat)).map(async (a) => {
        const description = a.description ? `- ${a.description}` : "";
        const agentMarkdown = instantiationService.invokeFunction((accessor) => agentToMarkdown(a, sessionResource, true, accessor));
        const agentLine = `- ${agentMarkdown} ${description}`;
        const commandText = a.slashCommands.map((c) => {
          const description2 = c.description ? `- ${c.description}` : "";
          return `	* ${agentSlashCommandToMarkdown(a, c, sessionResource)} ${description2}`;
        }).join("\n");
        return (agentLine + "\n" + commandText).trim();
      }))).join("\n");
      progress.report({ content: new MarkdownString(agentText, { isTrusted: { enabledCommands: [ChatSubmitAction.ID] } }), kind: "markdownContent" });
      if (defaultAgent?.metadata.helpTextPostfix) {
        progress.report({ content: new MarkdownString("\n\n"), kind: "markdownContent" });
        if (isMarkdownString(defaultAgent.metadata.helpTextPostfix)) {
          progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: "markdownContent" });
        } else {
          progress.report({ content: new MarkdownString(defaultAgent.metadata.helpTextPostfix), kind: "markdownContent" });
        }
      }
      await timeout(200);
    }));
  }
};
ChatSlashCommandsContribution.ID = "workbench.contrib.chatSlashCommands";
ChatSlashCommandsContribution = __decorateClass([
  __decorateParam(0, IChatSlashCommandService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IChatAgentService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IAgentSessionsService),
  __decorateParam(5, IChatService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IChatWidgetService),
  __decorateParam(8, IAgentHostService),
  __decorateParam(9, IAgentHostUntitledProvisionalSessionService),
  __decorateParam(10, IAgentHostSessionWorkingDirectoryResolver),
  __decorateParam(11, IWorkspaceContextService),
  __decorateParam(12, IChatPetService),
  __decorateParam(13, IWorkbenchEnvironmentService)
], ChatSlashCommandsContribution);
let ChatSessionOptionSlashCommandsContribution = class extends Disposable {
  constructor(chatSessionsService, slashCommandService, logService) {
    super();
    this.chatSessionsService = chatSessionsService;
    this.slashCommandService = slashCommandService;
    this.logService = logService;
    this._registrationsByType = this._register(new DisposableMap());
    this._register(this.chatSessionsService.onDidChangeOptionGroups((chatSessionType) => {
      this.refreshForSessionType(chatSessionType);
    }));
  }
  refreshForSessionType(chatSessionType) {
    this._registrationsByType.deleteAndDispose(chatSessionType);
    const groups = this.chatSessionsService.getOptionGroupsForSessionType(chatSessionType);
    if (!groups || groups.length === 0) {
      return;
    }
    const store = new DisposableStore();
    const seen = /* @__PURE__ */ new Set();
    for (const group of groups) {
      for (const item of group.items) {
        const name = item.slashCommand?.trim();
        if (!name) {
          continue;
        }
        if (seen.has(name)) {
          this.logService.warn(`[ChatSessionOptionSlashCommands] Skipping duplicate slash command '${name}' contributed by session type '${chatSessionType}'.`);
          continue;
        }
        if (this.slashCommandService.hasCommand(name, chatSessionType)) {
          this.logService.warn(`[ChatSessionOptionSlashCommands] Slash command '${name}' contributed by session type '${chatSessionType}' is already registered; skipping.`);
          continue;
        }
        seen.add(name);
        store.add(this.registerOne(chatSessionType, group, item, name));
      }
    }
    if (store.isDisposed || seen.size === 0) {
      store.dispose();
      return;
    }
    this._registrationsByType.set(chatSessionType, store);
  }
  registerOne(chatSessionType, group, item, name) {
    return this.slashCommandService.registerSlashCommand({
      command: name,
      detail: item.description ?? nls.localize("chatSessionOption.slashCommand.detail", "Switch to '{0}'", item.name),
      sortText: `z1_${name}`,
      executeImmediately: true,
      silent: true,
      locations: [ChatAgentLocation.Chat],
      sessionTypes: [chatSessionType]
    }, async (_prompt, _progress, _history, _location, sessionResource) => {
      if (!sessionResource) {
        return;
      }
      this.chatSessionsService.setSessionOption(sessionResource, group.id, item);
    });
  }
};
ChatSessionOptionSlashCommandsContribution.ID = "workbench.contrib.chatSessionOptionSlashCommands";
ChatSessionOptionSlashCommandsContribution = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, IChatSlashCommandService),
  __decorateParam(2, ILogService)
], ChatSessionOptionSlashCommandsContribution);
export {
  ChatSessionOptionSlashCommandsContribution,
  ChatSlashCommandsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2xhc2hDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZywgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFN0YXRlQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0U2xhc2hDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UsIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXAsIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCwgQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBpc1VudGl0bGVkQ2hhdFNlc3Npb24gfSBmcm9tICcuLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBBQ1RJT05fSURfTkVXX0NIQVQgfSBmcm9tICcuL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFN1Ym1pdEFjdGlvbiwgT3Blbk1vZGVQaWNrZXJBY3Rpb24sIE9wZW5Nb2RlbFBpY2tlckFjdGlvbiB9IGZyb20gJy4vYWN0aW9ucy9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWFuYWdlUGx1Z2luc0FjdGlvbiB9IGZyb20gJy4vYWN0aW9ucy9jaGF0UGx1Z2luQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVUb29sc0FjdGlvbiB9IGZyb20gJy4vYWN0aW9ucy9jaGF0VG9vbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLmpzJztcbmltcG9ydCB7IHRvQWdlbnRIb3N0QmFja2VuZFNlc3Npb25VcmkgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFNlc3Npb25VcmkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENPTkZJR1VSRV9JTlNUUlVDVElPTlNfQUNUSU9OX0lEIH0gZnJvbSAnLi9wcm9tcHRTeW50YXgvYXR0YWNoSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzJztcbmltcG9ydCB7IHNob3dDb25maWd1cmVIb29rc1F1aWNrUGljayB9IGZyb20gJy4vcHJvbXB0U3ludGF4L2hvb2tBY3Rpb25zLmpzJztcbmltcG9ydCB7IENPTkZJR1VSRV9QUk9NUFRTX0FDVElPTl9JRCB9IGZyb20gJy4vcHJvbXB0U3ludGF4L3J1blByb21wdEFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDT05GSUdVUkVfU0tJTExTX0FDVElPTl9JRCB9IGZyb20gJy4vcHJvbXB0U3ludGF4L3NraWxsQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuL2NoYXQuanMnO1xuaW1wb3J0IHsgYWdlbnRTbGFzaENvbW1hbmRUb01hcmtkb3duLCBhZ2VudFRvTWFya2Rvd24gfSBmcm9tICcuL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcywgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24gfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElDaGF0UGV0U2VydmljZSB9IGZyb20gJy4vY2hhdFBldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZywgQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZ1NldHRpbmdJZCwgZ2V0Q2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL3Nlc3Npb25BcmNoaXZlQWN0aW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0U2xhc2hDb21tYW5kc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0U2xhc2hDb21tYW5kcyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2xhc2hDb21tYW5kU2VydmljZSBzbGFzaENvbW1hbmRTZXJ2aWNlOiBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudFNlc3Npb25zU2VydmljZSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0U2VydmljZSBhZ2VudEhvc3RTZXJ2aWNlOiBJQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSBhZ2VudEhvc3RQcm92aXNpb25hbFNlcnZpY2U6IElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyIGFnZW50SG9zdFdvcmtpbmdEaXJlY3RvcnlSZXNvbHZlcjogSUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVzb2x2ZXIsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFBldFNlcnZpY2UgY2hhdFBldFNlcnZpY2U6IElDaGF0UGV0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChzbGFzaENvbW1hbmRTZXJ2aWNlLnJlZ2lzdGVyU2xhc2hDb21tYW5kKHtcblx0XHRcdGNvbW1hbmQ6ICd2c2NvZGUtcGV0Jyxcblx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCd2c2NvZGVQZXQnLCBcIlRvZ2dsZSBhbiBpbnRlcmFjdGl2ZSBWUyBDb2RlIHBldCAoRXhwZXJpbWVudGFsKVwiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfdnNjb2RlUGV0Jyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdXG5cdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2hhdFBldFNlcnZpY2UudG9nZ2xlKCk7XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGNsZWFyQ29tbWFuZFJlZ2lzdHJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRjb25zdCByZWdpc3RlckNsZWFyQ29tbWFuZCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmRpbmcgPSBnZXRDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNsZWFyQ29tbWFuZFJlZ2lzdHJhdGlvbi5jbGVhcigpO1xuXHRcdFx0Y2xlYXJDb21tYW5kUmVnaXN0cmF0aW9uLnZhbHVlID0gc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdjbGVhcicsXG5cdFx0XHRcdGRldGFpbDogd29yZGluZyA9PT0gQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZy5NYXJrQXNEb25lXG5cdFx0XHRcdFx0PyBubHMubG9jYWxpemUoJ2NsZWFyLm1hcmtEb25lJywgXCJTdGFydCBhIG5ldyBjaGF0IGFuZCBtYXJrIHRoZSBjdXJyZW50IG9uZSBhcyBkb25lXCIpXG5cdFx0XHRcdFx0OiBubHMubG9jYWxpemUoJ2NsZWFyLmFyY2hpdmUnLCBcIlN0YXJ0IGEgbmV3IGNoYXQgYW5kIGFyY2hpdmUgdGhlIGN1cnJlbnQgb25lXCIpLFxuXHRcdFx0XHRzb3J0VGV4dDogJ3oyX2NsZWFyJyxcblx0XHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XVxuXHRcdFx0fSwgYXN5bmMgKF9wcm9tcHQsIF9wcm9ncmVzcywgX2hpc3RvcnksIF9sb2NhdGlvbiwgc2Vzc2lvblJlc291cmNlKSA9PiB7XG5cdFx0XHRcdGFnZW50U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKT8uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFDVElPTl9JRF9ORVdfQ0hBVCk7XG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHJlZ2lzdGVyQ2xlYXJDb21tYW5kKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0U2Vzc2lvbkFyY2hpdmVBY3Rpb25Xb3JkaW5nU2V0dGluZ0lkKSkge1xuXHRcdFx0XHRyZWdpc3RlckNsZWFyQ29tbWFuZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnaG9va3MnLFxuXHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2hvb2tzJywgXCJDb25maWd1cmUgaG9va3NcIiksXG5cdFx0XHRzb3J0VGV4dDogJ3ozX2hvb2tzJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuTG9jYWwsIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3RdLFxuXHRcdH0sIGFzeW5jIChfcHJvbXB0LCBfcHJvZ3Jlc3MsIF9oaXN0b3J5LCBfbG9jYXRpb24sIHNlc3Npb25SZXNvdXJjZSkgPT4ge1xuXHRcdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpID09PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcy5PcGVuRWRpdG9yLCBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihzaG93Q29uZmlndXJlSG9va3NRdWlja1BpY2spO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnbW9kZWxzJyxcblx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdtb2RlbHMnLCBcIk9wZW4gdGhlIG1vZGVsIHBpY2tlclwiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfbW9kZWxzJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdH0sIGFzeW5jIChfcHJvbXApID0+IHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE9wZW5Nb2RlbFBpY2tlckFjdGlvbi5JRCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChzbGFzaENvbW1hbmRTZXJ2aWNlLnJlZ2lzdGVyU2xhc2hDb21tYW5kKHtcblx0XHRcdGNvbW1hbmQ6ICd0b29scycsXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgndG9vbHMnLCBcIkNvbmZpZ3VyZSB0b29sc1wiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfdG9vbHMnLFxuXHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHRzZXNzaW9uVHlwZXM6IFtTZXNzaW9uVHlwZS5Mb2NhbF0sXG5cdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ29uZmlndXJlVG9vbHNBY3Rpb24uSUQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAncGx1Z2lucycsXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgncGx1Z2lucycsIFwiTWFuYWdlIHBsdWdpbnNcIiksXG5cdFx0XHRzb3J0VGV4dDogJ3ozX3BsdWdpbnMnLFxuXHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHRzZXNzaW9uVHlwZXM6IFtTZXNzaW9uVHlwZS5Mb2NhbF0sXG5cdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoTWFuYWdlUGx1Z2luc0FjdGlvbi5JRCk7XG5cdFx0fSkpO1xuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHNsYXNoQ29tbWFuZFNlcnZpY2UucmVnaXN0ZXJTbGFzaENvbW1hbmQoe1xuXHRcdFx0XHRjb21tYW5kOiAnZGVidWcnLFxuXHRcdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnZGVidWcnLCBcIlNob3cgQ2hhdCBEZWJ1ZyBWaWV3XCIpLFxuXHRcdFx0XHRzb3J0VGV4dDogJ3ozX2RlYnVnJyxcblx0XHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0XHRzaWxlbnQ6IHRydWUsXG5cdFx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnZ2l0aHViLmNvcGlsb3QuZGVidWcuc2hvd0NoYXRMb2dWaWV3Jyk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JlLmFkZChzbGFzaENvbW1hbmRTZXJ2aWNlLnJlZ2lzdGVyU2xhc2hDb21tYW5kKHtcblx0XHRcdGNvbW1hbmQ6ICdhZ2VudHMnLFxuXHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2FnZW50cycsIFwiQ29uZmlndXJlIGN1c3RvbSBhZ2VudHNcIiksXG5cdFx0XHRzb3J0VGV4dDogJ3ozX2FnZW50cycsXG5cdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRzaWxlbnQ6IHRydWUsXG5cdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdHNlc3Npb25UeXBlczogW1Nlc3Npb25UeXBlLkxvY2FsLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90XSxcblx0XHR9LCBhc3luYyAoX3Byb21wdCwgX3Byb2dyZXNzLCBfaGlzdG9yeSwgX2xvY2F0aW9uLCBzZXNzaW9uUmVzb3VyY2UpID0+IHtcblx0XHRcdGlmIChnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSA9PT0gU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCkge1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMuT3BlbkVkaXRvciwgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE9wZW5Nb2RlUGlja2VyQWN0aW9uLklEKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHNsYXNoQ29tbWFuZFNlcnZpY2UucmVnaXN0ZXJTbGFzaENvbW1hbmQoe1xuXHRcdFx0Y29tbWFuZDogJ3NraWxscycsXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnc2tpbGxzJywgXCJDb25maWd1cmUgc2tpbGxzXCIpLFxuXHRcdFx0c29ydFRleHQ6ICd6M19za2lsbHMnLFxuXHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHRzZXNzaW9uVHlwZXM6IFtTZXNzaW9uVHlwZS5Mb2NhbCwgU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdF0sXG5cdFx0fSwgYXN5bmMgKF9wcm9tcHQsIF9wcm9ncmVzcywgX2hpc3RvcnksIF9sb2NhdGlvbiwgc2Vzc2lvblJlc291cmNlKSA9PiB7XG5cdFx0XHRpZiAoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgPT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpIHtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENvbW1hbmRzLk9wZW5FZGl0b3IsIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDT05GSUdVUkVfU0tJTExTX0FDVElPTl9JRCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChzbGFzaENvbW1hbmRTZXJ2aWNlLnJlZ2lzdGVyU2xhc2hDb21tYW5kKHtcblx0XHRcdGNvbW1hbmQ6ICdpbnN0cnVjdGlvbnMnLFxuXHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2luc3RydWN0aW9ucycsIFwiQ29uZmlndXJlIGluc3RydWN0aW9uc1wiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfaW5zdHJ1Y3Rpb25zJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuTG9jYWwsIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3RdLFxuXHRcdH0sIGFzeW5jIChfcHJvbXB0LCBfcHJvZ3Jlc3MsIF9oaXN0b3J5LCBfbG9jYXRpb24sIHNlc3Npb25SZXNvdXJjZSkgPT4ge1xuXHRcdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpID09PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90KSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRDb21tYW5kcy5PcGVuRWRpdG9yLCBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ09ORklHVVJFX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAncHJvbXB0cycsXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgncHJvbXB0cycsIFwiQ29uZmlndXJlIHByb21wdCBmaWxlc1wiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfcHJvbXB0cycsXG5cdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRzaWxlbnQ6IHRydWUsXG5cdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdHNlc3Npb25UeXBlczogW1Nlc3Npb25UeXBlLkxvY2FsLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90XSxcblx0XHR9LCBhc3luYyAoX3Byb21wdCwgX3Byb2dyZXNzLCBfaGlzdG9yeSwgX2xvY2F0aW9uLCBzZXNzaW9uUmVzb3VyY2UpID0+IHtcblx0XHRcdGlmIChnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSA9PT0gU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCkge1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMuT3BlbkVkaXRvciwgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0cyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDT05GSUdVUkVfUFJPTVBUU19BQ1RJT05fSUQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnZm9yaycsXG5cdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnZm9yaycsIFwiRm9yayBjb252ZXJzYXRpb24gaW50byBhIG5ldyBjaGF0IHNlc3Npb25cIiksXG5cdFx0XHRzb3J0VGV4dDogJ3oyX2ZvcmsnLFxuXHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2tlZFRvQ29kaW5nQWdlbnQubmVnYXRlKCksXG5cdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblN1cHBvcnRzRm9ya1xuXHRcdFx0KSxcblx0XHR9LCBhc3luYyAoX3Byb21wdCwgX3Byb2dyZXNzLCBfaGlzdG9yeSwgX2xvY2F0aW9uLCBzZXNzaW9uUmVzb3VyY2UpID0+IHtcblx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZm9ya0NvbnZlcnNhdGlvbicsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChzbGFzaENvbW1hbmRTZXJ2aWNlLnJlZ2lzdGVyU2xhc2hDb21tYW5kKHtcblx0XHRcdGNvbW1hbmQ6ICdyZW5hbWUnLFxuXHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ3JlbmFtZScsIFwiUmVuYW1lIHRoaXMgY2hhdFwiKSxcblx0XHRcdHNvcnRUZXh0OiAnejJfcmVuYW1lJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogZmFsc2UsXG5cdFx0XHRzaWxlbnQ6IHRydWUsXG5cdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdHNlc3Npb25UeXBlczogW1Nlc3Npb25UeXBlLkxvY2FsXSxcblx0XHR9LCBhc3luYyAocHJvbXB0LCBfcHJvZ3Jlc3MsIF9oaXN0b3J5LCBfbG9jYXRpb24sIHNlc3Npb25SZXNvdXJjZSkgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBwcm9tcHQudHJpbSgpO1xuXHRcdFx0aWYgKHRpdGxlKSB7XG5cdFx0XHRcdGNoYXRTZXJ2aWNlLnNldENoYXRTZXNzaW9uVGl0bGUoc2Vzc2lvblJlc291cmNlLCB0aXRsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGdldEFnZW50SG9zdFdvcmtpbmdEaXJlY3RvcnkgPSAoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0cmV0dXJuIGFnZW50SG9zdFdvcmtpbmdEaXJlY3RvcnlSZXNvbHZlci5yZXNvbHZlKHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdFx0Pz8gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXT8udXJpO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVhZEFnZW50SG9zdENvbmZpZ1ZhbHVlcyA9IChiYWNrZW5kU2Vzc2lvbjogVVJJKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhZ2VudEhvc3RTZXJ2aWNlLmdldFN1YnNjcmlwdGlvblVubWFuYWdlZChTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgYmFja2VuZFNlc3Npb24pPy52YWx1ZTtcblx0XHRcdHJldHVybiBzdGF0ZSAmJiAhKHN0YXRlIGluc3RhbmNlb2YgRXJyb3IpID8gc3RhdGUuY29uZmlnPy52YWx1ZXMgOiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRjb25zdCBzZXRQZXJtaXNzaW9uTGV2ZWxGb3JTZXNzaW9uID0gYXN5bmMgKHNlc3Npb25SZXNvdXJjZTogVVJJLCBsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCkgPT4ge1xuXHRcdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSB0b0FnZW50SG9zdEJhY2tlbmRTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoYmFja2VuZFNlc3Npb24pIHtcblx0XHRcdFx0Y29uc3QgcGVybWl0dGVkTGV2ZWwgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKS5wb2xpY3lWYWx1ZSA9PT0gZmFsc2Vcblx0XHRcdFx0XHQ/IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdFxuXHRcdFx0XHRcdDogbGV2ZWw7XG5cdFx0XHRcdGNvbnN0IHBhcnRpYWwgPSB7IFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogcGVybWl0dGVkTGV2ZWwgfTtcblx0XHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGdldEFnZW50SG9zdFdvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0YXdhaXQgYWdlbnRIb3N0UHJvdmlzaW9uYWxTZXJ2aWNlLmFwcGx5Q29uZmlnQ2hhbmdlKHNlc3Npb25SZXNvdXJjZSwgYmFja2VuZFNlc3Npb24uc2NoZW1lLCB3b3JraW5nRGlyZWN0b3J5LCBwYXJ0aWFsKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhZ2VudEhvc3RTZXJ2aWNlLmRpc3BhdGNoKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRcdGNvbmZpZzogcGFydGlhbCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IG5leHRDb25maWcgPSB7IC4uLihyZWFkQWdlbnRIb3N0Q29uZmlnVmFsdWVzKGJhY2tlbmRTZXNzaW9uKSA/PyB7fSksIC4uLnBhcnRpYWwgfTtcblx0XHRcdFx0dm9pZCBhZ2VudEhvc3RQcm92aXNpb25hbFNlcnZpY2UucmVmcmVzaFJlc29sdmVkQ29uZmlnKHNlc3Npb25SZXNvdXJjZSwgYmFja2VuZFNlc3Npb24uc2NoZW1lLCB3b3JraW5nRGlyZWN0b3J5LCBuZXh0Q29uZmlnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpID8/IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdFx0aWYgKHdpZGdldCkge1xuXHRcdFx0XHR3aWRnZXQuaW5wdXQuc2V0UGVybWlzc2lvbkxldmVsKGxldmVsKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUG9saWN5VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKS5wb2xpY3lWYWx1ZTtcblx0XHRpZiAoYXV0b0FwcHJvdmVQb2xpY3lWYWx1ZSAhPT0gZmFsc2UpIHtcblx0XHRcdHRoaXMuX3N0b3JlLmFkZChzbGFzaENvbW1hbmRTZXJ2aWNlLnJlZ2lzdGVyU2xhc2hDb21tYW5kKHtcblx0XHRcdFx0Y29tbWFuZDogJ2F1dG9BcHByb3ZlJyxcblx0XHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2F1dG9BcHByb3ZlJywgXCJTZXQgcGVybWlzc2lvbnMgdG8gYnlwYXNzIGFwcHJvdmFsc1wiKSxcblx0XHRcdFx0c29ydFRleHQ6ICd6MV9hdXRvQXBwcm92ZScsXG5cdFx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuTG9jYWwsIFNlc3Npb25UeXBlLkNvcGlsb3RDTEldLFxuXHRcdFx0fSwgYXN5bmMgKF9wcm9tcHQsIF9wcm9ncmVzcywgX2hpc3RvcnksIF9sb2NhdGlvbiwgc2Vzc2lvblJlc291cmNlKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHNldFBlcm1pc3Npb25MZXZlbEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3N0b3JlLmFkZChzbGFzaENvbW1hbmRTZXJ2aWNlLnJlZ2lzdGVyU2xhc2hDb21tYW5kKHtcblx0XHRcdFx0Y29tbWFuZDogJ2Rpc2FibGVBdXRvQXBwcm92ZScsXG5cdFx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdkaXNhYmxlQXV0b0FwcHJvdmUnLCBcIlNldCBwZXJtaXNzaW9ucyBiYWNrIHRvIGRlZmF1bHRcIiksXG5cdFx0XHRcdHNvcnRUZXh0OiAnejFfZGlzYWJsZUF1dG9BcHByb3ZlJyxcblx0XHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0XHRzaWxlbnQ6IHRydWUsXG5cdFx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0XHRzZXNzaW9uVHlwZXM6IFtTZXNzaW9uVHlwZS5Mb2NhbCwgU2Vzc2lvblR5cGUuQ29waWxvdENMSV0sXG5cdFx0XHR9LCBhc3luYyAoX3Byb21wdCwgX3Byb2dyZXNzLCBfaGlzdG9yeSwgX2xvY2F0aW9uLCBzZXNzaW9uUmVzb3VyY2UpID0+IHtcblx0XHRcdFx0YXdhaXQgc2V0UGVybWlzc2lvbkxldmVsRm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICd5b2xvJyxcblx0XHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ3lvbG8nLCBcIlNldCBwZXJtaXNzaW9ucyB0byBieXBhc3MgYXBwcm92YWxzXCIpLFxuXHRcdFx0XHRzb3J0VGV4dDogJ3oxX3lvbG8nLFxuXHRcdFx0XHRleGVjdXRlSW1tZWRpYXRlbHk6IHRydWUsXG5cdFx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0sXG5cdFx0XHRcdHNlc3Npb25UeXBlczogW1Nlc3Npb25UeXBlLkxvY2FsLCBTZXNzaW9uVHlwZS5Db3BpbG90Q0xJXSxcblx0XHRcdH0sIGFzeW5jIChfcHJvbXB0LCBfcHJvZ3Jlc3MsIF9oaXN0b3J5LCBfbG9jYXRpb24sIHNlc3Npb25SZXNvdXJjZSkgPT4ge1xuXHRcdFx0XHRhd2FpdCBzZXRQZXJtaXNzaW9uTGV2ZWxGb3JTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdkaXNhYmxlWW9sbycsXG5cdFx0XHRcdGRldGFpbDogbmxzLmxvY2FsaXplKCdkaXNhYmxlWW9sbycsIFwiU2V0IHBlcm1pc3Npb25zIGJhY2sgdG8gZGVmYXVsdFwiKSxcblx0XHRcdFx0c29ydFRleHQ6ICd6MV9kaXNhYmxlWW9sbycsXG5cdFx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuTG9jYWwsIFNlc3Npb25UeXBlLkNvcGlsb3RDTEldLFxuXHRcdFx0fSwgYXN5bmMgKF9wcm9tcHQsIF9wcm9ncmVzcywgX2hpc3RvcnksIF9sb2NhdGlvbiwgc2Vzc2lvblJlc291cmNlKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHNldFBlcm1pc3Npb25MZXZlbEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHNsYXNoQ29tbWFuZFNlcnZpY2UucmVnaXN0ZXJTbGFzaENvbW1hbmQoe1xuXHRcdFx0XHRjb21tYW5kOiAnYXV0b3BpbG90Jyxcblx0XHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2F1dG9waWxvdCcsIFwiU2V0IHBlcm1pc3Npb25zIHRvIGF1dG9waWxvdCBtb2RlXCIpLFxuXHRcdFx0XHRzb3J0VGV4dDogJ3oxX2F1dG9waWxvdCcsXG5cdFx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuTG9jYWwsIFNlc3Npb25UeXBlLkNvcGlsb3RDTEldLFxuXHRcdFx0fSwgYXN5bmMgKF9wcm9tcHQsIF9wcm9ncmVzcywgX2hpc3RvcnksIF9sb2NhdGlvbiwgc2Vzc2lvblJlc291cmNlKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHNldFBlcm1pc3Npb25MZXZlbEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRcdGNvbW1hbmQ6ICdleGl0QXV0b3BpbG90Jyxcblx0XHRcdFx0ZGV0YWlsOiBubHMubG9jYWxpemUoJ2V4aXRBdXRvcGlsb3QnLCBcIlNldCBwZXJtaXNzaW9ucyBiYWNrIHRvIGRlZmF1bHRcIiksXG5cdFx0XHRcdHNvcnRUZXh0OiAnejFfZXhpdEF1dG9waWxvdCcsXG5cdFx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdFx0c2lsZW50OiB0cnVlLFxuXHRcdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuTG9jYWwsIFNlc3Npb25UeXBlLkNvcGlsb3RDTEldLFxuXHRcdFx0fSwgYXN5bmMgKF9wcm9tcHQsIF9wcm9ncmVzcywgX2hpc3RvcnksIF9sb2NhdGlvbiwgc2Vzc2lvblJlc291cmNlKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHNldFBlcm1pc3Npb25MZXZlbEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9zdG9yZS5hZGQoc2xhc2hDb21tYW5kU2VydmljZS5yZWdpc3RlclNsYXNoQ29tbWFuZCh7XG5cdFx0XHRjb21tYW5kOiAnaGVscCcsXG5cdFx0XHRkZXRhaWw6ICcnLFxuXHRcdFx0c29ydFRleHQ6ICd6MV9oZWxwJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0bW9kZXM6IFtDaGF0TW9kZUtpbmQuQXNrXSxcblx0XHRcdHNlc3Npb25UeXBlczogW1Nlc3Npb25UeXBlLkxvY2FsXSxcblx0XHR9LCBhc3luYyAocHJvbXB0LCBwcm9ncmVzcywgX2hpc3RvcnksIF9sb2NhdGlvbiwgc2Vzc2lvblJlc291cmNlKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWdlbnQgPSBjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdGNvbnN0IGFnZW50cyA9IGNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnRzKCk7XG5cblx0XHRcdC8vIFJlcG9ydCBwcmVmaXhcblx0XHRcdGlmIChkZWZhdWx0QWdlbnQ/Lm1ldGFkYXRhLmhlbHBUZXh0UHJlZml4KSB7XG5cdFx0XHRcdGlmIChpc01hcmtkb3duU3RyaW5nKGRlZmF1bHRBZ2VudC5tZXRhZGF0YS5oZWxwVGV4dFByZWZpeCkpIHtcblx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBjb250ZW50OiBkZWZhdWx0QWdlbnQubWV0YWRhdGEuaGVscFRleHRQcmVmaXgsIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhkZWZhdWx0QWdlbnQubWV0YWRhdGEuaGVscFRleHRQcmVmaXgpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1xcblxcbicpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVwb3J0IGFnZW50IGxpc3Rcblx0XHRcdGNvbnN0IGFnZW50VGV4dCA9IChhd2FpdCBQcm9taXNlLmFsbChhZ2VudHNcblx0XHRcdFx0LmZpbHRlcihhID0+ICFhLmlzRGVmYXVsdCAmJiAhYS5pc0NvcmUpXG5cdFx0XHRcdC5maWx0ZXIoYSA9PiBhLmxvY2F0aW9ucy5pbmNsdWRlcyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSlcblx0XHRcdFx0Lm1hcChhc3luYyBhID0+IHtcblx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGEuZGVzY3JpcHRpb24gPyBgLSAke2EuZGVzY3JpcHRpb259YCA6ICcnO1xuXHRcdFx0XHRcdGNvbnN0IGFnZW50TWFya2Rvd24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBhZ2VudFRvTWFya2Rvd24oYSwgc2Vzc2lvblJlc291cmNlLCB0cnVlLCBhY2Nlc3NvcikpO1xuXHRcdFx0XHRcdGNvbnN0IGFnZW50TGluZSA9IGAtICR7YWdlbnRNYXJrZG93bn0gJHtkZXNjcmlwdGlvbn1gO1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRUZXh0ID0gYS5zbGFzaENvbW1hbmRzLm1hcChjID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYy5kZXNjcmlwdGlvbiA/IGAtICR7Yy5kZXNjcmlwdGlvbn1gIDogJyc7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYFxcdCogJHthZ2VudFNsYXNoQ29tbWFuZFRvTWFya2Rvd24oYSwgYywgc2Vzc2lvblJlc291cmNlKX0gJHtkZXNjcmlwdGlvbn1gO1xuXHRcdFx0XHRcdH0pLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIChhZ2VudExpbmUgKyAnXFxuJyArIGNvbW1hbmRUZXh0KS50cmltKCk7XG5cdFx0XHRcdH0pKSkuam9pbignXFxuJyk7XG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoYWdlbnRUZXh0LCB7IGlzVHJ1c3RlZDogeyBlbmFibGVkQ29tbWFuZHM6IFtDaGF0U3VibWl0QWN0aW9uLklEXSB9IH0pLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblxuXHRcdFx0Ly8gUmVwb3J0IGhlbHAgdGV4dCBlbmRpbmdcblx0XHRcdGlmIChkZWZhdWx0QWdlbnQ/Lm1ldGFkYXRhLmhlbHBUZXh0UG9zdGZpeCkge1xuXHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJ1xcblxcbicpLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRcdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcoZGVmYXVsdEFnZW50Lm1ldGFkYXRhLmhlbHBUZXh0UG9zdGZpeCkpIHtcblx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBjb250ZW50OiBkZWZhdWx0QWdlbnQubWV0YWRhdGEuaGVscFRleHRQb3N0Zml4LCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoZGVmYXVsdEFnZW50Lm1ldGFkYXRhLmhlbHBUZXh0UG9zdGZpeCksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdpdGhvdXQgdGhpcywgdGhlIHJlc3BvbnNlIHdpbGwgYmUgZG9uZSBiZWZvcmUgaXQgcmVuZGVycyBhbmQgc28gaXQgd2lsbCBub3Qgc3RyZWFtLiBUaGlzIGVuc3VyZXMgdGhhdCBpZiB0aGUgcmVzcG9uc2Ugc3RhcnRzXG5cdFx0XHQvLyByZW5kZXJpbmcgZHVyaW5nIHRoZSBuZXh0IDIwMG1zLCB0aGVuIGl0IHdpbGwgYmUgc3RyZWFtZWQuIE9uY2UgaXQgc3RhcnRzIHN0cmVhbWluZywgdGhlIHdob2xlIHJlc3BvbnNlIHN0cmVhbXMgZXZlbiBhZnRlclxuXHRcdFx0Ly8gaXQgaGFzIHJlY2VpdmVkIGFsbCByZXNwb25zZSBkYXRhIGhhcyBiZWVuIHJlY2VpdmVkLlxuXHRcdFx0YXdhaXQgdGltZW91dCgyMDApO1xuXHRcdH0pKTtcblx0fVxufVxuXG4vKipcbiAqIFJlZ2lzdGVycyBzbGFzaCBjb21tYW5kcyBkZWNsYXJlZCBieSBjaGF0IHNlc3Npb24gcHJvdmlkZXJzIHZpYVxuICoge0BsaW5rIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbS5zbGFzaENvbW1hbmR9LiBFYWNoIHNsYXNoIGNvbW1hbmQgaXNcbiAqIHNjb3BlZCB0byBpdHMgY29udHJpYnV0aW5nIHNlc3Npb24gdHlwZSB2aWEgYSBgY2hhdFNlc3Npb25UeXBlID09IFhgIGB3aGVuYFxuICogY2xhdXNlLCBleGVjdXRlcyBpbW1lZGlhdGVseSwgYW5kIHVwZGF0ZXMgdGhlIHNlc3Npb24gb3B0aW9uIGNvcnJlc3BvbmRpbmdcbiAqIHRvIGl0cyBkZWNsYXJpbmcgaXRlbSBcdTIwMTQgc28gZS5nLiBgL3lvbG9gIHN3aXRjaGVzIHRoZSBhY3RpdmUgcGVybWlzc2lvbiBtb2RlXG4gKiB3aXRob3V0IHNlbmRpbmcgYSBjaGF0IHJlcXVlc3QuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0U2Vzc2lvbk9wdGlvblNsYXNoQ29tbWFuZHNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdFNlc3Npb25PcHRpb25TbGFzaENvbW1hbmRzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyYXRpb25zQnlUeXBlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2xhc2hDb21tYW5kU2VydmljZTogSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzKGNoYXRTZXNzaW9uVHlwZSA9PiB7XG5cdFx0XHR0aGlzLnJlZnJlc2hGb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaEZvclNlc3Npb25UeXBlKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gQWx3YXlzIHRlYXIgZG93biB0aGUgcHJldmlvdXMgcmVnaXN0cmF0aW9ucyBmb3IgdGhpcyB0eXBlIGJlZm9yZSByZS1hZGRpbmcsXG5cdFx0Ly8gc28gcmVuYW1lcyAvIHJlbW92YWxzIGFyZSBob25vcmVkLlxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnNCeVR5cGUuZGVsZXRlQW5kRGlzcG9zZShjaGF0U2Vzc2lvblR5cGUpO1xuXG5cdFx0Y29uc3QgZ3JvdXBzID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlKGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0aWYgKCFncm91cHMgfHwgZ3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXAuaXRlbXMpIHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IGl0ZW0uc2xhc2hDb21tYW5kPy50cmltKCk7XG5cdFx0XHRcdGlmICghbmFtZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZWVuLmhhcyhuYW1lKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbQ2hhdFNlc3Npb25PcHRpb25TbGFzaENvbW1hbmRzXSBTa2lwcGluZyBkdXBsaWNhdGUgc2xhc2ggY29tbWFuZCAnJHtuYW1lfScgY29udHJpYnV0ZWQgYnkgc2Vzc2lvbiB0eXBlICcke2NoYXRTZXNzaW9uVHlwZX0nLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLnNsYXNoQ29tbWFuZFNlcnZpY2UuaGFzQ29tbWFuZChuYW1lLCBjaGF0U2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtDaGF0U2Vzc2lvbk9wdGlvblNsYXNoQ29tbWFuZHNdIFNsYXNoIGNvbW1hbmQgJyR7bmFtZX0nIGNvbnRyaWJ1dGVkIGJ5IHNlc3Npb24gdHlwZSAnJHtjaGF0U2Vzc2lvblR5cGV9JyBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQ7IHNraXBwaW5nLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlZW4uYWRkKG5hbWUpO1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5yZWdpc3Rlck9uZShjaGF0U2Vzc2lvblR5cGUsIGdyb3VwLCBpdGVtLCBuYW1lKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN0b3JlLmlzRGlzcG9zZWQgfHwgc2Vlbi5zaXplID09PSAwKSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdHJhdGlvbnNCeVR5cGUuc2V0KGNoYXRTZXNzaW9uVHlwZSwgc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck9uZShcblx0XHRjaGF0U2Vzc2lvblR5cGU6IHN0cmluZyxcblx0XHRncm91cDogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCxcblx0XHRpdGVtOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0sXG5cdFx0bmFtZTogc3RyaW5nXG5cdCkge1xuXHRcdHJldHVybiB0aGlzLnNsYXNoQ29tbWFuZFNlcnZpY2UucmVnaXN0ZXJTbGFzaENvbW1hbmQoe1xuXHRcdFx0Y29tbWFuZDogbmFtZSxcblx0XHRcdGRldGFpbDogaXRlbS5kZXNjcmlwdGlvbiA/PyBubHMubG9jYWxpemUoJ2NoYXRTZXNzaW9uT3B0aW9uLnNsYXNoQ29tbWFuZC5kZXRhaWwnLCBcIlN3aXRjaCB0byAnezB9J1wiLCBpdGVtLm5hbWUpLFxuXHRcdFx0c29ydFRleHQ6IGB6MV8ke25hbWV9YCxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdHNpbGVudDogdHJ1ZSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbY2hhdFNlc3Npb25UeXBlXSxcblx0XHR9LCBhc3luYyAoX3Byb21wdCwgX3Byb2dyZXNzLCBfaGlzdG9yeSwgX2xvY2F0aW9uLCBzZXNzaW9uUmVzb3VyY2UpID0+IHtcblx0XHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5zZXRTZXNzaW9uT3B0aW9uKHNlc3Npb25SZXNvdXJjZSwgZ3JvdXAuaWQsIGl0ZW0pO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQix3QkFBd0I7QUFDakQsU0FBUyxZQUFZLGVBQWUsaUJBQWlCLHlCQUF5QjtBQUU5RSxZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBdUYsbUJBQW1CO0FBQ25ILFNBQVMsbUJBQW1CLG1CQUFtQixjQUFjLDJC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
