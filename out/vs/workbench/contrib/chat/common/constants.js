import { Schemas } from "../../../../base/common/network.js";
import { IChatSessionsService, isAgentHostTarget, localChatSessionType, SessionType } from "./chatSessionsService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ChatEntitlementContextKeys } from "../../../services/chat/common/chatEntitlementService.js";
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { LocalChatSessionUri } from "./model/chatUri.js";
import { clearUserSelectedSessionType, getRememberedSessionType, hasPreferredCopilotHarness, storeUserSelectedSessionType } from "./chatSessionTypePreference.js";
import { IAgentHostEnablementService } from "../../../../platform/agentHost/common/agentHostEnablementService.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
var BYOKUtilityModelDefault = /* @__PURE__ */ ((BYOKUtilityModelDefault2) => {
  BYOKUtilityModelDefault2["None"] = "none";
  BYOKUtilityModelDefault2["MainAgent"] = "mainAgent";
  BYOKUtilityModelDefault2["Copilot"] = "copilot";
  return BYOKUtilityModelDefault2;
})(BYOKUtilityModelDefault || {});
var ChatConfiguration = /* @__PURE__ */ ((ChatConfiguration2) => {
  ChatConfiguration2["PluginsEnabled"] = "chat.plugins.enabled";
  ChatConfiguration2["PluginLocations"] = "chat.pluginLocations";
  ChatConfiguration2["PluginMarketplaces"] = "chat.plugins.marketplaces";
  ChatConfiguration2["ExtraMarketplaces"] = "chat.plugins.extraMarketplaces";
  ChatConfiguration2["StrictMarketplaces"] = "chat.plugins.strictMarketplaces";
  ChatConfiguration2["EnabledPlugins"] = "chat.plugins.enabledPlugins";
  ChatConfiguration2["AgentEnabled"] = "chat.agent.enabled";
  ChatConfiguration2["PlanAgentDefaultModel"] = "chat.planAgent.defaultModel";
  ChatConfiguration2["ExploreAgentDefaultModel"] = "chat.exploreAgent.defaultModel";
  ChatConfiguration2["UtilityModel"] = "chat.utilityModel";
  ChatConfiguration2["UtilitySmallModel"] = "chat.utilitySmallModel";
  ChatConfiguration2["BYOKUtilityModelDefault"] = "chat.byokUtilityModelDefault";
  ChatConfiguration2["RequestQueueingDefaultAction"] = "chat.requestQueuing.defaultAction";
  ChatConfiguration2["AgentStatusEnabled"] = "chat.agentsControl.enabled";
  ChatConfiguration2["EditorAssociations"] = "chat.editorAssociations";
  ChatConfiguration2["UnifiedAgentsBar"] = "chat.unifiedAgentsBar.enabled";
  ChatConfiguration2["AgentSessionProjectionEnabled"] = "chat.agentSessionProjection.enabled";
  ChatConfiguration2["ExtensionToolsEnabled"] = "chat.extensionTools.enabled";
  ChatConfiguration2["RepoInfoEnabled"] = "chat.repoInfo.enabled";
  ChatConfiguration2["EditRequests"] = "chat.editRequests";
  ChatConfiguration2["InlineReferencesStyle"] = "chat.inlineReferences.style";
  ChatConfiguration2["AutoReply"] = "chat.autoReply";
  ChatConfiguration2["GlobalAutoApprove"] = "chat.tools.global.autoApprove";
  ChatConfiguration2["AutoApproveEdits"] = "chat.tools.edits.autoApprove";
  ChatConfiguration2["AutoApprovedUrls"] = "chat.tools.urls.autoApprove";
  ChatConfiguration2["EligibleForAutoApproval"] = "chat.tools.eligibleForAutoApproval";
  ChatConfiguration2["EnableMath"] = "chat.math.enabled";
  ChatConfiguration2["CheckpointsEnabled"] = "chat.checkpoints.enabled";
  ChatConfiguration2["ThinkingStyle"] = "chat.agent.thinkingStyle";
  ChatConfiguration2["ThinkingGenerateTitles"] = "chat.agent.thinking.generateTitles";
  ChatConfiguration2["TerminalToolsInThinking"] = "chat.agent.thinking.terminalTools";
  ChatConfiguration2["CollapseCompletedResponses"] = "chat.agent.collapseCompletedResponses";
  ChatConfiguration2["SimpleTerminalCollapsible"] = "chat.tools.terminal.simpleCollapsible";
  ChatConfiguration2["CompressOutputEnabled"] = "chat.tools.compressOutput.enabled";
  ChatConfiguration2["ThinkingPhrases"] = "chat.agent.thinking.phrases";
  ChatConfiguration2["AutoExpandToolFailures"] = "chat.tools.autoExpandFailures";
  ChatConfiguration2["TodosShowWidget"] = "chat.tools.todos.showWidget";
  ChatConfiguration2["NotifyWindowOnConfirmation"] = "chat.notifyWindowOnConfirmation";
  ChatConfiguration2["NotifyWindowOnResponseReceived"] = "chat.notifyWindowOnResponseReceived";
  ChatConfiguration2["ChatViewSessionsEnabled"] = "chat.viewSessions.enabled";
  ChatConfiguration2["SessionSyncEnabled"] = "chat.sessionSync.enabled";
  ChatConfiguration2["SessionSyncExcludeRepositories"] = "chat.sessionSync.excludeRepositories";
  ChatConfiguration2["ChatViewSessionsGrouping"] = "chat.viewSessions.grouping";
  ChatConfiguration2["ChatViewSessionsOrientation"] = "chat.viewSessions.orientation";
  ChatConfiguration2["ChatViewProgressBadgeEnabled"] = "chat.viewProgressBadge.enabled";
  ChatConfiguration2["ChatContextUsageEnabled"] = "chat.contextUsage.enabled";
  ChatConfiguration2["Verbose"] = "chat.verbose";
  ChatConfiguration2["ProgressBorder"] = "chat.progressBorder.enabled";
  ChatConfiguration2["SubagentToolCustomAgents"] = "chat.customAgentInSubagent.enabled";
  ChatConfiguration2["SubagentsAllowInvocationsFromSubagents"] = "chat.subagents.allowInvocationsFromSubagents";
  ChatConfiguration2["ShowCodeBlockProgressAnimation"] = "chat.agent.codeBlockProgress";
  ChatConfiguration2["RestoreLastPanelSession"] = "chat.restoreLastPanelSession";
  ChatConfiguration2["ExitAfterDelegation"] = "chat.exitAfterDelegation";
  ChatConfiguration2["ExplainChangesEnabled"] = "chat.editing.explainChanges.enabled";
  ChatConfiguration2["RevealNextChangeOnResolve"] = "chat.editing.revealNextChangeOnResolve";
  ChatConfiguration2["OpenChangedFileInDiffEditor"] = "chat.editing.openChangedFileInDiffEditor";
  ChatConfiguration2["GrowthNotificationEnabled"] = "chat.growthNotification.enabled";
  ChatConfiguration2["TitleBarSignInEnabled"] = "chat.titleBar.signIn.enabled";
  ChatConfiguration2["TitleBarOpenInAgentsWindowEnabled"] = "chat.titleBar.openInAgentsWindow.enabled";
  ChatConfiguration2["ChatCustomizationsStructuredPreviewEnabled"] = "chat.customizations.structuredPreview.enabled";
  ChatConfiguration2["ChatCustomizationsPromptMigrationEnabled"] = "chat.customizations.promptMigration.enabled";
  ChatConfiguration2["AutopilotAdvancedEnabled"] = "chat.autopilot.advanced.enabled";
  ChatConfiguration2["DefaultPermissionLevel"] = "chat.permissions.default";
  ChatConfiguration2["AssistedPermissionsEnabled"] = "chat.assistedPermissions.enabled";
  ChatConfiguration2["PermissionsSandboxToggleEnabled"] = "chat.experimental.permissionsSandboxToggle.enabled";
  ChatConfiguration2["DefaultConfiguration"] = "chat.defaultConfiguration";
  ChatConfiguration2["DefaultModel"] = "chat.defaultModel";
  ChatConfiguration2["ImageCarouselEnabled"] = "imageCarousel.chat.enabled";
  ChatConfiguration2["ArtifactsEnabled"] = "chat.artifacts.enabled";
  ChatConfiguration2["ArtifactsRulesByMimeType"] = "chat.artifacts.rules.byMimeType";
  ChatConfiguration2["ArtifactsRulesByFilePath"] = "chat.artifacts.rules.byFilePath";
  ChatConfiguration2["ArtifactsRulesByMemoryFilePath"] = "chat.artifacts.rules.byMemoryFilePath";
  ChatConfiguration2["ToolConfirmationCarousel"] = "chat.tools.confirmationCarousel.enabled";
  ChatConfiguration2["ToolRiskAssessmentEnabled"] = "chat.tools.riskAssessment.enabled";
  ChatConfiguration2["ToolRiskAssessmentModel"] = "chat.tools.riskAssessment.model";
  ChatConfiguration2["DefaultNewSessionMode"] = "chat.newSession.defaultMode";
  ChatConfiguration2["CopilotCliHideExtensionHostAgents"] = "chat.agents.copilotCli.hideExtensionHost";
  ChatConfiguration2["EditorPreferCopilotHarness"] = "chat.editor.preferCopilotHarness";
  ChatConfiguration2["DefaultToCopilotHarness"] = "chat.defaultToCopilotHarness";
  ChatConfiguration2["EditorLocalAgentEnabled"] = "chat.editor.localAgent.enabled";
  ChatConfiguration2["CopilotCliHideExtensionHostEditor"] = "chat.editor.copilotCli.hideExtensionHost";
  ChatConfiguration2["AgentsHandoffTipMode"] = "chat.agentsHandoffTip.mode";
  ChatConfiguration2["TurnStatusPills"] = "chat.turnStatusPills";
  ChatConfiguration2["IncrementalRendering"] = "chat.experimental.incrementalRendering.enabled";
  ChatConfiguration2["IncrementalRenderingStyle"] = "chat.experimental.incrementalRendering.animationStyle";
  ChatConfiguration2["IncrementalRenderingBuffering"] = "chat.experimental.incrementalRendering.buffering";
  ChatConfiguration2["CollectInstructionsInExtension"] = "chat.experimental.collectInstructionsInExtension";
  ChatConfiguration2["ImplicitContextActiveEditor"] = "chat.implicitContext.includeActiveEditor";
  return ChatConfiguration2;
})(ChatConfiguration || {});
var ChatModeKind = /* @__PURE__ */ ((ChatModeKind2) => {
  ChatModeKind2["Ask"] = "ask";
  ChatModeKind2["Edit"] = "edit";
  ChatModeKind2["Agent"] = "agent";
  return ChatModeKind2;
})(ChatModeKind || {});
var ChatPermissionLevel = /* @__PURE__ */ ((ChatPermissionLevel2) => {
  ChatPermissionLevel2["Default"] = "default";
  ChatPermissionLevel2["Assisted"] = "assisted";
  ChatPermissionLevel2["AutoApprove"] = "autoApprove";
  ChatPermissionLevel2["Autopilot"] = "autopilot";
  return ChatPermissionLevel2;
})(ChatPermissionLevel || {});
const chatPermissionLevels = new Set(Object.values(ChatPermissionLevel));
function isChatPermissionLevel(level) {
  return chatPermissionLevels.has(level);
}
var ChatDefaultPermissionLevel = /* @__PURE__ */ ((ChatDefaultPermissionLevel2) => {
  ChatDefaultPermissionLevel2["Default"] = "default";
  ChatDefaultPermissionLevel2["Assisted"] = "assisted";
  ChatDefaultPermissionLevel2["AllowAll"] = "allowAll";
  return ChatDefaultPermissionLevel2;
})(ChatDefaultPermissionLevel || {});
function getChatPermissionLevelFromDefaultConfiguration(value) {
  switch (value) {
    case "default" /* Default */:
      return "default" /* Default */;
    case "assisted" /* Assisted */:
      return "assisted" /* Assisted */;
    case "allowAll" /* AllowAll */:
    case "autoApprove" /* AutoApprove */:
      return "autoApprove" /* AutoApprove */;
    default:
      return void 0;
  }
}
function isAutoApproveLevel(level) {
  return level === "autoApprove" /* AutoApprove */ || level === "autopilot" /* Autopilot */;
}
function isAutopilotLevel(level) {
  return level === "autopilot" /* Autopilot */;
}
var ThinkingDisplayMode = /* @__PURE__ */ ((ThinkingDisplayMode2) => {
  ThinkingDisplayMode2["Collapsed"] = "collapsed";
  ThinkingDisplayMode2["CollapsedPreview"] = "collapsedPreview";
  ThinkingDisplayMode2["FixedScrolling"] = "fixedScrolling";
  return ThinkingDisplayMode2;
})(ThinkingDisplayMode || {});
var CollapsedToolsDisplayMode = /* @__PURE__ */ ((CollapsedToolsDisplayMode2) => {
  CollapsedToolsDisplayMode2["Off"] = "off";
  CollapsedToolsDisplayMode2["WithThinking"] = "withThinking";
  CollapsedToolsDisplayMode2["Always"] = "always";
  return CollapsedToolsDisplayMode2;
})(CollapsedToolsDisplayMode || {});
var ChatNotificationMode = /* @__PURE__ */ ((ChatNotificationMode2) => {
  ChatNotificationMode2["Off"] = "off";
  ChatNotificationMode2["WindowNotFocused"] = "windowNotFocused";
  ChatNotificationMode2["Always"] = "always";
  return ChatNotificationMode2;
})(ChatNotificationMode || {});
var ChatAgentLocation = /* @__PURE__ */ ((ChatAgentLocation2) => {
  ChatAgentLocation2["Chat"] = "panel";
  ChatAgentLocation2["Terminal"] = "terminal";
  ChatAgentLocation2["Notebook"] = "notebook";
  ChatAgentLocation2["EditorInline"] = "editor";
  return ChatAgentLocation2;
})(ChatAgentLocation || {});
((ChatAgentLocation2) => {
  function fromRaw(value) {
    switch (value) {
      case "panel":
        return "panel" /* Chat */;
      case "terminal":
        return "terminal" /* Terminal */;
      case "notebook":
        return "notebook" /* Notebook */;
      case "editor":
        return "editor" /* EditorInline */;
    }
    return "panel" /* Chat */;
  }
  ChatAgentLocation2.fromRaw = fromRaw;
})(ChatAgentLocation || (ChatAgentLocation = {}));
const chatAlwaysUnsupportedFileSchemes = /* @__PURE__ */ new Set([
  Schemas.vscodeChatEditor,
  Schemas.walkThrough,
  Schemas.vscodeLocalChatSession,
  Schemas.vscodeSettings,
  Schemas.webviewPanel,
  Schemas.vscodeUserData,
  Schemas.extension,
  "ccreq",
  "openai-codex"
  // Codex session custom editor scheme
]);
function isSupportedChatFileScheme(accessor, scheme) {
  const chatService = accessor.get(IChatSessionsService);
  if (chatAlwaysUnsupportedFileSchemes.has(scheme)) {
    return false;
  }
  if (chatService.getContentProviderSchemes().includes(scheme)) {
    return false;
  }
  return true;
}
function getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled) {
  if (isVirtualWorkspace(workspace)) {
    return localChatSessionType;
  }
  if (agentHostEnabled && configurationService.getValue("chat.defaultToCopilotHarness" /* DefaultToCopilotHarness */)) {
    return SessionType.AgentHostCopilot;
  }
  if (isEditorLocalAgentEnabled(configurationService, workspace)) {
    return localChatSessionType;
  }
  return getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace)[0] ?? localChatSessionType;
}
function getComputedDefaultSessionResource(configurationService, chatSessionsService, workspace, agentHostEnabled) {
  const defaultType = getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled);
  return defaultType === localChatSessionType ? LocalChatSessionUri.getNewSessionUri() : URI.from({ scheme: defaultType, path: `/untitled-${generateUuid()}` });
}
function isNewChatSessionTypeUsable(sessionType, configurationService, chatSessionsService, workspace) {
  if (sessionType === localChatSessionType) {
    return isEditorLocalAgentEnabled(configurationService, workspace);
  }
  if (isAgentHostTarget(sessionType)) {
    return true;
  }
  return isVisibleEditorChatSessionType(sessionType, configurationService, chatSessionsService, workspace);
}
function getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options) {
  if (options?.explicitOverride) {
    return options.explicitOverride;
  }
  if (isVirtualWorkspace(workspace)) {
    return localChatSessionType;
  }
  const remembered = getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace);
  if (remembered) {
    return remembered;
  }
  if (options?.currentSessionType && isNewChatSessionTypeUsable(options.currentSessionType, configurationService, chatSessionsService, workspace)) {
    return options.currentSessionType;
  }
  return getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled);
}
function resolveDefaultNewChatSessionType(accessor, options) {
  const configurationService = accessor.get(IConfigurationService);
  const chatSessionsService = accessor.get(IChatSessionsService);
  const storageService = accessor.get(IStorageService);
  const workspace = accessor.get(IWorkspaceContextService).getWorkspace();
  const agentHostEnabled = accessor.get(IAgentHostEnablementService).enabled.get();
  if (options?.explicitOverride) {
    return { sessionType: options.explicitOverride, isPreferCopilotHarnessSwap: false };
  }
  if (isVirtualWorkspace(workspace)) {
    return { sessionType: localChatSessionType, isPreferCopilotHarnessSwap: false };
  }
  const remembered = getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace);
  if (remembered && remembered !== localChatSessionType) {
    return { sessionType: remembered, isPreferCopilotHarnessSwap: false };
  }
  if (options?.currentSessionType === localChatSessionType && agentHostEnabled && configurationService.getValue("chat.editor.preferCopilotHarness" /* EditorPreferCopilotHarness */) && !hasPreferredCopilotHarness(storageService)) {
    return { sessionType: SessionType.AgentHostCopilot, isPreferCopilotHarnessSwap: true };
  }
  return { sessionType: getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options), isPreferCopilotHarnessSwap: false };
}
function getUsableRememberedSessionType(storageService, configurationService, chatSessionsService, workspace) {
  const remembered = getRememberedSessionType(storageService);
  return remembered && isNewChatSessionTypeUsable(remembered, configurationService, chatSessionsService, workspace) ? remembered : void 0;
}
function getDefaultNewChatSessionResource(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options) {
  const defaultType = getDefaultNewChatSessionType(configurationService, chatSessionsService, storageService, workspace, agentHostEnabled, options);
  return defaultType === localChatSessionType ? LocalChatSessionUri.getNewSessionUri() : URI.from({ scheme: defaultType, path: `/untitled-${generateUuid()}` });
}
function recordUserSelectedSessionType(storageService, configurationService, chatSessionsService, workspace, sessionType, agentHostEnabled) {
  if (sessionType === getComputedDefaultSessionType(configurationService, chatSessionsService, workspace, agentHostEnabled)) {
    clearUserSelectedSessionType(storageService);
  } else {
    storeUserSelectedSessionType(storageService, sessionType);
  }
}
function isEditorLocalAgentEnabled(configurationService, workspace) {
  return isVirtualWorkspace(workspace) || (configurationService.getValue("chat.editor.localAgent.enabled" /* EditorLocalAgentEnabled */) ?? true);
}
function isVisibleEditorChatSessionType(sessionType, configurationService, chatSessionsService, workspace) {
  if (sessionType === localChatSessionType) {
    return isEditorLocalAgentEnabled(configurationService, workspace) || getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace).length === 0;
  }
  if (sessionType === SessionType.CopilotCLI && configurationService.getValue("chat.editor.copilotCli.hideExtensionHost" /* CopilotCliHideExtensionHostEditor */)) {
    return false;
  }
  return !!chatSessionsService.getChatSessionContribution(sessionType);
}
function getVisibleNonLocalEditorChatSessionTypes(configurationService, chatSessionsService, workspace) {
  const sessionTypes = /* @__PURE__ */ new Set();
  for (const contribution of chatSessionsService.getAllChatSessionContributions()) {
    if (contribution.type !== localChatSessionType && isVisibleEditorChatSessionType(contribution.type, configurationService, chatSessionsService, workspace)) {
      sessionTypes.add(contribution.type);
    }
  }
  return Array.from(sessionTypes);
}
const MANAGE_CHAT_COMMAND_ID = "workbench.action.chat.manage";
const CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID = "workbench.action.chat.openAgentHostChat";
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID = "workbench.action.openWorkspaceInAgentsWindow";
const OPEN_AGENTS_WINDOW_COMMAND_ID = "workbench.action.openAgentsWindow";
const OPEN_AGENTS_WINDOW_PRECONDITION = ContextKeyExpr.and(
  ChatEntitlementContextKeys.Setup.hidden.negate(),
  ChatEntitlementContextKeys.Setup.disabledInWorkspace.negate(),
  IsSessionsWindowContext.negate(),
  ContextKeyExpr.has(`config.${"chat.agent.enabled" /* AgentEnabled */}`),
  IsAuxiliaryWindowContext.negate()
);
const ChatEditorTitleMaxLength = 30;
const CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES = 1e3;
const CONTEXT_MODELS_EDITOR = new RawContextKey("inModelsEditor", false);
const CONTEXT_MODELS_SEARCH_FOCUS = new RawContextKey("inModelsSearch", false);
export {
  BYOKUtilityModelDefault,
  CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
  CHAT_TERMINAL_OUTPUT_MAX_PREVIEW_LINES,
  CONTEXT_MODELS_EDITOR,
  CONTEXT_MODELS_SEARCH_FOCUS,
  ChatAIDisabledSettingId,
  ChatAgentLocation,
  ChatConfiguration,
  ChatDefaultPermissionLevel,
  ChatEditorTitleMaxLength,
  ChatModeKind,
  ChatNotificationMode,
  ChatPermissionLevel,
  CollapsedToolsDisplayMode,
  MANAGE_CHAT_COMMAND_ID,
  OPEN_AGENTS_WINDOW_COMMAND_ID,
  OPEN_AGENTS_WINDOW_PRECONDITION,
  OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
  ThinkingDisplayMode,
  getChatPermissionLevelFromDefaultConfiguration,
  getComputedDefaultSessionResource,
  getComputedDefaultSessionType,
  getDefaultNewChatSessionResource,
  getDefaultNewChatSessionType,
  isAutoApproveLevel,
  isAutopilotLevel,
  isChatPermissionLevel,
  isEditorLocalAgentEnabled,
  isNewChatSessionTypeUsable,
  isSupportedChatFileScheme,
  isVisibleEditorChatSessionType,
  recordUserSelectedSessionType,
  resolveDefaultNewChatSessionType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBpc0FnZW50SG9zdFRhcmdldCwgbG9jYWxDaGF0U2Vzc2lvblR5cGUsIFNlc3Npb25UeXBlIH0gZnJvbSAnLi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBpc1ZpcnR1YWxXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgY2xlYXJVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZSwgZ2V0UmVtZW1iZXJlZFNlc3Npb25UeXBlLCBoYXNQcmVmZXJyZWRDb3BpbG90SGFybmVzcywgc3RvcmVVc2VyU2VsZWN0ZWRTZXNzaW9uVHlwZSB9IGZyb20gJy4vY2hhdFNlc3Npb25UeXBlUHJlZmVyZW5jZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IHsgQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jaGF0L2NvbW1vbi9jaGF0U2V0dGluZ3MuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBCWU9LVXRpbGl0eU1vZGVsRGVmYXVsdCB7XG5cdE5vbmUgPSAnbm9uZScsXG5cdE1haW5BZ2VudCA9ICdtYWluQWdlbnQnLFxuXHRDb3BpbG90ID0gJ2NvcGlsb3QnLFxufVxuXG5leHBvcnQgZW51bSBDaGF0Q29uZmlndXJhdGlvbiB7XG5cdFBsdWdpbnNFbmFibGVkID0gJ2NoYXQucGx1Z2lucy5lbmFibGVkJyxcblx0UGx1Z2luTG9jYXRpb25zID0gJ2NoYXQucGx1Z2luTG9jYXRpb25zJyxcblx0UGx1Z2luTWFya2V0cGxhY2VzID0gJ2NoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXMnLFxuXHRFeHRyYU1hcmtldHBsYWNlcyA9ICdjaGF0LnBsdWdpbnMuZXh0cmFNYXJrZXRwbGFjZXMnLFxuXHRTdHJpY3RNYXJrZXRwbGFjZXMgPSAnY2hhdC5wbHVnaW5zLnN0cmljdE1hcmtldHBsYWNlcycsXG5cdEVuYWJsZWRQbHVnaW5zID0gJ2NoYXQucGx1Z2lucy5lbmFibGVkUGx1Z2lucycsXG5cdEFnZW50RW5hYmxlZCA9ICdjaGF0LmFnZW50LmVuYWJsZWQnLFxuXHRQbGFuQWdlbnREZWZhdWx0TW9kZWwgPSAnY2hhdC5wbGFuQWdlbnQuZGVmYXVsdE1vZGVsJyxcblx0RXhwbG9yZUFnZW50RGVmYXVsdE1vZGVsID0gJ2NoYXQuZXhwbG9yZUFnZW50LmRlZmF1bHRNb2RlbCcsXG5cdFV0aWxpdHlNb2RlbCA9ICdjaGF0LnV0aWxpdHlNb2RlbCcsXG5cdFV0aWxpdHlTbWFsbE1vZGVsID0gJ2NoYXQudXRpbGl0eVNtYWxsTW9kZWwnLFxuXHRCWU9LVXRpbGl0eU1vZGVsRGVmYXVsdCA9ICdjaGF0LmJ5b2tVdGlsaXR5TW9kZWxEZWZhdWx0Jyxcblx0UmVxdWVzdFF1ZXVlaW5nRGVmYXVsdEFjdGlvbiA9ICdjaGF0LnJlcXVlc3RRdWV1aW5nLmRlZmF1bHRBY3Rpb24nLFxuXHRBZ2VudFN0YXR1c0VuYWJsZWQgPSAnY2hhdC5hZ2VudHNDb250cm9sLmVuYWJsZWQnLFxuXHRFZGl0b3JBc3NvY2lhdGlvbnMgPSAnY2hhdC5lZGl0b3JBc3NvY2lhdGlvbnMnLFxuXHRVbmlmaWVkQWdlbnRzQmFyID0gJ2NoYXQudW5pZmllZEFnZW50c0Jhci5lbmFibGVkJyxcblx0QWdlbnRTZXNzaW9uUHJvamVjdGlvbkVuYWJsZWQgPSAnY2hhdC5hZ2VudFNlc3Npb25Qcm9qZWN0aW9uLmVuYWJsZWQnLFxuXHRFeHRlbnNpb25Ub29sc0VuYWJsZWQgPSAnY2hhdC5leHRlbnNpb25Ub29scy5lbmFibGVkJyxcblx0UmVwb0luZm9FbmFibGVkID0gJ2NoYXQucmVwb0luZm8uZW5hYmxlZCcsXG5cdEVkaXRSZXF1ZXN0cyA9ICdjaGF0LmVkaXRSZXF1ZXN0cycsXG5cdElubGluZVJlZmVyZW5jZXNTdHlsZSA9ICdjaGF0LmlubGluZVJlZmVyZW5jZXMuc3R5bGUnLFxuXHRBdXRvUmVwbHkgPSAnY2hhdC5hdXRvUmVwbHknLFxuXHRHbG9iYWxBdXRvQXBwcm92ZSA9ICdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScsXG5cdEF1dG9BcHByb3ZlRWRpdHMgPSAnY2hhdC50b29scy5lZGl0cy5hdXRvQXBwcm92ZScsXG5cdEF1dG9BcHByb3ZlZFVybHMgPSAnY2hhdC50b29scy51cmxzLmF1dG9BcHByb3ZlJyxcblx0RWxpZ2libGVGb3JBdXRvQXBwcm92YWwgPSAnY2hhdC50b29scy5lbGlnaWJsZUZvckF1dG9BcHByb3ZhbCcsXG5cdEVuYWJsZU1hdGggPSAnY2hhdC5tYXRoLmVuYWJsZWQnLFxuXHRDaGVja3BvaW50c0VuYWJsZWQgPSAnY2hhdC5jaGVja3BvaW50cy5lbmFibGVkJyxcblx0VGhpbmtpbmdTdHlsZSA9ICdjaGF0LmFnZW50LnRoaW5raW5nU3R5bGUnLFxuXHRUaGlua2luZ0dlbmVyYXRlVGl0bGVzID0gJ2NoYXQuYWdlbnQudGhpbmtpbmcuZ2VuZXJhdGVUaXRsZXMnLFxuXHRUZXJtaW5hbFRvb2xzSW5UaGlua2luZyA9ICdjaGF0LmFnZW50LnRoaW5raW5nLnRlcm1pbmFsVG9vbHMnLFxuXHRDb2xsYXBzZUNvbXBsZXRlZFJlc3BvbnNlcyA9ICdjaGF0LmFnZW50LmNvbGxhcHNlQ29tcGxldGVkUmVzcG9uc2VzJyxcblx0U2ltcGxlVGVybWluYWxDb2xsYXBzaWJsZSA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLnNpbXBsZUNvbGxhcHNpYmxlJyxcblx0Q29tcHJlc3NPdXRwdXRFbmFibGVkID0gJ2NoYXQudG9vbHMuY29tcHJlc3NPdXRwdXQuZW5hYmxlZCcsXG5cdFRoaW5raW5nUGhyYXNlcyA9ICdjaGF0LmFnZW50LnRoaW5raW5nLnBocmFzZXMnLFxuXHRBdXRvRXhwYW5kVG9vbEZhaWx1cmVzID0gJ2NoYXQudG9vbHMuYXV0b0V4cGFuZEZhaWx1cmVzJyxcblx0VG9kb3NTaG93V2lkZ2V0ID0gJ2NoYXQudG9vbHMudG9kb3Muc2hvd1dpZGdldCcsXG5cdE5vdGlmeVdpbmRvd09uQ29uZmlybWF0aW9uID0gJ2NoYXQubm90aWZ5V2luZG93T25Db25maXJtYXRpb24nLFxuXHROb3RpZnlXaW5kb3dPblJlc3BvbnNlUmVjZWl2ZWQgPSAnY2hhdC5ub3RpZnlXaW5kb3dPblJlc3BvbnNlUmVjZWl2ZWQnLFxuXHRDaGF0Vmlld1Nlc3Npb25zRW5hYmxlZCA9ICdjaGF0LnZpZXdTZXNzaW9ucy5lbmFibGVkJyxcblx0U2Vzc2lvblN5bmNFbmFibGVkID0gJ2NoYXQuc2Vzc2lvblN5bmMuZW5hYmxlZCcsXG5cdFNlc3Npb25TeW5jRXhjbHVkZVJlcG9zaXRvcmllcyA9ICdjaGF0LnNlc3Npb25TeW5jLmV4Y2x1ZGVSZXBvc2l0b3JpZXMnLFxuXHRDaGF0Vmlld1Nlc3Npb25zR3JvdXBpbmcgPSAnY2hhdC52aWV3U2Vzc2lvbnMuZ3JvdXBpbmcnLFxuXHRDaGF0Vmlld1Nlc3Npb25zT3JpZW50YXRpb24gPSAnY2hhdC52aWV3U2Vzc2lvbnMub3JpZW50YXRpb24nLFxuXHRDaGF0Vmlld1Byb2dyZXNzQmFkZ2VFbmFibGVkID0gJ2NoYXQudmlld1Byb2dyZXNzQmFkZ2UuZW5hYmxlZCcsXG5cdENoYXRDb250ZXh0VXNhZ2VFbmFibGVkID0gJ2NoYXQuY29udGV4dFVzYWdlLmVuYWJsZWQnLFxuXHRWZXJib3NlID0gJ2NoYXQudmVyYm9zZScsXG5cdFByb2dyZXNzQm9yZGVyID0gJ2NoYXQucHJvZ3Jlc3NCb3JkZXIuZW5hYmxlZCcsXG5cdFN1YmFnZW50VG9vbEN1c3RvbUFnZW50cyA9ICdjaGF0LmN1c3RvbUFnZW50SW5TdWJhZ2VudC5lbmFibGVkJyxcblx0U3ViYWdlbnRzQWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHMgPSAnY2hhdC5zdWJhZ2VudHMuYWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHMnLFxuXHRTaG93Q29kZUJsb2NrUHJvZ3Jlc3NBbmltYXRpb24gPSAnY2hhdC5hZ2VudC5jb2RlQmxvY2tQcm9ncmVzcycsXG5cdFJlc3RvcmVMYXN0UGFuZWxTZXNzaW9uID0gJ2NoYXQucmVzdG9yZUxhc3RQYW5lbFNlc3Npb24nLFxuXHRFeGl0QWZ0ZXJEZWxlZ2F0aW9uID0gJ2NoYXQuZXhpdEFmdGVyRGVsZWdhdGlvbicsXG5cdEV4cGxhaW5DaGFuZ2VzRW5hYmxlZCA9ICdjaGF0LmVkaXRpbmcuZXhwbGFpbkNoYW5nZXMuZW5hYmxlZCcsXG5cdFJldmVhbE5leHRDaGFuZ2VPblJlc29sdmUgPSAnY2hhdC5lZGl0aW5nLnJldmVhbE5leHRDaGFuZ2VPblJlc29sdmUnLFxuXHRPcGVuQ2hhbmdlZEZpbGVJbkRpZmZFZGl0b3IgPSAnY2hhdC5lZGl0aW5nLm9wZW5DaGFuZ2VkRmlsZUluRGlmZkVkaXRvcicsXG5cdEdyb3d0aE5vdGlmaWNhdGlvbkVuYWJsZWQgPSAnY2hhdC5ncm93dGhOb3RpZmljYXRpb24uZW5hYmxlZCcsXG5cdFRpdGxlQmFyU2lnbkluRW5hYmxlZCA9ICdjaGF0LnRpdGxlQmFyLnNpZ25Jbi5lbmFibGVkJyxcblx0VGl0bGVCYXJPcGVuSW5BZ2VudHNXaW5kb3dFbmFibGVkID0gJ2NoYXQudGl0bGVCYXIub3BlbkluQWdlbnRzV2luZG93LmVuYWJsZWQnLFxuXG5cdENoYXRDdXN0b21pemF0aW9uc1N0cnVjdHVyZWRQcmV2aWV3RW5hYmxlZCA9ICdjaGF0LmN1c3RvbWl6YXRpb25zLnN0cnVjdHVyZWRQcmV2aWV3LmVuYWJsZWQnLFxuXHRDaGF0Q3VzdG9taXphdGlvbnNQcm9tcHRNaWdyYXRpb25FbmFibGVkID0gJ2NoYXQuY3VzdG9taXphdGlvbnMucHJvbXB0TWlncmF0aW9uLmVuYWJsZWQnLFxuXHRBdXRvcGlsb3RBZHZhbmNlZEVuYWJsZWQgPSAnY2hhdC5hdXRvcGlsb3QuYWR2YW5jZWQuZW5hYmxlZCcsXG5cdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwgPSAnY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0Jyxcblx0QXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQgPSAnY2hhdC5hc3Npc3RlZFBlcm1pc3Npb25zLmVuYWJsZWQnLFxuXHRQZXJtaXNzaW9uc1NhbmRib3hUb2dnbGVFbmFibGVkID0gJ2NoYXQuZXhwZXJpbWVudGFsLnBlcm1pc3Npb25zU2FuZGJveFRvZ2dsZS5lbmFibGVkJyxcblx0RGVmYXVsdENvbmZpZ3VyYXRpb24gPSAnY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbicsXG5cdERlZmF1bHRNb2RlbCA9ICdjaGF0LmRlZmF1bHRNb2RlbCcsXG5cdEltYWdlQ2Fyb3VzZWxFbmFibGVkID0gJ2ltYWdlQ2Fyb3VzZWwuY2hhdC5lbmFibGVkJyxcblx0QXJ0aWZhY3RzRW5hYmxlZCA9ICdjaGF0LmFydGlmYWN0cy5lbmFibGVkJyxcblx0QXJ0aWZhY3RzUnVsZXNCeU1pbWVUeXBlID0gJ2NoYXQuYXJ0aWZhY3RzLnJ1bGVzLmJ5TWltZVR5cGUnLFxuXHRBcnRpZmFjdHNSdWxlc0J5RmlsZVBhdGggPSAnY2hhdC5hcnRpZmFjdHMucnVsZXMuYnlGaWxlUGF0aCcsXG5cdEFydGlmYWN0c1J1bGVzQnlNZW1vcnlGaWxlUGF0aCA9ICdjaGF0LmFydGlmYWN0cy5ydWxlcy5ieU1lbW9yeUZpbGVQYXRoJyxcblx0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsID0gJ2NoYXQudG9vbHMuY29uZmlybWF0aW9uQ2Fyb3VzZWwuZW5hYmxlZCcsXG5cdFRvb2xSaXNrQXNzZXNzbWVudEVuYWJsZWQgPSAnY2hhdC50b29scy5yaXNrQXNzZXNzbWVudC5lbmFibGVkJyxcblx0VG9vbFJpc2tBc3Nlc3NtZW50TW9kZWwgPSAnY2hhdC50b29scy5yaXNrQXNzZXNzbWVudC5tb2RlbCcsXG5cdERlZmF1bHROZXdTZXNzaW9uTW9kZSA9ICdjaGF0Lm5ld1Nlc3Npb24uZGVmYXVsdE1vZGUnLFxuXHRDb3BpbG90Q2xpSGlkZUV4dGVuc2lvbkhvc3RBZ2VudHMgPSAnY2hhdC5hZ2VudHMuY29waWxvdENsaS5oaWRlRXh0ZW5zaW9uSG9zdCcsXG5cdEVkaXRvclByZWZlckNvcGlsb3RIYXJuZXNzID0gJ2NoYXQuZWRpdG9yLnByZWZlckNvcGlsb3RIYXJuZXNzJyxcblx0RGVmYXVsdFRvQ29waWxvdEhhcm5lc3MgPSAnY2hhdC5kZWZhdWx0VG9Db3BpbG90SGFybmVzcycsXG5cdEVkaXRvckxvY2FsQWdlbnRFbmFibGVkID0gJ2NoYXQuZWRpdG9yLmxvY2FsQWdlbnQuZW5hYmxlZCcsXG5cdENvcGlsb3RDbGlIaWRlRXh0ZW5zaW9uSG9zdEVkaXRvciA9ICdjaGF0LmVkaXRvci5jb3BpbG90Q2xpLmhpZGVFeHRlbnNpb25Ib3N0Jyxcblx0QWdlbnRzSGFuZG9mZlRpcE1vZGUgPSAnY2hhdC5hZ2VudHNIYW5kb2ZmVGlwLm1vZGUnLFxuXHRUdXJuU3RhdHVzUGlsbHMgPSAnY2hhdC50dXJuU3RhdHVzUGlsbHMnLFxuXG5cdEluY3JlbWVudGFsUmVuZGVyaW5nID0gJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmVuYWJsZWQnLFxuXHRJbmNyZW1lbnRhbFJlbmRlcmluZ1N0eWxlID0gJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmFuaW1hdGlvblN0eWxlJyxcblx0SW5jcmVtZW50YWxSZW5kZXJpbmdCdWZmZXJpbmcgPSAnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYnVmZmVyaW5nJyxcblxuXHRDb2xsZWN0SW5zdHJ1Y3Rpb25zSW5FeHRlbnNpb24gPSAnY2hhdC5leHBlcmltZW50YWwuY29sbGVjdEluc3RydWN0aW9uc0luRXh0ZW5zaW9uJyxcblx0SW1wbGljaXRDb250ZXh0QWN0aXZlRWRpdG9yID0gJ2NoYXQuaW1wbGljaXRDb250ZXh0LmluY2x1ZGVBY3RpdmVFZGl0b3InLFxufVxuXG4vKipcbiAqIFRoZSBcImtpbmRcIiBvZiBhZ2VudHMgZm9yIGN1c3RvbSBhZ2VudHMuXG4gKi9cbmV4cG9ydCBlbnVtIENoYXRNb2RlS2luZCB7XG5cdEFzayA9ICdhc2snLFxuXHRFZGl0ID0gJ2VkaXQnLFxuXHRBZ2VudCA9ICdhZ2VudCdcbn1cblxuLyoqXG4gKiBUaGUgcGVybWlzc2lvbiBsZXZlbCBjb250cm9sbGluZyB0b29sIGF1dG8tYXBwcm92YWwgYmVoYXZpb3IuXG4gKi9cbmV4cG9ydCBlbnVtIENoYXRQZXJtaXNzaW9uTGV2ZWwge1xuXHQvKiogVXNlIGV4aXN0aW5nIGF1dG8tYXBwcm92ZSBzZXR0aW5ncyAqL1xuXHREZWZhdWx0ID0gJ2RlZmF1bHQnLFxuXHQvKiogRGVsZWdhdGUgYXBwcm92YWwgZGVjaXNpb25zIHRvIGEgbW9kZWwgKi9cblx0QXNzaXN0ZWQgPSAnYXNzaXN0ZWQnLFxuXHQvKiogQXV0by1hcHByb3ZlIGFsbCB0b29sIGNhbGxzLCBhdXRvLXJldHJ5IG9uIGVycm9yICovXG5cdEF1dG9BcHByb3ZlID0gJ2F1dG9BcHByb3ZlJyxcblx0LyoqIEV2ZXJ5dGhpbmcgQXV0b0FwcHJvdmUgZG9lcyBwbHVzIGFuIGludGVybmFsIHN0b3AgaG9vayB0aGF0IGNvbnRpbnVlcyB1bnRpbCB0aGUgdGFzayBpcyBkb25lICovXG5cdEF1dG9waWxvdCA9ICdhdXRvcGlsb3QnXG59XG5cbmNvbnN0IGNoYXRQZXJtaXNzaW9uTGV2ZWxzID0gbmV3IFNldDxzdHJpbmc+KE9iamVjdC52YWx1ZXMoQ2hhdFBlcm1pc3Npb25MZXZlbCkpO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0UGVybWlzc2lvbkxldmVsKGxldmVsOiB1bmtub3duIHwgdW5kZWZpbmVkKTogbGV2ZWwgaXMgQ2hhdFBlcm1pc3Npb25MZXZlbCB7XG5cdHJldHVybiBjaGF0UGVybWlzc2lvbkxldmVscy5oYXMobGV2ZWwgYXMgc3RyaW5nKTtcbn1cblxuLyoqXG4gKiBTaGFwZSBvZiB0aGUge0BsaW5rIENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRDb25maWd1cmF0aW9ufVxuICogb2JqZWN0IHNldHRpbmcuIENvbnRyb2xzIHRoZSBzdGFydGluZyBgbW9kZWAgYW5kIGBhcHByb3ZhbHNgIGZvciBuZXcgYWdlbnQtaG9zdFxuICogc2Vzc2lvbnMgKHN1Y2ggYXMgQ29waWxvdCBDTEkpLiBBbGwgcHJvcGVydGllcyBhcmUgb3B0aW9uYWwgXHUyMDE0IGEgbWlzc2luZyBwcm9wZXJ0eVxuICogZmFsbHMgYmFjayB0byB0aGUgcGVyLWF4aXMgZGVmYXVsdC5cbiAqL1xuZXhwb3J0IHR5cGUgQWdlbnRTZXNzaW9uTW9kZSA9ICdpbnRlcmFjdGl2ZScgfCAncGxhbicgfCAnYXV0b3BpbG90JztcblxuLyoqIEFwcHJvdmFsIHZhbHVlcyBleHBvc2VkIGJ5IHRoZSBgY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbmAgc2V0dGluZy4gKi9cbmV4cG9ydCBlbnVtIENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsIHtcblx0RGVmYXVsdCA9ICdkZWZhdWx0Jyxcblx0QXNzaXN0ZWQgPSAnYXNzaXN0ZWQnLFxuXHRBbGxvd0FsbCA9ICdhbGxvd0FsbCcsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXREZWZhdWx0Q29uZmlndXJhdGlvbiB7XG5cdC8qKiBTdGFydGluZyBhZ2VudCBtb2RlOiBgaW50ZXJhY3RpdmVgIC8gYHBsYW5gIC8gYGF1dG9waWxvdGAuICovXG5cdHJlYWRvbmx5IG1vZGU/OiBBZ2VudFNlc3Npb25Nb2RlO1xuXHQvKiogU3RhcnRpbmcgYXBwcm92YWwgbGV2ZWw6IGBkZWZhdWx0YCAvIGBhc3Npc3RlZGAgLyBgYWxsb3dBbGxgLiAqL1xuXHRyZWFkb25seSBhcHByb3ZhbHM/OiBDaGF0RGVmYXVsdFBlcm1pc3Npb25MZXZlbDtcbn1cblxuLyoqIE1hcHMgYSBkZWZhdWx0LWNvbmZpZ3VyYXRpb24gdmFsdWUgdG8gdGhlIGludGVybmFsIEFnZW50IEhvc3QgcGVybWlzc2lvbiBsZXZlbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDaGF0UGVybWlzc2lvbkxldmVsRnJvbURlZmF1bHRDb25maWd1cmF0aW9uKHZhbHVlOiB1bmtub3duKTogQ2hhdFBlcm1pc3Npb25MZXZlbCB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAodmFsdWUpIHtcblx0XHRjYXNlIENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHRcdGNhc2UgQ2hhdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwuQXNzaXN0ZWQ6XG5cdFx0XHRyZXR1cm4gQ2hhdFBlcm1pc3Npb25MZXZlbC5Bc3Npc3RlZDtcblx0XHRjYXNlIENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLkFsbG93QWxsOlxuXHRcdGNhc2UgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZTpcblx0XHRcdHJldHVybiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBwZXJtaXNzaW9uIGxldmVsIGVuYWJsZXMgYXV0by1hcHByb3ZhbCBvZiBhbGwgdG9vbCBjYWxscy5cbiAqIEJvdGgge0BsaW5rIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmV9IGFuZCB7QGxpbmsgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3R9IGVuYWJsZSBhdXRvLWFwcHJvdmFsLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRvQXBwcm92ZUxldmVsKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBsZXZlbCA9PT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSB8fCBsZXZlbCA9PT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3Q7XG59XG5cbi8qKlxuICogVHJ1ZSBmb3Ige0BsaW5rIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90fSBvbmx5LiBVbmxpa2Uge0BsaW5rIGlzQXV0b0FwcHJvdmVMZXZlbH0sIHRoaXNcbiAqIGV4Y2x1ZGVzIHtAbGluayBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlfSwgc28gaXQgY2FuIGdhdGUgQXV0b3BpbG90LW9ubHkgYmVoYXZpb3Igc3VjaCBhc1xuICogcmlzay1iYXNlZCBza2lwcGluZyBvZiB0b29sIGNhbGxzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBdXRvcGlsb3RMZXZlbChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbGV2ZWwgPT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90O1xufVxuXG4vLyBUaGlua2luZyBkaXNwbGF5IG1vZGVzIGZvciBwaW5uZWQgY29udGVudFxuZXhwb3J0IGVudW0gVGhpbmtpbmdEaXNwbGF5TW9kZSB7XG5cdENvbGxhcHNlZCA9ICdjb2xsYXBzZWQnLFxuXHRDb2xsYXBzZWRQcmV2aWV3ID0gJ2NvbGxhcHNlZFByZXZpZXcnLFxuXHRGaXhlZFNjcm9sbGluZyA9ICdmaXhlZFNjcm9sbGluZycsXG59XG5cbmV4cG9ydCBlbnVtIENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUge1xuXHRPZmYgPSAnb2ZmJyxcblx0V2l0aFRoaW5raW5nID0gJ3dpdGhUaGlua2luZycsXG5cdEFsd2F5cyA9ICdhbHdheXMnLFxufVxuXG5leHBvcnQgZW51bSBDaGF0Tm90aWZpY2F0aW9uTW9kZSB7XG5cdE9mZiA9ICdvZmYnLFxuXHRXaW5kb3dOb3RGb2N1c2VkID0gJ3dpbmRvd05vdEZvY3VzZWQnLFxuXHRBbHdheXMgPSAnYWx3YXlzJyxcbn1cblxuZXhwb3J0IHR5cGUgUmF3Q2hhdFBhcnRpY2lwYW50TG9jYXRpb24gPSAncGFuZWwnIHwgJ3Rlcm1pbmFsJyB8ICdub3RlYm9vaycgfCAnZWRpdGluZy1zZXNzaW9uJztcblxuZXhwb3J0IGVudW0gQ2hhdEFnZW50TG9jYXRpb24ge1xuXHQvKipcblx0ICogVGhpcyBpcyBjaGF0LCB3aGV0aGVyIGl0J3MgaW4gdGhlIHNpZGViYXIsIGEgY2hhdCBlZGl0b3IsIG9yIHF1aWNrIGNoYXQuXG5cdCAqIExlYXZpbmcgdGhlIHZhbHVlcyBhbG9uZSBhcyB0aGV5IGFyZSBpbiBzdG9yZWQgZGF0YSBzbyB3ZSBkb24ndCBoYXZlIHRvIG5vcm1hbGl6ZSB0aGVtLlxuXHQgKi9cblx0Q2hhdCA9ICdwYW5lbCcsXG5cdFRlcm1pbmFsID0gJ3Rlcm1pbmFsJyxcblx0Tm90ZWJvb2sgPSAnbm90ZWJvb2snLFxuXHQvKipcblx0ICogRWRpdG9ySW5saW5lIG1lYW5zIGlubGluZSBjaGF0IGluIGEgdGV4dCBlZGl0b3IuXG5cdCAqL1xuXHRFZGl0b3JJbmxpbmUgPSAnZWRpdG9yJyxcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0QWdlbnRMb2NhdGlvbiB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tUmF3KHZhbHVlOiBSYXdDaGF0UGFydGljaXBhbnRMb2NhdGlvbiB8IHN0cmluZyk6IENoYXRBZ2VudExvY2F0aW9uIHtcblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlICdwYW5lbCc6IHJldHVybiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0O1xuXHRcdFx0Y2FzZSAndGVybWluYWwnOiByZXR1cm4gQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWw7XG5cdFx0XHRjYXNlICdub3RlYm9vayc6IHJldHVybiBDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vaztcblx0XHRcdGNhc2UgJ2VkaXRvcic6IHJldHVybiBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmU7XG5cdFx0fVxuXHRcdHJldHVybiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0O1xuXHR9XG59XG5cbi8qKlxuICogTGlzdCBvZiBmaWxlIHNjaGVtZXMgdGhhdCBhcmUgYWx3YXlzIHVuc3VwcG9ydGVkIGZvciB1c2UgaW4gY2hhdFxuICovXG5jb25zdCBjaGF0QWx3YXlzVW5zdXBwb3J0ZWRGaWxlU2NoZW1lcyA9IG5ldyBTZXQoW1xuXHRTY2hlbWFzLnZzY29kZUNoYXRFZGl0b3IsXG5cdFNjaGVtYXMud2Fsa1Rocm91Z2gsXG5cdFNjaGVtYXMudnNjb2RlTG9jYWxDaGF0U2Vzc2lvbixcblx0U2NoZW1hcy52c2NvZGVTZXR0aW5ncyxcblx0U2NoZW1hcy53ZWJ2aWV3UGFuZWwsXG5cdFNjaGVtYXMudnNjb2RlVXNlckRhdGEsXG5cdFNjaGVtYXMuZXh0ZW5zaW9uLFxuXHQnY2NyZXEnLFxuXHQnb3BlbmFpLWNvZGV4JywgLy8gQ29kZXggc2Vzc2lvbiBjdXN0b20gZWRpdG9yIHNjaGVtZVxuXSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N1cHBvcnRlZENoYXRGaWxlU2NoZW1lKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzY2hlbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cblx0Ly8gRXhjbHVkZSBzY2hlbWVzIHdlIGFsd2F5cyBrbm93IGFyZSBiYWRcblx0aWYgKGNoYXRBbHdheXNVbnN1cHBvcnRlZEZpbGVTY2hlbWVzLmhhcyhzY2hlbWUpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gUGx1cyBhbnkgc2NoZW1lcyB1c2VkIGJ5IGNvbnRlbnQgcHJvdmlkZXJzXG5cdGlmIChjaGF0U2VydmljZS5nZXRDb250ZW50UHJvdmlkZXJTY2hlbWVzKCkuaW5jbHVkZXMoc2NoZW1lKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIEV2ZXJ5dGhpbmcgZWxzZSBpcyBzdXBwb3J0ZWRcblx0cmV0dXJuIHRydWU7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZWZmZWN0aXZlIGRlZmF1bHQgc2Vzc2lvbiB0eXBlIGZvciBhIG5ldyBjaGF0IGluIHRoZSBWUyBDb2RlXG4gKiBlZGl0b3Igd2luZG93LlxuICpcbiAqIFZpcnR1YWwgd29ya3NwYWNlcyBhbHdheXMgZGVmYXVsdCB0byB7QGxpbmsgbG9jYWxDaGF0U2Vzc2lvblR5cGV9LiBPdGhlcndpc2UsXG4gKiB3aGVuIHRoZSBhZ2VudCBob3N0IGlzIGVuYWJsZWQgYW5kIGBjaGF0LmRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzYCBpcyBvcHRlZCBpbixcbiAqIEFnZW50IEhvc3QgQ29waWxvdCBDTEkgaXMgdGhlIGRlZmF1bHQuIEl0IGZhbGxzIGJhY2sgdG8gdGhlIGxvY2FsIGhhcm5lc3NcbiAqIHdoZW4gZW5hYmxlZCwgb3IgdG8gdGhlIGZpcnN0IHZpc2libGUgbm9uLWxvY2FsIHByb3ZpZGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZSxcblx0YWdlbnRIb3N0RW5hYmxlZDogYm9vbGVhblxuKTogc3RyaW5nIHtcblx0aWYgKGlzVmlydHVhbFdvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0cmV0dXJuIGxvY2FsQ2hhdFNlc3Npb25UeXBlO1xuXHR9XG5cblx0aWYgKGFnZW50SG9zdEVuYWJsZWQgJiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFRvQ29waWxvdEhhcm5lc3MpKSB7XG5cdFx0cmV0dXJuIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3Q7XG5cdH1cblxuXHRpZiAoaXNFZGl0b3JMb2NhbEFnZW50RW5hYmxlZChjb25maWd1cmF0aW9uU2VydmljZSwgd29ya3NwYWNlKSkge1xuXHRcdHJldHVybiBsb2NhbENoYXRTZXNzaW9uVHlwZTtcblx0fVxuXG5cdHJldHVybiBnZXRWaXNpYmxlTm9uTG9jYWxFZGl0b3JDaGF0U2Vzc2lvblR5cGVzKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UpWzBdID8/IGxvY2FsQ2hhdFNlc3Npb25UeXBlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblJlc291cmNlKFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBQaWNrPElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCAnZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24nIHwgJ2dldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucyc+LFxuXHR3b3Jrc3BhY2U6IElXb3Jrc3BhY2UsXG5cdGFnZW50SG9zdEVuYWJsZWQ6IGJvb2xlYW5cbik6IFVSSSB7XG5cdGNvbnN0IGRlZmF1bHRUeXBlID0gZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSwgYWdlbnRIb3N0RW5hYmxlZCk7XG5cdHJldHVybiBkZWZhdWx0VHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGVcblx0XHQ/IExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpXG5cdFx0OiBVUkkuZnJvbSh7IHNjaGVtZTogZGVmYXVsdFR5cGUsIHBhdGg6IGAvdW50aXRsZWQtJHtnZW5lcmF0ZVV1aWQoKX1gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNOZXdDaGF0U2Vzc2lvblR5cGVVc2FibGUoXG5cdHNlc3Npb25UeXBlOiBzdHJpbmcsXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZVxuKTogYm9vbGVhbiB7XG5cdGlmIChzZXNzaW9uVHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRyZXR1cm4gaXNFZGl0b3JMb2NhbEFnZW50RW5hYmxlZChjb25maWd1cmF0aW9uU2VydmljZSwgd29ya3NwYWNlKTtcblx0fVxuXHRpZiAoaXNBZ2VudEhvc3RUYXJnZXQoc2Vzc2lvblR5cGUpKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGVPcHRpb25zIHtcblx0cmVhZG9ubHkgZXhwbGljaXRPdmVycmlkZT86IHN0cmluZztcblx0cmVhZG9ubHkgY3VycmVudFNlc3Npb25UeXBlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZE5ld0NoYXRTZXNzaW9uVHlwZSB7XG5cdC8qKiBUaGUgc2Vzc2lvbiB0eXBlIHRvIG9wZW4gZm9yIHRoZSBuZXcgY2hhdC4gKi9cblx0cmVhZG9ubHkgc2Vzc2lvblR5cGU6IHN0cmluZztcblx0LyoqXG5cdCAqIFRydWUgd2hlbiB7QGxpbmsgc2Vzc2lvblR5cGV9IGlzIHRoZSBvbmUtdGltZSBgY2hhdC5lZGl0b3IucHJlZmVyQ29waWxvdEhhcm5lc3NgXG5cdCAqIHN3YXAuIFRoZSBjYWxsZXIgbXVzdCBwZXJzaXN0IHRoZSBtYXJrZXIgKHZpYSBgbWFya1ByZWZlcnJlZENvcGlsb3RIYXJuZXNzYClcblx0ICogb25seSBvbmNlIGl0IGhhcyBhY3R1YWxseSBhcHBsaWVkIHRoaXMgc2Vzc2lvbiB0eXBlLCBzbyB0aGUgbWlncmF0aW9uIGlzIG5vdFxuXHQgKiBjb25zdW1lZCBieSBhIGNhbGxlciB0aGF0IGRpc2NhcmRzIHRoZSByZXN1bHQuXG5cdCAqL1xuXHRyZWFkb25seSBpc1ByZWZlckNvcGlsb3RIYXJuZXNzU3dhcDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblR5cGUoXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZSxcblx0YWdlbnRIb3N0RW5hYmxlZDogYm9vbGVhbixcblx0b3B0aW9ucz86IElEZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlT3B0aW9uc1xuKTogc3RyaW5nIHtcblx0aWYgKG9wdGlvbnM/LmV4cGxpY2l0T3ZlcnJpZGUpIHtcblx0XHRyZXR1cm4gb3B0aW9ucy5leHBsaWNpdE92ZXJyaWRlO1xuXHR9XG5cblx0aWYgKGlzVmlydHVhbFdvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0cmV0dXJuIGxvY2FsQ2hhdFNlc3Npb25UeXBlO1xuXHR9XG5cblx0Y29uc3QgcmVtZW1iZXJlZCA9IGdldFVzYWJsZVJlbWVtYmVyZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSk7XG5cdGlmIChyZW1lbWJlcmVkKSB7XG5cdFx0cmV0dXJuIHJlbWVtYmVyZWQ7XG5cdH1cblxuXHRpZiAob3B0aW9ucz8uY3VycmVudFNlc3Npb25UeXBlICYmIGlzTmV3Q2hhdFNlc3Npb25UeXBlVXNhYmxlKG9wdGlvbnMuY3VycmVudFNlc3Npb25UeXBlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlKSkge1xuXHRcdHJldHVybiBvcHRpb25zLmN1cnJlbnRTZXNzaW9uVHlwZTtcblx0fVxuXG5cdHJldHVybiBnZXRDb21wdXRlZERlZmF1bHRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlLCBhZ2VudEhvc3RFbmFibGVkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVEZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0b3B0aW9ucz86IElEZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlT3B0aW9uc1xuKTogSVJlc29sdmVkTmV3Q2hhdFNlc3Npb25UeXBlIHtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgY2hhdFNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdGNvbnN0IHdvcmtzcGFjZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpLmdldFdvcmtzcGFjZSgpO1xuXHRjb25zdCBhZ2VudEhvc3RFbmFibGVkID0gYWNjZXNzb3IuZ2V0KElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSkuZW5hYmxlZC5nZXQoKTtcblxuXHRpZiAob3B0aW9ucz8uZXhwbGljaXRPdmVycmlkZSkge1xuXHRcdHJldHVybiB7IHNlc3Npb25UeXBlOiBvcHRpb25zLmV4cGxpY2l0T3ZlcnJpZGUsIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiBmYWxzZSB9O1xuXHR9XG5cblx0aWYgKGlzVmlydHVhbFdvcmtzcGFjZSh3b3Jrc3BhY2UpKSB7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBpc1ByZWZlckNvcGlsb3RIYXJuZXNzU3dhcDogZmFsc2UgfTtcblx0fVxuXG5cdGNvbnN0IHJlbWVtYmVyZWQgPSBnZXRVc2FibGVSZW1lbWJlcmVkU2Vzc2lvblR5cGUoc3RvcmFnZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UpO1xuXHRpZiAocmVtZW1iZXJlZCAmJiByZW1lbWJlcmVkICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdHJldHVybiB7IHNlc3Npb25UeXBlOiByZW1lbWJlcmVkLCBpc1ByZWZlckNvcGlsb3RIYXJuZXNzU3dhcDogZmFsc2UgfTtcblx0fVxuXG5cdC8vIE9uZS10aW1lIG1pZ3JhdGlvbjogd2hlbiB0aGUgYWdlbnQgaG9zdCBpcyBlbmFibGVkIGFuZCB0aGUgdXNlciBoYXMgb3B0ZWRcblx0Ly8gaW4gdmlhIGBjaGF0LmVkaXRvci5wcmVmZXJDb3BpbG90SGFybmVzc2AsIHN3YXAgYW4gZXhpc3RpbmcgbG9jYWwgZWRpdG9yXG5cdC8vIHNlc3Npb24gdG8gQ29waWxvdCBleGFjdGx5IG9uY2UgKGd1YXJkZWQgYnkgdGhlIHBlcnNpc3RlZCBtYXJrZXIpLiBOZXZlclxuXHQvLyBzd2FwIHdoZW4gdGhlIGFnZW50IGhvc3QgaXMgZGlzYWJsZWQsIHNpbmNlIHRoZSBDb3BpbG90IGhhcm5lc3Mgd291bGQgYmVcblx0Ly8gdW5hdmFpbGFibGUuIFRoaXMgZnVuY3Rpb24gZG9lcyBub3QgcGVyc2lzdCB0aGUgbWFya2VyIGl0c2VsZjsgdGhlIGNhbGxlclxuXHQvLyBtYXJrcyBpdCBvbmx5IGFmdGVyIGFwcGx5aW5nIHRoZSBzd2FwLCBzbyBhIGNhbGxlciB0aGF0IGRpc2NhcmRzIHRoZVxuXHQvLyByZXN1bHQgZG9lcyBub3QgY29uc3VtZSB0aGUgb25lLXRpbWUgbWlncmF0aW9uLlxuXHRpZiAob3B0aW9ucz8uY3VycmVudFNlc3Npb25UeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZVxuXHRcdCYmIGFnZW50SG9zdEVuYWJsZWRcblx0XHQmJiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JQcmVmZXJDb3BpbG90SGFybmVzcylcblx0XHQmJiAhaGFzUHJlZmVycmVkQ29waWxvdEhhcm5lc3Moc3RvcmFnZVNlcnZpY2UpKSB7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QsIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiB0cnVlIH07XG5cdH1cblxuXHRyZXR1cm4geyBzZXNzaW9uVHlwZTogZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZSwgYWdlbnRIb3N0RW5hYmxlZCwgb3B0aW9ucyksIGlzUHJlZmVyQ29waWxvdEhhcm5lc3NTd2FwOiBmYWxzZSB9O1xufVxuXG5mdW5jdGlvbiBnZXRVc2FibGVSZW1lbWJlcmVkU2Vzc2lvblR5cGUoXG5cdHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZVxuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVtZW1iZXJlZCA9IGdldFJlbWVtYmVyZWRTZXNzaW9uVHlwZShzdG9yYWdlU2VydmljZSk7XG5cdHJldHVybiByZW1lbWJlcmVkICYmIGlzTmV3Q2hhdFNlc3Npb25UeXBlVXNhYmxlKHJlbWVtYmVyZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjaGF0U2Vzc2lvbnNTZXJ2aWNlLCB3b3Jrc3BhY2UpID8gcmVtZW1iZXJlZCA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlKFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBQaWNrPElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCAnZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24nIHwgJ2dldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucyc+LFxuXHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHR3b3Jrc3BhY2U6IElXb3Jrc3BhY2UsXG5cdGFnZW50SG9zdEVuYWJsZWQ6IGJvb2xlYW4sXG5cdG9wdGlvbnM/OiBJRGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZU9wdGlvbnNcbik6IFVSSSB7XG5cdGNvbnN0IGRlZmF1bHRUeXBlID0gZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uVHlwZShjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHdvcmtzcGFjZSwgYWdlbnRIb3N0RW5hYmxlZCwgb3B0aW9ucyk7XG5cdHJldHVybiBkZWZhdWx0VHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGVcblx0XHQ/IExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpXG5cdFx0OiBVUkkuZnJvbSh7IHNjaGVtZTogZGVmYXVsdFR5cGUsIHBhdGg6IGAvdW50aXRsZWQtJHtnZW5lcmF0ZVV1aWQoKX1gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUoXG5cdHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdGNoYXRTZXNzaW9uc1NlcnZpY2U6IFBpY2s8SUNoYXRTZXNzaW9uc1NlcnZpY2UsICdnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbicgfCAnZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zJz4sXG5cdHdvcmtzcGFjZTogSVdvcmtzcGFjZSxcblx0c2Vzc2lvblR5cGU6IHN0cmluZyxcblx0YWdlbnRIb3N0RW5hYmxlZDogYm9vbGVhblxuKTogdm9pZCB7XG5cdGlmIChzZXNzaW9uVHlwZSA9PT0gZ2V0Q29tcHV0ZWREZWZhdWx0U2Vzc2lvblR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSwgYWdlbnRIb3N0RW5hYmxlZCkpIHtcblx0XHRjbGVhclVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlKTtcblx0fSBlbHNlIHtcblx0XHRzdG9yZVVzZXJTZWxlY3RlZFNlc3Npb25UeXBlKHN0b3JhZ2VTZXJ2aWNlLCBzZXNzaW9uVHlwZSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgd29ya3NwYWNlOiBJV29ya3NwYWNlKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc1ZpcnR1YWxXb3Jrc3BhY2Uod29ya3NwYWNlKSB8fCAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQpID8/IHRydWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKFxuXHRzZXNzaW9uVHlwZTogc3RyaW5nLFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBQaWNrPElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCAnZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24nIHwgJ2dldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucyc+LFxuXHR3b3Jrc3BhY2U6IElXb3Jrc3BhY2Vcbik6IGJvb2xlYW4ge1xuXHRpZiAoc2Vzc2lvblR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0cmV0dXJuIGlzRWRpdG9yTG9jYWxBZ2VudEVuYWJsZWQoY29uZmlndXJhdGlvblNlcnZpY2UsIHdvcmtzcGFjZSkgfHwgZ2V0VmlzaWJsZU5vbkxvY2FsRWRpdG9yQ2hhdFNlc3Npb25UeXBlcyhjb25maWd1cmF0aW9uU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSwgd29ya3NwYWNlKS5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRpZiAoc2Vzc2lvblR5cGUgPT09IFNlc3Npb25UeXBlLkNvcGlsb3RDTEkgJiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQ29waWxvdENsaUhpZGVFeHRlbnNpb25Ib3N0RWRpdG9yKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiAhIWNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oc2Vzc2lvblR5cGUpO1xufVxuXG5mdW5jdGlvbiBnZXRWaXNpYmxlTm9uTG9jYWxFZGl0b3JDaGF0U2Vzc2lvblR5cGVzKFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBQaWNrPElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCAnZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24nIHwgJ2dldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucyc+LFxuXHR3b3Jrc3BhY2U6IElXb3Jrc3BhY2Vcbik6IHN0cmluZ1tdIHtcblx0Y29uc3Qgc2Vzc2lvblR5cGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zKCkpIHtcblx0XHRpZiAoY29udHJpYnV0aW9uLnR5cGUgIT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlICYmIGlzVmlzaWJsZUVkaXRvckNoYXRTZXNzaW9uVHlwZShjb250cmlidXRpb24udHlwZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNoYXRTZXNzaW9uc1NlcnZpY2UsIHdvcmtzcGFjZSkpIHtcblx0XHRcdHNlc3Npb25UeXBlcy5hZGQoY29udHJpYnV0aW9uLnR5cGUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gQXJyYXkuZnJvbShzZXNzaW9uVHlwZXMpO1xufVxuXG5leHBvcnQgY29uc3QgTUFOQUdFX0NIQVRfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlJztcbmV4cG9ydCBjb25zdCBDSEFUX09QRU5fQUdFTlRfSE9TVF9DSEFUX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5BZ2VudEhvc3RDaGF0JztcblxuZXhwb3J0IGNvbnN0IE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5Xb3Jrc3BhY2VJbkFnZW50c1dpbmRvdyc7XG5leHBvcnQgY29uc3QgT1BFTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5vcGVuQWdlbnRzV2luZG93JztcbmV4cG9ydCBjb25zdCBPUEVOX0FHRU5UU19XSU5ET1dfUFJFQ09ORElUSU9OID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRDb250ZXh0S2V5RXhwci5oYXMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZH1gKSxcblx0SXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpXG4pO1xuXG5leHBvcnQgY29uc3QgQ2hhdEVkaXRvclRpdGxlTWF4TGVuZ3RoID0gMzA7XG5cbmV4cG9ydCBjb25zdCBDSEFUX1RFUk1JTkFMX09VVFBVVF9NQVhfUFJFVklFV19MSU5FUyA9IDEwMDA7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9NT0RFTFNfRURJVE9SID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2luTW9kZWxzRWRpdG9yJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfTU9ERUxTX1NFQVJDSF9GT0NVUyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpbk1vZGVsc1NlYXJjaCcsIGZhbHNlKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQixtQkFBbUIsc0JBQXNCLG1CQUFtQjtBQUMzRixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFxQixnQ0FBZ0M7QUFDckQsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxnQkFBZ0IscUJBQXFCO0FBQzlDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMEJBQTBCLCtCQUErQjtBQUNsRSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw4QkFBOEIsMEJBQTBCLDRCQUE0QixvQ0FBb0M7QUFDakksU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUywrQkFBK0I7QUFFakMsSUFBVywwQkFBWCxrQkFBV0EsNkJBQVg7QUFDTixFQUFBQSx5QkFBQSxVQUFPO0FBQ1AsRUFBQUEseUJBQUEsZUFBWTtBQUNaLEVBQUFBLHlCQUFBLGFBQVU7QUFITyxTQUFBQTtBQUFBLEdBQUE7QUFNWCxJQUFLLG9CQUFMLGtCQUFLQyx1QkFBTDtBQUNOLEVBQUFBLG1CQUFBLG9CQUFpQjtBQUNqQixFQUFBQSxtQkFBQSxxQkFBa0I7QUFDbEIsRUFBQUEsbUJBQUEsd0JBQXFCO0FBQ3JCLEVBQUFBLG1CQUFBLHVCQUFvQjtBQUNwQixFQUFBQSxtQkFBQSx3QkFBcUI7QUFDckIsRUFBQUEsbUJBQUEsb0JBQWlCO0FBQ2pCLEVBQUFBLG1CQUFBLGtCQUFlO0FBQ2YsRUFBQUEsbUJBQUEsMkJBQXdCO0FBQ3hCLEVBQUFB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QyxzQkFBc0IscUJBQXFCLFNBQVMsRUFBRSxXQUFXO0FBQUEsRUFDaEw7QUFFQSxNQUFJLGdCQUFnQixZQUFZLGNBQWMscUJBQXFCLFNBQWtCLGtGQUFtRCxHQUFHO0FBQzFJLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxDQUFDLENBQUMsb0JBQW9CLDJCQUEyQixXQUFXO0FBQ3BFO0FBRUEsU0FBUyx5Q0FDUixzQkFDQSxxQkFDQSxXQUNXO0FBQ1gsUUFBTSxlQUFlLG9CQUFJLElBQVk7QUFDckMsYUFBVyxnQkFBZ0Isb0JBQW9CLCtCQUErQixHQUFHO0FBQ2hGLFFBQUksYUFBYSxTQUFTLHdCQUF3QiwrQkFBK0IsYUFBYSxNQUFNLHNCQUFzQixxQkFBcUIsU0FBUyxHQUFHO0FBQzFKLG1CQUFhLElBQUksYUFBYSxJQUFJO0FBQUEsSUFDbkM7QUFBQSxFQUNEO0FBQ0EsU0FBTyxNQUFNLEtBQUssWUFBWTtBQUMvQjtBQUVPLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0sdUNBQXVDO0FBRTdDLE1BQU0sNkNBQTZDO0FBQ25ELE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sa0NBQWtDLGVBQWU7QUFBQSxFQUM3RCwyQkFBMkIsTUFBTSxPQUFPLE9BQU87QUFBQSxFQUMvQywyQkFBMkIsTUFBTSxvQkFBb0IsT0FBTztBQUFBLEVBQzVELHdCQUF3QixPQUFPO0FBQUEsRUFDL0IsZUFBZSxJQUFJLFVBQVUsdUNBQThCLEVBQUU7QUFBQSxFQUM3RCx5QkFBeUIsT0FBTztBQUNqQztBQUVPLE1BQU0sMkJBQTJCO0FBRWpDLE1BQU0seUNBQXlDO0FBQy9DLE1BQU0sd0JBQXdCLElBQUksY0FBdUIsa0JBQWtCLEtBQUs7QUFDaEYsTUFBTSw4QkFBOEIsSUFBSSxjQUF1QixrQkFBa0IsS0FBSzsiLAogICJuYW1lcyI6IFsiQllPS1V0aWxpdHlNb2RlbERlZmF1bHQiLCAiQ2hhdENvbmZpZ3VyYXRpb24iLCAiQ2hhdE1vZGVLaW5kIiwgIkNoYXRQZXJtaXNzaW9uTGV2ZWwiLCAiQ2hhdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwiLCAiVGhpbmtpbmdEaXNwbGF5TW9kZSIsICJDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlIiwgIkNoYXROb3RpZmljYXRpb25Nb2RlIiwgIkNoYXRBZ2VudExvY2F0aW9uIl0KfQo=
