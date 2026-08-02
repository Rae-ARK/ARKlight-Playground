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
import * as DOM from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionBar, ActionsOrientation } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Widget } from "../../../../base/browser/ui/widget.js";
import { Action } from "../../../../base/common/actions.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { TrackedRangeStickiness } from "../../../../editor/common/model.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { ContextScopedHistoryInputBox } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { showHistoryKeybindingHint } from "../../../../platform/history/browser/historyWidgetKeybindingHint.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { asCssVariable, badgeBackground, badgeForeground, contrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { isWorkspaceFolder, IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { settingsEditIcon, settingsScopeDropDownIcon } from "./preferencesIcons.js";
let FolderSettingsActionViewItem = class extends BaseActionViewItem {
  constructor(action, contextService, contextMenuService, hoverService) {
    super(null, action);
    this.contextService = contextService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this._folderSettingCounts = /* @__PURE__ */ new Map();
    const workspace = this.contextService.getWorkspace();
    this._folder = workspace.folders.length === 1 ? workspace.folders[0] : null;
    this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.onWorkspaceFoldersChanged()));
  }
  get folder() {
    return this._folder;
  }
  set folder(folder) {
    this._folder = folder;
    this.update();
  }
  setCount(settingsTarget, count) {
    const workspaceFolder = this.contextService.getWorkspaceFolder(settingsTarget);
    if (!workspaceFolder) {
      throw new Error("unknown folder");
    }
    const folder = workspaceFolder.uri;
    this._folderSettingCounts.set(folder.toString(), count);
    this.update();
  }
  render(container) {
    this.element = container;
    this.container = container;
    this.labelElement = DOM.$(".action-title");
    this.detailsElement = DOM.$(".action-details");
    this.dropDownElement = DOM.$(".dropdown-icon.hide" + ThemeIcon.asCSSSelector(settingsScopeDropDownIcon));
    this.anchorElement = DOM.$("a.action-label.folder-settings", {
      role: "button",
      "aria-haspopup": "true",
      "tabindex": "0"
    }, this.labelElement, this.detailsElement, this.dropDownElement);
    this.anchorElementHover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.anchorElement, ""));
    this._register(DOM.addDisposableListener(this.anchorElement, DOM.EventType.MOUSE_DOWN, (e) => DOM.EventHelper.stop(e)));
    this._register(DOM.addDisposableListener(this.anchorElement, DOM.EventType.CLICK, (e) => this.onClick(e)));
    this._register(DOM.addDisposableListener(this.container, DOM.EventType.KEY_UP, (e) => this.onKeyUp(e)));
    DOM.append(this.container, this.anchorElement);
    this.update();
  }
  onKeyUp(event) {
    const keyboardEvent = new StandardKeyboardEvent(event);
    switch (keyboardEvent.keyCode) {
      case KeyCode.Enter:
      case KeyCode.Space:
        this.onClick(event);
        return;
    }
  }
  onClick(event) {
    DOM.EventHelper.stop(event, true);
    if (!this.folder || this._action.checked) {
      this.showMenu();
    } else {
      this._action.run(this._folder);
    }
  }
  updateEnabled() {
    this.update();
  }
  updateChecked() {
    this.update();
  }
  onWorkspaceFoldersChanged() {
    const oldFolder = this._folder;
    const workspace = this.contextService.getWorkspace();
    if (oldFolder) {
      this._folder = workspace.folders.filter((folder) => isEqual(folder.uri, oldFolder.uri))[0] || workspace.folders[0];
    }
    this._folder = this._folder ? this._folder : workspace.folders.length === 1 ? workspace.folders[0] : null;
    this.update();
    if (this._action.checked) {
      this._action.run(this._folder);
    }
  }
  update() {
    let total = 0;
    this._folderSettingCounts.forEach((n) => total += n);
    const workspace = this.contextService.getWorkspace();
    if (this._folder) {
      this.labelElement.textContent = this._folder.name;
      this.anchorElementHover.update(this._folder.name);
      const detailsText = this.labelWithCount(this._action.label, total);
      this.detailsElement.textContent = detailsText;
      this.dropDownElement.classList.toggle("hide", workspace.folders.length === 1 || !this._action.checked);
    } else {
      const labelText = this.labelWithCount(this._action.label, total);
      this.labelElement.textContent = labelText;
      this.detailsElement.textContent = "";
      this.anchorElementHover.update(this._action.label);
      this.dropDownElement.classList.remove("hide");
    }
    this.anchorElement.classList.toggle("checked", this._action.checked);
    this.container.classList.toggle("disabled", !this._action.enabled);
  }
  showMenu() {
    this.contextMenuService.showContextMenu({
      getAnchor: () => this.container,
      getActions: () => this.getDropdownMenuActions(),
      getActionViewItem: () => void 0,
      onHide: () => {
        this.anchorElement.blur();
      }
    });
  }
  getDropdownMenuActions() {
    const actions = [];
    const workspaceFolders = this.contextService.getWorkspace().folders;
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && workspaceFolders.length > 0) {
      actions.push(...workspaceFolders.map((folder, index) => {
        const folderCount = this._folderSettingCounts.get(folder.uri.toString());
        return {
          id: "folderSettingsTarget" + index,
          label: this.labelWithCount(folder.name, folderCount),
          tooltip: this.labelWithCount(folder.name, folderCount),
          checked: !!this.folder && isEqual(this.folder.uri, folder.uri),
          enabled: true,
          class: void 0,
          run: () => this._action.run(folder)
        };
      }));
    }
    return actions;
  }
  labelWithCount(label, count) {
    if (count) {
      label += ` (${count})`;
    }
    return label;
  }
};
FolderSettingsActionViewItem = __decorateClass([
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IHoverService)
], FolderSettingsActionViewItem);
let SettingsTargetsWidget = class extends Widget {
  constructor(parent, options, contextService, instantiationService, environmentService, labelService, languageService) {
    super();
    this.contextService = contextService;
    this.instantiationService = instantiationService;
    this.environmentService = environmentService;
    this.labelService = labelService;
    this.languageService = languageService;
    this._settingsTarget = null;
    this._onDidTargetChange = this._register(new Emitter());
    this.onDidTargetChange = this._onDidTargetChange.event;
    this.options = options ?? {};
    this.create(parent);
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.onWorkbenchStateChanged()));
    this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.update()));
  }
  resetLabels() {
    const remoteAuthority = this.environmentService.remoteAuthority;
    const hostLabel = remoteAuthority && this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority);
    this.userLocalSettings.label = localize("userSettings", "User");
    this.userRemoteSettings.label = localize("userSettingsRemote", "Remote") + (hostLabel ? ` [${hostLabel}]` : "");
    this.workspaceSettings.label = this.contextService.getWorkspace().name || localize("workspaceSettings", "Workspace");
    this.folderSettingsAction.label = localize("folderSettings", "Folder");
  }
  create(parent) {
    const settingsTabsWidget = DOM.append(parent, DOM.$(".settings-tabs-widget"));
    this.settingsSwitcherBar = this._register(new ActionBar(settingsTabsWidget, {
      orientation: ActionsOrientation.HORIZONTAL,
      focusOnlyEnabledItems: true,
      ariaLabel: localize("settingsSwitcherBarAriaLabel", "Settings Switcher"),
      ariaRole: "tablist",
      actionViewItemProvider: (action, options) => action.id === "folderSettings" ? this.folderSettings : void 0
    }));
    this.userLocalSettings = this._register(new Action("userSettings", "", ".settings-tab", true, () => this.updateTarget(ConfigurationTarget.USER_LOCAL)));
    this.userLocalSettings.tooltip = localize("userSettings", "User");
    this.userRemoteSettings = this._register(new Action("userSettingsRemote", "", ".settings-tab", true, () => this.updateTarget(ConfigurationTarget.USER_REMOTE)));
    const remoteAuthority = this.environmentService.remoteAuthority;
    const hostLabel = remoteAuthority && this.labelService.getHostLabel(Schemas.vscodeRemote, remoteAuthority);
    this.userRemoteSettings.tooltip = localize("userSettingsRemote", "Remote") + (hostLabel ? ` [${hostLabel}]` : "");
    this.workspaceSettings = this._register(new Action("workspaceSettings", "", ".settings-tab", false, () => this.updateTarget(ConfigurationTarget.WORKSPACE)));
    this.folderSettingsAction = this._register(new Action("folderSettings", "", ".settings-tab", false, async (folder) => {
      this.updateTarget(isWorkspaceFolder(folder) ? folder.uri : ConfigurationTarget.USER_LOCAL);
    }));
    this.folderSettings = this._register(this.instantiationService.createInstance(FolderSettingsActionViewItem, this.folderSettingsAction));
    this.resetLabels();
    this.update();
    this.settingsSwitcherBar.push([this.userLocalSettings, this.userRemoteSettings, this.workspaceSettings, this.folderSettingsAction]);
  }
  get settingsTarget() {
    return this._settingsTarget;
  }
  set settingsTarget(settingsTarget) {
    this._settingsTarget = settingsTarget;
    this.userLocalSettings.checked = ConfigurationTarget.USER_LOCAL === this.settingsTarget;
    this.userRemoteSettings.checked = ConfigurationTarget.USER_REMOTE === this.settingsTarget;
    this.workspaceSettings.checked = ConfigurationTarget.WORKSPACE === this.settingsTarget;
    if (this.settingsTarget instanceof URI) {
      this.folderSettings.action.checked = true;
      this.folderSettings.folder = this.contextService.getWorkspaceFolder(this.settingsTarget);
    } else {
      this.folderSettings.action.checked = false;
    }
  }
  setResultCount(settingsTarget, count) {
    if (settingsTarget === ConfigurationTarget.WORKSPACE) {
      let label = this.contextService.getWorkspace().name ?? localize("workspaceSettings", "Workspace");
      if (count) {
        label += ` (${count})`;
      }
      this.workspaceSettings.label = label;
    } else if (settingsTarget === ConfigurationTarget.USER_LOCAL) {
      let label = localize("userSettings", "User");
      if (count) {
        label += ` (${count})`;
      }
      this.userLocalSettings.label = label;
    } else if (settingsTarget instanceof URI) {
      this.folderSettings.setCount(settingsTarget, count);
    }
  }
  updateLanguageFilterIndicators(filter) {
    this.resetLabels();
    if (filter) {
      const languageToUse = this.languageService.getLanguageName(filter);
      if (languageToUse) {
        const languageSuffix = ` [${languageToUse}]`;
        this.userLocalSettings.label += languageSuffix;
        this.userRemoteSettings.label += languageSuffix;
        this.workspaceSettings.label += languageSuffix;
        this.folderSettingsAction.label += languageSuffix;
      }
    }
  }
  onWorkbenchStateChanged() {
    this.folderSettings.folder = null;
    this.update();
    if (this.settingsTarget === ConfigurationTarget.WORKSPACE && this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      this.updateTarget(ConfigurationTarget.USER_LOCAL);
    }
  }
  updateTarget(settingsTarget) {
    const isSameTarget = this.settingsTarget === settingsTarget || settingsTarget instanceof URI && this.settingsTarget instanceof URI && isEqual(this.settingsTarget, settingsTarget);
    if (!isSameTarget) {
      this.settingsTarget = settingsTarget;
      this._onDidTargetChange.fire(this.settingsTarget);
    }
    return Promise.resolve(void 0);
  }
  async update() {
    this.settingsSwitcherBar.domNode.classList.toggle("empty-workbench", this.contextService.getWorkbenchState() === WorkbenchState.EMPTY);
    this.userRemoteSettings.enabled = !!(this.options.enableRemoteSettings && this.environmentService.remoteAuthority);
    this.workspaceSettings.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
    this.folderSettings.action.enabled = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.contextService.getWorkspace().folders.length > 0;
    this.workspaceSettings.tooltip = localize("workspaceSettings", "Workspace");
  }
};
SettingsTargetsWidget = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, ILanguageService)
], SettingsTargetsWidget);
let SearchWidget = class extends Widget {
  constructor(parent, options, contextViewService, instantiationService, contextKeyService, keybindingService) {
    super();
    this.options = options;
    this.contextViewService = contextViewService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.keybindingService = keybindingService;
    this._onDidChange = this._register(new Emitter());
    this._onFocus = this._register(new Emitter());
    this.create(parent);
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get onFocus() {
    return this._onFocus.event;
  }
  create(parent) {
    this.domNode = DOM.append(parent, DOM.$("div.settings-header-widget"));
    this.createSearchContainer(DOM.append(this.domNode, DOM.$("div.settings-search-container")));
    this.controlsDiv = DOM.append(this.domNode, DOM.$("div.settings-search-controls"));
    if (this.options.showResultCount) {
      this.countElement = DOM.append(this.controlsDiv, DOM.$(".settings-count-widget"));
      this.countElement.style.backgroundColor = asCssVariable(badgeBackground);
      this.countElement.style.color = asCssVariable(badgeForeground);
      this.countElement.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
    }
    this.inputBox.inputElement.setAttribute("aria-live", this.options.ariaLive || "off");
    if (this.options.ariaLabelledBy) {
      this.inputBox.inputElement.setAttribute("aria-labelledBy", this.options.ariaLabelledBy);
    }
    const focusTracker = this._register(DOM.trackFocus(this.inputBox.inputElement));
    this._register(focusTracker.onDidFocus(() => this._onFocus.fire()));
    const focusKey = this.options.focusKey;
    if (focusKey) {
      this._register(focusTracker.onDidFocus(() => focusKey.set(true)));
      this._register(focusTracker.onDidBlur(() => focusKey.set(false)));
    }
  }
  createSearchContainer(searchContainer) {
    this.searchContainer = searchContainer;
    const searchInput = DOM.append(this.searchContainer, DOM.$("div.settings-search-input"));
    this.inputBox = this._register(this.createInputBox(searchInput));
    this._register(this.inputBox.onDidChange((value) => this._onDidChange.fire(value)));
  }
  createInputBox(parent) {
    const showHistoryHint = () => showHistoryKeybindingHint(this.keybindingService);
    return new ContextScopedHistoryInputBox(parent, this.contextViewService, { ...this.options, showHistoryHint }, this.contextKeyService);
  }
  showMessage(message) {
    if (this.countElement && message !== this.countElement.textContent) {
      this.countElement.textContent = message;
      this.inputBox.inputElement.setAttribute("aria-label", message);
      this.inputBox.inputElement.style.paddingRight = this.getControlsWidth() + "px";
    }
  }
  layout(dimension) {
    if (dimension.width < 400) {
      this.countElement?.classList.add("hide");
      this.inputBox.inputElement.style.paddingRight = "0px";
    } else {
      this.countElement?.classList.remove("hide");
      this.inputBox.inputElement.style.paddingRight = this.getControlsWidth() + "px";
    }
  }
  getControlsWidth() {
    const countWidth = this.countElement ? DOM.getTotalWidth(this.countElement) : 0;
    return countWidth + 20;
  }
  focus() {
    this.inputBox.focus();
    if (this.getValue()) {
      this.inputBox.select();
    }
  }
  hasFocus() {
    return this.inputBox.hasFocus();
  }
  clear() {
    this.inputBox.value = "";
  }
  getValue() {
    return this.inputBox.value;
  }
  setValue(value) {
    return this.inputBox.value = value;
  }
  dispose() {
    this.options.focusKey?.set(false);
    super.dispose();
  }
};
SearchWidget = __decorateClass([
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IKeybindingService)
], SearchWidget);
class EditPreferenceWidget extends Disposable {
  constructor(editor) {
    super();
    this.editor = editor;
    this._line = -1;
    this._preferences = [];
    this._onClick = this._register(new Emitter());
    this.onClick = this._onClick.event;
    this._editPreferenceDecoration = this.editor.createDecorationsCollection();
    this._register(this.editor.onMouseDown((e) => {
      if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN || e.target.detail.isAfterLines || !this.isVisible()) {
        return;
      }
      this._onClick.fire(e);
    }));
  }
  get preferences() {
    return this._preferences;
  }
  getLine() {
    return this._line;
  }
  show(line, hoverMessage, preferences) {
    this._preferences = preferences;
    const newDecoration = [];
    this._line = line;
    newDecoration.push({
      options: {
        description: "edit-preference-widget-decoration",
        glyphMarginClassName: ThemeIcon.asClassName(settingsEditIcon),
        glyphMarginHoverMessage: new MarkdownString().appendText(hoverMessage),
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      },
      range: {
        startLineNumber: line,
        startColumn: 1,
        endLineNumber: line,
        endColumn: 1
      }
    });
    this._editPreferenceDecoration.set(newDecoration);
  }
  hide() {
    this._editPreferenceDecoration.clear();
  }
  isVisible() {
    return this._editPreferenceDecoration.length > 0;
  }
  dispose() {
    this.hide();
    super.dispose();
  }
}
export {
  EditPreferenceWidget,
  FolderSettingsActionViewItem,
  SearchWidget,
  SettingsTargetsWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvcHJlZmVyZW5jZXNXaWRnZXRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBBY3Rpb25zT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSGlzdG9yeUlucHV0Qm94LCBJSGlzdG9yeUlucHV0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvd2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSUVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IENvbnRleHRTY29wZWRIaXN0b3J5SW5wdXRCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9oaXN0b3J5L2Jyb3dzZXIvY29udGV4dFNjb3BlZEhpc3RvcnlXaWRnZXQuanMnO1xuaW1wb3J0IHsgc2hvd0hpc3RvcnlLZXliaW5kaW5nSGludCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9oaXN0b3J5V2lkZ2V0S2V5YmluZGluZ0hpbnQuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSwgYmFkZ2VCYWNrZ3JvdW5kLCBiYWRnZUZvcmVncm91bmQsIGNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgaXNXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBzZXR0aW5nc0VkaXRJY29uLCBzZXR0aW5nc1Njb3BlRHJvcERvd25JY29uIH0gZnJvbSAnLi9wcmVmZXJlbmNlc0ljb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIEZvbGRlclNldHRpbmdzQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgX2ZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IG51bGw7XG5cdHByaXZhdGUgX2ZvbGRlclNldHRpbmdDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXG5cdHByaXZhdGUgY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYW5jaG9yRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGFuY2hvckVsZW1lbnRIb3ZlciE6IElNYW5hZ2VkSG92ZXI7XG5cdHByaXZhdGUgbGFiZWxFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZGV0YWlsc0VsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkcm9wRG93bkVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbik7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHR0aGlzLl9mb2xkZXIgPSB3b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGggPT09IDEgPyB3b3Jrc3BhY2UuZm9sZGVyc1swXSA6IG51bGw7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy5vbldvcmtzcGFjZUZvbGRlcnNDaGFuZ2VkKCkpKTtcblx0fVxuXG5cdGdldCBmb2xkZXIoKTogSVdvcmtzcGFjZUZvbGRlciB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9mb2xkZXI7XG5cdH1cblxuXHRzZXQgZm9sZGVyKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IG51bGwpIHtcblx0XHR0aGlzLl9mb2xkZXIgPSBmb2xkZXI7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHNldENvdW50KHNldHRpbmdzVGFyZ2V0OiBVUkksIGNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihzZXR0aW5nc1RhcmdldCk7XG5cdFx0aWYgKCF3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcigndW5rbm93biBmb2xkZXInKTtcblx0XHR9XG5cdFx0Y29uc3QgZm9sZGVyID0gd29ya3NwYWNlRm9sZGVyLnVyaTtcblx0XHR0aGlzLl9mb2xkZXJTZXR0aW5nQ291bnRzLnNldChmb2xkZXIudG9TdHJpbmcoKSwgY291bnQpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudCA9IGNvbnRhaW5lcjtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdHRoaXMubGFiZWxFbGVtZW50ID0gRE9NLiQoJy5hY3Rpb24tdGl0bGUnKTtcblx0XHR0aGlzLmRldGFpbHNFbGVtZW50ID0gRE9NLiQoJy5hY3Rpb24tZGV0YWlscycpO1xuXHRcdHRoaXMuZHJvcERvd25FbGVtZW50ID0gRE9NLiQoJy5kcm9wZG93bi1pY29uLmhpZGUnICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Ioc2V0dGluZ3NTY29wZURyb3BEb3duSWNvbikpO1xuXHRcdHRoaXMuYW5jaG9yRWxlbWVudCA9IERPTS4kKCdhLmFjdGlvbi1sYWJlbC5mb2xkZXItc2V0dGluZ3MnLCB7XG5cdFx0XHRyb2xlOiAnYnV0dG9uJyxcblx0XHRcdCdhcmlhLWhhc3BvcHVwJzogJ3RydWUnLFxuXHRcdFx0J3RhYmluZGV4JzogJzAnXG5cdFx0fSwgdGhpcy5sYWJlbEVsZW1lbnQsIHRoaXMuZGV0YWlsc0VsZW1lbnQsIHRoaXMuZHJvcERvd25FbGVtZW50KTtcblx0XHR0aGlzLmFuY2hvckVsZW1lbnRIb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmFuY2hvckVsZW1lbnQsICcnKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmFuY2hvckVsZW1lbnQsIERPTS5FdmVudFR5cGUuTU9VU0VfRE9XTiwgZSA9PiBET00uRXZlbnRIZWxwZXIuc3RvcChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5hbmNob3JFbGVtZW50LCBET00uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHRoaXMub25DbGljayhlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIERPTS5FdmVudFR5cGUuS0VZX1VQLCBlID0+IHRoaXMub25LZXlVcChlKSkpO1xuXG5cdFx0RE9NLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgdGhpcy5hbmNob3JFbGVtZW50KTtcblxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uS2V5VXAoZXZlbnQ6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChldmVudCk7XG5cdFx0c3dpdGNoIChrZXlib2FyZEV2ZW50LmtleUNvZGUpIHtcblx0XHRcdGNhc2UgS2V5Q29kZS5FbnRlcjpcblx0XHRcdGNhc2UgS2V5Q29kZS5TcGFjZTpcblx0XHRcdFx0dGhpcy5vbkNsaWNrKGV2ZW50KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIG9uQ2xpY2soZXZlbnQ6IERPTS5FdmVudExpa2UpOiB2b2lkIHtcblx0XHRET00uRXZlbnRIZWxwZXIuc3RvcChldmVudCwgdHJ1ZSk7XG5cdFx0aWYgKCF0aGlzLmZvbGRlciB8fCB0aGlzLl9hY3Rpb24uY2hlY2tlZCkge1xuXHRcdFx0dGhpcy5zaG93TWVudSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY3Rpb24ucnVuKHRoaXMuX2ZvbGRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUVuYWJsZWQoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDaGVja2VkKCk6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uV29ya3NwYWNlRm9sZGVyc0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkRm9sZGVyID0gdGhpcy5fZm9sZGVyO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0aWYgKG9sZEZvbGRlcikge1xuXHRcdFx0dGhpcy5fZm9sZGVyID0gd29ya3NwYWNlLmZvbGRlcnMuZmlsdGVyKGZvbGRlciA9PiBpc0VxdWFsKGZvbGRlci51cmksIG9sZEZvbGRlci51cmkpKVswXSB8fCB3b3Jrc3BhY2UuZm9sZGVyc1swXTtcblx0XHR9XG5cdFx0dGhpcy5fZm9sZGVyID0gdGhpcy5fZm9sZGVyID8gdGhpcy5fZm9sZGVyIDogd29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID09PSAxID8gd29ya3NwYWNlLmZvbGRlcnNbMF0gOiBudWxsO1xuXG5cdFx0dGhpcy51cGRhdGUoKTtcblxuXHRcdGlmICh0aGlzLl9hY3Rpb24uY2hlY2tlZCkge1xuXHRcdFx0dGhpcy5fYWN0aW9uLnJ1bih0aGlzLl9mb2xkZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xuXHRcdGxldCB0b3RhbCA9IDA7XG5cdFx0dGhpcy5fZm9sZGVyU2V0dGluZ0NvdW50cy5mb3JFYWNoKG4gPT4gdG90YWwgKz0gbik7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGlmICh0aGlzLl9mb2xkZXIpIHtcblx0XHRcdHRoaXMubGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5fZm9sZGVyLm5hbWU7XG5cdFx0XHR0aGlzLmFuY2hvckVsZW1lbnRIb3Zlci51cGRhdGUodGhpcy5fZm9sZGVyLm5hbWUpO1xuXHRcdFx0Y29uc3QgZGV0YWlsc1RleHQgPSB0aGlzLmxhYmVsV2l0aENvdW50KHRoaXMuX2FjdGlvbi5sYWJlbCwgdG90YWwpO1xuXHRcdFx0dGhpcy5kZXRhaWxzRWxlbWVudC50ZXh0Q29udGVudCA9IGRldGFpbHNUZXh0O1xuXHRcdFx0dGhpcy5kcm9wRG93bkVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZScsIHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCA9PT0gMSB8fCAhdGhpcy5fYWN0aW9uLmNoZWNrZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBsYWJlbFRleHQgPSB0aGlzLmxhYmVsV2l0aENvdW50KHRoaXMuX2FjdGlvbi5sYWJlbCwgdG90YWwpO1xuXHRcdFx0dGhpcy5sYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSBsYWJlbFRleHQ7XG5cdFx0XHR0aGlzLmRldGFpbHNFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0aGlzLmFuY2hvckVsZW1lbnRIb3Zlci51cGRhdGUodGhpcy5fYWN0aW9uLmxhYmVsKTtcblx0XHRcdHRoaXMuZHJvcERvd25FbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblx0XHR9XG5cblx0XHR0aGlzLmFuY2hvckVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY2hlY2tlZCcsIHRoaXMuX2FjdGlvbi5jaGVja2VkKTtcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsICF0aGlzLl9hY3Rpb24uZW5hYmxlZCk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dNZW51KCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuY29udGFpbmVyLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXREcm9wZG93bk1lbnVBY3Rpb25zKCksXG5cdFx0XHRnZXRBY3Rpb25WaWV3SXRlbTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuYW5jaG9yRWxlbWVudC5ibHVyKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldERyb3Bkb3duTWVudUFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSAmJiB3b3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdGFjdGlvbnMucHVzaCguLi53b3Jrc3BhY2VGb2xkZXJzLm1hcCgoZm9sZGVyLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJDb3VudCA9IHRoaXMuX2ZvbGRlclNldHRpbmdDb3VudHMuZ2V0KGZvbGRlci51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6ICdmb2xkZXJTZXR0aW5nc1RhcmdldCcgKyBpbmRleCxcblx0XHRcdFx0XHRsYWJlbDogdGhpcy5sYWJlbFdpdGhDb3VudChmb2xkZXIubmFtZSwgZm9sZGVyQ291bnQpLFxuXHRcdFx0XHRcdHRvb2x0aXA6IHRoaXMubGFiZWxXaXRoQ291bnQoZm9sZGVyLm5hbWUsIGZvbGRlckNvdW50KSxcblx0XHRcdFx0XHRjaGVja2VkOiAhIXRoaXMuZm9sZGVyICYmIGlzRXF1YWwodGhpcy5mb2xkZXIudXJpLCBmb2xkZXIudXJpKSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9hY3Rpb24ucnVuKGZvbGRlcilcblx0XHRcdFx0fTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGxhYmVsV2l0aENvdW50KGxhYmVsOiBzdHJpbmcsIGNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdC8vIEFwcGVuZCB0aGUgY291bnQgaWYgaXQncyA+MCBhbmQgbm90IHVuZGVmaW5lZFxuXHRcdGlmIChjb3VudCkge1xuXHRcdFx0bGFiZWwgKz0gYCAoJHtjb3VudH0pYDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgU2V0dGluZ3NUYXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OIHwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMIHwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSB8IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIHwgVVJJO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTZXR0aW5nc1RhcmdldHNXaWRnZXRPcHRpb25zIHtcblx0ZW5hYmxlUmVtb3RlU2V0dGluZ3M/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NUYXJnZXRzV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0IHtcblxuXHRwcml2YXRlIHNldHRpbmdzU3dpdGNoZXJCYXIhOiBBY3Rpb25CYXI7XG5cdHByaXZhdGUgdXNlckxvY2FsU2V0dGluZ3MhOiBBY3Rpb247XG5cdHByaXZhdGUgdXNlclJlbW90ZVNldHRpbmdzITogQWN0aW9uO1xuXHRwcml2YXRlIHdvcmtzcGFjZVNldHRpbmdzITogQWN0aW9uO1xuXHRwcml2YXRlIGZvbGRlclNldHRpbmdzQWN0aW9uITogQWN0aW9uO1xuXHRwcml2YXRlIGZvbGRlclNldHRpbmdzITogRm9sZGVyU2V0dGluZ3NBY3Rpb25WaWV3SXRlbTtcblx0cHJpdmF0ZSBvcHRpb25zOiBJU2V0dGluZ3NUYXJnZXRzV2lkZ2V0T3B0aW9ucztcblxuXHRwcml2YXRlIF9zZXR0aW5nc1RhcmdldDogU2V0dGluZ3NUYXJnZXQgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFRhcmdldENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNldHRpbmdzVGFyZ2V0PigpKTtcblx0cmVhZG9ubHkgb25EaWRUYXJnZXRDaGFuZ2U6IEV2ZW50PFNldHRpbmdzVGFyZ2V0PiA9IHRoaXMuX29uRGlkVGFyZ2V0Q2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0b3B0aW9uczogSVNldHRpbmdzVGFyZ2V0c1dpZGdldE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zID8/IHt9O1xuXHRcdHRoaXMuY3JlYXRlKHBhcmVudCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMub25Xb3JrYmVuY2hTdGF0ZUNoYW5nZWQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXRMYWJlbHMoKSB7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGNvbnN0IGhvc3RMYWJlbCA9IHJlbW90ZUF1dGhvcml0eSAmJiB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWwoU2NoZW1hcy52c2NvZGVSZW1vdGUsIHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0dGhpcy51c2VyTG9jYWxTZXR0aW5ncy5sYWJlbCA9IGxvY2FsaXplKCd1c2VyU2V0dGluZ3MnLCBcIlVzZXJcIik7XG5cdFx0dGhpcy51c2VyUmVtb3RlU2V0dGluZ3MubGFiZWwgPSBsb2NhbGl6ZSgndXNlclNldHRpbmdzUmVtb3RlJywgXCJSZW1vdGVcIikgKyAoaG9zdExhYmVsID8gYCBbJHtob3N0TGFiZWx9XWAgOiAnJyk7XG5cdFx0dGhpcy53b3Jrc3BhY2VTZXR0aW5ncy5sYWJlbCA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkubmFtZSB8fCBsb2NhbGl6ZSgnd29ya3NwYWNlU2V0dGluZ3MnLCBcIldvcmtzcGFjZVwiKTtcblx0XHR0aGlzLmZvbGRlclNldHRpbmdzQWN0aW9uLmxhYmVsID0gbG9jYWxpemUoJ2ZvbGRlclNldHRpbmdzJywgXCJGb2xkZXJcIik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2V0dGluZ3NUYWJzV2lkZ2V0ID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCcuc2V0dGluZ3MtdGFicy13aWRnZXQnKSk7XG5cdFx0dGhpcy5zZXR0aW5nc1N3aXRjaGVyQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihzZXR0aW5nc1RhYnNXaWRnZXQsIHtcblx0XHRcdG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTCxcblx0XHRcdGZvY3VzT25seUVuYWJsZWRJdGVtczogdHJ1ZSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3NldHRpbmdzU3dpdGNoZXJCYXJBcmlhTGFiZWwnLCBcIlNldHRpbmdzIFN3aXRjaGVyXCIpLFxuXHRcdFx0YXJpYVJvbGU6ICd0YWJsaXN0Jyxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IGFjdGlvbi5pZCA9PT0gJ2ZvbGRlclNldHRpbmdzJyA/IHRoaXMuZm9sZGVyU2V0dGluZ3MgOiB1bmRlZmluZWRcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVzZXJMb2NhbFNldHRpbmdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbigndXNlclNldHRpbmdzJywgJycsICcuc2V0dGluZ3MtdGFiJywgdHJ1ZSwgKCkgPT4gdGhpcy51cGRhdGVUYXJnZXQoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSkpO1xuXHRcdHRoaXMudXNlckxvY2FsU2V0dGluZ3MudG9vbHRpcCA9IGxvY2FsaXplKCd1c2VyU2V0dGluZ3MnLCBcIlVzZXJcIik7XG5cblx0XHR0aGlzLnVzZXJSZW1vdGVTZXR0aW5ncyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oJ3VzZXJTZXR0aW5nc1JlbW90ZScsICcnLCAnLnNldHRpbmdzLXRhYicsIHRydWUsICgpID0+IHRoaXMudXBkYXRlVGFyZ2V0KENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpKSk7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5O1xuXHRcdGNvbnN0IGhvc3RMYWJlbCA9IHJlbW90ZUF1dGhvcml0eSAmJiB0aGlzLmxhYmVsU2VydmljZS5nZXRIb3N0TGFiZWwoU2NoZW1hcy52c2NvZGVSZW1vdGUsIHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0dGhpcy51c2VyUmVtb3RlU2V0dGluZ3MudG9vbHRpcCA9IGxvY2FsaXplKCd1c2VyU2V0dGluZ3NSZW1vdGUnLCBcIlJlbW90ZVwiKSArIChob3N0TGFiZWwgPyBgIFske2hvc3RMYWJlbH1dYCA6ICcnKTtcblxuXHRcdHRoaXMud29ya3NwYWNlU2V0dGluZ3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCd3b3Jrc3BhY2VTZXR0aW5ncycsICcnLCAnLnNldHRpbmdzLXRhYicsIGZhbHNlLCAoKSA9PiB0aGlzLnVwZGF0ZVRhcmdldChDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkpKTtcblxuXHRcdHRoaXMuZm9sZGVyU2V0dGluZ3NBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCdmb2xkZXJTZXR0aW5ncycsICcnLCAnLnNldHRpbmdzLXRhYicsIGZhbHNlLCBhc3luYyBmb2xkZXIgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVUYXJnZXQoaXNXb3Jrc3BhY2VGb2xkZXIoZm9sZGVyKSA/IGZvbGRlci51cmkgOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmZvbGRlclNldHRpbmdzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGb2xkZXJTZXR0aW5nc0FjdGlvblZpZXdJdGVtLCB0aGlzLmZvbGRlclNldHRpbmdzQWN0aW9uKSk7XG5cblx0XHR0aGlzLnJlc2V0TGFiZWxzKCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblxuXHRcdHRoaXMuc2V0dGluZ3NTd2l0Y2hlckJhci5wdXNoKFt0aGlzLnVzZXJMb2NhbFNldHRpbmdzLCB0aGlzLnVzZXJSZW1vdGVTZXR0aW5ncywgdGhpcy53b3Jrc3BhY2VTZXR0aW5ncywgdGhpcy5mb2xkZXJTZXR0aW5nc0FjdGlvbl0pO1xuXHR9XG5cblx0Z2V0IHNldHRpbmdzVGFyZ2V0KCk6IFNldHRpbmdzVGFyZ2V0IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NldHRpbmdzVGFyZ2V0O1xuXHR9XG5cblx0c2V0IHNldHRpbmdzVGFyZ2V0KHNldHRpbmdzVGFyZ2V0OiBTZXR0aW5nc1RhcmdldCB8IG51bGwpIHtcblx0XHR0aGlzLl9zZXR0aW5nc1RhcmdldCA9IHNldHRpbmdzVGFyZ2V0O1xuXHRcdHRoaXMudXNlckxvY2FsU2V0dGluZ3MuY2hlY2tlZCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCA9PT0gdGhpcy5zZXR0aW5nc1RhcmdldDtcblx0XHR0aGlzLnVzZXJSZW1vdGVTZXR0aW5ncy5jaGVja2VkID0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSA9PT0gdGhpcy5zZXR0aW5nc1RhcmdldDtcblx0XHR0aGlzLndvcmtzcGFjZVNldHRpbmdzLmNoZWNrZWQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSA9PT0gdGhpcy5zZXR0aW5nc1RhcmdldDtcblx0XHRpZiAodGhpcy5zZXR0aW5nc1RhcmdldCBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0dGhpcy5mb2xkZXJTZXR0aW5ncy5hY3Rpb24uY2hlY2tlZCA9IHRydWU7XG5cdFx0XHR0aGlzLmZvbGRlclNldHRpbmdzLmZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHRoaXMuc2V0dGluZ3NUYXJnZXQgYXMgVVJJKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5mb2xkZXJTZXR0aW5ncy5hY3Rpb24uY2hlY2tlZCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHNldFJlc3VsdENvdW50KHNldHRpbmdzVGFyZ2V0OiBTZXR0aW5nc1RhcmdldCwgY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChzZXR0aW5nc1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpIHtcblx0XHRcdGxldCBsYWJlbCA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkubmFtZSA/PyBsb2NhbGl6ZSgnd29ya3NwYWNlU2V0dGluZ3MnLCBcIldvcmtzcGFjZVwiKTtcblx0XHRcdGlmIChjb3VudCkge1xuXHRcdFx0XHRsYWJlbCArPSBgICgke2NvdW50fSlgO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLndvcmtzcGFjZVNldHRpbmdzLmxhYmVsID0gbGFiZWw7XG5cdFx0fSBlbHNlIGlmIChzZXR0aW5nc1RhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSB7XG5cdFx0XHRsZXQgbGFiZWwgPSBsb2NhbGl6ZSgndXNlclNldHRpbmdzJywgXCJVc2VyXCIpO1xuXHRcdFx0aWYgKGNvdW50KSB7XG5cdFx0XHRcdGxhYmVsICs9IGAgKCR7Y291bnR9KWA7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXNlckxvY2FsU2V0dGluZ3MubGFiZWwgPSBsYWJlbDtcblx0XHR9IGVsc2UgaWYgKHNldHRpbmdzVGFyZ2V0IGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHR0aGlzLmZvbGRlclNldHRpbmdzLnNldENvdW50KHNldHRpbmdzVGFyZ2V0LCBjb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlTGFuZ3VhZ2VGaWx0ZXJJbmRpY2F0b3JzKGZpbHRlcjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5yZXNldExhYmVscygpO1xuXHRcdGlmIChmaWx0ZXIpIHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlVG9Vc2UgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUoZmlsdGVyKTtcblx0XHRcdGlmIChsYW5ndWFnZVRvVXNlKSB7XG5cdFx0XHRcdGNvbnN0IGxhbmd1YWdlU3VmZml4ID0gYCBbJHtsYW5ndWFnZVRvVXNlfV1gO1xuXHRcdFx0XHR0aGlzLnVzZXJMb2NhbFNldHRpbmdzLmxhYmVsICs9IGxhbmd1YWdlU3VmZml4O1xuXHRcdFx0XHR0aGlzLnVzZXJSZW1vdGVTZXR0aW5ncy5sYWJlbCArPSBsYW5ndWFnZVN1ZmZpeDtcblx0XHRcdFx0dGhpcy53b3Jrc3BhY2VTZXR0aW5ncy5sYWJlbCArPSBsYW5ndWFnZVN1ZmZpeDtcblx0XHRcdFx0dGhpcy5mb2xkZXJTZXR0aW5nc0FjdGlvbi5sYWJlbCArPSBsYW5ndWFnZVN1ZmZpeDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uV29ya2JlbmNoU3RhdGVDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuZm9sZGVyU2V0dGluZ3MuZm9sZGVyID0gbnVsbDtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdGlmICh0aGlzLnNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSAmJiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0dGhpcy51cGRhdGVUYXJnZXQoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVUYXJnZXQoc2V0dGluZ3NUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaXNTYW1lVGFyZ2V0ID0gdGhpcy5zZXR0aW5nc1RhcmdldCA9PT0gc2V0dGluZ3NUYXJnZXQgfHxcblx0XHRcdHNldHRpbmdzVGFyZ2V0IGluc3RhbmNlb2YgVVJJICYmXG5cdFx0XHR0aGlzLnNldHRpbmdzVGFyZ2V0IGluc3RhbmNlb2YgVVJJICYmXG5cdFx0XHRpc0VxdWFsKHRoaXMuc2V0dGluZ3NUYXJnZXQsIHNldHRpbmdzVGFyZ2V0KTtcblxuXHRcdGlmICghaXNTYW1lVGFyZ2V0KSB7XG5cdFx0XHR0aGlzLnNldHRpbmdzVGFyZ2V0ID0gc2V0dGluZ3NUYXJnZXQ7XG5cdFx0XHR0aGlzLl9vbkRpZFRhcmdldENoYW5nZS5maXJlKHRoaXMuc2V0dGluZ3NUYXJnZXQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2V0dGluZ3NTd2l0Y2hlckJhci5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5LXdvcmtiZW5jaCcsIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpO1xuXHRcdHRoaXMudXNlclJlbW90ZVNldHRpbmdzLmVuYWJsZWQgPSAhISh0aGlzLm9wdGlvbnMuZW5hYmxlUmVtb3RlU2V0dGluZ3MgJiYgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KTtcblx0XHR0aGlzLndvcmtzcGFjZVNldHRpbmdzLmVuYWJsZWQgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHRcdHRoaXMuZm9sZGVyU2V0dGluZ3MuYWN0aW9uLmVuYWJsZWQgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSAmJiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoID4gMDtcblxuXHRcdHRoaXMud29ya3NwYWNlU2V0dGluZ3MudG9vbHRpcCA9IGxvY2FsaXplKCd3b3Jrc3BhY2VTZXR0aW5ncycsIFwiV29ya3NwYWNlXCIpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VhcmNoT3B0aW9ucyBleHRlbmRzIElIaXN0b3J5SW5wdXRPcHRpb25zIHtcblx0Zm9jdXNLZXk/OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0c2hvd1Jlc3VsdENvdW50PzogYm9vbGVhbjtcblx0YXJpYUxpdmU/OiBzdHJpbmc7XG5cdGFyaWFMYWJlbGxlZEJ5Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgU2VhcmNoV2lkZ2V0IGV4dGVuZHMgV2lkZ2V0IHtcblxuXHRkb21Ob2RlITogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBjb3VudEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWFyY2hDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0aW5wdXRCb3ghOiBIaXN0b3J5SW5wdXRCb3g7XG5cdHByaXZhdGUgY29udHJvbHNEaXYhOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZTogRW1pdHRlcjxzdHJpbmc+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZSgpOiBFdmVudDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Gb2N1czogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRm9jdXMoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25Gb2N1cy5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKHBhcmVudDogSFRNTEVsZW1lbnQsIHByb3RlY3RlZCBvcHRpb25zOiBTZWFyY2hPcHRpb25zLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuY3JlYXRlKHBhcmVudCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZShwYXJlbnQ6IEhUTUxFbGVtZW50KSB7XG5cdFx0dGhpcy5kb21Ob2RlID0gRE9NLmFwcGVuZChwYXJlbnQsIERPTS4kKCdkaXYuc2V0dGluZ3MtaGVhZGVyLXdpZGdldCcpKTtcblx0XHR0aGlzLmNyZWF0ZVNlYXJjaENvbnRhaW5lcihET00uYXBwZW5kKHRoaXMuZG9tTm9kZSwgRE9NLiQoJ2Rpdi5zZXR0aW5ncy1zZWFyY2gtY29udGFpbmVyJykpKTtcblx0XHR0aGlzLmNvbnRyb2xzRGl2ID0gRE9NLmFwcGVuZCh0aGlzLmRvbU5vZGUsIERPTS4kKCdkaXYuc2V0dGluZ3Mtc2VhcmNoLWNvbnRyb2xzJykpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zaG93UmVzdWx0Q291bnQpIHtcblx0XHRcdHRoaXMuY291bnRFbGVtZW50ID0gRE9NLmFwcGVuZCh0aGlzLmNvbnRyb2xzRGl2LCBET00uJCgnLnNldHRpbmdzLWNvdW50LXdpZGdldCcpKTtcblxuXHRcdFx0dGhpcy5jb3VudEVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYXNDc3NWYXJpYWJsZShiYWRnZUJhY2tncm91bmQpO1xuXHRcdFx0dGhpcy5jb3VudEVsZW1lbnQuc3R5bGUuY29sb3IgPSBhc0Nzc1ZhcmlhYmxlKGJhZGdlRm9yZWdyb3VuZCk7XG5cdFx0XHR0aGlzLmNvdW50RWxlbWVudC5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShjb250cmFzdEJvcmRlcil9YDtcblx0XHR9XG5cblx0XHR0aGlzLmlucHV0Qm94LmlucHV0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsIHRoaXMub3B0aW9ucy5hcmlhTGl2ZSB8fCAnb2ZmJyk7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5hcmlhTGFiZWxsZWRCeSkge1xuXHRcdFx0dGhpcy5pbnB1dEJveC5pbnB1dEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsbGVkQnknLCB0aGlzLm9wdGlvbnMuYXJpYUxhYmVsbGVkQnkpO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihET00udHJhY2tGb2N1cyh0aGlzLmlucHV0Qm94LmlucHV0RWxlbWVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX29uRm9jdXMuZmlyZSgpKSk7XG5cblx0XHRjb25zdCBmb2N1c0tleSA9IHRoaXMub3B0aW9ucy5mb2N1c0tleTtcblx0XHRpZiAoZm9jdXNLZXkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEZvY3VzKCgpID0+IGZvY3VzS2V5LnNldCh0cnVlKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiBmb2N1c0tleS5zZXQoZmFsc2UpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZWFyY2hDb250YWluZXIoc2VhcmNoQ29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdHRoaXMuc2VhcmNoQ29udGFpbmVyID0gc2VhcmNoQ29udGFpbmVyO1xuXHRcdGNvbnN0IHNlYXJjaElucHV0ID0gRE9NLmFwcGVuZCh0aGlzLnNlYXJjaENvbnRhaW5lciwgRE9NLiQoJ2Rpdi5zZXR0aW5ncy1zZWFyY2gtaW5wdXQnKSk7XG5cdFx0dGhpcy5pbnB1dEJveCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlSW5wdXRCb3goc2VhcmNoSW5wdXQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0Qm94Lm9uRGlkQ2hhbmdlKHZhbHVlID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodmFsdWUpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlSW5wdXRCb3gocGFyZW50OiBIVE1MRWxlbWVudCk6IEhpc3RvcnlJbnB1dEJveCB7XG5cdFx0Y29uc3Qgc2hvd0hpc3RvcnlIaW50ID0gKCkgPT4gc2hvd0hpc3RvcnlLZXliaW5kaW5nSGludCh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlKTtcblx0XHRyZXR1cm4gbmV3IENvbnRleHRTY29wZWRIaXN0b3J5SW5wdXRCb3gocGFyZW50LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwgeyAuLi50aGlzLm9wdGlvbnMsIHNob3dIaXN0b3J5SGludCB9LCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHNob3dNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIEF2b2lkIHNldHRpbmcgdGhlIGFyaWEtbGFiZWwgdW5uZWNlc3NhcmlseSwgdGhlIHNjcmVlbnJlYWRlciB3aWxsIHJlYWQgdGhlIGNvdW50IGV2ZXJ5IHRpbWUgaXQncyBzZXQsIHNpbmNlIGl0J3MgYXJpYS1saXZlOmFzc2VydGl2ZS4gIzUwOTY4XG5cdFx0aWYgKHRoaXMuY291bnRFbGVtZW50ICYmIG1lc3NhZ2UgIT09IHRoaXMuY291bnRFbGVtZW50LnRleHRDb250ZW50KSB7XG5cdFx0XHR0aGlzLmNvdW50RWxlbWVudC50ZXh0Q29udGVudCA9IG1lc3NhZ2U7XG5cdFx0XHR0aGlzLmlucHV0Qm94LmlucHV0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBtZXNzYWdlKTtcblx0XHRcdHRoaXMuaW5wdXRCb3guaW5wdXRFbGVtZW50LnN0eWxlLnBhZGRpbmdSaWdodCA9IHRoaXMuZ2V0Q29udHJvbHNXaWR0aCgpICsgJ3B4Jztcblx0XHR9XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKSB7XG5cdFx0aWYgKGRpbWVuc2lvbi53aWR0aCA8IDQwMCkge1xuXHRcdFx0dGhpcy5jb3VudEVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblxuXHRcdFx0dGhpcy5pbnB1dEJveC5pbnB1dEVsZW1lbnQuc3R5bGUucGFkZGluZ1JpZ2h0ID0gJzBweCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY291bnRFbGVtZW50Py5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cblx0XHRcdHRoaXMuaW5wdXRCb3guaW5wdXRFbGVtZW50LnN0eWxlLnBhZGRpbmdSaWdodCA9IHRoaXMuZ2V0Q29udHJvbHNXaWR0aCgpICsgJ3B4Jztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRyb2xzV2lkdGgoKTogbnVtYmVyIHtcblx0XHRjb25zdCBjb3VudFdpZHRoID0gdGhpcy5jb3VudEVsZW1lbnQgPyBET00uZ2V0VG90YWxXaWR0aCh0aGlzLmNvdW50RWxlbWVudCkgOiAwO1xuXHRcdHJldHVybiBjb3VudFdpZHRoICsgMjA7XG5cdH1cblxuXHRmb2N1cygpIHtcblx0XHR0aGlzLmlucHV0Qm94LmZvY3VzKCk7XG5cdFx0aWYgKHRoaXMuZ2V0VmFsdWUoKSkge1xuXHRcdFx0dGhpcy5pbnB1dEJveC5zZWxlY3QoKTtcblx0XHR9XG5cdH1cblxuXHRoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dEJveC5oYXNGb2N1cygpO1xuXHR9XG5cblx0Y2xlYXIoKSB7XG5cdFx0dGhpcy5pbnB1dEJveC52YWx1ZSA9ICcnO1xuXHR9XG5cblx0Z2V0VmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dEJveC52YWx1ZTtcblx0fVxuXG5cdHNldFZhbHVlKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlucHV0Qm94LnZhbHVlID0gdmFsdWU7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMub3B0aW9ucy5mb2N1c0tleT8uc2V0KGZhbHNlKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRQcmVmZXJlbmNlV2lkZ2V0PFQ+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfbGluZTogbnVtYmVyID0gLTE7XG5cdHByaXZhdGUgX3ByZWZlcmVuY2VzOiBUW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0UHJlZmVyZW5jZURlY29yYXRpb246IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JNb3VzZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25DbGljazogRXZlbnQ8SUVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fb25DbGljay5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGVkaXRvcjogSUNvZGVFZGl0b3IpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VkaXRQcmVmZXJlbmNlRGVjb3JhdGlvbiA9IHRoaXMuZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uTW91c2VEb3duKChlOiBJRWRpdG9yTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfR0xZUEhfTUFSR0lOIHx8IGUudGFyZ2V0LmRldGFpbC5pc0FmdGVyTGluZXMgfHwgIXRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25DbGljay5maXJlKGUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBwcmVmZXJlbmNlcygpOiBUW10ge1xuXHRcdHJldHVybiB0aGlzLl9wcmVmZXJlbmNlcztcblx0fVxuXG5cdGdldExpbmUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZTtcblx0fVxuXG5cdHNob3cobGluZTogbnVtYmVyLCBob3Zlck1lc3NhZ2U6IHN0cmluZywgcHJlZmVyZW5jZXM6IFRbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3ByZWZlcmVuY2VzID0gcHJlZmVyZW5jZXM7XG5cdFx0Y29uc3QgbmV3RGVjb3JhdGlvbjogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHR0aGlzLl9saW5lID0gbGluZTtcblx0XHRuZXdEZWNvcmF0aW9uLnB1c2goe1xuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2VkaXQtcHJlZmVyZW5jZS13aWRnZXQtZGVjb3JhdGlvbicsXG5cdFx0XHRcdGdseXBoTWFyZ2luQ2xhc3NOYW1lOiBUaGVtZUljb24uYXNDbGFzc05hbWUoc2V0dGluZ3NFZGl0SWNvbiksXG5cdFx0XHRcdGdseXBoTWFyZ2luSG92ZXJNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGhvdmVyTWVzc2FnZSksXG5cdFx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdFx0fSxcblx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogbGluZSxcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGxpbmUsXG5cdFx0XHRcdGVuZENvbHVtbjogMVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2VkaXRQcmVmZXJlbmNlRGVjb3JhdGlvbi5zZXQobmV3RGVjb3JhdGlvbik7XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRQcmVmZXJlbmNlRGVjb3JhdGlvbi5jbGVhcigpO1xuXHR9XG5cblx0aXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0UHJlZmVyZW5jZURlY29yYXRpb24ubGVuZ3RoID4gMDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLFdBQVcsMEJBQTBCO0FBQzlDLFNBQVMsMEJBQWtEO0FBRTNELFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsY0FBYztBQUN2QixTQUFTLGNBQXVCO0FBQ2hDLFNBQVMsZUFBc0I7QUFDL0Is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
