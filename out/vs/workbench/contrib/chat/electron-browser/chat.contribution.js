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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { timeout } from "../../../../base/common/async.js";
import { autorun } from "../../../../base/common/observable.js";
import { resolve } from "../../../../base/common/path.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { ipcRenderer } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { localize } from "../../../../nls.js";
import { registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ILocalGitService } from "../../../../platform/git/common/localGitService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerSharedProcessRemoteService } from "../../../../platform/ipc/electron-browser/services.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ILifecycleService, ShutdownReason } from "../../../services/lifecycle/common/lifecycle.js";
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID } from "../browser/actions/chatActions.js";
import { AgentHostContribution } from "../browser/agentSessions/agentHost/agentHostChatContribution.js";
import { AgentHostByokLmHandler } from "../browser/agentSessions/agentHost/agentHostByokLmHandler.js";
import { AgentHostSessionListContribution } from "../browser/agentSessions/agentHost/agentHostSessionListContribution.js";
import { AgentHostOpenSessionLinkOpenerContribution } from "../browser/agentSessions/agentHost/openSessionLinkOpener.contribution.js";
import { AgentHostTerminalContribution } from "../browser/agentSessions/agentHost/agentHostTerminalContribution.js";
import { AgentHostCopilotCliSettingsContribution } from "../browser/agentSessions/agentHost/agentHostCopilotCliSettingsContribution.js";
import "./codexCustomizationSettings.contribution.js";
import { CopilotConfigSlashSubmitHandlerContribution } from "../browser/agentSessions/agentHost/copilotConfigSlashSubmitHandler.js";
import "../browser/agentSessions/agentHost/agentHostSettings.contribution.js";
import "../browser/agentSessions/agentHost/agentSessionSettings.contribution.js";
import { AgentSessionProviders, getAgentSessionProviderName } from "../browser/agentSessions/agentSessions.js";
import { IAgentSessionsService } from "../browser/agentSessions/agentSessionsService.js";
import { ChatViewPaneTarget, IChatWidgetService } from "../browser/chat.js";
import { ChatSessionPosition, openChatSession } from "../browser/chatSessions/chatSessions.contribution.js";
import { IAgentHostService } from "../../../../platform/agentHost/common/agentService.js";
import { IAgentHostByokLmHandler } from "../../../../platform/agentHost/common/agentHostByokLm.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { IChatService } from "../common/chatService/chatService.js";
import { ChatModeKind } from "../common/constants.js";
import { IPluginGitService } from "../common/plugins/pluginGitService.js";
import { registerChatDeveloperActions } from "./actions/chatDeveloperActions.js";
import { registerChatExportZipAction } from "./actions/chatExportZip.js";
import { registerExportAgentTracesDbAction } from "./actions/exportAgentTracesDb.js";
import { registerInstallDictationModelAction } from "./actions/installDictationModelAction.js";
import { shouldWarnForSessionShutdown } from "./chatLifecycle.js";
import { HoldToVoiceChatInChatViewAction, InlineVoiceChatAction, KeywordActivationContribution, QuickVoiceChatAction, ReadChatResponseAloud, StartVoiceChatAction, StopListeningAction, StopListeningAndSubmitAction, StopReadAloud, StopReadChatItemAloud, VoiceChatInChatViewAction } from "./actions/voiceChatActions.js";
import { OpenWorkspaceInAgentsWindowAction, OpenWorkspaceInAgentsContribution, OpenAgentsWindowAction, OpenChatSessionInAgentsWindowAction, AgentsHandoffInputTipContribution, ToggleOpenInAgentsWindowTitleBarAction, OpenWorkspaceInAgentsWindowChatTitleAction, OpenWorkspaceInAgentsWindowTitleBarAction } from "./agentSessions/agentSessionsActions.js";
import { NativeBuiltinToolsContribution } from "./builtInTools/tools.js";
import { NativePluginGitCommandService } from "./pluginGitCommandService.js";
registerSingleton(IPluginGitService, NativePluginGitCommandService, InstantiationType.Delayed);
registerSharedProcessRemoteService(ILocalGitService, "localGit");
let ChatCommandLineHandler = class extends Disposable {
  constructor(environmentService, commandService, workspaceTrustRequestService, logService, layoutService, contextKeyService, chatWidgetService) {
    super();
    this.environmentService = environmentService;
    this.commandService = commandService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.logService = logService;
    this.layoutService = layoutService;
    this.contextKeyService = contextKeyService;
    this.chatWidgetService = chatWidgetService;
    this.registerListeners();
  }
  registerListeners() {
    const handleChatRequest = (_, ...args) => {
      const chatArgs = args[0];
      this.logService.trace("vscode:handleChatRequest", chatArgs);
      this.prompt(chatArgs).catch((err) => this.logService.error("vscode:handleChatRequest failed", err));
    };
    ipcRenderer.on("vscode:handleChatRequest", handleChatRequest);
    this._register({ dispose: () => ipcRenderer.removeListener("vscode:handleChatRequest", handleChatRequest) });
    const handleOpenChatSession = (_, ...args) => {
      const sessionUriString = args[0];
      this.logService.trace("vscode:openChatSession", sessionUriString);
      const sessionResource = URI.parse(sessionUriString);
      Promise.resolve(this.chatWidgetService.openSession(sessionResource, ChatViewPaneTarget)).catch((err) => this.logService.error("vscode:openChatSession failed", err));
    };
    ipcRenderer.on("vscode:openChatSession", handleOpenChatSession);
    this._register({ dispose: () => ipcRenderer.removeListener("vscode:openChatSession", handleOpenChatSession) });
  }
  async prompt(args) {
    if (!Array.isArray(args?._)) {
      return;
    }
    const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("copilotWorkspaceTrust", "AI features are currently only supported in trusted workspaces.")
    });
    if (!trusted) {
      return;
    }
    const opts = {
      query: args._.length > 0 ? args._.join(" ") : "",
      mode: args.mode ?? ChatModeKind.Agent,
      attachFiles: args["add-file"]?.map((file) => URI.file(resolve(file)))
      // use `resolve` to deal with relative paths properly
    };
    if (args.maximize) {
      const location = this.contextKeyService.getContextKeyValue(ChatContextKeys.panelLocation.key);
      if (location === ViewContainerLocation.AuxiliaryBar) {
        this.layoutService.setAuxiliaryBarMaximized(true);
      } else if (location === ViewContainerLocation.Panel && !this.layoutService.isPanelMaximized()) {
        this.layoutService.toggleMaximizedPanel();
      }
    }
    await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
    await this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, opts);
  }
};
ChatCommandLineHandler.ID = "workbench.contrib.chatCommandLineHandler";
ChatCommandLineHandler = __decorateClass([
  __decorateParam(0, INativeWorkbenchEnvironmentService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IWorkspaceTrustRequestService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IWorkbenchLayoutService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IChatWidgetService)
], ChatCommandLineHandler);
let ChatSuspendThrottlingHandler = class extends Disposable {
  constructor(nativeHostService, chatService) {
    super();
    this._register(autorun((reader) => {
      const running = chatService.requestInProgressObs.read(reader);
      nativeHostService.setBackgroundThrottling(!running);
    }));
  }
};
ChatSuspendThrottlingHandler.ID = "workbench.contrib.chatSuspendThrottlingHandler";
ChatSuspendThrottlingHandler = __decorateClass([
  __decorateParam(0, INativeHostService),
  __decorateParam(1, IChatService)
], ChatSuspendThrottlingHandler);
let ChatLifecycleHandler = class extends Disposable {
  constructor(lifecycleService, agentSessionsService, dialogService, widgetService, contextKeyService, extensionService, environmentService, chatEntitlementService) {
    super();
    this.agentSessionsService = agentSessionsService;
    this.dialogService = dialogService;
    this.widgetService = widgetService;
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.chatEntitlementService = chatEntitlementService;
    this._register(lifecycleService.onBeforeShutdown((e) => {
      e.veto(this.shouldVetoShutdown(e.reason), "veto.chat");
    }));
    this._register(extensionService.onWillStop((e) => {
      e.veto(this.hasSessionThatWillStop(ShutdownReason.CLOSE), localize("chatRequestInProgress", "A session is in progress."));
    }));
  }
  hasSessionThatWillStop(reason) {
    if (this.chatEntitlementService.sentiment.hidden) {
      return false;
    }
    return this.agentSessionsService.model.sessions.some((session) => shouldWarnForSessionShutdown(session, reason));
  }
  shouldVetoShutdown(reason) {
    if (this.environmentService.enableSmokeTestDriver) {
      return false;
    }
    if (!this.hasSessionThatWillStop(reason)) {
      return false;
    }
    if (ChatContextKeys.skipChatRequestInProgressMessage.getValue(this.contextKeyService) === true) {
      return false;
    }
    return this.doShouldVetoShutdown(reason);
  }
  async doShouldVetoShutdown(reason) {
    this.widgetService.revealWidget();
    let message;
    let detail;
    switch (reason) {
      case ShutdownReason.CLOSE:
        message = localize("closeTheWindow.message", "A session is in progress. Are you sure you want to close the window?");
        detail = localize("closeTheWindow.detail", "The session will stop if you close the window.");
        break;
      case ShutdownReason.LOAD:
        message = localize("changeWorkspace.message", "A session is in progress. Are you sure you want to change the workspace?");
        detail = localize("changeWorkspace.detail", "The session will stop if you change the workspace.");
        break;
      case ShutdownReason.RELOAD:
        message = localize("reloadTheWindow.message", "A session is in progress. Are you sure you want to reload the window?");
        detail = localize("reloadTheWindow.detail", "The session will stop if you reload the window.");
        break;
      default:
        message = isMacintosh ? localize("quit.message", "A session is in progress. Are you sure you want to quit?") : localize("exit.message", "A session is in progress. Are you sure you want to exit?");
        detail = isMacintosh ? localize("quit.detail", "The session will stop if you quit.") : localize("exit.detail", "The session will stop if you exit.");
        break;
    }
    const result = await this.dialogService.confirm({ message, detail });
    return !result.confirmed;
  }
};
ChatLifecycleHandler.ID = "workbench.contrib.chatLifecycleHandler";
ChatLifecycleHandler = __decorateClass([
  __decorateParam(0, ILifecycleService),
  __decorateParam(1, IAgentSessionsService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, INativeWorkbenchEnvironmentService),
  __decorateParam(7, IChatEntitlementService)
], ChatLifecycleHandler);
registerAction2(OpenWorkspaceInAgentsWindowAction);
registerAction2(OpenWorkspaceInAgentsWindowChatTitleAction);
registerAction2(OpenWorkspaceInAgentsWindowTitleBarAction);
registerAction2(ToggleOpenInAgentsWindowTitleBarAction);
registerAction2(OpenAgentsWindowAction);
registerAction2(OpenChatSessionInAgentsWindowAction);
registerAction2(StartVoiceChatAction);
registerAction2(VoiceChatInChatViewAction);
registerAction2(HoldToVoiceChatInChatViewAction);
registerAction2(QuickVoiceChatAction);
registerAction2(InlineVoiceChatAction);
registerAction2(StopListeningAction);
registerAction2(StopListeningAndSubmitAction);
registerAction2(ReadChatResponseAloud);
registerAction2(StopReadChatItemAloud);
registerAction2(StopReadAloud);
registerChatDeveloperActions();
registerChatExportZipAction();
registerExportAgentTracesDbAction();
registerInstallDictationModelAction();
registerWorkbenchContribution2(KeywordActivationContribution.ID, KeywordActivationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(NativeBuiltinToolsContribution.ID, NativeBuiltinToolsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatCommandLineHandler.ID, ChatCommandLineHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatSuspendThrottlingHandler.ID, ChatSuspendThrottlingHandler, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatLifecycleHandler.ID, ChatLifecycleHandler, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostContribution.ID, AgentHostContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(CopilotConfigSlashSubmitHandlerContribution.ID, CopilotConfigSlashSubmitHandlerContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostSessionListContribution.ID, AgentHostSessionListContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostOpenSessionLinkOpenerContribution.ID, AgentHostOpenSessionLinkOpenerContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(AgentHostTerminalContribution.ID, AgentHostTerminalContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(AgentHostCopilotCliSettingsContribution.ID, AgentHostCopilotCliSettingsContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(OpenWorkspaceInAgentsContribution.ID, OpenWorkspaceInAgentsContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(AgentsHandoffInputTipContribution.ID, AgentsHandoffInputTipContribution, WorkbenchPhase.Eventually);
registerSingleton(IAgentHostByokLmHandler, AgentHostByokLmHandler, InstantiationType.Delayed);
const AGENT_HOST_REGISTRATION_TIMEOUT_MS = 3e4;
function getCopilotAgentInfo(rootState) {
  if (!rootState || rootState instanceof Error) {
    return void 0;
  }
  return rootState.agents.find((a) => a.provider === "copilotcli");
}
async function resolveAgentHostSessionType(agentHostService) {
  const agent = getCopilotAgentInfo(agentHostService.rootState.value);
  if (agent) {
    return `agent-host-${agent.provider}`;
  }
  const cts = new CancellationTokenSource();
  const waitForAgent = new Promise((res) => {
    const sub = agentHostService.rootState.onDidChange((state) => {
      const found = getCopilotAgentInfo(state);
      if (found) {
        sub.dispose();
        res(found);
      }
    });
    cts.token.onCancellationRequested(() => {
      sub.dispose();
      res(void 0);
    });
  });
  const resolved = await Promise.race([
    waitForAgent,
    timeout(AGENT_HOST_REGISTRATION_TIMEOUT_MS).then(() => {
      cts.cancel();
      cts.dispose();
      return void 0;
    })
  ]);
  if (!resolved) {
    throw new Error("Agent host did not register a copilotcli agent within the timeout period. Ensure the agent host is enabled and running.");
  }
  return `agent-host-${resolved.provider}`;
}
async function openNewAgentHostSession(accessor, position) {
  const agentHostService = accessor.get(IAgentHostService);
  const instantiationService = accessor.get(IInstantiationService);
  const sessionType = await resolveAgentHostSessionType(agentHostService);
  return instantiationService.invokeFunction((innerAccessor) => openChatSession(innerAccessor, {
    type: sessionType,
    displayName: getAgentSessionProviderName(sessionType),
    position
  }));
}
CommandsRegistry.registerCommand(
  `workbench.action.chat.openNewSessionSidebar.${AgentSessionProviders.AgentHostCopilot}`,
  (accessor) => openNewAgentHostSession(accessor, ChatSessionPosition.Sidebar)
);
CommandsRegistry.registerCommand(
  `workbench.action.chat.openNewSessionEditor.${AgentSessionProviders.AgentHostCopilot}`,
  (accessor) => openNewAgentHostSession(accessor, ChatSessionPosition.Editor)
);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvZWxlY3Ryb24tYnJvd3Nlci9jaGF0LmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IHJlc29sdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGlwY1JlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9zYW5kYm94L2VsZWN0cm9uLWJyb3dzZXIvZ2xvYmFscy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZ2l0L2NvbW1vbi9sb2NhbEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyU2hhcmVkUHJvY2Vzc1JlbW90ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pcGMvZWxlY3Ryb24tYnJvd3Nlci9zZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgU2h1dGRvd25SZWFzb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBQ1RJT05fSURfTkVXX0NIQVQsIENIQVRfT1BFTl9BQ1RJT05fSUQsIElDaGF0Vmlld09wZW5PcHRpb25zIH0gZnJvbSAnLi4vYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q2hhdENvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RCeW9rTG1IYW5kbGVyIH0gZnJvbSAnLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RCeW9rTG1IYW5kbGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25MaXN0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTZXNzaW9uTGlzdENvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPcGVuU2Vzc2lvbkxpbmtPcGVuZXJDb250cmlidXRpb24gfSBmcm9tICcuLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L29wZW5TZXNzaW9uTGlua09wZW5lci5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VGVybWluYWxDb250cmlidXRpb24gfSBmcm9tICcuLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdFRlcm1pbmFsQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvcGlsb3RDbGlTZXR0aW5nc0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Q29waWxvdENsaVNldHRpbmdzQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAnLi9jb2RleEN1c3RvbWl6YXRpb25TZXR0aW5ncy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgQ29waWxvdENvbmZpZ1NsYXNoU3VibWl0SGFuZGxlckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvY29waWxvdENvbmZpZ1NsYXNoU3VibWl0SGFuZGxlci5qcyc7XG5pbXBvcnQgJy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U2V0dGluZ3MuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAnLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudFNlc3Npb25TZXR0aW5ncy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUgfSBmcm9tICcuLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdQYW5lVGFyZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25Qb3NpdGlvbiwgb3BlbkNoYXRTZXNzaW9uIH0gZnJvbSAnLi4vYnJvd3Nlci9jaGF0U2Vzc2lvbnMvY2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RCeW9rTG1IYW5kbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RCeW9rTG0uanMnO1xuaW1wb3J0IHsgdHlwZSBBZ2VudEluZm8sIHR5cGUgUm9vdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElQbHVnaW5HaXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luR2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXREZXZlbG9wZXJBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXREZXZlbG9wZXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdEV4cG9ydFppcEFjdGlvbiB9IGZyb20gJy4vYWN0aW9ucy9jaGF0RXhwb3J0WmlwLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyRXhwb3J0QWdlbnRUcmFjZXNEYkFjdGlvbiB9IGZyb20gJy4vYWN0aW9ucy9leHBvcnRBZ2VudFRyYWNlc0RiLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySW5zdGFsbERpY3RhdGlvbk1vZGVsQWN0aW9uIH0gZnJvbSAnLi9hY3Rpb25zL2luc3RhbGxEaWN0YXRpb25Nb2RlbEFjdGlvbi5qcyc7XG5pbXBvcnQgeyBzaG91bGRXYXJuRm9yU2Vzc2lvblNodXRkb3duIH0gZnJvbSAnLi9jaGF0TGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEhvbGRUb1ZvaWNlQ2hhdEluQ2hhdFZpZXdBY3Rpb24sIElubGluZVZvaWNlQ2hhdEFjdGlvbiwgS2V5d29yZEFjdGl2YXRpb25Db250cmlidXRpb24sIFF1aWNrVm9pY2VDaGF0QWN0aW9uLCBSZWFkQ2hhdFJlc3BvbnNlQWxvdWQsIFN0YXJ0Vm9pY2VDaGF0QWN0aW9uLCBTdG9wTGlzdGVuaW5nQWN0aW9uLCBTdG9wTGlzdGVuaW5nQW5kU3VibWl0QWN0aW9uLCBTdG9wUmVhZEFsb3VkLCBTdG9wUmVhZENoYXRJdGVtQWxvdWQsIFZvaWNlQ2hhdEluQ2hhdFZpZXdBY3Rpb24gfSBmcm9tICcuL2FjdGlvbnMvdm9pY2VDaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBPcGVuV29ya3NwYWNlSW5BZ2VudHNXaW5kb3dBY3Rpb24sIE9wZW5Xb3Jrc3BhY2VJbkFnZW50c0NvbnRyaWJ1dGlvbiwgT3BlbkFnZW50c1dpbmRvd0FjdGlvbiwgT3BlbkNoYXRTZXNzaW9uSW5BZ2VudHNXaW5kb3dBY3Rpb24sIEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbiwgVG9nZ2xlT3BlbkluQWdlbnRzV2luZG93VGl0bGVCYXJBY3Rpb24sIE9wZW5Xb3Jrc3BhY2VJbkFnZW50c1dpbmRvd0NoYXRUaXRsZUFjdGlvbiwgT3BlbldvcmtzcGFjZUluQWdlbnRzV2luZG93VGl0bGVCYXJBY3Rpb24gfSBmcm9tICcuL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTmF0aXZlQnVpbHRpblRvb2xzQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9idWlsdEluVG9vbHMvdG9vbHMuanMnO1xuaW1wb3J0IHsgTmF0aXZlUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UgfSBmcm9tICcuL3BsdWdpbkdpdENvbW1hbmRTZXJ2aWNlLmpzJztcblxuLy8gT3ZlcnJpZGUgdGhlIGJyb3dzZXIgUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2Ugd2l0aCB0aGUgbmF0aXZlIG9uZSB0aGF0IGFsd2F5c1xuLy8gcnVucyBnaXQgbG9jYWxseSB2aWEgdGhlIHNoYXJlZCBwcm9jZXNzLiBTZWUgdGhlIGRlY2lzaW9uIG1hdHJpeCBvbiB0aGVcbi8vIGBJUGx1Z2luR2l0U2VydmljZWAgaW50ZXJmYWNlIGZvciB0aGUgZnVsbCBwZXItZmxhdm9yIHdpcmluZy5cbnJlZ2lzdGVyU2luZ2xldG9uKElQbHVnaW5HaXRTZXJ2aWNlLCBOYXRpdmVQbHVnaW5HaXRDb21tYW5kU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNoYXJlZFByb2Nlc3NSZW1vdGVTZXJ2aWNlKElMb2NhbEdpdFNlcnZpY2UsICdsb2NhbEdpdCcpO1xuXG5jbGFzcyBDaGF0Q29tbWFuZExpbmVIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRDb21tYW5kTGluZUhhbmRsZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCkge1xuXHRcdGNvbnN0IGhhbmRsZUNoYXRSZXF1ZXN0ID0gKF86IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgY2hhdEFyZ3MgPSBhcmdzWzBdIGFzIHR5cGVvZiB0aGlzLmVudmlyb25tZW50U2VydmljZS5hcmdzLmNoYXQ7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ3ZzY29kZTpoYW5kbGVDaGF0UmVxdWVzdCcsIGNoYXRBcmdzKTtcblxuXHRcdFx0dGhpcy5wcm9tcHQoY2hhdEFyZ3MpLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3ZzY29kZTpoYW5kbGVDaGF0UmVxdWVzdCBmYWlsZWQnLCBlcnIpKTtcblx0XHR9O1xuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6aGFuZGxlQ2hhdFJlcXVlc3QnLCBoYW5kbGVDaGF0UmVxdWVzdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcigndnNjb2RlOmhhbmRsZUNoYXRSZXF1ZXN0JywgaGFuZGxlQ2hhdFJlcXVlc3QpIH0pO1xuXG5cdFx0Y29uc3QgaGFuZGxlT3BlbkNoYXRTZXNzaW9uID0gKF86IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaVN0cmluZyA9IGFyZ3NbMF0gYXMgc3RyaW5nO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCd2c2NvZGU6b3BlbkNoYXRTZXNzaW9uJywgc2Vzc2lvblVyaVN0cmluZyk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZShzZXNzaW9uVXJpU3RyaW5nKTtcblx0XHRcdFByb21pc2UucmVzb2x2ZSh0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLm9wZW5TZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgQ2hhdFZpZXdQYW5lVGFyZ2V0KSlcblx0XHRcdFx0LmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3ZzY29kZTpvcGVuQ2hhdFNlc3Npb24gZmFpbGVkJywgZXJyKSk7XG5cdFx0fTtcblx0XHRpcGNSZW5kZXJlci5vbigndnNjb2RlOm9wZW5DaGF0U2Vzc2lvbicsIGhhbmRsZU9wZW5DaGF0U2Vzc2lvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcigndnNjb2RlOm9wZW5DaGF0U2Vzc2lvbicsIGhhbmRsZU9wZW5DaGF0U2Vzc2lvbikgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb21wdChhcmdzOiB0eXBlb2YgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuYXJncy5jaGF0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KGFyZ3M/Ll8pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJ1c3RlZCA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3Qoe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvcGlsb3RXb3Jrc3BhY2VUcnVzdCcsIFwiQUkgZmVhdHVyZXMgYXJlIGN1cnJlbnRseSBvbmx5IHN1cHBvcnRlZCBpbiB0cnVzdGVkIHdvcmtzcGFjZXMuXCIpXG5cdFx0fSk7XG5cblx0XHRpZiAoIXRydXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRzOiBJQ2hhdFZpZXdPcGVuT3B0aW9ucyA9IHtcblx0XHRcdHF1ZXJ5OiBhcmdzLl8ubGVuZ3RoID4gMCA/IGFyZ3MuXy5qb2luKCcgJykgOiAnJyxcblx0XHRcdG1vZGU6IGFyZ3MubW9kZSA/PyBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRhdHRhY2hGaWxlczogYXJnc1snYWRkLWZpbGUnXT8ubWFwKGZpbGUgPT4gVVJJLmZpbGUocmVzb2x2ZShmaWxlKSkpLCAvLyB1c2UgYHJlc29sdmVgIHRvIGRlYWwgd2l0aCByZWxhdGl2ZSBwYXRocyBwcm9wZXJseVxuXHRcdH07XG5cblx0XHRpZiAoYXJncy5tYXhpbWl6ZSkge1xuXHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxWaWV3Q29udGFpbmVyTG9jYXRpb24+KENoYXRDb250ZXh0S2V5cy5wYW5lbExvY2F0aW9uLmtleSk7XG5cdFx0XHRpZiAobG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldEF1eGlsaWFyeUJhck1heGltaXplZCh0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAobG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCAmJiAhdGhpcy5sYXlvdXRTZXJ2aWNlLmlzUGFuZWxNYXhpbWl6ZWQoKSkge1xuXHRcdFx0XHR0aGlzLmxheW91dFNlcnZpY2UudG9nZ2xlTWF4aW1pemVkUGFuZWwoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFDVElPTl9JRF9ORVdfQ0hBVCk7XG5cdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDSEFUX09QRU5fQUNUSU9OX0lELCBvcHRzKTtcblx0fVxufVxuXG5jbGFzcyBDaGF0U3VzcGVuZFRocm90dGxpbmdIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRTdXNwZW5kVGhyb3R0bGluZ0hhbmRsZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBydW5uaW5nID0gY2hhdFNlcnZpY2UucmVxdWVzdEluUHJvZ3Jlc3NPYnMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHQvLyBXaGVuIGEgY2hhdCByZXF1ZXN0IGlzIGluIHByb2dyZXNzLCB3ZSBtdXN0IGVuc3VyZSB0aGF0IGJhY2tncm91bmRcblx0XHRcdC8vIHRocm90dGxpbmcgaXMgbm90IGFwcGxpZWQgc28gdGhhdCB0aGUgY2hhdCBzZXNzaW9uIGNhbiBjb250aW51ZVxuXHRcdFx0Ly8gZXZlbiB3aGVuIHRoZSB3aW5kb3cgaXMgbm90IGluIGZvY3VzLlxuXHRcdFx0bmF0aXZlSG9zdFNlcnZpY2Uuc2V0QmFja2dyb3VuZFRocm90dGxpbmcoIXJ1bm5pbmcpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBDaGF0TGlmZWN5Y2xlSGFuZGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0TGlmZWN5Y2xlSGFuZGxlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3aWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlmZWN5Y2xlU2VydmljZS5vbkJlZm9yZVNodXRkb3duKGUgPT4ge1xuXHRcdFx0ZS52ZXRvKHRoaXMuc2hvdWxkVmV0b1NodXRkb3duKGUucmVhc29uKSwgJ3ZldG8uY2hhdCcpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvblNlcnZpY2Uub25XaWxsU3RvcChlID0+IHtcblx0XHRcdGUudmV0byh0aGlzLmhhc1Nlc3Npb25UaGF0V2lsbFN0b3AoU2h1dGRvd25SZWFzb24uQ0xPU0UpLCBsb2NhbGl6ZSgnY2hhdFJlcXVlc3RJblByb2dyZXNzJywgXCJBIHNlc3Npb24gaXMgaW4gcHJvZ3Jlc3MuXCIpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGhhc1Nlc3Npb25UaGF0V2lsbFN0b3AocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmhpZGRlbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBBSSBmZWF0dXJlcyBhcmUgZGlzYWJsZWRcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5zb21lKHNlc3Npb24gPT4gc2hvdWxkV2FybkZvclNlc3Npb25TaHV0ZG93bihzZXNzaW9uLCByZWFzb24pKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkVmV0b1NodXRkb3duKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBib29sZWFuIHwgUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmVuYWJsZVNtb2tlVGVzdERyaXZlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5oYXNTZXNzaW9uVGhhdFdpbGxTdG9wKHJlYXNvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoQ2hhdENvbnRleHRLZXlzLnNraXBDaGF0UmVxdWVzdEluUHJvZ3Jlc3NNZXNzYWdlLmdldFZhbHVlKHRoaXMuY29udGV4dEtleVNlcnZpY2UpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZG9TaG91bGRWZXRvU2h1dGRvd24ocmVhc29uKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9TaG91bGRWZXRvU2h1dGRvd24ocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0dGhpcy53aWRnZXRTZXJ2aWNlLnJldmVhbFdpZGdldCgpO1xuXG5cdFx0bGV0IG1lc3NhZ2U6IHN0cmluZztcblx0XHRsZXQgZGV0YWlsOiBzdHJpbmc7XG5cdFx0c3dpdGNoIChyZWFzb24pIHtcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uQ0xPU0U6XG5cdFx0XHRcdG1lc3NhZ2UgPSBsb2NhbGl6ZSgnY2xvc2VUaGVXaW5kb3cubWVzc2FnZScsIFwiQSBzZXNzaW9uIGlzIGluIHByb2dyZXNzLiBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gY2xvc2UgdGhlIHdpbmRvdz9cIik7XG5cdFx0XHRcdGRldGFpbCA9IGxvY2FsaXplKCdjbG9zZVRoZVdpbmRvdy5kZXRhaWwnLCBcIlRoZSBzZXNzaW9uIHdpbGwgc3RvcCBpZiB5b3UgY2xvc2UgdGhlIHdpbmRvdy5cIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5MT0FEOlxuXHRcdFx0XHRtZXNzYWdlID0gbG9jYWxpemUoJ2NoYW5nZVdvcmtzcGFjZS5tZXNzYWdlJywgXCJBIHNlc3Npb24gaXMgaW4gcHJvZ3Jlc3MuIEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBjaGFuZ2UgdGhlIHdvcmtzcGFjZT9cIik7XG5cdFx0XHRcdGRldGFpbCA9IGxvY2FsaXplKCdjaGFuZ2VXb3Jrc3BhY2UuZGV0YWlsJywgXCJUaGUgc2Vzc2lvbiB3aWxsIHN0b3AgaWYgeW91IGNoYW5nZSB0aGUgd29ya3NwYWNlLlwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLlJFTE9BRDpcblx0XHRcdFx0bWVzc2FnZSA9IGxvY2FsaXplKCdyZWxvYWRUaGVXaW5kb3cubWVzc2FnZScsIFwiQSBzZXNzaW9uIGlzIGluIHByb2dyZXNzLiBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcmVsb2FkIHRoZSB3aW5kb3c/XCIpO1xuXHRcdFx0XHRkZXRhaWwgPSBsb2NhbGl6ZSgncmVsb2FkVGhlV2luZG93LmRldGFpbCcsIFwiVGhlIHNlc3Npb24gd2lsbCBzdG9wIGlmIHlvdSByZWxvYWQgdGhlIHdpbmRvdy5cIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bWVzc2FnZSA9IGlzTWFjaW50b3NoID8gbG9jYWxpemUoJ3F1aXQubWVzc2FnZScsIFwiQSBzZXNzaW9uIGlzIGluIHByb2dyZXNzLiBBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcXVpdD9cIikgOiBsb2NhbGl6ZSgnZXhpdC5tZXNzYWdlJywgXCJBIHNlc3Npb24gaXMgaW4gcHJvZ3Jlc3MuIEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBleGl0P1wiKTtcblx0XHRcdFx0ZGV0YWlsID0gaXNNYWNpbnRvc2ggPyBsb2NhbGl6ZSgncXVpdC5kZXRhaWwnLCBcIlRoZSBzZXNzaW9uIHdpbGwgc3RvcCBpZiB5b3UgcXVpdC5cIikgOiBsb2NhbGl6ZSgnZXhpdC5kZXRhaWwnLCBcIlRoZSBzZXNzaW9uIHdpbGwgc3RvcCBpZiB5b3UgZXhpdC5cIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHsgbWVzc2FnZSwgZGV0YWlsIH0pO1xuXG5cdFx0cmV0dXJuICFyZXN1bHQuY29uZmlybWVkO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuV29ya3NwYWNlSW5BZ2VudHNXaW5kb3dBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5Xb3Jrc3BhY2VJbkFnZW50c1dpbmRvd0NoYXRUaXRsZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoT3BlbldvcmtzcGFjZUluQWdlbnRzV2luZG93VGl0bGVCYXJBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZU9wZW5JbkFnZW50c1dpbmRvd1RpdGxlQmFyQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuQWdlbnRzV2luZG93QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuQ2hhdFNlc3Npb25JbkFnZW50c1dpbmRvd0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3RhcnRWb2ljZUNoYXRBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoVm9pY2VDaGF0SW5DaGF0Vmlld0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoSG9sZFRvVm9pY2VDaGF0SW5DaGF0Vmlld0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUXVpY2tWb2ljZUNoYXRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKElubGluZVZvaWNlQ2hhdEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihTdG9wTGlzdGVuaW5nQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTdG9wTGlzdGVuaW5nQW5kU3VibWl0QWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKFJlYWRDaGF0UmVzcG9uc2VBbG91ZCk7XG5yZWdpc3RlckFjdGlvbjIoU3RvcFJlYWRDaGF0SXRlbUFsb3VkKTtcbnJlZ2lzdGVyQWN0aW9uMihTdG9wUmVhZEFsb3VkKTtcblxucmVnaXN0ZXJDaGF0RGV2ZWxvcGVyQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0RXhwb3J0WmlwQWN0aW9uKCk7XG5yZWdpc3RlckV4cG9ydEFnZW50VHJhY2VzRGJBY3Rpb24oKTtcbnJlZ2lzdGVySW5zdGFsbERpY3RhdGlvbk1vZGVsQWN0aW9uKCk7XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihLZXl3b3JkQWN0aXZhdGlvbkNvbnRyaWJ1dGlvbi5JRCwgS2V5d29yZEFjdGl2YXRpb25Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE5hdGl2ZUJ1aWx0aW5Ub29sc0NvbnRyaWJ1dGlvbi5JRCwgTmF0aXZlQnVpbHRpblRvb2xzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0Q29tbWFuZExpbmVIYW5kbGVyLklELCBDaGF0Q29tbWFuZExpbmVIYW5kbGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRTdXNwZW5kVGhyb3R0bGluZ0hhbmRsZXIuSUQsIENoYXRTdXNwZW5kVGhyb3R0bGluZ0hhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRMaWZlY3ljbGVIYW5kbGVyLklELCBDaGF0TGlmZWN5Y2xlSGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRIb3N0Q29udHJpYnV0aW9uLklELCBBZ2VudEhvc3RDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENvcGlsb3RDb25maWdTbGFzaFN1Ym1pdEhhbmRsZXJDb250cmlidXRpb24uSUQsIENvcGlsb3RDb25maWdTbGFzaFN1Ym1pdEhhbmRsZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEFnZW50SG9zdFNlc3Npb25MaXN0Q29udHJpYnV0aW9uLklELCBBZ2VudEhvc3RTZXNzaW9uTGlzdENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRIb3N0T3BlblNlc3Npb25MaW5rT3BlbmVyQ29udHJpYnV0aW9uLklELCBBZ2VudEhvc3RPcGVuU2Vzc2lvbkxpbmtPcGVuZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRIb3N0VGVybWluYWxDb250cmlidXRpb24uSUQsIEFnZW50SG9zdFRlcm1pbmFsQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihBZ2VudEhvc3RDb3BpbG90Q2xpU2V0dGluZ3NDb250cmlidXRpb24uSUQsIEFnZW50SG9zdENvcGlsb3RDbGlTZXR0aW5nc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoT3BlbldvcmtzcGFjZUluQWdlbnRzQ29udHJpYnV0aW9uLklELCBPcGVuV29ya3NwYWNlSW5BZ2VudHNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQWdlbnRzSGFuZG9mZklucHV0VGlwQ29udHJpYnV0aW9uLklELCBBZ2VudHNIYW5kb2ZmSW5wdXRUaXBDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xuXG4vLyBSZW5kZXJlci1zaWRlIEJZT0sgbGFuZ3VhZ2UtbW9kZWwgaGFuZGxlciB0aGF0IGJhY2tzIHRoZSBub2RlIGFnZW50IGhvc3Qnc1xuLy8gT3BlbkFJIHByb3h5LiBMYXppbHkgaW5zdGFudGlhdGVkIHdoZW4gQWdlbnRIb3N0Q2xpZW50Qnlva0xtQ2hhbm5lbCByZXNvbHZlcyBpdC5cbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudEhvc3RCeW9rTG1IYW5kbGVyLCBBZ2VudEhvc3RCeW9rTG1IYW5kbGVyLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuLy8gSG93IGxvbmcgdG8gd2FpdCBmb3IgdGhlIGFnZW50IGhvc3QgdG8gc3VyZmFjZSBhbiBBZ2VudEluZm8gYmVmb3JlXG4vLyB0aHJvd2luZyBhbiBlcnJvci4gTG9uZyBlbm91Z2ggZm9yIG5vcm1hbCBzdGFydHVwLCBzaG9ydCBlbm91Z2ggdG8gYXZvaWRcbi8vIGhhbmdpbmcgYXV0b21hdGlvbiBpbmRlZmluaXRlbHkgaWYgdGhlIGFnZW50IGhvc3QgaXMgZGlzYWJsZWQgb3IgZmFpbHNcbi8vIHRvIHN0YXJ0LlxuY29uc3QgQUdFTlRfSE9TVF9SRUdJU1RSQVRJT05fVElNRU9VVF9NUyA9IDMwXzAwMDtcblxuZnVuY3Rpb24gZ2V0Q29waWxvdEFnZW50SW5mbyhyb290U3RhdGU6IFJvb3RTdGF0ZSB8IEVycm9yIHwgdW5kZWZpbmVkKTogQWdlbnRJbmZvIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyb290U3RhdGUgfHwgcm9vdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiByb290U3RhdGUuYWdlbnRzLmZpbmQoYSA9PiBhLnByb3ZpZGVyID09PSAnY29waWxvdGNsaScpO1xufVxuXG4vKipcbiAqIFJlc29sdmUgdGhlIGFjdHVhbCBzZXNzaW9uLWNvbnRlbnQtcHJvdmlkZXIgc2NoZW1lIHJlZ2lzdGVyZWQgYnkgdGhlIGxvY2FsXG4gKiBhZ2VudCBob3N0LiBUaGUgYWdlbnQgaG9zdCByZWdpc3RlcnMgY2hhdCBzZXNzaW9ucyB1bmRlclxuICogYGFnZW50LWhvc3QtJHthZ2VudC5wcm92aWRlcn1gIChlLmcuIGBhZ2VudC1ob3N0LWNvcGlsb3RjbGlgKSBvbmx5IGFmdGVyIGl0XG4gKiBzdXJmYWNlcyBhbiBgQWdlbnRJbmZvYCB2aWEgYHJvb3RTdGF0ZWAuIFRoaXMgaXMgYXN5bmNocm9ub3VzLCBzbyB0aGUgc3RhdGljXG4gKiBgYWdlbnQtaG9zdC1jb3BpbG90YCB1bWJyZWxsYSBjb21tYW5kcyBuZWVkIHRvIHdhaXQgZm9yIHRoYXQgcmVnaXN0cmF0aW9uXG4gKiBiZWZvcmUgb3BlbmluZyBhIHNlc3Npb24gXHUyMDE0IG90aGVyd2lzZSB3ZSdkIGJ1aWxkIGEgVVJJIHdpdGggYSBzY2hlbWUgdGhhdCBoYXNcbiAqIG5vIGNvbnRlbnQgcHJvdmlkZXIgYW5kIGZhbGwgYmFjayB0byBhIGZyZXNoIGxvY2FsIGNoYXQgc2Vzc2lvbi5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUFnZW50SG9zdFNlc3Npb25UeXBlKGFnZW50SG9zdFNlcnZpY2U6IElBZ2VudEhvc3RTZXJ2aWNlKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3QgYWdlbnQgPSBnZXRDb3BpbG90QWdlbnRJbmZvKGFnZW50SG9zdFNlcnZpY2Uucm9vdFN0YXRlLnZhbHVlKTtcblx0aWYgKGFnZW50KSB7XG5cdFx0cmV0dXJuIGBhZ2VudC1ob3N0LSR7YWdlbnQucHJvdmlkZXJ9YDtcblx0fVxuXG5cdC8vIFdhaXQgZm9yIHRoZSBmaXJzdCBub24tZW1wdHkgcm9vdCBzdGF0ZSwgY2FwcGVkIGJ5IGEgdGltZW91dC5cblx0Ly8gVGhlIHN1YnNjcmlwdGlvbiBtdXN0IGJlIGRpc3Bvc2VkIG9uIGJvdGggc3VjY2VzcyBhbmQgdGltZW91dCB0byBhdm9pZCBsZWFrcy5cblx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdGNvbnN0IHdhaXRGb3JBZ2VudCA9IG5ldyBQcm9taXNlPEFnZW50SW5mbyB8IHVuZGVmaW5lZD4ocmVzID0+IHtcblx0XHRjb25zdCBzdWIgPSBhZ2VudEhvc3RTZXJ2aWNlLnJvb3RTdGF0ZS5vbkRpZENoYW5nZShzdGF0ZSA9PiB7XG5cdFx0XHRjb25zdCBmb3VuZCA9IGdldENvcGlsb3RBZ2VudEluZm8oc3RhdGUpO1xuXHRcdFx0aWYgKGZvdW5kKSB7XG5cdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJlcyhmb3VuZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y3RzLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRyZXModW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHR3YWl0Rm9yQWdlbnQsXG5cdFx0dGltZW91dChBR0VOVF9IT1NUX1JFR0lTVFJBVElPTl9USU1FT1VUX01TKS50aGVuKCgpID0+IHtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pLFxuXHRdKTtcblx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcignQWdlbnQgaG9zdCBkaWQgbm90IHJlZ2lzdGVyIGEgY29waWxvdGNsaSBhZ2VudCB3aXRoaW4gdGhlIHRpbWVvdXQgcGVyaW9kLiBFbnN1cmUgdGhlIGFnZW50IGhvc3QgaXMgZW5hYmxlZCBhbmQgcnVubmluZy4nKTtcblx0fVxuXHRyZXR1cm4gYGFnZW50LWhvc3QtJHtyZXNvbHZlZC5wcm92aWRlcn1gO1xufVxuXG4vLyBPcGVuIGEgbmV3IEFnZW50IEhvc3Qgc2Vzc2lvbiBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24uIFNoYXJlZCBieSB0aGUgc2Vzc2lvblxuLy8gdHlwZSBwaWNrZXIgY29tbWFuZCBhbmQgdGhlIHN0YXRpYyBzaWRlYmFyL2VkaXRvciBjb21tYW5kcyBiZWxvdy5cbi8vIERlbGVnYXRlcyB0byBgb3BlbkNoYXRTZXNzaW9uYCBzbyB0aGUgc2Vzc2lvbiB0eXBlIHBpY2tlciwgY29udGV4dCBrZXlzLFxuLy8gYW5kIHdlbGNvbWUgZmxvd3MgYWxsIHN0YXkgaW4gc3luYyB3aXRoIHRoZSBkeW5hbWljIHBlci1hZ2VudCBwYXRoLlxuYXN5bmMgZnVuY3Rpb24gb3Blbk5ld0FnZW50SG9zdFNlc3Npb24oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHBvc2l0aW9uOiBDaGF0U2Vzc2lvblBvc2l0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdC8vIFNuYXBzaG90IHRoZSBzZXJ2aWNlcyB3ZSBuZWVkIHN5bmNocm9ub3VzbHkgXHUyMDE0IGBhY2Nlc3NvcmAgaXMgb25seSB2YWxpZFxuXHQvLyBiZWZvcmUgdGhlIGZpcnN0IGBhd2FpdGAuIFVzZSB0aGUgaW5zdGFudGlhdGlvbiBzZXJ2aWNlIHRvIG1pbnQgYSBmcmVzaFxuXHQvLyBhY2Nlc3NvciBmb3IgdGhlIGRvd25zdHJlYW0gYG9wZW5DaGF0U2Vzc2lvbmAgY2FsbC5cblx0Y29uc3QgYWdlbnRIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0U2VydmljZSk7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHNlc3Npb25UeXBlID0gYXdhaXQgcmVzb2x2ZUFnZW50SG9zdFNlc3Npb25UeXBlKGFnZW50SG9zdFNlcnZpY2UpO1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oaW5uZXJBY2Nlc3NvciA9PiBvcGVuQ2hhdFNlc3Npb24oaW5uZXJBY2Nlc3Nvciwge1xuXHRcdHR5cGU6IHNlc3Npb25UeXBlLFxuXHRcdGRpc3BsYXlOYW1lOiBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoc2Vzc2lvblR5cGUpLFxuXHRcdHBvc2l0aW9uLFxuXHR9KSk7XG59XG5cbi8vIFN0YXRpYyBzaWRlYmFyL2VkaXRvciBvcGVuIGNvbW1hbmRzIGZvciB0aGUgQWdlbnQgSG9zdCB1bWJyZWxsYSBzY2hlbWUuXG4vLyBUaGUgZHluYW1pYyBwZXItYWdlbnQgY29tbWFuZHMgKGUuZy4gYGFnZW50LWhvc3QtY29waWxvdGApIGFyZSBvbmx5XG4vLyByZWdpc3RlcmVkIGFmdGVyIHRoZSBhZ2VudCBob3N0IHN0YXJ0cyBhbmQgc3VyZmFjZXMgYW4gQWdlbnRJbmZvLCB3aGljaFxuLy8gaXMgYXN5bmNocm9ub3VzLiBQcm92aWRlIHN0YWJsZSBjb21tYW5kIGlkcyB0aGF0IGF1dG9tYXRpb24gKGV2YWxzKSBjYW5cbi8vIGludm9rZSBiZWZvcmUgdGhlIGR5bmFtaWMgcmVnaXN0cmF0aW9uIGhhcyBvY2N1cnJlZC5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFxuXHRgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5OZXdTZXNzaW9uU2lkZWJhci4ke0FnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb3BpbG90fWAsXG5cdGFjY2Vzc29yID0+IG9wZW5OZXdBZ2VudEhvc3RTZXNzaW9uKGFjY2Vzc29yLCBDaGF0U2Vzc2lvblBvc2l0aW9uLlNpZGViYXIpXG4pO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoXG5cdGB3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk5ld1Nlc3Npb25FZGl0b3IuJHtBZ2VudFNlc3Npb25Qcm92aWRlcnMuQWdlbnRIb3N0Q29waWxvdH1gLFxuXHRhY2Nlc3NvciA9PiBvcGVuTmV3QWdlbnRIb3N0U2Vzc2lvbihhY2Nlc3NvciwgQ2hhdFNlc3Npb25Qb3NpdGlvbi5FZGl0b3IpXG4pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDZCQUErQztBQUN4RCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGdCQUFnQixzQ0FBc0M7QUFDL0QsU0FBUyw2QkFBNkI7QUFDdEMs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
