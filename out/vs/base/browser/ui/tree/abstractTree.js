import { $, append, clearNode, h, hasParentWithClass, isActiveElement, isKeyboardEvent, addDisposableListener, isEditableElement } from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { asCssValueWithDefault } from "../../cssValue.js";
import { DomEmitter } from "../../event.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { ActionBar } from "../actionbar/actionbar.js";
import { FindInput } from "../findinput/findInput.js";
import { MessageType, unthemedInboxStyles } from "../inputbox/inputBox.js";
import { ElementsDragAndDropData } from "../list/listView.js";
import { isActionItem, isButton, isMonacoCustomToggle, isMonacoEditor, isStickyScrollContainer, isStickyScrollElement, List, MouseController } from "../list/listWidget.js";
import { Toggle, unthemedToggleStyles } from "../toggle/toggle.js";
import { getVisibleState, isFilterResult } from "./indexTreeModel.js";
import { TreeDragOverBubble, TreeError, TreeMouseEventTarget, TreeVisibility } from "./tree.js";
import { Action } from "../../../common/actions.js";
import { distinct, equals, insertInto, range } from "../../../common/arrays.js";
import { Delayer, disposableTimeout, timeout } from "../../../common/async.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { SetMap } from "../../../common/map.js";
import { Emitter, Event, EventBufferer, Relay } from "../../../common/event.js";
import { fuzzyScore, FuzzyScore } from "../../../common/filters.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../common/lifecycle.js";
import { isMacintosh } from "../../../common/platform.js";
import { clamp } from "../../../common/numbers.js";
import "./media/tree.css";
import { localize } from "../../../../nls.js";
import { autorun, constObservable } from "../../../common/observable.js";
import { alert } from "../aria/aria.js";
class TreeElementsDragAndDropData extends ElementsDragAndDropData {
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
function asTreeDragAndDropData(data) {
  if (data instanceof ElementsDragAndDropData) {
    return new TreeElementsDragAndDropData(data);
  }
  return data;
}
class TreeNodeListDragAndDrop {
  constructor(modelProvider, dnd) {
    this.modelProvider = modelProvider;
    this.dnd = dnd;
    this.autoExpandDisposable = Disposable.None;
    this.disposables = new DisposableStore();
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
    this.dnd.onDragStart?.(asTreeDragAndDropData(data), originalEvent);
  }
  onDragOver(data, targetNode, targetIndex, targetSector, originalEvent, raw = true) {
    const result = this.dnd.onDragOver(asTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
    const didChangeAutoExpandNode = this.autoExpandNode !== targetNode;
    if (didChangeAutoExpandNode) {
      this.autoExpandDisposable.dispose();
      this.autoExpandNode = targetNode;
    }
    if (typeof targetNode === "undefined") {
      return result;
    }
    if (didChangeAutoExpandNode && typeof result !== "boolean" && result.autoExpand) {
      this.autoExpandDisposable = disposableTimeout(() => {
        const model2 = this.modelProvider();
        const ref2 = model2.getNodeLocation(targetNode);
        if (model2.isCollapsed(ref2)) {
          model2.setCollapsed(ref2, false);
        }
        this.autoExpandNode = void 0;
      }, 500, this.disposables);
    }
    if (typeof result === "boolean" || !result.accept || typeof result.bubble === "undefined" || result.feedback) {
      if (!raw) {
        const accept = typeof result === "boolean" ? result : result.accept;
        const effect = typeof result === "boolean" ? void 0 : result.effect;
        return { accept, effect, feedback: [targetIndex] };
      }
      return result;
    }
    if (result.bubble === TreeDragOverBubble.Up) {
      const model2 = this.modelProvider();
      const ref2 = model2.getNodeLocation(targetNode);
      const parentRef = model2.getParentNodeLocation(ref2);
      const parentNode = model2.getNode(parentRef);
      const parentIndex = parentRef && model2.getListIndex(parentRef);
      return this.onDragOver(data, parentNode, parentIndex, targetSector, originalEvent, false);
    }
    const model = this.modelProvider();
    const ref = model.getNodeLocation(targetNode);
    const start = model.getListIndex(ref);
    const length = model.getListRenderCount(ref);
    return { ...result, feedback: range(start, start + length) };
  }
  drop(data, targetNode, targetIndex, targetSector, originalEvent) {
    this.autoExpandDisposable.dispose();
    this.autoExpandNode = void 0;
    this.dnd.drop(asTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
  }
  onDragEnd(originalEvent) {
    this.dnd.onDragEnd?.(originalEvent);
  }
  dispose() {
    this.disposables.dispose();
    this.dnd.dispose();
  }
}
function asListOptions(modelProvider, disposableStore, options) {
  return options && {
    ...options,
    identityProvider: options.identityProvider && {
      getId(el) {
        return options.identityProvider.getId(el.element);
      },
      getGroupId: options.identityProvider.getGroupId ? (el) => {
        return options.identityProvider.getGroupId(el.element);
      } : void 0
    },
    dnd: options.dnd && disposableStore.add(new TreeNodeListDragAndDrop(modelProvider, options.dnd)),
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
      getSetSize(node) {
        const model = modelProvider();
        const ref = model.getNodeLocation(node);
        const parentRef = model.getParentNodeLocation(ref);
        const parentNode = model.getNode(parentRef);
        return parentNode.visibleChildrenCount;
      },
      getPosInSet(node) {
        return node.visibleChildIndex + 1;
      },
      isChecked: options.accessibilityProvider && options.accessibilityProvider.isChecked ? (node) => {
        return options.accessibilityProvider.isChecked(node.element);
      } : void 0,
      getRole: options.accessibilityProvider && options.accessibilityProvider.getRole ? (node) => {
        return options.accessibilityProvider.getRole(node.element);
      } : () => "treeitem",
      getAriaLabel(e) {
        return options.accessibilityProvider.getAriaLabel(e.element);
      },
      getWidgetAriaLabel() {
        return options.accessibilityProvider.getWidgetAriaLabel();
      },
      getWidgetRole: options.accessibilityProvider && options.accessibilityProvider.getWidgetRole ? () => options.accessibilityProvider.getWidgetRole() : () => "tree",
      getAriaLevel: options.accessibilityProvider && options.accessibilityProvider.getAriaLevel ? (node) => options.accessibilityProvider.getAriaLevel(node.element) : (node) => {
        return node.depth;
      },
      getActiveDescendantId: options.accessibilityProvider.getActiveDescendantId && ((node) => {
        return options.accessibilityProvider.getActiveDescendantId(node.element);
      })
    },
    keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
      ...options.keyboardNavigationLabelProvider,
      getKeyboardNavigationLabel(node) {
        return options.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(node.element);
      }
    }
  };
}
class ComposedTreeDelegate {
  constructor(delegate) {
    this.delegate = delegate;
  }
  getHeight(element) {
    return this.delegate.getHeight(element.element);
  }
  getTemplateId(element) {
    return this.delegate.getTemplateId(element.element);
  }
  hasDynamicHeight(element) {
    return !!this.delegate.hasDynamicHeight && this.delegate.hasDynamicHeight(element.element);
  }
  setDynamicHeight(element, height) {
    this.delegate.setDynamicHeight?.(element.element, height);
  }
}
class AbstractTreeViewState {
  static lift(state) {
    return state instanceof AbstractTreeViewState ? state : new AbstractTreeViewState(state);
  }
  static empty(scrollTop = 0) {
    return new AbstractTreeViewState({
      focus: [],
      selection: [],
      expanded: /* @__PURE__ */ Object.create(null),
      scrollTop
    });
  }
  constructor(state) {
    this.focus = new Set(state.focus);
    this.selection = new Set(state.selection);
    if (state.expanded instanceof Array) {
      this.expanded = /* @__PURE__ */ Object.create(null);
      for (const id of state.expanded) {
        this.expanded[id] = 1;
      }
    } else {
      this.expanded = state.expanded;
    }
    this.expanded = state.expanded;
    this.scrollTop = state.scrollTop;
  }
  toJSON() {
    return {
      focus: Array.from(this.focus),
      selection: Array.from(this.selection),
      expanded: this.expanded,
      scrollTop: this.scrollTop
    };
  }
}
var RenderIndentGuides = /* @__PURE__ */ ((RenderIndentGuides2) => {
  RenderIndentGuides2["None"] = "none";
  RenderIndentGuides2["OnHover"] = "onHover";
  RenderIndentGuides2["Always"] = "always";
  return RenderIndentGuides2;
})(RenderIndentGuides || {});
class EventCollection {
  constructor(onDidChange, _elements = []) {
    this._elements = _elements;
    this.disposables = new DisposableStore();
    this.onDidChange = Event.forEach(onDidChange, (elements) => this._elements = elements, this.disposables);
  }
  get elements() {
    return this._elements;
  }
  dispose() {
    this.disposables.dispose();
  }
}
const _TreeRenderer = class _TreeRenderer {
  constructor(renderer, model, onDidChangeCollapseState, activeNodes, renderedIndentGuides, options = {}) {
    this.renderer = renderer;
    this.model = model;
    this.activeNodes = activeNodes;
    this.renderedIndentGuides = renderedIndentGuides;
    this.renderedElements = /* @__PURE__ */ new Map();
    this.renderedNodes = /* @__PURE__ */ new Map();
    this.indent = _TreeRenderer.DefaultIndent;
    this.defaultIndent = _TreeRenderer.DefaultIndent;
    this.hideTwistiesOfChildlessElements = false;
    this.shouldRenderIndentGuides = false;
    this.activeIndentNodes = /* @__PURE__ */ new Set();
    this.indentGuidesDisposable = Disposable.None;
    this.disposables = new DisposableStore();
    this.templateId = renderer.templateId;
    this.updateOptions(options);
    Event.map(onDidChangeCollapseState, (e) => e.node)(this.onDidChangeNodeTwistieState, this, this.disposables);
    renderer.onDidChangeTwistieState?.(this.onDidChangeTwistieState, this, this.disposables);
  }
  updateOptions(options = {}) {
    if (typeof options.defaultIndent !== "undefined") {
      this.defaultIndent = options.defaultIndent;
    }
    if (typeof options.indent !== "undefined" || typeof options.defaultIndent !== "undefined") {
      const indent = typeof options.indent !== "undefined" ? clamp(options.indent, 0, 40) : this.indent;
      const needsRerender = indent !== this.indent || typeof options.defaultIndent !== "undefined";
      if (needsRerender) {
        this.indent = indent;
        for (const [node, templateData] of this.renderedNodes) {
          templateData.indentSize = this.defaultIndent + (node.depth - 1) * this.indent;
          this.renderTreeElement(node, templateData);
        }
      }
    }
    if (typeof options.renderIndentGuides !== "undefined") {
      const shouldRenderIndentGuides = options.renderIndentGuides !== "none" /* None */;
      if (shouldRenderIndentGuides !== this.shouldRenderIndentGuides) {
        this.shouldRenderIndentGuides = shouldRenderIndentGuides;
        for (const [node, templateData] of this.renderedNodes) {
          this._renderIndentGuides(node, templateData);
        }
        this.indentGuidesDisposable.dispose();
        if (shouldRenderIndentGuides) {
          const disposables = new DisposableStore();
          this.activeNodes.onDidChange(this._onDidChangeActiveNodes, this, disposables);
          this.indentGuidesDisposable = disposables;
          this._onDidChangeActiveNodes(this.activeNodes.elements);
        }
      }
    }
    if (typeof options.hideTwistiesOfChildlessElements !== "undefined") {
      this.hideTwistiesOfChildlessElements = options.hideTwistiesOfChildlessElements;
    }
    if (typeof options.twistieAdditionalCssClass !== "undefined") {
      this.twistieAdditionalCssClass = options.twistieAdditionalCssClass;
    }
  }
  renderTemplate(container) {
    const el = append(container, $(".monaco-tl-row"));
    const indent = append(el, $(".monaco-tl-indent"));
    const twistie = append(el, $(".monaco-tl-twistie"));
    const contents = append(el, $(".monaco-tl-contents"));
    const templateData = this.renderer.renderTemplate(contents);
    return { container, indent, twistie, indentGuidesDisposable: Disposable.None, indentSize: 0, templateData };
  }
  renderElement(node, index, templateData, details) {
    templateData.indentSize = this.defaultIndent + (node.depth - 1) * this.indent;
    this.renderedNodes.set(node, templateData);
    this.renderedElements.set(node.element, node);
    this.renderTreeElement(node, templateData);
    this.renderer.renderElement(node, index, templateData.templateData, { ...details, indent: templateData.indentSize });
  }
  disposeElement(node, index, templateData, details) {
    templateData.indentGuidesDisposable.dispose();
    this.renderer.disposeElement?.(node, index, templateData.templateData, { ...details, indent: templateData.indentSize });
    if (typeof details?.height === "number") {
      this.renderedNodes.delete(node);
      this.renderedElements.delete(node.element);
    }
  }
  disposeTemplate(templateData) {
    this.renderer.disposeTemplate(templateData.templateData);
  }
  onDidChangeTwistieState(element) {
    const node = this.renderedElements.get(element);
    if (!node) {
      return;
    }
    this.onDidChangeNodeTwistieState(node);
  }
  onDidChangeNodeTwistieState(node) {
    const templateData = this.renderedNodes.get(node);
    if (!templateData) {
      return;
    }
    this._onDidChangeActiveNodes(this.activeNodes.elements);
    this.renderTreeElement(node, templateData);
  }
  renderTreeElement(node, templateData) {
    templateData.twistie.className = templateData.twistie.classList.item(0);
    templateData.twistie.style.paddingLeft = `${templateData.indentSize}px`;
    templateData.indent.style.width = `${templateData.indentSize + this.indent - 16}px`;
    if (node.collapsible) {
      templateData.container.setAttribute("aria-expanded", String(!node.collapsed));
    } else {
      templateData.container.removeAttribute("aria-expanded");
    }
    templateData.twistie.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemExpanded));
    let twistieRendered = false;
    if (this.renderer.renderTwistie) {
      twistieRendered = this.renderer.renderTwistie(node.element, templateData.twistie);
    }
    if (node.collapsible && (!this.hideTwistiesOfChildlessElements || node.visibleChildrenCount > 0)) {
      if (!twistieRendered) {
        templateData.twistie.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemExpanded));
      }
      templateData.twistie.classList.add("collapsible");
      templateData.twistie.classList.toggle("collapsed", node.collapsed);
    } else {
      templateData.twistie.classList.remove("collapsible", "collapsed");
    }
    if (this.twistieAdditionalCssClass) {
      const additionalClass = this.twistieAdditionalCssClass(node.element);
      if (additionalClass) {
        templateData.twistie.classList.add(additionalClass);
      }
    }
    this._renderIndentGuides(node, templateData);
  }
  _renderIndentGuides(node, templateData) {
    clearNode(templateData.indent);
    templateData.indentGuidesDisposable.dispose();
    if (!this.shouldRenderIndentGuides) {
      return;
    }
    const disposableStore = new DisposableStore();
    while (true) {
      const ref = this.model.getNodeLocation(node);
      const parentRef = this.model.getParentNodeLocation(ref);
      if (!parentRef) {
        break;
      }
      const parent = this.model.getNode(parentRef);
      const guide = $(".indent-guide", { style: `width: ${this.indent}px` });
      if (this.activeIndentNodes.has(parent)) {
        guide.classList.add("active");
      }
      if (templateData.indent.childElementCount === 0) {
        templateData.indent.appendChild(guide);
      } else {
        templateData.indent.insertBefore(guide, templateData.indent.firstElementChild);
      }
      this.renderedIndentGuides.add(parent, guide);
      disposableStore.add(toDisposable(() => this.renderedIndentGuides.delete(parent, guide)));
      node = parent;
    }
    templateData.indentGuidesDisposable = disposableStore;
  }
  _onDidChangeActiveNodes(nodes) {
    if (!this.shouldRenderIndentGuides) {
      return;
    }
    const set = /* @__PURE__ */ new Set();
    nodes.forEach((node) => {
      const ref = this.model.getNodeLocation(node);
      try {
        const parentRef = this.model.getParentNodeLocation(ref);
        if (node.collapsible && node.children.length > 0 && !node.collapsed) {
          set.add(node);
        } else if (parentRef) {
          set.add(this.model.getNode(parentRef));
        }
      } catch {
      }
    });
    this.activeIndentNodes.forEach((node) => {
      if (!set.has(node)) {
        this.renderedIndentGuides.forEach(node, (line) => line.classList.remove("active"));
      }
    });
    set.forEach((node) => {
      if (!this.activeIndentNodes.has(node)) {
        this.renderedIndentGuides.forEach(node, (line) => line.classList.add("active"));
      }
    });
    this.activeIndentNodes = set;
  }
  dispose() {
    this.renderedNodes.clear();
    this.renderedElements.clear();
    this.indentGuidesDisposable.dispose();
    dispose(this.disposables);
  }
};
_TreeRenderer.DefaultIndent = 8;
let TreeRenderer = _TreeRenderer;
function contiguousFuzzyScore(patternLower, wordLower) {
  const index = wordLower.toLowerCase().indexOf(patternLower);
  let score;
  if (index > -1) {
    score = [Number.MAX_SAFE_INTEGER, 0];
    for (let i = patternLower.length; i > 0; i--) {
      score.push(index + i - 1);
    }
  }
  return score;
}
class FindFilter {
  constructor(_keyboardNavigationLabelProvider, _filter, _defaultFindVisibility) {
    this._keyboardNavigationLabelProvider = _keyboardNavigationLabelProvider;
    this._filter = _filter;
    this._defaultFindVisibility = _defaultFindVisibility;
    this._totalCount = 0;
    this._matchCount = 0;
    this._findMatchType = 0 /* Fuzzy */;
    this._findMode = 0 /* Highlight */;
    this._pattern = "";
    this._lowercasePattern = "";
    this.disposables = new DisposableStore();
  }
  get totalCount() {
    return this._totalCount;
  }
  get matchCount() {
    return this._matchCount;
  }
  set findMatchType(type) {
    this._findMatchType = type;
  }
  get findMatchType() {
    return this._findMatchType;
  }
  set findMode(mode) {
    this._findMode = mode;
  }
  get findMode() {
    return this._findMode;
  }
  set pattern(pattern) {
    this._pattern = pattern;
    this._lowercasePattern = pattern.toLowerCase();
  }
  filter(element, parentVisibility) {
    let visibility = TreeVisibility.Visible;
    if (this._filter) {
      const result = this._filter.filter(element, parentVisibility);
      if (typeof result === "boolean") {
        visibility = result ? TreeVisibility.Visible : TreeVisibility.Hidden;
      } else if (isFilterResult(result)) {
        visibility = getVisibleState(result.visibility);
      } else {
        visibility = result;
      }
      if (visibility === TreeVisibility.Hidden) {
        return false;
      }
    }
    this._totalCount++;
    if (!this._pattern) {
      this._matchCount++;
      return { data: FuzzyScore.Default, visibility };
    }
    const label = this._keyboardNavigationLabelProvider.getKeyboardNavigationLabel(element);
    const labels = Array.isArray(label) ? label : [label];
    for (const l of labels) {
      const labelStr = l && l.toString();
      if (typeof labelStr === "undefined") {
        return { data: FuzzyScore.Default, visibility };
      }
      let score;
      if (this._findMatchType === 1 /* Contiguous */) {
        score = contiguousFuzzyScore(this._lowercasePattern, labelStr.toLowerCase());
      } else {
        score = fuzzyScore(this._pattern, this._lowercasePattern, 0, labelStr, labelStr.toLowerCase(), 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
      }
      if (score) {
        this._matchCount++;
        return labels.length === 1 ? { data: score, visibility } : { data: { label: labelStr, score }, visibility };
      }
    }
    if (this._findMode === 1 /* Filter */) {
      if (typeof this._defaultFindVisibility === "number") {
        return this._defaultFindVisibility;
      } else if (this._defaultFindVisibility) {
        return this._defaultFindVisibility(element);
      } else {
        return TreeVisibility.Recurse;
      }
    } else {
      return { data: FuzzyScore.Default, visibility };
    }
  }
  reset() {
    this._totalCount = 0;
    this._matchCount = 0;
  }
  dispose() {
    dispose(this.disposables);
  }
}
class TreeFindToggle extends Toggle {
  constructor(contribution, opts, hoverLifecycleOptions) {
    super({
      icon: contribution.icon,
      title: contribution.title,
      isChecked: contribution.isChecked,
      inputActiveOptionBorder: opts.inputActiveOptionBorder,
      inputActiveOptionForeground: opts.inputActiveOptionForeground,
      inputActiveOptionBackground: opts.inputActiveOptionBackground,
      hoverLifecycleOptions
    });
    this.id = contribution.id;
  }
}
class FindToggles {
  constructor(startStates) {
    this.stateMap = new Map(startStates.map((state) => [state.id, { ...state }]));
  }
  states() {
    return Array.from(this.stateMap.values());
  }
  get(id) {
    const state = this.stateMap.get(id);
    if (state === void 0) {
      throw new Error(`No state found for toggle id ${id}`);
    }
    return state.isChecked;
  }
  set(id, value) {
    const state = this.stateMap.get(id);
    if (state === void 0) {
      throw new Error(`No state found for toggle id ${id}`);
    }
    if (state.isChecked === value) {
      return false;
    }
    state.isChecked = value;
    return true;
  }
}
const unthemedFindWidgetStyles = {
  inputBoxStyles: unthemedInboxStyles,
  toggleStyles: unthemedToggleStyles,
  listFilterWidgetBackground: void 0,
  listFilterWidgetNoMatchesOutline: void 0,
  listFilterWidgetOutline: void 0,
  listFilterWidgetShadow: void 0
};
var TreeFindMode = /* @__PURE__ */ ((TreeFindMode2) => {
  TreeFindMode2[TreeFindMode2["Highlight"] = 0] = "Highlight";
  TreeFindMode2[TreeFindMode2["Filter"] = 1] = "Filter";
  return TreeFindMode2;
})(TreeFindMode || {});
var TreeFindMatchType = /* @__PURE__ */ ((TreeFindMatchType2) => {
  TreeFindMatchType2[TreeFindMatchType2["Fuzzy"] = 0] = "Fuzzy";
  TreeFindMatchType2[TreeFindMatchType2["Contiguous"] = 1] = "Contiguous";
  return TreeFindMatchType2;
})(TreeFindMatchType || {});
class FindWidget extends Disposable {
  constructor(container, tree, contextViewProvider, placeholder, toggleContributions = [], options) {
    super();
    this.tree = tree;
    this.elements = h(".monaco-tree-type-filter", [
      h(".monaco-tree-type-filter-input@findInput"),
      h(".monaco-tree-type-filter-actionbar@actionbar")
    ]);
    this.toggles = [];
    this._onDidDisable = this._register(new Emitter());
    this.onDidDisable = this._onDidDisable.event;
    container.appendChild(this.elements.root);
    this._register(toDisposable(() => this.elements.root.remove()));
    const styles = options?.styles ?? unthemedFindWidgetStyles;
    if (styles.listFilterWidgetBackground) {
      this.elements.root.style.backgroundColor = styles.listFilterWidgetBackground;
    }
    if (styles.listFilterWidgetShadow) {
      this.elements.root.style.boxShadow = `0 0 8px 2px ${styles.listFilterWidgetShadow}`;
    }
    const hoverLifecycleOptions = { groupId: "abstract-tree" };
    this.toggles = toggleContributions.map((contribution) => this._register(new TreeFindToggle(contribution, styles.toggleStyles, hoverLifecycleOptions)));
    this.onDidToggleChange = Event.any(...this.toggles.map((toggle) => Event.map(toggle.onChange, () => ({ id: toggle.id, isChecked: toggle.checked }))));
    const history = options?.history || [];
    this.findInput = this._register(new FindInput(this.elements.findInput, contextViewProvider, {
      label: localize("type to search", "Type to search"),
      placeholder,
      additionalToggles: this.toggles,
      showCommonFindToggles: false,
      inputBoxStyles: styles.inputBoxStyles,
      toggleStyles: styles.toggleStyles,
      history: new Set(history),
      hoverLifecycleOptions
    }));
    this.actionbar = this._register(new ActionBar(this.elements.actionbar));
    const emitter = this._register(new DomEmitter(this.findInput.inputBox.inputElement, "keydown"));
    const onKeyDown = Event.chain(emitter.event, ($2) => $2.map((e) => new StandardKeyboardEvent(e)));
    this._register(onKeyDown((e) => {
      if (e.equals(KeyCode.Enter)) {
        e.preventDefault();
        e.stopPropagation();
        this.findInput.inputBox.addToHistory();
        this.tree.domFocus();
        return;
      }
      if (e.equals(KeyCode.DownArrow)) {
        e.preventDefault();
        e.stopPropagation();
        if (this.findInput.inputBox.isAtLastInHistory() || this.findInput.inputBox.isNowhereInHistory()) {
          this.findInput.inputBox.addToHistory();
          this.tree.domFocus();
        } else {
          this.findInput.inputBox.showNextValue();
        }
        return;
      }
      if (e.equals(KeyCode.UpArrow)) {
        e.preventDefault();
        e.stopPropagation();
        this.findInput.inputBox.showPreviousValue();
        return;
      }
    }));
    const closeAction = this._register(new Action("close", localize("close", "Close"), "codicon codicon-close", true, () => this.dispose()));
    this.actionbar.push(closeAction, { icon: true, label: false });
    this.onDidChangeValue = this.findInput.onDidChange;
  }
  get value() {
    return this.findInput.inputBox.value;
  }
  set value(value) {
    this.findInput.inputBox.value = value;
  }
  setToggleState(id, checked) {
    const toggle = this.toggles.find((toggle2) => toggle2.id === id);
    if (toggle) {
      toggle.checked = checked;
    }
  }
  setPlaceHolder(placeHolder) {
    this.findInput.inputBox.setPlaceHolder(placeHolder);
  }
  getHistory() {
    return this.findInput.inputBox.getHistory();
  }
  focus() {
    this.findInput.focus();
  }
  select() {
    this.findInput.select();
    this.findInput.inputBox.addToHistory(true);
  }
  showMessage(message) {
    this.findInput.showMessage(message);
  }
  clearMessage() {
    this.findInput.clearMessage();
  }
  async dispose() {
    this._onDidDisable.fire();
    this.elements.root.classList.add("disabled");
    await timeout(300);
    super.dispose();
  }
}
var DefaultTreeToggles = /* @__PURE__ */ ((DefaultTreeToggles2) => {
  DefaultTreeToggles2["Mode"] = "mode";
  DefaultTreeToggles2["MatchType"] = "matchType";
  return DefaultTreeToggles2;
})(DefaultTreeToggles || {});
class AbstractFindController {
  constructor(tree, filter, contextViewProvider, options = {}) {
    this.tree = tree;
    this.filter = filter;
    this.contextViewProvider = contextViewProvider;
    this.options = options;
    this._pattern = "";
    this.previousPattern = "";
    this._onDidChangePattern = new Emitter();
    this.onDidChangePattern = this._onDidChangePattern.event;
    this._onDidChangeOpenState = new Emitter();
    this.onDidChangeOpenState = this._onDidChangeOpenState.event;
    this.enabledDisposables = new DisposableStore();
    this.disposables = new DisposableStore();
    this.toggles = new FindToggles(options.toggles ?? []);
    this._placeholder = options.placeholder ?? localize("type to search", "Type to search");
  }
  get pattern() {
    return this._pattern;
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(value) {
    this._placeholder = value;
    this.widget?.setPlaceHolder(value);
  }
  isOpened() {
    return !!this.widget;
  }
  open() {
    if (this.widget) {
      this.widget.focus();
      this.widget.select();
      return;
    }
    const widgetContainer = this.options.findWidgetContainer ?? this.tree.getHTMLElement();
    if (!this.options.findWidgetContainer) {
      this.tree.updateOptions({ paddingTop: 30 });
    }
    this.widget = new FindWidget(widgetContainer, this.tree, this.contextViewProvider, this.placeholder, this.toggles.states(), { ...this.options, history: this._history });
    this.enabledDisposables.add(this.widget);
    this.widget.onDidChangeValue(this.onDidChangeValue, this, this.enabledDisposables);
    this.widget.onDidDisable(this.close, this, this.enabledDisposables);
    this.widget.onDidToggleChange(this.onDidToggleChange, this, this.enabledDisposables);
    this.widget.focus();
    this.widget.value = this.previousPattern;
    this.widget.select();
    this._onDidChangeOpenState.fire(true);
  }
  close() {
    if (!this.widget) {
      return;
    }
    if (!this.options.findWidgetContainer) {
      this.tree.updateOptions({ paddingTop: 0 });
    }
    this._history = this.widget.getHistory();
    this.widget = void 0;
    this.enabledDisposables.clear();
    this.previousPattern = this.pattern;
    this.onDidChangeValue("");
    this.tree.domFocus();
    this._onDidChangeOpenState.fire(false);
  }
  onDidChangeValue(pattern) {
    this._pattern = pattern;
    this._onDidChangePattern.fire(pattern);
    this.filter.pattern = pattern;
    this.applyPattern(pattern);
  }
  onDidToggleChange(e) {
    this.toggles.set(e.id, e.isChecked);
  }
  updateToggleState(id, checked) {
    this.toggles.set(id, checked);
    this.widget?.setToggleState(id, checked);
  }
  renderMessage(showNotFound, warningMessage) {
    if (showNotFound) {
      if (this.tree.options.showNotFoundMessage ?? true) {
        this.widget?.showMessage({ type: MessageType.WARNING, content: warningMessage ?? localize("not found", "No results found.") });
      } else {
        this.widget?.showMessage({ type: MessageType.WARNING });
      }
    } else {
      this.widget?.clearMessage();
    }
  }
  alertResults(results) {
    if (!results) {
      alert(localize("replFindNoResults", "No results"));
    } else {
      alert(localize("foundResults", "{0} results", results));
    }
  }
  dispose() {
    this._history = void 0;
    this._onDidChangePattern.dispose();
    this.enabledDisposables.dispose();
    this.disposables.dispose();
  }
}
class FindController extends AbstractFindController {
  constructor(tree, filter, contextViewProvider, options = {}) {
    const defaultFindMode = options.defaultFindMode ?? 0 /* Highlight */;
    const defaultFindMatchType = options.defaultFindMatchType ?? 0 /* Fuzzy */;
    const toggleContributions = [{
      id: "mode" /* Mode */,
      icon: Codicon.listFilter,
      title: localize("filter", "Filter"),
      isChecked: defaultFindMode === 1 /* Filter */
    }, {
      id: "matchType" /* MatchType */,
      icon: Codicon.searchFuzzy,
      title: localize("fuzzySearch", "Fuzzy Match"),
      isChecked: defaultFindMatchType === 0 /* Fuzzy */
    }];
    filter.findMatchType = defaultFindMatchType;
    filter.findMode = defaultFindMode;
    super(tree, filter, contextViewProvider, { ...options, toggles: toggleContributions });
    this.filter = filter;
    this._onDidChangeMode = new Emitter();
    this.onDidChangeMode = this._onDidChangeMode.event;
    this._onDidChangeMatchType = new Emitter();
    this.onDidChangeMatchType = this._onDidChangeMatchType.event;
    this.disposables.add(this.tree.onDidChangeModel(() => {
      if (!this.isOpened()) {
        return;
      }
      if (this.pattern.length !== 0) {
        this.tree.refilter();
      }
      this.render();
    }));
    this.disposables.add(this.tree.onWillRefilter(() => this.filter.reset()));
  }
  get mode() {
    return this.toggles.get("mode" /* Mode */) ? 1 /* Filter */ : 0 /* Highlight */;
  }
  set mode(mode) {
    if (mode === this.mode) {
      return;
    }
    const isFilterMode = mode === 1 /* Filter */;
    this.updateToggleState("mode" /* Mode */, isFilterMode);
    this.placeholder = isFilterMode ? localize("type to filter", "Type to filter") : localize("type to search", "Type to search");
    this.filter.findMode = mode;
    this.tree.refilter();
    this.render();
    this._onDidChangeMode.fire(mode);
  }
  get matchType() {
    return this.toggles.get("matchType" /* MatchType */) ? 0 /* Fuzzy */ : 1 /* Contiguous */;
  }
  set matchType(matchType) {
    if (matchType === this.matchType) {
      return;
    }
    this.updateToggleState("matchType" /* MatchType */, matchType === 0 /* Fuzzy */);
    this.filter.findMatchType = matchType;
    this.tree.refilter();
    this.render();
    this._onDidChangeMatchType.fire(matchType);
  }
  updateOptions(optionsUpdate = {}) {
    if (optionsUpdate.defaultFindMode !== void 0) {
      this.mode = optionsUpdate.defaultFindMode;
    }
    if (optionsUpdate.defaultFindMatchType !== void 0) {
      this.matchType = optionsUpdate.defaultFindMatchType;
    }
  }
  applyPattern(pattern) {
    this.tree.refilter();
    if (pattern) {
      this.tree.focusNext(0, true, void 0, (node) => !FuzzyScore.isDefault(node.filterData));
    }
    const focus = this.tree.getFocus();
    if (focus.length > 0) {
      const element = focus[0];
      if (this.tree.getRelativeTop(element) === null) {
        this.tree.reveal(element, 0.5);
      }
    }
    this.render();
  }
  shouldAllowFocus(node) {
    if (!this.isOpened() || !this.pattern) {
      return true;
    }
    if (this.filter.totalCount > 0 && this.filter.matchCount <= 1) {
      return true;
    }
    return !FuzzyScore.isDefault(node.filterData);
  }
  onDidToggleChange(e) {
    if (e.id === "mode" /* Mode */) {
      this.mode = e.isChecked ? 1 /* Filter */ : 0 /* Highlight */;
    } else if (e.id === "matchType" /* MatchType */) {
      this.matchType = e.isChecked ? 0 /* Fuzzy */ : 1 /* Contiguous */;
    }
  }
  render() {
    const noMatches = this.filter.matchCount === 0 && this.filter.totalCount > 0;
    const showNotFound = noMatches && this.pattern.length > 0;
    this.renderMessage(showNotFound);
    if (this.pattern.length) {
      this.alertResults(this.filter.matchCount);
    }
  }
}
function stickyScrollNodeStateEquals(node1, node2) {
  return node1.position === node2.position && stickyScrollNodeEquals(node1, node2);
}
function stickyScrollNodeEquals(node1, node2) {
  return node1.node.element === node2.node.element && node1.startIndex === node2.startIndex && node1.height === node2.height && node1.endIndex === node2.endIndex;
}
class StickyScrollState {
  constructor(stickyNodes = []) {
    this.stickyNodes = stickyNodes;
  }
  get count() {
    return this.stickyNodes.length;
  }
  equal(state) {
    return equals(this.stickyNodes, state.stickyNodes, stickyScrollNodeStateEquals);
  }
  contains(element) {
    return this.stickyNodes.some((node) => node.node.element === element.element);
  }
  lastNodePartiallyVisible() {
    if (this.count === 0) {
      return false;
    }
    const lastStickyNode = this.stickyNodes[this.count - 1];
    if (this.count === 1) {
      return lastStickyNode.position !== 0;
    }
    const secondLastStickyNode = this.stickyNodes[this.count - 2];
    return secondLastStickyNode.position + secondLastStickyNode.height !== lastStickyNode.position;
  }
  animationStateChanged(previousState) {
    if (!equals(this.stickyNodes, previousState.stickyNodes, stickyScrollNodeEquals)) {
      return false;
    }
    if (this.count === 0) {
      return false;
    }
    const lastStickyNode = this.stickyNodes[this.count - 1];
    const previousLastStickyNode = previousState.stickyNodes[previousState.count - 1];
    return lastStickyNode.position !== previousLastStickyNode.position;
  }
}
class DefaultStickyScrollDelegate {
  constrainStickyScrollNodes(stickyNodes, stickyScrollMaxItemCount, maxWidgetHeight) {
    for (let i = 0; i < stickyNodes.length; i++) {
      const stickyNode = stickyNodes[i];
      const stickyNodeBottom = stickyNode.position + stickyNode.height;
      if (stickyNodeBottom > maxWidgetHeight || i >= stickyScrollMaxItemCount) {
        return stickyNodes.slice(0, i);
      }
    }
    return stickyNodes;
  }
}
class StickyScrollController extends Disposable {
  constructor(tree, model, view, renderers, treeDelegate, options = {}) {
    super();
    this.tree = tree;
    this.model = model;
    this.view = view;
    this.treeDelegate = treeDelegate;
    this.maxWidgetViewRatio = 0.4;
    const stickyScrollOptions = this.validateStickySettings(options);
    this.stickyScrollMaxItemCount = stickyScrollOptions.stickyScrollMaxItemCount;
    this.stickyScrollDelegate = options.stickyScrollDelegate ?? new DefaultStickyScrollDelegate();
    this.paddingTop = options.paddingTop ?? 0;
    this._widget = this._register(new StickyScrollWidget(view.getScrollableElement(), view, tree, renderers, treeDelegate, options.accessibilityProvider));
    this.onDidChangeHasFocus = this._widget.onDidChangeHasFocus;
    this.onContextMenu = this._widget.onContextMenu;
    this._register(view.onDidScroll(() => this.update()));
    this._register(view.onDidChangeContentHeight(() => this.update()));
    this._register(tree.onDidChangeCollapseState(() => this.update()));
    this._register(model.onDidSpliceRenderedNodes((e) => {
      const state = this._widget.state;
      if (!state) {
        return;
      }
      const hasRemovedStickyNode = e.deleteCount > 0 && state.stickyNodes.some((stickyNode) => !this.model.has(this.model.getNodeLocation(stickyNode.node)));
      if (hasRemovedStickyNode) {
        this.update();
        return;
      }
      const shouldRerenderStickyNodes = state.stickyNodes.some((stickyNode) => {
        const listIndex = this.model.getListIndex(this.model.getNodeLocation(stickyNode.node));
        return listIndex >= e.start && listIndex < e.start + e.deleteCount && state.contains(stickyNode.node);
      });
      if (shouldRerenderStickyNodes) {
        this._widget.rerender();
      }
    }));
    this.update();
  }
  get height() {
    return this._widget.height;
  }
  get count() {
    return this._widget.count;
  }
  getNode(node) {
    return this._widget.getNode(node);
  }
  getNodeAtHeight(height) {
    let index;
    if (height === 0) {
      index = this.view.firstVisibleIndex;
    } else {
      index = this.view.indexAt(height + this.view.scrollTop);
    }
    if (index < 0 || index >= this.view.length) {
      return void 0;
    }
    return this.view.element(index);
  }
  update() {
    const firstVisibleNode = this.getNodeAtHeight(this.paddingTop);
    if (!firstVisibleNode || this.tree.scrollTop <= this.paddingTop || this.view.renderHeight === 0) {
      this._widget.setState(void 0);
      return;
    }
    const stickyState = this.findStickyState(firstVisibleNode);
    this._widget.setState(stickyState);
  }
  findStickyState(firstVisibleNode) {
    const stickyNodes = [];
    let firstVisibleNodeUnderWidget = firstVisibleNode;
    let stickyNodesHeight = 0;
    let nextStickyNode = this.getNextStickyNode(firstVisibleNodeUnderWidget, void 0, stickyNodesHeight);
    while (nextStickyNode) {
      stickyNodes.push(nextStickyNode);
      stickyNodesHeight += nextStickyNode.height;
      if (stickyNodes.length <= this.stickyScrollMaxItemCount) {
        firstVisibleNodeUnderWidget = this.getNextVisibleNode(nextStickyNode);
        if (!firstVisibleNodeUnderWidget) {
          break;
        }
      }
      nextStickyNode = this.getNextStickyNode(firstVisibleNodeUnderWidget, nextStickyNode.node, stickyNodesHeight);
    }
    const contrainedStickyNodes = this.constrainStickyNodes(stickyNodes);
    return contrainedStickyNodes.length ? new StickyScrollState(contrainedStickyNodes) : void 0;
  }
  getNextVisibleNode(previousStickyNode) {
    return this.getNodeAtHeight(previousStickyNode.position + previousStickyNode.height);
  }
  getNextStickyNode(firstVisibleNodeUnderWidget, previousStickyNode, stickyNodesHeight) {
    const nextStickyNode = this.getAncestorUnderPrevious(firstVisibleNodeUnderWidget, previousStickyNode);
    if (!nextStickyNode) {
      return void 0;
    }
    if (nextStickyNode === firstVisibleNodeUnderWidget) {
      if (!this.nodeIsUncollapsedParent(firstVisibleNodeUnderWidget)) {
        return void 0;
      }
      if (this.nodeTopAlignsWithStickyNodesBottom(firstVisibleNodeUnderWidget, stickyNodesHeight)) {
        return void 0;
      }
    }
    return this.createStickyScrollNode(nextStickyNode, stickyNodesHeight);
  }
  nodeTopAlignsWithStickyNodesBottom(node, stickyNodesHeight) {
    const nodeIndex = this.getNodeIndex(node);
    const elementTop = this.view.getElementTop(nodeIndex);
    const stickyPosition = stickyNodesHeight;
    return this.view.scrollTop === elementTop - stickyPosition;
  }
  createStickyScrollNode(node, currentStickyNodesHeight) {
    const height = this.treeDelegate.getHeight(node);
    const { startIndex, endIndex } = this.getNodeRange(node);
    const position = this.calculateStickyNodePosition(endIndex, currentStickyNodesHeight, height);
    return { node, position, height, startIndex, endIndex };
  }
  getAncestorUnderPrevious(node, previousAncestor = void 0) {
    let currentAncestor = node;
    let parentOfcurrentAncestor = this.getParentNode(currentAncestor);
    while (parentOfcurrentAncestor) {
      if (parentOfcurrentAncestor === previousAncestor) {
        return currentAncestor;
      }
      currentAncestor = parentOfcurrentAncestor;
      parentOfcurrentAncestor = this.getParentNode(currentAncestor);
    }
    if (previousAncestor === void 0) {
      return currentAncestor;
    }
    return void 0;
  }
  calculateStickyNodePosition(lastDescendantIndex, stickyRowPositionTop, stickyNodeHeight) {
    let lastChildRelativeTop = this.view.getRelativeTop(lastDescendantIndex);
    if (lastChildRelativeTop === null && this.view.firstVisibleIndex === lastDescendantIndex && lastDescendantIndex + 1 < this.view.length) {
      const nodeHeight = this.treeDelegate.getHeight(this.view.element(lastDescendantIndex));
      const nextNodeRelativeTop = this.view.getRelativeTop(lastDescendantIndex + 1);
      lastChildRelativeTop = nextNodeRelativeTop ? nextNodeRelativeTop - nodeHeight / this.view.renderHeight : null;
    }
    if (lastChildRelativeTop === null) {
      return stickyRowPositionTop;
    }
    const lastChildNode = this.view.element(lastDescendantIndex);
    const lastChildHeight = this.treeDelegate.getHeight(lastChildNode);
    const topOfLastChild = lastChildRelativeTop * this.view.renderHeight;
    const bottomOfLastChild = topOfLastChild + lastChildHeight;
    if (stickyRowPositionTop + stickyNodeHeight > bottomOfLastChild && stickyRowPositionTop <= bottomOfLastChild) {
      return bottomOfLastChild - stickyNodeHeight;
    }
    return stickyRowPositionTop;
  }
  constrainStickyNodes(stickyNodes) {
    if (stickyNodes.length === 0) {
      return [];
    }
    const maximumStickyWidgetHeight = this.view.renderHeight * this.maxWidgetViewRatio;
    const lastStickyNode = stickyNodes[stickyNodes.length - 1];
    if (stickyNodes.length <= this.stickyScrollMaxItemCount && lastStickyNode.position + lastStickyNode.height <= maximumStickyWidgetHeight) {
      return stickyNodes;
    }
    const constrainedStickyNodes = this.stickyScrollDelegate.constrainStickyScrollNodes(stickyNodes, this.stickyScrollMaxItemCount, maximumStickyWidgetHeight);
    if (!constrainedStickyNodes.length) {
      return [];
    }
    const lastConstrainedStickyNode = constrainedStickyNodes[constrainedStickyNodes.length - 1];
    if (constrainedStickyNodes.length > this.stickyScrollMaxItemCount || lastConstrainedStickyNode.position + lastConstrainedStickyNode.height > maximumStickyWidgetHeight) {
      throw new Error("stickyScrollDelegate violates constraints");
    }
    return constrainedStickyNodes;
  }
  getParentNode(node) {
    const nodeLocation = this.model.getNodeLocation(node);
    const parentLocation = this.model.getParentNodeLocation(nodeLocation);
    return parentLocation ? this.model.getNode(parentLocation) : void 0;
  }
  nodeIsUncollapsedParent(node) {
    const nodeLocation = this.model.getNodeLocation(node);
    return this.model.getListRenderCount(nodeLocation) > 1;
  }
  getNodeIndex(node) {
    const nodeLocation = this.model.getNodeLocation(node);
    const nodeIndex = this.model.getListIndex(nodeLocation);
    return nodeIndex;
  }
  getNodeRange(node) {
    const nodeLocation = this.model.getNodeLocation(node);
    const startIndex = this.model.getListIndex(nodeLocation);
    if (startIndex < 0) {
      throw new Error("Node not found in tree");
    }
    const renderCount = this.model.getListRenderCount(nodeLocation);
    const endIndex = startIndex + renderCount - 1;
    return { startIndex, endIndex };
  }
  nodePositionTopBelowWidget(node) {
    const ancestors = [];
    let currentAncestor = this.getParentNode(node);
    while (currentAncestor) {
      ancestors.push(currentAncestor);
      currentAncestor = this.getParentNode(currentAncestor);
    }
    let widgetHeight = 0;
    for (let i = 0; i < ancestors.length && i < this.stickyScrollMaxItemCount; i++) {
      widgetHeight += this.treeDelegate.getHeight(ancestors[i]);
    }
    return widgetHeight;
  }
  getFocus() {
    return this._widget.getFocus();
  }
  domFocus() {
    this._widget.domFocus();
  }
  // Whether sticky scroll was the last focused part in the tree or not
  focusedLast() {
    return this._widget.focusedLast();
  }
  updateOptions(optionsUpdate = {}) {
    if (optionsUpdate.paddingTop !== void 0) {
      this.paddingTop = optionsUpdate.paddingTop;
    }
    if (optionsUpdate.stickyScrollMaxItemCount !== void 0) {
      const validatedOptions = this.validateStickySettings(optionsUpdate);
      if (this.stickyScrollMaxItemCount !== validatedOptions.stickyScrollMaxItemCount) {
        this.stickyScrollMaxItemCount = validatedOptions.stickyScrollMaxItemCount;
        this.update();
      }
    }
  }
  validateStickySettings(options) {
    let stickyScrollMaxItemCount = 7;
    if (typeof options.stickyScrollMaxItemCount === "number") {
      stickyScrollMaxItemCount = Math.max(options.stickyScrollMaxItemCount, 1);
    }
    return { stickyScrollMaxItemCount };
  }
}
class StickyScrollWidget {
  constructor(container, view, tree, treeRenderers, treeDelegate, accessibilityProvider) {
    this.view = view;
    this.tree = tree;
    this.treeRenderers = treeRenderers;
    this.treeDelegate = treeDelegate;
    this.accessibilityProvider = accessibilityProvider;
    this._previousElements = [];
    this._previousStateDisposables = new DisposableStore();
    this._rootDomNode = $(".monaco-tree-sticky-container.empty");
    container.appendChild(this._rootDomNode);
    const shadow = $(".monaco-tree-sticky-container-shadow");
    this._rootDomNode.appendChild(shadow);
    this.stickyScrollFocus = new StickyScrollFocus(this._rootDomNode, view);
    this.onDidChangeHasFocus = this.stickyScrollFocus.onDidChangeHasFocus;
    this.onContextMenu = this.stickyScrollFocus.onContextMenu;
  }
  get state() {
    return this._previousState;
  }
  get height() {
    if (!this._previousState) {
      return 0;
    }
    const lastElement = this._previousState.stickyNodes[this._previousState.count - 1];
    return lastElement.position + lastElement.height;
  }
  get count() {
    return this._previousState?.count ?? 0;
  }
  getNode(node) {
    return this._previousState?.stickyNodes.find((stickyNode) => stickyNode.node === node);
  }
  setState(state) {
    const wasVisible = !!this._previousState && this._previousState.count > 0;
    const isVisible = !!state && state.count > 0;
    if (!wasVisible && !isVisible || wasVisible && isVisible && this._previousState.equal(state)) {
      return;
    }
    if (wasVisible !== isVisible) {
      this.setVisible(isVisible);
    }
    if (!isVisible) {
      this._previousState = void 0;
      this._previousElements = [];
      this._previousStateDisposables.clear();
      return;
    }
    const lastStickyNode = state.stickyNodes[state.count - 1];
    if (this._previousState && state.animationStateChanged(this._previousState)) {
      this._previousElements[this._previousState.count - 1].style.top = `${lastStickyNode.position}px`;
    } else {
      this.renderState(state);
    }
    this._previousState = state;
    this._rootDomNode.style.height = `${lastStickyNode.position + lastStickyNode.height}px`;
  }
  renderState(state) {
    this._previousStateDisposables.clear();
    const elements = Array(state.count);
    for (let stickyIndex = state.count - 1; stickyIndex >= 0; stickyIndex--) {
      const stickyNode = state.stickyNodes[stickyIndex];
      const { element, disposable } = this.createElement(stickyNode, stickyIndex, state.count);
      elements[stickyIndex] = element;
      this._rootDomNode.appendChild(element);
      this._previousStateDisposables.add(disposable);
    }
    this.stickyScrollFocus.updateElements(elements, state);
    this._previousElements = elements;
  }
  rerender() {
    if (this._previousState) {
      this.renderState(this._previousState);
    }
  }
  createElement(stickyNode, stickyIndex, stickyNodesTotal) {
    const nodeIndex = stickyNode.startIndex;
    const stickyElement = document.createElement("div");
    stickyElement.style.top = `${stickyNode.position}px`;
    if (this.tree.options.setRowHeight !== false) {
      stickyElement.style.height = `${stickyNode.height}px`;
    }
    if (this.tree.options.setRowLineHeight !== false) {
      stickyElement.style.lineHeight = `${stickyNode.height}px`;
    }
    stickyElement.classList.add("monaco-tree-sticky-row");
    stickyElement.classList.add("monaco-list-row");
    stickyElement.setAttribute("data-index", `${nodeIndex}`);
    stickyElement.setAttribute("data-parity", nodeIndex % 2 === 0 ? "even" : "odd");
    stickyElement.setAttribute("id", this.view.getElementID(nodeIndex));
    const accessibilityDisposable = this.setAccessibilityAttributes(stickyElement, stickyNode.node.element, stickyIndex, stickyNodesTotal);
    const nodeTemplateId = this.treeDelegate.getTemplateId(stickyNode.node);
    const renderer = this.treeRenderers.find((renderer2) => renderer2.templateId === nodeTemplateId);
    if (!renderer) {
      throw new Error(`No renderer found for template id ${nodeTemplateId}`);
    }
    let nodeCopy = stickyNode.node;
    if (nodeCopy === this.tree.getNode(this.tree.getNodeLocation(stickyNode.node))) {
      nodeCopy = new Proxy(stickyNode.node, {});
    }
    const templateData = renderer.renderTemplate(stickyElement);
    renderer.renderElement(nodeCopy, stickyNode.startIndex, templateData, { height: stickyNode.height });
    const disposable = toDisposable(() => {
      accessibilityDisposable.dispose();
      renderer.disposeElement(nodeCopy, stickyNode.startIndex, templateData, { height: stickyNode.height });
      renderer.disposeTemplate(templateData);
      stickyElement.remove();
    });
    return { element: stickyElement, disposable };
  }
  setAccessibilityAttributes(container, element, stickyIndex, stickyNodesTotal) {
    if (!this.accessibilityProvider) {
      return Disposable.None;
    }
    if (this.accessibilityProvider.getSetSize) {
      container.setAttribute("aria-setsize", String(this.accessibilityProvider.getSetSize(element, stickyIndex, stickyNodesTotal)));
    }
    if (this.accessibilityProvider.getPosInSet) {
      container.setAttribute("aria-posinset", String(this.accessibilityProvider.getPosInSet(element, stickyIndex)));
    }
    if (this.accessibilityProvider.getRole) {
      container.setAttribute("role", this.accessibilityProvider.getRole(element) ?? "treeitem");
    }
    const ariaLabel = this.accessibilityProvider.getAriaLabel(element);
    const observable = ariaLabel && typeof ariaLabel !== "string" ? ariaLabel : constObservable(ariaLabel);
    const result = autorun((reader) => {
      const value = reader.readObservable(observable);
      if (value) {
        container.setAttribute("aria-label", value);
      } else {
        container.removeAttribute("aria-label");
      }
    });
    if (typeof ariaLabel === "string") {
    } else if (ariaLabel) {
      container.setAttribute("aria-label", ariaLabel.get());
    }
    const ariaLevel = this.accessibilityProvider.getAriaLevel && this.accessibilityProvider.getAriaLevel(element);
    if (typeof ariaLevel === "number") {
      container.setAttribute("aria-level", `${ariaLevel}`);
    }
    container.setAttribute("aria-selected", String(false));
    return result;
  }
  setVisible(visible) {
    this._rootDomNode.classList.toggle("empty", !visible);
    if (!visible) {
      this.stickyScrollFocus.updateElements([], void 0);
    }
  }
  getFocus() {
    return this.stickyScrollFocus.getFocus();
  }
  domFocus() {
    this.stickyScrollFocus.domFocus();
  }
  focusedLast() {
    return this.stickyScrollFocus.focusedLast();
  }
  dispose() {
    this.stickyScrollFocus.dispose();
    this._previousStateDisposables.dispose();
    this._rootDomNode.remove();
  }
}
class StickyScrollFocus extends Disposable {
  constructor(container, view) {
    super();
    this.container = container;
    this.view = view;
    this.focusedIndex = -1;
    this.elements = [];
    this._onDidChangeHasFocus = this._register(new Emitter());
    this.onDidChangeHasFocus = this._onDidChangeHasFocus.event;
    this._onContextMenu = this._register(new Emitter());
    this.onContextMenu = this._onContextMenu.event;
    this._domHasFocus = false;
    this._register(addDisposableListener(this.container, "focus", () => this.onFocus()));
    this._register(addDisposableListener(this.container, "blur", () => this.onBlur()));
    this._register(this.view.onDidFocus(() => this.toggleStickyScrollFocused(false)));
    this._register(this.view.onKeyDown((e) => this.onKeyDown(e)));
    this._register(this.view.onMouseDown((e) => this.onMouseDown(e)));
    this._register(this.view.onContextMenu((e) => this.handleContextMenu(e)));
  }
  get domHasFocus() {
    return this._domHasFocus;
  }
  set domHasFocus(hasFocus) {
    if (hasFocus !== this._domHasFocus) {
      this._onDidChangeHasFocus.fire(hasFocus);
      this._domHasFocus = hasFocus;
    }
  }
  handleContextMenu(e) {
    const target = e.browserEvent.target;
    if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
      if (this.focusedLast()) {
        this.view.domFocus();
      }
      return;
    }
    if (!isKeyboardEvent(e.browserEvent)) {
      if (!this.state) {
        throw new Error("Context menu should not be triggered when state is undefined");
      }
      const stickyIndex = this.state.stickyNodes.findIndex((stickyNode2) => stickyNode2.node.element === e.element?.element);
      if (stickyIndex === -1) {
        throw new Error("Context menu should not be triggered when element is not in sticky scroll widget");
      }
      this.container.focus();
      this.setFocus(stickyIndex);
      return;
    }
    if (!this.state || this.focusedIndex < 0) {
      throw new Error("Context menu key should not be triggered when focus is not in sticky scroll widget");
    }
    const stickyNode = this.state.stickyNodes[this.focusedIndex];
    const element = stickyNode.node.element;
    const anchor = this.elements[this.focusedIndex];
    this._onContextMenu.fire({ element, anchor, browserEvent: e.browserEvent, isStickyScroll: true });
  }
  onKeyDown(e) {
    if (this.domHasFocus && this.state) {
      if (e.key === "ArrowUp") {
        this.setFocusedElement(Math.max(0, this.focusedIndex - 1));
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        if (this.focusedIndex >= this.state.count - 1) {
          const nodeIndexToFocus = this.state.stickyNodes[this.state.count - 1].startIndex + 1;
          this.view.domFocus();
          this.view.setFocus([nodeIndexToFocus]);
          this.scrollNodeUnderWidget(nodeIndexToFocus, this.state);
        } else {
          this.setFocusedElement(this.focusedIndex + 1);
        }
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }
  onMouseDown(e) {
    const target = e.browserEvent.target;
    if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
      return;
    }
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
  }
  updateElements(elements, state) {
    if (state && state.count === 0) {
      throw new Error("Sticky scroll state must be undefined when there are no sticky nodes");
    }
    if (state && state.count !== elements.length) {
      throw new Error("Sticky scroll focus received illigel state");
    }
    const previousIndex = this.focusedIndex;
    this.removeFocus();
    this.elements = elements;
    this.state = state;
    if (state) {
      const newFocusedIndex = clamp(previousIndex, 0, state.count - 1);
      this.setFocus(newFocusedIndex);
    } else {
      if (this.domHasFocus) {
        this.view.domFocus();
      }
    }
    this.container.tabIndex = state ? 0 : -1;
  }
  setFocusedElement(stickyIndex) {
    const state = this.state;
    if (!state) {
      throw new Error("Cannot set focus when state is undefined");
    }
    this.setFocus(stickyIndex);
    if (stickyIndex < state.count - 1) {
      return;
    }
    if (state.lastNodePartiallyVisible()) {
      const lastStickyNode = state.stickyNodes[stickyIndex];
      this.scrollNodeUnderWidget(lastStickyNode.endIndex + 1, state);
    }
  }
  scrollNodeUnderWidget(nodeIndex, state) {
    const lastStickyNode = state.stickyNodes[state.count - 1];
    const secondLastStickyNode = state.count > 1 ? state.stickyNodes[state.count - 2] : void 0;
    const elementScrollTop = this.view.getElementTop(nodeIndex);
    const elementTargetViewTop = secondLastStickyNode ? secondLastStickyNode.position + secondLastStickyNode.height + lastStickyNode.height : lastStickyNode.height;
    this.view.scrollTop = elementScrollTop - elementTargetViewTop;
  }
  getFocus() {
    if (!this.state || this.focusedIndex === -1) {
      return void 0;
    }
    return this.state.stickyNodes[this.focusedIndex].node.element;
  }
  domFocus() {
    if (!this.state) {
      throw new Error("Cannot focus when state is undefined");
    }
    this.container.focus();
  }
  focusedLast() {
    if (!this.state) {
      return false;
    }
    return this.view.getHTMLElement().classList.contains("sticky-scroll-focused");
  }
  removeFocus() {
    if (this.focusedIndex === -1) {
      return;
    }
    this.toggleElementFocus(this.elements[this.focusedIndex], false);
    this.focusedIndex = -1;
  }
  setFocus(newFocusIndex) {
    if (0 > newFocusIndex) {
      throw new Error("addFocus() can not remove focus");
    }
    if (!this.state && newFocusIndex >= 0) {
      throw new Error("Cannot set focus index when state is undefined");
    }
    if (this.state && newFocusIndex >= this.state.count) {
      throw new Error("Cannot set focus index to an index that does not exist");
    }
    const oldIndex = this.focusedIndex;
    if (oldIndex >= 0) {
      this.toggleElementFocus(this.elements[oldIndex], false);
    }
    if (newFocusIndex >= 0) {
      this.toggleElementFocus(this.elements[newFocusIndex], true);
    }
    this.focusedIndex = newFocusIndex;
  }
  toggleElementFocus(element, focused) {
    this.toggleElementActiveFocus(element, focused && this.domHasFocus);
    this.toggleElementPassiveFocus(element, focused);
  }
  toggleCurrentElementActiveFocus(focused) {
    if (this.focusedIndex === -1) {
      return;
    }
    this.toggleElementActiveFocus(this.elements[this.focusedIndex], focused);
  }
  toggleElementActiveFocus(element, focused) {
    element.classList.toggle("focused", focused);
  }
  toggleElementPassiveFocus(element, focused) {
    element.classList.toggle("passive-focused", focused);
  }
  toggleStickyScrollFocused(focused) {
    this.view.getHTMLElement().classList.toggle("sticky-scroll-focused", focused);
  }
  onFocus() {
    if (!this.state || this.elements.length === 0) {
      throw new Error("Cannot focus when state is undefined or elements are empty");
    }
    this.domHasFocus = true;
    this.toggleStickyScrollFocused(true);
    this.toggleCurrentElementActiveFocus(true);
    if (this.focusedIndex === -1) {
      this.setFocus(0);
    }
  }
  onBlur() {
    this.domHasFocus = false;
    this.toggleCurrentElementActiveFocus(false);
  }
  dispose() {
    this.toggleStickyScrollFocused(false);
    this._onDidChangeHasFocus.fire(false);
    super.dispose();
  }
}
function asTreeMouseEvent(event) {
  let target = TreeMouseEventTarget.Unknown;
  if (hasParentWithClass(event.browserEvent.target, "monaco-tl-twistie", "monaco-tl-row")) {
    target = TreeMouseEventTarget.Twistie;
  } else if (hasParentWithClass(event.browserEvent.target, "monaco-tl-contents", "monaco-tl-row")) {
    target = TreeMouseEventTarget.Element;
  } else if (hasParentWithClass(event.browserEvent.target, "monaco-tree-type-filter", "monaco-list")) {
    target = TreeMouseEventTarget.Filter;
  }
  return {
    browserEvent: event.browserEvent,
    element: event.element ? event.element.element : null,
    target
  };
}
function asTreeContextMenuEvent(event) {
  const isStickyScroll = isStickyScrollContainer(event.browserEvent.target);
  return {
    element: event.element ? event.element.element : null,
    browserEvent: event.browserEvent,
    anchor: event.anchor,
    isStickyScroll
  };
}
function dfs(node, fn) {
  fn(node);
  node.children.forEach((child) => dfs(child, fn));
}
class Trait {
  constructor(getFirstViewElementWithTrait, identityProvider) {
    this.getFirstViewElementWithTrait = getFirstViewElementWithTrait;
    this.identityProvider = identityProvider;
    this.nodes = [];
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  get nodeSet() {
    if (!this._nodeSet) {
      this._nodeSet = this.createNodeSet();
    }
    return this._nodeSet;
  }
  set(nodes, browserEvent) {
    const event = browserEvent;
    if (!event?.__forceEvent && equals(this.nodes, nodes)) {
      return;
    }
    this._set(nodes, false, browserEvent);
  }
  _set(nodes, silent, browserEvent) {
    this.nodes = [...nodes];
    this.elements = void 0;
    this._nodeSet = void 0;
    if (!silent) {
      const that = this;
      this._onDidChange.fire({ get elements() {
        return that.get();
      }, browserEvent });
    }
  }
  get() {
    if (!this.elements) {
      this.elements = this.nodes.map((node) => node.element);
    }
    return [...this.elements];
  }
  getNodes() {
    return this.nodes;
  }
  has(node) {
    return this.nodeSet.has(node);
  }
  onDidModelSplice({ insertedNodes, deletedNodes }) {
    if (!this.identityProvider) {
      const set = this.createNodeSet();
      const visit = (node) => set.delete(node);
      deletedNodes.forEach((node) => dfs(node, visit));
      this.set([...set.values()]);
      return;
    }
    const deletedNodesIdSet = /* @__PURE__ */ new Set();
    const deletedNodesVisitor = (node) => deletedNodesIdSet.add(this.identityProvider.getId(node.element).toString());
    deletedNodes.forEach((node) => dfs(node, deletedNodesVisitor));
    const insertedNodesMap = /* @__PURE__ */ new Map();
    const insertedNodesVisitor = (node) => insertedNodesMap.set(this.identityProvider.getId(node.element).toString(), node);
    insertedNodes.forEach((node) => dfs(node, insertedNodesVisitor));
    const nodes = [];
    for (const node of this.nodes) {
      const id = this.identityProvider.getId(node.element).toString();
      const wasDeleted = deletedNodesIdSet.has(id);
      if (!wasDeleted) {
        nodes.push(node);
      } else {
        const insertedNode = insertedNodesMap.get(id);
        if (insertedNode && insertedNode.visible) {
          nodes.push(insertedNode);
        }
      }
    }
    if (this.nodes.length > 0 && nodes.length === 0) {
      const node = this.getFirstViewElementWithTrait();
      if (node) {
        nodes.push(node);
      }
    }
    this._set(nodes, true);
  }
  createNodeSet() {
    const set = /* @__PURE__ */ new Set();
    for (const node of this.nodes) {
      set.add(node);
    }
    return set;
  }
}
class TreeNodeListMouseController extends MouseController {
  constructor(list, tree, stickyScrollProvider) {
    super(list);
    this.tree = tree;
    this.stickyScrollProvider = stickyScrollProvider;
  }
  onViewPointer(e) {
    if (isButton(e.browserEvent.target) || isEditableElement(e.browserEvent.target) || isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    if (e.browserEvent.isHandledByList) {
      return;
    }
    const node = e.element;
    if (!node) {
      return super.onViewPointer(e);
    }
    if (this.isSelectionRangeChangeEvent(e) || this.isSelectionSingleChangeEvent(e)) {
      return super.onViewPointer(e);
    }
    const target = e.browserEvent.target;
    const onTwistie = target.classList.contains("monaco-tl-twistie") || target.classList.contains("monaco-icon-label") && target.classList.contains("folder-icon") && e.browserEvent.offsetX < 16;
    const isStickyElement = isStickyScrollElement(e.browserEvent.target);
    let expandOnlyOnTwistieClick = false;
    if (isStickyElement) {
      expandOnlyOnTwistieClick = true;
    } else if (typeof this.tree.expandOnlyOnTwistieClick === "function") {
      expandOnlyOnTwistieClick = this.tree.expandOnlyOnTwistieClick(node.element);
    } else {
      expandOnlyOnTwistieClick = !!this.tree.expandOnlyOnTwistieClick;
    }
    if (!isStickyElement) {
      if (expandOnlyOnTwistieClick && !onTwistie && e.browserEvent.detail !== 2) {
        return super.onViewPointer(e);
      }
      if (!this.tree.expandOnDoubleClick && e.browserEvent.detail === 2) {
        return super.onViewPointer(e);
      }
    } else {
      this.handleStickyScrollMouseEvent(e, node);
    }
    if (node.collapsible && (!isStickyElement || onTwistie)) {
      const location = this.tree.getNodeLocation(node);
      const recursive = e.browserEvent.altKey;
      this.tree.setFocus([location]);
      this.tree.toggleCollapsed(location, recursive);
      if (onTwistie) {
        e.browserEvent.isHandledByList = true;
        return;
      }
    }
    if (!isStickyElement) {
      super.onViewPointer(e);
    }
  }
  handleStickyScrollMouseEvent(e, node) {
    if (isMonacoCustomToggle(e.browserEvent.target) || isActionItem(e.browserEvent.target)) {
      return;
    }
    const stickyScrollController = this.stickyScrollProvider();
    if (!stickyScrollController) {
      throw new Error("Sticky scroll controller not found");
    }
    const nodeIndex = this.list.indexOf(node);
    const elementScrollTop = this.list.getElementTop(nodeIndex);
    const elementTargetViewTop = stickyScrollController.nodePositionTopBelowWidget(node);
    this.tree.scrollTop = elementScrollTop - elementTargetViewTop;
    this.list.domFocus();
    this.list.setFocus([nodeIndex]);
    this.list.setSelection([nodeIndex]);
  }
  onDoubleClick(e) {
    const onTwistie = e.browserEvent.target.classList.contains("monaco-tl-twistie");
    if (onTwistie || !this.tree.expandOnDoubleClick) {
      return;
    }
    if (e.browserEvent.isHandledByList) {
      return;
    }
    super.onDoubleClick(e);
  }
  // to make sure dom focus is not stolen (for example with context menu)
  onMouseDown(e) {
    const target = e.browserEvent.target;
    if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
      super.onMouseDown(e);
      return;
    }
  }
  onContextMenu(e) {
    const target = e.browserEvent.target;
    if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
      super.onContextMenu(e);
      return;
    }
  }
}
class TreeNodeList extends List {
  constructor(user, container, virtualDelegate, renderers, focusTrait, selectionTrait, anchorTrait, options) {
    super(user, container, virtualDelegate, renderers, options);
    this.focusTrait = focusTrait;
    this.selectionTrait = selectionTrait;
    this.anchorTrait = anchorTrait;
  }
  createMouseController(options) {
    return new TreeNodeListMouseController(this, options.tree, options.stickyScrollProvider);
  }
  splice(start, deleteCount, elements = []) {
    super.splice(start, deleteCount, elements);
    if (elements.length === 0) {
      return;
    }
    const additionalFocus = [];
    const additionalSelection = [];
    let anchor;
    elements.forEach((node, index) => {
      if (this.focusTrait.has(node)) {
        additionalFocus.push(start + index);
      }
      if (this.selectionTrait.has(node)) {
        additionalSelection.push(start + index);
      }
      if (this.anchorTrait.has(node)) {
        anchor = start + index;
      }
    });
    if (additionalFocus.length > 0) {
      super.setFocus(distinct([...super.getFocus(), ...additionalFocus]));
    }
    if (additionalSelection.length > 0) {
      super.setSelection(distinct([...super.getSelection(), ...additionalSelection]));
    }
    if (typeof anchor === "number") {
      super.setAnchor(anchor);
    }
  }
  setFocus(indexes, browserEvent, fromAPI = false) {
    super.setFocus(indexes, browserEvent);
    if (!fromAPI) {
      this.focusTrait.set(indexes.map((i) => this.element(i)), browserEvent);
    }
  }
  setSelection(indexes, browserEvent, fromAPI = false) {
    super.setSelection(indexes, browserEvent);
    if (!fromAPI) {
      this.selectionTrait.set(indexes.map((i) => this.element(i)), browserEvent);
    }
  }
  setAnchor(index, fromAPI = false) {
    super.setAnchor(index);
    if (!fromAPI) {
      if (typeof index === "undefined") {
        this.anchorTrait.set([]);
      } else {
        this.anchorTrait.set([this.element(index)]);
      }
    }
  }
}
var AbstractTreePart = /* @__PURE__ */ ((AbstractTreePart2) => {
  AbstractTreePart2[AbstractTreePart2["Tree"] = 0] = "Tree";
  AbstractTreePart2[AbstractTreePart2["StickyScroll"] = 1] = "StickyScroll";
  return AbstractTreePart2;
})(AbstractTreePart || {});
class AbstractTree {
  constructor(_user, container, delegate, renderers, _options = {}) {
    this._user = _user;
    this._options = _options;
    this.eventBufferer = new EventBufferer();
    this.onDidChangeFindOpenState = Event.None;
    this.onDidChangeStickyScrollFocused = Event.None;
    this.disposables = new DisposableStore();
    this.onDidSwapModel = this.disposables.add(new Emitter());
    this.onDidChangeModelRelay = this.disposables.add(new Relay());
    this.onDidSpliceModelRelay = this.disposables.add(new Relay());
    this.onDidChangeCollapseStateRelay = this.disposables.add(new Relay());
    this.onDidChangeRenderNodeCountRelay = this.disposables.add(new Relay());
    this.onDidChangeActiveNodesRelay = this.disposables.add(new Relay());
    this._onWillRefilter = new Emitter();
    this.onWillRefilter = this._onWillRefilter.event;
    this._onDidUpdateOptions = new Emitter();
    this.onDidUpdateOptions = this._onDidUpdateOptions.event;
    this.modelDisposables = new DisposableStore();
    if (_options.keyboardNavigationLabelProvider && (_options.findWidgetEnabled ?? true)) {
      this.findFilter = new FindFilter(_options.keyboardNavigationLabelProvider, _options.filter, _options.defaultFindVisibility);
      _options = { ..._options, filter: this.findFilter };
      this.disposables.add(this.findFilter);
    }
    this.model = this.createModel(_user, _options);
    this.treeDelegate = new ComposedTreeDelegate(delegate);
    const activeNodes = this.disposables.add(new EventCollection(this.onDidChangeActiveNodesRelay.event));
    const renderedIndentGuides = new SetMap();
    this.renderers = renderers.map((r) => new TreeRenderer(r, this.model, this.onDidChangeCollapseStateRelay.event, activeNodes, renderedIndentGuides, _options));
    for (const r of this.renderers) {
      this.disposables.add(r);
    }
    this.focus = new Trait(() => this.view.getFocusedElements()[0], _options.identityProvider);
    this.selection = new Trait(() => this.view.getSelectedElements()[0], _options.identityProvider);
    this.anchor = new Trait(() => this.view.getAnchorElement(), _options.identityProvider);
    this.view = new TreeNodeList(_user, container, this.treeDelegate, this.renderers, this.focus, this.selection, this.anchor, { ...asListOptions(() => this.model, this.disposables, _options), tree: this, stickyScrollProvider: () => this.stickyScrollController });
    this.setupModel(this.model);
    if (_options.keyboardSupport !== false) {
      const onKeyDown = Event.chain(
        this.view.onKeyDown,
        ($2) => $2.filter((e) => !isEditableElement(e.target)).map((e) => new StandardKeyboardEvent(e))
      );
      Event.chain(onKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.LeftArrow))(this.onLeftArrow, this, this.disposables);
      Event.chain(onKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.RightArrow))(this.onRightArrow, this, this.disposables);
      Event.chain(onKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Space))(this.onSpace, this, this.disposables);
    }
    if ((_options.findWidgetEnabled ?? true) && _options.keyboardNavigationLabelProvider && _options.contextViewProvider) {
      const findOptions = {
        styles: _options.findWidgetStyles,
        defaultFindMode: _options.defaultFindMode,
        defaultFindMatchType: _options.defaultFindMatchType,
        showNotFoundMessage: _options.showNotFoundMessage,
        findWidgetContainer: _options.findWidgetContainer
      };
      this.findController = this.disposables.add(new FindController(this, this.findFilter, _options.contextViewProvider, findOptions));
      this.focusNavigationFilter = (node) => this.findController.shouldAllowFocus(node);
      this.onDidChangeFindOpenState = this.findController.onDidChangeOpenState;
      this.onDidChangeFindMode = this.findController.onDidChangeMode;
      this.onDidChangeFindMatchType = this.findController.onDidChangeMatchType;
    } else {
      this.onDidChangeFindMode = Event.None;
      this.onDidChangeFindMatchType = Event.None;
    }
    if (_options.enableStickyScroll) {
      this.stickyScrollController = new StickyScrollController(this, this.model, this.view, this.renderers, this.treeDelegate, _options);
      this.onDidChangeStickyScrollFocused = this.stickyScrollController.onDidChangeHasFocus;
    }
    this.styleElement = createStyleSheet(this.view.getHTMLElement());
    this.getHTMLElement().classList.toggle("always", this._options.renderIndentGuides === "always" /* Always */);
  }
  get onDidScroll() {
    return this.view.onDidScroll;
  }
  get onDidChangeFocus() {
    return this.eventBufferer.wrapEvent(this.focus.onDidChange);
  }
  get onDidChangeSelection() {
    return this.eventBufferer.wrapEvent(this.selection.onDidChange);
  }
  get onMouseClick() {
    return Event.map(this.view.onMouseClick, asTreeMouseEvent);
  }
  get onMouseDblClick() {
    return Event.filter(Event.map(this.view.onMouseDblClick, asTreeMouseEvent), (e) => e.target !== TreeMouseEventTarget.Filter);
  }
  get onMouseMiddleClick() {
    return Event.filter(Event.map(this.view.onMouseMiddleClick, asTreeMouseEvent), (e) => e.target !== TreeMouseEventTarget.Filter);
  }
  get onMouseOver() {
    return Event.map(this.view.onMouseOver, asTreeMouseEvent);
  }
  get onMouseOut() {
    return Event.map(this.view.onMouseOut, asTreeMouseEvent);
  }
  get onContextMenu() {
    return Event.any(Event.filter(Event.map(this.view.onContextMenu, asTreeContextMenuEvent), (e) => !e.isStickyScroll), this.stickyScrollController?.onContextMenu ?? Event.None);
  }
  get onTap() {
    return Event.map(this.view.onTap, asTreeMouseEvent);
  }
  get onPointer() {
    return Event.map(this.view.onPointer, asTreeMouseEvent);
  }
  get onKeyDown() {
    return this.view.onKeyDown;
  }
  get onKeyUp() {
    return this.view.onKeyUp;
  }
  get onKeyPress() {
    return this.view.onKeyPress;
  }
  get onDidFocus() {
    return this.view.onDidFocus;
  }
  get onDidBlur() {
    return this.view.onDidBlur;
  }
  get onDidChangeModel() {
    return Event.any(this.onDidChangeModelRelay.event, this.onDidSwapModel.event);
  }
  get onDidChangeCollapseState() {
    return this.onDidChangeCollapseStateRelay.event;
  }
  get onDidChangeRenderNodeCount() {
    return this.onDidChangeRenderNodeCountRelay.event;
  }
  get findMode() {
    return this.findController?.mode ?? 0 /* Highlight */;
  }
  set findMode(findMode) {
    if (this.findController) {
      this.findController.mode = findMode;
    }
  }
  get findMatchType() {
    return this.findController?.matchType ?? 0 /* Fuzzy */;
  }
  set findMatchType(findFuzzy) {
    if (this.findController) {
      this.findController.matchType = findFuzzy;
    }
  }
  get onDidChangeFindPattern() {
    return this.findController ? this.findController.onDidChangePattern : Event.None;
  }
  get expandOnDoubleClick() {
    return typeof this._options.expandOnDoubleClick === "undefined" ? true : this._options.expandOnDoubleClick;
  }
  get expandOnlyOnTwistieClick() {
    return typeof this._options.expandOnlyOnTwistieClick === "undefined" ? true : this._options.expandOnlyOnTwistieClick;
  }
  get onDidDispose() {
    return this.view.onDidDispose;
  }
  updateOptions(optionsUpdate = {}) {
    this._options = { ...this._options, ...optionsUpdate };
    for (const renderer of this.renderers) {
      renderer.updateOptions(optionsUpdate);
    }
    this.view.updateOptions(optionsUpdate);
    this.findController?.updateOptions(optionsUpdate);
    this.updateStickyScroll(optionsUpdate);
    this._onDidUpdateOptions.fire(this._options);
    this.getHTMLElement().classList.toggle("always", this._options.renderIndentGuides === "always" /* Always */);
  }
  get options() {
    return this._options;
  }
  updateStickyScroll(optionsUpdate) {
    if (!this.stickyScrollController && this._options.enableStickyScroll) {
      this.stickyScrollController = new StickyScrollController(this, this.model, this.view, this.renderers, this.treeDelegate, this._options);
      this.onDidChangeStickyScrollFocused = this.stickyScrollController.onDidChangeHasFocus;
    } else if (this.stickyScrollController && !this._options.enableStickyScroll) {
      this.onDidChangeStickyScrollFocused = Event.None;
      this.stickyScrollController.dispose();
      this.stickyScrollController = void 0;
    }
    this.stickyScrollController?.updateOptions(optionsUpdate);
  }
  updateWidth(element) {
    const index = this.model.getListIndex(element);
    if (index === -1) {
      return;
    }
    this.view.updateWidth(index);
  }
  // Widget
  getHTMLElement() {
    return this.view.getHTMLElement();
  }
  get contentHeight() {
    return this.view.contentHeight;
  }
  get contentWidth() {
    return this.view.contentWidth;
  }
  get onDidChangeContentHeight() {
    return this.view.onDidChangeContentHeight;
  }
  get onDidChangeContentWidth() {
    return this.view.onDidChangeContentWidth;
  }
  get scrollTop() {
    return this.view.scrollTop;
  }
  set scrollTop(scrollTop) {
    this.view.scrollTop = scrollTop;
  }
  get scrollLeft() {
    return this.view.scrollLeft;
  }
  set scrollLeft(scrollLeft) {
    this.view.scrollLeft = scrollLeft;
  }
  get scrollHeight() {
    return this.view.scrollHeight;
  }
  get renderHeight() {
    return this.view.renderHeight;
  }
  get firstVisibleElement() {
    let index = this.view.firstVisibleIndex;
    if (this.stickyScrollController) {
      index += this.stickyScrollController.count;
    }
    if (index < 0 || index >= this.view.length) {
      return void 0;
    }
    const node = this.view.element(index);
    return node.element;
  }
  get lastVisibleElement() {
    const index = this.view.lastVisibleIndex;
    const node = this.view.element(index);
    return node.element;
  }
  get ariaLabel() {
    return this.view.ariaLabel;
  }
  set ariaLabel(value) {
    this.view.ariaLabel = value;
  }
  get selectionSize() {
    return this.selection.getNodes().length;
  }
  domFocus() {
    if (this.stickyScrollController?.focusedLast()) {
      this.stickyScrollController.domFocus();
    } else {
      this.view.domFocus();
    }
  }
  isDOMFocused() {
    return isActiveElement(this.getHTMLElement());
  }
  layout(height, width) {
    this.view.layout(height, width);
  }
  style(styles) {
    const suffix = `.${this.view.domId}`;
    const content = [];
    if (styles.treeIndentGuidesStroke) {
      content.push(`.monaco-list${suffix}:hover .monaco-tl-indent > .indent-guide, .monaco-list${suffix}.always .monaco-tl-indent > .indent-guide  { opacity: 1; border-color: ${styles.treeInactiveIndentGuidesStroke}; }`);
      content.push(`.monaco-list${suffix} .monaco-tl-indent > .indent-guide.active { opacity: 1; border-color: ${styles.treeIndentGuidesStroke}; }`);
    }
    const stickyScrollBackground = styles.treeStickyScrollBackground ?? styles.listBackground;
    if (stickyScrollBackground) {
      content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container { background-color: ${stickyScrollBackground}; }`);
      content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container .monaco-tree-sticky-row { background-color: ${stickyScrollBackground}; }`);
    }
    if (styles.treeStickyScrollBorder) {
      content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container { border-bottom: 1px solid ${styles.treeStickyScrollBorder}; }`);
    }
    if (styles.treeStickyScrollShadow) {
      content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container .monaco-tree-sticky-container-shadow { box-shadow: ${styles.treeStickyScrollShadow} 0 6px 6px -6px inset; height: 3px; }`);
    }
    if (styles.listFocusForeground) {
      content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
      content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused { color: inherit; }`);
    }
    const focusAndSelectionOutline = asCssValueWithDefault(styles.listFocusAndSelectionOutline, asCssValueWithDefault(styles.listSelectionOutline, styles.listFocusOutline ?? ""));
    if (focusAndSelectionOutline) {
      content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused.selected { outline: 1px solid ${focusAndSelectionOutline}; outline-offset: -1px;}`);
      content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused.selected { outline: inherit;}`);
    }
    if (styles.listFocusOutline) {
      content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }`);
      content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused { outline: inherit; }`);
      content.push(`.context-menu-visible .monaco-list${suffix}.last-focused.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.passive-focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }`);
      content.push(`.context-menu-visible .monaco-list${suffix}.last-focused.sticky-scroll-focused .monaco-list-rows .monaco-list-row.focused { outline: inherit; }`);
      content.push(`.context-menu-visible .monaco-list${suffix}.last-focused:not(.sticky-scroll-focused) .monaco-tree-sticky-container .monaco-list-rows .monaco-list-row.focused { outline: inherit; }`);
    }
    this.styleElement.textContent = content.join("\n");
    this.view.style(styles);
  }
  // Tree navigation
  getParentElement(location) {
    const parentRef = this.model.getParentNodeLocation(location);
    const parentNode = this.model.getNode(parentRef);
    return parentNode.element;
  }
  getFirstElementChild(location) {
    return this.model.getFirstElementChild(location);
  }
  // Tree
  getNode(location) {
    return this.model.getNode(location);
  }
  getNodeLocation(node) {
    return this.model.getNodeLocation(node);
  }
  collapse(location, recursive = false) {
    return this.model.setCollapsed(location, true, recursive);
  }
  expand(location, recursive = false) {
    return this.model.setCollapsed(location, false, recursive);
  }
  toggleCollapsed(location, recursive = false) {
    return this.model.setCollapsed(location, void 0, recursive);
  }
  expandAll() {
    this.model.setCollapsed(this.model.rootRef, false, true);
  }
  collapseAll() {
    this.model.setCollapsed(this.model.rootRef, true, true);
  }
  isCollapsible(location) {
    return this.model.isCollapsible(location);
  }
  setCollapsible(location, collapsible) {
    return this.model.setCollapsible(location, collapsible);
  }
  isCollapsed(location) {
    return this.model.isCollapsed(location);
  }
  expandTo(location) {
    this.model.expandTo(location);
  }
  triggerTypeNavigation() {
    this.view.triggerTypeNavigation();
  }
  openFind() {
    this.findController?.open();
  }
  closeFind() {
    this.findController?.close();
  }
  refilter() {
    this._onWillRefilter.fire(void 0);
    this.model.refilter();
  }
  setAnchor(element) {
    if (typeof element === "undefined") {
      return this.view.setAnchor(void 0);
    }
    this.eventBufferer.bufferEvents(() => {
      const node = this.model.getNode(element);
      this.anchor.set([node]);
      const index = this.model.getListIndex(element);
      if (index > -1) {
        this.view.setAnchor(index, true);
      }
    });
  }
  getAnchor() {
    return this.anchor.get().at(0);
  }
  setSelection(elements, browserEvent) {
    this.eventBufferer.bufferEvents(() => {
      const nodes = elements.map((e) => this.model.getNode(e));
      this.selection.set(nodes, browserEvent);
      const indexes = elements.map((e) => this.model.getListIndex(e)).filter((i) => i > -1);
      this.view.setSelection(indexes, browserEvent, true);
    });
  }
  getSelection() {
    return this.selection.get();
  }
  setFocus(elements, browserEvent) {
    this.eventBufferer.bufferEvents(() => {
      const nodes = elements.map((e) => this.model.getNode(e));
      this.focus.set(nodes, browserEvent);
      const indexes = elements.map((e) => this.model.getListIndex(e)).filter((i) => i > -1);
      this.view.setFocus(indexes, browserEvent, true);
    });
  }
  focusNext(n = 1, loop = false, browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    this.view.focusNext(n, loop, browserEvent, filter);
  }
  focusPrevious(n = 1, loop = false, browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    this.view.focusPrevious(n, loop, browserEvent, filter);
  }
  focusNextPage(browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    return this.view.focusNextPage(browserEvent, filter);
  }
  focusPreviousPage(browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    return this.view.focusPreviousPage(browserEvent, filter, () => this.stickyScrollController?.height ?? 0);
  }
  focusLast(browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    this.view.focusLast(browserEvent, filter);
  }
  focusFirst(browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    this.view.focusFirst(browserEvent, filter);
  }
  getFocus() {
    return this.focus.get();
  }
  getStickyScrollFocus() {
    const focus = this.stickyScrollController?.getFocus();
    return focus !== void 0 ? [focus] : [];
  }
  getFocusedPart() {
    return this.stickyScrollController?.focusedLast() ? 1 /* StickyScroll */ : 0 /* Tree */;
  }
  reveal(location, relativeTop) {
    this.model.expandTo(location);
    const index = this.model.getListIndex(location);
    if (index === -1) {
      return;
    }
    if (!this.stickyScrollController) {
      this.view.reveal(index, relativeTop);
    } else {
      const paddingTop = this.stickyScrollController.nodePositionTopBelowWidget(this.getNode(location));
      this.view.reveal(index, relativeTop, paddingTop);
    }
  }
  /**
   * Returns the relative position of an element rendered in the list.
   * Returns `null` if the element isn't *entirely* in the visible viewport.
   */
  getRelativeTop(location) {
    const index = this.model.getListIndex(location);
    if (index === -1) {
      return null;
    }
    const stickyScrollNode = this.stickyScrollController?.getNode(this.getNode(location));
    return this.view.getRelativeTop(index, stickyScrollNode?.position ?? this.stickyScrollController?.height);
  }
  /**
   * Returns the absolute top offset of an element in the tree's scroll/content
   * space, or `undefined` when the element is not in the tree. Unlike
   * {@link getRelativeTop}, this reads the layout height model, so it also
   * resolves elements outside the rendered viewport.
   */
  getElementTop(location) {
    const index = this.model.getListIndex(location);
    if (index === -1) {
      return void 0;
    }
    return this.view.getElementTop(index);
  }
  getViewState(identityProvider = this.options.identityProvider) {
    if (!identityProvider) {
      throw new TreeError(this._user, "Can't get tree view state without an identity provider");
    }
    const getId = (element) => identityProvider.getId(element).toString();
    const state = AbstractTreeViewState.empty(this.scrollTop);
    for (const focus of this.getFocus()) {
      state.focus.add(getId(focus));
    }
    for (const selection of this.getSelection()) {
      state.selection.add(getId(selection));
    }
    const root = this.model.getNode();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== root && node.collapsible) {
        state.expanded[getId(node.element)] = node.collapsed ? 0 : 1;
      }
      insertInto(stack, stack.length, node.children);
    }
    return state;
  }
  // List
  onLeftArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    const nodes = this.view.getFocusedElements();
    if (nodes.length === 0) {
      return;
    }
    const node = nodes[0];
    const location = this.model.getNodeLocation(node);
    const didChange = this.model.setCollapsed(location, true);
    if (!didChange) {
      const parentLocation = this.model.getParentNodeLocation(location);
      if (!parentLocation) {
        return;
      }
      const parentListIndex = this.model.getListIndex(parentLocation);
      this.view.reveal(parentListIndex);
      this.view.setFocus([parentListIndex]);
    }
  }
  onRightArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    const nodes = this.view.getFocusedElements();
    if (nodes.length === 0) {
      return;
    }
    const node = nodes[0];
    const location = this.model.getNodeLocation(node);
    const didChange = this.model.setCollapsed(location, false);
    if (!didChange) {
      if (!node.children.some((child) => child.visible)) {
        return;
      }
      const [focusedIndex] = this.view.getFocus();
      const firstChildIndex = focusedIndex + 1;
      this.view.reveal(firstChildIndex);
      this.view.setFocus([firstChildIndex]);
    }
  }
  onSpace(e) {
    e.preventDefault();
    e.stopPropagation();
    const nodes = this.view.getFocusedElements();
    if (nodes.length === 0) {
      return;
    }
    const node = nodes[0];
    const location = this.model.getNodeLocation(node);
    const recursive = e.browserEvent.altKey;
    this.model.setCollapsed(location, void 0, recursive);
  }
  setupModel(model) {
    this.modelDisposables.clear();
    this.modelDisposables.add(model.onDidSpliceRenderedNodes(({ start, deleteCount, elements }) => this.view.splice(start, deleteCount, elements)));
    const onDidModelSplice = Event.forEach(model.onDidSpliceModel, (e) => {
      this.eventBufferer.bufferEvents(() => {
        this.focus.onDidModelSplice(e);
        this.selection.onDidModelSplice(e);
      });
    }, this.modelDisposables);
    onDidModelSplice(() => null, null, this.modelDisposables);
    const activeNodesEmitter = this.modelDisposables.add(new Emitter());
    const activeNodesDebounce = this.modelDisposables.add(new Delayer(0));
    this.modelDisposables.add(Event.any(onDidModelSplice, this.focus.onDidChange, this.selection.onDidChange)(() => {
      activeNodesDebounce.trigger(() => {
        const set = /* @__PURE__ */ new Set();
        for (const node of this.focus.getNodes()) {
          set.add(node);
        }
        for (const node of this.selection.getNodes()) {
          set.add(node);
        }
        activeNodesEmitter.fire([...set.values()]);
      });
    }));
    this.onDidChangeActiveNodesRelay.input = activeNodesEmitter.event;
    this.onDidChangeModelRelay.input = Event.signal(model.onDidSpliceModel);
    this.onDidChangeCollapseStateRelay.input = model.onDidChangeCollapseState;
    this.onDidChangeRenderNodeCountRelay.input = model.onDidChangeRenderNodeCount;
    this.onDidSpliceModelRelay.input = model.onDidSpliceModel;
    if (isMacintosh) {
      this.modelDisposables.add(model.onDidChangeCollapseState((e) => {
        const { node, deep } = e;
        if (node.collapsible && !deep && this.isDOMFocused()) {
          alert(node.collapsed ? localize("treeNodeCollapsed", "collapsed") : localize("treeNodeExpanded", "expanded"));
        }
      }));
    }
  }
  navigate(start) {
    return new TreeNavigator(this.view, this.model, start);
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this.view.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  dispose() {
    dispose(this.disposables);
    this.stickyScrollController?.dispose();
    this.view.dispose();
    this.modelDisposables.dispose();
  }
}
class TreeNavigator {
  constructor(view, model, start) {
    this.view = view;
    this.model = model;
    if (start) {
      this.index = this.model.getListIndex(start);
    } else {
      this.index = -1;
    }
  }
  current() {
    if (this.index < 0 || this.index >= this.view.length) {
      return null;
    }
    return this.view.element(this.index).element;
  }
  previous() {
    this.index--;
    return this.current();
  }
  next() {
    this.index++;
    return this.current();
  }
  first() {
    this.index = 0;
    return this.current();
  }
  last() {
    this.index = this.view.length - 1;
    return this.current();
  }
}
export {
  AbstractFindController,
  AbstractTree,
  AbstractTreePart,
  AbstractTreeViewState,
  ComposedTreeDelegate,
  FindController,
  FindFilter,
  FindToggles,
  RenderIndentGuides,
  TreeFindMatchType,
  TreeFindMode,
  TreeRenderer,
  contiguousFuzzyScore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS90cmVlL2Fic3RyYWN0VHJlZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEcmFnQW5kRHJvcERhdGEgfSBmcm9tICcuLi8uLi9kbmQuanMnO1xuaW1wb3J0IHsgJCwgYXBwZW5kLCBjbGVhck5vZGUsIGgsIGhhc1BhcmVudFdpdGhDbGFzcywgaXNBY3RpdmVFbGVtZW50LCBpc0tleWJvYXJkRXZlbnQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgaXNFZGl0YWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFsdWVXaXRoRGVmYXVsdCB9IGZyb20gJy4uLy4uL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IERvbUVtaXR0ZXIgfSBmcm9tICcuLi8uLi9ldmVudC5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3UHJvdmlkZXIgfSBmcm9tICcuLi9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBGaW5kSW5wdXQgfSBmcm9tICcuLi9maW5kaW5wdXQvZmluZElucHV0LmpzJztcbmltcG9ydCB7IElJbnB1dEJveFN0eWxlcywgSU1lc3NhZ2UsIE1lc3NhZ2VUeXBlLCB1bnRoZW1lZEluYm94U3R5bGVzIH0gZnJvbSAnLi4vaW5wdXRib3gvaW5wdXRCb3guanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBJTGlzdENvbnRleHRNZW51RXZlbnQsIElMaXN0RHJhZ0FuZERyb3AsIElMaXN0RHJhZ092ZXJSZWFjdGlvbiwgSUxpc3RFbGVtZW50UmVuZGVyRGV0YWlscywgSUxpc3RNb3VzZUV2ZW50LCBJTGlzdFJlbmRlcmVyLCBJTGlzdFRvdWNoRXZlbnQsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uL2xpc3QvbGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsIElMaXN0T3B0aW9ucywgSUxpc3RTdHlsZXMsIGlzQWN0aW9uSXRlbSwgaXNCdXR0b24sIGlzTW9uYWNvQ3VzdG9tVG9nZ2xlLCBpc01vbmFjb0VkaXRvciwgaXNTdGlja3lTY3JvbGxDb250YWluZXIsIGlzU3RpY2t5U2Nyb2xsRWxlbWVudCwgTGlzdCwgTW91c2VDb250cm9sbGVyLCBUeXBlTmF2aWdhdGlvbk1vZGUgfSBmcm9tICcuLi9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRvZ2dsZVN0eWxlcywgVG9nZ2xlLCB1bnRoZW1lZFRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgZ2V0VmlzaWJsZVN0YXRlLCBpc0ZpbHRlclJlc3VsdCB9IGZyb20gJy4vaW5kZXhUcmVlTW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvbGxhcHNlU3RhdGVDaGFuZ2VFdmVudCwgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZURyYWdBbmREcm9wLCBJVHJlZUV2ZW50LCBJVHJlZUZpbHRlciwgSVRyZWVNb2RlbCwgSVRyZWVNb2RlbFNwbGljZUV2ZW50LCBJVHJlZU1vdXNlRXZlbnQsIElUcmVlTmF2aWdhdG9yLCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIsIFRyZWVEcmFnT3ZlckJ1YmJsZSwgVHJlZUVycm9yLCBUcmVlRmlsdGVyUmVzdWx0LCBUcmVlTW91c2VFdmVudFRhcmdldCwgVHJlZVZpc2liaWxpdHkgfSBmcm9tICcuL3RyZWUuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgZGlzdGluY3QsIGVxdWFscywgaW5zZXJ0SW50bywgcmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIGRpc3Bvc2FibGVUaW1lb3V0LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBTZXRNYXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBFdmVudEJ1ZmZlcmVyLCBSZWxheSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBmdXp6eVNjb3JlLCBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvdHJlZS5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgdHlwZSBJSG92ZXJMaWZlY3ljbGVPcHRpb25zIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXIuanMnO1xuXG5jbGFzcyBUcmVlRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VCwgVEZpbHRlckRhdGEsIFRDb250ZXh0PiBleHRlbmRzIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhPFQsIFRDb250ZXh0PiB7XG5cblx0b3ZlcnJpZGUgc2V0IGNvbnRleHQoY29udGV4dDogVENvbnRleHQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmRhdGEuY29udGV4dCA9IGNvbnRleHQ7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgY29udGV4dCgpOiBUQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZGF0YS5jb250ZXh0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBkYXRhOiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBUQ29udGV4dD4pIHtcblx0XHRzdXBlcihkYXRhLmVsZW1lbnRzLm1hcChub2RlID0+IG5vZGUuZWxlbWVudCkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzVHJlZURyYWdBbmREcm9wRGF0YTxULCBURmlsdGVyRGF0YT4oZGF0YTogSURyYWdBbmREcm9wRGF0YSk6IElEcmFnQW5kRHJvcERhdGEge1xuXHRpZiAoZGF0YSBpbnN0YW5jZW9mIEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhKSB7XG5cdFx0cmV0dXJuIG5ldyBUcmVlRWxlbWVudHNEcmFnQW5kRHJvcERhdGEoZGF0YSk7XG5cdH1cblxuXHRyZXR1cm4gZGF0YTtcbn1cblxuY2xhc3MgVHJlZU5vZGVMaXN0RHJhZ0FuZERyb3A8VCwgVEZpbHRlckRhdGEsIFRSZWY+IGltcGxlbWVudHMgSUxpc3REcmFnQW5kRHJvcDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PiB7XG5cblx0cHJpdmF0ZSBhdXRvRXhwYW5kTm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhdXRvRXhwYW5kRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgPSBEaXNwb3NhYmxlLk5vbmU7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBtb2RlbFByb3ZpZGVyOiAoKSA9PiBJVHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiwgcHJpdmF0ZSBkbmQ6IElUcmVlRHJhZ0FuZERyb3A8VD4pIHsgfVxuXG5cdGdldERyYWdVUkkobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmRuZC5nZXREcmFnVVJJKG5vZGUuZWxlbWVudCk7XG5cdH1cblxuXHRnZXREcmFnTGFiZWwobm9kZXM6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT5bXSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5kbmQuZ2V0RHJhZ0xhYmVsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kbmQuZ2V0RHJhZ0xhYmVsKG5vZGVzLm1hcChub2RlID0+IG5vZGUuZWxlbWVudCksIG9yaWdpbmFsRXZlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvbkRyYWdTdGFydChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmRuZC5vbkRyYWdTdGFydD8uKGFzVHJlZURyYWdBbmREcm9wRGF0YShkYXRhKSwgb3JpZ2luYWxFdmVudCk7XG5cdH1cblxuXHRvbkRyYWdPdmVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldE5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCwgcmF3ID0gdHJ1ZSk6IGJvb2xlYW4gfCBJTGlzdERyYWdPdmVyUmVhY3Rpb24ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZG5kLm9uRHJhZ092ZXIoYXNUcmVlRHJhZ0FuZERyb3BEYXRhKGRhdGEpLCB0YXJnZXROb2RlICYmIHRhcmdldE5vZGUuZWxlbWVudCwgdGFyZ2V0SW5kZXgsIHRhcmdldFNlY3Rvciwgb3JpZ2luYWxFdmVudCk7XG5cdFx0Y29uc3QgZGlkQ2hhbmdlQXV0b0V4cGFuZE5vZGUgPSB0aGlzLmF1dG9FeHBhbmROb2RlICE9PSB0YXJnZXROb2RlO1xuXG5cdFx0aWYgKGRpZENoYW5nZUF1dG9FeHBhbmROb2RlKSB7XG5cdFx0XHR0aGlzLmF1dG9FeHBhbmREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuYXV0b0V4cGFuZE5vZGUgPSB0YXJnZXROb2RlO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdGFyZ2V0Tm9kZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKGRpZENoYW5nZUF1dG9FeHBhbmROb2RlICYmIHR5cGVvZiByZXN1bHQgIT09ICdib29sZWFuJyAmJiByZXN1bHQuYXV0b0V4cGFuZCkge1xuXHRcdFx0dGhpcy5hdXRvRXhwYW5kRGlzcG9zYWJsZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsUHJvdmlkZXIoKTtcblx0XHRcdFx0Y29uc3QgcmVmID0gbW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKHRhcmdldE5vZGUpO1xuXG5cdFx0XHRcdGlmIChtb2RlbC5pc0NvbGxhcHNlZChyZWYpKSB7XG5cdFx0XHRcdFx0bW9kZWwuc2V0Q29sbGFwc2VkKHJlZiwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5hdXRvRXhwYW5kTm9kZSA9IHVuZGVmaW5lZDtcblx0XHRcdH0sIDUwMCwgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiByZXN1bHQgPT09ICdib29sZWFuJyB8fCAhcmVzdWx0LmFjY2VwdCB8fCB0eXBlb2YgcmVzdWx0LmJ1YmJsZSA9PT0gJ3VuZGVmaW5lZCcgfHwgcmVzdWx0LmZlZWRiYWNrKSB7XG5cdFx0XHRpZiAoIXJhdykge1xuXHRcdFx0XHRjb25zdCBhY2NlcHQgPSB0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicgPyByZXN1bHQgOiByZXN1bHQuYWNjZXB0O1xuXHRcdFx0XHRjb25zdCBlZmZlY3QgPSB0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicgPyB1bmRlZmluZWQgOiByZXN1bHQuZWZmZWN0O1xuXHRcdFx0XHRyZXR1cm4geyBhY2NlcHQsIGVmZmVjdCwgZmVlZGJhY2s6IFt0YXJnZXRJbmRleCFdIH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc3VsdC5idWJibGUgPT09IFRyZWVEcmFnT3ZlckJ1YmJsZS5VcCkge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsUHJvdmlkZXIoKTtcblx0XHRcdGNvbnN0IHJlZiA9IG1vZGVsLmdldE5vZGVMb2NhdGlvbih0YXJnZXROb2RlKTtcblx0XHRcdGNvbnN0IHBhcmVudFJlZiA9IG1vZGVsLmdldFBhcmVudE5vZGVMb2NhdGlvbihyZWYpO1xuXHRcdFx0Y29uc3QgcGFyZW50Tm9kZSA9IG1vZGVsLmdldE5vZGUocGFyZW50UmVmKTtcblx0XHRcdGNvbnN0IHBhcmVudEluZGV4ID0gcGFyZW50UmVmICYmIG1vZGVsLmdldExpc3RJbmRleChwYXJlbnRSZWYpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5vbkRyYWdPdmVyKGRhdGEsIHBhcmVudE5vZGUsIHBhcmVudEluZGV4LCB0YXJnZXRTZWN0b3IsIG9yaWdpbmFsRXZlbnQsIGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxQcm92aWRlcigpO1xuXHRcdGNvbnN0IHJlZiA9IG1vZGVsLmdldE5vZGVMb2NhdGlvbih0YXJnZXROb2RlKTtcblx0XHRjb25zdCBzdGFydCA9IG1vZGVsLmdldExpc3RJbmRleChyZWYpO1xuXHRcdGNvbnN0IGxlbmd0aCA9IG1vZGVsLmdldExpc3RSZW5kZXJDb3VudChyZWYpO1xuXG5cdFx0cmV0dXJuIHsgLi4ucmVzdWx0LCBmZWVkYmFjazogcmFuZ2Uoc3RhcnQsIHN0YXJ0ICsgbGVuZ3RoKSB9O1xuXHR9XG5cblx0ZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXROb2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmF1dG9FeHBhbmREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmF1dG9FeHBhbmROb2RlID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5kbmQuZHJvcChhc1RyZWVEcmFnQW5kRHJvcERhdGEoZGF0YSksIHRhcmdldE5vZGUgJiYgdGFyZ2V0Tm9kZS5lbGVtZW50LCB0YXJnZXRJbmRleCwgdGFyZ2V0U2VjdG9yLCBvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdG9uRHJhZ0VuZChvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmRuZC5vbkRyYWdFbmQ/LihvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kbmQuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzTGlzdE9wdGlvbnM8VCwgVEZpbHRlckRhdGEsIFRSZWY+KG1vZGVsUHJvdmlkZXI6ICgpID0+IElUcmVlTW9kZWw8VCwgVEZpbHRlckRhdGEsIFRSZWY+LCBkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9ucz86IElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPik6IElMaXN0T3B0aW9uczxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBvcHRpb25zICYmIHtcblx0XHQuLi5vcHRpb25zLFxuXHRcdGlkZW50aXR5UHJvdmlkZXI6IG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciAmJiB7XG5cdFx0XHRnZXRJZChlbCkge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChlbC5lbGVtZW50KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRHcm91cElkOiBvcHRpb25zLmlkZW50aXR5UHJvdmlkZXIhLmdldEdyb3VwSWQgPyAoZWwpID0+IHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciEuZ2V0R3JvdXBJZCEoZWwuZWxlbWVudCk7XG5cdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0fSxcblx0XHRkbmQ6IG9wdGlvbnMuZG5kICYmIGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFRyZWVOb2RlTGlzdERyYWdBbmREcm9wKG1vZGVsUHJvdmlkZXIsIG9wdGlvbnMuZG5kKSksXG5cdFx0bXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyOiBvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlciAmJiB7XG5cdFx0XHRpc1NlbGVjdGlvblNpbmdsZUNoYW5nZUV2ZW50KGUpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIhLmlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoeyAuLi5lLCBlbGVtZW50OiBlLmVsZW1lbnQgfSBhcyBJTGlzdE1vdXNlRXZlbnQ8VD4gfCBJTGlzdFRvdWNoRXZlbnQ8VD4pO1xuXHRcdFx0fSxcblx0XHRcdGlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudChlKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyIS5pc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoeyAuLi5lLCBlbGVtZW50OiBlLmVsZW1lbnQgfSBhcyBJTGlzdE1vdXNlRXZlbnQ8VD4gfCBJTGlzdFRvdWNoRXZlbnQ8VD4pO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciAmJiB7XG5cdFx0XHQuLi5vcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcixcblx0XHRcdGdldFNldFNpemUobm9kZSkge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUHJvdmlkZXIoKTtcblx0XHRcdFx0Y29uc3QgcmVmID0gbW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRSZWYgPSBtb2RlbC5nZXRQYXJlbnROb2RlTG9jYXRpb24ocmVmKTtcblx0XHRcdFx0Y29uc3QgcGFyZW50Tm9kZSA9IG1vZGVsLmdldE5vZGUocGFyZW50UmVmKTtcblxuXHRcdFx0XHRyZXR1cm4gcGFyZW50Tm9kZS52aXNpYmxlQ2hpbGRyZW5Db3VudDtcblx0XHRcdH0sXG5cdFx0XHRnZXRQb3NJblNldChub2RlKSB7XG5cdFx0XHRcdHJldHVybiBub2RlLnZpc2libGVDaGlsZEluZGV4ICsgMTtcblx0XHRcdH0sXG5cdFx0XHRpc0NoZWNrZWQ6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyICYmIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmlzQ2hlY2tlZCA/IChub2RlKSA9PiB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuaXNDaGVja2VkIShub2RlLmVsZW1lbnQpO1xuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdGdldFJvbGU6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyICYmIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFJvbGUgPyAobm9kZSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIhLmdldFJvbGUhKG5vZGUuZWxlbWVudCk7XG5cdFx0XHR9IDogKCkgPT4gJ3RyZWVpdGVtJyxcblx0XHRcdGdldEFyaWFMYWJlbChlKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0QXJpYUxhYmVsKGUuZWxlbWVudCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCkge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIhLmdldFdpZGdldEFyaWFMYWJlbCgpO1xuXHRcdFx0fSxcblx0XHRcdGdldFdpZGdldFJvbGU6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyICYmIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFdpZGdldFJvbGUgPyAoKSA9PiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0V2lkZ2V0Um9sZSEoKSA6ICgpID0+ICd0cmVlJyxcblx0XHRcdGdldEFyaWFMZXZlbDogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIgJiYgb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QXJpYUxldmVsID8gKG5vZGUpID0+IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRBcmlhTGV2ZWwhKG5vZGUuZWxlbWVudCkgOiAobm9kZSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbm9kZS5kZXB0aDtcblx0XHRcdH0sXG5cdFx0XHRnZXRBY3RpdmVEZXNjZW5kYW50SWQ6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFjdGl2ZURlc2NlbmRhbnRJZCAmJiAobm9kZSA9PiB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0QWN0aXZlRGVzY2VuZGFudElkIShub2RlLmVsZW1lbnQpO1xuXHRcdFx0fSlcblx0XHR9LFxuXHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IG9wdGlvbnMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciAmJiB7XG5cdFx0XHQuLi5vcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsXG5cdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChub2RlKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIhLmdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKG5vZGUuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgQ29tcG9zZWRUcmVlRGVsZWdhdGU8VCwgTiBleHRlbmRzIHsgZWxlbWVudDogVCB9PiBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPE4+IHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGRlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPikgeyB9XG5cblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IE4pOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmRlbGVnYXRlLmdldEhlaWdodChlbGVtZW50LmVsZW1lbnQpO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBOKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5kZWxlZ2F0ZS5nZXRUZW1wbGF0ZUlkKGVsZW1lbnQuZWxlbWVudCk7XG5cdH1cblxuXHRoYXNEeW5hbWljSGVpZ2h0KGVsZW1lbnQ6IE4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmRlbGVnYXRlLmhhc0R5bmFtaWNIZWlnaHQgJiYgdGhpcy5kZWxlZ2F0ZS5oYXNEeW5hbWljSGVpZ2h0KGVsZW1lbnQuZWxlbWVudCk7XG5cdH1cblxuXHRzZXREeW5hbWljSGVpZ2h0KGVsZW1lbnQ6IE4sIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5kZWxlZ2F0ZS5zZXREeW5hbWljSGVpZ2h0Py4oZWxlbWVudC5lbGVtZW50LCBoZWlnaHQpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJVHJlZUxpc3RUZW1wbGF0ZURhdGE8VD4ge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpbmRlbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0d2lzdGllOiBIVE1MRWxlbWVudDtcblx0aW5kZW50R3VpZGVzRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG5cdGluZGVudFNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgdGVtcGxhdGVEYXRhOiBUO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBYnN0cmFjdFRyZWVWaWV3U3RhdGUge1xuXHRyZWFkb25seSBmb2N1czogSXRlcmFibGU8c3RyaW5nPjtcblx0cmVhZG9ubHkgc2VsZWN0aW9uOiBJdGVyYWJsZTxzdHJpbmc+O1xuXHRyZWFkb25seSBleHBhbmRlZDogeyBbaWQ6IHN0cmluZ106IDEgfCAwIH07XG5cdHJlYWRvbmx5IHNjcm9sbFRvcDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQWJzdHJhY3RUcmVlVmlld1N0YXRlIGltcGxlbWVudHMgSUFic3RyYWN0VHJlZVZpZXdTdGF0ZSB7XG5cdHB1YmxpYyByZWFkb25seSBmb2N1czogU2V0PHN0cmluZz47XG5cdHB1YmxpYyByZWFkb25seSBzZWxlY3Rpb246IFNldDxzdHJpbmc+O1xuXHRwdWJsaWMgcmVhZG9ubHkgZXhwYW5kZWQ6IHsgW2lkOiBzdHJpbmddOiAxIHwgMCB9O1xuXHRwdWJsaWMgc2Nyb2xsVG9wOiBudW1iZXI7XG5cblx0cHVibGljIHN0YXRpYyBsaWZ0KHN0YXRlOiBJQWJzdHJhY3RUcmVlVmlld1N0YXRlKSB7XG5cdFx0cmV0dXJuIHN0YXRlIGluc3RhbmNlb2YgQWJzdHJhY3RUcmVlVmlld1N0YXRlID8gc3RhdGUgOiBuZXcgQWJzdHJhY3RUcmVlVmlld1N0YXRlKHN0YXRlKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZW1wdHkoc2Nyb2xsVG9wID0gMCkge1xuXHRcdHJldHVybiBuZXcgQWJzdHJhY3RUcmVlVmlld1N0YXRlKHtcblx0XHRcdGZvY3VzOiBbXSxcblx0XHRcdHNlbGVjdGlvbjogW10sXG5cdFx0XHRleHBhbmRlZDogT2JqZWN0LmNyZWF0ZShudWxsKSxcblx0XHRcdHNjcm9sbFRvcCxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3RvcihzdGF0ZTogSUFic3RyYWN0VHJlZVZpZXdTdGF0ZSkge1xuXHRcdHRoaXMuZm9jdXMgPSBuZXcgU2V0KHN0YXRlLmZvY3VzKTtcblx0XHR0aGlzLnNlbGVjdGlvbiA9IG5ldyBTZXQoc3RhdGUuc2VsZWN0aW9uKTtcblx0XHRpZiAoc3RhdGUuZXhwYW5kZWQgaW5zdGFuY2VvZiBBcnJheSkgeyAvLyBvbGQgZm9ybWF0XG5cdFx0XHR0aGlzLmV4cGFuZGVkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdGZvciAoY29uc3QgaWQgb2Ygc3RhdGUuZXhwYW5kZWQgYXMgc3RyaW5nW10pIHtcblx0XHRcdFx0dGhpcy5leHBhbmRlZFtpZF0gPSAxO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmV4cGFuZGVkID0gc3RhdGUuZXhwYW5kZWQ7XG5cdFx0fVxuXHRcdHRoaXMuZXhwYW5kZWQgPSBzdGF0ZS5leHBhbmRlZDtcblx0XHR0aGlzLnNjcm9sbFRvcCA9IHN0YXRlLnNjcm9sbFRvcDtcblx0fVxuXG5cdHB1YmxpYyB0b0pTT04oKTogSUFic3RyYWN0VHJlZVZpZXdTdGF0ZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZvY3VzOiBBcnJheS5mcm9tKHRoaXMuZm9jdXMpLFxuXHRcdFx0c2VsZWN0aW9uOiBBcnJheS5mcm9tKHRoaXMuc2VsZWN0aW9uKSxcblx0XHRcdGV4cGFuZGVkOiB0aGlzLmV4cGFuZGVkLFxuXHRcdFx0c2Nyb2xsVG9wOiB0aGlzLnNjcm9sbFRvcCxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFJlbmRlckluZGVudEd1aWRlcyB7XG5cdE5vbmUgPSAnbm9uZScsXG5cdE9uSG92ZXIgPSAnb25Ib3ZlcicsXG5cdEFsd2F5cyA9ICdhbHdheXMnXG59XG5cbmludGVyZmFjZSBJVHJlZVJlbmRlcmVyT3B0aW9uczxUPiB7XG5cdHJlYWRvbmx5IGluZGVudD86IG51bWJlcjtcblx0cmVhZG9ubHkgZGVmYXVsdEluZGVudD86IG51bWJlcjtcblx0cmVhZG9ubHkgcmVuZGVySW5kZW50R3VpZGVzPzogUmVuZGVySW5kZW50R3VpZGVzO1xuXHQvLyBUT0RPQGpvYW8gcmVwbGFjZSB0aGlzIHdpdGggY29sbGFwc2libGU6IGJvb2xlYW4gfCAnb25kZW1hbmQnXG5cdHJlYWRvbmx5IGhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM/OiBib29sZWFuO1xuXHRyZWFkb25seSB0d2lzdGllQWRkaXRpb25hbENzc0NsYXNzPzogKGVsZW1lbnQ6IFQpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIENvbGxlY3Rpb248VD4ge1xuXHRyZWFkb25seSBlbGVtZW50czogVFtdO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8VFtdPjtcbn1cblxuY2xhc3MgRXZlbnRDb2xsZWN0aW9uPFQ+IGltcGxlbWVudHMgQ29sbGVjdGlvbjxUPiwgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxUW10+O1xuXG5cdGdldCBlbGVtZW50cygpOiBUW10ge1xuXHRcdHJldHVybiB0aGlzLl9lbGVtZW50cztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKG9uRGlkQ2hhbmdlOiBFdmVudDxUW10+LCBwcml2YXRlIF9lbGVtZW50czogVFtdID0gW10pIHtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlID0gRXZlbnQuZm9yRWFjaChvbkRpZENoYW5nZSwgZWxlbWVudHMgPT4gdGhpcy5fZWxlbWVudHMgPSBlbGVtZW50cywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIFRUZW1wbGF0ZURhdGE+IGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBJVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4+IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEZWZhdWx0SW5kZW50ID0gODtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVuZGVyZWRFbGVtZW50cyA9IG5ldyBNYXA8VCwgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oKTtcblx0cHJpdmF0ZSByZW5kZXJlZE5vZGVzID0gbmV3IE1hcDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBJVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4+KCk7XG5cdHByaXZhdGUgaW5kZW50OiBudW1iZXIgPSBUcmVlUmVuZGVyZXIuRGVmYXVsdEluZGVudDtcblx0cHJpdmF0ZSBkZWZhdWx0SW5kZW50OiBudW1iZXIgPSBUcmVlUmVuZGVyZXIuRGVmYXVsdEluZGVudDtcblx0cHJpdmF0ZSBoaWRlVHdpc3RpZXNPZkNoaWxkbGVzc0VsZW1lbnRzOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgdHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzcz86IChlbGVtZW50OiBUKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzaG91bGRSZW5kZXJJbmRlbnRHdWlkZXM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBhY3RpdmVJbmRlbnROb2RlcyA9IG5ldyBTZXQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oKTtcblx0cHJpdmF0ZSBpbmRlbnRHdWlkZXNEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyZXI6IElUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRUZW1wbGF0ZURhdGE+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElUcmVlTW9kZWw8VCwgVEZpbHRlckRhdGEsIFRSZWY+LFxuXHRcdG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZTogRXZlbnQ8SUNvbGxhcHNlU3RhdGVDaGFuZ2VFdmVudDxULCBURmlsdGVyRGF0YT4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlTm9kZXM6IENvbGxlY3Rpb248SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlZEluZGVudEd1aWRlczogU2V0TWFwPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIEhUTUxEaXZFbGVtZW50Pixcblx0XHRvcHRpb25zOiBJVHJlZVJlbmRlcmVyT3B0aW9uczxUPiA9IHt9XG5cdCkge1xuXHRcdHRoaXMudGVtcGxhdGVJZCA9IHJlbmRlcmVyLnRlbXBsYXRlSWQ7XG5cdFx0dGhpcy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0RXZlbnQubWFwKG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSwgZSA9PiBlLm5vZGUpKHRoaXMub25EaWRDaGFuZ2VOb2RlVHdpc3RpZVN0YXRlLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRyZW5kZXJlci5vbkRpZENoYW5nZVR3aXN0aWVTdGF0ZT8uKHRoaXMub25EaWRDaGFuZ2VUd2lzdGllU3RhdGUsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJVHJlZVJlbmRlcmVyT3B0aW9uczxUPiA9IHt9KTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLmRlZmF1bHRJbmRlbnQgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLmRlZmF1bHRJbmRlbnQgPSBvcHRpb25zLmRlZmF1bHRJbmRlbnQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLmluZGVudCAhPT0gJ3VuZGVmaW5lZCcgfHwgdHlwZW9mIG9wdGlvbnMuZGVmYXVsdEluZGVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGNvbnN0IGluZGVudCA9IHR5cGVvZiBvcHRpb25zLmluZGVudCAhPT0gJ3VuZGVmaW5lZCcgPyBjbGFtcChvcHRpb25zLmluZGVudCwgMCwgNDApIDogdGhpcy5pbmRlbnQ7XG5cdFx0XHRjb25zdCBuZWVkc1JlcmVuZGVyID0gaW5kZW50ICE9PSB0aGlzLmluZGVudCB8fCB0eXBlb2Ygb3B0aW9ucy5kZWZhdWx0SW5kZW50ICE9PSAndW5kZWZpbmVkJztcblxuXHRcdFx0aWYgKG5lZWRzUmVyZW5kZXIpIHtcblx0XHRcdFx0dGhpcy5pbmRlbnQgPSBpbmRlbnQ7XG5cblx0XHRcdFx0Zm9yIChjb25zdCBbbm9kZSwgdGVtcGxhdGVEYXRhXSBvZiB0aGlzLnJlbmRlcmVkTm9kZXMpIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50U2l6ZSA9IHRoaXMuZGVmYXVsdEluZGVudCArIChub2RlLmRlcHRoIC0gMSkgKiB0aGlzLmluZGVudDtcblx0XHRcdFx0XHR0aGlzLnJlbmRlclRyZWVFbGVtZW50KG5vZGUsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMucmVuZGVySW5kZW50R3VpZGVzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29uc3Qgc2hvdWxkUmVuZGVySW5kZW50R3VpZGVzID0gb3B0aW9ucy5yZW5kZXJJbmRlbnRHdWlkZXMgIT09IFJlbmRlckluZGVudEd1aWRlcy5Ob25lO1xuXG5cdFx0XHRpZiAoc2hvdWxkUmVuZGVySW5kZW50R3VpZGVzICE9PSB0aGlzLnNob3VsZFJlbmRlckluZGVudEd1aWRlcykge1xuXHRcdFx0XHR0aGlzLnNob3VsZFJlbmRlckluZGVudEd1aWRlcyA9IHNob3VsZFJlbmRlckluZGVudEd1aWRlcztcblxuXHRcdFx0XHRmb3IgKGNvbnN0IFtub2RlLCB0ZW1wbGF0ZURhdGFdIG9mIHRoaXMucmVuZGVyZWROb2Rlcykge1xuXHRcdFx0XHRcdHRoaXMuX3JlbmRlckluZGVudEd1aWRlcyhub2RlLCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5pbmRlbnRHdWlkZXNEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdFx0XHRpZiAoc2hvdWxkUmVuZGVySW5kZW50R3VpZGVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVOb2Rlcy5vbkRpZENoYW5nZSh0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZU5vZGVzLCB0aGlzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0dGhpcy5pbmRlbnRHdWlkZXNEaXNwb3NhYmxlID0gZGlzcG9zYWJsZXM7XG5cblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZU5vZGVzKHRoaXMuYWN0aXZlTm9kZXMuZWxlbWVudHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLmhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLmhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHMgPSBvcHRpb25zLmhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLnR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3MgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLnR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3MgPSBvcHRpb25zLnR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3M7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiB7XG5cdFx0Y29uc3QgZWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubW9uYWNvLXRsLXJvdycpKTtcblx0XHRjb25zdCBpbmRlbnQgPSBhcHBlbmQoZWwsICQoJy5tb25hY28tdGwtaW5kZW50JykpO1xuXHRcdGNvbnN0IHR3aXN0aWUgPSBhcHBlbmQoZWwsICQoJy5tb25hY28tdGwtdHdpc3RpZScpKTtcblx0XHRjb25zdCBjb250ZW50cyA9IGFwcGVuZChlbCwgJCgnLm1vbmFjby10bC1jb250ZW50cycpKTtcblx0XHRjb25zdCB0ZW1wbGF0ZURhdGEgPSB0aGlzLnJlbmRlcmVyLnJlbmRlclRlbXBsYXRlKGNvbnRlbnRzKTtcblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgaW5kZW50LCB0d2lzdGllLCBpbmRlbnRHdWlkZXNEaXNwb3NhYmxlOiBEaXNwb3NhYmxlLk5vbmUsIGluZGVudFNpemU6IDAsIHRlbXBsYXRlRGF0YSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiwgZGV0YWlscz86IElMaXN0RWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50U2l6ZSA9IHRoaXMuZGVmYXVsdEluZGVudCArIChub2RlLmRlcHRoIC0gMSkgKiB0aGlzLmluZGVudDtcblxuXHRcdHRoaXMucmVuZGVyZWROb2Rlcy5zZXQobm9kZSwgdGVtcGxhdGVEYXRhKTtcblx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMuc2V0KG5vZGUuZWxlbWVudCwgbm9kZSk7XG5cdFx0dGhpcy5yZW5kZXJUcmVlRWxlbWVudChub2RlLCB0ZW1wbGF0ZURhdGEpO1xuXHRcdHRoaXMucmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlLCBpbmRleCwgdGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSwgeyAuLi5kZXRhaWxzLCBpbmRlbnQ6IHRlbXBsYXRlRGF0YS5pbmRlbnRTaXplIH0pO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4sIGRldGFpbHM/OiBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmluZGVudEd1aWRlc0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5yZW5kZXJlci5kaXNwb3NlRWxlbWVudD8uKG5vZGUsIGluZGV4LCB0ZW1wbGF0ZURhdGEudGVtcGxhdGVEYXRhLCB7IC4uLmRldGFpbHMsIGluZGVudDogdGVtcGxhdGVEYXRhLmluZGVudFNpemUgfSk7XG5cblx0XHRpZiAodHlwZW9mIGRldGFpbHM/LmhlaWdodCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMucmVuZGVyZWROb2Rlcy5kZWxldGUobm9kZSk7XG5cdFx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMuZGVsZXRlKG5vZGUuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+KTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVHdpc3RpZVN0YXRlKGVsZW1lbnQ6IFQpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5yZW5kZXJlZEVsZW1lbnRzLmdldChlbGVtZW50KTtcblxuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMub25EaWRDaGFuZ2VOb2RlVHdpc3RpZVN0YXRlKG5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZU5vZGVUd2lzdGllU3RhdGUobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IHZvaWQge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YSA9IHRoaXMucmVuZGVyZWROb2Rlcy5nZXQobm9kZSk7XG5cblx0XHRpZiAoIXRlbXBsYXRlRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlTm9kZXModGhpcy5hY3RpdmVOb2Rlcy5lbGVtZW50cyk7XG5cdFx0dGhpcy5yZW5kZXJUcmVlRWxlbWVudChub2RlLCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUcmVlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCB0ZW1wbGF0ZURhdGE6IElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPik6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50d2lzdGllLmNsYXNzTmFtZSA9IHRlbXBsYXRlRGF0YS50d2lzdGllLmNsYXNzTGlzdC5pdGVtKDApITtcblx0XHR0ZW1wbGF0ZURhdGEudHdpc3RpZS5zdHlsZS5wYWRkaW5nTGVmdCA9IGAke3RlbXBsYXRlRGF0YS5pbmRlbnRTaXplfXB4YDtcblx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50LnN0eWxlLndpZHRoID0gYCR7dGVtcGxhdGVEYXRhLmluZGVudFNpemUgKyB0aGlzLmluZGVudCAtIDE2fXB4YDtcblxuXHRcdGlmIChub2RlLmNvbGxhcHNpYmxlKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghbm9kZS5jb2xsYXBzZWQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEudHdpc3RpZS5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24udHJlZUl0ZW1FeHBhbmRlZCkpO1xuXG5cdFx0bGV0IHR3aXN0aWVSZW5kZXJlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKHRoaXMucmVuZGVyZXIucmVuZGVyVHdpc3RpZSkge1xuXHRcdFx0dHdpc3RpZVJlbmRlcmVkID0gdGhpcy5yZW5kZXJlci5yZW5kZXJUd2lzdGllKG5vZGUuZWxlbWVudCwgdGVtcGxhdGVEYXRhLnR3aXN0aWUpO1xuXHRcdH1cblxuXHRcdGlmIChub2RlLmNvbGxhcHNpYmxlICYmICghdGhpcy5oaWRlVHdpc3RpZXNPZkNoaWxkbGVzc0VsZW1lbnRzIHx8IG5vZGUudmlzaWJsZUNoaWxkcmVuQ291bnQgPiAwKSkge1xuXHRcdFx0aWYgKCF0d2lzdGllUmVuZGVyZWQpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnR3aXN0aWUuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnRyZWVJdGVtRXhwYW5kZWQpKTtcblx0XHRcdH1cblxuXHRcdFx0dGVtcGxhdGVEYXRhLnR3aXN0aWUuY2xhc3NMaXN0LmFkZCgnY29sbGFwc2libGUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS50d2lzdGllLmNsYXNzTGlzdC50b2dnbGUoJ2NvbGxhcHNlZCcsIG5vZGUuY29sbGFwc2VkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnR3aXN0aWUuY2xhc3NMaXN0LnJlbW92ZSgnY29sbGFwc2libGUnLCAnY29sbGFwc2VkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkaXRpb25hbCB0d2lzdGllIGNsYXNzXG5cdFx0aWYgKHRoaXMudHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzcykge1xuXHRcdFx0Y29uc3QgYWRkaXRpb25hbENsYXNzID0gdGhpcy50d2lzdGllQWRkaXRpb25hbENzc0NsYXNzKG5vZGUuZWxlbWVudCk7XG5cdFx0XHRpZiAoYWRkaXRpb25hbENsYXNzKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS50d2lzdGllLmNsYXNzTGlzdC5hZGQoYWRkaXRpb25hbENsYXNzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXJJbmRlbnRHdWlkZXMobm9kZSwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckluZGVudEd1aWRlcyhub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCB0ZW1wbGF0ZURhdGE6IElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPik6IHZvaWQge1xuXHRcdGNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuaW5kZW50KTtcblx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50R3VpZGVzRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRpZiAoIXRoaXMuc2hvdWxkUmVuZGVySW5kZW50R3VpZGVzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IHJlZiA9IHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdFx0Y29uc3QgcGFyZW50UmVmID0gdGhpcy5tb2RlbC5nZXRQYXJlbnROb2RlTG9jYXRpb24ocmVmKTtcblxuXHRcdFx0aWYgKCFwYXJlbnRSZWYpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhcmVudCA9IHRoaXMubW9kZWwuZ2V0Tm9kZShwYXJlbnRSZWYpO1xuXHRcdFx0Y29uc3QgZ3VpZGUgPSAkPEhUTUxEaXZFbGVtZW50PignLmluZGVudC1ndWlkZScsIHsgc3R5bGU6IGB3aWR0aDogJHt0aGlzLmluZGVudH1weGAgfSk7XG5cblx0XHRcdGlmICh0aGlzLmFjdGl2ZUluZGVudE5vZGVzLmhhcyhwYXJlbnQpKSB7XG5cdFx0XHRcdGd1aWRlLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGVtcGxhdGVEYXRhLmluZGVudC5jaGlsZEVsZW1lbnRDb3VudCA9PT0gMCkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50LmFwcGVuZENoaWxkKGd1aWRlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5pbmRlbnQuaW5zZXJ0QmVmb3JlKGd1aWRlLCB0ZW1wbGF0ZURhdGEuaW5kZW50LmZpcnN0RWxlbWVudENoaWxkKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZW5kZXJlZEluZGVudEd1aWRlcy5hZGQocGFyZW50LCBndWlkZSk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnJlbmRlcmVkSW5kZW50R3VpZGVzLmRlbGV0ZShwYXJlbnQsIGd1aWRlKSkpO1xuXG5cdFx0XHRub2RlID0gcGFyZW50O1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5pbmRlbnRHdWlkZXNEaXNwb3NhYmxlID0gZGlzcG9zYWJsZVN0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VBY3RpdmVOb2Rlcyhub2RlczogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPltdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNob3VsZFJlbmRlckluZGVudEd1aWRlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldCA9IG5ldyBTZXQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oKTtcblxuXHRcdG5vZGVzLmZvckVhY2gobm9kZSA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSB0aGlzLm1vZGVsLmdldE5vZGVMb2NhdGlvbihub2RlKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFJlZiA9IHRoaXMubW9kZWwuZ2V0UGFyZW50Tm9kZUxvY2F0aW9uKHJlZik7XG5cblx0XHRcdFx0aWYgKG5vZGUuY29sbGFwc2libGUgJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwICYmICFub2RlLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdHNldC5hZGQobm9kZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFyZW50UmVmKSB7XG5cdFx0XHRcdFx0c2V0LmFkZCh0aGlzLm1vZGVsLmdldE5vZGUocGFyZW50UmVmKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBub29wXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFjdGl2ZUluZGVudE5vZGVzLmZvckVhY2gobm9kZSA9PiB7XG5cdFx0XHRpZiAoIXNldC5oYXMobm9kZSkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJlZEluZGVudEd1aWRlcy5mb3JFYWNoKG5vZGUsIGxpbmUgPT4gbGluZS5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzZXQuZm9yRWFjaChub2RlID0+IHtcblx0XHRcdGlmICghdGhpcy5hY3RpdmVJbmRlbnROb2Rlcy5oYXMobm9kZSkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJlZEluZGVudEd1aWRlcy5mb3JFYWNoKG5vZGUsIGxpbmUgPT4gbGluZS5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFjdGl2ZUluZGVudE5vZGVzID0gc2V0O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVkTm9kZXMuY2xlYXIoKTtcblx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMuY2xlYXIoKTtcblx0XHR0aGlzLmluZGVudEd1aWRlc0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnRpZ3VvdXNGdXp6eVNjb3JlKHBhdHRlcm5Mb3dlcjogc3RyaW5nLCB3b3JkTG93ZXI6IHN0cmluZyk6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBpbmRleCA9IHdvcmRMb3dlci50b0xvd2VyQ2FzZSgpLmluZGV4T2YocGF0dGVybkxvd2VyKTtcblx0bGV0IHNjb3JlOiBGdXp6eVNjb3JlIHwgdW5kZWZpbmVkO1xuXHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdHNjb3JlID0gW051bWJlci5NQVhfU0FGRV9JTlRFR0VSLCAwXTtcblx0XHRmb3IgKGxldCBpID0gcGF0dGVybkxvd2VyLmxlbmd0aDsgaSA+IDA7IGktLSkge1xuXHRcdFx0c2NvcmUucHVzaChpbmRleCArIGkgLSAxKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHNjb3JlO1xufVxuXG5leHBvcnQgdHlwZSBMYWJlbEZ1enp5U2NvcmUgPSB7IGxhYmVsOiBzdHJpbmc7IHNjb3JlOiBGdXp6eVNjb3JlIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbmRGaWx0ZXI8VD4gZXh0ZW5kcyBJVHJlZUZpbHRlcjxULCBGdXp6eVNjb3JlIHwgTGFiZWxGdXp6eVNjb3JlPiB7XG5cdGZpbHRlcihlbGVtZW50OiBULCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT47XG5cdHBhdHRlcm46IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEZpbmRGaWx0ZXI8VD4gaW1wbGVtZW50cyBJRmluZEZpbHRlcjxUPiwgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIF90b3RhbENvdW50ID0gMDtcblx0Z2V0IHRvdGFsQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX3RvdGFsQ291bnQ7IH1cblx0cHJpdmF0ZSBfbWF0Y2hDb3VudCA9IDA7XG5cdGdldCBtYXRjaENvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9tYXRjaENvdW50OyB9XG5cblx0cHJpdmF0ZSBfZmluZE1hdGNoVHlwZTogVHJlZUZpbmRNYXRjaFR5cGUgPSBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eTtcblx0c2V0IGZpbmRNYXRjaFR5cGUodHlwZTogVHJlZUZpbmRNYXRjaFR5cGUpIHsgdGhpcy5fZmluZE1hdGNoVHlwZSA9IHR5cGU7IH1cblx0Z2V0IGZpbmRNYXRjaFR5cGUoKTogVHJlZUZpbmRNYXRjaFR5cGUgeyByZXR1cm4gdGhpcy5fZmluZE1hdGNoVHlwZTsgfVxuXG5cdHByaXZhdGUgX2ZpbmRNb2RlOiBUcmVlRmluZE1vZGUgPSBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0O1xuXHRzZXQgZmluZE1vZGUobW9kZTogVHJlZUZpbmRNb2RlKSB7IHRoaXMuX2ZpbmRNb2RlID0gbW9kZTsgfVxuXHRnZXQgZmluZE1vZGUoKTogVHJlZUZpbmRNb2RlIHsgcmV0dXJuIHRoaXMuX2ZpbmRNb2RlOyB9XG5cblx0cHJpdmF0ZSBfcGF0dGVybjogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX2xvd2VyY2FzZVBhdHRlcm46IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHNldCBwYXR0ZXJuKHBhdHRlcm46IHN0cmluZykge1xuXHRcdHRoaXMuX3BhdHRlcm4gPSBwYXR0ZXJuO1xuXHRcdHRoaXMuX2xvd2VyY2FzZVBhdHRlcm4gPSBwYXR0ZXJuLnRvTG93ZXJDYXNlKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxUPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9maWx0ZXI/OiBJVHJlZUZpbHRlcjxULCBGdXp6eVNjb3JlPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0RmluZFZpc2liaWxpdHk/OiBUcmVlVmlzaWJpbGl0eSB8ICgobm9kZTogVCkgPT4gVHJlZVZpc2liaWxpdHkpLFxuXHQpIHsgfVxuXG5cdGZpbHRlcihlbGVtZW50OiBULCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT4ge1xuXHRcdGxldCB2aXNpYmlsaXR5ID0gVHJlZVZpc2liaWxpdHkuVmlzaWJsZTtcblxuXHRcdGlmICh0aGlzLl9maWx0ZXIpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2ZpbHRlci5maWx0ZXIoZWxlbWVudCwgcGFyZW50VmlzaWJpbGl0eSk7XG5cblx0XHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0dmlzaWJpbGl0eSA9IHJlc3VsdCA/IFRyZWVWaXNpYmlsaXR5LlZpc2libGUgOiBUcmVlVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0XHR9IGVsc2UgaWYgKGlzRmlsdGVyUmVzdWx0KHJlc3VsdCkpIHtcblx0XHRcdFx0dmlzaWJpbGl0eSA9IGdldFZpc2libGVTdGF0ZShyZXN1bHQudmlzaWJpbGl0eSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2aXNpYmlsaXR5ID0gcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuSGlkZGVuKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl90b3RhbENvdW50Kys7XG5cblx0XHRpZiAoIXRoaXMuX3BhdHRlcm4pIHtcblx0XHRcdHRoaXMuX21hdGNoQ291bnQrKztcblx0XHRcdHJldHVybiB7IGRhdGE6IEZ1enp5U2NvcmUuRGVmYXVsdCwgdmlzaWJpbGl0eSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fa2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlci5nZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlbGVtZW50KTtcblx0XHRjb25zdCBsYWJlbHMgPSBBcnJheS5pc0FycmF5KGxhYmVsKSA/IGxhYmVsIDogW2xhYmVsXTtcblxuXHRcdGZvciAoY29uc3QgbCBvZiBsYWJlbHMpIHtcblx0XHRcdGNvbnN0IGxhYmVsU3RyOiBzdHJpbmcgPSBsICYmIGwudG9TdHJpbmcoKTtcblx0XHRcdGlmICh0eXBlb2YgbGFiZWxTdHIgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHJldHVybiB7IGRhdGE6IEZ1enp5U2NvcmUuRGVmYXVsdCwgdmlzaWJpbGl0eSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2NvcmU6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGhpcy5fZmluZE1hdGNoVHlwZSA9PT0gVHJlZUZpbmRNYXRjaFR5cGUuQ29udGlndW91cykge1xuXHRcdFx0XHRzY29yZSA9IGNvbnRpZ3VvdXNGdXp6eVNjb3JlKHRoaXMuX2xvd2VyY2FzZVBhdHRlcm4sIGxhYmVsU3RyLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NvcmUgPSBmdXp6eVNjb3JlKHRoaXMuX3BhdHRlcm4sIHRoaXMuX2xvd2VyY2FzZVBhdHRlcm4sIDAsIGxhYmVsU3RyLCBsYWJlbFN0ci50b0xvd2VyQ2FzZSgpLCAwLCB7IGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUsIGJvb3N0RnVsbE1hdGNoOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNjb3JlKSB7XG5cdFx0XHRcdHRoaXMuX21hdGNoQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIGxhYmVscy5sZW5ndGggPT09IDEgP1xuXHRcdFx0XHRcdHsgZGF0YTogc2NvcmUsIHZpc2liaWxpdHkgfSA6XG5cdFx0XHRcdFx0eyBkYXRhOiB7IGxhYmVsOiBsYWJlbFN0ciwgc2NvcmU6IHNjb3JlIH0sIHZpc2liaWxpdHkgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZmluZE1vZGUgPT09IFRyZWVGaW5kTW9kZS5GaWx0ZXIpIHtcblx0XHRcdGlmICh0eXBlb2YgdGhpcy5fZGVmYXVsdEZpbmRWaXNpYmlsaXR5ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdEZpbmRWaXNpYmlsaXR5O1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9kZWZhdWx0RmluZFZpc2liaWxpdHkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRGaW5kVmlzaWJpbGl0eShlbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiBGdXp6eVNjb3JlLkRlZmF1bHQsIHZpc2liaWxpdHkgfTtcblx0XHR9XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl90b3RhbENvdW50ID0gMDtcblx0XHR0aGlzLl9tYXRjaENvdW50ID0gMDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbiB7XG5cdGlkOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGljb246IFRoZW1lSWNvbjtcblx0aXNDaGVja2VkOiBib29sZWFuO1xufVxuXG5jbGFzcyBUcmVlRmluZFRvZ2dsZSBleHRlbmRzIFRvZ2dsZSB7XG5cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihjb250cmlidXRpb246IElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbiwgb3B0czogSVRvZ2dsZVN0eWxlcywgaG92ZXJMaWZlY3ljbGVPcHRpb25zPzogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucykge1xuXHRcdHN1cGVyKHtcblx0XHRcdGljb246IGNvbnRyaWJ1dGlvbi5pY29uLFxuXHRcdFx0dGl0bGU6IGNvbnRyaWJ1dGlvbi50aXRsZSxcblx0XHRcdGlzQ2hlY2tlZDogY29udHJpYnV0aW9uLmlzQ2hlY2tlZCxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyOiBvcHRzLmlucHV0QWN0aXZlT3B0aW9uQm9yZGVyLFxuXHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kOiBvcHRzLmlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZCxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZDogb3B0cy5pbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQsXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0fSk7XG5cblx0XHR0aGlzLmlkID0gY29udHJpYnV0aW9uLmlkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaW5kVG9nZ2xlcyB7XG5cdHByaXZhdGUgc3RhdGVNYXA6IE1hcDxzdHJpbmcsIElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbj47XG5cblx0Y29uc3RydWN0b3Ioc3RhcnRTdGF0ZXM6IElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbltdKSB7XG5cdFx0dGhpcy5zdGF0ZU1hcCA9IG5ldyBNYXAoc3RhcnRTdGF0ZXMubWFwKHN0YXRlID0+IFtzdGF0ZS5pZCwgeyAuLi5zdGF0ZSB9XSkpO1xuXHR9XG5cblx0c3RhdGVzKCk6IElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbltdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLnN0YXRlTWFwLnZhbHVlcygpKTtcblx0fVxuXG5cdGdldChpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnN0YXRlTWFwLmdldChpZCk7XG5cdFx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc3RhdGUgZm91bmQgZm9yIHRvZ2dsZSBpZCAke2lkfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhdGUuaXNDaGVja2VkO1xuXHR9XG5cblx0c2V0KGlkOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnN0YXRlTWFwLmdldChpZCk7XG5cdFx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc3RhdGUgZm91bmQgZm9yIHRvZ2dsZSBpZCAke2lkfWApO1xuXHRcdH1cblx0XHRpZiAoc3RhdGUuaXNDaGVja2VkID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRzdGF0ZS5pc0NoZWNrZWQgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUcmVlRmluZFRvZ2dsZUNoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgaXNDaGVja2VkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaW5kV2lkZ2V0U3R5bGVzIHtcblx0bGlzdEZpbHRlcldpZGdldEJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZpbHRlcldpZGdldE91dGxpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZpbHRlcldpZGdldE5vTWF0Y2hlc091dGxpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZpbHRlcldpZGdldFNoYWRvdzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0b2dnbGVTdHlsZXM6IElUb2dnbGVTdHlsZXM7XG5cdHJlYWRvbmx5IGlucHV0Qm94U3R5bGVzOiBJSW5wdXRCb3hTdHlsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbmRXaWRnZXRPcHRpb25zIHtcblx0cmVhZG9ubHkgaGlzdG9yeT86IHN0cmluZ1tdO1xuXHRyZWFkb25seSBzdHlsZXM/OiBJRmluZFdpZGdldFN0eWxlcztcbn1cblxuY29uc3QgdW50aGVtZWRGaW5kV2lkZ2V0U3R5bGVzOiBJRmluZFdpZGdldFN0eWxlcyA9IHtcblx0aW5wdXRCb3hTdHlsZXM6IHVudGhlbWVkSW5ib3hTdHlsZXMsXG5cdHRvZ2dsZVN0eWxlczogdW50aGVtZWRUb2dnbGVTdHlsZXMsXG5cdGxpc3RGaWx0ZXJXaWRnZXRCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGxpc3RGaWx0ZXJXaWRnZXROb01hdGNoZXNPdXRsaW5lOiB1bmRlZmluZWQsXG5cdGxpc3RGaWx0ZXJXaWRnZXRPdXRsaW5lOiB1bmRlZmluZWQsXG5cdGxpc3RGaWx0ZXJXaWRnZXRTaGFkb3c6IHVuZGVmaW5lZFxufTtcblxuZXhwb3J0IGVudW0gVHJlZUZpbmRNb2RlIHtcblx0SGlnaGxpZ2h0LFxuXHRGaWx0ZXJcbn1cblxuZXhwb3J0IGVudW0gVHJlZUZpbmRNYXRjaFR5cGUge1xuXHRGdXp6eSxcblx0Q29udGlndW91c1xufVxuXG5jbGFzcyBGaW5kV2lkZ2V0PFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudHMgPSBoKCcubW9uYWNvLXRyZWUtdHlwZS1maWx0ZXInLCBbXG5cdFx0aCgnLm1vbmFjby10cmVlLXR5cGUtZmlsdGVyLWlucHV0QGZpbmRJbnB1dCcpLFxuXHRcdGgoJy5tb25hY28tdHJlZS10eXBlLWZpbHRlci1hY3Rpb25iYXJAYWN0aW9uYmFyJyksXG5cdF0pO1xuXG5cdGdldCB2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmZpbmRJbnB1dC5pbnB1dEJveC52YWx1ZTtcblx0fVxuXG5cdHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3gudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmluZElucHV0OiBGaW5kSW5wdXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uYmFyOiBBY3Rpb25CYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9nZ2xlczogVHJlZUZpbmRUb2dnbGVbXSA9IFtdO1xuXG5cdHJlYWRvbmx5IF9vbkRpZERpc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNhYmxlID0gdGhpcy5fb25EaWREaXNhYmxlLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZhbHVlOiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZUNoYW5nZTogRXZlbnQ8SVRyZWVGaW5kVG9nZ2xlQ2hhbmdlRXZlbnQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSB0cmVlOiBBYnN0cmFjdFRyZWU8VCwgVEZpbHRlckRhdGEsIHVua25vd24+LFxuXHRcdGNvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyLFxuXHRcdHBsYWNlaG9sZGVyOiBzdHJpbmcsXG5cdFx0dG9nZ2xlQ29udHJpYnV0aW9uczogSVRyZWVGaW5kVG9nZ2xlQ29udHJpYnV0aW9uW10gPSBbXSxcblx0XHRvcHRpb25zPzogSUZpbmRXaWRnZXRPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50cy5yb290KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5lbGVtZW50cy5yb290LnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCBzdHlsZXMgPSBvcHRpb25zPy5zdHlsZXMgPz8gdW50aGVtZWRGaW5kV2lkZ2V0U3R5bGVzO1xuXG5cdFx0aWYgKHN0eWxlcy5saXN0RmlsdGVyV2lkZ2V0QmFja2dyb3VuZCkge1xuXHRcdFx0dGhpcy5lbGVtZW50cy5yb290LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHN0eWxlcy5saXN0RmlsdGVyV2lkZ2V0QmFja2dyb3VuZDtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGaWx0ZXJXaWRnZXRTaGFkb3cpIHtcblx0XHRcdHRoaXMuZWxlbWVudHMucm9vdC5zdHlsZS5ib3hTaGFkb3cgPSBgMCAwIDhweCAycHggJHtzdHlsZXMubGlzdEZpbHRlcldpZGdldFNoYWRvd31gO1xuXHRcdH1cblxuXHRcdC8vIGNvbnN0IHRvZ2dsZUhvdmVyRGVsZWdhdGUgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblx0XHRjb25zdCBob3ZlckxpZmVjeWNsZU9wdGlvbnM6IElIb3ZlckxpZmVjeWNsZU9wdGlvbnMgPSB7IGdyb3VwSWQ6ICdhYnN0cmFjdC10cmVlJyB9O1xuXHRcdHRoaXMudG9nZ2xlcyA9IHRvZ2dsZUNvbnRyaWJ1dGlvbnMubWFwKGNvbnRyaWJ1dGlvbiA9PiB0aGlzLl9yZWdpc3RlcihuZXcgVHJlZUZpbmRUb2dnbGUoY29udHJpYnV0aW9uLCBzdHlsZXMudG9nZ2xlU3R5bGVzLCBob3ZlckxpZmVjeWNsZU9wdGlvbnMpKSk7XG5cdFx0dGhpcy5vbkRpZFRvZ2dsZUNoYW5nZSA9IEV2ZW50LmFueSguLi50aGlzLnRvZ2dsZXMubWFwKHRvZ2dsZSA9PiBFdmVudC5tYXAodG9nZ2xlLm9uQ2hhbmdlLCAoKSA9PiAoeyBpZDogdG9nZ2xlLmlkLCBpc0NoZWNrZWQ6IHRvZ2dsZS5jaGVja2VkIH0pKSkpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeSA9IG9wdGlvbnM/Lmhpc3RvcnkgfHwgW107XG5cdFx0dGhpcy5maW5kSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmluZElucHV0KHRoaXMuZWxlbWVudHMuZmluZElucHV0LCBjb250ZXh0Vmlld1Byb3ZpZGVyLCB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3R5cGUgdG8gc2VhcmNoJywgXCJUeXBlIHRvIHNlYXJjaFwiKSxcblx0XHRcdHBsYWNlaG9sZGVyLFxuXHRcdFx0YWRkaXRpb25hbFRvZ2dsZXM6IHRoaXMudG9nZ2xlcyxcblx0XHRcdHNob3dDb21tb25GaW5kVG9nZ2xlczogZmFsc2UsXG5cdFx0XHRpbnB1dEJveFN0eWxlczogc3R5bGVzLmlucHV0Qm94U3R5bGVzLFxuXHRcdFx0dG9nZ2xlU3R5bGVzOiBzdHlsZXMudG9nZ2xlU3R5bGVzLFxuXHRcdFx0aGlzdG9yeTogbmV3IFNldChoaXN0b3J5KSxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHR9KSk7XG5cblx0XHR0aGlzLmFjdGlvbmJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIodGhpcy5lbGVtZW50cy5hY3Rpb25iYXIpKTtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLmZpbmRJbnB1dC5pbnB1dEJveC5pbnB1dEVsZW1lbnQsICdrZXlkb3duJykpO1xuXHRcdGNvbnN0IG9uS2V5RG93biA9IEV2ZW50LmNoYWluKGVtaXR0ZXIuZXZlbnQsICQgPT4gJC5tYXAoZSA9PiBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihvbktleURvd24oKGUpID0+IHtcblx0XHRcdC8vIFVzaW5nIGVxdWFscygpIHNvIHdlIHJlc2VydmUgbW9kaWZpZWQga2V5cyBmb3IgZnV0dXJlIHVzZVxuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgdGhlIG9ubHkga2V5Ym9hcmQgd2F5IHRvIHJldHVybiB0byB0aGUgdHJlZSBmcm9tIGEgaGlzdG9yeSBpdGVtIHRoYXQgaXNuJ3QgdGhlIGxhc3Qgb25lXG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdFx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0aWYgKHRoaXMuZmluZElucHV0LmlucHV0Qm94LmlzQXRMYXN0SW5IaXN0b3J5KCkgfHwgdGhpcy5maW5kSW5wdXQuaW5wdXRCb3guaXNOb3doZXJlSW5IaXN0b3J5KCkpIHtcblx0XHRcdFx0XHQvLyBSZXRhaW4gb3JpZ2luYWwgcHJlLWhpc3RvcnkgRG93bkFycm93IGJlaGF2aW9yXG5cdFx0XHRcdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdFx0XHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gRG93bndhcmQgdGhyb3VnaCBoaXN0b3J5XG5cdFx0XHRcdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3guc2hvd05leHRWYWx1ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Ly8gVXB3YXJkIHRocm91Z2ggaGlzdG9yeVxuXHRcdFx0XHR0aGlzLmZpbmRJbnB1dC5pbnB1dEJveC5zaG93UHJldmlvdXNWYWx1ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY2xvc2VBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCdjbG9zZScsIGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIiksICdjb2RpY29uIGNvZGljb24tY2xvc2UnLCB0cnVlLCAoKSA9PiB0aGlzLmRpc3Bvc2UoKSkpO1xuXHRcdHRoaXMuYWN0aW9uYmFyLnB1c2goY2xvc2VBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5vbkRpZENoYW5nZVZhbHVlID0gdGhpcy5maW5kSW5wdXQub25EaWRDaGFuZ2U7XG5cdH1cblxuXHRzZXRUb2dnbGVTdGF0ZShpZDogc3RyaW5nLCBjaGVja2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9nZ2xlID0gdGhpcy50b2dnbGVzLmZpbmQodG9nZ2xlID0+IHRvZ2dsZS5pZCA9PT0gaWQpO1xuXHRcdGlmICh0b2dnbGUpIHtcblx0XHRcdHRvZ2dsZS5jaGVja2VkID0gY2hlY2tlZDtcblx0XHR9XG5cdH1cblxuXHRzZXRQbGFjZUhvbGRlcihwbGFjZUhvbGRlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3guc2V0UGxhY2VIb2xkZXIocGxhY2VIb2xkZXIpO1xuXHR9XG5cblx0Z2V0SGlzdG9yeSgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZmluZElucHV0LmlucHV0Qm94LmdldEhpc3RvcnkoKTtcblx0fVxuXG5cdGZvY3VzKCkge1xuXHRcdHRoaXMuZmluZElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRzZWxlY3QoKSB7XG5cdFx0dGhpcy5maW5kSW5wdXQuc2VsZWN0KCk7XG5cblx0XHQvLyBSZXBvc2l0aW9uIHRvIGxhc3QgaW4gaGlzdG9yeVxuXHRcdHRoaXMuZmluZElucHV0LmlucHV0Qm94LmFkZFRvSGlzdG9yeSh0cnVlKTtcblx0fVxuXG5cdHNob3dNZXNzYWdlKG1lc3NhZ2U6IElNZXNzYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5maW5kSW5wdXQuc2hvd01lc3NhZ2UobWVzc2FnZSk7XG5cdH1cblxuXHRjbGVhck1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5maW5kSW5wdXQuY2xlYXJNZXNzYWdlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBkaXNwb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX29uRGlkRGlzYWJsZS5maXJlKCk7XG5cdFx0dGhpcy5lbGVtZW50cy5yb290LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0YXdhaXQgdGltZW91dCgzMDApO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5lbnVtIERlZmF1bHRUcmVlVG9nZ2xlcyB7XG5cdE1vZGUgPSAnbW9kZScsXG5cdE1hdGNoVHlwZSA9ICdtYXRjaFR5cGUnLFxufVxuXG5pbnRlcmZhY2UgSUFic3RyYWN0RmluZENvbnRyb2xsZXJPcHRpb25zIGV4dGVuZHMgSUZpbmRXaWRnZXRPcHRpb25zIHtcblx0cGxhY2Vob2xkZXI/OiBzdHJpbmc7XG5cdHRvZ2dsZXM/OiBJVHJlZUZpbmRUb2dnbGVDb250cmlidXRpb25bXTtcblx0c2hvd05vdEZvdW5kTWVzc2FnZT86IGJvb2xlYW47XG5cdGZpbmRXaWRnZXRDb250YWluZXI/OiBIVE1MRWxlbWVudDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmluZENvbnRyb2xsZXJPcHRpb25zIGV4dGVuZHMgSUFic3RyYWN0RmluZENvbnRyb2xsZXJPcHRpb25zIHtcblx0ZGVmYXVsdEZpbmRNb2RlPzogVHJlZUZpbmRNb2RlO1xuXHRkZWZhdWx0RmluZE1hdGNoVHlwZT86IFRyZWVGaW5kTWF0Y2hUeXBlO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RGaW5kQ29udHJvbGxlcjxULCBURmlsdGVyRGF0YT4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfaGlzdG9yeTogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcGF0dGVybiA9ICcnO1xuXHRnZXQgcGF0dGVybigpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fcGF0dGVybjsgfVxuXHRwcml2YXRlIHByZXZpb3VzUGF0dGVybiA9ICcnO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB0b2dnbGVzOiBGaW5kVG9nZ2xlcztcblxuXHRwcml2YXRlIF9wbGFjZWhvbGRlcjogc3RyaW5nO1xuXHRwcm90ZWN0ZWQgZ2V0IHBsYWNlaG9sZGVyKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9wbGFjZWhvbGRlcjsgfVxuXHRwcm90ZWN0ZWQgc2V0IHBsYWNlaG9sZGVyKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9wbGFjZWhvbGRlciA9IHZhbHVlO1xuXHRcdHRoaXMud2lkZ2V0Py5zZXRQbGFjZUhvbGRlcih2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHdpZGdldDogRmluZFdpZGdldDxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYXR0ZXJuID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBhdHRlcm4gPSB0aGlzLl9vbkRpZENoYW5nZVBhdHRlcm4uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VPcGVuU3RhdGUgPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9wZW5TdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlT3BlblN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZW5hYmxlZERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHRyZWU6IEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgdW5rbm93bj4sXG5cdFx0cHJvdGVjdGVkIGZpbHRlcjogSUZpbmRGaWx0ZXI8VD4sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBvcHRpb25zOiBJQWJzdHJhY3RGaW5kQ29udHJvbGxlck9wdGlvbnMgPSB7fVxuXHQpIHtcblx0XHR0aGlzLnRvZ2dsZXMgPSBuZXcgRmluZFRvZ2dsZXMob3B0aW9ucy50b2dnbGVzID8/IFtdKTtcblx0XHR0aGlzLl9wbGFjZWhvbGRlciA9IG9wdGlvbnMucGxhY2Vob2xkZXIgPz8gbG9jYWxpemUoJ3R5cGUgdG8gc2VhcmNoJywgXCJUeXBlIHRvIHNlYXJjaFwiKTtcblx0fVxuXG5cdGlzT3BlbmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMud2lkZ2V0O1xuXHR9XG5cblx0b3BlbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy53aWRnZXQpIHtcblx0XHRcdHRoaXMud2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR0aGlzLndpZGdldC5zZWxlY3QoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXRDb250YWluZXIgPSB0aGlzLm9wdGlvbnMuZmluZFdpZGdldENvbnRhaW5lciA/PyB0aGlzLnRyZWUuZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5maW5kV2lkZ2V0Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IHBhZGRpbmdUb3A6IDMwIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMud2lkZ2V0ID0gbmV3IEZpbmRXaWRnZXQod2lkZ2V0Q29udGFpbmVyLCB0aGlzLnRyZWUsIHRoaXMuY29udGV4dFZpZXdQcm92aWRlciwgdGhpcy5wbGFjZWhvbGRlciwgdGhpcy50b2dnbGVzLnN0YXRlcygpLCB7IC4uLnRoaXMub3B0aW9ucywgaGlzdG9yeTogdGhpcy5faGlzdG9yeSB9KTtcblx0XHR0aGlzLmVuYWJsZWREaXNwb3NhYmxlcy5hZGQodGhpcy53aWRnZXQpO1xuXG5cdFx0dGhpcy53aWRnZXQub25EaWRDaGFuZ2VWYWx1ZSh0aGlzLm9uRGlkQ2hhbmdlVmFsdWUsIHRoaXMsIHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzKTtcblx0XHR0aGlzLndpZGdldC5vbkRpZERpc2FibGUodGhpcy5jbG9zZSwgdGhpcywgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMud2lkZ2V0Lm9uRGlkVG9nZ2xlQ2hhbmdlKHRoaXMub25EaWRUb2dnbGVDaGFuZ2UsIHRoaXMsIHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMud2lkZ2V0LmZvY3VzKCk7XG5cblx0XHR0aGlzLndpZGdldC52YWx1ZSA9IHRoaXMucHJldmlvdXNQYXR0ZXJuO1xuXHRcdHRoaXMud2lkZ2V0LnNlbGVjdCgpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcGVuU3RhdGUuZmlyZSh0cnVlKTtcblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMub3B0aW9ucy5maW5kV2lkZ2V0Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IHBhZGRpbmdUb3A6IDAgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faGlzdG9yeSA9IHRoaXMud2lkZ2V0LmdldEhpc3RvcnkoKTtcblx0XHR0aGlzLndpZGdldCA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0aGlzLnByZXZpb3VzUGF0dGVybiA9IHRoaXMucGF0dGVybjtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlVmFsdWUoJycpO1xuXHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcGVuU3RhdGUuZmlyZShmYWxzZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25EaWRDaGFuZ2VWYWx1ZShwYXR0ZXJuOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXR0ZXJuID0gcGF0dGVybjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVBhdHRlcm4uZmlyZShwYXR0ZXJuKTtcblxuXHRcdHRoaXMuZmlsdGVyLnBhdHRlcm4gPSBwYXR0ZXJuO1xuXHRcdHRoaXMuYXBwbHlQYXR0ZXJuKHBhdHRlcm4pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGFwcGx5UGF0dGVybihwYXR0ZXJuOiBzdHJpbmcpOiB2b2lkO1xuXG5cdHByb3RlY3RlZCBvbkRpZFRvZ2dsZUNoYW5nZShlOiBJVHJlZUZpbmRUb2dnbGVDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudG9nZ2xlcy5zZXQoZS5pZCwgZS5pc0NoZWNrZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZVRvZ2dsZVN0YXRlKGlkOiBzdHJpbmcsIGNoZWNrZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZXMuc2V0KGlkLCBjaGVja2VkKTtcblx0XHR0aGlzLndpZGdldD8uc2V0VG9nZ2xlU3RhdGUoaWQsIGNoZWNrZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlck1lc3NhZ2Uoc2hvd05vdEZvdW5kOiBib29sZWFuLCB3YXJuaW5nTWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChzaG93Tm90Rm91bmQpIHtcblx0XHRcdGlmICh0aGlzLnRyZWUub3B0aW9ucy5zaG93Tm90Rm91bmRNZXNzYWdlID8/IHRydWUpIHtcblx0XHRcdFx0dGhpcy53aWRnZXQ/LnNob3dNZXNzYWdlKHsgdHlwZTogTWVzc2FnZVR5cGUuV0FSTklORywgY29udGVudDogd2FybmluZ01lc3NhZ2UgPz8gbG9jYWxpemUoJ25vdCBmb3VuZCcsIFwiTm8gcmVzdWx0cyBmb3VuZC5cIikgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLndpZGdldD8uc2hvd01lc3NhZ2UoeyB0eXBlOiBNZXNzYWdlVHlwZS5XQVJOSU5HIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLndpZGdldD8uY2xlYXJNZXNzYWdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFsZXJ0UmVzdWx0cyhyZXN1bHRzOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXJlc3VsdHMpIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdyZXBsRmluZE5vUmVzdWx0cycsIFwiTm8gcmVzdWx0c1wiKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdmb3VuZFJlc3VsdHMnLCBcInswfSByZXN1bHRzXCIsIHJlc3VsdHMpKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2hpc3RvcnkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXR0ZXJuLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVuYWJsZWREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbmRDb250cm9sbGVyPFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIEFic3RyYWN0RmluZENvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGE+IHtcblxuXHRnZXQgbW9kZSgpOiBUcmVlRmluZE1vZGUgeyByZXR1cm4gdGhpcy50b2dnbGVzLmdldChEZWZhdWx0VHJlZVRvZ2dsZXMuTW9kZSkgPyBUcmVlRmluZE1vZGUuRmlsdGVyIDogVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDsgfVxuXHRzZXQgbW9kZShtb2RlOiBUcmVlRmluZE1vZGUpIHtcblx0XHRpZiAobW9kZSA9PT0gdGhpcy5tb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNGaWx0ZXJNb2RlID0gbW9kZSA9PT0gVHJlZUZpbmRNb2RlLkZpbHRlcjtcblx0XHR0aGlzLnVwZGF0ZVRvZ2dsZVN0YXRlKERlZmF1bHRUcmVlVG9nZ2xlcy5Nb2RlLCBpc0ZpbHRlck1vZGUpO1xuXHRcdHRoaXMucGxhY2Vob2xkZXIgPSBpc0ZpbHRlck1vZGUgPyBsb2NhbGl6ZSgndHlwZSB0byBmaWx0ZXInLCBcIlR5cGUgdG8gZmlsdGVyXCIpIDogbG9jYWxpemUoJ3R5cGUgdG8gc2VhcmNoJywgXCJUeXBlIHRvIHNlYXJjaFwiKTtcblxuXHRcdHRoaXMuZmlsdGVyLmZpbmRNb2RlID0gbW9kZTtcblx0XHR0aGlzLnRyZWUucmVmaWx0ZXIoKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZS5maXJlKG1vZGUpO1xuXHR9XG5cblx0Z2V0IG1hdGNoVHlwZSgpOiBUcmVlRmluZE1hdGNoVHlwZSB7IHJldHVybiB0aGlzLnRvZ2dsZXMuZ2V0KERlZmF1bHRUcmVlVG9nZ2xlcy5NYXRjaFR5cGUpID8gVHJlZUZpbmRNYXRjaFR5cGUuRnV6enkgOiBUcmVlRmluZE1hdGNoVHlwZS5Db250aWd1b3VzOyB9XG5cdHNldCBtYXRjaFR5cGUobWF0Y2hUeXBlOiBUcmVlRmluZE1hdGNoVHlwZSkge1xuXHRcdGlmIChtYXRjaFR5cGUgPT09IHRoaXMubWF0Y2hUeXBlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVUb2dnbGVTdGF0ZShEZWZhdWx0VHJlZVRvZ2dsZXMuTWF0Y2hUeXBlLCBtYXRjaFR5cGUgPT09IFRyZWVGaW5kTWF0Y2hUeXBlLkZ1enp5KTtcblxuXHRcdHRoaXMuZmlsdGVyLmZpbmRNYXRjaFR5cGUgPSBtYXRjaFR5cGU7XG5cdFx0dGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1hdGNoVHlwZS5maXJlKG1hdGNoVHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGUgPSBuZXcgRW1pdHRlcjxUcmVlRmluZE1vZGU+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZSA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1hdGNoVHlwZSA9IG5ldyBFbWl0dGVyPFRyZWVGaW5kTWF0Y2hUeXBlPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1hdGNoVHlwZSA9IHRoaXMuX29uRGlkQ2hhbmdlTWF0Y2hUeXBlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRyZWU6IEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgdW5rbm93bj4sXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGZpbHRlcjogRmluZEZpbHRlcjxUPixcblx0XHRjb250ZXh0Vmlld1Byb3ZpZGVyOiBJQ29udGV4dFZpZXdQcm92aWRlcixcblx0XHRvcHRpb25zOiBJRmluZENvbnRyb2xsZXJPcHRpb25zID0ge31cblx0KSB7XG5cdFx0Y29uc3QgZGVmYXVsdEZpbmRNb2RlID0gb3B0aW9ucy5kZWZhdWx0RmluZE1vZGUgPz8gVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDtcblx0XHRjb25zdCBkZWZhdWx0RmluZE1hdGNoVHlwZSA9IG9wdGlvbnMuZGVmYXVsdEZpbmRNYXRjaFR5cGUgPz8gVHJlZUZpbmRNYXRjaFR5cGUuRnV6enk7XG5cblx0XHRjb25zdCB0b2dnbGVDb250cmlidXRpb25zOiBJVHJlZUZpbmRUb2dnbGVDb250cmlidXRpb25bXSA9IFt7XG5cdFx0XHRpZDogRGVmYXVsdFRyZWVUb2dnbGVzLk1vZGUsXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpc3RGaWx0ZXIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpbHRlcicsIFwiRmlsdGVyXCIpLFxuXHRcdFx0aXNDaGVja2VkOiBkZWZhdWx0RmluZE1vZGUgPT09IFRyZWVGaW5kTW9kZS5GaWx0ZXIsXG5cdFx0fSwge1xuXHRcdFx0aWQ6IERlZmF1bHRUcmVlVG9nZ2xlcy5NYXRjaFR5cGUsXG5cdFx0XHRpY29uOiBDb2RpY29uLnNlYXJjaEZ1enp5LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmdXp6eVNlYXJjaCcsIFwiRnV6enkgTWF0Y2hcIiksXG5cdFx0XHRpc0NoZWNrZWQ6IGRlZmF1bHRGaW5kTWF0Y2hUeXBlID09PSBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eSxcblx0XHR9XTtcblxuXHRcdGZpbHRlci5maW5kTWF0Y2hUeXBlID0gZGVmYXVsdEZpbmRNYXRjaFR5cGU7XG5cdFx0ZmlsdGVyLmZpbmRNb2RlID0gZGVmYXVsdEZpbmRNb2RlO1xuXG5cdFx0c3VwZXIodHJlZSwgZmlsdGVyLCBjb250ZXh0Vmlld1Byb3ZpZGVyLCB7IC4uLm9wdGlvbnMsIHRvZ2dsZXM6IHRvZ2dsZUNvbnRyaWJ1dGlvbnMgfSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnRyZWUub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNPcGVuZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnBhdHRlcm4ubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5yZWZpbHRlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbldpbGxSZWZpbHRlcigoKSA9PiB0aGlzLmZpbHRlci5yZXNldCgpKSk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGU6IElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlPFQ+ID0ge30pOiB2b2lkIHtcblx0XHRpZiAob3B0aW9uc1VwZGF0ZS5kZWZhdWx0RmluZE1vZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tb2RlID0gb3B0aW9uc1VwZGF0ZS5kZWZhdWx0RmluZE1vZGU7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnNVcGRhdGUuZGVmYXVsdEZpbmRNYXRjaFR5cGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tYXRjaFR5cGUgPSBvcHRpb25zVXBkYXRlLmRlZmF1bHRGaW5kTWF0Y2hUeXBlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhcHBseVBhdHRlcm4ocGF0dGVybjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cblx0XHRpZiAocGF0dGVybikge1xuXHRcdFx0dGhpcy50cmVlLmZvY3VzTmV4dCgwLCB0cnVlLCB1bmRlZmluZWQsIChub2RlKSA9PiAhRnV6enlTY29yZS5pc0RlZmF1bHQobm9kZS5maWx0ZXJEYXRhIGFzIHVua25vd24gYXMgRnV6enlTY29yZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cblx0XHRpZiAoZm9jdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGZvY3VzWzBdO1xuXG5cdFx0XHRpZiAodGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKGVsZW1lbnQpID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5yZXZlYWwoZWxlbWVudCwgMC41KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0c2hvdWxkQWxsb3dGb2N1cyhub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmlzT3BlbmVkKCkgfHwgIXRoaXMucGF0dGVybikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZmlsdGVyLnRvdGFsQ291bnQgPiAwICYmIHRoaXMuZmlsdGVyLm1hdGNoQ291bnQgPD0gMSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICFGdXp6eVNjb3JlLmlzRGVmYXVsdChub2RlLmZpbHRlckRhdGEgYXMgdW5rbm93biBhcyBGdXp6eVNjb3JlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRpZFRvZ2dsZUNoYW5nZShlOiBJVHJlZUZpbmRUb2dnbGVDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmlkID09PSBEZWZhdWx0VHJlZVRvZ2dsZXMuTW9kZSkge1xuXHRcdFx0dGhpcy5tb2RlID0gZS5pc0NoZWNrZWQgPyBUcmVlRmluZE1vZGUuRmlsdGVyIDogVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDtcblx0XHR9IGVsc2UgaWYgKGUuaWQgPT09IERlZmF1bHRUcmVlVG9nZ2xlcy5NYXRjaFR5cGUpIHtcblx0XHRcdHRoaXMubWF0Y2hUeXBlID0gZS5pc0NoZWNrZWQgPyBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eSA6IFRyZWVGaW5kTWF0Y2hUeXBlLkNvbnRpZ3VvdXM7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBub01hdGNoZXMgPSB0aGlzLmZpbHRlci5tYXRjaENvdW50ID09PSAwICYmIHRoaXMuZmlsdGVyLnRvdGFsQ291bnQgPiAwO1xuXHRcdGNvbnN0IHNob3dOb3RGb3VuZCA9IG5vTWF0Y2hlcyAmJiB0aGlzLnBhdHRlcm4ubGVuZ3RoID4gMDtcblxuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShzaG93Tm90Rm91bmQpO1xuXG5cdFx0aWYgKHRoaXMucGF0dGVybi5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYWxlcnRSZXN1bHRzKHRoaXMuZmlsdGVyLm1hdGNoQ291bnQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+IHtcblx0cmVhZG9ubHkgbm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPjtcblx0cmVhZG9ubHkgc3RhcnRJbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBlbmRJbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgcG9zaXRpb246IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gc3RpY2t5U2Nyb2xsTm9kZVN0YXRlRXF1YWxzPFQsIFRGaWx0ZXJEYXRhPihub2RlMTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4sIG5vZGUyOiBTdGlja3lTY3JvbGxOb2RlPFQsIFRGaWx0ZXJEYXRhPikge1xuXHRyZXR1cm4gbm9kZTEucG9zaXRpb24gPT09IG5vZGUyLnBvc2l0aW9uICYmIHN0aWNreVNjcm9sbE5vZGVFcXVhbHMobm9kZTEsIG5vZGUyKTtcbn1cblxuZnVuY3Rpb24gc3RpY2t5U2Nyb2xsTm9kZUVxdWFsczxULCBURmlsdGVyRGF0YT4obm9kZTE6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+LCBub2RlMjogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4pIHtcblx0cmV0dXJuIG5vZGUxLm5vZGUuZWxlbWVudCA9PT0gbm9kZTIubm9kZS5lbGVtZW50ICYmXG5cdFx0bm9kZTEuc3RhcnRJbmRleCA9PT0gbm9kZTIuc3RhcnRJbmRleCAmJlxuXHRcdG5vZGUxLmhlaWdodCA9PT0gbm9kZTIuaGVpZ2h0ICYmXG5cdFx0bm9kZTEuZW5kSW5kZXggPT09IG5vZGUyLmVuZEluZGV4O1xufVxuXG5jbGFzcyBTdGlja3lTY3JvbGxTdGF0ZTxULCBURmlsdGVyRGF0YSwgVFJlZj4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHN0aWNreU5vZGVzOiBTdGlja3lTY3JvbGxOb2RlPFQsIFRGaWx0ZXJEYXRhPltdID0gW11cblx0KSB7IH1cblxuXHRnZXQgY291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc3RpY2t5Tm9kZXMubGVuZ3RoOyB9XG5cblx0ZXF1YWwoc3RhdGU6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlcXVhbHModGhpcy5zdGlja3lOb2Rlcywgc3RhdGUuc3RpY2t5Tm9kZXMsIHN0aWNreVNjcm9sbE5vZGVTdGF0ZUVxdWFscyk7XG5cdH1cblxuXHRjb250YWlucyhlbGVtZW50OiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RpY2t5Tm9kZXMuc29tZShub2RlID0+IG5vZGUubm9kZS5lbGVtZW50ID09PSBlbGVtZW50LmVsZW1lbnQpO1xuXHR9XG5cblx0bGFzdE5vZGVQYXJ0aWFsbHlWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdFN0aWNreU5vZGUgPSB0aGlzLnN0aWNreU5vZGVzW3RoaXMuY291bnQgLSAxXTtcblx0XHRpZiAodGhpcy5jb3VudCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGxhc3RTdGlja3lOb2RlLnBvc2l0aW9uICE9PSAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlY29uZExhc3RTdGlja3lOb2RlID0gdGhpcy5zdGlja3lOb2Rlc1t0aGlzLmNvdW50IC0gMl07XG5cdFx0cmV0dXJuIHNlY29uZExhc3RTdGlja3lOb2RlLnBvc2l0aW9uICsgc2Vjb25kTGFzdFN0aWNreU5vZGUuaGVpZ2h0ICE9PSBsYXN0U3RpY2t5Tm9kZS5wb3NpdGlvbjtcblx0fVxuXG5cdGFuaW1hdGlvblN0YXRlQ2hhbmdlZChwcmV2aW91c1N0YXRlOiBTdGlja3lTY3JvbGxTdGF0ZTxULCBURmlsdGVyRGF0YSwgVFJlZj4pOiBib29sZWFuIHtcblx0XHRpZiAoIWVxdWFscyh0aGlzLnN0aWNreU5vZGVzLCBwcmV2aW91c1N0YXRlLnN0aWNreU5vZGVzLCBzdGlja3lTY3JvbGxOb2RlRXF1YWxzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdFN0aWNreU5vZGUgPSB0aGlzLnN0aWNreU5vZGVzW3RoaXMuY291bnQgLSAxXTtcblx0XHRjb25zdCBwcmV2aW91c0xhc3RTdGlja3lOb2RlID0gcHJldmlvdXNTdGF0ZS5zdGlja3lOb2Rlc1twcmV2aW91c1N0YXRlLmNvdW50IC0gMV07XG5cblx0XHRyZXR1cm4gbGFzdFN0aWNreU5vZGUucG9zaXRpb24gIT09IHByZXZpb3VzTGFzdFN0aWNreU5vZGUucG9zaXRpb247XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RpY2t5U2Nyb2xsRGVsZWdhdGU8VCwgVEZpbHRlckRhdGE+IHtcblx0Y29uc3RyYWluU3RpY2t5U2Nyb2xsTm9kZXMoc3RpY2t5Tm9kZXM6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+W10sIHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudDogbnVtYmVyLCBtYXhXaWRnZXRIZWlnaHQ6IG51bWJlcik6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+W107XG59XG5cbmNsYXNzIERlZmF1bHRTdGlja3lTY3JvbGxEZWxlZ2F0ZTxULCBURmlsdGVyRGF0YT4gaW1wbGVtZW50cyBJU3RpY2t5U2Nyb2xsRGVsZWdhdGU8VCwgVEZpbHRlckRhdGE+IHtcblxuXHRjb25zdHJhaW5TdGlja3lTY3JvbGxOb2RlcyhzdGlja3lOb2RlczogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT5bXSwgc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50OiBudW1iZXIsIG1heFdpZGdldEhlaWdodDogbnVtYmVyKTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT5bXSB7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0aWNreU5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzdGlja3lOb2RlID0gc3RpY2t5Tm9kZXNbaV07XG5cdFx0XHRjb25zdCBzdGlja3lOb2RlQm90dG9tID0gc3RpY2t5Tm9kZS5wb3NpdGlvbiArIHN0aWNreU5vZGUuaGVpZ2h0O1xuXHRcdFx0aWYgKHN0aWNreU5vZGVCb3R0b20gPiBtYXhXaWRnZXRIZWlnaHQgfHwgaSA+PSBzdGlja3lTY3JvbGxNYXhJdGVtQ291bnQpIHtcblx0XHRcdFx0cmV0dXJuIHN0aWNreU5vZGVzLnNsaWNlKDAsIGkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzdGlja3lOb2Rlcztcblx0fVxufVxuXG5jbGFzcyBTdGlja3lTY3JvbGxDb250cm9sbGVyPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGFzRm9jdXM6IEV2ZW50PGJvb2xlYW4+O1xuXHRyZWFkb25seSBvbkNvbnRleHRNZW51OiBFdmVudDxJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RpY2t5U2Nyb2xsRGVsZWdhdGU6IElTdGlja3lTY3JvbGxEZWxlZ2F0ZTxULCBURmlsdGVyRGF0YT47XG5cblx0cHJpdmF0ZSBzdGlja3lTY3JvbGxNYXhJdGVtQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBtYXhXaWRnZXRWaWV3UmF0aW8gPSAwLjQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0OiBTdGlja3lTY3JvbGxXaWRnZXQ8VCwgVEZpbHRlckRhdGEsIFRSZWY+O1xuXG5cdHByaXZhdGUgcGFkZGluZ1RvcDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdHJlZTogQWJzdHJhY3RUcmVlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBJVHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXc6IExpc3Q8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4sXG5cdFx0cmVuZGVyZXJzOiBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIHVua25vd24+W10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0cmVlRGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+LFxuXHRcdG9wdGlvbnM6IElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiA9IHt9LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsT3B0aW9ucyA9IHRoaXMudmFsaWRhdGVTdGlja3lTZXR0aW5ncyhvcHRpb25zKTtcblx0XHR0aGlzLnN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9IHN0aWNreVNjcm9sbE9wdGlvbnMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50O1xuXG5cdFx0dGhpcy5zdGlja3lTY3JvbGxEZWxlZ2F0ZSA9IG9wdGlvbnMuc3RpY2t5U2Nyb2xsRGVsZWdhdGUgPz8gbmV3IERlZmF1bHRTdGlja3lTY3JvbGxEZWxlZ2F0ZSgpO1xuXHRcdHRoaXMucGFkZGluZ1RvcCA9IG9wdGlvbnMucGFkZGluZ1RvcCA/PyAwO1xuXG5cdFx0dGhpcy5fd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFN0aWNreVNjcm9sbFdpZGdldCh2aWV3LmdldFNjcm9sbGFibGVFbGVtZW50KCksIHZpZXcsIHRyZWUsIHJlbmRlcmVycywgdHJlZURlbGVnYXRlLCBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcikpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VIYXNGb2N1cyA9IHRoaXMuX3dpZGdldC5vbkRpZENoYW5nZUhhc0ZvY3VzO1xuXHRcdHRoaXMub25Db250ZXh0TWVudSA9IHRoaXMuX3dpZGdldC5vbkNvbnRleHRNZW51O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlldy5vbkRpZFNjcm9sbCgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlldy5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMoKGUpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fd2lkZ2V0LnN0YXRlO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGEgc3RpY2t5IG5vZGUgaXMgcmVtb3ZlZCwgcmVjb21wdXRlIHRoZSBzdGF0ZVxuXHRcdFx0Y29uc3QgaGFzUmVtb3ZlZFN0aWNreU5vZGUgPSBlLmRlbGV0ZUNvdW50ID4gMCAmJiBzdGF0ZS5zdGlja3lOb2Rlcy5zb21lKHN0aWNreU5vZGUgPT4gIXRoaXMubW9kZWwuaGFzKHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKHN0aWNreU5vZGUubm9kZSkpKTtcblx0XHRcdGlmIChoYXNSZW1vdmVkU3RpY2t5Tm9kZSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGEgc3RpY2t5IG5vZGUgaXMgdXBkYXRlZCwgcmVyZW5kZXIgdGhlIHdpZGdldFxuXHRcdFx0Y29uc3Qgc2hvdWxkUmVyZW5kZXJTdGlja3lOb2RlcyA9IHN0YXRlLnN0aWNreU5vZGVzLnNvbWUoc3RpY2t5Tm9kZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpc3RJbmRleCA9IHRoaXMubW9kZWwuZ2V0TGlzdEluZGV4KHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKHN0aWNreU5vZGUubm9kZSkpO1xuXHRcdFx0XHRyZXR1cm4gbGlzdEluZGV4ID49IGUuc3RhcnQgJiYgbGlzdEluZGV4IDwgZS5zdGFydCArIGUuZGVsZXRlQ291bnQgJiYgc3RhdGUuY29udGFpbnMoc3RpY2t5Tm9kZS5ub2RlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoc2hvdWxkUmVyZW5kZXJTdGlja3lOb2Rlcykge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQucmVyZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuaGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5jb3VudDtcblx0fVxuXG5cdGdldE5vZGUobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LmdldE5vZGUobm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE5vZGVBdEhlaWdodChoZWlnaHQ6IG51bWJlcik6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRcdGxldCBpbmRleDtcblx0XHRpZiAoaGVpZ2h0ID09PSAwKSB7XG5cdFx0XHRpbmRleCA9IHRoaXMudmlldy5maXJzdFZpc2libGVJbmRleDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5kZXggPSB0aGlzLnZpZXcuaW5kZXhBdChoZWlnaHQgKyB0aGlzLnZpZXcuc2Nyb2xsVG9wKTtcblx0XHR9XG5cblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMudmlldy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudmlldy5lbGVtZW50KGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCkge1xuXHRcdGNvbnN0IGZpcnN0VmlzaWJsZU5vZGUgPSB0aGlzLmdldE5vZGVBdEhlaWdodCh0aGlzLnBhZGRpbmdUb3ApO1xuXG5cdFx0Ly8gRG9uJ3QgcmVuZGVyIGFueXRoaW5nIGlmIHRoZXJlIGFyZSBubyBlbGVtZW50c1xuXHRcdGlmICghZmlyc3RWaXNpYmxlTm9kZSB8fCB0aGlzLnRyZWUuc2Nyb2xsVG9wIDw9IHRoaXMucGFkZGluZ1RvcCB8fCB0aGlzLnZpZXcucmVuZGVySGVpZ2h0ID09PSAwKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0U3RhdGUodW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGlja3lTdGF0ZSA9IHRoaXMuZmluZFN0aWNreVN0YXRlKGZpcnN0VmlzaWJsZU5vZGUpO1xuXHRcdHRoaXMuX3dpZGdldC5zZXRTdGF0ZShzdGlja3lTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRTdGlja3lTdGF0ZShmaXJzdFZpc2libGVOb2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogU3RpY2t5U2Nyb2xsU3RhdGU8VCwgVEZpbHRlckRhdGEsIFRSZWY+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdGlja3lOb2RlczogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT5bXSA9IFtdO1xuXHRcdGxldCBmaXJzdFZpc2libGVOb2RlVW5kZXJXaWRnZXQ6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQgPSBmaXJzdFZpc2libGVOb2RlO1xuXHRcdGxldCBzdGlja3lOb2Rlc0hlaWdodCA9IDA7XG5cblx0XHRsZXQgbmV4dFN0aWNreU5vZGUgPSB0aGlzLmdldE5leHRTdGlja3lOb2RlKGZpcnN0VmlzaWJsZU5vZGVVbmRlcldpZGdldCwgdW5kZWZpbmVkLCBzdGlja3lOb2Rlc0hlaWdodCk7XG5cdFx0d2hpbGUgKG5leHRTdGlja3lOb2RlKSB7XG5cblx0XHRcdHN0aWNreU5vZGVzLnB1c2gobmV4dFN0aWNreU5vZGUpO1xuXHRcdFx0c3RpY2t5Tm9kZXNIZWlnaHQgKz0gbmV4dFN0aWNreU5vZGUuaGVpZ2h0O1xuXG5cdFx0XHRpZiAoc3RpY2t5Tm9kZXMubGVuZ3RoIDw9IHRoaXMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50KSB7XG5cdFx0XHRcdGZpcnN0VmlzaWJsZU5vZGVVbmRlcldpZGdldCA9IHRoaXMuZ2V0TmV4dFZpc2libGVOb2RlKG5leHRTdGlja3lOb2RlKTtcblx0XHRcdFx0aWYgKCFmaXJzdFZpc2libGVOb2RlVW5kZXJXaWRnZXQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRuZXh0U3RpY2t5Tm9kZSA9IHRoaXMuZ2V0TmV4dFN0aWNreU5vZGUoZmlyc3RWaXNpYmxlTm9kZVVuZGVyV2lkZ2V0LCBuZXh0U3RpY2t5Tm9kZS5ub2RlLCBzdGlja3lOb2Rlc0hlaWdodCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJhaW5lZFN0aWNreU5vZGVzID0gdGhpcy5jb25zdHJhaW5TdGlja3lOb2RlcyhzdGlja3lOb2Rlcyk7XG5cdFx0cmV0dXJuIGNvbnRyYWluZWRTdGlja3lOb2Rlcy5sZW5ndGggPyBuZXcgU3RpY2t5U2Nyb2xsU3RhdGUoY29udHJhaW5lZFN0aWNreU5vZGVzKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TmV4dFZpc2libGVOb2RlKHByZXZpb3VzU3RpY2t5Tm9kZTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4pOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXROb2RlQXRIZWlnaHQocHJldmlvdXNTdGlja3lOb2RlLnBvc2l0aW9uICsgcHJldmlvdXNTdGlja3lOb2RlLmhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE5leHRTdGlja3lOb2RlKGZpcnN0VmlzaWJsZU5vZGVVbmRlcldpZGdldDogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgcHJldmlvdXNTdGlja3lOb2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkLCBzdGlja3lOb2Rlc0hlaWdodDogbnVtYmVyKTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5leHRTdGlja3lOb2RlID0gdGhpcy5nZXRBbmNlc3RvclVuZGVyUHJldmlvdXMoZmlyc3RWaXNpYmxlTm9kZVVuZGVyV2lkZ2V0LCBwcmV2aW91c1N0aWNreU5vZGUpO1xuXHRcdGlmICghbmV4dFN0aWNreU5vZGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKG5leHRTdGlja3lOb2RlID09PSBmaXJzdFZpc2libGVOb2RlVW5kZXJXaWRnZXQpIHtcblx0XHRcdGlmICghdGhpcy5ub2RlSXNVbmNvbGxhcHNlZFBhcmVudChmaXJzdFZpc2libGVOb2RlVW5kZXJXaWRnZXQpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLm5vZGVUb3BBbGlnbnNXaXRoU3RpY2t5Tm9kZXNCb3R0b20oZmlyc3RWaXNpYmxlTm9kZVVuZGVyV2lkZ2V0LCBzdGlja3lOb2Rlc0hlaWdodCkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVTdGlja3lTY3JvbGxOb2RlKG5leHRTdGlja3lOb2RlLCBzdGlja3lOb2Rlc0hlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIG5vZGVUb3BBbGlnbnNXaXRoU3RpY2t5Tm9kZXNCb3R0b20obm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgc3RpY2t5Tm9kZXNIZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5vZGVJbmRleCA9IHRoaXMuZ2V0Tm9kZUluZGV4KG5vZGUpO1xuXHRcdGNvbnN0IGVsZW1lbnRUb3AgPSB0aGlzLnZpZXcuZ2V0RWxlbWVudFRvcChub2RlSW5kZXgpO1xuXHRcdGNvbnN0IHN0aWNreVBvc2l0aW9uID0gc3RpY2t5Tm9kZXNIZWlnaHQ7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zY3JvbGxUb3AgPT09IGVsZW1lbnRUb3AgLSBzdGlja3lQb3NpdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU3RpY2t5U2Nyb2xsTm9kZShub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBjdXJyZW50U3RpY2t5Tm9kZXNIZWlnaHQ6IG51bWJlcik6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+IHtcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLnRyZWVEZWxlZ2F0ZS5nZXRIZWlnaHQobm9kZSk7XG5cdFx0Y29uc3QgeyBzdGFydEluZGV4LCBlbmRJbmRleCB9ID0gdGhpcy5nZXROb2RlUmFuZ2Uobm9kZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuY2FsY3VsYXRlU3RpY2t5Tm9kZVBvc2l0aW9uKGVuZEluZGV4LCBjdXJyZW50U3RpY2t5Tm9kZXNIZWlnaHQsIGhlaWdodCk7XG5cblx0XHRyZXR1cm4geyBub2RlLCBwb3NpdGlvbiwgaGVpZ2h0LCBzdGFydEluZGV4LCBlbmRJbmRleCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBbmNlc3RvclVuZGVyUHJldmlvdXMobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgcHJldmlvdXNBbmNlc3RvcjogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRcdGxldCBjdXJyZW50QW5jZXN0b3I6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gPSBub2RlO1xuXHRcdGxldCBwYXJlbnRPZmN1cnJlbnRBbmNlc3RvcjogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCA9IHRoaXMuZ2V0UGFyZW50Tm9kZShjdXJyZW50QW5jZXN0b3IpO1xuXG5cdFx0d2hpbGUgKHBhcmVudE9mY3VycmVudEFuY2VzdG9yKSB7XG5cdFx0XHRpZiAocGFyZW50T2ZjdXJyZW50QW5jZXN0b3IgPT09IHByZXZpb3VzQW5jZXN0b3IpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRBbmNlc3Rvcjtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRBbmNlc3RvciA9IHBhcmVudE9mY3VycmVudEFuY2VzdG9yO1xuXHRcdFx0cGFyZW50T2ZjdXJyZW50QW5jZXN0b3IgPSB0aGlzLmdldFBhcmVudE5vZGUoY3VycmVudEFuY2VzdG9yKTtcblx0XHR9XG5cblx0XHRpZiAocHJldmlvdXNBbmNlc3RvciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudEFuY2VzdG9yO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNhbGN1bGF0ZVN0aWNreU5vZGVQb3NpdGlvbihsYXN0RGVzY2VuZGFudEluZGV4OiBudW1iZXIsIHN0aWNreVJvd1Bvc2l0aW9uVG9wOiBudW1iZXIsIHN0aWNreU5vZGVIZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGxhc3RDaGlsZFJlbGF0aXZlVG9wID0gdGhpcy52aWV3LmdldFJlbGF0aXZlVG9wKGxhc3REZXNjZW5kYW50SW5kZXgpO1xuXG5cdFx0Ly8gSWYgdGhlIGxhc3QgZGVzY2VuZGFudCBpcyBvbmx5IHBhcnRpYWxseSB2aXNpYmxlIGF0IHRoZSB0b3Agb2YgdGhlIHZpZXcsIGdldFJlbGF0aXZlVG9wKCkgcmV0dXJucyBudWxsXG5cdFx0Ly8gSW4gdGhhdCBjYXNlLCB1dGlsaXplIHRoZSBuZXh0IG5vZGUncyByZWxhdGl2ZSB0b3AgdG8gY2FsY3VsYXRlIHRoZSBzdGlja3kgbm9kZSdzIHBvc2l0aW9uXG5cdFx0aWYgKGxhc3RDaGlsZFJlbGF0aXZlVG9wID09PSBudWxsICYmIHRoaXMudmlldy5maXJzdFZpc2libGVJbmRleCA9PT0gbGFzdERlc2NlbmRhbnRJbmRleCAmJiBsYXN0RGVzY2VuZGFudEluZGV4ICsgMSA8IHRoaXMudmlldy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5vZGVIZWlnaHQgPSB0aGlzLnRyZWVEZWxlZ2F0ZS5nZXRIZWlnaHQodGhpcy52aWV3LmVsZW1lbnQobGFzdERlc2NlbmRhbnRJbmRleCkpO1xuXHRcdFx0Y29uc3QgbmV4dE5vZGVSZWxhdGl2ZVRvcCA9IHRoaXMudmlldy5nZXRSZWxhdGl2ZVRvcChsYXN0RGVzY2VuZGFudEluZGV4ICsgMSk7XG5cdFx0XHRsYXN0Q2hpbGRSZWxhdGl2ZVRvcCA9IG5leHROb2RlUmVsYXRpdmVUb3AgPyBuZXh0Tm9kZVJlbGF0aXZlVG9wIC0gbm9kZUhlaWdodCAvIHRoaXMudmlldy5yZW5kZXJIZWlnaHQgOiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0Q2hpbGRSZWxhdGl2ZVRvcCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHN0aWNreVJvd1Bvc2l0aW9uVG9wO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RDaGlsZE5vZGUgPSB0aGlzLnZpZXcuZWxlbWVudChsYXN0RGVzY2VuZGFudEluZGV4KTtcblx0XHRjb25zdCBsYXN0Q2hpbGRIZWlnaHQgPSB0aGlzLnRyZWVEZWxlZ2F0ZS5nZXRIZWlnaHQobGFzdENoaWxkTm9kZSk7XG5cdFx0Y29uc3QgdG9wT2ZMYXN0Q2hpbGQgPSBsYXN0Q2hpbGRSZWxhdGl2ZVRvcCAqIHRoaXMudmlldy5yZW5kZXJIZWlnaHQ7XG5cdFx0Y29uc3QgYm90dG9tT2ZMYXN0Q2hpbGQgPSB0b3BPZkxhc3RDaGlsZCArIGxhc3RDaGlsZEhlaWdodDtcblxuXHRcdGlmIChzdGlja3lSb3dQb3NpdGlvblRvcCArIHN0aWNreU5vZGVIZWlnaHQgPiBib3R0b21PZkxhc3RDaGlsZCAmJiBzdGlja3lSb3dQb3NpdGlvblRvcCA8PSBib3R0b21PZkxhc3RDaGlsZCkge1xuXHRcdFx0cmV0dXJuIGJvdHRvbU9mTGFzdENoaWxkIC0gc3RpY2t5Tm9kZUhlaWdodDtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RpY2t5Um93UG9zaXRpb25Ub3A7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cmFpblN0aWNreU5vZGVzKHN0aWNreU5vZGVzOiBTdGlja3lTY3JvbGxOb2RlPFQsIFRGaWx0ZXJEYXRhPltdKTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT5bXSB7XG5cdFx0aWYgKHN0aWNreU5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHN0aWNreSBub2RlcyBuZWVkIHRvIGJlIGNvbnN0cmFpbmVkXG5cdFx0Y29uc3QgbWF4aW11bVN0aWNreVdpZGdldEhlaWdodCA9IHRoaXMudmlldy5yZW5kZXJIZWlnaHQgKiB0aGlzLm1heFdpZGdldFZpZXdSYXRpbztcblx0XHRjb25zdCBsYXN0U3RpY2t5Tm9kZSA9IHN0aWNreU5vZGVzW3N0aWNreU5vZGVzLmxlbmd0aCAtIDFdO1xuXHRcdGlmIChzdGlja3lOb2Rlcy5sZW5ndGggPD0gdGhpcy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQgJiYgbGFzdFN0aWNreU5vZGUucG9zaXRpb24gKyBsYXN0U3RpY2t5Tm9kZS5oZWlnaHQgPD0gbWF4aW11bVN0aWNreVdpZGdldEhlaWdodCkge1xuXHRcdFx0cmV0dXJuIHN0aWNreU5vZGVzO1xuXHRcdH1cblxuXHRcdC8vIGNvbnN0cmFpbiBzdGlja3kgbm9kZXNcblx0XHRjb25zdCBjb25zdHJhaW5lZFN0aWNreU5vZGVzID0gdGhpcy5zdGlja3lTY3JvbGxEZWxlZ2F0ZS5jb25zdHJhaW5TdGlja3lTY3JvbGxOb2RlcyhzdGlja3lOb2RlcywgdGhpcy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQsIG1heGltdW1TdGlja3lXaWRnZXRIZWlnaHQpO1xuXG5cdFx0aWYgKCFjb25zdHJhaW5lZFN0aWNreU5vZGVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIGNvbnN0cmFpbnRzXG5cdFx0Y29uc3QgbGFzdENvbnN0cmFpbmVkU3RpY2t5Tm9kZSA9IGNvbnN0cmFpbmVkU3RpY2t5Tm9kZXNbY29uc3RyYWluZWRTdGlja3lOb2Rlcy5sZW5ndGggLSAxXTtcblx0XHRpZiAoY29uc3RyYWluZWRTdGlja3lOb2Rlcy5sZW5ndGggPiB0aGlzLnN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCB8fCBsYXN0Q29uc3RyYWluZWRTdGlja3lOb2RlLnBvc2l0aW9uICsgbGFzdENvbnN0cmFpbmVkU3RpY2t5Tm9kZS5oZWlnaHQgPiBtYXhpbXVtU3RpY2t5V2lkZ2V0SGVpZ2h0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3N0aWNreVNjcm9sbERlbGVnYXRlIHZpb2xhdGVzIGNvbnN0cmFpbnRzJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnN0cmFpbmVkU3RpY2t5Tm9kZXM7XG5cdH1cblxuXHRwcml2YXRlIGdldFBhcmVudE5vZGUobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5vZGVMb2NhdGlvbiA9IHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdGNvbnN0IHBhcmVudExvY2F0aW9uID0gdGhpcy5tb2RlbC5nZXRQYXJlbnROb2RlTG9jYXRpb24obm9kZUxvY2F0aW9uKTtcblx0XHRyZXR1cm4gcGFyZW50TG9jYXRpb24gPyB0aGlzLm1vZGVsLmdldE5vZGUocGFyZW50TG9jYXRpb24pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBub2RlSXNVbmNvbGxhcHNlZFBhcmVudChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgbm9kZUxvY2F0aW9uID0gdGhpcy5tb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGlzdFJlbmRlckNvdW50KG5vZGVMb2NhdGlvbikgPiAxO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROb2RlSW5kZXgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IG51bWJlciB7XG5cdFx0Y29uc3Qgbm9kZUxvY2F0aW9uID0gdGhpcy5tb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdFx0Y29uc3Qgbm9kZUluZGV4ID0gdGhpcy5tb2RlbC5nZXRMaXN0SW5kZXgobm9kZUxvY2F0aW9uKTtcblx0XHRyZXR1cm4gbm9kZUluZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROb2RlUmFuZ2Uobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IHsgc3RhcnRJbmRleDogbnVtYmVyOyBlbmRJbmRleDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IG5vZGVMb2NhdGlvbiA9IHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChub2RlTG9jYXRpb24pO1xuXG5cdFx0aWYgKHN0YXJ0SW5kZXggPCAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vZGUgbm90IGZvdW5kIGluIHRyZWUnKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kZXJDb3VudCA9IHRoaXMubW9kZWwuZ2V0TGlzdFJlbmRlckNvdW50KG5vZGVMb2NhdGlvbik7XG5cdFx0Y29uc3QgZW5kSW5kZXggPSBzdGFydEluZGV4ICsgcmVuZGVyQ291bnQgLSAxO1xuXG5cdFx0cmV0dXJuIHsgc3RhcnRJbmRleCwgZW5kSW5kZXggfTtcblx0fVxuXG5cdG5vZGVQb3NpdGlvblRvcEJlbG93V2lkZ2V0KG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBudW1iZXIge1xuXHRcdGNvbnN0IGFuY2VzdG9ycyA9IFtdO1xuXHRcdGxldCBjdXJyZW50QW5jZXN0b3IgPSB0aGlzLmdldFBhcmVudE5vZGUobm9kZSk7XG5cdFx0d2hpbGUgKGN1cnJlbnRBbmNlc3Rvcikge1xuXHRcdFx0YW5jZXN0b3JzLnB1c2goY3VycmVudEFuY2VzdG9yKTtcblx0XHRcdGN1cnJlbnRBbmNlc3RvciA9IHRoaXMuZ2V0UGFyZW50Tm9kZShjdXJyZW50QW5jZXN0b3IpO1xuXHRcdH1cblxuXHRcdGxldCB3aWRnZXRIZWlnaHQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYW5jZXN0b3JzLmxlbmd0aCAmJiBpIDwgdGhpcy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQ7IGkrKykge1xuXHRcdFx0d2lkZ2V0SGVpZ2h0ICs9IHRoaXMudHJlZURlbGVnYXRlLmdldEhlaWdodChhbmNlc3RvcnNbaV0pO1xuXHRcdH1cblx0XHRyZXR1cm4gd2lkZ2V0SGVpZ2h0O1xuXHR9XG5cblx0Z2V0Rm9jdXMoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5nZXRGb2N1cygpO1xuXHR9XG5cblx0ZG9tRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmRvbUZvY3VzKCk7XG5cdH1cblxuXHQvLyBXaGV0aGVyIHN0aWNreSBzY3JvbGwgd2FzIHRoZSBsYXN0IGZvY3VzZWQgcGFydCBpbiB0aGUgdHJlZSBvciBub3Rcblx0Zm9jdXNlZExhc3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5mb2N1c2VkTGFzdCgpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zVXBkYXRlOiBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiA9IHt9KTogdm9pZCB7XG5cdFx0aWYgKG9wdGlvbnNVcGRhdGUucGFkZGluZ1RvcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnBhZGRpbmdUb3AgPSBvcHRpb25zVXBkYXRlLnBhZGRpbmdUb3A7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnNVcGRhdGUuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHZhbGlkYXRlZE9wdGlvbnMgPSB0aGlzLnZhbGlkYXRlU3RpY2t5U2V0dGluZ3Mob3B0aW9uc1VwZGF0ZSk7XG5cdFx0XHRpZiAodGhpcy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQgIT09IHZhbGlkYXRlZE9wdGlvbnMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50KSB7XG5cdFx0XHRcdHRoaXMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50ID0gdmFsaWRhdGVkT3B0aW9ucy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQ7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dmFsaWRhdGVTdGlja3lTZXR0aW5ncyhvcHRpb25zOiBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPik6IHsgc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50OiBudW1iZXIgfSB7XG5cdFx0bGV0IHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9IDc7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLnN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9IE1hdGgubWF4KG9wdGlvbnMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50LCAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50IH07XG5cdH1cbn1cblxuY2xhc3MgU3RpY2t5U2Nyb2xsV2lkZ2V0PFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290RG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3ByZXZpb3VzU3RhdGU6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJldmlvdXNFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aW91c1N0YXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Z2V0IHN0YXRlKCk6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcmV2aW91c1N0YXRlOyB9XG5cblx0cHJpdmF0ZSBzdGlja3lTY3JvbGxGb2N1czogU3RpY2t5U2Nyb2xsRm9jdXM8VCwgVEZpbHRlckRhdGEsIFRSZWY+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhhc0ZvY3VzOiBFdmVudDxib29sZWFuPjtcblx0cmVhZG9ubHkgb25Db250ZXh0TWVudTogRXZlbnQ8SVRyZWVDb250ZXh0TWVudUV2ZW50PFQ+PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlldzogTGlzdDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRyZWU6IEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgVFJlZj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0cmVlUmVuZGVyZXJzOiBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIHVua25vd24+W10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0cmVlRGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUPiB8IHVuZGVmaW5lZCxcblx0KSB7XG5cblx0XHR0aGlzLl9yb290RG9tTm9kZSA9ICQoJy5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyLmVtcHR5Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3Jvb3REb21Ob2RlKTtcblxuXHRcdGNvbnN0IHNoYWRvdyA9ICQoJy5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyLXNoYWRvdycpO1xuXHRcdHRoaXMuX3Jvb3REb21Ob2RlLmFwcGVuZENoaWxkKHNoYWRvdyk7XG5cblx0XHR0aGlzLnN0aWNreVNjcm9sbEZvY3VzID0gbmV3IFN0aWNreVNjcm9sbEZvY3VzKHRoaXMuX3Jvb3REb21Ob2RlLCB2aWV3KTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlSGFzRm9jdXMgPSB0aGlzLnN0aWNreVNjcm9sbEZvY3VzLm9uRGlkQ2hhbmdlSGFzRm9jdXM7XG5cdFx0dGhpcy5vbkNvbnRleHRNZW51ID0gdGhpcy5zdGlja3lTY3JvbGxGb2N1cy5vbkNvbnRleHRNZW51O1xuXHR9XG5cblx0Z2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fcHJldmlvdXNTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RFbGVtZW50ID0gdGhpcy5fcHJldmlvdXNTdGF0ZS5zdGlja3lOb2Rlc1t0aGlzLl9wcmV2aW91c1N0YXRlLmNvdW50IC0gMV07XG5cdFx0cmV0dXJuIGxhc3RFbGVtZW50LnBvc2l0aW9uICsgbGFzdEVsZW1lbnQuaGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpb3VzU3RhdGU/LmNvdW50ID8/IDA7XG5cdH1cblxuXHRnZXROb2RlKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBTdGlja3lTY3JvbGxOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpb3VzU3RhdGU/LnN0aWNreU5vZGVzLmZpbmQoc3RpY2t5Tm9kZSA9PiBzdGlja3lOb2RlLm5vZGUgPT09IG5vZGUpO1xuXHR9XG5cblx0c2V0U3RhdGUoc3RhdGU6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXG5cdFx0Y29uc3Qgd2FzVmlzaWJsZSA9ICEhdGhpcy5fcHJldmlvdXNTdGF0ZSAmJiB0aGlzLl9wcmV2aW91c1N0YXRlLmNvdW50ID4gMDtcblx0XHRjb25zdCBpc1Zpc2libGUgPSAhIXN0YXRlICYmIHN0YXRlLmNvdW50ID4gMDtcblxuXHRcdC8vIElmIHN0YXRlIGhhcyBub3QgY2hhbmdlZCwgZG8gbm90aGluZ1xuXHRcdGlmICgoIXdhc1Zpc2libGUgJiYgIWlzVmlzaWJsZSkgfHwgKHdhc1Zpc2libGUgJiYgaXNWaXNpYmxlICYmIHRoaXMuX3ByZXZpb3VzU3RhdGUhLmVxdWFsKHN0YXRlKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdmlzaWJpbGl0eSBvZiB0aGUgd2lkZ2V0IGlmIGNoYW5nZWRcblx0XHRpZiAod2FzVmlzaWJsZSAhPT0gaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLnNldFZpc2libGUoaXNWaXNpYmxlKTtcblx0XHR9XG5cblx0XHRpZiAoIWlzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fcHJldmlvdXNTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3ByZXZpb3VzRWxlbWVudHMgPSBbXTtcblx0XHRcdHRoaXMuX3ByZXZpb3VzU3RhdGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RTdGlja3lOb2RlID0gc3RhdGUuc3RpY2t5Tm9kZXNbc3RhdGUuY291bnQgLSAxXTtcblxuXHRcdC8vIElmIHRoZSBuZXcgc3RhdGUgaXMgb25seSBhIGNoYW5nZSBpbiB0aGUgbGFzdCBub2RlJ3MgcG9zaXRpb24sIHVwZGF0ZSB0aGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgZWxlbWVudFxuXHRcdGlmICh0aGlzLl9wcmV2aW91c1N0YXRlICYmIHN0YXRlLmFuaW1hdGlvblN0YXRlQ2hhbmdlZCh0aGlzLl9wcmV2aW91c1N0YXRlKSkge1xuXHRcdFx0dGhpcy5fcHJldmlvdXNFbGVtZW50c1t0aGlzLl9wcmV2aW91c1N0YXRlLmNvdW50IC0gMV0uc3R5bGUudG9wID0gYCR7bGFzdFN0aWNreU5vZGUucG9zaXRpb259cHhgO1xuXHRcdH1cblx0XHQvLyBjcmVhdGUgbmV3IGRvbSBlbGVtZW50c1xuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJTdGF0ZShzdGF0ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJldmlvdXNTdGF0ZSA9IHN0YXRlO1xuXG5cdFx0Ly8gU2V0IHRoZSBoZWlnaHQgb2YgdGhlIHdpZGdldCB0byB0aGUgYm90dG9tIG9mIHRoZSBsYXN0IHN0aWNreSBub2RlXG5cdFx0dGhpcy5fcm9vdERvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7bGFzdFN0aWNreU5vZGUucG9zaXRpb24gKyBsYXN0U3RpY2t5Tm9kZS5oZWlnaHR9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTdGF0ZShzdGF0ZTogU3RpY2t5U2Nyb2xsU3RhdGU8VCwgVEZpbHRlckRhdGEsIFRSZWY+KTogdm9pZCB7XG5cdFx0dGhpcy5fcHJldmlvdXNTdGF0ZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBlbGVtZW50cyA9IEFycmF5KHN0YXRlLmNvdW50KTtcblx0XHRmb3IgKGxldCBzdGlja3lJbmRleCA9IHN0YXRlLmNvdW50IC0gMTsgc3RpY2t5SW5kZXggPj0gMDsgc3RpY2t5SW5kZXgtLSkge1xuXHRcdFx0Y29uc3Qgc3RpY2t5Tm9kZSA9IHN0YXRlLnN0aWNreU5vZGVzW3N0aWNreUluZGV4XTtcblxuXHRcdFx0Y29uc3QgeyBlbGVtZW50LCBkaXNwb3NhYmxlIH0gPSB0aGlzLmNyZWF0ZUVsZW1lbnQoc3RpY2t5Tm9kZSwgc3RpY2t5SW5kZXgsIHN0YXRlLmNvdW50KTtcblx0XHRcdGVsZW1lbnRzW3N0aWNreUluZGV4XSA9IGVsZW1lbnQ7XG5cblx0XHRcdHRoaXMuX3Jvb3REb21Ob2RlLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fcHJldmlvdXNTdGF0ZURpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0aWNreVNjcm9sbEZvY3VzLnVwZGF0ZUVsZW1lbnRzKGVsZW1lbnRzLCBzdGF0ZSk7XG5cblx0XHR0aGlzLl9wcmV2aW91c0VsZW1lbnRzID0gZWxlbWVudHM7XG5cdH1cblxuXHRyZXJlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHJldmlvdXNTdGF0ZSkge1xuXHRcdFx0dGhpcy5yZW5kZXJTdGF0ZSh0aGlzLl9wcmV2aW91c1N0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVsZW1lbnQoc3RpY2t5Tm9kZTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4sIHN0aWNreUluZGV4OiBudW1iZXIsIHN0aWNreU5vZGVzVG90YWw6IG51bWJlcik6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0ge1xuXG5cdFx0Y29uc3Qgbm9kZUluZGV4ID0gc3RpY2t5Tm9kZS5zdGFydEluZGV4O1xuXG5cdFx0Ly8gU3RpY2t5IGVsZW1lbnQgY29udGFpbmVyXG5cdFx0Y29uc3Qgc3RpY2t5RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHN0aWNreUVsZW1lbnQuc3R5bGUudG9wID0gYCR7c3RpY2t5Tm9kZS5wb3NpdGlvbn1weGA7XG5cblx0XHRpZiAodGhpcy50cmVlLm9wdGlvbnMuc2V0Um93SGVpZ2h0ICE9PSBmYWxzZSkge1xuXHRcdFx0c3RpY2t5RWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtzdGlja3lOb2RlLmhlaWdodH1weGA7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudHJlZS5vcHRpb25zLnNldFJvd0xpbmVIZWlnaHQgIT09IGZhbHNlKSB7XG5cdFx0XHRzdGlja3lFbGVtZW50LnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtzdGlja3lOb2RlLmhlaWdodH1weGA7XG5cdFx0fVxuXG5cdFx0c3RpY2t5RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tdHJlZS1zdGlja3ktcm93Jyk7XG5cdFx0c3RpY2t5RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tbGlzdC1yb3cnKTtcblxuXHRcdHN0aWNreUVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLWluZGV4JywgYCR7bm9kZUluZGV4fWApO1xuXHRcdHN0aWNreUVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLXBhcml0eScsIG5vZGVJbmRleCAlIDIgPT09IDAgPyAnZXZlbicgOiAnb2RkJyk7XG5cdFx0c3RpY2t5RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2lkJywgdGhpcy52aWV3LmdldEVsZW1lbnRJRChub2RlSW5kZXgpKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5RGlzcG9zYWJsZSA9IHRoaXMuc2V0QWNjZXNzaWJpbGl0eUF0dHJpYnV0ZXMoc3RpY2t5RWxlbWVudCwgc3RpY2t5Tm9kZS5ub2RlLmVsZW1lbnQsIHN0aWNreUluZGV4LCBzdGlja3lOb2Rlc1RvdGFsKTtcblxuXHRcdC8vIEdldCB0aGUgcmVuZGVyZXIgZm9yIHRoZSBub2RlXG5cdFx0Y29uc3Qgbm9kZVRlbXBsYXRlSWQgPSB0aGlzLnRyZWVEZWxlZ2F0ZS5nZXRUZW1wbGF0ZUlkKHN0aWNreU5vZGUubm9kZSk7XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLnRyZWVSZW5kZXJlcnMuZmluZCgocmVuZGVyZXIpID0+IHJlbmRlcmVyLnRlbXBsYXRlSWQgPT09IG5vZGVUZW1wbGF0ZUlkKTtcblx0XHRpZiAoIXJlbmRlcmVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHJlbmRlcmVyIGZvdW5kIGZvciB0ZW1wbGF0ZSBpZCAke25vZGVUZW1wbGF0ZUlkfWApO1xuXHRcdH1cblxuXHRcdC8vIFRvIG1ha2Ugc3VyZSB3ZSBkbyBub3QgaW5mbHVlbmNlIHRoZSBvcmlnaW5hbCBub2RlLCB3ZSBjcmVhdGUgYSBjb3B5IG9mIHRoZSBub2RlXG5cdFx0Ly8gV2UgbmVlZCB0byBjaGVjayBpZiBpdCBpcyBhbHJlYWR5IGEgdW5pcXVlIGluc3RhbmNlIG9mIHRoZSBub2RlIGJ5IHRoZSBkZWxlZ2F0ZVxuXHRcdGxldCBub2RlQ29weSA9IHN0aWNreU5vZGUubm9kZTtcblx0XHRpZiAobm9kZUNvcHkgPT09IHRoaXMudHJlZS5nZXROb2RlKHRoaXMudHJlZS5nZXROb2RlTG9jYXRpb24oc3RpY2t5Tm9kZS5ub2RlKSkpIHtcblx0XHRcdG5vZGVDb3B5ID0gbmV3IFByb3h5KHN0aWNreU5vZGUubm9kZSwge30pO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciB0aGUgZWxlbWVudFxuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YSA9IHJlbmRlcmVyLnJlbmRlclRlbXBsYXRlKHN0aWNreUVsZW1lbnQpO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZUNvcHksIHN0aWNreU5vZGUuc3RhcnRJbmRleCwgdGVtcGxhdGVEYXRhLCB7IGhlaWdodDogc3RpY2t5Tm9kZS5oZWlnaHQgfSk7XG5cblx0XHQvLyBSZW1vdmUgdGhlIGVsZW1lbnQgZnJvbSB0aGUgRE9NIHdoZW4gc3RhdGUgaXMgZGlzcG9zZWRcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGFjY2Vzc2liaWxpdHlEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50KG5vZGVDb3B5LCBzdGlja3lOb2RlLnN0YXJ0SW5kZXgsIHRlbXBsYXRlRGF0YSwgeyBoZWlnaHQ6IHN0aWNreU5vZGUuaGVpZ2h0IH0pO1xuXHRcdFx0cmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRzdGlja3lFbGVtZW50LnJlbW92ZSgpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgZWxlbWVudDogc3RpY2t5RWxlbWVudCwgZGlzcG9zYWJsZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRBY2Nlc3NpYmlsaXR5QXR0cmlidXRlcyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBlbGVtZW50OiBULCBzdGlja3lJbmRleDogbnVtYmVyLCBzdGlja3lOb2Rlc1RvdGFsOiBudW1iZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKCF0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0U2V0U2l6ZSkge1xuXHRcdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1zZXRzaXplJywgU3RyaW5nKHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFNldFNpemUoZWxlbWVudCwgc3RpY2t5SW5kZXgsIHN0aWNreU5vZGVzVG90YWwpKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRQb3NJblNldCkge1xuXHRcdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1wb3NpbnNldCcsIFN0cmluZyh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRQb3NJblNldChlbGVtZW50LCBzdGlja3lJbmRleCkpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFJvbGUpIHtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCB0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRSb2xlKGVsZW1lbnQpID8/ICd0cmVlaXRlbScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMYWJlbChlbGVtZW50KTtcblx0XHRjb25zdCBvYnNlcnZhYmxlID0gKGFyaWFMYWJlbCAmJiB0eXBlb2YgYXJpYUxhYmVsICE9PSAnc3RyaW5nJykgPyBhcmlhTGFiZWwgOiBjb25zdE9ic2VydmFibGUoYXJpYUxhYmVsKTtcblx0XHRjb25zdCByZXN1bHQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJlYWRlci5yZWFkT2JzZXJ2YWJsZShvYnNlcnZhYmxlKTtcblxuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB2YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250YWluZXIucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAodHlwZW9mIGFyaWFMYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHR9IGVsc2UgaWYgKGFyaWFMYWJlbCkge1xuXHRcdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbC5nZXQoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXJpYUxldmVsID0gdGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QXJpYUxldmVsICYmIHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMZXZlbChlbGVtZW50KTtcblx0XHRpZiAodHlwZW9mIGFyaWFMZXZlbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGV2ZWwnLCBgJHthcmlhTGV2ZWx9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RpY2t5IFNjcm9sbCBlbGVtZW50cyBjYW4gbm90IGJlIHNlbGVjdGVkXG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsIFN0cmluZyhmYWxzZSkpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdERvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZW1wdHknLCAhdmlzaWJsZSk7XG5cblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuc3RpY2t5U2Nyb2xsRm9jdXMudXBkYXRlRWxlbWVudHMoW10sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Rm9jdXMoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RpY2t5U2Nyb2xsRm9jdXMuZ2V0Rm9jdXMoKTtcblx0fVxuXG5cdGRvbUZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RpY2t5U2Nyb2xsRm9jdXMuZG9tRm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzZWRMYXN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0aWNreVNjcm9sbEZvY3VzLmZvY3VzZWRMYXN0KCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RpY2t5U2Nyb2xsRm9jdXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3ByZXZpb3VzU3RhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcm9vdERvbU5vZGUucmVtb3ZlKCk7XG5cdH1cbn1cblxuY2xhc3MgU3RpY2t5U2Nyb2xsRm9jdXM8VCwgVEZpbHRlckRhdGEsIFRSZWY+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBmb2N1c2VkSW5kZXg6IG51bWJlciA9IC0xO1xuXHRwcml2YXRlIGVsZW1lbnRzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdHByaXZhdGUgc3RhdGU6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUhhc0ZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGFzRm9jdXMgPSB0aGlzLl9vbkRpZENoYW5nZUhhc0ZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uQ29udGV4dE1lbnUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4+KCkpO1xuXHRyZWFkb25seSBvbkNvbnRleHRNZW51OiBFdmVudDxJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4+ID0gdGhpcy5fb25Db250ZXh0TWVudS5ldmVudDtcblxuXHRwcml2YXRlIF9kb21IYXNGb2N1czogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGdldCBkb21IYXNGb2N1cygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2RvbUhhc0ZvY3VzOyB9XG5cdHByaXZhdGUgc2V0IGRvbUhhc0ZvY3VzKGhhc0ZvY3VzOiBib29sZWFuKSB7XG5cdFx0aWYgKGhhc0ZvY3VzICE9PSB0aGlzLl9kb21IYXNGb2N1cykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIYXNGb2N1cy5maXJlKGhhc0ZvY3VzKTtcblx0XHRcdHRoaXMuX2RvbUhhc0ZvY3VzID0gaGFzRm9jdXM7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlldzogTGlzdDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PlxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCAnZm9jdXMnLCAoKSA9PiB0aGlzLm9uRm9jdXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgJ2JsdXInLCAoKSA9PiB0aGlzLm9uQmx1cigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Lm9uRGlkRm9jdXMoKCkgPT4gdGhpcy50b2dnbGVTdGlja3lTY3JvbGxGb2N1c2VkKGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlldy5vbktleURvd24oKGUpID0+IHRoaXMub25LZXlEb3duKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Lm9uTW91c2VEb3duKChlKSA9PiB0aGlzLm9uTW91c2VEb3duKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Lm9uQ29udGV4dE1lbnUoKGUpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnUoZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQ29udGV4dE1lbnUoZTogSUxpc3RDb250ZXh0TWVudUV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdGlmICghaXNTdGlja3lTY3JvbGxDb250YWluZXIodGFyZ2V0KSAmJiAhaXNTdGlja3lTY3JvbGxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdGlmICh0aGlzLmZvY3VzZWRMYXN0KCkpIHtcblx0XHRcdFx0dGhpcy52aWV3LmRvbUZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGxpc3QgaGFuZGxlcyB0aGUgY29udGV4dCBtZW51IHRyaWdnZXJlZCBieSBhIG1vdXNlIGV2ZW50XG5cdFx0Ly8gSW4gdGhhdCBjYXNlIG9ubHkgc2V0IHRoZSBmb2N1cyBvZiB0aGUgZWxlbWVudCBjbGlja2VkIGFuZCBsZWF2ZSB0aGUgcmVzdCB0byB0aGUgbGlzdCB0byBoYW5kbGVcblx0XHRpZiAoIWlzS2V5Ym9hcmRFdmVudChlLmJyb3dzZXJFdmVudCkpIHtcblx0XHRcdGlmICghdGhpcy5zdGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvbnRleHQgbWVudSBzaG91bGQgbm90IGJlIHRyaWdnZXJlZCB3aGVuIHN0YXRlIGlzIHVuZGVmaW5lZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGlja3lJbmRleCA9IHRoaXMuc3RhdGUuc3RpY2t5Tm9kZXMuZmluZEluZGV4KHN0aWNreU5vZGUgPT4gc3RpY2t5Tm9kZS5ub2RlLmVsZW1lbnQgPT09IGUuZWxlbWVudD8uZWxlbWVudCk7XG5cblx0XHRcdGlmIChzdGlja3lJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb250ZXh0IG1lbnUgc2hvdWxkIG5vdCBiZSB0cmlnZ2VyZWQgd2hlbiBlbGVtZW50IGlzIG5vdCBpbiBzdGlja3kgc2Nyb2xsIHdpZGdldCcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb250YWluZXIuZm9jdXMoKTtcblx0XHRcdHRoaXMuc2V0Rm9jdXMoc3RpY2t5SW5kZXgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zdGF0ZSB8fCB0aGlzLmZvY3VzZWRJbmRleCA8IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29udGV4dCBtZW51IGtleSBzaG91bGQgbm90IGJlIHRyaWdnZXJlZCB3aGVuIGZvY3VzIGlzIG5vdCBpbiBzdGlja3kgc2Nyb2xsIHdpZGdldCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0aWNreU5vZGUgPSB0aGlzLnN0YXRlLnN0aWNreU5vZGVzW3RoaXMuZm9jdXNlZEluZGV4XTtcblx0XHRjb25zdCBlbGVtZW50ID0gc3RpY2t5Tm9kZS5ub2RlLmVsZW1lbnQ7XG5cdFx0Y29uc3QgYW5jaG9yID0gdGhpcy5lbGVtZW50c1t0aGlzLmZvY3VzZWRJbmRleF07XG5cdFx0dGhpcy5fb25Db250ZXh0TWVudS5maXJlKHsgZWxlbWVudCwgYW5jaG9yLCBicm93c2VyRXZlbnQ6IGUuYnJvd3NlckV2ZW50LCBpc1N0aWNreVNjcm9sbDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgb25LZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBTdGlja3kgU2Nyb2xsIE5hdmlnYXRpb25cblx0XHRpZiAodGhpcy5kb21IYXNGb2N1cyAmJiB0aGlzLnN0YXRlKSB7XG5cdFx0XHQvLyBNb3ZlIHVwXG5cdFx0XHRpZiAoZS5rZXkgPT09ICdBcnJvd1VwJykge1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzZWRFbGVtZW50KE1hdGgubWF4KDAsIHRoaXMuZm9jdXNlZEluZGV4IC0gMSkpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBNb3ZlIGRvd24sIGlmIGxhc3Qgc3RpY2t5IG5vZGUgaXMgZm9jdXNlZCwgbW92ZSBmb2N1cyBpbnRvIGZpcnN0IGNoaWxkIG9mIGxhc3Qgc3RpY2t5IG5vZGVcblx0XHRcdGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dEb3duJyB8fCBlLmtleSA9PT0gJ0Fycm93UmlnaHQnKSB7XG5cdFx0XHRcdGlmICh0aGlzLmZvY3VzZWRJbmRleCA+PSB0aGlzLnN0YXRlLmNvdW50IC0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IG5vZGVJbmRleFRvRm9jdXMgPSB0aGlzLnN0YXRlLnN0aWNreU5vZGVzW3RoaXMuc3RhdGUuY291bnQgLSAxXS5zdGFydEluZGV4ICsgMTtcblx0XHRcdFx0XHR0aGlzLnZpZXcuZG9tRm9jdXMoKTtcblx0XHRcdFx0XHR0aGlzLnZpZXcuc2V0Rm9jdXMoW25vZGVJbmRleFRvRm9jdXNdKTtcblx0XHRcdFx0XHR0aGlzLnNjcm9sbE5vZGVVbmRlcldpZGdldChub2RlSW5kZXhUb0ZvY3VzLCB0aGlzLnN0YXRlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNldEZvY3VzZWRFbGVtZW50KHRoaXMuZm9jdXNlZEluZGV4ICsgMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Nb3VzZURvd24oZTogSUxpc3RNb3VzZUV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdGlmICghaXNTdGlja3lTY3JvbGxDb250YWluZXIodGFyZ2V0KSAmJiAhaXNTdGlja3lTY3JvbGxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRlLmJyb3dzZXJFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuYnJvd3NlckV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHR9XG5cblx0dXBkYXRlRWxlbWVudHMoZWxlbWVudHM6IEhUTUxFbGVtZW50W10sIHN0YXRlOiBTdGlja3lTY3JvbGxTdGF0ZTxULCBURmlsdGVyRGF0YSwgVFJlZj4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoc3RhdGUgJiYgc3RhdGUuY291bnQgPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU3RpY2t5IHNjcm9sbCBzdGF0ZSBtdXN0IGJlIHVuZGVmaW5lZCB3aGVuIHRoZXJlIGFyZSBubyBzdGlja3kgbm9kZXMnKTtcblx0XHR9XG5cdFx0aWYgKHN0YXRlICYmIHN0YXRlLmNvdW50ICE9PSBlbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU3RpY2t5IHNjcm9sbCBmb2N1cyByZWNlaXZlZCBpbGxpZ2VsIHN0YXRlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNJbmRleCA9IHRoaXMuZm9jdXNlZEluZGV4O1xuXHRcdHRoaXMucmVtb3ZlRm9jdXMoKTtcblxuXHRcdHRoaXMuZWxlbWVudHMgPSBlbGVtZW50cztcblx0XHR0aGlzLnN0YXRlID0gc3RhdGU7XG5cblx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdGNvbnN0IG5ld0ZvY3VzZWRJbmRleCA9IGNsYW1wKHByZXZpb3VzSW5kZXgsIDAsIHN0YXRlLmNvdW50IC0gMSk7XG5cdFx0XHR0aGlzLnNldEZvY3VzKG5ld0ZvY3VzZWRJbmRleCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLmRvbUhhc0ZvY3VzKSB7XG5cdFx0XHRcdHRoaXMudmlldy5kb21Gb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIG11c3QgY29tZSBsYXN0IGFzIGl0IGNhbGxzIGJsdXIoKVxuXHRcdHRoaXMuY29udGFpbmVyLnRhYkluZGV4ID0gc3RhdGUgPyAwIDogLTE7XG5cdH1cblxuXHRwcml2YXRlIHNldEZvY3VzZWRFbGVtZW50KHN0aWNreUluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBkb2Vzbid0IGltcGx5IHRoYXQgdGhlIHdpZGdldCBoYXMgKG9yIHdpbGwgaGF2ZSkgZm9jdXNcblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBzZXQgZm9jdXMgd2hlbiBzdGF0ZSBpcyB1bmRlZmluZWQnKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldEZvY3VzKHN0aWNreUluZGV4KTtcblxuXHRcdGlmIChzdGlja3lJbmRleCA8IHN0YXRlLmNvdW50IC0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBsYXN0IHN0aWNreSBub2RlIGlzIG5vdCBmdWxseSB2aXNpYmxlLCBzY3JvbGwgaXQgaW50byB2aWV3XG5cdFx0aWYgKHN0YXRlLmxhc3ROb2RlUGFydGlhbGx5VmlzaWJsZSgpKSB7XG5cdFx0XHRjb25zdCBsYXN0U3RpY2t5Tm9kZSA9IHN0YXRlLnN0aWNreU5vZGVzW3N0aWNreUluZGV4XTtcblx0XHRcdHRoaXMuc2Nyb2xsTm9kZVVuZGVyV2lkZ2V0KGxhc3RTdGlja3lOb2RlLmVuZEluZGV4ICsgMSwgc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2Nyb2xsTm9kZVVuZGVyV2lkZ2V0KG5vZGVJbmRleDogbnVtYmVyLCBzdGF0ZTogU3RpY2t5U2Nyb2xsU3RhdGU8VCwgVEZpbHRlckRhdGEsIFRSZWY+KSB7XG5cdFx0Y29uc3QgbGFzdFN0aWNreU5vZGUgPSBzdGF0ZS5zdGlja3lOb2Rlc1tzdGF0ZS5jb3VudCAtIDFdO1xuXHRcdGNvbnN0IHNlY29uZExhc3RTdGlja3lOb2RlID0gc3RhdGUuY291bnQgPiAxID8gc3RhdGUuc3RpY2t5Tm9kZXNbc3RhdGUuY291bnQgLSAyXSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGVsZW1lbnRTY3JvbGxUb3AgPSB0aGlzLnZpZXcuZ2V0RWxlbWVudFRvcChub2RlSW5kZXgpO1xuXHRcdGNvbnN0IGVsZW1lbnRUYXJnZXRWaWV3VG9wID0gc2Vjb25kTGFzdFN0aWNreU5vZGUgPyBzZWNvbmRMYXN0U3RpY2t5Tm9kZS5wb3NpdGlvbiArIHNlY29uZExhc3RTdGlja3lOb2RlLmhlaWdodCArIGxhc3RTdGlja3lOb2RlLmhlaWdodCA6IGxhc3RTdGlja3lOb2RlLmhlaWdodDtcblx0XHR0aGlzLnZpZXcuc2Nyb2xsVG9wID0gZWxlbWVudFNjcm9sbFRvcCAtIGVsZW1lbnRUYXJnZXRWaWV3VG9wO1xuXHR9XG5cblx0Z2V0Rm9jdXMoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLnN0YXRlIHx8IHRoaXMuZm9jdXNlZEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGUuc3RpY2t5Tm9kZXNbdGhpcy5mb2N1c2VkSW5kZXhdLm5vZGUuZWxlbWVudDtcblx0fVxuXG5cdGRvbUZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9jdXMgd2hlbiBzdGF0ZSBpcyB1bmRlZmluZWQnKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRhaW5lci5mb2N1cygpO1xuXHR9XG5cblx0Zm9jdXNlZExhc3QoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLnN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZpZXcuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QuY29udGFpbnMoJ3N0aWNreS1zY3JvbGwtZm9jdXNlZCcpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVGb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5mb2N1c2VkSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudG9nZ2xlRWxlbWVudEZvY3VzKHRoaXMuZWxlbWVudHNbdGhpcy5mb2N1c2VkSW5kZXhdLCBmYWxzZSk7XG5cdFx0dGhpcy5mb2N1c2VkSW5kZXggPSAtMTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Rm9jdXMobmV3Rm9jdXNJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKDAgPiBuZXdGb2N1c0luZGV4KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2FkZEZvY3VzKCkgY2FuIG5vdCByZW1vdmUgZm9jdXMnKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnN0YXRlICYmIG5ld0ZvY3VzSW5kZXggPj0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgc2V0IGZvY3VzIGluZGV4IHdoZW4gc3RhdGUgaXMgdW5kZWZpbmVkJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN0YXRlICYmIG5ld0ZvY3VzSW5kZXggPj0gdGhpcy5zdGF0ZS5jb3VudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgc2V0IGZvY3VzIGluZGV4IHRvIGFuIGluZGV4IHRoYXQgZG9lcyBub3QgZXhpc3QnKTtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRJbmRleCA9IHRoaXMuZm9jdXNlZEluZGV4O1xuXHRcdGlmIChvbGRJbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUVsZW1lbnRGb2N1cyh0aGlzLmVsZW1lbnRzW29sZEluZGV4XSwgZmFsc2UpO1xuXHRcdH1cblx0XHRpZiAobmV3Rm9jdXNJbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUVsZW1lbnRGb2N1cyh0aGlzLmVsZW1lbnRzW25ld0ZvY3VzSW5kZXhdLCB0cnVlKTtcblx0XHR9XG5cdFx0dGhpcy5mb2N1c2VkSW5kZXggPSBuZXdGb2N1c0luZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVFbGVtZW50Rm9jdXMoZWxlbWVudDogSFRNTEVsZW1lbnQsIGZvY3VzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZUVsZW1lbnRBY3RpdmVGb2N1cyhlbGVtZW50LCBmb2N1c2VkICYmIHRoaXMuZG9tSGFzRm9jdXMpO1xuXHRcdHRoaXMudG9nZ2xlRWxlbWVudFBhc3NpdmVGb2N1cyhlbGVtZW50LCBmb2N1c2VkKTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlQ3VycmVudEVsZW1lbnRBY3RpdmVGb2N1cyhmb2N1c2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZm9jdXNlZEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRvZ2dsZUVsZW1lbnRBY3RpdmVGb2N1cyh0aGlzLmVsZW1lbnRzW3RoaXMuZm9jdXNlZEluZGV4XSwgZm9jdXNlZCk7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUVsZW1lbnRBY3RpdmVGb2N1cyhlbGVtZW50OiBIVE1MRWxlbWVudCwgZm9jdXNlZDogYm9vbGVhbikge1xuXHRcdC8vIGFjdGl2ZSBmb2N1cyBpcyBzZXQgd2hlbiBzdGlja3kgc2Nyb2xsIGhhcyBmb2N1c1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZm9jdXNlZCcsIGZvY3VzZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVFbGVtZW50UGFzc2l2ZUZvY3VzKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBmb2N1c2VkOiBib29sZWFuKSB7XG5cdFx0Ly8gcGFzc2l2ZSBmb2N1cyBhbGxvd3MgdG8gc2hvdyBmb2N1cyB3aGVuIHN0aWNreSBzY3JvbGwgZG9lcyBub3QgaGF2ZSBmb2N1c1xuXHRcdC8vIGZvciBleGFtcGxlIHdoZW4gdGhlIGNvbnRleHQgbWVudSBoYXMgZm9jdXNcblx0XHRlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3Bhc3NpdmUtZm9jdXNlZCcsIGZvY3VzZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVTdGlja3lTY3JvbGxGb2N1c2VkKGZvY3VzZWQ6IGJvb2xlYW4pIHtcblx0XHQvLyBXZWF0aGVyIHRoZSBsYXN0IGZvY3VzIGluIHRoZSB2aWV3IHdhcyBzdGlja3kgc2Nyb2xsIGFuZCBub3QgdGhlIGxpc3Rcblx0XHQvLyBJcyBvbmx5IHJlbW92ZWQgd2hlbiB0aGUgZm9jdXMgaXMgYmFjayBpbiB0aGUgdHJlZSBhbiBubyBsb25nZXIgaW4gc3RpY2t5IHNjcm9sbFxuXHRcdHRoaXMudmlldy5nZXRIVE1MRWxlbWVudCgpLmNsYXNzTGlzdC50b2dnbGUoJ3N0aWNreS1zY3JvbGwtZm9jdXNlZCcsIGZvY3VzZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zdGF0ZSB8fCB0aGlzLmVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9jdXMgd2hlbiBzdGF0ZSBpcyB1bmRlZmluZWQgb3IgZWxlbWVudHMgYXJlIGVtcHR5Jyk7XG5cdFx0fVxuXHRcdHRoaXMuZG9tSGFzRm9jdXMgPSB0cnVlO1xuXHRcdHRoaXMudG9nZ2xlU3RpY2t5U2Nyb2xsRm9jdXNlZCh0cnVlKTtcblx0XHR0aGlzLnRvZ2dsZUN1cnJlbnRFbGVtZW50QWN0aXZlRm9jdXModHJ1ZSk7XG5cdFx0aWYgKHRoaXMuZm9jdXNlZEluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhpcy5zZXRGb2N1cygwKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQmx1cigpOiB2b2lkIHtcblx0XHR0aGlzLmRvbUhhc0ZvY3VzID0gZmFsc2U7XG5cdFx0dGhpcy50b2dnbGVDdXJyZW50RWxlbWVudEFjdGl2ZUZvY3VzKGZhbHNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGVTdGlja3lTY3JvbGxGb2N1c2VkKGZhbHNlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhhc0ZvY3VzLmZpcmUoZmFsc2UpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhc1RyZWVNb3VzZUV2ZW50PFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4oZXZlbnQ6IElMaXN0TW91c2VFdmVudDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pik6IElUcmVlTW91c2VFdmVudDxUPiB7XG5cdGxldCB0YXJnZXQ6IFRyZWVNb3VzZUV2ZW50VGFyZ2V0ID0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuVW5rbm93bjtcblxuXHRpZiAoaGFzUGFyZW50V2l0aENsYXNzKGV2ZW50LmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQsICdtb25hY28tdGwtdHdpc3RpZScsICdtb25hY28tdGwtcm93JykpIHtcblx0XHR0YXJnZXQgPSBUcmVlTW91c2VFdmVudFRhcmdldC5Ud2lzdGllO1xuXHR9IGVsc2UgaWYgKGhhc1BhcmVudFdpdGhDbGFzcyhldmVudC5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50LCAnbW9uYWNvLXRsLWNvbnRlbnRzJywgJ21vbmFjby10bC1yb3cnKSkge1xuXHRcdHRhcmdldCA9IFRyZWVNb3VzZUV2ZW50VGFyZ2V0LkVsZW1lbnQ7XG5cdH0gZWxzZSBpZiAoaGFzUGFyZW50V2l0aENsYXNzKGV2ZW50LmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQsICdtb25hY28tdHJlZS10eXBlLWZpbHRlcicsICdtb25hY28tbGlzdCcpKSB7XG5cdFx0dGFyZ2V0ID0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuRmlsdGVyO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRicm93c2VyRXZlbnQ6IGV2ZW50LmJyb3dzZXJFdmVudCxcblx0XHRlbGVtZW50OiBldmVudC5lbGVtZW50ID8gZXZlbnQuZWxlbWVudC5lbGVtZW50IDogbnVsbCxcblx0XHR0YXJnZXRcblx0fTtcbn1cblxuZnVuY3Rpb24gYXNUcmVlQ29udGV4dE1lbnVFdmVudDxULCBURmlsdGVyRGF0YSA9IHZvaWQ+KGV2ZW50OiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4pOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4ge1xuXHRjb25zdCBpc1N0aWNreVNjcm9sbCA9IGlzU3RpY2t5U2Nyb2xsQ29udGFpbmVyKGV2ZW50LmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpO1xuXG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudDogZXZlbnQuZWxlbWVudCA/IGV2ZW50LmVsZW1lbnQuZWxlbWVudCA6IG51bGwsXG5cdFx0YnJvd3NlckV2ZW50OiBldmVudC5icm93c2VyRXZlbnQsXG5cdFx0YW5jaG9yOiBldmVudC5hbmNob3IsXG5cdFx0aXNTdGlja3lTY3JvbGxcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiBleHRlbmRzIElUcmVlUmVuZGVyZXJPcHRpb25zPFQ+IHtcblx0cmVhZG9ubHkgZGVmYXVsdEluZGVudD86IG51bWJlcjsgLy8gT25seSByZWNvbW1lbmRlZCBmb3IgY29tcGFjdCBsYXlvdXRzLiBMZWF2ZSB1bmNoYW5nZWQgb3RoZXJ3aXNlXG5cdHJlYWRvbmx5IG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHR5cGVOYXZpZ2F0aW9uRW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHR5cGVOYXZpZ2F0aW9uTW9kZT86IFR5cGVOYXZpZ2F0aW9uTW9kZTtcblx0cmVhZG9ubHkgZGVmYXVsdEZpbmRNb2RlPzogVHJlZUZpbmRNb2RlO1xuXHRyZWFkb25seSBkZWZhdWx0RmluZE1hdGNoVHlwZT86IFRyZWVGaW5kTWF0Y2hUeXBlO1xuXHRyZWFkb25seSBzaG93Tm90Rm91bmRNZXNzYWdlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc21vb3RoU2Nyb2xsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG9yaXpvbnRhbFNjcm9sbGluZz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNjcm9sbEJ5UGFnZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eT86IG51bWJlcjtcblx0cmVhZG9ubHkgZmFzdFNjcm9sbFNlbnNpdGl2aXR5PzogbnVtYmVyO1xuXHRyZWFkb25seSBleHBhbmRPbkRvdWJsZUNsaWNrPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrPzogYm9vbGVhbiB8ICgoZTogVCkgPT4gYm9vbGVhbik7XG5cdHJlYWRvbmx5IGVuYWJsZVN0aWNreVNjcm9sbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudD86IG51bWJlcjtcblx0cmVhZG9ubHkgcGFkZGluZ1RvcD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWJzdHJhY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGV4dGVuZHMgSUFic3RyYWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4sIElMaXN0T3B0aW9uczxUPiB7XG5cdHJlYWRvbmx5IGNvbnRleHRWaWV3UHJvdmlkZXI/OiBJQ29udGV4dFZpZXdQcm92aWRlcjtcblx0cmVhZG9ubHkgY29sbGFwc2VCeURlZmF1bHQ/OiBib29sZWFuOyAvLyBkZWZhdWx0cyB0byBmYWxzZVxuXHRyZWFkb25seSBhbGxvd05vbkNvbGxhcHNpYmxlUGFyZW50cz86IGJvb2xlYW47IC8vIGRlZmF1bHRzIHRvIGZhbHNlXG5cdHJlYWRvbmx5IGZpbHRlcj86IElUcmVlRmlsdGVyPFQsIFRGaWx0ZXJEYXRhPjtcblx0cmVhZG9ubHkgZG5kPzogSVRyZWVEcmFnQW5kRHJvcDxUPjtcblx0cmVhZG9ubHkgcGFkZGluZ0JvdHRvbT86IG51bWJlcjtcblx0cmVhZG9ubHkgZmluZFdpZGdldEVuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBmaW5kV2lkZ2V0U3R5bGVzPzogSUZpbmRXaWRnZXRTdHlsZXM7XG5cdHJlYWRvbmx5IGZpbmRXaWRnZXRDb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGVmYXVsdEZpbmRWaXNpYmlsaXR5PzogVHJlZVZpc2liaWxpdHkgfCAoKGU6IFQpID0+IFRyZWVWaXNpYmlsaXR5KTtcblx0cmVhZG9ubHkgc3RpY2t5U2Nyb2xsRGVsZWdhdGU/OiBJU3RpY2t5U2Nyb2xsRGVsZWdhdGU8VCwgVEZpbHRlckRhdGE+O1xuXHRyZWFkb25seSBkaXNhYmxlRXhwYW5kT25TcGFjZWJhcj86IGJvb2xlYW47IC8vIGRlZmF1bHRzIHRvIGZhbHNlXG59XG5cbmZ1bmN0aW9uIGRmczxULCBURmlsdGVyRGF0YT4obm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgZm46IChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KSA9PiB2b2lkKTogdm9pZCB7XG5cdGZuKG5vZGUpO1xuXHRub2RlLmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4gZGZzKGNoaWxkLCBmbikpO1xufVxuXG4vKipcbiAqIFRoZSB0cmFpdCBjb25jZXB0IG5lZWRzIHRvIGV4aXN0IGF0IHRoZSB0cmVlIGxldmVsLCBiZWNhdXNlIGNvbGxhcHNlZFxuICogdHJlZSBub2RlcyB3aWxsIG5vdCBiZSBrbm93biBieSB0aGUgbGlzdC5cbiAqL1xuY2xhc3MgVHJhaXQ8VD4ge1xuXG5cdHByaXZhdGUgbm9kZXM6IElUcmVlTm9kZTxULCB1bmtub3duPltdID0gW107XG5cdHByaXZhdGUgZWxlbWVudHM6IFRbXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPElUcmVlRXZlbnQ8VD4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfbm9kZVNldDogU2V0PElUcmVlTm9kZTxULCB1bmtub3duPj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IG5vZGVTZXQoKTogU2V0PElUcmVlTm9kZTxULCB1bmtub3duPj4ge1xuXHRcdGlmICghdGhpcy5fbm9kZVNldCkge1xuXHRcdFx0dGhpcy5fbm9kZVNldCA9IHRoaXMuY3JlYXRlTm9kZVNldCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9ub2RlU2V0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBnZXRGaXJzdFZpZXdFbGVtZW50V2l0aFRyYWl0OiAoKSA9PiBJVHJlZU5vZGU8VCwgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBpZGVudGl0eVByb3ZpZGVyPzogSUlkZW50aXR5UHJvdmlkZXI8VD5cblx0KSB7IH1cblxuXHRzZXQobm9kZXM6IElUcmVlTm9kZTxULCB1bmtub3duPltdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZXZlbnQgPSBicm93c2VyRXZlbnQgYXMgVUlFdmVudCAmIHsgX19mb3JjZUV2ZW50PzogYm9vbGVhbiB9O1xuXHRcdGlmICghKGV2ZW50Py5fX2ZvcmNlRXZlbnQpICYmIGVxdWFscyh0aGlzLm5vZGVzLCBub2RlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXQobm9kZXMsIGZhbHNlLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0KG5vZGVzOiBJVHJlZU5vZGU8VCwgdW5rbm93bj5bXSwgc2lsZW50OiBib29sZWFuLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5ub2RlcyA9IFsuLi5ub2Rlc107XG5cdFx0dGhpcy5lbGVtZW50cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9ub2RlU2V0ID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKCFzaWxlbnQpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGdldCBlbGVtZW50cygpIHsgcmV0dXJuIHRoYXQuZ2V0KCk7IH0sIGJyb3dzZXJFdmVudCB9KTtcblx0XHR9XG5cdH1cblxuXHRnZXQoKTogVFtdIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudHMpIHtcblx0XHRcdHRoaXMuZWxlbWVudHMgPSB0aGlzLm5vZGVzLm1hcChub2RlID0+IG5vZGUuZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi50aGlzLmVsZW1lbnRzXTtcblx0fVxuXG5cdGdldE5vZGVzKCk6IHJlYWRvbmx5IElUcmVlTm9kZTxULCB1bmtub3duPltdIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlcztcblx0fVxuXG5cdGhhcyhub2RlOiBJVHJlZU5vZGU8VCwgdW5rbm93bj4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlU2V0Lmhhcyhub2RlKTtcblx0fVxuXG5cdG9uRGlkTW9kZWxTcGxpY2UoeyBpbnNlcnRlZE5vZGVzLCBkZWxldGVkTm9kZXMgfTogSVRyZWVNb2RlbFNwbGljZUV2ZW50PFQsIHVua25vd24+KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHNldCA9IHRoaXMuY3JlYXRlTm9kZVNldCgpO1xuXHRcdFx0Y29uc3QgdmlzaXQgPSAobm9kZTogSVRyZWVOb2RlPFQsIHVua25vd24+KSA9PiBzZXQuZGVsZXRlKG5vZGUpO1xuXHRcdFx0ZGVsZXRlZE5vZGVzLmZvckVhY2gobm9kZSA9PiBkZnMobm9kZSwgdmlzaXQpKTtcblx0XHRcdHRoaXMuc2V0KFsuLi5zZXQudmFsdWVzKCldKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxldGVkTm9kZXNJZFNldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGRlbGV0ZWROb2Rlc1Zpc2l0b3IgPSAobm9kZTogSVRyZWVOb2RlPFQsIHVua25vd24+KSA9PiBkZWxldGVkTm9kZXNJZFNldC5hZGQodGhpcy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChub2RlLmVsZW1lbnQpLnRvU3RyaW5nKCkpO1xuXHRcdGRlbGV0ZWROb2Rlcy5mb3JFYWNoKG5vZGUgPT4gZGZzKG5vZGUsIGRlbGV0ZWROb2Rlc1Zpc2l0b3IpKTtcblxuXHRcdGNvbnN0IGluc2VydGVkTm9kZXNNYXAgPSBuZXcgTWFwPHN0cmluZywgSVRyZWVOb2RlPFQsIHVua25vd24+PigpO1xuXHRcdGNvbnN0IGluc2VydGVkTm9kZXNWaXNpdG9yID0gKG5vZGU6IElUcmVlTm9kZTxULCB1bmtub3duPikgPT4gaW5zZXJ0ZWROb2Rlc01hcC5zZXQodGhpcy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChub2RlLmVsZW1lbnQpLnRvU3RyaW5nKCksIG5vZGUpO1xuXHRcdGluc2VydGVkTm9kZXMuZm9yRWFjaChub2RlID0+IGRmcyhub2RlLCBpbnNlcnRlZE5vZGVzVmlzaXRvcikpO1xuXG5cdFx0Y29uc3Qgbm9kZXM6IElUcmVlTm9kZTxULCB1bmtub3duPltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgdGhpcy5ub2Rlcykge1xuXHRcdFx0Y29uc3QgaWQgPSB0aGlzLmlkZW50aXR5UHJvdmlkZXIuZ2V0SWQobm9kZS5lbGVtZW50KS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgd2FzRGVsZXRlZCA9IGRlbGV0ZWROb2Rlc0lkU2V0LmhhcyhpZCk7XG5cblx0XHRcdGlmICghd2FzRGVsZXRlZCkge1xuXHRcdFx0XHRub2Rlcy5wdXNoKG5vZGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaW5zZXJ0ZWROb2RlID0gaW5zZXJ0ZWROb2Rlc01hcC5nZXQoaWQpO1xuXG5cdFx0XHRcdGlmIChpbnNlcnRlZE5vZGUgJiYgaW5zZXJ0ZWROb2RlLnZpc2libGUpIHtcblx0XHRcdFx0XHRub2Rlcy5wdXNoKGluc2VydGVkTm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5ub2Rlcy5sZW5ndGggPiAwICYmIG5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0Rmlyc3RWaWV3RWxlbWVudFdpdGhUcmFpdCgpO1xuXG5cdFx0XHRpZiAobm9kZSkge1xuXHRcdFx0XHRub2Rlcy5wdXNoKG5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NldChub2RlcywgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU5vZGVTZXQoKTogU2V0PElUcmVlTm9kZTxULCB1bmtub3duPj4ge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBTZXQ8SVRyZWVOb2RlPFQsIHVua25vd24+PigpO1xuXG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIHRoaXMubm9kZXMpIHtcblx0XHRcdHNldC5hZGQobm9kZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNldDtcblx0fVxufVxuXG5jbGFzcyBUcmVlTm9kZUxpc3RNb3VzZUNvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGEsIFRSZWY+IGV4dGVuZHMgTW91c2VDb250cm9sbGVyPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsaXN0OiBUcmVlTm9kZUxpc3Q8VCwgVEZpbHRlckRhdGEsIFRSZWY+LFxuXHRcdHByaXZhdGUgdHJlZTogQWJzdHJhY3RUcmVlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPixcblx0XHRwcml2YXRlIHN0aWNreVNjcm9sbFByb3ZpZGVyOiAoKSA9PiBTdGlja3lTY3JvbGxDb250cm9sbGVyPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZFxuXHQpIHtcblx0XHRzdXBlcihsaXN0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvblZpZXdQb2ludGVyKGU6IElMaXN0TW91c2VFdmVudDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pik6IHZvaWQge1xuXHRcdGlmIChpc0J1dHRvbihlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpIHx8XG5cdFx0XHRpc0VkaXRhYmxlRWxlbWVudChlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpIHx8XG5cdFx0XHRpc01vbmFjb0VkaXRvcihlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSBlLmVsZW1lbnQ7XG5cblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdHJldHVybiBzdXBlci5vblZpZXdQb2ludGVyKGUpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudChlKSB8fCB0aGlzLmlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZSkpIHtcblx0XHRcdHJldHVybiBzdXBlci5vblZpZXdQb2ludGVyKGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRjb25zdCBvblR3aXN0aWUgPSB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28tdGwtdHdpc3RpZScpXG5cdFx0XHR8fCAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLWljb24tbGFiZWwnKSAmJiB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb2xkZXItaWNvbicpICYmIGUuYnJvd3NlckV2ZW50Lm9mZnNldFggPCAxNik7XG5cdFx0Y29uc3QgaXNTdGlja3lFbGVtZW50ID0gaXNTdGlja3lTY3JvbGxFbGVtZW50KGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCk7XG5cblx0XHRsZXQgZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrID0gZmFsc2U7XG5cblx0XHRpZiAoaXNTdGlja3lFbGVtZW50KSB7XG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgPSB0cnVlO1xuXHRcdH1cblx0XHRlbHNlIGlmICh0eXBlb2YgdGhpcy50cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrID0gdGhpcy50cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayhub2RlLmVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgPSAhIXRoaXMudHJlZS5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1N0aWNreUVsZW1lbnQpIHtcblx0XHRcdGlmIChleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgJiYgIW9uVHdpc3RpZSAmJiBlLmJyb3dzZXJFdmVudC5kZXRhaWwgIT09IDIpIHtcblx0XHRcdFx0cmV0dXJuIHN1cGVyLm9uVmlld1BvaW50ZXIoZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy50cmVlLmV4cGFuZE9uRG91YmxlQ2xpY2sgJiYgZS5icm93c2VyRXZlbnQuZGV0YWlsID09PSAyKSB7XG5cdFx0XHRcdHJldHVybiBzdXBlci5vblZpZXdQb2ludGVyKGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmhhbmRsZVN0aWNreVNjcm9sbE1vdXNlRXZlbnQoZSwgbm9kZSk7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUuY29sbGFwc2libGUgJiYgKCFpc1N0aWNreUVsZW1lbnQgfHwgb25Ud2lzdGllKSkge1xuXHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnRyZWUuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdFx0Y29uc3QgcmVjdXJzaXZlID0gZS5icm93c2VyRXZlbnQuYWx0S2V5O1xuXHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtsb2NhdGlvbl0pO1xuXHRcdFx0dGhpcy50cmVlLnRvZ2dsZUNvbGxhcHNlZChsb2NhdGlvbiwgcmVjdXJzaXZlKTtcblxuXHRcdFx0aWYgKG9uVHdpc3RpZSkge1xuXHRcdFx0XHQvLyBEbyBub3Qgc2V0IHRoaXMgYmVmb3JlIGNhbGxpbmcgYSBoYW5kbGVyIG9uIHRoZSBzdXBlciBjbGFzcywgYmVjYXVzZSBpdCB3aWxsIHJlamVjdCBpdCBhcyBoYW5kbGVkXG5cdFx0XHRcdGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCA9IHRydWU7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWlzU3RpY2t5RWxlbWVudCkge1xuXHRcdFx0c3VwZXIub25WaWV3UG9pbnRlcihlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVN0aWNreVNjcm9sbE1vdXNlRXZlbnQoZTogSUxpc3RNb3VzZUV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+LCBub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogdm9pZCB7XG5cdFx0aWYgKGlzTW9uYWNvQ3VzdG9tVG9nZ2xlKGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkgfHwgaXNBY3Rpb25JdGVtKGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGlja3lTY3JvbGxDb250cm9sbGVyID0gdGhpcy5zdGlja3lTY3JvbGxQcm92aWRlcigpO1xuXHRcdGlmICghc3RpY2t5U2Nyb2xsQ29udHJvbGxlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTdGlja3kgc2Nyb2xsIGNvbnRyb2xsZXIgbm90IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZUluZGV4ID0gdGhpcy5saXN0LmluZGV4T2Yobm9kZSk7XG5cdFx0Y29uc3QgZWxlbWVudFNjcm9sbFRvcCA9IHRoaXMubGlzdC5nZXRFbGVtZW50VG9wKG5vZGVJbmRleCk7XG5cdFx0Y29uc3QgZWxlbWVudFRhcmdldFZpZXdUb3AgPSBzdGlja3lTY3JvbGxDb250cm9sbGVyLm5vZGVQb3NpdGlvblRvcEJlbG93V2lkZ2V0KG5vZGUpO1xuXHRcdHRoaXMudHJlZS5zY3JvbGxUb3AgPSBlbGVtZW50U2Nyb2xsVG9wIC0gZWxlbWVudFRhcmdldFZpZXdUb3A7XG5cdFx0dGhpcy5saXN0LmRvbUZvY3VzKCk7XG5cdFx0dGhpcy5saXN0LnNldEZvY3VzKFtub2RlSW5kZXhdKTtcblx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKFtub2RlSW5kZXhdKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRvdWJsZUNsaWNrKGU6IElMaXN0TW91c2VFdmVudDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pik6IHZvaWQge1xuXHRcdGNvbnN0IG9uVHdpc3RpZSA9IChlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLXRsLXR3aXN0aWUnKTtcblxuXHRcdGlmIChvblR3aXN0aWUgfHwgIXRoaXMudHJlZS5leHBhbmRPbkRvdWJsZUNsaWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN1cGVyLm9uRG91YmxlQ2xpY2soZSk7XG5cdH1cblxuXHQvLyB0byBtYWtlIHN1cmUgZG9tIGZvY3VzIGlzIG5vdCBzdG9sZW4gKGZvciBleGFtcGxlIHdpdGggY29udGV4dCBtZW51KVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25Nb3VzZURvd24oZTogSUxpc3RNb3VzZUV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+IHwgSUxpc3RUb3VjaEV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdGlmICghaXNTdGlja3lTY3JvbGxDb250YWluZXIodGFyZ2V0KSAmJiAhaXNTdGlja3lTY3JvbGxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdHN1cGVyLm9uTW91c2VEb3duKGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkNvbnRleHRNZW51KGU6IElMaXN0Q29udGV4dE1lbnVFdmVudDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pik6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRpZiAoIWlzU3RpY2t5U2Nyb2xsQ29udGFpbmVyKHRhcmdldCkgJiYgIWlzU3RpY2t5U2Nyb2xsRWxlbWVudCh0YXJnZXQpKSB7XG5cdFx0XHRzdXBlci5vbkNvbnRleHRNZW51KGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSVRyZWVOb2RlTGlzdE9wdGlvbnM8VCwgVEZpbHRlckRhdGEsIFRSZWY+IGV4dGVuZHMgSUxpc3RPcHRpb25zPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+IHtcblx0cmVhZG9ubHkgdHJlZTogQWJzdHJhY3RUcmVlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPjtcblx0cmVhZG9ubHkgc3RpY2t5U2Nyb2xsUHJvdmlkZXI6ICgpID0+IFN0aWNreVNjcm9sbENvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGEsIFRSZWY+IHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFdlIHVzZSB0aGlzIExpc3Qgc3ViY2xhc3MgdG8gcmVzdG9yZSBzZWxlY3Rpb24gYW5kIGZvY3VzIGFzIG5vZGVzXG4gKiBnZXQgcmVuZGVyZWQgaW4gdGhlIGxpc3QsIHBvc3NpYmx5IGR1ZSB0byBhIG5vZGUgZXhwYW5kKCkgY2FsbC5cbiAqL1xuY2xhc3MgVHJlZU5vZGVMaXN0PFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiBleHRlbmRzIExpc3Q8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHZpcnR1YWxEZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4sXG5cdFx0cmVuZGVyZXJzOiBJTGlzdFJlbmRlcmVyPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIHVua25vd24+W10sXG5cdFx0cHJpdmF0ZSBmb2N1c1RyYWl0OiBUcmFpdDxUPixcblx0XHRwcml2YXRlIHNlbGVjdGlvblRyYWl0OiBUcmFpdDxUPixcblx0XHRwcml2YXRlIGFuY2hvclRyYWl0OiBUcmFpdDxUPixcblx0XHRvcHRpb25zOiBJVHJlZU5vZGVMaXN0T3B0aW9uczxULCBURmlsdGVyRGF0YSwgVFJlZj5cblx0KSB7XG5cdFx0c3VwZXIodXNlciwgY29udGFpbmVyLCB2aXJ0dWFsRGVsZWdhdGUsIHJlbmRlcmVycywgb3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlTW91c2VDb250cm9sbGVyKG9wdGlvbnM6IElUcmVlTm9kZUxpc3RPcHRpb25zPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPik6IE1vdXNlQ29udHJvbGxlcjxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PiB7XG5cdFx0cmV0dXJuIG5ldyBUcmVlTm9kZUxpc3RNb3VzZUNvbnRyb2xsZXIodGhpcywgb3B0aW9ucy50cmVlLCBvcHRpb25zLnN0aWNreVNjcm9sbFByb3ZpZGVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBlbGVtZW50czogcmVhZG9ubHkgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPltdID0gW10pOiB2b2lkIHtcblx0XHRzdXBlci5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCBlbGVtZW50cyk7XG5cblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkaXRpb25hbEZvY3VzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxTZWxlY3Rpb246IG51bWJlcltdID0gW107XG5cdFx0bGV0IGFuY2hvcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0ZWxlbWVudHMuZm9yRWFjaCgobm9kZSwgaW5kZXgpID0+IHtcblx0XHRcdGlmICh0aGlzLmZvY3VzVHJhaXQuaGFzKG5vZGUpKSB7XG5cdFx0XHRcdGFkZGl0aW9uYWxGb2N1cy5wdXNoKHN0YXJ0ICsgaW5kZXgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5zZWxlY3Rpb25UcmFpdC5oYXMobm9kZSkpIHtcblx0XHRcdFx0YWRkaXRpb25hbFNlbGVjdGlvbi5wdXNoKHN0YXJ0ICsgaW5kZXgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5hbmNob3JUcmFpdC5oYXMobm9kZSkpIHtcblx0XHRcdFx0YW5jaG9yID0gc3RhcnQgKyBpbmRleDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChhZGRpdGlvbmFsRm9jdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0c3VwZXIuc2V0Rm9jdXMoZGlzdGluY3QoWy4uLnN1cGVyLmdldEZvY3VzKCksIC4uLmFkZGl0aW9uYWxGb2N1c10pKTtcblx0XHR9XG5cblx0XHRpZiAoYWRkaXRpb25hbFNlbGVjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRzdXBlci5zZXRTZWxlY3Rpb24oZGlzdGluY3QoWy4uLnN1cGVyLmdldFNlbGVjdGlvbigpLCAuLi5hZGRpdGlvbmFsU2VsZWN0aW9uXSkpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgYW5jaG9yID09PSAnbnVtYmVyJykge1xuXHRcdFx0c3VwZXIuc2V0QW5jaG9yKGFuY2hvcik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Rm9jdXMoaW5kZXhlczogbnVtYmVyW10sIGJyb3dzZXJFdmVudD86IFVJRXZlbnQsIGZyb21BUEkgPSBmYWxzZSk6IHZvaWQge1xuXHRcdHN1cGVyLnNldEZvY3VzKGluZGV4ZXMsIGJyb3dzZXJFdmVudCk7XG5cblx0XHRpZiAoIWZyb21BUEkpIHtcblx0XHRcdHRoaXMuZm9jdXNUcmFpdC5zZXQoaW5kZXhlcy5tYXAoaSA9PiB0aGlzLmVsZW1lbnQoaSkpLCBicm93c2VyRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHNldFNlbGVjdGlvbihpbmRleGVzOiBudW1iZXJbXSwgYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZnJvbUFQSSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0U2VsZWN0aW9uKGluZGV4ZXMsIGJyb3dzZXJFdmVudCk7XG5cblx0XHRpZiAoIWZyb21BUEkpIHtcblx0XHRcdHRoaXMuc2VsZWN0aW9uVHJhaXQuc2V0KGluZGV4ZXMubWFwKGkgPT4gdGhpcy5lbGVtZW50KGkpKSwgYnJvd3NlckV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzZXRBbmNob3IoaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgZnJvbUFQSSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0QW5jaG9yKGluZGV4KTtcblxuXHRcdGlmICghZnJvbUFQSSkge1xuXHRcdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0dGhpcy5hbmNob3JUcmFpdC5zZXQoW10pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hbmNob3JUcmFpdC5zZXQoW3RoaXMuZWxlbWVudChpbmRleCldKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWJzdHJhY3RUcmVlUGFydCB7XG5cdFRyZWUsXG5cdFN0aWNreVNjcm9sbCxcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgVFJlZj4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJvdGVjdGVkIHZpZXc6IFRyZWVOb2RlTGlzdDxULCBURmlsdGVyRGF0YSwgVFJlZj47XG5cdHByaXZhdGUgcmVuZGVyZXJzOiBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIHVua25vd24+W107XG5cdHByb3RlY3RlZCBtb2RlbDogSVRyZWVNb2RlbDxULCBURmlsdGVyRGF0YSwgVFJlZj47XG5cdHByaXZhdGUgdHJlZURlbGVnYXRlOiBDb21wb3NlZFRyZWVEZWxlZ2F0ZTxULCBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pjtcblx0cHJpdmF0ZSBmb2N1czogVHJhaXQ8VD47XG5cdHByaXZhdGUgc2VsZWN0aW9uOiBUcmFpdDxUPjtcblx0cHJpdmF0ZSBhbmNob3I6IFRyYWl0PFQ+O1xuXHRwcml2YXRlIGV2ZW50QnVmZmVyZXIgPSBuZXcgRXZlbnRCdWZmZXJlcigpO1xuXHRwcml2YXRlIGZpbmRDb250cm9sbGVyPzogRmluZENvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGE+O1xuXHRwcml2YXRlIGZpbmRGaWx0ZXI/OiBGaW5kRmlsdGVyPFQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRPcGVuU3RhdGU6IEV2ZW50PGJvb2xlYW4+ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VTdGlja3lTY3JvbGxGb2N1c2VkOiBFdmVudDxib29sZWFuPiA9IEV2ZW50Lk5vbmU7XG5cdHByaXZhdGUgZm9jdXNOYXZpZ2F0aW9uRmlsdGVyOiAoKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0aWNreVNjcm9sbENvbnRyb2xsZXI/OiBTdGlja3lTY3JvbGxDb250cm9sbGVyPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPjtcblx0cHJpdmF0ZSBzdHlsZUVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRnZXQgb25EaWRTY3JvbGwoKTogRXZlbnQ8U2Nyb2xsRXZlbnQ+IHsgcmV0dXJuIHRoaXMudmlldy5vbkRpZFNjcm9sbDsgfVxuXG5cdGdldCBvbkRpZENoYW5nZUZvY3VzKCk6IEV2ZW50PElUcmVlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMuZXZlbnRCdWZmZXJlci53cmFwRXZlbnQodGhpcy5mb2N1cy5vbkRpZENoYW5nZSk7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlU2VsZWN0aW9uKCk6IEV2ZW50PElUcmVlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMuZXZlbnRCdWZmZXJlci53cmFwRXZlbnQodGhpcy5zZWxlY3Rpb24ub25EaWRDaGFuZ2UpOyB9XG5cblx0Z2V0IG9uTW91c2VDbGljaygpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Nb3VzZUNsaWNrLCBhc1RyZWVNb3VzZUV2ZW50KTsgfVxuXHRnZXQgb25Nb3VzZURibENsaWNrKCk6IEV2ZW50PElUcmVlTW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQuZmlsdGVyKEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Nb3VzZURibENsaWNrLCBhc1RyZWVNb3VzZUV2ZW50KSwgZSA9PiBlLnRhcmdldCAhPT0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuRmlsdGVyKTsgfVxuXHRnZXQgb25Nb3VzZU1pZGRsZUNsaWNrKCk6IEV2ZW50PElUcmVlTW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQuZmlsdGVyKEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Nb3VzZU1pZGRsZUNsaWNrLCBhc1RyZWVNb3VzZUV2ZW50KSwgZSA9PiBlLnRhcmdldCAhPT0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuRmlsdGVyKTsgfVxuXHRnZXQgb25Nb3VzZU92ZXIoKTogRXZlbnQ8SVRyZWVNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy52aWV3Lm9uTW91c2VPdmVyLCBhc1RyZWVNb3VzZUV2ZW50KTsgfVxuXHRnZXQgb25Nb3VzZU91dCgpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Nb3VzZU91dCwgYXNUcmVlTW91c2VFdmVudCk7IH1cblx0Z2V0IG9uQ29udGV4dE1lbnUoKTogRXZlbnQ8SVRyZWVDb250ZXh0TWVudUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5hbnkoRXZlbnQuZmlsdGVyKEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Db250ZXh0TWVudSwgYXNUcmVlQ29udGV4dE1lbnVFdmVudCksIGUgPT4gIWUuaXNTdGlja3lTY3JvbGwpLCB0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXI/Lm9uQ29udGV4dE1lbnUgPz8gRXZlbnQuTm9uZSk7IH1cblx0Z2V0IG9uVGFwKCk6IEV2ZW50PElUcmVlTW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMudmlldy5vblRhcCwgYXNUcmVlTW91c2VFdmVudCk7IH1cblx0Z2V0IG9uUG9pbnRlcigpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Qb2ludGVyLCBhc1RyZWVNb3VzZUV2ZW50KTsgfVxuXG5cdGdldCBvbktleURvd24oKTogRXZlbnQ8S2V5Ym9hcmRFdmVudD4geyByZXR1cm4gdGhpcy52aWV3Lm9uS2V5RG93bjsgfVxuXHRnZXQgb25LZXlVcCgpOiBFdmVudDxLZXlib2FyZEV2ZW50PiB7IHJldHVybiB0aGlzLnZpZXcub25LZXlVcDsgfVxuXHRnZXQgb25LZXlQcmVzcygpOiBFdmVudDxLZXlib2FyZEV2ZW50PiB7IHJldHVybiB0aGlzLnZpZXcub25LZXlQcmVzczsgfVxuXG5cdGdldCBvbkRpZEZvY3VzKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMudmlldy5vbkRpZEZvY3VzOyB9XG5cdGdldCBvbkRpZEJsdXIoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy52aWV3Lm9uRGlkQmx1cjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRTd2FwTW9kZWwgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZU1vZGVsUmVsYXkgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgUmVsYXk8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRTcGxpY2VNb2RlbFJlbGF5ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFJlbGF5PElUcmVlTW9kZWxTcGxpY2VFdmVudDxULCBURmlsdGVyRGF0YT4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZVJlbGF5ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFJlbGF5PElDb2xsYXBzZVN0YXRlQ2hhbmdlRXZlbnQ8VCwgVEZpbHRlckRhdGE+PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudFJlbGF5ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFJlbGF5PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlTm9kZXNSZWxheSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBSZWxheTxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10+KCkpO1xuXG5cdGdldCBvbkRpZENoYW5nZU1vZGVsKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIEV2ZW50LmFueSh0aGlzLm9uRGlkQ2hhbmdlTW9kZWxSZWxheS5ldmVudCwgdGhpcy5vbkRpZFN3YXBNb2RlbC5ldmVudCk7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSgpOiBFdmVudDxJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50PFQsIFRGaWx0ZXJEYXRhPj4geyByZXR1cm4gdGhpcy5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGVSZWxheS5ldmVudDsgfVxuXHRnZXQgb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQoKTogRXZlbnQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4geyByZXR1cm4gdGhpcy5vbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudFJlbGF5LmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsUmVmaWx0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbldpbGxSZWZpbHRlcjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbldpbGxSZWZpbHRlci5ldmVudDtcblxuXHRnZXQgZmluZE1vZGUoKTogVHJlZUZpbmRNb2RlIHsgcmV0dXJuIHRoaXMuZmluZENvbnRyb2xsZXI/Lm1vZGUgPz8gVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDsgfVxuXHRzZXQgZmluZE1vZGUoZmluZE1vZGU6IFRyZWVGaW5kTW9kZSkgeyBpZiAodGhpcy5maW5kQ29udHJvbGxlcikgeyB0aGlzLmZpbmRDb250cm9sbGVyLm1vZGUgPSBmaW5kTW9kZTsgfSB9XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmluZE1vZGU6IEV2ZW50PFRyZWVGaW5kTW9kZT47XG5cblx0Z2V0IGZpbmRNYXRjaFR5cGUoKTogVHJlZUZpbmRNYXRjaFR5cGUgeyByZXR1cm4gdGhpcy5maW5kQ29udHJvbGxlcj8ubWF0Y2hUeXBlID8/IFRyZWVGaW5kTWF0Y2hUeXBlLkZ1enp5OyB9XG5cdHNldCBmaW5kTWF0Y2hUeXBlKGZpbmRGdXp6eTogVHJlZUZpbmRNYXRjaFR5cGUpIHsgaWYgKHRoaXMuZmluZENvbnRyb2xsZXIpIHsgdGhpcy5maW5kQ29udHJvbGxlci5tYXRjaFR5cGUgPSBmaW5kRnV6enk7IH0gfVxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRNYXRjaFR5cGU6IEV2ZW50PFRyZWVGaW5kTWF0Y2hUeXBlPjtcblxuXHRnZXQgb25EaWRDaGFuZ2VGaW5kUGF0dGVybigpOiBFdmVudDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuZmluZENvbnRyb2xsZXIgPyB0aGlzLmZpbmRDb250cm9sbGVyLm9uRGlkQ2hhbmdlUGF0dGVybiA6IEV2ZW50Lk5vbmU7IH1cblxuXHRnZXQgZXhwYW5kT25Eb3VibGVDbGljaygpOiBib29sZWFuIHsgcmV0dXJuIHR5cGVvZiB0aGlzLl9vcHRpb25zLmV4cGFuZE9uRG91YmxlQ2xpY2sgPT09ICd1bmRlZmluZWQnID8gdHJ1ZSA6IHRoaXMuX29wdGlvbnMuZXhwYW5kT25Eb3VibGVDbGljazsgfVxuXHRnZXQgZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrKCk6IGJvb2xlYW4gfCAoKGU6IFQpID0+IGJvb2xlYW4pIHsgcmV0dXJuIHR5cGVvZiB0aGlzLl9vcHRpb25zLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA9PT0gJ3VuZGVmaW5lZCcgPyB0cnVlIDogdGhpcy5fb3B0aW9ucy5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZU9wdGlvbnMgPSBuZXcgRW1pdHRlcjxJQWJzdHJhY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlT3B0aW9uczogRXZlbnQ8SUFic3RyYWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+PiA9IHRoaXMuX29uRGlkVXBkYXRlT3B0aW9ucy5ldmVudDtcblxuXHRnZXQgb25EaWREaXNwb3NlKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMudmlldy5vbkRpZERpc3Bvc2U7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJVHJlZVJlbmRlcmVyPFQsIFRGaWx0ZXJEYXRhLCB1bmtub3duPltdLFxuXHRcdHByaXZhdGUgX29wdGlvbnM6IElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiA9IHt9XG5cdCkge1xuXHRcdGlmIChfb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyICYmIChfb3B0aW9ucy5maW5kV2lkZ2V0RW5hYmxlZCA/PyB0cnVlKSkge1xuXHRcdFx0dGhpcy5maW5kRmlsdGVyID0gbmV3IEZpbmRGaWx0ZXIoX29wdGlvbnMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciwgX29wdGlvbnMuZmlsdGVyIGFzIElUcmVlRmlsdGVyPFQsIEZ1enp5U2NvcmU+LCBfb3B0aW9ucy5kZWZhdWx0RmluZFZpc2liaWxpdHkpO1xuXHRcdFx0X29wdGlvbnMgPSB7IC4uLl9vcHRpb25zLCBmaWx0ZXI6IHRoaXMuZmluZEZpbHRlciBhcyBJVHJlZUZpbHRlcjxULCBURmlsdGVyRGF0YT4gfTsgLy8gVE9ETyBuZWVkIHR5cGVzY3JpcHQgaGVscCBoZXJlXG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbmRGaWx0ZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMubW9kZWwgPSB0aGlzLmNyZWF0ZU1vZGVsKF91c2VyLCBfb3B0aW9ucyk7XG5cdFx0dGhpcy50cmVlRGVsZWdhdGUgPSBuZXcgQ29tcG9zZWRUcmVlRGVsZWdhdGU8VCwgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oZGVsZWdhdGUpO1xuXG5cdFx0Y29uc3QgYWN0aXZlTm9kZXMgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRXZlbnRDb2xsZWN0aW9uKHRoaXMub25EaWRDaGFuZ2VBY3RpdmVOb2Rlc1JlbGF5LmV2ZW50KSk7XG5cdFx0Y29uc3QgcmVuZGVyZWRJbmRlbnRHdWlkZXMgPSBuZXcgU2V0TWFwPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIEhUTUxEaXZFbGVtZW50PigpO1xuXHRcdHRoaXMucmVuZGVyZXJzID0gcmVuZGVyZXJzLm1hcChyID0+IG5ldyBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIHVua25vd24+KHIsIHRoaXMubW9kZWwsIHRoaXMub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlUmVsYXkuZXZlbnQsIGFjdGl2ZU5vZGVzLCByZW5kZXJlZEluZGVudEd1aWRlcywgX29wdGlvbnMpKTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5yZW5kZXJlcnMpIHtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHIpO1xuXHRcdH1cblxuXHRcdHRoaXMuZm9jdXMgPSBuZXcgVHJhaXQoKCkgPT4gdGhpcy52aWV3LmdldEZvY3VzZWRFbGVtZW50cygpWzBdLCBfb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKTtcblx0XHR0aGlzLnNlbGVjdGlvbiA9IG5ldyBUcmFpdCgoKSA9PiB0aGlzLnZpZXcuZ2V0U2VsZWN0ZWRFbGVtZW50cygpWzBdLCBfb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKTtcblx0XHR0aGlzLmFuY2hvciA9IG5ldyBUcmFpdCgoKSA9PiB0aGlzLnZpZXcuZ2V0QW5jaG9yRWxlbWVudCgpLCBfb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKTtcblx0XHR0aGlzLnZpZXcgPSBuZXcgVHJlZU5vZGVMaXN0KF91c2VyLCBjb250YWluZXIsIHRoaXMudHJlZURlbGVnYXRlLCB0aGlzLnJlbmRlcmVycywgdGhpcy5mb2N1cywgdGhpcy5zZWxlY3Rpb24sIHRoaXMuYW5jaG9yLCB7IC4uLmFzTGlzdE9wdGlvbnMoKCkgPT4gdGhpcy5tb2RlbCwgdGhpcy5kaXNwb3NhYmxlcywgX29wdGlvbnMpLCB0cmVlOiB0aGlzLCBzdGlja3lTY3JvbGxQcm92aWRlcjogKCkgPT4gdGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyIH0pO1xuXG5cdFx0dGhpcy5zZXR1cE1vZGVsKHRoaXMubW9kZWwpOyAvLyBtb2RlbCBuZWVkcyB0byBiZSBzZXR1cCBhZnRlciB0aGUgdHJhaXRzIGhhdmUgYmVlbiBjcmVhdGVkXG5cblx0XHRpZiAoX29wdGlvbnMua2V5Ym9hcmRTdXBwb3J0ICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3Qgb25LZXlEb3duID0gRXZlbnQuY2hhaW4odGhpcy52aWV3Lm9uS2V5RG93biwgJCA9PlxuXHRcdFx0XHQkLmZpbHRlcihlID0+ICFpc0VkaXRhYmxlRWxlbWVudChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkpXG5cdFx0XHRcdFx0Lm1hcChlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpXG5cdFx0XHQpO1xuXG5cdFx0XHRFdmVudC5jaGFpbihvbktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuTGVmdEFycm93KSkodGhpcy5vbkxlZnRBcnJvdywgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0XHRFdmVudC5jaGFpbihvbktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuUmlnaHRBcnJvdykpKHRoaXMub25SaWdodEFycm93LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRcdEV2ZW50LmNoYWluKG9uS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSkpKHRoaXMub25TcGFjZSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKChfb3B0aW9ucy5maW5kV2lkZ2V0RW5hYmxlZCA/PyB0cnVlKSAmJiBfb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyICYmIF9vcHRpb25zLmNvbnRleHRWaWV3UHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IGZpbmRPcHRpb25zOiBJRmluZENvbnRyb2xsZXJPcHRpb25zID0ge1xuXHRcdFx0XHRzdHlsZXM6IF9vcHRpb25zLmZpbmRXaWRnZXRTdHlsZXMsXG5cdFx0XHRcdGRlZmF1bHRGaW5kTW9kZTogX29wdGlvbnMuZGVmYXVsdEZpbmRNb2RlLFxuXHRcdFx0XHRkZWZhdWx0RmluZE1hdGNoVHlwZTogX29wdGlvbnMuZGVmYXVsdEZpbmRNYXRjaFR5cGUsXG5cdFx0XHRcdHNob3dOb3RGb3VuZE1lc3NhZ2U6IF9vcHRpb25zLnNob3dOb3RGb3VuZE1lc3NhZ2UsXG5cdFx0XHRcdGZpbmRXaWRnZXRDb250YWluZXI6IF9vcHRpb25zLmZpbmRXaWRnZXRDb250YWluZXIsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5maW5kQ29udHJvbGxlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kQ29udHJvbGxlcih0aGlzLCB0aGlzLmZpbmRGaWx0ZXIhLCBfb3B0aW9ucy5jb250ZXh0Vmlld1Byb3ZpZGVyLCBmaW5kT3B0aW9ucykpO1xuXHRcdFx0dGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIgPSBub2RlID0+IHRoaXMuZmluZENvbnRyb2xsZXIhLnNob3VsZEFsbG93Rm9jdXMobm9kZSk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZSA9IHRoaXMuZmluZENvbnRyb2xsZXIub25EaWRDaGFuZ2VPcGVuU3RhdGU7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRmluZE1vZGUgPSB0aGlzLmZpbmRDb250cm9sbGVyLm9uRGlkQ2hhbmdlTW9kZTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VGaW5kTWF0Y2hUeXBlID0gdGhpcy5maW5kQ29udHJvbGxlci5vbkRpZENoYW5nZU1hdGNoVHlwZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUZpbmRNb2RlID0gRXZlbnQuTm9uZTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VGaW5kTWF0Y2hUeXBlID0gRXZlbnQuTm9uZTtcblx0XHR9XG5cblx0XHRpZiAoX29wdGlvbnMuZW5hYmxlU3RpY2t5U2Nyb2xsKSB7XG5cdFx0XHR0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIgPSBuZXcgU3RpY2t5U2Nyb2xsQ29udHJvbGxlcih0aGlzLCB0aGlzLm1vZGVsLCB0aGlzLnZpZXcsIHRoaXMucmVuZGVyZXJzLCB0aGlzLnRyZWVEZWxlZ2F0ZSwgX29wdGlvbnMpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVN0aWNreVNjcm9sbEZvY3VzZWQgPSB0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIub25EaWRDaGFuZ2VIYXNGb2N1cztcblx0XHR9XG5cblx0XHR0aGlzLnN0eWxlRWxlbWVudCA9IGNyZWF0ZVN0eWxlU2hlZXQodGhpcy52aWV3LmdldEhUTUxFbGVtZW50KCkpO1xuXHRcdHRoaXMuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QudG9nZ2xlKCdhbHdheXMnLCB0aGlzLl9vcHRpb25zLnJlbmRlckluZGVudEd1aWRlcyA9PT0gUmVuZGVySW5kZW50R3VpZGVzLkFsd2F5cyk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGU6IElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlPFQ+ID0ge30pOiB2b2lkIHtcblx0XHR0aGlzLl9vcHRpb25zID0geyAuLi50aGlzLl9vcHRpb25zLCAuLi5vcHRpb25zVXBkYXRlIH07XG5cblx0XHRmb3IgKGNvbnN0IHJlbmRlcmVyIG9mIHRoaXMucmVuZGVyZXJzKSB7XG5cdFx0XHRyZW5kZXJlci51cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGUpO1xuXHRcdH1cblxuXHRcdHRoaXMudmlldy51cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGUpO1xuXHRcdHRoaXMuZmluZENvbnRyb2xsZXI/LnVwZGF0ZU9wdGlvbnMob3B0aW9uc1VwZGF0ZSk7XG5cdFx0dGhpcy51cGRhdGVTdGlja3lTY3JvbGwob3B0aW9uc1VwZGF0ZSk7XG5cblx0XHR0aGlzLl9vbkRpZFVwZGF0ZU9wdGlvbnMuZmlyZSh0aGlzLl9vcHRpb25zKTtcblxuXHRcdHRoaXMuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QudG9nZ2xlKCdhbHdheXMnLCB0aGlzLl9vcHRpb25zLnJlbmRlckluZGVudEd1aWRlcyA9PT0gUmVuZGVySW5kZW50R3VpZGVzLkFsd2F5cyk7XG5cdH1cblxuXHRnZXQgb3B0aW9ucygpOiBJQWJzdHJhY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGlja3lTY3JvbGwob3B0aW9uc1VwZGF0ZTogSUFic3RyYWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4pIHtcblx0XHRpZiAoIXRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlciAmJiB0aGlzLl9vcHRpb25zLmVuYWJsZVN0aWNreVNjcm9sbCkge1xuXHRcdFx0dGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyID0gbmV3IFN0aWNreVNjcm9sbENvbnRyb2xsZXIodGhpcywgdGhpcy5tb2RlbCwgdGhpcy52aWV3LCB0aGlzLnJlbmRlcmVycywgdGhpcy50cmVlRGVsZWdhdGUsIHRoaXMuX29wdGlvbnMpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVN0aWNreVNjcm9sbEZvY3VzZWQgPSB0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIub25EaWRDaGFuZ2VIYXNGb2N1cztcblx0XHR9IGVsc2UgaWYgKHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlciAmJiAhdGhpcy5fb3B0aW9ucy5lbmFibGVTdGlja3lTY3JvbGwpIHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VTdGlja3lTY3JvbGxGb2N1c2VkID0gRXZlbnQuTm9uZTtcblx0XHRcdHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcj8udXBkYXRlT3B0aW9ucyhvcHRpb25zVXBkYXRlKTtcblx0fVxuXG5cdHVwZGF0ZVdpZHRoKGVsZW1lbnQ6IFRSZWYpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMubW9kZWwuZ2V0TGlzdEluZGV4KGVsZW1lbnQpO1xuXG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudmlldy51cGRhdGVXaWR0aChpbmRleCk7XG5cdH1cblxuXHQvLyBXaWRnZXRcblxuXHRnZXRIVE1MRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5nZXRIVE1MRWxlbWVudCgpO1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmNvbnRlbnRIZWlnaHQ7XG5cdH1cblxuXHRnZXQgY29udGVudFdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5jb250ZW50V2lkdGg7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCk6IEV2ZW50PG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXcub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0O1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQ29udGVudFdpZHRoKCk6IEV2ZW50PG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXcub25EaWRDaGFuZ2VDb250ZW50V2lkdGg7XG5cdH1cblxuXHRnZXQgc2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zY3JvbGxUb3A7XG5cdH1cblxuXHRzZXQgc2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG5cdFx0dGhpcy52aWV3LnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcblx0fVxuXG5cdGdldCBzY3JvbGxMZWZ0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zY3JvbGxMZWZ0O1xuXHR9XG5cblx0c2V0IHNjcm9sbExlZnQoc2Nyb2xsTGVmdDogbnVtYmVyKSB7XG5cdFx0dGhpcy52aWV3LnNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuXHR9XG5cblx0Z2V0IHNjcm9sbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cblx0Z2V0IHJlbmRlckhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcucmVuZGVySGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGZpcnN0VmlzaWJsZUVsZW1lbnQoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGluZGV4ID0gdGhpcy52aWV3LmZpcnN0VmlzaWJsZUluZGV4O1xuXG5cdFx0aWYgKHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcikge1xuXHRcdFx0aW5kZXggKz0gdGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyLmNvdW50O1xuXHRcdH1cblxuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy52aWV3Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gdGhpcy52aWV3LmVsZW1lbnQoaW5kZXgpO1xuXHRcdHJldHVybiBub2RlLmVsZW1lbnQ7XG5cdH1cblxuXHRnZXQgbGFzdFZpc2libGVFbGVtZW50KCk6IFQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy52aWV3Lmxhc3RWaXNpYmxlSW5kZXg7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMudmlldy5lbGVtZW50KGluZGV4KTtcblx0XHRyZXR1cm4gbm9kZS5lbGVtZW50O1xuXHR9XG5cblx0Z2V0IGFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuYXJpYUxhYmVsO1xuXHR9XG5cblx0c2V0IGFyaWFMYWJlbCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy52aWV3LmFyaWFMYWJlbCA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGlvblNpemUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuc2VsZWN0aW9uLmdldE5vZGVzKCkubGVuZ3RoO1xuXHR9XG5cblx0ZG9tRm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcj8uZm9jdXNlZExhc3QoKSkge1xuXHRcdFx0dGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyLmRvbUZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudmlldy5kb21Gb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGlzRE9NRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNBY3RpdmVFbGVtZW50KHRoaXMuZ2V0SFRNTEVsZW1lbnQoKSk7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRzdHlsZShzdHlsZXM6IElMaXN0U3R5bGVzKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VmZml4ID0gYC4ke3RoaXMudmlldy5kb21JZH1gO1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAoc3R5bGVzLnRyZWVJbmRlbnRHdWlkZXNTdHJva2UpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmhvdmVyIC5tb25hY28tdGwtaW5kZW50ID4gLmluZGVudC1ndWlkZSwgLm1vbmFjby1saXN0JHtzdWZmaXh9LmFsd2F5cyAubW9uYWNvLXRsLWluZGVudCA+IC5pbmRlbnQtZ3VpZGUgIHsgb3BhY2l0eTogMTsgYm9yZGVyLWNvbG9yOiAke3N0eWxlcy50cmVlSW5hY3RpdmVJbmRlbnRHdWlkZXNTdHJva2V9OyB9YCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLXRsLWluZGVudCA+IC5pbmRlbnQtZ3VpZGUuYWN0aXZlIHsgb3BhY2l0eTogMTsgYm9yZGVyLWNvbG9yOiAke3N0eWxlcy50cmVlSW5kZW50R3VpZGVzU3Ryb2tlfTsgfWApO1xuXHRcdH1cblxuXHRcdC8vIFN0aWNreSBTY3JvbGwgQmFja2dyb3VuZFxuXHRcdGNvbnN0IHN0aWNreVNjcm9sbEJhY2tncm91bmQgPSBzdHlsZXMudHJlZVN0aWNreVNjcm9sbEJhY2tncm91bmQgPz8gc3R5bGVzLmxpc3RCYWNrZ3JvdW5kO1xuXHRcdGlmIChzdGlja3lTY3JvbGxCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lciB7IGJhY2tncm91bmQtY29sb3I6ICR7c3RpY2t5U2Nyb2xsQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IC5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyIC5tb25hY28tdHJlZS1zdGlja3ktcm93IHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdGlja3lTY3JvbGxCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdC8vIFN0aWNreSBTY3JvbGwgQm9yZGVyXG5cdFx0aWYgKHN0eWxlcy50cmVlU3RpY2t5U2Nyb2xsQm9yZGVyKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lciB7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAke3N0eWxlcy50cmVlU3RpY2t5U2Nyb2xsQm9yZGVyfTsgfWApO1xuXHRcdH1cblxuXHRcdC8vIFN0aWNreSBTY3JvbGwgU2hhZG93XG5cdFx0aWYgKHN0eWxlcy50cmVlU3RpY2t5U2Nyb2xsU2hhZG93KSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lciAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lci1zaGFkb3cgeyBib3gtc2hhZG93OiAke3N0eWxlcy50cmVlU3RpY2t5U2Nyb2xsU2hhZG93fSAwIDZweCA2cHggLTZweCBpbnNldDsgaGVpZ2h0OiAzcHg7IH1gKTtcblx0XHR9XG5cblx0XHQvLyBTdGlja3kgU2Nyb2xsIEZvY3VzXG5cdFx0aWYgKHN0eWxlcy5saXN0Rm9jdXNGb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fS5zdGlja3ktc2Nyb2xsLWZvY3VzZWQgLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgLm1vbmFjby10cmVlLXN0aWNreS1jb250YWluZXI6Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0ZvcmVncm91bmR9OyB9YCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fTpub3QoLnN0aWNreS1zY3JvbGwtZm9jdXNlZCkgLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgLm1vbmFjby10cmVlLXN0aWNreS1jb250YWluZXIgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6IGluaGVyaXQ7IH1gKTtcblx0XHR9XG5cblx0XHQvLyBTdGlja3kgU2Nyb2xsIEZvY3VzIE91dGxpbmVzXG5cdFx0Y29uc3QgZm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lID0gYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KHN0eWxlcy5saXN0Rm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lLCBhc0Nzc1ZhbHVlV2l0aERlZmF1bHQoc3R5bGVzLmxpc3RTZWxlY3Rpb25PdXRsaW5lLCBzdHlsZXMubGlzdEZvY3VzT3V0bGluZSA/PyAnJykpO1xuXHRcdGlmIChmb2N1c0FuZFNlbGVjdGlvbk91dGxpbmUpIHsgLy8gZGVmYXVsdDogbGlzdEZvY3VzT3V0bGluZVxuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0uc3RpY2t5LXNjcm9sbC1mb2N1c2VkIC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IC5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyOmZvY3VzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZC5zZWxlY3RlZCB7IG91dGxpbmU6IDFweCBzb2xpZCAke2ZvY3VzQW5kU2VsZWN0aW9uT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4O31gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9Om5vdCguc3RpY2t5LXNjcm9sbC1mb2N1c2VkKSAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lciAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQuc2VsZWN0ZWQgeyBvdXRsaW5lOiBpbmhlcml0O31gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c091dGxpbmUpIHsgLy8gZGVmYXVsdDogc2V0XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fS5zdGlja3ktc2Nyb2xsLWZvY3VzZWQgLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgLm1vbmFjby10cmVlLXN0aWNreS1jb250YWluZXI6Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgb3V0bGluZTogMXB4IHNvbGlkICR7c3R5bGVzLmxpc3RGb2N1c091dGxpbmV9OyBvdXRsaW5lLW9mZnNldDogLTFweDsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06bm90KC5zdGlja3ktc2Nyb2xsLWZvY3VzZWQpIC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IC5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IGluaGVyaXQ7IH1gKTtcblxuXHRcdFx0Y29udGVudC5wdXNoKGAuY29udGV4dC1tZW51LXZpc2libGUgLm1vbmFjby1saXN0JHtzdWZmaXh9Lmxhc3QtZm9jdXNlZC5zdGlja3ktc2Nyb2xsLWZvY3VzZWQgLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgLm1vbmFjby10cmVlLXN0aWNreS1jb250YWluZXIgLm1vbmFjby1saXN0LXJvdy5wYXNzaXZlLWZvY3VzZWQgeyBvdXRsaW5lOiAxcHggc29saWQgJHtzdHlsZXMubGlzdEZvY3VzT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4OyB9YCk7XG5cblx0XHRcdGNvbnRlbnQucHVzaChgLmNvbnRleHQtbWVudS12aXNpYmxlIC5tb25hY28tbGlzdCR7c3VmZml4fS5sYXN0LWZvY3VzZWQuc3RpY2t5LXNjcm9sbC1mb2N1c2VkIC5tb25hY28tbGlzdC1yb3dzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IGluaGVyaXQ7IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLmNvbnRleHQtbWVudS12aXNpYmxlIC5tb25hY28tbGlzdCR7c3VmZml4fS5sYXN0LWZvY3VzZWQ6bm90KC5zdGlja3ktc2Nyb2xsLWZvY3VzZWQpIC5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyIC5tb25hY28tbGlzdC1yb3dzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IGluaGVyaXQ7IH1gKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IGNvbnRlbnQuam9pbignXFxuJyk7XG5cblx0XHR0aGlzLnZpZXcuc3R5bGUoc3R5bGVzKTtcblx0fVxuXG5cdC8vIFRyZWUgbmF2aWdhdGlvblxuXG5cdGdldFBhcmVudEVsZW1lbnQobG9jYXRpb246IFRSZWYpOiBUIHtcblx0XHRjb25zdCBwYXJlbnRSZWYgPSB0aGlzLm1vZGVsLmdldFBhcmVudE5vZGVMb2NhdGlvbihsb2NhdGlvbik7XG5cdFx0Y29uc3QgcGFyZW50Tm9kZSA9IHRoaXMubW9kZWwuZ2V0Tm9kZShwYXJlbnRSZWYpO1xuXHRcdHJldHVybiBwYXJlbnROb2RlLmVsZW1lbnQ7XG5cdH1cblxuXHRnZXRGaXJzdEVsZW1lbnRDaGlsZChsb2NhdGlvbjogVFJlZik6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldEZpcnN0RWxlbWVudENoaWxkKGxvY2F0aW9uKTtcblx0fVxuXG5cdC8vIFRyZWVcblxuXHRnZXROb2RlKGxvY2F0aW9uPzogVFJlZik6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldE5vZGUobG9jYXRpb24pO1xuXHR9XG5cblx0Z2V0Tm9kZUxvY2F0aW9uKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBUUmVmIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdH1cblxuXHRjb2xsYXBzZShsb2NhdGlvbjogVFJlZiwgcmVjdXJzaXZlOiBib29sZWFuID0gZmFsc2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXRDb2xsYXBzZWQobG9jYXRpb24sIHRydWUsIHJlY3Vyc2l2ZSk7XG5cdH1cblxuXHRleHBhbmQobG9jYXRpb246IFRSZWYsIHJlY3Vyc2l2ZTogYm9vbGVhbiA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuc2V0Q29sbGFwc2VkKGxvY2F0aW9uLCBmYWxzZSwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdHRvZ2dsZUNvbGxhcHNlZChsb2NhdGlvbjogVFJlZiwgcmVjdXJzaXZlOiBib29sZWFuID0gZmFsc2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXRDb2xsYXBzZWQobG9jYXRpb24sIHVuZGVmaW5lZCwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdGV4cGFuZEFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNldENvbGxhcHNlZCh0aGlzLm1vZGVsLnJvb3RSZWYsIGZhbHNlLCB0cnVlKTtcblx0fVxuXG5cdGNvbGxhcHNlQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuc2V0Q29sbGFwc2VkKHRoaXMubW9kZWwucm9vdFJlZiwgdHJ1ZSwgdHJ1ZSk7XG5cdH1cblxuXHRpc0NvbGxhcHNpYmxlKGxvY2F0aW9uOiBUUmVmKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNDb2xsYXBzaWJsZShsb2NhdGlvbik7XG5cdH1cblxuXHRzZXRDb2xsYXBzaWJsZShsb2NhdGlvbjogVFJlZiwgY29sbGFwc2libGU/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuc2V0Q29sbGFwc2libGUobG9jYXRpb24sIGNvbGxhcHNpYmxlKTtcblx0fVxuXG5cdGlzQ29sbGFwc2VkKGxvY2F0aW9uOiBUUmVmKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNDb2xsYXBzZWQobG9jYXRpb24pO1xuXHR9XG5cblx0ZXhwYW5kVG8obG9jYXRpb246IFRSZWYpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLmV4cGFuZFRvKGxvY2F0aW9uKTtcblx0fVxuXG5cdHRyaWdnZXJUeXBlTmF2aWdhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXcudHJpZ2dlclR5cGVOYXZpZ2F0aW9uKCk7XG5cdH1cblxuXHRvcGVuRmluZCgpOiB2b2lkIHtcblx0XHR0aGlzLmZpbmRDb250cm9sbGVyPy5vcGVuKCk7XG5cdH1cblxuXHRjbG9zZUZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5maW5kQ29udHJvbGxlcj8uY2xvc2UoKTtcblx0fVxuXG5cdHJlZmlsdGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uV2lsbFJlZmlsdGVyLmZpcmUodW5kZWZpbmVkKTtcblx0XHR0aGlzLm1vZGVsLnJlZmlsdGVyKCk7XG5cdH1cblxuXHRzZXRBbmNob3IoZWxlbWVudDogVFJlZiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB0aGlzLnZpZXcuc2V0QW5jaG9yKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5ldmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gdGhpcy5tb2RlbC5nZXROb2RlKGVsZW1lbnQpO1xuXHRcdFx0dGhpcy5hbmNob3Iuc2V0KFtub2RlXSk7XG5cblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5tb2RlbC5nZXRMaXN0SW5kZXgoZWxlbWVudCk7XG5cblx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdHRoaXMudmlldy5zZXRBbmNob3IoaW5kZXgsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0QW5jaG9yKCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFuY2hvci5nZXQoKS5hdCgwKTtcblx0fVxuXG5cdHNldFNlbGVjdGlvbihlbGVtZW50czogVFJlZltdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlcyA9IGVsZW1lbnRzLm1hcChlID0+IHRoaXMubW9kZWwuZ2V0Tm9kZShlKSk7XG5cdFx0XHR0aGlzLnNlbGVjdGlvbi5zZXQobm9kZXMsIGJyb3dzZXJFdmVudCk7XG5cblx0XHRcdGNvbnN0IGluZGV4ZXMgPSBlbGVtZW50cy5tYXAoZSA9PiB0aGlzLm1vZGVsLmdldExpc3RJbmRleChlKSkuZmlsdGVyKGkgPT4gaSA+IC0xKTtcblx0XHRcdHRoaXMudmlldy5zZXRTZWxlY3Rpb24oaW5kZXhlcywgYnJvd3NlckV2ZW50LCB0cnVlKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldFNlbGVjdGlvbigpOiBUW10ge1xuXHRcdHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXQoKTtcblx0fVxuXG5cdHNldEZvY3VzKGVsZW1lbnRzOiBUUmVmW10sIGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50QnVmZmVyZXIuYnVmZmVyRXZlbnRzKCgpID0+IHtcblx0XHRcdGNvbnN0IG5vZGVzID0gZWxlbWVudHMubWFwKGUgPT4gdGhpcy5tb2RlbC5nZXROb2RlKGUpKTtcblx0XHRcdHRoaXMuZm9jdXMuc2V0KG5vZGVzLCBicm93c2VyRXZlbnQpO1xuXG5cdFx0XHRjb25zdCBpbmRleGVzID0gZWxlbWVudHMubWFwKGUgPT4gdGhpcy5tb2RlbC5nZXRMaXN0SW5kZXgoZSkpLmZpbHRlcihpID0+IGkgPiAtMSk7XG5cdFx0XHR0aGlzLnZpZXcuc2V0Rm9jdXMoaW5kZXhlcywgYnJvd3NlckV2ZW50LCB0cnVlKTtcblx0XHR9KTtcblx0fVxuXG5cdGZvY3VzTmV4dChuID0gMSwgbG9vcCA9IGZhbHNlLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQgPSAoaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkgJiYgYnJvd3NlckV2ZW50LmFsdEtleSkgPyB1bmRlZmluZWQgOiB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5mb2N1c05leHQobiwgbG9vcCwgYnJvd3NlckV2ZW50LCBmaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91cyhuID0gMSwgbG9vcCA9IGZhbHNlLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQgPSAoaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkgJiYgYnJvd3NlckV2ZW50LmFsdEtleSkgPyB1bmRlZmluZWQgOiB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5mb2N1c1ByZXZpb3VzKG4sIGxvb3AsIGJyb3dzZXJFdmVudCwgZmlsdGVyKTtcblx0fVxuXG5cdGZvY3VzTmV4dFBhZ2UoYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyOiAoKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkID0gKGlzS2V5Ym9hcmRFdmVudChicm93c2VyRXZlbnQpICYmIGJyb3dzZXJFdmVudC5hbHRLZXkpID8gdW5kZWZpbmVkIDogdGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmZvY3VzTmV4dFBhZ2UoYnJvd3NlckV2ZW50LCBmaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91c1BhZ2UoYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyOiAoKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkID0gKGlzS2V5Ym9hcmRFdmVudChicm93c2VyRXZlbnQpICYmIGJyb3dzZXJFdmVudC5hbHRLZXkpID8gdW5kZWZpbmVkIDogdGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmZvY3VzUHJldmlvdXNQYWdlKGJyb3dzZXJFdmVudCwgZmlsdGVyLCAoKSA9PiB0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXI/LmhlaWdodCA/PyAwKTtcblx0fVxuXG5cdGZvY3VzTGFzdChicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQgPSAoaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkgJiYgYnJvd3NlckV2ZW50LmFsdEtleSkgPyB1bmRlZmluZWQgOiB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5mb2N1c0xhc3QoYnJvd3NlckV2ZW50LCBmaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNGaXJzdChicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQgPSAoaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkgJiYgYnJvd3NlckV2ZW50LmFsdEtleSkgPyB1bmRlZmluZWQgOiB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5mb2N1c0ZpcnN0KGJyb3dzZXJFdmVudCwgZmlsdGVyKTtcblx0fVxuXG5cdGdldEZvY3VzKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZm9jdXMuZ2V0KCk7XG5cdH1cblxuXHRnZXRTdGlja3lTY3JvbGxGb2N1cygpOiBUW10ge1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyPy5nZXRGb2N1cygpO1xuXHRcdHJldHVybiBmb2N1cyAhPT0gdW5kZWZpbmVkID8gW2ZvY3VzXSA6IFtdO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZFBhcnQoKTogQWJzdHJhY3RUcmVlUGFydCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcj8uZm9jdXNlZExhc3QoKSA/IEFic3RyYWN0VHJlZVBhcnQuU3RpY2t5U2Nyb2xsIDogQWJzdHJhY3RUcmVlUGFydC5UcmVlO1xuXHR9XG5cblx0cmV2ZWFsKGxvY2F0aW9uOiBUUmVmLCByZWxhdGl2ZVRvcD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuZXhwYW5kVG8obG9jYXRpb24pO1xuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChsb2NhdGlvbik7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMudmlldy5yZXZlYWwoaW5kZXgsIHJlbGF0aXZlVG9wKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcGFkZGluZ1RvcCA9IHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5ub2RlUG9zaXRpb25Ub3BCZWxvd1dpZGdldCh0aGlzLmdldE5vZGUobG9jYXRpb24pKTtcblx0XHRcdHRoaXMudmlldy5yZXZlYWwoaW5kZXgsIHJlbGF0aXZlVG9wLCBwYWRkaW5nVG9wKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcmVsYXRpdmUgcG9zaXRpb24gb2YgYW4gZWxlbWVudCByZW5kZXJlZCBpbiB0aGUgbGlzdC5cblx0ICogUmV0dXJucyBgbnVsbGAgaWYgdGhlIGVsZW1lbnQgaXNuJ3QgKmVudGlyZWx5KiBpbiB0aGUgdmlzaWJsZSB2aWV3cG9ydC5cblx0ICovXG5cdGdldFJlbGF0aXZlVG9wKGxvY2F0aW9uOiBUUmVmKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChsb2NhdGlvbik7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBzdGlja3lTY3JvbGxOb2RlID0gdGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyPy5nZXROb2RlKHRoaXMuZ2V0Tm9kZShsb2NhdGlvbikpO1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZ2V0UmVsYXRpdmVUb3AoaW5kZXgsIHN0aWNreVNjcm9sbE5vZGU/LnBvc2l0aW9uID8/IHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcj8uaGVpZ2h0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBhYnNvbHV0ZSB0b3Agb2Zmc2V0IG9mIGFuIGVsZW1lbnQgaW4gdGhlIHRyZWUncyBzY3JvbGwvY29udGVudFxuXHQgKiBzcGFjZSwgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGUgZWxlbWVudCBpcyBub3QgaW4gdGhlIHRyZWUuIFVubGlrZVxuXHQgKiB7QGxpbmsgZ2V0UmVsYXRpdmVUb3B9LCB0aGlzIHJlYWRzIHRoZSBsYXlvdXQgaGVpZ2h0IG1vZGVsLCBzbyBpdCBhbHNvXG5cdCAqIHJlc29sdmVzIGVsZW1lbnRzIG91dHNpZGUgdGhlIHJlbmRlcmVkIHZpZXdwb3J0LlxuXHQgKi9cblx0Z2V0RWxlbWVudFRvcChsb2NhdGlvbjogVFJlZik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChsb2NhdGlvbik7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnZpZXcuZ2V0RWxlbWVudFRvcChpbmRleCk7XG5cdH1cblxuXHRnZXRWaWV3U3RhdGUoaWRlbnRpdHlQcm92aWRlciA9IHRoaXMub3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKTogQWJzdHJhY3RUcmVlVmlld1N0YXRlIHtcblx0XHRpZiAoIWlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBUcmVlRXJyb3IodGhpcy5fdXNlciwgJ0NhblxcJ3QgZ2V0IHRyZWUgdmlldyBzdGF0ZSB3aXRob3V0IGFuIGlkZW50aXR5IHByb3ZpZGVyJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2V0SWQgPSAoZWxlbWVudDogVCB8IG51bGwpID0+IGlkZW50aXR5UHJvdmlkZXIuZ2V0SWQoZWxlbWVudCEpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBBYnN0cmFjdFRyZWVWaWV3U3RhdGUuZW1wdHkodGhpcy5zY3JvbGxUb3ApO1xuXHRcdGZvciAoY29uc3QgZm9jdXMgb2YgdGhpcy5nZXRGb2N1cygpKSB7XG5cdFx0XHRzdGF0ZS5mb2N1cy5hZGQoZ2V0SWQoZm9jdXMpKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2YgdGhpcy5nZXRTZWxlY3Rpb24oKSkge1xuXHRcdFx0c3RhdGUuc2VsZWN0aW9uLmFkZChnZXRJZChzZWxlY3Rpb24pKTtcblx0XHR9XG5cblx0XHRjb25zdCByb290ID0gdGhpcy5tb2RlbC5nZXROb2RlKCk7XG5cdFx0Y29uc3Qgc3RhY2sgPSBbcm9vdF07XG5cblx0XHR3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHN0YWNrLnBvcCgpITtcblxuXHRcdFx0aWYgKG5vZGUgIT09IHJvb3QgJiYgbm9kZS5jb2xsYXBzaWJsZSkge1xuXHRcdFx0XHRzdGF0ZS5leHBhbmRlZFtnZXRJZChub2RlLmVsZW1lbnQpXSA9IG5vZGUuY29sbGFwc2VkID8gMCA6IDE7XG5cdFx0XHR9XG5cblx0XHRcdGluc2VydEludG8oc3RhY2ssIHN0YWNrLmxlbmd0aCwgbm9kZS5jaGlsZHJlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0Ly8gTGlzdFxuXG5cdHByaXZhdGUgb25MZWZ0QXJyb3coZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRjb25zdCBub2RlcyA9IHRoaXMudmlldy5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblxuXHRcdGlmIChub2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gbm9kZXNbMF07XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLm1vZGVsLmdldE5vZGVMb2NhdGlvbihub2RlKTtcblx0XHRjb25zdCBkaWRDaGFuZ2UgPSB0aGlzLm1vZGVsLnNldENvbGxhcHNlZChsb2NhdGlvbiwgdHJ1ZSk7XG5cblx0XHRpZiAoIWRpZENoYW5nZSkge1xuXHRcdFx0Y29uc3QgcGFyZW50TG9jYXRpb24gPSB0aGlzLm1vZGVsLmdldFBhcmVudE5vZGVMb2NhdGlvbihsb2NhdGlvbik7XG5cblx0XHRcdGlmICghcGFyZW50TG9jYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXJlbnRMaXN0SW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChwYXJlbnRMb2NhdGlvbik7XG5cblx0XHRcdHRoaXMudmlldy5yZXZlYWwocGFyZW50TGlzdEluZGV4KTtcblx0XHRcdHRoaXMudmlldy5zZXRGb2N1cyhbcGFyZW50TGlzdEluZGV4XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblJpZ2h0QXJyb3coZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRjb25zdCBub2RlcyA9IHRoaXMudmlldy5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblxuXHRcdGlmIChub2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gbm9kZXNbMF07XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLm1vZGVsLmdldE5vZGVMb2NhdGlvbihub2RlKTtcblx0XHRjb25zdCBkaWRDaGFuZ2UgPSB0aGlzLm1vZGVsLnNldENvbGxhcHNlZChsb2NhdGlvbiwgZmFsc2UpO1xuXG5cdFx0aWYgKCFkaWRDaGFuZ2UpIHtcblx0XHRcdGlmICghbm9kZS5jaGlsZHJlbi5zb21lKGNoaWxkID0+IGNoaWxkLnZpc2libGUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgW2ZvY3VzZWRJbmRleF0gPSB0aGlzLnZpZXcuZ2V0Rm9jdXMoKTtcblx0XHRcdGNvbnN0IGZpcnN0Q2hpbGRJbmRleCA9IGZvY3VzZWRJbmRleCArIDE7XG5cblx0XHRcdHRoaXMudmlldy5yZXZlYWwoZmlyc3RDaGlsZEluZGV4KTtcblx0XHRcdHRoaXMudmlldy5zZXRGb2N1cyhbZmlyc3RDaGlsZEluZGV4XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblNwYWNlKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0Y29uc3Qgbm9kZXMgPSB0aGlzLnZpZXcuZ2V0Rm9jdXNlZEVsZW1lbnRzKCk7XG5cblx0XHRpZiAobm9kZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZSA9IG5vZGVzWzBdO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5tb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdFx0Y29uc3QgcmVjdXJzaXZlID0gZS5icm93c2VyRXZlbnQuYWx0S2V5O1xuXG5cdFx0dGhpcy5tb2RlbC5zZXRDb2xsYXBzZWQobG9jYXRpb24sIHVuZGVmaW5lZCwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBjcmVhdGVNb2RlbCh1c2VyOiBzdHJpbmcsIG9wdGlvbnM6IElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPik6IElUcmVlTW9kZWw8VCwgVEZpbHRlckRhdGEsIFRSZWY+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBzZXR1cE1vZGVsKG1vZGVsOiBJVHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPikge1xuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0dGhpcy5tb2RlbERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMoKHsgc3RhcnQsIGRlbGV0ZUNvdW50LCBlbGVtZW50cyB9KSA9PiB0aGlzLnZpZXcuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgZWxlbWVudHMpKSk7XG5cblx0XHRjb25zdCBvbkRpZE1vZGVsU3BsaWNlID0gRXZlbnQuZm9yRWFjaChtb2RlbC5vbkRpZFNwbGljZU1vZGVsLCBlID0+IHtcblx0XHRcdHRoaXMuZXZlbnRCdWZmZXJlci5idWZmZXJFdmVudHMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZvY3VzLm9uRGlkTW9kZWxTcGxpY2UoZSk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0aW9uLm9uRGlkTW9kZWxTcGxpY2UoZSk7XG5cdFx0XHR9KTtcblx0XHR9LCB0aGlzLm1vZGVsRGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoZSBgZm9yRWFjaGAgYWx3YXlzIHJ1bnNcblx0XHRvbkRpZE1vZGVsU3BsaWNlKCgpID0+IG51bGwsIG51bGwsIHRoaXMubW9kZWxEaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBBY3RpdmUgbm9kZXMgY2FuIGNoYW5nZSB3aGVuIHRoZSBtb2RlbCBjaGFuZ2VzIG9yIHdoZW4gZm9jdXMgb3Igc2VsZWN0aW9uIGNoYW5nZS5cblx0XHQvLyBXZSBkZWJvdW5jZSBpdCB3aXRoIDAgZGVsYXkgc2luY2UgdGhlc2UgZXZlbnRzIG1heSBmaXJlIGluIHRoZSBzYW1lIHN0YWNrIGFuZCB3ZSBvbmx5XG5cdFx0Ly8gd2FudCB0byBydW4gdGhpcyBvbmNlLiBJdCBhbHNvIGRvZXNuJ3QgbWF0dGVyIGlmIGl0IHJ1bnMgb24gdGhlIG5leHQgdGljayBzaW5jZSBpdCdzIG9ubHlcblx0XHQvLyBhIG5pY2UgdG8gaGF2ZSBVSSBmZWF0dXJlLlxuXHRcdGNvbnN0IGFjdGl2ZU5vZGVzRW1pdHRlciA9IHRoaXMubW9kZWxEaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPltdPigpKTtcblx0XHRjb25zdCBhY3RpdmVOb2Rlc0RlYm91bmNlID0gdGhpcy5tb2RlbERpc3Bvc2FibGVzLmFkZChuZXcgRGVsYXllcigwKSk7XG5cdFx0dGhpcy5tb2RlbERpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkob25EaWRNb2RlbFNwbGljZSwgdGhpcy5mb2N1cy5vbkRpZENoYW5nZSwgdGhpcy5zZWxlY3Rpb24ub25EaWRDaGFuZ2UpKCgpID0+IHtcblx0XHRcdGFjdGl2ZU5vZGVzRGVib3VuY2UudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNldCA9IG5ldyBTZXQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgdGhpcy5mb2N1cy5nZXROb2RlcygpKSB7XG5cdFx0XHRcdFx0c2V0LmFkZChub2RlIGFzIElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIHRoaXMuc2VsZWN0aW9uLmdldE5vZGVzKCkpIHtcblx0XHRcdFx0XHRzZXQuYWRkKG5vZGUgYXMgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhY3RpdmVOb2Rlc0VtaXR0ZXIuZmlyZShbLi4uc2V0LnZhbHVlcygpXSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlTm9kZXNSZWxheS5pbnB1dCA9IGFjdGl2ZU5vZGVzRW1pdHRlci5ldmVudDtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlTW9kZWxSZWxheS5pbnB1dCA9IEV2ZW50LnNpZ25hbChtb2RlbC5vbkRpZFNwbGljZU1vZGVsKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZVJlbGF5LmlucHV0ID0gbW9kZWwub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnRSZWxheS5pbnB1dCA9IG1vZGVsLm9uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50O1xuXHRcdHRoaXMub25EaWRTcGxpY2VNb2RlbFJlbGF5LmlucHV0ID0gbW9kZWwub25EaWRTcGxpY2VNb2RlbDtcblxuXHRcdC8vIEFubm91bmNlIGNvbGxhcHNlIHN0YXRlIGNoYW5nZXMgZm9yIHNjcmVlbiByZWFkZXJzIChWb2ljZU92ZXIgZG9lc24ndCByZWxpYWJseVxuXHRcdC8vIGFubm91bmNlIGFyaWEtZXhwYW5kZWQgY2hhbmdlcyBvbiBhbHJlYWR5LWZvY3VzZWQgZWxlbWVudHMpXG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZShlID0+IHtcblx0XHRcdFx0Y29uc3QgeyBub2RlLCBkZWVwIH0gPSBlO1xuXHRcdFx0XHRpZiAobm9kZS5jb2xsYXBzaWJsZSAmJiAhZGVlcCAmJiB0aGlzLmlzRE9NRm9jdXNlZCgpKSB7XG5cdFx0XHRcdFx0YWxlcnQobm9kZS5jb2xsYXBzZWQgPyBsb2NhbGl6ZSgndHJlZU5vZGVDb2xsYXBzZWQnLCBcImNvbGxhcHNlZFwiKSA6IGxvY2FsaXplKCd0cmVlTm9kZUV4cGFuZGVkJywgXCJleHBhbmRlZFwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRuYXZpZ2F0ZShzdGFydD86IFRSZWYpOiBJVHJlZU5hdmlnYXRvcjxUPiB7XG5cdFx0cmV0dXJuIG5ldyBUcmVlTmF2aWdhdG9yKHRoaXMudmlldywgdGhpcy5tb2RlbCwgc3RhcnQpO1xuXHR9XG5cblx0ZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGJyb3dzZXJFdmVudDogSU1vdXNlV2hlZWxFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudmlldy5kZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHR0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXI/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLnZpZXcuZGlzcG9zZSgpO1xuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUcmVlTmF2aWdhdG9yVmlldzxULCBURmlsdGVyRGF0YT4ge1xuXHRyZWFkb25seSBsZW5ndGg6IG51bWJlcjtcblx0ZWxlbWVudChpbmRleDogbnVtYmVyKTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPjtcbn1cblxuY2xhc3MgVHJlZU5hdmlnYXRvcjxULCBURmlsdGVyRGF0YSwgVFJlZj4gaW1wbGVtZW50cyBJVHJlZU5hdmlnYXRvcjxUPiB7XG5cblx0cHJpdmF0ZSBpbmRleDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgdmlldzogSVRyZWVOYXZpZ2F0b3JWaWV3PFQsIFRGaWx0ZXJEYXRhPiwgcHJpdmF0ZSBtb2RlbDogSVRyZWVNb2RlbDxULCBURmlsdGVyRGF0YSwgVFJlZj4sIHN0YXJ0PzogVFJlZikge1xuXHRcdGlmIChzdGFydCkge1xuXHRcdFx0dGhpcy5pbmRleCA9IHRoaXMubW9kZWwuZ2V0TGlzdEluZGV4KHN0YXJ0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbmRleCA9IC0xO1xuXHRcdH1cblx0fVxuXG5cdGN1cnJlbnQoKTogVCB8IG51bGwge1xuXHRcdGlmICh0aGlzLmluZGV4IDwgMCB8fCB0aGlzLmluZGV4ID49IHRoaXMudmlldy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnZpZXcuZWxlbWVudCh0aGlzLmluZGV4KS5lbGVtZW50O1xuXHR9XG5cblx0cHJldmlvdXMoKTogVCB8IG51bGwge1xuXHRcdHRoaXMuaW5kZXgtLTtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50KCk7XG5cdH1cblxuXHRuZXh0KCk6IFQgfCBudWxsIHtcblx0XHR0aGlzLmluZGV4Kys7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudCgpO1xuXHR9XG5cblx0Zmlyc3QoKTogVCB8IG51bGwge1xuXHRcdHRoaXMuaW5kZXggPSAwO1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnQoKTtcblx0fVxuXG5cdGxhc3QoKTogVCB8IG51bGwge1xuXHRcdHRoaXMuaW5kZXggPSB0aGlzLnZpZXcubGVuZ3RoIC0gMTtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50KCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsR0FBRyxRQUFRLFdBQVcsR0FBRyxvQkFBb0IsaUJBQWlCLGlCQUFpQix1QkFBdUIseUJBQXlCO0FBQ3hJLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQW9DLGFBQWEsMkJBQTJCO0FBRTVFLFNBQVMsK0JBQXFEO0FBQzlELFNBQWdFLGNBQWMsVUFBVSxzQkFBc0IsZ0JBQWdCLHlCQUF5Qix1QkFBdUIsTUFBTSx1QkFBMkM7QUFDL04sU0FBd0IsUUFBUSw0QkFBNEI7QUFDNUQsU0FBUyxpQkFBaUIsc0JBQXNCO0FBQ2hELFNBQW9NLG9CQUFvQixXQUE2QixzQkFBc0Isc0JBQXNCO0FBQ2pTLFNBQVMsY0FBYztBQUN2QixTQUFTLFVBQVUsUUFBUSxZQUFZLGFBQWE7QUFDcEQsU0FBUyxTQUFTLG1CQUFtQixlQUFlO0FBQ3BELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLE9BQU8sZUFBZSxhQUFhO0FBQ3JELFNBQVMsWUFBWSxrQkFBa0I7QUFDdkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIsU0FBc0Isb0JBQW9CO0FBQ2hGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUV0QixPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLGFBQWE7QUFJdEIsTUFBTSxvQ0FBOEQsd0JBQXFDO0FBQUEsRUFV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TUFBTSxjQUFpRTtBQUFBLEVBSXRFLFlBQW9CLE1BQWtELE9BQXlDLE9BQWM7QUFBekc7QUFBa0Q7QUFDckUsUUFBSSxPQUFPO0FBQ1YsV0FBSyxRQUFRLEtBQUssTUFBTSxhQUFhLEtBQUs7QUFBQSxJQUMzQyxPQUFPO0FBQ04sV0FBSyxRQUFRO0FBQUEsSUFDZDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFVBQW9CO0FBQ25CLFFBQUksS0FBSyxRQUFRLEtBQUssS0FBSyxTQUFTLEtBQUssS0FBSyxRQUFRO0FBQ3JELGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxLQUFLLEtBQUssUUFBUSxLQUFLLEtBQUssRUFBRTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxXQUFxQjtBQUNwQixTQUFLO0FBQ0wsV0FBTyxLQUFLLFFBQVE7QUFBQSxFQUNyQjtBQUFBLEVBRUEsT0FBaUI7QUFDaEIsU0FBSztBQUNMLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVBLFFBQWtCO0FBQ2pCLFNBQUssUUFBUTtBQUNiLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVBLE9BQWlCO0FBQ2hCLFNBQUssUUFBUSxLQUFLLEtBQUssU0FBUztBQUNoQyxXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQ0Q7IiwKICAibmFtZXMiOiBbIm1vZGVsIiwgInJlZiIsICJSZW5kZXJJbmRlbnRHdWlkZXMiLCAiVHJlZUZpbmRNb2RlIiwgIlRyZWVGaW5kTWF0Y2hUeXBlIiwgIiQiLCAidG9nZ2xlIiwgIkRlZmF1bHRUcmVlVG9nZ2xlcyIsICJyZW5kZXJlciIsICJzdGlja3lOb2RlIiwgIkFic3RyYWN0VHJlZVBhcnQiXQp9Cg==
