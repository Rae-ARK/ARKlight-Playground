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
import { toAction } from "../../../base/common/actions.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ActionBar, ActionsOrientation } from "../../../base/browser/ui/actionbar/actionbar.js";
import { CompositeActionViewItem, CompositeOverflowActivityAction, CompositeOverflowActivityActionViewItem } from "./compositeBarActions.js";
import { $, addDisposableListener, EventType, EventHelper, isAncestor, getWindow } from "../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { Widget } from "../../../base/browser/ui/widget.js";
import { isUndefinedOrNull } from "../../../base/common/types.js";
import { Emitter } from "../../../base/common/event.js";
import { IViewDescriptorService } from "../../common/views.js";
import { CompositeDragAndDropObserver, toggleDropEffect } from "../dnd.js";
import { Gesture, EventType as TouchEventType } from "../../../base/browser/touch.js";
import { MutableDisposable } from "../../../base/common/lifecycle.js";
class CompositeDragAndDrop {
  constructor(viewDescriptorService, targetContainerLocation, orientation, openComposite, moveComposite, getItems) {
    this.viewDescriptorService = viewDescriptorService;
    this.targetContainerLocation = targetContainerLocation;
    this.orientation = orientation;
    this.openComposite = openComposite;
    this.moveComposite = moveComposite;
    this.getItems = getItems;
  }
  drop(data, targetCompositeId, originalEvent, before) {
    const dragData = data.getData();
    if (dragData.type === "composite") {
      const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id);
      const currentLocation = this.viewDescriptorService.getViewContainerLocation(currentContainer);
      let moved = false;
      if (currentLocation === this.targetContainerLocation) {
        if (targetCompositeId) {
          this.moveComposite(dragData.id, targetCompositeId, before);
          moved = true;
        }
      } else {
        this.viewDescriptorService.moveViewContainerToLocation(currentContainer, this.targetContainerLocation, this.getTargetIndex(targetCompositeId, before), "dnd");
        moved = true;
      }
      if (moved) {
        this.openComposite(currentContainer.id, true);
      }
    }
    if (dragData.type === "view") {
      const viewToMove = this.viewDescriptorService.getViewDescriptorById(dragData.id);
      if (viewToMove.canMoveView) {
        this.viewDescriptorService.moveViewToLocation(viewToMove, this.targetContainerLocation, "dnd");
        const newContainer = this.viewDescriptorService.getViewContainerByViewId(viewToMove.id);
        if (targetCompositeId) {
          this.moveComposite(newContainer.id, targetCompositeId, before);
        }
        this.openComposite(newContainer.id, true).then((composite) => {
          composite?.openView(viewToMove.id, true);
        });
      }
    }
  }
  onDragEnter(data, targetCompositeId, originalEvent) {
    return this.canDrop(data, targetCompositeId);
  }
  onDragOver(data, targetCompositeId, originalEvent) {
    return this.canDrop(data, targetCompositeId);
  }
  getTargetIndex(targetId, before2d) {
    if (!targetId) {
      return void 0;
    }
    const items = this.getItems();
    const before = this.orientation === ActionsOrientation.HORIZONTAL ? before2d?.horizontallyBefore : before2d?.verticallyBefore;
    return items.filter((item) => item.visible).findIndex((item) => item.id === targetId) + (before ? 0 : 1);
  }
  canDrop(data, targetCompositeId) {
    const dragData = data.getData();
    if (dragData.type === "composite") {
      const currentContainer = this.viewDescriptorService.getViewContainerById(dragData.id);
      const currentLocation = this.viewDescriptorService.getViewContainerLocation(currentContainer);
      if (currentLocation === this.targetContainerLocation) {
        return dragData.id !== targetCompositeId;
      }
      return true;
    } else {
      const viewDescriptor = this.viewDescriptorService.getViewDescriptorById(dragData.id);
      if (!viewDescriptor?.canMoveView) {
        return false;
      }
      return true;
    }
  }
}
class CompositeBarDndCallbacks {
  constructor(compositeBarContainer, actionBarContainer, compositeBarModel, dndHandler, orientation) {
    this.compositeBarContainer = compositeBarContainer;
    this.actionBarContainer = actionBarContainer;
    this.compositeBarModel = compositeBarModel;
    this.dndHandler = dndHandler;
    this.orientation = orientation;
    this.insertDropBefore = void 0;
  }
  onDragOver(e) {
    const visibleItems = this.compositeBarModel.visibleItems;
    if (!visibleItems.length || e.eventData.target && isAncestor(e.eventData.target, this.actionBarContainer)) {
      this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, true);
      return;
    }
    const insertAtFront = this.insertAtFront(this.actionBarContainer, e.eventData);
    const target = insertAtFront ? visibleItems[0] : visibleItems[visibleItems.length - 1];
    const validDropTarget = this.dndHandler.onDragOver(e.dragAndDropData, target.id, e.eventData);
    toggleDropEffect(e.eventData.dataTransfer, "move", validDropTarget);
    this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, validDropTarget, insertAtFront, true);
  }
  onDragLeave(e) {
    this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
  }
  onDragEnd(e) {
    this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
  }
  onDrop(e) {
    const visibleItems = this.compositeBarModel.visibleItems;
    let targetId = void 0;
    if (visibleItems.length) {
      targetId = this.insertAtFront(this.actionBarContainer, e.eventData) ? visibleItems[0].id : visibleItems[visibleItems.length - 1].id;
    }
    this.dndHandler.drop(e.dragAndDropData, targetId, e.eventData, this.insertDropBefore);
    this.insertDropBefore = this.updateFromDragging(this.compositeBarContainer, false, false, false);
  }
  insertAtFront(element, event) {
    const rect = element.getBoundingClientRect();
    const posX = event.clientX;
    const posY = event.clientY;
    switch (this.orientation) {
      case ActionsOrientation.HORIZONTAL:
        return posX < rect.left;
      case ActionsOrientation.VERTICAL:
        return posY < rect.top;
    }
  }
  updateFromDragging(element, showFeedback, front, isDragging) {
    element.classList.toggle("dragged-over", isDragging);
    element.classList.toggle("dragged-over-head", showFeedback && front);
    element.classList.toggle("dragged-over-tail", showFeedback && !front);
    if (!showFeedback) {
      return void 0;
    }
    return { verticallyBefore: front, horizontallyBefore: front };
  }
}
let CompositeBar = class extends Widget {
  constructor(items, options, instantiationService, contextMenuService, viewDescriptorService) {
    super();
    this.options = options;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.viewDescriptorService = viewDescriptorService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.compositeOverflowAction = this._register(new MutableDisposable());
    this.compositeOverflowActionViewItem = this._register(new MutableDisposable());
    this.model = new CompositeBarModel(items, options);
    this.visibleComposites = [];
    this.compositeSizeInBar = /* @__PURE__ */ new Map();
    this.computeSizes(this.model.visibleItems);
  }
  getCompositeBarItems() {
    return [...this.model.items];
  }
  setCompositeBarItems(items) {
    this.model.setItems(items);
    this.updateCompositeSwitcher(true);
  }
  getPinnedComposites() {
    return this.model.pinnedItems;
  }
  getPinnedCompositeIds() {
    return this.getPinnedComposites().map((c) => c.id);
  }
  getVisibleComposites() {
    return this.model.visibleItems;
  }
  create(parent) {
    const actionBarDiv = parent.appendChild($(".composite-bar"));
    this.compositeSwitcherBar = this._register(new ActionBar(actionBarDiv, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof CompositeOverflowActivityAction) {
          return this.compositeOverflowActionViewItem.value;
        }
        const item = this.model.findItem(action.id);
        return item && this.instantiationService.createInstance(
          CompositeActionViewItem,
          { ...options, draggable: true, colors: this.options.colors, icon: this.options.icon, hoverOptions: this.options.activityHoverOptions, compact: this.options.compact },
          action,
          item.pinnedAction,
          item.toggleBadgeAction,
          (compositeId) => this.options.getContextMenuActionsForComposite(compositeId),
          () => this.getContextMenuActions(),
          this.options.dndHandler,
          this
        );
      },
      orientation: this.options.orientation,
      ariaLabel: localize("activityBarAriaLabel", "Active View Switcher"),
      ariaRole: "tablist",
      preventLoopNavigation: this.options.preventLoopNavigation,
      triggerKeys: { keyDown: true }
    }));
    this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => this.showContextMenu(getWindow(parent), e)));
    this._register(Gesture.addTarget(parent));
    this._register(addDisposableListener(parent, TouchEventType.Contextmenu, (e) => this.showContextMenu(getWindow(parent), e)));
    const dndCallback = new CompositeBarDndCallbacks(parent, actionBarDiv, this.model, this.options.dndHandler, this.options.orientation);
    this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(parent, dndCallback));
    return actionBarDiv;
  }
  focus(index) {
    this.compositeSwitcherBar?.focus(index);
  }
  recomputeSizes() {
    this.computeSizes(this.model.visibleItems);
    this.updateCompositeSwitcher();
  }
  layout(dimension) {
    this.dimension = dimension;
    if (dimension.height === 0 || dimension.width === 0) {
      return;
    }
    if (this.compositeSizeInBar.size === 0) {
      this.computeSizes(this.model.visibleItems);
    }
    this.updateCompositeSwitcher();
  }
  addComposite({ id, name, order, requestedIndex }) {
    if (this.model.add(id, name, order, requestedIndex)) {
      this.computeSizes([this.model.findItem(id)]);
      this.updateCompositeSwitcher();
    }
  }
  removeComposite(id) {
    if (this.isPinned(id)) {
      this.unpin(id);
    }
    if (this.model.remove(id)) {
      this.updateCompositeSwitcher();
    }
  }
  hideComposite(id) {
    if (this.model.hide(id)) {
      this.resetActiveComposite(id);
      this.updateCompositeSwitcher();
    }
  }
  activateComposite(id) {
    const previousActiveItem = this.model.activeItem;
    if (this.model.activate(id)) {
      if (this.visibleComposites.indexOf(id) === -1 || !!this.model.activeItem && !this.model.activeItem.pinned || previousActiveItem && !previousActiveItem.pinned) {
        this.updateCompositeSwitcher();
      }
    }
  }
  deactivateComposite(id) {
    const previousActiveItem = this.model.activeItem;
    if (this.model.deactivate()) {
      if (previousActiveItem && !previousActiveItem.pinned) {
        this.updateCompositeSwitcher();
      }
    }
  }
  async pin(compositeId, open) {
    if (this.model.setPinned(compositeId, true)) {
      this.updateCompositeSwitcher();
      if (open) {
        await this.options.openComposite(compositeId);
        this.activateComposite(compositeId);
      }
    }
  }
  unpin(compositeId) {
    if (this.model.setPinned(compositeId, false)) {
      this.updateCompositeSwitcher();
      this.resetActiveComposite(compositeId);
    }
  }
  areBadgesEnabled(compositeId) {
    return this.viewDescriptorService.getViewContainerBadgeEnablementState(compositeId);
  }
  toggleBadgeEnablement(compositeId) {
    this.viewDescriptorService.setViewContainerBadgeEnablementState(compositeId, !this.areBadgesEnabled(compositeId));
    this.updateCompositeSwitcher();
    const item = this.model.findItem(compositeId);
    if (item) {
      item.activityAction.activities = item.activityAction.activities;
    }
  }
  resetActiveComposite(compositeId) {
    const defaultCompositeId = this.options.getDefaultCompositeId();
    if (!this.model.activeItem || this.model.activeItem.id !== compositeId) {
      return;
    }
    this.deactivateComposite(compositeId);
    if (defaultCompositeId && defaultCompositeId !== compositeId && this.isPinned(defaultCompositeId)) {
      this.options.openComposite(defaultCompositeId, true);
    } else {
      const visibleComposite = this.visibleComposites.find((cid) => cid !== compositeId);
      if (visibleComposite) {
        this.options.openComposite(visibleComposite);
      }
    }
  }
  isPinned(compositeId) {
    const item = this.model.findItem(compositeId);
    return item?.pinned;
  }
  move(compositeId, toCompositeId, before) {
    if (before !== void 0) {
      const fromIndex = this.model.items.findIndex((c) => c.id === compositeId);
      let toIndex = this.model.items.findIndex((c) => c.id === toCompositeId);
      if (fromIndex >= 0 && toIndex >= 0) {
        if (!before && fromIndex > toIndex) {
          toIndex++;
        }
        if (before && fromIndex < toIndex) {
          toIndex--;
        }
        if (toIndex < this.model.items.length && toIndex >= 0 && toIndex !== fromIndex) {
          if (this.model.move(this.model.items[fromIndex].id, this.model.items[toIndex].id)) {
            setTimeout(() => this.updateCompositeSwitcher(), 0);
          }
        }
      }
    } else {
      if (this.model.move(compositeId, toCompositeId)) {
        setTimeout(() => this.updateCompositeSwitcher(), 0);
      }
    }
  }
  getAction(compositeId) {
    const item = this.model.findItem(compositeId);
    return item?.activityAction;
  }
  computeSizes(items) {
    const size = this.options.compositeSize;
    if (size) {
      items.forEach((composite) => this.compositeSizeInBar.set(composite.id, size));
    } else {
      const compositeSwitcherBar = this.compositeSwitcherBar;
      if (compositeSwitcherBar && this.dimension && this.dimension.height !== 0 && this.dimension.width !== 0) {
        const currentItemsLength = compositeSwitcherBar.viewItems.length;
        compositeSwitcherBar.push(items.map((composite) => composite.activityAction));
        items.map((composite, index) => this.compositeSizeInBar.set(
          composite.id,
          this.options.orientation === ActionsOrientation.VERTICAL ? compositeSwitcherBar.getHeight(currentItemsLength + index) : compositeSwitcherBar.getWidth(currentItemsLength + index)
        ));
        items.forEach(() => compositeSwitcherBar.pull(compositeSwitcherBar.viewItems.length - 1));
      }
    }
  }
  updateCompositeSwitcher(donotTrigger) {
    const compositeSwitcherBar = this.compositeSwitcherBar;
    if (!compositeSwitcherBar || !this.dimension) {
      return;
    }
    let compositesToShow = this.model.visibleItems.filter(
      (item) => item.pinned || this.model.activeItem && this.model.activeItem.id === item.id
      /* Show the active composite even if it is not pinned */
    ).map((item) => item.id);
    let maxVisible = compositesToShow.length;
    const totalComposites = compositesToShow.length;
    let size = 0;
    const limit = this.options.orientation === ActionsOrientation.VERTICAL ? this.dimension.height : this.dimension.width;
    for (let i = 0; i < compositesToShow.length; i++) {
      const compositeSize = this.compositeSizeInBar.get(compositesToShow[i]);
      if (size + compositeSize > limit) {
        maxVisible = i;
        break;
      }
      size += compositeSize;
    }
    if (totalComposites > maxVisible) {
      compositesToShow = compositesToShow.slice(0, maxVisible);
    }
    if (this.model.activeItem && compositesToShow.every((compositeId) => !!this.model.activeItem && compositeId !== this.model.activeItem.id)) {
      size += this.compositeSizeInBar.get(this.model.activeItem.id);
      compositesToShow.push(this.model.activeItem.id);
    }
    while (size > limit && compositesToShow.length) {
      const removedComposite = compositesToShow.length > 1 ? compositesToShow.splice(compositesToShow.length - 2, 1)[0] : compositesToShow.pop();
      size -= this.compositeSizeInBar.get(removedComposite);
    }
    if (totalComposites > compositesToShow.length) {
      size += this.options.overflowActionSize;
    }
    while (size > limit && compositesToShow.length) {
      const removedComposite = compositesToShow.length > 1 && compositesToShow[compositesToShow.length - 1] === this.model.activeItem?.id ? compositesToShow.splice(compositesToShow.length - 2, 1)[0] : compositesToShow.pop();
      size -= this.compositeSizeInBar.get(removedComposite);
    }
    if (totalComposites === compositesToShow.length && this.compositeOverflowAction.value) {
      compositeSwitcherBar.pull(compositeSwitcherBar.length() - 1);
      this.compositeOverflowAction.value = void 0;
      this.compositeOverflowActionViewItem.value = void 0;
    }
    const compositesToRemove = [];
    this.visibleComposites.forEach((compositeId, index) => {
      if (!compositesToShow.includes(compositeId)) {
        compositesToRemove.push(index);
      }
    });
    compositesToRemove.reverse().forEach((index) => {
      compositeSwitcherBar.pull(index);
      this.visibleComposites.splice(index, 1);
    });
    compositesToShow.forEach((compositeId, newIndex) => {
      const currentIndex = this.visibleComposites.indexOf(compositeId);
      if (newIndex !== currentIndex) {
        if (currentIndex !== -1) {
          compositeSwitcherBar.pull(currentIndex);
          this.visibleComposites.splice(currentIndex, 1);
        }
        compositeSwitcherBar.push(this.model.findItem(compositeId).activityAction, { label: true, icon: this.options.icon, index: newIndex });
        this.visibleComposites.splice(newIndex, 0, compositeId);
      }
    });
    if (totalComposites > compositesToShow.length && !this.compositeOverflowAction.value) {
      this.compositeOverflowAction.value = this.instantiationService.createInstance(CompositeOverflowActivityAction, () => {
        this.compositeOverflowActionViewItem.value?.showMenu();
      });
      this.compositeOverflowActionViewItem.value = this.instantiationService.createInstance(
        CompositeOverflowActivityActionViewItem,
        this.compositeOverflowAction.value,
        () => this.getOverflowingComposites(),
        () => this.model.activeItem ? this.model.activeItem.id : void 0,
        (compositeId) => {
          const item = this.model.findItem(compositeId);
          return item?.activity[0]?.badge;
        },
        this.options.getOnCompositeClickAction,
        this.options.colors,
        this.options.activityHoverOptions
      );
      compositeSwitcherBar.push(this.compositeOverflowAction.value, { label: false, icon: true });
    }
    if (!donotTrigger) {
      this._onDidChange.fire();
    }
  }
  getOverflowingComposites() {
    let overflowingIds = this.model.visibleItems.filter((item) => item.pinned).map((item) => item.id);
    if (this.model.activeItem && !this.model.activeItem.pinned) {
      overflowingIds.push(this.model.activeItem.id);
    }
    overflowingIds = overflowingIds.filter((compositeId) => !this.visibleComposites.includes(compositeId));
    return this.model.visibleItems.filter((c) => overflowingIds.includes(c.id)).map((item) => {
      return { id: item.id, name: this.getAction(item.id)?.label || item.name };
    });
  }
  showContextMenu(targetWindow, e) {
    EventHelper.stop(e, true);
    const event = new StandardMouseEvent(targetWindow, e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => this.getContextMenuActions(e)
    });
  }
  getContextMenuActions(e) {
    const actions = this.model.visibleItems.map(({ id, name, activityAction }) => {
      const isPinned = this.isPinned(id);
      return toAction({
        id,
        label: this.getAction(id).label || name || id,
        checked: isPinned,
        enabled: activityAction.enabled && (!isPinned || this.getPinnedCompositeIds().length > 1),
        run: () => {
          if (this.isPinned(id)) {
            this.unpin(id);
          } else {
            this.pin(id, true);
          }
        }
      });
    });
    this.options.fillExtraContextMenuActions(actions, e);
    return actions;
  }
};
CompositeBar = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IViewDescriptorService)
], CompositeBar);
class CompositeBarModel {
  constructor(items, options) {
    this._items = [];
    this.options = options;
    this.setItems(items);
  }
  get items() {
    return this._items;
  }
  setItems(items) {
    this._items = [];
    this._items = items.map((i) => this.createCompositeBarItem(i.id, i.name, i.order, i.pinned, i.visible));
  }
  get visibleItems() {
    return this.items.filter((item) => item.visible);
  }
  get pinnedItems() {
    return this.items.filter((item) => item.visible && item.pinned);
  }
  createCompositeBarItem(id, name, order, pinned, visible) {
    const options = this.options;
    return {
      id,
      name,
      pinned,
      order,
      visible,
      activity: [],
      get activityAction() {
        return options.getActivityAction(id);
      },
      get pinnedAction() {
        return options.getCompositePinnedAction(id);
      },
      get toggleBadgeAction() {
        return options.getCompositeBadgeAction(id);
      }
    };
  }
  add(id, name, order, requestedIndex) {
    const item = this.findItem(id);
    if (item) {
      let changed = false;
      item.name = name;
      if (!isUndefinedOrNull(order)) {
        changed = item.order !== order;
        item.order = order;
      }
      if (!item.visible) {
        item.visible = true;
        changed = true;
      }
      return changed;
    } else {
      const item2 = this.createCompositeBarItem(id, name, order, true, true);
      if (!isUndefinedOrNull(requestedIndex)) {
        let index = 0;
        let rIndex = requestedIndex;
        while (rIndex > 0 && index < this.items.length) {
          if (this.items[index++].visible) {
            rIndex--;
          }
        }
        this.items.splice(index, 0, item2);
      } else if (isUndefinedOrNull(order)) {
        this.items.push(item2);
      } else {
        let index = 0;
        while (index < this.items.length && typeof this.items[index].order === "number" && this.items[index].order < order) {
          index++;
        }
        this.items.splice(index, 0, item2);
      }
      return true;
    }
  }
  remove(id) {
    for (let index = 0; index < this.items.length; index++) {
      if (this.items[index].id === id) {
        this.items.splice(index, 1);
        return true;
      }
    }
    return false;
  }
  hide(id) {
    for (const item of this.items) {
      if (item.id === id) {
        if (item.visible) {
          item.visible = false;
          return true;
        }
        return false;
      }
    }
    return false;
  }
  move(compositeId, toCompositeId) {
    const fromIndex = this.findIndex(compositeId);
    const toIndex = this.findIndex(toCompositeId);
    if (fromIndex === -1 || toIndex === -1) {
      return false;
    }
    const sourceItem = this.items.splice(fromIndex, 1)[0];
    this.items.splice(toIndex, 0, sourceItem);
    sourceItem.pinned = true;
    return true;
  }
  setPinned(id, pinned) {
    for (const item of this.items) {
      if (item.id === id) {
        if (item.pinned !== pinned) {
          item.pinned = pinned;
          return true;
        }
        return false;
      }
    }
    return false;
  }
  activate(id) {
    if (!this.activeItem || this.activeItem.id !== id) {
      if (this.activeItem) {
        this.deactivate();
      }
      for (const item of this.items) {
        if (item.id === id) {
          this.activeItem = item;
          this.activeItem.activityAction.activate();
          return true;
        }
      }
    }
    return false;
  }
  deactivate() {
    if (this.activeItem) {
      this.activeItem.activityAction.deactivate();
      this.activeItem = void 0;
      return true;
    }
    return false;
  }
  findItem(id) {
    return this.items.filter((item) => item.id === id)[0];
  }
  findIndex(id) {
    for (let index = 0; index < this.items.length; index++) {
      if (this.items[index].id === id) {
        return index;
      }
    }
    return -1;
  }
}
export {
  CompositeBar,
  CompositeDragAndDrop
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2NvbXBvc2l0ZUJhci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHkgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hY3Rpdml0eS9jb21tb24vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIEFjdGlvbnNPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IENvbXBvc2l0ZUFjdGlvblZpZXdJdGVtLCBDb21wb3NpdGVPdmVyZmxvd0FjdGl2aXR5QWN0aW9uLCBDb21wb3NpdGVPdmVyZmxvd0FjdGl2aXR5QWN0aW9uVmlld0l0ZW0sIENvbXBvc2l0ZUJhckFjdGlvbiwgSUNvbXBvc2l0ZUJhciwgSUNvbXBvc2l0ZUJhckNvbG9ycywgSUFjdGl2aXR5SG92ZXJPcHRpb25zIH0gZnJvbSAnLi9jb21wb3NpdGVCYXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IERpbWVuc2lvbiwgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIEV2ZW50SGVscGVyLCBpc0FuY2VzdG9yLCBnZXRXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS93aWRnZXQuanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWRPck51bGwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFZpZXdDb250YWluZXJMb2NhdGlvbiwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElDb21wb3NpdGUgfSBmcm9tICcuLi8uLi9jb21tb24vY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IENvbXBvc2l0ZURyYWdBbmREcm9wRGF0YSwgQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlciwgSURyYWdnZWRDb21wb3NpdGVEYXRhLCBJQ29tcG9zaXRlRHJhZ0FuZERyb3AsIEJlZm9yZTJELCB0b2dnbGVEcm9wRWZmZWN0LCBJQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlckNhbGxiYWNrcyB9IGZyb20gJy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUsIEdlc3R1cmVFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2l0ZUJhckl0ZW0ge1xuXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cblx0bmFtZT86IHN0cmluZztcblx0cGlubmVkOiBib29sZWFuO1xuXHRvcmRlcj86IG51bWJlcjtcblx0dmlzaWJsZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbXBvc2l0ZURyYWdBbmREcm9wIGltcGxlbWVudHMgSUNvbXBvc2l0ZURyYWdBbmREcm9wIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRwcml2YXRlIHRhcmdldENvbnRhaW5lckxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sXG5cdFx0cHJpdmF0ZSBvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLFxuXHRcdHByaXZhdGUgb3BlbkNvbXBvc2l0ZTogKGlkOiBzdHJpbmcsIGZvY3VzPzogYm9vbGVhbikgPT4gUHJvbWlzZTxJUGFuZUNvbXBvc2l0ZSB8IG51bGw+LFxuXHRcdHByaXZhdGUgbW92ZUNvbXBvc2l0ZTogKGZyb206IHN0cmluZywgdG86IHN0cmluZywgYmVmb3JlPzogQmVmb3JlMkQpID0+IHZvaWQsXG5cdFx0cHJpdmF0ZSBnZXRJdGVtczogKCkgPT4gSUNvbXBvc2l0ZUJhckl0ZW1bXVxuXHQpIHsgfVxuXG5cdGRyb3AoZGF0YTogQ29tcG9zaXRlRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRDb21wb3NpdGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQsIGJlZm9yZT86IEJlZm9yZTJEKTogdm9pZCB7XG5cdFx0Y29uc3QgZHJhZ0RhdGEgPSBkYXRhLmdldERhdGEoKTtcblxuXHRcdGlmIChkcmFnRGF0YS50eXBlID09PSAnY29tcG9zaXRlJykge1xuXHRcdFx0Y29uc3QgY3VycmVudENvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGRyYWdEYXRhLmlkKSE7XG5cdFx0XHRjb25zdCBjdXJyZW50TG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24oY3VycmVudENvbnRhaW5lcik7XG5cdFx0XHRsZXQgbW92ZWQgPSBmYWxzZTtcblxuXHRcdFx0Ly8gLi4uIG9uIHRoZSBzYW1lIGNvbXBvc2l0ZSBiYXJcblx0XHRcdGlmIChjdXJyZW50TG9jYXRpb24gPT09IHRoaXMudGFyZ2V0Q29udGFpbmVyTG9jYXRpb24pIHtcblx0XHRcdFx0aWYgKHRhcmdldENvbXBvc2l0ZUlkKSB7XG5cdFx0XHRcdFx0dGhpcy5tb3ZlQ29tcG9zaXRlKGRyYWdEYXRhLmlkLCB0YXJnZXRDb21wb3NpdGVJZCwgYmVmb3JlKTtcblx0XHRcdFx0XHRtb3ZlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIC4uLiBvbiBhIGRpZmZlcmVudCBjb21wb3NpdGUgYmFyXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdDb250YWluZXJUb0xvY2F0aW9uKGN1cnJlbnRDb250YWluZXIsIHRoaXMudGFyZ2V0Q29udGFpbmVyTG9jYXRpb24sIHRoaXMuZ2V0VGFyZ2V0SW5kZXgodGFyZ2V0Q29tcG9zaXRlSWQsIGJlZm9yZSksICdkbmQnKTtcblx0XHRcdFx0bW92ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW92ZWQpIHtcblx0XHRcdFx0dGhpcy5vcGVuQ29tcG9zaXRlKGN1cnJlbnRDb250YWluZXIuaWQsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChkcmFnRGF0YS50eXBlID09PSAndmlldycpIHtcblx0XHRcdGNvbnN0IHZpZXdUb01vdmUgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3RGVzY3JpcHRvckJ5SWQoZHJhZ0RhdGEuaWQpITtcblx0XHRcdGlmICh2aWV3VG9Nb3ZlLmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRcdHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm1vdmVWaWV3VG9Mb2NhdGlvbih2aWV3VG9Nb3ZlLCB0aGlzLnRhcmdldENvbnRhaW5lckxvY2F0aW9uLCAnZG5kJyk7XG5cblx0XHRcdFx0Y29uc3QgbmV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdUb01vdmUuaWQpITtcblxuXHRcdFx0XHRpZiAodGFyZ2V0Q29tcG9zaXRlSWQpIHtcblx0XHRcdFx0XHR0aGlzLm1vdmVDb21wb3NpdGUobmV3Q29udGFpbmVyLmlkLCB0YXJnZXRDb21wb3NpdGVJZCwgYmVmb3JlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMub3BlbkNvbXBvc2l0ZShuZXdDb250YWluZXIuaWQsIHRydWUpLnRoZW4oY29tcG9zaXRlID0+IHtcblx0XHRcdFx0XHRjb21wb3NpdGU/Lm9wZW5WaWV3KHZpZXdUb01vdmUuaWQsIHRydWUpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvbkRyYWdFbnRlcihkYXRhOiBDb21wb3NpdGVEcmFnQW5kRHJvcERhdGEsIHRhcmdldENvbXBvc2l0ZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNhbkRyb3AoZGF0YSwgdGFyZ2V0Q29tcG9zaXRlSWQpO1xuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBDb21wb3NpdGVEcmFnQW5kRHJvcERhdGEsIHRhcmdldENvbXBvc2l0ZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNhbkRyb3AoZGF0YSwgdGFyZ2V0Q29tcG9zaXRlSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUYXJnZXRJbmRleCh0YXJnZXRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBiZWZvcmUyZDogQmVmb3JlMkQgfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGFyZ2V0SWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLmdldEl0ZW1zKCk7XG5cdFx0Y29uc3QgYmVmb3JlID0gdGhpcy5vcmllbnRhdGlvbiA9PT0gQWN0aW9uc09yaWVudGF0aW9uLkhPUklaT05UQUwgPyBiZWZvcmUyZD8uaG9yaXpvbnRhbGx5QmVmb3JlIDogYmVmb3JlMmQ/LnZlcnRpY2FsbHlCZWZvcmU7XG5cdFx0cmV0dXJuIGl0ZW1zLmZpbHRlcihpdGVtID0+IGl0ZW0udmlzaWJsZSkuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5pZCA9PT0gdGFyZ2V0SWQpICsgKGJlZm9yZSA/IDAgOiAxKTtcblx0fVxuXG5cdHByaXZhdGUgY2FuRHJvcChkYXRhOiBDb21wb3NpdGVEcmFnQW5kRHJvcERhdGEsIHRhcmdldENvbXBvc2l0ZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRjb25zdCBkcmFnRGF0YSA9IGRhdGEuZ2V0RGF0YSgpO1xuXG5cdFx0aWYgKGRyYWdEYXRhLnR5cGUgPT09ICdjb21wb3NpdGUnKSB7XG5cblx0XHRcdC8vIERyYWdnaW5nIGEgY29tcG9zaXRlXG5cdFx0XHRjb25zdCBjdXJyZW50Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoZHJhZ0RhdGEuaWQpITtcblx0XHRcdGNvbnN0IGN1cnJlbnRMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbihjdXJyZW50Q29udGFpbmVyKTtcblxuXHRcdFx0Ly8gLi4uIHRvIHRoZSBzYW1lIGNvbXBvc2l0ZSBsb2NhdGlvblxuXHRcdFx0aWYgKGN1cnJlbnRMb2NhdGlvbiA9PT0gdGhpcy50YXJnZXRDb250YWluZXJMb2NhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gZHJhZ0RhdGEuaWQgIT09IHRhcmdldENvbXBvc2l0ZUlkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXG5cdFx0XHQvLyBEcmFnZ2luZyBhbiBpbmRpdmlkdWFsIHZpZXdcblx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0Rlc2NyaXB0b3JCeUlkKGRyYWdEYXRhLmlkKTtcblxuXHRcdFx0Ly8gLi4uIHRoYXQgY2Fubm90IG1vdmVcblx0XHRcdGlmICghdmlld0Rlc2NyaXB0b3I/LmNhbk1vdmVWaWV3KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gLi4uIHRvIGNyZWF0ZSBhIHZpZXcgY29udGFpbmVyXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9zaXRlQmFyT3B0aW9ucyB7XG5cblx0cmVhZG9ubHkgaWNvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbjtcblx0cmVhZG9ubHkgY29sb3JzOiAodGhlbWU6IElDb2xvclRoZW1lKSA9PiBJQ29tcG9zaXRlQmFyQ29sb3JzO1xuXHRyZWFkb25seSBjb21wYWN0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29tcG9zaXRlU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBvdmVyZmxvd0FjdGlvblNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgZG5kSGFuZGxlcjogSUNvbXBvc2l0ZURyYWdBbmREcm9wO1xuXHRyZWFkb25seSBhY3Rpdml0eUhvdmVyT3B0aW9uczogSUFjdGl2aXR5SG92ZXJPcHRpb25zO1xuXHRyZWFkb25seSBwcmV2ZW50TG9vcE5hdmlnYXRpb24/OiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IGdldEFjdGl2aXR5QWN0aW9uOiAoY29tcG9zaXRlSWQ6IHN0cmluZykgPT4gQ29tcG9zaXRlQmFyQWN0aW9uO1xuXHRyZWFkb25seSBnZXRDb21wb3NpdGVQaW5uZWRBY3Rpb246IChjb21wb3NpdGVJZDogc3RyaW5nKSA9PiBJQWN0aW9uO1xuXHRyZWFkb25seSBnZXRDb21wb3NpdGVCYWRnZUFjdGlvbjogKGNvbXBvc2l0ZUlkOiBzdHJpbmcpID0+IElBY3Rpb247XG5cdHJlYWRvbmx5IGdldE9uQ29tcG9zaXRlQ2xpY2tBY3Rpb246IChjb21wb3NpdGVJZDogc3RyaW5nKSA9PiBJQWN0aW9uO1xuXHRyZWFkb25seSBmaWxsRXh0cmFDb250ZXh0TWVudUFjdGlvbnM6IChhY3Rpb25zOiBJQWN0aW9uW10sIGU/OiBNb3VzZUV2ZW50IHwgR2VzdHVyZUV2ZW50KSA9PiB2b2lkO1xuXHRyZWFkb25seSBnZXRDb250ZXh0TWVudUFjdGlvbnNGb3JDb21wb3NpdGU6IChjb21wb3NpdGVJZDogc3RyaW5nKSA9PiBJQWN0aW9uW107XG5cblx0cmVhZG9ubHkgb3BlbkNvbXBvc2l0ZTogKGNvbXBvc2l0ZUlkOiBzdHJpbmcsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKSA9PiBQcm9taXNlPElDb21wb3NpdGUgfCBudWxsPjtcblx0cmVhZG9ubHkgZ2V0RGVmYXVsdENvbXBvc2l0ZUlkOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIENvbXBvc2l0ZUJhckRuZENhbGxiYWNrcyBpbXBsZW1lbnRzIElDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyQ2FsbGJhY2tzIHtcblxuXHRwcml2YXRlIGluc2VydERyb3BCZWZvcmU6IEJlZm9yZTJEIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29tcG9zaXRlQmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbkJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb21wb3NpdGVCYXJNb2RlbDogQ29tcG9zaXRlQmFyTW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkbmRIYW5kbGVyOiBJQ29tcG9zaXRlRHJhZ0FuZERyb3AsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uLFxuXHQpIHsgfVxuXG5cdG9uRHJhZ092ZXIoZTogSURyYWdnZWRDb21wb3NpdGVEYXRhKSB7XG5cblx0XHQvLyBkb24ndCBhZGQgZmVlZGJhY2sgaWYgdGhpcyBpcyBvdmVyIHRoZSBjb21wb3NpdGUgYmFyIGFjdGlvbnMgb3IgdGhlcmUgYXJlIG5vIGFjdGlvbnNcblx0XHRjb25zdCB2aXNpYmxlSXRlbXMgPSB0aGlzLmNvbXBvc2l0ZUJhck1vZGVsLnZpc2libGVJdGVtcztcblx0XHRpZiAoIXZpc2libGVJdGVtcy5sZW5ndGggfHwgKGUuZXZlbnREYXRhLnRhcmdldCAmJiBpc0FuY2VzdG9yKGUuZXZlbnREYXRhLnRhcmdldCBhcyBIVE1MRWxlbWVudCwgdGhpcy5hY3Rpb25CYXJDb250YWluZXIpKSkge1xuXHRcdFx0dGhpcy5pbnNlcnREcm9wQmVmb3JlID0gdGhpcy51cGRhdGVGcm9tRHJhZ2dpbmcodGhpcy5jb21wb3NpdGVCYXJDb250YWluZXIsIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zZXJ0QXRGcm9udCA9IHRoaXMuaW5zZXJ0QXRGcm9udCh0aGlzLmFjdGlvbkJhckNvbnRhaW5lciwgZS5ldmVudERhdGEpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGluc2VydEF0RnJvbnQgPyB2aXNpYmxlSXRlbXNbMF0gOiB2aXNpYmxlSXRlbXNbdmlzaWJsZUl0ZW1zLmxlbmd0aCAtIDFdO1xuXHRcdGNvbnN0IHZhbGlkRHJvcFRhcmdldCA9IHRoaXMuZG5kSGFuZGxlci5vbkRyYWdPdmVyKGUuZHJhZ0FuZERyb3BEYXRhLCB0YXJnZXQuaWQsIGUuZXZlbnREYXRhKTtcblx0XHR0b2dnbGVEcm9wRWZmZWN0KGUuZXZlbnREYXRhLmRhdGFUcmFuc2ZlciwgJ21vdmUnLCB2YWxpZERyb3BUYXJnZXQpO1xuXHRcdHRoaXMuaW5zZXJ0RHJvcEJlZm9yZSA9IHRoaXMudXBkYXRlRnJvbURyYWdnaW5nKHRoaXMuY29tcG9zaXRlQmFyQ29udGFpbmVyLCB2YWxpZERyb3BUYXJnZXQsIGluc2VydEF0RnJvbnQsIHRydWUpO1xuXHR9XG5cblx0b25EcmFnTGVhdmUoZTogSURyYWdnZWRDb21wb3NpdGVEYXRhKSB7XG5cdFx0dGhpcy5pbnNlcnREcm9wQmVmb3JlID0gdGhpcy51cGRhdGVGcm9tRHJhZ2dpbmcodGhpcy5jb21wb3NpdGVCYXJDb250YWluZXIsIGZhbHNlLCBmYWxzZSwgZmFsc2UpO1xuXHR9XG5cblx0b25EcmFnRW5kKGU6IElEcmFnZ2VkQ29tcG9zaXRlRGF0YSkge1xuXHRcdHRoaXMuaW5zZXJ0RHJvcEJlZm9yZSA9IHRoaXMudXBkYXRlRnJvbURyYWdnaW5nKHRoaXMuY29tcG9zaXRlQmFyQ29udGFpbmVyLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fVxuXG5cdG9uRHJvcChlOiBJRHJhZ2dlZENvbXBvc2l0ZURhdGEpIHtcblx0XHRjb25zdCB2aXNpYmxlSXRlbXMgPSB0aGlzLmNvbXBvc2l0ZUJhck1vZGVsLnZpc2libGVJdGVtcztcblx0XHRsZXQgdGFyZ2V0SWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHZpc2libGVJdGVtcy5sZW5ndGgpIHtcblx0XHRcdHRhcmdldElkID0gdGhpcy5pbnNlcnRBdEZyb250KHRoaXMuYWN0aW9uQmFyQ29udGFpbmVyLCBlLmV2ZW50RGF0YSkgPyB2aXNpYmxlSXRlbXNbMF0uaWQgOiB2aXNpYmxlSXRlbXNbdmlzaWJsZUl0ZW1zLmxlbmd0aCAtIDFdLmlkO1xuXHRcdH1cblx0XHR0aGlzLmRuZEhhbmRsZXIuZHJvcChlLmRyYWdBbmREcm9wRGF0YSwgdGFyZ2V0SWQsIGUuZXZlbnREYXRhLCB0aGlzLmluc2VydERyb3BCZWZvcmUpO1xuXHRcdHRoaXMuaW5zZXJ0RHJvcEJlZm9yZSA9IHRoaXMudXBkYXRlRnJvbURyYWdnaW5nKHRoaXMuY29tcG9zaXRlQmFyQ29udGFpbmVyLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgaW5zZXJ0QXRGcm9udChlbGVtZW50OiBIVE1MRWxlbWVudCwgZXZlbnQ6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHBvc1ggPSBldmVudC5jbGllbnRYO1xuXHRcdGNvbnN0IHBvc1kgPSBldmVudC5jbGllbnRZO1xuXG5cdFx0c3dpdGNoICh0aGlzLm9yaWVudGF0aW9uKSB7XG5cdFx0XHRjYXNlIEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMOlxuXHRcdFx0XHRyZXR1cm4gcG9zWCA8IHJlY3QubGVmdDtcblx0XHRcdGNhc2UgQWN0aW9uc09yaWVudGF0aW9uLlZFUlRJQ0FMOlxuXHRcdFx0XHRyZXR1cm4gcG9zWSA8IHJlY3QudG9wO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRnJvbURyYWdnaW5nKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBzaG93RmVlZGJhY2s6IGJvb2xlYW4sIGZyb250OiBib29sZWFuLCBpc0RyYWdnaW5nOiBib29sZWFuKTogQmVmb3JlMkQgfCB1bmRlZmluZWQge1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZHJhZ2dlZC1vdmVyJywgaXNEcmFnZ2luZyk7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkcmFnZ2VkLW92ZXItaGVhZCcsIHNob3dGZWVkYmFjayAmJiBmcm9udCk7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdkcmFnZ2VkLW92ZXItdGFpbCcsIHNob3dGZWVkYmFjayAmJiAhZnJvbnQpO1xuXG5cdFx0aWYgKCFzaG93RmVlZGJhY2spIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdmVydGljYWxseUJlZm9yZTogZnJvbnQsIGhvcml6b250YWxseUJlZm9yZTogZnJvbnQgfTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29tcG9zaXRlQmFyIGV4dGVuZHMgV2lkZ2V0IGltcGxlbWVudHMgSUNvbXBvc2l0ZUJhciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIGRpbWVuc2lvbjogRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY29tcG9zaXRlU3dpdGNoZXJCYXI6IEFjdGlvbkJhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb21wb3NpdGVPdmVyZmxvd0FjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDb21wb3NpdGVPdmVyZmxvd0FjdGl2aXR5QWN0aW9uPigpKTtcblx0cHJpdmF0ZSBjb21wb3NpdGVPdmVyZmxvd0FjdGlvblZpZXdJdGVtID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENvbXBvc2l0ZU92ZXJmbG93QWN0aXZpdHlBY3Rpb25WaWV3SXRlbT4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogQ29tcG9zaXRlQmFyTW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJsZUNvbXBvc2l0ZXM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvc2l0ZVNpemVJbkJhcjogTWFwPHN0cmluZywgbnVtYmVyPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpdGVtczogSUNvbXBvc2l0ZUJhckl0ZW1bXSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElDb21wb3NpdGVCYXJPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5tb2RlbCA9IG5ldyBDb21wb3NpdGVCYXJNb2RlbChpdGVtcywgb3B0aW9ucyk7XG5cdFx0dGhpcy52aXNpYmxlQ29tcG9zaXRlcyA9IFtdO1xuXHRcdHRoaXMuY29tcG9zaXRlU2l6ZUluQmFyID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHR0aGlzLmNvbXB1dGVTaXplcyh0aGlzLm1vZGVsLnZpc2libGVJdGVtcyk7XG5cdH1cblxuXHRnZXRDb21wb3NpdGVCYXJJdGVtcygpOiBJQ29tcG9zaXRlQmFySXRlbVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMubW9kZWwuaXRlbXNdO1xuXHR9XG5cblx0c2V0Q29tcG9zaXRlQmFySXRlbXMoaXRlbXM6IElDb21wb3NpdGVCYXJJdGVtW10pOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNldEl0ZW1zKGl0ZW1zKTtcblx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKHRydWUpO1xuXHR9XG5cblx0Z2V0UGlubmVkQ29tcG9zaXRlcygpOiBJQ29tcG9zaXRlQmFySXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5waW5uZWRJdGVtcztcblx0fVxuXG5cdGdldFBpbm5lZENvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0UGlubmVkQ29tcG9zaXRlcygpLm1hcChjID0+IGMuaWQpO1xuXHR9XG5cblx0Z2V0VmlzaWJsZUNvbXBvc2l0ZXMoKTogSUNvbXBvc2l0ZUJhckl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwudmlzaWJsZUl0ZW1zO1xuXHR9XG5cblx0Y3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgYWN0aW9uQmFyRGl2ID0gcGFyZW50LmFwcGVuZENoaWxkKCQoJy5jb21wb3NpdGUtYmFyJykpO1xuXHRcdHRoaXMuY29tcG9zaXRlU3dpdGNoZXJCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKGFjdGlvbkJhckRpdiwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgQ29tcG9zaXRlT3ZlcmZsb3dBY3Rpdml0eUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbXBvc2l0ZU92ZXJmbG93QWN0aW9uVmlld0l0ZW0udmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMubW9kZWwuZmluZEl0ZW0oYWN0aW9uLmlkKTtcblx0XHRcdFx0cmV0dXJuIGl0ZW0gJiYgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRDb21wb3NpdGVBY3Rpb25WaWV3SXRlbSxcblx0XHRcdFx0XHR7IC4uLm9wdGlvbnMsIGRyYWdnYWJsZTogdHJ1ZSwgY29sb3JzOiB0aGlzLm9wdGlvbnMuY29sb3JzLCBpY29uOiB0aGlzLm9wdGlvbnMuaWNvbiwgaG92ZXJPcHRpb25zOiB0aGlzLm9wdGlvbnMuYWN0aXZpdHlIb3Zlck9wdGlvbnMsIGNvbXBhY3Q6IHRoaXMub3B0aW9ucy5jb21wYWN0IH0sXG5cdFx0XHRcdFx0YWN0aW9uIGFzIENvbXBvc2l0ZUJhckFjdGlvbixcblx0XHRcdFx0XHRpdGVtLnBpbm5lZEFjdGlvbixcblx0XHRcdFx0XHRpdGVtLnRvZ2dsZUJhZGdlQWN0aW9uLFxuXHRcdFx0XHRcdGNvbXBvc2l0ZUlkID0+IHRoaXMub3B0aW9ucy5nZXRDb250ZXh0TWVudUFjdGlvbnNGb3JDb21wb3NpdGUoY29tcG9zaXRlSWQpLFxuXHRcdFx0XHRcdCgpID0+IHRoaXMuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCksXG5cdFx0XHRcdFx0dGhpcy5vcHRpb25zLmRuZEhhbmRsZXIsXG5cdFx0XHRcdFx0dGhpc1xuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHRcdG9yaWVudGF0aW9uOiB0aGlzLm9wdGlvbnMub3JpZW50YXRpb24sXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdhY3Rpdml0eUJhckFyaWFMYWJlbCcsIFwiQWN0aXZlIFZpZXcgU3dpdGNoZXJcIiksXG5cdFx0XHRhcmlhUm9sZTogJ3RhYmxpc3QnLFxuXHRcdFx0cHJldmVudExvb3BOYXZpZ2F0aW9uOiB0aGlzLm9wdGlvbnMucHJldmVudExvb3BOYXZpZ2F0aW9uLFxuXHRcdFx0dHJpZ2dlcktleXM6IHsga2V5RG93bjogdHJ1ZSB9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGV4dG1lbnUgZm9yIGNvbXBvc2l0ZXNcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIocGFyZW50LCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHRoaXMuc2hvd0NvbnRleHRNZW51KGdldFdpbmRvdyhwYXJlbnQpLCBlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KHBhcmVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYXJlbnQsIFRvdWNoRXZlbnRUeXBlLkNvbnRleHRtZW51LCBlID0+IHRoaXMuc2hvd0NvbnRleHRNZW51KGdldFdpbmRvdyhwYXJlbnQpLCBlKSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYSBkcm9wIHRhcmdldCBvbiB0aGUgd2hvbGUgYmFyIHRvIHByZXZlbnQgZm9yYmlkZGVuIGZlZWRiYWNrXG5cdFx0Y29uc3QgZG5kQ2FsbGJhY2sgPSBuZXcgQ29tcG9zaXRlQmFyRG5kQ2FsbGJhY2tzKHBhcmVudCwgYWN0aW9uQmFyRGl2LCB0aGlzLm1vZGVsLCB0aGlzLm9wdGlvbnMuZG5kSGFuZGxlciwgdGhpcy5vcHRpb25zLm9yaWVudGF0aW9uKTtcblx0XHR0aGlzLl9yZWdpc3RlcihDb21wb3NpdGVEcmFnQW5kRHJvcE9ic2VydmVyLklOU1RBTkNFLnJlZ2lzdGVyVGFyZ2V0KHBhcmVudCwgZG5kQ2FsbGJhY2spKTtcblxuXHRcdHJldHVybiBhY3Rpb25CYXJEaXY7XG5cdH1cblxuXHRmb2N1cyhpbmRleD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuY29tcG9zaXRlU3dpdGNoZXJCYXI/LmZvY3VzKGluZGV4KTtcblx0fVxuXG5cdHJlY29tcHV0ZVNpemVzKCk6IHZvaWQge1xuXHRcdHRoaXMuY29tcHV0ZVNpemVzKHRoaXMubW9kZWwudmlzaWJsZUl0ZW1zKTtcblx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCk7XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblxuXHRcdGlmIChkaW1lbnNpb24uaGVpZ2h0ID09PSAwIHx8IGRpbWVuc2lvbi53aWR0aCA9PT0gMCkge1xuXHRcdFx0Ly8gRG8gbm90IGxheW91dCBpZiBub3QgdmlzaWJsZS4gT3RoZXJ3aXNlIHRoZSBzaXplIG1lYXN1cm1lbnQgd291bGQgYmUgY29tcHV0ZWQgd3JvbmdseVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbXBvc2l0ZVNpemVJbkJhci5zaXplID09PSAwKSB7XG5cdFx0XHQvLyBDb21wdXRlIHNpemUgb2YgZWFjaCBjb21wb3NpdGUgYnkgZ2V0dGluZyB0aGUgc2l6ZSBmcm9tIHRoZSBjc3MgcmVuZGVyZXJcblx0XHRcdC8vIFNpemUgaXMgbGF0ZXIgdXNlZCBmb3Igb3ZlcmZsb3cgY29tcHV0YXRpb25cblx0XHRcdHRoaXMuY29tcHV0ZVNpemVzKHRoaXMubW9kZWwudmlzaWJsZUl0ZW1zKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCk7XG5cdH1cblxuXHRhZGRDb21wb3NpdGUoeyBpZCwgbmFtZSwgb3JkZXIsIHJlcXVlc3RlZEluZGV4IH06IHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBvcmRlcj86IG51bWJlcjsgcmVxdWVzdGVkSW5kZXg/OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm1vZGVsLmFkZChpZCwgbmFtZSwgb3JkZXIsIHJlcXVlc3RlZEluZGV4KSkge1xuXHRcdFx0dGhpcy5jb21wdXRlU2l6ZXMoW3RoaXMubW9kZWwuZmluZEl0ZW0oaWQpXSk7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlQ29tcG9zaXRlKGlkOiBzdHJpbmcpOiB2b2lkIHtcblxuXHRcdC8vIElmIGl0IHBpbm5lZCwgdW5waW4gaXQgZmlyc3Rcblx0XHRpZiAodGhpcy5pc1Bpbm5lZChpZCkpIHtcblx0XHRcdHRoaXMudW5waW4oaWQpO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBmcm9tIHRoZSBtb2RlbFxuXHRcdGlmICh0aGlzLm1vZGVsLnJlbW92ZShpZCkpIHtcblx0XHRcdHRoaXMudXBkYXRlQ29tcG9zaXRlU3dpdGNoZXIoKTtcblx0XHR9XG5cdH1cblxuXHRoaWRlQ29tcG9zaXRlKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tb2RlbC5oaWRlKGlkKSkge1xuXHRcdFx0dGhpcy5yZXNldEFjdGl2ZUNvbXBvc2l0ZShpZCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0YWN0aXZhdGVDb21wb3NpdGUoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzQWN0aXZlSXRlbSA9IHRoaXMubW9kZWwuYWN0aXZlSXRlbTtcblx0XHRpZiAodGhpcy5tb2RlbC5hY3RpdmF0ZShpZCkpIHtcblx0XHRcdC8vIFVwZGF0ZSBpZiBjdXJyZW50IGNvbXBvc2l0ZSBpcyBuZWl0aGVyIHZpc2libGUgbm9yIHBpbm5lZFxuXHRcdFx0Ly8gb3IgcHJldmlvdXMgYWN0aXZlIGNvbXBvc2l0ZSBpcyBub3QgcGlubmVkXG5cdFx0XHRpZiAodGhpcy52aXNpYmxlQ29tcG9zaXRlcy5pbmRleE9mKGlkKSA9PT0gLSAxIHx8ICghIXRoaXMubW9kZWwuYWN0aXZlSXRlbSAmJiAhdGhpcy5tb2RlbC5hY3RpdmVJdGVtLnBpbm5lZCkgfHwgKHByZXZpb3VzQWN0aXZlSXRlbSAmJiAhcHJldmlvdXNBY3RpdmVJdGVtLnBpbm5lZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRlYWN0aXZhdGVDb21wb3NpdGUoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzQWN0aXZlSXRlbSA9IHRoaXMubW9kZWwuYWN0aXZlSXRlbTtcblx0XHRpZiAodGhpcy5tb2RlbC5kZWFjdGl2YXRlKCkpIHtcblx0XHRcdGlmIChwcmV2aW91c0FjdGl2ZUl0ZW0gJiYgIXByZXZpb3VzQWN0aXZlSXRlbS5waW5uZWQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHBpbihjb21wb3NpdGVJZDogc3RyaW5nLCBvcGVuPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLm1vZGVsLnNldFBpbm5lZChjb21wb3NpdGVJZCwgdHJ1ZSkpIHtcblx0XHRcdHRoaXMudXBkYXRlQ29tcG9zaXRlU3dpdGNoZXIoKTtcblxuXHRcdFx0aWYgKG9wZW4pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcHRpb25zLm9wZW5Db21wb3NpdGUoY29tcG9zaXRlSWQpO1xuXHRcdFx0XHR0aGlzLmFjdGl2YXRlQ29tcG9zaXRlKGNvbXBvc2l0ZUlkKTsgLy8gQWN0aXZhdGUgYWZ0ZXIgb3BlbmluZ1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHVucGluKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tb2RlbC5zZXRQaW5uZWQoY29tcG9zaXRlSWQsIGZhbHNlKSkge1xuXG5cdFx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCk7XG5cblx0XHRcdHRoaXMucmVzZXRBY3RpdmVDb21wb3NpdGUoY29tcG9zaXRlSWQpO1xuXHRcdH1cblx0fVxuXG5cdGFyZUJhZGdlc0VuYWJsZWQoY29tcG9zaXRlSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGUoY29tcG9zaXRlSWQpO1xuXHR9XG5cblx0dG9nZ2xlQmFkZ2VFbmFibGVtZW50KGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5zZXRWaWV3Q29udGFpbmVyQmFkZ2VFbmFibGVtZW50U3RhdGUoY29tcG9zaXRlSWQsICF0aGlzLmFyZUJhZGdlc0VuYWJsZWQoY29tcG9zaXRlSWQpKTtcblx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKCk7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMubW9kZWwuZmluZEl0ZW0oY29tcG9zaXRlSWQpO1xuXHRcdGlmIChpdGVtKSB7XG5cdFx0XHQvLyBUT0RPIEBscmFtb3MxNSBob3cgZG8gd2UgdGVsbCB0aGUgYWN0aXZpdHkgdG8gcmUtcmVuZGVyIHRoZSBiYWRnZT8gVGhpcyB0cmlnZ2VycyBhbiBvbkRpZENoYW5nZSBidXQgaXNuJ3QgdGhlIHJpZ2h0IHdheSB0byBkbyBpdC5cblx0XHRcdC8vIEkgY291bGQgYWRkIGFub3RoZXIgc3BlY2lmaWMgZnVuY3Rpb24gbGlrZSBgYWN0aXZpdHkudXBkYXRlQmFkZ2VFbmFibGVtZW50YCB3b3VsZCB0aGVuIHRoZSBhY3Rpdml0eSBzdG9yZSB0aGUgc2F0ZT9cblx0XHRcdGl0ZW0uYWN0aXZpdHlBY3Rpb24uYWN0aXZpdGllcyA9IGl0ZW0uYWN0aXZpdHlBY3Rpb24uYWN0aXZpdGllcztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc2V0QWN0aXZlQ29tcG9zaXRlKGNvbXBvc2l0ZUlkOiBzdHJpbmcpIHtcblx0XHRjb25zdCBkZWZhdWx0Q29tcG9zaXRlSWQgPSB0aGlzLm9wdGlvbnMuZ2V0RGVmYXVsdENvbXBvc2l0ZUlkKCk7XG5cblx0XHQvLyBDYXNlOiBjb21wb3NpdGUgaXMgbm90IHRoZSBhY3RpdmUgb25lIG9yIHRoZSBhY3RpdmUgb25lIGlzIGEgZGlmZmVyZW50IG9uZVxuXHRcdC8vIFNvbHY6IHdlIGRvIG5vdGhpbmdcblx0XHRpZiAoIXRoaXMubW9kZWwuYWN0aXZlSXRlbSB8fCB0aGlzLm1vZGVsLmFjdGl2ZUl0ZW0uaWQgIT09IGNvbXBvc2l0ZUlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGVhY3RpdmF0ZSBpdHNlbGZcblx0XHR0aGlzLmRlYWN0aXZhdGVDb21wb3NpdGUoY29tcG9zaXRlSWQpO1xuXG5cdFx0Ly8gQ2FzZTogY29tcG9zaXRlIGlzIG5vdCB0aGUgZGVmYXVsdCBjb21wb3NpdGUgYW5kIGRlZmF1bHQgY29tcG9zaXRlIGlzIHN0aWxsIHNob3dpbmdcblx0XHQvLyBTb2x2OiB3ZSBvcGVuIHRoZSBkZWZhdWx0IGNvbXBvc2l0ZVxuXHRcdGlmIChkZWZhdWx0Q29tcG9zaXRlSWQgJiYgZGVmYXVsdENvbXBvc2l0ZUlkICE9PSBjb21wb3NpdGVJZCAmJiB0aGlzLmlzUGlubmVkKGRlZmF1bHRDb21wb3NpdGVJZCkpIHtcblx0XHRcdHRoaXMub3B0aW9ucy5vcGVuQ29tcG9zaXRlKGRlZmF1bHRDb21wb3NpdGVJZCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FzZTogd2UgY2xvc2VkIHRoZSBkZWZhdWx0IGNvbXBvc2l0ZVxuXHRcdC8vIFNvbHY6IHdlIG9wZW4gdGhlIG5leHQgdmlzaWJsZSBjb21wb3NpdGUgZnJvbSB0b3Bcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IHZpc2libGVDb21wb3NpdGUgPSB0aGlzLnZpc2libGVDb21wb3NpdGVzLmZpbmQoY2lkID0+IGNpZCAhPT0gY29tcG9zaXRlSWQpO1xuXHRcdFx0aWYgKHZpc2libGVDb21wb3NpdGUpIHtcblx0XHRcdFx0dGhpcy5vcHRpb25zLm9wZW5Db21wb3NpdGUodmlzaWJsZUNvbXBvc2l0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aXNQaW5uZWQoY29tcG9zaXRlSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLm1vZGVsLmZpbmRJdGVtKGNvbXBvc2l0ZUlkKTtcblx0XHRyZXR1cm4gaXRlbT8ucGlubmVkO1xuXHR9XG5cblx0bW92ZShjb21wb3NpdGVJZDogc3RyaW5nLCB0b0NvbXBvc2l0ZUlkOiBzdHJpbmcsIGJlZm9yZT86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoYmVmb3JlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IGZyb21JbmRleCA9IHRoaXMubW9kZWwuaXRlbXMuZmluZEluZGV4KGMgPT4gYy5pZCA9PT0gY29tcG9zaXRlSWQpO1xuXHRcdFx0bGV0IHRvSW5kZXggPSB0aGlzLm1vZGVsLml0ZW1zLmZpbmRJbmRleChjID0+IGMuaWQgPT09IHRvQ29tcG9zaXRlSWQpO1xuXG5cdFx0XHRpZiAoZnJvbUluZGV4ID49IDAgJiYgdG9JbmRleCA+PSAwKSB7XG5cdFx0XHRcdGlmICghYmVmb3JlICYmIGZyb21JbmRleCA+IHRvSW5kZXgpIHtcblx0XHRcdFx0XHR0b0luZGV4Kys7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYmVmb3JlICYmIGZyb21JbmRleCA8IHRvSW5kZXgpIHtcblx0XHRcdFx0XHR0b0luZGV4LS07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodG9JbmRleCA8IHRoaXMubW9kZWwuaXRlbXMubGVuZ3RoICYmIHRvSW5kZXggPj0gMCAmJiB0b0luZGV4ICE9PSBmcm9tSW5kZXgpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5tb2RlbC5tb3ZlKHRoaXMubW9kZWwuaXRlbXNbZnJvbUluZGV4XS5pZCwgdGhpcy5tb2RlbC5pdGVtc1t0b0luZGV4XS5pZCkpIHtcblx0XHRcdFx0XHRcdC8vIHRpbWVvdXQgaGVscHMgdG8gcHJldmVudCBhcnRpZmFjdHMgZnJvbSBzaG93aW5nIHVwXG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMudXBkYXRlQ29tcG9zaXRlU3dpdGNoZXIoKSwgMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLm1vZGVsLm1vdmUoY29tcG9zaXRlSWQsIHRvQ29tcG9zaXRlSWQpKSB7XG5cdFx0XHRcdC8vIHRpbWVvdXQgaGVscHMgdG8gcHJldmVudCBhcnRpZmFjdHMgZnJvbSBzaG93aW5nIHVwXG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gdGhpcy51cGRhdGVDb21wb3NpdGVTd2l0Y2hlcigpLCAwKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRBY3Rpb24oY29tcG9zaXRlSWQ6IHN0cmluZyk6IENvbXBvc2l0ZUJhckFjdGlvbiB7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMubW9kZWwuZmluZEl0ZW0oY29tcG9zaXRlSWQpO1xuXG5cdFx0cmV0dXJuIGl0ZW0/LmFjdGl2aXR5QWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlU2l6ZXMoaXRlbXM6IElDb21wb3NpdGVCYXJNb2RlbEl0ZW1bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHNpemUgPSB0aGlzLm9wdGlvbnMuY29tcG9zaXRlU2l6ZTtcblx0XHRpZiAoc2l6ZSkge1xuXHRcdFx0aXRlbXMuZm9yRWFjaChjb21wb3NpdGUgPT4gdGhpcy5jb21wb3NpdGVTaXplSW5CYXIuc2V0KGNvbXBvc2l0ZS5pZCwgc2l6ZSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjb21wb3NpdGVTd2l0Y2hlckJhciA9IHRoaXMuY29tcG9zaXRlU3dpdGNoZXJCYXI7XG5cdFx0XHRpZiAoY29tcG9zaXRlU3dpdGNoZXJCYXIgJiYgdGhpcy5kaW1lbnNpb24gJiYgdGhpcy5kaW1lbnNpb24uaGVpZ2h0ICE9PSAwICYmIHRoaXMuZGltZW5zaW9uLndpZHRoICE9PSAwKSB7XG5cblx0XHRcdFx0Ly8gQ29tcHV0ZSBzaXplcyBvbmx5IGlmIHZpc2libGUuIE90aGVyd2lzZSB0aGUgc2l6ZSBtZWFzdXJtZW50IHdvdWxkIGJlIGNvbXB1dGVkIHdyb25nbHkuXG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRJdGVtc0xlbmd0aCA9IGNvbXBvc2l0ZVN3aXRjaGVyQmFyLnZpZXdJdGVtcy5sZW5ndGg7XG5cdFx0XHRcdGNvbXBvc2l0ZVN3aXRjaGVyQmFyLnB1c2goaXRlbXMubWFwKGNvbXBvc2l0ZSA9PiBjb21wb3NpdGUuYWN0aXZpdHlBY3Rpb24pKTtcblx0XHRcdFx0aXRlbXMubWFwKChjb21wb3NpdGUsIGluZGV4KSA9PiB0aGlzLmNvbXBvc2l0ZVNpemVJbkJhci5zZXQoY29tcG9zaXRlLmlkLCB0aGlzLm9wdGlvbnMub3JpZW50YXRpb24gPT09IEFjdGlvbnNPcmllbnRhdGlvbi5WRVJUSUNBTFxuXHRcdFx0XHRcdD8gY29tcG9zaXRlU3dpdGNoZXJCYXIuZ2V0SGVpZ2h0KGN1cnJlbnRJdGVtc0xlbmd0aCArIGluZGV4KVxuXHRcdFx0XHRcdDogY29tcG9zaXRlU3dpdGNoZXJCYXIuZ2V0V2lkdGgoY3VycmVudEl0ZW1zTGVuZ3RoICsgaW5kZXgpXG5cdFx0XHRcdCkpO1xuXHRcdFx0XHRpdGVtcy5mb3JFYWNoKCgpID0+IGNvbXBvc2l0ZVN3aXRjaGVyQmFyLnB1bGwoY29tcG9zaXRlU3dpdGNoZXJCYXIudmlld0l0ZW1zLmxlbmd0aCAtIDEpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbXBvc2l0ZVN3aXRjaGVyKGRvbm90VHJpZ2dlcj86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjb21wb3NpdGVTd2l0Y2hlckJhciA9IHRoaXMuY29tcG9zaXRlU3dpdGNoZXJCYXI7XG5cdFx0aWYgKCFjb21wb3NpdGVTd2l0Y2hlckJhciB8fCAhdGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHJldHVybjsgLy8gV2UgaGF2ZSBub3QgYmVlbiByZW5kZXJlZCB5ZXQgc28gdGhlcmUgaXMgbm90aGluZyB0byB1cGRhdGUuXG5cdFx0fVxuXG5cdFx0bGV0IGNvbXBvc2l0ZXNUb1Nob3cgPSB0aGlzLm1vZGVsLnZpc2libGVJdGVtcy5maWx0ZXIoaXRlbSA9PlxuXHRcdFx0aXRlbS5waW5uZWRcblx0XHRcdHx8ICh0aGlzLm1vZGVsLmFjdGl2ZUl0ZW0gJiYgdGhpcy5tb2RlbC5hY3RpdmVJdGVtLmlkID09PSBpdGVtLmlkKSAvKiBTaG93IHRoZSBhY3RpdmUgY29tcG9zaXRlIGV2ZW4gaWYgaXQgaXMgbm90IHBpbm5lZCAqL1xuXHRcdCkubWFwKGl0ZW0gPT4gaXRlbS5pZCk7XG5cblx0XHQvLyBFbnN1cmUgd2UgYXJlIG5vdCBzaG93aW5nIG1vcmUgY29tcG9zaXRlcyB0aGFuIHdlIGhhdmUgaGVpZ2h0IGZvclxuXHRcdGxldCBtYXhWaXNpYmxlID0gY29tcG9zaXRlc1RvU2hvdy5sZW5ndGg7XG5cdFx0Y29uc3QgdG90YWxDb21wb3NpdGVzID0gY29tcG9zaXRlc1RvU2hvdy5sZW5ndGg7XG5cdFx0bGV0IHNpemUgPSAwO1xuXHRcdGNvbnN0IGxpbWl0ID0gdGhpcy5vcHRpb25zLm9yaWVudGF0aW9uID09PSBBY3Rpb25zT3JpZW50YXRpb24uVkVSVElDQUwgPyB0aGlzLmRpbWVuc2lvbi5oZWlnaHQgOiB0aGlzLmRpbWVuc2lvbi53aWR0aDtcblxuXHRcdC8vIEFkZCBjb21wb3NpdGVzIHdoaWxlIHRoZXkgZml0XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb21wb3NpdGVzVG9TaG93Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBjb21wb3NpdGVTaXplID0gdGhpcy5jb21wb3NpdGVTaXplSW5CYXIuZ2V0KGNvbXBvc2l0ZXNUb1Nob3dbaV0pITtcblx0XHRcdC8vIEFkZGluZyB0aGlzIGNvbXBvc2l0ZSB3aWxsIG92ZXJmbG93IGF2YWlsYWJsZSBzaXplLCBzbyBkb24ndFxuXHRcdFx0aWYgKHNpemUgKyBjb21wb3NpdGVTaXplID4gbGltaXQpIHtcblx0XHRcdFx0bWF4VmlzaWJsZSA9IGk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRzaXplICs9IGNvbXBvc2l0ZVNpemU7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHRoZSB0YWlsIG9mIGNvbXBvc2l0ZXMgdGhhdCBkaWQgbm90IGZpdFxuXHRcdGlmICh0b3RhbENvbXBvc2l0ZXMgPiBtYXhWaXNpYmxlKSB7XG5cdFx0XHRjb21wb3NpdGVzVG9TaG93ID0gY29tcG9zaXRlc1RvU2hvdy5zbGljZSgwLCBtYXhWaXNpYmxlKTtcblx0XHR9XG5cblx0XHQvLyBXZSBhbHdheXMgdHJ5IHNob3cgdGhlIGFjdGl2ZSBjb21wb3NpdGUsIHNvIHJlLWFkZCBpdCBpZiBpdCB3YXMgc2xpY2VkIG91dFxuXHRcdGlmICh0aGlzLm1vZGVsLmFjdGl2ZUl0ZW0gJiYgY29tcG9zaXRlc1RvU2hvdy5ldmVyeShjb21wb3NpdGVJZCA9PiAhIXRoaXMubW9kZWwuYWN0aXZlSXRlbSAmJiBjb21wb3NpdGVJZCAhPT0gdGhpcy5tb2RlbC5hY3RpdmVJdGVtLmlkKSkge1xuXHRcdFx0c2l6ZSArPSB0aGlzLmNvbXBvc2l0ZVNpemVJbkJhci5nZXQodGhpcy5tb2RlbC5hY3RpdmVJdGVtLmlkKSE7XG5cdFx0XHRjb21wb3NpdGVzVG9TaG93LnB1c2godGhpcy5tb2RlbC5hY3RpdmVJdGVtLmlkKTtcblx0XHR9XG5cblx0XHQvLyBUaGUgYWN0aXZlIGNvbXBvc2l0ZSBtaWdodCBoYXZlIHB1c2hlZCB1cyBvdmVyIHRoZSBsaW1pdFxuXHRcdC8vIEtlZXAgcG9wcGluZyB0aGUgY29tcG9zaXRlIGJlZm9yZSB0aGUgYWN0aXZlIG9uZSB1bnRpbCBpdCBmaXRzXG5cdFx0Ly8gSWYgZXZlbiB0aGUgYWN0aXZlIG9uZSBkb2Vzbid0IGZpdCwgd2Ugd2lsbCByZXNvcnQgdG8gb3ZlcmZsb3dcblx0XHR3aGlsZSAoc2l6ZSA+IGxpbWl0ICYmIGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCByZW1vdmVkQ29tcG9zaXRlID0gY29tcG9zaXRlc1RvU2hvdy5sZW5ndGggPiAxID8gY29tcG9zaXRlc1RvU2hvdy5zcGxpY2UoY29tcG9zaXRlc1RvU2hvdy5sZW5ndGggLSAyLCAxKVswXSA6IGNvbXBvc2l0ZXNUb1Nob3cucG9wKCk7XG5cdFx0XHRzaXplIC09IHRoaXMuY29tcG9zaXRlU2l6ZUluQmFyLmdldChyZW1vdmVkQ29tcG9zaXRlISkhO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBvdmVyZmxvd2luZywgYWRkIHRoZSBvdmVyZmxvdyBzaXplXG5cdFx0aWYgKHRvdGFsQ29tcG9zaXRlcyA+IGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoKSB7XG5cdFx0XHRzaXplICs9IHRoaXMub3B0aW9ucy5vdmVyZmxvd0FjdGlvblNpemU7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgd2UgbmVlZCB0byBtYWtlIGV4dHJhIHJvb20gZm9yIHRoZSBvdmVyZmxvdyBhY3Rpb25cblx0XHR3aGlsZSAoc2l6ZSA+IGxpbWl0ICYmIGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCByZW1vdmVkQ29tcG9zaXRlID0gY29tcG9zaXRlc1RvU2hvdy5sZW5ndGggPiAxICYmIGNvbXBvc2l0ZXNUb1Nob3dbY29tcG9zaXRlc1RvU2hvdy5sZW5ndGggLSAxXSA9PT0gdGhpcy5tb2RlbC5hY3RpdmVJdGVtPy5pZCA/XG5cdFx0XHRcdGNvbXBvc2l0ZXNUb1Nob3cuc3BsaWNlKGNvbXBvc2l0ZXNUb1Nob3cubGVuZ3RoIC0gMiwgMSlbMF0gOiBjb21wb3NpdGVzVG9TaG93LnBvcCgpO1xuXHRcdFx0c2l6ZSAtPSB0aGlzLmNvbXBvc2l0ZVNpemVJbkJhci5nZXQocmVtb3ZlZENvbXBvc2l0ZSEpITtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgdGhlIG92ZXJmbG93IGFjdGlvbiBpZiB0aGVyZSBhcmUgbm8gb3ZlcmZsb3dzXG5cdFx0aWYgKHRvdGFsQ29tcG9zaXRlcyA9PT0gY29tcG9zaXRlc1RvU2hvdy5sZW5ndGggJiYgdGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvbi52YWx1ZSkge1xuXHRcdFx0Y29tcG9zaXRlU3dpdGNoZXJCYXIucHVsbChjb21wb3NpdGVTd2l0Y2hlckJhci5sZW5ndGgoKSAtIDEpO1xuXG5cdFx0XHR0aGlzLmNvbXBvc2l0ZU92ZXJmbG93QWN0aW9uLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvblZpZXdJdGVtLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFB1bGwgb3V0IGNvbXBvc2l0ZXMgdGhhdCBvdmVyZmxvdyBvciBnb3QgaGlkZGVuXG5cdFx0Y29uc3QgY29tcG9zaXRlc1RvUmVtb3ZlOiBudW1iZXJbXSA9IFtdO1xuXHRcdHRoaXMudmlzaWJsZUNvbXBvc2l0ZXMuZm9yRWFjaCgoY29tcG9zaXRlSWQsIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAoIWNvbXBvc2l0ZXNUb1Nob3cuaW5jbHVkZXMoY29tcG9zaXRlSWQpKSB7XG5cdFx0XHRcdGNvbXBvc2l0ZXNUb1JlbW92ZS5wdXNoKGluZGV4KTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb21wb3NpdGVzVG9SZW1vdmUucmV2ZXJzZSgpLmZvckVhY2goaW5kZXggPT4ge1xuXHRcdFx0Y29tcG9zaXRlU3dpdGNoZXJCYXIucHVsbChpbmRleCk7XG5cdFx0XHR0aGlzLnZpc2libGVDb21wb3NpdGVzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0fSk7XG5cblx0XHQvLyBVcGRhdGUgdGhlIHBvc2l0aW9ucyBvZiB0aGUgY29tcG9zaXRlc1xuXHRcdGNvbXBvc2l0ZXNUb1Nob3cuZm9yRWFjaCgoY29tcG9zaXRlSWQsIG5ld0luZGV4KSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50SW5kZXggPSB0aGlzLnZpc2libGVDb21wb3NpdGVzLmluZGV4T2YoY29tcG9zaXRlSWQpO1xuXHRcdFx0aWYgKG5ld0luZGV4ICE9PSBjdXJyZW50SW5kZXgpIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRjb21wb3NpdGVTd2l0Y2hlckJhci5wdWxsKGN1cnJlbnRJbmRleCk7XG5cdFx0XHRcdFx0dGhpcy52aXNpYmxlQ29tcG9zaXRlcy5zcGxpY2UoY3VycmVudEluZGV4LCAxKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbXBvc2l0ZVN3aXRjaGVyQmFyLnB1c2godGhpcy5tb2RlbC5maW5kSXRlbShjb21wb3NpdGVJZCkuYWN0aXZpdHlBY3Rpb24sIHsgbGFiZWw6IHRydWUsIGljb246IHRoaXMub3B0aW9ucy5pY29uLCBpbmRleDogbmV3SW5kZXggfSk7XG5cdFx0XHRcdHRoaXMudmlzaWJsZUNvbXBvc2l0ZXMuc3BsaWNlKG5ld0luZGV4LCAwLCBjb21wb3NpdGVJZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBBZGQgb3ZlcmZsb3cgYWN0aW9uIGFzIG5lZWRlZFxuXHRcdGlmICh0b3RhbENvbXBvc2l0ZXMgPiBjb21wb3NpdGVzVG9TaG93Lmxlbmd0aCAmJiAhdGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvbi52YWx1ZSkge1xuXHRcdFx0dGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvbi52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tcG9zaXRlT3ZlcmZsb3dBY3Rpdml0eUFjdGlvbiwgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNvbXBvc2l0ZU92ZXJmbG93QWN0aW9uVmlld0l0ZW0udmFsdWU/LnNob3dNZW51KCk7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuY29tcG9zaXRlT3ZlcmZsb3dBY3Rpb25WaWV3SXRlbS52YWx1ZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENvbXBvc2l0ZU92ZXJmbG93QWN0aXZpdHlBY3Rpb25WaWV3SXRlbSxcblx0XHRcdFx0dGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvbi52YWx1ZSxcblx0XHRcdFx0KCkgPT4gdGhpcy5nZXRPdmVyZmxvd2luZ0NvbXBvc2l0ZXMoKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5tb2RlbC5hY3RpdmVJdGVtID8gdGhpcy5tb2RlbC5hY3RpdmVJdGVtLmlkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21wb3NpdGVJZCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMubW9kZWwuZmluZEl0ZW0oY29tcG9zaXRlSWQpO1xuXHRcdFx0XHRcdHJldHVybiBpdGVtPy5hY3Rpdml0eVswXT8uYmFkZ2U7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoaXMub3B0aW9ucy5nZXRPbkNvbXBvc2l0ZUNsaWNrQWN0aW9uLFxuXHRcdFx0XHR0aGlzLm9wdGlvbnMuY29sb3JzLFxuXHRcdFx0XHR0aGlzLm9wdGlvbnMuYWN0aXZpdHlIb3Zlck9wdGlvbnNcblx0XHRcdCk7XG5cblx0XHRcdGNvbXBvc2l0ZVN3aXRjaGVyQmFyLnB1c2godGhpcy5jb21wb3NpdGVPdmVyZmxvd0FjdGlvbi52YWx1ZSwgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFkb25vdFRyaWdnZXIpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE92ZXJmbG93aW5nQ29tcG9zaXRlcygpOiB7IGlkOiBzdHJpbmc7IG5hbWU/OiBzdHJpbmcgfVtdIHtcblx0XHRsZXQgb3ZlcmZsb3dpbmdJZHMgPSB0aGlzLm1vZGVsLnZpc2libGVJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnBpbm5lZCkubWFwKGl0ZW0gPT4gaXRlbS5pZCk7XG5cblx0XHQvLyBTaG93IHRoZSBhY3RpdmUgY29tcG9zaXRlIGV2ZW4gaWYgaXQgaXMgbm90IHBpbm5lZFxuXHRcdGlmICh0aGlzLm1vZGVsLmFjdGl2ZUl0ZW0gJiYgIXRoaXMubW9kZWwuYWN0aXZlSXRlbS5waW5uZWQpIHtcblx0XHRcdG92ZXJmbG93aW5nSWRzLnB1c2godGhpcy5tb2RlbC5hY3RpdmVJdGVtLmlkKTtcblx0XHR9XG5cblx0XHRvdmVyZmxvd2luZ0lkcyA9IG92ZXJmbG93aW5nSWRzLmZpbHRlcihjb21wb3NpdGVJZCA9PiAhdGhpcy52aXNpYmxlQ29tcG9zaXRlcy5pbmNsdWRlcyhjb21wb3NpdGVJZCkpO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLnZpc2libGVJdGVtcy5maWx0ZXIoYyA9PiBvdmVyZmxvd2luZ0lkcy5pbmNsdWRlcyhjLmlkKSkubWFwKGl0ZW0gPT4geyByZXR1cm4geyBpZDogaXRlbS5pZCwgbmFtZTogdGhpcy5nZXRBY3Rpb24oaXRlbS5pZCk/LmxhYmVsIHx8IGl0ZW0ubmFtZSB9OyB9KTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0NvbnRleHRNZW51KHRhcmdldFdpbmRvdzogV2luZG93LCBlOiBNb3VzZUV2ZW50IHwgR2VzdHVyZUV2ZW50KTogdm9pZCB7XG5cdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudCh0YXJnZXRXaW5kb3csIGUpO1xuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXRDb250ZXh0TWVudUFjdGlvbnMoZSlcblx0XHR9KTtcblx0fVxuXG5cdGdldENvbnRleHRNZW51QWN0aW9ucyhlPzogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gdGhpcy5tb2RlbC52aXNpYmxlSXRlbXNcblx0XHRcdC5tYXAoKHsgaWQsIG5hbWUsIGFjdGl2aXR5QWN0aW9uIH0pID0+IHtcblx0XHRcdFx0Y29uc3QgaXNQaW5uZWQgPSB0aGlzLmlzUGlubmVkKGlkKTtcblx0XHRcdFx0cmV0dXJuIHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRsYWJlbDogdGhpcy5nZXRBY3Rpb24oaWQpLmxhYmVsIHx8IG5hbWUgfHwgaWQsXG5cdFx0XHRcdFx0Y2hlY2tlZDogaXNQaW5uZWQsXG5cdFx0XHRcdFx0ZW5hYmxlZDogYWN0aXZpdHlBY3Rpb24uZW5hYmxlZCAmJiAoIWlzUGlubmVkIHx8IHRoaXMuZ2V0UGlubmVkQ29tcG9zaXRlSWRzKCkubGVuZ3RoID4gMSksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5pc1Bpbm5lZChpZCkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy51bnBpbihpZCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnBpbihpZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0dGhpcy5vcHRpb25zLmZpbGxFeHRyYUNvbnRleHRNZW51QWN0aW9ucyhhY3Rpb25zLCBlKTtcblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ29tcG9zaXRlQmFyTW9kZWxJdGVtIGV4dGVuZHMgSUNvbXBvc2l0ZUJhckl0ZW0ge1xuXHRyZWFkb25seSBhY3Rpdml0eUFjdGlvbjogQ29tcG9zaXRlQmFyQWN0aW9uO1xuXHRyZWFkb25seSBwaW5uZWRBY3Rpb246IElBY3Rpb247XG5cdHJlYWRvbmx5IHRvZ2dsZUJhZGdlQWN0aW9uOiBJQWN0aW9uO1xuXHRyZWFkb25seSBhY3Rpdml0eTogSUFjdGl2aXR5W107XG59XG5cbmNsYXNzIENvbXBvc2l0ZUJhck1vZGVsIHtcblxuXHRwcml2YXRlIF9pdGVtczogSUNvbXBvc2l0ZUJhck1vZGVsSXRlbVtdID0gW107XG5cdGdldCBpdGVtcygpOiBJQ29tcG9zaXRlQmFyTW9kZWxJdGVtW10geyByZXR1cm4gdGhpcy5faXRlbXM7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElDb21wb3NpdGVCYXJPcHRpb25zO1xuXG5cdGFjdGl2ZUl0ZW0/OiBJQ29tcG9zaXRlQmFyTW9kZWxJdGVtO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGl0ZW1zOiBJQ29tcG9zaXRlQmFySXRlbVtdLFxuXHRcdG9wdGlvbnM6IElDb21wb3NpdGVCYXJPcHRpb25zXG5cdCkge1xuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5zZXRJdGVtcyhpdGVtcyk7XG5cdH1cblxuXHRzZXRJdGVtcyhpdGVtczogSUNvbXBvc2l0ZUJhckl0ZW1bXSk6IHZvaWQge1xuXHRcdHRoaXMuX2l0ZW1zID0gW107XG5cdFx0dGhpcy5faXRlbXMgPSBpdGVtc1xuXHRcdFx0Lm1hcChpID0+IHRoaXMuY3JlYXRlQ29tcG9zaXRlQmFySXRlbShpLmlkLCBpLm5hbWUsIGkub3JkZXIsIGkucGlubmVkLCBpLnZpc2libGUpKTtcblx0fVxuXG5cdGdldCB2aXNpYmxlSXRlbXMoKTogSUNvbXBvc2l0ZUJhck1vZGVsSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnZpc2libGUpO1xuXHR9XG5cblx0Z2V0IHBpbm5lZEl0ZW1zKCk6IElDb21wb3NpdGVCYXJNb2RlbEl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuaXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS52aXNpYmxlICYmIGl0ZW0ucGlubmVkKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29tcG9zaXRlQmFySXRlbShpZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG9yZGVyOiBudW1iZXIgfCB1bmRlZmluZWQsIHBpbm5lZDogYm9vbGVhbiwgdmlzaWJsZTogYm9vbGVhbik6IElDb21wb3NpdGVCYXJNb2RlbEl0ZW0ge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkLCBuYW1lLCBwaW5uZWQsIG9yZGVyLCB2aXNpYmxlLFxuXHRcdFx0YWN0aXZpdHk6IFtdLFxuXHRcdFx0Z2V0IGFjdGl2aXR5QWN0aW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5nZXRBY3Rpdml0eUFjdGlvbihpZCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHBpbm5lZEFjdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuZ2V0Q29tcG9zaXRlUGlubmVkQWN0aW9uKGlkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdG9nZ2xlQmFkZ2VBY3Rpb24oKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmdldENvbXBvc2l0ZUJhZGdlQWN0aW9uKGlkKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YWRkKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgb3JkZXI6IG51bWJlciB8IHVuZGVmaW5lZCwgcmVxdWVzdGVkSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLmZpbmRJdGVtKGlkKTtcblx0XHRpZiAoaXRlbSkge1xuXHRcdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGl0ZW0ubmFtZSA9IG5hbWU7XG5cdFx0XHRpZiAoIWlzVW5kZWZpbmVkT3JOdWxsKG9yZGVyKSkge1xuXHRcdFx0XHRjaGFuZ2VkID0gaXRlbS5vcmRlciAhPT0gb3JkZXI7XG5cdFx0XHRcdGl0ZW0ub3JkZXIgPSBvcmRlcjtcblx0XHRcdH1cblx0XHRcdGlmICghaXRlbS52aXNpYmxlKSB7XG5cdFx0XHRcdGl0ZW0udmlzaWJsZSA9IHRydWU7XG5cdFx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hhbmdlZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuY3JlYXRlQ29tcG9zaXRlQmFySXRlbShpZCwgbmFtZSwgb3JkZXIsIHRydWUsIHRydWUpO1xuXHRcdFx0aWYgKCFpc1VuZGVmaW5lZE9yTnVsbChyZXF1ZXN0ZWRJbmRleCkpIHtcblx0XHRcdFx0bGV0IGluZGV4ID0gMDtcblx0XHRcdFx0bGV0IHJJbmRleCA9IHJlcXVlc3RlZEluZGV4O1xuXHRcdFx0XHR3aGlsZSAockluZGV4ID4gMCAmJiBpbmRleCA8IHRoaXMuaXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXRlbXNbaW5kZXgrK10udmlzaWJsZSkge1xuXHRcdFx0XHRcdFx0ckluZGV4LS07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5pdGVtcy5zcGxpY2UoaW5kZXgsIDAsIGl0ZW0pO1xuXHRcdFx0fSBlbHNlIGlmIChpc1VuZGVmaW5lZE9yTnVsbChvcmRlcikpIHtcblx0XHRcdFx0dGhpcy5pdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGluZGV4ID0gMDtcblx0XHRcdFx0d2hpbGUgKGluZGV4IDwgdGhpcy5pdGVtcy5sZW5ndGggJiYgdHlwZW9mIHRoaXMuaXRlbXNbaW5kZXhdLm9yZGVyID09PSAnbnVtYmVyJyAmJiB0aGlzLml0ZW1zW2luZGV4XS5vcmRlciEgPCBvcmRlcikge1xuXHRcdFx0XHRcdGluZGV4Kys7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5pdGVtcy5zcGxpY2UoaW5kZXgsIDAsIGl0ZW0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLml0ZW1zLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0aWYgKHRoaXMuaXRlbXNbaW5kZXhdLmlkID09PSBpZCkge1xuXHRcdFx0XHR0aGlzLml0ZW1zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRoaWRlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5pdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0uaWQgPT09IGlkKSB7XG5cdFx0XHRcdGlmIChpdGVtLnZpc2libGUpIHtcblx0XHRcdFx0XHRpdGVtLnZpc2libGUgPSBmYWxzZTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdG1vdmUoY29tcG9zaXRlSWQ6IHN0cmluZywgdG9Db21wb3NpdGVJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cblx0XHRjb25zdCBmcm9tSW5kZXggPSB0aGlzLmZpbmRJbmRleChjb21wb3NpdGVJZCk7XG5cdFx0Y29uc3QgdG9JbmRleCA9IHRoaXMuZmluZEluZGV4KHRvQ29tcG9zaXRlSWQpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIGJvdGggaXRlbXMgYXJlIGtub3duIHRvIHRoZSBtb2RlbFxuXHRcdGlmIChmcm9tSW5kZXggPT09IC0xIHx8IHRvSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc291cmNlSXRlbSA9IHRoaXMuaXRlbXMuc3BsaWNlKGZyb21JbmRleCwgMSlbMF07XG5cdFx0dGhpcy5pdGVtcy5zcGxpY2UodG9JbmRleCwgMCwgc291cmNlSXRlbSk7XG5cblx0XHQvLyBNYWtlIHN1cmUgYSBtb3ZlZCBjb21wb3NpdGUgZ2V0cyBwaW5uZWRcblx0XHRzb3VyY2VJdGVtLnBpbm5lZCA9IHRydWU7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHNldFBpbm5lZChpZDogc3RyaW5nLCBwaW5uZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5pdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0uaWQgPT09IGlkKSB7XG5cdFx0XHRcdGlmIChpdGVtLnBpbm5lZCAhPT0gcGlubmVkKSB7XG5cdFx0XHRcdFx0aXRlbS5waW5uZWQgPSBwaW5uZWQ7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhY3RpdmF0ZShpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmFjdGl2ZUl0ZW0gfHwgdGhpcy5hY3RpdmVJdGVtLmlkICE9PSBpZCkge1xuXHRcdFx0aWYgKHRoaXMuYWN0aXZlSXRlbSkge1xuXHRcdFx0XHR0aGlzLmRlYWN0aXZhdGUoKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLml0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtLmlkID09PSBpZCkge1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlSXRlbSA9IGl0ZW07XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVJdGVtLmFjdGl2aXR5QWN0aW9uLmFjdGl2YXRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0ZGVhY3RpdmF0ZSgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5hY3RpdmVJdGVtKSB7XG5cdFx0XHR0aGlzLmFjdGl2ZUl0ZW0uYWN0aXZpdHlBY3Rpb24uZGVhY3RpdmF0ZSgpO1xuXHRcdFx0dGhpcy5hY3RpdmVJdGVtID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZpbmRJdGVtKGlkOiBzdHJpbmcpOiBJQ29tcG9zaXRlQmFyTW9kZWxJdGVtIHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLmlkID09PSBpZClbMF07XG5cdH1cblxuXHRwcml2YXRlIGZpbmRJbmRleChpZDogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgdGhpcy5pdGVtcy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGlmICh0aGlzLml0ZW1zW2luZGV4XS5pZCA9PT0gaWQpIHtcblx0XHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAtMTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFrQixnQkFBZ0I7QUFFbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxXQUFXLDBCQUEwQjtBQUM5QyxTQUFTLHlCQUF5QixpQ0FBaUMsK0NBQThIO0FBQ2pNLFNBQW9CLEdBQUcsdUJBQXVCLFdBQVcsYUFBYSxZQUFZLGlCQUFpQjtBQUNuRyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQWdDLDhCQUE4QjtBQUc5RCxTQUFtQyw4QkFBc0Ysd0JBQWdFO0FBQ3pMLFNBQVMsU0FBUyxhQUFhLHNCQUFvQztBQUNuRSxTQUFTLHlCQUF5QjtBQVkzQixNQUFNLHFCQUFzRDtBQUFBLEVBRWxFLFlBQ1MsdUJBQ0EseUJBQ0EsYUFDQSxlQUNBLGVBQ0EsVUFDUDtBQU5PO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBLEVBQ0w7QUFBQSxFQUVKLEtBQUssTUFBZ0MsbUJBQXVDLGVBQTBCLFFBQXlCO0FBQzlILFVBQU0sV0FBVyxLQUFLLFFBQVE7QUFFOUIsUUFBSSxTQUFTLFNBQVMsYUFBYTtBQUNsQyxZQUFNLG1CQUFtQixLQUFLLHNCQUFzQixxQkFBcUIsU0FBUyxFQUFFO0FBQ3BGLFlBQU0sa0JBQWtCLEtBQUssc0JBQXNCLHlCQUF5QixnQkFBZ0I7QUFDNUYsVUFBSSxRQUFRO0FBR1osVUFBSSxvQkFBb0IsS0FBSyx5QkFBeUI7QUFDckQsWUFBSSxtQkFBbUI7QUFDdEIsZUFBSyxjQUFjLFNBQVMsSUFBSSxtQkFBbUIs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
