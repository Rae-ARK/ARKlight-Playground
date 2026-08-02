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
import { TERMINAL_VIEW_ID } from "../common/terminal.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { SplitView, Orientation, Sizing } from "../../../../base/browser/ui/splitview/splitview.js";
import { isHorizontal, IWorkbenchLayoutService, Position } from "../../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Direction, ITerminalInstanceService, ITerminalConfigurationService } from "./terminal.js";
import { ViewContainerLocation, IViewDescriptorService } from "../../../common/views.js";
import { TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { TerminalStatus } from "./terminalStatusList.js";
import { getWindow } from "../../../../base/browser/dom.js";
import { asArray } from "../../../../base/common/arrays.js";
import { hasKey, isNumber } from "../../../../base/common/types.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["SplitPaneMinSize"] = 80] = "SplitPaneMinSize";
  Constants2[Constants2["ResizePartCellCount"] = 4] = "ResizePartCellCount";
  return Constants2;
})(Constants || {});
class SplitPaneContainer extends Disposable {
  constructor(_container, orientation) {
    super();
    this._container = _container;
    this.orientation = orientation;
    this._splitViewDisposables = this._register(new DisposableStore());
    this._children = [];
    this._terminalToPane = /* @__PURE__ */ new Map();
    this._onDidChange = Event.None;
    this._width = this._container.offsetWidth;
    this._height = this._container.offsetHeight;
    this._createSplitView();
    this._splitView.layout(this.orientation === Orientation.HORIZONTAL ? this._width : this._height);
  }
  get onDidChange() {
    return this._onDidChange;
  }
  _createSplitView() {
    this._splitViewDisposables.clear();
    this._splitView = new SplitView(this._container, { orientation: this.orientation });
    this._splitViewDisposables.add(this._splitView);
    this._splitViewDisposables.add(this._splitView.onDidSashReset(() => this._splitView.distributeViewSizes()));
  }
  split(instance, index) {
    this._addChild(instance, index);
  }
  resizePane(index, direction, amount) {
    if (this._children.length <= 1) {
      return;
    }
    const sizes = [];
    for (let i = 0; i < this._splitView.length; i++) {
      sizes.push(this._splitView.getViewSize(i));
    }
    const isSizingEndPane = index !== this._children.length - 1;
    const indexToChange = isSizingEndPane ? index + 1 : index - 1;
    if (isSizingEndPane && direction === Direction.Left) {
      amount *= -1;
    } else if (!isSizingEndPane && direction === Direction.Right) {
      amount *= -1;
    } else if (isSizingEndPane && direction === Direction.Up) {
      amount *= -1;
    } else if (!isSizingEndPane && direction === Direction.Down) {
      amount *= -1;
    }
    if (sizes[index] + amount < 80 /* SplitPaneMinSize */) {
      amount = 80 /* SplitPaneMinSize */ - sizes[index];
    } else if (sizes[indexToChange] - amount < 80 /* SplitPaneMinSize */) {
      amount = sizes[indexToChange] - 80 /* SplitPaneMinSize */;
    }
    sizes[index] += amount;
    sizes[indexToChange] -= amount;
    for (let i = 0; i < this._splitView.length - 1; i++) {
      this._splitView.resizeView(i, sizes[i]);
    }
  }
  resizePanes(relativeSizes) {
    if (this._children.length <= 1) {
      return;
    }
    relativeSizes[relativeSizes.length - 1] += 1 - relativeSizes.reduce((totalValue, currentValue) => totalValue + currentValue, 0);
    let totalSize = 0;
    for (let i = 0; i < this._splitView.length; i++) {
      totalSize += this._splitView.getViewSize(i);
    }
    for (let i = 0; i < this._splitView.length; i++) {
      this._splitView.resizeView(i, totalSize * relativeSizes[i]);
    }
  }
  getPaneSize(instance) {
    const paneForInstance = this._terminalToPane.get(instance);
    if (!paneForInstance) {
      return 0;
    }
    const index = this._children.indexOf(paneForInstance);
    return this._splitView.getViewSize(index);
  }
  _addChild(instance, index) {
    const child = new SplitPane(instance, this.orientation === Orientation.HORIZONTAL ? this._height : this._width);
    child.orientation = this.orientation;
    if (isNumber(index)) {
      this._children.splice(index, 0, child);
    } else {
      this._children.push(child);
    }
    this._terminalToPane.set(instance, this._children[this._children.indexOf(child)]);
    this._withDisabledLayout(() => this._splitView.addView(child, Sizing.Distribute, index));
    this.layout(this._width, this._height);
    this._onDidChange = Event.any(...this._children.map((c) => c.onDidChange));
  }
  remove(instance) {
    let index = null;
    for (let i = 0; i < this._children.length; i++) {
      if (this._children[i].instance === instance) {
        index = i;
      }
    }
    if (index !== null) {
      this._children.splice(index, 1);
      this._terminalToPane.delete(instance);
      this._splitView.removeView(index, Sizing.Distribute);
      instance.detachFromElement();
    }
  }
  layout(width, height) {
    this._width = width;
    this._height = height;
    if (this.orientation === Orientation.HORIZONTAL) {
      this._children.forEach((c) => c.orthogonalLayout(height));
      this._splitView.layout(width);
    } else {
      this._children.forEach((c) => c.orthogonalLayout(width));
      this._splitView.layout(height);
    }
  }
  setOrientation(orientation) {
    if (this.orientation === orientation) {
      return;
    }
    this.orientation = orientation;
    while (this._container.children.length > 0) {
      this._container.children[0].remove();
    }
    this._createSplitView();
    this._withDisabledLayout(() => {
      this._children.forEach((child) => {
        child.orientation = orientation;
        this._splitView.addView(child, 1);
      });
    });
  }
  _withDisabledLayout(innerFunction) {
    this._children.forEach((c) => c.instance.disableLayout = true);
    innerFunction();
    this._children.forEach((c) => c.instance.disableLayout = false);
  }
}
class SplitPane {
  constructor(instance, orthogonalSize) {
    this.instance = instance;
    this.orthogonalSize = orthogonalSize;
    this.minimumSize = 80 /* SplitPaneMinSize */;
    this.maximumSize = Number.MAX_VALUE;
    this._onDidChange = Event.None;
    this.element = document.createElement("div");
    this.element.className = "terminal-split-pane";
    this.instance.attachToElement(this.element);
  }
  get onDidChange() {
    return this._onDidChange;
  }
  layout(size) {
    if (!size || !this.orthogonalSize) {
      return;
    }
    if (this.orientation === Orientation.VERTICAL) {
      this.instance.layout({ width: this.orthogonalSize, height: size });
    } else {
      this.instance.layout({ width: size, height: this.orthogonalSize });
    }
  }
  orthogonalLayout(size) {
    this.orthogonalSize = size;
  }
}
let TerminalGroup = class extends Disposable {
  constructor(_container, shellLaunchConfigOrInstance, _terminalConfigurationService, _terminalInstanceService, _paneCompositePartService, _layoutService, _viewDescriptorService, _instantiationService) {
    super();
    this._container = _container;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalInstanceService = _terminalInstanceService;
    this._paneCompositePartService = _paneCompositePartService;
    this._layoutService = _layoutService;
    this._viewDescriptorService = _viewDescriptorService;
    this._instantiationService = _instantiationService;
    this._terminalInstances = [];
    this._panelPosition = Position.BOTTOM;
    this._terminalLocation = ViewContainerLocation.Panel;
    this._instanceDisposables = /* @__PURE__ */ new Map();
    this._activeInstanceIndex = -1;
    this._hadFocusOnExit = false;
    this._visible = false;
    this._onDidDisposeInstance = this._register(new Emitter());
    this.onDidDisposeInstance = this._onDidDisposeInstance.event;
    this._onDidFocusInstance = this._register(new Emitter());
    this.onDidFocusInstance = this._onDidFocusInstance.event;
    this._onDidChangeInstanceCapability = this._register(new Emitter());
    this.onDidChangeInstanceCapability = this._onDidChangeInstanceCapability.event;
    this._onDisposed = this._register(new Emitter());
    this.onDisposed = this._onDisposed.event;
    this._onInstancesChanged = this._register(new Emitter());
    this.onInstancesChanged = this._onInstancesChanged.event;
    this._onDidChangeActiveInstance = this._register(new Emitter());
    this.onDidChangeActiveInstance = this._onDidChangeActiveInstance.event;
    this._onPanelOrientationChanged = this._register(new Emitter());
    this.onPanelOrientationChanged = this._onPanelOrientationChanged.event;
    if (shellLaunchConfigOrInstance) {
      this.addInstance(shellLaunchConfigOrInstance);
    }
    if (this._container) {
      this.attachToElement(this._container);
    }
    this._onPanelOrientationChanged.fire(this._terminalLocation === ViewContainerLocation.Panel && isHorizontal(this._panelPosition) ? Orientation.HORIZONTAL : Orientation.VERTICAL);
    this._register(toDisposable(() => {
      if (this._container && this._groupElement) {
        this._groupElement.remove();
        this._groupElement = void 0;
      }
    }));
  }
  get terminalInstances() {
    return this._terminalInstances;
  }
  get hadFocusOnExit() {
    return this._hadFocusOnExit;
  }
  addInstance(shellLaunchConfigOrInstance, parentTerminalId) {
    let instance;
    const parentIndex = parentTerminalId ? this._terminalInstances.findIndex((t) => t.instanceId === parentTerminalId) : this._activeInstanceIndex;
    if (hasKey(shellLaunchConfigOrInstance, { instanceId: true })) {
      instance = shellLaunchConfigOrInstance;
    } else {
      instance = this._terminalInstanceService.createInstance(shellLaunchConfigOrInstance, TerminalLocation.Panel);
    }
    if (this._terminalInstances.length === 0) {
      this._terminalInstances.push(instance);
      this._activeInstanceIndex = 0;
    } else {
      this._terminalInstances.splice(parentIndex + 1, 0, instance);
    }
    this._initInstanceListeners(instance);
    if (this._splitPaneContainer) {
      this._splitPaneContainer.split(instance, parentIndex + 1);
    }
    this._onInstancesChanged.fire();
  }
  dispose() {
    this._terminalInstances = [];
    this._onInstancesChanged.fire();
    this._splitPaneContainer?.dispose();
    super.dispose();
  }
  get activeInstance() {
    if (this._terminalInstances.length === 0) {
      return void 0;
    }
    return this._terminalInstances[this._activeInstanceIndex];
  }
  getLayoutInfo(isActive) {
    const instances = this.terminalInstances.filter((instance) => isNumber(instance.persistentProcessId) && instance.shouldPersist);
    const totalSize = instances.map((t) => this._splitPaneContainer?.getPaneSize(t) || 0).reduce((total, size) => total += size, 0);
    return {
      isActive,
      activePersistentProcessId: this.activeInstance ? this.activeInstance.persistentProcessId : void 0,
      terminals: instances.map((t) => {
        return {
          relativeSize: totalSize > 0 ? this._splitPaneContainer.getPaneSize(t) / totalSize : 0,
          terminal: t.persistentProcessId || 0
        };
      })
    };
  }
  _initInstanceListeners(instance) {
    this._instanceDisposables.set(instance.instanceId, [
      instance.onDisposed((instance2) => {
        this._onDidDisposeInstance.fire(instance2);
        this._handleOnDidDisposeInstance(instance2);
      }),
      instance.onDidFocus((instance2) => {
        this._setActiveInstance(instance2);
        this._onDidFocusInstance.fire(instance2);
      }),
      instance.capabilities.onDidChangeCapabilities(() => this._onDidChangeInstanceCapability.fire(instance))
    ]);
  }
  _handleOnDidDisposeInstance(instance) {
    this._removeInstance(instance);
  }
  removeInstance(instance) {
    this._removeInstance(instance);
  }
  _removeInstance(instance) {
    const index = this._terminalInstances.indexOf(instance);
    if (index === -1) {
      return;
    }
    const wasActiveInstance = instance === this.activeInstance;
    this._terminalInstances.splice(index, 1);
    if (wasActiveInstance && this._terminalInstances.length > 0) {
      const newIndex = index < this._terminalInstances.length ? index : this._terminalInstances.length - 1;
      this.setActiveInstanceByIndex(newIndex);
      this.activeInstance?.focus(true);
    } else if (index < this._activeInstanceIndex) {
      this._activeInstanceIndex--;
    }
    this._splitPaneContainer?.remove(instance);
    if (this._terminalInstances.length === 0) {
      this._hadFocusOnExit = instance.hadFocusOnExit;
      this._onDisposed.fire(this);
      this.dispose();
    } else {
      this._onInstancesChanged.fire();
    }
    const disposables = this._instanceDisposables.get(instance.instanceId);
    if (disposables) {
      dispose(disposables);
      this._instanceDisposables.delete(instance.instanceId);
    }
  }
  moveInstance(instances, index, position) {
    instances = asArray(instances);
    const hasInvalidInstance = instances.some((instance) => !this.terminalInstances.includes(instance));
    if (hasInvalidInstance) {
      return;
    }
    const insertIndex = position === "before" ? index : index + 1;
    this._terminalInstances.splice(insertIndex, 0, ...instances);
    for (const item of instances) {
      const originSourceGroupIndex = position === "after" ? this._terminalInstances.indexOf(item) : this._terminalInstances.lastIndexOf(item);
      this._terminalInstances.splice(originSourceGroupIndex, 1);
    }
    if (this._splitPaneContainer) {
      for (let i = 0; i < instances.length; i++) {
        const item = instances[i];
        this._splitPaneContainer.remove(item);
        this._splitPaneContainer.split(item, index + (position === "before" ? i : 0));
      }
    }
    this._onInstancesChanged.fire();
  }
  _setActiveInstance(instance) {
    this.setActiveInstanceByIndex(this._getIndexFromId(instance.instanceId));
  }
  _getIndexFromId(terminalId) {
    let terminalIndex = -1;
    this.terminalInstances.forEach((terminalInstance, i) => {
      if (terminalInstance.instanceId === terminalId) {
        terminalIndex = i;
      }
    });
    if (terminalIndex === -1) {
      throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
    }
    return terminalIndex;
  }
  setActiveInstanceByIndex(index, force) {
    if (index < 0 || index >= this._terminalInstances.length) {
      return;
    }
    const oldActiveInstance = this.activeInstance;
    this._activeInstanceIndex = index;
    if (oldActiveInstance !== this.activeInstance || force) {
      this._onInstancesChanged.fire();
      this._onDidChangeActiveInstance.fire(this.activeInstance);
    }
  }
  attachToElement(element) {
    this._container = element;
    if (!this._groupElement) {
      this._groupElement = document.createElement("div");
      this._groupElement.classList.add("terminal-group");
    }
    this._container.appendChild(this._groupElement);
    if (!this._splitPaneContainer) {
      this._panelPosition = this._layoutService.getPanelPosition();
      this._terminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
      const orientation = this._terminalLocation === ViewContainerLocation.Panel && isHorizontal(this._panelPosition) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
      this._splitPaneContainer = this._instantiationService.createInstance(SplitPaneContainer, this._groupElement, orientation);
      this.terminalInstances.forEach((instance) => this._splitPaneContainer.split(instance, this._activeInstanceIndex + 1));
    }
  }
  get title() {
    if (this._terminalInstances.length === 0) {
      return "";
    }
    let title = this.terminalInstances[0].title + this._getBellTitle(this.terminalInstances[0]);
    if (this.terminalInstances[0].description) {
      title += ` (${this.terminalInstances[0].description})`;
    }
    for (let i = 1; i < this.terminalInstances.length; i++) {
      const instance = this.terminalInstances[i];
      if (instance.title) {
        title += `, ${instance.title + this._getBellTitle(instance)}`;
        if (instance.description) {
          title += ` (${instance.description})`;
        }
      }
    }
    return title;
  }
  _getBellTitle(instance) {
    if (this._terminalConfigurationService.config.enableBell && instance.statusList.statuses.some((e) => e.id === TerminalStatus.Bell)) {
      return "*";
    }
    return "";
  }
  setVisible(visible) {
    this._visible = visible;
    if (this._groupElement) {
      this._groupElement.style.display = visible ? "" : "none";
    }
    this.terminalInstances.forEach((i) => i.setVisible(visible));
  }
  split(shellLaunchConfig) {
    const instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Panel);
    this.addInstance(instance, shellLaunchConfig.parentTerminalId);
    this._setActiveInstance(instance);
    return instance;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
  layout(width, height) {
    if (this._splitPaneContainer) {
      const newPanelPosition = this._layoutService.getPanelPosition();
      const newTerminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
      const terminalPositionChanged = newPanelPosition !== this._panelPosition || newTerminalLocation !== this._terminalLocation;
      if (terminalPositionChanged) {
        const newOrientation = newTerminalLocation === ViewContainerLocation.Panel && isHorizontal(newPanelPosition) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
        this._splitPaneContainer.setOrientation(newOrientation);
        this._panelPosition = newPanelPosition;
        this._terminalLocation = newTerminalLocation;
        this._onPanelOrientationChanged.fire(this._splitPaneContainer.orientation);
      }
      this._splitPaneContainer.layout(width, height);
      if (this._initialRelativeSizes && this._visible) {
        this.resizePanes(this._initialRelativeSizes);
        this._initialRelativeSizes = void 0;
      }
    }
  }
  focusPreviousPane() {
    const newIndex = this._activeInstanceIndex === 0 ? this._terminalInstances.length - 1 : this._activeInstanceIndex - 1;
    this.setActiveInstanceByIndex(newIndex);
  }
  focusNextPane() {
    const newIndex = this._activeInstanceIndex === this._terminalInstances.length - 1 ? 0 : this._activeInstanceIndex + 1;
    this.setActiveInstanceByIndex(newIndex);
  }
  _getPosition() {
    switch (this._terminalLocation) {
      case ViewContainerLocation.Panel:
        return this._panelPosition;
      case ViewContainerLocation.Sidebar:
        return this._layoutService.getSideBarPosition();
      case ViewContainerLocation.AuxiliaryBar:
        return this._layoutService.getSideBarPosition() === Position.LEFT ? Position.RIGHT : Position.LEFT;
      default:
        return this._panelPosition;
    }
  }
  _getOrientation() {
    return isHorizontal(this._getPosition()) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  }
  resizePane(direction) {
    if (!this._splitPaneContainer) {
      return;
    }
    const isHorizontalResize = direction === Direction.Left || direction === Direction.Right;
    const groupOrientation = this._getOrientation();
    const shouldResizePart = isHorizontalResize && groupOrientation === Orientation.VERTICAL || !isHorizontalResize && groupOrientation === Orientation.HORIZONTAL;
    const font = this._terminalConfigurationService.getFont(getWindow(this._groupElement));
    const charSize = isHorizontalResize ? font.charWidth : font.charHeight;
    if (charSize) {
      let resizeAmount = charSize * 4 /* ResizePartCellCount */;
      if (shouldResizePart) {
        const position = this._getPosition();
        const shouldShrink = position === Position.LEFT && direction === Direction.Left || position === Position.RIGHT && direction === Direction.Right || position === Position.BOTTOM && direction === Direction.Down || position === Position.TOP && direction === Direction.Up;
        if (shouldShrink) {
          resizeAmount *= -1;
        }
        this._layoutService.resizePart(this._paneCompositePartService.getPartId(this._terminalLocation), resizeAmount, resizeAmount);
      } else {
        this._splitPaneContainer.resizePane(this._activeInstanceIndex, direction, resizeAmount);
      }
    }
  }
  resizePanes(relativeSizes) {
    if (!this._splitPaneContainer) {
      this._initialRelativeSizes = relativeSizes;
      return;
    }
    this._splitPaneContainer.resizePanes(relativeSizes);
  }
};
TerminalGroup = __decorateClass([
  __decorateParam(2, ITerminalConfigurationService),
  __decorateParam(3, ITerminalInstanceService),
  __decorateParam(4, IPaneCompositePartService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IViewDescriptorService),
  __decorateParam(7, IInstantiationService)
], TerminalGroup);
export {
  TerminalGroup
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxHcm91cC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRFUk1JTkFMX1ZJRVdfSUQgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU3BsaXRWaWV3LCBPcmllbnRhdGlvbiwgSVZpZXcsIFNpemluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IGlzSG9yaXpvbnRhbCwgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCBEaXJlY3Rpb24sIElUZXJtaW5hbEdyb3VwLCBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsIElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxUYWJMYXlvdXRJbmZvQnlJZCwgVGVybWluYWxMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN0YXR1cyB9IGZyb20gJy4vdGVybWluYWxTdGF0dXNMaXN0LmpzJztcbmltcG9ydCB7IGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIGlzTnVtYmVyLCB0eXBlIFNpbmdsZU9yTWFueSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0LyoqXG5cdCAqIFRoZSBtaW5pbXVtIHNpemUgaW4gcGl4ZWxzIG9mIGEgc3BsaXQgcGFuZS5cblx0ICovXG5cdFNwbGl0UGFuZU1pblNpemUgPSA4MCxcblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2YgY2VsbHMgdGhlIHRlcm1pbmFsIGdldHMgYWRkZWQgb3IgcmVtb3ZlZCB3aGVuIGFza2VkIHRvIGluY3JlYXNlIG9yIGRlY3JlYXNlXG5cdCAqIHRoZSB2aWV3IHNpemUuXG5cdCAqL1xuXHRSZXNpemVQYXJ0Q2VsbENvdW50ID0gNFxufVxuXG5jbGFzcyBTcGxpdFBhbmVDb250YWluZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfaGVpZ2h0OiBudW1iZXI7XG5cdHByaXZhdGUgX3dpZHRoOiBudW1iZXI7XG5cdHByaXZhdGUgX3NwbGl0VmlldyE6IFNwbGl0Vmlldztcblx0cHJpdmF0ZSByZWFkb25seSBfc3BsaXRWaWV3RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9jaGlsZHJlbjogU3BsaXRQYW5lW10gPSBbXTtcblx0cHJpdmF0ZSBfdGVybWluYWxUb1BhbmU6IE1hcDxJVGVybWluYWxJbnN0YW5jZSwgU3BsaXRQYW5lPiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZTogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPiA9IEV2ZW50Lk5vbmU7XG5cdGdldCBvbkRpZENoYW5nZSgpOiBFdmVudDxudW1iZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwdWJsaWMgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3dpZHRoID0gdGhpcy5fY29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdHRoaXMuX2hlaWdodCA9IHRoaXMuX2NvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0dGhpcy5fY3JlYXRlU3BsaXRWaWV3KCk7XG5cdFx0dGhpcy5fc3BsaXRWaWV3LmxheW91dCh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5fd2lkdGggOiB0aGlzLl9oZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlU3BsaXRWaWV3KCk6IHZvaWQge1xuXHRcdHRoaXMuX3NwbGl0Vmlld0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3BsaXRWaWV3ID0gbmV3IFNwbGl0Vmlldyh0aGlzLl9jb250YWluZXIsIHsgb3JpZW50YXRpb246IHRoaXMub3JpZW50YXRpb24gfSk7XG5cdFx0dGhpcy5fc3BsaXRWaWV3RGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NwbGl0Vmlldyk7XG5cdFx0dGhpcy5fc3BsaXRWaWV3RGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NwbGl0Vmlldy5vbkRpZFNhc2hSZXNldCgoKSA9PiB0aGlzLl9zcGxpdFZpZXcuZGlzdHJpYnV0ZVZpZXdTaXplcygpKSk7XG5cdH1cblxuXHRzcGxpdChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9hZGRDaGlsZChpbnN0YW5jZSwgaW5kZXgpO1xuXHR9XG5cblx0cmVzaXplUGFuZShpbmRleDogbnVtYmVyLCBkaXJlY3Rpb246IERpcmVjdGlvbiwgYW1vdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBPbmx5IHJlc2l6ZSB3aGVuIHRoZXJlIGlzIG1vcmUgdGhhbiBvbmUgcGFuZVxuXHRcdGlmICh0aGlzLl9jaGlsZHJlbi5sZW5ndGggPD0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdldCBzaXplc1xuXHRcdGNvbnN0IHNpemVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc3BsaXRWaWV3Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRzaXplcy5wdXNoKHRoaXMuX3NwbGl0Vmlldy5nZXRWaWV3U2l6ZShpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHNpemUgZnJvbSByaWdodCBwYW5lLCB1bmxlc3MgaW5kZXggaXMgdGhlIGxhc3QgcGFuZSBpbiB3aGljaCBjYXNlIHVzZSBsZWZ0IHBhbmVcblx0XHRjb25zdCBpc1NpemluZ0VuZFBhbmUgPSBpbmRleCAhPT0gdGhpcy5fY2hpbGRyZW4ubGVuZ3RoIC0gMTtcblx0XHRjb25zdCBpbmRleFRvQ2hhbmdlID0gaXNTaXppbmdFbmRQYW5lID8gaW5kZXggKyAxIDogaW5kZXggLSAxO1xuXHRcdGlmIChpc1NpemluZ0VuZFBhbmUgJiYgZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uTGVmdCkge1xuXHRcdFx0YW1vdW50ICo9IC0xO1xuXHRcdH0gZWxzZSBpZiAoIWlzU2l6aW5nRW5kUGFuZSAmJiBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5SaWdodCkge1xuXHRcdFx0YW1vdW50ICo9IC0xO1xuXHRcdH0gZWxzZSBpZiAoaXNTaXppbmdFbmRQYW5lICYmIGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlVwKSB7XG5cdFx0XHRhbW91bnQgKj0gLTE7XG5cdFx0fSBlbHNlIGlmICghaXNTaXppbmdFbmRQYW5lICYmIGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLkRvd24pIHtcblx0XHRcdGFtb3VudCAqPSAtMTtcblx0XHR9XG5cblx0XHQvLyBFbnN1cmUgdGhlIHNpemUgaXMgbm90IHJlZHVjZWQgYmV5b25kIHRoZSBtaW5pbXVtLCBvdGhlcndpc2Ugd2VpcmQgdGhpbmdzIGNhbiBoYXBwZW5cblx0XHRpZiAoc2l6ZXNbaW5kZXhdICsgYW1vdW50IDwgQ29uc3RhbnRzLlNwbGl0UGFuZU1pblNpemUpIHtcblx0XHRcdGFtb3VudCA9IENvbnN0YW50cy5TcGxpdFBhbmVNaW5TaXplIC0gc2l6ZXNbaW5kZXhdO1xuXHRcdH0gZWxzZSBpZiAoc2l6ZXNbaW5kZXhUb0NoYW5nZV0gLSBhbW91bnQgPCBDb25zdGFudHMuU3BsaXRQYW5lTWluU2l6ZSkge1xuXHRcdFx0YW1vdW50ID0gc2l6ZXNbaW5kZXhUb0NoYW5nZV0gLSBDb25zdGFudHMuU3BsaXRQYW5lTWluU2l6ZTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSB0aGUgc2l6ZSBjaGFuZ2Vcblx0XHRzaXplc1tpbmRleF0gKz0gYW1vdW50O1xuXHRcdHNpemVzW2luZGV4VG9DaGFuZ2VdIC09IGFtb3VudDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NwbGl0Vmlldy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdHRoaXMuX3NwbGl0Vmlldy5yZXNpemVWaWV3KGksIHNpemVzW2ldKTtcblx0XHR9XG5cdH1cblxuXHRyZXNpemVQYW5lcyhyZWxhdGl2ZVNpemVzOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jaGlsZHJlbi5sZW5ndGggPD0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGFzc2lnbiBhbnkgZXh0cmEgc2l6ZSB0byBsYXN0IHRlcm1pbmFsXG5cdFx0cmVsYXRpdmVTaXplc1tyZWxhdGl2ZVNpemVzLmxlbmd0aCAtIDFdICs9IDEgLSByZWxhdGl2ZVNpemVzLnJlZHVjZSgodG90YWxWYWx1ZSwgY3VycmVudFZhbHVlKSA9PiB0b3RhbFZhbHVlICsgY3VycmVudFZhbHVlLCAwKTtcblx0XHRsZXQgdG90YWxTaXplID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3NwbGl0Vmlldy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dG90YWxTaXplICs9IHRoaXMuX3NwbGl0Vmlldy5nZXRWaWV3U2l6ZShpKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zcGxpdFZpZXcubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX3NwbGl0Vmlldy5yZXNpemVWaWV3KGksIHRvdGFsU2l6ZSAqIHJlbGF0aXZlU2l6ZXNbaV0pO1xuXHRcdH1cblx0fVxuXG5cdGdldFBhbmVTaXplKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IG51bWJlciB7XG5cdFx0Y29uc3QgcGFuZUZvckluc3RhbmNlID0gdGhpcy5fdGVybWluYWxUb1BhbmUuZ2V0KGluc3RhbmNlKTtcblx0XHRpZiAoIXBhbmVGb3JJbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9jaGlsZHJlbi5pbmRleE9mKHBhbmVGb3JJbnN0YW5jZSk7XG5cdFx0cmV0dXJuIHRoaXMuX3NwbGl0Vmlldy5nZXRWaWV3U2l6ZShpbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRDaGlsZChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjaGlsZCA9IG5ldyBTcGxpdFBhbmUoaW5zdGFuY2UsIHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLl9oZWlnaHQgOiB0aGlzLl93aWR0aCk7XG5cdFx0Y2hpbGQub3JpZW50YXRpb24gPSB0aGlzLm9yaWVudGF0aW9uO1xuXHRcdGlmIChpc051bWJlcihpbmRleCkpIHtcblx0XHRcdHRoaXMuX2NoaWxkcmVuLnNwbGljZShpbmRleCwgMCwgY2hpbGQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jaGlsZHJlbi5wdXNoKGNoaWxkKTtcblx0XHR9XG5cdFx0dGhpcy5fdGVybWluYWxUb1BhbmUuc2V0KGluc3RhbmNlLCB0aGlzLl9jaGlsZHJlblt0aGlzLl9jaGlsZHJlbi5pbmRleE9mKGNoaWxkKV0pO1xuXG5cdFx0dGhpcy5fd2l0aERpc2FibGVkTGF5b3V0KCgpID0+IHRoaXMuX3NwbGl0Vmlldy5hZGRWaWV3KGNoaWxkLCBTaXppbmcuRGlzdHJpYnV0ZSwgaW5kZXgpKTtcblx0XHR0aGlzLmxheW91dCh0aGlzLl93aWR0aCwgdGhpcy5faGVpZ2h0KTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlID0gRXZlbnQuYW55KC4uLnRoaXMuX2NoaWxkcmVuLm1hcChjID0+IGMub25EaWRDaGFuZ2UpKTtcblx0fVxuXG5cdHJlbW92ZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRsZXQgaW5kZXg6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLl9jaGlsZHJlbltpXS5pbnN0YW5jZSA9PT0gaW5zdGFuY2UpIHtcblx0XHRcdFx0aW5kZXggPSBpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoaW5kZXggIT09IG51bGwpIHtcblx0XHRcdHRoaXMuX2NoaWxkcmVuLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFRvUGFuZS5kZWxldGUoaW5zdGFuY2UpO1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlbW92ZVZpZXcoaW5kZXgsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRcdGluc3RhbmNlLmRldGFjaEZyb21FbGVtZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkdGggPSB3aWR0aDtcblx0XHR0aGlzLl9oZWlnaHQgPSBoZWlnaHQ7XG5cdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwpIHtcblx0XHRcdHRoaXMuX2NoaWxkcmVuLmZvckVhY2goYyA9PiBjLm9ydGhvZ29uYWxMYXlvdXQoaGVpZ2h0KSk7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcubGF5b3V0KHdpZHRoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY2hpbGRyZW4uZm9yRWFjaChjID0+IGMub3J0aG9nb25hbExheW91dCh3aWR0aCkpO1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LmxheW91dChoZWlnaHQpO1xuXHRcdH1cblx0fVxuXG5cdHNldE9yaWVudGF0aW9uKG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBvcmllbnRhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm9yaWVudGF0aW9uID0gb3JpZW50YXRpb247XG5cblx0XHQvLyBSZW1vdmUgb2xkIHNwbGl0IHZpZXdcblx0XHR3aGlsZSAodGhpcy5fY29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2NvbnRhaW5lci5jaGlsZHJlblswXS5yZW1vdmUoKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgbmV3IHNwbGl0IHZpZXcgd2l0aCB1cGRhdGVkIG9yaWVudGF0aW9uXG5cdFx0dGhpcy5fY3JlYXRlU3BsaXRWaWV3KCk7XG5cdFx0dGhpcy5fd2l0aERpc2FibGVkTGF5b3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2NoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4ge1xuXHRcdFx0XHRjaGlsZC5vcmllbnRhdGlvbiA9IG9yaWVudGF0aW9uO1xuXHRcdFx0XHR0aGlzLl9zcGxpdFZpZXcuYWRkVmlldyhjaGlsZCwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3dpdGhEaXNhYmxlZExheW91dChpbm5lckZ1bmN0aW9uOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Ly8gV2hlbmV2ZXIgbWFuaXB1bGF0aW5nIHZpZXdzIHRoYXQgYXJlIGdvaW5nIHRvIGJlIGNoYW5nZWQgaW1tZWRpYXRlbHksIGRpc2FibGluZ1xuXHRcdC8vIGxheW91dC9yZXNpemUgZXZlbnRzIGluIHRoZSB0ZXJtaW5hbCBwcmV2ZW50IGJhZCBkaW1lbnNpb25zIGdvaW5nIHRvIHRoZSBwdHkuXG5cdFx0dGhpcy5fY2hpbGRyZW4uZm9yRWFjaChjID0+IGMuaW5zdGFuY2UuZGlzYWJsZUxheW91dCA9IHRydWUpO1xuXHRcdGlubmVyRnVuY3Rpb24oKTtcblx0XHR0aGlzLl9jaGlsZHJlbi5mb3JFYWNoKGMgPT4gYy5pbnN0YW5jZS5kaXNhYmxlTGF5b3V0ID0gZmFsc2UpO1xuXHR9XG59XG5cbmNsYXNzIFNwbGl0UGFuZSBpbXBsZW1lbnRzIElWaWV3IHtcblx0bWluaW11bVNpemU6IG51bWJlciA9IENvbnN0YW50cy5TcGxpdFBhbmVNaW5TaXplO1xuXHRtYXhpbXVtU2l6ZTogbnVtYmVyID0gTnVtYmVyLk1BWF9WQUxVRTtcblxuXHRvcmllbnRhdGlvbjogT3JpZW50YXRpb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2U6IEV2ZW50PG51bWJlciB8IHVuZGVmaW5lZD4gPSBFdmVudC5Ob25lO1xuXHRnZXQgb25EaWRDaGFuZ2UoKTogRXZlbnQ8bnVtYmVyIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZTsgfVxuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSxcblx0XHRwdWJsaWMgb3J0aG9nb25hbFNpemU6IG51bWJlclxuXHQpIHtcblx0XHR0aGlzLmVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NOYW1lID0gJ3Rlcm1pbmFsLXNwbGl0LXBhbmUnO1xuXHRcdHRoaXMuaW5zdGFuY2UuYXR0YWNoVG9FbGVtZW50KHRoaXMuZWxlbWVudCk7XG5cdH1cblxuXHRsYXlvdXQoc2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gT25seSBsYXlvdXQgd2hlbiBib3RoIHNpemVzIGFyZSBrbm93blxuXHRcdGlmICghc2l6ZSB8fCAhdGhpcy5vcnRob2dvbmFsU2l6ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCkge1xuXHRcdFx0dGhpcy5pbnN0YW5jZS5sYXlvdXQoeyB3aWR0aDogdGhpcy5vcnRob2dvbmFsU2l6ZSwgaGVpZ2h0OiBzaXplIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmluc3RhbmNlLmxheW91dCh7IHdpZHRoOiBzaXplLCBoZWlnaHQ6IHRoaXMub3J0aG9nb25hbFNpemUgfSk7XG5cdFx0fVxuXHR9XG5cblx0b3J0aG9nb25hbExheW91dChzaXplOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLm9ydGhvZ29uYWxTaXplID0gc2l6ZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxHcm91cCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxHcm91cCB7XG5cdHByaXZhdGUgX3Rlcm1pbmFsSW5zdGFuY2VzOiBJVGVybWluYWxJbnN0YW5jZVtdID0gW107XG5cdHByaXZhdGUgX3NwbGl0UGFuZUNvbnRhaW5lcjogU3BsaXRQYW5lQ29udGFpbmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9ncm91cEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wYW5lbFBvc2l0aW9uOiBQb3NpdGlvbiA9IFBvc2l0aW9uLkJPVFRPTTtcblx0cHJpdmF0ZSBfdGVybWluYWxMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uID0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsO1xuXHRwcml2YXRlIF9pbnN0YW5jZURpc3Bvc2FibGVzOiBNYXA8bnVtYmVyLCBJRGlzcG9zYWJsZVtdPiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIF9hY3RpdmVJbnN0YW5jZUluZGV4OiBudW1iZXIgPSAtMTtcblxuXHRnZXQgdGVybWluYWxJbnN0YW5jZXMoKTogSVRlcm1pbmFsSW5zdGFuY2VbXSB7IHJldHVybiB0aGlzLl90ZXJtaW5hbEluc3RhbmNlczsgfVxuXG5cdHByaXZhdGUgX2hhZEZvY3VzT25FeGl0OiBib29sZWFuID0gZmFsc2U7XG5cdGdldCBoYWRGb2N1c09uRXhpdCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hhZEZvY3VzT25FeGl0OyB9XG5cblx0cHJpdmF0ZSBfaW5pdGlhbFJlbGF0aXZlU2l6ZXM6IG51bWJlcltdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF92aXNpYmxlOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlSW5zdGFuY2U6IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2VJbnN0YW5jZSA9IHRoaXMuX29uRGlkRGlzcG9zZUluc3RhbmNlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzSW5zdGFuY2U6IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzSW5zdGFuY2UgPSB0aGlzLl9vbkRpZEZvY3VzSW5zdGFuY2UuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5OiBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJbnN0YW5jZUNhcGFiaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaXNwb3NlZDogRW1pdHRlcjxJVGVybWluYWxHcm91cD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxHcm91cD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlzcG9zZWQgPSB0aGlzLl9vbkRpc3Bvc2VkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkluc3RhbmNlc0NoYW5nZWQ6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25JbnN0YW5jZXNDaGFuZ2VkID0gdGhpcy5fb25JbnN0YW5jZXNDaGFuZ2VkLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25QYW5lbE9yaWVudGF0aW9uQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE9yaWVudGF0aW9uPigpKTtcblx0cmVhZG9ubHkgb25QYW5lbE9yaWVudGF0aW9uQ2hhbmdlZCA9IHRoaXMuX29uUGFuZWxPcmllbnRhdGlvbkNoYW5nZWQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCxcblx0XHRzaGVsbExhdW5jaENvbmZpZ09ySW5zdGFuY2U6IElTaGVsbExhdW5jaENvbmZpZyB8IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlOiBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UsXG5cdFx0QElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlOiBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnT3JJbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5hZGRJbnN0YW5jZShzaGVsbExhdW5jaENvbmZpZ09ySW5zdGFuY2UpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmF0dGFjaFRvRWxlbWVudCh0aGlzLl9jb250YWluZXIpO1xuXHRcdH1cblx0XHR0aGlzLl9vblBhbmVsT3JpZW50YXRpb25DaGFuZ2VkLmZpcmUodGhpcy5fdGVybWluYWxMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsICYmIGlzSG9yaXpvbnRhbCh0aGlzLl9wYW5lbFBvc2l0aW9uKSA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb250YWluZXIgJiYgdGhpcy5fZ3JvdXBFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX2dyb3VwRWxlbWVudC5yZW1vdmUoKTtcblx0XHRcdFx0dGhpcy5fZ3JvdXBFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFkZEluc3RhbmNlKHNoZWxsTGF1bmNoQ29uZmlnT3JJbnN0YW5jZTogSVNoZWxsTGF1bmNoQ29uZmlnIHwgSVRlcm1pbmFsSW5zdGFuY2UsIHBhcmVudFRlcm1pbmFsSWQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRsZXQgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdC8vIGlmIGEgcGFyZW50IHRlcm1pbmFsIGlzIHByb3ZpZGVkLCBmaW5kIGl0XG5cdFx0Ly8gb3RoZXJ3aXNlLCBwYXJlbnQgaXMgdGhlIGFjdGl2ZSB0ZXJtaW5hbFxuXHRcdGNvbnN0IHBhcmVudEluZGV4ID0gcGFyZW50VGVybWluYWxJZCA/IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmZpbmRJbmRleCh0ID0+IHQuaW5zdGFuY2VJZCA9PT0gcGFyZW50VGVybWluYWxJZCkgOiB0aGlzLl9hY3RpdmVJbnN0YW5jZUluZGV4O1xuXHRcdGlmIChoYXNLZXkoc2hlbGxMYXVuY2hDb25maWdPckluc3RhbmNlLCB7IGluc3RhbmNlSWQ6IHRydWUgfSkpIHtcblx0XHRcdGluc3RhbmNlID0gc2hlbGxMYXVuY2hDb25maWdPckluc3RhbmNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHNoZWxsTGF1bmNoQ29uZmlnT3JJbnN0YW5jZSwgVGVybWluYWxMb2NhdGlvbi5QYW5lbCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLnB1c2goaW5zdGFuY2UpO1xuXHRcdFx0dGhpcy5fYWN0aXZlSW5zdGFuY2VJbmRleCA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLnNwbGljZShwYXJlbnRJbmRleCArIDEsIDAsIGluc3RhbmNlKTtcblx0XHR9XG5cdFx0dGhpcy5faW5pdEluc3RhbmNlTGlzdGVuZXJzKGluc3RhbmNlKTtcblxuXHRcdGlmICh0aGlzLl9zcGxpdFBhbmVDb250YWluZXIpIHtcblx0XHRcdHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lci5zcGxpdChpbnN0YW5jZSwgcGFyZW50SW5kZXggKyAxKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkluc3RhbmNlc0NoYW5nZWQuZmlyZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlcyA9IFtdO1xuXHRcdHRoaXMuX29uSW5zdGFuY2VzQ2hhbmdlZC5maXJlKCk7XG5cdFx0dGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyPy5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUluc3RhbmNlKCk6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fdGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxJbnN0YW5jZXNbdGhpcy5fYWN0aXZlSW5zdGFuY2VJbmRleF07XG5cdH1cblxuXHRnZXRMYXlvdXRJbmZvKGlzQWN0aXZlOiBib29sZWFuKTogSVRlcm1pbmFsVGFiTGF5b3V0SW5mb0J5SWQge1xuXHRcdGNvbnN0IGluc3RhbmNlcyA9IHRoaXMudGVybWluYWxJbnN0YW5jZXMuZmlsdGVyKGluc3RhbmNlID0+IGlzTnVtYmVyKGluc3RhbmNlLnBlcnNpc3RlbnRQcm9jZXNzSWQpICYmIGluc3RhbmNlLnNob3VsZFBlcnNpc3QpO1xuXHRcdGNvbnN0IHRvdGFsU2l6ZSA9IGluc3RhbmNlcy5tYXAodCA9PiB0aGlzLl9zcGxpdFBhbmVDb250YWluZXI/LmdldFBhbmVTaXplKHQpIHx8IDApLnJlZHVjZSgodG90YWwsIHNpemUpID0+IHRvdGFsICs9IHNpemUsIDApO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpc0FjdGl2ZTogaXNBY3RpdmUsXG5cdFx0XHRhY3RpdmVQZXJzaXN0ZW50UHJvY2Vzc0lkOiB0aGlzLmFjdGl2ZUluc3RhbmNlID8gdGhpcy5hY3RpdmVJbnN0YW5jZS5wZXJzaXN0ZW50UHJvY2Vzc0lkIDogdW5kZWZpbmVkLFxuXHRcdFx0dGVybWluYWxzOiBpbnN0YW5jZXMubWFwKHQgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlbGF0aXZlU2l6ZTogdG90YWxTaXplID4gMCA/IHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lciEuZ2V0UGFuZVNpemUodCkgLyB0b3RhbFNpemUgOiAwLFxuXHRcdFx0XHRcdHRlcm1pbmFsOiB0LnBlcnNpc3RlbnRQcm9jZXNzSWQgfHwgMFxuXHRcdFx0XHR9O1xuXHRcdFx0fSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdEluc3RhbmNlTGlzdGVuZXJzKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdHRoaXMuX2luc3RhbmNlRGlzcG9zYWJsZXMuc2V0KGluc3RhbmNlLmluc3RhbmNlSWQsIFtcblx0XHRcdGluc3RhbmNlLm9uRGlzcG9zZWQoaW5zdGFuY2UgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZERpc3Bvc2VJbnN0YW5jZS5maXJlKGluc3RhbmNlKTtcblx0XHRcdFx0dGhpcy5faGFuZGxlT25EaWREaXNwb3NlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0fSksXG5cdFx0XHRpbnN0YW5jZS5vbkRpZEZvY3VzKGluc3RhbmNlID0+IHtcblx0XHRcdFx0dGhpcy5fc2V0QWN0aXZlSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEZvY3VzSW5zdGFuY2UuZmlyZShpbnN0YW5jZSk7XG5cdFx0XHR9KSxcblx0XHRcdGluc3RhbmNlLmNhcGFiaWxpdGllcy5vbkRpZENoYW5nZUNhcGFiaWxpdGllcygoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eS5maXJlKGluc3RhbmNlKSksXG5cdFx0XSk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVPbkRpZERpc3Bvc2VJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHR0aGlzLl9yZW1vdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdH1cblxuXHRyZW1vdmVJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHR0aGlzLl9yZW1vdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmluZGV4T2YoaW5zdGFuY2UpO1xuXHRcdGlmIChpbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3YXNBY3RpdmVJbnN0YW5jZSA9IGluc3RhbmNlID09PSB0aGlzLmFjdGl2ZUluc3RhbmNlO1xuXHRcdHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLnNwbGljZShpbmRleCwgMSk7XG5cblx0XHQvLyBBZGp1c3QgZm9jdXMgaWYgdGhlIGluc3RhbmNlIHdhcyBhY3RpdmVcblx0XHRpZiAod2FzQWN0aXZlSW5zdGFuY2UgJiYgdGhpcy5fdGVybWluYWxJbnN0YW5jZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgbmV3SW5kZXggPSBpbmRleCA8IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA/IGluZGV4IDogdGhpcy5fdGVybWluYWxJbnN0YW5jZXMubGVuZ3RoIC0gMTtcblx0XHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2VCeUluZGV4KG5ld0luZGV4KTtcblx0XHRcdC8vIFRPRE86IE9ubHkgZm9jdXMgdGhlIG5ldyBpbnN0YW5jZSBpZiB0aGUgZ3JvdXAgaGFkIGZvY3VzP1xuXHRcdFx0dGhpcy5hY3RpdmVJbnN0YW5jZT8uZm9jdXModHJ1ZSk7XG5cdFx0fSBlbHNlIGlmIChpbmRleCA8IHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXgpIHtcblx0XHRcdC8vIEFkanVzdCBhY3RpdmUgaW5zdGFuY2UgaW5kZXggaWYgbmVlZGVkXG5cdFx0XHR0aGlzLl9hY3RpdmVJbnN0YW5jZUluZGV4LS07XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyPy5yZW1vdmUoaW5zdGFuY2UpO1xuXG5cdFx0Ly8gRmlyZSBldmVudHMgYW5kIGRpc3Bvc2UgZ3JvdXAgaWYgaXQgd2FzIHRoZSBsYXN0IGluc3RhbmNlXG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5faGFkRm9jdXNPbkV4aXQgPSBpbnN0YW5jZS5oYWRGb2N1c09uRXhpdDtcblx0XHRcdHRoaXMuX29uRGlzcG9zZWQuZmlyZSh0aGlzKTtcblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkluc3RhbmNlc0NoYW5nZWQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdC8vIERpc3Bvc2UgaW5zdGFuY2UgZXZlbnQgbGlzdGVuZXJzXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSB0aGlzLl9pbnN0YW5jZURpc3Bvc2FibGVzLmdldChpbnN0YW5jZS5pbnN0YW5jZUlkKTtcblx0XHRpZiAoZGlzcG9zYWJsZXMpIHtcblx0XHRcdGRpc3Bvc2UoZGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5faW5zdGFuY2VEaXNwb3NhYmxlcy5kZWxldGUoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0fVxuXHR9XG5cblx0bW92ZUluc3RhbmNlKGluc3RhbmNlczogU2luZ2xlT3JNYW55PElUZXJtaW5hbEluc3RhbmNlPiwgaW5kZXg6IG51bWJlciwgcG9zaXRpb246ICdiZWZvcmUnIHwgJ2FmdGVyJyk6IHZvaWQge1xuXHRcdGluc3RhbmNlcyA9IGFzQXJyYXkoaW5zdGFuY2VzKTtcblx0XHRjb25zdCBoYXNJbnZhbGlkSW5zdGFuY2UgPSBpbnN0YW5jZXMuc29tZShpbnN0YW5jZSA9PiAhdGhpcy50ZXJtaW5hbEluc3RhbmNlcy5pbmNsdWRlcyhpbnN0YW5jZSkpO1xuXHRcdGlmIChoYXNJbnZhbGlkSW5zdGFuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5zZXJ0SW5kZXggPSBwb3NpdGlvbiA9PT0gJ2JlZm9yZScgPyBpbmRleCA6IGluZGV4ICsgMTtcblx0XHR0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5zcGxpY2UoaW5zZXJ0SW5kZXgsIDAsIC4uLmluc3RhbmNlcyk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGluc3RhbmNlcykge1xuXHRcdFx0Y29uc3Qgb3JpZ2luU291cmNlR3JvdXBJbmRleCA9IHBvc2l0aW9uID09PSAnYWZ0ZXInID8gdGhpcy5fdGVybWluYWxJbnN0YW5jZXMuaW5kZXhPZihpdGVtKSA6IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmxhc3RJbmRleE9mKGl0ZW0pO1xuXHRcdFx0dGhpcy5fdGVybWluYWxJbnN0YW5jZXMuc3BsaWNlKG9yaWdpblNvdXJjZUdyb3VwSW5kZXgsIDEpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGluc3RhbmNlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gaW5zdGFuY2VzW2ldO1xuXHRcdFx0XHR0aGlzLl9zcGxpdFBhbmVDb250YWluZXIucmVtb3ZlKGl0ZW0pO1xuXHRcdFx0XHR0aGlzLl9zcGxpdFBhbmVDb250YWluZXIuc3BsaXQoaXRlbSwgaW5kZXggKyAocG9zaXRpb24gPT09ICdiZWZvcmUnID8gaSA6IDApKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fb25JbnN0YW5jZXNDaGFuZ2VkLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSkge1xuXHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2VCeUluZGV4KHRoaXMuX2dldEluZGV4RnJvbUlkKGluc3RhbmNlLmluc3RhbmNlSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEluZGV4RnJvbUlkKHRlcm1pbmFsSWQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IHRlcm1pbmFsSW5kZXggPSAtMTtcblx0XHR0aGlzLnRlcm1pbmFsSW5zdGFuY2VzLmZvckVhY2goKHRlcm1pbmFsSW5zdGFuY2UsIGkpID0+IHtcblx0XHRcdGlmICh0ZXJtaW5hbEluc3RhbmNlLmluc3RhbmNlSWQgPT09IHRlcm1pbmFsSWQpIHtcblx0XHRcdFx0dGVybWluYWxJbmRleCA9IGk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aWYgKHRlcm1pbmFsSW5kZXggPT09IC0xKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFRlcm1pbmFsIHdpdGggSUQgJHt0ZXJtaW5hbElkfSBkb2VzIG5vdCBleGlzdCAoaGFzIGl0IGFscmVhZHkgYmVlbiBkaXNwb3NlZD8pYCk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXJtaW5hbEluZGV4O1xuXHR9XG5cblx0c2V0QWN0aXZlSW5zdGFuY2VCeUluZGV4KGluZGV4OiBudW1iZXIsIGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIENoZWNrIGZvciBpbnZhbGlkIHZhbHVlXG5cdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRBY3RpdmVJbnN0YW5jZSA9IHRoaXMuYWN0aXZlSW5zdGFuY2U7XG5cdFx0dGhpcy5fYWN0aXZlSW5zdGFuY2VJbmRleCA9IGluZGV4O1xuXHRcdGlmIChvbGRBY3RpdmVJbnN0YW5jZSAhPT0gdGhpcy5hY3RpdmVJbnN0YW5jZSB8fCBmb3JjZSkge1xuXHRcdFx0dGhpcy5fb25JbnN0YW5jZXNDaGFuZ2VkLmZpcmUoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UuZmlyZSh0aGlzLmFjdGl2ZUluc3RhbmNlKTtcblx0XHR9XG5cdH1cblxuXHRhdHRhY2hUb0VsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250YWluZXIgPSBlbGVtZW50O1xuXG5cdFx0Ly8gSWYgd2UgYWxyZWFkeSBoYXZlIGEgZ3JvdXAgZWxlbWVudCwgd2UgY2FuIHJlcGFyZW50IGl0XG5cdFx0aWYgKCF0aGlzLl9ncm91cEVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX2dyb3VwRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5fZ3JvdXBFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3Rlcm1pbmFsLWdyb3VwJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2dyb3VwRWxlbWVudCk7XG5cdFx0aWYgKCF0aGlzLl9zcGxpdFBhbmVDb250YWluZXIpIHtcblx0XHRcdHRoaXMuX3BhbmVsUG9zaXRpb24gPSB0aGlzLl9sYXlvdXRTZXJ2aWNlLmdldFBhbmVsUG9zaXRpb24oKTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsTG9jYXRpb24gPSB0aGlzLl92aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZChURVJNSU5BTF9WSUVXX0lEKSE7XG5cdFx0XHRjb25zdCBvcmllbnRhdGlvbiA9IHRoaXMuX3Rlcm1pbmFsTG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCAmJiBpc0hvcml6b250YWwodGhpcy5fcGFuZWxQb3NpdGlvbikgPyBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdFx0XHR0aGlzLl9zcGxpdFBhbmVDb250YWluZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTcGxpdFBhbmVDb250YWluZXIsIHRoaXMuX2dyb3VwRWxlbWVudCwgb3JpZW50YXRpb24pO1xuXHRcdFx0dGhpcy50ZXJtaW5hbEluc3RhbmNlcy5mb3JFYWNoKGluc3RhbmNlID0+IHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lciEuc3BsaXQoaW5zdGFuY2UsIHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXggKyAxKSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHRpdGxlKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gTm9ybWFsbHkgY29uc3VtZXJzIHNob3VsZCBub3QgY2FsbCBpbnRvIHRpdGxlIGF0IGFsbCBhZnRlciB0aGUgZ3JvdXAgaXMgZGlzcG9zZWQgYnV0XG5cdFx0XHQvLyB0aGlzIGlzIHJlcXVpcmVkIHdoZW4gdGhlIGdyb3VwIGlzIHVzZWQgYXMgcGFydCBvZiBhIHRyZWUuXG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGxldCB0aXRsZSA9IHRoaXMudGVybWluYWxJbnN0YW5jZXNbMF0udGl0bGUgKyB0aGlzLl9nZXRCZWxsVGl0bGUodGhpcy50ZXJtaW5hbEluc3RhbmNlc1swXSk7XG5cdFx0aWYgKHRoaXMudGVybWluYWxJbnN0YW5jZXNbMF0uZGVzY3JpcHRpb24pIHtcblx0XHRcdHRpdGxlICs9IGAgKCR7dGhpcy50ZXJtaW5hbEluc3RhbmNlc1swXS5kZXNjcmlwdGlvbn0pYDtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCB0aGlzLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMudGVybWluYWxJbnN0YW5jZXNbaV07XG5cdFx0XHRpZiAoaW5zdGFuY2UudGl0bGUpIHtcblx0XHRcdFx0dGl0bGUgKz0gYCwgJHtpbnN0YW5jZS50aXRsZSArIHRoaXMuX2dldEJlbGxUaXRsZShpbnN0YW5jZSl9YDtcblx0XHRcdFx0aWYgKGluc3RhbmNlLmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0dGl0bGUgKz0gYCAoJHtpbnN0YW5jZS5kZXNjcmlwdGlvbn0pYDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGl0bGU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRCZWxsVGl0bGUoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKSB7XG5cdFx0aWYgKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmVuYWJsZUJlbGwgJiYgaW5zdGFuY2Uuc3RhdHVzTGlzdC5zdGF0dXNlcy5zb21lKGUgPT4gZS5pZCA9PT0gVGVybWluYWxTdGF0dXMuQmVsbCkpIHtcblx0XHRcdHJldHVybiAnKic7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdGlmICh0aGlzLl9ncm91cEVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX2dyb3VwRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHRcdH1cblx0XHR0aGlzLnRlcm1pbmFsSW5zdGFuY2VzLmZvckVhY2goaSA9PiBpLnNldFZpc2libGUodmlzaWJsZSkpO1xuXHR9XG5cblx0c3BsaXQoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyk6IElUZXJtaW5hbEluc3RhbmNlIHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHNoZWxsTGF1bmNoQ29uZmlnLCBUZXJtaW5hbExvY2F0aW9uLlBhbmVsKTtcblx0XHR0aGlzLmFkZEluc3RhbmNlKGluc3RhbmNlLCBzaGVsbExhdW5jaENvbmZpZy5wYXJlbnRUZXJtaW5hbElkKTtcblx0XHR0aGlzLl9zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0cmV0dXJuIGluc3RhbmNlO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIHBhbmVsIHBvc2l0aW9uIGNoYW5nZWQgYW5kIHJvdGF0ZSBwYW5lcyBpZiBzb1xuXHRcdFx0Y29uc3QgbmV3UGFuZWxQb3NpdGlvbiA9IHRoaXMuX2xheW91dFNlcnZpY2UuZ2V0UGFuZWxQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgbmV3VGVybWluYWxMb2NhdGlvbiA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKFRFUk1JTkFMX1ZJRVdfSUQpITtcblx0XHRcdGNvbnN0IHRlcm1pbmFsUG9zaXRpb25DaGFuZ2VkID0gbmV3UGFuZWxQb3NpdGlvbiAhPT0gdGhpcy5fcGFuZWxQb3NpdGlvbiB8fCBuZXdUZXJtaW5hbExvY2F0aW9uICE9PSB0aGlzLl90ZXJtaW5hbExvY2F0aW9uO1xuXHRcdFx0aWYgKHRlcm1pbmFsUG9zaXRpb25DaGFuZ2VkKSB7XG5cdFx0XHRcdGNvbnN0IG5ld09yaWVudGF0aW9uID0gbmV3VGVybWluYWxMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsICYmIGlzSG9yaXpvbnRhbChuZXdQYW5lbFBvc2l0aW9uKSA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHRcdFx0dGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyLnNldE9yaWVudGF0aW9uKG5ld09yaWVudGF0aW9uKTtcblx0XHRcdFx0dGhpcy5fcGFuZWxQb3NpdGlvbiA9IG5ld1BhbmVsUG9zaXRpb247XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsTG9jYXRpb24gPSBuZXdUZXJtaW5hbExvY2F0aW9uO1xuXHRcdFx0XHR0aGlzLl9vblBhbmVsT3JpZW50YXRpb25DaGFuZ2VkLmZpcmUodGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyLm9yaWVudGF0aW9uKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lci5sYXlvdXQod2lkdGgsIGhlaWdodCk7XG5cdFx0XHRpZiAodGhpcy5faW5pdGlhbFJlbGF0aXZlU2l6ZXMgJiYgdGhpcy5fdmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnJlc2l6ZVBhbmVzKHRoaXMuX2luaXRpYWxSZWxhdGl2ZVNpemVzKTtcblx0XHRcdFx0dGhpcy5faW5pdGlhbFJlbGF0aXZlU2l6ZXMgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNQcmV2aW91c1BhbmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3SW5kZXggPSB0aGlzLl9hY3RpdmVJbnN0YW5jZUluZGV4ID09PSAwID8gdGhpcy5fdGVybWluYWxJbnN0YW5jZXMubGVuZ3RoIC0gMSA6IHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXggLSAxO1xuXHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2VCeUluZGV4KG5ld0luZGV4KTtcblx0fVxuXG5cdGZvY3VzTmV4dFBhbmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3SW5kZXggPSB0aGlzLl9hY3RpdmVJbnN0YW5jZUluZGV4ID09PSB0aGlzLl90ZXJtaW5hbEluc3RhbmNlcy5sZW5ndGggLSAxID8gMCA6IHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXggKyAxO1xuXHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2VCeUluZGV4KG5ld0luZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcblx0XHRzd2l0Y2ggKHRoaXMuX3Rlcm1pbmFsTG9jYXRpb24pIHtcblx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcGFuZWxQb3NpdGlvbjtcblx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXI6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9sYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpO1xuXHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fbGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKSA9PT0gUG9zaXRpb24uTEVGVCA/IFBvc2l0aW9uLlJJR0hUIDogUG9zaXRpb24uTEVGVDtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9wYW5lbFBvc2l0aW9uO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldE9yaWVudGF0aW9uKCk6IE9yaWVudGF0aW9uIHtcblx0XHRyZXR1cm4gaXNIb3Jpem9udGFsKHRoaXMuX2dldFBvc2l0aW9uKCkpID8gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA6IE9yaWVudGF0aW9uLlZFUlRJQ0FMO1xuXHR9XG5cblx0cmVzaXplUGFuZShkaXJlY3Rpb246IERpcmVjdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc3BsaXRQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNIb3Jpem9udGFsUmVzaXplID0gKGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLkxlZnQgfHwgZGlyZWN0aW9uID09PSBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgZ3JvdXBPcmllbnRhdGlvbiA9IHRoaXMuX2dldE9yaWVudGF0aW9uKCk7XG5cblx0XHRjb25zdCBzaG91bGRSZXNpemVQYXJ0ID1cblx0XHRcdChpc0hvcml6b250YWxSZXNpemUgJiYgZ3JvdXBPcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwpIHx8XG5cdFx0XHQoIWlzSG9yaXpvbnRhbFJlc2l6ZSAmJiBncm91cE9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMKTtcblxuXHRcdGNvbnN0IGZvbnQgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEZvbnQoZ2V0V2luZG93KHRoaXMuX2dyb3VwRWxlbWVudCkpO1xuXHRcdC8vIFRPRE86IFN1cHBvcnQgbGV0dGVyIHNwYWNpbmcgYW5kIGxpbmUgaGVpZ2h0XG5cdFx0Y29uc3QgY2hhclNpemUgPSAoaXNIb3Jpem9udGFsUmVzaXplID8gZm9udC5jaGFyV2lkdGggOiBmb250LmNoYXJIZWlnaHQpO1xuXG5cdFx0aWYgKGNoYXJTaXplKSB7XG5cdFx0XHRsZXQgcmVzaXplQW1vdW50ID0gY2hhclNpemUgKiBDb25zdGFudHMuUmVzaXplUGFydENlbGxDb3VudDtcblxuXHRcdFx0aWYgKHNob3VsZFJlc2l6ZVBhcnQpIHtcblxuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2dldFBvc2l0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IHNob3VsZFNocmluayA9XG5cdFx0XHRcdFx0KHBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUICYmIGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLkxlZnQpIHx8XG5cdFx0XHRcdFx0KHBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVCAmJiBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5SaWdodCkgfHxcblx0XHRcdFx0XHQocG9zaXRpb24gPT09IFBvc2l0aW9uLkJPVFRPTSAmJiBkaXJlY3Rpb24gPT09IERpcmVjdGlvbi5Eb3duKSB8fFxuXHRcdFx0XHRcdChwb3NpdGlvbiA9PT0gUG9zaXRpb24uVE9QICYmIGRpcmVjdGlvbiA9PT0gRGlyZWN0aW9uLlVwKTtcblxuXHRcdFx0XHRpZiAoc2hvdWxkU2hyaW5rKSB7XG5cdFx0XHRcdFx0cmVzaXplQW1vdW50ICo9IC0xO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fbGF5b3V0U2VydmljZS5yZXNpemVQYXJ0KHRoaXMuX3BhbmVDb21wb3NpdGVQYXJ0U2VydmljZS5nZXRQYXJ0SWQodGhpcy5fdGVybWluYWxMb2NhdGlvbiksIHJlc2l6ZUFtb3VudCwgcmVzaXplQW1vdW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3NwbGl0UGFuZUNvbnRhaW5lci5yZXNpemVQYW5lKHRoaXMuX2FjdGl2ZUluc3RhbmNlSW5kZXgsIGRpcmVjdGlvbiwgcmVzaXplQW1vdW50KTtcblx0XHRcdH1cblxuXHRcdH1cblx0fVxuXG5cdHJlc2l6ZVBhbmVzKHJlbGF0aXZlU2l6ZXM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zcGxpdFBhbmVDb250YWluZXIpIHtcblx0XHRcdHRoaXMuX2luaXRpYWxSZWxhdGl2ZVNpemVzID0gcmVsYXRpdmVTaXplcztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zcGxpdFBhbmVDb250YWluZXIucmVzaXplUGFuZXMocmVsYXRpdmVTaXplcyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBc0IsWUFBWSxpQkFBaUIsU0FBUyxvQkFBb0I7QUFDaEYsU0FBUyxXQUFXLGFBQW9CLGNBQWM7QUFDdEQsU0FBUyxjQUFjLHlCQUF5QixnQkFBZ0I7QUFDaEUsU0FBUyw2QkFBNkI7QUFDdEMsU0FB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
