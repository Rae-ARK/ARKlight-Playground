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
import { IListService, WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ITerminalConfigurationService, ITerminalGroupService, ITerminalService, ITerminalEditingService, TerminalDataTransfers } from "./terminal.js";
import { localize } from "../../../../nls.js";
import * as DOM from "../../../../base/browser/dom.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { TerminalCommandId } from "../common/terminal.js";
import { TerminalLocation, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Action } from "../../../../base/common/actions.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../browser/labels.js";
import { IDecorationsService } from "../../../services/decorations/common/decorations.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import Severity from "../../../../base/common/severity.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { ListDragOverEffectPosition, ListDragOverEffectType } from "../../../../base/browser/ui/list/list.js";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { ElementsDragAndDropData, NativeDragAndDropData } from "../../../../base/browser/ui/list/listView.js";
import { URI } from "../../../../base/common/uri.js";
import { getColorClass, getIconId, getUriClasses } from "./terminalIcon.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { CodeDataTransfers, containsDragType, getPathForFile } from "../../../../platform/dnd/browser/dnd.js";
import { terminalStrings } from "../common/terminalStrings.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { getTerminalResourcesFromDragEvent, parseTerminalUri } from "./terminalUri.js";
import { getInstanceHoverInfo } from "./terminalTooltip.js";
import { defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { Emitter } from "../../../../base/common/event.js";
import { Schemas } from "../../../../base/common/network.js";
import { getColorForSeverity } from "./terminalStatusList.js";
import { TerminalContextActionRunner } from "./terminalContextMenu.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { TerminalStorageKeys } from "../common/terminalStorageKeys.js";
import { isObject } from "../../../../base/common/types.js";
const $ = DOM.$;
var TerminalTabsListSizes = /* @__PURE__ */ ((TerminalTabsListSizes2) => {
  TerminalTabsListSizes2[TerminalTabsListSizes2["TabHeight"] = 22] = "TabHeight";
  TerminalTabsListSizes2[TerminalTabsListSizes2["NarrowViewWidth"] = 46] = "NarrowViewWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["WideViewMinimumWidth"] = 80] = "WideViewMinimumWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["DefaultWidth"] = 120] = "DefaultWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["MidpointViewWidth"] = 63] = "MidpointViewWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["ActionbarMinimumWidth"] = 105] = "ActionbarMinimumWidth";
  TerminalTabsListSizes2[TerminalTabsListSizes2["MaximumWidth"] = 500] = "MaximumWidth";
  return TerminalTabsListSizes2;
})(TerminalTabsListSizes || {});
let TerminalTabList = class extends WorkbenchList {
  constructor(container, contextKeyService, listService, _configurationService, _terminalService, _terminalGroupService, _terminalEditingService, instantiationService, decorationsService, _themeService, _storageService, lifecycleService, _hoverService) {
    super(
      "TerminalTabsList",
      container,
      {
        getHeight: () => 22 /* TabHeight */,
        getTemplateId: () => "terminal.tabs"
      },
      [instantiationService.createInstance(TerminalTabsRenderer, container, instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER), () => this.getSelectedElements(), {
        getHasText: () => this.hasText,
        getHasActionBar: () => this.hasActionBar
      })],
      {
        horizontalScrolling: false,
        supportDynamicHeights: false,
        selectionNavigation: true,
        identityProvider: {
          getId: (e) => e?.instanceId
        },
        accessibilityProvider: instantiationService.createInstance(TerminalTabsAccessibilityProvider),
        smoothScrolling: _configurationService.getValue("workbench.list.smoothScrolling"),
        multipleSelectionSupport: true,
        paddingBottom: 22 /* TabHeight */,
        dnd: instantiationService.createInstance(TerminalTabsDragAndDrop),
        openOnSingleClick: true
      },
      contextKeyService,
      listService,
      _configurationService,
      instantiationService
    );
    this._configurationService = _configurationService;
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalEditingService = _terminalEditingService;
    this._themeService = _themeService;
    this._storageService = _storageService;
    this._hoverService = _hoverService;
    this._hasText = true;
    this._hasActionBar = true;
    const instanceDisposables = [
      this._terminalGroupService.onDidChangeInstances(() => this.refresh()),
      this._terminalGroupService.onDidChangeGroups(() => this.refresh()),
      this._terminalGroupService.onDidShow(() => this.refresh()),
      this._terminalGroupService.onDidChangeInstanceCapability(() => this.refresh()),
      this._terminalService.onAnyInstanceTitleChange(() => this.refresh()),
      this._terminalService.onAnyInstanceIconChange(() => this.refresh()),
      this._terminalService.onAnyInstancePrimaryStatusChange(() => this.refresh()),
      this._terminalService.onDidChangeConnectionState(() => this.refresh()),
      this._themeService.onDidColorThemeChange(() => this.refresh()),
      this._terminalGroupService.onDidChangeActiveInstance((e) => {
        if (e) {
          const i = this._terminalGroupService.instances.indexOf(e);
          this.setSelection([i]);
          this.reveal(i);
        }
        this.refresh();
      }),
      this._storageService.onDidChangeValue(StorageScope.APPLICATION, TerminalStorageKeys.TabsShowDetailed, this.disposables)(() => this.refresh())
    ];
    this.disposables.add(lifecycleService.onWillShutdown((e) => {
      dispose(instanceDisposables);
      instanceDisposables.length = 0;
    }));
    this.disposables.add(toDisposable(() => {
      dispose(instanceDisposables);
      instanceDisposables.length = 0;
    }));
    this.disposables.add(this.onMouseDblClick(async (e) => {
      if (!e.element) {
        e.browserEvent.preventDefault();
        e.browserEvent.stopPropagation();
        const instance = await this._terminalService.createTerminal({ location: TerminalLocation.Panel });
        this._terminalGroupService.setActiveInstance(instance);
        await instance.focusWhenReady();
        return;
      }
      if (this._terminalEditingService.getEditingTerminal()?.instanceId === e.element.instanceId) {
        return;
      }
      if (this._getFocusMode() === "doubleClick" && this.getFocus().length === 1) {
        e.element.focus(true);
      }
    }));
    this.disposables.add(this.onMouseClick(async (e) => {
      if (this._terminalEditingService.getEditingTerminal()?.instanceId === e.element?.instanceId) {
        return;
      }
      if (e.browserEvent.altKey && e.element) {
        await this._terminalService.createTerminal({ location: { parentTerminal: e.element } });
      } else if (this._getFocusMode() === "singleClick") {
        if (this.getSelection().length <= 1) {
          e.element?.focus(true);
        }
      }
    }));
    this.disposables.add(this.onContextMenu((e) => {
      if (!e.element) {
        this.setSelection([]);
        return;
      }
      const selection = this.getSelectedElements();
      if (!selection || !selection.find((s) => e.element === s)) {
        this.setFocus(e.index !== void 0 ? [e.index] : []);
      }
    }));
    this._terminalTabsSingleSelectedContextKey = TerminalContextKeys.tabsSingularSelection.bindTo(contextKeyService);
    this._isSplitContextKey = TerminalContextKeys.splitTerminalTabFocused.bindTo(contextKeyService);
    this.disposables.add(this.onDidChangeSelection((e) => this._updateContextKey()));
    this.disposables.add(this.onDidChangeFocus(() => this._updateContextKey()));
    this.disposables.add(this.onDidOpen(async (e) => {
      const instance = e.element;
      if (!instance) {
        return;
      }
      this._terminalGroupService.setActiveInstance(instance);
      if (!e.editorOptions.preserveFocus) {
        await instance.focusWhenReady();
      }
    }));
    if (!this._decorationsProvider) {
      this._decorationsProvider = this.disposables.add(instantiationService.createInstance(TabDecorationsProvider));
      this.disposables.add(decorationsService.registerDecorationsProvider(this._decorationsProvider));
    }
    this.refresh();
  }
  get hasText() {
    return this._hasText;
  }
  get hasActionBar() {
    return this._hasActionBar;
  }
  _getFocusMode() {
    return this._configurationService.getValue(TerminalSettingId.TabsFocusMode);
  }
  refresh(cancelEditing = true) {
    if (cancelEditing && this._terminalEditingService.isEditable(void 0)) {
      this.domFocus();
    }
    this.splice(0, this.length, this._terminalGroupService.instances.slice());
  }
  focusHover() {
    const instance = this.getSelectedElements()[0];
    if (!instance) {
      return;
    }
    this._hoverService.showInstantHover({
      ...getInstanceHoverInfo(instance, this._storageService),
      target: this.getHTMLElement(),
      trapFocus: true
    }, true);
  }
  _updateContextKey() {
    this._terminalTabsSingleSelectedContextKey.set(this.getSelectedElements().length === 1);
    const instance = this.getFocusedElements();
    this._isSplitContextKey.set(instance.length > 0 && this._terminalGroupService.instanceIsSplit(instance[0]));
  }
  layout(height, width) {
    super.layout(height, width);
    const actualWidth = width ?? this.getHTMLElement().clientWidth;
    const newHasText = actualWidth >= 63 /* MidpointViewWidth */;
    const newHasActionBar = actualWidth > 105 /* ActionbarMinimumWidth */;
    if (this._hasText !== newHasText || this._hasActionBar !== newHasActionBar) {
      this._hasText = newHasText;
      this._hasActionBar = newHasActionBar;
      this.refresh();
    }
  }
};
TerminalTabList = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IListService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ITerminalService),
  __decorateParam(5, ITerminalGroupService),
  __decorateParam(6, ITerminalEditingService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IDecorationsService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, ILifecycleService),
  __decorateParam(12, IHoverService)
], TerminalTabList);
let TerminalTabsRenderer = class {
  constructor(_container, _labels, _getSelection, _getVisibilityState, _instantiationService, _terminalConfigurationService, _terminalService, _terminalGroupService, _terminalEditingService, _hoverService, _keybindingService, _listService, _storageService, _themeService, _contextViewService, _commandService) {
    this._labels = _labels;
    this._getSelection = _getSelection;
    this._getVisibilityState = _getVisibilityState;
    this._instantiationService = _instantiationService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalEditingService = _terminalEditingService;
    this._hoverService = _hoverService;
    this._keybindingService = _keybindingService;
    this._listService = _listService;
    this._storageService = _storageService;
    this._themeService = _themeService;
    this._contextViewService = _contextViewService;
    this._commandService = _commandService;
    this.templateId = "terminal.tabs";
  }
  renderTemplate(container) {
    const element = DOM.append(container, $(".terminal-tabs-entry"));
    const context = {};
    const templateDisposables = new DisposableStore();
    const label = templateDisposables.add(this._labels.create(element, {
      supportHighlights: true,
      supportDescriptionHighlights: true,
      supportIcons: true,
      hoverDelegate: {
        delay: 0,
        showHover: (options) => {
          return this._hoverService.showDelayedHover({
            ...options,
            actions: context.hoverActions,
            target: element,
            appearance: {
              showPointer: true
            },
            position: {
              hoverPosition: this._terminalConfigurationService.config.tabs.location === "left" ? HoverPosition.RIGHT : HoverPosition.LEFT
            }
          }, { groupId: "terminal-tabs-list" });
        }
      }
    }));
    const actionsContainer = DOM.append(label.element, $(".actions"));
    const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
      actionRunner: templateDisposables.add(new TerminalContextActionRunner()),
      actionViewItemProvider: (action, options) => action instanceof MenuItemAction ? templateDisposables.add(this._instantiationService.createInstance(MenuEntryActionViewItem, action, { hoverDelegate: options.hoverDelegate })) : void 0
    }));
    return {
      element,
      label,
      actionBar,
      context,
      elementDisposables: new DisposableStore(),
      templateDisposables
    };
  }
  renderElement(instance, index, template) {
    const hasText = this._getVisibilityState.getHasText();
    const hasActionBar = this._getVisibilityState.getHasActionBar();
    const group = this._terminalGroupService.getGroupForInstance(instance);
    if (!group) {
      throw new Error(`Could not find group for instance "${instance.instanceId}"`);
    }
    template.element.classList.toggle("has-text", hasText);
    template.element.classList.toggle("is-active", this._terminalGroupService.activeInstance === instance);
    let prefix = "";
    if (group.terminalInstances.length > 1) {
      const terminalIndex = group.terminalInstances.indexOf(instance);
      if (terminalIndex === 0) {
        prefix = `\u250C `;
      } else if (terminalIndex === group.terminalInstances.length - 1) {
        prefix = `\u2514 `;
      } else {
        prefix = `\u251C `;
      }
    }
    const hoverInfo = getInstanceHoverInfo(instance, this._storageService);
    template.context.hoverActions = hoverInfo.actions;
    const iconId = this._instantiationService.invokeFunction(getIconId, instance);
    let label = "";
    if (!hasText) {
      const primaryStatus = instance.statusList.primary;
      if (primaryStatus && primaryStatus.severity > Severity.Ignore) {
        label = `${prefix}$(${primaryStatus.icon?.id || iconId})`;
      } else {
        label = `${prefix}$(${iconId})`;
      }
    } else {
      this.fillActionBar(instance, template);
      label = prefix;
      if (instance.icon) {
        label += `$(${iconId}) ${instance.title}`;
      }
    }
    if (!hasActionBar) {
      template.actionBar.clear();
    }
    template.elementDisposables.add(DOM.addDisposableListener(template.element, DOM.EventType.AUXCLICK, (e) => {
      e.stopImmediatePropagation();
      if (e.button === 1) {
        this._terminalService.safeDisposeTerminal(instance);
      }
    }));
    const extraClasses = [];
    const colorClass = getColorClass(instance);
    if (colorClass) {
      extraClasses.push(colorClass);
    }
    const uriClasses = getUriClasses(instance, this._themeService.getColorTheme().type);
    if (uriClasses) {
      extraClasses.push(...uriClasses);
    }
    template.label.setResource({
      resource: instance.resource,
      name: label,
      description: hasText ? instance.description : void 0
    }, {
      fileDecorations: {
        colors: true,
        badges: hasText
      },
      title: {
        markdown: hoverInfo.content,
        markdownNotSupportedFallback: void 0
      },
      extraClasses
    });
    const editableData = this._terminalEditingService.getEditableData(instance);
    template.label.element.classList.toggle("editable-tab", !!editableData);
    if (editableData) {
      template.elementDisposables.add(this._renderInputBox(template.label.element.querySelector(".monaco-icon-label-container"), instance, editableData));
      template.actionBar.clear();
    }
  }
  _renderInputBox(container, instance, editableData) {
    const value = instance.title || "";
    const inputBox = new InputBox(container, this._contextViewService, {
      validationOptions: {
        validation: (value2) => {
          const message = editableData.validationMessage(value2);
          if (!message || message.severity !== Severity.Error) {
            return null;
          }
          return {
            content: message.content,
            formatContent: true,
            type: MessageType.ERROR
          };
        }
      },
      ariaLabel: localize("terminalInputAriaLabel", "Type terminal name. Press Enter to confirm or Escape to cancel."),
      inputBoxStyles: defaultInputBoxStyles
    });
    inputBox.element.style.height = "22px";
    inputBox.value = value;
    inputBox.focus();
    inputBox.select({ start: 0, end: value.length });
    const done = createSingleCallFunction((success, finishEditing) => {
      inputBox.element.style.display = "none";
      const value2 = inputBox.value;
      dispose(toDispose);
      inputBox.element.remove();
      if (finishEditing) {
        editableData.onFinish(value2, success);
      }
    });
    const showInputBoxNotification = () => {
      if (inputBox.isInputValid()) {
        const message = editableData.validationMessage(inputBox.value);
        if (message) {
          inputBox.showMessage({
            content: message.content,
            formatContent: true,
            type: message.severity === Severity.Info ? MessageType.INFO : message.severity === Severity.Warning ? MessageType.WARNING : MessageType.ERROR
          });
        } else {
          inputBox.hideMessage();
        }
      }
    };
    showInputBoxNotification();
    const toDispose = [
      inputBox,
      DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, (e) => {
        e.stopPropagation();
        if (e.equals(KeyCode.Enter)) {
          done(inputBox.isInputValid(), true);
        } else if (e.equals(KeyCode.Escape)) {
          done(false, true);
        }
      }),
      DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_UP, (e) => {
        showInputBoxNotification();
      }),
      DOM.addDisposableListener(inputBox.inputElement, DOM.EventType.BLUR, () => {
        done(inputBox.isInputValid(), true);
      })
    ];
    return toDisposable(() => {
      done(false, false);
    });
  }
  disposeElement(instance, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.actionBar.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposables.dispose();
  }
  fillActionBar(instance, template) {
    const actions = [
      template.elementDisposables.add(new Action(TerminalCommandId.SplitActiveTab, terminalStrings.split.short, ThemeIcon.asClassName(Codicon.splitHorizontal), true, async () => {
        this._runForSelectionOrInstance(instance, async (e) => {
          this._terminalService.createTerminal({ location: { parentTerminal: e } });
        });
      }))
    ];
    if (instance.shellLaunchConfig.tabActions) {
      for (const action of instance.shellLaunchConfig.tabActions) {
        actions.push(template.elementDisposables.add(new Action(action.id, action.label, action.icon ? ThemeIcon.asClassName(action.icon) : void 0, true, async () => {
          this._runForSelectionOrInstance(instance, (e) => this._commandService.executeCommand(action.id, instance));
        })));
      }
    }
    actions.push(template.elementDisposables.add(new Action(TerminalCommandId.KillActiveTab, terminalStrings.kill.short, ThemeIcon.asClassName(Codicon.trashcan), true, async () => {
      this._runForSelectionOrInstance(instance, (e) => this._terminalService.safeDisposeTerminal(e));
    })));
    template.actionBar.clear();
    for (const action of actions) {
      template.actionBar.push(action, { icon: true, label: false, keybinding: this._keybindingService.lookupKeybinding(action.id)?.getLabel() });
    }
  }
  _runForSelectionOrInstance(instance, callback) {
    const selection = this._getSelection();
    if (selection.includes(instance)) {
      for (const s of selection) {
        if (s) {
          callback(s);
        }
      }
    } else {
      callback(instance);
    }
    this._terminalGroupService.focusTabs();
    this._listService.lastFocusedList?.focusNext();
  }
};
TerminalTabsRenderer = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITerminalConfigurationService),
  __decorateParam(6, ITerminalService),
  __decorateParam(7, ITerminalGroupService),
  __decorateParam(8, ITerminalEditingService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IListService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IContextViewService),
  __decorateParam(15, ICommandService)
], TerminalTabsRenderer);
let TerminalTabsAccessibilityProvider = class {
  constructor(_terminalGroupService) {
    this._terminalGroupService = _terminalGroupService;
  }
  getWidgetAriaLabel() {
    return localize("terminal.tabs", "Terminal tabs");
  }
  getAriaLabel(instance) {
    let ariaLabel = "";
    const tab = this._terminalGroupService.getGroupForInstance(instance);
    if (tab && tab.terminalInstances?.length > 1) {
      const terminalIndex = tab.terminalInstances.indexOf(instance);
      ariaLabel = localize({
        key: "splitTerminalAriaLabel",
        comment: [
          `The terminal's ID`,
          `The terminal's title`,
          `The terminal's split number`,
          `The terminal group's total split number`
        ]
      }, "Terminal {0} {1}, split {2} of {3}", instance.instanceId, instance.title, terminalIndex + 1, tab.terminalInstances.length);
    } else {
      ariaLabel = localize({
        key: "terminalAriaLabel",
        comment: [
          `The terminal's ID`,
          `The terminal's title`
        ]
      }, "Terminal {0} {1}", instance.instanceId, instance.title);
    }
    return ariaLabel;
  }
};
TerminalTabsAccessibilityProvider = __decorateClass([
  __decorateParam(0, ITerminalGroupService)
], TerminalTabsAccessibilityProvider);
let TerminalTabsDragAndDrop = class extends Disposable {
  constructor(_terminalService, _terminalGroupService, _terminalEditingService, _listService) {
    super();
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalEditingService = _terminalEditingService;
    this._listService = _listService;
    this._autoFocusDisposable = Disposable.None;
    this._primaryBackend = this._terminalService.getPrimaryBackend();
  }
  getDragURI(instance) {
    if (this._terminalEditingService.getEditingTerminal()?.instanceId === instance.instanceId) {
      return null;
    }
    return instance.resource.toString();
  }
  getDragLabel(elements, originalEvent) {
    return elements.length === 1 ? elements[0].title : void 0;
  }
  onDragLeave() {
    this._autoFocusInstance = void 0;
    this._autoFocusDisposable.dispose();
    this._autoFocusDisposable = Disposable.None;
  }
  onDragStart(data, originalEvent) {
    if (!originalEvent.dataTransfer) {
      return;
    }
    const dndData = data.getData();
    if (!Array.isArray(dndData)) {
      return;
    }
    const terminals = dndData.filter(isTerminalInstance);
    if (terminals.length > 0) {
      originalEvent.dataTransfer.setData(TerminalDataTransfers.Terminals, JSON.stringify(terminals.map((e) => e.resource.toString())));
    }
  }
  onDragOver(data, targetInstance, targetIndex, targetSector, originalEvent) {
    if (data instanceof NativeDragAndDropData) {
      if (!containsDragType(originalEvent, DataTransfers.FILES, DataTransfers.RESOURCES, TerminalDataTransfers.Terminals, CodeDataTransfers.FILES)) {
        return false;
      }
    }
    const didChangeAutoFocusInstance = this._autoFocusInstance !== targetInstance;
    if (didChangeAutoFocusInstance) {
      this._autoFocusDisposable.dispose();
      this._autoFocusInstance = targetInstance;
    }
    if (!targetInstance && !containsDragType(originalEvent, TerminalDataTransfers.Terminals)) {
      return data instanceof ElementsDragAndDropData;
    }
    if (didChangeAutoFocusInstance && targetInstance) {
      this._autoFocusDisposable = disposableTimeout(() => {
        this._terminalService.setActiveInstance(targetInstance);
        this._autoFocusInstance = void 0;
      }, 500, this._store);
    }
    return {
      feedback: targetIndex ? [targetIndex] : void 0,
      accept: true,
      effect: { type: ListDragOverEffectType.Move, position: ListDragOverEffectPosition.Over }
    };
  }
  async drop(data, targetInstance, targetIndex, targetSector, originalEvent) {
    this._autoFocusDisposable.dispose();
    this._autoFocusInstance = void 0;
    let sourceInstances;
    const promises = [];
    const resources = getTerminalResourcesFromDragEvent(originalEvent);
    if (resources) {
      for (const uri of resources) {
        const instance = this._terminalService.getInstanceFromResource(uri);
        if (instance) {
          if (Array.isArray(sourceInstances)) {
            sourceInstances.push(instance);
          } else {
            sourceInstances = [instance];
          }
          this._terminalService.moveToTerminalView(instance);
        } else if (this._primaryBackend) {
          const terminalIdentifier = parseTerminalUri(uri);
          if (terminalIdentifier.instanceId) {
            promises.push(this._primaryBackend.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId));
          }
        }
      }
    }
    if (promises.length) {
      let processes = await Promise.all(promises);
      processes = processes.filter((p) => p !== void 0);
      let lastInstance;
      for (const attachPersistentProcess of processes) {
        lastInstance = await this._terminalService.createTerminal({ config: { attachPersistentProcess } });
      }
      if (lastInstance) {
        this._terminalService.setActiveInstance(lastInstance);
      }
      return;
    }
    if (sourceInstances === void 0) {
      if (!(data instanceof ElementsDragAndDropData)) {
        this._handleExternalDrop(targetInstance, originalEvent);
        return;
      }
      const draggedElement = data.getData();
      if (!draggedElement || !Array.isArray(draggedElement)) {
        return;
      }
      sourceInstances = [];
      for (const e of draggedElement) {
        if (isTerminalInstance(e)) {
          sourceInstances.push(e);
        }
      }
    }
    if (!targetInstance) {
      this._terminalGroupService.moveGroupToEnd(sourceInstances);
      this._terminalService.setActiveInstance(sourceInstances[0]);
      const targetGroup2 = this._terminalGroupService.getGroupForInstance(sourceInstances[0]);
      if (targetGroup2) {
        const index = this._terminalGroupService.groups.indexOf(targetGroup2);
        this._listService.lastFocusedList?.setSelection([index]);
      }
      return;
    }
    this._terminalGroupService.moveGroup(sourceInstances, targetInstance);
    this._terminalService.setActiveInstance(sourceInstances[0]);
    const targetGroup = this._terminalGroupService.getGroupForInstance(sourceInstances[0]);
    if (targetGroup) {
      const index = this._terminalGroupService.groups.indexOf(targetGroup);
      this._listService.lastFocusedList?.setSelection([index]);
    }
  }
  async _handleExternalDrop(instance, e) {
    if (!instance || !e.dataTransfer) {
      return;
    }
    let resource;
    const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
    if (rawResources) {
      resource = URI.parse(JSON.parse(rawResources)[0]);
    }
    const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
    if (!resource && rawCodeFiles) {
      resource = URI.file(JSON.parse(rawCodeFiles)[0]);
    }
    if (!resource && e.dataTransfer.files.length > 0 && getPathForFile(e.dataTransfer.files[0])) {
      resource = URI.file(getPathForFile(e.dataTransfer.files[0]));
    }
    if (!resource) {
      return;
    }
    this._terminalService.setActiveInstance(instance);
    instance.focus();
    await instance.sendPath(resource, false);
  }
};
TerminalTabsDragAndDrop = __decorateClass([
  __decorateParam(0, ITerminalService),
  __decorateParam(1, ITerminalGroupService),
  __decorateParam(2, ITerminalEditingService),
  __decorateParam(3, IListService)
], TerminalTabsDragAndDrop);
let TabDecorationsProvider = class extends Disposable {
  constructor(_terminalService) {
    super();
    this._terminalService = _terminalService;
    this.label = localize("label", "Terminal");
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._register(this._terminalService.onAnyInstancePrimaryStatusChange((e) => this._onDidChange.fire([e.resource])));
  }
  provideDecorations(resource) {
    if (resource.scheme !== Schemas.vscodeTerminal) {
      return void 0;
    }
    const instance = this._terminalService.getInstanceFromResource(resource);
    if (!instance) {
      return void 0;
    }
    const primaryStatus = instance?.statusList?.primary;
    if (!primaryStatus?.icon) {
      return void 0;
    }
    return {
      color: getColorForSeverity(primaryStatus.severity),
      letter: primaryStatus.icon,
      tooltip: primaryStatus.tooltip
    };
  }
};
TabDecorationsProvider = __decorateClass([
  __decorateParam(0, ITerminalService)
], TabDecorationsProvider);
function isTerminalInstance(obj) {
  return isObject(obj) && "instanceId" in obj;
}
export {
  TerminalTabList,
  TerminalTabsListSizes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxUYWJzTGlzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElMaXN0U2VydmljZSwgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSwgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSwgSVRlcm1pbmFsRWRpdGluZ1NlcnZpY2UsIFRlcm1pbmFsRGF0YVRyYW5zZmVycyB9IGZyb20gJy4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb21tYW5kSWQgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQmFja2VuZCwgVGVybWluYWxMb2NhdGlvbiwgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbkRhdGEsIElEZWNvcmF0aW9uc1Byb3ZpZGVyLCBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxpc3REcmFnQW5kRHJvcCwgSUxpc3REcmFnT3ZlclJlYWN0aW9uLCBJTGlzdFJlbmRlcmVyLCBMaXN0RHJhZ092ZXJFZmZlY3RQb3NpdGlvbiwgTGlzdERyYWdPdmVyRWZmZWN0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgRGF0YVRyYW5zZmVycywgSURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSwgTGlzdFZpZXdUYXJnZXRTZWN0b3IsIE5hdGl2ZURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvckNsYXNzLCBnZXRJY29uSWQsIGdldFVyaUNsYXNzZXMgfSBmcm9tICcuL3Rlcm1pbmFsSWNvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdGFibGVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElucHV0Qm94LCBNZXNzYWdlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IENvZGVEYXRhVHJhbnNmZXJzLCBjb250YWluc0RyYWdUeXBlLCBnZXRQYXRoRm9yRmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyB0ZXJtaW5hbFN0cmluZ3MgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxTdHJpbmdzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NEZXRhaWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsUHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyBnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQsIHBhcnNlVGVybWluYWxVcmkgfSBmcm9tICcuL3Rlcm1pbmFsVXJpLmpzJztcbmltcG9ydCB7IGdldEluc3RhbmNlSG92ZXJJbmZvIH0gZnJvbSAnLi90ZXJtaW5hbFRvb2x0aXAuanMnO1xuaW1wb3J0IHsgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvckZvclNldmVyaXR5IH0gZnJvbSAnLi90ZXJtaW5hbFN0YXR1c0xpc3QuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250ZXh0QWN0aW9uUnVubmVyIH0gZnJvbSAnLi90ZXJtaW5hbENvbnRleHRNZW51LmpzJztcbmltcG9ydCB0eXBlIHsgSUhvdmVyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN0b3JhZ2VLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3RvcmFnZUtleXMuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuZXhwb3J0IGNvbnN0IGVudW0gVGVybWluYWxUYWJzTGlzdFNpemVzIHtcblx0VGFiSGVpZ2h0ID0gMjIsXG5cdE5hcnJvd1ZpZXdXaWR0aCA9IDQ2LFxuXHRXaWRlVmlld01pbmltdW1XaWR0aCA9IDgwLFxuXHREZWZhdWx0V2lkdGggPSAxMjAsXG5cdE1pZHBvaW50Vmlld1dpZHRoID0gKFRlcm1pbmFsVGFic0xpc3RTaXplcy5OYXJyb3dWaWV3V2lkdGggKyBUZXJtaW5hbFRhYnNMaXN0U2l6ZXMuV2lkZVZpZXdNaW5pbXVtV2lkdGgpIC8gMixcblx0QWN0aW9uYmFyTWluaW11bVdpZHRoID0gMTA1LFxuXHRNYXhpbXVtV2lkdGggPSA1MDBcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsVGFiTGlzdCBleHRlbmRzIFdvcmtiZW5jaExpc3Q8SVRlcm1pbmFsSW5zdGFuY2U+IHtcblx0cHJpdmF0ZSBfZGVjb3JhdGlvbnNQcm92aWRlcjogVGFiRGVjb3JhdGlvbnNQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGVybWluYWxUYWJzU2luZ2xlU2VsZWN0ZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfaXNTcGxpdENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgX2hhc1RleHQ6IGJvb2xlYW4gPSB0cnVlO1xuXHRnZXQgaGFzVGV4dCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hhc1RleHQ7IH1cblxuXHRwcml2YXRlIF9oYXNBY3Rpb25CYXI6IGJvb2xlYW4gPSB0cnVlO1xuXHRnZXQgaGFzQWN0aW9uQmFyKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGFzQWN0aW9uQmFyOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaXN0U2VydmljZSBsaXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEVkaXRpbmdTZXJ2aWNlOiBJVGVybWluYWxFZGl0aW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElEZWNvcmF0aW9uc1NlcnZpY2UgZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ1Rlcm1pbmFsVGFic0xpc3QnLCBjb250YWluZXIsXG5cdFx0XHR7XG5cdFx0XHRcdGdldEhlaWdodDogKCkgPT4gVGVybWluYWxUYWJzTGlzdFNpemVzLlRhYkhlaWdodCxcblx0XHRcdFx0Z2V0VGVtcGxhdGVJZDogKCkgPT4gJ3Rlcm1pbmFsLnRhYnMnXG5cdFx0XHR9LFxuXHRcdFx0W2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsVGFic1JlbmRlcmVyLCBjb250YWluZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIpLCAoKSA9PiB0aGlzLmdldFNlbGVjdGVkRWxlbWVudHMoKSwge1xuXHRcdFx0XHRnZXRIYXNUZXh0OiAoKSA9PiB0aGlzLmhhc1RleHQsXG5cdFx0XHRcdGdldEhhc0FjdGlvbkJhcjogKCkgPT4gdGhpcy5oYXNBY3Rpb25CYXJcblx0XHRcdH0pXSxcblx0XHRcdHtcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnREeW5hbWljSGVpZ2h0czogZmFsc2UsXG5cdFx0XHRcdHNlbGVjdGlvbk5hdmlnYXRpb246IHRydWUsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRJZDogZSA9PiBlPy5pbnN0YW5jZUlkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxUYWJzQWNjZXNzaWJpbGl0eVByb3ZpZGVyKSxcblx0XHRcdFx0c21vb3RoU2Nyb2xsaW5nOiBfY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3dvcmtiZW5jaC5saXN0LnNtb290aFNjcm9sbGluZycpLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdHBhZGRpbmdCb3R0b206IFRlcm1pbmFsVGFic0xpc3RTaXplcy5UYWJIZWlnaHQsXG5cdFx0XHRcdGRuZDogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxUYWJzRHJhZ0FuZERyb3ApLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0bGlzdFNlcnZpY2UsXG5cdFx0XHRfY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgaW5zdGFuY2VEaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlSW5zdGFuY2VzKCgpID0+IHRoaXMucmVmcmVzaCgpKSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlR3JvdXBzKCgpID0+IHRoaXMucmVmcmVzaCgpKSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm9uRGlkU2hvdygoKSA9PiB0aGlzLnJlZnJlc2goKSksXG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSgoKSA9PiB0aGlzLnJlZnJlc2goKSksXG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZVRpdGxlQ2hhbmdlKCgpID0+IHRoaXMucmVmcmVzaCgpKSxcblx0XHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlSWNvbkNoYW5nZSgoKSA9PiB0aGlzLnJlZnJlc2goKSksXG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZVByaW1hcnlTdGF0dXNDaGFuZ2UoKCkgPT4gdGhpcy5yZWZyZXNoKCkpLFxuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlKCgpID0+IHRoaXMucmVmcmVzaCgpKSxcblx0XHRcdHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5yZWZyZXNoKCkpLFxuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZShlID0+IHtcblx0XHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0XHRjb25zdCBpID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLmluZGV4T2YoZSk7XG5cdFx0XHRcdFx0dGhpcy5zZXRTZWxlY3Rpb24oW2ldKTtcblx0XHRcdFx0XHR0aGlzLnJldmVhbChpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdH0pLFxuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFRlcm1pbmFsU3RvcmFnZUtleXMuVGFic1Nob3dEZXRhaWxlZCwgdGhpcy5kaXNwb3NhYmxlcykoKCkgPT4gdGhpcy5yZWZyZXNoKCkpLFxuXHRcdF07XG5cblx0XHQvLyBEaXNwb3NlIG9mIGluc3RhbmNlIGxpc3RlbmVycyBvbiBzaHV0ZG93biB0byBhdm9pZCBleHRyYSB3b3JrIGFuZCBzbyB0YWJzIGRvbid0IGRpc2FwcGVhclxuXHRcdC8vIGJyaWVmbHlcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChsaWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGUgPT4ge1xuXHRcdFx0ZGlzcG9zZShpbnN0YW5jZURpc3Bvc2FibGVzKTtcblx0XHRcdGluc3RhbmNlRGlzcG9zYWJsZXMubGVuZ3RoID0gMDtcblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2UoaW5zdGFuY2VEaXNwb3NhYmxlcyk7XG5cdFx0XHRpbnN0YW5jZURpc3Bvc2FibGVzLmxlbmd0aCA9IDA7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5vbk1vdXNlRGJsQ2xpY2soYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0XHRlLmJyb3dzZXJFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLmJyb3dzZXJFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogVGVybWluYWxMb2NhdGlvbi5QYW5lbCB9KTtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHRhd2FpdCBpbnN0YW5jZS5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbEVkaXRpbmdTZXJ2aWNlLmdldEVkaXRpbmdUZXJtaW5hbCgpPy5pbnN0YW5jZUlkID09PSBlLmVsZW1lbnQuaW5zdGFuY2VJZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9nZXRGb2N1c01vZGUoKSA9PT0gJ2RvdWJsZUNsaWNrJyAmJiB0aGlzLmdldEZvY3VzKCkubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGUuZWxlbWVudC5mb2N1cyh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBvbiBsZWZ0IGNsaWNrLCBpZiBmb2N1cyBtb2RlID0gc2luZ2xlIGNsaWNrLCBmb2N1cyB0aGUgZWxlbWVudFxuXHRcdC8vIHVubGVzcyBtdWx0aS1zZWxlY3Rpb24gaXMgaW4gcHJvZ3Jlc3Ncblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uTW91c2VDbGljayhhc3luYyBlID0+IHtcblx0XHRcdGlmICh0aGlzLl90ZXJtaW5hbEVkaXRpbmdTZXJ2aWNlLmdldEVkaXRpbmdUZXJtaW5hbCgpPy5pbnN0YW5jZUlkID09PSBlLmVsZW1lbnQ/Lmluc3RhbmNlSWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5icm93c2VyRXZlbnQuYWx0S2V5ICYmIGUuZWxlbWVudCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogeyBwYXJlbnRUZXJtaW5hbDogZS5lbGVtZW50IH0gfSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2dldEZvY3VzTW9kZSgpID09PSAnc2luZ2xlQ2xpY2snKSB7XG5cdFx0XHRcdGlmICh0aGlzLmdldFNlbGVjdGlvbigpLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRcdFx0ZS5lbGVtZW50Py5mb2N1cyh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIG9uIHJpZ2h0IGNsaWNrLCBzZXQgdGhlIGZvY3VzIHRvIHRoYXQgZWxlbWVudFxuXHRcdC8vIHVubGVzcyBtdWx0aS1zZWxlY3Rpb24gaXMgaW4gcHJvZ3Jlc3Ncblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uQ29udGV4dE1lbnUoZSA9PiB7XG5cdFx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0ZWRFbGVtZW50cygpO1xuXHRcdFx0aWYgKCFzZWxlY3Rpb24gfHwgIXNlbGVjdGlvbi5maW5kKHMgPT4gZS5lbGVtZW50ID09PSBzKSkge1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzKGUuaW5kZXggIT09IHVuZGVmaW5lZCA/IFtlLmluZGV4XSA6IFtdKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl90ZXJtaW5hbFRhYnNTaW5nbGVTZWxlY3RlZENvbnRleHRLZXkgPSBUZXJtaW5hbENvbnRleHRLZXlzLnRhYnNTaW5ndWxhclNlbGVjdGlvbi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2lzU3BsaXRDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5zcGxpdFRlcm1pbmFsVGFiRm9jdXNlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHRoaXMuX3VwZGF0ZUNvbnRleHRLZXkoKSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB0aGlzLl91cGRhdGVDb250ZXh0S2V5KCkpKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRPcGVuKGFzeW5jIGUgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdGlmICghZS5lZGl0b3JPcHRpb25zLnByZXNlcnZlRm9jdXMpIHtcblx0XHRcdFx0YXdhaXQgaW5zdGFuY2UuZm9jdXNXaGVuUmVhZHkoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0aWYgKCF0aGlzLl9kZWNvcmF0aW9uc1Byb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9uc1Byb3ZpZGVyID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFiRGVjb3JhdGlvbnNQcm92aWRlcikpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZGVjb3JhdGlvbnNTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcih0aGlzLl9kZWNvcmF0aW9uc1Byb3ZpZGVyKSk7XG5cdFx0fVxuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Rm9jdXNNb2RlKCk6ICdzaW5nbGVDbGljaycgfCAnZG91YmxlQ2xpY2snIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3NpbmdsZUNsaWNrJyB8ICdkb3VibGVDbGljayc+KFRlcm1pbmFsU2V0dGluZ0lkLlRhYnNGb2N1c01vZGUpO1xuXHR9XG5cblx0cmVmcmVzaChjYW5jZWxFZGl0aW5nOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmIChjYW5jZWxFZGl0aW5nICYmIHRoaXMuX3Rlcm1pbmFsRWRpdGluZ1NlcnZpY2UuaXNFZGl0YWJsZSh1bmRlZmluZWQpKSB7XG5cdFx0XHR0aGlzLmRvbUZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zcGxpY2UoMCwgdGhpcy5sZW5ndGgsIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5zbGljZSgpKTtcblx0fVxuXG5cdGZvY3VzSG92ZXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLmdldFNlbGVjdGVkRWxlbWVudHMoKVswXTtcblx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0Li4uZ2V0SW5zdGFuY2VIb3ZlckluZm8oaW5zdGFuY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKSxcblx0XHRcdHRhcmdldDogdGhpcy5nZXRIVE1MRWxlbWVudCgpLFxuXHRcdFx0dHJhcEZvY3VzOiB0cnVlXG5cdFx0fSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb250ZXh0S2V5KCkge1xuXHRcdHRoaXMuX3Rlcm1pbmFsVGFic1NpbmdsZVNlbGVjdGVkQ29udGV4dEtleS5zZXQodGhpcy5nZXRTZWxlY3RlZEVsZW1lbnRzKCkubGVuZ3RoID09PSAxKTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuZ2V0Rm9jdXNlZEVsZW1lbnRzKCk7XG5cdFx0dGhpcy5faXNTcGxpdENvbnRleHRLZXkuc2V0KGluc3RhbmNlLmxlbmd0aCA+IDAgJiYgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VJc1NwbGl0KGluc3RhbmNlWzBdKSk7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHRjb25zdCBhY3R1YWxXaWR0aCA9IHdpZHRoID8/IHRoaXMuZ2V0SFRNTEVsZW1lbnQoKS5jbGllbnRXaWR0aDtcblx0XHRjb25zdCBuZXdIYXNUZXh0ID0gYWN0dWFsV2lkdGggPj0gVGVybWluYWxUYWJzTGlzdFNpemVzLk1pZHBvaW50Vmlld1dpZHRoO1xuXHRcdGNvbnN0IG5ld0hhc0FjdGlvbkJhciA9IGFjdHVhbFdpZHRoID4gVGVybWluYWxUYWJzTGlzdFNpemVzLkFjdGlvbmJhck1pbmltdW1XaWR0aDtcblx0XHRpZiAodGhpcy5faGFzVGV4dCAhPT0gbmV3SGFzVGV4dCB8fCB0aGlzLl9oYXNBY3Rpb25CYXIgIT09IG5ld0hhc0FjdGlvbkJhcikge1xuXHRcdFx0dGhpcy5faGFzVGV4dCA9IG5ld0hhc1RleHQ7XG5cdFx0XHR0aGlzLl9oYXNBY3Rpb25CYXIgPSBuZXdIYXNBY3Rpb25CYXI7XG5cdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVGVybWluYWxUYWJzUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxUYWJFbnRyeVRlbXBsYXRlPiB7XG5cdHRlbXBsYXRlSWQgPSAndGVybWluYWwudGFicyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0X2NvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9nZXRTZWxlY3Rpb246ICgpID0+IElUZXJtaW5hbEluc3RhbmNlW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0VmlzaWJpbGl0eVN0YXRlOiBJVGVybWluYWxUYWJzUmVuZGVyZXJPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRASVRlcm1pbmFsRWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxFZGl0aW5nU2VydmljZTogSVRlcm1pbmFsRWRpdGluZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJVGVybWluYWxUYWJFbnRyeVRlbXBsYXRlIHtcblx0XHRjb25zdCBlbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy50ZXJtaW5hbC10YWJzLWVudHJ5JykpO1xuXHRcdGNvbnN0IGNvbnRleHQ6IHsgaG92ZXJBY3Rpb25zPzogSUhvdmVyQWN0aW9uW10gfSA9IHt9O1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBsYWJlbCA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2xhYmVscy5jcmVhdGUoZWxlbWVudCwge1xuXHRcdFx0c3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsXG5cdFx0XHRzdXBwb3J0RGVzY3JpcHRpb25IaWdobGlnaHRzOiB0cnVlLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZToge1xuXHRcdFx0XHRkZWxheTogMCxcblx0XHRcdFx0c2hvd0hvdmVyOiBvcHRpb25zID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faG92ZXJTZXJ2aWNlLnNob3dEZWxheWVkSG92ZXIoe1xuXHRcdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRcdGFjdGlvbnM6IGNvbnRleHQuaG92ZXJBY3Rpb25zLFxuXHRcdFx0XHRcdFx0dGFyZ2V0OiBlbGVtZW50LFxuXHRcdFx0XHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRcdFx0XHRzaG93UG9pbnRlcjogdHJ1ZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGhvdmVyUG9zaXRpb246IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnRhYnMubG9jYXRpb24gPT09ICdsZWZ0JyA/IEhvdmVyUG9zaXRpb24uUklHSFQgOiBIb3ZlclBvc2l0aW9uLkxFRlRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCB7IGdyb3VwSWQ6ICd0ZXJtaW5hbC10YWJzLWxpc3QnIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IERPTS5hcHBlbmQobGFiZWwuZWxlbWVudCwgJCgnLmFjdGlvbnMnKSk7XG5cblxuXG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25SdW5uZXI6IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBUZXJtaW5hbENvbnRleHRBY3Rpb25SdW5uZXIoKSksXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PlxuXHRcdFx0XHRhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvblxuXHRcdFx0XHRcdD8gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgeyBob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUgfSkpXG5cdFx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudCxcblx0XHRcdGxhYmVsLFxuXHRcdFx0YWN0aW9uQmFyLFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IElUZXJtaW5hbFRhYkVudHJ5VGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBoYXNUZXh0ID0gdGhpcy5fZ2V0VmlzaWJpbGl0eVN0YXRlLmdldEhhc1RleHQoKTtcblx0XHRjb25zdCBoYXNBY3Rpb25CYXIgPSB0aGlzLl9nZXRWaXNpYmlsaXR5U3RhdGUuZ2V0SGFzQWN0aW9uQmFyKCk7XG5cblx0XHRjb25zdCBncm91cCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgZ3JvdXAgZm9yIGluc3RhbmNlIFwiJHtpbnN0YW5jZS5pbnN0YW5jZUlkfVwiYCk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGUuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtdGV4dCcsIGhhc1RleHQpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaXMtYWN0aXZlJywgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlSW5zdGFuY2UgPT09IGluc3RhbmNlKTtcblxuXHRcdGxldCBwcmVmaXg6IHN0cmluZyA9ICcnO1xuXHRcdGlmIChncm91cC50ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbEluZGV4ID0gZ3JvdXAudGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZihpbnN0YW5jZSk7XG5cdFx0XHRpZiAodGVybWluYWxJbmRleCA9PT0gMCkge1xuXHRcdFx0XHRwcmVmaXggPSBgXHUyNTBDIGA7XG5cdFx0XHR9IGVsc2UgaWYgKHRlcm1pbmFsSW5kZXggPT09IGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0cHJlZml4ID0gYFx1MjUxNCBgO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJlZml4ID0gYFx1MjUxQyBgO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGhvdmVySW5mbyA9IGdldEluc3RhbmNlSG92ZXJJbmZvKGluc3RhbmNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSk7XG5cdFx0dGVtcGxhdGUuY29udGV4dC5ob3ZlckFjdGlvbnMgPSBob3ZlckluZm8uYWN0aW9ucztcblxuXHRcdGNvbnN0IGljb25JZCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGdldEljb25JZCwgaW5zdGFuY2UpO1xuXHRcdGxldCBsYWJlbDogc3RyaW5nID0gJyc7XG5cdFx0aWYgKCFoYXNUZXh0KSB7XG5cdFx0XHRjb25zdCBwcmltYXJ5U3RhdHVzID0gaW5zdGFuY2Uuc3RhdHVzTGlzdC5wcmltYXJ5O1xuXHRcdFx0Ly8gRG9uJ3Qgc2hvdyBpZ25vcmUgc2V2ZXJpdHlcblx0XHRcdGlmIChwcmltYXJ5U3RhdHVzICYmIHByaW1hcnlTdGF0dXMuc2V2ZXJpdHkgPiBTZXZlcml0eS5JZ25vcmUpIHtcblx0XHRcdFx0bGFiZWwgPSBgJHtwcmVmaXh9JCgke3ByaW1hcnlTdGF0dXMuaWNvbj8uaWQgfHwgaWNvbklkfSlgO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGFiZWwgPSBgJHtwcmVmaXh9JCgke2ljb25JZH0pYDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5maWxsQWN0aW9uQmFyKGluc3RhbmNlLCB0ZW1wbGF0ZSk7XG5cdFx0XHRsYWJlbCA9IHByZWZpeDtcblx0XHRcdC8vIE9ubHkgYWRkIHRoZSB0aXRsZSBpZiB0aGUgaWNvbiBpcyBzZXQsIHRoaXMgcHJldmVudHMgdGhlIHRpdGxlIGp1bXBpbmcgYXJvdW5kIGZvclxuXHRcdFx0Ly8gZXhhbXBsZSB3aGVuIGxhdW5jaGluZyB3aXRoIGEgU2hlbGxMYXVuY2hDb25maWcubmFtZSBhbmQgbm8gaWNvblxuXHRcdFx0aWYgKGluc3RhbmNlLmljb24pIHtcblx0XHRcdFx0bGFiZWwgKz0gYCQoJHtpY29uSWR9KSAke2luc3RhbmNlLnRpdGxlfWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFoYXNBY3Rpb25CYXIpIHtcblx0XHRcdHRlbXBsYXRlLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdH1cblxuXHRcdC8vIEtpbGwgdGVybWluYWwgb24gbWlkZGxlIGNsaWNrXG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlLmVsZW1lbnQsIERPTS5FdmVudFR5cGUuQVVYQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMS8qbWlkZGxlKi8pIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNhZmVEaXNwb3NlVGVybWluYWwoaW5zdGFuY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGV4dHJhQ2xhc3Nlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb2xvckNsYXNzID0gZ2V0Q29sb3JDbGFzcyhpbnN0YW5jZSk7XG5cdFx0aWYgKGNvbG9yQ2xhc3MpIHtcblx0XHRcdGV4dHJhQ2xhc3Nlcy5wdXNoKGNvbG9yQ2xhc3MpO1xuXHRcdH1cblx0XHRjb25zdCB1cmlDbGFzc2VzID0gZ2V0VXJpQ2xhc3NlcyhpbnN0YW5jZSwgdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKTtcblx0XHRpZiAodXJpQ2xhc3Nlcykge1xuXHRcdFx0ZXh0cmFDbGFzc2VzLnB1c2goLi4udXJpQ2xhc3Nlcyk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGUubGFiZWwuc2V0UmVzb3VyY2Uoe1xuXHRcdFx0cmVzb3VyY2U6IGluc3RhbmNlLnJlc291cmNlLFxuXHRcdFx0bmFtZTogbGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogaGFzVGV4dCA/IGluc3RhbmNlLmRlc2NyaXB0aW9uIDogdW5kZWZpbmVkXG5cdFx0fSwge1xuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB7XG5cdFx0XHRcdGNvbG9yczogdHJ1ZSxcblx0XHRcdFx0YmFkZ2VzOiBoYXNUZXh0XG5cdFx0XHR9LFxuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0bWFya2Rvd246IGhvdmVySW5mby5jb250ZW50LFxuXHRcdFx0XHRtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiB1bmRlZmluZWRcblx0XHRcdH0sXG5cdFx0XHRleHRyYUNsYXNzZXNcblx0XHR9KTtcblx0XHRjb25zdCBlZGl0YWJsZURhdGEgPSB0aGlzLl90ZXJtaW5hbEVkaXRpbmdTZXJ2aWNlLmdldEVkaXRhYmxlRGF0YShpbnN0YW5jZSk7XG5cdFx0dGVtcGxhdGUubGFiZWwuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdlZGl0YWJsZS10YWInLCAhIWVkaXRhYmxlRGF0YSk7XG5cdFx0aWYgKGVkaXRhYmxlRGF0YSkge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuX3JlbmRlcklucHV0Qm94KHRlbXBsYXRlLmxhYmVsLmVsZW1lbnQucXVlcnlTZWxlY3RvcignLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcicpISwgaW5zdGFuY2UsIGVkaXRhYmxlRGF0YSkpO1xuXHRcdFx0dGVtcGxhdGUuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVySW5wdXRCb3goY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCBlZGl0YWJsZURhdGE6IElFZGl0YWJsZURhdGEpOiBJRGlzcG9zYWJsZSB7XG5cblx0XHRjb25zdCB2YWx1ZSA9IGluc3RhbmNlLnRpdGxlIHx8ICcnO1xuXG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBuZXcgSW5wdXRCb3goY29udGFpbmVyLCB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdHZhbGlkYXRpb25PcHRpb25zOiB7XG5cdFx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlZGl0YWJsZURhdGEudmFsaWRhdGlvbk1lc3NhZ2UodmFsdWUpO1xuXHRcdFx0XHRcdGlmICghbWVzc2FnZSB8fCBtZXNzYWdlLnNldmVyaXR5ICE9PSBTZXZlcml0eS5FcnJvcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG1lc3NhZ2UuY29udGVudCxcblx0XHRcdFx0XHRcdGZvcm1hdENvbnRlbnQ6IHRydWUsXG5cdFx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlVHlwZS5FUlJPUlxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCd0ZXJtaW5hbElucHV0QXJpYUxhYmVsJywgXCJUeXBlIHRlcm1pbmFsIG5hbWUuIFByZXNzIEVudGVyIHRvIGNvbmZpcm0gb3IgRXNjYXBlIHRvIGNhbmNlbC5cIiksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzXG5cdFx0fSk7XG5cdFx0aW5wdXRCb3guZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnMjJweCc7XG5cdFx0aW5wdXRCb3gudmFsdWUgPSB2YWx1ZTtcblx0XHRpbnB1dEJveC5mb2N1cygpO1xuXHRcdGlucHV0Qm94LnNlbGVjdCh7IHN0YXJ0OiAwLCBlbmQ6IHZhbHVlLmxlbmd0aCB9KTtcblxuXHRcdGNvbnN0IGRvbmUgPSBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKHN1Y2Nlc3M6IGJvb2xlYW4sIGZpbmlzaEVkaXRpbmc6IGJvb2xlYW4pID0+IHtcblx0XHRcdGlucHV0Qm94LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdGNvbnN0IHZhbHVlID0gaW5wdXRCb3gudmFsdWU7XG5cdFx0XHRkaXNwb3NlKHRvRGlzcG9zZSk7XG5cdFx0XHRpbnB1dEJveC5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0aWYgKGZpbmlzaEVkaXRpbmcpIHtcblx0XHRcdFx0ZWRpdGFibGVEYXRhLm9uRmluaXNoKHZhbHVlLCBzdWNjZXNzKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNob3dJbnB1dEJveE5vdGlmaWNhdGlvbiA9ICgpID0+IHtcblx0XHRcdGlmIChpbnB1dEJveC5pc0lucHV0VmFsaWQoKSkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZWRpdGFibGVEYXRhLnZhbGlkYXRpb25NZXNzYWdlKGlucHV0Qm94LnZhbHVlKTtcblx0XHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0XHRpbnB1dEJveC5zaG93TWVzc2FnZSh7XG5cdFx0XHRcdFx0XHRjb250ZW50OiBtZXNzYWdlLmNvbnRlbnQsXG5cdFx0XHRcdFx0XHRmb3JtYXRDb250ZW50OiB0cnVlLFxuXHRcdFx0XHRcdFx0dHlwZTogbWVzc2FnZS5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuSW5mbyA/IE1lc3NhZ2VUeXBlLklORk8gOiBtZXNzYWdlLnNldmVyaXR5ID09PSBTZXZlcml0eS5XYXJuaW5nID8gTWVzc2FnZVR5cGUuV0FSTklORyA6IE1lc3NhZ2VUeXBlLkVSUk9SXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5wdXRCb3guaGlkZU1lc3NhZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0c2hvd0lucHV0Qm94Tm90aWZpY2F0aW9uKCk7XG5cblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBbXG5cdFx0XHRpbnB1dEJveCxcblx0XHRcdERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBJS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5FbnRlcikpIHtcblx0XHRcdFx0XHRkb25lKGlucHV0Qm94LmlzSW5wdXRWYWxpZCgpLCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0XHRkb25lKGZhbHNlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHRET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIoaW5wdXRCb3guaW5wdXRFbGVtZW50LCBET00uRXZlbnRUeXBlLktFWV9VUCwgKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdHNob3dJbnB1dEJveE5vdGlmaWNhdGlvbigpO1xuXHRcdFx0fSksXG5cdFx0XHRET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgRE9NLkV2ZW50VHlwZS5CTFVSLCAoKSA9PiB7XG5cdFx0XHRcdGRvbmUoaW5wdXRCb3guaXNJbnB1dFZhbGlkKCksIHRydWUpO1xuXHRcdFx0fSlcblx0XHRdO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRkb25lKGZhbHNlLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRlcm1pbmFsVGFiRW50cnlUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJVGVybWluYWxUYWJFbnRyeVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZmlsbEFjdGlvbkJhcihpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIHRlbXBsYXRlOiBJVGVybWluYWxUYWJFbnRyeVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Ly8gSWYgdGhlIGluc3RhbmNlIGlzIHdpdGhpbiB0aGUgc2VsZWN0aW9uLCBzcGxpdCBhbGwgc2VsZWN0ZWRcblx0XHRjb25zdCBhY3Rpb25zID0gW1xuXHRcdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKFRlcm1pbmFsQ29tbWFuZElkLlNwbGl0QWN0aXZlVGFiLCB0ZXJtaW5hbFN0cmluZ3Muc3BsaXQuc2hvcnQsIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNwbGl0SG9yaXpvbnRhbCksIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5fcnVuRm9yU2VsZWN0aW9uT3JJbnN0YW5jZShpbnN0YW5jZSwgYXN5bmMgZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IHsgcGFyZW50VGVybWluYWw6IGUgfSB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSksXG5cdFx0XTtcblx0XHRpZiAoaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9ucykge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2godGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKGFjdGlvbi5pZCwgYWN0aW9uLmxhYmVsLCBhY3Rpb24uaWNvbiA/IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShhY3Rpb24uaWNvbikgOiB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9ydW5Gb3JTZWxlY3Rpb25Pckluc3RhbmNlKGluc3RhbmNlLCBlID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGFjdGlvbi5pZCwgaW5zdGFuY2UpKTtcblx0XHRcdFx0fSkpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YWN0aW9ucy5wdXNoKHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbihUZXJtaW5hbENvbW1hbmRJZC5LaWxsQWN0aXZlVGFiLCB0ZXJtaW5hbFN0cmluZ3Mua2lsbC5zaG9ydCwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24udHJhc2hjYW4pLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl9ydW5Gb3JTZWxlY3Rpb25Pckluc3RhbmNlKGluc3RhbmNlLCBlID0+IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zYWZlRGlzcG9zZVRlcm1pbmFsKGUpKTtcblx0XHR9KSkpO1xuXHRcdC8vIFRPRE86IENhY2hlIHRoZXNlIGluIGEgd2F5IHRoYXQgd2lsbCB1c2UgdGhlIGNvcnJlY3QgaW5zdGFuY2Vcblx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zKSB7XG5cdFx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIucHVzaChhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlLCBrZXliaW5kaW5nOiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk/LmdldExhYmVsKCkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcnVuRm9yU2VsZWN0aW9uT3JJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGNhbGxiYWNrOiAoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKSA9PiB2b2lkKSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHNlbGVjdGlvbi5pbmNsdWRlcyhpbnN0YW5jZSkpIHtcblx0XHRcdGZvciAoY29uc3QgcyBvZiBzZWxlY3Rpb24pIHtcblx0XHRcdFx0aWYgKHMpIHtcblx0XHRcdFx0XHRjYWxsYmFjayhzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjYWxsYmFjayhpbnN0YW5jZSk7XG5cdFx0fVxuXHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmZvY3VzVGFicygpO1xuXHRcdHRoaXMuX2xpc3RTZXJ2aWNlLmxhc3RGb2N1c2VkTGlzdD8uZm9jdXNOZXh0KCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUZXJtaW5hbFRhYnNSZW5kZXJlck9wdGlvbnMge1xuXHRnZXRIYXNUZXh0OiAoKSA9PiBib29sZWFuO1xuXHRnZXRIYXNBY3Rpb25CYXI6ICgpID0+IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJVGVybWluYWxUYWJFbnRyeVRlbXBsYXRlIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG5cdGNvbnRleHQ6IHtcblx0XHRob3ZlckFjdGlvbnM/OiBJSG92ZXJBY3Rpb25bXTtcblx0fTtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuXG5jbGFzcyBUZXJtaW5hbFRhYnNBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlcm1pbmFsR3JvdXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCd0ZXJtaW5hbC50YWJzJywgXCJUZXJtaW5hbCB0YWJzXCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHN0cmluZyB7XG5cdFx0bGV0IGFyaWFMYWJlbDogc3RyaW5nID0gJyc7XG5cdFx0Y29uc3QgdGFiID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0aWYgKHRhYiAmJiB0YWIudGVybWluYWxJbnN0YW5jZXM/Lmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsSW5kZXggPSB0YWIudGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZihpbnN0YW5jZSk7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ3NwbGl0VGVybWluYWxBcmlhTGFiZWwnLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0YFRoZSB0ZXJtaW5hbCdzIElEYCxcblx0XHRcdFx0XHRgVGhlIHRlcm1pbmFsJ3MgdGl0bGVgLFxuXHRcdFx0XHRcdGBUaGUgdGVybWluYWwncyBzcGxpdCBudW1iZXJgLFxuXHRcdFx0XHRcdGBUaGUgdGVybWluYWwgZ3JvdXAncyB0b3RhbCBzcGxpdCBudW1iZXJgXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiVGVybWluYWwgezB9IHsxfSwgc3BsaXQgezJ9IG9mIHszfVwiLCBpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS50aXRsZSwgdGVybWluYWxJbmRleCArIDEsIHRhYi50ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ3Rlcm1pbmFsQXJpYUxhYmVsJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdGBUaGUgdGVybWluYWwncyBJRGAsXG5cdFx0XHRcdFx0YFRoZSB0ZXJtaW5hbCdzIHRpdGxlYFxuXHRcdFx0XHRdXG5cdFx0XHR9LCBcIlRlcm1pbmFsIHswfSB7MX1cIiwgaW5zdGFuY2UuaW5zdGFuY2VJZCwgaW5zdGFuY2UudGl0bGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJpYUxhYmVsO1xuXHR9XG59XG5cbmNsYXNzIFRlcm1pbmFsVGFic0RyYWdBbmREcm9wIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMaXN0RHJhZ0FuZERyb3A8SVRlcm1pbmFsSW5zdGFuY2U+IHtcblx0cHJpdmF0ZSBfYXV0b0ZvY3VzSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hdXRvRm9jdXNEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cHJpdmF0ZSBfcHJpbWFyeUJhY2tlbmQ6IElUZXJtaW5hbEJhY2tlbmQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRASVRlcm1pbmFsRWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxFZGl0aW5nU2VydmljZTogSVRlcm1pbmFsRWRpdGluZ1NlcnZpY2UsXG5cdFx0QElMaXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9saXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3ByaW1hcnlCYWNrZW5kID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmdldFByaW1hcnlCYWNrZW5kKCk7XG5cdH1cblxuXHRnZXREcmFnVVJJKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbEVkaXRpbmdTZXJ2aWNlLmdldEVkaXRpbmdUZXJtaW5hbCgpPy5pbnN0YW5jZUlkID09PSBpbnN0YW5jZS5pbnN0YW5jZUlkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5zdGFuY2UucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0fVxuXG5cdGdldERyYWdMYWJlbD8oZWxlbWVudHM6IElUZXJtaW5hbEluc3RhbmNlW10sIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGVsZW1lbnRzLmxlbmd0aCA9PT0gMSA/IGVsZW1lbnRzWzBdLnRpdGxlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0b25EcmFnTGVhdmUoKSB7XG5cdFx0dGhpcy5fYXV0b0ZvY3VzSW5zdGFuY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fYXV0b0ZvY3VzRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYXV0b0ZvY3VzRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0fVxuXG5cdG9uRHJhZ1N0YXJ0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdGlmICghb3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZG5kRGF0YTogdW5rbm93biA9IGRhdGEuZ2V0RGF0YSgpO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShkbmREYXRhKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBdHRhY2ggdGVybWluYWxzIHR5cGUgdG8gZXZlbnRcblx0XHRjb25zdCB0ZXJtaW5hbHMgPSAoZG5kRGF0YSBhcyB1bmtub3duW10pLmZpbHRlcihpc1Rlcm1pbmFsSW5zdGFuY2UpO1xuXHRcdGlmICh0ZXJtaW5hbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0b3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIuc2V0RGF0YShUZXJtaW5hbERhdGFUcmFuc2ZlcnMuVGVybWluYWxzLCBKU09OLnN0cmluZ2lmeSh0ZXJtaW5hbHMubWFwKGUgPT4gZS5yZXNvdXJjZS50b1N0cmluZygpKSkpO1xuXHRcdH1cblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0SW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHwgSUxpc3REcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRpZiAoZGF0YSBpbnN0YW5jZW9mIE5hdGl2ZURyYWdBbmREcm9wRGF0YSkge1xuXHRcdFx0aWYgKCFjb250YWluc0RyYWdUeXBlKG9yaWdpbmFsRXZlbnQsIERhdGFUcmFuc2ZlcnMuRklMRVMsIERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTLCBUZXJtaW5hbERhdGFUcmFuc2ZlcnMuVGVybWluYWxzLCBDb2RlRGF0YVRyYW5zZmVycy5GSUxFUykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRpZENoYW5nZUF1dG9Gb2N1c0luc3RhbmNlID0gdGhpcy5fYXV0b0ZvY3VzSW5zdGFuY2UgIT09IHRhcmdldEluc3RhbmNlO1xuXHRcdGlmIChkaWRDaGFuZ2VBdXRvRm9jdXNJbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5fYXV0b0ZvY3VzRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9hdXRvRm9jdXNJbnN0YW5jZSA9IHRhcmdldEluc3RhbmNlO1xuXHRcdH1cblxuXHRcdGlmICghdGFyZ2V0SW5zdGFuY2UgJiYgIWNvbnRhaW5zRHJhZ1R5cGUob3JpZ2luYWxFdmVudCwgVGVybWluYWxEYXRhVHJhbnNmZXJzLlRlcm1pbmFscykpIHtcblx0XHRcdHJldHVybiBkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE7XG5cdFx0fVxuXG5cdFx0aWYgKGRpZENoYW5nZUF1dG9Gb2N1c0luc3RhbmNlICYmIHRhcmdldEluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLl9hdXRvRm9jdXNEaXNwb3NhYmxlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGFyZ2V0SW5zdGFuY2UpO1xuXHRcdFx0XHR0aGlzLl9hdXRvRm9jdXNJbnN0YW5jZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0sIDUwMCwgdGhpcy5fc3RvcmUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRmZWVkYmFjazogdGFyZ2V0SW5kZXggPyBbdGFyZ2V0SW5kZXhdIDogdW5kZWZpbmVkLFxuXHRcdFx0YWNjZXB0OiB0cnVlLFxuXHRcdFx0ZWZmZWN0OiB7IHR5cGU6IExpc3REcmFnT3ZlckVmZmVjdFR5cGUuTW92ZSwgcG9zaXRpb246IExpc3REcmFnT3ZlckVmZmVjdFBvc2l0aW9uLk92ZXIgfVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBkcm9wKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fYXV0b0ZvY3VzRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYXV0b0ZvY3VzSW5zdGFuY2UgPSB1bmRlZmluZWQ7XG5cblx0XHRsZXQgc291cmNlSW5zdGFuY2VzOiBJVGVybWluYWxJbnN0YW5jZVtdIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElQcm9jZXNzRGV0YWlscyB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IGdldFRlcm1pbmFsUmVzb3VyY2VzRnJvbURyYWdFdmVudChvcmlnaW5hbEV2ZW50KTtcblx0XHRpZiAocmVzb3VyY2VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UodXJpKTtcblx0XHRcdFx0aWYgKGluc3RhbmNlKSB7XG5cdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoc291cmNlSW5zdGFuY2VzKSkge1xuXHRcdFx0XHRcdFx0c291cmNlSW5zdGFuY2VzLnB1c2goaW5zdGFuY2UpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRzb3VyY2VJbnN0YW5jZXMgPSBbaW5zdGFuY2VdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UubW92ZVRvVGVybWluYWxWaWV3KGluc3RhbmNlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9wcmltYXJ5QmFja2VuZCkge1xuXHRcdFx0XHRcdGNvbnN0IHRlcm1pbmFsSWRlbnRpZmllciA9IHBhcnNlVGVybWluYWxVcmkodXJpKTtcblx0XHRcdFx0XHRpZiAodGVybWluYWxJZGVudGlmaWVyLmluc3RhbmNlSWQpIHtcblx0XHRcdFx0XHRcdHByb21pc2VzLnB1c2godGhpcy5fcHJpbWFyeUJhY2tlbmQucmVxdWVzdERldGFjaEluc3RhbmNlKHRlcm1pbmFsSWRlbnRpZmllci53b3Jrc3BhY2VJZCwgdGVybWluYWxJZGVudGlmaWVyLmluc3RhbmNlSWQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocHJvbWlzZXMubGVuZ3RoKSB7XG5cdFx0XHRsZXQgcHJvY2Vzc2VzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdFx0cHJvY2Vzc2VzID0gcHJvY2Vzc2VzLmZpbHRlcihwID0+IHAgIT09IHVuZGVmaW5lZCk7XG5cdFx0XHRsZXQgbGFzdEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAoY29uc3QgYXR0YWNoUGVyc2lzdGVudFByb2Nlc3Mgb2YgcHJvY2Vzc2VzKSB7XG5cdFx0XHRcdGxhc3RJbnN0YW5jZSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGNvbmZpZzogeyBhdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyB9IH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxhc3RJbnN0YW5jZSkge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UobGFzdEluc3RhbmNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc291cmNlSW5zdGFuY2VzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmICghKGRhdGEgaW5zdGFuY2VvZiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSkpIHtcblx0XHRcdFx0dGhpcy5faGFuZGxlRXh0ZXJuYWxEcm9wKHRhcmdldEluc3RhbmNlLCBvcmlnaW5hbEV2ZW50KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkcmFnZ2VkRWxlbWVudCA9IGRhdGEuZ2V0RGF0YSgpO1xuXHRcdFx0aWYgKCFkcmFnZ2VkRWxlbWVudCB8fCAhQXJyYXkuaXNBcnJheShkcmFnZ2VkRWxlbWVudCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzb3VyY2VJbnN0YW5jZXMgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZSBvZiBkcmFnZ2VkRWxlbWVudCkge1xuXHRcdFx0XHRpZiAoaXNUZXJtaW5hbEluc3RhbmNlKGUpKSB7XG5cdFx0XHRcdFx0c291cmNlSW5zdGFuY2VzLnB1c2goZSBhcyBJVGVybWluYWxJbnN0YW5jZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRhcmdldEluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5tb3ZlR3JvdXBUb0VuZChzb3VyY2VJbnN0YW5jZXMpO1xuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKHNvdXJjZUluc3RhbmNlc1swXSk7XG5cdFx0XHRjb25zdCB0YXJnZXRHcm91cCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2Uoc291cmNlSW5zdGFuY2VzWzBdKTtcblx0XHRcdGlmICh0YXJnZXRHcm91cCkge1xuXHRcdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdyb3Vwcy5pbmRleE9mKHRhcmdldEdyb3VwKTtcblx0XHRcdFx0dGhpcy5fbGlzdFNlcnZpY2UubGFzdEZvY3VzZWRMaXN0Py5zZXRTZWxlY3Rpb24oW2luZGV4XSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UubW92ZUdyb3VwKHNvdXJjZUluc3RhbmNlcywgdGFyZ2V0SW5zdGFuY2UpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShzb3VyY2VJbnN0YW5jZXNbMF0pO1xuXHRcdGNvbnN0IHRhcmdldEdyb3VwID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0R3JvdXBGb3JJbnN0YW5jZShzb3VyY2VJbnN0YW5jZXNbMF0pO1xuXHRcdGlmICh0YXJnZXRHcm91cCkge1xuXHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5ncm91cHMuaW5kZXhPZih0YXJnZXRHcm91cCk7XG5cdFx0XHR0aGlzLl9saXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q/LnNldFNlbGVjdGlvbihbaW5kZXhdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVFeHRlcm5hbERyb3AoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkLCBlOiBEcmFnRXZlbnQpIHtcblx0XHRpZiAoIWluc3RhbmNlIHx8ICFlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGZpbGVzIHdlcmUgZHJhZ2dlZCBmcm9tIHRoZSB0cmVlIGV4cGxvcmVyXG5cdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmF3UmVzb3VyY2VzID0gZS5kYXRhVHJhbnNmZXIuZ2V0RGF0YShEYXRhVHJhbnNmZXJzLlJFU09VUkNFUyk7XG5cdFx0aWYgKHJhd1Jlc291cmNlcykge1xuXHRcdFx0cmVzb3VyY2UgPSBVUkkucGFyc2UoSlNPTi5wYXJzZShyYXdSZXNvdXJjZXMpWzBdKTtcblx0XHR9XG5cblx0XHRjb25zdCByYXdDb2RlRmlsZXMgPSBlLmRhdGFUcmFuc2Zlci5nZXREYXRhKENvZGVEYXRhVHJhbnNmZXJzLkZJTEVTKTtcblx0XHRpZiAoIXJlc291cmNlICYmIHJhd0NvZGVGaWxlcykge1xuXHRcdFx0cmVzb3VyY2UgPSBVUkkuZmlsZShKU09OLnBhcnNlKHJhd0NvZGVGaWxlcylbMF0pO1xuXHRcdH1cblxuXHRcdGlmICghcmVzb3VyY2UgJiYgZS5kYXRhVHJhbnNmZXIuZmlsZXMubGVuZ3RoID4gMCAmJiBnZXRQYXRoRm9yRmlsZShlLmRhdGFUcmFuc2Zlci5maWxlc1swXSkpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBmaWxlIHdhcyBkcmFnZ2VkIGZyb20gdGhlIGZpbGVzeXN0ZW1cblx0XHRcdHJlc291cmNlID0gVVJJLmZpbGUoZ2V0UGF0aEZvckZpbGUoZS5kYXRhVHJhbnNmZXIuZmlsZXNbMF0pISk7XG5cdFx0fVxuXG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cblx0XHRpbnN0YW5jZS5mb2N1cygpO1xuXHRcdGF3YWl0IGluc3RhbmNlLnNlbmRQYXRoKHJlc291cmNlLCBmYWxzZSk7XG5cdH1cbn1cblxuY2xhc3MgVGFiRGVjb3JhdGlvbnNQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGVjb3JhdGlvbnNQcm92aWRlciB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBsb2NhbGl6ZSgnbGFiZWwnLCBcIlRlcm1pbmFsXCIpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSVRlcm1pbmFsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkFueUluc3RhbmNlUHJpbWFyeVN0YXR1c0NoYW5nZShlID0+IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoW2UucmVzb3VyY2VdKSkpO1xuXHR9XG5cblx0cHJvdmlkZURlY29yYXRpb25zKHJlc291cmNlOiBVUkkpOiBJRGVjb3JhdGlvbkRhdGEgfCB1bmRlZmluZWQge1xuXHRcdGlmIChyZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMudnNjb2RlVGVybWluYWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UocmVzb3VyY2UpO1xuXHRcdGlmICghaW5zdGFuY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJpbWFyeVN0YXR1cyA9IGluc3RhbmNlPy5zdGF0dXNMaXN0Py5wcmltYXJ5O1xuXHRcdGlmICghcHJpbWFyeVN0YXR1cz8uaWNvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29sb3I6IGdldENvbG9yRm9yU2V2ZXJpdHkocHJpbWFyeVN0YXR1cy5zZXZlcml0eSksXG5cdFx0XHRsZXR0ZXI6IHByaW1hcnlTdGF0dXMuaWNvbixcblx0XHRcdHRvb2x0aXA6IHByaW1hcnlTdGF0dXMudG9vbHRpcFxuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNUZXJtaW5hbEluc3RhbmNlKG9iajogdW5rbm93bik6IG9iaiBpcyBJVGVybWluYWxJbnN0YW5jZSB7XG5cdHJldHVybiBpc09iamVjdChvYmopICYmICdpbnN0YW5jZUlkJyBpbiBvYmo7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYyxxQkFBcUI7QUFFNUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsK0JBQStCLHVCQUEwQyxrQkFBa0IseUJBQXlCLDZCQUE2QjtBQUMxSixTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQkFBK0I7QUFDeEMsU0FB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U0FBUyxjQUFjLEtBQUssYUFBYTtBQU14QyxTQUFLLFVBQVUsS0FBSyxpQkFBaUIsaUNBQWlDLE9BQUssS0FBSyxhQUFhLEtBQUssQ0FBQyxFQUFFLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNqSDtBQUFBLEVBRUEsbUJBQW1CLFVBQTRDO0FBQzlELFFBQUksU0FBUyxXQUFXLFFBQVEsZ0JBQWdCO0FBQy9DLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxXQUFXLEtBQUssaUJBQWlCLHdCQUF3QixRQUFRO0FBQ3ZFLFFBQUksQ0FBQyxVQUFVO0FBQ2QsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGdCQUFnQixVQUFVLFlBQVk7QUFDNUMsUUFBSSxDQUFDLGVBQWUsTUFBTTtBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxNQUNOLE9BQU8sb0JBQW9CLGNBQWMsUUFBUTtBQUFBLE1BQ2pELFFBQVEsY0FBYztBQUFBLE1BQ3RCLFNBQVMsY0FBYztBQUFBLElBQ3hCO0FBQUEsRUFDRDtBQUNEO0FBbENNLHlCQUFOO0FBQUEsRUFPRztBQUFBLEdBUEc7QUFvQ04sU0FBUyxtQkFBbUIsS0FBd0M7QUFDbkUsU0FBTyxTQUFTLEdBQUcsS0FBSyxnQkFBZ0I7QUFDekM7IiwKICAibmFtZXMiOiBbIlRlcm1pbmFsVGFic0xpc3RTaXplcyIsICJ2YWx1ZSIsICJ0YXJnZXRHcm91cCJdCn0K
