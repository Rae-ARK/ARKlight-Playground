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
import { addDisposableListener, getWindow } from "../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { ToggleMenuAction, ToolBar } from "../../../base/browser/ui/toolbar/toolbar.js";
import { Separator, toAction } from "../../../base/common/actions.js";
import { coalesceInPlace } from "../../../base/common/arrays.js";
import { intersection } from "../../../base/common/collections.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { createActionViewItem, getActionBarActions } from "./menuEntryActionViewItem.js";
import { IMenuService, MenuItemAction, SubmenuItemAction } from "../common/actions.js";
import { createConfigureKeybindingAction } from "../common/menuService.js";
import { ICommandService } from "../../commands/common/commands.js";
import { IContextKeyService } from "../../contextkey/common/contextkey.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IActionViewItemService } from "./actionViewItemService.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
var HiddenItemStrategy = /* @__PURE__ */ ((HiddenItemStrategy2) => {
  HiddenItemStrategy2[HiddenItemStrategy2["NoHide"] = -1] = "NoHide";
  HiddenItemStrategy2[HiddenItemStrategy2["Ignore"] = 0] = "Ignore";
  HiddenItemStrategy2[HiddenItemStrategy2["RenderInSecondaryGroup"] = 1] = "RenderInSecondaryGroup";
  return HiddenItemStrategy2;
})(HiddenItemStrategy || {});
let WorkbenchToolBar = class extends ToolBar {
  constructor(container, _options, _menuService, _contextKeyService, _contextMenuService, _keybindingService, _commandService, telemetryService) {
    super(container, _contextMenuService, {
      // defaults
      getKeyBinding: (action) => _keybindingService.lookupKeybinding(action.id) ?? void 0,
      // options (override defaults)
      ..._options,
      // mandatory (overide options)
      allowContextMenu: true,
      skipTelemetry: typeof _options?.telemetrySource === "string"
    });
    this._options = _options;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._commandService = _commandService;
    this._sessionDisposables = this._store.add(new DisposableStore());
    const telemetrySource = _options?.telemetrySource;
    if (telemetrySource) {
      this._store.add(this.actionBar.onDidRun(
        (e) => telemetryService.publicLog2(
          "workbenchActionExecuted",
          { id: e.action.id, from: telemetrySource }
        )
      ));
    }
  }
  setActions(_primary, _secondary = [], menuIds) {
    this._sessionDisposables.clear();
    const primary = _primary.slice();
    const secondary = _secondary.slice();
    const toggleActions = [];
    let toggleActionsCheckedCount = 0;
    const extraSecondary = [];
    let someAreHidden = false;
    if (this._options?.hiddenItemStrategy !== -1 /* NoHide */) {
      for (let i = 0; i < primary.length; i++) {
        const action = primary[i];
        if (action instanceof Separator) {
          extraSecondary[i] = action;
          continue;
        }
        if (!(action instanceof MenuItemAction) && !(action instanceof SubmenuItemAction)) {
          continue;
        }
        if (!action.hideActions) {
          continue;
        }
        toggleActions.push(action.hideActions.toggle);
        if (action.hideActions.toggle.checked) {
          toggleActionsCheckedCount++;
        }
        if (action.hideActions.isHidden) {
          someAreHidden = true;
          primary[i] = void 0;
          if (this._options?.hiddenItemStrategy !== 0 /* Ignore */) {
            extraSecondary[i] = action;
          }
        }
      }
    }
    if (this._options?.overflowBehavior !== void 0) {
      const exemptedIds = intersection(new Set(this._options.overflowBehavior.exempted), Iterable.map(primary, (a) => a?.id));
      const maxItems = this._options.overflowBehavior.maxItems - exemptedIds.size;
      let count = 0;
      for (let i = 0; i < primary.length; i++) {
        const action = primary[i];
        if (!action) {
          continue;
        }
        count++;
        if (exemptedIds.has(action.id)) {
          continue;
        }
        if (count >= maxItems) {
          primary[i] = void 0;
          extraSecondary[i] = action;
        }
      }
    }
    coalesceInPlace(primary);
    coalesceInPlace(extraSecondary);
    super.setActions(Separator.clean(primary), Separator.join(Separator.clean(extraSecondary), secondary));
    if (toggleActions.length > 0 || primary.length > 0) {
      this._sessionDisposables.add(addDisposableListener(this.getElement(), "contextmenu", (e) => {
        const event = new StandardMouseEvent(getWindow(this.getElement()), e);
        const action = this.getItemAction(event.target);
        if (!action) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const primaryActions = [];
        if (action instanceof MenuItemAction && action.menuKeybinding) {
          primaryActions.push(action.menuKeybinding);
        } else if (!(action instanceof SubmenuItemAction || action instanceof ToggleMenuAction)) {
          const supportsKeybindings = !!this._keybindingService.lookupKeybinding(action.id);
          primaryActions.push(createConfigureKeybindingAction(this._commandService, this._keybindingService, action.id, void 0, supportsKeybindings));
        }
        if (toggleActions.length > 0) {
          let noHide = false;
          if (toggleActionsCheckedCount === 1 && this._options?.hiddenItemStrategy === 0 /* Ignore */) {
            noHide = true;
            for (let i = 0; i < toggleActions.length; i++) {
              if (toggleActions[i].checked) {
                toggleActions[i] = toAction({
                  id: action.id,
                  label: action.label,
                  checked: true,
                  enabled: false,
                  run() {
                  }
                });
                break;
              }
            }
          }
          if (!noHide && (action instanceof MenuItemAction || action instanceof SubmenuItemAction)) {
            if (!action.hideActions) {
              return;
            }
            primaryActions.push(action.hideActions.hide);
          } else {
            primaryActions.push(toAction({
              id: "label",
              label: localize("hide", "Hide"),
              enabled: false,
              run() {
              }
            }));
          }
        }
        const actions = Separator.join(primaryActions, toggleActions);
        if (this._options?.resetMenu && !menuIds) {
          menuIds = [this._options.resetMenu];
        }
        if (someAreHidden && menuIds) {
          actions.push(new Separator());
          actions.push(toAction({
            id: "resetThisMenu",
            label: localize("resetThisMenu", "Reset Menu"),
            run: () => this._menuService.resetHiddenStates(menuIds)
          }));
        }
        if (actions.length === 0) {
          return;
        }
        this._contextMenuService.showContextMenu({
          getAnchor: () => event,
          getActions: () => actions,
          // add context menu actions (iff appicable)
          menuId: this._options?.contextMenu,
          menuActionOptions: { renderShortTitle: true, ...this._options?.menuOptions },
          skipTelemetry: typeof this._options?.telemetrySource === "string",
          contextKeyService: this._contextKeyService
        });
      }));
    }
  }
};
WorkbenchToolBar = __decorateClass([
  __decorateParam(2, IMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, ITelemetryService)
], WorkbenchToolBar);
let MenuWorkbenchToolBar = class extends WorkbenchToolBar {
  constructor(container, menuId, options, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService, actionViewService, instantiationService) {
    super(container, {
      resetMenu: menuId,
      ...options,
      actionViewItemProvider: (action, opts) => {
        let provider = actionViewService.lookUp(menuId, action instanceof SubmenuItemAction ? action.item.submenu.id : action.id);
        if (!provider) {
          provider = options?.actionViewItemProvider;
        }
        const viewItem = provider?.(action, opts, instantiationService, getWindow(container).vscodeWindowId);
        if (viewItem) {
          return viewItem;
        }
        return createActionViewItem(instantiationService, action, opts);
      }
    }, menuService, contextKeyService, contextMenuService, keybindingService, commandService, telemetryService);
    this._onDidChangeMenuItems = this._store.add(new Emitter());
    this._container = container;
    this._menuOptions = options?.menuOptions;
    this._toolbarOptions = options?.toolbarOptions;
    this._menu = this._store.add(menuService.createMenu(menuId, contextKeyService, { emitEventsForSubmenuChanges: true, eventDebounceDelay: options?.eventDebounceDelay }));
    this._store.add(this._menu.onDidChange(() => {
      this._updateToolbar();
      this._onDidChangeMenuItems.fire(this);
    }));
    this._store.add(actionViewService.onDidChange((e) => {
      if (e === menuId) {
        this._updateToolbar();
      }
    }));
    this._updateToolbar();
  }
  get onDidChangeMenuItems() {
    return this._onDidChangeMenuItems.event;
  }
  _updateToolbar() {
    const { primary, secondary } = getActionBarActions(
      this._menu.getActions(this._menuOptions),
      this._toolbarOptions?.primaryGroup,
      this._toolbarOptions?.shouldInlineSubmenu,
      this._toolbarOptions?.useSeparatorsInPrimaryActions
    );
    this._container.classList.toggle("has-no-actions", primary.length === 0 && secondary.length === 0);
    super.setActions(primary, secondary);
  }
  /**
   * Force the toolbar to immediately re-evaluate its menu actions.
   * Use this after synchronously updating context keys to avoid
   * layout shifts caused by the debounced menu change event.
   */
  refresh() {
    this._updateToolbar();
  }
  /**
   * @deprecated The WorkbenchToolBar does not support this method because it works with menus.
   */
  setActions() {
    throw new BugIndicatingError("This toolbar is populated from a menu.");
  }
};
MenuWorkbenchToolBar = __decorateClass([
  __decorateParam(3, IMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IActionViewItemService),
  __decorateParam(10, IInstantiationService)
], MenuWorkbenchToolBar);
export {
  HiddenItemStrategy,
  MenuWorkbenchToolBar,
  WorkbenchToolBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElUb29sQmFyT3B0aW9ucywgVG9nZ2xlTWVudUFjdGlvbiwgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uLCB0b0FjdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbiwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgY29hbGVzY2VJblBsYWNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGludGVyc2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldEFjdGlvbkJhckFjdGlvbnMgfSBmcm9tICcuL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudUFjdGlvbk9wdGlvbnMsIElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb25maWd1cmVLZXliaW5kaW5nQWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL21lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi9hY3Rpb25WaWV3SXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIEhpZGRlbkl0ZW1TdHJhdGVneSB7XG5cdC8qKiBUaGlzIHRvb2xiYXIgZG9lc24ndCBzdXBwb3J0IGhpZGluZyovXG5cdE5vSGlkZSA9IC0xLFxuXHQvKiogSGlkZGVuIGl0ZW1zIGFyZW4ndCBzaG93biBhbnl3aGVyZSAqL1xuXHRJZ25vcmUgPSAwLFxuXHQvKiogSGlkZGVuIGl0ZW1zIG1vdmUgaW50byB0aGUgc2Vjb25kYXJ5IGdyb3VwICovXG5cdFJlbmRlckluU2Vjb25kYXJ5R3JvdXAgPSAxLFxufVxuXG5leHBvcnQgdHlwZSBJV29ya2JlbmNoVG9vbEJhck9wdGlvbnMgPSBJVG9vbEJhck9wdGlvbnMgJiB7XG5cblx0LyoqXG5cdCAqIEl0ZW1zIG9mIHRoZSBwcmltYXJ5IGdyb3VwIGNhbiBiZSBoaWRkZW4uIFdoZW4gdGhpcyBoYXBwZW5zIHRoZSBpdGVtIGNhblxuXHQgKiAtIG1vdmUgaW50byB0aGUgc2Vjb25kYXJ5IHBvcHVwLW1lbnUsIG9yXG5cdCAqIC0gbm90IGJlIHNob3duIGF0IGFsbFxuXHQgKi9cblx0aGlkZGVuSXRlbVN0cmF0ZWd5PzogSGlkZGVuSXRlbVN0cmF0ZWd5O1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBtZW51IGlkIHdoaWNoIGlzIHVzZWQgZm9yIGEgXCJSZXNldCBNZW51XCIgY29tbWFuZC4gVGhpcyBzaG91bGQgYmUgdGhlXG5cdCAqIG1lbnUgaWQgdGhhdCBkZWZpbmVzIHRoZSBjb250ZW50cyBvZiB0aGlzIHdvcmtiZW5jaCBtZW51XG5cdCAqL1xuXHRyZXNldE1lbnU/OiBNZW51SWQ7XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIG1lbnUgaWQgd2hpY2ggaXRlbXMgYXJlIHVzZWQgZm9yIHRoZSBjb250ZXh0IG1lbnUgb2YgdGhlIHRvb2xiYXIuXG5cdCAqL1xuXHRjb250ZXh0TWVudT86IE1lbnVJZDtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgb3B0aW9ucyBob3cgbWVudSBhY3Rpb25zIGFyZSBjcmVhdGVkIGFuZCBpbnZva2VkXG5cdCAqL1xuXHRtZW51T3B0aW9ucz86IElNZW51QWN0aW9uT3B0aW9ucztcblxuXHQvKipcblx0ICogV2hlbiBzZXQgdGhlIGB3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZGAgaXMgYXV0b21hdGljYWxseSBzZW5kIGZvciBlYWNoIGludm9rZWQgYWN0aW9uLiBUaGUgYGZyb21gIHByb3BlcnR5XG5cdCAqIG9mIHRoZSBldmVudCB3aWxsIHRoZSBwYXNzZWQgYHRlbGVtZXRyeVNvdXJjZWAtdmFsdWVcblx0ICovXG5cdHRlbGVtZXRyeVNvdXJjZT86IHN0cmluZztcblxuXHQvKiogVGhpcyBpcyBjb250cm9sbGVkIGJ5IHRoZSBXb3JrYmVuY2hUb29sQmFyICovXG5cdGFsbG93Q29udGV4dE1lbnU/OiBuZXZlcjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIG92ZXJmbG93IGJlaGF2aW9yIG9mIHRoZSBwcmltYXJ5IGdyb3VwIG9mIHRvb2xiYXIuIFRoaXMgaXN0aGUgbWF4aW11bSBudW1iZXIgb2YgaXRlbXMgYW5kIGlkIG9mXG5cdCAqIGl0ZW1zIHRoYXQgc2hvdWxkIG5ldmVyIG92ZXJmbG93XG5cdCAqXG5cdCAqL1xuXHRvdmVyZmxvd0JlaGF2aW9yPzogeyBtYXhJdGVtczogbnVtYmVyOyBleGVtcHRlZD86IHN0cmluZ1tdIH07XG59O1xuXG4vKipcbiAqIFRoZSBgV29ya2JlbmNoVG9vbEJhcmAgZG9lc1xuICogLSBzdXBwb3J0IGhpZGluZyBvZiBtZW51IGl0ZW1zXG4gKiAtIGxvb2t1cCBrZXliaW5kaW5ncyBmb3IgZWFjaCBhY3Rpb25zIGF1dG9tYXRpY2FsbHlcbiAqIC0gc2VuZCBgd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRgLWV2ZW50cyBmb3IgZWFjaCBhY3Rpb25cbiAqXG4gKiBTZWUge0BsaW5rIE1lbnVXb3JrYmVuY2hUb29sQmFyfSBmb3IgYSB0b29sYmFyIHRoYXQgaXMgYmFja2VkIGJ5IGEgbWVudS5cbiAqL1xuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaFRvb2xCYXIgZXh0ZW5kcyBUb29sQmFyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgX29wdGlvbnM6IElXb3JrYmVuY2hUb29sQmFyT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGFpbmVyLCBfY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHQvLyBkZWZhdWx0c1xuXHRcdFx0Z2V0S2V5QmluZGluZzogKGFjdGlvbikgPT4gX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKSA/PyB1bmRlZmluZWQsXG5cdFx0XHQvLyBvcHRpb25zIChvdmVycmlkZSBkZWZhdWx0cylcblx0XHRcdC4uLl9vcHRpb25zLFxuXHRcdFx0Ly8gbWFuZGF0b3J5IChvdmVyaWRlIG9wdGlvbnMpXG5cdFx0XHRhbGxvd0NvbnRleHRNZW51OiB0cnVlLFxuXHRcdFx0c2tpcFRlbGVtZXRyeTogdHlwZW9mIF9vcHRpb25zPy50ZWxlbWV0cnlTb3VyY2UgPT09ICdzdHJpbmcnLFxuXHRcdH0pO1xuXG5cdFx0Ly8gdGVsZW1ldHJ5IGxvZ2ljXG5cdFx0Y29uc3QgdGVsZW1ldHJ5U291cmNlID0gX29wdGlvbnM/LnRlbGVtZXRyeVNvdXJjZTtcblx0XHRpZiAodGVsZW1ldHJ5U291cmNlKSB7XG5cdFx0XHR0aGlzLl9zdG9yZS5hZGQodGhpcy5hY3Rpb25CYXIub25EaWRSdW4oZSA9PiB0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsXG5cdFx0XHRcdHsgaWQ6IGUuYWN0aW9uLmlkLCBmcm9tOiB0ZWxlbWV0cnlTb3VyY2UgfSlcblx0XHRcdCkpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHNldEFjdGlvbnMoX3ByaW1hcnk6IHJlYWRvbmx5IElBY3Rpb25bXSwgX3NlY29uZGFyeTogcmVhZG9ubHkgSUFjdGlvbltdID0gW10sIG1lbnVJZHM/OiByZWFkb25seSBNZW51SWRbXSk6IHZvaWQge1xuXG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgcHJpbWFyeTogQXJyYXk8SUFjdGlvbiB8IHVuZGVmaW5lZD4gPSBfcHJpbWFyeS5zbGljZSgpOyAvLyBmb3IgaGlkaW5nIGFuZCBvdmVyZmxvdyB3ZSBzZXQgc29tZSBpdGVtcyB0byB1bmRlZmluZWRcblx0XHRjb25zdCBzZWNvbmRhcnkgPSBfc2Vjb25kYXJ5LnNsaWNlKCk7XG5cdFx0Y29uc3QgdG9nZ2xlQWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0bGV0IHRvZ2dsZUFjdGlvbnNDaGVja2VkQ291bnQ6IG51bWJlciA9IDA7XG5cblx0XHRjb25zdCBleHRyYVNlY29uZGFyeTogQXJyYXk8SUFjdGlvbiB8IHVuZGVmaW5lZD4gPSBbXTtcblxuXHRcdGxldCBzb21lQXJlSGlkZGVuID0gZmFsc2U7XG5cdFx0Ly8gdW5sZXNzIGRpc2FibGVkLCBtb3ZlIGFsbCBoaWRkZW4gaXRlbXMgdG8gc2Vjb25kYXJ5IGdyb3VwIG9yIGlnbm9yZSB0aGVtXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LmhpZGRlbkl0ZW1TdHJhdGVneSAhPT0gSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwcmltYXJ5Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHByaW1hcnlbaV07XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHQvLyBUcmFjayBncm91cCBib3VuZGFyaWVzIGZyb20gYHByaW1hcnlgIHNvIGhpZGRlbiBpdGVtcyBrZWVwXG5cdFx0XHRcdFx0Ly8gdGhlaXIgb3JpZ2luYWwgZ3JvdXBzIGluIHRoZSBvdmVyZmxvdyBtZW51IChyZWxldmFudCB3aGVuXG5cdFx0XHRcdFx0Ly8gYWxsIG1lbnUgZ3JvdXBzIGFyZSB0cmVhdGVkIGFzIHByaW1hcnkpLlxuXHRcdFx0XHRcdGV4dHJhU2Vjb25kYXJ5W2ldID0gYWN0aW9uO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSAmJiAhKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRcdC8vIGNvbnNvbGUud2FybihgQWN0aW9uICR7YWN0aW9uLmlkfS8ke2FjdGlvbi5sYWJlbH0gaXMgbm90IGEgTWVudUl0ZW1BY3Rpb25gKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWFjdGlvbi5oaWRlQWN0aW9ucykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gY29sbGVjdCBhbGwgdG9nZ2xlIGFjdGlvbnNcblx0XHRcdFx0dG9nZ2xlQWN0aW9ucy5wdXNoKGFjdGlvbi5oaWRlQWN0aW9ucy50b2dnbGUpO1xuXHRcdFx0XHRpZiAoYWN0aW9uLmhpZGVBY3Rpb25zLnRvZ2dsZS5jaGVja2VkKSB7XG5cdFx0XHRcdFx0dG9nZ2xlQWN0aW9uc0NoZWNrZWRDb3VudCsrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gaGlkZGVuIGl0ZW1zIG1vdmUgaW50byBvdmVyZmxvdyBvciBpZ25vcmVcblx0XHRcdFx0aWYgKGFjdGlvbi5oaWRlQWN0aW9ucy5pc0hpZGRlbikge1xuXHRcdFx0XHRcdHNvbWVBcmVIaWRkZW4gPSB0cnVlO1xuXHRcdFx0XHRcdHByaW1hcnlbaV0gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX29wdGlvbnM/LmhpZGRlbkl0ZW1TdHJhdGVneSAhPT0gSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSkge1xuXHRcdFx0XHRcdFx0ZXh0cmFTZWNvbmRhcnlbaV0gPSBhY3Rpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY291bnQgZm9yIG1heFxuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5vdmVyZmxvd0JlaGF2aW9yICE9PSB1bmRlZmluZWQpIHtcblxuXHRcdFx0Y29uc3QgZXhlbXB0ZWRJZHMgPSBpbnRlcnNlY3Rpb24obmV3IFNldCh0aGlzLl9vcHRpb25zLm92ZXJmbG93QmVoYXZpb3IuZXhlbXB0ZWQpLCBJdGVyYWJsZS5tYXAocHJpbWFyeSwgYSA9PiBhPy5pZCkpO1xuXHRcdFx0Y29uc3QgbWF4SXRlbXMgPSB0aGlzLl9vcHRpb25zLm92ZXJmbG93QmVoYXZpb3IubWF4SXRlbXMgLSBleGVtcHRlZElkcy5zaXplO1xuXG5cdFx0XHRsZXQgY291bnQgPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwcmltYXJ5Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHByaW1hcnlbaV07XG5cdFx0XHRcdGlmICghYWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y291bnQrKztcblx0XHRcdFx0aWYgKGV4ZW1wdGVkSWRzLmhhcyhhY3Rpb24uaWQpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvdW50ID49IG1heEl0ZW1zKSB7XG5cdFx0XHRcdFx0cHJpbWFyeVtpXSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRleHRyYVNlY29uZGFyeVtpXSA9IGFjdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGNvYWxlc2NlIHR1cm5zIEFycmF5PElBY3Rpb258dW5kZWZpbmVkPiBpbnRvIElBY3Rpb25bXVxuXHRcdGNvYWxlc2NlSW5QbGFjZShwcmltYXJ5KTtcblx0XHRjb2FsZXNjZUluUGxhY2UoZXh0cmFTZWNvbmRhcnkpO1xuXG5cdFx0c3VwZXIuc2V0QWN0aW9ucyhTZXBhcmF0b3IuY2xlYW4ocHJpbWFyeSksIFNlcGFyYXRvci5qb2luKFNlcGFyYXRvci5jbGVhbihleHRyYVNlY29uZGFyeSksIHNlY29uZGFyeSkpO1xuXG5cdFx0Ly8gYWRkIGNvbnRleHQgbWVudSBmb3IgdG9nZ2xlIGFuZCBjb25maWd1cmUga2V5YmluZGluZyBhY3Rpb25zXG5cdFx0aWYgKHRvZ2dsZUFjdGlvbnMubGVuZ3RoID4gMCB8fCBwcmltYXJ5Lmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25EaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZ2V0RWxlbWVudCgpLCAnY29udGV4dG1lbnUnLCBlID0+IHtcblx0XHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyh0aGlzLmdldEVsZW1lbnQoKSksIGUpO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuZ2V0SXRlbUFjdGlvbihldmVudC50YXJnZXQpO1xuXHRcdFx0XHRpZiAoIShhY3Rpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zID0gW107XG5cblx0XHRcdFx0Ly8gLS0gQ29uZmlndXJlIEtleWJpbmRpbmcgQWN0aW9uIC0tXG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiAmJiBhY3Rpb24ubWVudUtleWJpbmRpbmcpIHtcblx0XHRcdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKGFjdGlvbi5tZW51S2V5YmluZGluZyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbiB8fCBhY3Rpb24gaW5zdGFuY2VvZiBUb2dnbGVNZW51QWN0aW9uKSkge1xuXHRcdFx0XHRcdC8vIG9ubHkgZW5hYmxlIHRoZSBjb25maWd1cmUga2V5YmluZGluZyBhY3Rpb24gZm9yIGFjdGlvbnMgdGhhdCBzdXBwb3J0IGtleWJpbmRpbmdzXG5cdFx0XHRcdFx0Y29uc3Qgc3VwcG9ydHNLZXliaW5kaW5ncyA9ICEhdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpO1xuXHRcdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goY3JlYXRlQ29uZmlndXJlS2V5YmluZGluZ0FjdGlvbih0aGlzLl9jb21tYW5kU2VydmljZSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIGFjdGlvbi5pZCwgdW5kZWZpbmVkLCBzdXBwb3J0c0tleWJpbmRpbmdzKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyAtLSBIaWRlIEFjdGlvbnMgLS1cblx0XHRcdFx0aWYgKHRvZ2dsZUFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGxldCBub0hpZGUgPSBmYWxzZTtcblxuXHRcdFx0XHRcdC8vIGxhc3QgaXRlbSBjYW5ub3QgYmUgaGlkZGVuIHdoZW4gdXNpbmcgaWdub3JlIHN0cmF0ZWd5XG5cdFx0XHRcdFx0aWYgKHRvZ2dsZUFjdGlvbnNDaGVja2VkQ291bnQgPT09IDEgJiYgdGhpcy5fb3B0aW9ucz8uaGlkZGVuSXRlbVN0cmF0ZWd5ID09PSBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlKSB7XG5cdFx0XHRcdFx0XHRub0hpZGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2dnbGVBY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0b2dnbGVBY3Rpb25zW2ldLmNoZWNrZWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0b2dnbGVBY3Rpb25zW2ldID0gdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRcdFx0aWQ6IGFjdGlvbi5pZCxcblx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBhY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XHRjaGVja2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRydW4oKSB7IH1cblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHRicmVhazsgLy8gdGhlcmUgaXMgb25seSBvbmVcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIGFkZCBcImhpZGUgZm9vXCIgYWN0aW9uc1xuXHRcdFx0XHRcdGlmICghbm9IaWRlICYmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiB8fCBhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0XHRcdGlmICghYWN0aW9uLmhpZGVBY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRcdC8vIG5vIGNvbnRleHQgbWVudSBmb3IgTWVudUl0ZW1BY3Rpb24gaW5zdGFuY2VzIHRoYXQgc3VwcG9ydCBubyBoaWRpbmdcblx0XHRcdFx0XHRcdFx0Ly8gdGhvc2UgYXJlIGZha2UgYWN0aW9ucyBhbmQgbmVlZCB0byBiZSBjbGVhbmVkIHVwXG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2goYWN0aW9uLmhpZGVBY3Rpb25zLmhpZGUpO1xuXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHRpZDogJ2xhYmVsJyxcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdoaWRlJywgXCJIaWRlXCIpLFxuXHRcdFx0XHRcdFx0XHRlbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0cnVuKCkgeyB9XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IFNlcGFyYXRvci5qb2luKHByaW1hcnlBY3Rpb25zLCB0b2dnbGVBY3Rpb25zKTtcblxuXHRcdFx0XHQvLyBhZGQgXCJSZXNldCBNZW51XCIgYWN0aW9uXG5cdFx0XHRcdGlmICh0aGlzLl9vcHRpb25zPy5yZXNldE1lbnUgJiYgIW1lbnVJZHMpIHtcblx0XHRcdFx0XHRtZW51SWRzID0gW3RoaXMuX29wdGlvbnMucmVzZXRNZW51XTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc29tZUFyZUhpZGRlbiAmJiBtZW51SWRzKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiAncmVzZXRUaGlzTWVudScsXG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Jlc2V0VGhpc01lbnUnLCBcIlJlc2V0IE1lbnVcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuX21lbnVTZXJ2aWNlLnJlc2V0SGlkZGVuU3RhdGVzKG1lbnVJZHMpXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0XHRcdC8vIGFkZCBjb250ZXh0IG1lbnUgYWN0aW9ucyAoaWZmIGFwcGljYWJsZSlcblx0XHRcdFx0XHRtZW51SWQ6IHRoaXMuX29wdGlvbnM/LmNvbnRleHRNZW51LFxuXHRcdFx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHJlbmRlclNob3J0VGl0bGU6IHRydWUsIC4uLnRoaXMuX29wdGlvbnM/Lm1lbnVPcHRpb25zIH0sXG5cdFx0XHRcdFx0c2tpcFRlbGVtZXRyeTogdHlwZW9mIHRoaXMuX29wdGlvbnM/LnRlbGVtZXRyeVNvdXJjZSA9PT0gJ3N0cmluZycsXG5cdFx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cbn1cblxuLy8gLS0tLSBNZW51V29ya2JlbmNoVG9vbEJhciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblxuZXhwb3J0IGludGVyZmFjZSBJVG9vbEJhclJlbmRlck9wdGlvbnMge1xuXHQvKipcblx0ICogRGV0ZXJtaW5lcyB3aGF0IGdyb3VwcyBhcmUgY29uc2lkZXJlZCBwcmltYXJ5LiBEZWZhdWx0cyB0byBgbmF2aWdhdGlvbmAuIEl0ZW1zIG9mIHRoZSBwcmltYXJ5XG5cdCAqIGdyb3VwIGFyZSByZW5kZXJlZCB3aXRoIGJ1dHRvbnMgYW5kIHRoZSByZXN0IGlzIHJlbmRlcmVkIGluIHRoZSBzZWNvbmRhcnkgcG9wdXAtbWVudS5cblx0ICovXG5cdHByaW1hcnlHcm91cD86IHN0cmluZyB8ICgoYWN0aW9uR3JvdXA6IHN0cmluZykgPT4gYm9vbGVhbik7XG5cblx0LyoqXG5cdCAqIElubGluc2Ugc3VibWVudXMgd2l0aCBqdXN0IGEgc2luZ2xlIGl0ZW1cblx0ICovXG5cdHNob3VsZElubGluZVN1Ym1lbnU/OiAoYWN0aW9uOiBTdWJtZW51QWN0aW9uLCBncm91cDogc3RyaW5nLCBncm91cFNpemU6IG51bWJlcikgPT4gYm9vbGVhbjtcblxuXHQvKipcblx0ICogU2hvdWxkIHRoZSBwcmltYXJ5IGdyb3VwIGFsbG93IGZvciBzZXBhcmF0b3JzLlxuXHQgKi9cblx0dXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnM/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51V29ya2JlbmNoVG9vbEJhck9wdGlvbnMgZXh0ZW5kcyBJV29ya2JlbmNoVG9vbEJhck9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBvcHRpb25zIHRvIGNvbmZpZ3VyZSBob3cgdGhlIHRvb2xiYXIgcmVuZGVyZXMgaXRlbXMuXG5cdCAqL1xuXHR0b29sYmFyT3B0aW9ucz86IElUb29sQmFyUmVuZGVyT3B0aW9ucztcblxuXHQvKipcblx0ICogT25seSBgdW5kZWZpbmVkYCB0byBkaXNhYmxlIHRoZSByZXNldCBjb21tYW5kIGlzIGFsbG93ZWQsIG90aGVyd2lzZSB0aGUgbWVudXNcblx0ICogaWQgaXMgdXNlZC5cblx0ICovXG5cdHJlc2V0TWVudT86IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQ3VzdG9taXplIHRoZSBkZWJvdW5jZSBkZWxheSBmb3IgbWVudSB1cGRhdGVzXG5cdCAqL1xuXHRldmVudERlYm91bmNlRGVsYXk/OiBudW1iZXI7XG59XG5cbi8qKlxuICogQSB7QGxpbmsgV29ya2JlbmNoVG9vbEJhciB3b3JrYmVuY2ggdG9vbGJhcn0gdGhhdCBpcyBwdXJlbHkgZHJpdmVuIGZyb20gYSB7QGxpbmsgTWVudUlkIG1lbnV9LWlkZW50aWZpZXIuXG4gKlxuICogKk5vdGUqIHRoYXQgTWFudWFsIHVwZGF0ZXMgdmlhIGBzZXRBY3Rpb25zYCBhcmUgTk9UIHN1cHBvcnRlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIE1lbnVXb3JrYmVuY2hUb29sQmFyIGV4dGVuZHMgV29ya2JlbmNoVG9vbEJhciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNZW51SXRlbXMgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVtaXR0ZXI8dGhpcz4oKSk7XG5cdGdldCBvbkRpZENoYW5nZU1lbnVJdGVtcygpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlTWVudUl0ZW1zLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWVudTogSU1lbnU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbnVPcHRpb25zOiBJTWVudUFjdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xiYXJPcHRpb25zOiBJVG9vbEJhclJlbmRlck9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRtZW51SWQ6IE1lbnVJZCxcblx0XHRvcHRpb25zOiBJTWVudVdvcmtiZW5jaFRvb2xCYXJPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdTZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGFpbmVyLCB7XG5cdFx0XHRyZXNldE1lbnU6IG1lbnVJZCxcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRzKSA9PiB7XG5cdFx0XHRcdGxldCBwcm92aWRlciA9IGFjdGlvblZpZXdTZXJ2aWNlLmxvb2tVcChtZW51SWQsIGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uID8gYWN0aW9uLml0ZW0uc3VibWVudS5pZCA6IGFjdGlvbi5pZCk7XG5cdFx0XHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdFx0XHRwcm92aWRlciA9IG9wdGlvbnM/LmFjdGlvblZpZXdJdGVtUHJvdmlkZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgdmlld0l0ZW0gPSBwcm92aWRlcj8uKGFjdGlvbiwgb3B0cywgaW5zdGFudGlhdGlvblNlcnZpY2UsIGdldFdpbmRvdyhjb250YWluZXIpLnZzY29kZVdpbmRvd0lkKTtcblx0XHRcdFx0aWYgKHZpZXdJdGVtKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZpZXdJdGVtO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjcmVhdGVBY3Rpb25WaWV3SXRlbShpbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRzKTtcblx0XHRcdH1cblx0XHR9LCBtZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLl9tZW51T3B0aW9ucyA9IG9wdGlvbnM/Lm1lbnVPcHRpb25zO1xuXHRcdHRoaXMuX3Rvb2xiYXJPcHRpb25zID0gb3B0aW9ucz8udG9vbGJhck9wdGlvbnM7XG5cblx0XHQvLyB1cGRhdGUgbG9naWNcblx0XHR0aGlzLl9tZW51ID0gdGhpcy5fc3RvcmUuYWRkKG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUobWVudUlkLCBjb250ZXh0S2V5U2VydmljZSwgeyBlbWl0RXZlbnRzRm9yU3VibWVudUNoYW5nZXM6IHRydWUsIGV2ZW50RGVib3VuY2VEZWxheTogb3B0aW9ucz8uZXZlbnREZWJvdW5jZURlbGF5IH0pKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9tZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXIoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTWVudUl0ZW1zLmZpcmUodGhpcyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGFjdGlvblZpZXdTZXJ2aWNlLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUgPT09IG1lbnVJZCkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUb29sYmFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3VwZGF0ZVRvb2xiYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRvb2xiYXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBwcmltYXJ5LCBzZWNvbmRhcnkgfSA9IGdldEFjdGlvbkJhckFjdGlvbnMoXG5cdFx0XHR0aGlzLl9tZW51LmdldEFjdGlvbnModGhpcy5fbWVudU9wdGlvbnMpLFxuXHRcdFx0dGhpcy5fdG9vbGJhck9wdGlvbnM/LnByaW1hcnlHcm91cCxcblx0XHRcdHRoaXMuX3Rvb2xiYXJPcHRpb25zPy5zaG91bGRJbmxpbmVTdWJtZW51LFxuXHRcdFx0dGhpcy5fdG9vbGJhck9wdGlvbnM/LnVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zXG5cdFx0KTtcblx0XHR0aGlzLl9jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLW5vLWFjdGlvbnMnLCBwcmltYXJ5Lmxlbmd0aCA9PT0gMCAmJiBzZWNvbmRhcnkubGVuZ3RoID09PSAwKTtcblx0XHRzdXBlci5zZXRBY3Rpb25zKHByaW1hcnksIHNlY29uZGFyeSk7XG5cdH1cblxuXHQvKipcblx0ICogRm9yY2UgdGhlIHRvb2xiYXIgdG8gaW1tZWRpYXRlbHkgcmUtZXZhbHVhdGUgaXRzIG1lbnUgYWN0aW9ucy5cblx0ICogVXNlIHRoaXMgYWZ0ZXIgc3luY2hyb25vdXNseSB1cGRhdGluZyBjb250ZXh0IGtleXMgdG8gYXZvaWRcblx0ICogbGF5b3V0IHNoaWZ0cyBjYXVzZWQgYnkgdGhlIGRlYm91bmNlZCBtZW51IGNoYW5nZSBldmVudC5cblx0ICovXG5cdHJlZnJlc2goKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlVG9vbGJhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEBkZXByZWNhdGVkIFRoZSBXb3JrYmVuY2hUb29sQmFyIGRvZXMgbm90IHN1cHBvcnQgdGhpcyBtZXRob2QgYmVjYXVzZSBpdCB3b3JrcyB3aXRoIG1lbnVzLlxuXHQgKi9cblx0b3ZlcnJpZGUgc2V0QWN0aW9ucygpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdUaGlzIHRvb2xiYXIgaXMgcG9wdWxhdGVkIGZyb20gYSBtZW51LicpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCLGlCQUFpQjtBQUNqRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUEwQixrQkFBa0IsZUFBZTtBQUMzRCxTQUFrQixXQUEwQixnQkFBcUY7QUFDakksU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCLDJCQUEyQjtBQUMxRCxTQUFvQyxjQUFzQixnQkFBZ0IseUJBQXlCO0FBQ25HLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMs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
