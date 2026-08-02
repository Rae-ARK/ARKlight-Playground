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
import { renderIcon } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { fromNow, getDurationString } from "../../../../../base/common/date.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { ChatViewModel } from "../../common/model/chatViewModel.js";
import { IChatWidgetService } from "../chat.js";
import { ChatListWidget } from "../widget/chatListWidget.js";
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderIcon, getAgentSessionProviderName } from "./agentSessions.js";
import { IAgentSessionsService } from "./agentSessionsService.js";
import { AgentSessionStatus, getAgentChangesSummary, hasValidDiff } from "./agentSessionsModel.js";
import "./media/agentSessionHoverWidget.css";
const HEADER_HEIGHT = 60;
const CHAT_LIST_HEIGHT = 240;
const CHAT_HOVER_WIDTH = 500;
let AgentSessionHoverWidget = class extends Disposable {
  constructor(session, chatService, instantiationService, chatWidgetService, agentSessionsService) {
    super();
    this.session = session;
    this.chatService = chatService;
    this.instantiationService = instantiationService;
    this.chatWidgetService = chatWidgetService;
    this.agentSessionsService = agentSessionsService;
    this.domNode = dom.$(".agent-session-hover.interactive-session");
    this.domNode.style.width = `${CHAT_HOVER_WIDTH}px`;
    this.domNode.style.height = `${HEADER_HEIGHT + CHAT_LIST_HEIGHT}px`;
    this.domNode.style.overflow = "hidden";
    this.cts = new CancellationTokenSource();
    this._register(toDisposable(() => this.cts.cancel()));
    this.buildHeader();
    this.contentElement = dom.append(this.domNode, dom.$(".agent-session-hover-content"));
    this.loadingElement = dom.append(this.contentElement, dom.$(".agent-session-hover-loading"));
    dom.append(this.loadingElement, renderIcon(ThemeIcon.modify(Codicon.loading, "spin")));
    this.renderScheduler = this._register(new RunOnceScheduler(() => this.render(), 200));
  }
  onRendered() {
    this.modelRef ??= this.loadModel();
    if (this.listWidget) {
      this.listWidget.layout(CHAT_LIST_HEIGHT, CHAT_HOVER_WIDTH);
      this.listWidget.refresh();
      return;
    }
    this.renderScheduler.schedule();
  }
  onHidden() {
    this.renderScheduler.cancel();
  }
  async loadModel() {
    const modelRef = await this.chatService.acquireOrLoadSession(this.session.resource, ChatAgentLocation.Chat, this.cts.token, "AgentSessionHoverWidget#loadModel");
    if (this._store.isDisposed) {
      modelRef?.dispose();
      return;
    }
    if (!modelRef) {
      this.loadingElement.remove();
      const tooltip = this.buildFallbackTooltip(this.session);
      this.domNode.textContent = typeof tooltip === "string" ? tooltip : tooltip.value;
      return;
    }
    this._register(modelRef);
    return modelRef.object;
  }
  async render() {
    this.modelRef ??= this.loadModel();
    const model = await this.modelRef;
    if (!model || this._store.isDisposed || !this.domNode.isConnected) {
      return;
    }
    if (this.listWidget) {
      this.listWidget.layout(CHAT_LIST_HEIGHT, CHAT_HOVER_WIDTH);
      this.listWidget.refresh();
      return;
    }
    this.loadingElement.remove();
    const viewModel = this._register(this.instantiationService.createInstance(
      ChatViewModel,
      model,
      { maxVisibleItems: 2 }
    ));
    const container = dom.append(this.contentElement, dom.$(".interactive-list"));
    const listWidget = this._register(this.instantiationService.createInstance(
      ChatListWidget,
      container,
      {
        rendererOptions: {
          renderStyle: "compact",
          noHeader: true,
          editable: false
        },
        currentChatMode: () => ChatModeKind.Ask
      }
    ));
    this.listWidget = listWidget;
    listWidget.layout(CHAT_LIST_HEIGHT, CHAT_HOVER_WIDTH);
    listWidget.setScrollLock(true);
    listWidget.setViewModel(viewModel);
    listWidget.refresh();
    const viewModelScheduler = this._register(new RunOnceScheduler(() => {
      if (this.domNode.isConnected) {
        listWidget.refresh();
      }
    }, 500));
    this._register(viewModel.onDidChange(() => {
      if (this.domNode.isConnected && !viewModelScheduler.isScheduled()) {
        viewModelScheduler.schedule();
      }
    }));
    this._register(listWidget.onDidClickFollowup(async (followup) => {
      const widget = await this.chatWidgetService.openSession(model.sessionResource);
      if (widget) {
        widget.acceptInput(followup.message);
      }
    }));
  }
  buildHeader() {
    const session = this.session;
    const header = dom.append(this.domNode, dom.$(".agent-session-hover-header"));
    const titleRow = dom.append(header, dom.$(".agent-session-hover-title"));
    dom.append(titleRow, dom.$("span", void 0, session.label));
    const detailsRow = dom.append(header, dom.$(".agent-session-hover-details"));
    const providerType = getAgentSessionProvider(session.providerType);
    const provider = providerType ?? AgentSessionProviders.Local;
    const providerIcon = getAgentSessionProviderIcon(provider);
    dom.append(detailsRow, renderIcon(providerIcon));
    dom.append(detailsRow, dom.$("span", void 0, getAgentSessionProviderName(provider)));
    dom.append(detailsRow, dom.$("span.separator", void 0, "\u2022"));
    if (session.timing.lastRequestEnded && session.timing.lastRequestStarted) {
      const duration = this.toDuration(session.timing.lastRequestStarted, session.timing.lastRequestEnded, true);
      if (duration) {
        dom.append(detailsRow, dom.$("span", void 0, duration));
      }
    } else {
      const startTime = session.timing.lastRequestStarted ?? session.timing.created;
      dom.append(detailsRow, dom.$("span", void 0, fromNow(startTime, true, true)));
    }
    const diffSeparator = dom.append(detailsRow, dom.$("span.separator", void 0, "\u2022"));
    const diffContainer = dom.append(detailsRow, dom.$(".agent-session-hover-diff"));
    diffSeparator.style.display = "none";
    diffContainer.style.display = "none";
    const observed = this.agentSessionsService.model.observeSession(session.resource);
    this._register(autorun((reader) => {
      const latest = observed.read(reader) ?? session;
      const diff = getAgentChangesSummary(latest.changes);
      dom.clearNode(diffContainer);
      if (diff && hasValidDiff(latest.changes)) {
        diffSeparator.style.display = "";
        diffContainer.style.display = "";
        if (diff.files > 0) {
          dom.append(diffContainer, dom.$("span", void 0, diff.files === 1 ? localize("tooltip.file", "1 file") : localize("tooltip.files", "{0} files", diff.files)));
        }
        if (diff.insertions > 0) {
          dom.append(diffContainer, dom.$("span.insertions", void 0, `+${diff.insertions}`));
        }
        if (diff.deletions > 0) {
          dom.append(diffContainer, dom.$("span.deletions", void 0, `-${diff.deletions}`));
        }
      } else {
        diffSeparator.style.display = "none";
        diffContainer.style.display = "none";
      }
    }));
    if (session.status !== AgentSessionStatus.Completed) {
      dom.append(detailsRow, dom.$("span.separator", void 0, "\u2022"));
      dom.append(detailsRow, dom.$("span", void 0, this.toStatusLabel(session.status)));
    }
    if (session.isArchived()) {
      dom.append(detailsRow, dom.$("span.separator", void 0, "\u2022"));
      dom.append(detailsRow, renderIcon(Codicon.archive));
      dom.append(detailsRow, dom.$("span", void 0, localize("tooltip.archived", "Archived")));
    }
  }
  buildFallbackTooltip(session) {
    const lines = [];
    lines.push(`**${session.label}**`);
    if (session.tooltip) {
      const tooltip = typeof session.tooltip === "string" ? session.tooltip : session.tooltip.value;
      lines.push(tooltip);
    } else {
      if (session.description) {
        const description = typeof session.description === "string" ? session.description : session.description.value;
        lines.push(description);
      }
      if (session.badge) {
        const badge = typeof session.badge === "string" ? session.badge : session.badge.value;
        lines.push(badge);
      }
    }
    const details = [];
    const providerType = getAgentSessionProvider(session.providerType);
    const provider = providerType ?? AgentSessionProviders.Local;
    const providerIcon = getAgentSessionProviderIcon(provider);
    const providerName = getAgentSessionProviderName(provider);
    let timeLabel;
    if (session.timing.lastRequestEnded && session.timing.lastRequestStarted) {
      const duration = this.toDuration(session.timing.lastRequestStarted, session.timing.lastRequestEnded, true);
      timeLabel = duration ?? fromNow(session.timing.lastRequestStarted, true, true);
    } else {
      const startTime = session.timing.lastRequestStarted ?? session.timing.created;
      timeLabel = fromNow(startTime, true, true);
    }
    details.push(`$(${providerIcon.id}) ${providerName} \u2022 ${timeLabel}`);
    const diff = getAgentChangesSummary(session.changes);
    if (diff && hasValidDiff(session.changes)) {
      const diffParts = [];
      if (diff.files > 0) {
        diffParts.push(diff.files === 1 ? localize("tooltip.file", "1 file") : localize("tooltip.files", "{0} files", diff.files));
      }
      if (diff.insertions > 0) {
        diffParts.push(`+${diff.insertions}`);
      }
      if (diff.deletions > 0) {
        diffParts.push(`-${diff.deletions}`);
      }
      if (diffParts.length > 0) {
        details.push(diffParts.join(" "));
      }
    }
    if (session.status !== AgentSessionStatus.Completed) {
      details.push(this.toStatusLabel(session.status));
    }
    lines.push(details.join(" \u2022 "));
    if (session.isArchived()) {
      lines.push(`$(archive) ${localize("tooltip.archived", "Archived")}`);
    }
    return new MarkdownString(lines.join("\n\n"), { supportThemeIcons: true });
  }
  toDuration(startTime, endTime, useFullTimeWords) {
    const elapsed = Math.round((endTime - startTime) / 1e3) * 1e3;
    if (elapsed < 1e3) {
      return void 0;
    }
    return getDurationString(elapsed, useFullTimeWords);
  }
  toStatusLabel(status) {
    let statusLabel;
    switch (status) {
      case AgentSessionStatus.NeedsInput:
        statusLabel = localize("agentSessionNeedsInput", "Needs Input");
        break;
      case AgentSessionStatus.InProgress:
        statusLabel = localize("agentSessionInProgress", "In Progress");
        break;
      case AgentSessionStatus.Failed:
        statusLabel = localize("agentSessionFailed", "Failed");
        break;
      default:
        statusLabel = localize("agentSessionCompleted", "Completed");
    }
    return statusLabel;
  }
};
AgentSessionHoverWidget = __decorateClass([
  __decorateParam(1, IChatService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, IAgentSessionsService)
], AgentSessionHoverWidget);
export {
  AgentSessionHoverWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbkhvdmVyV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGZyb21Ob3csIGdldER1cmF0aW9uU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0TGlzdFdpZGdldCB9IGZyb20gJy4uL3dpZGdldC9jaGF0TGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25Qcm92aWRlcnMsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24sIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZSB9IGZyb20gJy4vYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblN0YXR1cywgZ2V0QWdlbnRDaGFuZ2VzU3VtbWFyeSwgaGFzVmFsaWREaWZmLCBJQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0ICcuL21lZGlhL2FnZW50U2Vzc2lvbkhvdmVyV2lkZ2V0LmNzcyc7XG5cbmNvbnN0IEhFQURFUl9IRUlHSFQgPSA2MDtcbmNvbnN0IENIQVRfTElTVF9IRUlHSFQgPSAyNDA7XG5jb25zdCBDSEFUX0hPVkVSX1dJRFRIID0gNTAwO1xuXG5leHBvcnQgY2xhc3MgQWdlbnRTZXNzaW9uSG92ZXJXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBtb2RlbFJlZj86IFByb21pc2U8SUNoYXRNb2RlbCB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgbGlzdFdpZGdldD86IENoYXRMaXN0V2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRlbnRFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBsb2FkaW5nRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyU2NoZWR1bGVyOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlc3Npb246IElBZ2VudFNlc3Npb24sXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElBZ2VudFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmFnZW50LXNlc3Npb24taG92ZXIuaW50ZXJhY3RpdmUtc2Vzc2lvbicpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS53aWR0aCA9IGAke0NIQVRfSE9WRVJfV0lEVEh9cHhgO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtIRUFERVJfSEVJR0hUICsgQ0hBVF9MSVNUX0hFSUdIVH1weGA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cblx0XHR0aGlzLmN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmN0cy5jYW5jZWwoKSkpO1xuXG5cdFx0Ly8gQnVpbGQgaGVhZGVyIGltbWVkaWF0ZWx5XG5cdFx0dGhpcy5idWlsZEhlYWRlcigpO1xuXG5cdFx0Ly8gQ3JlYXRlIGNvbnRlbnQgY29udGFpbmVyIHdpdGggbG9hZGluZyBzdGF0ZVxuXHRcdHRoaXMuY29udGVudEVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5hZ2VudC1zZXNzaW9uLWhvdmVyLWNvbnRlbnQnKSk7XG5cdFx0dGhpcy5sb2FkaW5nRWxlbWVudCA9IGRvbS5hcHBlbmQodGhpcy5jb250ZW50RWxlbWVudCwgZG9tLiQoJy5hZ2VudC1zZXNzaW9uLWhvdmVyLWxvYWRpbmcnKSk7XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLmxvYWRpbmdFbGVtZW50LCByZW5kZXJJY29uKFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpKSk7XG5cblx0XHQvLyBEZWxheSByZW5kZXJpbmcgYnkgMjAwbXMgdG8gYXZvaWQgZXhwZW5zaXZlIHJlbmRlcmluZyBmb3IgYnJpZWYgaG92ZXJzXG5cdFx0dGhpcy5yZW5kZXJTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLnJlbmRlcigpLCAyMDApKTtcblx0fVxuXG5cdG9uUmVuZGVyZWQoKSB7XG5cdFx0dGhpcy5tb2RlbFJlZiA/Pz0gdGhpcy5sb2FkTW9kZWwoKTtcblxuXHRcdGlmICh0aGlzLmxpc3RXaWRnZXQpIHtcblx0XHRcdHRoaXMubGlzdFdpZGdldC5sYXlvdXQoQ0hBVF9MSVNUX0hFSUdIVCwgQ0hBVF9IT1ZFUl9XSURUSCk7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQucmVmcmVzaCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRvbkhpZGRlbigpIHtcblx0XHR0aGlzLnJlbmRlclNjaGVkdWxlci5jYW5jZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZE1vZGVsKCkge1xuXHRcdGNvbnN0IG1vZGVsUmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbih0aGlzLnNlc3Npb24ucmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHRoaXMuY3RzLnRva2VuLCAnQWdlbnRTZXNzaW9uSG92ZXJXaWRnZXQjbG9hZE1vZGVsJyk7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdG1vZGVsUmVmPy5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0Ly8gU2hvdyBmYWxsYmFjayB0b29sdGlwIHRleHRcblx0XHRcdHRoaXMubG9hZGluZ0VsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHRjb25zdCB0b29sdGlwID0gdGhpcy5idWlsZEZhbGxiYWNrVG9vbHRpcCh0aGlzLnNlc3Npb24pO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnRleHRDb250ZW50ID0gdHlwZW9mIHRvb2x0aXAgPT09ICdzdHJpbmcnID8gdG9vbHRpcCA6IHRvb2x0aXAudmFsdWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWxSZWYpO1xuXHRcdHJldHVybiBtb2RlbFJlZi5vYmplY3Q7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbmRlcigpIHtcblx0XHR0aGlzLm1vZGVsUmVmID8/PSB0aGlzLmxvYWRNb2RlbCgpO1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5tb2RlbFJlZjtcblx0XHRpZiAoIW1vZGVsIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgIXRoaXMuZG9tTm9kZS5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxpc3RXaWRnZXQpIHtcblx0XHRcdHRoaXMubGlzdFdpZGdldC5sYXlvdXQoQ0hBVF9MSVNUX0hFSUdIVCwgQ0hBVF9IT1ZFUl9XSURUSCk7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQucmVmcmVzaCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBsb2FkaW5nIHN0YXRlXG5cdFx0dGhpcy5sb2FkaW5nRWxlbWVudC5yZW1vdmUoKTtcblxuXHRcdC8vIENyZWF0ZSB2aWV3IG1vZGVsIC0gb25seSBzaG93IGxhc3QgcmVxdWVzdCtyZXNwb25zZSBwYWlyXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRWaWV3TW9kZWwsXG5cdFx0XHRtb2RlbCxcblx0XHRcdHsgbWF4VmlzaWJsZUl0ZW1zOiAyIH1cblx0XHQpKTtcblxuXHRcdC8vIENyZWF0ZSB0aGUgY2hhdCBsaXN0IHdpZGdldFxuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS5hcHBlbmQodGhpcy5jb250ZW50RWxlbWVudCwgZG9tLiQoJy5pbnRlcmFjdGl2ZS1saXN0JykpO1xuXHRcdGNvbnN0IGxpc3RXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RXaWRnZXQsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR7XG5cdFx0XHRcdHJlbmRlcmVyT3B0aW9uczoge1xuXHRcdFx0XHRcdHJlbmRlclN0eWxlOiAnY29tcGFjdCcsXG5cdFx0XHRcdFx0bm9IZWFkZXI6IHRydWUsXG5cdFx0XHRcdFx0ZWRpdGFibGU6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXJyZW50Q2hhdE1vZGU6ICgpID0+IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0dGhpcy5saXN0V2lkZ2V0ID0gbGlzdFdpZGdldDtcblx0XHRsaXN0V2lkZ2V0LmxheW91dChDSEFUX0xJU1RfSEVJR0hULCBDSEFUX0hPVkVSX1dJRFRIKTtcblx0XHRsaXN0V2lkZ2V0LnNldFNjcm9sbExvY2sodHJ1ZSk7XG5cdFx0bGlzdFdpZGdldC5zZXRWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRsaXN0V2lkZ2V0LnJlZnJlc2goKTtcblxuXHRcdGNvbnN0IHZpZXdNb2RlbFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmRvbU5vZGUuaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0bGlzdFdpZGdldC5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSwgNTAwKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlld01vZGVsLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmRvbU5vZGUuaXNDb25uZWN0ZWQgJiYgIXZpZXdNb2RlbFNjaGVkdWxlci5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHZpZXdNb2RlbFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBmb2xsb3d1cCBjbGlja3MgLSBvcGVuIHRoZSBzZXNzaW9uIGFuZCBhY2NlcHQgaW5wdXRcblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0V2lkZ2V0Lm9uRGlkQ2xpY2tGb2xsb3d1cChhc3luYyAoZm9sbG93dXApID0+IHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGF3YWl0IHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24obW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdFx0d2lkZ2V0LmFjY2VwdElucHV0KGZvbGxvd3VwLm1lc3NhZ2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRIZWFkZXIoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbjtcblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5hZ2VudC1zZXNzaW9uLWhvdmVyLWhlYWRlcicpKTtcblxuXHRcdC8vIFRpdGxlIHJvd1xuXHRcdGNvbnN0IHRpdGxlUm93ID0gZG9tLmFwcGVuZChoZWFkZXIsIGRvbS4kKCcuYWdlbnQtc2Vzc2lvbi1ob3Zlci10aXRsZScpKTtcblx0XHRkb20uYXBwZW5kKHRpdGxlUm93LCBkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgc2Vzc2lvbi5sYWJlbCkpO1xuXG5cdFx0Ly8gRGV0YWlscyByb3c6IFByb3ZpZGVyIGljb24gKyBEdXJhdGlvbi9UaW1lIFx1MjAyMiBEaWZmIFx1MjAyMiBTdGF0dXMgKGlmIG5vdCBjb21wbGV0ZWQpXG5cdFx0Y29uc3QgZGV0YWlsc1JvdyA9IGRvbS5hcHBlbmQoaGVhZGVyLCBkb20uJCgnLmFnZW50LXNlc3Npb24taG92ZXItZGV0YWlscycpKTtcblxuXHRcdC8vIFByb3ZpZGVyIGljb24gKyBuYW1lICsgRHVyYXRpb24gb3Igc3RhcnQgdGltZVxuXHRcdGNvbnN0IHByb3ZpZGVyVHlwZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKHNlc3Npb24ucHJvdmlkZXJUeXBlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHByb3ZpZGVyVHlwZSA/PyBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWw7XG5cdFx0Y29uc3QgcHJvdmlkZXJJY29uID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKHByb3ZpZGVyKTtcblx0XHRkb20uYXBwZW5kKGRldGFpbHNSb3csIHJlbmRlckljb24ocHJvdmlkZXJJY29uKSk7XG5cdFx0ZG9tLmFwcGVuZChkZXRhaWxzUm93LCBkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKHByb3ZpZGVyKSkpO1xuXHRcdGRvbS5hcHBlbmQoZGV0YWlsc1JvdywgZG9tLiQoJ3NwYW4uc2VwYXJhdG9yJywgdW5kZWZpbmVkLCAnXHUyMDIyJykpO1xuXG5cdFx0aWYgKHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgJiYgc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkKSB7XG5cdFx0XHRjb25zdCBkdXJhdGlvbiA9IHRoaXMudG9EdXJhdGlvbihzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdFN0YXJ0ZWQsIHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQsIHRydWUpO1xuXHRcdFx0aWYgKGR1cmF0aW9uKSB7XG5cdFx0XHRcdGRvbS5hcHBlbmQoZGV0YWlsc1JvdywgZG9tLiQoJ3NwYW4nLCB1bmRlZmluZWQsIGR1cmF0aW9uKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHN0YXJ0VGltZSA9IHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCA/PyBzZXNzaW9uLnRpbWluZy5jcmVhdGVkO1xuXHRcdFx0ZG9tLmFwcGVuZChkZXRhaWxzUm93LCBkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgZnJvbU5vdyhzdGFydFRpbWUsIHRydWUsIHRydWUpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlmZiBpbmZvcm1hdGlvbiAtIHJlbmRlcmVkIHJlYWN0aXZlbHkgYmVjYXVzZSBgY2hhbmdlc2AgbWF5IGJlIGxhemlseVxuXHRcdC8vIHJlc29sdmVkIGJ5IHRoZSBwcm92aWRlciAoc2VlIElBZ2VudFNlc3Npb25zTW9kZWwub2JzZXJ2ZVNlc3Npb24pLiBXZVxuXHRcdC8vIHJlc2VydmUgYSBzZXBhcmF0b3IgKyBjb250YWluZXIgc2xvdCBoZXJlIGFuZCB1cGRhdGUgdGhlbSB3aGVuZXZlciB0aGVcblx0XHQvLyBvYnNlcnZlZCBzZXNzaW9uIGVtaXRzIGEgZnJlc2ggdmFsdWUuXG5cdFx0Y29uc3QgZGlmZlNlcGFyYXRvciA9IGRvbS5hcHBlbmQoZGV0YWlsc1JvdywgZG9tLiQoJ3NwYW4uc2VwYXJhdG9yJywgdW5kZWZpbmVkLCAnXHUyMDIyJykpO1xuXHRcdGNvbnN0IGRpZmZDb250YWluZXIgPSBkb20uYXBwZW5kKGRldGFpbHNSb3csIGRvbS4kKCcuYWdlbnQtc2Vzc2lvbi1ob3Zlci1kaWZmJykpO1xuXHRcdGRpZmZTZXBhcmF0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRkaWZmQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRjb25zdCBvYnNlcnZlZCA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub2JzZXJ2ZVNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGF0ZXN0ID0gb2JzZXJ2ZWQucmVhZChyZWFkZXIpID8/IHNlc3Npb247XG5cdFx0XHRjb25zdCBkaWZmID0gZ2V0QWdlbnRDaGFuZ2VzU3VtbWFyeShsYXRlc3QuY2hhbmdlcyk7XG5cdFx0XHRkb20uY2xlYXJOb2RlKGRpZmZDb250YWluZXIpO1xuXHRcdFx0aWYgKGRpZmYgJiYgaGFzVmFsaWREaWZmKGxhdGVzdC5jaGFuZ2VzKSkge1xuXHRcdFx0XHRkaWZmU2VwYXJhdG9yLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0ZGlmZkNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdGlmIChkaWZmLmZpbGVzID4gMCkge1xuXHRcdFx0XHRcdGRvbS5hcHBlbmQoZGlmZkNvbnRhaW5lciwgZG9tLiQoJ3NwYW4nLCB1bmRlZmluZWQsIGRpZmYuZmlsZXMgPT09IDEgPyBsb2NhbGl6ZSgndG9vbHRpcC5maWxlJywgXCIxIGZpbGVcIikgOiBsb2NhbGl6ZSgndG9vbHRpcC5maWxlcycsIFwiezB9IGZpbGVzXCIsIGRpZmYuZmlsZXMpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRpZmYuaW5zZXJ0aW9ucyA+IDApIHtcblx0XHRcdFx0XHRkb20uYXBwZW5kKGRpZmZDb250YWluZXIsIGRvbS4kKCdzcGFuLmluc2VydGlvbnMnLCB1bmRlZmluZWQsIGArJHtkaWZmLmluc2VydGlvbnN9YCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkaWZmLmRlbGV0aW9ucyA+IDApIHtcblx0XHRcdFx0XHRkb20uYXBwZW5kKGRpZmZDb250YWluZXIsIGRvbS4kKCdzcGFuLmRlbGV0aW9ucycsIHVuZGVmaW5lZCwgYC0ke2RpZmYuZGVsZXRpb25zfWApKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGlmZlNlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRkaWZmQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3RhdHVzIChvbmx5IHNob3cgaWYgbm90IGNvbXBsZXRlZClcblx0XHRpZiAoc2Vzc2lvbi5zdGF0dXMgIT09IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRcdGRvbS5hcHBlbmQoZGV0YWlsc1JvdywgZG9tLiQoJ3NwYW4uc2VwYXJhdG9yJywgdW5kZWZpbmVkLCAnXHUyMDIyJykpO1xuXHRcdFx0ZG9tLmFwcGVuZChkZXRhaWxzUm93LCBkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgdGhpcy50b1N0YXR1c0xhYmVsKHNlc3Npb24uc3RhdHVzKSkpO1xuXHRcdH1cblxuXHRcdC8vIEFyY2hpdmVkIGluZGljYXRvclxuXHRcdGlmIChzZXNzaW9uLmlzQXJjaGl2ZWQoKSkge1xuXHRcdFx0ZG9tLmFwcGVuZChkZXRhaWxzUm93LCBkb20uJCgnc3Bhbi5zZXBhcmF0b3InLCB1bmRlZmluZWQsICdcdTIwMjInKSk7XG5cdFx0XHRkb20uYXBwZW5kKGRldGFpbHNSb3csIHJlbmRlckljb24oQ29kaWNvbi5hcmNoaXZlKSk7XG5cdFx0XHRkb20uYXBwZW5kKGRldGFpbHNSb3csIGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgndG9vbHRpcC5hcmNoaXZlZCcsIFwiQXJjaGl2ZWRcIikpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkRmFsbGJhY2tUb29sdGlwKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiBJTWFya2Rvd25TdHJpbmcge1xuXHRcdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Ly8gVGl0bGVcblx0XHRsaW5lcy5wdXNoKGAqKiR7c2Vzc2lvbi5sYWJlbH0qKmApO1xuXG5cdFx0Ly8gVG9vbHRpcCAoZnJvbSBwcm92aWRlcilcblx0XHRpZiAoc2Vzc2lvbi50b29sdGlwKSB7XG5cdFx0XHRjb25zdCB0b29sdGlwID0gdHlwZW9mIHNlc3Npb24udG9vbHRpcCA9PT0gJ3N0cmluZycgPyBzZXNzaW9uLnRvb2x0aXAgOiBzZXNzaW9uLnRvb2x0aXAudmFsdWU7XG5cdFx0XHRsaW5lcy5wdXNoKHRvb2x0aXApO1xuXHRcdH0gZWxzZSB7XG5cblx0XHRcdC8vIERlc2NyaXB0aW9uXG5cdFx0XHRpZiAoc2Vzc2lvbi5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHR5cGVvZiBzZXNzaW9uLmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJyA/IHNlc3Npb24uZGVzY3JpcHRpb24gOiBzZXNzaW9uLmRlc2NyaXB0aW9uLnZhbHVlO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGRlc2NyaXB0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQmFkZ2Vcblx0XHRcdGlmIChzZXNzaW9uLmJhZGdlKSB7XG5cdFx0XHRcdGNvbnN0IGJhZGdlID0gdHlwZW9mIHNlc3Npb24uYmFkZ2UgPT09ICdzdHJpbmcnID8gc2Vzc2lvbi5iYWRnZSA6IHNlc3Npb24uYmFkZ2UudmFsdWU7XG5cdFx0XHRcdGxpbmVzLnB1c2goYmFkZ2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERldGFpbHMgbGluZTogUHJvdmlkZXIgaWNvbiArIER1cmF0aW9uL1RpbWUgXHUyMDIyIERpZmYgXHUyMDIyIFN0YXR1cyAoaWYgbm90IGNvbXBsZXRlZClcblx0XHRjb25zdCBkZXRhaWxzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Ly8gUHJvdmlkZXIgaWNvbiArIG5hbWUgKyBEdXJhdGlvbiBvciBzdGFydCB0aW1lXG5cdFx0Y29uc3QgcHJvdmlkZXJUeXBlID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIoc2Vzc2lvbi5wcm92aWRlclR5cGUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gcHJvdmlkZXJUeXBlID8/IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbDtcblx0XHRjb25zdCBwcm92aWRlckljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24ocHJvdmlkZXIpO1xuXHRcdGNvbnN0IHByb3ZpZGVyTmFtZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZShwcm92aWRlcik7XG5cdFx0bGV0IHRpbWVMYWJlbDogc3RyaW5nO1xuXHRcdGlmIChzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkICYmIHNlc3Npb24udGltaW5nLmxhc3RSZXF1ZXN0U3RhcnRlZCkge1xuXHRcdFx0Y29uc3QgZHVyYXRpb24gPSB0aGlzLnRvRHVyYXRpb24oc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkLCBzZXNzaW9uLnRpbWluZy5sYXN0UmVxdWVzdEVuZGVkLCB0cnVlKTtcblx0XHRcdHRpbWVMYWJlbCA9IGR1cmF0aW9uID8/IGZyb21Ob3coc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkLCB0cnVlLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gc2Vzc2lvbi50aW1pbmcubGFzdFJlcXVlc3RTdGFydGVkID8/IHNlc3Npb24udGltaW5nLmNyZWF0ZWQ7XG5cdFx0XHR0aW1lTGFiZWwgPSBmcm9tTm93KHN0YXJ0VGltZSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0fVxuXHRcdGRldGFpbHMucHVzaChgJCgke3Byb3ZpZGVySWNvbi5pZH0pICR7cHJvdmlkZXJOYW1lfSBcdTIwMjIgJHt0aW1lTGFiZWx9YCk7XG5cblx0XHQvLyBEaWZmIGluZm9ybWF0aW9uXG5cdFx0Y29uc3QgZGlmZiA9IGdldEFnZW50Q2hhbmdlc1N1bW1hcnkoc2Vzc2lvbi5jaGFuZ2VzKTtcblx0XHRpZiAoZGlmZiAmJiBoYXNWYWxpZERpZmYoc2Vzc2lvbi5jaGFuZ2VzKSkge1xuXHRcdFx0Y29uc3QgZGlmZlBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKGRpZmYuZmlsZXMgPiAwKSB7XG5cdFx0XHRcdGRpZmZQYXJ0cy5wdXNoKGRpZmYuZmlsZXMgPT09IDEgPyBsb2NhbGl6ZSgndG9vbHRpcC5maWxlJywgXCIxIGZpbGVcIikgOiBsb2NhbGl6ZSgndG9vbHRpcC5maWxlcycsIFwiezB9IGZpbGVzXCIsIGRpZmYuZmlsZXMpKTtcblx0XHRcdH1cblx0XHRcdGlmIChkaWZmLmluc2VydGlvbnMgPiAwKSB7XG5cdFx0XHRcdGRpZmZQYXJ0cy5wdXNoKGArJHtkaWZmLmluc2VydGlvbnN9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGlmZi5kZWxldGlvbnMgPiAwKSB7XG5cdFx0XHRcdGRpZmZQYXJ0cy5wdXNoKGAtJHtkaWZmLmRlbGV0aW9uc31gKTtcblx0XHRcdH1cblx0XHRcdGlmIChkaWZmUGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRkZXRhaWxzLnB1c2goZGlmZlBhcnRzLmpvaW4oJyAnKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU3RhdHVzIChvbmx5IHNob3cgaWYgbm90IGNvbXBsZXRlZClcblx0XHRpZiAoc2Vzc2lvbi5zdGF0dXMgIT09IEFnZW50U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRcdGRldGFpbHMucHVzaCh0aGlzLnRvU3RhdHVzTGFiZWwoc2Vzc2lvbi5zdGF0dXMpKTtcblx0XHR9XG5cblx0XHRsaW5lcy5wdXNoKGRldGFpbHMuam9pbignIFx1MjAyMiAnKSk7XG5cblx0XHQvLyBBcmNoaXZlZCBzdGF0dXNcblx0XHRpZiAoc2Vzc2lvbi5pc0FyY2hpdmVkKCkpIHtcblx0XHRcdGxpbmVzLnB1c2goYCQoYXJjaGl2ZSkgJHtsb2NhbGl6ZSgndG9vbHRpcC5hcmNoaXZlZCcsIFwiQXJjaGl2ZWRcIil9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhsaW5lcy5qb2luKCdcXG5cXG4nKSwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9EdXJhdGlvbihzdGFydFRpbWU6IG51bWJlciwgZW5kVGltZTogbnVtYmVyLCB1c2VGdWxsVGltZVdvcmRzOiBib29sZWFuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbGFwc2VkID0gTWF0aC5yb3VuZCgoZW5kVGltZSAtIHN0YXJ0VGltZSkgLyAxMDAwKSAqIDEwMDA7XG5cdFx0aWYgKGVsYXBzZWQgPCAxMDAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBnZXREdXJhdGlvblN0cmluZyhlbGFwc2VkLCB1c2VGdWxsVGltZVdvcmRzKTtcblx0fVxuXG5cdHByaXZhdGUgdG9TdGF0dXNMYWJlbChzdGF0dXM6IEFnZW50U2Vzc2lvblN0YXR1cyk6IHN0cmluZyB7XG5cdFx0bGV0IHN0YXR1c0xhYmVsOiBzdHJpbmc7XG5cdFx0c3dpdGNoIChzdGF0dXMpIHtcblx0XHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ6XG5cdFx0XHRcdHN0YXR1c0xhYmVsID0gbG9jYWxpemUoJ2FnZW50U2Vzc2lvbk5lZWRzSW5wdXQnLCBcIk5lZWRzIElucHV0XCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M6XG5cdFx0XHRcdHN0YXR1c0xhYmVsID0gbG9jYWxpemUoJ2FnZW50U2Vzc2lvbkluUHJvZ3Jlc3MnLCBcIkluIFByb2dyZXNzXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWdlbnRTZXNzaW9uU3RhdHVzLkZhaWxlZDpcblx0XHRcdFx0c3RhdHVzTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uRmFpbGVkJywgXCJGYWlsZWRcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0c3RhdHVzTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uQ29tcGxldGVkJywgXCJDb21wbGV0ZWRcIik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXR1c0xhYmVsO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLHlCQUF5QjtBQUMzQyxTQUEwQixzQkFBc0I7QUFDaEQsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUIsb0JBQW9CO0FBRWhELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCLHlCQUF5Qiw2QkFBNkIsbUNBQW1DO0FBQ3pILFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CLHdCQUF3QixvQkFBbUM7QUFDeEYsT0FBTztBQUVQLE1BQU0sZ0JBQWdCO0FBQ3RCLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sbUJBQW1CO0FBRWxCLElBQU0sMEJBQU4sY0FBc0MsV0FBVztBQUFBLEVBVXZELFlBQ2lCLFNBQ2UsYUFDUyxzQkFDSCxtQkFDRyxzQkFDdkM7QUFDRCxVQUFNO0FBTlU7QUFDZTtBQUNTO0FBQ0g7QUFDRztBQUl4QyxTQUFLLFVBQVUsSUFBSSxFQUFFLDBDQUEwQztBQUMvRCxTQUFLLFFBQVEsTUFBTSxRQUFRLEdBQUcsZ0JBQWdCO0FBQzlDLFNBQUssUUFBUSxNQUFNLFNBQVMsR0FBRyxnQkFBZ0IsZ0JBQWdCO0FBQy9ELFNBQUssUUFBUSxNQUFNLFdBQVc7QUFFOUIsU0FBSyxNQUFNLElBQUksd0JBQXdCO0FB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
