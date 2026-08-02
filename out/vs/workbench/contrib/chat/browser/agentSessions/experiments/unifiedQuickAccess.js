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
import "./media/unifiedQuickAccess.css";
import { $, addDisposableListener, EventType } from "../../../../../../base/browser/dom.js";
import { Disposable, DisposableStore, isDisposable } from "../../../../../../base/common/lifecycle.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { localize } from "../../../../../../nls.js";
import { Radio } from "../../../../../../base/browser/ui/radio/radio.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Extensions } from "../../../../../../platform/quickinput/common/quickAccess.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { createInstantHoverDelegate, getDefaultHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Event } from "../../../../../../base/common/event.js";
import { ILayoutService } from "../../../../../../platform/layout/browser/layoutService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ACTION_ID_NEW_CHAT, CHAT_OPEN_ACTION_ID } from "../../actions/chatActions.js";
const SEND_TO_AGENT_ID = "unified-quick-access-send-to-agent";
const DEFAULT_UNIFIED_QUICK_ACCESS_TABS = [
  {
    id: "agentSessions",
    label: localize("agentSessionsTab", "Sessions"),
    prefix: "agent ",
    placeholder: localize("agentSessionsPlaceholder", "Search sessions or type a message..."),
    tooltip: localize("agentSessionsTooltip", "Search sessions or send a message to agent")
  },
  {
    id: "commands",
    label: localize("commandsTab", "Commands"),
    prefix: ">",
    placeholder: localize("commandsPlaceholder", "Search commands..."),
    tooltip: localize("commandsTooltip", "Run commands")
  },
  {
    id: "files",
    label: localize("filesTab", "Files"),
    prefix: "",
    placeholder: localize("filesPlaceholder", "Search files..."),
    tooltip: localize("filesTooltip", "Go to files")
  }
];
let UnifiedQuickAccess = class extends Disposable {
  constructor(tabs, quickInputService, instantiationService, contextKeyService, layoutService, commandService, keybindingService, hoverService) {
    super();
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.layoutService = layoutService;
    this.commandService = commandService;
    this.keybindingService = keybindingService;
    this.hoverService = hoverService;
    this.registry = Registry.as(Extensions.Quickaccess);
    this.mapProviderToDescriptor = /* @__PURE__ */ new Map();
    this._currentDisposables = this._register(new DisposableStore());
    this._providerDisposables = this._register(new DisposableStore());
    this._isInternalValueChange = false;
    // Flag to prevent recursive tab detection
    this._isUpdatingSendToAgent = false;
    this._tabs = tabs ?? DEFAULT_UNIFIED_QUICK_ACCESS_TABS;
  }
  /**
   * Show the unified quick access widget.
   * @param initialTabId Optional tab ID to start with. Defaults to first tab.
   * @param initialValue Optional initial filter value.
   */
  show(initialTabId, initialValue) {
    if (this._currentPicker) {
      return;
    }
    this._currentDisposables.clear();
    const picker = this._currentDisposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    this._currentPicker = picker;
    picker.ignoreFocusOut = false;
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;
    picker.sortByLabel = false;
    const initialTab = initialTabId ? this._tabs.find((t) => t.id === initialTabId) ?? this._tabs[0] : this._tabs[0];
    this._currentTab = initialTab;
    this._injectTabBar(picker);
    this._isInternalValueChange = true;
    picker.value = initialValue ?? "";
    picker.placeholder = initialTab.placeholder;
    this._isInternalValueChange = false;
    this._activateProvider(initialTab, picker);
    this._currentDisposables.add(picker.onDidChangeValue((value) => {
      if (this._isInternalValueChange) {
        return;
      }
      if (this._arrivedViaShortcut) {
        const shortcut = this._arrivedViaShortcut;
        if (!value.startsWith(shortcut)) {
          const filesTab = this._tabs.find((t) => t.id === "files");
          if (filesTab && filesTab !== this._currentTab) {
            this._arrivedViaShortcut = void 0;
            this._switchTab(filesTab, picker, false);
            return;
          }
        }
      }
      const matchingTab = this._detectTabFromValue(value);
      if (matchingTab && matchingTab !== this._currentTab) {
        this._switchTab(matchingTab, picker, true);
      }
      this._updateSendButtonState(value);
      if (this._sendToAgentTimeout) {
        clearTimeout(this._sendToAgentTimeout);
      }
      this._sendToAgentTimeout = setTimeout(() => this._maybeShowSendToAgent(picker), 150);
    }));
    this._currentDisposables.add(picker.onDidAccept(() => {
      const selectedItems = picker.selectedItems;
      const activeItems = picker.activeItems;
      const sendToAgentSelected = selectedItems.length > 0 && selectedItems[0].id === SEND_TO_AGENT_ID;
      const hasRealActiveItem = activeItems.some(
        (item) => item.id !== SEND_TO_AGENT_ID
      );
      let filterText;
      if (this._arrivedViaShortcut && picker.value.startsWith(this._arrivedViaShortcut)) {
        filterText = picker.value.substring(1).trim();
      } else if (this._currentTab) {
        filterText = picker.value.substring(this._currentTab.prefix.length).trim();
      } else {
        filterText = picker.value.trim();
      }
      if (sendToAgentSelected || !hasRealActiveItem && filterText) {
        this._sendMessage(picker.value);
      }
    }));
    this._currentDisposables.add(picker.onDidHide(() => {
      this._providerDisposables.clear();
      this._providerCts?.cancel();
      this._providerCts = void 0;
      this._currentPicker = void 0;
      this._currentTab = void 0;
      this._arrivedViaShortcut = void 0;
      if (this._sendToAgentTimeout) {
        clearTimeout(this._sendToAgentTimeout);
        this._sendToAgentTimeout = void 0;
      }
      this._tabBarContainer?.remove();
      this._tabBarContainer = void 0;
      this._sendButton = void 0;
      this._sendButtonLabel = void 0;
      this._sendButtonIcon = void 0;
      this._sendButtonHover = void 0;
      this._currentDisposables.clear();
    }));
    picker.show();
  }
  /**
   * Hide the unified quick access widget if visible.
   */
  hide() {
    this._currentPicker?.hide();
  }
  /**
   * Check if the widget is currently visible.
   */
  get isVisible() {
    return !!this._currentPicker;
  }
  /**
   * Inject the custom tab bar into the picker's header area.
   */
  _injectTabBar(picker) {
    const showDisposable = this._currentDisposables.add(Event.once(this.quickInputService.onShow)(() => {
      this._currentDisposables.delete(showDisposable);
      const quickInputWidget = this.layoutService.activeContainer.querySelector(".quick-input-widget");
      if (!quickInputWidget) {
        return;
      }
      const header = quickInputWidget.querySelector(".quick-input-header");
      const list = quickInputWidget.querySelector(".quick-input-list");
      if (!header || !list) {
        return;
      }
      const tabBarContainer = $("div.unified-quick-access-tabs");
      this._tabBarContainer = tabBarContainer;
      const hoverDelegate = this._currentDisposables.add(createInstantHoverDelegate());
      const radioItems = this._tabs.map((tab) => ({
        text: tab.label,
        tooltip: tab.tooltip,
        isActive: tab === this._currentTab
      }));
      const radio = this._currentDisposables.add(new Radio({
        items: radioItems,
        hoverDelegate
      }));
      tabBarContainer.appendChild(radio.domNode);
      this._currentDisposables.add(radio.onDidSelect((index) => {
        const selectedTab = this._tabs[index];
        if (selectedTab && selectedTab !== this._currentTab) {
          this._switchTab(selectedTab, picker, false);
        }
      }));
      const sendButton = this._createSendButton(picker);
      tabBarContainer.appendChild(sendButton);
      list.parentElement?.insertBefore(tabBarContainer, list);
      picker._unifiedRadio = radio;
    }));
  }
  /**
   * Create the send button.
   */
  _createSendButton(picker) {
    const container = $("div.unified-quick-access-send-container");
    const button = $("button.unified-send-button");
    button.setAttribute("type", "button");
    this._sendButton = button;
    const icon = renderIcon(Codicon.send);
    icon.classList.add("unified-send-icon");
    this._sendButtonIcon = icon;
    button.appendChild(icon);
    const labelSpan = $("span.unified-send-label");
    this._sendButtonLabel = labelSpan;
    button.appendChild(labelSpan);
    container.appendChild(button);
    this._sendButtonHover = this._currentDisposables.add(
      this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), button, "")
    );
    this._updateSendButtonState(picker.value);
    this._currentDisposables.add(addDisposableListener(button, EventType.CLICK, (e) => {
      e.preventDefault();
      e.stopPropagation();
      const hasInput = picker.value.trim().length > 0;
      if (hasInput) {
        this._sendMessageRaw(picker.value);
      } else {
        this._openChat();
      }
    }));
    return container;
  }
  /**
   * Update the send button label and tooltip based on input state.
   */
  _updateSendButtonState(value) {
    if (!this._sendButton || !this._sendButtonLabel || !this._sendButtonIcon) {
      return;
    }
    const hasInput = value.trim().length > 0;
    if (hasInput) {
      this._sendButtonLabel.textContent = localize("send", "Send");
      this._sendButtonHover?.update(localize("sendTooltipNoKeybinding", "Send message to new agent session"));
      this._sendButtonIcon.style.display = "";
    } else {
      const openChatKeybinding = this.keybindingService.lookupKeybinding(CHAT_OPEN_ACTION_ID);
      const openChatLabel = openChatKeybinding?.getLabel() ?? "";
      this._sendButtonLabel.textContent = localize("openChat", "Open Chat");
      const tooltip = openChatLabel ? localize("openChatTooltipWithKeybinding", "Open chat ({0})", openChatLabel) : localize("openChatTooltipNoKeybinding", "Open chat");
      this._sendButtonHover?.update(tooltip);
      this._sendButtonIcon.style.display = "none";
    }
  }
  /**
   * Open chat without sending a message.
   */
  _openChat() {
    this.hide();
    this.commandService.executeCommand(CHAT_OPEN_ACTION_ID);
  }
  /**
   * Send the exact message to a new agent session (no prefix stripping).
   */
  async _sendMessageRaw(value) {
    const message = value.trim();
    if (!message) {
      return;
    }
    this.hide();
    await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
    const options = {
      query: message,
      isPartialQuery: false
    };
    this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, options);
  }
  /**
   * Send the current message to a new agent session (strips prefix or shortcut character).
   */
  async _sendMessage(value) {
    let message = value;
    if (this._arrivedViaShortcut && message.startsWith(this._arrivedViaShortcut)) {
      message = message.substring(1).trim();
    } else if (this._currentTab) {
      if (value.startsWith(this._currentTab.prefix)) {
        message = value.substring(this._currentTab.prefix.length).trim();
      }
    }
    if (!message) {
      return;
    }
    this.hide();
    await this.commandService.executeCommand(ACTION_ID_NEW_CHAT);
    const options = {
      query: message,
      isPartialQuery: false
    };
    this.commandService.executeCommand(CHAT_OPEN_ACTION_ID, options);
  }
  /**
   * Check if we should show the "send to agent" item.
   * Always shows it as the first item when user has typed something.
   */
  _maybeShowSendToAgent(picker) {
    if (this._isUpdatingSendToAgent) {
      return;
    }
    let filterText;
    if (this._arrivedViaShortcut && picker.value.startsWith(this._arrivedViaShortcut)) {
      filterText = picker.value.substring(1).trim();
    } else if (this._currentTab) {
      filterText = picker.value.substring(this._currentTab.prefix.length).trim();
    } else {
      filterText = picker.value.trim();
    }
    const fullInput = picker.value.trim();
    const messageToSend = filterText || fullInput;
    if (!messageToSend) {
      return;
    }
    if (picker.busy) {
      return;
    }
    const firstItem = picker.items[0];
    if (firstItem?.id === SEND_TO_AGENT_ID && firstItem.description === fullInput) {
      return;
    }
    const sendItem = {
      id: SEND_TO_AGENT_ID,
      label: `$(send) ${localize("sendToAgentLabel", "Send to agent")}`,
      description: fullInput,
      alwaysShow: true,
      ariaLabel: localize("sendToAgentAria", "Send message to agent: {0}", fullInput)
    };
    const currentItems = picker.items.filter(
      (item) => item.id !== SEND_TO_AGENT_ID
    );
    const isSessionsTab = this._currentTab?.id === "agentSessions";
    const hasOtherItems = currentItems.length > 0;
    const showFirst = isSessionsTab || !hasOtherItems;
    this._isUpdatingSendToAgent = true;
    try {
      if (showFirst) {
        picker.items = [sendItem, ...currentItems];
      } else {
        picker.items = currentItems;
      }
    } finally {
      this._isUpdatingSendToAgent = false;
    }
  }
  /**
   * Switch to a different tab.
   */
  _switchTab(tab, picker, preserveFilterText) {
    if (tab === this._currentTab) {
      return;
    }
    const previousTab = this._currentTab;
    this._currentTab = tab;
    const radio = picker._unifiedRadio;
    if (radio) {
      const index = this._tabs.indexOf(tab);
      if (index >= 0) {
        radio.setActiveItem(index);
      }
    }
    this._isInternalValueChange = true;
    if (preserveFilterText && previousTab) {
      const currentValue = picker.value;
      let filterText = currentValue;
      if (currentValue.startsWith(previousTab.prefix)) {
        filterText = currentValue.substring(previousTab.prefix.length);
      }
      if (this._arrivedViaShortcut === "<" && tab.id === "agentSessions") {
        filterText = filterText.replace(/^<+/, "");
        picker.value = "<" + filterText;
      } else if (this._arrivedViaShortcut === ">" && tab.id === "commands") {
        filterText = filterText.replace(/^>+/, "");
        picker.value = ">" + filterText;
      } else {
        picker.value = tab.prefix + filterText;
      }
    } else if (previousTab) {
      const currentValue = picker.value;
      if (currentValue.startsWith(previousTab.prefix)) {
        picker.value = currentValue.substring(previousTab.prefix.length);
      }
      if (picker.value.startsWith("<") || picker.value.startsWith(">")) {
        picker.value = picker.value.substring(1);
      }
      this._arrivedViaShortcut = void 0;
    }
    this._isInternalValueChange = false;
    picker.placeholder = tab.placeholder;
    this._activateProvider(tab, picker);
  }
  /**
   * Detect which tab matches the current value based on prefix.
   * Only switches away from current tab if user explicitly typed a different prefix.
   * Supports shortcut keys: ">" for Commands, "<" for Sessions.
   */
  _detectTabFromValue(value) {
    if (value === "<" || value.startsWith("<")) {
      const sessionsTab = this._tabs.find((t) => t.id === "agentSessions");
      if (sessionsTab && this._currentTab?.id !== "agentSessions") {
        this._arrivedViaShortcut = "<";
        return sessionsTab;
      }
    }
    if (value === ">" || value.startsWith(">")) {
      const commandsTab = this._tabs.find((t) => t.id === "commands");
      if (commandsTab && this._currentTab?.id !== "commands") {
        this._arrivedViaShortcut = ">";
        return commandsTab;
      }
    }
    if (this._currentTab && value.startsWith(this._currentTab.prefix)) {
      return this._currentTab;
    }
    const sortedTabs = [...this._tabs].filter((tab) => tab.prefix.length > 0).sort((a, b) => b.prefix.length - a.prefix.length);
    return sortedTabs.find((tab) => value.startsWith(tab.prefix));
  }
  /**
   * Activate the provider for a given tab.
   */
  _activateProvider(tab, picker) {
    this._providerDisposables.clear();
    this._providerCts?.cancel();
    this._providerCts = new CancellationTokenSource();
    this._providerDisposables.add(this._providerCts);
    if (tab.isSendTab) {
      picker.busy = false;
      picker.items = [{
        label: localize("pressSendOrEnter", "Press Enter or click Send to create a new agent session"),
        alwaysShow: true
      }];
      return;
    }
    picker.items = [];
    picker.busy = true;
    const [provider] = this._getOrInstantiateProvider(tab.prefix);
    if (provider) {
      const tabPrefix = tab.prefix;
      const arrivedViaShortcut = this._arrivedViaShortcut;
      picker.filterValue = (value) => {
        if (arrivedViaShortcut && value.startsWith(arrivedViaShortcut)) {
          return value.substring(1);
        }
        if (value.startsWith(tabPrefix)) {
          return value.substring(tabPrefix.length);
        }
        return value;
      };
      const providerDisposable = provider.provide(picker, this._providerCts.token);
      this._providerDisposables.add(providerDisposable);
    } else {
      picker.busy = false;
      picker.items = [{
        label: localize("noProvider", "No provider available for this tab"),
        alwaysShow: true
      }];
    }
  }
  /**
   * Get or create a provider instance for the given prefix.
   */
  _getOrInstantiateProvider(prefix) {
    const providerDescriptor = this.registry.getQuickAccessProvider(prefix, this.contextKeyService);
    if (!providerDescriptor) {
      return [void 0, void 0];
    }
    let provider = this.mapProviderToDescriptor.get(providerDescriptor);
    if (!provider) {
      provider = this.instantiationService.createInstance(providerDescriptor.ctor);
      this.mapProviderToDescriptor.set(providerDescriptor, provider);
    }
    return [provider, providerDescriptor];
  }
  dispose() {
    this._providerCts?.cancel();
    for (const provider of this.mapProviderToDescriptor.values()) {
      if (isDisposable(provider)) {
        provider.dispose();
      }
    }
    super.dispose();
  }
};
UnifiedQuickAccess = __decorateClass([
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, ILayoutService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IHoverService)
], UnifiedQuickAccess);
export {
  DEFAULT_UNIFIED_QUICK_ACCESS_TABS,
  UnifiedQuickAccess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL3VuaWZpZWRRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS91bmlmaWVkUXVpY2tBY2Nlc3MuY3NzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGlzRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2ssIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJhZGlvLCBJUmFkaW9PcHRpb25JdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3JhZGlvL3JhZGlvLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElRdWlja0FjY2Vzc1Byb3ZpZGVyLCBJUXVpY2tBY2Nlc3NQcm92aWRlckRlc2NyaXB0b3IsIElRdWlja0FjY2Vzc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSwgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQUNUSU9OX0lEX05FV19DSEFULCBDSEFUX09QRU5fQUNUSU9OX0lELCBJQ2hhdFZpZXdPcGVuT3B0aW9ucyB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuXG4vKiogTWFya2VyIElEIGZvciB0aGUgXCJzZW5kIHRvIGFnZW50XCIgcXVpY2sgcGljayBpdGVtICovXG5jb25zdCBTRU5EX1RPX0FHRU5UX0lEID0gJ3VuaWZpZWQtcXVpY2stYWNjZXNzLXNlbmQtdG8tYWdlbnQnO1xuXG4vKipcbiAqIFRhYiBjb25maWd1cmF0aW9uIGZvciB0aGUgdW5pZmllZCBxdWljayBhY2Nlc3Mgd2lkZ2V0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElVbmlmaWVkUXVpY2tBY2Nlc3NUYWIge1xuXHQvKiogVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSB0YWIgKi9cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0LyoqIERpc3BsYXkgbGFiZWwgZm9yIHRoZSB0YWIgKi9cblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0LyoqIFF1aWNrIGFjY2VzcyBwcm92aWRlciBwcmVmaXggKGUuZy4sICcnIGZvciBmaWxlcywgJz4nIGZvciBjb21tYW5kcywgJ2FnZW50ICcgZm9yIHNlc3Npb25zKSAqL1xuXHRyZWFkb25seSBwcmVmaXg6IHN0cmluZztcblx0LyoqIFBsYWNlaG9sZGVyIHRleHQgd2hlbiB0aGlzIHRhYiBpcyBhY3RpdmUgKi9cblx0cmVhZG9ubHkgcGxhY2Vob2xkZXI6IHN0cmluZztcblx0LyoqIFRvb2x0aXAgZm9yIHRoZSB0YWIgKi9cblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZztcblx0LyoqIFdoZXRoZXIgdGhpcyBpcyB0aGUgc3BlY2lhbCBTZW5kIHRhYiAobm8gcHJvdmlkZXIsIGp1c3Qgc2VuZHMgcXVlcnkpICovXG5cdHJlYWRvbmx5IGlzU2VuZFRhYj86IGJvb2xlYW47XG59XG5cbi8qKlxuICogRGVmYXVsdCB0YWJzIGZvciB0aGUgdW5pZmllZCBxdWljayBhY2Nlc3Mgd2lkZ2V0LlxuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9VTklGSUVEX1FVSUNLX0FDQ0VTU19UQUJTOiBJVW5pZmllZFF1aWNrQWNjZXNzVGFiW10gPSBbXG5cdHtcblx0XHRpZDogJ2FnZW50U2Vzc2lvbnMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRTZXNzaW9uc1RhYicsIFwiU2Vzc2lvbnNcIiksXG5cdFx0cHJlZml4OiAnYWdlbnQgJyxcblx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2FnZW50U2Vzc2lvbnNQbGFjZWhvbGRlcicsIFwiU2VhcmNoIHNlc3Npb25zIG9yIHR5cGUgYSBtZXNzYWdlLi4uXCIpLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zVG9vbHRpcCcsIFwiU2VhcmNoIHNlc3Npb25zIG9yIHNlbmQgYSBtZXNzYWdlIHRvIGFnZW50XCIpLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICdjb21tYW5kcycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdjb21tYW5kc1RhYicsIFwiQ29tbWFuZHNcIiksXG5cdFx0cHJlZml4OiAnPicsXG5cdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdjb21tYW5kc1BsYWNlaG9sZGVyJywgXCJTZWFyY2ggY29tbWFuZHMuLi5cIiksXG5cdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NvbW1hbmRzVG9vbHRpcCcsIFwiUnVuIGNvbW1hbmRzXCIpLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICdmaWxlcycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdmaWxlc1RhYicsIFwiRmlsZXNcIiksXG5cdFx0cHJlZml4OiAnJyxcblx0XHRwbGFjZWhvbGRlcjogbG9jYWxpemUoJ2ZpbGVzUGxhY2Vob2xkZXInLCBcIlNlYXJjaCBmaWxlcy4uLlwiKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZmlsZXNUb29sdGlwJywgXCJHbyB0byBmaWxlc1wiKSxcblx0fSxcbl07XG5cbi8qKlxuICogU2VydmljZSBmb3Igc2hvd2luZyBhIHVuaWZpZWQgcXVpY2sgYWNjZXNzIHdpZGdldCB3aXRoIG11bHRpcGxlIHRhYnMuXG4gKiBDb21iaW5lcyBtdWx0aXBsZSBRdWlja0FjY2Vzc1Byb3ZpZGVycyBpbnRvIGEgc2luZ2xlIHRhYmJlZCBpbnRlcmZhY2UuXG4gKi9cbmV4cG9ydCBjbGFzcyBVbmlmaWVkUXVpY2tBY2Nlc3MgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFByb3ZpZGVyVG9EZXNjcmlwdG9yID0gbmV3IE1hcDxJUXVpY2tBY2Nlc3NQcm92aWRlckRlc2NyaXB0b3IsIElRdWlja0FjY2Vzc1Byb3ZpZGVyPigpO1xuXG5cdHByaXZhdGUgX2N1cnJlbnRQaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfcHJvdmlkZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2N1cnJlbnRUYWI6IElVbmlmaWVkUXVpY2tBY2Nlc3NUYWIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Byb3ZpZGVyQ3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGFiQmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNJbnRlcm5hbFZhbHVlQ2hhbmdlID0gZmFsc2U7IC8vIEZsYWcgdG8gcHJldmVudCByZWN1cnNpdmUgdGFiIGRldGVjdGlvblxuXHRwcml2YXRlIF9pc1VwZGF0aW5nU2VuZFRvQWdlbnQgPSBmYWxzZTsgLy8gR3VhcmQgdG8gcHJldmVudCBpbmZpbml0ZSBsb29wXG5cdHByaXZhdGUgX2Fycml2ZWRWaWFTaG9ydGN1dDogJzwnIHwgJz4nIHwgdW5kZWZpbmVkOyAvLyBUcmFjayBpZiB3ZSBhcnJpdmVkIGF0IGN1cnJlbnQgdGFiIHZpYSBzaG9ydGN1dCBrZXlcblx0cHJpdmF0ZSBfc2VuZFRvQWdlbnRUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2VuZEJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NlbmRCdXR0b25MYWJlbDogSFRNTFNwYW5FbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZW5kQnV0dG9uSWNvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NlbmRCdXR0b25Ib3ZlcjogeyB1cGRhdGU6IChjb250ZW50OiBzdHJpbmcpID0+IHZvaWQgfSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90YWJzOiBJVW5pZmllZFF1aWNrQWNjZXNzVGFiW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dGFiczogSVVuaWZpZWRRdWlja0FjY2Vzc1RhYltdIHwgdW5kZWZpbmVkLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3RhYnMgPSB0YWJzID8/IERFRkFVTFRfVU5JRklFRF9RVUlDS19BQ0NFU1NfVEFCUztcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93IHRoZSB1bmlmaWVkIHF1aWNrIGFjY2VzcyB3aWRnZXQuXG5cdCAqIEBwYXJhbSBpbml0aWFsVGFiSWQgT3B0aW9uYWwgdGFiIElEIHRvIHN0YXJ0IHdpdGguIERlZmF1bHRzIHRvIGZpcnN0IHRhYi5cblx0ICogQHBhcmFtIGluaXRpYWxWYWx1ZSBPcHRpb25hbCBpbml0aWFsIGZpbHRlciB2YWx1ZS5cblx0ICovXG5cdHNob3coaW5pdGlhbFRhYklkPzogc3RyaW5nLCBpbml0aWFsVmFsdWU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBJZiBhbHJlYWR5IHNob3dpbmcsIGp1c3QgZm9jdXNcblx0XHRpZiAodGhpcy5fY3VycmVudFBpY2tlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gQ3JlYXRlIHBpY2tlclxuXHRcdGNvbnN0IHBpY2tlcjogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+ID0gdGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHR0aGlzLl9jdXJyZW50UGlja2VyID0gcGlja2VyO1xuXG5cdFx0Ly8gQ29uZmlndXJlIHBpY2tlclxuXHRcdHBpY2tlci5pZ25vcmVGb2N1c091dCA9IGZhbHNlO1xuXHRcdHBpY2tlci5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHBpY2tlci5tYXRjaE9uRGV0YWlsID0gdHJ1ZTtcblx0XHRwaWNrZXIuc29ydEJ5TGFiZWwgPSBmYWxzZTtcblxuXHRcdC8vIEZpbmQgaW5pdGlhbCB0YWJcblx0XHRjb25zdCBpbml0aWFsVGFiID0gaW5pdGlhbFRhYklkXG5cdFx0XHQ/IHRoaXMuX3RhYnMuZmluZCh0ID0+IHQuaWQgPT09IGluaXRpYWxUYWJJZCkgPz8gdGhpcy5fdGFic1swXVxuXHRcdFx0OiB0aGlzLl90YWJzWzBdO1xuXHRcdHRoaXMuX2N1cnJlbnRUYWIgPSBpbml0aWFsVGFiO1xuXG5cdFx0Ly8gQ3JlYXRlIGFuZCBpbmplY3QgdGFiIGJhciBpbnRvIHRoZSBwaWNrZXJcblx0XHR0aGlzLl9pbmplY3RUYWJCYXIocGlja2VyKTtcblxuXHRcdC8vIFNldCBpbml0aWFsIHZhbHVlIGFuZCBhY3RpdmF0ZSB0YWJcblx0XHQvLyBTdGFydCB3aXRoIGVtcHR5IHZhbHVlIChkb24ndCBwcmVmaWxsIHByZWZpeCkgc28gdXNlciBjYW4gdHlwZSBuYXR1cmFsbHlcblx0XHR0aGlzLl9pc0ludGVybmFsVmFsdWVDaGFuZ2UgPSB0cnVlO1xuXHRcdHBpY2tlci52YWx1ZSA9IGluaXRpYWxWYWx1ZSA/PyAnJztcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBpbml0aWFsVGFiLnBsYWNlaG9sZGVyO1xuXHRcdHRoaXMuX2lzSW50ZXJuYWxWYWx1ZUNoYW5nZSA9IGZhbHNlO1xuXG5cdFx0Ly8gU3RhcnQgcHJvdmlkaW5nIGl0ZW1zIGZvciBpbml0aWFsIHRhYlxuXHRcdHRoaXMuX2FjdGl2YXRlUHJvdmlkZXIoaW5pdGlhbFRhYiwgcGlja2VyKTtcblxuXHRcdC8vIEhhbmRsZSB2YWx1ZSBjaGFuZ2VzIC0gZGV0ZWN0IHByZWZpeCBjaGFuZ2VzIHRvIHN3aXRjaCB0YWJzXG5cdFx0dGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRDaGFuZ2VWYWx1ZSh2YWx1ZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNJbnRlcm5hbFZhbHVlQ2hhbmdlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdXNlciByZW1vdmVkIHRoZSBzaG9ydGN1dCBjaGFyYWN0ZXIgKGluY2x1ZGluZyB3aGVuIGlucHV0IGlzIGVtcHRpZWQpIC0gc3dpdGNoIGJhY2sgdG8gRmlsZXNcblx0XHRcdGlmICh0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQpIHtcblx0XHRcdFx0Y29uc3Qgc2hvcnRjdXQgPSB0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQ7XG5cdFx0XHRcdGlmICghdmFsdWUuc3RhcnRzV2l0aChzaG9ydGN1dCkpIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlc1RhYiA9IHRoaXMuX3RhYnMuZmluZCh0ID0+IHQuaWQgPT09ICdmaWxlcycpO1xuXHRcdFx0XHRcdGlmIChmaWxlc1RhYiAmJiBmaWxlc1RhYiAhPT0gdGhpcy5fY3VycmVudFRhYikge1xuXHRcdFx0XHRcdFx0dGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0dGhpcy5fc3dpdGNoVGFiKGZpbGVzVGFiLCBwaWNrZXIsIGZhbHNlKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWF0Y2hpbmdUYWIgPSB0aGlzLl9kZXRlY3RUYWJGcm9tVmFsdWUodmFsdWUpO1xuXHRcdFx0aWYgKG1hdGNoaW5nVGFiICYmIG1hdGNoaW5nVGFiICE9PSB0aGlzLl9jdXJyZW50VGFiKSB7XG5cdFx0XHRcdHRoaXMuX3N3aXRjaFRhYihtYXRjaGluZ1RhYiwgcGlja2VyLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdC8vIFVwZGF0ZSBzZW5kIGJ1dHRvbiBzdGF0ZSBiYXNlZCBvbiBpbnB1dFxuXHRcdFx0dGhpcy5fdXBkYXRlU2VuZEJ1dHRvblN0YXRlKHZhbHVlKTtcblx0XHRcdC8vIERlYm91bmNlIHNlbmQtdG8tYWdlbnQgY2hlY2sgdG8gbGV0IHByb3ZpZGVyIGZpbmlzaFxuXHRcdFx0aWYgKHRoaXMuX3NlbmRUb0FnZW50VGltZW91dCkge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fc2VuZFRvQWdlbnRUaW1lb3V0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NlbmRUb0FnZW50VGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5fbWF5YmVTaG93U2VuZFRvQWdlbnQocGlja2VyKSwgMTUwKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgYWNjZXB0IC0gc2VuZCB0byBhZ2VudCBpZiBubyByZWFsIGl0ZW1zIG9yIHNlbmQtdG8tYWdlbnQgaXMgc2VsZWN0ZWRcblx0XHR0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZEl0ZW1zID0gcGlja2VyLnNlbGVjdGVkSXRlbXM7XG5cdFx0XHRjb25zdCBhY3RpdmVJdGVtcyA9IHBpY2tlci5hY3RpdmVJdGVtcztcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgc2VuZC10by1hZ2VudCBpdGVtIGlzIHNlbGVjdGVkXG5cdFx0XHRjb25zdCBzZW5kVG9BZ2VudFNlbGVjdGVkID0gc2VsZWN0ZWRJdGVtcy5sZW5ndGggPiAwICYmXG5cdFx0XHRcdChzZWxlY3RlZEl0ZW1zWzBdIGFzIElRdWlja1BpY2tJdGVtICYgeyBpZD86IHN0cmluZyB9KS5pZCA9PT0gU0VORF9UT19BR0VOVF9JRDtcblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlcmUgYXJlIGFueSByZWFsIGl0ZW1zIGFjdGl2ZSAobm90IHNlbmQtdG8tYWdlbnQpXG5cdFx0XHRjb25zdCBoYXNSZWFsQWN0aXZlSXRlbSA9IGFjdGl2ZUl0ZW1zLnNvbWUoaXRlbSA9PlxuXHRcdFx0XHQoaXRlbSBhcyBJUXVpY2tQaWNrSXRlbSAmIHsgaWQ/OiBzdHJpbmcgfSkuaWQgIT09IFNFTkRfVE9fQUdFTlRfSURcblx0XHRcdCk7XG5cblx0XHRcdC8vIEdldCB0aGUgZmlsdGVyIHRleHQgKHdpdGhvdXQgcHJlZml4IG9yIHNob3J0Y3V0IGNoYXJhY3Rlcilcblx0XHRcdGxldCBmaWx0ZXJUZXh0OiBzdHJpbmc7XG5cdFx0XHRpZiAodGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0ICYmIHBpY2tlci52YWx1ZS5zdGFydHNXaXRoKHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCkpIHtcblx0XHRcdFx0ZmlsdGVyVGV4dCA9IHBpY2tlci52YWx1ZS5zdWJzdHJpbmcoMSkudHJpbSgpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9jdXJyZW50VGFiKSB7XG5cdFx0XHRcdGZpbHRlclRleHQgPSBwaWNrZXIudmFsdWUuc3Vic3RyaW5nKHRoaXMuX2N1cnJlbnRUYWIucHJlZml4Lmxlbmd0aCkudHJpbSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZmlsdGVyVGV4dCA9IHBpY2tlci52YWx1ZS50cmltKCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlbmQgdG8gYWdlbnQgaWY6XG5cdFx0XHQvLyAxLiBTZW5kLXRvLWFnZW50IGl0ZW0gaXMgZXhwbGljaXRseSBzZWxlY3RlZCwgT1Jcblx0XHRcdC8vIDIuIE5vIHJlYWwgaXRlbXMgYXJlIGFjdGl2ZSBBTkQgdXNlciBoYXMgdHlwZWQgc29tZXRoaW5nXG5cdFx0XHRpZiAoc2VuZFRvQWdlbnRTZWxlY3RlZCB8fCAoIWhhc1JlYWxBY3RpdmVJdGVtICYmIGZpbHRlclRleHQpKSB7XG5cdFx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlKHBpY2tlci52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGhpZGVcblx0XHR0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuYWRkKHBpY2tlci5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJDdHM/LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJDdHMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50UGlja2VyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY3VycmVudFRhYiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCA9IHVuZGVmaW5lZDtcblx0XHRcdC8vIENsZWFyIGFueSBwZW5kaW5nIHRpbWVvdXRcblx0XHRcdGlmICh0aGlzLl9zZW5kVG9BZ2VudFRpbWVvdXQpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3NlbmRUb0FnZW50VGltZW91dCk7XG5cdFx0XHRcdHRoaXMuX3NlbmRUb0FnZW50VGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIFJlbW92ZSB0aGUgaW5qZWN0ZWQgdGFiIGJhciBmcm9tIERPTVxuXHRcdFx0dGhpcy5fdGFiQmFyQ29udGFpbmVyPy5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX3RhYkJhckNvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdC8vIENsZWFyIGJ1dHRvbiByZWZlcmVuY2VzXG5cdFx0XHR0aGlzLl9zZW5kQnV0dG9uID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbkxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbkljb24gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9zZW5kQnV0dG9uSG92ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTaG93IHBpY2tlclxuXHRcdHBpY2tlci5zaG93KCk7XG5cdH1cblxuXHQvKipcblx0ICogSGlkZSB0aGUgdW5pZmllZCBxdWljayBhY2Nlc3Mgd2lkZ2V0IGlmIHZpc2libGUuXG5cdCAqL1xuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRQaWNrZXI/LmhpZGUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVjayBpZiB0aGUgd2lkZ2V0IGlzIGN1cnJlbnRseSB2aXNpYmxlLlxuXHQgKi9cblx0Z2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9jdXJyZW50UGlja2VyO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluamVjdCB0aGUgY3VzdG9tIHRhYiBiYXIgaW50byB0aGUgcGlja2VyJ3MgaGVhZGVyIGFyZWEuXG5cdCAqL1xuXHRwcml2YXRlIF9pbmplY3RUYWJCYXIocGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4pOiB2b2lkIHtcblx0XHQvLyBXYWl0IGZvciBwaWNrZXIgdG8gYmUgc2hvd24gdG8gYWNjZXNzIERPTVxuXHRcdGNvbnN0IHNob3dEaXNwb3NhYmxlID0gdGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHRoaXMucXVpY2tJbnB1dFNlcnZpY2Uub25TaG93KSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuZGVsZXRlKHNob3dEaXNwb3NhYmxlKTtcblxuXHRcdFx0Ly8gRmluZCB0aGUgcXVpY2sgaW5wdXQgd2lkZ2V0IGNvbnRhaW5lciB2aWEgbGF5b3V0IHNlcnZpY2Vcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgcXVpY2tJbnB1dFdpZGdldCA9IHRoaXMubGF5b3V0U2VydmljZS5hY3RpdmVDb250YWluZXIucXVlcnlTZWxlY3RvcignLnF1aWNrLWlucHV0LXdpZGdldCcpO1xuXHRcdFx0aWYgKCFxdWlja0lucHV0V2lkZ2V0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmluZCB0aGUgaGVhZGVyIGVsZW1lbnQgKGNvbnRhaW5zIGlucHV0IGJveCkgYW5kIGxpc3QgZWxlbWVudFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBxdWlja0lucHV0V2lkZ2V0LnF1ZXJ5U2VsZWN0b3IoJy5xdWljay1pbnB1dC1oZWFkZXInKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgbGlzdCA9IHF1aWNrSW5wdXRXaWRnZXQucXVlcnlTZWxlY3RvcignLnF1aWNrLWlucHV0LWxpc3QnKTtcblx0XHRcdGlmICghaGVhZGVyIHx8ICFsaXN0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ3JlYXRlIHRhYiBiYXIgY29udGFpbmVyXG5cdFx0XHRjb25zdCB0YWJCYXJDb250YWluZXIgPSAkKCdkaXYudW5pZmllZC1xdWljay1hY2Nlc3MtdGFicycpO1xuXHRcdFx0dGhpcy5fdGFiQmFyQ29udGFpbmVyID0gdGFiQmFyQ29udGFpbmVyO1xuXG5cdFx0XHQvLyBDcmVhdGUgUmFkaW8gd2lkZ2V0IGZvciB0YWJzXG5cdFx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gdGhpcy5fY3VycmVudERpc3Bvc2FibGVzLmFkZChjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblx0XHRcdGNvbnN0IHJhZGlvSXRlbXM6IElSYWRpb09wdGlvbkl0ZW1bXSA9IHRoaXMuX3RhYnMubWFwKHRhYiA9PiAoe1xuXHRcdFx0XHR0ZXh0OiB0YWIubGFiZWwsXG5cdFx0XHRcdHRvb2x0aXA6IHRhYi50b29sdGlwLFxuXHRcdFx0XHRpc0FjdGl2ZTogdGFiID09PSB0aGlzLl9jdXJyZW50VGFiLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCByYWRpbyA9IHRoaXMuX2N1cnJlbnREaXNwb3NhYmxlcy5hZGQobmV3IFJhZGlvKHtcblx0XHRcdFx0aXRlbXM6IHJhZGlvSXRlbXMsXG5cdFx0XHRcdGhvdmVyRGVsZWdhdGUsXG5cdFx0XHR9KSk7XG5cblx0XHRcdHRhYkJhckNvbnRhaW5lci5hcHBlbmRDaGlsZChyYWRpby5kb21Ob2RlKTtcblxuXHRcdFx0Ly8gSGFuZGxlIHRhYiBzZWxlY3Rpb25cblx0XHRcdHRoaXMuX2N1cnJlbnREaXNwb3NhYmxlcy5hZGQocmFkaW8ub25EaWRTZWxlY3QoaW5kZXggPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZFRhYiA9IHRoaXMuX3RhYnNbaW5kZXhdO1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWRUYWIgJiYgc2VsZWN0ZWRUYWIgIT09IHRoaXMuX2N1cnJlbnRUYWIpIHtcblx0XHRcdFx0XHR0aGlzLl9zd2l0Y2hUYWIoc2VsZWN0ZWRUYWIsIHBpY2tlciwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIENyZWF0ZSBzZW5kIGJ1dHRvbiAoZmFyIHJpZ2h0KVxuXHRcdFx0Y29uc3Qgc2VuZEJ1dHRvbiA9IHRoaXMuX2NyZWF0ZVNlbmRCdXR0b24ocGlja2VyKTtcblx0XHRcdHRhYkJhckNvbnRhaW5lci5hcHBlbmRDaGlsZChzZW5kQnV0dG9uKTtcblxuXHRcdFx0Ly8gSW5zZXJ0IHRhYiBiYXIgYmV0d2VlbiB0aGUgaGVhZGVyIChpbnB1dCBib3gpIGFuZCB0aGUgbGlzdCAocmVzdWx0cylcblx0XHRcdGxpc3QucGFyZW50RWxlbWVudD8uaW5zZXJ0QmVmb3JlKHRhYkJhckNvbnRhaW5lciwgbGlzdCk7XG5cblx0XHRcdC8vIFN0b3JlIHJlZmVyZW5jZSB0byByYWRpbyBmb3IgdXBkYXRlc1xuXHRcdFx0KHBpY2tlciBhcyB1bmtub3duIGFzIHsgX3VuaWZpZWRSYWRpbz86IFJhZGlvIH0pLl91bmlmaWVkUmFkaW8gPSByYWRpbztcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIHRoZSBzZW5kIGJ1dHRvbi5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZVNlbmRCdXR0b24ocGlja2VyOiBJUXVpY2tQaWNrPElRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnZGl2LnVuaWZpZWQtcXVpY2stYWNjZXNzLXNlbmQtY29udGFpbmVyJyk7XG5cblx0XHQvLyBDcmVhdGUgc2VuZCBidXR0b25cblx0XHRjb25zdCBidXR0b24gPSAkKCdidXR0b24udW5pZmllZC1zZW5kLWJ1dHRvbicpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdGJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5fc2VuZEJ1dHRvbiA9IGJ1dHRvbjtcblxuXHRcdGNvbnN0IGljb24gPSByZW5kZXJJY29uKENvZGljb24uc2VuZCk7XG5cdFx0aWNvbi5jbGFzc0xpc3QuYWRkKCd1bmlmaWVkLXNlbmQtaWNvbicpO1xuXHRcdHRoaXMuX3NlbmRCdXR0b25JY29uID0gaWNvbjtcblx0XHRidXR0b24uYXBwZW5kQ2hpbGQoaWNvbik7XG5cblx0XHRjb25zdCBsYWJlbFNwYW4gPSAkKCdzcGFuLnVuaWZpZWQtc2VuZC1sYWJlbCcpO1xuXHRcdHRoaXMuX3NlbmRCdXR0b25MYWJlbCA9IGxhYmVsU3Bhbjtcblx0XHRidXR0b24uYXBwZW5kQ2hpbGQobGFiZWxTcGFuKTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChidXR0b24pO1xuXG5cdFx0Ly8gU2V0IHVwIG1hbmFnZWQgaG92ZXIgZm9yIHRoZSBidXR0b25cblx0XHR0aGlzLl9zZW5kQnV0dG9uSG92ZXIgPSB0aGlzLl9jdXJyZW50RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0dGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGJ1dHRvbiwgJycpXG5cdFx0KTtcblxuXHRcdC8vIEluaXRpYWxpemUgYnV0dG9uIHN0YXRlXG5cdFx0dGhpcy5fdXBkYXRlU2VuZEJ1dHRvblN0YXRlKHBpY2tlci52YWx1ZSk7XG5cblx0XHQvLyBDbGljayBoYW5kbGVyIC0gYmVoYXZpb3IgZGVwZW5kcyBvbiBpbnB1dCBzdGF0ZVxuXHRcdHRoaXMuX2N1cnJlbnREaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNvbnN0IGhhc0lucHV0ID0gcGlja2VyLnZhbHVlLnRyaW0oKS5sZW5ndGggPiAwO1xuXHRcdFx0aWYgKGhhc0lucHV0KSB7XG5cdFx0XHRcdHRoaXMuX3NlbmRNZXNzYWdlUmF3KHBpY2tlci52YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vcGVuQ2hhdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBzZW5kIGJ1dHRvbiBsYWJlbCBhbmQgdG9vbHRpcCBiYXNlZCBvbiBpbnB1dCBzdGF0ZS5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZVNlbmRCdXR0b25TdGF0ZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zZW5kQnV0dG9uIHx8ICF0aGlzLl9zZW5kQnV0dG9uTGFiZWwgfHwgIXRoaXMuX3NlbmRCdXR0b25JY29uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzSW5wdXQgPSB2YWx1ZS50cmltKCkubGVuZ3RoID4gMDtcblxuXHRcdGlmIChoYXNJbnB1dCkge1xuXHRcdFx0Ly8gU2hvdyBcIlNlbmRcIiB3aXRoIG5vIGtleWJpbmRpbmcgaW4gdG9vbHRpcCAoRW50ZXIgaXMgaW1wbGllZCBieSBxdWljayBwaWNrKVxuXHRcdFx0dGhpcy5fc2VuZEJ1dHRvbkxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3NlbmQnLCBcIlNlbmRcIik7XG5cdFx0XHR0aGlzLl9zZW5kQnV0dG9uSG92ZXI/LnVwZGF0ZShsb2NhbGl6ZSgnc2VuZFRvb2x0aXBOb0tleWJpbmRpbmcnLCBcIlNlbmQgbWVzc2FnZSB0byBuZXcgYWdlbnQgc2Vzc2lvblwiKSk7XG5cdFx0XHR0aGlzLl9zZW5kQnV0dG9uSWNvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNob3cgXCJPcGVuIENoYXRcIiB3aXRoIG9wZW4gY2hhdCBrZXliaW5kaW5nIGFuZCBoaWRlIGljb25cblx0XHRcdGNvbnN0IG9wZW5DaGF0S2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhDSEFUX09QRU5fQUNUSU9OX0lEKTtcblx0XHRcdGNvbnN0IG9wZW5DaGF0TGFiZWwgPSBvcGVuQ2hhdEtleWJpbmRpbmc/LmdldExhYmVsKCkgPz8gJyc7XG5cdFx0XHR0aGlzLl9zZW5kQnV0dG9uTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnb3BlbkNoYXQnLCBcIk9wZW4gQ2hhdFwiKTtcblx0XHRcdGNvbnN0IHRvb2x0aXAgPSBvcGVuQ2hhdExhYmVsXG5cdFx0XHRcdD8gbG9jYWxpemUoJ29wZW5DaGF0VG9vbHRpcFdpdGhLZXliaW5kaW5nJywgXCJPcGVuIGNoYXQgKHswfSlcIiwgb3BlbkNoYXRMYWJlbClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnb3BlbkNoYXRUb29sdGlwTm9LZXliaW5kaW5nJywgXCJPcGVuIGNoYXRcIik7XG5cdFx0XHR0aGlzLl9zZW5kQnV0dG9uSG92ZXI/LnVwZGF0ZSh0b29sdGlwKTtcblx0XHRcdHRoaXMuX3NlbmRCdXR0b25JY29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW4gY2hhdCB3aXRob3V0IHNlbmRpbmcgYSBtZXNzYWdlLlxuXHQgKi9cblx0cHJpdmF0ZSBfb3BlbkNoYXQoKTogdm9pZCB7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDSEFUX09QRU5fQUNUSU9OX0lEKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZW5kIHRoZSBleGFjdCBtZXNzYWdlIHRvIGEgbmV3IGFnZW50IHNlc3Npb24gKG5vIHByZWZpeCBzdHJpcHBpbmcpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VuZE1lc3NhZ2VSYXcodmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSB2YWx1ZS50cmltKCk7XG5cdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSGlkZSB0aGUgcGlja2VyIGZpcnN0XG5cdFx0dGhpcy5oaWRlKCk7XG5cblx0XHQvLyBBbHdheXMgY3JlYXRlIGEgbmV3IGNoYXQgZmlyc3Rcblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFDVElPTl9JRF9ORVdfQ0hBVCk7XG5cblx0XHQvLyBUaGVuIHNlbmQgdGhlIG1lc3NhZ2UgdG8gdGhlIG5ldyBjaGF0XG5cdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRWaWV3T3Blbk9wdGlvbnMgPSB7XG5cdFx0XHRxdWVyeTogbWVzc2FnZSxcblx0XHRcdGlzUGFydGlhbFF1ZXJ5OiBmYWxzZSxcblx0XHR9O1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9PUEVOX0FDVElPTl9JRCwgb3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCB0aGUgY3VycmVudCBtZXNzYWdlIHRvIGEgbmV3IGFnZW50IHNlc3Npb24gKHN0cmlwcyBwcmVmaXggb3Igc2hvcnRjdXQgY2hhcmFjdGVyKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRNZXNzYWdlKHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTdHJpcCBhbnkgcHJlZml4IG9yIHNob3J0Y3V0IGNoYXJhY3RlciBmcm9tIHRoZSB2YWx1ZVxuXHRcdGxldCBtZXNzYWdlID0gdmFsdWU7XG5cblx0XHQvLyBGaXJzdCwgc3RyaXAgc2hvcnRjdXQgY2hhcmFjdGVyIGlmIHdlIGFycml2ZWQgdmlhIHNob3J0Y3V0XG5cdFx0aWYgKHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCAmJiBtZXNzYWdlLnN0YXJ0c1dpdGgodGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0KSkge1xuXHRcdFx0bWVzc2FnZSA9IG1lc3NhZ2Uuc3Vic3RyaW5nKDEpLnRyaW0oKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRUYWIpIHtcblx0XHRcdC8vIE90aGVyd2lzZSBzdHJpcCB0aGUgbm9ybWFsIHByZWZpeFxuXHRcdFx0aWYgKHZhbHVlLnN0YXJ0c1dpdGgodGhpcy5fY3VycmVudFRhYi5wcmVmaXgpKSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSB2YWx1ZS5zdWJzdHJpbmcodGhpcy5fY3VycmVudFRhYi5wcmVmaXgubGVuZ3RoKS50cmltKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFtZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSGlkZSB0aGUgcGlja2VyIGZpcnN0XG5cdFx0dGhpcy5oaWRlKCk7XG5cblx0XHQvLyBBbHdheXMgY3JlYXRlIGEgbmV3IGNoYXQgZmlyc3Rcblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEFDVElPTl9JRF9ORVdfQ0hBVCk7XG5cblx0XHQvLyBUaGVuIHNlbmQgdGhlIG1lc3NhZ2UgdG8gdGhlIG5ldyBjaGF0XG5cdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRWaWV3T3Blbk9wdGlvbnMgPSB7XG5cdFx0XHRxdWVyeTogbWVzc2FnZSxcblx0XHRcdGlzUGFydGlhbFF1ZXJ5OiBmYWxzZSxcblx0XHR9O1xuXHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9PUEVOX0FDVElPTl9JRCwgb3B0aW9ucyk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlY2sgaWYgd2Ugc2hvdWxkIHNob3cgdGhlIFwic2VuZCB0byBhZ2VudFwiIGl0ZW0uXG5cdCAqIEFsd2F5cyBzaG93cyBpdCBhcyB0aGUgZmlyc3QgaXRlbSB3aGVuIHVzZXIgaGFzIHR5cGVkIHNvbWV0aGluZy5cblx0ICovXG5cdHByaXZhdGUgX21heWJlU2hvd1NlbmRUb0FnZW50KHBpY2tlcjogSVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+KTogdm9pZCB7XG5cdFx0Ly8gR3VhcmQgYWdhaW5zdCByZWN1cnNpdmUgY2FsbHNcblx0XHRpZiAodGhpcy5faXNVcGRhdGluZ1NlbmRUb0FnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IHRoZSBmaWx0ZXIgdGV4dCAod2l0aG91dCBwcmVmaXggb3Igc2hvcnRjdXQgY2hhcmFjdGVyKVxuXHRcdGxldCBmaWx0ZXJUZXh0OiBzdHJpbmc7XG5cdFx0aWYgKHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCAmJiBwaWNrZXIudmFsdWUuc3RhcnRzV2l0aCh0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQpKSB7XG5cdFx0XHQvLyBTdHJpcCBzaG9ydGN1dCBjaGFyYWN0ZXJcblx0XHRcdGZpbHRlclRleHQgPSBwaWNrZXIudmFsdWUuc3Vic3RyaW5nKDEpLnRyaW0oKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRUYWIpIHtcblx0XHRcdGZpbHRlclRleHQgPSBwaWNrZXIudmFsdWUuc3Vic3RyaW5nKHRoaXMuX2N1cnJlbnRUYWIucHJlZml4Lmxlbmd0aCkudHJpbSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmaWx0ZXJUZXh0ID0gcGlja2VyLnZhbHVlLnRyaW0oKTtcblx0XHR9XG5cblx0XHQvLyBVc2UgZnVsbCBpbnB1dCBpZiBmaWx0ZXIgdGV4dCBpcyBlbXB0eSBidXQgdGhlcmUncyBpbnB1dCAodXNlciB0eXBlZCB3aXRob3V0IHByZWZpeClcblx0XHRjb25zdCBmdWxsSW5wdXQgPSBwaWNrZXIudmFsdWUudHJpbSgpO1xuXHRcdGNvbnN0IG1lc3NhZ2VUb1NlbmQgPSBmaWx0ZXJUZXh0IHx8IGZ1bGxJbnB1dDtcblxuXHRcdC8vIE9ubHkgc2hvdyBpZiB1c2VyIGhhcyB0eXBlZCBzb21ldGhpbmdcblx0XHRpZiAoIW1lc3NhZ2VUb1NlbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBzaG93IGlmIHBpY2tlciBpcyBzdGlsbCBsb2FkaW5nXG5cdFx0aWYgKHBpY2tlci5idXN5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgc2VuZC10by1hZ2VudCBpcyBhbHJlYWR5IHRoZSBmaXJzdCBpdGVtIHdpdGggc2FtZSBkZXNjcmlwdGlvblxuXHRcdGNvbnN0IGZpcnN0SXRlbSA9IHBpY2tlci5pdGVtc1swXSBhcyBJUXVpY2tQaWNrSXRlbSAmIHsgaWQ/OiBzdHJpbmcgfTtcblx0XHRpZiAoZmlyc3RJdGVtPy5pZCA9PT0gU0VORF9UT19BR0VOVF9JRCAmJiBmaXJzdEl0ZW0uZGVzY3JpcHRpb24gPT09IGZ1bGxJbnB1dCkge1xuXHRcdFx0cmV0dXJuOyAvLyBBbHJlYWR5IHNob3dpbmcgY29ycmVjdCBzZW5kLXRvLWFnZW50IGl0ZW1cblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgdGhlIHNlbmQtdG8tYWdlbnQgaXRlbVxuXHRcdGNvbnN0IHNlbmRJdGVtOiBJUXVpY2tQaWNrSXRlbSAmIHsgaWQ6IHN0cmluZyB9ID0ge1xuXHRcdFx0aWQ6IFNFTkRfVE9fQUdFTlRfSUQsXG5cdFx0XHRsYWJlbDogYCQoc2VuZCkgJHtsb2NhbGl6ZSgnc2VuZFRvQWdlbnRMYWJlbCcsIFwiU2VuZCB0byBhZ2VudFwiKX1gLFxuXHRcdFx0ZGVzY3JpcHRpb246IGZ1bGxJbnB1dCxcblx0XHRcdGFsd2F5c1Nob3c6IHRydWUsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdzZW5kVG9BZ2VudEFyaWEnLCBcIlNlbmQgbWVzc2FnZSB0byBhZ2VudDogezB9XCIsIGZ1bGxJbnB1dCksXG5cdFx0fTtcblxuXHRcdC8vIEdldCBjdXJyZW50IGl0ZW1zLCBleGNsdWRpbmcgYW55IGV4aXN0aW5nIHNlbmQtdG8tYWdlbnQgaXRlbVxuXHRcdGNvbnN0IGN1cnJlbnRJdGVtcyA9IHBpY2tlci5pdGVtcy5maWx0ZXIoaXRlbSA9PlxuXHRcdFx0KGl0ZW0gYXMgSVF1aWNrUGlja0l0ZW0gJiB7IGlkPzogc3RyaW5nIH0pLmlkICE9PSBTRU5EX1RPX0FHRU5UX0lEXG5cdFx0KTtcblxuXHRcdC8vIERldGVybWluZSBpZiB3ZSBzaG91bGQgc2hvdyBzZW5kLXRvLWFnZW50IGFzIGZpcnN0IGl0ZW06XG5cdFx0Ly8gLSBBbHdheXMgb24gU2Vzc2lvbnMgdGFiIChhZ2VudCBzZXNzaW9ucylcblx0XHQvLyAtIE9ubHkgaWYgbm8gb3RoZXIgaXRlbXMgZXhpc3Qgb24gQ29tbWFuZHMvRmlsZXMgdGFic1xuXHRcdGNvbnN0IGlzU2Vzc2lvbnNUYWIgPSB0aGlzLl9jdXJyZW50VGFiPy5pZCA9PT0gJ2FnZW50U2Vzc2lvbnMnO1xuXHRcdGNvbnN0IGhhc090aGVySXRlbXMgPSBjdXJyZW50SXRlbXMubGVuZ3RoID4gMDtcblx0XHRjb25zdCBzaG93Rmlyc3QgPSBpc1Nlc3Npb25zVGFiIHx8ICFoYXNPdGhlckl0ZW1zO1xuXG5cdFx0Ly8gU2V0IGd1YXJkIGFuZCB1cGRhdGUgaXRlbXNcblx0XHR0aGlzLl9pc1VwZGF0aW5nU2VuZFRvQWdlbnQgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoc2hvd0ZpcnN0KSB7XG5cdFx0XHRcdHBpY2tlci5pdGVtcyA9IFtzZW5kSXRlbSwgLi4uY3VycmVudEl0ZW1zXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIERvbid0IHNob3cgc2VuZC10by1hZ2VudCBvbiBDb21tYW5kcy9GaWxlcyB3aGVuIHRoZXJlIGFyZSBtYXRjaGVzXG5cdFx0XHRcdHBpY2tlci5pdGVtcyA9IGN1cnJlbnRJdGVtcztcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNVcGRhdGluZ1NlbmRUb0FnZW50ID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN3aXRjaCB0byBhIGRpZmZlcmVudCB0YWIuXG5cdCAqL1xuXHRwcml2YXRlIF9zd2l0Y2hUYWIodGFiOiBJVW5pZmllZFF1aWNrQWNjZXNzVGFiLCBwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgcHJlc2VydmVGaWx0ZXJUZXh0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRhYiA9PT0gdGhpcy5fY3VycmVudFRhYikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzVGFiID0gdGhpcy5fY3VycmVudFRhYjtcblx0XHR0aGlzLl9jdXJyZW50VGFiID0gdGFiO1xuXG5cdFx0Ly8gVXBkYXRlIFJhZGlvIHNlbGVjdGlvblxuXHRcdGNvbnN0IHJhZGlvID0gKHBpY2tlciBhcyB1bmtub3duIGFzIHsgX3VuaWZpZWRSYWRpbz86IFJhZGlvIH0pLl91bmlmaWVkUmFkaW87XG5cdFx0aWYgKHJhZGlvKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3RhYnMuaW5kZXhPZih0YWIpO1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0cmFkaW8uc2V0QWN0aXZlSXRlbShpbmRleCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHBpY2tlciB2YWx1ZSAod2l0aCBmbGFnIHRvIHByZXZlbnQgcmVjdXJzaXZlIHRhYiBkZXRlY3Rpb24pXG5cdFx0dGhpcy5faXNJbnRlcm5hbFZhbHVlQ2hhbmdlID0gdHJ1ZTtcblx0XHRpZiAocHJlc2VydmVGaWx0ZXJUZXh0ICYmIHByZXZpb3VzVGFiKSB7XG5cdFx0XHQvLyBVc2VyIHR5cGVkIGEgc2hvcnRjdXQgcHJlZml4IC0gbm9ybWFsaXplIHRoZSB2YWx1ZSB0byBzaG93IGp1c3QgdGhlIHNob3J0Y3V0IGNoYXJhY3RlclxuXHRcdFx0Y29uc3QgY3VycmVudFZhbHVlID0gcGlja2VyLnZhbHVlO1xuXG5cdFx0XHQvLyBTdHJpcCBwcmV2aW91cyB0YWIncyBwcmVmaXggaWYgcHJlc2VudFxuXHRcdFx0bGV0IGZpbHRlclRleHQgPSBjdXJyZW50VmFsdWU7XG5cdFx0XHRpZiAoY3VycmVudFZhbHVlLnN0YXJ0c1dpdGgocHJldmlvdXNUYWIucHJlZml4KSkge1xuXHRcdFx0XHRmaWx0ZXJUZXh0ID0gY3VycmVudFZhbHVlLnN1YnN0cmluZyhwcmV2aW91c1RhYi5wcmVmaXgubGVuZ3RoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSGFuZGxlIHNob3J0Y3V0IHRyYW5zaXRpb25zIC0gZW5zdXJlIG9ubHkgb25lIHNob3J0Y3V0IGNoYXIgaXMgc2hvd25cblx0XHRcdGlmICh0aGlzLl9hcnJpdmVkVmlhU2hvcnRjdXQgPT09ICc8JyAmJiB0YWIuaWQgPT09ICdhZ2VudFNlc3Npb25zJykge1xuXHRcdFx0XHQvLyBTdHJpcCBhbnkgbGVhZGluZyBcIjxcIiBjaGFycyBhbmQgc2V0IGp1c3Qgb25lXG5cdFx0XHRcdGZpbHRlclRleHQgPSBmaWx0ZXJUZXh0LnJlcGxhY2UoL148Ky8sICcnKTtcblx0XHRcdFx0cGlja2VyLnZhbHVlID0gJzwnICsgZmlsdGVyVGV4dDtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0ID09PSAnPicgJiYgdGFiLmlkID09PSAnY29tbWFuZHMnKSB7XG5cdFx0XHRcdC8vIFN0cmlwIGFueSBsZWFkaW5nIFwiPlwiIGNoYXJzIGFuZCBzZXQganVzdCBvbmVcblx0XHRcdFx0ZmlsdGVyVGV4dCA9IGZpbHRlclRleHQucmVwbGFjZSgvXj4rLywgJycpO1xuXHRcdFx0XHRwaWNrZXIudmFsdWUgPSAnPicgKyBmaWx0ZXJUZXh0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm9ybWFsIHByZWZpeC1iYXNlZCBzd2l0Y2hpbmdcblx0XHRcdFx0cGlja2VyLnZhbHVlID0gdGFiLnByZWZpeCArIGZpbHRlclRleHQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChwcmV2aW91c1RhYikge1xuXHRcdFx0Ly8gVXNlciBjbGlja2VkIHRhYiAtIGtlZXAgY3VycmVudCB0ZXh0IGJ1dCBzdHJpcCBvbGQgcHJlZml4IChkb24ndCBhZGQgbmV3IHByZWZpeClcblx0XHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHBpY2tlci52YWx1ZTtcblx0XHRcdGlmIChjdXJyZW50VmFsdWUuc3RhcnRzV2l0aChwcmV2aW91c1RhYi5wcmVmaXgpKSB7XG5cdFx0XHRcdHBpY2tlci52YWx1ZSA9IGN1cnJlbnRWYWx1ZS5zdWJzdHJpbmcocHJldmlvdXNUYWIucHJlZml4Lmxlbmd0aCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBBbHNvIHN0cmlwIHNob3J0Y3V0IGNoYXJhY3RlciBpZiBwcmVzZW50XG5cdFx0XHRpZiAocGlja2VyLnZhbHVlLnN0YXJ0c1dpdGgoJzwnKSB8fCBwaWNrZXIudmFsdWUuc3RhcnRzV2l0aCgnPicpKSB7XG5cdFx0XHRcdHBpY2tlci52YWx1ZSA9IHBpY2tlci52YWx1ZS5zdWJzdHJpbmcoMSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDbGVhciBzaG9ydGN1dCB0cmFja2luZyB3aGVuIHN3aXRjaGluZyB2aWEgY2xpY2tcblx0XHRcdHRoaXMuX2Fycml2ZWRWaWFTaG9ydGN1dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gZWxzZTogZmlyc3QgdGFiIGFjdGl2YXRpb24sIHZhbHVlIGFscmVhZHkgc2V0XG5cdFx0dGhpcy5faXNJbnRlcm5hbFZhbHVlQ2hhbmdlID0gZmFsc2U7XG5cblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSB0YWIucGxhY2Vob2xkZXI7XG5cblx0XHQvLyBSZS1hY3RpdmF0ZSBwcm92aWRlclxuXHRcdHRoaXMuX2FjdGl2YXRlUHJvdmlkZXIodGFiLCBwaWNrZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERldGVjdCB3aGljaCB0YWIgbWF0Y2hlcyB0aGUgY3VycmVudCB2YWx1ZSBiYXNlZCBvbiBwcmVmaXguXG5cdCAqIE9ubHkgc3dpdGNoZXMgYXdheSBmcm9tIGN1cnJlbnQgdGFiIGlmIHVzZXIgZXhwbGljaXRseSB0eXBlZCBhIGRpZmZlcmVudCBwcmVmaXguXG5cdCAqIFN1cHBvcnRzIHNob3J0Y3V0IGtleXM6IFwiPlwiIGZvciBDb21tYW5kcywgXCI8XCIgZm9yIFNlc3Npb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGV0ZWN0VGFiRnJvbVZhbHVlKHZhbHVlOiBzdHJpbmcpOiBJVW5pZmllZFF1aWNrQWNjZXNzVGFiIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBDaGVjayBmb3IgXCI8XCIgc2hvcnRjdXQgdG8gc3dpdGNoIHRvIFNlc3Npb25zIChmcm9tIEZpbGVzIG9yIENvbW1hbmRzKVxuXHRcdGlmICh2YWx1ZSA9PT0gJzwnIHx8IHZhbHVlLnN0YXJ0c1dpdGgoJzwnKSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnNUYWIgPSB0aGlzLl90YWJzLmZpbmQodCA9PiB0LmlkID09PSAnYWdlbnRTZXNzaW9ucycpO1xuXHRcdFx0aWYgKHNlc3Npb25zVGFiICYmIHRoaXMuX2N1cnJlbnRUYWI/LmlkICE9PSAnYWdlbnRTZXNzaW9ucycpIHtcblx0XHRcdFx0dGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0ID0gJzwnO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbnNUYWI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIFwiPlwiIHNob3J0Y3V0IHRvIHN3aXRjaCB0byBDb21tYW5kcyAoZnJvbSBGaWxlcyBvciBTZXNzaW9ucylcblx0XHRpZiAodmFsdWUgPT09ICc+JyB8fCB2YWx1ZS5zdGFydHNXaXRoKCc+JykpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRzVGFiID0gdGhpcy5fdGFicy5maW5kKHQgPT4gdC5pZCA9PT0gJ2NvbW1hbmRzJyk7XG5cdFx0XHRpZiAoY29tbWFuZHNUYWIgJiYgdGhpcy5fY3VycmVudFRhYj8uaWQgIT09ICdjb21tYW5kcycpIHtcblx0XHRcdFx0dGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0ID0gJz4nO1xuXHRcdFx0XHRyZXR1cm4gY29tbWFuZHNUYWI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3QgYXV0by1zd2l0Y2ggaWYgY3VycmVudCB0YWIgbWF0Y2hlcyAodXNlciBpcyBqdXN0IHR5cGluZylcblx0XHRpZiAodGhpcy5fY3VycmVudFRhYiAmJiB2YWx1ZS5zdGFydHNXaXRoKHRoaXMuX2N1cnJlbnRUYWIucHJlZml4KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRUYWI7XG5cdFx0fVxuXG5cdFx0Ly8gU29ydCBieSBwcmVmaXggbGVuZ3RoIGRlc2NlbmRpbmcgdG8gbWF0Y2ggbW9zdCBzcGVjaWZpYyBmaXJzdFxuXHRcdC8vIFNraXAgZW1wdHkgcHJlZml4IC0gaXQgd291bGQgbWF0Y2ggZXZlcnl0aGluZ1xuXHRcdGNvbnN0IHNvcnRlZFRhYnMgPSBbLi4udGhpcy5fdGFic11cblx0XHRcdC5maWx0ZXIodGFiID0+IHRhYi5wcmVmaXgubGVuZ3RoID4gMClcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBiLnByZWZpeC5sZW5ndGggLSBhLnByZWZpeC5sZW5ndGgpO1xuXG5cdFx0cmV0dXJuIHNvcnRlZFRhYnMuZmluZCh0YWIgPT4gdmFsdWUuc3RhcnRzV2l0aCh0YWIucHJlZml4KSk7XG5cdH1cblxuXHQvKipcblx0ICogQWN0aXZhdGUgdGhlIHByb3ZpZGVyIGZvciBhIGdpdmVuIHRhYi5cblx0ICovXG5cdHByaXZhdGUgX2FjdGl2YXRlUHJvdmlkZXIodGFiOiBJVW5pZmllZFF1aWNrQWNjZXNzVGFiLCBwaWNrZXI6IElRdWlja1BpY2s8SVF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9Pik6IHZvaWQge1xuXHRcdC8vIENsZWFyIHByZXZpb3VzIHByb3ZpZGVyIHJlc291cmNlc1xuXHRcdHRoaXMuX3Byb3ZpZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9wcm92aWRlckN0cz8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fcHJvdmlkZXJDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9wcm92aWRlckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9wcm92aWRlckN0cyk7XG5cblx0XHQvLyBTcGVjaWFsIGhhbmRsaW5nIGZvciBTZW5kIHRhYiAtIG5vIHByb3ZpZGVyIG5lZWRlZFxuXHRcdGlmICh0YWIuaXNTZW5kVGFiKSB7XG5cdFx0XHRwaWNrZXIuYnVzeSA9IGZhbHNlO1xuXHRcdFx0cGlja2VyLml0ZW1zID0gW3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcmVzc1NlbmRPckVudGVyJywgXCJQcmVzcyBFbnRlciBvciBjbGljayBTZW5kIHRvIGNyZWF0ZSBhIG5ldyBhZ2VudCBzZXNzaW9uXCIpLFxuXHRcdFx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHRcdFx0fV07XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgaXRlbXMgd2hpbGUgbG9hZGluZ1xuXHRcdHBpY2tlci5pdGVtcyA9IFtdO1xuXHRcdHBpY2tlci5idXN5ID0gdHJ1ZTtcblxuXHRcdC8vIEdldCBwcm92aWRlciBmb3IgdGhpcyB0YWIncyBwcmVmaXhcblx0XHRjb25zdCBbcHJvdmlkZXJdID0gdGhpcy5fZ2V0T3JJbnN0YW50aWF0ZVByb3ZpZGVyKHRhYi5wcmVmaXgpO1xuXG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHQvLyBDb25maWd1cmUgZmlsdGVyaW5nIC0gc3RyaXAgdGhlIHRhYidzIHByZWZpeCBvciBzaG9ydGN1dCBjaGFyYWN0ZXIgZnJvbSB0aGUgZmlsdGVyIHZhbHVlXG5cdFx0XHRjb25zdCB0YWJQcmVmaXggPSB0YWIucHJlZml4O1xuXHRcdFx0Y29uc3QgYXJyaXZlZFZpYVNob3J0Y3V0ID0gdGhpcy5fYXJyaXZlZFZpYVNob3J0Y3V0O1xuXHRcdFx0cGlja2VyLmZpbHRlclZhbHVlID0gKHZhbHVlOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Ly8gSWYgYXJyaXZlZCB2aWEgc2hvcnRjdXQsIHN0cmlwIHRoZSBzaG9ydGN1dCBjaGFyYWN0ZXJcblx0XHRcdFx0aWYgKGFycml2ZWRWaWFTaG9ydGN1dCAmJiB2YWx1ZS5zdGFydHNXaXRoKGFycml2ZWRWaWFTaG9ydGN1dCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdmFsdWUuc3Vic3RyaW5nKDEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE90aGVyd2lzZSBzdHJpcCB0aGUgbm9ybWFsIHByZWZpeFxuXHRcdFx0XHRpZiAodmFsdWUuc3RhcnRzV2l0aCh0YWJQcmVmaXgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlLnN1YnN0cmluZyh0YWJQcmVmaXgubGVuZ3RoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBMZXQgcHJvdmlkZXIgcG9wdWxhdGUgdGhlIHBpY2tlclxuXHRcdFx0Y29uc3QgcHJvdmlkZXJEaXNwb3NhYmxlID0gcHJvdmlkZXIucHJvdmlkZShwaWNrZXIsIHRoaXMuX3Byb3ZpZGVyQ3RzLnRva2VuKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyRGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyRGlzcG9zYWJsZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBpY2tlci5idXN5ID0gZmFsc2U7XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ25vUHJvdmlkZXInLCBcIk5vIHByb3ZpZGVyIGF2YWlsYWJsZSBmb3IgdGhpcyB0YWJcIiksXG5cdFx0XHRcdGFsd2F5c1Nob3c6IHRydWUsXG5cdFx0XHR9XTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0IG9yIGNyZWF0ZSBhIHByb3ZpZGVyIGluc3RhbmNlIGZvciB0aGUgZ2l2ZW4gcHJlZml4LlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0T3JJbnN0YW50aWF0ZVByb3ZpZGVyKHByZWZpeDogc3RyaW5nKTogW0lRdWlja0FjY2Vzc1Byb3ZpZGVyIHwgdW5kZWZpbmVkLCBJUXVpY2tBY2Nlc3NQcm92aWRlckRlc2NyaXB0b3IgfCB1bmRlZmluZWRdIHtcblx0XHQvLyBUcnkgdG8gZmluZCBwcm92aWRlciBieSBleGFjdCBwcmVmaXggbWF0Y2ggZmlyc3Rcblx0XHRjb25zdCBwcm92aWRlckRlc2NyaXB0b3IgPSB0aGlzLnJlZ2lzdHJ5LmdldFF1aWNrQWNjZXNzUHJvdmlkZXIocHJlZml4LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGlmICghcHJvdmlkZXJEZXNjcmlwdG9yKSB7XG5cdFx0XHRyZXR1cm4gW3VuZGVmaW5lZCwgdW5kZWZpbmVkXTtcblx0XHR9XG5cblx0XHRsZXQgcHJvdmlkZXIgPSB0aGlzLm1hcFByb3ZpZGVyVG9EZXNjcmlwdG9yLmdldChwcm92aWRlckRlc2NyaXB0b3IpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHByb3ZpZGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShwcm92aWRlckRlc2NyaXB0b3IuY3Rvcik7XG5cdFx0XHR0aGlzLm1hcFByb3ZpZGVyVG9EZXNjcmlwdG9yLnNldChwcm92aWRlckRlc2NyaXB0b3IsIHByb3ZpZGVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW3Byb3ZpZGVyLCBwcm92aWRlckRlc2NyaXB0b3JdO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm92aWRlckN0cz8uY2FuY2VsKCk7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLm1hcFByb3ZpZGVyVG9EZXNjcmlwdG9yLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoaXNEaXNwb3NhYmxlKHByb3ZpZGVyKSkge1xuXHRcdFx0XHRwcm92aWRlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLHVCQUF1QixpQkFBaUI7QUFDcEQsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUywwQkFBc0Q7QUFDL0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxn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
