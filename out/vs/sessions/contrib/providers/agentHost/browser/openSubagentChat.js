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
import "./media/openSubagentChat.css";
import { $, addDisposableListener, EventType, WindowIntervalTimer } from "../../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { createPixelSpinner } from "../../../../../base/browser/ui/pixelSpinner/pixelSpinner.js";
import { Action } from "../../../../../base/common/actions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuItemAction, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { parseChatUri, parseSubagentSessionUri } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID } from "../../../../../workbench/contrib/chat/common/constants.js";
import { formatElapsedTime } from "../../../../../workbench/contrib/chat/common/chatProgressFormatting.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { renderFileWidgets } from "../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatInlineAnchorWidget.js";
import { IChatMarkdownAnchorService } from "../../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatMarkdownAnchorService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
function chatIdFromResource(resource) {
  const fromChatUri = parseChatUri(resource)?.chatId;
  if (fromChatUri) {
    return fromChatUri;
  }
  const fromSessionUri = parseSubagentSessionUri(resource);
  return fromSessionUri ? `subagent/${fromSessionUri.toolCallId}` : void 0;
}
function matchesResource(chat, resource, chatId) {
  if (chat.resource.toString() === resource) {
    return true;
  }
  return !!chatId && chat.resource.fragment === chatId;
}
function ownerSessionPath(resource) {
  const fromChatUri = parseChatUri(resource)?.session;
  if (fromChatUri) {
    try {
      return URI.parse(fromChatUri).path;
    } catch {
      return void 0;
    }
  }
  return parseSubagentSessionUri(resource)?.parentSession.path;
}
function findSubagentChat(sessionsService, resource, reader) {
  const chatId = chatIdFromResource(resource);
  const ownerPath = ownerSessionPath(resource);
  const allSessions = [sessionsService.activeSession.read(reader), ...sessionsService.visibleSessions.read(reader)].filter((s) => !!s);
  const candidates = ownerPath ? allSessions.filter((s) => s.resource.path === ownerPath) : allSessions;
  for (const session of candidates) {
    const chat = session.chats.read(reader).find((c) => matchesResource(c, resource, chatId));
    if (chat) {
      return { session, chat };
    }
  }
  return void 0;
}
function contextChatResource(context) {
  if (typeof context === "string") {
    return context;
  }
  if (context && typeof context === "object" && typeof context.chatResource === "string") {
    return context.chatResource;
  }
  return void 0;
}
function contextSubagentTiming(context) {
  if (!context || typeof context !== "object") {
    return { startedAt: void 0, duration: void 0 };
  }
  const value = context;
  return {
    startedAt: typeof value.startedAt === "number" && Number.isFinite(value.startedAt) ? value.startedAt : void 0,
    duration: typeof value.duration === "number" && Number.isFinite(value.duration) ? Math.max(0, value.duration) : void 0
  };
}
function contextConfirmationCount(context) {
  if (!context || typeof context !== "object") {
    return 0;
  }
  const count = context.confirmationCount;
  return typeof count === "number" && count > 0 ? count : 0;
}
function shouldShowSubagentModel(subagentModelName, parentModelId, parentModelName, parentModelMetadataId) {
  if (!subagentModelName) {
    return false;
  }
  const normalizedSubagentModel = subagentModelName.trim().toLowerCase();
  const parentModelIdSuffix = parentModelId?.slice(parentModelId.lastIndexOf(":") + 1);
  return ![parentModelId, parentModelIdSuffix, parentModelName, parentModelMetadataId].some((candidate) => candidate?.trim().toLowerCase() === normalizedSubagentModel);
}
function createOpenSubagentAction(action) {
  const proxy = new Action(action.id, action.label, action.class, false, (context) => action.run(context));
  proxy.tooltip = action.tooltip;
  return proxy;
}
class OpenSubagentChatAction extends Action2 {
  constructor() {
    super({
      id: CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID,
      title: localize2("chat.subagent.openChat", "Open Subagent"),
      icon: Codicon.commentDiscussion,
      // Contextual: invoked from a specific subagent's header toolbar, which
      // forwards that subagent's chat resource. Not a palette command.
      f1: false,
      menu: { id: MenuId.ChatSubagentContent, group: "navigation" }
    });
  }
  async run(accessor, context) {
    const resource = contextChatResource(context);
    if (!resource) {
      return;
    }
    const logService = accessor.get(ILogService);
    const sessionsService = accessor.get(ISessionsService);
    const match = findSubagentChat(sessionsService, resource, void 0);
    if (match) {
      await sessionsService.openChat(match.session, match.chat.resource);
      return;
    }
    const active = sessionsService.activeSession.get();
    const available = active?.chats.get().map((c) => c.resource.toString()).join(", ") ?? "(none)";
    logService.warn(`[Sessions] Cannot open subagent chat for resource '${resource}' (chatId='${chatIdFromResource(resource)}'). Available chats: ${available}`);
  }
}
registerAction2(OpenSubagentChatAction);
let OpenSubagentChatActionViewItem = class extends BaseActionViewItem {
  constructor(context, action, options, sessionsService, markdownRendererService, instantiationService, chatMarkdownAnchorService, accessibilityService, languageModelsService) {
    super(context, createOpenSubagentAction(action), options);
    this.sessionsService = sessionsService;
    this.markdownRendererService = markdownRendererService;
    this.instantiationService = instantiationService;
    this.chatMarkdownAnchorService = chatMarkdownAnchorService;
    this.accessibilityService = accessibilityService;
    this.languageModelsService = languageModelsService;
    this._confirmationCount = 0;
    this._confirmationActive = false;
    this._titleTracker = this._register(new MutableDisposable());
    this._spinner = this._register(new MutableDisposable());
    this._durationTimer = this._register(new WindowIntervalTimer());
    this._toolTransition = this._register(new MutableDisposable());
    this._activeToolRendered = this._register(new MutableDisposable());
    this._activeToolFileWidgets = this._register(new DisposableStore());
    this._toolTransitionPhase = "idle";
    this._sourceAction = action;
    if (this._action instanceof Action) {
      this._register(this._action);
    }
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
      if (this.accessibilityService.isMotionReduced()) {
        this._finishToolTransition();
      }
    }));
    this._register(this.languageModelsService.onDidChangeLanguageModels(() => this._updateTitleTracker()));
  }
  render(container) {
    super.render(container);
    container.classList.add("chat-subagent-pill-widget");
    container.setAttribute("role", "button");
    this._iconElement = $("span.chat-subagent-pill-icon");
    this._iconElement.appendChild($(`span.chat-subagent-pill-open-icon${ThemeIcon.asCSSSelector(Codicon.commentDiscussion)}`));
    this._labelElement = $("span.chat-subagent-pill-label");
    this._modelElement = $("span.chat-subagent-pill-model.hidden");
    this._confirmationCountElement = $("span.chat-subagent-pill-confirmation-count");
    const pillContent = $("span.chat-subagent-pill-content");
    const pillHeader = $("span.chat-subagent-pill-header");
    this._durationElement = $("span.chat-subagent-pill-duration");
    this._activeToolElement = $("span.chat-subagent-pill-active-tool");
    this._activeToolElement.inert = true;
    const connector = $("span.chat-subagent-pill-active-tool-connector");
    connector.setAttribute("aria-hidden", "true");
    this._activeToolIconElement = $("span.chat-subagent-pill-active-tool-icon");
    this._activeToolIconElement.setAttribute("aria-hidden", "true");
    this._activeToolLabelElement = $(".chat-subagent-pill-active-tool-label");
    this._activeToolElement.append(connector, this._activeToolIconElement, this._activeToolLabelElement);
    pillContent.append(this._iconElement, this._labelElement, this._modelElement, this._confirmationCountElement);
    pillHeader.append(pillContent, this._durationElement);
    container.append(pillHeader, this._activeToolElement);
    this._labelElement.textContent = this._labelText();
    this._updateConfirmationCount();
    this._updateDuration();
    this._updateMetadata();
    this._updateTitleTracker();
    this.updateTooltip();
    this.updateEnabled();
  }
  setActionContext(newContext) {
    super.setActionContext(newContext);
    this._updateConfirmationCount();
    this._updateDuration();
    this._updateMetadata();
    this._updateTitleTracker();
  }
  _updateMetadata() {
    const context = this._context && typeof this._context === "object" ? this._context : void 0;
    this._reportedModelName = context?.modelName;
    this._setActiveTool(context?.activeToolLabel, context?.activeToolIcon);
  }
  _setActiveTool(label, icon) {
    this._targetToolLabel = label;
    this._targetToolIcon = icon;
    if (!this._activeToolElement || !this._activeToolLabelElement) {
      return;
    }
    this._activeToolElement.classList.toggle("hidden", !label);
    if (!label) {
      this._toolTransition.clear();
      this._toolTransitionPhase = "idle";
      this._clearToolTransitionClasses();
      this._activeToolRendered.clear();
      this._activeToolFileWidgets.clear();
      this._activeToolLabelElement.textContent = "";
      this._displayedToolLabel = void 0;
      this._displayedToolIcon = void 0;
      this._displayedToolAccessibleLabel = void 0;
      this._renderActiveToolIcon(void 0);
      this.updateTooltip();
      this.updateAriaLabel();
      return;
    }
    if (!this._displayedToolLabel || this.accessibilityService.isMotionReduced()) {
      this._finishToolTransition();
      return;
    }
    this._runToolTransition();
  }
  _runToolTransition() {
    if (!this._activeToolLabelElement || this._toolTransitionPhase !== "idle" || this._targetToolLabel === this._displayedToolLabel && this._targetToolIcon?.id === this._displayedToolIcon?.id) {
      return;
    }
    this._toolTransitionPhase = "out";
    if (!this._restartToolTransition("chat-subagent-tool-fade-out")) {
      this._completeToolTransition();
    }
  }
  _completeToolTransition() {
    this._toolTransition.clear();
    if (this._toolTransitionPhase === "out") {
      this._toolTransitionPhase = "in";
      this._setDisplayedTool(this._targetToolLabel ?? "", this._targetToolIcon);
      if (!this._restartToolTransition("chat-subagent-tool-fade-in")) {
        this._completeToolTransition();
      }
      return;
    }
    if (this._toolTransitionPhase === "in") {
      this._clearToolTransitionClasses();
      this._toolTransitionPhase = "idle";
      this._runToolTransition();
    }
  }
  _finishToolTransition() {
    this._toolTransition.clear();
    this._toolTransitionPhase = "idle";
    this._clearToolTransitionClasses();
    if (this._targetToolLabel) {
      this._setDisplayedTool(this._targetToolLabel, this._targetToolIcon);
    }
  }
  _setDisplayedTool(label, icon) {
    if (this._activeToolLabelElement) {
      this._activeToolRendered.clear();
      this._activeToolFileWidgets.clear();
      this._activeToolLabelElement.textContent = "";
      const rendered = this.markdownRendererService.render(new MarkdownString(label), void 0, this._activeToolLabelElement);
      renderFileWidgets(rendered.element, this.instantiationService, this.chatMarkdownAnchorService, this._activeToolFileWidgets);
      this._activeToolRendered.value = rendered;
      this._displayedToolLabel = label;
      this._displayedToolIcon = icon;
      this._displayedToolAccessibleLabel = rendered.element.textContent?.replace(/\s+/g, " ").trim() || label;
      this._renderActiveToolIcon(icon);
      this.updateTooltip();
      this.updateAriaLabel();
    }
  }
  _renderActiveToolIcon(icon) {
    if (!this._activeToolIconElement) {
      return;
    }
    this._activeToolIconElement.className = "chat-subagent-pill-active-tool-icon";
    if (icon) {
      this._activeToolIconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
    }
  }
  _clearToolTransitionClasses() {
    this._activeToolLabelElement?.classList.remove("chat-subagent-tool-fade-in", "chat-subagent-tool-fade-out");
  }
  _restartToolTransition(className) {
    if (!this._activeToolLabelElement) {
      return false;
    }
    this._toolTransition.clear();
    this._clearToolTransitionClasses();
    const transition = new DisposableStore();
    const complete = (event) => {
      if (event.target === this._activeToolLabelElement) {
        this._completeToolTransition();
      }
    };
    transition.add(addDisposableListener(this._activeToolLabelElement, EventType.ANIMATION_END, complete));
    transition.add(addDisposableListener(this._activeToolLabelElement, "animationcancel", complete));
    this._toolTransition.value = transition;
    void this._activeToolLabelElement.offsetWidth;
    this._activeToolLabelElement.classList.add(className);
    if (this._activeToolLabelElement.getAnimations().length === 0) {
      this._toolTransition.clear();
      this._clearToolTransitionClasses();
      return false;
    }
    return true;
  }
  _updateConfirmationCount() {
    const count = contextConfirmationCount(this._context);
    const confirmationActive = !!(this._context && typeof this._context === "object" && this._context.confirmationActive);
    if (count === this._confirmationCount && confirmationActive === this._confirmationActive) {
      return;
    }
    this._confirmationCount = count;
    this._confirmationActive = confirmationActive;
    this.element?.classList.toggle("chat-subagent-needs-confirmation", count > 0);
    this.element?.classList.toggle("chat-subagent-has-multiple-confirmations", count > 1);
    this.element?.classList.toggle("chat-subagent-confirmation-active", count > 0 && confirmationActive);
    this.element?.classList.toggle("chat-subagent-confirmation-pending", count > 0 && !confirmationActive);
    if (this._confirmationCountElement) {
      this._confirmationCountElement.textContent = String(count);
    }
    this.updateTooltip();
    this.updateAriaLabel();
  }
  /** Tracks the resolved subagent chat's title and active state. */
  _updateTitleTracker() {
    const resource = contextChatResource(this._context);
    if (!resource) {
      this._titleTracker.clear();
      this._setEnabled(false);
      this._setResolvedTitle(void 0);
      this._setModelName(void 0);
      this._setStatus(void 0);
      return;
    }
    this._titleTracker.value = autorun((reader) => {
      const match = findSubagentChat(this.sessionsService, resource, reader);
      const chat = match?.chat;
      const parentChat = chat?.origin?.parentChat ? match?.session.chats.read(reader).find((candidate) => isEqual(candidate.resource, chat.origin?.parentChat)) : void 0;
      const parentModelId = parentChat?.modelId.read(reader);
      const parentModel = parentModelId ? this.languageModelsService.lookupLanguageModel(parentModelId) : void 0;
      this._setEnabled(!!chat);
      this._setResolvedTitle(chat?.title.read(reader) || void 0);
      this._setModelName(shouldShowSubagentModel(this._reportedModelName, parentModelId, parentModel?.name, parentModel?.id) ? this._reportedModelName : void 0);
      this._setStatus(chat?.status.read(reader));
    });
  }
  _setModelName(modelName) {
    if (modelName === this._modelName) {
      return;
    }
    this._modelName = modelName;
    if (this._modelElement) {
      this._modelElement.textContent = modelName ?? "";
      this._modelElement.classList.toggle("hidden", !modelName);
    }
    this.updateTooltip();
    this.updateAriaLabel();
  }
  _setEnabled(enabled) {
    this._action.enabled = enabled;
    this._sourceAction.enabled = enabled;
  }
  _updateDuration() {
    this._durationTimer.cancel();
    const timing = contextSubagentTiming(this._context);
    this._startedAt = timing.startedAt;
    this._endedAt = timing.startedAt !== void 0 && timing.duration !== void 0 ? timing.startedAt + timing.duration : void 0;
    this._updateDurationLabel();
    if (this._startedAt !== void 0 && this._endedAt === void 0) {
      this._durationTimer.cancelAndSet(() => this._updateDurationLabel(), 1e3);
    }
  }
  _updateDurationLabel() {
    if (!this._durationElement || this._startedAt === void 0) {
      this._durationElement?.classList.add("hidden");
      this.updateAriaLabel();
      return;
    }
    const end = this._endedAt ?? Date.now();
    const duration = formatElapsedTime(Math.max(0, end - this._startedAt));
    this._durationElement.textContent = this._endedAt === void 0 ? localize("chat.subagent.workingDuration", "Working for {0}", duration) : localize("chat.subagent.workedDuration", "Worked for {0}", duration);
    this._durationElement.classList.remove("hidden");
    this.updateAriaLabel();
  }
  _setStatus(status) {
    if (status === this._status) {
      return;
    }
    this._status = status;
    const running = status === SessionStatus.InProgress;
    const waiting = status === SessionStatus.NeedsInput;
    this.element?.classList.toggle("chat-subagent-running", running);
    this.element?.classList.toggle("chat-subagent-waiting", waiting);
    this._spinner.clear();
    if ((running || waiting) && this._iconElement) {
      const store = new DisposableStore();
      const spinner = store.add(createPixelSpinner(this._iconElement, { variant: waiting ? "ring" : "grid" }));
      store.add(toDisposable(() => spinner.element.remove()));
      this._spinner.value = store;
    }
    this.updateAriaLabel();
  }
  _setResolvedTitle(title) {
    if (title !== this._resolvedTitle) {
      this._resolvedTitle = title;
      if (this._labelElement) {
        this._labelElement.textContent = this._labelText();
      }
      this.updateTooltip();
      this.updateAriaLabel();
    }
  }
  _labelText() {
    return this._resolvedTitle || this._action.label;
  }
  getTooltip() {
    const details = [];
    if (this._confirmationCount > 0) {
      details.push(this._confirmationCount === 1 ? localize("chat.subagent.openChat.confirmationTooltip", "Open subagent chat (1 confirmation needed)") : localize("chat.subagent.openChat.confirmationsTooltip", "Open subagent chat ({0} confirmations needed)", this._confirmationCount));
    } else {
      const actionLabel = this._action.tooltip || this._action.label;
      if (actionLabel) {
        details.push(actionLabel);
      }
    }
    if (this._modelName) {
      details.push(localize("chat.subagent.modelTooltip", "Model: {0}", this._modelName));
    }
    if (this._displayedToolAccessibleLabel) {
      details.push(localize("chat.subagent.activeToolTooltip", "Active tool: {0}", this._displayedToolAccessibleLabel));
    }
    return details.filter(Boolean).join("\n") || void 0;
  }
  updateEnabled() {
    if (!this.element) {
      return;
    }
    const enabled = this._action.enabled;
    this.element.classList.toggle("disabled", !enabled);
    this.element.classList.toggle("hidden", !enabled);
    this.element.setAttribute("aria-disabled", String(!enabled));
    this.element.setAttribute("aria-hidden", String(!enabled));
  }
  updateAriaLabel() {
    if (!this.element) {
      return;
    }
    const openLabel = this._resolvedTitle ? localize("chat.subagent.openChat.aria", "Open subagent chat: {0}", this._resolvedTitle) : this._action.label;
    const statusLabel = this._status === SessionStatus.InProgress ? localize("chat.subagent.status.working", "Subagent is working") : this._status === SessionStatus.NeedsInput ? localize("chat.subagent.status.waiting", "Subagent is waiting for input") : this._status === SessionStatus.Completed ? localize("chat.subagent.status.completed", "Subagent completed") : void 0;
    const confirmationLabel = this._confirmationCount > 0 ? this._confirmationCount === 1 ? localize("chat.subagent.confirmationAria", "1 confirmation needed") : localize("chat.subagent.confirmationsAria", "{0} confirmations needed", this._confirmationCount) : void 0;
    const modelLabel = this._modelName ? localize("chat.subagent.modelAria", "Model {0}", this._modelName) : void 0;
    const activeToolLabel = this._displayedToolAccessibleLabel ? localize("chat.subagent.activeToolAria", "Active tool {0}", this._displayedToolAccessibleLabel) : void 0;
    const ariaLabel = [openLabel, statusLabel, modelLabel, activeToolLabel, confirmationLabel, this._durationElement?.textContent || void 0].filter((value) => !!value).join(". ");
    if (ariaLabel) {
      this.element.setAttribute("aria-label", ariaLabel);
    } else {
      this.element.removeAttribute("aria-label");
    }
  }
};
OpenSubagentChatActionViewItem = __decorateClass([
  __decorateParam(3, ISessionsService),
  __decorateParam(4, IMarkdownRendererService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IChatMarkdownAnchorService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, ILanguageModelsService)
], OpenSubagentChatActionViewItem);
let OpenSubagentChatActionViewItemContribution = class extends Disposable {
  constructor(actionViewItemService) {
    super();
    const onDidRegister = this._register(new Emitter());
    this._register(actionViewItemService.register(MenuId.ChatSubagentContent, CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, (action, options, instantiationService) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(OpenSubagentChatActionViewItem, void 0, action, options);
    }, onDidRegister.event));
    onDidRegister.fire();
  }
};
OpenSubagentChatActionViewItemContribution.ID = "workbench.contrib.openSubagentChatActionViewItem";
OpenSubagentChatActionViewItemContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService)
], OpenSubagentChatActionViewItemContribution);
registerWorkbenchContribution2(OpenSubagentChatActionViewItemContribution.ID, OpenSubagentChatActionViewItemContribution, WorkbenchPhase.BlockRestore);
export {
  OpenSubagentChatActionViewItem,
  shouldShowSubagentModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvcHJvdmlkZXJzL2FnZW50SG9zdC9icm93c2VyL29wZW5TdWJhZ2VudENoYXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvb3BlblN1YmFnZW50Q2hhdC5jc3MnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIFdpbmRvd0ludGVydmFsVGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGNyZWF0ZVBpeGVsU3Bpbm5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9waXhlbFNwaW5uZXIvcGl4ZWxTcGlubmVyLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBwYXJzZUNoYXRVcmksIHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBDSEFUX09QRU5fQUdFTlRfSE9TVF9DSEFUX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZm9ybWF0RWxhcHNlZFRpbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0UHJvZ3Jlc3NGb3JtYXR0aW5nLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyByZW5kZXJGaWxlV2lkZ2V0cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0SW5saW5lQW5jaG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93bkFuY2hvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcblxuLy8gXCJPcGVuIFN1YmFnZW50XCIgYWZmb3JkYW5jZSBmb3IgYWdlbnQgaG9zdCB3b3JrZXIgKHN1YmFnZW50KSBjaGF0cy5cbi8vXG4vLyBUaGUgY2hhdCB3aWRnZXQgcmVuZGVycyB0aGUgaW5saW5lIHN1YmFnZW50IGJsb2NrIGluIHRoZSBsZWFkIGNoYXQnc1xuLy8gdHJhbnNjcmlwdCBhbmQgYW5jaG9ycyB0aGUgYE1lbnVJZC5DaGF0U3ViYWdlbnRDb250ZW50YCBtZW51IGluIGl0cyBoZWFkZXIsXG4vLyBmb3J3YXJkaW5nIHRoZSBzdWJhZ2VudCdzIGNoYXQgcmVzb3VyY2UgKGEgVVJJIHN0cmluZykgYXMgdGhlIGFjdGlvbiBjb250ZXh0LlxuLy8gVGhlIHdpZGdldCBpcyBwcm92aWRlci1hZ25vc3RpYyBhbmQgbGl2ZXMgaW4gYSBsb3dlciBsYXllciwgc28gaXQgY2Fubm90XG4vLyByZXNvbHZlIHRoYXQgcmVzb3VyY2UgdG8gYW4gQWdlbnRzLXdpbmRvdyB0YWIgaXRzZWxmLiBUaGlzIGFjdGlvbiBpc1xuLy8gY29udHJpYnV0ZWQgYnkgdGhlIEFHRU5UIEhPU1QgUFJPVklERVIgXHUyMDE0IHdoaWNoIG93bnMgdGhlIHN1YmFnZW50IGNoYXQgVVJJXG4vLyBmb3JtYXQgKHNlZSBgcGFyc2VDaGF0VXJpYC9gcGFyc2VTdWJhZ2VudFNlc3Npb25VcmlgKSBcdTIwMTQgc28gcGFyc2luZyB0aG9zZSBVUklzXG4vLyBhbmQgbWFwcGluZyB0aGVtIHRvIGEgc3VyZmFjZWQgcGVlciBjaGF0IGlzIGEgbmF0dXJhbCBwcm92aWRlciBjb25jZXJuLiBJdCBpc1xuLy8gcmVuZGVyZWQgYXMgYSBwaWxsIGFuZCBhY3RpdmF0ZXMgdGhlIG1hdGNoaW5nIHRhYiBpbiB0aGUgYWN0aXZlIHNlc3Npb24uXG5cbi8qKlxuICogUmVjb3ZlcnMgdGhlIHN1cmZhY2VkIHBlZXIgY2hhdCdzIGNoYXRJZCAoZS5nLiBgc3ViYWdlbnQvPHRvb2xDYWxsSWQ+YCkgZnJvbSBhXG4gKiBzdWJhZ2VudCdzIGJhY2tlbmQgY2hhdCByZXNvdXJjZS4gVGhlIHJlc291cmNlIGFycml2ZXMgaW4gb25lIG9mIHR3byBjYW5vbmljYWxcbiAqIGZvcm1zIFx1MjAxNCBhIGxpdmUgQUhQIGNoYXQgVVJJIG9yIGEgcmVzdG9yZWQgc3ViYWdlbnQgc2Vzc2lvbiBVUkkgXHUyMDE0IGVhY2ggd2l0aCBpdHNcbiAqIG93biBpbnZlcnNlIHBhcnNlcjsgdGhlIHN1cmZhY2VkIHRhYidzIGNoYXRJZCBpcyBgc3ViYWdlbnQvPHRvb2xDYWxsSWQ+YCBpblxuICogYm90aCBjYXNlcy5cbiAqL1xuZnVuY3Rpb24gY2hhdElkRnJvbVJlc291cmNlKHJlc291cmNlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHQvLyBMaXZlIEFIUCBjaGF0IFVSSTogYGFocC1jaGF0Oi8vc3ViYWdlbnQvPGJhc2U2NC1zZXNzaW9uPi88dG9vbENhbGxJZD5gLlxuXHRjb25zdCBmcm9tQ2hhdFVyaSA9IHBhcnNlQ2hhdFVyaShyZXNvdXJjZSk/LmNoYXRJZDtcblx0aWYgKGZyb21DaGF0VXJpKSB7XG5cdFx0cmV0dXJuIGZyb21DaGF0VXJpO1xuXHR9XG5cdC8vIFJlc3RvcmVkIHN1YmFnZW50IHNlc3Npb24gVVJJOiBgPHNjaGVtZT46LzxwYXJlbnRQYXRoPi9zdWJhZ2VudC88dG9vbENhbGxJZD5gLlxuXHRjb25zdCBmcm9tU2Vzc2lvblVyaSA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHJlc291cmNlKTtcblx0cmV0dXJuIGZyb21TZXNzaW9uVXJpID8gYHN1YmFnZW50LyR7ZnJvbVNlc3Npb25VcmkudG9vbENhbGxJZH1gIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBtYXRjaGVzUmVzb3VyY2UoY2hhdDogSUNoYXQsIHJlc291cmNlOiBzdHJpbmcsIGNoYXRJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuICEhY2hhdElkICYmIGNoYXQucmVzb3VyY2UuZnJhZ21lbnQgPT09IGNoYXRJZDtcbn1cblxuLyoqXG4gKiBUaGUgb3duaW5nIHNlc3Npb24ncyBpZCBwYXRoIChlLmcuIGAvPHNlc3Npb25JZD5gKSBmb3IgYSBzdWJhZ2VudCBjaGF0XG4gKiByZXNvdXJjZSwgcmVjb3ZlcmVkIGZyb20gd2hpY2hldmVyIGNhbm9uaWNhbCBmb3JtIGl0IHRha2VzLiBUaGUgVUkgc2Vzc2lvblxuICogcmVzb3VyY2UgYW5kIHRoZSBiYWNrZW5kIHNlc3Npb24gVVJJIGRpZmZlciBvbmx5IGluIHNjaGVtZSAoZS5nLlxuICogYGFnZW50LWhvc3QtY29waWxvdGNsaTovPGlkPmAgdnMgYGNvcGlsb3RjbGk6LzxpZD5gKSwgc28gdGhlIHBhdGggaXMgYSBzdGFibGVcbiAqIGNyb3NzLWZvcm0gc2Vzc2lvbiBrZXkuIFVzZWQgdG8gY29uc3RyYWluIG1hdGNoaW5nIHRvIHRoZSBvd25pbmcgc2Vzc2lvbiBzbyBhXG4gKiBgc3ViYWdlbnQvPHRvb2xDYWxsSWQ+YCBjaGF0SWQgdGhhdCBjb2xsaWRlcyBhY3Jvc3MgdmlzaWJsZSBzZXNzaW9ucyBjYW4ndFxuICogb3BlbiB0aGUgd3JvbmcgdGFiLlxuICovXG5mdW5jdGlvbiBvd25lclNlc3Npb25QYXRoKHJlc291cmNlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBmcm9tQ2hhdFVyaSA9IHBhcnNlQ2hhdFVyaShyZXNvdXJjZSk/LnNlc3Npb247XG5cdGlmIChmcm9tQ2hhdFVyaSkge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gVVJJLnBhcnNlKGZyb21DaGF0VXJpKS5wYXRoO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHJlc291cmNlKT8ucGFyZW50U2Vzc2lvbi5wYXRoO1xufVxuXG4vKipcbiAqIEZpbmRzIHRoZSBzdXJmYWNlZCBwZWVyIGNoYXQgKGFuZCBpdHMgb3duaW5nIHNlc3Npb24pIGZvciBhIHN1YmFnZW50IGNoYXRcbiAqIHJlc291cmNlIGFjcm9zcyB0aGUgYWN0aXZlICsgdmlzaWJsZSBzZXNzaW9ucywgY29uc3RyYWluZWQgdG8gdGhlIG93bmluZ1xuICogc2Vzc2lvbiB3aGVuIGRlcml2YWJsZSBzbyBhIGBjaGF0SWRgIHRoYXQgY29sbGlkZXMgYWNyb3NzIHZpc2libGUgc2Vzc2lvbnNcbiAqIGNhbid0IG1hdGNoIHRoZSB3cm9uZyB0YWIuIFJlYWN0aXZlIHdoZW4gYSB7QGxpbmsgSVJlYWRlcn0gaXMgcHJvdmlkZWQuXG4gKi9cbmZ1bmN0aW9uIGZpbmRTdWJhZ2VudENoYXQoc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLCByZXNvdXJjZTogc3RyaW5nLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiB7IHJlYWRvbmx5IHNlc3Npb246IElBY3RpdmVTZXNzaW9uOyByZWFkb25seSBjaGF0OiBJQ2hhdCB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2hhdElkID0gY2hhdElkRnJvbVJlc291cmNlKHJlc291cmNlKTtcblx0Y29uc3Qgb3duZXJQYXRoID0gb3duZXJTZXNzaW9uUGF0aChyZXNvdXJjZSk7XG5cdGNvbnN0IGFsbFNlc3Npb25zID0gW3Nlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKSwgLi4uc2Vzc2lvbnNTZXJ2aWNlLnZpc2libGVTZXNzaW9ucy5yZWFkKHJlYWRlcildXG5cdFx0LmZpbHRlcigocyk6IHMgaXMgSUFjdGl2ZVNlc3Npb24gPT4gISFzKTtcblx0Y29uc3QgY2FuZGlkYXRlcyA9IG93bmVyUGF0aFxuXHRcdD8gYWxsU2Vzc2lvbnMuZmlsdGVyKHMgPT4gcy5yZXNvdXJjZS5wYXRoID09PSBvd25lclBhdGgpXG5cdFx0OiBhbGxTZXNzaW9ucztcblx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRjb25zdCBjaGF0ID0gc2Vzc2lvbi5jaGF0cy5yZWFkKHJlYWRlcikuZmluZChjID0+IG1hdGNoZXNSZXNvdXJjZShjLCByZXNvdXJjZSwgY2hhdElkKSk7XG5cdFx0aWYgKGNoYXQpIHtcblx0XHRcdHJldHVybiB7IHNlc3Npb24sIGNoYXQgfTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBUb29sYmFyIGNvbnRleHQgZm9yd2FyZGVkIGJ5IHRoZSBzdWJhZ2VudCBoZWFkZXIgKGBDaGF0U3ViYWdlbnRDb250ZW50UGFydGApLlxuICogQSBiYXJlIHJlc291cmNlIHN0cmluZyBpcyBhbHNvIGFjY2VwdGVkIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAqL1xuaW50ZXJmYWNlIElPcGVuU3ViYWdlbnRDaGF0Q29udGV4dCB7XG5cdHJlYWRvbmx5IGNoYXRSZXNvdXJjZTogc3RyaW5nO1xuXHRyZWFkb25seSBjb25maXJtYXRpb25Db3VudD86IG51bWJlcjtcblx0cmVhZG9ubHkgY29uZmlybWF0aW9uQWN0aXZlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc3RhcnRlZEF0PzogbnVtYmVyO1xuXHRyZWFkb25seSBkdXJhdGlvbj86IG51bWJlcjtcblx0cmVhZG9ubHkgbW9kZWxOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBhY3RpdmVUb29sTGFiZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFjdGl2ZVRvb2xJY29uPzogVGhlbWVJY29uO1xufVxuXG5mdW5jdGlvbiBjb250ZXh0Q2hhdFJlc291cmNlKGNvbnRleHQ6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIGNvbnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGNvbnRleHQ7XG5cdH1cblx0aWYgKGNvbnRleHQgJiYgdHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnICYmIHR5cGVvZiAoY29udGV4dCBhcyBJT3BlblN1YmFnZW50Q2hhdENvbnRleHQpLmNoYXRSZXNvdXJjZSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gKGNvbnRleHQgYXMgSU9wZW5TdWJhZ2VudENoYXRDb250ZXh0KS5jaGF0UmVzb3VyY2U7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gY29udGV4dFN1YmFnZW50VGltaW5nKGNvbnRleHQ6IHVua25vd24pOiB7IHN0YXJ0ZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkOyBkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkIH0ge1xuXHRpZiAoIWNvbnRleHQgfHwgdHlwZW9mIGNvbnRleHQgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHsgc3RhcnRlZEF0OiB1bmRlZmluZWQsIGR1cmF0aW9uOiB1bmRlZmluZWQgfTtcblx0fVxuXHRjb25zdCB2YWx1ZSA9IGNvbnRleHQgYXMgSU9wZW5TdWJhZ2VudENoYXRDb250ZXh0O1xuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0ZWRBdDogdHlwZW9mIHZhbHVlLnN0YXJ0ZWRBdCA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlLnN0YXJ0ZWRBdCkgPyB2YWx1ZS5zdGFydGVkQXQgOiB1bmRlZmluZWQsXG5cdFx0ZHVyYXRpb246IHR5cGVvZiB2YWx1ZS5kdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHZhbHVlLmR1cmF0aW9uKSA/IE1hdGgubWF4KDAsIHZhbHVlLmR1cmF0aW9uKSA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gY29udGV4dENvbmZpcm1hdGlvbkNvdW50KGNvbnRleHQ6IHVua25vd24pOiBudW1iZXIge1xuXHRpZiAoIWNvbnRleHQgfHwgdHlwZW9mIGNvbnRleHQgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblx0Y29uc3QgY291bnQgPSAoY29udGV4dCBhcyBJT3BlblN1YmFnZW50Q2hhdENvbnRleHQpLmNvbmZpcm1hdGlvbkNvdW50O1xuXHRyZXR1cm4gdHlwZW9mIGNvdW50ID09PSAnbnVtYmVyJyAmJiBjb3VudCA+IDAgPyBjb3VudCA6IDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRTaG93U3ViYWdlbnRNb2RlbChzdWJhZ2VudE1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXJlbnRNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHBhcmVudE1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXJlbnRNb2RlbE1ldGFkYXRhSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoIXN1YmFnZW50TW9kZWxOYW1lKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IG5vcm1hbGl6ZWRTdWJhZ2VudE1vZGVsID0gc3ViYWdlbnRNb2RlbE5hbWUudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdGNvbnN0IHBhcmVudE1vZGVsSWRTdWZmaXggPSBwYXJlbnRNb2RlbElkPy5zbGljZShwYXJlbnRNb2RlbElkLmxhc3RJbmRleE9mKCc6JykgKyAxKTtcblx0cmV0dXJuICFbcGFyZW50TW9kZWxJZCwgcGFyZW50TW9kZWxJZFN1ZmZpeCwgcGFyZW50TW9kZWxOYW1lLCBwYXJlbnRNb2RlbE1ldGFkYXRhSWRdXG5cdFx0LnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZT8udHJpbSgpLnRvTG93ZXJDYXNlKCkgPT09IG5vcm1hbGl6ZWRTdWJhZ2VudE1vZGVsKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlT3BlblN1YmFnZW50QWN0aW9uKGFjdGlvbjogSUFjdGlvbik6IEFjdGlvbiB7XG5cdGNvbnN0IHByb3h5ID0gbmV3IEFjdGlvbihhY3Rpb24uaWQsIGFjdGlvbi5sYWJlbCwgYWN0aW9uLmNsYXNzLCBmYWxzZSwgY29udGV4dCA9PiBhY3Rpb24ucnVuKGNvbnRleHQpKTtcblx0cHJveHkudG9vbHRpcCA9IGFjdGlvbi50b29sdGlwO1xuXHRyZXR1cm4gcHJveHk7XG59XG5cbmNsYXNzIE9wZW5TdWJhZ2VudENoYXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENIQVRfT1BFTl9BR0VOVF9IT1NUX0NIQVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQuc3ViYWdlbnQub3BlbkNoYXQnLCBcIk9wZW4gU3ViYWdlbnRcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uLFxuXHRcdFx0Ly8gQ29udGV4dHVhbDogaW52b2tlZCBmcm9tIGEgc3BlY2lmaWMgc3ViYWdlbnQncyBoZWFkZXIgdG9vbGJhciwgd2hpY2hcblx0XHRcdC8vIGZvcndhcmRzIHRoYXQgc3ViYWdlbnQncyBjaGF0IHJlc291cmNlLiBOb3QgYSBwYWxldHRlIGNvbW1hbmQuXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7IGlkOiBNZW51SWQuQ2hhdFN1YmFnZW50Q29udGVudCwgZ3JvdXA6ICduYXZpZ2F0aW9uJyB9LFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0Pzogc3RyaW5nIHwgSU9wZW5TdWJhZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBjb250ZXh0Q2hhdFJlc291cmNlKGNvbnRleHQpO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTZXNzaW9uc1NlcnZpY2UpO1xuXG5cdFx0Ly8gVGhlIHBpbGwgaXMgY2xpY2tlZCBmcm9tIHdpdGhpbiB0aGUgbGVhZCBjaGF0J3MgdHJhbnNjcmlwdCwgc28gdGhlXG5cdFx0Ly8gc3ViYWdlbnQgcGVlciBub3JtYWxseSBsaXZlcyBpbiB0aGUgY3VycmVudGx5IGFjdGl2ZSBzZXNzaW9uOyB0aGUgZmluZGVyXG5cdFx0Ly8gZmFsbHMgYmFjayB0byBzY2FubmluZyBhbGwgdmlzaWJsZSBzZXNzaW9ucyBpbiBjYXNlIHRoZSBhY3RpdmUgc2xvdFxuXHRcdC8vIGRpZmZlcnMuXG5cdFx0Y29uc3QgbWF0Y2ggPSBmaW5kU3ViYWdlbnRDaGF0KHNlc3Npb25zU2VydmljZSwgcmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRhd2FpdCBzZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQobWF0Y2guc2Vzc2lvbiwgbWF0Y2guY2hhdC5yZXNvdXJjZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlID0gYWN0aXZlPy5jaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkpLmpvaW4oJywgJykgPz8gJyhub25lKSc7XG5cdFx0bG9nU2VydmljZS53YXJuKGBbU2Vzc2lvbnNdIENhbm5vdCBvcGVuIHN1YmFnZW50IGNoYXQgZm9yIHJlc291cmNlICcke3Jlc291cmNlfScgKGNoYXRJZD0nJHtjaGF0SWRGcm9tUmVzb3VyY2UocmVzb3VyY2UpfScpLiBBdmFpbGFibGUgY2hhdHM6ICR7YXZhaWxhYmxlfWApO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoT3BlblN1YmFnZW50Q2hhdEFjdGlvbik7XG5cbi8qKlxuICogUmVuZGVycyB0aGUgXCJPcGVuIFN1YmFnZW50XCIgcGlsbCBhcyBhIHN0YW5kYWxvbmUgY2hpcCAoc3R5bGVkIGxpa2UgdGhlIGNoYXRcbiAqIGZpbGUvZGlmZiBwaWxsKS4gU2VlIFNFU1NJT05TLm1kIGFuZCBgLi9tZWRpYS9vcGVuU3ViYWdlbnRDaGF0LmNzc2AgZm9yIGRldGFpbHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NvdXJjZUFjdGlvbjogSUFjdGlvbjtcblx0cHJpdmF0ZSBfcmVzb2x2ZWRUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb25maXJtYXRpb25Db3VudCA9IDA7XG5cdHByaXZhdGUgX2NvbmZpcm1hdGlvbkFjdGl2ZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9zdGF0dXM6IFNlc3Npb25TdGF0dXMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3Bpbm5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kdXJhdGlvblRpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFdpbmRvd0ludGVydmFsVGltZXIoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xUcmFuc2l0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVRvb2xSZW5kZXJlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlVG9vbEZpbGVXaWRnZXRzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfbGFiZWxFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbW9kZWxFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWN0aXZlVG9vbEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hY3RpdmVUb29sSWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hY3RpdmVUb29sTGFiZWxFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY29uZmlybWF0aW9uQ291bnRFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kdXJhdGlvbkVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdGFydGVkQXQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZW5kZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZXBvcnRlZE1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlzcGxheWVkVG9vbExhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rpc3BsYXllZFRvb2xJY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rpc3BsYXllZFRvb2xBY2Nlc3NpYmxlTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGFyZ2V0VG9vbExhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3RhcmdldFRvb2xJY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Rvb2xUcmFuc2l0aW9uUGhhc2U6ICdpZGxlJyB8ICdvdXQnIHwgJ2luJyA9ICdpZGxlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250ZXh0OiB1bmtub3duLFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdE1hcmtkb3duQW5jaG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRNYXJrZG93bkFuY2hvclNlcnZpY2U6IElDaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb250ZXh0LCBjcmVhdGVPcGVuU3ViYWdlbnRBY3Rpb24oYWN0aW9uKSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5fc291cmNlQWN0aW9uID0gYWN0aW9uO1xuXHRcdGlmICh0aGlzLl9hY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FjdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2Uub25EaWRDaGFuZ2VSZWR1Y2VkTW90aW9uKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaFRvb2xUcmFuc2l0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMoKCkgPT4gdGhpcy5fdXBkYXRlVGl0bGVUcmFja2VyKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gQmFzZSByZW5kZXIgd2lyZXMgbW91c2UgY2xpY2sgb24gdGhlIGNvbnRhaW5lcjsgdGhlIGFjdGlvbmJhciB3aXJlc1xuXHRcdC8vIGtleWJvYXJkIChFbnRlci9TcGFjZSkgdmlhIGBkb1RyaWdnZXJgLCBzbyBib3RoIGRpc3BhdGNoIHRoZSBhY3Rpb24uXG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtc3ViYWdlbnQtcGlsbC13aWRnZXQnKTtcblx0XHQvLyBUaGUgQWN0aW9uQmFyIGNyZWF0ZXMgdGhlIGA8bGk+YCB3aXRoIHJvbGU9XCJwcmVzZW50YXRpb25cIjsgbWFyayBpdCBhcyBhblxuXHRcdC8vIGFjdGlvbmFibGUgY29udHJvbCBmb3Igc2NyZWVuIHJlYWRlcnMuXG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblxuXHRcdHRoaXMuX2ljb25FbGVtZW50ID0gJCgnc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtaWNvbicpO1xuXHRcdHRoaXMuX2ljb25FbGVtZW50LmFwcGVuZENoaWxkKCQoYHNwYW4uY2hhdC1zdWJhZ2VudC1waWxsLW9wZW4taWNvbiR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbil9YCkpO1xuXHRcdHRoaXMuX2xhYmVsRWxlbWVudCA9ICQoJ3NwYW4uY2hhdC1zdWJhZ2VudC1waWxsLWxhYmVsJyk7XG5cdFx0dGhpcy5fbW9kZWxFbGVtZW50ID0gJCgnc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtbW9kZWwuaGlkZGVuJyk7XG5cdFx0dGhpcy5fY29uZmlybWF0aW9uQ291bnRFbGVtZW50ID0gJCgnc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtY29uZmlybWF0aW9uLWNvdW50Jyk7XG5cdFx0Y29uc3QgcGlsbENvbnRlbnQgPSAkKCdzcGFuLmNoYXQtc3ViYWdlbnQtcGlsbC1jb250ZW50Jyk7XG5cdFx0Y29uc3QgcGlsbEhlYWRlciA9ICQoJ3NwYW4uY2hhdC1zdWJhZ2VudC1waWxsLWhlYWRlcicpO1xuXHRcdHRoaXMuX2R1cmF0aW9uRWxlbWVudCA9ICQoJ3NwYW4uY2hhdC1zdWJhZ2VudC1waWxsLWR1cmF0aW9uJyk7XG5cdFx0dGhpcy5fYWN0aXZlVG9vbEVsZW1lbnQgPSAkKCdzcGFuLmNoYXQtc3ViYWdlbnQtcGlsbC1hY3RpdmUtdG9vbCcpO1xuXHRcdHRoaXMuX2FjdGl2ZVRvb2xFbGVtZW50LmluZXJ0ID0gdHJ1ZTtcblx0XHRjb25zdCBjb25uZWN0b3IgPSAkKCdzcGFuLmNoYXQtc3ViYWdlbnQtcGlsbC1hY3RpdmUtdG9vbC1jb25uZWN0b3InKTtcblx0XHRjb25uZWN0b3Iuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5fYWN0aXZlVG9vbEljb25FbGVtZW50ID0gJCgnc3Bhbi5jaGF0LXN1YmFnZW50LXBpbGwtYWN0aXZlLXRvb2wtaWNvbicpO1xuXHRcdHRoaXMuX2FjdGl2ZVRvb2xJY29uRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50ID0gJCgnLmNoYXQtc3ViYWdlbnQtcGlsbC1hY3RpdmUtdG9vbC1sYWJlbCcpO1xuXHRcdHRoaXMuX2FjdGl2ZVRvb2xFbGVtZW50LmFwcGVuZChjb25uZWN0b3IsIHRoaXMuX2FjdGl2ZVRvb2xJY29uRWxlbWVudCwgdGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudCk7XG5cdFx0cGlsbENvbnRlbnQuYXBwZW5kKHRoaXMuX2ljb25FbGVtZW50LCB0aGlzLl9sYWJlbEVsZW1lbnQsIHRoaXMuX21vZGVsRWxlbWVudCwgdGhpcy5fY29uZmlybWF0aW9uQ291bnRFbGVtZW50KTtcblx0XHRwaWxsSGVhZGVyLmFwcGVuZChwaWxsQ29udGVudCwgdGhpcy5fZHVyYXRpb25FbGVtZW50KTtcblx0XHRjb250YWluZXIuYXBwZW5kKHBpbGxIZWFkZXIsIHRoaXMuX2FjdGl2ZVRvb2xFbGVtZW50KTtcblx0XHR0aGlzLl9sYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSB0aGlzLl9sYWJlbFRleHQoKTtcblxuXHRcdHRoaXMuX3VwZGF0ZUNvbmZpcm1hdGlvbkNvdW50KCk7XG5cdFx0dGhpcy5fdXBkYXRlRHVyYXRpb24oKTtcblx0XHR0aGlzLl91cGRhdGVNZXRhZGF0YSgpO1xuXHRcdHRoaXMuX3VwZGF0ZVRpdGxlVHJhY2tlcigpO1xuXHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdHRoaXMudXBkYXRlRW5hYmxlZCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0QWN0aW9uQ29udGV4dChuZXdDb250ZXh0OiB1bmtub3duKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0QWN0aW9uQ29udGV4dChuZXdDb250ZXh0KTtcblx0XHR0aGlzLl91cGRhdGVDb25maXJtYXRpb25Db3VudCgpO1xuXHRcdHRoaXMuX3VwZGF0ZUR1cmF0aW9uKCk7XG5cdFx0dGhpcy5fdXBkYXRlTWV0YWRhdGEoKTtcblx0XHR0aGlzLl91cGRhdGVUaXRsZVRyYWNrZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZU1ldGFkYXRhKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRleHQgPSB0aGlzLl9jb250ZXh0ICYmIHR5cGVvZiB0aGlzLl9jb250ZXh0ID09PSAnb2JqZWN0JyA/IHRoaXMuX2NvbnRleHQgYXMgSU9wZW5TdWJhZ2VudENoYXRDb250ZXh0IDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlcG9ydGVkTW9kZWxOYW1lID0gY29udGV4dD8ubW9kZWxOYW1lO1xuXHRcdHRoaXMuX3NldEFjdGl2ZVRvb2woY29udGV4dD8uYWN0aXZlVG9vbExhYmVsLCBjb250ZXh0Py5hY3RpdmVUb29sSWNvbik7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRBY3RpdmVUb29sKGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3RhcmdldFRvb2xMYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuX3RhcmdldFRvb2xJY29uID0gaWNvbjtcblx0XHRpZiAoIXRoaXMuX2FjdGl2ZVRvb2xFbGVtZW50IHx8ICF0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZVRvb2xFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFsYWJlbCk7XG5cdFx0aWYgKCFsYWJlbCkge1xuXHRcdFx0dGhpcy5fdG9vbFRyYW5zaXRpb24uY2xlYXIoKTtcblx0XHRcdHRoaXMuX3Rvb2xUcmFuc2l0aW9uUGhhc2UgPSAnaWRsZSc7XG5cdFx0XHR0aGlzLl9jbGVhclRvb2xUcmFuc2l0aW9uQ2xhc3NlcygpO1xuXHRcdFx0dGhpcy5fYWN0aXZlVG9vbFJlbmRlcmVkLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVUb29sRmlsZVdpZGdldHMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRoaXMuX2Rpc3BsYXllZFRvb2xMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2Rpc3BsYXllZFRvb2xJY29uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fZGlzcGxheWVkVG9vbEFjY2Vzc2libGVMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3JlbmRlckFjdGl2ZVRvb2xJY29uKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHRcdHRoaXMudXBkYXRlQXJpYUxhYmVsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZGlzcGxheWVkVG9vbExhYmVsIHx8IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkpIHtcblx0XHRcdHRoaXMuX2ZpbmlzaFRvb2xUcmFuc2l0aW9uKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3J1blRvb2xUcmFuc2l0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIF9ydW5Ub29sVHJhbnNpdGlvbigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQgfHwgdGhpcy5fdG9vbFRyYW5zaXRpb25QaGFzZSAhPT0gJ2lkbGUnXG5cdFx0XHR8fCAodGhpcy5fdGFyZ2V0VG9vbExhYmVsID09PSB0aGlzLl9kaXNwbGF5ZWRUb29sTGFiZWwgJiYgdGhpcy5fdGFyZ2V0VG9vbEljb24/LmlkID09PSB0aGlzLl9kaXNwbGF5ZWRUb29sSWNvbj8uaWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Rvb2xUcmFuc2l0aW9uUGhhc2UgPSAnb3V0Jztcblx0XHRpZiAoIXRoaXMuX3Jlc3RhcnRUb29sVHJhbnNpdGlvbignY2hhdC1zdWJhZ2VudC10b29sLWZhZGUtb3V0JykpIHtcblx0XHRcdHRoaXMuX2NvbXBsZXRlVG9vbFRyYW5zaXRpb24oKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb21wbGV0ZVRvb2xUcmFuc2l0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rvb2xUcmFuc2l0aW9uLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX3Rvb2xUcmFuc2l0aW9uUGhhc2UgPT09ICdvdXQnKSB7XG5cdFx0XHR0aGlzLl90b29sVHJhbnNpdGlvblBoYXNlID0gJ2luJztcblx0XHRcdHRoaXMuX3NldERpc3BsYXllZFRvb2wodGhpcy5fdGFyZ2V0VG9vbExhYmVsID8/ICcnLCB0aGlzLl90YXJnZXRUb29sSWNvbik7XG5cdFx0XHRpZiAoIXRoaXMuX3Jlc3RhcnRUb29sVHJhbnNpdGlvbignY2hhdC1zdWJhZ2VudC10b29sLWZhZGUtaW4nKSkge1xuXHRcdFx0XHR0aGlzLl9jb21wbGV0ZVRvb2xUcmFuc2l0aW9uKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90b29sVHJhbnNpdGlvblBoYXNlID09PSAnaW4nKSB7XG5cdFx0XHR0aGlzLl9jbGVhclRvb2xUcmFuc2l0aW9uQ2xhc3NlcygpO1xuXHRcdFx0dGhpcy5fdG9vbFRyYW5zaXRpb25QaGFzZSA9ICdpZGxlJztcblx0XHRcdHRoaXMuX3J1blRvb2xUcmFuc2l0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZmluaXNoVG9vbFRyYW5zaXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9vbFRyYW5zaXRpb24uY2xlYXIoKTtcblx0XHR0aGlzLl90b29sVHJhbnNpdGlvblBoYXNlID0gJ2lkbGUnO1xuXHRcdHRoaXMuX2NsZWFyVG9vbFRyYW5zaXRpb25DbGFzc2VzKCk7XG5cdFx0aWYgKHRoaXMuX3RhcmdldFRvb2xMYWJlbCkge1xuXHRcdFx0dGhpcy5fc2V0RGlzcGxheWVkVG9vbCh0aGlzLl90YXJnZXRUb29sTGFiZWwsIHRoaXMuX3RhcmdldFRvb2xJY29uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXREaXNwbGF5ZWRUb29sKGxhYmVsOiBzdHJpbmcsIGljb246IFRoZW1lSWNvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVUb29sUmVuZGVyZWQuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FjdGl2ZVRvb2xGaWxlV2lkZ2V0cy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcobGFiZWwpLCB1bmRlZmluZWQsIHRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQpO1xuXHRcdFx0cmVuZGVyRmlsZVdpZGdldHMocmVuZGVyZWQuZWxlbWVudCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5jaGF0TWFya2Rvd25BbmNob3JTZXJ2aWNlLCB0aGlzLl9hY3RpdmVUb29sRmlsZVdpZGdldHMpO1xuXHRcdFx0dGhpcy5fYWN0aXZlVG9vbFJlbmRlcmVkLnZhbHVlID0gcmVuZGVyZWQ7XG5cdFx0XHR0aGlzLl9kaXNwbGF5ZWRUb29sTGFiZWwgPSBsYWJlbDtcblx0XHRcdHRoaXMuX2Rpc3BsYXllZFRvb2xJY29uID0gaWNvbjtcblx0XHRcdHRoaXMuX2Rpc3BsYXllZFRvb2xBY2Nlc3NpYmxlTGFiZWwgPSByZW5kZXJlZC5lbGVtZW50LnRleHRDb250ZW50Py5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpIHx8IGxhYmVsO1xuXHRcdFx0dGhpcy5fcmVuZGVyQWN0aXZlVG9vbEljb24oaWNvbik7XG5cdFx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHRcdHRoaXMudXBkYXRlQXJpYUxhYmVsKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQWN0aXZlVG9vbEljb24oaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hY3RpdmVUb29sSWNvbkVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlVG9vbEljb25FbGVtZW50LmNsYXNzTmFtZSA9ICdjaGF0LXN1YmFnZW50LXBpbGwtYWN0aXZlLXRvb2wtaWNvbic7XG5cdFx0aWYgKGljb24pIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVRvb2xJY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhclRvb2xUcmFuc2l0aW9uQ2xhc3NlcygpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50Py5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXN1YmFnZW50LXRvb2wtZmFkZS1pbicsICdjaGF0LXN1YmFnZW50LXRvb2wtZmFkZS1vdXQnKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RhcnRUb29sVHJhbnNpdGlvbihjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlVG9vbExhYmVsRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl90b29sVHJhbnNpdGlvbi5jbGVhcigpO1xuXHRcdHRoaXMuX2NsZWFyVG9vbFRyYW5zaXRpb25DbGFzc2VzKCk7XG5cdFx0Y29uc3QgdHJhbnNpdGlvbiA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IChldmVudDogQW5pbWF0aW9uRXZlbnQpID0+IHtcblx0XHRcdGlmIChldmVudC50YXJnZXQgPT09IHRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fY29tcGxldGVUb29sVHJhbnNpdGlvbigpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dHJhbnNpdGlvbi5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQsIEV2ZW50VHlwZS5BTklNQVRJT05fRU5ELCBjb21wbGV0ZSkpO1xuXHRcdHRyYW5zaXRpb24uYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50LCAnYW5pbWF0aW9uY2FuY2VsJywgY29tcGxldGUpKTtcblx0XHR0aGlzLl90b29sVHJhbnNpdGlvbi52YWx1ZSA9IHRyYW5zaXRpb247XG5cdFx0dm9pZCB0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50Lm9mZnNldFdpZHRoO1xuXHRcdHRoaXMuX2FjdGl2ZVRvb2xMYWJlbEVsZW1lbnQuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuXHRcdGlmICh0aGlzLl9hY3RpdmVUb29sTGFiZWxFbGVtZW50LmdldEFuaW1hdGlvbnMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3Rvb2xUcmFuc2l0aW9uLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9jbGVhclRvb2xUcmFuc2l0aW9uQ2xhc3NlcygpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNvbmZpcm1hdGlvbkNvdW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvdW50ID0gY29udGV4dENvbmZpcm1hdGlvbkNvdW50KHRoaXMuX2NvbnRleHQpO1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvbkFjdGl2ZSA9ICEhKHRoaXMuX2NvbnRleHQgJiYgdHlwZW9mIHRoaXMuX2NvbnRleHQgPT09ICdvYmplY3QnICYmICh0aGlzLl9jb250ZXh0IGFzIElPcGVuU3ViYWdlbnRDaGF0Q29udGV4dCkuY29uZmlybWF0aW9uQWN0aXZlKTtcblx0XHRpZiAoY291bnQgPT09IHRoaXMuX2NvbmZpcm1hdGlvbkNvdW50ICYmIGNvbmZpcm1hdGlvbkFjdGl2ZSA9PT0gdGhpcy5fY29uZmlybWF0aW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbmZpcm1hdGlvbkNvdW50ID0gY291bnQ7XG5cdFx0dGhpcy5fY29uZmlybWF0aW9uQWN0aXZlID0gY29uZmlybWF0aW9uQWN0aXZlO1xuXHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1zdWJhZ2VudC1uZWVkcy1jb25maXJtYXRpb24nLCBjb3VudCA+IDApO1xuXHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1zdWJhZ2VudC1oYXMtbXVsdGlwbGUtY29uZmlybWF0aW9ucycsIGNvdW50ID4gMSk7XG5cdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXN1YmFnZW50LWNvbmZpcm1hdGlvbi1hY3RpdmUnLCBjb3VudCA+IDAgJiYgY29uZmlybWF0aW9uQWN0aXZlKTtcblx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtc3ViYWdlbnQtY29uZmlybWF0aW9uLXBlbmRpbmcnLCBjb3VudCA+IDAgJiYgIWNvbmZpcm1hdGlvbkFjdGl2ZSk7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1hdGlvbkNvdW50RWxlbWVudCkge1xuXHRcdFx0dGhpcy5fY29uZmlybWF0aW9uQ291bnRFbGVtZW50LnRleHRDb250ZW50ID0gU3RyaW5nKGNvdW50KTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblx0fVxuXG5cdC8qKiBUcmFja3MgdGhlIHJlc29sdmVkIHN1YmFnZW50IGNoYXQncyB0aXRsZSBhbmQgYWN0aXZlIHN0YXRlLiAqL1xuXHRwcml2YXRlIF91cGRhdGVUaXRsZVRyYWNrZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBjb250ZXh0Q2hhdFJlc291cmNlKHRoaXMuX2NvbnRleHQpO1xuXHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuX3RpdGxlVHJhY2tlci5jbGVhcigpO1xuXHRcdFx0dGhpcy5fc2V0RW5hYmxlZChmYWxzZSk7XG5cdFx0XHR0aGlzLl9zZXRSZXNvbHZlZFRpdGxlKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zZXRNb2RlbE5hbWUodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3NldFN0YXR1cyh1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90aXRsZVRyYWNrZXIudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IGZpbmRTdWJhZ2VudENoYXQodGhpcy5zZXNzaW9uc1NlcnZpY2UsIHJlc291cmNlLCByZWFkZXIpO1xuXHRcdFx0Y29uc3QgY2hhdCA9IG1hdGNoPy5jaGF0O1xuXHRcdFx0Y29uc3QgcGFyZW50Q2hhdCA9IGNoYXQ/Lm9yaWdpbj8ucGFyZW50Q2hhdFxuXHRcdFx0XHQ/IG1hdGNoPy5zZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKS5maW5kKGNhbmRpZGF0ZSA9PiBpc0VxdWFsKGNhbmRpZGF0ZS5yZXNvdXJjZSwgY2hhdC5vcmlnaW4/LnBhcmVudENoYXQpKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHBhcmVudE1vZGVsSWQgPSBwYXJlbnRDaGF0Py5tb2RlbElkLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHBhcmVudE1vZGVsID0gcGFyZW50TW9kZWxJZCA/IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwocGFyZW50TW9kZWxJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zZXRFbmFibGVkKCEhY2hhdCk7XG5cdFx0XHR0aGlzLl9zZXRSZXNvbHZlZFRpdGxlKGNoYXQ/LnRpdGxlLnJlYWQocmVhZGVyKSB8fCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc2V0TW9kZWxOYW1lKHNob3VsZFNob3dTdWJhZ2VudE1vZGVsKHRoaXMuX3JlcG9ydGVkTW9kZWxOYW1lLCBwYXJlbnRNb2RlbElkLCBwYXJlbnRNb2RlbD8ubmFtZSwgcGFyZW50TW9kZWw/LmlkKSA/IHRoaXMuX3JlcG9ydGVkTW9kZWxOYW1lIDogdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3NldFN0YXR1cyhjaGF0Py5zdGF0dXMucmVhZChyZWFkZXIpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldE1vZGVsTmFtZShtb2RlbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChtb2RlbE5hbWUgPT09IHRoaXMuX21vZGVsTmFtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbE5hbWUgPSBtb2RlbE5hbWU7XG5cdFx0aWYgKHRoaXMuX21vZGVsRWxlbWVudCkge1xuXHRcdFx0dGhpcy5fbW9kZWxFbGVtZW50LnRleHRDb250ZW50ID0gbW9kZWxOYW1lID8/ICcnO1xuXHRcdFx0dGhpcy5fbW9kZWxFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFtb2RlbE5hbWUpO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHR0aGlzLnVwZGF0ZUFyaWFMYWJlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aW9uLmVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdHRoaXMuX3NvdXJjZUFjdGlvbi5lbmFibGVkID0gZW5hYmxlZDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUR1cmF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX2R1cmF0aW9uVGltZXIuY2FuY2VsKCk7XG5cdFx0Y29uc3QgdGltaW5nID0gY29udGV4dFN1YmFnZW50VGltaW5nKHRoaXMuX2NvbnRleHQpO1xuXHRcdHRoaXMuX3N0YXJ0ZWRBdCA9IHRpbWluZy5zdGFydGVkQXQ7XG5cdFx0dGhpcy5fZW5kZWRBdCA9IHRpbWluZy5zdGFydGVkQXQgIT09IHVuZGVmaW5lZCAmJiB0aW1pbmcuZHVyYXRpb24gIT09IHVuZGVmaW5lZCA/IHRpbWluZy5zdGFydGVkQXQgKyB0aW1pbmcuZHVyYXRpb24gOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdXBkYXRlRHVyYXRpb25MYWJlbCgpO1xuXHRcdGlmICh0aGlzLl9zdGFydGVkQXQgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9lbmRlZEF0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2R1cmF0aW9uVGltZXIuY2FuY2VsQW5kU2V0KCgpID0+IHRoaXMuX3VwZGF0ZUR1cmF0aW9uTGFiZWwoKSwgMTAwMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRHVyYXRpb25MYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2R1cmF0aW9uRWxlbWVudCB8fCB0aGlzLl9zdGFydGVkQXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZHVyYXRpb25FbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHRcdHRoaXMudXBkYXRlQXJpYUxhYmVsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVuZCA9IHRoaXMuX2VuZGVkQXQgPz8gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBkdXJhdGlvbiA9IGZvcm1hdEVsYXBzZWRUaW1lKE1hdGgubWF4KDAsIGVuZCAtIHRoaXMuX3N0YXJ0ZWRBdCkpO1xuXHRcdHRoaXMuX2R1cmF0aW9uRWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuX2VuZGVkQXQgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC53b3JraW5nRHVyYXRpb24nLCBcIldvcmtpbmcgZm9yIHswfVwiLCBkdXJhdGlvbilcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQud29ya2VkRHVyYXRpb24nLCBcIldvcmtlZCBmb3IgezB9XCIsIGR1cmF0aW9uKTtcblx0XHR0aGlzLl9kdXJhdGlvbkVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZGVuJyk7XG5cdFx0dGhpcy51cGRhdGVBcmlhTGFiZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFN0YXR1cyhzdGF0dXM6IFNlc3Npb25TdGF0dXMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoc3RhdHVzID09PSB0aGlzLl9zdGF0dXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdHVzID0gc3RhdHVzO1xuXHRcdGNvbnN0IHJ1bm5pbmcgPSBzdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHRjb25zdCB3YWl0aW5nID0gc3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ7XG5cdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXN1YmFnZW50LXJ1bm5pbmcnLCBydW5uaW5nKTtcblx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtc3ViYWdlbnQtd2FpdGluZycsIHdhaXRpbmcpO1xuXHRcdHRoaXMuX3NwaW5uZXIuY2xlYXIoKTtcblx0XHRpZiAoKHJ1bm5pbmcgfHwgd2FpdGluZykgJiYgdGhpcy5faWNvbkVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3Qgc3Bpbm5lciA9IHN0b3JlLmFkZChjcmVhdGVQaXhlbFNwaW5uZXIodGhpcy5faWNvbkVsZW1lbnQsIHsgdmFyaWFudDogd2FpdGluZyA/ICdyaW5nJyA6ICdncmlkJyB9KSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNwaW5uZXIuZWxlbWVudC5yZW1vdmUoKSkpO1xuXHRcdFx0dGhpcy5fc3Bpbm5lci52YWx1ZSA9IHN0b3JlO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUFyaWFMYWJlbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UmVzb2x2ZWRUaXRsZSh0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRpdGxlICE9PSB0aGlzLl9yZXNvbHZlZFRpdGxlKSB7XG5cdFx0XHR0aGlzLl9yZXNvbHZlZFRpdGxlID0gdGl0bGU7XG5cdFx0XHRpZiAodGhpcy5fbGFiZWxFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX2xhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuX2xhYmVsVGV4dCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUFyaWFMYWJlbCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xhYmVsVGV4dCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlZFRpdGxlIHx8IHRoaXMuX2FjdGlvbi5sYWJlbDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGV0YWlsczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5fY29uZmlybWF0aW9uQ291bnQgPiAwKSB7XG5cdFx0XHRkZXRhaWxzLnB1c2godGhpcy5fY29uZmlybWF0aW9uQ291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5vcGVuQ2hhdC5jb25maXJtYXRpb25Ub29sdGlwJywgXCJPcGVuIHN1YmFnZW50IGNoYXQgKDEgY29uZmlybWF0aW9uIG5lZWRlZClcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5vcGVuQ2hhdC5jb25maXJtYXRpb25zVG9vbHRpcCcsIFwiT3BlbiBzdWJhZ2VudCBjaGF0ICh7MH0gY29uZmlybWF0aW9ucyBuZWVkZWQpXCIsIHRoaXMuX2NvbmZpcm1hdGlvbkNvdW50KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFjdGlvbkxhYmVsID0gdGhpcy5fYWN0aW9uLnRvb2x0aXAgfHwgdGhpcy5fYWN0aW9uLmxhYmVsO1xuXHRcdFx0aWYgKGFjdGlvbkxhYmVsKSB7XG5cdFx0XHRcdGRldGFpbHMucHVzaChhY3Rpb25MYWJlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9tb2RlbE5hbWUpIHtcblx0XHRcdGRldGFpbHMucHVzaChsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5tb2RlbFRvb2x0aXAnLCBcIk1vZGVsOiB7MH1cIiwgdGhpcy5fbW9kZWxOYW1lKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kaXNwbGF5ZWRUb29sQWNjZXNzaWJsZUxhYmVsKSB7XG5cdFx0XHRkZXRhaWxzLnB1c2gobG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuYWN0aXZlVG9vbFRvb2x0aXAnLCBcIkFjdGl2ZSB0b29sOiB7MH1cIiwgdGhpcy5fZGlzcGxheWVkVG9vbEFjY2Vzc2libGVMYWJlbCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZGV0YWlscy5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJykgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUVuYWJsZWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2FjdGlvbi5lbmFibGVkO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICFlbmFibGVkKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIWVuYWJsZWQpO1xuXHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBTdHJpbmcoIWVuYWJsZWQpKTtcblx0XHR0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsIFN0cmluZyghZW5hYmxlZCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUFyaWFMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBvcGVuTGFiZWwgPSB0aGlzLl9yZXNvbHZlZFRpdGxlXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50Lm9wZW5DaGF0LmFyaWEnLCBcIk9wZW4gc3ViYWdlbnQgY2hhdDogezB9XCIsIHRoaXMuX3Jlc29sdmVkVGl0bGUpXG5cdFx0XHQ6IHRoaXMuX2FjdGlvbi5sYWJlbDtcblx0XHRjb25zdCBzdGF0dXNMYWJlbCA9IHRoaXMuX3N0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LnN0YXR1cy53b3JraW5nJywgXCJTdWJhZ2VudCBpcyB3b3JraW5nXCIpXG5cdFx0XHQ6IHRoaXMuX3N0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0XG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuc3RhdHVzLndhaXRpbmcnLCBcIlN1YmFnZW50IGlzIHdhaXRpbmcgZm9yIGlucHV0XCIpXG5cdFx0XHRcdDogdGhpcy5fc3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZFxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuc3ViYWdlbnQuc3RhdHVzLmNvbXBsZXRlZCcsIFwiU3ViYWdlbnQgY29tcGxldGVkXCIpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29uZmlybWF0aW9uTGFiZWwgPSB0aGlzLl9jb25maXJtYXRpb25Db3VudCA+IDBcblx0XHRcdD8gdGhpcy5fY29uZmlybWF0aW9uQ291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5jb25maXJtYXRpb25BcmlhJywgXCIxIGNvbmZpcm1hdGlvbiBuZWVkZWRcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5zdWJhZ2VudC5jb25maXJtYXRpb25zQXJpYScsIFwiezB9IGNvbmZpcm1hdGlvbnMgbmVlZGVkXCIsIHRoaXMuX2NvbmZpcm1hdGlvbkNvdW50KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9kZWxMYWJlbCA9IHRoaXMuX21vZGVsTmFtZSA/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50Lm1vZGVsQXJpYScsIFwiTW9kZWwgezB9XCIsIHRoaXMuX21vZGVsTmFtZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aXZlVG9vbExhYmVsID0gdGhpcy5fZGlzcGxheWVkVG9vbEFjY2Vzc2libGVMYWJlbCA/IGxvY2FsaXplKCdjaGF0LnN1YmFnZW50LmFjdGl2ZVRvb2xBcmlhJywgXCJBY3RpdmUgdG9vbCB7MH1cIiwgdGhpcy5fZGlzcGxheWVkVG9vbEFjY2Vzc2libGVMYWJlbCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gW29wZW5MYWJlbCwgc3RhdHVzTGFiZWwsIG1vZGVsTGFiZWwsIGFjdGl2ZVRvb2xMYWJlbCwgY29uZmlybWF0aW9uTGFiZWwsIHRoaXMuX2R1cmF0aW9uRWxlbWVudD8udGV4dENvbnRlbnQgfHwgdW5kZWZpbmVkXS5maWx0ZXIodmFsdWUgPT4gISF2YWx1ZSkuam9pbignLiAnKTtcblx0XHRpZiAoYXJpYUxhYmVsKSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgYXJpYUxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIFwiT3BlbiBTdWJhZ2VudFwiIGFjdGlvbiBjb250cmlidXRlZCBpbnRvIHRoZSBzdWJhZ2VudCBoZWFkZXJcbiAqICh7QGxpbmsgTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnR9KSBhcyB0aGUgc2FtZSBjb21wYWN0IHNlY29uZGFyeS1idXR0b24gcGlsbFxuICogdXNlZCBpbiB0aGUgc2Vzc2lvbiBoZWFkZXIgbWV0YSByb3cuIFJlZ2lzdGVyZWQgZm9yIGV2ZXJ5IGFnZW50IGhvc3Qgc2Vzc2lvblxuICogKGxvY2FsIGFuZCByZW1vdGUpOiB0aGUgZmlsZSBpcyBpbXBvcnRlZCBmb3Igc2lkZSBlZmZlY3QgYnkgYm90aCB0aGUgZGVza3RvcFxuICogYW5kIHdlYiBBZ2VudHMtd2luZG93IGVudHJ5IHBvaW50cy4gQmVjYXVzZSBpdCBpcyBjb250cmlidXRlZCBvbmx5IGluIHRoZVxuICogQWdlbnRzIHdpbmRvdywgdGhlIHJlZ3VsYXIgY2hhdCB2aWV3J3Mgc3ViYWdlbnQgaGVhZGVyIHN0YXlzIGVtcHR5LlxuICovXG5jbGFzcyBPcGVuU3ViYWdlbnRDaGF0QWN0aW9uVmlld0l0ZW1Db250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gVGhlIGFjdGlvbiB2aWV3IGl0ZW0gc2VydmljZSBvbmx5IG5vdGlmaWVzIHRvb2xiYXJzIG9mIGEgZmFjdG9yeSB2aWFcblx0XHQvLyB0aGUgZXZlbnQgcGFzc2VkIHRvIHJlZ2lzdGVyKCksIG5vdCBvbiByZWdpc3RyYXRpb24gaXRzZWxmLiBBbm5vdW5jZVxuXHRcdC8vIHRoZSBmYWN0b3J5IG9uY2UgcmlnaHQgYWZ0ZXIgcmVnaXN0ZXJpbmcgc28gYW55IHN1YmFnZW50IGhlYWRlciB0b29sYmFyXG5cdFx0Ly8gY3JlYXRlZCBlYXJsaWVyIHJlLXJlbmRlcnMgYW5kIHBpY2tzIHVwIHRoZSBwaWxsLlxuXHRcdGNvbnN0IG9uRGlkUmVnaXN0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoTWVudUlkLkNoYXRTdWJhZ2VudENvbnRlbnQsIENIQVRfT1BFTl9BR0VOVF9IT1NUX0NIQVRfQ09NTUFORF9JRCwgKGFjdGlvbiwgb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbSwgdW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdH0sIG9uRGlkUmVnaXN0ZXIuZXZlbnQpKTtcblx0XHRvbkRpZFJlZ2lzdGVyLmZpcmUoKTtcblx0fVxufVxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKE9wZW5TdWJhZ2VudENoYXRBY3Rpb25WaWV3SXRlbUNvbnRyaWJ1dGlvbi5JRCwgT3BlblN1YmFnZW50Q2hhdEFjdGlvblZpZXdJdGVtQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLHVCQUF1QixXQUFXLDJCQUEyQjtBQUN6RSxTQUFTLDBCQUFrRDtBQUMzRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQzdFLFNBQVMsZUFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsU0FBUyxRQUFRLGdCQUFnQix1QkFBdUI7QUFDakUsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxjQUFjLCtCQUErQjtBQUN0RCxTQUFpQyxnQ0FBZ0Msc0JBQXNCO0FBQ3ZGLFNBQVMsNENBQTRDO0FBQ3JELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQWdCLHFCQUFxQjtBQXFCckMsU0FBUyxtQkFBbUIsVUFBc0M7QUFFakUsUUFBTSxjQUFjLGFBQWEsUUFBUSxHQUFHO0FBQzVDLE1BQUksYUFBYTtBQUNoQixXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0saUJBQWlCLHdCQUF3QixRQUFRO0FBQ3ZELFNBQU8saUJBQWlCLFlBQVksZUFBZSxVQUFVLEtBQUs7QUFDbkU7QUFFQSxTQUFTLGdCQUFnQixNQUFhLFVBQWtCLFFBQXFDO0FBQzVGLE1BQUksS0FBSyxTQUFTLFNBQVMsTUFBTSxVQUFVO0FBQzFDLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxDQUFDLENBQUMsVUFBVSxLQUFLLFNBQVMsYUFBYTtBQUMvQztBQVdBLFNBQVMsaUJBQWlCLFVBQXNDO0FBQy9ELFFBQU0sY0FBYyxhQUFhLFFBQVEsR0FBRztBQUM1QyxNQUFJLGFBQWE7QUFDaEIsUUFBSTtBQUNILGFBQU8sSUFBSSxNQUFNLFdBQVcsRUFBRTtBQUFBLElBQy9CLFFBQVE7QUFDUCxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxTQUFPLHdCQUF3QixRQUFRLEdBQUcsY0FBYztBQUN6RDtBQVFBLFNBQVMsaUJBQWlCLGlCQUFtQyxVQUFrQixRQUFxRztBQUNuTCxRQUFNLFNBQVMsbUJBQW1CLFFBQVE7QUFDMUMsUUFBTSxZQUFZLGlCQUFpQixRQUFRO0FBQzNDLFFBQU0sY0FBYyxDQUFDLGdCQUFnQixjQUFjLEtBQUssTUFBTSxHQUFHLEdBQUcsZ0JBQWdCLGdCQUFnQixLQUFLLE1BQU0sQ0FBQyxFQUM5RyxPQUFPLENBQUMsTUFBMkIsQ0FBQyxDQUFDLENBQUM7QUFDeEMsUUFBTSxhQUFhLFlBQ2hCLFlBQVksT0FBTyxPQUFLLEVBQUUsU0FBUyxTQUFTLFNBQVMsSUFDckQ7QUFDSCxhQUFXLFdBQVcsWUFBWTtBQUNqQyxVQUFNLE9BQU8sUUFBUSxNQUFNLEtBQUssTUFBTSxFQUFFLEtBQUssT0FBSyxnQkFBZ0IsR0FBRyxVQUFVLE1BQU0sQ0FBQztBQUN0RixRQUFJLE1BQU07QUFDVCxhQUFPLEVBQUUsU0FBUyxLQUFLO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBaUJBLFNBQVMsb0JBQW9CLFNBQXNDO0FBQ2xFLE1BQUksT0FBTyxZQUFZLFVBQVU7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLFdBQVcsT0FBTyxZQUFZLFlBQVksT0FBUSxRQUFxQyxpQkFBaUIsVUFBVTtBQUNySCxXQUFRLFFBQXFDO0FBQUEsRUFDOUM7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLHNCQUFzQixTQUFtRjtBQUNqSCxNQUFJLENBQUMsV0FBVyxPQUFPLFlBQVksVUFBVTtBQUM1QyxXQUFPLEVBQUUsV0FBVyxRQUFXLFVBQVUsT0FBVTtBQUFBLEVBQ3BEO0FBQ0EsUUFBTSxRQUFRO0FBQ2QsU0FBTztBQUFBLElBQ04sV0FBVyxPQUFPLE1BQU0sY0FBYyxZQUFZLE9BQU8sU0FBUyxNQUFNLFNBQVMsSUFBSSxNQUFNLFlBQVk7QUFBQSxJQUN2RyxVQUFVLE9BQU8sTUFBTSxhQUFhLFlBQVksT0FBTyxTQUFTLE1BQU0sUUFBUSxJQUFJLEtBQUssSUFBSSxHQUFHLE1BQU0sUUFBUSxJQUFJO0FBQUEsRUFDakg7QUFDRDtBQUVBLFNBQVMseUJBQXlCLFNBQTBCO0FBQzNELE1BQUksQ0FBQyxXQUFXLE9BQU8sWUFBWSxVQUFVO0FBQzVDLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxRQUFTLFFBQXFDO0FBQ3BELFNBQU8sT0FBTyxVQUFVLFlBQVksUUFBUSxJQUFJLFFBQVE7QUFDekQ7QUFFTyxTQUFTLHdCQUF3QixtQkFBdUMsZUFBbUMsaUJBQXFDLHVCQUFvRDtBQUMxTSxNQUFJLENBQUMsbUJBQW1CO0FBQ3ZCLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSwwQkFBMEIsa0JBQWtCLEtBQUssRUFBRSxZQUFZO0FBQ3JFLFFBQU0sc0JBQXNCLGVBQWUsTUFBTSxjQUFjLFlBQVksR0FBRyxJQUFJLENBQUM7QUFDbkYsU0FBTyxDQUFDLENBQUMsZUFBZSxxQkFBcUIsaUJBQWlCLHFCQUFxQixFQUNqRixLQUFLLGVBQWEsV0FBVyxLQUFLLEVBQUUsWUFBWSxNQUFNLHVCQUF1QjtBQUNoRjtBQUVBLFNBQVMseUJBQXlCLFFBQXlCO0FBQzFELFFBQU0sUUFBUSxJQUFJLE9BQU8sT0FBTyxJQUFJLE9BQU8sT0FBTyxPQUFPLE9BQU8sT0FBTyxhQUFXLE9BQU8sSUFBSSxPQUFPLENBQUM7QUFDckcsUUFBTSxVQUFVLE9BQU87QUFDdkIsU0FBTztBQUNSO0FBRUEsTUFBTSwrQkFBK0IsUUFBUTtBQUFBLEVBQzVDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsMEJBQTBCLGVBQWU7QUFBQSxNQUMxRCxNQUFNLFFBQVE7QUFBQTtBQUFBO0FBQUEsTUFHZCxJQUFJO0FBQUEsTUFDSixNQUFNLEVBQUUsSUFBSSxPQUFPLHFCQUFxQixPQUFPLGFBQWE7QUFBQSxJQUM3RCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxJQUFJLFVBQTRCLFNBQTREO0FBQzFHLFVBQU0sV0FBVyxvQkFBb0IsT0FBTztBQUM1QyxRQUFJLENBQUMsVUFBVTtBQUNkO0FBQUEsSUFDRDtBQUNBLFVBQU0sYUFBYSxTQUFTLElBQUksV0FBVztBQUMzQyxVQUFNLGtCQUFrQixTQUFTLElBQUksZ0JBQWdCO0FBTXJELFVBQU0sUUFBUSxpQkFBaUIsaUJBQWlCLFVBQVUsTUFBUztBQUNuRSxRQUFJLE9BQU87QUFDVixZQUFNLGdCQUFnQixTQUFTLE1BQU0sU0FBUyxNQUFNLEtBQUssUUFBUTtBQUNqRTtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsZ0JBQWdCLGNBQWMsSUFBSTtBQUNqRCxVQUFNLFlBQVksUUFBUSxNQUFNLElBQUksRUFBRSxJQUFJLE9BQUssRUFBRSxTQUFTLFNBQVMsQ0FBQyxFQUFFLEtBQUssSUFBSSxLQUFLO0FBQ3BGLGVBQVcsS0FBSyxzREFBc0QsUUFBUSxjQUFjLG1CQUFtQixRQUFRLENBQUMsd0JBQXdCLFNBQVMsRUFBRTtBQUFBLEVBQzVKO0FBQ0Q7QUFDQSxnQkFBZ0Isc0JBQXNCO0FBTS9CLElBQU0saUNBQU4sY0FBNkMsbUJBQW1CO0FBQUEsRUFnQ3RFLFlBQ0MsU0FDQSxRQUNBLFNBQ21DLGlCQUNRLHlCQUNILHNCQUNLLDJCQUNMLHNCQUNDLHVCQUN4QztBQUNELFVBQU0sU0FBUyx5QkFBeUIsTUFBTSxHQUFHLE9BQU87QUFQckI7QUFDUTtBQUNIO0FBQ0s7QUFDTDtBQUNDO0FBckMxQyxTQUFRLHFCQUFxQjtBQUM3QixTQUFRLHNCQUFzQjtBQUU5QixTQUFpQixnQkFBZ0IsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDdkUsU0FBaUIsV0FBVyxLQUFLLFVBQVUsSUFBSSxrQkFBbUMsQ0FBQztBQUNuRixTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksb0JBQW9CLENBQUM7QUFDMUUsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGtCQUFtQyxDQUFDO0FBQzFGLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQUM3RSxTQUFpQix5QkFBeUIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFrQjlFLFNBQVEsdUJBQThDO0FBY3JELFNBQUssZ0JBQWdCO0FBQ3JCLFFBQUksS0FBSyxtQkFBbUIsUUFBUTtBQUNuQyxXQUFLLFVBQVUsS0FBSyxPQUFPO0FBQUEsSUFDNUI7QUFDQSxTQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLE1BQU07QUFDdkUsVUFBSSxLQUFLLHFCQUFxQixnQkFBZ0IsR0FBRztBQUNoRCxhQUFLLHNCQUFzQjtBQUFBLE1BQzVCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxzQkFBc0IsMEJBQTBCLE1BQU0sS0FBSyxvQkFBb0IsQ0FBQyxDQUFDO0FBQUEsRUFDdEc7QUFBQSxFQUVTLE9BQU8sV0FBOEI7QUFHN0MsVUFBTSxPQUFPLFNBQVM7QUFDdEIsY0FBVSxVQUFVLElBQUksMkJBQTJCO0FBR25ELGNBQVUsYUFBYSxRQUFRLFFBQVE7QUFFdkMsU0FBSyxlQUFlLEVBQUUsOEJBQThCO0FBQ3BELFNBQUssYUFBYSxZQUFZLEVBQUUsb0NBQW9DLFVBQVUsY0FBYyxRQUFRLGlCQUFpQixDQUFDLEVBQUUsQ0FBQztBQUN6SCxTQUFLLGdCQUFnQixFQUFFLCtCQUErQjtBQUN0RCxTQUFLLGdCQUFnQixFQUFFLHNDQUFzQztBQUM3RCxTQUFLLDRCQUE0QixFQUFFLDRDQUE0QztBQUMvRSxVQUFNLGNBQWMsRUFBRSxpQ0FBaUM7QUFDdkQsVUFBTSxhQUFhLEVBQUUsZ0NBQWdDO0FBQ3JELFNBQUssbUJBQW1CLEVBQUUsa0NBQWtDO0FBQzVELFNBQUsscUJBQXFCLEVBQUUscUNBQXFDO0FBQ2pFLFNBQUssbUJBQW1CLFFBQVE7QUFDaEMsVUFBTSxZQUFZLEVBQUUsK0NBQStDO0FBQ25FLGNBQVUsYUFBYSxlQUFlLE1BQU07QUFDNUMsU0FBSyx5QkFBeUIsRUFBRSwwQ0FBMEM7QUFDMUUsU0FBSyx1QkFBdUIsYUFBYSxlQUFlLE1BQU07QUFDOUQsU0FBSywwQkFBMEIsRUFBRSx1Q0FBdUM7QUFDeEUsU0FBSyxtQkFBbUIsT0FBTyxXQUFXLEtBQUssd0JBQXdCLEtBQUssdUJBQXVCO0FBQ25HLGdCQUFZLE9BQU8sS0FBSyxjQUFjLEtBQUssZUFBZSxLQUFLLGVBQWUsS0FBSyx5QkFBeUI7QUFDNUcsZUFBVyxPQUFPLGFBQWEsS0FBSyxnQkFBZ0I7QUFDcEQsY0FBVSxPQUFPLFlBQVksS0FBSyxrQkFBa0I7QUFDcEQsU0FBSyxjQUFjLGNBQWMsS0FBSyxXQUFXO0FBRWpELFNBQUsseUJBQXlCO0FBQzlCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssY0FBYztBQUNuQixTQUFLLGNBQWM7QUFBQSxFQUNwQjtBQUFBLEVBRVMsaUJBQWlCLFlBQTJCO0FBQ3BELFVBQU0saUJBQWlCLFVBQVU7QUFDakMsU0FBSyx5QkFBeUI7QUFDOUIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxvQkFBb0I7QUFBQSxFQUMxQjtBQUFBLEVBRVEsa0JBQXdCO0FBQy9CLFVBQU0sVUFBVSxLQUFLLFlBQVksT0FBTyxLQUFLLGFBQWEsV0FBVyxLQUFLLFdBQXVDO0FBQ2pILFNBQUsscUJBQXFCLFNBQVM7QUFDbkMsU0FBSyxlQUFlLFNBQVMsaUJBQWlCLFNBQVMsY0FBYztBQUFBLEVBQ3RFO0FBQUEsRUFFUSxlQUFlLE9BQTJCLE1BQW1DO0FBQ3BGLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssa0JBQWtCO0FBQ3ZCLFFBQUksQ0FBQyxLQUFLLHNCQUFzQixDQUFDLEtBQUsseUJBQXlCO0FBQzlEO0FBQUEsSUFDRDtBQUNBLFNBQUssbUJBQW1CLFVBQVUsT0FBTyxVQUFVLENBQUMsS0FBSztBQUN6RCxRQUFJLENBQUMsT0FBTztBQUNYLFdBQUssZ0JBQWdCLE1BQU07QUFDM0IsV0FBSyx1QkFBdUI7QUFDNUIsV0FBSyw0QkFBNEI7QUFDakMsV0FBSyxvQkFBb0IsTUFBTTtBQUMvQixXQUFLLHVCQUF1QixNQUFNO0FBQ2xDLFdBQUssd0JBQXdCLGNBQWM7QUFDM0MsV0FBSyxzQkFBc0I7QUFDM0IsV0FBSyxxQkFBcUI7QUFDMUIsV0FBSyxnQ0FBZ0M7QUFDckMsV0FBSyxzQkFBc0IsTUFBUztBQUNwQyxXQUFLLGNBQWM7QUFDbkIsV0FBSyxnQkFBZ0I7QUFDckI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLEtBQUssdUJBQXVCLEtBQUsscUJBQXFCLGdCQUFnQixHQUFHO0FBQzdFLFdBQUssc0JBQXNCO0FBQzNCO0FBQUEsSUFDRDtBQUNBLFNBQUssbUJBQW1CO0FBQUEsRUFDekI7QUFBQSxFQUVRLHFCQUEyQjtBQUNsQyxRQUFJLENBQUMsS0FBSywyQkFBMkIsS0FBSyx5QkFBeUIsVUFDOUQsS0FBSyxxQkFBcUIsS0FBSyx1QkFBdUIsS0FBSyxpQkFBaUIsT0FBTyxLQUFLLG9CQUFvQixJQUFLO0FBQ3JIO0FBQUEsSUFDRDtBQUNBLFNBQUssdUJBQXVCO0FBQzVCLFFBQUksQ0FBQyxLQUFLLHVCQUF1Qiw2QkFBNkIsR0FBRztBQUNoRSxXQUFLLHdCQUF3QjtBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRVEsMEJBQWdDO0FBQ3ZDLFNBQUssZ0JBQWdCLE1BQU07QUFDM0IsUUFBSSxLQUFLLHlCQUF5QixPQUFPO0FBQ3hDLFdBQUssdUJBQXVCO0FBQzVCLFdBQUssa0JBQWtCLEtBQUssb0JBQW9CLElBQUksS0FBSyxlQUFlO0FBQ3hFLFVBQUksQ0FBQyxLQUFLLHVCQUF1Qiw0QkFBNEIsR0FBRztBQUMvRCxhQUFLLHdCQUF3QjtBQUFBLE1BQzlCO0FBQ0E7QUFBQSxJQUNEO0FBQ0EsUUFBSSxLQUFLLHlCQUF5QixNQUFNO0FBQ3ZDLFdBQUssNEJBQTRCO0FBQ2pDLFdBQUssdUJBQXVCO0FBQzVCLFdBQUssbUJBQW1CO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUEsRUFFUSx3QkFBOEI7QUFDckMsU0FBSyxnQkFBZ0IsTUFBTTtBQUMzQixTQUFLLHVCQUF1QjtBQUM1QixTQUFLLDRCQUE0QjtBQUNqQyxRQUFJLEtBQUssa0JBQWtCO0FBQzFCLFdBQUssa0JBQWtCLEtBQUssa0JBQWtCLEtBQUssZUFBZTtBQUFBLElBQ25FO0FBQUEsRUFDRDtBQUFBLEVBRVEsa0JBQWtCLE9BQWUsTUFBbUM7QUFDM0UsUUFBSSxLQUFLLHlCQUF5QjtBQUNqQyxXQUFLLG9CQUFvQixNQUFNO0FBQy9CLFdBQUssdUJBQXVCLE1BQU07QUFDbEMsV0FBSyx3QkFBd0IsY0FBYztBQUMzQyxZQUFNLFdBQVcsS0FBSyx3QkFBd0IsT0FBTyxJQUFJLGVBQWUsS0FBSyxHQUFHLFFBQVcsS0FBSyx1QkFBdUI7QUFDdkgsd0JBQWtCLFNBQVMsU0FBUyxLQUFLLHNCQUFzQixLQUFLLDJCQUEyQixLQUFLLHNCQUFzQjtBQUMxSCxXQUFLLG9CQUFvQixRQUFRO0FBQ2pDLFdBQUssc0JBQXNCO0FBQzNCLFdBQUsscUJBQXFCO0FBQzFCLFdBQUssZ0NBQWdDLFNBQVMsUUFBUSxhQUFhLFFBQVEsUUFBUSxHQUFHLEVBQUUsS0FBSyxLQUFLO0FBQ2xHLFdBQUssc0JBQXNCLElBQUk7QUFDL0IsV0FBSyxjQUFjO0FBQ25CLFdBQUssZ0JBQWdCO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxzQkFBc0IsTUFBbUM7QUFDaEUsUUFBSSxDQUFDLEtBQUssd0JBQXdCO0FBQ2pDO0FBQUEsSUFDRDtBQUNBLFNBQUssdUJBQXVCLFlBQVk7QUFDeEMsUUFBSSxNQUFNO0FBQ1QsV0FBSyx1QkFBdUIsVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsSUFBSSxDQUFDO0FBQUEsSUFDOUU7QUFBQSxFQUNEO0FBQUEsRUFFUSw4QkFBb0M7QUFDM0MsU0FBSyx5QkFBeUIsVUFBVSxPQUFPLDhCQUE4Qiw2QkFBNkI7QUFBQSxFQUMzRztBQUFBLEVBRVEsdUJBQXVCLFdBQTRCO0FBQzFELFFBQUksQ0FBQyxLQUFLLHlCQUF5QjtBQUNsQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFNBQUssZ0JBQWdCLE1BQU07QUFDM0IsU0FBSyw0QkFBNEI7QUFDakMsVUFBTSxhQUFhLElBQUksZ0JBQWdCO0FBQ3ZDLFVBQU0sV0FBVyxDQUFDLFVBQTBCO0FBQzNDLFVBQUksTUFBTSxXQUFXLEtBQUsseUJBQXlCO0FBQ2xELGFBQUssd0JBQXdCO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQ0EsZUFBVyxJQUFJLHNCQUFzQixLQUFLLHlCQUF5QixVQUFVLGVBQWUsUUFBUSxDQUFDO0FBQ3JHLGVBQVcsSUFBSSxzQkFBc0IsS0FBSyx5QkFBeUIsbUJBQW1CLFFBQVEsQ0FBQztBQUMvRixTQUFLLGdCQUFnQixRQUFRO0FBQzdCLFNBQUssS0FBSyx3QkFBd0I7QUFDbEMsU0FBSyx3QkFBd0IsVUFBVSxJQUFJLFNBQVM7QUFDcEQsUUFBSSxLQUFLLHdCQUF3QixjQUFjLEVBQUUsV0FBVyxHQUFHO0FBQzlELFdBQUssZ0JBQWdCLE1BQU07QUFDM0IsV0FBSyw0QkFBNEI7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsMkJBQWlDO0FBQ3hDLFVBQU0sUUFBUSx5QkFBeUIsS0FBSyxRQUFRO0FBQ3BELFVBQU0scUJBQXFCLENBQUMsRUFBRSxLQUFLLFlBQVksT0FBTyxLQUFLLGFBQWEsWUFBYSxLQUFLLFNBQXNDO0FBQ2hJLFFBQUksVUFBVSxLQUFLLHNCQUFzQix1QkFBdUIsS0FBSyxxQkFBcUI7QUFDekY7QUFBQSxJQUNEO0FBQ0EsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyxTQUFTLFVBQVUsT0FBTyxvQ0FBb0MsUUFBUSxDQUFDO0FBQzVFLFNBQUssU0FBUyxVQUFVLE9BQU8sNENBQTRDLFFBQVEsQ0FBQztBQUNwRixTQUFLLFNBQVMsVUFBVSxPQUFPLHFDQUFxQyxRQUFRLEtBQUssa0JBQWtCO0FBQ25HLFNBQUssU0FBUyxVQUFVLE9BQU8sc0NBQXNDLFFBQVEsS0FBSyxDQUFDLGtCQUFrQjtBQUNyRyxRQUFJLEtBQUssMkJBQTJCO0FBQ25DLFdBQUssMEJBQTBCLGNBQWMsT0FBTyxLQUFLO0FBQUEsSUFDMUQ7QUFDQSxTQUFLLGNBQWM7QUFDbkIsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBO0FBQUEsRUFHUSxzQkFBNEI7QUFDbkMsVUFBTSxXQUFXLG9CQUFvQixLQUFLLFFBQVE7QUFDbEQsUUFBSSxDQUFDLFVBQVU7QUFDZCxXQUFLLGNBQWMsTUFBTTtBQUN6QixXQUFLLFlBQVksS0FBSztBQUN0QixXQUFLLGtCQUFrQixNQUFTO0FBQ2hDLFdBQUssY0FBYyxNQUFTO0FBQzVCLFdBQUssV0FBVyxNQUFTO0FBQ3pCO0FBQUEsSUFDRDtBQUNBLFNBQUssY0FBYyxRQUFRLFFBQVEsWUFBVTtBQUM1QyxZQUFNLFFBQVEsaUJBQWlCLEtBQUssaUJBQWlCLFVBQVUsTUFBTTtBQUNyRSxZQUFNLE9BQU8sT0FBTztBQUNwQixZQUFNLGFBQWEsTUFBTSxRQUFRLGFBQzlCLE9BQU8sUUFBUSxNQUFNLEtBQUssTUFBTSxFQUFFLEtBQUssZUFBYSxRQUFRLFVBQVUsVUFBVSxLQUFLLFFBQVEsVUFBVSxDQUFDLElBQ3hHO0FBQ0gsWUFBTSxnQkFBZ0IsWUFBWSxRQUFRLEtBQUssTUFBTTtBQUNyRCxZQUFNLGNBQWMsZ0JBQWdCLEtBQUssc0JBQXNCLG9CQUFvQixhQUFhLElBQUk7QUFDcEcsV0FBSyxZQUFZLENBQUMsQ0FBQyxJQUFJO0FBQ3ZCLFdBQUssa0JBQWtCLE1BQU0sTUFBTSxLQUFLLE1BQU0sS0FBSyxNQUFTO0FBQzVELFdBQUssY0FBYyx3QkFBd0IsS0FBSyxvQkFBb0IsZUFBZSxhQUFhLE1BQU0sYUFBYSxFQUFFLElBQUksS0FBSyxxQkFBcUIsTUFBUztBQUM1SixXQUFLLFdBQVcsTUFBTSxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQUEsSUFDMUMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLGNBQWMsV0FBcUM7QUFDMUQsUUFBSSxjQUFjLEtBQUssWUFBWTtBQUNsQztBQUFBLElBQ0Q7QUFDQSxTQUFLLGFBQWE7QUFDbEIsUUFBSSxLQUFLLGVBQWU7QUFDdkIsV0FBSyxjQUFjLGNBQWMsYUFBYTtBQUM5QyxXQUFLLGNBQWMsVUFBVSxPQUFPLFVBQVUsQ0FBQyxTQUFTO0FBQUEsSUFDekQ7QUFDQSxTQUFLLGNBQWM7QUFDbkIsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBLEVBRVEsWUFBWSxTQUF3QjtBQUMzQyxTQUFLLFFBQVEsVUFBVTtBQUN2QixTQUFLLGNBQWMsVUFBVTtBQUFBLEVBQzlCO0FBQUEsRUFFUSxrQkFBd0I7QUFDL0IsU0FBSyxlQUFlLE9BQU87QUFDM0IsVUFBTSxTQUFTLHNCQUFzQixLQUFLLFFBQVE7QUFDbEQsU0FBSyxhQUFhLE9BQU87QUFDekIsU0FBSyxXQUFXLE9BQU8sY0FBYyxVQUFhLE9BQU8sYUFBYSxTQUFZLE9BQU8sWUFBWSxPQUFPLFdBQVc7QUFDdkgsU0FBSyxxQkFBcUI7QUFDMUIsUUFBSSxLQUFLLGVBQWUsVUFBYSxLQUFLLGFBQWEsUUFBVztBQUNqRSxXQUFLLGVBQWUsYUFBYSxNQUFNLEtBQUsscUJBQXFCLEdBQUcsR0FBSTtBQUFBLElBQ3pFO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQTZCO0FBQ3BDLFFBQUksQ0FBQyxLQUFLLG9CQUFvQixLQUFLLGVBQWUsUUFBVztBQUM1RCxXQUFLLGtCQUFrQixVQUFVLElBQUksUUFBUTtBQUM3QyxXQUFLLGdCQUFnQjtBQUNyQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLE1BQU0sS0FBSyxZQUFZLEtBQUssSUFBSTtBQUN0QyxVQUFNLFdBQVcsa0JBQWtCLEtBQUssSUFBSSxHQUFHLE1BQU0sS0FBSyxVQUFVLENBQUM7QUFDckUsU0FBSyxpQkFBaUIsY0FBYyxLQUFLLGFBQWEsU0FDbkQsU0FBUyxpQ0FBaUMsbUJBQW1CLFFBQVEsSUFDckUsU0FBUyxnQ0FBZ0Msa0JBQWtCLFFBQVE7QUFDdEUsU0FBSyxpQkFBaUIsVUFBVSxPQUFPLFFBQVE7QUFDL0MsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBLEVBRVEsV0FBVyxRQUF5QztBQUMzRCxRQUFJLFdBQVcsS0FBSyxTQUFTO0FBQzVCO0FBQUEsSUFDRDtBQUNBLFNBQUssVUFBVTtBQUNmLFVBQU0sVUFBVSxXQUFXLGNBQWM7QUFDekMsVUFBTSxVQUFVLFdBQVcsY0FBYztBQUN6QyxTQUFLLFNBQVMsVUFBVSxPQUFPLHlCQUF5QixPQUFPO0FBQy9ELFNBQUssU0FBUyxVQUFVLE9BQU8seUJBQXlCLE9BQU87QUFDL0QsU0FBSyxTQUFTLE1BQU07QUFDcEIsU0FBSyxXQUFXLFlBQVksS0FBSyxjQUFjO0FBQzlDLFlBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxZQUFNLFVBQVUsTUFBTSxJQUFJLG1CQUFtQixLQUFLLGNBQWMsRUFBRSxTQUFTLFVBQVUsU0FBUyxPQUFPLENBQUMsQ0FBQztBQUN2RyxZQUFNLElBQUksYUFBYSxNQUFNLFFBQVEsUUFBUSxPQUFPLENBQUMsQ0FBQztBQUN0RCxXQUFLLFNBQVMsUUFBUTtBQUFBLElBQ3ZCO0FBQ0EsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBLEVBRVEsa0JBQWtCLE9BQWlDO0FBQzFELFFBQUksVUFBVSxLQUFLLGdCQUFnQjtBQUNsQyxXQUFLLGlCQUFpQjtBQUN0QixVQUFJLEtBQUssZUFBZTtBQUN2QixhQUFLLGNBQWMsY0FBYyxLQUFLLFdBQVc7QUFBQSxNQUNsRDtBQUNBLFdBQUssY0FBYztBQUNuQixXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBcUI7QUFDNUIsV0FBTyxLQUFLLGtCQUFrQixLQUFLLFFBQVE7QUFBQSxFQUM1QztBQUFBLEVBRW1CLGFBQWlDO0FBQ25ELFVBQU0sVUFBb0IsQ0FBQztBQUMzQixRQUFJLEtBQUsscUJBQXFCLEdBQUc7QUFDaEMsY0FBUSxLQUFLLEtBQUssdUJBQXVCLElBQ3RDLFNBQVMsOENBQThDLDRDQUE0QyxJQUNuRyxTQUFTLCtDQUErQyxpREFBaUQsS0FBSyxrQkFBa0IsQ0FBQztBQUFBLElBQ3JJLE9BQU87QUFDTixZQUFNLGNBQWMsS0FBSyxRQUFRLFdBQVcsS0FBSyxRQUFRO0FBQ3pELFVBQUksYUFBYTtBQUNoQixnQkFBUSxLQUFLLFdBQVc7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssWUFBWTtBQUNwQixjQUFRLEtBQUssU0FBUyw4QkFBOEIsY0FBYyxLQUFLLFVBQVUsQ0FBQztBQUFBLElBQ25GO0FBQ0EsUUFBSSxLQUFLLCtCQUErQjtBQUN2QyxjQUFRLEtBQUssU0FBUyxtQ0FBbUMsb0JBQW9CLEtBQUssNkJBQTZCLENBQUM7QUFBQSxJQUNqSDtBQUNBLFdBQU8sUUFBUSxPQUFPLE9BQU8sRUFBRSxLQUFLLElBQUksS0FBSztBQUFBLEVBQzlDO0FBQUEsRUFFbUIsZ0JBQXNCO0FBQ3hDLFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUFVLEtBQUssUUFBUTtBQUM3QixTQUFLLFFBQVEsVUFBVSxPQUFPLFlBQVksQ0FBQyxPQUFPO0FBQ2xELFNBQUssUUFBUSxVQUFVLE9BQU8sVUFBVSxDQUFDLE9BQU87QUFDaEQsU0FBSyxRQUFRLGFBQWEsaUJBQWlCLE9BQU8sQ0FBQyxPQUFPLENBQUM7QUFDM0QsU0FBSyxRQUFRLGFBQWEsZUFBZSxPQUFPLENBQUMsT0FBTyxDQUFDO0FBQUEsRUFDMUQ7QUFBQSxFQUVtQixrQkFBd0I7QUFDMUMsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFlBQVksS0FBSyxpQkFDcEIsU0FBUywrQkFBK0IsMkJBQTJCLEtBQUssY0FBYyxJQUN0RixLQUFLLFFBQVE7QUFDaEIsVUFBTSxjQUFjLEtBQUssWUFBWSxjQUFjLGFBQ2hELFNBQVMsZ0NBQWdDLHFCQUFxQixJQUM5RCxLQUFLLFlBQVksY0FBYyxhQUM5QixTQUFTLGdDQUFnQywrQkFBK0IsSUFDeEUsS0FBSyxZQUFZLGNBQWMsWUFDOUIsU0FBUyxrQ0FBa0Msb0JBQW9CLElBQy9EO0FBQ0wsVUFBTSxvQkFBb0IsS0FBSyxxQkFBcUIsSUFDakQsS0FBSyx1QkFBdUIsSUFDM0IsU0FBUyxrQ0FBa0MsdUJBQXVCLElBQ2xFLFNBQVMsbUNBQW1DLDRCQUE0QixLQUFLLGtCQUFrQixJQUNoRztBQUNILFVBQU0sYUFBYSxLQUFLLGFBQWEsU0FBUywyQkFBMkIsYUFBYSxLQUFLLFVBQVUsSUFBSTtBQUN6RyxVQUFNLGtCQUFrQixLQUFLLGdDQUFnQyxTQUFTLGdDQUFnQyxtQkFBbUIsS0FBSyw2QkFBNkIsSUFBSTtBQUMvSixVQUFNLFlBQVksQ0FBQyxXQUFXLGFBQWEsWUFBWSxpQkFBaUIsbUJBQW1CLEtBQUssa0JBQWtCLGVBQWUsTUFBUyxFQUFFLE9BQU8sV0FBUyxDQUFDLENBQUMsS0FBSyxFQUFFLEtBQUssSUFBSTtBQUM5SyxRQUFJLFdBQVc7QUFDZCxXQUFLLFFBQVEsYUFBYSxjQUFjLFNBQVM7QUFBQSxJQUNsRCxPQUFPO0FBQ04sV0FBSyxRQUFRLGdCQUFnQixZQUFZO0FBQUEsSUFDMUM7QUFBQSxFQUNEO0FBQ0Q7QUE3WmEsaUNBQU47QUFBQSxFQW9DSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F6Q1U7QUF1YWIsSUFBTSw2Q0FBTixjQUF5RCxXQUE2QztBQUFBLEVBSXJHLFlBQ3lCLHVCQUN2QjtBQUNELFVBQU07QUFNTixVQUFNLGdCQUFnQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDeEQsU0FBSyxVQUFVLHNCQUFzQixTQUFTLE9BQU8scUJBQXFCLHNDQUFzQyxDQUFDLFFBQVEsU0FBUyx5QkFBeUI7QUFDMUosVUFBSSxFQUFFLGtCQUFrQixpQkFBaUI7QUFDeEMsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPLHFCQUFxQixlQUFlLGdDQUFnQyxRQUFXLFFBQVEsT0FBTztBQUFBLElBQ3RHLEdBQUcsY0FBYyxLQUFLLENBQUM7QUFDdkIsa0JBQWMsS0FBSztBQUFBLEVBQ3BCO0FBQ0Q7QUF0Qk0sMkNBRVcsS0FBSztBQUZoQiw2Q0FBTjtBQUFBLEVBS0c7QUFBQSxHQUxHO0FBdUJOLCtCQUErQiwyQ0FBMkMsSUFBSSw0Q0FBNEMsZUFBZSxZQUFZOyIsCiAgIm5hbWVzIjogW10KfQo=
