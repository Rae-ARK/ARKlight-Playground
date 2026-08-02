import { ElementsDragAndDropData } from "../list/listView.js";
import { ComposedTreeDelegate, TreeFindMode, FindFilter, FindController } from "./abstractTree.js";
import { getVisibleState, isFilterResult } from "./indexTreeModel.js";
import { CompressibleObjectTree, ObjectTree } from "./objectTree.js";
import { ObjectTreeElementCollapseState, TreeError, TreeVisibility, WeakMapper } from "./tree.js";
import { createCancelablePromise, Promises, ThrottledDelayer, timeout } from "../../../common/async.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { isCancellationError, onUnexpectedError } from "../../../common/errors.js";
import { Emitter, Event } from "../../../common/event.js";
import { Iterable } from "../../../common/iterator.js";
import { DisposableStore, dispose, toDisposable } from "../../../common/lifecycle.js";
import { isIterable } from "../../../common/types.js";
import { CancellationTokenSource } from "../../../common/cancellation.js";
import { FuzzyScore } from "../../../common/filters.js";
import { insertInto, splice } from "../../../common/arrays.js";
import { localize } from "../../../../nls.js";
function createAsyncDataTreeNode(props) {
  return {
    ...props,
    children: [],
    refreshPromise: void 0,
    stale: true,
    slow: false,
    forceExpanded: false
  };
}
function isAncestor(ancestor, descendant) {
  if (!descendant.parent) {
    return false;
  } else if (descendant.parent === ancestor) {
    return true;
  } else {
    return isAncestor(ancestor, descendant.parent);
  }
}
function intersects(node, other) {
  return node === other || isAncestor(node, other) || isAncestor(other, node);
}
class AsyncDataTreeNodeWrapper {
  constructor(node) {
    this.node = node;
  }
  get element() {
    return this.node.element.element;
  }
  get children() {
    return this.node.children.map((node) => new AsyncDataTreeNodeWrapper(node));
  }
  get depth() {
    return this.node.depth;
  }
  get visibleChildrenCount() {
    return this.node.visibleChildrenCount;
  }
  get visibleChildIndex() {
    return this.node.visibleChildIndex;
  }
  get collapsible() {
    return this.node.collapsible;
  }
  get collapsed() {
    return this.node.collapsed;
  }
  get visible() {
    return this.node.visible;
  }
  get filterData() {
    return this.node.filterData;
  }
}
class AsyncDataTreeRenderer {
  constructor(renderer, nodeMapper, onDidChangeTwistieState) {
    this.renderer = renderer;
    this.nodeMapper = nodeMapper;
    this.onDidChangeTwistieState = onDidChangeTwistieState;
    this.renderedNodes = /* @__PURE__ */ new Map();
    this.templateId = renderer.templateId;
  }
  renderTemplate(container) {
    const templateData = this.renderer.renderTemplate(container);
    return { templateData };
  }
  renderElement(node, index, templateData, details) {
    this.renderer.renderElement(this.nodeMapper.map(node), index, templateData.templateData, details);
  }
  renderTwistie(element, twistieElement) {
    if (element.slow) {
      twistieElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
      return true;
    } else {
      twistieElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
      return false;
    }
  }
  disposeElement(node, index, templateData, details) {
    this.renderer.disposeElement?.(this.nodeMapper.map(node), index, templateData.templateData, details);
  }
  disposeTemplate(templateData) {
    this.renderer.disposeTemplate(templateData.templateData);
  }
  dispose() {
    this.renderedNodes.clear();
  }
}
function asTreeEvent(e) {
  return {
    browserEvent: e.browserEvent,
    elements: e.elements.map((e2) => e2.element)
  };
}
function asTreeMouseEvent(e) {
  return {
    browserEvent: e.browserEvent,
    element: e.element && e.element.element,
    target: e.target
  };
}
function asTreeContextMenuEvent(e) {
  return {
    browserEvent: e.browserEvent,
    element: e.element && e.element.element,
    anchor: e.anchor,
    isStickyScroll: e.isStickyScroll
  };
}
class AsyncDataTreeElementsDragAndDropData extends ElementsDragAndDropData {
  constructor(data) {
    super(data.elements.map((node) => node.element));
    this.data = data;
  }
  set context(context) {
    this.data.context = context;
  }
  get context() {
    return this.data.context;
  }
}
function asAsyncDataTreeDragAndDropData(data) {
  if (data instanceof ElementsDragAndDropData) {
    return new AsyncDataTreeElementsDragAndDropData(data);
  }
  return data;
}
class AsyncDataTreeNodeListDragAndDrop {
  constructor(dnd) {
    this.dnd = dnd;
  }
  getDragURI(node) {
    return this.dnd.getDragURI(node.element);
  }
  getDragLabel(nodes, originalEvent) {
    if (this.dnd.getDragLabel) {
      return this.dnd.getDragLabel(nodes.map((node) => node.element), originalEvent);
    }
    return void 0;
  }
  onDragStart(data, originalEvent) {
    this.dnd.onDragStart?.(asAsyncDataTreeDragAndDropData(data), originalEvent);
  }
  onDragOver(data, targetNode, targetIndex, targetSector, originalEvent, raw = true) {
    return this.dnd.onDragOver(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
  }
  drop(data, targetNode, targetIndex, targetSector, originalEvent) {
    this.dnd.drop(asAsyncDataTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
  }
  onDragEnd(originalEvent) {
    this.dnd.onDragEnd?.(originalEvent);
  }
  dispose() {
    this.dnd.dispose();
  }
}
class AsyncFindFilter extends FindFilter {
  constructor(findProvider, keyboardNavigationLabelProvider, filter) {
    super(keyboardNavigationLabelProvider, filter);
    this.findProvider = findProvider;
    this.isFindSessionActive = false;
  }
  filter(element, parentVisibility) {
    const filterResult = super.filter(element, parentVisibility);
    if (!this.isFindSessionActive || this.findMode === TreeFindMode.Highlight || !this.findProvider.isVisible) {
      return filterResult;
    }
    const visibility = isFilterResult(filterResult) ? filterResult.visibility : filterResult;
    if (getVisibleState(visibility) === TreeVisibility.Hidden) {
      return TreeVisibility.Hidden;
    }
    return this.findProvider.isVisible(element) ? filterResult : TreeVisibility.Hidden;
  }
}
class AsyncFindController extends FindController {
  constructor(tree, findProvider, filter, contextViewProvider, options) {
    super(tree, filter, contextViewProvider, options);
    this.findProvider = findProvider;
    this.filter = filter;
    this.activeSession = false;
    this.asyncWorkInProgress = false;
    this.taskQueue = new ThrottledDelayer(250);
    this.disposables.add(toDisposable(async () => {
      if (this.activeSession) {
        await this.findProvider.endSession?.();
      }
    }));
  }
  applyPattern(_pattern) {
    this.renderMessage(false);
    this.activeTokenSource?.cancel();
    this.activeTokenSource = new CancellationTokenSource();
    this.taskQueue.trigger(() => this.applyPatternAsync());
  }
  async applyPatternAsync() {
    const token = this.activeTokenSource?.token;
    if (!token || token.isCancellationRequested) {
      return;
    }
    const pattern = this.pattern;
    if (pattern === "") {
      if (this.activeSession) {
        this.asyncWorkInProgress = true;
        await this.deactivateFindSession();
        this.asyncWorkInProgress = false;
        if (!token.isCancellationRequested) {
          this.filter.reset();
          super.applyPattern("");
        }
      }
      return;
    }
    if (!this.activeSession) {
      this.activateFindSession();
    }
    this.asyncWorkInProgress = true;
    this.activeFindMetadata = void 0;
    const findMetadata = await this.findProvider.find(pattern, { matchType: this.matchType, findMode: this.mode }, token);
    if (token.isCancellationRequested || findMetadata === void 0) {
      return;
    }
    this.asyncWorkInProgress = false;
    this.activeFindMetadata = findMetadata;
    this.filter.reset();
    super.applyPattern(pattern);
    if (findMetadata.warningMessage) {
      this.renderMessage(true, findMetadata.warningMessage);
    }
  }
  activateFindSession() {
    this.activeSession = true;
    this.filter.isFindSessionActive = true;
    this.findProvider.startSession?.();
  }
  async deactivateFindSession() {
    this.activeSession = false;
    this.filter.isFindSessionActive = false;
    await this.findProvider.endSession?.();
  }
  render() {
    if (this.asyncWorkInProgress || !this.activeFindMetadata) {
      return;
    }
    const showNotFound = this.activeFindMetadata.matchCount === 0 && this.pattern.length > 0;
    this.renderMessage(showNotFound);
    if (this.pattern.length) {
      this.alertResults(this.activeFindMetadata.matchCount);
    }
  }
  onDidToggleChange(e) {
    this.toggles.set(e.id, e.isChecked);
    this.filter.findMode = this.mode;
    this.filter.findMatchType = this.matchType;
    this.placeholder = this.mode === TreeFindMode.Filter ? localize("type to filter", "Type to filter") : localize("type to search", "Type to search");
    this.applyPattern(this.pattern);
  }
  shouldAllowFocus(node) {
    return this.shouldFocusWhenNavigating(node);
  }
  shouldFocusWhenNavigating(node) {
    if (!this.activeSession || !this.activeFindMetadata) {
      return true;
    }
    const element = node.element?.element;
    if (element && this.activeFindMetadata.isMatch(element)) {
      return true;
    }
    return !FuzzyScore.isDefault(node.filterData);
  }
}
function asObjectTreeOptions(options) {
  return options && {
    ...options,
    collapseByDefault: true,
    identityProvider: options.identityProvider && {
      getId(el) {
        return options.identityProvider.getId(el.element);
      },
      getGroupId: options.identityProvider.getGroupId ? (el) => {
        return options.identityProvider.getGroupId(el.element);
      } : void 0
    },
    dnd: options.dnd && new AsyncDataTreeNodeListDragAndDrop(options.dnd),
    multipleSelectionController: options.multipleSelectionController && {
      isSelectionSingleChangeEvent(e) {
        return options.multipleSelectionController.isSelectionSingleChangeEvent({ ...e, element: e.element });
      },
      isSelectionRangeChangeEvent(e) {
        return options.multipleSelectionController.isSelectionRangeChangeEvent({ ...e, element: e.element });
      }
    },
    accessibilityProvider: options.accessibilityProvider && {
      ...options.accessibilityProvider,
      getPosInSet: void 0,
      getSetSize: void 0,
      getRole: options.accessibilityProvider.getRole ? (el) => {
        return options.accessibilityProvider.getRole(el.element);
      } : () => "treeitem",
      isChecked: options.accessibilityProvider.isChecked ? (e) => {
        return !!options.accessibilityProvider?.isChecked(e.element);
      } : void 0,
      getAriaLabel(e) {
        return options.accessibilityProvider.getAriaLabel(e.element);
      },
      getWidgetAriaLabel() {
        return options.accessibilityProvider.getWidgetAriaLabel();
      },
      getWidgetRole: options.accessibilityProvider.getWidgetRole ? () => options.accessibilityProvider.getWidgetRole() : () => "tree",
      getAriaLevel: options.accessibilityProvider.getAriaLevel && ((node) => {
        return options.accessibilityProvider.getAriaLevel(node.element);
      }),
      getActiveDescendantId: options.accessibilityProvider.getActiveDescendantId && ((node) => {
        return options.accessibilityProvider.getActiveDescendantId(node.element);
      })
    },
    filter: options.filter && {
      filter(e, parentVisibility) {
        return options.filter.filter(e.element, parentVisibility);
      }
    },
    keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
      ...options.keyboardNavigationLabelProvider,
      getKeyboardNavigationLabel(e) {
        return options.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(e.element);
      }
    },
    sorter: void 0,
    expandOnlyOnTwistieClick: typeof options.expandOnlyOnTwistieClick === "undefined" ? void 0 : typeof options.expandOnlyOnTwistieClick !== "function" ? options.expandOnlyOnTwistieClick : ((e) => options.expandOnlyOnTwistieClick(e.element)),
    twistieAdditionalCssClass: typeof options.twistieAdditionalCssClass === "undefined" ? void 0 : ((e) => options.twistieAdditionalCssClass(e.element)),
    defaultFindVisibility: (e) => {
      if (e.hasChildren && e.stale) {
        return TreeVisibility.Visible;
      } else if (typeof options.defaultFindVisibility === "number") {
        return options.defaultFindVisibility;
      } else if (typeof options.defaultFindVisibility === "undefined") {
        return TreeVisibility.Recurse;
      } else {
        return options.defaultFindVisibility(e.element);
      }
    },
    stickyScrollDelegate: options.stickyScrollDelegate
  };
}
function dfs(node, fn) {
  fn(node);
  node.children.forEach((child) => dfs(child, fn));
}
class AsyncDataTree {
  constructor(user, container, delegate, renderers, dataSource, options = {}) {
    this.user = user;
    this.dataSource = dataSource;
    this.nodes = /* @__PURE__ */ new Map();
    this.subTreeRefreshPromises = /* @__PURE__ */ new Map();
    this.refreshPromises = /* @__PURE__ */ new Map();
    this._onDidRender = new Emitter();
    this._onDidChangeNodeSlowState = new Emitter();
    this.nodeMapper = new WeakMapper((node) => new AsyncDataTreeNodeWrapper(node));
    this.disposables = new DisposableStore();
    this.identityProvider = options.identityProvider;
    this.autoExpandSingleChildren = typeof options.autoExpandSingleChildren === "undefined" ? false : options.autoExpandSingleChildren;
    this.sorter = options.sorter;
    this.getDefaultCollapseState = (e) => options.collapseByDefault ? options.collapseByDefault(e) ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded : void 0;
    let asyncFindEnabled = false;
    let findFilter;
    if (options.findProvider && (options.findWidgetEnabled ?? true) && options.keyboardNavigationLabelProvider && options.contextViewProvider) {
      asyncFindEnabled = true;
      findFilter = new AsyncFindFilter(options.findProvider, options.keyboardNavigationLabelProvider, options.filter);
    }
    this.tree = this.createTree(user, container, delegate, renderers, { ...options, findWidgetEnabled: !asyncFindEnabled, filter: findFilter ?? options.filter });
    this.root = createAsyncDataTreeNode({
      element: void 0,
      parent: null,
      hasChildren: true,
      defaultCollapseState: void 0
    });
    if (this.identityProvider) {
      this.root = {
        ...this.root,
        id: null
      };
    }
    this.nodes.set(null, this.root);
    this.tree.onDidChangeCollapseState(this._onDidChangeCollapseState, this, this.disposables);
    if (asyncFindEnabled) {
      const findOptions = {
        styles: options.findWidgetStyles,
        showNotFoundMessage: options.showNotFoundMessage,
        defaultFindMatchType: options.defaultFindMatchType,
        defaultFindMode: options.defaultFindMode
      };
      this.findController = this.disposables.add(new AsyncFindController(this.tree, options.findProvider, findFilter, this.tree.options.contextViewProvider, findOptions));
      this.focusNavigationFilter = (node) => this.findController.shouldFocusWhenNavigating(node);
      this.onDidChangeFindOpenState = this.findController.onDidChangeOpenState;
      this.onDidChangeFindMode = this.findController.onDidChangeMode;
      this.onDidChangeFindMatchType = this.findController.onDidChangeMatchType;
    } else {
      this.onDidChangeFindOpenState = this.tree.onDidChangeFindOpenState;
      this.onDidChangeFindMode = this.tree.onDidChangeFindMode;
      this.onDidChangeFindMatchType = this.tree.onDidChangeFindMatchType;
    }
  }
  get onDidScroll() {
    return this.tree.onDidScroll;
  }
  get onDidChangeFocus() {
    return Event.map(this.tree.onDidChangeFocus, asTreeEvent);
  }
  get onDidChangeSelection() {
    return Event.map(this.tree.onDidChangeSelection, asTreeEvent);
  }
  get onKeyDown() {
    return this.tree.onKeyDown;
  }
  get onMouseClick() {
    return Event.map(this.tree.onMouseClick, asTreeMouseEvent);
  }
  get onMouseDblClick() {
    return Event.map(this.tree.onMouseDblClick, asTreeMouseEvent);
  }
  get onContextMenu() {
    return Event.map(this.tree.onContextMenu, asTreeContextMenuEvent);
  }
  get onTap() {
    return Event.map(this.tree.onTap, asTreeMouseEvent);
  }
  get onPointer() {
    return Event.map(this.tree.onPointer, asTreeMouseEvent);
  }
  get onDidFocus() {
    return this.tree.onDidFocus;
  }
  get onDidBlur() {
    return this.tree.onDidBlur;
  }
  /**
   * To be used internally only!
   * @deprecated
   */
  get onDidChangeModel() {
    return this.tree.onDidChangeModel;
  }
  get onDidChangeCollapseState() {
    return this.tree.onDidChangeCollapseState;
  }
  get onDidUpdateOptions() {
    return this.tree.onDidUpdateOptions;
  }
  get onDidChangeStickyScrollFocused() {
    return this.tree.onDidChangeStickyScrollFocused;
  }
  get findMode() {
    return this.findController ? this.findController.mode : this.tree.findMode;
  }
  set findMode(mode) {
    this.findController ? this.findController.mode = mode : this.tree.findMode = mode;
  }
  get findMatchType() {
    return this.findController ? this.findController.matchType : this.tree.findMatchType;
  }
  set findMatchType(matchType) {
    this.findController ? this.findController.matchType = matchType : this.tree.findMatchType = matchType;
  }
  get expandOnlyOnTwistieClick() {
    if (typeof this.tree.expandOnlyOnTwistieClick === "boolean") {
      return this.tree.expandOnlyOnTwistieClick;
    }
    const fn = this.tree.expandOnlyOnTwistieClick;
    return (element) => fn(this.nodes.get(element === this.root.element ? null : element) || null);
  }
  get onDidDispose() {
    return this.tree.onDidDispose;
  }
  createTree(user, container, delegate, renderers, options) {
    const objectTreeDelegate = new ComposedTreeDelegate(delegate);
    const objectTreeRenderers = renderers.map((r) => new AsyncDataTreeRenderer(r, this.nodeMapper, this._onDidChangeNodeSlowState.event));
    const objectTreeOptions = asObjectTreeOptions(options) || {};
    return new ObjectTree(user, container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
  }
  updateOptions(optionsUpdate = {}) {
    if (this.findController) {
      if (optionsUpdate.defaultFindMode !== void 0) {
        this.findController.mode = optionsUpdate.defaultFindMode;
      }
      if (optionsUpdate.defaultFindMatchType !== void 0) {
        this.findController.matchType = optionsUpdate.defaultFindMatchType;
      }
    }
    this.tree.updateOptions(optionsUpdate);
  }
  get options() {
    return this.tree.options;
  }
  // Widget
  getHTMLElement() {
    return this.tree.getHTMLElement();
  }
  get contentHeight() {
    return this.tree.contentHeight;
  }
  get contentWidth() {
    return this.tree.contentWidth;
  }
  get onDidChangeContentHeight() {
    return this.tree.onDidChangeContentHeight;
  }
  get onDidChangeContentWidth() {
    return this.tree.onDidChangeContentWidth;
  }
  get scrollTop() {
    return this.tree.scrollTop;
  }
  set scrollTop(scrollTop) {
    this.tree.scrollTop = scrollTop;
  }
  get scrollLeft() {
    return this.tree.scrollLeft;
  }
  set scrollLeft(scrollLeft) {
    this.tree.scrollLeft = scrollLeft;
  }
  get scrollHeight() {
    return this.tree.scrollHeight;
  }
  get renderHeight() {
    return this.tree.renderHeight;
  }
  get lastVisibleElement() {
    return this.tree.lastVisibleElement.element;
  }
  get ariaLabel() {
    return this.tree.ariaLabel;
  }
  set ariaLabel(value) {
    this.tree.ariaLabel = value;
  }
  domFocus() {
    this.tree.domFocus();
  }
  isDOMFocused() {
    return this.tree.isDOMFocused();
  }
  navigate(start) {
    let startNode;
    if (start) {
      startNode = this.getDataNode(start);
    }
    return new AsyncDataTreeNavigator(this.tree.navigate(startNode));
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  style(styles) {
    this.tree.style(styles);
  }
  // Model
  getInput() {
    return this.root.element;
  }
  async setInput(input, viewState) {
    this.cancelAllRefreshPromises();
    this.root.element = input;
    const viewStateContext = viewState && { viewState, focus: [], selection: [] };
    await this._updateChildren(input, true, false, viewStateContext);
    if (viewStateContext) {
      this.tree.setFocus(viewStateContext.focus);
      this.tree.setSelection(viewStateContext.selection);
    }
    if (viewState && typeof viewState.scrollTop === "number") {
      this.scrollTop = viewState.scrollTop;
    }
  }
  async updateChildren(element = this.root.element, recursive = true, rerender = false, options) {
    await this._updateChildren(element, recursive, rerender, void 0, options);
  }
  cancelAllRefreshPromises(includeSubTrees = false) {
    this.refreshPromises.forEach((promise) => promise.cancel());
    this.refreshPromises.clear();
    if (includeSubTrees) {
      this.subTreeRefreshPromises.forEach((promise) => promise.cancel());
      this.subTreeRefreshPromises.clear();
    }
  }
  async _updateChildren(element = this.root.element, recursive = true, rerender = false, viewStateContext, options) {
    if (typeof this.root.element === "undefined") {
      throw new TreeError(this.user, "Tree input not set");
    }
    if (this.root.refreshPromise) {
      await this.root.refreshPromise;
      await Event.toPromise(this._onDidRender.event);
    }
    const node = this.getDataNode(element);
    await this.refreshAndRenderNode(node, recursive, viewStateContext, options);
    if (rerender) {
      try {
        this.tree.rerender(node);
      } catch {
      }
    }
  }
  resort(element = this.root.element, recursive = true) {
    this.tree.resort(this.getDataNode(element), recursive);
  }
  hasNode(element) {
    if (element === this.root.element) {
      return true;
    }
    const node = this.nodes.get(element);
    if (!node) {
      return false;
    }
    return this.tree.hasElement(node);
  }
  // View
  rerender(element) {
    if (element === void 0 || element === this.root.element) {
      this.tree.rerender();
      return;
    }
    const node = this.getDataNode(element);
    this.tree.rerender(node);
  }
  updateElementHeight(element, height) {
    const node = this.getDataNode(element);
    this.tree.updateElementHeight(node, height);
  }
  updateWidth(element) {
    const node = this.getDataNode(element);
    this.tree.updateWidth(node);
  }
  // Tree
  getNode(element = this.root.element) {
    const dataNode = this.getDataNode(element);
    const node = this.tree.getNode(dataNode === this.root ? null : dataNode);
    return this.nodeMapper.map(node);
  }
  collapse(element, recursive = false) {
    const node = this.getDataNode(element);
    return this.tree.collapse(node === this.root ? null : node, recursive);
  }
  async expand(element, recursive = false) {
    if (typeof this.root.element === "undefined") {
      throw new TreeError(this.user, "Tree input not set");
    }
    if (this.root.refreshPromise) {
      await this.root.refreshPromise;
      await Event.toPromise(this._onDidRender.event);
    }
    const node = this.getDataNode(element);
    if (this.tree.hasElement(node) && !this.tree.isCollapsible(node)) {
      return false;
    }
    if (node.refreshPromise) {
      await node.refreshPromise;
      await Event.toPromise(this._onDidRender.event);
    }
    if (node !== this.root && !node.refreshPromise && !this.tree.isCollapsed(node)) {
      return false;
    }
    const result = this.tree.expand(node === this.root ? null : node, recursive);
    if (node.refreshPromise) {
      await node.refreshPromise;
      await Event.toPromise(this._onDidRender.event);
    }
    return result;
  }
  toggleCollapsed(element, recursive = false) {
    return this.tree.toggleCollapsed(this.getDataNode(element), recursive);
  }
  expandAll() {
    this.tree.expandAll();
  }
  async expandTo(element) {
    if (!this.dataSource.getParent) {
      throw new Error("Can't expand to element without getParent method");
    }
    const elements = [];
    while (!this.hasNode(element)) {
      element = this.dataSource.getParent(element);
      if (element !== this.root.element) {
        elements.push(element);
      }
    }
    for (const element2 of Iterable.reverse(elements)) {
      await this.expand(element2);
    }
    this.tree.expandTo(this.getDataNode(element));
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  isCollapsible(element) {
    return this.tree.isCollapsible(this.getDataNode(element));
  }
  isCollapsed(element) {
    return this.tree.isCollapsed(this.getDataNode(element));
  }
  triggerTypeNavigation() {
    this.tree.triggerTypeNavigation();
  }
  openFind() {
    if (this.findController) {
      this.findController.open();
    } else {
      this.tree.openFind();
    }
  }
  closeFind() {
    if (this.findController) {
      this.findController.close();
    } else {
      this.tree.closeFind();
    }
  }
  refilter() {
    this.tree.refilter();
  }
  setAnchor(element) {
    this.tree.setAnchor(typeof element === "undefined" ? void 0 : this.getDataNode(element));
  }
  getAnchor() {
    const node = this.tree.getAnchor();
    return node?.element;
  }
  setSelection(elements, browserEvent) {
    const nodes = elements.map((e) => this.getDataNode(e));
    this.tree.setSelection(nodes, browserEvent);
  }
  getSelection() {
    const nodes = this.tree.getSelection();
    return nodes.map((n) => n.element);
  }
  setFocus(elements, browserEvent) {
    const nodes = elements.map((e) => this.getDataNode(e));
    this.tree.setFocus(nodes, browserEvent);
  }
  focusNext(n = 1, loop = false, browserEvent) {
    this.tree.focusNext(n, loop, browserEvent, this.focusNavigationFilter);
  }
  focusPrevious(n = 1, loop = false, browserEvent) {
    this.tree.focusPrevious(n, loop, browserEvent, this.focusNavigationFilter);
  }
  focusNextPage(browserEvent) {
    return this.tree.focusNextPage(browserEvent, this.focusNavigationFilter);
  }
  focusPreviousPage(browserEvent) {
    return this.tree.focusPreviousPage(browserEvent, this.focusNavigationFilter);
  }
  focusLast(browserEvent) {
    this.tree.focusLast(browserEvent, this.focusNavigationFilter);
  }
  focusFirst(browserEvent) {
    this.tree.focusFirst(browserEvent, this.focusNavigationFilter);
  }
  getFocus() {
    const nodes = this.tree.getFocus();
    return nodes.map((n) => n.element);
  }
  getStickyScrollFocus() {
    const nodes = this.tree.getStickyScrollFocus();
    return nodes.map((n) => n.element);
  }
  getFocusedPart() {
    return this.tree.getFocusedPart();
  }
  reveal(element, relativeTop) {
    this.tree.reveal(this.getDataNode(element), relativeTop);
  }
  getRelativeTop(element) {
    return this.tree.getRelativeTop(this.getDataNode(element));
  }
  // Tree navigation
  getParentElement(element) {
    const node = this.tree.getParentElement(this.getDataNode(element));
    return node && node.element;
  }
  getFirstElementChild(element = this.root.element) {
    const dataNode = this.getDataNode(element);
    const node = this.tree.getFirstElementChild(dataNode === this.root ? null : dataNode);
    return node && node.element;
  }
  // Implementation
  getDataNode(element) {
    const node = this.nodes.get(element === this.root.element ? null : element);
    if (!node) {
      const nodeIdentity = this.identityProvider?.getId(element).toString();
      throw new TreeError(this.user, `Data tree node not found${nodeIdentity ? `: ${nodeIdentity}` : ""}`);
    }
    return node;
  }
  async refreshAndRenderNode(node, recursive, viewStateContext, options) {
    if (this.disposables.isDisposed) {
      return;
    }
    await this.refreshNode(node, recursive, viewStateContext);
    if (this.disposables.isDisposed) {
      return;
    }
    this.render(node, viewStateContext, options);
  }
  async refreshNode(node, recursive, viewStateContext) {
    let result;
    this.subTreeRefreshPromises.forEach((refreshPromise, refreshNode) => {
      if (!result && intersects(refreshNode, node)) {
        result = refreshPromise.then(() => this.refreshNode(node, recursive, viewStateContext));
      }
    });
    if (result) {
      return result;
    }
    if (node !== this.root) {
      const treeNode = this.tree.getNode(node);
      if (treeNode.collapsed) {
        node.hasChildren = !!this.dataSource.hasChildren(node.element);
        node.stale = true;
        this.setChildren(node, [], recursive, viewStateContext);
        return;
      }
    }
    return this.doRefreshSubTree(node, recursive, viewStateContext);
  }
  async doRefreshSubTree(node, recursive, viewStateContext) {
    const cancelablePromise = createCancelablePromise(async () => {
      const childrenToRefresh = await this.doRefreshNode(node, recursive, viewStateContext);
      node.stale = false;
      await Promises.settled(childrenToRefresh.map((child) => this.doRefreshSubTree(child, recursive, viewStateContext)));
    });
    node.refreshPromise = cancelablePromise;
    this.subTreeRefreshPromises.set(node, cancelablePromise);
    cancelablePromise.finally(() => {
      node.refreshPromise = void 0;
      this.subTreeRefreshPromises.delete(node);
    });
    return cancelablePromise;
  }
  async doRefreshNode(node, recursive, viewStateContext) {
    node.hasChildren = !!this.dataSource.hasChildren(node.element);
    let childrenPromise;
    if (!node.hasChildren) {
      childrenPromise = Promise.resolve(Iterable.empty());
    } else {
      const children = this.doGetChildren(node);
      if (isIterable(children)) {
        childrenPromise = Promise.resolve(children);
      } else {
        const slowTimeout = timeout(800);
        slowTimeout.then(() => {
          node.slow = true;
          this._onDidChangeNodeSlowState.fire(node);
        }, (_) => null);
        childrenPromise = children.finally(() => slowTimeout.cancel());
      }
    }
    try {
      const children = await childrenPromise;
      return this.setChildren(node, children, recursive, viewStateContext);
    } catch (err) {
      if (node !== this.root && this.tree.hasElement(node)) {
        this.tree.collapse(node);
      }
      if (isCancellationError(err)) {
        return [];
      }
      throw err;
    } finally {
      if (node.slow) {
        node.slow = false;
        this._onDidChangeNodeSlowState.fire(node);
      }
    }
  }
  doGetChildren(node) {
    let result = this.refreshPromises.get(node);
    if (result) {
      return result;
    }
    const children = this.dataSource.getChildren(node.element);
    if (isIterable(children)) {
      return this.processChildren(children);
    } else {
      result = createCancelablePromise(async () => this.processChildren(await children));
      this.refreshPromises.set(node, result);
      return result.finally(() => {
        this.refreshPromises.delete(node);
      });
    }
  }
  _onDidChangeCollapseState({ node, deep }) {
    if (node.element === null) {
      return;
    }
    if (!node.collapsed && node.element.stale) {
      if (deep) {
        this.collapse(node.element.element);
      } else {
        this.refreshAndRenderNode(node.element, false).catch(onUnexpectedError);
      }
    }
  }
  setChildren(node, childrenElementsIterable, recursive, viewStateContext) {
    const childrenElements = [...childrenElementsIterable];
    if (node.children.length === 0 && childrenElements.length === 0) {
      return [];
    }
    const nodesToForget = /* @__PURE__ */ new Map();
    const childrenTreeNodesById = /* @__PURE__ */ new Map();
    for (const child of node.children) {
      nodesToForget.set(child.element, child);
      if (this.identityProvider) {
        childrenTreeNodesById.set(child.id, { node: child, collapsed: this.tree.hasElement(child) && this.tree.isCollapsed(child) });
      }
    }
    const childrenToRefresh = [];
    const children = childrenElements.map((element) => {
      const hasChildren = !!this.dataSource.hasChildren(element);
      if (!this.identityProvider) {
        const asyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, hasChildren, defaultCollapseState: this.getDefaultCollapseState(element) });
        if (hasChildren && asyncDataTreeNode.defaultCollapseState === ObjectTreeElementCollapseState.PreserveOrExpanded) {
          childrenToRefresh.push(asyncDataTreeNode);
        }
        return asyncDataTreeNode;
      }
      const id = this.identityProvider.getId(element).toString();
      const result = childrenTreeNodesById.get(id);
      if (result) {
        const asyncDataTreeNode = result.node;
        nodesToForget.delete(asyncDataTreeNode.element);
        this.nodes.delete(asyncDataTreeNode.element);
        this.nodes.set(element, asyncDataTreeNode);
        asyncDataTreeNode.element = element;
        asyncDataTreeNode.hasChildren = hasChildren;
        if (recursive) {
          if (result.collapsed) {
            asyncDataTreeNode.children.forEach((node2) => dfs(node2, (node3) => this.nodes.delete(node3.element)));
            asyncDataTreeNode.children.splice(0, asyncDataTreeNode.children.length);
            asyncDataTreeNode.stale = true;
          } else {
            childrenToRefresh.push(asyncDataTreeNode);
          }
        } else if (hasChildren && !result.collapsed) {
          childrenToRefresh.push(asyncDataTreeNode);
        }
        return asyncDataTreeNode;
      }
      const childAsyncDataTreeNode = createAsyncDataTreeNode({ element, parent: node, id, hasChildren, defaultCollapseState: this.getDefaultCollapseState(element) });
      if (viewStateContext && viewStateContext.viewState.focus && viewStateContext.viewState.focus.indexOf(id) > -1) {
        viewStateContext.focus.push(childAsyncDataTreeNode);
      }
      if (viewStateContext && viewStateContext.viewState.selection && viewStateContext.viewState.selection.indexOf(id) > -1) {
        viewStateContext.selection.push(childAsyncDataTreeNode);
      }
      if (viewStateContext && viewStateContext.viewState.expanded && viewStateContext.viewState.expanded.indexOf(id) > -1) {
        childrenToRefresh.push(childAsyncDataTreeNode);
      } else if (hasChildren && childAsyncDataTreeNode.defaultCollapseState === ObjectTreeElementCollapseState.PreserveOrExpanded) {
        childrenToRefresh.push(childAsyncDataTreeNode);
      }
      return childAsyncDataTreeNode;
    });
    for (const node2 of nodesToForget.values()) {
      dfs(node2, (node3) => this.nodes.delete(node3.element));
    }
    for (const child of children) {
      this.nodes.set(child.element, child);
    }
    splice(node.children, 0, node.children.length, children);
    if (node !== this.root && this.autoExpandSingleChildren && children.length === 1 && childrenToRefresh.length === 0) {
      children[0].forceExpanded = true;
      childrenToRefresh.push(children[0]);
    }
    return childrenToRefresh;
  }
  render(node, viewStateContext, options) {
    const children = node.children.map((node2) => this.asTreeElement(node2, viewStateContext));
    const objectTreeOptions = options && {
      ...options,
      diffIdentityProvider: options.diffIdentityProvider && {
        getId(node2) {
          return options.diffIdentityProvider.getId(node2.element);
        },
        getGroupId: options.diffIdentityProvider.getGroupId ? (node2) => {
          return options.diffIdentityProvider.getGroupId(node2.element);
        } : void 0
      }
    };
    this.tree.setChildren(node === this.root ? null : node, children, objectTreeOptions);
    if (node !== this.root) {
      this.tree.setCollapsible(node, node.hasChildren);
    }
    this._onDidRender.fire();
  }
  asTreeElement(node, viewStateContext) {
    if (node.stale) {
      return {
        element: node,
        collapsible: node.hasChildren,
        collapsed: true
      };
    }
    let collapsed;
    if (viewStateContext && viewStateContext.viewState.expanded && node.id && viewStateContext.viewState.expanded.indexOf(node.id) > -1) {
      collapsed = false;
    } else if (node.forceExpanded) {
      collapsed = false;
      node.forceExpanded = false;
    } else {
      collapsed = node.defaultCollapseState;
    }
    return {
      element: node,
      children: node.hasChildren ? Iterable.map(node.children, (child) => this.asTreeElement(child, viewStateContext)) : [],
      collapsible: node.hasChildren,
      collapsed
    };
  }
  processChildren(children) {
    if (this.sorter) {
      children = [...children].sort(this.sorter.compare.bind(this.sorter));
    }
    return children;
  }
  // view state
  getViewState() {
    if (!this.identityProvider) {
      throw new TreeError(this.user, "Can't get tree view state without an identity provider");
    }
    const getId = (element) => this.identityProvider.getId(element).toString();
    const focus = this.getFocus().map(getId);
    const selection = this.getSelection().map(getId);
    const expanded = [];
    const root = this.tree.getNode();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== root && node.collapsible && !node.collapsed) {
        expanded.push(getId(node.element.element));
      }
      insertInto(stack, stack.length, node.children);
    }
    return { focus, selection, expanded, scrollTop: this.scrollTop };
  }
  dispose() {
    this._onDidRender.dispose();
    this._onDidChangeNodeSlowState.dispose();
    this.disposables.dispose();
    this.tree.dispose();
  }
}
class CompressibleAsyncDataTreeNodeWrapper {
  constructor(node) {
    this.node = node;
  }
  get element() {
    return {
      elements: this.node.element.elements.map((e) => e.element),
      incompressible: this.node.element.incompressible
    };
  }
  get children() {
    return this.node.children.map((node) => new CompressibleAsyncDataTreeNodeWrapper(node));
  }
  get depth() {
    return this.node.depth;
  }
  get visibleChildrenCount() {
    return this.node.visibleChildrenCount;
  }
  get visibleChildIndex() {
    return this.node.visibleChildIndex;
  }
  get collapsible() {
    return this.node.collapsible;
  }
  get collapsed() {
    return this.node.collapsed;
  }
  get visible() {
    return this.node.visible;
  }
  get filterData() {
    return this.node.filterData;
  }
}
class CompressibleAsyncDataTreeRenderer {
  constructor(renderer, nodeMapper, compressibleNodeMapperProvider, onDidChangeTwistieState) {
    this.renderer = renderer;
    this.nodeMapper = nodeMapper;
    this.compressibleNodeMapperProvider = compressibleNodeMapperProvider;
    this.onDidChangeTwistieState = onDidChangeTwistieState;
    this.renderedNodes = /* @__PURE__ */ new Map();
    this.disposables = [];
    this.templateId = renderer.templateId;
  }
  renderTemplate(container) {
    const templateData = this.renderer.renderTemplate(container);
    return { templateData };
  }
  renderElement(node, index, templateData, details) {
    this.renderer.renderElement(this.nodeMapper.map(node), index, templateData.templateData, details);
  }
  renderCompressedElements(node, index, templateData, details) {
    this.renderer.renderCompressedElements(this.compressibleNodeMapperProvider().map(node), index, templateData.templateData, details);
  }
  renderTwistie(element, twistieElement) {
    if (element.slow) {
      twistieElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
      return true;
    } else {
      twistieElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemLoading));
      return false;
    }
  }
  disposeElement(node, index, templateData, details) {
    this.renderer.disposeElement?.(this.nodeMapper.map(node), index, templateData.templateData, details);
  }
  disposeCompressedElements(node, index, templateData, details) {
    this.renderer.disposeCompressedElements?.(this.compressibleNodeMapperProvider().map(node), index, templateData.templateData, details);
  }
  disposeTemplate(templateData) {
    this.renderer.disposeTemplate(templateData.templateData);
  }
  dispose() {
    this.renderedNodes.clear();
    this.disposables = dispose(this.disposables);
  }
}
function asCompressibleObjectTreeOptions(options) {
  const objectTreeOptions = options && asObjectTreeOptions(options);
  return objectTreeOptions && {
    ...objectTreeOptions,
    keyboardNavigationLabelProvider: objectTreeOptions.keyboardNavigationLabelProvider && {
      ...objectTreeOptions.keyboardNavigationLabelProvider,
      getCompressedNodeKeyboardNavigationLabel(els) {
        return options.keyboardNavigationLabelProvider.getCompressedNodeKeyboardNavigationLabel(els.map((e) => e.element));
      }
    },
    stickyScrollDelegate: objectTreeOptions.stickyScrollDelegate
  };
}
class CompressibleAsyncDataTree extends AsyncDataTree {
  constructor(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, options = {}) {
    super(user, container, virtualDelegate, renderers, dataSource, options);
    this.compressionDelegate = compressionDelegate;
    this.compressibleNodeMapper = new WeakMapper((node) => new CompressibleAsyncDataTreeNodeWrapper(node));
    this.filter = options.filter;
  }
  getCompressedTreeNode(e) {
    const node = this.getDataNode(e);
    return this.tree.getCompressedTreeNode(node).element;
  }
  createTree(user, container, delegate, renderers, options) {
    const objectTreeDelegate = new ComposedTreeDelegate(delegate);
    const objectTreeRenderers = renderers.map((r) => new CompressibleAsyncDataTreeRenderer(r, this.nodeMapper, () => this.compressibleNodeMapper, this._onDidChangeNodeSlowState.event));
    const objectTreeOptions = asCompressibleObjectTreeOptions(options) || {};
    return new CompressibleObjectTree(user, container, objectTreeDelegate, objectTreeRenderers, objectTreeOptions);
  }
  asTreeElement(node, viewStateContext) {
    return {
      incompressible: this.compressionDelegate.isIncompressible(node.element),
      ...super.asTreeElement(node, viewStateContext)
    };
  }
  getViewState() {
    if (!this.identityProvider) {
      throw new TreeError(this.user, "Can't get tree view state without an identity provider");
    }
    const getId = (element) => this.identityProvider.getId(element).toString();
    const focus = this.getFocus().map(getId);
    const selection = this.getSelection().map(getId);
    const expanded = [];
    const root = this.tree.getCompressedTreeNode();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== root && node.collapsible && !node.collapsed) {
        for (const asyncNode of node.element.elements) {
          expanded.push(getId(asyncNode.element));
        }
      }
      stack.push(...node.children);
    }
    return { focus, selection, expanded, scrollTop: this.scrollTop };
  }
  render(node, viewStateContext, options) {
    if (!this.identityProvider) {
      return super.render(node, viewStateContext);
    }
    const getId = (element) => this.identityProvider.getId(element).toString();
    const getUncompressedIds = (nodes) => {
      const result = /* @__PURE__ */ new Set();
      for (const node2 of nodes) {
        const compressedNode = this.tree.getCompressedTreeNode(node2 === this.root ? null : node2);
        if (!compressedNode.element) {
          continue;
        }
        for (const node3 of compressedNode.element.elements) {
          result.add(getId(node3.element));
        }
      }
      return result;
    };
    const oldSelection = getUncompressedIds(this.tree.getSelection());
    const oldFocus = getUncompressedIds(this.tree.getFocus());
    super.render(node, viewStateContext, options);
    const selection = this.getSelection();
    let didChangeSelection = false;
    const focus = this.getFocus();
    let didChangeFocus = false;
    const visit = (node2) => {
      const compressedNode = node2.element;
      if (compressedNode) {
        for (let i = 0; i < compressedNode.elements.length; i++) {
          const id = getId(compressedNode.elements[i].element);
          const element = compressedNode.elements[compressedNode.elements.length - 1].element;
          if (oldSelection.has(id) && selection.indexOf(element) === -1) {
            selection.push(element);
            didChangeSelection = true;
          }
          if (oldFocus.has(id) && focus.indexOf(element) === -1) {
            focus.push(element);
            didChangeFocus = true;
          }
        }
      }
      node2.children.forEach(visit);
    };
    visit(this.tree.getCompressedTreeNode(node === this.root ? null : node));
    if (didChangeSelection) {
      this.setSelection(selection);
    }
    if (didChangeFocus) {
      this.setFocus(focus);
    }
  }
  // For compressed async data trees, `TreeVisibility.Recurse` doesn't currently work
  // and we have to filter everything beforehand
  // Related to #85193 and #85835
  processChildren(children) {
    if (this.filter) {
      children = Iterable.filter(children, (e) => {
        const result = this.filter.filter(e, TreeVisibility.Visible);
        const visibility = getVisibility(result);
        if (visibility === TreeVisibility.Recurse) {
          throw new Error("Recursive tree visibility not supported in async data compressed trees");
        }
        return visibility === TreeVisibility.Visible;
      });
    }
    return super.processChildren(children);
  }
  navigate(start) {
    return super.navigate(start);
  }
}
function getVisibility(filterResult) {
  if (typeof filterResult === "boolean") {
    return filterResult ? TreeVisibility.Visible : TreeVisibility.Hidden;
  } else if (isFilterResult(filterResult)) {
    return getVisibleState(filterResult.visibility);
  } else {
    return getVisibleState(filterResult);
  }
}
class AsyncDataTreeNavigator {
  constructor(navigator) {
    this.navigator = navigator;
  }
  current() {
    const current = this.navigator.current();
    if (current === null) {
      return null;
    }
    return current.element;
  }
  previous() {
    this.navigator.previous();
    return this.current();
  }
  first() {
    this.navigator.first();
    return this.current();
  }
  last() {
    this.navigator.last();
    return this.current();
  }
  next() {
    this.navigator.next();
    return this.current();
  }
}
export {
  AsyncDataTree,
  CompressibleAsyncDataTree
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRHJhZ0FuZERyb3BEYXRhIH0gZnJvbSAnLi4vLi4vZG5kLmpzJztcbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyLCBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciwgSUxpc3REcmFnQW5kRHJvcCwgSUxpc3REcmFnT3ZlclJlYWN0aW9uLCBJTGlzdE1vdXNlRXZlbnQsIElMaXN0VG91Y2hFdmVudCwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUsIE5vdFNlbGVjdGFibGVHcm91cElkVHlwZSB9IGZyb20gJy4uL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSwgTGlzdFZpZXdUYXJnZXRTZWN0b3IgfSBmcm9tICcuLi9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElMaXN0U3R5bGVzIH0gZnJvbSAnLi4vbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENvbXBvc2VkVHJlZURlbGVnYXRlLCBUcmVlRmluZE1vZGUsIElBYnN0cmFjdFRyZWVPcHRpb25zLCBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZSwgVHJlZUZpbmRNYXRjaFR5cGUsIEFic3RyYWN0VHJlZVBhcnQsIExhYmVsRnV6enlTY29yZSwgRmluZEZpbHRlciwgRmluZENvbnRyb2xsZXIsIElUcmVlRmluZFRvZ2dsZUNoYW5nZUV2ZW50LCBJRmluZENvbnRyb2xsZXJPcHRpb25zLCBJU3RpY2t5U2Nyb2xsRGVsZWdhdGUsIEFic3RyYWN0VHJlZSB9IGZyb20gJy4vYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZUVsZW1lbnQsIElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuL2NvbXByZXNzZWRPYmplY3RUcmVlTW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0VmlzaWJsZVN0YXRlLCBpc0ZpbHRlclJlc3VsdCB9IGZyb20gJy4vaW5kZXhUcmVlTW9kZWwuanMnO1xuaW1wb3J0IHsgQ29tcHJlc3NpYmxlT2JqZWN0VHJlZSwgSUNvbXByZXNzaWJsZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIElDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9ucywgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlciwgSU9iamVjdFRyZWVPcHRpb25zLCBJT2JqZWN0VHJlZVNldENoaWxkcmVuT3B0aW9ucywgT2JqZWN0VHJlZSB9IGZyb20gJy4vb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50LCBJT2JqZWN0VHJlZUVsZW1lbnQsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVEcmFnQW5kRHJvcCwgSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscywgSVRyZWVFdmVudCwgSVRyZWVGaWx0ZXIsIElUcmVlTW91c2VFdmVudCwgSVRyZWVOYXZpZ2F0b3IsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciwgSVRyZWVTb3J0ZXIsIE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZSwgVHJlZUVycm9yLCBUcmVlRmlsdGVyUmVzdWx0LCBUcmVlVmlzaWJpbGl0eSwgV2Vha01hcHBlciB9IGZyb20gJy4vdHJlZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIFByb21pc2VzLCBUaHJvdHRsZWREZWxheWVyLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yLCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IGlzSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdQcm92aWRlciB9IGZyb20gJy4uL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBpbnNlcnRJbnRvLCBzcGxpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB7XG5cdGVsZW1lbnQ6IFRJbnB1dCB8IFQ7XG5cdHJlYWRvbmx5IHBhcmVudDogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsO1xuXHRyZWFkb25seSBjaGlsZHJlbjogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD5bXTtcblx0cmVhZG9ubHkgaWQ/OiBzdHJpbmcgfCBudWxsO1xuXHRyZWZyZXNoUHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdGhhc0NoaWxkcmVuOiBib29sZWFuO1xuXHRzdGFsZTogYm9vbGVhbjtcblx0c2xvdzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGVmYXVsdENvbGxhcHNlU3RhdGU6IHVuZGVmaW5lZCB8IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yQ29sbGFwc2VkIHwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JFeHBhbmRlZDtcblx0Zm9yY2VFeHBhbmRlZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElBc3luY0RhdGFUcmVlTm9kZVJlcXVpcmVkUHJvcHM8VElucHV0LCBUPiBleHRlbmRzIFBhcnRpYWw8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+IHtcblx0cmVhZG9ubHkgZWxlbWVudDogVElucHV0IHwgVDtcblx0cmVhZG9ubHkgcGFyZW50OiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGw7XG5cdHJlYWRvbmx5IGhhc0NoaWxkcmVuOiBib29sZWFuO1xuXHRyZWFkb25seSBkZWZhdWx0Q29sbGFwc2VTdGF0ZTogdW5kZWZpbmVkIHwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JDb2xsYXBzZWQgfCBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckV4cGFuZGVkO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KHByb3BzOiBJQXN5bmNEYXRhVHJlZU5vZGVSZXF1aXJlZFByb3BzPFRJbnB1dCwgVD4pOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB7XG5cdHJldHVybiB7XG5cdFx0Li4ucHJvcHMsXG5cdFx0Y2hpbGRyZW46IFtdLFxuXHRcdHJlZnJlc2hQcm9taXNlOiB1bmRlZmluZWQsXG5cdFx0c3RhbGU6IHRydWUsXG5cdFx0c2xvdzogZmFsc2UsXG5cdFx0Zm9yY2VFeHBhbmRlZDogZmFsc2Vcblx0fTtcbn1cblxuZnVuY3Rpb24gaXNBbmNlc3RvcjxUSW5wdXQsIFQ+KGFuY2VzdG9yOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgZGVzY2VuZGFudDogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4pOiBib29sZWFuIHtcblx0aWYgKCFkZXNjZW5kYW50LnBhcmVudCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fSBlbHNlIGlmIChkZXNjZW5kYW50LnBhcmVudCA9PT0gYW5jZXN0b3IpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gaXNBbmNlc3RvcihhbmNlc3RvciwgZGVzY2VuZGFudC5wYXJlbnQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGludGVyc2VjdHM8VElucHV0LCBUPihub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgb3RoZXI6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KTogYm9vbGVhbiB7XG5cdHJldHVybiBub2RlID09PSBvdGhlciB8fCBpc0FuY2VzdG9yKG5vZGUsIG90aGVyKSB8fCBpc0FuY2VzdG9yKG90aGVyLCBub2RlKTtcbn1cblxuaW50ZXJmYWNlIElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VD4ge1xuXHR0ZW1wbGF0ZURhdGE6IFQ7XG59XG5cbnR5cGUgQXN5bmNEYXRhVHJlZU5vZGVNYXBwZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT4gPSBXZWFrTWFwcGVyPElUcmVlTm9kZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGwsIFRGaWx0ZXJEYXRhPiwgSVRyZWVOb2RlPFRJbnB1dCB8IFQsIFRGaWx0ZXJEYXRhPj47XG5cbmNsYXNzIEFzeW5jRGF0YVRyZWVOb2RlV3JhcHBlcjxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiBpbXBsZW1lbnRzIElUcmVlTm9kZTxUSW5wdXQgfCBULCBURmlsdGVyRGF0YT4ge1xuXG5cdGdldCBlbGVtZW50KCk6IFQgeyByZXR1cm4gdGhpcy5ub2RlLmVsZW1lbnQhLmVsZW1lbnQgYXMgVDsgfVxuXHRnZXQgY2hpbGRyZW4oKTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPltdIHsgcmV0dXJuIHRoaXMubm9kZS5jaGlsZHJlbi5tYXAobm9kZSA9PiBuZXcgQXN5bmNEYXRhVHJlZU5vZGVXcmFwcGVyKG5vZGUpKTsgfVxuXHRnZXQgZGVwdGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubm9kZS5kZXB0aDsgfVxuXHRnZXQgdmlzaWJsZUNoaWxkcmVuQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubm9kZS52aXNpYmxlQ2hpbGRyZW5Db3VudDsgfVxuXHRnZXQgdmlzaWJsZUNoaWxkSW5kZXgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubm9kZS52aXNpYmxlQ2hpbGRJbmRleDsgfVxuXHRnZXQgY29sbGFwc2libGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLm5vZGUuY29sbGFwc2libGU7IH1cblx0Z2V0IGNvbGxhcHNlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubm9kZS5jb2xsYXBzZWQ7IH1cblx0Z2V0IHZpc2libGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLm5vZGUudmlzaWJsZTsgfVxuXHRnZXQgZmlsdGVyRGF0YSgpOiBURmlsdGVyRGF0YSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLm5vZGUuZmlsdGVyRGF0YTsgfVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgbm9kZTogSVRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+KSB7IH1cbn1cblxuY2xhc3MgQXN5bmNEYXRhVHJlZVJlbmRlcmVyPFRJbnB1dCwgVCwgVEZpbHRlckRhdGEsIFRUZW1wbGF0ZURhdGE+IGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGEsIElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4+IHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVuZGVyZWROb2RlcyA9IG5ldyBNYXA8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlbmRlcmVyOiBJVHJlZVJlbmRlcmVyPFQsIFRGaWx0ZXJEYXRhLCBUVGVtcGxhdGVEYXRhPixcblx0XHRwcm90ZWN0ZWQgbm9kZU1hcHBlcjogQXN5bmNEYXRhVHJlZU5vZGVNYXBwZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT4sXG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUd2lzdGllU3RhdGU6IEV2ZW50PElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PlxuXHQpIHtcblx0XHR0aGlzLnRlbXBsYXRlSWQgPSByZW5kZXJlci50ZW1wbGF0ZUlkO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4ge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YSA9IHRoaXMucmVuZGVyZXIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKTtcblx0XHRyZXR1cm4geyB0ZW1wbGF0ZURhdGEgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVyLnJlbmRlckVsZW1lbnQodGhpcy5ub2RlTWFwcGVyLm1hcChub2RlKSBhcyBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBpbmRleCwgdGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSwgZGV0YWlscyk7XG5cdH1cblxuXHRyZW5kZXJUd2lzdGllKGVsZW1lbnQ6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCB0d2lzdGllRWxlbWVudDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZWxlbWVudC5zbG93KSB7XG5cdFx0XHR0d2lzdGllRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24udHJlZUl0ZW1Mb2FkaW5nKSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHdpc3RpZUVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnRyZWVJdGVtTG9hZGluZykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4sIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlci5kaXNwb3NlRWxlbWVudD8uKHRoaXMubm9kZU1hcHBlci5tYXAobm9kZSkgYXMgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgaW5kZXgsIHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURhdGEsIGRldGFpbHMpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPik6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVkTm9kZXMuY2xlYXIoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhc1RyZWVFdmVudDxUSW5wdXQsIFQ+KGU6IElUcmVlRXZlbnQ8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsPik6IElUcmVlRXZlbnQ8VD4ge1xuXHRyZXR1cm4ge1xuXHRcdGJyb3dzZXJFdmVudDogZS5icm93c2VyRXZlbnQsXG5cdFx0ZWxlbWVudHM6IGUuZWxlbWVudHMubWFwKGUgPT4gZSEuZWxlbWVudCBhcyBUKVxuXHR9O1xufVxuXG5mdW5jdGlvbiBhc1RyZWVNb3VzZUV2ZW50PFRJbnB1dCwgVD4oZTogSVRyZWVNb3VzZUV2ZW50PElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbD4pOiBJVHJlZU1vdXNlRXZlbnQ8VD4ge1xuXHRyZXR1cm4ge1xuXHRcdGJyb3dzZXJFdmVudDogZS5icm93c2VyRXZlbnQsXG5cdFx0ZWxlbWVudDogZS5lbGVtZW50ICYmIGUuZWxlbWVudC5lbGVtZW50IGFzIFQsXG5cdFx0dGFyZ2V0OiBlLnRhcmdldFxuXHR9O1xufVxuXG5mdW5jdGlvbiBhc1RyZWVDb250ZXh0TWVudUV2ZW50PFRJbnB1dCwgVD4oZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbD4pOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4ge1xuXHRyZXR1cm4ge1xuXHRcdGJyb3dzZXJFdmVudDogZS5icm93c2VyRXZlbnQsXG5cdFx0ZWxlbWVudDogZS5lbGVtZW50ICYmIGUuZWxlbWVudC5lbGVtZW50IGFzIFQsXG5cdFx0YW5jaG9yOiBlLmFuY2hvcixcblx0XHRpc1N0aWNreVNjcm9sbDogZS5pc1N0aWNreVNjcm9sbFxuXHR9O1xufVxuXG5jbGFzcyBBc3luY0RhdGFUcmVlRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VElucHV0LCBULCBUQ29udGV4dD4gZXh0ZW5kcyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxULCBUQ29udGV4dD4ge1xuXG5cdG92ZXJyaWRlIHNldCBjb250ZXh0KGNvbnRleHQ6IFRDb250ZXh0IHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5kYXRhLmNvbnRleHQgPSBjb250ZXh0O1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGNvbnRleHQoKTogVENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRhdGEuY29udGV4dDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZGF0YTogRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRDb250ZXh0Pikge1xuXHRcdHN1cGVyKGRhdGEuZWxlbWVudHMubWFwKG5vZGUgPT4gbm9kZS5lbGVtZW50IGFzIFQpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhc0FzeW5jRGF0YVRyZWVEcmFnQW5kRHJvcERhdGE8VElucHV0LCBUPihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhKTogSURyYWdBbmREcm9wRGF0YSB7XG5cdGlmIChkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEpIHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jRGF0YVRyZWVFbGVtZW50c0RyYWdBbmREcm9wRGF0YShkYXRhKTtcblx0fVxuXG5cdHJldHVybiBkYXRhO1xufVxuXG5jbGFzcyBBc3luY0RhdGFUcmVlTm9kZUxpc3REcmFnQW5kRHJvcDxUSW5wdXQsIFQ+IGltcGxlbWVudHMgSUxpc3REcmFnQW5kRHJvcDxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZG5kOiBJVHJlZURyYWdBbmREcm9wPFQ+KSB7IH1cblxuXHRnZXREcmFnVVJJKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuZG5kLmdldERyYWdVUkkobm9kZS5lbGVtZW50IGFzIFQpO1xuXHR9XG5cblx0Z2V0RHJhZ0xhYmVsKG5vZGVzOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPltdLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmRuZC5nZXREcmFnTGFiZWwpIHtcblx0XHRcdHJldHVybiB0aGlzLmRuZC5nZXREcmFnTGFiZWwobm9kZXMubWFwKG5vZGUgPT4gbm9kZS5lbGVtZW50IGFzIFQpLCBvcmlnaW5hbEV2ZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b25EcmFnU3RhcnQoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5kbmQub25EcmFnU3RhcnQ/Lihhc0FzeW5jRGF0YVRyZWVEcmFnQW5kRHJvcERhdGEoZGF0YSksIG9yaWdpbmFsRXZlbnQpO1xuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXROb2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50LCByYXcgPSB0cnVlKTogYm9vbGVhbiB8IElMaXN0RHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuZG5kLm9uRHJhZ092ZXIoYXNBc3luY0RhdGFUcmVlRHJhZ0FuZERyb3BEYXRhKGRhdGEpLCB0YXJnZXROb2RlICYmIHRhcmdldE5vZGUuZWxlbWVudCBhcyBULCB0YXJnZXRJbmRleCwgdGFyZ2V0U2VjdG9yLCBvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdGRyb3AoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0Tm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuZG5kLmRyb3AoYXNBc3luY0RhdGFUcmVlRHJhZ0FuZERyb3BEYXRhKGRhdGEpLCB0YXJnZXROb2RlICYmIHRhcmdldE5vZGUuZWxlbWVudCBhcyBULCB0YXJnZXRJbmRleCwgdGFyZ2V0U2VjdG9yLCBvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdG9uRHJhZ0VuZChvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmRuZC5vbkRyYWdFbmQ/LihvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kbmQuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFzeW5jRmluZFRvZ2dsZXMge1xuXHRtYXRjaFR5cGU6IFRyZWVGaW5kTWF0Y2hUeXBlO1xuXHRmaW5kTW9kZTogVHJlZUZpbmRNb2RlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBc3luY0ZpbmRSZXN1bHQ8VD4ge1xuXHR3YXJuaW5nTWVzc2FnZT86IHN0cmluZztcblx0bWF0Y2hDb3VudDogbnVtYmVyO1xuXHRpc01hdGNoKGVsZW1lbnQ6IFQpOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBc3luY0ZpbmRQcm92aWRlcjxUPiB7XG5cdC8qKlxuXHQgKiBgc3RhcnRTZXNzaW9uYCBpcyBjYWxsZWQgd2hlbiB0aGUgdXNlciBlbnRlcnMgdGhlIGZpcnN0IGNoYXJhY3RlciBpbiB0aGUgZmluZCB3aWRnZXQuXG5cdCAqIFRoaXMgY2FuIGJlIHVzZWQgdG8gYWxsb2NhdGUgc29tZSBzdGF0ZSB0byBwcmVzZXJ2ZSBmb3IgdGhlIHNlc3Npb24uXG5cdCAqL1xuXHRzdGFydFNlc3Npb24/KCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIGBmaW5kYCBpcyBjYWxsZWQgd2hlbiB0aGUgdXNlciB0eXBlcyBvbmUgb3IgbW9yZSBjaGFyYWN0ZXIgaW50byB0aGUgZmluZCBpbnB1dC5cblx0ICovXG5cdGZpbmQocGF0dGVybjogc3RyaW5nLCB0b2dnbGVzOiBJQXN5bmNGaW5kVG9nZ2xlcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQXN5bmNGaW5kUmVzdWx0PFQ+IHwgdW5kZWZpbmVkPjtcblxuXHQvKipcblx0ICogYGlzVmlzaWJsZWAgaXMgY2FsbGVkIHRvIGNoZWNrIGlmIGFuIGVsZW1lbnQgc2hvdWxkIGJlIHZpc2libGUuXG5cdCAqIEZvciBhbiBlbGVtZW50IHRvIGJlIHZpc2libGUsIGFsbCBpdHMgYW5jZXN0b3JzIG11c3QgYWxzbyBiZSB2aXNpYmxlIGFuZCB0aGUgbGFiZWwgbXVzdCBtYXRjaCB0aGUgZmluZCBwYXR0ZXJuLlxuXHQgKi9cblx0aXNWaXNpYmxlPyhlbGVtZW50OiBUKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRW5kIFNlc3Npb24gaXMgY2FsbGVkIHdoZW4gdGhlIHVzZXIgZWl0aGVyIGNsb3NlcyB0aGUgZmluZCB3aWRnZXQgb3IgaGFzIGFuIGVtcHR5IGZpbmQgaW5wdXQuXG5cdCAqIFRoaXMgY2FuIGJlIHVzZWQgdG8gZGVhbGxvY2F0ZSBhbnkgc3RhdGUgdGhhdCB3YXMgYWxsb2NhdGVkLlxuXHQgKi9cblx0ZW5kU2Vzc2lvbj8oKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuY2xhc3MgQXN5bmNGaW5kRmlsdGVyPFQ+IGV4dGVuZHMgRmluZEZpbHRlcjxUPiB7XG5cblx0cHVibGljIGlzRmluZFNlc3Npb25BY3RpdmUgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgZmluZFByb3ZpZGVyOiBJQXN5bmNGaW5kUHJvdmlkZXI8VD4sIC8vIHJlbW92ZSBwdWJsaWNcblx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxUPixcblx0XHRmaWx0ZXI6IElUcmVlRmlsdGVyPFQsIEZ1enp5U2NvcmU+XG5cdCkge1xuXHRcdHN1cGVyKGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIGZpbHRlcik7XG5cdH1cblxuXHRvdmVycmlkZSBmaWx0ZXIoZWxlbWVudDogVCwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlRmlsdGVyUmVzdWx0PEZ1enp5U2NvcmUgfCBMYWJlbEZ1enp5U2NvcmU+IHtcblx0XHRjb25zdCBmaWx0ZXJSZXN1bHQgPSBzdXBlci5maWx0ZXIoZWxlbWVudCwgcGFyZW50VmlzaWJpbGl0eSk7XG5cblx0XHRpZiAoIXRoaXMuaXNGaW5kU2Vzc2lvbkFjdGl2ZSB8fCB0aGlzLmZpbmRNb2RlID09PSBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0IHx8ICF0aGlzLmZpbmRQcm92aWRlci5pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybiBmaWx0ZXJSZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlzaWJpbGl0eSA9IGlzRmlsdGVyUmVzdWx0KGZpbHRlclJlc3VsdCkgPyBmaWx0ZXJSZXN1bHQudmlzaWJpbGl0eSA6IGZpbHRlclJlc3VsdDtcblx0XHRpZiAoZ2V0VmlzaWJsZVN0YXRlKHZpc2liaWxpdHkpID09PSBUcmVlVmlzaWJpbGl0eS5IaWRkZW4pIHtcblx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZmluZFByb3ZpZGVyLmlzVmlzaWJsZShlbGVtZW50KSA/IGZpbHRlclJlc3VsdCA6IFRyZWVWaXNpYmlsaXR5LkhpZGRlbjtcblx0fVxuXG59XG5cbi8vIFRPRE8gRml4IHR5cGVzXG5jbGFzcyBBc3luY0ZpbmRDb250cm9sbGVyPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+IGV4dGVuZHMgRmluZENvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGE+IHtcblx0cHJpdmF0ZSBhY3RpdmVUb2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWN0aXZlRmluZE1ldGFkYXRhOiBJQXN5bmNGaW5kUmVzdWx0PFQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGFjdGl2ZVNlc3Npb24gPSBmYWxzZTtcblx0cHJpdmF0ZSBhc3luY1dvcmtJblByb2dyZXNzID0gZmFsc2U7XG5cdHByaXZhdGUgdGFza1F1ZXVlID0gbmV3IFRocm90dGxlZERlbGF5ZXIoMjUwKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR0cmVlOiBPYmplY3RUcmVlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaW5kUHJvdmlkZXI6IElBc3luY0ZpbmRQcm92aWRlcjxUPixcblx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZmlsdGVyOiBBc3luY0ZpbmRGaWx0ZXI8VD4sXG5cdFx0Y29udGV4dFZpZXdQcm92aWRlcjogSUNvbnRleHRWaWV3UHJvdmlkZXIsXG5cdFx0b3B0aW9uczogSUFic3RyYWN0VHJlZU9wdGlvbnM8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhPixcblx0KSB7XG5cdFx0c3VwZXIodHJlZSBhcyB1bmtub3duIGFzIEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgdW5rbm93bj4sIGZpbHRlciwgY29udGV4dFZpZXdQcm92aWRlciwgb3B0aW9ucyk7XG5cdFx0Ly8gQWx3YXlzIG1ha2Ugc3VyZSB0byBlbmQgdGhlIHNlc3Npb24gYmVmb3JlIGRpc3Bvc2luZ1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZShhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmluZFByb3ZpZGVyLmVuZFNlc3Npb24/LigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhcHBseVBhdHRlcm4oX3BhdHRlcm46IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShmYWxzZSk7XG5cblx0XHR0aGlzLmFjdGl2ZVRva2VuU291cmNlPy5jYW5jZWwoKTtcblx0XHR0aGlzLmFjdGl2ZVRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHR0aGlzLnRhc2tRdWV1ZS50cmlnZ2VyKCgpID0+IHRoaXMuYXBwbHlQYXR0ZXJuQXN5bmMoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFwcGx5UGF0dGVybkFzeW5jKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRva2VuID0gdGhpcy5hY3RpdmVUb2tlblNvdXJjZT8udG9rZW47XG5cdFx0aWYgKCF0b2tlbiB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXR0ZXJuID0gdGhpcy5wYXR0ZXJuO1xuXG5cdFx0aWYgKHBhdHRlcm4gPT09ICcnKSB7XG5cdFx0XHRpZiAodGhpcy5hY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuYXN5bmNXb3JrSW5Qcm9ncmVzcyA9IHRydWU7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZGVhY3RpdmF0ZUZpbmRTZXNzaW9uKCk7XG5cdFx0XHRcdHRoaXMuYXN5bmNXb3JrSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXG5cdFx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHR0aGlzLmZpbHRlci5yZXNldCgpO1xuXHRcdFx0XHRcdHN1cGVyLmFwcGx5UGF0dGVybignJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZUZpbmRTZXNzaW9uKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hc3luY1dvcmtJblByb2dyZXNzID0gdHJ1ZTtcblx0XHR0aGlzLmFjdGl2ZUZpbmRNZXRhZGF0YSA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGZpbmRNZXRhZGF0YSA9IGF3YWl0IHRoaXMuZmluZFByb3ZpZGVyLmZpbmQocGF0dGVybiwgeyBtYXRjaFR5cGU6IHRoaXMubWF0Y2hUeXBlLCBmaW5kTW9kZTogdGhpcy5tb2RlIH0sIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgZmluZE1ldGFkYXRhID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFzeW5jV29ya0luUHJvZ3Jlc3MgPSBmYWxzZTtcblx0XHR0aGlzLmFjdGl2ZUZpbmRNZXRhZGF0YSA9IGZpbmRNZXRhZGF0YTtcblxuXHRcdHRoaXMuZmlsdGVyLnJlc2V0KCk7XG5cdFx0c3VwZXIuYXBwbHlQYXR0ZXJuKHBhdHRlcm4pO1xuXG5cdFx0aWYgKGZpbmRNZXRhZGF0YS53YXJuaW5nTWVzc2FnZSkge1xuXHRcdFx0dGhpcy5yZW5kZXJNZXNzYWdlKHRydWUsIGZpbmRNZXRhZGF0YS53YXJuaW5nTWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhY3RpdmF0ZUZpbmRTZXNzaW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbiA9IHRydWU7XG5cdFx0dGhpcy5maWx0ZXIuaXNGaW5kU2Vzc2lvbkFjdGl2ZSA9IHRydWU7XG5cdFx0dGhpcy5maW5kUHJvdmlkZXIuc3RhcnRTZXNzaW9uPy4oKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZGVhY3RpdmF0ZUZpbmRTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbiA9IGZhbHNlO1xuXHRcdHRoaXMuZmlsdGVyLmlzRmluZFNlc3Npb25BY3RpdmUgPSBmYWxzZTtcblx0XHRhd2FpdCB0aGlzLmZpbmRQcm92aWRlci5lbmRTZXNzaW9uPy4oKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYXN5bmNXb3JrSW5Qcm9ncmVzcyB8fCAhdGhpcy5hY3RpdmVGaW5kTWV0YWRhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzaG93Tm90Rm91bmQgPSB0aGlzLmFjdGl2ZUZpbmRNZXRhZGF0YS5tYXRjaENvdW50ID09PSAwICYmIHRoaXMucGF0dGVybi5sZW5ndGggPiAwO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShzaG93Tm90Rm91bmQpO1xuXG5cdFx0aWYgKHRoaXMucGF0dGVybi5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYWxlcnRSZXN1bHRzKHRoaXMuYWN0aXZlRmluZE1ldGFkYXRhLm1hdGNoQ291bnQpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRpZFRvZ2dsZUNoYW5nZShlOiBJVHJlZUZpbmRUb2dnbGVDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdC8vIFRPRE9AYmVuaWJlbmogaGFuZGxlIHRvZ2dsZXMgbmljZWx5IGFjcm9zcyBhbGwgY29udHJvbGxlcnMgYW5kIGJldHdlZW4gY29udHJvbGxlciBhbmQgZmlsdGVyXG5cdFx0dGhpcy50b2dnbGVzLnNldChlLmlkLCBlLmlzQ2hlY2tlZCk7XG5cdFx0dGhpcy5maWx0ZXIuZmluZE1vZGUgPSB0aGlzLm1vZGU7XG5cdFx0dGhpcy5maWx0ZXIuZmluZE1hdGNoVHlwZSA9IHRoaXMubWF0Y2hUeXBlO1xuXHRcdHRoaXMucGxhY2Vob2xkZXIgPSB0aGlzLm1vZGUgPT09IFRyZWVGaW5kTW9kZS5GaWx0ZXIgPyBsb2NhbGl6ZSgndHlwZSB0byBmaWx0ZXInLCBcIlR5cGUgdG8gZmlsdGVyXCIpIDogbG9jYWxpemUoJ3R5cGUgdG8gc2VhcmNoJywgXCJUeXBlIHRvIHNlYXJjaFwiKTtcblxuXHRcdHRoaXMuYXBwbHlQYXR0ZXJuKHRoaXMucGF0dGVybik7XG5cdH1cblxuXHRvdmVycmlkZSBzaG91bGRBbGxvd0ZvY3VzKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zaG91bGRGb2N1c1doZW5OYXZpZ2F0aW5nKG5vZGUgYXMgSVRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+KTtcblx0fVxuXG5cdHNob3VsZEZvY3VzV2hlbk5hdmlnYXRpbmcobm9kZTogSVRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmFjdGl2ZVNlc3Npb24gfHwgIXRoaXMuYWN0aXZlRmluZE1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50Py5lbGVtZW50IGFzIFQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGVsZW1lbnQgJiYgdGhpcy5hY3RpdmVGaW5kTWV0YWRhdGEuaXNNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICFGdXp6eVNjb3JlLmlzRGVmYXVsdChub2RlLmZpbHRlckRhdGEgYXMgdW5rbm93biBhcyBGdXp6eVNjb3JlKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhc09iamVjdFRyZWVPcHRpb25zPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+KG9wdGlvbnM/OiBJQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+KTogSU9iamVjdFRyZWVPcHRpb25zPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gb3B0aW9ucyAmJiB7XG5cdFx0Li4ub3B0aW9ucyxcblx0XHRjb2xsYXBzZUJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRpZGVudGl0eVByb3ZpZGVyOiBvcHRpb25zLmlkZW50aXR5UHJvdmlkZXIgJiYge1xuXHRcdFx0Z2V0SWQoZWwpIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciEuZ2V0SWQoZWwuZWxlbWVudCBhcyBUKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRHcm91cElkOiBvcHRpb25zLmlkZW50aXR5UHJvdmlkZXIhLmdldEdyb3VwSWQgPyAoZWwpID0+IHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciEuZ2V0R3JvdXBJZCEoZWwuZWxlbWVudCBhcyBUKTtcblx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHR9LFxuXHRcdGRuZDogb3B0aW9ucy5kbmQgJiYgbmV3IEFzeW5jRGF0YVRyZWVOb2RlTGlzdERyYWdBbmREcm9wKG9wdGlvbnMuZG5kKSxcblx0XHRtdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI6IG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyICYmIHtcblx0XHRcdGlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZSkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0XHRcdHJldHVybiBvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlciEuaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudCh7IC4uLmUsIGVsZW1lbnQ6IGUuZWxlbWVudCB9IGFzIElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0VG91Y2hFdmVudDxUPik7XG5cdFx0XHR9LFxuXHRcdFx0aXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50KGUpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIhLmlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudCh7IC4uLmUsIGVsZW1lbnQ6IGUuZWxlbWVudCB9IGFzIElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0VG91Y2hFdmVudDxUPik7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyICYmIHtcblx0XHRcdC4uLm9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLFxuXHRcdFx0Z2V0UG9zSW5TZXQ6IHVuZGVmaW5lZCxcblx0XHRcdGdldFNldFNpemU6IHVuZGVmaW5lZCxcblx0XHRcdGdldFJvbGU6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFJvbGUgPyAoZWwpID0+IHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRSb2xlIShlbC5lbGVtZW50IGFzIFQpO1xuXHRcdFx0fSA6ICgpID0+ICd0cmVlaXRlbScsXG5cdFx0XHRpc0NoZWNrZWQ6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmlzQ2hlY2tlZCA/IChlKSA9PiB7XG5cdFx0XHRcdHJldHVybiAhIShvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcj8uaXNDaGVja2VkIShlLmVsZW1lbnQgYXMgVCkpO1xuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdGdldEFyaWFMYWJlbChlKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0QXJpYUxhYmVsKGUuZWxlbWVudCBhcyBUKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0V2lkZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0V2lkZ2V0Um9sZTogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0V2lkZ2V0Um9sZSA/ICgpID0+IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRXaWRnZXRSb2xlISgpIDogKCkgPT4gJ3RyZWUnLFxuXHRcdFx0Z2V0QXJpYUxldmVsOiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRBcmlhTGV2ZWwgJiYgKG5vZGUgPT4ge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIhLmdldEFyaWFMZXZlbCEobm9kZS5lbGVtZW50IGFzIFQpO1xuXHRcdFx0fSksXG5cdFx0XHRnZXRBY3RpdmVEZXNjZW5kYW50SWQ6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFjdGl2ZURlc2NlbmRhbnRJZCAmJiAobm9kZSA9PiB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0QWN0aXZlRGVzY2VuZGFudElkIShub2RlLmVsZW1lbnQgYXMgVCk7XG5cdFx0XHR9KVxuXHRcdH0sXG5cdFx0ZmlsdGVyOiBvcHRpb25zLmZpbHRlciAmJiB7XG5cdFx0XHRmaWx0ZXIoZSwgcGFyZW50VmlzaWJpbGl0eSkge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5maWx0ZXIhLmZpbHRlcihlLmVsZW1lbnQgYXMgVCwgcGFyZW50VmlzaWJpbGl0eSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBvcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgJiYge1xuXHRcdFx0Li4ub3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLFxuXHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZSkge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyIS5nZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlLmVsZW1lbnQgYXMgVCk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRzb3J0ZXI6IHVuZGVmaW5lZCxcblx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHR5cGVvZiBvcHRpb25zLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA9PT0gJ3VuZGVmaW5lZCcgPyB1bmRlZmluZWQgOiAoXG5cdFx0XHR0eXBlb2Ygb3B0aW9ucy5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgIT09ICdmdW5jdGlvbicgPyBvcHRpb25zLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA6IChcblx0XHRcdFx0KChlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPikgPT4gKG9wdGlvbnMuZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrIGFzICgoZTogVCkgPT4gYm9vbGVhbikpKGUuZWxlbWVudCBhcyBUKSkgYXMgKChlOiB1bmtub3duKSA9PiBib29sZWFuKVxuXHRcdFx0KVxuXHRcdCksXG5cdFx0dHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzczogdHlwZW9mIG9wdGlvbnMudHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzcyA9PT0gJ3VuZGVmaW5lZCcgPyB1bmRlZmluZWQgOiAoXG5cdFx0XHQoKGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KSA9PiAob3B0aW9ucy50d2lzdGllQWRkaXRpb25hbENzc0NsYXNzIGFzICgoZTogVCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkKSkoZS5lbGVtZW50IGFzIFQpKSBhcyAoKGU6IHVua25vd24pID0+IHN0cmluZyB8IHVuZGVmaW5lZClcblx0XHQpLFxuXHRcdGRlZmF1bHRGaW5kVmlzaWJpbGl0eTogKGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGlsZHJlbiAmJiBlLnN0YWxlKSB7XG5cdFx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2Ygb3B0aW9ucy5kZWZhdWx0RmluZFZpc2liaWxpdHkgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmRlZmF1bHRGaW5kVmlzaWJpbGl0eTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIG9wdGlvbnMuZGVmYXVsdEZpbmRWaXNpYmlsaXR5ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRyZXR1cm4gVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiAob3B0aW9ucy5kZWZhdWx0RmluZFZpc2liaWxpdHkgYXMgKChlOiBUKSA9PiBUcmVlVmlzaWJpbGl0eSkpKGUuZWxlbWVudCBhcyBUKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHN0aWNreVNjcm9sbERlbGVnYXRlOiBvcHRpb25zLnN0aWNreVNjcm9sbERlbGVnYXRlIGFzIElTdGlja3lTY3JvbGxEZWxlZ2F0ZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkXG5cdH07XG59XG5leHBvcnQgaW50ZXJmYWNlIElBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZTxUPiBleHRlbmRzIElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlPFQ+IHsgfVxuZXhwb3J0IGludGVyZmFjZSBJQXN5bmNEYXRhVHJlZVVwZGF0ZUNoaWxkcmVuT3B0aW9uczxUPiBleHRlbmRzIElPYmplY3RUcmVlU2V0Q2hpbGRyZW5PcHRpb25zPFQ+IHsgfVxuXG5leHBvcnQgaW50ZXJmYWNlIElBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGV4dGVuZHMgSUFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+LCBQaWNrPElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiwgRXhjbHVkZTxrZXlvZiBJQWJzdHJhY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4sICdjb2xsYXBzZUJ5RGVmYXVsdCc+PiB7XG5cdHJlYWRvbmx5IGNvbGxhcHNlQnlEZWZhdWx0PzogeyAoZTogVCk6IGJvb2xlYW4gfTtcblx0cmVhZG9ubHkgaWRlbnRpdHlQcm92aWRlcj86IElJZGVudGl0eVByb3ZpZGVyPFQ+O1xuXHRyZWFkb25seSBzb3J0ZXI/OiBJVHJlZVNvcnRlcjxUPjtcblx0cmVhZG9ubHkgYXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZmluZFByb3ZpZGVyPzogSUFzeW5jRmluZFByb3ZpZGVyPFQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBc3luY0RhdGFUcmVlVmlld1N0YXRlIHtcblx0cmVhZG9ubHkgZm9jdXM/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgc2VsZWN0aW9uPzogc3RyaW5nW107XG5cdHJlYWRvbmx5IGV4cGFuZGVkPzogc3RyaW5nW107XG5cdHJlYWRvbmx5IHNjcm9sbFRvcD86IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElBc3luY0RhdGFUcmVlVmlld1N0YXRlQ29udGV4dDxUSW5wdXQsIFQ+IHtcblx0cmVhZG9ubHkgdmlld1N0YXRlOiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZTtcblx0cmVhZG9ubHkgc2VsZWN0aW9uOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPltdO1xuXHRyZWFkb25seSBmb2N1czogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD5bXTtcbn1cblxuZnVuY3Rpb24gZGZzPFRJbnB1dCwgVD4obm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIGZuOiAobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4pID0+IHZvaWQpOiB2b2lkIHtcblx0Zm4obm9kZSk7XG5cdG5vZGUuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiBkZnMoY2hpbGQsIGZuKSk7XG59XG5cbmV4cG9ydCBjbGFzcyBBc3luY0RhdGFUcmVlPFRJbnB1dCwgVCwgVEZpbHRlckRhdGEgPSB2b2lkPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdHJlZTogT2JqZWN0VHJlZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgcm9vdDogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD47XG5cdHByaXZhdGUgcmVhZG9ubHkgbm9kZXMgPSBuZXcgTWFwPG51bGwgfCBULCBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBzb3J0ZXI/OiBJVHJlZVNvcnRlcjxUPjtcblx0cHJpdmF0ZSByZWFkb25seSBmaW5kQ29udHJvbGxlcj86IEFzeW5jRmluZENvbnRyb2xsZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT47XG5cdHByaXZhdGUgcmVhZG9ubHkgZ2V0RGVmYXVsdENvbGxhcHNlU3RhdGU6IHsgKGU6IFQpOiB1bmRlZmluZWQgfCBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckNvbGxhcHNlZCB8IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yRXhwYW5kZWQgfTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN1YlRyZWVSZWZyZXNoUHJvbWlzZXMgPSBuZXcgTWFwPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSByZWZyZXNoUHJvbWlzZXMgPSBuZXcgTWFwPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBDYW5jZWxhYmxlUHJvbWlzZTxJdGVyYWJsZTxUPj4+KCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGlkZW50aXR5UHJvdmlkZXI/OiBJSWRlbnRpdHlQcm92aWRlcjxUPjtcblx0cHJpdmF0ZSByZWFkb25seSBhdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW46IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5kZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTm9kZVNsb3dTdGF0ZSA9IG5ldyBFbWl0dGVyPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PigpO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBub2RlTWFwcGVyOiBBc3luY0RhdGFUcmVlTm9kZU1hcHBlcjxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiA9IG5ldyBXZWFrTWFwcGVyKG5vZGUgPT4gbmV3IEFzeW5jRGF0YVRyZWVOb2RlV3JhcHBlcihub2RlKSk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGdldCBvbkRpZFNjcm9sbCgpOiBFdmVudDxTY3JvbGxFdmVudD4geyByZXR1cm4gdGhpcy50cmVlLm9uRGlkU2Nyb2xsOyB9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlRm9jdXMoKTogRXZlbnQ8SVRyZWVFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMudHJlZS5vbkRpZENoYW5nZUZvY3VzLCBhc1RyZWVFdmVudCk7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlU2VsZWN0aW9uKCk6IEV2ZW50PElUcmVlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnRyZWUub25EaWRDaGFuZ2VTZWxlY3Rpb24sIGFzVHJlZUV2ZW50KTsgfVxuXG5cdGdldCBvbktleURvd24oKTogRXZlbnQ8S2V5Ym9hcmRFdmVudD4geyByZXR1cm4gdGhpcy50cmVlLm9uS2V5RG93bjsgfVxuXHRnZXQgb25Nb3VzZUNsaWNrKCk6IEV2ZW50PElUcmVlTW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMudHJlZS5vbk1vdXNlQ2xpY2ssIGFzVHJlZU1vdXNlRXZlbnQpOyB9XG5cdGdldCBvbk1vdXNlRGJsQ2xpY2soKTogRXZlbnQ8SVRyZWVNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy50cmVlLm9uTW91c2VEYmxDbGljaywgYXNUcmVlTW91c2VFdmVudCk7IH1cblx0Z2V0IG9uQ29udGV4dE1lbnUoKTogRXZlbnQ8SVRyZWVDb250ZXh0TWVudUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy50cmVlLm9uQ29udGV4dE1lbnUsIGFzVHJlZUNvbnRleHRNZW51RXZlbnQpOyB9XG5cdGdldCBvblRhcCgpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnRyZWUub25UYXAsIGFzVHJlZU1vdXNlRXZlbnQpOyB9XG5cdGdldCBvblBvaW50ZXIoKTogRXZlbnQ8SVRyZWVNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy50cmVlLm9uUG9pbnRlciwgYXNUcmVlTW91c2VFdmVudCk7IH1cblx0Z2V0IG9uRGlkRm9jdXMoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy50cmVlLm9uRGlkRm9jdXM7IH1cblx0Z2V0IG9uRGlkQmx1cigpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLnRyZWUub25EaWRCbHVyOyB9XG5cblx0LyoqXG5cdCAqIFRvIGJlIHVzZWQgaW50ZXJuYWxseSBvbmx5IVxuXHQgKiBAZGVwcmVjYXRlZFxuXHQgKi9cblx0Z2V0IG9uRGlkQ2hhbmdlTW9kZWwoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy50cmVlLm9uRGlkQ2hhbmdlTW9kZWw7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSgpOiBFdmVudDxJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50PElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+PiB7IHJldHVybiB0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlOyB9XG5cblx0Z2V0IG9uRGlkVXBkYXRlT3B0aW9ucygpOiBFdmVudDxJQXN5bmNEYXRhVHJlZU9wdGlvbnNVcGRhdGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+PiB7IHJldHVybiB0aGlzLnRyZWUub25EaWRVcGRhdGVPcHRpb25zOyB9XG5cblx0cHJpdmF0ZSBmb2N1c05hdmlnYXRpb25GaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbCwgVEZpbHRlckRhdGE+KSA9PiBib29sZWFuKSB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRPcGVuU3RhdGU6IEV2ZW50PGJvb2xlYW4+O1xuXHRnZXQgb25EaWRDaGFuZ2VTdGlja3lTY3JvbGxGb2N1c2VkKCk6IEV2ZW50PGJvb2xlYW4+IHsgcmV0dXJuIHRoaXMudHJlZS5vbkRpZENoYW5nZVN0aWNreVNjcm9sbEZvY3VzZWQ7IH1cblxuXHRnZXQgZmluZE1vZGUoKTogVHJlZUZpbmRNb2RlIHsgcmV0dXJuIHRoaXMuZmluZENvbnRyb2xsZXIgPyB0aGlzLmZpbmRDb250cm9sbGVyLm1vZGUgOiB0aGlzLnRyZWUuZmluZE1vZGU7IH1cblx0c2V0IGZpbmRNb2RlKG1vZGU6IFRyZWVGaW5kTW9kZSkgeyB0aGlzLmZpbmRDb250cm9sbGVyID8gdGhpcy5maW5kQ29udHJvbGxlci5tb2RlID0gbW9kZSA6IHRoaXMudHJlZS5maW5kTW9kZSA9IG1vZGU7IH1cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaW5kTW9kZTogRXZlbnQ8VHJlZUZpbmRNb2RlPjtcblxuXHRnZXQgZmluZE1hdGNoVHlwZSgpOiBUcmVlRmluZE1hdGNoVHlwZSB7IHJldHVybiB0aGlzLmZpbmRDb250cm9sbGVyID8gdGhpcy5maW5kQ29udHJvbGxlci5tYXRjaFR5cGUgOiB0aGlzLnRyZWUuZmluZE1hdGNoVHlwZTsgfVxuXHRzZXQgZmluZE1hdGNoVHlwZShtYXRjaFR5cGU6IFRyZWVGaW5kTWF0Y2hUeXBlKSB7IHRoaXMuZmluZENvbnRyb2xsZXIgPyB0aGlzLmZpbmRDb250cm9sbGVyLm1hdGNoVHlwZSA9IG1hdGNoVHlwZSA6IHRoaXMudHJlZS5maW5kTWF0Y2hUeXBlID0gbWF0Y2hUeXBlOyB9XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmluZE1hdGNoVHlwZTogRXZlbnQ8VHJlZUZpbmRNYXRjaFR5cGU+O1xuXG5cdGdldCBleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2soKTogYm9vbGVhbiB8ICgoZTogVCkgPT4gYm9vbGVhbikge1xuXHRcdGlmICh0eXBlb2YgdGhpcy50cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy50cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljaztcblx0XHR9XG5cblx0XHRjb25zdCBmbiA9IHRoaXMudHJlZS5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s7XG5cdFx0cmV0dXJuIGVsZW1lbnQgPT4gZm4odGhpcy5ub2Rlcy5nZXQoKGVsZW1lbnQgPT09IHRoaXMucm9vdC5lbGVtZW50ID8gbnVsbCA6IGVsZW1lbnQpIGFzIFQpIHx8IG51bGwpO1xuXHR9XG5cblx0Z2V0IG9uRGlkRGlzcG9zZSgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLnRyZWUub25EaWREaXNwb3NlOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGRlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIHVua25vd24+W10sXG5cdFx0cHJpdmF0ZSBkYXRhU291cmNlOiBJQXN5bmNEYXRhU291cmNlPFRJbnB1dCwgVD4sXG5cdFx0b3B0aW9uczogSUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiA9IHt9XG5cdCkge1xuXHRcdHRoaXMuaWRlbnRpdHlQcm92aWRlciA9IG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlcjtcblx0XHR0aGlzLmF1dG9FeHBhbmRTaW5nbGVDaGlsZHJlbiA9IHR5cGVvZiBvcHRpb25zLmF1dG9FeHBhbmRTaW5nbGVDaGlsZHJlbiA9PT0gJ3VuZGVmaW5lZCcgPyBmYWxzZSA6IG9wdGlvbnMuYXV0b0V4cGFuZFNpbmdsZUNoaWxkcmVuO1xuXHRcdHRoaXMuc29ydGVyID0gb3B0aW9ucy5zb3J0ZXI7XG5cdFx0dGhpcy5nZXREZWZhdWx0Q29sbGFwc2VTdGF0ZSA9IGUgPT4gb3B0aW9ucy5jb2xsYXBzZUJ5RGVmYXVsdCA/IChvcHRpb25zLmNvbGxhcHNlQnlEZWZhdWx0KGUpID8gT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JDb2xsYXBzZWQgOiBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckV4cGFuZGVkKSA6IHVuZGVmaW5lZDtcblxuXHRcdGxldCBhc3luY0ZpbmRFbmFibGVkID0gZmFsc2U7XG5cdFx0bGV0IGZpbmRGaWx0ZXI6IEFzeW5jRmluZEZpbHRlcjxUPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAob3B0aW9ucy5maW5kUHJvdmlkZXIgJiYgKG9wdGlvbnMuZmluZFdpZGdldEVuYWJsZWQgPz8gdHJ1ZSkgJiYgb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyICYmIG9wdGlvbnMuY29udGV4dFZpZXdQcm92aWRlcikge1xuXHRcdFx0YXN5bmNGaW5kRW5hYmxlZCA9IHRydWU7XG5cdFx0XHRmaW5kRmlsdGVyID0gbmV3IEFzeW5jRmluZEZpbHRlcjxUPihvcHRpb25zLmZpbmRQcm92aWRlciwgb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBvcHRpb25zLmZpbHRlciBhcyBJVHJlZUZpbHRlcjxULCBGdXp6eVNjb3JlPik7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmVlID0gdGhpcy5jcmVhdGVUcmVlKHVzZXIsIGNvbnRhaW5lciwgZGVsZWdhdGUsIHJlbmRlcmVycywgeyAuLi5vcHRpb25zLCBmaW5kV2lkZ2V0RW5hYmxlZDogIWFzeW5jRmluZEVuYWJsZWQsIGZpbHRlcjogZmluZEZpbHRlciBhcyBJVHJlZUZpbHRlcjxULCBURmlsdGVyRGF0YT4gPz8gb3B0aW9ucy5maWx0ZXIgfSk7XG5cblx0XHR0aGlzLnJvb3QgPSBjcmVhdGVBc3luY0RhdGFUcmVlTm9kZSh7XG5cdFx0XHRlbGVtZW50OiB1bmRlZmluZWQhLFxuXHRcdFx0cGFyZW50OiBudWxsLFxuXHRcdFx0aGFzQ2hpbGRyZW46IHRydWUsXG5cdFx0XHRkZWZhdWx0Q29sbGFwc2VTdGF0ZTogdW5kZWZpbmVkXG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5pZGVudGl0eVByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLnJvb3QgPSB7XG5cdFx0XHRcdC4uLnRoaXMucm9vdCxcblx0XHRcdFx0aWQ6IG51bGxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGhpcy5ub2Rlcy5zZXQobnVsbCwgdGhpcy5yb290KTtcblxuXHRcdHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUodGhpcy5fb25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdGlmIChhc3luY0ZpbmRFbmFibGVkKSB7XG5cdFx0XHRjb25zdCBmaW5kT3B0aW9uczogSUZpbmRDb250cm9sbGVyT3B0aW9ucyA9IHtcblx0XHRcdFx0c3R5bGVzOiBvcHRpb25zLmZpbmRXaWRnZXRTdHlsZXMsXG5cdFx0XHRcdHNob3dOb3RGb3VuZE1lc3NhZ2U6IG9wdGlvbnMuc2hvd05vdEZvdW5kTWVzc2FnZSxcblx0XHRcdFx0ZGVmYXVsdEZpbmRNYXRjaFR5cGU6IG9wdGlvbnMuZGVmYXVsdEZpbmRNYXRjaFR5cGUsXG5cdFx0XHRcdGRlZmF1bHRGaW5kTW9kZTogb3B0aW9ucy5kZWZhdWx0RmluZE1vZGUsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5maW5kQ29udHJvbGxlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBBc3luY0ZpbmRDb250cm9sbGVyKHRoaXMudHJlZSwgb3B0aW9ucy5maW5kUHJvdmlkZXIhLCBmaW5kRmlsdGVyISwgdGhpcy50cmVlLm9wdGlvbnMuY29udGV4dFZpZXdQcm92aWRlciEsIGZpbmRPcHRpb25zKSk7XG5cblx0XHRcdHRoaXMuZm9jdXNOYXZpZ2F0aW9uRmlsdGVyID0gbm9kZSA9PiB0aGlzLmZpbmRDb250cm9sbGVyIS5zaG91bGRGb2N1c1doZW5OYXZpZ2F0aW5nKG5vZGUpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUZpbmRPcGVuU3RhdGUgPSB0aGlzLmZpbmRDb250cm9sbGVyLm9uRGlkQ2hhbmdlT3BlblN0YXRlO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUZpbmRNb2RlID0gdGhpcy5maW5kQ29udHJvbGxlci5vbkRpZENoYW5nZU1vZGU7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRmluZE1hdGNoVHlwZSA9IHRoaXMuZmluZENvbnRyb2xsZXIub25EaWRDaGFuZ2VNYXRjaFR5cGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VGaW5kT3BlblN0YXRlID0gdGhpcy50cmVlLm9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VGaW5kTW9kZSA9IHRoaXMudHJlZS5vbkRpZENoYW5nZUZpbmRNb2RlO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUZpbmRNYXRjaFR5cGUgPSB0aGlzLnRyZWUub25EaWRDaGFuZ2VGaW5kTWF0Y2hUeXBlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVUcmVlKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGRlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIHVua25vd24+W10sXG5cdFx0b3B0aW9uczogSUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPlxuXHQpOiBPYmplY3RUcmVlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBURmlsdGVyRGF0YT4ge1xuXHRcdGNvbnN0IG9iamVjdFRyZWVEZWxlZ2F0ZSA9IG5ldyBDb21wb3NlZFRyZWVEZWxlZ2F0ZTxUSW5wdXQgfCBULCBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4oZGVsZWdhdGUpO1xuXHRcdGNvbnN0IG9iamVjdFRyZWVSZW5kZXJlcnMgPSByZW5kZXJlcnMubWFwKHIgPT4gbmV3IEFzeW5jRGF0YVRyZWVSZW5kZXJlcihyLCB0aGlzLm5vZGVNYXBwZXIsIHRoaXMuX29uRGlkQ2hhbmdlTm9kZVNsb3dTdGF0ZS5ldmVudCkpO1xuXHRcdGNvbnN0IG9iamVjdFRyZWVPcHRpb25zID0gYXNPYmplY3RUcmVlT3B0aW9uczxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPihvcHRpb25zKSB8fCB7fTtcblxuXHRcdHJldHVybiBuZXcgT2JqZWN0VHJlZSh1c2VyLCBjb250YWluZXIsIG9iamVjdFRyZWVEZWxlZ2F0ZSwgb2JqZWN0VHJlZVJlbmRlcmVycywgb2JqZWN0VHJlZU9wdGlvbnMpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zVXBkYXRlOiBJQXN5bmNEYXRhVHJlZU9wdGlvbnNVcGRhdGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsPiA9IHt9KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZmluZENvbnRyb2xsZXIpIHtcblx0XHRcdGlmIChvcHRpb25zVXBkYXRlLmRlZmF1bHRGaW5kTW9kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuZmluZENvbnRyb2xsZXIubW9kZSA9IG9wdGlvbnNVcGRhdGUuZGVmYXVsdEZpbmRNb2RlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob3B0aW9uc1VwZGF0ZS5kZWZhdWx0RmluZE1hdGNoVHlwZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuZmluZENvbnRyb2xsZXIubWF0Y2hUeXBlID0gb3B0aW9uc1VwZGF0ZS5kZWZhdWx0RmluZE1hdGNoVHlwZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyhvcHRpb25zVXBkYXRlKTtcblx0fVxuXG5cdGdldCBvcHRpb25zKCk6IElBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUub3B0aW9ucyBhcyBJQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+O1xuXHR9XG5cblx0Ly8gV2lkZ2V0XG5cblx0Z2V0SFRNTEVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0SFRNTEVsZW1lbnQoKTtcblx0fVxuXG5cdGdldCBjb250ZW50SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5jb250ZW50SGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuY29udGVudFdpZHRoO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgpOiBFdmVudDxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodDtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUNvbnRlbnRXaWR0aCgpOiBFdmVudDxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29udGVudFdpZHRoO1xuXHR9XG5cblx0Z2V0IHNjcm9sbFRvcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuc2Nyb2xsVG9wO1xuXHR9XG5cblx0c2V0IHNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcikge1xuXHRcdHRoaXMudHJlZS5zY3JvbGxUb3AgPSBzY3JvbGxUb3A7XG5cdH1cblxuXHRnZXQgc2Nyb2xsTGVmdCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuc2Nyb2xsTGVmdDtcblx0fVxuXG5cdHNldCBzY3JvbGxMZWZ0KHNjcm9sbExlZnQ6IG51bWJlcikge1xuXHRcdHRoaXMudHJlZS5zY3JvbGxMZWZ0ID0gc2Nyb2xsTGVmdDtcblx0fVxuXG5cdGdldCBzY3JvbGxIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLnNjcm9sbEhlaWdodDtcblx0fVxuXG5cdGdldCByZW5kZXJIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLnJlbmRlckhlaWdodDtcblx0fVxuXG5cdGdldCBsYXN0VmlzaWJsZUVsZW1lbnQoKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5sYXN0VmlzaWJsZUVsZW1lbnQhLmVsZW1lbnQgYXMgVDtcblx0fVxuXG5cdGdldCBhcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmFyaWFMYWJlbDtcblx0fVxuXG5cdHNldCBhcmlhTGFiZWwodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMudHJlZS5hcmlhTGFiZWwgPSB2YWx1ZTtcblx0fVxuXG5cdGRvbUZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHR9XG5cblx0aXNET01Gb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuaXNET01Gb2N1c2VkKCk7XG5cdH1cblxuXHRuYXZpZ2F0ZShzdGFydD86IFQpIHtcblx0XHRsZXQgc3RhcnROb2RlO1xuXHRcdGlmIChzdGFydCkge1xuXHRcdFx0c3RhcnROb2RlID0gdGhpcy5nZXREYXRhTm9kZShzdGFydCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgQXN5bmNEYXRhVHJlZU5hdmlnYXRvcih0aGlzLnRyZWUubmF2aWdhdGUoc3RhcnROb2RlKSk7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRzdHlsZShzdHlsZXM6IElMaXN0U3R5bGVzKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLnN0eWxlKHN0eWxlcyk7XG5cdH1cblxuXHQvLyBNb2RlbFxuXG5cdGdldElucHV0KCk6IFRJbnB1dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMucm9vdC5lbGVtZW50IGFzIFRJbnB1dDtcblx0fVxuXG5cdGFzeW5jIHNldElucHV0KGlucHV0OiBUSW5wdXQsIHZpZXdTdGF0ZT86IElBc3luY0RhdGFUcmVlVmlld1N0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jYW5jZWxBbGxSZWZyZXNoUHJvbWlzZXMoKTtcblxuXHRcdHRoaXMucm9vdC5lbGVtZW50ID0gaW5wdXQhO1xuXG5cdFx0Y29uc3Qgdmlld1N0YXRlQ29udGV4dDogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGVDb250ZXh0PFRJbnB1dCwgVD4gfCB1bmRlZmluZWQgPSB2aWV3U3RhdGUgJiYgeyB2aWV3U3RhdGUsIGZvY3VzOiBbXSwgc2VsZWN0aW9uOiBbXSB9O1xuXG5cdFx0YXdhaXQgdGhpcy5fdXBkYXRlQ2hpbGRyZW4oaW5wdXQsIHRydWUsIGZhbHNlLCB2aWV3U3RhdGVDb250ZXh0KTtcblxuXHRcdGlmICh2aWV3U3RhdGVDb250ZXh0KSB7XG5cdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXModmlld1N0YXRlQ29udGV4dC5mb2N1cyk7XG5cdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKHZpZXdTdGF0ZUNvbnRleHQuc2VsZWN0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAodmlld1N0YXRlICYmIHR5cGVvZiB2aWV3U3RhdGUuc2Nyb2xsVG9wID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5zY3JvbGxUb3AgPSB2aWV3U3RhdGUuc2Nyb2xsVG9wO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUNoaWxkcmVuKGVsZW1lbnQ6IFRJbnB1dCB8IFQgPSB0aGlzLnJvb3QuZWxlbWVudCwgcmVjdXJzaXZlID0gdHJ1ZSwgcmVyZW5kZXIgPSBmYWxzZSwgb3B0aW9ucz86IElBc3luY0RhdGFUcmVlVXBkYXRlQ2hpbGRyZW5PcHRpb25zPFQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fdXBkYXRlQ2hpbGRyZW4oZWxlbWVudCwgcmVjdXJzaXZlLCByZXJlbmRlciwgdW5kZWZpbmVkLCBvcHRpb25zKTtcblx0fVxuXG5cdGNhbmNlbEFsbFJlZnJlc2hQcm9taXNlcyhpbmNsdWRlU3ViVHJlZXM6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMucmVmcmVzaFByb21pc2VzLmZvckVhY2gocHJvbWlzZSA9PiBwcm9taXNlLmNhbmNlbCgpKTtcblx0XHR0aGlzLnJlZnJlc2hQcm9taXNlcy5jbGVhcigpO1xuXG5cdFx0aWYgKGluY2x1ZGVTdWJUcmVlcykge1xuXHRcdFx0dGhpcy5zdWJUcmVlUmVmcmVzaFByb21pc2VzLmZvckVhY2gocHJvbWlzZSA9PiBwcm9taXNlLmNhbmNlbCgpKTtcblx0XHRcdHRoaXMuc3ViVHJlZVJlZnJlc2hQcm9taXNlcy5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZUNoaWxkcmVuKGVsZW1lbnQ6IFRJbnB1dCB8IFQgPSB0aGlzLnJvb3QuZWxlbWVudCwgcmVjdXJzaXZlID0gdHJ1ZSwgcmVyZW5kZXIgPSBmYWxzZSwgdmlld1N0YXRlQ29udGV4dD86IElBc3luY0RhdGFUcmVlVmlld1N0YXRlQ29udGV4dDxUSW5wdXQsIFQ+LCBvcHRpb25zPzogSUFzeW5jRGF0YVRyZWVVcGRhdGVDaGlsZHJlbk9wdGlvbnM8VD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMucm9vdC5lbGVtZW50ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsICdUcmVlIGlucHV0IG5vdCBzZXQnKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5yb290LnJlZnJlc2hQcm9taXNlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJvb3QucmVmcmVzaFByb21pc2U7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5fb25EaWRSZW5kZXIuZXZlbnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpO1xuXHRcdGF3YWl0IHRoaXMucmVmcmVzaEFuZFJlbmRlck5vZGUobm9kZSwgcmVjdXJzaXZlLCB2aWV3U3RhdGVDb250ZXh0LCBvcHRpb25zKTtcblxuXHRcdGlmIChyZXJlbmRlcikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy50cmVlLnJlcmVuZGVyKG5vZGUpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIG1pc3Npbmcgbm9kZXMgYXJlIGZpbmUsIHRoaXMgY291bGQndmUgcmVzdWx0ZWQgZnJvbVxuXHRcdFx0XHQvLyBwYXJhbGxlbCByZWZyZXNoIGNhbGxzLCByZW1vdmluZyBgbm9kZWAgYWx0b2dldGhlclxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlc29ydChlbGVtZW50OiBUSW5wdXQgfCBUID0gdGhpcy5yb290LmVsZW1lbnQsIHJlY3Vyc2l2ZSA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUucmVzb3J0KHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCksIHJlY3Vyc2l2ZSk7XG5cdH1cblxuXHRoYXNOb2RlKGVsZW1lbnQ6IFRJbnB1dCB8IFQpOiBib29sZWFuIHtcblx0XHRpZiAoZWxlbWVudCA9PT0gdGhpcy5yb290LmVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLm5vZGVzLmdldChlbGVtZW50IGFzIFQpO1xuXG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudHJlZS5oYXNFbGVtZW50KG5vZGUpO1xuXHR9XG5cblx0Ly8gVmlld1xuXG5cdHJlcmVuZGVyKGVsZW1lbnQ/OiBUKTogdm9pZCB7XG5cdFx0aWYgKGVsZW1lbnQgPT09IHVuZGVmaW5lZCB8fCBlbGVtZW50ID09PSB0aGlzLnJvb3QuZWxlbWVudCkge1xuXHRcdFx0dGhpcy50cmVlLnJlcmVuZGVyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCk7XG5cdFx0dGhpcy50cmVlLnJlcmVuZGVyKG5vZGUpO1xuXHR9XG5cblx0dXBkYXRlRWxlbWVudEhlaWdodChlbGVtZW50OiBULCBoZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpO1xuXHRcdHRoaXMudHJlZS51cGRhdGVFbGVtZW50SGVpZ2h0KG5vZGUsIGhlaWdodCk7XG5cdH1cblxuXHR1cGRhdGVXaWR0aChlbGVtZW50OiBUKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCk7XG5cdFx0dGhpcy50cmVlLnVwZGF0ZVdpZHRoKG5vZGUpO1xuXHR9XG5cblx0Ly8gVHJlZVxuXG5cdGdldE5vZGUoZWxlbWVudDogVElucHV0IHwgVCA9IHRoaXMucm9vdC5lbGVtZW50KTogSVRyZWVOb2RlPFRJbnB1dCB8IFQsIFRGaWx0ZXJEYXRhPiB7XG5cdFx0Y29uc3QgZGF0YU5vZGUgPSB0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpO1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLnRyZWUuZ2V0Tm9kZShkYXRhTm9kZSA9PT0gdGhpcy5yb290ID8gbnVsbCA6IGRhdGFOb2RlKTtcblx0XHRyZXR1cm4gdGhpcy5ub2RlTWFwcGVyLm1hcChub2RlKTtcblx0fVxuXG5cdGNvbGxhcHNlKGVsZW1lbnQ6IFQsIHJlY3Vyc2l2ZTogYm9vbGVhbiA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCk7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5jb2xsYXBzZShub2RlID09PSB0aGlzLnJvb3QgPyBudWxsIDogbm9kZSwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdGFzeW5jIGV4cGFuZChlbGVtZW50OiBULCByZWN1cnNpdmU6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5yb290LmVsZW1lbnQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHJlZUVycm9yKHRoaXMudXNlciwgJ1RyZWUgaW5wdXQgbm90IHNldCcpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJvb3QucmVmcmVzaFByb21pc2UpIHtcblx0XHRcdGF3YWl0IHRoaXMucm9vdC5yZWZyZXNoUHJvbWlzZTtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0aGlzLl9vbkRpZFJlbmRlci5ldmVudCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCk7XG5cblx0XHRpZiAodGhpcy50cmVlLmhhc0VsZW1lbnQobm9kZSkgJiYgIXRoaXMudHJlZS5pc0NvbGxhcHNpYmxlKG5vZGUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUucmVmcmVzaFByb21pc2UpIHtcblx0XHRcdGF3YWl0IG5vZGUucmVmcmVzaFByb21pc2U7XG5cdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5fb25EaWRSZW5kZXIuZXZlbnQpO1xuXHRcdH1cblxuXHRcdGlmIChub2RlICE9PSB0aGlzLnJvb3QgJiYgIW5vZGUucmVmcmVzaFByb21pc2UgJiYgIXRoaXMudHJlZS5pc0NvbGxhcHNlZChub2RlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMudHJlZS5leHBhbmQobm9kZSA9PT0gdGhpcy5yb290ID8gbnVsbCA6IG5vZGUsIHJlY3Vyc2l2ZSk7XG5cblx0XHRpZiAobm9kZS5yZWZyZXNoUHJvbWlzZSkge1xuXHRcdFx0YXdhaXQgbm9kZS5yZWZyZXNoUHJvbWlzZTtcblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZSh0aGlzLl9vbkRpZFJlbmRlci5ldmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHRvZ2dsZUNvbGxhcHNlZChlbGVtZW50OiBULCByZWN1cnNpdmU6IGJvb2xlYW4gPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUudG9nZ2xlQ29sbGFwc2VkKHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCksIHJlY3Vyc2l2ZSk7XG5cdH1cblxuXHRleHBhbmRBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmV4cGFuZEFsbCgpO1xuXHR9XG5cblx0YXN5bmMgZXhwYW5kVG8oZWxlbWVudDogVCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5kYXRhU291cmNlLmdldFBhcmVudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5cXCd0IGV4cGFuZCB0byBlbGVtZW50IHdpdGhvdXQgZ2V0UGFyZW50IG1ldGhvZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnRzOiBUW10gPSBbXTtcblx0XHR3aGlsZSAoIXRoaXMuaGFzTm9kZShlbGVtZW50KSkge1xuXHRcdFx0ZWxlbWVudCA9IHRoaXMuZGF0YVNvdXJjZS5nZXRQYXJlbnQoZWxlbWVudCkgYXMgVDtcblxuXHRcdFx0aWYgKGVsZW1lbnQgIT09IHRoaXMucm9vdC5lbGVtZW50KSB7XG5cdFx0XHRcdGVsZW1lbnRzLnB1c2goZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIEl0ZXJhYmxlLnJldmVyc2UoZWxlbWVudHMpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4cGFuZChlbGVtZW50KTtcblx0XHR9XG5cblx0XHR0aGlzLnRyZWUuZXhwYW5kVG8odGhpcy5nZXREYXRhTm9kZShlbGVtZW50KSk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuY29sbGFwc2VBbGwoKTtcblx0fVxuXG5cdGlzQ29sbGFwc2libGUoZWxlbWVudDogVCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuaXNDb2xsYXBzaWJsZSh0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpKTtcblx0fVxuXG5cdGlzQ29sbGFwc2VkKGVsZW1lbnQ6IFRJbnB1dCB8IFQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmlzQ29sbGFwc2VkKHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCkpO1xuXHR9XG5cblx0dHJpZ2dlclR5cGVOYXZpZ2F0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS50cmlnZ2VyVHlwZU5hdmlnYXRpb24oKTtcblx0fVxuXG5cdG9wZW5GaW5kKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmZpbmRDb250cm9sbGVyKSB7XG5cdFx0XHR0aGlzLmZpbmRDb250cm9sbGVyLm9wZW4oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmVlLm9wZW5GaW5kKCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xvc2VGaW5kKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmZpbmRDb250cm9sbGVyKSB7XG5cdFx0XHR0aGlzLmZpbmRDb250cm9sbGVyLmNsb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJlZS5jbG9zZUZpbmQoKTtcblx0XHR9XG5cdH1cblxuXHRyZWZpbHRlcigpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUucmVmaWx0ZXIoKTtcblx0fVxuXG5cdHNldEFuY2hvcihlbGVtZW50OiBUIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLnNldEFuY2hvcih0eXBlb2YgZWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcgPyB1bmRlZmluZWQgOiB0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpKTtcblx0fVxuXG5cdGdldEFuY2hvcigpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy50cmVlLmdldEFuY2hvcigpO1xuXHRcdHJldHVybiBub2RlPy5lbGVtZW50IGFzIFQ7XG5cdH1cblxuXHRzZXRTZWxlY3Rpb24oZWxlbWVudHM6IFRbXSwgYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGVzID0gZWxlbWVudHMubWFwKGUgPT4gdGhpcy5nZXREYXRhTm9kZShlKSk7XG5cdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihub2RlcywgYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdGdldFNlbGVjdGlvbigpOiBUW10ge1xuXHRcdGNvbnN0IG5vZGVzID0gdGhpcy50cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdHJldHVybiBub2Rlcy5tYXAobiA9PiBuIS5lbGVtZW50IGFzIFQpO1xuXHR9XG5cblx0c2V0Rm9jdXMoZWxlbWVudHM6IFRbXSwgYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG5vZGVzID0gZWxlbWVudHMubWFwKGUgPT4gdGhpcy5nZXREYXRhTm9kZShlKSk7XG5cdFx0dGhpcy50cmVlLnNldEZvY3VzKG5vZGVzLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0Zm9jdXNOZXh0KG4gPSAxLCBsb29wID0gZmFsc2UsIGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUuZm9jdXNOZXh0KG4sIGxvb3AsIGJyb3dzZXJFdmVudCwgdGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91cyhuID0gMSwgbG9vcCA9IGZhbHNlLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmZvY3VzUHJldmlvdXMobiwgbG9vcCwgYnJvd3NlckV2ZW50LCB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik7XG5cdH1cblxuXHRmb2N1c05leHRQYWdlKGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmZvY3VzTmV4dFBhZ2UoYnJvd3NlckV2ZW50LCB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzUGFnZShicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5mb2N1c1ByZXZpb3VzUGFnZShicm93c2VyRXZlbnQsIHRoaXMuZm9jdXNOYXZpZ2F0aW9uRmlsdGVyKTtcblx0fVxuXG5cdGZvY3VzTGFzdChicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLmZvY3VzTGFzdChicm93c2VyRXZlbnQsIHRoaXMuZm9jdXNOYXZpZ2F0aW9uRmlsdGVyKTtcblx0fVxuXG5cdGZvY3VzRmlyc3QoYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5mb2N1c0ZpcnN0KGJyb3dzZXJFdmVudCwgdGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIpO1xuXHR9XG5cblx0Z2V0Rm9jdXMoKTogVFtdIHtcblx0XHRjb25zdCBub2RlcyA9IHRoaXMudHJlZS5nZXRGb2N1cygpO1xuXHRcdHJldHVybiBub2Rlcy5tYXAobiA9PiBuIS5lbGVtZW50IGFzIFQpO1xuXHR9XG5cblx0Z2V0U3RpY2t5U2Nyb2xsRm9jdXMoKTogVFtdIHtcblx0XHRjb25zdCBub2RlcyA9IHRoaXMudHJlZS5nZXRTdGlja3lTY3JvbGxGb2N1cygpO1xuXHRcdHJldHVybiBub2Rlcy5tYXAobiA9PiBuIS5lbGVtZW50IGFzIFQpO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZFBhcnQoKTogQWJzdHJhY3RUcmVlUGFydCB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5nZXRGb2N1c2VkUGFydCgpO1xuXHR9XG5cblx0cmV2ZWFsKGVsZW1lbnQ6IFQsIHJlbGF0aXZlVG9wPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLnJldmVhbCh0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpLCByZWxhdGl2ZVRvcCk7XG5cdH1cblxuXHRnZXRSZWxhdGl2ZVRvcChlbGVtZW50OiBUKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMudHJlZS5nZXRSZWxhdGl2ZVRvcCh0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpKTtcblx0fVxuXG5cdC8vIFRyZWUgbmF2aWdhdGlvblxuXG5cdGdldFBhcmVudEVsZW1lbnQoZWxlbWVudDogVCk6IFRJbnB1dCB8IFQge1xuXHRcdGNvbnN0IG5vZGUgPSB0aGlzLnRyZWUuZ2V0UGFyZW50RWxlbWVudCh0aGlzLmdldERhdGFOb2RlKGVsZW1lbnQpKTtcblx0XHRyZXR1cm4gKG5vZGUgJiYgbm9kZS5lbGVtZW50KSE7XG5cdH1cblxuXHRnZXRGaXJzdEVsZW1lbnRDaGlsZChlbGVtZW50OiBUSW5wdXQgfCBUID0gdGhpcy5yb290LmVsZW1lbnQpOiBUSW5wdXQgfCBUIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkYXRhTm9kZSA9IHRoaXMuZ2V0RGF0YU5vZGUoZWxlbWVudCk7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMudHJlZS5nZXRGaXJzdEVsZW1lbnRDaGlsZChkYXRhTm9kZSA9PT0gdGhpcy5yb290ID8gbnVsbCA6IGRhdGFOb2RlKTtcblx0XHRyZXR1cm4gKG5vZGUgJiYgbm9kZS5lbGVtZW50KSE7XG5cdH1cblxuXHQvLyBJbXBsZW1lbnRhdGlvblxuXG5cdHByb3RlY3RlZCBnZXREYXRhTm9kZShlbGVtZW50OiBUSW5wdXQgfCBUKTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4ge1xuXHRcdGNvbnN0IG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgdW5kZWZpbmVkID0gdGhpcy5ub2Rlcy5nZXQoKGVsZW1lbnQgPT09IHRoaXMucm9vdC5lbGVtZW50ID8gbnVsbCA6IGVsZW1lbnQpIGFzIFQpO1xuXG5cdFx0aWYgKCFub2RlKSB7XG5cdFx0XHRjb25zdCBub2RlSWRlbnRpdHkgPSB0aGlzLmlkZW50aXR5UHJvdmlkZXI/LmdldElkKGVsZW1lbnQgYXMgVCkudG9TdHJpbmcoKTtcblx0XHRcdHRocm93IG5ldyBUcmVlRXJyb3IodGhpcy51c2VyLCBgRGF0YSB0cmVlIG5vZGUgbm90IGZvdW5kJHtub2RlSWRlbnRpdHkgPyBgOiAke25vZGVJZGVudGl0eX1gIDogJyd9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5vZGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hBbmRSZW5kZXJOb2RlKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCByZWN1cnNpdmU6IGJvb2xlYW4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPiwgb3B0aW9ucz86IElBc3luY0RhdGFUcmVlVXBkYXRlQ2hpbGRyZW5PcHRpb25zPFQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZGlzcG9zYWJsZXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuOyAvLyB0cmVlIGRpc3Bvc2VkIGR1cmluZyByZWZyZXNoLCBhZ2FpbiAoIzIyODIxMSlcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5yZWZyZXNoTm9kZShub2RlLCByZWN1cnNpdmUsIHZpZXdTdGF0ZUNvbnRleHQpO1xuXHRcdGlmICh0aGlzLmRpc3Bvc2FibGVzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjsgLy8gdHJlZSBkaXNwb3NlZCBkdXJpbmcgcmVmcmVzaCAoIzE5OTI2NClcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXIobm9kZSwgdmlld1N0YXRlQ29udGV4dCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hOb2RlKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCByZWN1cnNpdmU6IGJvb2xlYW4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCByZXN1bHQ6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLnN1YlRyZWVSZWZyZXNoUHJvbWlzZXMuZm9yRWFjaCgocmVmcmVzaFByb21pc2UsIHJlZnJlc2hOb2RlKSA9PiB7XG5cdFx0XHRpZiAoIXJlc3VsdCAmJiBpbnRlcnNlY3RzKHJlZnJlc2hOb2RlLCBub2RlKSkge1xuXHRcdFx0XHRyZXN1bHQgPSByZWZyZXNoUHJvbWlzZS50aGVuKCgpID0+IHRoaXMucmVmcmVzaE5vZGUobm9kZSwgcmVjdXJzaXZlLCB2aWV3U3RhdGVDb250ZXh0KSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGlmIChub2RlICE9PSB0aGlzLnJvb3QpIHtcblx0XHRcdGNvbnN0IHRyZWVOb2RlID0gdGhpcy50cmVlLmdldE5vZGUobm9kZSk7XG5cblx0XHRcdGlmICh0cmVlTm9kZS5jb2xsYXBzZWQpIHtcblx0XHRcdFx0bm9kZS5oYXNDaGlsZHJlbiA9ICEhdGhpcy5kYXRhU291cmNlLmhhc0NoaWxkcmVuKG5vZGUuZWxlbWVudCk7XG5cdFx0XHRcdG5vZGUuc3RhbGUgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnNldENoaWxkcmVuKG5vZGUsIFtdLCByZWN1cnNpdmUsIHZpZXdTdGF0ZUNvbnRleHQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmRvUmVmcmVzaFN1YlRyZWUobm9kZSwgcmVjdXJzaXZlLCB2aWV3U3RhdGVDb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZWZyZXNoU3ViVHJlZShub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgcmVjdXJzaXZlOiBib29sZWFuLCB2aWV3U3RhdGVDb250ZXh0PzogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGVDb250ZXh0PFRJbnB1dCwgVD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjYW5jZWxhYmxlUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuVG9SZWZyZXNoID0gYXdhaXQgdGhpcy5kb1JlZnJlc2hOb2RlKG5vZGUsIHJlY3Vyc2l2ZSwgdmlld1N0YXRlQ29udGV4dCk7XG5cdFx0XHRub2RlLnN0YWxlID0gZmFsc2U7XG5cblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoY2hpbGRyZW5Ub1JlZnJlc2gubWFwKGNoaWxkID0+IHRoaXMuZG9SZWZyZXNoU3ViVHJlZShjaGlsZCwgcmVjdXJzaXZlLCB2aWV3U3RhdGVDb250ZXh0KSkpO1xuXHRcdH0pO1xuXG5cdFx0bm9kZS5yZWZyZXNoUHJvbWlzZSA9IGNhbmNlbGFibGVQcm9taXNlO1xuXHRcdHRoaXMuc3ViVHJlZVJlZnJlc2hQcm9taXNlcy5zZXQobm9kZSwgY2FuY2VsYWJsZVByb21pc2UpO1xuXG5cdFx0Y2FuY2VsYWJsZVByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRub2RlLnJlZnJlc2hQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5zdWJUcmVlUmVmcmVzaFByb21pc2VzLmRlbGV0ZShub2RlKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBjYW5jZWxhYmxlUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SZWZyZXNoTm9kZShub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgcmVjdXJzaXZlOiBib29sZWFuLCB2aWV3U3RhdGVDb250ZXh0PzogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGVDb250ZXh0PFRJbnB1dCwgVD4pOiBQcm9taXNlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+W10+IHtcblx0XHRub2RlLmhhc0NoaWxkcmVuID0gISF0aGlzLmRhdGFTb3VyY2UuaGFzQ2hpbGRyZW4obm9kZS5lbGVtZW50KTtcblxuXHRcdGxldCBjaGlsZHJlblByb21pc2U6IFByb21pc2U8SXRlcmFibGU8VD4+O1xuXG5cdFx0aWYgKCFub2RlLmhhc0NoaWxkcmVuKSB7XG5cdFx0XHRjaGlsZHJlblByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoSXRlcmFibGUuZW1wdHkoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNoaWxkcmVuID0gdGhpcy5kb0dldENoaWxkcmVuKG5vZGUpO1xuXHRcdFx0aWYgKGlzSXRlcmFibGUoY2hpbGRyZW4pKSB7XG5cdFx0XHRcdGNoaWxkcmVuUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShjaGlsZHJlbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzbG93VGltZW91dCA9IHRpbWVvdXQoODAwKTtcblxuXHRcdFx0XHRzbG93VGltZW91dC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRub2RlLnNsb3cgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTm9kZVNsb3dTdGF0ZS5maXJlKG5vZGUpO1xuXHRcdFx0XHR9LCBfID0+IG51bGwpO1xuXG5cdFx0XHRcdGNoaWxkcmVuUHJvbWlzZSA9IGNoaWxkcmVuLmZpbmFsbHkoKCkgPT4gc2xvd1RpbWVvdXQuY2FuY2VsKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjaGlsZHJlbiA9IGF3YWl0IGNoaWxkcmVuUHJvbWlzZTtcblx0XHRcdHJldHVybiB0aGlzLnNldENoaWxkcmVuKG5vZGUsIGNoaWxkcmVuLCByZWN1cnNpdmUsIHZpZXdTdGF0ZUNvbnRleHQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKG5vZGUgIT09IHRoaXMucm9vdCAmJiB0aGlzLnRyZWUuaGFzRWxlbWVudChub2RlKSkge1xuXHRcdFx0XHR0aGlzLnRyZWUuY29sbGFwc2Uobm9kZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChub2RlLnNsb3cpIHtcblx0XHRcdFx0bm9kZS5zbG93ID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTm9kZVNsb3dTdGF0ZS5maXJlKG5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9HZXRDaGlsZHJlbihub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPik6IFByb21pc2U8SXRlcmFibGU8VD4+IHwgSXRlcmFibGU8VD4ge1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLnJlZnJlc2hQcm9taXNlcy5nZXQobm9kZSk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRjb25zdCBjaGlsZHJlbiA9IHRoaXMuZGF0YVNvdXJjZS5nZXRDaGlsZHJlbihub2RlLmVsZW1lbnQpO1xuXHRcdGlmIChpc0l0ZXJhYmxlKGNoaWxkcmVuKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJvY2Vzc0NoaWxkcmVuKGNoaWxkcmVuKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UoYXN5bmMgKCkgPT4gdGhpcy5wcm9jZXNzQ2hpbGRyZW4oYXdhaXQgY2hpbGRyZW4pKTtcblx0XHRcdHRoaXMucmVmcmVzaFByb21pc2VzLnNldChub2RlLCByZXN1bHQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdC5maW5hbGx5KCgpID0+IHsgdGhpcy5yZWZyZXNoUHJvbWlzZXMuZGVsZXRlKG5vZGUpOyB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoeyBub2RlLCBkZWVwIH06IElDb2xsYXBzZVN0YXRlQ2hhbmdlRXZlbnQ8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsLCBURmlsdGVyRGF0YT4pOiB2b2lkIHtcblx0XHRpZiAobm9kZS5lbGVtZW50ID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFub2RlLmNvbGxhcHNlZCAmJiBub2RlLmVsZW1lbnQuc3RhbGUpIHtcblx0XHRcdGlmIChkZWVwKSB7XG5cdFx0XHRcdHRoaXMuY29sbGFwc2Uobm9kZS5lbGVtZW50LmVsZW1lbnQgYXMgVCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hBbmRSZW5kZXJOb2RlKG5vZGUuZWxlbWVudCwgZmFsc2UpXG5cdFx0XHRcdFx0LmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldENoaWxkcmVuKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBjaGlsZHJlbkVsZW1lbnRzSXRlcmFibGU6IEl0ZXJhYmxlPFQ+LCByZWN1cnNpdmU6IGJvb2xlYW4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPik6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+W10ge1xuXHRcdGNvbnN0IGNoaWxkcmVuRWxlbWVudHMgPSBbLi4uY2hpbGRyZW5FbGVtZW50c0l0ZXJhYmxlXTtcblxuXHRcdC8vIHBlcmY6IGlmIHRoZSBub2RlIHdhcyBhbmQgc3RpbGwgaXMgYSBsZWFmLCBhdm9pZCBhbGwgdGhpcyBoYXNzbGVcblx0XHRpZiAobm9kZS5jaGlsZHJlbi5sZW5ndGggPT09IDAgJiYgY2hpbGRyZW5FbGVtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBub2Rlc1RvRm9yZ2V0ID0gbmV3IE1hcDxULCBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4oKTtcblx0XHRjb25zdCBjaGlsZHJlblRyZWVOb2Rlc0J5SWQgPSBuZXcgTWFwPHN0cmluZywgeyBub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPjsgY29sbGFwc2VkOiBib29sZWFuIH0+KCk7XG5cblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIG5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdG5vZGVzVG9Gb3JnZXQuc2V0KGNoaWxkLmVsZW1lbnQgYXMgVCwgY2hpbGQpO1xuXG5cdFx0XHRpZiAodGhpcy5pZGVudGl0eVByb3ZpZGVyKSB7XG5cdFx0XHRcdGNoaWxkcmVuVHJlZU5vZGVzQnlJZC5zZXQoY2hpbGQuaWQhLCB7IG5vZGU6IGNoaWxkLCBjb2xsYXBzZWQ6IHRoaXMudHJlZS5oYXNFbGVtZW50KGNoaWxkKSAmJiB0aGlzLnRyZWUuaXNDb2xsYXBzZWQoY2hpbGQpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGNoaWxkcmVuVG9SZWZyZXNoOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPltdID0gW107XG5cblx0XHRjb25zdCBjaGlsZHJlbiA9IGNoaWxkcmVuRWxlbWVudHMubWFwPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PihlbGVtZW50ID0+IHtcblx0XHRcdGNvbnN0IGhhc0NoaWxkcmVuID0gISF0aGlzLmRhdGFTb3VyY2UuaGFzQ2hpbGRyZW4oZWxlbWVudCk7XG5cblx0XHRcdGlmICghdGhpcy5pZGVudGl0eVByb3ZpZGVyKSB7XG5cdFx0XHRcdGNvbnN0IGFzeW5jRGF0YVRyZWVOb2RlID0gY3JlYXRlQXN5bmNEYXRhVHJlZU5vZGUoeyBlbGVtZW50LCBwYXJlbnQ6IG5vZGUsIGhhc0NoaWxkcmVuLCBkZWZhdWx0Q29sbGFwc2VTdGF0ZTogdGhpcy5nZXREZWZhdWx0Q29sbGFwc2VTdGF0ZShlbGVtZW50KSB9KTtcblxuXHRcdFx0XHRpZiAoaGFzQ2hpbGRyZW4gJiYgYXN5bmNEYXRhVHJlZU5vZGUuZGVmYXVsdENvbGxhcHNlU3RhdGUgPT09IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yRXhwYW5kZWQpIHtcblx0XHRcdFx0XHRjaGlsZHJlblRvUmVmcmVzaC5wdXNoKGFzeW5jRGF0YVRyZWVOb2RlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBhc3luY0RhdGFUcmVlTm9kZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaWQgPSB0aGlzLmlkZW50aXR5UHJvdmlkZXIuZ2V0SWQoZWxlbWVudCkudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNoaWxkcmVuVHJlZU5vZGVzQnlJZC5nZXQoaWQpO1xuXG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGNvbnN0IGFzeW5jRGF0YVRyZWVOb2RlID0gcmVzdWx0Lm5vZGU7XG5cblx0XHRcdFx0bm9kZXNUb0ZvcmdldC5kZWxldGUoYXN5bmNEYXRhVHJlZU5vZGUuZWxlbWVudCBhcyBUKTtcblx0XHRcdFx0dGhpcy5ub2Rlcy5kZWxldGUoYXN5bmNEYXRhVHJlZU5vZGUuZWxlbWVudCBhcyBUKTtcblx0XHRcdFx0dGhpcy5ub2Rlcy5zZXQoZWxlbWVudCwgYXN5bmNEYXRhVHJlZU5vZGUpO1xuXG5cdFx0XHRcdGFzeW5jRGF0YVRyZWVOb2RlLmVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdFx0XHRhc3luY0RhdGFUcmVlTm9kZS5oYXNDaGlsZHJlbiA9IGhhc0NoaWxkcmVuO1xuXG5cdFx0XHRcdGlmIChyZWN1cnNpdmUpIHtcblx0XHRcdFx0XHRpZiAocmVzdWx0LmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdFx0YXN5bmNEYXRhVHJlZU5vZGUuY2hpbGRyZW4uZm9yRWFjaChub2RlID0+IGRmcyhub2RlLCBub2RlID0+IHRoaXMubm9kZXMuZGVsZXRlKG5vZGUuZWxlbWVudCBhcyBUKSkpO1xuXHRcdFx0XHRcdFx0YXN5bmNEYXRhVHJlZU5vZGUuY2hpbGRyZW4uc3BsaWNlKDAsIGFzeW5jRGF0YVRyZWVOb2RlLmNoaWxkcmVuLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHRhc3luY0RhdGFUcmVlTm9kZS5zdGFsZSA9IHRydWU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNoaWxkcmVuVG9SZWZyZXNoLnB1c2goYXN5bmNEYXRhVHJlZU5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChoYXNDaGlsZHJlbiAmJiAhcmVzdWx0LmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdGNoaWxkcmVuVG9SZWZyZXNoLnB1c2goYXN5bmNEYXRhVHJlZU5vZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGFzeW5jRGF0YVRyZWVOb2RlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGlsZEFzeW5jRGF0YVRyZWVOb2RlID0gY3JlYXRlQXN5bmNEYXRhVHJlZU5vZGUoeyBlbGVtZW50LCBwYXJlbnQ6IG5vZGUsIGlkLCBoYXNDaGlsZHJlbiwgZGVmYXVsdENvbGxhcHNlU3RhdGU6IHRoaXMuZ2V0RGVmYXVsdENvbGxhcHNlU3RhdGUoZWxlbWVudCkgfSk7XG5cblx0XHRcdGlmICh2aWV3U3RhdGVDb250ZXh0ICYmIHZpZXdTdGF0ZUNvbnRleHQudmlld1N0YXRlLmZvY3VzICYmIHZpZXdTdGF0ZUNvbnRleHQudmlld1N0YXRlLmZvY3VzLmluZGV4T2YoaWQpID4gLTEpIHtcblx0XHRcdFx0dmlld1N0YXRlQ29udGV4dC5mb2N1cy5wdXNoKGNoaWxkQXN5bmNEYXRhVHJlZU5vZGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmlld1N0YXRlQ29udGV4dCAmJiB2aWV3U3RhdGVDb250ZXh0LnZpZXdTdGF0ZS5zZWxlY3Rpb24gJiYgdmlld1N0YXRlQ29udGV4dC52aWV3U3RhdGUuc2VsZWN0aW9uLmluZGV4T2YoaWQpID4gLTEpIHtcblx0XHRcdFx0dmlld1N0YXRlQ29udGV4dC5zZWxlY3Rpb24ucHVzaChjaGlsZEFzeW5jRGF0YVRyZWVOb2RlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHZpZXdTdGF0ZUNvbnRleHQgJiYgdmlld1N0YXRlQ29udGV4dC52aWV3U3RhdGUuZXhwYW5kZWQgJiYgdmlld1N0YXRlQ29udGV4dC52aWV3U3RhdGUuZXhwYW5kZWQuaW5kZXhPZihpZCkgPiAtMSkge1xuXHRcdFx0XHRjaGlsZHJlblRvUmVmcmVzaC5wdXNoKGNoaWxkQXN5bmNEYXRhVHJlZU5vZGUpO1xuXHRcdFx0fSBlbHNlIGlmIChoYXNDaGlsZHJlbiAmJiBjaGlsZEFzeW5jRGF0YVRyZWVOb2RlLmRlZmF1bHRDb2xsYXBzZVN0YXRlID09PSBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckV4cGFuZGVkKSB7XG5cdFx0XHRcdGNoaWxkcmVuVG9SZWZyZXNoLnB1c2goY2hpbGRBc3luY0RhdGFUcmVlTm9kZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGlsZEFzeW5jRGF0YVRyZWVOb2RlO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVzVG9Gb3JnZXQudmFsdWVzKCkpIHtcblx0XHRcdGRmcyhub2RlLCBub2RlID0+IHRoaXMubm9kZXMuZGVsZXRlKG5vZGUuZWxlbWVudCBhcyBUKSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0dGhpcy5ub2Rlcy5zZXQoY2hpbGQuZWxlbWVudCBhcyBULCBjaGlsZCk7XG5cdFx0fVxuXG5cdFx0c3BsaWNlKG5vZGUuY2hpbGRyZW4sIDAsIG5vZGUuY2hpbGRyZW4ubGVuZ3RoLCBjaGlsZHJlbik7XG5cblx0XHQvLyBUT0RPQGpvYW8gdGhpcyBkb2Vzbid0IHRha2UgZmlsdGVyIGludG8gYWNjb3VudFxuXHRcdGlmIChub2RlICE9PSB0aGlzLnJvb3QgJiYgdGhpcy5hdXRvRXhwYW5kU2luZ2xlQ2hpbGRyZW4gJiYgY2hpbGRyZW4ubGVuZ3RoID09PSAxICYmIGNoaWxkcmVuVG9SZWZyZXNoLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y2hpbGRyZW5bMF0uZm9yY2VFeHBhbmRlZCA9IHRydWU7XG5cdFx0XHRjaGlsZHJlblRvUmVmcmVzaC5wdXNoKGNoaWxkcmVuWzBdKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hpbGRyZW5Ub1JlZnJlc2g7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCB2aWV3U3RhdGVDb250ZXh0PzogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGVDb250ZXh0PFRJbnB1dCwgVD4sIG9wdGlvbnM/OiBJQXN5bmNEYXRhVHJlZVVwZGF0ZUNoaWxkcmVuT3B0aW9uczxUPik6IHZvaWQge1xuXHRcdGNvbnN0IGNoaWxkcmVuID0gbm9kZS5jaGlsZHJlbi5tYXAobm9kZSA9PiB0aGlzLmFzVHJlZUVsZW1lbnQobm9kZSwgdmlld1N0YXRlQ29udGV4dCkpO1xuXHRcdGNvbnN0IG9iamVjdFRyZWVPcHRpb25zOiBJT2JqZWN0VHJlZVNldENoaWxkcmVuT3B0aW9uczxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4gfCB1bmRlZmluZWQgPSBvcHRpb25zICYmIHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRkaWZmSWRlbnRpdHlQcm92aWRlcjogb3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlciAmJiB7XG5cdFx0XHRcdGdldElkKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+KTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuZGlmZklkZW50aXR5UHJvdmlkZXIhLmdldElkKG5vZGUuZWxlbWVudCBhcyBUKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0R3JvdXBJZDogb3B0aW9ucy5kaWZmSWRlbnRpdHlQcm92aWRlciEuZ2V0R3JvdXBJZCA/IChub2RlOiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPik6IG51bWJlciB8IE5vdFNlbGVjdGFibGVHcm91cElkVHlwZSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuZGlmZklkZW50aXR5UHJvdmlkZXIhLmdldEdyb3VwSWQhKG5vZGUuZWxlbWVudCBhcyBUKTtcblx0XHRcdFx0fSA6IHVuZGVmaW5lZFxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obm9kZSA9PT0gdGhpcy5yb290ID8gbnVsbCA6IG5vZGUsIGNoaWxkcmVuLCBvYmplY3RUcmVlT3B0aW9ucyk7XG5cblx0XHRpZiAobm9kZSAhPT0gdGhpcy5yb290KSB7XG5cdFx0XHR0aGlzLnRyZWUuc2V0Q29sbGFwc2libGUobm9kZSwgbm9kZS5oYXNDaGlsZHJlbik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRSZW5kZXIuZmlyZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzVHJlZUVsZW1lbnQobm9kZTogSUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIHZpZXdTdGF0ZUNvbnRleHQ/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZUNvbnRleHQ8VElucHV0LCBUPik6IElPYmplY3RUcmVlRWxlbWVudDxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4ge1xuXHRcdGlmIChub2RlLnN0YWxlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRlbGVtZW50OiBub2RlLFxuXHRcdFx0XHRjb2xsYXBzaWJsZTogbm9kZS5oYXNDaGlsZHJlbixcblx0XHRcdFx0Y29sbGFwc2VkOiB0cnVlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGxldCBjb2xsYXBzZWQ6IGJvb2xlYW4gfCBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckNvbGxhcHNlZCB8IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yRXhwYW5kZWQgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAodmlld1N0YXRlQ29udGV4dCAmJiB2aWV3U3RhdGVDb250ZXh0LnZpZXdTdGF0ZS5leHBhbmRlZCAmJiBub2RlLmlkICYmIHZpZXdTdGF0ZUNvbnRleHQudmlld1N0YXRlLmV4cGFuZGVkLmluZGV4T2Yobm9kZS5pZCkgPiAtMSkge1xuXHRcdFx0Y29sbGFwc2VkID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChub2RlLmZvcmNlRXhwYW5kZWQpIHtcblx0XHRcdGNvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdFx0bm9kZS5mb3JjZUV4cGFuZGVkID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbGxhcHNlZCA9IG5vZGUuZGVmYXVsdENvbGxhcHNlU3RhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IG5vZGUsXG5cdFx0XHRjaGlsZHJlbjogbm9kZS5oYXNDaGlsZHJlbiA/IEl0ZXJhYmxlLm1hcChub2RlLmNoaWxkcmVuLCBjaGlsZCA9PiB0aGlzLmFzVHJlZUVsZW1lbnQoY2hpbGQsIHZpZXdTdGF0ZUNvbnRleHQpKSA6IFtdLFxuXHRcdFx0Y29sbGFwc2libGU6IG5vZGUuaGFzQ2hpbGRyZW4sXG5cdFx0XHRjb2xsYXBzZWRcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIHByb2Nlc3NDaGlsZHJlbihjaGlsZHJlbjogSXRlcmFibGU8VD4pOiBJdGVyYWJsZTxUPiB7XG5cdFx0aWYgKHRoaXMuc29ydGVyKSB7XG5cdFx0XHRjaGlsZHJlbiA9IFsuLi5jaGlsZHJlbl0uc29ydCh0aGlzLnNvcnRlci5jb21wYXJlLmJpbmQodGhpcy5zb3J0ZXIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdH1cblxuXHQvLyB2aWV3IHN0YXRlXG5cblx0Z2V0Vmlld1N0YXRlKCk6IElBc3luY0RhdGFUcmVlVmlld1N0YXRlIHtcblx0XHRpZiAoIXRoaXMuaWRlbnRpdHlQcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IFRyZWVFcnJvcih0aGlzLnVzZXIsICdDYW5cXCd0IGdldCB0cmVlIHZpZXcgc3RhdGUgd2l0aG91dCBhbiBpZGVudGl0eSBwcm92aWRlcicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdldElkID0gKGVsZW1lbnQ6IFQpID0+IHRoaXMuaWRlbnRpdHlQcm92aWRlciEuZ2V0SWQoZWxlbWVudCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBmb2N1cyA9IHRoaXMuZ2V0Rm9jdXMoKS5tYXAoZ2V0SWQpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uKCkubWFwKGdldElkKTtcblxuXHRcdGNvbnN0IGV4cGFuZGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLnRyZWUuZ2V0Tm9kZSgpO1xuXHRcdGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuXG5cdFx0d2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBzdGFjay5wb3AoKSE7XG5cblx0XHRcdGlmIChub2RlICE9PSByb290ICYmIG5vZGUuY29sbGFwc2libGUgJiYgIW5vZGUuY29sbGFwc2VkKSB7XG5cdFx0XHRcdGV4cGFuZGVkLnB1c2goZ2V0SWQobm9kZS5lbGVtZW50IS5lbGVtZW50IGFzIFQpKTtcblx0XHRcdH1cblxuXHRcdFx0aW5zZXJ0SW50byhzdGFjaywgc3RhY2subGVuZ3RoLCBub2RlLmNoaWxkcmVuKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBmb2N1cywgc2VsZWN0aW9uLCBleHBhbmRlZCwgc2Nyb2xsVG9wOiB0aGlzLnNjcm9sbFRvcCB9O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFJlbmRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VOb2RlU2xvd1N0YXRlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLnRyZWUuZGlzcG9zZSgpO1xuXHR9XG59XG5cbnR5cGUgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU5vZGVNYXBwZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT4gPSBXZWFrTWFwcGVyPElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PiwgVEZpbHRlckRhdGE+LCBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUSW5wdXQgfCBUPiwgVEZpbHRlckRhdGE+PjtcblxuY2xhc3MgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU5vZGVXcmFwcGVyPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+IGltcGxlbWVudHMgSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VElucHV0IHwgVD4sIFRGaWx0ZXJEYXRhPiB7XG5cblx0Z2V0IGVsZW1lbnQoKTogSUNvbXByZXNzZWRUcmVlTm9kZTxUSW5wdXQgfCBUPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnRzOiB0aGlzLm5vZGUuZWxlbWVudC5lbGVtZW50cy5tYXAoZSA9PiBlLmVsZW1lbnQpLFxuXHRcdFx0aW5jb21wcmVzc2libGU6IHRoaXMubm9kZS5lbGVtZW50LmluY29tcHJlc3NpYmxlXG5cdFx0fTtcblx0fVxuXG5cdGdldCBjaGlsZHJlbigpOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUSW5wdXQgfCBUPiwgVEZpbHRlckRhdGE+W10geyByZXR1cm4gdGhpcy5ub2RlLmNoaWxkcmVuLm1hcChub2RlID0+IG5ldyBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlTm9kZVdyYXBwZXIobm9kZSkpOyB9XG5cdGdldCBkZXB0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ub2RlLmRlcHRoOyB9XG5cdGdldCB2aXNpYmxlQ2hpbGRyZW5Db3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ub2RlLnZpc2libGVDaGlsZHJlbkNvdW50OyB9XG5cdGdldCB2aXNpYmxlQ2hpbGRJbmRleCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ub2RlLnZpc2libGVDaGlsZEluZGV4OyB9XG5cdGdldCBjb2xsYXBzaWJsZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubm9kZS5jb2xsYXBzaWJsZTsgfVxuXHRnZXQgY29sbGFwc2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5ub2RlLmNvbGxhcHNlZDsgfVxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMubm9kZS52aXNpYmxlOyB9XG5cdGdldCBmaWx0ZXJEYXRhKCk6IFRGaWx0ZXJEYXRhIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMubm9kZS5maWx0ZXJEYXRhOyB9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj4sIFRGaWx0ZXJEYXRhPikgeyB9XG59XG5cbmNsYXNzIENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVSZW5kZXJlcjxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhLCBUVGVtcGxhdGVEYXRhPiBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhLCBJRGF0YVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+PiB7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nO1xuXHRwcml2YXRlIHJlbmRlcmVkTm9kZXMgPSBuZXcgTWFwPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCBJRGF0YVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+PigpO1xuXHRwcml2YXRlIGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlbmRlcmVyOiBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPFQsIFRGaWx0ZXJEYXRhLCBUVGVtcGxhdGVEYXRhPixcblx0XHRwcm90ZWN0ZWQgbm9kZU1hcHBlcjogQXN5bmNEYXRhVHJlZU5vZGVNYXBwZXI8VElucHV0LCBULCBURmlsdGVyRGF0YT4sXG5cdFx0cHJpdmF0ZSBjb21wcmVzc2libGVOb2RlTWFwcGVyUHJvdmlkZXI6ICgpID0+IENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVOb2RlTWFwcGVyPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+LFxuXHRcdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVHdpc3RpZVN0YXRlOiBFdmVudDxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPj5cblx0KSB7XG5cdFx0dGhpcy50ZW1wbGF0ZUlkID0gcmVuZGVyZXIudGVtcGxhdGVJZDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGF0YVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+IHtcblx0XHRjb25zdCB0ZW1wbGF0ZURhdGEgPSB0aGlzLnJlbmRlcmVyLnJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcik7XG5cdFx0cmV0dXJuIHsgdGVtcGxhdGVEYXRhIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4sIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlci5yZW5kZXJFbGVtZW50KHRoaXMubm9kZU1hcHBlci5tYXAobm9kZSkgYXMgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgaW5kZXgsIHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURhdGEsIGRldGFpbHMpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PiwgVEZpbHRlckRhdGE+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElEYXRhVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4sIGRldGFpbHM/OiBJVHJlZUVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlci5yZW5kZXJDb21wcmVzc2VkRWxlbWVudHModGhpcy5jb21wcmVzc2libGVOb2RlTWFwcGVyUHJvdmlkZXIoKS5tYXAobm9kZSkgYXMgSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8VD4sIFRGaWx0ZXJEYXRhPiwgaW5kZXgsIHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURhdGEsIGRldGFpbHMpO1xuXHR9XG5cblx0cmVuZGVyVHdpc3RpZShlbGVtZW50OiBJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgdHdpc3RpZUVsZW1lbnQ6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGVsZW1lbnQuc2xvdykge1xuXHRcdFx0dHdpc3RpZUVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnRyZWVJdGVtTG9hZGluZykpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHR3aXN0aWVFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi50cmVlSXRlbUxvYWRpbmcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRGF0YVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+LCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyZXIuZGlzcG9zZUVsZW1lbnQ/Lih0aGlzLm5vZGVNYXBwZXIubWFwKG5vZGUpIGFzIElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIGluZGV4LCB0ZW1wbGF0ZURhdGEudGVtcGxhdGVEYXRhLCBkZXRhaWxzKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4+LCBURmlsdGVyRGF0YT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSURhdGFUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiwgZGV0YWlscz86IElUcmVlRWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVyLmRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHM/Lih0aGlzLmNvbXByZXNzaWJsZU5vZGVNYXBwZXJQcm92aWRlcigpLm1hcChub2RlKSBhcyBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxUPiwgVEZpbHRlckRhdGE+LCBpbmRleCwgdGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSwgZGV0YWlscyk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJRGF0YVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+KTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyZWROb2Rlcy5jbGVhcigpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMgPSBkaXNwb3NlKHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlPFQ+IHtcblx0aXNJbmNvbXByZXNzaWJsZShlbGVtZW50OiBUKTogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gYXNDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uczxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPihvcHRpb25zPzogSUNvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPik6IElDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uczxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgb2JqZWN0VHJlZU9wdGlvbnMgPSBvcHRpb25zICYmIGFzT2JqZWN0VHJlZU9wdGlvbnMob3B0aW9ucyk7XG5cblx0cmV0dXJuIG9iamVjdFRyZWVPcHRpb25zICYmIHtcblx0XHQuLi5vYmplY3RUcmVlT3B0aW9ucyxcblx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBvYmplY3RUcmVlT3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyICYmIHtcblx0XHRcdC4uLm9iamVjdFRyZWVPcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsXG5cdFx0XHRnZXRDb21wcmVzc2VkTm9kZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVscykge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyIS5nZXRDb21wcmVzc2VkTm9kZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVscy5tYXAoZSA9PiBlLmVsZW1lbnQgYXMgVCkpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0c3RpY2t5U2Nyb2xsRGVsZWdhdGU6IG9iamVjdFRyZWVPcHRpb25zLnN0aWNreVNjcm9sbERlbGVnYXRlIGFzIElTdGlja3lTY3JvbGxEZWxlZ2F0ZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkXG5cdH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4gZXh0ZW5kcyBJQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IHtcblx0cmVhZG9ubHkgY29tcHJlc3Npb25FbmFibGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkga2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcj86IElDb21wcmVzc2libGVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPFQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wcmVzc2libGVBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZTxUPiBleHRlbmRzIElBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZTxUPiB7XG5cdHJlYWRvbmx5IGNvbXByZXNzaW9uRW5hYmxlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPFRJbnB1dCwgVCwgVEZpbHRlckRhdGEgPSB2b2lkPiBleHRlbmRzIEFzeW5jRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YT4ge1xuXG5cdHByb3RlY3RlZCBkZWNsYXJlIHJlYWRvbmx5IHRyZWU6IENvbXByZXNzaWJsZU9iamVjdFRyZWU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhPjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbXByZXNzaWJsZU5vZGVNYXBwZXI6IENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVOb2RlTWFwcGVyPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+ID0gbmV3IFdlYWtNYXBwZXIobm9kZSA9PiBuZXcgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU5vZGVXcmFwcGVyKG5vZGUpKTtcblx0cHJpdmF0ZSBmaWx0ZXI/OiBJVHJlZUZpbHRlcjxULCBURmlsdGVyRGF0YT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0dmlydHVhbERlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPixcblx0XHRwcml2YXRlIGNvbXByZXNzaW9uRGVsZWdhdGU6IElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIHVua25vd24+W10sXG5cdFx0ZGF0YVNvdXJjZTogSUFzeW5jRGF0YVNvdXJjZTxUSW5wdXQsIFQ+LFxuXHRcdG9wdGlvbnM6IElDb21wcmVzc2libGVBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gPSB7fVxuXHQpIHtcblx0XHRzdXBlcih1c2VyLCBjb250YWluZXIsIHZpcnR1YWxEZWxlZ2F0ZSwgcmVuZGVyZXJzLCBkYXRhU291cmNlLCBvcHRpb25zKTtcblx0XHR0aGlzLmZpbHRlciA9IG9wdGlvbnMuZmlsdGVyO1xuXHR9XG5cblx0Z2V0Q29tcHJlc3NlZFRyZWVOb2RlKGU6IFQgfCBUSW5wdXQpIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5nZXREYXRhTm9kZShlKTtcblx0XHRyZXR1cm4gdGhpcy50cmVlLmdldENvbXByZXNzZWRUcmVlTm9kZShub2RlKS5lbGVtZW50O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZVRyZWUoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+LFxuXHRcdHJlbmRlcmVyczogSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgdW5rbm93bj5bXSxcblx0XHRvcHRpb25zOiBJQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+XG5cdCk6IE9iamVjdFRyZWU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4sIFRGaWx0ZXJEYXRhPiB7XG5cdFx0Y29uc3Qgb2JqZWN0VHJlZURlbGVnYXRlID0gbmV3IENvbXBvc2VkVHJlZURlbGVnYXRlPFRJbnB1dCB8IFQsIElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PihkZWxlZ2F0ZSk7XG5cdFx0Y29uc3Qgb2JqZWN0VHJlZVJlbmRlcmVycyA9IHJlbmRlcmVycy5tYXAociA9PiBuZXcgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZVJlbmRlcmVyKHIsIHRoaXMubm9kZU1hcHBlciwgKCkgPT4gdGhpcy5jb21wcmVzc2libGVOb2RlTWFwcGVyLCB0aGlzLl9vbkRpZENoYW5nZU5vZGVTbG93U3RhdGUuZXZlbnQpKTtcblx0XHRjb25zdCBvYmplY3RUcmVlT3B0aW9ucyA9IGFzQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnM8VElucHV0LCBULCBURmlsdGVyRGF0YT4ob3B0aW9ucykgfHwge307XG5cblx0XHRyZXR1cm4gbmV3IENvbXByZXNzaWJsZU9iamVjdFRyZWUodXNlciwgY29udGFpbmVyLCBvYmplY3RUcmVlRGVsZWdhdGUsIG9iamVjdFRyZWVSZW5kZXJlcnMsIG9iamVjdFRyZWVPcHRpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc1RyZWVFbGVtZW50KG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCB2aWV3U3RhdGVDb250ZXh0PzogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGVDb250ZXh0PFRJbnB1dCwgVD4pOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluY29tcHJlc3NpYmxlOiB0aGlzLmNvbXByZXNzaW9uRGVsZWdhdGUuaXNJbmNvbXByZXNzaWJsZShub2RlLmVsZW1lbnQgYXMgVCksXG5cdFx0XHQuLi5zdXBlci5hc1RyZWVFbGVtZW50KG5vZGUsIHZpZXdTdGF0ZUNvbnRleHQpXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFZpZXdTdGF0ZSgpOiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSB7XG5cdFx0aWYgKCF0aGlzLmlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBUcmVlRXJyb3IodGhpcy51c2VyLCAnQ2FuXFwndCBnZXQgdHJlZSB2aWV3IHN0YXRlIHdpdGhvdXQgYW4gaWRlbnRpdHkgcHJvdmlkZXInKTtcblx0XHR9XG5cblx0XHRjb25zdCBnZXRJZCA9IChlbGVtZW50OiBUKSA9PiB0aGlzLmlkZW50aXR5UHJvdmlkZXIhLmdldElkKGVsZW1lbnQpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmdldEZvY3VzKCkubWFwKGdldElkKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvbigpLm1hcChnZXRJZCk7XG5cblx0XHRjb25zdCBleHBhbmRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCByb290ID0gdGhpcy50cmVlLmdldENvbXByZXNzZWRUcmVlTm9kZSgpO1xuXHRcdGNvbnN0IHN0YWNrID0gW3Jvb3RdO1xuXG5cdFx0d2hpbGUgKHN0YWNrLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IG5vZGUgPSBzdGFjay5wb3AoKSE7XG5cblx0XHRcdGlmIChub2RlICE9PSByb290ICYmIG5vZGUuY29sbGFwc2libGUgJiYgIW5vZGUuY29sbGFwc2VkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgYXN5bmNOb2RlIG9mIG5vZGUuZWxlbWVudCEuZWxlbWVudHMpIHtcblx0XHRcdFx0XHRleHBhbmRlZC5wdXNoKGdldElkKGFzeW5jTm9kZS5lbGVtZW50IGFzIFQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzdGFjay5wdXNoKC4uLm5vZGUuY2hpbGRyZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGZvY3VzLCBzZWxlY3Rpb24sIGV4cGFuZGVkLCBzY3JvbGxUb3A6IHRoaXMuc2Nyb2xsVG9wIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyKG5vZGU6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+LCB2aWV3U3RhdGVDb250ZXh0PzogSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGVDb250ZXh0PFRJbnB1dCwgVD4sIG9wdGlvbnM/OiBJQXN5bmNEYXRhVHJlZVVwZGF0ZUNoaWxkcmVuT3B0aW9uczxUPik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pZGVudGl0eVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIucmVuZGVyKG5vZGUsIHZpZXdTdGF0ZUNvbnRleHQpO1xuXHRcdH1cblxuXHRcdC8vIFByZXNlcnZlIHRyYWl0cyBhY3Jvc3MgY29tcHJlc3Npb25zLiBIYWNreSBidXQgZG9lcyB0aGUgdHJpY2suXG5cdFx0Ly8gVGhpcyBpcyBoYXJkIHRvIGZpeCBwcm9wZXJseSBzaW5jZSBpdCByZXF1aXJlcyByZXdyaXRpbmcgdGhlIHRyYWl0c1xuXHRcdC8vIGFjcm9zcyB0cmVlcyBhbmQgbGlzdHMuIExldCdzIGp1c3Qga2VlcCBpdCB0aGlzIHdheSBmb3Igbm93LlxuXHRcdGNvbnN0IGdldElkID0gKGVsZW1lbnQ6IFQpID0+IHRoaXMuaWRlbnRpdHlQcm92aWRlciEuZ2V0SWQoZWxlbWVudCkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBnZXRVbmNvbXByZXNzZWRJZHMgPSAobm9kZXM6IElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+W10pOiBTZXQ8c3RyaW5nPiA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIG5vZGVzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbXByZXNzZWROb2RlID0gdGhpcy50cmVlLmdldENvbXByZXNzZWRUcmVlTm9kZShub2RlID09PSB0aGlzLnJvb3QgPyBudWxsIDogbm9kZSk7XG5cblx0XHRcdFx0aWYgKCFjb21wcmVzc2VkTm9kZS5lbGVtZW50KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgY29tcHJlc3NlZE5vZGUuZWxlbWVudC5lbGVtZW50cykge1xuXHRcdFx0XHRcdHJlc3VsdC5hZGQoZ2V0SWQobm9kZS5lbGVtZW50IGFzIFQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cblx0XHRjb25zdCBvbGRTZWxlY3Rpb24gPSBnZXRVbmNvbXByZXNzZWRJZHModGhpcy50cmVlLmdldFNlbGVjdGlvbigpIGFzIElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+W10pO1xuXHRcdGNvbnN0IG9sZEZvY3VzID0gZ2V0VW5jb21wcmVzc2VkSWRzKHRoaXMudHJlZS5nZXRGb2N1cygpIGFzIElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+W10pO1xuXG5cdFx0c3VwZXIucmVuZGVyKG5vZGUsIHZpZXdTdGF0ZUNvbnRleHQsIG9wdGlvbnMpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcblx0XHRsZXQgZGlkQ2hhbmdlU2VsZWN0aW9uID0gZmFsc2U7XG5cblx0XHRjb25zdCBmb2N1cyA9IHRoaXMuZ2V0Rm9jdXMoKTtcblx0XHRsZXQgZGlkQ2hhbmdlRm9jdXMgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHZpc2l0ID0gKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+PiB8IG51bGwsIFRGaWx0ZXJEYXRhPikgPT4ge1xuXHRcdFx0Y29uc3QgY29tcHJlc3NlZE5vZGUgPSBub2RlLmVsZW1lbnQ7XG5cblx0XHRcdGlmIChjb21wcmVzc2VkTm9kZSkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNvbXByZXNzZWROb2RlLmVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBnZXRJZChjb21wcmVzc2VkTm9kZS5lbGVtZW50c1tpXS5lbGVtZW50IGFzIFQpO1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBjb21wcmVzc2VkTm9kZS5lbGVtZW50c1tjb21wcmVzc2VkTm9kZS5lbGVtZW50cy5sZW5ndGggLSAxXS5lbGVtZW50IGFzIFQ7XG5cblx0XHRcdFx0XHQvLyBnaXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzg1OTM4XG5cdFx0XHRcdFx0aWYgKG9sZFNlbGVjdGlvbi5oYXMoaWQpICYmIHNlbGVjdGlvbi5pbmRleE9mKGVsZW1lbnQpID09PSAtMSkge1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uLnB1c2goZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRkaWRDaGFuZ2VTZWxlY3Rpb24gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChvbGRGb2N1cy5oYXMoaWQpICYmIGZvY3VzLmluZGV4T2YoZWxlbWVudCkgPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRmb2N1cy5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0ZGlkQ2hhbmdlRm9jdXMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRub2RlLmNoaWxkcmVuLmZvckVhY2godmlzaXQpO1xuXHRcdH07XG5cblx0XHR2aXNpdCh0aGlzLnRyZWUuZ2V0Q29tcHJlc3NlZFRyZWVOb2RlKG5vZGUgPT09IHRoaXMucm9vdCA/IG51bGwgOiBub2RlKSk7XG5cblx0XHRpZiAoZGlkQ2hhbmdlU2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLnNldFNlbGVjdGlvbihzZWxlY3Rpb24pO1xuXHRcdH1cblxuXHRcdGlmIChkaWRDaGFuZ2VGb2N1cykge1xuXHRcdFx0dGhpcy5zZXRGb2N1cyhmb2N1cyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRm9yIGNvbXByZXNzZWQgYXN5bmMgZGF0YSB0cmVlcywgYFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2VgIGRvZXNuJ3QgY3VycmVudGx5IHdvcmtcblx0Ly8gYW5kIHdlIGhhdmUgdG8gZmlsdGVyIGV2ZXJ5dGhpbmcgYmVmb3JlaGFuZFxuXHQvLyBSZWxhdGVkIHRvICM4NTE5MyBhbmQgIzg1ODM1XG5cdHByb3RlY3RlZCBvdmVycmlkZSBwcm9jZXNzQ2hpbGRyZW4oY2hpbGRyZW46IEl0ZXJhYmxlPFQ+KTogSXRlcmFibGU8VD4ge1xuXHRcdGlmICh0aGlzLmZpbHRlcikge1xuXHRcdFx0Y2hpbGRyZW4gPSBJdGVyYWJsZS5maWx0ZXIoY2hpbGRyZW4sIGUgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmZpbHRlciEuZmlsdGVyKGUsIFRyZWVWaXNpYmlsaXR5LlZpc2libGUpO1xuXHRcdFx0XHRjb25zdCB2aXNpYmlsaXR5ID0gZ2V0VmlzaWJpbGl0eShyZXN1bHQpO1xuXG5cdFx0XHRcdGlmICh2aXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdSZWN1cnNpdmUgdHJlZSB2aXNpYmlsaXR5IG5vdCBzdXBwb3J0ZWQgaW4gYXN5bmMgZGF0YSBjb21wcmVzc2VkIHRyZWVzJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuVmlzaWJsZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5wcm9jZXNzQ2hpbGRyZW4oY2hpbGRyZW4pO1xuXHR9XG5cblx0b3ZlcnJpZGUgbmF2aWdhdGUoc3RhcnQ/OiBUKTogQXN5bmNEYXRhVHJlZU5hdmlnYXRvcjxUSW5wdXQsIFQ+IHtcblx0XHQvLyBBc3N1bXB0aW9ucyBhcmUgbWFkZSBhYm91dCBob3cgdHJlZSBuYXZpZ2F0aW9uIHdvcmtzIGluIGNvbXByZXNzZWQgdHJlZXNcblx0XHQvLyBUaGVzZSBhc3N1bXB0aW9ucyBtYXkgYmUgd3JvbmcgYW5kIHdlIHNob3VsZCByZXZpc2l0IHRoaXMgd2hlbiBuZWVkZWRcblxuXHRcdC8vIEV4YW1wbGU6XHRbYSwgYi9iYSwgYmEudHh0XVxuXHRcdC8vIC0gcHJldmlvdXMoYmEpID0+IGFcblx0XHQvLyAtIHByZXZpb3VzKGIpID0+IGFcblx0XHQvLyAtIG5leHQoYSkgPT4gYmFcblx0XHQvLyAtIG5leHQoYikgPT4gYmFcblx0XHQvLyAtIG5leHQoYmEpID0+IGJhLnR4dFxuXHRcdHJldHVybiBzdXBlci5uYXZpZ2F0ZShzdGFydCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0VmlzaWJpbGl0eTxURmlsdGVyRGF0YT4oZmlsdGVyUmVzdWx0OiBUcmVlRmlsdGVyUmVzdWx0PFRGaWx0ZXJEYXRhPik6IFRyZWVWaXNpYmlsaXR5IHtcblx0aWYgKHR5cGVvZiBmaWx0ZXJSZXN1bHQgPT09ICdib29sZWFuJykge1xuXHRcdHJldHVybiBmaWx0ZXJSZXN1bHQgPyBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlIDogVHJlZVZpc2liaWxpdHkuSGlkZGVuO1xuXHR9IGVsc2UgaWYgKGlzRmlsdGVyUmVzdWx0KGZpbHRlclJlc3VsdCkpIHtcblx0XHRyZXR1cm4gZ2V0VmlzaWJsZVN0YXRlKGZpbHRlclJlc3VsdC52aXNpYmlsaXR5KTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gZ2V0VmlzaWJsZVN0YXRlKGZpbHRlclJlc3VsdCk7XG5cdH1cbn1cblxuY2xhc3MgQXN5bmNEYXRhVHJlZU5hdmlnYXRvcjxUSW5wdXQsIFQ+IGltcGxlbWVudHMgSVRyZWVOYXZpZ2F0b3I8VD4ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgbmF2aWdhdG9yOiBJVHJlZU5hdmlnYXRvcjxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGw+KSB7IH1cblxuXHRjdXJyZW50KCk6IFQgfCBudWxsIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5uYXZpZ2F0b3IuY3VycmVudCgpO1xuXHRcdGlmIChjdXJyZW50ID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY3VycmVudC5lbGVtZW50IGFzIFQ7XG5cdH1cblxuXHRwcmV2aW91cygpOiBUIHwgbnVsbCB7XG5cdFx0dGhpcy5uYXZpZ2F0b3IucHJldmlvdXMoKTtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50KCk7XG5cdH1cblxuXHRmaXJzdCgpOiBUIHwgbnVsbCB7XG5cdFx0dGhpcy5uYXZpZ2F0b3IuZmlyc3QoKTtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50KCk7XG5cdH1cblxuXHRsYXN0KCk6IFQgfCBudWxsIHtcblx0XHR0aGlzLm5hdmlnYXRvci5sYXN0KCk7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudCgpO1xuXHR9XG5cblx0bmV4dCgpOiBUIHwgbnVsbCB7XG5cdFx0dGhpcy5uYXZpZ2F0b3IubmV4dCgpO1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnQoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBUywrQkFBcUQ7QUFFOUQsU0FBUyxzQkFBc0IsY0FBc0gsWUFBWSxzQkFBK0c7QUFFaFIsU0FBUyxpQkFBaUIsc0JBQXNCO0FBQ2hELFNBQVMsd0JBQW9MLGtCQUFrQjtBQUMvTSxTQUErTyxnQ0FBZ0MsV0FBNkIsZ0JBQWdCLGtCQUFrQjtBQUM5VSxTQUE0Qix5QkFBeUIsVUFBVSxrQkFBa0IsZUFBZTtBQUNoRyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUIseUJBQXlCO0FBQ3ZELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCLFNBQXNCLG9CQUFvQjtBQUVwRSxTQUFTLGtCQUFrQjtBQUMzQixTQUE0QiwrQkFBK0I7QUFFM0QsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZLGNBQWM7QUFDbkMsU0FBUyxnQkFBZ0I7QUFzQnpCLFNBQVMsd0JBQW1DLE9BQWtGO0FBQzdILFNBQU87QUFBQSxJQUNOLEdBQUc7QUFBQSxJQUNILFVBQVUsQ0FBQztBQUFBLElBQ1gsZ0JBQWdCO0FBQUEsSUFDaEIsT0FBTztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sZUFBZTtBQUFBLEVBQ2hCO0FBQ0Q7QUFFQSxTQUFTLFdBQXNCLFVBQXlDLFlBQW9EO0FBQzNILE1BQUksQ0FBQyxXQUFXLFFBQVE7QUFDdkIsV0FBTztBQUFBLEVBQ1IsV0FBVyxXQUFXLFdBQVcsVUFBVTtBQUMxQyxXQUFPO0FBQUEsRUFDUixPQUFPO0FBQ04sV0FBTyxXQUFXLFVBQVUsV0FBVyxNQUFNO0FBQUEsRUFDOUM7QUFDRDtBQUVBLFNBQVMsV0FBc0IsTUFBcUMsT0FBK0M7QUFDbEgsU0FBTyxTQUFTLFNBQVMsV0FBVyxNQUFNLEtB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
