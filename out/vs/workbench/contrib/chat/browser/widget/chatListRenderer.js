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
import * as dom from "../../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../../base/browser/formattedTextRenderer.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { alert } from "../../../../../base/browser/ui/aria/aria.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CachedListVirtualDelegate } from "../../../../../base/browser/ui/list/list.js";
import { coalesce, distinct } from "../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { canceledName } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, dispose, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { FileAccess, Schemas } from "../../../../../base/common/network.js";
import { clamp } from "../../../../../base/common/numbers.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { MenuEntryActionViewItem, createActionViewItem } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { MenuId, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { parseRemoteAgentHostSessionTypeAuthority } from "../../../../../platform/agentHost/common/agentHostSessionType.js";
import { isCreateChatTool, isCreateSessionTool, isSendMessageTool } from "../../../../../platform/agentHost/common/openSessionLink.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { CodiconActionViewItem } from "../../../notebook/browser/view/cellParts/cellActionView.js";
import { annotateSpecialMarkdownContent, extractSubAgentInvocationIdFromText, hasCodeblockUriTag, hasEditCodeblockUriTag } from "../../common/widget/annotations.js";
import { checkModeOption } from "../../common/chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { chatSubcommandLeader } from "../../common/requestParser/chatParserTypes.js";
import { ChatAgentVoteDirection, ChatErrorLevel, ChatRequestQueueKind, IChatService, IChatToolInvocation, isChatFollowup } from "../../common/chatService/chatService.js";
import { ChatPlanReviewData } from "../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { localChatSessionType, SessionType } from "../../common/chatSessionsService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { getExplicitFileOrImageAttachmentSummary, isExplicitFileOrImageVariableEntry, isPasteVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { getStickyScrollTargetItem, isRequestVM, isResponseVM, isPendingDividerVM } from "../../common/model/chatViewModel.js";
import { getNWords } from "../../common/model/chatWordCounter.js";
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from "../../common/constants.js";
import { formatChatRequestTimestamp, formatChatResponseDetails, formatChatResponseElapsedTime } from "../../common/chatProgressFormatting.js";
import { ClickAnimation } from "../../../../../base/browser/ui/animations/animations.js";
import { ForkConversationActionId } from "../actions/chatForkActions.js";
import { MarkHelpfulActionId } from "../actions/chatTitleActions.js";
import { IChatWidgetService } from "../chat.js";
import { AgentHostSnapshotController } from "../agentSessions/agentHost/agentHostSnapshotController.js";
import { RestoreCheckpointActionId } from "../chatEditing/chatEditingActions.js";
import { ChatForkActionViewItem } from "./chatForkActionViewItem.js";
import { ChatRestoreCheckpointActionViewItem } from "./chatRestoreCheckpointActionViewItem.js";
import { ChatAgentHover, getChatAgentHoverOptions } from "./chatAgentHover.js";
import { ChatContentMarkdownRenderer } from "./chatContentMarkdownRenderer.js";
import { ChatAgentCommandContentPart } from "./chatContentParts/chatAgentCommandContentPart.js";
import { ChatAnonymousRateLimitedPart } from "./chatContentParts/chatAnonymousRateLimitedPart.js";
import { ChatAttachmentsContentPart } from "./chatContentParts/chatAttachmentsContentPart.js";
import { ChatAutoModeResolutionContentPart } from "./chatContentParts/chatAutoModeResolutionContentPart.js";
import { ChatCheckpointFileChangesSummaryContentPart } from "./chatContentParts/chatChangesSummaryPart.js";
import { ChatTurnPillsContentPart } from "./chatContentParts/chatTurnPillsPart.js";
import { isChatTurnStatusPillsEnabled } from "./chatTurnPills.js";
import { ChatCodeCitationContentPart } from "./chatContentParts/chatCodeCitationContentPart.js";
import { ChatCommandButtonContentPart } from "./chatContentParts/chatCommandContentPart.js";
import { ChatConfirmationContentPart } from "./chatContentParts/chatConfirmationContentPart.js";
import { DiffEditorPool, EditorPool } from "./chatContentParts/chatContentCodePools.js";
import { InlineTextModelCollection } from "./chatContentParts/chatContentParts.js";
import { ChatElicitationContentPart } from "./chatContentParts/chatElicitationContentPart.js";
import { ChatErrorConfirmationContentPart } from "./chatContentParts/chatErrorConfirmationPart.js";
import { ChatErrorContentPart } from "./chatContentParts/chatErrorContentPart.js";
import { ChatPlanReviewPart } from "./chatContentParts/chatPlanReviewPart.js";
import { ChatQuestionCarouselPart } from "./chatContentParts/chatQuestionCarouselPart.js";
import { ChatExtensionsContentPart } from "./chatContentParts/chatExtensionsContentPart.js";
import { ChatMarkdownContentPart, codeblockHasClosingBackticks } from "./chatContentParts/chatMarkdownContentPart.js";
import { ChatMcpServersInteractionContentPart } from "./chatContentParts/chatMcpServersInteractionContentPart.js";
import { ChatMcpAuthenticationContentPart } from "./chatContentParts/chatMcpAuthenticationContentPart.js";
import { ChatMcpServersStartingContentPart } from "./chatContentParts/chatMcpServersStartingContentPart.js";
import { ChatDisabledClaudeHooksContentPart } from "./chatContentParts/chatDisabledClaudeHooksContentPart.js";
import { ChatMultiDiffContentPart } from "./chatContentParts/chatMultiDiffContentPart.js";
import { ChatProgressContentPart, ChatWorkingProgressContentPart } from "./chatContentParts/chatProgressContentPart.js";
import { ChatPullRequestContentPart } from "./chatContentParts/chatPullRequestContentPart.js";
import { ChatQuotaExceededPart } from "./chatContentParts/chatQuotaExceededPart.js";
import { ChatUsedReferencesListContentPart, CollapsibleListPool } from "./chatContentParts/chatReferencesContentPart.js";
import { ChatTaskContentPart } from "./chatContentParts/chatTaskContentPart.js";
import { ChatSystemNotificationContentPart } from "./chatContentParts/chatSystemNotificationContentPart.js";
import { ChatTextEditContentPart } from "./chatContentParts/chatTextEditContentPart.js";
import { ChatThinkingContentPart, getEffectiveThinkingDisplayMode } from "./chatContentParts/chatThinkingContentPart.js";
import { ChatSubagentContentPart } from "./chatContentParts/chatSubagentContentPart.js";
import { ChatTreeContentPart, TreePool } from "./chatContentParts/chatTreeContentPart.js";
import { ChatWorkspaceEditContentPart } from "./chatContentParts/chatWorkspaceEditContentPart.js";
import { ChatExternalEditContentPart } from "./chatContentParts/chatExternalEditContentPart.js";
import { ChatToolInvocationPart } from "./chatContentParts/toolInvocationParts/chatToolInvocationPart.js";
import { ChatMarkdownDecorationsRenderer } from "./chatContentParts/chatMarkdownDecorationsRenderer.js";
import { ChatCodeBlockContentProvider } from "./chatContentParts/codeBlockPart.js";
import { autorun, observableValue } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ChatHookContentPart } from "./chatContentParts/chatHookContentPart.js";
import { HookType } from "../../common/promptSyntax/hookTypes.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { AccessibilityWorkbenchSettingId } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { isAskQuestionsToolInvocation, isMcpToolInvocation } from "./chatContentParts/toolInvocationParts/chatToolPartUtilities.js";
import { AgentSessionProviders, isAgentHostTarget } from "../agentSessions/agentSessions.js";
const $ = dom.$;
const COPILOT_USERNAME = "GitHub Copilot";
const WORKING_CAUGHT_UP_DEBOUNCE_MS = 750;
const DEFAULT_CHAT_ITEM_HORIZONTAL_PADDING = 40;
function escapeMarkdownLinkLabel(label) {
  return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}
function buildPlanReviewProgressContent(review, message) {
  const renderedAsUsed = !!review.isUsed;
  const data = renderedAsUsed && !review.data?.rejected ? review.data : void 0;
  const overall = data?.feedbackOverall?.trim();
  const inlineMd = data?.feedbackInlineMarkdown?.trim();
  const feedbackMarkdown = [overall, inlineMd].filter((value) => !!value).join("\n\n") || data?.feedback?.trim();
  const content = new MarkdownString(void 0, { supportThemeIcons: true });
  content.appendText(message);
  if (feedbackMarkdown) {
    content.appendMarkdown("\n\n");
    content.appendMarkdown(feedbackMarkdown);
  }
  if (renderedAsUsed) {
    const reviewContent = review.content.trim();
    const planUri = review.planUri ? URI.revive(review.planUri) : void 0;
    if (reviewContent || planUri) {
      content.appendMarkdown("\n\n");
      if (reviewContent) {
        content.appendMarkdown(reviewContent);
      }
      if (planUri) {
        if (reviewContent) {
          content.appendMarkdown("\n\n");
        }
        const planFileName = basename(planUri);
        const label = planFileName ? localize("chat.planReview.openFullPlanFile", "Open full plan file ({0})", planFileName) : localize("chat.planReview.openFullPlan", "Open full plan file");
        const planWidgetUri = planUri.with({ query: planUri.query ? `${planUri.query}&vscodeLinkType=file` : "vscodeLinkType=file" });
        content.appendMarkdown(`[${escapeMarkdownLinkLabel(label)}](${planWidgetUri.toString(true)})`);
      }
    }
  }
  return content;
}
function shouldScheduleInitialHeightChange(normalizedHeight, allocatedHeight) {
  return typeof allocatedHeight !== "number" || normalizedHeight > allocatedHeight;
}
function getFinalResponseStartIndex(content) {
  let index = content.length - 1;
  while (index >= 0) {
    const part = content[index];
    if (part.kind === "markdownContent" && part.content.value.length) {
      break;
    }
    index--;
  }
  if (index < 0) {
    return void 0;
  }
  while (index > 0 && content[index - 1].kind === "markdownContent") {
    index--;
  }
  return index;
}
function formatCompletedResponseDisclosureLabel(stepCount, elapsedMs) {
  const elapsed = formatChatResponseElapsedTime(elapsedMs);
  if (stepCount === 1) {
    return elapsed ? localize("chat.responseCompletedOneStepIn", "Completed 1 step in {0}", elapsed) : localize("chat.responseCompletedOneStep", "Completed 1 step");
  }
  return elapsed ? localize("chat.responseCompletedStepsIn", "Completed {0} steps in {1}", stepCount, elapsed) : localize("chat.responseCompletedSteps", "Completed {0} steps", stepCount);
}
function getVisibleCompletedResponseItemCount(nodes) {
  let visibleItemCount = 0;
  for (const node of nodes) {
    if (dom.isHTMLElement(node) && (node.hidden || node.style.display === "none")) {
      continue;
    }
    visibleItemCount++;
  }
  return visibleItemCount;
}
function shouldCollapseCompletedResponsePart(part) {
  return part.kind !== "toolInvocation" && part.kind !== "toolInvocationSerialized" || !toolInvocationHasMcpAppData(part);
}
function getCompletedResponseCollapseEndIndex(content, finalResponseStartIndex) {
  for (let index = 0; index < finalResponseStartIndex; index++) {
    if (!shouldCollapseCompletedResponsePart(content[index])) {
      return index;
    }
  }
  return finalResponseStartIndex;
}
function reconcileChatItemHeight(normalizedHeight, currentRenderedHeight, isBeingRendered, allocatedHeight) {
  if (normalizedHeight === currentRenderedHeight) {
    return { nextRenderedHeight: currentRenderedHeight, kind: "none", height: normalizedHeight };
  }
  if (isBeingRendered) {
    return { nextRenderedHeight: currentRenderedHeight, kind: "deferReMeasure", height: normalizedHeight };
  }
  if (typeof currentRenderedHeight === "number") {
    return { nextRenderedHeight: normalizedHeight, kind: "fire", height: normalizedHeight };
  }
  if (!shouldScheduleInitialHeightChange(normalizedHeight, allocatedHeight)) {
    return { nextRenderedHeight: normalizedHeight, kind: "none", height: normalizedHeight };
  }
  return { nextRenderedHeight: normalizedHeight, kind: "scheduleInitial", height: normalizedHeight };
}
function renderChatResponseDetails(container, details, completedAt, elapsedMs, verbose) {
  dom.clearNode(container);
  container.classList.remove("chat-response-flip-active", "chat-response-flip-down", "chat-response-flip-reset");
  const completion = verbose ? formatChatRequestTimestamp(completedAt) : void 0;
  const elapsed = completion ? formatChatResponseElapsedTime(elapsedMs) : void 0;
  const alternate = completion?.isRelative ? formatChatResponseDetails(elapsed, completion.fullText) : elapsed;
  const responseDetails = formatChatResponseDetails(details, completion?.text);
  let completedAtElement;
  if (completion) {
    const timing = dom.append(container, $("span.chat-response-timing"));
    completedAtElement = dom.append(timing, $("time.chat-response-completed-at", { datetime: completion.dateTime }, completion.text));
    if (alternate) {
      dom.append(timing, $("span.chat-response-alternate", void 0, alternate));
    }
    timing.classList.toggle("has-alternate", !!alternate);
  }
  if (completion && details) {
    dom.append(container, $("span.chat-response-details-separator", { "aria-hidden": "true" }, "\u2022"));
  }
  if (details) {
    dom.append(container, $("span.chat-response-model-details", void 0, details));
  }
  const accessibleTiming = completion ? localize("chatResponseCompletedAt", "Completed {0}", completion.fullText) : void 0;
  const accessibleElapsed = elapsed ? localize("chatResponseElapsed", "Elapsed time {0}", elapsed) : void 0;
  container.ariaLabel = [accessibleTiming, accessibleElapsed, details].filter(Boolean).join(", ");
  container.classList.toggle("hidden", !responseDetails);
  container.tabIndex = responseDetails ? 0 : -1;
  return completedAtElement;
}
function renderChatRequestTimestamp(container, timestamp) {
  const formatted = formatChatRequestTimestamp(timestamp);
  if (!formatted) {
    return void 0;
  }
  if (!formatted.isRelative) {
    const element2 = dom.append(container, $("time.chat-request-timestamp", {
      datetime: formatted.dateTime,
      "aria-label": localize("chatRequestSentAt", "Sent {0}", formatted.fullText),
      tabindex: 0
    }, formatted.text));
    return { element: element2, hoverText: formatted.fullText };
  }
  const element = dom.append(container, $("span.chat-request-timestamp", {
    "aria-label": localize("chatRequestSentAt", "Sent {0}", formatted.fullText),
    tabindex: 0
  }));
  const timing = dom.append(element, $("span.chat-request-timing.has-alternate"));
  dom.append(timing, $("time.chat-request-relative", { datetime: formatted.dateTime }, formatted.text));
  dom.append(timing, $("time.chat-request-full-date", { datetime: formatted.dateTime }, formatted.fullText));
  return { element };
}
function shouldRenderInitialProgressiveContentImmediately(isComplete, hasMarkdownParts, hasRenderData) {
  return !isComplete && hasMarkdownParts && !hasRenderData;
}
function shouldStartNewCollapsedThinkingGroup(displayMode, existingGroup, incomingGroup) {
  return displayMode === ThinkingDisplayMode.Collapsed && existingGroup !== incomingGroup;
}
function shouldCreateGroupedThinkingPart(collapsedToolsMode, separatedFromReasoning) {
  return collapsedToolsMode === CollapsedToolsDisplayMode.Always || separatedFromReasoning;
}
function shouldShowFileChangesSummaryForSettings(isComplete, isLocalSession, showFileChanges) {
  return isComplete && isLocalSession && showFileChanges;
}
function shouldShowPillsSummaryForSettings(isComplete, isAgentHostSession, turnStatusPills) {
  return isComplete && isAgentHostSession && isChatTurnStatusPillsEnabled(turnStatusPills);
}
function shouldPinToolInvocationToThinking(state, hasConfirmationMessages, hasMcpAppData) {
  return !hasMcpAppData && state !== IChatToolInvocation.StateKind.WaitingForConfirmation && state !== IChatToolInvocation.StateKind.WaitingForPostApproval && state !== IChatToolInvocation.StateKind.WaitingForAuthentication && !hasConfirmationMessages;
}
function toolInvocationHasMcpAppData(toolInvocation) {
  return toolInvocation.toolSpecificData?.kind === "input" && !!toolInvocation.toolSpecificData.mcpAppData;
}
const forceVerboseLayoutTracing = false;
const mostRecentResponseClassName = "chat-most-recent-response";
function shouldHideChatUserIdentity(username, sessionResource, isResponse, isSessionsWindow, isSystemInitiatedRequest) {
  const sessionType = getChatSessionType(sessionResource);
  return username === COPILOT_USERNAME || isResponse && isAgentHostCopilotSessionType(sessionType) || isSessionsWindow || isSystemInitiatedRequest;
}
function isAgentHostCopilotSessionType(sessionType) {
  return sessionType === AgentSessionProviders.AgentHostCopilot || parseRemoteAgentHostSessionTypeAuthority(sessionType, SessionType.CopilotCLI) !== void 0;
}
function upvoteAnimationSettingToEnum(value) {
  switch (value) {
    case "confetti":
      return ClickAnimation.Confetti;
    case "floatingThumbs":
      return ClickAnimation.FloatingIcons;
    case "pulseWave":
      return ClickAnimation.PulseWave;
    case "radiantLines":
      return ClickAnimation.RadiantLines;
    default:
      return void 0;
  }
}
let ChatListItemRenderer = class extends Disposable {
  constructor(editorOptions, rendererOptions, delegate, overflowWidgetsDomNode, viewModel, instantiationService, configService, logService, contextKeyService, themeService, commandService, hoverService, chatWidgetService, chatEntitlementService, chatService, accessibilitySignalService, accessibilityService, environmentService, telemetryService) {
    super();
    this.rendererOptions = rendererOptions;
    this.delegate = delegate;
    this.viewModel = viewModel;
    this.instantiationService = instantiationService;
    this.configService = configService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.themeService = themeService;
    this.commandService = commandService;
    this.hoverService = hoverService;
    this.chatWidgetService = chatWidgetService;
    this.chatEntitlementService = chatEntitlementService;
    this.chatService = chatService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.accessibilityService = accessibilityService;
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.codeBlocksByResponseId = /* @__PURE__ */ new Map();
    this.codeBlocksByEditorUri = new ResourceMap();
    this.fileTreesByResponseId = /* @__PURE__ */ new Map();
    this.focusedFileTreesByResponseId = /* @__PURE__ */ new Map();
    this.templateDataByRequestId = /* @__PURE__ */ new Map();
    this.responseTemplateDataByRequestId = /* @__PURE__ */ new Map();
    this.templateDataByRow = /* @__PURE__ */ new WeakMap();
    /** Track pending question carousels by session resource for auto-skip on chat submission */
    this.pendingQuestionCarousels = new ResourceMap();
    this._notifiedQuestionCarousels = /* @__PURE__ */ new Set();
    this.workingProgressConfirmationEndListeners = /* @__PURE__ */ new WeakSet();
    this._onDidClickFollowup = this._register(new Emitter());
    this.onDidClickFollowup = this._onDidClickFollowup.event;
    this._onDidClickRerunWithAgentOrCommandDetection = this._register(new Emitter());
    this.onDidClickRerunWithAgentOrCommandDetection = this._onDidClickRerunWithAgentOrCommandDetection.event;
    this._onDidClickRequest = this._register(new Emitter());
    this.onDidClickRequest = this._onDidClickRequest.event;
    this._onDidRerender = this._register(new Emitter());
    this.onDidRerender = this._onDidRerender.event;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._onDidFocusOutside = this._register(new Emitter());
    this.onDidFocusOutside = this._onDidFocusOutside.event;
    this._onDidChangeItemHeight = this._register(new Emitter());
    this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
    this._onDidUpdateViewModel = this._register(new Emitter());
    this._currentLayoutWidth = observableValue(this, 0);
    this._isVisible = true;
    this._onDidChangeVisibility = this._register(new Emitter());
    /** Whether we have already logged the incremental-rendering telemetry event for this renderer instance. */
    this._incrementalRenderingTelemetryLogged = false;
    /**
     * Prevents re-announcement of already rendered chat progress
     * by screen readers
     */
    this._announcedToolProgressKeys = /* @__PURE__ */ new Set();
    this.chatContentMarkdownRenderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
    this.markdownDecorationsRenderer = this.instantiationService.createInstance(ChatMarkdownDecorationsRenderer);
    this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode, true));
    this._toolEditorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode, true));
    this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, editorOptions, delegate, overflowWidgetsDomNode, true));
    this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
    this._contentReferencesListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, void 0, void 0));
    this._inlineTextModels = this._register(this.instantiationService.createInstance(InlineTextModelCollection));
    this._register(this.instantiationService.createInstance(ChatCodeBlockContentProvider));
    this._register(this.chatService.onDidSubmitRequest((e) => {
      const carousels = this.pendingQuestionCarousels.get(e.chatSessionResource);
      if (carousels) {
        for (const carousel of carousels) {
          carousel.skip();
        }
        carousels.clear();
      }
    }));
    this._register(this.configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AutoReply) && this.configService.getValue(ChatConfiguration.AutoReply)) {
        for (const [, carousels] of this.pendingQuestionCarousels) {
          for (const carousel of carousels) {
            carousel.skip();
          }
          carousels.clear();
        }
      }
    }));
  }
  set pendingDragController(controller) {
    this._pendingDragController = controller;
  }
  updateOptions(options) {
    this.rendererOptions = { ...this.rendererOptions, ...options };
  }
  get templateId() {
    return ChatListItemRenderer.ID;
  }
  editorsInUse() {
    return Iterable.concat(this._editorPool.inUse(), this._toolEditorPool.inUse());
  }
  traceLayout(method, message) {
    if (forceVerboseLayoutTracing) {
      this.logService.info(`ChatListItemRenderer#${method}: ${message}`);
    } else {
      this.logService.trace(`ChatListItemRenderer#${method}: ${message}`);
    }
  }
  fireItemHeightChange(template, measuredHeight) {
    if (!template.currentElement || !template.rowContainer.isConnected) {
      return;
    }
    const height = measuredHeight ?? template.rowContainer.getBoundingClientRect().height;
    if (height === 0 || !height) {
      return;
    }
    const normalizedHeight = Math.ceil(height);
    const element = template.currentElement;
    const update = reconcileChatItemHeight(
      normalizedHeight,
      element.currentRenderedHeight,
      element === this._elementBeingRendered,
      template.allocatedHeight
    );
    element.currentRenderedHeight = update.nextRenderedHeight;
    if (update.kind === "fire") {
      this._onDidChangeItemHeight.fire({ element, height: update.height });
    } else if (update.kind === "scheduleInitial") {
      const scheduledHeight = update.height;
      dom.scheduleAtNextAnimationFrame(dom.getWindow(template.rowContainer), () => {
        if (template.currentElement !== element || element.currentRenderedHeight !== scheduledHeight) {
          return;
        }
        this._onDidChangeItemHeight.fire({ element, height: scheduledHeight });
      });
    } else if (update.kind === "deferReMeasure") {
      dom.scheduleAtNextAnimationFrame(dom.getWindow(template.rowContainer), () => {
        if (template.currentElement === element && element !== this._elementBeingRendered) {
          this.fireItemHeightChange(template);
        }
      });
    }
  }
  /**
   * Compute a rate to render at in words/s.
   */
  getProgressiveRenderRate(element) {
    let Rate;
    ((Rate2) => {
      Rate2[Rate2["Min"] = 40] = "Min";
      Rate2[Rate2["Max"] = 2e3] = "Max";
    })(Rate || (Rate = {}));
    const minAfterComplete = 80;
    const rate = element.contentUpdateTimings?.impliedWordLoadRate;
    if (element.isComplete) {
      if (typeof rate === "number") {
        return clamp(rate, minAfterComplete, 2e3 /* Max */);
      } else {
        return minAfterComplete;
      }
    }
    if (typeof rate === "number") {
      return clamp(rate, 40 /* Min */, 2e3 /* Max */);
    }
    return 8;
  }
  getCodeBlockInfosForResponse(response) {
    const codeBlocks = this.codeBlocksByResponseId.get(response.id);
    return codeBlocks ?? [];
  }
  updateViewModel(viewModel) {
    this.viewModel = viewModel;
    this._announcedToolProgressKeys.clear();
    this._notifiedQuestionCarousels.clear();
    this.codeBlocksByEditorUri.clear();
    this.codeBlocksByResponseId.clear();
    this.fileTreesByResponseId.clear();
    this.focusedFileTreesByResponseId.clear();
    this.responseTemplateDataByRequestId.clear();
    this.templateDataByRequestId.clear();
    this._onDidUpdateViewModel.fire();
    this._editorPool.clear();
    this._toolEditorPool.clear();
    this._diffEditorPool.clear();
    this._treePool.clear();
    this._contentReferencesListPool.clear();
  }
  getCodeBlockInfoForEditor(uri) {
    return this.codeBlocksByEditorUri.get(uri);
  }
  getFileTreeInfosForResponse(response) {
    const fileTrees = this.fileTreesByResponseId.get(response.id);
    return fileTrees ?? [];
  }
  getLastFocusedFileTreeForResponse(response) {
    const fileTrees = this.fileTreesByResponseId.get(response.id);
    const lastFocusedFileTreeIndex = this.focusedFileTreesByResponseId.get(response.id);
    if (fileTrees?.length && lastFocusedFileTreeIndex !== void 0 && lastFocusedFileTreeIndex < fileTrees.length) {
      return fileTrees[lastFocusedFileTreeIndex];
    }
    return void 0;
  }
  getTemplateDataForRequestId(requestId) {
    if (!requestId) {
      return void 0;
    }
    const templateData = this.templateDataByRequestId.get(requestId);
    if (templateData && templateData.currentElement?.id === requestId) {
      return templateData;
    }
    if (templateData) {
      this.templateDataByRequestId.delete(requestId);
    }
    return void 0;
  }
  setVisible(visible) {
    this._isVisible = visible;
    this._onDidChangeVisibility.fire(visible);
  }
  layout(width) {
    const newWidth = width - (this.rendererOptions.contentHorizontalPadding ?? DEFAULT_CHAT_ITEM_HORIZONTAL_PADDING);
    if (newWidth !== this._currentLayoutWidth.get()) {
      this._currentLayoutWidth.set(newWidth, void 0);
      for (const editor of this._editorPool.inUse()) {
        editor.layout(newWidth);
      }
      for (const toolEditor of this._toolEditorPool.inUse()) {
        toolEditor.layout(newWidth);
      }
      for (const diffEditor of this._diffEditorPool.inUse()) {
        diffEditor.layout(newWidth);
      }
    }
  }
  /**
   * Returns the currently rendered chat item containing the node.
   */
  getElementFromNode(node) {
    let current = node;
    while (current && this.delegate.container.contains(current)) {
      const element = this.templateDataByRow.get(current)?.currentElement;
      if (element) {
        return element;
      }
      current = current.parentElement;
    }
    return void 0;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const disabledOverlay = dom.append(container, $(".chat-row-disabled-overlay"));
    const rowContainer = dom.append(container, $(".interactive-item-container"));
    if (this.rendererOptions.renderStyle === "compact") {
      rowContainer.classList.add("interactive-item-compact");
    }
    let headerParent = rowContainer;
    let valueParent = rowContainer;
    let detailContainerParent;
    if (this.rendererOptions.renderStyle === "minimal") {
      rowContainer.classList.add("interactive-item-compact");
      rowContainer.classList.add("minimal");
      const lhsContainer = dom.append(rowContainer, $(".column.left"));
      const rhsContainer = dom.append(rowContainer, $(".column.right"));
      headerParent = lhsContainer;
      detailContainerParent = rhsContainer;
      valueParent = rhsContainer;
    }
    const header = dom.append(headerParent, $(".header"));
    const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
    const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const requestHover = dom.append(rowContainer, $(".request-hover"));
    let titleToolbar;
    if (this.rendererOptions.noHeader) {
      header.classList.add("hidden");
    } else {
      titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, requestHover, MenuId.ChatMessageTitle, {
        menuOptions: {
          shouldForwardArgs: true
        },
        toolbarOptions: {
          shouldInlineSubmenu: (submenu) => submenu.actions.length <= 1
        }
      }));
    }
    this.hoverHidden(requestHover);
    const checkpointContainer = dom.append(rowContainer, $(".checkpoint-container"));
    dom.append(checkpointContainer, $(".checkpoint-line-left"));
    const checkpointToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, checkpointContainer, MenuId.ChatMessageCheckpoint, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          if (action.item.id === RestoreCheckpointActionId) {
            return this.instantiationService.createInstance(ChatRestoreCheckpointActionViewItem, action, { hoverDelegate: options.hoverDelegate }, (context) => this.checkpointRestoreNeedsConfirmation(context));
          }
          if (action.item.id === ForkConversationActionId) {
            return this.instantiationService.createInstance(ChatForkActionViewItem, action, { hoverDelegate: options.hoverDelegate });
          }
          return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        }
        return void 0;
      },
      renderDropdownAsChildElement: true,
      menuOptions: {
        shouldForwardArgs: true
      },
      toolbarOptions: {
        shouldInlineSubmenu: (submenu) => submenu.actions.length <= 1
      }
    }));
    dom.append(checkpointContainer, $(".checkpoint-line-right"));
    const user = dom.append(header, $(".user"));
    const avatarContainer = dom.append(user, $(".avatar-container"));
    const username = dom.append(user, $("h3.username"));
    username.tabIndex = 0;
    const detailContainer = dom.append(detailContainerParent ?? user, $("span.detail-container"));
    const detail = dom.append(detailContainer, $("span.detail"));
    dom.append(detailContainer, $("span.chat-animated-ellipsis"));
    const value = dom.append(valueParent, $(".value"));
    const requestTimestampContainer = dom.append(valueParent, $(".chat-request-timestamp-container"));
    const elementDisposables = templateDisposables.add(new DisposableStore());
    const completedResponseDisclosureDisposables = templateDisposables.add(new DisposableStore());
    const footerToolbarContainer = dom.append(rowContainer, $(".chat-footer-toolbar"));
    if (this.rendererOptions.noFooter) {
      footerToolbarContainer.classList.add("hidden");
    }
    const footerToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, footerToolbarContainer, MenuId.ChatMessageFooter, {
      menuOptions: { shouldForwardArgs: true, renderShortTitle: true },
      toolbarOptions: { shouldInlineSubmenu: (submenu) => submenu.actions.length <= 1 },
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction && action.item.id === MarkHelpfulActionId) {
          const animation = upvoteAnimationSettingToEnum(this.configService.getValue("chat.upvoteAnimation"));
          return scopedInstantiationService.createInstance(MenuEntryActionViewItem, action, { ...options, onClickAnimation: animation });
        }
        return createActionViewItem(scopedInstantiationService, action, options);
      }
    }));
    const footerDetailsContainer = dom.append(footerToolbar.getElement(), $(".chat-footer-details"));
    footerDetailsContainer.tabIndex = 0;
    const checkpointRestoreContainer = dom.append(rowContainer, $(".checkpoint-restore-container"));
    dom.append(checkpointRestoreContainer, $(".checkpoint-line-left"));
    const label = dom.append(checkpointRestoreContainer, $("span.checkpoint-label-text"));
    label.textContent = localize("checkpointRestore", "Checkpoint Restored");
    const dot = dom.append(checkpointRestoreContainer, $("span.checkpoint-dot-separator"));
    dot.textContent = "\xB7";
    dot.setAttribute("aria-hidden", "true");
    const checkpointRestoreToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, checkpointRestoreContainer, MenuId.ChatMessageRestoreCheckpoint, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        }
        return void 0;
      },
      renderDropdownAsChildElement: true,
      menuOptions: {
        shouldForwardArgs: true
      },
      toolbarOptions: {
        shouldInlineSubmenu: (submenu) => submenu.actions.length <= 1
      }
    }));
    dom.append(checkpointRestoreContainer, $(".checkpoint-line-right"));
    const agentHover = templateDisposables.add(this.instantiationService.createInstance(ChatAgentHover));
    const hoverContent = () => {
      if (isResponseVM(template.currentElement) && template.currentElement.agent && !template.currentElement.agent.isDefault) {
        agentHover.setAgent(template.currentElement.agent.id);
        return agentHover.domNode;
      }
      return void 0;
    };
    const hoverOptions = getChatAgentHoverOptions(() => isResponseVM(template.currentElement) ? template.currentElement.agent : void 0, this.commandService);
    templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), user, hoverContent, hoverOptions));
    templateDisposables.add(dom.addDisposableListener(user, dom.EventType.KEY_DOWN, (e) => {
      const ev = new StandardKeyboardEvent(e);
      if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
        const content = hoverContent();
        if (content) {
          this.hoverService.showInstantHover({ content, target: user, trapFocus: true, actions: hoverOptions.actions }, true);
        }
      } else if (ev.equals(KeyCode.Escape)) {
        this.hoverService.hideHover();
      }
    }));
    const connectionObserver = document.createElement("connection-observer");
    dom.append(container, connectionObserver);
    const template = { header, avatarContainer, requestHover, username, detail, value, requestTimestampContainer, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, agentHover, titleToolbar, footerToolbar, footerToolbarContainer, footerDetailsContainer, disabledOverlay, checkpointToolbar, checkpointRestoreToolbar, checkpointContainer, checkpointRestoreContainer, completedResponseDisclosureDisposables };
    this.templateDataByRow.set(rowContainer, template);
    templateDisposables.add(this._onDidUpdateViewModel.event(() => {
      if (!template.currentElement || !this.viewModel?.sessionResource || !isEqual(template.currentElement.sessionResource, this.viewModel.sessionResource)) {
        this.clearRenderedParts(template);
      }
    }));
    templateDisposables.add(dom.addDisposableListener(disabledOverlay, dom.EventType.CLICK, (e) => {
      if (!this.viewModel?.editing) {
        return;
      }
      const current = template.currentElement;
      if (!current || current.id === this.viewModel.editing.id) {
        return;
      }
      if (disabledOverlay.classList.contains("disabled")) {
        e.preventDefault();
        e.stopPropagation();
        this._onDidFocusOutside.fire();
      }
    }));
    const resizeObserver = templateDisposables.add(new dom.DisposableResizeObserver("ChatListItemRenderer.itemHeight", (entries) => {
      const entry = entries[0];
      if (entry) {
        this.fireItemHeightChange(template, entry.borderBoxSize.at(0)?.blockSize);
      }
    }));
    const resizeObservation = templateDisposables.add(new MutableDisposable());
    connectionObserver.onDidConnect = () => {
      resizeObservation.value = resizeObserver.observe(rowContainer);
    };
    connectionObserver.onDidDisconnect = () => {
      template.renderedPartsMounted = false;
      resizeObservation.clear();
    };
    if (rowContainer.isConnected) {
      connectionObserver.onDidConnect();
    }
    return template;
  }
  /**
   * Determines whether restoring to the checkpoint at the given chat item
   * would discard file edits that the user should confirm in-place. Used by
   * the "Restore Checkpoint" button to present an inline confirm/cancel
   * affordance for agent host sessions, which do not surface the modal
   * removal-confirmation dialog used by the standard editing session.
   */
  checkpointRestoreNeedsConfirmation(context) {
    if (!isRequestVM(context) && !isResponseVM(context)) {
      return false;
    }
    const requestId = isRequestVM(context) ? context.id : context.requestId;
    const model = this.chatService.getSession(context.sessionResource);
    const session = model?.editingSession;
    if (!model || !(session instanceof AgentHostSnapshotController)) {
      return false;
    }
    const requests = model.getRequests();
    const index = requests.findIndex((request) => request.id === requestId);
    if (index === -1) {
      return false;
    }
    return requests.slice(index).some((request) => session.hasEditsInRequest(request.id));
  }
  renderElement(node, index, templateData, details) {
    templateData.allocatedHeight = details?.height;
    this._elementBeingRendered = node.element;
    try {
      this.renderChatTreeItem(node.element, index, templateData);
    } finally {
      this._elementBeingRendered = void 0;
    }
  }
  /**
   * Dispose the rendered parts in the template, which aren't done in disposeElement
   * so they can be reused when a new render is started.
   */
  clearRenderedParts(templateData) {
    this.removeCompletedResponseDisclosure(templateData);
    if (templateData.renderedParts) {
      dispose(coalesce(templateData.renderedParts));
      templateData.renderedParts = void 0;
      templateData.renderedContent = void 0;
      dom.clearNode(templateData.value);
    } else if (isPendingDividerVM(templateData.currentElement)) {
      dom.clearNode(templateData.value);
    }
    templateData.movedOutToolParts?.dispose();
    templateData.movedOutToolParts = void 0;
    if (templateData.titleToolbar) {
      templateData.titleToolbar.context = void 0;
    }
    templateData.footerToolbar.context = void 0;
    templateData.checkpointToolbar.context = void 0;
    templateData.checkpointRestoreToolbar.context = void 0;
    templateData.currentElement = void 0;
    templateData.completedResponseDisclosureOpen = void 0;
    templateData.completedResponseCollapseEndIndex = void 0;
    templateData.wasResponseComplete = void 0;
  }
  renderChatTreeItem(element, index, templateData) {
    if (templateData.currentElement && templateData.currentElement.id !== element.id) {
      this.traceLayout("renderChatTreeItem", `Rendering a different element into the template, index=${index}`);
      const mappedTemplateData = this.templateDataByRequestId.get(templateData.currentElement.id);
      if (mappedTemplateData && mappedTemplateData.currentElement?.id !== templateData.currentElement.id) {
        this.templateDataByRequestId.delete(templateData.currentElement.id);
      }
      this.clearRenderedParts(templateData);
    }
    templateData.currentElement = element;
    this.templateDataByRequestId.set(element.id, templateData);
    templateData.rowContainer.classList.remove("pending-item", "pending-divider", "pending-request", "chat-pending-dragging", "terminal-command-request");
    templateData.dragHandle?.remove();
    templateData.dragHandle = void 0;
    delete templateData.rowContainer.dataset.pendingRequestId;
    delete templateData.rowContainer.dataset.pendingKind;
    if (isPendingDividerVM(element)) {
      this.renderPendingDivider(element, templateData);
      return;
    }
    const kind = isRequestVM(element) ? "request" : isResponseVM(element) ? "response" : isPendingDividerVM(element) ? "pendingDivider" : "welcome";
    this.traceLayout("renderElement", `${kind}, index=${index}`);
    ChatContextKeys.isResponse.bindTo(templateData.contextKeyService).set(isResponseVM(element));
    ChatContextKeys.itemId.bindTo(templateData.contextKeyService).set(element.id);
    ChatContextKeys.isRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element));
    ChatContextKeys.isFirstRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element) && this.viewModel?.model.getRequests()[0]?.id === element.id);
    ChatContextKeys.isPendingRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element) && !!element.pendingKind);
    ChatContextKeys.responseDetectedAgentCommand.bindTo(templateData.contextKeyService).set(isResponseVM(element) && element.agentOrSlashCommandDetected);
    if (isResponseVM(element)) {
      ChatContextKeys.responseSupportsIssueReporting.bindTo(templateData.contextKeyService).set(!!element.agent?.metadata.supportIssueReporting);
      ChatContextKeys.responseVote.bindTo(templateData.contextKeyService).set(element.vote === ChatAgentVoteDirection.Up ? "up" : element.vote === ChatAgentVoteDirection.Down ? "down" : "");
    } else {
      ChatContextKeys.responseVote.bindTo(templateData.contextKeyService).set("");
    }
    if (templateData.titleToolbar) {
      templateData.titleToolbar.context = element;
    }
    templateData.footerToolbar.context = element;
    const responseTimingListeners = templateData.elementDisposables.add(new MutableDisposable());
    const updateResponseDetails = () => {
      const details = isResponseVM(element) ? element.result?.details : void 0;
      const completedAtElement = renderChatResponseDetails(
        templateData.footerDetailsContainer,
        details,
        isResponseVM(element) ? element.model.completionTimestamp : void 0,
        isResponseVM(element) ? element.model.elapsedMs : void 0,
        isResponseVM(element) && this.configService.getValue(ChatConfiguration.Verbose)
      );
      if (!completedAtElement) {
        responseTimingListeners.clear();
        return;
      }
      const listeners = new DisposableStore();
      responseTimingListeners.value = listeners;
      let responseTimingBounds;
      listeners.add(dom.addDisposableListener(completedAtElement, dom.EventType.MOUSE_ENTER, (e) => {
        const bounds = completedAtElement.getBoundingClientRect();
        responseTimingBounds = bounds;
        templateData.footerDetailsContainer.classList.add("chat-response-flip-reset");
        templateData.footerDetailsContainer.classList.remove("chat-response-flip-active");
        templateData.footerDetailsContainer.classList.toggle("chat-response-flip-down", e.clientY < bounds.top + bounds.height / 2);
        void templateData.footerDetailsContainer.offsetWidth;
        templateData.footerDetailsContainer.classList.remove("chat-response-flip-reset");
        void templateData.footerDetailsContainer.offsetWidth;
        templateData.footerDetailsContainer.classList.add("chat-response-flip-active");
      }));
      listeners.add(dom.addDisposableListener(templateData.footerDetailsContainer, dom.EventType.MOUSE_MOVE, (e) => {
        if (responseTimingBounds && (e.clientX < responseTimingBounds.left || e.clientX > responseTimingBounds.right || e.clientY < responseTimingBounds.top || e.clientY > responseTimingBounds.bottom)) {
          responseTimingBounds = void 0;
          templateData.footerDetailsContainer.classList.remove("chat-response-flip-active");
        }
      }));
      listeners.add(dom.addDisposableListener(templateData.footerDetailsContainer, dom.EventType.MOUSE_LEAVE, () => {
        responseTimingBounds = void 0;
        templateData.footerDetailsContainer.classList.remove("chat-response-flip-active");
      }));
      listeners.add(dom.addDisposableListener(templateData.footerDetailsContainer, dom.EventType.FOCUS, () => {
        templateData.footerDetailsContainer.classList.remove("chat-response-flip-active", "chat-response-flip-down");
      }));
    };
    updateResponseDetails();
    ChatContextKeys.responseHasError.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.errorDetails);
    const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);
    ChatContextKeys.responseIsFiltered.bindTo(templateData.contextKeyService).set(isFiltered);
    const location = this.chatWidgetService.getWidgetBySessionResource(element.sessionResource)?.location;
    templateData.rowContainer.classList.toggle("editing-session", location === ChatAgentLocation.Chat);
    templateData.rowContainer.classList.toggle("interactive-request", isRequestVM(element));
    templateData.rowContainer.classList.toggle("interactive-response", isResponseVM(element));
    const progressMessageAtBottomOfResponse = checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse);
    templateData.rowContainer.classList.toggle("show-detail-progress", isResponseVM(element) && !element.isComplete && !element.progressMessages.length && !progressMessageAtBottomOfResponse);
    templateData.rowContainer.classList.toggle("chat-progress-reservable", isResponseVM(element) && !element.isComplete && !!progressMessageAtBottomOfResponse);
    const updateContainerCheckmarks = () => templateData.rowContainer.classList.toggle("show-checkmarks", !!this.configService.getValue(AccessibilityWorkbenchSettingId.ShowChatCheckmarks));
    updateContainerCheckmarks();
    const updateVerboseDetails = () => templateData.rowContainer.classList.toggle("show-verbose-details", !!this.configService.getValue(ChatConfiguration.Verbose));
    updateVerboseDetails();
    templateData.elementDisposables.add(this.configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AccessibilityWorkbenchSettingId.ShowChatCheckmarks)) {
        updateContainerCheckmarks();
      }
      if (e.affectsConfiguration(ChatConfiguration.Verbose)) {
        updateVerboseDetails();
        updateResponseDetails();
      }
      if (e.affectsConfiguration(ChatConfiguration.CollapseCompletedResponses) && isResponseVM(element)) {
        this.updateCompletedResponseDisclosure(element, templateData.renderedContent ?? [], templateData, false);
      }
    }));
    if (!this.rendererOptions.noHeader) {
      this.renderAvatar(element, templateData);
    }
    const isSystemInitiatedRequest = isRequestVM(element) && !!element.isSystemInitiated;
    templateData.username.textContent = element.username;
    const hideChatUserIdentity = shouldHideChatUserIdentity(element.username, element.sessionResource, isResponseVM(element), this.environmentService.isSessionsWindow, isSystemInitiatedRequest);
    templateData.username.classList.toggle("hidden", hideChatUserIdentity);
    templateData.avatarContainer.classList.toggle("hidden", hideChatUserIdentity);
    this.hoverHidden(templateData.requestHover);
    dom.clearNode(templateData.detail);
    dom.clearNode(templateData.requestTimestampContainer);
    if (isResponseVM(element)) {
      this.renderDetail(element, templateData);
    }
    templateData.checkpointToolbar.context = element;
    const supportsForkOrRestoration = this.rendererOptions.supportsFork || (this.rendererOptions.restorable ?? true);
    const checkpointEnabled = this.configService.getValue(ChatConfiguration.CheckpointsEnabled) && supportsForkOrRestoration;
    const isPendingRequest = isRequestVM(element) && !!element.pendingKind;
    templateData.checkpointContainer.classList.toggle("hidden", isResponseVM(element) || isPendingRequest || isSystemInitiatedRequest || !checkpointEnabled);
    templateData.footerToolbar.refresh();
    templateData.checkpointToolbar.refresh();
    templateData.checkpointRestoreToolbar.refresh();
    if (isResponseVM(element)) {
      this.responseTemplateDataByRequestId.set(element.requestId, templateData);
      templateData.elementDisposables.add(toDisposable(() => this.responseTemplateDataByRequestId.delete(element.requestId)));
    }
    if (!isPendingRequest) {
      const setGroupHover = (hovered) => {
        const requestId = isRequestVM(element) ? element.id : isResponseVM(element) ? element.requestId : void 0;
        if (!requestId) {
          return;
        }
        const reqData = this.templateDataByRequestId.get(requestId);
        const resData = this.responseTemplateDataByRequestId.get(requestId);
        reqData?.rowContainer.classList.toggle("group-hovered", hovered);
        reqData?.checkpointContainer.classList.toggle("group-hovered", hovered);
        resData?.rowContainer.classList.toggle("group-hovered", hovered);
      };
      const hoverTargets = isResponseVM(element) ? [templateData.value, templateData.footerToolbarContainer] : [templateData.rowContainer];
      const isHoverTarget = (target) => dom.isHTMLElement(target) && hoverTargets.some((hoverTarget) => hoverTarget.contains(target));
      for (const hoverTarget of hoverTargets) {
        templateData.elementDisposables.add(dom.addDisposableListener(hoverTarget, dom.EventType.MOUSE_ENTER, () => setGroupHover(true)));
        templateData.elementDisposables.add(dom.addDisposableListener(hoverTarget, dom.EventType.MOUSE_LEAVE, (e) => {
          if (!isHoverTarget(e.relatedTarget)) {
            setGroupHover(false);
          }
        }));
      }
      templateData.elementDisposables.add(toDisposable(() => setGroupHover(false)));
    }
    const shouldShowRestore = this.viewModel?.model.checkpoint && !this.viewModel?.editing && index === this.delegate.getListLength() - 1 && !isPendingRequest;
    templateData.checkpointRestoreContainer.classList.toggle("hidden", !(shouldShowRestore && checkpointEnabled));
    const editing = element.id === this.viewModel?.editing?.id;
    const isInput = this.configService.getValue("chat.editRequests") === "input";
    templateData.elementDisposables.add(autorun((r) => {
      const shouldBeBlocked = element.shouldBeBlocked.read(r);
      templateData.disabledOverlay.classList.toggle("disabled", shouldBeBlocked && !editing && this.viewModel?.editing !== void 0);
    }));
    templateData.rowContainer.classList.toggle("editing", editing && !isInput);
    templateData.rowContainer.classList.toggle("editing-input", editing && isInput);
    templateData.requestHover.classList.toggle("editing", editing && isInput);
    templateData.requestHover.classList.toggle("hidden", !!this.viewModel?.editing && !editing || isResponseVM(element) || !this.rendererOptions.editable || isSystemInitiatedRequest);
    templateData.requestHover.classList.toggle("expanded", this.configService.getValue("chat.editRequests") === "hover");
    templateData.requestHover.classList.toggle("checkpoints-enabled", checkpointEnabled);
    templateData.elementDisposables.add(dom.addStandardDisposableListener(templateData.rowContainer, dom.EventType.CLICK, (e) => {
      const current = templateData.currentElement;
      if (current && this.viewModel?.editing && current.id !== this.viewModel.editing.id) {
        e.stopPropagation();
        e.preventDefault();
        this._onDidFocusOutside.fire();
      }
    }));
    const rowRoot = templateData.rowContainer.parentElement?.parentElement?.parentElement;
    rowRoot?.classList.toggle("request", isRequestVM(element));
    rowRoot?.classList.toggle("response", isResponseVM(element));
    templateData.rowContainer.classList.toggle(mostRecentResponseClassName, index === this.delegate.getListLength() - 1);
    templateData.rowContainer.classList.toggle("confirmation-message", isRequestVM(element) && !!element.confirmation);
    const isStickyScrollTargetItem = getStickyScrollTargetItem(this.viewModel?.getItems() ?? []) === element;
    const shouldShowHeader = isResponseVM(element) && !this.rendererOptions.noHeader && !isSystemInitiatedRequest;
    templateData.header?.classList.toggle("header-disabled", !shouldShowHeader);
    if (isRequestVM(element) && element.confirmation) {
      this.renderConfirmationAction(element, templateData);
    }
    const incrementalRendering = this.configService.getValue(ChatConfiguration.IncrementalRendering);
    if (isResponseVM(element) && isStickyScrollTargetItem && (!element.isComplete || element.renderData)) {
      this.traceLayout("renderElement", `start progressive render, index=${index}`);
      if (incrementalRendering && !element.renderData) {
        this.logIncrementalRenderingTelemetry();
        this.doIncrementalRender(element, index, templateData);
      } else {
        const timer = templateData.elementDisposables.add(new dom.WindowIntervalTimer());
        const runProgressiveRender = (initial) => {
          try {
            if (this.doNextProgressiveRender(element, index, templateData, !!initial)) {
              timer.cancel();
            }
          } catch (err) {
            timer.cancel();
            this.logService.error(err);
          }
        };
        timer.cancelAndSet(runProgressiveRender, 50, dom.getWindow(templateData.rowContainer));
        runProgressiveRender(true);
      }
    } else {
      if (isResponseVM(element)) {
        if (incrementalRendering) {
          const rate = this.getProgressiveRenderRate(element);
          this._updateMorpherRate(templateData, rate, true);
        }
        this.renderChatResponseBasic(element, index, templateData);
      } else if (isRequestVM(element)) {
        this.renderChatRequest(element, index, templateData);
      }
    }
    templateData.renderedPartsMounted = true;
  }
  renderPendingDivider(element, templateData) {
    templateData.rowContainer.classList.add("pending-item");
    templateData.rowContainer.classList.add("pending-divider");
    templateData.rowContainer.classList.remove("interactive-request", "interactive-response", "pending-request");
    templateData.avatarContainer.classList.add("hidden");
    templateData.username.classList.add("hidden");
    templateData.requestHover.classList.add("hidden");
    templateData.checkpointContainer.classList.add("hidden");
    templateData.checkpointRestoreContainer.classList.add("hidden");
    templateData.footerToolbar.getElement().classList.add("hidden");
    if (templateData.titleToolbar) {
      templateData.titleToolbar.getElement().classList.add("hidden");
    }
    dom.clearNode(templateData.value);
    dom.clearNode(templateData.detail);
    const dividerContent = dom.$(".pending-divider-content");
    const label = dom.append(dividerContent, dom.$("span.pending-divider-label"));
    if (element.dividerKind === ChatRequestQueueKind.Steering) {
      if (element.isSystemInitiated) {
        label.textContent = localize("systemNotificationDivider", "System Notification");
        label.title = localize("systemNotificationDividerTooltip", "System notification will be sent after the next tool call happens");
      } else {
        label.textContent = localize("steeringDivider", "Steering");
        label.title = localize("steeringDividerTooltip", "Steering message will be sent after the next tool call happens");
      }
    } else {
      label.textContent = localize("queuedDivider", "Queued");
      label.title = localize("queuedDividerTooltip", "Queued messages will be sent after the current request completes");
    }
    templateData.value.appendChild(dividerContent);
  }
  renderDetail(element, templateData) {
    dom.clearNode(templateData.detail);
    if (element.agentOrSlashCommandDetected) {
      const msg = element.slashCommand ? localize("usedAgentSlashCommand", "used {0} [[(rerun without)]]", `${chatSubcommandLeader}${element.slashCommand.name}`) : localize("usedAgent", "[[(rerun without)]]");
      dom.reset(templateData.detail, renderFormattedText(msg, {
        actionHandler: {
          disposables: templateData.elementDisposables,
          callback: (content) => {
            this._onDidClickRerunWithAgentOrCommandDetection.fire(element);
          }
        }
      }, $("span.agentOrSlashCommandDetected")));
    } else if (this.rendererOptions.renderStyle !== "minimal" && !element.isComplete && !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
      templateData.detail.textContent = localize("working", "Working");
    }
  }
  renderConfirmationAction(element, templateData) {
    dom.clearNode(templateData.detail);
    if (element.confirmation) {
      dom.append(templateData.detail, $("span.codicon.codicon-check", { "aria-hidden": "true" }));
      dom.append(templateData.detail, $("span.confirmation-text", void 0, localize("chatConfirmationAction", 'Selected "{0}"', element.confirmation)));
      templateData.header?.classList.remove("header-disabled");
      templateData.header?.classList.add("partially-disabled");
    }
  }
  renderAvatar(element, templateData) {
    if (isPendingDividerVM(element)) {
      return;
    }
    let icon;
    if (isResponseVM(element)) {
      icon = this.getAgentIcon(element.agent?.metadata);
    } else if (isRequestVM(element)) {
      icon = element.avatarIcon ?? Codicon.account;
    } else {
      icon = Codicon.account;
    }
    if (icon instanceof URI) {
      const avatarIcon = dom.$("img.icon");
      avatarIcon.src = FileAccess.uriToBrowserUri(icon).toString(true);
      templateData.avatarContainer.replaceChildren(dom.$(".avatar", void 0, avatarIcon));
    } else {
      const avatarIcon = dom.$(ThemeIcon.asCSSSelector(icon));
      templateData.avatarContainer.replaceChildren(dom.$(".avatar.codicon-avatar", void 0, avatarIcon));
    }
  }
  getAgentIcon(agent) {
    if (agent?.themeIcon) {
      return agent.themeIcon;
    } else if (agent?.iconDark && isDark(this.themeService.getColorTheme().type)) {
      return agent.iconDark;
    } else if (agent?.icon) {
      return agent.icon;
    } else {
      return Codicon.chatSparkle;
    }
  }
  renderChatResponseBasic(element, index, templateData) {
    templateData.rowContainer.classList.toggle("chat-response-loading", isResponseVM(element) && !element.isComplete);
    this.finalizeCompletedResponseParts(element, templateData);
    const content = [];
    const isFiltered = !!element.errorDetails?.responseIsFiltered;
    if (!isFiltered) {
      content.push({ kind: "references", references: element.contentReferences });
      content.push(...annotateSpecialMarkdownContent(element.response.value));
      if (element.codeCitations.length) {
        content.push({ kind: "codeCitations", citations: element.codeCitations });
      }
    }
    if (element.model.response === element.model.entireResponse && !element.isCanceled && element.errorDetails?.message && element.errorDetails.message !== canceledName) {
      content.push({ kind: "errorDetails", errorDetails: element.errorDetails, isLast: getStickyScrollTargetItem(this.viewModel?.getItems() ?? []) === element });
    }
    const fileChangesSummaryPart = this.getChatFileChangesSummaryPart(element);
    if (fileChangesSummaryPart) {
      content.push(fileChangesSummaryPart);
    }
    const turnPillsPart = this.getChatTurnPillsPart(element);
    if (turnPillsPart) {
      content.push(turnPillsPart);
    }
    const workingProgress = this.shouldShowWorkingProgress(element, content, false, templateData);
    if (workingProgress) {
      content.push(workingProgress);
    }
    const diff = this.diff(templateData.renderedParts ?? [], content, element);
    this.renderChatContentDiff(diff, content, element, index, templateData);
    this.finalizeCompletedResponseParts(element, templateData);
  }
  finalizeCompletedResponseParts(element, templateData) {
    if (!element.isComplete && !element.isCanceled) {
      return;
    }
    const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
    if (lastThinking?.domNode && lastThinking.getIsActive()) {
      lastThinking.finalizeTitleIfDefault();
      lastThinking.markAsInactive();
    }
    this.finalizeAllSubagentParts(templateData, true);
  }
  shouldShowWorkingProgress(element, partsToRender, moreContentAvailable, templateData) {
    if (element.agentOrSlashCommandDetected || this.rendererOptions.renderStyle === "minimal" || element.isComplete || !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
      return void 0;
    }
    if (partsToRender.some((part) => part.kind === "planReview" && !part.isUsed)) {
      return void 0;
    }
    if (endsWithSubagentContent(partsToRender)) {
      return void 0;
    }
    if (isResponseVM(element)) {
      const widget = this.chatWidgetService.getWidgetBySessionResource(element.sessionResource);
      if (widget?.inputPart.hasActiveToolConfirmationCarousel) {
        const nonSubagentConfirmationCount = this.getPendingToolConfirmationCount(partsToRender, false);
        if (nonSubagentConfirmationCount > 0) {
          return {
            kind: "working",
            content: new MarkdownString().appendText(this.getConfirmationPendingLabel(nonSubagentConfirmationCount))
          };
        }
        if (this.getPendingToolConfirmationCount(partsToRender, true) > 0) {
          return void 0;
        }
        return {
          kind: "working",
          content: new MarkdownString().appendText(this.getConfirmationPendingLabel(1))
        };
      }
    }
    if (isWaitingForMcpServers(partsToRender)) {
      return void 0;
    }
    const workingParts = getWorkingProgressRelevantParts(partsToRender);
    const lastPart = findLastMeaningfulPart(workingParts);
    const endsWithCompletedQuestion = endsWithCompletedQuestionInteraction(workingParts);
    if (workingParts.some((part) => part.kind === "toolInvocation" && IChatToolInvocation.isStreaming(part))) {
      return void 0;
    }
    if (workingParts.some((part) => part.kind === "toolInvocation" && !IChatToolInvocation.isComplete(part) && isMcpToolInvocation(part))) {
      return void 0;
    }
    const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
    if (lastThinking && !endsWithCompletedQuestion) {
      return void 0;
    }
    if (lastPart && (lastPart.kind === "toolInvocation" || lastPart.kind === "toolInvocationSerialized")) {
      if (lastPart.isAttachedToThinking) {
        return void 0;
      }
      const isEffectivelyHiddenToolInvocation = IChatToolInvocation.isEffectivelyHidden(lastPart);
      const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
      if (!isEffectivelyHiddenToolInvocation && collapsedToolsMode !== CollapsedToolsDisplayMode.Off && this.shouldPinPart(lastPart, isResponseVM(element) ? element : void 0)) {
        return void 0;
      }
    }
    const hasRenderedThinkingPart = (templateData.renderedParts ?? []).some((part) => part instanceof ChatThinkingContentPart);
    const hasEditPillMarkdown = workingParts.some((part) => part.kind === "markdownContent" && this.hasEditCodeblockUri(part));
    if (hasRenderedThinkingPart && hasEditPillMarkdown) {
      return void 0;
    }
    if (!lastPart || lastPart.kind === "references" || lastPart.kind === "markdownContent" && !moreContentAvailable && this.hasBeenCaughtUpLongEnough(element) || (lastPart.kind === "toolInvocation" || lastPart.kind === "toolInvocationSerialized") && (IChatToolInvocation.isComplete(lastPart) || IChatToolInvocation.isEffectivelyHidden(lastPart)) || (lastPart.kind === "textEditGroup" || lastPart.kind === "notebookEditGroup") && lastPart.done && !workingParts.some((part) => part.kind === "toolInvocation" && !IChatToolInvocation.isComplete(part)) || lastPart.kind === "externalEdit" && !workingParts.some((part) => part.kind === "toolInvocation" && !IChatToolInvocation.isComplete(part)) || lastPart.kind === "progressTask" && lastPart.deferred.isSettled || endsWithCompletedQuestion || lastPart.kind === "mcpServersStarting" || lastPart.kind === "mcpAuthenticationRequired" || lastPart.kind === "mcpServersStartingSlow" || lastPart.kind === "disabledClaudeHooks" || lastPart.kind === "hook") {
      return { kind: "working" };
    }
    return void 0;
  }
  getPendingToolConfirmationCount(parts, includeSubagentConfirmations) {
    return parts.filter((part) => {
      if (part.kind !== "toolInvocation") {
        return false;
      }
      const state = part.state.get();
      return state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && !!state.confirmationMessages?.title && part.presentation !== "hidden" && part.source.type !== "mcp" && isSubagentToolInvocation(part) === includeSubagentConfirmations;
    }).length;
  }
  getConfirmationPendingLabel(count) {
    return count === 1 ? localize("confirmationPending", "1 confirmation pending") : localize("confirmationsPending", "{0} confirmations pending", count);
  }
  removeWorkingProgressContentPart(templateData) {
    const renderedParts = templateData.renderedParts;
    if (!renderedParts) {
      return;
    }
    for (let i = renderedParts.length - 1; i >= 0; i--) {
      const part = renderedParts[i];
      if (part instanceof ChatWorkingProgressContentPart) {
        part.dispose();
        part.domNode?.remove();
        renderedParts.splice(i, 1);
        this.fireItemHeightChange(templateData);
        return;
      }
    }
  }
  updateWorkingProgressForPendingConfirmations(templateData) {
    const originalElement = templateData.currentElement;
    queueMicrotask(() => {
      if (templateData.currentElement !== originalElement) {
        return;
      }
      this.doUpdateWorkingProgressForPendingConfirmations(templateData);
    });
  }
  doUpdateWorkingProgressForPendingConfirmations(templateData) {
    const element = templateData.currentElement;
    if (!isResponseVM(element)) {
      return;
    }
    const pendingConfirmationCount = this.getPendingToolConfirmationCount(element.response.value, false);
    if (pendingConfirmationCount === 0) {
      this.removeWorkingProgressContentPart(templateData);
      return;
    }
    const workingProgressPart = this.getWorkingProgressContentPart(templateData);
    if (workingProgressPart) {
      workingProgressPart.updateWorkingContent(new MarkdownString().appendText(this.getConfirmationPendingLabel(pendingConfirmationCount)));
    }
  }
  getWorkingProgressContentPart(templateData) {
    const renderedParts = templateData.renderedParts;
    if (!renderedParts) {
      return void 0;
    }
    for (let i = renderedParts.length - 1; i >= 0; i--) {
      const part = renderedParts[i];
      if (part instanceof ChatWorkingProgressContentPart) {
        return part;
      }
    }
    return void 0;
  }
  createUpdateWorkingProgressOnConfirmationEnd(toolInvocation, templateData) {
    if (this.workingProgressConfirmationEndListeners.has(toolInvocation)) {
      return void 0;
    }
    this.workingProgressConfirmationEndListeners.add(toolInvocation);
    let wasWaitingForConfirmation = false;
    const disposable = autorun((reader) => {
      const currentState = toolInvocation.state.read(reader);
      const isWaitingForConfirmation = currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation;
      if (wasWaitingForConfirmation && !isWaitingForConfirmation) {
        this.updateWorkingProgressForPendingConfirmations(templateData);
        this.workingProgressConfirmationEndListeners.delete(toolInvocation);
        disposable.dispose();
      }
      wasWaitingForConfirmation = isWaitingForConfirmation;
    });
    return toDisposable(() => {
      this.workingProgressConfirmationEndListeners.delete(toolInvocation);
      disposable.dispose();
    });
  }
  hasBeenCaughtUpLongEnough(element) {
    const lastRenderTime = element.renderData?.lastRenderTime;
    if (typeof lastRenderTime !== "number" || lastRenderTime === 0) {
      return false;
    }
    return Date.now() - lastRenderTime >= WORKING_CAUGHT_UP_DEBOUNCE_MS;
  }
  /**
   * Returns the last part that visually contributes to the response, skipping
   * empty markdown placeholders.
   */
  /**
   * True while we have caught up to streamed markdown but are still within the
   * {@link WORKING_CAUGHT_UP_DEBOUNCE_MS} window before the working indicator
   * should appear. The progressive render loop keeps polling in this state so
   * the indicator can still surface after a genuine pause, instead of being
   * dropped when the loop would otherwise stop (the debounce itself avoids
   * flicker during normal token streaming).
   */
  isWorkingProgressDebouncePending(element, partsToRender) {
    if (element.isComplete) {
      return false;
    }
    if (partsToRender.some((part) => part.kind === "working")) {
      return false;
    }
    return findLastMeaningfulPart(getWorkingProgressRelevantParts(partsToRender))?.kind === "markdownContent" && !this.hasBeenCaughtUpLongEnough(element);
  }
  getChatFileChangesSummaryPart(element) {
    if (this.shouldShowPillsSummary(element) || !this.shouldShowFileChangesSummary(element)) {
      return void 0;
    }
    const sessionType = getChatSessionType(element.sessionResource);
    if (!isAgentHostTarget(sessionType) && !element.model.entireResponse.value.some((part) => part.kind === "textEditGroup" || part.kind === "notebookEditGroup")) {
      return void 0;
    }
    return { kind: "changesSummary", requestId: element.requestId, sessionResource: element.sessionResource };
  }
  getChatTurnPillsPart(element) {
    if (!this.shouldShowPillsSummary(element)) {
      return void 0;
    }
    return { kind: "turnPills", requestId: element.requestId, sessionResource: element.sessionResource };
  }
  renderChatRequest(element, index, templateData) {
    templateData.rowContainer.classList.toggle("chat-response-loading", false);
    templateData.rowContainer.classList.toggle("pending-request", !!element.pendingKind);
    templateData.rowContainer.classList.toggle("system-initiated-request", !!element.isSystemInitiated);
    templateData.rowContainer.classList.toggle("terminal-command-request", !element.isSystemInitiated && element.isTerminalCommand);
    if (element.isSystemInitiated) {
      this.renderSystemInitiatedRequest(element, templateData);
      return;
    }
    if (element.pendingKind && this._pendingDragController) {
      templateData.rowContainer.dataset.pendingRequestId = element.id;
      templateData.rowContainer.dataset.pendingKind = element.pendingKind;
      const sameKindCount = (this.viewModel?.model.getPendingRequests() ?? []).filter((p) => p.kind === element.pendingKind).length;
      if (sameKindCount > 1) {
        const handle = dom.$(".chat-pending-drag-handle" + ThemeIcon.asCSSSelector(Codicon.gripper));
        templateData.rowContainer.prepend(handle);
        templateData.dragHandle = handle;
        this._pendingDragController.attachDragHandle(element, handle, templateData.rowContainer, templateData.elementDisposables);
      }
    }
    if (element.id === this.viewModel?.editing?.id) {
      this._onDidRerender.fire(templateData);
    }
    if (this.configService.getValue("chat.editRequests") !== "none" && this.rendererOptions.editable) {
      templateData.elementDisposables.add(dom.addDisposableListener(templateData.rowContainer, dom.EventType.KEY_DOWN, (e) => {
        const ev = new StandardKeyboardEvent(e);
        if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
          if (this.viewModel?.editing?.id !== element.id) {
            ev.preventDefault();
            ev.stopPropagation();
            this._onDidClickRequest.fire(templateData);
          }
        }
      }));
    }
    let content = [];
    const explicitFileOrImageVariables = element.variables.filter(isExplicitFileOrImageVariableEntry);
    const explicitImageVariables = explicitFileOrImageVariables.filter((variable) => variable.kind === "image");
    const explicitFileOrDirectoryVariables = element.variables.filter((variable) => variable.kind === "file" || variable.kind === "directory" || isPasteVariableEntry(variable));
    const otherVariables = element.variables.filter((variable) => !isExplicitFileOrImageVariableEntry(variable) && !isPasteVariableEntry(variable));
    if (!element.confirmation) {
      const markdown = isChatFollowup(element.message) ? element.message.message : this.markdownDecorationsRenderer.convertParsedRequestToMarkdown(element.sessionResource, element.message);
      const attachmentSummary = !element.messageText.trim() && !explicitFileOrImageVariables.length ? getExplicitFileOrImageAttachmentSummary(element.variables) : void 0;
      const requestMarkdown = markdown.trim() ? markdown : attachmentSummary;
      if (requestMarkdown) {
        content = [{ content: new MarkdownString(requestMarkdown), kind: "markdownContent" }];
      }
      if (this.rendererOptions.renderStyle === "minimal" && !element.isComplete) {
        templateData.value.classList.add("inline-progress");
        templateData.elementDisposables.add(toDisposable(() => templateData.value.classList.remove("inline-progress")));
        content.push({ content: new MarkdownString("<span></span>", { supportHtml: true }), kind: "markdownContent" });
      } else {
        templateData.value.classList.remove("inline-progress");
      }
    }
    dom.clearNode(templateData.value);
    const parts = [];
    const explicitImageAttachmentsPart = explicitImageVariables.length ? this.renderAttachments(explicitImageVariables, element.contentReferences, element.modelId, templateData, element.resolvedModelId) : void 0;
    if (explicitImageAttachmentsPart?.domNode) {
      explicitImageAttachmentsPart.domNode.classList.add("chat-request-attachment-cards", "chat-request-image-attachments");
      templateData.value.appendChild(explicitImageAttachmentsPart.domNode);
      templateData.elementDisposables.add(explicitImageAttachmentsPart);
    }
    const explicitFileAttachmentsPart = explicitFileOrDirectoryVariables.length ? this.renderAttachments(explicitFileOrDirectoryVariables, element.contentReferences, element.modelId, templateData) : void 0;
    if (explicitFileAttachmentsPart?.domNode) {
      explicitFileAttachmentsPart.domNode.classList.add("chat-request-attachment-cards", "chat-request-file-attachments");
      explicitFileAttachmentsPart.domNode.style.display = "flex";
      explicitFileAttachmentsPart.domNode.style.flexDirection = "column";
      explicitFileAttachmentsPart.domNode.style.alignItems = "flex-end";
      explicitFileAttachmentsPart.domNode.style.flexWrap = "nowrap";
      templateData.value.appendChild(explicitFileAttachmentsPart.domNode);
      templateData.elementDisposables.add(explicitFileAttachmentsPart);
    }
    const contentContainer = templateData.value;
    let inlineSlashCommandRendered = false;
    let codeBlockStartIndex = 0;
    content.forEach((data, contentIndex) => {
      const context = {
        element,
        elementIndex: index,
        contentIndex,
        content,
        container: templateData.rowContainer,
        editorPool: this._editorPool,
        diffEditorPool: this._diffEditorPool,
        currentWidth: this._currentLayoutWidth,
        onDidChangeVisibility: this._onDidChangeVisibility.event,
        inlineTextModels: this._inlineTextModels,
        codeBlockStartIndex,
        treeStartIndex: 0
        // no trees in requests
      };
      const newPart = this.renderChatContentPart(data, templateData, context);
      if (newPart) {
        if (this.rendererOptions.renderDetectedCommandsWithRequest && !inlineSlashCommandRendered && element.agentOrSlashCommandDetected && element.slashCommand && data.kind === "markdownContent") {
          if (newPart.domNode) {
            newPart.domNode.style.display = "inline-flex";
          }
          const cmdPart = this.instantiationService.createInstance(ChatAgentCommandContentPart, element.slashCommand, () => this._onDidClickRerunWithAgentOrCommandDetection.fire({ sessionResource: element.sessionResource, requestId: element.id }));
          contentContainer.appendChild(cmdPart.domNode);
          parts.push(cmdPart);
          inlineSlashCommandRendered = true;
        }
        if (newPart.domNode && !newPart.domNode.parentElement) {
          contentContainer.appendChild(newPart.domNode);
        }
        parts.push(newPart);
        codeBlockStartIndex += newPart.codeblocks?.length ?? 0;
      }
    });
    if (templateData.renderedParts) {
      dispose(templateData.renderedParts);
    }
    templateData.renderedParts = parts;
    if (otherVariables.length) {
      const newPart = this.renderAttachments(otherVariables, element.contentReferences, element.modelId, templateData);
      if (newPart.domNode) {
        templateData.value.appendChild(newPart.domNode);
      }
      templateData.elementDisposables.add(newPart);
    }
    if (!element.pendingKind && !element.confirmation && this.rendererOptions.renderStyle !== "minimal" && templateData.value.childElementCount > 0) {
      const timestamp = renderChatRequestTimestamp(templateData.requestTimestampContainer, element.requestTimestamp);
      if (timestamp?.hoverText) {
        templateData.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), timestamp.element, timestamp.hoverText));
      } else if (timestamp) {
        let requestTimingBounds;
        templateData.elementDisposables.add(dom.addDisposableListener(timestamp.element, dom.EventType.MOUSE_OVER, (e) => {
          const target = dom.isHTMLElement(e.target) ? e.target.closest(".chat-request-relative") : void 0;
          if (!dom.isHTMLElement(target) || !timestamp.element.contains(target)) {
            return;
          }
          const bounds = target.getBoundingClientRect();
          requestTimingBounds = bounds;
          timestamp.element.classList.add("chat-request-flip-reset");
          timestamp.element.classList.remove("chat-request-flip-active");
          timestamp.element.classList.toggle("chat-request-flip-down", e.clientY < bounds.top + bounds.height / 2);
          void timestamp.element.offsetWidth;
          timestamp.element.classList.remove("chat-request-flip-reset");
          void timestamp.element.offsetWidth;
          timestamp.element.classList.add("chat-request-flip-active");
        }));
        templateData.elementDisposables.add(dom.addDisposableListener(timestamp.element, dom.EventType.MOUSE_MOVE, (e) => {
          if (requestTimingBounds && (e.clientX < requestTimingBounds.left || e.clientX > requestTimingBounds.right || e.clientY < requestTimingBounds.top || e.clientY > requestTimingBounds.bottom)) {
            requestTimingBounds = void 0;
            timestamp.element.classList.remove("chat-request-flip-active");
          }
        }));
        templateData.elementDisposables.add(dom.addDisposableListener(timestamp.element, dom.EventType.MOUSE_LEAVE, () => {
          requestTimingBounds = void 0;
          timestamp.element.classList.remove("chat-request-flip-active");
        }));
        templateData.elementDisposables.add(dom.addDisposableListener(timestamp.element, dom.EventType.FOCUS, () => {
          timestamp.element.classList.remove("chat-request-flip-active", "chat-request-flip-down");
        }));
      }
    }
  }
  renderSystemInitiatedRequest(element, templateData) {
    dom.clearNode(templateData.value);
    if (templateData.renderedParts) {
      dispose(templateData.renderedParts);
    }
    templateData.renderedParts = [];
    const label = element.systemInitiatedLabel ?? element.messageText;
    const notificationPart = this.instantiationService.createInstance(
      ChatSystemNotificationContentPart,
      { kind: "systemNotification", content: new MarkdownString(label) },
      this.chatContentMarkdownRenderer
    );
    templateData.elementDisposables.add(notificationPart);
    templateData.value.appendChild(notificationPart.domNode);
  }
  /**
   * Smooth streaming render path — event-driven, rAF-batched.
   *
   * Does a render pass that feeds the full content through
   * `getNextProgressiveRenderContent` → `diff` → `renderChatContentDiff`,
   * where the morpher intercepts markdown appends and schedules
   * rAF-batched re-renders through the standard markdown pipeline.
   *
   * Called on every `renderElement` invocation (which fires each time
   * the model changes). On completion/cancellation the morpher's
   * content is already correctly rendered, so we do a final diff pass
   * (not a destructive re-render) to finalize non-markdown parts like
   * thinking indicators, error details, and code citations.
   */
  doIncrementalRender(element, index, templateData) {
    if (!this._isVisible) {
      return;
    }
    const rate = this.getProgressiveRenderRate(element);
    this._updateMorpherRate(templateData, rate, element.isComplete || element.isCanceled);
    if (element.isCanceled || element.isComplete) {
      element.renderData = void 0;
      templateData.rowContainer.classList.toggle("chat-response-loading", false);
      this.renderChatResponseBasic(element, index, templateData);
      return;
    }
    templateData.rowContainer.classList.toggle("chat-response-loading", true);
    const contentForThisTurn = this.getNextProgressiveRenderContent(element, templateData);
    const partsToRender = this.diff(templateData.renderedParts ?? [], contentForThisTurn.content, element);
    const contentIsAlreadyRendered = partsToRender.every((part) => part === null);
    if (!contentIsAlreadyRendered) {
      this.renderChatContentDiff(partsToRender, contentForThisTurn.content, element, index, templateData);
    }
  }
  /**
   * Propagate the stream's word-rate estimate to any active morpher's
   * word buffer so it reveals content at the model's speed.
   */
  _updateMorpherRate(templateData, rate, isComplete) {
    const renderedParts = templateData.renderedParts;
    if (!renderedParts) {
      return;
    }
    for (const part of renderedParts) {
      if (part instanceof ChatMarkdownContentPart) {
        part.updateStreamRate(rate, isComplete);
      }
    }
  }
  logIncrementalRenderingTelemetry() {
    if (this._incrementalRenderingTelemetryLogged) {
      return;
    }
    this._incrementalRenderingTelemetryLogged = true;
    this.telemetryService.publicLog2("chatIncrementalRenderingSettings", {
      animationStyle: this.configService.getValue(ChatConfiguration.IncrementalRenderingStyle) ?? "none",
      buffering: this.configService.getValue(ChatConfiguration.IncrementalRenderingBuffering) ?? "word"
    });
  }
  /**
   *	@returns true if progressive rendering should be considered complete- the element's data is fully rendered or the view is not visible
   */
  doNextProgressiveRender(element, index, templateData, isInRenderElement) {
    if (!this._isVisible) {
      return true;
    }
    if (element.isCanceled) {
      this.traceLayout("doNextProgressiveRender", `canceled, index=${index}`);
      element.renderData = void 0;
      this.renderChatResponseBasic(element, index, templateData);
      return true;
    }
    templateData.rowContainer.classList.toggle("chat-response-loading", true);
    this.traceLayout("doNextProgressiveRender", `START progressive render, index=${index}`);
    const contentForThisTurn = this.getNextProgressiveRenderContent(element, templateData);
    const partsToRender = this.diff(templateData.renderedParts ?? [], contentForThisTurn.content, element);
    const contentIsAlreadyRendered = partsToRender.every((part) => part === null);
    if (contentIsAlreadyRendered) {
      if (contentForThisTurn.moreContentAvailable) {
        this.traceLayout("doNextProgressiveRender", "not rendering any new content this tick, but more available");
        return false;
      } else if (element.isComplete) {
        this.traceLayout("doNextProgressiveRender", `END progressive render, index=${index} and clearing renderData, response is complete`);
        element.renderData = void 0;
        this.renderChatResponseBasic(element, index, templateData);
        return true;
      } else if (this.isWorkingProgressDebouncePending(element, contentForThisTurn.content)) {
        return false;
      } else {
        return true;
      }
    }
    this.traceLayout("doNextProgressiveRender", `doing progressive render, ${partsToRender.length} parts to render`);
    this.renderChatContentDiff(partsToRender, contentForThisTurn.content, element, index, templateData);
    return false;
  }
  renderChatContentDiff(partsToRender, contentForThisTurn, element, elementIndex, templateData) {
    const renderedParts = templateData.renderedParts ?? [];
    templateData.renderedParts = renderedParts;
    templateData.renderedContent = contentForThisTurn;
    let codeBlockStartIndex = 0;
    let treeStartIndex = 0;
    let displacedWorkingPart;
    partsToRender.forEach((partToRender, contentIndex) => {
      if (contentIndex > 0) {
        const prevPart = renderedParts[contentIndex - 1];
        if (prevPart) {
          codeBlockStartIndex += prevPart.codeblocks?.length ?? 0;
          if (prevPart instanceof ChatTreeContentPart) {
            treeStartIndex++;
          }
        }
      }
      const alreadyRenderedPart = templateData.renderedParts?.[contentIndex];
      if (!partToRender) {
        if (!templateData.renderedPartsMounted) {
          alreadyRenderedPart?.onDidRemount?.();
        }
        return;
      }
      if (partToRender.kind === "working" && displacedWorkingPart?.hasSameContent(partToRender, contentForThisTurn.slice(contentIndex + 1), element)) {
        renderedParts[contentIndex] = displacedWorkingPart;
        displacedWorkingPart = void 0;
        return;
      }
      const preserveWorkingPart = alreadyRenderedPart instanceof ChatWorkingProgressContentPart && partToRender.kind !== "working" && contentForThisTurn.slice(contentIndex + 1).some((part) => part.kind === "working");
      if (alreadyRenderedPart) {
        if (partToRender.kind === "thinking" && alreadyRenderedPart instanceof ChatThinkingContentPart) {
          if (!Array.isArray(partToRender.value)) {
            alreadyRenderedPart.updateThinking(partToRender);
          }
          renderedParts[contentIndex] = alreadyRenderedPart;
          return;
        } else if (alreadyRenderedPart instanceof ChatThinkingContentPart && this.shouldPinPart(partToRender, element)) {
          renderedParts[contentIndex] = alreadyRenderedPart;
          return;
        }
        if (partToRender.kind === "markdownContent" && alreadyRenderedPart instanceof ChatMarkdownContentPart && this.configService.getValue(ChatConfiguration.IncrementalRendering)) {
          if (alreadyRenderedPart.tryIncrementalUpdate(partToRender)) {
            renderedParts[contentIndex] = alreadyRenderedPart;
            return;
          }
        }
        if (preserveWorkingPart) {
          displacedWorkingPart = alreadyRenderedPart;
        } else {
          alreadyRenderedPart.dispose();
        }
        if (alreadyRenderedPart.domNode) {
          const thinkingToolWrapper = dom.findParentWithClass(alreadyRenderedPart.domNode, "chat-thinking-tool-wrapper");
          if (thinkingToolWrapper) {
            thinkingToolWrapper.replaceWith(alreadyRenderedPart.domNode);
          }
        }
      }
      const context = {
        element,
        elementIndex,
        content: contentForThisTurn,
        contentIndex,
        container: templateData.rowContainer,
        editorPool: this._editorPool,
        diffEditorPool: this._diffEditorPool,
        currentWidth: this._currentLayoutWidth,
        onDidChangeVisibility: this._onDidChangeVisibility.event,
        inlineTextModels: this._inlineTextModels,
        codeBlockStartIndex,
        treeStartIndex
      };
      const lastThinking = this.getLastThinkingPart(renderedParts);
      if (lastThinking && (partToRender.kind === "toolInvocation" || partToRender.kind === "toolInvocationSerialized" || partToRender.kind === "markdownContent" || partToRender.kind === "textEditGroup" || partToRender.kind === "externalEdit" || partToRender.kind === "hook") && this.shouldPinPart(partToRender, element)) {
        if (alreadyRenderedPart instanceof ChatMarkdownContentPart) {
          lastThinking.removeEditPillByPartId(alreadyRenderedPart.codeblocksPartId);
        }
        const newPart2 = this.renderChatContentPart(partToRender, templateData, context);
        if (newPart2) {
          renderedParts[contentIndex] = newPart2;
          alreadyRenderedPart?.domNode?.remove();
        }
        return;
      }
      const newPart = this.renderChatContentPart(partToRender, templateData, context);
      if (newPart) {
        renderedParts[contentIndex] = newPart;
        try {
          if (alreadyRenderedPart?.domNode) {
            if (newPart.domNode) {
              if (preserveWorkingPart) {
                alreadyRenderedPart.domNode.before(newPart.domNode);
              } else {
                alreadyRenderedPart.domNode.replaceWith(newPart.domNode);
              }
            } else {
              if (!preserveWorkingPart) {
                alreadyRenderedPart.domNode.remove();
              }
            }
          } else if (newPart.domNode && !newPart.domNode.parentElement) {
            templateData.value.appendChild(newPart.domNode);
          }
        } catch (err) {
          this.logService.error("ChatListItemRenderer#renderChatContentDiff: error replacing part", err);
        }
      } else {
        alreadyRenderedPart?.domNode?.remove();
      }
    });
    displacedWorkingPart?.dispose();
    displacedWorkingPart?.domNode?.remove();
    for (let i = partsToRender.length; i < renderedParts.length; i++) {
      const part = renderedParts[i];
      if (part) {
        part.dispose();
        part.domNode?.remove();
        delete renderedParts[i];
      }
    }
    const animateCollapse = templateData.wasResponseComplete === false && element.isComplete;
    this.updateCompletedResponseDisclosure(element, contentForThisTurn, templateData, animateCollapse);
    templateData.wasResponseComplete = element.isComplete;
  }
  updateCompletedResponseDisclosure(element, content, templateData, animateCollapse) {
    if (!element.isComplete || !this.configService.getValue(ChatConfiguration.CollapseCompletedResponses)) {
      this.removeCompletedResponseDisclosure(templateData);
      templateData.completedResponseDisclosureOpen = void 0;
      return;
    }
    const finalResponseStartIndex = getFinalResponseStartIndex(content);
    if (finalResponseStartIndex === void 0 || finalResponseStartIndex === 0 || !content.slice(0, finalResponseStartIndex).some((part) => part.kind !== "references" || part.references.length > 0)) {
      this.removeCompletedResponseDisclosure(templateData);
      return;
    }
    const collapseEndIndex = getCompletedResponseCollapseEndIndex(content, finalResponseStartIndex);
    if (collapseEndIndex === 0) {
      this.removeCompletedResponseDisclosure(templateData);
      return;
    }
    const collapseEndNode = templateData.renderedParts?.[collapseEndIndex]?.domNode;
    if (!collapseEndNode) {
      this.removeCompletedResponseDisclosure(templateData);
      return;
    }
    let existingDisclosure = templateData.completedResponseDisclosure;
    if (existingDisclosure?.contains(collapseEndNode)) {
      this.removeCompletedResponseDisclosure(templateData);
      existingDisclosure = void 0;
    }
    let collapseEndRoot = collapseEndNode;
    while (collapseEndRoot.parentElement && collapseEndRoot.parentElement !== templateData.value) {
      collapseEndRoot = collapseEndRoot.parentElement;
    }
    if (collapseEndRoot.parentElement !== templateData.value) {
      this.removeCompletedResponseDisclosure(templateData);
      return;
    }
    if (existingDisclosure && templateData.completedResponseCollapseEndIndex === collapseEndIndex && existingDisclosure.nextSibling === collapseEndRoot && templateData.renderedParts?.slice(0, collapseEndIndex).every((part) => !part?.domNode || existingDisclosure.contains(part.domNode))) {
      return;
    }
    this.removeCompletedResponseDisclosure(templateData);
    const valueChildren = Array.from(templateData.value.childNodes);
    const nodesToCollapse = valueChildren.slice(0, valueChildren.indexOf(collapseEndRoot));
    const stepCount = getVisibleCompletedResponseItemCount(nodesToCollapse);
    if (stepCount < 2) {
      return;
    }
    const details = document.createElement("details");
    details.classList.add("completed-response-disclosure");
    const summary = details.appendChild(document.createElement("summary"));
    summary.classList.add("completed-response-summary", "chat-used-context-label");
    const button = summary.appendChild($("span.monaco-button.monaco-text-button.monaco-icon-button"));
    const label = button.appendChild($("span.monaco-button-mdlabel"));
    const chevron = button.appendChild($("span.chat-collapsible-hover-chevron", { "aria-hidden": "true" }));
    chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
    label.textContent = formatCompletedResponseDisclosureLabel(stepCount, element.model.elapsedMs);
    const activeElement = dom.getActiveElement();
    const keepOpenForFocus = nodesToCollapse.some((node) => node.contains(activeElement));
    const shouldAnimateInitialCollapse = animateCollapse && !keepOpenForFocus && !this.accessibilityService.isMotionReduced() && templateData.completedResponseDisclosureOpen === void 0;
    if (keepOpenForFocus) {
      templateData.completedResponseDisclosureOpen = true;
    }
    details.open = templateData.completedResponseDisclosureOpen ?? shouldAnimateInitialCollapse;
    const updateExpansionState = () => {
      summary.setAttribute("aria-expanded", String(details.open));
      chevron.classList.toggle("expanded", details.open);
    };
    updateExpansionState();
    templateData.value.insertBefore(details, collapseEndRoot);
    details.append(...nodesToCollapse);
    templateData.completedResponseDisclosure = details;
    templateData.completedResponseCollapseEndIndex = collapseEndIndex;
    templateData.completedResponseDisclosureDisposables.add(dom.addDisposableListener(details, "toggle", () => {
      templateData.completedResponseDisclosureOpen = details.open;
      updateExpansionState();
    }));
    if (shouldAnimateInitialCollapse) {
      const targetWindow = dom.getWindow(details);
      const animationFrame = targetWindow.requestAnimationFrame(() => {
        if (templateData.completedResponseDisclosure === details && details.open) {
          details.open = false;
        }
      });
      templateData.completedResponseDisclosureDisposables.add(toDisposable(() => targetWindow.cancelAnimationFrame(animationFrame)));
    }
  }
  removeCompletedResponseDisclosure(templateData) {
    const details = templateData.completedResponseDisclosure;
    if (!details) {
      return;
    }
    templateData.completedResponseDisclosureDisposables.clear();
    while (details.childNodes.length > 1) {
      details.before(details.childNodes[1]);
    }
    details.remove();
    templateData.completedResponseDisclosure = void 0;
    templateData.completedResponseCollapseEndIndex = void 0;
  }
  /**
   * Returns all content parts that should be rendered, and trimmed markdown content. We will diff this with the current rendered set.
   */
  getNextProgressiveRenderContent(element, templateData) {
    const data = this.getDataForProgressiveRender(element);
    const incrementalRendering = this.configService.getValue(ChatConfiguration.IncrementalRendering) === true;
    const renderableResponse = annotateSpecialMarkdownContent(element.response.value);
    this.traceLayout("getNextProgressiveRenderContent", `Want to render ${data.numWordsToRender} at ${data.rate} words/s, counting...`);
    let numNeededWords = data.numWordsToRender;
    const partsToRender = [];
    partsToRender.push({ kind: "references", references: element.contentReferences });
    let moreContentAvailable = false;
    for (let i = 0; i < renderableResponse.length; i++) {
      const part = renderableResponse[i];
      if (part.kind === "markdownContent" && !incrementalRendering) {
        const wordCountResult = getNWords(part.content.value, numNeededWords);
        this.traceLayout("getNextProgressiveRenderContent", `  Chunk ${i}: Want to render ${numNeededWords} words and found ${wordCountResult.returnedWordCount} words. Total words in chunk: ${wordCountResult.totalWordCount}`);
        numNeededWords -= wordCountResult.returnedWordCount;
        if (wordCountResult.isFullString) {
          partsToRender.push(part);
          for (const nextPart of renderableResponse.slice(i + 1)) {
            if (nextPart.kind !== "markdownContent") {
              i++;
              partsToRender.push(nextPart);
            } else {
              break;
            }
          }
        } else {
          moreContentAvailable = true;
          partsToRender.push({ ...part, content: new MarkdownString(wordCountResult.value, part.content) });
        }
        if (numNeededWords <= 0) {
          if (renderableResponse.slice(i + 1).some((part2) => part2.kind === "markdownContent")) {
            moreContentAvailable = true;
          }
          break;
        }
      } else {
        partsToRender.push(part);
      }
    }
    const lastWordCount = element.contentUpdateTimings?.lastWordCount ?? 0;
    const newRenderedWordCount = data.numWordsToRender - numNeededWords;
    const bufferWords = lastWordCount - newRenderedWordCount;
    this.traceLayout("getNextProgressiveRenderContent", `Want to render ${data.numWordsToRender} words. Rendering ${newRenderedWordCount} words. Buffer: ${bufferWords} words`);
    if (newRenderedWordCount > 0 && newRenderedWordCount !== element.renderData?.renderedWordCount) {
      element.renderData = { lastRenderTime: Date.now(), renderedWordCount: newRenderedWordCount, renderedParts: partsToRender };
    }
    const workingProgress = this.shouldShowWorkingProgress(element, partsToRender, moreContentAvailable, templateData);
    if (workingProgress) {
      partsToRender.push(workingProgress);
    }
    const fileChangesSummaryPart = this.getChatFileChangesSummaryPart(element);
    if (fileChangesSummaryPart) {
      partsToRender.push(fileChangesSummaryPart);
    }
    const turnPillsPart = this.getChatTurnPillsPart(element);
    if (turnPillsPart) {
      partsToRender.push(turnPillsPart);
    }
    return { content: partsToRender, moreContentAvailable };
  }
  shouldShowFileChangesSummary(element) {
    const sessionType = getChatSessionType(element.sessionResource);
    const isLocalSession = sessionType === localChatSessionType || isAgentHostTarget(sessionType);
    return shouldShowFileChangesSummaryForSettings(
      element.isComplete,
      isLocalSession,
      this.configService.getValue("chat.checkpoints.showFileChanges")
    );
  }
  shouldShowPillsSummary(element) {
    return shouldShowPillsSummaryForSettings(
      element.isComplete,
      isAgentHostTarget(getChatSessionType(element.sessionResource)),
      this.configService.getValue(ChatConfiguration.TurnStatusPills)
    );
  }
  getDataForProgressiveRender(element) {
    const hasMarkdownParts = element.response.value.some((part) => part.kind === "markdownContent" && part.content.value.trim().length > 0);
    if (shouldRenderInitialProgressiveContentImmediately(element.isComplete, hasMarkdownParts, element.renderData !== void 0)) {
      return {
        numWordsToRender: Number.MAX_SAFE_INTEGER,
        rate: Number.MAX_SAFE_INTEGER
      };
    }
    const renderData = element.renderData ?? { lastRenderTime: 0, renderedWordCount: 0 };
    const rate = this.getProgressiveRenderRate(element);
    const numWordsToRender = renderData.lastRenderTime === 0 ? 1 : renderData.renderedWordCount + // Additional words to render beyond what's already rendered
    Math.floor((Date.now() - renderData.lastRenderTime) / 1e3 * rate);
    return {
      numWordsToRender,
      rate
    };
  }
  diff(renderedParts, contentToRender, element) {
    const diff = [];
    for (let i = 0; i < contentToRender.length; i++) {
      const content = contentToRender[i];
      const renderedPart = renderedParts[i];
      if (!renderedPart || !renderedPart.hasSameContent(content, contentToRender.slice(i + 1), element)) {
        diff.push(content);
      } else {
        diff.push(null);
      }
    }
    return diff;
  }
  hasEditCodeblockUri(part) {
    if (part.kind !== "markdownContent") {
      return false;
    }
    return hasEditCodeblockUriTag(part.content.value);
  }
  isCodeblockComplete(part, element) {
    if (part.kind !== "markdownContent") {
      return true;
    }
    return !isResponseVM(element) || element.isComplete || codeblockHasClosingBackticks(part.content.value);
  }
  // todo @justschen initially split up each of the checks to easily see what should be pinned/not pinned, we can probably consolidate this down by a lot once we're more confident in the logic.
  shouldPinPart(part, element) {
    const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
    if (part.kind === "thinking" || part.kind === "working") {
      return true;
    }
    if (part.kind === "undoStop") {
      return true;
    }
    if (part.kind === "hook") {
      if (part.subAgentInvocationId) {
        return false;
      }
      return part.hookType === HookType.PreToolUse || part.hookType === HookType.PostToolUse;
    }
    if (collapsedToolsMode === CollapsedToolsDisplayMode.Off) {
      return false;
    }
    if (this.hasEditCodeblockUri(part) || part.kind === "textEditGroup" || part.kind === "externalEdit") {
      return true;
    }
    const isMcpTool = (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && isMcpToolInvocation(part);
    if (isMcpTool) {
      return false;
    }
    const isMermaidTool = (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolId.toLowerCase().includes("mermaid");
    if (isMermaidTool) {
      return false;
    }
    const isAskQuestionsTool = (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && isAskQuestionsToolInvocation(part);
    if (isAskQuestionsTool) {
      return false;
    }
    if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && isSubagentToolInvocation(part)) {
      return false;
    }
    if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && (isCreateSessionTool(part.toolId) || isCreateChatTool(part.toolId) || isSendMessageTool(part.toolId))) {
      return false;
    }
    const isTerminalTool = (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolSpecificData?.kind === "terminal";
    const isContributedTerminalToolInvocation = element && (element.sessionResource.scheme !== Schemas.vscodeChatInput && getChatSessionType(element.sessionResource) !== localChatSessionType) && part.kind === "toolInvocationSerialized" && part.toolSpecificData?.kind === "terminal";
    if (isTerminalTool && !isContributedTerminalToolInvocation) {
      if (part.kind === "toolInvocation" && IChatToolInvocation.getConfirmationMessages(part)) {
        return false;
      }
      const terminalToolsInThinking = this.configService.getValue(ChatConfiguration.TerminalToolsInThinking);
      return !!terminalToolsInThinking;
    }
    if (part.kind === "toolInvocation") {
      const state = part.state.get();
      return shouldPinToolInvocationToThinking(state.type, !!IChatToolInvocation.getConfirmationMessages(part), toolInvocationHasMcpAppData(part));
    }
    if (part.kind === "toolInvocationSerialized") {
      return !toolInvocationHasMcpAppData(part);
    }
    return false;
  }
  getLastThinkingPart(renderedParts) {
    if (!renderedParts || renderedParts.length === 0) {
      return void 0;
    }
    for (let i = renderedParts.length - 1; i >= 0; i--) {
      const part = renderedParts[i];
      if (part instanceof ChatThinkingContentPart && part.getIsActive()) {
        return part;
      }
    }
    return void 0;
  }
  getLastThinkingPartForGroupedItem(context, templateData) {
    const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
    const displayMode = getEffectiveThinkingDisplayMode(this.configService, this.contextKeyService);
    if (lastThinking?.hasReasoningContent() && shouldStartNewCollapsedThinkingGroup(displayMode, "reasoning", "items")) {
      this.finalizeCurrentThinkingPart(context, templateData);
      return { part: void 0, separatedFromReasoning: true };
    }
    return { part: lastThinking, separatedFromReasoning: false };
  }
  /**
   * Determines if a thinking part at the given content index is "look-ahead complete".
   * A thinking part is look-ahead complete if there are subsequent parts that will NOT
   * be pinned to it, meaning we know this thinking part is already done even though
   * the overall response is still in progress.
   */
  isThinkingLookAheadComplete(context, element) {
    if (element?.isComplete) {
      return true;
    }
    for (let i = context.contentIndex + 1; i < context.content.length; i++) {
      const nextPart = context.content[i];
      if (!this.shouldPinPart(nextPart, element)) {
        return true;
      }
    }
    return false;
  }
  getSubagentPart(renderedParts, subAgentInvocationId) {
    if (!renderedParts || renderedParts.length === 0) {
      return void 0;
    }
    for (let i = renderedParts.length - 1; i >= 0; i--) {
      const part = renderedParts[i];
      if (part instanceof ChatSubagentContentPart) {
        if (subAgentInvocationId && part.subAgentInvocationId === subAgentInvocationId) {
          return part;
        }
        if (!subAgentInvocationId && part.getIsActive()) {
          return part;
        }
      }
    }
    return void 0;
  }
  finalizeAllSubagentParts(templateData, force = false) {
    if (!templateData.renderedParts) {
      return;
    }
    for (const part of templateData.renderedParts) {
      if (part instanceof ChatSubagentContentPart && part.getIsActive() && (force || !part.shouldRemainActive()) && (force || !part.hasToolsWaitingForConfirmation)) {
        part.markAsInactive(force);
      }
    }
  }
  handleSubagentToolGrouping(toolInvocation, subagentId, context, templateData, codeBlockStartIndex) {
    this.finalizeCurrentThinkingPart(context, templateData);
    const lastSubagent = this.getSubagentPart(templateData.renderedParts, subagentId);
    if (lastSubagent) {
      this.maybeRouteSubagentToolToCarousel(toolInvocation, lastSubagent, context, templateData, codeBlockStartIndex);
      if (!isParentSubagentTool(toolInvocation)) {
        lastSubagent.appendToolInvocation(toolInvocation, codeBlockStartIndex);
        return this.renderNoContent((other) => (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolCallId === toolInvocation.toolCallId);
      }
      return lastSubagent;
    }
    const subagentPart = this.instantiationService.createInstance(
      ChatSubagentContentPart,
      subagentId,
      toolInvocation,
      context,
      this.chatContentMarkdownRenderer,
      this._contentReferencesListPool,
      this._toolEditorPool,
      () => this._currentLayoutWidth.get(),
      this._announcedToolProgressKeys
    );
    this.maybeRouteSubagentToolToCarousel(toolInvocation, subagentPart, context, templateData, codeBlockStartIndex);
    if (!isParentSubagentTool(toolInvocation)) {
      subagentPart.appendToolInvocation(toolInvocation, codeBlockStartIndex);
    }
    return subagentPart;
  }
  /** Routes subagent confirmations to the input carousel and leaves a placeholder inline. */
  maybeRouteSubagentToolToCarousel(toolInvocation, subagentPart, context, templateData, codeBlockStartIndex) {
    if (!this.configService.getValue(ChatConfiguration.ToolConfirmationCarousel)) {
      return;
    }
    if (toolInvocation.kind !== "toolInvocation" || !isResponseVM(context.element)) {
      return;
    }
    if (isParentSubagentTool(toolInvocation) || toolInvocation.presentation === "hidden" || toolInvocation.source.type === "mcp") {
      return;
    }
    if (!!this.viewModel?.editing) {
      return;
    }
    const widget = this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource);
    if (!widget) {
      return;
    }
    const subAgentInvocationId = subagentPart.subAgentInvocationId;
    const agentName = subagentPart.getAgentLabel();
    const revealSubagent = (targetSubAgentId) => {
      const currentTemplateData = this.getTemplateDataForRequestId(context.element.id);
      const currentSubagentPart = this.getSubagentPart(currentTemplateData?.renderedParts, targetSubAgentId) ?? subagentPart;
      const chatResource = currentSubagentPart.getChatResource();
      if (this.environmentService.isSessionsWindow && chatResource) {
        void this.commandService.executeCommand(CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, { chatResource });
      } else {
        currentSubagentPart.domNode.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    const revealSubagentLabel = this.environmentService.isSessionsWindow ? localize("openSubagentChat", "Open {0} Chat", agentName) : void 0;
    const navigateToCarousel = (targetSubAgentId) => {
      widget.inputPart.activateCarouselForSubagent(targetSubAgentId);
    };
    const factory = (tool) => this.instantiationService.createInstance(
      ChatToolInvocationPart,
      tool,
      context,
      this.chatContentMarkdownRenderer,
      this._contentReferencesListPool,
      this._toolEditorPool,
      () => this._currentLayoutWidth.get(),
      this._announcedToolProgressKeys,
      codeBlockStartIndex
    );
    const addToolToCarousel = (tool) => {
      widget.inputPart.addToolToConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel);
      const listener = this.createUpdateWorkingProgressOnConfirmationEnd(tool, templateData);
      if (listener) {
        templateData.elementDisposables.add(listener);
      }
    };
    const shouldUseCarouselForTool = (tool, state) => this.configService.getValue(ChatConfiguration.ToolConfirmationCarousel) && !this.viewModel?.editing && tool.presentation !== "hidden" && tool.source.type !== "mcp" && state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && !!state.confirmationMessages?.title;
    subagentPart.enableCarouselMode(navigateToCarousel, addToolToCarousel, shouldUseCarouselForTool, widget.inputPart.onDidChangeActiveConfirmationSubagent);
    subagentPart.setConfirmationActive(widget.inputPart.activeConfirmationSubagentId === subAgentInvocationId);
    const toolState = toolInvocation.state.get();
    if (toolState.type === IChatToolInvocation.StateKind.WaitingForConfirmation && toolState.confirmationMessages?.title) {
      addToolToCarousel(toolInvocation);
    }
  }
  finalizeCurrentThinkingPart(context, templateData) {
    const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
    if (!lastThinking) {
      return;
    }
    const style = getEffectiveThinkingDisplayMode(this.configService, this.contextKeyService);
    if (style === ThinkingDisplayMode.CollapsedPreview) {
      lastThinking.collapseContent();
    }
    lastThinking.finalizeTitleIfDefault();
    lastThinking.resetId();
    lastThinking.markAsInactive();
  }
  renderChatContentPart(content, templateData, context) {
    try {
      if (content.kind === "thinking" && (Array.isArray(content.value) ? content.value.length === 0 : content.value === "")) {
        const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
        lastThinking?.resetId();
        return this.renderNoContent((other) => content.kind === other.kind);
      }
      const isResponseElement = isResponseVM(context.element);
      const shouldPin = this.shouldPinPart(content, isResponseElement ? context.element : void 0);
      if (context.element.isComplete && !shouldPin) {
        const elementTemplateData = this.getTemplateDataForRequestId(context.element.id);
        if (elementTemplateData?.renderedParts) {
          const lastThinking = this.getLastThinkingPart(elementTemplateData.renderedParts);
          if (lastThinking?.getIsActive()) {
            this.finalizeCurrentThinkingPart(context, elementTemplateData);
          }
        }
      }
      const isSubagentContent = (content.kind === "toolInvocation" || content.kind === "toolInvocationSerialized") && isSubagentToolInvocation(content);
      if (context.element.isComplete && !isSubagentContent) {
        const elementTemplateData = this.getTemplateDataForRequestId(context.element.id);
        if (elementTemplateData) {
          this.finalizeAllSubagentParts(elementTemplateData);
        }
      }
      if (content.kind === "treeData") {
        return this.renderTreeData(content, templateData, context);
      } else if (content.kind === "multiDiffData") {
        return this.renderMultiDiffData(content, templateData, context);
      } else if (content.kind === "progressMessage") {
        return this.instantiationService.createInstance(ChatProgressContentPart, content, this.chatContentMarkdownRenderer, context, void 0, void 0, void 0, void 0, content.shimmer);
      } else if (content.kind === "systemNotification") {
        return this.instantiationService.createInstance(ChatSystemNotificationContentPart, content, this.chatContentMarkdownRenderer);
      } else if (content.kind === "working") {
        return this.instantiationService.createInstance(ChatWorkingProgressContentPart, content, this.chatContentMarkdownRenderer, context);
      } else if (content.kind === "progressTask" || content.kind === "progressTaskSerialized") {
        return this.renderProgressTask(content, templateData, context);
      } else if (content.kind === "command") {
        return this.instantiationService.createInstance(ChatCommandButtonContentPart, content, context);
      } else if (content.kind === "textEditGroup") {
        return this.renderTextEdit(context, content, templateData);
      } else if (content.kind === "confirmation") {
        return this.renderConfirmation(context, content, templateData);
      } else if (content.kind === "warning") {
        return this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Warning, content.content, content, this.chatContentMarkdownRenderer);
      } else if (content.kind === "info") {
        return this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Info, content.content, content, this.chatContentMarkdownRenderer);
      } else if (content.kind === "hook") {
        return this.renderHookPart(content, context, templateData);
      } else if (content.kind === "markdownContent") {
        return this.renderMarkdown(content, templateData, context);
      } else if (content.kind === "references") {
        if (isResponseVM(context.element) && context.element.agent?.isDefault && !context.element.agent.modes.includes(ChatModeKind.Ask)) {
          return this.renderNoContent((other) => other.kind === content.kind);
        }
        return this.renderContentReferencesListData(content, void 0, context, templateData);
      } else if (content.kind === "codeCitations") {
        return this.renderCodeCitations(content, context, templateData);
      } else if (content.kind === "toolInvocation" || content.kind === "toolInvocationSerialized") {
        return this.renderToolInvocation(content, context, templateData);
      } else if (content.kind === "extensions") {
        return this.renderExtensionsContent(content, context, templateData);
      } else if (content.kind === "pullRequest") {
        return this.renderPullRequestContent(content, context, templateData);
      } else if (content.kind === "undoStop") {
        return this.renderUndoStop(content);
      } else if (content.kind === "errorDetails") {
        return this.renderChatErrorDetails(context, content, templateData);
      } else if (content.kind === "elicitation2" || content.kind === "elicitationSerialized") {
        return this.renderElicitation(context, content, templateData);
      } else if (content.kind === "questionCarousel") {
        return this.renderQuestionCarousel(context, content, templateData);
      } else if (content.kind === "planReview") {
        return this.renderPlanReview(context, content, templateData);
      } else if (content.kind === "changesSummary") {
        return this.renderChangesSummary(content, context, templateData);
      } else if (content.kind === "turnPills") {
        return this.renderTurnPills(content, context);
      } else if (content.kind === "mcpServersStarting") {
        return this.renderMcpServersInteractionRequired(content, context, templateData);
      } else if (content.kind === "mcpAuthenticationRequired") {
        return this.instantiationService.createInstance(ChatMcpAuthenticationContentPart, content);
      } else if (content.kind === "mcpServersStartingSlow") {
        return this.instantiationService.createInstance(ChatMcpServersStartingContentPart, content, {
          onDidFinishStarting: () => this.showWorkingProgressAfterMcp(context, templateData)
        });
      } else if (content.kind === "disabledClaudeHooks") {
        return this.renderDisabledClaudeHooks(content, context);
      } else if (content.kind === "thinking") {
        return this.renderThinkingPart(content, context, templateData);
      } else if (content.kind === "workspaceEdit") {
        return this.instantiationService.createInstance(ChatWorkspaceEditContentPart, content, context, this.chatContentMarkdownRenderer);
      } else if (content.kind === "externalEdit") {
        return this.renderExternalEdit(content, context, templateData);
      } else if (content.kind === "autoModeResolution") {
        return this.instantiationService.createInstance(ChatAutoModeResolutionContentPart, content, context, this.chatContentMarkdownRenderer);
      }
      return this.renderNoContent((other) => content.kind === other.kind);
    } catch (err) {
      alert(`Chat error: ${toErrorMessage(err, false)}`);
      this.logService.error("ChatListItemRenderer#renderChatContentPart: error rendering content", toErrorMessage(err, true));
      const errorPart = this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Error, new MarkdownString(localize("renderFailMsg", "Failed to render content") + `: ${toErrorMessage(err, false)}`), content, this.chatContentMarkdownRenderer);
      return {
        dispose: () => errorPart.dispose(),
        domNode: errorPart.domNode,
        hasSameContent: ((other) => content.kind === other.kind)
      };
    }
  }
  showWorkingProgressAfterMcp(context, templateData) {
    const originalElement = context.element;
    const originalRenderedParts = templateData.renderedParts;
    queueMicrotask(() => {
      if (!isResponseVM(originalElement) || templateData.currentElement !== originalElement || originalElement.isComplete || originalElement.isCanceled) {
        return;
      }
      if (!originalRenderedParts || templateData.renderedParts !== originalRenderedParts || originalRenderedParts.some((part) => part instanceof ChatWorkingProgressContentPart)) {
        return;
      }
      this.renderChatResponseBasic(originalElement, context.elementIndex, templateData);
      this.fireItemHeightChange(templateData);
    });
  }
  dispose() {
    this._announcedToolProgressKeys.clear();
    super.dispose();
  }
  renderChatErrorDetails(context, content, templateData) {
    if (!isResponseVM(context.element)) {
      return this.renderNoContent((other) => content.kind === other.kind);
    }
    const isLast = content.isLast;
    if (content.errorDetails.isQuotaExceeded) {
      const renderedError = this.instantiationService.createInstance(ChatQuotaExceededPart, context.element, content, this.chatContentMarkdownRenderer);
      return renderedError;
    } else if (content.errorDetails.isRateLimited && this.chatEntitlementService.anonymous) {
      const renderedError = this.instantiationService.createInstance(ChatAnonymousRateLimitedPart, content);
      return renderedError;
    } else if (content.errorDetails.confirmationButtons && isLast) {
      const level = content.errorDetails.level ?? ChatErrorLevel.Error;
      const errorConfirmation = this.instantiationService.createInstance(ChatErrorConfirmationContentPart, level, new MarkdownString(content.errorDetails.message), content, content.errorDetails.confirmationButtons, this.chatContentMarkdownRenderer, context);
      return errorConfirmation;
    } else {
      const level = content.errorDetails.level ?? ChatErrorLevel.Error;
      return this.instantiationService.createInstance(ChatErrorContentPart, level, new MarkdownString(content.errorDetails.message), content, this.chatContentMarkdownRenderer);
    }
  }
  renderUndoStop(content) {
    return this.renderNoContent((other) => other.kind === content.kind && other.id === content.id);
  }
  renderNoContent(equals) {
    return {
      dispose: () => {
      },
      domNode: void 0,
      hasSameContent: equals
    };
  }
  renderTreeData(content, templateData, context) {
    const data = content.treeData;
    const treePart = this.instantiationService.createInstance(ChatTreeContentPart, data, this._treePool);
    if (isResponseVM(context.element)) {
      const fileTreeFocusInfo = {
        treeDataId: data.uri.toString(),
        treeIndex: context.treeStartIndex,
        focus() {
          treePart.domFocus();
        }
      };
      treePart.addDisposable(treePart.onDidFocus(() => {
        this.focusedFileTreesByResponseId.set(context.element.id, fileTreeFocusInfo.treeIndex);
      }));
      const fileTrees = this.fileTreesByResponseId.get(context.element.id) ?? [];
      fileTrees.push(fileTreeFocusInfo);
      this.fileTreesByResponseId.set(context.element.id, distinct(fileTrees, (v) => v.treeDataId));
      treePart.addDisposable(toDisposable(() => this.fileTreesByResponseId.set(context.element.id, fileTrees.filter((v) => v.treeDataId !== data.uri.toString()))));
    }
    return treePart;
  }
  renderMultiDiffData(content, templateData, context) {
    const multiDiffPart = this.instantiationService.createInstance(ChatMultiDiffContentPart, content, context.element);
    return multiDiffPart;
  }
  renderContentReferencesListData(references, labelOverride, context, templateData) {
    const referencesPart = this.instantiationService.createInstance(ChatUsedReferencesListContentPart, references.references, labelOverride, context, this._contentReferencesListPool, { expandedWhenEmptyResponse: checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.referencesExpandedWhenEmptyResponse) });
    return referencesPart;
  }
  renderCodeCitations(citations, context, templateData) {
    const citationsPart = this.instantiationService.createInstance(ChatCodeCitationContentPart, citations, context);
    return citationsPart;
  }
  handleRenderedCodeblocks(element, part, codeBlockStartIndex) {
    if (!part.addDisposable || part.codeblocksPartId === void 0) {
      return;
    }
    const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id) ?? [];
    this.codeBlocksByResponseId.set(element.id, codeBlocksByResponseId);
    part.addDisposable(toDisposable(() => {
      const codeBlocksByResponseId2 = this.codeBlocksByResponseId.get(element.id);
      if (codeBlocksByResponseId2) {
        part.codeblocks?.forEach((info, i) => {
          const codeblock = codeBlocksByResponseId2[codeBlockStartIndex + i];
          if (codeblock?.ownerMarkdownPartId === part.codeblocksPartId) {
            delete codeBlocksByResponseId2[codeBlockStartIndex + i];
          }
        });
      }
    }));
    part.codeblocks?.forEach((info, i) => {
      codeBlocksByResponseId[codeBlockStartIndex + i] = info;
      const uri = info.uri;
      if (uri) {
        this.codeBlocksByEditorUri.set(uri, info);
        part.addDisposable(toDisposable(() => {
          const codeblock = this.codeBlocksByEditorUri.get(uri);
          if (codeblock?.ownerMarkdownPartId === part.codeblocksPartId) {
            this.codeBlocksByEditorUri.delete(uri);
          }
        }));
      }
    });
  }
  renderToolInvocation(toolInvocation, context, templateData) {
    if (IChatToolInvocation.isComplete(toolInvocation) && IChatToolInvocation.isEffectivelyHidden(toolInvocation)) {
      const msg = toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage;
      const text = typeof msg === "string" ? msg : msg?.value;
      if (!text || text.trim().length === 0) {
        return this.renderNoContent((other) => (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolCallId === toolInvocation.toolCallId);
      }
    }
    if (this.configService.getValue("chat.agent.thinking.collapsedTools") === CollapsedToolsDisplayMode.Off) {
      this.finalizeCurrentThinkingPart(context, templateData);
    }
    const codeBlockStartIndex = context.codeBlockStartIndex;
    let lazilyCreatedPart = void 0;
    const createToolPart = () => {
      lazilyCreatedPart = this.instantiationService.createInstance(ChatToolInvocationPart, toolInvocation, context, this.chatContentMarkdownRenderer, this._contentReferencesListPool, this._toolEditorPool, () => this._currentLayoutWidth.get(), this._announcedToolProgressKeys, codeBlockStartIndex);
      this.handleRenderedCodeblocks(context.element, lazilyCreatedPart, codeBlockStartIndex);
      return { domNode: lazilyCreatedPart.domNode, disposable: lazilyCreatedPart, part: lazilyCreatedPart };
    };
    const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
    if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off) {
      const { part: lastThinking, separatedFromReasoning } = this.getLastThinkingPartForGroupedItem(context, templateData);
      if (!lastThinking && !IChatToolInvocation.isEffectivelyHidden(toolInvocation) && this.shouldPinPart(toolInvocation, context.element) && shouldCreateGroupedThinkingPart(collapsedToolsMode, separatedFromReasoning)) {
        const thinkingPart = this.renderThinkingPart({
          kind: "thinking"
        }, context, templateData);
        if (thinkingPart instanceof ChatThinkingContentPart) {
          toolInvocation.isAttachedToThinking = true;
          thinkingPart.appendItem(createToolPart, toolInvocation.toolId, toolInvocation, templateData.value);
          this.setupConfirmationTransitionWatcher(toolInvocation, thinkingPart, () => lazilyCreatedPart, createToolPart, context, templateData);
        }
        return thinkingPart;
      }
      if (this.shouldPinPart(toolInvocation, context.element)) {
        if (lastThinking && !IChatToolInvocation.isEffectivelyHidden(toolInvocation)) {
          toolInvocation.isAttachedToThinking = true;
          lastThinking.appendItem(createToolPart, toolInvocation.toolId, toolInvocation, templateData.value);
          this.setupConfirmationTransitionWatcher(toolInvocation, lastThinking, () => lazilyCreatedPart, createToolPart, context, templateData);
          return this.renderNoContent((other, followingContent, element) => lazilyCreatedPart ? lazilyCreatedPart.hasSameContent(other, followingContent, element) : toolInvocation.kind === other.kind);
        }
      } else {
        this.finalizeCurrentThinkingPart(context, templateData);
      }
    }
    const subagentId = getSubagentId(toolInvocation);
    if (subagentId && isResponseVM(context.element) && !IChatToolInvocation.isEffectivelyHidden(toolInvocation)) {
      return this.handleSubagentToolGrouping(toolInvocation, subagentId, context, templateData, codeBlockStartIndex);
    }
    const { part } = createToolPart();
    if (this.configService.getValue(ChatConfiguration.ToolConfirmationCarousel) && toolInvocation.kind === "toolInvocation" && isResponseVM(context.element) && toolInvocation.source.type !== "mcp" && !this.viewModel?.editing) {
      const widget = this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource);
      if (widget) {
        const factory = (tool) => this.instantiationService.createInstance(
          ChatToolInvocationPart,
          tool,
          context,
          this.chatContentMarkdownRenderer,
          this._contentReferencesListPool,
          this._toolEditorPool,
          () => this._currentLayoutWidth.get(),
          this._announcedToolProgressKeys,
          codeBlockStartIndex
        );
        const routePartToCarousel = () => {
          widget.inputPart.addToolToConfirmationCarousel(toolInvocation, factory);
          dom.hide(part.domNode);
          return true;
        };
        let hasScheduledCarouselRoute = false;
        const scheduleRoutePartToCarousel = () => {
          if (hasScheduledCarouselRoute) {
            return;
          }
          hasScheduledCarouselRoute = true;
          part.addDisposable(dom.scheduleAtNextAnimationFrame(dom.getWindow(part.domNode), () => {
            hasScheduledCarouselRoute = false;
            const state = toolInvocation.state.get();
            if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages?.title && toolInvocation.presentation !== "hidden" && toolInvocation.source.type !== "mcp" && !this.viewModel?.editing) {
              routePartToCarousel();
            }
          }));
        };
        part.addDisposable(autorun((reader) => {
          const state = toolInvocation.state.read(reader);
          const isCarouselConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && !!state.confirmationMessages?.title && toolInvocation.presentation !== "hidden" && toolInvocation.source.type !== "mcp" && !this.viewModel?.editing;
          if (isCarouselConfirmation) {
            if (!routePartToCarousel()) {
              dom.hide(part.domNode);
              scheduleRoutePartToCarousel();
            }
          } else if (IChatToolInvocation.isEffectivelyHidden(toolInvocation, reader)) {
            this.updateWorkingProgressForPendingConfirmations(templateData);
            dom.hide(part.domNode);
          } else {
            this.updateWorkingProgressForPendingConfirmations(templateData);
            dom.show(part.domNode);
          }
        }));
      }
    }
    return part;
  }
  // watch for confirmation part transition when tool invocation is streaming
  setupConfirmationTransitionWatcher(toolInvocation, thinkingPart, getCreatedPart, createToolPart, context, templateData) {
    if (toolInvocation.kind !== "toolInvocation") {
      return;
    }
    const moveConfirmationWidgetOutOfThinking = () => {
      const createdPart = getCreatedPart();
      toolInvocation.isAttachedToThinking = false;
      let part;
      if (createdPart?.domNode) {
        part = createdPart;
        const wrapper = createdPart.domNode.parentElement;
        if (wrapper?.classList.contains("chat-thinking-tool-wrapper")) {
          wrapper.remove();
        }
        templateData.value.appendChild(createdPart.domNode);
        thinkingPart.removeMaterializedItem(toolInvocation.toolCallId);
        (templateData.movedOutToolParts ??= new DisposableMap()).set(toolInvocation.toolCallId, createdPart);
      } else {
        thinkingPart.removeLazyItem(toolInvocation.toolId);
        const { domNode, part: createdPart2 } = createToolPart();
        part = createdPart2;
        (templateData.movedOutToolParts ??= new DisposableMap()).set(toolInvocation.toolCallId, createdPart2);
        templateData.value.appendChild(domNode);
      }
      this.finalizeCurrentThinkingPart(context, templateData);
      if (thinkingPart.isEffectivelyEmpty()) {
        thinkingPart.domNode?.remove();
        thinkingPart.dispose();
      }
      return part;
    };
    const isWorkingState = (type) => type === IChatToolInvocation.StateKind.Streaming || type === IChatToolInvocation.StateKind.Executing;
    const tryRouteConfirmationToCarousel = () => {
      if (!this.configService.getValue(ChatConfiguration.ToolConfirmationCarousel) || !isResponseVM(context.element) || this.viewModel?.editing || toolInvocation.presentation === "hidden" || toolInvocation.source.type === "mcp") {
        return false;
      }
      const state = toolInvocation.state.get();
      if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
        return false;
      }
      const widget = this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource);
      if (!widget) {
        return false;
      }
      const part = moveConfirmationWidgetOutOfThinking();
      const factory = (tool) => this.instantiationService.createInstance(
        ChatToolInvocationPart,
        tool,
        context,
        this.chatContentMarkdownRenderer,
        this._contentReferencesListPool,
        this._toolEditorPool,
        () => this._currentLayoutWidth.get(),
        this._announcedToolProgressKeys,
        context.codeBlockStartIndex
      );
      part.addDisposable(autorun((reader) => {
        const currentState2 = toolInvocation.state.read(reader);
        if (currentState2.type === IChatToolInvocation.StateKind.WaitingForConfirmation && currentState2.confirmationMessages?.title) {
          widget.inputPart.addToolToConfirmationCarousel(toolInvocation, factory);
          dom.hide(part.domNode);
        } else if (IChatToolInvocation.isEffectivelyHidden(toolInvocation, reader)) {
          this.updateWorkingProgressForPendingConfirmations(templateData);
          dom.hide(part.domNode);
        } else {
          this.updateWorkingProgressForPendingConfirmations(templateData);
          dom.show(part.domNode);
        }
      }));
      return true;
    };
    const currentState = toolInvocation.state.get();
    if (toolInvocationHasMcpAppData(toolInvocation)) {
      moveConfirmationWidgetOutOfThinking();
      return;
    }
    if (currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
      if (!tryRouteConfirmationToCarousel()) {
        moveConfirmationWidgetOutOfThinking();
      }
      return;
    }
    if (currentState.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
      moveConfirmationWidgetOutOfThinking();
      return;
    }
    if (!isWorkingState(currentState.type)) {
      return;
    }
    let didMoveToolOut = false;
    const disposable = autorun((reader) => {
      const state = toolInvocation.state.read(reader);
      toolInvocation.toolSpecificDataKind.read(reader);
      if (toolInvocationHasMcpAppData(toolInvocation)) {
        if (didMoveToolOut) {
          return;
        }
        didMoveToolOut = true;
        disposable.dispose();
        moveConfirmationWidgetOutOfThinking();
        return;
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
        if (didMoveToolOut) {
          return;
        }
        didMoveToolOut = true;
        disposable.dispose();
        if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !tryRouteConfirmationToCarousel()) {
          moveConfirmationWidgetOutOfThinking();
        }
      }
    });
    thinkingPart.addDisposable(disposable);
  }
  renderExtensionsContent(extensionsContent, context, templateData) {
    const part = this.instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent);
    return part;
  }
  renderHookPart(hookPart, context, templateData) {
    if (!(hookPart.stopReason || hookPart.systemMessage)) {
      return this.renderNoContent((other) => other.kind === "hook" && other.hookType === hookPart.hookType);
    }
    if (hookPart.subAgentInvocationId) {
      const subagentPart = this.getSubagentPart(templateData.renderedParts, hookPart.subAgentInvocationId);
      if (subagentPart) {
        subagentPart.appendHookItem(() => {
          const part2 = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
          return { domNode: part2.domNode, disposable: part2 };
        }, hookPart);
        return this.renderNoContent((other) => other.kind === "hook" && other.hookType === hookPart.hookType && other.subAgentInvocationId === hookPart.subAgentInvocationId);
      }
    }
    const shouldPinToThinking = hookPart.hookType === HookType.PreToolUse || hookPart.hookType === HookType.PostToolUse;
    if (shouldPinToThinking) {
      const hookTitle = hookPart.stopReason ? hookPart.toolDisplayName ? localize("hook.thinking.blocked", "Blocked {0}", hookPart.toolDisplayName) : localize("hook.thinking.blockedGeneric", "Blocked by hook") : hookPart.toolDisplayName ? localize("hook.thinking.warning", "Used {0}, but received a warning", hookPart.toolDisplayName) : localize("hook.thinking.warningGeneric", "Tool call received a warning");
      let { part: thinkingPart } = this.getLastThinkingPartForGroupedItem(context, templateData);
      if (!thinkingPart) {
        const newThinking = this.renderThinkingPart({ kind: "thinking" }, context, templateData);
        if (newThinking instanceof ChatThinkingContentPart) {
          thinkingPart = newThinking;
        }
      }
      if (thinkingPart) {
        thinkingPart.appendItem(() => {
          const part2 = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
          return { domNode: part2.domNode, disposable: part2 };
        }, hookTitle, void 0, templateData.value);
        return thinkingPart;
      }
    }
    const part = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
    return part;
  }
  renderPullRequestContent(pullRequestContent, context, templateData) {
    const part = this.instantiationService.createInstance(ChatPullRequestContentPart, pullRequestContent);
    return part;
  }
  renderProgressTask(task, templateData, context) {
    if (!isResponseVM(context.element)) {
      return;
    }
    this.finalizeCurrentThinkingPart(context, templateData);
    const taskPart = this.instantiationService.createInstance(ChatTaskContentPart, task, this._contentReferencesListPool, this.chatContentMarkdownRenderer, context);
    return taskPart;
  }
  renderConfirmation(context, confirmation, templateData) {
    const part = this.instantiationService.createInstance(ChatConfirmationContentPart, confirmation, context);
    return part;
  }
  renderElicitation(context, elicitation, templateData) {
    if (elicitation.kind === "elicitationSerialized" ? elicitation.isHidden : elicitation.isHidden?.get()) {
      return this.renderNoContent((other) => elicitation.kind === other.kind);
    }
    this.finalizeCurrentThinkingPart(context, templateData);
    const part = this.instantiationService.createInstance(ChatElicitationContentPart, elicitation, context);
    return part;
  }
  renderQuestionCarousel(context, carousel, templateData) {
    this.finalizeCurrentThinkingPart(context, templateData);
    this._notifyOnQuestionCarousel(context, carousel);
    if (!carousel.terminalId && isResponseVM(context.element)) {
      const responseElement = context.element;
      const model = this.chatService.getSession(responseElement.sessionResource);
      const request = model?.getRequests().find((r) => r.id === responseElement.requestId);
      if (request?.terminalExecutionId) {
        carousel.terminalId = request.terminalExecutionId;
        this.logService.trace(`ChatListItemRenderer#renderQuestionCarousel: backfilled terminalId=${carousel.terminalId} for request=${responseElement.requestId}`);
      } else {
        this.logService.trace(`ChatListItemRenderer#renderQuestionCarousel: no terminalExecutionId to backfill for request=${responseElement.requestId}`);
      }
    }
    const widget = isResponseVM(context.element) ? this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource) : void 0;
    const shouldAutoFocus = !!widget && dom.isAncestorOfActiveElement(widget.domNode) && widget.getInput() === "";
    const responseId = isResponseVM(context.element) ? context.element.requestId : void 0;
    const carouselKey = carousel.resolveId ?? `${responseId ?? ""}_${context.contentIndex}`;
    const handleSubmit = async (answers, part2) => {
      if (carousel.isUsed) {
        return;
      }
      const answersRecord = answers ? Object.fromEntries(answers) : void 0;
      carousel.data = answersRecord ?? {};
      carousel.isUsed = true;
      if (carousel instanceof ChatQuestionCarouselData) {
        carousel.draftAnswers = void 0;
        carousel.draftCurrentIndex = void 0;
        carousel.completion.complete({ answers: answersRecord });
      }
      if (isResponseVM(context.element) && carousel.resolveId) {
        this.chatService.notifyQuestionCarouselAnswer(context.element.requestId, carousel.resolveId, answersRecord);
      }
      this.removeCarouselFromTracking(context, part2);
      widget?.input.clearQuestionCarousel(void 0, carouselKey);
    };
    const responseIsComplete = isResponseVM(context.element) && context.element.isComplete;
    const inputPartHasCarousel = widget?.input.questionCarousel !== void 0;
    if (carousel.isUsed || responseIsComplete) {
      if (responseIsComplete && !carousel.isUsed && isResponseVM(context.element) && carousel.resolveId) {
        carousel.data = {};
        carousel.isUsed = true;
        if (carousel instanceof ChatQuestionCarouselData) {
          carousel.draftAnswers = void 0;
          carousel.draftCurrentIndex = void 0;
          carousel.completion.complete({ answers: void 0 });
        }
        this.chatService.notifyQuestionCarouselAnswer(context.element.requestId, carousel.resolveId, void 0);
        this.pendingQuestionCarousels.get(context.element.sessionResource)?.clear();
      }
      if (inputPartHasCarousel) {
        if (carousel.isUsed) {
          widget?.input.clearQuestionCarousel(void 0, carouselKey);
        } else if (responseIsComplete && responseId) {
          widget?.input.clearQuestionCarousel(responseId);
        }
      }
      const part2 = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, {
        shouldAutoFocus: false,
        onSubmit: async (answers) => handleSubmit(answers, part2)
      });
      return part2;
    }
    const isEditing = !!this.viewModel?.editing;
    const part = isEditing ? void 0 : widget?.input.renderQuestionCarousel(carousel, context, {
      shouldAutoFocus,
      onSubmit: async (answers) => handleSubmit(answers, part)
    });
    if (!part) {
      const fallbackPart = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, {
        shouldAutoFocus,
        onSubmit: async (answers) => handleSubmit(answers, fallbackPart)
      });
      return fallbackPart;
    }
    if (isResponseVM(context.element) && carousel.allowSkip && !carousel.isUsed) {
      let carousels = this.pendingQuestionCarousels.get(context.element.sessionResource);
      if (!carousels) {
        carousels = /* @__PURE__ */ new Set();
        this.pendingQuestionCarousels.set(context.element.sessionResource, carousels);
      }
      if (!carousels.has(part)) {
        carousels.add(part);
        part.addDisposable({ dispose: () => this.removeCarouselFromTracking(context, part) });
      }
    }
    return this.renderNoContent((other, _followingContent, element) => {
      if (carousel.isUsed || isResponseVM(element) && element.isComplete) {
        return false;
      }
      if (other.kind === "questionCarousel") {
        const otherCarousel = other;
        if (carousel.resolveId && otherCarousel.resolveId) {
          return carousel.resolveId === otherCarousel.resolveId;
        }
        return other === carousel;
      }
      return false;
    });
  }
  _getCarouselStableKey(context, carousel) {
    const requestId = isResponseVM(context.element) ? context.element.requestId : void 0;
    if (!requestId || !carousel.resolveId) {
      return void 0;
    }
    return `${requestId}::${carousel.resolveId}`;
  }
  _notifyOnQuestionCarousel(context, carousel) {
    if (carousel.isUsed) {
      return;
    }
    const stableKey = this._getCarouselStableKey(context, carousel);
    if (stableKey ? this._notifiedQuestionCarousels.has(stableKey) : false) {
      return;
    }
    const questionCount = carousel.questions.length;
    const question = carousel.questions.length > 0 && carousel.questions[0].message ? carousel.questions[0].message : localize("chat.questionCarouselNeedsInputSR", "Chat input required.");
    const stringQuestion = typeof question === "string" ? question : question.value;
    const alertMessage = questionCount === 1 ? localize("chat.questionCarouselAlertOne", "Chat input required (1 question): {0}", stringQuestion) : localize("chat.questionCarouselAlertMany", "Chat input required ({0} questions): {1}", questionCount, stringQuestion);
    this.accessibilityService.alert(alertMessage);
    if (stableKey) {
      this._notifiedQuestionCarousels.add(stableKey);
    }
    const signalMessage = questionCount === 1 ? localize("chat.questionCarouselSignalOne", "Chat needs your input (1 question).") : localize("chat.questionCarouselSignalMany", "Chat needs your input ({0} questions).", questionCount);
    this.accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { allowManyInParallel: true, customAlertMessage: signalMessage });
  }
  renderPlanReview(context, review, templateData) {
    const widget = isResponseVM(context.element) ? this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource) : void 0;
    const responseId = isResponseVM(context.element) ? context.element.requestId : void 0;
    const reviewKey = review.resolveId ?? `${responseId ?? ""}_${context.contentIndex}`;
    this.finalizeCurrentThinkingPart(context, templateData);
    const handleSubmit = (result) => {
      review.data = result;
      review.isUsed = true;
      if (review instanceof ChatPlanReviewData) {
        review.completion.complete(result);
      }
      widget?.input.clearPlanReview(void 0, reviewKey);
    };
    const responseIsComplete = isResponseVM(context.element) && context.element.isComplete;
    if (responseIsComplete && !review.isUsed) {
      review.isUsed = true;
      if (review instanceof ChatPlanReviewData) {
        review.completion.complete(void 0);
      }
    }
    if (responseIsComplete && responseId) {
      widget?.input.clearPlanReview(responseId);
    }
    const renderProgress = () => {
      const message = this.getPlanReviewProgressMessage(review);
      if (!message) {
        return this.renderNoContent((other) => other.kind === "planReview");
      }
      const renderedAsUsed = !!review.isUsed;
      const isPending = !renderedAsUsed;
      const content = buildPlanReviewProgressContent(review, message);
      const progressPart = this.instantiationService.createInstance(
        ChatProgressContentPart,
        { content },
        this.chatContentMarkdownRenderer,
        context,
        /* forceShowSpinner */
        isPending,
        /* forceShowMessage */
        true,
        /* icon */
        isPending ? void 0 : Codicon.check,
        void 0,
        /* shimmer */
        isPending
      );
      return {
        domNode: progressPart.domNode,
        dispose: () => progressPart.dispose(),
        hasSameContent: (other, _followingContent, _element) => {
          if (other.kind !== "planReview") {
            return false;
          }
          if (!!review.isUsed !== renderedAsUsed) {
            return false;
          }
          if (review.resolveId && other.resolveId) {
            return review.resolveId === other.resolveId;
          }
          return other === review;
        }
      };
    };
    if (review.isUsed) {
      return renderProgress();
    }
    const isEditing = !!this.viewModel?.editing;
    const dockedPart = isEditing ? void 0 : widget?.input.renderPlanReview(review, context, {
      onSubmit: handleSubmit
    });
    if (!dockedPart) {
      const fallbackPart = this.instantiationService.createInstance(ChatPlanReviewPart, review, context, {
        onSubmit: handleSubmit
      });
      return fallbackPart;
    }
    return renderProgress();
  }
  getPlanReviewProgressMessage(review) {
    if (!review.isUsed) {
      return localize("chat.planReview.required", "Plan review required");
    }
    const result = review.data;
    if (!result) {
      return void 0;
    }
    if (result.rejected) {
      return localize("chat.planReview.rejected", "Rejected plan");
    }
    if (result.feedback) {
      return localize("chat.planReview.feedback", "Provided feedback");
    }
    const action = review.actions.find((a) => a.label === result.action);
    if (action?.permissionLevel === "autopilot") {
      return localize("chat.planReview.autopilot", "Started implementation with Autopilot");
    }
    return localize("chat.planReview.approved", "Approved plan");
  }
  removeCarouselFromTracking(context, part) {
    if (isResponseVM(context.element)) {
      const carousels = this.pendingQuestionCarousels.get(context.element.sessionResource);
      if (carousels) {
        carousels.delete(part);
      }
    }
  }
  renderChangesSummary(content, context, templateData) {
    const part = this.instantiationService.createInstance(ChatCheckpointFileChangesSummaryContentPart, content, context);
    return part;
  }
  renderTurnPills(content, context) {
    return this.instantiationService.createInstance(ChatTurnPillsContentPart, content, context);
  }
  renderAttachments(variables, contentReferences, modelId, templateData, resolvedModelId) {
    return this.instantiationService.createInstance(ChatAttachmentsContentPart, {
      variables,
      contentReferences,
      modelId,
      resolvedModelId,
      domNode: void 0
    });
  }
  renderTextEdit(context, chatTextEdit, templateData) {
    const textEditPart = this.instantiationService.createInstance(ChatTextEditContentPart, chatTextEdit, context, this.rendererOptions, this._diffEditorPool, this._currentLayoutWidth.get());
    return textEditPart;
  }
  renderExternalEdit(content, context, templateData) {
    const editPart = this.instantiationService.createInstance(ChatExternalEditContentPart, content, context);
    const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
    if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off && this.shouldPinPart(content, context.element)) {
      const partId = `externalEdit-${content.uri.toString()}-${content.undoStopId ?? ""}`;
      const { part: lastThinking, separatedFromReasoning } = this.getLastThinkingPartForGroupedItem(context, templateData);
      if (!lastThinking && shouldCreateGroupedThinkingPart(collapsedToolsMode, separatedFromReasoning)) {
        const thinkingPart = this.renderThinkingPart({ kind: "thinking" }, context, templateData);
        if (thinkingPart instanceof ChatThinkingContentPart) {
          thinkingPart.appendItem(
            () => ({ domNode: editPart.domNode, disposable: editPart }),
            partId,
            content,
            templateData.value,
            editPart.onDidChangeDiff,
            editPart
          );
        }
        return thinkingPart;
      }
      if (lastThinking) {
        lastThinking.appendItem(
          () => ({ domNode: editPart.domNode, disposable: editPart }),
          partId,
          content,
          templateData.value,
          editPart.onDidChangeDiff,
          editPart
        );
        return this.renderNoContent((other) => other.kind === content.kind);
      }
    }
    return editPart;
  }
  renderMarkdown(markdown, templateData, context) {
    const element = context.element;
    const isBlankMarkdown = !markdown.content.value.trim();
    const hasPendingEditCodeblock = isResponseVM(element) && !element.isComplete && hasCodeblockUriTag(markdown.content.value) && !codeblockHasClosingBackticks(markdown.content.value);
    if (!this.hasEditCodeblockUri(markdown) && !isBlankMarkdown && !hasPendingEditCodeblock) {
      this.finalizeCurrentThinkingPart(context, templateData);
    }
    const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete || !!element.renderData);
    const codeBlockStartIndex = context.codeBlockStartIndex;
    const markdownPart = templateData.instantiationService.createInstance(ChatMarkdownContentPart, markdown, context, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.chatContentMarkdownRenderer, void 0, this._currentLayoutWidth.get(), { codeBlockRenderOptions: this.rendererOptions.codeBlockRenderOptions });
    markdownPart.addDisposable(markdownPart.onDidChangeHeight(() => this.fireItemHeightChange(templateData)));
    if (isRequestVM(element)) {
      markdownPart.domNode.tabIndex = 0;
      if (this.configService.getValue("chat.editRequests") === "inline" && this.rendererOptions.editable) {
        markdownPart.domNode.classList.add("clickable");
        markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.CLICK, (e) => {
          if (this.viewModel?.editing?.id === element.id) {
            return;
          }
          const clickedElement = e.target;
          if (clickedElement.tagName === "A") {
            return;
          }
          const selection = dom.getWindow(templateData.rowContainer).getSelection();
          if (selection && !selection.isCollapsed && selection.toString().length > 0) {
            return;
          }
          const monacoEditor = dom.findParentWithClass(clickedElement, "monaco-editor");
          if (monacoEditor) {
            const editorPart = Array.from(this.editorsInUse()).find((editor) => editor.element.contains(monacoEditor));
            if (editorPart?.editor.getSelection()?.isEmpty() === false) {
              return;
            }
          }
          e.preventDefault();
          e.stopPropagation();
          this._onDidClickRequest.fire(templateData);
        }));
        markdownPart.addDisposable(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), markdownPart.domNode, localize("requestMarkdownPartTitle", "Click to Edit"), { trapFocus: true }));
      }
      markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.FOCUS, () => {
        this.hoverVisible(templateData.requestHover);
      }));
      markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.BLUR, () => {
        this.hoverHidden(templateData.requestHover);
      }));
    }
    this.handleRenderedCodeblocks(element, markdownPart, codeBlockStartIndex);
    const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
    if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off) {
      const isComplete = this.isCodeblockComplete(markdown, context.element);
      const subAgentInvocationId = extractSubAgentInvocationIdFromText(markdown.content.value);
      if (subAgentInvocationId) {
        const subagentPart = this.getSubagentPart(templateData.renderedParts, subAgentInvocationId);
        if (subagentPart && markdownPart?.domNode && isComplete) {
          subagentPart.appendMarkdownItem(
            () => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
            markdownPart.codeblocksPartId,
            markdown,
            templateData.value,
            markdownPart
          );
          return this.renderNoContent((other) => other.kind === "markdownContent" && other.content.value === markdown.content.value && extractSubAgentInvocationIdFromText(other.content.value) === subAgentInvocationId);
        }
      }
      const shouldPin = this.shouldPinPart(markdown, context.element);
      if (markdownPart?.domNode && shouldPin && isComplete) {
        const { part: lastThinking, separatedFromReasoning } = this.getLastThinkingPartForGroupedItem(context, templateData);
        if (!lastThinking && shouldCreateGroupedThinkingPart(collapsedToolsMode, separatedFromReasoning)) {
          const thinkingPart = this.renderThinkingPart({
            kind: "thinking"
          }, context, templateData);
          if (thinkingPart instanceof ChatThinkingContentPart) {
            thinkingPart.appendItem(
              () => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
              markdownPart.codeblocksPartId,
              markdown,
              templateData.value,
              markdownPart.onDidChangeDiff,
              markdownPart
            );
          }
          return thinkingPart;
        }
        if (lastThinking) {
          lastThinking.appendItem(
            () => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
            markdownPart.codeblocksPartId,
            markdown,
            templateData.value,
            markdownPart.onDidChangeDiff
          );
        }
      } else if (!shouldPin && !isBlankMarkdown && !hasPendingEditCodeblock) {
        this.finalizeCurrentThinkingPart(context, templateData);
      }
    }
    return markdownPart;
  }
  renderThinkingPart(content, context, templateData) {
    if (!content.id) {
      content.id = Date.now().toString();
    }
    const element = isResponseVM(context.element) ? context.element : void 0;
    const streamingCompleted = this.isThinkingLookAheadComplete(context, element);
    const lastThinkingPart = this.getLastThinkingPart(templateData.renderedParts);
    if (lastThinkingPart?.hasGroupedItems() && shouldStartNewCollapsedThinkingGroup(getEffectiveThinkingDisplayMode(this.configService, this.contextKeyService), "items", "reasoning")) {
      this.finalizeCurrentThinkingPart(context, templateData);
    }
    if (Array.isArray(content.value)) {
      if (content.value.length < 1) {
        const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
        lastThinking?.finalizeTitleIfDefault();
        return this.renderNoContent((other) => content.kind === other.kind);
      }
      let lastPart;
      for (const item of content.value) {
        if (item) {
          const lastThinkingPart2 = lastPart instanceof ChatThinkingContentPart && lastPart.getIsActive() ? lastPart : void 0;
          if (lastThinkingPart2) {
            lastThinkingPart2.setupThinkingContainer({ ...content, value: item });
          } else {
            const itemContent = { ...content, value: item };
            const itemPart = templateData.instantiationService.createInstance(ChatThinkingContentPart, itemContent, context, this.chatContentMarkdownRenderer, streamingCompleted);
            lastPart = itemPart;
          }
        }
      }
      return lastPart ?? this.renderNoContent((other) => content.kind === other.kind);
    } else {
      const lastActiveThinking = this.getLastThinkingPart(templateData.renderedParts);
      if (lastActiveThinking) {
        lastActiveThinking.setupThinkingContainer(content);
        return lastActiveThinking;
      } else {
        const part = templateData.instantiationService.createInstance(ChatThinkingContentPart, content, context, this.chatContentMarkdownRenderer, streamingCompleted);
        return part;
      }
    }
  }
  disposeElement(node, index, templateData, details) {
    this.traceLayout("disposeElement", `Disposing element, index=${index}`);
    templateData.elementDisposables.clear();
    if (templateData.currentElement && !this.viewModel?.editing) {
      this.templateDataByRequestId.delete(templateData.currentElement.id);
    }
    const codeBlocks = this.codeBlocksByResponseId.get(node.element.id);
    if (codeBlocks) {
      for (const info of codeBlocks) {
        if (info?.uri) {
          this.codeBlocksByEditorUri.delete(info.uri);
        }
      }
      this.codeBlocksByResponseId.delete(node.element.id);
    }
    this.fileTreesByResponseId.delete(node.element.id);
    this.focusedFileTreesByResponseId.delete(node.element.id);
    if (isRequestVM(node.element) && node.element.id === this.viewModel?.editing?.id && details?.onScroll) {
      this._onDidDispose.fire(templateData);
    }
    if (templateData.titleToolbar) {
      templateData.titleToolbar.context = void 0;
    }
    templateData.footerToolbar.context = void 0;
    templateData.checkpointToolbar.context = void 0;
    templateData.checkpointRestoreToolbar.context = void 0;
  }
  renderMcpServersInteractionRequired(content, context, templateData) {
    return this.instantiationService.createInstance(ChatMcpServersInteractionContentPart, content, context);
  }
  renderDisabledClaudeHooks(content, context) {
    return this.instantiationService.createInstance(ChatDisabledClaudeHooksContentPart, context);
  }
  disposeTemplate(templateData) {
    this.clearRenderedParts(templateData);
    templateData.templateDisposables.dispose();
  }
  hoverVisible(requestHover) {
    requestHover.style.opacity = "1";
  }
  hoverHidden(requestHover) {
    requestHover.style.opacity = "0";
  }
};
ChatListItemRenderer.ID = "item";
ChatListItemRenderer = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IChatWidgetService),
  __decorateParam(13, IChatEntitlementService),
  __decorateParam(14, IChatService),
  __decorateParam(15, IAccessibilitySignalService),
  __decorateParam(16, IAccessibilityService),
  __decorateParam(17, IWorkbenchEnvironmentService),
  __decorateParam(18, ITelemetryService)
], ChatListItemRenderer);
class ChatListDelegate extends CachedListVirtualDelegate {
  constructor(defaultElementHeight) {
    super();
    this.defaultElementHeight = defaultElementHeight;
  }
  estimateHeight(element) {
    return element.currentRenderedHeight ?? this.defaultElementHeight;
  }
  getTemplateId(element) {
    return ChatListItemRenderer.ID;
  }
  hasDynamicHeight(element) {
    return true;
  }
  getMeasuredHeight(element) {
    return this.getCachedHeight(element);
  }
}
function isParentSubagentTool(invocation) {
  return invocation.toolSpecificData?.kind === "subagent" && !invocation.subAgentInvocationId;
}
function getSubagentId(invocation) {
  if (isParentSubagentTool(invocation)) {
    return invocation.toolCallId;
  }
  return invocation.subAgentInvocationId;
}
function isSubagentToolInvocation(invocation) {
  return !!getSubagentId(invocation);
}
function getWorkingProgressRelevantParts(parts) {
  return parts.filter((part) => {
    if (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") {
      return !isSubagentToolInvocation(part);
    }
    if (part.kind === "hook") {
      return !part.subAgentInvocationId;
    }
    return part.kind !== "markdownContent" || !extractSubAgentInvocationIdFromText(part.content.value);
  });
}
function endsWithSubagentContent(parts) {
  const lastPart = findLastMeaningfulPart(parts);
  if (!lastPart) {
    return false;
  }
  if (lastPart.kind === "toolInvocation" || lastPart.kind === "toolInvocationSerialized") {
    return isParentSubagentTool(lastPart);
  }
  return false;
}
function endsWithCompletedQuestionInteraction(parts) {
  const lastPart = findLastMeaningfulPart(parts);
  if (!lastPart) {
    return false;
  }
  if (lastPart.kind === "questionCarousel") {
    return !!lastPart.isUsed;
  }
  return (lastPart.kind === "toolInvocation" || lastPart.kind === "toolInvocationSerialized") && isAskQuestionsToolInvocation(lastPart) && IChatToolInvocation.isComplete(lastPart);
}
function isWaitingForMcpServers(parts) {
  return parts.some((part) => part.kind === "mcpServersStartingSlow" && part.servers.get().length > 0);
}
function findLastMeaningfulPart(parts) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.kind !== "markdownContent" || part.content.value.trim().length > 0) {
      return part;
    }
  }
  return void 0;
}
export {
  ChatListDelegate,
  ChatListItemRenderer,
  buildPlanReviewProgressContent,
  endsWithCompletedQuestionInteraction,
  endsWithSubagentContent,
  formatCompletedResponseDisclosureLabel,
  getCompletedResponseCollapseEndIndex,
  getFinalResponseStartIndex,
  getVisibleCompletedResponseItemCount,
  getWorkingProgressRelevantParts,
  isWaitingForMcpServers,
  reconcileChatItemHeight,
  renderChatRequestTimestamp,
  renderChatResponseDetails,
  shouldCollapseCompletedResponsePart,
  shouldCreateGroupedThinkingPart,
  shouldHideChatUserIdentity,
  shouldPinToolInvocationToThinking,
  shouldRenderInitialProgressiveContentImmediately,
  shouldScheduleInitialHeightChange,
  shouldShowFileChangesSummaryForSettings,
  shouldShowPillsSummaryForSettings,
  shouldStartNewCollapsedThinkingGroup
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdExpc3RSZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQ2FjaGVkTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RFbGVtZW50UmVuZGVyRGV0YWlscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSwgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IGNhbmNlbGVkTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlUmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNlc3Npb25UeXBlLmpzJztcbmltcG9ydCB7IGlzQ3JlYXRlQ2hhdFRvb2wsIGlzQ3JlYXRlU2Vzc2lvblRvb2wsIGlzU2VuZE1lc3NhZ2VUb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9vcGVuU2Vzc2lvbkxpbmsuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGljb25BY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY2VsbEFjdGlvblZpZXcuanMnO1xuaW1wb3J0IHsgYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50LCBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dCwgaGFzQ29kZWJsb2NrVXJpVGFnLCBoYXNFZGl0Q29kZWJsb2NrVXJpVGFnIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dpZGdldC9hbm5vdGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBjaGVja01vZGVPcHRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50TWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQsIElDaGF0VGV4dEVkaXRHcm91cCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgY2hhdFN1YmNvbW1hbmRMZWFkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50Vm90ZURpcmVjdGlvbiwgQ2hhdEVycm9yTGV2ZWwsIENoYXRSZXF1ZXN0UXVldWVLaW5kLCBJQ2hhdENvbmZpcm1hdGlvbiwgSUNoYXRDb250ZW50UmVmZXJlbmNlLCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0LCBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdCwgSUNoYXRFbGljaXRhdGlvblJlcXVlc3RTZXJpYWxpemVkLCBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBJQ2hhdEV4dGVybmFsRWRpdCwgSUNoYXRGb2xsb3d1cCwgSUNoYXRIb29rUGFydCwgSUNoYXRNYXJrZG93bkNvbnRlbnQsIElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nLCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1NlcmlhbGl6ZWQsIElDaGF0TXVsdGlEaWZmRGF0YSwgSUNoYXRNdWx0aURpZmZEYXRhU2VyaWFsaXplZCwgSUNoYXRQbGFuUmV2aWV3LCBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQsIElDaGF0UHVsbFJlcXVlc3RDb250ZW50LCBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUsIElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIElDaGF0U2VydmljZSwgSUNoYXRUYXNrLCBJQ2hhdFRhc2tTZXJpYWxpemVkLCBJQ2hhdFRoaW5raW5nUGFydCwgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIElDaGF0VHJlZURhdGEsIElDaGF0VW5kb1N0b3AsIGlzQ2hhdEZvbGxvd3VwIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRQbGFuUmV2aWV3RGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UGxhblJldmlld0RhdGEuanMnO1xuaW1wb3J0IHsgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRRdWVzdGlvbkNhcm91c2VsRGF0YS5qcyc7XG5pbXBvcnQgeyBsb2NhbENoYXRTZXNzaW9uVHlwZSwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBnZXRFeHBsaWNpdEZpbGVPckltYWdlQXR0YWNobWVudFN1bW1hcnksIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnksIGlzUGFzdGVWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgZ2V0U3RpY2t5U2Nyb2xsVGFyZ2V0SXRlbSwgSUNoYXRDaGFuZ2VzU3VtbWFyeVBhcnQsIElDaGF0Q29kZUNpdGF0aW9ucywgSUNoYXRFcnJvckRldGFpbHNQYXJ0LCBJQ2hhdFJlZmVyZW5jZXMsIElDaGF0UmVuZGVyZXJDb250ZW50LCBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwsIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIElDaGF0Vmlld01vZGVsLCBJQ2hhdFdvcmtpbmdQcm9ncmVzcywgaXNSZXF1ZXN0Vk0sIGlzUmVzcG9uc2VWTSwgSUNoYXRQZW5kaW5nRGl2aWRlclZpZXdNb2RlbCwgaXNQZW5kaW5nRGl2aWRlclZNLCBJQ2hhdFR1cm5QaWxsc1BhcnQgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXROV29yZHMgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFdvcmRDb3VudGVyLmpzJztcbmltcG9ydCB7IENIQVRfT1BFTl9BR0VOVF9IT1NUX0NIQVRfQ09NTUFORF9JRCwgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQsIENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUsIFRoaW5raW5nRGlzcGxheU1vZGUgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGZvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wLCBmb3JtYXRDaGF0UmVzcG9uc2VEZXRhaWxzLCBmb3JtYXRDaGF0UmVzcG9uc2VFbGFwc2VkVGltZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0UHJvZ3Jlc3NGb3JtYXR0aW5nLmpzJztcbmltcG9ydCB7IENsaWNrQW5pbWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FuaW1hdGlvbnMvYW5pbWF0aW9ucy5qcyc7XG5pbXBvcnQgeyBGb3JrQ29udmVyc2F0aW9uQWN0aW9uSWQgfSBmcm9tICcuLi9hY3Rpb25zL2NoYXRGb3JrQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNYXJrSGVscGZ1bEFjdGlvbklkIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0VGl0bGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSwgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdEZpbGVUcmVlSW5mbywgSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucywgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIgfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgUmVzdG9yZUNoZWNrcG9pbnRBY3Rpb25JZCB9IGZyb20gJy4uL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Rm9ya0FjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi9jaGF0Rm9ya0FjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IENoYXRSZXN0b3JlQ2hlY2twb2ludEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi9jaGF0UmVzdG9yZUNoZWNrcG9pbnRBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRIb3ZlciwgZ2V0Q2hhdEFnZW50SG92ZXJPcHRpb25zIH0gZnJvbSAnLi9jaGF0QWdlbnRIb3Zlci5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuL2NoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRDb21tYW5kQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdEFnZW50Q29tbWFuZENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRBbm9ueW1vdXNSYXRlTGltaXRlZFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdEFub255bW91c1JhdGVMaW1pdGVkUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0QXR0YWNobWVudHNDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0QXR0YWNobWVudHNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0QXV0b01vZGVSZXNvbHV0aW9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdEF1dG9Nb2RlUmVzb2x1dGlvbkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDaGVja3BvaW50RmlsZUNoYW5nZXNTdW1tYXJ5Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdENoYW5nZXNTdW1tYXJ5UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VHVyblBpbGxzQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFR1cm5QaWxsc1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFR1cm5TdGF0dXNQaWxsc1NldHRpbmcsIGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQgfSBmcm9tICcuL2NoYXRUdXJuUGlsbHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvZGVDaXRhdGlvbkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2RlQ2l0YXRpb25Db250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29tbWFuZEJ1dHRvbkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb21tYW5kQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpcm1hdGlvbkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb25maXJtYXRpb25Db250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yUG9vbCwgRWRpdG9yUG9vbCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbiB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRFbGljaXRhdGlvbkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRFbGljaXRhdGlvbkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRFcnJvckNvbmZpcm1hdGlvbkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRFcnJvckNvbmZpcm1hdGlvblBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEVycm9yQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdEVycm9yQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFBsYW5SZXZpZXdQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRQbGFuUmV2aWV3UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRFeHRlbnNpb25zQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdEV4dGVuc2lvbnNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0TWFya2Rvd25Db250ZW50UGFydCwgY29kZWJsb2NrSGFzQ2xvc2luZ0JhY2t0aWNrcyB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWFya2Rvd25Db250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0TWNwU2VydmVyc0ludGVyYWN0aW9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdE1jcFNlcnZlcnNJbnRlcmFjdGlvbkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRNY3BBdXRoZW50aWNhdGlvbkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRNY3BBdXRoZW50aWNhdGlvbkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWNwU2VydmVyc1N0YXJ0aW5nQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0RGlzYWJsZWRDbGF1ZGVIb29rc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRNdWx0aURpZmZDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0TXVsdGlEaWZmQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFByb2dyZXNzQ29udGVudFBhcnQsIENoYXRXb3JraW5nUHJvZ3Jlc3NDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0UHJvZ3Jlc3NDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UHVsbFJlcXVlc3RDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0UHVsbFJlcXVlc3RDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UXVvdGFFeGNlZWRlZFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFF1b3RhRXhjZWVkZWRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUxpc3RDb250ZW50UGFydCwgQ2hhdFVzZWRSZWZlcmVuY2VzTGlzdENvbnRlbnRQYXJ0LCBDb2xsYXBzaWJsZUxpc3RQb29sIH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRSZWZlcmVuY2VzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRhc2tDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0VGFza0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRTeXN0ZW1Ob3RpZmljYXRpb25Db250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0U3lzdGVtTm90aWZpY2F0aW9uQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRleHRFZGl0Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFRleHRFZGl0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQsIGdldEVmZmVjdGl2ZVRoaW5raW5nRGlzcGxheU1vZGUgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFRoaW5raW5nQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFN1YmFnZW50Q29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFN1YmFnZW50Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVDb250ZW50UGFydCwgVHJlZVBvb2wgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFRyZWVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0V29ya3NwYWNlRWRpdENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRXb3Jrc3BhY2VFZGl0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEV4dGVybmFsRWRpdENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRFeHRlcm5hbEVkaXRDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb25QYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL3Rvb2xJbnZvY2F0aW9uUGFydHMvY2hhdFRvb2xJbnZvY2F0aW9uUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0TWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyIH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuL2NoYXRPcHRpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb2RlQmxvY2tDb250ZW50UHJvdmlkZXIsIENvZGVCbG9ja1BhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY29kZUJsb2NrUGFydC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDaGF0SG9va0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRIb29rQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFBlbmRpbmdEcmFnQ29udHJvbGxlciB9IGZyb20gJy4vY2hhdFBlbmRpbmdEcmFnQW5kRHJvcC5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaXNBc2tRdWVzdGlvbnNUb29sSW52b2NhdGlvbiwgaXNNY3BUb29sSW52b2NhdGlvbiB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sUGFydFV0aWxpdGllcy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIGlzQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5jb25zdCBDT1BJTE9UX1VTRVJOQU1FID0gJ0dpdEh1YiBDb3BpbG90JztcbmNvbnN0IFdPUktJTkdfQ0FVR0hUX1VQX0RFQk9VTkNFX01TID0gNzUwO1xuY29uc3QgREVGQVVMVF9DSEFUX0lURU1fSE9SSVpPTlRBTF9QQURESU5HID0gNDA7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRMaXN0SXRlbVRlbXBsYXRlIHtcblx0Y3VycmVudEVsZW1lbnQ/OiBDaGF0VHJlZUl0ZW07XG5cdC8qKlxuXHQgKiBUaGUgcGFydHMgdGhhdCBhcmUgY3VycmVudGx5IHJlbmRlcmVkIGluIHRoZSB0ZW1wbGF0ZS4gTm90ZSB0aGF0IHRoZXNlIGFyZSBwdXJwb3NlbHkgbm90IGFkZGVkIHRvIGVsZW1lbnREaXNwb3NhYmxlcy1cblx0ICogdGhleSBhcmUgZGlzcG9zZWQgaW4gYSBzZXBhcmF0ZSBjeWNsZSBhZnRlciBkaWZmaW5nIHdpdGggdGhlIG5leHQgY29udGVudCB0byByZW5kZXIuXG5cdCAqL1xuXHRyZW5kZXJlZFBhcnRzPzogSUNoYXRDb250ZW50UGFydFtdO1xuXHQvKipcblx0ICogVG9vbCBwYXJ0cyB0aGF0IGhhdmUgYmVlbiBtb3ZlZCBvdXQgb2YgYSB0aGlua2luZyBwYXJ0IGludG8gdGhlIHJvdydzIHZhbHVlXG5cdCAqIGNvbnRhaW5lci4gVGhlaXIgbGlmZWN5Y2xlIG1hdGNoZXMgYHJlbmRlcmVkUGFydHNgIChjbGVhcmVkIGJ5XG5cdCAqIGBjbGVhclJlbmRlcmVkUGFydHNgKSwgbm90IGBlbGVtZW50RGlzcG9zYWJsZXNgIHdoaWNoIGlzIGNsZWFyZWQgb25cblx0ICogdmlydHVhbGl6YXRpb24gcmVjeWNsZS5cblx0ICovXG5cdG1vdmVkT3V0VG9vbFBhcnRzPzogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPjtcblx0LyoqXG5cdCAqIEVsZW1lbnQgdXNlZCB0byB0cmFjayB3aGV0aGVyIHRoZSB0ZW1wbGF0ZSBpcyBtb3VudGVkIGluIHRoZSBET00uXG5cdCAqL1xuXHRyZW5kZXJlZFBhcnRzTW91bnRlZD86IGJvb2xlYW47XG5cdHJlbmRlcmVkQ29udGVudD86IFJlYWRvbmx5QXJyYXk8SUNoYXRSZW5kZXJlckNvbnRlbnQ+O1xuXHRjb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmU/OiBIVE1MRGV0YWlsc0VsZW1lbnQ7XG5cdGNvbXBsZXRlZFJlc3BvbnNlQ29sbGFwc2VFbmRJbmRleD86IG51bWJlcjtcblx0Y29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlT3Blbj86IGJvb2xlYW47XG5cdHdhc1Jlc3BvbnNlQ29tcGxldGU/OiBib29sZWFuO1xuXHRyZWFkb25seSBjb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdC8qKiBEcmFnIGhhbmRsZSBlbGVtZW50IGZvciByZW9yZGVyaW5nIHBlbmRpbmcgcmVxdWVzdHMsIGlmIGN1cnJlbnRseSByZW5kZXJlZC4gKi9cblx0ZHJhZ0hhbmRsZT86IEhUTUxFbGVtZW50O1xuXG5cdHJlYWRvbmx5IHJvd0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdC8qKiBIZWlnaHQgYWxsb2NhdGVkIGJ5IHRoZSBsaXN0IGZvciB0aGUgY3VycmVudGx5IHJlbmRlcmVkIHJvdy4gKi9cblx0YWxsb2NhdGVkSGVpZ2h0PzogbnVtYmVyO1xuXHRyZWFkb25seSB0aXRsZVRvb2xiYXI/OiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblx0cmVhZG9ubHkgaGVhZGVyPzogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGZvb3RlclRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBmb290ZXJUb29sYmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZm9vdGVyRGV0YWlsc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGF2YXRhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHVzZXJuYW1lOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGV0YWlsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdmFsdWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByZXF1ZXN0VGltZXN0YW1wQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogSURpc3Bvc2FibGU7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBhZ2VudEhvdmVyOiBDaGF0QWdlbnRIb3Zlcjtcblx0cmVhZG9ubHkgcmVxdWVzdEhvdmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGlzYWJsZWRPdmVybGF5OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2hlY2twb2ludFRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBjaGVja3BvaW50UmVzdG9yZVRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBjaGVja3BvaW50Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2hlY2twb2ludFJlc3RvcmVDb250YWluZXI6IEhUTUxFbGVtZW50O1xufVxuXG5mdW5jdGlvbiBlc2NhcGVNYXJrZG93bkxpbmtMYWJlbChsYWJlbDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGxhYmVsLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXFxdL2csICdcXFxcXScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50KHJldmlldzogSUNoYXRQbGFuUmV2aWV3LCBtZXNzYWdlOiBzdHJpbmcpOiBNYXJrZG93blN0cmluZyB7XG5cdGNvbnN0IHJlbmRlcmVkQXNVc2VkID0gISFyZXZpZXcuaXNVc2VkO1xuXHRjb25zdCBkYXRhID0gcmVuZGVyZWRBc1VzZWQgJiYgIXJldmlldy5kYXRhPy5yZWplY3RlZCA/IHJldmlldy5kYXRhIDogdW5kZWZpbmVkO1xuXHRjb25zdCBvdmVyYWxsID0gZGF0YT8uZmVlZGJhY2tPdmVyYWxsPy50cmltKCk7XG5cdGNvbnN0IGlubGluZU1kID0gZGF0YT8uZmVlZGJhY2tJbmxpbmVNYXJrZG93bj8udHJpbSgpO1xuXHRjb25zdCBmZWVkYmFja01hcmtkb3duID0gW292ZXJhbGwsIGlubGluZU1kXS5maWx0ZXIodmFsdWUgPT4gISF2YWx1ZSkuam9pbignXFxuXFxuJylcblx0XHR8fCBkYXRhPy5mZWVkYmFjaz8udHJpbSgpO1xuXG5cdGNvbnN0IGNvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRjb250ZW50LmFwcGVuZFRleHQobWVzc2FnZSk7XG5cdGlmIChmZWVkYmFja01hcmtkb3duKSB7XG5cdFx0Y29udGVudC5hcHBlbmRNYXJrZG93bignXFxuXFxuJyk7XG5cdFx0Y29udGVudC5hcHBlbmRNYXJrZG93bihmZWVkYmFja01hcmtkb3duKTtcblx0fVxuXG5cdGlmIChyZW5kZXJlZEFzVXNlZCkge1xuXHRcdGNvbnN0IHJldmlld0NvbnRlbnQgPSByZXZpZXcuY29udGVudC50cmltKCk7XG5cdFx0Y29uc3QgcGxhblVyaSA9IHJldmlldy5wbGFuVXJpID8gVVJJLnJldml2ZShyZXZpZXcucGxhblVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHJldmlld0NvbnRlbnQgfHwgcGxhblVyaSkge1xuXHRcdFx0Y29udGVudC5hcHBlbmRNYXJrZG93bignXFxuXFxuJyk7XG5cdFx0XHRpZiAocmV2aWV3Q29udGVudCkge1xuXHRcdFx0XHRjb250ZW50LmFwcGVuZE1hcmtkb3duKHJldmlld0NvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBsYW5VcmkpIHtcblx0XHRcdFx0aWYgKHJldmlld0NvbnRlbnQpIHtcblx0XHRcdFx0XHRjb250ZW50LmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwbGFuRmlsZU5hbWUgPSBiYXNlbmFtZShwbGFuVXJpKTtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBwbGFuRmlsZU5hbWVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcub3BlbkZ1bGxQbGFuRmlsZScsIFwiT3BlbiBmdWxsIHBsYW4gZmlsZSAoezB9KVwiLCBwbGFuRmlsZU5hbWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3Lm9wZW5GdWxsUGxhbicsIFwiT3BlbiBmdWxsIHBsYW4gZmlsZVwiKTtcblx0XHRcdFx0Y29uc3QgcGxhbldpZGdldFVyaSA9IHBsYW5Vcmkud2l0aCh7IHF1ZXJ5OiBwbGFuVXJpLnF1ZXJ5ID8gYCR7cGxhblVyaS5xdWVyeX0mdnNjb2RlTGlua1R5cGU9ZmlsZWAgOiAndnNjb2RlTGlua1R5cGU9ZmlsZScgfSk7XG5cdFx0XHRcdGNvbnRlbnQuYXBwZW5kTWFya2Rvd24oYFske2VzY2FwZU1hcmtkb3duTGlua0xhYmVsKGxhYmVsKX1dKCR7cGxhbldpZGdldFVyaS50b1N0cmluZyh0cnVlKX0pYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb250ZW50O1xufVxuXG5pbnRlcmZhY2UgSUl0ZW1IZWlnaHRDaGFuZ2VQYXJhbXMge1xuXHRlbGVtZW50OiBDaGF0VHJlZUl0ZW07XG5cdGhlaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlKG5vcm1hbGl6ZWRIZWlnaHQ6IG51bWJlciwgYWxsb2NhdGVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIHR5cGVvZiBhbGxvY2F0ZWRIZWlnaHQgIT09ICdudW1iZXInIHx8IG5vcm1hbGl6ZWRIZWlnaHQgPiBhbGxvY2F0ZWRIZWlnaHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaW5hbFJlc3BvbnNlU3RhcnRJbmRleChjb250ZW50OiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50Pik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGxldCBpbmRleCA9IGNvbnRlbnQubGVuZ3RoIC0gMTtcblx0d2hpbGUgKGluZGV4ID49IDApIHtcblx0XHRjb25zdCBwYXJ0ID0gY29udGVudFtpbmRleF07XG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgJiYgcGFydC5jb250ZW50LnZhbHVlLmxlbmd0aCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGluZGV4LS07XG5cdH1cblxuXHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHdoaWxlIChpbmRleCA+IDAgJiYgY29udGVudFtpbmRleCAtIDFdLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0aW5kZXgtLTtcblx0fVxuXHRyZXR1cm4gaW5kZXg7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVMYWJlbChzdGVwQ291bnQ6IG51bWJlciwgZWxhcHNlZE1zOiBudW1iZXIgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRjb25zdCBlbGFwc2VkID0gZm9ybWF0Q2hhdFJlc3BvbnNlRWxhcHNlZFRpbWUoZWxhcHNlZE1zKTtcblx0aWYgKHN0ZXBDb3VudCA9PT0gMSkge1xuXHRcdHJldHVybiBlbGFwc2VkXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnJlc3BvbnNlQ29tcGxldGVkT25lU3RlcEluJywgXCJDb21wbGV0ZWQgMSBzdGVwIGluIHswfVwiLCBlbGFwc2VkKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5yZXNwb25zZUNvbXBsZXRlZE9uZVN0ZXAnLCBcIkNvbXBsZXRlZCAxIHN0ZXBcIik7XG5cdH1cblx0cmV0dXJuIGVsYXBzZWRcblx0XHQ/IGxvY2FsaXplKCdjaGF0LnJlc3BvbnNlQ29tcGxldGVkU3RlcHNJbicsIFwiQ29tcGxldGVkIHswfSBzdGVwcyBpbiB7MX1cIiwgc3RlcENvdW50LCBlbGFwc2VkKVxuXHRcdDogbG9jYWxpemUoJ2NoYXQucmVzcG9uc2VDb21wbGV0ZWRTdGVwcycsIFwiQ29tcGxldGVkIHswfSBzdGVwc1wiLCBzdGVwQ291bnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmlzaWJsZUNvbXBsZXRlZFJlc3BvbnNlSXRlbUNvdW50KG5vZGVzOiBSZWFkb25seUFycmF5PE5vZGU+KTogbnVtYmVyIHtcblx0bGV0IHZpc2libGVJdGVtQ291bnQgPSAwO1xuXHRmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcblx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQobm9kZSkgJiYgKG5vZGUuaGlkZGVuIHx8IG5vZGUuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHZpc2libGVJdGVtQ291bnQrKztcblx0fVxuXHRyZXR1cm4gdmlzaWJsZUl0ZW1Db3VudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZENvbGxhcHNlQ29tcGxldGVkUmVzcG9uc2VQYXJ0KHBhcnQ6IElDaGF0UmVuZGVyZXJDb250ZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiAocGFydC5raW5kICE9PSAndG9vbEludm9jYXRpb24nICYmIHBhcnQua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHx8ICF0b29sSW52b2NhdGlvbkhhc01jcEFwcERhdGEocGFydCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb21wbGV0ZWRSZXNwb25zZUNvbGxhcHNlRW5kSW5kZXgoY29udGVudDogUmVhZG9ubHlBcnJheTxJQ2hhdFJlbmRlcmVyQ29udGVudD4sIGZpbmFsUmVzcG9uc2VTdGFydEluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgZmluYWxSZXNwb25zZVN0YXJ0SW5kZXg7IGluZGV4KyspIHtcblx0XHRpZiAoIXNob3VsZENvbGxhcHNlQ29tcGxldGVkUmVzcG9uc2VQYXJ0KGNvbnRlbnRbaW5kZXhdKSkge1xuXHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmluYWxSZXNwb25zZVN0YXJ0SW5kZXg7XG59XG5cbi8qKiBIb3cgYSBmcmVzaGx5IG1lYXN1cmVkIHJvdyBoZWlnaHQgc2hvdWxkIGJlIHJlY29uY2lsZWQgYWdhaW5zdCB0aGUgdHJlZSdzIGtub3duIGhlaWdodC4gKi9cbmV4cG9ydCB0eXBlIENoYXRJdGVtSGVpZ2h0VXBkYXRlS2luZCA9ICdub25lJyB8ICdmaXJlJyB8ICdzY2hlZHVsZUluaXRpYWwnIHwgJ2RlZmVyUmVNZWFzdXJlJztcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdEl0ZW1IZWlnaHRVcGRhdGUge1xuXHQvKiogVmFsdWUgdG8gc3RvcmUgYmFjayBpbnRvIHRoZSBlbGVtZW50J3MgYGN1cnJlbnRSZW5kZXJlZEhlaWdodGAuICovXG5cdHJlYWRvbmx5IG5leHRSZW5kZXJlZEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogV2hldGhlci9ob3cgdG8gbm90aWZ5IHRoZSB0cmVlIG9mIHRoZSBuZXcgaGVpZ2h0LiAqL1xuXHRyZWFkb25seSBraW5kOiBDaGF0SXRlbUhlaWdodFVwZGF0ZUtpbmQ7XG5cdC8qKiBUaGUgaGVpZ2h0IHRvIG5vdGlmeSB3aXRoIChtZWFuaW5nZnVsIHdoZW4gYGtpbmRgIGlzIGBmaXJlYCBvciBgc2NoZWR1bGVJbml0aWFsYCkuICovXG5cdHJlYWRvbmx5IGhlaWdodDogbnVtYmVyO1xufVxuXG4vKipcbiAqIERlY2lkZSBob3cgYSBmcmVzaGx5IG1lYXN1cmVkLCBub3JtYWxpemVkIHJvdyBoZWlnaHQgc2hvdWxkIGJlIHJlY29uY2lsZWQgYWdhaW5zdCB0aGUgaGVpZ2h0XG4gKiB0aGUgdHJlZSBjdXJyZW50bHkga25vd3MgYWJvdXQgKGBjdXJyZW50UmVuZGVyZWRIZWlnaHRgKS5cbiAqXG4gKiBgaXNCZWluZ1JlbmRlcmVkYCBpcyBgdHJ1ZWAgd2hlbiB0aGUgbWVhc3VyZW1lbnQgYXJyaXZlcyAqc3luY2hyb25vdXNseSogZHVyaW5nIHRoZSB0cmVlJ3NcbiAqIGByZW5kZXJFbGVtZW50YCBjYWxsOyBpbiB0aGF0IGNhc2UgdGhlIHRyZWUgbXVzdCBub3QgYmUgbm90aWZpZWQgcmUtZW50cmFudGx5LlxuICpcbiAqIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzI2OTUyOiB3aGVuIG5vdGlmaWNhdGlvbiBpcyBzdXBwcmVzc2VkLFxuICogYGN1cnJlbnRSZW5kZXJlZEhlaWdodGAgbXVzdCByZW1haW4gdW5jaGFuZ2VkIHNvIGFuIGlkZW50aWNhbCBkZWZlcnJlZCBtZWFzdXJlbWVudCBpcyBub3RcbiAqIGRlZHVwbGljYXRlZCBiZWZvcmUgaXQgcmVhY2hlcyB0aGUgdHJlZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlY29uY2lsZUNoYXRJdGVtSGVpZ2h0KFxuXHRub3JtYWxpemVkSGVpZ2h0OiBudW1iZXIsXG5cdGN1cnJlbnRSZW5kZXJlZEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRpc0JlaW5nUmVuZGVyZWQ6IGJvb2xlYW4sXG5cdGFsbG9jYXRlZEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkLFxuKTogSUNoYXRJdGVtSGVpZ2h0VXBkYXRlIHtcblx0aWYgKG5vcm1hbGl6ZWRIZWlnaHQgPT09IGN1cnJlbnRSZW5kZXJlZEhlaWdodCkge1xuXHRcdHJldHVybiB7IG5leHRSZW5kZXJlZEhlaWdodDogY3VycmVudFJlbmRlcmVkSGVpZ2h0LCBraW5kOiAnbm9uZScsIGhlaWdodDogbm9ybWFsaXplZEhlaWdodCB9O1xuXHR9XG5cblx0aWYgKGlzQmVpbmdSZW5kZXJlZCkge1xuXHRcdC8vIFN1cHByZXNzIHRoZSByZS1lbnRyYW50IG5vdGlmaWNhdGlvbiBhbmQgRE8gTk9UIGFkdmFuY2UgYGN1cnJlbnRSZW5kZXJlZEhlaWdodGAgKHRoZSB0cmVlXG5cdFx0Ly8gd2FzIG5ldmVyIHRvbGQpLiBTY2hlZHVsZSBhIGRlZmVycmVkIHJlLW1lYXN1cmUgc28gdGhlIGhlaWdodCByZWFjaGVzIHRoZSB0cmVlIG9uY2UgdGhpc1xuXHRcdC8vIHJvdyBpcyBkb25lIHJlbmRlcmluZywgaW5zdGVhZCBvZiByZWx5aW5nIG9uIGEgbGF0ZXIgYXN5bmMgbWVhc3VyZW1lbnQgdGhhdCBjb3VsZCBiZVxuXHRcdC8vIGRlZHVwZWQgYnkgdGhlIFwidW5jaGFuZ2VkXCIgY2hlY2sgYWJvdmUuXG5cdFx0cmV0dXJuIHsgbmV4dFJlbmRlcmVkSGVpZ2h0OiBjdXJyZW50UmVuZGVyZWRIZWlnaHQsIGtpbmQ6ICdkZWZlclJlTWVhc3VyZScsIGhlaWdodDogbm9ybWFsaXplZEhlaWdodCB9O1xuXHR9XG5cblx0aWYgKHR5cGVvZiBjdXJyZW50UmVuZGVyZWRIZWlnaHQgPT09ICdudW1iZXInKSB7XG5cdFx0cmV0dXJuIHsgbmV4dFJlbmRlcmVkSGVpZ2h0OiBub3JtYWxpemVkSGVpZ2h0LCBraW5kOiAnZmlyZScsIGhlaWdodDogbm9ybWFsaXplZEhlaWdodCB9O1xuXHR9XG5cblx0Ly8gRmlyc3QgbWVhc3VyZW1lbnRzIHRoYXQgYWxyZWFkeSBmaXQgYXJlIGp1c3QgaW5pdGlhbGl6YXRpb24uIE9ubHkgc2NoZWR1bGUgYSBmaXJzdCB1cGRhdGVcblx0Ly8gd2hlbiB0aGUgcm93IHdvdWxkIG90aGVyd2lzZSBjbGlwIG5ld2x5IHJlbmRlcmVkIGNvbnRlbnQuXG5cdGlmICghc2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlKG5vcm1hbGl6ZWRIZWlnaHQsIGFsbG9jYXRlZEhlaWdodCkpIHtcblx0XHRyZXR1cm4geyBuZXh0UmVuZGVyZWRIZWlnaHQ6IG5vcm1hbGl6ZWRIZWlnaHQsIGtpbmQ6ICdub25lJywgaGVpZ2h0OiBub3JtYWxpemVkSGVpZ2h0IH07XG5cdH1cblxuXHRyZXR1cm4geyBuZXh0UmVuZGVyZWRIZWlnaHQ6IG5vcm1hbGl6ZWRIZWlnaHQsIGtpbmQ6ICdzY2hlZHVsZUluaXRpYWwnLCBoZWlnaHQ6IG5vcm1hbGl6ZWRIZWlnaHQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckNoYXRSZXNwb25zZURldGFpbHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZGV0YWlsczogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb21wbGV0ZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkLCBlbGFwc2VkTXM6IG51bWJlciB8IHVuZGVmaW5lZCwgdmVyYm9zZTogYm9vbGVhbik6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0ZG9tLmNsZWFyTm9kZShjb250YWluZXIpO1xuXHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXNwb25zZS1mbGlwLWFjdGl2ZScsICdjaGF0LXJlc3BvbnNlLWZsaXAtZG93bicsICdjaGF0LXJlc3BvbnNlLWZsaXAtcmVzZXQnKTtcblxuXHRjb25zdCBjb21wbGV0aW9uID0gdmVyYm9zZSA/IGZvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wKGNvbXBsZXRlZEF0KSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgZWxhcHNlZCA9IGNvbXBsZXRpb24gPyBmb3JtYXRDaGF0UmVzcG9uc2VFbGFwc2VkVGltZShlbGFwc2VkTXMpIDogdW5kZWZpbmVkO1xuXHRjb25zdCBhbHRlcm5hdGUgPSBjb21wbGV0aW9uPy5pc1JlbGF0aXZlXG5cdFx0PyBmb3JtYXRDaGF0UmVzcG9uc2VEZXRhaWxzKGVsYXBzZWQsIGNvbXBsZXRpb24uZnVsbFRleHQpXG5cdFx0OiBlbGFwc2VkO1xuXHRjb25zdCByZXNwb25zZURldGFpbHMgPSBmb3JtYXRDaGF0UmVzcG9uc2VEZXRhaWxzKGRldGFpbHMsIGNvbXBsZXRpb24/LnRleHQpO1xuXG5cdGxldCBjb21wbGV0ZWRBdEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRpZiAoY29tcGxldGlvbikge1xuXHRcdGNvbnN0IHRpbWluZyA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLmNoYXQtcmVzcG9uc2UtdGltaW5nJykpO1xuXHRcdGNvbXBsZXRlZEF0RWxlbWVudCA9IGRvbS5hcHBlbmQodGltaW5nLCAkKCd0aW1lLmNoYXQtcmVzcG9uc2UtY29tcGxldGVkLWF0JywgeyBkYXRldGltZTogY29tcGxldGlvbi5kYXRlVGltZSB9LCBjb21wbGV0aW9uLnRleHQpKTtcblx0XHRpZiAoYWx0ZXJuYXRlKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRpbWluZywgJCgnc3Bhbi5jaGF0LXJlc3BvbnNlLWFsdGVybmF0ZScsIHVuZGVmaW5lZCwgYWx0ZXJuYXRlKSk7XG5cdFx0fVxuXHRcdHRpbWluZy5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtYWx0ZXJuYXRlJywgISFhbHRlcm5hdGUpO1xuXHR9XG5cdGlmIChjb21wbGV0aW9uICYmIGRldGFpbHMpIHtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5jaGF0LXJlc3BvbnNlLWRldGFpbHMtc2VwYXJhdG9yJywgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSwgJ1xcdTIwMjInKSk7XG5cdH1cblx0aWYgKGRldGFpbHMpIHtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5jaGF0LXJlc3BvbnNlLW1vZGVsLWRldGFpbHMnLCB1bmRlZmluZWQsIGRldGFpbHMpKTtcblx0fVxuXG5cdGNvbnN0IGFjY2Vzc2libGVUaW1pbmcgPSBjb21wbGV0aW9uXG5cdFx0PyBsb2NhbGl6ZSgnY2hhdFJlc3BvbnNlQ29tcGxldGVkQXQnLCBcIkNvbXBsZXRlZCB7MH1cIiwgY29tcGxldGlvbi5mdWxsVGV4dClcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29uc3QgYWNjZXNzaWJsZUVsYXBzZWQgPSBlbGFwc2VkXG5cdFx0PyBsb2NhbGl6ZSgnY2hhdFJlc3BvbnNlRWxhcHNlZCcsIFwiRWxhcHNlZCB0aW1lIHswfVwiLCBlbGFwc2VkKVxuXHRcdDogdW5kZWZpbmVkO1xuXHRjb250YWluZXIuYXJpYUxhYmVsID0gW2FjY2Vzc2libGVUaW1pbmcsIGFjY2Vzc2libGVFbGFwc2VkLCBkZXRhaWxzXS5maWx0ZXIoQm9vbGVhbikuam9pbignLCAnKTtcblx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFyZXNwb25zZURldGFpbHMpO1xuXHRjb250YWluZXIudGFiSW5kZXggPSByZXNwb25zZURldGFpbHMgPyAwIDogLTE7XG5cdHJldHVybiBjb21wbGV0ZWRBdEVsZW1lbnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDaGF0UmVxdWVzdFRpbWVzdGFtcChjb250YWluZXI6IEhUTUxFbGVtZW50LCB0aW1lc3RhbXA6IG51bWJlciB8IHVuZGVmaW5lZCk6IHsgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7IHJlYWRvbmx5IGhvdmVyVGV4dD86IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZm9ybWF0dGVkID0gZm9ybWF0Q2hhdFJlcXVlc3RUaW1lc3RhbXAodGltZXN0YW1wKTtcblx0aWYgKCFmb3JtYXR0ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aWYgKCFmb3JtYXR0ZWQuaXNSZWxhdGl2ZSkge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgndGltZS5jaGF0LXJlcXVlc3QtdGltZXN0YW1wJywge1xuXHRcdFx0ZGF0ZXRpbWU6IGZvcm1hdHRlZC5kYXRlVGltZSxcblx0XHRcdCdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2NoYXRSZXF1ZXN0U2VudEF0JywgXCJTZW50IHswfVwiLCBmb3JtYXR0ZWQuZnVsbFRleHQpLFxuXHRcdFx0dGFiaW5kZXg6IDAsXG5cdFx0fSwgZm9ybWF0dGVkLnRleHQpKTtcblx0XHRyZXR1cm4geyBlbGVtZW50LCBob3ZlclRleHQ6IGZvcm1hdHRlZC5mdWxsVGV4dCB9O1xuXHR9XG5cblx0Y29uc3QgZWxlbWVudCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLmNoYXQtcmVxdWVzdC10aW1lc3RhbXAnLCB7XG5cdFx0J2FyaWEtbGFiZWwnOiBsb2NhbGl6ZSgnY2hhdFJlcXVlc3RTZW50QXQnLCBcIlNlbnQgezB9XCIsIGZvcm1hdHRlZC5mdWxsVGV4dCksXG5cdFx0dGFiaW5kZXg6IDAsXG5cdH0pKTtcblx0Y29uc3QgdGltaW5nID0gZG9tLmFwcGVuZChlbGVtZW50LCAkKCdzcGFuLmNoYXQtcmVxdWVzdC10aW1pbmcuaGFzLWFsdGVybmF0ZScpKTtcblx0ZG9tLmFwcGVuZCh0aW1pbmcsICQoJ3RpbWUuY2hhdC1yZXF1ZXN0LXJlbGF0aXZlJywgeyBkYXRldGltZTogZm9ybWF0dGVkLmRhdGVUaW1lIH0sIGZvcm1hdHRlZC50ZXh0KSk7XG5cdGRvbS5hcHBlbmQodGltaW5nLCAkKCd0aW1lLmNoYXQtcmVxdWVzdC1mdWxsLWRhdGUnLCB7IGRhdGV0aW1lOiBmb3JtYXR0ZWQuZGF0ZVRpbWUgfSwgZm9ybWF0dGVkLmZ1bGxUZXh0KSk7XG5cdHJldHVybiB7IGVsZW1lbnQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFJlbmRlckluaXRpYWxQcm9ncmVzc2l2ZUNvbnRlbnRJbW1lZGlhdGVseShpc0NvbXBsZXRlOiBib29sZWFuLCBoYXNNYXJrZG93blBhcnRzOiBib29sZWFuLCBoYXNSZW5kZXJEYXRhOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaXNDb21wbGV0ZSAmJiBoYXNNYXJrZG93blBhcnRzICYmICFoYXNSZW5kZXJEYXRhO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU3RhcnROZXdDb2xsYXBzZWRUaGlua2luZ0dyb3VwKGRpc3BsYXlNb2RlOiBUaGlua2luZ0Rpc3BsYXlNb2RlLCBleGlzdGluZ0dyb3VwOiAncmVhc29uaW5nJyB8ICdpdGVtcycsIGluY29taW5nR3JvdXA6ICdyZWFzb25pbmcnIHwgJ2l0ZW1zJyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZGlzcGxheU1vZGUgPT09IFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkICYmIGV4aXN0aW5nR3JvdXAgIT09IGluY29taW5nR3JvdXA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRDcmVhdGVHcm91cGVkVGhpbmtpbmdQYXJ0KGNvbGxhcHNlZFRvb2xzTW9kZTogQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZSwgc2VwYXJhdGVkRnJvbVJlYXNvbmluZzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY29sbGFwc2VkVG9vbHNNb2RlID09PSBDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlLkFsd2F5cyB8fCBzZXBhcmF0ZWRGcm9tUmVhc29uaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeUZvclNldHRpbmdzKGlzQ29tcGxldGU6IGJvb2xlYW4sIGlzTG9jYWxTZXNzaW9uOiBib29sZWFuLCBzaG93RmlsZUNoYW5nZXM6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuIGlzQ29tcGxldGUgJiYgaXNMb2NhbFNlc3Npb24gJiYgc2hvd0ZpbGVDaGFuZ2VzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2hvd1BpbGxzU3VtbWFyeUZvclNldHRpbmdzKGlzQ29tcGxldGU6IGJvb2xlYW4sIGlzQWdlbnRIb3N0U2Vzc2lvbjogYm9vbGVhbiwgdHVyblN0YXR1c1BpbGxzOiBDaGF0VHVyblN0YXR1c1BpbGxzU2V0dGluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNDb21wbGV0ZSAmJiBpc0FnZW50SG9zdFNlc3Npb24gJiYgaXNDaGF0VHVyblN0YXR1c1BpbGxzRW5hYmxlZCh0dXJuU3RhdHVzUGlsbHMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkUGluVG9vbEludm9jYXRpb25Ub1RoaW5raW5nKHN0YXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZCwgaGFzQ29uZmlybWF0aW9uTWVzc2FnZXM6IGJvb2xlYW4sIGhhc01jcEFwcERhdGE6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuICFoYXNNY3BBcHBEYXRhXG5cdFx0JiYgc3RhdGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb25cblx0XHQmJiBzdGF0ZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbFxuXHRcdCYmIHN0YXRlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb25cblx0XHQmJiAhaGFzQ29uZmlybWF0aW9uTWVzc2FnZXM7XG59XG5cbmZ1bmN0aW9uIHRvb2xJbnZvY2F0aW9uSGFzTWNwQXBwRGF0YSh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogYm9vbGVhbiB7XG5cdHJldHVybiB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnaW5wdXQnICYmICEhdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5tY3BBcHBEYXRhO1xufVxuXG5jb25zdCBmb3JjZVZlcmJvc2VMYXlvdXRUcmFjaW5nID0gZmFsc2Vcblx0Ly8gfHwgQm9vbGVhbihcIlRSVUVcIikgLy8gY2F1c2VzIGEgbGludGVyIHdhcm5pbmcgc28gdGhhdCBpdCBjYW5ub3QgYmUgcHVzaGVkXG5cdDtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlbmRlcmVyRGVsZWdhdGUge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRnZXRMaXN0TGVuZ3RoKCk6IG51bWJlcjtcblx0Y3VycmVudENoYXRNb2RlKCk6IENoYXRNb2RlS2luZDtcblxuXHRyZWFkb25seSBvbkRpZFNjcm9sbD86IEV2ZW50PFNjcm9sbEV2ZW50Pjtcbn1cblxuY29uc3QgbW9zdFJlY2VudFJlc3BvbnNlQ2xhc3NOYW1lID0gJ2NoYXQtbW9zdC1yZWNlbnQtcmVzcG9uc2UnO1xuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkodXNlcm5hbWU6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkksIGlzUmVzcG9uc2U6IGJvb2xlYW4sIGlzU2Vzc2lvbnNXaW5kb3c6IGJvb2xlYW4sIGlzU3lzdGVtSW5pdGlhdGVkUmVxdWVzdDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRyZXR1cm4gdXNlcm5hbWUgPT09IENPUElMT1RfVVNFUk5BTUUgfHxcblx0XHQoaXNSZXNwb25zZSAmJiBpc0FnZW50SG9zdENvcGlsb3RTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSkpIHx8XG5cdFx0aXNTZXNzaW9uc1dpbmRvdyB8fFxuXHRcdGlzU3lzdGVtSW5pdGlhdGVkUmVxdWVzdDtcbn1cblxuZnVuY3Rpb24gaXNBZ2VudEhvc3RDb3BpbG90U2Vzc2lvblR5cGUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2Vzc2lvblR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb3BpbG90IHx8XG5cdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUF1dGhvcml0eShzZXNzaW9uVHlwZSwgU2Vzc2lvblR5cGUuQ29waWxvdENMSSkgIT09IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdXB2b3RlQW5pbWF0aW9uU2V0dGluZ1RvRW51bSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogQ2xpY2tBbmltYXRpb24gfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0Y2FzZSAnY29uZmV0dGknOiByZXR1cm4gQ2xpY2tBbmltYXRpb24uQ29uZmV0dGk7XG5cdFx0Y2FzZSAnZmxvYXRpbmdUaHVtYnMnOiByZXR1cm4gQ2xpY2tBbmltYXRpb24uRmxvYXRpbmdJY29ucztcblx0XHRjYXNlICdwdWxzZVdhdmUnOiByZXR1cm4gQ2xpY2tBbmltYXRpb24uUHVsc2VXYXZlO1xuXHRcdGNhc2UgJ3JhZGlhbnRMaW5lcyc6IHJldHVybiBDbGlja0FuaW1hdGlvbi5SYWRpYW50TGluZXM7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdExpc3RJdGVtUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxDaGF0VHJlZUl0ZW0sIEZ1enp5U2NvcmUsIElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnaXRlbSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb2RlQmxvY2tzQnlSZXNwb25zZUlkID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0Q29kZUJsb2NrSW5mb1tdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvZGVCbG9ja3NCeUVkaXRvclVyaSA9IG5ldyBSZXNvdXJjZU1hcDxJQ2hhdENvZGVCbG9ja0luZm8+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlVHJlZXNCeVJlc3BvbnNlSWQgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRGaWxlVHJlZUluZm9bXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBmb2N1c2VkRmlsZVRyZWVzQnlSZXNwb25zZUlkID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSByZXNwb25zZVRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZW1wbGF0ZURhdGFCeVJvdyA9IG5ldyBXZWFrTWFwPEhUTUxFbGVtZW50LCBJQ2hhdExpc3RJdGVtVGVtcGxhdGU+KCk7XG5cblx0LyoqIFRyYWNrIHBlbmRpbmcgcXVlc3Rpb24gY2Fyb3VzZWxzIGJ5IHNlc3Npb24gcmVzb3VyY2UgZm9yIGF1dG8tc2tpcCBvbiBjaGF0IHN1Ym1pc3Npb24gKi9cblx0cHJpdmF0ZSByZWFkb25seSBwZW5kaW5nUXVlc3Rpb25DYXJvdXNlbHMgPSBuZXcgUmVzb3VyY2VNYXA8U2V0PENoYXRRdWVzdGlvbkNhcm91c2VsUGFydD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWVkUXVlc3Rpb25DYXJvdXNlbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB3b3JraW5nUHJvZ3Jlc3NDb25maXJtYXRpb25FbmRMaXN0ZW5lcnMgPSBuZXcgV2Vha1NldDxJQ2hhdFRvb2xJbnZvY2F0aW9uPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBtYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXI6IENoYXRNYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXI7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDbGlja0ZvbGxvd3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRGb2xsb3d1cD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tGb2xsb3d1cDogRXZlbnQ8SUNoYXRGb2xsb3d1cD4gPSB0aGlzLl9vbkRpZENsaWNrRm9sbG93dXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGlja1JlcnVuV2l0aEFnZW50T3JDb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tSZXJ1bldpdGhBZ2VudE9yQ29tbWFuZERldGVjdGlvbiA9IHRoaXMuX29uRGlkQ2xpY2tSZXJ1bldpdGhBZ2VudE9yQ29tbWFuZERldGVjdGlvbi5ldmVudDtcblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGlja1JlcXVlc3Q6IEV2ZW50PElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4gPSB0aGlzLl9vbkRpZENsaWNrUmVxdWVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcmVuZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXJlbmRlcjogRXZlbnQ8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPiA9IHRoaXMuX29uRGlkUmVyZW5kZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlOiBFdmVudDxJQ2hhdExpc3RJdGVtVGVtcGxhdGU+ID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXNPdXRzaWRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNPdXRzaWRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRm9jdXNPdXRzaWRlLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUl0ZW1IZWlnaHRDaGFuZ2VQYXJhbXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1IZWlnaHQ6IEV2ZW50PElJdGVtSGVpZ2h0Q2hhbmdlUGFyYW1zPiA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZVZpZXdNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclBvb2w6IEVkaXRvclBvb2w7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xFZGl0b3JQb29sOiBFZGl0b3JQb29sO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmRWRpdG9yUG9vbDogRGlmZkVkaXRvclBvb2w7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWVQb29sOiBUcmVlUG9vbDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudFJlZmVyZW5jZXNMaXN0UG9vbDogQ29sbGFwc2libGVMaXN0UG9vbDtcblxuXHRwcml2YXRlIF9jdXJyZW50TGF5b3V0V2lkdGggPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cdHByaXZhdGUgX2lzVmlzaWJsZSA9IHRydWU7XG5cdHByaXZhdGUgX2VsZW1lbnRCZWluZ1JlbmRlcmVkOiBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lubGluZVRleHRNb2RlbHM6IElubGluZVRleHRNb2RlbENvbGxlY3Rpb247XG5cblx0LyoqIFdoZXRoZXIgd2UgaGF2ZSBhbHJlYWR5IGxvZ2dlZCB0aGUgaW5jcmVtZW50YWwtcmVuZGVyaW5nIHRlbGVtZXRyeSBldmVudCBmb3IgdGhpcyByZW5kZXJlciBpbnN0YW5jZS4gKi9cblx0cHJpdmF0ZSBfaW5jcmVtZW50YWxSZW5kZXJpbmdUZWxlbWV0cnlMb2dnZWQgPSBmYWxzZTtcblxuXHQvKipcblx0ICogUHJldmVudHMgcmUtYW5ub3VuY2VtZW50IG9mIGFscmVhZHkgcmVuZGVyZWQgY2hhdCBwcm9ncmVzc1xuXHQgKiBieSBzY3JlZW4gcmVhZGVyc1xuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvck9wdGlvbnM6IENoYXRFZGl0b3JPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVuZGVyZXJPcHRpb25zOiBJQ2hhdExpc3RJdGVtUmVuZGVyZXJPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElDaGF0UmVuZGVyZXJEZWxlZ2F0ZSxcblx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHZpZXdNb2RlbDogSUNoYXRWaWV3TW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdHRoaXMubWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyKTtcblx0XHR0aGlzLl9lZGl0b3JQb29sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JQb29sLCBlZGl0b3JPcHRpb25zLCBkZWxlZ2F0ZSwgb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSwgdHJ1ZSkpO1xuXHRcdHRoaXMuX3Rvb2xFZGl0b3JQb29sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JQb29sLCBlZGl0b3JPcHRpb25zLCBkZWxlZ2F0ZSwgb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSwgdHJ1ZSkpO1xuXHRcdHRoaXMuX2RpZmZFZGl0b3JQb29sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9yUG9vbCwgZWRpdG9yT3B0aW9ucywgZGVsZWdhdGUsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsIHRydWUpKTtcblx0XHR0aGlzLl90cmVlUG9vbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZVBvb2wsIHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudCkpO1xuXHRcdHRoaXMuX2NvbnRlbnRSZWZlcmVuY2VzTGlzdFBvb2wgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbGxhcHNpYmxlTGlzdFBvb2wsIHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpKTtcblxuXHRcdHRoaXMuX2lubGluZVRleHRNb2RlbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZVRleHRNb2RlbENvbGxlY3Rpb24pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb2RlQmxvY2tDb250ZW50UHJvdmlkZXIpKTtcblx0XHQvLyBBdXRvLXNraXAgcGVuZGluZyBxdWVzdGlvbiBjYXJvdXNlbHMgd2hlbiB1c2VyIHN1Ym1pdHMgYSBuZXcgY2hhdCBtZXNzYWdlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3QoZSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbHMgPSB0aGlzLnBlbmRpbmdRdWVzdGlvbkNhcm91c2Vscy5nZXQoZS5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChjYXJvdXNlbHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjYXJvdXNlbCBvZiBjYXJvdXNlbHMpIHtcblx0XHRcdFx0XHRjYXJvdXNlbC5za2lwKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2Fyb3VzZWxzLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQXV0by1za2lwIGFsbCBwZW5kaW5nIHF1ZXN0aW9uIGNhcm91c2VscyB3aGVuIGF1dG8tcmVwbHkgaXMgZW5hYmxlZCBtaWQtc2Vzc2lvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BdXRvUmVwbHkpICYmIHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BdXRvUmVwbHkpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgWywgY2Fyb3VzZWxzXSBvZiB0aGlzLnBlbmRpbmdRdWVzdGlvbkNhcm91c2Vscykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2Fyb3VzZWwgb2YgY2Fyb3VzZWxzKSB7XG5cdFx0XHRcdFx0XHRjYXJvdXNlbC5za2lwKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhcm91c2Vscy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVuZGluZ0RyYWdDb250cm9sbGVyOiBDaGF0UGVuZGluZ0RyYWdDb250cm9sbGVyIHwgdW5kZWZpbmVkO1xuXG5cdHNldCBwZW5kaW5nRHJhZ0NvbnRyb2xsZXIoY29udHJvbGxlcjogQ2hhdFBlbmRpbmdEcmFnQ29udHJvbGxlcikge1xuXHRcdHRoaXMuX3BlbmRpbmdEcmFnQ29udHJvbGxlciA9IGNvbnRyb2xsZXI7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJQ2hhdExpc3RJdGVtUmVuZGVyZXJPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlck9wdGlvbnMgPSB7IC4uLnRoaXMucmVuZGVyZXJPcHRpb25zLCAuLi5vcHRpb25zIH07XG5cdH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBDaGF0TGlzdEl0ZW1SZW5kZXJlci5JRDtcblx0fVxuXG5cdGVkaXRvcnNJblVzZSgpOiBJdGVyYWJsZTxDb2RlQmxvY2tQYXJ0PiB7XG5cdFx0cmV0dXJuIEl0ZXJhYmxlLmNvbmNhdCh0aGlzLl9lZGl0b3JQb29sLmluVXNlKCksIHRoaXMuX3Rvb2xFZGl0b3JQb29sLmluVXNlKCkpO1xuXHR9XG5cblxuXG5cdHByaXZhdGUgdHJhY2VMYXlvdXQobWV0aG9kOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdGlmIChmb3JjZVZlcmJvc2VMYXlvdXRUcmFjaW5nKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgQ2hhdExpc3RJdGVtUmVuZGVyZXIjJHttZXRob2R9OiAke21lc3NhZ2V9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hhdExpc3RJdGVtUmVuZGVyZXIjJHttZXRob2R9OiAke21lc3NhZ2V9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaXJlSXRlbUhlaWdodENoYW5nZSh0ZW1wbGF0ZTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBtZWFzdXJlZEhlaWdodD86IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGVtcGxhdGUuY3VycmVudEVsZW1lbnQgfHwgIXRlbXBsYXRlLnJvd0NvbnRhaW5lci5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlaWdodCA9IG1lYXN1cmVkSGVpZ2h0ID8/IHRlbXBsYXRlLnJvd0NvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS5oZWlnaHQ7XG5cdFx0aWYgKGhlaWdodCA9PT0gMCB8fCAhaGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9ybWFsaXplZEhlaWdodCA9IE1hdGguY2VpbChoZWlnaHQpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0ZW1wbGF0ZS5jdXJyZW50RWxlbWVudDtcblx0XHRjb25zdCB1cGRhdGUgPSByZWNvbmNpbGVDaGF0SXRlbUhlaWdodChcblx0XHRcdG5vcm1hbGl6ZWRIZWlnaHQsXG5cdFx0XHRlbGVtZW50LmN1cnJlbnRSZW5kZXJlZEhlaWdodCxcblx0XHRcdGVsZW1lbnQgPT09IHRoaXMuX2VsZW1lbnRCZWluZ1JlbmRlcmVkLFxuXHRcdFx0dGVtcGxhdGUuYWxsb2NhdGVkSGVpZ2h0LFxuXHRcdCk7XG5cdFx0ZWxlbWVudC5jdXJyZW50UmVuZGVyZWRIZWlnaHQgPSB1cGRhdGUubmV4dFJlbmRlcmVkSGVpZ2h0O1xuXG5cdFx0aWYgKHVwZGF0ZS5raW5kID09PSAnZmlyZScpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5maXJlKHsgZWxlbWVudCwgaGVpZ2h0OiB1cGRhdGUuaGVpZ2h0IH0pO1xuXHRcdH0gZWxzZSBpZiAodXBkYXRlLmtpbmQgPT09ICdzY2hlZHVsZUluaXRpYWwnKSB7XG5cdFx0XHRjb25zdCBzY2hlZHVsZWRIZWlnaHQgPSB1cGRhdGUuaGVpZ2h0O1xuXHRcdFx0ZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0ZW1wbGF0ZS5yb3dDb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHRcdGlmICh0ZW1wbGF0ZS5jdXJyZW50RWxlbWVudCAhPT0gZWxlbWVudCB8fCBlbGVtZW50LmN1cnJlbnRSZW5kZXJlZEhlaWdodCAhPT0gc2NoZWR1bGVkSGVpZ2h0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5maXJlKHsgZWxlbWVudCwgaGVpZ2h0OiBzY2hlZHVsZWRIZWlnaHQgfSk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKHVwZGF0ZS5raW5kID09PSAnZGVmZXJSZU1lYXN1cmUnKSB7XG5cdFx0XHQvLyBUaGUgbWVhc3VyZW1lbnQgYXJyaXZlZCBzeW5jaHJvbm91c2x5IGR1cmluZyB0aGlzIHJvdydzIHJlbmRlci4gUmUtbWVhc3VyZSBvbiB0aGVcblx0XHRcdC8vIG5leHQgZnJhbWUgKG9uY2UgdGhlIHJlbmRlciBwYXNzIGlzIG92ZXIpIHNvIHRoZSBncm93biBoZWlnaHQgcmVsaWFibHkgcmVhY2hlcyB0aGVcblx0XHRcdC8vIHRyZWUgd2l0aG91dCBhIHJlLWVudHJhbnQgbm90aWZpY2F0aW9uLlxuXHRcdFx0ZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0ZW1wbGF0ZS5yb3dDb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHRcdGlmICh0ZW1wbGF0ZS5jdXJyZW50RWxlbWVudCA9PT0gZWxlbWVudCAmJiBlbGVtZW50ICE9PSB0aGlzLl9lbGVtZW50QmVpbmdSZW5kZXJlZCkge1xuXHRcdFx0XHRcdHRoaXMuZmlyZUl0ZW1IZWlnaHRDaGFuZ2UodGVtcGxhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZSBhIHJhdGUgdG8gcmVuZGVyIGF0IGluIHdvcmRzL3MuXG5cdCAqL1xuXHRwcml2YXRlIGdldFByb2dyZXNzaXZlUmVuZGVyUmF0ZShlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogbnVtYmVyIHtcblx0XHRjb25zdCBlbnVtIFJhdGUge1xuXHRcdFx0TWluID0gNDAsXG5cdFx0XHRNYXggPSAyMDAwLFxuXHRcdH1cblxuXHRcdGNvbnN0IG1pbkFmdGVyQ29tcGxldGUgPSA4MDtcblxuXHRcdGNvbnN0IHJhdGUgPSBlbGVtZW50LmNvbnRlbnRVcGRhdGVUaW1pbmdzPy5pbXBsaWVkV29yZExvYWRSYXRlO1xuXHRcdGlmIChlbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdGlmICh0eXBlb2YgcmF0ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0cmV0dXJuIGNsYW1wKHJhdGUsIG1pbkFmdGVyQ29tcGxldGUsIFJhdGUuTWF4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBtaW5BZnRlckNvbXBsZXRlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgcmF0ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybiBjbGFtcChyYXRlLCBSYXRlLk1pbiwgUmF0ZS5NYXgpO1xuXHRcdH1cblxuXHRcdHJldHVybiA4O1xuXHR9XG5cblx0Z2V0Q29kZUJsb2NrSW5mb3NGb3JSZXNwb25zZShyZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IElDaGF0Q29kZUJsb2NrSW5mb1tdIHtcblx0XHRjb25zdCBjb2RlQmxvY2tzID0gdGhpcy5jb2RlQmxvY2tzQnlSZXNwb25zZUlkLmdldChyZXNwb25zZS5pZCk7XG5cdFx0cmV0dXJuIGNvZGVCbG9ja3MgPz8gW107XG5cdH1cblxuXHR1cGRhdGVWaWV3TW9kZWwodmlld01vZGVsOiBJQ2hhdFZpZXdNb2RlbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMudmlld01vZGVsID0gdmlld01vZGVsO1xuXHRcdHRoaXMuX2Fubm91bmNlZFRvb2xQcm9ncmVzc0tleXMuY2xlYXIoKTtcblx0XHR0aGlzLl9ub3RpZmllZFF1ZXN0aW9uQ2Fyb3VzZWxzLmNsZWFyKCk7XG5cdFx0dGhpcy5jb2RlQmxvY2tzQnlFZGl0b3JVcmkuY2xlYXIoKTtcblx0XHR0aGlzLmNvZGVCbG9ja3NCeVJlc3BvbnNlSWQuY2xlYXIoKTtcblx0XHR0aGlzLmZpbGVUcmVlc0J5UmVzcG9uc2VJZC5jbGVhcigpO1xuXHRcdHRoaXMuZm9jdXNlZEZpbGVUcmVlc0J5UmVzcG9uc2VJZC5jbGVhcigpO1xuXHRcdHRoaXMucmVzcG9uc2VUZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5jbGVhcigpO1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhQnlSZXF1ZXN0SWQuY2xlYXIoKTtcblxuXHRcdC8vIEZpcmUgdGhlIHZpZXdNb2RlbCB1cGRhdGUgZmlyc3Qgc28gdGVtcGxhdGUgbGlzdGVuZXJzIGNhbiBkaXNwb3NlXG5cdFx0Ly8gdGhlaXIgcmVuZGVyZWQgY29udGVudCBwYXJ0cyBhbmQgcmVsZWFzZSBwb29sIGl0ZW1zIGJhY2suIE9ubHkgdGhlblxuXHRcdC8vIGNsZWFyIHRoZSBwb29scyBzbyBhbGwgcmVsZWFzZWQgaXRlbXMgYXJlIGNhdWdodC5cblx0XHR0aGlzLl9vbkRpZFVwZGF0ZVZpZXdNb2RlbC5maXJlKCk7XG5cdFx0dGhpcy5fZWRpdG9yUG9vbC5jbGVhcigpO1xuXHRcdHRoaXMuX3Rvb2xFZGl0b3JQb29sLmNsZWFyKCk7XG5cdFx0dGhpcy5fZGlmZkVkaXRvclBvb2wuY2xlYXIoKTtcblx0XHR0aGlzLl90cmVlUG9vbC5jbGVhcigpO1xuXHRcdHRoaXMuX2NvbnRlbnRSZWZlcmVuY2VzTGlzdFBvb2wuY2xlYXIoKTtcblx0fVxuXG5cdGdldENvZGVCbG9ja0luZm9Gb3JFZGl0b3IodXJpOiBVUkkpOiBJQ2hhdENvZGVCbG9ja0luZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvZGVCbG9ja3NCeUVkaXRvclVyaS5nZXQodXJpKTtcblx0fVxuXG5cdGdldEZpbGVUcmVlSW5mb3NGb3JSZXNwb25zZShyZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IElDaGF0RmlsZVRyZWVJbmZvW10ge1xuXHRcdGNvbnN0IGZpbGVUcmVlcyA9IHRoaXMuZmlsZVRyZWVzQnlSZXNwb25zZUlkLmdldChyZXNwb25zZS5pZCk7XG5cdFx0cmV0dXJuIGZpbGVUcmVlcyA/PyBbXTtcblx0fVxuXG5cdGdldExhc3RGb2N1c2VkRmlsZVRyZWVGb3JSZXNwb25zZShyZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IElDaGF0RmlsZVRyZWVJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmaWxlVHJlZXMgPSB0aGlzLmZpbGVUcmVlc0J5UmVzcG9uc2VJZC5nZXQocmVzcG9uc2UuaWQpO1xuXHRcdGNvbnN0IGxhc3RGb2N1c2VkRmlsZVRyZWVJbmRleCA9IHRoaXMuZm9jdXNlZEZpbGVUcmVlc0J5UmVzcG9uc2VJZC5nZXQocmVzcG9uc2UuaWQpO1xuXHRcdGlmIChmaWxlVHJlZXM/Lmxlbmd0aCAmJiBsYXN0Rm9jdXNlZEZpbGVUcmVlSW5kZXggIT09IHVuZGVmaW5lZCAmJiBsYXN0Rm9jdXNlZEZpbGVUcmVlSW5kZXggPCBmaWxlVHJlZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmlsZVRyZWVzW2xhc3RGb2N1c2VkRmlsZVRyZWVJbmRleF07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQocmVxdWVzdElkPzogc3RyaW5nKTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJlcXVlc3RJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdGVtcGxhdGVEYXRhID0gdGhpcy50ZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5nZXQocmVxdWVzdElkKTtcblx0XHRpZiAodGVtcGxhdGVEYXRhICYmIHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudD8uaWQgPT09IHJlcXVlc3RJZCkge1xuXHRcdFx0cmV0dXJuIHRlbXBsYXRlRGF0YTtcblx0XHR9XG5cdFx0aWYgKHRlbXBsYXRlRGF0YSkge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5kZWxldGUocmVxdWVzdElkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodmlzaWJsZSk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1dpZHRoID0gd2lkdGggLSAodGhpcy5yZW5kZXJlck9wdGlvbnMuY29udGVudEhvcml6b250YWxQYWRkaW5nID8/IERFRkFVTFRfQ0hBVF9JVEVNX0hPUklaT05UQUxfUEFERElORyk7XG5cdFx0aWYgKG5ld1dpZHRoICE9PSB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCkpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRMYXlvdXRXaWR0aC5zZXQobmV3V2lkdGgsIHVuZGVmaW5lZCk7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiB0aGlzLl9lZGl0b3JQb29sLmluVXNlKCkpIHtcblx0XHRcdFx0ZWRpdG9yLmxheW91dChuZXdXaWR0aCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2xFZGl0b3Igb2YgdGhpcy5fdG9vbEVkaXRvclBvb2wuaW5Vc2UoKSkge1xuXHRcdFx0XHR0b29sRWRpdG9yLmxheW91dChuZXdXaWR0aCk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGRpZmZFZGl0b3Igb2YgdGhpcy5fZGlmZkVkaXRvclBvb2wuaW5Vc2UoKSkge1xuXHRcdFx0XHRkaWZmRWRpdG9yLmxheW91dChuZXdXaWR0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGN1cnJlbnRseSByZW5kZXJlZCBjaGF0IGl0ZW0gY29udGFpbmluZyB0aGUgbm9kZS5cblx0ICovXG5cdGdldEVsZW1lbnRGcm9tTm9kZShub2RlOiBIVE1MRWxlbWVudCk6IENoYXRUcmVlSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGN1cnJlbnQ6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG5vZGU7XG5cdFx0d2hpbGUgKGN1cnJlbnQgJiYgdGhpcy5kZWxlZ2F0ZS5jb250YWluZXIuY29udGFpbnMoY3VycmVudCkpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLnRlbXBsYXRlRGF0YUJ5Um93LmdldChjdXJyZW50KT8uY3VycmVudEVsZW1lbnQ7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudDtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnQgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGRpc2FibGVkT3ZlcmxheSA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCAkKCcuY2hhdC1yb3ctZGlzYWJsZWQtb3ZlcmxheScpKTtcblx0XHRjb25zdCByb3dDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmludGVyYWN0aXZlLWl0ZW0tY29udGFpbmVyJykpO1xuXHRcdGlmICh0aGlzLnJlbmRlcmVyT3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0XHRyb3dDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaW50ZXJhY3RpdmUtaXRlbS1jb21wYWN0Jyk7XG5cdFx0fVxuXG5cdFx0bGV0IGhlYWRlclBhcmVudCA9IHJvd0NvbnRhaW5lcjtcblx0XHRsZXQgdmFsdWVQYXJlbnQgPSByb3dDb250YWluZXI7XG5cdFx0bGV0IGRldGFpbENvbnRhaW5lclBhcmVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5yZW5kZXJlck9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdtaW5pbWFsJykge1xuXHRcdFx0cm93Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2ludGVyYWN0aXZlLWl0ZW0tY29tcGFjdCcpO1xuXHRcdFx0cm93Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21pbmltYWwnKTtcblx0XHRcdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0XHQvLyAgaWNvbiB8IGRldGFpbHNcblx0XHRcdC8vICAgICAgIHwgcmVmZXJlbmNlc1xuXHRcdFx0Ly8gICAgICAgfCB2YWx1ZVxuXHRcdFx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0XHRcdGNvbnN0IGxoc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQocm93Q29udGFpbmVyLCAkKCcuY29sdW1uLmxlZnQnKSk7XG5cdFx0XHRjb25zdCByaHNDb250YWluZXIgPSBkb20uYXBwZW5kKHJvd0NvbnRhaW5lciwgJCgnLmNvbHVtbi5yaWdodCcpKTtcblxuXHRcdFx0aGVhZGVyUGFyZW50ID0gbGhzQ29udGFpbmVyO1xuXHRcdFx0ZGV0YWlsQ29udGFpbmVyUGFyZW50ID0gcmhzQ29udGFpbmVyO1xuXHRcdFx0dmFsdWVQYXJlbnQgPSByaHNDb250YWluZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVyID0gZG9tLmFwcGVuZChoZWFkZXJQYXJlbnQsICQoJy5oZWFkZXInKSk7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChyb3dDb250YWluZXIpKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdGNvbnN0IHJlcXVlc3RIb3ZlciA9IGRvbS5hcHBlbmQocm93Q29udGFpbmVyLCAkKCcucmVxdWVzdC1ob3ZlcicpKTtcblx0XHRsZXQgdGl0bGVUb29sYmFyOiBNZW51V29ya2JlbmNoVG9vbEJhciB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5yZW5kZXJlck9wdGlvbnMubm9IZWFkZXIpIHtcblx0XHRcdGhlYWRlci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGl0bGVUb29sYmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHJlcXVlc3RIb3ZlciwgTWVudUlkLkNoYXRNZXNzYWdlVGl0bGUsIHtcblx0XHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sYmFyT3B0aW9uczoge1xuXHRcdFx0XHRcdHNob3VsZElubGluZVN1Ym1lbnU6IHN1Ym1lbnUgPT4gc3VibWVudS5hY3Rpb25zLmxlbmd0aCA8PSAxXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMuaG92ZXJIaWRkZW4ocmVxdWVzdEhvdmVyKTtcblxuXHRcdGNvbnN0IGNoZWNrcG9pbnRDb250YWluZXIgPSBkb20uYXBwZW5kKHJvd0NvbnRhaW5lciwgJCgnLmNoZWNrcG9pbnQtY29udGFpbmVyJykpO1xuXHRcdGRvbS5hcHBlbmQoY2hlY2twb2ludENvbnRhaW5lciwgJCgnLmNoZWNrcG9pbnQtbGluZS1sZWZ0JykpO1xuXG5cdFx0Y29uc3QgY2hlY2twb2ludFRvb2xiYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgY2hlY2twb2ludENvbnRhaW5lciwgTWVudUlkLkNoYXRNZXNzYWdlQ2hlY2twb2ludCwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRpZiAoYWN0aW9uLml0ZW0uaWQgPT09IFJlc3RvcmVDaGVja3BvaW50QWN0aW9uSWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXN0b3JlQ2hlY2twb2ludEFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0sIChjb250ZXh0OiB1bmtub3duKSA9PiB0aGlzLmNoZWNrcG9pbnRSZXN0b3JlTmVlZHNDb25maXJtYXRpb24oY29udGV4dCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoYWN0aW9uLml0ZW0uaWQgPT09IEZvcmtDb252ZXJzYXRpb25BY3Rpb25JZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEZvcmtBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kaWNvbkFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogdHJ1ZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkSW5saW5lU3VibWVudTogc3VibWVudSA9PiBzdWJtZW51LmFjdGlvbnMubGVuZ3RoIDw9IDFcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0ZG9tLmFwcGVuZChjaGVja3BvaW50Q29udGFpbmVyLCAkKCcuY2hlY2twb2ludC1saW5lLXJpZ2h0JykpO1xuXG5cdFx0Y29uc3QgdXNlciA9IGRvbS5hcHBlbmQoaGVhZGVyLCAkKCcudXNlcicpKTtcblx0XHRjb25zdCBhdmF0YXJDb250YWluZXIgPSBkb20uYXBwZW5kKHVzZXIsICQoJy5hdmF0YXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHVzZXJuYW1lID0gZG9tLmFwcGVuZCh1c2VyLCAkKCdoMy51c2VybmFtZScpKTtcblx0XHR1c2VybmFtZS50YWJJbmRleCA9IDA7XG5cdFx0Y29uc3QgZGV0YWlsQ29udGFpbmVyID0gZG9tLmFwcGVuZChkZXRhaWxDb250YWluZXJQYXJlbnQgPz8gdXNlciwgJCgnc3Bhbi5kZXRhaWwtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGRldGFpbCA9IGRvbS5hcHBlbmQoZGV0YWlsQ29udGFpbmVyLCAkKCdzcGFuLmRldGFpbCcpKTtcblx0XHRkb20uYXBwZW5kKGRldGFpbENvbnRhaW5lciwgJCgnc3Bhbi5jaGF0LWFuaW1hdGVkLWVsbGlwc2lzJykpO1xuXHRcdGNvbnN0IHZhbHVlID0gZG9tLmFwcGVuZCh2YWx1ZVBhcmVudCwgJCgnLnZhbHVlJykpO1xuXHRcdGNvbnN0IHJlcXVlc3RUaW1lc3RhbXBDb250YWluZXIgPSBkb20uYXBwZW5kKHZhbHVlUGFyZW50LCAkKCcuY2hhdC1yZXF1ZXN0LXRpbWVzdGFtcC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBjb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVEaXNwb3NhYmxlcyA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRjb25zdCBmb290ZXJUb29sYmFyQ29udGFpbmVyID0gZG9tLmFwcGVuZChyb3dDb250YWluZXIsICQoJy5jaGF0LWZvb3Rlci10b29sYmFyJykpO1xuXHRcdGlmICh0aGlzLnJlbmRlcmVyT3B0aW9ucy5ub0Zvb3Rlcikge1xuXHRcdFx0Zm9vdGVyVG9vbGJhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb290ZXJUb29sYmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGZvb3RlclRvb2xiYXJDb250YWluZXIsIE1lbnVJZC5DaGF0TWVzc2FnZUZvb3Rlciwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHNob3VsZElubGluZVN1Ym1lbnU6IHN1Ym1lbnUgPT4gc3VibWVudS5hY3Rpb25zLmxlbmd0aCA8PSAxIH0sXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiAmJiBhY3Rpb24uaXRlbS5pZCA9PT0gTWFya0hlbHBmdWxBY3Rpb25JZCkge1xuXHRcdFx0XHRcdGNvbnN0IGFuaW1hdGlvbiA9IHVwdm90ZUFuaW1hdGlvblNldHRpbmdUb0VudW0odGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQudXB2b3RlQW5pbWF0aW9uJykpO1xuXHRcdFx0XHRcdHJldHVybiBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIG9uQ2xpY2tBbmltYXRpb246IGFuaW1hdGlvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5zZXJ0IHRoZSBkZXRhaWxzIGNvbnRhaW5lciBpbnRvIHRoZSB0b29sYmFyJ3MgaW50ZXJuYWwgZWxlbWVudCBzdHJ1Y3R1cmVcblx0XHRjb25zdCBmb290ZXJEZXRhaWxzQ29udGFpbmVyID0gZG9tLmFwcGVuZChmb290ZXJUb29sYmFyLmdldEVsZW1lbnQoKSwgJCgnLmNoYXQtZm9vdGVyLWRldGFpbHMnKSk7XG5cdFx0Zm9vdGVyRGV0YWlsc0NvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cblx0XHRjb25zdCBjaGVja3BvaW50UmVzdG9yZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQocm93Q29udGFpbmVyLCAkKCcuY2hlY2twb2ludC1yZXN0b3JlLWNvbnRhaW5lcicpKTtcblx0XHRkb20uYXBwZW5kKGNoZWNrcG9pbnRSZXN0b3JlQ29udGFpbmVyLCAkKCcuY2hlY2twb2ludC1saW5lLWxlZnQnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKGNoZWNrcG9pbnRSZXN0b3JlQ29udGFpbmVyLCAkKCdzcGFuLmNoZWNrcG9pbnQtbGFiZWwtdGV4dCcpKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGVja3BvaW50UmVzdG9yZScsICdDaGVja3BvaW50IFJlc3RvcmVkJyk7XG5cdFx0Y29uc3QgZG90ID0gZG9tLmFwcGVuZChjaGVja3BvaW50UmVzdG9yZUNvbnRhaW5lciwgJCgnc3Bhbi5jaGVja3BvaW50LWRvdC1zZXBhcmF0b3InKSk7XG5cdFx0ZG90LnRleHRDb250ZW50ID0gJ1xcdTAwQjcnO1xuXHRcdGRvdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBjaGVja3BvaW50UmVzdG9yZVRvb2xiYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgY2hlY2twb2ludFJlc3RvcmVDb250YWluZXIsIE1lbnVJZC5DaGF0TWVzc2FnZVJlc3RvcmVDaGVja3BvaW50LCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGljb25BY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdHJlbmRlckRyb3Bkb3duQXNDaGlsZEVsZW1lbnQ6IHRydWUsXG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZElubGluZVN1Ym1lbnU6IHN1Ym1lbnUgPT4gc3VibWVudS5hY3Rpb25zLmxlbmd0aCA8PSAxXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQoY2hlY2twb2ludFJlc3RvcmVDb250YWluZXIsICQoJy5jaGVja3BvaW50LWxpbmUtcmlnaHQnKSk7XG5cblxuXHRcdGNvbnN0IGFnZW50SG92ZXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBZ2VudEhvdmVyKSk7XG5cdFx0Y29uc3QgaG92ZXJDb250ZW50ID0gKCkgPT4ge1xuXHRcdFx0aWYgKGlzUmVzcG9uc2VWTSh0ZW1wbGF0ZS5jdXJyZW50RWxlbWVudCkgJiYgdGVtcGxhdGUuY3VycmVudEVsZW1lbnQuYWdlbnQgJiYgIXRlbXBsYXRlLmN1cnJlbnRFbGVtZW50LmFnZW50LmlzRGVmYXVsdCkge1xuXHRcdFx0XHRhZ2VudEhvdmVyLnNldEFnZW50KHRlbXBsYXRlLmN1cnJlbnRFbGVtZW50LmFnZW50LmlkKTtcblx0XHRcdFx0cmV0dXJuIGFnZW50SG92ZXIuZG9tTm9kZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGNvbnN0IGhvdmVyT3B0aW9ucyA9IGdldENoYXRBZ2VudEhvdmVyT3B0aW9ucygoKSA9PiBpc1Jlc3BvbnNlVk0odGVtcGxhdGUuY3VycmVudEVsZW1lbnQpID8gdGVtcGxhdGUuY3VycmVudEVsZW1lbnQuYWdlbnQgOiB1bmRlZmluZWQsIHRoaXMuY29tbWFuZFNlcnZpY2UpO1xuXHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHVzZXIsIGhvdmVyQ29udGVudCwgaG92ZXJPcHRpb25zKSk7XG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih1c2VyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldi5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwgZXYuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBob3ZlckNvbnRlbnQoKTtcblx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHR0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHsgY29udGVudCwgdGFyZ2V0OiB1c2VyLCB0cmFwRm9jdXM6IHRydWUsIGFjdGlvbnM6IGhvdmVyT3B0aW9ucy5hY3Rpb25zIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV2LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25PYnNlcnZlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Nvbm5lY3Rpb24tb2JzZXJ2ZXInKSBhcyBkb20uQ29ubmVjdGlvbk9ic2VydmVyRWxlbWVudDtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgY29ubmVjdGlvbk9ic2VydmVyKTtcblx0XHRjb25zdCB0ZW1wbGF0ZTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlID0geyBoZWFkZXIsIGF2YXRhckNvbnRhaW5lciwgcmVxdWVzdEhvdmVyLCB1c2VybmFtZSwgZGV0YWlsLCB2YWx1ZSwgcmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lciwgcm93Q29udGFpbmVyLCBlbGVtZW50RGlzcG9zYWJsZXMsIHRlbXBsYXRlRGlzcG9zYWJsZXMsIGNvbnRleHRLZXlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZTogc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UsIGFnZW50SG92ZXIsIHRpdGxlVG9vbGJhciwgZm9vdGVyVG9vbGJhciwgZm9vdGVyVG9vbGJhckNvbnRhaW5lciwgZm9vdGVyRGV0YWlsc0NvbnRhaW5lciwgZGlzYWJsZWRPdmVybGF5LCBjaGVja3BvaW50VG9vbGJhciwgY2hlY2twb2ludFJlc3RvcmVUb29sYmFyLCBjaGVja3BvaW50Q29udGFpbmVyLCBjaGVja3BvaW50UmVzdG9yZUNvbnRhaW5lciwgY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlRGlzcG9zYWJsZXMgfTtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YUJ5Um93LnNldChyb3dDb250YWluZXIsIHRlbXBsYXRlKTtcblxuXHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX29uRGlkVXBkYXRlVmlld01vZGVsLmV2ZW50KCgpID0+IHtcblx0XHRcdGlmICghdGVtcGxhdGUuY3VycmVudEVsZW1lbnQgfHwgIXRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UgfHwgIWlzRXF1YWwodGVtcGxhdGUuY3VycmVudEVsZW1lbnQuc2Vzc2lvblJlc291cmNlLCB0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJSZW5kZXJlZFBhcnRzKHRlbXBsYXRlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRpc2FibGVkT3ZlcmxheSwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0ZW1wbGF0ZS5jdXJyZW50RWxlbWVudDtcblx0XHRcdGlmICghY3VycmVudCB8fCBjdXJyZW50LmlkID09PSB0aGlzLnZpZXdNb2RlbC5lZGl0aW5nLmlkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRpc2FibGVkT3ZlcmxheS5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJykpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEZvY3VzT3V0c2lkZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVzaXplT2JzZXJ2ZXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgZG9tLkRpc3Bvc2FibGVSZXNpemVPYnNlcnZlcignQ2hhdExpc3RJdGVtUmVuZGVyZXIuaXRlbUhlaWdodCcsIChlbnRyaWVzKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGVudHJpZXNbMF07XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0dGhpcy5maXJlSXRlbUhlaWdodENoYW5nZSh0ZW1wbGF0ZSwgZW50cnkuYm9yZGVyQm94U2l6ZS5hdCgwKT8uYmxvY2tTaXplKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgcmVzaXplT2JzZXJ2YXRpb24gPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRcdGNvbm5lY3Rpb25PYnNlcnZlci5vbkRpZENvbm5lY3QgPSAoKSA9PiB7XG5cdFx0XHRyZXNpemVPYnNlcnZhdGlvbi52YWx1ZSA9IHJlc2l6ZU9ic2VydmVyLm9ic2VydmUocm93Q29udGFpbmVyKTtcblx0XHR9O1xuXHRcdGNvbm5lY3Rpb25PYnNlcnZlci5vbkRpZERpc2Nvbm5lY3QgPSAoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZS5yZW5kZXJlZFBhcnRzTW91bnRlZCA9IGZhbHNlO1xuXHRcdFx0cmVzaXplT2JzZXJ2YXRpb24uY2xlYXIoKTtcblx0XHR9O1xuXHRcdGlmIChyb3dDb250YWluZXIuaXNDb25uZWN0ZWQpIHtcblx0XHRcdGNvbm5lY3Rpb25PYnNlcnZlci5vbkRpZENvbm5lY3QoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGVtcGxhdGU7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyB3aGV0aGVyIHJlc3RvcmluZyB0byB0aGUgY2hlY2twb2ludCBhdCB0aGUgZ2l2ZW4gY2hhdCBpdGVtXG5cdCAqIHdvdWxkIGRpc2NhcmQgZmlsZSBlZGl0cyB0aGF0IHRoZSB1c2VyIHNob3VsZCBjb25maXJtIGluLXBsYWNlLiBVc2VkIGJ5XG5cdCAqIHRoZSBcIlJlc3RvcmUgQ2hlY2twb2ludFwiIGJ1dHRvbiB0byBwcmVzZW50IGFuIGlubGluZSBjb25maXJtL2NhbmNlbFxuXHQgKiBhZmZvcmRhbmNlIGZvciBhZ2VudCBob3N0IHNlc3Npb25zLCB3aGljaCBkbyBub3Qgc3VyZmFjZSB0aGUgbW9kYWxcblx0ICogcmVtb3ZhbC1jb25maXJtYXRpb24gZGlhbG9nIHVzZWQgYnkgdGhlIHN0YW5kYXJkIGVkaXRpbmcgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgY2hlY2twb2ludFJlc3RvcmVOZWVkc0NvbmZpcm1hdGlvbihjb250ZXh0OiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFpc1JlcXVlc3RWTShjb250ZXh0KSAmJiAhaXNSZXNwb25zZVZNKGNvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdElkID0gaXNSZXF1ZXN0Vk0oY29udGV4dCkgPyBjb250ZXh0LmlkIDogY29udGV4dC5yZXF1ZXN0SWQ7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oY29udGV4dC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtb2RlbD8uZWRpdGluZ1Nlc3Npb247XG5cdFx0aWYgKCFtb2RlbCB8fCAhKHNlc3Npb24gaW5zdGFuY2VvZiBBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdHMgPSBtb2RlbC5nZXRSZXF1ZXN0cygpO1xuXHRcdGNvbnN0IGluZGV4ID0gcmVxdWVzdHMuZmluZEluZGV4KHJlcXVlc3QgPT4gcmVxdWVzdC5pZCA9PT0gcmVxdWVzdElkKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcXVlc3RzLnNsaWNlKGluZGV4KS5zb21lKHJlcXVlc3QgPT4gc2Vzc2lvbi5oYXNFZGl0c0luUmVxdWVzdChyZXF1ZXN0LmlkKSk7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDaGF0VHJlZUl0ZW0sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgZGV0YWlscz86IElMaXN0RWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWxsb2NhdGVkSGVpZ2h0ID0gZGV0YWlscz8uaGVpZ2h0O1xuXHRcdHRoaXMuX2VsZW1lbnRCZWluZ1JlbmRlcmVkID0gbm9kZS5lbGVtZW50O1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLnJlbmRlckNoYXRUcmVlSXRlbShub2RlLmVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50QmVpbmdSZW5kZXJlZCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZSB0aGUgcmVuZGVyZWQgcGFydHMgaW4gdGhlIHRlbXBsYXRlLCB3aGljaCBhcmVuJ3QgZG9uZSBpbiBkaXNwb3NlRWxlbWVudFxuXHQgKiBzbyB0aGV5IGNhbiBiZSByZXVzZWQgd2hlbiBhIG5ldyByZW5kZXIgaXMgc3RhcnRlZC5cblx0ICovXG5cdHByaXZhdGUgY2xlYXJSZW5kZXJlZFBhcnRzKHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdmVDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmUodGVtcGxhdGVEYXRhKTtcblx0XHRpZiAodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpIHtcblx0XHRcdGRpc3Bvc2UoY29hbGVzY2UodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzID0gdW5kZWZpbmVkO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkQ29udGVudCA9IHVuZGVmaW5lZDtcblx0XHRcdGRvbS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLnZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKGlzUGVuZGluZ0RpdmlkZXJWTSh0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQpKSB7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLm1vdmVkT3V0VG9vbFBhcnRzPy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLm1vdmVkT3V0VG9vbFBhcnRzID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gVGhpcyB0ZW1wbGF0ZSBpdGVtIGlzIG5vIGxvbmdlciBpbiB1c2UsIG9yIGhhdmluZyBhbm90aGVyIGVsZW1lbnQgcmVuZGVyZWQgaW50byBpdCxcblx0XHQvLyBjbGVhciB0aGUgY29udGV4dCBvbiB0b29sYmFycyBzbyBpdCBkb2Vzbid0IHJldGFpbiB0aGUgdmlld21vZGVsLlxuXHRcdGlmICh0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5mb290ZXJUb29sYmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmNoZWNrcG9pbnRUb29sYmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmNoZWNrcG9pbnRSZXN0b3JlVG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlT3BlbiA9IHVuZGVmaW5lZDtcblx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4ID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS53YXNSZXNwb25zZUNvbXBsZXRlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDaGF0VHJlZUl0ZW0oZWxlbWVudDogQ2hhdFRyZWVJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGlmICh0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQgJiYgdGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50LmlkICE9PSBlbGVtZW50LmlkKSB7XG5cdFx0XHR0aGlzLnRyYWNlTGF5b3V0KCdyZW5kZXJDaGF0VHJlZUl0ZW0nLCBgUmVuZGVyaW5nIGEgZGlmZmVyZW50IGVsZW1lbnQgaW50byB0aGUgdGVtcGxhdGUsIGluZGV4PSR7aW5kZXh9YCk7XG5cdFx0XHRjb25zdCBtYXBwZWRUZW1wbGF0ZURhdGEgPSB0aGlzLnRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmdldCh0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQuaWQpO1xuXHRcdFx0aWYgKG1hcHBlZFRlbXBsYXRlRGF0YSAmJiAobWFwcGVkVGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50Py5pZCAhPT0gdGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50LmlkKSkge1xuXHRcdFx0XHR0aGlzLnRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmRlbGV0ZSh0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNsZWFyUmVuZGVyZWRQYXJ0cyh0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5zZXQoZWxlbWVudC5pZCwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdC8vIENsZWFyIHBlbmRpbmctcmVsYXRlZCBjbGFzc2VzIGFuZCBkcmFnIGhhbmRsZSBmcm9tIHByZXZpb3VzIHJlbmRlcnNcblx0XHQvLyBEbyB0aGlzIGJlZm9yZSBlbGVtZW50LXR5cGUgY2hlY2tzIHRvIGVuc3VyZSBkaXZpZGVycyBhbHNvIGdldCBjbGVhbmVkIHVwXG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdwZW5kaW5nLWl0ZW0nLCAncGVuZGluZy1kaXZpZGVyJywgJ3BlbmRpbmctcmVxdWVzdCcsICdjaGF0LXBlbmRpbmctZHJhZ2dpbmcnLCAndGVybWluYWwtY29tbWFuZC1yZXF1ZXN0Jyk7XG5cdFx0dGVtcGxhdGVEYXRhLmRyYWdIYW5kbGU/LnJlbW92ZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5kcmFnSGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdGRlbGV0ZSB0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmRhdGFzZXQucGVuZGluZ1JlcXVlc3RJZDtcblx0XHRkZWxldGUgdGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5kYXRhc2V0LnBlbmRpbmdLaW5kO1xuXG5cdFx0Ly8gSGFuZGxlIHBlbmRpbmcgZGl2aWRlciB3aXRoIHNpbXBsaWZpZWQgcmVuZGVyaW5nXG5cdFx0aWYgKGlzUGVuZGluZ0RpdmlkZXJWTShlbGVtZW50KSkge1xuXHRcdFx0dGhpcy5yZW5kZXJQZW5kaW5nRGl2aWRlcihlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtpbmQgPSBpc1JlcXVlc3RWTShlbGVtZW50KSA/ICdyZXF1ZXN0JyA6XG5cdFx0XHRpc1Jlc3BvbnNlVk0oZWxlbWVudCkgPyAncmVzcG9uc2UnIDpcblx0XHRcdFx0aXNQZW5kaW5nRGl2aWRlclZNKGVsZW1lbnQpID8gJ3BlbmRpbmdEaXZpZGVyJyA6XG5cdFx0XHRcdFx0J3dlbGNvbWUnO1xuXHRcdHRoaXMudHJhY2VMYXlvdXQoJ3JlbmRlckVsZW1lbnQnLCBgJHtraW5kfSwgaW5kZXg9JHtpbmRleH1gKTtcblxuXHRcdENoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChpc1Jlc3BvbnNlVk0oZWxlbWVudCkpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5pdGVtSWQuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGVsZW1lbnQuaWQpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5pc1JlcXVlc3QuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGlzUmVxdWVzdFZNKGVsZW1lbnQpKTtcblx0XHRDaGF0Q29udGV4dEtleXMuaXNGaXJzdFJlcXVlc3QuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmIHRoaXMudmlld01vZGVsPy5tb2RlbC5nZXRSZXF1ZXN0cygpWzBdPy5pZCA9PT0gZWxlbWVudC5pZCk7XG5cdFx0Q2hhdENvbnRleHRLZXlzLmlzUGVuZGluZ1JlcXVlc3QuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmICEhZWxlbWVudC5wZW5kaW5nS2luZCk7XG5cdFx0Q2hhdENvbnRleHRLZXlzLnJlc3BvbnNlRGV0ZWN0ZWRBZ2VudENvbW1hbmQuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiBlbGVtZW50LmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCk7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlc3BvbnNlU3VwcG9ydHNJc3N1ZVJlcG9ydGluZy5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoISFlbGVtZW50LmFnZW50Py5tZXRhZGF0YS5zdXBwb3J0SXNzdWVSZXBvcnRpbmcpO1xuXHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlc3BvbnNlVm90ZS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZWxlbWVudC52b3RlID09PSBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uLlVwID8gJ3VwJyA6IGVsZW1lbnQudm90ZSA9PT0gQ2hhdEFnZW50Vm90ZURpcmVjdGlvbi5Eb3duID8gJ2Rvd24nIDogJycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRDaGF0Q29udGV4dEtleXMucmVzcG9uc2VWb3RlLmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldCgnJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRlbXBsYXRlRGF0YS50aXRsZVRvb2xiYXIpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS50aXRsZVRvb2xiYXIuY29udGV4dCA9IGVsZW1lbnQ7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5mb290ZXJUb29sYmFyLmNvbnRleHQgPSBlbGVtZW50O1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VUaW1pbmdMaXN0ZW5lcnMgPSB0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29uc3QgdXBkYXRlUmVzcG9uc2VEZXRhaWxzID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IGlzUmVzcG9uc2VWTShlbGVtZW50KSA/IGVsZW1lbnQucmVzdWx0Py5kZXRhaWxzIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY29tcGxldGVkQXRFbGVtZW50ID0gcmVuZGVyQ2hhdFJlc3BvbnNlRGV0YWlscyhcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIsXG5cdFx0XHRcdGRldGFpbHMsXG5cdFx0XHRcdGlzUmVzcG9uc2VWTShlbGVtZW50KSA/IGVsZW1lbnQubW9kZWwuY29tcGxldGlvblRpbWVzdGFtcCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNSZXNwb25zZVZNKGVsZW1lbnQpID8gZWxlbWVudC5tb2RlbC5lbGFwc2VkTXMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uVmVyYm9zZSksXG5cdFx0XHQpO1xuXHRcdFx0aWYgKCFjb21wbGV0ZWRBdEVsZW1lbnQpIHtcblx0XHRcdFx0cmVzcG9uc2VUaW1pbmdMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRyZXNwb25zZVRpbWluZ0xpc3RlbmVycy52YWx1ZSA9IGxpc3RlbmVycztcblx0XHRcdGxldCByZXNwb25zZVRpbWluZ0JvdW5kczogRE9NUmVjdCB8IHVuZGVmaW5lZDtcblx0XHRcdGxpc3RlbmVycy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb21wbGV0ZWRBdEVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfRU5URVIsIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBib3VuZHMgPSBjb21wbGV0ZWRBdEVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdHJlc3BvbnNlVGltaW5nQm91bmRzID0gYm91bmRzO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXJlc3BvbnNlLWZsaXAtcmVzZXQnKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXNwb25zZS1mbGlwLWFjdGl2ZScpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXJlc3BvbnNlLWZsaXAtZG93bicsIGUuY2xpZW50WSA8IGJvdW5kcy50b3AgKyBib3VuZHMuaGVpZ2h0IC8gMik7XG5cdFx0XHRcdHZvaWQgdGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5mb290ZXJEZXRhaWxzQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtcmVzcG9uc2UtZmxpcC1yZXNldCcpO1xuXHRcdFx0XHR2b2lkIHRlbXBsYXRlRGF0YS5mb290ZXJEZXRhaWxzQ29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXJlc3BvbnNlLWZsaXAtYWN0aXZlJyk7XG5cdFx0XHR9KSk7XG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIsIGRvbS5FdmVudFR5cGUuTU9VU0VfTU9WRSwgZSA9PiB7XG5cdFx0XHRcdGlmIChyZXNwb25zZVRpbWluZ0JvdW5kcyAmJiAoZS5jbGllbnRYIDwgcmVzcG9uc2VUaW1pbmdCb3VuZHMubGVmdCB8fCBlLmNsaWVudFggPiByZXNwb25zZVRpbWluZ0JvdW5kcy5yaWdodCB8fCBlLmNsaWVudFkgPCByZXNwb25zZVRpbWluZ0JvdW5kcy50b3AgfHwgZS5jbGllbnRZID4gcmVzcG9uc2VUaW1pbmdCb3VuZHMuYm90dG9tKSkge1xuXHRcdFx0XHRcdHJlc3BvbnNlVGltaW5nQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5mb290ZXJEZXRhaWxzQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtcmVzcG9uc2UtZmxpcC1hY3RpdmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0bGlzdGVuZXJzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlRGF0YS5mb290ZXJEZXRhaWxzQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCAoKSA9PiB7XG5cdFx0XHRcdHJlc3BvbnNlVGltaW5nQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXJlc3BvbnNlLWZsaXAtYWN0aXZlJyk7XG5cdFx0XHR9KSk7XG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIsIGRvbS5FdmVudFR5cGUuRk9DVVMsICgpID0+IHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXNwb25zZS1mbGlwLWFjdGl2ZScsICdjaGF0LXJlc3BvbnNlLWZsaXAtZG93bicpO1xuXHRcdFx0fSkpO1xuXHRcdH07XG5cdFx0dXBkYXRlUmVzcG9uc2VEZXRhaWxzKCk7XG5cblx0XHRDaGF0Q29udGV4dEtleXMucmVzcG9uc2VIYXNFcnJvci5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmICEhZWxlbWVudC5lcnJvckRldGFpbHMpO1xuXHRcdGNvbnN0IGlzRmlsdGVyZWQgPSAhIShpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgZWxlbWVudC5lcnJvckRldGFpbHM/LnJlc3BvbnNlSXNGaWx0ZXJlZCk7XG5cdFx0Q2hhdENvbnRleHRLZXlzLnJlc3BvbnNlSXNGaWx0ZXJlZC5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoaXNGaWx0ZXJlZCk7XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpPy5sb2NhdGlvbjtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VkaXRpbmctc2Vzc2lvbicsIGxvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2ludGVyYWN0aXZlLXJlcXVlc3QnLCBpc1JlcXVlc3RWTShlbGVtZW50KSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdpbnRlcmFjdGl2ZS1yZXNwb25zZScsIGlzUmVzcG9uc2VWTShlbGVtZW50KSk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlID0gY2hlY2tNb2RlT3B0aW9uKHRoaXMuZGVsZWdhdGUuY3VycmVudENoYXRNb2RlKCksIHRoaXMucmVuZGVyZXJPcHRpb25zLnByb2dyZXNzTWVzc2FnZUF0Qm90dG9tT2ZSZXNwb25zZSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWRldGFpbC1wcm9ncmVzcycsIGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiAhZWxlbWVudC5pc0NvbXBsZXRlICYmICFlbGVtZW50LnByb2dyZXNzTWVzc2FnZXMubGVuZ3RoICYmICFwcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2UpO1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1wcm9ncmVzcy1yZXNlcnZhYmxlJywgaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmICFlbGVtZW50LmlzQ29tcGxldGUgJiYgISFwcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2UpO1xuXG5cdFx0Ly8gVG9nZ2xlIHNob3ctY2hlY2ttYXJrcyBjbGFzcyBhdCB0aGUgY29udGFpbmVyIGxldmVsIGZvciB0aGUgYWNjZXNzaWJpbGl0eSBzZXR0aW5nLFxuXHRcdC8vIHNvIGNoaWxkIGNvbnRlbnQgcGFydHMgY2FuIHVzZSBDU1MgZGVzY2VuZGFudCBzZWxlY3RvcnMgaW5zdGVhZCBvZiBlYWNoIHN1YnNjcmliaW5nIGluZGl2aWR1YWxseS5cblx0XHRjb25zdCB1cGRhdGVDb250YWluZXJDaGVja21hcmtzID0gKCkgPT4gdGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWNoZWNrbWFya3MnLCAhIXRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLlNob3dDaGF0Q2hlY2ttYXJrcykpO1xuXHRcdHVwZGF0ZUNvbnRhaW5lckNoZWNrbWFya3MoKTtcblx0XHRjb25zdCB1cGRhdGVWZXJib3NlRGV0YWlscyA9ICgpID0+IHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdy12ZXJib3NlLWRldGFpbHMnLCAhIXRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5WZXJib3NlKSk7XG5cdFx0dXBkYXRlVmVyYm9zZURldGFpbHMoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5TaG93Q2hhdENoZWNrbWFya3MpKSB7XG5cdFx0XHRcdHVwZGF0ZUNvbnRhaW5lckNoZWNrbWFya3MoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlZlcmJvc2UpKSB7XG5cdFx0XHRcdHVwZGF0ZVZlcmJvc2VEZXRhaWxzKCk7XG5cdFx0XHRcdHVwZGF0ZVJlc3BvbnNlRGV0YWlscygpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ29sbGFwc2VDb21wbGV0ZWRSZXNwb25zZXMpICYmIGlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZShlbGVtZW50LCB0ZW1wbGF0ZURhdGEucmVuZGVyZWRDb250ZW50ID8/IFtdLCB0ZW1wbGF0ZURhdGEsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIXRoaXMucmVuZGVyZXJPcHRpb25zLm5vSGVhZGVyKSB7XG5cdFx0XHR0aGlzLnJlbmRlckF2YXRhcihlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzU3lzdGVtSW5pdGlhdGVkUmVxdWVzdCA9IGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmICEhZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZDtcblxuXHRcdHRlbXBsYXRlRGF0YS51c2VybmFtZS50ZXh0Q29udGVudCA9IGVsZW1lbnQudXNlcm5hbWU7XG5cdFx0Y29uc3QgaGlkZUNoYXRVc2VySWRlbnRpdHkgPSBzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eShlbGVtZW50LnVzZXJuYW1lLCBlbGVtZW50LnNlc3Npb25SZXNvdXJjZSwgaXNSZXNwb25zZVZNKGVsZW1lbnQpLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93LCBpc1N5c3RlbUluaXRpYXRlZFJlcXVlc3QpO1xuXHRcdHRlbXBsYXRlRGF0YS51c2VybmFtZS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBoaWRlQ2hhdFVzZXJJZGVudGl0eSk7XG5cdFx0dGVtcGxhdGVEYXRhLmF2YXRhckNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBoaWRlQ2hhdFVzZXJJZGVudGl0eSk7XG5cblx0XHR0aGlzLmhvdmVySGlkZGVuKHRlbXBsYXRlRGF0YS5yZXF1ZXN0SG92ZXIpO1xuXHRcdGRvbS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLmRldGFpbCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEucmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lcik7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0dGhpcy5yZW5kZXJEZXRhaWwoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludFRvb2xiYXIuY29udGV4dCA9IGVsZW1lbnQ7XG5cdFx0Y29uc3Qgc3VwcG9ydHNGb3JrT3JSZXN0b3JhdGlvbiA9IHRoaXMucmVuZGVyZXJPcHRpb25zLnN1cHBvcnRzRm9yayB8fCAodGhpcy5yZW5kZXJlck9wdGlvbnMucmVzdG9yYWJsZSA/PyB0cnVlKTtcblx0XHRjb25zdCBjaGVja3BvaW50RW5hYmxlZCA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5DaGVja3BvaW50c0VuYWJsZWQpXG5cdFx0XHQmJiBzdXBwb3J0c0ZvcmtPclJlc3RvcmF0aW9uO1xuXHRcdGNvbnN0IGlzUGVuZGluZ1JlcXVlc3QgPSBpc1JlcXVlc3RWTShlbGVtZW50KSAmJiAhIWVsZW1lbnQucGVuZGluZ0tpbmQ7XG5cblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgfHwgaXNQZW5kaW5nUmVxdWVzdCB8fCBpc1N5c3RlbUluaXRpYXRlZFJlcXVlc3QgfHwgIShjaGVja3BvaW50RW5hYmxlZCkpO1xuXG5cdFx0Ly8gRm9yY2UgdG9vbGJhcnMgdG8gc3luY2hyb25vdXNseSByZS1ldmFsdWF0ZSBhZnRlciBjb250ZXh0IGtleSBjaGFuZ2VzXG5cdFx0Ly8gdG8gYXZvaWQgc2l6ZSBtZWFzdXJlbWVudCBpc3N1ZXMgZnJvbSB0aGUgZGVib3VuY2VkIG1lbnUgdXBkYXRlLlxuXHRcdHRlbXBsYXRlRGF0YS5mb290ZXJUb29sYmFyLnJlZnJlc2goKTtcblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludFRvb2xiYXIucmVmcmVzaCgpO1xuXHRcdHRlbXBsYXRlRGF0YS5jaGVja3BvaW50UmVzdG9yZVRvb2xiYXIucmVmcmVzaCgpO1xuXG5cdFx0Ly8gVHJhY2sgcmVzcG9uc2UgdGVtcGxhdGUgZGF0YSBieSByZXF1ZXN0IElEIGZvciBjcm9zcy1yb3cgaG92ZXIgZWZmZWN0c1xuXHRcdGlmIChpc1Jlc3BvbnNlVk0oZWxlbWVudCkpIHtcblx0XHRcdHRoaXMucmVzcG9uc2VUZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5zZXQoZWxlbWVudC5yZXF1ZXN0SWQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5yZXNwb25zZVRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmRlbGV0ZShlbGVtZW50LnJlcXVlc3RJZCkpKTtcblx0XHR9XG5cblx0XHQvLyB1bmlmaWVkIGhvdmVyaW5nXG5cdFx0aWYgKCFpc1BlbmRpbmdSZXF1ZXN0KSB7XG5cdFx0XHRjb25zdCBzZXRHcm91cEhvdmVyID0gKGhvdmVyZWQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdElkID0gaXNSZXF1ZXN0Vk0oZWxlbWVudCkgPyBlbGVtZW50LmlkIDogaXNSZXNwb25zZVZNKGVsZW1lbnQpID8gZWxlbWVudC5yZXF1ZXN0SWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghcmVxdWVzdElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlcURhdGEgPSB0aGlzLnRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmdldChyZXF1ZXN0SWQpO1xuXHRcdFx0XHRjb25zdCByZXNEYXRhID0gdGhpcy5yZXNwb25zZVRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmdldChyZXF1ZXN0SWQpO1xuXHRcdFx0XHRyZXFEYXRhPy5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZ3JvdXAtaG92ZXJlZCcsIGhvdmVyZWQpO1xuXHRcdFx0XHRyZXFEYXRhPy5jaGVja3BvaW50Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2dyb3VwLWhvdmVyZWQnLCBob3ZlcmVkKTtcblx0XHRcdFx0cmVzRGF0YT8ucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2dyb3VwLWhvdmVyZWQnLCBob3ZlcmVkKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBob3ZlclRhcmdldHMgPSBpc1Jlc3BvbnNlVk0oZWxlbWVudClcblx0XHRcdFx0PyBbdGVtcGxhdGVEYXRhLnZhbHVlLCB0ZW1wbGF0ZURhdGEuZm9vdGVyVG9vbGJhckNvbnRhaW5lcl1cblx0XHRcdFx0OiBbdGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lcl07XG5cdFx0XHRjb25zdCBpc0hvdmVyVGFyZ2V0ID0gKHRhcmdldDogRXZlbnRUYXJnZXQgfCBudWxsKSA9PiBkb20uaXNIVE1MRWxlbWVudCh0YXJnZXQpICYmIGhvdmVyVGFyZ2V0cy5zb21lKGhvdmVyVGFyZ2V0ID0+IGhvdmVyVGFyZ2V0LmNvbnRhaW5zKHRhcmdldCkpO1xuXHRcdFx0Zm9yIChjb25zdCBob3ZlclRhcmdldCBvZiBob3ZlclRhcmdldHMpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihob3ZlclRhcmdldCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4gc2V0R3JvdXBIb3Zlcih0cnVlKSkpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhvdmVyVGFyZ2V0LCBkb20uRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCBlID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzSG92ZXJUYXJnZXQoZS5yZWxhdGVkVGFyZ2V0KSkge1xuXHRcdFx0XHRcdFx0c2V0R3JvdXBIb3ZlcihmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc2V0R3JvdXBIb3ZlcihmYWxzZSkpKTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHNob3cgcmVzdG9yZSBjb250YWluZXIgd2hlbiB3ZSBoYXZlIGEgY2hlY2twb2ludCBhbmQgbm90IGVkaXRpbmcsIGFuZCBub3QgYSBwZW5kaW5nIHJlcXVlc3Rcblx0XHRjb25zdCBzaG91bGRTaG93UmVzdG9yZSA9IHRoaXMudmlld01vZGVsPy5tb2RlbC5jaGVja3BvaW50ICYmICF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJiAoaW5kZXggPT09IHRoaXMuZGVsZWdhdGUuZ2V0TGlzdExlbmd0aCgpIC0gMSkgJiYgIWlzUGVuZGluZ1JlcXVlc3Q7XG5cdFx0dGVtcGxhdGVEYXRhLmNoZWNrcG9pbnRSZXN0b3JlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICEoc2hvdWxkU2hvd1Jlc3RvcmUgJiYgY2hlY2twb2ludEVuYWJsZWQpKTtcblxuXHRcdGNvbnN0IGVkaXRpbmcgPSBlbGVtZW50LmlkID09PSB0aGlzLnZpZXdNb2RlbD8uZWRpdGluZz8uaWQ7XG5cdFx0Y29uc3QgaXNJbnB1dCA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdjaGF0LmVkaXRSZXF1ZXN0cycpID09PSAnaW5wdXQnO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZEJlQmxvY2tlZCA9IGVsZW1lbnQuc2hvdWxkQmVCbG9ja2VkLnJlYWQocik7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGlzYWJsZWRPdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgc2hvdWxkQmVCbG9ja2VkICYmICFlZGl0aW5nICYmIHRoaXMudmlld01vZGVsPy5lZGl0aW5nICE9PSB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VkaXRpbmcnLCBlZGl0aW5nICYmICFpc0lucHV0KTtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VkaXRpbmctaW5wdXQnLCBlZGl0aW5nICYmIGlzSW5wdXQpO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXF1ZXN0SG92ZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZWRpdGluZycsIGVkaXRpbmcgJiYgaXNJbnB1dCk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlcXVlc3RIb3Zlci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAoISF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJiAhZWRpdGluZykgfHwgaXNSZXNwb25zZVZNKGVsZW1lbnQpIHx8ICF0aGlzLnJlbmRlcmVyT3B0aW9ucy5lZGl0YWJsZSB8fCBpc1N5c3RlbUluaXRpYXRlZFJlcXVlc3QpO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXF1ZXN0SG92ZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSA9PT0gJ2hvdmVyJyk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlcXVlc3RIb3Zlci5jbGFzc0xpc3QudG9nZ2xlKCdjaGVja3BvaW50cy1lbmFibGVkJywgY2hlY2twb2ludEVuYWJsZWQpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudDtcblx0XHRcdGlmIChjdXJyZW50ICYmIHRoaXMudmlld01vZGVsPy5lZGl0aW5nICYmIGN1cnJlbnQuaWQgIT09IHRoaXMudmlld01vZGVsLmVkaXRpbmcuaWQpIHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEZvY3VzT3V0c2lkZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT3ZlcmxheSBjbGljayBsaXN0ZW5lciByZW1vdmVkOiBvdmVybGF5IGlzIG5vbi1pbnRlcmFjdGl2ZSBpbiBjYW5jZWwtb24tYW55LXJvdyBtb2RlLlxuXG5cdFx0Ly8gaGFjayBAam9hb21vcmVub1xuXHRcdGNvbnN0IHJvd1Jvb3QgPSB0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQ7XG5cdFx0cm93Um9vdD8uY2xhc3NMaXN0LnRvZ2dsZSgncmVxdWVzdCcsIGlzUmVxdWVzdFZNKGVsZW1lbnQpKTtcblx0XHRyb3dSb290Py5jbGFzc0xpc3QudG9nZ2xlKCdyZXNwb25zZScsIGlzUmVzcG9uc2VWTShlbGVtZW50KSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKG1vc3RSZWNlbnRSZXNwb25zZUNsYXNzTmFtZSwgaW5kZXggPT09IHRoaXMuZGVsZWdhdGUuZ2V0TGlzdExlbmd0aCgpIC0gMSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb25maXJtYXRpb24tbWVzc2FnZScsIGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmICEhZWxlbWVudC5jb25maXJtYXRpb24pO1xuXG5cdFx0Ly8gVGhlIHN0cmVhbWluZy9wcm9ncmVzc2l2ZS1yZW5kZXJpbmcgdGFyZ2V0IGlzIHRoZSBsYXN0IG5vbi1wZW5kaW5nIGl0ZW0sIHNvIHRoZSBhY3RpdmVcblx0XHQvLyByZXNwb25zZSBrZWVwcyByZW5kZXJpbmcgKGFuZCB0aGUgdmlldyBrZWVwcyBmb2xsb3dpbmcgaXQpIGV2ZW4gd2hlbiBxdWV1ZWQgb3Igc3RlZXJpbmdcblx0XHQvLyByb3dzIGFyZSBzaG93biBiZWxvdyBpdC5cblx0XHRjb25zdCBpc1N0aWNreVNjcm9sbFRhcmdldEl0ZW0gPSBnZXRTdGlja3lTY3JvbGxUYXJnZXRJdGVtKHRoaXMudmlld01vZGVsPy5nZXRJdGVtcygpID8/IFtdKSA9PT0gZWxlbWVudDtcblxuXHRcdC8vIFRPRE86IEBqdXN0c2NoZW4gZGVjaWRlIGlmIHdlIHdhbnQgdG8gaGlkZSB0aGUgaGVhZGVyIGZvciByZXF1ZXN0cyBvciBub3Rcblx0XHRjb25zdCBzaG91bGRTaG93SGVhZGVyID0gKGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiAhdGhpcy5yZW5kZXJlck9wdGlvbnMubm9IZWFkZXIpICYmICFpc1N5c3RlbUluaXRpYXRlZFJlcXVlc3Q7XG5cdFx0dGVtcGxhdGVEYXRhLmhlYWRlcj8uY2xhc3NMaXN0LnRvZ2dsZSgnaGVhZGVyLWRpc2FibGVkJywgIXNob3VsZFNob3dIZWFkZXIpO1xuXG5cdFx0aWYgKGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmIGVsZW1lbnQuY29uZmlybWF0aW9uKSB7XG5cdFx0XHR0aGlzLnJlbmRlckNvbmZpcm1hdGlvbkFjdGlvbihlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblxuXHRcdC8vIERvIGEgcHJvZ3Jlc3NpdmUgcmVuZGVyIGlmXG5cdFx0Ly8gLSBUaGlzIGlzIHRoZSBsYXN0IG5vbi1wZW5kaW5nIHJlc3BvbnNlIGluIHRoZSBsaXN0XG5cdFx0Ly8gLSBBbmQgaXQgaGFzIHNvbWUgY29udGVudFxuXHRcdC8vIC0gQW5kIHRoZSByZXNwb25zZSBpcyBub3QgY29tcGxldGVcblx0XHQvLyAgIC0gT3IsIHdlIHByZXZpb3VzbHkgc3RhcnRlZCBhIHByb2dyZXNzaXZlIHJlbmRlcmluZyBvZiB0aGlzIGVsZW1lbnQgKGlmIHRoZSBlbGVtZW50IGlzIGNvbXBsZXRlLCB3ZSB3aWxsIGZpbmlzaCBwcm9ncmVzc2l2ZSByZW5kZXJpbmcgd2l0aCBhIHZlcnkgZmFzdCByYXRlKVxuXHRcdGNvbnN0IGluY3JlbWVudGFsUmVuZGVyaW5nID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nKTtcblx0XHRpZiAoaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmIGlzU3RpY2t5U2Nyb2xsVGFyZ2V0SXRlbSAmJiAoIWVsZW1lbnQuaXNDb21wbGV0ZSB8fCBlbGVtZW50LnJlbmRlckRhdGEpKSB7XG5cdFx0XHR0aGlzLnRyYWNlTGF5b3V0KCdyZW5kZXJFbGVtZW50JywgYHN0YXJ0IHByb2dyZXNzaXZlIHJlbmRlciwgaW5kZXg9JHtpbmRleH1gKTtcblxuXHRcdFx0aWYgKGluY3JlbWVudGFsUmVuZGVyaW5nICYmICFlbGVtZW50LnJlbmRlckRhdGEpIHtcblx0XHRcdFx0Ly8gSW5jcmVtZW50YWwgcmVuZGVyaW5nOiBldmVudC1kcml2ZW4gZmxvdywgbm8gdGltZXIuXG5cdFx0XHRcdC8vIHJlbmRlckVsZW1lbnQgaXMgY2FsbGVkIGVhY2ggdGltZSB0aGUgbW9kZWwgY2hhbmdlcywgc29cblx0XHRcdFx0Ly8gdGhpcyBtZXRob2QgcnVucyBvbiBldmVyeSBjb250ZW50IHVwZGF0ZS5cblx0XHRcdFx0dGhpcy5sb2dJbmNyZW1lbnRhbFJlbmRlcmluZ1RlbGVtZXRyeSgpO1xuXHRcdFx0XHR0aGlzLmRvSW5jcmVtZW50YWxSZW5kZXIoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0aW1lciA9IHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBkb20uV2luZG93SW50ZXJ2YWxUaW1lcigpKTtcblx0XHRcdFx0Y29uc3QgcnVuUHJvZ3Jlc3NpdmVSZW5kZXIgPSAoaW5pdGlhbD86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuZG9OZXh0UHJvZ3Jlc3NpdmVSZW5kZXIoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSwgISFpbml0aWFsKSkge1xuXHRcdFx0XHRcdFx0XHR0aW1lci5jYW5jZWwoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdC8vIEtpbGwgdGhlIHRpbWVyIGlmIGFueXRoaW5nIHdlbnQgd3JvbmcsIGF2b2lkIGdldHRpbmcgc3R1Y2sgaW4gYSBuYXN0eSByZW5kZXJpbmcgbG9vcC5cblx0XHRcdFx0XHRcdHRpbWVyLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aW1lci5jYW5jZWxBbmRTZXQocnVuUHJvZ3Jlc3NpdmVSZW5kZXIsIDUwLCBkb20uZ2V0V2luZG93KHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIpKTtcblx0XHRcdFx0cnVuUHJvZ3Jlc3NpdmVSZW5kZXIodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpc1Jlc3BvbnNlVk0oZWxlbWVudCkpIHtcblx0XHRcdFx0Ly8gV2hlbiBpbmNyZW1lbnRhbCByZW5kZXJpbmcgd2FzIGFjdGl2ZSBkdXJpbmcgdGhpcyByZXNwb25zZSxcblx0XHRcdFx0Ly8gbm90aWZ5IGFueSBhY3RpdmUgbW9ycGhlciB0aGF0IHRoZSBzdHJlYW0gaXMgY29tcGxldGVcblx0XHRcdFx0Ly8gc28gaXQgc3dpdGNoZXMgdG8gYSBmYXN0IGRyYWluIHJhdGUgYmVmb3JlIHdlIHJlbmRlci5cblx0XHRcdFx0aWYgKGluY3JlbWVudGFsUmVuZGVyaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmF0ZSA9IHRoaXMuZ2V0UHJvZ3Jlc3NpdmVSZW5kZXJSYXRlKGVsZW1lbnQpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU1vcnBoZXJSYXRlKHRlbXBsYXRlRGF0YSwgcmF0ZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5yZW5kZXJDaGF0UmVzcG9uc2VCYXNpYyhlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNSZXF1ZXN0Vk0oZWxlbWVudCkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJDaGF0UmVxdWVzdChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHNNb3VudGVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUGVuZGluZ0RpdmlkZXIoZWxlbWVudDogSUNoYXRQZW5kaW5nRGl2aWRlclZpZXdNb2RlbCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3BlbmRpbmctaXRlbScpO1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncGVuZGluZy1kaXZpZGVyJyk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdpbnRlcmFjdGl2ZS1yZXF1ZXN0JywgJ2ludGVyYWN0aXZlLXJlc3BvbnNlJywgJ3BlbmRpbmctcmVxdWVzdCcpO1xuXG5cdFx0Ly8gSGlkZSBoZWFkZXIgZWxlbWVudHMgbm90IGFwcGxpY2FibGUgdG8gcGVuZGluZyBkaXZpZGVyXG5cdFx0dGVtcGxhdGVEYXRhLmF2YXRhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0ZW1wbGF0ZURhdGEudXNlcm5hbWUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlcXVlc3RIb3Zlci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludFJlc3RvcmVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmZvb3RlclRvb2xiYXIuZ2V0RWxlbWVudCgpLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdGlmICh0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR9XG5cblx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuZGV0YWlsKTtcblxuXHRcdGNvbnN0IGRpdmlkZXJDb250ZW50ID0gZG9tLiQoJy5wZW5kaW5nLWRpdmlkZXItY29udGVudCcpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChkaXZpZGVyQ29udGVudCwgZG9tLiQoJ3NwYW4ucGVuZGluZy1kaXZpZGVyLWxhYmVsJykpO1xuXG5cdFx0aWYgKGVsZW1lbnQuZGl2aWRlcktpbmQgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKSB7XG5cdFx0XHRpZiAoZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZCkge1xuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzeXN0ZW1Ob3RpZmljYXRpb25EaXZpZGVyJywgXCJTeXN0ZW0gTm90aWZpY2F0aW9uXCIpO1xuXHRcdFx0XHRsYWJlbC50aXRsZSA9IGxvY2FsaXplKCdzeXN0ZW1Ob3RpZmljYXRpb25EaXZpZGVyVG9vbHRpcCcsIFwiU3lzdGVtIG5vdGlmaWNhdGlvbiB3aWxsIGJlIHNlbnQgYWZ0ZXIgdGhlIG5leHQgdG9vbCBjYWxsIGhhcHBlbnNcIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzdGVlcmluZ0RpdmlkZXInLCBcIlN0ZWVyaW5nXCIpO1xuXHRcdFx0XHRsYWJlbC50aXRsZSA9IGxvY2FsaXplKCdzdGVlcmluZ0RpdmlkZXJUb29sdGlwJywgXCJTdGVlcmluZyBtZXNzYWdlIHdpbGwgYmUgc2VudCBhZnRlciB0aGUgbmV4dCB0b29sIGNhbGwgaGFwcGVuc1wiKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncXVldWVkRGl2aWRlcicsIFwiUXVldWVkXCIpO1xuXHRcdFx0bGFiZWwudGl0bGUgPSBsb2NhbGl6ZSgncXVldWVkRGl2aWRlclRvb2x0aXAnLCBcIlF1ZXVlZCBtZXNzYWdlcyB3aWxsIGJlIHNlbnQgYWZ0ZXIgdGhlIGN1cnJlbnQgcmVxdWVzdCBjb21wbGV0ZXNcIik7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmFwcGVuZENoaWxkKGRpdmlkZXJDb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGV0YWlsKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuZGV0YWlsKTtcblxuXHRcdGlmIChlbGVtZW50LmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCkge1xuXHRcdFx0Y29uc3QgbXNnID0gZWxlbWVudC5zbGFzaENvbW1hbmQgPyBsb2NhbGl6ZSgndXNlZEFnZW50U2xhc2hDb21tYW5kJywgXCJ1c2VkIHswfSBbWyhyZXJ1biB3aXRob3V0KV1dXCIsIGAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7ZWxlbWVudC5zbGFzaENvbW1hbmQubmFtZX1gKSA6IGxvY2FsaXplKCd1c2VkQWdlbnQnLCBcIltbKHJlcnVuIHdpdGhvdXQpXV1cIik7XG5cdFx0XHRkb20ucmVzZXQodGVtcGxhdGVEYXRhLmRldGFpbCwgcmVuZGVyRm9ybWF0dGVkVGV4dChtc2csIHtcblx0XHRcdFx0YWN0aW9uSGFuZGxlcjoge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzOiB0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLFxuXHRcdFx0XHRcdGNhbGxiYWNrOiAoY29udGVudCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDbGlja1JlcnVuV2l0aEFnZW50T3JDb21tYW5kRGV0ZWN0aW9uLmZpcmUoZWxlbWVudCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fVxuXHRcdFx0fSwgJCgnc3Bhbi5hZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQnKSkpO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLnJlbmRlcmVyT3B0aW9ucy5yZW5kZXJTdHlsZSAhPT0gJ21pbmltYWwnICYmICFlbGVtZW50LmlzQ29tcGxldGUgJiYgIWNoZWNrTW9kZU9wdGlvbih0aGlzLmRlbGVnYXRlLmN1cnJlbnRDaGF0TW9kZSgpLCB0aGlzLnJlbmRlcmVyT3B0aW9ucy5wcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2UpKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGV0YWlsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3dvcmtpbmcnLCBcIldvcmtpbmdcIik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb25maXJtYXRpb25BY3Rpb24oZWxlbWVudDogSUNoYXRSZXF1ZXN0Vmlld01vZGVsLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSkge1xuXHRcdGRvbS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLmRldGFpbCk7XG5cdFx0aWYgKGVsZW1lbnQuY29uZmlybWF0aW9uKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRlbXBsYXRlRGF0YS5kZXRhaWwsICQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLWNoZWNrJywgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSkpO1xuXHRcdFx0ZG9tLmFwcGVuZCh0ZW1wbGF0ZURhdGEuZGV0YWlsLCAkKCdzcGFuLmNvbmZpcm1hdGlvbi10ZXh0JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdENvbmZpcm1hdGlvbkFjdGlvbicsICdTZWxlY3RlZCBcInswfVwiJywgZWxlbWVudC5jb25maXJtYXRpb24pKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaGVhZGVyPy5jbGFzc0xpc3QucmVtb3ZlKCdoZWFkZXItZGlzYWJsZWQnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5oZWFkZXI/LmNsYXNzTGlzdC5hZGQoJ3BhcnRpYWxseS1kaXNhYmxlZCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQXZhdGFyKGVsZW1lbnQ6IENoYXRUcmVlSXRlbSwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoaXNQZW5kaW5nRGl2aWRlclZNKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBpY29uOiBVUkkgfCBUaGVtZUljb247XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0aWNvbiA9IHRoaXMuZ2V0QWdlbnRJY29uKGVsZW1lbnQuYWdlbnQ/Lm1ldGFkYXRhKTtcblx0XHR9IGVsc2UgaWYgKGlzUmVxdWVzdFZNKGVsZW1lbnQpKSB7XG5cdFx0XHRpY29uID0gZWxlbWVudC5hdmF0YXJJY29uID8/IENvZGljb24uYWNjb3VudDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWNvbiA9IENvZGljb24uYWNjb3VudDtcblx0XHR9XG5cdFx0aWYgKGljb24gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdGNvbnN0IGF2YXRhckljb24gPSBkb20uJDxIVE1MSW1hZ2VFbGVtZW50PignaW1nLmljb24nKTtcblx0XHRcdGF2YXRhckljb24uc3JjID0gRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkoaWNvbikudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYXZhdGFyQ29udGFpbmVyLnJlcGxhY2VDaGlsZHJlbihkb20uJCgnLmF2YXRhcicsIHVuZGVmaW5lZCwgYXZhdGFySWNvbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBhdmF0YXJJY29uID0gZG9tLiQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbikpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmF2YXRhckNvbnRhaW5lci5yZXBsYWNlQ2hpbGRyZW4oZG9tLiQoJy5hdmF0YXIuY29kaWNvbi1hdmF0YXInLCB1bmRlZmluZWQsIGF2YXRhckljb24pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFnZW50SWNvbihhZ2VudDogSUNoYXRBZ2VudE1ldGFkYXRhIHwgdW5kZWZpbmVkKTogVVJJIHwgVGhlbWVJY29uIHtcblx0XHRpZiAoYWdlbnQ/LnRoZW1lSWNvbikge1xuXHRcdFx0cmV0dXJuIGFnZW50LnRoZW1lSWNvbjtcblx0XHR9IGVsc2UgaWYgKGFnZW50Py5pY29uRGFyayAmJiBpc0RhcmsodGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gYWdlbnQuaWNvbkRhcms7XG5cdFx0fSBlbHNlIGlmIChhZ2VudD8uaWNvbikge1xuXHRcdFx0cmV0dXJuIGFnZW50Lmljb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBDb2RpY29uLmNoYXRTcGFya2xlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpIHtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcmVzcG9uc2UtbG9hZGluZycsIChpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgIWVsZW1lbnQuaXNDb21wbGV0ZSkpO1xuXG5cdFx0dGhpcy5maW5hbGl6ZUNvbXBsZXRlZFJlc3BvbnNlUGFydHMoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W10gPSBbXTtcblx0XHRjb25zdCBpc0ZpbHRlcmVkID0gISFlbGVtZW50LmVycm9yRGV0YWlscz8ucmVzcG9uc2VJc0ZpbHRlcmVkO1xuXHRcdGlmICghaXNGaWx0ZXJlZCkge1xuXHRcdFx0Ly8gQWx3YXlzIGFkZCB0aGUgcmVmZXJlbmNlcyB0byBhdm9pZCBzaGlmdGluZyB0aGUgY29udGVudCBwYXJ0cyB3aGVuIGEgcmVmZXJlbmNlIGlzIGFkZGVkLCBhbmQgaGF2aW5nIHRvIHJlLWRpZmYgYWxsIHRoZSBjb250ZW50LlxuXHRcdFx0Ly8gVGhlIHBhcnQgd2lsbCBoaWRlIGl0c2VsZiBpZiB0aGUgbGlzdCBpcyBlbXB0eS5cblx0XHRcdGNvbnRlbnQucHVzaCh7IGtpbmQ6ICdyZWZlcmVuY2VzJywgcmVmZXJlbmNlczogZWxlbWVudC5jb250ZW50UmVmZXJlbmNlcyB9KTtcblx0XHRcdGNvbnRlbnQucHVzaCguLi5hbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoZWxlbWVudC5yZXNwb25zZS52YWx1ZSkpO1xuXHRcdFx0aWYgKGVsZW1lbnQuY29kZUNpdGF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0Y29udGVudC5wdXNoKHsga2luZDogJ2NvZGVDaXRhdGlvbnMnLCBjaXRhdGlvbnM6IGVsZW1lbnQuY29kZUNpdGF0aW9ucyB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5tb2RlbC5yZXNwb25zZSA9PT0gZWxlbWVudC5tb2RlbC5lbnRpcmVSZXNwb25zZSAmJiAhZWxlbWVudC5pc0NhbmNlbGVkICYmIGVsZW1lbnQuZXJyb3JEZXRhaWxzPy5tZXNzYWdlICYmIGVsZW1lbnQuZXJyb3JEZXRhaWxzLm1lc3NhZ2UgIT09IGNhbmNlbGVkTmFtZSkge1xuXHRcdFx0Y29udGVudC5wdXNoKHsga2luZDogJ2Vycm9yRGV0YWlscycsIGVycm9yRGV0YWlsczogZWxlbWVudC5lcnJvckRldGFpbHMsIGlzTGFzdDogZ2V0U3RpY2t5U2Nyb2xsVGFyZ2V0SXRlbSh0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKSA/PyBbXSkgPT09IGVsZW1lbnQgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZUNoYW5nZXNTdW1tYXJ5UGFydCA9IHRoaXMuZ2V0Q2hhdEZpbGVDaGFuZ2VzU3VtbWFyeVBhcnQoZWxlbWVudCk7XG5cdFx0aWYgKGZpbGVDaGFuZ2VzU3VtbWFyeVBhcnQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChmaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0KTtcblx0XHR9XG5cblx0XHRjb25zdCB0dXJuUGlsbHNQYXJ0ID0gdGhpcy5nZXRDaGF0VHVyblBpbGxzUGFydChlbGVtZW50KTtcblx0XHRpZiAodHVyblBpbGxzUGFydCkge1xuXHRcdFx0Y29udGVudC5wdXNoKHR1cm5QaWxsc1BhcnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtpbmdQcm9ncmVzcyA9IHRoaXMuc2hvdWxkU2hvd1dvcmtpbmdQcm9ncmVzcyhlbGVtZW50LCBjb250ZW50LCBmYWxzZSwgdGVtcGxhdGVEYXRhKTtcblx0XHRpZiAod29ya2luZ1Byb2dyZXNzKSB7XG5cdFx0XHRjb250ZW50LnB1c2god29ya2luZ1Byb2dyZXNzKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaWZmID0gdGhpcy5kaWZmKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzID8/IFtdLCBjb250ZW50LCBlbGVtZW50KTtcblx0XHR0aGlzLnJlbmRlckNoYXRDb250ZW50RGlmZihkaWZmLCBjb250ZW50LCBlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHR0aGlzLmZpbmFsaXplQ29tcGxldGVkUmVzcG9uc2VQYXJ0cyhlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5hbGl6ZUNvbXBsZXRlZFJlc3BvbnNlUGFydHMoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoIWVsZW1lbnQuaXNDb21wbGV0ZSAmJiAhZWxlbWVudC5pc0NhbmNlbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RUaGlua2luZyA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydCh0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyk7XG5cdFx0aWYgKGxhc3RUaGlua2luZz8uZG9tTm9kZSAmJiBsYXN0VGhpbmtpbmcuZ2V0SXNBY3RpdmUoKSkge1xuXHRcdFx0bGFzdFRoaW5raW5nLmZpbmFsaXplVGl0bGVJZkRlZmF1bHQoKTtcblx0XHRcdGxhc3RUaGlua2luZy5tYXJrQXNJbmFjdGl2ZSgpO1xuXHRcdH1cblx0XHR0aGlzLmZpbmFsaXplQWxsU3ViYWdlbnRQYXJ0cyh0ZW1wbGF0ZURhdGEsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93V29ya2luZ1Byb2dyZXNzKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIHBhcnRzVG9SZW5kZXI6IElDaGF0UmVuZGVyZXJDb250ZW50W10sIG1vcmVDb250ZW50QXZhaWxhYmxlOiBib29sZWFuLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IElDaGF0V29ya2luZ1Byb2dyZXNzIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZWxlbWVudC5hZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQgfHwgdGhpcy5yZW5kZXJlck9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdtaW5pbWFsJyB8fCBlbGVtZW50LmlzQ29tcGxldGUgfHwgIWNoZWNrTW9kZU9wdGlvbih0aGlzLmRlbGVnYXRlLmN1cnJlbnRDaGF0TW9kZSgpLCB0aGlzLnJlbmRlcmVyT3B0aW9ucy5wcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIE5ldmVyIHNob3cgd29ya2luZyBwcm9ncmVzcyB3aGlsZSBhbiB1bnJlc29sdmVkIHBsYW4gcmV2aWV3IGlzIGluXG5cdFx0Ly8gdGhlIHJlc3BvbnNlLiBUaGUgcGxhbiByZXZpZXcgd2lkZ2V0IHN1cmZhY2VzIGl0cyBvd24gXCJQbGFuIHJldmlld1xuXHRcdC8vIHJlcXVpcmVkXCIgcHJvZ3Jlc3Mgcm93IGFuZCBpcyBibG9ja2luZyBvbiB1c2VyIGlucHV0LCBzbyBhIHNlY29uZFxuXHRcdC8vIHdvcmtpbmcgaW5kaWNhdG9yIGJlbG93IGl0IGlzIHJlZHVuZGFudC4gVGhpcyBtdXN0IHJ1biBiZWZvcmUgYW55XG5cdFx0Ly8gc2V0dGluZ3MvbW9kZS1kcml2ZW4gYnJhbmNoZXMgc28gaXQgYXBwbGllcyByZWdhcmRsZXNzIG9mXG5cdFx0Ly8gcGVyc2lzdGVudC1wcm9ncmVzcyAvIHNoaW1tZXIgLyBwcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2UuXG5cdFx0aWYgKHBhcnRzVG9SZW5kZXIuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3BsYW5SZXZpZXcnICYmICFwYXJ0LmlzVXNlZCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGVuZHNXaXRoU3ViYWdlbnRDb250ZW50KHBhcnRzVG9SZW5kZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgY29uZmlybWF0aW9uIHByb2dyZXNzIHdoaWxlIGEgbm9uLXN1YmFnZW50IGNvbmZpcm1hdGlvbiBjYXJvdXNlbCBpcyBhY3RpdmUgYWJvdmUgdGhlIGlucHV0LlxuXHRcdGlmIChpc1Jlc3BvbnNlVk0oZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHdpZGdldD8uaW5wdXRQYXJ0Lmhhc0FjdGl2ZVRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkge1xuXHRcdFx0XHRjb25zdCBub25TdWJhZ2VudENvbmZpcm1hdGlvbkNvdW50ID0gdGhpcy5nZXRQZW5kaW5nVG9vbENvbmZpcm1hdGlvbkNvdW50KHBhcnRzVG9SZW5kZXIsIGZhbHNlKTtcblx0XHRcdFx0aWYgKG5vblN1YmFnZW50Q29uZmlybWF0aW9uQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICd3b3JraW5nJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQodGhpcy5nZXRDb25maXJtYXRpb25QZW5kaW5nTGFiZWwobm9uU3ViYWdlbnRDb25maXJtYXRpb25Db3VudCkpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmdldFBlbmRpbmdUb29sQ29uZmlybWF0aW9uQ291bnQocGFydHNUb1JlbmRlciwgdHJ1ZSkgPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogJ3dvcmtpbmcnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQodGhpcy5nZXRDb25maXJtYXRpb25QZW5kaW5nTGFiZWwoMSkpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzV2FpdGluZ0Zvck1jcFNlcnZlcnMocGFydHNUb1JlbmRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ1BhcnRzID0gZ2V0V29ya2luZ1Byb2dyZXNzUmVsZXZhbnRQYXJ0cyhwYXJ0c1RvUmVuZGVyKTtcblx0XHRjb25zdCBsYXN0UGFydCA9IGZpbmRMYXN0TWVhbmluZ2Z1bFBhcnQod29ya2luZ1BhcnRzKTtcblx0XHRjb25zdCBlbmRzV2l0aENvbXBsZXRlZFF1ZXN0aW9uID0gZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbkludGVyYWN0aW9uKHdvcmtpbmdQYXJ0cyk7XG5cblx0XHQvLyBEb24ndCBzaG93IHdvcmtpbmcgaWYgYSBzdHJlYW1pbmcgdG9vbCBpbnZvY2F0aW9uIGlzIGFscmVhZHkgcHJlc2VudFxuXHRcdGlmICh3b3JraW5nUGFydHMuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzU3RyZWFtaW5nKHBhcnQpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBzaG93IHdvcmtpbmcgc3Bpbm5lciB3aGVuIHRoZXJlJ3MgYW4gaW4tcHJvZ3Jlc3MgTUNQIHRvb2wgLSBNQ1AgdG9vbHMgaGF2ZSB0aGVpciBvd24gcHJvZ3Jlc3MgaW5kaWNhdG9yXG5cdFx0aWYgKHdvcmtpbmdQYXJ0cy5zb21lKHBhcnQgPT4gcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUocGFydCkgJiYgaXNNY3BUb29sSW52b2NhdGlvbihwYXJ0KSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gbmV2ZXIgc2hvdyB3b3JraW5nIHByb2dyZXNzIHdoZW4gdGhlcmUgaXMgYW4gYWN0aXZlIHRoaW5raW5nIHBpZWNlXG5cdFx0Y29uc3QgbGFzdFRoaW5raW5nID0gdGhpcy5nZXRMYXN0VGhpbmtpbmdQYXJ0KHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHRpZiAobGFzdFRoaW5raW5nICYmICFlbmRzV2l0aENvbXBsZXRlZFF1ZXN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIE5ldmVyIHNob3cgd29ya2luZyB3aGVuIHRoZSBsYXN0IHBhcnQgaXMgYSB0b29sIGludm9jYXRpb24gdGhhdCBpcyBhdHRhY2hlZCB0byB0aGlua2luZyxcblx0XHQvLyBvciAqd2lsbCBiZSogYXR0YWNoZWQgdG8gdGhpbmtpbmcgZHVyaW5nIHRoZSB1cGNvbWluZyByZW5kZXIgcGFzc1xuXHRcdGlmIChsYXN0UGFydCAmJiAobGFzdFBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBsYXN0UGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykpIHtcblx0XHRcdGlmIChsYXN0UGFydC5pc0F0dGFjaGVkVG9UaGlua2luZykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0VmZmVjdGl2ZWx5SGlkZGVuVG9vbEludm9jYXRpb24gPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzRWZmZWN0aXZlbHlIaWRkZW4obGFzdFBhcnQpO1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkVG9vbHNNb2RlID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGU+KCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJyk7XG5cdFx0XHRpZiAoIWlzRWZmZWN0aXZlbHlIaWRkZW5Ub29sSW52b2NhdGlvbiAmJiBjb2xsYXBzZWRUb29sc01vZGUgIT09IENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuT2ZmICYmIHRoaXMuc2hvdWxkUGluUGFydChsYXN0UGFydCwgaXNSZXNwb25zZVZNKGVsZW1lbnQpID8gZWxlbWVudCA6IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBoYXNSZW5kZXJlZFRoaW5raW5nUGFydCA9ICh0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyA/PyBbXSkuc29tZShwYXJ0ID0+IHBhcnQgaW5zdGFuY2VvZiBDaGF0VGhpbmtpbmdDb250ZW50UGFydCk7XG5cdFx0Y29uc3QgaGFzRWRpdFBpbGxNYXJrZG93biA9IHdvcmtpbmdQYXJ0cy5zb21lKHBhcnQgPT4gcGFydC5raW5kID09PSAnbWFya2Rvd25Db250ZW50JyAmJiB0aGlzLmhhc0VkaXRDb2RlYmxvY2tVcmkocGFydCkpO1xuXHRcdGlmIChoYXNSZW5kZXJlZFRoaW5raW5nUGFydCAmJiBoYXNFZGl0UGlsbE1hcmtkb3duKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChcblx0XHRcdCFsYXN0UGFydCB8fFxuXHRcdFx0bGFzdFBhcnQua2luZCA9PT0gJ3JlZmVyZW5jZXMnIHx8XG5cdFx0XHQobGFzdFBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgJiYgIW1vcmVDb250ZW50QXZhaWxhYmxlICYmIHRoaXMuaGFzQmVlbkNhdWdodFVwTG9uZ0Vub3VnaChlbGVtZW50KSkgfHxcblx0XHRcdCgobGFzdFBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBsYXN0UGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgKElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShsYXN0UGFydCkgfHwgSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKGxhc3RQYXJ0KSkpIHx8XG5cdFx0XHQoKGxhc3RQYXJ0LmtpbmQgPT09ICd0ZXh0RWRpdEdyb3VwJyB8fCBsYXN0UGFydC5raW5kID09PSAnbm90ZWJvb2tFZGl0R3JvdXAnKSAmJiBsYXN0UGFydC5kb25lICYmICF3b3JraW5nUGFydHMuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHBhcnQpKSkgfHxcblx0XHRcdChsYXN0UGFydC5raW5kID09PSAnZXh0ZXJuYWxFZGl0JyAmJiAhd29ya2luZ1BhcnRzLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShwYXJ0KSkpIHx8XG5cdFx0XHQobGFzdFBhcnQua2luZCA9PT0gJ3Byb2dyZXNzVGFzaycgJiYgbGFzdFBhcnQuZGVmZXJyZWQuaXNTZXR0bGVkKSB8fFxuXHRcdFx0ZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbiB8fFxuXHRcdFx0bGFzdFBhcnQua2luZCA9PT0gJ21jcFNlcnZlcnNTdGFydGluZycgfHxcblx0XHRcdGxhc3RQYXJ0LmtpbmQgPT09ICdtY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkJyB8fFxuXHRcdFx0bGFzdFBhcnQua2luZCA9PT0gJ21jcFNlcnZlcnNTdGFydGluZ1Nsb3cnIHx8XG5cdFx0XHRsYXN0UGFydC5raW5kID09PSAnZGlzYWJsZWRDbGF1ZGVIb29rcycgfHxcblx0XHRcdGxhc3RQYXJ0LmtpbmQgPT09ICdob29rJ1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3dvcmtpbmcnIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGVuZGluZ1Rvb2xDb25maXJtYXRpb25Db3VudChwYXJ0czogUmVhZG9ubHlBcnJheTxJQ2hhdFJlbmRlcmVyQ29udGVudCB8IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQ+LCBpbmNsdWRlU3ViYWdlbnRDb25maXJtYXRpb25zOiBib29sZWFuKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gcGFydHMuZmlsdGVyKHBhcnQgPT4ge1xuXHRcdFx0aWYgKHBhcnQua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gcGFydC5zdGF0ZS5nZXQoKTtcblx0XHRcdHJldHVybiBzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uICYmXG5cdFx0XHRcdCEhc3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlICYmXG5cdFx0XHRcdHBhcnQucHJlc2VudGF0aW9uICE9PSAnaGlkZGVuJyAmJlxuXHRcdFx0XHRwYXJ0LnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJlxuXHRcdFx0XHQoaXNTdWJhZ2VudFRvb2xJbnZvY2F0aW9uKHBhcnQpID09PSBpbmNsdWRlU3ViYWdlbnRDb25maXJtYXRpb25zKTtcblx0XHR9KS5sZW5ndGg7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpcm1hdGlvblBlbmRpbmdMYWJlbChjb3VudDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gY291bnQgPT09IDEgP1xuXHRcdFx0bG9jYWxpemUoJ2NvbmZpcm1hdGlvblBlbmRpbmcnLCBcIjEgY29uZmlybWF0aW9uIHBlbmRpbmdcIikgOlxuXHRcdFx0bG9jYWxpemUoJ2NvbmZpcm1hdGlvbnNQZW5kaW5nJywgXCJ7MH0gY29uZmlybWF0aW9ucyBwZW5kaW5nXCIsIGNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlV29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnQodGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCByZW5kZXJlZFBhcnRzID0gdGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHM7XG5cdFx0aWYgKCFyZW5kZXJlZFBhcnRzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IHJlbmRlcmVkUGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IHBhcnQgPSByZW5kZXJlZFBhcnRzW2ldO1xuXHRcdFx0aWYgKHBhcnQgaW5zdGFuY2VvZiBDaGF0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnQpIHtcblx0XHRcdFx0cGFydC5kaXNwb3NlKCk7XG5cdFx0XHRcdHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCk7XG5cdFx0XHRcdHJlbmRlcmVkUGFydHMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHR0aGlzLmZpcmVJdGVtSGVpZ2h0Q2hhbmdlKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVdvcmtpbmdQcm9ncmVzc0ZvclBlbmRpbmdDb25maXJtYXRpb25zKHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Ly8gRGVmZXIgbXV0YXRpb24gb2YgYHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzYCAodmlhIGByZW1vdmVXb3JraW5nUHJvZ3Jlc3NDb250ZW50UGFydGApXG5cdFx0Ly8gdG8gYSBtaWNyb3Rhc2suIFRoaXMgbWV0aG9kIGlzIGludm9rZWQgZnJvbSB0b29sIGF1dG9ydW5zLCB3aGljaCBmaXJlIHN5bmNocm9ub3VzbHkgaW5zaWRlXG5cdFx0Ly8gYHJlbmRlckNoYXRDb250ZW50RGlmZmAgd2hpbGUgdGhlIGFycmF5IGlzIGJlaW5nIGl0ZXJhdGVkIFx1MjAxNCBzcGxpY2luZyBpdCBtaWQtcmVuZGVyIHdvdWxkXG5cdFx0Ly8gb3JwaGFuIHN1YnNlcXVlbnQgcGFydHMgYW5kIGxlYXZlIGRldGFjaGVkIERPTSBub2RlcyByZWZlcmVuY2VkIGZyb20gYHJlbmRlcmVkUGFydHNgLlxuXHRcdC8vIENhcHR1cmUgdGhlIG9yaWdpbmF0aW5nIGVsZW1lbnQgc28gd2UgYmFpbCBvdXQgaWYgdGhlIHRlbXBsYXRlIHdhcyByZWN5Y2xlZCBmb3IgYSBkaWZmZXJlbnQgb25lLlxuXHRcdGNvbnN0IG9yaWdpbmFsRWxlbWVudCA9IHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudDtcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRpZiAodGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50ICE9PSBvcmlnaW5hbEVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kb1VwZGF0ZVdvcmtpbmdQcm9ncmVzc0ZvclBlbmRpbmdDb25maXJtYXRpb25zKHRlbXBsYXRlRGF0YSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGRvVXBkYXRlV29ya2luZ1Byb2dyZXNzRm9yUGVuZGluZ0NvbmZpcm1hdGlvbnModGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gdGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50O1xuXHRcdGlmICghaXNSZXNwb25zZVZNKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ0NvbmZpcm1hdGlvbkNvdW50ID0gdGhpcy5nZXRQZW5kaW5nVG9vbENvbmZpcm1hdGlvbkNvdW50KGVsZW1lbnQucmVzcG9uc2UudmFsdWUsIGZhbHNlKTtcblx0XHRpZiAocGVuZGluZ0NvbmZpcm1hdGlvbkNvdW50ID09PSAwKSB7XG5cdFx0XHR0aGlzLnJlbW92ZVdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0KHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ1Byb2dyZXNzUGFydCA9IHRoaXMuZ2V0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnQodGVtcGxhdGVEYXRhKTtcblx0XHRpZiAod29ya2luZ1Byb2dyZXNzUGFydCkge1xuXHRcdFx0d29ya2luZ1Byb2dyZXNzUGFydC51cGRhdGVXb3JraW5nQ29udGVudChuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KHRoaXMuZ2V0Q29uZmlybWF0aW9uUGVuZGluZ0xhYmVsKHBlbmRpbmdDb25maXJtYXRpb25Db3VudCkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0KHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogQ2hhdFdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZW5kZXJlZFBhcnRzID0gdGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHM7XG5cdFx0aWYgKCFyZW5kZXJlZFBhcnRzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSByZW5kZXJlZFBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcmVuZGVyZWRQYXJ0c1tpXTtcblx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0KSB7XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVVwZGF0ZVdvcmtpbmdQcm9ncmVzc09uQ29uZmlybWF0aW9uRW5kKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy53b3JraW5nUHJvZ3Jlc3NDb25maXJtYXRpb25FbmRMaXN0ZW5lcnMuaGFzKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLndvcmtpbmdQcm9ncmVzc0NvbmZpcm1hdGlvbkVuZExpc3RlbmVycy5hZGQodG9vbEludm9jYXRpb24pO1xuXHRcdGxldCB3YXNXYWl0aW5nRm9yQ29uZmlybWF0aW9uID0gZmFsc2U7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGlzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiA9IGN1cnJlbnRTdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uO1xuXHRcdFx0aWYgKHdhc1dhaXRpbmdGb3JDb25maXJtYXRpb24gJiYgIWlzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0ZvclBlbmRpbmdDb25maXJtYXRpb25zKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdHRoaXMud29ya2luZ1Byb2dyZXNzQ29uZmlybWF0aW9uRW5kTGlzdGVuZXJzLmRlbGV0ZSh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0d2FzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiA9IGlzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbjtcblx0XHR9KTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy53b3JraW5nUHJvZ3Jlc3NDb25maXJtYXRpb25FbmRMaXN0ZW5lcnMuZGVsZXRlKHRvb2xJbnZvY2F0aW9uKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNCZWVuQ2F1Z2h0VXBMb25nRW5vdWdoKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBib29sZWFuIHtcblx0XHRjb25zdCBsYXN0UmVuZGVyVGltZSA9IGVsZW1lbnQucmVuZGVyRGF0YT8ubGFzdFJlbmRlclRpbWU7XG5cdFx0aWYgKHR5cGVvZiBsYXN0UmVuZGVyVGltZSAhPT0gJ251bWJlcicgfHwgbGFzdFJlbmRlclRpbWUgPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIChEYXRlLm5vdygpIC0gbGFzdFJlbmRlclRpbWUpID49IFdPUktJTkdfQ0FVR0hUX1VQX0RFQk9VTkNFX01TO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGxhc3QgcGFydCB0aGF0IHZpc3VhbGx5IGNvbnRyaWJ1dGVzIHRvIHRoZSByZXNwb25zZSwgc2tpcHBpbmdcblx0ICogZW1wdHkgbWFya2Rvd24gcGxhY2Vob2xkZXJzLlxuXHQgKi9cblx0LyoqXG5cdCAqIFRydWUgd2hpbGUgd2UgaGF2ZSBjYXVnaHQgdXAgdG8gc3RyZWFtZWQgbWFya2Rvd24gYnV0IGFyZSBzdGlsbCB3aXRoaW4gdGhlXG5cdCAqIHtAbGluayBXT1JLSU5HX0NBVUdIVF9VUF9ERUJPVU5DRV9NU30gd2luZG93IGJlZm9yZSB0aGUgd29ya2luZyBpbmRpY2F0b3Jcblx0ICogc2hvdWxkIGFwcGVhci4gVGhlIHByb2dyZXNzaXZlIHJlbmRlciBsb29wIGtlZXBzIHBvbGxpbmcgaW4gdGhpcyBzdGF0ZSBzb1xuXHQgKiB0aGUgaW5kaWNhdG9yIGNhbiBzdGlsbCBzdXJmYWNlIGFmdGVyIGEgZ2VudWluZSBwYXVzZSwgaW5zdGVhZCBvZiBiZWluZ1xuXHQgKiBkcm9wcGVkIHdoZW4gdGhlIGxvb3Agd291bGQgb3RoZXJ3aXNlIHN0b3AgKHRoZSBkZWJvdW5jZSBpdHNlbGYgYXZvaWRzXG5cdCAqIGZsaWNrZXIgZHVyaW5nIG5vcm1hbCB0b2tlbiBzdHJlYW1pbmcpLlxuXHQgKi9cblx0cHJpdmF0ZSBpc1dvcmtpbmdQcm9ncmVzc0RlYm91bmNlUGVuZGluZyhlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBwYXJ0c1RvUmVuZGVyOiByZWFkb25seSBJQ2hhdFJlbmRlcmVyQ29udGVudFtdKTogYm9vbGVhbiB7XG5cdFx0aWYgKGVsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBUaGUgaW5kaWNhdG9yIGlzIGFscmVhZHkgc2hvd2luZywgc28gdGhlcmUgaXMgbm90aGluZyBwZW5kaW5nLlxuXHRcdGlmIChwYXJ0c1RvUmVuZGVyLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICd3b3JraW5nJykpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gT25seSB0aGUgc3RyZWFtZWQtbWFya2Rvd24gXCJjYXVnaHQgdXBcIiBjYXNlIGlzIGdhdGVkIGJlaGluZCB0aGUgZGVib3VuY2UuXG5cdFx0cmV0dXJuIGZpbmRMYXN0TWVhbmluZ2Z1bFBhcnQoZ2V0V29ya2luZ1Byb2dyZXNzUmVsZXZhbnRQYXJ0cyhwYXJ0c1RvUmVuZGVyKSk/LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnICYmICF0aGlzLmhhc0JlZW5DYXVnaHRVcExvbmdFbm91Z2goZWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENoYXRGaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0KGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBJQ2hhdENoYW5nZXNTdW1tYXJ5UGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuc2hvdWxkU2hvd1BpbGxzU3VtbWFyeShlbGVtZW50KSB8fCAhdGhpcy5zaG91bGRTaG93RmlsZUNoYW5nZXNTdW1tYXJ5KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBBZ2VudCBob3N0IHNlc3Npb25zIGNvbXB1dGUgdGhlaXIgcGVyLXR1cm4gY2hhbmdlcyBzZXJ2ZXItc2lkZSBhbmRcblx0XHQvLyBzdXBwbHkgdGhlbSB2aWEgSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZTsgdGhlIHN1bW1hcnkgcGFydFxuXHRcdC8vIHJlc29sdmVzIHRoZW0gYXN5bmNocm9ub3VzbHkgYW5kIHNlbGYtaGlkZXMgd2hlbiB0aGUgdHVybiBwcm9kdWNlZCBub1xuXHRcdC8vIGVkaXRzLiBPdGhlciBzZXNzaW9ucyBzdXJmYWNlIGRpZmYgZGF0YSB0aHJvdWdoIHRoZSBjaGF0IGVkaXRpbmdcblx0XHQvLyBzZXNzaW9uLCB3aGljaCBvbmx5IGhhcyBkYXRhIHdoZW4gdGhlIHJlc3BvbnNlIGNhcnJpZXMgdGV4dC9ub3RlYm9va1xuXHRcdC8vIGVkaXQgZ3JvdXBzIFx1MjAxNCBzbyBza2lwIHRoZSBzdW1tYXJ5IGZvciB0aG9zZSB1bmxlc3Mgc3VjaCBhIGdyb3VwIGlzXG5cdFx0Ly8gcHJlc2VudC5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShlbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFpc0FnZW50SG9zdFRhcmdldChzZXNzaW9uVHlwZSkgJiZcblx0XHRcdCFlbGVtZW50Lm1vZGVsLmVudGlyZVJlc3BvbnNlLnZhbHVlLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICd0ZXh0RWRpdEdyb3VwJyB8fCBwYXJ0LmtpbmQgPT09ICdub3RlYm9va0VkaXRHcm91cCcpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGtpbmQ6ICdjaGFuZ2VzU3VtbWFyeScsIHJlcXVlc3RJZDogZWxlbWVudC5yZXF1ZXN0SWQsIHNlc3Npb25SZXNvdXJjZTogZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q2hhdFR1cm5QaWxsc1BhcnQoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IElDaGF0VHVyblBpbGxzUGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gVGhlIHR1cm4gc3RhdHVzIHBpbGxzIG1pcnJvciB0aGUgZmxvYXRpbmcgcGlsbHMgc2hvd24gYWJvdmUgdGhlIGlucHV0XG5cdFx0Ly8gd2hpbGUgdGhlIHR1cm4gc3RyZWFtcy4gVGhleSBhcmUgb3B0LWluIHBlciBwaWxsLCBvbmx5IGFwcGx5IHRvIGFnZW50XG5cdFx0Ly8gaG9zdCBzZXNzaW9ucyAod2hpY2ggc3VwcGx5IGF1dGhvcml0YXRpdmUgcGVyLXR1cm4gY2hhbmdlcyB2aWFcblx0XHQvLyBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlKSBhbmQsIGxpa2UgdGhlIHBpbGxzIGFib3ZlIHRoZSBpbnB1dCxcblx0XHQvLyBhcHBlYXIgb25jZSB0aGUgdHVybiBpcyBjb21wbGV0ZS5cblx0XHRpZiAoIXRoaXMuc2hvdWxkU2hvd1BpbGxzU3VtbWFyeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsga2luZDogJ3R1cm5QaWxscycsIHJlcXVlc3RJZDogZWxlbWVudC5yZXF1ZXN0SWQsIHNlc3Npb25SZXNvdXJjZTogZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UgfTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2hhdFJlcXVlc3QoZWxlbWVudDogSUNoYXRSZXF1ZXN0Vmlld01vZGVsLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSkge1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1yZXNwb25zZS1sb2FkaW5nJywgZmFsc2UpO1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgncGVuZGluZy1yZXF1ZXN0JywgISFlbGVtZW50LnBlbmRpbmdLaW5kKTtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3N5c3RlbS1pbml0aWF0ZWQtcmVxdWVzdCcsICEhZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZCk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd0ZXJtaW5hbC1jb21tYW5kLXJlcXVlc3QnLCAhZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZCAmJiBlbGVtZW50LmlzVGVybWluYWxDb21tYW5kKTtcblxuXHRcdC8vIFN5c3RlbS1pbml0aWF0ZWQgcmVxdWVzdHMgcmVuZGVyIGFzIGNvbXBhY3QgcHJvZ3Jlc3Mtc3R5bGUgbWVzc2FnZXNcblx0XHRpZiAoZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZCkge1xuXHRcdFx0dGhpcy5yZW5kZXJTeXN0ZW1Jbml0aWF0ZWRSZXF1ZXN0KGVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQucGVuZGluZ0tpbmQgJiYgdGhpcy5fcGVuZGluZ0RyYWdDb250cm9sbGVyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmRhdGFzZXQucGVuZGluZ1JlcXVlc3RJZCA9IGVsZW1lbnQuaWQ7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmRhdGFzZXQucGVuZGluZ0tpbmQgPSBlbGVtZW50LnBlbmRpbmdLaW5kO1xuXG5cdFx0XHRjb25zdCBzYW1lS2luZENvdW50ID0gKHRoaXMudmlld01vZGVsPy5tb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKSA/PyBbXSkuZmlsdGVyKHAgPT4gcC5raW5kID09PSBlbGVtZW50LnBlbmRpbmdLaW5kKS5sZW5ndGg7XG5cdFx0XHRpZiAoc2FtZUtpbmRDb3VudCA+IDEpIHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gZG9tLiQoJy5jaGF0LXBlbmRpbmctZHJhZy1oYW5kbGUnICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5ncmlwcGVyKSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIucHJlcGVuZChoYW5kbGUpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZHJhZ0hhbmRsZSA9IGhhbmRsZTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0RyYWdDb250cm9sbGVyLmF0dGFjaERyYWdIYW5kbGUoZWxlbWVudCwgaGFuZGxlLCB0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLCB0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5pZCA9PT0gdGhpcy52aWV3TW9kZWw/LmVkaXRpbmc/LmlkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcmVuZGVyLmZpcmUodGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJykgIT09ICdub25lJyAmJiB0aGlzLnJlbmRlcmVyT3B0aW9ucy5lZGl0YWJsZSkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdFx0Y29uc3QgZXYgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoZXYuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGV2LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZz8uaWQgIT09IGVsZW1lbnQuaWQpIHtcblx0XHRcdFx0XHRcdGV2LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRldi5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2tSZXF1ZXN0LmZpcmUodGVtcGxhdGVEYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRsZXQgY29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IGV4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZXMgPSBlbGVtZW50LnZhcmlhYmxlcy5maWx0ZXIoaXNFeHBsaWNpdEZpbGVPckltYWdlVmFyaWFibGVFbnRyeSk7XG5cdFx0Y29uc3QgZXhwbGljaXRJbWFnZVZhcmlhYmxlcyA9IGV4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZXMuZmlsdGVyKHZhcmlhYmxlID0+IHZhcmlhYmxlLmtpbmQgPT09ICdpbWFnZScpO1xuXHRcdGNvbnN0IGV4cGxpY2l0RmlsZU9yRGlyZWN0b3J5VmFyaWFibGVzID0gZWxlbWVudC52YXJpYWJsZXMuZmlsdGVyKHZhcmlhYmxlID0+IHZhcmlhYmxlLmtpbmQgPT09ICdmaWxlJyB8fCB2YXJpYWJsZS5raW5kID09PSAnZGlyZWN0b3J5JyB8fCBpc1Bhc3RlVmFyaWFibGVFbnRyeSh2YXJpYWJsZSkpO1xuXHRcdGNvbnN0IG90aGVyVmFyaWFibGVzID0gZWxlbWVudC52YXJpYWJsZXMuZmlsdGVyKHZhcmlhYmxlID0+ICFpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5KHZhcmlhYmxlKSAmJiAhaXNQYXN0ZVZhcmlhYmxlRW50cnkodmFyaWFibGUpKTtcblx0XHRpZiAoIWVsZW1lbnQuY29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGlzQ2hhdEZvbGxvd3VwKGVsZW1lbnQubWVzc2FnZSkgP1xuXHRcdFx0XHRlbGVtZW50Lm1lc3NhZ2UubWVzc2FnZSA6XG5cdFx0XHRcdHRoaXMubWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyLmNvbnZlcnRQYXJzZWRSZXF1ZXN0VG9NYXJrZG93bihlbGVtZW50LnNlc3Npb25SZXNvdXJjZSwgZWxlbWVudC5tZXNzYWdlKTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnRTdW1tYXJ5ID0gIWVsZW1lbnQubWVzc2FnZVRleHQudHJpbSgpICYmICFleHBsaWNpdEZpbGVPckltYWdlVmFyaWFibGVzLmxlbmd0aCA/IGdldEV4cGxpY2l0RmlsZU9ySW1hZ2VBdHRhY2htZW50U3VtbWFyeShlbGVtZW50LnZhcmlhYmxlcykgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0TWFya2Rvd24gPSBtYXJrZG93bi50cmltKCkgPyBtYXJrZG93biA6IGF0dGFjaG1lbnRTdW1tYXJ5O1xuXHRcdFx0aWYgKHJlcXVlc3RNYXJrZG93bikge1xuXHRcdFx0XHRjb250ZW50ID0gW3sgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHJlcXVlc3RNYXJrZG93biksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH1dO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5yZW5kZXJlck9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdtaW5pbWFsJyAmJiAhZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5jbGFzc0xpc3QuYWRkKCdpbmxpbmUtcHJvZ3Jlc3MnKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRlbXBsYXRlRGF0YS52YWx1ZS5jbGFzc0xpc3QucmVtb3ZlKCdpbmxpbmUtcHJvZ3Jlc3MnKSkpO1xuXHRcdFx0XHRjb250ZW50LnB1c2goeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJzxzcGFuPjwvc3Bhbj4nLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5jbGFzc0xpc3QucmVtb3ZlKCdpbmxpbmUtcHJvZ3Jlc3MnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0Y29uc3QgcGFydHM6IElDaGF0Q29udGVudFBhcnRbXSA9IFtdO1xuXHRcdGNvbnN0IGV4cGxpY2l0SW1hZ2VBdHRhY2htZW50c1BhcnQgPSBleHBsaWNpdEltYWdlVmFyaWFibGVzLmxlbmd0aCA/IHRoaXMucmVuZGVyQXR0YWNobWVudHMoZXhwbGljaXRJbWFnZVZhcmlhYmxlcywgZWxlbWVudC5jb250ZW50UmVmZXJlbmNlcywgZWxlbWVudC5tb2RlbElkLCB0ZW1wbGF0ZURhdGEsIGVsZW1lbnQucmVzb2x2ZWRNb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoZXhwbGljaXRJbWFnZUF0dGFjaG1lbnRzUGFydD8uZG9tTm9kZSkge1xuXHRcdFx0ZXhwbGljaXRJbWFnZUF0dGFjaG1lbnRzUGFydC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcmVxdWVzdC1hdHRhY2htZW50LWNhcmRzJywgJ2NoYXQtcmVxdWVzdC1pbWFnZS1hdHRhY2htZW50cycpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmFwcGVuZENoaWxkKGV4cGxpY2l0SW1hZ2VBdHRhY2htZW50c1BhcnQuZG9tTm9kZSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChleHBsaWNpdEltYWdlQXR0YWNobWVudHNQYXJ0KTtcblx0XHR9XG5cdFx0Y29uc3QgZXhwbGljaXRGaWxlQXR0YWNobWVudHNQYXJ0ID0gZXhwbGljaXRGaWxlT3JEaXJlY3RvcnlWYXJpYWJsZXMubGVuZ3RoID8gdGhpcy5yZW5kZXJBdHRhY2htZW50cyhleHBsaWNpdEZpbGVPckRpcmVjdG9yeVZhcmlhYmxlcywgZWxlbWVudC5jb250ZW50UmVmZXJlbmNlcywgZWxlbWVudC5tb2RlbElkLCB0ZW1wbGF0ZURhdGEpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChleHBsaWNpdEZpbGVBdHRhY2htZW50c1BhcnQ/LmRvbU5vZGUpIHtcblx0XHRcdGV4cGxpY2l0RmlsZUF0dGFjaG1lbnRzUGFydC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcmVxdWVzdC1hdHRhY2htZW50LWNhcmRzJywgJ2NoYXQtcmVxdWVzdC1maWxlLWF0dGFjaG1lbnRzJyk7XG5cdFx0XHRleHBsaWNpdEZpbGVBdHRhY2htZW50c1BhcnQuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdFx0ZXhwbGljaXRGaWxlQXR0YWNobWVudHNQYXJ0LmRvbU5vZGUuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdjb2x1bW4nO1xuXHRcdFx0ZXhwbGljaXRGaWxlQXR0YWNobWVudHNQYXJ0LmRvbU5vZGUuc3R5bGUuYWxpZ25JdGVtcyA9ICdmbGV4LWVuZCc7XG5cdFx0XHRleHBsaWNpdEZpbGVBdHRhY2htZW50c1BhcnQuZG9tTm9kZS5zdHlsZS5mbGV4V3JhcCA9ICdub3dyYXAnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmFwcGVuZENoaWxkKGV4cGxpY2l0RmlsZUF0dGFjaG1lbnRzUGFydC5kb21Ob2RlKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGV4cGxpY2l0RmlsZUF0dGFjaG1lbnRzUGFydCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSB0ZW1wbGF0ZURhdGEudmFsdWU7XG5cblx0XHRsZXQgaW5saW5lU2xhc2hDb21tYW5kUmVuZGVyZWQgPSBmYWxzZTtcblx0XHRsZXQgY29kZUJsb2NrU3RhcnRJbmRleCA9IDA7XG5cdFx0Y29udGVudC5mb3JFYWNoKChkYXRhLCBjb250ZW50SW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0ID0ge1xuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRlbGVtZW50SW5kZXg6IGluZGV4LFxuXHRcdFx0XHRjb250ZW50SW5kZXg6IGNvbnRlbnRJbmRleCxcblx0XHRcdFx0Y29udGVudDogY29udGVudCxcblx0XHRcdFx0Y29udGFpbmVyOiB0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLFxuXHRcdFx0XHRlZGl0b3JQb29sOiB0aGlzLl9lZGl0b3JQb29sLFxuXHRcdFx0XHRkaWZmRWRpdG9yUG9vbDogdGhpcy5fZGlmZkVkaXRvclBvb2wsXG5cdFx0XHRcdGN1cnJlbnRXaWR0aDogdGhpcy5fY3VycmVudExheW91dFdpZHRoLFxuXHRcdFx0XHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudCxcblx0XHRcdFx0aW5saW5lVGV4dE1vZGVsczogdGhpcy5faW5saW5lVGV4dE1vZGVscyxcblx0XHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdFx0dHJlZVN0YXJ0SW5kZXg6IDAsIC8vIG5vIHRyZWVzIGluIHJlcXVlc3RzXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbmV3UGFydCA9IHRoaXMucmVuZGVyQ2hhdENvbnRlbnRQYXJ0KGRhdGEsIHRlbXBsYXRlRGF0YSwgY29udGV4dCk7XG5cdFx0XHRpZiAobmV3UGFydCkge1xuXG5cdFx0XHRcdGlmICh0aGlzLnJlbmRlcmVyT3B0aW9ucy5yZW5kZXJEZXRlY3RlZENvbW1hbmRzV2l0aFJlcXVlc3Rcblx0XHRcdFx0XHQmJiAhaW5saW5lU2xhc2hDb21tYW5kUmVuZGVyZWRcblx0XHRcdFx0XHQmJiBlbGVtZW50LmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCAmJiBlbGVtZW50LnNsYXNoQ29tbWFuZFxuXHRcdFx0XHRcdCYmIGRhdGEua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgLy8gVE9ETyB0aGlzIGlzIGZpc2h5IGJ1dCBJIGRpZG4ndCBmaW5kIGEgYmV0dGVyIHdheSB0byByZW5kZXIgb24gdGhlIHNhbWUgaW5saW5lIGFzIHRoZSBNRCByZXF1ZXN0IHBhcnRcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0aWYgKG5ld1BhcnQuZG9tTm9kZSkge1xuXHRcdFx0XHRcdFx0bmV3UGFydC5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjbWRQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRDb21tYW5kQ29udGVudFBhcnQsIGVsZW1lbnQuc2xhc2hDb21tYW5kLCAoKSA9PiB0aGlzLl9vbkRpZENsaWNrUmVydW5XaXRoQWdlbnRPckNvbW1hbmREZXRlY3Rpb24uZmlyZSh7IHNlc3Npb25SZXNvdXJjZTogZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZDogZWxlbWVudC5pZCB9KSk7XG5cdFx0XHRcdFx0Y29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjbWRQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdHBhcnRzLnB1c2goY21kUGFydCk7XG5cdFx0XHRcdFx0aW5saW5lU2xhc2hDb21tYW5kUmVuZGVyZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG5ld1BhcnQuZG9tTm9kZSAmJiAhbmV3UGFydC5kb21Ob2RlLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKG5ld1BhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFydHMucHVzaChuZXdQYXJ0KTtcblx0XHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleCArPSBuZXdQYXJ0LmNvZGVibG9ja3M/Lmxlbmd0aCA/PyAwO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKSB7XG5cdFx0XHRkaXNwb3NlKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMgPSBwYXJ0cztcblxuXHRcdGlmIChvdGhlclZhcmlhYmxlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5ld1BhcnQgPSB0aGlzLnJlbmRlckF0dGFjaG1lbnRzKG90aGVyVmFyaWFibGVzLCBlbGVtZW50LmNvbnRlbnRSZWZlcmVuY2VzLCBlbGVtZW50Lm1vZGVsSWQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRpZiAobmV3UGFydC5kb21Ob2RlKSB7XG5cdFx0XHRcdC8vIHAgaGFzIGEgOmxhc3QtY2hpbGQgcnVsZSBmb3IgbWFyZ2luXG5cdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5hcHBlbmRDaGlsZChuZXdQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0fVxuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3UGFydCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFlbGVtZW50LnBlbmRpbmdLaW5kICYmICFlbGVtZW50LmNvbmZpcm1hdGlvbiAmJiB0aGlzLnJlbmRlcmVyT3B0aW9ucy5yZW5kZXJTdHlsZSAhPT0gJ21pbmltYWwnICYmIHRlbXBsYXRlRGF0YS52YWx1ZS5jaGlsZEVsZW1lbnRDb3VudCA+IDApIHtcblx0XHRcdGNvbnN0IHRpbWVzdGFtcCA9IHJlbmRlckNoYXRSZXF1ZXN0VGltZXN0YW1wKHRlbXBsYXRlRGF0YS5yZXF1ZXN0VGltZXN0YW1wQ29udGFpbmVyLCBlbGVtZW50LnJlcXVlc3RUaW1lc3RhbXApO1xuXHRcdFx0aWYgKHRpbWVzdGFtcD8uaG92ZXJUZXh0KSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRpbWVzdGFtcC5lbGVtZW50LCB0aW1lc3RhbXAuaG92ZXJUZXh0KSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRpbWVzdGFtcCkge1xuXHRcdFx0XHRsZXQgcmVxdWVzdFRpbWluZ0JvdW5kczogRE9NUmVjdCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aW1lc3RhbXAuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9PVkVSLCBlID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSBkb20uaXNIVE1MRWxlbWVudChlLnRhcmdldCkgPyBlLnRhcmdldC5jbG9zZXN0KCcuY2hhdC1yZXF1ZXN0LXJlbGF0aXZlJykgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKCFkb20uaXNIVE1MRWxlbWVudCh0YXJnZXQpIHx8ICF0aW1lc3RhbXAuZWxlbWVudC5jb250YWlucyh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGJvdW5kcyA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0XHRyZXF1ZXN0VGltaW5nQm91bmRzID0gYm91bmRzO1xuXHRcdFx0XHRcdHRpbWVzdGFtcC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcmVxdWVzdC1mbGlwLXJlc2V0Jyk7XG5cdFx0XHRcdFx0dGltZXN0YW1wLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXF1ZXN0LWZsaXAtYWN0aXZlJyk7XG5cdFx0XHRcdFx0dGltZXN0YW1wLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1yZXF1ZXN0LWZsaXAtZG93bicsIGUuY2xpZW50WSA8IGJvdW5kcy50b3AgKyBib3VuZHMuaGVpZ2h0IC8gMik7XG5cdFx0XHRcdFx0dm9pZCB0aW1lc3RhbXAuZWxlbWVudC5vZmZzZXRXaWR0aDtcblx0XHRcdFx0XHR0aW1lc3RhbXAuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXJlcXVlc3QtZmxpcC1yZXNldCcpO1xuXHRcdFx0XHRcdHZvaWQgdGltZXN0YW1wLmVsZW1lbnQub2Zmc2V0V2lkdGg7XG5cdFx0XHRcdFx0dGltZXN0YW1wLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1yZXF1ZXN0LWZsaXAtYWN0aXZlJyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aW1lc3RhbXAuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9NT1ZFLCBlID0+IHtcblx0XHRcdFx0XHRpZiAocmVxdWVzdFRpbWluZ0JvdW5kcyAmJiAoZS5jbGllbnRYIDwgcmVxdWVzdFRpbWluZ0JvdW5kcy5sZWZ0IHx8IGUuY2xpZW50WCA+IHJlcXVlc3RUaW1pbmdCb3VuZHMucmlnaHQgfHwgZS5jbGllbnRZIDwgcmVxdWVzdFRpbWluZ0JvdW5kcy50b3AgfHwgZS5jbGllbnRZID4gcmVxdWVzdFRpbWluZ0JvdW5kcy5ib3R0b20pKSB7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0VGltaW5nQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0dGltZXN0YW1wLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXF1ZXN0LWZsaXAtYWN0aXZlJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGltZXN0YW1wLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdFx0XHRyZXF1ZXN0VGltaW5nQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRpbWVzdGFtcC5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtcmVxdWVzdC1mbGlwLWFjdGl2ZScpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGltZXN0YW1wLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuRk9DVVMsICgpID0+IHtcblx0XHRcdFx0XHR0aW1lc3RhbXAuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXJlcXVlc3QtZmxpcC1hY3RpdmUnLCAnY2hhdC1yZXF1ZXN0LWZsaXAtZG93bicpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTeXN0ZW1Jbml0aWF0ZWRSZXF1ZXN0KGVsZW1lbnQ6IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpIHtcblx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0aWYgKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKSB7XG5cdFx0XHRkaXNwb3NlKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMgPSBbXTtcblxuXHRcdGNvbnN0IGxhYmVsID0gZWxlbWVudC5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCA/PyBlbGVtZW50Lm1lc3NhZ2VUZXh0O1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFN5c3RlbU5vdGlmaWNhdGlvbkNvbnRlbnRQYXJ0LFxuXHRcdFx0eyBraW5kOiAnc3lzdGVtTm90aWZpY2F0aW9uJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGxhYmVsKSB9LFxuXHRcdFx0dGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsXG5cdFx0KTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChub3RpZmljYXRpb25QYXJ0KTtcblx0XHR0ZW1wbGF0ZURhdGEudmFsdWUuYXBwZW5kQ2hpbGQobm90aWZpY2F0aW9uUGFydC5kb21Ob2RlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTbW9vdGggc3RyZWFtaW5nIHJlbmRlciBwYXRoIFx1MjAxNCBldmVudC1kcml2ZW4sIHJBRi1iYXRjaGVkLlxuXHQgKlxuXHQgKiBEb2VzIGEgcmVuZGVyIHBhc3MgdGhhdCBmZWVkcyB0aGUgZnVsbCBjb250ZW50IHRocm91Z2hcblx0ICogYGdldE5leHRQcm9ncmVzc2l2ZVJlbmRlckNvbnRlbnRgIFx1MjE5MiBgZGlmZmAgXHUyMTkyIGByZW5kZXJDaGF0Q29udGVudERpZmZgLFxuXHQgKiB3aGVyZSB0aGUgbW9ycGhlciBpbnRlcmNlcHRzIG1hcmtkb3duIGFwcGVuZHMgYW5kIHNjaGVkdWxlc1xuXHQgKiByQUYtYmF0Y2hlZCByZS1yZW5kZXJzIHRocm91Z2ggdGhlIHN0YW5kYXJkIG1hcmtkb3duIHBpcGVsaW5lLlxuXHQgKlxuXHQgKiBDYWxsZWQgb24gZXZlcnkgYHJlbmRlckVsZW1lbnRgIGludm9jYXRpb24gKHdoaWNoIGZpcmVzIGVhY2ggdGltZVxuXHQgKiB0aGUgbW9kZWwgY2hhbmdlcykuIE9uIGNvbXBsZXRpb24vY2FuY2VsbGF0aW9uIHRoZSBtb3JwaGVyJ3Ncblx0ICogY29udGVudCBpcyBhbHJlYWR5IGNvcnJlY3RseSByZW5kZXJlZCwgc28gd2UgZG8gYSBmaW5hbCBkaWZmIHBhc3Ncblx0ICogKG5vdCBhIGRlc3RydWN0aXZlIHJlLXJlbmRlcikgdG8gZmluYWxpemUgbm9uLW1hcmtkb3duIHBhcnRzIGxpa2Vcblx0ICogdGhpbmtpbmcgaW5kaWNhdG9ycywgZXJyb3IgZGV0YWlscywgYW5kIGNvZGUgY2l0YXRpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBkb0luY3JlbWVudGFsUmVuZGVyKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgdXBkYXRlIHRoZSB3b3JkIGJ1ZmZlcidzIHJldmVhbCByYXRlLCBpbmNsdWRpbmcgb24gdGhlXG5cdFx0Ly8gY29tcGxldGlvbiBwYXNzIHNvIHRoZSBidWZmZXIgc3dpdGNoZXMgdG8gYSBmYXN0IGRyYWluIHJhdGUuXG5cdFx0Y29uc3QgcmF0ZSA9IHRoaXMuZ2V0UHJvZ3Jlc3NpdmVSZW5kZXJSYXRlKGVsZW1lbnQpO1xuXHRcdHRoaXMuX3VwZGF0ZU1vcnBoZXJSYXRlKHRlbXBsYXRlRGF0YSwgcmF0ZSwgZWxlbWVudC5pc0NvbXBsZXRlIHx8IGVsZW1lbnQuaXNDYW5jZWxlZCk7XG5cblx0XHRpZiAoZWxlbWVudC5pc0NhbmNlbGVkIHx8IGVsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0Ly8gVGhlIG1vcnBoZXIgaGFzIGFscmVhZHkgcmVuZGVyZWQgdGhlIG1hcmtkb3duIGNvbnRlbnRcblx0XHRcdC8vIGNvcnJlY3RseSB0aHJvdWdoIHRoZSBzdGFuZGFyZCBwaXBlbGluZS4gQ2xlYXIgcmVuZGVyRGF0YVxuXHRcdFx0Ly8gYW5kIGRvIGEgZmluYWwgZGlmZiBwYXNzIHRvIHBpY2sgdXAgbm9uLW1hcmtkb3duIHBhcnRzXG5cdFx0XHQvLyAoZXJyb3IgZGV0YWlscywgY29kZSBjaXRhdGlvbnMsIHRoaW5raW5nIGZpbmFsaXphdGlvbilcblx0XHRcdC8vIHdpdGhvdXQgdGVhcmluZyBkb3duIHdoYXQgdGhlIG1vcnBoZXIgYnVpbHQuXG5cdFx0XHRlbGVtZW50LnJlbmRlckRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcmVzcG9uc2UtbG9hZGluZycsIGZhbHNlKTtcblx0XHRcdHRoaXMucmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXJlc3BvbnNlLWxvYWRpbmcnLCB0cnVlKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRGb3JUaGlzVHVybiA9IHRoaXMuZ2V0TmV4dFByb2dyZXNzaXZlUmVuZGVyQ29udGVudChlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdGNvbnN0IHBhcnRzVG9SZW5kZXIgPSB0aGlzLmRpZmYodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMgPz8gW10sIGNvbnRlbnRGb3JUaGlzVHVybi5jb250ZW50LCBlbGVtZW50KTtcblx0XHRjb25zdCBjb250ZW50SXNBbHJlYWR5UmVuZGVyZWQgPSBwYXJ0c1RvUmVuZGVyLmV2ZXJ5KHBhcnQgPT4gcGFydCA9PT0gbnVsbCk7XG5cdFx0aWYgKCFjb250ZW50SXNBbHJlYWR5UmVuZGVyZWQpIHtcblx0XHRcdHRoaXMucmVuZGVyQ2hhdENvbnRlbnREaWZmKHBhcnRzVG9SZW5kZXIsIGNvbnRlbnRGb3JUaGlzVHVybi5jb250ZW50LCBlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHJvcGFnYXRlIHRoZSBzdHJlYW0ncyB3b3JkLXJhdGUgZXN0aW1hdGUgdG8gYW55IGFjdGl2ZSBtb3JwaGVyJ3Ncblx0ICogd29yZCBidWZmZXIgc28gaXQgcmV2ZWFscyBjb250ZW50IGF0IHRoZSBtb2RlbCdzIHNwZWVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlTW9ycGhlclJhdGUodGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIHJhdGU6IG51bWJlciwgaXNDb21wbGV0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlcmVkUGFydHMgPSB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cztcblx0XHRpZiAoIXJlbmRlcmVkUGFydHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlbmRlcmVkUGFydHMpIHtcblx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdE1hcmtkb3duQ29udGVudFBhcnQpIHtcblx0XHRcdFx0cGFydC51cGRhdGVTdHJlYW1SYXRlKHJhdGUsIGlzQ29tcGxldGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9nSW5jcmVtZW50YWxSZW5kZXJpbmdUZWxlbWV0cnkoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luY3JlbWVudGFsUmVuZGVyaW5nVGVsZW1ldHJ5TG9nZ2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2luY3JlbWVudGFsUmVuZGVyaW5nVGVsZW1ldHJ5TG9nZ2VkID0gdHJ1ZTtcblxuXHRcdHR5cGUgSW5jcmVtZW50YWxSZW5kZXJpbmdTZXR0aW5nc0V2ZW50ID0ge1xuXHRcdFx0YW5pbWF0aW9uU3R5bGU6IHN0cmluZztcblx0XHRcdGJ1ZmZlcmluZzogc3RyaW5nO1xuXHRcdH07XG5cdFx0dHlwZSBJbmNyZW1lbnRhbFJlbmRlcmluZ1NldHRpbmdzQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRhbmltYXRpb25TdHlsZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhbmltYXRpb24gc3R5bGUgc2VsZWN0ZWQgZm9yIGluY3JlbWVudGFsIHJlbmRlcmluZy4nIH07XG5cdFx0XHRidWZmZXJpbmc6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYnVmZmVyaW5nIG1vZGUgc2VsZWN0ZWQgZm9yIGluY3JlbWVudGFsIHJlbmRlcmluZy4nIH07XG5cdFx0XHRvd25lcjogJ3B3YW5nMzQ3Jztcblx0XHRcdGNvbW1lbnQ6ICdUcmFja3Mgd2hpY2ggaW5jcmVtZW50YWwgcmVuZGVyaW5nIHNldHRpbmdzIGFyZSBpbiB1c2UuJztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluY3JlbWVudGFsUmVuZGVyaW5nU2V0dGluZ3NFdmVudCwgSW5jcmVtZW50YWxSZW5kZXJpbmdTZXR0aW5nc0NsYXNzaWZpY2F0aW9uPignY2hhdEluY3JlbWVudGFsUmVuZGVyaW5nU2V0dGluZ3MnLCB7XG5cdFx0XHRhbmltYXRpb25TdHlsZTogdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmdTdHlsZSkgPz8gJ25vbmUnLFxuXHRcdFx0YnVmZmVyaW5nOiB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZ0J1ZmZlcmluZykgPz8gJ3dvcmQnLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqXHRAcmV0dXJucyB0cnVlIGlmIHByb2dyZXNzaXZlIHJlbmRlcmluZyBzaG91bGQgYmUgY29uc2lkZXJlZCBjb21wbGV0ZS0gdGhlIGVsZW1lbnQncyBkYXRhIGlzIGZ1bGx5IHJlbmRlcmVkIG9yIHRoZSB2aWV3IGlzIG5vdCB2aXNpYmxlXG5cdCAqL1xuXHRwcml2YXRlIGRvTmV4dFByb2dyZXNzaXZlUmVuZGVyKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBpc0luUmVuZGVyRWxlbWVudDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5pc0NhbmNlbGVkKSB7XG5cdFx0XHR0aGlzLnRyYWNlTGF5b3V0KCdkb05leHRQcm9ncmVzc2l2ZVJlbmRlcicsIGBjYW5jZWxlZCwgaW5kZXg9JHtpbmRleH1gKTtcblx0XHRcdGVsZW1lbnQucmVuZGVyRGF0YSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcmVzcG9uc2UtbG9hZGluZycsIHRydWUpO1xuXHRcdHRoaXMudHJhY2VMYXlvdXQoJ2RvTmV4dFByb2dyZXNzaXZlUmVuZGVyJywgYFNUQVJUIHByb2dyZXNzaXZlIHJlbmRlciwgaW5kZXg9JHtpbmRleH1gKTtcblx0XHRjb25zdCBjb250ZW50Rm9yVGhpc1R1cm4gPSB0aGlzLmdldE5leHRQcm9ncmVzc2l2ZVJlbmRlckNvbnRlbnQoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRjb25zdCBwYXJ0c1RvUmVuZGVyID0gdGhpcy5kaWZmKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzID8/IFtdLCBjb250ZW50Rm9yVGhpc1R1cm4uY29udGVudCwgZWxlbWVudCk7XG5cblx0XHRjb25zdCBjb250ZW50SXNBbHJlYWR5UmVuZGVyZWQgPSBwYXJ0c1RvUmVuZGVyLmV2ZXJ5KHBhcnQgPT4gcGFydCA9PT0gbnVsbCk7XG5cdFx0aWYgKGNvbnRlbnRJc0FscmVhZHlSZW5kZXJlZCkge1xuXHRcdFx0aWYgKGNvbnRlbnRGb3JUaGlzVHVybi5tb3JlQ29udGVudEF2YWlsYWJsZSkge1xuXHRcdFx0XHQvLyBUaGUgY29udGVudCB0aGF0IHdlIHdhbnQgdG8gcmVuZGVyIGluIHRoaXMgdHVybiBpcyBhbHJlYWR5IHJlbmRlcmVkLCBidXQgdGhlcmUgaXMgbW9yZSBjb250ZW50IHRvIHJlbmRlciBvbiB0aGUgbmV4dCB0aWNrXG5cdFx0XHRcdHRoaXMudHJhY2VMYXlvdXQoJ2RvTmV4dFByb2dyZXNzaXZlUmVuZGVyJywgJ25vdCByZW5kZXJpbmcgYW55IG5ldyBjb250ZW50IHRoaXMgdGljaywgYnV0IG1vcmUgYXZhaWxhYmxlJyk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdC8vIEFsbCBjb250ZW50IGlzIHJlbmRlcmVkLCBhbmQgcmVzcG9uc2UgaXMgZG9uZSwgc28gZG8gYSBub3JtYWwgcmVuZGVyXG5cdFx0XHRcdHRoaXMudHJhY2VMYXlvdXQoJ2RvTmV4dFByb2dyZXNzaXZlUmVuZGVyJywgYEVORCBwcm9ncmVzc2l2ZSByZW5kZXIsIGluZGV4PSR7aW5kZXh9IGFuZCBjbGVhcmluZyByZW5kZXJEYXRhLCByZXNwb25zZSBpcyBjb21wbGV0ZWApO1xuXHRcdFx0XHRlbGVtZW50LnJlbmRlckRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMucmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmlzV29ya2luZ1Byb2dyZXNzRGVib3VuY2VQZW5kaW5nKGVsZW1lbnQsIGNvbnRlbnRGb3JUaGlzVHVybi5jb250ZW50KSkge1xuXHRcdFx0XHQvLyBDYXVnaHQgdXAgdG8gdGhlIHN0cmVhbWVkIG1hcmtkb3duLCBidXQgc3RpbGwgd2l0aGluIHRoZSB3b3JraW5nXG5cdFx0XHRcdC8vIGluZGljYXRvciBkZWJvdW5jZSB3aW5kb3cuIEtlZXAgdGhlIHJlbmRlciBsb29wIGFsaXZlIHNvIHRoZVxuXHRcdFx0XHQvLyBpbmRpY2F0b3IgY2FuIGFwcGVhciBhZnRlciBhIGdlbnVpbmUgcGF1c2UgaW5zdGVhZCBvZiBiZWluZyBkcm9wcGVkXG5cdFx0XHRcdC8vIHdoZW4gdGhlIGxvb3Agd291bGQgb3RoZXJ3aXNlIHN0b3AgaGVyZS5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm90aGluZyBuZXcgdG8gcmVuZGVyLCBzdG9wIHJlbmRlcmluZyB1bnRpbCBuZXh0IG1vZGVsIHVwZGF0ZVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEbyBhbiBhY3R1YWwgcHJvZ3Jlc3NpdmUgcmVuZGVyXG5cdFx0dGhpcy50cmFjZUxheW91dCgnZG9OZXh0UHJvZ3Jlc3NpdmVSZW5kZXInLCBgZG9pbmcgcHJvZ3Jlc3NpdmUgcmVuZGVyLCAke3BhcnRzVG9SZW5kZXIubGVuZ3RofSBwYXJ0cyB0byByZW5kZXJgKTtcblx0XHR0aGlzLnJlbmRlckNoYXRDb250ZW50RGlmZihwYXJ0c1RvUmVuZGVyLCBjb250ZW50Rm9yVGhpc1R1cm4uY29udGVudCwgZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoYXRDb250ZW50RGlmZihwYXJ0c1RvUmVuZGVyOiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50IHwgbnVsbD4sIGNvbnRlbnRGb3JUaGlzVHVybjogUmVhZG9ubHlBcnJheTxJQ2hhdFJlbmRlcmVyQ29udGVudD4sIGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGVsZW1lbnRJbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlcmVkUGFydHMgPSB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyA/PyBbXTtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyA9IHJlbmRlcmVkUGFydHM7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkQ29udGVudCA9IGNvbnRlbnRGb3JUaGlzVHVybjtcblx0XHRsZXQgY29kZUJsb2NrU3RhcnRJbmRleCA9IDA7XG5cdFx0bGV0IHRyZWVTdGFydEluZGV4ID0gMDtcblx0XHRsZXQgZGlzcGxhY2VkV29ya2luZ1BhcnQ6IENoYXRXb3JraW5nUHJvZ3Jlc3NDb250ZW50UGFydCB8IHVuZGVmaW5lZDtcblx0XHRwYXJ0c1RvUmVuZGVyLmZvckVhY2goKHBhcnRUb1JlbmRlciwgY29udGVudEluZGV4KSA9PiB7XG5cdFx0XHQvLyBBY2N1bXVsYXRlIGNvdW50cyBmcm9tIHRoZSBwYXJ0IHRoYXQgZW5kZWQgdXAgYXQgdGhlIHByZXZpb3VzIGluZGV4XG5cdFx0XHRpZiAoY29udGVudEluZGV4ID4gMCkge1xuXHRcdFx0XHRjb25zdCBwcmV2UGFydCA9IHJlbmRlcmVkUGFydHNbY29udGVudEluZGV4IC0gMV07XG5cdFx0XHRcdGlmIChwcmV2UGFydCkge1xuXHRcdFx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXggKz0gcHJldlBhcnQuY29kZWJsb2Nrcz8ubGVuZ3RoID8/IDA7XG5cdFx0XHRcdFx0aWYgKHByZXZQYXJ0IGluc3RhbmNlb2YgQ2hhdFRyZWVDb250ZW50UGFydCkge1xuXHRcdFx0XHRcdFx0dHJlZVN0YXJ0SW5kZXgrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWxyZWFkeVJlbmRlcmVkUGFydCA9IHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzPy5bY29udGVudEluZGV4XTtcblxuXHRcdFx0aWYgKCFwYXJ0VG9SZW5kZXIpIHtcblx0XHRcdFx0Ly8gbnVsbD1ubyBjaGFuZ2Vcblx0XHRcdFx0aWYgKCF0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0c01vdW50ZWQpIHtcblx0XHRcdFx0XHRhbHJlYWR5UmVuZGVyZWRQYXJ0Py5vbkRpZFJlbW91bnQ/LigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBhcnRUb1JlbmRlci5raW5kID09PSAnd29ya2luZycgJiYgZGlzcGxhY2VkV29ya2luZ1BhcnQ/Lmhhc1NhbWVDb250ZW50KHBhcnRUb1JlbmRlciwgY29udGVudEZvclRoaXNUdXJuLnNsaWNlKGNvbnRlbnRJbmRleCArIDEpLCBlbGVtZW50KSkge1xuXHRcdFx0XHRyZW5kZXJlZFBhcnRzW2NvbnRlbnRJbmRleF0gPSBkaXNwbGFjZWRXb3JraW5nUGFydDtcblx0XHRcdFx0ZGlzcGxhY2VkV29ya2luZ1BhcnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8ga2VlcCBleGlzdGluZyB0aGlua2luZyBwYXJ0IGluc3RhbmNlIGR1cmluZyBzdHJlYW1pbmcgYW5kIHVwZGF0ZSBpdCBpbiBwbGFjZVxuXHRcdFx0Y29uc3QgcHJlc2VydmVXb3JraW5nUGFydCA9IGFscmVhZHlSZW5kZXJlZFBhcnQgaW5zdGFuY2VvZiBDaGF0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnRcblx0XHRcdFx0JiYgcGFydFRvUmVuZGVyLmtpbmQgIT09ICd3b3JraW5nJ1xuXHRcdFx0XHQmJiBjb250ZW50Rm9yVGhpc1R1cm4uc2xpY2UoY29udGVudEluZGV4ICsgMSkuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3dvcmtpbmcnKTtcblx0XHRcdGlmIChhbHJlYWR5UmVuZGVyZWRQYXJ0KSB7XG5cdFx0XHRcdGlmIChwYXJ0VG9SZW5kZXIua2luZCA9PT0gJ3RoaW5raW5nJyAmJiBhbHJlYWR5UmVuZGVyZWRQYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQpIHtcblx0XHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGFydFRvUmVuZGVyLnZhbHVlKSkge1xuXHRcdFx0XHRcdFx0YWxyZWFkeVJlbmRlcmVkUGFydC51cGRhdGVUaGlua2luZyhwYXJ0VG9SZW5kZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZW5kZXJlZFBhcnRzW2NvbnRlbnRJbmRleF0gPSBhbHJlYWR5UmVuZGVyZWRQYXJ0O1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmIChhbHJlYWR5UmVuZGVyZWRQYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQgJiYgdGhpcy5zaG91bGRQaW5QYXJ0KHBhcnRUb1JlbmRlciwgZWxlbWVudCkpIHtcblx0XHRcdFx0XHQvLyBrZWVwIGV4aXN0aW5nIHRoaW5raW5nIHBhcnQgaWYgd2UgYXJlIHBpbm5pbmcgaXQgKGNvbWJpbmluZyB0b29sIGNhbGxzIGludG8gaXQpXG5cdFx0XHRcdFx0cmVuZGVyZWRQYXJ0c1tjb250ZW50SW5kZXhdID0gYWxyZWFkeVJlbmRlcmVkUGFydDtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbmNyZW1lbnRhbCByZW5kZXJpbmc6IHRyeSBhbiBpbmNyZW1lbnRhbCBET00gbW9ycGggaW5zdGVhZCBvZlxuXHRcdFx0XHQvLyB0ZWFyaW5nIGRvd24gYW5kIHJlYnVpbGRpbmcgdGhlIGVudGlyZSBtYXJrZG93biBwYXJ0LlxuXHRcdFx0XHRpZiAocGFydFRvUmVuZGVyLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnXG5cdFx0XHRcdFx0JiYgYWxyZWFkeVJlbmRlcmVkUGFydCBpbnN0YW5jZW9mIENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0XG5cdFx0XHRcdFx0JiYgdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRpZiAoYWxyZWFkeVJlbmRlcmVkUGFydC50cnlJbmNyZW1lbnRhbFVwZGF0ZShwYXJ0VG9SZW5kZXIpKSB7XG5cdFx0XHRcdFx0XHRyZW5kZXJlZFBhcnRzW2NvbnRlbnRJbmRleF0gPSBhbHJlYWR5UmVuZGVyZWRQYXJ0O1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChwcmVzZXJ2ZVdvcmtpbmdQYXJ0KSB7XG5cdFx0XHRcdFx0ZGlzcGxhY2VkV29ya2luZ1BhcnQgPSBhbHJlYWR5UmVuZGVyZWRQYXJ0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFscmVhZHlSZW5kZXJlZFBhcnQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVwbGFjZSBvbGQgRE9NIGZyb20gdGhpbmtpbmcgd3JhcHBlciB0byBwcmV2ZW50IGFjY3VtdWxhdGlvblxuXHRcdFx0XHQvLyBvZiBkdXBsaWNhdGUgZW50cmllcyB3aGVuIHJlLXJlbmRlcmluZyBwaW5uZWQgcGFydHMuXG5cdFx0XHRcdGlmIChhbHJlYWR5UmVuZGVyZWRQYXJ0LmRvbU5vZGUpIHtcblx0XHRcdFx0XHRjb25zdCB0aGlua2luZ1Rvb2xXcmFwcGVyID0gZG9tLmZpbmRQYXJlbnRXaXRoQ2xhc3MoYWxyZWFkeVJlbmRlcmVkUGFydC5kb21Ob2RlLCAnY2hhdC10aGlua2luZy10b29sLXdyYXBwZXInKTtcblx0XHRcdFx0XHRpZiAodGhpbmtpbmdUb29sV3JhcHBlcikge1xuXHRcdFx0XHRcdFx0dGhpbmtpbmdUb29sV3JhcHBlci5yZXBsYWNlV2l0aChhbHJlYWR5UmVuZGVyZWRQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCA9IHtcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0ZWxlbWVudEluZGV4OiBlbGVtZW50SW5kZXgsXG5cdFx0XHRcdGNvbnRlbnQ6IGNvbnRlbnRGb3JUaGlzVHVybixcblx0XHRcdFx0Y29udGVudEluZGV4OiBjb250ZW50SW5kZXgsXG5cdFx0XHRcdGNvbnRhaW5lcjogdGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lcixcblx0XHRcdFx0ZWRpdG9yUG9vbDogdGhpcy5fZWRpdG9yUG9vbCxcblx0XHRcdFx0ZGlmZkVkaXRvclBvb2w6IHRoaXMuX2RpZmZFZGl0b3JQb29sLFxuXHRcdFx0XHRjdXJyZW50V2lkdGg6IHRoaXMuX2N1cnJlbnRMYXlvdXRXaWR0aCxcblx0XHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQsXG5cdFx0XHRcdGlubGluZVRleHRNb2RlbHM6IHRoaXMuX2lubGluZVRleHRNb2RlbHMsXG5cdFx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRcdHRyZWVTdGFydEluZGV4LFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gY29tYmluZSB0b29sIGludm9jYXRpb25zIGludG8gdGhpbmtpbmcgcGFydCBpZiBuZWVkZWQuIHJlbmRlciB0aGUgdG9vbCwgYnV0IGRvIG5vdCByZXBsYWNlIHRoZSB3b3JraW5nIHNwaW5uZXIgd2l0aCB0aGUgbmV3IHBhcnQncyBkb20gbm9kZSBzaW5jZSBpdCBpcyBhbHJlYWR5IGluc2lkZSB0aGUgdGhpbmtpbmcgcGFydC5cblx0XHRcdGNvbnN0IGxhc3RUaGlua2luZyA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydChyZW5kZXJlZFBhcnRzKTtcblx0XHRcdGlmIChsYXN0VGhpbmtpbmcgJiYgKHBhcnRUb1JlbmRlci5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnRUb1JlbmRlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyB8fCBwYXJ0VG9SZW5kZXIua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgfHwgcGFydFRvUmVuZGVyLmtpbmQgPT09ICd0ZXh0RWRpdEdyb3VwJyB8fCBwYXJ0VG9SZW5kZXIua2luZCA9PT0gJ2V4dGVybmFsRWRpdCcgfHwgcGFydFRvUmVuZGVyLmtpbmQgPT09ICdob29rJykgJiYgdGhpcy5zaG91bGRQaW5QYXJ0KHBhcnRUb1JlbmRlciwgZWxlbWVudCkpIHtcblx0XHRcdFx0aWYgKGFscmVhZHlSZW5kZXJlZFBhcnQgaW5zdGFuY2VvZiBDaGF0TWFya2Rvd25Db250ZW50UGFydCkge1xuXHRcdFx0XHRcdGxhc3RUaGlua2luZy5yZW1vdmVFZGl0UGlsbEJ5UGFydElkKGFscmVhZHlSZW5kZXJlZFBhcnQuY29kZWJsb2Nrc1BhcnRJZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuZXdQYXJ0ID0gdGhpcy5yZW5kZXJDaGF0Q29udGVudFBhcnQocGFydFRvUmVuZGVyLCB0ZW1wbGF0ZURhdGEsIGNvbnRleHQpO1xuXHRcdFx0XHRpZiAobmV3UGFydCkge1xuXHRcdFx0XHRcdHJlbmRlcmVkUGFydHNbY29udGVudEluZGV4XSA9IG5ld1BhcnQ7XG5cdFx0XHRcdFx0YWxyZWFkeVJlbmRlcmVkUGFydD8uZG9tTm9kZT8ucmVtb3ZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXdQYXJ0ID0gdGhpcy5yZW5kZXJDaGF0Q29udGVudFBhcnQocGFydFRvUmVuZGVyLCB0ZW1wbGF0ZURhdGEsIGNvbnRleHQpO1xuXHRcdFx0aWYgKG5ld1BhcnQpIHtcblx0XHRcdFx0cmVuZGVyZWRQYXJ0c1tjb250ZW50SW5kZXhdID0gbmV3UGFydDtcblx0XHRcdFx0Ly8gTWF5YmUgdGhlIHBhcnQgY2FuJ3QgYmUgcmVuZGVyZWQgaW4gdGhpcyBjb250ZXh0LCBidXQgdGhpcyBzaG91bGRuJ3QgcmVhbGx5IGhhcHBlblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChhbHJlYWR5UmVuZGVyZWRQYXJ0Py5kb21Ob2RlKSB7XG5cdFx0XHRcdFx0XHRpZiAobmV3UGFydC5kb21Ob2RlKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChwcmVzZXJ2ZVdvcmtpbmdQYXJ0KSB7XG5cdFx0XHRcdFx0XHRcdFx0YWxyZWFkeVJlbmRlcmVkUGFydC5kb21Ob2RlLmJlZm9yZShuZXdQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGFscmVhZHlSZW5kZXJlZFBhcnQuZG9tTm9kZS5yZXBsYWNlV2l0aChuZXdQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXByZXNlcnZlV29ya2luZ1BhcnQpIHtcblx0XHRcdFx0XHRcdFx0XHRhbHJlYWR5UmVuZGVyZWRQYXJ0LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKG5ld1BhcnQuZG9tTm9kZSAmJiAhbmV3UGFydC5kb21Ob2RlLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdC8vIE9ubHkgYXBwZW5kIGlmIG5vdCBhbHJlYWR5IGF0dGFjaGVkIHNvbWV3aGVyZSBlbHNlIChlLmcuIGluc2lkZSBhIHRoaW5raW5nIHdyYXBwZXIpXG5cdFx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEudmFsdWUuYXBwZW5kQ2hpbGQobmV3UGFydC5kb21Ob2RlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdDaGF0TGlzdEl0ZW1SZW5kZXJlciNyZW5kZXJDaGF0Q29udGVudERpZmY6IGVycm9yIHJlcGxhY2luZyBwYXJ0JywgZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YWxyZWFkeVJlbmRlcmVkUGFydD8uZG9tTm9kZT8ucmVtb3ZlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0ZGlzcGxhY2VkV29ya2luZ1BhcnQ/LmRpc3Bvc2UoKTtcblx0XHRkaXNwbGFjZWRXb3JraW5nUGFydD8uZG9tTm9kZT8ucmVtb3ZlKCk7XG5cblx0XHQvLyBEZWxldGUgcHJldmlvdXNseSByZW5kZXJlZCBwYXJ0cyB0aGF0IGFyZSByZW1vdmVkXG5cdFx0Zm9yIChsZXQgaSA9IHBhcnRzVG9SZW5kZXIubGVuZ3RoOyBpIDwgcmVuZGVyZWRQYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcGFydCA9IHJlbmRlcmVkUGFydHNbaV07XG5cdFx0XHRpZiAocGFydCkge1xuXHRcdFx0XHRwYXJ0LmRpc3Bvc2UoKTtcblx0XHRcdFx0cGFydC5kb21Ob2RlPy5yZW1vdmUoKTtcblx0XHRcdFx0ZGVsZXRlIHJlbmRlcmVkUGFydHNbaV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYW5pbWF0ZUNvbGxhcHNlID0gdGVtcGxhdGVEYXRhLndhc1Jlc3BvbnNlQ29tcGxldGUgPT09IGZhbHNlICYmIGVsZW1lbnQuaXNDb21wbGV0ZTtcblx0XHR0aGlzLnVwZGF0ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZShlbGVtZW50LCBjb250ZW50Rm9yVGhpc1R1cm4sIHRlbXBsYXRlRGF0YSwgYW5pbWF0ZUNvbGxhcHNlKTtcblx0XHR0ZW1wbGF0ZURhdGEud2FzUmVzcG9uc2VDb21wbGV0ZSA9IGVsZW1lbnQuaXNDb21wbGV0ZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGNvbnRlbnQ6IFJlYWRvbmx5QXJyYXk8SUNoYXRSZW5kZXJlckNvbnRlbnQ+LCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgYW5pbWF0ZUNvbGxhcHNlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFlbGVtZW50LmlzQ29tcGxldGUgfHwgIXRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5Db2xsYXBzZUNvbXBsZXRlZFJlc3BvbnNlcykpIHtcblx0XHRcdHRoaXMucmVtb3ZlQ29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlT3BlbiA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaW5hbFJlc3BvbnNlU3RhcnRJbmRleCA9IGdldEZpbmFsUmVzcG9uc2VTdGFydEluZGV4KGNvbnRlbnQpO1xuXHRcdGlmIChmaW5hbFJlc3BvbnNlU3RhcnRJbmRleCA9PT0gdW5kZWZpbmVkIHx8IGZpbmFsUmVzcG9uc2VTdGFydEluZGV4ID09PSAwIHx8ICFjb250ZW50LnNsaWNlKDAsIGZpbmFsUmVzcG9uc2VTdGFydEluZGV4KS5zb21lKHBhcnQgPT4gcGFydC5raW5kICE9PSAncmVmZXJlbmNlcycgfHwgcGFydC5yZWZlcmVuY2VzLmxlbmd0aCA+IDApKSB7XG5cdFx0XHR0aGlzLnJlbW92ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbGxhcHNlRW5kSW5kZXggPSBnZXRDb21wbGV0ZWRSZXNwb25zZUNvbGxhcHNlRW5kSW5kZXgoY29udGVudCwgZmluYWxSZXNwb25zZVN0YXJ0SW5kZXgpO1xuXHRcdGlmIChjb2xsYXBzZUVuZEluZGV4ID09PSAwKSB7XG5cdFx0XHR0aGlzLnJlbW92ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbGxhcHNlRW5kTm9kZSA9IHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzPy5bY29sbGFwc2VFbmRJbmRleF0/LmRvbU5vZGU7XG5cdFx0aWYgKCFjb2xsYXBzZUVuZE5vZGUpIHtcblx0XHRcdHRoaXMucmVtb3ZlQ29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGV4aXN0aW5nRGlzY2xvc3VyZSA9IHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmU7XG5cdFx0aWYgKGV4aXN0aW5nRGlzY2xvc3VyZT8uY29udGFpbnMoY29sbGFwc2VFbmROb2RlKSkge1xuXHRcdFx0dGhpcy5yZW1vdmVDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmUodGVtcGxhdGVEYXRhKTtcblx0XHRcdGV4aXN0aW5nRGlzY2xvc3VyZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgY29sbGFwc2VFbmRSb290ID0gY29sbGFwc2VFbmROb2RlO1xuXHRcdHdoaWxlIChjb2xsYXBzZUVuZFJvb3QucGFyZW50RWxlbWVudCAmJiBjb2xsYXBzZUVuZFJvb3QucGFyZW50RWxlbWVudCAhPT0gdGVtcGxhdGVEYXRhLnZhbHVlKSB7XG5cdFx0XHRjb2xsYXBzZUVuZFJvb3QgPSBjb2xsYXBzZUVuZFJvb3QucGFyZW50RWxlbWVudDtcblx0XHR9XG5cdFx0aWYgKGNvbGxhcHNlRW5kUm9vdC5wYXJlbnRFbGVtZW50ICE9PSB0ZW1wbGF0ZURhdGEudmFsdWUpIHtcblx0XHRcdHRoaXMucmVtb3ZlQ29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGV4aXN0aW5nRGlzY2xvc3VyZVxuXHRcdFx0JiYgdGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlQ29sbGFwc2VFbmRJbmRleCA9PT0gY29sbGFwc2VFbmRJbmRleFxuXHRcdFx0JiYgZXhpc3RpbmdEaXNjbG9zdXJlLm5leHRTaWJsaW5nID09PSBjb2xsYXBzZUVuZFJvb3Rcblx0XHRcdCYmIHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzPy5zbGljZSgwLCBjb2xsYXBzZUVuZEluZGV4KS5ldmVyeShwYXJ0ID0+ICFwYXJ0Py5kb21Ob2RlIHx8IGV4aXN0aW5nRGlzY2xvc3VyZS5jb250YWlucyhwYXJ0LmRvbU5vZGUpKVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVtb3ZlQ29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlKHRlbXBsYXRlRGF0YSk7XG5cdFx0Y29uc3QgdmFsdWVDaGlsZHJlbiA9IEFycmF5LmZyb20odGVtcGxhdGVEYXRhLnZhbHVlLmNoaWxkTm9kZXMpO1xuXHRcdGNvbnN0IG5vZGVzVG9Db2xsYXBzZSA9IHZhbHVlQ2hpbGRyZW4uc2xpY2UoMCwgdmFsdWVDaGlsZHJlbi5pbmRleE9mKGNvbGxhcHNlRW5kUm9vdCkpO1xuXHRcdGNvbnN0IHN0ZXBDb3VudCA9IGdldFZpc2libGVDb21wbGV0ZWRSZXNwb25zZUl0ZW1Db3VudChub2Rlc1RvQ29sbGFwc2UpO1xuXHRcdGlmIChzdGVwQ291bnQgPCAyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGV0YWlscyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RldGFpbHMnKTtcblx0XHRkZXRhaWxzLmNsYXNzTGlzdC5hZGQoJ2NvbXBsZXRlZC1yZXNwb25zZS1kaXNjbG9zdXJlJyk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGRldGFpbHMuYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3VtbWFyeScpKTtcblx0XHRzdW1tYXJ5LmNsYXNzTGlzdC5hZGQoJ2NvbXBsZXRlZC1yZXNwb25zZS1zdW1tYXJ5JywgJ2NoYXQtdXNlZC1jb250ZXh0LWxhYmVsJyk7XG5cdFx0Y29uc3QgYnV0dG9uID0gc3VtbWFyeS5hcHBlbmRDaGlsZCgkKCdzcGFuLm1vbmFjby1idXR0b24ubW9uYWNvLXRleHQtYnV0dG9uLm1vbmFjby1pY29uLWJ1dHRvbicpKTtcblx0XHRjb25zdCBsYWJlbCA9IGJ1dHRvbi5hcHBlbmRDaGlsZCgkKCdzcGFuLm1vbmFjby1idXR0b24tbWRsYWJlbCcpKTtcblx0XHRjb25zdCBjaGV2cm9uID0gYnV0dG9uLmFwcGVuZENoaWxkKCQoJ3NwYW4uY2hhdC1jb2xsYXBzaWJsZS1ob3Zlci1jaGV2cm9uJywgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSkpO1xuXHRcdGNoZXZyb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZXZyb25SaWdodCkpO1xuXHRcdGxhYmVsLnRleHRDb250ZW50ID0gZm9ybWF0Q29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlTGFiZWwoc3RlcENvdW50LCBlbGVtZW50Lm1vZGVsLmVsYXBzZWRNcyk7XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9tLmdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRjb25zdCBrZWVwT3BlbkZvckZvY3VzID0gbm9kZXNUb0NvbGxhcHNlLnNvbWUobm9kZSA9PiBub2RlLmNvbnRhaW5zKGFjdGl2ZUVsZW1lbnQpKTtcblx0XHRjb25zdCBzaG91bGRBbmltYXRlSW5pdGlhbENvbGxhcHNlID0gYW5pbWF0ZUNvbGxhcHNlXG5cdFx0XHQmJiAha2VlcE9wZW5Gb3JGb2N1c1xuXHRcdFx0JiYgIXRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKClcblx0XHRcdCYmIHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVPcGVuID09PSB1bmRlZmluZWQ7XG5cdFx0aWYgKGtlZXBPcGVuRm9yRm9jdXMpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVPcGVuID0gdHJ1ZTtcblx0XHR9XG5cdFx0ZGV0YWlscy5vcGVuID0gdGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZU9wZW4gPz8gc2hvdWxkQW5pbWF0ZUluaXRpYWxDb2xsYXBzZTtcblx0XHRjb25zdCB1cGRhdGVFeHBhbnNpb25TdGF0ZSA9ICgpID0+IHtcblx0XHRcdHN1bW1hcnkuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKGRldGFpbHMub3BlbikpO1xuXHRcdFx0Y2hldnJvbi5jbGFzc0xpc3QudG9nZ2xlKCdleHBhbmRlZCcsIGRldGFpbHMub3Blbik7XG5cdFx0fTtcblx0XHR1cGRhdGVFeHBhbnNpb25TdGF0ZSgpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmluc2VydEJlZm9yZShkZXRhaWxzLCBjb2xsYXBzZUVuZFJvb3QpO1xuXHRcdGRldGFpbHMuYXBwZW5kKC4uLm5vZGVzVG9Db2xsYXBzZSk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSA9IGRldGFpbHM7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlQ29sbGFwc2VFbmRJbmRleCA9IGNvbGxhcHNlRW5kSW5kZXg7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZURpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRldGFpbHMsICd0b2dnbGUnLCAoKSA9PiB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlT3BlbiA9IGRldGFpbHMub3Blbjtcblx0XHRcdHVwZGF0ZUV4cGFuc2lvblN0YXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHNob3VsZEFuaW1hdGVJbml0aWFsQ29sbGFwc2UpIHtcblx0XHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3coZGV0YWlscyk7XG5cdFx0XHRjb25zdCBhbmltYXRpb25GcmFtZSA9IHRhcmdldFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSA9PT0gZGV0YWlscyAmJiBkZXRhaWxzLm9wZW4pIHtcblx0XHRcdFx0XHRkZXRhaWxzLm9wZW4gPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0YXJnZXRXaW5kb3cuY2FuY2VsQW5pbWF0aW9uRnJhbWUoYW5pbWF0aW9uRnJhbWUpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmUodGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBkZXRhaWxzID0gdGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZTtcblx0XHRpZiAoIWRldGFpbHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR3aGlsZSAoZGV0YWlscy5jaGlsZE5vZGVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGRldGFpbHMuYmVmb3JlKGRldGFpbHMuY2hpbGROb2Rlc1sxXSk7XG5cdFx0fVxuXHRcdGRldGFpbHMucmVtb3ZlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSA9IHVuZGVmaW5lZDtcblx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYWxsIGNvbnRlbnQgcGFydHMgdGhhdCBzaG91bGQgYmUgcmVuZGVyZWQsIGFuZCB0cmltbWVkIG1hcmtkb3duIGNvbnRlbnQuIFdlIHdpbGwgZGlmZiB0aGlzIHdpdGggdGhlIGN1cnJlbnQgcmVuZGVyZWQgc2V0LlxuXHQgKi9cblx0cHJpdmF0ZSBnZXROZXh0UHJvZ3Jlc3NpdmVSZW5kZXJDb250ZW50KGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogeyBjb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdOyBtb3JlQ29udGVudEF2YWlsYWJsZTogYm9vbGVhbiB9IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5nZXREYXRhRm9yUHJvZ3Jlc3NpdmVSZW5kZXIoZWxlbWVudCk7XG5cblx0XHQvLyBXaGVuIGluY3JlbWVudGFsIHJlbmRlcmluZyBpcyBlbmFibGVkLCBza2lwIHdvcmQtY291bnRpbmcgZm9yIG1hcmtkb3duLlxuXHRcdC8vIFRoZSBtb3JwaGVyJ3Mgb3duIGJ1ZmZlciArIHJBRiBsb29wIGlzIHRoZSBzb2xlIHJhdGUgbGltaXRlci5cblx0XHRjb25zdCBpbmNyZW1lbnRhbFJlbmRlcmluZyA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZykgPT09IHRydWU7XG5cblx0XHRjb25zdCByZW5kZXJhYmxlUmVzcG9uc2UgPSBhbm5vdGF0ZVNwZWNpYWxNYXJrZG93bkNvbnRlbnQoZWxlbWVudC5yZXNwb25zZS52YWx1ZSk7XG5cblx0XHR0aGlzLnRyYWNlTGF5b3V0KCdnZXROZXh0UHJvZ3Jlc3NpdmVSZW5kZXJDb250ZW50JywgYFdhbnQgdG8gcmVuZGVyICR7ZGF0YS5udW1Xb3Jkc1RvUmVuZGVyfSBhdCAke2RhdGEucmF0ZX0gd29yZHMvcywgY291bnRpbmcuLi5gKTtcblx0XHRsZXQgbnVtTmVlZGVkV29yZHMgPSBkYXRhLm51bVdvcmRzVG9SZW5kZXI7XG5cdFx0Y29uc3QgcGFydHNUb1JlbmRlcjogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSA9IFtdO1xuXG5cdFx0Ly8gQWx3YXlzIGFkZCB0aGUgcmVmZXJlbmNlcyB0byBhdm9pZCBzaGlmdGluZyB0aGUgY29udGVudCBwYXJ0cyB3aGVuIGEgcmVmZXJlbmNlIGlzIGFkZGVkLCBhbmQgaGF2aW5nIHRvIHJlLWRpZmYgYWxsIHRoZSBjb250ZW50LlxuXHRcdC8vIFRoZSBwYXJ0IHdpbGwgaGlkZSBpdHNlbGYgaWYgdGhlIGxpc3QgaXMgZW1wdHkuXG5cdFx0cGFydHNUb1JlbmRlci5wdXNoKHsga2luZDogJ3JlZmVyZW5jZXMnLCByZWZlcmVuY2VzOiBlbGVtZW50LmNvbnRlbnRSZWZlcmVuY2VzIH0pO1xuXG5cdFx0bGV0IG1vcmVDb250ZW50QXZhaWxhYmxlID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZW5kZXJhYmxlUmVzcG9uc2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHBhcnQgPSByZW5kZXJhYmxlUmVzcG9uc2VbaV07XG5cdFx0XHRpZiAocGFydC5raW5kID09PSAnbWFya2Rvd25Db250ZW50JyAmJiAhaW5jcmVtZW50YWxSZW5kZXJpbmcpIHtcblx0XHRcdFx0Y29uc3Qgd29yZENvdW50UmVzdWx0ID0gZ2V0TldvcmRzKHBhcnQuY29udGVudC52YWx1ZSwgbnVtTmVlZGVkV29yZHMpO1xuXHRcdFx0XHR0aGlzLnRyYWNlTGF5b3V0KCdnZXROZXh0UHJvZ3Jlc3NpdmVSZW5kZXJDb250ZW50JywgYCAgQ2h1bmsgJHtpfTogV2FudCB0byByZW5kZXIgJHtudW1OZWVkZWRXb3Jkc30gd29yZHMgYW5kIGZvdW5kICR7d29yZENvdW50UmVzdWx0LnJldHVybmVkV29yZENvdW50fSB3b3Jkcy4gVG90YWwgd29yZHMgaW4gY2h1bms6ICR7d29yZENvdW50UmVzdWx0LnRvdGFsV29yZENvdW50fWApO1xuXHRcdFx0XHRudW1OZWVkZWRXb3JkcyAtPSB3b3JkQ291bnRSZXN1bHQucmV0dXJuZWRXb3JkQ291bnQ7XG5cblx0XHRcdFx0aWYgKHdvcmRDb3VudFJlc3VsdC5pc0Z1bGxTdHJpbmcpIHtcblx0XHRcdFx0XHRwYXJ0c1RvUmVuZGVyLnB1c2gocGFydCk7XG5cblx0XHRcdFx0XHQvLyBDb25zdW1lZCBmdWxsIG1hcmtkb3duIGNodW5rLSBuZWVkIHRvIGVuc3VyZSB0aGF0IGFsbCBmb2xsb3dpbmcgbm9uLW1hcmtkb3duIHBhcnRzIGFyZSByZW5kZXJlZFxuXHRcdFx0XHRcdGZvciAoY29uc3QgbmV4dFBhcnQgb2YgcmVuZGVyYWJsZVJlc3BvbnNlLnNsaWNlKGkgKyAxKSkge1xuXHRcdFx0XHRcdFx0aWYgKG5leHRQYXJ0LmtpbmQgIT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRcdFx0XHRcdGkrKztcblx0XHRcdFx0XHRcdFx0cGFydHNUb1JlbmRlci5wdXNoKG5leHRQYXJ0KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBPbmx5IHRha2luZyBwYXJ0IG9mIHRoaXMgbWFya2Rvd24gcGFydFxuXHRcdFx0XHRcdG1vcmVDb250ZW50QXZhaWxhYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHRwYXJ0c1RvUmVuZGVyLnB1c2goeyAuLi5wYXJ0LCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcod29yZENvdW50UmVzdWx0LnZhbHVlLCBwYXJ0LmNvbnRlbnQpIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG51bU5lZWRlZFdvcmRzIDw9IDApIHtcblx0XHRcdFx0XHQvLyBDb2xsZWN0ZWQgYWxsIHdvcmRzIGFuZCBmb2xsb3dpbmcgbm9uLW1hcmtkb3duIHBhcnRzIGlmIG5lZWRlZCwgZG9uZVxuXHRcdFx0XHRcdGlmIChyZW5kZXJhYmxlUmVzcG9uc2Uuc2xpY2UoaSArIDEpLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSkge1xuXHRcdFx0XHRcdFx0bW9yZUNvbnRlbnRBdmFpbGFibGUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGFydHNUb1JlbmRlci5wdXNoKHBhcnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RXb3JkQ291bnQgPSBlbGVtZW50LmNvbnRlbnRVcGRhdGVUaW1pbmdzPy5sYXN0V29yZENvdW50ID8/IDA7XG5cdFx0Y29uc3QgbmV3UmVuZGVyZWRXb3JkQ291bnQgPSBkYXRhLm51bVdvcmRzVG9SZW5kZXIgLSBudW1OZWVkZWRXb3Jkcztcblx0XHRjb25zdCBidWZmZXJXb3JkcyA9IGxhc3RXb3JkQ291bnQgLSBuZXdSZW5kZXJlZFdvcmRDb3VudDtcblx0XHR0aGlzLnRyYWNlTGF5b3V0KCdnZXROZXh0UHJvZ3Jlc3NpdmVSZW5kZXJDb250ZW50JywgYFdhbnQgdG8gcmVuZGVyICR7ZGF0YS5udW1Xb3Jkc1RvUmVuZGVyfSB3b3Jkcy4gUmVuZGVyaW5nICR7bmV3UmVuZGVyZWRXb3JkQ291bnR9IHdvcmRzLiBCdWZmZXI6ICR7YnVmZmVyV29yZHN9IHdvcmRzYCk7XG5cdFx0aWYgKG5ld1JlbmRlcmVkV29yZENvdW50ID4gMCAmJiBuZXdSZW5kZXJlZFdvcmRDb3VudCAhPT0gZWxlbWVudC5yZW5kZXJEYXRhPy5yZW5kZXJlZFdvcmRDb3VudCkge1xuXHRcdFx0Ly8gT25seSB1cGRhdGUgbGFzdFJlbmRlclRpbWUgd2hlbiB3ZSBhY3R1YWxseSByZW5kZXIgbmV3IGNvbnRlbnRcblx0XHRcdGVsZW1lbnQucmVuZGVyRGF0YSA9IHsgbGFzdFJlbmRlclRpbWU6IERhdGUubm93KCksIHJlbmRlcmVkV29yZENvdW50OiBuZXdSZW5kZXJlZFdvcmRDb3VudCwgcmVuZGVyZWRQYXJ0czogcGFydHNUb1JlbmRlciB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtpbmdQcm9ncmVzcyA9IHRoaXMuc2hvdWxkU2hvd1dvcmtpbmdQcm9ncmVzcyhlbGVtZW50LCBwYXJ0c1RvUmVuZGVyLCBtb3JlQ29udGVudEF2YWlsYWJsZSwgdGVtcGxhdGVEYXRhKTtcblx0XHRpZiAod29ya2luZ1Byb2dyZXNzKSB7XG5cdFx0XHRwYXJ0c1RvUmVuZGVyLnB1c2god29ya2luZ1Byb2dyZXNzKTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0ID0gdGhpcy5nZXRDaGF0RmlsZUNoYW5nZXNTdW1tYXJ5UGFydChlbGVtZW50KTtcblx0XHRpZiAoZmlsZUNoYW5nZXNTdW1tYXJ5UGFydCkge1xuXHRcdFx0cGFydHNUb1JlbmRlci5wdXNoKGZpbGVDaGFuZ2VzU3VtbWFyeVBhcnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHR1cm5QaWxsc1BhcnQgPSB0aGlzLmdldENoYXRUdXJuUGlsbHNQYXJ0KGVsZW1lbnQpO1xuXHRcdGlmICh0dXJuUGlsbHNQYXJ0KSB7XG5cdFx0XHRwYXJ0c1RvUmVuZGVyLnB1c2godHVyblBpbGxzUGFydCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgY29udGVudDogcGFydHNUb1JlbmRlciwgbW9yZUNvbnRlbnRBdmFpbGFibGUgfTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeShlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogYm9vbGVhbiB7XG5cdFx0Ly8gT25seSBzaG93IGZpbGUgY2hhbmdlcyBzdW1tYXJ5IGZvciBsb2NhbCBzZXNzaW9ucyAtIGJhY2tncm91bmQgc2Vzc2lvbnMgYWxyZWFkeSBoYXZlIHRoZWlyIG93biBmaWxlIGNoYW5nZXMgcGFydFxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKGVsZW1lbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBpc0xvY2FsU2Vzc2lvbiA9IHNlc3Npb25UeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZSB8fCBpc0FnZW50SG9zdFRhcmdldChzZXNzaW9uVHlwZSk7XG5cdFx0cmV0dXJuIHNob3VsZFNob3dGaWxlQ2hhbmdlc1N1bW1hcnlGb3JTZXR0aW5ncyhcblx0XHRcdGVsZW1lbnQuaXNDb21wbGV0ZSxcblx0XHRcdGlzTG9jYWxTZXNzaW9uLFxuXHRcdFx0dGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LmNoZWNrcG9pbnRzLnNob3dGaWxlQ2hhbmdlcycpLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFNob3dQaWxsc1N1bW1hcnkoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzaG91bGRTaG93UGlsbHNTdW1tYXJ5Rm9yU2V0dGluZ3MoXG5cdFx0XHRlbGVtZW50LmlzQ29tcGxldGUsXG5cdFx0XHRpc0FnZW50SG9zdFRhcmdldChnZXRDaGF0U2Vzc2lvblR5cGUoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpKSxcblx0XHRcdHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxDaGF0VHVyblN0YXR1c1BpbGxzU2V0dGluZyB8IHVuZGVmaW5lZD4oQ2hhdENvbmZpZ3VyYXRpb24uVHVyblN0YXR1c1BpbGxzKSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREYXRhRm9yUHJvZ3Jlc3NpdmVSZW5kZXIoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCkge1xuXHRcdGNvbnN0IGhhc01hcmtkb3duUGFydHMgPSBlbGVtZW50LnJlc3BvbnNlLnZhbHVlLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnICYmIHBhcnQuY29udGVudC52YWx1ZS50cmltKCkubGVuZ3RoID4gMCk7XG5cdFx0aWYgKHNob3VsZFJlbmRlckluaXRpYWxQcm9ncmVzc2l2ZUNvbnRlbnRJbW1lZGlhdGVseShlbGVtZW50LmlzQ29tcGxldGUsIGhhc01hcmtkb3duUGFydHMsIGVsZW1lbnQucmVuZGVyRGF0YSAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0LyoqXG5cdFx0XHQgKiBOb25lIG9mIHRoZSBtYXJrZG93biBpbiB0aGUgb25nb2luZyByZXNwb25zZSBoYXMgYmVlbiByZW5kZXJlZCB5ZXQsXG5cdFx0XHQgKiBzbyB3ZSBzaG91bGQgcmVuZGVyIGFsbCBleGlzdGluZyBwYXJ0cyB3aXRob3V0IGFuaW1hdGlvbi5cblx0XHRcdCAqL1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bnVtV29yZHNUb1JlbmRlcjogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsXG5cdFx0XHRcdHJhdGU6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlckRhdGEgPSBlbGVtZW50LnJlbmRlckRhdGEgPz8geyBsYXN0UmVuZGVyVGltZTogMCwgcmVuZGVyZWRXb3JkQ291bnQ6IDAgfTtcblxuXHRcdGNvbnN0IHJhdGUgPSB0aGlzLmdldFByb2dyZXNzaXZlUmVuZGVyUmF0ZShlbGVtZW50KTtcblx0XHRjb25zdCBudW1Xb3Jkc1RvUmVuZGVyID0gcmVuZGVyRGF0YS5sYXN0UmVuZGVyVGltZSA9PT0gMCA/XG5cdFx0XHQxIDpcblx0XHRcdHJlbmRlckRhdGEucmVuZGVyZWRXb3JkQ291bnQgK1xuXHRcdFx0Ly8gQWRkaXRpb25hbCB3b3JkcyB0byByZW5kZXIgYmV5b25kIHdoYXQncyBhbHJlYWR5IHJlbmRlcmVkXG5cdFx0XHRNYXRoLmZsb29yKChEYXRlLm5vdygpIC0gcmVuZGVyRGF0YS5sYXN0UmVuZGVyVGltZSkgLyAxMDAwICogcmF0ZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bnVtV29yZHNUb1JlbmRlcixcblx0XHRcdHJhdGVcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBkaWZmKHJlbmRlcmVkUGFydHM6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb250ZW50UGFydD4sIGNvbnRlbnRUb1JlbmRlcjogUmVhZG9ubHlBcnJheTxJQ2hhdFJlbmRlcmVyQ29udGVudD4sIGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IFJlYWRvbmx5QXJyYXk8SUNoYXRSZW5kZXJlckNvbnRlbnQgfCBudWxsPiB7XG5cdFx0Y29uc3QgZGlmZjogKElDaGF0UmVuZGVyZXJDb250ZW50IHwgbnVsbClbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY29udGVudFRvUmVuZGVyLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gY29udGVudFRvUmVuZGVyW2ldO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRQYXJ0ID0gcmVuZGVyZWRQYXJ0c1tpXTtcblxuXHRcdFx0aWYgKCFyZW5kZXJlZFBhcnQgfHwgIXJlbmRlcmVkUGFydC5oYXNTYW1lQ29udGVudChjb250ZW50LCBjb250ZW50VG9SZW5kZXIuc2xpY2UoaSArIDEpLCBlbGVtZW50KSkge1xuXHRcdFx0XHRkaWZmLnB1c2goY29udGVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBudWxsIC0+IG5vIGNoYW5nZVxuXHRcdFx0XHRkaWZmLnB1c2gobnVsbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpZmY7XG5cdH1cblxuXHRwcml2YXRlIGhhc0VkaXRDb2RlYmxvY2tVcmkocGFydDogSUNoYXRSZW5kZXJlckNvbnRlbnQpOiBib29sZWFuIHtcblx0XHRpZiAocGFydC5raW5kICE9PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gaGFzRWRpdENvZGVibG9ja1VyaVRhZyhwYXJ0LmNvbnRlbnQudmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0NvZGVibG9ja0NvbXBsZXRlKHBhcnQ6IElDaGF0UmVuZGVyZXJDb250ZW50LCBlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRpZiAocGFydC5raW5kICE9PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiAhaXNSZXNwb25zZVZNKGVsZW1lbnQpIHx8IGVsZW1lbnQuaXNDb21wbGV0ZSB8fCBjb2RlYmxvY2tIYXNDbG9zaW5nQmFja3RpY2tzKHBhcnQuY29udGVudC52YWx1ZSk7XG5cdH1cblxuXHQvLyB0b2RvIEBqdXN0c2NoZW4gaW5pdGlhbGx5IHNwbGl0IHVwIGVhY2ggb2YgdGhlIGNoZWNrcyB0byBlYXNpbHkgc2VlIHdoYXQgc2hvdWxkIGJlIHBpbm5lZC9ub3QgcGlubmVkLCB3ZSBjYW4gcHJvYmFibHkgY29uc29saWRhdGUgdGhpcyBkb3duIGJ5IGEgbG90IG9uY2Ugd2UncmUgbW9yZSBjb25maWRlbnQgaW4gdGhlIGxvZ2ljLlxuXHRwcml2YXRlIHNob3VsZFBpblBhcnQocGFydDogSUNoYXRSZW5kZXJlckNvbnRlbnQsIGVsZW1lbnQ/OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29sbGFwc2VkVG9vbHNNb2RlID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGU+KCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJyk7XG5cblx0XHQvLyB0aGlua2luZyBhbmQgd29ya2luZyBjb250ZW50IGFyZSBhbHdheXMgcGlubmVkICh0aGV5IGFyZSB0aGUgdGhpbmtpbmcgY29udGFpbmVyIGl0c2VsZilcblx0XHRpZiAocGFydC5raW5kID09PSAndGhpbmtpbmcnIHx8IHBhcnQua2luZCA9PT0gJ3dvcmtpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBzaG91bGQgbm90IGZpbmFsaXplIHRoaW5raW5nXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3VuZG9TdG9wJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gb25seSB0b29sIHJlbGF0ZWQgaG9va3Mgd2lsbCBiZSBpbnNpZGUgdGhpbmtpbmcgY29udGFpbmVycy5cblx0XHRpZiAocGFydC5raW5kID09PSAnaG9vaycpIHtcblx0XHRcdGlmIChwYXJ0LnN1YkFnZW50SW52b2NhdGlvbklkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJ0Lmhvb2tUeXBlID09PSBIb29rVHlwZS5QcmVUb29sVXNlIHx8IHBhcnQuaG9va1R5cGUgPT09IEhvb2tUeXBlLlBvc3RUb29sVXNlO1xuXHRcdH1cblxuXHRcdGlmIChjb2xsYXBzZWRUb29sc01vZGUgPT09IENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuT2ZmKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gaXMgYW4gZWRpdCByZWxhdGVkIHBhcnRcblx0XHRpZiAodGhpcy5oYXNFZGl0Q29kZWJsb2NrVXJpKHBhcnQpIHx8IHBhcnQua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnIHx8IHBhcnQua2luZCA9PT0gJ2V4dGVybmFsRWRpdCcpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHBpbiBNQ1AgdG9vbHMgKyBmb3IgQ0xJIHNwZWNmaWNpYWxseSwgd2UgcGFyc2UgdG9vbCBuYW1lIHNpbmNlIENMSSB0b29scyBhcmUgXCJleHRlcm5hbFwiIHRvb2xzLlxuXHRcdGNvbnN0IGlzTWNwVG9vbCA9IChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgaXNNY3BUb29sSW52b2NhdGlvbihwYXJ0KTtcblx0XHRpZiAoaXNNY3BUb29sKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gZG9uJ3QgcGluIE1lcm1haWQgdG9vbHMgc2luY2UgaXQgaGFzIHJlbmRlcmVkIG91dHB1dFxuXHRcdGNvbnN0IGlzTWVybWFpZFRvb2wgPSAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIHBhcnQudG9vbElkLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ21lcm1haWQnKTtcblx0XHRpZiAoaXNNZXJtYWlkVG9vbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIGRvbid0IHBpbiBhc2sgcXVlc3Rpb25zIHRvb2wgaW52b2NhdGlvbnNcblx0XHRjb25zdCBpc0Fza1F1ZXN0aW9uc1Rvb2wgPSAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIGlzQXNrUXVlc3Rpb25zVG9vbEludm9jYXRpb24ocGFydCk7XG5cdFx0aWYgKGlzQXNrUXVlc3Rpb25zVG9vbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHBpbiBzdWJhZ2VudCB0b29scyB0byB0aGlua2luZyBwYXJ0cyAtIHRoZXkgaGF2ZSB0aGVpciBvd24gZ3JvdXBpbmdcblx0XHRpZiAoKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiBpc1N1YmFnZW50VG9vbEludm9jYXRpb24ocGFydCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBwaW4gc2Vzc2lvbi1jcmVhdGVkIHRvb2xzIChjcmVhdGVfc2Vzc2lvbiAvIGNyZWF0ZV9jaGF0KSBcdTIwMTQgdGhlaXJcblx0XHQvLyBcIk9wZW4gU2Vzc2lvblwiIGJ1dHRvbiBtdXN0IHN0YXkgdmlzaWJsZSwgbm90IGhpZGRlbiBpbnNpZGUgYSBjb2xsYXBzZWRcblx0XHQvLyB0aGlua2luZyBncm91cC4gS2V5ZWQgb24gdG9vbElkIHNvIHRoaXMgaG9sZHMgd2hpbGUgdGhlIHRvb2wgc3RyZWFtcyB0b29cblx0XHQvLyAoYmVmb3JlIGB0b29sU3BlY2lmaWNEYXRhYCBpcyBzZXQgb24gY29tcGxldGlvbikuXG5cdFx0aWYgKChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgKGlzQ3JlYXRlU2Vzc2lvblRvb2wocGFydC50b29sSWQpIHx8IGlzQ3JlYXRlQ2hhdFRvb2wocGFydC50b29sSWQpIHx8IGlzU2VuZE1lc3NhZ2VUb29sKHBhcnQudG9vbElkKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBvbmx5IHBpbiB0ZXJtaW5hbCB0b29scyBiYXNlZCBvbiBzZXR0aW5nc1xuXHRcdGNvbnN0IGlzVGVybWluYWxUb29sID0gKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiBwYXJ0LnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCc7XG5cdFx0Y29uc3QgaXNDb250cmlidXRlZFRlcm1pbmFsVG9vbEludm9jYXRpb24gPSBlbGVtZW50XG5cdFx0XHQmJiAoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2Uuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCAmJiBnZXRDaGF0U2Vzc2lvblR5cGUoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkgLy8gY29udHJpYnV0ZWQgc2Vzc2lvbnNcblx0XHRcdCYmIHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcgJiYgcGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnOyAvLyBjb250cmlidXRlZCBzZXJpYWxpemVkIHRlcm1pbmFsIHRvb2wgaW52b2NhdGlvbnMgZGF0YVxuXHRcdGlmIChpc1Rlcm1pbmFsVG9vbCAmJiAhaXNDb250cmlidXRlZFRlcm1pbmFsVG9vbEludm9jYXRpb24pIHtcblx0XHRcdC8vIGRvbid0IHBpbiB0ZXJtaW5hbHMgd2l0aCBjb25maXJtYXRpb25cblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgSUNoYXRUb29sSW52b2NhdGlvbi5nZXRDb25maXJtYXRpb25NZXNzYWdlcyhwYXJ0KSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXJtaW5hbFRvb2xzSW5UaGlua2luZyA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5UZXJtaW5hbFRvb2xzSW5UaGlua2luZyk7XG5cdFx0XHRyZXR1cm4gISF0ZXJtaW5hbFRvb2xzSW5UaGlua2luZztcblx0XHR9XG5cblx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuc3RhdGUuZ2V0KCk7XG5cdFx0XHRyZXR1cm4gc2hvdWxkUGluVG9vbEludm9jYXRpb25Ub1RoaW5raW5nKHN0YXRlLnR5cGUsICEhSUNoYXRUb29sSW52b2NhdGlvbi5nZXRDb25maXJtYXRpb25NZXNzYWdlcyhwYXJ0KSwgdG9vbEludm9jYXRpb25IYXNNY3BBcHBEYXRhKHBhcnQpKTtcblx0XHR9XG5cblx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykge1xuXHRcdFx0cmV0dXJuICF0b29sSW52b2NhdGlvbkhhc01jcEFwcERhdGEocGFydCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMYXN0VGhpbmtpbmdQYXJ0KHJlbmRlcmVkUGFydHM6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb250ZW50UGFydD4gfCB1bmRlZmluZWQpOiBDaGF0VGhpbmtpbmdDb250ZW50UGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyZW5kZXJlZFBhcnRzIHx8IHJlbmRlcmVkUGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFNlYXJjaCBiYWNrd2FyZHMgZm9yIHRoZSBtb3N0IHJlY2VudCBhY3RpdmUgdGhpbmtpbmcgcGFydFxuXHRcdGZvciAobGV0IGkgPSByZW5kZXJlZFBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcmVuZGVyZWRQYXJ0c1tpXTtcblx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQgJiYgcGFydC5nZXRJc0FjdGl2ZSgpKSB7XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldExhc3RUaGlua2luZ1BhcnRGb3JHcm91cGVkSXRlbShjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB7IHBhcnQ6IENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkOyBzZXBhcmF0ZWRGcm9tUmVhc29uaW5nOiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IGxhc3RUaGlua2luZyA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydCh0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyk7XG5cdFx0Y29uc3QgZGlzcGxheU1vZGUgPSBnZXRFZmZlY3RpdmVUaGlua2luZ0Rpc3BsYXlNb2RlKHRoaXMuY29uZmlnU2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKGxhc3RUaGlua2luZz8uaGFzUmVhc29uaW5nQ29udGVudCgpICYmIHNob3VsZFN0YXJ0TmV3Q29sbGFwc2VkVGhpbmtpbmdHcm91cChkaXNwbGF5TW9kZSwgJ3JlYXNvbmluZycsICdpdGVtcycpKSB7XG5cdFx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0cmV0dXJuIHsgcGFydDogdW5kZWZpbmVkLCBzZXBhcmF0ZWRGcm9tUmVhc29uaW5nOiB0cnVlIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHBhcnQ6IGxhc3RUaGlua2luZywgc2VwYXJhdGVkRnJvbVJlYXNvbmluZzogZmFsc2UgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXRlcm1pbmVzIGlmIGEgdGhpbmtpbmcgcGFydCBhdCB0aGUgZ2l2ZW4gY29udGVudCBpbmRleCBpcyBcImxvb2stYWhlYWQgY29tcGxldGVcIi5cblx0ICogQSB0aGlua2luZyBwYXJ0IGlzIGxvb2stYWhlYWQgY29tcGxldGUgaWYgdGhlcmUgYXJlIHN1YnNlcXVlbnQgcGFydHMgdGhhdCB3aWxsIE5PVFxuXHQgKiBiZSBwaW5uZWQgdG8gaXQsIG1lYW5pbmcgd2Uga25vdyB0aGlzIHRoaW5raW5nIHBhcnQgaXMgYWxyZWFkeSBkb25lIGV2ZW4gdGhvdWdoXG5cdCAqIHRoZSBvdmVyYWxsIHJlc3BvbnNlIGlzIHN0aWxsIGluIHByb2dyZXNzLlxuXHQgKi9cblx0cHJpdmF0ZSBpc1RoaW5raW5nTG9va0FoZWFkQ29tcGxldGUoY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIGVsZW1lbnQ/OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogYm9vbGVhbiB7XG5cdFx0Ly8gSWYgZWxlbWVudCBpcyBhbHJlYWR5IGNvbXBsZXRlLCBubyBuZWVkIGZvciBsb29rLWFoZWFkXG5cdFx0aWYgKGVsZW1lbnQ/LmlzQ29tcGxldGUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIExvb2sgYXQgYWxsIHBhcnRzIGFmdGVyIHRoZSBjdXJyZW50IGNvbnRlbnQgaW5kZXhcblx0XHRmb3IgKGxldCBpID0gY29udGV4dC5jb250ZW50SW5kZXggKyAxOyBpIDwgY29udGV4dC5jb250ZW50Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBuZXh0UGFydCA9IGNvbnRleHQuY29udGVudFtpXTtcblx0XHRcdC8vIElmIHRoZXJlJ3MgYW55IHBhcnQgdGhhdCB3b3VsZCBOT1QgYmUgcGlubmVkIHRvIHRoZSB0aGlua2luZyBwYXJ0LFxuXHRcdFx0Ly8gdGhlbiB0aGlzIHRoaW5raW5nIHBhcnQgaXMgYWxyZWFkeSBjb21wbGV0ZVxuXHRcdFx0aWYgKCF0aGlzLnNob3VsZFBpblBhcnQobmV4dFBhcnQsIGVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3ViYWdlbnRQYXJ0KHJlbmRlcmVkUGFydHM6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb250ZW50UGFydD4gfCB1bmRlZmluZWQsIHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nKTogQ2hhdFN1YmFnZW50Q29udGVudFBhcnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmVuZGVyZWRQYXJ0cyB8fCByZW5kZXJlZFBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTZWFyY2ggYmFja3dhcmRzIGZvciB0aGUgbW9zdCByZWNlbnQgc3ViYWdlbnQgcGFydFxuXHRcdGZvciAobGV0IGkgPSByZW5kZXJlZFBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcmVuZGVyZWRQYXJ0c1tpXTtcblx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFN1YmFnZW50Q29udGVudFBhcnQpIHtcblx0XHRcdFx0Ly8gSWYgbG9va2luZyBmb3IgYSBzcGVjaWZpYyBJRCwgcmV0dXJuIHRoZSBwYXJ0IHdpdGggdGhhdCBJRCByZWdhcmRsZXNzIG9mIGFjdGl2ZSBzdGF0ZVxuXHRcdFx0XHRpZiAoc3ViQWdlbnRJbnZvY2F0aW9uSWQgJiYgcGFydC5zdWJBZ2VudEludm9jYXRpb25JZCA9PT0gc3ViQWdlbnRJbnZvY2F0aW9uSWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJZiBubyBJRCBzcGVjaWZpZWQsIG9ubHkgcmV0dXJuIGFjdGl2ZSBwYXJ0c1xuXHRcdFx0XHRpZiAoIXN1YkFnZW50SW52b2NhdGlvbklkICYmIHBhcnQuZ2V0SXNBY3RpdmUoKSkge1xuXHRcdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZmluYWxpemVBbGxTdWJhZ2VudFBhcnRzKHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBmb3JjZTogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCF0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZpbmFsaXplIGFsbCBhY3RpdmUgc3ViYWdlbnQgcGFydHMgKHRoZXJlIGNhbiBiZSBtdWx0aXBsZSBwYXJhbGxlbCBzdWJhZ2VudHMpXG5cdFx0Ly8gU2tpcCBzdWJhZ2VudHMgdGhhdCBzdGlsbCBoYXZlIHRvb2xzIHdhaXRpbmcgZm9yIGNvbmZpcm1hdGlvblxuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cykge1xuXHRcdFx0aWYgKHBhcnQgaW5zdGFuY2VvZiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCAmJiBwYXJ0LmdldElzQWN0aXZlKCkgJiYgKGZvcmNlIHx8ICFwYXJ0LnNob3VsZFJlbWFpbkFjdGl2ZSgpKSAmJiAoZm9yY2UgfHwgIXBhcnQuaGFzVG9vbHNXYWl0aW5nRm9yQ29uZmlybWF0aW9uKSkge1xuXHRcdFx0XHRwYXJ0Lm1hcmtBc0luYWN0aXZlKGZvcmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVN1YmFnZW50VG9vbEdyb3VwaW5nKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIHN1YmFnZW50SWQ6IHN0cmluZywgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBjb2RlQmxvY2tTdGFydEluZGV4OiBudW1iZXIpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHQvLyBGaW5hbGl6ZSBhbnkgYWN0aXZlIHRoaW5raW5nIHBhcnQgc2luY2Ugc3ViYWdlbnQgdG9vbHMgaGF2ZSB0aGVpciBvd24gZ3JvdXBpbmdcblx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0Y29uc3QgbGFzdFN1YmFnZW50ID0gdGhpcy5nZXRTdWJhZ2VudFBhcnQodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMsIHN1YmFnZW50SWQpO1xuXHRcdGlmIChsYXN0U3ViYWdlbnQpIHtcblx0XHRcdC8vIEVuYWJsZSBjYXJvdXNlbCBtb2RlIGJlZm9yZSBhcHBlbmRUb29sSW52b2NhdGlvbiBjcmVhdGVzIGFuIGlubGluZSBwYXJ0LlxuXHRcdFx0dGhpcy5tYXliZVJvdXRlU3ViYWdlbnRUb29sVG9DYXJvdXNlbCh0b29sSW52b2NhdGlvbiwgbGFzdFN1YmFnZW50LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEsIGNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXG5cdFx0XHQvLyBBcHBlbmQgdG8gZXhpc3Rpbmcgc3ViYWdlbnQgcGFydCB3aXRoIG1hdGNoaW5nIElEXG5cdFx0XHQvLyBCdXQgc2tpcCB0aGUgcGFyZW50IHN1YmFnZW50IHRvb2wgaXRzZWxmIC0gd2Ugb25seSB3YW50IGNoaWxkIHRvb2xzXG5cdFx0XHRpZiAoIWlzUGFyZW50U3ViYWdlbnRUb29sKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRsYXN0U3ViYWdlbnQuYXBwZW5kVG9vbEludm9jYXRpb24odG9vbEludm9jYXRpb24sIGNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT5cblx0XHRcdFx0XHQob3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJylcblx0XHRcdFx0XHQmJiBvdGhlci50b29sQ2FsbElkID09PSB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsYXN0U3ViYWdlbnQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IHN1YmFnZW50IHBhcnQgLSBpdCB3aWxsIGV4dHJhY3QgZGVzY3JpcHRpb24vYWdlbnROYW1lL3Byb21wdCBhbmQgd2F0Y2ggZm9yIGNvbXBsZXRpb25cblx0XHRjb25zdCBzdWJhZ2VudFBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFN1YmFnZW50Q29udGVudFBhcnQsXG5cdFx0XHRzdWJhZ2VudElkLFxuXHRcdFx0dG9vbEludm9jYXRpb24sXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0dGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHR0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLFxuXHRcdFx0dGhpcy5fdG9vbEVkaXRvclBvb2wsXG5cdFx0XHQoKSA9PiB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCksXG5cdFx0XHR0aGlzLl9hbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLFxuXHRcdCk7XG5cdFx0Ly8gRW5hYmxlIGNhcm91c2VsIG1vZGUgYmVmb3JlIGFwcGVuZFRvb2xJbnZvY2F0aW9uIGNyZWF0ZXMgYW4gaW5saW5lIHBhcnQuXG5cdFx0dGhpcy5tYXliZVJvdXRlU3ViYWdlbnRUb29sVG9DYXJvdXNlbCh0b29sSW52b2NhdGlvbiwgc3ViYWdlbnRQYXJ0LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEsIGNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXG5cdFx0Ly8gRG9uJ3QgYXBwZW5kIHRoZSBwYXJlbnQgc3ViYWdlbnQgdG9vbCBpdHNlbGYgLSBpdHMgZGVzY3JpcHRpb24gaXMgYWxyZWFkeSBzaG93biBpbiB0aGUgdGl0bGVcblx0XHQvLyBPbmx5IGFwcGVuZCBjaGlsZCB0b29scyAodGhvc2Ugd2l0aCBzdWJBZ2VudEludm9jYXRpb25JZClcblx0XHRpZiAoIWlzUGFyZW50U3ViYWdlbnRUb29sKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0c3ViYWdlbnRQYXJ0LmFwcGVuZFRvb2xJbnZvY2F0aW9uKHRvb2xJbnZvY2F0aW9uLCBjb2RlQmxvY2tTdGFydEluZGV4KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3ViYWdlbnRQYXJ0O1xuXHR9XG5cblx0LyoqIFJvdXRlcyBzdWJhZ2VudCBjb25maXJtYXRpb25zIHRvIHRoZSBpbnB1dCBjYXJvdXNlbCBhbmQgbGVhdmVzIGEgcGxhY2Vob2xkZXIgaW5saW5lLiAqL1xuXHRwcml2YXRlIG1heWJlUm91dGVTdWJhZ2VudFRvb2xUb0Nhcm91c2VsKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsXG5cdFx0c3ViYWdlbnRQYXJ0OiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHR0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSxcblx0XHRjb2RlQmxvY2tTdGFydEluZGV4OiBudW1iZXIsXG5cdCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLmtpbmQgIT09ICd0b29sSW52b2NhdGlvbicgfHwgIWlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpc1BhcmVudFN1YmFnZW50VG9vbCh0b29sSW52b2NhdGlvbikgfHwgdG9vbEludm9jYXRpb24ucHJlc2VudGF0aW9uID09PSAnaGlkZGVuJyB8fCB0b29sSW52b2NhdGlvbi5zb3VyY2UudHlwZSA9PT0gJ21jcCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCEhdGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3ViQWdlbnRJbnZvY2F0aW9uSWQgPSBzdWJhZ2VudFBhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdFx0Y29uc3QgYWdlbnROYW1lID0gc3ViYWdlbnRQYXJ0LmdldEFnZW50TGFiZWwoKTtcblxuXHRcdGNvbnN0IHJldmVhbFN1YmFnZW50ID0gKHRhcmdldFN1YkFnZW50SWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFRlbXBsYXRlRGF0YSA9IHRoaXMuZ2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKGNvbnRleHQuZWxlbWVudC5pZCk7XG5cdFx0XHRjb25zdCBjdXJyZW50U3ViYWdlbnRQYXJ0ID0gdGhpcy5nZXRTdWJhZ2VudFBhcnQoY3VycmVudFRlbXBsYXRlRGF0YT8ucmVuZGVyZWRQYXJ0cywgdGFyZ2V0U3ViQWdlbnRJZCkgPz8gc3ViYWdlbnRQYXJ0O1xuXHRcdFx0Y29uc3QgY2hhdFJlc291cmNlID0gY3VycmVudFN1YmFnZW50UGFydC5nZXRDaGF0UmVzb3VyY2UoKTtcblx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ICYmIGNoYXRSZXNvdXJjZSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lELCB7IGNoYXRSZXNvdXJjZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN1cnJlbnRTdWJhZ2VudFBhcnQuZG9tTm9kZS5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgcmV2ZWFsU3ViYWdlbnRMYWJlbCA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3dcblx0XHRcdD8gbG9jYWxpemUoJ29wZW5TdWJhZ2VudENoYXQnLCBcIk9wZW4gezB9IENoYXRcIiwgYWdlbnROYW1lKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBuYXZpZ2F0ZVRvQ2Fyb3VzZWwgPSAodGFyZ2V0U3ViQWdlbnRJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHR3aWRnZXQuaW5wdXRQYXJ0LmFjdGl2YXRlQ2Fyb3VzZWxGb3JTdWJhZ2VudCh0YXJnZXRTdWJBZ2VudElkKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZmFjdG9yeSA9ICh0b29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uKSA9PiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgdG9vbCwgY29udGV4dCxcblx0XHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCB0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLFxuXHRcdFx0dGhpcy5fdG9vbEVkaXRvclBvb2wsICgpID0+IHRoaXMuX2N1cnJlbnRMYXlvdXRXaWR0aC5nZXQoKSxcblx0XHRcdHRoaXMuX2Fubm91bmNlZFRvb2xQcm9ncmVzc0tleXMsXG5cdFx0XHRjb2RlQmxvY2tTdGFydEluZGV4XG5cdFx0KTtcblxuXHRcdGNvbnN0IGFkZFRvb2xUb0Nhcm91c2VsID0gKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24pID0+IHtcblx0XHRcdHdpZGdldC5pbnB1dFBhcnQuYWRkVG9vbFRvQ29uZmlybWF0aW9uQ2Fyb3VzZWwodG9vbCwgZmFjdG9yeSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIGFnZW50TmFtZSwgcmV2ZWFsU3ViYWdlbnQsIHJldmVhbFN1YmFnZW50TGFiZWwpO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLmNyZWF0ZVVwZGF0ZVdvcmtpbmdQcm9ncmVzc09uQ29uZmlybWF0aW9uRW5kKHRvb2wsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRpZiAobGlzdGVuZXIpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobGlzdGVuZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sID0gKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24sIHN0YXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlKSA9PlxuXHRcdFx0dGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkgJiZcblx0XHRcdCF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJlxuXHRcdFx0dG9vbC5wcmVzZW50YXRpb24gIT09ICdoaWRkZW4nICYmXG5cdFx0XHR0b29sLnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJlxuXHRcdFx0c3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJlxuXHRcdFx0ISFzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGU7XG5cblx0XHRzdWJhZ2VudFBhcnQuZW5hYmxlQ2Fyb3VzZWxNb2RlKG5hdmlnYXRlVG9DYXJvdXNlbCwgYWRkVG9vbFRvQ2Fyb3VzZWwsIHNob3VsZFVzZUNhcm91c2VsRm9yVG9vbCwgd2lkZ2V0LmlucHV0UGFydC5vbkRpZENoYW5nZUFjdGl2ZUNvbmZpcm1hdGlvblN1YmFnZW50KTtcblx0XHRzdWJhZ2VudFBhcnQuc2V0Q29uZmlybWF0aW9uQWN0aXZlKHdpZGdldC5pbnB1dFBhcnQuYWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnRJZCA9PT0gc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXG5cdFx0Y29uc3QgdG9vbFN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHRvb2xTdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uICYmXG5cdFx0XHR0b29sU3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHRhZGRUb29sVG9DYXJvdXNlbCh0b29sSW52b2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdFRoaW5raW5nID0gdGhpcy5nZXRMYXN0VGhpbmtpbmdQYXJ0KHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHRpZiAoIWxhc3RUaGlua2luZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdHlsZSA9IGdldEVmZmVjdGl2ZVRoaW5raW5nRGlzcGxheU1vZGUodGhpcy5jb25maWdTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoc3R5bGUgPT09IFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkUHJldmlldykge1xuXHRcdFx0bGFzdFRoaW5raW5nLmNvbGxhcHNlQ29udGVudCgpO1xuXHRcdH1cblx0XHRsYXN0VGhpbmtpbmcuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXHRcdGxhc3RUaGlua2luZy5yZXNldElkKCk7XG5cdFx0bGFzdFRoaW5raW5nLm1hcmtBc0luYWN0aXZlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoYXRDb250ZW50UGFydChjb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0KTogSUNoYXRDb250ZW50UGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIGlmIHdlIGdldCBhbiBlbXB0eSB0aGlua2luZyBwYXJ0LCBtYXJrIHRoaW5raW5nIGFzIGZpbmlzaGVkXG5cdFx0XHRpZiAoY29udGVudC5raW5kID09PSAndGhpbmtpbmcnICYmIChBcnJheS5pc0FycmF5KGNvbnRlbnQudmFsdWUpID8gY29udGVudC52YWx1ZS5sZW5ndGggPT09IDAgOiBjb250ZW50LnZhbHVlID09PSAnJykpIHtcblx0XHRcdFx0Y29uc3QgbGFzdFRoaW5raW5nID0gdGhpcy5nZXRMYXN0VGhpbmtpbmdQYXJ0KHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHRcdFx0bGFzdFRoaW5raW5nPy5yZXNldElkKCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBjb250ZW50LmtpbmQgPT09IG90aGVyLmtpbmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc1Jlc3BvbnNlRWxlbWVudCA9IGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpO1xuXHRcdFx0Y29uc3Qgc2hvdWxkUGluID0gdGhpcy5zaG91bGRQaW5QYXJ0KGNvbnRlbnQsIGlzUmVzcG9uc2VFbGVtZW50ID8gY29udGV4dC5lbGVtZW50IDogdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gRmluYWxpemUgdGhlIGFjdGl2ZSB0aGlua2luZyBwYXJ0IGZvciB0aGlzIGVsZW1lbnQgd2hlbiB0aGUgcmVzcG9uc2UgaXMgY29tcGxldGUuXG5cdFx0XHQvLyBTY29wZWQgdG8gdGhlIGN1cnJlbnQgZWxlbWVudCdzIHRlbXBsYXRlRGF0YSB0byBhdm9pZCBmaW5hbGl6aW5nIHRoaW5raW5nIHBhcnRzXG5cdFx0XHQvLyBiZWxvbmdpbmcgdG8gb3RoZXIgKHN0aWxsLXN0cmVhbWluZykgcmVzcG9uc2VzIGR1cmluZyBzY3JvbGwgcmUtcmVuZGVycy5cblx0XHRcdGlmIChjb250ZXh0LmVsZW1lbnQuaXNDb21wbGV0ZSAmJiAhc2hvdWxkUGluKSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnRUZW1wbGF0ZURhdGEgPSB0aGlzLmdldFRlbXBsYXRlRGF0YUZvclJlcXVlc3RJZChjb250ZXh0LmVsZW1lbnQuaWQpO1xuXHRcdFx0XHRpZiAoZWxlbWVudFRlbXBsYXRlRGF0YT8ucmVuZGVyZWRQYXJ0cykge1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RUaGlua2luZyA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydChlbGVtZW50VGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpO1xuXHRcdFx0XHRcdGlmIChsYXN0VGhpbmtpbmc/LmdldElzQWN0aXZlKCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuZmluYWxpemVDdXJyZW50VGhpbmtpbmdQYXJ0KGNvbnRleHQsIGVsZW1lbnRUZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIHN1YmFnZW50IGNvbnRlbnRcblx0XHRcdGNvbnN0IGlzU3ViYWdlbnRDb250ZW50ID0gKGNvbnRlbnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBjb250ZW50LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKVxuXHRcdFx0XHQmJiBpc1N1YmFnZW50VG9vbEludm9jYXRpb24oY29udGVudCk7XG5cblx0XHRcdC8vIEZpbmFsaXplIHN1YmFnZW50IHBhcnRzIGZvciB0aGlzIGVsZW1lbnQgd2hlbiB0aGUgcmVzcG9uc2UgaXMgY29tcGxldGUuXG5cdFx0XHQvLyBOb3RlOiBXZSBkb24ndCBmaW5hbGl6ZSB3aGVuIG5vbi1zdWJhZ2VudCBjb250ZW50IGFycml2ZXMgYmVjYXVzZSBwYXJhbGxlbCBzdWJhZ2VudHMgbWF5IHN0aWxsIGJlIHJ1bm5pbmcuXG5cdFx0XHQvLyBTY29wZWQgdG8gdGhlIGN1cnJlbnQgZWxlbWVudCB0byBhdm9pZCBmaW5hbGl6aW5nIHN1YmFnZW50IHBhcnRzIG9uIG90aGVyIHJlc3BvbnNlcyBkdXJpbmcgc2Nyb2xsIHJlLXJlbmRlcnMuXG5cdFx0XHRpZiAoY29udGV4dC5lbGVtZW50LmlzQ29tcGxldGUgJiYgIWlzU3ViYWdlbnRDb250ZW50KSB7XG5cdFx0XHRcdGNvbnN0IGVsZW1lbnRUZW1wbGF0ZURhdGEgPSB0aGlzLmdldFRlbXBsYXRlRGF0YUZvclJlcXVlc3RJZChjb250ZXh0LmVsZW1lbnQuaWQpO1xuXHRcdFx0XHRpZiAoZWxlbWVudFRlbXBsYXRlRGF0YSkge1xuXHRcdFx0XHRcdHRoaXMuZmluYWxpemVBbGxTdWJhZ2VudFBhcnRzKGVsZW1lbnRUZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb250ZW50LmtpbmQgPT09ICd0cmVlRGF0YScpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVHJlZURhdGEoY29udGVudCwgdGVtcGxhdGVEYXRhLCBjb250ZXh0KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnbXVsdGlEaWZmRGF0YScpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTXVsdGlEaWZmRGF0YShjb250ZW50LCB0ZW1wbGF0ZURhdGEsIGNvbnRleHQpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdwcm9ncmVzc01lc3NhZ2UnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRQcm9ncmVzc0NvbnRlbnRQYXJ0LCBjb250ZW50LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlciwgY29udGV4dCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjb250ZW50LnNoaW1tZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdzeXN0ZW1Ob3RpZmljYXRpb24nKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTeXN0ZW1Ob3RpZmljYXRpb25Db250ZW50UGFydCwgY29udGVudCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICd3b3JraW5nJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnQsIGNvbnRlbnQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCBjb250ZXh0KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAncHJvZ3Jlc3NUYXNrJyB8fCBjb250ZW50LmtpbmQgPT09ICdwcm9ncmVzc1Rhc2tTZXJpYWxpemVkJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJQcm9ncmVzc1Rhc2soY29udGVudCwgdGVtcGxhdGVEYXRhLCBjb250ZXh0KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnY29tbWFuZCcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdENvbW1hbmRCdXR0b25Db250ZW50UGFydCwgY29udGVudCwgY29udGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3RleHRFZGl0R3JvdXAnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRleHRFZGl0KGNvbnRleHQsIGNvbnRlbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyQ29uZmlybWF0aW9uKGNvbnRleHQsIGNvbnRlbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3dhcm5pbmcnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFcnJvckNvbnRlbnRQYXJ0LCBDaGF0RXJyb3JMZXZlbC5XYXJuaW5nLCBjb250ZW50LmNvbnRlbnQsIGNvbnRlbnQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnaW5mbycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVycm9yQ29udGVudFBhcnQsIENoYXRFcnJvckxldmVsLkluZm8sIGNvbnRlbnQuY29udGVudCwgY29udGVudCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdob29rJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJIb29rUGFydChjb250ZW50LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck1hcmtkb3duKGNvbnRlbnQsIHRlbXBsYXRlRGF0YSwgY29udGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3JlZmVyZW5jZXMnKSB7XG5cdFx0XHRcdC8vIE9ubHkgc2hvdyByZWZlcmVuY2VzIGZvciBjaGF0IHBhcnRpY2lwYW50cywgbm90IGFnZW50c1xuXHRcdFx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY29udGV4dC5lbGVtZW50LmFnZW50Py5pc0RlZmF1bHQgJiYgIWNvbnRleHQuZWxlbWVudC5hZ2VudC5tb2Rlcy5pbmNsdWRlcyhDaGF0TW9kZUtpbmQuQXNrKSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBvdGhlci5raW5kID09PSBjb250ZW50LmtpbmQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckNvbnRlbnRSZWZlcmVuY2VzTGlzdERhdGEoY29udGVudCwgdW5kZWZpbmVkLCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdjb2RlQ2l0YXRpb25zJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJDb2RlQ2l0YXRpb25zKGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBjb250ZW50LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRvb2xJbnZvY2F0aW9uKGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ2V4dGVuc2lvbnMnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckV4dGVuc2lvbnNDb250ZW50KGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3B1bGxSZXF1ZXN0Jykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJQdWxsUmVxdWVzdENvbnRlbnQoY29udGVudCwgY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAndW5kb1N0b3AnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclVuZG9TdG9wKGNvbnRlbnQpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdlcnJvckRldGFpbHMnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckNoYXRFcnJvckRldGFpbHMoY29udGV4dCwgY29udGVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnZWxpY2l0YXRpb24yJyB8fCBjb250ZW50LmtpbmQgPT09ICdlbGljaXRhdGlvblNlcmlhbGl6ZWQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckVsaWNpdGF0aW9uKGNvbnRleHQsIGNvbnRlbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclF1ZXN0aW9uQ2Fyb3VzZWwoY29udGV4dCwgY29udGVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAncGxhblJldmlldycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyUGxhblJldmlldyhjb250ZXh0LCBjb250ZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdjaGFuZ2VzU3VtbWFyeScpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyQ2hhbmdlc1N1bW1hcnkoY29udGVudCwgY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAndHVyblBpbGxzJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJUdXJuUGlsbHMoY29udGVudCwgY29udGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ21jcFNlcnZlcnNTdGFydGluZycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTWNwU2VydmVyc0ludGVyYWN0aW9uUmVxdWlyZWQoY29udGVudCwgY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnbWNwQXV0aGVudGljYXRpb25SZXF1aXJlZCcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1jcEF1dGhlbnRpY2F0aW9uQ29udGVudFBhcnQsIGNvbnRlbnQpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdtY3BTZXJ2ZXJzU3RhcnRpbmdTbG93Jykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TWNwU2VydmVyc1N0YXJ0aW5nQ29udGVudFBhcnQsIGNvbnRlbnQsIHtcblx0XHRcdFx0XHRvbkRpZEZpbmlzaFN0YXJ0aW5nOiAoKSA9PiB0aGlzLnNob3dXb3JraW5nUHJvZ3Jlc3NBZnRlck1jcChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnZGlzYWJsZWRDbGF1ZGVIb29rcycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyRGlzYWJsZWRDbGF1ZGVIb29rcyhjb250ZW50LCBjb250ZXh0KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAndGhpbmtpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRoaW5raW5nUGFydChjb250ZW50LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICd3b3Jrc3BhY2VFZGl0Jykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0V29ya3NwYWNlRWRpdENvbnRlbnRQYXJ0LCBjb250ZW50LCBjb250ZXh0LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcik7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ2V4dGVybmFsRWRpdCcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyRXh0ZXJuYWxFZGl0KGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ2F1dG9Nb2RlUmVzb2x1dGlvbicpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEF1dG9Nb2RlUmVzb2x1dGlvbkNvbnRlbnRQYXJ0LCBjb250ZW50LCBjb250ZXh0LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBjb250ZW50LmtpbmQgPT09IG90aGVyLmtpbmQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YWxlcnQoYENoYXQgZXJyb3I6ICR7dG9FcnJvck1lc3NhZ2UoZXJyLCBmYWxzZSl9YCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0NoYXRMaXN0SXRlbVJlbmRlcmVyI3JlbmRlckNoYXRDb250ZW50UGFydDogZXJyb3IgcmVuZGVyaW5nIGNvbnRlbnQnLCB0b0Vycm9yTWVzc2FnZShlcnIsIHRydWUpKTtcblx0XHRcdGNvbnN0IGVycm9yUGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVycm9yQ29udGVudFBhcnQsIENoYXRFcnJvckxldmVsLkVycm9yLCBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3JlbmRlckZhaWxNc2cnLCBcIkZhaWxlZCB0byByZW5kZXIgY29udGVudFwiKSArIGA6ICR7dG9FcnJvck1lc3NhZ2UoZXJyLCBmYWxzZSl9YCksIGNvbnRlbnQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGVycm9yUGFydC5kaXNwb3NlKCksXG5cdFx0XHRcdGRvbU5vZGU6IGVycm9yUGFydC5kb21Ob2RlLFxuXHRcdFx0XHRoYXNTYW1lQ29udGVudDogKG90aGVyID0+IGNvbnRlbnQua2luZCA9PT0gb3RoZXIua2luZCksXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd1dvcmtpbmdQcm9ncmVzc0FmdGVyTWNwKGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IG9yaWdpbmFsRWxlbWVudCA9IGNvbnRleHQuZWxlbWVudDtcblx0XHRjb25zdCBvcmlnaW5hbFJlbmRlcmVkUGFydHMgPSB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cztcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRpZiAoIWlzUmVzcG9uc2VWTShvcmlnaW5hbEVsZW1lbnQpIHx8IHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudCAhPT0gb3JpZ2luYWxFbGVtZW50IHx8IG9yaWdpbmFsRWxlbWVudC5pc0NvbXBsZXRlIHx8IG9yaWdpbmFsRWxlbWVudC5pc0NhbmNlbGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFvcmlnaW5hbFJlbmRlcmVkUGFydHMgfHwgdGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMgIT09IG9yaWdpbmFsUmVuZGVyZWRQYXJ0cyB8fCBvcmlnaW5hbFJlbmRlcmVkUGFydHMuc29tZShwYXJ0ID0+IHBhcnQgaW5zdGFuY2VvZiBDaGF0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZW5kZXJDaGF0UmVzcG9uc2VCYXNpYyhvcmlnaW5hbEVsZW1lbnQsIGNvbnRleHQuZWxlbWVudEluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0dGhpcy5maXJlSXRlbUhlaWdodENoYW5nZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblxuXHRwcml2YXRlIHJlbmRlckNoYXRFcnJvckRldGFpbHMoY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIGNvbnRlbnQ6IElDaGF0RXJyb3JEZXRhaWxzUGFydCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRpZiAoIWlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT4gY29udGVudC5raW5kID09PSBvdGhlci5raW5kKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0xhc3QgPSBjb250ZW50LmlzTGFzdDtcblx0XHRpZiAoY29udGVudC5lcnJvckRldGFpbHMuaXNRdW90YUV4Y2VlZGVkKSB7XG5cdFx0XHRjb25zdCByZW5kZXJlZEVycm9yID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UXVvdGFFeGNlZWRlZFBhcnQsIGNvbnRleHQuZWxlbWVudCwgY29udGVudCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdFx0cmV0dXJuIHJlbmRlcmVkRXJyb3I7XG5cdFx0fSBlbHNlIGlmIChjb250ZW50LmVycm9yRGV0YWlscy5pc1JhdGVMaW1pdGVkICYmIHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXMpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkRXJyb3IgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBbm9ueW1vdXNSYXRlTGltaXRlZFBhcnQsIGNvbnRlbnQpO1xuXHRcdFx0cmV0dXJuIHJlbmRlcmVkRXJyb3I7XG5cdFx0fSBlbHNlIGlmIChjb250ZW50LmVycm9yRGV0YWlscy5jb25maXJtYXRpb25CdXR0b25zICYmIGlzTGFzdCkge1xuXHRcdFx0Y29uc3QgbGV2ZWwgPSBjb250ZW50LmVycm9yRGV0YWlscy5sZXZlbCA/PyBDaGF0RXJyb3JMZXZlbC5FcnJvcjtcblx0XHRcdGNvbnN0IGVycm9yQ29uZmlybWF0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RXJyb3JDb25maXJtYXRpb25Db250ZW50UGFydCwgbGV2ZWwsIG5ldyBNYXJrZG93blN0cmluZyhjb250ZW50LmVycm9yRGV0YWlscy5tZXNzYWdlKSwgY29udGVudCwgY29udGVudC5lcnJvckRldGFpbHMuY29uZmlybWF0aW9uQnV0dG9ucywgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsIGNvbnRleHQpO1xuXHRcdFx0cmV0dXJuIGVycm9yQ29uZmlybWF0aW9uO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBsZXZlbCA9IGNvbnRlbnQuZXJyb3JEZXRhaWxzLmxldmVsID8/IENoYXRFcnJvckxldmVsLkVycm9yO1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVycm9yQ29udGVudFBhcnQsIGxldmVsLCBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudC5lcnJvckRldGFpbHMubWVzc2FnZSksIGNvbnRlbnQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclVuZG9TdG9wKGNvbnRlbnQ6IElDaGF0VW5kb1N0b3ApIHtcblx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT4gb3RoZXIua2luZCA9PT0gY29udGVudC5raW5kICYmIG90aGVyLmlkID09PSBjb250ZW50LmlkKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTm9Db250ZW50KGVxdWFsczogKG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgZWxlbWVudDogQ2hhdFRyZWVJdGVtKSA9PiBib29sZWFuKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdGRvbU5vZGU6IHVuZGVmaW5lZCxcblx0XHRcdGhhc1NhbWVDb250ZW50OiBlcXVhbHMsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVHJlZURhdGEoY29udGVudDogSUNoYXRUcmVlRGF0YSwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0KTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0Y29uc3QgZGF0YSA9IGNvbnRlbnQudHJlZURhdGE7XG5cdFx0Y29uc3QgdHJlZVBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUcmVlQ29udGVudFBhcnQsIGRhdGEsIHRoaXMuX3RyZWVQb29sKTtcblxuXHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgZmlsZVRyZWVGb2N1c0luZm8gPSB7XG5cdFx0XHRcdHRyZWVEYXRhSWQ6IGRhdGEudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHRyZWVJbmRleDogY29udGV4dC50cmVlU3RhcnRJbmRleCxcblx0XHRcdFx0Zm9jdXMoKSB7XG5cdFx0XHRcdFx0dHJlZVBhcnQuZG9tRm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gVE9ET0Byb2Jsb3VyZW5zIHRoZXJlJ3MgZ290IHRvIGJlIGEgYmV0dGVyIHdheSB0byBuYXZpZ2F0ZSB0cmVlc1xuXHRcdFx0dHJlZVBhcnQuYWRkRGlzcG9zYWJsZSh0cmVlUGFydC5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkRmlsZVRyZWVzQnlSZXNwb25zZUlkLnNldChjb250ZXh0LmVsZW1lbnQuaWQsIGZpbGVUcmVlRm9jdXNJbmZvLnRyZWVJbmRleCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGZpbGVUcmVlcyA9IHRoaXMuZmlsZVRyZWVzQnlSZXNwb25zZUlkLmdldChjb250ZXh0LmVsZW1lbnQuaWQpID8/IFtdO1xuXHRcdFx0ZmlsZVRyZWVzLnB1c2goZmlsZVRyZWVGb2N1c0luZm8pO1xuXHRcdFx0dGhpcy5maWxlVHJlZXNCeVJlc3BvbnNlSWQuc2V0KGNvbnRleHQuZWxlbWVudC5pZCwgZGlzdGluY3QoZmlsZVRyZWVzLCAodikgPT4gdi50cmVlRGF0YUlkKSk7XG5cdFx0XHR0cmVlUGFydC5hZGREaXNwb3NhYmxlKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmZpbGVUcmVlc0J5UmVzcG9uc2VJZC5zZXQoY29udGV4dC5lbGVtZW50LmlkLCBmaWxlVHJlZXMuZmlsdGVyKHYgPT4gdi50cmVlRGF0YUlkICE9PSBkYXRhLnVyaS50b1N0cmluZygpKSkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJlZVBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck11bHRpRGlmZkRhdGEoY29udGVudDogSUNoYXRNdWx0aURpZmZEYXRhIHwgSUNoYXRNdWx0aURpZmZEYXRhU2VyaWFsaXplZCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0KTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0Y29uc3QgbXVsdGlEaWZmUGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE11bHRpRGlmZkNvbnRlbnRQYXJ0LCBjb250ZW50LCBjb250ZXh0LmVsZW1lbnQpO1xuXHRcdHJldHVybiBtdWx0aURpZmZQYXJ0O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb250ZW50UmVmZXJlbmNlc0xpc3REYXRhKHJlZmVyZW5jZXM6IElDaGF0UmVmZXJlbmNlcywgbGFiZWxPdmVycmlkZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBDaGF0Q29sbGFwc2libGVMaXN0Q29udGVudFBhcnQge1xuXHRcdGNvbnN0IHJlZmVyZW5jZXNQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VXNlZFJlZmVyZW5jZXNMaXN0Q29udGVudFBhcnQsIHJlZmVyZW5jZXMucmVmZXJlbmNlcywgbGFiZWxPdmVycmlkZSwgY29udGV4dCwgdGhpcy5fY29udGVudFJlZmVyZW5jZXNMaXN0UG9vbCwgeyBleHBhbmRlZFdoZW5FbXB0eVJlc3BvbnNlOiBjaGVja01vZGVPcHRpb24odGhpcy5kZWxlZ2F0ZS5jdXJyZW50Q2hhdE1vZGUoKSwgdGhpcy5yZW5kZXJlck9wdGlvbnMucmVmZXJlbmNlc0V4cGFuZGVkV2hlbkVtcHR5UmVzcG9uc2UpIH0pO1xuXG5cdFx0cmV0dXJuIHJlZmVyZW5jZXNQYXJ0O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb2RlQ2l0YXRpb25zKGNpdGF0aW9uczogSUNoYXRDb2RlQ2l0YXRpb25zLCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBDaGF0Q29kZUNpdGF0aW9uQ29udGVudFBhcnQge1xuXHRcdGNvbnN0IGNpdGF0aW9uc1BhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb2RlQ2l0YXRpb25Db250ZW50UGFydCwgY2l0YXRpb25zLCBjb250ZXh0KTtcblx0XHRyZXR1cm4gY2l0YXRpb25zUGFydDtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlUmVuZGVyZWRDb2RlYmxvY2tzKGVsZW1lbnQ6IENoYXRUcmVlSXRlbSwgcGFydDogSUNoYXRDb250ZW50UGFydCwgY29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCFwYXJ0LmFkZERpc3Bvc2FibGUgfHwgcGFydC5jb2RlYmxvY2tzUGFydElkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlQmxvY2tzQnlSZXNwb25zZUlkID0gdGhpcy5jb2RlQmxvY2tzQnlSZXNwb25zZUlkLmdldChlbGVtZW50LmlkKSA/PyBbXTtcblx0XHR0aGlzLmNvZGVCbG9ja3NCeVJlc3BvbnNlSWQuc2V0KGVsZW1lbnQuaWQsIGNvZGVCbG9ja3NCeVJlc3BvbnNlSWQpO1xuXHRcdHBhcnQuYWRkRGlzcG9zYWJsZSh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29kZUJsb2Nrc0J5UmVzcG9uc2VJZCA9IHRoaXMuY29kZUJsb2Nrc0J5UmVzcG9uc2VJZC5nZXQoZWxlbWVudC5pZCk7XG5cdFx0XHRpZiAoY29kZUJsb2Nrc0J5UmVzcG9uc2VJZCkge1xuXHRcdFx0XHQvLyBPbmx5IGRlbGV0ZSBpZiB0aGlzIGlzIG15IGNvZGUgYmxvY2tcblx0XHRcdFx0cGFydC5jb2RlYmxvY2tzPy5mb3JFYWNoKChpbmZvLCBpKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29kZWJsb2NrID0gY29kZUJsb2Nrc0J5UmVzcG9uc2VJZFtjb2RlQmxvY2tTdGFydEluZGV4ICsgaV07XG5cdFx0XHRcdFx0aWYgKGNvZGVibG9jaz8ub3duZXJNYXJrZG93blBhcnRJZCA9PT0gcGFydC5jb2RlYmxvY2tzUGFydElkKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgY29kZUJsb2Nrc0J5UmVzcG9uc2VJZFtjb2RlQmxvY2tTdGFydEluZGV4ICsgaV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRwYXJ0LmNvZGVibG9ja3M/LmZvckVhY2goKGluZm8sIGkpID0+IHtcblx0XHRcdGNvZGVCbG9ja3NCeVJlc3BvbnNlSWRbY29kZUJsb2NrU3RhcnRJbmRleCArIGldID0gaW5mbztcblxuXHRcdFx0Y29uc3QgdXJpID0gaW5mby51cmk7XG5cdFx0XHRpZiAodXJpKSB7XG5cdFx0XHRcdHRoaXMuY29kZUJsb2Nrc0J5RWRpdG9yVXJpLnNldCh1cmksIGluZm8pO1xuXHRcdFx0XHRwYXJ0LmFkZERpc3Bvc2FibGUhKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29kZWJsb2NrID0gdGhpcy5jb2RlQmxvY2tzQnlFZGl0b3JVcmkuZ2V0KHVyaSk7XG5cdFx0XHRcdFx0aWYgKGNvZGVibG9jaz8ub3duZXJNYXJrZG93blBhcnRJZCA9PT0gcGFydC5jb2RlYmxvY2tzUGFydElkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNvZGVCbG9ja3NCeUVkaXRvclVyaS5kZWxldGUodXJpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUb29sSW52b2NhdGlvbih0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBTa2lwIHJlbmRlcmluZyBjb21wbGV0ZWQgdG9vbCBpbnZvY2F0aW9ucyB0aGF0IGFyZSBoaWRkZW4gYW5kIGhhdmUgbm8gbWVhbmluZ2Z1bCBjb250ZW50IC0gaWUsIGF1dG9waWxvdCBcInRhc2sgY29tcGxldGVcIi5cblx0XHQvLyBXZSBpbnRlbnRpb25hbGx5IG9ubHkgc2hvcnQtY2lyY3VpdCB3aGVuIHRoZSBpbnZvY2F0aW9uJ3MgcHJlc2VudGF0aW9uIGlzIGhpZGRlbiwgb3RoZXJ3aXNlIGV4dGVuc2lvbi1jb250cmlidXRlZFxuXHRcdC8vIHRvb2xzIHRoYXQgZG9uJ3Qgc3VwcGx5IGEgYHBhc3RUZW5zZU1lc3NhZ2VgIChwcm9wb3NlZCBBUEkpIGdldCBmaWx0ZXJlZCBvdXQgaW5jb3JyZWN0bHkuXG5cdFx0aWYgKElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbikgJiYgSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0Y29uc3QgbXNnID0gdG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA/PyB0b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZTtcblx0XHRcdGNvbnN0IHRleHQgPSB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZz8udmFsdWU7XG5cdFx0XHRpZiAoIXRleHQgfHwgdGV4dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudCgob3RoZXIpID0+XG5cdFx0XHRcdFx0KG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgb3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIG90aGVyLnRvb2xDYWxsSWQgPT09IHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Q29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZT4oJ2NoYXQuYWdlbnQudGhpbmtpbmcuY29sbGFwc2VkVG9vbHMnKSA9PT0gQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5PZmYpIHtcblx0XHRcdHRoaXMuZmluYWxpemVDdXJyZW50VGhpbmtpbmdQYXJ0KGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZUJsb2NrU3RhcnRJbmRleCA9IGNvbnRleHQuY29kZUJsb2NrU3RhcnRJbmRleDtcblxuXHRcdC8vIEZhY3RvcnkgdGhhdCBjcmVhdGVzIHRoZSB0b29sIGludm9jYXRpb24gcGFydCB3aXRoIGFsbCBuZWNlc3Nhcnkgc2V0dXBcblx0XHRsZXQgbGF6aWx5Q3JlYXRlZFBhcnQ6IENoYXRUb29sSW52b2NhdGlvblBhcnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY3JlYXRlVG9vbFBhcnQgPSAoKTogeyBkb21Ob2RlOiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZTogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydDsgcGFydDogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB9ID0+IHtcblx0XHRcdGxhemlseUNyZWF0ZWRQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VG9vbEludm9jYXRpb25QYXJ0LCB0b29sSW52b2NhdGlvbiwgY29udGV4dCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsIHRoaXMuX2NvbnRlbnRSZWZlcmVuY2VzTGlzdFBvb2wsIHRoaXMuX3Rvb2xFZGl0b3JQb29sLCAoKSA9PiB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCksIHRoaXMuX2Fubm91bmNlZFRvb2xQcm9ncmVzc0tleXMsIGNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdFx0dGhpcy5oYW5kbGVSZW5kZXJlZENvZGVibG9ja3MoY29udGV4dC5lbGVtZW50LCBsYXppbHlDcmVhdGVkUGFydCwgY29kZUJsb2NrU3RhcnRJbmRleCk7XG5cdFx0XHRyZXR1cm4geyBkb21Ob2RlOiBsYXppbHlDcmVhdGVkUGFydC5kb21Ob2RlLCBkaXNwb3NhYmxlOiBsYXppbHlDcmVhdGVkUGFydCwgcGFydDogbGF6aWx5Q3JlYXRlZFBhcnQgfTtcblx0XHR9O1xuXG5cdFx0Ly8gaGFuZGxpbmcgZm9yIHdoZW4gd2Ugd2FudCB0byBwdXQgdG9vbCBpbnZvY2F0aW9ucyBpbnNpZGUgYSB0aGlua2luZyBwYXJ0XG5cdFx0Y29uc3QgY29sbGFwc2VkVG9vbHNNb2RlID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGU+KCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJyk7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNvbGxhcHNlZFRvb2xzTW9kZSAhPT0gQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5PZmYpIHtcblx0XHRcdGNvbnN0IHsgcGFydDogbGFzdFRoaW5raW5nLCBzZXBhcmF0ZWRGcm9tUmVhc29uaW5nIH0gPSB0aGlzLmdldExhc3RUaGlua2luZ1BhcnRGb3JHcm91cGVkSXRlbShjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0XHQvLyBjcmVhdGUgdGhpbmtpbmcgcGFydCBpZiBpdCBkb2Vzbid0IGV4aXN0IHlldFxuXHRcdFx0aWYgKCFsYXN0VGhpbmtpbmcgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNFZmZlY3RpdmVseUhpZGRlbih0b29sSW52b2NhdGlvbikgJiYgdGhpcy5zaG91bGRQaW5QYXJ0KHRvb2xJbnZvY2F0aW9uLCBjb250ZXh0LmVsZW1lbnQpICYmIHNob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQoY29sbGFwc2VkVG9vbHNNb2RlLCBzZXBhcmF0ZWRGcm9tUmVhc29uaW5nKSkge1xuXHRcdFx0XHRjb25zdCB0aGlua2luZ1BhcnQgPSB0aGlzLnJlbmRlclRoaW5raW5nUGFydCh7XG5cdFx0XHRcdFx0a2luZDogJ3RoaW5raW5nJyxcblx0XHRcdFx0fSwgY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdFx0XHRpZiAodGhpbmtpbmdQYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQpIHtcblx0XHRcdFx0XHQvLyBBcHBlbmQgdXNpbmcgZmFjdG9yeSAtIHRoaW5raW5nIHBhcnQgZGVjaWRlcyB3aGV0aGVyIHRvIHJlbmRlciBsYXppbHlcblx0XHRcdFx0XHR0b29sSW52b2NhdGlvbi5pc0F0dGFjaGVkVG9UaGlua2luZyA9IHRydWU7XG5cdFx0XHRcdFx0dGhpbmtpbmdQYXJ0LmFwcGVuZEl0ZW0oY3JlYXRlVG9vbFBhcnQsIHRvb2xJbnZvY2F0aW9uLnRvb2xJZCwgdG9vbEludm9jYXRpb24sIHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0XHRcdFx0dGhpcy5zZXR1cENvbmZpcm1hdGlvblRyYW5zaXRpb25XYXRjaGVyKHRvb2xJbnZvY2F0aW9uLCB0aGlua2luZ1BhcnQsICgpID0+IGxhemlseUNyZWF0ZWRQYXJ0LCBjcmVhdGVUb29sUGFydCwgY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB0aGlua2luZ1BhcnQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnNob3VsZFBpblBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQuZWxlbWVudCkpIHtcblx0XHRcdFx0aWYgKGxhc3RUaGlua2luZyAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRcdC8vIEFwcGVuZCB1c2luZyBmYWN0b3J5IC0gdGhpbmtpbmcgcGFydCBkZWNpZGVzIHdoZXRoZXIgdG8gcmVuZGVyIGxhemlseVxuXHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLmlzQXR0YWNoZWRUb1RoaW5raW5nID0gdHJ1ZTtcblx0XHRcdFx0XHRsYXN0VGhpbmtpbmcuYXBwZW5kSXRlbShjcmVhdGVUb29sUGFydCwgdG9vbEludm9jYXRpb24udG9vbElkLCB0b29sSW52b2NhdGlvbiwgdGVtcGxhdGVEYXRhLnZhbHVlKTtcblx0XHRcdFx0XHR0aGlzLnNldHVwQ29uZmlybWF0aW9uVHJhbnNpdGlvbldhdGNoZXIodG9vbEludm9jYXRpb24sIGxhc3RUaGlua2luZywgKCkgPT4gbGF6aWx5Q3JlYXRlZFBhcnQsIGNyZWF0ZVRvb2xQYXJ0LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudCgob3RoZXIsIGZvbGxvd2luZ0NvbnRlbnQsIGVsZW1lbnQpID0+IGxhemlseUNyZWF0ZWRQYXJ0ID9cblx0XHRcdFx0XHRcdGxhemlseUNyZWF0ZWRQYXJ0Lmhhc1NhbWVDb250ZW50KG90aGVyLCBmb2xsb3dpbmdDb250ZW50LCBlbGVtZW50KSA6XG5cdFx0XHRcdFx0XHR0b29sSW52b2NhdGlvbi5raW5kID09PSBvdGhlci5raW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5maW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBmb3Igc3ViYWdlbnQgZ3JvdXBpbmcgYmVmb3JlIGNyZWF0aW5nIHRvb2wgcGFydCAtIHN1YmFnZW50IHBhcnQgaGFuZGxlcyBsYXp5IGNyZWF0aW9uXG5cdFx0Y29uc3Qgc3ViYWdlbnRJZCA9IGdldFN1YmFnZW50SWQodG9vbEludm9jYXRpb24pO1xuXHRcdGlmIChzdWJhZ2VudElkICYmIGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzRWZmZWN0aXZlbHlIaWRkZW4odG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5oYW5kbGVTdWJhZ2VudFRvb2xHcm91cGluZyh0b29sSW52b2NhdGlvbiwgc3ViYWdlbnRJZCwgY29udGV4dCwgdGVtcGxhdGVEYXRhLCBjb2RlQmxvY2tTdGFydEluZGV4KTtcblx0XHR9XG5cblx0XHQvLyBGb3IgY2FzZXMgbm90IGhhbmRsZWQgYWJvdmUgKG5vIHRoaW5raW5nIHBhcnQsIG5vIHN1YmFnZW50LCBldGMuKSwgY3JlYXRlIHRoZSBwYXJ0IG5vd1xuXHRcdGNvbnN0IHsgcGFydCB9ID0gY3JlYXRlVG9vbFBhcnQoKTtcblx0XHQvLyBXYXRjaCBmb3IgZnV0dXJlIGNvbmZpcm1hdGlvbiB0cmFuc2l0aW9ucyBhbmQgcm91dGUgdG8gY2Fyb3VzZWxcblx0XHRpZiAodGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkgJiZcblx0XHRcdHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiZcblx0XHRcdHRvb2xJbnZvY2F0aW9uLnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJiAhdGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdGNvbnN0IGZhY3RvcnkgPSAodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbikgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRDaGF0VG9vbEludm9jYXRpb25QYXJ0LCB0b29sLCBjb250ZXh0LFxuXHRcdFx0XHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCB0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLFxuXHRcdFx0XHRcdHRoaXMuX3Rvb2xFZGl0b3JQb29sLCAoKSA9PiB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCksXG5cdFx0XHRcdFx0dGhpcy5fYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cyxcblx0XHRcdFx0XHRjb2RlQmxvY2tTdGFydEluZGV4XG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IHJvdXRlUGFydFRvQ2Fyb3VzZWwgPSAoKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRcdFx0d2lkZ2V0LmlucHV0UGFydC5hZGRUb29sVG9Db25maXJtYXRpb25DYXJvdXNlbCh0b29sSW52b2NhdGlvbiwgZmFjdG9yeSk7XG5cdFx0XHRcdFx0ZG9tLmhpZGUocGFydC5kb21Ob2RlKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fTtcblx0XHRcdFx0bGV0IGhhc1NjaGVkdWxlZENhcm91c2VsUm91dGUgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3Qgc2NoZWR1bGVSb3V0ZVBhcnRUb0Nhcm91c2VsID0gKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChoYXNTY2hlZHVsZWRDYXJvdXNlbFJvdXRlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aGFzU2NoZWR1bGVkQ2Fyb3VzZWxSb3V0ZSA9IHRydWU7XG5cdFx0XHRcdFx0cGFydC5hZGREaXNwb3NhYmxlKGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3cocGFydC5kb21Ob2RlKSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aGFzU2NoZWR1bGVkQ2Fyb3VzZWxSb3V0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uICYmIHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSAmJlxuXHRcdFx0XHRcdFx0XHR0b29sSW52b2NhdGlvbi5wcmVzZW50YXRpb24gIT09ICdoaWRkZW4nICYmXG5cdFx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJlxuXHRcdFx0XHRcdFx0XHQhdGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdFx0XHRcdFx0cm91dGVQYXJ0VG9DYXJvdXNlbCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0cGFydC5hZGREaXNwb3NhYmxlKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRjb25zdCBpc0Nhcm91c2VsQ29uZmlybWF0aW9uID0gc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJlxuXHRcdFx0XHRcdFx0ISFzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUgJiZcblx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiAhPT0gJ2hpZGRlbicgJiZcblx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJlxuXHRcdFx0XHRcdFx0IXRoaXMudmlld01vZGVsPy5lZGl0aW5nO1xuXG5cdFx0XHRcdFx0aWYgKGlzQ2Fyb3VzZWxDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHRcdGlmICghcm91dGVQYXJ0VG9DYXJvdXNlbCgpKSB7XG5cdFx0XHRcdFx0XHRcdGRvbS5oaWRlKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdFx0XHRcdHNjaGVkdWxlUm91dGVQYXJ0VG9DYXJvdXNlbCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKHRvb2xJbnZvY2F0aW9uLCByZWFkZXIpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0ZvclBlbmRpbmdDb25maXJtYXRpb25zKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdFx0XHRkb20uaGlkZShwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0ZvclBlbmRpbmdDb25maXJtYXRpb25zKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdFx0XHRkb20uc2hvdyhwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0Ly8gd2F0Y2ggZm9yIGNvbmZpcm1hdGlvbiBwYXJ0IHRyYW5zaXRpb24gd2hlbiB0b29sIGludm9jYXRpb24gaXMgc3RyZWFtaW5nXG5cdHByaXZhdGUgc2V0dXBDb25maXJtYXRpb25UcmFuc2l0aW9uV2F0Y2hlcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLFxuXHRcdHRoaW5raW5nUGFydDogQ2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0Z2V0Q3JlYXRlZFBhcnQ6ICgpID0+IENoYXRUb29sSW52b2NhdGlvblBhcnQgfCB1bmRlZmluZWQsXG5cdFx0Y3JlYXRlVG9vbFBhcnQ6ICgpID0+IHsgZG9tTm9kZTogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU6IENoYXRUb29sSW52b2NhdGlvblBhcnQ7IHBhcnQ6IENoYXRUb29sSW52b2NhdGlvblBhcnQgfSxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHR0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZVxuXHQpOiB2b2lkIHtcblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vdmVDb25maXJtYXRpb25XaWRnZXRPdXRPZlRoaW5raW5nID0gKCk6IENoYXRUb29sSW52b2NhdGlvblBhcnQgPT4ge1xuXHRcdFx0Y29uc3QgY3JlYXRlZFBhcnQgPSBnZXRDcmVhdGVkUGFydCgpO1xuXHRcdFx0dG9vbEludm9jYXRpb24uaXNBdHRhY2hlZFRvVGhpbmtpbmcgPSBmYWxzZTtcblx0XHRcdGxldCBwYXJ0OiBDaGF0VG9vbEludm9jYXRpb25QYXJ0O1xuXHRcdFx0aWYgKGNyZWF0ZWRQYXJ0Py5kb21Ob2RlKSB7XG5cdFx0XHRcdHBhcnQgPSBjcmVhdGVkUGFydDtcblx0XHRcdFx0Y29uc3Qgd3JhcHBlciA9IGNyZWF0ZWRQYXJ0LmRvbU5vZGUucGFyZW50RWxlbWVudDtcblx0XHRcdFx0aWYgKHdyYXBwZXI/LmNsYXNzTGlzdC5jb250YWlucygnY2hhdC10aGlua2luZy10b29sLXdyYXBwZXInKSkge1xuXHRcdFx0XHRcdHdyYXBwZXIucmVtb3ZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmFwcGVuZENoaWxkKGNyZWF0ZWRQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHQvLyBEZWNyZW1lbnQgdGhpbmtpbmcgcGFydCBjb3VudGVycyBmb3IgdGhlIG1hdGVyaWFsaXplZCBpdGVtIHRoYXQgd2FzIG1vdmVkIG91dC5cblx0XHRcdFx0Ly8gcmVtb3ZlTWF0ZXJpYWxpemVkSXRlbSBkZXRhY2hlcyB0aGUgcGFydCBmcm9tIHRoZSB0aGlua2luZyBwYXJ0J3Mgb3duZXJzaGlwXG5cdFx0XHRcdC8vIHdpdGhvdXQgZGlzcG9zaW5nIGl0LCBzbyB0cmFuc2ZlciBvd25lcnNoaXAgdG8gdGhlIHRlbXBsYXRlJ3MgbW92ZWQtb3V0XG5cdFx0XHRcdC8vIHN0b3JlIHdoaWNoIHNoYXJlcyB0aGUgbGlmZWN5Y2xlIG9mIGByZW5kZXJlZFBhcnRzYC5cblx0XHRcdFx0dGhpbmtpbmdQYXJ0LnJlbW92ZU1hdGVyaWFsaXplZEl0ZW0odG9vbEludm9jYXRpb24udG9vbENhbGxJZCk7XG5cdFx0XHRcdCh0ZW1wbGF0ZURhdGEubW92ZWRPdXRUb29sUGFydHMgPz89IG5ldyBEaXNwb3NhYmxlTWFwKCkpLnNldCh0b29sSW52b2NhdGlvbi50b29sQ2FsbElkLCBjcmVhdGVkUGFydCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlua2luZ1BhcnQucmVtb3ZlTGF6eUl0ZW0odG9vbEludm9jYXRpb24udG9vbElkKTtcblx0XHRcdFx0Y29uc3QgeyBkb21Ob2RlLCBwYXJ0OiBjcmVhdGVkUGFydCB9ID0gY3JlYXRlVG9vbFBhcnQoKTtcblx0XHRcdFx0cGFydCA9IGNyZWF0ZWRQYXJ0O1xuXHRcdFx0XHQodGVtcGxhdGVEYXRhLm1vdmVkT3V0VG9vbFBhcnRzID8/PSBuZXcgRGlzcG9zYWJsZU1hcCgpKS5zZXQodG9vbEludm9jYXRpb24udG9vbENhbGxJZCwgY3JlYXRlZFBhcnQpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEudmFsdWUuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0XHQvLyBpZiB0aGUgdGhpbmtpbmcgcGFydCBpcyBub3cgY29tcGxldGVseSBlbXB0eSAobm8gdG9vbHMsIG5vIHRoaW5raW5nIHRleHQpXG5cdFx0XHRpZiAodGhpbmtpbmdQYXJ0LmlzRWZmZWN0aXZlbHlFbXB0eSgpKSB7XG5cdFx0XHRcdHRoaW5raW5nUGFydC5kb21Ob2RlPy5yZW1vdmUoKTtcblx0XHRcdFx0dGhpbmtpbmdQYXJ0LmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGlzV29ya2luZ1N0YXRlID0gKHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kKSA9PlxuXHRcdFx0dHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nIHx8IHR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZztcblxuXHRcdGNvbnN0IHRyeVJvdXRlQ29uZmlybWF0aW9uVG9DYXJvdXNlbCA9ICgpOiBib29sZWFuID0+IHtcblx0XHRcdGlmICghdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkgfHxcblx0XHRcdFx0IWlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpIHx8XG5cdFx0XHRcdHRoaXMudmlld01vZGVsPy5lZGl0aW5nIHx8XG5cdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9PT0gJ2hpZGRlbicgfHxcblx0XHRcdFx0dG9vbEludm9jYXRpb24uc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uIHx8ICFzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXJ0ID0gbW92ZUNvbmZpcm1hdGlvbldpZGdldE91dE9mVGhpbmtpbmcoKTtcblx0XHRcdGNvbnN0IGZhY3RvcnkgPSAodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbikgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgdG9vbCwgY29udGV4dCxcblx0XHRcdFx0dGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsIHRoaXMuX2NvbnRlbnRSZWZlcmVuY2VzTGlzdFBvb2wsXG5cdFx0XHRcdHRoaXMuX3Rvb2xFZGl0b3JQb29sLCAoKSA9PiB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCksXG5cdFx0XHRcdHRoaXMuX2Fubm91bmNlZFRvb2xQcm9ncmVzc0tleXMsXG5cdFx0XHRcdGNvbnRleHQuY29kZUJsb2NrU3RhcnRJbmRleFxuXHRcdFx0KTtcblxuXHRcdFx0cGFydC5hZGREaXNwb3NhYmxlKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gJiYgY3VycmVudFN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0XHRcdHdpZGdldC5pbnB1dFBhcnQuYWRkVG9vbFRvQ29uZmlybWF0aW9uQ2Fyb3VzZWwodG9vbEludm9jYXRpb24sIGZhY3RvcnkpO1xuXHRcdFx0XHRcdGRvbS5oaWRlKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKHRvb2xJbnZvY2F0aW9uLCByZWFkZXIpKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVXb3JraW5nUHJvZ3Jlc3NGb3JQZW5kaW5nQ29uZmlybWF0aW9ucyh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRcdGRvbS5oaWRlKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVXb3JraW5nUHJvZ3Jlc3NGb3JQZW5kaW5nQ29uZmlybWF0aW9ucyh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRcdGRvbS5zaG93KHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmICh0b29sSW52b2NhdGlvbkhhc01jcEFwcERhdGEodG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRtb3ZlQ29uZmlybWF0aW9uV2lkZ2V0T3V0T2ZUaGlua2luZygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50U3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0aWYgKCF0cnlSb3V0ZUNvbmZpcm1hdGlvblRvQ2Fyb3VzZWwoKSkge1xuXHRcdFx0XHRtb3ZlQ29uZmlybWF0aW9uV2lkZ2V0T3V0T2ZUaGlua2luZygpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWwpIHtcblx0XHRcdG1vdmVDb25maXJtYXRpb25XaWRnZXRPdXRPZlRoaW5raW5nKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1dvcmtpbmdTdGF0ZShjdXJyZW50U3RhdGUudHlwZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZGlkTW92ZVRvb2xPdXQgPSBmYWxzZTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHR0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhS2luZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodG9vbEludm9jYXRpb25IYXNNY3BBcHBEYXRhKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRpZiAoZGlkTW92ZVRvb2xPdXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlkTW92ZVRvb2xPdXQgPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0bW92ZUNvbmZpcm1hdGlvbldpZGdldE91dE9mVGhpbmtpbmcoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gfHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRpZiAoZGlkTW92ZVRvb2xPdXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlkTW92ZVRvb2xPdXQgPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gfHwgIXRyeVJvdXRlQ29uZmlybWF0aW9uVG9DYXJvdXNlbCgpKSB7XG5cdFx0XHRcdFx0bW92ZUNvbmZpcm1hdGlvbldpZGdldE91dE9mVGhpbmtpbmcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpbmtpbmdQYXJ0LmFkZERpc3Bvc2FibGUoZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckV4dGVuc2lvbnNDb250ZW50KGV4dGVuc2lvbnNDb250ZW50OiBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0LCBleHRlbnNpb25zQ29udGVudCk7XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckhvb2tQYXJ0KGhvb2tQYXJ0OiBJQ2hhdEhvb2tQYXJ0LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRpZiAoIShob29rUGFydC5zdG9wUmVhc29uIHx8IGhvb2tQYXJ0LnN5c3RlbU1lc3NhZ2UpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT4gb3RoZXIua2luZCA9PT0gJ2hvb2snICYmIG90aGVyLmhvb2tUeXBlID09PSBob29rUGFydC5ob29rVHlwZSk7XG5cdFx0fVxuXG5cdFx0aWYgKGhvb2tQYXJ0LnN1YkFnZW50SW52b2NhdGlvbklkKSB7XG5cdFx0XHRjb25zdCBzdWJhZ2VudFBhcnQgPSB0aGlzLmdldFN1YmFnZW50UGFydCh0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cywgaG9va1BhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHRcdFx0aWYgKHN1YmFnZW50UGFydCkge1xuXHRcdFx0XHRzdWJhZ2VudFBhcnQuYXBwZW5kSG9va0l0ZW0oKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIb29rQ29udGVudFBhcnQsIGhvb2tQYXJ0LCBjb250ZXh0KTtcblx0XHRcdFx0XHRyZXR1cm4geyBkb21Ob2RlOiBwYXJ0LmRvbU5vZGUsIGRpc3Bvc2FibGU6IHBhcnQgfTtcblx0XHRcdFx0fSwgaG9va1BhcnQpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT4gb3RoZXIua2luZCA9PT0gJ2hvb2snICYmIG90aGVyLmhvb2tUeXBlID09PSBob29rUGFydC5ob29rVHlwZSAmJiBvdGhlci5zdWJBZ2VudEludm9jYXRpb25JZCA9PT0gaG9va1BhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE9ubHkgcGluIHByZVRvb2wvcG9zdFRvb2wgaG9va3MgaW50byB0aGUgdGhpbmtpbmcgcGFydFxuXHRcdGNvbnN0IHNob3VsZFBpblRvVGhpbmtpbmcgPSBob29rUGFydC5ob29rVHlwZSA9PT0gSG9va1R5cGUuUHJlVG9vbFVzZSB8fCBob29rUGFydC5ob29rVHlwZSA9PT0gSG9va1R5cGUuUG9zdFRvb2xVc2U7XG5cdFx0aWYgKHNob3VsZFBpblRvVGhpbmtpbmcpIHtcblx0XHRcdGNvbnN0IGhvb2tUaXRsZSA9IGhvb2tQYXJ0LnN0b3BSZWFzb25cblx0XHRcdFx0PyAoaG9va1BhcnQudG9vbERpc3BsYXlOYW1lXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnaG9vay50aGlua2luZy5ibG9ja2VkJywgXCJCbG9ja2VkIHswfVwiLCBob29rUGFydC50b29sRGlzcGxheU5hbWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnaG9vay50aGlua2luZy5ibG9ja2VkR2VuZXJpYycsIFwiQmxvY2tlZCBieSBob29rXCIpKVxuXHRcdFx0XHQ6IChob29rUGFydC50b29sRGlzcGxheU5hbWVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdob29rLnRoaW5raW5nLndhcm5pbmcnLCBcIlVzZWQgezB9LCBidXQgcmVjZWl2ZWQgYSB3YXJuaW5nXCIsIGhvb2tQYXJ0LnRvb2xEaXNwbGF5TmFtZSlcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdob29rLnRoaW5raW5nLndhcm5pbmdHZW5lcmljJywgXCJUb29sIGNhbGwgcmVjZWl2ZWQgYSB3YXJuaW5nXCIpKTtcblxuXHRcdFx0bGV0IHsgcGFydDogdGhpbmtpbmdQYXJ0IH0gPSB0aGlzLmdldExhc3RUaGlua2luZ1BhcnRGb3JHcm91cGVkSXRlbShjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0aWYgKCF0aGlua2luZ1BhcnQpIHtcblx0XHRcdFx0Ly8gQ3JlYXRlIGEgdGhpbmtpbmcgcGFydCBpZiBvbmUgZG9lc24ndCBleGlzdCB5ZXQgKGUuZy4gaG9vayBhcnJpdmVzIGJlZm9yZS93aXRoIGl0cyB0b29sIGluIHRoZSBzYW1lIHR1cm4pXG5cdFx0XHRcdGNvbnN0IG5ld1RoaW5raW5nID0gdGhpcy5yZW5kZXJUaGlua2luZ1BhcnQoeyBraW5kOiAndGhpbmtpbmcnIH0sIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdGlmIChuZXdUaGlua2luZyBpbnN0YW5jZW9mIENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0KSB7XG5cdFx0XHRcdFx0dGhpbmtpbmdQYXJ0ID0gbmV3VGhpbmtpbmc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaW5raW5nUGFydCkge1xuXHRcdFx0XHR0aGlua2luZ1BhcnQuYXBwZW5kSXRlbSgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhvb2tDb250ZW50UGFydCwgaG9va1BhcnQsIGNvbnRleHQpO1xuXHRcdFx0XHRcdHJldHVybiB7IGRvbU5vZGU6IHBhcnQuZG9tTm9kZSwgZGlzcG9zYWJsZTogcGFydCB9O1xuXHRcdFx0XHR9LCBob29rVGl0bGUsIHVuZGVmaW5lZCwgdGVtcGxhdGVEYXRhLnZhbHVlKTtcblx0XHRcdFx0cmV0dXJuIHRoaW5raW5nUGFydDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SG9va0NvbnRlbnRQYXJ0LCBob29rUGFydCwgY29udGV4dCk7XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclB1bGxSZXF1ZXN0Q29udGVudChwdWxsUmVxdWVzdENvbnRlbnQ6IElDaGF0UHVsbFJlcXVlc3RDb250ZW50LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UHVsbFJlcXVlc3RDb250ZW50UGFydCwgcHVsbFJlcXVlc3RDb250ZW50KTtcblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUHJvZ3Jlc3NUYXNrKHRhc2s6IElDaGF0VGFzayB8IElDaGF0VGFza1NlcmlhbGl6ZWQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCk6IElDaGF0Q29udGVudFBhcnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0Y29uc3QgdGFza1BhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUYXNrQ29udGVudFBhcnQsIHRhc2ssIHRoaXMuX2NvbnRlbnRSZWZlcmVuY2VzTGlzdFBvb2wsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCBjb250ZXh0KTtcblx0XHRyZXR1cm4gdGFza1BhcnQ7XG5cdH1cblxuXG5cdHByaXZhdGUgcmVuZGVyQ29uZmlybWF0aW9uKGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBjb25maXJtYXRpb246IElDaGF0Q29uZmlybWF0aW9uLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdGNvbnN0IHBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb25maXJtYXRpb25Db250ZW50UGFydCwgY29uZmlybWF0aW9uLCBjb250ZXh0KTtcblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRWxpY2l0YXRpb24oY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIGVsaWNpdGF0aW9uOiBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdCB8IElDaGF0RWxpY2l0YXRpb25SZXF1ZXN0U2VyaWFsaXplZCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRpZiAoZWxpY2l0YXRpb24ua2luZCA9PT0gJ2VsaWNpdGF0aW9uU2VyaWFsaXplZCcgPyBlbGljaXRhdGlvbi5pc0hpZGRlbiA6IGVsaWNpdGF0aW9uLmlzSGlkZGVuPy5nZXQoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KG90aGVyID0+IGVsaWNpdGF0aW9uLmtpbmQgPT09IG90aGVyLmtpbmQpO1xuXHRcdH1cblxuXHRcdHRoaXMuZmluYWxpemVDdXJyZW50VGhpbmtpbmdQYXJ0KGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWxpY2l0YXRpb25Db250ZW50UGFydCwgZWxpY2l0YXRpb24sIGNvbnRleHQpO1xuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJRdWVzdGlvbkNhcm91c2VsKGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBjYXJvdXNlbDogSUNoYXRRdWVzdGlvbkNhcm91c2VsLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdHRoaXMuZmluYWxpemVDdXJyZW50VGhpbmtpbmdQYXJ0KGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0dGhpcy5fbm90aWZ5T25RdWVzdGlvbkNhcm91c2VsKGNvbnRleHQsIGNhcm91c2VsKTtcblxuXHRcdC8vIEJhY2tmaWxsIHRlcm1pbmFsIGNvcnJlbGF0aW9uIG9uIHRoZSBjYXJvdXNlbCBmcm9tIHRoZSBvcmlnaW5hdGluZyByZXF1ZXN0LlxuXHRcdC8vIFRoaXMga2VlcHMgZm9jdXMgYnV0dG9uIC8gc2VuZF90b190ZXJtaW5hbCBjb3JyZWxhdGlvbiB3b3JraW5nIGV2ZW4gd2hlblxuXHRcdC8vIGFza1F1ZXN0aW9ucyBjb3VsZG4ndCBzdGFtcCB0ZXJtaW5hbElkIGR1cmluZyB0b29sIGV4ZWN1dGlvbi5cblx0XHRpZiAoIWNhcm91c2VsLnRlcm1pbmFsSWQgJiYgaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlRWxlbWVudCA9IGNvbnRleHQuZWxlbWVudDtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHJlc3BvbnNlRWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IG1vZGVsPy5nZXRSZXF1ZXN0cygpLmZpbmQociA9PiByLmlkID09PSByZXNwb25zZUVsZW1lbnQucmVxdWVzdElkKTtcblx0XHRcdGlmIChyZXF1ZXN0Py50ZXJtaW5hbEV4ZWN1dGlvbklkKSB7XG5cdFx0XHRcdGNhcm91c2VsLnRlcm1pbmFsSWQgPSByZXF1ZXN0LnRlcm1pbmFsRXhlY3V0aW9uSWQ7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hhdExpc3RJdGVtUmVuZGVyZXIjcmVuZGVyUXVlc3Rpb25DYXJvdXNlbDogYmFja2ZpbGxlZCB0ZXJtaW5hbElkPSR7Y2Fyb3VzZWwudGVybWluYWxJZH0gZm9yIHJlcXVlc3Q9JHtyZXNwb25zZUVsZW1lbnQucmVxdWVzdElkfWApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBDaGF0TGlzdEl0ZW1SZW5kZXJlciNyZW5kZXJRdWVzdGlvbkNhcm91c2VsOiBubyB0ZXJtaW5hbEV4ZWN1dGlvbklkIHRvIGJhY2tmaWxsIGZvciByZXF1ZXN0PSR7cmVzcG9uc2VFbGVtZW50LnJlcXVlc3RJZH1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXQgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSA/IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0Ly8gT25seSBhdXRvLWZvY3VzIGlmIHRoZSBjaGF0IGlucHV0IGlzIGVtcHR5IEFORCBmb2N1cyBpcyBhbHJlYWR5IHdpdGhpbiB0aGUgY2hhdCB3aWRnZXRcblx0XHQvLyBUaGlzIHByZXZlbnRzIHN0ZWFsaW5nIGZvY3VzIGZyb20gb3RoZXIgVlMgQ29kZSBVSSAoZWRpdG9yLCB0ZXJtaW5hbCwgZXRjLilcblx0XHRjb25zdCBzaG91bGRBdXRvRm9jdXMgPSAhIXdpZGdldCAmJiBkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh3aWRnZXQuZG9tTm9kZSkgJiYgd2lkZ2V0LmdldElucHV0KCkgPT09ICcnO1xuXHRcdGNvbnN0IHJlc3BvbnNlSWQgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSA/IGNvbnRleHQuZWxlbWVudC5yZXF1ZXN0SWQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2Fyb3VzZWxLZXkgPSBjYXJvdXNlbC5yZXNvbHZlSWQgPz8gYCR7cmVzcG9uc2VJZCA/PyAnJ31fJHtjb250ZXh0LmNvbnRlbnRJbmRleH1gO1xuXG5cdFx0Y29uc3QgaGFuZGxlU3VibWl0ID0gYXN5bmMgKGFuc3dlcnM6IE1hcDxzdHJpbmcsIElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZT4gfCB1bmRlZmluZWQsIHBhcnQ6IENoYXRRdWVzdGlvbkNhcm91c2VsUGFydCkgPT4ge1xuXHRcdFx0aWYgKGNhcm91c2VsLmlzVXNlZCkge1xuXHRcdFx0XHQvLyBWb2ljZSBjYW4gYW5zd2VyIHRoZSBzYW1lIGZvcm0sIHNvIGEgcXVldWVkIGNsaWNrIG1heSBsYW5kIGFmdGVyIGl0XG5cdFx0XHRcdC8vIGhhcyBiZWVuIHN1Ym1pdHRlZC4gQXBwbHlpbmcgaXQgd291bGQgcmVwbGFjZSB0aGUgc3Bva2VuIGFuc3dlciBhbmRcblx0XHRcdFx0Ly8gbm90aWZ5IHRoZSBleHRlbnNpb24gdHdpY2UuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIE1hcmsgdGhlIGNhcm91c2VsIGFzIHVzZWQgYW5kIHN0b3JlIHRoZSBhbnN3ZXJzXG5cdFx0XHRjb25zdCBhbnN3ZXJzUmVjb3JkOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCA9IGFuc3dlcnMgPyBPYmplY3QuZnJvbUVudHJpZXMoYW5zd2VycykgOiB1bmRlZmluZWQ7XG5cdFx0XHRjYXJvdXNlbC5kYXRhID0gYW5zd2Vyc1JlY29yZCA/PyB7fTtcblx0XHRcdGNhcm91c2VsLmlzVXNlZCA9IHRydWU7XG5cdFx0XHRpZiAoY2Fyb3VzZWwgaW5zdGFuY2VvZiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEpIHtcblx0XHRcdFx0Y2Fyb3VzZWwuZHJhZnRBbnN3ZXJzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjYXJvdXNlbC5kcmFmdEN1cnJlbnRJbmRleCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y2Fyb3VzZWwuY29tcGxldGlvbi5jb21wbGV0ZSh7IGFuc3dlcnM6IGFuc3dlcnNSZWNvcmQgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5vdGlmeSB0aGUgZXh0ZW5zaW9uIGFib3V0IHRoZSBjYXJvdXNlbCBhbnN3ZXJzIHRvIHJlc29sdmUgdGhlIGRlZmVycmVkIHByb21pc2Vcblx0XHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSAmJiBjYXJvdXNlbC5yZXNvbHZlSWQpIHtcblx0XHRcdFx0dGhpcy5jaGF0U2VydmljZS5ub3RpZnlRdWVzdGlvbkNhcm91c2VsQW5zd2VyKGNvbnRleHQuZWxlbWVudC5yZXF1ZXN0SWQsIGNhcm91c2VsLnJlc29sdmVJZCwgYW5zd2Vyc1JlY29yZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbW92ZSBmcm9tIHBlbmRpbmcgY2Fyb3VzZWxzXG5cdFx0XHR0aGlzLnJlbW92ZUNhcm91c2VsRnJvbVRyYWNraW5nKGNvbnRleHQsIHBhcnQpO1xuXG5cdFx0XHQvLyBDbGVhciBmcm9tIGlucHV0IHBhcnQgKGNsZWFyIG9ubHkgdGhlIHN1Ym1pdHRlZCBjYXJvdXNlbCBieSBpdHMga2V5KVxuXHRcdFx0d2lkZ2V0Py5pbnB1dC5jbGVhclF1ZXN0aW9uQ2Fyb3VzZWwodW5kZWZpbmVkLCBjYXJvdXNlbEtleSk7XG5cdFx0fTtcblxuXHRcdC8vIElmIGNhcm91c2VsIGlzIGFscmVhZHkgdXNlZCBvciByZXNwb25zZSBpcyBjb21wbGV0ZS9jYW5jZWxlZCwgcmVuZGVyIHN1bW1hcnkgaW5saW5lIGluIHRoZSBsaXN0XG5cdFx0Y29uc3QgcmVzcG9uc2VJc0NvbXBsZXRlID0gaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY29udGV4dC5lbGVtZW50LmlzQ29tcGxldGU7XG5cdFx0Y29uc3QgaW5wdXRQYXJ0SGFzQ2Fyb3VzZWwgPSB3aWRnZXQ/LmlucHV0LnF1ZXN0aW9uQ2Fyb3VzZWwgIT09IHVuZGVmaW5lZDtcblxuXHRcdGlmIChjYXJvdXNlbC5pc1VzZWQgfHwgcmVzcG9uc2VJc0NvbXBsZXRlKSB7XG5cdFx0XHRpZiAocmVzcG9uc2VJc0NvbXBsZXRlICYmICFjYXJvdXNlbC5pc1VzZWQgJiYgaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY2Fyb3VzZWwucmVzb2x2ZUlkKSB7XG5cdFx0XHRcdGNhcm91c2VsLmRhdGEgPSB7fTtcblx0XHRcdFx0Y2Fyb3VzZWwuaXNVc2VkID0gdHJ1ZTtcblx0XHRcdFx0aWYgKGNhcm91c2VsIGluc3RhbmNlb2YgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKSB7XG5cdFx0XHRcdFx0Y2Fyb3VzZWwuZHJhZnRBbnN3ZXJzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNhcm91c2VsLmRyYWZ0Q3VycmVudEluZGV4ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5jaGF0U2VydmljZS5ub3RpZnlRdWVzdGlvbkNhcm91c2VsQW5zd2VyKGNvbnRleHQuZWxlbWVudC5yZXF1ZXN0SWQsIGNhcm91c2VsLnJlc29sdmVJZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5wZW5kaW5nUXVlc3Rpb25DYXJvdXNlbHMuZ2V0KGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpPy5jbGVhcigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbGVhciB0aGUgY2Fyb3VzZWwgZnJvbSB0aGUgaW5wdXQgYXJlYSBvbmNlIGl0IGhhcyBiZWVuIGFuc3dlcmVkIG9yIHdoZW4gdGhlXG5cdFx0XHQvLyB3aG9sZSByZXNwb25zZSBjb21wbGV0ZXMuIGBjYXJvdXNlbC5pc1VzZWRgIGNvdmVycyBleHRlcm5hbGx5IGNvbXBsZXRlZFxuXHRcdFx0Ly8gZmxvd3MgKGZvciBleGFtcGxlLCBhIHJlbW90ZSBhbnN3ZXIgd2lubmluZyBvdmVyIHRoZSBsb2NhbCBpbnB1dCBVSSkuXG5cdFx0XHRpZiAoaW5wdXRQYXJ0SGFzQ2Fyb3VzZWwpIHtcblx0XHRcdFx0aWYgKGNhcm91c2VsLmlzVXNlZCkge1xuXHRcdFx0XHRcdHdpZGdldD8uaW5wdXQuY2xlYXJRdWVzdGlvbkNhcm91c2VsKHVuZGVmaW5lZCwgY2Fyb3VzZWxLZXkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJlc3BvbnNlSXNDb21wbGV0ZSAmJiByZXNwb25zZUlkKSB7XG5cdFx0XHRcdFx0d2lkZ2V0Py5pbnB1dC5jbGVhclF1ZXN0aW9uQ2Fyb3VzZWwocmVzcG9uc2VJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LCBjYXJvdXNlbCwgY29udGV4dCwge1xuXHRcdFx0XHRzaG91bGRBdXRvRm9jdXM6IGZhbHNlLFxuXHRcdFx0XHRvblN1Ym1pdDogYXN5bmMgKGFuc3dlcnMpID0+IGhhbmRsZVN1Ym1pdChhbnN3ZXJzLCBwYXJ0KVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcGFydDtcblx0XHR9XG5cblx0XHQvLyBSZW5kZXIgdGhlIGFjdGl2ZSBjYXJvdXNlbCBpbiB0aGUgaW5wdXQgcGFydCAoYWJvdmUgdGhlIGlucHV0IGJveCwgbm90IHdoaWxlIGVkaXRpbmcpXG5cdFx0Y29uc3QgaXNFZGl0aW5nID0gISF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZztcblx0XHRjb25zdCBwYXJ0ID0gaXNFZGl0aW5nID8gdW5kZWZpbmVkIDogd2lkZ2V0Py5pbnB1dC5yZW5kZXJRdWVzdGlvbkNhcm91c2VsKGNhcm91c2VsLCBjb250ZXh0LCB7XG5cdFx0XHRzaG91bGRBdXRvRm9jdXMsXG5cdFx0XHRvblN1Ym1pdDogYXN5bmMgKGFuc3dlcnMpID0+IGhhbmRsZVN1Ym1pdChhbnN3ZXJzLCBwYXJ0ISlcblx0XHR9KTtcblxuXHRcdC8vIElmIHdlIGNvdWxkbid0IHJlbmRlciBpbiB0aGUgaW5wdXQgcGFydCwgZmFsbCBiYWNrIHRvIGlubGluZSByZW5kZXJpbmdcblx0XHRpZiAoIXBhcnQpIHtcblx0XHRcdGNvbnN0IGZhbGxiYWNrUGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LCBjYXJvdXNlbCwgY29udGV4dCwge1xuXHRcdFx0XHRzaG91bGRBdXRvRm9jdXMsXG5cdFx0XHRcdG9uU3VibWl0OiBhc3luYyAoYW5zd2VycykgPT4gaGFuZGxlU3VibWl0KGFuc3dlcnMsIGZhbGxiYWNrUGFydClcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGZhbGxiYWNrUGFydDtcblx0XHR9XG5cblx0XHQvLyBUcmFjayB0aGUgY2Fyb3VzZWwgZm9yIGF1dG8tc2tpcCB3aGVuIHVzZXIgc3VibWl0cyBhIG5ldyBtZXNzYWdlXG5cdFx0Ly8gT25seSBhZGQgdHJhY2tpbmcgaWYgbm90IGFscmVhZHkgdHJhY2tlZCAocHJldmVudHMgZHVwbGljYXRlIHRyYWNraW5nIG9uIHJlLXJlbmRlcilcblx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY2Fyb3VzZWwuYWxsb3dTa2lwICYmICFjYXJvdXNlbC5pc1VzZWQpIHtcblx0XHRcdGxldCBjYXJvdXNlbHMgPSB0aGlzLnBlbmRpbmdRdWVzdGlvbkNhcm91c2Vscy5nZXQoY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWNhcm91c2Vscykge1xuXHRcdFx0XHRjYXJvdXNlbHMgPSBuZXcgU2V0KCk7XG5cdFx0XHRcdHRoaXMucGVuZGluZ1F1ZXN0aW9uQ2Fyb3VzZWxzLnNldChjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLCBjYXJvdXNlbHMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFjYXJvdXNlbHMuaGFzKHBhcnQpKSB7XG5cdFx0XHRcdGNhcm91c2Vscy5hZGQocGFydCk7XG5cblx0XHRcdFx0Ly8gQ2xlYW4gdXAgd2hlbiB0aGUgcGFydCBpcyBkaXNwb3NlZFxuXHRcdFx0XHRwYXJ0LmFkZERpc3Bvc2FibGUoeyBkaXNwb3NlOiAoKSA9PiB0aGlzLnJlbW92ZUNhcm91c2VsRnJvbVRyYWNraW5nKGNvbnRleHQsIHBhcnQpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJldHVybiBhIHBsYWNlaG9sZGVyIHRoYXQgd2lsbCByZS1yZW5kZXIgYXMgYSBzdW1tYXJ5IHdoZW4gdGhlIGNhcm91c2VsIGlzIHVzZWQgb3IgcmVzcG9uc2UgaXMgY29tcGxldGUvc3RvcHBlZFxuXHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudCgob3RoZXIsIF9mb2xsb3dpbmdDb250ZW50LCBlbGVtZW50KSA9PiB7XG5cdFx0XHQvLyBSZS1yZW5kZXIgKHJldHVybiBmYWxzZSkgaWY6XG5cdFx0XHQvLyAtIGNhcm91c2VsIHdhcyB1c2VkL3N1Ym1pdHRlZFxuXHRcdFx0Ly8gLSByZXNwb25zZSBpcyBjb21wbGV0ZSAoc3RvcHBlZClcblx0XHRcdGlmIChjYXJvdXNlbC5pc1VzZWQgfHwgKGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiBlbGVtZW50LmlzQ29tcGxldGUpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdC8vIFVzZSByZXNvbHZlSWQgZm9yIGNvbXBhcmlzb24gaW5zdGVhZCBvZiBvYmplY3QgaWRlbnRpdHkgdG8gaGFuZGxlIHJlLXJlbmRlcmluZyBkdXJpbmcgc2Nyb2xsaW5nXG5cdFx0XHRpZiAob3RoZXIua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnKSB7XG5cdFx0XHRcdGNvbnN0IG90aGVyQ2Fyb3VzZWwgPSBvdGhlciBhcyBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWw7XG5cdFx0XHRcdC8vIENvbXBhcmUgYnkgcmVzb2x2ZUlkIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBvYmplY3QgaWRlbnRpdHlcblx0XHRcdFx0aWYgKGNhcm91c2VsLnJlc29sdmVJZCAmJiBvdGhlckNhcm91c2VsLnJlc29sdmVJZCkge1xuXHRcdFx0XHRcdHJldHVybiBjYXJvdXNlbC5yZXNvbHZlSWQgPT09IG90aGVyQ2Fyb3VzZWwucmVzb2x2ZUlkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvdGhlciA9PT0gY2Fyb3VzZWw7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDYXJvdXNlbFN0YWJsZUtleShjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgPyBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkIDogdW5kZWZpbmVkO1xuXHRcdGlmICghcmVxdWVzdElkIHx8ICFjYXJvdXNlbC5yZXNvbHZlSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtyZXF1ZXN0SWR9Ojoke2Nhcm91c2VsLnJlc29sdmVJZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm90aWZ5T25RdWVzdGlvbkNhcm91c2VsKGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBjYXJvdXNlbDogSUNoYXRRdWVzdGlvbkNhcm91c2VsKTogdm9pZCB7XG5cdFx0aWYgKGNhcm91c2VsLmlzVXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgbm90aWZ5IG9uY2UgcGVyIGNhcm91c2VsIHRvIGF2b2lkIGR1cGxpY2F0ZSB0b2FzdHMgb24gcmVyZW5kZXIuXG5cdFx0Ly8gVXNlIGEgc3RhYmxlIGtleSBiYXNlZCBvbiByZXF1ZXN0SWQgKyByZXNvbHZlSWQgaW5zdGVhZCBvZiBvYmplY3QgaWRlbnRpdHkuXG5cdFx0Y29uc3Qgc3RhYmxlS2V5ID0gdGhpcy5fZ2V0Q2Fyb3VzZWxTdGFibGVLZXkoY29udGV4dCwgY2Fyb3VzZWwpO1xuXHRcdGlmIChzdGFibGVLZXkgPyB0aGlzLl9ub3RpZmllZFF1ZXN0aW9uQ2Fyb3VzZWxzLmhhcyhzdGFibGVLZXkpIDogZmFsc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gQWxlcnQgc2NyZWVuIHJlYWRlcnMgd2l0aCB0aGUgcXVlc3Rpb25cblx0XHRjb25zdCBxdWVzdGlvbkNvdW50ID0gY2Fyb3VzZWwucXVlc3Rpb25zLmxlbmd0aDtcblx0XHRjb25zdCBxdWVzdGlvbiA9IGNhcm91c2VsLnF1ZXN0aW9ucy5sZW5ndGggPiAwICYmIGNhcm91c2VsLnF1ZXN0aW9uc1swXS5tZXNzYWdlID8gY2Fyb3VzZWwucXVlc3Rpb25zWzBdLm1lc3NhZ2UgOiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsTmVlZHNJbnB1dFNSJywgXCJDaGF0IGlucHV0IHJlcXVpcmVkLlwiKTtcblx0XHRjb25zdCBzdHJpbmdRdWVzdGlvbiA9IHR5cGVvZiBxdWVzdGlvbiA9PT0gJ3N0cmluZycgPyBxdWVzdGlvbiA6IHF1ZXN0aW9uLnZhbHVlO1xuXHRcdGNvbnN0IGFsZXJ0TWVzc2FnZSA9IHF1ZXN0aW9uQ291bnQgPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucXVlc3Rpb25DYXJvdXNlbEFsZXJ0T25lJywgXCJDaGF0IGlucHV0IHJlcXVpcmVkICgxIHF1ZXN0aW9uKTogezB9XCIsIHN0cmluZ1F1ZXN0aW9uKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsQWxlcnRNYW55JywgXCJDaGF0IGlucHV0IHJlcXVpcmVkICh7MH0gcXVlc3Rpb25zKTogezF9XCIsIHF1ZXN0aW9uQ291bnQsIHN0cmluZ1F1ZXN0aW9uKTtcblx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmFsZXJ0KGFsZXJ0TWVzc2FnZSk7XG5cdFx0aWYgKHN0YWJsZUtleSkge1xuXHRcdFx0dGhpcy5fbm90aWZpZWRRdWVzdGlvbkNhcm91c2Vscy5hZGQoc3RhYmxlS2V5KTtcblx0XHR9XG5cblx0XHQvLyBQbGF5IGFjY2Vzc2liaWxpdHkgc2lnbmFsIHJlZ2FyZGxlc3Mgb2Ygbm90aWZpY2F0aW9uIHNldHRpbmdcblx0XHRjb25zdCBzaWduYWxNZXNzYWdlID0gcXVlc3Rpb25Db3VudCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsU2lnbmFsT25lJywgXCJDaGF0IG5lZWRzIHlvdXIgaW5wdXQgKDEgcXVlc3Rpb24pLlwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsU2lnbmFsTWFueScsIFwiQ2hhdCBuZWVkcyB5b3VyIGlucHV0ICh7MH0gcXVlc3Rpb25zKS5cIiwgcXVlc3Rpb25Db3VudCk7XG5cdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCwgeyBhbGxvd01hbnlJblBhcmFsbGVsOiB0cnVlLCBjdXN0b21BbGVydE1lc3NhZ2U6IHNpZ25hbE1lc3NhZ2UgfSk7XG5cblx0XHQvLyBPUyB0b2FzdCBub3RpZmljYXRpb24gaXMgaGFuZGxlZCBieSBDaGF0V2luZG93Tm90aWZpZXJcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUGxhblJldmlldyhjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgcmV2aWV3OiBJQ2hhdFBsYW5SZXZpZXcsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgPyB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc3BvbnNlSWQgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSA/IGNvbnRleHQuZWxlbWVudC5yZXF1ZXN0SWQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmV2aWV3S2V5ID0gcmV2aWV3LnJlc29sdmVJZCA/PyBgJHtyZXNwb25zZUlkID8/ICcnfV8ke2NvbnRleHQuY29udGVudEluZGV4fWA7XG5cblx0XHQvLyBBIHBlbmRpbmcgcGxhbiByZXZpZXcgYmxvY2tzIHRoZSBhZ2VudCBvbiB1c2VyIGlucHV0LCBzbyBzdG9wIGFueVxuXHRcdC8vIGFjdGl2ZSB0aGlua2luZyBwYXJ0IFx1MjAxNCBwYXJpdHkgd2l0aCBlbGljaXRhdGlvbiAvIHF1ZXN0aW9uIGNhcm91c2VsLlxuXHRcdHRoaXMuZmluYWxpemVDdXJyZW50VGhpbmtpbmdQYXJ0KGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cblx0XHRjb25zdCBoYW5kbGVTdWJtaXQgPSAocmVzdWx0OiBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQpID0+IHtcblx0XHRcdHJldmlldy5kYXRhID0gcmVzdWx0O1xuXHRcdFx0cmV2aWV3LmlzVXNlZCA9IHRydWU7XG5cdFx0XHRpZiAocmV2aWV3IGluc3RhbmNlb2YgQ2hhdFBsYW5SZXZpZXdEYXRhKSB7XG5cdFx0XHRcdHJldmlldy5jb21wbGV0aW9uLmNvbXBsZXRlKHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0XHR3aWRnZXQ/LmlucHV0LmNsZWFyUGxhblJldmlldyh1bmRlZmluZWQsIHJldmlld0tleSk7XG5cdFx0fTtcblxuXHRcdC8vIE9uY2UgdGhlIHJlc3BvbnNlIGlzIGNvbXBsZXRlIHdpdGhvdXQgYSB1c2VyIHJlc3BvbnNlLCBtYXJrIHRoZVxuXHRcdC8vIHJldmlldyBhcyB1c2VkIGFuZCBjbGVhciBhbnkgZG9ja2VkIHdpZGdldC4gVGhpcyBtYXRjaGVzIHRoZVxuXHRcdC8vIG5vLWFuc3dlciBjYW5jZWxsYXRpb24gcGF0aCBpbiBDaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydC5cblx0XHRjb25zdCByZXNwb25zZUlzQ29tcGxldGUgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSAmJiBjb250ZXh0LmVsZW1lbnQuaXNDb21wbGV0ZTtcblx0XHRpZiAocmVzcG9uc2VJc0NvbXBsZXRlICYmICFyZXZpZXcuaXNVc2VkKSB7XG5cdFx0XHRyZXZpZXcuaXNVc2VkID0gdHJ1ZTtcblx0XHRcdGlmIChyZXZpZXcgaW5zdGFuY2VvZiBDaGF0UGxhblJldmlld0RhdGEpIHtcblx0XHRcdFx0cmV2aWV3LmNvbXBsZXRpb24uY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gQWx3YXlzIGNsZWFyIHRoZSBkb2NrZWQgd2lkZ2V0IG9uY2UgdGhlIHJlc3BvbnNlIGlzIGNvbXBsZXRlIFx1MjAxNFxuXHRcdC8vIGBpc1VzZWRgIG1heSBhbHJlYWR5IGJlIHRydWUgaWYgdGhlIHJlc3BvbnNlIHdhcyBjYW5jZWxsZWQgKHNlZVxuXHRcdC8vIGBDaGF0UmVzcG9uc2VNb2RlbC5jYW5jZWwoKWAgXHUyMTkyIGBDaGF0UGxhblJldmlld0RhdGEuZGlzbWlzcygpYCksXG5cdFx0Ly8gaW4gd2hpY2ggY2FzZSB0aGUgYnJhbmNoIGFib3ZlIGlzIHNraXBwZWQgYnV0IHRoZSB3aWRnZXQgYWJvdmVcblx0XHQvLyB0aGUgaW5wdXQgc3RpbGwgbmVlZHMgdG8gZ28uXG5cdFx0aWYgKHJlc3BvbnNlSXNDb21wbGV0ZSAmJiByZXNwb25zZUlkKSB7XG5cdFx0XHR3aWRnZXQ/LmlucHV0LmNsZWFyUGxhblJldmlldyhyZXNwb25zZUlkKTtcblx0XHR9XG5cblx0XHQvLyBCdWlsZCB0aGUgaW5saW5lIHByb2dyZXNzIG1lc3NhZ2UuIFdoaWxlIHBlbmRpbmc6IFwiUGxhbiByZXZpZXdcblx0XHQvLyByZXF1aXJlZFwiIHdpdGggYSBzcGlubmVyLiBPbmNlIGFuc3dlcmVkOiB0aGUgYWN0aW9uIHRoYXQgd2FzXG5cdFx0Ly8gdGFrZW4gKGUuZy4gXCJBcHByb3ZlZCBwbGFuXCIsIFwiUHJvdmlkZWQgZmVlZGJhY2tcIikuIFRoZSBhY3R1YWxcblx0XHQvLyBmZWVkYmFjayB0ZXh0IGlzIHJlbmRlcmVkIGFzIGEgc2VwYXJhdGUgbWFya2Rvd24gYmxvY2sgYmVuZWF0aFxuXHRcdC8vIHJhdGhlciB0aGFuIGNvbGxhcHNlZCBvbnRvIHRoZSBwcm9ncmVzcyBsaW5lLlxuXHRcdGNvbnN0IHJlbmRlclByb2dyZXNzID0gKCk6IElDaGF0Q29udGVudFBhcnQgPT4ge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRoaXMuZ2V0UGxhblJldmlld1Byb2dyZXNzTWVzc2FnZShyZXZpZXcpO1xuXHRcdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBvdGhlci5raW5kID09PSAncGxhblJldmlldycpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ2FwdHVyZSB0aGUgdXNlZCBzdGF0ZSBhdCByZW5kZXIgdGltZS4gYG90aGVyYCBhbmQgYHJldmlld2Bcblx0XHRcdC8vIGFyZSB0eXBpY2FsbHkgdGhlIHNhbWUgbXV0YWJsZSBvYmplY3QsIHNvIGNvbXBhcmluZ1xuXHRcdFx0Ly8gYG90aGVyLmlzVXNlZGAgYWdhaW5zdCBgcmV2aWV3LmlzVXNlZGAgd291bGQgYWx3YXlzIG1hdGNoLlxuXHRcdFx0Ly8gU25hcHNob3R0aW5nIGhlcmUgbGV0cyBgaGFzU2FtZUNvbnRlbnRgIGRldGVjdCB0aGVcblx0XHRcdC8vIHBlbmRpbmcgXHUyMTkyIHVzZWQgdHJhbnNpdGlvbiBhbmQgdHJpZ2dlciBhIHJlLXJlbmRlci5cblx0XHRcdGNvbnN0IHJlbmRlcmVkQXNVc2VkID0gISFyZXZpZXcuaXNVc2VkO1xuXHRcdFx0Y29uc3QgaXNQZW5kaW5nID0gIXJlbmRlcmVkQXNVc2VkO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGJ1aWxkUGxhblJldmlld1Byb2dyZXNzQ29udGVudChyZXZpZXcsIG1lc3NhZ2UpO1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3NQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFByb2dyZXNzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgY29udGVudCB9LFxuXHRcdFx0XHR0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcixcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0LyogZm9yY2VTaG93U3Bpbm5lciAqLyBpc1BlbmRpbmcsXG5cdFx0XHRcdC8qIGZvcmNlU2hvd01lc3NhZ2UgKi8gdHJ1ZSxcblx0XHRcdFx0LyogaWNvbiAqLyBpc1BlbmRpbmcgPyB1bmRlZmluZWQgOiBDb2RpY29uLmNoZWNrLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdC8qIHNoaW1tZXIgKi8gaXNQZW5kaW5nLFxuXHRcdFx0KTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRvbU5vZGU6IHByb2dyZXNzUGFydC5kb21Ob2RlLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBwcm9ncmVzc1BhcnQuZGlzcG9zZSgpLFxuXHRcdFx0XHRoYXNTYW1lQ29udGVudDogKG90aGVyLCBfZm9sbG93aW5nQ29udGVudCwgX2VsZW1lbnQpID0+IHtcblx0XHRcdFx0XHRpZiAob3RoZXIua2luZCAhPT0gJ3BsYW5SZXZpZXcnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFJlLXJlbmRlciB3aGVuIHRoZSB1c2VkIHN0YXRlIGZsaXBzIHNvIHdlIHRyYW5zaXRpb25cblx0XHRcdFx0XHQvLyBmcm9tIFwiUGxhbiByZXZpZXcgcmVxdWlyZWRcIiB0byB0aGUgZmluYWwgYWN0aW9uIGxhYmVsLlxuXHRcdFx0XHRcdGlmICghIXJldmlldy5pc1VzZWQgIT09IHJlbmRlcmVkQXNVc2VkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChyZXZpZXcucmVzb2x2ZUlkICYmIG90aGVyLnJlc29sdmVJZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJldmlldy5yZXNvbHZlSWQgPT09IG90aGVyLnJlc29sdmVJZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG90aGVyID09PSByZXZpZXc7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHQvLyBJZiB0aGUgcmV2aWV3IGhhcyBiZWVuIGFuc3dlcmVkIChvciB0aGUgcmVzcG9uc2UgaXMgY29tcGxldGUpLCB0aGVcblx0XHQvLyBkb2NrZWQgd2lkZ2V0IGlzIGdvbmUuIFJlbmRlciBvbmx5IHRoZSBmaW5hbCBwcm9ncmVzcyBsaW5lLlxuXHRcdGlmIChyZXZpZXcuaXNVc2VkKSB7XG5cdFx0XHRyZXR1cm4gcmVuZGVyUHJvZ3Jlc3MoKTtcblx0XHR9XG5cblx0XHQvLyBEb2NrIHRoZSBhY3RpdmUgcmV2aWV3IGFib3ZlIHRoZSBjaGF0IGlucHV0IChub3Qgd2hpbGUgZWRpdGluZykuXG5cdFx0Y29uc3QgaXNFZGl0aW5nID0gISF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZztcblx0XHRjb25zdCBkb2NrZWRQYXJ0ID0gaXNFZGl0aW5nID8gdW5kZWZpbmVkIDogd2lkZ2V0Py5pbnB1dC5yZW5kZXJQbGFuUmV2aWV3KHJldmlldywgY29udGV4dCwge1xuXHRcdFx0b25TdWJtaXQ6IGhhbmRsZVN1Ym1pdCxcblx0XHR9KTtcblxuXHRcdC8vIElmIHdlIGNvdWxkbid0IGRvY2sgKG5vIHdpZGdldCwgZWRpdGluZywgZXRjLiksIGZhbGwgYmFjayB0byBpbmxpbmUgcmVuZGVyaW5nLlxuXHRcdGlmICghZG9ja2VkUGFydCkge1xuXHRcdFx0Y29uc3QgZmFsbGJhY2tQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UGxhblJldmlld1BhcnQsIHJldmlldywgY29udGV4dCwge1xuXHRcdFx0XHRvblN1Ym1pdDogaGFuZGxlU3VibWl0LFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZmFsbGJhY2tQYXJ0O1xuXHRcdH1cblxuXHRcdHJldHVybiByZW5kZXJQcm9ncmVzcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQbGFuUmV2aWV3UHJvZ3Jlc3NNZXNzYWdlKHJldmlldzogSUNoYXRQbGFuUmV2aWV3KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJldmlldy5pc1VzZWQpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJlcXVpcmVkJywgXCJQbGFuIHJldmlldyByZXF1aXJlZFwiKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gcmV2aWV3LmRhdGE7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQucmVqZWN0ZWQpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LnJlamVjdGVkJywgXCJSZWplY3RlZCBwbGFuXCIpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0LmZlZWRiYWNrKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5mZWVkYmFjaycsIFwiUHJvdmlkZWQgZmVlZGJhY2tcIik7XG5cdFx0fVxuXHRcdGNvbnN0IGFjdGlvbiA9IHJldmlldy5hY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSByZXN1bHQuYWN0aW9uKTtcblx0XHRpZiAoYWN0aW9uPy5wZXJtaXNzaW9uTGV2ZWwgPT09ICdhdXRvcGlsb3QnKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NoYXQucGxhblJldmlldy5hdXRvcGlsb3QnLCBcIlN0YXJ0ZWQgaW1wbGVtZW50YXRpb24gd2l0aCBBdXRvcGlsb3RcIik7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmFwcHJvdmVkJywgXCJBcHByb3ZlZCBwbGFuXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVDYXJvdXNlbEZyb21UcmFja2luZyhjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgcGFydDogQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0KTogdm9pZCB7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbHMgPSB0aGlzLnBlbmRpbmdRdWVzdGlvbkNhcm91c2Vscy5nZXQoY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoY2Fyb3VzZWxzKSB7XG5cdFx0XHRcdGNhcm91c2Vscy5kZWxldGUocGFydCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDaGFuZ2VzU3VtbWFyeShjb250ZW50OiBJQ2hhdENoYW5nZXNTdW1tYXJ5UGFydCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdENoZWNrcG9pbnRGaWxlQ2hhbmdlc1N1bW1hcnlDb250ZW50UGFydCwgY29udGVudCwgY29udGV4dCk7XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclR1cm5QaWxscyhjb250ZW50OiBJQ2hhdFR1cm5QaWxsc1BhcnQsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0KTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFR1cm5QaWxsc0NvbnRlbnRQYXJ0LCBjb250ZW50LCBjb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQXR0YWNobWVudHModmFyaWFibGVzOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10sIGNvbnRlbnRSZWZlcmVuY2VzOiBSZWFkb25seUFycmF5PElDaGF0Q29udGVudFJlZmVyZW5jZT4gfCB1bmRlZmluZWQsIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIHJlc29sdmVkTW9kZWxJZD86IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LCB7XG5cdFx0XHR2YXJpYWJsZXMsXG5cdFx0XHRjb250ZW50UmVmZXJlbmNlcyxcblx0XHRcdG1vZGVsSWQsXG5cdFx0XHRyZXNvbHZlZE1vZGVsSWQsXG5cdFx0XHRkb21Ob2RlOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVGV4dEVkaXQoY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIGNoYXRUZXh0RWRpdDogSUNoYXRUZXh0RWRpdEdyb3VwLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdGNvbnN0IHRleHRFZGl0UGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRleHRFZGl0Q29udGVudFBhcnQsIGNoYXRUZXh0RWRpdCwgY29udGV4dCwgdGhpcy5yZW5kZXJlck9wdGlvbnMsIHRoaXMuX2RpZmZFZGl0b3JQb29sLCB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCkpO1xuXHRcdHJldHVybiB0ZXh0RWRpdFBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckV4dGVybmFsRWRpdChjb250ZW50OiBJQ2hhdEV4dGVybmFsRWRpdCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0Y29uc3QgZWRpdFBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFeHRlcm5hbEVkaXRDb250ZW50UGFydCwgY29udGVudCwgY29udGV4dCk7XG5cblx0XHQvLyBQaW4gdGhlIHBpbGwgaW50byB0aGUgc3Vycm91bmRpbmcgdGhpbmtpbmcgcGFydCBzbyBkaWZmIHN0YXRzIGJ1YmJsZVxuXHRcdC8vIHVwIGludG8gdGhlIHRoaW5raW5nIHRpdGxlLiBUaGUgbGlzdCByZW5kZXJlciBwaW5uaW5nIGxvZ2ljIGFib3ZlXG5cdFx0Ly8gYWxyZWFkeSByb3V0ZXMgZXh0ZXJuYWxFZGl0IGtpbmRzIHRocm91Z2ggdGhpcyBwYXRoLlxuXHRcdGNvbnN0IGNvbGxhcHNlZFRvb2xzTW9kZSA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlPignY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scycpO1xuXHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSAmJiBjb2xsYXBzZWRUb29sc01vZGUgIT09IENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuT2ZmICYmIHRoaXMuc2hvdWxkUGluUGFydChjb250ZW50LCBjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHQvLyBTdGFibGUgaWQgcGVyIHBhcnQgc28gdGhlIHRoaW5raW5nIHBhcnQgY2FuIGRlZHVwIGlmIGl0IHNlZXMgdXMgdHdpY2UuXG5cdFx0XHRjb25zdCBwYXJ0SWQgPSBgZXh0ZXJuYWxFZGl0LSR7Y29udGVudC51cmkudG9TdHJpbmcoKX0tJHtjb250ZW50LnVuZG9TdG9wSWQgPz8gJyd9YDtcblx0XHRcdGNvbnN0IHsgcGFydDogbGFzdFRoaW5raW5nLCBzZXBhcmF0ZWRGcm9tUmVhc29uaW5nIH0gPSB0aGlzLmdldExhc3RUaGlua2luZ1BhcnRGb3JHcm91cGVkSXRlbShjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0aWYgKCFsYXN0VGhpbmtpbmcgJiYgc2hvdWxkQ3JlYXRlR3JvdXBlZFRoaW5raW5nUGFydChjb2xsYXBzZWRUb29sc01vZGUsIHNlcGFyYXRlZEZyb21SZWFzb25pbmcpKSB7XG5cdFx0XHRcdGNvbnN0IHRoaW5raW5nUGFydCA9IHRoaXMucmVuZGVyVGhpbmtpbmdQYXJ0KHsga2luZDogJ3RoaW5raW5nJyB9LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRpZiAodGhpbmtpbmdQYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQpIHtcblx0XHRcdFx0XHQvLyBOZXcgdGhpbmtpbmcgcGFydCBvd25zIHRoZSBlZGl0IHBpbGwgdmlhIGVhZ2VyRGlzcG9zYWJsZS5cblx0XHRcdFx0XHQvLyBXZSByZXR1cm4gdGhlIHRoaW5raW5nIHBhcnQgKG5vdCBlZGl0UGFydCkgc28gcmVuZGVyZWRQYXJ0c1xuXHRcdFx0XHRcdC8vIHN0b3JlcyB0aGUgdGhpbmtpbmcgcGFydCBcdTIwMTQgbm8gZG91YmxlIG93bmVyc2hpcC5cblx0XHRcdFx0XHR0aGlua2luZ1BhcnQuYXBwZW5kSXRlbShcblx0XHRcdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6IGVkaXRQYXJ0LmRvbU5vZGUsIGRpc3Bvc2FibGU6IGVkaXRQYXJ0IH0pLFxuXHRcdFx0XHRcdFx0cGFydElkLFxuXHRcdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZSxcblx0XHRcdFx0XHRcdGVkaXRQYXJ0Lm9uRGlkQ2hhbmdlRGlmZixcblx0XHRcdFx0XHRcdGVkaXRQYXJ0LFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaW5raW5nUGFydDtcblx0XHRcdH1cblx0XHRcdGlmIChsYXN0VGhpbmtpbmcpIHtcblx0XHRcdFx0Ly8gVGhpbmtpbmcgcGFydCB0YWtlcyBvd25lcnNoaXAgdmlhIGVhZ2VyRGlzcG9zYWJsZTsgd2UgcmV0dXJuXG5cdFx0XHRcdC8vIGEgbm8tY29udGVudCBzaGltIHNvIHJlbmRlcmVkUGFydHMgZG9lcyBub3QgYWxzbyBvd24gZWRpdFBhcnRcblx0XHRcdFx0Ly8gKHRoYXQgd291bGQgZG91YmxlLWRpc3Bvc2UpLlxuXHRcdFx0XHRsYXN0VGhpbmtpbmcuYXBwZW5kSXRlbShcblx0XHRcdFx0XHQoKSA9PiAoeyBkb21Ob2RlOiBlZGl0UGFydC5kb21Ob2RlLCBkaXNwb3NhYmxlOiBlZGl0UGFydCB9KSxcblx0XHRcdFx0XHRwYXJ0SWQsXG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEudmFsdWUsXG5cdFx0XHRcdFx0ZWRpdFBhcnQub25EaWRDaGFuZ2VEaWZmLFxuXHRcdFx0XHRcdGVkaXRQYXJ0LFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT4gb3RoZXIua2luZCA9PT0gY29udGVudC5raW5kKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdFBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duKG1hcmtkb3duOiBJQ2hhdE1hcmtkb3duQ29udGVudCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0KTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGNvbnRleHQuZWxlbWVudDtcblx0XHRjb25zdCBpc0JsYW5rTWFya2Rvd24gPSAhbWFya2Rvd24uY29udGVudC52YWx1ZS50cmltKCk7XG5cdFx0Ly8gRG9uJ3QgZmluYWxpemUgdGhpbmtpbmcgaWYgdGhlIG1hcmtkb3duIGhhcyBhbiBpbmNvbXBsZXRlIGNvZGVibG9jayB3aXRoIGFcblx0XHQvLyB2c2NvZGVfY29kZWJsb2NrX3VyaSB0YWcgXHUyMDE0IHRoZSBpc0VkaXQgYW5ub3RhdGlvbiBtYXkgbm90IGhhdmUgYXJyaXZlZCB5ZXQuXG5cdFx0Ly8gT25seSBjaGVjayBjb2RlYmxvY2tzIHRoYXQgY29udGFpbiBhIFVSSSB0YWcgdG8gYXZvaWQgY2F0Y2hpbmcgcmVndWxhciBub24tZWRpdCBjb2RlYmxvY2tzLlxuXHRcdGNvbnN0IGhhc1BlbmRpbmdFZGl0Q29kZWJsb2NrID0gaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmICFlbGVtZW50LmlzQ29tcGxldGVcblx0XHRcdCYmIGhhc0NvZGVibG9ja1VyaVRhZyhtYXJrZG93bi5jb250ZW50LnZhbHVlKVxuXHRcdFx0JiYgIWNvZGVibG9ja0hhc0Nsb3NpbmdCYWNrdGlja3MobWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cdFx0aWYgKCF0aGlzLmhhc0VkaXRDb2RlYmxvY2tVcmkobWFya2Rvd24pICYmICFpc0JsYW5rTWFya2Rvd24gJiYgIWhhc1BlbmRpbmdFZGl0Q29kZWJsb2NrKSB7XG5cdFx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblx0XHRjb25zdCBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zID0gaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmICghZWxlbWVudC5pc0NvbXBsZXRlIHx8IGVsZW1lbnQuaXNDYW5jZWxlZCB8fCBlbGVtZW50LmVycm9yRGV0YWlscz8ucmVzcG9uc2VJc0ZpbHRlcmVkIHx8IGVsZW1lbnQuZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzSW5jb21wbGV0ZSB8fCAhIWVsZW1lbnQucmVuZGVyRGF0YSk7XG5cdFx0Y29uc3QgY29kZUJsb2NrU3RhcnRJbmRleCA9IGNvbnRleHQuY29kZUJsb2NrU3RhcnRJbmRleDtcblx0XHRjb25zdCBtYXJrZG93blBhcnQgPSB0ZW1wbGF0ZURhdGEuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1hcmtkb3duQ29udGVudFBhcnQsIG1hcmtkb3duLCBjb250ZXh0LCB0aGlzLl9lZGl0b3JQb29sLCBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zLCBjb2RlQmxvY2tTdGFydEluZGV4LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlciwgdW5kZWZpbmVkLCB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCksIHsgY29kZUJsb2NrUmVuZGVyT3B0aW9uczogdGhpcy5yZW5kZXJlck9wdGlvbnMuY29kZUJsb2NrUmVuZGVyT3B0aW9ucyB9KTtcblx0XHRtYXJrZG93blBhcnQuYWRkRGlzcG9zYWJsZShtYXJrZG93blBhcnQub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4gdGhpcy5maXJlSXRlbUhlaWdodENoYW5nZSh0ZW1wbGF0ZURhdGEpKSk7XG5cdFx0aWYgKGlzUmVxdWVzdFZNKGVsZW1lbnQpKSB7XG5cdFx0XHRtYXJrZG93blBhcnQuZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0XHRpZiAodGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJykgPT09ICdpbmxpbmUnICYmIHRoaXMucmVuZGVyZXJPcHRpb25zLmVkaXRhYmxlKSB7XG5cdFx0XHRcdG1hcmtkb3duUGFydC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NsaWNrYWJsZScpO1xuXHRcdFx0XHRtYXJrZG93blBhcnQuYWRkRGlzcG9zYWJsZShkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1hcmtkb3duUGFydC5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZz8uaWQgPT09IGVsZW1lbnQuaWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBEb24ndCBoYW5kbGUgY2xpY2tzIG9uIGxpbmtzXG5cdFx0XHRcdFx0Y29uc3QgY2xpY2tlZEVsZW1lbnQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdFx0XHRpZiAoY2xpY2tlZEVsZW1lbnQudGFnTmFtZSA9PT0gJ0EnKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRG9uJ3QgaGFuZGxlIGlmIHRoZXJlJ3MgYSB0ZXh0IHNlbGVjdGlvbiBpbiB0aGUgd2luZG93XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gZG9tLmdldFdpbmRvdyh0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyKS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uICYmICFzZWxlY3Rpb24uaXNDb2xsYXBzZWQgJiYgc2VsZWN0aW9uLnRvU3RyaW5nKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIERvbid0IGhhbmRsZSBpZiB0aGVyZSdzIGEgc2VsZWN0aW9uIGluIGNvZGUgYmxvY2tcblx0XHRcdFx0XHRjb25zdCBtb25hY29FZGl0b3IgPSBkb20uZmluZFBhcmVudFdpdGhDbGFzcyhjbGlja2VkRWxlbWVudCwgJ21vbmFjby1lZGl0b3InKTtcblx0XHRcdFx0XHRpZiAobW9uYWNvRWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlZGl0b3JQYXJ0ID0gQXJyYXkuZnJvbSh0aGlzLmVkaXRvcnNJblVzZSgpKS5maW5kKGVkaXRvciA9PlxuXHRcdFx0XHRcdFx0XHRlZGl0b3IuZWxlbWVudC5jb250YWlucyhtb25hY29FZGl0b3IpKTtcblxuXHRcdFx0XHRcdFx0aWYgKGVkaXRvclBhcnQ/LmVkaXRvci5nZXRTZWxlY3Rpb24oKT8uaXNFbXB0eSgpID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDbGlja1JlcXVlc3QuZmlyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdG1hcmtkb3duUGFydC5hZGREaXNwb3NhYmxlKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIG1hcmtkb3duUGFydC5kb21Ob2RlLCBsb2NhbGl6ZSgncmVxdWVzdE1hcmtkb3duUGFydFRpdGxlJywgXCJDbGljayB0byBFZGl0XCIpLCB7IHRyYXBGb2N1czogdHJ1ZSB9KSk7XG5cdFx0XHR9XG5cdFx0XHRtYXJrZG93blBhcnQuYWRkRGlzcG9zYWJsZShkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1hcmtkb3duUGFydC5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkZPQ1VTLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaG92ZXJWaXNpYmxlKHRlbXBsYXRlRGF0YS5yZXF1ZXN0SG92ZXIpO1xuXHRcdFx0fSkpO1xuXHRcdFx0bWFya2Rvd25QYXJ0LmFkZERpc3Bvc2FibGUoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYXJrZG93blBhcnQuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5CTFVSLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaG92ZXJIaWRkZW4odGVtcGxhdGVEYXRhLnJlcXVlc3RIb3Zlcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5oYW5kbGVSZW5kZXJlZENvZGVibG9ja3MoZWxlbWVudCwgbWFya2Rvd25QYXJ0LCBjb2RlQmxvY2tTdGFydEluZGV4KTtcblxuXHRcdGNvbnN0IGNvbGxhcHNlZFRvb2xzTW9kZSA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlPignY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scycpO1xuXHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSAmJiBjb2xsYXBzZWRUb29sc01vZGUgIT09IENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuT2ZmKSB7XG5cblx0XHRcdC8vIGFwcGVuZCB0byB0aGlua2luZyBwYXJ0IHdoZW4gdGhlIGNvZGVibG9jayBpcyBjb21wbGV0ZVxuXHRcdFx0Y29uc3QgaXNDb21wbGV0ZSA9IHRoaXMuaXNDb2RlYmxvY2tDb21wbGV0ZShtYXJrZG93biwgY29udGV4dC5lbGVtZW50KTtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhpcyBtYXJrZG93biBzaG91bGQgYmUgcm91dGVkIHRvIGEgc3ViYWdlbnQgY29udGVudCBwYXJ0XG5cdFx0XHRjb25zdCBzdWJBZ2VudEludm9jYXRpb25JZCA9IGV4dHJhY3RTdWJBZ2VudEludm9jYXRpb25JZEZyb21UZXh0KG1hcmtkb3duLmNvbnRlbnQudmFsdWUpO1xuXHRcdFx0aWYgKHN1YkFnZW50SW52b2NhdGlvbklkKSB7XG5cdFx0XHRcdGNvbnN0IHN1YmFnZW50UGFydCA9IHRoaXMuZ2V0U3ViYWdlbnRQYXJ0KHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzLCBzdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdFx0XHRcdGlmIChzdWJhZ2VudFBhcnQgJiYgbWFya2Rvd25QYXJ0Py5kb21Ob2RlICYmIGlzQ29tcGxldGUpIHtcblx0XHRcdFx0XHRzdWJhZ2VudFBhcnQuYXBwZW5kTWFya2Rvd25JdGVtKFxuXHRcdFx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogbWFya2Rvd25QYXJ0LmRvbU5vZGUsIGRpc3Bvc2FibGU6IG1hcmtkb3duUGFydCB9KSxcblx0XHRcdFx0XHRcdG1hcmtkb3duUGFydC5jb2RlYmxvY2tzUGFydElkLFxuXHRcdFx0XHRcdFx0bWFya2Rvd24sXG5cdFx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEudmFsdWUsXG5cdFx0XHRcdFx0XHRtYXJrZG93blBhcnQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT5cblx0XHRcdFx0XHRcdG90aGVyLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnXG5cdFx0XHRcdFx0XHQmJiBvdGhlci5jb250ZW50LnZhbHVlID09PSBtYXJrZG93bi5jb250ZW50LnZhbHVlXG5cdFx0XHRcdFx0XHQmJiBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dChvdGhlci5jb250ZW50LnZhbHVlKSA9PT0gc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNob3VsZFBpbiA9IHRoaXMuc2hvdWxkUGluUGFydChtYXJrZG93biwgY29udGV4dC5lbGVtZW50KTtcblx0XHRcdGlmIChtYXJrZG93blBhcnQ/LmRvbU5vZGUgJiYgc2hvdWxkUGluICYmIGlzQ29tcGxldGUpIHtcblx0XHRcdFx0Ly8gY3JlYXRlIHRoaW5raW5nIHBhcnQgaWYgaXQgZG9lc24ndCBleGlzdCB5ZXRcblx0XHRcdFx0Y29uc3QgeyBwYXJ0OiBsYXN0VGhpbmtpbmcsIHNlcGFyYXRlZEZyb21SZWFzb25pbmcgfSA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydEZvckdyb3VwZWRJdGVtKGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdGlmICghbGFzdFRoaW5raW5nICYmIHNob3VsZENyZWF0ZUdyb3VwZWRUaGlua2luZ1BhcnQoY29sbGFwc2VkVG9vbHNNb2RlLCBzZXBhcmF0ZWRGcm9tUmVhc29uaW5nKSkge1xuXHRcdFx0XHRcdGNvbnN0IHRoaW5raW5nUGFydCA9IHRoaXMucmVuZGVyVGhpbmtpbmdQYXJ0KHtcblx0XHRcdFx0XHRcdGtpbmQ6ICd0aGlua2luZycsXG5cdFx0XHRcdFx0fSwgY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdFx0XHRcdGlmICh0aGlua2luZ1BhcnQgaW5zdGFuY2VvZiBDaGF0VGhpbmtpbmdDb250ZW50UGFydCkge1xuXHRcdFx0XHRcdFx0Ly8gRmFjdG9yeSB3cmFwcGluZyBhbHJlYWR5LWNyZWF0ZWQgbWFya2Rvd24gcGFydFxuXHRcdFx0XHRcdFx0dGhpbmtpbmdQYXJ0LmFwcGVuZEl0ZW0oXG5cdFx0XHRcdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6IG1hcmtkb3duUGFydC5kb21Ob2RlLCBkaXNwb3NhYmxlOiBtYXJrZG93blBhcnQgfSksXG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duUGFydC5jb2RlYmxvY2tzUGFydElkLFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bixcblx0XHRcdFx0XHRcdFx0dGVtcGxhdGVEYXRhLnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93blBhcnQub25EaWRDaGFuZ2VEaWZmLFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93blBhcnQsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0aGlua2luZ1BhcnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobGFzdFRoaW5raW5nKSB7XG5cdFx0XHRcdFx0Ly8gRmFjdG9yeSB3cmFwcGluZyBhbHJlYWR5LWNyZWF0ZWQgbWFya2Rvd24gcGFydC5cblx0XHRcdFx0XHQvLyBObyBlYWdlckRpc3Bvc2FibGUgbmVlZGVkIGhlcmUgYmVjYXVzZSB0aGUgbWFya2Rvd25QYXJ0IGlzIHJldHVybmVkXG5cdFx0XHRcdFx0Ly8gZnJvbSB0aGlzIG1ldGhvZCBhbmQgdHJhY2tlZCBkaXJlY3RseSBpbiByZW5kZXJlZFBhcnRzLCBzbyBpdCB3aWxsXG5cdFx0XHRcdFx0Ly8gYmUgZGlzcG9zZWQgYnkgY2xlYXJSZW5kZXJlZFBhcnRzLlxuXHRcdFx0XHRcdGxhc3RUaGlua2luZy5hcHBlbmRJdGVtKFxuXHRcdFx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogbWFya2Rvd25QYXJ0LmRvbU5vZGUsIGRpc3Bvc2FibGU6IG1hcmtkb3duUGFydCB9KSxcblx0XHRcdFx0XHRcdG1hcmtkb3duUGFydC5jb2RlYmxvY2tzUGFydElkLFxuXHRcdFx0XHRcdFx0bWFya2Rvd24sXG5cdFx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEudmFsdWUsXG5cdFx0XHRcdFx0XHRtYXJrZG93blBhcnQub25EaWRDaGFuZ2VEaWZmXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghc2hvdWxkUGluICYmICFpc0JsYW5rTWFya2Rvd24gJiYgIWhhc1BlbmRpbmdFZGl0Q29kZWJsb2NrKSB7XG5cdFx0XHRcdHRoaXMuZmluYWxpemVDdXJyZW50VGhpbmtpbmdQYXJ0KGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hcmtkb3duUGFydDtcblx0fVxuXG5cdHJlbmRlclRoaW5raW5nUGFydChjb250ZW50OiBJQ2hhdFRoaW5raW5nUGFydCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0Ly8gVE9ETyBAanVzdHNjaGVuIEBrYXJ0aGlrbmFkaWc6IHJlbW92ZSB0aGlzIHdoZW4gT1NXRSBtb3ZlcyBvZmYgY29tbWVudGFyeSBjaGFubmVsXG5cdFx0aWYgKCFjb250ZW50LmlkKSB7XG5cdFx0XHRjb250ZW50LmlkID0gRGF0ZS5ub3coKS50b1N0cmluZygpO1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSBpZiB0aGlzIHRoaW5raW5nIHBhcnQgaXMgYWxyZWFkeSBjb21wbGV0ZSBiYXNlZCBvbiBsb29rLWFoZWFkXG5cdFx0Ly8gKGkuZS4sIHRoZXJlIGFyZSBzdWJzZXF1ZW50IHBhcnRzIHRoYXQgd29uJ3QgYmUgcGlubmVkIHRvIHRoaXMgdGhpbmtpbmcgcGFydClcblx0XHRjb25zdCBlbGVtZW50ID0gaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgPyBjb250ZXh0LmVsZW1lbnQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3RyZWFtaW5nQ29tcGxldGVkID0gdGhpcy5pc1RoaW5raW5nTG9va0FoZWFkQ29tcGxldGUoY29udGV4dCwgZWxlbWVudCk7XG5cdFx0Y29uc3QgbGFzdFRoaW5raW5nUGFydCA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydCh0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyk7XG5cdFx0aWYgKGxhc3RUaGlua2luZ1BhcnQ/Lmhhc0dyb3VwZWRJdGVtcygpICYmIHNob3VsZFN0YXJ0TmV3Q29sbGFwc2VkVGhpbmtpbmdHcm91cChnZXRFZmZlY3RpdmVUaGlua2luZ0Rpc3BsYXlNb2RlKHRoaXMuY29uZmlnU2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSksICdpdGVtcycsICdyZWFzb25pbmcnKSkge1xuXHRcdFx0dGhpcy5maW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cblx0XHQvLyBpZiBhcnJheSwgd2UgZG8gYSBuYWl2ZSBwYXJ0IGJ5IHBhcnQgcmVuZGVyaW5nIGZvciBub3dcblx0XHRpZiAoQXJyYXkuaXNBcnJheShjb250ZW50LnZhbHVlKSkge1xuXHRcdFx0aWYgKGNvbnRlbnQudmFsdWUubGVuZ3RoIDwgMSkge1xuXHRcdFx0XHRjb25zdCBsYXN0VGhpbmtpbmcgPSB0aGlzLmdldExhc3RUaGlua2luZ1BhcnQodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpO1xuXHRcdFx0XHRsYXN0VGhpbmtpbmc/LmZpbmFsaXplVGl0bGVJZkRlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KG90aGVyID0+IGNvbnRlbnQua2luZCA9PT0gb3RoZXIua2luZCk7XG5cdFx0XHR9XG5cdFx0XHRsZXQgbGFzdFBhcnQ6IElDaGF0Q29udGVudFBhcnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgY29udGVudC52YWx1ZSkge1xuXHRcdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RUaGlua2luZ1BhcnQgPSBsYXN0UGFydCBpbnN0YW5jZW9mIENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0ICYmIGxhc3RQYXJ0LmdldElzQWN0aXZlKCkgPyBsYXN0UGFydCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAobGFzdFRoaW5raW5nUGFydCkge1xuXHRcdFx0XHRcdFx0bGFzdFRoaW5raW5nUGFydC5zZXR1cFRoaW5raW5nQ29udGFpbmVyKHsgLi4uY29udGVudCwgdmFsdWU6IGl0ZW0gfSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGl0ZW1Db250ZW50ID0geyAuLi5jb250ZW50LCB2YWx1ZTogaXRlbSB9O1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbVBhcnQgPSB0ZW1wbGF0ZURhdGEuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRoaW5raW5nQ29udGVudFBhcnQsIGl0ZW1Db250ZW50LCBjb250ZXh0LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlciwgc3RyZWFtaW5nQ29tcGxldGVkKTtcblx0XHRcdFx0XHRcdGxhc3RQYXJ0ID0gaXRlbVBhcnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGFzdFBhcnQgPz8gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT4gY29udGVudC5raW5kID09PSBvdGhlci5raW5kKTtcblx0XHRcdC8vIG5vbi1hcnJheSwgaGFuZGxlIGNhc2Ugd2hlcmUgd2UgYXJlIGN1cnJlbnRseSB0aGlua2luZyB2cy4gc3RhcnRpbmcgYSBuZXcgdGhpbmtpbmcgcGFydFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBsYXN0QWN0aXZlVGhpbmtpbmcgPSB0aGlzLmdldExhc3RUaGlua2luZ1BhcnQodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpO1xuXHRcdFx0aWYgKGxhc3RBY3RpdmVUaGlua2luZykge1xuXHRcdFx0XHRsYXN0QWN0aXZlVGhpbmtpbmcuc2V0dXBUaGlua2luZ0NvbnRhaW5lcihjb250ZW50KTtcblx0XHRcdFx0cmV0dXJuIGxhc3RBY3RpdmVUaGlua2luZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSB0ZW1wbGF0ZURhdGEuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRoaW5raW5nQ29udGVudFBhcnQsIGNvbnRlbnQsIGNvbnRleHQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCBzdHJlYW1pbmdDb21wbGV0ZWQpO1xuXHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdH1cblxuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDaGF0VHJlZUl0ZW0sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgZGV0YWlscz86IElMaXN0RWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0aGlzLnRyYWNlTGF5b3V0KCdkaXNwb3NlRWxlbWVudCcsIGBEaXNwb3NpbmcgZWxlbWVudCwgaW5kZXg9JHtpbmRleH1gKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAodGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50ICYmICF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZykge1xuXHRcdFx0dGhpcy50ZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5kZWxldGUodGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50LmlkKTtcblx0XHR9XG5cblx0XHQvLyBUaGVzZSBtYXBzIGFyZSBvbmx5IHJlYWQgZm9yIHRoZSBmb2N1c2VkIHJlc3BvbnNlIHdoaWNoIGlzIGFsd2F5cyB2aXNpYmxlLFxuXHRcdC8vIHNvIHdlIGNhbiBjbGVhbiB1cCBlbnRyaWVzIGZvciBlbGVtZW50cyB0aGF0IGxlYXZlIHRoZSB2aWV3cG9ydC5cblx0XHRjb25zdCBjb2RlQmxvY2tzID0gdGhpcy5jb2RlQmxvY2tzQnlSZXNwb25zZUlkLmdldChub2RlLmVsZW1lbnQuaWQpO1xuXHRcdGlmIChjb2RlQmxvY2tzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGluZm8gb2YgY29kZUJsb2Nrcykge1xuXHRcdFx0XHRpZiAoaW5mbz8udXJpKSB7XG5cdFx0XHRcdFx0dGhpcy5jb2RlQmxvY2tzQnlFZGl0b3JVcmkuZGVsZXRlKGluZm8udXJpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb2RlQmxvY2tzQnlSZXNwb25zZUlkLmRlbGV0ZShub2RlLmVsZW1lbnQuaWQpO1xuXHRcdH1cblx0XHR0aGlzLmZpbGVUcmVlc0J5UmVzcG9uc2VJZC5kZWxldGUobm9kZS5lbGVtZW50LmlkKTtcblx0XHR0aGlzLmZvY3VzZWRGaWxlVHJlZXNCeVJlc3BvbnNlSWQuZGVsZXRlKG5vZGUuZWxlbWVudC5pZCk7XG5cblx0XHRpZiAoaXNSZXF1ZXN0Vk0obm9kZS5lbGVtZW50KSAmJiBub2RlLmVsZW1lbnQuaWQgPT09IHRoaXMudmlld01vZGVsPy5lZGl0aW5nPy5pZCAmJiBkZXRhaWxzPy5vblNjcm9sbCkge1xuXHRcdFx0dGhpcy5fb25EaWREaXNwb3NlLmZpcmUodGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cblx0XHQvLyBEb24ndCByZXRhaW4gdGhlIHRvb2xiYXIgY29udGV4dCB3aGljaCBpbmNsdWRlcyBjaGF0IHZpZXdtb2RlbHNcblx0XHRpZiAodGVtcGxhdGVEYXRhLnRpdGxlVG9vbGJhcikge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpdGxlVG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyVG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS5jaGVja3BvaW50VG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS5jaGVja3BvaW50UmVzdG9yZVRvb2xiYXIuY29udGV4dCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWNwU2VydmVyc0ludGVyYWN0aW9uUmVxdWlyZWQoY29udGVudDogSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmcgfCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1NlcmlhbGl6ZWQsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNY3BTZXJ2ZXJzSW50ZXJhY3Rpb25Db250ZW50UGFydCwgY29udGVudCwgY29udGV4dCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRpc2FibGVkQ2xhdWRlSG9va3MoY29udGVudDogSUNoYXREaXNhYmxlZENsYXVkZUhvb2tzUGFydCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RGlzYWJsZWRDbGF1ZGVIb29rc0NvbnRlbnRQYXJ0LCBjb250ZXh0KTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXJSZW5kZXJlZFBhcnRzKHRlbXBsYXRlRGF0YSk7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBob3ZlclZpc2libGUocmVxdWVzdEhvdmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdHJlcXVlc3RIb3Zlci5zdHlsZS5vcGFjaXR5ID0gJzEnO1xuXHR9XG5cblx0cHJpdmF0ZSBob3ZlckhpZGRlbihyZXF1ZXN0SG92ZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0cmVxdWVzdEhvdmVyLnN0eWxlLm9wYWNpdHkgPSAnMCc7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdExpc3REZWxlZ2F0ZSBleHRlbmRzIENhY2hlZExpc3RWaXJ0dWFsRGVsZWdhdGU8Q2hhdFRyZWVJdGVtPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEVsZW1lbnRIZWlnaHQ6IG51bWJlcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBlc3RpbWF0ZUhlaWdodChlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBudW1iZXIge1xuXHRcdC8vIGN1cnJlbnRSZW5kZXJlZEhlaWdodCBpcyBub3QgbG9hZC1iZWFyaW5nIGhlcmUtIHByb2JhYmx5IGlmIGl0J3MgZXZlciBzZXQsIHRoZW4gdGhlIHN1cGVyY2xhc3MgY2FjaGUgd2lsbCBoYXZlIHRoZSBoZWlnaHQuXG5cdFx0cmV0dXJuIGVsZW1lbnQuY3VycmVudFJlbmRlcmVkSGVpZ2h0ID8/IHRoaXMuZGVmYXVsdEVsZW1lbnRIZWlnaHQ7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIENoYXRMaXN0SXRlbVJlbmRlcmVyLklEO1xuXHR9XG5cblx0aGFzRHluYW1pY0hlaWdodChlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGdldE1lYXN1cmVkSGVpZ2h0KGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q2FjaGVkSGVpZ2h0KGVsZW1lbnQpO1xuXHR9XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYSB0b29sIGludm9jYXRpb24gaXMgdGhlIHBhcmVudCBzdWJhZ2VudCB0b29sICh0aGUgdG9vbCB0aGF0IHNwYXducyBhIHN1YmFnZW50KS5cbiAqIEEgcGFyZW50IHN1YmFnZW50IHRvb2wgaGFzIHN1YmFnZW50IHRvb2xTcGVjaWZpY0RhdGEgYnV0IG5vIHN1YkFnZW50SW52b2NhdGlvbklkLlxuICovXG5mdW5jdGlvbiBpc1BhcmVudFN1YmFnZW50VG9vbChpbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyAmJiAhaW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZDtcbn1cblxuLyoqXG4gKiBHZXQgdGhlIHN1YmFnZW50IGludm9jYXRpb24gSUQgZm9yIGdyb3VwaW5nIHRvb2xzLlxuICogRm9yIHBhcmVudCBzdWJhZ2VudCB0b29scywgdXNlIHRoZWlyIHRvb2xDYWxsSWQuXG4gKiBGb3IgY2hpbGQgdG9vbHMsIHVzZSB0aGVpciBzdWJBZ2VudEludm9jYXRpb25JZC5cbiAqL1xuZnVuY3Rpb24gZ2V0U3ViYWdlbnRJZChpbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoaXNQYXJlbnRTdWJhZ2VudFRvb2woaW52b2NhdGlvbikpIHtcblx0XHRyZXR1cm4gaW52b2NhdGlvbi50b29sQ2FsbElkO1xuXHR9XG5cdHJldHVybiBpbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkO1xufVxuXG4vKipcbiAqIENoZWNrIGlmIGEgdG9vbCBpbnZvY2F0aW9uIGlzIHBhcnQgb2YgYSBzdWJhZ2VudCAoZWl0aGVyIHBhcmVudCBvciBjaGlsZCkuXG4gKi9cbmZ1bmN0aW9uIGlzU3ViYWdlbnRUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpOiBib29sZWFuIHtcblx0cmV0dXJuICEhZ2V0U3ViYWdlbnRJZChpbnZvY2F0aW9uKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFdvcmtpbmdQcm9ncmVzc1JlbGV2YW50UGFydHMocGFydHM6IHJlYWRvbmx5IElDaGF0UmVuZGVyZXJDb250ZW50W10pOiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdIHtcblx0cmV0dXJuIHBhcnRzLmZpbHRlcihwYXJ0ID0+IHtcblx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRcdHJldHVybiAhaXNTdWJhZ2VudFRvb2xJbnZvY2F0aW9uKHBhcnQpO1xuXHRcdH1cblx0XHRpZiAocGFydC5raW5kID09PSAnaG9vaycpIHtcblx0XHRcdHJldHVybiAhcGFydC5zdWJBZ2VudEludm9jYXRpb25JZDtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnQua2luZCAhPT0gJ21hcmtkb3duQ29udGVudCcgfHwgIWV4dHJhY3RTdWJBZ2VudEludm9jYXRpb25JZEZyb21UZXh0KHBhcnQuY29udGVudC52YWx1ZSk7XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5kc1dpdGhTdWJhZ2VudENvbnRlbnQocGFydHM6IHJlYWRvbmx5IElDaGF0UmVuZGVyZXJDb250ZW50W10pOiBib29sZWFuIHtcblx0Y29uc3QgbGFzdFBhcnQgPSBmaW5kTGFzdE1lYW5pbmdmdWxQYXJ0KHBhcnRzKTtcblx0aWYgKCFsYXN0UGFydCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAobGFzdFBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBsYXN0UGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykge1xuXHRcdHJldHVybiBpc1BhcmVudFN1YmFnZW50VG9vbChsYXN0UGFydCk7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbkludGVyYWN0aW9uKHBhcnRzOiByZWFkb25seSBJQ2hhdFJlbmRlcmVyQ29udGVudFtdKTogYm9vbGVhbiB7XG5cdGNvbnN0IGxhc3RQYXJ0ID0gZmluZExhc3RNZWFuaW5nZnVsUGFydChwYXJ0cyk7XG5cdGlmICghbGFzdFBhcnQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGxhc3RQYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJykge1xuXHRcdHJldHVybiAhIWxhc3RQYXJ0LmlzVXNlZDtcblx0fVxuXHRyZXR1cm4gKGxhc3RQYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgbGFzdFBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpXG5cdFx0JiYgaXNBc2tRdWVzdGlvbnNUb29sSW52b2NhdGlvbihsYXN0UGFydClcblx0XHQmJiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUobGFzdFBhcnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNXYWl0aW5nRm9yTWNwU2VydmVycyhwYXJ0czogcmVhZG9ubHkgSUNoYXRSZW5kZXJlckNvbnRlbnRbXSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcGFydHMuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ21jcFNlcnZlcnNTdGFydGluZ1Nsb3cnICYmIHBhcnQuc2VydmVycy5nZXQoKS5sZW5ndGggPiAwKTtcbn1cblxuZnVuY3Rpb24gZmluZExhc3RNZWFuaW5nZnVsUGFydChwYXJ0czogcmVhZG9ubHkgSUNoYXRSZW5kZXJlckNvbnRlbnRbXSk6IElDaGF0UmVuZGVyZXJDb250ZW50IHwgdW5kZWZpbmVkIHtcblx0Zm9yIChsZXQgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgcGFydCA9IHBhcnRzW2ldO1xuXHRcdGlmIChwYXJ0LmtpbmQgIT09ICdtYXJrZG93bkNvbnRlbnQnIHx8IHBhcnQuY29udGVudC52YWx1ZS50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGFBQWE7QUFDdEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBNEQ7QUFHckUsU0FBUyxVQUFVLGdCQUFn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Q3JHLFFBQU0sV0FBVyx1QkFBdUIsS0FBSztBQUM3QyxNQUFJLENBQUMsVUFBVTtBQUNkLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxTQUFTLFNBQVMsb0JBQW9CO0FBQ3pDLFdBQU8sQ0FBQyxDQUFDLFNBQVM7QUFBQSxFQUNuQjtBQUNBLFVBQVEsU0FBUyxTQUFTLG9CQUFvQixTQUFTLFNBQVMsK0JBQzVELDZCQUE2QixRQUFRLEtBQ3JDLG9CQUFvQixXQUFXLFFBQVE7QUFDNUM7QUFFTyxTQUFTLHVCQUF1QixPQUFpRDtBQUN2RixTQUFPLE1BQU0sS0FBSyxVQUFRLEtBQUssU0FBUyw0QkFBNEIsS0FBSyxRQUFRLElBQUksRUFBRSxTQUFTLENBQUM7QUFDbEc7QUFFQSxTQUFTLHVCQUF1QixPQUEwRTtBQUN6RyxXQUFTLElBQUksTUFBTSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDM0MsVUFBTSxPQUFPLE1BQU0sQ0FBQztBQUNwQixRQUFJLEtBQUssU0FBUyxxQkFBcUIsS0FBSyxRQUFRLE1BQU0sS0FBSyxFQUFFLFNBQVMsR0FBRztBQUM1RSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImVsZW1lbnQiLCAiUmF0ZSIsICJuZXdQYXJ0IiwgInBhcnQiLCAiY29kZUJsb2Nrc0J5UmVzcG9uc2VJZCIsICJjcmVhdGVkUGFydCIsICJjdXJyZW50U3RhdGUiLCAibGFzdFRoaW5raW5nUGFydCJdCn0K
