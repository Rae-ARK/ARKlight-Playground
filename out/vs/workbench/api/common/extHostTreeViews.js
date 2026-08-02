import { basename } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, dispose } from "../../../base/common/lifecycle.js";
import { NoTreeViewError } from "../../common/views.js";
import { asPromise } from "../../../base/common/async.js";
import * as extHostTypes from "./extHostTypes.js";
import { isUndefinedOrNull, isString } from "../../../base/common/types.js";
import { equals, coalesce, distinct } from "../../../base/common/arrays.js";
import { LogLevel } from "../../../platform/log/common/log.js";
import { MarkdownString, ViewBadge, DataTransfer } from "./extHostTypeConverters.js";
import { isMarkdownString } from "../../../base/common/htmlContent.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { TreeViewsDnDService } from "../../../editor/common/services/treeViewsDnd.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
function toTreeItemLabel(label, extension) {
  if (isString(label)) {
    return { label };
  }
  if (label && typeof label === "object" && label.label) {
    let highlights = void 0;
    if (Array.isArray(label.highlights)) {
      highlights = label.highlights.filter(((highlight) => highlight.length === 2 && typeof highlight[0] === "number" && typeof highlight[1] === "number"));
      highlights = highlights.length ? highlights : void 0;
    }
    if (isString(label.label)) {
      return { label: label.label, highlights };
    } else if (extHostTypes.MarkdownString.isMarkdownString(label.label)) {
      checkProposedApiEnabled(extension, "treeItemMarkdownLabel");
      return { label: MarkdownString.from(label.label), highlights };
    }
  }
  return void 0;
}
class ExtHostTreeViews extends Disposable {
  constructor(_proxy, _commands, _logService) {
    super();
    this._proxy = _proxy;
    this._commands = _commands;
    this._logService = _logService;
    this._treeViews = /* @__PURE__ */ new Map();
    this._treeDragAndDropService = new TreeViewsDnDService();
    function isTreeViewConvertableItem(arg) {
      return arg && arg.$treeViewId && (arg.$treeItemHandle || arg.$selectedTreeItems || arg.$focusedTreeItem);
    }
    _commands.registerArgumentProcessor({
      processArgument: (arg) => {
        if (isTreeViewConvertableItem(arg)) {
          return this._convertArgument(arg);
        } else if (Array.isArray(arg) && arg.length > 0) {
          return arg.map((item) => {
            if (isTreeViewConvertableItem(item)) {
              return this._convertArgument(item);
            }
            return item;
          });
        }
        return arg;
      }
    });
  }
  registerTreeDataProvider(id, treeDataProvider, extension) {
    const treeView = this.createTreeView(id, { treeDataProvider }, extension);
    return { dispose: () => treeView.dispose() };
  }
  createTreeView(viewId, options, extension) {
    if (!options || !options.treeDataProvider) {
      throw new Error("Options with treeDataProvider is mandatory");
    }
    const dropMimeTypes = options.dragAndDropController?.dropMimeTypes ?? [];
    const dragMimeTypes = options.dragAndDropController?.dragMimeTypes ?? [];
    const hasHandleDrag = !!options.dragAndDropController?.handleDrag;
    const hasHandleDrop = !!options.dragAndDropController?.handleDrop;
    const treeView = this._createExtHostTreeView(viewId, options, extension);
    const proxyOptions = { showCollapseAll: !!options.showCollapseAll, canSelectMany: !!options.canSelectMany, dropMimeTypes, dragMimeTypes, hasHandleDrag, hasHandleDrop, manuallyManageCheckboxes: !!options.manageCheckboxStateManually };
    const registerPromise = this._proxy.$registerTreeViewDataProvider(viewId, proxyOptions);
    const view = {
      get onDidCollapseElement() {
        return treeView.onDidCollapseElement;
      },
      get onDidExpandElement() {
        return treeView.onDidExpandElement;
      },
      get selection() {
        return treeView.selectedElements;
      },
      get onDidChangeSelection() {
        return treeView.onDidChangeSelection;
      },
      get activeItem() {
        checkProposedApiEnabled(extension, "treeViewActiveItem");
        return treeView.focusedElement;
      },
      get onDidChangeActiveItem() {
        checkProposedApiEnabled(extension, "treeViewActiveItem");
        return treeView.onDidChangeActiveItem;
      },
      get visible() {
        return treeView.visible;
      },
      get onDidChangeVisibility() {
        return treeView.onDidChangeVisibility;
      },
      get onDidChangeCheckboxState() {
        return treeView.onDidChangeCheckboxState;
      },
      get message() {
        return treeView.message;
      },
      set message(message) {
        if (isMarkdownString(message)) {
          checkProposedApiEnabled(extension, "treeViewMarkdownMessage");
        }
        treeView.message = message;
      },
      get title() {
        return treeView.title;
      },
      set title(title) {
        treeView.title = title;
      },
      get description() {
        return treeView.description;
      },
      set description(description) {
        treeView.description = description;
      },
      get badge() {
        return treeView.badge;
      },
      set badge(badge) {
        if (badge !== void 0 && extHostTypes.ViewBadge.isViewBadge(badge)) {
          treeView.badge = {
            value: Math.floor(Math.abs(badge.value)),
            tooltip: badge.tooltip
          };
        } else if (badge === void 0) {
          treeView.badge = void 0;
        }
      },
      reveal: (element, options2) => {
        return treeView.reveal(element, options2);
      },
      dispose: async () => {
        await registerPromise;
        if (this._treeViews.get(viewId) === treeView) {
          this._treeViews.delete(viewId);
          this._proxy.$disposeTree(viewId);
        }
        treeView.dispose();
      }
    };
    this._register(view);
    return view;
  }
  async $getChildren(treeViewId, treeItemHandles) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      return Promise.reject(new NoTreeViewError(treeViewId));
    }
    if (!treeItemHandles) {
      const children = await treeView.getChildren();
      return children ? [[0, ...children]] : void 0;
    }
    const result = [];
    for (let i = 0; i < treeItemHandles.length; i++) {
      const treeItemHandle = treeItemHandles[i];
      const children = await treeView.getChildren(treeItemHandle);
      if (children) {
        result.push([i, ...children]);
      }
    }
    return result;
  }
  async $handleDrop(destinationViewId, requestId, treeDataTransferDTO, targetItemHandle, token, operationUuid, sourceViewId, sourceTreeItemHandles) {
    const treeView = this._treeViews.get(destinationViewId);
    if (!treeView) {
      return Promise.reject(new NoTreeViewError(destinationViewId));
    }
    const treeDataTransfer = DataTransfer.toDataTransfer(treeDataTransferDTO, async (dataItemIndex) => {
      return (await this._proxy.$resolveDropFileData(destinationViewId, requestId, dataItemIndex)).buffer;
    });
    if (sourceViewId === destinationViewId && sourceTreeItemHandles) {
      await this._addAdditionalTransferItems(treeDataTransfer, treeView, sourceTreeItemHandles, token, operationUuid);
    }
    return treeView.onDrop(treeDataTransfer, targetItemHandle, token);
  }
  async _addAdditionalTransferItems(treeDataTransfer, treeView, sourceTreeItemHandles, token, operationUuid) {
    const existingTransferOperation = this._treeDragAndDropService.removeDragOperationTransfer(operationUuid);
    if (existingTransferOperation) {
      (await existingTransferOperation)?.forEach((value, key) => {
        if (value) {
          treeDataTransfer.set(key, value);
        }
      });
    } else if (operationUuid && treeView.handleDrag) {
      const willDropPromise = treeView.handleDrag(sourceTreeItemHandles, treeDataTransfer, token);
      this._treeDragAndDropService.addDragOperationTransfer(operationUuid, willDropPromise);
      await willDropPromise;
    }
    return treeDataTransfer;
  }
  async $handleDrag(sourceViewId, sourceTreeItemHandles, operationUuid, token) {
    const treeView = this._treeViews.get(sourceViewId);
    if (!treeView) {
      return Promise.reject(new NoTreeViewError(sourceViewId));
    }
    const treeDataTransfer = await this._addAdditionalTransferItems(new extHostTypes.DataTransfer(), treeView, sourceTreeItemHandles, token, operationUuid);
    if (!treeDataTransfer || token.isCancellationRequested) {
      return;
    }
    return DataTransfer.from(treeDataTransfer);
  }
  async $hasResolve(treeViewId) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    return treeView.hasResolve;
  }
  $resolve(treeViewId, treeItemHandle, token) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    return treeView.resolveTreeItem(treeItemHandle, token);
  }
  $setExpanded(treeViewId, treeItemHandle, expanded) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    treeView.setExpanded(treeItemHandle, expanded);
  }
  $setSelectionAndFocus(treeViewId, selectedHandles, focusedHandle) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    treeView.setSelectionAndFocus(selectedHandles, focusedHandle);
  }
  $setVisible(treeViewId, isVisible) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      if (!isVisible) {
        return;
      }
      throw new NoTreeViewError(treeViewId);
    }
    treeView.setVisible(isVisible);
  }
  $changeCheckboxState(treeViewId, checkboxUpdate) {
    const treeView = this._treeViews.get(treeViewId);
    if (!treeView) {
      throw new NoTreeViewError(treeViewId);
    }
    treeView.setCheckboxState(checkboxUpdate);
  }
  _createExtHostTreeView(id, options, extension) {
    const treeView = this._register(new ExtHostTreeView(id, options, this._proxy, this._commands.converter, this._logService, extension));
    this._treeViews.set(id, treeView);
    return treeView;
  }
  _convertArgument(arg) {
    const treeView = this._treeViews.get(arg.$treeViewId);
    const asItemHandle = arg;
    if (treeView && asItemHandle.$treeItemHandle) {
      return treeView.getExtensionElement(asItemHandle.$treeItemHandle);
    }
    const asPaneHandle = arg;
    if (treeView && asPaneHandle.$focusedTreeItem) {
      return treeView.focusedElement;
    }
    return null;
  }
}
const _ExtHostTreeView = class _ExtHostTreeView extends Disposable {
  constructor(_viewId, options, _proxy, _commands, _logService, _extension) {
    super();
    this._viewId = _viewId;
    this._proxy = _proxy;
    this._commands = _commands;
    this._logService = _logService;
    this._extension = _extension;
    this._roots = void 0;
    this._elements = /* @__PURE__ */ new Map();
    this._nodes = /* @__PURE__ */ new Map();
    // Track the latest child-fetch per element so that refresh-triggered cache clears ignore stale results.
    // Without these tokens, an earlier getChildren promise resolving after refresh would re-register handles and hit the duplicate-id guard.
    this._childrenFetchTokens = /* @__PURE__ */ new Map();
    // Global counter for fetch tokens. Using a monotonically increasing counter ensures that even after
    // _childrenFetchTokens.clear() during a root refresh, old in-flight fetches will have requestIds that
    // can never match new fetches (e.g., old fetch has id=5, after clear new fetches get 6, 7, 8...).
    this._globalFetchTokenCounter = 0;
    this._visible = false;
    this._selectedHandles = [];
    this._focusedHandle = void 0;
    this._onDidExpandElement = this._register(new Emitter());
    this.onDidExpandElement = this._onDidExpandElement.event;
    this._onDidCollapseElement = this._register(new Emitter());
    this.onDidCollapseElement = this._onDidCollapseElement.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onDidChangeActiveItem = this._register(new Emitter());
    this.onDidChangeActiveItem = this._onDidChangeActiveItem.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onDidChangeCheckboxState = this._register(new Emitter());
    this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
    this._onDidChangeData = this._register(new Emitter());
    this._refreshPromise = Promise.resolve();
    this._refreshQueue = Promise.resolve();
    this._nodesToClear = /* @__PURE__ */ new Set();
    this._message = "";
    this._title = "";
    this._refreshCancellationSource = new CancellationTokenSource();
    if (_extension.contributes && _extension.contributes.views) {
      for (const location in _extension.contributes.views) {
        for (const view of _extension.contributes.views[location]) {
          if (view.id === _viewId) {
            this._title = view.name;
          }
        }
      }
    }
    this._dataProvider = options.treeDataProvider;
    this._dndController = options.dragAndDropController;
    if (this._dataProvider.onDidChangeTreeData) {
      this._register(this._dataProvider.onDidChangeTreeData((elementOrElements) => {
        if (Array.isArray(elementOrElements) && elementOrElements.length === 0) {
          return;
        }
        this._onDidChangeData.fire({ message: false, element: elementOrElements });
      }));
    }
    let refreshingPromise;
    let promiseCallback;
    const onDidChangeData = Event.debounce(this._onDidChangeData.event, (result, current) => {
      if (!result) {
        result = { message: false, elements: [] };
      }
      if (current.element !== false) {
        if (!refreshingPromise) {
          refreshingPromise = new Promise((c) => promiseCallback = c);
          this._refreshPromise = this._refreshPromise.then(() => refreshingPromise);
        }
        if (Array.isArray(current.element)) {
          result.elements.push(...current.element);
        } else {
          result.elements.push(current.element);
        }
      }
      if (current.message) {
        result.message = true;
      }
      return result;
    }, 200, true);
    this._register(onDidChangeData(({ message, elements }) => {
      if (elements.length) {
        elements = distinct(elements);
        this._refreshQueue = this._refreshQueue.then(() => {
          const _promiseCallback = promiseCallback;
          refreshingPromise = null;
          const childrenToClear = Array.from(this._nodesToClear);
          this._nodesToClear.clear();
          this._debugLogRefresh("start", elements, childrenToClear);
          return this._refresh(elements).then(() => {
            this._debugLogRefresh("done", elements, childrenToClear);
            this._clearNodes(childrenToClear);
            return _promiseCallback();
          }).catch((e) => {
            const message2 = e instanceof Error ? e.message : JSON.stringify(e);
            this._debugLogRefresh("error", elements, childrenToClear);
            this._clearNodes(childrenToClear);
            this._logService.error(`Unable to refresh tree view ${this._viewId}: ${message2}`);
            return _promiseCallback();
          });
        });
      }
      if (message) {
        this._proxy.$setMessage(this._viewId, MarkdownString.fromStrict(this._message) ?? "");
      }
    }));
  }
  get visible() {
    return this._visible;
  }
  get selectedElements() {
    return this._selectedHandles.map((handle) => this.getExtensionElement(handle)).filter((element) => !isUndefinedOrNull(element));
  }
  get focusedElement() {
    return this._focusedHandle ? this.getExtensionElement(this._focusedHandle) : void 0;
  }
  _debugCollectHandles(elements) {
    const changed = [];
    for (const el of elements) {
      if (!el) {
        changed.push("<root>");
        continue;
      }
      const node = this._nodes.get(el);
      if (node) {
        changed.push(node.item.handle);
      }
    }
    const roots = this._roots?.map((r) => r.item.handle) ?? [];
    return { changed, roots };
  }
  _debugLogRefresh(phase, elements, childrenToClear) {
    if (!this._isDebugLogging()) {
      return;
    }
    try {
      const snapshot = this._debugCollectHandles(elements);
      snapshot.clearing = childrenToClear.map((n) => n.item.handle);
      const changedCount = snapshot.changed.length;
      const nodesToClearLen = childrenToClear.length;
      this._logService.debug(`[TreeView:${this._viewId}] refresh ${phase} changed=${changedCount} nodesToClear=${nodesToClearLen} elements.size=${this._elements.size} nodes.size=${this._nodes.size} handles=${JSON.stringify(snapshot)}`);
    } catch {
      this._logService.debug(`[TreeView:${this._viewId}] refresh ${phase} (snapshot failed)`);
    }
  }
  _isDebugLogging() {
    try {
      const level = this._logService.getLevel();
      return level === LogLevel.Debug || level === LogLevel.Trace;
    } catch {
      return false;
    }
  }
  async getChildren(parentHandle) {
    const parentElement = parentHandle ? this.getExtensionElement(parentHandle) : void 0;
    if (parentHandle && !parentElement) {
      this._logService.error(`No tree item with id '${parentHandle}' found.`);
      return Promise.resolve([]);
    }
    let childrenNodes = this._getChildrenNodes(parentHandle);
    if (!childrenNodes) {
      childrenNodes = await this._fetchChildrenNodes(parentElement);
    }
    return childrenNodes ? childrenNodes.map((n) => n.item) : void 0;
  }
  getExtensionElement(treeItemHandle) {
    return this._elements.get(treeItemHandle);
  }
  reveal(element, options) {
    options = options ? options : { select: true, focus: false };
    const select = isUndefinedOrNull(options.select) ? true : options.select;
    const focus = isUndefinedOrNull(options.focus) ? false : options.focus;
    const expand = isUndefinedOrNull(options.expand) ? false : options.expand;
    if (typeof this._dataProvider.getParent !== "function") {
      return Promise.reject(new Error(`Required registered TreeDataProvider to implement 'getParent' method to access 'reveal' method`));
    }
    if (element) {
      return this._refreshPromise.then(() => this._resolveUnknownParentChain(element)).then((parentChain) => this._resolveTreeNode(element, parentChain[parentChain.length - 1]).then((treeNode) => this._proxy.$reveal(this._viewId, { item: treeNode.item, parentChain: parentChain.map((p) => p.item) }, { select, focus, expand })), (error) => this._logService.error(error));
    } else {
      return this._proxy.$reveal(this._viewId, void 0, { select, focus, expand });
    }
  }
  get message() {
    return this._message;
  }
  set message(message) {
    this._message = message;
    this._onDidChangeData.fire({ message: true, element: false });
  }
  get title() {
    return this._title;
  }
  set title(title) {
    this._title = title;
    this._proxy.$setTitle(this._viewId, title, this._description);
  }
  get description() {
    return this._description;
  }
  set description(description) {
    this._description = description;
    this._proxy.$setTitle(this._viewId, this._title, description);
  }
  get badge() {
    return this._badge;
  }
  set badge(badge) {
    if (this._badge?.value === badge?.value && this._badge?.tooltip === badge?.tooltip) {
      return;
    }
    this._badge = ViewBadge.from(badge);
    this._proxy.$setBadge(this._viewId, badge);
  }
  setExpanded(treeItemHandle, expanded) {
    const element = this.getExtensionElement(treeItemHandle);
    if (element) {
      if (expanded) {
        this._onDidExpandElement.fire(Object.freeze({ element }));
      } else {
        this._onDidCollapseElement.fire(Object.freeze({ element }));
      }
    }
  }
  setSelectionAndFocus(selectedHandles, focusedHandle) {
    const changedSelection = !equals(this._selectedHandles, selectedHandles);
    this._selectedHandles = selectedHandles;
    const changedFocus = this._focusedHandle !== focusedHandle;
    this._focusedHandle = focusedHandle;
    if (changedSelection) {
      this._onDidChangeSelection.fire(Object.freeze({ selection: this.selectedElements }));
    }
    if (changedFocus) {
      this._onDidChangeActiveItem.fire(Object.freeze({ activeItem: this.focusedElement }));
    }
  }
  setVisible(visible) {
    if (visible !== this._visible) {
      this._visible = visible;
      this._onDidChangeVisibility.fire(Object.freeze({ visible: this._visible }));
    }
  }
  async setCheckboxState(checkboxUpdates) {
    const items = (await Promise.all(checkboxUpdates.map(async (checkboxUpdate) => {
      const extensionItem = this.getExtensionElement(checkboxUpdate.treeItemHandle);
      if (extensionItem) {
        return {
          extensionItem,
          treeItem: await this._dataProvider.getTreeItem(extensionItem),
          newState: checkboxUpdate.newState ? extHostTypes.TreeItemCheckboxState.Checked : extHostTypes.TreeItemCheckboxState.Unchecked
        };
      }
      return Promise.resolve(void 0);
    }))).filter((item) => item !== void 0);
    items.forEach((item) => {
      item.treeItem.checkboxState = item.newState ? extHostTypes.TreeItemCheckboxState.Checked : extHostTypes.TreeItemCheckboxState.Unchecked;
    });
    this._onDidChangeCheckboxState.fire({ items: items.map((item) => [item.extensionItem, item.newState]) });
  }
  async handleDrag(sourceTreeItemHandles, treeDataTransfer, token) {
    const extensionTreeItems = [];
    for (const sourceHandle of sourceTreeItemHandles) {
      const extensionItem = this.getExtensionElement(sourceHandle);
      if (extensionItem) {
        extensionTreeItems.push(extensionItem);
      }
    }
    if (!this._dndController?.handleDrag || extensionTreeItems.length === 0) {
      return;
    }
    await this._dndController.handleDrag(extensionTreeItems, treeDataTransfer, token);
    return treeDataTransfer;
  }
  get hasHandleDrag() {
    return !!this._dndController?.handleDrag;
  }
  async onDrop(treeDataTransfer, targetHandleOrNode, token) {
    const target = targetHandleOrNode ? this.getExtensionElement(targetHandleOrNode) : void 0;
    if (!target && targetHandleOrNode || !this._dndController?.handleDrop) {
      return;
    }
    return asPromise(() => this._dndController?.handleDrop ? this._dndController.handleDrop(target, treeDataTransfer, token) : void 0);
  }
  get hasResolve() {
    return !!this._dataProvider.resolveTreeItem;
  }
  async resolveTreeItem(treeItemHandle, token) {
    if (!this._dataProvider.resolveTreeItem) {
      return;
    }
    const element = this._elements.get(treeItemHandle);
    if (element) {
      const node = this._nodes.get(element);
      if (node) {
        const resolve = await this._dataProvider.resolveTreeItem(node.extensionItem, element, token) ?? node.extensionItem;
        this._validateTreeItem(resolve);
        node.item.tooltip = this._getTooltip(resolve.tooltip);
        node.item.command = this._getCommand(node.disposableStore, resolve.command);
        return node.item;
      }
    }
    return;
  }
  _resolveUnknownParentChain(element) {
    return this._resolveParent(element).then((parent) => {
      if (!parent) {
        return Promise.resolve([]);
      }
      return this._resolveUnknownParentChain(parent).then((result) => this._resolveTreeNode(parent, result[result.length - 1]).then((parentNode) => {
        result.push(parentNode);
        return result;
      }));
    });
  }
  _resolveParent(element) {
    const node = this._nodes.get(element);
    if (node) {
      return Promise.resolve(node.parent ? this._elements.get(node.parent.item.handle) : void 0);
    }
    return asPromise(() => this._dataProvider.getParent(element));
  }
  async _resolveTreeNode(element, parent) {
    const node = this._nodes.get(element);
    if (node) {
      return node;
    }
    const extTreeItem = await asPromise(() => this._dataProvider.getTreeItem(element));
    const handle = this._createHandle(element, extTreeItem, parent, true);
    await this.getChildren(parent ? parent.item.handle : void 0);
    const cachedElement = this.getExtensionElement(handle);
    if (cachedElement) {
      const node2 = this._nodes.get(cachedElement);
      if (node2) {
        return node2;
      }
    }
    this._logService.error(`[TreeView:${this._viewId}] Failed to resolve tree node for element ${handle}`);
    this._proxy.$logResolveTreeNodeFailure(this._extension.identifier.value);
    throw new Error(`Cannot resolve tree item for element ${handle} from extension ${this._extension.identifier.value}`);
  }
  _getChildrenNodes(parentNodeOrHandle) {
    if (parentNodeOrHandle) {
      let parentNode;
      if (typeof parentNodeOrHandle === "string") {
        const parentElement = this.getExtensionElement(parentNodeOrHandle);
        parentNode = parentElement ? this._nodes.get(parentElement) : void 0;
      } else {
        parentNode = parentNodeOrHandle;
      }
      return parentNode ? parentNode.children || void 0 : void 0;
    }
    return this._roots;
  }
  _getFetchKey(parentElement) {
    return parentElement ?? _ExtHostTreeView.ROOT_FETCH_KEY;
  }
  async _fetchChildrenNodes(parentElement) {
    this._addChildrenToClear(parentElement);
    const fetchKey = this._getFetchKey(parentElement);
    const requestId = ++this._globalFetchTokenCounter;
    this._childrenFetchTokens.set(fetchKey, requestId);
    const cts = new CancellationTokenSource(this._refreshCancellationSource.token);
    try {
      const elements = await this._dataProvider.getChildren(parentElement);
      if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
        return void 0;
      }
      const parentNode = parentElement ? this._nodes.get(parentElement) : void 0;
      if (cts.token.isCancellationRequested) {
        return void 0;
      }
      const coalescedElements = coalesce(elements || []);
      const treeItems = await Promise.all(coalesce(coalescedElements).map((element) => {
        return this._dataProvider.getTreeItem(element);
      }));
      if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
        return void 0;
      }
      if (cts.token.isCancellationRequested) {
        return void 0;
      }
      const items = treeItems.map((item, index) => item ? this._createAndRegisterTreeNode(coalescedElements[index], item, parentNode) : null);
      if (this._childrenFetchTokens.get(fetchKey) !== requestId) {
        return void 0;
      }
      return coalesce(items);
    } finally {
      cts.dispose();
    }
  }
  _refresh(elements) {
    const hasRoot = elements.some((element) => !element);
    if (hasRoot) {
      this._refreshCancellationSource.dispose(true);
      this._refreshCancellationSource = new CancellationTokenSource();
      this._addChildrenToClear();
      return this._proxy.$refresh(this._viewId);
    } else {
      const handlesToRefresh = this._getHandlesToRefresh(elements);
      if (handlesToRefresh.length) {
        return this._refreshHandles(handlesToRefresh);
      }
    }
    return Promise.resolve(void 0);
  }
  _getHandlesToRefresh(elements) {
    const elementsToUpdate = /* @__PURE__ */ new Set();
    const elementNodes = elements.map((element) => this._nodes.get(element));
    for (const elementNode of elementNodes) {
      if (elementNode && !elementsToUpdate.has(elementNode.item.handle)) {
        let currentNode = elementNode;
        while (currentNode && currentNode.parent && elementNodes.findIndex((node) => currentNode && currentNode.parent && node && node.item.handle === currentNode.parent.item.handle) === -1) {
          const parentElement = this._elements.get(currentNode.parent.item.handle);
          currentNode = parentElement ? this._nodes.get(parentElement) : void 0;
        }
        if (currentNode && !currentNode.parent) {
          elementsToUpdate.add(elementNode.item.handle);
        }
      }
    }
    const handlesToUpdate = [];
    elementsToUpdate.forEach((handle) => {
      const element = this._elements.get(handle);
      if (element) {
        const node = this._nodes.get(element);
        if (node && (!node.parent || !elementsToUpdate.has(node.parent.item.handle))) {
          handlesToUpdate.push(handle);
        }
      }
    });
    return handlesToUpdate;
  }
  _refreshHandles(itemHandles) {
    const itemsToRefresh = {};
    return Promise.all(itemHandles.map((treeItemHandle) => this._refreshNode(treeItemHandle).then((node) => {
      if (node) {
        itemsToRefresh[treeItemHandle] = node.item;
      }
    }))).then(() => Object.keys(itemsToRefresh).length ? this._proxy.$refresh(this._viewId, itemsToRefresh) : void 0);
  }
  _refreshNode(treeItemHandle) {
    const extElement = this.getExtensionElement(treeItemHandle);
    if (extElement) {
      const existing = this._nodes.get(extElement);
      if (existing) {
        this._addChildrenToClear(extElement);
        return asPromise(() => this._dataProvider.getTreeItem(extElement)).then((extTreeItem) => {
          if (extTreeItem) {
            const newNode = this._createTreeNode(extElement, extTreeItem, existing.parent);
            this._updateNodeCache(extElement, newNode, existing, existing.parent);
            existing.dispose();
            return newNode;
          }
          return null;
        });
      }
    }
    return Promise.resolve(null);
  }
  _createAndRegisterTreeNode(element, extTreeItem, parentNode) {
    const duplicateHandle = extTreeItem.id ? `${_ExtHostTreeView.ID_HANDLE_PREFIX}/${extTreeItem.id}` : void 0;
    if (duplicateHandle) {
      const existingElement = this._elements.get(duplicateHandle);
      if (existingElement) {
        const existingNode = this._nodes.get(existingElement);
        if (existingElement !== element) {
          this._nodes.delete(existingElement);
        }
        if (existingNode) {
          const newNode = this._createTreeNode(element, extTreeItem, parentNode);
          this._updateNodeCache(element, newNode, existingNode, parentNode);
          existingNode.dispose();
          return newNode;
        }
      }
    }
    const node = this._createTreeNode(element, extTreeItem, parentNode);
    this._addNodeToCache(element, node);
    this._addNodeToParentCache(node, parentNode);
    return node;
  }
  _getTooltip(tooltip) {
    if (extHostTypes.MarkdownString.isMarkdownString(tooltip)) {
      return MarkdownString.from(tooltip);
    }
    return tooltip;
  }
  _getCommand(disposable, command) {
    return command ? { ...this._commands.toInternal(command, disposable), originalId: command.command } : void 0;
  }
  _getCheckbox(extensionTreeItem) {
    if (extensionTreeItem.checkboxState === void 0) {
      return void 0;
    }
    let checkboxState;
    let tooltip = void 0;
    let accessibilityInformation = void 0;
    if (typeof extensionTreeItem.checkboxState === "number") {
      checkboxState = extensionTreeItem.checkboxState;
    } else {
      checkboxState = extensionTreeItem.checkboxState.state;
      tooltip = extensionTreeItem.checkboxState.tooltip;
      accessibilityInformation = extensionTreeItem.checkboxState.accessibilityInformation;
    }
    return { isChecked: checkboxState === extHostTypes.TreeItemCheckboxState.Checked, tooltip, accessibilityInformation };
  }
  _validateTreeItem(extensionTreeItem) {
    if (!extHostTypes.TreeItem.isTreeItem(extensionTreeItem, this._extension)) {
      throw new Error(`Extension ${this._extension.identifier.value} has provided an invalid tree item.`);
    }
  }
  _createTreeNode(element, extensionTreeItem, parent) {
    this._validateTreeItem(extensionTreeItem);
    const disposableStore = this._register(new DisposableStore());
    const handle = this._createHandle(element, extensionTreeItem, parent);
    const icon = this._getLightIconPath(extensionTreeItem);
    const item = {
      handle,
      parentHandle: parent ? parent.item.handle : void 0,
      label: toTreeItemLabel(extensionTreeItem.label, this._extension),
      description: extensionTreeItem.description,
      resourceUri: extensionTreeItem.resourceUri,
      tooltip: this._getTooltip(extensionTreeItem.tooltip),
      command: this._getCommand(disposableStore, extensionTreeItem.command),
      contextValue: extensionTreeItem.contextValue,
      icon,
      iconDark: this._getDarkIconPath(extensionTreeItem) || icon,
      themeIcon: this._getThemeIcon(extensionTreeItem),
      collapsibleState: isUndefinedOrNull(extensionTreeItem.collapsibleState) ? extHostTypes.TreeItemCollapsibleState.None : extensionTreeItem.collapsibleState,
      accessibilityInformation: extensionTreeItem.accessibilityInformation,
      checkbox: this._getCheckbox(extensionTreeItem)
    };
    return {
      item,
      extensionItem: extensionTreeItem,
      parent,
      children: void 0,
      disposableStore,
      dispose() {
        disposableStore.dispose();
      }
    };
  }
  _getThemeIcon(extensionTreeItem) {
    return extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon ? extensionTreeItem.iconPath : void 0;
  }
  _createHandle(element, { id, label, resourceUri }, parent, returnFirst) {
    if (id) {
      return `${_ExtHostTreeView.ID_HANDLE_PREFIX}/${id}`;
    }
    const treeItemLabel = toTreeItemLabel(label, this._extension);
    const prefix = parent ? parent.item.handle : _ExtHostTreeView.LABEL_HANDLE_PREFIX;
    let labelValue = "";
    if (treeItemLabel) {
      if (isMarkdownString(treeItemLabel.label)) {
        labelValue = treeItemLabel.label.value;
      } else {
        labelValue = treeItemLabel.label;
      }
    }
    let elementId = labelValue || (resourceUri ? basename(resourceUri) : "");
    elementId = elementId.indexOf("/") !== -1 ? elementId.replace("/", "//") : elementId;
    const existingHandle = this._nodes.has(element) ? this._nodes.get(element).item.handle : void 0;
    const childrenNodes = this._getChildrenNodes(parent) || [];
    let handle;
    let counter = 0;
    do {
      handle = `${prefix}/${counter}:${elementId}`;
      if (returnFirst || !this._elements.has(handle) || existingHandle === handle) {
        break;
      }
      counter++;
    } while (counter <= childrenNodes.length);
    return handle;
  }
  _getLightIconPath(extensionTreeItem) {
    if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon)) {
      if (typeof extensionTreeItem.iconPath === "string" || URI.isUri(extensionTreeItem.iconPath)) {
        return this._getIconPath(extensionTreeItem.iconPath);
      }
      return this._getIconPath(extensionTreeItem.iconPath.light);
    }
    return void 0;
  }
  _getDarkIconPath(extensionTreeItem) {
    if (extensionTreeItem.iconPath && !(extensionTreeItem.iconPath instanceof extHostTypes.ThemeIcon) && extensionTreeItem.iconPath.dark) {
      return this._getIconPath(extensionTreeItem.iconPath.dark);
    }
    return void 0;
  }
  _getIconPath(iconPath) {
    if (URI.isUri(iconPath)) {
      return iconPath;
    }
    return URI.file(iconPath);
  }
  _addNodeToCache(element, node) {
    this._elements.set(node.item.handle, element);
    this._nodes.set(element, node);
  }
  _updateNodeCache(element, newNode, existing, parentNode) {
    this._elements.delete(newNode.item.handle);
    this._nodes.delete(element);
    if (newNode.item.handle !== existing.item.handle) {
      this._elements.delete(existing.item.handle);
    }
    this._addNodeToCache(element, newNode);
    const childrenNodes = this._getChildrenNodes(parentNode) || [];
    const childNode = childrenNodes.filter((c) => c.item.handle === existing.item.handle)[0];
    if (childNode) {
      childrenNodes.splice(childrenNodes.indexOf(childNode), 1, newNode);
    }
  }
  _addNodeToParentCache(node, parentNode) {
    if (parentNode) {
      if (!parentNode.children) {
        parentNode.children = [];
      }
      parentNode.children.push(node);
    } else {
      if (!this._roots) {
        this._roots = [];
      }
      this._roots.push(node);
    }
  }
  _addChildrenToClear(parentElement) {
    if (parentElement) {
      const node = this._nodes.get(parentElement);
      if (node) {
        if (node.children) {
          for (const child of node.children) {
            this._nodesToClear.add(child);
            const childElement = this._elements.get(child.item.handle);
            if (childElement) {
              this._addChildrenToClear(childElement);
              this._nodes.delete(childElement);
              this._elements.delete(child.item.handle);
            }
          }
        }
        node.children = void 0;
      }
    } else {
      this._addAllToClear();
    }
  }
  _addAllToClear() {
    this._roots = void 0;
    this._nodes.forEach((node) => {
      this._nodesToClear.add(node);
    });
    this._nodes.clear();
    this._elements.clear();
    this._childrenFetchTokens.clear();
  }
  _clearNodes(nodes) {
    dispose(nodes);
  }
  _clearAll() {
    this._roots = void 0;
    this._elements.clear();
    dispose(this._nodes.values());
    this._nodes.clear();
    dispose(this._nodesToClear);
    this._nodesToClear.clear();
    this._childrenFetchTokens.clear();
  }
  dispose() {
    super.dispose();
    this._refreshCancellationSource.dispose();
    this._clearAll();
  }
};
_ExtHostTreeView.LABEL_HANDLE_PREFIX = "0";
_ExtHostTreeView.ID_HANDLE_PREFIX = "1";
_ExtHostTreeView.ROOT_FETCH_KEY = /* @__PURE__ */ Symbol("extHostTreeViewRoot");
let ExtHostTreeView = _ExtHostTreeView;
export {
  ExtHostTreeViews
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUcmVlVmlld3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDaGVja2JveFVwZGF0ZSwgRGF0YVRyYW5zZmVyRFRPLCBFeHRIb3N0VHJlZVZpZXdzU2hhcGUsIE1haW5UaHJlYWRUcmVlVmlld3NTaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJVHJlZUl0ZW0sIFRyZWVWaWV3SXRlbUhhbmRsZUFyZywgSVRyZWVJdGVtTGFiZWwsIElSZXZlYWxPcHRpb25zLCBUcmVlQ29tbWFuZCwgVHJlZVZpZXdQYW5lSGFuZGxlQXJnLCBJVHJlZUl0ZW1DaGVja2JveFN0YXRlLCBOb1RyZWVWaWV3RXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbW1hbmRzLCBDb21tYW5kc0NvbnZlcnRlciB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IGFzUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZE9yTnVsbCwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMsIGNvYWxlc2NlLCBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nLCBWaWV3QmFkZ2UsIERhdGFUcmFuc2ZlciB9IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVHJlZVZpZXdzRG5EU2VydmljZSwgVHJlZVZpZXdzRG5EU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVZpZXdzRG5kLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbnR5cGUgVHJlZUl0ZW1IYW5kbGUgPSBzdHJpbmc7XG5cbmZ1bmN0aW9uIHRvVHJlZUl0ZW1MYWJlbChsYWJlbDogYW55LCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IElUcmVlSXRlbUxhYmVsIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzU3RyaW5nKGxhYmVsKSkge1xuXHRcdHJldHVybiB7IGxhYmVsIH07XG5cdH1cblxuXHRpZiAobGFiZWwgJiYgdHlwZW9mIGxhYmVsID09PSAnb2JqZWN0JyAmJiBsYWJlbC5sYWJlbCkge1xuXHRcdGxldCBoaWdobGlnaHRzOiBbbnVtYmVyLCBudW1iZXJdW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkobGFiZWwuaGlnaGxpZ2h0cykpIHtcblx0XHRcdGhpZ2hsaWdodHMgPSAoPFtudW1iZXIsIG51bWJlcl1bXT5sYWJlbC5oaWdobGlnaHRzKS5maWx0ZXIoKGhpZ2hsaWdodCA9PiBoaWdobGlnaHQubGVuZ3RoID09PSAyICYmIHR5cGVvZiBoaWdobGlnaHRbMF0gPT09ICdudW1iZXInICYmIHR5cGVvZiBoaWdobGlnaHRbMV0gPT09ICdudW1iZXInKSk7XG5cdFx0XHRoaWdobGlnaHRzID0gaGlnaGxpZ2h0cy5sZW5ndGggPyBoaWdobGlnaHRzIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoaXNTdHJpbmcobGFiZWwubGFiZWwpKSB7XG5cdFx0XHRyZXR1cm4geyBsYWJlbDogbGFiZWwubGFiZWwsIGhpZ2hsaWdodHMgfTtcblx0XHR9IGVsc2UgaWYgKGV4dEhvc3RUeXBlcy5NYXJrZG93blN0cmluZy5pc01hcmtkb3duU3RyaW5nKGxhYmVsLmxhYmVsKSkge1xuXHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndHJlZUl0ZW1NYXJrZG93bkxhYmVsJyk7XG5cdFx0XHRyZXR1cm4geyBsYWJlbDogTWFya2Rvd25TdHJpbmcuZnJvbShsYWJlbC5sYWJlbCksIGhpZ2hsaWdodHMgfTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0VHJlZVZpZXdzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIEV4dEhvc3RUcmVlVmlld3NTaGFwZSB7XG5cblx0cHJpdmF0ZSBfdHJlZVZpZXdzOiBNYXA8c3RyaW5nLCBFeHRIb3N0VHJlZVZpZXc8YW55Pj4gPSBuZXcgTWFwPHN0cmluZywgRXh0SG9zdFRyZWVWaWV3PGFueT4+KCk7XG5cdHByaXZhdGUgX3RyZWVEcmFnQW5kRHJvcFNlcnZpY2U6IElUcmVlVmlld3NEbkRTZXJ2aWNlPHZzY29kZS5EYXRhVHJhbnNmZXI+ID0gbmV3IFRyZWVWaWV3c0RuRFNlcnZpY2U8dnNjb2RlLkRhdGFUcmFuc2Zlcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9wcm94eTogTWFpblRocmVhZFRyZWVWaWV3c1NoYXBlLFxuXHRcdHByaXZhdGUgX2NvbW1hbmRzOiBFeHRIb3N0Q29tbWFuZHMsXG5cdFx0cHJpdmF0ZSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRmdW5jdGlvbiBpc1RyZWVWaWV3Q29udmVydGFibGVJdGVtKGFyZzogYW55KTogYm9vbGVhbiB7XG5cdFx0XHRyZXR1cm4gYXJnICYmIGFyZy4kdHJlZVZpZXdJZCAmJiAoYXJnLiR0cmVlSXRlbUhhbmRsZSB8fCBhcmcuJHNlbGVjdGVkVHJlZUl0ZW1zIHx8IGFyZy4kZm9jdXNlZFRyZWVJdGVtKTtcblx0XHR9XG5cdFx0X2NvbW1hbmRzLnJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3Ioe1xuXHRcdFx0cHJvY2Vzc0FyZ3VtZW50OiBhcmcgPT4ge1xuXHRcdFx0XHRpZiAoaXNUcmVlVmlld0NvbnZlcnRhYmxlSXRlbShhcmcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NvbnZlcnRBcmd1bWVudChhcmcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoYXJnKSAmJiAoYXJnLmxlbmd0aCA+IDApKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGFyZy5tYXAoaXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNUcmVlVmlld0NvbnZlcnRhYmxlSXRlbShpdGVtKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY29udmVydEFyZ3VtZW50KGl0ZW0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFyZztcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJlZ2lzdGVyVHJlZURhdGFQcm92aWRlcjxUPihpZDogc3RyaW5nLCB0cmVlRGF0YVByb3ZpZGVyOiB2c2NvZGUuVHJlZURhdGFQcm92aWRlcjxUPiwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLmNyZWF0ZVRyZWVWaWV3KGlkLCB7IHRyZWVEYXRhUHJvdmlkZXIgfSwgZXh0ZW5zaW9uKTtcblx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB0cmVlVmlldy5kaXNwb3NlKCkgfTtcblx0fVxuXG5cdGNyZWF0ZVRyZWVWaWV3PFQ+KHZpZXdJZDogc3RyaW5nLCBvcHRpb25zOiB2c2NvZGUuVHJlZVZpZXdPcHRpb25zPFQ+LCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IHZzY29kZS5UcmVlVmlldzxUPiB7XG5cdFx0aWYgKCFvcHRpb25zIHx8ICFvcHRpb25zLnRyZWVEYXRhUHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignT3B0aW9ucyB3aXRoIHRyZWVEYXRhUHJvdmlkZXIgaXMgbWFuZGF0b3J5Jyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRyb3BNaW1lVHlwZXMgPSBvcHRpb25zLmRyYWdBbmREcm9wQ29udHJvbGxlcj8uZHJvcE1pbWVUeXBlcyA/PyBbXTtcblx0XHRjb25zdCBkcmFnTWltZVR5cGVzID0gb3B0aW9ucy5kcmFnQW5kRHJvcENvbnRyb2xsZXI/LmRyYWdNaW1lVHlwZXMgPz8gW107XG5cdFx0Y29uc3QgaGFzSGFuZGxlRHJhZyA9ICEhb3B0aW9ucy5kcmFnQW5kRHJvcENvbnRyb2xsZXI/LmhhbmRsZURyYWc7XG5cdFx0Y29uc3QgaGFzSGFuZGxlRHJvcCA9ICEhb3B0aW9ucy5kcmFnQW5kRHJvcENvbnRyb2xsZXI/LmhhbmRsZURyb3A7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl9jcmVhdGVFeHRIb3N0VHJlZVZpZXcodmlld0lkLCBvcHRpb25zLCBleHRlbnNpb24pO1xuXHRcdGNvbnN0IHByb3h5T3B0aW9ucyA9IHsgc2hvd0NvbGxhcHNlQWxsOiAhIW9wdGlvbnMuc2hvd0NvbGxhcHNlQWxsLCBjYW5TZWxlY3RNYW55OiAhIW9wdGlvbnMuY2FuU2VsZWN0TWFueSwgZHJvcE1pbWVUeXBlcywgZHJhZ01pbWVUeXBlcywgaGFzSGFuZGxlRHJhZywgaGFzSGFuZGxlRHJvcCwgbWFudWFsbHlNYW5hZ2VDaGVja2JveGVzOiAhIW9wdGlvbnMubWFuYWdlQ2hlY2tib3hTdGF0ZU1hbnVhbGx5IH07XG5cdFx0Y29uc3QgcmVnaXN0ZXJQcm9taXNlID0gdGhpcy5fcHJveHkuJHJlZ2lzdGVyVHJlZVZpZXdEYXRhUHJvdmlkZXIodmlld0lkLCBwcm94eU9wdGlvbnMpO1xuXHRcdGNvbnN0IHZpZXcgPSB7XG5cdFx0XHRnZXQgb25EaWRDb2xsYXBzZUVsZW1lbnQoKSB7IHJldHVybiB0cmVlVmlldy5vbkRpZENvbGxhcHNlRWxlbWVudDsgfSxcblx0XHRcdGdldCBvbkRpZEV4cGFuZEVsZW1lbnQoKSB7IHJldHVybiB0cmVlVmlldy5vbkRpZEV4cGFuZEVsZW1lbnQ7IH0sXG5cdFx0XHRnZXQgc2VsZWN0aW9uKCkgeyByZXR1cm4gdHJlZVZpZXcuc2VsZWN0ZWRFbGVtZW50czsgfSxcblx0XHRcdGdldCBvbkRpZENoYW5nZVNlbGVjdGlvbigpIHsgcmV0dXJuIHRyZWVWaWV3Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uOyB9LFxuXHRcdFx0Z2V0IGFjdGl2ZUl0ZW0oKSB7XG5cdFx0XHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ3RyZWVWaWV3QWN0aXZlSXRlbScpO1xuXHRcdFx0XHRyZXR1cm4gdHJlZVZpZXcuZm9jdXNlZEVsZW1lbnQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlQWN0aXZlSXRlbSgpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndHJlZVZpZXdBY3RpdmVJdGVtJyk7XG5cdFx0XHRcdHJldHVybiB0cmVlVmlldy5vbkRpZENoYW5nZUFjdGl2ZUl0ZW07XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHZpc2libGUoKSB7IHJldHVybiB0cmVlVmlldy52aXNpYmxlOyB9LFxuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSgpIHsgcmV0dXJuIHRyZWVWaWV3Lm9uRGlkQ2hhbmdlVmlzaWJpbGl0eTsgfSxcblx0XHRcdGdldCBvbkRpZENoYW5nZUNoZWNrYm94U3RhdGUoKSB7XG5cdFx0XHRcdHJldHVybiB0cmVlVmlldy5vbkRpZENoYW5nZUNoZWNrYm94U3RhdGU7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IG1lc3NhZ2UoKSB7IHJldHVybiB0cmVlVmlldy5tZXNzYWdlOyB9LFxuXHRcdFx0c2V0IG1lc3NhZ2UobWVzc2FnZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nKSB7XG5cdFx0XHRcdGlmIChpc01hcmtkb3duU3RyaW5nKG1lc3NhZ2UpKSB7XG5cdFx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAndHJlZVZpZXdNYXJrZG93bk1lc3NhZ2UnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cmVlVmlldy5tZXNzYWdlID0gbWVzc2FnZTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdGl0bGUoKSB7IHJldHVybiB0cmVlVmlldy50aXRsZTsgfSxcblx0XHRcdHNldCB0aXRsZSh0aXRsZTogc3RyaW5nKSB7XG5cdFx0XHRcdHRyZWVWaWV3LnRpdGxlID0gdGl0bGU7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGRlc2NyaXB0aW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gdHJlZVZpZXcuZGVzY3JpcHRpb247XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGRlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0dHJlZVZpZXcuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbjtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYmFkZ2UoKSB7XG5cdFx0XHRcdHJldHVybiB0cmVlVmlldy5iYWRnZTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgYmFkZ2UoYmFkZ2U6IHZzY29kZS5WaWV3QmFkZ2UgfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKChiYWRnZSAhPT0gdW5kZWZpbmVkKSAmJiBleHRIb3N0VHlwZXMuVmlld0JhZGdlLmlzVmlld0JhZGdlKGJhZGdlKSkge1xuXHRcdFx0XHRcdHRyZWVWaWV3LmJhZGdlID0ge1xuXHRcdFx0XHRcdFx0dmFsdWU6IE1hdGguZmxvb3IoTWF0aC5hYnMoYmFkZ2UudmFsdWUpKSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGJhZGdlLnRvb2x0aXBcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJhZGdlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0cmVlVmlldy5iYWRnZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHJldmVhbDogKGVsZW1lbnQ6IFQsIG9wdGlvbnM/OiBJUmV2ZWFsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdHJlZVZpZXcucmV2ZWFsKGVsZW1lbnQsIG9wdGlvbnMpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHJlZ2lzdHJhdGlvbiBwcm9taXNlIHRvIGZpbmlzaCBiZWZvcmUgZG9pbmcgdGhlIGRpc3Bvc2UuXG5cdFx0XHRcdGF3YWl0IHJlZ2lzdGVyUHJvbWlzZTtcblx0XHRcdFx0Ly8gT25seSBub3RpZnkgdGhlIG1haW4gdGhyZWFkIGlmIHRoaXMgdmlldyB3YXMgbm90IHJlcGxhY2VkIGJ5IGEgbmV3IHJlZ2lzdHJhdGlvbi5cblx0XHRcdFx0Ly8gV2hlbiBhbiBleHRlbnNpb24gZGlzcG9zZXMgYSB2aWV3IGFuZCBpbW1lZGlhdGVseSByZS1yZWdpc3RlcnMgaXQsIHRoZSBuZXdcblx0XHRcdFx0Ly8gcmVnaXN0cmF0aW9uIG1heSBoYXZlIGFscmVhZHkgdXBkYXRlZCBfdHJlZVZpZXdzIGJlZm9yZSB0aGlzIGFzeW5jIGRpc3Bvc2UgcnVucy5cblx0XHRcdFx0aWYgKHRoaXMuX3RyZWVWaWV3cy5nZXQodmlld0lkKSA9PT0gdHJlZVZpZXcpIHtcblx0XHRcdFx0XHR0aGlzLl90cmVlVmlld3MuZGVsZXRlKHZpZXdJZCk7XG5cdFx0XHRcdFx0dGhpcy5fcHJveHkuJGRpc3Bvc2VUcmVlKHZpZXdJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dHJlZVZpZXcuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlldyk7XG5cdFx0cmV0dXJuIHZpZXcgYXMgdnNjb2RlLlRyZWVWaWV3PFQ+O1xuXHR9XG5cblx0YXN5bmMgJGdldENoaWxkcmVuKHRyZWVWaWV3SWQ6IHN0cmluZywgdHJlZUl0ZW1IYW5kbGVzPzogc3RyaW5nW10pOiBQcm9taXNlPChyZWFkb25seSAobnVtYmVyIHwgSVRyZWVJdGVtKVtdKVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl90cmVlVmlld3MuZ2V0KHRyZWVWaWV3SWQpO1xuXHRcdGlmICghdHJlZVZpZXcpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgTm9UcmVlVmlld0Vycm9yKHRyZWVWaWV3SWQpKTtcblx0XHR9XG5cdFx0aWYgKCF0cmVlSXRlbUhhbmRsZXMpIHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgdHJlZVZpZXcuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdHJldHVybiBjaGlsZHJlbiA/IFtbMCwgLi4uY2hpbGRyZW5dXSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gS2VlcCBvcmRlciBvZiB0cmVlSXRlbUhhbmRsZXMgaW4gY2FzZSBleHRlbnNpb24gdHJlZXMgYWxyZWFkeSBkZXBlbmQgb24gdGhpc1xuXHRcdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdHJlZUl0ZW1IYW5kbGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0cmVlSXRlbUhhbmRsZSA9IHRyZWVJdGVtSGFuZGxlc1tpXTtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gYXdhaXQgdHJlZVZpZXcuZ2V0Q2hpbGRyZW4odHJlZUl0ZW1IYW5kbGUpO1xuXHRcdFx0aWYgKGNoaWxkcmVuKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKFtpLCAuLi5jaGlsZHJlbl0pO1xuXHRcdFx0fVxuXG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyAkaGFuZGxlRHJvcChkZXN0aW5hdGlvblZpZXdJZDogc3RyaW5nLCByZXF1ZXN0SWQ6IG51bWJlciwgdHJlZURhdGFUcmFuc2ZlckRUTzogRGF0YVRyYW5zZmVyRFRPLCB0YXJnZXRJdGVtSGFuZGxlOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0XHRvcGVyYXRpb25VdWlkPzogc3RyaW5nLCBzb3VyY2VWaWV3SWQ/OiBzdHJpbmcsIHNvdXJjZVRyZWVJdGVtSGFuZGxlcz86IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl90cmVlVmlld3MuZ2V0KGRlc3RpbmF0aW9uVmlld0lkKTtcblx0XHRpZiAoIXRyZWVWaWV3KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IE5vVHJlZVZpZXdFcnJvcihkZXN0aW5hdGlvblZpZXdJZCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyZWVEYXRhVHJhbnNmZXIgPSBEYXRhVHJhbnNmZXIudG9EYXRhVHJhbnNmZXIodHJlZURhdGFUcmFuc2ZlckRUTywgYXN5bmMgZGF0YUl0ZW1JbmRleCA9PiB7XG5cdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlRHJvcEZpbGVEYXRhKGRlc3RpbmF0aW9uVmlld0lkLCByZXF1ZXN0SWQsIGRhdGFJdGVtSW5kZXgpKS5idWZmZXI7XG5cdFx0fSk7XG5cdFx0aWYgKChzb3VyY2VWaWV3SWQgPT09IGRlc3RpbmF0aW9uVmlld0lkKSAmJiBzb3VyY2VUcmVlSXRlbUhhbmRsZXMpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2FkZEFkZGl0aW9uYWxUcmFuc2Zlckl0ZW1zKHRyZWVEYXRhVHJhbnNmZXIsIHRyZWVWaWV3LCBzb3VyY2VUcmVlSXRlbUhhbmRsZXMsIHRva2VuLCBvcGVyYXRpb25VdWlkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRyZWVWaWV3Lm9uRHJvcCh0cmVlRGF0YVRyYW5zZmVyLCB0YXJnZXRJdGVtSGFuZGxlLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hZGRBZGRpdGlvbmFsVHJhbnNmZXJJdGVtcyh0cmVlRGF0YVRyYW5zZmVyOiB2c2NvZGUuRGF0YVRyYW5zZmVyLCB0cmVlVmlldzogRXh0SG9zdFRyZWVWaWV3PGFueT4sXG5cdFx0c291cmNlVHJlZUl0ZW1IYW5kbGVzOiBzdHJpbmdbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBvcGVyYXRpb25VdWlkPzogc3RyaW5nKTogUHJvbWlzZTx2c2NvZGUuRGF0YVRyYW5zZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdUcmFuc2Zlck9wZXJhdGlvbiA9IHRoaXMuX3RyZWVEcmFnQW5kRHJvcFNlcnZpY2UucmVtb3ZlRHJhZ09wZXJhdGlvblRyYW5zZmVyKG9wZXJhdGlvblV1aWQpO1xuXHRcdGlmIChleGlzdGluZ1RyYW5zZmVyT3BlcmF0aW9uKSB7XG5cdFx0XHQoYXdhaXQgZXhpc3RpbmdUcmFuc2Zlck9wZXJhdGlvbik/LmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdFx0dHJlZURhdGFUcmFuc2Zlci5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAob3BlcmF0aW9uVXVpZCAmJiB0cmVlVmlldy5oYW5kbGVEcmFnKSB7XG5cdFx0XHRjb25zdCB3aWxsRHJvcFByb21pc2UgPSB0cmVlVmlldy5oYW5kbGVEcmFnKHNvdXJjZVRyZWVJdGVtSGFuZGxlcywgdHJlZURhdGFUcmFuc2ZlciwgdG9rZW4pO1xuXHRcdFx0dGhpcy5fdHJlZURyYWdBbmREcm9wU2VydmljZS5hZGREcmFnT3BlcmF0aW9uVHJhbnNmZXIob3BlcmF0aW9uVXVpZCwgd2lsbERyb3BQcm9taXNlKTtcblx0XHRcdGF3YWl0IHdpbGxEcm9wUHJvbWlzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRyZWVEYXRhVHJhbnNmZXI7XG5cdH1cblxuXHRhc3luYyAkaGFuZGxlRHJhZyhzb3VyY2VWaWV3SWQ6IHN0cmluZywgc291cmNlVHJlZUl0ZW1IYW5kbGVzOiBzdHJpbmdbXSwgb3BlcmF0aW9uVXVpZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPERhdGFUcmFuc2ZlckRUTyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5fdHJlZVZpZXdzLmdldChzb3VyY2VWaWV3SWQpO1xuXHRcdGlmICghdHJlZVZpZXcpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgTm9UcmVlVmlld0Vycm9yKHNvdXJjZVZpZXdJZCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyZWVEYXRhVHJhbnNmZXIgPSBhd2FpdCB0aGlzLl9hZGRBZGRpdGlvbmFsVHJhbnNmZXJJdGVtcyhuZXcgZXh0SG9zdFR5cGVzLkRhdGFUcmFuc2ZlcigpLCB0cmVlVmlldywgc291cmNlVHJlZUl0ZW1IYW5kbGVzLCB0b2tlbiwgb3BlcmF0aW9uVXVpZCk7XG5cdFx0aWYgKCF0cmVlRGF0YVRyYW5zZmVyIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIERhdGFUcmFuc2Zlci5mcm9tKHRyZWVEYXRhVHJhbnNmZXIpO1xuXHR9XG5cblx0YXN5bmMgJGhhc1Jlc29sdmUodHJlZVZpZXdJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl90cmVlVmlld3MuZ2V0KHRyZWVWaWV3SWQpO1xuXHRcdGlmICghdHJlZVZpZXcpIHtcblx0XHRcdHRocm93IG5ldyBOb1RyZWVWaWV3RXJyb3IodHJlZVZpZXdJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0cmVlVmlldy5oYXNSZXNvbHZlO1xuXHR9XG5cblx0JHJlc29sdmUodHJlZVZpZXdJZDogc3RyaW5nLCB0cmVlSXRlbUhhbmRsZTogc3RyaW5nLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVHJlZUl0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuX3RyZWVWaWV3cy5nZXQodHJlZVZpZXdJZCk7XG5cdFx0aWYgKCF0cmVlVmlldykge1xuXHRcdFx0dGhyb3cgbmV3IE5vVHJlZVZpZXdFcnJvcih0cmVlVmlld0lkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRyZWVWaWV3LnJlc29sdmVUcmVlSXRlbSh0cmVlSXRlbUhhbmRsZSwgdG9rZW4pO1xuXHR9XG5cblx0JHNldEV4cGFuZGVkKHRyZWVWaWV3SWQ6IHN0cmluZywgdHJlZUl0ZW1IYW5kbGU6IHN0cmluZywgZXhwYW5kZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuX3RyZWVWaWV3cy5nZXQodHJlZVZpZXdJZCk7XG5cdFx0aWYgKCF0cmVlVmlldykge1xuXHRcdFx0dGhyb3cgbmV3IE5vVHJlZVZpZXdFcnJvcih0cmVlVmlld0lkKTtcblx0XHR9XG5cdFx0dHJlZVZpZXcuc2V0RXhwYW5kZWQodHJlZUl0ZW1IYW5kbGUsIGV4cGFuZGVkKTtcblx0fVxuXG5cdCRzZXRTZWxlY3Rpb25BbmRGb2N1cyh0cmVlVmlld0lkOiBzdHJpbmcsIHNlbGVjdGVkSGFuZGxlczogc3RyaW5nW10sIGZvY3VzZWRIYW5kbGU6IHN0cmluZykge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5fdHJlZVZpZXdzLmdldCh0cmVlVmlld0lkKTtcblx0XHRpZiAoIXRyZWVWaWV3KSB7XG5cdFx0XHR0aHJvdyBuZXcgTm9UcmVlVmlld0Vycm9yKHRyZWVWaWV3SWQpO1xuXHRcdH1cblx0XHR0cmVlVmlldy5zZXRTZWxlY3Rpb25BbmRGb2N1cyhzZWxlY3RlZEhhbmRsZXMsIGZvY3VzZWRIYW5kbGUpO1xuXHR9XG5cblx0JHNldFZpc2libGUodHJlZVZpZXdJZDogc3RyaW5nLCBpc1Zpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuX3RyZWVWaWV3cy5nZXQodHJlZVZpZXdJZCk7XG5cdFx0aWYgKCF0cmVlVmlldykge1xuXHRcdFx0aWYgKCFpc1Zpc2libGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IE5vVHJlZVZpZXdFcnJvcih0cmVlVmlld0lkKTtcblx0XHR9XG5cdFx0dHJlZVZpZXcuc2V0VmlzaWJsZShpc1Zpc2libGUpO1xuXHR9XG5cblx0JGNoYW5nZUNoZWNrYm94U3RhdGUodHJlZVZpZXdJZDogc3RyaW5nLCBjaGVja2JveFVwZGF0ZTogQ2hlY2tib3hVcGRhdGVbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5fdHJlZVZpZXdzLmdldCh0cmVlVmlld0lkKTtcblx0XHRpZiAoIXRyZWVWaWV3KSB7XG5cdFx0XHR0aHJvdyBuZXcgTm9UcmVlVmlld0Vycm9yKHRyZWVWaWV3SWQpO1xuXHRcdH1cblx0XHR0cmVlVmlldy5zZXRDaGVja2JveFN0YXRlKGNoZWNrYm94VXBkYXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUV4dEhvc3RUcmVlVmlldzxUPihpZDogc3RyaW5nLCBvcHRpb25zOiB2c2NvZGUuVHJlZVZpZXdPcHRpb25zPFQ+LCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IEV4dEhvc3RUcmVlVmlldzxUPiB7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRXh0SG9zdFRyZWVWaWV3PFQ+KGlkLCBvcHRpb25zLCB0aGlzLl9wcm94eSwgdGhpcy5fY29tbWFuZHMuY29udmVydGVyLCB0aGlzLl9sb2dTZXJ2aWNlLCBleHRlbnNpb24pKTtcblx0XHR0aGlzLl90cmVlVmlld3Muc2V0KGlkLCB0cmVlVmlldyk7XG5cdFx0cmV0dXJuIHRyZWVWaWV3O1xuXHR9XG5cblx0cHJpdmF0ZSBfY29udmVydEFyZ3VtZW50KGFyZzogVHJlZVZpZXdJdGVtSGFuZGxlQXJnIHwgVHJlZVZpZXdQYW5lSGFuZGxlQXJnKTogYW55IHtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRoaXMuX3RyZWVWaWV3cy5nZXQoYXJnLiR0cmVlVmlld0lkKTtcblx0XHRjb25zdCBhc0l0ZW1IYW5kbGUgPSBhcmcgYXMgUGFydGlhbDxUcmVlVmlld0l0ZW1IYW5kbGVBcmc+O1xuXHRcdGlmICh0cmVlVmlldyAmJiBhc0l0ZW1IYW5kbGUuJHRyZWVJdGVtSGFuZGxlKSB7XG5cdFx0XHRyZXR1cm4gdHJlZVZpZXcuZ2V0RXh0ZW5zaW9uRWxlbWVudChhc0l0ZW1IYW5kbGUuJHRyZWVJdGVtSGFuZGxlKTtcblx0XHR9XG5cdFx0Y29uc3QgYXNQYW5lSGFuZGxlID0gYXJnIGFzIFBhcnRpYWw8VHJlZVZpZXdQYW5lSGFuZGxlQXJnPjtcblx0XHRpZiAodHJlZVZpZXcgJiYgYXNQYW5lSGFuZGxlLiRmb2N1c2VkVHJlZUl0ZW0pIHtcblx0XHRcdHJldHVybiB0cmVlVmlldy5mb2N1c2VkRWxlbWVudDtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxudHlwZSBSb290ID0gbnVsbCB8IHVuZGVmaW5lZCB8IHZvaWQ7XG50eXBlIFRyZWVEYXRhPFQ+ID0geyBtZXNzYWdlOiBib29sZWFuOyBlbGVtZW50OiBUIHwgVFtdIHwgUm9vdCB8IGZhbHNlIH07XG5cbmludGVyZmFjZSBUcmVlTm9kZSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0aXRlbTogSVRyZWVJdGVtO1xuXHRleHRlbnNpb25JdGVtOiB2c2NvZGUuVHJlZUl0ZW07XG5cdHBhcmVudDogVHJlZU5vZGUgfCBSb290O1xuXHRjaGlsZHJlbj86IFRyZWVOb2RlW107XG5cdGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBFeHRIb3N0VHJlZVZpZXc8VD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBMQUJFTF9IQU5ETEVfUFJFRklYID0gJzAnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJRF9IQU5ETEVfUFJFRklYID0gJzEnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBST09UX0ZFVENIX0tFWSA9IFN5bWJvbCgnZXh0SG9zdFRyZWVWaWV3Um9vdCcpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGFQcm92aWRlcjogdnNjb2RlLlRyZWVEYXRhUHJvdmlkZXI8VD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RuZENvbnRyb2xsZXI6IHZzY29kZS5UcmVlRHJhZ0FuZERyb3BDb250cm9sbGVyPFQ+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3Jvb3RzOiBUcmVlTm9kZVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lbGVtZW50czogTWFwPFRyZWVJdGVtSGFuZGxlLCBUPiA9IG5ldyBNYXA8VHJlZUl0ZW1IYW5kbGUsIFQ+KCk7XG5cdHByaXZhdGUgX25vZGVzOiBNYXA8VCwgVHJlZU5vZGU+ID0gbmV3IE1hcDxULCBUcmVlTm9kZT4oKTtcblx0Ly8gVHJhY2sgdGhlIGxhdGVzdCBjaGlsZC1mZXRjaCBwZXIgZWxlbWVudCBzbyB0aGF0IHJlZnJlc2gtdHJpZ2dlcmVkIGNhY2hlIGNsZWFycyBpZ25vcmUgc3RhbGUgcmVzdWx0cy5cblx0Ly8gV2l0aG91dCB0aGVzZSB0b2tlbnMsIGFuIGVhcmxpZXIgZ2V0Q2hpbGRyZW4gcHJvbWlzZSByZXNvbHZpbmcgYWZ0ZXIgcmVmcmVzaCB3b3VsZCByZS1yZWdpc3RlciBoYW5kbGVzIGFuZCBoaXQgdGhlIGR1cGxpY2F0ZS1pZCBndWFyZC5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hpbGRyZW5GZXRjaFRva2VucyA9IG5ldyBNYXA8VCB8IHR5cGVvZiBFeHRIb3N0VHJlZVZpZXcuUk9PVF9GRVRDSF9LRVksIG51bWJlcj4oKTtcblx0Ly8gR2xvYmFsIGNvdW50ZXIgZm9yIGZldGNoIHRva2Vucy4gVXNpbmcgYSBtb25vdG9uaWNhbGx5IGluY3JlYXNpbmcgY291bnRlciBlbnN1cmVzIHRoYXQgZXZlbiBhZnRlclxuXHQvLyBfY2hpbGRyZW5GZXRjaFRva2Vucy5jbGVhcigpIGR1cmluZyBhIHJvb3QgcmVmcmVzaCwgb2xkIGluLWZsaWdodCBmZXRjaGVzIHdpbGwgaGF2ZSByZXF1ZXN0SWRzIHRoYXRcblx0Ly8gY2FuIG5ldmVyIG1hdGNoIG5ldyBmZXRjaGVzIChlLmcuLCBvbGQgZmV0Y2ggaGFzIGlkPTUsIGFmdGVyIGNsZWFyIG5ldyBmZXRjaGVzIGdldCA2LCA3LCA4Li4uKS5cblx0cHJpdmF0ZSBfZ2xvYmFsRmV0Y2hUb2tlbkNvdW50ZXIgPSAwO1xuXG5cdHByaXZhdGUgX3Zpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl92aXNpYmxlOyB9XG5cblx0cHJpdmF0ZSBfc2VsZWN0ZWRIYW5kbGVzOiBUcmVlSXRlbUhhbmRsZVtdID0gW107XG5cdGdldCBzZWxlY3RlZEVsZW1lbnRzKCk6IFRbXSB7IHJldHVybiA8VFtdPnRoaXMuX3NlbGVjdGVkSGFuZGxlcy5tYXAoaGFuZGxlID0+IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudChoYW5kbGUpKS5maWx0ZXIoZWxlbWVudCA9PiAhaXNVbmRlZmluZWRPck51bGwoZWxlbWVudCkpOyB9XG5cblx0cHJpdmF0ZSBfZm9jdXNlZEhhbmRsZTogVHJlZUl0ZW1IYW5kbGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBmb2N1c2VkRWxlbWVudCgpOiBUIHwgdW5kZWZpbmVkIHsgcmV0dXJuIDxUIHwgdW5kZWZpbmVkPih0aGlzLl9mb2N1c2VkSGFuZGxlID8gdGhpcy5nZXRFeHRlbnNpb25FbGVtZW50KHRoaXMuX2ZvY3VzZWRIYW5kbGUpIDogdW5kZWZpbmVkKTsgfVxuXG5cdHByaXZhdGUgX29uRGlkRXhwYW5kRWxlbWVudDogRW1pdHRlcjx2c2NvZGUuVHJlZVZpZXdFeHBhbnNpb25FdmVudDxUPj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuVHJlZVZpZXdFeHBhbnNpb25FdmVudDxUPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRXhwYW5kRWxlbWVudDogRXZlbnQ8dnNjb2RlLlRyZWVWaWV3RXhwYW5zaW9uRXZlbnQ8VD4+ID0gdGhpcy5fb25EaWRFeHBhbmRFbGVtZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ29sbGFwc2VFbGVtZW50OiBFbWl0dGVyPHZzY29kZS5UcmVlVmlld0V4cGFuc2lvbkV2ZW50PFQ+PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5UcmVlVmlld0V4cGFuc2lvbkV2ZW50PFQ+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDb2xsYXBzZUVsZW1lbnQ6IEV2ZW50PHZzY29kZS5UcmVlVmlld0V4cGFuc2lvbkV2ZW50PFQ+PiA9IHRoaXMuX29uRGlkQ29sbGFwc2VFbGVtZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlU2VsZWN0aW9uOiBFbWl0dGVyPHZzY29kZS5UcmVlVmlld1NlbGVjdGlvbkNoYW5nZUV2ZW50PFQ+PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5UcmVlVmlld1NlbGVjdGlvbkNoYW5nZUV2ZW50PFQ+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb246IEV2ZW50PHZzY29kZS5UcmVlVmlld1NlbGVjdGlvbkNoYW5nZUV2ZW50PFQ+PiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQWN0aXZlSXRlbTogRW1pdHRlcjx2c2NvZGUuVHJlZVZpZXdBY3RpdmVJdGVtQ2hhbmdlRXZlbnQ8VD4+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLlRyZWVWaWV3QWN0aXZlSXRlbUNoYW5nZUV2ZW50PFQ+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVJdGVtOiBFdmVudDx2c2NvZGUuVHJlZVZpZXdBY3RpdmVJdGVtQ2hhbmdlRXZlbnQ8VD4+ID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJdGVtLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRW1pdHRlcjx2c2NvZGUuVHJlZVZpZXdWaXNpYmlsaXR5Q2hhbmdlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dnNjb2RlLlRyZWVWaWV3VmlzaWJpbGl0eUNoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDx2c2NvZGUuVHJlZVZpZXdWaXNpYmlsaXR5Q2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5UcmVlQ2hlY2tib3hDaGFuZ2VFdmVudDxUPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZTogRXZlbnQ8dnNjb2RlLlRyZWVDaGVja2JveENoYW5nZUV2ZW50PFQ+PiA9IHRoaXMuX29uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZURhdGE6IEVtaXR0ZXI8VHJlZURhdGE8VD4+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VHJlZURhdGE8VD4+KCkpO1xuXG5cdHByaXZhdGUgX3JlZnJlc2hQcm9taXNlOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdHByaXZhdGUgX3JlZnJlc2hRdWV1ZTogUHJvbWlzZTx2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdHByaXZhdGUgX25vZGVzVG9DbGVhcjogU2V0PFRyZWVOb2RlPiA9IG5ldyBTZXQ8VHJlZU5vZGU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfdmlld0lkOiBzdHJpbmcsIG9wdGlvbnM6IHZzY29kZS5UcmVlVmlld09wdGlvbnM8VD4sXG5cdFx0cHJpdmF0ZSBfcHJveHk6IE1haW5UaHJlYWRUcmVlVmlld3NTaGFwZSxcblx0XHRwcml2YXRlIF9jb21tYW5kczogQ29tbWFuZHNDb252ZXJ0ZXIsXG5cdFx0cHJpdmF0ZSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25cblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAoX2V4dGVuc2lvbi5jb250cmlidXRlcyAmJiBfZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXdzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGxvY2F0aW9uIGluIF9leHRlbnNpb24uY29udHJpYnV0ZXMudmlld3MpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB2aWV3IG9mIF9leHRlbnNpb24uY29udHJpYnV0ZXMudmlld3NbbG9jYXRpb25dKSB7XG5cdFx0XHRcdFx0aWYgKHZpZXcuaWQgPT09IF92aWV3SWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3RpdGxlID0gdmlldy5uYW1lO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9kYXRhUHJvdmlkZXIgPSBvcHRpb25zLnRyZWVEYXRhUHJvdmlkZXI7XG5cdFx0dGhpcy5fZG5kQ29udHJvbGxlciA9IG9wdGlvbnMuZHJhZ0FuZERyb3BDb250cm9sbGVyO1xuXHRcdGlmICh0aGlzLl9kYXRhUHJvdmlkZXIub25EaWRDaGFuZ2VUcmVlRGF0YSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGF0YVByb3ZpZGVyLm9uRGlkQ2hhbmdlVHJlZURhdGEoZWxlbWVudE9yRWxlbWVudHMgPT4ge1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShlbGVtZW50T3JFbGVtZW50cykgJiYgZWxlbWVudE9yRWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRGF0YS5maXJlKHsgbWVzc2FnZTogZmFsc2UsIGVsZW1lbnQ6IGVsZW1lbnRPckVsZW1lbnRzIH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGxldCByZWZyZXNoaW5nUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IG51bGw7XG5cdFx0bGV0IHByb21pc2VDYWxsYmFjazogKCkgPT4gdm9pZDtcblx0XHRjb25zdCBvbkRpZENoYW5nZURhdGEgPSBFdmVudC5kZWJvdW5jZTxUcmVlRGF0YTxUPiwgeyBtZXNzYWdlOiBib29sZWFuOyBlbGVtZW50czogKFQgfCBSb290KVtdIH0+KHRoaXMuX29uRGlkQ2hhbmdlRGF0YS5ldmVudCwgKHJlc3VsdCwgY3VycmVudCkgPT4ge1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmVzdWx0ID0geyBtZXNzYWdlOiBmYWxzZSwgZWxlbWVudHM6IFtdIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3VycmVudC5lbGVtZW50ICE9PSBmYWxzZSkge1xuXHRcdFx0XHRpZiAoIXJlZnJlc2hpbmdQcm9taXNlKSB7XG5cdFx0XHRcdFx0Ly8gTmV3IHJlZnJlc2ggaGFzIHN0YXJ0ZWRcblx0XHRcdFx0XHRyZWZyZXNoaW5nUHJvbWlzZSA9IG5ldyBQcm9taXNlKGMgPT4gcHJvbWlzZUNhbGxiYWNrID0gYyk7XG5cdFx0XHRcdFx0dGhpcy5fcmVmcmVzaFByb21pc2UgPSB0aGlzLl9yZWZyZXNoUHJvbWlzZS50aGVuKCgpID0+IHJlZnJlc2hpbmdQcm9taXNlISk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoY3VycmVudC5lbGVtZW50KSkge1xuXHRcdFx0XHRcdHJlc3VsdC5lbGVtZW50cy5wdXNoKC4uLmN1cnJlbnQuZWxlbWVudCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LmVsZW1lbnRzLnB1c2goY3VycmVudC5lbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnQubWVzc2FnZSkge1xuXHRcdFx0XHRyZXN1bHQubWVzc2FnZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0sIDIwMCwgdHJ1ZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VEYXRhKCh7IG1lc3NhZ2UsIGVsZW1lbnRzIH0pID0+IHtcblx0XHRcdGlmIChlbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0ZWxlbWVudHMgPSBkaXN0aW5jdChlbGVtZW50cyk7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hRdWV1ZSA9IHRoaXMuX3JlZnJlc2hRdWV1ZS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBfcHJvbWlzZUNhbGxiYWNrID0gcHJvbWlzZUNhbGxiYWNrO1xuXHRcdFx0XHRcdHJlZnJlc2hpbmdQcm9taXNlID0gbnVsbDtcblx0XHRcdFx0XHRjb25zdCBjaGlsZHJlblRvQ2xlYXIgPSBBcnJheS5mcm9tKHRoaXMuX25vZGVzVG9DbGVhcik7XG5cdFx0XHRcdFx0dGhpcy5fbm9kZXNUb0NsZWFyLmNsZWFyKCk7XG5cdFx0XHRcdFx0dGhpcy5fZGVidWdMb2dSZWZyZXNoKCdzdGFydCcsIGVsZW1lbnRzLCBjaGlsZHJlblRvQ2xlYXIpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9yZWZyZXNoKGVsZW1lbnRzKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2RlYnVnTG9nUmVmcmVzaCgnZG9uZScsIGVsZW1lbnRzLCBjaGlsZHJlblRvQ2xlYXIpO1xuXHRcdFx0XHRcdFx0dGhpcy5fY2xlYXJOb2RlcyhjaGlsZHJlblRvQ2xlYXIpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIF9wcm9taXNlQ2FsbGJhY2soKTtcblx0XHRcdFx0XHR9KS5jYXRjaChlID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBKU09OLnN0cmluZ2lmeShlKTtcblx0XHRcdFx0XHRcdHRoaXMuX2RlYnVnTG9nUmVmcmVzaCgnZXJyb3InLCBlbGVtZW50cywgY2hpbGRyZW5Ub0NsZWFyKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NsZWFyTm9kZXMoY2hpbGRyZW5Ub0NsZWFyKTtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFVuYWJsZSB0byByZWZyZXNoIHRyZWUgdmlldyAke3RoaXMuX3ZpZXdJZH06ICR7bWVzc2FnZX1gKTtcblx0XHRcdFx0XHRcdHJldHVybiBfcHJvbWlzZUNhbGxiYWNrKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJHNldE1lc3NhZ2UodGhpcy5fdmlld0lkLCBNYXJrZG93blN0cmluZy5mcm9tU3RyaWN0KHRoaXMuX21lc3NhZ2UpID8/ICcnKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9kZWJ1Z0NvbGxlY3RIYW5kbGVzKGVsZW1lbnRzOiAoVCB8IFJvb3QpW10pOiB7IGNoYW5nZWQ6IHN0cmluZ1tdOyByb290czogc3RyaW5nW107IGNsZWFyaW5nPzogc3RyaW5nW10gfSB7XG5cdFx0Y29uc3QgY2hhbmdlZDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVsIG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRpZiAoIWVsKSB7XG5cdFx0XHRcdGNoYW5nZWQucHVzaCgnPHJvb3Q+Jyk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgbm9kZSA9IHRoaXMuX25vZGVzLmdldChlbCBhcyBUKTtcblx0XHRcdGlmIChub2RlKSB7XG5cdFx0XHRcdGNoYW5nZWQucHVzaChub2RlLml0ZW0uaGFuZGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgcm9vdHMgPSB0aGlzLl9yb290cz8ubWFwKHIgPT4gci5pdGVtLmhhbmRsZSkgPz8gW107XG5cdFx0cmV0dXJuIHsgY2hhbmdlZCwgcm9vdHMgfTtcblx0fVxuXG5cdHByaXZhdGUgX2RlYnVnTG9nUmVmcmVzaChwaGFzZTogJ3N0YXJ0JyB8ICdkb25lJyB8ICdlcnJvcicsIGVsZW1lbnRzOiAoVCB8IFJvb3QpW10sIGNoaWxkcmVuVG9DbGVhcjogVHJlZU5vZGVbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNEZWJ1Z0xvZ2dpbmcoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSB0aGlzLl9kZWJ1Z0NvbGxlY3RIYW5kbGVzKGVsZW1lbnRzKTtcblx0XHRcdHNuYXBzaG90LmNsZWFyaW5nID0gY2hpbGRyZW5Ub0NsZWFyLm1hcChuID0+IG4uaXRlbS5oYW5kbGUpO1xuXHRcdFx0Y29uc3QgY2hhbmdlZENvdW50ID0gc25hcHNob3QuY2hhbmdlZC5sZW5ndGg7XG5cdFx0XHRjb25zdCBub2Rlc1RvQ2xlYXJMZW4gPSBjaGlsZHJlblRvQ2xlYXIubGVuZ3RoO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1RyZWVWaWV3OiR7dGhpcy5fdmlld0lkfV0gcmVmcmVzaCAke3BoYXNlfSBjaGFuZ2VkPSR7Y2hhbmdlZENvdW50fSBub2Rlc1RvQ2xlYXI9JHtub2Rlc1RvQ2xlYXJMZW59IGVsZW1lbnRzLnNpemU9JHt0aGlzLl9lbGVtZW50cy5zaXplfSBub2Rlcy5zaXplPSR7dGhpcy5fbm9kZXMuc2l6ZX0gaGFuZGxlcz0ke0pTT04uc3RyaW5naWZ5KHNuYXBzaG90KX1gKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYFtUcmVlVmlldzoke3RoaXMuX3ZpZXdJZH1dIHJlZnJlc2ggJHtwaGFzZX0gKHNuYXBzaG90IGZhaWxlZClgKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc0RlYnVnTG9nZ2luZygpOiBib29sZWFuIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbGV2ZWwgPSB0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCk7XG5cdFx0XHRyZXR1cm4gKGxldmVsID09PSBMb2dMZXZlbC5EZWJ1ZykgfHwgKGxldmVsID09PSBMb2dMZXZlbC5UcmFjZSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4ocGFyZW50SGFuZGxlOiBUcmVlSXRlbUhhbmRsZSB8IFJvb3QpOiBQcm9taXNlPHJlYWRvbmx5IElUcmVlSXRlbVtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyZW50RWxlbWVudCA9IHBhcmVudEhhbmRsZSA/IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudChwYXJlbnRIYW5kbGUpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChwYXJlbnRIYW5kbGUgJiYgIXBhcmVudEVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYE5vIHRyZWUgaXRlbSB3aXRoIGlkIFxcJyR7cGFyZW50SGFuZGxlfVxcJyBmb3VuZC5gKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdH1cblxuXHRcdGxldCBjaGlsZHJlbk5vZGVzOiBUcmVlTm9kZVtdIHwgdW5kZWZpbmVkID0gdGhpcy5fZ2V0Q2hpbGRyZW5Ob2RlcyhwYXJlbnRIYW5kbGUpOyAvLyBHZXQgaXQgZnJvbSBjYWNoZVxuXG5cdFx0aWYgKCFjaGlsZHJlbk5vZGVzKSB7XG5cdFx0XHRjaGlsZHJlbk5vZGVzID0gYXdhaXQgdGhpcy5fZmV0Y2hDaGlsZHJlbk5vZGVzKHBhcmVudEVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjaGlsZHJlbk5vZGVzID8gY2hpbGRyZW5Ob2Rlcy5tYXAobiA9PiBuLml0ZW0pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0RXh0ZW5zaW9uRWxlbWVudCh0cmVlSXRlbUhhbmRsZTogVHJlZUl0ZW1IYW5kbGUpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZWxlbWVudHMuZ2V0KHRyZWVJdGVtSGFuZGxlKTtcblx0fVxuXG5cdHJldmVhbChlbGVtZW50OiBUIHwgdW5kZWZpbmVkLCBvcHRpb25zPzogSVJldmVhbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyA/IG9wdGlvbnMgOiB7IHNlbGVjdDogdHJ1ZSwgZm9jdXM6IGZhbHNlIH07XG5cdFx0Y29uc3Qgc2VsZWN0ID0gaXNVbmRlZmluZWRPck51bGwob3B0aW9ucy5zZWxlY3QpID8gdHJ1ZSA6IG9wdGlvbnMuc2VsZWN0O1xuXHRcdGNvbnN0IGZvY3VzID0gaXNVbmRlZmluZWRPck51bGwob3B0aW9ucy5mb2N1cykgPyBmYWxzZSA6IG9wdGlvbnMuZm9jdXM7XG5cdFx0Y29uc3QgZXhwYW5kID0gaXNVbmRlZmluZWRPck51bGwob3B0aW9ucy5leHBhbmQpID8gZmFsc2UgOiBvcHRpb25zLmV4cGFuZDtcblxuXHRcdGlmICh0eXBlb2YgdGhpcy5fZGF0YVByb3ZpZGVyLmdldFBhcmVudCAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgUmVxdWlyZWQgcmVnaXN0ZXJlZCBUcmVlRGF0YVByb3ZpZGVyIHRvIGltcGxlbWVudCAnZ2V0UGFyZW50JyBtZXRob2QgdG8gYWNjZXNzICdyZXZlYWwnIG1ldGhvZGApKTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZnJlc2hQcm9taXNlXG5cdFx0XHRcdC50aGVuKCgpID0+IHRoaXMuX3Jlc29sdmVVbmtub3duUGFyZW50Q2hhaW4oZWxlbWVudCkpXG5cdFx0XHRcdC50aGVuKHBhcmVudENoYWluID0+IHRoaXMuX3Jlc29sdmVUcmVlTm9kZShlbGVtZW50LCBwYXJlbnRDaGFpbltwYXJlbnRDaGFpbi5sZW5ndGggLSAxXSlcblx0XHRcdFx0XHQudGhlbih0cmVlTm9kZSA9PiB0aGlzLl9wcm94eS4kcmV2ZWFsKHRoaXMuX3ZpZXdJZCwgeyBpdGVtOiB0cmVlTm9kZS5pdGVtLCBwYXJlbnRDaGFpbjogcGFyZW50Q2hhaW4ubWFwKHAgPT4gcC5pdGVtKSB9LCB7IHNlbGVjdCwgZm9jdXMsIGV4cGFuZCB9KSksIGVycm9yID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRyZXZlYWwodGhpcy5fdmlld0lkLCB1bmRlZmluZWQsIHsgc2VsZWN0LCBmb2N1cywgZXhwYW5kIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX21lc3NhZ2U6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyA9ICcnO1xuXHRnZXQgbWVzc2FnZSgpOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9tZXNzYWdlO1xuXHR9XG5cblx0c2V0IG1lc3NhZ2UobWVzc2FnZTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nKSB7XG5cdFx0dGhpcy5fbWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEYXRhLmZpcmUoeyBtZXNzYWdlOiB0cnVlLCBlbGVtZW50OiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgX3RpdGxlOiBzdHJpbmcgPSAnJztcblx0Z2V0IHRpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpdGxlO1xuXHR9XG5cblx0c2V0IHRpdGxlKHRpdGxlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl90aXRsZSA9IHRpdGxlO1xuXHRcdHRoaXMuX3Byb3h5LiRzZXRUaXRsZSh0aGlzLl92aWV3SWQsIHRpdGxlLCB0aGlzLl9kZXNjcmlwdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVzY3JpcHRpb247XG5cdH1cblxuXHRzZXQgZGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0dGhpcy5fcHJveHkuJHNldFRpdGxlKHRoaXMuX3ZpZXdJZCwgdGhpcy5fdGl0bGUsIGRlc2NyaXB0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2JhZGdlOiB2c2NvZGUuVmlld0JhZGdlIHwgdW5kZWZpbmVkO1xuXHRnZXQgYmFkZ2UoKTogdnNjb2RlLlZpZXdCYWRnZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2JhZGdlO1xuXHR9XG5cblx0c2V0IGJhZGdlKGJhZGdlOiB2c2NvZGUuVmlld0JhZGdlIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHRoaXMuX2JhZGdlPy52YWx1ZSA9PT0gYmFkZ2U/LnZhbHVlICYmXG5cdFx0XHR0aGlzLl9iYWRnZT8udG9vbHRpcCA9PT0gYmFkZ2U/LnRvb2x0aXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9iYWRnZSA9IFZpZXdCYWRnZS5mcm9tKGJhZGdlKTtcblx0XHR0aGlzLl9wcm94eS4kc2V0QmFkZ2UodGhpcy5fdmlld0lkLCBiYWRnZSk7XG5cdH1cblxuXHRzZXRFeHBhbmRlZCh0cmVlSXRlbUhhbmRsZTogVHJlZUl0ZW1IYW5kbGUsIGV4cGFuZGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudCh0cmVlSXRlbUhhbmRsZSk7XG5cdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdGlmIChleHBhbmRlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEV4cGFuZEVsZW1lbnQuZmlyZShPYmplY3QuZnJlZXplKHsgZWxlbWVudCB9KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENvbGxhcHNlRWxlbWVudC5maXJlKE9iamVjdC5mcmVlemUoeyBlbGVtZW50IH0pKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRzZXRTZWxlY3Rpb25BbmRGb2N1cyhzZWxlY3RlZEhhbmRsZXM6IFRyZWVJdGVtSGFuZGxlW10sIGZvY3VzZWRIYW5kbGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZWRTZWxlY3Rpb24gPSAhZXF1YWxzKHRoaXMuX3NlbGVjdGVkSGFuZGxlcywgc2VsZWN0ZWRIYW5kbGVzKTtcblx0XHR0aGlzLl9zZWxlY3RlZEhhbmRsZXMgPSBzZWxlY3RlZEhhbmRsZXM7XG5cblx0XHRjb25zdCBjaGFuZ2VkRm9jdXMgPSB0aGlzLl9mb2N1c2VkSGFuZGxlICE9PSBmb2N1c2VkSGFuZGxlO1xuXHRcdHRoaXMuX2ZvY3VzZWRIYW5kbGUgPSBmb2N1c2VkSGFuZGxlO1xuXG5cdFx0aWYgKGNoYW5nZWRTZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUoT2JqZWN0LmZyZWV6ZSh7IHNlbGVjdGlvbjogdGhpcy5zZWxlY3RlZEVsZW1lbnRzIH0pKTtcblx0XHR9XG5cblx0XHRpZiAoY2hhbmdlZEZvY3VzKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUl0ZW0uZmlyZShPYmplY3QuZnJlZXplKHsgYWN0aXZlSXRlbTogdGhpcy5mb2N1c2VkRWxlbWVudCB9KSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUgIT09IHRoaXMuX3Zpc2libGUpIHtcblx0XHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUoT2JqZWN0LmZyZWV6ZSh7IHZpc2libGU6IHRoaXMuX3Zpc2libGUgfSkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldENoZWNrYm94U3RhdGUoY2hlY2tib3hVcGRhdGVzOiBDaGVja2JveFVwZGF0ZVtdKSB7XG5cdFx0dHlwZSBDaGVja2JveFVwZGF0ZVdpdGhJdGVtID0geyBleHRlbnNpb25JdGVtOiBOb25OdWxsYWJsZTxUPjsgdHJlZUl0ZW06IHZzY29kZS5UcmVlSXRlbTsgbmV3U3RhdGU6IGV4dEhvc3RUeXBlcy5UcmVlSXRlbUNoZWNrYm94U3RhdGUgfTtcblx0XHRjb25zdCBpdGVtcyA9IChhd2FpdCBQcm9taXNlLmFsbChjaGVja2JveFVwZGF0ZXMubWFwKGFzeW5jIGNoZWNrYm94VXBkYXRlID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbkl0ZW0gPSB0aGlzLmdldEV4dGVuc2lvbkVsZW1lbnQoY2hlY2tib3hVcGRhdGUudHJlZUl0ZW1IYW5kbGUpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbkl0ZW0pIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRleHRlbnNpb25JdGVtOiBleHRlbnNpb25JdGVtLFxuXHRcdFx0XHRcdHRyZWVJdGVtOiBhd2FpdCB0aGlzLl9kYXRhUHJvdmlkZXIuZ2V0VHJlZUl0ZW0oZXh0ZW5zaW9uSXRlbSksXG5cdFx0XHRcdFx0bmV3U3RhdGU6IGNoZWNrYm94VXBkYXRlLm5ld1N0YXRlID8gZXh0SG9zdFR5cGVzLlRyZWVJdGVtQ2hlY2tib3hTdGF0ZS5DaGVja2VkIDogZXh0SG9zdFR5cGVzLlRyZWVJdGVtQ2hlY2tib3hTdGF0ZS5VbmNoZWNrZWRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9KSkpLmZpbHRlcjxDaGVja2JveFVwZGF0ZVdpdGhJdGVtPigoaXRlbSk6IGl0ZW0gaXMgQ2hlY2tib3hVcGRhdGVXaXRoSXRlbSA9PiBpdGVtICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0aXRlbXMuZm9yRWFjaChpdGVtID0+IHtcblx0XHRcdGl0ZW0udHJlZUl0ZW0uY2hlY2tib3hTdGF0ZSA9IGl0ZW0ubmV3U3RhdGUgPyBleHRIb3N0VHlwZXMuVHJlZUl0ZW1DaGVja2JveFN0YXRlLkNoZWNrZWQgOiBleHRIb3N0VHlwZXMuVHJlZUl0ZW1DaGVja2JveFN0YXRlLlVuY2hlY2tlZDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZS5maXJlKHsgaXRlbXM6IGl0ZW1zLm1hcChpdGVtID0+IFtpdGVtLmV4dGVuc2lvbkl0ZW0sIGl0ZW0ubmV3U3RhdGVdKSB9KTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZURyYWcoc291cmNlVHJlZUl0ZW1IYW5kbGVzOiBUcmVlSXRlbUhhbmRsZVtdLCB0cmVlRGF0YVRyYW5zZmVyOiB2c2NvZGUuRGF0YVRyYW5zZmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5EYXRhVHJhbnNmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleHRlbnNpb25UcmVlSXRlbXM6IFRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc291cmNlSGFuZGxlIG9mIHNvdXJjZVRyZWVJdGVtSGFuZGxlcykge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSXRlbSA9IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudChzb3VyY2VIYW5kbGUpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbkl0ZW0pIHtcblx0XHRcdFx0ZXh0ZW5zaW9uVHJlZUl0ZW1zLnB1c2goZXh0ZW5zaW9uSXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9kbmRDb250cm9sbGVyPy5oYW5kbGVEcmFnIHx8IChleHRlbnNpb25UcmVlSXRlbXMubGVuZ3RoID09PSAwKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9kbmRDb250cm9sbGVyLmhhbmRsZURyYWcoZXh0ZW5zaW9uVHJlZUl0ZW1zLCB0cmVlRGF0YVRyYW5zZmVyLCB0b2tlbik7XG5cdFx0cmV0dXJuIHRyZWVEYXRhVHJhbnNmZXI7XG5cdH1cblxuXHRnZXQgaGFzSGFuZGxlRHJhZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9kbmRDb250cm9sbGVyPy5oYW5kbGVEcmFnO1xuXHR9XG5cblx0YXN5bmMgb25Ecm9wKHRyZWVEYXRhVHJhbnNmZXI6IHZzY29kZS5EYXRhVHJhbnNmZXIsIHRhcmdldEhhbmRsZU9yTm9kZTogVHJlZUl0ZW1IYW5kbGUgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRhcmdldEhhbmRsZU9yTm9kZSA/IHRoaXMuZ2V0RXh0ZW5zaW9uRWxlbWVudCh0YXJnZXRIYW5kbGVPck5vZGUpIDogdW5kZWZpbmVkO1xuXHRcdGlmICgoIXRhcmdldCAmJiB0YXJnZXRIYW5kbGVPck5vZGUpIHx8ICF0aGlzLl9kbmRDb250cm9sbGVyPy5oYW5kbGVEcm9wKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiBhc1Byb21pc2UoKCkgPT4gdGhpcy5fZG5kQ29udHJvbGxlcj8uaGFuZGxlRHJvcFxuXHRcdFx0PyB0aGlzLl9kbmRDb250cm9sbGVyLmhhbmRsZURyb3AodGFyZ2V0LCB0cmVlRGF0YVRyYW5zZmVyLCB0b2tlbilcblx0XHRcdDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdGdldCBoYXNSZXNvbHZlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2RhdGFQcm92aWRlci5yZXNvbHZlVHJlZUl0ZW07XG5cdH1cblxuXHRhc3luYyByZXNvbHZlVHJlZUl0ZW0odHJlZUl0ZW1IYW5kbGU6IHN0cmluZywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRyZWVJdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9kYXRhUHJvdmlkZXIucmVzb2x2ZVRyZWVJdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9lbGVtZW50cy5nZXQodHJlZUl0ZW1IYW5kbGUpO1xuXHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRjb25zdCBub2RlID0gdGhpcy5fbm9kZXMuZ2V0KGVsZW1lbnQpO1xuXHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZSA9IGF3YWl0IHRoaXMuX2RhdGFQcm92aWRlci5yZXNvbHZlVHJlZUl0ZW0obm9kZS5leHRlbnNpb25JdGVtLCBlbGVtZW50LCB0b2tlbikgPz8gbm9kZS5leHRlbnNpb25JdGVtO1xuXHRcdFx0XHR0aGlzLl92YWxpZGF0ZVRyZWVJdGVtKHJlc29sdmUpO1xuXHRcdFx0XHQvLyBSZXNvbHZhYmxlIGVsZW1lbnRzLiBDdXJyZW50bHkgb25seSB0b29sdGlwIGFuZCBjb21tYW5kLlxuXHRcdFx0XHRub2RlLml0ZW0udG9vbHRpcCA9IHRoaXMuX2dldFRvb2x0aXAocmVzb2x2ZS50b29sdGlwKTtcblx0XHRcdFx0bm9kZS5pdGVtLmNvbW1hbmQgPSB0aGlzLl9nZXRDb21tYW5kKG5vZGUuZGlzcG9zYWJsZVN0b3JlLCByZXNvbHZlLmNvbW1hbmQpO1xuXHRcdFx0XHRyZXR1cm4gbm9kZS5pdGVtO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlVW5rbm93blBhcmVudENoYWluKGVsZW1lbnQ6IFQpOiBQcm9taXNlPFRyZWVOb2RlW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVBhcmVudChlbGVtZW50KVxuXHRcdFx0LnRoZW4oKHBhcmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIXBhcmVudCkge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW10pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlVW5rbm93blBhcmVudENoYWluKHBhcmVudClcblx0XHRcdFx0XHQudGhlbihyZXN1bHQgPT4gdGhpcy5fcmVzb2x2ZVRyZWVOb2RlKHBhcmVudCwgcmVzdWx0W3Jlc3VsdC5sZW5ndGggLSAxXSlcblx0XHRcdFx0XHRcdC50aGVuKHBhcmVudE5vZGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaChwYXJlbnROb2RlKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVBhcmVudChlbGVtZW50OiBUKTogUHJvbWlzZTxUIHwgUm9vdD4ge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9ub2Rlcy5nZXQoZWxlbWVudCk7XG5cdFx0aWYgKG5vZGUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobm9kZS5wYXJlbnQgPyB0aGlzLl9lbGVtZW50cy5nZXQobm9kZS5wYXJlbnQuaXRlbS5oYW5kbGUpIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFzUHJvbWlzZSgoKSA9PiB0aGlzLl9kYXRhUHJvdmlkZXIuZ2V0UGFyZW50IShlbGVtZW50KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVHJlZU5vZGUoZWxlbWVudDogVCwgcGFyZW50PzogVHJlZU5vZGUpOiBQcm9taXNlPFRyZWVOb2RlPiB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuX25vZGVzLmdldChlbGVtZW50KTtcblx0XHRpZiAobm9kZSkge1xuXHRcdFx0cmV0dXJuIG5vZGU7XG5cdFx0fVxuXHRcdGNvbnN0IGV4dFRyZWVJdGVtID0gYXdhaXQgYXNQcm9taXNlKCgpID0+IHRoaXMuX2RhdGFQcm92aWRlci5nZXRUcmVlSXRlbShlbGVtZW50KSk7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fY3JlYXRlSGFuZGxlKGVsZW1lbnQsIGV4dFRyZWVJdGVtLCBwYXJlbnQsIHRydWUpO1xuXHRcdGF3YWl0IHRoaXMuZ2V0Q2hpbGRyZW4ocGFyZW50ID8gcGFyZW50Lml0ZW0uaGFuZGxlIDogdW5kZWZpbmVkKTtcblx0XHRjb25zdCBjYWNoZWRFbGVtZW50ID0gdGhpcy5nZXRFeHRlbnNpb25FbGVtZW50KGhhbmRsZSk7XG5cdFx0aWYgKGNhY2hlZEVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9ub2Rlcy5nZXQoY2FjaGVkRWxlbWVudCk7XG5cdFx0XHRpZiAobm9kZSkge1xuXHRcdFx0XHRyZXR1cm4gbm9kZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1RyZWVWaWV3OiR7dGhpcy5fdmlld0lkfV0gRmFpbGVkIHRvIHJlc29sdmUgdHJlZSBub2RlIGZvciBlbGVtZW50ICR7aGFuZGxlfWApO1xuXHRcdHRoaXMuX3Byb3h5LiRsb2dSZXNvbHZlVHJlZU5vZGVGYWlsdXJlKHRoaXMuX2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIHRyZWUgaXRlbSBmb3IgZWxlbWVudCAke2hhbmRsZX0gZnJvbSBleHRlbnNpb24gJHt0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX1gKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENoaWxkcmVuTm9kZXMocGFyZW50Tm9kZU9ySGFuZGxlOiBUcmVlTm9kZSB8IFRyZWVJdGVtSGFuZGxlIHwgUm9vdCk6IFRyZWVOb2RlW10gfCB1bmRlZmluZWQge1xuXHRcdGlmIChwYXJlbnROb2RlT3JIYW5kbGUpIHtcblx0XHRcdGxldCBwYXJlbnROb2RlOiBUcmVlTm9kZSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0eXBlb2YgcGFyZW50Tm9kZU9ySGFuZGxlID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBwYXJlbnRFbGVtZW50ID0gdGhpcy5nZXRFeHRlbnNpb25FbGVtZW50KHBhcmVudE5vZGVPckhhbmRsZSk7XG5cdFx0XHRcdHBhcmVudE5vZGUgPSBwYXJlbnRFbGVtZW50ID8gdGhpcy5fbm9kZXMuZ2V0KHBhcmVudEVsZW1lbnQpIDogdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGFyZW50Tm9kZSA9IHBhcmVudE5vZGVPckhhbmRsZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJlbnROb2RlID8gcGFyZW50Tm9kZS5jaGlsZHJlbiB8fCB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yb290cztcblx0fVxuXG5cdHByaXZhdGUgX2dldEZldGNoS2V5KHBhcmVudEVsZW1lbnQ/OiBUKTogVCB8IHR5cGVvZiBFeHRIb3N0VHJlZVZpZXcuUk9PVF9GRVRDSF9LRVkge1xuXHRcdHJldHVybiBwYXJlbnRFbGVtZW50ID8/IEV4dEhvc3RUcmVlVmlldy5ST09UX0ZFVENIX0tFWTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoQ2hpbGRyZW5Ob2RlcyhwYXJlbnRFbGVtZW50PzogVCk6IFByb21pc2U8VHJlZU5vZGVbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIGNsZWFyIGNoaWxkcmVuIGNhY2hlXG5cdFx0dGhpcy5fYWRkQ2hpbGRyZW5Ub0NsZWFyKHBhcmVudEVsZW1lbnQpO1xuXHRcdGNvbnN0IGZldGNoS2V5ID0gdGhpcy5fZ2V0RmV0Y2hLZXkocGFyZW50RWxlbWVudCk7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gKyt0aGlzLl9nbG9iYWxGZXRjaFRva2VuQ291bnRlcjtcblx0XHR0aGlzLl9jaGlsZHJlbkZldGNoVG9rZW5zLnNldChmZXRjaEtleSwgcmVxdWVzdElkKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlLnRva2VuKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBlbGVtZW50cyA9IGF3YWl0IHRoaXMuX2RhdGFQcm92aWRlci5nZXRDaGlsZHJlbihwYXJlbnRFbGVtZW50KTtcblx0XHRcdGlmICh0aGlzLl9jaGlsZHJlbkZldGNoVG9rZW5zLmdldChmZXRjaEtleSkgIT09IHJlcXVlc3RJZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcGFyZW50Tm9kZSA9IHBhcmVudEVsZW1lbnQgPyB0aGlzLl9ub2Rlcy5nZXQocGFyZW50RWxlbWVudCkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29hbGVzY2VkRWxlbWVudHMgPSBjb2FsZXNjZShlbGVtZW50cyB8fCBbXSk7XG5cdFx0XHRjb25zdCB0cmVlSXRlbXMgPSBhd2FpdCBQcm9taXNlLmFsbChjb2FsZXNjZShjb2FsZXNjZWRFbGVtZW50cykubWFwKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZGF0YVByb3ZpZGVyLmdldFRyZWVJdGVtKGVsZW1lbnQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0aWYgKHRoaXMuX2NoaWxkcmVuRmV0Y2hUb2tlbnMuZ2V0KGZldGNoS2V5KSAhPT0gcmVxdWVzdElkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNyZWF0ZUFuZFJlZ2lzdGVyVHJlZU5vZGVzIGFkZHMgdGhlIG5vZGVzIHRvIGEgY2FjaGUuIFRoaXMgbXVzdCBiZSBkb25lIHN5bmMgc28gdGhhdCB0aGV5IGdldCBhZGRlZCBpbiB0aGUgY29ycmVjdCBvcmRlci5cblx0XHRcdGNvbnN0IGl0ZW1zID0gdHJlZUl0ZW1zLm1hcCgoaXRlbSwgaW5kZXgpID0+IGl0ZW0gPyB0aGlzLl9jcmVhdGVBbmRSZWdpc3RlclRyZWVOb2RlKGNvYWxlc2NlZEVsZW1lbnRzW2luZGV4XSwgaXRlbSwgcGFyZW50Tm9kZSkgOiBudWxsKTtcblx0XHRcdGlmICh0aGlzLl9jaGlsZHJlbkZldGNoVG9rZW5zLmdldChmZXRjaEtleSkgIT09IHJlcXVlc3RJZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY29hbGVzY2UoaXRlbXMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRwcml2YXRlIF9yZWZyZXNoKGVsZW1lbnRzOiAoVCB8IFJvb3QpW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoYXNSb290ID0gZWxlbWVudHMuc29tZShlbGVtZW50ID0+ICFlbGVtZW50KTtcblx0XHRpZiAoaGFzUm9vdCkge1xuXHRcdFx0Ly8gQ2FuY2VsIGFueSBwZW5kaW5nIGNoaWxkcmVuIGZldGNoZXNcblx0XHRcdHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UuZGlzcG9zZSh0cnVlKTtcblx0XHRcdHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdFx0dGhpcy5fYWRkQ2hpbGRyZW5Ub0NsZWFyKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJHJlZnJlc2godGhpcy5fdmlld0lkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaGFuZGxlc1RvUmVmcmVzaCA9IHRoaXMuX2dldEhhbmRsZXNUb1JlZnJlc2goPFRbXT5lbGVtZW50cyk7XG5cdFx0XHRpZiAoaGFuZGxlc1RvUmVmcmVzaC5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlZnJlc2hIYW5kbGVzKGhhbmRsZXNUb1JlZnJlc2gpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRIYW5kbGVzVG9SZWZyZXNoKGVsZW1lbnRzOiBUW10pOiBUcmVlSXRlbUhhbmRsZVtdIHtcblx0XHRjb25zdCBlbGVtZW50c1RvVXBkYXRlID0gbmV3IFNldDxUcmVlSXRlbUhhbmRsZT4oKTtcblx0XHRjb25zdCBlbGVtZW50Tm9kZXMgPSBlbGVtZW50cy5tYXAoZWxlbWVudCA9PiB0aGlzLl9ub2Rlcy5nZXQoZWxlbWVudCkpO1xuXHRcdGZvciAoY29uc3QgZWxlbWVudE5vZGUgb2YgZWxlbWVudE5vZGVzKSB7XG5cdFx0XHRpZiAoZWxlbWVudE5vZGUgJiYgIWVsZW1lbnRzVG9VcGRhdGUuaGFzKGVsZW1lbnROb2RlLml0ZW0uaGFuZGxlKSkge1xuXHRcdFx0XHQvLyBjaGVjayBpZiBhbiBhbmNlc3RvciBvZiBleHRFbGVtZW50IGlzIGFscmVhZHkgaW4gdGhlIGVsZW1lbnRzIGxpc3Rcblx0XHRcdFx0bGV0IGN1cnJlbnROb2RlOiBUcmVlTm9kZSB8IHVuZGVmaW5lZCA9IGVsZW1lbnROb2RlO1xuXHRcdFx0XHR3aGlsZSAoY3VycmVudE5vZGUgJiYgY3VycmVudE5vZGUucGFyZW50ICYmIGVsZW1lbnROb2Rlcy5maW5kSW5kZXgobm9kZSA9PiBjdXJyZW50Tm9kZSAmJiBjdXJyZW50Tm9kZS5wYXJlbnQgJiYgbm9kZSAmJiBub2RlLml0ZW0uaGFuZGxlID09PSBjdXJyZW50Tm9kZS5wYXJlbnQuaXRlbS5oYW5kbGUpID09PSAtMSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcmVudEVsZW1lbnQ6IFQgfCB1bmRlZmluZWQgPSB0aGlzLl9lbGVtZW50cy5nZXQoY3VycmVudE5vZGUucGFyZW50Lml0ZW0uaGFuZGxlKTtcblx0XHRcdFx0XHRjdXJyZW50Tm9kZSA9IHBhcmVudEVsZW1lbnQgPyB0aGlzLl9ub2Rlcy5nZXQocGFyZW50RWxlbWVudCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGN1cnJlbnROb2RlICYmICFjdXJyZW50Tm9kZS5wYXJlbnQpIHtcblx0XHRcdFx0XHRlbGVtZW50c1RvVXBkYXRlLmFkZChlbGVtZW50Tm9kZS5pdGVtLmhhbmRsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGVzVG9VcGRhdGU6IFRyZWVJdGVtSGFuZGxlW10gPSBbXTtcblx0XHQvLyBUYWtlIG9ubHkgdG9wIGxldmVsIGVsZW1lbnRzXG5cdFx0ZWxlbWVudHNUb1VwZGF0ZS5mb3JFYWNoKChoYW5kbGUpID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9lbGVtZW50cy5nZXQoaGFuZGxlKTtcblx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9ub2Rlcy5nZXQoZWxlbWVudCk7XG5cdFx0XHRcdGlmIChub2RlICYmICghbm9kZS5wYXJlbnQgfHwgIWVsZW1lbnRzVG9VcGRhdGUuaGFzKG5vZGUucGFyZW50Lml0ZW0uaGFuZGxlKSkpIHtcblx0XHRcdFx0XHRoYW5kbGVzVG9VcGRhdGUucHVzaChoYW5kbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gaGFuZGxlc1RvVXBkYXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaEhhbmRsZXMoaXRlbUhhbmRsZXM6IFRyZWVJdGVtSGFuZGxlW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpdGVtc1RvUmVmcmVzaDogeyBbdHJlZUl0ZW1IYW5kbGU6IHN0cmluZ106IElUcmVlSXRlbSB9ID0ge307XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKGl0ZW1IYW5kbGVzLm1hcCh0cmVlSXRlbUhhbmRsZSA9PlxuXHRcdFx0dGhpcy5fcmVmcmVzaE5vZGUodHJlZUl0ZW1IYW5kbGUpXG5cdFx0XHRcdC50aGVuKG5vZGUgPT4ge1xuXHRcdFx0XHRcdGlmIChub2RlKSB7XG5cdFx0XHRcdFx0XHRpdGVtc1RvUmVmcmVzaFt0cmVlSXRlbUhhbmRsZV0gPSBub2RlLml0ZW07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSkpXG5cdFx0XHQudGhlbigoKSA9PiBPYmplY3Qua2V5cyhpdGVtc1RvUmVmcmVzaCkubGVuZ3RoID8gdGhpcy5fcHJveHkuJHJlZnJlc2godGhpcy5fdmlld0lkLCBpdGVtc1RvUmVmcmVzaCkgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaE5vZGUodHJlZUl0ZW1IYW5kbGU6IFRyZWVJdGVtSGFuZGxlKTogUHJvbWlzZTxUcmVlTm9kZSB8IG51bGw+IHtcblx0XHRjb25zdCBleHRFbGVtZW50ID0gdGhpcy5nZXRFeHRlbnNpb25FbGVtZW50KHRyZWVJdGVtSGFuZGxlKTtcblx0XHRpZiAoZXh0RWxlbWVudCkge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9ub2Rlcy5nZXQoZXh0RWxlbWVudCk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0dGhpcy5fYWRkQ2hpbGRyZW5Ub0NsZWFyKGV4dEVsZW1lbnQpOyAvLyBjbGVhciBjaGlsZHJlbiBjYWNoZVxuXHRcdFx0XHRyZXR1cm4gYXNQcm9taXNlKCgpID0+IHRoaXMuX2RhdGFQcm92aWRlci5nZXRUcmVlSXRlbShleHRFbGVtZW50KSlcblx0XHRcdFx0XHQudGhlbihleHRUcmVlSXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZXh0VHJlZUl0ZW0pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3Tm9kZSA9IHRoaXMuX2NyZWF0ZVRyZWVOb2RlKGV4dEVsZW1lbnQsIGV4dFRyZWVJdGVtLCBleGlzdGluZy5wYXJlbnQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl91cGRhdGVOb2RlQ2FjaGUoZXh0RWxlbWVudCwgbmV3Tm9kZSwgZXhpc3RpbmcsIGV4aXN0aW5nLnBhcmVudCk7XG5cdFx0XHRcdFx0XHRcdGV4aXN0aW5nLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIG5ld05vZGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUFuZFJlZ2lzdGVyVHJlZU5vZGUoZWxlbWVudDogVCwgZXh0VHJlZUl0ZW06IHZzY29kZS5UcmVlSXRlbSwgcGFyZW50Tm9kZTogVHJlZU5vZGUgfCBSb290KTogVHJlZU5vZGUge1xuXHRcdGNvbnN0IGR1cGxpY2F0ZUhhbmRsZSA9IGV4dFRyZWVJdGVtLmlkID8gYCR7RXh0SG9zdFRyZWVWaWV3LklEX0hBTkRMRV9QUkVGSVh9LyR7ZXh0VHJlZUl0ZW0uaWR9YCA6IHVuZGVmaW5lZDtcblx0XHRpZiAoZHVwbGljYXRlSGFuZGxlKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ0VsZW1lbnQgPSB0aGlzLl9lbGVtZW50cy5nZXQoZHVwbGljYXRlSGFuZGxlKTtcblx0XHRcdGlmIChleGlzdGluZ0VsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmdOb2RlID0gdGhpcy5fbm9kZXMuZ2V0KGV4aXN0aW5nRWxlbWVudCk7XG5cdFx0XHRcdGlmIChleGlzdGluZ0VsZW1lbnQgIT09IGVsZW1lbnQpIHtcblx0XHRcdFx0XHQvLyBBIGRpZmZlcmVudCBlbGVtZW50IG9iamVjdCB3YXMgcmVnaXN0ZXJlZCB3aXRoIHRoZSBzYW1lIElELlxuXHRcdFx0XHRcdC8vIFRoaXMgY2FuIGhhcHBlbiBkdXJpbmcgY29uY3VycmVudCB0cmVlIG9wZXJhdGlvbnMgKGUuZy4sIHRyZWVcblx0XHRcdFx0XHQvLyBiZWluZyBzd2l0Y2hlZCB0byB3aGlsZSBkYXRhIGlzIHVwZGF0ZWQpLiBDbGVhbiB1cCB0aGUgc3RhbGVcblx0XHRcdFx0XHQvLyBlbGVtZW50IHJlZmVyZW5jZSBiZWZvcmUgcmUtcmVnaXN0ZXJpbmcgd2l0aCB0aGUgbmV3IG9uZS5cblx0XHRcdFx0XHR0aGlzLl9ub2Rlcy5kZWxldGUoZXhpc3RpbmdFbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXhpc3RpbmdOb2RlKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3Tm9kZSA9IHRoaXMuX2NyZWF0ZVRyZWVOb2RlKGVsZW1lbnQsIGV4dFRyZWVJdGVtLCBwYXJlbnROb2RlKTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVOb2RlQ2FjaGUoZWxlbWVudCwgbmV3Tm9kZSwgZXhpc3RpbmdOb2RlLCBwYXJlbnROb2RlKTtcblx0XHRcdFx0XHRleGlzdGluZ05vZGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiBuZXdOb2RlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLl9jcmVhdGVUcmVlTm9kZShlbGVtZW50LCBleHRUcmVlSXRlbSwgcGFyZW50Tm9kZSk7XG5cdFx0dGhpcy5fYWRkTm9kZVRvQ2FjaGUoZWxlbWVudCwgbm9kZSk7XG5cdFx0dGhpcy5fYWRkTm9kZVRvUGFyZW50Q2FjaGUobm9kZSwgcGFyZW50Tm9kZSk7XG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUb29sdGlwKHRvb2x0aXA/OiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcpOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChleHRIb3N0VHlwZXMuTWFya2Rvd25TdHJpbmcuaXNNYXJrZG93blN0cmluZyh0b29sdGlwKSkge1xuXHRcdFx0cmV0dXJuIE1hcmtkb3duU3RyaW5nLmZyb20odG9vbHRpcCk7XG5cdFx0fVxuXHRcdHJldHVybiB0b29sdGlwO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29tbWFuZChkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUsIGNvbW1hbmQ/OiB2c2NvZGUuQ29tbWFuZCk6IFRyZWVDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gY29tbWFuZCA/IHsgLi4udGhpcy5fY29tbWFuZHMudG9JbnRlcm5hbChjb21tYW5kLCBkaXNwb3NhYmxlKSwgb3JpZ2luYWxJZDogY29tbWFuZC5jb21tYW5kIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDaGVja2JveChleHRlbnNpb25UcmVlSXRlbTogdnNjb2RlLlRyZWVJdGVtKTogSVRyZWVJdGVtQ2hlY2tib3hTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGV4dGVuc2lvblRyZWVJdGVtLmNoZWNrYm94U3RhdGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IGNoZWNrYm94U3RhdGU6IGV4dEhvc3RUeXBlcy5UcmVlSXRlbUNoZWNrYm94U3RhdGU7XG5cdFx0bGV0IHRvb2x0aXA6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uOiBJQWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgZXh0ZW5zaW9uVHJlZUl0ZW0uY2hlY2tib3hTdGF0ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNoZWNrYm94U3RhdGUgPSBleHRlbnNpb25UcmVlSXRlbS5jaGVja2JveFN0YXRlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjaGVja2JveFN0YXRlID0gZXh0ZW5zaW9uVHJlZUl0ZW0uY2hlY2tib3hTdGF0ZS5zdGF0ZTtcblx0XHRcdHRvb2x0aXAgPSBleHRlbnNpb25UcmVlSXRlbS5jaGVja2JveFN0YXRlLnRvb2x0aXA7XG5cdFx0XHRhY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24gPSBleHRlbnNpb25UcmVlSXRlbS5jaGVja2JveFN0YXRlLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHsgaXNDaGVja2VkOiBjaGVja2JveFN0YXRlID09PSBleHRIb3N0VHlwZXMuVHJlZUl0ZW1DaGVja2JveFN0YXRlLkNoZWNrZWQsIHRvb2x0aXAsIGFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVUcmVlSXRlbShleHRlbnNpb25UcmVlSXRlbTogdnNjb2RlLlRyZWVJdGVtKSB7XG5cdFx0aWYgKCFleHRIb3N0VHlwZXMuVHJlZUl0ZW0uaXNUcmVlSXRlbShleHRlbnNpb25UcmVlSXRlbSwgdGhpcy5fZXh0ZW5zaW9uKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBFeHRlbnNpb24gJHt0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0gaGFzIHByb3ZpZGVkIGFuIGludmFsaWQgdHJlZSBpdGVtLmApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRyZWVOb2RlKGVsZW1lbnQ6IFQsIGV4dGVuc2lvblRyZWVJdGVtOiB2c2NvZGUuVHJlZUl0ZW0sIHBhcmVudDogVHJlZU5vZGUgfCBSb290KTogVHJlZU5vZGUge1xuXHRcdHRoaXMuX3ZhbGlkYXRlVHJlZUl0ZW0oZXh0ZW5zaW9uVHJlZUl0ZW0pO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fY3JlYXRlSGFuZGxlKGVsZW1lbnQsIGV4dGVuc2lvblRyZWVJdGVtLCBwYXJlbnQpO1xuXHRcdGNvbnN0IGljb24gPSB0aGlzLl9nZXRMaWdodEljb25QYXRoKGV4dGVuc2lvblRyZWVJdGVtKTtcblx0XHRjb25zdCBpdGVtOiBJVHJlZUl0ZW0gPSB7XG5cdFx0XHRoYW5kbGUsXG5cdFx0XHRwYXJlbnRIYW5kbGU6IHBhcmVudCA/IHBhcmVudC5pdGVtLmhhbmRsZSA6IHVuZGVmaW5lZCxcblx0XHRcdGxhYmVsOiB0b1RyZWVJdGVtTGFiZWwoZXh0ZW5zaW9uVHJlZUl0ZW0ubGFiZWwsIHRoaXMuX2V4dGVuc2lvbiksXG5cdFx0XHRkZXNjcmlwdGlvbjogZXh0ZW5zaW9uVHJlZUl0ZW0uZGVzY3JpcHRpb24sXG5cdFx0XHRyZXNvdXJjZVVyaTogZXh0ZW5zaW9uVHJlZUl0ZW0ucmVzb3VyY2VVcmksXG5cdFx0XHR0b29sdGlwOiB0aGlzLl9nZXRUb29sdGlwKGV4dGVuc2lvblRyZWVJdGVtLnRvb2x0aXApLFxuXHRcdFx0Y29tbWFuZDogdGhpcy5fZ2V0Q29tbWFuZChkaXNwb3NhYmxlU3RvcmUsIGV4dGVuc2lvblRyZWVJdGVtLmNvbW1hbmQpLFxuXHRcdFx0Y29udGV4dFZhbHVlOiBleHRlbnNpb25UcmVlSXRlbS5jb250ZXh0VmFsdWUsXG5cdFx0XHRpY29uLFxuXHRcdFx0aWNvbkRhcms6IHRoaXMuX2dldERhcmtJY29uUGF0aChleHRlbnNpb25UcmVlSXRlbSkgfHwgaWNvbixcblx0XHRcdHRoZW1lSWNvbjogdGhpcy5fZ2V0VGhlbWVJY29uKGV4dGVuc2lvblRyZWVJdGVtKSxcblx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IGlzVW5kZWZpbmVkT3JOdWxsKGV4dGVuc2lvblRyZWVJdGVtLmNvbGxhcHNpYmxlU3RhdGUpID8gZXh0SG9zdFR5cGVzLlRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lIDogZXh0ZW5zaW9uVHJlZUl0ZW0uY29sbGFwc2libGVTdGF0ZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbjogZXh0ZW5zaW9uVHJlZUl0ZW0uYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uLFxuXHRcdFx0Y2hlY2tib3g6IHRoaXMuX2dldENoZWNrYm94KGV4dGVuc2lvblRyZWVJdGVtKSxcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGl0ZW0sXG5cdFx0XHRleHRlbnNpb25JdGVtOiBleHRlbnNpb25UcmVlSXRlbSxcblx0XHRcdHBhcmVudCxcblx0XHRcdGNoaWxkcmVuOiB1bmRlZmluZWQsXG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUsXG5cdFx0XHRkaXNwb3NlKCk6IHZvaWQgeyBkaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpOyB9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRoZW1lSWNvbihleHRlbnNpb25UcmVlSXRlbTogdnNjb2RlLlRyZWVJdGVtKTogZXh0SG9zdFR5cGVzLlRoZW1lSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGV4dGVuc2lvblRyZWVJdGVtLmljb25QYXRoIGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLlRoZW1lSWNvbiA/IGV4dGVuc2lvblRyZWVJdGVtLmljb25QYXRoIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlSGFuZGxlKGVsZW1lbnQ6IFQsIHsgaWQsIGxhYmVsLCByZXNvdXJjZVVyaSB9OiB2c2NvZGUuVHJlZUl0ZW0sIHBhcmVudDogVHJlZU5vZGUgfCBSb290LCByZXR1cm5GaXJzdD86IGJvb2xlYW4pOiBUcmVlSXRlbUhhbmRsZSB7XG5cdFx0aWYgKGlkKSB7XG5cdFx0XHRyZXR1cm4gYCR7RXh0SG9zdFRyZWVWaWV3LklEX0hBTkRMRV9QUkVGSVh9LyR7aWR9YDtcblx0XHR9XG5cblx0XHRjb25zdCB0cmVlSXRlbUxhYmVsID0gdG9UcmVlSXRlbUxhYmVsKGxhYmVsLCB0aGlzLl9leHRlbnNpb24pO1xuXHRcdGNvbnN0IHByZWZpeDogc3RyaW5nID0gcGFyZW50ID8gcGFyZW50Lml0ZW0uaGFuZGxlIDogRXh0SG9zdFRyZWVWaWV3LkxBQkVMX0hBTkRMRV9QUkVGSVg7XG5cdFx0bGV0IGxhYmVsVmFsdWUgPSAnJztcblx0XHRpZiAodHJlZUl0ZW1MYWJlbCkge1xuXHRcdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcodHJlZUl0ZW1MYWJlbC5sYWJlbCkpIHtcblx0XHRcdFx0bGFiZWxWYWx1ZSA9IHRyZWVJdGVtTGFiZWwubGFiZWwudmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbFZhbHVlID0gdHJlZUl0ZW1MYWJlbC5sYWJlbDtcblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IGVsZW1lbnRJZCA9IGxhYmVsVmFsdWUgfHwgKHJlc291cmNlVXJpID8gYmFzZW5hbWUocmVzb3VyY2VVcmkpIDogJycpO1xuXHRcdGVsZW1lbnRJZCA9IGVsZW1lbnRJZC5pbmRleE9mKCcvJykgIT09IC0xID8gZWxlbWVudElkLnJlcGxhY2UoJy8nLCAnLy8nKSA6IGVsZW1lbnRJZDtcblx0XHRjb25zdCBleGlzdGluZ0hhbmRsZSA9IHRoaXMuX25vZGVzLmhhcyhlbGVtZW50KSA/IHRoaXMuX25vZGVzLmdldChlbGVtZW50KSEuaXRlbS5oYW5kbGUgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2hpbGRyZW5Ob2RlcyA9ICh0aGlzLl9nZXRDaGlsZHJlbk5vZGVzKHBhcmVudCkgfHwgW10pO1xuXG5cdFx0bGV0IGhhbmRsZTogVHJlZUl0ZW1IYW5kbGU7XG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdGRvIHtcblx0XHRcdGhhbmRsZSA9IGAke3ByZWZpeH0vJHtjb3VudGVyfToke2VsZW1lbnRJZH1gO1xuXHRcdFx0aWYgKHJldHVybkZpcnN0IHx8ICF0aGlzLl9lbGVtZW50cy5oYXMoaGFuZGxlKSB8fCBleGlzdGluZ0hhbmRsZSA9PT0gaGFuZGxlKSB7XG5cdFx0XHRcdC8vIFJldHVybiBmaXJzdCBpZiBhc2tlZCBmb3Igb3Jcblx0XHRcdFx0Ly8gUmV0dXJuIGlmIGhhbmRsZSBkb2VzIG5vdCBleGlzdCBvclxuXHRcdFx0XHQvLyBSZXR1cm4gaWYgaGFuZGxlIGlzIGJlaW5nIHJldXNlZFxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNvdW50ZXIrKztcblx0XHR9IHdoaWxlIChjb3VudGVyIDw9IGNoaWxkcmVuTm9kZXMubGVuZ3RoKTtcblxuXHRcdHJldHVybiBoYW5kbGU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMaWdodEljb25QYXRoKGV4dGVuc2lvblRyZWVJdGVtOiB2c2NvZGUuVHJlZUl0ZW0pOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGlmIChleHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCAmJiAhKGV4dGVuc2lvblRyZWVJdGVtLmljb25QYXRoIGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLlRoZW1lSWNvbikpIHtcblx0XHRcdGlmICh0eXBlb2YgZXh0ZW5zaW9uVHJlZUl0ZW0uaWNvblBhdGggPT09ICdzdHJpbmcnXG5cdFx0XHRcdHx8IFVSSS5pc1VyaShleHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldEljb25QYXRoKGV4dGVuc2lvblRyZWVJdGVtLmljb25QYXRoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9nZXRJY29uUGF0aCgoPHsgbGlnaHQ6IHN0cmluZyB8IFVSSTsgZGFyazogc3RyaW5nIHwgVVJJIH0+ZXh0ZW5zaW9uVHJlZUl0ZW0uaWNvblBhdGgpLmxpZ2h0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldERhcmtJY29uUGF0aChleHRlbnNpb25UcmVlSXRlbTogdnNjb2RlLlRyZWVJdGVtKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZXh0ZW5zaW9uVHJlZUl0ZW0uaWNvblBhdGggJiYgIShleHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5UaGVtZUljb24pICYmICg8eyBsaWdodDogc3RyaW5nIHwgVVJJOyBkYXJrOiBzdHJpbmcgfCBVUkkgfT5leHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCkuZGFyaykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldEljb25QYXRoKCg8eyBsaWdodDogc3RyaW5nIHwgVVJJOyBkYXJrOiBzdHJpbmcgfCBVUkkgfT5leHRlbnNpb25UcmVlSXRlbS5pY29uUGF0aCkuZGFyayk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJY29uUGF0aChpY29uUGF0aDogc3RyaW5nIHwgVVJJKTogVVJJIHtcblx0XHRpZiAoVVJJLmlzVXJpKGljb25QYXRoKSkge1xuXHRcdFx0cmV0dXJuIGljb25QYXRoO1xuXHRcdH1cblx0XHRyZXR1cm4gVVJJLmZpbGUoaWNvblBhdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkTm9kZVRvQ2FjaGUoZWxlbWVudDogVCwgbm9kZTogVHJlZU5vZGUpOiB2b2lkIHtcblx0XHR0aGlzLl9lbGVtZW50cy5zZXQobm9kZS5pdGVtLmhhbmRsZSwgZWxlbWVudCk7XG5cdFx0dGhpcy5fbm9kZXMuc2V0KGVsZW1lbnQsIG5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTm9kZUNhY2hlKGVsZW1lbnQ6IFQsIG5ld05vZGU6IFRyZWVOb2RlLCBleGlzdGluZzogVHJlZU5vZGUsIHBhcmVudE5vZGU6IFRyZWVOb2RlIHwgUm9vdCk6IHZvaWQge1xuXHRcdC8vIFJlbW92ZSBmcm9tIHRoZSBjYWNoZVxuXHRcdHRoaXMuX2VsZW1lbnRzLmRlbGV0ZShuZXdOb2RlLml0ZW0uaGFuZGxlKTtcblx0XHR0aGlzLl9ub2Rlcy5kZWxldGUoZWxlbWVudCk7XG5cdFx0aWYgKG5ld05vZGUuaXRlbS5oYW5kbGUgIT09IGV4aXN0aW5nLml0ZW0uaGFuZGxlKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5kZWxldGUoZXhpc3RpbmcuaXRlbS5oYW5kbGUpO1xuXHRcdH1cblxuXHRcdC8vIEFkZCB0aGUgbmV3IG5vZGUgdG8gdGhlIGNhY2hlXG5cdFx0dGhpcy5fYWRkTm9kZVRvQ2FjaGUoZWxlbWVudCwgbmV3Tm9kZSk7XG5cblx0XHQvLyBSZXBsYWNlIHRoZSBub2RlIGluIHBhcmVudCdzIGNoaWxkcmVuIG5vZGVzXG5cdFx0Y29uc3QgY2hpbGRyZW5Ob2RlcyA9ICh0aGlzLl9nZXRDaGlsZHJlbk5vZGVzKHBhcmVudE5vZGUpIHx8IFtdKTtcblx0XHRjb25zdCBjaGlsZE5vZGUgPSBjaGlsZHJlbk5vZGVzLmZpbHRlcihjID0+IGMuaXRlbS5oYW5kbGUgPT09IGV4aXN0aW5nLml0ZW0uaGFuZGxlKVswXTtcblx0XHRpZiAoY2hpbGROb2RlKSB7XG5cdFx0XHRjaGlsZHJlbk5vZGVzLnNwbGljZShjaGlsZHJlbk5vZGVzLmluZGV4T2YoY2hpbGROb2RlKSwgMSwgbmV3Tm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWRkTm9kZVRvUGFyZW50Q2FjaGUobm9kZTogVHJlZU5vZGUsIHBhcmVudE5vZGU6IFRyZWVOb2RlIHwgUm9vdCk6IHZvaWQge1xuXHRcdGlmIChwYXJlbnROb2RlKSB7XG5cdFx0XHRpZiAoIXBhcmVudE5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0cGFyZW50Tm9kZS5jaGlsZHJlbiA9IFtdO1xuXHRcdFx0fVxuXHRcdFx0cGFyZW50Tm9kZS5jaGlsZHJlbi5wdXNoKG5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIXRoaXMuX3Jvb3RzKSB7XG5cdFx0XHRcdHRoaXMuX3Jvb3RzID0gW107XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yb290cy5wdXNoKG5vZGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZENoaWxkcmVuVG9DbGVhcihwYXJlbnRFbGVtZW50PzogVCk6IHZvaWQge1xuXHRcdGlmIChwYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBub2RlID0gdGhpcy5fbm9kZXMuZ2V0KHBhcmVudEVsZW1lbnQpO1xuXHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0aWYgKG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdHRoaXMuX25vZGVzVG9DbGVhci5hZGQoY2hpbGQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hpbGRFbGVtZW50ID0gdGhpcy5fZWxlbWVudHMuZ2V0KGNoaWxkLml0ZW0uaGFuZGxlKTtcblx0XHRcdFx0XHRcdGlmIChjaGlsZEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fYWRkQ2hpbGRyZW5Ub0NsZWFyKGNoaWxkRWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX25vZGVzLmRlbGV0ZShjaGlsZEVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9lbGVtZW50cy5kZWxldGUoY2hpbGQuaXRlbS5oYW5kbGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRub2RlLmNoaWxkcmVuID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hZGRBbGxUb0NsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWRkQWxsVG9DbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9ub2Rlcy5mb3JFYWNoKG5vZGUgPT4ge1xuXHRcdFx0dGhpcy5fbm9kZXNUb0NsZWFyLmFkZChub2RlKTtcblx0XHR9KTtcblx0XHR0aGlzLl9ub2Rlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2VsZW1lbnRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2hpbGRyZW5GZXRjaFRva2Vucy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJOb2Rlcyhub2RlczogVHJlZU5vZGVbXSk6IHZvaWQge1xuXHRcdGRpc3Bvc2Uobm9kZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdHMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZWxlbWVudHMuY2xlYXIoKTtcblx0XHRkaXNwb3NlKHRoaXMuX25vZGVzLnZhbHVlcygpKTtcblx0XHR0aGlzLl9ub2Rlcy5jbGVhcigpO1xuXHRcdGRpc3Bvc2UodGhpcy5fbm9kZXNUb0NsZWFyKTtcblx0XHR0aGlzLl9ub2Rlc1RvQ2xlYXIuY2xlYXIoKTtcblx0XHR0aGlzLl9jaGlsZHJlbkZldGNoVG9rZW5zLmNsZWFyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMuX2NsZWFyQWxsKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBVztBQUNwQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJBQWlCLGVBQTRCO0FBRWxFLFNBQXVJLHVCQUF1QjtBQUU5SixTQUFTLGlCQUFpQjtBQUMxQixZQUFZLGtCQUFrQjtBQUM5QixTQUFTLG1CQUFtQixnQkFBZ0I7QUFDNUMsU0FBUyxRQUFRLFVBQVUsZ0JBQWdCO0FBQzNDLFNBQXNCLGdCQUFnQjtBQUV0QyxTQUFTLGdCQUFnQixXQUFXLG9CQUFvQjtBQUN4RCxTQUEwQix3QkFBd0I7QUFDbEQsU0FBNEIsK0JBQStCO0FBQzNELFNBQStCLDJCQUEyQjtBQUUxRCxTQUFTLCtCQUErQjtBQUl4QyxTQUFTLGdCQUFnQixPQUFZLFdBQThEO0FBQ2xHLE1BQUksU0FBUyxLQUFLLEdBQUc7QUFDcEIsV0FBTyxFQUFFLE1BQU07QUFBQSxFQUNoQjtBQUVBLE1BQUksU0FBUyxPQUFPLFVBQVUsWUFBWSxNQUFNLE9BQU87QUFDdEQsUUFBSSxhQUE2QztBQUNqRCxRQUFJLE1BQU0sUUFBUSxNQUFNLFVBQVUsR0FBRztBQUNwQyxtQkFBa0MsTUFBTSxXQUFZLFFBQVEsZUFBYSxVQUFVLFdBQVcsS0FBSyxPQUFPLFVBQVUsQ0FBQyxNQUFNLFlBQVksT0FBTyxVQUFVLENBQUMsTUFBTSxTQUFTO0FBQ3hLLG1CQUFhLFdBQVcsU0FBUyxhQUFhO0FBQUEsSUFDL0M7QUFDQSxRQUFJLFNBQVMsTUFBTSxLQUFLLEdBQUc7QUFDMUIsYUFBTyxFQUFFLE9BQU8sTUFBTSxPQUFPLFdBQVc7QUFBQSxJQUN6QyxXQUFXLGFBQWEsZUFBZSxpQkFBaUIsTUFBTSxLQUFLLEdBQUc7QUFDckUsOEJBQXdCLFdBQVcsdUJBQXVCO0FBQzFELGFBQU8s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
