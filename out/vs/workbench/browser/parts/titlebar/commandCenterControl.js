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
import { isActiveDocument, reset } from "../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { SubmenuAction } from "../../../../base/common/actions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar, WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId, MenuRegistry, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
const AGENT_STATUS_ENABLED_SETTING = "chat.agentsControl.enabled";
let CommandCenterControl = class {
  constructor(windowTitle, hoverDelegate, instantiationService, quickInputService) {
    this._disposables = new DisposableStore();
    this._onDidChangeVisibility = this._disposables.add(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this.element = document.createElement("div");
    this.element.classList.add("command-center");
    const titleToolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, MenuId.CommandCenter, {
      contextMenu: MenuId.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      toolbarOptions: {
        primaryGroup: () => true
      },
      telemetrySource: "commandCenter",
      actionViewItemProvider: (action, options) => {
        if (action instanceof SubmenuItemAction && action.item.submenu === MenuId.CommandCenterCenter) {
          return instantiationService.createInstance(CommandCenterCenterViewItem, action, windowTitle, { ...options, hoverDelegate });
        } else {
          return createActionViewItem(instantiationService, action, { ...options, hoverDelegate });
        }
      }
    });
    let quickInputVisible = false;
    this._disposables.add(Event.filter(quickInputService.onShow, () => isActiveDocument(this.element), this._disposables)(() => {
      quickInputVisible = true;
      this._setVisibility(quickInputService.alignment.get() !== "top");
    }));
    this._disposables.add(quickInputService.onHide(() => {
      quickInputVisible = false;
      this._setVisibility(true);
    }));
    this._disposables.add(autorun((reader) => {
      const alignment = quickInputService.alignment.read(reader);
      if (quickInputVisible) {
        this._setVisibility(alignment !== "top");
      }
    }));
    this._disposables.add(titleToolbar);
  }
  _setVisibility(show) {
    this.element.classList.toggle("hide", !show);
    this._onDidChangeVisibility.fire();
  }
  dispose() {
    this._disposables.dispose();
  }
};
CommandCenterControl = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IQuickInputService)
], CommandCenterControl);
let CommandCenterCenterViewItem = class extends BaseActionViewItem {
  constructor(_submenu, _windowTitle, options, _hoverService, _keybindingService, _instaService, _editorGroupService, _configurationService) {
    super(void 0, _submenu.actions.find((action) => action.id === "workbench.action.quickOpenWithModes") ?? _submenu.actions[0], options);
    this._submenu = _submenu;
    this._windowTitle = _windowTitle;
    this._hoverService = _hoverService;
    this._keybindingService = _keybindingService;
    this._instaService = _instaService;
    this._editorGroupService = _editorGroupService;
    this._configurationService = _configurationService;
    this._hoverDelegate = options.hoverDelegate ?? getDefaultHoverDelegate("mouse");
  }
  render(container) {
    super.render(container);
    container.classList.add("command-center-center");
    container.classList.toggle("multiple", this._submenu.actions.length > 1);
    const hover = this._store.add(this._hoverService.setupManagedHover(this._hoverDelegate, container, this.getTooltip()));
    this._store.add(this._windowTitle.onDidChange(() => {
      hover.update(this.getTooltip());
    }));
    const groups = [];
    for (const action of this._submenu.actions) {
      if (action instanceof SubmenuAction) {
        groups.push(action.actions);
      } else {
        groups.push([action]);
      }
    }
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const toolbar = this._instaService.createInstance(WorkbenchToolBar, container, {
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        telemetrySource: "commandCenterCenter",
        actionViewItemProvider: (action, options) => {
          options = {
            ...options,
            hoverDelegate: this._hoverDelegate
          };
          if (action.id !== CommandCenterCenterViewItem._quickOpenCommandId) {
            return createActionViewItem(this._instaService, action, options);
          }
          const that = this;
          return this._instaService.createInstance(class CommandCenterQuickPickItem extends BaseActionViewItem {
            constructor() {
              super(void 0, action, options);
            }
            render(container2) {
              super.render(container2);
              container2.classList.toggle("command-center-quick-pick");
              container2.role = "button";
              container2.setAttribute("aria-description", this.getTooltip());
              const aiFeaturesDisabled = that._configurationService.getValue(ChatAIDisabledSettingId) === true;
              const aiCustomizationsDisabled = that._configurationService.getValue("disableAICustomizations") === true || that._configurationService.getValue("workbench.disableAICustomizations") === true;
              const forcedHidden = aiFeaturesDisabled && aiCustomizationsDisabled;
              const agentControlValue = that._configurationService.getValue(AGENT_STATUS_ENABLED_SETTING);
              const isCompactMode = !forcedHidden && (agentControlValue === true || agentControlValue === void 0 || agentControlValue === "compact");
              container2.classList.toggle("compact-mode", isCompactMode);
              const action2 = this.action;
              const searchIcon = document.createElement("span");
              searchIcon.ariaHidden = "true";
              searchIcon.className = action2.class ?? "";
              searchIcon.classList.add("search-icon");
              const label = this._getLabel();
              const labelElement = document.createElement("span");
              labelElement.classList.add("search-label");
              labelElement.textContent = label;
              if (isCompactMode) {
                reset(container2, labelElement);
              } else {
                reset(container2, searchIcon, labelElement);
              }
              const hover2 = this._store.add(that._hoverService.setupManagedHover(that._hoverDelegate, container2, this.getTooltip()));
              this._store.add(that._windowTitle.onDidChange(() => {
                hover2.update(this.getTooltip());
                labelElement.textContent = this._getLabel();
              }));
              this._store.add(that._editorGroupService.onDidChangeEditorPartOptions(({ newPartOptions, oldPartOptions }) => {
                if (newPartOptions.showTabs !== oldPartOptions.showTabs) {
                  hover2.update(this.getTooltip());
                  labelElement.textContent = this._getLabel();
                }
              }));
            }
            getTooltip() {
              return that.getTooltip();
            }
            _getLabel() {
              const { prefix, suffix } = that._windowTitle.getTitleDecorations();
              let label = that._windowTitle.workspaceName;
              if (that._windowTitle.isCustomTitleFormat()) {
                label = that._windowTitle.getWindowTitle();
              } else if (that._editorGroupService.partOptions.showTabs === "none") {
                label = that._windowTitle.fileName ?? label;
              }
              if (!label) {
                label = localize("label.dfl", "Search");
              }
              if (prefix) {
                label = localize("label1", "{0} {1}", prefix, label);
              }
              if (suffix) {
                label = localize("label2", "{0} {1}", label, suffix);
              }
              return label.replaceAll(/\r\n|\r|\n/g, "\u23CE");
            }
          });
        }
      });
      toolbar.setActions(group);
      this._store.add(toolbar);
      if (i < groups.length - 1) {
        const icon = renderIcon(Codicon.circleSmallFilled);
        icon.style.padding = "0 8px";
        icon.style.height = "100%";
        icon.style.opacity = "0.5";
        container.appendChild(icon);
      }
    }
  }
  getTooltip() {
    const kb = this._keybindingService.lookupKeybinding(this.action.id)?.getLabel();
    const title = kb ? localize("title", "Search {0} ({1}) \u2014 {2}", this._windowTitle.workspaceName, kb, this._windowTitle.value) : localize("title2", "Search {0} \u2014 {1}", this._windowTitle.workspaceName, this._windowTitle.value);
    return title;
  }
};
CommandCenterCenterViewItem._quickOpenCommandId = "workbench.action.quickOpenWithModes";
CommandCenterCenterViewItem = __decorateClass([
  __decorateParam(3, IHoverService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IEditorGroupsService),
  __decorateParam(7, IConfigurationService)
], CommandCenterCenterViewItem);
MenuRegistry.appendMenuItem(MenuId.CommandCenter, {
  submenu: MenuId.CommandCenterCenter,
  title: localize("title3", "Command Center"),
  icon: Codicon.shield,
  order: 101
});
export {
  CommandCenterControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3RpdGxlYmFyL2NvbW1hbmRDZW50ZXJDb250cm9sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNBY3RpdmVEb2N1bWVudCwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIsIFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFdpbmRvd1RpdGxlIH0gZnJvbSAnLi93aW5kb3dUaXRsZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBSURpc2FibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vY2hhdFNldHRpbmdzLmpzJztcblxuY29uc3QgQUdFTlRfU1RBVFVTX0VOQUJMRURfU0VUVElORyA9ICdjaGF0LmFnZW50c0NvbnRyb2wuZW5hYmxlZCc7XG5cbmV4cG9ydCBjbGFzcyBDb21tYW5kQ2VudGVyQ29udHJvbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d2luZG93VGl0bGU6IFdpbmRvd1RpdGxlLFxuXHRcdGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb21tYW5kLWNlbnRlcicpO1xuXG5cdFx0Y29uc3QgdGl0bGVUb29sYmFyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRoaXMuZWxlbWVudCwgTWVudUlkLkNvbW1hbmRDZW50ZXIsIHtcblx0XHRcdGNvbnRleHRNZW51OiBNZW51SWQuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NvbW1hbmRDZW50ZXInLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUl0ZW1BY3Rpb24gJiYgYWN0aW9uLml0ZW0uc3VibWVudSA9PT0gTWVudUlkLkNvbW1hbmRDZW50ZXJDZW50ZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZENlbnRlckNlbnRlclZpZXdJdGVtLCBhY3Rpb24sIHdpbmRvd1RpdGxlLCB7IC4uLm9wdGlvbnMsIGhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywgaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0bGV0IHF1aWNrSW5wdXRWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKEV2ZW50LmZpbHRlcihxdWlja0lucHV0U2VydmljZS5vblNob3csICgpID0+IGlzQWN0aXZlRG9jdW1lbnQodGhpcy5lbGVtZW50KSwgdGhpcy5fZGlzcG9zYWJsZXMpKCgpID0+IHtcblx0XHRcdHF1aWNrSW5wdXRWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3NldFZpc2liaWxpdHkocXVpY2tJbnB1dFNlcnZpY2UuYWxpZ25tZW50LmdldCgpICE9PSAndG9wJyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0U2VydmljZS5vbkhpZGUoKCkgPT4ge1xuXHRcdFx0cXVpY2tJbnB1dFZpc2libGUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3NldFZpc2liaWxpdHkodHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhbGlnbm1lbnQgPSBxdWlja0lucHV0U2VydmljZS5hbGlnbm1lbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHF1aWNrSW5wdXRWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3NldFZpc2liaWxpdHkoYWxpZ25tZW50ICE9PSAndG9wJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aXRsZVRvb2xiYXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VmlzaWJpbGl0eShzaG93OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCAhc2hvdyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cblxuY2xhc3MgQ29tbWFuZENlbnRlckNlbnRlclZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfcXVpY2tPcGVuQ29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuV2l0aE1vZGVzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdWJtZW51OiBTdWJtZW51SXRlbUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93aW5kb3dUaXRsZTogV2luZG93VGl0bGUsXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgX2luc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIF9lZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBfc3VibWVudS5hY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5pZCA9PT0gJ3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuV2l0aE1vZGVzJykgPz8gX3N1Ym1lbnUuYWN0aW9uc1swXSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5faG92ZXJEZWxlZ2F0ZSA9IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSA/PyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbW1hbmQtY2VudGVyLWNlbnRlcicpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdtdWx0aXBsZScsICh0aGlzLl9zdWJtZW51LmFjdGlvbnMubGVuZ3RoID4gMSkpO1xuXG5cdFx0Y29uc3QgaG92ZXIgPSB0aGlzLl9zdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKHRoaXMuX2hvdmVyRGVsZWdhdGUsIGNvbnRhaW5lciwgdGhpcy5nZXRUb29sdGlwKCkpKTtcblxuXHRcdC8vIHVwZGF0ZSBsYWJlbCAmIHRvb2x0aXAgd2hlbiB3aW5kb3cgdGl0bGUgY2hhbmdlc1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl93aW5kb3dUaXRsZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRob3Zlci51cGRhdGUodGhpcy5nZXRUb29sdGlwKCkpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGdyb3VwczogKHJlYWRvbmx5IElBY3Rpb25bXSlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIHRoaXMuX3N1Ym1lbnUuYWN0aW9ucykge1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVBY3Rpb24pIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2goYWN0aW9uLmFjdGlvbnMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2goW2FjdGlvbl0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBncm91cHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gZ3JvdXBzW2ldO1xuXG5cdFx0XHQvLyBuZXN0ZWQgdG9vbGJhclxuXHRcdFx0Y29uc3QgdG9vbGJhciA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hUb29sQmFyLCBjb250YWluZXIsIHtcblx0XHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdjb21tYW5kQ2VudGVyQ2VudGVyJyxcblx0XHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdG9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5faG92ZXJEZWxlZ2F0ZSxcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5pZCAhPT0gQ29tbWFuZENlbnRlckNlbnRlclZpZXdJdGVtLl9xdWlja09wZW5Db21tYW5kSWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjcmVhdGVBY3Rpb25WaWV3SXRlbSh0aGlzLl9pbnN0YVNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGNsYXNzIENvbW1hbmRDZW50ZXJRdWlja1BpY2tJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRcdFx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0XHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdFx0XHRcdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb21tYW5kLWNlbnRlci1xdWljay1waWNrJyk7XG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci5yb2xlID0gJ2J1dHRvbic7XG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGVzY3JpcHRpb24nLCB0aGlzLmdldFRvb2x0aXAoKSk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gV2hlbiBhZ2VudCBjb250cm9sIG1vZGUgaXMgJ2NvbXBhY3QnLCBoaWRlIHNlYXJjaCBpY29uIGFuZCBsZWZ0LWFsaWduIHRoZSBsYWJlbFxuXHRcdFx0XHRcdFx0XHQvLyBCYWNrd2FyZCBjb21wYXQ6IHRoZSBvbGQgYm9vbGVhbiBzZXR0aW5nICh0cnVlKSBhbmQgdGhlIG5ldyBkZWZhdWx0ICh1bmRlZmluZWQpIGJvdGggbWFwIHRvIGNvbXBhY3Rcblx0XHRcdFx0XHRcdFx0Y29uc3QgYWlGZWF0dXJlc0Rpc2FibGVkID0gdGhhdC5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpID09PSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhaUN1c3RvbWl6YXRpb25zRGlzYWJsZWQgPSB0aGF0Ll9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZGlzYWJsZUFJQ3VzdG9taXphdGlvbnMnKSA9PT0gdHJ1ZVxuXHRcdFx0XHRcdFx0XHRcdHx8IHRoYXQuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCd3b3JrYmVuY2guZGlzYWJsZUFJQ3VzdG9taXphdGlvbnMnKSA9PT0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZm9yY2VkSGlkZGVuID0gYWlGZWF0dXJlc0Rpc2FibGVkICYmIGFpQ3VzdG9taXphdGlvbnNEaXNhYmxlZDtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYWdlbnRDb250cm9sVmFsdWUgPSB0aGF0Ll9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBR0VOVF9TVEFUVVNfRU5BQkxFRF9TRVRUSU5HKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaXNDb21wYWN0TW9kZSA9ICFmb3JjZWRIaWRkZW4gJiYgKGFnZW50Q29udHJvbFZhbHVlID09PSB0cnVlIHx8IGFnZW50Q29udHJvbFZhbHVlID09PSB1bmRlZmluZWQgfHwgYWdlbnRDb250cm9sVmFsdWUgPT09ICdjb21wYWN0Jyk7XG5cdFx0XHRcdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb21wYWN0LW1vZGUnLCBpc0NvbXBhY3RNb2RlKTtcblxuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbjtcblxuXHRcdFx0XHRcdFx0XHQvLyBpY29uIChzZWFyY2gpIC0gaGlkZGVuIGluIGNvbXBhY3QgbW9kZVxuXHRcdFx0XHRcdFx0XHRjb25zdCBzZWFyY2hJY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0XHRcdFx0XHRzZWFyY2hJY29uLmFyaWFIaWRkZW4gPSAndHJ1ZSc7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaEljb24uY2xhc3NOYW1lID0gYWN0aW9uLmNsYXNzID8/ICcnO1xuXHRcdFx0XHRcdFx0XHRzZWFyY2hJY29uLmNsYXNzTGlzdC5hZGQoJ3NlYXJjaC1pY29uJyk7XG5cblx0XHRcdFx0XHRcdFx0Ly8gbGFiZWw6IGp1c3Qgd29ya3NwYWNlIG5hbWUgYW5kIG9wdGlvbmFsIGRlY29yYXRpb25zXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGFiZWxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0XHRcdFx0XHRsYWJlbEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2VhcmNoLWxhYmVsJyk7XG5cdFx0XHRcdFx0XHRcdGxhYmVsRWxlbWVudC50ZXh0Q29udGVudCA9IGxhYmVsO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNDb21wYWN0TW9kZSkge1xuXHRcdFx0XHRcdFx0XHRcdHJlc2V0KGNvbnRhaW5lciwgbGFiZWxFbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZXNldChjb250YWluZXIsIHNlYXJjaEljb24sIGxhYmVsRWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRjb25zdCBob3ZlciA9IHRoaXMuX3N0b3JlLmFkZCh0aGF0Ll9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIodGhhdC5faG92ZXJEZWxlZ2F0ZSwgY29udGFpbmVyLCB0aGlzLmdldFRvb2x0aXAoKSkpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIHVwZGF0ZSBsYWJlbCAmIHRvb2x0aXAgd2hlbiB3aW5kb3cgdGl0bGUgY2hhbmdlc1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhhdC5fd2luZG93VGl0bGUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGhvdmVyLnVwZGF0ZSh0aGlzLmdldFRvb2x0aXAoKSk7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5fZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFx0XHRcdC8vIHVwZGF0ZSBsYWJlbCAmIHRvb2x0aXAgd2hlbiB0YWJzIHZpc2liaWxpdHkgY2hhbmdlc1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhhdC5fZWRpdG9yR3JvdXBTZXJ2aWNlLm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoKHsgbmV3UGFydE9wdGlvbnMsIG9sZFBhcnRPcHRpb25zIH0pID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAobmV3UGFydE9wdGlvbnMuc2hvd1RhYnMgIT09IG9sZFBhcnRPcHRpb25zLnNob3dUYWJzKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRob3Zlci51cGRhdGUodGhpcy5nZXRUb29sdGlwKCkpO1xuXHRcdFx0XHRcdFx0XHRcdFx0bGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5fZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGF0LmdldFRvb2x0aXAoKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cHJpdmF0ZSBfZ2V0TGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgeyBwcmVmaXgsIHN1ZmZpeCB9ID0gdGhhdC5fd2luZG93VGl0bGUuZ2V0VGl0bGVEZWNvcmF0aW9ucygpO1xuXHRcdFx0XHRcdFx0XHRsZXQgbGFiZWwgPSB0aGF0Ll93aW5kb3dUaXRsZS53b3Jrc3BhY2VOYW1lO1xuXHRcdFx0XHRcdFx0XHRpZiAodGhhdC5fd2luZG93VGl0bGUuaXNDdXN0b21UaXRsZUZvcm1hdCgpKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWwgPSB0aGF0Ll93aW5kb3dUaXRsZS5nZXRXaW5kb3dUaXRsZSgpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoYXQuX2VkaXRvckdyb3VwU2VydmljZS5wYXJ0T3B0aW9ucy5zaG93VGFicyA9PT0gJ25vbmUnKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWwgPSB0aGF0Ll93aW5kb3dUaXRsZS5maWxlTmFtZSA/PyBsYWJlbDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoIWxhYmVsKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnbGFiZWwuZGZsJywgXCJTZWFyY2hcIik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKHByZWZpeCkge1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2xhYmVsMScsIFwiezB9IHsxfVwiLCBwcmVmaXgsIGxhYmVsKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoc3VmZml4KSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnbGFiZWwyJywgXCJ7MH0gezF9XCIsIGxhYmVsLCBzdWZmaXgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxhYmVsLnJlcGxhY2VBbGwoL1xcclxcbnxcXHJ8XFxuL2csICdcXHUyM0NFJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dG9vbGJhci5zZXRBY3Rpb25zKGdyb3VwKTtcblx0XHRcdHRoaXMuX3N0b3JlLmFkZCh0b29sYmFyKTtcblxuXG5cdFx0XHQvLyBzcGFjZXJcblx0XHRcdGlmIChpIDwgZ3JvdXBzLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0Y29uc3QgaWNvbiA9IHJlbmRlckljb24oQ29kaWNvbi5jaXJjbGVTbWFsbEZpbGxlZCk7XG5cdFx0XHRcdGljb24uc3R5bGUucGFkZGluZyA9ICcwIDhweCc7XG5cdFx0XHRcdGljb24uc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdFx0XHRpY29uLnN0eWxlLm9wYWNpdHkgPSAnMC41Jztcblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGljb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRUb29sdGlwKCkge1xuXG5cdFx0Ly8gdG9vbHRpcDogZnVsbCB3aW5kb3dUaXRsZVxuXHRcdGNvbnN0IGtiID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyh0aGlzLmFjdGlvbi5pZCk/LmdldExhYmVsKCk7XG5cdFx0Y29uc3QgdGl0bGUgPSBrYlxuXHRcdFx0PyBsb2NhbGl6ZSgndGl0bGUnLCBcIlNlYXJjaCB7MH0gKHsxfSkgXFx1MjAxNCB7Mn1cIiwgdGhpcy5fd2luZG93VGl0bGUud29ya3NwYWNlTmFtZSwga2IsIHRoaXMuX3dpbmRvd1RpdGxlLnZhbHVlKVxuXHRcdFx0OiBsb2NhbGl6ZSgndGl0bGUyJywgXCJTZWFyY2ggezB9IFxcdTIwMTQgezF9XCIsIHRoaXMuX3dpbmRvd1RpdGxlLndvcmtzcGFjZU5hbWUsIHRoaXMuX3dpbmRvd1RpdGxlLnZhbHVlKTtcblxuXHRcdHJldHVybiB0aXRsZTtcblx0fVxufVxuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRDZW50ZXIsIHtcblx0c3VibWVudTogTWVudUlkLkNvbW1hbmRDZW50ZXJDZW50ZXIsXG5cdHRpdGxlOiBsb2NhbGl6ZSgndGl0bGUzJywgXCJDb21tYW5kIENlbnRlclwiKSxcblx0aWNvbjogQ29kaWNvbi5zaGllbGQsXG5cdG9yZGVyOiAxMDEsXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0IsYUFBYTtBQUN4QyxTQUFTLDBCQUFzRDtBQUMvRCxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFr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
