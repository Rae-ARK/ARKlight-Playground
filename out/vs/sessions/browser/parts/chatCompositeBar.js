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
import "./media/chatCompositeBar.css";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { $, addDisposableListener, addStandardDisposableListener, DisposableResizeObserver, EventType, getWindow, reset } from "../../../base/browser/dom.js";
import { ScrollableElement } from "../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../base/common/scrollable.js";
import { autorun } from "../../../base/common/observable.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { Action } from "../../../base/common/actions.js";
import { ActionBar } from "../../../base/browser/ui/actionbar/actionbar.js";
import { InputBox } from "../../../base/browser/ui/inputbox/inputBox.js";
import { defaultInputBoxStyles } from "../../../platform/theme/browser/defaultStyles.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { IContextMenuService, IContextViewService } from "../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { Menus } from "../menus.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { localize } from "../../../nls.js";
import { ChatInteractivity, getChatCapabilities, SessionStatus } from "../../services/sessions/common/session.js";
import { ISessionsManagementService } from "../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../services/sessions/browser/sessionsService.js";
import { ISessionsPartService } from "../../services/sessions/browser/sessionsPartService.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { applySessionBarThemeColors } from "./sessionBarStyles.js";
import { applyDragImage } from "../../../base/browser/ui/dnd/dnd.js";
import { clearChatReferenceDragData, fillChatReferenceDragData } from "../dnd.js";
import { ISessionsProvidersService } from "../../services/sessions/browser/sessionsProvidersService.js";
import { isAgentHostProvider } from "../../common/agentHostSessionsProvider.js";
let ChatCompositeBar = class extends Disposable {
  constructor(_themeService, _sessionsManagementService, _sessionsService, _sessionsPartService, _contextMenuService, _contextViewService, _hoverService, _instantiationService, _sessionsProvidersService) {
    super();
    this._themeService = _themeService;
    this._sessionsManagementService = _sessionsManagementService;
    this._sessionsService = _sessionsService;
    this._sessionsPartService = _sessionsPartService;
    this._contextMenuService = _contextMenuService;
    this._contextViewService = _contextViewService;
    this._hoverService = _hoverService;
    this._instantiationService = _instantiationService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._tabs = [];
    this._tabDisposables = this._register(new DisposableStore());
    this._sessionDisposables = this._register(new MutableDisposable());
    this._editingDisposables = this._register(new MutableDisposable());
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._visible = false;
    this._container = $(".chat-composite-bar.session-chat-tabs-bar");
    this._tabsRow = $(".chat-composite-bar-tabs-row");
    this._container.appendChild(this._tabsRow);
    this._tabsContainer = $(".chat-composite-bar-tabs");
    this._tabsContainer.setAttribute("role", "tablist");
    this._tabsContainer.setAttribute("aria-label", localize("chatTabsAriaLabel", "Chats"));
    this._tabsScrollbar = this._register(new ScrollableElement(this._tabsContainer, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Hidden,
      scrollYToX: true,
      useShadows: false
    }));
    this._tabsRow.appendChild(this._tabsScrollbar.getDomNode());
    const newChatAction = this._newChatAction = this._register(new Action(
      "chatCompositeBar.addChat",
      localize("chatCompositeBar.addChat", "New Chat"),
      ThemeIcon.asClassName(Codicon.add),
      true,
      async () => {
        const session = this._session;
        if (session && !session.isArchived.get()) {
          await this._sessionsService.openNewChatInSession(session);
          this._sessionsPartService.focusSession(session);
        }
      }
    ));
    const newChatActionBar = this._register(new ActionBar(this._tabsRow, { actionViewItemProvider: void 0 }));
    newChatActionBar.push(newChatAction, { icon: true, label: false });
    this._newChatContainer = newChatActionBar.getContainer();
    this._newChatContainer.classList.add("chat-composite-bar-new-chat");
    this._register(addDisposableListener(this._tabsContainer, EventType.SCROLL, () => {
      this._tabsScrollbar.setScrollPosition({ scrollLeft: this._tabsContainer.scrollLeft });
    }));
    this._register(this._tabsScrollbar.onScroll((e) => {
      if (e.scrollLeftChanged) {
        this._tabsContainer.scrollLeft = e.scrollLeft;
      }
    }));
    const resizeObserver = this._register(new DisposableResizeObserver("ChatCompositeBar.activeTabReveal", () => {
      this._updateScrollDimensions();
      this._revealActiveTab();
    }));
    this._register(resizeObserver.observe(this._tabsContainer));
    const heightObserver = this._register(new DisposableResizeObserver("ChatCompositeBar.height", () => {
      this._onDidChangeHeight.fire();
    }));
    this._register(heightObserver.observe(this._container));
    this._setVisible(false);
    this._updateStyles();
    this._register(this._themeService.onDidColorThemeChange(() => this._updateStyles()));
  }
  get element() {
    return this._container;
  }
  get visible() {
    return this._visible;
  }
  get height() {
    return this._visible ? this._container.offsetHeight : 0;
  }
  /**
   * Tells the bar which session is currently relevant. The bar will display the chats
   * of the given session and track its active chat. Pass `undefined` to clear.
   */
  setSession(session) {
    if (this._session === session) {
      return;
    }
    this._session = session;
    const store = new DisposableStore();
    this._sessionDisposables.value = store;
    if (!session) {
      this._rebuildTabs([], "", void 0);
      this._setVisible(false);
      return;
    }
    this._setVisible(false);
    store.add(autorun((reader) => {
      const mainChat = session.mainChat.read(reader);
      const activeChatUri = session.activeChat.read(reader)?.resource.toString() ?? "";
      const mainChatUri = mainChat.resource.toString();
      const tabs = session.visibleChatTabs.read(reader);
      this._rebuildTabs(tabs, activeChatUri, mainChatUri);
      const supportsMultipleChats = session.capabilities.read(reader).supportsMultipleChats;
      this._newChatContainer.classList.toggle("hidden", !supportsMultipleChats);
      this._newChatAction.enabled = supportsMultipleChats && !session.isArchived.read(reader);
      this._setVisible(session.isCreated.read(reader) && session.shouldShowChatTabs.read(reader));
    }));
  }
  _rebuildTabs(chats, activeChatId, mainChatId) {
    this._cancelTabEditing();
    this._tabDisposables.clear();
    this._tabs.length = 0;
    reset(this._tabsContainer);
    for (const chat of chats) {
      this._createTab(chat, chat.resource.toString() === mainChatId);
    }
    this._updateActiveTab(activeChatId);
    this._updateScrollDimensions();
    this._onDidChangeHeight.fire();
  }
  _updateScrollDimensions() {
    this._tabsScrollbar.setScrollDimensions({
      width: this._tabsContainer.clientWidth,
      scrollWidth: this._tabsContainer.scrollWidth
    });
  }
  _createTab(chat, isMainChat) {
    const session = this._session;
    const tab = $(".chat-composite-bar-tab");
    tab.tabIndex = 0;
    tab.setAttribute("role", "tab");
    tab.dataset.chatResource = chat.resource.toString();
    tab.dataset.isMainChat = String(isMainChat);
    const labelEl = $(".chat-composite-bar-tab-label");
    this._tabDisposables.add(autorun((reader) => {
      const title = chat.title.read(reader);
      labelEl.textContent = title;
    }));
    const lockIcon = $(".chat-composite-bar-tab-lock");
    lockIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.lock));
    tab.appendChild(lockIcon);
    this._tabDisposables.add(autorun((reader) => {
      const isReadOnly = chat.interactivity.read(reader) === ChatInteractivity.ReadOnly;
      tab.classList.toggle("read-only", isReadOnly);
      tab.dataset.interactivity = chat.interactivity.read(reader);
    }));
    tab.appendChild(labelEl);
    const inputContainer = $(".chat-composite-bar-tab-input-container");
    tab.appendChild(inputContainer);
    this._tabDisposables.add(this._hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      tab,
      () => chat.title.get()
    ));
    this._tabDisposables.add(autorun((reader) => {
      const status = chat.status.read(reader);
      tab.classList.toggle("untitled", status === SessionStatus.Untitled);
    }));
    const indicator = $(".chat-composite-bar-tab-indicator");
    const indicatorIcon = $(".chat-composite-bar-tab-indicator-icon");
    indicator.appendChild(indicatorIcon);
    this._tabDisposables.add(autorun((reader) => {
      const activeChat = session?.activeChat.read(reader);
      const isActive = activeChat?.resource.toString() === chat.resource.toString();
      const status = chat.status.read(reader);
      const isRead = chat.isRead.read(reader);
      let mode = "none";
      if (status === SessionStatus.NeedsInput) {
        mode = "needs-input";
      } else if (status === SessionStatus.InProgress) {
        mode = "in-progress";
      } else if (!isRead && !isActive) {
        mode = "unread";
      }
      tab.classList.toggle("needs-input", mode === "needs-input");
      tab.classList.toggle("unread", mode === "unread");
      tab.classList.toggle("in-progress", mode === "in-progress");
      indicatorIcon.className = "chat-composite-bar-tab-indicator-icon";
      if (mode === "in-progress") {
        indicatorIcon.classList.add(...ThemeIcon.asClassNameArray(ThemeIcon.modify(Codicon.loading, "spin")));
      }
    }));
    tab.appendChild(indicator);
    if (!isMainChat && session) {
      const actionsContainer = $(".chat-composite-bar-tab-actions");
      tab.appendChild(actionsContainer);
      const tabToolbar = this._tabDisposables.add(this._instantiationService.createInstance(MenuWorkbenchToolBar, actionsContainer, Menus.SessionChatTab, {
        hiddenItemStrategy: HiddenItemStrategy.Ignore,
        menuOptions: { shouldForwardArgs: true },
        toolbarOptions: { primaryGroup: () => true }
      }));
      tabToolbar.context = { session, chat };
    }
    this._tabsContainer.appendChild(tab);
    const chatTab = { chat, element: tab, inputContainer };
    this._tabDisposables.add(addDisposableListener(tab, EventType.CLICK, () => {
      this._cancelTabEditing();
      this._onTabClicked(chat);
    }));
    tab.draggable = true;
    this._tabDisposables.add(addDisposableListener(tab, EventType.DRAG_START, (e) => {
      if (!e.dataTransfer) {
        e.preventDefault();
        return;
      }
      const target = e.target;
      if (target?.closest(".chat-composite-bar-tab-actions")) {
        e.preventDefault();
        return;
      }
      if (this._editingTab) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "copy";
      const backendChatResource = this._backendChatResource(chat);
      if (backendChatResource) {
        fillChatReferenceDragData(e, backendChatResource, chat.resource, chat.title.get());
      }
      applyDragImage(e, tab, chat.title.get());
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.DRAG_END, () => {
      clearChatReferenceDragData();
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._onTabClicked(chat);
      }
    }));
    const renameAction = this._tabDisposables.add(new Action("sessionCompositeBar.renameChat", localize("renameChat", "Rename"), void 0, true, async () => {
      this._startTabEditing(chatTab);
    }));
    const deleteAction = this._tabDisposables.add(new Action("sessionCompositeBar.deleteChat", localize("deleteChat", "Delete Chat"), void 0, true, async () => {
      if (this._session) {
        await this._sessionsManagementService.deleteChat(this._session, chat.resource);
      }
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.DBLCLICK, (e) => {
      if (chat.status.get() === SessionStatus.Untitled || !getChatCapabilities(chat, session, void 0).canRename) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      this._startTabEditing(chatTab);
    }));
    this._tabDisposables.add(addDisposableListener(tab, EventType.CONTEXT_MENU, (e) => {
      if (chat.status.get() === SessionStatus.Untitled) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const event = new StandardMouseEvent(getWindow(tab), e);
      this._contextMenuService.showContextMenu({
        getAnchor: () => event,
        getActions: () => {
          const capabilities = getChatCapabilities(chat, session, void 0);
          const actions = [];
          if (capabilities.canRename) {
            actions.push(renameAction);
          }
          if (capabilities.canDelete) {
            actions.push(deleteAction);
          }
          return actions;
        }
      });
    }));
    this._tabs.push(chatTab);
  }
  _onTabClicked(chat) {
    if (this._session) {
      this._sessionsService.openChat(this._session, chat.resource);
    }
  }
  /**
   * Resolves the opaque backend chat URI for a chat tab so a dragged `#chat:`
   * reference can carry it. Reaches the owning agent-host provider by id and
   * asks it to look up the host-supplied backend resource. Returns `undefined`
   * when the session is not agent-host backed or the provider has no hydrated
   * state for the chat — the caller then offers no chat-reference payload.
   */
  _backendChatResource(chat) {
    const providerId = this._session?.providerId;
    if (!providerId) {
      return void 0;
    }
    const provider = this._sessionsProvidersService.getProvider(providerId);
    return provider && isAgentHostProvider(provider) ? provider.getBackendChatResource(chat.resource) : void 0;
  }
  /**
   * Start an inline rename for the given tab. Enter commits via
   * {@link ISessionsManagementService.renameChat}; Escape or blur cancels.
   */
  _startTabEditing(chatTab) {
    const session = this._session;
    if (!session || this._editingTab) {
      return;
    }
    const { chat, element: tab, inputContainer } = chatTab;
    const initialTitle = chat.title.get();
    this._editingTab = chatTab;
    tab.classList.add("editing");
    const store = new DisposableStore();
    this._editingDisposables.value = store;
    const inputBox = store.add(new InputBox(inputContainer, this._contextViewService, {
      ariaLabel: localize("renameChat.aria", "Rename chat"),
      inputBoxStyles: defaultInputBoxStyles
    }));
    inputBox.element.classList.add("chat-composite-bar-tab-input");
    inputBox.value = initialTitle;
    inputBox.focus();
    inputBox.select();
    let finished = false;
    const finish = (commit) => {
      if (finished) {
        return;
      }
      finished = true;
      const newTitle = inputBox.value.trim();
      this._endTabEditing();
      if (commit && newTitle && newTitle !== initialTitle) {
        this._sessionsManagementService.renameChat(session, chat.resource, newTitle).catch(onUnexpectedError);
      }
    };
    store.add(addStandardDisposableListener(inputBox.inputElement, EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.Enter)) {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      } else if (e.equals(KeyCode.Escape)) {
        e.preventDefault();
        e.stopPropagation();
        finish(false);
      } else {
        e.stopPropagation();
      }
    }));
    store.add(addDisposableListener(inputBox.inputElement, EventType.BLUR, () => finish(false)));
    store.add(addDisposableListener(inputBox.element, EventType.CLICK, (e) => e.stopPropagation()));
    store.add(addDisposableListener(inputBox.element, EventType.DBLCLICK, (e) => e.stopPropagation()));
  }
  _cancelTabEditing() {
    if (!this._editingTab) {
      return;
    }
    this._endTabEditing();
  }
  _endTabEditing() {
    const editingTab = this._editingTab;
    this._editingTab = void 0;
    this._editingDisposables.clear();
    if (editingTab) {
      editingTab.element.classList.remove("editing");
      reset(editingTab.inputContainer);
    }
  }
  _updateActiveTab(activeChatId) {
    for (const tab of this._tabs) {
      const isActive = tab.chat.resource.toString() === activeChatId;
      tab.element.classList.toggle("active", isActive);
      tab.element.setAttribute("aria-selected", String(isActive));
      if (isActive) {
        tab.element.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }
  _revealActiveTab() {
    const activeTab = this._tabs.find((t) => t.element.classList.contains("active"));
    activeTab?.element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  _setVisible(visible) {
    const wasVisible = this._visible;
    this._visible = visible;
    this._container.style.display = this._visible ? "" : "none";
    if (wasVisible !== this._visible) {
      this._onDidChangeVisibility.fire(this._visible);
    }
  }
  _updateStyles() {
    applySessionBarThemeColors(this._container, this._themeService.getColorTheme());
  }
};
ChatCompositeBar = __decorateClass([
  __decorateParam(0, IThemeService),
  __decorateParam(1, ISessionsManagementService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, ISessionsPartService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextViewService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, ISessionsProvidersService)
], ChatCompositeBar);
export {
  ChatCompositeBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvY2hhdENvbXBvc2l0ZUJhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0Q29tcG9zaXRlQmFyLmNzcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIsIERpc3Bvc2FibGVSZXNpemVPYnNlcnZlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uL21lbnVzLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENoYXRJbnRlcmFjdGl2aXR5LCBnZXRDaGF0Q2FwYWJpbGl0aWVzLCBJQ2hhdCwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1BhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1BhcnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IGFwcGx5U2Vzc2lvbkJhclRoZW1lQ29sb3JzIH0gZnJvbSAnLi9zZXNzaW9uQmFyU3R5bGVzLmpzJztcbmltcG9ydCB7IGFwcGx5RHJhZ0ltYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2RuZC9kbmQuanMnO1xuaW1wb3J0IHsgY2xlYXJDaGF0UmVmZXJlbmNlRHJhZ0RhdGEsIGZpbGxDaGF0UmVmZXJlbmNlRHJhZ0RhdGEgfSBmcm9tICcuLi9kbmQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0UHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5cbmludGVyZmFjZSBJQ2hhdFRhYiB7XG5cdHJlYWRvbmx5IGNoYXQ6IElDaGF0O1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaW5wdXRDb250YWluZXI6IEhUTUxFbGVtZW50O1xufVxuXG4vKipcbiAqIEEgY29tcG9zaXRlIGJhciB0aGF0IGRpc3BsYXlzIHRoZSBjaGF0cyB3aXRoaW4gYW4gYWdlbnQgc2Vzc2lvbiBhcyB0YWJzLlxuICogU2VsZWN0aW5nIGEgdGFiIGxvYWRzIHRoYXQgY2hhdCBpbiB0aGUgY2hhdCB2aWV3IHBhbmUgaW5zdGVhZCBvZiBzd2l0Y2hpbmcgdmlldyBjb250YWluZXJzLlxuICpcbiAqIFRoZSBiYXIgaXMgc2hvd24gb25seSB3aGVuIHRoZSBzZXNzaW9uIGhhcyBtdWx0aXBsZSBjaGF0czsgYSBzaW5nbGUgY2hhdCBpcyBhbHJlYWR5XG4gKiByZXByZXNlbnRlZCBieSB0aGUge0BsaW5rIFNlc3Npb25IZWFkZXJ9IHRpdGxlLlxuICpcbiAqIFRoZSBob3N0aW5nIHZpZXcgdGVsbHMgdGhlIGJhciB3aGljaCBzZXNzaW9uIGlzIHJlbGV2YW50IHZpYSB7QGxpbmsgc2V0U2Vzc2lvbn0uXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0Q29tcG9zaXRlQmFyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFic1JvdzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RhYnNDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YWJzU2Nyb2xsYmFyOiBTY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFiczogSUNoYXRUYWJbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YWJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRpbmdEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIF9lZGl0aW5nVGFiOiBJQ2hhdFRhYiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25ld0NoYXRBY3Rpb246IEFjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfbmV3Q2hhdENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdmlzaWJsZSA9IGZhbHNlO1xuXG5cdGdldCBlbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGU7XG5cdH1cblxuXHRnZXQgaGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGUgPyB0aGlzLl9jb250YWluZXIub2Zmc2V0SGVpZ2h0IDogMDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQYXJ0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1BhcnRTZXJ2aWNlOiBJU2Vzc2lvbnNQYXJ0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci5zZXNzaW9uLWNoYXQtdGFicy1iYXInKTtcblxuXHRcdC8vIFRhYnMgcm93IFx1MjAxNCBvbmx5IHNob3duIHdoZW4gdGhlIHNlc3Npb24gaGFzIG11bHRpcGxlIGNoYXRzLlxuXHRcdHRoaXMuX3RhYnNSb3cgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYnMtcm93Jyk7XG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3RhYnNSb3cpO1xuXG5cdFx0dGhpcy5fdGFic0NvbnRhaW5lciA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFicycpO1xuXHRcdHRoaXMuX3RhYnNDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3RhYmxpc3QnKTtcblx0XHR0aGlzLl90YWJzQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjaGF0VGFic0FyaWFMYWJlbCcsIFwiQ2hhdHNcIikpO1xuXHRcdHRoaXMuX3RhYnNTY3JvbGxiYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5fdGFic0NvbnRhaW5lciwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRzY3JvbGxZVG9YOiB0cnVlLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3RhYnNSb3cuYXBwZW5kQ2hpbGQodGhpcy5fdGFic1Njcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXG5cdFx0Ly8gXCJOZXcgQ2hhdFwiIGJ1dHRvbiBwaW5uZWQgYXQgdGhlIGVuZCBvZiB0aGUgdGFiIHN0cmlwLiBTdGFydGluZyBhIG5ldyBjaGF0XG5cdFx0Ly8gaXMgb2ZmZXJlZCBoZXJlIHdoaWxlIHRoZSB0YWJzIGFyZSBzaG93bjsgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgYSBzaW5nbGVcblx0XHQvLyBjaGF0IHRoZSBzZXNzaW9uIGhlYWRlciB0b29sYmFyIG9mZmVycyBpdCBpbnN0ZWFkLlxuXHRcdGNvbnN0IG5ld0NoYXRBY3Rpb24gPSB0aGlzLl9uZXdDaGF0QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihcblx0XHRcdCdjaGF0Q29tcG9zaXRlQmFyLmFkZENoYXQnLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXRDb21wb3NpdGVCYXIuYWRkQ2hhdCcsIFwiTmV3IENoYXRcIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5hZGQpLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb247XG5cdFx0XHRcdGlmIChzZXNzaW9uICYmICFzZXNzaW9uLmlzQXJjaGl2ZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uc1NlcnZpY2Uub3Blbk5ld0NoYXRJblNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbnNQYXJ0U2VydmljZS5mb2N1c1Nlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0KSk7XG5cdFx0Y29uc3QgbmV3Q2hhdEFjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIodGhpcy5fdGFic1JvdywgeyBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiB1bmRlZmluZWQgfSkpO1xuXHRcdG5ld0NoYXRBY3Rpb25CYXIucHVzaChuZXdDaGF0QWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR0aGlzLl9uZXdDaGF0Q29udGFpbmVyID0gbmV3Q2hhdEFjdGlvbkJhci5nZXRDb250YWluZXIoKTtcblx0XHR0aGlzLl9uZXdDaGF0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtY29tcG9zaXRlLWJhci1uZXctY2hhdCcpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgdmlzdWFsIHNjcm9sbGJhciBpbiBzeW5jIHdpdGggbmF0aXZlIHNjcm9sbGluZyBpbnNpZGUgdGhlIHRhYnMgY29udGFpbmVyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RhYnNDb250YWluZXIsIEV2ZW50VHlwZS5TQ1JPTEwsICgpID0+IHtcblx0XHRcdHRoaXMuX3RhYnNTY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxMZWZ0OiB0aGlzLl90YWJzQ29udGFpbmVyLnNjcm9sbExlZnQgfSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRm9yd2FyZCBzY3JvbGxiYXIgY2hhbmdlcyAoZS5nLiBmcm9tIG1vdXNlIHdoZWVsKSBiYWNrIHRvIHRoZSBuYXRpdmUgc2Nyb2xsIHBvc2l0aW9uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGFic1Njcm9sbGJhci5vblNjcm9sbChlID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbExlZnRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX3RhYnNDb250YWluZXIuc2Nyb2xsTGVmdCA9IGUuc2Nyb2xsTGVmdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTY3JvbGwgYWN0aXZlIHRhYiBpbnRvIHZpZXcgKyB1cGRhdGUgc2Nyb2xsIGRpbWVuc2lvbnMgb24gcmVzaXplXG5cdFx0Y29uc3QgcmVzaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0Q29tcG9zaXRlQmFyLmFjdGl2ZVRhYlJldmVhbCcsICgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNjcm9sbERpbWVuc2lvbnMoKTtcblx0XHRcdHRoaXMuX3JldmVhbEFjdGl2ZVRhYigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXNpemVPYnNlcnZlci5vYnNlcnZlKHRoaXMuX3RhYnNDb250YWluZXIpKTtcblxuXHRcdC8vIFJlcG9ydCBoZWlnaHQgY2hhbmdlcyBzbyB0aGUgaG9zdCBjYW4gcmUtbGF5b3V0XG5cdFx0Y29uc3QgaGVpZ2h0T2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdDaGF0Q29tcG9zaXRlQmFyLmhlaWdodCcsICgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaGVpZ2h0T2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLl9jb250YWluZXIpKTtcblxuXHRcdHRoaXMuX3NldFZpc2libGUoZmFsc2UpO1xuXHRcdHRoaXMuX3VwZGF0ZVN0eWxlcygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlU3R5bGVzKCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZWxscyB0aGUgYmFyIHdoaWNoIHNlc3Npb24gaXMgY3VycmVudGx5IHJlbGV2YW50LiBUaGUgYmFyIHdpbGwgZGlzcGxheSB0aGUgY2hhdHNcblx0ICogb2YgdGhlIGdpdmVuIHNlc3Npb24gYW5kIHRyYWNrIGl0cyBhY3RpdmUgY2hhdC4gUGFzcyBgdW5kZWZpbmVkYCB0byBjbGVhci5cblx0ICovXG5cdHNldFNlc3Npb24oc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbiA9PT0gc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uID0gc2Vzc2lvbjtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9yZWJ1aWxkVGFicyhbXSwgJycsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBWaXNpYmlsaXR5IChhbmQgdGhlIHRyYWlsaW5nIFwiTmV3IENoYXRcIikgZm9sbG93IHNlc3Npb24uc2hvdWxkU2hvd0NoYXRUYWJzLCBvbmNlIGNyZWF0ZWQuXG5cdFx0dGhpcy5fc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1haW5DaGF0ID0gc2Vzc2lvbi5tYWluQ2hhdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBhY3RpdmVDaGF0VXJpID0gc2Vzc2lvbi5hY3RpdmVDaGF0LnJlYWQocmVhZGVyKT8ucmVzb3VyY2UudG9TdHJpbmcoKSA/PyAnJztcblx0XHRcdGNvbnN0IG1haW5DaGF0VXJpID0gbWFpbkNoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHRhYnMgPSBzZXNzaW9uLnZpc2libGVDaGF0VGFicy5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9yZWJ1aWxkVGFicyh0YWJzLCBhY3RpdmVDaGF0VXJpLCBtYWluQ2hhdFVyaSk7XG5cblx0XHRcdC8vIFRoZSB0cmFpbGluZyBcIk5ldyBDaGF0XCIgYWN0aW9uIG9ubHkgYXBwbGllcyB0byBzZXNzaW9ucyB0aGF0IHN1cHBvcnRcblx0XHRcdC8vIHVzZXItY3JlYXRlZCBwZWVyIGNoYXRzLiBTdWJhZ2VudCAocmVhZC1vbmx5KSB0YWJzIGNhbiBzdXJmYWNlIGluXG5cdFx0XHQvLyBzZXNzaW9ucyB3aXRob3V0IHRoYXQgY2FwYWJpbGl0eSwgc28gZ2F0ZSB0aGUgYWN0aW9uIG9uIHRoZVxuXHRcdFx0Ly8gY2FwYWJpbGl0eSByYXRoZXIgdGhhbiBvbiB0YWItc3RyaXAgdmlzaWJpbGl0eS5cblx0XHRcdGNvbnN0IHN1cHBvcnRzTXVsdGlwbGVDaGF0cyA9IHNlc3Npb24uY2FwYWJpbGl0aWVzLnJlYWQocmVhZGVyKS5zdXBwb3J0c011bHRpcGxlQ2hhdHM7XG5cdFx0XHR0aGlzLl9uZXdDaGF0Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICFzdXBwb3J0c011bHRpcGxlQ2hhdHMpO1xuXHRcdFx0Ly8gQXJjaGl2ZWQgc2Vzc2lvbnMgYXJlIHJlYWQtb25seSwgc28gZGlzYWJsZSB0aGUgdHJhaWxpbmcgTmV3IENoYXRcblx0XHRcdC8vIGFjdGlvbiAobWlycm9ycyB0aGUgaGVhZGVyIGFjdGlvbidzIFNlc3Npb25Jc0FyY2hpdmVkQ29udGV4dCBnYXRpbmcpLlxuXHRcdFx0dGhpcy5fbmV3Q2hhdEFjdGlvbi5lbmFibGVkID0gc3VwcG9ydHNNdWx0aXBsZUNoYXRzICYmICFzZXNzaW9uLmlzQXJjaGl2ZWQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHR0aGlzLl9zZXRWaXNpYmxlKHNlc3Npb24uaXNDcmVhdGVkLnJlYWQocmVhZGVyKSAmJiBzZXNzaW9uLnNob3VsZFNob3dDaGF0VGFicy5yZWFkKHJlYWRlcikpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYnVpbGRUYWJzKGNoYXRzOiByZWFkb25seSBJQ2hhdFtdLCBhY3RpdmVDaGF0SWQ6IHN0cmluZywgbWFpbkNoYXRJZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFRhYkVkaXRpbmcoKTtcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX3RhYnMubGVuZ3RoID0gMDtcblx0XHRyZXNldCh0aGlzLl90YWJzQ29udGFpbmVyKTtcblxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0dGhpcy5fY3JlYXRlVGFiKGNoYXQsIGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gbWFpbkNoYXRJZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlQWN0aXZlVGFiKGFjdGl2ZUNoYXRJZCk7XG5cdFx0dGhpcy5fdXBkYXRlU2Nyb2xsRGltZW5zaW9ucygpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2Nyb2xsRGltZW5zaW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl90YWJzU2Nyb2xsYmFyLnNldFNjcm9sbERpbWVuc2lvbnMoe1xuXHRcdFx0d2lkdGg6IHRoaXMuX3RhYnNDb250YWluZXIuY2xpZW50V2lkdGgsXG5cdFx0XHRzY3JvbGxXaWR0aDogdGhpcy5fdGFic0NvbnRhaW5lci5zY3JvbGxXaWR0aCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRhYihjaGF0OiBJQ2hhdCwgaXNNYWluQ2hhdDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uO1xuXHRcdGNvbnN0IHRhYiA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiJyk7XG5cdFx0dGFiLnRhYkluZGV4ID0gMDtcblx0XHR0YWIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3RhYicpO1xuXHRcdC8vIEV4cG9zZSB0aGUgYm91bmQgY2hhdCByZXNvdXJjZSBmb3IgZGlhZ25vc3RpY3MgLyB0ZXN0IGF1dG9tYXRpb24uXG5cdFx0dGFiLmRhdGFzZXQuY2hhdFJlc291cmNlID0gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdHRhYi5kYXRhc2V0LmlzTWFpbkNoYXQgPSBTdHJpbmcoaXNNYWluQ2hhdCk7XG5cblx0XHRjb25zdCBsYWJlbEVsID0gJCgnLmNoYXQtY29tcG9zaXRlLWJhci10YWItbGFiZWwnKTtcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBjaGF0LnRpdGxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSB0aXRsZTtcblx0XHR9KSk7XG5cblx0XHQvLyBMb2NrIGljb24gc2hvd24gZm9yIHJlYWQtb25seSAobm9uLWludGVyYWN0aXZlKSBjaGF0cy5cblx0XHRjb25zdCBsb2NrSWNvbiA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWxvY2snKTtcblx0XHRsb2NrSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubG9jaykpO1xuXHRcdHRhYi5hcHBlbmRDaGlsZChsb2NrSWNvbik7XG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzUmVhZE9ubHkgPSBjaGF0LmludGVyYWN0aXZpdHkucmVhZChyZWFkZXIpID09PSBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seTtcblx0XHRcdHRhYi5jbGFzc0xpc3QudG9nZ2xlKCdyZWFkLW9ubHknLCBpc1JlYWRPbmx5KTtcblx0XHRcdHRhYi5kYXRhc2V0LmludGVyYWN0aXZpdHkgPSBjaGF0LmludGVyYWN0aXZpdHkucmVhZChyZWFkZXIpO1xuXHRcdH0pKTtcblxuXHRcdHRhYi5hcHBlbmRDaGlsZChsYWJlbEVsKTtcblxuXHRcdC8vIEVtcHR5IHJlbmFtZSBob3N0OyBhbiBJbnB1dEJveCBpcyBjcmVhdGVkIGluc2lkZSBpdCBvbmx5IHdoaWxlIGVkaXRpbmcuXG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYi1pbnB1dC1jb250YWluZXInKTtcblx0XHR0YWIuYXBwZW5kQ2hpbGQoaW5wdXRDb250YWluZXIpO1xuXG5cdFx0Ly8gRGVsYXllZCBob3ZlciBzaG93aW5nIHRoZSBmdWxsIGNoYXQgdGl0bGUgKHVzZWZ1bCB3aGVuIHRoZSB0aXRsZSBpcyB0cnVuY2F0ZWQpXG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksXG5cdFx0XHR0YWIsXG5cdFx0XHQoKSA9PiBjaGF0LnRpdGxlLmdldCgpLFxuXHRcdCkpO1xuXG5cdFx0Ly8gVHJhY2sgdW50aXRsZWQgc3RhdGUgZm9yIHN0eWxpbmcgKGRpcnR5IGRvdCArIGNsb3NlIGJ1dHRvbilcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gY2hhdC5zdGF0dXMucmVhZChyZWFkZXIpO1xuXHRcdFx0dGFiLmNsYXNzTGlzdC50b2dnbGUoJ3VudGl0bGVkJywgc3RhdHVzID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayB1bnJlYWQgLyBuZWVkcy1pbnB1dCAvIGluLXByb2dyZXNzIHN0YXRlIGZvciB0aGUgaW5kaWNhdG9yLlxuXHRcdC8vIFByZWNlZGVuY2U6IG5lZWRzLWlucHV0ICh1bnJlYWQpID4gaW4tcHJvZ3Jlc3MgKHNwaW5uZXIpID4gdW5yZWFkIHdoZW4gbm90IGFjdGl2ZS5cblx0XHQvLyBBdCBtb3N0IG9uZSBpbmRpY2F0b3IgaXMgc2hvd24gYXQgYSB0aW1lLlxuXHRcdGNvbnN0IGluZGljYXRvciA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWluZGljYXRvcicpO1xuXHRcdGNvbnN0IGluZGljYXRvckljb24gPSAkKCcuY2hhdC1jb21wb3NpdGUtYmFyLXRhYi1pbmRpY2F0b3ItaWNvbicpO1xuXHRcdGluZGljYXRvci5hcHBlbmRDaGlsZChpbmRpY2F0b3JJY29uKTtcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlQ2hhdCA9IHNlc3Npb24/LmFjdGl2ZUNoYXQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSBhY3RpdmVDaGF0Py5yZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSBjaGF0LnN0YXR1cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc1JlYWQgPSBjaGF0LmlzUmVhZC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGxldCBtb2RlOiAnbmVlZHMtaW5wdXQnIHwgJ3VucmVhZCcgfCAnaW4tcHJvZ3Jlc3MnIHwgJ25vbmUnID0gJ25vbmUnO1xuXHRcdFx0aWYgKHN0YXR1cyA9PT0gU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0KSB7XG5cdFx0XHRcdG1vZGUgPSAnbmVlZHMtaW5wdXQnO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0dXMgPT09IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcykge1xuXHRcdFx0XHRtb2RlID0gJ2luLXByb2dyZXNzJztcblx0XHRcdH0gZWxzZSBpZiAoIWlzUmVhZCAmJiAhaXNBY3RpdmUpIHtcblx0XHRcdFx0bW9kZSA9ICd1bnJlYWQnO1xuXHRcdFx0fVxuXG5cdFx0XHR0YWIuY2xhc3NMaXN0LnRvZ2dsZSgnbmVlZHMtaW5wdXQnLCBtb2RlID09PSAnbmVlZHMtaW5wdXQnKTtcblx0XHRcdHRhYi5jbGFzc0xpc3QudG9nZ2xlKCd1bnJlYWQnLCBtb2RlID09PSAndW5yZWFkJyk7XG5cdFx0XHR0YWIuY2xhc3NMaXN0LnRvZ2dsZSgnaW4tcHJvZ3Jlc3MnLCBtb2RlID09PSAnaW4tcHJvZ3Jlc3MnKTtcblxuXHRcdFx0aW5kaWNhdG9ySWNvbi5jbGFzc05hbWUgPSAnY2hhdC1jb21wb3NpdGUtYmFyLXRhYi1pbmRpY2F0b3ItaWNvbic7XG5cdFx0XHRpZiAobW9kZSA9PT0gJ2luLXByb2dyZXNzJykge1xuXHRcdFx0XHRpbmRpY2F0b3JJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmcsICdzcGluJykpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0YWIuYXBwZW5kQ2hpbGQoaW5kaWNhdG9yKTtcblxuXHRcdC8vIENsb3NlIGJ1dHRvbiBcdTIwMTQgY29udHJpYnV0ZWQgdmlhIE1lbnVzLlNlc3Npb25DaGF0VGFiICh0aGUgY2hhdCB0YWIgbWVudSkuXG5cdFx0Ly8gT25seSBub24tbWFpbiBjaGF0cyBjYW4gYmUgY2xvc2VkOyB0aGUgbWFpbiBjaGF0IGxpdmVzIGFuZCBkaWVzIHdpdGggaXRzXG5cdFx0Ly8gc2Vzc2lvbiwgc28gaXRzIHRhYiByZW5kZXJzIG5vIGFjdGlvbnMgdG9vbGJhci4gVGhlIHRhYidzIGNoYXQgKGFuZCBpdHNcblx0XHQvLyBzZXNzaW9uKSBpcyBmb3J3YXJkZWQgYXMgdGhlIGFjdGlvbiBhcmd1bWVudC5cblx0XHRpZiAoIWlzTWFpbkNoYXQgJiYgc2Vzc2lvbikge1xuXHRcdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9ICQoJy5jaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWFjdGlvbnMnKTtcblx0XHRcdHRhYi5hcHBlbmRDaGlsZChhY3Rpb25zQ29udGFpbmVyKTtcblx0XHRcdGNvbnN0IHRhYlRvb2xiYXIgPSB0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGFjdGlvbnNDb250YWluZXIsIE1lbnVzLlNlc3Npb25DaGF0VGFiLCB7XG5cdFx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSxcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlIH0sXG5cdFx0XHR9KSk7XG5cdFx0XHR0YWJUb29sYmFyLmNvbnRleHQgPSB7IHNlc3Npb24sIGNoYXQgfTtcblx0XHR9XG5cblx0XHR0aGlzLl90YWJzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRhYik7XG5cblx0XHRjb25zdCBjaGF0VGFiOiBJQ2hhdFRhYiA9IHsgY2hhdCwgZWxlbWVudDogdGFiLCBpbnB1dENvbnRhaW5lciB9O1xuXG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4ge1xuXHRcdFx0Ly8gQ2FuY2VsIGFueSBpbi1wcm9ncmVzcyByZW5hbWUgYmVmb3JlIHN3aXRjaGluZyB0byB0aGUgY2xpY2tlZCB0YWIuXG5cdFx0XHR0aGlzLl9jYW5jZWxUYWJFZGl0aW5nKCk7XG5cdFx0XHR0aGlzLl9vblRhYkNsaWNrZWQoY2hhdCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTWFrZSB0aGUgdGFiIGEgZHJhZyBzb3VyY2UgdGhhdCBvZmZlcnMgYSBjaGF0IHJlZmVyZW5jZSwgc28gaXQgY2FuIGJlXG5cdFx0Ly8gZHJvcHBlZCBpbnRvIGFuIGFnZW50LWhvc3QgY2hhdCBpbnB1dCB0byBpbnNlcnQgYW4gaW5saW5lIGAjY2hhdDpgIHJlZi5cblx0XHR0YWIuZHJhZ2dhYmxlID0gdHJ1ZTtcblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLkRSQUdfU1RBUlQsIChlOiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdGlmICghZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIERvbid0IHN0YXJ0IGEgZHJhZyBmcm9tIHRoZSB0YWIncyBhY3Rpb25zIHRvb2xiYXIgKGUuZy4gY2xvc2UpLCBhXG5cdFx0XHQvLyBzbWFsbCBwb2ludGVyIG1vdmUgZHVyaW5nIGEgYnV0dG9uIGNsaWNrIHdvdWxkIG90aGVyd2lzZSBzd2FsbG93IGl0LlxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0aWYgKHRhcmdldD8uY2xvc2VzdCgnLmNoYXQtY29tcG9zaXRlLWJhci10YWItYWN0aW9ucycpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEb24ndCBzdGFydCBhIGRyYWcgd2hpbGUgYW55IHRhYiByZW5hbWUgaXMgaW4gcHJvZ3Jlc3MuXG5cdFx0XHRpZiAodGhpcy5fZWRpdGluZ1RhYikge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZS5kYXRhVHJhbnNmZXIuZWZmZWN0QWxsb3dlZCA9ICdjb3B5Jztcblx0XHRcdC8vIFRoZSByZWZlcmVuY2UgZW50cnkgbXVzdCBjYXJyeSB0aGUgb3BhcXVlIGJhY2tlbmQgY2hhdCBVUkksIHdoaWNoIG9ubHlcblx0XHRcdC8vIHRoZSBvd25pbmcgYWdlbnQtaG9zdCBwcm92aWRlciBrbm93cy4gTG9vayBpdCB1cDsgd2hlbiBpdCBpc1xuXHRcdFx0Ly8gdW5hdmFpbGFibGUgKG5vdCBhZ2VudC1ob3N0IGJhY2tlZCwgb3Igc3RhdGUgbm90IHlldCBoeWRyYXRlZCkgb2ZmZXJcblx0XHRcdC8vIG5vIGNoYXQtcmVmZXJlbmNlIHBheWxvYWQgXHUyMDE0IHRoZSBkcmFnIHNpbXBseSBjYXJyaWVzIG5vIHJlZmVyZW5jZS5cblx0XHRcdGNvbnN0IGJhY2tlbmRDaGF0UmVzb3VyY2UgPSB0aGlzLl9iYWNrZW5kQ2hhdFJlc291cmNlKGNoYXQpO1xuXHRcdFx0aWYgKGJhY2tlbmRDaGF0UmVzb3VyY2UpIHtcblx0XHRcdFx0ZmlsbENoYXRSZWZlcmVuY2VEcmFnRGF0YShlLCBiYWNrZW5kQ2hhdFJlc291cmNlLCBjaGF0LnJlc291cmNlLCBjaGF0LnRpdGxlLmdldCgpKTtcblx0XHRcdH1cblx0XHRcdGFwcGx5RHJhZ0ltYWdlKGUsIHRhYiwgY2hhdC50aXRsZS5nZXQoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5EUkFHX0VORCwgKCkgPT4ge1xuXHRcdFx0Ly8gRHJvcCB0aGUgaW4tcHJvY2VzcyBjaGF0LXJlZmVyZW5jZSB0cmFuc2ZlciBzbyBpdCBjYW4ndCBsZWFrIGludG8gYVxuXHRcdFx0Ly8gbGF0ZXIsIHVucmVsYXRlZCBkcmFnLlxuXHRcdFx0Y2xlYXJDaGF0UmVmZXJlbmNlRHJhZ0RhdGEoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLl9vblRhYkNsaWNrZWQoY2hhdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcmVuYW1lQWN0aW9uID0gdGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKG5ldyBBY3Rpb24oJ3Nlc3Npb25Db21wb3NpdGVCYXIucmVuYW1lQ2hhdCcsIGxvY2FsaXplKCdyZW5hbWVDaGF0JywgXCJSZW5hbWVcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhcnRUYWJFZGl0aW5nKGNoYXRUYWIpO1xuXHRcdH0pKTtcblxuXHRcdC8vIERlbGV0ZSBwZXJtYW5lbnRseSByZW1vdmVzIHRoZSBjaGF0IChkZXN0cnVjdGl2ZSkuIE9ubHkgbm9uLW1haW4gY2hhdHNcblx0XHQvLyBjYW4gYmUgZGVsZXRlZDsgdGhlIG1haW4gY2hhdCBsaXZlcyBhbmQgZGllcyB3aXRoIGl0cyBzZXNzaW9uLlxuXHRcdGNvbnN0IGRlbGV0ZUFjdGlvbiA9IHRoaXMuX3RhYkRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKCdzZXNzaW9uQ29tcG9zaXRlQmFyLmRlbGV0ZUNoYXQnLCBsb2NhbGl6ZSgnZGVsZXRlQ2hhdCcsIFwiRGVsZXRlIENoYXRcIiksIHVuZGVmaW5lZCwgdHJ1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Nlc3Npb24pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5kZWxldGVDaGF0KHRoaXMuX3Nlc3Npb24sIGNoYXQucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIERvdWJsZS1jbGljayB0aGUgdGFiIHRvIHN0YXJ0IGFuIGlubGluZSByZW5hbWUsIG1pcnJvcmluZyB0aGUgc2Vzc2lvbiB0aXRsZS5cblx0XHR0aGlzLl90YWJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLkRCTENMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGNoYXQuc3RhdHVzLmdldCgpID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkIHx8ICFnZXRDaGF0Q2FwYWJpbGl0aWVzKGNoYXQsIHNlc3Npb24sIHVuZGVmaW5lZCkuY2FuUmVuYW1lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9zdGFydFRhYkVkaXRpbmcoY2hhdFRhYik7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdGFiRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHQvLyBObyBjb250ZXh0IG1lbnUgZm9yIHVudGl0bGVkIGNoYXRzXG5cdFx0XHRpZiAoY2hhdC5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIHtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyh0YWIpLCBlKTtcblx0XHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY2FwYWJpbGl0aWVzID0gZ2V0Q2hhdENhcGFiaWxpdGllcyhjaGF0LCBzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbXTtcblx0XHRcdFx0XHRpZiAoY2FwYWJpbGl0aWVzLmNhblJlbmFtZSkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHJlbmFtZUFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjYXBhYmlsaXRpZXMuY2FuRGVsZXRlKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2goZGVsZXRlQWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGlvbnM7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3RhYnMucHVzaChjaGF0VGFiKTtcblx0fVxuXG5cdHByaXZhdGUgX29uVGFiQ2xpY2tlZChjaGF0OiBJQ2hhdCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uc1NlcnZpY2Uub3BlbkNoYXQodGhpcy5fc2Vzc2lvbiwgY2hhdC5yZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBvcGFxdWUgYmFja2VuZCBjaGF0IFVSSSBmb3IgYSBjaGF0IHRhYiBzbyBhIGRyYWdnZWQgYCNjaGF0OmBcblx0ICogcmVmZXJlbmNlIGNhbiBjYXJyeSBpdC4gUmVhY2hlcyB0aGUgb3duaW5nIGFnZW50LWhvc3QgcHJvdmlkZXIgYnkgaWQgYW5kXG5cdCAqIGFza3MgaXQgdG8gbG9vayB1cCB0aGUgaG9zdC1zdXBwbGllZCBiYWNrZW5kIHJlc291cmNlLiBSZXR1cm5zIGB1bmRlZmluZWRgXG5cdCAqIHdoZW4gdGhlIHNlc3Npb24gaXMgbm90IGFnZW50LWhvc3QgYmFja2VkIG9yIHRoZSBwcm92aWRlciBoYXMgbm8gaHlkcmF0ZWRcblx0ICogc3RhdGUgZm9yIHRoZSBjaGF0IFx1MjAxNCB0aGUgY2FsbGVyIHRoZW4gb2ZmZXJzIG5vIGNoYXQtcmVmZXJlbmNlIHBheWxvYWQuXG5cdCAqL1xuXHRwcml2YXRlIF9iYWNrZW5kQ2hhdFJlc291cmNlKGNoYXQ6IElDaGF0KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gdGhpcy5fc2Vzc2lvbj8ucHJvdmlkZXJJZDtcblx0XHRpZiAoIXByb3ZpZGVySWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyKHByb3ZpZGVySWQpO1xuXHRcdHJldHVybiBwcm92aWRlciAmJiBpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSA/IHByb3ZpZGVyLmdldEJhY2tlbmRDaGF0UmVzb3VyY2UoY2hhdC5yZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogU3RhcnQgYW4gaW5saW5lIHJlbmFtZSBmb3IgdGhlIGdpdmVuIHRhYi4gRW50ZXIgY29tbWl0cyB2aWFcblx0ICoge0BsaW5rIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnJlbmFtZUNoYXR9OyBFc2NhcGUgb3IgYmx1ciBjYW5jZWxzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRUYWJFZGl0aW5nKGNoYXRUYWI6IElDaGF0VGFiKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb247XG5cdFx0aWYgKCFzZXNzaW9uIHx8IHRoaXMuX2VkaXRpbmdUYWIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGNoYXQsIGVsZW1lbnQ6IHRhYiwgaW5wdXRDb250YWluZXIgfSA9IGNoYXRUYWI7XG5cdFx0Y29uc3QgaW5pdGlhbFRpdGxlID0gY2hhdC50aXRsZS5nZXQoKTtcblxuXHRcdHRoaXMuX2VkaXRpbmdUYWIgPSBjaGF0VGFiO1xuXHRcdHRhYi5jbGFzc0xpc3QuYWRkKCdlZGl0aW5nJyk7XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9lZGl0aW5nRGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblxuXHRcdGNvbnN0IGlucHV0Qm94ID0gc3RvcmUuYWRkKG5ldyBJbnB1dEJveChpbnB1dENvbnRhaW5lciwgdGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdyZW5hbWVDaGF0LmFyaWEnLCBcIlJlbmFtZSBjaGF0XCIpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHR9KSk7XG5cdFx0aW5wdXRCb3guZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LWNvbXBvc2l0ZS1iYXItdGFiLWlucHV0Jyk7XG5cdFx0aW5wdXRCb3gudmFsdWUgPSBpbml0aWFsVGl0bGU7XG5cdFx0aW5wdXRCb3guZm9jdXMoKTtcblx0XHRpbnB1dEJveC5zZWxlY3QoKTtcblxuXHRcdGxldCBmaW5pc2hlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpbmlzaCA9IChjb21taXQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmIChmaW5pc2hlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmaW5pc2hlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBuZXdUaXRsZSA9IGlucHV0Qm94LnZhbHVlLnRyaW0oKTtcblx0XHRcdHRoaXMuX2VuZFRhYkVkaXRpbmcoKTtcblx0XHRcdGlmIChjb21taXQgJiYgbmV3VGl0bGUgJiYgbmV3VGl0bGUgIT09IGluaXRpYWxUaXRsZSkge1xuXHRcdFx0XHR0aGlzLl9zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlXG5cdFx0XHRcdFx0LnJlbmFtZUNoYXQoc2Vzc2lvbiwgY2hhdC5yZXNvdXJjZSwgbmV3VGl0bGUpXG5cdFx0XHRcdFx0LmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKGFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogSUtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGZpbmlzaCh0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZmluaXNoKGZhbHNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIERvbid0IGxldCB0eXBpbmcgbGVhayBvdXQgdG8gd29ya2JlbmNoIHNob3J0Y3V0cyAoZS5nLiBTcGFjZSkuXG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsIEV2ZW50VHlwZS5CTFVSLCAoKSA9PiBmaW5pc2goZmFsc2UpKSk7XG5cblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgZSA9PiBlLnN0b3BQcm9wYWdhdGlvbigpKSk7XG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5lbGVtZW50LCBFdmVudFR5cGUuREJMQ0xJQ0ssIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsVGFiRWRpdGluZygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRpbmdUYWIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZW5kVGFiRWRpdGluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5kVGFiRWRpdGluZygpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0aW5nVGFiID0gdGhpcy5fZWRpdGluZ1RhYjtcblx0XHR0aGlzLl9lZGl0aW5nVGFiID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2VkaXRpbmdEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGlmIChlZGl0aW5nVGFiKSB7XG5cdFx0XHRlZGl0aW5nVGFiLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZWRpdGluZycpO1xuXHRcdFx0Ly8gSW5wdXRCb3guZGlzcG9zZSgpIGRvZXMgbm90IGRldGFjaCBpdHMgbm9kZSwgc28gZW1wdHkgdGhlIGNvbnRhaW5lci5cblx0XHRcdHJlc2V0KGVkaXRpbmdUYWIuaW5wdXRDb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFjdGl2ZVRhYihhY3RpdmVDaGF0SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdGFiIG9mIHRoaXMuX3RhYnMpIHtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gdGFiLmNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gYWN0aXZlQ2hhdElkO1xuXHRcdFx0dGFiLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuXHRcdFx0dGFiLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgU3RyaW5nKGlzQWN0aXZlKSk7XG5cdFx0XHRpZiAoaXNBY3RpdmUpIHtcblx0XHRcdFx0dGFiLmVsZW1lbnQuc2Nyb2xsSW50b1ZpZXcoeyBibG9jazogJ25lYXJlc3QnLCBpbmxpbmU6ICduZWFyZXN0JyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxBY3RpdmVUYWIoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlVGFiID0gdGhpcy5fdGFicy5maW5kKHQgPT4gdC5lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykpO1xuXHRcdGFjdGl2ZVRhYj8uZWxlbWVudC5zY3JvbGxJbnRvVmlldyh7IGJsb2NrOiAnbmVhcmVzdCcsIGlubGluZTogJ25lYXJlc3QnIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzVmlzaWJsZSA9IHRoaXMuX3Zpc2libGU7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB0aGlzLl92aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdFx0aWYgKHdhc1Zpc2libGUgIT09IHRoaXMuX3Zpc2libGUpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHRoaXMuX3Zpc2libGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRhcHBseVNlc3Npb25CYXJUaGVtZUNvbG9ycyh0aGlzLl9jb250YWluZXIsIHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUUvRCxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsR0FBRyx1QkFBdUIsK0JBQStCLDBCQUEwQixXQUFXLFdBQVcsYUFBYTtBQUMvSCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZTtB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
