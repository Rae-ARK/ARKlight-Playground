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
import { timeout } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { TerminalGroup } from "./terminalGroup.js";
import { getInstanceFromResource } from "./terminalUri.js";
import { TERMINAL_VIEW_ID } from "../common/terminal.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { asArray } from "../../../../base/common/arrays.js";
let TerminalGroupService = class extends Disposable {
  constructor(_contextKeyService, _instantiationService, _viewsService, _viewDescriptorService, _quickInputService) {
    super();
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._viewsService = _viewsService;
    this._viewDescriptorService = _viewDescriptorService;
    this._quickInputService = _quickInputService;
    this.groups = [];
    this.activeGroupIndex = -1;
    this.lastAccessedMenu = "inline-tab";
    this._isQuickInputOpened = false;
    this._onDidChangeActiveGroup = this._register(new Emitter());
    this.onDidChangeActiveGroup = this._onDidChangeActiveGroup.event;
    this._onDidDisposeGroup = this._register(new Emitter());
    this.onDidDisposeGroup = this._onDidDisposeGroup.event;
    this._onDidChangeGroups = this._register(new Emitter());
    this.onDidChangeGroups = this._onDidChangeGroups.event;
    this._onDidShow = this._register(new Emitter());
    this.onDidShow = this._onDidShow.event;
    this._onDidDisposeInstance = this._register(new Emitter());
    this.onDidDisposeInstance = this._onDidDisposeInstance.event;
    this._onDidFocusInstance = this._register(new Emitter());
    this.onDidFocusInstance = this._onDidFocusInstance.event;
    this._onDidChangeActiveInstance = this._register(new Emitter());
    this.onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
    this._onDidChangeInstances = this._register(new Emitter());
    this.onDidChangeInstances = this._onDidChangeInstances.event;
    this._onDidChangeInstanceCapability = this._register(new Emitter());
    this.onDidChangeInstanceCapability = this._onDidChangeInstanceCapability.event;
    this._onDidChangePanelOrientation = this._register(new Emitter());
    this.onDidChangePanelOrientation = this._onDidChangePanelOrientation.event;
    this._getValidTerminalGroups = (sources) => {
      return new Set(
        sources.map((source) => this.getGroupForInstance(source)).filter((group) => group !== void 0)
      );
    };
    const terminalGroupCountContextKey = TerminalContextKeys.groupCount.bindTo(this._contextKeyService);
    this._register(Event.runAndSubscribe(this.onDidChangeGroups, () => terminalGroupCountContextKey.set(this.groups.length)));
    const splitTerminalActiveContextKey = TerminalContextKeys.splitTerminalActive.bindTo(this._contextKeyService);
    this._register(Event.runAndSubscribe(this.onDidFocusInstance, () => {
      const activeInstance = this.activeInstance;
      splitTerminalActiveContextKey.set(activeInstance ? this.instanceIsSplit(activeInstance) : false);
    }));
    this._register(this.onDidDisposeGroup((group) => this._removeGroup(group)));
    this._register(Event.any(this.onDidChangeActiveGroup, this.onDidChangeInstances)(() => this.updateVisibility()));
    this._register(this._quickInputService.onShow(() => this._isQuickInputOpened = true));
    this._register(this._quickInputService.onHide(() => this._isQuickInputOpened = false));
  }
  get instances() {
    return this.groups.reduce((p, c) => p.concat(c.terminalInstances), []);
  }
  hidePanel() {
    const panel = this._viewDescriptorService.getViewContainerByViewId(TERMINAL_VIEW_ID);
    if (panel && this._viewDescriptorService.getViewContainerModel(panel).visibleViewDescriptors.length === 1) {
      this._viewsService.closeView(TERMINAL_VIEW_ID);
      TerminalContextKeys.tabsMouse.bindTo(this._contextKeyService).set(false);
    }
  }
  get activeGroup() {
    if (this.activeGroupIndex < 0 || this.activeGroupIndex >= this.groups.length) {
      return void 0;
    }
    return this.groups[this.activeGroupIndex];
  }
  set activeGroup(value) {
    if (value === void 0) {
      return;
    }
    const index = this.groups.findIndex((e) => e === value);
    this.setActiveGroupByIndex(index);
  }
  get activeInstance() {
    return this.activeGroup?.activeInstance;
  }
  setActiveInstance(instance) {
    this.setActiveInstanceByIndex(this._getIndexFromId(instance.instanceId));
  }
  _getIndexFromId(terminalId) {
    const terminalIndex = this.instances.findIndex((e) => e.instanceId === terminalId);
    if (terminalIndex === -1) {
      throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
    }
    return terminalIndex;
  }
  setContainer(container) {
    this._container = container;
    this.groups.forEach((group) => group.attachToElement(container));
  }
  async focusTabs() {
    if (this.instances.length === 0) {
      return;
    }
    await this.showPanel(true);
    const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
    pane?.terminalTabbedView?.focusTabs();
  }
  async focusHover() {
    if (this.instances.length === 0) {
      return;
    }
    const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
    pane?.terminalTabbedView?.focusHover();
  }
  async focusInstance(instance) {
    if (this.instances.includes(instance)) {
      this.setActiveInstance(instance);
    }
    await this.showPanel(true);
  }
  async focusActiveInstance() {
    return this.showPanel(true);
  }
  createGroup(slcOrInstance) {
    const group = this._instantiationService.createInstance(TerminalGroup, this._container, slcOrInstance);
    this.groups.push(group);
    group.addDisposable(Event.forward(group.onPanelOrientationChanged, this._onDidChangePanelOrientation));
    group.addDisposable(Event.forward(group.onDidDisposeInstance, this._onDidDisposeInstance));
    group.addDisposable(Event.forward(group.onDidFocusInstance, this._onDidFocusInstance));
    group.addDisposable(Event.forward(group.onDidChangeInstanceCapability, this._onDidChangeInstanceCapability));
    group.addDisposable(Event.forward(group.onInstancesChanged, this._onDidChangeInstances));
    group.addDisposable(Event.forward(group.onDisposed, this._onDidDisposeGroup));
    group.addDisposable(group.onDidChangeActiveInstance((e) => {
      if (group === this.activeGroup) {
        this._onDidChangeActiveInstance.fire(e);
      }
    }));
    if (group.terminalInstances.length > 0) {
      this._onDidChangeInstances.fire();
    }
    if (this.instances.length === 1) {
      this.setActiveInstanceByIndex(0);
    }
    this._onDidChangeGroups.fire();
    return group;
  }
  async showPanel(focus) {
    const pane = this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID) ?? await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
    pane?.setExpanded(true);
    if (focus) {
      await timeout(0);
      const instance = this.activeInstance;
      if (instance) {
        if (pane && !pane.isVisible()) {
          await this._viewsService.openView(TERMINAL_VIEW_ID, focus);
        }
        await instance.focusWhenReady(true);
      }
    }
    this._onDidShow.fire();
  }
  getInstanceFromResource(resource) {
    return getInstanceFromResource(this.instances, resource);
  }
  _removeGroup(group) {
    const activeGroup = this.activeGroup;
    const wasActiveGroup = group === activeGroup;
    const index = this.groups.indexOf(group);
    if (index !== -1) {
      this.groups.splice(index, 1);
      this._onDidChangeGroups.fire();
    }
    if (wasActiveGroup) {
      if (this.groups.length > 0 && !this._isQuickInputOpened) {
        const newIndex = index < this.groups.length ? index : this.groups.length - 1;
        this.setActiveGroupByIndex(newIndex, true);
        if (group.hadFocusOnExit) {
          this.activeInstance?.focus(true);
        }
      }
    } else {
      if (this.activeGroupIndex > index) {
        this.setActiveGroupByIndex(this.activeGroupIndex - 1);
      }
    }
    if (this.activeGroupIndex >= this.groups.length) {
      this.setActiveGroupByIndex(this.groups.length - 1);
    }
    this._onDidChangeInstances.fire();
    this._onDidChangeGroups.fire();
    if (wasActiveGroup) {
      this._onDidChangeActiveGroup.fire(this.activeGroup);
      this._onDidChangeActiveInstance.fire(this.activeInstance);
    }
  }
  /**
   * @param force Whether to force the group change, this should be used when the previous active
   * group has been removed.
   */
  setActiveGroupByIndex(index, force) {
    if (index === -1 && this.groups.length === 0) {
      if (this.activeGroupIndex !== -1) {
        this.activeGroupIndex = -1;
        this._onDidChangeActiveGroup.fire(this.activeGroup);
        this._onDidChangeActiveInstance.fire(this.activeInstance);
      }
      return;
    }
    if (index < 0 || index >= this.groups.length) {
      return;
    }
    const oldActiveGroup = this.activeGroup;
    this.activeGroupIndex = index;
    if (force || oldActiveGroup !== this.activeGroup) {
      this._onDidChangeActiveGroup.fire(this.activeGroup);
      this._onDidChangeActiveInstance.fire(this.activeInstance);
    }
  }
  _getInstanceLocation(index) {
    let currentGroupIndex = 0;
    while (index >= 0 && currentGroupIndex < this.groups.length) {
      const group = this.groups[currentGroupIndex];
      const count = group.terminalInstances.length;
      if (index < count) {
        return {
          group,
          groupIndex: currentGroupIndex,
          instance: group.terminalInstances[index],
          instanceIndex: index
        };
      }
      index -= count;
      currentGroupIndex++;
    }
    return void 0;
  }
  setActiveInstanceByIndex(index) {
    const activeInstance = this.activeInstance;
    const instanceLocation = this._getInstanceLocation(index);
    const newActiveInstance = instanceLocation?.group.terminalInstances[instanceLocation.instanceIndex];
    if (!instanceLocation || activeInstance === newActiveInstance) {
      return;
    }
    const activeInstanceIndex = instanceLocation.instanceIndex;
    this.activeGroupIndex = instanceLocation.groupIndex;
    this._onDidChangeActiveGroup.fire(this.activeGroup);
    instanceLocation.group.setActiveInstanceByIndex(activeInstanceIndex, true);
  }
  setActiveGroupToNext() {
    if (this.groups.length <= 1) {
      return;
    }
    let newIndex = this.activeGroupIndex + 1;
    if (newIndex >= this.groups.length) {
      newIndex = 0;
    }
    this.setActiveGroupByIndex(newIndex);
  }
  setActiveGroupToPrevious() {
    if (this.groups.length <= 1) {
      return;
    }
    let newIndex = this.activeGroupIndex - 1;
    if (newIndex < 0) {
      newIndex = this.groups.length - 1;
    }
    this.setActiveGroupByIndex(newIndex);
  }
  moveGroup(source, target) {
    source = asArray(source);
    const sourceGroups = this._getValidTerminalGroups(source);
    const targetGroup = this.getGroupForInstance(target);
    if (!targetGroup || sourceGroups.size === 0) {
      return;
    }
    if (sourceGroups.size === 1 && sourceGroups.has(targetGroup)) {
      const targetIndex = targetGroup.terminalInstances.indexOf(target);
      const sortedSources = source.sort((a, b) => {
        return targetGroup.terminalInstances.indexOf(a) - targetGroup.terminalInstances.indexOf(b);
      });
      const firstTargetIndex = targetGroup.terminalInstances.indexOf(sortedSources[0]);
      const position2 = firstTargetIndex < targetIndex ? "after" : "before";
      targetGroup.moveInstance(sortedSources, targetIndex, position2);
      this._onDidChangeInstances.fire();
      return;
    }
    const targetGroupIndex = this.groups.indexOf(targetGroup);
    const sortedSourceGroups = Array.from(sourceGroups).sort((a, b) => {
      return this.groups.indexOf(a) - this.groups.indexOf(b);
    });
    const firstSourceGroupIndex = this.groups.indexOf(sortedSourceGroups[0]);
    const position = firstSourceGroupIndex < targetGroupIndex ? "after" : "before";
    const insertIndex = position === "after" ? targetGroupIndex + 1 : targetGroupIndex;
    this.groups.splice(insertIndex, 0, ...sortedSourceGroups);
    for (const sourceGroup of sortedSourceGroups) {
      const originSourceGroupIndex = position === "after" ? this.groups.indexOf(sourceGroup) : this.groups.lastIndexOf(sourceGroup);
      this.groups.splice(originSourceGroupIndex, 1);
    }
    this._onDidChangeInstances.fire();
  }
  moveGroupToEnd(source) {
    source = asArray(source);
    const sourceGroups = this._getValidTerminalGroups(source);
    if (sourceGroups.size === 0) {
      return;
    }
    const lastInstanceIndex = this.groups.length - 1;
    const sortedSourceGroups = Array.from(sourceGroups).sort((a, b) => {
      return this.groups.indexOf(a) - this.groups.indexOf(b);
    });
    this.groups.splice(lastInstanceIndex + 1, 0, ...sortedSourceGroups);
    for (const sourceGroup of sortedSourceGroups) {
      const sourceGroupIndex = this.groups.indexOf(sourceGroup);
      this.groups.splice(sourceGroupIndex, 1);
    }
    this._onDidChangeInstances.fire();
  }
  moveInstance(source, target, side) {
    const sourceGroup = this.getGroupForInstance(source);
    const targetGroup = this.getGroupForInstance(target);
    if (!sourceGroup || !targetGroup) {
      return;
    }
    if (sourceGroup !== targetGroup) {
      sourceGroup.removeInstance(source);
      targetGroup.addInstance(source);
    }
    const index = targetGroup.terminalInstances.indexOf(target) + (side === "after" ? 1 : 0);
    targetGroup.moveInstance(source, index, side);
  }
  unsplitInstance(instance) {
    const oldGroup = this.getGroupForInstance(instance);
    if (!oldGroup || oldGroup.terminalInstances.length < 2) {
      return;
    }
    oldGroup.removeInstance(instance);
    this.createGroup(instance);
  }
  joinInstances(instances) {
    const group = this.getGroupForInstance(instances[0]);
    if (group) {
      let differentGroups = true;
      for (let i = 1; i < group.terminalInstances.length; i++) {
        if (group.terminalInstances.includes(instances[i])) {
          differentGroups = false;
          break;
        }
      }
      if (!differentGroups && group.terminalInstances.length === instances.length) {
        return;
      }
    }
    let candidateInstance = void 0;
    let candidateGroup = void 0;
    for (const instance of instances) {
      const group2 = this.getGroupForInstance(instance);
      if (group2?.terminalInstances.length === 1) {
        candidateInstance = instance;
        candidateGroup = group2;
        break;
      }
    }
    if (!candidateGroup) {
      candidateGroup = this.createGroup();
    }
    const wasActiveGroup = this.activeGroup === candidateGroup;
    for (const instance of instances) {
      if (instance === candidateInstance) {
        continue;
      }
      const oldGroup = this.getGroupForInstance(instance);
      if (!oldGroup) {
        continue;
      }
      oldGroup.removeInstance(instance);
      candidateGroup.addInstance(instance);
    }
    this.setActiveInstance(instances[0]);
    this._onDidChangeInstances.fire();
    if (!wasActiveGroup) {
      this._onDidChangeActiveGroup.fire(this.activeGroup);
    }
  }
  instanceIsSplit(instance) {
    const group = this.getGroupForInstance(instance);
    if (!group) {
      return false;
    }
    return group.terminalInstances.length > 1;
  }
  getGroupForInstance(instance) {
    return this.groups.find((group) => group.terminalInstances.includes(instance));
  }
  getGroupLabels() {
    return this.groups.filter((group) => group.terminalInstances.length > 0).map((group, index) => {
      return `${index + 1}: ${group.title ? group.title : ""}`;
    });
  }
  /**
   * Visibility should be updated in the following cases:
   * 1. Toggle `TERMINAL_VIEW_ID` visibility
   * 2. Change active group
   * 3. Change instances in active group
   */
  updateVisibility() {
    const visible = this._viewsService.isViewVisible(TERMINAL_VIEW_ID);
    this.groups.forEach((g, i) => g.setVisible(visible && i === this.activeGroupIndex));
  }
};
TerminalGroupService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IViewsService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, IQuickInputService)
], TerminalGroupService);
export {
  TerminalGroupService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxHcm91cFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTaGVsbExhdW5jaENvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEdyb3VwLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsR3JvdXAgfSBmcm9tICcuL3Rlcm1pbmFsR3JvdXAuanMnO1xuaW1wb3J0IHsgZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UgfSBmcm9tICcuL3Rlcm1pbmFsVXJpLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVmlld1BhbmUgfSBmcm9tICcuL3Rlcm1pbmFsVmlldy5qcyc7XG5pbXBvcnQgeyBURVJNSU5BTF9WSUVXX0lEIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IGFzQXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHR5cGUgeyBTaW5nbGVPck1hbnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbEdyb3VwU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxHcm91cFNlcnZpY2Uge1xuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRncm91cHM6IElUZXJtaW5hbEdyb3VwW10gPSBbXTtcblx0YWN0aXZlR3JvdXBJbmRleDogbnVtYmVyID0gLTE7XG5cdGdldCBpbnN0YW5jZXMoKTogSVRlcm1pbmFsSW5zdGFuY2VbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBzLnJlZHVjZSgocCwgYykgPT4gcC5jb25jYXQoYy50ZXJtaW5hbEluc3RhbmNlcyksIFtdIGFzIElUZXJtaW5hbEluc3RhbmNlW10pO1xuXHR9XG5cblx0bGFzdEFjY2Vzc2VkTWVudTogJ2lubGluZS10YWInIHwgJ3RhYi1saXN0JyA9ICdpbmxpbmUtdGFiJztcblxuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2lzUXVpY2tJbnB1dE9wZW5lZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUdyb3VwLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2VHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEdyb3VwPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlR3JvdXAgPSB0aGlzLl9vbkRpZERpc3Bvc2VHcm91cC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cHMgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3Vwcy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTaG93ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2hvdyA9IHRoaXMuX29uRGlkU2hvdy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2VJbnN0YW5jZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlSW5zdGFuY2UgPSB0aGlzLl9vbkRpZERpc3Bvc2VJbnN0YW5jZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1c0luc3RhbmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzSW5zdGFuY2UgPSB0aGlzLl9vbkRpZEZvY3VzSW5zdGFuY2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UgPSB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUluc3RhbmNlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUluc3RhbmNlcyA9IHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJbnN0YW5jZUNhcGFiaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVBhbmVsT3JpZW50YXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxPcmllbnRhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUGFuZWxPcmllbnRhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlUGFuZWxPcmllbnRhdGlvbi5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCB0ZXJtaW5hbEdyb3VwQ291bnRDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5ncm91cENvdW50LmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMub25EaWRDaGFuZ2VHcm91cHMsICgpID0+IHRlcm1pbmFsR3JvdXBDb3VudENvbnRleHRLZXkuc2V0KHRoaXMuZ3JvdXBzLmxlbmd0aCkpKTtcblxuXHRcdGNvbnN0IHNwbGl0VGVybWluYWxBY3RpdmVDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5zcGxpdFRlcm1pbmFsQWN0aXZlLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMub25EaWRGb2N1c0luc3RhbmNlLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRzcGxpdFRlcm1pbmFsQWN0aXZlQ29udGV4dEtleS5zZXQoYWN0aXZlSW5zdGFuY2UgPyB0aGlzLmluc3RhbmNlSXNTcGxpdChhY3RpdmVJbnN0YW5jZSkgOiBmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZERpc3Bvc2VHcm91cChncm91cCA9PiB0aGlzLl9yZW1vdmVHcm91cChncm91cCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkodGhpcy5vbkRpZENoYW5nZUFjdGl2ZUdyb3VwLCB0aGlzLm9uRGlkQ2hhbmdlSW5zdGFuY2VzKSgoKSA9PiB0aGlzLnVwZGF0ZVZpc2liaWxpdHkoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLm9uU2hvdygoKSA9PiB0aGlzLl9pc1F1aWNrSW5wdXRPcGVuZWQgPSB0cnVlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2Uub25IaWRlKCgpID0+IHRoaXMuX2lzUXVpY2tJbnB1dE9wZW5lZCA9IGZhbHNlKSk7XG5cdH1cblxuXHRoaWRlUGFuZWwoKTogdm9pZCB7XG5cdFx0Ly8gSGlkZSB0aGUgcGFuZWwgaWYgdGhlIHRlcm1pbmFsIGlzIGluIHRoZSBwYW5lbCBhbmQgaXQgaGFzIG5vIHNpYmxpbmcgdmlld3Ncblx0XHRjb25zdCBwYW5lbCA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoVEVSTUlOQUxfVklFV19JRCk7XG5cdFx0aWYgKHBhbmVsICYmIHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwocGFuZWwpLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHR0aGlzLl92aWV3c1NlcnZpY2UuY2xvc2VWaWV3KFRFUk1JTkFMX1ZJRVdfSUQpO1xuXHRcdFx0VGVybWluYWxDb250ZXh0S2V5cy50YWJzTW91c2UuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBhY3RpdmVHcm91cCgpOiBJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuYWN0aXZlR3JvdXBJbmRleCA8IDAgfHwgdGhpcy5hY3RpdmVHcm91cEluZGV4ID49IHRoaXMuZ3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBzW3RoaXMuYWN0aXZlR3JvdXBJbmRleF07XG5cdH1cblx0c2V0IGFjdGl2ZUdyb3VwKHZhbHVlOiBJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBTZXR0aW5nIHRvIHVuZGVmaW5lZCBpcyBub3QgcG9zc2libGUsIHRoaXMgY2FuIG9ubHkgYmUgZG9uZSB3aGVuIHJlbW92aW5nIHRoZSBsYXN0IGdyb3VwXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5ncm91cHMuZmluZEluZGV4KGUgPT4gZSA9PT0gdmFsdWUpO1xuXHRcdHRoaXMuc2V0QWN0aXZlR3JvdXBCeUluZGV4KGluZGV4KTtcblx0fVxuXG5cdGdldCBhY3RpdmVJbnN0YW5jZSgpOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aXZlR3JvdXA/LmFjdGl2ZUluc3RhbmNlO1xuXHR9XG5cblx0c2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgodGhpcy5fZ2V0SW5kZXhGcm9tSWQoaW5zdGFuY2UuaW5zdGFuY2VJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SW5kZXhGcm9tSWQodGVybWluYWxJZDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCB0ZXJtaW5hbEluZGV4ID0gdGhpcy5pbnN0YW5jZXMuZmluZEluZGV4KGUgPT4gZS5pbnN0YW5jZUlkID09PSB0ZXJtaW5hbElkKTtcblx0XHRpZiAodGVybWluYWxJbmRleCA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGVybWluYWwgd2l0aCBJRCAke3Rlcm1pbmFsSWR9IGRvZXMgbm90IGV4aXN0IChoYXMgaXQgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkPylgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRlcm1pbmFsSW5kZXg7XG5cdH1cblxuXHRzZXRDb250YWluZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLmdyb3Vwcy5mb3JFYWNoKGdyb3VwID0+IGdyb3VwLmF0dGFjaFRvRWxlbWVudChjb250YWluZXIpKTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzVGFicygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pbnN0YW5jZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuc2hvd1BhbmVsKHRydWUpO1xuXHRcdGNvbnN0IHBhbmUgPSB0aGlzLl92aWV3c1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZDxUZXJtaW5hbFZpZXdQYW5lPihURVJNSU5BTF9WSUVXX0lEKTtcblx0XHRwYW5lPy50ZXJtaW5hbFRhYmJlZFZpZXc/LmZvY3VzVGFicygpO1xuXHR9XG5cblx0YXN5bmMgZm9jdXNIb3ZlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pbnN0YW5jZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFuZSA9IHRoaXMuX3ZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkPFRlcm1pbmFsVmlld1BhbmU+KFRFUk1JTkFMX1ZJRVdfSUQpO1xuXHRcdHBhbmU/LnRlcm1pbmFsVGFiYmVkVmlldz8uZm9jdXNIb3ZlcigpO1xuXHR9XG5cblx0YXN5bmMgZm9jdXNJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pbnN0YW5jZXMuaW5jbHVkZXMoaW5zdGFuY2UpKSB7XG5cdFx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5zaG93UGFuZWwodHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBmb2N1c0FjdGl2ZUluc3RhbmNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNob3dQYW5lbCh0cnVlKTtcblx0fVxuXG5cdGNyZWF0ZUdyb3VwKHNsY09ySW5zdGFuY2U/OiBJU2hlbGxMYXVuY2hDb25maWcgfCBJVGVybWluYWxJbnN0YW5jZSk6IElUZXJtaW5hbEdyb3VwIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsR3JvdXAsIHRoaXMuX2NvbnRhaW5lciwgc2xjT3JJbnN0YW5jZSk7XG5cdFx0dGhpcy5ncm91cHMucHVzaChncm91cCk7XG5cdFx0Z3JvdXAuYWRkRGlzcG9zYWJsZShFdmVudC5mb3J3YXJkKGdyb3VwLm9uUGFuZWxPcmllbnRhdGlvbkNoYW5nZWQsIHRoaXMuX29uRGlkQ2hhbmdlUGFuZWxPcmllbnRhdGlvbikpO1xuXHRcdGdyb3VwLmFkZERpc3Bvc2FibGUoRXZlbnQuZm9yd2FyZChncm91cC5vbkRpZERpc3Bvc2VJbnN0YW5jZSwgdGhpcy5fb25EaWREaXNwb3NlSW5zdGFuY2UpKTtcblx0XHRncm91cC5hZGREaXNwb3NhYmxlKEV2ZW50LmZvcndhcmQoZ3JvdXAub25EaWRGb2N1c0luc3RhbmNlLCB0aGlzLl9vbkRpZEZvY3VzSW5zdGFuY2UpKTtcblx0XHRncm91cC5hZGREaXNwb3NhYmxlKEV2ZW50LmZvcndhcmQoZ3JvdXAub25EaWRDaGFuZ2VJbnN0YW5jZUNhcGFiaWxpdHksIHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5KSk7XG5cdFx0Z3JvdXAuYWRkRGlzcG9zYWJsZShFdmVudC5mb3J3YXJkKGdyb3VwLm9uSW5zdGFuY2VzQ2hhbmdlZCwgdGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMpKTtcblx0XHRncm91cC5hZGREaXNwb3NhYmxlKEV2ZW50LmZvcndhcmQoZ3JvdXAub25EaXNwb3NlZCwgdGhpcy5fb25EaWREaXNwb3NlR3JvdXApKTtcblx0XHRncm91cC5hZGREaXNwb3NhYmxlKGdyb3VwLm9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UoZSA9PiB7XG5cdFx0XHRpZiAoZ3JvdXAgPT09IHRoaXMuYWN0aXZlR3JvdXApIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZS5maXJlKGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAoZ3JvdXAudGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pbnN0YW5jZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHQvLyBJdCdzIHRoZSBmaXJzdCBpbnN0YW5jZSBzbyBpdCBzaG91bGQgYmUgbWFkZSBhY3RpdmUgYXV0b21hdGljYWxseSwgdGhpcyBtdXN0IGZpcmVcblx0XHRcdC8vIGFmdGVyIG9uSW5zdGFuY2VzQ2hhbmdlZCBzbyBjb25zdW1lcnMgY2FuIHJlYWN0IHRvIHRoZSBpbnN0YW5jZSBiZWluZyBhZGRlZCBmaXJzdFxuXHRcdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgoMCk7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBzLmZpcmUoKTtcblx0XHRyZXR1cm4gZ3JvdXA7XG5cdH1cblxuXHRhc3luYyBzaG93UGFuZWwoZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGFuZSA9IHRoaXMuX3ZpZXdzU2VydmljZS5nZXRBY3RpdmVWaWV3V2l0aElkKFRFUk1JTkFMX1ZJRVdfSUQpXG5cdFx0XHQ/PyBhd2FpdCB0aGlzLl92aWV3c1NlcnZpY2Uub3BlblZpZXcoVEVSTUlOQUxfVklFV19JRCwgZm9jdXMpO1xuXHRcdHBhbmU/LnNldEV4cGFuZGVkKHRydWUpO1xuXG5cdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHQvLyBEbyB0aGUgZm9jdXMgY2FsbCBhc3luY2hyb25vdXNseSBhcyBnb2luZyB0aHJvdWdoIHRoZVxuXHRcdFx0Ly8gY29tbWFuZCBwYWxldHRlIHdpbGwgZm9yY2UgZWRpdG9yIGZvY3VzXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLmFjdGl2ZUluc3RhbmNlO1xuXHRcdFx0aWYgKGluc3RhbmNlKSB7XG5cdFx0XHRcdC8vIEhBQ0s6IEVuc3VyZSB0aGUgcGFuZWwgaXMgc3RpbGwgdmlzaWJsZSBhdCB0aGlzIHBvaW50IGFzIHRoZXJlIG1heSBoYXZlIGJlZW5cblx0XHRcdFx0Ly8gYSByZXF1ZXN0IHNpbmNlIGl0IHdhcyBvcGVuZWQgdG8gc2hvdyBhIGRpZmZlcmVudCBwYW5lbFxuXHRcdFx0XHRpZiAocGFuZSAmJiAhcGFuZS5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlldyhURVJNSU5BTF9WSUVXX0lELCBmb2N1cyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgaW5zdGFuY2UuZm9jdXNXaGVuUmVhZHkodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkU2hvdy5maXJlKCk7XG5cdH1cblxuXHRnZXRJbnN0YW5jZUZyb21SZXNvdXJjZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRJbnN0YW5jZUZyb21SZXNvdXJjZSh0aGlzLmluc3RhbmNlcywgcmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlR3JvdXAoZ3JvdXA6IElUZXJtaW5hbEdyb3VwKSB7XG5cdFx0Ly8gR2V0IHRoZSBpbmRleCBvZiB0aGUgZ3JvdXAgYW5kIHJlbW92ZSBpdCBmcm9tIHRoZSBsaXN0XG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSB0aGlzLmFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IHdhc0FjdGl2ZUdyb3VwID0gZ3JvdXAgPT09IGFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5ncm91cHMuaW5kZXhPZihncm91cCk7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5ncm91cHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBzLmZpcmUoKTtcblx0XHR9XG5cblx0XHRpZiAod2FzQWN0aXZlR3JvdXApIHtcblx0XHRcdC8vIEFkanVzdCBmb2N1cyBpZiB0aGUgZ3JvdXAgd2FzIGFjdGl2ZVxuXHRcdFx0aWYgKHRoaXMuZ3JvdXBzLmxlbmd0aCA+IDAgJiYgIXRoaXMuX2lzUXVpY2tJbnB1dE9wZW5lZCkge1xuXHRcdFx0XHRjb25zdCBuZXdJbmRleCA9IGluZGV4IDwgdGhpcy5ncm91cHMubGVuZ3RoID8gaW5kZXggOiB0aGlzLmdyb3Vwcy5sZW5ndGggLSAxO1xuXHRcdFx0XHR0aGlzLnNldEFjdGl2ZUdyb3VwQnlJbmRleChuZXdJbmRleCwgdHJ1ZSk7XG5cdFx0XHRcdGlmIChncm91cC5oYWRGb2N1c09uRXhpdCkge1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZlSW5zdGFuY2U/LmZvY3VzKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEFkanVzdCB0aGUgYWN0aXZlIGdyb3VwIGlmIHRoZSByZW1vdmVkIGdyb3VwIHdhcyBhYm92ZSB0aGUgYWN0aXZlIGdyb3VwXG5cdFx0XHRpZiAodGhpcy5hY3RpdmVHcm91cEluZGV4ID4gaW5kZXgpIHtcblx0XHRcdFx0dGhpcy5zZXRBY3RpdmVHcm91cEJ5SW5kZXgodGhpcy5hY3RpdmVHcm91cEluZGV4IC0gMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEVuc3VyZSB0aGUgYWN0aXZlIGdyb3VwIGlzIHN0aWxsIHZhbGlkLCB0aGlzIHNob3VsZCBzZXQgdGhlIGFjdGl2ZUdyb3VwSW5kZXggdG8gLTEgaWZcblx0XHQvLyB0aGVyZSBhcmUgbm8gZ3JvdXBzXG5cdFx0aWYgKHRoaXMuYWN0aXZlR3JvdXBJbmRleCA+PSB0aGlzLmdyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc2V0QWN0aXZlR3JvdXBCeUluZGV4KHRoaXMuZ3JvdXBzLmxlbmd0aCAtIDEpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSW5zdGFuY2VzLmZpcmUoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUdyb3Vwcy5maXJlKCk7XG5cdFx0aWYgKHdhc0FjdGl2ZUdyb3VwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUdyb3VwLmZpcmUodGhpcy5hY3RpdmVHcm91cCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLmZpcmUodGhpcy5hY3RpdmVJbnN0YW5jZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSBmb3JjZSBXaGV0aGVyIHRvIGZvcmNlIHRoZSBncm91cCBjaGFuZ2UsIHRoaXMgc2hvdWxkIGJlIHVzZWQgd2hlbiB0aGUgcHJldmlvdXMgYWN0aXZlXG5cdCAqIGdyb3VwIGhhcyBiZWVuIHJlbW92ZWQuXG5cdCAqL1xuXHRzZXRBY3RpdmVHcm91cEJ5SW5kZXgoaW5kZXg6IG51bWJlciwgZm9yY2U/OiBib29sZWFuKSB7XG5cdFx0Ly8gVW5zZXQgYWN0aXZlIGdyb3VwIHdoZW4gdGhlIGxhc3QgZ3JvdXAgaXMgcmVtb3ZlZFxuXHRcdGlmIChpbmRleCA9PT0gLTEgJiYgdGhpcy5ncm91cHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVHcm91cEluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUdyb3VwSW5kZXggPSAtMTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5maXJlKHRoaXMuYWN0aXZlR3JvdXApO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLmZpcmUodGhpcy5hY3RpdmVJbnN0YW5jZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIGluZGV4IGlzIHZhbGlkXG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLmdyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaXJlIGdyb3VwL2luc3RhbmNlIGNoYW5nZSBpZiBuZWVkZWRcblx0XHRjb25zdCBvbGRBY3RpdmVHcm91cCA9IHRoaXMuYWN0aXZlR3JvdXA7XG5cdFx0dGhpcy5hY3RpdmVHcm91cEluZGV4ID0gaW5kZXg7XG5cdFx0aWYgKGZvcmNlIHx8IG9sZEFjdGl2ZUdyb3VwICE9PSB0aGlzLmFjdGl2ZUdyb3VwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUdyb3VwLmZpcmUodGhpcy5hY3RpdmVHcm91cCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLmZpcmUodGhpcy5hY3RpdmVJbnN0YW5jZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SW5zdGFuY2VMb2NhdGlvbihpbmRleDogbnVtYmVyKTogSUluc3RhbmNlTG9jYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGxldCBjdXJyZW50R3JvdXBJbmRleCA9IDA7XG5cdFx0d2hpbGUgKGluZGV4ID49IDAgJiYgY3VycmVudEdyb3VwSW5kZXggPCB0aGlzLmdyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5ncm91cHNbY3VycmVudEdyb3VwSW5kZXhdO1xuXHRcdFx0Y29uc3QgY291bnQgPSBncm91cC50ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGg7XG5cdFx0XHRpZiAoaW5kZXggPCBjb3VudCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGdyb3VwLFxuXHRcdFx0XHRcdGdyb3VwSW5kZXg6IGN1cnJlbnRHcm91cEluZGV4LFxuXHRcdFx0XHRcdGluc3RhbmNlOiBncm91cC50ZXJtaW5hbEluc3RhbmNlc1tpbmRleF0sXG5cdFx0XHRcdFx0aW5zdGFuY2VJbmRleDogaW5kZXhcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGluZGV4IC09IGNvdW50O1xuXHRcdFx0Y3VycmVudEdyb3VwSW5kZXgrKztcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHNldEFjdGl2ZUluc3RhbmNlQnlJbmRleChpbmRleDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSB0aGlzLmFjdGl2ZUluc3RhbmNlO1xuXHRcdGNvbnN0IGluc3RhbmNlTG9jYXRpb24gPSB0aGlzLl9nZXRJbnN0YW5jZUxvY2F0aW9uKGluZGV4KTtcblx0XHRjb25zdCBuZXdBY3RpdmVJbnN0YW5jZSA9IGluc3RhbmNlTG9jYXRpb24/Lmdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzW2luc3RhbmNlTG9jYXRpb24uaW5zdGFuY2VJbmRleF07XG5cdFx0aWYgKCFpbnN0YW5jZUxvY2F0aW9uIHx8IGFjdGl2ZUluc3RhbmNlID09PSBuZXdBY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlSW5kZXggPSBpbnN0YW5jZUxvY2F0aW9uLmluc3RhbmNlSW5kZXg7XG5cblx0XHR0aGlzLmFjdGl2ZUdyb3VwSW5kZXggPSBpbnN0YW5jZUxvY2F0aW9uLmdyb3VwSW5kZXg7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5maXJlKHRoaXMuYWN0aXZlR3JvdXApO1xuXHRcdGluc3RhbmNlTG9jYXRpb24uZ3JvdXAuc2V0QWN0aXZlSW5zdGFuY2VCeUluZGV4KGFjdGl2ZUluc3RhbmNlSW5kZXgsIHRydWUpO1xuXHR9XG5cblx0c2V0QWN0aXZlR3JvdXBUb05leHQoKSB7XG5cdFx0aWYgKHRoaXMuZ3JvdXBzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBuZXdJbmRleCA9IHRoaXMuYWN0aXZlR3JvdXBJbmRleCArIDE7XG5cdFx0aWYgKG5ld0luZGV4ID49IHRoaXMuZ3JvdXBzLmxlbmd0aCkge1xuXHRcdFx0bmV3SW5kZXggPSAwO1xuXHRcdH1cblx0XHR0aGlzLnNldEFjdGl2ZUdyb3VwQnlJbmRleChuZXdJbmRleCk7XG5cdH1cblxuXHRzZXRBY3RpdmVHcm91cFRvUHJldmlvdXMoKSB7XG5cdFx0aWYgKHRoaXMuZ3JvdXBzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBuZXdJbmRleCA9IHRoaXMuYWN0aXZlR3JvdXBJbmRleCAtIDE7XG5cdFx0aWYgKG5ld0luZGV4IDwgMCkge1xuXHRcdFx0bmV3SW5kZXggPSB0aGlzLmdyb3Vwcy5sZW5ndGggLSAxO1xuXHRcdH1cblx0XHR0aGlzLnNldEFjdGl2ZUdyb3VwQnlJbmRleChuZXdJbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWYWxpZFRlcm1pbmFsR3JvdXBzID0gKHNvdXJjZXM6IElUZXJtaW5hbEluc3RhbmNlW10pOiBTZXQ8SVRlcm1pbmFsR3JvdXA+ID0+IHtcblx0XHRyZXR1cm4gbmV3IFNldChcblx0XHRcdHNvdXJjZXNcblx0XHRcdFx0Lm1hcChzb3VyY2UgPT4gdGhpcy5nZXRHcm91cEZvckluc3RhbmNlKHNvdXJjZSkpXG5cdFx0XHRcdC5maWx0ZXIoKGdyb3VwKSA9PiBncm91cCAhPT0gdW5kZWZpbmVkKVxuXHRcdCk7XG5cdH07XG5cblx0bW92ZUdyb3VwKHNvdXJjZTogU2luZ2xlT3JNYW55PElUZXJtaW5hbEluc3RhbmNlPiwgdGFyZ2V0OiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdHNvdXJjZSA9IGFzQXJyYXkoc291cmNlKTtcblx0XHRjb25zdCBzb3VyY2VHcm91cHMgPSB0aGlzLl9nZXRWYWxpZFRlcm1pbmFsR3JvdXBzKHNvdXJjZSk7XG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSB0aGlzLmdldEdyb3VwRm9ySW5zdGFuY2UodGFyZ2V0KTtcblx0XHRpZiAoIXRhcmdldEdyb3VwIHx8IHNvdXJjZUdyb3Vwcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGdyb3VwcyBhcmUgdGhlIHNhbWUsIHJlYXJyYW5nZSB3aXRoaW4gdGhlIGdyb3VwXG5cdFx0aWYgKHNvdXJjZUdyb3Vwcy5zaXplID09PSAxICYmIHNvdXJjZUdyb3Vwcy5oYXModGFyZ2V0R3JvdXApKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRJbmRleCA9IHRhcmdldEdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmluZGV4T2YodGFyZ2V0KTtcblx0XHRcdGNvbnN0IHNvcnRlZFNvdXJjZXMgPSBzb3VyY2Uuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGFyZ2V0R3JvdXAudGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZihhKSAtIHRhcmdldEdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmluZGV4T2YoYik7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGZpcnN0VGFyZ2V0SW5kZXggPSB0YXJnZXRHcm91cC50ZXJtaW5hbEluc3RhbmNlcy5pbmRleE9mKHNvcnRlZFNvdXJjZXNbMF0pO1xuXHRcdFx0Y29uc3QgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyA9IGZpcnN0VGFyZ2V0SW5kZXggPCB0YXJnZXRJbmRleCA/ICdhZnRlcicgOiAnYmVmb3JlJztcblx0XHRcdHRhcmdldEdyb3VwLm1vdmVJbnN0YW5jZShzb3J0ZWRTb3VyY2VzLCB0YXJnZXRJbmRleCwgcG9zaXRpb24pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBncm91cHMgZGlmZmVyLCByZWFycmFuZ2UgZ3JvdXBzXG5cdFx0Y29uc3QgdGFyZ2V0R3JvdXBJbmRleCA9IHRoaXMuZ3JvdXBzLmluZGV4T2YodGFyZ2V0R3JvdXApO1xuXHRcdGNvbnN0IHNvcnRlZFNvdXJjZUdyb3VwcyA9IEFycmF5LmZyb20oc291cmNlR3JvdXBzKS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ncm91cHMuaW5kZXhPZihhKSAtIHRoaXMuZ3JvdXBzLmluZGV4T2YoYik7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3RTb3VyY2VHcm91cEluZGV4ID0gdGhpcy5ncm91cHMuaW5kZXhPZihzb3J0ZWRTb3VyY2VHcm91cHNbMF0pO1xuXHRcdGNvbnN0IHBvc2l0aW9uOiAnYmVmb3JlJyB8ICdhZnRlcicgPSBmaXJzdFNvdXJjZUdyb3VwSW5kZXggPCB0YXJnZXRHcm91cEluZGV4ID8gJ2FmdGVyJyA6ICdiZWZvcmUnO1xuXHRcdGNvbnN0IGluc2VydEluZGV4ID0gcG9zaXRpb24gPT09ICdhZnRlcicgPyB0YXJnZXRHcm91cEluZGV4ICsgMSA6IHRhcmdldEdyb3VwSW5kZXg7XG5cdFx0dGhpcy5ncm91cHMuc3BsaWNlKGluc2VydEluZGV4LCAwLCAuLi5zb3J0ZWRTb3VyY2VHcm91cHMpO1xuXHRcdGZvciAoY29uc3Qgc291cmNlR3JvdXAgb2Ygc29ydGVkU291cmNlR3JvdXBzKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5Tb3VyY2VHcm91cEluZGV4ID0gcG9zaXRpb24gPT09ICdhZnRlcicgPyB0aGlzLmdyb3Vwcy5pbmRleE9mKHNvdXJjZUdyb3VwKSA6IHRoaXMuZ3JvdXBzLmxhc3RJbmRleE9mKHNvdXJjZUdyb3VwKTtcblx0XHRcdHRoaXMuZ3JvdXBzLnNwbGljZShvcmlnaW5Tb3VyY2VHcm91cEluZGV4LCAxKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSgpO1xuXHR9XG5cblx0bW92ZUdyb3VwVG9FbmQoc291cmNlOiBTaW5nbGVPck1hbnk8SVRlcm1pbmFsSW5zdGFuY2U+KTogdm9pZCB7XG5cdFx0c291cmNlID0gYXNBcnJheShzb3VyY2UpO1xuXHRcdGNvbnN0IHNvdXJjZUdyb3VwcyA9IHRoaXMuX2dldFZhbGlkVGVybWluYWxHcm91cHMoc291cmNlKTtcblx0XHRpZiAoc291cmNlR3JvdXBzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdEluc3RhbmNlSW5kZXggPSB0aGlzLmdyb3Vwcy5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IHNvcnRlZFNvdXJjZUdyb3VwcyA9IEFycmF5LmZyb20oc291cmNlR3JvdXBzKS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ncm91cHMuaW5kZXhPZihhKSAtIHRoaXMuZ3JvdXBzLmluZGV4T2YoYik7XG5cdFx0fSk7XG5cdFx0dGhpcy5ncm91cHMuc3BsaWNlKGxhc3RJbnN0YW5jZUluZGV4ICsgMSwgMCwgLi4uc29ydGVkU291cmNlR3JvdXBzKTtcblx0XHRmb3IgKGNvbnN0IHNvdXJjZUdyb3VwIG9mIHNvcnRlZFNvdXJjZUdyb3Vwcykge1xuXHRcdFx0Y29uc3Qgc291cmNlR3JvdXBJbmRleCA9IHRoaXMuZ3JvdXBzLmluZGV4T2Yoc291cmNlR3JvdXApO1xuXHRcdFx0dGhpcy5ncm91cHMuc3BsaWNlKHNvdXJjZUdyb3VwSW5kZXgsIDEpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdH1cblxuXHRtb3ZlSW5zdGFuY2Uoc291cmNlOiBJVGVybWluYWxJbnN0YW5jZSwgdGFyZ2V0OiBJVGVybWluYWxJbnN0YW5jZSwgc2lkZTogJ2JlZm9yZScgfCAnYWZ0ZXInKSB7XG5cdFx0Y29uc3Qgc291cmNlR3JvdXAgPSB0aGlzLmdldEdyb3VwRm9ySW5zdGFuY2Uoc291cmNlKTtcblx0XHRjb25zdCB0YXJnZXRHcm91cCA9IHRoaXMuZ2V0R3JvdXBGb3JJbnN0YW5jZSh0YXJnZXQpO1xuXHRcdGlmICghc291cmNlR3JvdXAgfHwgIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZSBmcm9tIHRoZSBzb3VyY2UgZ3JvdXAgdG8gdGhlIHRhcmdldCBncm91cFxuXHRcdGlmIChzb3VyY2VHcm91cCAhPT0gdGFyZ2V0R3JvdXApIHtcblx0XHRcdC8vIE1vdmUgZ3JvdXBzXG5cdFx0XHRzb3VyY2VHcm91cC5yZW1vdmVJbnN0YW5jZShzb3VyY2UpO1xuXHRcdFx0dGFyZ2V0R3JvdXAuYWRkSW5zdGFuY2Uoc291cmNlKTtcblx0XHR9XG5cblx0XHQvLyBSZWFycmFuZ2Ugd2l0aGluIHRoZSB0YXJnZXQgZ3JvdXBcblx0XHRjb25zdCBpbmRleCA9IHRhcmdldEdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmluZGV4T2YodGFyZ2V0KSArIChzaWRlID09PSAnYWZ0ZXInID8gMSA6IDApO1xuXHRcdHRhcmdldEdyb3VwLm1vdmVJbnN0YW5jZShzb3VyY2UsIGluZGV4LCBzaWRlKTtcblx0fVxuXG5cdHVuc3BsaXRJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRjb25zdCBvbGRHcm91cCA9IHRoaXMuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0aWYgKCFvbGRHcm91cCB8fCBvbGRHcm91cC50ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPCAyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b2xkR3JvdXAucmVtb3ZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdHRoaXMuY3JlYXRlR3JvdXAoaW5zdGFuY2UpO1xuXHR9XG5cblx0am9pbkluc3RhbmNlcyhpbnN0YW5jZXM6IElUZXJtaW5hbEluc3RhbmNlW10pIHtcblx0XHRjb25zdCBncm91cCA9IHRoaXMuZ2V0R3JvdXBGb3JJbnN0YW5jZShpbnN0YW5jZXNbMF0pO1xuXHRcdGlmIChncm91cCkge1xuXHRcdFx0bGV0IGRpZmZlcmVudEdyb3VwcyA9IHRydWU7XG5cdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmIChncm91cC50ZXJtaW5hbEluc3RhbmNlcy5pbmNsdWRlcyhpbnN0YW5jZXNbaV0pKSB7XG5cdFx0XHRcdFx0ZGlmZmVyZW50R3JvdXBzID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghZGlmZmVyZW50R3JvdXBzICYmIGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA9PT0gaW5zdGFuY2VzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEZpbmQgdGhlIGdyb3VwIG9mIHRoZSBmaXJzdCBpbnN0YW5jZSB0aGF0IGlzIHRoZSBvbmx5IGluc3RhbmNlIGluIHRoZSBncm91cCwgaWYgb25lIGV4aXN0c1xuXHRcdGxldCBjYW5kaWRhdGVJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhbmRpZGF0ZUdyb3VwOiBJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIGluc3RhbmNlcykge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0aWYgKGdyb3VwPy50ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Y2FuZGlkYXRlSW5zdGFuY2UgPSBpbnN0YW5jZTtcblx0XHRcdFx0Y2FuZGlkYXRlR3JvdXAgPSBncm91cDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IGdyb3VwIGlmIG5lZWRlZFxuXHRcdGlmICghY2FuZGlkYXRlR3JvdXApIHtcblx0XHRcdGNhbmRpZGF0ZUdyb3VwID0gdGhpcy5jcmVhdGVHcm91cCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhc0FjdGl2ZUdyb3VwID0gdGhpcy5hY3RpdmVHcm91cCA9PT0gY2FuZGlkYXRlR3JvdXA7XG5cblx0XHQvLyBVbnNwbGl0IGFsbCBvdGhlciBpbnN0YW5jZXMgYW5kIGFkZCB0aGVtIHRvIHRoZSBuZXcgZ3JvdXBcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIGluc3RhbmNlcykge1xuXHRcdFx0aWYgKGluc3RhbmNlID09PSBjYW5kaWRhdGVJbnN0YW5jZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb2xkR3JvdXAgPSB0aGlzLmdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0aWYgKCFvbGRHcm91cCkge1xuXHRcdFx0XHQvLyBTb21ldGhpbmcgd2VudCB3cm9uZywgZG9uJ3Qgam9pbiB0aGlzIG9uZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdG9sZEdyb3VwLnJlbW92ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdGNhbmRpZGF0ZUdyb3VwLmFkZEluc3RhbmNlKGluc3RhbmNlKTtcblx0XHR9XG5cblx0XHQvLyBTZXQgdGhlIGFjdGl2ZSB0ZXJtaW5hbFxuXHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2VzWzBdKTtcblxuXHRcdC8vIEZpcmUgZXZlbnRzXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSgpO1xuXHRcdGlmICghd2FzQWN0aXZlR3JvdXApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAuZmlyZSh0aGlzLmFjdGl2ZUdyb3VwKTtcblx0XHR9XG5cdH1cblxuXHRpbnN0YW5jZUlzU3BsaXQoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLmdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdGlmICghZ3JvdXApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA+IDE7XG5cdH1cblxuXHRnZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5ncm91cHMuZmluZChncm91cCA9PiBncm91cC50ZXJtaW5hbEluc3RhbmNlcy5pbmNsdWRlcyhpbnN0YW5jZSkpO1xuXHR9XG5cblx0Z2V0R3JvdXBMYWJlbHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLmdyb3Vwcy5maWx0ZXIoZ3JvdXAgPT4gZ3JvdXAudGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID4gMCkubWFwKChncm91cCwgaW5kZXgpID0+IHtcblx0XHRcdHJldHVybiBgJHtpbmRleCArIDF9OiAke2dyb3VwLnRpdGxlID8gZ3JvdXAudGl0bGUgOiAnJ31gO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFZpc2liaWxpdHkgc2hvdWxkIGJlIHVwZGF0ZWQgaW4gdGhlIGZvbGxvd2luZyBjYXNlczpcblx0ICogMS4gVG9nZ2xlIGBURVJNSU5BTF9WSUVXX0lEYCB2aXNpYmlsaXR5XG5cdCAqIDIuIENoYW5nZSBhY3RpdmUgZ3JvdXBcblx0ICogMy4gQ2hhbmdlIGluc3RhbmNlcyBpbiBhY3RpdmUgZ3JvdXBcblx0ICovXG5cdHVwZGF0ZVZpc2liaWxpdHkoKSB7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IHRoaXMuX3ZpZXdzU2VydmljZS5pc1ZpZXdWaXNpYmxlKFRFUk1JTkFMX1ZJRVdfSUQpO1xuXHRcdHRoaXMuZ3JvdXBzLmZvckVhY2goKGcsIGkpID0+IGcuc2V0VmlzaWJsZSh2aXNpYmxlICYmIGkgPT09IHRoaXMuYWN0aXZlR3JvdXBJbmRleCkpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJSW5zdGFuY2VMb2NhdGlvbiB7XG5cdGdyb3VwOiBJVGVybWluYWxHcm91cDtcblx0Z3JvdXBJbmRleDogbnVtYmVyO1xuXHRpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7XG5cdGluc3RhbmNlSW5kZXg6IG51bWJlcjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZUFBZTtBQUdqQixJQUFNLHVCQUFOLGNBQW1DLFdBQTRDO0FBQUEsRUFzQ3JGLFlBQzZCLG9CQUNZLHVCQUNSLGVBQ1Msd0JBQ0osb0JBQ3BDO0FBQ0QsVUFBTTtBQU5zQjtBQUNZO0FBQ1I7QUFDUztBQUNKO0FBeEN0QyxrQkFBMkIsQ0FBQztBQUM1Qiw0QkFBMkI7QUFLM0IsNEJBQThDO0FBSTlDLFNBQVEsc0JBQStCO0FBRXZDLFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxRQUFvQyxDQUFDO0FBQ25HLFNBQVMseUJBQXlCLEtBQUssd0JBQXdCO0FBQy9ELFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUF3QixDQUFDO0FBQ2xGLFNBQVMsb0JBQW9CLEtBQUssbUJBQW1CO0FBQ3JELFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDeEUsU0FBUyxvQkFBb0IsS0FBSyxtQkFBbUI7QUFDckQsU0FBaUIsYUFBYSxLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFDaEUsU0FBUyxZQUFZLEtBQUssV0FBVztBQUVyQyxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksUUFBMkIsQ0FBQztBQUN4RixTQUFTLHVCQUF1QixLQUFLLHNCQUFzQjtBQUMzRCxTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksUUFBMkIsQ0FBQztBQUN0RixTQUFTLHFCQUFxQixLQUFLLG9CQUFvQjtBQUN2RCxTQUFpQiw2QkFBNkIsS0FBSyxVQUFVLElBQUksUUFBdUMsQ0FBQztBQUN6RyxTQUFTLDRCQUE0QixLQUFLLDJCQUEyQjtBQUNyRSxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzNFLFNBQVMsdUJBQXVCLEtBQUssc0JBQXNCO0FBQzNELFNBQWlCLGlDQUFpQyxLQUFLLFVBQVUsSUFBSSxRQUEyQixDQUFDO0FBQ2pHLFNBQVMsZ0NBQWdDLEtBQUssK0JBQStCO0FBRTdFLFNBQWlCLCtCQUErQixLQUFLLFVBQVUsSUFBSSxRQUFxQixDQUFDO0FBQ3pGLFNBQVMsOEJBQThCLEtBQUssNkJBQTZCO0FBb1J6RSxTQUFRLDBCQUEwQixDQUFDLFlBQXNEO0FBQ3hGLGFBQU8sSUFBSTtBQUFBLFFBQ1YsUUFDRSxJQUFJLFlBQVUsS0FBSyxvQkFBb0IsTUFBTSxDQUFDLEVBQzlDLE9BQU8sQ0FBQyxVQUFVLFVBQVUsTUFBUztBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQS9RQyxVQUFNLCtCQUErQixvQkFBb0IsV0FBVyxPQUFPLEtBQUssa0JBQWtCO0FBQ2xHLFNBQUssVUFBVSxNQUFNLGdCQUFnQixLQUFLLG1CQUFtQixNQUFNLDZCQUE2QixJQUFJLEtBQUssT0FBTyxNQUFNLENBQUMsQ0FBQztBQUV4SCxVQUFNLGdDQUFnQyxvQkFBb0Isb0JBQW9CLE9BQU8sS0FBSyxrQkFBa0I7QUFDNUcsU0FBSyxVQUFVLE1BQU0sZ0JBQWdCLEtBQUssb0JBQW9CLE1BQU07QUFDbkUsWUFBTSxpQkFBaUIsS0FBSztBQUM1QixvQ0FBOEIsSUFBSSxpQkFBaUIsS0FBSyxnQkFBZ0IsY0FBYyxJQUFJLEtBQUs7QUFBQSxJQUNoRyxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyxrQkFBa0IsV0FBUyxLQUFLLGFBQWEsS0FBSyxDQUFDLENBQUM7QUFDeEUsU0FBSyxVQUFVLE1BQU0sSUFBSSxLQUFLLHdCQUF3QixLQUFLLG9CQUFvQixFQUFFLE1BQU0sS0FBSyxpQkFBaUIsQ0FBQyxDQUFDO0FBQy9HLFNBQUssVUFBVSxLQUFLLG1CQUFtQixPQUFPLE1BQU0sS0FBSyxzQkFBc0IsSUFBSSxDQUFDO0FBQ3BGLFNBQUssVUFBVSxLQUFLLG1CQUFtQixPQUFPLE1BQU0sS0FBSyxzQkFBc0IsS0FBSyxDQUFDO0FBQUEsRUFDdEY7QUFBQSxFQXZEQSxJQUFJLFlBQWlDO0FBQ3BDLFdBQU8sS0FBSyxPQUFPLE9BQU8sQ0FBQyxHQUFHLE1BQU0sRUFBRSxPQUFPLEVBQUUsaUJBQWlCLEdBQUcsQ0FBQyxDQUF3QjtBQUFBLEVBQzdGO0FBQUEsRUF1REEsWUFBa0I7QUFFakIsVUFBTSxRQUFRLEtBQUssdUJBQXVCLHlCQUF5QixnQkFBZ0I7QUFDbkYsUUFBSSxTQUFTLEtBQUssdUJBQXVCLHNCQUFzQixLQUFLLEVBQUUsdUJBQXVCLFdBQVcsR0FBRztBQUMxRyxXQUFLLGNBQWMsVUFBVSxnQkFBZ0I7QUFDN0MsMEJBQW9CLFVBQVUsT0FBTyxLQUFLLGtCQUFrQixFQUFFLElBQUksS0FBSztBQUFBLElBQ3hFO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxjQUEwQztBQUM3QyxRQUFJLEtBQUssbUJBQW1CLEtBQUssS0FBSyxvQkFBb0IsS0FBSyxPQUFPLFFBQVE7QUFDN0UsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUssT0FBTyxLQUFLLGdCQUFnQjtBQUFBLEVBQ3pDO0FBQUEsRUFDQSxJQUFJLFlBQVksT0FBbUM7QUFDbEQsUUFBSSxVQUFVLFFBQVc7QUFFeEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLEtBQUssT0FBTyxVQUFVLE9BQUssTUFBTSxLQUFLO0FBQ3BELFNBQUssc0JBQXNCLEtBQUs7QUFBQSxFQUNqQztBQUFBLEVBRUEsSUFBSSxpQkFBZ0Q7QUFDbkQsV0FBTyxLQUFLLGFBQWE7QUFBQSxFQUMxQjtBQUFBLEVBRUEsa0JBQWtCLFVBQTZCO0FBQzlDLFNBQUsseUJBQXlCLEtBQUssZ0JBQWdCLFNBQVMsVUFBVSxDQUFDO0FBQUEsRUFDeEU7QUFBQSxFQUVRLGdCQUFnQixZQUE0QjtBQUNuRCxVQUFNLGdCQUFnQixLQUFLLFVBQVUsVUFBVSxPQUFLLEVBQUUsZUFBZSxVQUFVO0FBQy9FLFFBQUksa0JBQWtCLElBQUk7QUFDekIsWUFBTSxJQUFJLE1BQU0sb0JBQW9CLFVBQVUsaURBQWlEO0FBQUEsSUFDaEc7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsYUFBYSxXQUF3QjtBQUNwQyxTQUFLLGFBQWE7QUFDbEIsU0FBSyxPQUFPLFFBQVEsV0FBUyxNQUFNLGdCQUFnQixTQUFTLENBQUM7QUFBQSxFQUM5RDtBQUFBLEVBRUEsTUFBTSxZQUEyQjtBQUNoQyxRQUFJLEtBQUssVUFBVSxXQUFXLEdBQUc7QUFDaEM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxLQUFLLFVBQVUsSUFBSTtBQUN6QixVQUFNLE9BQU8sS0FBSyxjQUFjLG9CQUFzQyxnQkFBZ0I7QUFDdEYsVUFBTSxvQkFBb0IsVUFBVTtBQUFBLEVBQ3JDO0FBQUEsRUFFQSxNQUFNLGFBQTRCO0FBQ2pDLFFBQUksS0FBSyxVQUFVLFdBQVcsR0FBRztBQUNoQztBQUFBLElBQ0Q7QUFFQSxVQUFNLE9BQU8sS0FBSyxjQUFjLG9CQUFzQyxnQkFBZ0I7QUFDdEYsVUFBTSxvQkFBb0IsV0FBVztBQUFBLEVBQ3RDO0FBQUEsRUFFQSxNQUFNLGNBQWMsVUFBNEM7QUFDL0QsUUFBSSxLQUFLLFVBQVUsU0FBUyxRQUFRLEdBQUc7QUFDdEMsV0FBSyxrQkFBa0IsUUFBUTtBQUFBLElBQ2hDO0FBQ0EsVUFBTSxLQUFLLFVBQVUsSUFBSTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFNLHNCQUFxQztBQUMxQyxXQUFPLEtBQUssVUFBVSxJQUFJO0FBQUEsRUFDM0I7QUFBQSxFQUVBLFlBQVksZUFBd0U7QUFDbkYsVUFBTSxRQUFRLEtBQUssc0JBQXNCLGVBQWUsZUFBZSxLQUFLLFlBQVksYUFBYTtBQUNyRyxTQUFLLE9BQU8sS0FBSyxLQUFLO0FBQ3RCLFVBQU0sY0FBYyxNQUFNLFFBQVEsTUFBTSwyQkFBMkIsS0FBSyw0QkFBNEIsQ0FBQztBQUNyRyxVQUFNLGNBQWMsTUFBTSxRQUFRLE1BQU0sc0JBQXNCLEtBQUsscUJBQXFCLENBQUM7QUFDekYsVUFBTSxjQUFjLE1BQU0sUUFBUSxNQUFNLG9CQUFvQixLQUFLLG1CQUFtQixDQUFDO0FBQ3JGLFVBQU0sY0FBYyxNQUFNLFFBQVEsTUFBTSwrQkFBK0IsS0FBSyw4QkFBOEIsQ0FBQztBQUMzRyxVQUFNLGNBQWMsTUFBTSxRQUFRLE1BQU0sb0JBQW9CLEtBQUsscUJBQXFCLENBQUM7QUFDdkYsVUFBTSxjQUFjLE1BQU0sUUFBUSxNQUFNLFlBQVksS0FBSyxrQkFBa0IsQ0FBQztBQUM1RSxVQUFNLGNBQWMsTUFBTSwwQkFBMEIsT0FBSztBQUN4RCxVQUFJLFVBQVUsS0FBSyxhQUFhO0FBQy9CLGFBQUssMkJBQTJCLEtBQUssQ0FBQztBQUFBLE1BQ3ZDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixRQUFJLE1BQU0sa0JBQWtCLFNBQVMsR0FBRztBQUN2QyxXQUFLLHNCQUFzQixLQUFLO0FBQUEsSUFDakM7QUFDQSxRQUFJLEtBQUssVUFBVSxXQUFXLEdBQUc7QUFHaEMsV0FBSyx5QkFBeUIsQ0FBQztBQUFBLElBQ2hDO0FBQ0EsU0FBSyxtQkFBbUIsS0FBSztBQUM3QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxVQUFVLE9BQWdDO0FBQy9DLFVBQU0sT0FBTyxLQUFLLGNBQWMsb0JBQW9CLGdCQUFnQixLQUNoRSxNQUFNLEtBQUssY0FBYyxTQUFTLGtCQUFrQixLQUFLO0FBQzdELFVBQU0sWUFBWSxJQUFJO0FBRXRCLFFBQUksT0FBTztBQUdWLFlBQU0sUUFBUSxDQUFDO0FBQ2YsWUFBTSxXQUFXLEtBQUs7QUFDdEIsVUFBSSxVQUFVO0FBR2IsWUFBSSxRQUFRLENBQUMsS0FBSyxVQUFVLEdBQUc7QUFDOUIsZ0JBQU0sS0FBSyxjQUFjLFNBQVMsa0JBQWtCLEtBQUs7QUFBQSxRQUMxRDtBQUNBLGNBQU0sU0FBUyxlQUFlLElBQUk7QUFBQSxNQUNuQztBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVcsS0FBSztBQUFBLEVBQ3RCO0FBQUEsRUFFQSx3QkFBd0IsVUFBMEQ7QUFDakYsV0FBTyx3QkFBd0IsS0FBSyxXQUFXLFFBQVE7QUFBQSxFQUN4RDtBQUFBLEVBRVEsYUFBYSxPQUF1QjtBQUUzQyxVQUFNLGNBQWMsS0FBSztBQUN6QixVQUFNLGlCQUFpQixVQUFVO0FBQ2pDLFVBQU0sUUFBUSxLQUFLLE9BQU8sUUFBUSxLQUFLO0FBQ3ZDLFFBQUksVUFBVSxJQUFJO0FBQ2pCLFdBQUssT0FBTyxPQUFPLE9BQU8sQ0FBQztBQUMzQixXQUFLLG1CQUFtQixLQUFLO0FBQUEsSUFDOUI7QUFFQSxRQUFJLGdCQUFnQjtBQUVuQixVQUFJLEtBQUssT0FBTyxTQUFTLEtBQUssQ0FBQyxLQUFLLHFCQUFxQjtBQUN4RCxjQUFNLFdBQVcsUUFBUSxLQUFLLE9BQU8sU0FBUyxRQUFRLEtBQUssT0FBTyxTQUFTO0FBQzNFLGFBQUssc0JBQXNCLFVBQVUsSUFBSTtBQUN6QyxZQUFJLE1BQU0sZ0JBQWdCO0FBQ3pCLGVBQUssZ0JBQWdCLE1BQU0sSUFBSTtBQUFBLFFBQ2hDO0FBQUEsTUFDRDtBQUFBLElBQ0QsT0FBTztBQUVOLFVBQUksS0FBSyxtQkFBbUIsT0FBTztBQUNsQyxhQUFLLHNCQUFzQixLQUFLLG1CQUFtQixDQUFDO0FBQUEsTUFDckQ7QUFBQSxJQUNEO0FBR0EsUUFBSSxLQUFLLG9CQUFvQixLQUFLLE9BQU8sUUFBUTtBQUNoRCxXQUFLLHNCQUFzQixLQUFLLE9BQU8sU0FBUyxDQUFDO0FBQUEsSUFDbEQ7QUFFQSxTQUFLLHNCQUFzQixLQUFLO0FBQ2hDLFNBQUssbUJBQW1CLEtBQUs7QUFDN0IsUUFBSSxnQkFBZ0I7QUFDbkIsV0FBSyx3QkFBd0IsS0FBSyxLQUFLLFdBQVc7QUFDbEQsV0FBSywyQkFBMkIsS0FBSyxLQUFLLGNBQWM7QUFBQSxJQUN6RDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsc0JBQXNCLE9BQWUsT0FBaUI7QUFFckQsUUFBSSxVQUFVLE1BQU0sS0FBSyxPQUFPLFdBQVcsR0FBRztBQUM3QyxVQUFJLEtBQUsscUJBQXFCLElBQUk7QUFDakMsYUFBSyxtQkFBbUI7QUFDeEIsYUFBSyx3QkFBd0IsS0FBSyxLQUFLLFdBQVc7QUFDbEQsYUFBSywyQkFBMkIsS0FBSyxLQUFLLGNBQWM7QUFBQSxNQUN6RDtBQUNBO0FBQUEsSUFDRDtBQUdBLFFBQUksUUFBUSxLQUFLLFNBQVMsS0FBSyxPQUFPLFFBQVE7QUFDN0M7QUFBQSxJQUNEO0FBR0EsVUFBTSxpQkFBaUIsS0FBSztBQUM1QixTQUFLLG1CQUFtQjtBQUN4QixRQUFJLFNBQVMsbUJBQW1CLEtBQUssYUFBYTtBQUNqRCxXQUFLLHdCQUF3QixLQUFLLEtBQUssV0FBVztBQUNsRCxXQUFLLDJCQUEyQixLQUFLLEtBQUssY0FBYztBQUFBLElBQ3pEO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLE9BQThDO0FBQzFFLFFBQUksb0JBQW9CO0FBQ3hCLFdBQU8sU0FBUyxLQUFLLG9CQUFvQixLQUFLLE9BQU8sUUFBUTtBQUM1RCxZQUFNLFFBQVEsS0FBSyxPQUFPLGlCQUFpQjtBQUMzQyxZQUFNLFFBQVEsTUFBTSxrQkFBa0I7QUFDdEMsVUFBSSxRQUFRLE9BQU87QUFDbEIsZUFBTztBQUFBLFVBQ047QUFBQSxVQUNBLFlBQVk7QUFBQSxVQUNaLFVBQVUsTUFBTSxrQkFBa0IsS0FBSztBQUFBLFVBQ3ZDLGVBQWU7QUFBQSxRQUNoQjtBQUFBLE1BQ0Q7QUFDQSxlQUFTO0FBQ1Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLHlCQUF5QixPQUFlO0FBQ3ZDLFVBQU0saUJBQWlCLEtBQUs7QUFDNUIsVUFBTSxtQkFBbUIsS0FBSyxxQkFBcUIsS0FBSztBQUN4RCxVQUFNLG9CQUFvQixrQkFBa0IsTUFBTSxrQkFBa0IsaUJBQWlCLGFBQWE7QUFDbEcsUUFBSSxDQUFDLG9CQUFvQixtQkFBbUIsbUJBQW1CO0FBQzlEO0FBQUEsSUFDRDtBQUVBLFVBQU0sc0JBQXNCLGlCQUFpQjtBQUU3QyxTQUFLLG1CQUFtQixpQkFBaUI7QUFDekMsU0FBSyx3QkFBd0IsS0FBSyxLQUFLLFdBQVc7QUFDbEQscUJBQWlCLE1BQU0seUJBQXlCLHFCQUFxQixJQUFJO0FBQUEsRUFDMUU7QUFBQSxFQUVBLHVCQUF1QjtBQUN0QixRQUFJLEtBQUssT0FBTyxVQUFVLEdBQUc7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxXQUFXLEtBQUssbUJBQW1CO0FBQ3ZDLFFBQUksWUFBWSxLQUFLLE9BQU8sUUFBUTtBQUNuQyxpQkFBVztBQUFBLElBQ1o7QUFDQSxTQUFLLHNCQUFzQixRQUFRO0FBQUEsRUFDcEM7QUFBQSxFQUVBLDJCQUEyQjtBQUMxQixRQUFJLEtBQUssT0FBTyxVQUFVLEdBQUc7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxXQUFXLEtBQUssbUJBQW1CO0FBQ3ZDLFFBQUksV0FBVyxHQUFHO0FBQ2pCLGlCQUFXLEtBQUssT0FBTyxTQUFTO0FBQUEsSUFDakM7QUFDQSxTQUFLLHNCQUFzQixRQUFRO0FBQUEsRUFDcEM7QUFBQSxFQVVBLFVBQVUsUUFBeUMsUUFBMkI7QUFDN0UsYUFBUyxRQUFRLE1BQU07QUFDdkIsVUFBTSxlQUFlLEtBQUssd0JBQXdCLE1BQU07QUFDeEQsVUFBTSxjQUFjLEtBQUssb0JBQW9CLE1BQU07QUFDbkQsUUFBSSxDQUFDLGVBQWUsYUFBYSxTQUFTLEdBQUc7QUFDNUM7QUFBQSxJQUNEO0FBR0EsUUFBSSxhQUFhLFNBQVMsS0FBSyxhQUFhLElBQUksV0FBVyxHQUFHO0FBQzdELFlBQU0sY0FBYyxZQUFZLGtCQUFrQixRQUFRLE1BQU07QUFDaEUsWUFBTSxnQkFBZ0IsT0FBTyxLQUFLLENBQUMsR0FBRyxNQUFNO0FBQzNDLGVBQU8sWUFBWSxrQkFBa0IsUUFBUSxDQUFDLElBQUksWUFBWSxrQkFBa0IsUUFBUSxDQUFDO0FBQUEsTUFDMUYsQ0FBQztBQUNELFlBQU0sbUJBQW1CLFlBQVksa0JBQWtCLFFBQVEsY0FBYyxDQUFDLENBQUM7QUFDL0UsWUFBTUEsWUFBK0IsbUJBQW1CLGNBQWMsVUFBVTtBQUNoRixrQkFBWSxhQUFhLGVBQWUsYUFBYUEsU0FBUTtBQUM3RCxXQUFLLHNCQUFzQixLQUFLO0FBQ2hDO0FBQUEsSUFDRDtBQUdBLFVBQU0sbUJBQW1CLEtBQUssT0FBTyxRQUFRLFdBQVc7QUFDeEQsVUFBTSxxQkFBcUIsTUFBTSxLQUFLLFlBQVksRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNO0FBQ2xFLGFBQU8sS0FBSyxPQUFPLFFBQVEsQ0FBQyxJQUFJLEtBQUssT0FBTyxRQUFRLENBQUM7QUFBQSxJQUN0RCxDQUFDO0FBQ0QsVUFBTSx3QkFBd0IsS0FBSyxPQUFPLFFBQVEsbUJBQW1CLENBQUMsQ0FBQztBQUN2RSxVQUFNLFdBQStCLHdCQUF3QixtQkFBbUIsVUFBVTtBQUMxRixVQUFNLGNBQWMsYUFBYSxVQUFVLG1CQUFtQixJQUFJO0FBQ2xFLFNBQUssT0FBTyxPQUFPLGFBQWEsR0FBRyxHQUFHLGtCQUFrQjtBQUN4RCxlQUFXLGVBQWUsb0JBQW9CO0FBQzdDLFlBQU0seUJBQXlCLGFBQWEsVUFBVSxLQUFLLE9BQU8sUUFBUSxXQUFXLElBQUksS0FBSyxPQUFPLFlBQVksV0FBVztBQUM1SCxXQUFLLE9BQU8sT0FBTyx3QkFBd0IsQ0FBQztBQUFBLElBQzdDO0FBQ0EsU0FBSyxzQkFBc0IsS0FBSztBQUFBLEVBQ2pDO0FBQUEsRUFFQSxlQUFlLFFBQStDO0FBQzdELGFBQVMsUUFBUSxNQUFNO0FBQ3ZCLFVBQU0sZUFBZSxLQUFLLHdCQUF3QixNQUFNO0FBQ3hELFFBQUksYUFBYSxTQUFTLEdBQUc7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxvQkFBb0IsS0FBSyxPQUFPLFNBQVM7QUFDL0MsVUFBTSxxQkFBcUIsTUFBTSxLQUFLLFlBQVksRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNO0FBQ2xFLGFBQU8sS0FBSyxPQUFPLFFBQVEsQ0FBQyxJQUFJLEtBQUssT0FBTyxRQUFRLENBQUM7QUFBQSxJQUN0RCxDQUFDO0FBQ0QsU0FBSyxPQUFPLE9BQU8sb0JBQW9CLEdBQUcsR0FBRyxHQUFHLGtCQUFrQjtBQUNsRSxlQUFXLGVBQWUsb0JBQW9CO0FBQzdDLFlBQU0sbUJBQW1CLEtBQUssT0FBTyxRQUFRLFdBQVc7QUFDeEQsV0FBSyxPQUFPLE9BQU8sa0JBQWtCLENBQUM7QUFBQSxJQUN2QztBQUNBLFNBQUssc0JBQXNCLEtBQUs7QUFBQSxFQUNqQztBQUFBLEVBRUEsYUFBYSxRQUEyQixRQUEyQixNQUEwQjtBQUM1RixVQUFNLGNBQWMsS0FBSyxvQkFBb0IsTUFBTTtBQUNuRCxVQUFNLGNBQWMsS0FBSyxvQkFBb0IsTUFBTTtBQUNuRCxRQUFJLENBQUMsZUFBZSxDQUFDLGFBQWE7QUFDakM7QUFBQSxJQUNEO0FBR0EsUUFBSSxnQkFBZ0IsYUFBYTtBQUVoQyxrQkFBWSxlQUFlLE1BQU07QUFDakMsa0JBQVksWUFBWSxNQUFNO0FBQUEsSUFDL0I7QUFHQSxVQUFNLFFBQVEsWUFBWSxrQkFBa0IsUUFBUSxNQUFNLEtBQUssU0FBUyxVQUFVLElBQUk7QUFDdEYsZ0JBQVksYUFBYSxRQUFRLE9BQU8sSUFBSTtBQUFBLEVBQzdDO0FBQUEsRUFFQSxnQkFBZ0IsVUFBNkI7QUFDNUMsVUFBTSxXQUFXLEtBQUssb0JBQW9CLFFBQVE7QUFDbEQsUUFBSSxDQUFDLFlBQVksU0FBUyxrQkFBa0IsU0FBUyxHQUFHO0FBQ3ZEO0FBQUEsSUFDRDtBQUVBLGFBQVMsZUFBZSxRQUFRO0FBQ2hDLFNBQUssWUFBWSxRQUFRO0FBQUEsRUFDMUI7QUFBQSxFQUVBLGNBQWMsV0FBZ0M7QUFDN0MsVUFBTSxRQUFRLEtBQUssb0JBQW9CLFVBQVUsQ0FBQyxDQUFDO0FBQ25ELFFBQUksT0FBTztBQUNWLFVBQUksa0JBQWtCO0FBQ3RCLGVBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxrQkFBa0IsUUFBUSxLQUFLO0FBQ3hELFlBQUksTUFBTSxrQkFBa0IsU0FBUyxVQUFVLENBQUMsQ0FBQyxHQUFHO0FBQ25ELDRCQUFrQjtBQUNsQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLG1CQUFtQixNQUFNLGtCQUFrQixXQUFXLFVBQVUsUUFBUTtBQUM1RTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxvQkFBbUQ7QUFDdkQsUUFBSSxpQkFBNkM7QUFDakQsZUFBVyxZQUFZLFdBQVc7QUFDakMsWUFBTUMsU0FBUSxLQUFLLG9CQUFvQixRQUFRO0FBQy9DLFVBQUlBLFFBQU8sa0JBQWtCLFdBQVcsR0FBRztBQUMxQyw0QkFBb0I7QUFDcEIseUJBQWlCQTtBQUNqQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSxDQUFDLGdCQUFnQjtBQUNwQix1QkFBaUIsS0FBSyxZQUFZO0FBQUEsSUFDbkM7QUFFQSxVQUFNLGlCQUFpQixLQUFLLGdCQUFnQjtBQUc1QyxlQUFXLFlBQVksV0FBVztBQUNqQyxVQUFJLGFBQWEsbUJBQW1CO0FBQ25DO0FBQUEsTUFDRDtBQUVBLFlBQU0sV0FBVyxLQUFLLG9CQUFvQixRQUFRO0FBQ2xELFVBQUksQ0FBQyxVQUFVO0FBRWQ7QUFBQSxNQUNEO0FBQ0EsZUFBUyxlQUFlLFFBQVE7QUFDaEMscUJBQWUsWUFBWSxRQUFRO0FBQUEsSUFDcEM7QUFHQSxTQUFLLGtCQUFrQixVQUFVLENBQUMsQ0FBQztBQUduQyxTQUFLLHNCQUFzQixLQUFLO0FBQ2hDLFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsV0FBSyx3QkFBd0IsS0FBSyxLQUFLLFdBQVc7QUFBQSxJQUNuRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGdCQUFnQixVQUFzQztBQUNyRCxVQUFNLFFBQVEsS0FBSyxvQkFBb0IsUUFBUTtBQUMvQyxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxNQUFNLGtCQUFrQixTQUFTO0FBQUEsRUFDekM7QUFBQSxFQUVBLG9CQUFvQixVQUF5RDtBQUM1RSxXQUFPLEtBQUssT0FBTyxLQUFLLFdBQVMsTUFBTSxrQkFBa0IsU0FBUyxRQUFRLENBQUM7QUFBQSxFQUM1RTtBQUFBLEVBRUEsaUJBQTJCO0FBQzFCLFdBQU8sS0FBSyxPQUFPLE9BQU8sV0FBUyxNQUFNLGtCQUFrQixTQUFTLENBQUMsRUFBRSxJQUFJLENBQUMsT0FBTyxVQUFVO0FBQzVGLGFBQU8sR0FBRyxRQUFRLENBQUMsS0FBSyxNQUFNLFFBQVEsTUFBTSxRQUFRLEVBQUU7QUFBQSxJQUN2RCxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsbUJBQW1CO0FBQ2xCLFVBQU0sVUFBVSxLQUFLLGNBQWMsY0FBYyxnQkFBZ0I7QUFDakUsU0FBSyxPQUFPLFFBQVEsQ0FBQyxHQUFHLE1BQU0sRUFBRSxXQUFXLFdBQVcsTUFBTSxLQUFLLGdCQUFnQixDQUFDO0FBQUEsRUFDbkY7QUFDRDtBQTFlYSx1QkFBTjtBQUFBLEVBdUNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBM0NVOyIsCiAgIm5hbWVzIjogWyJwb3NpdGlvbiIsICJncm91cCJdCn0K
