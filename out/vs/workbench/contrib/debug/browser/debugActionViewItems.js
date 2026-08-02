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
import * as nls from "../../../../nls.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDebugService, State } from "../common/debug.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { selectBorder, selectBackground, asCssVariable } from "../../../../platform/theme/common/colorRegistry.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { ADD_CONFIGURATION_ID } from "./debugCommands.js";
import { BaseActionViewItem, SelectActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { debugStart } from "./debugIcons.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { ActionWidgetDropdown } from "../../../../platform/actionWidget/browser/actionWidgetDropdown.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { renderLabelWithIcons } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
let StartDebugActionViewItem = class extends BaseActionViewItem {
  constructor(context, action, options, debugService, configurationService, commandService, contextService, _contextViewService, keybindingService, hoverService, contextKeyService, actionWidgetService, telemetryService) {
    super(context, action, options);
    this.context = context;
    this.debugService = debugService;
    this.configurationService = configurationService;
    this.commandService = commandService;
    this.contextService = contextService;
    this.keybindingService = keybindingService;
    this.hoverService = hoverService;
    this.contextKeyService = contextKeyService;
    this.actionWidgetService = actionWidgetService;
    this.telemetryService = telemetryService;
    this.debugOptions = [];
    this.selected = 0;
    this.providers = [];
    this.optionCategories = [];
    this.toDispose = [];
    this.registerListeners();
  }
  registerListeners() {
    this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("launch")) {
        this.updateOptions();
      }
    }));
    this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration(() => {
      this.updateOptions();
    }));
  }
  render(container) {
    this.container = container;
    container.classList.add("start-debug-action-item");
    this.start = dom.append(container, dom.$(ThemeIcon.asCSSSelector(debugStart)));
    const title = this.keybindingService.appendKeybinding(this.action.label, this.action.id);
    this.toDispose.push(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.start, title));
    this.start.setAttribute("role", "button");
    this._setAriaLabel(title);
    this._register(Gesture.addTarget(this.start));
    for (const event of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this.toDispose.push(dom.addDisposableListener(this.start, event, () => {
        this.start.blur();
        if (this.debugService.state !== State.Initializing) {
          this.actionRunner.run(this.action, this.context);
        }
      }));
    }
    this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_DOWN, (e) => {
      if (this.action.enabled && e.button === 0) {
        this.start.classList.add("active");
      }
    }));
    this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_UP, () => {
      this.start.classList.remove("active");
    }));
    this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.MOUSE_OUT, () => {
      this.start.classList.remove("active");
    }));
    this.toDispose.push(dom.addDisposableListener(this.start, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.RightArrow)) {
        this.start.tabIndex = -1;
        this.dropdownLabel?.focus();
        event.stopPropagation();
      }
    }));
    this.configurationContainer = dom.append(container, dom.$(".configuration"));
    this.dropdown = new ActionWidgetDropdown(this.configurationContainer, {
      label: nls.localize("debugLaunchConfigurations", "Debug Launch Configurations"),
      labelRenderer: (el) => {
        this.dropdownLabel = el;
        el.classList.add("start-debug-action-item-dropdown-label");
        el.tabIndex = -1;
        el.setAttribute("role", "button");
        el.setAttribute("aria-haspopup", "true");
        el.setAttribute("aria-expanded", "false");
        this.renderDropdownLabel();
        return null;
      },
      actionProvider: { getActions: () => this.getDropdownActions() },
      listOptions: {
        showFilter: true,
        filterPlaceholder: nls.localize("debugLaunchConfigurations.search", "Search configurations"),
        focusFilterOnOpen: true
      }
    }, this.actionWidgetService, this.keybindingService, this.telemetryService);
    this.toDispose.push(this.dropdown);
    this.toDispose.push(this.dropdown.onDidChangeVisibility((visible) => {
      this.dropdownLabel?.setAttribute("aria-expanded", String(visible));
    }));
    this.toDispose.push(dom.addDisposableListener(this.configurationContainer, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.LeftArrow)) {
        if (this.dropdownLabel) {
          this.dropdownLabel.tabIndex = -1;
        }
        this.start.tabIndex = 0;
        this.start.focus();
        event.stopPropagation();
        event.preventDefault();
      }
    }));
    this.container.style.border = `1px solid ${asCssVariable(selectBorder)}`;
    this.configurationContainer.style.borderLeft = `1px solid ${asCssVariable(selectBorder)}`;
    this.container.style.backgroundColor = asCssVariable(selectBackground);
    const configManager = this.debugService.getConfigurationManager();
    const updateDynamicConfigs = () => configManager.getDynamicProviders().then((providers) => {
      if (providers.length !== this.providers.length) {
        this.providers = providers;
        this.updateOptions();
      }
    });
    this.toDispose.push(configManager.onDidChangeConfigurationProviders(updateDynamicConfigs));
    updateDynamicConfigs();
    this.updateOptions();
  }
  setActionContext(context) {
    this.context = context;
  }
  isEnabled() {
    return true;
  }
  focus(fromRight) {
    if (fromRight) {
      if (this.dropdownLabel) {
        this.dropdownLabel.tabIndex = 0;
        this.dropdownLabel.focus();
      }
    } else {
      this.start.tabIndex = 0;
      this.start.focus();
    }
  }
  blur() {
    this.start.tabIndex = -1;
    if (this.dropdownLabel) {
      this.dropdownLabel.tabIndex = -1;
      this.dropdownLabel.blur();
    }
    this.container.blur();
  }
  setFocusable(focusable) {
    if (focusable) {
      this.start.tabIndex = 0;
    } else {
      this.start.tabIndex = -1;
      if (this.dropdownLabel) {
        this.dropdownLabel.tabIndex = -1;
      }
    }
  }
  dispose() {
    this.toDispose = dispose(this.toDispose);
    super.dispose();
  }
  renderDropdownLabel() {
    if (!this.dropdownLabel) {
      return;
    }
    const currentLabel = this.debugOptions[this.selected]?.label ?? nls.localize("noConfigurations", "No Configurations");
    const labelSpan = dom.$("span.start-debug-action-item-label", void 0, currentLabel);
    const chevron = renderLabelWithIcons("$(chevron-down)");
    dom.reset(this.dropdownLabel, labelSpan, ...chevron);
    this.dropdownLabel.title = currentLabel;
    this.dropdownLabel.setAttribute("aria-label", nls.localize("debugLaunchConfigurationsAriaLabel", "Debug Launch Configurations: {0}", currentLabel));
  }
  getDropdownActions() {
    const actions = [];
    for (let i = 0; i < this.debugOptions.length; i++) {
      const option = this.debugOptions[i];
      const category = this.optionCategories[i];
      actions.push({
        id: `debug.config.${i}`,
        label: option.label,
        tooltip: option.label,
        class: void 0,
        enabled: true,
        checked: i === this.selected,
        category,
        run: async () => {
          await option.handler();
        }
      });
    }
    return actions;
  }
  updateOptions() {
    this.selected = 0;
    this.debugOptions = [];
    this.optionCategories = [];
    const manager = this.debugService.getConfigurationManager();
    const inWorkspace = this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
    let lastGroup;
    let groupOrder = 0;
    const pushOption = (option, category) => {
      this.debugOptions.push(option);
      this.optionCategories.push(category);
    };
    manager.getAllConfigurations().forEach(({ launch, name, presentation }) => {
      if (lastGroup !== presentation?.group) {
        lastGroup = presentation?.group;
        if (this.debugOptions.length) {
          groupOrder++;
        }
      }
      if (name === manager.selectedConfiguration.name && launch === manager.selectedConfiguration.launch) {
        this.selected = this.debugOptions.length;
      }
      const label = inWorkspace ? `${name} (${launch.name})` : name;
      pushOption({
        label,
        handler: async () => {
          await manager.selectConfiguration(launch, name);
          return true;
        }
      }, { label: `configurations-${groupOrder}`, order: groupOrder });
    });
    manager.getRecentDynamicConfigurations().slice(0, 3).forEach(({ name, type }) => {
      if (type === manager.selectedConfiguration.type && manager.selectedConfiguration.name === name) {
        this.selected = this.debugOptions.length;
      }
      pushOption({
        label: name,
        handler: async () => {
          await manager.selectConfiguration(void 0, name, void 0, { type });
          return true;
        }
      }, { label: "recent-dynamic", order: 100 });
    });
    if (this.debugOptions.length === 0) {
      pushOption({ label: nls.localize("noConfigurations", "No Configurations"), handler: async () => false }, void 0);
    }
    this.providers.forEach((p) => {
      pushOption({
        label: `${p.label}...`,
        handler: async () => {
          const picked = await p.pick();
          if (picked) {
            await manager.selectConfiguration(picked.launch, picked.config.name, picked.config, { type: p.type });
            return true;
          }
          return false;
        }
      }, { label: "actions", order: 200 });
    });
    manager.getLaunches().filter((l) => !l.hidden).forEach((l) => {
      const label = inWorkspace ? nls.localize("addConfigTo", "Add Config ({0})...", l.name) : nls.localize("addConfiguration", "Add Configuration...");
      pushOption({
        label,
        handler: async () => {
          await this.commandService.executeCommand(ADD_CONFIGURATION_ID, l.uri.toString());
          return false;
        }
      }, { label: "actions", order: 200 });
    });
    this.renderDropdownLabel();
  }
  _setAriaLabel(title) {
    let ariaLabel = title;
    let keybinding;
    const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.Debug);
    if (verbose) {
      keybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp, this.contextKeyService)?.getLabel() ?? void 0;
    }
    if (keybinding) {
      ariaLabel = nls.localize("commentLabelWithKeybinding", "{0}, use ({1}) for accessibility help", ariaLabel, keybinding);
    } else {
      ariaLabel = nls.localize("commentLabelWithKeybindingNoKeybinding", "{0}, run the command Open Accessibility Help which is currently not triggerable via keybinding.", ariaLabel);
    }
    this.start.ariaLabel = ariaLabel;
  }
};
StartDebugActionViewItem = __decorateClass([
  __decorateParam(3, IDebugService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IContextViewService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IActionWidgetService),
  __decorateParam(12, ITelemetryService)
], StartDebugActionViewItem);
let FocusSessionActionViewItem = class extends SelectActionViewItem {
  constructor(action, session, debugService, contextViewService, configurationService) {
    super(null, action, [], -1, contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize("debugSession", "Debug Session"), useCustomDrawn: !hasNativeContextMenu(configurationService) });
    this.debugService = debugService;
    this.configurationService = configurationService;
    this._register(this.debugService.getViewModel().onDidFocusSession(() => {
      const session2 = this.getSelectedSession();
      if (session2) {
        const index = this.getSessions().indexOf(session2);
        this.select(index);
      }
    }));
    const sessionListenersStore = this._register(new DisposableStore());
    const registerSessionListeners = (session2) => {
      const sessionListeners = sessionListenersStore.add(new DisposableStore());
      sessionListeners.add(session2.onDidChangeName(() => this.update()));
      sessionListeners.add(session2.onDidEndAdapter(() => sessionListenersStore.delete(sessionListeners)));
    };
    this._register(this.debugService.onDidNewSession((session2) => {
      registerSessionListeners(session2);
      this.update();
    }));
    this.getSessions().forEach(registerSessionListeners);
    this._register(this.debugService.onDidEndSession(() => this.update()));
    const selectedSession = session ? this.mapFocusedSessionToSelected(session) : void 0;
    this.update(selectedSession);
  }
  getActionContext(_, index) {
    return this.getSessions()[index];
  }
  update(session) {
    if (!session) {
      session = this.getSelectedSession();
    }
    const sessions = this.getSessions();
    const names = sessions.map((s) => {
      const label = s.getLabel();
      if (s.parentSession) {
        return `\xA0\xA0${label}`;
      }
      return label;
    });
    this.setOptions(names.map((data) => ({ text: data })), session ? sessions.indexOf(session) : void 0);
  }
  getSelectedSession() {
    const session = this.debugService.getViewModel().focusedSession;
    return session ? this.mapFocusedSessionToSelected(session) : void 0;
  }
  getSessions() {
    const showSubSessions = this.configurationService.getValue("debug").showSubSessionsInToolBar;
    const sessions = this.debugService.getModel().getSessions();
    return showSubSessions ? sessions : sessions.filter((s) => !s.parentSession);
  }
  mapFocusedSessionToSelected(focusedSession) {
    const showSubSessions = this.configurationService.getValue("debug").showSubSessionsInToolBar;
    while (focusedSession.parentSession && !showSubSessions) {
      focusedSession = focusedSession.parentSession;
    }
    return focusedSession;
  }
};
FocusSessionActionViewItem = __decorateClass([
  __decorateParam(2, IDebugService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IConfigurationService)
], FocusSessionActionViewItem);
export {
  FocusSessionActionViewItem,
  StartDebugActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdBY3Rpb25WaWV3SXRlbXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0T3B0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb24sIElEZWJ1Z0NvbmZpZ3VyYXRpb24sIElDb25maWcsIElMYXVuY2gsIFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBzZWxlY3RCb3JkZXIsIHNlbGVjdEJhY2tncm91bmQsIGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBRERfQ09ORklHVVJBVElPTl9JRCB9IGZyb20gJy4vZGVidWdDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0sIElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zLCBTZWxlY3RBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGRlYnVnU3RhcnQgfSBmcm9tICcuL2RlYnVnSWNvbnMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eUNvbW1hbmRJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHlDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGhhc05hdGl2ZUNvbnRleHRNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgR2VzdHVyZSwgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IEFjdGlvbldpZGdldERyb3Bkb3duLCBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcblxuZXhwb3J0IGNsYXNzIFN0YXJ0RGVidWdBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzdGFydCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNvbmZpZ3VyYXRpb25Db250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBkcm9wZG93bkxhYmVsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkcm9wZG93biE6IEFjdGlvbldpZGdldERyb3Bkb3duO1xuXHRwcml2YXRlIGRlYnVnT3B0aW9uczogeyBsYWJlbDogc3RyaW5nOyBoYW5kbGVyOiAoKCkgPT4gUHJvbWlzZTxib29sZWFuPikgfVtdID0gW107XG5cdHByaXZhdGUgdG9EaXNwb3NlOiBJRGlzcG9zYWJsZVtdO1xuXHRwcml2YXRlIHNlbGVjdGVkID0gMDtcblx0cHJpdmF0ZSBwcm92aWRlcnM6IHsgbGFiZWw6IHN0cmluZzsgdHlwZTogc3RyaW5nOyBwaWNrOiAoKSA9PiBQcm9taXNlPHsgbGF1bmNoOiBJTGF1bmNoOyBjb25maWc6IElDb25maWcgfSB8IHVuZGVmaW5lZD4gfVtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBjb250ZXh0OiB1bmtub3duLFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBfY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbnRleHQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UgPSBbXTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdsYXVuY2gnKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmRlYnVnU2VydmljZS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpLm9uRGlkU2VsZWN0Q29uZmlndXJhdGlvbigoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdzdGFydC1kZWJ1Zy1hY3Rpb24taXRlbScpO1xuXHRcdHRoaXMuc3RhcnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoZGVidWdTdGFydCkpKTtcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyh0aGlzLmFjdGlvbi5sYWJlbCwgdGhpcy5hY3Rpb24uaWQpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuc3RhcnQsIHRpdGxlKSk7XG5cdFx0dGhpcy5zdGFydC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5fc2V0QXJpYUxhYmVsKHRpdGxlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMuc3RhcnQpKTtcblx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIFtkb20uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zdGFydCwgZXZlbnQsICgpID0+IHtcblx0XHRcdFx0dGhpcy5zdGFydC5ibHVyKCk7XG5cdFx0XHRcdGlmICh0aGlzLmRlYnVnU2VydmljZS5zdGF0ZSAhPT0gU3RhdGUuSW5pdGlhbGl6aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5hY3Rpb25SdW5uZXIucnVuKHRoaXMuYWN0aW9uLCB0aGlzLmNvbnRleHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc3RhcnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfRE9XTiwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmICh0aGlzLmFjdGlvbi5lbmFibGVkICYmIGUuYnV0dG9uID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuc3RhcnQuY2xhc3NMaXN0LmFkZCgnYWN0aXZlJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnN0YXJ0LCBkb20uRXZlbnRUeXBlLk1PVVNFX1VQLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnN0YXJ0LmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zdGFydCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9PVVQsICgpID0+IHtcblx0XHRcdHRoaXMuc3RhcnQuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc3RhcnQsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0dGhpcy5zdGFydC50YWJJbmRleCA9IC0xO1xuXHRcdFx0XHR0aGlzLmRyb3Bkb3duTGFiZWw/LmZvY3VzKCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY29uZmlndXJhdGlvbkNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmNvbmZpZ3VyYXRpb24nKSk7XG5cblx0XHR0aGlzLmRyb3Bkb3duID0gbmV3IEFjdGlvbldpZGdldERyb3Bkb3duKHRoaXMuY29uZmlndXJhdGlvbkNvbnRhaW5lciwge1xuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnZGVidWdMYXVuY2hDb25maWd1cmF0aW9ucycsICdEZWJ1ZyBMYXVuY2ggQ29uZmlndXJhdGlvbnMnKSxcblx0XHRcdGxhYmVsUmVuZGVyZXI6IChlbDogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdFx0dGhpcy5kcm9wZG93bkxhYmVsID0gZWw7XG5cdFx0XHRcdGVsLmNsYXNzTGlzdC5hZGQoJ3N0YXJ0LWRlYnVnLWFjdGlvbi1pdGVtLWRyb3Bkb3duLWxhYmVsJyk7XG5cdFx0XHRcdGVsLnRhYkluZGV4ID0gLTE7XG5cdFx0XHRcdGVsLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdFx0ZWwuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcblx0XHRcdFx0ZWwuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHRcdHRoaXMucmVuZGVyRHJvcGRvd25MYWJlbCgpO1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0sXG5cdFx0XHRhY3Rpb25Qcm92aWRlcjogeyBnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLmdldERyb3Bkb3duQWN0aW9ucygpIH0sXG5cdFx0XHRsaXN0T3B0aW9uczoge1xuXHRcdFx0XHRzaG93RmlsdGVyOiB0cnVlLFxuXHRcdFx0XHRmaWx0ZXJQbGFjZWhvbGRlcjogbmxzLmxvY2FsaXplKCdkZWJ1Z0xhdW5jaENvbmZpZ3VyYXRpb25zLnNlYXJjaCcsIFwiU2VhcmNoIGNvbmZpZ3VyYXRpb25zXCIpLFxuXHRcdFx0XHRmb2N1c0ZpbHRlck9uT3BlbjogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSwgdGhpcy5hY3Rpb25XaWRnZXRTZXJ2aWNlLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLnRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kcm9wZG93bik7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmRyb3Bkb3duLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdHRoaXMuZHJvcGRvd25MYWJlbD8uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKHZpc2libGUpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb25maWd1cmF0aW9uQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykpIHtcblx0XHRcdFx0aWYgKHRoaXMuZHJvcGRvd25MYWJlbCkge1xuXHRcdFx0XHRcdHRoaXMuZHJvcGRvd25MYWJlbC50YWJJbmRleCA9IC0xO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc3RhcnQudGFiSW5kZXggPSAwO1xuXHRcdFx0XHR0aGlzLnN0YXJ0LmZvY3VzKCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKHNlbGVjdEJvcmRlcil9YDtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25Db250YWluZXIuc3R5bGUuYm9yZGVyTGVmdCA9IGAxcHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKHNlbGVjdEJvcmRlcil9YDtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBhc0Nzc1ZhcmlhYmxlKHNlbGVjdEJhY2tncm91bmQpO1xuXG5cdFx0Y29uc3QgY29uZmlnTWFuYWdlciA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldENvbmZpZ3VyYXRpb25NYW5hZ2VyKCk7XG5cdFx0Y29uc3QgdXBkYXRlRHluYW1pY0NvbmZpZ3MgPSAoKSA9PiBjb25maWdNYW5hZ2VyLmdldER5bmFtaWNQcm92aWRlcnMoKS50aGVuKHByb3ZpZGVycyA9PiB7XG5cdFx0XHRpZiAocHJvdmlkZXJzLmxlbmd0aCAhPT0gdGhpcy5wcm92aWRlcnMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMucHJvdmlkZXJzID0gcHJvdmlkZXJzO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goY29uZmlnTWFuYWdlci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25Qcm92aWRlcnModXBkYXRlRHluYW1pY0NvbmZpZ3MpKTtcblx0XHR1cGRhdGVEeW5hbWljQ29uZmlncygpO1xuXHRcdHRoaXMudXBkYXRlT3B0aW9ucygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0QWN0aW9uQ29udGV4dChjb250ZXh0OiBhbnkpOiB2b2lkIHtcblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoZnJvbVJpZ2h0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChmcm9tUmlnaHQpIHtcblx0XHRcdGlmICh0aGlzLmRyb3Bkb3duTGFiZWwpIHtcblx0XHRcdFx0dGhpcy5kcm9wZG93bkxhYmVsLnRhYkluZGV4ID0gMDtcblx0XHRcdFx0dGhpcy5kcm9wZG93bkxhYmVsLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RhcnQudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5zdGFydC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGJsdXIoKTogdm9pZCB7XG5cdFx0dGhpcy5zdGFydC50YWJJbmRleCA9IC0xO1xuXHRcdGlmICh0aGlzLmRyb3Bkb3duTGFiZWwpIHtcblx0XHRcdHRoaXMuZHJvcGRvd25MYWJlbC50YWJJbmRleCA9IC0xO1xuXHRcdFx0dGhpcy5kcm9wZG93bkxhYmVsLmJsdXIoKTtcblx0XHR9XG5cdFx0dGhpcy5jb250YWluZXIuYmx1cigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Rm9jdXNhYmxlKGZvY3VzYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChmb2N1c2FibGUpIHtcblx0XHRcdHRoaXMuc3RhcnQudGFiSW5kZXggPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0YXJ0LnRhYkluZGV4ID0gLTE7XG5cdFx0XHRpZiAodGhpcy5kcm9wZG93bkxhYmVsKSB7XG5cdFx0XHRcdHRoaXMuZHJvcGRvd25MYWJlbC50YWJJbmRleCA9IC0xO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy50b0Rpc3Bvc2UgPSBkaXNwb3NlKHRoaXMudG9EaXNwb3NlKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRyb3Bkb3duTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmRyb3Bkb3duTGFiZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudExhYmVsID0gdGhpcy5kZWJ1Z09wdGlvbnNbdGhpcy5zZWxlY3RlZF0/LmxhYmVsXG5cdFx0XHQ/PyBubHMubG9jYWxpemUoJ25vQ29uZmlndXJhdGlvbnMnLCBcIk5vIENvbmZpZ3VyYXRpb25zXCIpO1xuXHRcdGNvbnN0IGxhYmVsU3BhbiA9IGRvbS4kKCdzcGFuLnN0YXJ0LWRlYnVnLWFjdGlvbi1pdGVtLWxhYmVsJywgdW5kZWZpbmVkLCBjdXJyZW50TGFiZWwpO1xuXHRcdGNvbnN0IGNoZXZyb24gPSByZW5kZXJMYWJlbFdpdGhJY29ucygnJChjaGV2cm9uLWRvd24pJyk7XG5cdFx0ZG9tLnJlc2V0KHRoaXMuZHJvcGRvd25MYWJlbCwgbGFiZWxTcGFuLCAuLi5jaGV2cm9uKTtcblx0XHR0aGlzLmRyb3Bkb3duTGFiZWwudGl0bGUgPSBjdXJyZW50TGFiZWw7XG5cdFx0dGhpcy5kcm9wZG93bkxhYmVsLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIG5scy5sb2NhbGl6ZSgnZGVidWdMYXVuY2hDb25maWd1cmF0aW9uc0FyaWFMYWJlbCcsIFwiRGVidWcgTGF1bmNoIENvbmZpZ3VyYXRpb25zOiB7MH1cIiwgY3VycmVudExhYmVsKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldERyb3Bkb3duQWN0aW9ucygpOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuZGVidWdPcHRpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBvcHRpb24gPSB0aGlzLmRlYnVnT3B0aW9uc1tpXTtcblx0XHRcdGNvbnN0IGNhdGVnb3J5ID0gdGhpcy5vcHRpb25DYXRlZ29yaWVzW2ldO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0aWQ6IGBkZWJ1Zy5jb25maWcuJHtpfWAsXG5cdFx0XHRcdGxhYmVsOiBvcHRpb24ubGFiZWwsXG5cdFx0XHRcdHRvb2x0aXA6IG9wdGlvbi5sYWJlbCxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0Y2hlY2tlZDogaSA9PT0gdGhpcy5zZWxlY3RlZCxcblx0XHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdC8vIFNlbGVjdGlvbiBzdGF0ZSBhbmQgbGFiZWwgYXJlIHJlY29uY2lsZWQgYnkgdXBkYXRlT3B0aW9ucygpLFxuXHRcdFx0XHRcdC8vIHRyaWdnZXJlZCBieSBtYW5hZ2VyLm9uRGlkU2VsZWN0Q29uZmlndXJhdGlvbi5cblx0XHRcdFx0XHRhd2FpdCBvcHRpb24uaGFuZGxlcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIG9wdGlvbkNhdGVnb3JpZXM6ICh7IGxhYmVsOiBzdHJpbmc7IG9yZGVyOiBudW1iZXIgfSB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXG5cdHByaXZhdGUgdXBkYXRlT3B0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdGVkID0gMDtcblx0XHR0aGlzLmRlYnVnT3B0aW9ucyA9IFtdO1xuXHRcdHRoaXMub3B0aW9uQ2F0ZWdvcmllcyA9IFtdO1xuXHRcdGNvbnN0IG1hbmFnZXIgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpO1xuXHRcdGNvbnN0IGluV29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U7XG5cdFx0bGV0IGxhc3RHcm91cDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBncm91cE9yZGVyID0gMDtcblxuXHRcdGNvbnN0IHB1c2hPcHRpb24gPSAob3B0aW9uOiB7IGxhYmVsOiBzdHJpbmc7IGhhbmRsZXI6ICgoKSA9PiBQcm9taXNlPGJvb2xlYW4+KSB9LCBjYXRlZ29yeTogeyBsYWJlbDogc3RyaW5nOyBvcmRlcjogbnVtYmVyIH0gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdHRoaXMuZGVidWdPcHRpb25zLnB1c2gob3B0aW9uKTtcblx0XHRcdHRoaXMub3B0aW9uQ2F0ZWdvcmllcy5wdXNoKGNhdGVnb3J5KTtcblx0XHR9O1xuXG5cdFx0bWFuYWdlci5nZXRBbGxDb25maWd1cmF0aW9ucygpLmZvckVhY2goKHsgbGF1bmNoLCBuYW1lLCBwcmVzZW50YXRpb24gfSkgPT4ge1xuXHRcdFx0aWYgKGxhc3RHcm91cCAhPT0gcHJlc2VudGF0aW9uPy5ncm91cCkge1xuXHRcdFx0XHRsYXN0R3JvdXAgPSBwcmVzZW50YXRpb24/Lmdyb3VwO1xuXHRcdFx0XHRpZiAodGhpcy5kZWJ1Z09wdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Z3JvdXBPcmRlcisrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobmFtZSA9PT0gbWFuYWdlci5zZWxlY3RlZENvbmZpZ3VyYXRpb24ubmFtZSAmJiBsYXVuY2ggPT09IG1hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uLmxhdW5jaCkge1xuXHRcdFx0XHR0aGlzLnNlbGVjdGVkID0gdGhpcy5kZWJ1Z09wdGlvbnMubGVuZ3RoO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsYWJlbCA9IGluV29ya3NwYWNlID8gYCR7bmFtZX0gKCR7bGF1bmNoLm5hbWV9KWAgOiBuYW1lO1xuXHRcdFx0cHVzaE9wdGlvbih7XG5cdFx0XHRcdGxhYmVsLCBoYW5kbGVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgbWFuYWdlci5zZWxlY3RDb25maWd1cmF0aW9uKGxhdW5jaCwgbmFtZSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHsgbGFiZWw6IGBjb25maWd1cmF0aW9ucy0ke2dyb3VwT3JkZXJ9YCwgb3JkZXI6IGdyb3VwT3JkZXIgfSk7XG5cdFx0fSk7XG5cblx0XHQvLyBPbmx5IHRha2UgMyBlbGVtZW50cyBmcm9tIHRoZSByZWNlbnQgZHluYW1pYyBjb25maWd1cmF0aW9ucyB0byBub3QgY2x1dHRlciB0aGUgZHJvcGRvd25cblx0XHRtYW5hZ2VyLmdldFJlY2VudER5bmFtaWNDb25maWd1cmF0aW9ucygpLnNsaWNlKDAsIDMpLmZvckVhY2goKHsgbmFtZSwgdHlwZSB9KSA9PiB7XG5cdFx0XHRpZiAodHlwZSA9PT0gbWFuYWdlci5zZWxlY3RlZENvbmZpZ3VyYXRpb24udHlwZSAmJiBtYW5hZ2VyLnNlbGVjdGVkQ29uZmlndXJhdGlvbi5uYW1lID09PSBuYW1lKSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0ZWQgPSB0aGlzLmRlYnVnT3B0aW9ucy5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHRwdXNoT3B0aW9uKHtcblx0XHRcdFx0bGFiZWw6IG5hbWUsXG5cdFx0XHRcdGhhbmRsZXI6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCBtYW5hZ2VyLnNlbGVjdENvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCBuYW1lLCB1bmRlZmluZWQsIHsgdHlwZSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgeyBsYWJlbDogJ3JlY2VudC1keW5hbWljJywgb3JkZXI6IDEwMCB9KTtcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLmRlYnVnT3B0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHB1c2hPcHRpb24oeyBsYWJlbDogbmxzLmxvY2FsaXplKCdub0NvbmZpZ3VyYXRpb25zJywgXCJObyBDb25maWd1cmF0aW9uc1wiKSwgaGFuZGxlcjogYXN5bmMgKCkgPT4gZmFsc2UgfSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHR0aGlzLnByb3ZpZGVycy5mb3JFYWNoKHAgPT4ge1xuXHRcdFx0cHVzaE9wdGlvbih7XG5cdFx0XHRcdGxhYmVsOiBgJHtwLmxhYmVsfS4uLmAsXG5cdFx0XHRcdGhhbmRsZXI6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCBwLnBpY2soKTtcblx0XHRcdFx0XHRpZiAocGlja2VkKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBtYW5hZ2VyLnNlbGVjdENvbmZpZ3VyYXRpb24ocGlja2VkLmxhdW5jaCwgcGlja2VkLmNvbmZpZy5uYW1lLCBwaWNrZWQuY29uZmlnLCB7IHR5cGU6IHAudHlwZSB9KTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHsgbGFiZWw6ICdhY3Rpb25zJywgb3JkZXI6IDIwMCB9KTtcblx0XHR9KTtcblxuXHRcdG1hbmFnZXIuZ2V0TGF1bmNoZXMoKS5maWx0ZXIobCA9PiAhbC5oaWRkZW4pLmZvckVhY2gobCA9PiB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGluV29ya3NwYWNlID8gbmxzLmxvY2FsaXplKFwiYWRkQ29uZmlnVG9cIiwgXCJBZGQgQ29uZmlnICh7MH0pLi4uXCIsIGwubmFtZSkgOiBubHMubG9jYWxpemUoJ2FkZENvbmZpZ3VyYXRpb24nLCBcIkFkZCBDb25maWd1cmF0aW9uLi4uXCIpO1xuXHRcdFx0cHVzaE9wdGlvbih7XG5cdFx0XHRcdGxhYmVsLCBoYW5kbGVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBRERfQ09ORklHVVJBVElPTl9JRCwgbC51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCB7IGxhYmVsOiAnYWN0aW9ucycsIG9yZGVyOiAyMDAgfSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnJlbmRlckRyb3Bkb3duTGFiZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEFyaWFMYWJlbCh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0bGV0IGFyaWFMYWJlbCA9IHRpdGxlO1xuXHRcdGxldCBrZXliaW5kaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdmVyYm9zZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5EZWJ1Zyk7XG5cdFx0aWYgKHZlcmJvc2UpIHtcblx0XHRcdGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5PcGVuQWNjZXNzaWJpbGl0eUhlbHAsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpPy5nZXRMYWJlbCgpID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGtleWJpbmRpbmcpIHtcblx0XHRcdGFyaWFMYWJlbCA9IG5scy5sb2NhbGl6ZSgnY29tbWVudExhYmVsV2l0aEtleWJpbmRpbmcnLCBcInswfSwgdXNlICh7MX0pIGZvciBhY2Nlc3NpYmlsaXR5IGhlbHBcIiwgYXJpYUxhYmVsLCBrZXliaW5kaW5nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJpYUxhYmVsID0gbmxzLmxvY2FsaXplKCdjb21tZW50TGFiZWxXaXRoS2V5YmluZGluZ05vS2V5YmluZGluZycsIFwiezB9LCBydW4gdGhlIGNvbW1hbmQgT3BlbiBBY2Nlc3NpYmlsaXR5IEhlbHAgd2hpY2ggaXMgY3VycmVudGx5IG5vdCB0cmlnZ2VyYWJsZSB2aWEga2V5YmluZGluZy5cIiwgYXJpYUxhYmVsKTtcblx0XHR9XG5cdFx0dGhpcy5zdGFydC5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZvY3VzU2Vzc2lvbkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgU2VsZWN0QWN0aW9uVmlld0l0ZW08SURlYnVnU2Vzc2lvbj4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0c2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCxcblx0XHRASURlYnVnU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIFtdLCAtMSwgY29udGV4dFZpZXdTZXJ2aWNlLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLCB7IGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCdkZWJ1Z1Nlc3Npb24nLCAnRGVidWcgU2Vzc2lvbicpLCB1c2VDdXN0b21EcmF3bjogIWhhc05hdGl2ZUNvbnRleHRNZW51KGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRm9jdXNTZXNzaW9uKCgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmdldFNlbGVjdGVkU2Vzc2lvbigpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLmdldFNlc3Npb25zKCkuaW5kZXhPZihzZXNzaW9uKTtcblx0XHRcdFx0dGhpcy5zZWxlY3QoaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlc3Npb25MaXN0ZW5lcnNTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzID0gKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25MaXN0ZW5lcnMgPSBzZXNzaW9uTGlzdGVuZXJzU3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0XHRzZXNzaW9uTGlzdGVuZXJzLmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlTmFtZSgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0XHRzZXNzaW9uTGlzdGVuZXJzLmFkZChzZXNzaW9uLm9uRGlkRW5kQWRhcHRlcigoKSA9PiBzZXNzaW9uTGlzdGVuZXJzU3RvcmUuZGVsZXRlKHNlc3Npb25MaXN0ZW5lcnMpKSk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5vbkRpZE5ld1Nlc3Npb24oc2Vzc2lvbiA9PiB7XG5cdFx0XHRyZWdpc3RlclNlc3Npb25MaXN0ZW5lcnMoc2Vzc2lvbik7XG5cdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdH0pKTtcblx0XHQvLyBBcHBseSB0aGUgc2FtZSBwYXR0ZXJuIHRvIGV4aXN0aW5nIHNlc3Npb25zIC0gdHJhY2sgbGlzdGVuZXJzIGZvciBjbGVhbnVwXG5cdFx0dGhpcy5nZXRTZXNzaW9ucygpLmZvckVhY2gocmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlYnVnU2VydmljZS5vbkRpZEVuZFNlc3Npb24oKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRTZXNzaW9uID0gc2Vzc2lvbiA/IHRoaXMubWFwRm9jdXNlZFNlc3Npb25Ub1NlbGVjdGVkKHNlc3Npb24pIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMudXBkYXRlKHNlbGVjdGVkU2Vzc2lvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0QWN0aW9uQ29udGV4dChfOiBzdHJpbmcsIGluZGV4OiBudW1iZXIpOiBJRGVidWdTZXNzaW9uIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTZXNzaW9ucygpW2luZGV4XTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKHNlc3Npb24/OiBJRGVidWdTZXNzaW9uKSB7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRzZXNzaW9uID0gdGhpcy5nZXRTZWxlY3RlZFNlc3Npb24oKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgbmFtZXMgPSBzZXNzaW9ucy5tYXAocyA9PiB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHMuZ2V0TGFiZWwoKTtcblx0XHRcdGlmIChzLnBhcmVudFNlc3Npb24pIHtcblx0XHRcdFx0Ly8gSW5kZW50IGNoaWxkIHNlc3Npb25zIHNvIHRoZXkgbG9vayBsaWtlIGNoaWxkcmVuXG5cdFx0XHRcdHJldHVybiBgXFx1MDBBMFxcdTAwQTAke2xhYmVsfWA7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsYWJlbDtcblx0XHR9KTtcblx0XHR0aGlzLnNldE9wdGlvbnMobmFtZXMubWFwKChkYXRhKTogSVNlbGVjdE9wdGlvbkl0ZW0gPT4gKHsgdGV4dDogZGF0YSB9KSksIHNlc3Npb24gPyBzZXNzaW9ucy5pbmRleE9mKHNlc3Npb24pIDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VsZWN0ZWRTZXNzaW9uKCk6IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU2Vzc2lvbjtcblx0XHRyZXR1cm4gc2Vzc2lvbiA/IHRoaXMubWFwRm9jdXNlZFNlc3Npb25Ub1NlbGVjdGVkKHNlc3Npb24pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFNlc3Npb25zKCk6IFJlYWRvbmx5QXJyYXk8SURlYnVnU2Vzc2lvbj4ge1xuXHRcdGNvbnN0IHNob3dTdWJTZXNzaW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuc2hvd1N1YlNlc3Npb25zSW5Ub29sQmFyO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucygpO1xuXG5cdFx0cmV0dXJuIHNob3dTdWJTZXNzaW9ucyA/IHNlc3Npb25zIDogc2Vzc2lvbnMuZmlsdGVyKHMgPT4gIXMucGFyZW50U2Vzc2lvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgbWFwRm9jdXNlZFNlc3Npb25Ub1NlbGVjdGVkKGZvY3VzZWRTZXNzaW9uOiBJRGVidWdTZXNzaW9uKTogSURlYnVnU2Vzc2lvbiB7XG5cdFx0Y29uc3Qgc2hvd1N1YlNlc3Npb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5zaG93U3ViU2Vzc2lvbnNJblRvb2xCYXI7XG5cdFx0d2hpbGUgKGZvY3VzZWRTZXNzaW9uLnBhcmVudFNlc3Npb24gJiYgIXNob3dTdWJTZXNzaW9ucykge1xuXHRcdFx0Zm9jdXNlZFNlc3Npb24gPSBmb2N1c2VkU2Vzc2lvbi5wYXJlbnRTZXNzaW9uO1xuXHRcdH1cblx0XHRyZXR1cm4gZm9jdXNlZFNlc3Npb247XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsZUFBZTtBQUN4QixZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFxRSxhQUFhO0FBQzNGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsY0FBYyxrQkFBa0IscUJBQXFCO0FBQzlELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLGlCQUE4QixlQUFlO0FBQ3RELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQWdELDRCQUE0QjtBQUNyRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFNBQVMsYUFBYSxzQkFBc0I7QUFDckQsU0FBUyw0QkFBeUQ7QUFDbEUsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFFOUIsSUFBTSwyQkFBTixjQUF1QyxtQkFBbUI7QUFBQSxFQVloRSxZQUNTLFNBQ1IsUUFDQSxTQUNnQyxjQUNRLHNCQUNOLGdCQUNTLGdCQUN0QixxQkFDZ0IsbUJBQ0wsY0FDSyxtQkFDRSxxQkFDSCxrQkFDbkM7QUFDRCxVQUFNLFNBQVMsUUFBUSxPQUFPO0FBZHRCO0FBR3dCO0FBQ1E7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
