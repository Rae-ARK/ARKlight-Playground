import * as dom from "../../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { KeyCode } from "../../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { generateUuid } from "../../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../../nls.js";
import { defaultButtonStyles } from "../../../../../../../platform/theme/browser/defaultStyles.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import "../media/chatToolConfirmationCarousel.css";
const COLLAPSED_CAROUSEL_MAX_HEIGHT = 300;
const COLLAPSED_MESSAGE_MAX_HEIGHT = 200;
const COLLAPSED_CODE_BLOCK_MAX_HEIGHT = 150;
const MIN_CAROUSEL_MAX_HEIGHT = 80;
const EXPANDABLE_CONTENT_SELECTOR = ".interactive-result-editor, .chat-markdown-part.rendered-markdown";
class ChatToolConfirmationCarouselPart extends Disposable {
  constructor(toolPartFactory, initialTools, revealSubagent, initialRevealSubagentLabel, initialSubAgentInvocationId, initialAgentName) {
    super();
    this.toolPartFactory = toolPartFactory;
    this.revealSubagent = revealSubagent;
    this.initialRevealSubagentLabel = initialRevealSubagentLabel;
    this.initialSubAgentInvocationId = initialSubAgentInvocationId;
    this.initialAgentName = initialAgentName;
    this._onDidEmpty = this._register(new Emitter());
    this.onDidEmpty = this._onDidEmpty.event;
    this._onDidChangeActiveSubagent = this._register(new Emitter());
    this.onDidChangeActiveSubagent = this._onDidChangeActiveSubagent.event;
    this.items = [];
    this.toolCallIds = /* @__PURE__ */ new Set();
    this.activeIndex = 0;
    this._isContentExpanded = false;
    this.canExpandContent = false;
    const elements = dom.h(".chat-tool-confirmation-carousel@root", [
      dom.h(".chat-tool-carousel-overlay@overlay", [
        dom.h(".chat-tool-carousel-title-group@titleGroup", [
          dom.h("span.chat-tool-carousel-collapsed-title@collapsedTitle"),
          dom.h("button.chat-tool-carousel-agent-label@agentLabel")
        ]),
        dom.h(".chat-tool-carousel-overlay-actions@overlayActions", [
          dom.h(".chat-tool-carousel-step-indicator@stepIndicator"),
          dom.h(".chat-tool-carousel-nav-arrows@navArrows")
        ])
      ]),
      dom.h(".chat-tool-carousel-content@content")
    ]);
    this.domNode = elements.root;
    this.domNode.tabIndex = -1;
    this.domNode.setAttribute("role", "group");
    this.domNode.setAttribute("aria-label", localize("toolConfirmationCarousel", "Tool confirmation carousel"));
    this.collapsedTitle = elements.collapsedTitle;
    this.agentLabel = elements.agentLabel;
    this.contentContainer = elements.content;
    this.contentContainer.id = generateUuid();
    this.stepIndicator = elements.stepIndicator;
    this.activeContentDisposables = this._register(new DisposableStore());
    this.updateContentExpansionStateScheduler = this._register(new dom.AnimationFrameScheduler(this.domNode, () => this.updateContentExpansionState()));
    this.contentResizeObserver = this._register(new dom.DisposableResizeObserver("ChatToolConfirmationCarouselPart.contentExpansion", () => this.updateContentExpansionStateScheduler.schedule()));
    this._register(this.contentResizeObserver.observe(this.contentContainer));
    this.allowAllButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, small: true }));
    this.allowAllButton.element.classList.add("chat-tool-carousel-allow-all-button");
    this.allowAllButton.label = localize("allowAll", "Allow All");
    this._register(this.allowAllButton.onDidClick(() => this.allowAll()));
    this.expandContentButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    this.expandContentButton.element.classList.add("chat-tool-carousel-header-button", "chat-tool-carousel-expand-content-button");
    this.expandContentButton.element.setAttribute("aria-controls", this.contentContainer.id);
    this.updateExpandContentButton();
    dom.hide(this.expandContentButton.element);
    this._register(this.expandContentButton.onDidClick(() => this.toggleContentExpanded()));
    this.dismissButton = this._register(new Button(elements.overlayActions, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
    this.dismissButton.element.classList.add("chat-tool-carousel-dismiss-button");
    this.dismissButton.label = `$(${Codicon.close.id})`;
    const dismissButtonLabel = this.items.length === 1 ? localize("skip", "Skip") : localize("skipAll", "Skip All");
    this.dismissButton.element.setAttribute("aria-label", dismissButtonLabel);
    this.dismissButton.element.title = dismissButtonLabel;
    this._register(this.dismissButton.onDidClick(() => this.skipAll()));
    this.prevButton = this._register(new Button(elements.navArrows, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true
    }));
    this.prevButton.element.classList.add("chat-tool-carousel-nav-arrow");
    this.prevButton.label = `$(${Codicon.chevronLeft.id})`;
    this.prevButton.element.setAttribute("aria-label", localize("previous", "Previous"));
    this._register(this.prevButton.onDidClick(() => this.navigateRelative(-1)));
    this.nextButton = this._register(new Button(elements.navArrows, {
      ...defaultButtonStyles,
      secondary: true,
      supportIcons: true
    }));
    this.nextButton.element.classList.add("chat-tool-carousel-nav-arrow");
    this.nextButton.label = `$(${Codicon.chevronRight.id})`;
    this.nextButton.element.setAttribute("aria-label", localize("next", "Next"));
    this._register(this.nextButton.onDidClick(() => this.navigateRelative(1)));
    this._register(dom.addDisposableListener(this.agentLabel, "click", (e) => {
      e.preventDefault();
      this.revealActiveSubagent();
    }));
    this._register(dom.addDisposableListener(this.domNode, "keydown", (e) => this.onKeydown(e)));
    for (const tool of initialTools) {
      this.addToolInvocation(tool, this.initialSubAgentInvocationId, this.initialAgentName, this.revealSubagent, this.initialRevealSubagentLabel);
    }
  }
  get pendingCount() {
    return this.items.length;
  }
  get activeSubAgentInvocationId() {
    return this.items[this.activeIndex]?.subAgentInvocationId;
  }
  setMaxHeight(maxHeight) {
    this.maxHeight = maxHeight;
    this.updateContentExpansionState();
  }
  hasToolInvocation(toolCallId) {
    return this.toolCallIds.has(toolCallId);
  }
  addToolInvocation(tool, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart) {
    if (this.toolCallIds.has(tool.toolCallId)) {
      const existing = this.items.find((item2) => item2.toolCallId === tool.toolCallId);
      if (existing && toolPart && !existing.toolPart) {
        this.replaceExternalToolPart(existing, toolPart);
      }
      return;
    }
    this.toolCallIds.add(tool.toolCallId);
    const disposables = new DisposableStore();
    const item = {
      tool,
      toolCallId: tool.toolCallId,
      disposables,
      subAgentInvocationId,
      agentName,
      revealSubagent,
      revealSubagentLabel,
      ownsToolPart: !toolPart,
      toolPart
    };
    this.items.push(item);
    if (toolPart) {
      this.watchExternalToolPart(item, toolPart);
    }
    disposables.add(autorun((reader) => {
      const currentState = tool.state.read(reader);
      if (currentState.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
        this.removeItem(tool.toolCallId);
      }
    }));
    this.updateUI();
    if (this.items.length === 1) {
      this.setActiveIndex(0);
    }
  }
  replaceExternalToolPart(item, toolPart) {
    if (item.toolPart === toolPart) {
      return;
    }
    if (item.toolPart && item.ownsToolPart) {
      item.toolPart.dispose();
    }
    item.toolPart = toolPart;
    item.ownsToolPart = false;
    this.watchExternalToolPart(item, toolPart);
    if (this.items[this.activeIndex] === item) {
      this.renderActiveContent();
    }
  }
  watchExternalToolPart(item, toolPart) {
    let isItemAlive = true;
    item.disposables.add(toDisposable(() => isItemAlive = false));
    const externalPartDisposeWatcher = new MutableDisposable();
    externalPartDisposeWatcher.value = toDisposable(() => {
      if (!isItemAlive || item.toolPart !== toolPart) {
        return;
      }
      item.toolPart = void 0;
      item.ownsToolPart = true;
      if (this.items[this.activeIndex] === item) {
        this.renderActiveContent();
      }
    });
    toolPart.addDisposable(externalPartDisposeWatcher);
    item.disposables.add(toDisposable(() => externalPartDisposeWatcher.clear()));
  }
  dispose() {
    for (const item of this.items) {
      if (item.toolPart && item.ownsToolPart) {
        item.toolPart.dispose();
      }
      item.disposables.dispose();
    }
    this.items.splice(0);
    this.toolCallIds.clear();
    super.dispose();
  }
  removeItem(toolCallId) {
    const index = this.items.findIndex((i) => i.toolCallId === toolCallId);
    if (index < 0) {
      return;
    }
    const [removed] = this.items.splice(index, 1);
    this.toolCallIds.delete(toolCallId);
    if (removed.toolPart && removed.ownsToolPart) {
      removed.toolPart.dispose();
    }
    removed.disposables.dispose();
    if (this.items.length === 0) {
      dom.hide(this.domNode);
      this._onDidChangeActiveSubagent.fire(void 0);
      this._onDidEmpty.fire();
      return;
    }
    if (this.activeIndex >= this.items.length) {
      this.activeIndex = this.items.length - 1;
    }
    this.updateUI();
    this.renderActiveContent();
    this._onDidChangeActiveSubagent.fire(this.activeSubAgentInvocationId);
  }
  setActiveIndex(index) {
    this.activeIndex = index;
    this.updateUI();
    this.renderActiveContent();
    this._onDidChangeActiveSubagent.fire(this.activeSubAgentInvocationId);
  }
  navigateRelative(delta) {
    if (this.items.length <= 1) {
      return;
    }
    const newIndex = (this.activeIndex + delta + this.items.length) % this.items.length;
    this.setActiveIndex(newIndex);
  }
  onKeydown(e) {
    if (this.items.length === 0) {
      return;
    }
    if (this.shouldIgnoreNavigationKeydown(e.target)) {
      return;
    }
    const event = new StandardKeyboardEvent(e);
    const focusContentAfterNavigation = dom.isHTMLElement(e.target) && this.contentContainer.contains(e.target);
    let didNavigate = false;
    switch (event.keyCode) {
      case KeyCode.LeftArrow:
        this.navigateRelative(-1);
        didNavigate = true;
        break;
      case KeyCode.RightArrow:
        this.navigateRelative(1);
        didNavigate = true;
        break;
      case KeyCode.Home:
        this.setActiveIndex(0);
        didNavigate = true;
        break;
      case KeyCode.End:
        this.setActiveIndex(this.items.length - 1);
        didNavigate = true;
        break;
    }
    if (!didNavigate) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (focusContentAfterNavigation) {
      this.focusActiveContent();
    }
  }
  shouldIgnoreNavigationKeydown(target) {
    if (!dom.isHTMLElement(target)) {
      return false;
    }
    return !!target.closest('.monaco-editor, .interactive-result-editor, .chat-confirmation-widget-message, input, textarea, select, [contenteditable="true"]');
  }
  focusActiveContent() {
    this.domNode.focus();
  }
  updateUI() {
    const item = this.items[this.activeIndex];
    this.collapsedTitle.textContent = this.getToolTitle(item) ?? "";
    dom.setVisibility(!!this.collapsedTitle.textContent, this.collapsedTitle);
    if (item?.agentName) {
      this.agentLabel.textContent = `\u2014 ${item.agentName}`;
      this.agentLabel.disabled = !item.subAgentInvocationId || !item.revealSubagent;
      this.agentLabel.title = item.revealSubagentLabel ?? localize("scrollToSubagent", "Scroll to {0}", item.agentName);
      this.agentLabel.setAttribute("aria-label", this.agentLabel.title);
      dom.show(this.agentLabel);
    } else {
      this.agentLabel.textContent = "";
      this.agentLabel.title = "";
      this.agentLabel.removeAttribute("aria-label");
      dom.hide(this.agentLabel);
    }
    this.stepIndicator.textContent = `${this.activeIndex + 1}/${this.items.length}`;
    const multi = this.items.length > 1;
    this.prevButton.enabled = multi;
    this.nextButton.enabled = multi;
    dom.setVisibility(multi, this.stepIndicator);
    dom.setVisibility(multi, this.prevButton.element);
    dom.setVisibility(multi, this.nextButton.element);
    dom.setVisibility(multi, this.allowAllButton.element);
    dom.setVisibility(this.canExpandContent, this.expandContentButton.element);
    this.allowAllButton.label = multi ? localize("allowAll", "Allow All") : localize("allow", "Allow");
    this.updateExpandContentButton();
  }
  renderActiveContent() {
    dom.clearNode(this.contentContainer);
    this.activeContentDisposables.clear();
    this._isContentExpanded = false;
    this.canExpandContent = false;
    const item = this.items[this.activeIndex];
    if (!item) {
      this.updateContentExpansionState();
      return;
    }
    if (!item.toolPart) {
      item.toolPart = this.toolPartFactory(item.tool);
      if (item.ownsToolPart) {
        item.disposables.add(item.toolPart);
      }
    }
    this.contentContainer.appendChild(item.toolPart.domNode);
    this.activeContentDisposables.add(this.contentResizeObserver.observe(item.toolPart.domNode));
    this.observeExpandableContentElements(item.toolPart.domNode);
    this.updateContentExpansionStateScheduler.schedule();
  }
  toggleContentExpanded() {
    if (!this.canExpandContent) {
      return;
    }
    this._isContentExpanded = !this._isContentExpanded;
    this.updateContentExpansionState();
  }
  updateContentExpansionState() {
    this.canExpandContent = this.items.length > 0 && this.isActiveContentLargerThanCollapsedLimit();
    if (!this.canExpandContent) {
      this._isContentExpanded = false;
    }
    this.domNode.classList.toggle("chat-tool-carousel-content-expanded", this.canExpandContent && this._isContentExpanded);
    this.updateMaxHeightStyle();
    dom.setVisibility(this.canExpandContent, this.expandContentButton.element);
    this.updateExpandContentButton();
  }
  updateMaxHeightStyle() {
    if (this.maxHeight === void 0) {
      this.domNode.style.removeProperty("max-height");
      return;
    }
    const expanded = this.canExpandContent && this._isContentExpanded;
    const maxHeight = expanded ? Math.max(MIN_CAROUSEL_MAX_HEIGHT, this.maxHeight) : this.getCollapsedMaxHeight();
    this.domNode.style.maxHeight = `${Math.floor(maxHeight)}px`;
  }
  updateExpandContentButton() {
    const expanded = this.canExpandContent && this._isContentExpanded;
    const label = expanded ? localize("restoreConfirmationSize", "Restore Confirmation Size") : localize("expandConfirmationUp", "Expand Confirmation Up");
    this.expandContentButton.label = expanded ? `$(${Codicon.screenNormal.id})` : `$(${Codicon.screenFull.id})`;
    this.expandContentButton.element.setAttribute("aria-label", label);
    this.expandContentButton.element.setAttribute("aria-expanded", String(expanded));
    this.expandContentButton.setTitle(label);
  }
  isActiveContentLargerThanCollapsedLimit() {
    const activeContent = this.contentContainer.firstElementChild;
    if (!dom.isHTMLElement(activeContent)) {
      return false;
    }
    return this.hasInnerContentLargerThanCollapsedLimit(activeContent);
  }
  hasInnerContentLargerThanCollapsedLimit(element) {
    if (this.isExpandableContentElement(element) && this.getElementHeight(element) > this.getExpandableContentHeightLimit(element) + 1) {
      return true;
    }
    for (const child of element.children) {
      if (!dom.isHTMLElement(child)) {
        continue;
      }
      if (this.hasInnerContentLargerThanCollapsedLimit(child)) {
        return true;
      }
    }
    return false;
  }
  isExpandableContentElement(element) {
    return element.matches(EXPANDABLE_CONTENT_SELECTOR);
  }
  observeExpandableContentElements(element) {
    if (this.isExpandableContentElement(element)) {
      this.activeContentDisposables.add(this.contentResizeObserver.observe(element));
    }
    for (const child of element.children) {
      if (dom.isHTMLElement(child)) {
        this.observeExpandableContentElements(child);
      }
    }
  }
  getElementHeight(element) {
    return Math.max(element.offsetHeight, element.scrollHeight);
  }
  getExpandableContentHeightLimit(element) {
    const window = dom.getWindow(this.domNode);
    if (element.classList.contains("interactive-result-editor")) {
      return Math.min(COLLAPSED_CODE_BLOCK_MAX_HEIGHT, window.innerHeight * 0.25);
    }
    return Math.min(COLLAPSED_MESSAGE_MAX_HEIGHT, window.innerHeight * 0.3);
  }
  getCollapsedMaxHeight() {
    const configuredMaxHeight = this.maxHeight === void 0 ? Number.POSITIVE_INFINITY : Math.max(MIN_CAROUSEL_MAX_HEIGHT, this.maxHeight);
    return Math.min(configuredMaxHeight, COLLAPSED_CAROUSEL_MAX_HEIGHT, dom.getWindow(this.domNode).innerHeight * 0.45);
  }
  allowAll() {
    for (const item of [...this.items]) {
      IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.UserAction });
    }
  }
  skipAll() {
    for (const item of [...this.items]) {
      IChatToolInvocation.confirmWith(item.tool, { type: ToolConfirmKind.Skipped });
    }
  }
  getToolTitle(item) {
    if (!item) {
      return void 0;
    }
    const messages = IChatToolInvocation.getConfirmationMessages(item.tool);
    if (!messages?.title) {
      return void 0;
    }
    return this.truncateTitle(this.toPlainText(messages.title));
  }
  truncateTitle(text) {
    text = text.replace(/\s+/g, " ").trim();
    const maxLength = 100;
    return text.length > maxLength ? `${text.substring(0, maxLength)}\u2026` : text;
  }
  toPlainText(message) {
    const markdown = typeof message === "string" ? message : message.value;
    return markdown.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, text, url) => text || this.basename(url)).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/[\\*_#>]/g, "");
  }
  basename(url) {
    try {
      const path = decodeURIComponent(url.split("?")[0].split("#")[0]);
      const segments = path.split("/").filter(Boolean);
      return segments.at(-1) ?? url;
    } catch {
      return url;
    }
  }
  revealActiveSubagent() {
    const item = this.items[this.activeIndex];
    if (item?.subAgentInvocationId) {
      item.revealSubagent?.(item.subAgentInvocationId);
    }
  }
  activateFirstToolForSubagent(subAgentInvocationId) {
    const index = this.items.findIndex((i) => i.subAgentInvocationId === subAgentInvocationId);
    if (index >= 0) {
      this.setActiveIndex(index);
    }
  }
}
export {
  ChatToolConfirmationCarouselPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB9IGZyb20gJy4vY2hhdFRvb2xJbnZvY2F0aW9uUGFydC5qcyc7XG5pbXBvcnQgJy4uL21lZGlhL2NoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwuY3NzJztcblxuY29uc3QgQ09MTEFQU0VEX0NBUk9VU0VMX01BWF9IRUlHSFQgPSAzMDA7XG5jb25zdCBDT0xMQVBTRURfTUVTU0FHRV9NQVhfSEVJR0hUID0gMjAwO1xuY29uc3QgQ09MTEFQU0VEX0NPREVfQkxPQ0tfTUFYX0hFSUdIVCA9IDE1MDtcbmNvbnN0IE1JTl9DQVJPVVNFTF9NQVhfSEVJR0hUID0gODA7XG5jb25zdCBFWFBBTkRBQkxFX0NPTlRFTlRfU0VMRUNUT1IgPSAnLmludGVyYWN0aXZlLXJlc3VsdC1lZGl0b3IsIC5jaGF0LW1hcmtkb3duLXBhcnQucmVuZGVyZWQtbWFya2Rvd24nO1xuXG5leHBvcnQgdHlwZSBUb29sSW52b2NhdGlvblBhcnRGYWN0b3J5ID0gKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24pID0+IENoYXRUb29sSW52b2NhdGlvblBhcnQ7XG5cbmV4cG9ydCB0eXBlIFJldmVhbFN1YmFnZW50Q2FsbGJhY2sgPSAoc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZykgPT4gdm9pZDtcblxuaW50ZXJmYWNlIElDYXJvdXNlbFRvb2xJdGVtIHtcblx0cmVhZG9ubHkgdG9vbDogSUNoYXRUb29sSW52b2NhdGlvbjtcblx0cmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBzdWJBZ2VudEludm9jYXRpb25JZD86IHN0cmluZztcblx0cmVhZG9ubHkgYWdlbnROYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSByZXZlYWxTdWJhZ2VudD86IFJldmVhbFN1YmFnZW50Q2FsbGJhY2s7XG5cdHJlYWRvbmx5IHJldmVhbFN1YmFnZW50TGFiZWw/OiBzdHJpbmc7XG5cdG93bnNUb29sUGFydDogYm9vbGVhbjtcblx0dG9vbFBhcnQ/OiBDaGF0VG9vbEludm9jYXRpb25QYXJ0O1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbFBhcnQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW1wdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRFbXB0eSA9IHRoaXMuX29uRGlkRW1wdHkuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlU3ViYWdlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZVN1YmFnZW50ID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1zOiBJQ2Fyb3VzZWxUb29sSXRlbVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbENhbGxJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBhY3RpdmVJbmRleCA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb2xsYXBzZWRUaXRsZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWdlbnRMYWJlbDogSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RlcEluZGljYXRvcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcHJldkJ1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IG5leHRCdXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBhbGxvd0FsbEJ1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4cGFuZENvbnRlbnRCdXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNtaXNzQnV0dG9uOiBCdXR0b247XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlQ29udGVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudFJlc2l6ZU9ic2VydmVyOiBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZUNvbnRlbnRFeHBhbnNpb25TdGF0ZVNjaGVkdWxlcjogZG9tLkFuaW1hdGlvbkZyYW1lU2NoZWR1bGVyO1xuXHRwcml2YXRlIF9pc0NvbnRlbnRFeHBhbmRlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGNhbkV4cGFuZENvbnRlbnQgPSBmYWxzZTtcblx0cHJpdmF0ZSBtYXhIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvb2xQYXJ0RmFjdG9yeTogVG9vbEludm9jYXRpb25QYXJ0RmFjdG9yeSxcblx0XHRpbml0aWFsVG9vbHM6IElDaGF0VG9vbEludm9jYXRpb25bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJldmVhbFN1YmFnZW50PzogUmV2ZWFsU3ViYWdlbnRDYWxsYmFjayxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGluaXRpYWxSZXZlYWxTdWJhZ2VudExhYmVsPzogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5pdGlhbFN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5pdGlhbEFnZW50TmFtZT86IHN0cmluZyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gZG9tLmgoJy5jaGF0LXRvb2wtY29uZmlybWF0aW9uLWNhcm91c2VsQHJvb3QnLCBbXG5cdFx0XHRkb20uaCgnLmNoYXQtdG9vbC1jYXJvdXNlbC1vdmVybGF5QG92ZXJsYXknLCBbXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC10b29sLWNhcm91c2VsLXRpdGxlLWdyb3VwQHRpdGxlR3JvdXAnLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJ3NwYW4uY2hhdC10b29sLWNhcm91c2VsLWNvbGxhcHNlZC10aXRsZUBjb2xsYXBzZWRUaXRsZScpLFxuXHRcdFx0XHRcdGRvbS5oKCdidXR0b24uY2hhdC10b29sLWNhcm91c2VsLWFnZW50LWxhYmVsQGFnZW50TGFiZWwnKSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC10b29sLWNhcm91c2VsLW92ZXJsYXktYWN0aW9uc0BvdmVybGF5QWN0aW9ucycsIFtcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtdG9vbC1jYXJvdXNlbC1zdGVwLWluZGljYXRvckBzdGVwSW5kaWNhdG9yJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXRvb2wtY2Fyb3VzZWwtbmF2LWFycm93c0BuYXZBcnJvd3MnKSxcblx0XHRcdFx0XSksXG5cdFx0XHRdKSxcblx0XHRcdGRvbS5oKCcuY2hhdC10b29sLWNhcm91c2VsLWNvbnRlbnRAY29udGVudCcpLFxuXHRcdF0pO1xuXG5cdFx0dGhpcy5kb21Ob2RlID0gZWxlbWVudHMucm9vdDtcblx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2dyb3VwJyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCd0b29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwnLCBcIlRvb2wgY29uZmlybWF0aW9uIGNhcm91c2VsXCIpKTtcblx0XHR0aGlzLmNvbGxhcHNlZFRpdGxlID0gZWxlbWVudHMuY29sbGFwc2VkVGl0bGU7XG5cdFx0dGhpcy5hZ2VudExhYmVsID0gZWxlbWVudHMuYWdlbnRMYWJlbDtcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIgPSBlbGVtZW50cy5jb250ZW50O1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lci5pZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuc3RlcEluZGljYXRvciA9IGVsZW1lbnRzLnN0ZXBJbmRpY2F0b3I7XG5cdFx0dGhpcy5hY3RpdmVDb250ZW50RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudEV4cGFuc2lvblN0YXRlU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5BbmltYXRpb25GcmFtZVNjaGVkdWxlcih0aGlzLmRvbU5vZGUsICgpID0+IHRoaXMudXBkYXRlQ29udGVudEV4cGFuc2lvblN0YXRlKCkpKTtcblx0XHR0aGlzLmNvbnRlbnRSZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydC5jb250ZW50RXhwYW5zaW9uJywgKCkgPT4gdGhpcy51cGRhdGVDb250ZW50RXhwYW5zaW9uU3RhdGVTY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGVudFJlc2l6ZU9ic2VydmVyLm9ic2VydmUodGhpcy5jb250ZW50Q29udGFpbmVyKSk7XG5cblx0XHR0aGlzLmFsbG93QWxsQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihlbGVtZW50cy5vdmVybGF5QWN0aW9ucywgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzbWFsbDogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5hbGxvd0FsbEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtdG9vbC1jYXJvdXNlbC1hbGxvdy1hbGwtYnV0dG9uJyk7XG5cdFx0dGhpcy5hbGxvd0FsbEJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdhbGxvd0FsbCcsIFwiQWxsb3cgQWxsXCIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWxsb3dBbGxCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmFsbG93QWxsKCkpKTtcblxuXHRcdHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oZWxlbWVudHMub3ZlcmxheUFjdGlvbnMsIHsgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcywgc2Vjb25kYXJ5OiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUgfSkpO1xuXHRcdHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtdG9vbC1jYXJvdXNlbC1oZWFkZXItYnV0dG9uJywgJ2NoYXQtdG9vbC1jYXJvdXNlbC1leHBhbmQtY29udGVudC1idXR0b24nKTtcblx0XHR0aGlzLmV4cGFuZENvbnRlbnRCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtY29udHJvbHMnLCB0aGlzLmNvbnRlbnRDb250YWluZXIuaWQpO1xuXHRcdHRoaXMudXBkYXRlRXhwYW5kQ29udGVudEJ1dHRvbigpO1xuXHRcdGRvbS5oaWRlKHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5lbGVtZW50KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4cGFuZENvbnRlbnRCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLnRvZ2dsZUNvbnRlbnRFeHBhbmRlZCgpKSk7XG5cblx0XHR0aGlzLmRpc21pc3NCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGVsZW1lbnRzLm92ZXJsYXlBY3Rpb25zLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlIH0pKTtcblx0XHR0aGlzLmRpc21pc3NCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXRvb2wtY2Fyb3VzZWwtZGlzbWlzcy1idXR0b24nKTtcblx0XHR0aGlzLmRpc21pc3NCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24uY2xvc2UuaWR9KWA7XG5cdFx0Y29uc3QgZGlzbWlzc0J1dHRvbkxhYmVsID0gdGhpcy5pdGVtcy5sZW5ndGggPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ3NraXAnLCBcIlNraXBcIilcblx0XHRcdDogbG9jYWxpemUoJ3NraXBBbGwnLCBcIlNraXAgQWxsXCIpO1xuXHRcdHRoaXMuZGlzbWlzc0J1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGRpc21pc3NCdXR0b25MYWJlbCk7XG5cdFx0dGhpcy5kaXNtaXNzQnV0dG9uLmVsZW1lbnQudGl0bGUgPSBkaXNtaXNzQnV0dG9uTGFiZWw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kaXNtaXNzQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5za2lwQWxsKCkpKTtcblxuXHRcdHRoaXMucHJldkJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oZWxlbWVudHMubmF2QXJyb3dzLCB7XG5cdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLnByZXZCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXRvb2wtY2Fyb3VzZWwtbmF2LWFycm93Jyk7XG5cdFx0dGhpcy5wcmV2QnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmNoZXZyb25MZWZ0LmlkfSlgO1xuXHRcdHRoaXMucHJldkJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdwcmV2aW91cycsIFwiUHJldmlvdXNcIikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJldkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMubmF2aWdhdGVSZWxhdGl2ZSgtMSkpKTtcblxuXHRcdHRoaXMubmV4dEJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24oZWxlbWVudHMubmF2QXJyb3dzLCB7XG5cdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLm5leHRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXRvb2wtY2Fyb3VzZWwtbmF2LWFycm93Jyk7XG5cdFx0dGhpcy5uZXh0QnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmNoZXZyb25SaWdodC5pZH0pYDtcblx0XHR0aGlzLm5leHRCdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnbmV4dCcsIFwiTmV4dFwiKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5uZXh0QnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5uYXZpZ2F0ZVJlbGF0aXZlKDEpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuYWdlbnRMYWJlbCwgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLnJldmVhbEFjdGl2ZVN1YmFnZW50KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsICdrZXlkb3duJywgZSA9PiB0aGlzLm9uS2V5ZG93bihlKSkpO1xuXG5cdFx0Zm9yIChjb25zdCB0b29sIG9mIGluaXRpYWxUb29scykge1xuXHRcdFx0dGhpcy5hZGRUb29sSW52b2NhdGlvbih0b29sLCB0aGlzLmluaXRpYWxTdWJBZ2VudEludm9jYXRpb25JZCwgdGhpcy5pbml0aWFsQWdlbnROYW1lLCB0aGlzLnJldmVhbFN1YmFnZW50LCB0aGlzLmluaXRpYWxSZXZlYWxTdWJhZ2VudExhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgcGVuZGluZ0NvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMubGVuZ3RoO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZVN1YkFnZW50SW52b2NhdGlvbklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXNbdGhpcy5hY3RpdmVJbmRleF0/LnN1YkFnZW50SW52b2NhdGlvbklkO1xuXHR9XG5cblx0c2V0TWF4SGVpZ2h0KG1heEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5tYXhIZWlnaHQgPSBtYXhIZWlnaHQ7XG5cdFx0dGhpcy51cGRhdGVDb250ZW50RXhwYW5zaW9uU3RhdGUoKTtcblx0fVxuXG5cdGhhc1Rvb2xJbnZvY2F0aW9uKHRvb2xDYWxsSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRvb2xDYWxsSWRzLmhhcyh0b29sQ2FsbElkKTtcblx0fVxuXG5cdGFkZFRvb2xJbnZvY2F0aW9uKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24sIHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nLCBhZ2VudE5hbWU/OiBzdHJpbmcsIHJldmVhbFN1YmFnZW50PzogUmV2ZWFsU3ViYWdlbnRDYWxsYmFjaywgcmV2ZWFsU3ViYWdlbnRMYWJlbD86IHN0cmluZywgdG9vbFBhcnQ/OiBDaGF0VG9vbEludm9jYXRpb25QYXJ0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudG9vbENhbGxJZHMuaGFzKHRvb2wudG9vbENhbGxJZCkpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5pdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS50b29sQ2FsbElkID09PSB0b29sLnRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nICYmIHRvb2xQYXJ0ICYmICFleGlzdGluZy50b29sUGFydCkge1xuXHRcdFx0XHR0aGlzLnJlcGxhY2VFeHRlcm5hbFRvb2xQYXJ0KGV4aXN0aW5nLCB0b29sUGFydCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50b29sQ2FsbElkcy5hZGQodG9vbC50b29sQ2FsbElkKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgaXRlbTogSUNhcm91c2VsVG9vbEl0ZW0gPSB7XG5cdFx0XHR0b29sLFxuXHRcdFx0dG9vbENhbGxJZDogdG9vbC50b29sQ2FsbElkLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdGFnZW50TmFtZSxcblx0XHRcdHJldmVhbFN1YmFnZW50LFxuXHRcdFx0cmV2ZWFsU3ViYWdlbnRMYWJlbCxcblx0XHRcdG93bnNUb29sUGFydDogIXRvb2xQYXJ0LFxuXHRcdFx0dG9vbFBhcnQsXG5cdFx0fTtcblx0XHR0aGlzLml0ZW1zLnB1c2goaXRlbSk7XG5cdFx0aWYgKHRvb2xQYXJ0KSB7XG5cdFx0XHR0aGlzLndhdGNoRXh0ZXJuYWxUb29sUGFydChpdGVtLCB0b29sUGFydCk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRvb2wuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGN1cnJlbnRTdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlSXRlbSh0b29sLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlVUkoKTtcblxuXHRcdGlmICh0aGlzLml0ZW1zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVJbmRleCgwKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlcGxhY2VFeHRlcm5hbFRvb2xQYXJ0KGl0ZW06IElDYXJvdXNlbFRvb2xJdGVtLCB0b29sUGFydDogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCk6IHZvaWQge1xuXHRcdGlmIChpdGVtLnRvb2xQYXJ0ID09PSB0b29sUGFydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpdGVtLnRvb2xQYXJ0ICYmIGl0ZW0ub3duc1Rvb2xQYXJ0KSB7XG5cdFx0XHRpdGVtLnRvb2xQYXJ0LmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRpdGVtLnRvb2xQYXJ0ID0gdG9vbFBhcnQ7XG5cdFx0aXRlbS5vd25zVG9vbFBhcnQgPSBmYWxzZTtcblx0XHR0aGlzLndhdGNoRXh0ZXJuYWxUb29sUGFydChpdGVtLCB0b29sUGFydCk7XG5cdFx0aWYgKHRoaXMuaXRlbXNbdGhpcy5hY3RpdmVJbmRleF0gPT09IGl0ZW0pIHtcblx0XHRcdHRoaXMucmVuZGVyQWN0aXZlQ29udGVudCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgd2F0Y2hFeHRlcm5hbFRvb2xQYXJ0KGl0ZW06IElDYXJvdXNlbFRvb2xJdGVtLCB0b29sUGFydDogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCk6IHZvaWQge1xuXHRcdGxldCBpc0l0ZW1BbGl2ZSA9IHRydWU7XG5cdFx0aXRlbS5kaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGlzSXRlbUFsaXZlID0gZmFsc2UpKTtcblxuXHRcdGNvbnN0IGV4dGVybmFsUGFydERpc3Bvc2VXYXRjaGVyID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cdFx0ZXh0ZXJuYWxQYXJ0RGlzcG9zZVdhdGNoZXIudmFsdWUgPSB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKCFpc0l0ZW1BbGl2ZSB8fCBpdGVtLnRvb2xQYXJ0ICE9PSB0b29sUGFydCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGl0ZW0udG9vbFBhcnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpdGVtLm93bnNUb29sUGFydCA9IHRydWU7XG5cdFx0XHRpZiAodGhpcy5pdGVtc1t0aGlzLmFjdGl2ZUluZGV4XSA9PT0gaXRlbSkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckFjdGl2ZUNvbnRlbnQoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0b29sUGFydC5hZGREaXNwb3NhYmxlKGV4dGVybmFsUGFydERpc3Bvc2VXYXRjaGVyKTtcblx0XHRpdGVtLmRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZXh0ZXJuYWxQYXJ0RGlzcG9zZVdhdGNoZXIuY2xlYXIoKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5pdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0udG9vbFBhcnQgJiYgaXRlbS5vd25zVG9vbFBhcnQpIHtcblx0XHRcdFx0aXRlbS50b29sUGFydC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHRpdGVtLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5pdGVtcy5zcGxpY2UoMCk7XG5cdFx0dGhpcy50b29sQ2FsbElkcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlSXRlbSh0b29sQ2FsbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuaXRlbXMuZmluZEluZGV4KGkgPT4gaS50b29sQ2FsbElkID09PSB0b29sQ2FsbElkKTtcblx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3JlbW92ZWRdID0gdGhpcy5pdGVtcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdHRoaXMudG9vbENhbGxJZHMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdGlmIChyZW1vdmVkLnRvb2xQYXJ0ICYmIHJlbW92ZWQub3duc1Rvb2xQYXJ0KSB7XG5cdFx0XHRyZW1vdmVkLnRvb2xQYXJ0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmVtb3ZlZC5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRpZiAodGhpcy5pdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGRvbS5oaWRlKHRoaXMuZG9tTm9kZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVN1YmFnZW50LmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX29uRGlkRW1wdHkuZmlyZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmFjdGl2ZUluZGV4ID49IHRoaXMuaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUluZGV4ID0gdGhpcy5pdGVtcy5sZW5ndGggLSAxO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlVUkoKTtcblx0XHR0aGlzLnJlbmRlckFjdGl2ZUNvbnRlbnQoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZVN1YmFnZW50LmZpcmUodGhpcy5hY3RpdmVTdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIHNldEFjdGl2ZUluZGV4KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGl2ZUluZGV4ID0gaW5kZXg7XG5cdFx0dGhpcy51cGRhdGVVSSgpO1xuXHRcdHRoaXMucmVuZGVyQWN0aXZlQ29udGVudCgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlU3ViYWdlbnQuZmlyZSh0aGlzLmFjdGl2ZVN1YkFnZW50SW52b2NhdGlvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgbmF2aWdhdGVSZWxhdGl2ZShkZWx0YTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXRlbXMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV3SW5kZXggPSAodGhpcy5hY3RpdmVJbmRleCArIGRlbHRhICsgdGhpcy5pdGVtcy5sZW5ndGgpICUgdGhpcy5pdGVtcy5sZW5ndGg7XG5cdFx0dGhpcy5zZXRBY3RpdmVJbmRleChuZXdJbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIG9uS2V5ZG93bihlOiBLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2hvdWxkSWdub3JlTmF2aWdhdGlvbktleWRvd24oZS50YXJnZXQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdGNvbnN0IGZvY3VzQ29udGVudEFmdGVyTmF2aWdhdGlvbiA9IGRvbS5pc0hUTUxFbGVtZW50KGUudGFyZ2V0KSAmJiB0aGlzLmNvbnRlbnRDb250YWluZXIuY29udGFpbnMoZS50YXJnZXQpO1xuXHRcdGxldCBkaWROYXZpZ2F0ZSA9IGZhbHNlO1xuXG5cdFx0c3dpdGNoIChldmVudC5rZXlDb2RlKSB7XG5cdFx0XHRjYXNlIEtleUNvZGUuTGVmdEFycm93OlxuXHRcdFx0XHR0aGlzLm5hdmlnYXRlUmVsYXRpdmUoLTEpO1xuXHRcdFx0XHRkaWROYXZpZ2F0ZSA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBLZXlDb2RlLlJpZ2h0QXJyb3c6XG5cdFx0XHRcdHRoaXMubmF2aWdhdGVSZWxhdGl2ZSgxKTtcblx0XHRcdFx0ZGlkTmF2aWdhdGUgPSB0cnVlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgS2V5Q29kZS5Ib21lOlxuXHRcdFx0XHR0aGlzLnNldEFjdGl2ZUluZGV4KDApO1xuXHRcdFx0XHRkaWROYXZpZ2F0ZSA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBLZXlDb2RlLkVuZDpcblx0XHRcdFx0dGhpcy5zZXRBY3RpdmVJbmRleCh0aGlzLml0ZW1zLmxlbmd0aCAtIDEpO1xuXHRcdFx0XHRkaWROYXZpZ2F0ZSA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGlmICghZGlkTmF2aWdhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdGlmIChmb2N1c0NvbnRlbnRBZnRlck5hdmlnYXRpb24pIHtcblx0XHRcdHRoaXMuZm9jdXNBY3RpdmVDb250ZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRJZ25vcmVOYXZpZ2F0aW9uS2V5ZG93bih0YXJnZXQ6IEV2ZW50VGFyZ2V0IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdGlmICghZG9tLmlzSFRNTEVsZW1lbnQodGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiAhIXRhcmdldC5jbG9zZXN0KCcubW9uYWNvLWVkaXRvciwgLmludGVyYWN0aXZlLXJlc3VsdC1lZGl0b3IsIC5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtbWVzc2FnZSwgaW5wdXQsIHRleHRhcmVhLCBzZWxlY3QsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzQWN0aXZlQ29udGVudCgpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVUkoKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbdGhpcy5hY3RpdmVJbmRleF07XG5cblx0XHR0aGlzLmNvbGxhcHNlZFRpdGxlLnRleHRDb250ZW50ID0gdGhpcy5nZXRUb29sVGl0bGUoaXRlbSkgPz8gJyc7XG5cdFx0ZG9tLnNldFZpc2liaWxpdHkoISF0aGlzLmNvbGxhcHNlZFRpdGxlLnRleHRDb250ZW50LCB0aGlzLmNvbGxhcHNlZFRpdGxlKTtcblxuXHRcdGlmIChpdGVtPy5hZ2VudE5hbWUpIHtcblx0XHRcdHRoaXMuYWdlbnRMYWJlbC50ZXh0Q29udGVudCA9IGBcXHUyMDE0ICR7aXRlbS5hZ2VudE5hbWV9YDtcblx0XHRcdHRoaXMuYWdlbnRMYWJlbC5kaXNhYmxlZCA9ICFpdGVtLnN1YkFnZW50SW52b2NhdGlvbklkIHx8ICFpdGVtLnJldmVhbFN1YmFnZW50O1xuXHRcdFx0dGhpcy5hZ2VudExhYmVsLnRpdGxlID0gaXRlbS5yZXZlYWxTdWJhZ2VudExhYmVsID8/IGxvY2FsaXplKCdzY3JvbGxUb1N1YmFnZW50JywgXCJTY3JvbGwgdG8gezB9XCIsIGl0ZW0uYWdlbnROYW1lKTtcblx0XHRcdHRoaXMuYWdlbnRMYWJlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLmFnZW50TGFiZWwudGl0bGUpO1xuXHRcdFx0ZG9tLnNob3codGhpcy5hZ2VudExhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hZ2VudExhYmVsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0aGlzLmFnZW50TGFiZWwudGl0bGUgPSAnJztcblx0XHRcdHRoaXMuYWdlbnRMYWJlbC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcblx0XHRcdGRvbS5oaWRlKHRoaXMuYWdlbnRMYWJlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdGVwSW5kaWNhdG9yLnRleHRDb250ZW50ID0gYCR7dGhpcy5hY3RpdmVJbmRleCArIDF9LyR7dGhpcy5pdGVtcy5sZW5ndGh9YDtcblxuXHRcdGNvbnN0IG11bHRpID0gdGhpcy5pdGVtcy5sZW5ndGggPiAxO1xuXHRcdHRoaXMucHJldkJ1dHRvbi5lbmFibGVkID0gbXVsdGk7XG5cdFx0dGhpcy5uZXh0QnV0dG9uLmVuYWJsZWQgPSBtdWx0aTtcblx0XHRkb20uc2V0VmlzaWJpbGl0eShtdWx0aSwgdGhpcy5zdGVwSW5kaWNhdG9yKTtcblx0XHRkb20uc2V0VmlzaWJpbGl0eShtdWx0aSwgdGhpcy5wcmV2QnV0dG9uLmVsZW1lbnQpO1xuXHRcdGRvbS5zZXRWaXNpYmlsaXR5KG11bHRpLCB0aGlzLm5leHRCdXR0b24uZWxlbWVudCk7XG5cdFx0ZG9tLnNldFZpc2liaWxpdHkobXVsdGksIHRoaXMuYWxsb3dBbGxCdXR0b24uZWxlbWVudCk7XG5cdFx0ZG9tLnNldFZpc2liaWxpdHkodGhpcy5jYW5FeHBhbmRDb250ZW50LCB0aGlzLmV4cGFuZENvbnRlbnRCdXR0b24uZWxlbWVudCk7XG5cblx0XHR0aGlzLmFsbG93QWxsQnV0dG9uLmxhYmVsID0gbXVsdGlcblx0XHRcdD8gbG9jYWxpemUoJ2FsbG93QWxsJywgXCJBbGxvdyBBbGxcIilcblx0XHRcdDogbG9jYWxpemUoJ2FsbG93JywgXCJBbGxvd1wiKTtcblx0XHR0aGlzLnVwZGF0ZUV4cGFuZENvbnRlbnRCdXR0b24oKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQWN0aXZlQ29udGVudCgpOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuY29udGVudENvbnRhaW5lcik7XG5cdFx0dGhpcy5hY3RpdmVDb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9pc0NvbnRlbnRFeHBhbmRlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2FuRXhwYW5kQ29udGVudCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbXNbdGhpcy5hY3RpdmVJbmRleF07XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRFeHBhbnNpb25TdGF0ZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghaXRlbS50b29sUGFydCkge1xuXHRcdFx0aXRlbS50b29sUGFydCA9IHRoaXMudG9vbFBhcnRGYWN0b3J5KGl0ZW0udG9vbCk7XG5cdFx0XHRpZiAoaXRlbS5vd25zVG9vbFBhcnQpIHtcblx0XHRcdFx0aXRlbS5kaXNwb3NhYmxlcy5hZGQoaXRlbS50b29sUGFydCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKGl0ZW0udG9vbFBhcnQuZG9tTm9kZSk7XG5cdFx0dGhpcy5hY3RpdmVDb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGVudFJlc2l6ZU9ic2VydmVyLm9ic2VydmUoaXRlbS50b29sUGFydC5kb21Ob2RlKSk7XG5cdFx0dGhpcy5vYnNlcnZlRXhwYW5kYWJsZUNvbnRlbnRFbGVtZW50cyhpdGVtLnRvb2xQYXJ0LmRvbU5vZGUpO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudEV4cGFuc2lvblN0YXRlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUNvbnRlbnRFeHBhbmRlZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2FuRXhwYW5kQ29udGVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzQ29udGVudEV4cGFuZGVkID0gIXRoaXMuX2lzQ29udGVudEV4cGFuZGVkO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudEV4cGFuc2lvblN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbnRlbnRFeHBhbnNpb25TdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNhbkV4cGFuZENvbnRlbnQgPSB0aGlzLml0ZW1zLmxlbmd0aCA+IDAgJiYgdGhpcy5pc0FjdGl2ZUNvbnRlbnRMYXJnZXJUaGFuQ29sbGFwc2VkTGltaXQoKTtcblx0XHRpZiAoIXRoaXMuY2FuRXhwYW5kQ29udGVudCkge1xuXHRcdFx0dGhpcy5faXNDb250ZW50RXhwYW5kZWQgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC10b29sLWNhcm91c2VsLWNvbnRlbnQtZXhwYW5kZWQnLCB0aGlzLmNhbkV4cGFuZENvbnRlbnQgJiYgdGhpcy5faXNDb250ZW50RXhwYW5kZWQpO1xuXHRcdHRoaXMudXBkYXRlTWF4SGVpZ2h0U3R5bGUoKTtcblx0XHRkb20uc2V0VmlzaWJpbGl0eSh0aGlzLmNhbkV4cGFuZENvbnRlbnQsIHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5lbGVtZW50KTtcblx0XHR0aGlzLnVwZGF0ZUV4cGFuZENvbnRlbnRCdXR0b24oKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWF4SGVpZ2h0U3R5bGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWF4SGVpZ2h0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnbWF4LWhlaWdodCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGFuZGVkID0gdGhpcy5jYW5FeHBhbmRDb250ZW50ICYmIHRoaXMuX2lzQ29udGVudEV4cGFuZGVkO1xuXHRcdGNvbnN0IG1heEhlaWdodCA9IGV4cGFuZGVkID8gTWF0aC5tYXgoTUlOX0NBUk9VU0VMX01BWF9IRUlHSFQsIHRoaXMubWF4SGVpZ2h0KSA6IHRoaXMuZ2V0Q29sbGFwc2VkTWF4SGVpZ2h0KCk7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLm1heEhlaWdodCA9IGAke01hdGguZmxvb3IobWF4SGVpZ2h0KX1weGA7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUV4cGFuZENvbnRlbnRCdXR0b24oKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhwYW5kZWQgPSB0aGlzLmNhbkV4cGFuZENvbnRlbnQgJiYgdGhpcy5faXNDb250ZW50RXhwYW5kZWQ7XG5cdFx0Y29uc3QgbGFiZWwgPSBleHBhbmRlZFxuXHRcdFx0PyBsb2NhbGl6ZSgncmVzdG9yZUNvbmZpcm1hdGlvblNpemUnLCBcIlJlc3RvcmUgQ29uZmlybWF0aW9uIFNpemVcIilcblx0XHRcdDogbG9jYWxpemUoJ2V4cGFuZENvbmZpcm1hdGlvblVwJywgXCJFeHBhbmQgQ29uZmlybWF0aW9uIFVwXCIpO1xuXHRcdHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5sYWJlbCA9IGV4cGFuZGVkXG5cdFx0XHQ/IGAkKCR7Q29kaWNvbi5zY3JlZW5Ob3JtYWwuaWR9KWBcblx0XHRcdDogYCQoJHtDb2RpY29uLnNjcmVlbkZ1bGwuaWR9KWA7XG5cdFx0dGhpcy5leHBhbmRDb250ZW50QnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbGFiZWwpO1xuXHRcdHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyhleHBhbmRlZCkpO1xuXHRcdHRoaXMuZXhwYW5kQ29udGVudEJ1dHRvbi5zZXRUaXRsZShsYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIGlzQWN0aXZlQ29udGVudExhcmdlclRoYW5Db2xsYXBzZWRMaW1pdCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3RpdmVDb250ZW50ID0gdGhpcy5jb250ZW50Q29udGFpbmVyLmZpcnN0RWxlbWVudENoaWxkO1xuXHRcdGlmICghZG9tLmlzSFRNTEVsZW1lbnQoYWN0aXZlQ29udGVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5oYXNJbm5lckNvbnRlbnRMYXJnZXJUaGFuQ29sbGFwc2VkTGltaXQoYWN0aXZlQ29udGVudCk7XG5cdH1cblxuXHRwcml2YXRlIGhhc0lubmVyQ29udGVudExhcmdlclRoYW5Db2xsYXBzZWRMaW1pdChlbGVtZW50OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmlzRXhwYW5kYWJsZUNvbnRlbnRFbGVtZW50KGVsZW1lbnQpICYmIHRoaXMuZ2V0RWxlbWVudEhlaWdodChlbGVtZW50KSA+IHRoaXMuZ2V0RXhwYW5kYWJsZUNvbnRlbnRIZWlnaHRMaW1pdChlbGVtZW50KSArIDEpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgZWxlbWVudC5jaGlsZHJlbikge1xuXHRcdFx0aWYgKCFkb20uaXNIVE1MRWxlbWVudChjaGlsZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmhhc0lubmVyQ29udGVudExhcmdlclRoYW5Db2xsYXBzZWRMaW1pdChjaGlsZCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0V4cGFuZGFibGVDb250ZW50RWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbGVtZW50Lm1hdGNoZXMoRVhQQU5EQUJMRV9DT05URU5UX1NFTEVDVE9SKTtcblx0fVxuXG5cdHByaXZhdGUgb2JzZXJ2ZUV4cGFuZGFibGVDb250ZW50RWxlbWVudHMoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0V4cGFuZGFibGVDb250ZW50RWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0dGhpcy5hY3RpdmVDb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGVudFJlc2l6ZU9ic2VydmVyLm9ic2VydmUoZWxlbWVudCkpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgZWxlbWVudC5jaGlsZHJlbikge1xuXHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KGNoaWxkKSkge1xuXHRcdFx0XHR0aGlzLm9ic2VydmVFeHBhbmRhYmxlQ29udGVudEVsZW1lbnRzKGNoaWxkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEVsZW1lbnRIZWlnaHQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiBNYXRoLm1heChlbGVtZW50Lm9mZnNldEhlaWdodCwgZWxlbWVudC5zY3JvbGxIZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHBhbmRhYmxlQ29udGVudEhlaWdodExpbWl0KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogbnVtYmVyIHtcblx0XHRjb25zdCB3aW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSk7XG5cdFx0aWYgKGVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdpbnRlcmFjdGl2ZS1yZXN1bHQtZWRpdG9yJykpIHtcblx0XHRcdHJldHVybiBNYXRoLm1pbihDT0xMQVBTRURfQ09ERV9CTE9DS19NQVhfSEVJR0hULCB3aW5kb3cuaW5uZXJIZWlnaHQgKiAwLjI1KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gTWF0aC5taW4oQ09MTEFQU0VEX01FU1NBR0VfTUFYX0hFSUdIVCwgd2luZG93LmlubmVySGVpZ2h0ICogMC4zKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29sbGFwc2VkTWF4SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgY29uZmlndXJlZE1heEhlaWdodCA9IHRoaXMubWF4SGVpZ2h0ID09PSB1bmRlZmluZWQgPyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkgOiBNYXRoLm1heChNSU5fQ0FST1VTRUxfTUFYX0hFSUdIVCwgdGhpcy5tYXhIZWlnaHQpO1xuXHRcdHJldHVybiBNYXRoLm1pbihjb25maWd1cmVkTWF4SGVpZ2h0LCBDT0xMQVBTRURfQ0FST1VTRUxfTUFYX0hFSUdIVCwgZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLmlubmVySGVpZ2h0ICogMC40NSk7XG5cdH1cblxuXHRhbGxvd0FsbCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgWy4uLnRoaXMuaXRlbXNdKSB7XG5cdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKGl0ZW0udG9vbCwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbiB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNraXBBbGwoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIFsuLi50aGlzLml0ZW1zXSkge1xuXHRcdFx0SUNoYXRUb29sSW52b2NhdGlvbi5jb25maXJtV2l0aChpdGVtLnRvb2wsIHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb29sVGl0bGUoaXRlbTogSUNhcm91c2VsVG9vbEl0ZW0gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgbWVzc2FnZXMgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLmdldENvbmZpcm1hdGlvbk1lc3NhZ2VzKGl0ZW0udG9vbCk7XG5cdFx0aWYgKCFtZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRydW5jYXRlVGl0bGUodGhpcy50b1BsYWluVGV4dChtZXNzYWdlcy50aXRsZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB0cnVuY2F0ZVRpdGxlKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0dGV4dCA9IHRleHQucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcblx0XHRjb25zdCBtYXhMZW5ndGggPSAxMDA7XG5cdFx0cmV0dXJuIHRleHQubGVuZ3RoID4gbWF4TGVuZ3RoID8gYCR7dGV4dC5zdWJzdHJpbmcoMCwgbWF4TGVuZ3RoKX1cXHUyMDI2YCA6IHRleHQ7XG5cdH1cblxuXHRwcml2YXRlIHRvUGxhaW5UZXh0KG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbWFya2Rvd24gPSB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBtZXNzYWdlIDogbWVzc2FnZS52YWx1ZTtcblx0XHRyZXR1cm4gbWFya2Rvd25cblx0XHRcdC5yZXBsYWNlKC9cXFsoW15cXF1dKilcXF1cXCgoW14pXSspXFwpL2csIChfbWF0Y2gsIHRleHQsIHVybCkgPT4gdGV4dCB8fCB0aGlzLmJhc2VuYW1lKHVybCkpXG5cdFx0XHQucmVwbGFjZSgvXFwqXFwqKFteKl0rKVxcKlxcKi9nLCAnJDEnKVxuXHRcdFx0LnJlcGxhY2UoL19fKFteX10rKV9fL2csICckMScpXG5cdFx0XHQucmVwbGFjZSgvYChbXmBdKylgL2csICckMScpXG5cdFx0XHQucmVwbGFjZSgvW1xcXFwqXyM+XS9nLCAnJyk7XG5cdH1cblxuXHRwcml2YXRlIGJhc2VuYW1lKHVybDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGF0aCA9IGRlY29kZVVSSUNvbXBvbmVudCh1cmwuc3BsaXQoJz8nKVswXS5zcGxpdCgnIycpWzBdKTtcblx0XHRcdGNvbnN0IHNlZ21lbnRzID0gcGF0aC5zcGxpdCgnLycpLmZpbHRlcihCb29sZWFuKTtcblx0XHRcdHJldHVybiBzZWdtZW50cy5hdCgtMSkgPz8gdXJsO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVybDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJldmVhbEFjdGl2ZVN1YmFnZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW1zW3RoaXMuYWN0aXZlSW5kZXhdO1xuXHRcdGlmIChpdGVtPy5zdWJBZ2VudEludm9jYXRpb25JZCkge1xuXHRcdFx0aXRlbS5yZXZlYWxTdWJhZ2VudD8uKGl0ZW0uc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdGFjdGl2YXRlRmlyc3RUb29sRm9yU3ViYWdlbnQoc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5pdGVtcy5maW5kSW5kZXgoaSA9PiBpLnN1YkFnZW50SW52b2NhdGlvbklkID09PSBzdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlSW5kZXgoaW5kZXgpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYztBQUN2QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBRXhCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLG1CQUFtQixvQkFBb0I7QUFDN0UsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJB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
