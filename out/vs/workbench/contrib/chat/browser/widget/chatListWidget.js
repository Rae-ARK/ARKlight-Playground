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
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { WorkbenchObjectTree } from "../../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { asCssVariable, buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground } from "../../../../../platform/theme/common/colorRegistry.js";
import { katexContainerClassName } from "../../../markdown/common/markedKatexExtension.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { ChatConfiguration, ChatModeKind } from "../../common/constants.js";
import { isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatAccessibilityProvider } from "../accessibility/chatAccessibilityProvider.js";
import { IChatAccessibilityService } from "../chat.js";
import { ChatCollapsibleContentPart } from "./chatContentParts/chatCollapsibleContentPart.js";
import { ChatListDelegate, ChatListItemRenderer } from "./chatListRenderer.js";
import { ChatEditorOptions } from "./chatOptions.js";
import { ChatPendingDragController } from "./chatPendingDragAndDrop.js";
class AutoScrollHolds {
  constructor() {
    this._count = 0;
  }
  get isHeld() {
    return this._count > 0;
  }
  acquire() {
    this._count++;
    let released = false;
    return toDisposable(() => {
      if (!released) {
        released = true;
        this._count--;
      }
    });
  }
}
class UserToggleResizeState {
  constructor(requiredStableFrames) {
    this.requiredStableFrames = requiredStableFrames;
    this.framesUntilSettled = 0;
    this.transitionInProgress = false;
  }
  get isActive() {
    return this.transitionInProgress || this.framesUntilSettled > 0;
  }
  start() {
    this.framesUntilSettled = this.requiredStableFrames;
  }
  markResized() {
    if (this.isActive) {
      this.framesUntilSettled = this.requiredStableFrames;
    }
  }
  startTransition() {
    this.transitionInProgress = true;
  }
  endTransition() {
    this.transitionInProgress = false;
    this.framesUntilSettled = this.requiredStableFrames;
  }
  advanceFrame() {
    if (this.isActive) {
      this.framesUntilSettled--;
    }
  }
}
function getAnchoredScrollTop(scrollTop, currentTargetTop, anchorTargetTop) {
  return scrollTop + currentTargetTop - anchorTargetTop;
}
function computeScrollDownState(isScrolledToBottom, scrollLock) {
  return {
    showButton: !isScrolledToBottom,
    atBottom: isScrolledToBottom || scrollLock
  };
}
class UserToggleResizeTracker extends Disposable {
  constructor(target, restoreScrollPosition, onDidSettle) {
    super();
    this.restoreScrollPosition = restoreScrollPosition;
    this.onDidSettle = onDidSettle;
    this.state = new UserToggleResizeState(2);
    this.pendingFrame = this._register(new MutableDisposable());
    const targetWindow = dom.getWindow(target);
    const resizeObserver = this._register(new dom.DisposableResizeObserver("ChatListWidget.userToggleResize", () => {
      this.state.markResized();
      this.scheduleFrame(targetWindow);
    }, targetWindow));
    this._register(resizeObserver.observe(target));
    this._register(dom.addDisposableListener(target, "transitionrun", (e) => {
      if (e.propertyName === "grid-template-rows") {
        this.state.startTransition();
        this.scheduleFrame(targetWindow);
      }
    }));
    const finishTransition = (e) => {
      if (e.propertyName === "grid-template-rows") {
        this.state.endTransition();
        this.scheduleFrame(targetWindow);
      }
    };
    this._register(dom.addDisposableListener(target, "transitionend", finishTransition));
    this._register(dom.addDisposableListener(target, "transitioncancel", finishTransition));
    this.state.start();
    this.scheduleFrame(targetWindow);
  }
  restoreScrollAnchor() {
    this.restoreScrollPosition?.();
  }
  cancelScrollRestoration() {
    this.restoreScrollPosition = void 0;
  }
  scheduleFrame(targetWindow) {
    if (this.pendingFrame.value) {
      return;
    }
    this.pendingFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => {
      this.pendingFrame.clear();
      this.restoreScrollPosition?.();
      this.state.advanceFrame();
      if (this.state.isActive) {
        this.scheduleFrame(targetWindow);
      } else {
        this.onDidSettle();
      }
    });
  }
}
let ChatListWidget = class extends Disposable {
  //#endregion
  constructor(container, options, instantiationService, contextKeyService, chatService, contextMenuService, logService, configurationService, chatAccessibilityService) {
    super();
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.chatService = chatService;
    this.contextMenuService = contextMenuService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.chatAccessibilityService = chatAccessibilityService;
    //#region Events
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidClickFollowup = this._register(new Emitter());
    this.onDidClickFollowup = this._onDidClickFollowup.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidChangeItemHeight = this._register(new Emitter());
    /** Event fired when an item's height changes. Used for dynamic layout mode. */
    this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
    this._visible = true;
    this._mostRecentlyFocusedItemIndex = -1;
    this._scrollLock = true;
    this._autoScrollHolds = new AutoScrollHolds();
    this._settingChangeCounter = 0;
    this._visibleChangeCount = 0;
    this._userToggleResizeTrackers = this._register(new DisposableMap());
    this._viewModel = options.viewModel;
    this._location = options.location;
    this._getSelectedModelRequestOptions = options.getSelectedModelRequestOptions;
    this._getCurrentModeInfo = options.getCurrentModeInfo;
    this._lastItemIdContextKey = ChatContextKeys.lastItemId.bindTo(this.contextKeyService);
    this._container = container;
    const updateInlineReferencesStyle = () => {
      const style = this.configurationService.getValue(ChatConfiguration.InlineReferencesStyle);
      this._container.classList.toggle("chat-inline-references-link-style", style === "link");
    };
    updateInlineReferencesStyle();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.InlineReferencesStyle)) {
        updateInlineReferencesStyle();
      }
    }));
    const scopedInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, this.contextKeyService])
    ));
    const overflowWidgetsContainer = options.overflowWidgetsDomNode ?? document.createElement("div");
    if (!options.overflowWidgetsDomNode) {
      overflowWidgetsContainer.classList.add("chat-overflow-widget-container", "monaco-editor");
      this._container.append(overflowWidgetsContainer);
      this._register(toDisposable(() => overflowWidgetsContainer.remove()));
    }
    const editorOptions = options.editorOptions ?? this._register(scopedInstantiationService.createInstance(
      ChatEditorOptions,
      options.viewId,
      "foreground",
      options.inputEditorBackground ?? "chat.requestEditor.background",
      options.resultEditorBackground ?? "chat.responseEditor.background"
    ));
    this._delegate = scopedInstantiationService.createInstance(
      ChatListDelegate,
      options.defaultElementHeight ?? 200
    );
    const rendererDelegate = {
      getListLength: () => this._tree.getNode(null).visibleChildrenCount,
      onDidScroll: this.onDidScroll,
      container: this._container,
      currentChatMode: options.currentChatMode ?? (() => ChatModeKind.Ask)
    };
    this._renderer = this._register(scopedInstantiationService.createInstance(
      ChatListItemRenderer,
      editorOptions,
      options.rendererOptions ?? {},
      rendererDelegate,
      overflowWidgetsContainer,
      this._viewModel
    ));
    this._register(this._renderer.onDidClickFollowup((item) => {
      this._onDidClickFollowup.fire(item);
    }));
    this._register(this._renderer.onDidChangeItemHeight((e) => {
      this._updateElementHeight(e.element, e.height);
      this._onDidChangeItemHeight.fire(e);
    }));
    this._register(this._renderer.onDidClickRerunWithAgentOrCommandDetection((e) => {
      const request = this.chatService.getSession(e.sessionResource)?.getRequests().find((candidate) => candidate.id === e.requestId);
      if (request) {
        const sendOptions = {
          noCommandDetection: true,
          attempt: request.attempt + 1,
          location: this._location,
          ...this._getSelectedModelRequestOptions?.(),
          modeInfo: this._getCurrentModeInfo?.()
        };
        this.chatAccessibilityService.acceptRequest(e.sessionResource);
        this.chatService.resendRequest(request, sendOptions).catch((e2) => this.logService.error("FAILED to rerun request", e2));
      }
    }));
    this._renderer.pendingDragController = this._register(
      scopedInstantiationService.createInstance(ChatPendingDragController, this._container, () => this._viewModel)
    );
    const styles = options.styles ?? {};
    this._tree = this._register(scopedInstantiationService.createInstance(
      WorkbenchObjectTree,
      "ChatList",
      this._container,
      this._delegate,
      [this._renderer],
      {
        identityProvider: { getId: (e) => e.id },
        horizontalScrolling: false,
        alwaysConsumeMouseWheel: false,
        supportDynamicHeights: true,
        hideTwistiesOfChildlessElements: true,
        accessibilityProvider: this.instantiationService.createInstance(ChatAccessibilityProvider),
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (e) => isRequestVM(e) ? e.message : isResponseVM(e) ? e.response.value : ""
        },
        setRowLineHeight: false,
        scrollToActiveElement: true,
        filter: options.filter,
        overrideStyles: {
          listFocusBackground: styles.listBackground,
          listInactiveFocusBackground: styles.listBackground,
          listActiveSelectionBackground: styles.listBackground,
          listFocusAndSelectionBackground: styles.listBackground,
          listInactiveSelectionBackground: styles.listBackground,
          listHoverBackground: styles.listBackground,
          listBackground: styles.listBackground,
          listFocusForeground: styles.listForeground,
          listHoverForeground: styles.listForeground,
          listInactiveFocusForeground: styles.listForeground,
          listInactiveSelectionForeground: styles.listForeground,
          listActiveSelectionForeground: styles.listForeground,
          listFocusAndSelectionForeground: styles.listForeground,
          listActiveSelectionIconForeground: void 0,
          listInactiveSelectionIconForeground: void 0
        }
      }
    ));
    this._scrollDownButton = this._register(new Button(this._container, {
      buttonBackground: asCssVariable(buttonSecondaryBackground),
      buttonForeground: asCssVariable(buttonSecondaryForeground),
      buttonHoverBackground: asCssVariable(buttonSecondaryHoverBackground),
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0,
      supportIcons: true
    }));
    this._scrollDownButton.element.classList.add("chat-scroll-down");
    this._scrollDownButton.label = `$(${Codicon.chevronDown.id})`;
    this._scrollDownButton.element.style.display = "none";
    this._register(this._scrollDownButton.onDidClick(() => {
      this.cancelUserToggleScrollRestoration();
      this.setScrollLock(true);
      this.scrollToEnd();
    }));
    this._register(this._tree.onDidChangeContentHeight(() => {
      this._onDidChangeContentHeight.fire();
    }));
    this._register(this._tree.onDidFocus(() => {
      this._onDidFocus.fire();
    }));
    this._register(this._tree.onDidChangeFocus(() => {
      const focused = this.getFocus();
      if (focused && focused.length > 0) {
        const focusedItem = focused[0];
        const items = this.getItems();
        const idx = items.findIndex((i) => i === focusedItem);
        if (idx !== -1) {
          this._mostRecentlyFocusedItemIndex = idx;
        }
      }
    }));
    this._register(this._tree.onDidScroll((e) => {
      this._onDidScroll.fire(e);
      this.updateScrollDownButtonVisibility();
    }));
    this.updateScrollDownButtonVisibility();
    this._register(dom.addDisposableListener(this._container, ChatCollapsibleContentPart.userToggleEvent, (e) => {
      if (!dom.isHTMLElement(e.target)) {
        return;
      }
      const element = this._renderer.getElementFromNode(e.target);
      if (element) {
        this.trackUserToggleResize(element, e.target);
      }
    }));
    this._register(dom.addDisposableListener(this._container, dom.EventType.WHEEL, () => this.cancelUserToggleScrollRestoration()));
    this._register(dom.addDisposableListener(this._container, dom.EventType.POINTER_DOWN, () => this.cancelUserToggleScrollRestoration()));
    this._register(dom.addDisposableListener(this._container, dom.EventType.KEY_DOWN, (e) => {
      const keyCode = new StandardKeyboardEvent(e).keyCode;
      if (keyCode === KeyCode.UpArrow || keyCode === KeyCode.DownArrow || keyCode === KeyCode.PageUp || keyCode === KeyCode.PageDown || keyCode === KeyCode.Home || keyCode === KeyCode.End) {
        this.cancelUserToggleScrollRestoration();
      }
    }, true));
    this._register(this._tree.onContextMenu((e) => {
      this.handleContextMenu(e);
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.EditRequests) || e.affectsConfiguration(ChatConfiguration.CheckpointsEnabled)) {
        this._settingChangeCounter++;
        this.refresh();
      }
    }));
  }
  /**
   * Event fired when a request item is clicked.
   */
  get onDidClickRequest() {
    return this._renderer.onDidClickRequest;
  }
  /**
   * Event fired when an item is re-rendered.
   */
  get onDidRerender() {
    return this._renderer.onDidRerender;
  }
  /**
   * Event fired when a template is disposed.
   */
  get onDidDispose() {
    return this._renderer.onDidDispose;
  }
  /**
   * Event fired when focus moves outside the editing area.
   */
  get onDidFocusOutside() {
    return this._renderer.onDidFocusOutside;
  }
  //#endregion
  //#region Properties
  get domNode() {
    return this._container;
  }
  get scrollTop() {
    return this._tree.scrollTop;
  }
  set scrollTop(value) {
    this._tree.scrollTop = value;
  }
  get scrollHeight() {
    return this._tree.scrollHeight;
  }
  get renderHeight() {
    return this._tree.renderHeight;
  }
  get contentHeight() {
    return this._tree.contentHeight;
  }
  /**
   * Whether the list is scrolled to the bottom.
   */
  get isScrolledToBottom() {
    return this._tree.scrollTop + this._tree.renderHeight >= this._tree.scrollHeight - 2;
  }
  /**
   * The last item in the list.
   */
  get lastItem() {
    return this._lastItem;
  }
  //#region Internal event handlers
  /**
   * Update scroll-down button visibility based on scroll position and scroll lock.
   */
  updateScrollDownButtonVisibility() {
    const { showButton, atBottom } = computeScrollDownState(this.isScrolledToBottom, this._scrollLock);
    this._scrollDownButton.element.style.display = showButton ? "flex" : "none";
    this._container.classList.toggle("chat-list-at-bottom", atBottom);
  }
  /**
   * Handle context menu events.
   */
  handleContextMenu(e) {
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
    const selected = e.element;
    const target = e.browserEvent.target;
    const isKatexElement = target.closest(`.${katexContainerClassName}`) !== null;
    const scopedContextKeyService = this.contextKeyService.createOverlay([
      [ChatContextKeys.isResponse.key, isResponseVM(selected)],
      [ChatContextKeys.responseIsFiltered.key, isResponseVM(selected) && !!selected.errorDetails?.responseIsFiltered],
      [ChatContextKeys.isKatexMathElement.key, isKatexElement]
    ]);
    this.contextMenuService.showContextMenu({
      menuId: MenuId.ChatContext,
      menuActionOptions: { shouldForwardArgs: true },
      contextKeyService: scopedContextKeyService,
      getAnchor: () => e.anchor,
      getActionsContext: () => selected
    });
  }
  //#endregion
  //#region ViewModel methods
  /**
   * Set the view model for the list to render.
   */
  setViewModel(viewModel) {
    this._viewModel = viewModel;
    this._renderer.updateViewModel(viewModel);
  }
  /**
   * Refresh the list from the current view model.
   * Uses internal state for diff identity calculation.
   */
  refresh() {
    if (!this._viewModel) {
      this._tree.setChildren(null, []);
      this._lastItem = void 0;
      this._lastItemIdContextKey.set([]);
      return;
    }
    const items = this._viewModel.getItems();
    this._lastItem = items.at(-1);
    this._lastItemIdContextKey.set(this._lastItem ? [this._lastItem.id] : []);
    const treeItems = items.map((item) => ({
      element: item,
      collapsed: false,
      collapsible: false
    }));
    const editing = this._viewModel.editing;
    this._withPersistedAutoScroll(() => {
      this._tree.setChildren(null, treeItems, {
        diffIdentityProvider: {
          getId: (element) => {
            const baseId = isRequestVM(element) || isResponseVM(element) ? element.dataId : element.id;
            const disablement = isRequestVM(element) || isResponseVM(element) ? element.shouldBeRemovedOnSend : void 0;
            const isEditTarget = isRequestVM(element) && editing?.id === element.id;
            const isBlocked = isRequestVM(element) || isResponseVM(element) ? element.shouldBeBlocked.get() : false;
            return baseId + // If a response is in the process of progressive rendering, we need to ensure that it will
            // be re-rendered so progressive rendering is restarted, even if the model wasn't updated.
            `${isResponseVM(element) && element.renderData ? `_${this._visibleChangeCount}` : ""}` + // Re-render once content references are loaded
            (isResponseVM(element) ? `_${element.contentReferences.length}` : "") + // Re-render if element becomes hidden due to undo/redo
            `_${disablement ? `${disablement.afterUndoStop || "1"}` : "0"}_${isEditTarget ? "edit" : ""}_${isBlocked ? "blocked" : ""}` + // Re-render requests when editing starts/stops (for hover button visibility, click handlers)
            (isRequestVM(element) ? `_${editing ? "1" : "0"}` : "") + // Re-render all if invoked by setting change
            `_setting${this._settingChangeCounter}` + // Rerender request if we got new content references in the response
            // since this may change how we render the corresponding attachments in the request
            (isRequestVM(element) && element.contentReferences ? `_${element.contentReferences?.length}` : "");
          }
        }
      });
    });
  }
  /**
   * Set scroll lock state.
   */
  setScrollLock(value) {
    this._scrollLock = value;
    this.updateScrollDownButtonVisibility();
  }
  /**
   * Get scroll lock state.
   */
  get scrollLock() {
    return this._scrollLock;
  }
  /**
   * Set the visible change count (for diff identity).
   */
  setVisibleChangeCount(value) {
    this._visibleChangeCount = value;
  }
  /**
   * Scroll to reveal an element if editing.
   */
  scrollToCurrentItem(currentElement) {
    if (!this._viewModel?.editing || !currentElement) {
      return;
    }
    if (!this._tree.hasElement(currentElement)) {
      return;
    }
    const relativeTop = this._tree.getRelativeTop(currentElement);
    if (relativeTop === null || relativeTop < 0 || relativeTop > 1) {
      this._tree.reveal(currentElement, 0);
    }
  }
  //#endregion
  //#region Tree methods
  /**
   * Rerender the tree.
   */
  rerender() {
    this._tree.rerender();
  }
  getItems() {
    const items = [];
    const root = this._tree.getNode(null);
    for (const child of root.children) {
      if (child.element) {
        items.push(child.element);
      }
    }
    return items;
  }
  /**
   * Delegate scroll events from a mouse wheel event to the tree.
   */
  delegateScrollFromMouseWheelEvent(event) {
    this.cancelUserToggleScrollRestoration();
    this._tree.delegateScrollFromMouseWheelEvent(event);
  }
  /**
   * Whether the tree has a specific element.
   */
  hasElement(element) {
    return this._tree.hasElement(element);
  }
  /**
   * Update the height of an element.
   */
  _updateElementHeight(element, height) {
    if (this._tree.hasElement(element) && this._visible) {
      const userToggleResizeTracker = this._userToggleResizeTrackers.get(element);
      if (userToggleResizeTracker) {
        this._tree.updateElementHeight(element, height);
        userToggleResizeTracker.restoreScrollAnchor();
        return;
      }
      this._withPersistedAutoScroll(() => {
        this._tree.updateElementHeight(element, height);
      });
    }
  }
  trackUserToggleResize(element, target) {
    const anchorTargetTop = this.isScrolledToBottom ? target.getBoundingClientRect().top : void 0;
    const restoreScrollPosition = anchorTargetTop === void 0 ? void 0 : () => {
      if (target.isConnected) {
        this._tree.scrollTop = getAnchoredScrollTop(this._tree.scrollTop, target.getBoundingClientRect().top, anchorTargetTop);
      }
    };
    const tracker = new UserToggleResizeTracker(target, restoreScrollPosition, () => {
      if (this._userToggleResizeTrackers.get(element) === tracker) {
        this._userToggleResizeTrackers.deleteAndDispose(element);
      }
    });
    this._userToggleResizeTrackers.set(element, tracker);
  }
  cancelUserToggleScrollRestoration() {
    for (const tracker of this._userToggleResizeTrackers.values()) {
      tracker.cancelScrollRestoration();
    }
  }
  /**
   * Scroll to reveal an element.
   */
  reveal(element, relativeTop) {
    this._tree.reveal(element, relativeTop);
  }
  /**
   * The top offset of an element in transcript content space (same space as
   * `scrollTop`/`scrollHeight`), or `undefined` if it is not in the list. Reads
   * the layout height model, so it also resolves off-screen elements.
   */
  getElementTop(element) {
    if (!this._tree.hasElement(element)) {
      return void 0;
    }
    return this._tree.getElementTop(element);
  }
  /**
   * Get the focused elements.
   */
  getFocus() {
    return this._tree.getFocus().filter((e) => e !== null);
  }
  /**
   * Set the focused elements.
   */
  setFocus(elements) {
    this._tree.setFocus(elements);
  }
  focusItem(item) {
    if (!this.hasElement(item)) {
      return;
    }
    this._tree.setFocus([item]);
    this._tree.domFocus();
  }
  /**
   * Focus the last item in the list. Returns the index of the focused item.
   * @param useMostRecentlyFocusedIndex If true, use the mostRecentlyFocusedIndex if valid
   */
  focusLastItem(useMostRecentlyFocusedIndex) {
    const items = this.getItems();
    if (items.length === 0) {
      return -1;
    }
    let focusIndex;
    if (useMostRecentlyFocusedIndex && this._mostRecentlyFocusedItemIndex >= 0 && this._mostRecentlyFocusedItemIndex < items.length) {
      focusIndex = this._mostRecentlyFocusedItemIndex;
    } else {
      focusIndex = items.length - 1;
    }
    this._tree.setFocus([items[focusIndex]]);
    this._tree.domFocus();
    return focusIndex;
  }
  /**
   * Scroll the list to reveal the last item.
   */
  scrollToEnd() {
    const lastElement = this._tree.getNode(null).children.at(-1)?.element;
    if (lastElement) {
      const offset = Math.max(lastElement.currentRenderedHeight ?? 0, 1e6);
      this._tree.reveal(lastElement, offset);
    }
  }
  /**
   * Suppresses auto-scrolling to the bottom until the returned disposable is
   * disposed. Holds compose, so unrelated features (request editing, an open
   * text selection) can suppress concurrently without clobbering each other;
   * auto-scroll resumes only once the last hold is released.
   */
  acquireAutoScrollHold() {
    return this._autoScrollHolds.acquire();
  }
  /** Whether any {@link acquireAutoScrollHold} hold is currently active. */
  get isAutoScrollHeld() {
    return this._autoScrollHolds.isHeld;
  }
  _withPersistedAutoScroll(fn) {
    if (this.isAutoScrollHeld) {
      fn();
      return;
    }
    const wasScrolledToBottom = this.isScrolledToBottom;
    fn();
    if (wasScrolledToBottom) {
      this.scrollToEnd();
    }
  }
  /**
   * Focus the list.
   */
  focus() {
    this._tree.domFocus();
  }
  /**
   * Get the DOM focus state.
   */
  isDOMFocused() {
    return this._tree.isDOMFocused();
  }
  //#endregion
  //#region Renderer methods
  /**
   * Get code block info for a response.
   */
  getCodeBlockInfosForResponse(response) {
    return this._renderer.getCodeBlockInfosForResponse(response);
  }
  /**
   * Get code block info by URI.
   */
  getCodeBlockInfoForEditor(uri) {
    return this._renderer.getCodeBlockInfoForEditor(uri);
  }
  /**
   * Get file tree info for a response.
   */
  getFileTreeInfosForResponse(response) {
    return this._renderer.getFileTreeInfosForResponse(response);
  }
  /**
   * Get the last focused file tree for a response.
   */
  getLastFocusedFileTreeForResponse(response) {
    return this._renderer.getLastFocusedFileTreeForResponse(response);
  }
  /**
   * Get editors currently in use.
   */
  editorsInUse() {
    return this._renderer.editorsInUse();
  }
  /**
   * Get template data for a request ID.
   */
  getTemplateDataForRequestId(requestId) {
    if (!requestId) {
      return void 0;
    }
    return this._renderer.getTemplateDataForRequestId(requestId);
  }
  /**
   * Returns the currently rendered chat item containing the node.
   */
  getElementFromNode(node) {
    return this._renderer.getElementFromNode(node);
  }
  /**
   * Update renderer options.
   */
  updateRendererOptions(options) {
    this._renderer.updateOptions(options);
  }
  /**
   * Update the list/tree color overrides. Re-applies the same fan-out from
   * `listBackground`/`listForeground` to all interaction states that was
   * originally configured at construction time.
   */
  setStyles(styles) {
    this._tree.updateOptions({
      overrideStyles: {
        listFocusBackground: styles.listBackground,
        listInactiveFocusBackground: styles.listBackground,
        listActiveSelectionBackground: styles.listBackground,
        listFocusAndSelectionBackground: styles.listBackground,
        listInactiveSelectionBackground: styles.listBackground,
        listHoverBackground: styles.listBackground,
        listBackground: styles.listBackground,
        listFocusForeground: styles.listForeground,
        listHoverForeground: styles.listForeground,
        listInactiveFocusForeground: styles.listForeground,
        listInactiveSelectionForeground: styles.listForeground,
        listActiveSelectionForeground: styles.listForeground,
        listFocusAndSelectionForeground: styles.listForeground,
        listActiveSelectionIconForeground: void 0,
        listInactiveSelectionIconForeground: void 0
      }
    });
  }
  /**
   * Set the visibility of the list.
   */
  setVisible(visible) {
    this._visible = visible;
    this._renderer.setVisible(visible);
  }
  /**
   * Layout the list.
   */
  layout(height, width) {
    this._tree.layout(height, width);
    this._renderer.layout(width ?? this._container.clientWidth);
  }
  //#endregion
};
ChatListWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IChatAccessibilityService)
], ChatListWidget);
export {
  AutoScrollHolds,
  ChatListWidget,
  UserToggleResizeState,
  computeScrollDownState,
  getAnchoredScrollTop
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdExpc3RXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJTW91c2VXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZUVsZW1lbnQsIElUcmVlRmlsdGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2Nyb2xsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlLCBidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kLCBidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kLCBidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBrYXRleENvbnRhaW5lckNsYXNzTmFtZSB9IGZyb20gJy4uLy4uLy4uL21hcmtkb3duL2NvbW1vbi9tYXJrZWRLYXRleEV4dGVuc2lvbi5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNoYXRGb2xsb3d1cCwgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0TW9kZUluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgSUNoYXRWaWV3TW9kZWwsIGlzUmVxdWVzdFZNLCBpc1Jlc3BvbnNlVk0gfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vYWNjZXNzaWJpbGl0eS9jaGF0QWNjZXNzaWJpbGl0eVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSwgSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdEZpbGVUcmVlSW5mbywgSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucyB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ29kZUJsb2NrUGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jb2RlQmxvY2tQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRMaXN0RGVsZWdhdGUsIENoYXRMaXN0SXRlbVJlbmRlcmVyLCBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIElDaGF0UmVuZGVyZXJEZWxlZ2F0ZSB9IGZyb20gJy4vY2hhdExpc3RSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4vY2hhdE9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFBlbmRpbmdEcmFnQ29udHJvbGxlciB9IGZyb20gJy4vY2hhdFBlbmRpbmdEcmFnQW5kRHJvcC5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRMaXN0V2lkZ2V0U3R5bGVzIHtcblx0bGlzdEZvcmVncm91bmQ/OiBzdHJpbmc7XG5cdGxpc3RCYWNrZ3JvdW5kPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlZi1jb3VudGVkIHN1cHByZXNzaW9uIG9mIGF1dG8tc2Nyb2xsaW5nIHRvIHRoZSBib3R0b20uIEhvbGRzIGNvbXBvc2UsIHNvXG4gKiB1bnJlbGF0ZWQgZmVhdHVyZXMgKHJlcXVlc3QgZWRpdGluZywgYW4gb3BlbiB0ZXh0IHNlbGVjdGlvbikgY2FuIHN1cHByZXNzXG4gKiBjb25jdXJyZW50bHkgd2l0aG91dCBjbG9iYmVyaW5nIGVhY2ggb3RoZXI7IGF1dG8tc2Nyb2xsIHJlc3VtZXMgb25seSBvbmNlIHRoZVxuICogbGFzdCBob2xkIGlzIHJlbGVhc2VkLlxuICovXG5leHBvcnQgY2xhc3MgQXV0b1Njcm9sbEhvbGRzIHtcblxuXHRwcml2YXRlIF9jb3VudCA9IDA7XG5cblx0Z2V0IGlzSGVsZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY291bnQgPiAwO1xuXHR9XG5cblx0YWNxdWlyZSgpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fY291bnQrKztcblx0XHQvLyBJZGVtcG90ZW50IHNvIGEgZG91YmxlLWRpc3Bvc2UgcmVsZWFzZXMgb25lIGhvbGQgcmF0aGVyIHRoYW5cblx0XHQvLyBkZWNyZW1lbnRpbmcgcGFzdCBpdCBhbmQgc2lsZW50bHkgY2FuY2VsbGluZyBzb21lYm9keSBlbHNlJ3MuXG5cdFx0bGV0IHJlbGVhc2VkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXJlbGVhc2VkKSB7XG5cdFx0XHRcdHJlbGVhc2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fY291bnQtLTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFRyYWNrcyB3aGVuIGEgdXNlci10cmlnZ2VyZWQgcmVzaXplIGhhcyByZW1haW5lZCBzdGFibGUgYWNyb3NzIGFuaW1hdGlvbiBmcmFtZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBVc2VyVG9nZ2xlUmVzaXplU3RhdGUge1xuXG5cdHByaXZhdGUgZnJhbWVzVW50aWxTZXR0bGVkID0gMDtcblx0cHJpdmF0ZSB0cmFuc2l0aW9uSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcmVxdWlyZWRTdGFibGVGcmFtZXM6IG51bWJlcikgeyB9XG5cblx0Z2V0IGlzQWN0aXZlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRyYW5zaXRpb25JblByb2dyZXNzIHx8IHRoaXMuZnJhbWVzVW50aWxTZXR0bGVkID4gMDtcblx0fVxuXG5cdHN0YXJ0KCk6IHZvaWQge1xuXHRcdHRoaXMuZnJhbWVzVW50aWxTZXR0bGVkID0gdGhpcy5yZXF1aXJlZFN0YWJsZUZyYW1lcztcblx0fVxuXG5cdG1hcmtSZXNpemVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzQWN0aXZlKSB7XG5cdFx0XHR0aGlzLmZyYW1lc1VudGlsU2V0dGxlZCA9IHRoaXMucmVxdWlyZWRTdGFibGVGcmFtZXM7XG5cdFx0fVxuXHR9XG5cblx0c3RhcnRUcmFuc2l0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMudHJhbnNpdGlvbkluUHJvZ3Jlc3MgPSB0cnVlO1xuXHR9XG5cblx0ZW5kVHJhbnNpdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnRyYW5zaXRpb25JblByb2dyZXNzID0gZmFsc2U7XG5cdFx0dGhpcy5mcmFtZXNVbnRpbFNldHRsZWQgPSB0aGlzLnJlcXVpcmVkU3RhYmxlRnJhbWVzO1xuXHR9XG5cblx0YWR2YW5jZUZyYW1lKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzQWN0aXZlKSB7XG5cdFx0XHR0aGlzLmZyYW1lc1VudGlsU2V0dGxlZC0tO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QW5jaG9yZWRTY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIsIGN1cnJlbnRUYXJnZXRUb3A6IG51bWJlciwgYW5jaG9yVGFyZ2V0VG9wOiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gc2Nyb2xsVG9wICsgY3VycmVudFRhcmdldFRvcCAtIGFuY2hvclRhcmdldFRvcDtcbn1cblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgc2Nyb2xsLWRvd24gc3RhdGUgZm9yIHRoZSBjaGF0IGxpc3QsIGtlZXBpbmcgdHdvIGNvbmNlcm5zIGRlY291cGxlZDpcbiAqXG4gKiAtIGBzaG93QnV0dG9uYDogd2hldGhlciB0aGUgXCJzY3JvbGwgdG8gYm90dG9tXCIgYWZmb3JkYW5jZSBpcyBzaG93bi4gRHJpdmVuIHB1cmVseSBieSB0aGUgYWN0dWFsXG4gKiAgIHNjcm9sbCBwb3NpdGlvbiBzbyB0aGUgdXNlciBjYW4gYWx3YXlzIGp1bXAgdG8gdGhlIGxhdGVzdCBjb250ZW50IHdoZW4gdGhlIHZpZXcgaXMgbm90IGF0IHRoZVxuICogICBib3R0b20gXHUyMDE0IGluY2x1ZGluZyBkdXJpbmcgYW4gYXV0by1zY3JvbGwgKGFnZW50KSB0dXJuIHdoZXJlIHRoZSB2aWV3IGhhcyBmYWxsZW4gYmVoaW5kLiBTZWVcbiAqICAgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyNjk1MiAocHJldmlvdXNseSB0aGlzIHdhcyBhbHNvIHN1cHByZXNzZWQgYnkgdGhlXG4gKiAgIHNjcm9sbCBsb2NrLCBoaWRpbmcgdGhlIGJ1dHRvbiBmb3IgdGhlIHdob2xlIGFnZW50IHR1cm4pLlxuICogLSBgYXRCb3R0b21gOiB0aGUgYGNoYXQtbGlzdC1hdC1ib3R0b21gIHZpc3VhbCBzdGF0ZSB0aGF0IHJlc2VydmVzIHN0cmVhbWluZy1yZXNwb25zZSBwYWRkaW5nLlxuICogICBJbnRlbnRpb25hbGx5IHN0aWxsIGhvbm91cnMgdGhlIHNjcm9sbCBsb2NrIHNvIHBhZGRpbmcgZHVyaW5nIGF1dG8tc2Nyb2xsIHR1cm5zIGlzIHVuY2hhbmdlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVTY3JvbGxEb3duU3RhdGUoaXNTY3JvbGxlZFRvQm90dG9tOiBib29sZWFuLCBzY3JvbGxMb2NrOiBib29sZWFuKTogeyBzaG93QnV0dG9uOiBib29sZWFuOyBhdEJvdHRvbTogYm9vbGVhbiB9IHtcblx0cmV0dXJuIHtcblx0XHRzaG93QnV0dG9uOiAhaXNTY3JvbGxlZFRvQm90dG9tLFxuXHRcdGF0Qm90dG9tOiBpc1Njcm9sbGVkVG9Cb3R0b20gfHwgc2Nyb2xsTG9jayxcblx0fTtcbn1cblxuY2xhc3MgVXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN0YXRlID0gbmV3IFVzZXJUb2dnbGVSZXNpemVTdGF0ZSgyKTtcblx0cHJpdmF0ZSByZWFkb25seSBwZW5kaW5nRnJhbWUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRhcmdldDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZXN0b3JlU2Nyb2xsUG9zaXRpb246ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkU2V0dGxlOiAoKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0YXJnZXQpO1xuXHRcdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRMaXN0V2lkZ2V0LnVzZXJUb2dnbGVSZXNpemUnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnN0YXRlLm1hcmtSZXNpemVkKCk7XG5cdFx0XHR0aGlzLnNjaGVkdWxlRnJhbWUodGFyZ2V0V2luZG93KTtcblx0XHR9LCB0YXJnZXRXaW5kb3cpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXNpemVPYnNlcnZlci5vYnNlcnZlKHRhcmdldCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0LCAndHJhbnNpdGlvbnJ1bicsIGUgPT4ge1xuXHRcdFx0aWYgKGUucHJvcGVydHlOYW1lID09PSAnZ3JpZC10ZW1wbGF0ZS1yb3dzJykge1xuXHRcdFx0XHR0aGlzLnN0YXRlLnN0YXJ0VHJhbnNpdGlvbigpO1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlRnJhbWUodGFyZ2V0V2luZG93KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZmluaXNoVHJhbnNpdGlvbiA9IChlOiBUcmFuc2l0aW9uRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLnByb3BlcnR5TmFtZSA9PT0gJ2dyaWQtdGVtcGxhdGUtcm93cycpIHtcblx0XHRcdFx0dGhpcy5zdGF0ZS5lbmRUcmFuc2l0aW9uKCk7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVGcmFtZSh0YXJnZXRXaW5kb3cpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXQsICd0cmFuc2l0aW9uZW5kJywgZmluaXNoVHJhbnNpdGlvbikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0LCAndHJhbnNpdGlvbmNhbmNlbCcsIGZpbmlzaFRyYW5zaXRpb24pKTtcblxuXHRcdHRoaXMuc3RhdGUuc3RhcnQoKTtcblx0XHR0aGlzLnNjaGVkdWxlRnJhbWUodGFyZ2V0V2luZG93KTtcblx0fVxuXG5cdHJlc3RvcmVTY3JvbGxBbmNob3IoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN0b3JlU2Nyb2xsUG9zaXRpb24/LigpO1xuXHR9XG5cblx0Y2FuY2VsU2Nyb2xsUmVzdG9yYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN0b3JlU2Nyb2xsUG9zaXRpb24gPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlRnJhbWUodGFyZ2V0V2luZG93OiBXaW5kb3cpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wZW5kaW5nRnJhbWUudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdGcmFtZS52YWx1ZSA9IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgKCkgPT4ge1xuXHRcdFx0dGhpcy5wZW5kaW5nRnJhbWUuY2xlYXIoKTtcblx0XHRcdHRoaXMucmVzdG9yZVNjcm9sbFBvc2l0aW9uPy4oKTtcblx0XHRcdHRoaXMuc3RhdGUuYWR2YW5jZUZyYW1lKCk7XG5cdFx0XHRpZiAodGhpcy5zdGF0ZS5pc0FjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlRnJhbWUodGFyZ2V0V2luZG93KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMub25EaWRTZXR0bGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TGlzdFdpZGdldE9wdGlvbnMge1xuXHQvKipcblx0ICogT3B0aW9ucyBmb3IgdGhlIGxpc3QgaXRlbSByZW5kZXJlci5cblx0ICovXG5cdHJlYWRvbmx5IHJlbmRlcmVyT3B0aW9ucz86IElDaGF0TGlzdEl0ZW1SZW5kZXJlck9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIERlZmF1bHQgaGVpZ2h0IGZvciBsaXN0IGVsZW1lbnRzLlxuXHQgKi9cblx0cmVhZG9ubHkgZGVmYXVsdEVsZW1lbnRIZWlnaHQ/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIERPTSBub2RlIGZvciBvdmVyZmxvdyB3aWRnZXRzIChlLmcuLCBjb2RlIGVkaXRvcnMpLlxuXHQgKi9cblx0cmVhZG9ubHkgb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZT86IEhUTUxFbGVtZW50O1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBzdHlsZSBvdmVycmlkZXMgZm9yIHRoZSBsaXN0LlxuXHQgKi9cblx0cmVhZG9ubHkgc3R5bGVzPzogSUNoYXRMaXN0V2lkZ2V0U3R5bGVzO1xuXG5cdC8qKlxuXHQgKiBDYWxsYmFjayB0byBnZXQgdGhlIGN1cnJlbnQgY2hhdCBtb2RlLlxuXHQgKi9cblx0cmVhZG9ubHkgY3VycmVudENoYXRNb2RlPzogKCkgPT4gQ2hhdE1vZGVLaW5kO1xuXG5cdC8qKlxuXHQgKiBWaWV3IElEIGZvciBlZGl0b3Igb3B0aW9ucyAodXNlZCBpbiBDaGF0V2lkZ2V0IGNvbnRleHQpLlxuXHQgKi9cblx0cmVhZG9ubHkgdmlld0lkPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBJbnB1dCBlZGl0b3IgYmFja2dyb3VuZCBjb2xvciBrZXkuXG5cdCAqL1xuXHRyZWFkb25seSBpbnB1dEVkaXRvckJhY2tncm91bmQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFJlc3VsdCBlZGl0b3IgYmFja2dyb3VuZCBjb2xvciBrZXkuXG5cdCAqL1xuXHRyZWFkb25seSByZXN1bHRFZGl0b3JCYWNrZ3JvdW5kPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBmaWx0ZXIgZm9yIHRoZSB0cmVlLlxuXHQgKi9cblx0cmVhZG9ubHkgZmlsdGVyPzogSVRyZWVGaWx0ZXI8Q2hhdFRyZWVJdGVtLCBGdXp6eVNjb3JlPjtcblxuXHQvKipcblx0ICogSW5pdGlhbCB2aWV3IG1vZGVsLlxuXHQgKi9cblx0cmVhZG9ubHkgdmlld01vZGVsPzogSUNoYXRWaWV3TW9kZWw7XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIHByZS1jcmVhdGVkIGVkaXRvciBvcHRpb25zLlxuXHQgKiBJZiBwcm92aWRlZCwgdGhlc2Ugd2lsbCBiZSB1c2VkIGluc3RlYWQgb2YgY3JlYXRpbmcgbmV3IG9uZXMuXG5cdCAqL1xuXHRyZWFkb25seSBlZGl0b3JPcHRpb25zPzogQ2hhdEVkaXRvck9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIFRoZSBjaGF0IGxvY2F0aW9uIChmb3IgcmVydW4gcmVxdWVzdHMpLlxuXHQgKi9cblx0cmVhZG9ubHkgbG9jYXRpb24/OiBDaGF0QWdlbnRMb2NhdGlvbjtcblxuXHQvKipcblx0ICogQ2FsbGJhY2sgdG8gZ2V0IHRoZSBzZWxlY3RlZCBsYW5ndWFnZSBtb2RlbCByZXF1ZXN0IG9wdGlvbnMgKGZvciByZXJ1biByZXF1ZXN0cykuXG5cdCAqL1xuXHRyZWFkb25seSBnZXRTZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnM/OiAoKSA9PiBQaWNrPElDaGF0U2VuZFJlcXVlc3RPcHRpb25zLCAndXNlclNlbGVjdGVkTW9kZWxJZCcgfCAndXNlclNlbGVjdGVkTW9kZWxDb25maWd1cmF0aW9uJz47XG5cblx0LyoqXG5cdCAqIENhbGxiYWNrIHRvIGdldCBjdXJyZW50IG1vZGUgaW5mbyAoZm9yIHJlcnVuIHJlcXVlc3RzKS5cblx0ICovXG5cdHJlYWRvbmx5IGdldEN1cnJlbnRNb2RlSW5mbz86ICgpID0+IElDaGF0UmVxdWVzdE1vZGVJbmZvIHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEEgcmV1c2FibGUgd2lkZ2V0IHRoYXQgZW5jYXBzdWxhdGVzIGNoYXQgbGlzdC90cmVlIHJlbmRlcmluZy5cbiAqIFRoaXMgY2FuIGJlIHVzZWQgaW4gdmFyaW91cyBjb250ZXh0cyBzdWNoIGFzIHRoZSBtYWluIGNoYXQgd2lkZ2V0LFxuICogaG92ZXIgcHJldmlld3MsIGV0Yy5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRMaXN0V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Ly8jcmVnaW9uIEV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU2Nyb2xsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2Nyb2xsRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNjcm9sbDogRXZlbnQ8U2Nyb2xsRXZlbnQ+ID0gdGhpcy5fb25EaWRTY3JvbGwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGlja0ZvbGxvd3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRGb2xsb3d1cD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tGb2xsb3d1cDogRXZlbnQ8SUNoYXRGb2xsb3d1cD4gPSB0aGlzLl9vbkRpZENsaWNrRm9sbG93dXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBlbGVtZW50OiBDaGF0VHJlZUl0ZW07IGhlaWdodDogbnVtYmVyIH0+KCkpO1xuXHQvKiogRXZlbnQgZmlyZWQgd2hlbiBhbiBpdGVtJ3MgaGVpZ2h0IGNoYW5nZXMuIFVzZWQgZm9yIGR5bmFtaWMgbGF5b3V0IG1vZGUuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSXRlbUhlaWdodDogRXZlbnQ8eyBlbGVtZW50OiBDaGF0VHJlZUl0ZW07IGhlaWdodDogbnVtYmVyIH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VJdGVtSGVpZ2h0LmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBFdmVudCBmaXJlZCB3aGVuIGEgcmVxdWVzdCBpdGVtIGlzIGNsaWNrZWQuXG5cdCAqL1xuXHRnZXQgb25EaWRDbGlja1JlcXVlc3QoKTogRXZlbnQ8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVyLm9uRGlkQ2xpY2tSZXF1ZXN0O1xuXHR9XG5cblx0LyoqXG5cdCAqIEV2ZW50IGZpcmVkIHdoZW4gYW4gaXRlbSBpcyByZS1yZW5kZXJlZC5cblx0ICovXG5cdGdldCBvbkRpZFJlcmVuZGVyKCk6IEV2ZW50PElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5vbkRpZFJlcmVuZGVyO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV2ZW50IGZpcmVkIHdoZW4gYSB0ZW1wbGF0ZSBpcyBkaXNwb3NlZC5cblx0ICovXG5cdGdldCBvbkRpZERpc3Bvc2UoKTogRXZlbnQ8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVyLm9uRGlkRGlzcG9zZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFdmVudCBmaXJlZCB3aGVuIGZvY3VzIG1vdmVzIG91dHNpZGUgdGhlIGVkaXRpbmcgYXJlYS5cblx0ICovXG5cdGdldCBvbkRpZEZvY3VzT3V0c2lkZSgpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVyLm9uRGlkRm9jdXNPdXRzaWRlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFByaXZhdGUgZmllbGRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHJlZTogV29ya2JlbmNoT2JqZWN0VHJlZTxDaGF0VHJlZUl0ZW0sIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWxlZ2F0ZTogQ2hhdExpc3REZWxlZ2F0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyZXI6IENoYXRMaXN0SXRlbVJlbmRlcmVyO1xuXG5cdHByaXZhdGUgX3ZpZXdNb2RlbDogSUNoYXRWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Zpc2libGUgPSB0cnVlO1xuXHRwcml2YXRlIF9sYXN0SXRlbTogQ2hhdFRyZWVJdGVtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb3N0UmVjZW50bHlGb2N1c2VkSXRlbUluZGV4OiBudW1iZXIgPSAtMTtcblx0cHJpdmF0ZSBfc2Nyb2xsTG9jazogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX2F1dG9TY3JvbGxIb2xkcyA9IG5ldyBBdXRvU2Nyb2xsSG9sZHMoKTtcblx0cHJpdmF0ZSBfc2V0dGluZ0NoYW5nZUNvdW50ZXI6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX3Zpc2libGVDaGFuZ2VDb3VudDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8Q2hhdFRyZWVJdGVtLCBVc2VyVG9nZ2xlUmVzaXplVHJhY2tlcj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Nyb2xsRG93bkJ1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0SXRlbUlkQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nW10+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZ2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zOiAoKCkgPT4gUGljazxJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucywgJ3VzZXJTZWxlY3RlZE1vZGVsSWQnIHwgJ3VzZXJTZWxlY3RlZE1vZGVsQ29uZmlndXJhdGlvbic+KSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZ2V0Q3VycmVudE1vZGVJbmZvOiAoKCkgPT4gSUNoYXRSZXF1ZXN0TW9kZUluZm8gfCB1bmRlZmluZWQpIHwgdW5kZWZpbmVkO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBQcm9wZXJ0aWVzXG5cblx0Z2V0IGRvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XG5cdH1cblxuXHRnZXQgc2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuc2Nyb2xsVG9wO1xuXHR9XG5cblx0c2V0IHNjcm9sbFRvcCh2YWx1ZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5fdHJlZS5zY3JvbGxUb3AgPSB2YWx1ZTtcblx0fVxuXG5cdGdldCBzY3JvbGxIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5zY3JvbGxIZWlnaHQ7XG5cdH1cblxuXHRnZXQgcmVuZGVySGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUucmVuZGVySGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5jb250ZW50SGVpZ2h0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGxpc3QgaXMgc2Nyb2xsZWQgdG8gdGhlIGJvdHRvbS5cblx0ICovXG5cdGdldCBpc1Njcm9sbGVkVG9Cb3R0b20oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuc2Nyb2xsVG9wICsgdGhpcy5fdHJlZS5yZW5kZXJIZWlnaHQgPj0gdGhpcy5fdHJlZS5zY3JvbGxIZWlnaHQgLSAyO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBsYXN0IGl0ZW0gaW4gdGhlIGxpc3QuXG5cdCAqL1xuXHRnZXQgbGFzdEl0ZW0oKTogQ2hhdFRyZWVJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbGFzdEl0ZW07XG5cdH1cblxuXG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiBJQ2hhdExpc3RXaWRnZXRPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQ2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdmlld01vZGVsID0gb3B0aW9ucy52aWV3TW9kZWw7XG5cdFx0dGhpcy5fbG9jYXRpb24gPSBvcHRpb25zLmxvY2F0aW9uO1xuXHRcdHRoaXMuX2dldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucyA9IG9wdGlvbnMuZ2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zO1xuXHRcdHRoaXMuX2dldEN1cnJlbnRNb2RlSW5mbyA9IG9wdGlvbnMuZ2V0Q3VycmVudE1vZGVJbmZvO1xuXHRcdHRoaXMuX2xhc3RJdGVtSWRDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmxhc3RJdGVtSWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblxuXHRcdC8vIFRvZ2dsZSBsaW5rLXN0eWxlIGZvciBpbmxpbmUgcmVmZXJlbmNlIHdpZGdldHMgYmFzZWQgb24gY29uZmlndXJhdGlvbiAoc2luZ2xlIGxpc3RlbmVyIGZvciBhbGwgd2lkZ2V0cylcblx0XHRjb25zdCB1cGRhdGVJbmxpbmVSZWZlcmVuY2VzU3R5bGUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdHlsZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5JbmxpbmVSZWZlcmVuY2VzU3R5bGUpO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtaW5saW5lLXJlZmVyZW5jZXMtbGluay1zdHlsZScsIHN0eWxlID09PSAnbGluaycpO1xuXHRcdH07XG5cdFx0dXBkYXRlSW5saW5lUmVmZXJlbmNlc1N0eWxlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5JbmxpbmVSZWZlcmVuY2VzU3R5bGUpKSB7XG5cdFx0XHRcdHVwZGF0ZUlubGluZVJlZmVyZW5jZXNTdHlsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChcblx0XHRcdG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlXSlcblx0XHQpKTtcblxuXHRcdC8vIENyZWF0ZSBvdmVyZmxvdyB3aWRnZXRzIGNvbnRhaW5lclxuXHRcdGNvbnN0IG92ZXJmbG93V2lkZ2V0c0NvbnRhaW5lciA9IG9wdGlvbnMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSA/PyBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRpZiAoIW9wdGlvbnMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSkge1xuXHRcdFx0b3ZlcmZsb3dXaWRnZXRzQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtb3ZlcmZsb3ctd2lkZ2V0LWNvbnRhaW5lcicsICdtb25hY28tZWRpdG9yJyk7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kKG92ZXJmbG93V2lkZ2V0c0NvbnRhaW5lcik7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gb3ZlcmZsb3dXaWRnZXRzQ29udGFpbmVyLnJlbW92ZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGVkaXRvciBvcHRpb25zICh1c2UgcHJvdmlkZWQgb3IgY3JlYXRlIG5ldylcblx0XHRjb25zdCBlZGl0b3JPcHRpb25zID0gb3B0aW9ucy5lZGl0b3JPcHRpb25zID8/IHRoaXMuX3JlZ2lzdGVyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdEVkaXRvck9wdGlvbnMsXG5cdFx0XHRvcHRpb25zLnZpZXdJZCxcblx0XHRcdCdmb3JlZ3JvdW5kJyxcblx0XHRcdG9wdGlvbnMuaW5wdXRFZGl0b3JCYWNrZ3JvdW5kID8/ICdjaGF0LnJlcXVlc3RFZGl0b3IuYmFja2dyb3VuZCcsXG5cdFx0XHRvcHRpb25zLnJlc3VsdEVkaXRvckJhY2tncm91bmQgPz8gJ2NoYXQucmVzcG9uc2VFZGl0b3IuYmFja2dyb3VuZCdcblx0XHQpKTtcblxuXHRcdC8vIENyZWF0ZSBkZWxlZ2F0ZVxuXHRcdHRoaXMuX2RlbGVnYXRlID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0TGlzdERlbGVnYXRlLFxuXHRcdFx0b3B0aW9ucy5kZWZhdWx0RWxlbWVudEhlaWdodCA/PyAyMDBcblx0XHQpO1xuXG5cdFx0Ly8gQ3JlYXRlIHJlbmRlcmVyIGRlbGVnYXRlXG5cdFx0Y29uc3QgcmVuZGVyZXJEZWxlZ2F0ZTogSUNoYXRSZW5kZXJlckRlbGVnYXRlID0ge1xuXHRcdFx0Z2V0TGlzdExlbmd0aDogKCkgPT4gdGhpcy5fdHJlZS5nZXROb2RlKG51bGwpLnZpc2libGVDaGlsZHJlbkNvdW50LFxuXHRcdFx0b25EaWRTY3JvbGw6IHRoaXMub25EaWRTY3JvbGwsXG5cdFx0XHRjb250YWluZXI6IHRoaXMuX2NvbnRhaW5lcixcblx0XHRcdGN1cnJlbnRDaGF0TW9kZTogb3B0aW9ucy5jdXJyZW50Q2hhdE1vZGUgPz8gKCgpID0+IENoYXRNb2RlS2luZC5Bc2spLFxuXHRcdH07XG5cblx0XHQvLyBDcmVhdGUgcmVuZGVyZXJcblx0XHR0aGlzLl9yZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RJdGVtUmVuZGVyZXIsXG5cdFx0XHRlZGl0b3JPcHRpb25zLFxuXHRcdFx0b3B0aW9ucy5yZW5kZXJlck9wdGlvbnMgPz8ge30sXG5cdFx0XHRyZW5kZXJlckRlbGVnYXRlLFxuXHRcdFx0b3ZlcmZsb3dXaWRnZXRzQ29udGFpbmVyLFxuXHRcdFx0dGhpcy5fdmlld01vZGVsLFxuXHRcdCkpO1xuXG5cdFx0Ly8gV2lyZSB1cCByZW5kZXJlciBldmVudHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW5kZXJlci5vbkRpZENsaWNrRm9sbG93dXAoaXRlbSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENsaWNrRm9sbG93dXAuZmlyZShpdGVtKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW5kZXJlci5vbkRpZENoYW5nZUl0ZW1IZWlnaHQoZSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVFbGVtZW50SGVpZ2h0KGUuZWxlbWVudCwgZS5oZWlnaHQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtSGVpZ2h0LmZpcmUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIHJlcnVuIHdpdGggYWdlbnQgb3IgY29tbWFuZCBkZXRlY3Rpb24gaW50ZXJuYWxseVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbmRlcmVyLm9uRGlkQ2xpY2tSZXJ1bldpdGhBZ2VudE9yQ29tbWFuZERldGVjdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oZS5zZXNzaW9uUmVzb3VyY2UpPy5nZXRSZXF1ZXN0cygpLmZpbmQoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5pZCA9PT0gZS5yZXF1ZXN0SWQpO1xuXHRcdFx0aWYgKHJlcXVlc3QpIHtcblx0XHRcdFx0Y29uc3Qgc2VuZE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0XHRcdG5vQ29tbWFuZERldGVjdGlvbjogdHJ1ZSxcblx0XHRcdFx0XHRhdHRlbXB0OiByZXF1ZXN0LmF0dGVtcHQgKyAxLFxuXHRcdFx0XHRcdGxvY2F0aW9uOiB0aGlzLl9sb2NhdGlvbixcblx0XHRcdFx0XHQuLi50aGlzLl9nZXRTZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnM/LigpLFxuXHRcdFx0XHRcdG1vZGVJbmZvOiB0aGlzLl9nZXRDdXJyZW50TW9kZUluZm8/LigpLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLmNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZS5hY2NlcHRSZXF1ZXN0KGUuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5jaGF0U2VydmljZS5yZXNlbmRSZXF1ZXN0KHJlcXVlc3QsIHNlbmRPcHRpb25zKS5jYXRjaChlID0+IHRoaXMubG9nU2VydmljZS5lcnJvcignRkFJTEVEIHRvIHJlcnVuIHJlcXVlc3QnLCBlKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIGRyYWctYW5kLWRyb3AgY29udHJvbGxlciBmb3IgcmVvcmRlcmluZyBwZW5kaW5nIHJlcXVlc3RzXG5cdFx0dGhpcy5fcmVuZGVyZXIucGVuZGluZ0RyYWdDb250cm9sbGVyID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UGVuZGluZ0RyYWdDb250cm9sbGVyLCB0aGlzLl9jb250YWluZXIsICgpID0+IHRoaXMuX3ZpZXdNb2RlbClcblx0XHQpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRyZWVcblx0XHRjb25zdCBzdHlsZXMgPSBvcHRpb25zLnN0eWxlcyA/PyB7fTtcblx0XHR0aGlzLl90cmVlID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hPYmplY3RUcmVlPENoYXRUcmVlSXRlbSwgRnV6enlTY29yZT4sXG5cdFx0XHQnQ2hhdExpc3QnLFxuXHRcdFx0dGhpcy5fY29udGFpbmVyLFxuXHRcdFx0dGhpcy5fZGVsZWdhdGUsXG5cdFx0XHRbdGhpcy5fcmVuZGVyZXJdLFxuXHRcdFx0e1xuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7IGdldElkOiAoZTogQ2hhdFRyZWVJdGVtKSA9PiBlLmlkIH0sXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnREeW5hbWljSGVpZ2h0czogdHJ1ZSxcblx0XHRcdFx0aGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50czogdHJ1ZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXIpLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlOiBDaGF0VHJlZUl0ZW0pID0+XG5cdFx0XHRcdFx0XHRpc1JlcXVlc3RWTShlKSA/IGUubWVzc2FnZSA6IGlzUmVzcG9uc2VWTShlKSA/IGUucmVzcG9uc2UudmFsdWUgOiAnJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0c2Nyb2xsVG9BY3RpdmVFbGVtZW50OiB0cnVlLFxuXHRcdFx0XHRmaWx0ZXI6IG9wdGlvbnMuZmlsdGVyLFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczoge1xuXHRcdFx0XHRcdGxpc3RGb2N1c0JhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZDogc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEhvdmVyQmFja2dyb3VuZDogc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdFx0bGlzdEZvY3VzRm9yZWdyb3VuZDogc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLFxuXHRcdFx0XHRcdGxpc3RIb3ZlckZvcmVncm91bmQ6IHN0eWxlcy5saXN0Rm9yZWdyb3VuZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0ZvcmVncm91bmQ6IHN0eWxlcy5saXN0Rm9yZWdyb3VuZCxcblx0XHRcdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQ6IHN0eWxlcy5saXN0Rm9yZWdyb3VuZCxcblx0XHRcdFx0XHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bGlzdEluYWN0aXZlU2VsZWN0aW9uSWNvbkZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHNjcm9sbC1kb3duIGJ1dHRvblxuXHRcdHRoaXMuX3Njcm9sbERvd25CdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuX2NvbnRhaW5lciwge1xuXHRcdFx0YnV0dG9uQmFja2dyb3VuZDogYXNDc3NWYXJpYWJsZShidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kKSxcblx0XHRcdGJ1dHRvbkZvcmVncm91bmQ6IGFzQ3NzVmFyaWFibGUoYnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZCksXG5cdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6IGFzQ3NzVmFyaWFibGUoYnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kKSxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2VwYXJhdG9yOiB1bmRlZmluZWQsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3Njcm9sbERvd25CdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGF0LXNjcm9sbC1kb3duJyk7XG5cdFx0dGhpcy5fc2Nyb2xsRG93bkJ1dHRvbi5sYWJlbCA9IGAkKCR7Q29kaWNvbi5jaGV2cm9uRG93bi5pZH0pYDtcblx0XHR0aGlzLl9zY3JvbGxEb3duQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJzsgLy8gSGlkZGVuIGJ5IGRlZmF1bHRcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njcm9sbERvd25CdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR0aGlzLmNhbmNlbFVzZXJUb2dnbGVTY3JvbGxSZXN0b3JhdGlvbigpO1xuXHRcdFx0dGhpcy5zZXRTY3JvbGxMb2NrKHRydWUpO1xuXHRcdFx0dGhpcy5zY3JvbGxUb0VuZCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdpcmUgdXAgdHJlZSBldmVudHNcblxuXHRcdC8vIEhhbmRsZSBjb250ZW50IGhlaWdodCBjaGFuZ2VzIChmaXJlcyBoaWdoLWxldmVsIGV2ZW50LCBpbnRlcm5hbCBzY3JvbGwgaGFuZGxpbmcpXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0LmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGZvY3VzIGNoYW5nZXMgaW50ZXJuYWxseSAodXBkYXRlIG1vc3RSZWNlbnRseUZvY3VzZWRJdGVtSW5kZXgpXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHtcblx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoZm9jdXNlZCAmJiBmb2N1c2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZEl0ZW0gPSBmb2N1c2VkWzBdO1xuXHRcdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuZ2V0SXRlbXMoKTtcblx0XHRcdFx0Y29uc3QgaWR4ID0gaXRlbXMuZmluZEluZGV4KGkgPT4gaSA9PT0gZm9jdXNlZEl0ZW0pO1xuXHRcdFx0XHRpZiAoaWR4ICE9PSAtMSkge1xuXHRcdFx0XHRcdHRoaXMuX21vc3RSZWNlbnRseUZvY3VzZWRJdGVtSW5kZXggPSBpZHg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgc2Nyb2xsIGV2ZW50cyAoZmlyZSBwdWJsaWMgZXZlbnQgYW5kIG1hbmFnZSBzY3JvbGwtZG93biBidXR0b24pXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkRpZFNjcm9sbCgoZSkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRTY3JvbGwuZmlyZShlKTtcblx0XHRcdHRoaXMudXBkYXRlU2Nyb2xsRG93bkJ1dHRvblZpc2liaWxpdHkoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCBhdC1ib3R0b20gc3RhdGUgKHNjcm9sbExvY2sgZGVmYXVsdHMgdG8gdHJ1ZSlcblx0XHR0aGlzLnVwZGF0ZVNjcm9sbERvd25CdXR0b25WaXNpYmlsaXR5KCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NvbnRhaW5lciwgQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCBlID0+IHtcblx0XHRcdGlmICghZG9tLmlzSFRNTEVsZW1lbnQoZS50YXJnZXQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuX3JlbmRlcmVyLmdldEVsZW1lbnRGcm9tTm9kZShlLnRhcmdldCk7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnRyYWNrVXNlclRvZ2dsZVJlc2l6ZShlbGVtZW50LCBlLnRhcmdldCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY29udGFpbmVyLCBkb20uRXZlbnRUeXBlLldIRUVMLCAoKSA9PiB0aGlzLmNhbmNlbFVzZXJUb2dnbGVTY3JvbGxSZXN0b3JhdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIGRvbS5FdmVudFR5cGUuUE9JTlRFUl9ET1dOLCAoKSA9PiB0aGlzLmNhbmNlbFVzZXJUb2dnbGVTY3JvbGxSZXN0b3JhdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3Qga2V5Q29kZSA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkua2V5Q29kZTtcblx0XHRcdGlmIChrZXlDb2RlID09PSBLZXlDb2RlLlVwQXJyb3dcblx0XHRcdFx0fHwga2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3dcblx0XHRcdFx0fHwga2V5Q29kZSA9PT0gS2V5Q29kZS5QYWdlVXBcblx0XHRcdFx0fHwga2V5Q29kZSA9PT0gS2V5Q29kZS5QYWdlRG93blxuXHRcdFx0XHR8fCBrZXlDb2RlID09PSBLZXlDb2RlLkhvbWVcblx0XHRcdFx0fHwga2V5Q29kZSA9PT0gS2V5Q29kZS5FbmQpIHtcblx0XHRcdFx0dGhpcy5jYW5jZWxVc2VyVG9nZ2xlU2Nyb2xsUmVzdG9yYXRpb24oKTtcblx0XHRcdH1cblx0XHR9LCB0cnVlKSk7XG5cblx0XHQvLyBIYW5kbGUgY29udGV4dCBtZW51IGludGVybmFsbHlcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB7XG5cdFx0XHR0aGlzLmhhbmRsZUNvbnRleHRNZW51KGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FZGl0UmVxdWVzdHMpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ2hlY2twb2ludHNFbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLl9zZXR0aW5nQ2hhbmdlQ291bnRlcisrO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyNyZWdpb24gSW50ZXJuYWwgZXZlbnQgaGFuZGxlcnNcblxuXHQvKipcblx0ICogVXBkYXRlIHNjcm9sbC1kb3duIGJ1dHRvbiB2aXNpYmlsaXR5IGJhc2VkIG9uIHNjcm9sbCBwb3NpdGlvbiBhbmQgc2Nyb2xsIGxvY2suXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZVNjcm9sbERvd25CdXR0b25WaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgc2hvd0J1dHRvbiwgYXRCb3R0b20gfSA9IGNvbXB1dGVTY3JvbGxEb3duU3RhdGUodGhpcy5pc1Njcm9sbGVkVG9Cb3R0b20sIHRoaXMuX3Njcm9sbExvY2spO1xuXHRcdC8vIFVzZSBhbiBleHBsaWNpdCBgZmxleGAgKHRoZSBgLm1vbmFjby1idXR0b25gIGRlZmF1bHQpIHJhdGhlciB0aGFuICcnIHdoZW4gc2hvd2luZzogdGhlXG5cdFx0Ly8gc3R5bGVzaGVldCBhcHBsaWVzIGBkaXNwbGF5OiBub25lYCB0byBgLmludGVyYWN0aXZlLXNlc3Npb24gLmNoYXQtc2Nyb2xsLWRvd25gLCBzbyBjbGVhcmluZ1xuXHRcdC8vIHRoZSBpbmxpbmUgc3R5bGUgd291bGQgbGV0IHRoYXQgcnVsZSB3aW4gYW5kIGtlZXAgdGhlIGJ1dHRvbiBoaWRkZW4uXG5cdFx0dGhpcy5fc2Nyb2xsRG93bkJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBzaG93QnV0dG9uID8gJ2ZsZXgnIDogJ25vbmUnO1xuXHRcdHRoaXMuX2NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LWxpc3QtYXQtYm90dG9tJywgYXRCb3R0b20pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBjb250ZXh0IG1lbnUgZXZlbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBoYW5kbGVDb250ZXh0TWVudShlOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8Q2hhdFRyZWVJdGVtIHwgbnVsbD4pOiB2b2lkIHtcblx0XHRlLmJyb3dzZXJFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuYnJvd3NlckV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBlLmVsZW1lbnQ7XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgY29udGV4dCBtZW51IHdhcyBvcGVuZWQgb24gYSBLYVRlWCBlbGVtZW50XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdGNvbnN0IGlzS2F0ZXhFbGVtZW50ID0gdGFyZ2V0LmNsb3Nlc3QoYC4ke2thdGV4Q29udGFpbmVyQ2xhc3NOYW1lfWApICE9PSBudWxsO1xuXG5cdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0W0NoYXRDb250ZXh0S2V5cy5pc1Jlc3BvbnNlLmtleSwgaXNSZXNwb25zZVZNKHNlbGVjdGVkKV0sXG5cdFx0XHRbQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlSXNGaWx0ZXJlZC5rZXksIGlzUmVzcG9uc2VWTShzZWxlY3RlZCkgJiYgISFzZWxlY3RlZC5lcnJvckRldGFpbHM/LnJlc3BvbnNlSXNGaWx0ZXJlZF0sXG5cdFx0XHRbQ2hhdENvbnRleHRLZXlzLmlzS2F0ZXhNYXRoRWxlbWVudC5rZXksIGlzS2F0ZXhFbGVtZW50XVxuXHRcdF0pO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRtZW51SWQ6IE1lbnVJZC5DaGF0Q29udGV4dCxcblx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IHNlbGVjdGVkLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFZpZXdNb2RlbCBtZXRob2RzXG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdmlldyBtb2RlbCBmb3IgdGhlIGxpc3QgdG8gcmVuZGVyLlxuXHQgKi9cblx0c2V0Vmlld01vZGVsKHZpZXdNb2RlbDogSUNoYXRWaWV3TW9kZWwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl92aWV3TW9kZWwgPSB2aWV3TW9kZWw7XG5cdFx0dGhpcy5fcmVuZGVyZXIudXBkYXRlVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVmcmVzaCB0aGUgbGlzdCBmcm9tIHRoZSBjdXJyZW50IHZpZXcgbW9kZWwuXG5cdCAqIFVzZXMgaW50ZXJuYWwgc3RhdGUgZm9yIGRpZmYgaWRlbnRpdHkgY2FsY3VsYXRpb24uXG5cdCAqL1xuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLl90cmVlLnNldENoaWxkcmVuKG51bGwsIFtdKTtcblx0XHRcdHRoaXMuX2xhc3RJdGVtID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fbGFzdEl0ZW1JZENvbnRleHRLZXkuc2V0KFtdKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX3ZpZXdNb2RlbC5nZXRJdGVtcygpO1xuXHRcdHRoaXMuX2xhc3RJdGVtID0gaXRlbXMuYXQoLTEpO1xuXHRcdHRoaXMuX2xhc3RJdGVtSWRDb250ZXh0S2V5LnNldCh0aGlzLl9sYXN0SXRlbSA/IFt0aGlzLl9sYXN0SXRlbS5pZF0gOiBbXSk7XG5cblx0XHRjb25zdCB0cmVlSXRlbXM6IElUcmVlRWxlbWVudDxDaGF0VHJlZUl0ZW0+W10gPSBpdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0ZWxlbWVudDogaXRlbSxcblx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRjb2xsYXBzaWJsZTogZmFsc2UsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZWRpdGluZyA9IHRoaXMuX3ZpZXdNb2RlbC5lZGl0aW5nO1xuXG5cdFx0dGhpcy5fd2l0aFBlcnNpc3RlZEF1dG9TY3JvbGwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdHJlZS5zZXRDaGlsZHJlbihudWxsLCB0cmVlSXRlbXMsIHtcblx0XHRcdFx0ZGlmZklkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogKGVsZW1lbnQpID0+IHtcblx0XHRcdFx0XHRcdC8vIFBlbmRpbmcgdHlwZXMgb25seSBoYXZlICdpZCcsIHJlcXVlc3QvcmVzcG9uc2UgaGF2ZSAnZGF0YUlkJ1xuXHRcdFx0XHRcdFx0Y29uc3QgYmFzZUlkID0gKGlzUmVxdWVzdFZNKGVsZW1lbnQpIHx8IGlzUmVzcG9uc2VWTShlbGVtZW50KSkgPyBlbGVtZW50LmRhdGFJZCA6IGVsZW1lbnQuaWQ7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNhYmxlbWVudCA9IChpc1JlcXVlc3RWTShlbGVtZW50KSB8fCBpc1Jlc3BvbnNlVk0oZWxlbWVudCkpID8gZWxlbWVudC5zaG91bGRCZVJlbW92ZWRPblNlbmQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHQvLyBQZXItZWxlbWVudCBlZGl0aW5nIHN0YXRlOiBvbmx5IHJlLXJlbmRlciBpdGVtcyB3aG9zZSBlZGl0aW5nIHJvbGUgY2hhbmdlZFxuXHRcdFx0XHRcdFx0Y29uc3QgaXNFZGl0VGFyZ2V0ID0gaXNSZXF1ZXN0Vk0oZWxlbWVudCkgJiYgZWRpdGluZz8uaWQgPT09IGVsZW1lbnQuaWQ7XG5cdFx0XHRcdFx0XHRjb25zdCBpc0Jsb2NrZWQgPSAoaXNSZXF1ZXN0Vk0oZWxlbWVudCkgfHwgaXNSZXNwb25zZVZNKGVsZW1lbnQpKSA/IGVsZW1lbnQuc2hvdWxkQmVCbG9ja2VkLmdldCgpIDogZmFsc2U7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYmFzZUlkICtcblx0XHRcdFx0XHRcdFx0Ly8gSWYgYSByZXNwb25zZSBpcyBpbiB0aGUgcHJvY2VzcyBvZiBwcm9ncmVzc2l2ZSByZW5kZXJpbmcsIHdlIG5lZWQgdG8gZW5zdXJlIHRoYXQgaXQgd2lsbFxuXHRcdFx0XHRcdFx0XHQvLyBiZSByZS1yZW5kZXJlZCBzbyBwcm9ncmVzc2l2ZSByZW5kZXJpbmcgaXMgcmVzdGFydGVkLCBldmVuIGlmIHRoZSBtb2RlbCB3YXNuJ3QgdXBkYXRlZC5cblx0XHRcdFx0XHRcdFx0YCR7aXNSZXNwb25zZVZNKGVsZW1lbnQpICYmIGVsZW1lbnQucmVuZGVyRGF0YSA/IGBfJHt0aGlzLl92aXNpYmxlQ2hhbmdlQ291bnR9YCA6ICcnfWAgK1xuXHRcdFx0XHRcdFx0XHQvLyBSZS1yZW5kZXIgb25jZSBjb250ZW50IHJlZmVyZW5jZXMgYXJlIGxvYWRlZFxuXHRcdFx0XHRcdFx0XHQoaXNSZXNwb25zZVZNKGVsZW1lbnQpID8gYF8ke2VsZW1lbnQuY29udGVudFJlZmVyZW5jZXMubGVuZ3RofWAgOiAnJykgK1xuXHRcdFx0XHRcdFx0XHQvLyBSZS1yZW5kZXIgaWYgZWxlbWVudCBiZWNvbWVzIGhpZGRlbiBkdWUgdG8gdW5kby9yZWRvXG5cdFx0XHRcdFx0XHRcdGBfJHtkaXNhYmxlbWVudCA/IGAke2Rpc2FibGVtZW50LmFmdGVyVW5kb1N0b3AgfHwgJzEnfWAgOiAnMCd9YCArXG5cdFx0XHRcdFx0XHRcdC8vIFJlLXJlbmRlciB0aGUgcmVxdWVzdCBiZWluZyBlZGl0ZWQgYW5kIHJlcXVlc3RzIHdob3NlIGJsb2NrZWQgc3RhdGUgY2hhbmdlZFxuXHRcdFx0XHRcdFx0XHRgXyR7aXNFZGl0VGFyZ2V0ID8gJ2VkaXQnIDogJyd9YCArXG5cdFx0XHRcdFx0XHRcdGBfJHtpc0Jsb2NrZWQgPyAnYmxvY2tlZCcgOiAnJ31gICtcblx0XHRcdFx0XHRcdFx0Ly8gUmUtcmVuZGVyIHJlcXVlc3RzIHdoZW4gZWRpdGluZyBzdGFydHMvc3RvcHMgKGZvciBob3ZlciBidXR0b24gdmlzaWJpbGl0eSwgY2xpY2sgaGFuZGxlcnMpXG5cdFx0XHRcdFx0XHRcdChpc1JlcXVlc3RWTShlbGVtZW50KSA/IGBfJHtlZGl0aW5nID8gJzEnIDogJzAnfWAgOiAnJykgK1xuXHRcdFx0XHRcdFx0XHQvLyBSZS1yZW5kZXIgYWxsIGlmIGludm9rZWQgYnkgc2V0dGluZyBjaGFuZ2Vcblx0XHRcdFx0XHRcdFx0YF9zZXR0aW5nJHt0aGlzLl9zZXR0aW5nQ2hhbmdlQ291bnRlcn1gICtcblx0XHRcdFx0XHRcdFx0Ly8gUmVyZW5kZXIgcmVxdWVzdCBpZiB3ZSBnb3QgbmV3IGNvbnRlbnQgcmVmZXJlbmNlcyBpbiB0aGUgcmVzcG9uc2Vcblx0XHRcdFx0XHRcdFx0Ly8gc2luY2UgdGhpcyBtYXkgY2hhbmdlIGhvdyB3ZSByZW5kZXIgdGhlIGNvcnJlc3BvbmRpbmcgYXR0YWNobWVudHMgaW4gdGhlIHJlcXVlc3Rcblx0XHRcdFx0XHRcdFx0KGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmIGVsZW1lbnQuY29udGVudFJlZmVyZW5jZXMgPyBgXyR7ZWxlbWVudC5jb250ZW50UmVmZXJlbmNlcz8ubGVuZ3RofWAgOiAnJyk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHNjcm9sbCBsb2NrIHN0YXRlLlxuXHQgKi9cblx0c2V0U2Nyb2xsTG9jayh2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Njcm9sbExvY2sgPSB2YWx1ZTtcblx0XHR0aGlzLnVwZGF0ZVNjcm9sbERvd25CdXR0b25WaXNpYmlsaXR5KCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHNjcm9sbCBsb2NrIHN0YXRlLlxuXHQgKi9cblx0Z2V0IHNjcm9sbExvY2soKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Njcm9sbExvY2s7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSB2aXNpYmxlIGNoYW5nZSBjb3VudCAoZm9yIGRpZmYgaWRlbnRpdHkpLlxuXHQgKi9cblx0c2V0VmlzaWJsZUNoYW5nZUNvdW50KHZhbHVlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlQ2hhbmdlQ291bnQgPSB2YWx1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTY3JvbGwgdG8gcmV2ZWFsIGFuIGVsZW1lbnQgaWYgZWRpdGluZy5cblx0ICovXG5cdHNjcm9sbFRvQ3VycmVudEl0ZW0oY3VycmVudEVsZW1lbnQ6IElDaGF0UmVxdWVzdFZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdmlld01vZGVsPy5lZGl0aW5nIHx8ICFjdXJyZW50RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3RyZWUuaGFzRWxlbWVudChjdXJyZW50RWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmVsYXRpdmVUb3AgPSB0aGlzLl90cmVlLmdldFJlbGF0aXZlVG9wKGN1cnJlbnRFbGVtZW50KTtcblx0XHRpZiAocmVsYXRpdmVUb3AgPT09IG51bGwgfHwgcmVsYXRpdmVUb3AgPCAwIHx8IHJlbGF0aXZlVG9wID4gMSkge1xuXHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoY3VycmVudEVsZW1lbnQsIDApO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBUcmVlIG1ldGhvZHNcblxuXHQvKipcblx0ICogUmVyZW5kZXIgdGhlIHRyZWUuXG5cdCAqL1xuXHRyZXJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlLnJlcmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEl0ZW1zKCk6IENoYXRUcmVlSXRlbVtdIHtcblx0XHRjb25zdCBpdGVtczogQ2hhdFRyZWVJdGVtW10gPSBbXTtcblx0XHRjb25zdCByb290ID0gdGhpcy5fdHJlZS5nZXROb2RlKG51bGwpO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygcm9vdC5jaGlsZHJlbikge1xuXHRcdFx0aWYgKGNoaWxkLmVsZW1lbnQpIHtcblx0XHRcdFx0aXRlbXMucHVzaChjaGlsZC5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cblxuXHQvKipcblx0ICogRGVsZWdhdGUgc2Nyb2xsIGV2ZW50cyBmcm9tIGEgbW91c2Ugd2hlZWwgZXZlbnQgdG8gdGhlIHRyZWUuXG5cdCAqL1xuXHRkZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoZXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNhbmNlbFVzZXJUb2dnbGVTY3JvbGxSZXN0b3JhdGlvbigpO1xuXHRcdHRoaXMuX3RyZWUuZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGV2ZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSB0cmVlIGhhcyBhIHNwZWNpZmljIGVsZW1lbnQuXG5cdCAqL1xuXHRoYXNFbGVtZW50KGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLmhhc0VsZW1lbnQoZWxlbWVudCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBoZWlnaHQgb2YgYW4gZWxlbWVudC5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUVsZW1lbnRIZWlnaHQoZWxlbWVudDogQ2hhdFRyZWVJdGVtLCBoZWlnaHQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdHJlZS5oYXNFbGVtZW50KGVsZW1lbnQpICYmIHRoaXMuX3Zpc2libGUpIHtcblx0XHRcdGNvbnN0IHVzZXJUb2dnbGVSZXNpemVUcmFja2VyID0gdGhpcy5fdXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXJzLmdldChlbGVtZW50KTtcblx0XHRcdGlmICh1c2VyVG9nZ2xlUmVzaXplVHJhY2tlcikge1xuXHRcdFx0XHR0aGlzLl90cmVlLnVwZGF0ZUVsZW1lbnRIZWlnaHQoZWxlbWVudCwgaGVpZ2h0KTtcblx0XHRcdFx0dXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXIucmVzdG9yZVNjcm9sbEFuY2hvcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93aXRoUGVyc2lzdGVkQXV0b1Njcm9sbCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3RyZWUudXBkYXRlRWxlbWVudEhlaWdodChlbGVtZW50LCBoZWlnaHQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cmFja1VzZXJUb2dnbGVSZXNpemUoZWxlbWVudDogQ2hhdFRyZWVJdGVtLCB0YXJnZXQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgYW5jaG9yVGFyZ2V0VG9wID0gdGhpcy5pc1Njcm9sbGVkVG9Cb3R0b20gPyB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlc3RvcmVTY3JvbGxQb3NpdGlvbiA9IGFuY2hvclRhcmdldFRvcCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogKCkgPT4ge1xuXHRcdFx0aWYgKHRhcmdldC5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0XHR0aGlzLl90cmVlLnNjcm9sbFRvcCA9IGdldEFuY2hvcmVkU2Nyb2xsVG9wKHRoaXMuX3RyZWUuc2Nyb2xsVG9wLCB0YXJnZXQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkudG9wLCBhbmNob3JUYXJnZXRUb3ApO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdHJhY2tlcjogVXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXIgPSBuZXcgVXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXIodGFyZ2V0LCByZXN0b3JlU2Nyb2xsUG9zaXRpb24sICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl91c2VyVG9nZ2xlUmVzaXplVHJhY2tlcnMuZ2V0KGVsZW1lbnQpID09PSB0cmFja2VyKSB7XG5cdFx0XHRcdHRoaXMuX3VzZXJUb2dnbGVSZXNpemVUcmFja2Vycy5kZWxldGVBbmREaXNwb3NlKGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3VzZXJUb2dnbGVSZXNpemVUcmFja2Vycy5zZXQoZWxlbWVudCwgdHJhY2tlcik7XG5cdH1cblxuXHRwcml2YXRlIGNhbmNlbFVzZXJUb2dnbGVTY3JvbGxSZXN0b3JhdGlvbigpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHRyYWNrZXIgb2YgdGhpcy5fdXNlclRvZ2dsZVJlc2l6ZVRyYWNrZXJzLnZhbHVlcygpKSB7XG5cdFx0XHR0cmFja2VyLmNhbmNlbFNjcm9sbFJlc3RvcmF0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNjcm9sbCB0byByZXZlYWwgYW4gZWxlbWVudC5cblx0ICovXG5cdHJldmVhbChlbGVtZW50OiBDaGF0VHJlZUl0ZW0sIHJlbGF0aXZlVG9wPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZS5yZXZlYWwoZWxlbWVudCwgcmVsYXRpdmVUb3ApO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSB0b3Agb2Zmc2V0IG9mIGFuIGVsZW1lbnQgaW4gdHJhbnNjcmlwdCBjb250ZW50IHNwYWNlIChzYW1lIHNwYWNlIGFzXG5cdCAqIGBzY3JvbGxUb3BgL2BzY3JvbGxIZWlnaHRgKSwgb3IgYHVuZGVmaW5lZGAgaWYgaXQgaXMgbm90IGluIHRoZSBsaXN0LiBSZWFkc1xuXHQgKiB0aGUgbGF5b3V0IGhlaWdodCBtb2RlbCwgc28gaXQgYWxzbyByZXNvbHZlcyBvZmYtc2NyZWVuIGVsZW1lbnRzLlxuXHQgKi9cblx0Z2V0RWxlbWVudFRvcChlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fdHJlZS5oYXNFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5nZXRFbGVtZW50VG9wKGVsZW1lbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgZm9jdXNlZCBlbGVtZW50cy5cblx0ICovXG5cdGdldEZvY3VzKCk6IENoYXRUcmVlSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5nZXRGb2N1cygpLmZpbHRlcigoZSk6IGUgaXMgQ2hhdFRyZWVJdGVtID0+IGUgIT09IG51bGwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgZm9jdXNlZCBlbGVtZW50cy5cblx0ICovXG5cdHNldEZvY3VzKGVsZW1lbnRzOiBDaGF0VHJlZUl0ZW1bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoZWxlbWVudHMpO1xuXHR9XG5cblx0Zm9jdXNJdGVtKGl0ZW06IENoYXRUcmVlSXRlbSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5oYXNFbGVtZW50KGl0ZW0pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW2l0ZW1dKTtcblx0XHR0aGlzLl90cmVlLmRvbUZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXMgdGhlIGxhc3QgaXRlbSBpbiB0aGUgbGlzdC4gUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGZvY3VzZWQgaXRlbS5cblx0ICogQHBhcmFtIHVzZU1vc3RSZWNlbnRseUZvY3VzZWRJbmRleCBJZiB0cnVlLCB1c2UgdGhlIG1vc3RSZWNlbnRseUZvY3VzZWRJbmRleCBpZiB2YWxpZFxuXHQgKi9cblx0Zm9jdXNMYXN0SXRlbSh1c2VNb3N0UmVjZW50bHlGb2N1c2VkSW5kZXg/OiBib29sZWFuKTogbnVtYmVyIHtcblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuZ2V0SXRlbXMoKTtcblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0bGV0IGZvY3VzSW5kZXg6IG51bWJlcjtcblx0XHRpZiAodXNlTW9zdFJlY2VudGx5Rm9jdXNlZEluZGV4ICYmIHRoaXMuX21vc3RSZWNlbnRseUZvY3VzZWRJdGVtSW5kZXggPj0gMCAmJiB0aGlzLl9tb3N0UmVjZW50bHlGb2N1c2VkSXRlbUluZGV4IDwgaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRmb2N1c0luZGV4ID0gdGhpcy5fbW9zdFJlY2VudGx5Rm9jdXNlZEl0ZW1JbmRleDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9jdXNJbmRleCA9IGl0ZW1zLmxlbmd0aCAtIDE7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdHJlZS5zZXRGb2N1cyhbaXRlbXNbZm9jdXNJbmRleF1dKTtcblx0XHR0aGlzLl90cmVlLmRvbUZvY3VzKCk7XG5cdFx0cmV0dXJuIGZvY3VzSW5kZXg7XG5cdH1cblxuXHQvKipcblx0ICogU2Nyb2xsIHRoZSBsaXN0IHRvIHJldmVhbCB0aGUgbGFzdCBpdGVtLlxuXHQgKi9cblx0c2Nyb2xsVG9FbmQoKTogdm9pZCB7XG5cdFx0Ly8gUmV2ZWFsIHRoZSB0cmVlJ3MgYWN0dWFsIGxhc3Qgbm9kZSByYXRoZXIgdGhhbiB0aGUgaGVsZCBgX2xhc3RJdGVtYC4gYHJldmVhbGAgcmVsaWFibHlcblx0XHQvLyBzY3JvbGxzIGFsbCB0aGUgd2F5IGRvd24gZXZlbiB3aGlsZSBpdGVtIGhlaWdodHMgYXJlIHN0aWxsIHNldHRsaW5nIChzZWUgIzIzNDA4OSlcblx0XHRjb25zdCBsYXN0RWxlbWVudCA9IHRoaXMuX3RyZWUuZ2V0Tm9kZShudWxsKS5jaGlsZHJlbi5hdCgtMSk/LmVsZW1lbnQ7XG5cdFx0aWYgKGxhc3RFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBvZmZzZXQgPSBNYXRoLm1heChsYXN0RWxlbWVudC5jdXJyZW50UmVuZGVyZWRIZWlnaHQgPz8gMCwgMWU2KTtcblx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGxhc3RFbGVtZW50LCBvZmZzZXQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdXBwcmVzc2VzIGF1dG8tc2Nyb2xsaW5nIHRvIHRoZSBib3R0b20gdW50aWwgdGhlIHJldHVybmVkIGRpc3Bvc2FibGUgaXNcblx0ICogZGlzcG9zZWQuIEhvbGRzIGNvbXBvc2UsIHNvIHVucmVsYXRlZCBmZWF0dXJlcyAocmVxdWVzdCBlZGl0aW5nLCBhbiBvcGVuXG5cdCAqIHRleHQgc2VsZWN0aW9uKSBjYW4gc3VwcHJlc3MgY29uY3VycmVudGx5IHdpdGhvdXQgY2xvYmJlcmluZyBlYWNoIG90aGVyO1xuXHQgKiBhdXRvLXNjcm9sbCByZXN1bWVzIG9ubHkgb25jZSB0aGUgbGFzdCBob2xkIGlzIHJlbGVhc2VkLlxuXHQgKi9cblx0YWNxdWlyZUF1dG9TY3JvbGxIb2xkKCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5fYXV0b1Njcm9sbEhvbGRzLmFjcXVpcmUoKTtcblx0fVxuXG5cdC8qKiBXaGV0aGVyIGFueSB7QGxpbmsgYWNxdWlyZUF1dG9TY3JvbGxIb2xkfSBob2xkIGlzIGN1cnJlbnRseSBhY3RpdmUuICovXG5cdGdldCBpc0F1dG9TY3JvbGxIZWxkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9hdXRvU2Nyb2xsSG9sZHMuaXNIZWxkO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2l0aFBlcnNpc3RlZEF1dG9TY3JvbGwoZm46ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0F1dG9TY3JvbGxIZWxkKSB7XG5cdFx0XHRmbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB3YXNTY3JvbGxlZFRvQm90dG9tID0gdGhpcy5pc1Njcm9sbGVkVG9Cb3R0b207XG5cdFx0Zm4oKTtcblx0XHRpZiAod2FzU2Nyb2xsZWRUb0JvdHRvbSkge1xuXHRcdFx0dGhpcy5zY3JvbGxUb0VuZCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1cyB0aGUgbGlzdC5cblx0ICovXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIERPTSBmb2N1cyBzdGF0ZS5cblx0ICovXG5cdGlzRE9NRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5pc0RPTUZvY3VzZWQoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZW5kZXJlciBtZXRob2RzXG5cblx0LyoqXG5cdCAqIEdldCBjb2RlIGJsb2NrIGluZm8gZm9yIGEgcmVzcG9uc2UuXG5cdCAqL1xuXHRnZXRDb2RlQmxvY2tJbmZvc0ZvclJlc3BvbnNlKHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogSUNoYXRDb2RlQmxvY2tJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5nZXRDb2RlQmxvY2tJbmZvc0ZvclJlc3BvbnNlKHJlc3BvbnNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgY29kZSBibG9jayBpbmZvIGJ5IFVSSS5cblx0ICovXG5cdGdldENvZGVCbG9ja0luZm9Gb3JFZGl0b3IodXJpOiBVUkkpOiBJQ2hhdENvZGVCbG9ja0luZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5nZXRDb2RlQmxvY2tJbmZvRm9yRWRpdG9yKHVyaSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGZpbGUgdHJlZSBpbmZvIGZvciBhIHJlc3BvbnNlLlxuXHQgKi9cblx0Z2V0RmlsZVRyZWVJbmZvc0ZvclJlc3BvbnNlKHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogSUNoYXRGaWxlVHJlZUluZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVyLmdldEZpbGVUcmVlSW5mb3NGb3JSZXNwb25zZShyZXNwb25zZSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBsYXN0IGZvY3VzZWQgZmlsZSB0cmVlIGZvciBhIHJlc3BvbnNlLlxuXHQgKi9cblx0Z2V0TGFzdEZvY3VzZWRGaWxlVHJlZUZvclJlc3BvbnNlKHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogSUNoYXRGaWxlVHJlZUluZm8gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5nZXRMYXN0Rm9jdXNlZEZpbGVUcmVlRm9yUmVzcG9uc2UocmVzcG9uc2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBlZGl0b3JzIGN1cnJlbnRseSBpbiB1c2UuXG5cdCAqL1xuXHRlZGl0b3JzSW5Vc2UoKTogSXRlcmFibGU8Q29kZUJsb2NrUGFydD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5lZGl0b3JzSW5Vc2UoKTtcblx0fVxuXG5cblxuXHQvKipcblx0ICogR2V0IHRlbXBsYXRlIGRhdGEgZm9yIGEgcmVxdWVzdCBJRC5cblx0ICovXG5cdGdldFRlbXBsYXRlRGF0YUZvclJlcXVlc3RJZChyZXF1ZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyZXF1ZXN0SWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5nZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQocmVxdWVzdElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgcmVuZGVyZWQgY2hhdCBpdGVtIGNvbnRhaW5pbmcgdGhlIG5vZGUuXG5cdCAqL1xuXHRnZXRFbGVtZW50RnJvbU5vZGUobm9kZTogSFRNTEVsZW1lbnQpOiBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlci5nZXRFbGVtZW50RnJvbU5vZGUobm9kZSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHJlbmRlcmVyIG9wdGlvbnMuXG5cdCAqL1xuXHR1cGRhdGVSZW5kZXJlck9wdGlvbnMob3B0aW9uczogSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVyLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBsaXN0L3RyZWUgY29sb3Igb3ZlcnJpZGVzLiBSZS1hcHBsaWVzIHRoZSBzYW1lIGZhbi1vdXQgZnJvbVxuXHQgKiBgbGlzdEJhY2tncm91bmRgL2BsaXN0Rm9yZWdyb3VuZGAgdG8gYWxsIGludGVyYWN0aW9uIHN0YXRlcyB0aGF0IHdhc1xuXHQgKiBvcmlnaW5hbGx5IGNvbmZpZ3VyZWQgYXQgY29uc3RydWN0aW9uIHRpbWUuXG5cdCAqL1xuXHRzZXRTdHlsZXMoc3R5bGVzOiBJQ2hhdExpc3RXaWRnZXRTdHlsZXMpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0bGlzdEZvY3VzQmFja2dyb3VuZDogc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZDogc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHRcdGxpc3RIb3ZlckJhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IHN0eWxlcy5saXN0QmFja2dyb3VuZCxcblx0XHRcdFx0bGlzdEZvY3VzRm9yZWdyb3VuZDogc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLFxuXHRcdFx0XHRsaXN0SG92ZXJGb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdGxpc3RJbmFjdGl2ZUZvY3VzRm9yZWdyb3VuZDogc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLFxuXHRcdFx0XHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkZvcmVncm91bmQ6IHN0eWxlcy5saXN0Rm9yZWdyb3VuZCxcblx0XHRcdFx0bGlzdEFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0IHRoZSB2aXNpYmlsaXR5IG9mIHRoZSBsaXN0LlxuXHQgKi9cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZSA9IHZpc2libGU7XG5cdFx0dGhpcy5fcmVuZGVyZXIuc2V0VmlzaWJsZSh2aXNpYmxlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIGxpc3QuXG5cdCAqL1xuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLl9yZW5kZXJlci5sYXlvdXQod2lkdGggPz8gdGhpcy5fY29udGFpbmVyLmNsaWVudFdpZHRoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGNBQWM7QUFFdkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxlQUE0QixtQkFBbUIsb0JBQW9CO0FBR3hGLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlLDJCQUEyQiwyQkFBMkIsc0NBQXNDO0FBQ3BILFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQWlELG9CQUFvQjtBQUNyRSxTQUE0QixtQkFBbUIsb0JBQW9CO0FBRW5FLFNBQXdFLGFBQWEsb0JBQW9CO0FBQ3pHLFNBQVMsaUNBQWlDO0FBQzFDLFNBQXVCLGlDQUFzRztBQUU3SCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGtCQUFrQiw0QkFBMEU7QUFDckcsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFhbkMsTUFBTSxnQkFBZ0I7QUFBQSxFQUF0QjtBQUVOLFNBQVEsU0FBUztBQUFBO0FBQUEsRUFFakIsSUFBSSxTQUFrQjtBQUNyQixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxVQUF1QjtBQUN0QixTQUFLO0FBR0wsUUFBSSxXQUFXO0FBQ2YsV0FBTyxhQUFhLE1BQU07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
