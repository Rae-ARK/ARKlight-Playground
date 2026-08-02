import * as DOM from "../../dom.js";
import { ActionBar, ActionsOrientation } from "../actionbar/actionbar.js";
import { DropdownMenuActionViewItem } from "../dropdown/dropdownActionViewItem.js";
import { Action, Separator, SubmenuAction } from "../../../common/actions.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { EventMultiplexer } from "../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import "./toolbar.css";
import * as nls from "../../../../nls.js";
import { createInstantHoverDelegate } from "../hover/hoverDelegateFactory.js";
const ACTION_MIN_WIDTH = 20;
const ACTION_PADDING = 4;
const ACTION_MIN_WIDTH_VAR = "--vscode-toolbar-action-min-width";
class ToolBar extends Disposable {
  constructor(container, contextMenuProvider, options = { orientation: ActionsOrientation.HORIZONTAL }) {
    super();
    this.container = container;
    this.submenuActionViewItems = [];
    this.hasSecondaryActions = false;
    this._onDidChangeDropdownVisibility = this._register(new EventMultiplexer());
    this.originalPrimaryActions = [];
    this.originalSecondaryActions = [];
    this.hiddenActions = [];
    this.disposables = this._register(new DisposableStore());
    options.hoverDelegate = options.hoverDelegate ?? this._register(createInstantHoverDelegate());
    this.options = options;
    this.toggleMenuAction = this._register(new ToggleMenuAction(() => this.toggleMenuActionViewItem?.show(), options.toggleMenuTitle));
    this.element = document.createElement("div");
    this.element.className = "monaco-toolbar";
    container.appendChild(this.element);
    this.actionBar = this._register(new ActionBar(this.element, {
      orientation: options.orientation,
      ariaLabel: options.ariaLabel,
      actionRunner: options.actionRunner,
      allowContextMenu: options.allowContextMenu,
      highlightToggledItems: options.highlightToggledItems,
      hoverDelegate: options.hoverDelegate,
      actionViewItemProvider: (action, viewItemOptions) => {
        if (action.id === ToggleMenuAction.ID) {
          this.toggleMenuActionViewItem = new DropdownMenuActionViewItem(
            action,
            { getActions: () => this.toggleMenuAction.menuActions },
            contextMenuProvider,
            {
              actionViewItemProvider: this.options.actionViewItemProvider,
              actionRunner: this.actionRunner,
              keybindingProvider: this.options.getKeyBinding,
              classNames: ThemeIcon.asClassNameArray(options.moreIcon ?? Codicon.toolBarMore),
              menuClassName: this.options.dropdownMenuClassName,
              closeAnimation: this.options.dropdownMenuCloseAnimation,
              anchorAlignmentProvider: this.options.anchorAlignmentProvider,
              menuAsChild: !!this.options.renderDropdownAsChildElement,
              skipTelemetry: this.options.skipTelemetry,
              isMenu: true,
              hoverDelegate: this.options.hoverDelegate
            }
          );
          this.toggleMenuActionViewItem.setActionContext(this.actionBar.context);
          this.disposables.add(this._onDidChangeDropdownVisibility.add(this.toggleMenuActionViewItem.onDidChangeVisibility));
          return this.toggleMenuActionViewItem;
        }
        if (options.actionViewItemProvider) {
          const result = options.actionViewItemProvider(action, viewItemOptions);
          if (result) {
            return result;
          }
        }
        if (action instanceof SubmenuAction) {
          const result = new DropdownMenuActionViewItem(
            action,
            action.actions,
            contextMenuProvider,
            {
              actionViewItemProvider: this.options.actionViewItemProvider,
              actionRunner: this.actionRunner,
              keybindingProvider: this.options.getKeyBinding,
              classNames: action.class,
              menuClassName: this.options.dropdownMenuClassName,
              closeAnimation: this.options.dropdownMenuCloseAnimation,
              anchorAlignmentProvider: this.options.anchorAlignmentProvider,
              menuAsChild: !!this.options.renderDropdownAsChildElement,
              skipTelemetry: this.options.skipTelemetry,
              hoverDelegate: this.options.hoverDelegate
            }
          );
          result.setActionContext(this.actionBar.context);
          this.submenuActionViewItems.push(result);
          this.disposables.add(this._onDidChangeDropdownVisibility.add(result.onDidChangeVisibility));
          return result;
        }
        return void 0;
      }
    }));
    if (this.options.responsiveBehavior?.enabled) {
      this.element.classList.toggle("responsive", true);
      this.element.classList.toggle("responsive-all", this.options.responsiveBehavior.kind === "all");
      this.element.classList.toggle("responsive-last", this.options.responsiveBehavior.kind === "last");
      this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, `${this.getConfiguredActionMinWidth()}px`);
      const observer = new ResizeObserver(() => {
        this.updateActions(this.getAvailableWidth());
      });
      observer.observe(this.options.responsiveBehavior?.observedElement ?? this.element);
      this._store.add(toDisposable(() => observer.disconnect()));
    }
  }
  get onDidChangeDropdownVisibility() {
    return this._onDidChangeDropdownVisibility.event;
  }
  set actionRunner(actionRunner) {
    this.actionBar.actionRunner = actionRunner;
  }
  get actionRunner() {
    return this.actionBar.actionRunner;
  }
  set context(context) {
    this.actionBar.context = context;
    this.toggleMenuActionViewItem?.setActionContext(context);
    for (const actionViewItem of this.submenuActionViewItems) {
      actionViewItem.setActionContext(context);
    }
  }
  getElement() {
    return this.element;
  }
  focus() {
    this.actionBar.focus();
  }
  getItemsWidth() {
    let itemsWidth = 0;
    for (let i = 0; i < this.actionBar.length(); i++) {
      itemsWidth += this.actionBar.getWidth(i);
    }
    return itemsWidth;
  }
  getItemAction(indexOrElement) {
    return this.actionBar.getAction(indexOrElement);
  }
  getItemWidth(index) {
    return this.actionBar.getWidth(index);
  }
  getItemsLength() {
    return this.actionBar.length();
  }
  setAriaLabel(label) {
    this.actionBar.setAriaLabel(label);
  }
  /**
   * Force the responsive overflow logic to re-evaluate item visibility.
   * Call this after action view items change their rendered size externally
   * (e.g. label text changes) without the toolbar being notified.
   */
  relayout() {
    if (this.options.responsiveBehavior?.enabled) {
      const width = this.getAvailableWidth();
      this.updateActions(width);
    }
  }
  setActions(primaryActions, secondaryActions) {
    this.clear();
    this.originalPrimaryActions = primaryActions ? primaryActions.slice(0) : [];
    this.originalSecondaryActions = secondaryActions ? secondaryActions.slice(0) : [];
    const primaryActionsToSet = primaryActions ? primaryActions.slice(0) : [];
    this.hasSecondaryActions = !!(secondaryActions && secondaryActions.length > 0);
    if (this.hasSecondaryActions && secondaryActions) {
      this.toggleMenuAction.menuActions = secondaryActions.slice(0);
      primaryActionsToSet.push(this.toggleMenuAction);
    }
    if (primaryActionsToSet.length > 0 && this.options.trailingSeparator) {
      primaryActionsToSet.push(new Separator());
    }
    primaryActionsToSet.forEach((action) => {
      this.actionBar.push(action, { icon: this.options.icon ?? true, label: this.options.label ?? false, keybinding: this.getKeybindingLabel(action) });
    });
    this.updateOverflowClassName();
    this.applyResponsiveActionMinWidths();
    if (this.options.responsiveBehavior?.enabled) {
      this.hiddenActions.length = 0;
      if (this.options.responsiveBehavior?.minItems !== void 0) {
        const itemCount = this.options.responsiveBehavior.minItems;
        const primaryActionsMinWidth = this.originalPrimaryActions.slice(0, itemCount).reduce((total, action) => total + this.getActionMinWidth(action), 0);
        let overflowWidth = 0;
        if (this.originalSecondaryActions.length > 0 || itemCount < this.originalPrimaryActions.length) {
          overflowWidth = ACTION_MIN_WIDTH + ACTION_PADDING;
        }
        this.container.style.minWidth = `${primaryActionsMinWidth + overflowWidth}px`;
        this.element.style.minWidth = `${primaryActionsMinWidth + overflowWidth}px`;
      } else {
        const minimumActionWidth = this.originalPrimaryActions.length > 0 ? this.getActionMinWidth(this.originalPrimaryActions[0]) : ACTION_MIN_WIDTH + ACTION_PADDING;
        this.container.style.minWidth = `${minimumActionWidth}px`;
        this.element.style.minWidth = `${minimumActionWidth}px`;
      }
      this.updateActions(this.getAvailableWidth());
    }
  }
  isEmpty() {
    return this.actionBar.isEmpty();
  }
  getKeybindingLabel(action) {
    const key = this.options.getKeyBinding?.(action);
    return key?.getLabel() ?? void 0;
  }
  getConfiguredActionMinWidth(action) {
    if (action?.id === ToggleMenuAction.ID) {
      return ACTION_MIN_WIDTH;
    }
    return this.options.responsiveBehavior?.getActionMinWidth?.(action ?? this.toggleMenuAction) ?? this.options.responsiveBehavior?.actionMinWidth ?? ACTION_MIN_WIDTH;
  }
  getActionMinWidth(action) {
    return this.getConfiguredActionMinWidth(action) + ACTION_PADDING;
  }
  getAvailableWidth() {
    if (this.options.responsiveBehavior?.getAvailableWidth) {
      return this.options.responsiveBehavior.getAvailableWidth();
    }
    return this.element.getBoundingClientRect().width;
  }
  applyResponsiveActionMinWidths() {
    if (!this.options.responsiveBehavior?.enabled) {
      return;
    }
    if (this.options.responsiveBehavior.kind === "last") {
      const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
      const shrinkableIndex = hasToggleMenuAction ? this.actionBar.length() - 2 : this.actionBar.length() - 1;
      const shrinkableAction = shrinkableIndex >= 0 ? this.actionBar.getAction(shrinkableIndex) : void 0;
      const minWidth = `${this.getConfiguredActionMinWidth(shrinkableAction)}px`;
      if (this.element.style.getPropertyValue(ACTION_MIN_WIDTH_VAR) !== minWidth) {
        this.element.style.setProperty(ACTION_MIN_WIDTH_VAR, minWidth);
      }
      return;
    }
    const actionsContainer = this.actionBar.getContainer().firstElementChild;
    if (!DOM.isHTMLElement(actionsContainer)) {
      return;
    }
    for (let i = 0; i < actionsContainer.children.length; i++) {
      const actionItem = actionsContainer.children.item(i);
      if (!DOM.isHTMLElement(actionItem)) {
        continue;
      }
      const action = this.actionBar.getAction(i);
      const minWidth = `${this.getConfiguredActionMinWidth(action)}px`;
      if (actionItem.style.minWidth !== minWidth) {
        actionItem.style.minWidth = minWidth;
      }
    }
  }
  updateActions(containerWidth) {
    if (this.actionBar.isEmpty()) {
      return;
    }
    this.applyResponsiveActionMinWidths();
    const parsedMinWidth = parseInt(this.element.style.minWidth);
    containerWidth = Math.max(containerWidth, Number.isNaN(parsedMinWidth) ? 0 : parsedMinWidth);
    const actionBarWidth = (actualWidth) => {
      if (this.options.responsiveBehavior?.kind === "last") {
        const hasToggleMenuAction = this.actionBar.hasAction(this.toggleMenuAction);
        const primaryActionsCount = hasToggleMenuAction ? this.actionBar.length() - 1 : this.actionBar.length();
        if (primaryActionsCount === 0) {
          return hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0;
        }
        let itemsWidth = 0;
        for (let i = 0; i < primaryActionsCount - 1; i++) {
          itemsWidth += this.actionBar.getWidth(i) + ACTION_PADDING;
        }
        const action = this.actionBar.getAction(primaryActionsCount - 1);
        itemsWidth += actualWidth ? this.actionBar.getWidth(primaryActionsCount - 1) : this.getActionMinWidth(action);
        itemsWidth += hasToggleMenuAction ? ACTION_MIN_WIDTH + ACTION_PADDING : 0;
        return itemsWidth;
      } else {
        let itemsWidth = 0;
        for (let i = 0; i < this.actionBar.length(); i++) {
          itemsWidth += actualWidth ? this.actionBar.getWidth(i) : this.getActionMinWidth(this.actionBar.getAction(i));
        }
        return itemsWidth;
      }
    };
    const minimumWidth = actionBarWidth(false);
    if (minimumWidth <= containerWidth && this.hiddenActions.length === 0) {
      return;
    }
    if (minimumWidth > containerWidth) {
      if (this.options.responsiveBehavior?.minItems !== void 0) {
        const primaryActionsCount = this.actionBar.hasAction(this.toggleMenuAction) ? this.actionBar.length() - 1 : this.actionBar.length();
        if (primaryActionsCount <= this.options.responsiveBehavior.minItems) {
          return;
        }
      }
      while (actionBarWidth(false) > containerWidth && this.actionBar.length() > 0) {
        const index = this.originalPrimaryActions.length - this.hiddenActions.length - 1;
        if (index < 0) {
          break;
        }
        const action = this.originalPrimaryActions[index];
        const size = Math.min(this.getActionMinWidth(action), this.getItemWidth(index));
        this.hiddenActions.unshift({ action, size });
        this.actionBar.pull(index);
        if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 1) {
          this.actionBar.push(this.toggleMenuAction, {
            icon: this.options.icon ?? true,
            label: this.options.label ?? false,
            keybinding: this.getKeybindingLabel(this.toggleMenuAction)
          });
          this.updateOverflowClassName();
        }
        this.applyResponsiveActionMinWidths();
      }
    } else {
      while (this.hiddenActions.length > 0) {
        const entry = this.hiddenActions.shift();
        if (actionBarWidth(true) + entry.size > containerWidth) {
          this.hiddenActions.unshift(entry);
          break;
        }
        this.actionBar.push(entry.action, {
          icon: this.options.icon ?? true,
          label: this.options.label ?? false,
          keybinding: this.getKeybindingLabel(entry.action),
          index: this.originalPrimaryActions.length - this.hiddenActions.length - 1
        });
        if (this.originalSecondaryActions.length === 0 && this.hiddenActions.length === 0) {
          this.toggleMenuAction.menuActions = [];
          this.actionBar.pull(this.actionBar.length() - 1);
          this.updateOverflowClassName();
        }
        this.applyResponsiveActionMinWidths();
      }
    }
    const hiddenActions = this.hiddenActions.map((entry) => entry.action);
    if (this.originalSecondaryActions.length > 0 || hiddenActions.length > 0) {
      const secondaryActions = this.originalSecondaryActions.slice(0);
      this.toggleMenuAction.menuActions = Separator.join(hiddenActions, secondaryActions);
    }
    this.updateOverflowClassName();
    this.applyResponsiveActionMinWidths();
  }
  updateOverflowClassName() {
    this.actionBar.domNode.classList.toggle("has-overflow", this.actionBar.hasAction(this.toggleMenuAction));
  }
  clear() {
    this.submenuActionViewItems = [];
    this.disposables.clear();
    this.actionBar.clear();
  }
  dispose() {
    this.clear();
    this.disposables.dispose();
    this.element.remove();
    super.dispose();
  }
}
const _ToggleMenuAction = class _ToggleMenuAction extends Action {
  constructor(toggleDropdownMenu, title) {
    title = title || nls.localize("moreActions", "More Actions...");
    super(_ToggleMenuAction.ID, title, void 0, true);
    this._menuActions = [];
    this.toggleDropdownMenu = toggleDropdownMenu;
  }
  async run() {
    this.toggleDropdownMenu();
  }
  get menuActions() {
    return this._menuActions;
  }
  set menuActions(actions) {
    this._menuActions = actions;
  }
};
_ToggleMenuAction.ID = "toolbar.toggle.more";
let ToggleMenuAction = _ToggleMenuAction;
export {
  ToggleMenuAction,
  ToolBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJQ29udGV4dE1lbnVQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyLCBBY3Rpb25zT3JpZW50YXRpb24sIElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQsIElDb250ZXh0Vmlld0Nsb3NlQW5pbWF0aW9uIH0gZnJvbSAnLi4vY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgSUFjdGlvblJ1bm5lciwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IEV2ZW50TXVsdGlwbGV4ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgJy4vdG9vbGJhci5jc3MnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5cbmNvbnN0IEFDVElPTl9NSU5fV0lEVEggPSAyMDsgLyogMjBweCBjb2RpY29uICovXG5jb25zdCBBQ1RJT05fUEFERElORyA9IDQ7IC8qIDRweCBwYWRkaW5nICovXG5cbmNvbnN0IEFDVElPTl9NSU5fV0lEVEhfVkFSID0gJy0tdnNjb2RlLXRvb2xiYXItYWN0aW9uLW1pbi13aWR0aCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRvb2xCYXJSZXNwb25zaXZlQmVoYXZpb3JPcHRpb25zIHtcblx0cmVhZG9ubHkgZW5hYmxlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkga2luZDogJ2xhc3QnIHwgJ2FsbCc7XG5cdHJlYWRvbmx5IG1pbkl0ZW1zPzogbnVtYmVyO1xuXHRyZWFkb25seSBhY3Rpb25NaW5XaWR0aD86IG51bWJlcjtcblx0cmVhZG9ubHkgZ2V0QWN0aW9uTWluV2lkdGg/OiAoYWN0aW9uOiBJQWN0aW9uKSA9PiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9ic2VydmVkRWxlbWVudD86IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBnZXRBdmFpbGFibGVXaWR0aD86ICgpID0+IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVG9vbEJhck9wdGlvbnMge1xuXHRvcmllbnRhdGlvbj86IEFjdGlvbnNPcmllbnRhdGlvbjtcblx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcj86IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyO1xuXHRhcmlhTGFiZWw/OiBzdHJpbmc7XG5cdGdldEtleUJpbmRpbmc/OiAoYWN0aW9uOiBJQWN0aW9uKSA9PiBSZXNvbHZlZEtleWJpbmRpbmcgfCB1bmRlZmluZWQ7XG5cdGFjdGlvblJ1bm5lcj86IElBY3Rpb25SdW5uZXI7XG5cdHRvZ2dsZU1lbnVUaXRsZT86IHN0cmluZztcblx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI/OiAoKSA9PiBBbmNob3JBbGlnbm1lbnQ7XG5cdGRyb3Bkb3duTWVudUNsYXNzTmFtZT86IHN0cmluZztcblx0ZHJvcGRvd25NZW51Q2xvc2VBbmltYXRpb24/OiBJQ29udGV4dFZpZXdDbG9zZUFuaW1hdGlvbjtcblx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudD86IGJvb2xlYW47XG5cdG1vcmVJY29uPzogVGhlbWVJY29uO1xuXHRhbGxvd0NvbnRleHRNZW51PzogYm9vbGVhbjtcblx0c2tpcFRlbGVtZXRyeT86IGJvb2xlYW47XG5cdGhvdmVyRGVsZWdhdGU/OiBJSG92ZXJEZWxlZ2F0ZTtcblx0dHJhaWxpbmdTZXBhcmF0b3I/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZiB0cnVlLCB0b2dnbGVkIHByaW1hcnkgaXRlbXMgYXJlIGhpZ2hsaWdodGVkIHdpdGggYSBiYWNrZ3JvdW5kIGNvbG9yLlxuXHQgKi9cblx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmVuZGVyIGFjdGlvbiB3aXRoIGljb25zIChkZWZhdWx0OiBgdHJ1ZWApXG5cdCAqL1xuXHRpY29uPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmVuZGVyIGFjdGlvbiB3aXRoIGxhYmVsIChkZWZhdWx0OiBgZmFsc2VgKVxuXHQgKi9cblx0bGFiZWw/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB0aGUgcmVzcG9uc2l2ZSBiZWhhdmlvciBvZiB0aGUgcHJpbWFyeSBncm91cCBvZiB0aGUgdG9vbGJhci5cblx0ICogLSBgZW5hYmxlZGA6IFdoZXRoZXIgdGhlIHJlc3BvbnNpdmUgYmVoYXZpb3IgaXMgZW5hYmxlZC5cblx0ICogLSBga2luZGA6IFRoZSBraW5kIG9mIHJlc3BvbnNpdmUgYmVoYXZpb3IgdG8gYXBwbHkuIENhbiBiZSBlaXRoZXIgYGxhc3RgIHRvIG9ubHkgc2hyaW5rIHRoZSBsYXN0IGl0ZW0sIG9yIGBhbGxgIHRvIHNocmluayBhbGwgaXRlbXMgZXF1YWxseS5cblx0ICogLSBgbWluSXRlbXNgOiBUaGUgbWluaW11bSBudW1iZXIgb2YgaXRlbXMgdGhhdCBzaG91bGQgYWx3YXlzIGJlIHZpc2libGUuXG5cdCAqIC0gYGFjdGlvbk1pbldpZHRoYDogVGhlIG1pbmltdW0gd2lkdGggb2YgZWFjaCBhY3Rpb24gaXRlbS4gRGVmYXVsdHMgdG8gYEFDVElPTl9NSU5fV0lEVEhgICgyNHB4KS5cblx0ICogLSBgZ2V0QWN0aW9uTWluV2lkdGhgOiBPcHRpb25hbCBwZXItYWN0aW9uIG1pbmltdW0gd2lkdGggb3ZlcnJpZGUgaW4gcGl4ZWxzLlxuXHQgKi9cblx0cmVzcG9uc2l2ZUJlaGF2aW9yPzogSVRvb2xCYXJSZXNwb25zaXZlQmVoYXZpb3JPcHRpb25zO1xufVxuXG4vKipcbiAqIEEgd2lkZ2V0IHRoYXQgY29tYmluZXMgYW4gYWN0aW9uIGJhciBmb3IgcHJpbWFyeSBhY3Rpb25zIGFuZCBhIGRyb3Bkb3duIGZvciBzZWNvbmRhcnkgYWN0aW9ucy5cbiAqL1xuZXhwb3J0IGNsYXNzIFRvb2xCYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBvcHRpb25zOiBJVG9vbEJhck9wdGlvbnM7XG5cdHByb3RlY3RlZCByZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cHJpdmF0ZSB0b2dnbGVNZW51QWN0aW9uOiBUb2dnbGVNZW51QWN0aW9uO1xuXHRwcml2YXRlIHRvZ2dsZU1lbnVBY3Rpb25WaWV3SXRlbTogRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3VibWVudUFjdGlvblZpZXdJdGVtczogRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1bXSA9IFtdO1xuXHRwcml2YXRlIGhhc1NlY29uZGFyeUFjdGlvbnM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZURyb3Bkb3duVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFdmVudE11bHRpcGxleGVyPGJvb2xlYW4+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VEcm9wZG93blZpc2liaWxpdHkoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZURyb3Bkb3duVmlzaWJpbGl0eS5ldmVudDsgfVxuXHRwcml2YXRlIG9yaWdpbmFsUHJpbWFyeUFjdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4gPSBbXTtcblx0cHJpdmF0ZSBvcmlnaW5hbFNlY29uZGFyeUFjdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4gPSBbXTtcblx0cHJpdmF0ZSBoaWRkZW5BY3Rpb25zOiB7IGFjdGlvbjogSUFjdGlvbjsgc2l6ZTogbnVtYmVyIH1bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGNvbnRleHRNZW51UHJvdmlkZXI6IElDb250ZXh0TWVudVByb3ZpZGVyLCBvcHRpb25zOiBJVG9vbEJhck9wdGlvbnMgPSB7IG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTCB9KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSA9IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSA/PyB0aGlzLl9yZWdpc3RlcihjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXG5cdFx0dGhpcy50b2dnbGVNZW51QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRvZ2dsZU1lbnVBY3Rpb24oKCkgPT4gdGhpcy50b2dnbGVNZW51QWN0aW9uVmlld0l0ZW0/LnNob3coKSwgb3B0aW9ucy50b2dnbGVNZW51VGl0bGUpKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc05hbWUgPSAnbW9uYWNvLXRvb2xiYXInO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0dGhpcy5hY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0b3JpZW50YXRpb246IG9wdGlvbnMub3JpZW50YXRpb24sXG5cdFx0XHRhcmlhTGFiZWw6IG9wdGlvbnMuYXJpYUxhYmVsLFxuXHRcdFx0YWN0aW9uUnVubmVyOiBvcHRpb25zLmFjdGlvblJ1bm5lcixcblx0XHRcdGFsbG93Q29udGV4dE1lbnU6IG9wdGlvbnMuYWxsb3dDb250ZXh0TWVudSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogb3B0aW9ucy5oaWdobGlnaHRUb2dnbGVkSXRlbXMsXG5cdFx0XHRob3ZlckRlbGVnYXRlOiBvcHRpb25zLmhvdmVyRGVsZWdhdGUsXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCB2aWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gVG9nZ2xlTWVudUFjdGlvbi5JRCkge1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtID0gbmV3IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtKFxuXHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0eyBnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLnRvZ2dsZU1lbnVBY3Rpb24ubWVudUFjdGlvbnMgfSxcblx0XHRcdFx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXIsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IHRoaXMub3B0aW9ucy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb25SdW5uZXI6IHRoaXMuYWN0aW9uUnVubmVyLFxuXHRcdFx0XHRcdFx0XHRrZXliaW5kaW5nUHJvdmlkZXI6IHRoaXMub3B0aW9ucy5nZXRLZXlCaW5kaW5nLFxuXHRcdFx0XHRcdFx0XHRjbGFzc05hbWVzOiBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShvcHRpb25zLm1vcmVJY29uID8/IENvZGljb24udG9vbEJhck1vcmUpLFxuXHRcdFx0XHRcdFx0XHRtZW51Q2xhc3NOYW1lOiB0aGlzLm9wdGlvbnMuZHJvcGRvd25NZW51Q2xhc3NOYW1lLFxuXHRcdFx0XHRcdFx0XHRjbG9zZUFuaW1hdGlvbjogdGhpcy5vcHRpb25zLmRyb3Bkb3duTWVudUNsb3NlQW5pbWF0aW9uLFxuXHRcdFx0XHRcdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogdGhpcy5vcHRpb25zLmFuY2hvckFsaWdubWVudFByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0XHRtZW51QXNDaGlsZDogISF0aGlzLm9wdGlvbnMucmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudCxcblx0XHRcdFx0XHRcdFx0c2tpcFRlbGVtZXRyeTogdGhpcy5vcHRpb25zLnNraXBUZWxlbWV0cnksXG5cdFx0XHRcdFx0XHRcdGlzTWVudTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5vcHRpb25zLmhvdmVyRGVsZWdhdGVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHRoaXMudG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtLnNldEFjdGlvbkNvbnRleHQodGhpcy5hY3Rpb25CYXIuY29udGV4dCk7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5fb25EaWRDaGFuZ2VEcm9wZG93blZpc2liaWxpdHkuYWRkKHRoaXMudG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudG9nZ2xlTWVudUFjdGlvblZpZXdJdGVtO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG9wdGlvbnMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcikge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IG9wdGlvbnMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIHZpZXdJdGVtT3B0aW9ucyk7XG5cblx0XHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51QWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gbmV3IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtKFxuXHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0YWN0aW9uLmFjdGlvbnMsXG5cdFx0XHRcdFx0XHRjb250ZXh0TWVudVByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiB0aGlzLm9wdGlvbnMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcixcblx0XHRcdFx0XHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lcixcblx0XHRcdFx0XHRcdFx0a2V5YmluZGluZ1Byb3ZpZGVyOiB0aGlzLm9wdGlvbnMuZ2V0S2V5QmluZGluZyxcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lczogYWN0aW9uLmNsYXNzLFxuXHRcdFx0XHRcdFx0XHRtZW51Q2xhc3NOYW1lOiB0aGlzLm9wdGlvbnMuZHJvcGRvd25NZW51Q2xhc3NOYW1lLFxuXHRcdFx0XHRcdFx0XHRjbG9zZUFuaW1hdGlvbjogdGhpcy5vcHRpb25zLmRyb3Bkb3duTWVudUNsb3NlQW5pbWF0aW9uLFxuXHRcdFx0XHRcdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogdGhpcy5vcHRpb25zLmFuY2hvckFsaWdubWVudFByb3ZpZGVyLFxuXHRcdFx0XHRcdFx0XHRtZW51QXNDaGlsZDogISF0aGlzLm9wdGlvbnMucmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudCxcblx0XHRcdFx0XHRcdFx0c2tpcFRlbGVtZXRyeTogdGhpcy5vcHRpb25zLnNraXBUZWxlbWV0cnksXG5cdFx0XHRcdFx0XHRcdGhvdmVyRGVsZWdhdGU6IHRoaXMub3B0aW9ucy5ob3ZlckRlbGVnYXRlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRyZXN1bHQuc2V0QWN0aW9uQ29udGV4dCh0aGlzLmFjdGlvbkJhci5jb250ZXh0KTtcblx0XHRcdFx0XHR0aGlzLnN1Ym1lbnVBY3Rpb25WaWV3SXRlbXMucHVzaChyZXN1bHQpO1xuXHRcdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuX29uRGlkQ2hhbmdlRHJvcGRvd25WaXNpYmlsaXR5LmFkZChyZXN1bHQub25EaWRDaGFuZ2VWaXNpYmlsaXR5KSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZXNwb25zaXZlIHN1cHBvcnRcblx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8uZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3Jlc3BvbnNpdmUnLCB0cnVlKTtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdyZXNwb25zaXZlLWFsbCcsIHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3Iua2luZCA9PT0gJ2FsbCcpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3Jlc3BvbnNpdmUtbGFzdCcsIHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3Iua2luZCA9PT0gJ2xhc3QnKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5zZXRQcm9wZXJ0eShBQ1RJT05fTUlOX1dJRFRIX1ZBUiwgYCR7dGhpcy5nZXRDb25maWd1cmVkQWN0aW9uTWluV2lkdGgoKX1weGApO1xuXG5cdFx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucyh0aGlzLmdldEF2YWlsYWJsZVdpZHRoKCkpO1xuXHRcdFx0fSk7XG5cdFx0XHRvYnNlcnZlci5vYnNlcnZlKHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3I/Lm9ic2VydmVkRWxlbWVudCA/PyB0aGlzLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fc3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBvYnNlcnZlci5kaXNjb25uZWN0KCkpKTtcblx0XHR9XG5cdH1cblxuXHRzZXQgYWN0aW9uUnVubmVyKGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcikge1xuXHRcdHRoaXMuYWN0aW9uQmFyLmFjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdGdldCBhY3Rpb25SdW5uZXIoKTogSUFjdGlvblJ1bm5lciB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyLmFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdHNldCBjb250ZXh0KGNvbnRleHQ6IHVua25vd24pIHtcblx0XHR0aGlzLmFjdGlvbkJhci5jb250ZXh0ID0gY29udGV4dDtcblx0XHR0aGlzLnRvZ2dsZU1lbnVBY3Rpb25WaWV3SXRlbT8uc2V0QWN0aW9uQ29udGV4dChjb250ZXh0KTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvblZpZXdJdGVtIG9mIHRoaXMuc3VibWVudUFjdGlvblZpZXdJdGVtcykge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW0uc2V0QWN0aW9uQ29udGV4dChjb250ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRnZXRFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50O1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25CYXIuZm9jdXMoKTtcblx0fVxuXG5cdGdldEl0ZW1zV2lkdGgoKTogbnVtYmVyIHtcblx0XHRsZXQgaXRlbXNXaWR0aCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRpdGVtc1dpZHRoICs9IHRoaXMuYWN0aW9uQmFyLmdldFdpZHRoKGkpO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbXNXaWR0aDtcblx0fVxuXG5cdGdldEl0ZW1BY3Rpb24oaW5kZXhPckVsZW1lbnQ6IG51bWJlciB8IEhUTUxFbGVtZW50KSB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyLmdldEFjdGlvbihpbmRleE9yRWxlbWVudCk7XG5cdH1cblxuXHRnZXRJdGVtV2lkdGgoaW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyLmdldFdpZHRoKGluZGV4KTtcblx0fVxuXG5cdGdldEl0ZW1zTGVuZ3RoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyLmxlbmd0aCgpO1xuXHR9XG5cblx0c2V0QXJpYUxhYmVsKGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmFjdGlvbkJhci5zZXRBcmlhTGFiZWwobGFiZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcmNlIHRoZSByZXNwb25zaXZlIG92ZXJmbG93IGxvZ2ljIHRvIHJlLWV2YWx1YXRlIGl0ZW0gdmlzaWJpbGl0eS5cblx0ICogQ2FsbCB0aGlzIGFmdGVyIGFjdGlvbiB2aWV3IGl0ZW1zIGNoYW5nZSB0aGVpciByZW5kZXJlZCBzaXplIGV4dGVybmFsbHlcblx0ICogKGUuZy4gbGFiZWwgdGV4dCBjaGFuZ2VzKSB3aXRob3V0IHRoZSB0b29sYmFyIGJlaW5nIG5vdGlmaWVkLlxuXHQgKi9cblx0cmVsYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3I/LmVuYWJsZWQpIHtcblx0XHRcdGNvbnN0IHdpZHRoID0gdGhpcy5nZXRBdmFpbGFibGVXaWR0aCgpO1xuXHRcdFx0dGhpcy51cGRhdGVBY3Rpb25zKHdpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRzZXRBY3Rpb25zKHByaW1hcnlBY3Rpb25zOiBSZWFkb25seUFycmF5PElBY3Rpb24+LCBzZWNvbmRhcnlBY3Rpb25zPzogUmVhZG9ubHlBcnJheTxJQWN0aW9uPik6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXIoKTtcblxuXHRcdC8vIFN0b3JlIHByaW1hcnkgYW5kIHNlY29uZGFyeSBhY3Rpb25zIGFzIHJlbmRlcmVkIGluaXRpYWxseVxuXHRcdHRoaXMub3JpZ2luYWxQcmltYXJ5QWN0aW9ucyA9IHByaW1hcnlBY3Rpb25zID8gcHJpbWFyeUFjdGlvbnMuc2xpY2UoMCkgOiBbXTtcblx0XHR0aGlzLm9yaWdpbmFsU2Vjb25kYXJ5QWN0aW9ucyA9IHNlY29uZGFyeUFjdGlvbnMgPyBzZWNvbmRhcnlBY3Rpb25zLnNsaWNlKDApIDogW107XG5cblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uc1RvU2V0ID0gcHJpbWFyeUFjdGlvbnMgPyBwcmltYXJ5QWN0aW9ucy5zbGljZSgwKSA6IFtdO1xuXG5cdFx0Ly8gSW5qZWN0IGFkZGl0aW9uYWwgYWN0aW9uIHRvIG9wZW4gc2Vjb25kYXJ5IGFjdGlvbnMgaWYgcHJlc2VudFxuXHRcdHRoaXMuaGFzU2Vjb25kYXJ5QWN0aW9ucyA9ICEhKHNlY29uZGFyeUFjdGlvbnMgJiYgc2Vjb25kYXJ5QWN0aW9ucy5sZW5ndGggPiAwKTtcblx0XHRpZiAodGhpcy5oYXNTZWNvbmRhcnlBY3Rpb25zICYmIHNlY29uZGFyeUFjdGlvbnMpIHtcblx0XHRcdHRoaXMudG9nZ2xlTWVudUFjdGlvbi5tZW51QWN0aW9ucyA9IHNlY29uZGFyeUFjdGlvbnMuc2xpY2UoMCk7XG5cdFx0XHRwcmltYXJ5QWN0aW9uc1RvU2V0LnB1c2godGhpcy50b2dnbGVNZW51QWN0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAocHJpbWFyeUFjdGlvbnNUb1NldC5sZW5ndGggPiAwICYmIHRoaXMub3B0aW9ucy50cmFpbGluZ1NlcGFyYXRvcikge1xuXHRcdFx0cHJpbWFyeUFjdGlvbnNUb1NldC5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0fVxuXG5cdFx0cHJpbWFyeUFjdGlvbnNUb1NldC5mb3JFYWNoKGFjdGlvbiA9PiB7XG5cdFx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKGFjdGlvbiwgeyBpY29uOiB0aGlzLm9wdGlvbnMuaWNvbiA/PyB0cnVlLCBsYWJlbDogdGhpcy5vcHRpb25zLmxhYmVsID8/IGZhbHNlLCBrZXliaW5kaW5nOiB0aGlzLmdldEtleWJpbmRpbmdMYWJlbChhY3Rpb24pIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy51cGRhdGVPdmVyZmxvd0NsYXNzTmFtZSgpO1xuXHRcdHRoaXMuYXBwbHlSZXNwb25zaXZlQWN0aW9uTWluV2lkdGhzKCk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8uZW5hYmxlZCkge1xuXHRcdFx0Ly8gUmVzZXQgaGlkZGVuIGFjdGlvbnNcblx0XHRcdHRoaXMuaGlkZGVuQWN0aW9ucy5sZW5ndGggPSAwO1xuXG5cdFx0XHQvLyBTZXQgdGhlIG1pbmltdW0gd2lkdGhcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yPy5taW5JdGVtcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW1Db3VudCA9IHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3IubWluSXRlbXM7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb25zTWluV2lkdGggPSB0aGlzLm9yaWdpbmFsUHJpbWFyeUFjdGlvbnNcblx0XHRcdFx0XHQuc2xpY2UoMCwgaXRlbUNvdW50KVxuXHRcdFx0XHRcdC5yZWR1Y2UoKHRvdGFsLCBhY3Rpb24pID0+IHRvdGFsICsgdGhpcy5nZXRBY3Rpb25NaW5XaWR0aChhY3Rpb24pLCAwKTtcblxuXHRcdFx0XHQvLyBBY2NvdW50IGZvciBvdmVyZmxvdyBtZW51XG5cdFx0XHRcdGxldCBvdmVyZmxvd1dpZHRoID0gMDtcblx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdHRoaXMub3JpZ2luYWxTZWNvbmRhcnlBY3Rpb25zLmxlbmd0aCA+IDAgfHxcblx0XHRcdFx0XHRpdGVtQ291bnQgPCB0aGlzLm9yaWdpbmFsUHJpbWFyeUFjdGlvbnMubGVuZ3RoXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdG92ZXJmbG93V2lkdGggPSBBQ1RJT05fTUlOX1dJRFRIICsgQUNUSU9OX1BBRERJTkc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5taW5XaWR0aCA9IGAke3ByaW1hcnlBY3Rpb25zTWluV2lkdGggKyBvdmVyZmxvd1dpZHRofXB4YDtcblx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLm1pbldpZHRoID0gYCR7cHJpbWFyeUFjdGlvbnNNaW5XaWR0aCArIG92ZXJmbG93V2lkdGh9cHhgO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbWluaW11bUFjdGlvbldpZHRoID0gdGhpcy5vcmlnaW5hbFByaW1hcnlBY3Rpb25zLmxlbmd0aCA+IDAgPyB0aGlzLmdldEFjdGlvbk1pbldpZHRoKHRoaXMub3JpZ2luYWxQcmltYXJ5QWN0aW9uc1swXSkgOiBBQ1RJT05fTUlOX1dJRFRIICsgQUNUSU9OX1BBRERJTkc7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLm1pbldpZHRoID0gYCR7bWluaW11bUFjdGlvbldpZHRofXB4YDtcblx0XHRcdFx0dGhpcy5lbGVtZW50LnN0eWxlLm1pbldpZHRoID0gYCR7bWluaW11bUFjdGlvbldpZHRofXB4YDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIHRvb2xiYXIgYWN0aW9ucyB0byBmaXQgd2l0aCBjb250YWluZXIgd2lkdGhcblx0XHRcdHRoaXMudXBkYXRlQWN0aW9ucyh0aGlzLmdldEF2YWlsYWJsZVdpZHRoKCkpO1xuXHRcdH1cblx0fVxuXG5cdGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uQmFyLmlzRW1wdHkoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0S2V5YmluZGluZ0xhYmVsKGFjdGlvbjogSUFjdGlvbik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5vcHRpb25zLmdldEtleUJpbmRpbmc/LihhY3Rpb24pO1xuXG5cdFx0cmV0dXJuIGtleT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyZWRBY3Rpb25NaW5XaWR0aChhY3Rpb24/OiBJQWN0aW9uKTogbnVtYmVyIHtcblx0XHRpZiAoYWN0aW9uPy5pZCA9PT0gVG9nZ2xlTWVudUFjdGlvbi5JRCkge1xuXHRcdFx0cmV0dXJuIEFDVElPTl9NSU5fV0lEVEg7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3I/LmdldEFjdGlvbk1pbldpZHRoPy4oYWN0aW9uID8/IHRoaXMudG9nZ2xlTWVudUFjdGlvbilcblx0XHRcdD8/IHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3I/LmFjdGlvbk1pbldpZHRoXG5cdFx0XHQ/PyBBQ1RJT05fTUlOX1dJRFRIO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25NaW5XaWR0aChhY3Rpb24/OiBJQWN0aW9uKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRDb25maWd1cmVkQWN0aW9uTWluV2lkdGgoYWN0aW9uKSArIEFDVElPTl9QQURESU5HO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBdmFpbGFibGVXaWR0aCgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yPy5nZXRBdmFpbGFibGVXaWR0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5yZXNwb25zaXZlQmVoYXZpb3IuZ2V0QXZhaWxhYmxlV2lkdGgoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKS53aWR0aDtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlSZXNwb25zaXZlQWN0aW9uTWluV2lkdGhzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8uZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVzcG9uc2l2ZUJlaGF2aW9yLmtpbmQgPT09ICdsYXN0Jykge1xuXHRcdFx0Y29uc3QgaGFzVG9nZ2xlTWVudUFjdGlvbiA9IHRoaXMuYWN0aW9uQmFyLmhhc0FjdGlvbih0aGlzLnRvZ2dsZU1lbnVBY3Rpb24pO1xuXHRcdFx0Y29uc3Qgc2hyaW5rYWJsZUluZGV4ID0gaGFzVG9nZ2xlTWVudUFjdGlvbiA/IHRoaXMuYWN0aW9uQmFyLmxlbmd0aCgpIC0gMiA6IHRoaXMuYWN0aW9uQmFyLmxlbmd0aCgpIC0gMTtcblx0XHRcdGNvbnN0IHNocmlua2FibGVBY3Rpb24gPSBzaHJpbmthYmxlSW5kZXggPj0gMCA/IHRoaXMuYWN0aW9uQmFyLmdldEFjdGlvbihzaHJpbmthYmxlSW5kZXgpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbWluV2lkdGggPSBgJHt0aGlzLmdldENvbmZpZ3VyZWRBY3Rpb25NaW5XaWR0aChzaHJpbmthYmxlQWN0aW9uKX1weGA7XG5cdFx0XHRpZiAodGhpcy5lbGVtZW50LnN0eWxlLmdldFByb3BlcnR5VmFsdWUoQUNUSU9OX01JTl9XSURUSF9WQVIpICE9PSBtaW5XaWR0aCkge1xuXHRcdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoQUNUSU9OX01JTl9XSURUSF9WQVIsIG1pbldpZHRoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gdGhpcy5hY3Rpb25CYXIuZ2V0Q29udGFpbmVyKCkuZmlyc3RFbGVtZW50Q2hpbGQ7XG5cdFx0aWYgKCFET00uaXNIVE1MRWxlbWVudChhY3Rpb25zQ29udGFpbmVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYWN0aW9uc0NvbnRhaW5lci5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgYWN0aW9uSXRlbSA9IGFjdGlvbnNDb250YWluZXIuY2hpbGRyZW4uaXRlbShpKTtcblx0XHRcdGlmICghRE9NLmlzSFRNTEVsZW1lbnQoYWN0aW9uSXRlbSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuYWN0aW9uQmFyLmdldEFjdGlvbihpKTtcblx0XHRcdGNvbnN0IG1pbldpZHRoID0gYCR7dGhpcy5nZXRDb25maWd1cmVkQWN0aW9uTWluV2lkdGgoYWN0aW9uKX1weGA7XG5cdFx0XHRpZiAoYWN0aW9uSXRlbS5zdHlsZS5taW5XaWR0aCAhPT0gbWluV2lkdGgpIHtcblx0XHRcdFx0YWN0aW9uSXRlbS5zdHlsZS5taW5XaWR0aCA9IG1pbldpZHRoO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWN0aW9ucyhjb250YWluZXJXaWR0aDogbnVtYmVyKSB7XG5cdFx0Ly8gQWN0aW9ucyBiYXIgaXMgZW1wdHlcblx0XHRpZiAodGhpcy5hY3Rpb25CYXIuaXNFbXB0eSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5hcHBseVJlc3BvbnNpdmVBY3Rpb25NaW5XaWR0aHMoKTtcblxuXHRcdC8vIEVuc3VyZSB0aGF0IHRoZSBjb250YWluZXIgd2lkdGggcmVzcGVjdHMgdGhlIG1pbmltdW0gd2lkdGggb2YgdGhlXG5cdFx0Ly8gZWxlbWVudCB3aGljaCBpcyBzZXQgYmFzZWQgb24gdGhlIGByZXNwb25zaXZlQmVoYXZpb3IubWluSXRlbXNgIG9wdGlvblxuXHRcdGNvbnN0IHBhcnNlZE1pbldpZHRoID0gcGFyc2VJbnQodGhpcy5lbGVtZW50LnN0eWxlLm1pbldpZHRoKTtcblx0XHRjb250YWluZXJXaWR0aCA9IE1hdGgubWF4KGNvbnRhaW5lcldpZHRoLCBOdW1iZXIuaXNOYU4ocGFyc2VkTWluV2lkdGgpID8gMCA6IHBhcnNlZE1pbldpZHRoKTtcblxuXHRcdC8vIEVhY2ggYWN0aW9uIGlzIGFzc3VtZWQgdG8gaGF2ZSBhIG1pbmltdW0gd2lkdGggc28gdGhhdCBhY3Rpb25zIHdpdGggYSBsYWJlbFxuXHRcdC8vIGNhbiBzaHJpbmsgdG8gdGhlIGFjdGlvbidzIG1pbmltdW0gd2lkdGguIFdlIGRvIHRoaXMgc28gdGhhdCBhY3Rpb24gdmlzaWJpbGl0eVxuXHRcdC8vIHRha2VzIHByZWNlZGVuY2Ugb3ZlciB0aGUgYWN0aW9uIGxhYmVsLlxuXHRcdGNvbnN0IGFjdGlvbkJhcldpZHRoID0gKGFjdHVhbFdpZHRoOiBib29sZWFuKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8ua2luZCA9PT0gJ2xhc3QnKSB7XG5cdFx0XHRcdGNvbnN0IGhhc1RvZ2dsZU1lbnVBY3Rpb24gPSB0aGlzLmFjdGlvbkJhci5oYXNBY3Rpb24odGhpcy50b2dnbGVNZW51QWN0aW9uKTtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnNDb3VudCA9IGhhc1RvZ2dsZU1lbnVBY3Rpb25cblx0XHRcdFx0XHQ/IHRoaXMuYWN0aW9uQmFyLmxlbmd0aCgpIC0gMVxuXHRcdFx0XHRcdDogdGhpcy5hY3Rpb25CYXIubGVuZ3RoKCk7XG5cdFx0XHRcdGlmIChwcmltYXJ5QWN0aW9uc0NvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGhhc1RvZ2dsZU1lbnVBY3Rpb24gPyBBQ1RJT05fTUlOX1dJRFRIICsgQUNUSU9OX1BBRERJTkcgOiAwO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGl0ZW1zV2lkdGggPSAwO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHByaW1hcnlBY3Rpb25zQ291bnQgLSAxOyBpKyspIHtcblx0XHRcdFx0XHRpdGVtc1dpZHRoICs9IHRoaXMuYWN0aW9uQmFyLmdldFdpZHRoKGkpICsgQUNUSU9OX1BBRERJTkc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmFjdGlvbkJhci5nZXRBY3Rpb24ocHJpbWFyeUFjdGlvbnNDb3VudCAtIDEpO1xuXHRcdFx0XHRpdGVtc1dpZHRoICs9IGFjdHVhbFdpZHRoID8gdGhpcy5hY3Rpb25CYXIuZ2V0V2lkdGgocHJpbWFyeUFjdGlvbnNDb3VudCAtIDEpIDogdGhpcy5nZXRBY3Rpb25NaW5XaWR0aChhY3Rpb24pOyAvLyBpdGVtIHRvIHNocmlua1xuXHRcdFx0XHRpdGVtc1dpZHRoICs9IGhhc1RvZ2dsZU1lbnVBY3Rpb24gPyBBQ1RJT05fTUlOX1dJRFRIICsgQUNUSU9OX1BBRERJTkcgOiAwOyAvLyB0b2dnbGUgbWVudSBhY3Rpb25cblxuXHRcdFx0XHRyZXR1cm4gaXRlbXNXaWR0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBpdGVtc1dpZHRoID0gMDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKTsgaSsrKSB7XG5cdFx0XHRcdFx0aXRlbXNXaWR0aCArPSBhY3R1YWxXaWR0aCA/IHRoaXMuYWN0aW9uQmFyLmdldFdpZHRoKGkpIDogdGhpcy5nZXRBY3Rpb25NaW5XaWR0aCh0aGlzLmFjdGlvbkJhci5nZXRBY3Rpb24oaSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBpdGVtc1dpZHRoO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtaW5pbXVtV2lkdGggPSBhY3Rpb25CYXJXaWR0aChmYWxzZSk7XG5cblx0XHQvLyBBY3Rpb24gYmFyIGZpdHMgYW5kIHRoZXJlIGFyZSBubyBoaWRkZW4gYWN0aW9ucyB0byBzaG93XG5cdFx0aWYgKG1pbmltdW1XaWR0aCA8PSBjb250YWluZXJXaWR0aCAmJiB0aGlzLmhpZGRlbkFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1pbmltdW1XaWR0aCA+IGNvbnRhaW5lcldpZHRoKSB7XG5cdFx0XHQvLyBDaGVjayBmb3IgbWF4IGl0ZW1zIGxpbWl0XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvcj8ubWluSXRlbXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9uc0NvdW50ID0gdGhpcy5hY3Rpb25CYXIuaGFzQWN0aW9uKHRoaXMudG9nZ2xlTWVudUFjdGlvbilcblx0XHRcdFx0XHQ/IHRoaXMuYWN0aW9uQmFyLmxlbmd0aCgpIC0gMVxuXHRcdFx0XHRcdDogdGhpcy5hY3Rpb25CYXIubGVuZ3RoKCk7XG5cblx0XHRcdFx0aWYgKHByaW1hcnlBY3Rpb25zQ291bnQgPD0gdGhpcy5vcHRpb25zLnJlc3BvbnNpdmVCZWhhdmlvci5taW5JdGVtcykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBIaWRlIGFjdGlvbnMgZnJvbSB0aGUgcmlnaHRcblx0XHRcdHdoaWxlIChhY3Rpb25CYXJXaWR0aChmYWxzZSkgPiBjb250YWluZXJXaWR0aCAmJiB0aGlzLmFjdGlvbkJhci5sZW5ndGgoKSA+IDApIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLm9yaWdpbmFsUHJpbWFyeUFjdGlvbnMubGVuZ3RoIC0gdGhpcy5oaWRkZW5BY3Rpb25zLmxlbmd0aCAtIDE7XG5cdFx0XHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFN0b3JlIHRoZSBhY3Rpb24gYW5kIGl0cyBzaXplXG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMub3JpZ2luYWxQcmltYXJ5QWN0aW9uc1tpbmRleF07XG5cdFx0XHRcdGNvbnN0IHNpemUgPSBNYXRoLm1pbih0aGlzLmdldEFjdGlvbk1pbldpZHRoKGFjdGlvbiksIHRoaXMuZ2V0SXRlbVdpZHRoKGluZGV4KSk7XG5cdFx0XHRcdHRoaXMuaGlkZGVuQWN0aW9ucy51bnNoaWZ0KHsgYWN0aW9uLCBzaXplIH0pO1xuXG5cdFx0XHRcdC8vIFJlbW92ZSB0aGUgYWN0aW9uXG5cdFx0XHRcdHRoaXMuYWN0aW9uQmFyLnB1bGwoaW5kZXgpO1xuXG5cdFx0XHRcdC8vIFRoZXJlIGFyZSBubyBzZWNvbmRhcnkgYWN0aW9ucywgYnV0IHdlIGhhdmUgYWN0aW9ucyB0aGF0IHdlIG5lZWQgdG8gaGlkZSBzbyB3ZVxuXHRcdFx0XHQvLyBjcmVhdGUgdGhlIG92ZXJmbG93IG1lbnUuIFRoaXMgd2lsbCBlbnN1cmUgdGhhdCBhbm90aGVyIHByaW1hcnkgYWN0aW9uIHdpbGwgYmVcblx0XHRcdFx0Ly8gcmVtb3ZlZCBtYWtpbmcgc3BhY2UgZm9yIHRoZSBvdmVyZmxvdyBtZW51LlxuXHRcdFx0XHRpZiAodGhpcy5vcmlnaW5hbFNlY29uZGFyeUFjdGlvbnMubGVuZ3RoID09PSAwICYmIHRoaXMuaGlkZGVuQWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHR0aGlzLmFjdGlvbkJhci5wdXNoKHRoaXMudG9nZ2xlTWVudUFjdGlvbiwge1xuXHRcdFx0XHRcdFx0aWNvbjogdGhpcy5vcHRpb25zLmljb24gPz8gdHJ1ZSxcblx0XHRcdFx0XHRcdGxhYmVsOiB0aGlzLm9wdGlvbnMubGFiZWwgPz8gZmFsc2UsXG5cdFx0XHRcdFx0XHRrZXliaW5kaW5nOiB0aGlzLmdldEtleWJpbmRpbmdMYWJlbCh0aGlzLnRvZ2dsZU1lbnVBY3Rpb24pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlT3ZlcmZsb3dDbGFzc05hbWUoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuYXBwbHlSZXNwb25zaXZlQWN0aW9uTWluV2lkdGhzKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNob3cgYWN0aW9ucyBmcm9tIHRoZSB0b3Agb2YgdGhlIHRvZ2dsZSBtZW51XG5cdFx0XHR3aGlsZSAodGhpcy5oaWRkZW5BY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLmhpZGRlbkFjdGlvbnMuc2hpZnQoKSE7XG5cdFx0XHRcdGlmIChhY3Rpb25CYXJXaWR0aCh0cnVlKSArIGVudHJ5LnNpemUgPiBjb250YWluZXJXaWR0aCkge1xuXHRcdFx0XHRcdC8vIE5vdCBlbm91Z2ggc3BhY2UgdG8gc2hvdyB0aGUgYWN0aW9uXG5cdFx0XHRcdFx0dGhpcy5oaWRkZW5BY3Rpb25zLnVuc2hpZnQoZW50cnkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWRkIHRoZSBhY3Rpb25cblx0XHRcdFx0dGhpcy5hY3Rpb25CYXIucHVzaChlbnRyeS5hY3Rpb24sIHtcblx0XHRcdFx0XHRpY29uOiB0aGlzLm9wdGlvbnMuaWNvbiA/PyB0cnVlLFxuXHRcdFx0XHRcdGxhYmVsOiB0aGlzLm9wdGlvbnMubGFiZWwgPz8gZmFsc2UsXG5cdFx0XHRcdFx0a2V5YmluZGluZzogdGhpcy5nZXRLZXliaW5kaW5nTGFiZWwoZW50cnkuYWN0aW9uKSxcblx0XHRcdFx0XHRpbmRleDogdGhpcy5vcmlnaW5hbFByaW1hcnlBY3Rpb25zLmxlbmd0aCAtIHRoaXMuaGlkZGVuQWN0aW9ucy5sZW5ndGggLSAxXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIFRoZXJlIGFyZSBubyBzZWNvbmRhcnkgYWN0aW9ucywgYW5kIHRoZXJlIGlzIG9ubHkgb25lIGhpZGRlbiBpdGVtIGxlZnQgc28gd2Vcblx0XHRcdFx0Ly8gcmVtb3ZlIHRoZSBvdmVyZmxvdyBtZW51IG1ha2luZyBzcGFjZSBmb3IgdGhlIGxhc3QgaGlkZGVuIGFjdGlvbiB0byBiZSBzaG93bi5cblx0XHRcdFx0aWYgKHRoaXMub3JpZ2luYWxTZWNvbmRhcnlBY3Rpb25zLmxlbmd0aCA9PT0gMCAmJiB0aGlzLmhpZGRlbkFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy50b2dnbGVNZW51QWN0aW9uLm1lbnVBY3Rpb25zID0gW107XG5cdFx0XHRcdFx0dGhpcy5hY3Rpb25CYXIucHVsbCh0aGlzLmFjdGlvbkJhci5sZW5ndGgoKSAtIDEpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlT3ZlcmZsb3dDbGFzc05hbWUoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuYXBwbHlSZXNwb25zaXZlQWN0aW9uTWluV2lkdGhzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIG92ZXJmbG93IG1lbnVcblx0XHRjb25zdCBoaWRkZW5BY3Rpb25zID0gdGhpcy5oaWRkZW5BY3Rpb25zLm1hcChlbnRyeSA9PiBlbnRyeS5hY3Rpb24pO1xuXHRcdGlmICh0aGlzLm9yaWdpbmFsU2Vjb25kYXJ5QWN0aW9ucy5sZW5ndGggPiAwIHx8IGhpZGRlbkFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9ucyA9IHRoaXMub3JpZ2luYWxTZWNvbmRhcnlBY3Rpb25zLnNsaWNlKDApO1xuXHRcdFx0dGhpcy50b2dnbGVNZW51QWN0aW9uLm1lbnVBY3Rpb25zID0gU2VwYXJhdG9yLmpvaW4oaGlkZGVuQWN0aW9ucywgc2Vjb25kYXJ5QWN0aW9ucyk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVPdmVyZmxvd0NsYXNzTmFtZSgpO1xuXHRcdHRoaXMuYXBwbHlSZXNwb25zaXZlQWN0aW9uTWluV2lkdGhzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU92ZXJmbG93Q2xhc3NOYW1lKCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aW9uQmFyLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLW92ZXJmbG93JywgdGhpcy5hY3Rpb25CYXIuaGFzQWN0aW9uKHRoaXMudG9nZ2xlTWVudUFjdGlvbikpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLnN1Ym1lbnVBY3Rpb25WaWV3SXRlbXMgPSBbXTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5hY3Rpb25CYXIuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZWxlbWVudC5yZW1vdmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZU1lbnVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd0b29sYmFyLnRvZ2dsZS5tb3JlJztcblxuXHRwcml2YXRlIF9tZW51QWN0aW9uczogUmVhZG9ubHlBcnJheTxJQWN0aW9uPjtcblx0cHJpdmF0ZSB0b2dnbGVEcm9wZG93bk1lbnU6ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IodG9nZ2xlRHJvcGRvd25NZW51OiAoKSA9PiB2b2lkLCB0aXRsZT86IHN0cmluZykge1xuXHRcdHRpdGxlID0gdGl0bGUgfHwgbmxzLmxvY2FsaXplKCdtb3JlQWN0aW9ucycsIFwiTW9yZSBBY3Rpb25zLi4uXCIpO1xuXHRcdHN1cGVyKFRvZ2dsZU1lbnVBY3Rpb24uSUQsIHRpdGxlLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0dGhpcy5fbWVudUFjdGlvbnMgPSBbXTtcblx0XHR0aGlzLnRvZ2dsZURyb3Bkb3duTWVudSA9IHRvZ2dsZURyb3Bkb3duTWVudTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRvZ2dsZURyb3Bkb3duTWVudSgpO1xuXHR9XG5cblx0Z2V0IG1lbnVBY3Rpb25zKCk6IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9tZW51QWN0aW9ucztcblx0fVxuXG5cdHNldCBtZW51QWN0aW9ucyhhY3Rpb25zOiBSZWFkb25seUFycmF5PElBY3Rpb24+KSB7XG5cdFx0dGhpcy5fbWVudUFjdGlvbnMgPSBhY3Rpb25zO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxXQUFXLDBCQUFtRDtBQUV2RSxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFFBQWdDLFdBQVcscUJBQXFCO0FBQ3pFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxP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
