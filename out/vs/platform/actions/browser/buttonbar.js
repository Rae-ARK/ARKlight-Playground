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
import { ButtonBar } from "../../../base/browser/ui/button/button.js";
import { createInstantHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ActionRunner, SubmenuAction } from "../../../base/common/actions.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Emitter } from "../../../base/common/event.js";
import { isMarkdownString, MarkdownString } from "../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { autorun } from "../../../base/common/observable.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { localize } from "../../../nls.js";
import { getActionBarActions } from "./menuEntryActionViewItem.js";
import { IMenuService, MenuItemAction } from "../common/actions.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { IHoverService } from "../../hover/browser/hover.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { renderAsPlaintext } from "../../../base/browser/markdownRenderer.js";
import { stripIcons } from "../../../base/common/iconLabels.js";
let WorkbenchButtonBar = class extends ButtonBar {
  constructor(container, _options, _contextMenuService, _keybindingService, telemetryService, _hoverService) {
    super(container);
    this._options = _options;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._store = new DisposableStore();
    this._updateStore = new DisposableStore();
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._actionRunner = this._store.add(new ActionRunner());
    if (_options?.telemetrySource) {
      this._actionRunner.onDidRun((e) => {
        telemetryService.publicLog2(
          "workbenchActionExecuted",
          { id: e.action.id, from: _options.telemetrySource }
        );
      }, void 0, this._store);
    }
  }
  get onWillRun() {
    return this._actionRunner.onWillRun;
  }
  get onDidRun() {
    return this._actionRunner.onDidRun;
  }
  dispose() {
    this._onDidChange.dispose();
    this._updateStore.dispose();
    this._store.dispose();
    super.dispose();
  }
  update(actions, secondary) {
    const configProvider = this._options?.buttonConfigProvider ?? (() => ({ showLabel: true }));
    this._updateStore.clear();
    this.clear();
    const hoverDelegate = this._updateStore.add(createInstantHoverDelegate());
    for (let i = 0; i < actions.length; i++) {
      const secondary2 = i > 0;
      const actionOrSubmenu = actions[i];
      let action;
      let btn;
      let tooltip;
      if (actionOrSubmenu instanceof SubmenuAction && actionOrSubmenu.actions.length > 1) {
        const [first, ...rest] = actionOrSubmenu.actions;
        action = first;
        tooltip = action.tooltip || action.label;
        tooltip = this._keybindingService.appendKeybinding(tooltip, action.id);
        btn = this.addButtonWithDropdown({
          addPrimaryActionToDropdown: false,
          secondary: configProvider(action, i)?.isSecondary ?? secondary2,
          actionRunner: this._actionRunner,
          actions: rest,
          contextMenuProvider: this._contextMenuService,
          ariaLabel: tooltip,
          supportIcons: true,
          small: this._options?.small
        });
      } else {
        action = actionOrSubmenu instanceof SubmenuAction && actionOrSubmenu.actions.length === 1 ? actionOrSubmenu.actions[0] : actionOrSubmenu;
        tooltip = action.tooltip || action.label;
        tooltip = this._keybindingService.appendKeybinding(tooltip, action.id);
        btn = this.addButton({
          secondary: configProvider(action, i)?.isSecondary ?? secondary2,
          ariaLabel: tooltip,
          supportIcons: true,
          small: this._options?.small
        });
      }
      btn.enabled = action.enabled;
      btn.checked = action.checked ?? false;
      btn.element.classList.add("default-colors");
      const config = configProvider(action, i);
      const showLabel = config?.showLabel ?? true;
      const showIcon = config?.showIcon;
      const customClass = config?.customClass;
      const customLabel = config?.customLabel;
      const customLabelObs = config?.customLabelObs;
      if (customClass) {
        btn.element.classList.add(customClass);
      }
      const composeLabel = (labelValue) => {
        if (showIcon && action instanceof MenuItemAction && ThemeIcon.isThemeIcon(action.item.icon) && showLabel) {
          return isMarkdownString(labelValue) ? new MarkdownString(`$(${action.item.icon.id}) ${labelValue.value}`, {
            isTrusted: labelValue.isTrusted,
            supportThemeIcons: true,
            supportHtml: labelValue.supportHtml
          }) : `$(${action.item.icon.id}) ${labelValue}`;
        }
        return labelValue;
      };
      const applyLabel = (labelValue) => {
        if (showLabel) {
          btn.label = composeLabel(labelValue);
        }
        const labelStringValue = stripIcons(renderAsPlaintext(labelValue));
        const ariaLabelWithKeybinding = this._keybindingService.appendKeybinding(labelStringValue, action.id);
        btn.setTitle(ariaLabelWithKeybinding);
        btn.setAriaLabel(ariaLabelWithKeybinding);
      };
      if (showLabel) {
        btn.label = composeLabel(customLabel ?? action.label);
      } else {
        btn.element.classList.add("monaco-text-button");
      }
      if (showIcon) {
        if (action instanceof MenuItemAction && ThemeIcon.isThemeIcon(action.item.icon)) {
          if (!showLabel) {
            btn.icon = action.item.icon;
          }
        } else if (action.class) {
          btn.element.classList.add(...action.class.split(" "));
        }
      }
      if (customLabelObs) {
        this._updateStore.add(autorun((reader) => {
          const v = customLabelObs.read(reader);
          applyLabel(v ?? customLabel ?? action.label);
        }));
      }
      this._updateStore.add(this._hoverService.setupManagedHover(hoverDelegate, btn.element, tooltip));
      this._updateStore.add(btn.onDidClick(async () => {
        if (this._options?.disableWhileRunning) {
          btn.enabled = false;
          try {
            await this._actionRunner.run(action);
          } finally {
            btn.enabled = action.enabled;
          }
        } else {
          this._actionRunner.run(action);
        }
      }));
    }
    if (secondary.length > 0) {
      const btn = this.addButton({
        secondary: true,
        ariaLabel: localize("moreActions", "More Actions"),
        small: this._options?.small
      });
      btn.icon = Codicon.dropDownButton;
      btn.element.classList.add("default-colors", "monaco-text-button");
      btn.enabled = true;
      this._updateStore.add(this._hoverService.setupManagedHover(hoverDelegate, btn.element, localize("moreActions", "More Actions")));
      this._updateStore.add(btn.onDidClick(async () => {
        this._contextMenuService.showContextMenu({
          getAnchor: () => btn.element,
          getActions: () => secondary,
          actionRunner: this._actionRunner,
          onHide: () => btn.element.setAttribute("aria-expanded", "false")
        });
        btn.element.setAttribute("aria-expanded", "true");
      }));
    }
    this._onDidChange.fire(this);
  }
};
WorkbenchButtonBar = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IHoverService)
], WorkbenchButtonBar);
let MenuWorkbenchButtonBar = class extends WorkbenchButtonBar {
  constructor(container, menuId, options, menuService, contextKeyService, contextMenuService, keybindingService, telemetryService, hoverService) {
    super(container, options, contextMenuService, keybindingService, telemetryService, hoverService);
    const menu = menuService.createMenu(menuId, contextKeyService);
    this._store.add(menu);
    const update = () => {
      this.clear();
      const actions = getActionBarActions(
        menu.getActions(options?.menuOptions),
        options?.toolbarOptions?.primaryGroup
      );
      super.update(actions.primary, actions.secondary);
    };
    this._store.add(menu.onDidChange(update));
    update();
  }
  dispose() {
    super.dispose();
  }
  update(_actions) {
    throw new Error("Use Menu or WorkbenchButtonBar");
  }
};
MenuWorkbenchButtonBar = __decorateClass([
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IHoverService)
], MenuWorkbenchButtonBar);
export {
  MenuWorkbenchButtonBar,
  WorkbenchButtonBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9idXR0b25iYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCdXR0b25CYXIsIElCdXR0b24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIElBY3Rpb25SdW5uZXIsIElSdW5FdmVudCwgU3VibWVudUFjdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBpc01hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElUb29sQmFyUmVuZGVyT3B0aW9ucyB9IGZyb20gJy4vdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIElNZW51U2VydmljZSwgTWVudUl0ZW1BY3Rpb24sIElNZW51QWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgc3RyaXBJY29ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMuanMnO1xuXG5leHBvcnQgdHlwZSBJQnV0dG9uQ29uZmlnUHJvdmlkZXIgPSAoYWN0aW9uOiBJQWN0aW9uLCBpbmRleDogbnVtYmVyKSA9PiB7XG5cdHNob3dJY29uPzogYm9vbGVhbjtcblx0c2hvd0xhYmVsPzogYm9vbGVhbjtcblx0aXNTZWNvbmRhcnk/OiBib29sZWFuO1xuXHRjdXN0b21MYWJlbD86IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0Y3VzdG9tTGFiZWxPYnM/OiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRjdXN0b21DbGFzcz86IHN0cmluZztcbn0gfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaEJ1dHRvbkJhck9wdGlvbnMge1xuXHR0ZWxlbWV0cnlTb3VyY2U/OiBzdHJpbmc7XG5cdGJ1dHRvbkNvbmZpZ1Byb3ZpZGVyPzogSUJ1dHRvbkNvbmZpZ1Byb3ZpZGVyO1xuXHRzbWFsbD86IGJvb2xlYW47XG5cdGRpc2FibGVXaGlsZVJ1bm5pbmc/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoQnV0dG9uQmFyIGV4dGVuZHMgQnV0dG9uQmFyIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3VwZGF0ZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjx0aGlzPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dGhpcz4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRnZXQgb25XaWxsUnVuKCk6IEV2ZW50PElSdW5FdmVudD4geyByZXR1cm4gdGhpcy5fYWN0aW9uUnVubmVyLm9uV2lsbFJ1bjsgfVxuXHRnZXQgb25EaWRSdW4oKTogRXZlbnQ8SVJ1bkV2ZW50PiB7IHJldHVybiB0aGlzLl9hY3Rpb25SdW5uZXIub25EaWRSdW47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElXb3JrYmVuY2hCdXR0b25CYXJPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX2FjdGlvblJ1bm5lciA9IHRoaXMuX3N0b3JlLmFkZChuZXcgQWN0aW9uUnVubmVyKCkpO1xuXHRcdGlmIChfb3B0aW9ucz8udGVsZW1ldHJ5U291cmNlKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB7XG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPihcblx0XHRcdFx0XHQnd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLFxuXHRcdFx0XHRcdHsgaWQ6IGUuYWN0aW9uLmlkLCBmcm9tOiBfb3B0aW9ucy50ZWxlbWV0cnlTb3VyY2UhIH1cblx0XHRcdFx0KTtcblx0XHRcdH0sIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3VwZGF0ZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0dXBkYXRlKGFjdGlvbnM6IElBY3Rpb25bXSwgc2Vjb25kYXJ5OiBJQWN0aW9uW10pOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNvbmZpZ1Byb3ZpZGVyOiBJQnV0dG9uQ29uZmlnUHJvdmlkZXIgPSB0aGlzLl9vcHRpb25zPy5idXR0b25Db25maWdQcm92aWRlciA/PyAoKCkgPT4gKHsgc2hvd0xhYmVsOiB0cnVlIH0pKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5jbGVhcigpO1xuXG5cdFx0Ly8gU3VwcG9ydCBpbnN0YW50IGhvdmVyIGJldHdlZW4gYnV0dG9uc1xuXHRcdGNvbnN0IGhvdmVyRGVsZWdhdGUgPSB0aGlzLl91cGRhdGVTdG9yZS5hZGQoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFjdGlvbnMubGVuZ3RoOyBpKyspIHtcblxuXHRcdFx0Y29uc3Qgc2Vjb25kYXJ5ID0gaSA+IDA7XG5cdFx0XHRjb25zdCBhY3Rpb25PclN1Ym1lbnUgPSBhY3Rpb25zW2ldO1xuXHRcdFx0bGV0IGFjdGlvbjogSUFjdGlvbjtcblx0XHRcdGxldCBidG46IElCdXR0b247XG5cdFx0XHRsZXQgdG9vbHRpcDogc3RyaW5nO1xuXG5cdFx0XHRpZiAoYWN0aW9uT3JTdWJtZW51IGluc3RhbmNlb2YgU3VibWVudUFjdGlvbiAmJiBhY3Rpb25PclN1Ym1lbnUuYWN0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdCwgLi4ucmVzdF0gPSBhY3Rpb25PclN1Ym1lbnUuYWN0aW9ucztcblx0XHRcdFx0YWN0aW9uID0gPE1lbnVJdGVtQWN0aW9uPmZpcnN0O1xuXG5cdFx0XHRcdHRvb2x0aXAgPSBhY3Rpb24udG9vbHRpcCB8fCBhY3Rpb24ubGFiZWw7XG5cdFx0XHRcdHRvb2x0aXAgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKHRvb2x0aXAsIGFjdGlvbi5pZCk7XG5cblx0XHRcdFx0YnRuID0gdGhpcy5hZGRCdXR0b25XaXRoRHJvcGRvd24oe1xuXHRcdFx0XHRcdGFkZFByaW1hcnlBY3Rpb25Ub0Ryb3Bkb3duOiBmYWxzZSxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IGNvbmZpZ1Byb3ZpZGVyKGFjdGlvbiwgaSk/LmlzU2Vjb25kYXJ5ID8/IHNlY29uZGFyeSxcblx0XHRcdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuX2FjdGlvblJ1bm5lcixcblx0XHRcdFx0XHRhY3Rpb25zOiByZXN0LFxuXHRcdFx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IHRoaXMuX2NvbnRleHRNZW51U2VydmljZSxcblx0XHRcdFx0XHRhcmlhTGFiZWw6IHRvb2x0aXAsXG5cdFx0XHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0XHRcdHNtYWxsOiB0aGlzLl9vcHRpb25zPy5zbWFsbCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhY3Rpb24gPSBhY3Rpb25PclN1Ym1lbnUgaW5zdGFuY2VvZiBTdWJtZW51QWN0aW9uICYmIGFjdGlvbk9yU3VibWVudS5hY3Rpb25zLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdD8gYWN0aW9uT3JTdWJtZW51LmFjdGlvbnNbMF1cblx0XHRcdFx0XHQ6IGFjdGlvbk9yU3VibWVudTtcblxuXHRcdFx0XHR0b29sdGlwID0gYWN0aW9uLnRvb2x0aXAgfHwgYWN0aW9uLmxhYmVsO1xuXHRcdFx0XHR0b29sdGlwID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyh0b29sdGlwLCBhY3Rpb24uaWQpO1xuXG5cdFx0XHRcdGJ0biA9IHRoaXMuYWRkQnV0dG9uKHtcblx0XHRcdFx0XHRzZWNvbmRhcnk6IGNvbmZpZ1Byb3ZpZGVyKGFjdGlvbiwgaSk/LmlzU2Vjb25kYXJ5ID8/IHNlY29uZGFyeSxcblx0XHRcdFx0XHRhcmlhTGFiZWw6IHRvb2x0aXAsXG5cdFx0XHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0XHRcdHNtYWxsOiB0aGlzLl9vcHRpb25zPy5zbWFsbCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGJ0bi5lbmFibGVkID0gYWN0aW9uLmVuYWJsZWQ7XG5cdFx0XHRidG4uY2hlY2tlZCA9IGFjdGlvbi5jaGVja2VkID8/IGZhbHNlO1xuXHRcdFx0YnRuLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZGVmYXVsdC1jb2xvcnMnKTtcblxuXHRcdFx0Y29uc3QgY29uZmlnID0gY29uZmlnUHJvdmlkZXIoYWN0aW9uLCBpKTtcblx0XHRcdGNvbnN0IHNob3dMYWJlbCA9IGNvbmZpZz8uc2hvd0xhYmVsID8/IHRydWU7XG5cdFx0XHRjb25zdCBzaG93SWNvbiA9IGNvbmZpZz8uc2hvd0ljb247XG5cdFx0XHRjb25zdCBjdXN0b21DbGFzcyA9IGNvbmZpZz8uY3VzdG9tQ2xhc3M7XG5cdFx0XHRjb25zdCBjdXN0b21MYWJlbCA9IGNvbmZpZz8uY3VzdG9tTGFiZWw7XG5cdFx0XHRjb25zdCBjdXN0b21MYWJlbE9icyA9IGNvbmZpZz8uY3VzdG9tTGFiZWxPYnM7XG5cblx0XHRcdGlmIChjdXN0b21DbGFzcykge1xuXHRcdFx0XHRidG4uZWxlbWVudC5jbGFzc0xpc3QuYWRkKGN1c3RvbUNsYXNzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29tcG9zZUxhYmVsID0gKGxhYmVsVmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyA9PiB7XG5cdFx0XHRcdGlmIChzaG93SWNvbiAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiAmJiBUaGVtZUljb24uaXNUaGVtZUljb24oYWN0aW9uLml0ZW0uaWNvbikgJiYgc2hvd0xhYmVsKSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyBpcyBSRUFMTFkgaGFja3kgYnV0IGNvbWJpbmluZyBhIGNvZGljb24gYW5kIG5vcm1hbCB0ZXh0IGlzIHVnbHkgYmVjYXVzZVxuXHRcdFx0XHRcdC8vIHRoZSBmb3JtZXIgZGVmaW5lIGEgZm9udCB3aGljaCBkb2Vzbid0IHdvcmsgZm9yIHRleHRcblx0XHRcdFx0XHRyZXR1cm4gaXNNYXJrZG93blN0cmluZyhsYWJlbFZhbHVlKVxuXHRcdFx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcoYCQoJHthY3Rpb24uaXRlbS5pY29uLmlkfSkgJHtsYWJlbFZhbHVlLnZhbHVlfWAsIHtcblx0XHRcdFx0XHRcdFx0aXNUcnVzdGVkOiBsYWJlbFZhbHVlLmlzVHJ1c3RlZCwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsIHN1cHBvcnRIdG1sOiBsYWJlbFZhbHVlLnN1cHBvcnRIdG1sXG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0OiBgJCgke2FjdGlvbi5pdGVtLmljb24uaWR9KSAke2xhYmVsVmFsdWV9YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbGFiZWxWYWx1ZTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFwcGx5TGFiZWwgPSAobGFiZWxWYWx1ZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmIChzaG93TGFiZWwpIHtcblx0XHRcdFx0XHRidG4ubGFiZWwgPSBjb21wb3NlTGFiZWwobGFiZWxWYWx1ZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsYWJlbFN0cmluZ1ZhbHVlID0gc3RyaXBJY29ucyhyZW5kZXJBc1BsYWludGV4dChsYWJlbFZhbHVlKSk7XG5cdFx0XHRcdGNvbnN0IGFyaWFMYWJlbFdpdGhLZXliaW5kaW5nID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhsYWJlbFN0cmluZ1ZhbHVlLCBhY3Rpb24uaWQpO1xuXG5cdFx0XHRcdGJ0bi5zZXRUaXRsZShhcmlhTGFiZWxXaXRoS2V5YmluZGluZyk7XG5cdFx0XHRcdGJ0bi5zZXRBcmlhTGFiZWwoYXJpYUxhYmVsV2l0aEtleWJpbmRpbmcpO1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKHNob3dMYWJlbCkge1xuXHRcdFx0XHRidG4ubGFiZWwgPSBjb21wb3NlTGFiZWwoY3VzdG9tTGFiZWwgPz8gYWN0aW9uLmxhYmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby10ZXh0LWJ1dHRvbicpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2hvd0ljb24pIHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uICYmIFRoZW1lSWNvbi5pc1RoZW1lSWNvbihhY3Rpb24uaXRlbS5pY29uKSkge1xuXHRcdFx0XHRcdGlmICghc2hvd0xhYmVsKSB7XG5cdFx0XHRcdFx0XHRidG4uaWNvbiA9IGFjdGlvbi5pdGVtLmljb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5jbGFzcykge1xuXHRcdFx0XHRcdGJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uYWN0aW9uLmNsYXNzLnNwbGl0KCcgJykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdXN0b21MYWJlbE9icykge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVTdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHYgPSBjdXN0b21MYWJlbE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0YXBwbHlMYWJlbCh2ID8/IGN1c3RvbUxhYmVsID8/IGFjdGlvbi5sYWJlbCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdXBkYXRlU3RvcmUuYWRkKHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCBidG4uZWxlbWVudCwgdG9vbHRpcCkpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU3RvcmUuYWRkKGJ0bi5vbkRpZENsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX29wdGlvbnM/LmRpc2FibGVXaGlsZVJ1bm5pbmcpIHtcblx0XHRcdFx0XHRidG4uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hY3Rpb25SdW5uZXIucnVuKGFjdGlvbik7XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdGJ0bi5lbmFibGVkID0gYWN0aW9uLmVuYWJsZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGlvblJ1bm5lci5ydW4oYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmIChzZWNvbmRhcnkubGVuZ3RoID4gMCkge1xuXG5cdFx0XHRjb25zdCBidG4gPSB0aGlzLmFkZEJ1dHRvbih7XG5cdFx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnbW9yZUFjdGlvbnMnLCBcIk1vcmUgQWN0aW9uc1wiKSxcblx0XHRcdFx0c21hbGw6IHRoaXMuX29wdGlvbnM/LnNtYWxsLFxuXHRcdFx0fSk7XG5cblx0XHRcdGJ0bi5pY29uID0gQ29kaWNvbi5kcm9wRG93bkJ1dHRvbjtcblx0XHRcdGJ0bi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RlZmF1bHQtY29sb3JzJywgJ21vbmFjby10ZXh0LWJ1dHRvbicpO1xuXG5cdFx0XHRidG4uZW5hYmxlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl91cGRhdGVTdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGhvdmVyRGVsZWdhdGUsIGJ0bi5lbGVtZW50LCBsb2NhbGl6ZSgnbW9yZUFjdGlvbnMnLCBcIk1vcmUgQWN0aW9uc1wiKSkpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU3RvcmUuYWRkKGJ0bi5vbkRpZENsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBidG4uZWxlbWVudCxcblx0XHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBzZWNvbmRhcnksXG5cdFx0XHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLl9hY3Rpb25SdW5uZXIsXG5cdFx0XHRcdFx0b25IaWRlOiAoKSA9PiBidG4uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnRuLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHRoaXMpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVXb3JrYmVuY2hCdXR0b25CYXJPcHRpb25zIGV4dGVuZHMgSVdvcmtiZW5jaEJ1dHRvbkJhck9wdGlvbnMge1xuXHRtZW51T3B0aW9ucz86IElNZW51QWN0aW9uT3B0aW9ucztcblxuXHR0b29sYmFyT3B0aW9ucz86IElUb29sQmFyUmVuZGVyT3B0aW9ucztcbn1cblxuZXhwb3J0IGNsYXNzIE1lbnVXb3JrYmVuY2hCdXR0b25CYXIgZXh0ZW5kcyBXb3JrYmVuY2hCdXR0b25CYXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0bWVudUlkOiBNZW51SWQsXG5cdFx0b3B0aW9uczogSU1lbnVXb3JrYmVuY2hCdXR0b25CYXJPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihjb250YWluZXIsIG9wdGlvbnMsIGNvbnRleHRNZW51U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cblx0XHRjb25zdCBtZW51ID0gbWVudVNlcnZpY2UuY3JlYXRlTWVudShtZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9zdG9yZS5hZGQobWVudSk7XG5cblx0XHRjb25zdCB1cGRhdGUgPSAoKSA9PiB7XG5cblx0XHRcdHRoaXMuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldEFjdGlvbkJhckFjdGlvbnMoXG5cdFx0XHRcdG1lbnUuZ2V0QWN0aW9ucyhvcHRpb25zPy5tZW51T3B0aW9ucyksXG5cdFx0XHRcdG9wdGlvbnM/LnRvb2xiYXJPcHRpb25zPy5wcmltYXJ5R3JvdXBcblx0XHRcdCk7XG5cblx0XHRcdHN1cGVyLnVwZGF0ZShhY3Rpb25zLnByaW1hcnksIGFjdGlvbnMuc2Vjb25kYXJ5KTtcblx0XHR9O1xuXHRcdHRoaXMuX3N0b3JlLmFkZChtZW51Lm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHVwZGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGUoX2FjdGlvbnM6IElBY3Rpb25bXSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignVXNlIE1lbnUgb3IgV29ya2JlbmNoQnV0dG9uQmFyJyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBMEI7QUFDbkMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxjQUFpRCxxQkFBMEY7QUFDcEosU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFDL0IsU0FBMEIsa0JBQWtCLHNCQUFzQjtBQUNsRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBRXBDLFNBQWlCLGNBQWMsc0JBQTBDO0FBQ3pFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBa0JwQixJQUFNLHFCQUFOLGNBQWlD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
