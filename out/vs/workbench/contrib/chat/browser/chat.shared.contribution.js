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
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { autorun, observableFromEvent } from "../../../../base/common/observable.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
import "../../../../platform/agentHost/common/agentHostEnablementService.js";
import "../../../../platform/agentHost/browser/agentHostEnablementService.js";
import "../../../../platform/agentHost/common/agentHostStarter.config.contribution.js";
import { AgentHostAhpJsonlLoggingSettingId, AgentHostSdkSandboxEnabledSettingId, ClaudePreferAgentHostAgentsSettingId, ClaudePreferAgentHostEditorSettingId, CodexPreferAgentHostEditorSettingId } from "../../../../platform/agentHost/common/agentService.js";
import { AgentHostCopilotSdkLogLevelSettingId, AgentHostCustomTerminalToolEnabledSettingId, AgentHostModelCapabilityOverridesSettingId, AgentHostOpus48PromptEnabledSettingId, AgentHostReasoningEffortOverrideSettingId, AgentHostToolSearchDeferThresholdSettingId, AgentHostToolSearchEnabledSettingId, copilotSdkLogLevelSettingValues } from "../../../../platform/agentHost/common/copilotCliConfig.js";
import { DEFAULT_LOCAL_TRANSCRIPTION_MODEL } from "../../../../platform/localTranscription/common/localTranscription.js";
import { AgentNetworkFilterService, IAgentNetworkFilterService } from "../../../../platform/networkFilter/common/networkFilterService.js";
import { AgentNetworkDomainSettingId } from "../../../../platform/networkFilter/common/settings.js";
import { COPILOT_ALLOWED_MCP_SERVERS_KEY, COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY, COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG, COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY, COPILOT_DENIED_MCP_SERVERS_KEY, COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY, COPILOT_ENABLED_PLUGINS_KEY, COPILOT_EXTRA_MARKETPLACES_KEY, COPILOT_MODEL_KEY, COPILOT_STRICT_MARKETPLACES_KEY, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY, managedModelValue, managedSettingValue } from "../../../../platform/policy/common/copilotManagedSettings.js";
import { AgentSandboxEnabledValue, AgentSandboxSettingId } from "../../../../platform/sandbox/common/settings.js";
import { ChatSessionArchiveActionWordingSettingId } from "../../../../platform/chat/common/sessionArchiveActions.js";
import { registerEditorFeature } from "../../../../editor/common/editorFeatures.js";
import * as nls from "../../../../nls.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { McpAccessValue, McpAutoStartValue, mcpAccessConfig, mcpAllowedServersConfig, mcpAutoStartConfig, mcpDeniedServersConfig, mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig, mcpAppsEnabledConfig } from "../../../../platform/mcp/common/mcpManagement.js";
import product from "../../../../platform/product/common/product.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { Extensions } from "../../../common/configuration.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import { ChatEntitlement, IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { IEditorResolverService, RegisteredEditorPriority } from "../../../services/editor/common/editorResolverService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AddConfigurationType, AssistedTypes } from "../../mcp/browser/mcpCommandsAddConfiguration.js";
import { allDiscoverySources, discoverySourceSettingsLabel, McpCollisionBehavior, mcpDiscoverySection, mcpEnterpriseManagedAuthIdpSection, mcpServerCollisionBehaviorSection, mcpServerSamplingSection } from "../../mcp/common/mcpConfiguration.js";
import { ChatAgentNameService, ChatAgentService, IChatAgentNameService, IChatAgentService } from "../common/participants/chatAgents.js";
import { CodeMapperService, ICodeMapperService } from "../common/editing/chatCodeMapperService.js";
import "../common/widget/chatColors.js";
import { IChatEditingService } from "../common/editing/chatEditingService.js";
import { IChatLayoutService } from "../common/widget/chatLayoutService.js";
import { ChatModeService, IChatModeService } from "../common/chatModes.js";
import { ChatResponseResourceFileSystemProvider, ChatResponseResourceWorkbenchContribution, IChatResponseResourceFileSystemProvider } from "../common/widget/chatResponseResourceFileSystemProvider.js";
import { IChatService } from "../common/chatService/chatService.js";
import { ChatSideChatService, IChatSideChatService } from "../common/chatSideChatService.js";
import { ChatService } from "../common/chatService/chatServiceImpl.js";
import { IChatSessionsService } from "../common/chatSessionsService.js";
import { ChatSlashCommandService, IChatSlashCommandService } from "../common/participants/chatSlashCommands.js";
import { ChatArtifactsService, IChatArtifactsService } from "../common/tools/chatArtifactsService.js";
import { ChatTodoListService, IChatTodoListService } from "../common/tools/chatTodoListService.js";
import { ChatTransferService, IChatTransferService } from "../common/model/chatTransferService.js";
import { IChatVariablesService } from "../common/attachments/chatVariables.js";
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from "../common/widget/chatWidgetHistoryService.js";
import { BYOKUtilityModelDefault, ChatAIDisabledSettingId, ChatAgentLocation, ChatConfiguration, ChatDefaultPermissionLevel, ChatNotificationMode, ChatPermissionLevel } from "../common/constants.js";
import { ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService } from "../common/ignoredFiles.js";
import { ILanguageModelsService, LanguageModelsService } from "../common/languageModels.js";
import { ILanguageModelStatsService, LanguageModelStatsService } from "../common/languageModelStats.js";
import { ILanguageModelToolsConfirmationService } from "../common/tools/languageModelToolsConfirmationService.js";
import { ILanguageModelToolsService } from "../common/tools/languageModelToolsService.js";
import { ChatToolRiskAssessmentService, IChatToolRiskAssessmentService } from "./tools/chatToolRiskAssessmentService.js";
import { ChatGoalSummaryService, IChatGoalSummaryService } from "./chatGoalSummaryService.js";
import { ChatResponseFileChangesService, IChatResponseFileChangesService } from "./chatResponseFileChangesService.js";
import { ChatSubmitRequestHandlerService, IChatSubmitRequestHandlerService } from "./chatSubmitRequestHandlerService.js";
import { AgentPluginDiscoveryPriority, agentPluginDiscoveryRegistry, IAgentPluginService } from "../common/plugins/agentPluginService.js";
import { ChatPromptFilesExtensionPointHandler } from "../common/promptSyntax/chatPromptFilesContribution.js";
import { isTildePath, PromptsConfig } from "../common/promptSyntax/config/config.js";
import { INSTRUCTIONS_DEFAULT_SOURCE_FOLDER, INSTRUCTION_FILE_EXTENSION, LEGACY_MODE_DEFAULT_SOURCE_FOLDER, LEGACY_MODE_FILE_EXTENSION, PROMPT_DEFAULT_SOURCE_FOLDER, PROMPT_FILE_EXTENSION, DEFAULT_SKILL_SOURCE_FOLDERS, AGENTS_SOURCE_FOLDER, AGENT_FILE_EXTENSION, SKILL_FILENAME, CLAUDE_AGENTS_SOURCE_FOLDER, DEFAULT_HOOK_FILE_PATHS, DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS, COPILOT_USER_AGENTS_SOURCE_FOLDER } from "../common/promptSyntax/config/promptFileLocations.js";
import { PromptLanguageFeaturesProvider } from "./promptSyntax/promptFileContributions.js";
import { AGENT_DOCUMENTATION_URL, INSTRUCTIONS_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL, SKILL_DOCUMENTATION_URL, HOOK_DOCUMENTATION_URL, PromptsType, PromptFileSource, AgentHostAgentDebugLogEnabledSettingId, AgentHostAgentDebugLogMaxEventsSettingId } from "../common/promptSyntax/promptTypes.js";
import { hookFileSchema, HOOK_SCHEMA_URI } from "../common/promptSyntax/hookSchema.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { IPromptsService } from "../common/promptSyntax/service/promptsService.js";
import { PromptsService } from "../common/promptSyntax/service/promptsServiceImpl.js";
import { LanguageModelToolsExtensionPointHandler } from "../common/tools/languageModelToolsContribution.js";
import { ClientToolSetsContribution } from "./tools/clientToolSetsContribution.js";
import "./telemetry/chatModelCountTelemetry.js";
import { BuiltinToolsContribution } from "../common/tools/builtinTools/tools.js";
import { RenameToolContribution } from "./tools/renameTool.js";
import { UsagesToolContribution } from "./tools/usagesTool.js";
import { IVoiceChatService, VoiceChatService } from "../common/voiceChatService.js";
import "./voiceClient/voiceClientService.js";
import "./voiceClient/micCaptureService.js";
import "./voiceClient/ttsPlaybackService.js";
import "./voiceClient/voiceToolDispatchService.js";
import "./voiceClient/voiceSessionController.js";
import { registerChatAccessibilityActions } from "./actions/chatAccessibilityActions.js";
import { AgentChatAccessibilityHelp, EditsChatAccessibilityHelp, PanelChatAccessibilityHelp, QuickChatAccessibilityHelp } from "./actions/chatAccessibilityHelp.js";
import { ModeOpenChatGlobalAction, registerChatActions } from "./actions/chatActions.js";
import { CodeBlockActionRendering, registerChatCodeBlockActions, registerChatCodeCompareBlockActions } from "./actions/chatCodeblockActions.js";
import { ChatContextContributions } from "./actions/chatContext.js";
import { registerChatContextActions } from "./actions/chatContextActions.js";
import { ChatCopyActionRendering, registerChatCopyActions } from "./actions/chatCopyActions.js";
import { registerChatDeveloperActions } from "./actions/chatDeveloperActions.js";
import { registerChatExecuteActions } from "./actions/chatExecuteActions.js";
import { ChatVoiceInputModeAction, ChatVoiceInputModeToggleListenAction, registerVoiceInputModeSimulateActions } from "./voiceInputMode/voiceInputModeActionViewItem.js";
import "./voiceInputMode/voiceInputMode.js";
import { registerChatSpeechToTextActions } from "./actions/chatSpeechToTextActions.js";
import { CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID, registerConfigureSpeechInstructionsActions } from "./actions/configureVoiceInstructionsAction.js";
import { ChatSpeechToTextService, DictationSettingId, IChatSpeechToTextService } from "./speechToText/chatSpeechToTextService.js";
import { registerChatFileTreeActions } from "./actions/chatFileTreeActions.js";
import { ChatGettingStartedContribution } from "./actions/chatGettingStarted.js";
import { registerChatExportActions } from "./actions/chatImportExport.js";
import { registerLanguageModelActions } from "./actions/chatLanguageModelActions.js";
import { registerChatPluginActions } from "./actions/chatPluginActions.js";
import { registerMoveActions } from "./actions/chatMoveActions.js";
import { registerNewChatActions } from "./actions/chatNewActions.js";
import { registerChatPromptNavigationActions } from "./actions/chatPromptNavigationActions.js";
import { registerChatQueueActions } from "./actions/chatQueueActions.js";
import { registerQuickChatActions } from "./actions/chatQuickInputActions.js";
import { ChatAgentRecommendation } from "./actions/chatAgentRecommendationActions.js";
import { registerChatTitleActions } from "./actions/chatTitleActions.js";
import { registerChatElicitationActions } from "./actions/chatElicitationActions.js";
import { registerChatToolActions } from "./actions/chatToolActions.js";
import { ChatTransferContribution } from "./actions/chatTransfer.js";
import { registerChatOpenAgentDebugPanelAction } from "./actions/chatOpenAgentDebugPanelAction.js";
import { IChatDebugService } from "../common/chatDebugService.js";
import { ChatDebugServiceImpl } from "../common/chatDebugServiceImpl.js";
import { ChatDebugEditor } from "./chatDebug/chatDebugEditor.js";
import { PromptsDebugContribution } from "./promptsDebugContribution.js";
import { AgentHostChatDebugContribution } from "./chatDebug/agentHostChatDebugProvider.js";
import { ChatDebugEditorInput, ChatDebugEditorInputSerializer } from "./chatDebug/chatDebugEditorInput.js";
import "./agentSessions/agentSessions.contribution.js";
import { ChatContextKeys } from "../common/actions/chatContextKeys.js";
import { ChatViewId, IChatAccessibilityService, IChatCodeBlockContextProviderService, IChatWidgetService, IQuickChatService, isIChatResourceViewContext, isIChatViewViewContext } from "./chat.js";
import { ChatAccessibilityService } from "./accessibility/chatAccessibilityService.js";
import "./attachments/chatAttachmentModel.js";
import "./widget/input/chatInputNotificationService.js";
import { ChatAttachmentResolveService, IChatAttachmentResolveService } from "./attachments/chatAttachmentResolveService.js";
import { ChatAttachmentWidgetRegistry, IChatAttachmentWidgetRegistry } from "./attachments/chatAttachmentWidgetRegistry.js";
import { ChatReferenceAttachmentWidgetContribution } from "./attachments/chatReferenceAttachmentWidget.contribution.js";
import { ChatMarkdownAnchorService, IChatMarkdownAnchorService } from "./widget/chatContentParts/chatMarkdownAnchorService.js";
import { ChatContextPickService, IChatContextPickService } from "./attachments/chatContextPickService.js";
import { ChatInputBoxContentProvider } from "./widget/input/editor/chatEditorInputContentProvider.js";
import { ChatEditingEditorAccessibility } from "./chatEditing/chatEditingEditorAccessibility.js";
import { registerChatEditorActions } from "./chatEditing/chatEditingEditorActions.js";
import { ChatEditingEditorContextKeys } from "./chatEditing/chatEditingEditorContextKeys.js";
import { ChatEditingEditorOverlay } from "./chatEditing/chatEditingEditorOverlay.js";
import { ChatEditingService } from "./chatEditing/chatEditingServiceImpl.js";
import { ChatEditingNotebookFileSystemProviderContrib } from "./chatEditing/notebook/chatEditingNotebookFileSystemProvider.js";
import { ChatEditor } from "./widgetHosts/editor/chatEditor.js";
import { ChatOutlineCreator } from "./chatOutlineCreator.js";
import { ChatEditorInput, ChatEditorInputSerializer } from "./widgetHosts/editor/chatEditorInput.js";
import { ChatLayoutService } from "./widget/chatLayoutService.js";
import { ChatLanguageModelsDataContribution, LanguageModelsConfigurationService } from "./languageModelsConfigurationService.js";
import "./chatManagement/chatManagement.contribution.js";
import "./aiCustomization/aiCustomizationWorkspaceService.js";
import "./aiCustomization/customizationHarnessService.js";
import "./aiCustomization/aiCustomizationManagement.contribution.js";
import "./aiCustomization/aiCustomizationItemsModel.js";
import { ChatOutputRendererService, IChatOutputRendererService } from "./chatOutputItemRenderer.js";
import { ChatCompatibilityNotifier, ChatExtensionPointHandler } from "./chatParticipant.contribution.js";
import { ChatPasteProvidersFeature } from "./widget/input/editor/chatPasteProviders.js";
import { QuickChatService } from "./widgetHosts/chatQuick.js";
import { ChatResponseAccessibleView } from "./accessibility/chatResponseAccessibleView.js";
import { ChatTerminalOutputAccessibleView } from "./accessibility/chatTerminalOutputAccessibleView.js";
import { ChatSetupContribution, ChatTeardownContribution } from "./chatSetup/chatSetupContributions.js";
import { ChatQuotaNotificationContribution } from "./chatQuotaNotification.js";
import { ChatPromoNotificationContribution } from "./chatPromoNotification.js";
import { HasByokModelsContribution } from "./hasByokModelsContribution.js";
import { ChatStatusBarEntry } from "./chatStatus/chatStatusEntry.js";
import { ChatVariablesService } from "./attachments/chatVariables.js";
import { ChatWidget } from "./widget/chatWidget.js";
import { ChatCodeBlockContextProviderService } from "./codeBlockContextProviderService.js";
import { ChatDynamicVariableModel } from "./attachments/chatDynamicVariables.js";
import { ChatImplicitContextContribution } from "./attachments/chatImplicitContext.js";
import "./widget/input/editor/chatInputCompletions.js";
import "./widget/input/editor/agentHostInputCompletions.js";
import "./widget/input/editor/chatInputEditorContrib.js";
import "./widget/input/editor/chatInputCommandArgumentHint.js";
import "./widget/input/editor/chatInputEditorHover.js";
import { LanguageModelToolsConfirmationService } from "./tools/languageModelToolsConfirmationService.js";
import { LanguageModelToolsService, globalAutoApproveDescription } from "./tools/languageModelToolsService.js";
import { IToolResultCompressor } from "../common/tools/toolResultCompressor.js";
import { ToolResultCompressorService } from "./tools/toolResultCompressorService.js";
import { AgentPluginService, ConfiguredAgentPluginDiscovery, CopilotCliAgentPluginDiscovery, ExtensionAgentPluginDiscovery, MarketplaceAgentPluginDiscovery } from "../common/plugins/agentPluginServiceImpl.js";
import { IAgentPluginRepositoryService } from "../common/plugins/agentPluginRepositoryService.js";
import { IPluginInstallService } from "../common/plugins/pluginInstallService.js";
import { IPluginMarketplaceService, PluginMarketplaceService } from "../common/plugins/pluginMarketplaceService.js";
import { WorkspacePluginSettingsService, IWorkspacePluginSettingsService } from "../common/plugins/workspacePluginSettingsService.js";
import { AgentPluginRecommendations } from "./claudePluginRecommendations.js";
import { AgentPluginEditor } from "./agentPluginEditor/agentPluginEditor.js";
import { AgentPluginEditorInput } from "./agentPluginEditor/agentPluginEditorInput.js";
import { AgentPluginRepositoryService } from "./agentPluginRepositoryService.js";
import { BrowserPluginGitCommandService } from "./pluginGitCommandService.js";
import { IPluginGitService } from "../common/plugins/pluginGitService.js";
import { PluginInstallService } from "./pluginInstallService.js";
import { PluginAutoUpdate } from "./pluginAutoUpdate.js";
import "./promptSyntax/promptCodingAgentActionContribution.js";
import "./promptSyntax/promptToolsCodeLensProvider.js";
import "./promptSyntax/promptToolSetsCodeLensProvider.js";
import "./promptTimeline/promptTimeline.contribution.js";
import { ChatSessionOptionSlashCommandsContribution, ChatSlashCommandsContribution } from "./chatSlashCommands.js";
import "./planReviewFeedback/planReviewFeedbackEditorOverlay.js";
import { IPlanReviewFeedbackService, PlanReviewFeedbackService } from "./planReviewFeedback/planReviewFeedbackService.js";
import { PluginUrlHandler } from "./pluginUrlHandler.js";
import { PromptUrlHandler } from "./promptSyntax/promptUrlHandler.js";
import { ConfigureToolSets, UserToolSetsContributions } from "./tools/toolSetsContribution.js";
import { ChatViewsWelcomeHandler } from "./viewsWelcome/chatViewsWelcomeHandler.js";
import { ChatWidgetService } from "./widget/chatWidgetService.js";
import { ILanguageModelsConfigurationService } from "../common/languageModelsConfiguration.js";
import { ChatWindowNotifier } from "./chatWindowNotifier.js";
import { ChatPetService, IChatPetService } from "./chatPetService.js";
import { ChatRepoInfoContribution } from "./chatRepoInfo.js";
import { VALID_PROMPT_FOLDER_PATTERN } from "../common/promptSyntax/utils/promptFilesLocator.js";
import { ChatTipService, IChatTipService } from "./chatTipService.js";
import { ChatQueuePickerRendering } from "./widget/input/chatQueuePickerActionItem.js";
import { ExploreAgentDefaultModel } from "./exploreAgentDefaultModel.js";
import { PlanAgentDefaultModel } from "./planAgentDefaultModel.js";
import { UtilityModelContribution, UtilitySmallModelContribution } from "./utilityModelContribution.js";
import { ChatImageCarouselService, IChatImageCarouselService } from "./chatImageCarouselService.js";
import { AgentHostImportConversationStore, IAgentHostImportConversationStore } from "./agentSessions/agentHost/agentHostImportConversationStore.js";
CommandsRegistry.registerCommand("_chat.notifyQuestionCarouselAnswer", (accessor, resolveId, answers) => {
  accessor.get(IChatService).notifyQuestionCarouselAnswer("", resolveId, answers);
});
const toolReferenceNameEnumValues = [];
const toolReferenceNameEnumDescriptions = [];
const jsonContributionRegistry = Registry.as(JSONExtensions.JSONContribution);
jsonContributionRegistry.registerSchema(HOOK_SCHEMA_URI, hookFileSchema);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "chatSidebar",
  title: nls.localize("interactiveSessionConfigurationTitle", "Chat"),
  type: "object",
  properties: {
    "chat.experimentalSessionsWindowOverride": {
      type: "boolean",
      description: nls.localize("chat.experimentalSessionsWindowOverride", "When true, enables sessions-window-specific behavior for extensions."),
      default: false,
      tags: ["experimental"],
      agentsWindow: { default: true }
    },
    "chat.fontSize": {
      type: "number",
      description: nls.localize("chat.fontSize", "Controls the font size in pixels in chat messages."),
      default: 13,
      minimum: 6,
      maximum: 100
    },
    "chat.fontFamily": {
      type: "string",
      description: nls.localize("chat.fontFamily", "Controls the font family in chat messages."),
      default: "default"
    },
    "dictation.enabled": {
      type: "boolean",
      markdownDescription: nls.localize("dictation.enabled", "Enables dictation across the product (chat input, editor, and terminal). When enabled on a supported platform, a microphone button appears in the chat input and the dictation shortcut becomes available; the on-device transcription model is downloaded on first use and runs locally."),
      default: true,
      tags: ["experimental"],
      policy: {
        name: "DictationEnabled",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.131",
        localization: {
          description: {
            key: "dictation.enabled.policy",
            value: nls.localize("dictation.enabled.policy", "Controls whether dictation is available across the product (chat input, editor, and terminal).")
          }
        }
      }
    },
    "dictation.model": {
      type: "string",
      enum: [
        DEFAULT_LOCAL_TRANSCRIPTION_MODEL,
        "mai"
      ],
      enumItemLabels: [
        nls.localize("dictation.model.nemotronStreaming.label", "Nemotron 3.5 ASR (Multilingual) \u2014 On-Device"),
        nls.localize("dictation.model.mai.label", "MAI \u2014 Cloud")
      ],
      markdownEnumDescriptions: [
        nls.localize("dictation.model.nemotronStreaming", "NVIDIA Nemotron 3.5 multilingual streaming RNN-T, run on-device through Microsoft Foundry Local. Works offline; no audio leaves the device. Automatic language selection follows the Voice Mode language setting and system or browser locale, with model detection as a fallback. Downloaded on first use and cached on disk."),
        nls.localize("dictation.model.mai", "Cloud transcription through the same Microsoft AI voice service used by Voice Mode. Requires a network connection and GitHub sign-in; audio is streamed to the service.")
      ],
      markdownDescription: nls.localize("dictation.model", "The model used for dictation. On-device models download on first use and run locally through Microsoft Foundry Local; the cloud option streams audio to the Microsoft AI voice service."),
      default: DEFAULT_LOCAL_TRANSCRIPTION_MODEL,
      tags: ["experimental"],
      experiment: { mode: "auto" }
    },
    [DictationSettingId.ShowTranscript]: {
      type: "boolean",
      markdownDescription: nls.localize("dictation.showTranscript", "Controls whether the transcript is shown while dictating. The final transcript is inserted when dictation ends."),
      default: true,
      tags: ["experimental"]
    },
    "dictation.experimental.llmCleanup": {
      type: "boolean",
      markdownDescription: nls.localize("dictation.experimental.llmCleanup", "Experimental: when dictation ends, the final transcript is passed through a small language model to restore punctuation, capitalization, paragraphs, and lists. Requires Copilot to be enabled; the transcript is sent to the language model for cleanup. Falls back to the raw transcript when no model is available. Use [dictation instructions](command:{0}) to customize terminology and formatting.", CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID),
      default: true,
      tags: ["experimental"]
    },
    "chat.editor.fontSize": {
      type: "number",
      description: nls.localize("interactiveSession.editor.fontSize", "Controls the font size in pixels in chat codeblocks."),
      default: isMacintosh ? 12 : 14
    },
    "chat.editor.fontFamily": {
      type: "string",
      description: nls.localize("interactiveSession.editor.fontFamily", "Controls the font family in chat codeblocks."),
      default: "default"
    },
    "chat.editor.fontWeight": {
      type: "string",
      description: nls.localize("interactiveSession.editor.fontWeight", "Controls the font weight in chat codeblocks."),
      default: "default"
    },
    "chat.editor.wordWrap": {
      type: "string",
      description: nls.localize("interactiveSession.editor.wordWrap", "Controls whether lines should wrap in chat codeblocks."),
      default: "off",
      enum: ["on", "off"]
    },
    "chat.editor.lineHeight": {
      type: "number",
      description: nls.localize("interactiveSession.editor.lineHeight", "Controls the line height in pixels in chat codeblocks. Use 0 to compute the line height from the font size."),
      default: 0
    },
    [ChatConfiguration.AgentStatusEnabled]: {
      type: "string",
      enum: ["hidden", "badge", "compact"],
      enumDescriptions: [
        nls.localize("chat.agentsControl.hidden", "The agent status indicator is hidden from the title bar."),
        nls.localize("chat.agentsControl.badge", "Shows the agent status as a badge next to the command center."),
        nls.localize("chat.agentsControl.compact", "Replaces the command center search box with a compact agent status indicator and unified chat widget.")
      ],
      markdownDescription: nls.localize("chat.agentsControl.enabled", "Controls how the 'Agent Status' indicator appears in the title bar command center. When set to `hidden`, the indicator is not shown. Other values show the indicator and automatically enable {0}. The unread and in-progress session indicators require {1} to be enabled.", "`#window.commandCenter#`", "`#chat.viewSessions.enabled#`"),
      default: "compact",
      tags: ["experimental"]
    },
    [ChatConfiguration.UnifiedAgentsBar]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.unifiedAgentsBar.enabled", "Replaces the command center search box with a unified chat and search widget."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.AgentSessionProjectionEnabled]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentSessionProjection.enabled", "Controls whether Agent Session Projection mode is enabled for reviewing agent sessions in a focused workspace."),
      default: false,
      tags: ["experimental"]
    },
    "chat.implicitContext.enabled": {
      type: "object",
      description: nls.localize("chat.implicitContext.enabled.1", "Enables automatically using the active editor as chat context for specified chat locations."),
      additionalProperties: {
        type: "string",
        enum: ["never", "first", "always"],
        description: nls.localize("chat.implicitContext.value", "The value for the implicit context."),
        enumDescriptions: [
          nls.localize("chat.implicitContext.value.never", "Implicit context is never enabled."),
          nls.localize("chat.implicitContext.value.first", "Implicit context is enabled for the first interaction."),
          nls.localize("chat.implicitContext.value.always", "Implicit context is always enabled.")
        ]
      },
      default: {
        "panel": "always"
      },
      tags: ["experimental"],
      experiment: {
        mode: "startup"
      },
      agentsWindow: { default: { "panel": "never" } }
    },
    "chat.implicitContext.suggestedContext": {
      type: "boolean",
      markdownDescription: nls.localize("chat.implicitContext.suggestedContext", "Controls whether the new implicit context flow is shown. In Ask and Edit modes, the context will automatically be included. When using an agent, context will be suggested as an attachment. Selections are always included as context."),
      default: true,
      agentsWindow: { default: false }
    },
    "chat.implicitContext.includeActiveEditor": {
      type: "boolean",
      markdownDescription: nls.localize("chat.implicitContext.includeActiveEditor", "When enabled, the active editor is automatically forwarded as context, even when it would otherwise only be suggested. Selections and explicitly attached files are always included regardless of this setting.\n\nNote: this setting currently only applies to Agent Host sessions (such as the Copilot CLI)."),
      default: true,
      tags: ["experimental"],
      agentsWindow: { default: false }
    },
    "chat.editing.autoAcceptDelay": {
      type: "number",
      markdownDescription: nls.localize("chat.editing.autoAcceptDelay", "Delay after which changes made by chat are automatically accepted. Values are in seconds, `0` means disabled and `100` seconds is the maximum."),
      default: 0,
      minimum: 0,
      maximum: 100
    },
    "chat.editing.confirmEditRequestRemoval": {
      type: "boolean",
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: nls.localize("chat.editing.confirmEditRequestRemoval", "Whether to show a confirmation before removing a request and its associated edits."),
      default: true
    },
    "chat.editing.confirmEditRequestRetry": {
      type: "boolean",
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: nls.localize("chat.editing.confirmEditRequestRetry", "Whether to show a confirmation before retrying a request and its associated edits."),
      default: true
    },
    "chat.editing.explainChanges.enabled": {
      type: "boolean",
      markdownDescription: nls.localize("chat.editing.explainChanges.enabled", "Controls whether the Explain button in the Chat panel and the Explain Changes context menu in the SCM view are shown. This is an experimental feature."),
      default: false,
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.RevealNextChangeOnResolve]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.editing.revealNextChangeOnResolve", "Controls whether the editor automatically reveals the next change after keeping or undoing a chat edit."),
      default: true
    },
    [ChatConfiguration.OpenChangedFileInDiffEditor]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.editing.openChangedFileInDiffEditor", "Controls whether selecting a file in the changed files list of a chat response opens it in a diff editor showing the changes made by chat, or in a regular editor. Holding `kbstyle(Alt)` while selecting the file opens it with the opposite behavior."),
      default: true
    },
    "chat.tips.enabled": {
      type: "boolean",
      scope: ConfigurationScope.APPLICATION,
      description: nls.localize("chat.tips.enabled", "Controls whether tips are shown above user messages in chat. New tips are added frequently, so this is a helpful way to stay up to date with the latest features."),
      default: true
    },
    "chat.upvoteAnimation": {
      type: "string",
      enum: ["off", "confetti", "floatingThumbs", "pulseWave", "radiantLines"],
      enumDescriptions: [
        nls.localize("chat.upvoteAnimation.off", "No animation is shown."),
        nls.localize("chat.upvoteAnimation.confetti", "Shows a confetti burst animation around the thumbs up button."),
        nls.localize("chat.upvoteAnimation.floatingThumbs", "Shows floating thumbs up icons rising from the button."),
        nls.localize("chat.upvoteAnimation.pulseWave", "Shows expanding pulse rings from the button."),
        nls.localize("chat.upvoteAnimation.radiantLines", "Shows radiant lines emanating from the button.")
      ],
      description: nls.localize("chat.upvoteAnimation", "Controls whether an animation is shown when clicking the thumbs up button on a chat response."),
      default: "floatingThumbs"
    },
    "chat.experimental.detectParticipant.enabled": {
      type: "boolean",
      deprecationMessage: nls.localize("chat.experimental.detectParticipant.enabled.deprecated", "This setting is deprecated. Please use `chat.detectParticipant.enabled` instead."),
      description: nls.localize("chat.experimental.detectParticipant.enabled", "Enables chat participant autodetection for panel chat."),
      default: null
    },
    [ChatConfiguration.IncrementalRendering]: {
      type: "boolean",
      description: nls.localize("chat.experimental.incrementalRendering.enabled", "Enables incremental rendering with optional block-level animation when streaming chat responses."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.IncrementalRenderingStyle]: {
      type: "string",
      enum: ["none", "fade", "rise", "blur", "scale", "slide", "reveal"],
      enumDescriptions: [
        nls.localize("chat.experimental.incrementalRendering.animationStyle.none", "No animation. Content appears instantly."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.fade", "Simple opacity fade from 0 to 1."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.rise", "Content fades in while rising upward."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.blur", "Content fades in from a blurred state."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.scale", "Content scales up from slightly smaller."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.slide", "Content slides in from the left."),
        nls.localize("chat.experimental.incrementalRendering.animationStyle.reveal", "Content reveals top-to-bottom with a soft gradient edge.")
      ],
      description: nls.localize("chat.experimental.incrementalRendering.animationStyle", "Controls the animation style for incremental rendering."),
      default: "fade",
      tags: ["experimental"]
    },
    [ChatConfiguration.IncrementalRenderingBuffering]: {
      type: "string",
      enum: ["off", "word", "paragraph"],
      enumDescriptions: [
        nls.localize("chat.experimental.incrementalRendering.buffering.off", "Renders content immediately as tokens arrive."),
        nls.localize("chat.experimental.incrementalRendering.buffering.word", "Reveals content word by word."),
        nls.localize("chat.experimental.incrementalRendering.buffering.paragraph", "Buffers content until a paragraph break before rendering.")
      ],
      description: nls.localize("chat.experimental.incrementalRendering.buffering", "Controls how content is buffered before rendering during incremental rendering. Lower buffering levels render faster but may show incomplete sentences or partially formed markdown."),
      default: "word",
      tags: ["experimental"]
    },
    [ChatConfiguration.CollapseCompletedResponses]: {
      type: "boolean",
      description: nls.localize("chat.agent.collapseCompletedResponses", "Controls whether completed chat responses collapse intermediate work while keeping the final response visible."),
      default: product.quality !== "stable"
    },
    "chat.detectParticipant.enabled": {
      type: "boolean",
      description: nls.localize("chat.detectParticipant.enabled", "Enables chat participant autodetection for panel chat."),
      default: true
    },
    [ChatConfiguration.InlineReferencesStyle]: {
      type: "string",
      enum: ["box", "link"],
      enumDescriptions: [
        nls.localize("chat.inlineReferences.style.box", "Display file and symbol references as boxed widgets with icons."),
        nls.localize("chat.inlineReferences.style.link", "Display file and symbol references as simple blue links without icons.")
      ],
      description: nls.localize("chat.inlineReferences.style", "Controls how file and symbol references are displayed in chat messages."),
      default: "box"
    },
    [ChatConfiguration.EditorAssociations]: {
      type: "object",
      markdownDescription: nls.localize("chat.editorAssociations", 'Configure [glob patterns](https://aka.ms/vscode-glob-patterns) to editors for opening files from chat (for example `"*.md": "vscode.markdown.preview.editor"`).'),
      additionalProperties: {
        type: "string"
      },
      default: {}
    },
    [ChatConfiguration.NotifyWindowOnConfirmation]: {
      type: "string",
      enum: ["off", "windowNotFocused", "always"],
      enumDescriptions: [
        nls.localize("chat.notifyWindowOnConfirmation.off", "Never show OS notifications for confirmations."),
        nls.localize("chat.notifyWindowOnConfirmation.windowNotFocused", "Show OS notifications for confirmations when the window is not focused."),
        nls.localize("chat.notifyWindowOnConfirmation.always", "Always show OS notifications for confirmations, even when the window is focused.")
      ],
      description: nls.localize("chat.notifyWindowOnConfirmation", "Controls whether a chat session should present the user with an OS notification when a confirmation or question needs input. This includes a window badge as well as notification toast."),
      default: "windowNotFocused"
    },
    [ChatConfiguration.AutoReply]: {
      default: false,
      markdownDescription: nls.localize("chat.autoReply.description", "Automatically skip question carousels by telling the agent that the user is not available and to use its best judgment. This is an advanced setting and can lead to unintended choices or actions based on incomplete context."),
      type: "boolean",
      scope: ConfigurationScope.APPLICATION_MACHINE,
      tags: ["experimental", "advanced"]
    },
    [ChatConfiguration.AutopilotAdvancedEnabled]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.autopilot.advanced.enabled", "Enables **Advanced Autopilot**, a single switch that turns on all advanced Autopilot behaviors that delegate more of the loop to the agent. Currently, after each Autopilot turn a small, fast model evaluates whether your original request is complete; if not, Autopilot keeps working using that evaluation as guidance for the next turn, instead of relying on the agent to signal completion itself."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.DefaultPermissionLevel]: {
      type: "string",
      enum: [ChatPermissionLevel.Default, ChatPermissionLevel.AutoApprove, ChatPermissionLevel.Autopilot],
      enumItemLabels: [
        nls.localize("chat.permissions.default.default.label", "Default Approvals"),
        nls.localize("chat.permissions.default.autoApprove.label", "Bypass Approvals"),
        nls.localize("chat.permissions.default.autopilot.label", "Autopilot (Preview)")
      ],
      enumDescriptions: [
        nls.localize("chat.permissions.default.default.description", "Start new chat sessions with Default Approvals."),
        nls.localize("chat.permissions.default.autoApprove.description", "Start new chat sessions in Bypass Approvals mode."),
        nls.localize("chat.permissions.default.autopilot.description", "Start new chat sessions in Autopilot mode.")
      ],
      description: nls.localize("chat.permissions.default.settingDescription", "Controls the default permissions picker mode for new local chat sessions. You can still change the permission mode per session, and each session remembers the permission mode that was used. If enterprise policy disables auto approval, new sessions use Default Approvals."),
      default: ChatPermissionLevel.Default
    },
    [ChatConfiguration.AssistedPermissionsEnabled]: {
      type: "boolean",
      default: product.quality !== "stable",
      description: nls.localize("chat.assistedPermissions.enabled", "Controls whether Assisted permissions is shown in Agent Host approval pickers."),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.PermissionsSandboxToggleEnabled]: {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("chat.experimental.permissionsSandboxToggle.enabled", 'Controls whether the permissions picker shows an inline "Sandboxing for terminal" toggle on the Default Approvals option. The toggle reflects and updates `#chat.agent.sandbox.enabled#`.'),
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.DefaultConfiguration]: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: {
          type: "string",
          enum: ["interactive", "plan", "autopilot"],
          enumDescriptions: [
            nls.localize("chat.defaultConfiguration.mode.interactive", "Interactive \u2014 step-by-step collaboration."),
            nls.localize("chat.defaultConfiguration.mode.plan", "Plan \u2014 plan first, execute when ready."),
            nls.localize("chat.defaultConfiguration.mode.autopilot", "Autopilot \u2014 autonomously iterate from start to finish.")
          ],
          default: "interactive",
          description: nls.localize("chat.defaultConfiguration.mode.description", "The starting mode for new agent sessions.")
        },
        approvals: {
          type: "string",
          enum: [ChatDefaultPermissionLevel.Default, ChatDefaultPermissionLevel.Assisted, ChatDefaultPermissionLevel.AllowAll],
          enumDescriptions: [
            nls.localize("chat.defaultConfiguration.approvals.default", "Ask When Needed \u2014 asks when approval settings don't apply."),
            nls.localize("chat.defaultConfiguration.approvals.assisted", "Assisted permissions \u2014 evaluates risk before running tools."),
            nls.localize("chat.defaultConfiguration.approvals.allowAll", "Allow All \u2014 runs tool calls without asking.")
          ],
          default: ChatDefaultPermissionLevel.Default,
          description: nls.localize("chat.defaultConfiguration.approvals.description", "The starting approval behavior for new agent sessions. If enterprise policy disables auto approval, new sessions use Ask When Needed.")
        }
      },
      default: { mode: "interactive", approvals: ChatDefaultPermissionLevel.Default },
      markdownDescription: nls.localize("chat.defaultConfiguration.settingDescription", "Controls the default configuration for new agent sessions (such as Copilot CLI). You can still change the mode and approval behavior per session, and each session remembers what was used.")
    },
    [ChatConfiguration.DefaultModel]: {
      type: "string",
      default: "",
      markdownDescription: nls.localize("chat.defaultModel.description", 'The default model for new chat conversations. Use "auto" to let Copilot pick a model, a model family name (such as "opus" or "gemini") to use the latest available model in that family, or a full model id. You can still switch the model within a conversation; each new conversation starts at this model.'),
      experiment: {
        mode: "auto"
      },
      policy: {
        name: "ChatDefaultModel",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedModelValue(),
        managedSettings: {
          [COPILOT_MODEL_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.defaultModel.policy",
            value: nls.localize("chat.defaultModel.policy", 'Sets the default chat model for new conversations. Accepts "auto", a model family name (such as "opus" or "gemini"), or a full model id. Users can still switch the model within a conversation.')
          }
        }
      }
    },
    [ChatConfiguration.GlobalAutoApprove]: {
      default: false,
      markdownDescription: globalAutoApproveDescription.value,
      type: "boolean",
      scope: ConfigurationScope.APPLICATION_MACHINE,
      tags: ["experimental"],
      policy: {
        name: "ChatToolsAutoApprove",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.99",
        value: (policyData) => policyData.managedSettings?.[COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY] === "disable" || policyData.chat_preview_features_enabled === false ? false : void 0,
        managedSettings: {
          [COPILOT_DISABLE_BYPASS_PERMISSIONS_MODE_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "autoApprove3.description",
            value: nls.localize("autoApprove3.description", 'Global auto approve also known as "YOLO mode" disables manual approval completely for all tools in all workspaces, allowing the agent to act fully autonomously. This is extremely dangerous and is *never* recommended, even containerized environments like Codespaces and Dev Containers have user keys forwarded into the container that could be compromised.\n\nThis feature disables critical security protections and makes it much easier for an attacker to compromise the machine.\n\nNote: This setting only controls tool approval and does not prevent the agent from asking questions. To automatically answer agent questions, use the `#chat.autoReply#` setting.')
          }
        }
      }
    },
    [ChatConfiguration.SessionSyncEnabled]: {
      default: false,
      markdownDescription: nls.localize("chat.sessionSync.enabled", "Enable session sync to GitHub.com. When enabled, Copilot session data is synced to your GitHub account for cross-device access and richer insights. Requires `#github.copilot.chat.localIndex.enabled#` to also be enabled."),
      type: "boolean",
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      },
      policy: {
        name: "CopilotSessionSync",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.121",
        value: (policyData) => policyData.cloud_session_storage_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.sessionSync.enabled.policy",
            value: nls.localize("chat.sessionSync.enabled.policy", "Enable session sync to GitHub.com for cross-device Copilot session history. When disabled by organization policy, session data is kept local only.")
          }
        }
      }
    },
    [ChatConfiguration.SessionSyncExcludeRepositories]: {
      type: "array",
      items: { type: "string" },
      default: [],
      markdownDescription: nls.localize("chat.sessionSync.excludeRepositories", "Repository patterns to exclude from session sync. Use exact `owner/repo` names or glob patterns like `my-org/*`. Sessions from matching repositories will only be stored locally."),
      tags: ["experimental", "advanced"]
    },
    [ChatConfiguration.AutoApproveEdits]: {
      default: {
        "**/*": true,
        "**/.vscode/*.json": false,
        "**/.git/**": false,
        "**/{package.json,server.xml,build.rs,web.config,.gitattributes,.env,Cargo.toml}": false,
        "**/*.{code-workspace,csproj,fsproj,vbproj,vcxproj,proj,targets,props,gradle,gradle.kts}": false,
        "**/gradle.properties": false,
        "**/ruby_lsp/*/addon": false,
        // Auto-included Ruby addons
        "**/*.lock": false,
        // yarn.lock, bun.lock, etc.
        "**/*-lock.{yaml,json}": false
        // pnpm-lock.yaml, package-lock.json
      },
      markdownDescription: nls.localize("chat.tools.autoApprove.edits", "Controls whether edits made by the agent are automatically approved. The default is to approve all edits except those made to certain files which have the potential to cause immediate unintended side-effects, such as `**/.vscode/*.json`.\n\nSet to `true` to automatically approve edits to matching files, `false` to always require explicit approval. The last pattern matching a given file will determine whether the edit is automatically approved."),
      type: "object",
      additionalProperties: {
        type: "boolean"
      }
    },
    [ChatConfiguration.AutoApprovedUrls]: {
      default: {
        "https://code.visualstudio.com": true,
        "https://github.com/microsoft/vscode/wiki/*": true
      },
      markdownDescription: nls.localize("chat.tools.fetchPage.approvedUrls", 'Controls which URLs are automatically approved when requested by chat tools. Keys are URL patterns and values can be `true` to approve both requests and responses, `false` to deny, or an object with `approveRequest` and `approveResponse` properties for granular control.\n\nExamples:\n- `"https://example.com": true` - Approve all requests to example.com\n- `"https://*.example.com": true` - Approve all requests to any subdomain of example.com\n- `"https://example.com/api/*": { "approveRequest": true, "approveResponse": false }` - Approve requests but not responses for example.com/api paths'),
      type: "object",
      additionalProperties: {
        oneOf: [
          { type: "boolean" },
          {
            type: "object",
            properties: {
              approveRequest: { type: "boolean" },
              approveResponse: { type: "boolean" }
            }
          }
        ]
      }
    },
    [ChatConfiguration.EligibleForAutoApproval]: {
      default: {},
      markdownDescription: nls.localize("chat.tools.eligibleForAutoApproval", "Controls which tools are eligible for automatic approval. Tools set to 'false' will always present a confirmation and will never offer the option to auto-approve. The default behavior (or setting a tool to 'true') may result in the tool offering auto-approval options."),
      type: "object",
      propertyNames: {
        enum: toolReferenceNameEnumValues,
        enumDescriptions: toolReferenceNameEnumDescriptions
      },
      additionalProperties: {
        type: "boolean"
      },
      examples: [
        {
          "fetch": false,
          "runTask": false
        }
      ],
      policy: {
        name: "ChatToolsEligibleForAutoApproval",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.107",
        localization: {
          description: {
            key: "chat.tools.eligibleForAutoApproval",
            value: nls.localize("chat.tools.eligibleForAutoApproval", "Controls which tools are eligible for automatic approval. Tools set to 'false' will always present a confirmation and will never offer the option to auto-approve. The default behavior (or setting a tool to 'true') may result in the tool offering auto-approval options.")
          }
        }
      }
    },
    [ChatConfiguration.ArtifactsEnabled]: {
      default: false,
      description: nls.localize("chat.artifacts.enabled", "Controls whether the artifacts view is available in chat."),
      type: "boolean",
      tags: ["experimental"]
    },
    [ChatConfiguration.ArtifactsRulesByMimeType]: {
      default: {
        "image/*": { groupName: "Screenshots", onlyShowGroup: true }
      },
      description: nls.localize("chat.artifacts.rules.byMimeType", "Rules for extracting artifacts from tool results by MIME type. Maps MIME type patterns (e.g. 'image/*') to group configuration."),
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          groupName: { type: "string", description: nls.localize("chat.artifacts.rules.groupName", "Display name for the artifact group.") },
          onlyShowGroup: { type: "boolean", description: nls.localize("chat.artifacts.rules.onlyShowGroup", "When true, show only the group header instead of individual items.") }
        },
        required: ["groupName"]
      },
      tags: ["experimental"]
    },
    [ChatConfiguration.ArtifactsRulesByFilePath]: {
      default: {
        "**/*plan*.md": { groupName: "Plans" }
      },
      description: nls.localize("chat.artifacts.rules.byFilePath", "Rules for extracting artifacts from written files by file path pattern. Maps glob patterns to group configuration."),
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          groupName: { type: "string", description: nls.localize("chat.artifacts.rules.byFilePath.groupName", "Display name for the artifact group.") },
          onlyShowGroup: { type: "boolean", description: nls.localize("chat.artifacts.rules.byFilePath.onlyShowGroup", "When true, show only the group header instead of individual items.") }
        },
        required: ["groupName"]
      },
      tags: ["experimental"]
    },
    [ChatConfiguration.ArtifactsRulesByMemoryFilePath]: {
      default: {
        "**/*plan*.md": { groupName: "Plans" }
      },
      description: nls.localize("chat.artifacts.rules.byMemoryFilePath", "Rules for extracting artifacts from memory tool calls by memory file path pattern. Maps glob patterns to group configuration."),
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          groupName: { type: "string", description: nls.localize("chat.artifacts.rules.byMemoryFilePath.groupName", "Display name for the artifact group.") },
          onlyShowGroup: { type: "boolean", description: nls.localize("chat.artifacts.rules.byMemoryFilePath.onlyShowGroup", "When true, show only the group header instead of individual items.") }
        },
        required: ["groupName"]
      },
      tags: ["experimental"]
    },
    "chat.undoRequests.restoreInput": {
      default: true,
      markdownDescription: nls.localize("chat.undoRequests.restoreInput", "Controls whether the input of the chat should be restored when an undo request is made. The input will be filled with the text of the request that was restored."),
      type: "boolean"
    },
    "chat.editRequests": {
      markdownDescription: nls.localize("chat.editRequests", "Enables editing of requests in the chat. This allows you to change the request content and resubmit it to the model."),
      type: "string",
      enum: ["inline", "hover", "input", "none"],
      default: "inline"
    },
    [ChatConfiguration.ChatViewSessionsEnabled]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.viewSessions.enabled", "Show chat agent sessions when chat is empty or to the side when chat view is wide enough."),
      agentsWindow: { default: false }
    },
    [ChatConfiguration.ChatViewSessionsOrientation]: {
      type: "string",
      enum: ["stacked", "sideBySide"],
      enumDescriptions: [
        nls.localize("chat.viewSessions.orientation.stacked", "Display chat sessions vertically stacked above the chat input unless a chat session is visible."),
        nls.localize("chat.viewSessions.orientation.sideBySide", "Display chat sessions side by side if space is sufficient, otherwise fallback to stacked above the chat input unless a chat session is visible.")
      ],
      default: "sideBySide",
      description: nls.localize("chat.viewSessions.orientation", "Controls the orientation of the chat agent sessions view when it is shown alongside the chat.")
    },
    [ChatConfiguration.ChatViewProgressBadgeEnabled]: {
      type: "boolean",
      default: false,
      description: nls.localize("chat.viewProgressBadge.enabled", "Show a progress badge on the chat view when an agent session is in progress that is opened in that view.")
    },
    [ChatSessionArchiveActionWordingSettingId]: {
      type: "string",
      enum: ["archive", "done"],
      enumDescriptions: [
        nls.localize("chat.experimental.sessionArchiveActionWording.archive", "Use Archive, Archive All, Unarchive, and Unarchive All."),
        nls.localize("chat.experimental.sessionArchiveActionWording.done", "Use Mark as Done, Mark All as Done, Restore, and Restore All.")
      ],
      default: "archive",
      tags: ["experimental"],
      experiment: { mode: "startup" },
      description: nls.localize("chat.experimental.sessionArchiveActionWording", "Controls the wording and icons used by actions that archive and unarchive chat sessions.")
    },
    [ChatConfiguration.AgentsHandoffTipMode]: {
      type: "string",
      enum: ["hidden", "default", "custom"],
      enumDescriptions: [
        nls.localize("chat.agentsHandoffTip.mode.hidden", "Never show the handoff tip."),
        nls.localize("chat.agentsHandoffTip.mode.default", "Show the handoff tip with the default description."),
        nls.localize("chat.agentsHandoffTip.mode.custom", "Show the handoff tip with an alternate description.")
      ],
      default: "hidden",
      tags: ["experimental"],
      experiment: { mode: "startup" },
      description: nls.localize("chat.agentsHandoffTip.mode", "Controls the tip shown above the chat input offering to continue eligible agent sessions in the Agents Window.")
    },
    [ClaudePreferAgentHostAgentsSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agents.claude.preferAgentHost", "When enabled, Claude sessions opened from the Agents Window run inside the agent host process instead of the GitHub Copilot Chat extension. Only one Claude implementation surfaces per window. Requires `#chat.agentHost.enabled#`."),
      default: true,
      tags: ["experimental"],
      experiment: { mode: "startup" }
    },
    [ClaudePreferAgentHostEditorSettingId]: {
      type: "boolean",
      description: nls.localize("chat.editor.claude.preferAgentHost", "When enabled, Claude sessions opened from the regular workbench (sidebar chat) run inside the agent host process instead of the GitHub Copilot Chat extension. Only one Claude implementation surfaces per window."),
      default: true,
      tags: ["experimental"],
      experiment: { mode: "startup" }
    },
    [CodexPreferAgentHostEditorSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.editor.codex.preferAgentHost", "When enabled, Codex sessions opened from the regular workbench (sidebar chat) run inside the agent host process using the Codex App Server instead of the OpenAI extension. Only one Codex implementation surfaces per window. Requires `#chat.agentHost.enabled#` and `#chat.agentHost.codexAgent.enabled#`."),
      default: false,
      tags: ["experimental"],
      experiment: { mode: "startup" }
    },
    [ChatConfiguration.ChatContextUsageEnabled]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.contextUsage.enabled", "Show the context window usage indicator in the chat input.")
    },
    [ChatConfiguration.Verbose]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.verbose", "Show request and completion timestamps. Hover over a completion timestamp to show the elapsed response time.")
    },
    [ChatConfiguration.ProgressBorder]: {
      type: "boolean",
      default: true,
      markdownDescription: nls.localize("chat.progressBorder.enabled", "Show an animated gradient border around the chat input while the agent is working or thinking. Has no effect when reduced motion is enabled.")
    },
    [ChatConfiguration.NotifyWindowOnResponseReceived]: {
      type: "string",
      enum: ["off", "windowNotFocused", "always"],
      enumDescriptions: [
        nls.localize("chat.notifyWindowOnResponseReceived.off", "Never show OS notifications for responses."),
        nls.localize("chat.notifyWindowOnResponseReceived.windowNotFocused", "Show OS notifications for responses when the window is not focused."),
        nls.localize("chat.notifyWindowOnResponseReceived.always", "Always show OS notifications for responses, even when the window is focused.")
      ],
      default: "windowNotFocused",
      description: nls.localize("chat.notifyWindowOnResponseReceived", "Controls whether a chat session should present the user with an OS notification when a response is received. This includes a window badge as well as notification toast.")
    },
    "chat.checkpoints.enabled": {
      type: "boolean",
      default: true,
      description: nls.localize("chat.checkpoints.enabled", "Enables checkpoints in chat. Checkpoints allow you to restore the chat to a previous state.")
    },
    "chat.checkpoints.showFileChanges": {
      type: "boolean",
      description: nls.localize("chat.checkpoints.showFileChanges", "Controls whether to show chat checkpoint file changes."),
      default: false
    },
    [ChatConfiguration.TurnStatusPills]: {
      anyOf: [
        {
          type: "boolean"
        },
        {
          type: "object",
          properties: {
            changes: {
              type: "boolean",
              default: false,
              description: nls.localize("chat.turnStatusPills.changes", "Show a pill summarizing the files changed and the lines added and removed in the turn.")
            },
            preview: {
              type: "boolean",
              default: false,
              description: nls.localize("chat.turnStatusPills.preview", "Show a pill to preview a Markdown or HTML file created or edited in the turn.")
            },
            browser: {
              type: "boolean",
              default: false,
              description: nls.localize("chat.turnStatusPills.browser", "Show a pill for browser activity in the turn.")
            }
          },
          additionalProperties: false,
          deprecationMessage: nls.localize("chat.turnStatusPills.objectDeprecated", "The per-pill object form is deprecated. Use a boolean value instead.")
        }
      ],
      markdownDescription: nls.localize("chat.turnStatusPills", "Controls whether agent status pills are shown above the chat input while a turn is in progress and inside the completed response. Only applies to agent sessions."),
      default: true
    },
    [mcpAccessConfig]: {
      type: "string",
      description: nls.localize("chat.mcp.access", "Controls access to installed Model Context Protocol servers."),
      enum: [
        McpAccessValue.None,
        McpAccessValue.Registry,
        McpAccessValue.All
      ],
      enumDescriptions: [
        nls.localize("chat.mcp.access.none", "No access to MCP servers."),
        nls.localize("chat.mcp.access.registry", "Allows access to MCP servers listed in the registry that VS Code is connected to."),
        nls.localize("chat.mcp.access.any", "Allow access to any installed MCP server.")
      ],
      default: McpAccessValue.All,
      policy: {
        name: "ChatMCP",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.99",
        value: (policyData) => {
          if (policyData.mcp === false) {
            return McpAccessValue.None;
          }
          if (policyData.mcpAccess === "registry_only") {
            return McpAccessValue.Registry;
          }
          return void 0;
        },
        localization: {
          description: {
            key: "chat.mcp.access",
            value: nls.localize("chat.mcp.access", "Controls access to installed Model Context Protocol servers.")
          },
          enumDescriptions: [
            {
              key: "chat.mcp.access.none",
              value: nls.localize("chat.mcp.access.none", "No access to MCP servers.")
            },
            {
              key: "chat.mcp.access.registry",
              value: nls.localize("chat.mcp.access.registry", "Allows access to MCP servers listed in the registry that VS Code is connected to.")
            },
            {
              key: "chat.mcp.access.any",
              value: nls.localize("chat.mcp.access.any", "Allow access to any installed MCP server.")
            }
          ]
        }
      }
    },
    [mcpAllowedServersConfig]: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          serverName: { type: "string", minLength: 1, description: nls.localize("chat.mcp.allowedServers.serverName", "Match a server by its configured name.") },
          serverUrl: { type: "string", minLength: 1, description: nls.localize("chat.mcp.allowedServers.serverUrl", "Match a remote server by its URL. Supports `*` wildcards, for example `https://*.example.com/*`.") },
          serverCommand: { type: "array", minItems: 1, items: { type: "string" }, description: nls.localize("chat.mcp.allowedServers.serverCommand", "Match a local server by its exact command invocation, given as the command followed by its arguments.") }
        },
        oneOf: [
          { required: ["serverName"] },
          { required: ["serverUrl"] },
          { required: ["serverCommand"] }
        ]
      },
      markdownDescription: nls.localize("chat.mcp.allowedServers", "Enterprise-managed allowlist that controls which Model Context Protocol servers may be installed and run. When set, only servers matching an entry are permitted; any other server is blocked. Servers can be matched by name, remote URL pattern (with `*` wildcards), or local command invocation. Omit entirely to allow all servers (subject to the deny list). Delivered via enterprise policy for governance; this setting is not surfaced to end users."),
      default: null,
      scope: ConfigurationScope.APPLICATION,
      // Governance-only: delivered via the `ChatAllowedMcpServers` enterprise policy and hidden
      // from the Settings UI so it is not configurable by end users.
      included: false,
      policy: {
        name: "ChatAllowedMcpServers",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.130",
        value: managedSettingValue(COPILOT_ALLOWED_MCP_SERVERS_KEY),
        managedSettings: {
          [COPILOT_ALLOWED_MCP_SERVERS_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.mcp.allowedServers.policy",
            value: nls.localize("chat.mcp.allowedServers.policy", "Allowlist of Model Context Protocol servers. When set, only servers matching an entry may be installed or run; omit entirely to allow all servers (subject to the deny list).")
          }
        }
      }
    },
    [mcpDeniedServersConfig]: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          serverName: { type: "string", minLength: 1, description: nls.localize("chat.mcp.deniedServers.serverName", "Match a server by its configured name.") },
          serverUrl: { type: "string", minLength: 1, description: nls.localize("chat.mcp.deniedServers.serverUrl", "Match a remote server by its URL. Supports `*` wildcards, for example `https://*.example.com/*`.") },
          serverCommand: { type: "array", minItems: 1, items: { type: "string" }, description: nls.localize("chat.mcp.deniedServers.serverCommand", "Match a local server by its exact command invocation, given as the command followed by its arguments.") }
        },
        oneOf: [
          { required: ["serverName"] },
          { required: ["serverUrl"] },
          { required: ["serverCommand"] }
        ]
      },
      markdownDescription: nls.localize("chat.mcp.deniedServers", "Enterprise-managed denylist of Model Context Protocol servers. Servers matching any entry are unconditionally blocked from being installed or run, even if they also match the allow list \u2014 deny rules always take precedence. Servers can be matched by name, remote URL pattern (with `*` wildcards), or local command invocation. Delivered via enterprise policy for governance; this setting is not surfaced to end users."),
      default: null,
      scope: ConfigurationScope.APPLICATION,
      // Governance-only: delivered via the `ChatDeniedMcpServers` enterprise policy and hidden
      // from the Settings UI so it is not configurable by end users.
      included: false,
      policy: {
        name: "ChatDeniedMcpServers",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.130",
        value: managedSettingValue(COPILOT_DENIED_MCP_SERVERS_KEY),
        managedSettings: {
          [COPILOT_DENIED_MCP_SERVERS_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.mcp.deniedServers.policy",
            value: nls.localize("chat.mcp.deniedServers.policy", "Denylist of Model Context Protocol servers. Servers matching any entry are blocked from being installed or run, even if they also match the allow list; deny rules always take precedence.")
          }
        }
      }
    },
    [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG]: {
      type: "boolean",
      default: false,
      scope: ConfigurationScope.APPLICATION,
      included: false,
      description: nls.localize("chat.mcp.allowManagedServersOnly", "Use only the enterprise-managed MCP allowlist when deciding which servers may run."),
      policy: {
        name: "ChatAllowManagedMcpServersOnly",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.132",
        value: managedSettingValue(COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY),
        managedSettings: {
          [COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.mcp.allowManagedServersOnly.policy",
            value: nls.localize("chat.mcp.allowManagedServersOnly.policy", "Use only the enterprise-managed MCP allowlist when deciding which servers may run.")
          }
        }
      }
    },
    [mcpAutoStartConfig]: {
      type: "string",
      description: nls.localize("chat.mcp.autostart", "Controls whether MCP servers should be automatically started when the chat messages are submitted."),
      default: McpAutoStartValue.NewAndOutdated,
      enum: [
        McpAutoStartValue.Never,
        McpAutoStartValue.OnlyNew,
        McpAutoStartValue.NewAndOutdated
      ],
      enumDescriptions: [
        nls.localize("chat.mcp.autostart.never", "Never automatically start MCP servers."),
        nls.localize("chat.mcp.autostart.onlyNew", "Only automatically start new MCP servers that have never been run."),
        nls.localize("chat.mcp.autostart.newAndOutdated", "Automatically start new and outdated MCP servers that are not yet running.")
      ],
      tags: ["experimental"]
    },
    [mcpAppsEnabledConfig]: {
      type: "boolean",
      description: nls.localize("chat.mcp.ui.enabled", "Controls whether MCP servers can provide custom UI for tool invocations."),
      default: true,
      tags: ["experimental"]
    },
    [mcpEnterpriseManagedAuthIdpSection]: {
      type: "object",
      default: {},
      scope: ConfigurationScope.APPLICATION,
      tags: ["preview", "experimental"],
      additionalProperties: false,
      included: false,
      properties: {
        issuer: {
          type: "string",
          format: "uri",
          markdownDescription: nls.localize("mcp.enterpriseManagedAuth.idp.issuer", "The OAuth/OIDC issuer URL of the SSO authorization server. Must be an `https://` URL.")
        },
        clientId: {
          type: "string",
          markdownDescription: nls.localize("mcp.enterpriseManagedAuth.idp.clientId", "The OAuth client ID registered with the SSO issuer for this device.")
        },
        clientSecret: {
          type: "string",
          markdownDescription: nls.localize("mcp.enterpriseManagedAuth.idp.clientSecret", "The OAuth client secret paired with `clientId`. Intended for local development only.")
        }
      },
      markdownDescription: nls.localize("mcp.enterpriseManagedAuth.idp", "(Preview) The OAuth/OIDC IdP configuration used for enterprise-managed Model Context Protocol (MCP) servers. Typically delivered via enterprise policy (Windows Group Policy / macOS managed preferences / Linux `/etc/vscode/policy.json`); developers may hand-edit `settings.json` for local testing. Properties: `issuer` (HTTPS URL), `clientId`, `clientSecret`."),
      policy: {
        name: "McpEnterpriseManagedAuthIdp",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.122",
        localization: {
          description: {
            key: "mcp.enterpriseManagedAuth.idp.policy",
            value: nls.localize("mcp.enterpriseManagedAuth.idp.policy", "The OAuth/OIDC IdP configuration used for enterprise-managed Model Context Protocol (MCP) server authentication.")
          }
        }
      }
    },
    [mcpServerCollisionBehaviorSection]: {
      type: "string",
      description: nls.localize("chat.mcp.collisionBehavior", "Controls behavior when multiple MCP servers are discovered with the same name. 'disable' disables lower-priority duplicates. 'suffix' appends numeric suffixes to disambiguate."),
      enum: [
        McpCollisionBehavior.Disable,
        McpCollisionBehavior.Suffix
      ],
      enumDescriptions: [
        nls.localize("chat.mcp.collisionBehavior.disable", "Disable lower-priority servers with duplicate names."),
        nls.localize("chat.mcp.collisionBehavior.suffix", "Append numeric suffixes to servers with duplicate names.")
      ],
      default: McpCollisionBehavior.Disable
    },
    [mcpServerSamplingSection]: {
      type: "object",
      description: nls.localize("chat.mcp.serverSampling", "Configures which models are exposed to MCP servers for sampling (making model requests in the background). This setting can be edited in a graphical way under the `{0}` command.", "MCP: " + nls.localize("mcp.list", "List Servers")),
      scope: ConfigurationScope.RESOURCE,
      additionalProperties: {
        type: "object",
        properties: {
          allowedDuringChat: {
            type: "boolean",
            description: nls.localize("chat.mcp.serverSampling.allowedDuringChat", "Whether this server is allowed to make sampling requests during its tool calls in a chat session."),
            default: true
          },
          allowedOutsideChat: {
            type: "boolean",
            description: nls.localize("chat.mcp.serverSampling.allowedOutsideChat", "Whether this server is allowed to make sampling requests outside of a chat session."),
            default: false
          },
          allowedModels: {
            type: "array",
            items: {
              type: "string",
              description: nls.localize("chat.mcp.serverSampling.model", "A model the MCP server has access to.")
            }
          }
        }
      }
    },
    [AssistedTypes[AddConfigurationType.NuGetPackage].enabledConfigKey]: {
      type: "boolean",
      description: nls.localize("chat.mcp.assisted.nuget.enabled.description", "Enables NuGet packages for AI-assisted MCP server installation. Used to install MCP servers by name from the central registry for .NET packages (NuGet.org)."),
      default: false,
      tags: ["experimental"],
      experiment: {
        mode: "startup"
      }
    },
    [ChatConfiguration.ExtensionToolsEnabled]: {
      type: "boolean",
      description: nls.localize("chat.extensionToolsEnabled", "Enable using tools contributed by third-party extensions."),
      default: true,
      policy: {
        name: "ChatAgentExtensionTools",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.99",
        localization: {
          description: {
            key: "chat.extensionToolsEnabled",
            value: nls.localize("chat.extensionToolsEnabled", "Enable using tools contributed by third-party extensions.")
          }
        }
      }
    },
    [ChatConfiguration.PluginsEnabled]: {
      type: "boolean",
      description: nls.localize("chat.plugins.enabled", "Enable agent plugin integration in chat."),
      default: true,
      policy: {
        name: "ChatPluginsEnabled",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.116",
        localization: {
          description: {
            key: "chat.plugins.enabled",
            value: nls.localize("chat.plugins.enabled", "Enable agent plugin integration in chat.")
          }
        }
      }
    },
    [ChatConfiguration.PluginLocations]: {
      type: "object",
      additionalProperties: { type: "boolean" },
      restricted: true,
      markdownDescription: nls.localize("chat.pluginLocations", "Plugin directories to discover. Each key is a path that points directly to a plugin folder, and the value enables (`true`) or disables (`false`) it. Paths can be absolute, relative to the workspace root, or start with `~/` for the user's home directory."),
      scope: ConfigurationScope.MACHINE,
      tags: ["experimental"]
    },
    [ChatConfiguration.EnabledPlugins]: {
      type: "object",
      additionalProperties: { type: "boolean" },
      markdownDescription: nls.localize("chat.plugins.enabledPlugins", "Controls which [agent plugins](https://aka.ms/vscode-agent-plugins) are enabled or disabled. Keys are plugin IDs in `<plugin>@<marketplace>` form (where marketplace is defined in {1}); values enable (`true`) or disable (`false`) the plugin. Discovered alongside the path-keyed entries in {0}. When set by policy, entries are additive: plugins mapped to `true` are enabled in addition to the user's own plugins, and only plugins mapped to `false` are blocked from loading.", `\`#${ChatConfiguration.PluginLocations}#\``, `\`#${ChatConfiguration.PluginMarketplaces}#\``),
      scope: ConfigurationScope.APPLICATION,
      policy: {
        name: "ChatEnabledPlugins",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.122",
        value: managedSettingValue(COPILOT_ENABLED_PLUGINS_KEY),
        managedSettings: {
          [COPILOT_ENABLED_PLUGINS_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.plugins.enabledPlugins.policy",
            value: nls.localize("chat.plugins.enabledPlugins.policy", "Plugin enablement. Keys are plugin IDs in `{plugin}@{marketplace}` form; values enable or disable the plugin.")
          }
        }
      }
    },
    [ChatConfiguration.PluginMarketplaces]: {
      type: "array",
      items: {
        type: "string"
      },
      markdownDescription: nls.localize("chat.plugins.marketplaces", "Plugin marketplaces to query. Entries may be GitHub shorthand (`owner/repo` or `owner/repo#ref`), direct Git repository URIs (`https://...git`, `ssh://...git`, or `git@host:path.git`, each optionally suffixed with `#ref`), or local repository URIs (`file:///...`). Equivalent GitHub shorthand and URI entries are deduplicated."),
      default: ["github/copilot-plugins", "github/awesome-copilot#marketplace"],
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental"]
    },
    [ChatConfiguration.ExtraMarketplaces]: {
      // Policy-only delivery slot for enterprise-managed marketplace entries (via the
      // `ChatExtraMarketplaces` policy). Consumers union this with `chat.plugins.marketplaces`.
      //
      // Stored as a named string map. Explicit update overrides are JSON-encoded
      // inside the value string so the Settings Editor can use its inline object renderer.
      // This ensures:
      //   - The Settings Editor (ComplexObject renderer) can display entries inline when
      //     managed by policy, rather than only showing "Edit in settings.json".
      //   - Marketplace names are preserved for `enabledPlugins["plugin@<name>"]` resolution.
      //
      type: "object",
      additionalProperties: { type: ["string"] },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      included: false,
      markdownDescription: nls.localize("chat.plugins.extraMarketplaces", "Enterprise-managed additional plugin marketplaces. Unioned with {0}. An entry's `autoUpdate` value overrides {1} for plugins from that marketplace.", `\`#${ChatConfiguration.PluginMarketplaces}#\``, "`#extensions.autoUpdate#`"),
      policy: {
        name: "ChatExtraMarketplaces",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.122",
        value: managedSettingValue(COPILOT_EXTRA_MARKETPLACES_KEY),
        managedSettings: {
          [COPILOT_EXTRA_MARKETPLACES_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.plugins.extraMarketplaces.policy",
            value: nls.localize("chat.plugins.extraMarketplaces.policy", "Additional plugin marketplaces to query. Keys are marketplace names; values are GitHub shorthand (`owner/repo[#ref]`) or Git URIs (`{url}[#ref]`), optionally with an enterprise-managed auto-update override.")
          }
        }
      }
    },
    [ChatConfiguration.StrictMarketplaces]: {
      type: ["array", "null"],
      items: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["github", "git", "url", "npm", "file", "directory", "hostPattern", "pathPattern"]
          },
          repo: { type: "string" },
          url: { type: "string" },
          ref: { type: "string" },
          path: { type: "string" },
          package: { type: "string" },
          hostPattern: { type: "string" },
          pathPattern: { type: "string" },
          headers: { type: "object", additionalProperties: { type: "string" } }
        },
        required: ["source"]
      },
      markdownDescription: nls.localize("chat.plugins.strictMarketplaces", "Enterprise-managed allowlist of plugin marketplace sources. When set, only marketplaces matching one of these entries can be installed; an empty array blocks all marketplaces. This does not retroactively disable already-installed plugins. Each entry is an object with a `source` discriminator (`github`, `git`, `url`, `npm`, `file`, `directory`, `hostPattern`, or `pathPattern`) and the corresponding fields. Typically delivered via enterprise policy."),
      default: null,
      restricted: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental"],
      policy: {
        name: "ChatStrictMarketplaces",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.122",
        value: managedSettingValue(COPILOT_STRICT_MARKETPLACES_KEY),
        managedSettings: {
          [COPILOT_STRICT_MARKETPLACES_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.plugins.strictMarketplaces.policy",
            value: nls.localize("chat.plugins.strictMarketplaces.policy", "Allowlist of plugin marketplace sources. When set, only marketplaces matching an entry are trusted; an empty array blocks all marketplaces.")
          }
        }
      }
    },
    [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG]: {
      type: "boolean",
      default: false,
      scope: ConfigurationScope.APPLICATION,
      included: false,
      description: nls.localize("chat.customizations.strictPluginOnlyCustomization", "Blocks standalone user and workspace skills, agents, hooks, instructions, and MCP servers while keeping eligible plugin customizations available."),
      policy: {
        name: "ChatStrictPluginOnlyCustomization",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.132",
        value: managedSettingValue(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY),
        managedSettings: {
          [COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.customizations.strictPluginOnlyCustomization.policy",
            value: nls.localize("chat.customizations.strictPluginOnlyCustomization.policy", "Blocks standalone user and workspace skills, agents, hooks, instructions, and MCP servers while keeping eligible plugin customizations available.")
          }
        }
      }
    },
    [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG]: {
      type: "boolean",
      default: false,
      scope: ConfigurationScope.APPLICATION,
      included: false,
      description: nls.localize("chat.hooks.allowManagedOnly", "Allows hooks only from enterprise-managed sources and plugins force-enabled by policy."),
      policy: {
        name: "ChatAllowManagedHooksOnly",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.132",
        value: managedSettingValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY),
        managedSettings: {
          [COPILOT_ALLOW_MANAGED_HOOKS_ONLY_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.hooks.allowManagedOnly.policy",
            value: nls.localize("chat.hooks.allowManagedOnly.policy", "Allows hooks only from enterprise-managed sources and plugins force-enabled by policy.")
          }
        }
      }
    },
    [ChatConfiguration.AgentEnabled]: {
      type: "boolean",
      description: nls.localize("chat.agent.enabled.description", "When enabled, agent mode can be activated from chat and tools in agentic contexts with side effects can be used."),
      default: true,
      order: 1,
      policy: {
        name: "ChatAgentMode",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.99",
        value: (policyData) => policyData.chat_agent_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.agent.enabled.description",
            value: nls.localize("chat.agent.enabled.description", "When enabled, agent mode can be activated from chat and tools in agentic contexts with side effects can be used.")
          }
        }
      }
    },
    [AgentNetworkDomainSettingId.NetworkFilter]: {
      markdownDescription: nls.localize("chat.agent.networkFilter", "When enabled, network access by agent tools (fetch tool, integrated browser) is restricted according to {0} and {1}. Domain filtering is also applied to those tools when {2} is enabled.", `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``),
      type: "boolean",
      default: false,
      restricted: true,
      policy: {
        name: "ChatAgentNetworkFilter",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.116",
        localization: {
          description: {
            key: "chat.agent.networkFilter",
            value: nls.localize("chat.agent.networkFilter", "When enabled, network access by agent tools (fetch tool, integrated browser) is restricted according to {0} and {1}. Domain filtering is also applied to those tools when {2} is enabled.", `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``)
          }
        }
      }
    },
    [AgentNetworkDomainSettingId.AllowedNetworkDomains]: {
      markdownDescription: nls.localize("chat.agent.allowedNetworkDomains", "Allowed domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. When {2} is enabled, all domains are allowed. Supports wildcards like {3}. When both allowed and denied lists are empty, all domains are blocked. Denied domains (see {4}) take precedence.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, "`*.example.com`", `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``),
      type: "array",
      items: { type: "string" },
      default: [],
      restricted: true,
      policy: {
        name: "ChatAgentAllowedNetworkDomains",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.116",
        localization: {
          description: {
            key: "chat.agent.allowedNetworkDomains",
            value: nls.localize("chat.agent.allowedNetworkDomains", "Allowed domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. When {2} is enabled, all domains are allowed. Supports wildcards like {3}. When both allowed and denied lists are empty, all domains are blocked. Denied domains (see {4}) take precedence.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, "`*.example.com`", `\`#${AgentNetworkDomainSettingId.DeniedNetworkDomains}#\``)
          }
        }
      }
    },
    [AgentNetworkDomainSettingId.DeniedNetworkDomains]: {
      markdownDescription: nls.localize("chat.agent.deniedNetworkDomains", "Denied domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. This does not apply when {2} is enabled. Takes precedence over {3}. Supports wildcards like {4}.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, "`*.example.com`"),
      type: "array",
      items: { type: "string" },
      default: [],
      restricted: true,
      policy: {
        name: "ChatAgentDeniedNetworkDomains",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.116",
        localization: {
          description: {
            key: "chat.agent.deniedNetworkDomains",
            value: nls.localize("chat.agent.deniedNetworkDomains", "Denied domains for network access by agent tools (fetch tool, integrated browser). Applies when {0} or {1} is enabled. This does not apply when {2} is enabled. Takes precedence over {3}. Supports wildcards like {4}.", `\`#${AgentNetworkDomainSettingId.NetworkFilter}#\``, `\`#${AgentSandboxSettingId.AgentSandboxEnabled}#\``, `\`#${AgentSandboxSettingId.AgentSandboxAllowNetwork}#\``, `\`#${AgentNetworkDomainSettingId.AllowedNetworkDomains}#\``, "`*.example.com`")
          }
        }
      }
    },
    [ChatConfiguration.DefaultNewSessionMode]: {
      type: "string",
      description: nls.localize("chat.newSession.defaultMode", "The default mode for new chat sessions. When empty, the chat view's default mode is used."),
      default: ""
    },
    [AgentHostAhpJsonlLoggingSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.ahpJsonlLogging", "When enabled, logs all AHP transport messages for agent host connections to JSONL files under the window's log directory."),
      default: product.quality !== "stable",
      tags: ["experimental", "advanced"]
    },
    [AgentHostAgentDebugLogEnabledSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.agentDebugLog.enabled", "Enable agent debug logging for agent host sessions: surface their debug events in the agent debug panel. Takes effect immediately; only sessions that run while this is enabled are captured."),
      default: false,
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "startup"
      }
    },
    [AgentHostAgentDebugLogMaxEventsSettingId]: {
      type: "number",
      minimum: 10,
      markdownDescription: nls.localize("chat.agentHost.agentDebugLog.maxEventsInMemory", "Maximum number of debug events kept in memory per agent host session for the agent debug panel. Older events beyond this limit are dropped from the in-memory buffer, which also lowers the totals (such as token usage) shown in the panel overview."),
      default: 1e4,
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "startup"
      }
    },
    [AgentHostCustomTerminalToolEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.customTerminalTool.enabled", "When enabled, Copilot SDK sessions use the Agent Host terminal tool override instead of the SDK's default terminal behavior."),
      default: false,
      tags: ["experimental", "advanced"]
    },
    [AgentHostCopilotSdkLogLevelSettingId]: {
      type: "string",
      enum: [...copilotSdkLogLevelSettingValues],
      enumDescriptions: [
        nls.localize("chat.agentHost.copilotSdk.logLevel.info", "Log informational messages. Running VS Code with trace logging still enables all Copilot SDK runtime diagnostics."),
        nls.localize("chat.agentHost.copilotSdk.logLevel.trace", "Log all Copilot SDK runtime diagnostics.")
      ],
      markdownDescription: nls.localize("chat.agentHost.copilotSdk.logLevel", "Controls the log level for the Copilot SDK runtime used by the local agent host. Changing this setting restarts the Copilot SDK client; active sessions are reloaded when next used."),
      default: "info",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [AgentHostOpus48PromptEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.opus48Prompt.enabled", "When enabled, Copilot SDK sessions running a Claude Opus 4.8 model apply Opus 4.8-tuned system-prompt section overrides on top of the default system message."),
      default: false,
      tags: ["experimental", "advanced"]
    },
    [AgentHostToolSearchEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.copilot.toolSearch.enabled", "When enabled, Copilot SDK sessions defer MCP and non-core VS Code tools behind a tool-search tool so the model discovers them on demand instead of loading every tool definition up front."),
      default: false,
      tags: ["experimental", "advanced"]
    },
    [AgentHostToolSearchDeferThresholdSettingId]: {
      type: "number",
      description: nls.localize("chat.agentHost.copilot.toolSearch.deferThreshold", "Minimum number of tools before MCP and external tools are deferred behind tool search. Set to 0 to always defer external tools. Only effective when tool search is enabled."),
      default: 1,
      minimum: 0,
      tags: ["experimental", "advanced"]
    },
    [AgentHostReasoningEffortOverrideSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.reasoningEffortOverride", "Overrides the reasoning effort for Copilot SDK agent sessions regardless of the per-model picker value. Set it to a level the selected model supports (for example `low`, `medium`, `high`, or `xhigh`) \u2014 choosing a level the model does not support may be rejected by the model. A value that isn't a recognized effort level is ignored and the session falls back to the picker value. Applied when a session is created and when its model changes. Only affects Copilot CLI agent sessions.\n\n**Note**: This is an advanced setting for experimentation."),
      default: "",
      tags: ["experimental", "advanced"]
    },
    [AgentHostModelCapabilityOverridesSettingId]: {
      type: "object",
      markdownDescription: nls.localize("chat.agentHost.modelCapabilityOverrides", "Per-model capability overrides for Copilot SDK agent sessions, keyed by model id, intended for evaluating preview models against an existing model's profile. For each model id, declare an aliased `family` (for example `claude-opus-4-8`) to route the model to that family's tuned system prompt without a code change; the model id sent to the runtime is unaffected. Only affects Copilot CLI agent sessions.\n\n**Note**: This is an advanced setting for experimentation."),
      additionalProperties: {
        type: "object",
        properties: {
          family: {
            type: "string",
            description: nls.localize("chat.agentHost.modelCapabilityOverrides.family", "Alias the model's family for prompt/capability routing (e.g. `claude-opus-4-8`).")
          }
        }
      },
      default: {},
      tags: ["experimental", "advanced"]
    },
    [AgentHostSdkSandboxEnabledSettingId]: {
      type: "string",
      enum: [AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On, AgentSandboxEnabledValue.AllowNetwork],
      enumDescriptions: [
        nls.localize("chat.agentHost.sdkSandbox.enabled.off", "No sandbox policy is forwarded for the SDK's built-in shell tool \u2014 commands run unsandboxed."),
        nls.localize("chat.agentHost.sdkSandbox.enabled.on", "The SDK's built-in shell tool runs inside a sandbox using the configured filesystem policy and host-list-restricted network."),
        nls.localize("chat.agentHost.sdkSandbox.enabled.allowNetwork", "The SDK's built-in shell tool runs inside a sandbox with unrestricted outbound network access.")
      ],
      markdownDescription: nls.localize("chat.agentHost.sdkSandbox.enabled", "Sandbox mode for the Copilot SDK's built-in shell tool. Only takes effect when `#chat.agentHost.customTerminalTool.enabled#` is `false`; when the Agent Host's own terminal tool is enabled, the engine sandbox is controlled by `#chat.agent.sandbox.enabled#`. The sandbox applies only to requests that run with default approvals \u2014 not when approvals are bypassed \u2014 and is not supported on Windows yet."),
      default: AgentSandboxEnabledValue.Off,
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.ToolConfirmationCarousel]: {
      type: "boolean",
      description: nls.localize("chat.tools.confirmationCarousel", "When enabled, multiple tool confirmations are batched into a carousel above the input."),
      default: true
    },
    [ChatConfiguration.ToolRiskAssessmentEnabled]: {
      type: "boolean",
      description: nls.localize("chat.tools.riskAssessment.enabled", "When enabled, tool confirmations show an LLM-generated risk level (Safe / Caution / Review carefully) and a short explanation."),
      default: true,
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.ToolRiskAssessmentModel]: {
      type: "string",
      description: nls.localize("chat.tools.riskAssessment.model", "The language model id used to generate tool risk assessments. Should be a small, fast model."),
      default: "copilot-utility-small",
      tags: ["experimental", "advanced"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.PlanAgentDefaultModel]: {
      type: "string",
      description: nls.localize("chat.planAgent.defaultModel.description", "Select the default language model to use for the Plan agent from the available providers."),
      default: "",
      enum: PlanAgentDefaultModel.modelIds,
      enumItemLabels: PlanAgentDefaultModel.modelLabels,
      markdownEnumDescriptions: PlanAgentDefaultModel.modelDescriptions
    },
    [ChatConfiguration.ExploreAgentDefaultModel]: {
      type: "string",
      description: nls.localize("chat.exploreAgent.defaultModel.description", "Select the default language model to use for the Explore subagent from the available providers."),
      default: "",
      enum: ExploreAgentDefaultModel.modelIds,
      enumItemLabels: ExploreAgentDefaultModel.modelLabels,
      markdownEnumDescriptions: ExploreAgentDefaultModel.modelDescriptions
    },
    [ChatConfiguration.BYOKUtilityModelDefault]: {
      type: "string",
      markdownDescription: nls.localize("chat.byokUtilityModelDefault.description", "Controls the default model used by built-in utility flows when the selected main agent model is a bring your own key (BYOK) model. This setting has no effect when the selected main agent model is provided by GitHub Copilot. A specific model configured in {0} or {1} takes precedence.", "`#chat.utilityModel#`", "`#chat.utilitySmallModel#`"),
      enum: [BYOKUtilityModelDefault.None, BYOKUtilityModelDefault.MainAgent, BYOKUtilityModelDefault.Copilot],
      enumItemLabels: [
        nls.localize("chat.byokUtilityModelDefault.none.label", "None"),
        nls.localize("chat.byokUtilityModelDefault.mainAgent.label", "Main Agent Model"),
        nls.localize("chat.byokUtilityModelDefault.copilot.label", "GitHub Copilot")
      ],
      markdownEnumDescriptions: [
        nls.localize("chat.byokUtilityModelDefault.none.description", "Do not use a default utility model."),
        nls.localize("chat.byokUtilityModelDefault.mainAgent.description", "Use the selected BYOK main agent model."),
        nls.localize("chat.byokUtilityModelDefault.copilot.description", "Use the default GitHub Copilot utility models.")
      ],
      default: BYOKUtilityModelDefault.Copilot
    },
    [ChatConfiguration.UtilityModel]: {
      type: "string",
      description: nls.localize("chat.utilityModel.description", "Override the language model used by built-in utility flows. Leave empty to use the configured default behavior."),
      default: "",
      enum: UtilityModelContribution.modelIds,
      enumItemLabels: UtilityModelContribution.modelLabels,
      markdownEnumDescriptions: UtilityModelContribution.modelDescriptions
    },
    [ChatConfiguration.UtilitySmallModel]: {
      type: "string",
      description: nls.localize("chat.utilitySmallModel.description", "Override the language model used by built-in small/fast utility flows. A fast and inexpensive model is recommended. Leave empty to use the configured default behavior."),
      default: "",
      enum: UtilitySmallModelContribution.modelIds,
      enumItemLabels: UtilitySmallModelContribution.modelLabels,
      markdownEnumDescriptions: UtilitySmallModelContribution.modelDescriptions
    },
    [ChatConfiguration.RequestQueueingDefaultAction]: {
      type: "string",
      enum: ["queue", "steer"],
      enumDescriptions: [
        nls.localize("chat.requestQueuing.defaultAction.queue", "Queue the message to send after the current request completes."),
        nls.localize("chat.requestQueuing.defaultAction.steer", "Steer the current request by sending the message immediately, signaling the current request to yield.")
      ],
      description: nls.localize("chat.requestQueuing.defaultAction.description", "Controls which action is the default for the queue button when a request is in progress."),
      default: "steer"
    },
    [ChatConfiguration.EnableMath]: {
      type: "boolean",
      description: nls.localize("chat.mathEnabled.description", "Enable math rendering in chat responses using KaTeX."),
      default: true
    },
    [ChatConfiguration.ShowCodeBlockProgressAnimation]: {
      type: "boolean",
      description: nls.localize("chat.codeBlock.showProgressAnimation.description", "When applying edits, show a progress animation in the code block pill. If disabled, shows the progress percentage instead."),
      default: true,
      tags: ["experimental"]
    },
    [mcpDiscoverySection]: {
      type: "object",
      properties: Object.fromEntries(allDiscoverySources.map((k) => [k, { type: "boolean", description: discoverySourceSettingsLabel[k] }])),
      additionalProperties: false,
      default: Object.fromEntries(allDiscoverySources.map((k) => [k, false])),
      markdownDescription: nls.localize("mcp.discovery.enabled", "Configures discovery of Model Context Protocol servers from configuration from various other applications.")
    },
    [mcpGalleryServiceEnablementConfig]: {
      type: "boolean",
      default: false,
      tags: ["preview"],
      description: nls.localize("chat.mcp.gallery.enabled", "Enables the default Marketplace for Model Context Protocol (MCP) servers."),
      included: product.quality === "stable"
    },
    [mcpGalleryServiceUrlConfig]: {
      type: "string",
      description: nls.localize("mcp.gallery.serviceUrl", "Configure the MCP Gallery service URL to connect to"),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["usesOnlineServices", "advanced"],
      included: false,
      policy: {
        name: "McpGalleryServiceUrl",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.101",
        value: (policyData) => policyData.mcpRegistryUrl,
        localization: {
          description: {
            key: "mcp.gallery.serviceUrl",
            value: nls.localize("mcp.gallery.serviceUrl", "Configure the MCP Gallery service URL to connect to")
          }
        }
      }
    },
    [PromptsConfig.INSTRUCTIONS_LOCATION_KEY]: {
      type: "object",
      title: nls.localize(
        "chat.instructions.config.locations.title",
        "Instructions File Locations"
      ),
      markdownDescription: nls.localize(
        "chat.instructions.config.locations.description",
        "Specify location(s) of instructions files (`*{0}`) that can be attached in Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        INSTRUCTION_FILE_EXTENSION,
        INSTRUCTIONS_DOCUMENTATION_URL
      ),
      default: {
        ...DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS.map((folder) => ({ [folder.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {})
      },
      additionalProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.instructionsLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported. Glob patterns are deprecated and will be removed in future versions.")
      },
      restricted: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [DEFAULT_INSTRUCTIONS_SOURCE_FOLDERS[0].path]: true
        },
        {
          [INSTRUCTIONS_DEFAULT_SOURCE_FOLDER]: true,
          "/Users/vscode/repos/instructions": true
        }
      ]
    },
    [PromptsConfig.PROMPT_LOCATIONS_KEY]: {
      type: "object",
      title: nls.localize(
        "chat.reusablePrompts.config.locations.title",
        "Prompt File Locations"
      ),
      markdownDescription: nls.localize(
        "chat.reusablePrompts.config.locations.description",
        "Specify location(s) of reusable prompt files (`*{0}`) that can be run in Chat sessions. [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        PROMPT_FILE_EXTENSION,
        PROMPT_DOCUMENTATION_URL
      ),
      default: {
        [PROMPT_DEFAULT_SOURCE_FOLDER]: true
      },
      additionalProperties: { type: "boolean" },
      unevaluatedProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.promptFileLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported. Glob patterns are deprecated and will be removed in future versions.")
      },
      restricted: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [PROMPT_DEFAULT_SOURCE_FOLDER]: true
        },
        {
          [PROMPT_DEFAULT_SOURCE_FOLDER]: true,
          "/Users/vscode/repos/prompts": true
        }
      ]
    },
    [PromptsConfig.MODE_LOCATION_KEY]: {
      type: "object",
      title: nls.localize(
        "chat.mode.config.locations.title",
        "Mode File Locations"
      ),
      markdownDescription: nls.localize(
        "chat.mode.config.locations.description",
        "Specify location(s) of custom chat mode files (`*{0}`). [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        LEGACY_MODE_FILE_EXTENSION,
        AGENT_DOCUMENTATION_URL
      ),
      default: {
        [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true
      },
      deprecationMessage: nls.localize("chat.mode.config.locations.deprecated", "This setting is deprecated and will be removed in future releases. Chat modes are now called custom agents and are located in `.github/agents`"),
      additionalProperties: { type: "boolean" },
      unevaluatedProperties: { type: "boolean" },
      restricted: true,
      tags: ["experimental", "prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true
        },
        {
          [LEGACY_MODE_DEFAULT_SOURCE_FOLDER]: true,
          "/Users/vscode/repos/chatmodes": true
        }
      ]
    },
    [PromptsConfig.AGENTS_LOCATION_KEY]: {
      type: "object",
      title: nls.localize(
        "chat.agents.config.locations.title",
        "Agent File Locations"
      ),
      markdownDescription: nls.localize(
        "chat.agents.config.locations.description",
        "Specify location(s) of custom agent files (`*{0}`). [Learn More]({1}).\n\nRelative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        AGENT_FILE_EXTENSION,
        AGENT_DOCUMENTATION_URL
      ),
      default: {
        [AGENTS_SOURCE_FOLDER]: true,
        [CLAUDE_AGENTS_SOURCE_FOLDER]: true,
        [COPILOT_USER_AGENTS_SOURCE_FOLDER]: true
      },
      additionalProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.agentLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported.")
      },
      restricted: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [AGENTS_SOURCE_FOLDER]: true
        },
        {
          [AGENTS_SOURCE_FOLDER]: true,
          "my-agents": true,
          "../shared-agents": true,
          "~/.copilot/agents": true
        }
      ]
    },
    [PromptsConfig.USE_AGENT_MD]: {
      type: "boolean",
      title: nls.localize("chat.useAgentMd.title", "Use AGENTS.md file"),
      markdownDescription: nls.localize("chat.useAgentMd.description", "Controls whether instructions from `AGENTS.md` file found in a workspace roots are attached to all chat requests. This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_NESTED_AGENT_MD]: {
      type: "boolean",
      title: nls.localize("chat.useNestedAgentMd.title", "Use nested AGENTS.md files"),
      markdownDescription: nls.localize("chat.useNestedAgentMd.description", "Controls whether instructions from nested `AGENTS.md` files found in the workspace are listed in all chat requests. The language model can load these skills on-demand if the `read` tool is available. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["experimental", "prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_CLAUDE_MD]: {
      type: "boolean",
      title: nls.localize("chat.useClaudeMd.title", "Use CLAUDE.md file"),
      markdownDescription: nls.localize("chat.useClaudeMd.description", "Controls whether instructions from `CLAUDE.md` file found in workspace roots, .claude and ~/.claude folder are attached to all chat requests. This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_AGENT_SKILLS]: {
      type: "boolean",
      title: nls.localize("chat.useAgentSkills.title", "Use Agent skills"),
      markdownDescription: nls.localize("chat.useAgentSkills.description", "Controls whether skills are provided as specialized capabilities to the chat requests. Skills are loaded from the folders configured in `#chat.agentSkillsLocations#`. The language model can load these skills on-demand if the `read` tool is available. Learn more about [Agent Skills](https://aka.ms/vscode-agent-skills). This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_SKILL_ADHERENCE_PROMPT]: {
      type: "boolean",
      title: nls.localize("chat.useSkillAdherencePrompt.title", "Use Skill Adherence Prompt"),
      markdownDescription: nls.localize("chat.useSkillAdherencePrompt.description", "Controls whether a stronger skill adherence prompt is used that encourages the model to immediately invoke skills when relevant rather than just announcing them. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["experimental", "prompts", "reusable prompts", "prompt snippets", "instructions"],
      experiment: {
        mode: "auto"
      }
    },
    [PromptsConfig.INCLUDE_APPLYING_INSTRUCTIONS]: {
      type: "boolean",
      title: nls.localize("chat.includeApplyingInstructions.title", "Include Applying Instructions"),
      markdownDescription: nls.localize("chat.includeApplyingInstructions.description", "Controls whether instructions with a matching 'applyTo' attribute are automatically included in chat requests. This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.INCLUDE_REFERENCED_INSTRUCTIONS]: {
      type: "boolean",
      title: nls.localize("chat.includeReferencedInstructions.title", "Include Referenced Instructions"),
      markdownDescription: nls.localize("chat.includeReferencedInstructions.description", "Controls whether referenced instructions are automatically included in chat requests. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS]: {
      type: "boolean",
      title: nls.localize("chat.useCustomizationsInParentRepos.title", "Use Customizations in Parent Repositories"),
      markdownDescription: nls.localize("chat.useCustomizationsInParentRepos.description", "Controls whether to use chat customization files in parent repositories. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"]
    },
    [PromptsConfig.SKILLS_LOCATION_KEY]: {
      type: "object",
      title: nls.localize("chat.agentSkillsLocations.title", "Agent Skills Locations"),
      markdownDescription: nls.localize(
        "chat.agentSkillsLocations.description",
        "Specify location(s) of agent skills (`{0}`) that can be used in Chat Sessions. [Learn More]({1}).\n\nEach path should contain skill subfolders with SKILL.md files (e.g., add `my-skills` if you have `my-skills/skillA/SKILL.md`). Relative paths are resolved from the root folder(s) of your workspace.\n\nThis setting is only used by the Local agent harness.",
        SKILL_FILENAME,
        SKILL_DOCUMENTATION_URL
      ),
      default: {
        ...DEFAULT_SKILL_SOURCE_FOLDERS.map((folder) => ({ [folder.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {})
      },
      additionalProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.agentSkillsLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported.")
      },
      restricted: true,
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          [DEFAULT_SKILL_SOURCE_FOLDERS[0].path]: true
        },
        {
          [DEFAULT_SKILL_SOURCE_FOLDERS[0].path]: true,
          "my-skills": true,
          "../shared-skills": true,
          "~/.custom/skills": true
        }
      ]
    },
    [PromptsConfig.HOOKS_LOCATION_KEY]: {
      type: "object",
      title: nls.localize("chat.hookFilesLocations.title", "Hook File Locations"),
      markdownDescription: nls.localize(
        "chat.hookFilesLocations.description",
        "Specify paths to hook configuration files that define custom shell commands to execute at strategic points in an agent's workflow. [Learn More]({0}).\n\nRelative paths are resolved from the root folder(s) of your workspace. Supports Copilot hooks (`*.json`) and Claude Code hooks (`settings.json`, `settings.local.json`).\n\nThis setting is only used by the Local agent harness.",
        HOOK_DOCUMENTATION_URL
      ),
      default: {
        ...DEFAULT_HOOK_FILE_PATHS.map((f) => ({ [f.path]: true })).reduce((acc, curr) => ({ ...acc, ...curr }), {})
      },
      additionalProperties: { type: "boolean" },
      propertyNames: {
        pattern: VALID_PROMPT_FOLDER_PATTERN,
        patternErrorMessage: nls.localize("chat.hookFilesLocations.invalidPath", "Paths must be relative or start with '~/'. Absolute paths and '\\' separators are not supported.")
      },
      restricted: true,
      tags: ["preview", "prompts", "hooks", "agent"],
      examples: [
        {
          [DEFAULT_HOOK_FILE_PATHS[0].path]: true
        },
        {
          [DEFAULT_HOOK_FILE_PATHS[0].path]: true,
          "custom-hooks/hooks.json": true
        }
      ],
      agentsWindow: { default: { ".claude/settings.local.json": false, ".claude/settings.json": false, "~/.claude/settings.json": false } }
    },
    [PromptsConfig.USE_CHAT_HOOKS]: {
      type: "boolean",
      title: nls.localize("chat.useHooks.title", "Use Chat Hooks"),
      markdownDescription: nls.localize("chat.useHooks.description", "Controls whether chat hooks are executed at strategic points during an agent's workflow. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`. This setting is only used by the Local agent harness."),
      default: true,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["preview", "prompts", "hooks", "agent"],
      policy: {
        name: "ChatHooks",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.109",
        value: (policyData) => policyData.chat_preview_features_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.useHooks.description",
            value: nls.localize("chat.useHooks.description", "Controls whether chat hooks are executed at strategic points during an agent's workflow. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`. This setting is only used by the Local agent harness.")
          }
        }
      }
    },
    [PromptsConfig.USE_CLAUDE_HOOKS]: {
      type: "boolean",
      title: nls.localize("chat.useClaudeHooks.title", "Use Claude Hooks"),
      markdownDescription: nls.localize("chat.useClaudeHooks.description", "Controls whether hooks from Claude configuration files can execute. When disabled, only Copilot-format hooks are used. Hooks are loaded from the files configured in `#chat.hookFilesLocations#`. This setting is only used by the Local agent harness."),
      default: false,
      restricted: true,
      disallowConfigurationDefault: true,
      tags: ["preview", "prompts", "hooks", "agent"]
    },
    [PromptsConfig.PROMPT_FILES_SUGGEST_KEY]: {
      type: "object",
      scope: ConfigurationScope.RESOURCE,
      title: nls.localize(
        "chat.promptFilesRecommendations.title",
        "Prompt File Recommendations"
      ),
      markdownDescription: nls.localize(
        "chat.promptFilesRecommendations.description",
        "Configure which prompt files to recommend in the chat welcome view. Each key is a prompt file name, and the value can be `true` to always recommend, `false` to never recommend, or a [when clause](https://aka.ms/vscode-when-clause) expression like `resourceExtname == .js` or `resourceLangId == markdown`."
      ),
      default: {},
      additionalProperties: {
        oneOf: [
          { type: "boolean" },
          { type: "string" }
        ]
      },
      tags: ["prompts", "reusable prompts", "prompt snippets", "instructions"],
      examples: [
        {
          "plan": true,
          "a11y-audit": "resourceExtname == .html",
          "document": "resourceLangId == markdown"
        }
      ]
    },
    [ChatConfiguration.TodosShowWidget]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.tools.todos.showWidget", "Controls whether to show the todo list widget above the chat input. When enabled, the widget displays todo items created by the agent and updates as progress is made.")
    },
    [ChatConfiguration.ThinkingStyle]: {
      type: "string",
      default: "fixedScrolling",
      enum: ["collapsed", "collapsedPreview", "fixedScrolling"],
      enumDescriptions: [
        nls.localize("chat.agent.thinkingMode.collapsed", "Thinking parts will be collapsed by default."),
        nls.localize("chat.agent.thinkingMode.collapsedPreview", "Thinking parts will be expanded first, then collapse once we reach a part that is not thinking."),
        nls.localize("chat.agent.thinkingMode.fixedScrolling", "Show thinking in a fixed-height streaming panel that auto-scrolls; click header to expand to full height.")
      ],
      description: nls.localize("chat.agent.thinkingStyle", "Controls how thinking is rendered."),
      tags: ["experimental"]
    },
    [ChatConfiguration.ThinkingGenerateTitles]: {
      type: "boolean",
      default: true,
      description: nls.localize("chat.agent.thinking.generateTitles", "Controls whether to use an LLM to generate summary titles for thinking sections."),
      tags: ["experimental"]
    },
    "chat.agent.thinking.collapsedTools": {
      type: "string",
      default: "always",
      enum: ["off", "withThinking", "always"],
      enumDescriptions: [
        nls.localize("chat.agent.thinking.collapsedTools.off", "Tool calls are shown separately, not collapsed into thinking."),
        nls.localize("chat.agent.thinking.collapsedTools.withThinking", "Tool calls are collapsed into thinking sections when thinking is present."),
        nls.localize("chat.agent.thinking.collapsedTools.always", "Tool calls are always collapsed, even without thinking.")
      ],
      markdownDescription: nls.localize("chat.agent.thinking.collapsedTools", "Controls how tool calls are displayed in relation to thinking sections."),
      tags: ["experimental"]
    },
    [ChatConfiguration.TerminalToolsInThinking]: {
      type: "boolean",
      default: true,
      markdownDescription: nls.localize("chat.agent.thinking.terminalTools", "When enabled, terminal tool calls are displayed inside the thinking dropdown with a simplified view."),
      tags: ["experimental"]
    },
    [ChatConfiguration.SimpleTerminalCollapsible]: {
      type: "boolean",
      default: true,
      markdownDescription: nls.localize("chat.tools.terminal.simpleCollapsible", "When enabled, terminal tool calls are always displayed in a collapsible container with a simplified view."),
      tags: ["experimental"]
    },
    [ChatConfiguration.CompressOutputEnabled]: {
      type: "boolean",
      default: false,
      markdownDescription: nls.localize("chat.tools.compressOutput.enabled", "Post-process tool output (for example `git diff`, `ls -l`, or `npm install`) to reduce token usage before it is sent to the model."),
      tags: ["preview"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.ThinkingPhrases]: {
      type: "object",
      default: {
        mode: "append",
        phrases: []
      },
      properties: {
        mode: {
          type: "string",
          enum: ["replace", "append"],
          default: "append",
          description: nls.localize("chat.agent.thinking.phrases.mode", "'replace' replaces all default phrases entirely; 'append' adds your phrases to all default categories.")
        },
        phrases: {
          type: "array",
          items: { type: "string" },
          default: [],
          description: nls.localize("chat.agent.thinking.phrases.phrases", "Custom loading messages to show during thinking, working progress, terminal, and tool operations.")
        }
      },
      additionalProperties: false,
      markdownDescription: nls.localize("chat.agent.thinking.phrases", 'Customize the loading messages shown during agent thinking and progress indicators. Use `"mode": "replace"` to use only your phrases, or `"mode": "append"` to add them to the defaults.'),
      tags: ["experimental"]
    },
    [ChatConfiguration.AutoExpandToolFailures]: {
      type: "boolean",
      default: true,
      markdownDescription: nls.localize("chat.tools.autoExpandFailures", "When enabled, terminal tool failures are automatically expanded in the chat UI to show error details.")
    },
    [ChatAIDisabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.disableAIFeatures", "Disable and hide built-in AI features provided by GitHub Copilot, including chat and inline suggestions."),
      default: false,
      scope: ConfigurationScope.WINDOW
    },
    [ChatConfiguration.TitleBarSignInEnabled]: {
      type: "boolean",
      description: nls.localize("chat.titleBar.signIn.enabled", "Controls whether the Copilot Sign In button is shown in the title bar when signed out. When disabled, the Sign In affordance falls back to the status bar."),
      default: true
    },
    [ChatConfiguration.TitleBarOpenInAgentsWindowEnabled]: {
      type: "boolean",
      description: nls.localize("chat.titleBar.openInAgentsWindow.enabled", "Controls whether the Open in Agents Window button is shown in the title bar."),
      default: true
    },
    "chat.approvedAccountOrganizations": {
      type: "array",
      items: { type: "string" },
      description: nls.localize("chat.approvedAccountOrganizations", "List of GitHub organization logins whose members are permitted to use AI features. When set to a non-empty list, AI features are disabled until the user signs into a GitHub account that belongs to one of the specified organizations and account-level policy data has been resolved. Set to '*' to allow any authenticated GitHub or GitHub Enterprise account."),
      default: [],
      included: false,
      policy: {
        name: "ChatApprovedAccountOrganizations",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.118",
        localization: {
          description: {
            key: "chat.approvedAccountOrganizations.policy.description",
            value: nls.localize("chat.approvedAccountOrganizations.policy.description", "Setting this policy to a non-empty list activates the Approved Account gate: all AI features are disabled until the user signs into a GitHub account whose organizations intersect this list AND the account-side policy data has resolved. Comparison is case-insensitive. Use '*' as a wildcard to accept any signed-in GitHub or GHE account (use this for GHE deployments where the organization list is not surfaced).")
          }
        }
      }
    },
    "chat.allowAnonymousAccess": {
      // TODO@bpasero remove me eventually
      type: "boolean",
      description: nls.localize("chat.allowAnonymousAccess", "Controls whether anonymous access is allowed in chat."),
      default: false,
      included: false,
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.GrowthNotificationEnabled]: {
      type: "boolean",
      description: nls.localize("chat.growthNotification", "Controls whether to show a growth notification in the agent sessions view to encourage new users to try Copilot."),
      default: false,
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.RestoreLastPanelSession]: {
      type: "boolean",
      description: nls.localize("chat.restoreLastPanelSession", "Controls whether the last session is restored in panel after restart."),
      default: false
    },
    [ChatConfiguration.ExitAfterDelegation]: {
      type: "boolean",
      description: nls.localize("chat.exitAfterDelegation", "Controls whether the chat panel automatically exits after delegating a request to another session."),
      default: false,
      tags: ["preview"]
    },
    "chat.extensionUnification.enabled": {
      type: "boolean",
      description: nls.localize("chat.extensionUnification.enabled", "Enables the unification of GitHub Copilot extensions. When enabled, all GitHub Copilot functionality is served from the GitHub Copilot Chat extension. When disabled, the GitHub Copilot and GitHub Copilot Chat extensions operate independently."),
      default: true,
      tags: ["experimental"],
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.SubagentsAllowInvocationsFromSubagents]: {
      type: "boolean",
      description: nls.localize("chat.subagents.allowInvocationsFromSubagents", "Allow subagents to invoke subagents."),
      markdownDescription: nls.localize("chat.subagents.allowInvocationsFromSubagents.md", "Controls whether subagents can invoke other subagents. When enabled, nesting is limited to a maximum depth of 5."),
      default: false,
      experiment: {
        mode: "auto"
      }
    },
    [ChatConfiguration.CollectInstructionsInExtension]: {
      type: "boolean",
      description: nls.localize("chat.experimental.collectInstructionsInExtension", "When enabled, automatic instruction collection (.instructions.md, agent instructions, customizations index) is performed by the GitHub Copilot Chat extension instead of the core workbench."),
      default: false,
      tags: ["experimental"]
    },
    [ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: {
      type: "boolean",
      tags: ["preview"],
      description: nls.localize("chat.customizations.structuredPreview.enabled", "Controls whether the Chat Customizations editor shows a structured preview for markdown customization files (agents, skills, instructions, prompts). When disabled, the editor always opens the raw markdown in the embedded code editor."),
      default: false
    },
    [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: {
      type: "boolean",
      tags: ["experimental"],
      description: nls.localize("chat.customizations.promptMigration.enabled", "Controls whether the Chat Customizations editor shows the prompt file migration affordances for agent-host harnesses. When disabled, the migration card and sidebar shortcut are hidden."),
      default: false
    }
  }
});
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ChatEditor,
    ChatEditorInput.EditorID,
    nls.localize("chat", "Chat")
  ),
  [
    new SyncDescriptor(ChatEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    ChatDebugEditor,
    ChatDebugEditorInput.ID,
    nls.localize("chatDebug", "Debug View")
  ),
  [
    new SyncDescriptor(ChatDebugEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    AgentPluginEditor,
    AgentPluginEditor.ID,
    nls.localize("agentPlugin", "Agent Plugin")
  ),
  [
    new SyncDescriptor(AgentPluginEditorInput)
  ]
);
function isStringKeyedObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function migrateChatDefaultConfiguration(value) {
  if (!isStringKeyedObject(value) || value.approvals !== ChatPermissionLevel.AutoApprove) {
    return void 0;
  }
  return { ...value, approvals: ChatDefaultPermissionLevel.AllowAll };
}
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([
  {
    key: "chat.agentSessions.defaultConfiguration",
    migrateFn: (value, _accessor) => [
      ["chat.agentSessions.defaultConfiguration", { value: void 0 }],
      [ChatConfiguration.DefaultConfiguration, { value: migrateChatDefaultConfiguration(value) ?? value }]
    ]
  },
  {
    key: ChatConfiguration.DefaultConfiguration,
    migrateFn: (value) => ({ value: migrateChatDefaultConfiguration(value) ?? value })
  },
  {
    key: "chat.experimental.autoApprovals.enabled",
    migrateFn: (value, accessor) => {
      const pairs = [["chat.experimental.autoApprovals.enabled", { value: void 0 }]];
      if (accessor(ChatConfiguration.AssistedPermissionsEnabled) === void 0) {
        pairs.push([ChatConfiguration.AssistedPermissionsEnabled, { value }]);
      }
      return pairs;
    }
  },
  {
    key: "chat.experimental.detectParticipant.enabled",
    migrateFn: (value, _accessor) => [
      ["chat.experimental.detectParticipant.enabled", { value: void 0 }],
      ["chat.detectParticipant.enabled", { value: value !== false }]
    ]
  },
  {
    key: "chat.useCopilotModelsForUtilityModels",
    migrateFn: (value, valueAccessor) => {
      const result = [["chat.useCopilotModelsForUtilityModels", { value: void 0 }]];
      if (typeof value === "boolean" && valueAccessor(ChatConfiguration.BYOKUtilityModelDefault) === void 0) {
        result.push([ChatConfiguration.BYOKUtilityModelDefault, { value: value ? BYOKUtilityModelDefault.Copilot : BYOKUtilityModelDefault.None }]);
      }
      return result;
    }
  },
  {
    key: "chat.useClaudeSkills",
    migrateFn: (value, _accessor) => [
      ["chat.useClaudeSkills", { value: void 0 }],
      ["chat.useAgentSkills", { value }]
    ]
  },
  {
    key: mcpDiscoverySection,
    migrateFn: (value) => {
      if (typeof value === "boolean") {
        return { value: Object.fromEntries(allDiscoverySources.map((k) => [k, value])) };
      }
      return { value };
    }
  },
  {
    key: ChatConfiguration.NotifyWindowOnConfirmation,
    migrateFn: (value) => {
      if (value === true) {
        return { value: ChatNotificationMode.WindowNotFocused };
      } else if (value === false) {
        return { value: ChatNotificationMode.Off };
      }
      return [];
    }
  },
  {
    key: ChatConfiguration.NotifyWindowOnResponseReceived,
    migrateFn: (value) => {
      if (value === true) {
        return { value: ChatNotificationMode.WindowNotFocused };
      } else if (value === false) {
        return { value: ChatNotificationMode.Off };
      }
      return [];
    }
  },
  {
    key: "chat.plugins.paths",
    migrateFn: (value, _accessor) => [
      ["chat.plugins.paths", { value: void 0 }],
      [ChatConfiguration.PluginLocations, { value }]
    ]
  },
  {
    // The on-device dictation runtime moved to Foundry Local; the old
    // transformers.js/onnxruntime model IDs no longer resolve and would fail
    // with an unknown-model error. Map any explicitly-stored legacy value to
    // the new default so existing users keep working. Also migrate the setting
    // from its old `chat.speechToText.model` id to `dictation.model`.
    key: "chat.speechToText.model",
    migrateFn: (value, accessor) => {
      const legacyModelIds = [
        "onnx-community/whisper-tiny",
        "onnx-community/whisper-base",
        "onnx-community/whisper-small",
        "onnx-community/nemotron-3.5-asr-streaming-0.6b-onnx-int4",
        "nemotron-speech-streaming-en-0.6b"
      ];
      const migrated = typeof value === "string" && legacyModelIds.includes(value) ? DEFAULT_LOCAL_TRANSCRIPTION_MODEL : value;
      const pairs = [["chat.speechToText.model", { value: void 0 }]];
      if (accessor("dictation.model") === void 0) {
        pairs.push(["dictation.model", { value: migrated }]);
      }
      return pairs;
    }
  },
  {
    // Existing users may have the former English-only default stored
    // explicitly. Move them to the multilingual replacement as well.
    key: "dictation.model",
    migrateFn: (value) => ({
      value: value === "nemotron-speech-streaming-en-0.6b" ? DEFAULT_LOCAL_TRANSCRIPTION_MODEL : value
    })
  },
  {
    // Dictation settings were regrouped under the top-level `dictation.*`
    // namespace (they govern dictation across chat, editor, and terminal).
    key: "chat.speechToText.enabled",
    migrateFn: (value, accessor) => {
      const pairs = [["chat.speechToText.enabled", { value: void 0 }]];
      if (accessor("dictation.enabled") === void 0) {
        pairs.push(["dictation.enabled", { value }]);
      }
      return pairs;
    }
  },
  {
    // `chat.speechToText.mode` was removed (the shortcut is always tap-toggle /
    // hold-to-talk); clear it so it does not linger as an unknown setting.
    key: "chat.speechToText.mode",
    migrateFn: () => [["chat.speechToText.mode", { value: void 0 }]]
  }
]);
let ChatResolverContribution = class extends Disposable {
  constructor(chatSessionsService, editorResolverService, instantiationService) {
    super();
    this.editorResolverService = editorResolverService;
    this.instantiationService = instantiationService;
    this._editorRegistrations = this._register(new DisposableMap());
    this._registerEditor(Schemas.vscodeChatEditor);
    this._registerEditor(Schemas.vscodeLocalChatSession);
    this._register(chatSessionsService.onDidChangeContentProviderSchemes((e) => {
      for (const scheme of e.added) {
        this._registerEditor(scheme);
      }
      for (const scheme of e.removed) {
        this._editorRegistrations.deleteAndDispose(scheme);
      }
    }));
    for (const scheme of chatSessionsService.getContentProviderSchemes()) {
      this._registerEditor(scheme);
    }
  }
  _registerEditor(scheme) {
    this._editorRegistrations.set(scheme, this.editorResolverService.registerEditor(
      `${scheme}:**/**`,
      {
        id: ChatEditorInput.EditorID,
        label: nls.localize("chat", "Chat"),
        priority: RegisteredEditorPriority.builtin
      },
      {
        singlePerResource: true,
        canSupportResource: (resource) => resource.scheme === scheme
      },
      {
        createEditorInput: ({ resource, options }) => {
          return {
            editor: this.instantiationService.createInstance(ChatEditorInput, resource, options),
            options
          };
        }
      }
    ));
  }
};
ChatResolverContribution.ID = "workbench.contrib.chatResolver";
ChatResolverContribution = __decorateClass([
  __decorateParam(0, IChatSessionsService),
  __decorateParam(1, IEditorResolverService),
  __decorateParam(2, IInstantiationService)
], ChatResolverContribution);
let CopilotTelemetryContribution = class extends Disposable {
  constructor(telemetryService, chatEntitlementService) {
    super();
    this.telemetryService = telemetryService;
    this.chatEntitlementService = chatEntitlementService;
    this.updateCommonProperties();
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
      this.updateCommonProperties();
    }));
  }
  updateCommonProperties() {
    const copilotTrackingId = this.chatEntitlementService.copilotTrackingId;
    if (copilotTrackingId) {
      this.telemetryService.setCommonProperty("common.copilotTrackingId", copilotTrackingId);
    }
    if (this.chatEntitlementService.isInternal) {
      this.telemetryService.setCommonProperty("common.msftInternal", true);
    }
  }
};
CopilotTelemetryContribution.ID = "workbench.contrib.copilotTelemetry";
CopilotTelemetryContribution = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, IChatEntitlementService)
], CopilotTelemetryContribution);
let ChatDebugResolverContribution = class {
  constructor(editorResolverService) {
    editorResolverService.registerEditor(
      `${ChatDebugEditorInput.RESOURCE.scheme}:**/**`,
      {
        id: ChatDebugEditorInput.ID,
        label: nls.localize("chatDebug", "Debug View"),
        priority: RegisteredEditorPriority.exclusive
      },
      {
        singlePerResource: true,
        canSupportResource: (resource) => resource.scheme === ChatDebugEditorInput.RESOURCE.scheme
      },
      {
        createEditorInput: () => {
          return {
            editor: ChatDebugEditorInput.instance,
            options: { pinned: true }
          };
        }
      }
    );
  }
};
ChatDebugResolverContribution.ID = "workbench.contrib.chatDebugResolver";
ChatDebugResolverContribution = __decorateClass([
  __decorateParam(0, IEditorResolverService)
], ChatDebugResolverContribution);
let ChatAgentSettingContribution = class extends Disposable {
  constructor(experimentService, entitlementService, contextKeyService) {
    super();
    this.experimentService = experimentService;
    this.entitlementService = entitlementService;
    this.contextKeyService = contextKeyService;
    this.newChatButtonExperimentIcon = ChatContextKeys.newChatButtonExperimentIcon.bindTo(this.contextKeyService);
    this.registerMaxRequestsSetting();
    this.registerNewChatButtonIcon();
    this.registerDefaultModeSetting();
  }
  registerMaxRequestsSetting() {
    let lastNode;
    const registerMaxRequestsSetting = () => {
      const treatmentId = this.entitlementService.entitlement === ChatEntitlement.Free ? "chatAgentMaxRequestsFree" : "chatAgentMaxRequestsPro";
      this.experimentService.getTreatment(treatmentId).then((value) => {
        const node = {
          id: "chatSidebar",
          title: nls.localize("interactiveSessionConfigurationTitle", "Chat"),
          type: "object",
          properties: {
            "chat.agent.maxRequests": {
              type: "number",
              markdownDescription: nls.localize("chat.agent.maxRequests", "The maximum number of requests to allow per-turn when using an agent. When the limit is reached, will ask to confirm to continue."),
              default: value ?? 50,
              order: 2,
              agentsWindow: { default: 1e3 }
            }
          }
        };
        configurationRegistry.updateConfigurations({ remove: lastNode ? [lastNode] : [], add: [node] });
        lastNode = node;
      });
    };
    this._register(Event.runAndSubscribe(Event.debounce(this.entitlementService.onDidChangeEntitlement, () => {
    }, 1e3), () => registerMaxRequestsSetting()));
  }
  registerNewChatButtonIcon() {
    this.experimentService.getTreatment("chatNewButtonIcon").then((value) => {
      const supportedValues = ["copilot", "new-session", "comment"];
      if (typeof value === "string" && supportedValues.includes(value)) {
        this.newChatButtonExperimentIcon.set(value);
      } else {
        this.newChatButtonExperimentIcon.reset();
      }
    });
  }
  registerDefaultModeSetting() {
    this.experimentService.getTreatment("chatDefaultNewSessionMode").then((value) => {
      const node = {
        id: "chatSidebar",
        title: nls.localize("interactiveSessionConfigurationTitle", "Chat"),
        type: "object",
        properties: {
          [ChatConfiguration.DefaultNewSessionMode]: {
            type: "string",
            description: nls.localize("chat.newSession.defaultMode", "The default mode for new chat sessions. When empty, the chat view's default mode is used."),
            default: typeof value === "string" ? value : ""
          }
        }
      };
      configurationRegistry.updateConfigurations({ add: [node], remove: [] });
    });
  }
};
ChatAgentSettingContribution.ID = "workbench.contrib.chatAgentSetting";
ChatAgentSettingContribution = __decorateClass([
  __decorateParam(0, IWorkbenchAssignmentService),
  __decorateParam(1, IChatEntitlementService),
  __decorateParam(2, IContextKeyService)
], ChatAgentSettingContribution);
let ChatForegroundSessionCountContribution = class extends Disposable {
  constructor(contextKeyService, chatWidgetService, viewsService) {
    super();
    this.contextKeyService = contextKeyService;
    this.chatWidgetService = chatWidgetService;
    this.viewsService = viewsService;
    this.foregroundSessionCountContextKey = ChatContextKeys.foregroundSessionCount.bindTo(this.contextKeyService);
    this._register(this.chatWidgetService.onDidAddWidget(() => {
      this.updateForegroundSessionCount();
    }));
    this._register(this.chatWidgetService.onDidChangeWidgetVisibility(() => {
      this.updateForegroundSessionCount();
    }));
    this._register(Event.filter(this.viewsService.onDidChangeViewVisibility, (e) => e.id === ChatViewId)(() => {
      this.updateForegroundSessionCount();
    }));
    this.updateForegroundSessionCount();
  }
  updateForegroundSessionCount() {
    let count = this.viewsService.isViewVisible(ChatViewId) ? 1 : 0;
    for (const widget of this.chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)) {
      if (!widget.visible) {
        continue;
      }
      if (isIChatViewViewContext(widget.viewContext)) {
        continue;
      }
      if (isIChatResourceViewContext(widget.viewContext) && widget.viewContext.isQuickChat) {
        continue;
      }
      count++;
    }
    this.foregroundSessionCountContextKey.set(count);
  }
};
ChatForegroundSessionCountContribution.ID = "workbench.contrib.chatForegroundSessionCount";
ChatForegroundSessionCountContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IViewsService)
], ChatForegroundSessionCountContribution);
function getCustomModesWithUniqueNames(builtinModes, customModes) {
  const customModeIds = /* @__PURE__ */ new Set();
  const builtinNames = new Set(builtinModes.map((mode) => mode.name.get()));
  const customNameToId = /* @__PURE__ */ new Map();
  for (const mode of customModes) {
    const modeName = mode.name.get();
    if (builtinNames.has(modeName)) {
      continue;
    }
    const existingId = customNameToId.get(modeName);
    if (existingId) {
      customModeIds.delete(existingId);
    }
    customNameToId.set(modeName, mode.id);
    customModeIds.add(mode.id);
  }
  return customModeIds;
}
let ChatAgentActionsContribution = class extends Disposable {
  constructor(_chatModeService, chatWidgetService) {
    super();
    this.chatWidgetService = chatWidgetService;
    this._modeActionDisposables = new DisposableMap();
    this._store.add(this._modeActionDisposables);
    const focusedWidget = observableFromEvent(this, this.chatWidgetService.onDidChangeFocusedSession, () => this.chatWidgetService.lastFocusedWidget);
    this._register(autorun((reader) => {
      const chatModes = focusedWidget.read(reader)?.input.currentChatModesObs.read(reader);
      this._syncModeActions(chatModes);
    }));
  }
  _syncModeActions(chatModes) {
    if (!chatModes) {
      this._modeActionDisposables.clearAndDisposeAll();
      return;
    }
    const { builtin, custom } = chatModes;
    const currentModeIds = getCustomModesWithUniqueNames(builtin, custom);
    for (const modeId of this._modeActionDisposables.keys()) {
      if (!currentModeIds.has(modeId)) {
        this._modeActionDisposables.deleteAndDispose(modeId);
      }
    }
    for (const mode of custom) {
      if (currentModeIds.has(mode.id) && !this._modeActionDisposables.has(mode.id)) {
        this._registerModeAction(mode);
      }
    }
  }
  _registerModeAction(mode) {
    const actionClass = class extends ModeOpenChatGlobalAction {
      constructor() {
        super(mode);
      }
    };
    this._modeActionDisposables.set(mode.id, registerAction2(actionClass));
  }
};
ChatAgentActionsContribution.ID = "workbench.contrib.chatAgentActions";
ChatAgentActionsContribution = __decorateClass([
  __decorateParam(0, IChatModeService),
  __decorateParam(1, IChatWidgetService)
], ChatAgentActionsContribution);
let HookSchemaAssociationContribution = class extends Disposable {
  constructor(_configurationService, _pathService) {
    super();
    this._configurationService = _configurationService;
    this._pathService = _pathService;
    this._registrations = this._register(new DisposableStore());
    this._updateAssociations();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(PromptsConfig.HOOKS_LOCATION_KEY)) {
        this._updateAssociations();
      }
    }));
  }
  async _updateAssociations() {
    this._registrations.clear();
    const folders = PromptsConfig.promptSourceFolders(this._configurationService, PromptsType.hook);
    const userHomeUri = await this._pathService.userHome();
    const userHome = userHomeUri.fsPath ?? userHomeUri.path;
    for (const folder of folders) {
      if (folder.source === PromptFileSource.ClaudeWorkspace || folder.source === PromptFileSource.ClaudeWorkspaceLocal || folder.source === PromptFileSource.ClaudePersonal) {
        continue;
      }
      const resolvedPath = isTildePath(folder.path) ? userHome + folder.path.substring(1) : folder.path;
      const glob = resolvedPath.toLowerCase().endsWith(".json") ? resolvedPath : `${resolvedPath}/*.json`;
      this._registrations.add(
        jsonContributionRegistry.registerSchemaAssociation(HOOK_SCHEMA_URI, glob)
      );
    }
  }
};
HookSchemaAssociationContribution.ID = "workbench.contrib.hookSchemaAssociation";
HookSchemaAssociationContribution = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IPathService)
], HookSchemaAssociationContribution);
let ToolReferenceNamesContribution = class extends Disposable {
  constructor(_languageModelToolsService) {
    super();
    this._languageModelToolsService = _languageModelToolsService;
    this._updateToolReferenceNames();
    this._register(this._languageModelToolsService.onDidChangeTools(() => this._updateToolReferenceNames()));
  }
  _updateToolReferenceNames() {
    const tools = Array.from(this._languageModelToolsService.getAllToolsIncludingDisabled()).filter((tool) => typeof tool.toolReferenceName === "string").sort((a, b) => a.toolReferenceName.localeCompare(b.toolReferenceName));
    toolReferenceNameEnumValues.length = 0;
    toolReferenceNameEnumDescriptions.length = 0;
    for (const tool of tools) {
      toolReferenceNameEnumValues.push(tool.toolReferenceName);
      toolReferenceNameEnumDescriptions.push(nls.localize(
        "chat.toolReferenceName.description",
        "{0} - {1}",
        tool.toolReferenceName,
        tool.userDescription || tool.displayName
      ));
    }
    configurationRegistry.notifyConfigurationSchemaUpdated({
      id: "chatSidebar",
      properties: {
        [ChatConfiguration.EligibleForAutoApproval]: {}
      }
    });
  }
};
ToolReferenceNamesContribution.ID = "workbench.contrib.toolReferenceNames";
ToolReferenceNamesContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService)
], ToolReferenceNamesContribution);
let ChatSpeechToTextInitContribution = class {
  constructor(_chatSpeechToTextService) {
  }
};
ChatSpeechToTextInitContribution.ID = "workbench.contrib.chatSpeechToTextInit";
ChatSpeechToTextInitContribution = __decorateClass([
  __decorateParam(0, IChatSpeechToTextService)
], ChatSpeechToTextInitContribution);
AccessibleViewRegistry.register(new ChatTerminalOutputAccessibleView());
AccessibleViewRegistry.register(new ChatResponseAccessibleView());
AccessibleViewRegistry.register(new PanelChatAccessibilityHelp());
AccessibleViewRegistry.register(new QuickChatAccessibilityHelp());
AccessibleViewRegistry.register(new EditsChatAccessibilityHelp());
AccessibleViewRegistry.register(new AgentChatAccessibilityHelp());
registerEditorFeature(ChatInputBoxContentProvider);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(ChatDebugEditorInput.ID, ChatDebugEditorInputSerializer);
registerWorkbenchContribution2(CopilotTelemetryContribution.ID, CopilotTelemetryContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatSpeechToTextInitContribution.ID, ChatSpeechToTextInitContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatDebugResolverContribution.ID, ChatDebugResolverContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(PromptsDebugContribution.ID, PromptsDebugContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(AgentHostChatDebugContribution.ID, AgentHostChatDebugContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatLanguageModelsDataContribution.ID, ChatLanguageModelsDataContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatSlashCommandsContribution.ID, ChatSlashCommandsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatSessionOptionSlashCommandsContribution.ID, ChatSessionOptionSlashCommandsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatOutlineCreator.ID, ChatOutlineCreator, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatExtensionPointHandler.ID, ChatExtensionPointHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(LanguageModelToolsExtensionPointHandler.ID, LanguageModelToolsExtensionPointHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatPromptFilesExtensionPointHandler.ID, ChatPromptFilesExtensionPointHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatCompatibilityNotifier.ID, ChatCompatibilityNotifier, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(CodeBlockActionRendering.ID, CodeBlockActionRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatCopyActionRendering.ID, ChatCopyActionRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatImplicitContextContribution.ID, ChatImplicitContextContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatViewsWelcomeHandler.ID, ChatViewsWelcomeHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatGettingStartedContribution.ID, ChatGettingStartedContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatSetupContribution.ID, ChatSetupContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatQuotaNotificationContribution.ID, ChatQuotaNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatPromoNotificationContribution.ID, ChatPromoNotificationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(HasByokModelsContribution.ID, HasByokModelsContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatTeardownContribution.ID, ChatTeardownContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatStatusBarEntry.ID, ChatStatusBarEntry, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(BuiltinToolsContribution.ID, BuiltinToolsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ClientToolSetsContribution.ID, ClientToolSetsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(UsagesToolContribution.ID, UsagesToolContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(RenameToolContribution.ID, RenameToolContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatAgentSettingContribution.ID, ChatAgentSettingContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatForegroundSessionCountContribution.ID, ChatForegroundSessionCountContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatAgentActionsContribution.ID, ChatAgentActionsContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(HookSchemaAssociationContribution.ID, HookSchemaAssociationContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ToolReferenceNamesContribution.ID, ToolReferenceNamesContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatAgentRecommendation.ID, ChatAgentRecommendation, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatEditingEditorAccessibility.ID, ChatEditingEditorAccessibility, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatQueuePickerRendering.ID, ChatQueuePickerRendering, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatEditingEditorOverlay.ID, ChatEditingEditorOverlay, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatEditingEditorContextKeys.ID, ChatEditingEditorContextKeys, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatTransferContribution.ID, ChatTransferContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatContextContributions.ID, ChatContextContributions, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(PromptUrlHandler.ID, PromptUrlHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(PluginUrlHandler.ID, PluginUrlHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ChatEditingNotebookFileSystemProviderContrib.ID, ChatEditingNotebookFileSystemProviderContrib, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(ChatResponseResourceWorkbenchContribution.ID, ChatResponseResourceWorkbenchContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(UserToolSetsContributions.ID, UserToolSetsContributions, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(PromptLanguageFeaturesProvider.ID, PromptLanguageFeaturesProvider, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatWindowNotifier.ID, ChatWindowNotifier, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatRepoInfoContribution.ID, ChatRepoInfoContribution, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(AgentPluginRecommendations.ID, AgentPluginRecommendations, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(PluginAutoUpdate.ID, PluginAutoUpdate, WorkbenchPhase.Eventually);
registerWorkbenchContribution2(ChatReferenceAttachmentWidgetContribution.ID, ChatReferenceAttachmentWidgetContribution, WorkbenchPhase.AfterRestored);
registerChatActions();
registerChatAccessibilityActions();
registerChatCopyActions();
registerChatOpenAgentDebugPanelAction();
registerChatCodeBlockActions();
registerChatCodeCompareBlockActions();
registerChatFileTreeActions();
registerChatPromptNavigationActions();
registerChatTitleActions();
registerChatExecuteActions();
registerAction2(ChatVoiceInputModeAction);
registerAction2(ChatVoiceInputModeToggleListenAction);
registerVoiceInputModeSimulateActions();
registerChatSpeechToTextActions();
registerConfigureSpeechInstructionsActions();
registerChatQueueActions();
registerQuickChatActions();
registerChatExportActions();
registerMoveActions();
registerNewChatActions();
registerChatContextActions();
registerChatDeveloperActions();
registerChatEditorActions();
registerChatElicitationActions();
registerChatToolActions();
registerLanguageModelActions();
registerChatPluginActions();
registerAction2(ConfigureToolSets);
registerEditorFeature(ChatPasteProvidersFeature);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(ConfiguredAgentPluginDiscovery), AgentPluginDiscoveryPriority.Configured);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(MarketplaceAgentPluginDiscovery), AgentPluginDiscoveryPriority.Marketplace);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(ExtensionAgentPluginDiscovery), AgentPluginDiscoveryPriority.Extension);
agentPluginDiscoveryRegistry.register(new SyncDescriptor(CopilotCliAgentPluginDiscovery), AgentPluginDiscoveryPriority.CopilotCli);
registerSingleton(IChatResponseResourceFileSystemProvider, ChatResponseResourceFileSystemProvider, InstantiationType.Delayed);
registerSingleton(IChatSpeechToTextService, ChatSpeechToTextService, InstantiationType.Eager);
registerSingleton(IChatTransferService, ChatTransferService, InstantiationType.Delayed);
registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IChatSideChatService, ChatSideChatService, InstantiationType.Delayed);
registerSingleton(IChatPetService, ChatPetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsConfigurationService, LanguageModelsConfigurationService, InstantiationType.Delayed);
registerSingleton(ILanguageModelsService, LanguageModelsService, InstantiationType.Delayed);
registerSingleton(ILanguageModelStatsService, LanguageModelStatsService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatAgentNameService, ChatAgentNameService, InstantiationType.Delayed);
registerSingleton(IChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
registerSingleton(IAgentPluginService, AgentPluginService, InstantiationType.Delayed);
registerSingleton(IPluginMarketplaceService, PluginMarketplaceService, InstantiationType.Delayed);
registerSingleton(IWorkspacePluginSettingsService, WorkspacePluginSettingsService, InstantiationType.Delayed);
registerSingleton(IAgentPluginRepositoryService, AgentPluginRepositoryService, InstantiationType.Delayed);
registerSingleton(IPluginGitService, BrowserPluginGitCommandService, InstantiationType.Delayed);
registerSingleton(IPluginInstallService, PluginInstallService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsService, LanguageModelToolsService, InstantiationType.Delayed);
registerSingleton(IToolResultCompressor, ToolResultCompressorService, InstantiationType.Delayed);
registerSingleton(ILanguageModelToolsConfirmationService, LanguageModelToolsConfirmationService, InstantiationType.Delayed);
registerSingleton(IChatToolRiskAssessmentService, ChatToolRiskAssessmentService, InstantiationType.Delayed);
registerSingleton(IChatGoalSummaryService, ChatGoalSummaryService, InstantiationType.Delayed);
registerSingleton(IChatResponseFileChangesService, ChatResponseFileChangesService, InstantiationType.Delayed);
registerSingleton(IChatSubmitRequestHandlerService, ChatSubmitRequestHandlerService, InstantiationType.Delayed);
registerSingleton(IVoiceChatService, VoiceChatService, InstantiationType.Delayed);
registerSingleton(IChatCodeBlockContextProviderService, ChatCodeBlockContextProviderService, InstantiationType.Delayed);
registerSingleton(ICodeMapperService, CodeMapperService, InstantiationType.Delayed);
registerSingleton(IChatEditingService, ChatEditingService, InstantiationType.Delayed);
registerSingleton(IChatMarkdownAnchorService, ChatMarkdownAnchorService, InstantiationType.Delayed);
registerSingleton(IAgentNetworkFilterService, AgentNetworkFilterService, InstantiationType.Delayed);
registerSingleton(ILanguageModelIgnoredFilesService, LanguageModelIgnoredFilesService, InstantiationType.Delayed);
registerSingleton(IPromptsService, PromptsService, InstantiationType.Delayed);
registerSingleton(IChatContextPickService, ChatContextPickService, InstantiationType.Delayed);
registerSingleton(IChatModeService, ChatModeService, InstantiationType.Delayed);
registerSingleton(IChatAttachmentResolveService, ChatAttachmentResolveService, InstantiationType.Delayed);
registerSingleton(IChatAttachmentWidgetRegistry, ChatAttachmentWidgetRegistry, InstantiationType.Delayed);
registerSingleton(IChatTodoListService, ChatTodoListService, InstantiationType.Delayed);
registerSingleton(IChatArtifactsService, ChatArtifactsService, InstantiationType.Delayed);
registerSingleton(IChatOutputRendererService, ChatOutputRendererService, InstantiationType.Delayed);
registerSingleton(IChatLayoutService, ChatLayoutService, InstantiationType.Delayed);
registerSingleton(IPlanReviewFeedbackService, PlanReviewFeedbackService, InstantiationType.Delayed);
registerSingleton(IChatTipService, ChatTipService, InstantiationType.Delayed);
registerSingleton(IChatDebugService, ChatDebugServiceImpl, InstantiationType.Delayed);
registerSingleton(IChatImageCarouselService, ChatImageCarouselService, InstantiationType.Delayed);
registerSingleton(IAgentHostImportConversationStore, AgentHostImportConversationStore, InstantiationType.Delayed);
ChatWidget.CONTRIBS.push(ChatDynamicVariableModel);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LnNoYXJlZC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9icm93c2VyL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTdGFydGVyLmNvbmZpZy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkLCBBZ2VudEhvc3RTZGtTYW5kYm94RW5hYmxlZFNldHRpbmdJZCwgQ2xhdWRlUHJlZmVyQWdlbnRIb3N0QWdlbnRzU2V0dGluZ0lkLCBDbGF1ZGVQcmVmZXJBZ2VudEhvc3RFZGl0b3JTZXR0aW5nSWQsIENvZGV4UHJlZmVyQWdlbnRIb3N0RWRpdG9yU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29waWxvdFNka0xvZ0xldmVsU2V0dGluZ0lkLCBBZ2VudEhvc3RDdXN0b21UZXJtaW5hbFRvb2xFbmFibGVkU2V0dGluZ0lkLCBBZ2VudEhvc3RNb2RlbENhcGFiaWxpdHlPdmVycmlkZXNTZXR0aW5nSWQsIEFnZW50SG9zdE9wdXM0OFByb21wdEVuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdFJlYXNvbmluZ0VmZm9ydE92ZXJyaWRlU2V0dGluZ0lkLCBBZ2VudEhvc3RUb29sU2VhcmNoRGVmZXJUaHJlc2hvbGRTZXR0aW5nSWQsIEFnZW50SG9zdFRvb2xTZWFyY2hFbmFibGVkU2V0dGluZ0lkLCBjb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nVmFsdWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jb3BpbG90Q2xpQ29uZmlnLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTE9DQUxfVFJBTlNDUklQVElPTl9NT0RFTCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvY2FsVHJhbnNjcmlwdGlvbi9jb21tb24vbG9jYWxUcmFuc2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsIElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vc2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9BTExPV0VEX01DUF9TRVJWRVJTX0tFWSwgQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHLCBDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9LRVksIENPUElMT1RfQUxMT1dfTUFOQUdFRF9NQ1BfU0VSVkVSU19PTkxZX0NPTkZJRywgQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfS0VZLCBDT1BJTE9UX0RFTklFRF9NQ1BfU0VSVkVSU19LRVksIENPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVksIENPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWSwgQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZLCBDT1BJTE9UX01PREVMX0tFWSwgQ09QSUxPVF9TVFJJQ1RfTUFSS0VUUExBQ0VTX0tFWSwgQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcsIENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fS0VZLCBtYW5hZ2VkTW9kZWxWYWx1ZSwgbWFuYWdlZFNldHRpbmdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3BvbGljeS9jb21tb24vY29waWxvdE1hbmFnZWRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUsIEFnZW50U2FuZGJveFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NhbmRib3gvY29tbW9uL3NldHRpbmdzLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmdTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jaGF0L2NvbW1vbi9zZXNzaW9uQXJjaGl2ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJFZGl0b3JGZWF0dXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JGZWF0dXJlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlLCBJQ29uZmlndXJhdGlvbk5vZGUsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTWNwQWNjZXNzVmFsdWUsIE1jcEF1dG9TdGFydFZhbHVlLCBtY3BBY2Nlc3NDb25maWcsIG1jcEFsbG93ZWRTZXJ2ZXJzQ29uZmlnLCBtY3BBdXRvU3RhcnRDb25maWcsIG1jcERlbmllZFNlcnZlcnNDb25maWcsIG1jcEdhbGxlcnlTZXJ2aWNlRW5hYmxlbWVudENvbmZpZywgbWNwR2FsbGVyeVNlcnZpY2VVcmxDb25maWcsIG1jcEFwcHNFbmFibGVkQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BNYW5hZ2VtZW50LmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZURlc2NyaXB0b3IsIElFZGl0b3JQYW5lUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyB0eXBlIENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9ucywgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSwgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWRkQ29uZmlndXJhdGlvblR5cGUsIEFzc2lzdGVkVHlwZXMgfSBmcm9tICcuLi8uLi9tY3AvYnJvd3Nlci9tY3BDb21tYW5kc0FkZENvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgYWxsRGlzY292ZXJ5U291cmNlcywgZGlzY292ZXJ5U291cmNlU2V0dGluZ3NMYWJlbCwgTWNwQ29sbGlzaW9uQmVoYXZpb3IsIG1jcERpc2NvdmVyeVNlY3Rpb24sIG1jcEVudGVycHJpc2VNYW5hZ2VkQXV0aElkcFNlY3Rpb24sIG1jcFNlcnZlckNvbGxpc2lvbkJlaGF2aW9yU2VjdGlvbiwgbWNwU2VydmVyU2FtcGxpbmdTZWN0aW9uIH0gZnJvbSAnLi4vLi4vbWNwL2NvbW1vbi9tY3BDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudE5hbWVTZXJ2aWNlLCBDaGF0QWdlbnRTZXJ2aWNlLCBJQ2hhdEFnZW50TmFtZVNlcnZpY2UsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENvZGVNYXBwZXJTZXJ2aWNlLCBJQ29kZU1hcHBlclNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZWRpdGluZy9jaGF0Q29kZU1hcHBlclNlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi9jb21tb24vd2lkZ2V0L2NoYXRDb2xvcnMuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdExheW91dFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vd2lkZ2V0L2NoYXRMYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlU2VydmljZSwgSUNoYXRNb2RlLCBJQ2hhdE1vZGVTZXJ2aWNlLCBJQ2hhdE1vZGVzIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VSZXNvdXJjZUZpbGVTeXN0ZW1Qcm92aWRlciwgQ2hhdFJlc3BvbnNlUmVzb3VyY2VXb3JrYmVuY2hDb250cmlidXRpb24sIElDaGF0UmVzcG9uc2VSZXNvdXJjZUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uL2NvbW1vbi93aWRnZXQvY2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTaWRlQ2hhdFNlcnZpY2UsIElDaGF0U2lkZUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTaWRlQ2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIElDaGF0U2xhc2hDb21tYW5kU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdFNsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ2hhdEFydGlmYWN0c1NlcnZpY2UsIElDaGF0QXJ0aWZhY3RzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90b29scy9jaGF0QXJ0aWZhY3RzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0VG9kb0xpc3RTZXJ2aWNlLCBJQ2hhdFRvZG9MaXN0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90b29scy9jaGF0VG9kb0xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUcmFuc2ZlclNlcnZpY2UsIElDaGF0VHJhbnNmZXJTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL21vZGVsL2NoYXRUcmFuc2ZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRWYXJpYWJsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3dpZGdldC9jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQllPS1V0aWxpdHlNb2RlbERlZmF1bHQsIENoYXRBSURpc2FibGVkU2V0dGluZ0lkLCBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLCBDaGF0Tm90aWZpY2F0aW9uTW9kZSwgQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlLCBMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9pZ25vcmVkRmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsU3RhdHNTZXJ2aWNlLCBMYW5ndWFnZU1vZGVsU3RhdHNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxTdGF0cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsIElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSB9IGZyb20gJy4vdG9vbHMvY2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSwgSUNoYXRHb2FsU3VtbWFyeVNlcnZpY2UgfSBmcm9tICcuL2NoYXRHb2FsU3VtbWFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLCBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSwgSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UgfSBmcm9tICcuL2NoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRQbHVnaW5EaXNjb3ZlcnlQcmlvcml0eSwgYWdlbnRQbHVnaW5EaXNjb3ZlcnlSZWdpc3RyeSwgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UHJvbXB0RmlsZXNFeHRlbnNpb25Qb2ludEhhbmRsZXIgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L2NoYXRQcm9tcHRGaWxlc0NvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBpc1RpbGRlUGF0aCwgUHJvbXB0c0NvbmZpZyB9IGZyb20gJy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL2NvbmZpZy5qcyc7XG5pbXBvcnQgeyBJTlNUUlVDVElPTlNfREVGQVVMVF9TT1VSQ0VfRk9MREVSLCBJTlNUUlVDVElPTl9GSUxFX0VYVEVOU0lPTiwgTEVHQUNZX01PREVfREVGQVVMVF9TT1VSQ0VfRk9MREVSLCBMRUdBQ1lfTU9ERV9GSUxFX0VYVEVOU0lPTiwgUFJPTVBUX0RFRkFVTFRfU09VUkNFX0ZPTERFUiwgUFJPTVBUX0ZJTEVfRVhURU5TSU9OLCBERUZBVUxUX1NLSUxMX1NPVVJDRV9GT0xERVJTLCBBR0VOVFNfU09VUkNFX0ZPTERFUiwgQUdFTlRfRklMRV9FWFRFTlNJT04sIFNLSUxMX0ZJTEVOQU1FLCBDTEFVREVfQUdFTlRTX1NPVVJDRV9GT0xERVIsIERFRkFVTFRfSE9PS19GSUxFX1BBVEhTLCBERUZBVUxUX0lOU1RSVUNUSU9OU19TT1VSQ0VfRk9MREVSUywgQ09QSUxPVF9VU0VSX0FHRU5UU19TT1VSQ0VfRk9MREVSIH0gZnJvbSAnLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRMYW5ndWFnZUZlYXR1cmVzUHJvdmlkZXIgfSBmcm9tICcuL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlQ29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9ET0NVTUVOVEFUSU9OX1VSTCwgSU5TVFJVQ1RJT05TX0RPQ1VNRU5UQVRJT05fVVJMLCBQUk9NUFRfRE9DVU1FTlRBVElPTl9VUkwsIFNLSUxMX0RPQ1VNRU5UQVRJT05fVVJMLCBIT09LX0RPQ1VNRU5UQVRJT05fVVJMLCBQcm9tcHRzVHlwZSwgUHJvbXB0RmlsZVNvdXJjZSwgQWdlbnRIb3N0QWdlbnREZWJ1Z0xvZ0VuYWJsZWRTZXR0aW5nSWQsIEFnZW50SG9zdEFnZW50RGVidWdMb2dNYXhFdmVudHNTZXR0aW5nSWQgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IGhvb2tGaWxlU2NoZW1hLCBIT09LX1NDSEVNQV9VUkkgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zLCBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc0V4dGVuc2lvblBvaW50SGFuZGxlciB9IGZyb20gJy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgQ2xpZW50VG9vbFNldHNDb250cmlidXRpb24gfSBmcm9tICcuL3Rvb2xzL2NsaWVudFRvb2xTZXRzQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAnLi90ZWxlbWV0cnkvY2hhdE1vZGVsQ291bnRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQnVpbHRpblRvb2xzQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy90b29scy5qcyc7XG5pbXBvcnQgeyBSZW5hbWVUb29sQ29udHJpYnV0aW9uIH0gZnJvbSAnLi90b29scy9yZW5hbWVUb29sLmpzJztcbmltcG9ydCB7IFVzYWdlc1Rvb2xDb250cmlidXRpb24gfSBmcm9tICcuL3Rvb2xzL3VzYWdlc1Rvb2wuanMnO1xuaW1wb3J0IHsgSVZvaWNlQ2hhdFNlcnZpY2UsIFZvaWNlQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdm9pY2VDaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgJy4vdm9pY2VDbGllbnQvdm9pY2VDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgJy4vdm9pY2VDbGllbnQvdHRzUGxheWJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi92b2ljZUNsaWVudC92b2ljZVRvb2xEaXNwYXRjaFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0QWNjZXNzaWJpbGl0eUFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdEFjY2Vzc2liaWxpdHlBY3Rpb25zLmpzJztcbmltcG9ydCB7IEFnZW50Q2hhdEFjY2Vzc2liaWxpdHlIZWxwLCBFZGl0c0NoYXRBY2Nlc3NpYmlsaXR5SGVscCwgUGFuZWxDaGF0QWNjZXNzaWJpbGl0eUhlbHAsIFF1aWNrQ2hhdEFjY2Vzc2liaWxpdHlIZWxwIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5pbXBvcnQgeyBNb2RlT3BlbkNoYXRHbG9iYWxBY3Rpb24sIHJlZ2lzdGVyQ2hhdEFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kZUJsb2NrQWN0aW9uUmVuZGVyaW5nLCByZWdpc3RlckNoYXRDb2RlQmxvY2tBY3Rpb25zLCByZWdpc3RlckNoYXRDb2RlQ29tcGFyZUJsb2NrQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0Q29kZWJsb2NrQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dENvbnRyaWJ1dGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdENvbnRleHQuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0Q29udGV4dEFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdENvbnRleHRBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb3B5QWN0aW9uUmVuZGVyaW5nLCByZWdpc3RlckNoYXRDb3B5QWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0Q29weUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0RGV2ZWxvcGVyQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0RGV2ZWxvcGVyQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRFeGVjdXRlQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFZvaWNlSW5wdXRNb2RlQWN0aW9uLCBDaGF0Vm9pY2VJbnB1dE1vZGVUb2dnbGVMaXN0ZW5BY3Rpb24sIHJlZ2lzdGVyVm9pY2VJbnB1dE1vZGVTaW11bGF0ZUFjdGlvbnMgfSBmcm9tICcuL3ZvaWNlSW5wdXRNb2RlL3ZvaWNlSW5wdXRNb2RlQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0ICcuL3ZvaWNlSW5wdXRNb2RlL3ZvaWNlSW5wdXRNb2RlLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdFNwZWVjaFRvVGV4dEFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdFNwZWVjaFRvVGV4dEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ09ORklHVVJFX0RJQ1RBVElPTl9JTlNUUlVDVElPTlNfQUNUSU9OX0lELCByZWdpc3RlckNvbmZpZ3VyZVNwZWVjaEluc3RydWN0aW9uc0FjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY29uZmlndXJlVm9pY2VJbnN0cnVjdGlvbnNBY3Rpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIERpY3RhdGlvblNldHRpbmdJZCwgSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIH0gZnJvbSAnLi9zcGVlY2hUb1RleHQvY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0RmlsZVRyZWVBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRGaWxlVHJlZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdEdldHRpbmdTdGFydGVkQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRHZXR0aW5nU3RhcnRlZC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRFeHBvcnRBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRJbXBvcnRFeHBvcnQuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJMYW5ndWFnZU1vZGVsQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0TGFuZ3VhZ2VNb2RlbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDaGF0UGx1Z2luQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0UGx1Z2luQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck1vdmVBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRNb3ZlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlck5ld0NoYXRBY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXROZXdBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdFByb21wdE5hdmlnYXRpb25BY3Rpb25zIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRQcm9tcHROYXZpZ2F0aW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRRdWV1ZUFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdFF1ZXVlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclF1aWNrQ2hhdEFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdFF1aWNrSW5wdXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFJlY29tbWVuZGF0aW9uIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRBZ2VudFJlY29tbWVuZGF0aW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRUaXRsZUFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdFRpdGxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRFbGljaXRhdGlvbkFjdGlvbnMgfSBmcm9tICcuL2FjdGlvbnMvY2hhdEVsaWNpdGF0aW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRUb29sQWN0aW9ucyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0VG9vbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFRyYW5zZmVyQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRUcmFuc2Zlci5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNoYXRPcGVuQWdlbnREZWJ1Z1BhbmVsQWN0aW9uIH0gZnJvbSAnLi9hY3Rpb25zL2NoYXRPcGVuQWdlbnREZWJ1Z1BhbmVsQWN0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnU2VydmljZUltcGwgfSBmcm9tICcuLi9jb21tb24vY2hhdERlYnVnU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnRWRpdG9yIH0gZnJvbSAnLi9jaGF0RGVidWcvY2hhdERlYnVnRWRpdG9yLmpzJztcbmltcG9ydCB7IFByb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4vcHJvbXB0c0RlYnVnQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYXREZWJ1Z0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4vY2hhdERlYnVnL2FnZW50SG9zdENoYXREZWJ1Z1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0VkaXRvcklucHV0LCBDaGF0RGVidWdFZGl0b3JJbnB1dFNlcmlhbGl6ZXIgfSBmcm9tICcuL2NoYXREZWJ1Zy9jaGF0RGVidWdFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgJy4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5cbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5cbmltcG9ydCB7IENoYXRWaWV3SWQsIElDaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UsIElDaGF0Q29kZUJsb2NrQ29udGV4dFByb3ZpZGVyU2VydmljZSwgSUNoYXRXaWRnZXRTZXJ2aWNlLCBJUXVpY2tDaGF0U2VydmljZSwgaXNJQ2hhdFJlc291cmNlVmlld0NvbnRleHQsIGlzSUNoYXRWaWV3Vmlld0NvbnRleHQgfSBmcm9tICcuL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi9hY2Nlc3NpYmlsaXR5L2NoYXRBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5pbXBvcnQgJy4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgJy4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSwgSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgfSBmcm9tICcuL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSwgSUNoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnkgfSBmcm9tICcuL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdFJlZmVyZW5jZUF0dGFjaG1lbnRXaWRnZXRDb250cmlidXRpb24gfSBmcm9tICcuL2F0dGFjaG1lbnRzL2NoYXRSZWZlcmVuY2VBdHRhY2htZW50V2lkZ2V0LmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSB9IGZyb20gJy4vd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdE1hcmtkb3duQW5jaG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dFBpY2tTZXJ2aWNlLCBJQ2hhdENvbnRleHRQaWNrU2VydmljZSB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRCb3hDb250ZW50UHJvdmlkZXIgfSBmcm9tICcuL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdEVkaXRvcklucHV0Q29udGVudFByb3ZpZGVyLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nRWRpdG9yQWNjZXNzaWJpbGl0eSB9IGZyb20gJy4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdFZGl0b3JBY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdEVkaXRvckFjdGlvbnMgfSBmcm9tICcuL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nRWRpdG9yQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ0VkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ0VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nRWRpdG9yT3ZlcmxheSB9IGZyb20gJy4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdFZGl0b3JPdmVybGF5LmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdGluZ05vdGVib29rRmlsZVN5c3RlbVByb3ZpZGVyQ29udHJpYiB9IGZyb20gJy4vY2hhdEVkaXRpbmcvbm90ZWJvb2svY2hhdEVkaXRpbmdOb3RlYm9va0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9yLCBJQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9yLmpzJztcbmltcG9ydCB7IENoYXRPdXRsaW5lQ3JlYXRvciB9IGZyb20gJy4vY2hhdE91dGxpbmVDcmVhdG9yLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JJbnB1dCwgQ2hhdEVkaXRvcklucHV0U2VyaWFsaXplciB9IGZyb20gJy4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBDaGF0TGF5b3V0U2VydmljZSB9IGZyb20gJy4vd2lkZ2V0L2NoYXRMYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRMYW5ndWFnZU1vZGVsc0RhdGFDb250cmlidXRpb24sIExhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL2NoYXRNYW5hZ2VtZW50L2NoYXRNYW5hZ2VtZW50LmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgJy4vYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL2FpQ3VzdG9taXphdGlvbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0ICcuL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgJy4vYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwuanMnO1xuXG5pbXBvcnQgeyBDaGF0T3V0cHV0UmVuZGVyZXJTZXJ2aWNlLCBJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4vY2hhdE91dHB1dEl0ZW1SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDaGF0Q29tcGF0aWJpbGl0eU5vdGlmaWVyLCBDaGF0RXh0ZW5zaW9uUG9pbnRIYW5kbGVyIH0gZnJvbSAnLi9jaGF0UGFydGljaXBhbnQuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IENoYXRQYXN0ZVByb3ZpZGVyc0ZlYXR1cmUgfSBmcm9tICcuL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdFBhc3RlUHJvdmlkZXJzLmpzJztcbmltcG9ydCB7IFF1aWNrQ2hhdFNlcnZpY2UgfSBmcm9tICcuL3dpZGdldEhvc3RzL2NoYXRRdWljay5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldyB9IGZyb20gJy4vYWNjZXNzaWJpbGl0eS9jaGF0UmVzcG9uc2VBY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBDaGF0VGVybWluYWxPdXRwdXRBY2Nlc3NpYmxlVmlldyB9IGZyb20gJy4vYWNjZXNzaWJpbGl0eS9jaGF0VGVybWluYWxPdXRwdXRBY2Nlc3NpYmxlVmlldy5qcyc7XG5pbXBvcnQgeyBDaGF0U2V0dXBDb250cmlidXRpb24sIENoYXRUZWFyZG93bkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4vY2hhdFNldHVwL2NoYXRTZXR1cENvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFF1b3RhTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9jaGF0UXVvdGFOb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9jaGF0UHJvbW9Ob3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSGFzQnlva01vZGVsc0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4vaGFzQnlva01vZGVsc0NvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0U3RhdHVzQmFyRW50cnkgfSBmcm9tICcuL2NoYXRTdGF0dXMvY2hhdFN0YXR1c0VudHJ5LmpzJztcbmltcG9ydCB7IENoYXRWYXJpYWJsZXNTZXJ2aWNlIH0gZnJvbSAnLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IENoYXRXaWRnZXQgfSBmcm9tICcuL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRDb2RlQmxvY2tDb250ZXh0UHJvdmlkZXJTZXJ2aWNlIH0gZnJvbSAnLi9jb2RlQmxvY2tDb250ZXh0UHJvdmlkZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEltcGxpY2l0Q29udGV4dENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYXR0YWNobWVudHMvY2hhdEltcGxpY2l0Q29udGV4dC5qcyc7XG5pbXBvcnQgJy4vd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0SW5wdXRDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgJy4vd2lkZ2V0L2lucHV0L2VkaXRvci9hZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLmpzJztcbmltcG9ydCAnLi93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dEVkaXRvckNvbnRyaWIuanMnO1xuaW1wb3J0ICcuL3dpZGdldC9pbnB1dC9lZGl0b3IvY2hhdElucHV0Q29tbWFuZEFyZ3VtZW50SGludC5qcyc7XG5pbXBvcnQgJy4vd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0SW5wdXRFZGl0b3JIb3Zlci5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIGdsb2JhbEF1dG9BcHByb3ZlRGVzY3JpcHRpb24gfSBmcm9tICcuL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRvb2xSZXN1bHRDb21wcmVzc29yIH0gZnJvbSAnLi4vY29tbW9uL3Rvb2xzL3Rvb2xSZXN1bHRDb21wcmVzc29yLmpzJztcbmltcG9ydCB7IFRvb2xSZXN1bHRDb21wcmVzc29yU2VydmljZSB9IGZyb20gJy4vdG9vbHMvdG9vbFJlc3VsdENvbXByZXNzb3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luU2VydmljZSwgQ29uZmlndXJlZEFnZW50UGx1Z2luRGlzY292ZXJ5LCBDb3BpbG90Q2xpQWdlbnRQbHVnaW5EaXNjb3ZlcnksIEV4dGVuc2lvbkFnZW50UGx1Z2luRGlzY292ZXJ5LCBNYXJrZXRwbGFjZUFnZW50UGx1Z2luRGlzY292ZXJ5IH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5SZXBvc2l0b3J5U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpbkluc3RhbGxTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luSW5zdGFsbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3BsdWdpbnMvcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSwgSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3dvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpblJlY29tbWVuZGF0aW9ucyB9IGZyb20gJy4vY2xhdWRlUGx1Z2luUmVjb21tZW5kYXRpb25zLmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luRWRpdG9yIH0gZnJvbSAnLi9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkVkaXRvci5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpbkVkaXRvcklucHV0IH0gZnJvbSAnLi9hZ2VudFBsdWdpbkVkaXRvci9hZ2VudFBsdWdpbkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UgfSBmcm9tICcuL2FnZW50UGx1Z2luUmVwb3NpdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnJvd3NlclBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi9wbHVnaW5HaXRDb21tYW5kU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luR2l0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9wbHVnaW5zL3BsdWdpbkdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGx1Z2luSW5zdGFsbFNlcnZpY2UgfSBmcm9tICcuL3BsdWdpbkluc3RhbGxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBsdWdpbkF1dG9VcGRhdGUgfSBmcm9tICcuL3BsdWdpbkF1dG9VcGRhdGUuanMnO1xuaW1wb3J0ICcuL3Byb21wdFN5bnRheC9wcm9tcHRDb2RpbmdBZ2VudEFjdGlvbkNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgJy4vcHJvbXB0U3ludGF4L3Byb21wdFRvb2xzQ29kZUxlbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgJy4vcHJvbXB0U3ludGF4L3Byb21wdFRvb2xTZXRzQ29kZUxlbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgJy4vcHJvbXB0VGltZWxpbmUvcHJvbXB0VGltZWxpbmUuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uT3B0aW9uU2xhc2hDb21tYW5kc0NvbnRyaWJ1dGlvbiwgQ2hhdFNsYXNoQ29tbWFuZHNDb250cmlidXRpb24gfSBmcm9tICcuL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCAnLi9wbGFuUmV2aWV3RmVlZGJhY2svcGxhblJldmlld0ZlZWRiYWNrRWRpdG9yT3ZlcmxheS5qcyc7XG5pbXBvcnQgeyBJUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSwgUGxhblJldmlld0ZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4vcGxhblJldmlld0ZlZWRiYWNrL3BsYW5SZXZpZXdGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGx1Z2luVXJsSGFuZGxlciB9IGZyb20gJy4vcGx1Z2luVXJsSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBQcm9tcHRVcmxIYW5kbGVyIH0gZnJvbSAnLi9wcm9tcHRTeW50YXgvcHJvbXB0VXJsSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVUb29sU2V0cywgVXNlclRvb2xTZXRzQ29udHJpYnV0aW9ucyB9IGZyb20gJy4vdG9vbHMvdG9vbFNldHNDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdzV2VsY29tZUhhbmRsZXIgfSBmcm9tICcuL3ZpZXdzV2VsY29tZS9jaGF0Vmlld3NXZWxjb21lSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4vd2lkZ2V0L2NoYXRXaWRnZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0V2luZG93Tm90aWZpZXIgfSBmcm9tICcuL2NoYXRXaW5kb3dOb3RpZmllci5qcyc7XG5pbXBvcnQgeyBDaGF0UGV0U2VydmljZSwgSUNoYXRQZXRTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0UGV0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVwb0luZm9Db250cmlidXRpb24gfSBmcm9tICcuL2NoYXRSZXBvSW5mby5qcyc7XG5pbXBvcnQgeyBWQUxJRF9QUk9NUFRfRk9MREVSX1BBVFRFUk4gfSBmcm9tICcuLi9jb21tb24vcHJvbXB0U3ludGF4L3V0aWxzL3Byb21wdEZpbGVzTG9jYXRvci5qcyc7XG5pbXBvcnQgeyBDaGF0VGlwU2VydmljZSwgSUNoYXRUaXBTZXJ2aWNlIH0gZnJvbSAnLi9jaGF0VGlwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UXVldWVQaWNrZXJSZW5kZXJpbmcgfSBmcm9tICcuL3dpZGdldC9pbnB1dC9jaGF0UXVldWVQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IEV4cGxvcmVBZ2VudERlZmF1bHRNb2RlbCB9IGZyb20gJy4vZXhwbG9yZUFnZW50RGVmYXVsdE1vZGVsLmpzJztcbmltcG9ydCB7IFBsYW5BZ2VudERlZmF1bHRNb2RlbCB9IGZyb20gJy4vcGxhbkFnZW50RGVmYXVsdE1vZGVsLmpzJztcbmltcG9ydCB7IFV0aWxpdHlNb2RlbENvbnRyaWJ1dGlvbiwgVXRpbGl0eVNtYWxsTW9kZWxDb250cmlidXRpb24gfSBmcm9tICcuL3V0aWxpdHlNb2RlbENvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsIElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UgfSBmcm9tICcuL2NoYXRJbWFnZUNhcm91c2VsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSwgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZS5qcyc7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfY2hhdC5ub3RpZnlRdWVzdGlvbkNhcm91c2VsQW5zd2VyJywgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvbHZlSWQ6IHN0cmluZywgYW5zd2Vycz86IGltcG9ydCgnLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJykuSUNoYXRRdWVzdGlvbkFuc3dlcnMpID0+IHtcblx0YWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSkubm90aWZ5UXVlc3Rpb25DYXJvdXNlbEFuc3dlcignJywgcmVzb2x2ZUlkLCBhbnN3ZXJzKTtcbn0pO1xuXG5jb25zdCB0b29sUmVmZXJlbmNlTmFtZUVudW1WYWx1ZXM6IHN0cmluZ1tdID0gW107XG5jb25zdCB0b29sUmVmZXJlbmNlTmFtZUVudW1EZXNjcmlwdGlvbnM6IHN0cmluZ1tdID0gW107XG5cbi8vIFJlZ2lzdGVyIEpTT04gc2NoZW1hIGZvciBob29rIGZpbGVzXG5jb25zdCBqc29uQ29udHJpYnV0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcbmpzb25Db250cmlidXRpb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShIT09LX1NDSEVNQV9VUkksIGhvb2tGaWxlU2NoZW1hKTtcblxuLy8gUmVnaXN0ZXIgY29uZmlndXJhdGlvblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdjaGF0U2lkZWJhcicsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ2ludGVyYWN0aXZlU2Vzc2lvbkNvbmZpZ3VyYXRpb25UaXRsZScsIFwiQ2hhdFwiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnY2hhdC5leHBlcmltZW50YWxTZXNzaW9uc1dpbmRvd092ZXJyaWRlJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWxTZXNzaW9uc1dpbmRvd092ZXJyaWRlJywgXCJXaGVuIHRydWUsIGVuYWJsZXMgc2Vzc2lvbnMtd2luZG93LXNwZWNpZmljIGJlaGF2aW9yIGZvciBleHRlbnNpb25zLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiB0cnVlIH0sXG5cdFx0fSxcblx0XHQnY2hhdC5mb250U2l6ZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5mb250U2l6ZScsIFwiQ29udHJvbHMgdGhlIGZvbnQgc2l6ZSBpbiBwaXhlbHMgaW4gY2hhdCBtZXNzYWdlcy5cIiksXG5cdFx0XHRkZWZhdWx0OiAxMyxcblx0XHRcdG1pbmltdW06IDYsXG5cdFx0XHRtYXhpbXVtOiAxMDBcblx0XHR9LFxuXHRcdCdjaGF0LmZvbnRGYW1pbHknOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZm9udEZhbWlseScsIFwiQ29udHJvbHMgdGhlIGZvbnQgZmFtaWx5IGluIGNoYXQgbWVzc2FnZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2RlZmF1bHQnXG5cdFx0fSxcblx0XHQnZGljdGF0aW9uLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RpY3RhdGlvbi5lbmFibGVkJywgXCJFbmFibGVzIGRpY3RhdGlvbiBhY3Jvc3MgdGhlIHByb2R1Y3QgKGNoYXQgaW5wdXQsIGVkaXRvciwgYW5kIHRlcm1pbmFsKS4gV2hlbiBlbmFibGVkIG9uIGEgc3VwcG9ydGVkIHBsYXRmb3JtLCBhIG1pY3JvcGhvbmUgYnV0dG9uIGFwcGVhcnMgaW4gdGhlIGNoYXQgaW5wdXQgYW5kIHRoZSBkaWN0YXRpb24gc2hvcnRjdXQgYmVjb21lcyBhdmFpbGFibGU7IHRoZSBvbi1kZXZpY2UgdHJhbnNjcmlwdGlvbiBtb2RlbCBpcyBkb3dubG9hZGVkIG9uIGZpcnN0IHVzZSBhbmQgcnVucyBsb2NhbGx5LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdEaWN0YXRpb25FbmFibGVkJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEzMScsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdkaWN0YXRpb24uZW5hYmxlZC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnZGljdGF0aW9uLmVuYWJsZWQucG9saWN5JywgXCJDb250cm9scyB3aGV0aGVyIGRpY3RhdGlvbiBpcyBhdmFpbGFibGUgYWNyb3NzIHRoZSBwcm9kdWN0IChjaGF0IGlucHV0LCBlZGl0b3IsIGFuZCB0ZXJtaW5hbCkuXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2RpY3RhdGlvbi5tb2RlbCc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogW1xuXHRcdFx0XHRERUZBVUxUX0xPQ0FMX1RSQU5TQ1JJUFRJT05fTU9ERUwsXG5cdFx0XHRcdCdtYWknLFxuXHRcdFx0XSxcblx0XHRcdGVudW1JdGVtTGFiZWxzOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZGljdGF0aW9uLm1vZGVsLm5lbW90cm9uU3RyZWFtaW5nLmxhYmVsJywgXCJOZW1vdHJvbiAzLjUgQVNSIChNdWx0aWxpbmd1YWwpIFx1MjAxNCBPbi1EZXZpY2VcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZGljdGF0aW9uLm1vZGVsLm1haS5sYWJlbCcsIFwiTUFJIFx1MjAxNCBDbG91ZFwiKSxcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdkaWN0YXRpb24ubW9kZWwubmVtb3Ryb25TdHJlYW1pbmcnLCBcIk5WSURJQSBOZW1vdHJvbiAzLjUgbXVsdGlsaW5ndWFsIHN0cmVhbWluZyBSTk4tVCwgcnVuIG9uLWRldmljZSB0aHJvdWdoIE1pY3Jvc29mdCBGb3VuZHJ5IExvY2FsLiBXb3JrcyBvZmZsaW5lOyBubyBhdWRpbyBsZWF2ZXMgdGhlIGRldmljZS4gQXV0b21hdGljIGxhbmd1YWdlIHNlbGVjdGlvbiBmb2xsb3dzIHRoZSBWb2ljZSBNb2RlIGxhbmd1YWdlIHNldHRpbmcgYW5kIHN5c3RlbSBvciBicm93c2VyIGxvY2FsZSwgd2l0aCBtb2RlbCBkZXRlY3Rpb24gYXMgYSBmYWxsYmFjay4gRG93bmxvYWRlZCBvbiBmaXJzdCB1c2UgYW5kIGNhY2hlZCBvbiBkaXNrLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdkaWN0YXRpb24ubW9kZWwubWFpJywgXCJDbG91ZCB0cmFuc2NyaXB0aW9uIHRocm91Z2ggdGhlIHNhbWUgTWljcm9zb2Z0IEFJIHZvaWNlIHNlcnZpY2UgdXNlZCBieSBWb2ljZSBNb2RlLiBSZXF1aXJlcyBhIG5ldHdvcmsgY29ubmVjdGlvbiBhbmQgR2l0SHViIHNpZ24taW47IGF1ZGlvIGlzIHN0cmVhbWVkIHRvIHRoZSBzZXJ2aWNlLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RpY3RhdGlvbi5tb2RlbCcsIFwiVGhlIG1vZGVsIHVzZWQgZm9yIGRpY3RhdGlvbi4gT24tZGV2aWNlIG1vZGVscyBkb3dubG9hZCBvbiBmaXJzdCB1c2UgYW5kIHJ1biBsb2NhbGx5IHRocm91Z2ggTWljcm9zb2Z0IEZvdW5kcnkgTG9jYWw7IHRoZSBjbG91ZCBvcHRpb24gc3RyZWFtcyBhdWRpbyB0byB0aGUgTWljcm9zb2Z0IEFJIHZvaWNlIHNlcnZpY2UuXCIpLFxuXHRcdFx0ZGVmYXVsdDogREVGQVVMVF9MT0NBTF9UUkFOU0NSSVBUSU9OX01PREVMLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgbW9kZTogJ2F1dG8nIH1cblx0XHR9LFxuXHRcdFtEaWN0YXRpb25TZXR0aW5nSWQuU2hvd1RyYW5zY3JpcHRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RpY3RhdGlvbi5zaG93VHJhbnNjcmlwdCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgdHJhbnNjcmlwdCBpcyBzaG93biB3aGlsZSBkaWN0YXRpbmcuIFRoZSBmaW5hbCB0cmFuc2NyaXB0IGlzIGluc2VydGVkIHdoZW4gZGljdGF0aW9uIGVuZHMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ11cblx0XHR9LFxuXHRcdCdkaWN0YXRpb24uZXhwZXJpbWVudGFsLmxsbUNsZWFudXAnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2RpY3RhdGlvbi5leHBlcmltZW50YWwubGxtQ2xlYW51cCcsIFwiRXhwZXJpbWVudGFsOiB3aGVuIGRpY3RhdGlvbiBlbmRzLCB0aGUgZmluYWwgdHJhbnNjcmlwdCBpcyBwYXNzZWQgdGhyb3VnaCBhIHNtYWxsIGxhbmd1YWdlIG1vZGVsIHRvIHJlc3RvcmUgcHVuY3R1YXRpb24sIGNhcGl0YWxpemF0aW9uLCBwYXJhZ3JhcGhzLCBhbmQgbGlzdHMuIFJlcXVpcmVzIENvcGlsb3QgdG8gYmUgZW5hYmxlZDsgdGhlIHRyYW5zY3JpcHQgaXMgc2VudCB0byB0aGUgbGFuZ3VhZ2UgbW9kZWwgZm9yIGNsZWFudXAuIEZhbGxzIGJhY2sgdG8gdGhlIHJhdyB0cmFuc2NyaXB0IHdoZW4gbm8gbW9kZWwgaXMgYXZhaWxhYmxlLiBVc2UgW2RpY3RhdGlvbiBpbnN0cnVjdGlvbnNdKGNvbW1hbmQ6ezB9KSB0byBjdXN0b21pemUgdGVybWlub2xvZ3kgYW5kIGZvcm1hdHRpbmcuXCIsIENPTkZJR1VSRV9ESUNUQVRJT05fSU5TVFJVQ1RJT05TX0FDVElPTl9JRCksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0J2NoYXQuZWRpdG9yLmZvbnRTaXplJzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbnRlcmFjdGl2ZVNlc3Npb24uZWRpdG9yLmZvbnRTaXplJywgXCJDb250cm9scyB0aGUgZm9udCBzaXplIGluIHBpeGVscyBpbiBjaGF0IGNvZGVibG9ja3MuXCIpLFxuXHRcdFx0ZGVmYXVsdDogaXNNYWNpbnRvc2ggPyAxMiA6IDE0LFxuXHRcdH0sXG5cdFx0J2NoYXQuZWRpdG9yLmZvbnRGYW1pbHknOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ludGVyYWN0aXZlU2Vzc2lvbi5lZGl0b3IuZm9udEZhbWlseScsIFwiQ29udHJvbHMgdGhlIGZvbnQgZmFtaWx5IGluIGNoYXQgY29kZWJsb2Nrcy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCdcblx0XHR9LFxuXHRcdCdjaGF0LmVkaXRvci5mb250V2VpZ2h0Jzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbnRlcmFjdGl2ZVNlc3Npb24uZWRpdG9yLmZvbnRXZWlnaHQnLCBcIkNvbnRyb2xzIHRoZSBmb250IHdlaWdodCBpbiBjaGF0IGNvZGVibG9ja3MuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2RlZmF1bHQnXG5cdFx0fSxcblx0XHQnY2hhdC5lZGl0b3Iud29yZFdyYXAnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ludGVyYWN0aXZlU2Vzc2lvbi5lZGl0b3Iud29yZFdyYXAnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbGluZXMgc2hvdWxkIHdyYXAgaW4gY2hhdCBjb2RlYmxvY2tzLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdvZmYnLFxuXHRcdFx0ZW51bTogWydvbicsICdvZmYnXVxuXHRcdH0sXG5cdFx0J2NoYXQuZWRpdG9yLmxpbmVIZWlnaHQnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ludGVyYWN0aXZlU2Vzc2lvbi5lZGl0b3IubGluZUhlaWdodCcsIFwiQ29udHJvbHMgdGhlIGxpbmUgaGVpZ2h0IGluIHBpeGVscyBpbiBjaGF0IGNvZGVibG9ja3MuIFVzZSAwIHRvIGNvbXB1dGUgdGhlIGxpbmUgaGVpZ2h0IGZyb20gdGhlIGZvbnQgc2l6ZS5cIiksXG5cdFx0XHRkZWZhdWx0OiAwXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRTdGF0dXNFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2hpZGRlbicsICdiYWRnZScsICdjb21wYWN0J10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudHNDb250cm9sLmhpZGRlbicsIFwiVGhlIGFnZW50IHN0YXR1cyBpbmRpY2F0b3IgaXMgaGlkZGVuIGZyb20gdGhlIHRpdGxlIGJhci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudHNDb250cm9sLmJhZGdlJywgXCJTaG93cyB0aGUgYWdlbnQgc3RhdHVzIGFzIGEgYmFkZ2UgbmV4dCB0byB0aGUgY29tbWFuZCBjZW50ZXIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRzQ29udHJvbC5jb21wYWN0JywgXCJSZXBsYWNlcyB0aGUgY29tbWFuZCBjZW50ZXIgc2VhcmNoIGJveCB3aXRoIGEgY29tcGFjdCBhZ2VudCBzdGF0dXMgaW5kaWNhdG9yIGFuZCB1bmlmaWVkIGNoYXQgd2lkZ2V0LlwiKSxcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRzQ29udHJvbC5lbmFibGVkJywgXCJDb250cm9scyBob3cgdGhlICdBZ2VudCBTdGF0dXMnIGluZGljYXRvciBhcHBlYXJzIGluIHRoZSB0aXRsZSBiYXIgY29tbWFuZCBjZW50ZXIuIFdoZW4gc2V0IHRvIGBoaWRkZW5gLCB0aGUgaW5kaWNhdG9yIGlzIG5vdCBzaG93bi4gT3RoZXIgdmFsdWVzIHNob3cgdGhlIGluZGljYXRvciBhbmQgYXV0b21hdGljYWxseSBlbmFibGUgezB9LiBUaGUgdW5yZWFkIGFuZCBpbi1wcm9ncmVzcyBzZXNzaW9uIGluZGljYXRvcnMgcmVxdWlyZSB7MX0gdG8gYmUgZW5hYmxlZC5cIiwgJ2Ajd2luZG93LmNvbW1hbmRDZW50ZXIjYCcsICdgI2NoYXQudmlld1Nlc3Npb25zLmVuYWJsZWQjYCcpLFxuXHRcdFx0ZGVmYXVsdDogJ2NvbXBhY3QnLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlVuaWZpZWRBZ2VudHNCYXJdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudW5pZmllZEFnZW50c0Jhci5lbmFibGVkJywgXCJSZXBsYWNlcyB0aGUgY29tbWFuZCBjZW50ZXIgc2VhcmNoIGJveCB3aXRoIGEgdW5pZmllZCBjaGF0IGFuZCBzZWFyY2ggd2lkZ2V0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkFnZW50U2Vzc2lvblByb2plY3Rpb25FbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50U2Vzc2lvblByb2plY3Rpb24uZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciBBZ2VudCBTZXNzaW9uIFByb2plY3Rpb24gbW9kZSBpcyBlbmFibGVkIGZvciByZXZpZXdpbmcgYWdlbnQgc2Vzc2lvbnMgaW4gYSBmb2N1c2VkIHdvcmtzcGFjZS5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHQnY2hhdC5pbXBsaWNpdENvbnRleHQuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdENvbnRleHQuZW5hYmxlZC4xJywgXCJFbmFibGVzIGF1dG9tYXRpY2FsbHkgdXNpbmcgdGhlIGFjdGl2ZSBlZGl0b3IgYXMgY2hhdCBjb250ZXh0IGZvciBzcGVjaWZpZWQgY2hhdCBsb2NhdGlvbnMuXCIpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnbmV2ZXInLCAnZmlyc3QnLCAnYWx3YXlzJ10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuaW1wbGljaXRDb250ZXh0LnZhbHVlJywgXCJUaGUgdmFsdWUgZm9yIHRoZSBpbXBsaWNpdCBjb250ZXh0LlwiKSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdENvbnRleHQudmFsdWUubmV2ZXInLCBcIkltcGxpY2l0IGNvbnRleHQgaXMgbmV2ZXIgZW5hYmxlZC5cIiksXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmltcGxpY2l0Q29udGV4dC52YWx1ZS5maXJzdCcsIFwiSW1wbGljaXQgY29udGV4dCBpcyBlbmFibGVkIGZvciB0aGUgZmlyc3QgaW50ZXJhY3Rpb24uXCIpLFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdENvbnRleHQudmFsdWUuYWx3YXlzJywgXCJJbXBsaWNpdCBjb250ZXh0IGlzIGFsd2F5cyBlbmFibGVkLlwiKVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQncGFuZWwnOiAnYWx3YXlzJyxcblx0XHRcdH0sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnc3RhcnR1cCdcblx0XHRcdH0sXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogeyAncGFuZWwnOiAnbmV2ZXInIH0gfSxcblx0XHR9LFxuXHRcdCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0Jzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBuZXcgaW1wbGljaXQgY29udGV4dCBmbG93IGlzIHNob3duLiBJbiBBc2sgYW5kIEVkaXQgbW9kZXMsIHRoZSBjb250ZXh0IHdpbGwgYXV0b21hdGljYWxseSBiZSBpbmNsdWRlZC4gV2hlbiB1c2luZyBhbiBhZ2VudCwgY29udGV4dCB3aWxsIGJlIHN1Z2dlc3RlZCBhcyBhbiBhdHRhY2htZW50LiBTZWxlY3Rpb25zIGFyZSBhbHdheXMgaW5jbHVkZWQgYXMgY29udGV4dC5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IGZhbHNlIH0sXG5cdFx0fSxcblx0XHQnY2hhdC5pbXBsaWNpdENvbnRleHQuaW5jbHVkZUFjdGl2ZUVkaXRvcic6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5pbXBsaWNpdENvbnRleHQuaW5jbHVkZUFjdGl2ZUVkaXRvcicsIFwiV2hlbiBlbmFibGVkLCB0aGUgYWN0aXZlIGVkaXRvciBpcyBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZCBhcyBjb250ZXh0LCBldmVuIHdoZW4gaXQgd291bGQgb3RoZXJ3aXNlIG9ubHkgYmUgc3VnZ2VzdGVkLiBTZWxlY3Rpb25zIGFuZCBleHBsaWNpdGx5IGF0dGFjaGVkIGZpbGVzIGFyZSBhbHdheXMgaW5jbHVkZWQgcmVnYXJkbGVzcyBvZiB0aGlzIHNldHRpbmcuXFxuXFxuTm90ZTogdGhpcyBzZXR0aW5nIGN1cnJlbnRseSBvbmx5IGFwcGxpZXMgdG8gQWdlbnQgSG9zdCBzZXNzaW9ucyAoc3VjaCBhcyB0aGUgQ29waWxvdCBDTEkpLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IGZhbHNlIH0sXG5cdFx0fSxcblx0XHQnY2hhdC5lZGl0aW5nLmF1dG9BY2NlcHREZWxheSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmVkaXRpbmcuYXV0b0FjY2VwdERlbGF5JywgXCJEZWxheSBhZnRlciB3aGljaCBjaGFuZ2VzIG1hZGUgYnkgY2hhdCBhcmUgYXV0b21hdGljYWxseSBhY2NlcHRlZC4gVmFsdWVzIGFyZSBpbiBzZWNvbmRzLCBgMGAgbWVhbnMgZGlzYWJsZWQgYW5kIGAxMDBgIHNlY29uZHMgaXMgdGhlIG1heGltdW0uXCIpLFxuXHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdG1pbmltdW06IDAsXG5cdFx0XHRtYXhpbXVtOiAxMDBcblx0XHR9LFxuXHRcdCdjaGF0LmVkaXRpbmcuY29uZmlybUVkaXRSZXF1ZXN0UmVtb3ZhbCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZWRpdGluZy5jb25maXJtRWRpdFJlcXVlc3RSZW1vdmFsJywgXCJXaGV0aGVyIHRvIHNob3cgYSBjb25maXJtYXRpb24gYmVmb3JlIHJlbW92aW5nIGEgcmVxdWVzdCBhbmQgaXRzIGFzc29jaWF0ZWQgZWRpdHMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdCdjaGF0LmVkaXRpbmcuY29uZmlybUVkaXRSZXF1ZXN0UmV0cnknOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmVkaXRpbmcuY29uZmlybUVkaXRSZXF1ZXN0UmV0cnknLCBcIldoZXRoZXIgdG8gc2hvdyBhIGNvbmZpcm1hdGlvbiBiZWZvcmUgcmV0cnlpbmcgYSByZXF1ZXN0IGFuZCBpdHMgYXNzb2NpYXRlZCBlZGl0cy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0J2NoYXQuZWRpdGluZy5leHBsYWluQ2hhbmdlcy5lbmFibGVkJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmVkaXRpbmcuZXhwbGFpbkNoYW5nZXMuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbGFpbiBidXR0b24gaW4gdGhlIENoYXQgcGFuZWwgYW5kIHRoZSBFeHBsYWluIENoYW5nZXMgY29udGV4dCBtZW51IGluIHRoZSBTQ00gdmlldyBhcmUgc2hvd24uIFRoaXMgaXMgYW4gZXhwZXJpbWVudGFsIGZlYXR1cmUuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5SZXZlYWxOZXh0Q2hhbmdlT25SZXNvbHZlXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmVkaXRpbmcucmV2ZWFsTmV4dENoYW5nZU9uUmVzb2x2ZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIGF1dG9tYXRpY2FsbHkgcmV2ZWFscyB0aGUgbmV4dCBjaGFuZ2UgYWZ0ZXIga2VlcGluZyBvciB1bmRvaW5nIGEgY2hhdCBlZGl0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uT3BlbkNoYW5nZWRGaWxlSW5EaWZmRWRpdG9yXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmVkaXRpbmcub3BlbkNoYW5nZWRGaWxlSW5EaWZmRWRpdG9yJywgXCJDb250cm9scyB3aGV0aGVyIHNlbGVjdGluZyBhIGZpbGUgaW4gdGhlIGNoYW5nZWQgZmlsZXMgbGlzdCBvZiBhIGNoYXQgcmVzcG9uc2Ugb3BlbnMgaXQgaW4gYSBkaWZmIGVkaXRvciBzaG93aW5nIHRoZSBjaGFuZ2VzIG1hZGUgYnkgY2hhdCwgb3IgaW4gYSByZWd1bGFyIGVkaXRvci4gSG9sZGluZyBga2JzdHlsZShBbHQpYCB3aGlsZSBzZWxlY3RpbmcgdGhlIGZpbGUgb3BlbnMgaXQgd2l0aCB0aGUgb3Bwb3NpdGUgYmVoYXZpb3IuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdCdjaGF0LnRpcHMuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRpcHMuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aXBzIGFyZSBzaG93biBhYm92ZSB1c2VyIG1lc3NhZ2VzIGluIGNoYXQuIE5ldyB0aXBzIGFyZSBhZGRlZCBmcmVxdWVudGx5LCBzbyB0aGlzIGlzIGEgaGVscGZ1bCB3YXkgdG8gc3RheSB1cCB0byBkYXRlIHdpdGggdGhlIGxhdGVzdCBmZWF0dXJlcy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0J2NoYXQudXB2b3RlQW5pbWF0aW9uJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ29mZicsICdjb25mZXR0aScsICdmbG9hdGluZ1RodW1icycsICdwdWxzZVdhdmUnLCAncmFkaWFudExpbmVzJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC51cHZvdGVBbmltYXRpb24ub2ZmJywgXCJObyBhbmltYXRpb24gaXMgc2hvd24uXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQudXB2b3RlQW5pbWF0aW9uLmNvbmZldHRpJywgXCJTaG93cyBhIGNvbmZldHRpIGJ1cnN0IGFuaW1hdGlvbiBhcm91bmQgdGhlIHRodW1icyB1cCBidXR0b24uXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQudXB2b3RlQW5pbWF0aW9uLmZsb2F0aW5nVGh1bWJzJywgXCJTaG93cyBmbG9hdGluZyB0aHVtYnMgdXAgaWNvbnMgcmlzaW5nIGZyb20gdGhlIGJ1dHRvbi5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC51cHZvdGVBbmltYXRpb24ucHVsc2VXYXZlJywgXCJTaG93cyBleHBhbmRpbmcgcHVsc2UgcmluZ3MgZnJvbSB0aGUgYnV0dG9uLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnVwdm90ZUFuaW1hdGlvbi5yYWRpYW50TGluZXMnLCBcIlNob3dzIHJhZGlhbnQgbGluZXMgZW1hbmF0aW5nIGZyb20gdGhlIGJ1dHRvbi5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC51cHZvdGVBbmltYXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgYW4gYW5pbWF0aW9uIGlzIHNob3duIHdoZW4gY2xpY2tpbmcgdGhlIHRodW1icyB1cCBidXR0b24gb24gYSBjaGF0IHJlc3BvbnNlLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdmbG9hdGluZ1RodW1icycsXG5cdFx0fSxcblx0XHQnY2hhdC5leHBlcmltZW50YWwuZGV0ZWN0UGFydGljaXBhbnQuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5kZXRlY3RQYXJ0aWNpcGFudC5lbmFibGVkLmRlcHJlY2F0ZWQnLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkLiBQbGVhc2UgdXNlIGBjaGF0LmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWRgIGluc3RlYWQuXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuZGV0ZWN0UGFydGljaXBhbnQuZW5hYmxlZCcsIFwiRW5hYmxlcyBjaGF0IHBhcnRpY2lwYW50IGF1dG9kZXRlY3Rpb24gZm9yIHBhbmVsIGNoYXQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogbnVsbFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuZW5hYmxlZCcsIFwiRW5hYmxlcyBpbmNyZW1lbnRhbCByZW5kZXJpbmcgd2l0aCBvcHRpb25hbCBibG9jay1sZXZlbCBhbmltYXRpb24gd2hlbiBzdHJlYW1pbmcgY2hhdCByZXNwb25zZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nU3R5bGVdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnbm9uZScsICdmYWRlJywgJ3Jpc2UnLCAnYmx1cicsICdzY2FsZScsICdzbGlkZScsICdyZXZlYWwnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5pbmNyZW1lbnRhbFJlbmRlcmluZy5hbmltYXRpb25TdHlsZS5ub25lJywgXCJObyBhbmltYXRpb24uIENvbnRlbnQgYXBwZWFycyBpbnN0YW50bHkuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmFuaW1hdGlvblN0eWxlLmZhZGUnLCBcIlNpbXBsZSBvcGFjaXR5IGZhZGUgZnJvbSAwIHRvIDEuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmFuaW1hdGlvblN0eWxlLnJpc2UnLCBcIkNvbnRlbnQgZmFkZXMgaW4gd2hpbGUgcmlzaW5nIHVwd2FyZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUuYmx1cicsIFwiQ29udGVudCBmYWRlcyBpbiBmcm9tIGEgYmx1cnJlZCBzdGF0ZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUuc2NhbGUnLCBcIkNvbnRlbnQgc2NhbGVzIHVwIGZyb20gc2xpZ2h0bHkgc21hbGxlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUuc2xpZGUnLCBcIkNvbnRlbnQgc2xpZGVzIGluIGZyb20gdGhlIGxlZnQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmFuaW1hdGlvblN0eWxlLnJldmVhbCcsIFwiQ29udGVudCByZXZlYWxzIHRvcC10by1ib3R0b20gd2l0aCBhIHNvZnQgZ3JhZGllbnQgZWRnZS5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYW5pbWF0aW9uU3R5bGUnLCBcIkNvbnRyb2xzIHRoZSBhbmltYXRpb24gc3R5bGUgZm9yIGluY3JlbWVudGFsIHJlbmRlcmluZy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnZmFkZScsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nQnVmZmVyaW5nXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ29mZicsICd3b3JkJywgJ3BhcmFncmFwaCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmJ1ZmZlcmluZy5vZmYnLCBcIlJlbmRlcnMgY29udGVudCBpbW1lZGlhdGVseSBhcyB0b2tlbnMgYXJyaXZlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5pbmNyZW1lbnRhbFJlbmRlcmluZy5idWZmZXJpbmcud29yZCcsIFwiUmV2ZWFscyBjb250ZW50IHdvcmQgYnkgd29yZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwuaW5jcmVtZW50YWxSZW5kZXJpbmcuYnVmZmVyaW5nLnBhcmFncmFwaCcsIFwiQnVmZmVycyBjb250ZW50IHVudGlsIGEgcGFyYWdyYXBoIGJyZWFrIGJlZm9yZSByZW5kZXJpbmcuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLmluY3JlbWVudGFsUmVuZGVyaW5nLmJ1ZmZlcmluZycsIFwiQ29udHJvbHMgaG93IGNvbnRlbnQgaXMgYnVmZmVyZWQgYmVmb3JlIHJlbmRlcmluZyBkdXJpbmcgaW5jcmVtZW50YWwgcmVuZGVyaW5nLiBMb3dlciBidWZmZXJpbmcgbGV2ZWxzIHJlbmRlciBmYXN0ZXIgYnV0IG1heSBzaG93IGluY29tcGxldGUgc2VudGVuY2VzIG9yIHBhcnRpYWxseSBmb3JtZWQgbWFya2Rvd24uXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ3dvcmQnLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Db2xsYXBzZUNvbXBsZXRlZFJlc3BvbnNlc106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQuY29sbGFwc2VDb21wbGV0ZWRSZXNwb25zZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY29tcGxldGVkIGNoYXQgcmVzcG9uc2VzIGNvbGxhcHNlIGludGVybWVkaWF0ZSB3b3JrIHdoaWxlIGtlZXBpbmcgdGhlIGZpbmFsIHJlc3BvbnNlIHZpc2libGUuXCIpLFxuXHRcdFx0ZGVmYXVsdDogcHJvZHVjdC5xdWFsaXR5ICE9PSAnc3RhYmxlJyxcblx0XHR9LFxuXHRcdCdjaGF0LmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWQnLCBcIkVuYWJsZXMgY2hhdCBwYXJ0aWNpcGFudCBhdXRvZGV0ZWN0aW9uIGZvciBwYW5lbCBjaGF0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5JbmxpbmVSZWZlcmVuY2VzU3R5bGVdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYm94JywgJ2xpbmsnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmlubGluZVJlZmVyZW5jZXMuc3R5bGUuYm94JywgXCJEaXNwbGF5IGZpbGUgYW5kIHN5bWJvbCByZWZlcmVuY2VzIGFzIGJveGVkIHdpZGdldHMgd2l0aCBpY29ucy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5pbmxpbmVSZWZlcmVuY2VzLnN0eWxlLmxpbmsnLCBcIkRpc3BsYXkgZmlsZSBhbmQgc3ltYm9sIHJlZmVyZW5jZXMgYXMgc2ltcGxlIGJsdWUgbGlua3Mgd2l0aG91dCBpY29ucy5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmlubGluZVJlZmVyZW5jZXMuc3R5bGUnLCBcIkNvbnRyb2xzIGhvdyBmaWxlIGFuZCBzeW1ib2wgcmVmZXJlbmNlcyBhcmUgZGlzcGxheWVkIGluIGNoYXQgbWVzc2FnZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2JveCdcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FZGl0b3JBc3NvY2lhdGlvbnNdOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0b3JBc3NvY2lhdGlvbnMnLCBcIkNvbmZpZ3VyZSBbZ2xvYiBwYXR0ZXJuc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWdsb2ItcGF0dGVybnMpIHRvIGVkaXRvcnMgZm9yIG9wZW5pbmcgZmlsZXMgZnJvbSBjaGF0IChmb3IgZXhhbXBsZSBgXFxcIioubWRcXFwiOiBcXFwidnNjb2RlLm1hcmtkb3duLnByZXZpZXcuZWRpdG9yXFxcImApLlwiKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLk5vdGlmeVdpbmRvd09uQ29uZmlybWF0aW9uXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ29mZicsICd3aW5kb3dOb3RGb2N1c2VkJywgJ2Fsd2F5cyddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQubm90aWZ5V2luZG93T25Db25maXJtYXRpb24ub2ZmJywgXCJOZXZlciBzaG93IE9TIG5vdGlmaWNhdGlvbnMgZm9yIGNvbmZpcm1hdGlvbnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQubm90aWZ5V2luZG93T25Db25maXJtYXRpb24ud2luZG93Tm90Rm9jdXNlZCcsIFwiU2hvdyBPUyBub3RpZmljYXRpb25zIGZvciBjb25maXJtYXRpb25zIHdoZW4gdGhlIHdpbmRvdyBpcyBub3QgZm9jdXNlZC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5ub3RpZnlXaW5kb3dPbkNvbmZpcm1hdGlvbi5hbHdheXMnLCBcIkFsd2F5cyBzaG93IE9TIG5vdGlmaWNhdGlvbnMgZm9yIGNvbmZpcm1hdGlvbnMsIGV2ZW4gd2hlbiB0aGUgd2luZG93IGlzIGZvY3VzZWQuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubm90aWZ5V2luZG93T25Db25maXJtYXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgYSBjaGF0IHNlc3Npb24gc2hvdWxkIHByZXNlbnQgdGhlIHVzZXIgd2l0aCBhbiBPUyBub3RpZmljYXRpb24gd2hlbiBhIGNvbmZpcm1hdGlvbiBvciBxdWVzdGlvbiBuZWVkcyBpbnB1dC4gVGhpcyBpbmNsdWRlcyBhIHdpbmRvdyBiYWRnZSBhcyB3ZWxsIGFzIG5vdGlmaWNhdGlvbiB0b2FzdC5cIiksXG5cdFx0XHRkZWZhdWx0OiAnd2luZG93Tm90Rm9jdXNlZCcsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQXV0b1JlcGx5XToge1xuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXV0b1JlcGx5LmRlc2NyaXB0aW9uJywgXCJBdXRvbWF0aWNhbGx5IHNraXAgcXVlc3Rpb24gY2Fyb3VzZWxzIGJ5IHRlbGxpbmcgdGhlIGFnZW50IHRoYXQgdGhlIHVzZXIgaXMgbm90IGF2YWlsYWJsZSBhbmQgdG8gdXNlIGl0cyBiZXN0IGp1ZGdtZW50LiBUaGlzIGlzIGFuIGFkdmFuY2VkIHNldHRpbmcgYW5kIGNhbiBsZWFkIHRvIHVuaW50ZW5kZWQgY2hvaWNlcyBvciBhY3Rpb25zIGJhc2VkIG9uIGluY29tcGxldGUgY29udGV4dC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OX01BQ0hJTkUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkF1dG9waWxvdEFkdmFuY2VkRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hdXRvcGlsb3QuYWR2YW5jZWQuZW5hYmxlZCcsIFwiRW5hYmxlcyAqKkFkdmFuY2VkIEF1dG9waWxvdCoqLCBhIHNpbmdsZSBzd2l0Y2ggdGhhdCB0dXJucyBvbiBhbGwgYWR2YW5jZWQgQXV0b3BpbG90IGJlaGF2aW9ycyB0aGF0IGRlbGVnYXRlIG1vcmUgb2YgdGhlIGxvb3AgdG8gdGhlIGFnZW50LiBDdXJyZW50bHksIGFmdGVyIGVhY2ggQXV0b3BpbG90IHR1cm4gYSBzbWFsbCwgZmFzdCBtb2RlbCBldmFsdWF0ZXMgd2hldGhlciB5b3VyIG9yaWdpbmFsIHJlcXVlc3QgaXMgY29tcGxldGU7IGlmIG5vdCwgQXV0b3BpbG90IGtlZXBzIHdvcmtpbmcgdXNpbmcgdGhhdCBldmFsdWF0aW9uIGFzIGd1aWRhbmNlIGZvciB0aGUgbmV4dCB0dXJuLCBpbnN0ZWFkIG9mIHJlbHlpbmcgb24gdGhlIGFnZW50IHRvIHNpZ25hbCBjb21wbGV0aW9uIGl0c2VsZi5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFBlcm1pc3Npb25MZXZlbF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogW0NoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3RdLFxuXHRcdFx0ZW51bUl0ZW1MYWJlbHM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHQuZGVmYXVsdC5sYWJlbCcsIFwiRGVmYXVsdCBBcHByb3ZhbHNcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0LmF1dG9BcHByb3ZlLmxhYmVsJywgXCJCeXBhc3MgQXBwcm92YWxzXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQucGVybWlzc2lvbnMuZGVmYXVsdC5hdXRvcGlsb3QubGFiZWwnLCBcIkF1dG9waWxvdCAoUHJldmlldylcIiksXG5cdFx0XHRdLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQucGVybWlzc2lvbnMuZGVmYXVsdC5kZWZhdWx0LmRlc2NyaXB0aW9uJywgXCJTdGFydCBuZXcgY2hhdCBzZXNzaW9ucyB3aXRoIERlZmF1bHQgQXBwcm92YWxzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LnBlcm1pc3Npb25zLmRlZmF1bHQuYXV0b0FwcHJvdmUuZGVzY3JpcHRpb24nLCBcIlN0YXJ0IG5ldyBjaGF0IHNlc3Npb25zIGluIEJ5cGFzcyBBcHByb3ZhbHMgbW9kZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5wZXJtaXNzaW9ucy5kZWZhdWx0LmF1dG9waWxvdC5kZXNjcmlwdGlvbicsIFwiU3RhcnQgbmV3IGNoYXQgc2Vzc2lvbnMgaW4gQXV0b3BpbG90IG1vZGUuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucGVybWlzc2lvbnMuZGVmYXVsdC5zZXR0aW5nRGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHRoZSBkZWZhdWx0IHBlcm1pc3Npb25zIHBpY2tlciBtb2RlIGZvciBuZXcgbG9jYWwgY2hhdCBzZXNzaW9ucy4gWW91IGNhbiBzdGlsbCBjaGFuZ2UgdGhlIHBlcm1pc3Npb24gbW9kZSBwZXIgc2Vzc2lvbiwgYW5kIGVhY2ggc2Vzc2lvbiByZW1lbWJlcnMgdGhlIHBlcm1pc3Npb24gbW9kZSB0aGF0IHdhcyB1c2VkLiBJZiBlbnRlcnByaXNlIHBvbGljeSBkaXNhYmxlcyBhdXRvIGFwcHJvdmFsLCBuZXcgc2Vzc2lvbnMgdXNlIERlZmF1bHQgQXBwcm92YWxzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Bc3Npc3RlZFBlcm1pc3Npb25zRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFzc2lzdGVkUGVybWlzc2lvbnMuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciBBc3Npc3RlZCBwZXJtaXNzaW9ucyBpcyBzaG93biBpbiBBZ2VudCBIb3N0IGFwcHJvdmFsIHBpY2tlcnMuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlBlcm1pc3Npb25zU2FuZGJveFRvZ2dsZUVuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHBlcmltZW50YWwucGVybWlzc2lvbnNTYW5kYm94VG9nZ2xlLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHBlcm1pc3Npb25zIHBpY2tlciBzaG93cyBhbiBpbmxpbmUgXFxcIlNhbmRib3hpbmcgZm9yIHRlcm1pbmFsXFxcIiB0b2dnbGUgb24gdGhlIERlZmF1bHQgQXBwcm92YWxzIG9wdGlvbi4gVGhlIHRvZ2dsZSByZWZsZWN0cyBhbmQgdXBkYXRlcyBgI2NoYXQuYWdlbnQuc2FuZGJveC5lbmFibGVkI2AuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRDb25maWd1cmF0aW9uXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdG1vZGU6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ2ludGVyYWN0aXZlJywgJ3BsYW4nLCAnYXV0b3BpbG90J10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLm1vZGUuaW50ZXJhY3RpdmUnLCBcIkludGVyYWN0aXZlIFx1MjAxNCBzdGVwLWJ5LXN0ZXAgY29sbGFib3JhdGlvbi5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24ubW9kZS5wbGFuJywgXCJQbGFuIFx1MjAxNCBwbGFuIGZpcnN0LCBleGVjdXRlIHdoZW4gcmVhZHkuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLm1vZGUuYXV0b3BpbG90JywgXCJBdXRvcGlsb3QgXHUyMDE0IGF1dG9ub21vdXNseSBpdGVyYXRlIGZyb20gc3RhcnQgdG8gZmluaXNoLlwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbi5tb2RlLmRlc2NyaXB0aW9uJywgXCJUaGUgc3RhcnRpbmcgbW9kZSBmb3IgbmV3IGFnZW50IHNlc3Npb25zLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0YXBwcm92YWxzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogW0NoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQsIENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLkFzc2lzdGVkLCBDaGF0RGVmYXVsdFBlcm1pc3Npb25MZXZlbC5BbGxvd0FsbF0sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLmFwcHJvdmFscy5kZWZhdWx0JywgXCJBc2sgV2hlbiBOZWVkZWQgXHUyMDE0IGFza3Mgd2hlbiBhcHByb3ZhbCBzZXR0aW5ncyBkb24ndCBhcHBseS5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24uYXBwcm92YWxzLmFzc2lzdGVkJywgXCJBc3Npc3RlZCBwZXJtaXNzaW9ucyBcdTIwMTQgZXZhbHVhdGVzIHJpc2sgYmVmb3JlIHJ1bm5pbmcgdG9vbHMuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLmFwcHJvdmFscy5hbGxvd0FsbCcsIFwiQWxsb3cgQWxsIFx1MjAxNCBydW5zIHRvb2wgY2FsbHMgd2l0aG91dCBhc2tpbmcuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogQ2hhdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLmFwcHJvdmFscy5kZXNjcmlwdGlvbicsIFwiVGhlIHN0YXJ0aW5nIGFwcHJvdmFsIGJlaGF2aW9yIGZvciBuZXcgYWdlbnQgc2Vzc2lvbnMuIElmIGVudGVycHJpc2UgcG9saWN5IGRpc2FibGVzIGF1dG8gYXBwcm92YWwsIG5ldyBzZXNzaW9ucyB1c2UgQXNrIFdoZW4gTmVlZGVkLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiB7IG1vZGU6ICdpbnRlcmFjdGl2ZScsIGFwcHJvdmFsczogQ2hhdERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCB9LFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uLnNldHRpbmdEZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgdGhlIGRlZmF1bHQgY29uZmlndXJhdGlvbiBmb3IgbmV3IGFnZW50IHNlc3Npb25zIChzdWNoIGFzIENvcGlsb3QgQ0xJKS4gWW91IGNhbiBzdGlsbCBjaGFuZ2UgdGhlIG1vZGUgYW5kIGFwcHJvdmFsIGJlaGF2aW9yIHBlciBzZXNzaW9uLCBhbmQgZWFjaCBzZXNzaW9uIHJlbWVtYmVycyB3aGF0IHdhcyB1c2VkLlwiKSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0TW9kZWxdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmRlZmF1bHRNb2RlbC5kZXNjcmlwdGlvbicsIFwiVGhlIGRlZmF1bHQgbW9kZWwgZm9yIG5ldyBjaGF0IGNvbnZlcnNhdGlvbnMuIFVzZSBcXFwiYXV0b1xcXCIgdG8gbGV0IENvcGlsb3QgcGljayBhIG1vZGVsLCBhIG1vZGVsIGZhbWlseSBuYW1lIChzdWNoIGFzIFxcXCJvcHVzXFxcIiBvciBcXFwiZ2VtaW5pXFxcIikgdG8gdXNlIHRoZSBsYXRlc3QgYXZhaWxhYmxlIG1vZGVsIGluIHRoYXQgZmFtaWx5LCBvciBhIGZ1bGwgbW9kZWwgaWQuIFlvdSBjYW4gc3RpbGwgc3dpdGNoIHRoZSBtb2RlbCB3aXRoaW4gYSBjb252ZXJzYXRpb247IGVhY2ggbmV3IGNvbnZlcnNhdGlvbiBzdGFydHMgYXQgdGhpcyBtb2RlbC5cIiksXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdERlZmF1bHRNb2RlbCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZE1vZGVsVmFsdWUoKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfTU9ERUxfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5kZWZhdWx0TW9kZWwucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuZGVmYXVsdE1vZGVsLnBvbGljeScsIFwiU2V0cyB0aGUgZGVmYXVsdCBjaGF0IG1vZGVsIGZvciBuZXcgY29udmVyc2F0aW9ucy4gQWNjZXB0cyBcXFwiYXV0b1xcXCIsIGEgbW9kZWwgZmFtaWx5IG5hbWUgKHN1Y2ggYXMgXFxcIm9wdXNcXFwiIG9yIFxcXCJnZW1pbmlcXFwiKSwgb3IgYSBmdWxsIG1vZGVsIGlkLiBVc2VycyBjYW4gc3RpbGwgc3dpdGNoIHRoZSBtb2RlbCB3aXRoaW4gYSBjb252ZXJzYXRpb24uXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZV06IHtcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogZ2xvYmFsQXV0b0FwcHJvdmVEZXNjcmlwdGlvbi52YWx1ZSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05fTUFDSElORSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRUb29sc0F1dG9BcHByb3ZlJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjk5Jyxcblx0XHRcdFx0dmFsdWU6IChwb2xpY3lEYXRhKSA9PiBwb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncz8uW0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldID09PSAnZGlzYWJsZScgfHwgcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfRElTQUJMRV9CWVBBU1NfUEVSTUlTU0lPTlNfTU9ERV9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdhdXRvQXBwcm92ZTMuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnYXV0b0FwcHJvdmUzLmRlc2NyaXB0aW9uJywgJ0dsb2JhbCBhdXRvIGFwcHJvdmUgYWxzbyBrbm93biBhcyBcIllPTE8gbW9kZVwiIGRpc2FibGVzIG1hbnVhbCBhcHByb3ZhbCBjb21wbGV0ZWx5IGZvciBhbGwgdG9vbHMgaW4gYWxsIHdvcmtzcGFjZXMsIGFsbG93aW5nIHRoZSBhZ2VudCB0byBhY3QgZnVsbHkgYXV0b25vbW91c2x5LiBUaGlzIGlzIGV4dHJlbWVseSBkYW5nZXJvdXMgYW5kIGlzICpuZXZlciogcmVjb21tZW5kZWQsIGV2ZW4gY29udGFpbmVyaXplZCBlbnZpcm9ubWVudHMgbGlrZSBDb2Rlc3BhY2VzIGFuZCBEZXYgQ29udGFpbmVycyBoYXZlIHVzZXIga2V5cyBmb3J3YXJkZWQgaW50byB0aGUgY29udGFpbmVyIHRoYXQgY291bGQgYmUgY29tcHJvbWlzZWQuXFxuXFxuVGhpcyBmZWF0dXJlIGRpc2FibGVzIGNyaXRpY2FsIHNlY3VyaXR5IHByb3RlY3Rpb25zIGFuZCBtYWtlcyBpdCBtdWNoIGVhc2llciBmb3IgYW4gYXR0YWNrZXIgdG8gY29tcHJvbWlzZSB0aGUgbWFjaGluZS5cXG5cXG5Ob3RlOiBUaGlzIHNldHRpbmcgb25seSBjb250cm9scyB0b29sIGFwcHJvdmFsIGFuZCBkb2VzIG5vdCBwcmV2ZW50IHRoZSBhZ2VudCBmcm9tIGFza2luZyBxdWVzdGlvbnMuIFRvIGF1dG9tYXRpY2FsbHkgYW5zd2VyIGFnZW50IHF1ZXN0aW9ucywgdXNlIHRoZSBgI2NoYXQuYXV0b1JlcGx5I2Agc2V0dGluZy4nKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TZXNzaW9uU3luY0VuYWJsZWRdOiB7XG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5zZXNzaW9uU3luYy5lbmFibGVkJywgXCJFbmFibGUgc2Vzc2lvbiBzeW5jIHRvIEdpdEh1Yi5jb20uIFdoZW4gZW5hYmxlZCwgQ29waWxvdCBzZXNzaW9uIGRhdGEgaXMgc3luY2VkIHRvIHlvdXIgR2l0SHViIGFjY291bnQgZm9yIGNyb3NzLWRldmljZSBhY2Nlc3MgYW5kIHJpY2hlciBpbnNpZ2h0cy4gUmVxdWlyZXMgYCNnaXRodWIuY29waWxvdC5jaGF0LmxvY2FsSW5kZXguZW5hYmxlZCNgIHRvIGFsc28gYmUgZW5hYmxlZC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH0sXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NvcGlsb3RTZXNzaW9uU3luYycsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjEnLFxuXHRcdFx0XHR2YWx1ZTogKHBvbGljeURhdGEpID0+IHBvbGljeURhdGEuY2xvdWRfc2Vzc2lvbl9zdG9yYWdlX2VuYWJsZWQgPT09IGZhbHNlID8gZmFsc2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LnNlc3Npb25TeW5jLmVuYWJsZWQucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuc2Vzc2lvblN5bmMuZW5hYmxlZC5wb2xpY3knLCBcIkVuYWJsZSBzZXNzaW9uIHN5bmMgdG8gR2l0SHViLmNvbSBmb3IgY3Jvc3MtZGV2aWNlIENvcGlsb3Qgc2Vzc2lvbiBoaXN0b3J5LiBXaGVuIGRpc2FibGVkIGJ5IG9yZ2FuaXphdGlvbiBwb2xpY3ksIHNlc3Npb24gZGF0YSBpcyBrZXB0IGxvY2FsIG9ubHkuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TZXNzaW9uU3luY0V4Y2x1ZGVSZXBvc2l0b3JpZXNdOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnNlc3Npb25TeW5jLmV4Y2x1ZGVSZXBvc2l0b3JpZXMnLCBcIlJlcG9zaXRvcnkgcGF0dGVybnMgdG8gZXhjbHVkZSBmcm9tIHNlc3Npb24gc3luYy4gVXNlIGV4YWN0IGBvd25lci9yZXBvYCBuYW1lcyBvciBnbG9iIHBhdHRlcm5zIGxpa2UgYG15LW9yZy8qYC4gU2Vzc2lvbnMgZnJvbSBtYXRjaGluZyByZXBvc2l0b3JpZXMgd2lsbCBvbmx5IGJlIHN0b3JlZCBsb2NhbGx5LlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQXV0b0FwcHJvdmVFZGl0c106IHtcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0JyoqLyonOiB0cnVlLFxuXHRcdFx0XHQnKiovLnZzY29kZS8qLmpzb24nOiBmYWxzZSxcblx0XHRcdFx0JyoqLy5naXQvKionOiBmYWxzZSxcblx0XHRcdFx0JyoqL3twYWNrYWdlLmpzb24sc2VydmVyLnhtbCxidWlsZC5ycyx3ZWIuY29uZmlnLC5naXRhdHRyaWJ1dGVzLC5lbnYsQ2FyZ28udG9tbH0nOiBmYWxzZSxcblx0XHRcdFx0JyoqLyoue2NvZGUtd29ya3NwYWNlLGNzcHJvaixmc3Byb2osdmJwcm9qLHZjeHByb2oscHJvaix0YXJnZXRzLHByb3BzLGdyYWRsZSxncmFkbGUua3RzfSc6IGZhbHNlLFxuXHRcdFx0XHQnKiovZ3JhZGxlLnByb3BlcnRpZXMnOiBmYWxzZSxcblx0XHRcdFx0JyoqL3J1YnlfbHNwLyovYWRkb24nOiBmYWxzZSwgLy8gQXV0by1pbmNsdWRlZCBSdWJ5IGFkZG9uc1xuXHRcdFx0XHQnKiovKi5sb2NrJzogZmFsc2UsIC8vIHlhcm4ubG9jaywgYnVuLmxvY2ssIGV0Yy5cblx0XHRcdFx0JyoqLyotbG9jay57eWFtbCxqc29ufSc6IGZhbHNlLCAvLyBwbnBtLWxvY2sueWFtbCwgcGFja2FnZS1sb2NrLmpzb25cblx0XHRcdH0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMuYXV0b0FwcHJvdmUuZWRpdHMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZWRpdHMgbWFkZSBieSB0aGUgYWdlbnQgYXJlIGF1dG9tYXRpY2FsbHkgYXBwcm92ZWQuIFRoZSBkZWZhdWx0IGlzIHRvIGFwcHJvdmUgYWxsIGVkaXRzIGV4Y2VwdCB0aG9zZSBtYWRlIHRvIGNlcnRhaW4gZmlsZXMgd2hpY2ggaGF2ZSB0aGUgcG90ZW50aWFsIHRvIGNhdXNlIGltbWVkaWF0ZSB1bmludGVuZGVkIHNpZGUtZWZmZWN0cywgc3VjaCBhcyBgKiovLnZzY29kZS8qLmpzb25gLlxcblxcblNldCB0byBgdHJ1ZWAgdG8gYXV0b21hdGljYWxseSBhcHByb3ZlIGVkaXRzIHRvIG1hdGNoaW5nIGZpbGVzLCBgZmFsc2VgIHRvIGFsd2F5cyByZXF1aXJlIGV4cGxpY2l0IGFwcHJvdmFsLiBUaGUgbGFzdCBwYXR0ZXJuIG1hdGNoaW5nIGEgZ2l2ZW4gZmlsZSB3aWxsIGRldGVybWluZSB3aGV0aGVyIHRoZSBlZGl0IGlzIGF1dG9tYXRpY2FsbHkgYXBwcm92ZWQuXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQXV0b0FwcHJvdmVkVXJsc106IHtcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tJzogdHJ1ZSxcblx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3dpa2kvKic6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLmZldGNoUGFnZS5hcHByb3ZlZFVybHMnLCBcIkNvbnRyb2xzIHdoaWNoIFVSTHMgYXJlIGF1dG9tYXRpY2FsbHkgYXBwcm92ZWQgd2hlbiByZXF1ZXN0ZWQgYnkgY2hhdCB0b29scy4gS2V5cyBhcmUgVVJMIHBhdHRlcm5zIGFuZCB2YWx1ZXMgY2FuIGJlIGB0cnVlYCB0byBhcHByb3ZlIGJvdGggcmVxdWVzdHMgYW5kIHJlc3BvbnNlcywgYGZhbHNlYCB0byBkZW55LCBvciBhbiBvYmplY3Qgd2l0aCBgYXBwcm92ZVJlcXVlc3RgIGFuZCBgYXBwcm92ZVJlc3BvbnNlYCBwcm9wZXJ0aWVzIGZvciBncmFudWxhciBjb250cm9sLlxcblxcbkV4YW1wbGVzOlxcbi0gYFxcXCJodHRwczovL2V4YW1wbGUuY29tXFxcIjogdHJ1ZWAgLSBBcHByb3ZlIGFsbCByZXF1ZXN0cyB0byBleGFtcGxlLmNvbVxcbi0gYFxcXCJodHRwczovLyouZXhhbXBsZS5jb21cXFwiOiB0cnVlYCAtIEFwcHJvdmUgYWxsIHJlcXVlc3RzIHRvIGFueSBzdWJkb21haW4gb2YgZXhhbXBsZS5jb21cXG4tIGBcXFwiaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvKlxcXCI6IHsgXFxcImFwcHJvdmVSZXF1ZXN0XFxcIjogdHJ1ZSwgXFxcImFwcHJvdmVSZXNwb25zZVxcXCI6IGZhbHNlIH1gIC0gQXBwcm92ZSByZXF1ZXN0cyBidXQgbm90IHJlc3BvbnNlcyBmb3IgZXhhbXBsZS5jb20vYXBpIHBhdGhzXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGFwcHJvdmVSZXF1ZXN0OiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdFx0XHRhcHByb3ZlUmVzcG9uc2U6IHsgdHlwZTogJ2Jvb2xlYW4nIH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FbGlnaWJsZUZvckF1dG9BcHByb3ZhbF06IHtcblx0XHRcdGRlZmF1bHQ6IHt9LFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLmVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsJywgJ0NvbnRyb2xzIHdoaWNoIHRvb2xzIGFyZSBlbGlnaWJsZSBmb3IgYXV0b21hdGljIGFwcHJvdmFsLiBUb29scyBzZXQgdG8gXFwnZmFsc2VcXCcgd2lsbCBhbHdheXMgcHJlc2VudCBhIGNvbmZpcm1hdGlvbiBhbmQgd2lsbCBuZXZlciBvZmZlciB0aGUgb3B0aW9uIHRvIGF1dG8tYXBwcm92ZS4gVGhlIGRlZmF1bHQgYmVoYXZpb3IgKG9yIHNldHRpbmcgYSB0b29sIHRvIFxcJ3RydWVcXCcpIG1heSByZXN1bHQgaW4gdGhlIHRvb2wgb2ZmZXJpbmcgYXV0by1hcHByb3ZhbCBvcHRpb25zLicpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0eU5hbWVzOiB7XG5cdFx0XHRcdGVudW06IHRvb2xSZWZlcmVuY2VOYW1lRW51bVZhbHVlcyxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogdG9vbFJlZmVyZW5jZU5hbWVFbnVtRGVzY3JpcHRpb25zLFxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdH0sXG5cdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0J2ZldGNoJzogZmFsc2UsXG5cdFx0XHRcdFx0J3J1blRhc2snOiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0VG9vbHNFbGlnaWJsZUZvckF1dG9BcHByb3ZhbCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMDcnLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC50b29scy5lbGlnaWJsZUZvckF1dG9BcHByb3ZhbCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLmVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsJywgJ0NvbnRyb2xzIHdoaWNoIHRvb2xzIGFyZSBlbGlnaWJsZSBmb3IgYXV0b21hdGljIGFwcHJvdmFsLiBUb29scyBzZXQgdG8gXFwnZmFsc2VcXCcgd2lsbCBhbHdheXMgcHJlc2VudCBhIGNvbmZpcm1hdGlvbiBhbmQgd2lsbCBuZXZlciBvZmZlciB0aGUgb3B0aW9uIHRvIGF1dG8tYXBwcm92ZS4gVGhlIGRlZmF1bHQgYmVoYXZpb3IgKG9yIHNldHRpbmcgYSB0b29sIHRvIFxcJ3RydWVcXCcpIG1heSByZXN1bHQgaW4gdGhlIHRvb2wgb2ZmZXJpbmcgYXV0by1hcHByb3ZhbCBvcHRpb25zLicpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkFydGlmYWN0c0VuYWJsZWRdOiB7XG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGFydGlmYWN0cyB2aWV3IGlzIGF2YWlsYWJsZSBpbiBjaGF0LlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ11cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5BcnRpZmFjdHNSdWxlc0J5TWltZVR5cGVdOiB7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdCdpbWFnZS8qJzogeyBncm91cE5hbWU6ICdTY3JlZW5zaG90cycsIG9ubHlTaG93R3JvdXA6IHRydWUgfVxuXHRcdFx0fSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLnJ1bGVzLmJ5TWltZVR5cGUnLCBcIlJ1bGVzIGZvciBleHRyYWN0aW5nIGFydGlmYWN0cyBmcm9tIHRvb2wgcmVzdWx0cyBieSBNSU1FIHR5cGUuIE1hcHMgTUlNRSB0eXBlIHBhdHRlcm5zIChlLmcuICdpbWFnZS8qJykgdG8gZ3JvdXAgY29uZmlndXJhdGlvbi5cIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0Z3JvdXBOYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5ydWxlcy5ncm91cE5hbWUnLCBcIkRpc3BsYXkgbmFtZSBmb3IgdGhlIGFydGlmYWN0IGdyb3VwLlwiKSB9LFxuXHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5ydWxlcy5vbmx5U2hvd0dyb3VwJywgXCJXaGVuIHRydWUsIHNob3cgb25seSB0aGUgZ3JvdXAgaGVhZGVyIGluc3RlYWQgb2YgaW5kaXZpZHVhbCBpdGVtcy5cIikgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydncm91cE5hbWUnXVxuXHRcdFx0fSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ11cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5BcnRpZmFjdHNSdWxlc0J5RmlsZVBhdGhdOiB7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdCcqKi8qcGxhbioubWQnOiB7IGdyb3VwTmFtZTogJ1BsYW5zJyB9XG5cdFx0XHR9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMucnVsZXMuYnlGaWxlUGF0aCcsIFwiUnVsZXMgZm9yIGV4dHJhY3RpbmcgYXJ0aWZhY3RzIGZyb20gd3JpdHRlbiBmaWxlcyBieSBmaWxlIHBhdGggcGF0dGVybi4gTWFwcyBnbG9iIHBhdHRlcm5zIHRvIGdyb3VwIGNvbmZpZ3VyYXRpb24uXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGdyb3VwTmFtZTogeyB0eXBlOiAnc3RyaW5nJywgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMucnVsZXMuYnlGaWxlUGF0aC5ncm91cE5hbWUnLCBcIkRpc3BsYXkgbmFtZSBmb3IgdGhlIGFydGlmYWN0IGdyb3VwLlwiKSB9LFxuXHRcdFx0XHRcdG9ubHlTaG93R3JvdXA6IHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5ydWxlcy5ieUZpbGVQYXRoLm9ubHlTaG93R3JvdXAnLCBcIldoZW4gdHJ1ZSwgc2hvdyBvbmx5IHRoZSBncm91cCBoZWFkZXIgaW5zdGVhZCBvZiBpbmRpdmlkdWFsIGl0ZW1zLlwiKSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ2dyb3VwTmFtZSddXG5cdFx0XHR9LFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkFydGlmYWN0c1J1bGVzQnlNZW1vcnlGaWxlUGF0aF06IHtcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0JyoqLypwbGFuKi5tZCc6IHsgZ3JvdXBOYW1lOiAnUGxhbnMnIH1cblx0XHRcdH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFydGlmYWN0cy5ydWxlcy5ieU1lbW9yeUZpbGVQYXRoJywgXCJSdWxlcyBmb3IgZXh0cmFjdGluZyBhcnRpZmFjdHMgZnJvbSBtZW1vcnkgdG9vbCBjYWxscyBieSBtZW1vcnkgZmlsZSBwYXRoIHBhdHRlcm4uIE1hcHMgZ2xvYiBwYXR0ZXJucyB0byBncm91cCBjb25maWd1cmF0aW9uLlwiKSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRncm91cE5hbWU6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYXJ0aWZhY3RzLnJ1bGVzLmJ5TWVtb3J5RmlsZVBhdGguZ3JvdXBOYW1lJywgXCJEaXNwbGF5IG5hbWUgZm9yIHRoZSBhcnRpZmFjdCBncm91cC5cIikgfSxcblx0XHRcdFx0XHRvbmx5U2hvd0dyb3VwOiB7IHR5cGU6ICdib29sZWFuJywgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hcnRpZmFjdHMucnVsZXMuYnlNZW1vcnlGaWxlUGF0aC5vbmx5U2hvd0dyb3VwJywgXCJXaGVuIHRydWUsIHNob3cgb25seSB0aGUgZ3JvdXAgaGVhZGVyIGluc3RlYWQgb2YgaW5kaXZpZHVhbCBpdGVtcy5cIikgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydncm91cE5hbWUnXVxuXHRcdFx0fSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ11cblx0XHR9LFxuXHRcdCdjaGF0LnVuZG9SZXF1ZXN0cy5yZXN0b3JlSW5wdXQnOiB7XG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnVuZG9SZXF1ZXN0cy5yZXN0b3JlSW5wdXQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGlucHV0IG9mIHRoZSBjaGF0IHNob3VsZCBiZSByZXN0b3JlZCB3aGVuIGFuIHVuZG8gcmVxdWVzdCBpcyBtYWRlLiBUaGUgaW5wdXQgd2lsbCBiZSBmaWxsZWQgd2l0aCB0aGUgdGV4dCBvZiB0aGUgcmVxdWVzdCB0aGF0IHdhcyByZXN0b3JlZC5cIiksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0fSxcblx0XHQnY2hhdC5lZGl0UmVxdWVzdHMnOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZWRpdFJlcXVlc3RzJywgXCJFbmFibGVzIGVkaXRpbmcgb2YgcmVxdWVzdHMgaW4gdGhlIGNoYXQuIFRoaXMgYWxsb3dzIHlvdSB0byBjaGFuZ2UgdGhlIHJlcXVlc3QgY29udGVudCBhbmQgcmVzdWJtaXQgaXQgdG8gdGhlIG1vZGVsLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydpbmxpbmUnLCAnaG92ZXInLCAnaW5wdXQnLCAnbm9uZSddLFxuXHRcdFx0ZGVmYXVsdDogJ2lubGluZScsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC52aWV3U2Vzc2lvbnMuZW5hYmxlZCcsIFwiU2hvdyBjaGF0IGFnZW50IHNlc3Npb25zIHdoZW4gY2hhdCBpcyBlbXB0eSBvciB0byB0aGUgc2lkZSB3aGVuIGNoYXQgdmlldyBpcyB3aWRlIGVub3VnaC5cIiksXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogZmFsc2UgfSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zT3JpZW50YXRpb25dOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnc3RhY2tlZCcsICdzaWRlQnlTaWRlJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC52aWV3U2Vzc2lvbnMub3JpZW50YXRpb24uc3RhY2tlZCcsIFwiRGlzcGxheSBjaGF0IHNlc3Npb25zIHZlcnRpY2FsbHkgc3RhY2tlZCBhYm92ZSB0aGUgY2hhdCBpbnB1dCB1bmxlc3MgYSBjaGF0IHNlc3Npb24gaXMgdmlzaWJsZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC52aWV3U2Vzc2lvbnMub3JpZW50YXRpb24uc2lkZUJ5U2lkZScsIFwiRGlzcGxheSBjaGF0IHNlc3Npb25zIHNpZGUgYnkgc2lkZSBpZiBzcGFjZSBpcyBzdWZmaWNpZW50LCBvdGhlcndpc2UgZmFsbGJhY2sgdG8gc3RhY2tlZCBhYm92ZSB0aGUgY2hhdCBpbnB1dCB1bmxlc3MgYSBjaGF0IHNlc3Npb24gaXMgdmlzaWJsZS5cIilcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnc2lkZUJ5U2lkZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnZpZXdTZXNzaW9ucy5vcmllbnRhdGlvbicsIFwiQ29udHJvbHMgdGhlIG9yaWVudGF0aW9uIG9mIHRoZSBjaGF0IGFnZW50IHNlc3Npb25zIHZpZXcgd2hlbiBpdCBpcyBzaG93biBhbG9uZ3NpZGUgdGhlIGNoYXQuXCIpLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3UHJvZ3Jlc3NCYWRnZUVuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudmlld1Byb2dyZXNzQmFkZ2UuZW5hYmxlZCcsIFwiU2hvdyBhIHByb2dyZXNzIGJhZGdlIG9uIHRoZSBjaGF0IHZpZXcgd2hlbiBhbiBhZ2VudCBzZXNzaW9uIGlzIGluIHByb2dyZXNzIHRoYXQgaXMgb3BlbmVkIGluIHRoYXQgdmlldy5cIiksXG5cdFx0fSxcblx0XHRbQ2hhdFNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZ1NldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhcmNoaXZlJywgJ2RvbmUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5zZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuYXJjaGl2ZScsIFwiVXNlIEFyY2hpdmUsIEFyY2hpdmUgQWxsLCBVbmFyY2hpdmUsIGFuZCBVbmFyY2hpdmUgQWxsLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5zZXNzaW9uQXJjaGl2ZUFjdGlvbldvcmRpbmcuZG9uZScsIFwiVXNlIE1hcmsgYXMgRG9uZSwgTWFyayBBbGwgYXMgRG9uZSwgUmVzdG9yZSwgYW5kIFJlc3RvcmUgQWxsLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnYXJjaGl2ZScsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXhwZXJpbWVudGFsLnNlc3Npb25BcmNoaXZlQWN0aW9uV29yZGluZycsIFwiQ29udHJvbHMgdGhlIHdvcmRpbmcgYW5kIGljb25zIHVzZWQgYnkgYWN0aW9ucyB0aGF0IGFyY2hpdmUgYW5kIHVuYXJjaGl2ZSBjaGF0IHNlc3Npb25zLlwiKSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5BZ2VudHNIYW5kb2ZmVGlwTW9kZV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydoaWRkZW4nLCAnZGVmYXVsdCcsICdjdXN0b20nXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmZUaXAubW9kZS5oaWRkZW4nLCBcIk5ldmVyIHNob3cgdGhlIGhhbmRvZmYgdGlwLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmZUaXAubW9kZS5kZWZhdWx0JywgXCJTaG93IHRoZSBoYW5kb2ZmIHRpcCB3aXRoIHRoZSBkZWZhdWx0IGRlc2NyaXB0aW9uLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmZUaXAubW9kZS5jdXN0b20nLCBcIlNob3cgdGhlIGhhbmRvZmYgdGlwIHdpdGggYW4gYWx0ZXJuYXRlIGRlc2NyaXB0aW9uLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnaGlkZGVuJyxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdzdGFydHVwJyB9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudHNIYW5kb2ZmVGlwLm1vZGUnLCBcIkNvbnRyb2xzIHRoZSB0aXAgc2hvd24gYWJvdmUgdGhlIGNoYXQgaW5wdXQgb2ZmZXJpbmcgdG8gY29udGludWUgZWxpZ2libGUgYWdlbnQgc2Vzc2lvbnMgaW4gdGhlIEFnZW50cyBXaW5kb3cuXCIpLFxuXHRcdH0sXG5cdFx0W0NsYXVkZVByZWZlckFnZW50SG9zdEFnZW50c1NldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudHMuY2xhdWRlLnByZWZlckFnZW50SG9zdCcsIFwiV2hlbiBlbmFibGVkLCBDbGF1ZGUgc2Vzc2lvbnMgb3BlbmVkIGZyb20gdGhlIEFnZW50cyBXaW5kb3cgcnVuIGluc2lkZSB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzIGluc3RlYWQgb2YgdGhlIEdpdEh1YiBDb3BpbG90IENoYXQgZXh0ZW5zaW9uLiBPbmx5IG9uZSBDbGF1ZGUgaW1wbGVtZW50YXRpb24gc3VyZmFjZXMgcGVyIHdpbmRvdy4gUmVxdWlyZXMgYCNjaGF0LmFnZW50SG9zdC5lbmFibGVkI2AuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdzdGFydHVwJyB9LFxuXHRcdH0sXG5cdFx0W0NsYXVkZVByZWZlckFnZW50SG9zdEVkaXRvclNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZWRpdG9yLmNsYXVkZS5wcmVmZXJBZ2VudEhvc3QnLCBcIldoZW4gZW5hYmxlZCwgQ2xhdWRlIHNlc3Npb25zIG9wZW5lZCBmcm9tIHRoZSByZWd1bGFyIHdvcmtiZW5jaCAoc2lkZWJhciBjaGF0KSBydW4gaW5zaWRlIHRoZSBhZ2VudCBob3N0IHByb2Nlc3MgaW5zdGVhZCBvZiB0aGUgR2l0SHViIENvcGlsb3QgQ2hhdCBleHRlbnNpb24uIE9ubHkgb25lIENsYXVkZSBpbXBsZW1lbnRhdGlvbiBzdXJmYWNlcyBwZXIgd2luZG93LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHR9LFxuXHRcdFtDb2RleFByZWZlckFnZW50SG9zdEVkaXRvclNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5lZGl0b3IuY29kZXgucHJlZmVyQWdlbnRIb3N0JywgXCJXaGVuIGVuYWJsZWQsIENvZGV4IHNlc3Npb25zIG9wZW5lZCBmcm9tIHRoZSByZWd1bGFyIHdvcmtiZW5jaCAoc2lkZWJhciBjaGF0KSBydW4gaW5zaWRlIHRoZSBhZ2VudCBob3N0IHByb2Nlc3MgdXNpbmcgdGhlIENvZGV4IEFwcCBTZXJ2ZXIgaW5zdGVhZCBvZiB0aGUgT3BlbkFJIGV4dGVuc2lvbi4gT25seSBvbmUgQ29kZXggaW1wbGVtZW50YXRpb24gc3VyZmFjZXMgcGVyIHdpbmRvdy4gUmVxdWlyZXMgYCNjaGF0LmFnZW50SG9zdC5lbmFibGVkI2AgYW5kIGAjY2hhdC5hZ2VudEhvc3QuY29kZXhBZ2VudC5lbmFibGVkI2AuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q29udGV4dFVzYWdlRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmNvbnRleHRVc2FnZS5lbmFibGVkJywgXCJTaG93IHRoZSBjb250ZXh0IHdpbmRvdyB1c2FnZSBpbmRpY2F0b3IgaW4gdGhlIGNoYXQgaW5wdXQuXCIpLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlZlcmJvc2VdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC52ZXJib3NlJywgXCJTaG93IHJlcXVlc3QgYW5kIGNvbXBsZXRpb24gdGltZXN0YW1wcy4gSG92ZXIgb3ZlciBhIGNvbXBsZXRpb24gdGltZXN0YW1wIHRvIHNob3cgdGhlIGVsYXBzZWQgcmVzcG9uc2UgdGltZS5cIiksXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUHJvZ3Jlc3NCb3JkZXJdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnByb2dyZXNzQm9yZGVyLmVuYWJsZWQnLCBcIlNob3cgYW4gYW5pbWF0ZWQgZ3JhZGllbnQgYm9yZGVyIGFyb3VuZCB0aGUgY2hhdCBpbnB1dCB3aGlsZSB0aGUgYWdlbnQgaXMgd29ya2luZyBvciB0aGlua2luZy4gSGFzIG5vIGVmZmVjdCB3aGVuIHJlZHVjZWQgbW90aW9uIGlzIGVuYWJsZWQuXCIpLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLk5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydvZmYnLCAnd2luZG93Tm90Rm9jdXNlZCcsICdhbHdheXMnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0Lm5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZC5vZmYnLCBcIk5ldmVyIHNob3cgT1Mgbm90aWZpY2F0aW9ucyBmb3IgcmVzcG9uc2VzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0Lm5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZC53aW5kb3dOb3RGb2N1c2VkJywgXCJTaG93IE9TIG5vdGlmaWNhdGlvbnMgZm9yIHJlc3BvbnNlcyB3aGVuIHRoZSB3aW5kb3cgaXMgbm90IGZvY3VzZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQubm90aWZ5V2luZG93T25SZXNwb25zZVJlY2VpdmVkLmFsd2F5cycsIFwiQWx3YXlzIHNob3cgT1Mgbm90aWZpY2F0aW9ucyBmb3IgcmVzcG9uc2VzLCBldmVuIHdoZW4gdGhlIHdpbmRvdyBpcyBmb2N1c2VkLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnd2luZG93Tm90Rm9jdXNlZCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm5vdGlmeVdpbmRvd09uUmVzcG9uc2VSZWNlaXZlZCcsIFwiQ29udHJvbHMgd2hldGhlciBhIGNoYXQgc2Vzc2lvbiBzaG91bGQgcHJlc2VudCB0aGUgdXNlciB3aXRoIGFuIE9TIG5vdGlmaWNhdGlvbiB3aGVuIGEgcmVzcG9uc2UgaXMgcmVjZWl2ZWQuIFRoaXMgaW5jbHVkZXMgYSB3aW5kb3cgYmFkZ2UgYXMgd2VsbCBhcyBub3RpZmljYXRpb24gdG9hc3QuXCIpLFxuXHRcdH0sXG5cdFx0J2NoYXQuY2hlY2twb2ludHMuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmNoZWNrcG9pbnRzLmVuYWJsZWQnLCBcIkVuYWJsZXMgY2hlY2twb2ludHMgaW4gY2hhdC4gQ2hlY2twb2ludHMgYWxsb3cgeW91IHRvIHJlc3RvcmUgdGhlIGNoYXQgdG8gYSBwcmV2aW91cyBzdGF0ZS5cIiksXG5cdFx0fSxcblx0XHQnY2hhdC5jaGVja3BvaW50cy5zaG93RmlsZUNoYW5nZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmNoZWNrcG9pbnRzLnNob3dGaWxlQ2hhbmdlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IGNoYXQgY2hlY2twb2ludCBmaWxlIGNoYW5nZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHNdOiB7XG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0Y2hhbmdlczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnR1cm5TdGF0dXNQaWxscy5jaGFuZ2VzJywgXCJTaG93IGEgcGlsbCBzdW1tYXJpemluZyB0aGUgZmlsZXMgY2hhbmdlZCBhbmQgdGhlIGxpbmVzIGFkZGVkIGFuZCByZW1vdmVkIGluIHRoZSB0dXJuLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmV2aWV3OiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudHVyblN0YXR1c1BpbGxzLnByZXZpZXcnLCBcIlNob3cgYSBwaWxsIHRvIHByZXZpZXcgYSBNYXJrZG93biBvciBIVE1MIGZpbGUgY3JlYXRlZCBvciBlZGl0ZWQgaW4gdGhlIHR1cm4uXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGJyb3dzZXI6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC50dXJuU3RhdHVzUGlsbHMuYnJvd3NlcicsIFwiU2hvdyBhIHBpbGwgZm9yIGJyb3dzZXIgYWN0aXZpdHkgaW4gdGhlIHR1cm4uXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnY2hhdC50dXJuU3RhdHVzUGlsbHMub2JqZWN0RGVwcmVjYXRlZCcsIFwiVGhlIHBlci1waWxsIG9iamVjdCBmb3JtIGlzIGRlcHJlY2F0ZWQuIFVzZSBhIGJvb2xlYW4gdmFsdWUgaW5zdGVhZC5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnR1cm5TdGF0dXNQaWxscycsIFwiQ29udHJvbHMgd2hldGhlciBhZ2VudCBzdGF0dXMgcGlsbHMgYXJlIHNob3duIGFib3ZlIHRoZSBjaGF0IGlucHV0IHdoaWxlIGEgdHVybiBpcyBpbiBwcm9ncmVzcyBhbmQgaW5zaWRlIHRoZSBjb21wbGV0ZWQgcmVzcG9uc2UuIE9ubHkgYXBwbGllcyB0byBhZ2VudCBzZXNzaW9ucy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdH0sXG5cdFx0W21jcEFjY2Vzc0NvbmZpZ106IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzJywgXCJDb250cm9scyBhY2Nlc3MgdG8gaW5zdGFsbGVkIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgc2VydmVycy5cIiksXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdE1jcEFjY2Vzc1ZhbHVlLk5vbmUsXG5cdFx0XHRcdE1jcEFjY2Vzc1ZhbHVlLlJlZ2lzdHJ5LFxuXHRcdFx0XHRNY3BBY2Nlc3NWYWx1ZS5BbGxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLm5vbmUnLCBcIk5vIGFjY2VzcyB0byBNQ1Agc2VydmVycy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLnJlZ2lzdHJ5JywgXCJBbGxvd3MgYWNjZXNzIHRvIE1DUCBzZXJ2ZXJzIGxpc3RlZCBpbiB0aGUgcmVnaXN0cnkgdGhhdCBWUyBDb2RlIGlzIGNvbm5lY3RlZCB0by5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLmFueScsIFwiQWxsb3cgYWNjZXNzIHRvIGFueSBpbnN0YWxsZWQgTUNQIHNlcnZlci5cIilcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiBNY3BBY2Nlc3NWYWx1ZS5BbGwsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRNQ1AnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuOTknLFxuXHRcdFx0XHR2YWx1ZTogKHBvbGljeURhdGEpID0+IHtcblx0XHRcdFx0XHRpZiAocG9saWN5RGF0YS5tY3AgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gTWNwQWNjZXNzVmFsdWUuTm9uZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBvbGljeURhdGEubWNwQWNjZXNzID09PSAncmVnaXN0cnlfb25seScpIHtcblx0XHRcdFx0XHRcdHJldHVybiBNY3BBY2Nlc3NWYWx1ZS5SZWdpc3RyeTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQubWNwLmFjY2VzcycsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5hY2Nlc3MnLCBcIkNvbnRyb2xzIGFjY2VzcyB0byBpbnN0YWxsZWQgTW9kZWwgQ29udGV4dCBQcm90b2NvbCBzZXJ2ZXJzLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdjaGF0Lm1jcC5hY2Nlc3Mubm9uZScsIHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFjY2Vzcy5ub25lJywgXCJObyBhY2Nlc3MgdG8gTUNQIHNlcnZlcnMuXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5tY3AuYWNjZXNzLnJlZ2lzdHJ5JywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLnJlZ2lzdHJ5JywgXCJBbGxvd3MgYWNjZXNzIHRvIE1DUCBzZXJ2ZXJzIGxpc3RlZCBpbiB0aGUgcmVnaXN0cnkgdGhhdCBWUyBDb2RlIGlzIGNvbm5lY3RlZCB0by5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICdjaGF0Lm1jcC5hY2Nlc3MuYW55JywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWNjZXNzLmFueScsIFwiQWxsb3cgYWNjZXNzIHRvIGFueSBpbnN0YWxsZWQgTUNQIHNlcnZlci5cIilcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbbWNwQWxsb3dlZFNlcnZlcnNDb25maWddOiB7XG5cdFx0XHR0eXBlOiBbJ2FycmF5JywgJ251bGwnXSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRzZXJ2ZXJOYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDEsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFsbG93ZWRTZXJ2ZXJzLnNlcnZlck5hbWUnLCBcIk1hdGNoIGEgc2VydmVyIGJ5IGl0cyBjb25maWd1cmVkIG5hbWUuXCIpIH0sXG5cdFx0XHRcdFx0c2VydmVyVXJsOiB7IHR5cGU6ICdzdHJpbmcnLCBtaW5MZW5ndGg6IDEsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFsbG93ZWRTZXJ2ZXJzLnNlcnZlclVybCcsIFwiTWF0Y2ggYSByZW1vdGUgc2VydmVyIGJ5IGl0cyBVUkwuIFN1cHBvcnRzIGAqYCB3aWxkY2FyZHMsIGZvciBleGFtcGxlIGBodHRwczovLyouZXhhbXBsZS5jb20vKmAuXCIpIH0sXG5cdFx0XHRcdFx0c2VydmVyQ29tbWFuZDogeyB0eXBlOiAnYXJyYXknLCBtaW5JdGVtczogMSwgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSwgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWxsb3dlZFNlcnZlcnMuc2VydmVyQ29tbWFuZCcsIFwiTWF0Y2ggYSBsb2NhbCBzZXJ2ZXIgYnkgaXRzIGV4YWN0IGNvbW1hbmQgaW52b2NhdGlvbiwgZ2l2ZW4gYXMgdGhlIGNvbW1hbmQgZm9sbG93ZWQgYnkgaXRzIGFyZ3VtZW50cy5cIikgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHR7IHJlcXVpcmVkOiBbJ3NlcnZlck5hbWUnXSB9LFxuXHRcdFx0XHRcdHsgcmVxdWlyZWQ6IFsnc2VydmVyVXJsJ10gfSxcblx0XHRcdFx0XHR7IHJlcXVpcmVkOiBbJ3NlcnZlckNvbW1hbmQnXSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWxsb3dlZFNlcnZlcnMnLCBcIkVudGVycHJpc2UtbWFuYWdlZCBhbGxvd2xpc3QgdGhhdCBjb250cm9scyB3aGljaCBNb2RlbCBDb250ZXh0IFByb3RvY29sIHNlcnZlcnMgbWF5IGJlIGluc3RhbGxlZCBhbmQgcnVuLiBXaGVuIHNldCwgb25seSBzZXJ2ZXJzIG1hdGNoaW5nIGFuIGVudHJ5IGFyZSBwZXJtaXR0ZWQ7IGFueSBvdGhlciBzZXJ2ZXIgaXMgYmxvY2tlZC4gU2VydmVycyBjYW4gYmUgbWF0Y2hlZCBieSBuYW1lLCByZW1vdGUgVVJMIHBhdHRlcm4gKHdpdGggYCpgIHdpbGRjYXJkcyksIG9yIGxvY2FsIGNvbW1hbmQgaW52b2NhdGlvbi4gT21pdCBlbnRpcmVseSB0byBhbGxvdyBhbGwgc2VydmVycyAoc3ViamVjdCB0byB0aGUgZGVueSBsaXN0KS4gRGVsaXZlcmVkIHZpYSBlbnRlcnByaXNlIHBvbGljeSBmb3IgZ292ZXJuYW5jZTsgdGhpcyBzZXR0aW5nIGlzIG5vdCBzdXJmYWNlZCB0byBlbmQgdXNlcnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHQvLyBHb3Zlcm5hbmNlLW9ubHk6IGRlbGl2ZXJlZCB2aWEgdGhlIGBDaGF0QWxsb3dlZE1jcFNlcnZlcnNgIGVudGVycHJpc2UgcG9saWN5IGFuZCBoaWRkZW5cblx0XHRcdC8vIGZyb20gdGhlIFNldHRpbmdzIFVJIHNvIGl0IGlzIG5vdCBjb25maWd1cmFibGUgYnkgZW5kIHVzZXJzLlxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0QWxsb3dlZE1jcFNlcnZlcnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTMwJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9BTExPV0VEX01DUF9TRVJWRVJTX0tFWSksXG5cdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFtDT1BJTE9UX0FMTE9XRURfTUNQX1NFUlZFUlNfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5tY3AuYWxsb3dlZFNlcnZlcnMucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFsbG93ZWRTZXJ2ZXJzLnBvbGljeScsIFwiQWxsb3dsaXN0IG9mIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgc2VydmVycy4gV2hlbiBzZXQsIG9ubHkgc2VydmVycyBtYXRjaGluZyBhbiBlbnRyeSBtYXkgYmUgaW5zdGFsbGVkIG9yIHJ1bjsgb21pdCBlbnRpcmVseSB0byBhbGxvdyBhbGwgc2VydmVycyAoc3ViamVjdCB0byB0aGUgZGVueSBsaXN0KS5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbbWNwRGVuaWVkU2VydmVyc0NvbmZpZ106IHtcblx0XHRcdHR5cGU6IFsnYXJyYXknLCAnbnVsbCddLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHNlcnZlck5hbWU6IHsgdHlwZTogJ3N0cmluZycsIG1pbkxlbmd0aDogMSwgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuZGVuaWVkU2VydmVycy5zZXJ2ZXJOYW1lJywgXCJNYXRjaCBhIHNlcnZlciBieSBpdHMgY29uZmlndXJlZCBuYW1lLlwiKSB9LFxuXHRcdFx0XHRcdHNlcnZlclVybDogeyB0eXBlOiAnc3RyaW5nJywgbWluTGVuZ3RoOiAxLCBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5kZW5pZWRTZXJ2ZXJzLnNlcnZlclVybCcsIFwiTWF0Y2ggYSByZW1vdGUgc2VydmVyIGJ5IGl0cyBVUkwuIFN1cHBvcnRzIGAqYCB3aWxkY2FyZHMsIGZvciBleGFtcGxlIGBodHRwczovLyouZXhhbXBsZS5jb20vKmAuXCIpIH0sXG5cdFx0XHRcdFx0c2VydmVyQ29tbWFuZDogeyB0eXBlOiAnYXJyYXknLCBtaW5JdGVtczogMSwgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSwgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuZGVuaWVkU2VydmVycy5zZXJ2ZXJDb21tYW5kJywgXCJNYXRjaCBhIGxvY2FsIHNlcnZlciBieSBpdHMgZXhhY3QgY29tbWFuZCBpbnZvY2F0aW9uLCBnaXZlbiBhcyB0aGUgY29tbWFuZCBmb2xsb3dlZCBieSBpdHMgYXJndW1lbnRzLlwiKSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdHsgcmVxdWlyZWQ6IFsnc2VydmVyTmFtZSddIH0sXG5cdFx0XHRcdFx0eyByZXF1aXJlZDogWydzZXJ2ZXJVcmwnXSB9LFxuXHRcdFx0XHRcdHsgcmVxdWlyZWQ6IFsnc2VydmVyQ29tbWFuZCddIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5kZW5pZWRTZXJ2ZXJzJywgXCJFbnRlcnByaXNlLW1hbmFnZWQgZGVueWxpc3Qgb2YgTW9kZWwgQ29udGV4dCBQcm90b2NvbCBzZXJ2ZXJzLiBTZXJ2ZXJzIG1hdGNoaW5nIGFueSBlbnRyeSBhcmUgdW5jb25kaXRpb25hbGx5IGJsb2NrZWQgZnJvbSBiZWluZyBpbnN0YWxsZWQgb3IgcnVuLCBldmVuIGlmIHRoZXkgYWxzbyBtYXRjaCB0aGUgYWxsb3cgbGlzdCBcdTIwMTQgZGVueSBydWxlcyBhbHdheXMgdGFrZSBwcmVjZWRlbmNlLiBTZXJ2ZXJzIGNhbiBiZSBtYXRjaGVkIGJ5IG5hbWUsIHJlbW90ZSBVUkwgcGF0dGVybiAod2l0aCBgKmAgd2lsZGNhcmRzKSwgb3IgbG9jYWwgY29tbWFuZCBpbnZvY2F0aW9uLiBEZWxpdmVyZWQgdmlhIGVudGVycHJpc2UgcG9saWN5IGZvciBnb3Zlcm5hbmNlOyB0aGlzIHNldHRpbmcgaXMgbm90IHN1cmZhY2VkIHRvIGVuZCB1c2Vycy5cIiksXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdC8vIEdvdmVybmFuY2Utb25seTogZGVsaXZlcmVkIHZpYSB0aGUgYENoYXREZW5pZWRNY3BTZXJ2ZXJzYCBlbnRlcnByaXNlIHBvbGljeSBhbmQgaGlkZGVuXG5cdFx0XHQvLyBmcm9tIHRoZSBTZXR0aW5ncyBVSSBzbyBpdCBpcyBub3QgY29uZmlndXJhYmxlIGJ5IGVuZCB1c2Vycy5cblx0XHRcdGluY2x1ZGVkOiBmYWxzZSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdERlbmllZE1jcFNlcnZlcnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTMwJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9ERU5JRURfTUNQX1NFUlZFUlNfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfREVOSUVEX01DUF9TRVJWRVJTX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQubWNwLmRlbmllZFNlcnZlcnMucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmRlbmllZFNlcnZlcnMucG9saWN5JywgXCJEZW55bGlzdCBvZiBNb2RlbCBDb250ZXh0IFByb3RvY29sIHNlcnZlcnMuIFNlcnZlcnMgbWF0Y2hpbmcgYW55IGVudHJ5IGFyZSBibG9ja2VkIGZyb20gYmVpbmcgaW5zdGFsbGVkIG9yIHJ1biwgZXZlbiBpZiB0aGV5IGFsc28gbWF0Y2ggdGhlIGFsbG93IGxpc3Q7IGRlbnkgcnVsZXMgYWx3YXlzIHRha2UgcHJlY2VkZW5jZS5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfQ09ORklHXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYWxsb3dNYW5hZ2VkU2VydmVyc09ubHknLCBcIlVzZSBvbmx5IHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgTUNQIGFsbG93bGlzdCB3aGVuIGRlY2lkaW5nIHdoaWNoIHNlcnZlcnMgbWF5IHJ1bi5cIiksXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBbGxvd01hbmFnZWRNY3BTZXJ2ZXJzT25seScsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMzInLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZFNldHRpbmdWYWx1ZShDT1BJTE9UX0FMTE9XX01BTkFHRURfTUNQX1NFUlZFUlNfT05MWV9LRVkpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX01DUF9TRVJWRVJTX09OTFlfS0VZXTogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQubWNwLmFsbG93TWFuYWdlZFNlcnZlcnNPbmx5LnBvbGljeScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5hbGxvd01hbmFnZWRTZXJ2ZXJzT25seS5wb2xpY3knLCBcIlVzZSBvbmx5IHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgTUNQIGFsbG93bGlzdCB3aGVuIGRlY2lkaW5nIHdoaWNoIHNlcnZlcnMgbWF5IHJ1bi5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbbWNwQXV0b1N0YXJ0Q29uZmlnXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5hdXRvc3RhcnQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgTUNQIHNlcnZlcnMgc2hvdWxkIGJlIGF1dG9tYXRpY2FsbHkgc3RhcnRlZCB3aGVuIHRoZSBjaGF0IG1lc3NhZ2VzIGFyZSBzdWJtaXR0ZWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogTWNwQXV0b1N0YXJ0VmFsdWUuTmV3QW5kT3V0ZGF0ZWQsXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdE1jcEF1dG9TdGFydFZhbHVlLk5ldmVyLFxuXHRcdFx0XHRNY3BBdXRvU3RhcnRWYWx1ZS5Pbmx5TmV3LFxuXHRcdFx0XHRNY3BBdXRvU3RhcnRWYWx1ZS5OZXdBbmRPdXRkYXRlZFxuXHRcdFx0XSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5hdXRvc3RhcnQubmV2ZXInLCBcIk5ldmVyIGF1dG9tYXRpY2FsbHkgc3RhcnQgTUNQIHNlcnZlcnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQubWNwLmF1dG9zdGFydC5vbmx5TmV3JywgXCJPbmx5IGF1dG9tYXRpY2FsbHkgc3RhcnQgbmV3IE1DUCBzZXJ2ZXJzIHRoYXQgaGF2ZSBuZXZlciBiZWVuIHJ1bi5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuYXV0b3N0YXJ0Lm5ld0FuZE91dGRhdGVkJywgXCJBdXRvbWF0aWNhbGx5IHN0YXJ0IG5ldyBhbmQgb3V0ZGF0ZWQgTUNQIHNlcnZlcnMgdGhhdCBhcmUgbm90IHlldCBydW5uaW5nLlwiKVxuXHRcdFx0XSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbbWNwQXBwc0VuYWJsZWRDb25maWddOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC51aS5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIE1DUCBzZXJ2ZXJzIGNhbiBwcm92aWRlIGN1c3RvbSBVSSBmb3IgdG9vbCBpbnZvY2F0aW9ucy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdFttY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBTZWN0aW9uXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ3ByZXZpZXcnLCAnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGlzc3Vlcjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGZvcm1hdDogJ3VyaScsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5pc3N1ZXInLCBcIlRoZSBPQXV0aC9PSURDIGlzc3VlciBVUkwgb2YgdGhlIFNTTyBhdXRob3JpemF0aW9uIHNlcnZlci4gTXVzdCBiZSBhbiBgaHR0cHM6Ly9gIFVSTC5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNsaWVudElkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5jbGllbnRJZCcsIFwiVGhlIE9BdXRoIGNsaWVudCBJRCByZWdpc3RlcmVkIHdpdGggdGhlIFNTTyBpc3N1ZXIgZm9yIHRoaXMgZGV2aWNlLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2xpZW50U2VjcmV0OiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5jbGllbnRTZWNyZXQnLCBcIlRoZSBPQXV0aCBjbGllbnQgc2VjcmV0IHBhaXJlZCB3aXRoIGBjbGllbnRJZGAuIEludGVuZGVkIGZvciBsb2NhbCBkZXZlbG9wbWVudCBvbmx5LlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21jcC5lbnRlcnByaXNlTWFuYWdlZEF1dGguaWRwJywgXCIoUHJldmlldykgVGhlIE9BdXRoL09JREMgSWRQIGNvbmZpZ3VyYXRpb24gdXNlZCBmb3IgZW50ZXJwcmlzZS1tYW5hZ2VkIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgKE1DUCkgc2VydmVycy4gVHlwaWNhbGx5IGRlbGl2ZXJlZCB2aWEgZW50ZXJwcmlzZSBwb2xpY3kgKFdpbmRvd3MgR3JvdXAgUG9saWN5IC8gbWFjT1MgbWFuYWdlZCBwcmVmZXJlbmNlcyAvIExpbnV4IGAvZXRjL3ZzY29kZS9wb2xpY3kuanNvbmApOyBkZXZlbG9wZXJzIG1heSBoYW5kLWVkaXQgYHNldHRpbmdzLmpzb25gIGZvciBsb2NhbCB0ZXN0aW5nLiBQcm9wZXJ0aWVzOiBgaXNzdWVyYCAoSFRUUFMgVVJMKSwgYGNsaWVudElkYCwgYGNsaWVudFNlY3JldGAuXCIpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdNY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHAnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTIyJyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ21jcC5lbnRlcnByaXNlTWFuYWdlZEF1dGguaWRwLnBvbGljeScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcC5wb2xpY3knLCBcIlRoZSBPQXV0aC9PSURDIElkUCBjb25maWd1cmF0aW9uIHVzZWQgZm9yIGVudGVycHJpc2UtbWFuYWdlZCBNb2RlbCBDb250ZXh0IFByb3RvY29sIChNQ1ApIHNlcnZlciBhdXRoZW50aWNhdGlvbi5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W21jcFNlcnZlckNvbGxpc2lvbkJlaGF2aW9yU2VjdGlvbl06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuY29sbGlzaW9uQmVoYXZpb3InLCBcIkNvbnRyb2xzIGJlaGF2aW9yIHdoZW4gbXVsdGlwbGUgTUNQIHNlcnZlcnMgYXJlIGRpc2NvdmVyZWQgd2l0aCB0aGUgc2FtZSBuYW1lLiAnZGlzYWJsZScgZGlzYWJsZXMgbG93ZXItcHJpb3JpdHkgZHVwbGljYXRlcy4gJ3N1ZmZpeCcgYXBwZW5kcyBudW1lcmljIHN1ZmZpeGVzIHRvIGRpc2FtYmlndWF0ZS5cIiksXG5cdFx0XHRlbnVtOiBbXG5cdFx0XHRcdE1jcENvbGxpc2lvbkJlaGF2aW9yLkRpc2FibGUsXG5cdFx0XHRcdE1jcENvbGxpc2lvbkJlaGF2aW9yLlN1ZmZpeCxcblx0XHRcdF0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5tY3AuY29sbGlzaW9uQmVoYXZpb3IuZGlzYWJsZScsIFwiRGlzYWJsZSBsb3dlci1wcmlvcml0eSBzZXJ2ZXJzIHdpdGggZHVwbGljYXRlIG5hbWVzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5jb2xsaXNpb25CZWhhdmlvci5zdWZmaXgnLCBcIkFwcGVuZCBudW1lcmljIHN1ZmZpeGVzIHRvIHNlcnZlcnMgd2l0aCBkdXBsaWNhdGUgbmFtZXMuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IE1jcENvbGxpc2lvbkJlaGF2aW9yLkRpc2FibGUsXG5cdFx0fSxcblx0XHRbbWNwU2VydmVyU2FtcGxpbmdTZWN0aW9uXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5zZXJ2ZXJTYW1wbGluZycsIFwiQ29uZmlndXJlcyB3aGljaCBtb2RlbHMgYXJlIGV4cG9zZWQgdG8gTUNQIHNlcnZlcnMgZm9yIHNhbXBsaW5nIChtYWtpbmcgbW9kZWwgcmVxdWVzdHMgaW4gdGhlIGJhY2tncm91bmQpLiBUaGlzIHNldHRpbmcgY2FuIGJlIGVkaXRlZCBpbiBhIGdyYXBoaWNhbCB3YXkgdW5kZXIgdGhlIGB7MH1gIGNvbW1hbmQuXCIsICdNQ1A6ICcgKyBubHMubG9jYWxpemUoJ21jcC5saXN0JywgJ0xpc3QgU2VydmVycycpKSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGFsbG93ZWREdXJpbmdDaGF0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1jcC5zZXJ2ZXJTYW1wbGluZy5hbGxvd2VkRHVyaW5nQ2hhdCcsIFwiV2hldGhlciB0aGlzIHNlcnZlciBpcyBhbGxvd2VkIHRvIG1ha2Ugc2FtcGxpbmcgcmVxdWVzdHMgZHVyaW5nIGl0cyB0b29sIGNhbGxzIGluIGEgY2hhdCBzZXNzaW9uLlwiKSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhbGxvd2VkT3V0c2lkZUNoYXQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLnNlcnZlclNhbXBsaW5nLmFsbG93ZWRPdXRzaWRlQ2hhdCcsIFwiV2hldGhlciB0aGlzIHNlcnZlciBpcyBhbGxvd2VkIHRvIG1ha2Ugc2FtcGxpbmcgcmVxdWVzdHMgb3V0c2lkZSBvZiBhIGNoYXQgc2Vzc2lvbi5cIiksXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFsbG93ZWRNb2RlbHM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5tY3Auc2VydmVyU2FtcGxpbmcubW9kZWwnLCBcIkEgbW9kZWwgdGhlIE1DUCBzZXJ2ZXIgaGFzIGFjY2VzcyB0by5cIiksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBc3Npc3RlZFR5cGVzW0FkZENvbmZpZ3VyYXRpb25UeXBlLk51R2V0UGFja2FnZV0uZW5hYmxlZENvbmZpZ0tleV06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmFzc2lzdGVkLm51Z2V0LmVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIkVuYWJsZXMgTnVHZXQgcGFja2FnZXMgZm9yIEFJLWFzc2lzdGVkIE1DUCBzZXJ2ZXIgaW5zdGFsbGF0aW9uLiBVc2VkIHRvIGluc3RhbGwgTUNQIHNlcnZlcnMgYnkgbmFtZSBmcm9tIHRoZSBjZW50cmFsIHJlZ2lzdHJ5IGZvciAuTkVUIHBhY2thZ2VzIChOdUdldC5vcmcpLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ3N0YXJ0dXAnXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5leHRlbnNpb25Ub29sc0VuYWJsZWQnLCBcIkVuYWJsZSB1c2luZyB0b29scyBjb250cmlidXRlZCBieSB0aGlyZC1wYXJ0eSBleHRlbnNpb25zLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBZ2VudEV4dGVuc2lvblRvb2xzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjk5Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuZXh0ZW5zaW9uVG9vbHNFbmFibGVkJyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuZXh0ZW5zaW9uVG9vbHNFbmFibGVkJywgXCJFbmFibGUgdXNpbmcgdG9vbHMgY29udHJpYnV0ZWQgYnkgdGhpcmQtcGFydHkgZXh0ZW5zaW9ucy5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnBsdWdpbnMuZW5hYmxlZCcsIFwiRW5hYmxlIGFnZW50IHBsdWdpbiBpbnRlZ3JhdGlvbiBpbiBjaGF0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRQbHVnaW5zRW5hYmxlZCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMTYnLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5wbHVnaW5zLmVuYWJsZWQnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5zLmVuYWJsZWQnLCBcIkVuYWJsZSBhZ2VudCBwbHVnaW4gaW50ZWdyYXRpb24gaW4gY2hhdC5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5QbHVnaW5Mb2NhdGlvbnNdOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5Mb2NhdGlvbnMnLCBcIlBsdWdpbiBkaXJlY3RvcmllcyB0byBkaXNjb3Zlci4gRWFjaCBrZXkgaXMgYSBwYXRoIHRoYXQgcG9pbnRzIGRpcmVjdGx5IHRvIGEgcGx1Z2luIGZvbGRlciwgYW5kIHRoZSB2YWx1ZSBlbmFibGVzIChgdHJ1ZWApIG9yIGRpc2FibGVzIChgZmFsc2VgKSBpdC4gUGF0aHMgY2FuIGJlIGFic29sdXRlLCByZWxhdGl2ZSB0byB0aGUgd29ya3NwYWNlIHJvb3QsIG9yIHN0YXJ0IHdpdGggYH4vYCBmb3IgdGhlIHVzZXIncyBob21lIGRpcmVjdG9yeS5cIiksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkVuYWJsZWRQbHVnaW5zXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5zLmVuYWJsZWRQbHVnaW5zJywgXCJDb250cm9scyB3aGljaCBbYWdlbnQgcGx1Z2luc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWFnZW50LXBsdWdpbnMpIGFyZSBlbmFibGVkIG9yIGRpc2FibGVkLiBLZXlzIGFyZSBwbHVnaW4gSURzIGluIGA8cGx1Z2luPkA8bWFya2V0cGxhY2U+YCBmb3JtICh3aGVyZSBtYXJrZXRwbGFjZSBpcyBkZWZpbmVkIGluIHsxfSk7IHZhbHVlcyBlbmFibGUgKGB0cnVlYCkgb3IgZGlzYWJsZSAoYGZhbHNlYCkgdGhlIHBsdWdpbi4gRGlzY292ZXJlZCBhbG9uZ3NpZGUgdGhlIHBhdGgta2V5ZWQgZW50cmllcyBpbiB7MH0uIFdoZW4gc2V0IGJ5IHBvbGljeSwgZW50cmllcyBhcmUgYWRkaXRpdmU6IHBsdWdpbnMgbWFwcGVkIHRvIGB0cnVlYCBhcmUgZW5hYmxlZCBpbiBhZGRpdGlvbiB0byB0aGUgdXNlcidzIG93biBwbHVnaW5zLCBhbmQgb25seSBwbHVnaW5zIG1hcHBlZCB0byBgZmFsc2VgIGFyZSBibG9ja2VkIGZyb20gbG9hZGluZy5cIiwgYFxcYCMke0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbkxvY2F0aW9uc30jXFxgYCwgYFxcYCMke0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlc30jXFxgYCksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0RW5hYmxlZFBsdWdpbnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTIyJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9FTkFCTEVEX1BMVUdJTlNfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfRU5BQkxFRF9QTFVHSU5TX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQucGx1Z2lucy5lbmFibGVkUGx1Z2lucy5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5zLmVuYWJsZWRQbHVnaW5zLnBvbGljeScsIFwiUGx1Z2luIGVuYWJsZW1lbnQuIEtleXMgYXJlIHBsdWdpbiBJRHMgaW4gYHtwbHVnaW59QHttYXJrZXRwbGFjZX1gIGZvcm07IHZhbHVlcyBlbmFibGUgb3IgZGlzYWJsZSB0aGUgcGx1Z2luLlwiKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbk1hcmtldHBsYWNlc106IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdH0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXMnLCBcIlBsdWdpbiBtYXJrZXRwbGFjZXMgdG8gcXVlcnkuIEVudHJpZXMgbWF5IGJlIEdpdEh1YiBzaG9ydGhhbmQgKGBvd25lci9yZXBvYCBvciBgb3duZXIvcmVwbyNyZWZgKSwgZGlyZWN0IEdpdCByZXBvc2l0b3J5IFVSSXMgKGBodHRwczovLy4uLmdpdGAsIGBzc2g6Ly8uLi5naXRgLCBvciBgZ2l0QGhvc3Q6cGF0aC5naXRgLCBlYWNoIG9wdGlvbmFsbHkgc3VmZml4ZWQgd2l0aCBgI3JlZmApLCBvciBsb2NhbCByZXBvc2l0b3J5IFVSSXMgKGBmaWxlOi8vLy4uLmApLiBFcXVpdmFsZW50IEdpdEh1YiBzaG9ydGhhbmQgYW5kIFVSSSBlbnRyaWVzIGFyZSBkZWR1cGxpY2F0ZWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogWydnaXRodWIvY29waWxvdC1wbHVnaW5zJywgJ2dpdGh1Yi9hd2Vzb21lLWNvcGlsb3QjbWFya2V0cGxhY2UnXSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkV4dHJhTWFya2V0cGxhY2VzXToge1xuXHRcdFx0Ly8gUG9saWN5LW9ubHkgZGVsaXZlcnkgc2xvdCBmb3IgZW50ZXJwcmlzZS1tYW5hZ2VkIG1hcmtldHBsYWNlIGVudHJpZXMgKHZpYSB0aGVcblx0XHRcdC8vIGBDaGF0RXh0cmFNYXJrZXRwbGFjZXNgIHBvbGljeSkuIENvbnN1bWVycyB1bmlvbiB0aGlzIHdpdGggYGNoYXQucGx1Z2lucy5tYXJrZXRwbGFjZXNgLlxuXHRcdFx0Ly9cblx0XHRcdC8vIFN0b3JlZCBhcyBhIG5hbWVkIHN0cmluZyBtYXAuIEV4cGxpY2l0IHVwZGF0ZSBvdmVycmlkZXMgYXJlIEpTT04tZW5jb2RlZFxuXHRcdFx0Ly8gaW5zaWRlIHRoZSB2YWx1ZSBzdHJpbmcgc28gdGhlIFNldHRpbmdzIEVkaXRvciBjYW4gdXNlIGl0cyBpbmxpbmUgb2JqZWN0IHJlbmRlcmVyLlxuXHRcdFx0Ly8gVGhpcyBlbnN1cmVzOlxuXHRcdFx0Ly8gICAtIFRoZSBTZXR0aW5ncyBFZGl0b3IgKENvbXBsZXhPYmplY3QgcmVuZGVyZXIpIGNhbiBkaXNwbGF5IGVudHJpZXMgaW5saW5lIHdoZW5cblx0XHRcdC8vICAgICBtYW5hZ2VkIGJ5IHBvbGljeSwgcmF0aGVyIHRoYW4gb25seSBzaG93aW5nIFwiRWRpdCBpbiBzZXR0aW5ncy5qc29uXCIuXG5cdFx0XHQvLyAgIC0gTWFya2V0cGxhY2UgbmFtZXMgYXJlIHByZXNlcnZlZCBmb3IgYGVuYWJsZWRQbHVnaW5zW1wicGx1Z2luQDxuYW1lPlwiXWAgcmVzb2x1dGlvbi5cblx0XHRcdC8vXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6IFsnc3RyaW5nJ10gYXMgWydzdHJpbmcnXSB9LFxuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnBsdWdpbnMuZXh0cmFNYXJrZXRwbGFjZXMnLCBcIkVudGVycHJpc2UtbWFuYWdlZCBhZGRpdGlvbmFsIHBsdWdpbiBtYXJrZXRwbGFjZXMuIFVuaW9uZWQgd2l0aCB7MH0uIEFuIGVudHJ5J3MgYGF1dG9VcGRhdGVgIHZhbHVlIG92ZXJyaWRlcyB7MX0gZm9yIHBsdWdpbnMgZnJvbSB0aGF0IG1hcmtldHBsYWNlLlwiLCBgXFxgIyR7Q2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luTWFya2V0cGxhY2VzfSNcXGBgLCAnYCNleHRlbnNpb25zLmF1dG9VcGRhdGUjYCcpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0RXh0cmFNYXJrZXRwbGFjZXMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTIyJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9FWFRSQV9NQVJLRVRQTEFDRVNfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfRVhUUkFfTUFSS0VUUExBQ0VTX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQucGx1Z2lucy5leHRyYU1hcmtldHBsYWNlcy5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5wbHVnaW5zLmV4dHJhTWFya2V0cGxhY2VzLnBvbGljeScsIFwiQWRkaXRpb25hbCBwbHVnaW4gbWFya2V0cGxhY2VzIHRvIHF1ZXJ5LiBLZXlzIGFyZSBtYXJrZXRwbGFjZSBuYW1lczsgdmFsdWVzIGFyZSBHaXRIdWIgc2hvcnRoYW5kIChgb3duZXIvcmVwb1sjcmVmXWApIG9yIEdpdCBVUklzIChge3VybH1bI3JlZl1gKSwgb3B0aW9uYWxseSB3aXRoIGFuIGVudGVycHJpc2UtbWFuYWdlZCBhdXRvLXVwZGF0ZSBvdmVycmlkZS5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TdHJpY3RNYXJrZXRwbGFjZXNdOiB7XG5cdFx0XHR0eXBlOiBbJ2FycmF5JywgJ251bGwnXSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IFsnZ2l0aHViJywgJ2dpdCcsICd1cmwnLCAnbnBtJywgJ2ZpbGUnLCAnZGlyZWN0b3J5JywgJ2hvc3RQYXR0ZXJuJywgJ3BhdGhQYXR0ZXJuJ10sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXBvOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0dXJsOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0cmVmOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0cGF0aDogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdHBhY2thZ2U6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRob3N0UGF0dGVybjogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdHBhdGhQYXR0ZXJuOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0aGVhZGVyczogeyB0eXBlOiAnb2JqZWN0JywgYWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ3N0cmluZycgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydzb3VyY2UnXSxcblx0XHRcdH0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucGx1Z2lucy5zdHJpY3RNYXJrZXRwbGFjZXMnLCBcIkVudGVycHJpc2UtbWFuYWdlZCBhbGxvd2xpc3Qgb2YgcGx1Z2luIG1hcmtldHBsYWNlIHNvdXJjZXMuIFdoZW4gc2V0LCBvbmx5IG1hcmtldHBsYWNlcyBtYXRjaGluZyBvbmUgb2YgdGhlc2UgZW50cmllcyBjYW4gYmUgaW5zdGFsbGVkOyBhbiBlbXB0eSBhcnJheSBibG9ja3MgYWxsIG1hcmtldHBsYWNlcy4gVGhpcyBkb2VzIG5vdCByZXRyb2FjdGl2ZWx5IGRpc2FibGUgYWxyZWFkeS1pbnN0YWxsZWQgcGx1Z2lucy4gRWFjaCBlbnRyeSBpcyBhbiBvYmplY3Qgd2l0aCBhIGBzb3VyY2VgIGRpc2NyaW1pbmF0b3IgKGBnaXRodWJgLCBgZ2l0YCwgYHVybGAsIGBucG1gLCBgZmlsZWAsIGBkaXJlY3RvcnlgLCBgaG9zdFBhdHRlcm5gLCBvciBgcGF0aFBhdHRlcm5gKSBhbmQgdGhlIGNvcnJlc3BvbmRpbmcgZmllbGRzLiBUeXBpY2FsbHkgZGVsaXZlcmVkIHZpYSBlbnRlcnByaXNlIHBvbGljeS5cIiksXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0U3RyaWN0TWFya2V0cGxhY2VzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyMicsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkU2V0dGluZ1ZhbHVlKENPUElMT1RfU1RSSUNUX01BUktFVFBMQUNFU19LRVkpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9TVFJJQ1RfTUFSS0VUUExBQ0VTX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQucGx1Z2lucy5zdHJpY3RNYXJrZXRwbGFjZXMucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQucGx1Z2lucy5zdHJpY3RNYXJrZXRwbGFjZXMucG9saWN5JywgXCJBbGxvd2xpc3Qgb2YgcGx1Z2luIG1hcmtldHBsYWNlIHNvdXJjZXMuIFdoZW4gc2V0LCBvbmx5IG1hcmtldHBsYWNlcyBtYXRjaGluZyBhbiBlbnRyeSBhcmUgdHJ1c3RlZDsgYW4gZW1wdHkgYXJyYXkgYmxvY2tzIGFsbCBtYXJrZXRwbGFjZXMuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUddOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmN1c3RvbWl6YXRpb25zLnN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uJywgXCJCbG9ja3Mgc3RhbmRhbG9uZSB1c2VyIGFuZCB3b3Jrc3BhY2Ugc2tpbGxzLCBhZ2VudHMsIGhvb2tzLCBpbnN0cnVjdGlvbnMsIGFuZCBNQ1Agc2VydmVycyB3aGlsZSBrZWVwaW5nIGVsaWdpYmxlIHBsdWdpbiBjdXN0b21pemF0aW9ucyBhdmFpbGFibGUuXCIpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0U3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24nLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTMyJyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9LRVkpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9LRVldOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5jdXN0b21pemF0aW9ucy5zdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbi5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5jdXN0b21pemF0aW9ucy5zdHJpY3RQbHVnaW5Pbmx5Q3VzdG9taXphdGlvbi5wb2xpY3knLCBcIkJsb2NrcyBzdGFuZGFsb25lIHVzZXIgYW5kIHdvcmtzcGFjZSBza2lsbHMsIGFnZW50cywgaG9va3MsIGluc3RydWN0aW9ucywgYW5kIE1DUCBzZXJ2ZXJzIHdoaWxlIGtlZXBpbmcgZWxpZ2libGUgcGx1Z2luIGN1c3RvbWl6YXRpb25zIGF2YWlsYWJsZS5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5ob29rcy5hbGxvd01hbmFnZWRPbmx5JywgXCJBbGxvd3MgaG9va3Mgb25seSBmcm9tIGVudGVycHJpc2UtbWFuYWdlZCBzb3VyY2VzIGFuZCBwbHVnaW5zIGZvcmNlLWVuYWJsZWQgYnkgcG9saWN5LlwiKSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdEFsbG93TWFuYWdlZEhvb2tzT25seScsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMzInLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZFNldHRpbmdWYWx1ZShDT1BJTE9UX0FMTE9XX01BTkFHRURfSE9PS1NfT05MWV9LRVkpLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfS0VZXTogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuaG9va3MuYWxsb3dNYW5hZ2VkT25seS5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5ob29rcy5hbGxvd01hbmFnZWRPbmx5LnBvbGljeScsIFwiQWxsb3dzIGhvb2tzIG9ubHkgZnJvbSBlbnRlcnByaXNlLW1hbmFnZWQgc291cmNlcyBhbmQgcGx1Z2lucyBmb3JjZS1lbmFibGVkIGJ5IHBvbGljeS5cIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC5lbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGVuIGVuYWJsZWQsIGFnZW50IG1vZGUgY2FuIGJlIGFjdGl2YXRlZCBmcm9tIGNoYXQgYW5kIHRvb2xzIGluIGFnZW50aWMgY29udGV4dHMgd2l0aCBzaWRlIGVmZmVjdHMgY2FuIGJlIHVzZWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDaGF0QWdlbnRNb2RlJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjk5Jyxcblx0XHRcdFx0dmFsdWU6IChwb2xpY3lEYXRhKSA9PiBwb2xpY3lEYXRhLmNoYXRfYWdlbnRfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnQuZW5hYmxlZC5kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LmVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZW4gZW5hYmxlZCwgYWdlbnQgbW9kZSBjYW4gYmUgYWN0aXZhdGVkIGZyb20gY2hhdCBhbmQgdG9vbHMgaW4gYWdlbnRpYyBjb250ZXh0cyB3aXRoIHNpZGUgZWZmZWN0cyBjYW4gYmUgdXNlZC5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLk5ldHdvcmtGaWx0ZXJdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQubmV0d29ya0ZpbHRlcicsIFwiV2hlbiBlbmFibGVkLCBuZXR3b3JrIGFjY2VzcyBieSBhZ2VudCB0b29scyAoZmV0Y2ggdG9vbCwgaW50ZWdyYXRlZCBicm93c2VyKSBpcyByZXN0cmljdGVkIGFjY29yZGluZyB0byB7MH0gYW5kIHsxfS4gRG9tYWluIGZpbHRlcmluZyBpcyBhbHNvIGFwcGxpZWQgdG8gdGhvc2UgdG9vbHMgd2hlbiB7Mn0gaXMgZW5hYmxlZC5cIiwgYFxcYCMke0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnN9I1xcYGAsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuRGVuaWVkTmV0d29ya0RvbWFpbnN9I1xcYGAsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBZ2VudE5ldHdvcmtGaWx0ZXInLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE2Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnQubmV0d29ya0ZpbHRlcicsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50Lm5ldHdvcmtGaWx0ZXInLCBcIldoZW4gZW5hYmxlZCwgbmV0d29yayBhY2Nlc3MgYnkgYWdlbnQgdG9vbHMgKGZldGNoIHRvb2wsIGludGVncmF0ZWQgYnJvd3NlcikgaXMgcmVzdHJpY3RlZCBhY2NvcmRpbmcgdG8gezB9IGFuZCB7MX0uIERvbWFpbiBmaWx0ZXJpbmcgaXMgYWxzbyBhcHBsaWVkIHRvIHRob3NlIHRvb2xzIHdoZW4gezJ9IGlzIGVuYWJsZWQuXCIsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuQWxsb3dlZE5ldHdvcmtEb21haW5zfSNcXGBgLCBgXFxgIyR7QWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkRlbmllZE5ldHdvcmtEb21haW5zfSNcXGBgLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGApLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5BbGxvd2VkTmV0d29ya0RvbWFpbnNdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQuYWxsb3dlZE5ldHdvcmtEb21haW5zJywgXCJBbGxvd2VkIGRvbWFpbnMgZm9yIG5ldHdvcmsgYWNjZXNzIGJ5IGFnZW50IHRvb2xzIChmZXRjaCB0b29sLCBpbnRlZ3JhdGVkIGJyb3dzZXIpLiBBcHBsaWVzIHdoZW4gezB9IG9yIHsxfSBpcyBlbmFibGVkLiBXaGVuIHsyfSBpcyBlbmFibGVkLCBhbGwgZG9tYWlucyBhcmUgYWxsb3dlZC4gU3VwcG9ydHMgd2lsZGNhcmRzIGxpa2UgezN9LiBXaGVuIGJvdGggYWxsb3dlZCBhbmQgZGVuaWVkIGxpc3RzIGFyZSBlbXB0eSwgYWxsIGRvbWFpbnMgYXJlIGJsb2NrZWQuIERlbmllZCBkb21haW5zIChzZWUgezR9KSB0YWtlIHByZWNlZGVuY2UuXCIsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuTmV0d29ya0ZpbHRlcn0jXFxgYCwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hFbmFibGVkfSNcXGBgLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEFsbG93TmV0d29ya30jXFxgYCwgJ2AqLmV4YW1wbGUuY29tYCcsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuRGVuaWVkTmV0d29ya0RvbWFpbnN9I1xcYGApLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NoYXRBZ2VudEFsbG93ZWROZXR3b3JrRG9tYWlucycsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMTYnLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5hZ2VudC5hbGxvd2VkTmV0d29ya0RvbWFpbnMnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC5hbGxvd2VkTmV0d29ya0RvbWFpbnMnLCBcIkFsbG93ZWQgZG9tYWlucyBmb3IgbmV0d29yayBhY2Nlc3MgYnkgYWdlbnQgdG9vbHMgKGZldGNoIHRvb2wsIGludGVncmF0ZWQgYnJvd3NlcikuIEFwcGxpZXMgd2hlbiB7MH0gb3IgezF9IGlzIGVuYWJsZWQuIFdoZW4gezJ9IGlzIGVuYWJsZWQsIGFsbCBkb21haW5zIGFyZSBhbGxvd2VkLiBTdXBwb3J0cyB3aWxkY2FyZHMgbGlrZSB7M30uIFdoZW4gYm90aCBhbGxvd2VkIGFuZCBkZW5pZWQgbGlzdHMgYXJlIGVtcHR5LCBhbGwgZG9tYWlucyBhcmUgYmxvY2tlZC4gRGVuaWVkIGRvbWFpbnMgKHNlZSB7NH0pIHRha2UgcHJlY2VkZW5jZS5cIiwgYFxcYCMke0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5OZXR3b3JrRmlsdGVyfSNcXGBgLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGAsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrfSNcXGBgLCAnYCouZXhhbXBsZS5jb21gJywgYFxcYCMke0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5EZW5pZWROZXR3b3JrRG9tYWluc30jXFxgYCksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkRlbmllZE5ldHdvcmtEb21haW5zXToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LmRlbmllZE5ldHdvcmtEb21haW5zJywgXCJEZW5pZWQgZG9tYWlucyBmb3IgbmV0d29yayBhY2Nlc3MgYnkgYWdlbnQgdG9vbHMgKGZldGNoIHRvb2wsIGludGVncmF0ZWQgYnJvd3NlcikuIEFwcGxpZXMgd2hlbiB7MH0gb3IgezF9IGlzIGVuYWJsZWQuIFRoaXMgZG9lcyBub3QgYXBwbHkgd2hlbiB7Mn0gaXMgZW5hYmxlZC4gVGFrZXMgcHJlY2VkZW5jZSBvdmVyIHszfS4gU3VwcG9ydHMgd2lsZGNhcmRzIGxpa2UgezR9LlwiLCBgXFxgIyR7QWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLk5ldHdvcmtGaWx0ZXJ9I1xcYGAsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZH0jXFxgYCwgYFxcYCMke0FnZW50U2FuZGJveFNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmt9I1xcYGAsIGBcXGAjJHtBZ2VudE5ldHdvcmtEb21haW5TZXR0aW5nSWQuQWxsb3dlZE5ldHdvcmtEb21haW5zfSNcXGBgLCAnYCouZXhhbXBsZS5jb21gJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdEFnZW50RGVuaWVkTmV0d29ya0RvbWFpbnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE2Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnQuZGVuaWVkTmV0d29ya0RvbWFpbnMnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC5kZW5pZWROZXR3b3JrRG9tYWlucycsIFwiRGVuaWVkIGRvbWFpbnMgZm9yIG5ldHdvcmsgYWNjZXNzIGJ5IGFnZW50IHRvb2xzIChmZXRjaCB0b29sLCBpbnRlZ3JhdGVkIGJyb3dzZXIpLiBBcHBsaWVzIHdoZW4gezB9IG9yIHsxfSBpcyBlbmFibGVkLiBUaGlzIGRvZXMgbm90IGFwcGx5IHdoZW4gezJ9IGlzIGVuYWJsZWQuIFRha2VzIHByZWNlZGVuY2Ugb3ZlciB7M30uIFN1cHBvcnRzIHdpbGRjYXJkcyBsaWtlIHs0fS5cIiwgYFxcYCMke0FnZW50TmV0d29ya0RvbWFpblNldHRpbmdJZC5OZXR3b3JrRmlsdGVyfSNcXGBgLCBgXFxgIyR7QWdlbnRTYW5kYm94U2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWR9I1xcYGAsIGBcXGAjJHtBZ2VudFNhbmRib3hTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrfSNcXGBgLCBgXFxgIyR7QWdlbnROZXR3b3JrRG9tYWluU2V0dGluZ0lkLkFsbG93ZWROZXR3b3JrRG9tYWluc30jXFxgYCwgJ2AqLmV4YW1wbGUuY29tYCcpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHROZXdTZXNzaW9uTW9kZV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5uZXdTZXNzaW9uLmRlZmF1bHRNb2RlJywgXCJUaGUgZGVmYXVsdCBtb2RlIGZvciBuZXcgY2hhdCBzZXNzaW9ucy4gV2hlbiBlbXB0eSwgdGhlIGNoYXQgdmlldydzIGRlZmF1bHQgbW9kZSBpcyB1c2VkLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdEFocEpzb25sTG9nZ2luZ1NldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmFocEpzb25sTG9nZ2luZycsIFwiV2hlbiBlbmFibGVkLCBsb2dzIGFsbCBBSFAgdHJhbnNwb3J0IG1lc3NhZ2VzIGZvciBhZ2VudCBob3N0IGNvbm5lY3Rpb25zIHRvIEpTT05MIGZpbGVzIHVuZGVyIHRoZSB3aW5kb3cncyBsb2cgZGlyZWN0b3J5LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZScsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdEFnZW50RGVidWdMb2dFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5hZ2VudERlYnVnTG9nLmVuYWJsZWQnLCBcIkVuYWJsZSBhZ2VudCBkZWJ1ZyBsb2dnaW5nIGZvciBhZ2VudCBob3N0IHNlc3Npb25zOiBzdXJmYWNlIHRoZWlyIGRlYnVnIGV2ZW50cyBpbiB0aGUgYWdlbnQgZGVidWcgcGFuZWwuIFRha2VzIGVmZmVjdCBpbW1lZGlhdGVseTsgb25seSBzZXNzaW9ucyB0aGF0IHJ1biB3aGlsZSB0aGlzIGlzIGVuYWJsZWQgYXJlIGNhcHR1cmVkLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ3N0YXJ0dXAnXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdEFnZW50RGVidWdMb2dNYXhFdmVudHNTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdG1pbmltdW06IDEwLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5hZ2VudERlYnVnTG9nLm1heEV2ZW50c0luTWVtb3J5JywgXCJNYXhpbXVtIG51bWJlciBvZiBkZWJ1ZyBldmVudHMga2VwdCBpbiBtZW1vcnkgcGVyIGFnZW50IGhvc3Qgc2Vzc2lvbiBmb3IgdGhlIGFnZW50IGRlYnVnIHBhbmVsLiBPbGRlciBldmVudHMgYmV5b25kIHRoaXMgbGltaXQgYXJlIGRyb3BwZWQgZnJvbSB0aGUgaW4tbWVtb3J5IGJ1ZmZlciwgd2hpY2ggYWxzbyBsb3dlcnMgdGhlIHRvdGFscyAoc3VjaCBhcyB0b2tlbiB1c2FnZSkgc2hvd24gaW4gdGhlIHBhbmVsIG92ZXJ2aWV3LlwiKSxcblx0XHRcdGRlZmF1bHQ6IDEwMDAwLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ3N0YXJ0dXAnXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jdXN0b21UZXJtaW5hbFRvb2wuZW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCBDb3BpbG90IFNESyBzZXNzaW9ucyB1c2UgdGhlIEFnZW50IEhvc3QgdGVybWluYWwgdG9vbCBvdmVycmlkZSBpbnN0ZWFkIG9mIHRoZSBTREsncyBkZWZhdWx0IHRlcm1pbmFsIGJlaGF2aW9yLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RDb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsuLi5jb3BpbG90U2RrTG9nTGV2ZWxTZXR0aW5nVmFsdWVzXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90U2RrLmxvZ0xldmVsLmluZm8nLCBcIkxvZyBpbmZvcm1hdGlvbmFsIG1lc3NhZ2VzLiBSdW5uaW5nIFZTIENvZGUgd2l0aCB0cmFjZSBsb2dnaW5nIHN0aWxsIGVuYWJsZXMgYWxsIENvcGlsb3QgU0RLIHJ1bnRpbWUgZGlhZ25vc3RpY3MuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvcGlsb3RTZGsubG9nTGV2ZWwudHJhY2UnLCBcIkxvZyBhbGwgQ29waWxvdCBTREsgcnVudGltZSBkaWFnbm9zdGljcy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90U2RrLmxvZ0xldmVsJywgXCJDb250cm9scyB0aGUgbG9nIGxldmVsIGZvciB0aGUgQ29waWxvdCBTREsgcnVudGltZSB1c2VkIGJ5IHRoZSBsb2NhbCBhZ2VudCBob3N0LiBDaGFuZ2luZyB0aGlzIHNldHRpbmcgcmVzdGFydHMgdGhlIENvcGlsb3QgU0RLIGNsaWVudDsgYWN0aXZlIHNlc3Npb25zIGFyZSByZWxvYWRlZCB3aGVuIG5leHQgdXNlZC5cIiksXG5cdFx0XHRkZWZhdWx0OiAnaW5mbycsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPcHVzNDhQcm9tcHRFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3B1czQ4UHJvbXB0LmVuYWJsZWQnLCBcIldoZW4gZW5hYmxlZCwgQ29waWxvdCBTREsgc2Vzc2lvbnMgcnVubmluZyBhIENsYXVkZSBPcHVzIDQuOCBtb2RlbCBhcHBseSBPcHVzIDQuOC10dW5lZCBzeXN0ZW0tcHJvbXB0IHNlY3Rpb24gb3ZlcnJpZGVzIG9uIHRvcCBvZiB0aGUgZGVmYXVsdCBzeXN0ZW0gbWVzc2FnZS5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0VG9vbFNlYXJjaEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90LnRvb2xTZWFyY2guZW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCBDb3BpbG90IFNESyBzZXNzaW9ucyBkZWZlciBNQ1AgYW5kIG5vbi1jb3JlIFZTIENvZGUgdG9vbHMgYmVoaW5kIGEgdG9vbC1zZWFyY2ggdG9vbCBzbyB0aGUgbW9kZWwgZGlzY292ZXJzIHRoZW0gb24gZGVtYW5kIGluc3RlYWQgb2YgbG9hZGluZyBldmVyeSB0b29sIGRlZmluaXRpb24gdXAgZnJvbnQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdFRvb2xTZWFyY2hEZWZlclRocmVzaG9sZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY29waWxvdC50b29sU2VhcmNoLmRlZmVyVGhyZXNob2xkJywgXCJNaW5pbXVtIG51bWJlciBvZiB0b29scyBiZWZvcmUgTUNQIGFuZCBleHRlcm5hbCB0b29scyBhcmUgZGVmZXJyZWQgYmVoaW5kIHRvb2wgc2VhcmNoLiBTZXQgdG8gMCB0byBhbHdheXMgZGVmZXIgZXh0ZXJuYWwgdG9vbHMuIE9ubHkgZWZmZWN0aXZlIHdoZW4gdG9vbCBzZWFyY2ggaXMgZW5hYmxlZC5cIiksXG5cdFx0XHRkZWZhdWx0OiAxLFxuXHRcdFx0bWluaW11bTogMCxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0UmVhc29uaW5nRWZmb3J0T3ZlcnJpZGVTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QucmVhc29uaW5nRWZmb3J0T3ZlcnJpZGUnLCBcIk92ZXJyaWRlcyB0aGUgcmVhc29uaW5nIGVmZm9ydCBmb3IgQ29waWxvdCBTREsgYWdlbnQgc2Vzc2lvbnMgcmVnYXJkbGVzcyBvZiB0aGUgcGVyLW1vZGVsIHBpY2tlciB2YWx1ZS4gU2V0IGl0IHRvIGEgbGV2ZWwgdGhlIHNlbGVjdGVkIG1vZGVsIHN1cHBvcnRzIChmb3IgZXhhbXBsZSBgbG93YCwgYG1lZGl1bWAsIGBoaWdoYCwgb3IgYHhoaWdoYCkgXHUyMDE0IGNob29zaW5nIGEgbGV2ZWwgdGhlIG1vZGVsIGRvZXMgbm90IHN1cHBvcnQgbWF5IGJlIHJlamVjdGVkIGJ5IHRoZSBtb2RlbC4gQSB2YWx1ZSB0aGF0IGlzbid0IGEgcmVjb2duaXplZCBlZmZvcnQgbGV2ZWwgaXMgaWdub3JlZCBhbmQgdGhlIHNlc3Npb24gZmFsbHMgYmFjayB0byB0aGUgcGlja2VyIHZhbHVlLiBBcHBsaWVkIHdoZW4gYSBzZXNzaW9uIGlzIGNyZWF0ZWQgYW5kIHdoZW4gaXRzIG1vZGVsIGNoYW5nZXMuIE9ubHkgYWZmZWN0cyBDb3BpbG90IENMSSBhZ2VudCBzZXNzaW9ucy5cXG5cXG4qKk5vdGUqKjogVGhpcyBpcyBhbiBhZHZhbmNlZCBzZXR0aW5nIGZvciBleHBlcmltZW50YXRpb24uXCIpLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdE1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlc1NldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5tb2RlbENhcGFiaWxpdHlPdmVycmlkZXMnLCBcIlBlci1tb2RlbCBjYXBhYmlsaXR5IG92ZXJyaWRlcyBmb3IgQ29waWxvdCBTREsgYWdlbnQgc2Vzc2lvbnMsIGtleWVkIGJ5IG1vZGVsIGlkLCBpbnRlbmRlZCBmb3IgZXZhbHVhdGluZyBwcmV2aWV3IG1vZGVscyBhZ2FpbnN0IGFuIGV4aXN0aW5nIG1vZGVsJ3MgcHJvZmlsZS4gRm9yIGVhY2ggbW9kZWwgaWQsIGRlY2xhcmUgYW4gYWxpYXNlZCBgZmFtaWx5YCAoZm9yIGV4YW1wbGUgYGNsYXVkZS1vcHVzLTQtOGApIHRvIHJvdXRlIHRoZSBtb2RlbCB0byB0aGF0IGZhbWlseSdzIHR1bmVkIHN5c3RlbSBwcm9tcHQgd2l0aG91dCBhIGNvZGUgY2hhbmdlOyB0aGUgbW9kZWwgaWQgc2VudCB0byB0aGUgcnVudGltZSBpcyB1bmFmZmVjdGVkLiBPbmx5IGFmZmVjdHMgQ29waWxvdCBDTEkgYWdlbnQgc2Vzc2lvbnMuXFxuXFxuKipOb3RlKio6IFRoaXMgaXMgYW4gYWR2YW5jZWQgc2V0dGluZyBmb3IgZXhwZXJpbWVudGF0aW9uLlwiKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0ZmFtaWx5OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm1vZGVsQ2FwYWJpbGl0eU92ZXJyaWRlcy5mYW1pbHknLCBcIkFsaWFzIHRoZSBtb2RlbCdzIGZhbWlseSBmb3IgcHJvbXB0L2NhcGFiaWxpdHkgcm91dGluZyAoZS5nLiBgY2xhdWRlLW9wdXMtNC04YCkuXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9mZiwgQWdlbnRTYW5kYm94RW5hYmxlZFZhbHVlLk9uLCBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuQWxsb3dOZXR3b3JrXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5zZGtTYW5kYm94LmVuYWJsZWQub2ZmJywgXCJObyBzYW5kYm94IHBvbGljeSBpcyBmb3J3YXJkZWQgZm9yIHRoZSBTREsncyBidWlsdC1pbiBzaGVsbCB0b29sIFx1MjAxNCBjb21tYW5kcyBydW4gdW5zYW5kYm94ZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LnNka1NhbmRib3guZW5hYmxlZC5vbicsIFwiVGhlIFNESydzIGJ1aWx0LWluIHNoZWxsIHRvb2wgcnVucyBpbnNpZGUgYSBzYW5kYm94IHVzaW5nIHRoZSBjb25maWd1cmVkIGZpbGVzeXN0ZW0gcG9saWN5IGFuZCBob3N0LWxpc3QtcmVzdHJpY3RlZCBuZXR3b3JrLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5zZGtTYW5kYm94LmVuYWJsZWQuYWxsb3dOZXR3b3JrJywgXCJUaGUgU0RLJ3MgYnVpbHQtaW4gc2hlbGwgdG9vbCBydW5zIGluc2lkZSBhIHNhbmRib3ggd2l0aCB1bnJlc3RyaWN0ZWQgb3V0Ym91bmQgbmV0d29yayBhY2Nlc3MuXCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Quc2RrU2FuZGJveC5lbmFibGVkJywgXCJTYW5kYm94IG1vZGUgZm9yIHRoZSBDb3BpbG90IFNESydzIGJ1aWx0LWluIHNoZWxsIHRvb2wuIE9ubHkgdGFrZXMgZWZmZWN0IHdoZW4gYCNjaGF0LmFnZW50SG9zdC5jdXN0b21UZXJtaW5hbFRvb2wuZW5hYmxlZCNgIGlzIGBmYWxzZWA7IHdoZW4gdGhlIEFnZW50IEhvc3QncyBvd24gdGVybWluYWwgdG9vbCBpcyBlbmFibGVkLCB0aGUgZW5naW5lIHNhbmRib3ggaXMgY29udHJvbGxlZCBieSBgI2NoYXQuYWdlbnQuc2FuZGJveC5lbmFibGVkI2AuIFRoZSBzYW5kYm94IGFwcGxpZXMgb25seSB0byByZXF1ZXN0cyB0aGF0IHJ1biB3aXRoIGRlZmF1bHQgYXBwcm92YWxzIFx1MjAxNCBub3Qgd2hlbiBhcHByb3ZhbHMgYXJlIGJ5cGFzc2VkIFx1MjAxNCBhbmQgaXMgbm90IHN1cHBvcnRlZCBvbiBXaW5kb3dzIHlldC5cIiksXG5cdFx0XHRkZWZhdWx0OiBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuT2ZmLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMuY29uZmlybWF0aW9uQ2Fyb3VzZWwnLCBcIldoZW4gZW5hYmxlZCwgbXVsdGlwbGUgdG9vbCBjb25maXJtYXRpb25zIGFyZSBiYXRjaGVkIGludG8gYSBjYXJvdXNlbCBhYm92ZSB0aGUgaW5wdXQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Ub29sUmlza0Fzc2Vzc21lbnRFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC50b29scy5yaXNrQXNzZXNzbWVudC5lbmFibGVkJywgXCJXaGVuIGVuYWJsZWQsIHRvb2wgY29uZmlybWF0aW9ucyBzaG93IGFuIExMTS1nZW5lcmF0ZWQgcmlzayBsZXZlbCAoU2FmZSAvIENhdXRpb24gLyBSZXZpZXcgY2FyZWZ1bGx5KSBhbmQgYSBzaG9ydCBleHBsYW5hdGlvbi5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVG9vbFJpc2tBc3Nlc3NtZW50TW9kZWxdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMucmlza0Fzc2Vzc21lbnQubW9kZWwnLCBcIlRoZSBsYW5ndWFnZSBtb2RlbCBpZCB1c2VkIHRvIGdlbmVyYXRlIHRvb2wgcmlzayBhc3Nlc3NtZW50cy4gU2hvdWxkIGJlIGEgc21hbGwsIGZhc3QgbW9kZWwuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2NvcGlsb3QtdXRpbGl0eS1zbWFsbCcsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUGxhbkFnZW50RGVmYXVsdE1vZGVsXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnBsYW5BZ2VudC5kZWZhdWx0TW9kZWwuZGVzY3JpcHRpb24nLCBcIlNlbGVjdCB0aGUgZGVmYXVsdCBsYW5ndWFnZSBtb2RlbCB0byB1c2UgZm9yIHRoZSBQbGFuIGFnZW50IGZyb20gdGhlIGF2YWlsYWJsZSBwcm92aWRlcnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRlbnVtOiBQbGFuQWdlbnREZWZhdWx0TW9kZWwubW9kZWxJZHMsXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogUGxhbkFnZW50RGVmYXVsdE1vZGVsLm1vZGVsTGFiZWxzLFxuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBQbGFuQWdlbnREZWZhdWx0TW9kZWwubW9kZWxEZXNjcmlwdGlvbnNcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5FeHBsb3JlQWdlbnREZWZhdWx0TW9kZWxdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXhwbG9yZUFnZW50LmRlZmF1bHRNb2RlbC5kZXNjcmlwdGlvbicsIFwiU2VsZWN0IHRoZSBkZWZhdWx0IGxhbmd1YWdlIG1vZGVsIHRvIHVzZSBmb3IgdGhlIEV4cGxvcmUgc3ViYWdlbnQgZnJvbSB0aGUgYXZhaWxhYmxlIHByb3ZpZGVycy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdGVudW06IEV4cGxvcmVBZ2VudERlZmF1bHRNb2RlbC5tb2RlbElkcyxcblx0XHRcdGVudW1JdGVtTGFiZWxzOiBFeHBsb3JlQWdlbnREZWZhdWx0TW9kZWwubW9kZWxMYWJlbHMsXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IEV4cGxvcmVBZ2VudERlZmF1bHRNb2RlbC5tb2RlbERlc2NyaXB0aW9uc1xuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0XToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYnlva1V0aWxpdHlNb2RlbERlZmF1bHQuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHRoZSBkZWZhdWx0IG1vZGVsIHVzZWQgYnkgYnVpbHQtaW4gdXRpbGl0eSBmbG93cyB3aGVuIHRoZSBzZWxlY3RlZCBtYWluIGFnZW50IG1vZGVsIGlzIGEgYnJpbmcgeW91ciBvd24ga2V5IChCWU9LKSBtb2RlbC4gVGhpcyBzZXR0aW5nIGhhcyBubyBlZmZlY3Qgd2hlbiB0aGUgc2VsZWN0ZWQgbWFpbiBhZ2VudCBtb2RlbCBpcyBwcm92aWRlZCBieSBHaXRIdWIgQ29waWxvdC4gQSBzcGVjaWZpYyBtb2RlbCBjb25maWd1cmVkIGluIHswfSBvciB7MX0gdGFrZXMgcHJlY2VkZW5jZS5cIiwgJ2AjY2hhdC51dGlsaXR5TW9kZWwjYCcsICdgI2NoYXQudXRpbGl0eVNtYWxsTW9kZWwjYCcpLFxuXHRcdFx0ZW51bTogW0JZT0tVdGlsaXR5TW9kZWxEZWZhdWx0Lk5vbmUsIEJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0Lk1haW5BZ2VudCwgQllPS1V0aWxpdHlNb2RlbERlZmF1bHQuQ29waWxvdF0sXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYnlva1V0aWxpdHlNb2RlbERlZmF1bHQubm9uZS5sYWJlbCcsIFwiTm9uZVwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmJ5b2tVdGlsaXR5TW9kZWxEZWZhdWx0Lm1haW5BZ2VudC5sYWJlbCcsIFwiTWFpbiBBZ2VudCBNb2RlbFwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmJ5b2tVdGlsaXR5TW9kZWxEZWZhdWx0LmNvcGlsb3QubGFiZWwnLCBcIkdpdEh1YiBDb3BpbG90XCIpLFxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYnlva1V0aWxpdHlNb2RlbERlZmF1bHQubm9uZS5kZXNjcmlwdGlvbicsIFwiRG8gbm90IHVzZSBhIGRlZmF1bHQgdXRpbGl0eSBtb2RlbC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5ieW9rVXRpbGl0eU1vZGVsRGVmYXVsdC5tYWluQWdlbnQuZGVzY3JpcHRpb24nLCBcIlVzZSB0aGUgc2VsZWN0ZWQgQllPSyBtYWluIGFnZW50IG1vZGVsLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmJ5b2tVdGlsaXR5TW9kZWxEZWZhdWx0LmNvcGlsb3QuZGVzY3JpcHRpb24nLCBcIlVzZSB0aGUgZGVmYXVsdCBHaXRIdWIgQ29waWxvdCB1dGlsaXR5IG1vZGVscy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogQllPS1V0aWxpdHlNb2RlbERlZmF1bHQuQ29waWxvdCxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5VdGlsaXR5TW9kZWxdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudXRpbGl0eU1vZGVsLmRlc2NyaXB0aW9uJywgXCJPdmVycmlkZSB0aGUgbGFuZ3VhZ2UgbW9kZWwgdXNlZCBieSBidWlsdC1pbiB1dGlsaXR5IGZsb3dzLiBMZWF2ZSBlbXB0eSB0byB1c2UgdGhlIGNvbmZpZ3VyZWQgZGVmYXVsdCBiZWhhdmlvci5cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdGVudW06IFV0aWxpdHlNb2RlbENvbnRyaWJ1dGlvbi5tb2RlbElkcyxcblx0XHRcdGVudW1JdGVtTGFiZWxzOiBVdGlsaXR5TW9kZWxDb250cmlidXRpb24ubW9kZWxMYWJlbHMsXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFV0aWxpdHlNb2RlbENvbnRyaWJ1dGlvbi5tb2RlbERlc2NyaXB0aW9uc1xuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlV0aWxpdHlTbWFsbE1vZGVsXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnV0aWxpdHlTbWFsbE1vZGVsLmRlc2NyaXB0aW9uJywgXCJPdmVycmlkZSB0aGUgbGFuZ3VhZ2UgbW9kZWwgdXNlZCBieSBidWlsdC1pbiBzbWFsbC9mYXN0IHV0aWxpdHkgZmxvd3MuIEEgZmFzdCBhbmQgaW5leHBlbnNpdmUgbW9kZWwgaXMgcmVjb21tZW5kZWQuIExlYXZlIGVtcHR5IHRvIHVzZSB0aGUgY29uZmlndXJlZCBkZWZhdWx0IGJlaGF2aW9yLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0ZW51bTogVXRpbGl0eVNtYWxsTW9kZWxDb250cmlidXRpb24ubW9kZWxJZHMsXG5cdFx0XHRlbnVtSXRlbUxhYmVsczogVXRpbGl0eVNtYWxsTW9kZWxDb250cmlidXRpb24ubW9kZWxMYWJlbHMsXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFV0aWxpdHlTbWFsbE1vZGVsQ29udHJpYnV0aW9uLm1vZGVsRGVzY3JpcHRpb25zXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uUmVxdWVzdFF1ZXVlaW5nRGVmYXVsdEFjdGlvbl06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydxdWV1ZScsICdzdGVlciddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQucmVxdWVzdFF1ZXVpbmcuZGVmYXVsdEFjdGlvbi5xdWV1ZScsIFwiUXVldWUgdGhlIG1lc3NhZ2UgdG8gc2VuZCBhZnRlciB0aGUgY3VycmVudCByZXF1ZXN0IGNvbXBsZXRlcy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5yZXF1ZXN0UXVldWluZy5kZWZhdWx0QWN0aW9uLnN0ZWVyJywgXCJTdGVlciB0aGUgY3VycmVudCByZXF1ZXN0IGJ5IHNlbmRpbmcgdGhlIG1lc3NhZ2UgaW1tZWRpYXRlbHksIHNpZ25hbGluZyB0aGUgY3VycmVudCByZXF1ZXN0IHRvIHlpZWxkLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnJlcXVlc3RRdWV1aW5nLmRlZmF1bHRBY3Rpb24uZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoaWNoIGFjdGlvbiBpcyB0aGUgZGVmYXVsdCBmb3IgdGhlIHF1ZXVlIGJ1dHRvbiB3aGVuIGEgcmVxdWVzdCBpcyBpbiBwcm9ncmVzcy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnc3RlZXInLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkVuYWJsZU1hdGhdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0Lm1hdGhFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJFbmFibGUgbWF0aCByZW5kZXJpbmcgaW4gY2hhdCByZXNwb25zZXMgdXNpbmcgS2FUZVguXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5TaG93Q29kZUJsb2NrUHJvZ3Jlc3NBbmltYXRpb25dOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmNvZGVCbG9jay5zaG93UHJvZ3Jlc3NBbmltYXRpb24uZGVzY3JpcHRpb24nLCBcIldoZW4gYXBwbHlpbmcgZWRpdHMsIHNob3cgYSBwcm9ncmVzcyBhbmltYXRpb24gaW4gdGhlIGNvZGUgYmxvY2sgcGlsbC4gSWYgZGlzYWJsZWQsIHNob3dzIHRoZSBwcm9ncmVzcyBwZXJjZW50YWdlIGluc3RlYWQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbbWNwRGlzY292ZXJ5U2VjdGlvbl06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczogT2JqZWN0LmZyb21FbnRyaWVzKGFsbERpc2NvdmVyeVNvdXJjZXMubWFwKGsgPT4gW2ssIHsgdHlwZTogJ2Jvb2xlYW4nLCBkZXNjcmlwdGlvbjogZGlzY292ZXJ5U291cmNlU2V0dGluZ3NMYWJlbFtrXSB9XSkpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0ZGVmYXVsdDogT2JqZWN0LmZyb21FbnRyaWVzKGFsbERpc2NvdmVyeVNvdXJjZXMubWFwKGsgPT4gW2ssIGZhbHNlXSkpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtY3AuZGlzY292ZXJ5LmVuYWJsZWQnLCBcIkNvbmZpZ3VyZXMgZGlzY292ZXJ5IG9mIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgc2VydmVycyBmcm9tIGNvbmZpZ3VyYXRpb24gZnJvbSB2YXJpb3VzIG90aGVyIGFwcGxpY2F0aW9ucy5cIiksXG5cdFx0fSxcblx0XHRbbWNwR2FsbGVyeVNlcnZpY2VFbmFibGVtZW50Q29uZmlnXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ3ByZXZpZXcnXSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQubWNwLmdhbGxlcnkuZW5hYmxlZCcsIFwiRW5hYmxlcyB0aGUgZGVmYXVsdCBNYXJrZXRwbGFjZSBmb3IgTW9kZWwgQ29udGV4dCBQcm90b2NvbCAoTUNQKSBzZXJ2ZXJzLlwiKSxcblx0XHRcdGluY2x1ZGVkOiBwcm9kdWN0LnF1YWxpdHkgPT09ICdzdGFibGUnXG5cdFx0fSxcblx0XHRbbWNwR2FsbGVyeVNlcnZpY2VVcmxDb25maWddOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21jcC5nYWxsZXJ5LnNlcnZpY2VVcmwnLCBcIkNvbmZpZ3VyZSB0aGUgTUNQIEdhbGxlcnkgc2VydmljZSBVUkwgdG8gY29ubmVjdCB0b1wiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsndXNlc09ubGluZVNlcnZpY2VzJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ01jcEdhbGxlcnlTZXJ2aWNlVXJsJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEwMScsXG5cdFx0XHRcdHZhbHVlOiAocG9saWN5RGF0YSkgPT4gcG9saWN5RGF0YS5tY3BSZWdpc3RyeVVybCxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ21jcC5nYWxsZXJ5LnNlcnZpY2VVcmwnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnbWNwLmdhbGxlcnkuc2VydmljZVVybCcsIFwiQ29uZmlndXJlIHRoZSBNQ1AgR2FsbGVyeSBzZXJ2aWNlIFVSTCB0byBjb25uZWN0IHRvXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLklOU1RSVUNUSU9OU19MT0NBVElPTl9LRVldOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0Lmluc3RydWN0aW9ucy5jb25maWcubG9jYXRpb25zLnRpdGxlJyxcblx0XHRcdFx0XCJJbnN0cnVjdGlvbnMgRmlsZSBMb2NhdGlvbnNcIixcblx0XHRcdCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0Lmluc3RydWN0aW9ucy5jb25maWcubG9jYXRpb25zLmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XCJTcGVjaWZ5IGxvY2F0aW9uKHMpIG9mIGluc3RydWN0aW9ucyBmaWxlcyAoYCp7MH1gKSB0aGF0IGNhbiBiZSBhdHRhY2hlZCBpbiBDaGF0IHNlc3Npb25zLiBbTGVhcm4gTW9yZV0oezF9KS5cXG5cXG5SZWxhdGl2ZSBwYXRocyBhcmUgcmVzb2x2ZWQgZnJvbSB0aGUgcm9vdCBmb2xkZXIocykgb2YgeW91ciB3b3Jrc3BhY2UuXFxuXFxuVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIixcblx0XHRcdFx0SU5TVFJVQ1RJT05fRklMRV9FWFRFTlNJT04sXG5cdFx0XHRcdElOU1RSVUNUSU9OU19ET0NVTUVOVEFUSU9OX1VSTCxcblx0XHRcdCksXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdC4uLkRFRkFVTFRfSU5TVFJVQ1RJT05TX1NPVVJDRV9GT0xERVJTLm1hcCgoZm9sZGVyKSA9PiAoeyBbZm9sZGVyLnBhdGhdOiB0cnVlIH0pKS5yZWR1Y2UoKGFjYywgY3VycikgPT4gKHsgLi4uYWNjLCAuLi5jdXJyIH0pLCB7fSksXG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRwcm9wZXJ0eU5hbWVzOiB7XG5cdFx0XHRcdHBhdHRlcm46IFZBTElEX1BST01QVF9GT0xERVJfUEFUVEVSTixcblx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjaGF0Lmluc3RydWN0aW9uc0xvY2F0aW9ucy5pbnZhbGlkUGF0aCcsIFwiUGF0aHMgbXVzdCBiZSByZWxhdGl2ZSBvciBzdGFydCB3aXRoICd+LycuIEFic29sdXRlIHBhdGhzIGFuZCAnXFxcXCcgc2VwYXJhdG9ycyBhcmUgbm90IHN1cHBvcnRlZC4gR2xvYiBwYXR0ZXJucyBhcmUgZGVwcmVjYXRlZCBhbmQgd2lsbCBiZSByZW1vdmVkIGluIGZ1dHVyZSB2ZXJzaW9ucy5cIiksXG5cdFx0XHR9LFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJvbXB0cycsICdyZXVzYWJsZSBwcm9tcHRzJywgJ3Byb21wdCBzbmlwcGV0cycsICdpbnN0cnVjdGlvbnMnXSxcblx0XHRcdGV4YW1wbGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRbREVGQVVMVF9JTlNUUlVDVElPTlNfU09VUkNFX0ZPTERFUlNbMF0ucGF0aF06IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRbSU5TVFJVQ1RJT05TX0RFRkFVTFRfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHRcdFx0Jy9Vc2Vycy92c2NvZGUvcmVwb3MvaW5zdHJ1Y3Rpb25zJzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5QUk9NUFRfTE9DQVRJT05TX0tFWV06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQucmV1c2FibGVQcm9tcHRzLmNvbmZpZy5sb2NhdGlvbnMudGl0bGUnLFxuXHRcdFx0XHRcIlByb21wdCBGaWxlIExvY2F0aW9uc1wiLFxuXHRcdFx0KSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQucmV1c2FibGVQcm9tcHRzLmNvbmZpZy5sb2NhdGlvbnMuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcIlNwZWNpZnkgbG9jYXRpb24ocykgb2YgcmV1c2FibGUgcHJvbXB0IGZpbGVzIChgKnswfWApIHRoYXQgY2FuIGJlIHJ1biBpbiBDaGF0IHNlc3Npb25zLiBbTGVhcm4gTW9yZV0oezF9KS5cXG5cXG5SZWxhdGl2ZSBwYXRocyBhcmUgcmVzb2x2ZWQgZnJvbSB0aGUgcm9vdCBmb2xkZXIocykgb2YgeW91ciB3b3Jrc3BhY2UuXFxuXFxuVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIixcblx0XHRcdFx0UFJPTVBUX0ZJTEVfRVhURU5TSU9OLFxuXHRcdFx0XHRQUk9NUFRfRE9DVU1FTlRBVElPTl9VUkwsXG5cdFx0XHQpLFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRbUFJPTVBUX0RFRkFVTFRfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHR1bmV2YWx1YXRlZFByb3BlcnRpZXM6IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRwcm9wZXJ0eU5hbWVzOiB7XG5cdFx0XHRcdHBhdHRlcm46IFZBTElEX1BST01QVF9GT0xERVJfUEFUVEVSTixcblx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjaGF0LnByb21wdEZpbGVMb2NhdGlvbnMuaW52YWxpZFBhdGgnLCBcIlBhdGhzIG11c3QgYmUgcmVsYXRpdmUgb3Igc3RhcnQgd2l0aCAnfi8nLiBBYnNvbHV0ZSBwYXRocyBhbmQgJ1xcXFwnIHNlcGFyYXRvcnMgYXJlIG5vdCBzdXBwb3J0ZWQuIEdsb2IgcGF0dGVybnMgYXJlIGRlcHJlY2F0ZWQgYW5kIHdpbGwgYmUgcmVtb3ZlZCBpbiBmdXR1cmUgdmVyc2lvbnMuXCIpLFxuXHRcdFx0fSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W1BST01QVF9ERUZBVUxUX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W1BST01QVF9ERUZBVUxUX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0XHRcdCcvVXNlcnMvdnNjb2RlL3JlcG9zL3Byb21wdHMnOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLk1PREVfTE9DQVRJT05fS0VZXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5tb2RlLmNvbmZpZy5sb2NhdGlvbnMudGl0bGUnLFxuXHRcdFx0XHRcIk1vZGUgRmlsZSBMb2NhdGlvbnNcIixcblx0XHRcdCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0Lm1vZGUuY29uZmlnLmxvY2F0aW9ucy5kZXNjcmlwdGlvbicsXG5cdFx0XHRcdFwiU3BlY2lmeSBsb2NhdGlvbihzKSBvZiBjdXN0b20gY2hhdCBtb2RlIGZpbGVzIChgKnswfWApLiBbTGVhcm4gTW9yZV0oezF9KS5cXG5cXG5SZWxhdGl2ZSBwYXRocyBhcmUgcmVzb2x2ZWQgZnJvbSB0aGUgcm9vdCBmb2xkZXIocykgb2YgeW91ciB3b3Jrc3BhY2UuXFxuXFxuVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIixcblx0XHRcdFx0TEVHQUNZX01PREVfRklMRV9FWFRFTlNJT04sXG5cdFx0XHRcdEFHRU5UX0RPQ1VNRU5UQVRJT05fVVJMLFxuXHRcdFx0KSxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0W0xFR0FDWV9NT0RFX0RFRkFVTFRfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ2NoYXQubW9kZS5jb25maWcubG9jYXRpb25zLmRlcHJlY2F0ZWQnLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkIGFuZCB3aWxsIGJlIHJlbW92ZWQgaW4gZnV0dXJlIHJlbGVhc2VzLiBDaGF0IG1vZGVzIGFyZSBub3cgY2FsbGVkIGN1c3RvbSBhZ2VudHMgYW5kIGFyZSBsb2NhdGVkIGluIGAuZ2l0aHViL2FnZW50c2BcIiksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdHVuZXZhbHVhdGVkUHJvcGVydGllczogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddLFxuXHRcdFx0ZXhhbXBsZXM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtMRUdBQ1lfTU9ERV9ERUZBVUxUX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W0xFR0FDWV9NT0RFX0RFRkFVTFRfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHRcdFx0Jy9Vc2Vycy92c2NvZGUvcmVwb3MvY2hhdG1vZGVzJzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5BR0VOVFNfTE9DQVRJT05fS0VZXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5hZ2VudHMuY29uZmlnLmxvY2F0aW9ucy50aXRsZScsXG5cdFx0XHRcdFwiQWdlbnQgRmlsZSBMb2NhdGlvbnNcIixcblx0XHRcdCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0LmFnZW50cy5jb25maWcubG9jYXRpb25zLmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XCJTcGVjaWZ5IGxvY2F0aW9uKHMpIG9mIGN1c3RvbSBhZ2VudCBmaWxlcyAoYCp7MH1gKS4gW0xlYXJuIE1vcmVdKHsxfSkuXFxuXFxuUmVsYXRpdmUgcGF0aHMgYXJlIHJlc29sdmVkIGZyb20gdGhlIHJvb3QgZm9sZGVyKHMpIG9mIHlvdXIgd29ya3NwYWNlLlxcblxcblRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsXG5cdFx0XHRcdEFHRU5UX0ZJTEVfRVhURU5TSU9OLFxuXHRcdFx0XHRBR0VOVF9ET0NVTUVOVEFUSU9OX1VSTCxcblx0XHRcdCksXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFtBR0VOVFNfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHRcdFtDTEFVREVfQUdFTlRTX1NPVVJDRV9GT0xERVJdOiB0cnVlLFxuXHRcdFx0XHRbQ09QSUxPVF9VU0VSX0FHRU5UU19TT1VSQ0VfRk9MREVSXTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdHByb3BlcnR5TmFtZXM6IHtcblx0XHRcdFx0cGF0dGVybjogVkFMSURfUFJPTVBUX0ZPTERFUl9QQVRURVJOLFxuXHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRMb2NhdGlvbnMuaW52YWxpZFBhdGgnLCBcIlBhdGhzIG11c3QgYmUgcmVsYXRpdmUgb3Igc3RhcnQgd2l0aCAnfi8nLiBBYnNvbHV0ZSBwYXRocyBhbmQgJ1xcXFwnIHNlcGFyYXRvcnMgYXJlIG5vdCBzdXBwb3J0ZWQuXCIpLFxuXHRcdFx0fSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W0FHRU5UU19TT1VSQ0VfRk9MREVSXTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtBR0VOVFNfU09VUkNFX0ZPTERFUl06IHRydWUsXG5cdFx0XHRcdFx0J215LWFnZW50cyc6IHRydWUsXG5cdFx0XHRcdFx0Jy4uL3NoYXJlZC1hZ2VudHMnOiB0cnVlLFxuXHRcdFx0XHRcdCd+Ly5jb3BpbG90L2FnZW50cyc6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuVVNFX0FHRU5UX01EXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VBZ2VudE1kLnRpdGxlJywgXCJVc2UgQUdFTlRTLm1kIGZpbGVcIiwpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnVzZUFnZW50TWQuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgaW5zdHJ1Y3Rpb25zIGZyb20gYEFHRU5UUy5tZGAgZmlsZSBmb3VuZCBpbiBhIHdvcmtzcGFjZSByb290cyBhcmUgYXR0YWNoZWQgdG8gYWxsIGNoYXQgcmVxdWVzdHMuIFRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJvbXB0cycsICdyZXVzYWJsZSBwcm9tcHRzJywgJ3Byb21wdCBzbmlwcGV0cycsICdpbnN0cnVjdGlvbnMnXVxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuVVNFX05FU1RFRF9BR0VOVF9NRF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoYXQudXNlTmVzdGVkQWdlbnRNZC50aXRsZScsIFwiVXNlIG5lc3RlZCBBR0VOVFMubWQgZmlsZXNcIiwpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnVzZU5lc3RlZEFnZW50TWQuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgaW5zdHJ1Y3Rpb25zIGZyb20gbmVzdGVkIGBBR0VOVFMubWRgIGZpbGVzIGZvdW5kIGluIHRoZSB3b3Jrc3BhY2UgYXJlIGxpc3RlZCBpbiBhbGwgY2hhdCByZXF1ZXN0cy4gVGhlIGxhbmd1YWdlIG1vZGVsIGNhbiBsb2FkIHRoZXNlIHNraWxscyBvbi1kZW1hbmQgaWYgdGhlIGByZWFkYCB0b29sIGlzIGF2YWlsYWJsZS4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ11cblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLlVTRV9DTEFVREVfTURdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0LnVzZUNsYXVkZU1kLnRpdGxlJywgXCJVc2UgQ0xBVURFLm1kIGZpbGVcIiwpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnVzZUNsYXVkZU1kLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIGluc3RydWN0aW9ucyBmcm9tIGBDTEFVREUubWRgIGZpbGUgZm91bmQgaW4gd29ya3NwYWNlIHJvb3RzLCAuY2xhdWRlIGFuZCB+Ly5jbGF1ZGUgZm9sZGVyIGFyZSBhdHRhY2hlZCB0byBhbGwgY2hhdCByZXF1ZXN0cy4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRkaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfU0tJTExTXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VBZ2VudFNraWxscy50aXRsZScsIFwiVXNlIEFnZW50IHNraWxsc1wiLCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudXNlQWdlbnRTa2lsbHMuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgc2tpbGxzIGFyZSBwcm92aWRlZCBhcyBzcGVjaWFsaXplZCBjYXBhYmlsaXRpZXMgdG8gdGhlIGNoYXQgcmVxdWVzdHMuIFNraWxscyBhcmUgbG9hZGVkIGZyb20gdGhlIGZvbGRlcnMgY29uZmlndXJlZCBpbiBgI2NoYXQuYWdlbnRTa2lsbHNMb2NhdGlvbnMjYC4gVGhlIGxhbmd1YWdlIG1vZGVsIGNhbiBsb2FkIHRoZXNlIHNraWxscyBvbi1kZW1hbmQgaWYgdGhlIGByZWFkYCB0b29sIGlzIGF2YWlsYWJsZS4gTGVhcm4gbW9yZSBhYm91dCBbQWdlbnQgU2tpbGxzXShodHRwczovL2FrYS5tcy92c2NvZGUtYWdlbnQtc2tpbGxzKS4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRkaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5VU0VfU0tJTExfQURIRVJFTkNFX1BST01QVF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoYXQudXNlU2tpbGxBZGhlcmVuY2VQcm9tcHQudGl0bGUnLCBcIlVzZSBTa2lsbCBBZGhlcmVuY2UgUHJvbXB0XCIsKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VTa2lsbEFkaGVyZW5jZVByb21wdC5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciBhIHN0cm9uZ2VyIHNraWxsIGFkaGVyZW5jZSBwcm9tcHQgaXMgdXNlZCB0aGF0IGVuY291cmFnZXMgdGhlIG1vZGVsIHRvIGltbWVkaWF0ZWx5IGludm9rZSBza2lsbHMgd2hlbiByZWxldmFudCByYXRoZXIgdGhhbiBqdXN0IGFubm91bmNpbmcgdGhlbS4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRkaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAncHJvbXB0cycsICdyZXVzYWJsZSBwcm9tcHRzJywgJ3Byb21wdCBzbmlwcGV0cycsICdpbnN0cnVjdGlvbnMnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5JTkNMVURFX0FQUExZSU5HX0lOU1RSVUNUSU9OU106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ2NoYXQuaW5jbHVkZUFwcGx5aW5nSW5zdHJ1Y3Rpb25zLnRpdGxlJywgXCJJbmNsdWRlIEFwcGx5aW5nIEluc3RydWN0aW9uc1wiLCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuaW5jbHVkZUFwcGx5aW5nSW5zdHJ1Y3Rpb25zLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIGluc3RydWN0aW9ucyB3aXRoIGEgbWF0Y2hpbmcgJ2FwcGx5VG8nIGF0dHJpYnV0ZSBhcmUgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiBjaGF0IHJlcXVlc3RzLiBUaGlzIHNldHRpbmcgaXMgb25seSB1c2VkIGJ5IHRoZSBMb2NhbCBhZ2VudCBoYXJuZXNzLlwiLCksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdGRpc2FsbG93Q29uZmlndXJhdGlvbkRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ11cblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLklOQ0xVREVfUkVGRVJFTkNFRF9JTlNUUlVDVElPTlNdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0LmluY2x1ZGVSZWZlcmVuY2VkSW5zdHJ1Y3Rpb25zLnRpdGxlJywgXCJJbmNsdWRlIFJlZmVyZW5jZWQgSW5zdHJ1Y3Rpb25zXCIsKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5pbmNsdWRlUmVmZXJlbmNlZEluc3RydWN0aW9ucy5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciByZWZlcmVuY2VkIGluc3RydWN0aW9ucyBhcmUgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiBjaGF0IHJlcXVlc3RzLiBUaGlzIHNldHRpbmcgaXMgb25seSB1c2VkIGJ5IHRoZSBMb2NhbCBhZ2VudCBoYXJuZXNzLlwiLCksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRkaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VDdXN0b21pemF0aW9uc0luUGFyZW50UmVwb3MudGl0bGUnLCBcIlVzZSBDdXN0b21pemF0aW9ucyBpbiBQYXJlbnQgUmVwb3NpdG9yaWVzXCIsKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VDdXN0b21pemF0aW9uc0luUGFyZW50UmVwb3MuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gdXNlIGNoYXQgY3VzdG9taXphdGlvbiBmaWxlcyBpbiBwYXJlbnQgcmVwb3NpdG9yaWVzLiBUaGlzIHNldHRpbmcgaXMgb25seSB1c2VkIGJ5IHRoZSBMb2NhbCBhZ2VudCBoYXJuZXNzLlwiLCksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRkaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydwcm9tcHRzJywgJ3JldXNhYmxlIHByb21wdHMnLCAncHJvbXB0IHNuaXBwZXRzJywgJ2luc3RydWN0aW9ucyddXG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5TS0lMTFNfTE9DQVRJT05fS0VZXToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50U2tpbGxzTG9jYXRpb25zLnRpdGxlJywgXCJBZ2VudCBTa2lsbHMgTG9jYXRpb25zXCIsKSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J2NoYXQuYWdlbnRTa2lsbHNMb2NhdGlvbnMuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcIlNwZWNpZnkgbG9jYXRpb24ocykgb2YgYWdlbnQgc2tpbGxzIChgezB9YCkgdGhhdCBjYW4gYmUgdXNlZCBpbiBDaGF0IFNlc3Npb25zLiBbTGVhcm4gTW9yZV0oezF9KS5cXG5cXG5FYWNoIHBhdGggc2hvdWxkIGNvbnRhaW4gc2tpbGwgc3ViZm9sZGVycyB3aXRoIFNLSUxMLm1kIGZpbGVzIChlLmcuLCBhZGQgYG15LXNraWxsc2AgaWYgeW91IGhhdmUgYG15LXNraWxscy9za2lsbEEvU0tJTEwubWRgKS4gUmVsYXRpdmUgcGF0aHMgYXJlIHJlc29sdmVkIGZyb20gdGhlIHJvb3QgZm9sZGVyKHMpIG9mIHlvdXIgd29ya3NwYWNlLlxcblxcblRoaXMgc2V0dGluZyBpcyBvbmx5IHVzZWQgYnkgdGhlIExvY2FsIGFnZW50IGhhcm5lc3MuXCIsXG5cdFx0XHRcdFNLSUxMX0ZJTEVOQU1FLFxuXHRcdFx0XHRTS0lMTF9ET0NVTUVOVEFUSU9OX1VSTCxcblx0XHRcdCksXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdC4uLkRFRkFVTFRfU0tJTExfU09VUkNFX0ZPTERFUlMubWFwKChmb2xkZXIpID0+ICh7IFtmb2xkZXIucGF0aF06IHRydWUgfSkpLnJlZHVjZSgoYWNjLCBjdXJyKSA9PiAoeyAuLi5hY2MsIC4uLmN1cnIgfSksIHt9KSxcblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdHByb3BlcnR5TmFtZXM6IHtcblx0XHRcdFx0cGF0dGVybjogVkFMSURfUFJPTVBUX0ZPTERFUl9QQVRURVJOLFxuXHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRTa2lsbHNMb2NhdGlvbnMuaW52YWxpZFBhdGgnLCBcIlBhdGhzIG11c3QgYmUgcmVsYXRpdmUgb3Igc3RhcnQgd2l0aCAnfi8nLiBBYnNvbHV0ZSBwYXRocyBhbmQgJ1xcXFwnIHNlcGFyYXRvcnMgYXJlIG5vdCBzdXBwb3J0ZWQuXCIpLFxuXHRcdFx0fSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W0RFRkFVTFRfU0tJTExfU09VUkNFX0ZPTERFUlNbMF0ucGF0aF06IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRbREVGQVVMVF9TS0lMTF9TT1VSQ0VfRk9MREVSU1swXS5wYXRoXTogdHJ1ZSxcblx0XHRcdFx0XHQnbXktc2tpbGxzJzogdHJ1ZSxcblx0XHRcdFx0XHQnLi4vc2hhcmVkLXNraWxscyc6IHRydWUsXG5cdFx0XHRcdFx0J34vLmN1c3RvbS9za2lsbHMnOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLkhPT0tTX0xPQ0FUSU9OX0tFWV06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC5ob29rRmlsZXNMb2NhdGlvbnMudGl0bGUnLCBcIkhvb2sgRmlsZSBMb2NhdGlvbnNcIiwpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKFxuXHRcdFx0XHQnY2hhdC5ob29rRmlsZXNMb2NhdGlvbnMuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcIlNwZWNpZnkgcGF0aHMgdG8gaG9vayBjb25maWd1cmF0aW9uIGZpbGVzIHRoYXQgZGVmaW5lIGN1c3RvbSBzaGVsbCBjb21tYW5kcyB0byBleGVjdXRlIGF0IHN0cmF0ZWdpYyBwb2ludHMgaW4gYW4gYWdlbnQncyB3b3JrZmxvdy4gW0xlYXJuIE1vcmVdKHswfSkuXFxuXFxuUmVsYXRpdmUgcGF0aHMgYXJlIHJlc29sdmVkIGZyb20gdGhlIHJvb3QgZm9sZGVyKHMpIG9mIHlvdXIgd29ya3NwYWNlLiBTdXBwb3J0cyBDb3BpbG90IGhvb2tzIChgKi5qc29uYCkgYW5kIENsYXVkZSBDb2RlIGhvb2tzIChgc2V0dGluZ3MuanNvbmAsIGBzZXR0aW5ncy5sb2NhbC5qc29uYCkuXFxuXFxuVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIixcblx0XHRcdFx0SE9PS19ET0NVTUVOVEFUSU9OX1VSTCxcblx0XHRcdCksXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdC4uLkRFRkFVTFRfSE9PS19GSUxFX1BBVEhTLm1hcCgoZikgPT4gKHsgW2YucGF0aF06IHRydWUgfSkpLnJlZHVjZSgoYWNjLCBjdXJyKSA9PiAoeyAuLi5hY2MsIC4uLmN1cnIgfSksIHt9KSxcblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdHByb3BlcnR5TmFtZXM6IHtcblx0XHRcdFx0cGF0dGVybjogVkFMSURfUFJPTVBUX0ZPTERFUl9QQVRURVJOLFxuXHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NoYXQuaG9va0ZpbGVzTG9jYXRpb25zLmludmFsaWRQYXRoJywgXCJQYXRocyBtdXN0IGJlIHJlbGF0aXZlIG9yIHN0YXJ0IHdpdGggJ34vJy4gQWJzb2x1dGUgcGF0aHMgYW5kICdcXFxcJyBzZXBhcmF0b3JzIGFyZSBub3Qgc3VwcG9ydGVkLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0dGFnczogWydwcmV2aWV3JywgJ3Byb21wdHMnLCAnaG9va3MnLCAnYWdlbnQnXSxcblx0XHRcdGV4YW1wbGVzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRbREVGQVVMVF9IT09LX0ZJTEVfUEFUSFNbMF0ucGF0aF06IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRbREVGQVVMVF9IT09LX0ZJTEVfUEFUSFNbMF0ucGF0aF06IHRydWUsXG5cdFx0XHRcdFx0J2N1c3RvbS1ob29rcy9ob29rcy5qc29uJzogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogeyAnLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJzogZmFsc2UsICcuY2xhdWRlL3NldHRpbmdzLmpzb24nOiBmYWxzZSwgJ34vLmNsYXVkZS9zZXR0aW5ncy5qc29uJzogZmFsc2UgfSB9LFxuXHRcdH0sXG5cdFx0W1Byb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1NdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0LnVzZUhvb2tzLnRpdGxlJywgXCJVc2UgQ2hhdCBIb29rc1wiLCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudXNlSG9va3MuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2hhdCBob29rcyBhcmUgZXhlY3V0ZWQgYXQgc3RyYXRlZ2ljIHBvaW50cyBkdXJpbmcgYW4gYWdlbnQncyB3b3JrZmxvdy4gSG9va3MgYXJlIGxvYWRlZCBmcm9tIHRoZSBmaWxlcyBjb25maWd1cmVkIGluIGAjY2hhdC5ob29rRmlsZXNMb2NhdGlvbnMjYC4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRkaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydwcmV2aWV3JywgJ3Byb21wdHMnLCAnaG9va3MnLCAnYWdlbnQnXSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdEhvb2tzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEwOScsXG5cdFx0XHRcdHZhbHVlOiAocG9saWN5RGF0YSkgPT4gcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQudXNlSG9va3MuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VIb29rcy5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciBjaGF0IGhvb2tzIGFyZSBleGVjdXRlZCBhdCBzdHJhdGVnaWMgcG9pbnRzIGR1cmluZyBhbiBhZ2VudCdzIHdvcmtmbG93LiBIb29rcyBhcmUgbG9hZGVkIGZyb20gdGhlIGZpbGVzIGNvbmZpZ3VyZWQgaW4gYCNjaGF0Lmhvb2tGaWxlc0xvY2F0aW9ucyNgLiBUaGlzIHNldHRpbmcgaXMgb25seSB1c2VkIGJ5IHRoZSBMb2NhbCBhZ2VudCBoYXJuZXNzLlwiLClcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbUHJvbXB0c0NvbmZpZy5VU0VfQ0xBVURFX0hPT0tTXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdC51c2VDbGF1ZGVIb29rcy50aXRsZScsIFwiVXNlIENsYXVkZSBIb29rc1wiLCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudXNlQ2xhdWRlSG9va3MuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgaG9va3MgZnJvbSBDbGF1ZGUgY29uZmlndXJhdGlvbiBmaWxlcyBjYW4gZXhlY3V0ZS4gV2hlbiBkaXNhYmxlZCwgb25seSBDb3BpbG90LWZvcm1hdCBob29rcyBhcmUgdXNlZC4gSG9va3MgYXJlIGxvYWRlZCBmcm9tIHRoZSBmaWxlcyBjb25maWd1cmVkIGluIGAjY2hhdC5ob29rRmlsZXNMb2NhdGlvbnMjYC4gVGhpcyBzZXR0aW5nIGlzIG9ubHkgdXNlZCBieSB0aGUgTG9jYWwgYWdlbnQgaGFybmVzcy5cIiwpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0ZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsncHJldmlldycsICdwcm9tcHRzJywgJ2hvb2tzJywgJ2FnZW50J11cblx0XHR9LFxuXHRcdFtQcm9tcHRzQ29uZmlnLlBST01QVF9GSUxFU19TVUdHRVNUX0tFWV06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRSxcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0LnByb21wdEZpbGVzUmVjb21tZW5kYXRpb25zLnRpdGxlJyxcblx0XHRcdFx0XCJQcm9tcHQgRmlsZSBSZWNvbW1lbmRhdGlvbnNcIixcblx0XHRcdCksXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0LnByb21wdEZpbGVzUmVjb21tZW5kYXRpb25zLmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XCJDb25maWd1cmUgd2hpY2ggcHJvbXB0IGZpbGVzIHRvIHJlY29tbWVuZCBpbiB0aGUgY2hhdCB3ZWxjb21lIHZpZXcuIEVhY2gga2V5IGlzIGEgcHJvbXB0IGZpbGUgbmFtZSwgYW5kIHRoZSB2YWx1ZSBjYW4gYmUgYHRydWVgIHRvIGFsd2F5cyByZWNvbW1lbmQsIGBmYWxzZWAgdG8gbmV2ZXIgcmVjb21tZW5kLCBvciBhIFt3aGVuIGNsYXVzZV0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXdoZW4tY2xhdXNlKSBleHByZXNzaW9uIGxpa2UgYHJlc291cmNlRXh0bmFtZSA9PSAuanNgIG9yIGByZXNvdXJjZUxhbmdJZCA9PSBtYXJrZG93bmAuXCIsXG5cdFx0XHQpLFxuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR0YWdzOiBbJ3Byb21wdHMnLCAncmV1c2FibGUgcHJvbXB0cycsICdwcm9tcHQgc25pcHBldHMnLCAnaW5zdHJ1Y3Rpb25zJ10sXG5cdFx0XHRleGFtcGxlczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0J3BsYW4nOiB0cnVlLFxuXHRcdFx0XHRcdCdhMTF5LWF1ZGl0JzogJ3Jlc291cmNlRXh0bmFtZSA9PSAuaHRtbCcsXG5cdFx0XHRcdFx0J2RvY3VtZW50JzogJ3Jlc291cmNlTGFuZ0lkID09IG1hcmtkb3duJ1xuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLlRvZG9zU2hvd1dpZGdldF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLnRvZG9zLnNob3dXaWRnZXQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gc2hvdyB0aGUgdG9kbyBsaXN0IHdpZGdldCBhYm92ZSB0aGUgY2hhdCBpbnB1dC4gV2hlbiBlbmFibGVkLCB0aGUgd2lkZ2V0IGRpc3BsYXlzIHRvZG8gaXRlbXMgY3JlYXRlZCBieSB0aGUgYWdlbnQgYW5kIHVwZGF0ZXMgYXMgcHJvZ3Jlc3MgaXMgbWFkZS5cIiksXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVGhpbmtpbmdTdHlsZV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVmYXVsdDogJ2ZpeGVkU2Nyb2xsaW5nJyxcblx0XHRcdGVudW06IFsnY29sbGFwc2VkJywgJ2NvbGxhcHNlZFByZXZpZXcnLCAnZml4ZWRTY3JvbGxpbmcnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nTW9kZS5jb2xsYXBzZWQnLCBcIlRoaW5raW5nIHBhcnRzIHdpbGwgYmUgY29sbGFwc2VkIGJ5IGRlZmF1bHQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQudGhpbmtpbmdNb2RlLmNvbGxhcHNlZFByZXZpZXcnLCBcIlRoaW5raW5nIHBhcnRzIHdpbGwgYmUgZXhwYW5kZWQgZmlyc3QsIHRoZW4gY29sbGFwc2Ugb25jZSB3ZSByZWFjaCBhIHBhcnQgdGhhdCBpcyBub3QgdGhpbmtpbmcuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQudGhpbmtpbmdNb2RlLmZpeGVkU2Nyb2xsaW5nJywgXCJTaG93IHRoaW5raW5nIGluIGEgZml4ZWQtaGVpZ2h0IHN0cmVhbWluZyBwYW5lbCB0aGF0IGF1dG8tc2Nyb2xsczsgY2xpY2sgaGVhZGVyIHRvIGV4cGFuZCB0byBmdWxsIGhlaWdodC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudC50aGlua2luZ1N0eWxlJywgXCJDb250cm9scyBob3cgdGhpbmtpbmcgaXMgcmVuZGVyZWQuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5UaGlua2luZ0dlbmVyYXRlVGl0bGVzXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQudGhpbmtpbmcuZ2VuZXJhdGVUaXRsZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gdXNlIGFuIExMTSB0byBnZW5lcmF0ZSBzdW1tYXJ5IHRpdGxlcyBmb3IgdGhpbmtpbmcgc2VjdGlvbnMuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZWZhdWx0OiAnYWx3YXlzJyxcblx0XHRcdGVudW06IFsnb2ZmJywgJ3dpdGhUaGlua2luZycsICdhbHdheXMnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzLm9mZicsIFwiVG9vbCBjYWxscyBhcmUgc2hvd24gc2VwYXJhdGVseSwgbm90IGNvbGxhcHNlZCBpbnRvIHRoaW5raW5nLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzLndpdGhUaGlua2luZycsIFwiVG9vbCBjYWxscyBhcmUgY29sbGFwc2VkIGludG8gdGhpbmtpbmcgc2VjdGlvbnMgd2hlbiB0aGlua2luZyBpcyBwcmVzZW50LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzLmFsd2F5cycsIFwiVG9vbCBjYWxscyBhcmUgYWx3YXlzIGNvbGxhcHNlZCwgZXZlbiB3aXRob3V0IHRoaW5raW5nLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQudGhpbmtpbmcuY29sbGFwc2VkVG9vbHMnLCBcIkNvbnRyb2xzIGhvdyB0b29sIGNhbGxzIGFyZSBkaXNwbGF5ZWQgaW4gcmVsYXRpb24gdG8gdGhpbmtpbmcgc2VjdGlvbnMuXCIpLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5UZXJtaW5hbFRvb2xzSW5UaGlua2luZ106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQudGhpbmtpbmcudGVybWluYWxUb29scycsIFwiV2hlbiBlbmFibGVkLCB0ZXJtaW5hbCB0b29sIGNhbGxzIGFyZSBkaXNwbGF5ZWQgaW5zaWRlIHRoZSB0aGlua2luZyBkcm9wZG93biB3aXRoIGEgc2ltcGxpZmllZCB2aWV3LlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uU2ltcGxlVGVybWluYWxDb2xsYXBzaWJsZV06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMudGVybWluYWwuc2ltcGxlQ29sbGFwc2libGUnLCBcIldoZW4gZW5hYmxlZCwgdGVybWluYWwgdG9vbCBjYWxscyBhcmUgYWx3YXlzIGRpc3BsYXllZCBpbiBhIGNvbGxhcHNpYmxlIGNvbnRhaW5lciB3aXRoIGEgc2ltcGxpZmllZCB2aWV3LlwiKSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ29tcHJlc3NPdXRwdXRFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQudG9vbHMuY29tcHJlc3NPdXRwdXQuZW5hYmxlZCcsIFwiUG9zdC1wcm9jZXNzIHRvb2wgb3V0cHV0IChmb3IgZXhhbXBsZSBgZ2l0IGRpZmZgLCBgbHMgLWxgLCBvciBgbnBtIGluc3RhbGxgKSB0byByZWR1Y2UgdG9rZW4gdXNhZ2UgYmVmb3JlIGl0IGlzIHNlbnQgdG8gdGhlIG1vZGVsLlwiKSxcblx0XHRcdHRhZ3M6IFsncHJldmlldyddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5UaGlua2luZ1BocmFzZXNdOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0bW9kZTogJ2FwcGVuZCcsXG5cdFx0XHRcdHBocmFzZXM6IFtdXG5cdFx0XHR9LFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRtb2RlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydyZXBsYWNlJywgJ2FwcGVuZCddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdhcHBlbmQnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnQudGhpbmtpbmcucGhyYXNlcy5tb2RlJywgXCIncmVwbGFjZScgcmVwbGFjZXMgYWxsIGRlZmF1bHQgcGhyYXNlcyBlbnRpcmVseTsgJ2FwcGVuZCcgYWRkcyB5b3VyIHBocmFzZXMgdG8gYWxsIGRlZmF1bHQgY2F0ZWdvcmllcy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0cGhyYXNlczoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLnBocmFzZXMucGhyYXNlcycsIFwiQ3VzdG9tIGxvYWRpbmcgbWVzc2FnZXMgdG8gc2hvdyBkdXJpbmcgdGhpbmtpbmcsIHdvcmtpbmcgcHJvZ3Jlc3MsIHRlcm1pbmFsLCBhbmQgdG9vbCBvcGVyYXRpb25zLlwiKVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50LnRoaW5raW5nLnBocmFzZXMnLCBcIkN1c3RvbWl6ZSB0aGUgbG9hZGluZyBtZXNzYWdlcyBzaG93biBkdXJpbmcgYWdlbnQgdGhpbmtpbmcgYW5kIHByb2dyZXNzIGluZGljYXRvcnMuIFVzZSBgXFxcIm1vZGVcXFwiOiBcXFwicmVwbGFjZVxcXCJgIHRvIHVzZSBvbmx5IHlvdXIgcGhyYXNlcywgb3IgYFxcXCJtb2RlXFxcIjogXFxcImFwcGVuZFxcXCJgIHRvIGFkZCB0aGVtIHRvIHRoZSBkZWZhdWx0cy5cIiksXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkF1dG9FeHBhbmRUb29sRmFpbHVyZXNdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnRvb2xzLmF1dG9FeHBhbmRGYWlsdXJlcycsIFwiV2hlbiBlbmFibGVkLCB0ZXJtaW5hbCB0b29sIGZhaWx1cmVzIGFyZSBhdXRvbWF0aWNhbGx5IGV4cGFuZGVkIGluIHRoZSBjaGF0IFVJIHRvIHNob3cgZXJyb3IgZGV0YWlscy5cIiksXG5cdFx0fSxcblx0XHRbQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmRpc2FibGVBSUZlYXR1cmVzJywgXCJEaXNhYmxlIGFuZCBoaWRlIGJ1aWx0LWluIEFJIGZlYXR1cmVzIHByb3ZpZGVkIGJ5IEdpdEh1YiBDb3BpbG90LCBpbmNsdWRpbmcgY2hhdCBhbmQgaW5saW5lIHN1Z2dlc3Rpb25zLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5XSU5ET1csXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVGl0bGVCYXJTaWduSW5FbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC50aXRsZUJhci5zaWduSW4uZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgQ29waWxvdCBTaWduIEluIGJ1dHRvbiBpcyBzaG93biBpbiB0aGUgdGl0bGUgYmFyIHdoZW4gc2lnbmVkIG91dC4gV2hlbiBkaXNhYmxlZCwgdGhlIFNpZ24gSW4gYWZmb3JkYW5jZSBmYWxscyBiYWNrIHRvIHRoZSBzdGF0dXMgYmFyLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uVGl0bGVCYXJPcGVuSW5BZ2VudHNXaW5kb3dFbmFibGVkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC50aXRsZUJhci5vcGVuSW5BZ2VudHNXaW5kb3cuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgT3BlbiBpbiBBZ2VudHMgV2luZG93IGJ1dHRvbiBpcyBzaG93biBpbiB0aGUgdGl0bGUgYmFyLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0fSxcblx0XHQnY2hhdC5hcHByb3ZlZEFjY291bnRPcmdhbml6YXRpb25zJzoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFwcHJvdmVkQWNjb3VudE9yZ2FuaXphdGlvbnMnLCBcIkxpc3Qgb2YgR2l0SHViIG9yZ2FuaXphdGlvbiBsb2dpbnMgd2hvc2UgbWVtYmVycyBhcmUgcGVybWl0dGVkIHRvIHVzZSBBSSBmZWF0dXJlcy4gV2hlbiBzZXQgdG8gYSBub24tZW1wdHkgbGlzdCwgQUkgZmVhdHVyZXMgYXJlIGRpc2FibGVkIHVudGlsIHRoZSB1c2VyIHNpZ25zIGludG8gYSBHaXRIdWIgYWNjb3VudCB0aGF0IGJlbG9uZ3MgdG8gb25lIG9mIHRoZSBzcGVjaWZpZWQgb3JnYW5pemF0aW9ucyBhbmQgYWNjb3VudC1sZXZlbCBwb2xpY3kgZGF0YSBoYXMgYmVlbiByZXNvbHZlZC4gU2V0IHRvICcqJyB0byBhbGxvdyBhbnkgYXV0aGVudGljYXRlZCBHaXRIdWIgb3IgR2l0SHViIEVudGVycHJpc2UgYWNjb3VudC5cIiksXG5cdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdGluY2x1ZGVkOiBmYWxzZSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2hhdEFwcHJvdmVkQWNjb3VudE9yZ2FuaXphdGlvbnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTE4Jyxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYXBwcm92ZWRBY2NvdW50T3JnYW5pemF0aW9ucy5wb2xpY3kuZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hcHByb3ZlZEFjY291bnRPcmdhbml6YXRpb25zLnBvbGljeS5kZXNjcmlwdGlvbicsIFwiU2V0dGluZyB0aGlzIHBvbGljeSB0byBhIG5vbi1lbXB0eSBsaXN0IGFjdGl2YXRlcyB0aGUgQXBwcm92ZWQgQWNjb3VudCBnYXRlOiBhbGwgQUkgZmVhdHVyZXMgYXJlIGRpc2FibGVkIHVudGlsIHRoZSB1c2VyIHNpZ25zIGludG8gYSBHaXRIdWIgYWNjb3VudCB3aG9zZSBvcmdhbml6YXRpb25zIGludGVyc2VjdCB0aGlzIGxpc3QgQU5EIHRoZSBhY2NvdW50LXNpZGUgcG9saWN5IGRhdGEgaGFzIHJlc29sdmVkLiBDb21wYXJpc29uIGlzIGNhc2UtaW5zZW5zaXRpdmUuIFVzZSAnKicgYXMgYSB3aWxkY2FyZCB0byBhY2NlcHQgYW55IHNpZ25lZC1pbiBHaXRIdWIgb3IgR0hFIGFjY291bnQgKHVzZSB0aGlzIGZvciBHSEUgZGVwbG95bWVudHMgd2hlcmUgdGhlIG9yZ2FuaXphdGlvbiBsaXN0IGlzIG5vdCBzdXJmYWNlZCkuXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnY2hhdC5hbGxvd0Fub255bW91c0FjY2Vzcyc6IHsgLy8gVE9ET0BicGFzZXJvIHJlbW92ZSBtZSBldmVudHVhbGx5XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFsbG93QW5vbnltb3VzQWNjZXNzJywgXCJDb250cm9scyB3aGV0aGVyIGFub255bW91cyBhY2Nlc3MgaXMgYWxsb3dlZCBpbiBjaGF0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uR3Jvd3RoTm90aWZpY2F0aW9uRW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZ3Jvd3RoTm90aWZpY2F0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNob3cgYSBncm93dGggbm90aWZpY2F0aW9uIGluIHRoZSBhZ2VudCBzZXNzaW9ucyB2aWV3IHRvIGVuY291cmFnZSBuZXcgdXNlcnMgdG8gdHJ5IENvcGlsb3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5SZXN0b3JlTGFzdFBhbmVsU2Vzc2lvbl06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucmVzdG9yZUxhc3RQYW5lbFNlc3Npb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGxhc3Qgc2Vzc2lvbiBpcyByZXN0b3JlZCBpbiBwYW5lbCBhZnRlciByZXN0YXJ0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uRXhpdEFmdGVyRGVsZWdhdGlvbl06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXhpdEFmdGVyRGVsZWdhdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgY2hhdCBwYW5lbCBhdXRvbWF0aWNhbGx5IGV4aXRzIGFmdGVyIGRlbGVnYXRpbmcgYSByZXF1ZXN0IHRvIGFub3RoZXIgc2Vzc2lvbi5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHRhZ3M6IFsncHJldmlldyddLFxuXHRcdH0sXG5cdFx0J2NoYXQuZXh0ZW5zaW9uVW5pZmljYXRpb24uZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuZXh0ZW5zaW9uVW5pZmljYXRpb24uZW5hYmxlZCcsIFwiRW5hYmxlcyB0aGUgdW5pZmljYXRpb24gb2YgR2l0SHViIENvcGlsb3QgZXh0ZW5zaW9ucy4gV2hlbiBlbmFibGVkLCBhbGwgR2l0SHViIENvcGlsb3QgZnVuY3Rpb25hbGl0eSBpcyBzZXJ2ZWQgZnJvbSB0aGUgR2l0SHViIENvcGlsb3QgQ2hhdCBleHRlbnNpb24uIFdoZW4gZGlzYWJsZWQsIHRoZSBHaXRIdWIgQ29waWxvdCBhbmQgR2l0SHViIENvcGlsb3QgQ2hhdCBleHRlbnNpb25zIG9wZXJhdGUgaW5kZXBlbmRlbnRseS5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uU3ViYWdlbnRzQWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHNdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnN1YmFnZW50cy5hbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50cycsIFwiQWxsb3cgc3ViYWdlbnRzIHRvIGludm9rZSBzdWJhZ2VudHMuXCIpLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnN1YmFnZW50cy5hbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50cy5tZCcsIFwiQ29udHJvbHMgd2hldGhlciBzdWJhZ2VudHMgY2FuIGludm9rZSBvdGhlciBzdWJhZ2VudHMuIFdoZW4gZW5hYmxlZCwgbmVzdGluZyBpcyBsaW1pdGVkIHRvIGEgbWF4aW11bSBkZXB0aCBvZiA1LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Db2xsZWN0SW5zdHJ1Y3Rpb25zSW5FeHRlbnNpb25dOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmV4cGVyaW1lbnRhbC5jb2xsZWN0SW5zdHJ1Y3Rpb25zSW5FeHRlbnNpb24nLCBcIldoZW4gZW5hYmxlZCwgYXV0b21hdGljIGluc3RydWN0aW9uIGNvbGxlY3Rpb24gKC5pbnN0cnVjdGlvbnMubWQsIGFnZW50IGluc3RydWN0aW9ucywgY3VzdG9taXphdGlvbnMgaW5kZXgpIGlzIHBlcmZvcm1lZCBieSB0aGUgR2l0SHViIENvcGlsb3QgQ2hhdCBleHRlbnNpb24gaW5zdGVhZCBvZiB0aGUgY29yZSB3b3JrYmVuY2guXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1N0cnVjdHVyZWRQcmV2aWV3RW5hYmxlZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdHRhZ3M6IFsncHJldmlldyddLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5jdXN0b21pemF0aW9ucy5zdHJ1Y3R1cmVkUHJldmlldy5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBDaGF0IEN1c3RvbWl6YXRpb25zIGVkaXRvciBzaG93cyBhIHN0cnVjdHVyZWQgcHJldmlldyBmb3IgbWFya2Rvd24gY3VzdG9taXphdGlvbiBmaWxlcyAoYWdlbnRzLCBza2lsbHMsIGluc3RydWN0aW9ucywgcHJvbXB0cykuIFdoZW4gZGlzYWJsZWQsIHRoZSBlZGl0b3IgYWx3YXlzIG9wZW5zIHRoZSByYXcgbWFya2Rvd24gaW4gdGhlIGVtYmVkZGVkIGNvZGUgZWRpdG9yLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdH0sXG5cdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5jdXN0b21pemF0aW9ucy5wcm9tcHRNaWdyYXRpb24uZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgQ2hhdCBDdXN0b21pemF0aW9ucyBlZGl0b3Igc2hvd3MgdGhlIHByb21wdCBmaWxlIG1pZ3JhdGlvbiBhZmZvcmRhbmNlcyBmb3IgYWdlbnQtaG9zdCBoYXJuZXNzZXMuIFdoZW4gZGlzYWJsZWQsIHRoZSBtaWdyYXRpb24gY2FyZCBhbmQgc2lkZWJhciBzaG9ydGN1dCBhcmUgaGlkZGVuLlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdH1cblx0fVxufSk7XG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdENoYXRFZGl0b3IsXG5cdFx0Q2hhdEVkaXRvcklucHV0LkVkaXRvcklELFxuXHRcdG5scy5sb2NhbGl6ZSgnY2hhdCcsIFwiQ2hhdFwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKENoYXRFZGl0b3JJbnB1dClcblx0XVxuKTtcblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0Q2hhdERlYnVnRWRpdG9yLFxuXHRcdENoYXREZWJ1Z0VkaXRvcklucHV0LklELFxuXHRcdG5scy5sb2NhbGl6ZSgnY2hhdERlYnVnJywgXCJEZWJ1ZyBWaWV3XCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdERlYnVnRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdEFnZW50UGx1Z2luRWRpdG9yLFxuXHRcdEFnZW50UGx1Z2luRWRpdG9yLklELFxuXHRcdG5scy5sb2NhbGl6ZSgnYWdlbnRQbHVnaW4nLCBcIkFnZW50IFBsdWdpblwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKEFnZW50UGx1Z2luRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5mdW5jdGlvbiBpc1N0cmluZ0tleWVkT2JqZWN0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4ge1xuXHRyZXR1cm4gISF2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gbWlncmF0ZUNoYXREZWZhdWx0Q29uZmlndXJhdGlvbih2YWx1ZTogdW5rbm93bik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFpc1N0cmluZ0tleWVkT2JqZWN0KHZhbHVlKSB8fCB2YWx1ZS5hcHByb3ZhbHMgIT09IENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b0FwcHJvdmUpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7IC4uLnZhbHVlLCBhcHByb3ZhbHM6IENoYXREZWZhdWx0UGVybWlzc2lvbkxldmVsLkFsbG93QWxsIH07XG59XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uTWlncmF0aW9ucyhbXG5cdHtcblx0XHRrZXk6ICdjaGF0LmFnZW50U2Vzc2lvbnMuZGVmYXVsdENvbmZpZ3VyYXRpb24nLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlLCBfYWNjZXNzb3IpID0+IChbXG5cdFx0XHRbJ2NoYXQuYWdlbnRTZXNzaW9ucy5kZWZhdWx0Q29uZmlndXJhdGlvbicsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XSxcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0Q29uZmlndXJhdGlvbiwgeyB2YWx1ZTogbWlncmF0ZUNoYXREZWZhdWx0Q29uZmlndXJhdGlvbih2YWx1ZSkgPz8gdmFsdWUgfV1cblx0XHRdKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiBDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0Q29uZmlndXJhdGlvbixcblx0XHRtaWdyYXRlRm46IHZhbHVlID0+ICh7IHZhbHVlOiBtaWdyYXRlQ2hhdERlZmF1bHRDb25maWd1cmF0aW9uKHZhbHVlKSA/PyB2YWx1ZSB9KVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC5leHBlcmltZW50YWwuYXV0b0FwcHJvdmFscy5lbmFibGVkJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZSwgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IHBhaXJzOiBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycyA9IFtbJ2NoYXQuZXhwZXJpbWVudGFsLmF1dG9BcHByb3ZhbHMuZW5hYmxlZCcsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XV07XG5cdFx0XHRpZiAoYWNjZXNzb3IoQ2hhdENvbmZpZ3VyYXRpb24uQXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFpcnMucHVzaChbQ2hhdENvbmZpZ3VyYXRpb24uQXNzaXN0ZWRQZXJtaXNzaW9uc0VuYWJsZWQsIHsgdmFsdWUgfV0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhaXJzO1xuXHRcdH1cblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQuZXhwZXJpbWVudGFsLmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWQnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlLCBfYWNjZXNzb3IpID0+IChbXG5cdFx0XHRbJ2NoYXQuZXhwZXJpbWVudGFsLmRldGVjdFBhcnRpY2lwYW50LmVuYWJsZWQnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRbJ2NoYXQuZGV0ZWN0UGFydGljaXBhbnQuZW5hYmxlZCcsIHsgdmFsdWU6IHZhbHVlICE9PSBmYWxzZSB9XVxuXHRcdF0pXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0LnVzZUNvcGlsb3RNb2RlbHNGb3JVdGlsaXR5TW9kZWxzJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93biwgdmFsdWVBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycyA9IFtbJ2NoYXQudXNlQ29waWxvdE1vZGVsc0ZvclV0aWxpdHlNb2RlbHMnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV1dO1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nICYmIHZhbHVlQWNjZXNzb3IoQ2hhdENvbmZpZ3VyYXRpb24uQllPS1V0aWxpdHlNb2RlbERlZmF1bHQpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goW0NoYXRDb25maWd1cmF0aW9uLkJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0LCB7IHZhbHVlOiB2YWx1ZSA/IEJZT0tVdGlsaXR5TW9kZWxEZWZhdWx0LkNvcGlsb3QgOiBCWU9LVXRpbGl0eU1vZGVsRGVmYXVsdC5Ob25lIH1dKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC51c2VDbGF1ZGVTa2lsbHMnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlLCBfYWNjZXNzb3IpID0+IChbXG5cdFx0XHRbJ2NoYXQudXNlQ2xhdWRlU2tpbGxzJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dLFxuXHRcdFx0WydjaGF0LnVzZUFnZW50U2tpbGxzJywgeyB2YWx1ZSB9XVxuXHRcdF0pXG5cdH0sXG5cdHtcblx0XHRrZXk6IG1jcERpc2NvdmVyeVNlY3Rpb24sXG5cdFx0bWlncmF0ZUZuOiAodmFsdWU6IHVua25vd24pID0+IHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogT2JqZWN0LmZyb21FbnRyaWVzKGFsbERpc2NvdmVyeVNvdXJjZXMubWFwKGsgPT4gW2ssIHZhbHVlXSkpIH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IHZhbHVlIH07XG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0a2V5OiBDaGF0Q29uZmlndXJhdGlvbi5Ob3RpZnlXaW5kb3dPbkNvbmZpcm1hdGlvbixcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93bikgPT4ge1xuXHRcdFx0aWYgKHZhbHVlID09PSB0cnVlKSB7XG5cdFx0XHRcdHJldHVybiB7IHZhbHVlOiBDaGF0Tm90aWZpY2F0aW9uTW9kZS5XaW5kb3dOb3RGb2N1c2VkIH07XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlID09PSBmYWxzZSkge1xuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogQ2hhdE5vdGlmaWNhdGlvbk1vZGUuT2ZmIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0a2V5OiBDaGF0Q29uZmlndXJhdGlvbi5Ob3RpZnlXaW5kb3dPblJlc3BvbnNlUmVjZWl2ZWQsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWU6IHVua25vd24pID0+IHtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogQ2hhdE5vdGlmaWNhdGlvbk1vZGUuV2luZG93Tm90Rm9jdXNlZCB9O1xuXHRcdFx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IENoYXROb3RpZmljYXRpb25Nb2RlLk9mZiB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQucGx1Z2lucy5wYXRocycsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWU6IHVua25vd24sIF9hY2Nlc3NvcikgPT4gKFtcblx0XHRcdFsnY2hhdC5wbHVnaW5zLnBhdGhzJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dLFxuXHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlBsdWdpbkxvY2F0aW9ucywgeyB2YWx1ZSB9XVxuXHRcdF0pXG5cdH0sXG5cdHtcblx0XHQvLyBUaGUgb24tZGV2aWNlIGRpY3RhdGlvbiBydW50aW1lIG1vdmVkIHRvIEZvdW5kcnkgTG9jYWw7IHRoZSBvbGRcblx0XHQvLyB0cmFuc2Zvcm1lcnMuanMvb25ueHJ1bnRpbWUgbW9kZWwgSURzIG5vIGxvbmdlciByZXNvbHZlIGFuZCB3b3VsZCBmYWlsXG5cdFx0Ly8gd2l0aCBhbiB1bmtub3duLW1vZGVsIGVycm9yLiBNYXAgYW55IGV4cGxpY2l0bHktc3RvcmVkIGxlZ2FjeSB2YWx1ZSB0b1xuXHRcdC8vIHRoZSBuZXcgZGVmYXVsdCBzbyBleGlzdGluZyB1c2VycyBrZWVwIHdvcmtpbmcuIEFsc28gbWlncmF0ZSB0aGUgc2V0dGluZ1xuXHRcdC8vIGZyb20gaXRzIG9sZCBgY2hhdC5zcGVlY2hUb1RleHQubW9kZWxgIGlkIHRvIGBkaWN0YXRpb24ubW9kZWxgLlxuXHRcdGtleTogJ2NoYXQuc3BlZWNoVG9UZXh0Lm1vZGVsJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93biwgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGxlZ2FjeU1vZGVsSWRzID0gW1xuXHRcdFx0XHQnb25ueC1jb21tdW5pdHkvd2hpc3Blci10aW55Jyxcblx0XHRcdFx0J29ubngtY29tbXVuaXR5L3doaXNwZXItYmFzZScsXG5cdFx0XHRcdCdvbm54LWNvbW11bml0eS93aGlzcGVyLXNtYWxsJyxcblx0XHRcdFx0J29ubngtY29tbXVuaXR5L25lbW90cm9uLTMuNS1hc3Itc3RyZWFtaW5nLTAuNmItb25ueC1pbnQ0Jyxcblx0XHRcdFx0J25lbW90cm9uLXNwZWVjaC1zdHJlYW1pbmctZW4tMC42YicsXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgbWlncmF0ZWQgPSAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiBsZWdhY3lNb2RlbElkcy5pbmNsdWRlcyh2YWx1ZSkpXG5cdFx0XHRcdD8gREVGQVVMVF9MT0NBTF9UUkFOU0NSSVBUSU9OX01PREVMXG5cdFx0XHRcdDogdmFsdWU7XG5cdFx0XHRjb25zdCBwYWlyczogQ29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMgPSBbWydjaGF0LnNwZWVjaFRvVGV4dC5tb2RlbCcsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XV07XG5cdFx0XHQvLyBOZXZlciBjbG9iYmVyIGFuIGV4cGxpY2l0bHkgY29uZmlndXJlZCBuZXcga2V5IChlLmcuIGFmdGVyIHNldHRpbmdzXG5cdFx0XHQvLyBzeW5jIGJyb3VnaHQgYm90aCBrZXlzIGFjcm9zcyB2ZXJzaW9ucykuXG5cdFx0XHRpZiAoYWNjZXNzb3IoJ2RpY3RhdGlvbi5tb2RlbCcpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFpcnMucHVzaChbJ2RpY3RhdGlvbi5tb2RlbCcsIHsgdmFsdWU6IG1pZ3JhdGVkIH1dKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYWlycztcblx0XHR9XG5cdH0sXG5cdHtcblx0XHQvLyBFeGlzdGluZyB1c2VycyBtYXkgaGF2ZSB0aGUgZm9ybWVyIEVuZ2xpc2gtb25seSBkZWZhdWx0IHN0b3JlZFxuXHRcdC8vIGV4cGxpY2l0bHkuIE1vdmUgdGhlbSB0byB0aGUgbXVsdGlsaW5ndWFsIHJlcGxhY2VtZW50IGFzIHdlbGwuXG5cdFx0a2V5OiAnZGljdGF0aW9uLm1vZGVsJyxcblx0XHRtaWdyYXRlRm46IHZhbHVlID0+ICh7XG5cdFx0XHR2YWx1ZTogdmFsdWUgPT09ICduZW1vdHJvbi1zcGVlY2gtc3RyZWFtaW5nLWVuLTAuNmInXG5cdFx0XHRcdD8gREVGQVVMVF9MT0NBTF9UUkFOU0NSSVBUSU9OX01PREVMXG5cdFx0XHRcdDogdmFsdWVcblx0XHR9KVxuXHR9LFxuXHR7XG5cdFx0Ly8gRGljdGF0aW9uIHNldHRpbmdzIHdlcmUgcmVncm91cGVkIHVuZGVyIHRoZSB0b3AtbGV2ZWwgYGRpY3RhdGlvbi4qYFxuXHRcdC8vIG5hbWVzcGFjZSAodGhleSBnb3Zlcm4gZGljdGF0aW9uIGFjcm9zcyBjaGF0LCBlZGl0b3IsIGFuZCB0ZXJtaW5hbCkuXG5cdFx0a2V5OiAnY2hhdC5zcGVlY2hUb1RleHQuZW5hYmxlZCcsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWU6IHVua25vd24sIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBwYWlyczogQ29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMgPSBbWydjaGF0LnNwZWVjaFRvVGV4dC5lbmFibGVkJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXTtcblx0XHRcdGlmIChhY2Nlc3NvcignZGljdGF0aW9uLmVuYWJsZWQnKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHBhaXJzLnB1c2goWydkaWN0YXRpb24uZW5hYmxlZCcsIHsgdmFsdWUgfV0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhaXJzO1xuXHRcdH1cblx0fSxcblx0e1xuXHRcdC8vIGBjaGF0LnNwZWVjaFRvVGV4dC5tb2RlYCB3YXMgcmVtb3ZlZCAodGhlIHNob3J0Y3V0IGlzIGFsd2F5cyB0YXAtdG9nZ2xlIC9cblx0XHQvLyBob2xkLXRvLXRhbGspOyBjbGVhciBpdCBzbyBpdCBkb2VzIG5vdCBsaW5nZXIgYXMgYW4gdW5rbm93biBzZXR0aW5nLlxuXHRcdGtleTogJ2NoYXQuc3BlZWNoVG9UZXh0Lm1vZGUnLFxuXHRcdG1pZ3JhdGVGbjogKCkgPT4gKFtbJ2NoYXQuc3BlZWNoVG9UZXh0Lm1vZGUnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV1dKVxuXHR9LFxuXSk7XG5cbmNsYXNzIENoYXRSZXNvbHZlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0UmVzb2x2ZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclJlZ2lzdHJhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyRWRpdG9yKFNjaGVtYXMudnNjb2RlQ2hhdEVkaXRvcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXJFZGl0b3IoU2NoZW1hcy52c2NvZGVMb2NhbENoYXRTZXNzaW9uKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VDb250ZW50UHJvdmlkZXJTY2hlbWVzKChlKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiBlLmFkZGVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyRWRpdG9yKHNjaGVtZSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHNjaGVtZSBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yUmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKHNjaGVtZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Zm9yIChjb25zdCBzY2hlbWUgb2YgY2hhdFNlc3Npb25zU2VydmljZS5nZXRDb250ZW50UHJvdmlkZXJTY2hlbWVzKCkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyRWRpdG9yKHNjaGVtZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJFZGl0b3Ioc2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3JSZWdpc3RyYXRpb25zLnNldChzY2hlbWUsIHRoaXMuZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKGAke3NjaGVtZX06KiovKipgLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogQ2hhdEVkaXRvcklucHV0LkVkaXRvcklELFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdjaGF0JywgXCJDaGF0XCIpLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmJ1aWx0aW5cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHNpbmdsZVBlclJlc291cmNlOiB0cnVlLFxuXHRcdFx0XHRjYW5TdXBwb3J0UmVzb3VyY2U6IHJlc291cmNlID0+IHJlc291cmNlLnNjaGVtZSA9PT0gc2NoZW1lLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZWRpdG9yOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0b3JJbnB1dCwgcmVzb3VyY2UsIG9wdGlvbnMgYXMgSUNoYXRFZGl0b3JPcHRpb25zKSxcblx0XHRcdFx0XHRcdG9wdGlvbnNcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cdH1cbn1cblxuY2xhc3MgQ29waWxvdFRlbGVtZXRyeUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY29waWxvdFRlbGVtZXRyeSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUNvbW1vblByb3BlcnRpZXMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVudGl0bGVtZW50KCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQ29tbW9uUHJvcGVydGllcygpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29tbW9uUHJvcGVydGllcygpOiB2b2lkIHtcblx0XHRjb25zdCBjb3BpbG90VHJhY2tpbmdJZCA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5jb3BpbG90VHJhY2tpbmdJZDtcblx0XHRpZiAoY29waWxvdFRyYWNraW5nSWQpIHtcblx0XHRcdC8vIF9fR0RQUl9fQ09NTU9OX18gXCJjb21tb24uY29waWxvdFRyYWNraW5nSWRcIiA6IHsgXCJlbmRQb2ludFwiOiBcIkdvb2dsZUFuYWx5dGljc0lEXCIsIFwiY2xhc3NpZmljYXRpb25cIjogXCJFbmRVc2VyUHNldWRvbnltaXplZEluZm9ybWF0aW9uXCIsIFwicHVycG9zZVwiOiBcIkJ1c2luZXNzSW5zaWdodFwiLCBcImNvbW1lbnRcIjogXCJUaGUgYW5vbnltaXplZCBDb3BpbG90IGFuYWx5dGljcyB0cmFja2luZyBJRCBmcm9tIHRoZSBlbnRpdGxlbWVudCBBUEkuXCIgfVxuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnNldENvbW1vblByb3BlcnR5KCdjb21tb24uY29waWxvdFRyYWNraW5nSWQnLCBjb3BpbG90VHJhY2tpbmdJZCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5pc0ludGVybmFsKSB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2Uuc2V0Q29tbW9uUHJvcGVydHkoJ2NvbW1vbi5tc2Z0SW50ZXJuYWwnLCB0cnVlKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQ2hhdERlYnVnUmVzb2x2ZXJDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdERlYnVnUmVzb2x2ZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIGVkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0KSB7XG5cdFx0ZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKFxuXHRcdFx0YCR7Q2hhdERlYnVnRWRpdG9ySW5wdXQuUkVTT1VSQ0Uuc2NoZW1lfToqKi8qKmAsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBDaGF0RGVidWdFZGl0b3JJbnB1dC5JRCxcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY2hhdERlYnVnJywgXCJEZWJ1ZyBWaWV3XCIpLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4Y2x1c2l2ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c2luZ2xlUGVyUmVzb3VyY2U6IHRydWUsXG5cdFx0XHRcdGNhblN1cHBvcnRSZXNvdXJjZTogcmVzb3VyY2UgPT4gcmVzb3VyY2Uuc2NoZW1lID09PSBDaGF0RGVidWdFZGl0b3JJbnB1dC5SRVNPVVJDRS5zY2hlbWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVkaXRvcjogQ2hhdERlYnVnRWRpdG9ySW5wdXQuaW5zdGFuY2UsXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cbn1cblxuY2xhc3MgQ2hhdEFnZW50U2V0dGluZ0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdEFnZW50U2V0dGluZyc7XG5cdHByaXZhdGUgcmVhZG9ubHkgbmV3Q2hhdEJ1dHRvbkV4cGVyaW1lbnRJY29uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHBlcmltZW50U2VydmljZTogSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5uZXdDaGF0QnV0dG9uRXhwZXJpbWVudEljb24gPSBDaGF0Q29udGV4dEtleXMubmV3Q2hhdEJ1dHRvbkV4cGVyaW1lbnRJY29uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJlZ2lzdGVyTWF4UmVxdWVzdHNTZXR0aW5nKCk7XG5cdFx0dGhpcy5yZWdpc3Rlck5ld0NoYXRCdXR0b25JY29uKCk7XG5cdFx0dGhpcy5yZWdpc3RlckRlZmF1bHRNb2RlU2V0dGluZygpO1xuXHR9XG5cblxuXHRwcml2YXRlIHJlZ2lzdGVyTWF4UmVxdWVzdHNTZXR0aW5nKCk6IHZvaWQge1xuXHRcdGxldCBsYXN0Tm9kZTogSUNvbmZpZ3VyYXRpb25Ob2RlIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlZ2lzdGVyTWF4UmVxdWVzdHNTZXR0aW5nID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJlYXRtZW50SWQgPSB0aGlzLmVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWUgP1xuXHRcdFx0XHQnY2hhdEFnZW50TWF4UmVxdWVzdHNGcmVlJyA6XG5cdFx0XHRcdCdjaGF0QWdlbnRNYXhSZXF1ZXN0c1Bybyc7XG5cdFx0XHR0aGlzLmV4cGVyaW1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxudW1iZXI+KHRyZWF0bWVudElkKS50aGVuKCh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBub2RlOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRcdFx0aWQ6ICdjaGF0U2lkZWJhcicsXG5cdFx0XHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnaW50ZXJhY3RpdmVTZXNzaW9uQ29uZmlndXJhdGlvblRpdGxlJywgXCJDaGF0XCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdCdjaGF0LmFnZW50Lm1heFJlcXVlc3RzJzoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50Lm1heFJlcXVlc3RzJywgXCJUaGUgbWF4aW11bSBudW1iZXIgb2YgcmVxdWVzdHMgdG8gYWxsb3cgcGVyLXR1cm4gd2hlbiB1c2luZyBhbiBhZ2VudC4gV2hlbiB0aGUgbGltaXQgaXMgcmVhY2hlZCwgd2lsbCBhc2sgdG8gY29uZmlybSB0byBjb250aW51ZS5cIiksXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IHZhbHVlID8/IDUwLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6IDEwMDAgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkudXBkYXRlQ29uZmlndXJhdGlvbnMoeyByZW1vdmU6IGxhc3ROb2RlID8gW2xhc3ROb2RlXSA6IFtdLCBhZGQ6IFtub2RlXSB9KTtcblx0XHRcdFx0bGFzdE5vZGUgPSBub2RlO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUoRXZlbnQuZGVib3VuY2UodGhpcy5lbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbnRpdGxlbWVudCwgKCkgPT4geyB9LCAxMDAwKSwgKCkgPT4gcmVnaXN0ZXJNYXhSZXF1ZXN0c1NldHRpbmcoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck5ld0NoYXRCdXR0b25JY29uKCk6IHZvaWQge1xuXHRcdHRoaXMuZXhwZXJpbWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50PHN0cmluZz4oJ2NoYXROZXdCdXR0b25JY29uJykudGhlbigodmFsdWUpID0+IHtcblx0XHRcdGNvbnN0IHN1cHBvcnRlZFZhbHVlcyA9IFsnY29waWxvdCcsICduZXctc2Vzc2lvbicsICdjb21tZW50J107XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiBzdXBwb3J0ZWRWYWx1ZXMuaW5jbHVkZXModmFsdWUpKSB7XG5cdFx0XHRcdHRoaXMubmV3Q2hhdEJ1dHRvbkV4cGVyaW1lbnRJY29uLnNldCh2YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLm5ld0NoYXRCdXR0b25FeHBlcmltZW50SWNvbi5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckRlZmF1bHRNb2RlU2V0dGluZygpOiB2b2lkIHtcblx0XHR0aGlzLmV4cGVyaW1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudDxzdHJpbmc+KCdjaGF0RGVmYXVsdE5ld1Nlc3Npb25Nb2RlJykudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRjb25zdCBub2RlOiBJQ29uZmlndXJhdGlvbk5vZGUgPSB7XG5cdFx0XHRcdGlkOiAnY2hhdFNpZGViYXInLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKCdpbnRlcmFjdGl2ZVNlc3Npb25Db25maWd1cmF0aW9uVGl0bGUnLCBcIkNoYXRcIiksXG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkRlZmF1bHROZXdTZXNzaW9uTW9kZV06IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5uZXdTZXNzaW9uLmRlZmF1bHRNb2RlJywgXCJUaGUgZGVmYXVsdCBtb2RlIGZvciBuZXcgY2hhdCBzZXNzaW9ucy4gV2hlbiBlbXB0eSwgdGhlIGNoYXQgdmlldydzIGRlZmF1bHQgbW9kZSBpcyB1c2VkLlwiKSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB2YWx1ZSA6ICcnLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS51cGRhdGVDb25maWd1cmF0aW9ucyh7IGFkZDogW25vZGVdLCByZW1vdmU6IFtdIH0pO1xuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIENoYXRGb3JlZ3JvdW5kU2Vzc2lvbkNvdW50Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0Rm9yZWdyb3VuZFNlc3Npb25Db3VudCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmb3JlZ3JvdW5kU2Vzc2lvbkNvdW50Q29udGV4dEtleTogSUNvbnRleHRLZXk8bnVtYmVyPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmZvcmVncm91bmRTZXNzaW9uQ291bnRDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldCgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUZvcmVncm91bmRTZXNzaW9uQ291bnQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQ2hhbmdlV2lkZ2V0VmlzaWJpbGl0eSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUZvcmVncm91bmRTZXNzaW9uQ291bnQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy52aWV3c1NlcnZpY2Uub25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eSwgZSA9PiBlLmlkID09PSBDaGF0Vmlld0lkKSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUZvcmVncm91bmRTZXNzaW9uQ291bnQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZUZvcmVncm91bmRTZXNzaW9uQ291bnQoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRm9yZWdyb3VuZFNlc3Npb25Db3VudCgpOiB2b2lkIHtcblx0XHRsZXQgY291bnQgPSB0aGlzLnZpZXdzU2VydmljZS5pc1ZpZXdWaXNpYmxlKENoYXRWaWV3SWQpID8gMSA6IDA7XG5cblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldHNCeUxvY2F0aW9ucyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSkge1xuXHRcdFx0aWYgKCF3aWRnZXQudmlzaWJsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzSUNoYXRWaWV3Vmlld0NvbnRleHQod2lkZ2V0LnZpZXdDb250ZXh0KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzSUNoYXRSZXNvdXJjZVZpZXdDb250ZXh0KHdpZGdldC52aWV3Q29udGV4dCkgJiYgd2lkZ2V0LnZpZXdDb250ZXh0LmlzUXVpY2tDaGF0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb3VudCsrO1xuXHRcdH1cblxuXHRcdHRoaXMuZm9yZWdyb3VuZFNlc3Npb25Db3VudENvbnRleHRLZXkuc2V0KGNvdW50KTtcblx0fVxufVxuXG5cbi8qKlxuICogR2l2ZW4gYnVpbHRpbiBhbmQgY3VzdG9tIG1vZGVzLCByZXR1cm5zIG9ubHkgdGhlIGN1c3RvbSBtb2RlIElEcyB0aGF0IHNob3VsZCBoYXZlIGFjdGlvbnMgcmVnaXN0ZXJlZC5cbiAqIEN1c3RvbSBtb2RlcyB3aG9zZSBuYW1lcyBjb25mbGljdCB3aXRoIGJ1aWx0aW4gbW9kZXMgYXJlIGV4Y2x1ZGVkLlxuICogSWYgdGhlcmUgYXJlIG5hbWUgY29sbGlzaW9ucyBhbW9uZyBjdXN0b20gbW9kZXMsIHRoZSBsYXRlciBtb2RlIGluIHRoZSBsaXN0IHdpbnMuXG4gKi9cbmZ1bmN0aW9uIGdldEN1c3RvbU1vZGVzV2l0aFVuaXF1ZU5hbWVzKGJ1aWx0aW5Nb2RlczogcmVhZG9ubHkgSUNoYXRNb2RlW10sIGN1c3RvbU1vZGVzOiByZWFkb25seSBJQ2hhdE1vZGVbXSk6IFNldDxzdHJpbmc+IHtcblx0Y29uc3QgY3VzdG9tTW9kZUlkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBidWlsdGluTmFtZXMgPSBuZXcgU2V0KGJ1aWx0aW5Nb2Rlcy5tYXAobW9kZSA9PiBtb2RlLm5hbWUuZ2V0KCkpKTtcblx0Y29uc3QgY3VzdG9tTmFtZVRvSWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdGZvciAoY29uc3QgbW9kZSBvZiBjdXN0b21Nb2Rlcykge1xuXHRcdGNvbnN0IG1vZGVOYW1lID0gbW9kZS5uYW1lLmdldCgpO1xuXG5cdFx0Ly8gU2tpcCBjdXN0b20gbW9kZXMgdGhhdCBjb25mbGljdCB3aXRoIGJ1aWx0aW4gbW9kZSBuYW1lc1xuXHRcdGlmIChidWlsdGluTmFtZXMuaGFzKG1vZGVOYW1lKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgYSBuYW1lIGNvbGxpc2lvbiBhbW9uZyBjdXN0b20gbW9kZXMsIHRoZSBsYXRlciBvbmUgaW4gdGhlIGxpc3Qgd2luc1xuXHRcdGNvbnN0IGV4aXN0aW5nSWQgPSBjdXN0b21OYW1lVG9JZC5nZXQobW9kZU5hbWUpO1xuXHRcdGlmIChleGlzdGluZ0lkKSB7XG5cdFx0XHRjdXN0b21Nb2RlSWRzLmRlbGV0ZShleGlzdGluZ0lkKTtcblx0XHR9XG5cblx0XHRjdXN0b21OYW1lVG9JZC5zZXQobW9kZU5hbWUsIG1vZGUuaWQpO1xuXHRcdGN1c3RvbU1vZGVJZHMuYWRkKG1vZGUuaWQpO1xuXHR9XG5cblx0cmV0dXJuIGN1c3RvbU1vZGVJZHM7XG59XG5cbi8qKlxuICogV29ya2JlbmNoIGNvbnRyaWJ1dGlvbiB0byByZWdpc3RlciBhY3Rpb25zIGZvciBjdXN0b20gY2hhdCBtb2RlcyB2aWEgZXZlbnRzXG4gKi9cbmNsYXNzIENoYXRBZ2VudEFjdGlvbnNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRBZ2VudEFjdGlvbnMnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVBY3Rpb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRNb2RlU2VydmljZSBfY2hhdE1vZGVTZXJ2aWNlOiBJQ2hhdE1vZGVTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9tb2RlQWN0aW9uRGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgZm9jdXNlZFdpZGdldCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uLCAoKSA9PiB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0KTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjaGF0TW9kZXMgPSBmb2N1c2VkV2lkZ2V0LnJlYWQocmVhZGVyKT8uaW5wdXQuY3VycmVudENoYXRNb2Rlc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9zeW5jTW9kZUFjdGlvbnMoY2hhdE1vZGVzKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jTW9kZUFjdGlvbnMoY2hhdE1vZGVzOiBJQ2hhdE1vZGVzIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFjaGF0TW9kZXMpIHtcblx0XHRcdHRoaXMuX21vZGVBY3Rpb25EaXNwb3NhYmxlcy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGJ1aWx0aW4sIGN1c3RvbSB9ID0gY2hhdE1vZGVzO1xuXHRcdGNvbnN0IGN1cnJlbnRNb2RlSWRzID0gZ2V0Q3VzdG9tTW9kZXNXaXRoVW5pcXVlTmFtZXMoYnVpbHRpbiwgY3VzdG9tKTtcblxuXHRcdC8vIFJlbW92ZSBtb2RlcyB0aGF0IG5vIGxvbmdlciBleGlzdCBhbmQgdGhvc2UgcmVwbGFjZWQgYnkgbW9kZXMgbGF0ZXIgaW4gdGhlIGxpc3Qgd2l0aCBzYW1lIG5hbWUuXG5cdFx0Zm9yIChjb25zdCBtb2RlSWQgb2YgdGhpcy5fbW9kZUFjdGlvbkRpc3Bvc2FibGVzLmtleXMoKSkge1xuXHRcdFx0aWYgKCFjdXJyZW50TW9kZUlkcy5oYXMobW9kZUlkKSkge1xuXHRcdFx0XHR0aGlzLl9tb2RlQWN0aW9uRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShtb2RlSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdGVyIG5ldyBtb2Rlcy5cblx0XHRmb3IgKGNvbnN0IG1vZGUgb2YgY3VzdG9tKSB7XG5cdFx0XHRpZiAoY3VycmVudE1vZGVJZHMuaGFzKG1vZGUuaWQpICYmICF0aGlzLl9tb2RlQWN0aW9uRGlzcG9zYWJsZXMuaGFzKG1vZGUuaWQpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyTW9kZUFjdGlvbihtb2RlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck1vZGVBY3Rpb24obW9kZTogSUNoYXRNb2RlKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9uQ2xhc3MgPSBjbGFzcyBleHRlbmRzIE1vZGVPcGVuQ2hhdEdsb2JhbEFjdGlvbiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIobW9kZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9tb2RlQWN0aW9uRGlzcG9zYWJsZXMuc2V0KG1vZGUuaWQsIHJlZ2lzdGVyQWN0aW9uMihhY3Rpb25DbGFzcykpO1xuXHR9XG59XG5cbmNsYXNzIEhvb2tTY2hlbWFBc3NvY2lhdGlvbkNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuaG9va1NjaGVtYUFzc29jaWF0aW9uJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3VwZGF0ZUFzc29jaWF0aW9ucygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuSE9PS1NfTE9DQVRJT05fS0VZKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVBc3NvY2lhdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVBc3NvY2lhdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgZm9sZGVycyA9IFByb21wdHNDb25maWcucHJvbXB0U291cmNlRm9sZGVycyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgUHJvbXB0c1R5cGUuaG9vayk7XG5cdFx0Y29uc3QgdXNlckhvbWVVcmkgPSBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdGNvbnN0IHVzZXJIb21lID0gdXNlckhvbWVVcmkuZnNQYXRoID8/IHVzZXJIb21lVXJpLnBhdGg7XG5cblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBmb2xkZXJzKSB7XG5cdFx0XHQvLyBTa2lwIENsYXVkZSBzZXR0aW5ncyBmaWxlcyBcdTIwMTQgdGhleSB1c2UgYSBkaWZmZXJlbnQgc2NoZW1hIGZvcm1hdFxuXHRcdFx0aWYgKGZvbGRlci5zb3VyY2UgPT09IFByb21wdEZpbGVTb3VyY2UuQ2xhdWRlV29ya3NwYWNlIHx8IGZvbGRlci5zb3VyY2UgPT09IFByb21wdEZpbGVTb3VyY2UuQ2xhdWRlV29ya3NwYWNlTG9jYWwgfHwgZm9sZGVyLnNvdXJjZSA9PT0gUHJvbXB0RmlsZVNvdXJjZS5DbGF1ZGVQZXJzb25hbCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRXhwYW5kIHRpbGRlIHBhdGhzIHRvIGFic29sdXRlIHBhdGhzIHNvIHRoZSBKU09OIGxhbmd1YWdlIHNlcnZpY2UgY2FuIG1hdGNoIHRoZW1cblx0XHRcdGNvbnN0IHJlc29sdmVkUGF0aCA9IGlzVGlsZGVQYXRoKGZvbGRlci5wYXRoKVxuXHRcdFx0XHQ/IHVzZXJIb21lICsgZm9sZGVyLnBhdGguc3Vic3RyaW5nKDEpXG5cdFx0XHRcdDogZm9sZGVyLnBhdGg7XG5cblx0XHRcdC8vIElmIGl0J3MgYSBzcGVjaWZpYyAuanNvbiBmaWxlLCB1c2UgaXQgZGlyZWN0bHk7IG90aGVyd2lzZSB0cmVhdCBhcyBkaXJlY3Rvcnlcblx0XHRcdGNvbnN0IGdsb2IgPSByZXNvbHZlZFBhdGgudG9Mb3dlckNhc2UoKS5lbmRzV2l0aCgnLmpzb24nKVxuXHRcdFx0XHQ/IHJlc29sdmVkUGF0aFxuXHRcdFx0XHQ6IGAke3Jlc29sdmVkUGF0aH0vKi5qc29uYDtcblxuXHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9ucy5hZGQoXG5cdFx0XHRcdGpzb25Db250cmlidXRpb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYUFzc29jaWF0aW9uKEhPT0tfU0NIRU1BX1VSSSwgZ2xvYilcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRvb2xSZWZlcmVuY2VOYW1lc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudG9vbFJlZmVyZW5jZU5hbWVzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdXBkYXRlVG9vbFJlZmVyZW5jZU5hbWVzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5vbkRpZENoYW5nZVRvb2xzKCgpID0+IHRoaXMuX3VwZGF0ZVRvb2xSZWZlcmVuY2VOYW1lcygpKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUb29sUmVmZXJlbmNlTmFtZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9vbHMgPVxuXHRcdFx0QXJyYXkuZnJvbSh0aGlzLl9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldEFsbFRvb2xzSW5jbHVkaW5nRGlzYWJsZWQoKSlcblx0XHRcdFx0LmZpbHRlcigodG9vbCk6IHRvb2wgaXMgdHlwZW9mIHRvb2wgJiB7IHRvb2xSZWZlcmVuY2VOYW1lOiBzdHJpbmcgfSA9PiB0eXBlb2YgdG9vbC50b29sUmVmZXJlbmNlTmFtZSA9PT0gJ3N0cmluZycpXG5cdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLnRvb2xSZWZlcmVuY2VOYW1lLmxvY2FsZUNvbXBhcmUoYi50b29sUmVmZXJlbmNlTmFtZSkpO1xuXHRcdHRvb2xSZWZlcmVuY2VOYW1lRW51bVZhbHVlcy5sZW5ndGggPSAwO1xuXHRcdHRvb2xSZWZlcmVuY2VOYW1lRW51bURlc2NyaXB0aW9ucy5sZW5ndGggPSAwO1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29scykge1xuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWVFbnVtVmFsdWVzLnB1c2godG9vbC50b29sUmVmZXJlbmNlTmFtZSk7XG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZUVudW1EZXNjcmlwdGlvbnMucHVzaChubHMubG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0LnRvb2xSZWZlcmVuY2VOYW1lLmRlc2NyaXB0aW9uJyxcblx0XHRcdFx0XCJ7MH0gLSB7MX1cIixcblx0XHRcdFx0dG9vbC50b29sUmVmZXJlbmNlTmFtZSxcblx0XHRcdFx0dG9vbC51c2VyRGVzY3JpcHRpb24gfHwgdG9vbC5kaXNwbGF5TmFtZVxuXHRcdFx0KSk7XG5cdFx0fVxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5ub3RpZnlDb25maWd1cmF0aW9uU2NoZW1hVXBkYXRlZCh7XG5cdFx0XHRpZDogJ2NoYXRTaWRlYmFyJyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkVsaWdpYmxlRm9yQXV0b0FwcHJvdmFsXToge31cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIEZvcmNlcyB0aGUgZWFnZXIge0BsaW5rIENoYXRTcGVlY2hUb1RleHRTZXJ2aWNlfSB0byBpbnN0YW50aWF0ZSBhdCBzdGFydHVwIHNvXG4gKiBpdCBjYW4gcHVibGlzaCB0aGUgYGNoYXRTcGVlY2hUb1RleHRDb25maWd1cmVkYCBjb250ZXh0IGtleSB0aGF0IGdhdGVzIHRoZVxuICogZGljdGF0aW9uIChtaWMpIGJ1dHRvbi4gUmVnaXN0ZXJlZCBzaW5nbGV0b25zIGFyZSBjcmVhdGVkIGxhemlseSBvbiBmaXJzdFxuICogYWNjZXNzLCBzbyB3aXRob3V0IHRoaXMgdGhlIGtleSB3b3VsZCBuZXZlciBiZSBzZXQgYW5kIHRoZSBidXR0b24gbmV2ZXIgc2hvd3MuXG4gKi9cbmNsYXNzIENoYXRTcGVlY2hUb1RleHRJbml0Q29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRTcGVlY2hUb1RleHRJbml0JztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIF9jaGF0U3BlZWNoVG9UZXh0U2VydmljZTogSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHQvLyBJbmplY3RpbmcgdGhlIHNlcnZpY2UgaXMgZW5vdWdoIHRvIGNvbnN0cnVjdCBpdC5cblx0fVxufVxuXG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBDaGF0VGVybWluYWxPdXRwdXRBY2Nlc3NpYmxlVmlldygpKTtcbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IENoYXRSZXNwb25zZUFjY2Vzc2libGVWaWV3KCkpO1xuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgUGFuZWxDaGF0QWNjZXNzaWJpbGl0eUhlbHAoKSk7XG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBRdWlja0NoYXRBY2Nlc3NpYmlsaXR5SGVscCgpKTtcbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IEVkaXRzQ2hhdEFjY2Vzc2liaWxpdHlIZWxwKCkpO1xuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgQWdlbnRDaGF0QWNjZXNzaWJpbGl0eUhlbHAoKSk7XG5cbnJlZ2lzdGVyRWRpdG9yRmVhdHVyZShDaGF0SW5wdXRCb3hDb250ZW50UHJvdmlkZXIpO1xuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoQ2hhdEVkaXRvcklucHV0LlR5cGVJRCwgQ2hhdEVkaXRvcklucHV0U2VyaWFsaXplcik7XG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihDaGF0RGVidWdFZGl0b3JJbnB1dC5JRCwgQ2hhdERlYnVnRWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENvcGlsb3RUZWxlbWV0cnlDb250cmlidXRpb24uSUQsIENvcGlsb3RUZWxlbWV0cnlDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFNwZWVjaFRvVGV4dEluaXRDb250cmlidXRpb24uSUQsIENoYXRTcGVlY2hUb1RleHRJbml0Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRSZXNvbHZlckNvbnRyaWJ1dGlvbi5JRCwgQ2hhdFJlc29sdmVyQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXREZWJ1Z1Jlc29sdmVyQ29udHJpYnV0aW9uLklELCBDaGF0RGVidWdSZXNvbHZlckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihQcm9tcHRzRGVidWdDb250cmlidXRpb24uSUQsIFByb21wdHNEZWJ1Z0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihBZ2VudEhvc3RDaGF0RGVidWdDb250cmlidXRpb24uSUQsIEFnZW50SG9zdENoYXREZWJ1Z0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0TGFuZ3VhZ2VNb2RlbHNEYXRhQ29udHJpYnV0aW9uLklELCBDaGF0TGFuZ3VhZ2VNb2RlbHNEYXRhQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRTbGFzaENvbW1hbmRzQ29udHJpYnV0aW9uLklELCBDaGF0U2xhc2hDb21tYW5kc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFNlc3Npb25PcHRpb25TbGFzaENvbW1hbmRzQ29udHJpYnV0aW9uLklELCBDaGF0U2Vzc2lvbk9wdGlvblNsYXNoQ29tbWFuZHNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRPdXRsaW5lQ3JlYXRvci5JRCwgQ2hhdE91dGxpbmVDcmVhdG9yLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRFeHRlbnNpb25Qb2ludEhhbmRsZXIuSUQsIENoYXRFeHRlbnNpb25Qb2ludEhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTGFuZ3VhZ2VNb2RlbFRvb2xzRXh0ZW5zaW9uUG9pbnRIYW5kbGVyLklELCBMYW5ndWFnZU1vZGVsVG9vbHNFeHRlbnNpb25Qb2ludEhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFByb21wdEZpbGVzRXh0ZW5zaW9uUG9pbnRIYW5kbGVyLklELCBDaGF0UHJvbXB0RmlsZXNFeHRlbnNpb25Qb2ludEhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdENvbXBhdGliaWxpdHlOb3RpZmllci5JRCwgQ2hhdENvbXBhdGliaWxpdHlOb3RpZmllciwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ29kZUJsb2NrQWN0aW9uUmVuZGVyaW5nLklELCBDb2RlQmxvY2tBY3Rpb25SZW5kZXJpbmcsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdENvcHlBY3Rpb25SZW5kZXJpbmcuSUQsIENoYXRDb3B5QWN0aW9uUmVuZGVyaW5nLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRJbXBsaWNpdENvbnRleHRDb250cmlidXRpb24uSUQsIENoYXRJbXBsaWNpdENvbnRleHRDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRWaWV3c1dlbGNvbWVIYW5kbGVyLklELCBDaGF0Vmlld3NXZWxjb21lSGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0R2V0dGluZ1N0YXJ0ZWRDb250cmlidXRpb24uSUQsIENoYXRHZXR0aW5nU3RhcnRlZENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFNldHVwQ29udHJpYnV0aW9uLklELCBDaGF0U2V0dXBDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFF1b3RhTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uLklELCBDaGF0UXVvdGFOb3RpZmljYXRpb25Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRQcm9tb05vdGlmaWNhdGlvbkNvbnRyaWJ1dGlvbi5JRCwgQ2hhdFByb21vTm90aWZpY2F0aW9uQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihIYXNCeW9rTW9kZWxzQ29udHJpYnV0aW9uLklELCBIYXNCeW9rTW9kZWxzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRUZWFyZG93bkNvbnRyaWJ1dGlvbi5JRCwgQ2hhdFRlYXJkb3duQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0U3RhdHVzQmFyRW50cnkuSUQsIENoYXRTdGF0dXNCYXJFbnRyeSwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihCdWlsdGluVG9vbHNDb250cmlidXRpb24uSUQsIEJ1aWx0aW5Ub29sc0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2xpZW50VG9vbFNldHNDb250cmlidXRpb24uSUQsIENsaWVudFRvb2xTZXRzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihVc2FnZXNUb29sQ29udHJpYnV0aW9uLklELCBVc2FnZXNUb29sQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFJlbmFtZVRvb2xDb250cmlidXRpb24uSUQsIFJlbmFtZVRvb2xDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdEFnZW50U2V0dGluZ0NvbnRyaWJ1dGlvbi5JRCwgQ2hhdEFnZW50U2V0dGluZ0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdEZvcmVncm91bmRTZXNzaW9uQ291bnRDb250cmlidXRpb24uSUQsIENoYXRGb3JlZ3JvdW5kU2Vzc2lvbkNvdW50Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0QWdlbnRBY3Rpb25zQ29udHJpYnV0aW9uLklELCBDaGF0QWdlbnRBY3Rpb25zQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihIb29rU2NoZW1hQXNzb2NpYXRpb25Db250cmlidXRpb24uSUQsIEhvb2tTY2hlbWFBc3NvY2lhdGlvbkNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoVG9vbFJlZmVyZW5jZU5hbWVzQ29udHJpYnV0aW9uLklELCBUb29sUmVmZXJlbmNlTmFtZXNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRBZ2VudFJlY29tbWVuZGF0aW9uLklELCBDaGF0QWdlbnRSZWNvbW1lbmRhdGlvbiwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdEVkaXRpbmdFZGl0b3JBY2Nlc3NpYmlsaXR5LklELCBDaGF0RWRpdGluZ0VkaXRvckFjY2Vzc2liaWxpdHksIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRRdWV1ZVBpY2tlclJlbmRlcmluZy5JRCwgQ2hhdFF1ZXVlUGlja2VyUmVuZGVyaW5nLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRFZGl0aW5nRWRpdG9yT3ZlcmxheS5JRCwgQ2hhdEVkaXRpbmdFZGl0b3JPdmVybGF5LCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0RWRpdGluZ0VkaXRvckNvbnRleHRLZXlzLklELCBDaGF0RWRpdGluZ0VkaXRvckNvbnRleHRLZXlzLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0VHJhbnNmZXJDb250cmlidXRpb24uSUQsIENoYXRUcmFuc2ZlckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0Q29udGV4dENvbnRyaWJ1dGlvbnMuSUQsIENoYXRDb250ZXh0Q29udHJpYnV0aW9ucywgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUHJvbXB0VXJsSGFuZGxlci5JRCwgUHJvbXB0VXJsSGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihQbHVnaW5VcmxIYW5kbGVyLklELCBQbHVnaW5VcmxIYW5kbGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKENoYXRFZGl0aW5nTm90ZWJvb2tGaWxlU3lzdGVtUHJvdmlkZXJDb250cmliLklELCBDaGF0RWRpdGluZ05vdGVib29rRmlsZVN5c3RlbVByb3ZpZGVyQ29udHJpYiwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0UmVzcG9uc2VSZXNvdXJjZVdvcmtiZW5jaENvbnRyaWJ1dGlvbi5JRCwgQ2hhdFJlc3BvbnNlUmVzb3VyY2VXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFVzZXJUb29sU2V0c0NvbnRyaWJ1dGlvbnMuSUQsIFVzZXJUb29sU2V0c0NvbnRyaWJ1dGlvbnMsIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFByb21wdExhbmd1YWdlRmVhdHVyZXNQcm92aWRlci5JRCwgUHJvbXB0TGFuZ3VhZ2VGZWF0dXJlc1Byb3ZpZGVyLCBXb3JrYmVuY2hQaGFzZS5FdmVudHVhbGx5KTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDaGF0V2luZG93Tm90aWZpZXIuSUQsIENoYXRXaW5kb3dOb3RpZmllciwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFJlcG9JbmZvQ29udHJpYnV0aW9uLklELCBDaGF0UmVwb0luZm9Db250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEFnZW50UGx1Z2luUmVjb21tZW5kYXRpb25zLklELCBBZ2VudFBsdWdpblJlY29tbWVuZGF0aW9ucywgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUGx1Z2luQXV0b1VwZGF0ZS5JRCwgUGx1Z2luQXV0b1VwZGF0ZSwgV29ya2JlbmNoUGhhc2UuRXZlbnR1YWxseSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ2hhdFJlZmVyZW5jZUF0dGFjaG1lbnRXaWRnZXRDb250cmlidXRpb24uSUQsIENoYXRSZWZlcmVuY2VBdHRhY2htZW50V2lkZ2V0Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxucmVnaXN0ZXJDaGF0QWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0QWNjZXNzaWJpbGl0eUFjdGlvbnMoKTtcbnJlZ2lzdGVyQ2hhdENvcHlBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRPcGVuQWdlbnREZWJ1Z1BhbmVsQWN0aW9uKCk7XG5yZWdpc3RlckNoYXRDb2RlQmxvY2tBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRDb2RlQ29tcGFyZUJsb2NrQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0RmlsZVRyZWVBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRQcm9tcHROYXZpZ2F0aW9uQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0VGl0bGVBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRFeGVjdXRlQWN0aW9ucygpO1xucmVnaXN0ZXJBY3Rpb24yKENoYXRWb2ljZUlucHV0TW9kZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ2hhdFZvaWNlSW5wdXRNb2RlVG9nZ2xlTGlzdGVuQWN0aW9uKTtcbnJlZ2lzdGVyVm9pY2VJbnB1dE1vZGVTaW11bGF0ZUFjdGlvbnMoKTtcbnJlZ2lzdGVyQ2hhdFNwZWVjaFRvVGV4dEFjdGlvbnMoKTtcbnJlZ2lzdGVyQ29uZmlndXJlU3BlZWNoSW5zdHJ1Y3Rpb25zQWN0aW9ucygpO1xucmVnaXN0ZXJDaGF0UXVldWVBY3Rpb25zKCk7XG5yZWdpc3RlclF1aWNrQ2hhdEFjdGlvbnMoKTtcbnJlZ2lzdGVyQ2hhdEV4cG9ydEFjdGlvbnMoKTtcbnJlZ2lzdGVyTW92ZUFjdGlvbnMoKTtcbnJlZ2lzdGVyTmV3Q2hhdEFjdGlvbnMoKTtcbnJlZ2lzdGVyQ2hhdENvbnRleHRBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXREZXZlbG9wZXJBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRFZGl0b3JBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRFbGljaXRhdGlvbkFjdGlvbnMoKTtcbnJlZ2lzdGVyQ2hhdFRvb2xBY3Rpb25zKCk7XG5yZWdpc3Rlckxhbmd1YWdlTW9kZWxBY3Rpb25zKCk7XG5yZWdpc3RlckNoYXRQbHVnaW5BY3Rpb25zKCk7XG5yZWdpc3RlckFjdGlvbjIoQ29uZmlndXJlVG9vbFNldHMpO1xucmVnaXN0ZXJFZGl0b3JGZWF0dXJlKENoYXRQYXN0ZVByb3ZpZGVyc0ZlYXR1cmUpO1xuXG5hZ2VudFBsdWdpbkRpc2NvdmVyeVJlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBTeW5jRGVzY3JpcHRvcihDb25maWd1cmVkQWdlbnRQbHVnaW5EaXNjb3ZlcnkpLCBBZ2VudFBsdWdpbkRpc2NvdmVyeVByaW9yaXR5LkNvbmZpZ3VyZWQpO1xuYWdlbnRQbHVnaW5EaXNjb3ZlcnlSZWdpc3RyeS5yZWdpc3RlcihuZXcgU3luY0Rlc2NyaXB0b3IoTWFya2V0cGxhY2VBZ2VudFBsdWdpbkRpc2NvdmVyeSksIEFnZW50UGx1Z2luRGlzY292ZXJ5UHJpb3JpdHkuTWFya2V0cGxhY2UpO1xuYWdlbnRQbHVnaW5EaXNjb3ZlcnlSZWdpc3RyeS5yZWdpc3RlcihuZXcgU3luY0Rlc2NyaXB0b3IoRXh0ZW5zaW9uQWdlbnRQbHVnaW5EaXNjb3ZlcnkpLCBBZ2VudFBsdWdpbkRpc2NvdmVyeVByaW9yaXR5LkV4dGVuc2lvbik7XG5hZ2VudFBsdWdpbkRpc2NvdmVyeVJlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBTeW5jRGVzY3JpcHRvcihDb3BpbG90Q2xpQWdlbnRQbHVnaW5EaXNjb3ZlcnkpLCBBZ2VudFBsdWdpbkRpc2NvdmVyeVByaW9yaXR5LkNvcGlsb3RDbGkpO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFJlc3BvbnNlUmVzb3VyY2VGaWxlU3lzdGVtUHJvdmlkZXIsIENoYXRSZXNwb25zZVJlc291cmNlRmlsZVN5c3RlbVByb3ZpZGVyLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSwgQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0VHJhbnNmZXJTZXJ2aWNlLCBDaGF0VHJhbnNmZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0U2VydmljZSwgQ2hhdFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRXaWRnZXRTZXJ2aWNlLCBDaGF0V2lkZ2V0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFNpZGVDaGF0U2VydmljZSwgQ2hhdFNpZGVDaGF0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFBldFNlcnZpY2UsIENoYXRQZXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElRdWlja0NoYXRTZXJ2aWNlLCBRdWlja0NoYXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UsIENoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UsIExhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElMYW5ndWFnZU1vZGVsU3RhdHNTZXJ2aWNlLCBMYW5ndWFnZU1vZGVsU3RhdHNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0U2xhc2hDb21tYW5kU2VydmljZSwgQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRBZ2VudFNlcnZpY2UsIENoYXRBZ2VudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRBZ2VudE5hbWVTZXJ2aWNlLCBDaGF0QWdlbnROYW1lU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFZhcmlhYmxlc1NlcnZpY2UsIENoYXRWYXJpYWJsZXNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudFBsdWdpblNlcnZpY2UsIEFnZW50UGx1Z2luU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCBQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVdvcmtzcGFjZVBsdWdpblNldHRpbmdzU2VydmljZSwgV29ya3NwYWNlUGx1Z2luU2V0dGluZ3NTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCBBZ2VudFBsdWdpblJlcG9zaXRvcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElQbHVnaW5HaXRTZXJ2aWNlLCBCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVBsdWdpbkluc3RhbGxTZXJ2aWNlLCBQbHVnaW5JbnN0YWxsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJVG9vbFJlc3VsdENvbXByZXNzb3IsIFRvb2xSZXN1bHRDb21wcmVzc29yU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSwgTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsIENoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0R29hbFN1bW1hcnlTZXJ2aWNlLCBDaGF0R29hbFN1bW1hcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsIENoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSwgQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJVm9pY2VDaGF0U2VydmljZSwgVm9pY2VDaGF0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdENvZGVCbG9ja0NvbnRleHRQcm92aWRlclNlcnZpY2UsIENoYXRDb2RlQmxvY2tDb250ZXh0UHJvdmlkZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDb2RlTWFwcGVyU2VydmljZSwgQ29kZU1hcHBlclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRFZGl0aW5nU2VydmljZSwgQ2hhdEVkaXRpbmdTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCBDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLCBBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSwgTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdENvbnRleHRQaWNrU2VydmljZSwgQ2hhdENvbnRleHRQaWNrU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdE1vZGVTZXJ2aWNlLCBDaGF0TW9kZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UsIENoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnksIENoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnksIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRUb2RvTGlzdFNlcnZpY2UsIENoYXRUb2RvTGlzdFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXRBcnRpZmFjdHNTZXJ2aWNlLCBDaGF0QXJ0aWZhY3RzU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSwgQ2hhdE91dHB1dFJlbmRlcmVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQ2hhdExheW91dFNlcnZpY2UsIENoYXRMYXlvdXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLCBQbGFuUmV2aWV3RmVlZGJhY2tTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0VGlwU2VydmljZSwgQ2hhdFRpcFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNoYXREZWJ1Z1NlcnZpY2UsIENoYXREZWJ1Z1NlcnZpY2VJbXBsLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0SW1hZ2VDYXJvdXNlbFNlcnZpY2UsIENoYXRJbWFnZUNhcm91c2VsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUsIEFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuQ2hhdFdpZGdldC5DT05UUklCUy5wdXNoKENoYXREeW5hbWljVmFyaWFibGVNb2RlbCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVksZUFBZSx1QkFBdUI7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUywyQkFBMkI7QUFDN0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyxtQ0FBbUMscUNBQXFDLHNDQUFzQyxzQ0FBc0MsMkNBQTJDO0FBQ3hNLFNBQVMsc0NBQXNDLDZDQUE2Qyw0Q0FBNEMsdUNBQXVDLDJDQUEyQyw0Q0FBNEMscUNBQXFDLHVDQUF1QztBQUNsVixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLDJCQUEyQixrQ0FBa0M7QUFDdEUsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxpQ0FBaUMseUNBQXlDLHNDQUFzQywrQ0FBK0MsNENBQTRDLGdDQUFnQyw2Q0FBNkMsNkJBQTZCLGdDQUFnQyxtQkFBbUIsaUNBQWlDLGlEQUFpRCw4Q0FBOEMsbUJBQW1CLDJCQUEyQjtBQUMvaEIsU0FBUywwQkFBMEIsNkJBQTZCO0FBQ2hFLFNBQVMsZ0RBQWdEO0FBQ3pELFNBQVMsNkJBQTZCO0FBQ3RDLFlBQVksU0FBUztBQUNyQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGNBQWMseUJBQXlCLDBCQUFzRTtBQUN0SCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw2QkFBK0M7QUFDeEQsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsZ0JBQWdCLG1CQUFtQixpQkFBaUIseUJBQXlCLG9CQUFvQix3QkFBd0IsbUNBQW1DLDRCQUE0Qiw0QkFBNEI7QUFDN04sT0FBTyxhQUFhO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQWlEO0FBQzFELFNBQTBDLGtCQUFtRDtBQUM3RixTQUFTLHlCQUF5QjtBQUNsQyxTQUFpQyxnQkFBZ0Isc0NBQXNDO0FBQ3ZGLFNBQVMsd0JBQWdEO0FBQ3pELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsaUJBQWlCLCtCQUErQjtBQUN6RCxTQUFTLHdCQUF3QixnQ0FBZ0M7QUFDakUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQkFBc0IscUJBQXFCO0FBQ3BELFNBQVMscUJBQXFCLDhCQUE4QixzQkFBc0IscUJBQXFCLG9DQUFvQyxtQ0FBbUMsZ0NBQWdDO0FBQzlNLFNBQVMsc0JBQXNCLGtCQUFrQix1QkFBdUIseUJBQXlCO0FBQ2pHLFNBQVMsbUJBQW1CLDBCQUEwQjtBQUN0RCxPQUFPO0FBQ1AsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxpQkFBNEIsd0JBQW9DO0FBQ3pFLFNBQVMsd0NBQXdDLDJDQUEyQywrQ0FBK0M7QUFDM0ksU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxxQkFBcUIsNEJBQTRCO0FBQzFELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCLGdDQUFnQztBQUNsRSxTQUFTLHNCQUFzQiw2QkFBNkI7QUFDNUQsU0FBUyxxQkFBcUIsNEJBQTRCO0FBQzFELFNBQVMscUJBQXFCLDRCQUE0QjtBQUMxRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQixpQ0FBaUM7QUFDcEUsU0FBUyx5QkFBeUIseUJBQXlCLG1CQUFtQixtQkFBbUIsNEJBQTRCLHNCQUFzQiwyQkFBMkI7QUFDOUssU0FBUyxtQ0FBbUMsd0NBQXdDO0FBQ3BGLFNBQVMsd0JBQXdCLDZCQUE2QjtBQUM5RCxTQUFTLDRCQUE0QixpQ0FBaUM7QUFDdEUsU0FBUyw4Q0FBOEM7QUFDdkQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywrQkFBK0Isc0NBQXNDO0FBQzlFLFNBQVMsd0JBQXdCLCtCQUErQjtBQUNoRSxTQUFTLGdDQUFnQyx1Q0FBdUM7QUFDaEYsU0FBUyxpQ0FBaUMsd0NBQXdDO0FBQ2xGLFNBQVMsOEJBQThCLDhCQUE4QiwyQkFBMkI7QUFDaEcsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyxhQUFhLHFCQUFxQjtBQUMzQyxTQUFTLG9DQUFvQyw0QkFBNEIsbUNBQW1DLDRCQUE0Qiw4QkFBOEIsdUJBQXVCLDhCQUE4QixzQkFBc0Isc0JBQXNCLGdCQUFnQiw2QkFBNkIseUJBQXlCLHFDQUFxQyx5Q0FBeUM7QUFDM1osU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyx5QkFBeUIsZ0NBQWdDLDBCQUEwQix5QkFBeUIsd0JBQXdCLGFBQWEsa0JBQWtCLHdDQUF3QyxnREFBZ0Q7QUFDcFEsU0FBUyxnQkFBZ0IsdUJBQXVCO0FBQ2hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYyxzQkFBaUQ7QUFDeEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxrQ0FBa0M7QUFDM0MsT0FBTztBQUNQLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUNwRCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsNEJBQTRCLDRCQUE0Qiw0QkFBNEIsa0NBQWtDO0FBQy9ILFNBQVMsMEJBQTBCLDJCQUEyQjtBQUM5RCxTQUFTLDBCQUEwQiw4QkFBOEIsMkNBQTJDO0FBQzVHLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMseUJBQXlCLCtCQUErQjtBQUNqRSxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDBCQUEwQixzQ0FBc0MsNkNBQTZDO0FBQ3RILE9BQU87QUFDUCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDRDQUE0QyxrREFBa0Q7QUFDdkcsU0FBUyx5QkFBeUIsb0JBQW9CLGdDQUFnQztBQUN0RixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZDQUE2QztBQUN0RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHNCQUFzQixzQ0FBc0M7QUFDckUsT0FBTztBQUVQLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsWUFBWSwyQkFBMkIsc0NBQXNDLG9CQUFvQixtQkFBbUIsNEJBQTRCLDhCQUE4QjtBQUN2TCxTQUFTLGdDQUFnQztBQUN6QyxPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMsOEJBQThCLHFDQUFxQztBQUM1RSxTQUFTLDhCQUE4QixxQ0FBcUM7QUFDNUUsU0FBUyxpREFBaUQ7QUFDMUQsU0FBUywyQkFBMkIsa0NBQWtDO0FBQ3RFLFNBQVMsd0JBQXdCLCtCQUErQjtBQUNoRSxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9EQUFvRDtBQUM3RCxTQUFTLGtCQUFzQztBQUMvQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQixpQ0FBaUM7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQ0FBb0MsMENBQTBDO0FBQ3ZGLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBRVAsU0FBUywyQkFBMkIsa0NBQWtDO0FBQ3RFLFNBQVMsMkJBQTJCLGlDQUFpQztBQUNyRSxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLHVCQUF1QixnQ0FBZ0M7QUFDaEUsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1Q0FBdUM7QUFDaEQsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxTQUFTLDZDQUE2QztBQUN0RCxTQUFTLDJCQUEyQixvQ0FBb0M7QUFDeEUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxvQkFBb0IsZ0NBQWdDLGdDQUFnQywrQkFBK0IsdUNBQXVDO0FBQ25LLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCLGdDQUFnQztBQUNwRSxTQUFTLGdDQUFnQyx1Q0FBdUM7QUFDaEYsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLFNBQVMsNENBQTRDLHFDQUFxQztBQUMxRixPQUFPO0FBQ1AsU0FBUyw0QkFBNEIsaUNBQWlDO0FBQ3RFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CLGlDQUFpQztBQUM3RCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdCQUFnQix1QkFBdUI7QUFDaEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxnQkFBZ0IsdUJBQXVCO0FBQ2hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCLHFDQUFxQztBQUN4RSxTQUFTLDBCQUEwQixpQ0FBaUM7QUFDcEUsU0FBUyxrQ0FBa0MseUNBQXlDO0FBRXBGLGlCQUFpQixnQkFBZ0Isc0NBQXNDLENBQUMsVUFBNEIsV0FBbUIsWUFBa0Y7QUFDeE0sV0FBUyxJQUFJLFlBQVksRUFBRSw2QkFBNkIsSUFBSSxXQUFXLE9BQU87QUFDL0UsQ0FBQztBQUVELE1BQU0sOEJBQXdDLENBQUM7QUFDL0MsTUFBTSxvQ0FBOEMsQ0FBQztBQUdyRCxNQUFNLDJCQUEyQixTQUFTLEdBQThCLGVBQWUsZ0JBQWdCO0FBQ3ZHLHlCQUF5QixlQUFlLGlCQUFpQixjQUFjO0FBR3ZFLE1BQU0sd0JBQXdCLFNBQVMsR0FBMkIsd0JBQXdCLGFBQWE7QUFDdkcsc0JBQXNCLHNCQUFzQjtBQUFBLEVBQzNDLElBQUk7QUFBQSxFQUNKLE9BQU8sSUFBSSxTQUFTLHdDQUF3QyxNQUFNO0FBQUEsRUFDbEUsTUFBTTtBQUFBLEVBQ04sWUFBWTtBQUFBLElBQ1gsMkNBQTJDO0FBQUEsTUFDMUMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsMkNBQTJDLHNFQUFzRTtBQUFBLE1BQzNJLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIsY0FBYyxFQUFFLFNBQVMsS0FBSztBQUFBLElBQy9CO0FBQUEsSUFDQSxpQkFBaUI7QUFBQSxNQUNoQixNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyxpQkFBaUIsb0RBQW9EO0FBQUEsTUFDL0YsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLG1CQUFtQjtBQUFBLE1BQ2xCLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLG1CQUFtQiw0Q0FBNEM7QUFBQSxNQUN6RixTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EscUJBQXFCO0FBQUEsTUFDcEIsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUyxxQkFBcUIsMlJBQTJSO0FBQUEsTUFDbFYsU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyw0QkFBNEIsZ0dBQWdHO0FBQUEsVUFDako7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLG1CQUFtQjtBQUFBLE1BQ2xCLE1BQU07QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGdCQUFnQjtBQUFBLFFBQ2YsSUFBSSxTQUFTLDJDQUEyQyxrREFBNkM7QUFBQSxRQUNyRyxJQUFJLFNBQVMsNkJBQTZCLGtCQUFhO0FBQUEsTUFDeEQ7QUFBQSxNQUNBLDBCQUEwQjtBQUFBLFFBQ3pCLElBQUksU0FBUyxxQ0FBcUMsZ1VBQWdVO0FBQUEsUUFDbFgsSUFBSSxTQUFTLHVCQUF1Qix5S0FBeUs7QUFBQSxNQUM5TTtBQUFBLE1BQ0EscUJBQXFCLElBQUksU0FBUyxtQkFBbUIseUxBQXlMO0FBQUEsTUFDOU8sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixZQUFZLEVBQUUsTUFBTSxPQUFPO0FBQUEsSUFDNUI7QUFBQSxJQUNBLENBQUMsbUJBQW1CLGNBQWMsR0FBRztBQUFBLE1BQ3BDLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMsNEJBQTRCLGlIQUFpSDtBQUFBLE1BQy9LLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLHFDQUFxQztBQUFBLE1BQ3BDLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMscUNBQXFDLDZZQUE2WSwwQ0FBMEM7QUFBQSxNQUM5ZixTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3RCO0FBQUEsSUFDQSx3QkFBd0I7QUFBQSxNQUN2QixNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyxzQ0FBc0Msc0RBQXNEO0FBQUEsTUFDdEgsU0FBUyxjQUFjLEtBQUs7QUFBQSxJQUM3QjtBQUFBLElBQ0EsMEJBQTBCO0FBQUEsTUFDekIsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsd0NBQXdDLDhDQUE4QztBQUFBLE1BQ2hILFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSwwQkFBMEI7QUFBQSxNQUN6QixNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyx3Q0FBd0MsOENBQThDO0FBQUEsTUFDaEgsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLHdCQUF3QjtBQUFBLE1BQ3ZCLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHNDQUFzQyx3REFBd0Q7QUFBQSxNQUN4SCxTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsTUFBTSxLQUFLO0FBQUEsSUFDbkI7QUFBQSxJQUNBLDBCQUEwQjtBQUFBLE1BQ3pCLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHdDQUF3Qyw2R0FBNkc7QUFBQSxNQUMvSyxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0Isa0JBQWtCLEdBQUc7QUFBQSxNQUN2QyxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsVUFBVSxTQUFTLFNBQVM7QUFBQSxNQUNuQyxrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMsNkJBQTZCLDBEQUEwRDtBQUFBLFFBQ3BHLElBQUksU0FBUyw0QkFBNEIsK0RBQStEO0FBQUEsUUFDeEcsSUFBSSxTQUFTLDhCQUE4Qix1R0FBdUc7QUFBQSxNQUNuSjtBQUFBLE1BQ0EscUJBQXFCLElBQUksU0FBUyw4QkFBOEIsK1FBQStRLDRCQUE0QiwrQkFBK0I7QUFBQSxNQUMxWSxTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3RCO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixnQkFBZ0IsR0FBRztBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMsaUNBQWlDLCtFQUErRTtBQUFBLE1BQ2xKLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLDZCQUE2QixHQUFHO0FBQUEsTUFDbEQsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUyx1Q0FBdUMsZ0hBQWdIO0FBQUEsTUFDekwsU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUN0QjtBQUFBLElBQ0EsZ0NBQWdDO0FBQUEsTUFDL0IsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsa0NBQWtDLDZGQUE2RjtBQUFBLE1BQ3pKLHNCQUFzQjtBQUFBLFFBQ3JCLE1BQU07QUFBQSxRQUNOLE1BQU0sQ0FBQyxTQUFTLFNBQVMsUUFBUTtBQUFBLFFBQ2pDLGFBQWEsSUFBSSxTQUFTLDhCQUE4QixxQ0FBcUM7QUFBQSxRQUM3RixrQkFBa0I7QUFBQSxVQUNqQixJQUFJLFNBQVMsb0NBQW9DLG9DQUFvQztBQUFBLFVBQ3JGLElBQUksU0FBUyxvQ0FBb0Msd0RBQXdEO0FBQUEsVUFDekcsSUFBSSxTQUFTLHFDQUFxQyxxQ0FBcUM7QUFBQSxRQUN4RjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNSLFNBQVM7QUFBQSxNQUNWO0FBQUEsTUFDQSxNQUFNLENBQUMsY0FBYztBQUFBLE1BQ3JCLFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxjQUFjLEVBQUUsU0FBUyxFQUFFLFNBQVMsUUFBUSxFQUFFO0FBQUEsSUFDL0M7QUFBQSxJQUNBLHlDQUF5QztBQUFBLE1BQ3hDLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMseUNBQXlDLHlPQUF5TztBQUFBLE1BQ3BULFNBQVM7QUFBQSxNQUNULGNBQWMsRUFBRSxTQUFTLE1BQU07QUFBQSxJQUNoQztBQUFBLElBQ0EsNENBQTRDO0FBQUEsTUFDM0MsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUyw0Q0FBNEMsZ1RBQWdUO0FBQUEsTUFDOVgsU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixjQUFjLEVBQUUsU0FBUyxNQUFNO0FBQUEsSUFDaEM7QUFBQSxJQUNBLGdDQUFnQztBQUFBLE1BQy9CLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMsZ0NBQWdDLGdKQUFnSjtBQUFBLE1BQ2xOLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSwwQ0FBMEM7QUFBQSxNQUN6QyxNQUFNO0FBQUEsTUFDTixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixJQUFJLFNBQVMsMENBQTBDLG9GQUFvRjtBQUFBLE1BQ2hLLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSx3Q0FBd0M7QUFBQSxNQUN2QyxNQUFNO0FBQUEsTUFDTixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHFCQUFxQixJQUFJLFNBQVMsd0NBQXdDLG9GQUFvRjtBQUFBLE1BQzlKLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSx1Q0FBdUM7QUFBQSxNQUN0QyxNQUFNO0FBQUEsTUFDTixxQkFBcUIsSUFBSSxTQUFTLHVDQUF1Qyx3SkFBd0o7QUFBQSxNQUNqTyxTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsY0FBYztBQUFBLE1BQ3JCLFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IseUJBQXlCLEdBQUc7QUFBQSxNQUM5QyxNQUFNO0FBQUEsTUFDTixxQkFBcUIsSUFBSSxTQUFTLDBDQUEwQyx5R0FBeUc7QUFBQSxNQUNyTCxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsMkJBQTJCLEdBQUc7QUFBQSxNQUNoRCxNQUFNO0FBQUEsTUFDTixxQkFBcUIsSUFBSSxTQUFTLDRDQUE0Qyx5UEFBeVA7QUFBQSxNQUN2VSxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EscUJBQXFCO0FBQUEsTUFDcEIsTUFBTTtBQUFBLE1BQ04sT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixhQUFhLElBQUksU0FBUyxxQkFBcUIsbUtBQW1LO0FBQUEsTUFDbE4sU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLHdCQUF3QjtBQUFBLE1BQ3ZCLE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxPQUFPLFlBQVksa0JBQWtCLGFBQWEsY0FBYztBQUFBLE1BQ3ZFLGtCQUFrQjtBQUFBLFFBQ2pCLElBQUksU0FBUyw0QkFBNEIsd0JBQXdCO0FBQUEsUUFDakUsSUFBSSxTQUFTLGlDQUFpQywrREFBK0Q7QUFBQSxRQUM3RyxJQUFJLFNBQVMsdUNBQXVDLHdEQUF3RDtBQUFBLFFBQzVHLElBQUksU0FBUyxrQ0FBa0MsOENBQThDO0FBQUEsUUFDN0YsSUFBSSxTQUFTLHFDQUFxQyxnREFBZ0Q7QUFBQSxNQUNuRztBQUFBLE1BQ0EsYUFBYSxJQUFJLFNBQVMsd0JBQXdCLCtGQUErRjtBQUFBLE1BQ2pKLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSwrQ0FBK0M7QUFBQSxNQUM5QyxNQUFNO0FBQUEsTUFDTixvQkFBb0IsSUFBSSxTQUFTLDBEQUEwRCxrRkFBa0Y7QUFBQSxNQUM3SyxhQUFhLElBQUksU0FBUywrQ0FBK0Msd0RBQXdEO0FBQUEsTUFDakksU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsa0JBQWtCLG9CQUFvQixHQUFHO0FBQUEsTUFDekMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsa0RBQWtELGtHQUFrRztBQUFBLE1BQzlLLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHlCQUF5QixHQUFHO0FBQUEsTUFDOUMsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLFFBQVEsUUFBUSxRQUFRLFFBQVEsU0FBUyxTQUFTLFFBQVE7QUFBQSxNQUNqRSxrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMsOERBQThELDBDQUEwQztBQUFBLFFBQ3JILElBQUksU0FBUyw4REFBOEQsa0NBQWtDO0FBQUEsUUFDN0csSUFBSSxTQUFTLDhEQUE4RCx1Q0FBdUM7QUFBQSxRQUNsSCxJQUFJLFNBQVMsOERBQThELHdDQUF3QztBQUFBLFFBQ25ILElBQUksU0FBUywrREFBK0QsMENBQTBDO0FBQUEsUUFDdEgsSUFBSSxTQUFTLCtEQUErRCxrQ0FBa0M7QUFBQSxRQUM5RyxJQUFJLFNBQVMsZ0VBQWdFLDBEQUEwRDtBQUFBLE1BQ3hJO0FBQUEsTUFDQSxhQUFhLElBQUksU0FBUyx5REFBeUQseURBQXlEO0FBQUEsTUFDNUksU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUN0QjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsNkJBQTZCLEdBQUc7QUFBQSxNQUNsRCxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsT0FBTyxRQUFRLFdBQVc7QUFBQSxNQUNqQyxrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMsd0RBQXdELCtDQUErQztBQUFBLFFBQ3BILElBQUksU0FBUyx5REFBeUQsK0JBQStCO0FBQUEsUUFDckcsSUFBSSxTQUFTLDhEQUE4RCwyREFBMkQ7QUFBQSxNQUN2STtBQUFBLE1BQ0EsYUFBYSxJQUFJLFNBQVMsb0RBQW9ELHNMQUFzTDtBQUFBLE1BQ3BRLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLDBCQUEwQixHQUFHO0FBQUEsTUFDL0MsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMseUNBQXlDLGdIQUFnSDtBQUFBLE1BQ25MLFNBQVMsUUFBUSxZQUFZO0FBQUEsSUFDOUI7QUFBQSxJQUNBLGtDQUFrQztBQUFBLE1BQ2pDLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGtDQUFrQyx3REFBd0Q7QUFBQSxNQUNwSCxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IscUJBQXFCLEdBQUc7QUFBQSxNQUMxQyxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsT0FBTyxNQUFNO0FBQUEsTUFDcEIsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLG1DQUFtQyxpRUFBaUU7QUFBQSxRQUNqSCxJQUFJLFNBQVMsb0NBQW9DLHdFQUF3RTtBQUFBLE1BQzFIO0FBQUEsTUFDQSxhQUFhLElBQUksU0FBUywrQkFBK0IseUVBQXlFO0FBQUEsTUFDbEksU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsa0JBQWtCLGtCQUFrQixHQUFHO0FBQUEsTUFDdkMsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUywyQkFBMkIsaUtBQXFLO0FBQUEsTUFDbE8sc0JBQXNCO0FBQUEsUUFDckIsTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLFNBQVMsQ0FDVDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLDBCQUEwQixHQUFHO0FBQUEsTUFDL0MsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLE9BQU8sb0JBQW9CLFFBQVE7QUFBQSxNQUMxQyxrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMsdUNBQXVDLGdEQUFnRDtBQUFBLFFBQ3BHLElBQUksU0FBUyxvREFBb0QseUVBQXlFO0FBQUEsUUFDMUksSUFBSSxTQUFTLDBDQUEwQyxrRkFBa0Y7QUFBQSxNQUMxSTtBQUFBLE1BQ0EsYUFBYSxJQUFJLFNBQVMsbUNBQW1DLDBMQUEwTDtBQUFBLE1BQ3ZQLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixTQUFTLEdBQUc7QUFBQSxNQUM5QixTQUFTO0FBQUEsTUFDVCxxQkFBcUIsSUFBSSxTQUFTLDhCQUE4QixnT0FBZ087QUFBQSxNQUNoUyxNQUFNO0FBQUEsTUFDTixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLElBQ2xDO0FBQUEsSUFDQSxDQUFDLGtCQUFrQix3QkFBd0IsR0FBRztBQUFBLE1BQzdDLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMsbUNBQW1DLDZZQUE2WTtBQUFBLE1BQ2xkLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHNCQUFzQixHQUFHO0FBQUEsTUFDM0MsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLG9CQUFvQixTQUFTLG9CQUFvQixhQUFhLG9CQUFvQixTQUFTO0FBQUEsTUFDbEcsZ0JBQWdCO0FBQUEsUUFDZixJQUFJLFNBQVMsMENBQTBDLG1CQUFtQjtBQUFBLFFBQzFFLElBQUksU0FBUyw4Q0FBOEMsa0JBQWtCO0FBQUEsUUFDN0UsSUFBSSxTQUFTLDRDQUE0QyxxQkFBcUI7QUFBQSxNQUMvRTtBQUFBLE1BQ0Esa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLGdEQUFnRCxpREFBaUQ7QUFBQSxRQUM5RyxJQUFJLFNBQVMsb0RBQW9ELG1EQUFtRDtBQUFBLFFBQ3BILElBQUksU0FBUyxrREFBa0QsNENBQTRDO0FBQUEsTUFDNUc7QUFBQSxNQUNBLGFBQWEsSUFBSSxTQUFTLCtDQUErQyxnUkFBZ1I7QUFBQSxNQUN6VixTQUFTLG9CQUFvQjtBQUFBLElBQzlCO0FBQUEsSUFDQSxDQUFDLGtCQUFrQiwwQkFBMEIsR0FBRztBQUFBLE1BQy9DLE1BQU07QUFBQSxNQUNOLFNBQVMsUUFBUSxZQUFZO0FBQUEsTUFDN0IsYUFBYSxJQUFJLFNBQVMsb0NBQW9DLGdGQUFnRjtBQUFBLE1BQzlJLE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQiwrQkFBK0IsR0FBRztBQUFBLE1BQ3BELE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULHFCQUFxQixJQUFJLFNBQVMsc0RBQXNELDJMQUE2TDtBQUFBLE1BQ3JSLE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixvQkFBb0IsR0FBRztBQUFBLE1BQ3pDLE1BQU07QUFBQSxNQUNOLHNCQUFzQjtBQUFBLE1BQ3RCLFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxVQUNMLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQyxlQUFlLFFBQVEsV0FBVztBQUFBLFVBQ3pDLGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUyw4Q0FBOEMsZ0RBQTJDO0FBQUEsWUFDdEcsSUFBSSxTQUFTLHVDQUF1Qyw2Q0FBd0M7QUFBQSxZQUM1RixJQUFJLFNBQVMsNENBQTRDLDZEQUF3RDtBQUFBLFVBQ2xIO0FBQUEsVUFDQSxTQUFTO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyw4Q0FBOEMsMkNBQTJDO0FBQUEsUUFDcEg7QUFBQSxRQUNBLFdBQVc7QUFBQSxVQUNWLE1BQU07QUFBQSxVQUNOLE1BQU0sQ0FBQywyQkFBMkIsU0FBUywyQkFBMkIsVUFBVSwyQkFBMkIsUUFBUTtBQUFBLFVBQ25ILGtCQUFrQjtBQUFBLFlBQ2pCLElBQUksU0FBUywrQ0FBK0MsaUVBQTREO0FBQUEsWUFDeEgsSUFBSSxTQUFTLGdEQUFnRCxrRUFBNkQ7QUFBQSxZQUMxSCxJQUFJLFNBQVMsZ0RBQWdELGtEQUE2QztBQUFBLFVBQzNHO0FBQUEsVUFDQSxTQUFTLDJCQUEyQjtBQUFBLFVBQ3BDLGFBQWEsSUFBSSxTQUFTLG1EQUFtRCx1SUFBdUk7QUFBQSxRQUNyTjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsRUFBRSxNQUFNLGVBQWUsV0FBVywyQkFBMkIsUUFBUTtBQUFBLE1BQzlFLHFCQUFxQixJQUFJLFNBQVMsZ0RBQWdELDZMQUE2TDtBQUFBLElBQ2hSO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixZQUFZLEdBQUc7QUFBQSxNQUNqQyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxxQkFBcUIsSUFBSSxTQUFTLGlDQUFpQyxnVEFBc1Q7QUFBQSxNQUN6WCxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQ0EsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsT0FBTyxrQkFBa0I7QUFBQSxRQUN6QixpQkFBaUI7QUFBQSxVQUNoQixDQUFDLGlCQUFpQixHQUFHLEVBQUUsTUFBTSxTQUFTO0FBQUEsUUFDdkM7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLDRCQUE0QixrTUFBd007QUFBQSxVQUN6UDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsaUJBQWlCLEdBQUc7QUFBQSxNQUN0QyxTQUFTO0FBQUEsTUFDVCxxQkFBcUIsNkJBQTZCO0FBQUEsTUFDbEQsTUFBTTtBQUFBLE1BQ04sT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixNQUFNLENBQUMsY0FBYztBQUFBLE1BQ3JCLFFBQVE7QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLGdCQUFnQjtBQUFBLFFBQ2hCLE9BQU8sQ0FBQyxlQUFlLFdBQVcsa0JBQWtCLDJDQUEyQyxNQUFNLGFBQWEsV0FBVyxrQ0FBa0MsUUFBUSxRQUFRO0FBQUEsUUFDL0ssaUJBQWlCO0FBQUEsVUFDaEIsQ0FBQywyQ0FBMkMsR0FBRyxFQUFFLE1BQU0sU0FBUztBQUFBLFFBQ2pFO0FBQUEsUUFDQSxjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyw0QkFBNEIsb3BCQUFvcEI7QUFBQSxVQUNyc0I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLGtCQUFrQixHQUFHO0FBQUEsTUFDdkMsU0FBUztBQUFBLE1BQ1QscUJBQXFCLElBQUksU0FBUyw0QkFBNEIsNk5BQTZOO0FBQUEsTUFDM1IsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQ0EsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsT0FBTyxDQUFDLGVBQWUsV0FBVyxrQ0FBa0MsUUFBUSxRQUFRO0FBQUEsUUFDcEYsY0FBYztBQUFBLFVBQ2IsYUFBYTtBQUFBLFlBQ1osS0FBSztBQUFBLFlBQ0wsT0FBTyxJQUFJLFNBQVMsbUNBQW1DLG9KQUFvSjtBQUFBLFVBQzVNO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQiw4QkFBOEIsR0FBRztBQUFBLE1BQ25ELE1BQU07QUFBQSxNQUNOLE9BQU8sRUFBRSxNQUFNLFNBQVM7QUFBQSxNQUN4QixTQUFTLENBQUM7QUFBQSxNQUNWLHFCQUFxQixJQUFJLFNBQVMsd0NBQXdDLG1MQUFtTDtBQUFBLE1BQzdQLE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLElBQ2xDO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixnQkFBZ0IsR0FBRztBQUFBLE1BQ3JDLFNBQVM7QUFBQSxRQUNSLFFBQVE7QUFBQSxRQUNSLHFCQUFxQjtBQUFBLFFBQ3JCLGNBQWM7QUFBQSxRQUNkLG1GQUFtRjtBQUFBLFFBQ25GLDJGQUEyRjtBQUFBLFFBQzNGLHdCQUF3QjtBQUFBLFFBQ3hCLHVCQUF1QjtBQUFBO0FBQUEsUUFDdkIsYUFBYTtBQUFBO0FBQUEsUUFDYix5QkFBeUI7QUFBQTtBQUFBLE1BQzFCO0FBQUEsTUFDQSxxQkFBcUIsSUFBSSxTQUFTLGdDQUFnQyxpY0FBaWM7QUFBQSxNQUNuZ0IsTUFBTTtBQUFBLE1BQ04sc0JBQXNCO0FBQUEsUUFDckIsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixnQkFBZ0IsR0FBRztBQUFBLE1BQ3JDLFNBQVM7QUFBQSxRQUNSLGlDQUFpQztBQUFBLFFBQ2pDLDhDQUE4QztBQUFBLE1BQy9DO0FBQUEsTUFDQSxxQkFBcUIsSUFBSSxTQUFTLHFDQUFxQyxvbEJBQThsQjtBQUFBLE1BQ3JxQixNQUFNO0FBQUEsTUFDTixzQkFBc0I7QUFBQSxRQUNyQixPQUFPO0FBQUEsVUFDTixFQUFFLE1BQU0sVUFBVTtBQUFBLFVBQ2xCO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixZQUFZO0FBQUEsY0FDWCxnQkFBZ0IsRUFBRSxNQUFNLFVBQVU7QUFBQSxjQUNsQyxpQkFBaUIsRUFBRSxNQUFNLFVBQVU7QUFBQSxZQUNwQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHVCQUF1QixHQUFHO0FBQUEsTUFDNUMsU0FBUyxDQUFDO0FBQUEsTUFDVixxQkFBcUIsSUFBSSxTQUFTLHNDQUFzQyw4UUFBa1I7QUFBQSxNQUMxVixNQUFNO0FBQUEsTUFDTixlQUFlO0FBQUEsUUFDZCxNQUFNO0FBQUEsUUFDTixrQkFBa0I7QUFBQSxNQUNuQjtBQUFBLE1BQ0Esc0JBQXNCO0FBQUEsUUFDckIsTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsUUFDWjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFFBQVE7QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLGdCQUFnQjtBQUFBLFFBQ2hCLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLHNDQUFzQyw4UUFBa1I7QUFBQSxVQUM3VTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsZ0JBQWdCLEdBQUc7QUFBQSxNQUNyQyxTQUFTO0FBQUEsTUFDVCxhQUFhLElBQUksU0FBUywwQkFBMEIsMkRBQTJEO0FBQUEsTUFDL0csTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUN0QjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0Isd0JBQXdCLEdBQUc7QUFBQSxNQUM3QyxTQUFTO0FBQUEsUUFDUixXQUFXLEVBQUUsV0FBVyxlQUFlLGVBQWUsS0FBSztBQUFBLE1BQzVEO0FBQUEsTUFDQSxhQUFhLElBQUksU0FBUyxtQ0FBbUMsaUlBQWlJO0FBQUEsTUFDOUwsTUFBTTtBQUFBLE1BQ04sc0JBQXNCO0FBQUEsUUFDckIsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFVBQ1gsV0FBVyxFQUFFLE1BQU0sVUFBVSxhQUFhLElBQUksU0FBUyxrQ0FBa0Msc0NBQXNDLEVBQUU7QUFBQSxVQUNqSSxlQUFlLEVBQUUsTUFBTSxXQUFXLGFBQWEsSUFBSSxTQUFTLHNDQUFzQyxvRUFBb0UsRUFBRTtBQUFBLFFBQ3pLO0FBQUEsUUFDQSxVQUFVLENBQUMsV0FBVztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3RCO0FBQUEsSUFDQSxDQUFDLGtCQUFrQix3QkFBd0IsR0FBRztBQUFBLE1BQzdDLFNBQVM7QUFBQSxRQUNSLGdCQUFnQixFQUFFLFdBQVcsUUFBUTtBQUFBLE1BQ3RDO0FBQUEsTUFDQSxhQUFhLElBQUksU0FBUyxtQ0FBbUMsb0hBQW9IO0FBQUEsTUFDakwsTUFBTTtBQUFBLE1BQ04sc0JBQXNCO0FBQUEsUUFDckIsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFVBQ1gsV0FBVyxFQUFFLE1BQU0sVUFBVSxhQUFhLElBQUksU0FBUyw2Q0FBNkMsc0NBQXNDLEVBQUU7QUFBQSxVQUM1SSxlQUFlLEVBQUUsTUFBTSxXQUFXLGFBQWEsSUFBSSxTQUFTLGlEQUFpRCxvRUFBb0UsRUFBRTtBQUFBLFFBQ3BMO0FBQUEsUUFDQSxVQUFVLENBQUMsV0FBVztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3RCO0FBQUEsSUFDQSxDQUFDLGtCQUFrQiw4QkFBOEIsR0FBRztBQUFBLE1BQ25ELFNBQVM7QUFBQSxRQUNSLGdCQUFnQixFQUFFLFdBQVcsUUFBUTtBQUFBLE1BQ3RDO0FBQUEsTUFDQSxhQUFhLElBQUksU0FBUyx5Q0FBeUMsK0hBQStIO0FBQUEsTUFDbE0sTUFBTTtBQUFBLE1BQ04sc0JBQXNCO0FBQUEsUUFDckIsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFVBQ1gsV0FBVyxFQUFFLE1BQU0sVUFBVSxhQUFhLElBQUksU0FBUyxtREFBbUQsc0NBQXNDLEVBQUU7QUFBQSxVQUNsSixlQUFlLEVBQUUsTUFBTSxXQUFXLGFBQWEsSUFBSSxTQUFTLHVEQUF1RCxvRUFBb0UsRUFBRTtBQUFBLFFBQzFMO0FBQUEsUUFDQSxVQUFVLENBQUMsV0FBVztBQUFBLE1BQ3ZCO0FBQUEsTUFDQSxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3RCO0FBQUEsSUFDQSxrQ0FBa0M7QUFBQSxNQUNqQyxTQUFTO0FBQUEsTUFDVCxxQkFBcUIsSUFBSSxTQUFTLGtDQUFrQyxrS0FBa0s7QUFBQSxNQUN0TyxNQUFNO0FBQUEsSUFDUDtBQUFBLElBQ0EscUJBQXFCO0FBQUEsTUFDcEIscUJBQXFCLElBQUksU0FBUyxxQkFBcUIsc0hBQXNIO0FBQUEsTUFDN0ssTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLFVBQVUsU0FBUyxTQUFTLE1BQU07QUFBQSxNQUN6QyxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUc7QUFBQSxNQUM1QyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxhQUFhLElBQUksU0FBUyw2QkFBNkIsMkZBQTJGO0FBQUEsTUFDbEosY0FBYyxFQUFFLFNBQVMsTUFBTTtBQUFBLElBQ2hDO0FBQUEsSUFDQSxDQUFDLGtCQUFrQiwyQkFBMkIsR0FBRztBQUFBLE1BQ2hELE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxXQUFXLFlBQVk7QUFBQSxNQUM5QixrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMseUNBQXlDLGlHQUFpRztBQUFBLFFBQ3ZKLElBQUksU0FBUyw0Q0FBNEMsaUpBQWlKO0FBQUEsTUFDM007QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULGFBQWEsSUFBSSxTQUFTLGlDQUFpQywrRkFBK0Y7QUFBQSxJQUMzSjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsNEJBQTRCLEdBQUc7QUFBQSxNQUNqRCxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxhQUFhLElBQUksU0FBUyxrQ0FBa0MsMEdBQTBHO0FBQUEsSUFDdks7QUFBQSxJQUNBLENBQUMsd0NBQXdDLEdBQUc7QUFBQSxNQUMzQyxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsV0FBVyxNQUFNO0FBQUEsTUFDeEIsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLHlEQUF5RCx5REFBeUQ7QUFBQSxRQUMvSCxJQUFJLFNBQVMsc0RBQXNELCtEQUErRDtBQUFBLE1BQ25JO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsY0FBYztBQUFBLE1BQ3JCLFlBQVksRUFBRSxNQUFNLFVBQVU7QUFBQSxNQUM5QixhQUFhLElBQUksU0FBUyxpREFBaUQsMEZBQTBGO0FBQUEsSUFDdEs7QUFBQSxJQUNBLENBQUMsa0JBQWtCLG9CQUFvQixHQUFHO0FBQUEsTUFDekMsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLFVBQVUsV0FBVyxRQUFRO0FBQUEsTUFDcEMsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLHFDQUFxQyw2QkFBNkI7QUFBQSxRQUMvRSxJQUFJLFNBQVMsc0NBQXNDLG9EQUFvRDtBQUFBLFFBQ3ZHLElBQUksU0FBUyxxQ0FBcUMscURBQXFEO0FBQUEsTUFDeEc7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIsWUFBWSxFQUFFLE1BQU0sVUFBVTtBQUFBLE1BQzlCLGFBQWEsSUFBSSxTQUFTLDhCQUE4QixnSEFBZ0g7QUFBQSxJQUN6SztBQUFBLElBQ0EsQ0FBQyxvQ0FBb0MsR0FBRztBQUFBLE1BQ3ZDLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMsc0NBQXNDLHNPQUFzTztBQUFBLE1BQzlTLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIsWUFBWSxFQUFFLE1BQU0sVUFBVTtBQUFBLElBQy9CO0FBQUEsSUFDQSxDQUFDLG9DQUFvQyxHQUFHO0FBQUEsTUFDdkMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsc0NBQXNDLG9OQUFvTjtBQUFBLE1BQ3BSLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIsWUFBWSxFQUFFLE1BQU0sVUFBVTtBQUFBLElBQy9CO0FBQUEsSUFDQSxDQUFDLG1DQUFtQyxHQUFHO0FBQUEsTUFDdEMsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUyxxQ0FBcUMsK1NBQStTO0FBQUEsTUFDdFgsU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixZQUFZLEVBQUUsTUFBTSxVQUFVO0FBQUEsSUFDL0I7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHVCQUF1QixHQUFHO0FBQUEsTUFDNUMsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsYUFBYSxJQUFJLFNBQVMsNkJBQTZCLDREQUE0RDtBQUFBLElBQ3BIO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixPQUFPLEdBQUc7QUFBQSxNQUM1QixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxhQUFhLElBQUksU0FBUyxnQkFBZ0IsOEdBQThHO0FBQUEsSUFDeko7QUFBQSxJQUNBLENBQUMsa0JBQWtCLGNBQWMsR0FBRztBQUFBLE1BQ25DLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULHFCQUFxQixJQUFJLFNBQVMsK0JBQStCLDhJQUE4STtBQUFBLElBQ2hOO0FBQUEsSUFDQSxDQUFDLGtCQUFrQiw4QkFBOEIsR0FBRztBQUFBLE1BQ25ELE1BQU07QUFBQSxNQUNOLE1BQU0sQ0FBQyxPQUFPLG9CQUFvQixRQUFRO0FBQUEsTUFDMUMsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLDJDQUEyQyw0Q0FBNEM7QUFBQSxRQUNwRyxJQUFJLFNBQVMsd0RBQXdELHFFQUFxRTtBQUFBLFFBQzFJLElBQUksU0FBUyw4Q0FBOEMsOEVBQThFO0FBQUEsTUFDMUk7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNULGFBQWEsSUFBSSxTQUFTLHVDQUF1QywwS0FBMEs7QUFBQSxJQUM1TztBQUFBLElBQ0EsNEJBQTRCO0FBQUEsTUFDM0IsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsYUFBYSxJQUFJLFNBQVMsNEJBQTRCLDZGQUE2RjtBQUFBLElBQ3BKO0FBQUEsSUFDQSxvQ0FBb0M7QUFBQSxNQUNuQyxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyxvQ0FBb0Msd0RBQXdEO0FBQUEsTUFDdEgsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsa0JBQWtCLGVBQWUsR0FBRztBQUFBLE1BQ3BDLE9BQU87QUFBQSxRQUNOO0FBQUEsVUFDQyxNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0E7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUNOLFlBQVk7QUFBQSxZQUNYLFNBQVM7QUFBQSxjQUNSLE1BQU07QUFBQSxjQUNOLFNBQVM7QUFBQSxjQUNULGFBQWEsSUFBSSxTQUFTLGdDQUFnQyx3RkFBd0Y7QUFBQSxZQUNuSjtBQUFBLFlBQ0EsU0FBUztBQUFBLGNBQ1IsTUFBTTtBQUFBLGNBQ04sU0FBUztBQUFBLGNBQ1QsYUFBYSxJQUFJLFNBQVMsZ0NBQWdDLCtFQUErRTtBQUFBLFlBQzFJO0FBQUEsWUFDQSxTQUFTO0FBQUEsY0FDUixNQUFNO0FBQUEsY0FDTixTQUFTO0FBQUEsY0FDVCxhQUFhLElBQUksU0FBUyxnQ0FBZ0MsK0NBQStDO0FBQUEsWUFDMUc7QUFBQSxVQUNEO0FBQUEsVUFDQSxzQkFBc0I7QUFBQSxVQUN0QixvQkFBb0IsSUFBSSxTQUFTLHlDQUF5QyxzRUFBc0U7QUFBQSxRQUNqSjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLHFCQUFxQixJQUFJLFNBQVMsd0JBQXdCLG1LQUFtSztBQUFBLE1BQzdOLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGVBQWUsR0FBRztBQUFBLE1BQ2xCLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLG1CQUFtQiw4REFBOEQ7QUFBQSxNQUMzRyxNQUFNO0FBQUEsUUFDTCxlQUFlO0FBQUEsUUFDZixlQUFlO0FBQUEsUUFDZixlQUFlO0FBQUEsTUFDaEI7QUFBQSxNQUNBLGtCQUFrQjtBQUFBLFFBQ2pCLElBQUksU0FBUyx3QkFBd0IsMkJBQTJCO0FBQUEsUUFDaEUsSUFBSSxTQUFTLDRCQUE0QixtRkFBbUY7QUFBQSxRQUM1SCxJQUFJLFNBQVMsdUJBQXVCLDJDQUEyQztBQUFBLE1BQ2hGO0FBQUEsTUFDQSxTQUFTLGVBQWU7QUFBQSxNQUN4QixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixPQUFPLENBQUMsZUFBZTtBQUN0QixjQUFJLFdBQVcsUUFBUSxPQUFPO0FBQzdCLG1CQUFPLGVBQWU7QUFBQSxVQUN2QjtBQUNBLGNBQUksV0FBVyxjQUFjLGlCQUFpQjtBQUM3QyxtQkFBTyxlQUFlO0FBQUEsVUFDdkI7QUFDQSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLG1CQUFtQiw4REFBOEQ7QUFBQSxVQUN0RztBQUFBLFVBQ0Esa0JBQWtCO0FBQUEsWUFDakI7QUFBQSxjQUNDLEtBQUs7QUFBQSxjQUF3QixPQUFPLElBQUksU0FBUyx3QkFBd0IsMkJBQTJCO0FBQUEsWUFDckc7QUFBQSxZQUNBO0FBQUEsY0FDQyxLQUFLO0FBQUEsY0FBNEIsT0FBTyxJQUFJLFNBQVMsNEJBQTRCLG1GQUFtRjtBQUFBLFlBQ3JLO0FBQUEsWUFDQTtBQUFBLGNBQ0MsS0FBSztBQUFBLGNBQXVCLE9BQU8sSUFBSSxTQUFTLHVCQUF1QiwyQ0FBMkM7QUFBQSxZQUNuSDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsdUJBQXVCLEdBQUc7QUFBQSxNQUMxQixNQUFNLENBQUMsU0FBUyxNQUFNO0FBQUEsTUFDdEIsT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sc0JBQXNCO0FBQUEsUUFDdEIsWUFBWTtBQUFBLFVBQ1gsWUFBWSxFQUFFLE1BQU0sVUFBVSxXQUFXLEdBQUcsYUFBYSxJQUFJLFNBQVMsc0NBQXNDLHdDQUF3QyxFQUFFO0FBQUEsVUFDdEosV0FBVyxFQUFFLE1BQU0sVUFBVSxXQUFXLEdBQUcsYUFBYSxJQUFJLFNBQVMscUNBQXFDLGtHQUFrRyxFQUFFO0FBQUEsVUFDOU0sZUFBZSxFQUFFLE1BQU0sU0FBUyxVQUFVLEdBQUcsT0FBTyxFQUFFLE1BQU0sU0FBUyxHQUFHLGFBQWEsSUFBSSxTQUFTLHlDQUF5Qyx1R0FBdUcsRUFBRTtBQUFBLFFBQ3JQO0FBQUEsUUFDQSxPQUFPO0FBQUEsVUFDTixFQUFFLFVBQVUsQ0FBQyxZQUFZLEVBQUU7QUFBQSxVQUMzQixFQUFFLFVBQVUsQ0FBQyxXQUFXLEVBQUU7QUFBQSxVQUMxQixFQUFFLFVBQVUsQ0FBQyxlQUFlLEVBQUU7QUFBQSxRQUMvQjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLHFCQUFxQixJQUFJLFNBQVMsMkJBQTJCLGdjQUFnYztBQUFBLE1BQzdmLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUE7QUFBQTtBQUFBLE1BRzFCLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLGdCQUFnQjtBQUFBLFFBQ2hCLE9BQU8sb0JBQW9CLCtCQUErQjtBQUFBLFFBQzFELGlCQUFpQjtBQUFBLFVBQ2hCLENBQUMsK0JBQStCLEdBQUcsRUFBRSxNQUFNLFNBQVM7QUFBQSxRQUNyRDtBQUFBLFFBQ0EsY0FBYztBQUFBLFVBQ2IsYUFBYTtBQUFBLFlBQ1osS0FBSztBQUFBLFlBQ0wsT0FBTyxJQUFJLFNBQVMsa0NBQWtDLCtLQUErSztBQUFBLFVBQ3RPO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLHNCQUFzQixHQUFHO0FBQUEsTUFDekIsTUFBTSxDQUFDLFNBQVMsTUFBTTtBQUFBLE1BQ3RCLE9BQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLHNCQUFzQjtBQUFBLFFBQ3RCLFlBQVk7QUFBQSxVQUNYLFlBQVksRUFBRSxNQUFNLFVBQVUsV0FBVyxHQUFHLGFBQWEsSUFBSSxTQUFTLHFDQUFxQyx3Q0FBd0MsRUFBRTtBQUFBLFVBQ3JKLFdBQVcsRUFBRSxNQUFNLFVBQVUsV0FBVyxHQUFHLGFBQWEsSUFBSSxTQUFTLG9DQUFvQyxrR0FBa0csRUFBRTtBQUFBLFVBQzdNLGVBQWUsRUFBRSxNQUFNLFNBQVMsVUFBVSxHQUFHLE9BQU8sRUFBRSxNQUFNLFNBQVMsR0FBRyxhQUFhLElBQUksU0FBUyx3Q0FBd0MsdUdBQXVHLEVBQUU7QUFBQSxRQUNwUDtBQUFBLFFBQ0EsT0FBTztBQUFBLFVBQ04sRUFBRSxVQUFVLENBQUMsWUFBWSxFQUFFO0FBQUEsVUFDM0IsRUFBRSxVQUFVLENBQUMsV0FBVyxFQUFFO0FBQUEsVUFDMUIsRUFBRSxVQUFVLENBQUMsZUFBZSxFQUFFO0FBQUEsUUFDL0I7QUFBQSxNQUNEO0FBQUEsTUFDQSxxQkFBcUIsSUFBSSxTQUFTLDBCQUEwQixzYUFBaWE7QUFBQSxNQUM3ZCxTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBO0FBQUE7QUFBQSxNQUcxQixVQUFVO0FBQUEsTUFDVixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixPQUFPLG9CQUFvQiw4QkFBOEI7QUFBQSxRQUN6RCxpQkFBaUI7QUFBQSxVQUNoQixDQUFDLDhCQUE4QixHQUFHLEVBQUUsTUFBTSxTQUFTO0FBQUEsUUFDcEQ7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLGlDQUFpQyw0TEFBNEw7QUFBQSxVQUNsUDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyw2Q0FBNkMsR0FBRztBQUFBLE1BQ2hELE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsVUFBVTtBQUFBLE1BQ1YsYUFBYSxJQUFJLFNBQVMsb0NBQW9DLG9GQUFvRjtBQUFBLE1BQ2xKLFFBQVE7QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLGdCQUFnQjtBQUFBLFFBQ2hCLE9BQU8sb0JBQW9CLDBDQUEwQztBQUFBLFFBQ3JFLGlCQUFpQjtBQUFBLFVBQ2hCLENBQUMsMENBQTBDLEdBQUcsRUFBRSxNQUFNLFVBQVU7QUFBQSxRQUNqRTtBQUFBLFFBQ0EsY0FBYztBQUFBLFVBQ2IsYUFBYTtBQUFBLFlBQ1osS0FBSztBQUFBLFlBQ0wsT0FBTyxJQUFJLFNBQVMsMkNBQTJDLG9GQUFvRjtBQUFBLFVBQ3BKO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixHQUFHO0FBQUEsTUFDckIsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsc0JBQXNCLG9HQUFvRztBQUFBLE1BQ3BKLFNBQVMsa0JBQWtCO0FBQUEsTUFDM0IsTUFBTTtBQUFBLFFBQ0wsa0JBQWtCO0FBQUEsUUFDbEIsa0JBQWtCO0FBQUEsUUFDbEIsa0JBQWtCO0FBQUEsTUFDbkI7QUFBQSxNQUNBLGtCQUFrQjtBQUFBLFFBQ2pCLElBQUksU0FBUyw0QkFBNEIsd0NBQXdDO0FBQUEsUUFDakYsSUFBSSxTQUFTLDhCQUE4QixvRUFBb0U7QUFBQSxRQUMvRyxJQUFJLFNBQVMscUNBQXFDLDRFQUE0RTtBQUFBLE1BQy9IO0FBQUEsTUFDQSxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3RCO0FBQUEsSUFDQSxDQUFDLG9CQUFvQixHQUFHO0FBQUEsTUFDdkIsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsdUJBQXVCLDBFQUEwRTtBQUFBLE1BQzNILFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0NBQWtDLEdBQUc7QUFBQSxNQUNyQyxNQUFNO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxNQUNWLE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsTUFBTSxDQUFDLFdBQVcsY0FBYztBQUFBLE1BQ2hDLHNCQUFzQjtBQUFBLE1BQ3RCLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxRQUNYLFFBQVE7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLFFBQVE7QUFBQSxVQUNSLHFCQUFxQixJQUFJLFNBQVMsd0NBQXdDLHVGQUF1RjtBQUFBLFFBQ2xLO0FBQUEsUUFDQSxVQUFVO0FBQUEsVUFDVCxNQUFNO0FBQUEsVUFDTixxQkFBcUIsSUFBSSxTQUFTLDBDQUEwQyxxRUFBcUU7QUFBQSxRQUNsSjtBQUFBLFFBQ0EsY0FBYztBQUFBLFVBQ2IsTUFBTTtBQUFBLFVBQ04scUJBQXFCLElBQUksU0FBUyw4Q0FBOEMsc0ZBQXNGO0FBQUEsUUFDdks7QUFBQSxNQUNEO0FBQUEsTUFDQSxxQkFBcUIsSUFBSSxTQUFTLGlDQUFpQyx3V0FBd1c7QUFBQSxNQUMzYSxRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyx3Q0FBd0Msa0hBQWtIO0FBQUEsVUFDL0s7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsaUNBQWlDLEdBQUc7QUFBQSxNQUNwQyxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyw4QkFBOEIsaUxBQWlMO0FBQUEsTUFDek8sTUFBTTtBQUFBLFFBQ0wscUJBQXFCO0FBQUEsUUFDckIscUJBQXFCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLGtCQUFrQjtBQUFBLFFBQ2pCLElBQUksU0FBUyxzQ0FBc0Msc0RBQXNEO0FBQUEsUUFDekcsSUFBSSxTQUFTLHFDQUFxQywwREFBMEQ7QUFBQSxNQUM3RztBQUFBLE1BQ0EsU0FBUyxxQkFBcUI7QUFBQSxJQUMvQjtBQUFBLElBQ0EsQ0FBQyx3QkFBd0IsR0FBRztBQUFBLE1BQzNCLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLDJCQUEyQixxTEFBcUwsVUFBVSxJQUFJLFNBQVMsWUFBWSxjQUFjLENBQUM7QUFBQSxNQUM1UixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLHNCQUFzQjtBQUFBLFFBQ3JCLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxVQUNYLG1CQUFtQjtBQUFBLFlBQ2xCLE1BQU07QUFBQSxZQUNOLGFBQWEsSUFBSSxTQUFTLDZDQUE2QyxtR0FBbUc7QUFBQSxZQUMxSyxTQUFTO0FBQUEsVUFDVjtBQUFBLFVBQ0Esb0JBQW9CO0FBQUEsWUFDbkIsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsOENBQThDLHFGQUFxRjtBQUFBLFlBQzdKLFNBQVM7QUFBQSxVQUNWO0FBQUEsVUFDQSxlQUFlO0FBQUEsWUFDZCxNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsY0FDTixNQUFNO0FBQUEsY0FDTixhQUFhLElBQUksU0FBUyxpQ0FBaUMsdUNBQXVDO0FBQUEsWUFDbkc7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGNBQWMscUJBQXFCLFlBQVksRUFBRSxnQkFBZ0IsR0FBRztBQUFBLE1BQ3BFLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLCtDQUErQyw4SkFBOEo7QUFBQSxNQUN2TyxTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsY0FBYztBQUFBLE1BQ3JCLFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IscUJBQXFCLEdBQUc7QUFBQSxNQUMxQyxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyw4QkFBOEIsMkRBQTJEO0FBQUEsTUFDbkgsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsY0FBYztBQUFBLFVBQ2IsYUFBYTtBQUFBLFlBQ1osS0FBSztBQUFBLFlBQ0wsT0FBTyxJQUFJLFNBQVMsOEJBQThCLDJEQUEyRDtBQUFBLFVBQzlHO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixjQUFjLEdBQUc7QUFBQSxNQUNuQyxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyx3QkFBd0IsMENBQTBDO0FBQUEsTUFDNUYsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsY0FBYztBQUFBLFVBQ2IsYUFBYTtBQUFBLFlBQ1osS0FBSztBQUFBLFlBQ0wsT0FBTyxJQUFJLFNBQVMsd0JBQXdCLDBDQUEwQztBQUFBLFVBQ3ZGO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixlQUFlLEdBQUc7QUFBQSxNQUNwQyxNQUFNO0FBQUEsTUFDTixzQkFBc0IsRUFBRSxNQUFNLFVBQVU7QUFBQSxNQUN4QyxZQUFZO0FBQUEsTUFDWixxQkFBcUIsSUFBSSxTQUFTLHdCQUF3QiwrUEFBK1A7QUFBQSxNQUN6VCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLGNBQWMsR0FBRztBQUFBLE1BQ25DLE1BQU07QUFBQSxNQUNOLHNCQUFzQixFQUFFLE1BQU0sVUFBVTtBQUFBLE1BQ3hDLHFCQUFxQixJQUFJLFNBQVMsK0JBQStCLDJkQUEyZCxNQUFNLGtCQUFrQixlQUFlLE9BQU8sTUFBTSxrQkFBa0Isa0JBQWtCLEtBQUs7QUFBQSxNQUN6bkIsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixPQUFPLG9CQUFvQiwyQkFBMkI7QUFBQSxRQUN0RCxpQkFBaUI7QUFBQSxVQUNoQixDQUFDLDJCQUEyQixHQUFHLEVBQUUsTUFBTSxTQUFTO0FBQUEsUUFDakQ7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLHNDQUFzQywrR0FBK0c7QUFBQSxVQUMxSztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxrQkFBa0Isa0JBQWtCLEdBQUc7QUFBQSxNQUN2QyxNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQ0EscUJBQXFCLElBQUksU0FBUyw2QkFBNkIsd1VBQXdVO0FBQUEsTUFDdlksU0FBUyxDQUFDLDBCQUEwQixvQ0FBb0M7QUFBQSxNQUN4RSxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLGlCQUFpQixHQUFHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQVd0QyxNQUFNO0FBQUEsTUFDTixzQkFBc0IsRUFBRSxNQUFNLENBQUMsUUFBUSxFQUFnQjtBQUFBLE1BQ3ZELFNBQVMsQ0FBQztBQUFBLE1BQ1YsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixVQUFVO0FBQUEsTUFDVixxQkFBcUIsSUFBSSxTQUFTLGtDQUFrQyx1SkFBdUosTUFBTSxrQkFBa0Isa0JBQWtCLE9BQU8sMkJBQTJCO0FBQUEsTUFDdlMsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsT0FBTyxvQkFBb0IsOEJBQThCO0FBQUEsUUFDekQsaUJBQWlCO0FBQUEsVUFDaEIsQ0FBQyw4QkFBOEIsR0FBRyxFQUFFLE1BQU0sU0FBUztBQUFBLFFBQ3BEO0FBQUEsUUFDQSxjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyx5Q0FBeUMsZ05BQWdOO0FBQUEsVUFDOVE7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLGtCQUFrQixHQUFHO0FBQUEsTUFDdkMsTUFBTSxDQUFDLFNBQVMsTUFBTTtBQUFBLE1BQ3RCLE9BQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLE1BQU0sQ0FBQyxVQUFVLE9BQU8sT0FBTyxPQUFPLFFBQVEsYUFBYSxlQUFlLGFBQWE7QUFBQSxVQUN4RjtBQUFBLFVBQ0EsTUFBTSxFQUFFLE1BQU0sU0FBUztBQUFBLFVBQ3ZCLEtBQUssRUFBRSxNQUFNLFNBQVM7QUFBQSxVQUN0QixLQUFLLEVBQUUsTUFBTSxTQUFTO0FBQUEsVUFDdEIsTUFBTSxFQUFFLE1BQU0sU0FBUztBQUFBLFVBQ3ZCLFNBQVMsRUFBRSxNQUFNLFNBQVM7QUFBQSxVQUMxQixhQUFhLEVBQUUsTUFBTSxTQUFTO0FBQUEsVUFDOUIsYUFBYSxFQUFFLE1BQU0sU0FBUztBQUFBLFVBQzlCLFNBQVMsRUFBRSxNQUFNLFVBQVUsc0JBQXNCLEVBQUUsTUFBTSxTQUFTLEVBQUU7QUFBQSxRQUNyRTtBQUFBLFFBQ0EsVUFBVSxDQUFDLFFBQVE7QUFBQSxNQUNwQjtBQUFBLE1BQ0EscUJBQXFCLElBQUksU0FBUyxtQ0FBbUMscWNBQXFjO0FBQUEsTUFDMWdCLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxNQUNaLE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixPQUFPLG9CQUFvQiwrQkFBK0I7QUFBQSxRQUMxRCxpQkFBaUI7QUFBQSxVQUNoQixDQUFDLCtCQUErQixHQUFHLEVBQUUsTUFBTSxTQUFTO0FBQUEsUUFDckQ7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLDBDQUEwQyw2SUFBNkk7QUFBQSxVQUM1TTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQywrQ0FBK0MsR0FBRztBQUFBLE1BQ2xELE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsVUFBVTtBQUFBLE1BQ1YsYUFBYSxJQUFJLFNBQVMscURBQXFELG1KQUFtSjtBQUFBLE1BQ2xPLFFBQVE7QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLGdCQUFnQjtBQUFBLFFBQ2hCLE9BQU8sb0JBQW9CLDRDQUE0QztBQUFBLFFBQ3ZFLGlCQUFpQjtBQUFBLFVBQ2hCLENBQUMsNENBQTRDLEdBQUcsRUFBRSxNQUFNLFVBQVU7QUFBQSxRQUNuRTtBQUFBLFFBQ0EsY0FBYztBQUFBLFVBQ2IsYUFBYTtBQUFBLFlBQ1osS0FBSztBQUFBLFlBQ0wsT0FBTyxJQUFJLFNBQVMsNERBQTRELG1KQUFtSjtBQUFBLFVBQ3BPO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLHVDQUF1QyxHQUFHO0FBQUEsTUFDMUMsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixVQUFVO0FBQUEsTUFDVixhQUFhLElBQUksU0FBUywrQkFBK0Isd0ZBQXdGO0FBQUEsTUFDakosUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsT0FBTyxvQkFBb0Isb0NBQW9DO0FBQUEsUUFDL0QsaUJBQWlCO0FBQUEsVUFDaEIsQ0FBQyxvQ0FBb0MsR0FBRyxFQUFFLE1BQU0sVUFBVTtBQUFBLFFBQzNEO0FBQUEsUUFDQSxjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyxzQ0FBc0Msd0ZBQXdGO0FBQUEsVUFDbko7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLFlBQVksR0FBRztBQUFBLE1BQ2pDLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGtDQUFrQyxrSEFBa0g7QUFBQSxNQUM5SyxTQUFTO0FBQUEsTUFDVCxPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixPQUFPLENBQUMsZUFBZSxXQUFXLHVCQUF1QixRQUFRLFFBQVE7QUFBQSxRQUN6RSxjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyxrQ0FBa0Msa0hBQWtIO0FBQUEsVUFDeks7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsNEJBQTRCLGFBQWEsR0FBRztBQUFBLE1BQzVDLHFCQUFxQixJQUFJLFNBQVMsNEJBQTRCLDZMQUE2TCxNQUFNLDRCQUE0QixxQkFBcUIsT0FBTyxNQUFNLDRCQUE0QixvQkFBb0IsT0FBTyxNQUFNLHNCQUFzQixtQkFBbUIsS0FBSztBQUFBLE1BQzFhLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxNQUNaLFFBQVE7QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLGdCQUFnQjtBQUFBLFFBQ2hCLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLDRCQUE0Qiw2TEFBNkwsTUFBTSw0QkFBNEIscUJBQXFCLE9BQU8sTUFBTSw0QkFBNEIsb0JBQW9CLE9BQU8sTUFBTSxzQkFBc0IsbUJBQW1CLEtBQUs7QUFBQSxVQUM3WjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyw0QkFBNEIscUJBQXFCLEdBQUc7QUFBQSxNQUNwRCxxQkFBcUIsSUFBSSxTQUFTLG9DQUFvQyx1VEFBdVQsTUFBTSw0QkFBNEIsYUFBYSxPQUFPLE1BQU0sc0JBQXNCLG1CQUFtQixPQUFPLE1BQU0sc0JBQXNCLHdCQUF3QixPQUFPLG1CQUFtQixNQUFNLDRCQUE0QixvQkFBb0IsS0FBSztBQUFBLE1BQ2xuQixNQUFNO0FBQUEsTUFDTixPQUFPLEVBQUUsTUFBTSxTQUFTO0FBQUEsTUFDeEIsU0FBUyxDQUFDO0FBQUEsTUFDVixZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyxvQ0FBb0MsdVRBQXVULE1BQU0sNEJBQTRCLGFBQWEsT0FBTyxNQUFNLHNCQUFzQixtQkFBbUIsT0FBTyxNQUFNLHNCQUFzQix3QkFBd0IsT0FBTyxtQkFBbUIsTUFBTSw0QkFBNEIsb0JBQW9CLEtBQUs7QUFBQSxVQUNybUI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsNEJBQTRCLG9CQUFvQixHQUFHO0FBQUEsTUFDbkQscUJBQXFCLElBQUksU0FBUyxtQ0FBbUMsMk5BQTJOLE1BQU0sNEJBQTRCLGFBQWEsT0FBTyxNQUFNLHNCQUFzQixtQkFBbUIsT0FBTyxNQUFNLHNCQUFzQix3QkFBd0IsT0FBTyxNQUFNLDRCQUE0QixxQkFBcUIsT0FBTyxpQkFBaUI7QUFBQSxNQUN0aEIsTUFBTTtBQUFBLE1BQ04sT0FBTyxFQUFFLE1BQU0sU0FBUztBQUFBLE1BQ3hCLFNBQVMsQ0FBQztBQUFBLE1BQ1YsWUFBWTtBQUFBLE1BQ1osUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsY0FBYztBQUFBLFVBQ2IsYUFBYTtBQUFBLFlBQ1osS0FBSztBQUFBLFlBQ0wsT0FBTyxJQUFJLFNBQVMsbUNBQW1DLDJOQUEyTixNQUFNLDRCQUE0QixhQUFhLE9BQU8sTUFBTSxzQkFBc0IsbUJBQW1CLE9BQU8sTUFBTSxzQkFBc0Isd0JBQXdCLE9BQU8sTUFBTSw0QkFBNEIscUJBQXFCLE9BQU8saUJBQWlCO0FBQUEsVUFDemdCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixxQkFBcUIsR0FBRztBQUFBLE1BQzFDLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLCtCQUErQiwyRkFBMkY7QUFBQSxNQUNwSixTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxpQ0FBaUMsR0FBRztBQUFBLE1BQ3BDLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGtDQUFrQywySEFBMkg7QUFBQSxNQUN2TCxTQUFTLFFBQVEsWUFBWTtBQUFBLE1BQzdCLE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLElBQ2xDO0FBQUEsSUFDQSxDQUFDLHNDQUFzQyxHQUFHO0FBQUEsTUFDekMsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUyx3Q0FBd0MsK0xBQStMO0FBQUEsTUFDelEsU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGdCQUFnQixVQUFVO0FBQUEsTUFDakMsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLHdDQUF3QyxHQUFHO0FBQUEsTUFDM0MsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QscUJBQXFCLElBQUksU0FBUyxrREFBa0QsdVBBQXVQO0FBQUEsTUFDM1UsU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGdCQUFnQixVQUFVO0FBQUEsTUFDakMsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLDJDQUEyQyxHQUFHO0FBQUEsTUFDOUMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsNkNBQTZDLDhIQUE4SDtBQUFBLE1BQ3JNLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLElBQ2xDO0FBQUEsSUFDQSxDQUFDLG9DQUFvQyxHQUFHO0FBQUEsTUFDdkMsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLEdBQUcsK0JBQStCO0FBQUEsTUFDekMsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLDJDQUEyQyxtSEFBbUg7QUFBQSxRQUMzSyxJQUFJLFNBQVMsNENBQTRDLDBDQUEwQztBQUFBLE1BQ3BHO0FBQUEsTUFDQSxxQkFBcUIsSUFBSSxTQUFTLHNDQUFzQyxzTEFBc0w7QUFBQSxNQUM5UCxTQUFTO0FBQUEsTUFDVCxPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLElBQ2xDO0FBQUEsSUFDQSxDQUFDLHFDQUFxQyxHQUFHO0FBQUEsTUFDeEMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsdUNBQXVDLCtKQUErSjtBQUFBLE1BQ2hPLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLElBQ2xDO0FBQUEsSUFDQSxDQUFDLG1DQUFtQyxHQUFHO0FBQUEsTUFDdEMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsNkNBQTZDLDRMQUE0TDtBQUFBLE1BQ25RLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLElBQ2xDO0FBQUEsSUFDQSxDQUFDLDBDQUEwQyxHQUFHO0FBQUEsTUFDN0MsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsb0RBQW9ELDZLQUE2SztBQUFBLE1BQzNQLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLElBQ2xDO0FBQUEsSUFDQSxDQUFDLHlDQUF5QyxHQUFHO0FBQUEsTUFDNUMsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUywwQ0FBMEMsdWlCQUFraUI7QUFBQSxNQUM5bUIsU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGdCQUFnQixVQUFVO0FBQUEsSUFDbEM7QUFBQSxJQUNBLENBQUMsMENBQTBDLEdBQUc7QUFBQSxNQUM3QyxNQUFNO0FBQUEsTUFDTixxQkFBcUIsSUFBSSxTQUFTLDJDQUEyQyxvZEFBb2Q7QUFBQSxNQUNqaUIsc0JBQXNCO0FBQUEsUUFDckIsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsa0RBQWtELGtGQUFrRjtBQUFBLFVBQy9KO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsQ0FBQztBQUFBLE1BQ1YsTUFBTSxDQUFDLGdCQUFnQixVQUFVO0FBQUEsSUFDbEM7QUFBQSxJQUNBLENBQUMsbUNBQW1DLEdBQUc7QUFBQSxNQUN0QyxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMseUJBQXlCLEtBQUsseUJBQXlCLElBQUkseUJBQXlCLFlBQVk7QUFBQSxNQUN2RyxrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMseUNBQXlDLG1HQUE4RjtBQUFBLFFBQ3BKLElBQUksU0FBUyx3Q0FBd0MsOEhBQThIO0FBQUEsUUFDbkwsSUFBSSxTQUFTLGtEQUFrRCxnR0FBZ0c7QUFBQSxNQUNoSztBQUFBLE1BQ0EscUJBQXFCLElBQUksU0FBUyxxQ0FBcUMsMFpBQWdaO0FBQUEsTUFDdmQsU0FBUyx5QkFBeUI7QUFBQSxNQUNsQyxNQUFNLENBQUMsZ0JBQWdCLFVBQVU7QUFBQSxNQUNqQyxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHdCQUF3QixHQUFHO0FBQUEsTUFDN0MsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsbUNBQW1DLHdGQUF3RjtBQUFBLE1BQ3JKLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGtCQUFrQix5QkFBeUIsR0FBRztBQUFBLE1BQzlDLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHFDQUFxQyxnSUFBZ0k7QUFBQSxNQUMvTCxTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHVCQUF1QixHQUFHO0FBQUEsTUFDNUMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsbUNBQW1DLDhGQUE4RjtBQUFBLE1BQzNKLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxnQkFBZ0IsVUFBVTtBQUFBLE1BQ2pDLFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IscUJBQXFCLEdBQUc7QUFBQSxNQUMxQyxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUywyQ0FBMkMsMkZBQTJGO0FBQUEsTUFDaEssU0FBUztBQUFBLE1BQ1QsTUFBTSxzQkFBc0I7QUFBQSxNQUM1QixnQkFBZ0Isc0JBQXNCO0FBQUEsTUFDdEMsMEJBQTBCLHNCQUFzQjtBQUFBLElBQ2pEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQix3QkFBd0IsR0FBRztBQUFBLE1BQzdDLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLDhDQUE4QyxpR0FBaUc7QUFBQSxNQUN6SyxTQUFTO0FBQUEsTUFDVCxNQUFNLHlCQUF5QjtBQUFBLE1BQy9CLGdCQUFnQix5QkFBeUI7QUFBQSxNQUN6QywwQkFBMEIseUJBQXlCO0FBQUEsSUFDcEQ7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHVCQUF1QixHQUFHO0FBQUEsTUFDNUMsTUFBTTtBQUFBLE1BQ04scUJBQXFCLElBQUksU0FBUyw0Q0FBNEMsK1JBQStSLHlCQUF5Qiw0QkFBNEI7QUFBQSxNQUNsYSxNQUFNLENBQUMsd0JBQXdCLE1BQU0sd0JBQXdCLFdBQVcsd0JBQXdCLE9BQU87QUFBQSxNQUN2RyxnQkFBZ0I7QUFBQSxRQUNmLElBQUksU0FBUywyQ0FBMkMsTUFBTTtBQUFBLFFBQzlELElBQUksU0FBUyxnREFBZ0Qsa0JBQWtCO0FBQUEsUUFDL0UsSUFBSSxTQUFTLDhDQUE4QyxnQkFBZ0I7QUFBQSxNQUM1RTtBQUFBLE1BQ0EsMEJBQTBCO0FBQUEsUUFDekIsSUFBSSxTQUFTLGlEQUFpRCxxQ0FBcUM7QUFBQSxRQUNuRyxJQUFJLFNBQVMsc0RBQXNELHlDQUF5QztBQUFBLFFBQzVHLElBQUksU0FBUyxvREFBb0QsZ0RBQWdEO0FBQUEsTUFDbEg7QUFBQSxNQUNBLFNBQVMsd0JBQXdCO0FBQUEsSUFDbEM7QUFBQSxJQUNBLENBQUMsa0JBQWtCLFlBQVksR0FBRztBQUFBLE1BQ2pDLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGlDQUFpQyxpSEFBaUg7QUFBQSxNQUM1SyxTQUFTO0FBQUEsTUFDVCxNQUFNLHlCQUF5QjtBQUFBLE1BQy9CLGdCQUFnQix5QkFBeUI7QUFBQSxNQUN6QywwQkFBMEIseUJBQXlCO0FBQUEsSUFDcEQ7QUFBQSxJQUNBLENBQUMsa0JBQWtCLGlCQUFpQixHQUFHO0FBQUEsTUFDdEMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsc0NBQXNDLHlLQUF5SztBQUFBLE1BQ3pPLFNBQVM7QUFBQSxNQUNULE1BQU0sOEJBQThCO0FBQUEsTUFDcEMsZ0JBQWdCLDhCQUE4QjtBQUFBLE1BQzlDLDBCQUEwQiw4QkFBOEI7QUFBQSxJQUN6RDtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsNEJBQTRCLEdBQUc7QUFBQSxNQUNqRCxNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsU0FBUyxPQUFPO0FBQUEsTUFDdkIsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLDJDQUEyQyxnRUFBZ0U7QUFBQSxRQUN4SCxJQUFJLFNBQVMsMkNBQTJDLHVHQUF1RztBQUFBLE1BQ2hLO0FBQUEsTUFDQSxhQUFhLElBQUksU0FBUyxpREFBaUQsMEZBQTBGO0FBQUEsTUFDckssU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsa0JBQWtCLFVBQVUsR0FBRztBQUFBLE1BQy9CLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGdDQUFnQyxzREFBc0Q7QUFBQSxNQUNoSCxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsOEJBQThCLEdBQUc7QUFBQSxNQUNuRCxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyxvREFBb0QsNEhBQTRIO0FBQUEsTUFDMU0sU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUN0QjtBQUFBLElBQ0EsQ0FBQyxtQkFBbUIsR0FBRztBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLFlBQVksT0FBTyxZQUFZLG9CQUFvQixJQUFJLE9BQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxXQUFXLGFBQWEsNkJBQTZCLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ25JLHNCQUFzQjtBQUFBLE1BQ3RCLFNBQVMsT0FBTyxZQUFZLG9CQUFvQixJQUFJLE9BQUssQ0FBQyxHQUFHLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDcEUscUJBQXFCLElBQUksU0FBUyx5QkFBeUIsNEdBQTRHO0FBQUEsSUFDeEs7QUFBQSxJQUNBLENBQUMsaUNBQWlDLEdBQUc7QUFBQSxNQUNwQyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsU0FBUztBQUFBLE1BQ2hCLGFBQWEsSUFBSSxTQUFTLDRCQUE0QiwyRUFBMkU7QUFBQSxNQUNqSSxVQUFVLFFBQVEsWUFBWTtBQUFBLElBQy9CO0FBQUEsSUFDQSxDQUFDLDBCQUEwQixHQUFHO0FBQUEsTUFDN0IsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsMEJBQTBCLHFEQUFxRDtBQUFBLE1BQ3pHLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsTUFBTSxDQUFDLHNCQUFzQixVQUFVO0FBQUEsTUFDdkMsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsT0FBTyxDQUFDLGVBQWUsV0FBVztBQUFBLFFBQ2xDLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLDBCQUEwQixxREFBcUQ7QUFBQSxVQUNwRztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxjQUFjLHlCQUF5QixHQUFHO0FBQUEsTUFDMUMsTUFBTTtBQUFBLE1BQ04sT0FBTyxJQUFJO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxxQkFBcUIsSUFBSTtBQUFBLFFBQ3hCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1IsR0FBRyxvQ0FBb0MsSUFBSSxDQUFDLFlBQVksRUFBRSxDQUFDLE9BQU8sSUFBSSxHQUFHLEtBQUssRUFBRSxFQUFFLE9BQU8sQ0FBQyxLQUFLLFVBQVUsRUFBRSxHQUFHLEtBQUssR0FBRyxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQUEsTUFDbEk7QUFBQSxNQUNBLHNCQUFzQixFQUFFLE1BQU0sVUFBVTtBQUFBLE1BQ3hDLGVBQWU7QUFBQSxRQUNkLFNBQVM7QUFBQSxRQUNULHFCQUFxQixJQUFJLFNBQVMsMENBQTBDLHVLQUF1SztBQUFBLE1BQ3BQO0FBQUEsTUFDQSxZQUFZO0FBQUEsTUFDWixNQUFNLENBQUMsV0FBVyxvQkFBb0IsbUJBQW1CLGNBQWM7QUFBQSxNQUN2RSxVQUFVO0FBQUEsUUFDVDtBQUFBLFVBQ0MsQ0FBQyxvQ0FBb0MsQ0FBQyxFQUFFLElBQUksR0FBRztBQUFBLFFBQ2hEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsQ0FBQyxrQ0FBa0MsR0FBRztBQUFBLFVBQ3RDLG9DQUFvQztBQUFBLFFBQ3JDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsY0FBYyxvQkFBb0IsR0FBRztBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLE9BQU8sSUFBSTtBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EscUJBQXFCLElBQUk7QUFBQSxRQUN4QjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNSLENBQUMsNEJBQTRCLEdBQUc7QUFBQSxNQUNqQztBQUFBLE1BQ0Esc0JBQXNCLEVBQUUsTUFBTSxVQUFVO0FBQUEsTUFDeEMsdUJBQXVCLEVBQUUsTUFBTSxVQUFVO0FBQUEsTUFDekMsZUFBZTtBQUFBLFFBQ2QsU0FBUztBQUFBLFFBQ1QscUJBQXFCLElBQUksU0FBUyx3Q0FBd0MsdUtBQXVLO0FBQUEsTUFDbFA7QUFBQSxNQUNBLFlBQVk7QUFBQSxNQUNaLE1BQU0sQ0FBQyxXQUFXLG9CQUFvQixtQkFBbUIsY0FBYztBQUFBLE1BQ3ZFLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxDQUFDLDRCQUE0QixHQUFHO0FBQUEsUUFDakM7QUFBQSxRQUNBO0FBQUEsVUFDQyxDQUFDLDRCQUE0QixHQUFHO0FBQUEsVUFDaEMsK0JBQStCO0FBQUEsUUFDaEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxjQUFjLGlCQUFpQixHQUFHO0FBQUEsTUFDbEMsTUFBTTtBQUFBLE1BQ04sT0FBTyxJQUFJO0FBQUEsUUFDVjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxxQkFBcUIsSUFBSTtBQUFBLFFBQ3hCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1IsQ0FBQyxpQ0FBaUMsR0FBRztBQUFBLE1BQ3RDO0FBQUEsTUFDQSxvQkFBb0IsSUFBSSxTQUFTLHlDQUF5QyxnSkFBZ0o7QUFBQSxNQUMxTixzQkFBc0IsRUFBRSxNQUFNLFVBQVU7QUFBQSxNQUN4Qyx1QkFBdUIsRUFBRSxNQUFNLFVBQVU7QUFBQSxNQUN6QyxZQUFZO0FBQUEsTUFDWixNQUFNLENBQUMsZ0JBQWdCLFdBQVcsb0JBQW9CLG1CQUFtQixjQUFjO0FBQUEsTUFDdkYsVUFBVTtBQUFBLFFBQ1Q7QUFBQSxVQUNDLENBQUMsaUNBQWlDLEdBQUc7QUFBQSxRQUN0QztBQUFBLFFBQ0E7QUFBQSxVQUNDLENBQUMsaUNBQWlDLEdBQUc7QUFBQSxVQUNyQyxpQ0FBaUM7QUFBQSxRQUNsQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGNBQWMsbUJBQW1CLEdBQUc7QUFBQSxNQUNwQyxNQUFNO0FBQUEsTUFDTixPQUFPLElBQUk7QUFBQSxRQUNWO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLHFCQUFxQixJQUFJO0FBQUEsUUFDeEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUixDQUFDLG9CQUFvQixHQUFHO0FBQUEsUUFDeEIsQ0FBQywyQkFBMkIsR0FBRztBQUFBLFFBQy9CLENBQUMsaUNBQWlDLEdBQUc7QUFBQSxNQUN0QztBQUFBLE1BQ0Esc0JBQXNCLEVBQUUsTUFBTSxVQUFVO0FBQUEsTUFDeEMsZUFBZTtBQUFBLFFBQ2QsU0FBUztBQUFBLFFBQ1QscUJBQXFCLElBQUksU0FBUyxtQ0FBbUMsa0dBQWtHO0FBQUEsTUFDeEs7QUFBQSxNQUNBLFlBQVk7QUFBQSxNQUNaLE1BQU0sQ0FBQyxXQUFXLG9CQUFvQixtQkFBbUIsY0FBYztBQUFBLE1BQ3ZFLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxDQUFDLG9CQUFvQixHQUFHO0FBQUEsUUFDekI7QUFBQSxRQUNBO0FBQUEsVUFDQyxDQUFDLG9CQUFvQixHQUFHO0FBQUEsVUFDeEIsYUFBYTtBQUFBLFVBQ2Isb0JBQW9CO0FBQUEsVUFDcEIscUJBQXFCO0FBQUEsUUFDdEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxjQUFjLFlBQVksR0FBRztBQUFBLE1BQzdCLE1BQU07QUFBQSxNQUNOLE9BQU8sSUFBSSxTQUFTLHlCQUF5QixvQkFBcUI7QUFBQSxNQUNsRSxxQkFBcUIsSUFBSSxTQUFTLCtCQUErQix5S0FBMEs7QUFBQSxNQUMzTyxTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsTUFDWiw4QkFBOEI7QUFBQSxNQUM5QixNQUFNLENBQUMsV0FBVyxvQkFBb0IsbUJBQW1CLGNBQWM7QUFBQSxJQUN4RTtBQUFBLElBQ0EsQ0FBQyxjQUFjLG1CQUFtQixHQUFHO0FBQUEsTUFDcEMsTUFBTTtBQUFBLE1BQ04sT0FBTyxJQUFJLFNBQVMsK0JBQStCLDRCQUE2QjtBQUFBLE1BQ2hGLHFCQUFxQixJQUFJLFNBQVMscUNBQXFDLCtQQUFnUTtBQUFBLE1BQ3ZVLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxNQUNaLDhCQUE4QjtBQUFBLE1BQzlCLE1BQU0sQ0FBQyxnQkFBZ0IsV0FBVyxvQkFBb0IsbUJBQW1CLGNBQWM7QUFBQSxJQUN4RjtBQUFBLElBQ0EsQ0FBQyxjQUFjLGFBQWEsR0FBRztBQUFBLE1BQzlCLE1BQU07QUFBQSxNQUNOLE9BQU8sSUFBSSxTQUFTLDBCQUEwQixvQkFBcUI7QUFBQSxNQUNuRSxxQkFBcUIsSUFBSSxTQUFTLGdDQUFnQyxxTUFBc007QUFBQSxNQUN4USxTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsTUFDWiw4QkFBOEI7QUFBQSxNQUM5QixNQUFNLENBQUMsV0FBVyxvQkFBb0IsbUJBQW1CLGNBQWM7QUFBQSxJQUN4RTtBQUFBLElBQ0EsQ0FBQyxjQUFjLGdCQUFnQixHQUFHO0FBQUEsTUFDakMsTUFBTTtBQUFBLE1BQ04sT0FBTyxJQUFJLFNBQVMsNkJBQTZCLGtCQUFtQjtBQUFBLE1BQ3BFLHFCQUFxQixJQUFJLFNBQVMsbUNBQW1DLHVYQUF3WDtBQUFBLE1BQzdiLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxNQUNaLDhCQUE4QjtBQUFBLE1BQzlCLE1BQU0sQ0FBQyxXQUFXLG9CQUFvQixtQkFBbUIsY0FBYztBQUFBLElBQ3hFO0FBQUEsSUFDQSxDQUFDLGNBQWMsMEJBQTBCLEdBQUc7QUFBQSxNQUMzQyxNQUFNO0FBQUEsTUFDTixPQUFPLElBQUksU0FBUyxzQ0FBc0MsNEJBQTZCO0FBQUEsTUFDdkYscUJBQXFCLElBQUksU0FBUyw0Q0FBNEMseU5BQXlOO0FBQUEsTUFDdlMsU0FBUztBQUFBLE1BQ1QsWUFBWTtBQUFBLE1BQ1osOEJBQThCO0FBQUEsTUFDOUIsTUFBTSxDQUFDLGdCQUFnQixXQUFXLG9CQUFvQixtQkFBbUIsY0FBYztBQUFBLE1BQ3ZGLFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxjQUFjLDZCQUE2QixHQUFHO0FBQUEsTUFDOUMsTUFBTTtBQUFBLE1BQ04sT0FBTyxJQUFJLFNBQVMsMENBQTBDLCtCQUFnQztBQUFBLE1BQzlGLHFCQUFxQixJQUFJLFNBQVMsZ0RBQWdELHNLQUF1SztBQUFBLE1BQ3pQLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxNQUNaLDhCQUE4QjtBQUFBLE1BQzlCLE1BQU0sQ0FBQyxXQUFXLG9CQUFvQixtQkFBbUIsY0FBYztBQUFBLElBQ3hFO0FBQUEsSUFDQSxDQUFDLGNBQWMsK0JBQStCLEdBQUc7QUFBQSxNQUNoRCxNQUFNO0FBQUEsTUFDTixPQUFPLElBQUksU0FBUyw0Q0FBNEMsaUNBQWtDO0FBQUEsTUFDbEcscUJBQXFCLElBQUksU0FBUyxrREFBa0QsNklBQThJO0FBQUEsTUFDbE8sU0FBUztBQUFBLE1BQ1QsWUFBWTtBQUFBLE1BQ1osOEJBQThCO0FBQUEsTUFDOUIsTUFBTSxDQUFDLFdBQVcsb0JBQW9CLG1CQUFtQixjQUFjO0FBQUEsSUFDeEU7QUFBQSxJQUNBLENBQUMsY0FBYyxrQ0FBa0MsR0FBRztBQUFBLE1BQ25ELE1BQU07QUFBQSxNQUNOLE9BQU8sSUFBSSxTQUFTLDZDQUE2QywyQ0FBNEM7QUFBQSxNQUM3RyxxQkFBcUIsSUFBSSxTQUFTLG1EQUFtRCxnSUFBaUk7QUFBQSxNQUN0TixTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsTUFDWiw4QkFBOEI7QUFBQSxNQUM5QixNQUFNLENBQUMsV0FBVyxvQkFBb0IsbUJBQW1CLGNBQWM7QUFBQSxJQUN4RTtBQUFBLElBQ0EsQ0FBQyxjQUFjLG1CQUFtQixHQUFHO0FBQUEsTUFDcEMsTUFBTTtBQUFBLE1BQ04sT0FBTyxJQUFJLFNBQVMsbUNBQW1DLHdCQUF5QjtBQUFBLE1BQ2hGLHFCQUFxQixJQUFJO0FBQUEsUUFDeEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUixHQUFHLDZCQUE2QixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUMsT0FBTyxJQUFJLEdBQUcsS0FBSyxFQUFFLEVBQUUsT0FBTyxDQUFDLEtBQUssVUFBVSxFQUFFLEdBQUcsS0FBSyxHQUFHLEtBQUssSUFBSSxDQUFDLENBQUM7QUFBQSxNQUMzSDtBQUFBLE1BQ0Esc0JBQXNCLEVBQUUsTUFBTSxVQUFVO0FBQUEsTUFDeEMsZUFBZTtBQUFBLFFBQ2QsU0FBUztBQUFBLFFBQ1QscUJBQXFCLElBQUksU0FBUyx5Q0FBeUMsa0dBQWtHO0FBQUEsTUFDOUs7QUFBQSxNQUNBLFlBQVk7QUFBQSxNQUNaLE1BQU0sQ0FBQyxXQUFXLG9CQUFvQixtQkFBbUIsY0FBYztBQUFBLE1BQ3ZFLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxDQUFDLDZCQUE2QixDQUFDLEVBQUUsSUFBSSxHQUFHO0FBQUEsUUFDekM7QUFBQSxRQUNBO0FBQUEsVUFDQyxDQUFDLDZCQUE2QixDQUFDLEVBQUUsSUFBSSxHQUFHO0FBQUEsVUFDeEMsYUFBYTtBQUFBLFVBQ2Isb0JBQW9CO0FBQUEsVUFDcEIsb0JBQW9CO0FBQUEsUUFDckI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyxjQUFjLGtCQUFrQixHQUFHO0FBQUEsTUFDbkMsTUFBTTtBQUFBLE1BQ04sT0FBTyxJQUFJLFNBQVMsaUNBQWlDLHFCQUFzQjtBQUFBLE1BQzNFLHFCQUFxQixJQUFJO0FBQUEsUUFDeEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNSLEdBQUcsd0JBQXdCLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksR0FBRyxLQUFLLEVBQUUsRUFBRSxPQUFPLENBQUMsS0FBSyxVQUFVLEVBQUUsR0FBRyxLQUFLLEdBQUcsS0FBSyxJQUFJLENBQUMsQ0FBQztBQUFBLE1BQzVHO0FBQUEsTUFDQSxzQkFBc0IsRUFBRSxNQUFNLFVBQVU7QUFBQSxNQUN4QyxlQUFlO0FBQUEsUUFDZCxTQUFTO0FBQUEsUUFDVCxxQkFBcUIsSUFBSSxTQUFTLHVDQUF1QyxrR0FBa0c7QUFBQSxNQUM1SztBQUFBLE1BQ0EsWUFBWTtBQUFBLE1BQ1osTUFBTSxDQUFDLFdBQVcsV0FBVyxTQUFTLE9BQU87QUFBQSxNQUM3QyxVQUFVO0FBQUEsUUFDVDtBQUFBLFVBQ0MsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLElBQUksR0FBRztBQUFBLFFBQ3BDO0FBQUEsUUFDQTtBQUFBLFVBQ0MsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLElBQUksR0FBRztBQUFBLFVBQ25DLDJCQUEyQjtBQUFBLFFBQzVCO0FBQUEsTUFDRDtBQUFBLE1BQ0EsY0FBYyxFQUFFLFNBQVMsRUFBRSwrQkFBK0IsT0FBTyx5QkFBeUIsT0FBTywyQkFBMkIsTUFBTSxFQUFFO0FBQUEsSUFDckk7QUFBQSxJQUNBLENBQUMsY0FBYyxjQUFjLEdBQUc7QUFBQSxNQUMvQixNQUFNO0FBQUEsTUFDTixPQUFPLElBQUksU0FBUyx1QkFBdUIsZ0JBQWlCO0FBQUEsTUFDNUQscUJBQXFCLElBQUksU0FBUyw2QkFBNkIsMk5BQTROO0FBQUEsTUFDM1IsU0FBUztBQUFBLE1BQ1QsWUFBWTtBQUFBLE1BQ1osOEJBQThCO0FBQUEsTUFDOUIsTUFBTSxDQUFDLFdBQVcsV0FBVyxTQUFTLE9BQU87QUFBQSxNQUM3QyxRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixPQUFPLENBQUMsZUFBZSxXQUFXLGtDQUFrQyxRQUFRLFFBQVE7QUFBQSxRQUNwRixjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyw2QkFBNkIsMk5BQTROO0FBQUEsVUFDOVE7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsY0FBYyxnQkFBZ0IsR0FBRztBQUFBLE1BQ2pDLE1BQU07QUFBQSxNQUNOLE9BQU8sSUFBSSxTQUFTLDZCQUE2QixrQkFBbUI7QUFBQSxNQUNwRSxxQkFBcUIsSUFBSSxTQUFTLG1DQUFtQyx5UEFBMFA7QUFBQSxNQUMvVCxTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsTUFDWiw4QkFBOEI7QUFBQSxNQUM5QixNQUFNLENBQUMsV0FBVyxXQUFXLFNBQVMsT0FBTztBQUFBLElBQzlDO0FBQUEsSUFDQSxDQUFDLGNBQWMsd0JBQXdCLEdBQUc7QUFBQSxNQUN6QyxNQUFNO0FBQUEsTUFDTixPQUFPLG1CQUFtQjtBQUFBLE1BQzFCLE9BQU8sSUFBSTtBQUFBLFFBQ1Y7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EscUJBQXFCLElBQUk7QUFBQSxRQUN4QjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTLENBQUM7QUFBQSxNQUNWLHNCQUFzQjtBQUFBLFFBQ3JCLE9BQU87QUFBQSxVQUNOLEVBQUUsTUFBTSxVQUFVO0FBQUEsVUFDbEIsRUFBRSxNQUFNLFNBQVM7QUFBQSxRQUNsQjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLE1BQU0sQ0FBQyxXQUFXLG9CQUFvQixtQkFBbUIsY0FBYztBQUFBLE1BQ3ZFLFVBQVU7QUFBQSxRQUNUO0FBQUEsVUFDQyxRQUFRO0FBQUEsVUFDUixjQUFjO0FBQUEsVUFDZCxZQUFZO0FBQUEsUUFDYjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixlQUFlLEdBQUc7QUFBQSxNQUNwQyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxhQUFhLElBQUksU0FBUywrQkFBK0Isd0tBQXdLO0FBQUEsSUFDbE87QUFBQSxJQUNBLENBQUMsa0JBQWtCLGFBQWEsR0FBRztBQUFBLE1BQ2xDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxhQUFhLG9CQUFvQixnQkFBZ0I7QUFBQSxNQUN4RCxrQkFBa0I7QUFBQSxRQUNqQixJQUFJLFNBQVMscUNBQXFDLDhDQUE4QztBQUFBLFFBQ2hHLElBQUksU0FBUyw0Q0FBNEMsaUdBQWlHO0FBQUEsUUFDMUosSUFBSSxTQUFTLDBDQUEwQywyR0FBMkc7QUFBQSxNQUNuSztBQUFBLE1BQ0EsYUFBYSxJQUFJLFNBQVMsNEJBQTRCLG9DQUFvQztBQUFBLE1BQzFGLE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHNCQUFzQixHQUFHO0FBQUEsTUFDM0MsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsYUFBYSxJQUFJLFNBQVMsc0NBQXNDLGtGQUFrRjtBQUFBLE1BQ2xKLE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLHNDQUFzQztBQUFBLE1BQ3JDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxPQUFPLGdCQUFnQixRQUFRO0FBQUEsTUFDdEMsa0JBQWtCO0FBQUEsUUFDakIsSUFBSSxTQUFTLDBDQUEwQywrREFBK0Q7QUFBQSxRQUN0SCxJQUFJLFNBQVMsbURBQW1ELDJFQUEyRTtBQUFBLFFBQzNJLElBQUksU0FBUyw2Q0FBNkMseURBQXlEO0FBQUEsTUFDcEg7QUFBQSxNQUNBLHFCQUFxQixJQUFJLFNBQVMsc0NBQXNDLHlFQUF5RTtBQUFBLE1BQ2pKLE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHVCQUF1QixHQUFHO0FBQUEsTUFDNUMsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QscUJBQXFCLElBQUksU0FBUyxxQ0FBcUMsc0dBQXNHO0FBQUEsTUFDN0ssTUFBTSxDQUFDLGNBQWM7QUFBQSxJQUN0QjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IseUJBQXlCLEdBQUc7QUFBQSxNQUM5QyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxxQkFBcUIsSUFBSSxTQUFTLHlDQUF5QywyR0FBMkc7QUFBQSxNQUN0TCxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3RCO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixxQkFBcUIsR0FBRztBQUFBLE1BQzFDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULHFCQUFxQixJQUFJLFNBQVMscUNBQXFDLG9JQUFvSTtBQUFBLE1BQzNNLE1BQU0sQ0FBQyxTQUFTO0FBQUEsTUFDaEIsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixlQUFlLEdBQUc7QUFBQSxNQUNwQyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixTQUFTLENBQUM7QUFBQSxNQUNYO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsVUFDTCxNQUFNO0FBQUEsVUFDTixNQUFNLENBQUMsV0FBVyxRQUFRO0FBQUEsVUFDMUIsU0FBUztBQUFBLFVBQ1QsYUFBYSxJQUFJLFNBQVMsb0NBQW9DLHdHQUF3RztBQUFBLFFBQ3ZLO0FBQUEsUUFDQSxTQUFTO0FBQUEsVUFDUixNQUFNO0FBQUEsVUFDTixPQUFPLEVBQUUsTUFBTSxTQUFTO0FBQUEsVUFDeEIsU0FBUyxDQUFDO0FBQUEsVUFDVixhQUFhLElBQUksU0FBUyx1Q0FBdUMsbUdBQW1HO0FBQUEsUUFDcks7QUFBQSxNQUNEO0FBQUEsTUFDQSxzQkFBc0I7QUFBQSxNQUN0QixxQkFBcUIsSUFBSSxTQUFTLCtCQUErQiwwTEFBa007QUFBQSxNQUNuUSxNQUFNLENBQUMsY0FBYztBQUFBLElBQ3RCO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixzQkFBc0IsR0FBRztBQUFBLE1BQzNDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULHFCQUFxQixJQUFJLFNBQVMsaUNBQWlDLHVHQUF1RztBQUFBLElBQzNLO0FBQUEsSUFDQSxDQUFDLHVCQUF1QixHQUFHO0FBQUEsTUFDMUIsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsMEJBQTBCLDBHQUEwRztBQUFBLE1BQzlKLFNBQVM7QUFBQSxNQUNULE9BQU8sbUJBQW1CO0FBQUEsSUFDM0I7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHFCQUFxQixHQUFHO0FBQUEsTUFDMUMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsZ0NBQWdDLDRKQUE0SjtBQUFBLE1BQ3ROLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixpQ0FBaUMsR0FBRztBQUFBLE1BQ3RELE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLDRDQUE0Qyw4RUFBOEU7QUFBQSxNQUNwSixTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EscUNBQXFDO0FBQUEsTUFDcEMsTUFBTTtBQUFBLE1BQ04sT0FBTyxFQUFFLE1BQU0sU0FBUztBQUFBLE1BQ3hCLGFBQWEsSUFBSSxTQUFTLHFDQUFxQyxxV0FBcVc7QUFBQSxNQUNwYSxTQUFTLENBQUM7QUFBQSxNQUNWLFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLGdCQUFnQjtBQUFBLFFBQ2hCLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLHdEQUF3RCw2WkFBNlo7QUFBQSxVQUMxZTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsNkJBQTZCO0FBQUE7QUFBQSxNQUM1QixNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyw2QkFBNkIsdURBQXVEO0FBQUEsTUFDOUcsU0FBUztBQUFBLE1BQ1QsVUFBVTtBQUFBLE1BQ1YsTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHlCQUF5QixHQUFHO0FBQUEsTUFDOUMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsMkJBQTJCLGtIQUFrSDtBQUFBLE1BQ3ZLLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQix1QkFBdUIsR0FBRztBQUFBLE1BQzVDLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGdDQUFnQyx1RUFBdUU7QUFBQSxNQUNqSSxTQUFTO0FBQUEsSUFDVjtBQUFBLElBQ0EsQ0FBQyxrQkFBa0IsbUJBQW1CLEdBQUc7QUFBQSxNQUN4QyxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyw0QkFBNEIsb0dBQW9HO0FBQUEsTUFDMUosU0FBUztBQUFBLE1BQ1QsTUFBTSxDQUFDLFNBQVM7QUFBQSxJQUNqQjtBQUFBLElBQ0EscUNBQXFDO0FBQUEsTUFDcEMsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMscUNBQXFDLG9QQUFvUDtBQUFBLE1BQ25ULFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsTUFDckIsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsSUFDQSxDQUFDLGtCQUFrQixzQ0FBc0MsR0FBRztBQUFBLE1BQzNELE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLGdEQUFnRCxzQ0FBc0M7QUFBQSxNQUNoSCxxQkFBcUIsSUFBSSxTQUFTLG1EQUFtRCxrSEFBa0g7QUFBQSxNQUN2TSxTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxJQUNBLENBQUMsa0JBQWtCLDhCQUE4QixHQUFHO0FBQUEsTUFDbkQsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsb0RBQW9ELDhMQUE4TDtBQUFBLE1BQzVRLFNBQVM7QUFBQSxNQUNULE1BQU0sQ0FBQyxjQUFjO0FBQUEsSUFDdEI7QUFBQSxJQUNBLENBQUMsa0JBQWtCLDBDQUEwQyxHQUFHO0FBQUEsTUFDL0QsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLFNBQVM7QUFBQSxNQUNoQixhQUFhLElBQUksU0FBUyxpREFBaUQsMk9BQTJPO0FBQUEsTUFDdFQsU0FBUztBQUFBLElBQ1Y7QUFBQSxJQUNBLENBQUMsa0JBQWtCLHdDQUF3QyxHQUFHO0FBQUEsTUFDN0QsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLGNBQWM7QUFBQSxNQUNyQixhQUFhLElBQUksU0FBUywrQ0FBK0MsMExBQTBMO0FBQUEsTUFDblEsU0FBUztBQUFBLElBQ1Y7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUNELFNBQVMsR0FBd0IsaUJBQWlCLFVBQVUsRUFBRTtBQUFBLEVBQzdELHFCQUFxQjtBQUFBLElBQ3BCO0FBQUEsSUFDQSxnQkFBZ0I7QUFBQSxJQUNoQixJQUFJLFNBQVMsUUFBUSxNQUFNO0FBQUEsRUFDNUI7QUFBQSxFQUNBO0FBQUEsSUFDQyxJQUFJLGVBQWUsZUFBZTtBQUFBLEVBQ25DO0FBQ0Q7QUFDQSxTQUFTLEdBQXdCLGlCQUFpQixVQUFVLEVBQUU7QUFBQSxFQUM3RCxxQkFBcUI7QUFBQSxJQUNwQjtBQUFBLElBQ0EscUJBQXFCO0FBQUEsSUFDckIsSUFBSSxTQUFTLGFBQWEsWUFBWTtBQUFBLEVBQ3ZDO0FBQUEsRUFDQTtBQUFBLElBQ0MsSUFBSSxlQUFlLG9CQUFvQjtBQUFBLEVBQ3hDO0FBQ0Q7QUFDQSxTQUFTLEdBQXdCLGlCQUFpQixVQUFVLEVBQUU7QUFBQSxFQUM3RCxxQkFBcUI7QUFBQSxJQUNwQjtBQUFBLElBQ0Esa0JBQWtCO0FBQUEsSUFDbEIsSUFBSSxTQUFTLGVBQWUsY0FBYztBQUFBLEVBQzNDO0FBQUEsRUFDQTtBQUFBLElBQ0MsSUFBSSxlQUFlLHNCQUFzQjtBQUFBLEVBQzFDO0FBQ0Q7QUFDQSxTQUFTLG9CQUFvQixPQUFrRDtBQUM5RSxTQUFPLENBQUMsQ0FBQyxTQUFTLE9BQU8sVUFBVSxZQUFZLENBQUMsTUFBTSxRQUFRLEtBQUs7QUFDcEU7QUFFQSxTQUFTLGdDQUFnQyxPQUFxRDtBQUM3RixNQUFJLENBQUMsb0JBQW9CLEtBQUssS0FBSyxNQUFNLGNBQWMsb0JBQW9CLGFBQWE7QUFDdkYsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLEVBQUUsR0FBRyxPQUFPLFdBQVcsMkJBQTJCLFNBQVM7QUFDbkU7QUFFQSxTQUFTLEdBQW9DLFdBQVcsc0JBQXNCLEVBQUUsZ0NBQWdDO0FBQUEsRUFDL0c7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLFdBQVcsQ0FBQyxPQUFPLGNBQWU7QUFBQSxNQUNqQyxDQUFDLDJDQUEyQyxFQUFFLE9BQU8sT0FBVSxDQUFDO0FBQUEsTUFDaEUsQ0FBQyxrQkFBa0Isc0JBQXNCLEVBQUUsT0FBTyxnQ0FBZ0MsS0FBSyxLQUFLLE1BQU0sQ0FBQztBQUFBLElBQ3BHO0FBQUEsRUFDRDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUssa0JBQWtCO0FBQUEsSUFDdkIsV0FBVyxZQUFVLEVBQUUsT0FBTyxnQ0FBZ0MsS0FBSyxLQUFLLE1BQU07QUFBQSxFQUMvRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLFdBQVcsQ0FBQyxPQUFPLGFBQWE7QUFDL0IsWUFBTSxRQUFvQyxDQUFDLENBQUMsMkNBQTJDLEVBQUUsT0FBTyxPQUFVLENBQUMsQ0FBQztBQUM1RyxVQUFJLFNBQVMsa0JBQWtCLDBCQUEwQixNQUFNLFFBQVc7QUFDekUsY0FBTSxLQUFLLENBQUMsa0JBQWtCLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDckU7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxXQUFXLENBQUMsT0FBTyxjQUFlO0FBQUEsTUFDakMsQ0FBQywrQ0FBK0MsRUFBRSxPQUFPLE9BQVUsQ0FBQztBQUFBLE1BQ3BFLENBQUMsa0NBQWtDLEVBQUUsT0FBTyxVQUFVLE1BQU0sQ0FBQztBQUFBLElBQzlEO0FBQUEsRUFDRDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLFdBQVcsQ0FBQyxPQUFnQixrQkFBa0I7QUFDN0MsWUFBTSxTQUFxQyxDQUFDLENBQUMseUNBQXlDLEVBQUUsT0FBTyxPQUFVLENBQUMsQ0FBQztBQUMzRyxVQUFJLE9BQU8sVUFBVSxhQUFhLGNBQWMsa0JBQWtCLHVCQUF1QixNQUFNLFFBQVc7QUFDekcsZUFBTyxLQUFLLENBQUMsa0JBQWtCLHlCQUF5QixFQUFFLE9BQU8sUUFBUSx3QkFBd0IsVUFBVSx3QkFBd0IsS0FBSyxDQUFDLENBQUM7QUFBQSxNQUMzSTtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLFdBQVcsQ0FBQyxPQUFPLGNBQWU7QUFBQSxNQUNqQyxDQUFDLHdCQUF3QixFQUFFLE9BQU8sT0FBVSxDQUFDO0FBQUEsTUFDN0MsQ0FBQyx1QkFBdUIsRUFBRSxNQUFNLENBQUM7QUFBQSxJQUNsQztBQUFBLEVBQ0Q7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxXQUFXLENBQUMsVUFBbUI7QUFDOUIsVUFBSSxPQUFPLFVBQVUsV0FBVztBQUMvQixlQUFPLEVBQUUsT0FBTyxPQUFPLFlBQVksb0JBQW9CLElBQUksT0FBSyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUFBLE1BQzlFO0FBRUEsYUFBTyxFQUFFLE1BQU07QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLLGtCQUFrQjtBQUFBLElBQ3ZCLFdBQVcsQ0FBQyxVQUFtQjtBQUM5QixVQUFJLFVBQVUsTUFBTTtBQUNuQixlQUFPLEVBQUUsT0FBTyxxQkFBcUIsaUJBQWlCO0FBQUEsTUFDdkQsV0FBVyxVQUFVLE9BQU87QUFDM0IsZUFBTyxFQUFFLE9BQU8scUJBQXFCLElBQUk7QUFBQSxNQUMxQztBQUNBLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSyxrQkFBa0I7QUFBQSxJQUN2QixXQUFXLENBQUMsVUFBbUI7QUFDOUIsVUFBSSxVQUFVLE1BQU07QUFDbkIsZUFBTyxFQUFFLE9BQU8scUJBQXFCLGlCQUFpQjtBQUFBLE1BQ3ZELFdBQVcsVUFBVSxPQUFPO0FBQzNCLGVBQU8sRUFBRSxPQUFPLHFCQUFxQixJQUFJO0FBQUEsTUFDMUM7QUFDQSxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLFdBQVcsQ0FBQyxPQUFnQixjQUFlO0FBQUEsTUFDMUMsQ0FBQyxzQkFBc0IsRUFBRSxPQUFPLE9BQVUsQ0FBQztBQUFBLE1BQzNDLENBQUMsa0JBQWtCLGlCQUFpQixFQUFFLE1BQU0sQ0FBQztBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBQ0E7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFNQyxLQUFLO0FBQUEsSUFDTCxXQUFXLENBQUMsT0FBZ0IsYUFBYTtBQUN4QyxZQUFNLGlCQUFpQjtBQUFBLFFBQ3RCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFdBQVksT0FBTyxVQUFVLFlBQVksZUFBZSxTQUFTLEtBQUssSUFDekUsb0NBQ0E7QUFDSCxZQUFNLFFBQW9DLENBQUMsQ0FBQywyQkFBMkIsRUFBRSxPQUFPLE9BQVUsQ0FBQyxDQUFDO0FBRzVGLFVBQUksU0FBUyxpQkFBaUIsTUFBTSxRQUFXO0FBQzlDLGNBQU0sS0FBSyxDQUFDLG1CQUFtQixFQUFFLE9BQU8sU0FBUyxDQUFDLENBQUM7QUFBQSxNQUNwRDtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBQ0E7QUFBQTtBQUFBO0FBQUEsSUFHQyxLQUFLO0FBQUEsSUFDTCxXQUFXLFlBQVU7QUFBQSxNQUNwQixPQUFPLFVBQVUsc0NBQ2Qsb0NBQ0E7QUFBQSxJQUNKO0FBQUEsRUFDRDtBQUFBLEVBQ0E7QUFBQTtBQUFBO0FBQUEsSUFHQyxLQUFLO0FBQUEsSUFDTCxXQUFXLENBQUMsT0FBZ0IsYUFBYTtBQUN4QyxZQUFNLFFBQW9DLENBQUMsQ0FBQyw2QkFBNkIsRUFBRSxPQUFPLE9BQVUsQ0FBQyxDQUFDO0FBQzlGLFVBQUksU0FBUyxtQkFBbUIsTUFBTSxRQUFXO0FBQ2hELGNBQU0sS0FBSyxDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDNUM7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUNBO0FBQUE7QUFBQTtBQUFBLElBR0MsS0FBSztBQUFBLElBQ0wsV0FBVyxNQUFPLENBQUMsQ0FBQywwQkFBMEIsRUFBRSxPQUFPLE9BQVUsQ0FBQyxDQUFDO0FBQUEsRUFDcEU7QUFDRCxDQUFDO0FBRUQsSUFBTSwyQkFBTixjQUF1QyxXQUFXO0FBQUEsRUFNakQsWUFDdUIscUJBQ21CLHVCQUNELHNCQUN2QztBQUNELFVBQU07QUFIbUM7QUFDRDtBQUx6QyxTQUFpQix1QkFBdUIsS0FBSyxVQUFVLElBQUksY0FBc0IsQ0FBQztBQVNqRixTQUFLLGdCQUFnQixRQUFRLGdCQUFnQjtBQUM3QyxTQUFLLGdCQUFnQixRQUFRLHNCQUFzQjtBQUVuRCxTQUFLLFVBQVUsb0JBQW9CLGtDQUFrQyxDQUFDLE1BQU07QUFDM0UsaUJBQVcsVUFBVSxFQUFFLE9BQU87QUFDN0IsYUFBSyxnQkFBZ0IsTUFBTTtBQUFBLE1BQzVCO0FBQ0EsaUJBQVcsVUFBVSxFQUFFLFNBQVM7QUFDL0IsYUFBSyxxQkFBcUIsaUJBQWlCLE1BQU07QUFBQSxNQUNsRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsZUFBVyxVQUFVLG9CQUFvQiwwQkFBMEIsR0FBRztBQUNyRSxXQUFLLGdCQUFnQixNQUFNO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsUUFBc0I7QUFDN0MsU0FBSyxxQkFBcUIsSUFBSSxRQUFRLEtBQUssc0JBQXNCO0FBQUEsTUFBZSxHQUFHLE1BQU07QUFBQSxNQUN4RjtBQUFBLFFBQ0MsSUFBSSxnQkFBZ0I7QUFBQSxRQUNwQixPQUFPLElBQUksU0FBUyxRQUFRLE1BQU07QUFBQSxRQUNsQyxVQUFVLHlCQUF5QjtBQUFBLE1BQ3BDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsbUJBQW1CO0FBQUEsUUFDbkIsb0JBQW9CLGNBQVksU0FBUyxXQUFXO0FBQUEsTUFDckQ7QUFBQSxNQUNBO0FBQUEsUUFDQyxtQkFBbUIsQ0FBQyxFQUFFLFVBQVUsUUFBUSxNQUFNO0FBQzdDLGlCQUFPO0FBQUEsWUFDTixRQUFRLEtBQUsscUJBQXFCLGVBQWUsaUJBQWlCLFVBQVUsT0FBNkI7QUFBQSxZQUN6RztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQW5ETSx5QkFFVyxLQUFLO0FBRmhCLDJCQUFOO0FBQUEsRUFPRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FURztBQXFETixJQUFNLCtCQUFOLGNBQTJDLFdBQTZDO0FBQUEsRUFJdkYsWUFDcUMsa0JBQ00sd0JBQ3pDO0FBQ0QsVUFBTTtBQUg4QjtBQUNNO0FBSTFDLFNBQUssdUJBQXVCO0FBRTVCLFNBQUssVUFBVSxLQUFLLHVCQUF1Qix1QkFBdUIsTUFBTTtBQUN2RSxXQUFLLHVCQUF1QjtBQUFBLElBQzdCLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLHlCQUErQjtBQUN0QyxVQUFNLG9CQUFvQixLQUFLLHVCQUF1QjtBQUN0RCxRQUFJLG1CQUFtQjtBQUV0QixXQUFLLGlCQUFpQixrQkFBa0IsNEJBQTRCLGlCQUFpQjtBQUFBLElBQ3RGO0FBRUEsUUFBSSxLQUFLLHVCQUF1QixZQUFZO0FBQzNDLFdBQUssaUJBQWlCLGtCQUFrQix1QkFBdUIsSUFBSTtBQUFBLElBQ3BFO0FBQUEsRUFDRDtBQUNEO0FBNUJNLDZCQUVXLEtBQUs7QUFGaEIsK0JBQU47QUFBQSxFQUtHO0FBQUEsRUFDQTtBQUFBLEdBTkc7QUE4Qk4sSUFBTSxnQ0FBTixNQUFzRTtBQUFBLEVBSXJFLFlBQ3lCLHVCQUN2QjtBQUNELDBCQUFzQjtBQUFBLE1BQ3JCLEdBQUcscUJBQXFCLFNBQVMsTUFBTTtBQUFBLE1BQ3ZDO0FBQUEsUUFDQyxJQUFJLHFCQUFxQjtBQUFBLFFBQ3pCLE9BQU8sSUFBSSxTQUFTLGFBQWEsWUFBWTtBQUFBLFFBQzdDLFVBQVUseUJBQXlCO0FBQUEsTUFDcEM7QUFBQSxNQUNBO0FBQUEsUUFDQyxtQkFBbUI7QUFBQSxRQUNuQixvQkFBb0IsY0FBWSxTQUFTLFdBQVcscUJBQXFCLFNBQVM7QUFBQSxNQUNuRjtBQUFBLE1BQ0E7QUFBQSxRQUNDLG1CQUFtQixNQUFNO0FBQ3hCLGlCQUFPO0FBQUEsWUFDTixRQUFRLHFCQUFxQjtBQUFBLFlBQzdCLFNBQVMsRUFBRSxRQUFRLEtBQUs7QUFBQSxVQUN6QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQTVCTSw4QkFFVyxLQUFLO0FBRmhCLGdDQUFOO0FBQUEsRUFLRztBQUFBLEdBTEc7QUE4Qk4sSUFBTSwrQkFBTixjQUEyQyxXQUE2QztBQUFBLEVBS3ZGLFlBQytDLG1CQUNKLG9CQUNMLG1CQUNwQztBQUNELFVBQU07QUFKd0M7QUFDSjtBQUNMO0FBR3JDLFNBQUssOEJBQThCLGdCQUFnQiw0QkFBNEIsT0FBTyxLQUFLLGlCQUFpQjtBQUM1RyxTQUFLLDJCQUEyQjtBQUNoQyxTQUFLLDBCQUEwQjtBQUMvQixTQUFLLDJCQUEyQjtBQUFBLEVBQ2pDO0FBQUEsRUFHUSw2QkFBbUM7QUFDMUMsUUFBSTtBQUNKLFVBQU0sNkJBQTZCLE1BQU07QUFDeEMsWUFBTSxjQUFjLEtBQUssbUJBQW1CLGdCQUFnQixnQkFBZ0IsT0FDM0UsNkJBQ0E7QUFDRCxXQUFLLGtCQUFrQixhQUFxQixXQUFXLEVBQUUsS0FBSyxDQUFDLFVBQVU7QUFDeEUsY0FBTSxPQUEyQjtBQUFBLFVBQ2hDLElBQUk7QUFBQSxVQUNKLE9BQU8sSUFBSSxTQUFTLHdDQUF3QyxNQUFNO0FBQUEsVUFDbEUsTUFBTTtBQUFBLFVBQ04sWUFBWTtBQUFBLFlBQ1gsMEJBQTBCO0FBQUEsY0FDekIsTUFBTTtBQUFBLGNBQ04scUJBQXFCLElBQUksU0FBUywwQkFBMEIsbUlBQW1JO0FBQUEsY0FDL0wsU0FBUyxTQUFTO0FBQUEsY0FDbEIsT0FBTztBQUFBLGNBQ1AsY0FBYyxFQUFFLFNBQVMsSUFBSztBQUFBLFlBQy9CO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFDQSw4QkFBc0IscUJBQXFCLEVBQUUsUUFBUSxXQUFXLENBQUMsUUFBUSxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUM7QUFDOUYsbUJBQVc7QUFBQSxNQUNaLENBQUM7QUFBQSxJQUNGO0FBQ0EsU0FBSyxVQUFVLE1BQU0sZ0JBQWdCLE1BQU0sU0FBUyxLQUFLLG1CQUFtQix3QkFBd0IsTUFBTTtBQUFBLElBQUUsR0FBRyxHQUFJLEdBQUcsTUFBTSwyQkFBMkIsQ0FBQyxDQUFDO0FBQUEsRUFDMUo7QUFBQSxFQUVRLDRCQUFrQztBQUN6QyxTQUFLLGtCQUFrQixhQUFxQixtQkFBbUIsRUFBRSxLQUFLLENBQUMsVUFBVTtBQUNoRixZQUFNLGtCQUFrQixDQUFDLFdBQVcsZUFBZSxTQUFTO0FBQzVELFVBQUksT0FBTyxVQUFVLFlBQVksZ0JBQWdCLFNBQVMsS0FBSyxHQUFHO0FBQ2pFLGFBQUssNEJBQTRCLElBQUksS0FBSztBQUFBLE1BQzNDLE9BQU87QUFDTixhQUFLLDRCQUE0QixNQUFNO0FBQUEsTUFDeEM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSw2QkFBbUM7QUFDMUMsU0FBSyxrQkFBa0IsYUFBcUIsMkJBQTJCLEVBQUUsS0FBSyxXQUFTO0FBQ3RGLFlBQU0sT0FBMkI7QUFBQSxRQUNoQyxJQUFJO0FBQUEsUUFDSixPQUFPLElBQUksU0FBUyx3Q0FBd0MsTUFBTTtBQUFBLFFBQ2xFLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxVQUNYLENBQUMsa0JBQWtCLHFCQUFxQixHQUFHO0FBQUEsWUFDMUMsTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMsK0JBQStCLDJGQUEyRjtBQUFBLFlBQ3BKLFNBQVMsT0FBTyxVQUFVLFdBQVcsUUFBUTtBQUFBLFVBQzlDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSw0QkFBc0IscUJBQXFCLEVBQUUsS0FBSyxDQUFDLElBQUksR0FBRyxRQUFRLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDdkUsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTFFTSw2QkFFVyxLQUFLO0FBRmhCLCtCQUFOO0FBQUEsRUFNRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FSRztBQTRFTixJQUFNLHlDQUFOLGNBQXFELFdBQTZDO0FBQUEsRUFNakcsWUFDc0MsbUJBQ0EsbUJBQ0wsY0FDL0I7QUFDRCxVQUFNO0FBSitCO0FBQ0E7QUFDTDtBQUdoQyxTQUFLLG1DQUFtQyxnQkFBZ0IsdUJBQXVCLE9BQU8sS0FBSyxpQkFBaUI7QUFFNUcsU0FBSyxVQUFVLEtBQUssa0JBQWtCLGVBQWUsTUFBTTtBQUMxRCxXQUFLLDZCQUE2QjtBQUFBLElBQ25DLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxLQUFLLGtCQUFrQiw0QkFBNEIsTUFBTTtBQUN2RSxXQUFLLDZCQUE2QjtBQUFBLElBQ25DLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxNQUFNLE9BQU8sS0FBSyxhQUFhLDJCQUEyQixPQUFLLEVBQUUsT0FBTyxVQUFVLEVBQUUsTUFBTTtBQUN4RyxXQUFLLDZCQUE2QjtBQUFBLElBQ25DLENBQUMsQ0FBQztBQUVGLFNBQUssNkJBQTZCO0FBQUEsRUFDbkM7QUFBQSxFQUVRLCtCQUFxQztBQUM1QyxRQUFJLFFBQVEsS0FBSyxhQUFhLGNBQWMsVUFBVSxJQUFJLElBQUk7QUFFOUQsZUFBVyxVQUFVLEtBQUssa0JBQWtCLHNCQUFzQixrQkFBa0IsSUFBSSxHQUFHO0FBQzFGLFVBQUksQ0FBQyxPQUFPLFNBQVM7QUFDcEI7QUFBQSxNQUNEO0FBRUEsVUFBSSx1QkFBdUIsT0FBTyxXQUFXLEdBQUc7QUFDL0M7QUFBQSxNQUNEO0FBRUEsVUFBSSwyQkFBMkIsT0FBTyxXQUFXLEtBQUssT0FBTyxZQUFZLGFBQWE7QUFDckY7QUFBQSxNQUNEO0FBRUE7QUFBQSxJQUNEO0FBRUEsU0FBSyxpQ0FBaUMsSUFBSSxLQUFLO0FBQUEsRUFDaEQ7QUFDRDtBQWxETSx1Q0FFVyxLQUFLO0FBRmhCLHlDQUFOO0FBQUEsRUFPRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FURztBQTBETixTQUFTLDhCQUE4QixjQUFvQyxhQUFnRDtBQUMxSCxRQUFNLGdCQUFnQixvQkFBSSxJQUFZO0FBQ3RDLFFBQU0sZUFBZSxJQUFJLElBQUksYUFBYSxJQUFJLFVBQVEsS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQ3RFLFFBQU0saUJBQWlCLG9CQUFJLElBQW9CO0FBRS9DLGFBQVcsUUFBUSxhQUFhO0FBQy9CLFVBQU0sV0FBVyxLQUFLLEtBQUssSUFBSTtBQUcvQixRQUFJLGFBQWEsSUFBSSxRQUFRLEdBQUc7QUFDL0I7QUFBQSxJQUNEO0FBR0EsVUFBTSxhQUFhLGVBQWUsSUFBSSxRQUFRO0FBQzlDLFFBQUksWUFBWTtBQUNmLG9CQUFjLE9BQU8sVUFBVTtBQUFBLElBQ2hDO0FBRUEsbUJBQWUsSUFBSSxVQUFVLEtBQUssRUFBRTtBQUNwQyxrQkFBYyxJQUFJLEtBQUssRUFBRTtBQUFBLEVBQzFCO0FBRUEsU0FBTztBQUNSO0FBS0EsSUFBTSwrQkFBTixjQUEyQyxXQUE2QztBQUFBLEVBTXZGLFlBQ21CLGtCQUNtQixtQkFDcEM7QUFDRCxVQUFNO0FBRitCO0FBSnRDLFNBQWlCLHlCQUF5QixJQUFJLGNBQXNCO0FBT25FLFNBQUssT0FBTyxJQUFJLEtBQUssc0JBQXNCO0FBRTNDLFVBQU0sZ0JBQWdCLG9CQUFvQixNQUFNLEtBQUssa0JBQWtCLDJCQUEyQixNQUFNLEtBQUssa0JBQWtCLGlCQUFpQjtBQUNoSixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sWUFBWSxjQUFjLEtBQUssTUFBTSxHQUFHLE1BQU0sb0JBQW9CLEtBQUssTUFBTTtBQUNuRixXQUFLLGlCQUFpQixTQUFTO0FBQUEsSUFDaEMsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsaUJBQWlCLFdBQXlDO0FBQ2pFLFFBQUksQ0FBQyxXQUFXO0FBQ2YsV0FBSyx1QkFBdUIsbUJBQW1CO0FBQy9DO0FBQUEsSUFDRDtBQUVBLFVBQU0sRUFBRSxTQUFTLE9BQU8sSUFBSTtBQUM1QixVQUFNLGlCQUFpQiw4QkFBOEIsU0FBUyxNQUFNO0FBR3BFLGVBQVcsVUFBVSxLQUFLLHVCQUF1QixLQUFLLEdBQUc7QUFDeEQsVUFBSSxDQUFDLGVBQWUsSUFBSSxNQUFNLEdBQUc7QUFDaEMsYUFBSyx1QkFBdUIsaUJBQWlCLE1BQU07QUFBQSxNQUNwRDtBQUFBLElBQ0Q7QUFHQSxlQUFXLFFBQVEsUUFBUTtBQUMxQixVQUFJLGVBQWUsSUFBSSxLQUFLLEVBQUUsS0FBSyxDQUFDLEtBQUssdUJBQXVCLElBQUksS0FBSyxFQUFFLEdBQUc7QUFDN0UsYUFBSyxvQkFBb0IsSUFBSTtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFvQixNQUF1QjtBQUNsRCxVQUFNLGNBQWMsY0FBYyx5QkFBeUI7QUFBQSxNQUMxRCxjQUFjO0FBQ2IsY0FBTSxJQUFJO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFDQSxTQUFLLHVCQUF1QixJQUFJLEtBQUssSUFBSSxnQkFBZ0IsV0FBVyxDQUFDO0FBQUEsRUFDdEU7QUFDRDtBQXBETSw2QkFFVyxLQUFLO0FBRmhCLCtCQUFOO0FBQUEsRUFPRztBQUFBLEVBQ0E7QUFBQSxHQVJHO0FBc0ROLElBQU0sb0NBQU4sY0FBZ0QsV0FBNkM7QUFBQSxFQU01RixZQUN5Qyx1QkFDVCxjQUM5QjtBQUNELFVBQU07QUFIa0M7QUFDVDtBQUpoQyxTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFPckUsU0FBSyxvQkFBb0I7QUFDekIsU0FBSyxVQUFVLEtBQUssc0JBQXNCLHlCQUF5QixPQUFLO0FBQ3ZFLFVBQUksRUFBRSxxQkFBcUIsY0FBYyxrQkFBa0IsR0FBRztBQUM3RCxhQUFLLG9CQUFvQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFjLHNCQUFxQztBQUNsRCxTQUFLLGVBQWUsTUFBTTtBQUUxQixVQUFNLFVBQVUsY0FBYyxvQkFBb0IsS0FBSyx1QkFBdUIsWUFBWSxJQUFJO0FBQzlGLFVBQU0sY0FBYyxNQUFNLEtBQUssYUFBYSxTQUFTO0FBQ3JELFVBQU0sV0FBVyxZQUFZLFVBQVUsWUFBWTtBQUVuRCxlQUFXLFVBQVUsU0FBUztBQUU3QixVQUFJLE9BQU8sV0FBVyxpQkFBaUIsbUJBQW1CLE9BQU8sV0FBVyxpQkFBaUIsd0JBQXdCLE9BQU8sV0FBVyxpQkFBaUIsZ0JBQWdCO0FBQ3ZLO0FBQUEsTUFDRDtBQUdBLFlBQU0sZUFBZSxZQUFZLE9BQU8sSUFBSSxJQUN6QyxXQUFXLE9BQU8sS0FBSyxVQUFVLENBQUMsSUFDbEMsT0FBTztBQUdWLFlBQU0sT0FBTyxhQUFhLFlBQVksRUFBRSxTQUFTLE9BQU8sSUFDckQsZUFDQSxHQUFHLFlBQVk7QUFFbEIsV0FBSyxlQUFlO0FBQUEsUUFDbkIseUJBQXlCLDBCQUEwQixpQkFBaUIsSUFBSTtBQUFBLE1BQ3pFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQS9DTSxrQ0FFVyxLQUFLO0FBRmhCLG9DQUFOO0FBQUEsRUFPRztBQUFBLEVBQ0E7QUFBQSxHQVJHO0FBaUROLElBQU0saUNBQU4sY0FBNkMsV0FBNkM7QUFBQSxFQUl6RixZQUM4Qyw0QkFDNUM7QUFDRCxVQUFNO0FBRnVDO0FBRzdDLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssVUFBVSxLQUFLLDJCQUEyQixpQkFBaUIsTUFBTSxLQUFLLDBCQUEwQixDQUFDLENBQUM7QUFBQSxFQUN4RztBQUFBLEVBRVEsNEJBQWtDO0FBQ3pDLFVBQU0sUUFDTCxNQUFNLEtBQUssS0FBSywyQkFBMkIsNkJBQTZCLENBQUMsRUFDdkUsT0FBTyxDQUFDLFNBQThELE9BQU8sS0FBSyxzQkFBc0IsUUFBUSxFQUNoSCxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsa0JBQWtCLGNBQWMsRUFBRSxpQkFBaUIsQ0FBQztBQUN4RSxnQ0FBNEIsU0FBUztBQUNyQyxzQ0FBa0MsU0FBUztBQUMzQyxlQUFXLFFBQVEsT0FBTztBQUN6QixrQ0FBNEIsS0FBSyxLQUFLLGlCQUFpQjtBQUN2RCx3Q0FBa0MsS0FBSyxJQUFJO0FBQUEsUUFDMUM7QUFBQSxRQUNBO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTCxLQUFLLG1CQUFtQixLQUFLO0FBQUEsTUFDOUIsQ0FBQztBQUFBLElBQ0Y7QUFDQSwwQkFBc0IsaUNBQWlDO0FBQUEsTUFDdEQsSUFBSTtBQUFBLE1BQ0osWUFBWTtBQUFBLFFBQ1gsQ0FBQyxrQkFBa0IsdUJBQXVCLEdBQUcsQ0FBQztBQUFBLE1BQy9DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBbkNNLCtCQUVXLEtBQUs7QUFGaEIsaUNBQU47QUFBQSxFQUtHO0FBQUEsR0FMRztBQTJDTixJQUFNLG1DQUFOLE1BQXlFO0FBQUEsRUFJeEUsWUFDMkIsMEJBQ3pCO0FBQUEsRUFFRjtBQUNEO0FBVE0saUNBRVcsS0FBSztBQUZoQixtQ0FBTjtBQUFBLEVBS0c7QUFBQSxHQUxHO0FBV04sdUJBQXVCLFNBQVMsSUFBSSxpQ0FBaUMsQ0FBQztBQUN0RSx1QkFBdUIsU0FBUyxJQUFJLDJCQUEyQixDQUFDO0FBQ2hFLHVCQUF1QixTQUFTLElBQUksMkJBQTJCLENBQUM7QUFDaEUsdUJBQXVCLFNBQVMsSUFBSSwyQkFBMkIsQ0FBQztBQUNoRSx1QkFBdUIsU0FBUyxJQUFJLDJCQUEyQixDQUFDO0FBQ2hFLHVCQUF1QixTQUFTLElBQUksMkJBQTJCLENBQUM7QUFFaEUsc0JBQXNCLDJCQUEyQjtBQUNqRCxTQUFTLEdBQTJCLGlCQUFpQixhQUFhLEVBQUUseUJBQXlCLGdCQUFnQixRQUFRLHlCQUF5QjtBQUM5SSxTQUFTLEdBQTJCLGlCQUFpQixhQUFhLEVBQUUseUJBQXlCLHFCQUFxQixJQUFJLDhCQUE4QjtBQUVwSiwrQkFBK0IsNkJBQTZCLElBQUksOEJBQThCLGVBQWUsWUFBWTtBQUN6SCwrQkFBK0IsaUNBQWlDLElBQUksa0NBQWtDLGVBQWUsWUFBWTtBQUNqSSwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsWUFBWTtBQUNqSCwrQkFBK0IsOEJBQThCLElBQUksK0JBQStCLGVBQWUsWUFBWTtBQUMzSCwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsWUFBWTtBQUNqSCwrQkFBK0IsK0JBQStCLElBQUksZ0NBQWdDLGVBQWUsWUFBWTtBQUM3SCwrQkFBK0IsbUNBQW1DLElBQUksb0NBQW9DLGVBQWUsWUFBWTtBQUNySSwrQkFBK0IsOEJBQThCLElBQUksK0JBQStCLGVBQWUsVUFBVTtBQUN6SCwrQkFBK0IsMkNBQTJDLElBQUksNENBQTRDLGVBQWUsVUFBVTtBQUNuSiwrQkFBK0IsbUJBQW1CLElBQUksb0JBQW9CLGVBQWUsYUFBYTtBQUV0RywrQkFBK0IsMEJBQTBCLElBQUksMkJBQTJCLGVBQWUsWUFBWTtBQUNuSCwrQkFBK0Isd0NBQXdDLElBQUkseUNBQXlDLGVBQWUsWUFBWTtBQUMvSSwrQkFBK0IscUNBQXFDLElBQUksc0NBQXNDLGVBQWUsWUFBWTtBQUN6SSwrQkFBK0IsMEJBQTBCLElBQUksMkJBQTJCLGVBQWUsVUFBVTtBQUNqSCwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsWUFBWTtBQUNqSCwrQkFBK0Isd0JBQXdCLElBQUkseUJBQXlCLGVBQWUsWUFBWTtBQUMvRywrQkFBK0IsZ0NBQWdDLElBQUksaUNBQWlDLGVBQWUsVUFBVTtBQUM3SCwrQkFBK0Isd0JBQXdCLElBQUkseUJBQXlCLGVBQWUsWUFBWTtBQUMvRywrQkFBK0IsK0JBQStCLElBQUksZ0NBQWdDLGVBQWUsVUFBVTtBQUMzSCwrQkFBK0Isc0JBQXNCLElBQUksdUJBQXVCLGVBQWUsWUFBWTtBQUMzRywrQkFBK0Isa0NBQWtDLElBQUksbUNBQW1DLGVBQWUsYUFBYTtBQUNwSSwrQkFBK0Isa0NBQWtDLElBQUksbUNBQW1DLGVBQWUsYUFBYTtBQUNwSSwrQkFBK0IsMEJBQTBCLElBQUksMkJBQTJCLGVBQWUsWUFBWTtBQUNuSCwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsYUFBYTtBQUNsSCwrQkFBK0IsbUJBQW1CLElBQUksb0JBQW9CLGVBQWUsWUFBWTtBQUNyRywrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsVUFBVTtBQUMvRywrQkFBK0IsMkJBQTJCLElBQUksNEJBQTRCLGVBQWUsVUFBVTtBQUNuSCwrQkFBK0IsdUJBQXVCLElBQUksd0JBQXdCLGVBQWUsWUFBWTtBQUM3RywrQkFBK0IsdUJBQXVCLElBQUksd0JBQXdCLGVBQWUsWUFBWTtBQUM3RywrQkFBK0IsNkJBQTZCLElBQUksOEJBQThCLGVBQWUsYUFBYTtBQUMxSCwrQkFBK0IsdUNBQXVDLElBQUksd0NBQXdDLGVBQWUsYUFBYTtBQUM5SSwrQkFBK0IsNkJBQTZCLElBQUksOEJBQThCLGVBQWUsVUFBVTtBQUN2SCwrQkFBK0Isa0NBQWtDLElBQUksbUNBQW1DLGVBQWUsYUFBYTtBQUNwSSwrQkFBK0IsK0JBQStCLElBQUksZ0NBQWdDLGVBQWUsYUFBYTtBQUM5SCwrQkFBK0Isd0JBQXdCLElBQUkseUJBQXlCLGVBQWUsVUFBVTtBQUM3RywrQkFBK0IsK0JBQStCLElBQUksZ0NBQWdDLGVBQWUsYUFBYTtBQUM5SCwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsWUFBWTtBQUNqSCwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsYUFBYTtBQUNsSCwrQkFBK0IsNkJBQTZCLElBQUksOEJBQThCLGVBQWUsYUFBYTtBQUMxSCwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsWUFBWTtBQUNqSCwrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsYUFBYTtBQUNsSCwrQkFBK0IsaUJBQWlCLElBQUksa0JBQWtCLGVBQWUsWUFBWTtBQUNqRywrQkFBK0IsaUJBQWlCLElBQUksa0JBQWtCLGVBQWUsWUFBWTtBQUNqRywrQkFBK0IsNkNBQTZDLElBQUksOENBQThDLGVBQWUsWUFBWTtBQUN6SiwrQkFBK0IsMENBQTBDLElBQUksMkNBQTJDLGVBQWUsYUFBYTtBQUNwSiwrQkFBK0IsMEJBQTBCLElBQUksMkJBQTJCLGVBQWUsVUFBVTtBQUNqSCwrQkFBK0IsK0JBQStCLElBQUksZ0NBQWdDLGVBQWUsVUFBVTtBQUMzSCwrQkFBK0IsbUJBQW1CLElBQUksb0JBQW9CLGVBQWUsYUFBYTtBQUN0RywrQkFBK0IseUJBQXlCLElBQUksMEJBQTBCLGVBQWUsVUFBVTtBQUMvRywrQkFBK0IsMkJBQTJCLElBQUksNEJBQTRCLGVBQWUsVUFBVTtBQUNuSCwrQkFBK0IsaUJBQWlCLElBQUksa0JBQWtCLGVBQWUsVUFBVTtBQUMvRiwrQkFBK0IsMENBQTBDLElBQUksMkNBQTJDLGVBQWUsYUFBYTtBQUVwSixvQkFBb0I7QUFDcEIsaUNBQWlDO0FBQ2pDLHdCQUF3QjtBQUN4QixzQ0FBc0M7QUFDdEMsNkJBQTZCO0FBQzdCLG9DQUFvQztBQUNwQyw0QkFBNEI7QUFDNUIsb0NBQW9DO0FBQ3BDLHlCQUF5QjtBQUN6QiwyQkFBMkI7QUFDM0IsZ0JBQWdCLHdCQUF3QjtBQUN4QyxnQkFBZ0Isb0NBQW9DO0FBQ3BELHNDQUFzQztBQUN0QyxnQ0FBZ0M7QUFDaEMsMkNBQTJDO0FBQzNDLHlCQUF5QjtBQUN6Qix5QkFBeUI7QUFDekIsMEJBQTBCO0FBQzFCLG9CQUFvQjtBQUNwQix1QkFBdUI7QUFDdkIsMkJBQTJCO0FBQzNCLDZCQUE2QjtBQUM3QiwwQkFBMEI7QUFDMUIsK0JBQStCO0FBQy9CLHdCQUF3QjtBQUN4Qiw2QkFBNkI7QUFDN0IsMEJBQTBCO0FBQzFCLGdCQUFnQixpQkFBaUI7QUFDakMsc0JBQXNCLHlCQUF5QjtBQUUvQyw2QkFBNkIsU0FBUyxJQUFJLGVBQWUsOEJBQThCLEdBQUcsNkJBQTZCLFVBQVU7QUFDakksNkJBQTZCLFNBQVMsSUFBSSxlQUFlLCtCQUErQixHQUFHLDZCQUE2QixXQUFXO0FBQ25JLDZCQUE2QixTQUFTLElBQUksZUFBZSw2QkFBNkIsR0FBRyw2QkFBNkIsU0FBUztBQUMvSCw2QkFBNkIsU0FBUyxJQUFJLGVBQWUsOEJBQThCLEdBQUcsNkJBQTZCLFVBQVU7QUFFakksa0JBQWtCLHlDQUF5Qyx3Q0FBd0Msa0JBQWtCLE9BQU87QUFDNUgsa0JBQWtCLDBCQUEwQix5QkFBeUIsa0JBQWtCLEtBQUs7QUFDNUYsa0JBQWtCLHNCQUFzQixxQkFBcUIsa0JBQWtCLE9BQU87QUFDdEYsa0JBQWtCLGNBQWMsYUFBYSxrQkFBa0IsT0FBTztBQUN0RSxrQkFBa0Isb0JBQW9CLG1CQUFtQixrQkFBa0IsT0FBTztBQUNsRixrQkFBa0Isc0JBQXNCLHFCQUFxQixrQkFBa0IsT0FBTztBQUN0RixrQkFBa0IsaUJBQWlCLGdCQUFnQixrQkFBa0IsT0FBTztBQUM1RSxrQkFBa0IsbUJBQW1CLGtCQUFrQixrQkFBa0IsT0FBTztBQUNoRixrQkFBa0IsMkJBQTJCLDBCQUEwQixrQkFBa0IsT0FBTztBQUNoRyxrQkFBa0IsMkJBQTJCLDBCQUEwQixrQkFBa0IsT0FBTztBQUNoRyxrQkFBa0IscUNBQXFDLG9DQUFvQyxrQkFBa0IsT0FBTztBQUNwSCxrQkFBa0Isd0JBQXdCLHVCQUF1QixrQkFBa0IsT0FBTztBQUMxRixrQkFBa0IsNEJBQTRCLDJCQUEyQixrQkFBa0IsT0FBTztBQUNsRyxrQkFBa0IsMEJBQTBCLHlCQUF5QixrQkFBa0IsT0FBTztBQUM5RixrQkFBa0IsbUJBQW1CLGtCQUFrQixrQkFBa0IsT0FBTztBQUNoRixrQkFBa0IsdUJBQXVCLHNCQUFzQixrQkFBa0IsT0FBTztBQUN4RixrQkFBa0IsdUJBQXVCLHNCQUFzQixrQkFBa0IsT0FBTztBQUN4RixrQkFBa0IscUJBQXFCLG9CQUFvQixrQkFBa0IsT0FBTztBQUNwRixrQkFBa0IsMkJBQTJCLDBCQUEwQixrQkFBa0IsT0FBTztBQUNoRyxrQkFBa0IsaUNBQWlDLGdDQUFnQyxrQkFBa0IsT0FBTztBQUM1RyxrQkFBa0IsK0JBQStCLDhCQUE4QixrQkFBa0IsT0FBTztBQUN4RyxrQkFBa0IsbUJBQW1CLGdDQUFnQyxrQkFBa0IsT0FBTztBQUM5RixrQkFBa0IsdUJBQXVCLHNCQUFzQixrQkFBa0IsT0FBTztBQUN4RixrQkFBa0IsNEJBQTRCLDJCQUEyQixrQkFBa0IsT0FBTztBQUNsRyxrQkFBa0IsdUJBQXVCLDZCQUE2QixrQkFBa0IsT0FBTztBQUMvRixrQkFBa0Isd0NBQXdDLHVDQUF1QyxrQkFBa0IsT0FBTztBQUMxSCxrQkFBa0IsZ0NBQWdDLCtCQUErQixrQkFBa0IsT0FBTztBQUMxRyxrQkFBa0IseUJBQXlCLHdCQUF3QixrQkFBa0IsT0FBTztBQUM1RixrQkFBa0IsaUNBQWlDLGdDQUFnQyxrQkFBa0IsT0FBTztBQUM1RyxrQkFBa0Isa0NBQWtDLGlDQUFpQyxrQkFBa0IsT0FBTztBQUM5RyxrQkFBa0IsbUJBQW1CLGtCQUFrQixrQkFBa0IsT0FBTztBQUNoRixrQkFBa0Isc0NBQXNDLHFDQUFxQyxrQkFBa0IsT0FBTztBQUN0SCxrQkFBa0Isb0JBQW9CLG1CQUFtQixrQkFBa0IsT0FBTztBQUNsRixrQkFBa0IscUJBQXFCLG9CQUFvQixrQkFBa0IsT0FBTztBQUNwRixrQkFBa0IsNEJBQTRCLDJCQUEyQixrQkFBa0IsT0FBTztBQUNsRyxrQkFBa0IsNEJBQTRCLDJCQUEyQixrQkFBa0IsT0FBTztBQUNsRyxrQkFBa0IsbUNBQW1DLGtDQUFrQyxrQkFBa0IsT0FBTztBQUNoSCxrQkFBa0IsaUJBQWlCLGdCQUFnQixrQkFBa0IsT0FBTztBQUM1RSxrQkFBa0IseUJBQXlCLHdCQUF3QixrQkFBa0IsT0FBTztBQUM1RixrQkFBa0Isa0JBQWtCLGlCQUFpQixrQkFBa0IsT0FBTztBQUM5RSxrQkFBa0IsK0JBQStCLDhCQUE4QixrQkFBa0IsT0FBTztBQUN4RyxrQkFBa0IsK0JBQStCLDhCQUE4QixrQkFBa0IsT0FBTztBQUN4RyxrQkFBa0Isc0JBQXNCLHFCQUFxQixrQkFBa0IsT0FBTztBQUN0RixrQkFBa0IsdUJBQXVCLHNCQUFzQixrQkFBa0IsT0FBTztBQUN4RixrQkFBa0IsNEJBQTRCLDJCQUEyQixrQkFBa0IsT0FBTztBQUNsRyxrQkFBa0Isb0JBQW9CLG1CQUFtQixrQkFBa0IsT0FBTztBQUNsRixrQkFBa0IsNEJBQTRCLDJCQUEyQixrQkFBa0IsT0FBTztBQUNsRyxrQkFBa0IsaUJBQWlCLGdCQUFnQixrQkFBa0IsT0FBTztBQUM1RSxrQkFBa0IsbUJBQW1CLHNCQUFzQixrQkFBa0IsT0FBTztBQUNwRixrQkFBa0IsMkJBQTJCLDBCQUEwQixrQkFBa0IsT0FBTztBQUNoRyxrQkFBa0IsbUNBQW1DLGtDQUFrQyxrQkFBa0IsT0FBTztBQUVoSCxXQUFXLFNBQVMsS0FBSyx3QkFBd0I7IiwKICAibmFtZXMiOiBbXQp9Cg==
