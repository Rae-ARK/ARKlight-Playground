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
import { LayoutPriority, Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITerminalChatService, ITerminalConfigurationService, ITerminalGroupService, ITerminalService, TerminalConnectionState, TerminalDataTransfers } from "./terminal.js";
import { TerminalTabsListSizes, TerminalTabList } from "./terminalTabsList.js";
import * as dom from "../../../../base/browser/dom.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { localize } from "../../../../nls.js";
import { openContextMenu } from "./terminalContextMenu.js";
import { TerminalStorageKeys } from "../common/terminalStorageKeys.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { getInstanceHoverInfo } from "./terminalTooltip.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { TerminalTabsChatEntry } from "./terminalTabsChatEntry.js";
import { containsDragType } from "../../../../platform/dnd/browser/dnd.js";
import { getTerminalResourcesFromDragEvent, parseTerminalUri } from "./terminalUri.js";
import { TerminalContribContextKeyStrings } from "../terminalContribExports.js";
const $ = dom.$;
var CssClass = /* @__PURE__ */ ((CssClass2) => {
  CssClass2["ViewIsVertical"] = "terminal-side-view";
  return CssClass2;
})(CssClass || {});
var WidthConstants = /* @__PURE__ */ ((WidthConstants2) => {
  WidthConstants2[WidthConstants2["StatusIcon"] = 30] = "StatusIcon";
  WidthConstants2[WidthConstants2["SplitAnnotation"] = 30] = "SplitAnnotation";
  return WidthConstants2;
})(WidthConstants || {});
let TerminalTabbedView = class extends Disposable {
  constructor(parentElement, _terminalService, _terminalChatService, _terminalConfigurationService, _terminalGroupService, _instantiationService, _contextMenuService, _configurationService, menuService, _storageService, contextKeyService, _hoverService) {
    super();
    this._terminalService = _terminalService;
    this._terminalChatService = _terminalChatService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalGroupService = _terminalGroupService;
    this._instantiationService = _instantiationService;
    this._contextMenuService = _contextMenuService;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._hoverService = _hoverService;
    this._cancelContextMenu = false;
    this._emptyAreaDropTargetCount = 0;
    this._tabContainer = $(".tabs-container");
    const tabListContainer = $(".tabs-list-container");
    this._tabListContainer = tabListContainer;
    this._tabListElement = $(".tabs-list");
    tabListContainer.appendChild(this._tabListElement);
    this._tabContainer.appendChild(tabListContainer);
    this._instanceMenu = this._register(menuService.createMenu(MenuId.TerminalInstanceContext, contextKeyService));
    this._tabsListMenu = this._register(menuService.createMenu(MenuId.TerminalTabContext, contextKeyService));
    this._tabsListEmptyMenu = this._register(menuService.createMenu(MenuId.TerminalTabEmptyAreaContext, contextKeyService));
    this._tabList = this._register(this._instantiationService.createInstance(TerminalTabList, this._tabListElement));
    this._tabListDomElement = this._tabList.getHTMLElement();
    this._chatEntry = this._register(this._instantiationService.createInstance(TerminalTabsChatEntry, tabListContainer, this._tabContainer));
    const terminalOuterContainer = $(".terminal-outer-container");
    this._terminalContainer = $(".terminal-groups-container");
    terminalOuterContainer.appendChild(this._terminalContainer);
    this._terminalService.setContainers(parentElement, this._terminalContainer);
    this._terminalIsTabsNarrowContextKey = TerminalContextKeys.tabsNarrow.bindTo(contextKeyService);
    this._terminalTabsFocusContextKey = TerminalContextKeys.tabsFocus.bindTo(contextKeyService);
    this._terminalTabsMouseContextKey = TerminalContextKeys.tabsMouse.bindTo(contextKeyService);
    this._tabTreeIndex = this._terminalConfigurationService.config.tabs.location === "left" ? 0 : 1;
    this._terminalContainerIndex = this._terminalConfigurationService.config.tabs.location === "left" ? 1 : 0;
    this._register(_configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.TabsEnabled) || e.affectsConfiguration(TerminalSettingId.TabsHideCondition)) {
        this._refreshShowTabs();
      } else if (e.affectsConfiguration(TerminalSettingId.TabsLocation)) {
        this._tabTreeIndex = this._terminalConfigurationService.config.tabs.location === "left" ? 0 : 1;
        this._terminalContainerIndex = this._terminalConfigurationService.config.tabs.location === "left" ? 1 : 0;
        if (this._shouldShowTabs()) {
          this._splitView.swapViews(0, 1);
          this._removeSashListener();
          this._addSashListener();
          this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
        }
      }
    }));
    this._register(Event.any(this._terminalGroupService.onDidChangeInstances, this._terminalGroupService.onDidChangeGroups)(() => {
      this._refreshShowTabs();
      this._updateChatTerminalsEntry();
    }));
    this._register(Event.any(this._terminalChatService.onDidRegisterTerminalInstanceWithToolSession, this._terminalService.onDidChangeInstances, this._terminalService.onDidDisposeInstance)(() => {
      this._refreshShowTabs();
      this._updateChatTerminalsEntry();
    }));
    this._register(contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set([TerminalContribContextKeyStrings.ChatHasHiddenTerminals]))) {
        this._refreshShowTabs();
        this._updateChatTerminalsEntry();
      }
    }));
    this._attachEventListeners(parentElement, this._terminalContainer);
    this._register(this._terminalGroupService.onDidChangePanelOrientation((orientation) => {
      this._panelOrientation = orientation;
      if (this._panelOrientation === Orientation.VERTICAL) {
        this._terminalContainer.classList.add("terminal-side-view" /* ViewIsVertical */);
      } else {
        this._terminalContainer.classList.remove("terminal-side-view" /* ViewIsVertical */);
      }
    }));
    this._splitView = new SplitView(parentElement, { orientation: Orientation.HORIZONTAL, proportionalLayout: false });
    this._setupSplitView(terminalOuterContainer);
    this._updateChatTerminalsEntry();
  }
  _shouldShowTabs() {
    const enabled = this._terminalConfigurationService.config.tabs.enabled;
    const hide = this._terminalConfigurationService.config.tabs.hideCondition;
    const hiddenChatTerminals = this._terminalChatService.getToolSessionTerminalInstances(true);
    if (!enabled) {
      return false;
    }
    if (hiddenChatTerminals.length > 0) {
      return true;
    }
    switch (hide) {
      case "never":
        return true;
      case "singleTerminal":
        if (this._terminalGroupService.instances.length > 1) {
          return true;
        }
        break;
      case "singleGroup":
        if (this._terminalGroupService.groups.length > 1) {
          return true;
        }
        break;
    }
    return false;
  }
  _refreshShowTabs() {
    if (this._shouldShowTabs()) {
      if (this._splitView.length === 1) {
        this._addTabTree();
        this._addSashListener();
        this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
        this.rerenderTabs();
      }
    } else {
      if (this._splitView.length === 2 && !this._terminalTabsMouseContextKey.get()) {
        this._splitView.removeView(this._tabTreeIndex);
        this._plusButton?.remove();
        this._removeSashListener();
      }
    }
  }
  _updateChatTerminalsEntry() {
    this._chatEntry?.update();
  }
  _getLastListWidth() {
    const widthKey = this._panelOrientation === Orientation.VERTICAL ? TerminalStorageKeys.TabsListWidthVertical : TerminalStorageKeys.TabsListWidthHorizontal;
    const storedValue = this._storageService.get(widthKey, StorageScope.PROFILE);
    if (!storedValue || !parseInt(storedValue)) {
      return this._panelOrientation === Orientation.VERTICAL ? TerminalTabsListSizes.NarrowViewWidth : TerminalTabsListSizes.DefaultWidth;
    }
    return parseInt(storedValue);
  }
  _handleOnDidSashReset() {
    let idealWidth = TerminalTabsListSizes.WideViewMinimumWidth;
    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = 1;
    offscreenCanvas.height = 1;
    const ctx = offscreenCanvas.getContext("2d");
    if (ctx) {
      const style = dom.getWindow(this._tabListElement).getComputedStyle(this._tabListElement);
      ctx.font = `${style.fontStyle} ${style.fontSize} ${style.fontFamily}`;
      const maxInstanceWidth = this._terminalGroupService.instances.reduce((p, c) => {
        return Math.max(p, ctx.measureText(c.title + (c.description || "")).width + this._getAdditionalWidth(c));
      }, 0);
      idealWidth = Math.ceil(Math.max(maxInstanceWidth, TerminalTabsListSizes.WideViewMinimumWidth));
    }
    const currentWidth = Math.ceil(this._splitView.getViewSize(this._tabTreeIndex));
    if (currentWidth === idealWidth) {
      idealWidth = TerminalTabsListSizes.NarrowViewWidth;
    }
    this._splitView.resizeView(this._tabTreeIndex, idealWidth);
    this._updateListWidth(idealWidth);
  }
  _getAdditionalWidth(instance) {
    const additionalWidth = 40;
    const statusIconWidth = instance.statusList.statuses.length > 0 ? 30 /* StatusIcon */ : 0;
    const splitAnnotationWidth = (this._terminalGroupService.getGroupForInstance(instance)?.terminalInstances.length || 0) > 1 ? 30 /* SplitAnnotation */ : 0;
    return additionalWidth + splitAnnotationWidth + statusIconWidth;
  }
  _handleOnDidSashChange() {
    const listWidth = this._splitView.getViewSize(this._tabTreeIndex);
    if (!this._width || listWidth <= 0) {
      return;
    }
    this._updateListWidth(listWidth);
  }
  _updateListWidth(width) {
    if (width < TerminalTabsListSizes.MidpointViewWidth && width >= TerminalTabsListSizes.NarrowViewWidth) {
      width = TerminalTabsListSizes.NarrowViewWidth;
      this._splitView.resizeView(this._tabTreeIndex, width);
    } else if (width >= TerminalTabsListSizes.MidpointViewWidth && width < TerminalTabsListSizes.WideViewMinimumWidth) {
      width = TerminalTabsListSizes.WideViewMinimumWidth;
      this._splitView.resizeView(this._tabTreeIndex, width);
    }
    this.rerenderTabs();
    const widthKey = this._panelOrientation === Orientation.VERTICAL ? TerminalStorageKeys.TabsListWidthVertical : TerminalStorageKeys.TabsListWidthHorizontal;
    this._storageService.store(widthKey, width, StorageScope.PROFILE, StorageTarget.USER);
  }
  _setupSplitView(terminalOuterContainer) {
    this._register(this._splitView.onDidSashReset(() => this._handleOnDidSashReset()));
    this._register(this._splitView.onDidSashChange(() => this._handleOnDidSashChange()));
    if (this._shouldShowTabs()) {
      this._addTabTree();
    }
    this._splitView.addView({
      element: terminalOuterContainer,
      layout: (width) => this._terminalGroupService.groups.forEach((tab) => tab.layout(width, this._height || 0)),
      minimumSize: 120,
      maximumSize: Number.POSITIVE_INFINITY,
      onDidChange: () => Disposable.None,
      priority: LayoutPriority.High
    }, Sizing.Distribute, this._terminalContainerIndex);
    if (this._shouldShowTabs()) {
      this._addSashListener();
    }
  }
  _addTabTree() {
    this._splitView.addView({
      element: this._tabContainer,
      layout: (width) => this._tabList.layout(this._height || 0, width),
      minimumSize: TerminalTabsListSizes.NarrowViewWidth,
      maximumSize: TerminalTabsListSizes.MaximumWidth,
      onDidChange: () => Disposable.None,
      priority: LayoutPriority.Low
    }, Sizing.Distribute, this._tabTreeIndex);
    this.rerenderTabs();
  }
  rerenderTabs() {
    this._updateHasText();
    this._tabList.refresh();
  }
  _addSashListener() {
    let interval;
    this._sashDisposables = [
      this._splitView.sashes[0].onDidStart((e) => {
        interval = dom.disposableWindowInterval(dom.getWindow(this._splitView.el), () => {
          this.rerenderTabs();
        }, 100);
      }),
      this._splitView.sashes[0].onDidEnd((e) => {
        interval.dispose();
      })
    ];
  }
  _removeSashListener() {
    if (this._sashDisposables) {
      dispose(this._sashDisposables);
      this._sashDisposables = void 0;
    }
  }
  _updateHasText() {
    const hasText = this._tabListElement.clientWidth > TerminalTabsListSizes.MidpointViewWidth;
    this._tabContainer.classList.toggle("has-text", hasText);
    this._terminalIsTabsNarrowContextKey.set(!hasText);
    this._updateChatTerminalsEntry();
  }
  layout(width, height) {
    const chatItemHeight = this._chatEntry?.element.style.display === "none" ? 0 : this._chatEntry?.element.clientHeight;
    this._height = height - (chatItemHeight ?? 0);
    this._width = width;
    this._splitView.layout(width);
    if (this._shouldShowTabs()) {
      this._splitView.resizeView(this._tabTreeIndex, this._getLastListWidth());
    }
    this._updateHasText();
  }
  _attachEventListeners(parentDomElement, terminalContainer) {
    this._register(dom.addDisposableListener(this._tabContainer, "mouseleave", async (event) => {
      this._terminalTabsMouseContextKey.set(false);
      this._refreshShowTabs();
      event.stopPropagation();
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "mouseenter", async (event) => {
      this._terminalTabsMouseContextKey.set(true);
      event.stopPropagation();
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "dragenter", (event) => {
      if (!this._shouldHandleEmptyAreaDrop(event)) {
        this._resetEmptyAreaDropState();
        return;
      }
      this._emptyAreaDropTargetCount++;
      this._setEmptyAreaDropState(true);
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "dragover", (event) => {
      if (!this._shouldHandleEmptyAreaDrop(event)) {
        this._resetEmptyAreaDropState();
        return;
      }
      event.preventDefault();
      this._setEmptyAreaDropState(true);
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "dragleave", (event) => {
      if (!this._shouldHandleEmptyAreaDrop(event)) {
        if (!this._tabContainer.contains(event.relatedTarget)) {
          this._resetEmptyAreaDropState();
        }
        return;
      }
      if (this._tabContainer.contains(event.relatedTarget)) {
        return;
      }
      this._emptyAreaDropTargetCount = Math.max(0, this._emptyAreaDropTargetCount - 1);
      if (this._emptyAreaDropTargetCount === 0) {
        this._resetEmptyAreaDropState();
      }
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "drop", (event) => {
      if (!this._shouldHandleEmptyAreaDrop(event)) {
        return;
      }
      void this._handleContainerDrop(event);
    }));
    this._register(dom.addDisposableListener(terminalContainer, "mousedown", async (event) => {
      const terminal = this._terminalGroupService.activeInstance;
      if (this._terminalGroupService.instances.length > 0 && terminal) {
        const result = await terminal.handleMouseEvent(event, this._instanceMenu);
        if (typeof result === "object" && result.cancelContextMenu) {
          this._cancelContextMenu = true;
        }
      }
    }));
    this._register(dom.addDisposableListener(terminalContainer, "contextmenu", (event) => {
      const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
      if (rightClickBehavior === "nothing" && !event.shiftKey) {
        this._cancelContextMenu = true;
      }
      terminalContainer.focus();
      if (!this._cancelContextMenu) {
        openContextMenu(dom.getWindow(terminalContainer), event, this._terminalGroupService.activeInstance, this._instanceMenu, this._contextMenuService);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this._cancelContextMenu = false;
    }));
    this._register(dom.addDisposableListener(this._tabContainer, "contextmenu", (event) => {
      const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
      if (rightClickBehavior === "nothing" && !event.shiftKey) {
        this._cancelContextMenu = true;
      }
      if (!this._cancelContextMenu) {
        const emptyList = this._tabList.getFocus().length === 0;
        if (!emptyList) {
          this._terminalGroupService.lastAccessedMenu = "tab-list";
        }
        const selectedInstances = this._tabList.getSelectedElements();
        const focusedInstance = this._tabList.getFocusedElements()?.[0];
        if (focusedInstance) {
          selectedInstances.splice(selectedInstances.findIndex((e) => e.instanceId === focusedInstance.instanceId), 1);
          selectedInstances.unshift(focusedInstance);
        }
        openContextMenu(dom.getWindow(this._tabContainer), event, selectedInstances, emptyList ? this._tabsListEmptyMenu : this._tabsListMenu, this._contextMenuService, emptyList ? this._getTabActions() : void 0);
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      this._cancelContextMenu = false;
    }));
    this._register(dom.addDisposableListener(terminalContainer.ownerDocument, "keydown", (event) => {
      terminalContainer.classList.toggle("alt-active", !!event.altKey);
    }));
    this._register(dom.addDisposableListener(terminalContainer.ownerDocument, "keyup", (event) => {
      terminalContainer.classList.toggle("alt-active", !!event.altKey);
    }));
    this._register(dom.addDisposableListener(parentDomElement, "keyup", (event) => {
      if (event.keyCode === 27) {
        event.stopPropagation();
      }
    }));
    this._register(dom.addDisposableListener(this._tabContainer, dom.EventType.FOCUS_IN, () => {
      this._terminalTabsFocusContextKey.set(true);
    }));
    this._register(dom.addDisposableListener(this._tabContainer, dom.EventType.FOCUS_OUT, () => {
      this._terminalTabsFocusContextKey.set(false);
    }));
  }
  _shouldHandleEmptyAreaDrop(event) {
    const targetNode = event.target;
    if (targetNode && (this._tabListDomElement.contains(targetNode) || this._tabListElement.contains(targetNode))) {
      return false;
    }
    return !!event.dataTransfer && containsDragType(event, TerminalDataTransfers.Terminals);
  }
  _setEmptyAreaDropState(active) {
    this._tabListContainer.classList.toggle("drop-target", active);
    this._tabContainer.classList.toggle("drop-target", active);
    this._chatEntry?.element.classList.toggle("drop-target", active);
  }
  _resetEmptyAreaDropState() {
    this._emptyAreaDropTargetCount = 0;
    this._setEmptyAreaDropState(false);
  }
  async _handleContainerDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    this._resetEmptyAreaDropState();
    const primaryBackend = this._terminalService.getPrimaryBackend();
    const resources = getTerminalResourcesFromDragEvent(event);
    let sourceInstances;
    const promises = [];
    if (resources) {
      for (const uri of resources) {
        const instance = this._terminalService.getInstanceFromResource(uri);
        if (instance) {
          if (sourceInstances) {
            sourceInstances.push(instance);
          } else {
            sourceInstances = [instance];
          }
          this._terminalService.moveToTerminalView(instance);
        } else if (primaryBackend) {
          const terminalIdentifier = parseTerminalUri(uri);
          if (terminalIdentifier.instanceId) {
            promises.push(primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId));
          }
        }
      }
    }
    if (promises.length) {
      const processes = (await Promise.all(promises)).filter((process) => !!process);
      let lastInstance;
      for (const attachPersistentProcess of processes) {
        lastInstance = await this._terminalService.createTerminal({ config: { attachPersistentProcess } });
      }
      if (lastInstance) {
        this._terminalService.setActiveInstance(lastInstance);
      }
      return;
    }
    if (!sourceInstances || !sourceInstances.length) {
      sourceInstances = this._tabList.getSelectedElements();
      if (!sourceInstances.length) {
        return;
      }
    }
    this._terminalGroupService.moveGroupToEnd(sourceInstances);
    this._terminalService.setActiveInstance(sourceInstances[0]);
    const indexes = sourceInstances.map((instance) => this._terminalGroupService.instances.indexOf(instance)).filter((index) => index >= 0);
    if (indexes.length) {
      this._tabList.setSelection(indexes);
      this._tabList.setFocus([indexes[0]]);
    }
  }
  _getTabActions() {
    return [
      new Separator(),
      this._configurationService.inspect(TerminalSettingId.TabsLocation).userValue === "left" ? new Action("moveRight", localize("moveTabsRight", "Move Tabs Right"), void 0, void 0, async () => {
        this._configurationService.updateValue(TerminalSettingId.TabsLocation, "right");
      }) : new Action("moveLeft", localize("moveTabsLeft", "Move Tabs Left"), void 0, void 0, async () => {
        this._configurationService.updateValue(TerminalSettingId.TabsLocation, "left");
      }),
      new Action("hideTabs", localize("hideTabs", "Hide Tabs"), void 0, void 0, async () => {
        this._configurationService.updateValue(TerminalSettingId.TabsEnabled, false);
      })
    ];
  }
  setEditable(isEditing) {
    if (!isEditing) {
      this._tabList.domFocus();
    }
    this._tabList.refresh(false);
  }
  focusTabs() {
    if (!this._shouldShowTabs()) {
      return;
    }
    this._terminalTabsFocusContextKey.set(true);
    const selected = this._tabList.getSelection();
    this._tabList.domFocus();
    if (selected) {
      this._tabList.setFocus(selected);
    }
  }
  focus() {
    if (this._terminalService.connectionState === TerminalConnectionState.Connected) {
      this._focus();
      return;
    }
    const previousActiveElement = this._tabListElement.ownerDocument.activeElement;
    if (previousActiveElement) {
      const listener = this._register(Event.once(this._terminalService.onDidChangeConnectionState)(() => {
        if (dom.isActiveElement(previousActiveElement)) {
          this._focus();
        }
        this._store.delete(listener);
      }));
    }
  }
  focusHover() {
    if (this._shouldShowTabs()) {
      this._tabList.focusHover();
      return;
    }
    const instance = this._terminalGroupService.activeInstance;
    if (!instance) {
      return;
    }
    this._hoverService.showInstantHover({
      ...getInstanceHoverInfo(instance, this._storageService),
      target: this._terminalContainer,
      trapFocus: true
    }, true);
  }
  _focus() {
    this._terminalGroupService.activeInstance?.focusWhenReady();
  }
};
TerminalTabbedView = __decorateClass([
  __decorateParam(1, ITerminalService),
  __decorateParam(2, ITerminalChatService),
  __decorateParam(3, ITerminalConfigurationService),
  __decorateParam(4, ITerminalGroupService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IHoverService)
], TerminalTabbedView);
export {
  TerminalTabbedView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxUYWJiZWRWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTGF5b3V0UHJpb3JpdHksIE9yaWVudGF0aW9uLCBTaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENoYXRTZXJ2aWNlLCBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSwgVGVybWluYWxDb25uZWN0aW9uU3RhdGUsIFRlcm1pbmFsRGF0YVRyYW5zZmVycyB9IGZyb20gJy4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxUYWJzTGlzdFNpemVzLCBUZXJtaW5hbFRhYkxpc3QgfSBmcm9tICcuL3Rlcm1pbmFsVGFic0xpc3QuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IG9wZW5Db250ZXh0TWVudSB9IGZyb20gJy4vdGVybWluYWxDb250ZXh0TWVudS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN0b3JhZ2VLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3RvcmFnZUtleXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbENvbnRleHRLZXkuanMnO1xuaW1wb3J0IHsgZ2V0SW5zdGFuY2VIb3ZlckluZm8gfSBmcm9tICcuL3Rlcm1pbmFsVG9vbHRpcC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRhYnNDaGF0RW50cnkgfSBmcm9tICcuL3Rlcm1pbmFsVGFic0NoYXRFbnRyeS5qcyc7XG5pbXBvcnQgeyBjb250YWluc0RyYWdUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IGdldFRlcm1pbmFsUmVzb3VyY2VzRnJvbURyYWdFdmVudCwgcGFyc2VUZXJtaW5hbFVyaSB9IGZyb20gJy4vdGVybWluYWxVcmkuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvY2Vzc0RldGFpbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxQcm9jZXNzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udHJpYkNvbnRleHRLZXlTdHJpbmdzIH0gZnJvbSAnLi4vdGVybWluYWxDb250cmliRXhwb3J0cy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgZW51bSBDc3NDbGFzcyB7XG5cdFZpZXdJc1ZlcnRpY2FsID0gJ3Rlcm1pbmFsLXNpZGUtdmlldycsXG59XG5cbmNvbnN0IGVudW0gV2lkdGhDb25zdGFudHMge1xuXHRTdGF0dXNJY29uID0gMzAsXG5cdFNwbGl0QW5ub3RhdGlvbiA9IDMwXG59XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFRhYmJlZFZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9zcGxpdFZpZXc6IFNwbGl0VmlldztcblxuXHRwcml2YXRlIF90ZXJtaW5hbENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3RhYkxpc3RFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIF90YWJMaXN0OiBUZXJtaW5hbFRhYkxpc3Q7XG5cdHByaXZhdGUgX3RhYkxpc3RDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF90YWJMaXN0RG9tRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3Nhc2hEaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9wbHVzQnV0dG9uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2hhdEVudHJ5OiBUZXJtaW5hbFRhYnNDaGF0RW50cnkgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfdGFiVHJlZUluZGV4OiBudW1iZXI7XG5cdHByaXZhdGUgX3Rlcm1pbmFsQ29udGFpbmVySW5kZXg6IG51bWJlcjtcblxuXHRwcml2YXRlIF9oZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfd2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jYW5jZWxDb250ZXh0TWVudTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9pbnN0YW5jZU1lbnU6IElNZW51O1xuXHRwcml2YXRlIF90YWJzTGlzdE1lbnU6IElNZW51O1xuXHRwcml2YXRlIF90YWJzTGlzdEVtcHR5TWVudTogSU1lbnU7XG5cblx0cHJpdmF0ZSBfdGVybWluYWxJc1RhYnNOYXJyb3dDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfdGVybWluYWxUYWJzRm9jdXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfdGVybWluYWxUYWJzTW91c2VDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9wYW5lbE9yaWVudGF0aW9uOiBPcmllbnRhdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZW1wdHlBcmVhRHJvcFRhcmdldENvdW50ID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwYXJlbnRFbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ2hhdFNlcnZpY2U6IElUZXJtaW5hbENoYXRTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fdGFiQ29udGFpbmVyID0gJCgnLnRhYnMtY29udGFpbmVyJyk7XG5cdFx0Y29uc3QgdGFiTGlzdENvbnRhaW5lciA9ICQoJy50YWJzLWxpc3QtY29udGFpbmVyJyk7XG5cdFx0dGhpcy5fdGFiTGlzdENvbnRhaW5lciA9IHRhYkxpc3RDb250YWluZXI7XG5cdFx0dGhpcy5fdGFiTGlzdEVsZW1lbnQgPSAkKCcudGFicy1saXN0Jyk7XG5cdFx0dGFiTGlzdENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl90YWJMaXN0RWxlbWVudCk7XG5cdFx0dGhpcy5fdGFiQ29udGFpbmVyLmFwcGVuZENoaWxkKHRhYkxpc3RDb250YWluZXIpO1xuXG5cdFx0dGhpcy5faW5zdGFuY2VNZW51ID0gdGhpcy5fcmVnaXN0ZXIobWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fdGFic0xpc3RNZW51ID0gdGhpcy5fcmVnaXN0ZXIobWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuVGVybWluYWxUYWJDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuX3RhYnNMaXN0RW1wdHlNZW51ID0gdGhpcy5fcmVnaXN0ZXIobWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuVGVybWluYWxUYWJFbXB0eUFyZWFDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSkpO1xuXG5cdFx0dGhpcy5fdGFiTGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsVGFiTGlzdCwgdGhpcy5fdGFiTGlzdEVsZW1lbnQpKTtcblx0XHR0aGlzLl90YWJMaXN0RG9tRWxlbWVudCA9IHRoaXMuX3RhYkxpc3QuZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHR0aGlzLl9jaGF0RW50cnkgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFRhYnNDaGF0RW50cnksIHRhYkxpc3RDb250YWluZXIsIHRoaXMuX3RhYkNvbnRhaW5lcikpO1xuXG5cdFx0Y29uc3QgdGVybWluYWxPdXRlckNvbnRhaW5lciA9ICQoJy50ZXJtaW5hbC1vdXRlci1jb250YWluZXInKTtcblx0XHR0aGlzLl90ZXJtaW5hbENvbnRhaW5lciA9ICQoJy50ZXJtaW5hbC1ncm91cHMtY29udGFpbmVyJyk7XG5cdFx0dGVybWluYWxPdXRlckNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl90ZXJtaW5hbENvbnRhaW5lcik7XG5cblx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0Q29udGFpbmVycyhwYXJlbnRFbGVtZW50LCB0aGlzLl90ZXJtaW5hbENvbnRhaW5lcik7XG5cblx0XHR0aGlzLl90ZXJtaW5hbElzVGFic05hcnJvd0NvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNOYXJyb3cuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl90ZXJtaW5hbFRhYnNGb2N1c0NvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNGb2N1cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsVGFic01vdXNlQ29udGV4dEtleSA9IFRlcm1pbmFsQ29udGV4dEtleXMudGFic01vdXNlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl90YWJUcmVlSW5kZXggPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy50YWJzLmxvY2F0aW9uID09PSAnbGVmdCcgPyAwIDogMTtcblx0XHR0aGlzLl90ZXJtaW5hbENvbnRhaW5lckluZGV4ID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcudGFicy5sb2NhdGlvbiA9PT0gJ2xlZnQnID8gMSA6IDA7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihfY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuVGFic0VuYWJsZWQpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuVGFic0hpZGVDb25kaXRpb24pKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hTaG93VGFicygpO1xuXHRcdFx0fSBlbHNlIGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlRhYnNMb2NhdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fdGFiVHJlZUluZGV4ID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcudGFicy5sb2NhdGlvbiA9PT0gJ2xlZnQnID8gMCA6IDE7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVySW5kZXggPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy50YWJzLmxvY2F0aW9uID09PSAnbGVmdCcgPyAxIDogMDtcblx0XHRcdFx0aWYgKHRoaXMuX3Nob3VsZFNob3dUYWJzKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9zcGxpdFZpZXcuc3dhcFZpZXdzKDAsIDEpO1xuXHRcdFx0XHRcdHRoaXMuX3JlbW92ZVNhc2hMaXN0ZW5lcigpO1xuXHRcdFx0XHRcdHRoaXMuX2FkZFNhc2hMaXN0ZW5lcigpO1xuXHRcdFx0XHRcdHRoaXMuX3NwbGl0Vmlldy5yZXNpemVWaWV3KHRoaXMuX3RhYlRyZWVJbmRleCwgdGhpcy5fZ2V0TGFzdExpc3RXaWR0aCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkodGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VJbnN0YW5jZXMsIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlR3JvdXBzKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWZyZXNoU2hvd1RhYnMoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUNoYXRUZXJtaW5hbHNFbnRyeSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSh0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLm9uRGlkUmVnaXN0ZXJUZXJtaW5hbEluc3RhbmNlV2l0aFRvb2xTZXNzaW9uLCB0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VJbnN0YW5jZXMsIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZERpc3Bvc2VJbnN0YW5jZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVmcmVzaFNob3dUYWJzKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVDaGF0VGVybWluYWxzRW50cnkoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShuZXcgU2V0KFtUZXJtaW5hbENvbnRyaWJDb250ZXh0S2V5U3RyaW5ncy5DaGF0SGFzSGlkZGVuVGVybWluYWxzXSkpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hTaG93VGFicygpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVDaGF0VGVybWluYWxzRW50cnkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fYXR0YWNoRXZlbnRMaXN0ZW5lcnMocGFyZW50RWxlbWVudCwgdGhpcy5fdGVybWluYWxDb250YWluZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VQYW5lbE9yaWVudGF0aW9uKChvcmllbnRhdGlvbikgPT4ge1xuXHRcdFx0dGhpcy5fcGFuZWxPcmllbnRhdGlvbiA9IG9yaWVudGF0aW9uO1xuXHRcdFx0aWYgKHRoaXMuX3BhbmVsT3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoQ3NzQ2xhc3MuVmlld0lzVmVydGljYWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShDc3NDbGFzcy5WaWV3SXNWZXJ0aWNhbCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3BsaXRWaWV3ID0gbmV3IFNwbGl0VmlldyhwYXJlbnRFbGVtZW50LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMLCBwcm9wb3J0aW9uYWxMYXlvdXQ6IGZhbHNlIH0pO1xuXHRcdHRoaXMuX3NldHVwU3BsaXRWaWV3KHRlcm1pbmFsT3V0ZXJDb250YWluZXIpO1xuXHRcdHRoaXMuX3VwZGF0ZUNoYXRUZXJtaW5hbHNFbnRyeSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkU2hvd1RhYnMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnRhYnMuZW5hYmxlZDtcblx0XHRjb25zdCBoaWRlID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcudGFicy5oaWRlQ29uZGl0aW9uO1xuXHRcdGNvbnN0IGhpZGRlbkNoYXRUZXJtaW5hbHMgPSB0aGlzLl90ZXJtaW5hbENoYXRTZXJ2aWNlLmdldFRvb2xTZXNzaW9uVGVybWluYWxJbnN0YW5jZXModHJ1ZSk7XG5cdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChoaWRkZW5DaGF0VGVybWluYWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoaGlkZSkge1xuXHRcdFx0Y2FzZSAnbmV2ZXInOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgJ3NpbmdsZVRlcm1pbmFsJzpcblx0XHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzaW5nbGVHcm91cCc6XG5cdFx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5ncm91cHMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoU2hvd1RhYnMoKSB7XG5cdFx0aWYgKHRoaXMuX3Nob3VsZFNob3dUYWJzKCkpIHtcblx0XHRcdGlmICh0aGlzLl9zcGxpdFZpZXcubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHRoaXMuX2FkZFRhYlRyZWUoKTtcblx0XHRcdFx0dGhpcy5fYWRkU2FzaExpc3RlbmVyKCk7XG5cdFx0XHRcdHRoaXMuX3NwbGl0Vmlldy5yZXNpemVWaWV3KHRoaXMuX3RhYlRyZWVJbmRleCwgdGhpcy5fZ2V0TGFzdExpc3RXaWR0aCgpKTtcblx0XHRcdFx0dGhpcy5yZXJlbmRlclRhYnMoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuX3NwbGl0Vmlldy5sZW5ndGggPT09IDIgJiYgIXRoaXMuX3Rlcm1pbmFsVGFic01vdXNlQ29udGV4dEtleS5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLl9zcGxpdFZpZXcucmVtb3ZlVmlldyh0aGlzLl90YWJUcmVlSW5kZXgpO1xuXHRcdFx0XHR0aGlzLl9wbHVzQnV0dG9uPy5yZW1vdmUoKTtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlU2FzaExpc3RlbmVyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ2hhdFRlcm1pbmFsc0VudHJ5KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRFbnRyeT8udXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMYXN0TGlzdFdpZHRoKCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgd2lkdGhLZXkgPSB0aGlzLl9wYW5lbE9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IFRlcm1pbmFsU3RvcmFnZUtleXMuVGFic0xpc3RXaWR0aFZlcnRpY2FsIDogVGVybWluYWxTdG9yYWdlS2V5cy5UYWJzTGlzdFdpZHRoSG9yaXpvbnRhbDtcblx0XHRjb25zdCBzdG9yZWRWYWx1ZSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldCh3aWR0aEtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXG5cdFx0aWYgKCFzdG9yZWRWYWx1ZSB8fCAhcGFyc2VJbnQoc3RvcmVkVmFsdWUpKSB7XG5cdFx0XHQvLyB3ZSB3YW50IHRvIHVzZSB0aGUgbWluIHdpZHRoIGJ5IGRlZmF1bHQgZm9yIHRoZSB2ZXJ0aWNhbCBvcmllbnRhdGlvbiBiY1xuXHRcdFx0Ly8gdGhlcmUgaXMgc3VjaCBhIGxpbWl0ZWQgd2lkdGggZm9yIHRoZSB0ZXJtaW5hbCBwYW5lbCB0byBiZWdpbiB3IHRoZXJlLlxuXHRcdFx0cmV0dXJuIHRoaXMuX3BhbmVsT3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMID8gVGVybWluYWxUYWJzTGlzdFNpemVzLk5hcnJvd1ZpZXdXaWR0aCA6IFRlcm1pbmFsVGFic0xpc3RTaXplcy5EZWZhdWx0V2lkdGg7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZUludChzdG9yZWRWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVPbkRpZFNhc2hSZXNldCgpOiB2b2lkIHtcblx0XHQvLyBDYWxjdWxhdGUgaWRlYWwgc2l6ZSBvZiBsaXN0IHRvIGRpc3BsYXkgYWxsIHRleHQgYmFzZWQgb24gaXRzIGNvbnRlbnRzXG5cdFx0bGV0IGlkZWFsV2lkdGggPSBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuV2lkZVZpZXdNaW5pbXVtV2lkdGg7XG5cdFx0Y29uc3Qgb2Zmc2NyZWVuQ2FudmFzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG5cdFx0b2Zmc2NyZWVuQ2FudmFzLndpZHRoID0gMTtcblx0XHRvZmZzY3JlZW5DYW52YXMuaGVpZ2h0ID0gMTtcblx0XHRjb25zdCBjdHggPSBvZmZzY3JlZW5DYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblx0XHRpZiAoY3R4KSB7XG5cdFx0XHRjb25zdCBzdHlsZSA9IGRvbS5nZXRXaW5kb3codGhpcy5fdGFiTGlzdEVsZW1lbnQpLmdldENvbXB1dGVkU3R5bGUodGhpcy5fdGFiTGlzdEVsZW1lbnQpO1xuXHRcdFx0Y3R4LmZvbnQgPSBgJHtzdHlsZS5mb250U3R5bGV9ICR7c3R5bGUuZm9udFNpemV9ICR7c3R5bGUuZm9udEZhbWlseX1gO1xuXHRcdFx0Y29uc3QgbWF4SW5zdGFuY2VXaWR0aCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5yZWR1Y2UoKHAsIGMpID0+IHtcblx0XHRcdFx0cmV0dXJuIE1hdGgubWF4KHAsIGN0eC5tZWFzdXJlVGV4dChjLnRpdGxlICsgKGMuZGVzY3JpcHRpb24gfHwgJycpKS53aWR0aCArIHRoaXMuX2dldEFkZGl0aW9uYWxXaWR0aChjKSk7XG5cdFx0XHR9LCAwKTtcblx0XHRcdGlkZWFsV2lkdGggPSBNYXRoLmNlaWwoTWF0aC5tYXgobWF4SW5zdGFuY2VXaWR0aCwgVGVybWluYWxUYWJzTGlzdFNpemVzLldpZGVWaWV3TWluaW11bVdpZHRoKSk7XG5cdFx0fVxuXHRcdC8vIElmIHRoZSBzaXplIGlzIGFscmVhZHkgaWRlYWwsIHRvZ2dsZSB0byBjb2xsYXBzZWRcblx0XHRjb25zdCBjdXJyZW50V2lkdGggPSBNYXRoLmNlaWwodGhpcy5fc3BsaXRWaWV3LmdldFZpZXdTaXplKHRoaXMuX3RhYlRyZWVJbmRleCkpO1xuXHRcdGlmIChjdXJyZW50V2lkdGggPT09IGlkZWFsV2lkdGgpIHtcblx0XHRcdGlkZWFsV2lkdGggPSBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTmFycm93Vmlld1dpZHRoO1xuXHRcdH1cblx0XHR0aGlzLl9zcGxpdFZpZXcucmVzaXplVmlldyh0aGlzLl90YWJUcmVlSW5kZXgsIGlkZWFsV2lkdGgpO1xuXHRcdHRoaXMuX3VwZGF0ZUxpc3RXaWR0aChpZGVhbFdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFkZGl0aW9uYWxXaWR0aChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBudW1iZXIge1xuXHRcdC8vIFNpemUgdG8gaW5jbHVkZSBwYWRkaW5nLCBpY29uLCBzdGF0dXMgaWNvbiAoaWYgYW55KSwgc3BsaXQgYW5ub3RhdGlvbiAoaWYgYW55KSwgKyBhIGxpdHRsZSBtb3JlXG5cdFx0Y29uc3QgYWRkaXRpb25hbFdpZHRoID0gNDA7XG5cdFx0Y29uc3Qgc3RhdHVzSWNvbldpZHRoID0gaW5zdGFuY2Uuc3RhdHVzTGlzdC5zdGF0dXNlcy5sZW5ndGggPiAwID8gV2lkdGhDb25zdGFudHMuU3RhdHVzSWNvbiA6IDA7XG5cdFx0Y29uc3Qgc3BsaXRBbm5vdGF0aW9uV2lkdGggPSAodGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZSk/LnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCB8fCAwKSA+IDEgPyBXaWR0aENvbnN0YW50cy5TcGxpdEFubm90YXRpb24gOiAwO1xuXHRcdHJldHVybiBhZGRpdGlvbmFsV2lkdGggKyBzcGxpdEFubm90YXRpb25XaWR0aCArIHN0YXR1c0ljb25XaWR0aDtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZU9uRGlkU2FzaENoYW5nZSgpOiB2b2lkIHtcblx0XHRjb25zdCBsaXN0V2lkdGggPSB0aGlzLl9zcGxpdFZpZXcuZ2V0Vmlld1NpemUodGhpcy5fdGFiVHJlZUluZGV4KTtcblx0XHRpZiAoIXRoaXMuX3dpZHRoIHx8IGxpc3RXaWR0aCA8PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZUxpc3RXaWR0aChsaXN0V2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTGlzdFdpZHRoKHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAod2lkdGggPCBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTWlkcG9pbnRWaWV3V2lkdGggJiYgd2lkdGggPj0gVGVybWluYWxUYWJzTGlzdFNpemVzLk5hcnJvd1ZpZXdXaWR0aCkge1xuXHRcdFx0d2lkdGggPSBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTmFycm93Vmlld1dpZHRoO1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlc2l6ZVZpZXcodGhpcy5fdGFiVHJlZUluZGV4LCB3aWR0aCk7XG5cdFx0fSBlbHNlIGlmICh3aWR0aCA+PSBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTWlkcG9pbnRWaWV3V2lkdGggJiYgd2lkdGggPCBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuV2lkZVZpZXdNaW5pbXVtV2lkdGgpIHtcblx0XHRcdHdpZHRoID0gVGVybWluYWxUYWJzTGlzdFNpemVzLldpZGVWaWV3TWluaW11bVdpZHRoO1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlc2l6ZVZpZXcodGhpcy5fdGFiVHJlZUluZGV4LCB3aWR0aCk7XG5cdFx0fVxuXHRcdHRoaXMucmVyZW5kZXJUYWJzKCk7XG5cdFx0Y29uc3Qgd2lkdGhLZXkgPSB0aGlzLl9wYW5lbE9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCA/IFRlcm1pbmFsU3RvcmFnZUtleXMuVGFic0xpc3RXaWR0aFZlcnRpY2FsIDogVGVybWluYWxTdG9yYWdlS2V5cy5UYWJzTGlzdFdpZHRoSG9yaXpvbnRhbDtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSh3aWR0aEtleSwgd2lkdGgsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBTcGxpdFZpZXcodGVybWluYWxPdXRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zcGxpdFZpZXcub25EaWRTYXNoUmVzZXQoKCkgPT4gdGhpcy5faGFuZGxlT25EaWRTYXNoUmVzZXQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NwbGl0Vmlldy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4gdGhpcy5faGFuZGxlT25EaWRTYXNoQ2hhbmdlKCkpKTtcblxuXHRcdGlmICh0aGlzLl9zaG91bGRTaG93VGFicygpKSB7XG5cdFx0XHR0aGlzLl9hZGRUYWJUcmVlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3NwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdGVsZW1lbnQ6IHRlcm1pbmFsT3V0ZXJDb250YWluZXIsXG5cdFx0XHRsYXlvdXQ6IHdpZHRoID0+IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdyb3Vwcy5mb3JFYWNoKHRhYiA9PiB0YWIubGF5b3V0KHdpZHRoLCB0aGlzLl9oZWlnaHQgfHwgMCkpLFxuXHRcdFx0bWluaW11bVNpemU6IDEyMCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRvbkRpZENoYW5nZTogKCkgPT4gRGlzcG9zYWJsZS5Ob25lLFxuXHRcdFx0cHJpb3JpdHk6IExheW91dFByaW9yaXR5LkhpZ2hcblx0XHR9LCBTaXppbmcuRGlzdHJpYnV0ZSwgdGhpcy5fdGVybWluYWxDb250YWluZXJJbmRleCk7XG5cblx0XHRpZiAodGhpcy5fc2hvdWxkU2hvd1RhYnMoKSkge1xuXHRcdFx0dGhpcy5fYWRkU2FzaExpc3RlbmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWRkVGFiVHJlZSgpIHtcblx0XHR0aGlzLl9zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRlbGVtZW50OiB0aGlzLl90YWJDb250YWluZXIsXG5cdFx0XHRsYXlvdXQ6IHdpZHRoID0+IHRoaXMuX3RhYkxpc3QubGF5b3V0KHRoaXMuX2hlaWdodCB8fCAwLCB3aWR0aCksXG5cdFx0XHRtaW5pbXVtU2l6ZTogVGVybWluYWxUYWJzTGlzdFNpemVzLk5hcnJvd1ZpZXdXaWR0aCxcblx0XHRcdG1heGltdW1TaXplOiBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTWF4aW11bVdpZHRoLFxuXHRcdFx0b25EaWRDaGFuZ2U6ICgpID0+IERpc3Bvc2FibGUuTm9uZSxcblx0XHRcdHByaW9yaXR5OiBMYXlvdXRQcmlvcml0eS5Mb3dcblx0XHR9LCBTaXppbmcuRGlzdHJpYnV0ZSwgdGhpcy5fdGFiVHJlZUluZGV4KTtcblx0XHR0aGlzLnJlcmVuZGVyVGFicygpO1xuXHR9XG5cblx0cmVyZW5kZXJUYWJzKCkge1xuXHRcdHRoaXMuX3VwZGF0ZUhhc1RleHQoKTtcblx0XHR0aGlzLl90YWJMaXN0LnJlZnJlc2goKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZFNhc2hMaXN0ZW5lcigpIHtcblx0XHRsZXQgaW50ZXJ2YWw6IElEaXNwb3NhYmxlO1xuXHRcdHRoaXMuX3Nhc2hEaXNwb3NhYmxlcyA9IFtcblx0XHRcdHRoaXMuX3NwbGl0Vmlldy5zYXNoZXNbMF0ub25EaWRTdGFydChlID0+IHtcblx0XHRcdFx0aW50ZXJ2YWwgPSBkb20uZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKGRvbS5nZXRXaW5kb3codGhpcy5fc3BsaXRWaWV3LmVsKSwgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucmVyZW5kZXJUYWJzKCk7XG5cdFx0XHRcdH0sIDEwMCk7XG5cdFx0XHR9KSxcblx0XHRcdHRoaXMuX3NwbGl0Vmlldy5zYXNoZXNbMF0ub25EaWRFbmQoZSA9PiB7XG5cdFx0XHRcdGludGVydmFsLmRpc3Bvc2UoKTtcblx0XHRcdH0pXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZVNhc2hMaXN0ZW5lcigpIHtcblx0XHRpZiAodGhpcy5fc2FzaERpc3Bvc2FibGVzKSB7XG5cdFx0XHRkaXNwb3NlKHRoaXMuX3Nhc2hEaXNwb3NhYmxlcyk7XG5cdFx0XHR0aGlzLl9zYXNoRGlzcG9zYWJsZXMgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlSGFzVGV4dCgpIHtcblx0XHRjb25zdCBoYXNUZXh0ID0gdGhpcy5fdGFiTGlzdEVsZW1lbnQuY2xpZW50V2lkdGggPiBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuTWlkcG9pbnRWaWV3V2lkdGg7XG5cdFx0dGhpcy5fdGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy10ZXh0JywgaGFzVGV4dCk7XG5cdFx0dGhpcy5fdGVybWluYWxJc1RhYnNOYXJyb3dDb250ZXh0S2V5LnNldCghaGFzVGV4dCk7XG5cdFx0dGhpcy5fdXBkYXRlQ2hhdFRlcm1pbmFsc0VudHJ5KCk7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0SXRlbUhlaWdodCA9IHRoaXMuX2NoYXRFbnRyeT8uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScgPyAwIDogdGhpcy5fY2hhdEVudHJ5Py5lbGVtZW50LmNsaWVudEhlaWdodDtcblx0XHR0aGlzLl9oZWlnaHQgPSBoZWlnaHQgLSAoY2hhdEl0ZW1IZWlnaHQgPz8gMCk7XG5cdFx0dGhpcy5fd2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLl9zcGxpdFZpZXcubGF5b3V0KHdpZHRoKTtcblx0XHRpZiAodGhpcy5fc2hvdWxkU2hvd1RhYnMoKSkge1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlc2l6ZVZpZXcodGhpcy5fdGFiVHJlZUluZGV4LCB0aGlzLl9nZXRMYXN0TGlzdFdpZHRoKCkpO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVIYXNUZXh0KCk7XG5cdH1cblxuXG5cdHByaXZhdGUgX2F0dGFjaEV2ZW50TGlzdGVuZXJzKHBhcmVudERvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LCB0ZXJtaW5hbENvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RhYkNvbnRhaW5lciwgJ21vdXNlbGVhdmUnLCBhc3luYyAoZXZlbnQ6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsVGFic01vdXNlQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaFNob3dUYWJzKCk7XG5cdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YWJDb250YWluZXIsICdtb3VzZWVudGVyJywgYXN5bmMgKGV2ZW50OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFRhYnNNb3VzZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdGFiQ29udGFpbmVyLCAnZHJhZ2VudGVyJywgKGV2ZW50OiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5fc2hvdWxkSGFuZGxlRW1wdHlBcmVhRHJvcChldmVudCkpIHtcblx0XHRcdFx0dGhpcy5fcmVzZXRFbXB0eUFyZWFEcm9wU3RhdGUoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZW1wdHlBcmVhRHJvcFRhcmdldENvdW50Kys7XG5cdFx0XHR0aGlzLl9zZXRFbXB0eUFyZWFEcm9wU3RhdGUodHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdGFiQ29udGFpbmVyLCAnZHJhZ292ZXInLCAoZXZlbnQ6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zaG91bGRIYW5kbGVFbXB0eUFyZWFEcm9wKGV2ZW50KSkge1xuXHRcdFx0XHR0aGlzLl9yZXNldEVtcHR5QXJlYURyb3BTdGF0ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0dGhpcy5fc2V0RW1wdHlBcmVhRHJvcFN0YXRlKHRydWUpO1xuXHRcdFx0aWYgKGV2ZW50LmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRldmVudC5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdtb3ZlJztcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YWJDb250YWluZXIsICdkcmFnbGVhdmUnLCAoZXZlbnQ6IERyYWdFdmVudCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zaG91bGRIYW5kbGVFbXB0eUFyZWFEcm9wKGV2ZW50KSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3RhYkNvbnRhaW5lci5jb250YWlucyhldmVudC5yZWxhdGVkVGFyZ2V0IGFzIE5vZGUgfCBudWxsKSkge1xuXHRcdFx0XHRcdHRoaXMuX3Jlc2V0RW1wdHlBcmVhRHJvcFN0YXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3RhYkNvbnRhaW5lci5jb250YWlucyhldmVudC5yZWxhdGVkVGFyZ2V0IGFzIE5vZGUgfCBudWxsKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lbXB0eUFyZWFEcm9wVGFyZ2V0Q291bnQgPSBNYXRoLm1heCgwLCB0aGlzLl9lbXB0eUFyZWFEcm9wVGFyZ2V0Q291bnQgLSAxKTtcblx0XHRcdGlmICh0aGlzLl9lbXB0eUFyZWFEcm9wVGFyZ2V0Q291bnQgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcmVzZXRFbXB0eUFyZWFEcm9wU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YWJDb250YWluZXIsICdkcm9wJywgKGV2ZW50OiBEcmFnRXZlbnQpID0+IHtcblx0XHRcdGlmICghdGhpcy5fc2hvdWxkSGFuZGxlRW1wdHlBcmVhRHJvcChldmVudCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLl9oYW5kbGVDb250YWluZXJEcm9wKGV2ZW50KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZXJtaW5hbENvbnRhaW5lciwgJ21vdXNlZG93bicsIGFzeW5jIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgdGVybWluYWwgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5pbnN0YW5jZXMubGVuZ3RoID4gMCAmJiB0ZXJtaW5hbCkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbC5oYW5kbGVNb3VzZUV2ZW50KGV2ZW50LCB0aGlzLl9pbnN0YW5jZU1lbnUpO1xuXHRcdFx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ29iamVjdCcgJiYgcmVzdWx0LmNhbmNlbENvbnRleHRNZW51KSB7XG5cdFx0XHRcdFx0dGhpcy5fY2FuY2VsQ29udGV4dE1lbnUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVybWluYWxDb250YWluZXIsICdjb250ZXh0bWVudScsIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgcmlnaHRDbGlja0JlaGF2aW9yID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcucmlnaHRDbGlja0JlaGF2aW9yO1xuXHRcdFx0aWYgKHJpZ2h0Q2xpY2tCZWhhdmlvciA9PT0gJ25vdGhpbmcnICYmICFldmVudC5zaGlmdEtleSkge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxDb250ZXh0TWVudSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHR0ZXJtaW5hbENvbnRhaW5lci5mb2N1cygpO1xuXHRcdFx0aWYgKCF0aGlzLl9jYW5jZWxDb250ZXh0TWVudSkge1xuXHRcdFx0XHRvcGVuQ29udGV4dE1lbnUoZG9tLmdldFdpbmRvdyh0ZXJtaW5hbENvbnRhaW5lciksIGV2ZW50LCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVJbnN0YW5jZSwgdGhpcy5faW5zdGFuY2VNZW51LCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UpO1xuXHRcdFx0fVxuXHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5fY2FuY2VsQ29udGV4dE1lbnUgPSBmYWxzZTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YWJDb250YWluZXIsICdjb250ZXh0bWVudScsIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgcmlnaHRDbGlja0JlaGF2aW9yID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcucmlnaHRDbGlja0JlaGF2aW9yO1xuXHRcdFx0aWYgKHJpZ2h0Q2xpY2tCZWhhdmlvciA9PT0gJ25vdGhpbmcnICYmICFldmVudC5zaGlmdEtleSkge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxDb250ZXh0TWVudSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2NhbmNlbENvbnRleHRNZW51KSB7XG5cdFx0XHRcdGNvbnN0IGVtcHR5TGlzdCA9IHRoaXMuX3RhYkxpc3QuZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDA7XG5cdFx0XHRcdGlmICghZW1wdHlMaXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UubGFzdEFjY2Vzc2VkTWVudSA9ICd0YWItbGlzdCc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBQdXQgdGhlIGZvY3VzZWQgaXRlbSBmaXJzdCBhcyBpdCdzIHVzZWQgYXMgdGhlIGZpcnN0IHBvc2l0aW9uYWwgYXJndW1lbnRcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRJbnN0YW5jZXMgPSB0aGlzLl90YWJMaXN0LmdldFNlbGVjdGVkRWxlbWVudHMoKTtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZEluc3RhbmNlID0gdGhpcy5fdGFiTGlzdC5nZXRGb2N1c2VkRWxlbWVudHMoKT8uWzBdO1xuXHRcdFx0XHRpZiAoZm9jdXNlZEluc3RhbmNlKSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRJbnN0YW5jZXMuc3BsaWNlKHNlbGVjdGVkSW5zdGFuY2VzLmZpbmRJbmRleChlID0+IGUuaW5zdGFuY2VJZCA9PT0gZm9jdXNlZEluc3RhbmNlLmluc3RhbmNlSWQpLCAxKTtcblx0XHRcdFx0XHRzZWxlY3RlZEluc3RhbmNlcy51bnNoaWZ0KGZvY3VzZWRJbnN0YW5jZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvcGVuQ29udGV4dE1lbnUoZG9tLmdldFdpbmRvdyh0aGlzLl90YWJDb250YWluZXIpLCBldmVudCwgc2VsZWN0ZWRJbnN0YW5jZXMsIGVtcHR5TGlzdCA/IHRoaXMuX3RhYnNMaXN0RW1wdHlNZW51IDogdGhpcy5fdGFic0xpc3RNZW51LCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UsIGVtcHR5TGlzdCA/IHRoaXMuX2dldFRhYkFjdGlvbnMoKSA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZXZlbnQuc3RvcEltbWVkaWF0ZVByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9jYW5jZWxDb250ZXh0TWVudSA9IGZhbHNlO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlcm1pbmFsQ29udGFpbmVyLm93bmVyRG9jdW1lbnQsICdrZXlkb3duJywgKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHR0ZXJtaW5hbENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdhbHQtYWN0aXZlJywgISFldmVudC5hbHRLZXkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlcm1pbmFsQ29udGFpbmVyLm93bmVyRG9jdW1lbnQsICdrZXl1cCcsIChldmVudDogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0dGVybWluYWxDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWx0LWFjdGl2ZScsICEhZXZlbnQuYWx0S2V5KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYXJlbnREb21FbGVtZW50LCAna2V5dXAnLCAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSAyNykge1xuXHRcdFx0XHQvLyBLZWVwIHRlcm1pbmFsIG9wZW4gb24gZXNjYXBlXG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3RhYkNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5GT0NVU19JTiwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fdGVybWluYWxUYWJzRm9jdXNDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl90YWJDb250YWluZXIsIGRvbS5FdmVudFR5cGUuRk9DVVNfT1VULCAoKSA9PiB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFRhYnNGb2N1c0NvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRIYW5kbGVFbXB0eUFyZWFEcm9wKGV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCB0YXJnZXROb2RlID0gZXZlbnQudGFyZ2V0IGFzIE5vZGUgfCBudWxsO1xuXHRcdGlmICh0YXJnZXROb2RlICYmICh0aGlzLl90YWJMaXN0RG9tRWxlbWVudC5jb250YWlucyh0YXJnZXROb2RlKSB8fCB0aGlzLl90YWJMaXN0RWxlbWVudC5jb250YWlucyh0YXJnZXROb2RlKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICEhZXZlbnQuZGF0YVRyYW5zZmVyICYmIGNvbnRhaW5zRHJhZ1R5cGUoZXZlbnQsIFRlcm1pbmFsRGF0YVRyYW5zZmVycy5UZXJtaW5hbHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RW1wdHlBcmVhRHJvcFN0YXRlKGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3RhYkxpc3RDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZHJvcC10YXJnZXQnLCBhY3RpdmUpO1xuXHRcdHRoaXMuX3RhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkcm9wLXRhcmdldCcsIGFjdGl2ZSk7XG5cdFx0dGhpcy5fY2hhdEVudHJ5Py5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2Ryb3AtdGFyZ2V0JywgYWN0aXZlKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0RW1wdHlBcmVhRHJvcFN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VtcHR5QXJlYURyb3BUYXJnZXRDb3VudCA9IDA7XG5cdFx0dGhpcy5fc2V0RW1wdHlBcmVhRHJvcFN0YXRlKGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUNvbnRhaW5lckRyb3AoZXZlbnQ6IERyYWdFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0dGhpcy5fcmVzZXRFbXB0eUFyZWFEcm9wU3RhdGUoKTtcblx0XHRjb25zdCBwcmltYXJ5QmFja2VuZCA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRQcmltYXJ5QmFja2VuZCgpO1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IGdldFRlcm1pbmFsUmVzb3VyY2VzRnJvbURyYWdFdmVudChldmVudCk7XG5cdFx0bGV0IHNvdXJjZUluc3RhbmNlczogSVRlcm1pbmFsSW5zdGFuY2VbXSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTxJUHJvY2Vzc0RldGFpbHMgfCB1bmRlZmluZWQ+W10gPSBbXTtcblx0XHRpZiAocmVzb3VyY2VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UodXJpKTtcblx0XHRcdFx0aWYgKGluc3RhbmNlKSB7XG5cdFx0XHRcdFx0aWYgKHNvdXJjZUluc3RhbmNlcykge1xuXHRcdFx0XHRcdFx0c291cmNlSW5zdGFuY2VzLnB1c2goaW5zdGFuY2UpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzb3VyY2VJbnN0YW5jZXMgPSBbaW5zdGFuY2VdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UubW92ZVRvVGVybWluYWxWaWV3KGluc3RhbmNlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChwcmltYXJ5QmFja2VuZCkge1xuXHRcdFx0XHRcdGNvbnN0IHRlcm1pbmFsSWRlbnRpZmllciA9IHBhcnNlVGVybWluYWxVcmkodXJpKTtcblx0XHRcdFx0XHRpZiAodGVybWluYWxJZGVudGlmaWVyLmluc3RhbmNlSWQpIHtcblx0XHRcdFx0XHRcdHByb21pc2VzLnB1c2gocHJpbWFyeUJhY2tlbmQucmVxdWVzdERldGFjaEluc3RhbmNlKHRlcm1pbmFsSWRlbnRpZmllci53b3Jrc3BhY2VJZCwgdGVybWluYWxJZGVudGlmaWVyLmluc3RhbmNlSWQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHByb21pc2VzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcHJvY2Vzc2VzID0gKGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKSkuZmlsdGVyKChwcm9jZXNzKTogcHJvY2VzcyBpcyBJUHJvY2Vzc0RldGFpbHMgPT4gISFwcm9jZXNzKTtcblx0XHRcdGxldCBsYXN0SW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRcdFx0Zm9yIChjb25zdCBhdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyBvZiBwcm9jZXNzZXMpIHtcblx0XHRcdFx0bGFzdEluc3RhbmNlID0gYXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgY29uZmlnOiB7IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzIH0gfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobGFzdEluc3RhbmNlKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShsYXN0SW5zdGFuY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXNvdXJjZUluc3RhbmNlcyB8fCAhc291cmNlSW5zdGFuY2VzLmxlbmd0aCkge1xuXHRcdFx0c291cmNlSW5zdGFuY2VzID0gdGhpcy5fdGFiTGlzdC5nZXRTZWxlY3RlZEVsZW1lbnRzKCk7XG5cdFx0XHRpZiAoIXNvdXJjZUluc3RhbmNlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5tb3ZlR3JvdXBUb0VuZChzb3VyY2VJbnN0YW5jZXMpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShzb3VyY2VJbnN0YW5jZXNbMF0pO1xuXHRcdGNvbnN0IGluZGV4ZXMgPSBzb3VyY2VJbnN0YW5jZXNcblx0XHRcdC5tYXAoaW5zdGFuY2UgPT4gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLmluZGV4T2YoaW5zdGFuY2UpKVxuXHRcdFx0LmZpbHRlcihpbmRleCA9PiBpbmRleCA+PSAwKTtcblx0XHRpZiAoaW5kZXhlcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3RhYkxpc3Quc2V0U2VsZWN0aW9uKGluZGV4ZXMpO1xuXHRcdFx0dGhpcy5fdGFiTGlzdC5zZXRGb2N1cyhbaW5kZXhlc1swXV0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFRhYkFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChUZXJtaW5hbFNldHRpbmdJZC5UYWJzTG9jYXRpb24pLnVzZXJWYWx1ZSA9PT0gJ2xlZnQnID9cblx0XHRcdFx0bmV3IEFjdGlvbignbW92ZVJpZ2h0JywgbG9jYWxpemUoJ21vdmVUYWJzUmlnaHQnLCBcIk1vdmUgVGFicyBSaWdodFwiKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5UYWJzTG9jYXRpb24sICdyaWdodCcpO1xuXHRcdFx0XHR9KSA6XG5cdFx0XHRcdG5ldyBBY3Rpb24oJ21vdmVMZWZ0JywgbG9jYWxpemUoJ21vdmVUYWJzTGVmdCcsIFwiTW92ZSBUYWJzIExlZnRcIiksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGVybWluYWxTZXR0aW5nSWQuVGFic0xvY2F0aW9uLCAnbGVmdCcpO1xuXHRcdFx0XHR9KSxcblx0XHRcdG5ldyBBY3Rpb24oJ2hpZGVUYWJzJywgbG9jYWxpemUoJ2hpZGVUYWJzJywgXCJIaWRlIFRhYnNcIiksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlRhYnNFbmFibGVkLCBmYWxzZSk7XG5cdFx0XHR9KVxuXHRcdF07XG5cdH1cblxuXHRzZXRFZGl0YWJsZShpc0VkaXRpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIWlzRWRpdGluZykge1xuXHRcdFx0dGhpcy5fdGFiTGlzdC5kb21Gb2N1cygpO1xuXHRcdH1cblx0XHR0aGlzLl90YWJMaXN0LnJlZnJlc2goZmFsc2UpO1xuXHR9XG5cblx0Zm9jdXNUYWJzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2hvdWxkU2hvd1RhYnMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl90ZXJtaW5hbFRhYnNGb2N1c0NvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdGNvbnN0IHNlbGVjdGVkID0gdGhpcy5fdGFiTGlzdC5nZXRTZWxlY3Rpb24oKTtcblx0XHR0aGlzLl90YWJMaXN0LmRvbUZvY3VzKCk7XG5cdFx0aWYgKHNlbGVjdGVkKSB7XG5cdFx0XHR0aGlzLl90YWJMaXN0LnNldEZvY3VzKHNlbGVjdGVkKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1cygpIHtcblx0XHRpZiAodGhpcy5fdGVybWluYWxTZXJ2aWNlLmNvbm5lY3Rpb25TdGF0ZSA9PT0gVGVybWluYWxDb25uZWN0aW9uU3RhdGUuQ29ubmVjdGVkKSB7XG5cdFx0XHR0aGlzLl9mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSB0ZXJtaW5hbCBpcyB3YWl0aW5nIHRvIHJlY29ubmVjdCB0byByZW1vdGUgdGVybWluYWxzLCB0aGVuIHRoZXJlIGlzIG5vIFRlcm1pbmFsSW5zdGFuY2UgeWV0IHRoYXQgY2FuXG5cdFx0Ly8gYmUgZm9jdXNlZC4gU28gd2FpdCBmb3IgY29ubmVjdGlvbiB0byBmaW5pc2gsIHRoZW4gZm9jdXMuXG5cdFx0Y29uc3QgcHJldmlvdXNBY3RpdmVFbGVtZW50ID0gdGhpcy5fdGFiTGlzdEVsZW1lbnQub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50O1xuXHRcdGlmIChwcmV2aW91c0FjdGl2ZUVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZSh0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUpKCgpID0+IHtcblx0XHRcdFx0Ly8gT25seSBmb2N1cyB0aGUgdGVybWluYWwgaWYgdGhlIGFjdGl2ZUVsZW1lbnQgaGFzIG5vdCBjaGFuZ2VkIHNpbmNlIGZvY3VzKCkgd2FzIGNhbGxlZFxuXHRcdFx0XHRpZiAoZG9tLmlzQWN0aXZlRWxlbWVudChwcmV2aW91c0FjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zdG9yZS5kZWxldGUobGlzdGVuZXIpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzSG92ZXIoKSB7XG5cdFx0aWYgKHRoaXMuX3Nob3VsZFNob3dUYWJzKCkpIHtcblx0XHRcdHRoaXMuX3RhYkxpc3QuZm9jdXNIb3ZlcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0Li4uZ2V0SW5zdGFuY2VIb3ZlckluZm8oaW5zdGFuY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKSxcblx0XHRcdHRhcmdldDogdGhpcy5fdGVybWluYWxDb250YWluZXIsXG5cdFx0XHR0cmFwRm9jdXM6IHRydWVcblx0XHR9LCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX2ZvY3VzKCkge1xuXHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlPy5mb2N1c1doZW5SZWFkeSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCLGFBQWEsUUFBUSxpQkFBaUI7QUFDL0QsU0FBUyxZQUFZLGVBQTRCO0FBQ2pELFNBQVMsYUFB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
