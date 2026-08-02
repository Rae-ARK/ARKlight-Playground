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
import { localize } from "../../../nls.js";
import { Action, Separator } from "../../../base/common/actions.js";
import { $, addDisposableListener, append, clearNode, EventHelper, EventType, getDomNodePagePosition, hide, show } from "../../../base/browser/dom.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { toDisposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { NumberBadge, ProgressBadge, IconBadge } from "../../services/activity/common/activity.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { DelayedDragHandler } from "../../../base/browser/dnd.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { CompositeDragAndDropObserver, toggleDropEffect } from "../dnd.js";
import { BaseActionViewItem } from "../../../base/browser/ui/actionbar/actionViewItems.js";
import { Codicon } from "../../../base/common/codicons.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { badgeBackground, badgeForeground, contrastBorder } from "../../../platform/theme/common/colorRegistry.js";
import { Action2 } from "../../../platform/actions/common/actions.js";
import { IPaneCompositePartService } from "../../services/panecomposite/browser/panecomposite.js";
import { createConfigureKeybindingAction } from "../../../platform/actions/common/menuService.js";
import { HoverStyle } from "../../../base/browser/ui/hover/hover.js";
class CompositeBarAction extends Action {
  constructor(item) {
    super(item.id, item.name, item.classNames?.join(" "), true);
    this.item = item;
    this._onDidChangeCompositeBarActionItem = this._register(new Emitter());
    this.onDidChangeCompositeBarActionItem = this._onDidChangeCompositeBarActionItem.event;
    this._onDidChangeActivity = this._register(new Emitter());
    this.onDidChangeActivity = this._onDidChangeActivity.event;
    this._activities = [];
  }
  get compositeBarActionItem() {
    return this.item;
  }
  set compositeBarActionItem(item) {
    this._label = item.name;
    this.item = item;
    this._onDidChangeCompositeBarActionItem.fire(this);
  }
  get activities() {
    return this._activities;
  }
  set activities(activities) {
    this._activities = activities;
    this._onDidChangeActivity.fire(activities);
  }
  activate() {
    if (!this.checked) {
      this._setChecked(true);
    }
  }
  deactivate() {
    if (this.checked) {
      this._setChecked(false);
    }
  }
}
let CompositeBarActionViewItem = class extends BaseActionViewItem {
  constructor(action, options, badgesEnabled, themeService, hoverService, configurationService, keybindingService) {
    super(null, action, options);
    this.badgesEnabled = badgesEnabled;
    this.themeService = themeService;
    this.hoverService = hoverService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.badgeDisposable = this._register(new MutableDisposable());
    this.options = options;
    this._register(this.themeService.onDidColorThemeChange(this.onThemeChange, this));
    this._register(action.onDidChangeCompositeBarActionItem(() => this.update()));
    this._register(Event.filter(keybindingService.onDidUpdateKeybindings, () => this.keybindingLabel !== this.computeKeybindingLabel())(() => this.updateTitle()));
    this._register(action.onDidChangeActivity(() => this.updateActivity()));
  }
  get compositeBarActionItem() {
    return this._action.compositeBarActionItem;
  }
  updateStyles() {
    const theme = this.themeService.getColorTheme();
    const colors = this.options.colors(theme);
    if (this.label) {
      if (this.options.icon) {
        const foreground = this._action.checked ? colors.activeForegroundColor : colors.inactiveForegroundColor;
        if (this.compositeBarActionItem.iconUrl) {
          this.label.style.backgroundColor = foreground ? foreground.toString() : "";
          this.label.style.color = "";
        } else {
          this.label.style.color = foreground ? foreground.toString() : "";
          this.label.style.backgroundColor = "";
        }
      } else {
        const foreground = this._action.checked ? colors.activeForegroundColor : colors.inactiveForegroundColor;
        const borderBottomColor = this._action.checked ? colors.activeBorderBottomColor : null;
        this.label.style.color = foreground ? foreground.toString() : "";
        this.label.style.borderBottomColor = borderBottomColor ? borderBottomColor.toString() : "";
      }
      this.container.style.setProperty("--insert-border-color", colors.dragAndDropBorder ? colors.dragAndDropBorder.toString() : "");
    }
    if (this.badgeContent) {
      const badgeStyles = this.getActivities()[0]?.badge.getColors(theme);
      const badgeFg = badgeStyles?.badgeForeground ?? colors.badgeForeground ?? theme.getColor(badgeForeground);
      const badgeBg = badgeStyles?.badgeBackground ?? colors.badgeBackground ?? theme.getColor(badgeBackground);
      const contrastBorderColor = badgeStyles?.badgeBorder ?? theme.getColor(contrastBorder);
      this.badgeContent.style.color = badgeFg ? badgeFg.toString() : "";
      this.badgeContent.style.backgroundColor = badgeBg ? badgeBg.toString() : "";
      this.badgeContent.style.borderStyle = contrastBorderColor && !this.options.compact ? "solid" : "";
      this.badgeContent.style.borderWidth = contrastBorderColor ? "1px" : "";
      this.badgeContent.style.borderColor = contrastBorderColor ? contrastBorderColor.toString() : "";
    }
  }
  render(container) {
    super.render(container);
    this.container = container;
    if (this.options.icon) {
      this.container.classList.add("icon");
    }
    const role = this.options.isTabList || !this.options.hasPopup ? "tab" : "button";
    this.container.setAttribute("role", role);
    if (this.options.hasPopup) {
      this.container.setAttribute("aria-haspopup", "true");
    }
    this._register(addDisposableListener(this.container, EventType.MOUSE_DOWN, () => {
      this.container.classList.add("clicked");
    }));
    this._register(addDisposableListener(this.container, EventType.MOUSE_UP, () => {
      if (this.mouseUpTimeout) {
        clearTimeout(this.mouseUpTimeout);
      }
      this.mouseUpTimeout = setTimeout(() => {
        this.container.classList.remove("clicked");
      }, 800);
    }));
    this._register(this.hoverService.setupDelayedHover(this.container, () => ({
      content: this.computeTitle(),
      style: HoverStyle.Pointer,
      position: {
        hoverPosition: this.options.hoverOptions.position()
      },
      persistence: {
        hideOnKeyDown: true
      }
    }), { groupId: "composite-bar-actions" }));
    this.label = append(container, $("a"));
    this.badge = append(container, $(".badge"));
    this.badgeContent = append(this.badge, $(".badge-content"));
    append(container, $(".active-item-indicator"));
    hide(this.badge);
    this.update();
    this.updateStyles();
    this.updateTitle();
  }
  onThemeChange(theme) {
    this.updateStyles();
  }
  update() {
    this.updateLabel();
    this.updateActivity();
    this.updateTitle();
    this.updateStyles();
  }
  getActivities() {
    if (this._action instanceof CompositeBarAction) {
      return this._action.activities;
    }
    return [];
  }
  updateActivity() {
    if (!this.badge || !this.badgeContent || !(this._action instanceof CompositeBarAction)) {
      return;
    }
    const { badges, type } = this.getVisibleBadges(this.getActivities());
    this.badgeDisposable.value = new DisposableStore();
    clearNode(this.badgeContent);
    hide(this.badge);
    const shouldRenderBadges = this.badgesEnabled(this.compositeBarActionItem.id);
    if (badges.length > 0 && shouldRenderBadges) {
      const classes = [];
      if (this.options.compact) {
        classes.push("compact");
      }
      if (type === "progress") {
        show(this.badge);
        classes.push("progress-badge");
      } else if (type === "number") {
        const total = badges.reduce((r, b) => r + (b instanceof NumberBadge ? b.number : 0), 0);
        if (total > 0) {
          let badgeNumber = total.toString();
          if (total > 999) {
            const noOfThousands = total / 1e3;
            const floor = Math.floor(noOfThousands);
            badgeNumber = noOfThousands > floor ? `${floor}K+` : `${noOfThousands}K`;
          }
          if (this.options.compact && badgeNumber.length >= 3) {
            classes.push("compact-content");
          }
          this.badgeContent.textContent = badgeNumber;
          show(this.badge);
        }
      } else if (type === "icon") {
        classes.push("icon-badge");
        const badgeContentClassess = ["icon-overlay", ...ThemeIcon.asClassNameArray(badges[0].icon)];
        this.badgeContent.classList.add(...badgeContentClassess);
        this.badgeDisposable.value.add(toDisposable(() => this.badgeContent?.classList.remove(...badgeContentClassess)));
        show(this.badge);
      }
      if (classes.length) {
        this.badge.classList.add(...classes);
        this.badgeDisposable.value.add(toDisposable(() => this.badge.classList.remove(...classes)));
      }
    }
    this.updateTitle();
    this.updateStyles();
  }
  getVisibleBadges(activities) {
    const progressBadges = activities.filter((activity) => activity.badge instanceof ProgressBadge).map((activity) => activity.badge);
    if (progressBadges.length > 0) {
      return { badges: progressBadges, type: "progress" };
    }
    const iconBadges = activities.filter((activity) => activity.badge instanceof IconBadge).map((activity) => activity.badge);
    if (iconBadges.length > 0) {
      return { badges: iconBadges, type: "icon" };
    }
    const numberBadges = activities.filter((activity) => activity.badge instanceof NumberBadge).map((activity) => activity.badge);
    if (numberBadges.length > 0) {
      return { badges: numberBadges, type: "number" };
    }
    return { badges: [], type: void 0 };
  }
  updateLabel() {
    this.label.className = "action-label";
    if (this.compositeBarActionItem.classNames) {
      this.label.classList.add(...this.compositeBarActionItem.classNames);
    }
    if (!this.options.icon) {
      this.label.textContent = this.action.label;
    }
  }
  updateTitle() {
    const title = this.computeTitle();
    [this.label, this.badge, this.container].forEach((element) => {
      if (element) {
        element.setAttribute("aria-label", title);
        element.setAttribute("title", "");
        element.removeAttribute("title");
      }
    });
  }
  computeTitle() {
    this.keybindingLabel = this.computeKeybindingLabel();
    let title = this.keybindingLabel ? localize("titleKeybinding", "{0} ({1})", this.compositeBarActionItem.name, this.keybindingLabel) : this.compositeBarActionItem.name;
    const badges = this.getVisibleBadges(this.action.activities).badges;
    for (const badge of badges) {
      const description = badge.getDescription();
      if (!description) {
        continue;
      }
      title = `${title} - ${badge.getDescription()}`;
    }
    return title;
  }
  computeKeybindingLabel() {
    const keybinding = this.compositeBarActionItem.keybindingId ? this.keybindingService.lookupKeybinding(this.compositeBarActionItem.keybindingId) : null;
    return keybinding?.getLabel();
  }
  dispose() {
    super.dispose();
    if (this.mouseUpTimeout) {
      clearTimeout(this.mouseUpTimeout);
    }
    this.badge.remove();
  }
};
CompositeBarActionViewItem = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IHoverService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IKeybindingService)
], CompositeBarActionViewItem);
class CompositeOverflowActivityAction extends CompositeBarAction {
  constructor(showMenu) {
    super({
      id: "additionalComposites.action",
      name: localize("additionalViews", "Additional Views"),
      classNames: ThemeIcon.asClassNameArray(Codicon.more)
    });
    this.showMenu = showMenu;
  }
  async run() {
    this.showMenu();
  }
}
let CompositeOverflowActivityActionViewItem = class extends CompositeBarActionViewItem {
  constructor(action, getOverflowingComposites, getActiveCompositeId, getBadge, getCompositeOpenAction, colors, hoverOptions, contextMenuService, themeService, hoverService, configurationService, keybindingService) {
    super(action, { icon: true, colors, hasPopup: true, hoverOptions, isTabList: true }, () => true, themeService, hoverService, configurationService, keybindingService);
    this.getOverflowingComposites = getOverflowingComposites;
    this.getActiveCompositeId = getActiveCompositeId;
    this.getBadge = getBadge;
    this.getCompositeOpenAction = getCompositeOpenAction;
    this.contextMenuService = contextMenuService;
  }
  showMenu() {
    this.contextMenuService.showContextMenu({
      getAnchor: () => this.container,
      getActions: () => this.getActions(),
      getCheckedActionsRepresentation: () => "radio"
    });
  }
  getActions() {
    return this.getOverflowingComposites().map((composite) => {
      const action = this.getCompositeOpenAction(composite.id);
      action.checked = this.getActiveCompositeId() === action.id;
      const badge = this.getBadge(composite.id);
      let suffix;
      if (badge instanceof NumberBadge) {
        suffix = badge.number;
      }
      if (suffix) {
        action.label = localize("numberBadge", "{0} ({1})", composite.name, suffix);
      } else {
        action.label = composite.name || "";
      }
      return action;
    });
  }
};
CompositeOverflowActivityActionViewItem = __decorateClass([
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IKeybindingService)
], CompositeOverflowActivityActionViewItem);
let CompositeActionViewItem = class extends CompositeBarActionViewItem {
  constructor(options, compositeActivityAction, toggleCompositePinnedAction, toggleCompositeBadgeAction, compositeContextMenuActionsProvider, contextMenuActionsProvider, dndHandler, compositeBar, contextMenuService, keybindingService, instantiationService, themeService, hoverService, configurationService, commandService) {
    super(
      compositeActivityAction,
      options,
      compositeBar.areBadgesEnabled.bind(compositeBar),
      themeService,
      hoverService,
      configurationService,
      keybindingService
    );
    this.toggleCompositePinnedAction = toggleCompositePinnedAction;
    this.toggleCompositeBadgeAction = toggleCompositeBadgeAction;
    this.compositeContextMenuActionsProvider = compositeContextMenuActionsProvider;
    this.contextMenuActionsProvider = contextMenuActionsProvider;
    this.dndHandler = dndHandler;
    this.compositeBar = compositeBar;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
  }
  render(container) {
    super.render(container);
    this.updateChecked();
    this.updateEnabled();
    this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, (e) => {
      EventHelper.stop(e, true);
      this.showContextMenu(container);
    }));
    let insertDropBefore = void 0;
    this._register(CompositeDragAndDropObserver.INSTANCE.registerDraggable(this.container, () => {
      return { type: "composite", id: this.compositeBarActionItem.id };
    }, {
      onDragOver: (e) => {
        const isValidMove = e.dragAndDropData.getData().id !== this.compositeBarActionItem.id && this.dndHandler.onDragOver(e.dragAndDropData, this.compositeBarActionItem.id, e.eventData);
        toggleDropEffect(e.eventData.dataTransfer, "move", isValidMove);
        insertDropBefore = this.updateFromDragging(container, isValidMove, e.eventData);
      },
      onDragLeave: (e) => {
        insertDropBefore = this.updateFromDragging(container, false, e.eventData);
      },
      onDragEnd: (e) => {
        insertDropBefore = this.updateFromDragging(container, false, e.eventData);
      },
      onDrop: (e) => {
        EventHelper.stop(e.eventData, true);
        this.dndHandler.drop(e.dragAndDropData, this.compositeBarActionItem.id, e.eventData, insertDropBefore);
        insertDropBefore = this.updateFromDragging(container, false, e.eventData);
      },
      onDragStart: (e) => {
        if (e.dragAndDropData.getData().id !== this.compositeBarActionItem.id) {
          return;
        }
        if (e.eventData.dataTransfer) {
          e.eventData.dataTransfer.effectAllowed = "move";
        }
        this.blur();
      }
    }));
    [this.badge, this.label].forEach((element) => this._register(new DelayedDragHandler(element, () => {
      if (!this.action.checked) {
        this.action.run();
      }
    })));
    this.updateStyles();
  }
  updateFromDragging(element, showFeedback, event) {
    const rect = element.getBoundingClientRect();
    const posX = event.clientX;
    const posY = event.clientY;
    const height = rect.bottom - rect.top;
    const width = rect.right - rect.left;
    const forceTop = posY <= rect.top + height * 0.4;
    const forceBottom = posY > rect.bottom - height * 0.4;
    const preferTop = posY <= rect.top + height * 0.5;
    const forceLeft = posX <= rect.left + width * 0.4;
    const forceRight = posX > rect.right - width * 0.4;
    const preferLeft = posX <= rect.left + width * 0.5;
    const classes = element.classList;
    const lastClasses = {
      vertical: classes.contains("top") ? "top" : classes.contains("bottom") ? "bottom" : void 0,
      horizontal: classes.contains("left") ? "left" : classes.contains("right") ? "right" : void 0
    };
    const top = forceTop || preferTop && !lastClasses.vertical || !forceBottom && lastClasses.vertical === "top";
    const bottom = forceBottom || !preferTop && !lastClasses.vertical || !forceTop && lastClasses.vertical === "bottom";
    const left = forceLeft || preferLeft && !lastClasses.horizontal || !forceRight && lastClasses.horizontal === "left";
    const right = forceRight || !preferLeft && !lastClasses.horizontal || !forceLeft && lastClasses.horizontal === "right";
    element.classList.toggle("top", showFeedback && top);
    element.classList.toggle("bottom", showFeedback && bottom);
    element.classList.toggle("left", showFeedback && left);
    element.classList.toggle("right", showFeedback && right);
    if (!showFeedback) {
      return void 0;
    }
    return { verticallyBefore: top, horizontallyBefore: left };
  }
  showContextMenu(container) {
    const actions = [];
    if (this.compositeBarActionItem.keybindingId) {
      actions.push(createConfigureKeybindingAction(this.commandService, this.keybindingService, this.compositeBarActionItem.keybindingId));
    }
    actions.push(this.toggleCompositePinnedAction, this.toggleCompositeBadgeAction);
    const compositeContextMenuActions = this.compositeContextMenuActionsProvider(this.compositeBarActionItem.id);
    if (compositeContextMenuActions.length) {
      actions.push(...compositeContextMenuActions);
    }
    const isPinned = this.compositeBar.isPinned(this.compositeBarActionItem.id);
    if (isPinned) {
      this.toggleCompositePinnedAction.label = localize("hide", "Hide '{0}'", this.compositeBarActionItem.name);
      this.toggleCompositePinnedAction.checked = false;
      this.toggleCompositePinnedAction.enabled = this.compositeBar.getPinnedCompositeIds().length > 1;
    } else {
      this.toggleCompositePinnedAction.label = localize("keep", "Keep '{0}'", this.compositeBarActionItem.name);
      this.toggleCompositePinnedAction.enabled = true;
    }
    const isBadgeEnabled = this.compositeBar.areBadgesEnabled(this.compositeBarActionItem.id);
    if (isBadgeEnabled) {
      this.toggleCompositeBadgeAction.label = localize("hideBadge", "Hide Badge");
    } else {
      this.toggleCompositeBadgeAction.label = localize("showBadge", "Show Badge");
    }
    const otherActions = this.contextMenuActionsProvider();
    if (otherActions.length) {
      actions.push(new Separator());
      actions.push(...otherActions);
    }
    const elementPosition = getDomNodePagePosition(container);
    const anchor = {
      x: Math.floor(elementPosition.left + elementPosition.width / 2),
      y: elementPosition.top + elementPosition.height
    };
    this.contextMenuService.showContextMenu({
      getAnchor: () => anchor,
      getActions: () => actions,
      getActionsContext: () => this.compositeBarActionItem.id
    });
  }
  updateChecked() {
    if (this.action.checked) {
      this.container.classList.add("checked");
      this.container.setAttribute("aria-label", this.getTooltip() ?? this.container.title);
      this.container.setAttribute("aria-expanded", "true");
      this.container.setAttribute("aria-selected", "true");
    } else {
      this.container.classList.remove("checked");
      this.container.setAttribute("aria-label", this.getTooltip() ?? this.container.title);
      this.container.setAttribute("aria-expanded", "false");
      this.container.setAttribute("aria-selected", "false");
    }
    this.updateStyles();
  }
  updateEnabled() {
    if (!this.element) {
      return;
    }
    if (this.action.enabled) {
      this.element.classList.remove("disabled");
    } else {
      this.element.classList.add("disabled");
    }
  }
  dispose() {
    super.dispose();
    this.label.remove();
  }
};
CompositeActionViewItem = __decorateClass([
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IThemeService),
  __decorateParam(12, IHoverService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, ICommandService)
], CompositeActionViewItem);
class ToggleCompositePinnedAction extends Action {
  constructor(activity, compositeBar) {
    super("show.toggleCompositePinned", activity ? activity.name : localize("toggle", "Toggle View Pinned"));
    this.activity = activity;
    this.compositeBar = compositeBar;
    this.checked = !!this.activity && this.compositeBar.isPinned(this.activity.id);
  }
  async run(context) {
    const id = this.activity ? this.activity.id : context;
    if (this.compositeBar.isPinned(id)) {
      this.compositeBar.unpin(id);
    } else {
      this.compositeBar.pin(id);
    }
  }
}
class ToggleCompositeBadgeAction extends Action {
  constructor(compositeBarActionItem, compositeBar) {
    super("show.toggleCompositeBadge", compositeBarActionItem ? compositeBarActionItem.name : localize("toggleBadge", "Toggle View Badge"));
    this.compositeBarActionItem = compositeBarActionItem;
    this.compositeBar = compositeBar;
    this.checked = false;
  }
  async run(context) {
    const id = this.compositeBarActionItem ? this.compositeBarActionItem.id : context;
    this.compositeBar.toggleBadgeEnablement(id);
  }
}
class SwitchCompositeViewAction extends Action2 {
  constructor(desc, location, offset) {
    super(desc);
    this.location = location;
    this.offset = offset;
  }
  async run(accessor) {
    const paneCompositeService = accessor.get(IPaneCompositePartService);
    const activeComposite = paneCompositeService.getActivePaneComposite(this.location);
    if (!activeComposite) {
      return;
    }
    let targetCompositeId;
    const visibleCompositeIds = paneCompositeService.getVisiblePaneCompositeIds(this.location);
    for (let i = 0; i < visibleCompositeIds.length; i++) {
      if (visibleCompositeIds[i] === activeComposite.getId()) {
        targetCompositeId = visibleCompositeIds[(i + visibleCompositeIds.length + this.offset) % visibleCompositeIds.length];
        break;
      }
    }
    if (typeof targetCompositeId !== "undefined") {
      await paneCompositeService.openPaneComposite(targetCompositeId, this.location, true);
    }
  }
}
export {
  CompositeActionViewItem,
  CompositeBarAction,
  CompositeBarActionViewItem,
  CompositeOverflowActivityAction,
  CompositeOverflowActivityActionViewItem,
  SwitchCompositeViewAction,
  ToggleCompositeBadgeAction,
  ToggleCompositePinnedAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2NvbXBvc2l0ZUJhckFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhcHBlbmQsIGNsZWFyTm9kZSwgRXZlbnRIZWxwZXIsIEV2ZW50VHlwZSwgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiwgaGlkZSwgc2hvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBJQ29sb3JUaGVtZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVtYmVyQmFkZ2UsIElCYWRnZSwgSUFjdGl2aXR5LCBQcm9ncmVzc0JhZGdlLCBJY29uQmFkZ2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBEZWxheWVkRHJhZ0hhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyLCBJQ29tcG9zaXRlRHJhZ0FuZERyb3AsIEJlZm9yZTJELCB0b2dnbGVEcm9wRWZmZWN0IH0gZnJvbSAnLi4vZG5kLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGJhZGdlQmFja2dyb3VuZCwgYmFkZ2VGb3JlZ3JvdW5kLCBjb250cmFzdEJvcmRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb25maWd1cmVLZXliaW5kaW5nQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vbWVudVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2l0ZUJhciB7XG5cblx0LyoqXG5cdCAqIFVucGlucyBhIGNvbXBvc2l0ZSBmcm9tIHRoZSBjb21wb3NpdGUgYmFyLlxuXHQgKi9cblx0dW5waW4oY29tcG9zaXRlSWQ6IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFBpbiBhIGNvbXBvc2l0ZSBpbnNpZGUgdGhlIGNvbXBvc2l0ZSBiYXIuXG5cdCAqL1xuXHRwaW4oY29tcG9zaXRlSWQ6IHN0cmluZyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEZpbmQgb3V0IGlmIGEgY29tcG9zaXRlIGlzIHBpbm5lZCBpbiB0aGUgY29tcG9zaXRlIGJhci5cblx0ICovXG5cdGlzUGlubmVkKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBHZXQgcGlubmVkIGNvbXBvc2l0ZSBpZHMgaW4gdGhlIGNvbXBvc2l0ZSBiYXIuXG5cdCAqL1xuXHRnZXRQaW5uZWRDb21wb3NpdGVJZHMoKTogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFJldHVybnMgaWYgYmFkZ2VzIGFyZSBlbmFibGVkIGZvciB0aGF0IHNwZWNpZmllZCBjb21wb3NpdGUuXG5cdCAqIEBwYXJhbSBjb21wb3NpdGVJZCBUaGUgaWQgb2YgdGhlIGNvbXBvc2l0ZSB0byBjaGVja1xuXHQgKi9cblx0YXJlQmFkZ2VzRW5hYmxlZChjb21wb3NpdGVJZDogc3RyaW5nKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogVG9nZ2xlcyB3aGV0aGVyIG9yIG5vdCBiYWRnZXMgYXJlIHNob3duIG9uIHRoYXQgcGFydGljdWxhciBjb21wb3NpdGUuXG5cdCAqIEBwYXJhbSBjb21wb3NpdGVJZCBUaGUgY29tcG9zaXRlIHRvIHRvZ2dsZSBiYWRnZSBlbmFibGVtZW50IGZvclxuXHQgKi9cblx0dG9nZ2xlQmFkZ2VFbmFibGVtZW50KGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZW9yZGVyIGNvbXBvc2l0ZSBvcmRlcmluZyBieSBtb3ZpbmcgYSBjb21wb3NpdGUgdG8gdGhlIGxvY2F0aW9uIG9mIGFub3RoZXIgY29tcG9zaXRlLlxuXHQgKi9cblx0bW92ZShjb21wb3NpdGVJZDogc3RyaW5nLCB0b2NvbXBvc2l0ZUlkOiBzdHJpbmcpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NpdGVCYXJBY3Rpb25JdGVtIHtcblx0aWQ6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHRrZXliaW5kaW5nSWQ/OiBzdHJpbmc7XG5cdGNsYXNzTmFtZXM/OiBzdHJpbmdbXTtcblx0aWNvblVybD86IFVSSTtcbn1cblxuZXhwb3J0IGNsYXNzIENvbXBvc2l0ZUJhckFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb21wb3NpdGVCYXJBY3Rpb25JdGVtID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29tcG9zaXRlQmFyQWN0aW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb21wb3NpdGVCYXJBY3Rpb25JdGVtID0gdGhpcy5fb25EaWRDaGFuZ2VDb21wb3NpdGVCYXJBY3Rpb25JdGVtLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWN0aXZpdHlbXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZpdHkgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2aXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgX2FjdGl2aXRpZXM6IElBY3Rpdml0eVtdID0gW107XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBpdGVtOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSkge1xuXHRcdHN1cGVyKGl0ZW0uaWQsIGl0ZW0ubmFtZSwgaXRlbS5jbGFzc05hbWVzPy5qb2luKCcgJyksIHRydWUpO1xuXHR9XG5cblx0Z2V0IGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0oKTogSUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ge1xuXHRcdHJldHVybiB0aGlzLml0ZW07XG5cdH1cblxuXHRzZXQgY29tcG9zaXRlQmFyQWN0aW9uSXRlbShpdGVtOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSkge1xuXHRcdHRoaXMuX2xhYmVsID0gaXRlbS5uYW1lO1xuXHRcdHRoaXMuaXRlbSA9IGl0ZW07XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb21wb3NpdGVCYXJBY3Rpb25JdGVtLmZpcmUodGhpcyk7XG5cdH1cblxuXHRnZXQgYWN0aXZpdGllcygpOiBJQWN0aXZpdHlbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2aXRpZXM7XG5cdH1cblxuXHRzZXQgYWN0aXZpdGllcyhhY3Rpdml0aWVzOiBJQWN0aXZpdHlbXSkge1xuXHRcdHRoaXMuX2FjdGl2aXRpZXMgPSBhY3Rpdml0aWVzO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZpdHkuZmlyZShhY3Rpdml0aWVzKTtcblx0fVxuXG5cdGFjdGl2YXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jaGVja2VkKSB7XG5cdFx0XHR0aGlzLl9zZXRDaGVja2VkKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGRlYWN0aXZhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2hlY2tlZCkge1xuXHRcdFx0dGhpcy5fc2V0Q2hlY2tlZChmYWxzZSk7XG5cdFx0fVxuXHR9XG5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9zaXRlQmFyQ29sb3JzIHtcblx0cmVhZG9ubHkgYWN0aXZlQmFja2dyb3VuZENvbG9yPzogQ29sb3I7XG5cdHJlYWRvbmx5IGluYWN0aXZlQmFja2dyb3VuZENvbG9yPzogQ29sb3I7XG5cdHJlYWRvbmx5IGFjdGl2ZUJvcmRlckNvbG9yPzogQ29sb3I7XG5cdHJlYWRvbmx5IGFjdGl2ZUJhY2tncm91bmQ/OiBDb2xvcjtcblx0cmVhZG9ubHkgYWN0aXZlQm9yZGVyQm90dG9tQ29sb3I/OiBDb2xvcjtcblx0cmVhZG9ubHkgYWN0aXZlRm9yZWdyb3VuZENvbG9yPzogQ29sb3I7XG5cdHJlYWRvbmx5IGluYWN0aXZlRm9yZWdyb3VuZENvbG9yPzogQ29sb3I7XG5cdHJlYWRvbmx5IGJhZGdlQmFja2dyb3VuZD86IENvbG9yO1xuXHRyZWFkb25seSBiYWRnZUZvcmVncm91bmQ/OiBDb2xvcjtcblx0cmVhZG9ubHkgZHJhZ0FuZERyb3BCb3JkZXI/OiBDb2xvcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aXZpdHlIb3Zlck9wdGlvbnMge1xuXHRyZWFkb25seSBwb3NpdGlvbjogKCkgPT4gSG92ZXJQb3NpdGlvbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9zaXRlQmFyQWN0aW9uVmlld0l0ZW1PcHRpb25zIGV4dGVuZHMgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGljb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBjb2xvcnM6ICh0aGVtZTogSUNvbG9yVGhlbWUpID0+IElDb21wb3NpdGVCYXJDb2xvcnM7XG5cblx0cmVhZG9ubHkgaG92ZXJPcHRpb25zOiBJQWN0aXZpdHlIb3Zlck9wdGlvbnM7XG5cdHJlYWRvbmx5IGhhc1BvcHVwPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29tcGFjdD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJvdGVjdGVkIGNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcm90ZWN0ZWQgbGFiZWwhOiBIVE1MRWxlbWVudDtcblx0cHJvdGVjdGVkIGJhZGdlITogSFRNTEVsZW1lbnQ7XG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBvcHRpb25zOiBJQ29tcG9zaXRlQmFyQWN0aW9uVmlld0l0ZW1PcHRpb25zO1xuXG5cdHByaXZhdGUgYmFkZ2VDb250ZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBiYWRnZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBtb3VzZVVwVGltZW91dDogVGltZW91dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBrZXliaW5kaW5nTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBDb21wb3NpdGVCYXJBY3Rpb24sXG5cdFx0b3B0aW9uczogSUNvbXBvc2l0ZUJhckFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJhZGdlc0VuYWJsZWQ6IChjb21wb3NpdGVJZDogc3RyaW5nKSA9PiBib29sZWFuLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIG9wdGlvbnMpO1xuXG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSh0aGlzLm9uVGhlbWVDaGFuZ2UsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb24ub25EaWRDaGFuZ2VDb21wb3NpdGVCYXJBY3Rpb25JdGVtKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIoa2V5YmluZGluZ1NlcnZpY2Uub25EaWRVcGRhdGVLZXliaW5kaW5ncywgKCkgPT4gdGhpcy5rZXliaW5kaW5nTGFiZWwgIT09IHRoaXMuY29tcHV0ZUtleWJpbmRpbmdMYWJlbCgpKSgoKSA9PiB0aGlzLnVwZGF0ZVRpdGxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb24ub25EaWRDaGFuZ2VBY3Rpdml0eSgoKSA9PiB0aGlzLnVwZGF0ZUFjdGl2aXR5KCkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgY29tcG9zaXRlQmFyQWN0aW9uSXRlbSgpOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSB7XG5cdFx0cmV0dXJuICh0aGlzLl9hY3Rpb24gYXMgQ29tcG9zaXRlQmFyQWN0aW9uKS5jb21wb3NpdGVCYXJBY3Rpb25JdGVtO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRjb25zdCB0aGVtZSA9IHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBjb2xvcnMgPSB0aGlzLm9wdGlvbnMuY29sb3JzKHRoZW1lKTtcblxuXHRcdGlmICh0aGlzLmxhYmVsKSB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmljb24pIHtcblx0XHRcdFx0Y29uc3QgZm9yZWdyb3VuZCA9IHRoaXMuX2FjdGlvbi5jaGVja2VkID8gY29sb3JzLmFjdGl2ZUZvcmVncm91bmRDb2xvciA6IGNvbG9ycy5pbmFjdGl2ZUZvcmVncm91bmRDb2xvcjtcblx0XHRcdFx0aWYgKHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pY29uVXJsKSB7XG5cdFx0XHRcdFx0Ly8gQXBwbHkgYmFja2dyb3VuZCBjb2xvciB0byBhY3Rpdml0eSBiYXIgaXRlbSBwcm92aWRlZCB3aXRoIGljb25VcmxzXG5cdFx0XHRcdFx0dGhpcy5sYWJlbC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBmb3JlZ3JvdW5kID8gZm9yZWdyb3VuZC50b1N0cmluZygpIDogJyc7XG5cdFx0XHRcdFx0dGhpcy5sYWJlbC5zdHlsZS5jb2xvciA9ICcnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEFwcGx5IGZvcmVncm91bmQgY29sb3IgdG8gYWN0aXZpdHkgYmFyIGl0ZW1zIHByb3ZpZGVkIHdpdGggY29kaWNvbnNcblx0XHRcdFx0XHR0aGlzLmxhYmVsLnN0eWxlLmNvbG9yID0gZm9yZWdyb3VuZCA/IGZvcmVncm91bmQudG9TdHJpbmcoKSA6ICcnO1xuXHRcdFx0XHRcdHRoaXMubGFiZWwuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gJyc7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZvcmVncm91bmQgPSB0aGlzLl9hY3Rpb24uY2hlY2tlZCA/IGNvbG9ycy5hY3RpdmVGb3JlZ3JvdW5kQ29sb3IgOiBjb2xvcnMuaW5hY3RpdmVGb3JlZ3JvdW5kQ29sb3I7XG5cdFx0XHRcdGNvbnN0IGJvcmRlckJvdHRvbUNvbG9yID0gdGhpcy5fYWN0aW9uLmNoZWNrZWQgPyBjb2xvcnMuYWN0aXZlQm9yZGVyQm90dG9tQ29sb3IgOiBudWxsO1xuXHRcdFx0XHR0aGlzLmxhYmVsLnN0eWxlLmNvbG9yID0gZm9yZWdyb3VuZCA/IGZvcmVncm91bmQudG9TdHJpbmcoKSA6ICcnO1xuXHRcdFx0XHR0aGlzLmxhYmVsLnN0eWxlLmJvcmRlckJvdHRvbUNvbG9yID0gYm9yZGVyQm90dG9tQ29sb3IgPyBib3JkZXJCb3R0b21Db2xvci50b1N0cmluZygpIDogJyc7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLWluc2VydC1ib3JkZXItY29sb3InLCBjb2xvcnMuZHJhZ0FuZERyb3BCb3JkZXIgPyBjb2xvcnMuZHJhZ0FuZERyb3BCb3JkZXIudG9TdHJpbmcoKSA6ICcnKTtcblx0XHR9XG5cblx0XHQvLyBCYWRnZVxuXHRcdGlmICh0aGlzLmJhZGdlQ29udGVudCkge1xuXHRcdFx0Y29uc3QgYmFkZ2VTdHlsZXMgPSB0aGlzLmdldEFjdGl2aXRpZXMoKVswXT8uYmFkZ2UuZ2V0Q29sb3JzKHRoZW1lKTtcblx0XHRcdGNvbnN0IGJhZGdlRmcgPSBiYWRnZVN0eWxlcz8uYmFkZ2VGb3JlZ3JvdW5kID8/IGNvbG9ycy5iYWRnZUZvcmVncm91bmQgPz8gdGhlbWUuZ2V0Q29sb3IoYmFkZ2VGb3JlZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGJhZGdlQmcgPSBiYWRnZVN0eWxlcz8uYmFkZ2VCYWNrZ3JvdW5kID8/IGNvbG9ycy5iYWRnZUJhY2tncm91bmQgPz8gdGhlbWUuZ2V0Q29sb3IoYmFkZ2VCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGNvbnRyYXN0Qm9yZGVyQ29sb3IgPSBiYWRnZVN0eWxlcz8uYmFkZ2VCb3JkZXIgPz8gdGhlbWUuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXG5cdFx0XHR0aGlzLmJhZGdlQ29udGVudC5zdHlsZS5jb2xvciA9IGJhZGdlRmcgPyBiYWRnZUZnLnRvU3RyaW5nKCkgOiAnJztcblx0XHRcdHRoaXMuYmFkZ2VDb250ZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJhZGdlQmcgPyBiYWRnZUJnLnRvU3RyaW5nKCkgOiAnJztcblxuXHRcdFx0dGhpcy5iYWRnZUNvbnRlbnQuc3R5bGUuYm9yZGVyU3R5bGUgPSBjb250cmFzdEJvcmRlckNvbG9yICYmICF0aGlzLm9wdGlvbnMuY29tcGFjdCA/ICdzb2xpZCcgOiAnJztcblx0XHRcdHRoaXMuYmFkZ2VDb250ZW50LnN0eWxlLmJvcmRlcldpZHRoID0gY29udHJhc3RCb3JkZXJDb2xvciA/ICcxcHgnIDogJyc7XG5cdFx0XHR0aGlzLmJhZGdlQ29udGVudC5zdHlsZS5ib3JkZXJDb2xvciA9IGNvbnRyYXN0Qm9yZGVyQ29sb3IgPyBjb250cmFzdEJvcmRlckNvbG9yLnRvU3RyaW5nKCkgOiAnJztcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0dGhpcy5jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5pY29uKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdpY29uJyk7XG5cdFx0fVxuXG5cdFx0Ly8gVXNlICd0YWInIGluc2lkZSB0YWJsaXN0LCAnYnV0dG9uJyBmb3IgcG9wdXAgaXRlbXMgb3V0c2lkZSB0YWJsaXN0XG5cdFx0Y29uc3Qgcm9sZSA9IHRoaXMub3B0aW9ucy5pc1RhYkxpc3QgfHwgIXRoaXMub3B0aW9ucy5oYXNQb3B1cCA/ICd0YWInIDogJ2J1dHRvbic7XG5cdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgcm9sZSk7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5oYXNQb3B1cCkge1xuXHRcdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcblx0XHR9XG5cblx0XHQvLyBUcnkgaGFyZCB0byBwcmV2ZW50IGtleWJvYXJkIG9ubHkgZm9jdXMgZmVlZGJhY2sgd2hlbiB1c2luZyBtb3VzZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX0RPV04sICgpID0+IHtcblx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NsaWNrZWQnKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9VUCwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMubW91c2VVcFRpbWVvdXQpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMubW91c2VVcFRpbWVvdXQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm1vdXNlVXBUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NsaWNrZWQnKTtcblx0XHRcdH0sIDgwMCk7IC8vIGRlbGF5ZWQgdG8gcHJldmVudCBmb2N1cyBmZWVkYmFjayBmcm9tIHNob3dpbmcgb24gbW91c2UgdXBcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmNvbnRhaW5lciwgKCkgPT4gKHtcblx0XHRcdGNvbnRlbnQ6IHRoaXMuY29tcHV0ZVRpdGxlKCksXG5cdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0aG92ZXJQb3NpdGlvbjogdGhpcy5vcHRpb25zLmhvdmVyT3B0aW9ucy5wb3NpdGlvbigpLFxuXHRcdFx0fSxcblx0XHRcdHBlcnNpc3RlbmNlOiB7XG5cdFx0XHRcdGhpZGVPbktleURvd246IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pLCB7IGdyb3VwSWQ6ICdjb21wb3NpdGUtYmFyLWFjdGlvbnMnIH0pKTtcblxuXHRcdC8vIExhYmVsXG5cdFx0dGhpcy5sYWJlbCA9IGFwcGVuZChjb250YWluZXIsICQoJ2EnKSk7XG5cblx0XHQvLyBCYWRnZVxuXHRcdHRoaXMuYmFkZ2UgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuYmFkZ2UnKSk7XG5cdFx0dGhpcy5iYWRnZUNvbnRlbnQgPSBhcHBlbmQodGhpcy5iYWRnZSwgJCgnLmJhZGdlLWNvbnRlbnQnKSk7XG5cblx0XHQvLyBwYW5lIGNvbXBvc2l0ZSBiYXIgYWN0aXZlIGJvcmRlciArIGJhY2tncm91bmRcblx0XHRhcHBlbmQoY29udGFpbmVyLCAkKCcuYWN0aXZlLWl0ZW0taW5kaWNhdG9yJykpO1xuXG5cdFx0aGlkZSh0aGlzLmJhZGdlKTtcblxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0XHR0aGlzLnVwZGF0ZVRpdGxlKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uVGhlbWVDaGFuZ2UodGhlbWU6IElDb2xvclRoZW1lKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHRcdHRoaXMudXBkYXRlQWN0aXZpdHkoKTtcblx0XHR0aGlzLnVwZGF0ZVRpdGxlKCk7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZpdGllcygpOiBJQWN0aXZpdHlbXSB7XG5cdFx0aWYgKHRoaXMuX2FjdGlvbiBpbnN0YW5jZW9mIENvbXBvc2l0ZUJhckFjdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2FjdGlvbi5hY3Rpdml0aWVzO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlQWN0aXZpdHkoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmJhZGdlIHx8ICF0aGlzLmJhZGdlQ29udGVudCB8fCAhKHRoaXMuX2FjdGlvbiBpbnN0YW5jZW9mIENvbXBvc2l0ZUJhckFjdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGJhZGdlcywgdHlwZSB9ID0gdGhpcy5nZXRWaXNpYmxlQmFkZ2VzKHRoaXMuZ2V0QWN0aXZpdGllcygpKTtcblxuXHRcdHRoaXMuYmFkZ2VEaXNwb3NhYmxlLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y2xlYXJOb2RlKHRoaXMuYmFkZ2VDb250ZW50KTtcblx0XHRoaWRlKHRoaXMuYmFkZ2UpO1xuXG5cdFx0Y29uc3Qgc2hvdWxkUmVuZGVyQmFkZ2VzID0gdGhpcy5iYWRnZXNFbmFibGVkKHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCk7XG5cblx0XHRpZiAoYmFkZ2VzLmxlbmd0aCA+IDAgJiYgc2hvdWxkUmVuZGVyQmFkZ2VzKSB7XG5cblx0XHRcdGNvbnN0IGNsYXNzZXM6IHN0cmluZ1tdID0gW107XG5cblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuY29tcGFjdCkge1xuXHRcdFx0XHRjbGFzc2VzLnB1c2goJ2NvbXBhY3QnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJvZ3Jlc3Ncblx0XHRcdGlmICh0eXBlID09PSAncHJvZ3Jlc3MnKSB7XG5cdFx0XHRcdHNob3codGhpcy5iYWRnZSk7XG5cdFx0XHRcdGNsYXNzZXMucHVzaCgncHJvZ3Jlc3MtYmFkZ2UnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTnVtYmVyXG5cdFx0XHRlbHNlIGlmICh0eXBlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRjb25zdCB0b3RhbCA9IGJhZGdlcy5yZWR1Y2UoKHIsIGIpID0+IHIgKyAoYiBpbnN0YW5jZW9mIE51bWJlckJhZGdlID8gYi5udW1iZXIgOiAwKSwgMCk7XG5cdFx0XHRcdGlmICh0b3RhbCA+IDApIHtcblx0XHRcdFx0XHRsZXQgYmFkZ2VOdW1iZXIgPSB0b3RhbC50b1N0cmluZygpO1xuXHRcdFx0XHRcdGlmICh0b3RhbCA+IDk5OSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgbm9PZlRob3VzYW5kcyA9IHRvdGFsIC8gMTAwMDtcblx0XHRcdFx0XHRcdGNvbnN0IGZsb29yID0gTWF0aC5mbG9vcihub09mVGhvdXNhbmRzKTtcblx0XHRcdFx0XHRcdGJhZGdlTnVtYmVyID0gbm9PZlRob3VzYW5kcyA+IGZsb29yID8gYCR7Zmxvb3J9SytgIDogYCR7bm9PZlRob3VzYW5kc31LYDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5jb21wYWN0ICYmIGJhZGdlTnVtYmVyLmxlbmd0aCA+PSAzKSB7XG5cdFx0XHRcdFx0XHRjbGFzc2VzLnB1c2goJ2NvbXBhY3QtY29udGVudCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmJhZGdlQ29udGVudC50ZXh0Q29udGVudCA9IGJhZGdlTnVtYmVyO1xuXHRcdFx0XHRcdHNob3codGhpcy5iYWRnZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSWNvblxuXHRcdFx0ZWxzZSBpZiAodHlwZSA9PT0gJ2ljb24nKSB7XG5cdFx0XHRcdGNsYXNzZXMucHVzaCgnaWNvbi1iYWRnZScpO1xuXHRcdFx0XHRjb25zdCBiYWRnZUNvbnRlbnRDbGFzc2VzcyA9IFsnaWNvbi1vdmVybGF5JywgLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoKGJhZGdlc1swXSBhcyBJY29uQmFkZ2UpLmljb24pXTtcblx0XHRcdFx0dGhpcy5iYWRnZUNvbnRlbnQuY2xhc3NMaXN0LmFkZCguLi5iYWRnZUNvbnRlbnRDbGFzc2Vzcyk7XG5cdFx0XHRcdHRoaXMuYmFkZ2VEaXNwb3NhYmxlLnZhbHVlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5iYWRnZUNvbnRlbnQ/LmNsYXNzTGlzdC5yZW1vdmUoLi4uYmFkZ2VDb250ZW50Q2xhc3Nlc3MpKSk7XG5cdFx0XHRcdHNob3codGhpcy5iYWRnZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjbGFzc2VzLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmJhZGdlLmNsYXNzTGlzdC5hZGQoLi4uY2xhc3Nlcyk7XG5cdFx0XHRcdHRoaXMuYmFkZ2VEaXNwb3NhYmxlLnZhbHVlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5iYWRnZS5jbGFzc0xpc3QucmVtb3ZlKC4uLmNsYXNzZXMpKSk7XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVRpdGxlKCk7XG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VmlzaWJsZUJhZGdlcyhhY3Rpdml0aWVzOiBJQWN0aXZpdHlbXSk6IHsgYmFkZ2VzOiBJQmFkZ2VbXTsgdHlwZTogJ3Byb2dyZXNzJyB8ICdpY29uJyB8ICdudW1iZXInIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IHByb2dyZXNzQmFkZ2VzID0gYWN0aXZpdGllcy5maWx0ZXIoYWN0aXZpdHkgPT4gYWN0aXZpdHkuYmFkZ2UgaW5zdGFuY2VvZiBQcm9ncmVzc0JhZGdlKS5tYXAoYWN0aXZpdHkgPT4gYWN0aXZpdHkuYmFkZ2UpO1xuXHRcdGlmIChwcm9ncmVzc0JhZGdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4geyBiYWRnZXM6IHByb2dyZXNzQmFkZ2VzLCB0eXBlOiAncHJvZ3Jlc3MnIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWNvbkJhZGdlcyA9IGFjdGl2aXRpZXMuZmlsdGVyKGFjdGl2aXR5ID0+IGFjdGl2aXR5LmJhZGdlIGluc3RhbmNlb2YgSWNvbkJhZGdlKS5tYXAoYWN0aXZpdHkgPT4gYWN0aXZpdHkuYmFkZ2UpO1xuXHRcdGlmIChpY29uQmFkZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB7IGJhZGdlczogaWNvbkJhZGdlcywgdHlwZTogJ2ljb24nIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbnVtYmVyQmFkZ2VzID0gYWN0aXZpdGllcy5maWx0ZXIoYWN0aXZpdHkgPT4gYWN0aXZpdHkuYmFkZ2UgaW5zdGFuY2VvZiBOdW1iZXJCYWRnZSkubWFwKGFjdGl2aXR5ID0+IGFjdGl2aXR5LmJhZGdlKTtcblx0XHRpZiAobnVtYmVyQmFkZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB7IGJhZGdlczogbnVtYmVyQmFkZ2VzLCB0eXBlOiAnbnVtYmVyJyB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGJhZGdlczogW10sIHR5cGU6IHVuZGVmaW5lZCB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUxhYmVsKCk6IHZvaWQge1xuXHRcdHRoaXMubGFiZWwuY2xhc3NOYW1lID0gJ2FjdGlvbi1sYWJlbCc7XG5cblx0XHRpZiAodGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmNsYXNzTmFtZXMpIHtcblx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LmFkZCguLi50aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uY2xhc3NOYW1lcyk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLm9wdGlvbnMuaWNvbikge1xuXHRcdFx0dGhpcy5sYWJlbC50ZXh0Q29udGVudCA9IHRoaXMuYWN0aW9uLmxhYmVsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGl0bGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLmNvbXB1dGVUaXRsZSgpO1xuXHRcdFt0aGlzLmxhYmVsLCB0aGlzLmJhZGdlLCB0aGlzLmNvbnRhaW5lcl0uZm9yRWFjaChlbGVtZW50ID0+IHtcblx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdGVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuXHRcdFx0XHRlbGVtZW50LnNldEF0dHJpYnV0ZSgndGl0bGUnLCAnJyk7XG5cdFx0XHRcdGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCd0aXRsZScpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbXB1dGVUaXRsZSgpOiBzdHJpbmcge1xuXHRcdHRoaXMua2V5YmluZGluZ0xhYmVsID0gdGhpcy5jb21wdXRlS2V5YmluZGluZ0xhYmVsKCk7XG5cdFx0bGV0IHRpdGxlID0gdGhpcy5rZXliaW5kaW5nTGFiZWwgPyBsb2NhbGl6ZSgndGl0bGVLZXliaW5kaW5nJywgXCJ7MH0gKHsxfSlcIiwgdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLm5hbWUsIHRoaXMua2V5YmluZGluZ0xhYmVsKSA6IHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5uYW1lO1xuXG5cdFx0Y29uc3QgYmFkZ2VzID0gdGhpcy5nZXRWaXNpYmxlQmFkZ2VzKCh0aGlzLmFjdGlvbiBhcyBDb21wb3NpdGVCYXJBY3Rpb24pLmFjdGl2aXRpZXMpLmJhZGdlcztcblx0XHRmb3IgKGNvbnN0IGJhZGdlIG9mIGJhZGdlcykge1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBiYWRnZS5nZXREZXNjcmlwdGlvbigpO1xuXHRcdFx0aWYgKCFkZXNjcmlwdGlvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRpdGxlID0gYCR7dGl0bGV9IC0gJHtiYWRnZS5nZXREZXNjcmlwdGlvbigpfWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRpdGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlS2V5YmluZGluZ0xhYmVsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGwge1xuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ua2V5YmluZGluZ0lkID8gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5rZXliaW5kaW5nSWQpIDogbnVsbDtcblxuXHRcdHJldHVybiBrZXliaW5kaW5nPy5nZXRMYWJlbCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHRpZiAodGhpcy5tb3VzZVVwVGltZW91dCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMubW91c2VVcFRpbWVvdXQpO1xuXHRcdH1cblxuXHRcdHRoaXMuYmFkZ2UucmVtb3ZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbXBvc2l0ZU92ZXJmbG93QWN0aXZpdHlBY3Rpb24gZXh0ZW5kcyBDb21wb3NpdGVCYXJBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgc2hvd01lbnU6ICgpID0+IHZvaWRcblx0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdhZGRpdGlvbmFsQ29tcG9zaXRlcy5hY3Rpb24nLFxuXHRcdFx0bmFtZTogbG9jYWxpemUoJ2FkZGl0aW9uYWxWaWV3cycsIFwiQWRkaXRpb25hbCBWaWV3c1wiKSxcblx0XHRcdGNsYXNzTmFtZXM6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubW9yZSlcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNob3dNZW51KCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbXBvc2l0ZU92ZXJmbG93QWN0aXZpdHlBY3Rpb25WaWV3SXRlbSBleHRlbmRzIENvbXBvc2l0ZUJhckFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IENvbXBvc2l0ZUJhckFjdGlvbixcblx0XHRwcml2YXRlIGdldE92ZXJmbG93aW5nQ29tcG9zaXRlczogKCkgPT4geyBpZDogc3RyaW5nOyBuYW1lPzogc3RyaW5nIH1bXSxcblx0XHRwcml2YXRlIGdldEFjdGl2ZUNvbXBvc2l0ZUlkOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBnZXRCYWRnZTogKGNvbXBvc2l0ZUlkOiBzdHJpbmcpID0+IElCYWRnZSxcblx0XHRwcml2YXRlIGdldENvbXBvc2l0ZU9wZW5BY3Rpb246IChjb21wb3NpdGVJZDogc3RyaW5nKSA9PiBJQWN0aW9uLFxuXHRcdGNvbG9yczogKHRoZW1lOiBJQ29sb3JUaGVtZSkgPT4gSUNvbXBvc2l0ZUJhckNvbG9ycyxcblx0XHRob3Zlck9wdGlvbnM6IElBY3Rpdml0eUhvdmVyT3B0aW9ucyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGFjdGlvbiwgeyBpY29uOiB0cnVlLCBjb2xvcnMsIGhhc1BvcHVwOiB0cnVlLCBob3Zlck9wdGlvbnMsIGlzVGFiTGlzdDogdHJ1ZSB9LCAoKSA9PiB0cnVlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlKTtcblx0fVxuXG5cdHNob3dNZW51KCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuY29udGFpbmVyLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXRBY3Rpb25zKCksXG5cdFx0XHRnZXRDaGVja2VkQWN0aW9uc1JlcHJlc2VudGF0aW9uOiAoKSA9PiAncmFkaW8nLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0T3ZlcmZsb3dpbmdDb21wb3NpdGVzKCkubWFwKGNvbXBvc2l0ZSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmdldENvbXBvc2l0ZU9wZW5BY3Rpb24oY29tcG9zaXRlLmlkKTtcblx0XHRcdGFjdGlvbi5jaGVja2VkID0gdGhpcy5nZXRBY3RpdmVDb21wb3NpdGVJZCgpID09PSBhY3Rpb24uaWQ7XG5cblx0XHRcdGNvbnN0IGJhZGdlID0gdGhpcy5nZXRCYWRnZShjb21wb3NpdGUuaWQpO1xuXHRcdFx0bGV0IHN1ZmZpeDogc3RyaW5nIHwgbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGJhZGdlIGluc3RhbmNlb2YgTnVtYmVyQmFkZ2UpIHtcblx0XHRcdFx0c3VmZml4ID0gYmFkZ2UubnVtYmVyO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3VmZml4KSB7XG5cdFx0XHRcdGFjdGlvbi5sYWJlbCA9IGxvY2FsaXplKCdudW1iZXJCYWRnZScsIFwiezB9ICh7MX0pXCIsIGNvbXBvc2l0ZS5uYW1lLCBzdWZmaXgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YWN0aW9uLmxhYmVsID0gY29tcG9zaXRlLm5hbWUgfHwgJyc7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBhY3Rpb247XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbXBvc2l0ZUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQ29tcG9zaXRlQmFyQWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElDb21wb3NpdGVCYXJBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0Y29tcG9zaXRlQWN0aXZpdHlBY3Rpb246IENvbXBvc2l0ZUJhckFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbjogSUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uOiBJQWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29tcG9zaXRlQ29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXI6IChjb21wb3NpdGVJZDogc3RyaW5nKSA9PiBJQWN0aW9uW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudUFjdGlvbnNQcm92aWRlcjogKCkgPT4gSUFjdGlvbltdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZG5kSGFuZGxlcjogSUNvbXBvc2l0ZURyYWdBbmREcm9wLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29tcG9zaXRlQmFyOiBJQ29tcG9zaXRlQmFyLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRjb21wb3NpdGVBY3Rpdml0eUFjdGlvbixcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRjb21wb3NpdGVCYXIuYXJlQmFkZ2VzRW5hYmxlZC5iaW5kKGNvbXBvc2l0ZUJhciksXG5cdFx0XHR0aGVtZVNlcnZpY2UsXG5cdFx0XHRob3ZlclNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdGtleWJpbmRpbmdTZXJ2aWNlXG5cdFx0KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnVwZGF0ZUNoZWNrZWQoKTtcblx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHR0aGlzLnNob3dDb250ZXh0TWVudShjb250YWluZXIpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEFsbG93IHRvIGRyYWdcblx0XHRsZXQgaW5zZXJ0RHJvcEJlZm9yZTogQmVmb3JlMkQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlci5JTlNUQU5DRS5yZWdpc3RlckRyYWdnYWJsZSh0aGlzLmNvbnRhaW5lciwgKCkgPT4geyByZXR1cm4geyB0eXBlOiAnY29tcG9zaXRlJywgaWQ6IHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCB9OyB9LCB7XG5cdFx0XHRvbkRyYWdPdmVyOiBlID0+IHtcblx0XHRcdFx0Y29uc3QgaXNWYWxpZE1vdmUgPSBlLmRyYWdBbmREcm9wRGF0YS5nZXREYXRhKCkuaWQgIT09IHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCAmJiB0aGlzLmRuZEhhbmRsZXIub25EcmFnT3ZlcihlLmRyYWdBbmREcm9wRGF0YSwgdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkLCBlLmV2ZW50RGF0YSk7XG5cdFx0XHRcdHRvZ2dsZURyb3BFZmZlY3QoZS5ldmVudERhdGEuZGF0YVRyYW5zZmVyLCAnbW92ZScsIGlzVmFsaWRNb3ZlKTtcblx0XHRcdFx0aW5zZXJ0RHJvcEJlZm9yZSA9IHRoaXMudXBkYXRlRnJvbURyYWdnaW5nKGNvbnRhaW5lciwgaXNWYWxpZE1vdmUsIGUuZXZlbnREYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdMZWF2ZTogZSA9PiB7XG5cdFx0XHRcdGluc2VydERyb3BCZWZvcmUgPSB0aGlzLnVwZGF0ZUZyb21EcmFnZ2luZyhjb250YWluZXIsIGZhbHNlLCBlLmV2ZW50RGF0YSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EcmFnRW5kOiBlID0+IHtcblx0XHRcdFx0aW5zZXJ0RHJvcEJlZm9yZSA9IHRoaXMudXBkYXRlRnJvbURyYWdnaW5nKGNvbnRhaW5lciwgZmFsc2UsIGUuZXZlbnREYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRyb3A6IGUgPT4ge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUuZXZlbnREYXRhLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5kbmRIYW5kbGVyLmRyb3AoZS5kcmFnQW5kRHJvcERhdGEsIHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCwgZS5ldmVudERhdGEsIGluc2VydERyb3BCZWZvcmUpO1xuXHRcdFx0XHRpbnNlcnREcm9wQmVmb3JlID0gdGhpcy51cGRhdGVGcm9tRHJhZ2dpbmcoY29udGFpbmVyLCBmYWxzZSwgZS5ldmVudERhdGEpO1xuXHRcdFx0fSxcblx0XHRcdG9uRHJhZ1N0YXJ0OiBlID0+IHtcblx0XHRcdFx0aWYgKGUuZHJhZ0FuZERyb3BEYXRhLmdldERhdGEoKS5pZCAhPT0gdGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUuZXZlbnREYXRhLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdGUuZXZlbnREYXRhLmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ21vdmUnO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5ibHVyKCk7IC8vIFJlbW92ZSBmb2N1cyBpbmRpY2F0b3Igd2hlbiBkcmFnZ2luZ1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEFjdGl2YXRlIG9uIGRyYWcgb3ZlciB0byByZXZlYWwgdGFyZ2V0c1xuXHRcdFt0aGlzLmJhZGdlLCB0aGlzLmxhYmVsXS5mb3JFYWNoKGVsZW1lbnQgPT4gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZWREcmFnSGFuZGxlcihlbGVtZW50LCAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuYWN0aW9uLmNoZWNrZWQpIHtcblx0XHRcdFx0dGhpcy5hY3Rpb24ucnVuKCk7XG5cdFx0XHR9XG5cdFx0fSkpKTtcblxuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUZyb21EcmFnZ2luZyhlbGVtZW50OiBIVE1MRWxlbWVudCwgc2hvd0ZlZWRiYWNrOiBib29sZWFuLCBldmVudDogRHJhZ0V2ZW50KTogQmVmb3JlMkQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHBvc1ggPSBldmVudC5jbGllbnRYO1xuXHRcdGNvbnN0IHBvc1kgPSBldmVudC5jbGllbnRZO1xuXHRcdGNvbnN0IGhlaWdodCA9IHJlY3QuYm90dG9tIC0gcmVjdC50b3A7XG5cdFx0Y29uc3Qgd2lkdGggPSByZWN0LnJpZ2h0IC0gcmVjdC5sZWZ0O1xuXG5cdFx0Y29uc3QgZm9yY2VUb3AgPSBwb3NZIDw9IHJlY3QudG9wICsgaGVpZ2h0ICogMC40O1xuXHRcdGNvbnN0IGZvcmNlQm90dG9tID0gcG9zWSA+IHJlY3QuYm90dG9tIC0gaGVpZ2h0ICogMC40O1xuXHRcdGNvbnN0IHByZWZlclRvcCA9IHBvc1kgPD0gcmVjdC50b3AgKyBoZWlnaHQgKiAwLjU7XG5cblx0XHRjb25zdCBmb3JjZUxlZnQgPSBwb3NYIDw9IHJlY3QubGVmdCArIHdpZHRoICogMC40O1xuXHRcdGNvbnN0IGZvcmNlUmlnaHQgPSBwb3NYID4gcmVjdC5yaWdodCAtIHdpZHRoICogMC40O1xuXHRcdGNvbnN0IHByZWZlckxlZnQgPSBwb3NYIDw9IHJlY3QubGVmdCArIHdpZHRoICogMC41O1xuXG5cdFx0Y29uc3QgY2xhc3NlcyA9IGVsZW1lbnQuY2xhc3NMaXN0O1xuXHRcdGNvbnN0IGxhc3RDbGFzc2VzID0ge1xuXHRcdFx0dmVydGljYWw6IGNsYXNzZXMuY29udGFpbnMoJ3RvcCcpID8gJ3RvcCcgOiAoY2xhc3Nlcy5jb250YWlucygnYm90dG9tJykgPyAnYm90dG9tJyA6IHVuZGVmaW5lZCksXG5cdFx0XHRob3Jpem9udGFsOiBjbGFzc2VzLmNvbnRhaW5zKCdsZWZ0JykgPyAnbGVmdCcgOiAoY2xhc3Nlcy5jb250YWlucygncmlnaHQnKSA/ICdyaWdodCcgOiB1bmRlZmluZWQpXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRvcCA9IGZvcmNlVG9wIHx8IChwcmVmZXJUb3AgJiYgIWxhc3RDbGFzc2VzLnZlcnRpY2FsKSB8fCAoIWZvcmNlQm90dG9tICYmIGxhc3RDbGFzc2VzLnZlcnRpY2FsID09PSAndG9wJyk7XG5cdFx0Y29uc3QgYm90dG9tID0gZm9yY2VCb3R0b20gfHwgKCFwcmVmZXJUb3AgJiYgIWxhc3RDbGFzc2VzLnZlcnRpY2FsKSB8fCAoIWZvcmNlVG9wICYmIGxhc3RDbGFzc2VzLnZlcnRpY2FsID09PSAnYm90dG9tJyk7XG5cdFx0Y29uc3QgbGVmdCA9IGZvcmNlTGVmdCB8fCAocHJlZmVyTGVmdCAmJiAhbGFzdENsYXNzZXMuaG9yaXpvbnRhbCkgfHwgKCFmb3JjZVJpZ2h0ICYmIGxhc3RDbGFzc2VzLmhvcml6b250YWwgPT09ICdsZWZ0Jyk7XG5cdFx0Y29uc3QgcmlnaHQgPSBmb3JjZVJpZ2h0IHx8ICghcHJlZmVyTGVmdCAmJiAhbGFzdENsYXNzZXMuaG9yaXpvbnRhbCkgfHwgKCFmb3JjZUxlZnQgJiYgbGFzdENsYXNzZXMuaG9yaXpvbnRhbCA9PT0gJ3JpZ2h0Jyk7XG5cblx0XHRlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3RvcCcsIHNob3dGZWVkYmFjayAmJiB0b3ApO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnYm90dG9tJywgc2hvd0ZlZWRiYWNrICYmIGJvdHRvbSk7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdsZWZ0Jywgc2hvd0ZlZWRiYWNrICYmIGxlZnQpO1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgncmlnaHQnLCBzaG93RmVlZGJhY2sgJiYgcmlnaHQpO1xuXG5cdFx0aWYgKCFzaG93RmVlZGJhY2spIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdmVydGljYWxseUJlZm9yZTogdG9wLCBob3Jpem9udGFsbHlCZWZvcmU6IGxlZnQgfTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0NvbnRleHRNZW51KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdGlmICh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ua2V5YmluZGluZ0lkKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goY3JlYXRlQ29uZmlndXJlS2V5YmluZGluZ0FjdGlvbih0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ua2V5YmluZGluZ0lkKSk7XG5cdFx0fVxuXG5cdFx0YWN0aW9ucy5wdXNoKHRoaXMudG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uLCB0aGlzLnRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uKTtcblxuXHRcdGNvbnN0IGNvbXBvc2l0ZUNvbnRleHRNZW51QWN0aW9ucyA9IHRoaXMuY29tcG9zaXRlQ29udGV4dE1lbnVBY3Rpb25zUHJvdmlkZXIodGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkKTtcblx0XHRpZiAoY29tcG9zaXRlQ29udGV4dE1lbnVBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLmNvbXBvc2l0ZUNvbnRleHRNZW51QWN0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNQaW5uZWQgPSB0aGlzLmNvbXBvc2l0ZUJhci5pc1Bpbm5lZCh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQpO1xuXHRcdGlmIChpc1Bpbm5lZCkge1xuXHRcdFx0dGhpcy50b2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24ubGFiZWwgPSBsb2NhbGl6ZSgnaGlkZScsIFwiSGlkZSAnezB9J1wiLCB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ubmFtZSk7XG5cdFx0XHR0aGlzLnRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbi5jaGVja2VkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbi5lbmFibGVkID0gdGhpcy5jb21wb3NpdGVCYXIuZ2V0UGlubmVkQ29tcG9zaXRlSWRzKCkubGVuZ3RoID4gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50b2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24ubGFiZWwgPSBsb2NhbGl6ZSgna2VlcCcsIFwiS2VlcCAnezB9J1wiLCB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ubmFtZSk7XG5cdFx0XHR0aGlzLnRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0JhZGdlRW5hYmxlZCA9IHRoaXMuY29tcG9zaXRlQmFyLmFyZUJhZGdlc0VuYWJsZWQodGhpcy5jb21wb3NpdGVCYXJBY3Rpb25JdGVtLmlkKTtcblx0XHRpZiAoaXNCYWRnZUVuYWJsZWQpIHtcblx0XHRcdHRoaXMudG9nZ2xlQ29tcG9zaXRlQmFkZ2VBY3Rpb24ubGFiZWwgPSBsb2NhbGl6ZSgnaGlkZUJhZGdlJywgXCJIaWRlIEJhZGdlXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uLmxhYmVsID0gbG9jYWxpemUoJ3Nob3dCYWRnZScsIFwiU2hvdyBCYWRnZVwiKTtcblx0XHR9XG5cblx0XHRjb25zdCBvdGhlckFjdGlvbnMgPSB0aGlzLmNvbnRleHRNZW51QWN0aW9uc1Byb3ZpZGVyKCk7XG5cdFx0aWYgKG90aGVyQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKC4uLm90aGVyQWN0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudFBvc2l0aW9uID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihjb250YWluZXIpO1xuXHRcdGNvbnN0IGFuY2hvciA9IHtcblx0XHRcdHg6IE1hdGguZmxvb3IoZWxlbWVudFBvc2l0aW9uLmxlZnQgKyAoZWxlbWVudFBvc2l0aW9uLndpZHRoIC8gMikpLFxuXHRcdFx0eTogZWxlbWVudFBvc2l0aW9uLnRvcCArIGVsZW1lbnRQb3NpdGlvbi5oZWlnaHRcblx0XHR9O1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9ucyxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDaGVja2VkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFjdGlvbi5jaGVja2VkKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGVja2VkJyk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLmdldFRvb2x0aXAoKSA/PyB0aGlzLmNvbnRhaW5lci50aXRsZSk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgJ3RydWUnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hlY2tlZCcpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5nZXRUb29sdGlwKCkgPz8gdGhpcy5jb250YWluZXIudGl0bGUpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAnZmFsc2UnKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUVuYWJsZWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlZCcpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5sYWJlbC5yZW1vdmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGFjdGl2aXR5OiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIGNvbXBvc2l0ZUJhcjogSUNvbXBvc2l0ZUJhclxuXHQpIHtcblx0XHRzdXBlcignc2hvdy50b2dnbGVDb21wb3NpdGVQaW5uZWQnLCBhY3Rpdml0eSA/IGFjdGl2aXR5Lm5hbWUgOiBsb2NhbGl6ZSgndG9nZ2xlJywgXCJUb2dnbGUgVmlldyBQaW5uZWRcIikpO1xuXG5cdFx0dGhpcy5jaGVja2VkID0gISF0aGlzLmFjdGl2aXR5ICYmIHRoaXMuY29tcG9zaXRlQmFyLmlzUGlubmVkKHRoaXMuYWN0aXZpdHkuaWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGNvbnRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGlkID0gdGhpcy5hY3Rpdml0eSA/IHRoaXMuYWN0aXZpdHkuaWQgOiBjb250ZXh0O1xuXG5cdFx0aWYgKHRoaXMuY29tcG9zaXRlQmFyLmlzUGlubmVkKGlkKSkge1xuXHRcdFx0dGhpcy5jb21wb3NpdGVCYXIudW5waW4oaWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbXBvc2l0ZUJhci5waW4oaWQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlQ29tcG9zaXRlQmFkZ2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW06IElDb21wb3NpdGVCYXJBY3Rpb25JdGVtIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgY29tcG9zaXRlQmFyOiBJQ29tcG9zaXRlQmFyXG5cdCkge1xuXHRcdHN1cGVyKCdzaG93LnRvZ2dsZUNvbXBvc2l0ZUJhZGdlJywgY29tcG9zaXRlQmFyQWN0aW9uSXRlbSA/IGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0ubmFtZSA6IGxvY2FsaXplKCd0b2dnbGVCYWRnZScsIFwiVG9nZ2xlIFZpZXcgQmFkZ2VcIikpO1xuXG5cdFx0dGhpcy5jaGVja2VkID0gZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oY29udGV4dDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0gPyB0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQgOiBjb250ZXh0O1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyLnRvZ2dsZUJhZGdlRW5hYmxlbWVudChpZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN3aXRjaENvbXBvc2l0ZVZpZXdBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0ZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvZmZzZXQ6IG51bWJlclxuXHQpIHtcblx0XHRzdXBlcihkZXNjKTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhbmVDb21wb3NpdGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlQ29tcG9zaXRlID0gcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSh0aGlzLmxvY2F0aW9uKTtcblx0XHRpZiAoIWFjdGl2ZUNvbXBvc2l0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB0YXJnZXRDb21wb3NpdGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgdmlzaWJsZUNvbXBvc2l0ZUlkcyA9IHBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldFZpc2libGVQYW5lQ29tcG9zaXRlSWRzKHRoaXMubG9jYXRpb24pO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmlzaWJsZUNvbXBvc2l0ZUlkcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHZpc2libGVDb21wb3NpdGVJZHNbaV0gPT09IGFjdGl2ZUNvbXBvc2l0ZS5nZXRJZCgpKSB7XG5cdFx0XHRcdHRhcmdldENvbXBvc2l0ZUlkID0gdmlzaWJsZUNvbXBvc2l0ZUlkc1soaSArIHZpc2libGVDb21wb3NpdGVJZHMubGVuZ3RoICsgdGhpcy5vZmZzZXQpICUgdmlzaWJsZUNvbXBvc2l0ZUlkcy5sZW5ndGhdO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHRhcmdldENvbXBvc2l0ZUlkICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0YXdhaXQgcGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUodGFyZ2V0Q29tcG9zaXRlSWQsIHRoaXMubG9jYXRpb24sIHRydWUpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFFBQWlCLGlCQUFpQjtBQUMzQyxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsV0FBVyxhQUFhLFdBQVcsd0JBQXdCLE1BQU0sWUFBWTtBQUN4SCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGNBQWMsaUJBQWlCLHlCQUF5QjtBQUNqRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFrQztBQUMzQyxTQUFTLGFBQWdDLGVBQWUsaUJBQWlCO0FBQ3pFLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsOEJBQStELHdCQUF3QjtBQUVoRyxTQUFTLDBCQUFrRDtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFHdEMsU0FBUyxpQkFBaUIsaUJBQWlCLHNCQUFzQjtBQUNqRSxTQUFTLGVBQWdDO0FBRXpDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsa0JBQWtCO0FBa0RwQixNQUFNLDJCQUEyQixPQUFPO0FBQUEsRUFVOUMsWUFBb0IsTUFBK0I7QUFDbEQsVUFBTSxLQUFLLElBQUksS0FBSyxNQUFNLEtBQUss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
