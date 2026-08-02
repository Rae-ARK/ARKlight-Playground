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
import { isActiveElement, isKeyboardEvent } from "../../../base/browser/dom.js";
import { PagedList } from "../../../base/browser/ui/list/listPaging.js";
import { isSelectionRangeChangeEvent, isSelectionSingleChangeEvent, List, TypeNavigationMode } from "../../../base/browser/ui/list/listWidget.js";
import { Table } from "../../../base/browser/ui/table/tableWidget.js";
import { TreeFindMatchType, TreeFindMode } from "../../../base/browser/ui/tree/abstractTree.js";
import { AsyncDataTree, CompressibleAsyncDataTree } from "../../../base/browser/ui/tree/asyncDataTree.js";
import { DataTree } from "../../../base/browser/ui/tree/dataTree.js";
import { CompressibleObjectTree, ObjectTree } from "../../../base/browser/ui/tree/objectTree.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { combinedDisposable, Disposable, DisposableStore, dispose, toDisposable } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../contextkey/common/contextkey.js";
import { InputFocusedContextKey } from "../../contextkey/common/contextkeys.js";
import { IContextViewService } from "../../contextview/browser/contextView.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { ResultKind } from "../../keybinding/common/keybindingResolver.js";
import { Registry } from "../../registry/common/platform.js";
import { defaultFindWidgetStyles, defaultListStyles, getListStyles } from "../../theme/browser/defaultStyles.js";
const IListService = createDecorator("listService");
class ListService {
  constructor() {
    this.disposables = new DisposableStore();
    this.lists = [];
    this._lastFocusedWidget = void 0;
  }
  get lastFocusedList() {
    return this._lastFocusedWidget;
  }
  setLastFocusedList(widget) {
    if (widget === this._lastFocusedWidget) {
      return;
    }
    this._lastFocusedWidget?.getHTMLElement().classList.remove("last-focused");
    this._lastFocusedWidget = widget;
    this._lastFocusedWidget?.getHTMLElement().classList.add("last-focused");
  }
  register(widget, extraContextKeys) {
    if (this.lists.some((l) => l.widget === widget)) {
      throw new Error("Cannot register the same widget multiple times");
    }
    const registeredList = { widget, extraContextKeys };
    this.lists.push(registeredList);
    if (isActiveElement(widget.getHTMLElement())) {
      this.setLastFocusedList(widget);
    }
    return combinedDisposable(
      widget.onDidFocus(() => this.setLastFocusedList(widget)),
      toDisposable(() => this.lists.splice(this.lists.indexOf(registeredList), 1)),
      widget.onDidDispose(() => {
        this.lists = this.lists.filter((l) => l !== registeredList);
        if (this._lastFocusedWidget === widget) {
          this.setLastFocusedList(void 0);
        }
      })
    );
  }
  dispose() {
    this.disposables.dispose();
  }
}
const RawWorkbenchListScrollAtBoundaryContextKey = new RawContextKey("listScrollAtBoundary", "none");
const WorkbenchListScrollAtTopContextKey = ContextKeyExpr.or(
  RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo("top"),
  RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo("both")
);
const WorkbenchListScrollAtBottomContextKey = ContextKeyExpr.or(
  RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo("bottom"),
  RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo("both")
);
const RawWorkbenchListFocusContextKey = new RawContextKey("listFocus", true);
const WorkbenchTreeStickyScrollFocused = new RawContextKey("treestickyScrollFocused", false);
const WorkbenchListSupportsMultiSelectContextKey = new RawContextKey("listSupportsMultiselect", true);
const WorkbenchListFocusContextKey = ContextKeyExpr.and(RawWorkbenchListFocusContextKey, ContextKeyExpr.not(InputFocusedContextKey), WorkbenchTreeStickyScrollFocused.negate());
const WorkbenchListHasSelectionOrFocus = new RawContextKey("listHasSelectionOrFocus", false);
const WorkbenchListDoubleSelection = new RawContextKey("listDoubleSelection", false);
const WorkbenchListMultiSelection = new RawContextKey("listMultiSelection", false);
const WorkbenchListSelectionNavigation = new RawContextKey("listSelectionNavigation", false);
const WorkbenchListSupportsFind = new RawContextKey("listSupportsFind", true);
const WorkbenchTreeElementCanCollapse = new RawContextKey("treeElementCanCollapse", false);
const WorkbenchTreeElementHasParent = new RawContextKey("treeElementHasParent", false);
const WorkbenchTreeElementCanExpand = new RawContextKey("treeElementCanExpand", false);
const WorkbenchTreeElementHasChild = new RawContextKey("treeElementHasChild", false);
const WorkbenchTreeFindOpen = new RawContextKey("treeFindOpen", false);
const WorkbenchListTypeNavigationModeKey = "listTypeNavigationMode";
const WorkbenchListAutomaticKeyboardNavigationLegacyKey = "listAutomaticKeyboardNavigation";
function createScopedContextKeyService(contextKeyService, widget) {
  const result = contextKeyService.createScoped(widget.getHTMLElement());
  RawWorkbenchListFocusContextKey.bindTo(result);
  return result;
}
function createScrollObserver(contextKeyService, widget) {
  const listScrollAt = RawWorkbenchListScrollAtBoundaryContextKey.bindTo(contextKeyService);
  const update = () => {
    const atTop = widget.scrollTop === 0;
    const atBottom = widget.scrollHeight - widget.renderHeight - widget.scrollTop < 1;
    if (atTop && atBottom) {
      listScrollAt.set("both");
    } else if (atTop) {
      listScrollAt.set("top");
    } else if (atBottom) {
      listScrollAt.set("bottom");
    } else {
      listScrollAt.set("none");
    }
  };
  update();
  return widget.onDidScroll(update);
}
const multiSelectModifierSettingKey = "workbench.list.multiSelectModifier";
const openModeSettingKey = "workbench.list.openMode";
const horizontalScrollingKey = "workbench.list.horizontalScrolling";
const defaultFindModeSettingKey = "workbench.list.defaultFindMode";
const typeNavigationModeSettingKey = "workbench.list.typeNavigationMode";
const keyboardNavigationSettingKey = "workbench.list.keyboardNavigation";
const scrollByPageKey = "workbench.list.scrollByPage";
const defaultFindMatchTypeSettingKey = "workbench.list.defaultFindMatchType";
const treeIndentKey = "workbench.tree.indent";
const treeRenderIndentGuidesKey = "workbench.tree.renderIndentGuides";
const listSmoothScrolling = "workbench.list.smoothScrolling";
const mouseWheelScrollSensitivityKey = "workbench.list.mouseWheelScrollSensitivity";
const fastScrollSensitivityKey = "workbench.list.fastScrollSensitivity";
const treeExpandMode = "workbench.tree.expandMode";
const treeStickyScroll = "workbench.tree.enableStickyScroll";
const treeStickyScrollMaxElements = "workbench.tree.stickyScrollMaxItemCount";
function useAltAsMultipleSelectionModifier(configurationService) {
  return configurationService.getValue(multiSelectModifierSettingKey) === "alt";
}
class MultipleSelectionController extends Disposable {
  constructor(configurationService) {
    super();
    this.configurationService = configurationService;
    this.useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
        this.useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(this.configurationService);
      }
    }));
  }
  isSelectionSingleChangeEvent(event) {
    if (this.useAltAsMultipleSelectionModifier) {
      return event.browserEvent.altKey;
    }
    return isSelectionSingleChangeEvent(event);
  }
  isSelectionRangeChangeEvent(event) {
    return isSelectionRangeChangeEvent(event);
  }
}
function toWorkbenchListOptions(accessor, options) {
  const configurationService = accessor.get(IConfigurationService);
  const keybindingService = accessor.get(IKeybindingService);
  const disposables = new DisposableStore();
  const result = {
    ...options,
    keyboardNavigationDelegate: { mightProducePrintableCharacter(e) {
      return keybindingService.mightProducePrintableCharacter(e);
    } },
    smoothScrolling: Boolean(configurationService.getValue(listSmoothScrolling)),
    mouseWheelScrollSensitivity: configurationService.getValue(mouseWheelScrollSensitivityKey),
    fastScrollSensitivity: configurationService.getValue(fastScrollSensitivityKey),
    multipleSelectionController: options.multipleSelectionController ?? disposables.add(new MultipleSelectionController(configurationService)),
    keyboardNavigationEventFilter: createKeyboardNavigationEventFilter(keybindingService),
    scrollByPage: Boolean(configurationService.getValue(scrollByPageKey))
  };
  return [result, disposables];
}
let WorkbenchList = class extends List {
  get onDidOpen() {
    return this.navigator.onDidOpen;
  }
  constructor(user, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
    const horizontalScrolling = typeof options.horizontalScrolling !== "undefined" ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
    const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
    super(
      user,
      container,
      delegate,
      renderers,
      {
        keyboardSupport: false,
        ...workbenchListOptions,
        horizontalScrolling
      }
    );
    this.disposables.add(workbenchListOptionsDisposable);
    this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
    this.disposables.add(createScrollObserver(this.contextKeyService, this));
    this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
    this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
    const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
    listSelectionNavigation.set(Boolean(options.selectionNavigation));
    this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
    this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
    this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
    this.horizontalScrolling = options.horizontalScrolling;
    this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.disposables.add(this.contextKeyService);
    this.disposables.add(listService.register(this));
    this.updateStyles(options.overrideStyles);
    this.disposables.add(this.onDidChangeSelection(() => {
      const selection = this.getSelection();
      const focus = this.getFocus();
      this.contextKeyService.bufferChangeEvents(() => {
        this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
        this.listMultiSelection.set(selection.length > 1);
        this.listDoubleSelection.set(selection.length === 2);
      });
    }));
    this.disposables.add(this.onDidChangeFocus(() => {
      const selection = this.getSelection();
      const focus = this.getFocus();
      this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
    }));
    this.disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
      }
      let options2 = {};
      if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === void 0) {
        const horizontalScrolling2 = Boolean(configurationService.getValue(horizontalScrollingKey));
        options2 = { ...options2, horizontalScrolling: horizontalScrolling2 };
      }
      if (e.affectsConfiguration(scrollByPageKey)) {
        const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
        options2 = { ...options2, scrollByPage };
      }
      if (e.affectsConfiguration(listSmoothScrolling)) {
        const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
        options2 = { ...options2, smoothScrolling };
      }
      if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
        const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
        options2 = { ...options2, mouseWheelScrollSensitivity };
      }
      if (e.affectsConfiguration(fastScrollSensitivityKey)) {
        const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
        options2 = { ...options2, fastScrollSensitivity };
      }
      if (Object.keys(options2).length > 0) {
        this.updateOptions(options2);
      }
    }));
    this.navigator = new ListResourceNavigator(this, { configurationService, ...options });
    this.disposables.add(this.navigator);
  }
  updateOptions(options) {
    super.updateOptions(options);
    if (options.overrideStyles !== void 0) {
      this.updateStyles(options.overrideStyles);
    }
    if (options.multipleSelectionSupport !== void 0) {
      this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
    }
  }
  updateStyles(styles) {
    this.style(styles ? getListStyles(styles) : defaultListStyles);
  }
  get useAltAsMultipleSelectionModifier() {
    return this._useAltAsMultipleSelectionModifier;
  }
};
WorkbenchList = __decorateClass([
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IListService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IInstantiationService)
], WorkbenchList);
let WorkbenchPagedList = class extends PagedList {
  get onDidOpen() {
    return this.navigator.onDidOpen;
  }
  constructor(user, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
    const horizontalScrolling = typeof options.horizontalScrolling !== "undefined" ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
    const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
    super(
      user,
      container,
      delegate,
      renderers,
      {
        keyboardSupport: false,
        ...workbenchListOptions,
        horizontalScrolling
      }
    );
    this.disposables = new DisposableStore();
    this.disposables.add(workbenchListOptionsDisposable);
    this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
    this.disposables.add(createScrollObserver(this.contextKeyService, this.widget));
    this.horizontalScrolling = options.horizontalScrolling;
    this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
    this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
    const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
    listSelectionNavigation.set(Boolean(options.selectionNavigation));
    this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.disposables.add(this.contextKeyService);
    this.disposables.add(listService.register(this));
    this.updateStyles(options.overrideStyles);
    this.disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
      }
      let options2 = {};
      if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === void 0) {
        const horizontalScrolling2 = Boolean(configurationService.getValue(horizontalScrollingKey));
        options2 = { ...options2, horizontalScrolling: horizontalScrolling2 };
      }
      if (e.affectsConfiguration(scrollByPageKey)) {
        const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
        options2 = { ...options2, scrollByPage };
      }
      if (e.affectsConfiguration(listSmoothScrolling)) {
        const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
        options2 = { ...options2, smoothScrolling };
      }
      if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
        const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
        options2 = { ...options2, mouseWheelScrollSensitivity };
      }
      if (e.affectsConfiguration(fastScrollSensitivityKey)) {
        const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
        options2 = { ...options2, fastScrollSensitivity };
      }
      if (Object.keys(options2).length > 0) {
        this.updateOptions(options2);
      }
    }));
    this.navigator = new ListResourceNavigator(this, { configurationService, ...options });
    this.disposables.add(this.navigator);
  }
  updateOptions(options) {
    super.updateOptions(options);
    if (options.overrideStyles !== void 0) {
      this.updateStyles(options.overrideStyles);
    }
    if (options.multipleSelectionSupport !== void 0) {
      this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
    }
  }
  updateStyles(styles) {
    this.style(styles ? getListStyles(styles) : defaultListStyles);
  }
  get useAltAsMultipleSelectionModifier() {
    return this._useAltAsMultipleSelectionModifier;
  }
  dispose() {
    this.disposables.dispose();
    super.dispose();
  }
};
WorkbenchPagedList = __decorateClass([
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IListService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IInstantiationService)
], WorkbenchPagedList);
let WorkbenchTable = class extends Table {
  get onDidOpen() {
    return this.navigator.onDidOpen;
  }
  constructor(user, container, delegate, columns, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
    const horizontalScrolling = typeof options.horizontalScrolling !== "undefined" ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
    const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
    super(
      user,
      container,
      delegate,
      columns,
      renderers,
      {
        keyboardSupport: false,
        ...workbenchListOptions,
        horizontalScrolling
      }
    );
    this.disposables.add(workbenchListOptionsDisposable);
    this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
    this.disposables.add(createScrollObserver(this.contextKeyService, this));
    this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
    this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
    const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
    listSelectionNavigation.set(Boolean(options.selectionNavigation));
    this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
    this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
    this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
    this.horizontalScrolling = options.horizontalScrolling;
    this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.disposables.add(this.contextKeyService);
    this.disposables.add(listService.register(this));
    this.updateStyles(options.overrideStyles);
    this.disposables.add(this.onDidChangeSelection(() => {
      const selection = this.getSelection();
      const focus = this.getFocus();
      this.contextKeyService.bufferChangeEvents(() => {
        this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
        this.listMultiSelection.set(selection.length > 1);
        this.listDoubleSelection.set(selection.length === 2);
      });
    }));
    this.disposables.add(this.onDidChangeFocus(() => {
      const selection = this.getSelection();
      const focus = this.getFocus();
      this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
    }));
    this.disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
      }
      let options2 = {};
      if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === void 0) {
        const horizontalScrolling2 = Boolean(configurationService.getValue(horizontalScrollingKey));
        options2 = { ...options2, horizontalScrolling: horizontalScrolling2 };
      }
      if (e.affectsConfiguration(scrollByPageKey)) {
        const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
        options2 = { ...options2, scrollByPage };
      }
      if (e.affectsConfiguration(listSmoothScrolling)) {
        const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
        options2 = { ...options2, smoothScrolling };
      }
      if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
        const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
        options2 = { ...options2, mouseWheelScrollSensitivity };
      }
      if (e.affectsConfiguration(fastScrollSensitivityKey)) {
        const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
        options2 = { ...options2, fastScrollSensitivity };
      }
      if (Object.keys(options2).length > 0) {
        this.updateOptions(options2);
      }
    }));
    this.navigator = new TableResourceNavigator(this, { configurationService, ...options });
    this.disposables.add(this.navigator);
  }
  updateOptions(options) {
    super.updateOptions(options);
    if (options.overrideStyles !== void 0) {
      this.updateStyles(options.overrideStyles);
    }
    if (options.multipleSelectionSupport !== void 0) {
      this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
    }
  }
  updateStyles(styles) {
    this.style(styles ? getListStyles(styles) : defaultListStyles);
  }
  get useAltAsMultipleSelectionModifier() {
    return this._useAltAsMultipleSelectionModifier;
  }
  dispose() {
    this.disposables.dispose();
    super.dispose();
  }
};
WorkbenchTable = __decorateClass([
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IListService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IInstantiationService)
], WorkbenchTable);
function getSelectionKeyboardEvent(typeArg = "keydown", preserveFocus, pinned) {
  const e = new KeyboardEvent(typeArg);
  e.preserveFocus = preserveFocus;
  e.pinned = pinned;
  e.__forceEvent = true;
  return e;
}
class ResourceNavigator extends Disposable {
  constructor(widget, options) {
    super();
    this.widget = widget;
    this._onDidOpen = this._register(new Emitter());
    this.onDidOpen = this._onDidOpen.event;
    this._register(Event.filter(this.widget.onDidChangeSelection, (e) => isKeyboardEvent(e.browserEvent))((e) => this.onSelectionFromKeyboard(e)));
    this._register(this.widget.onPointer((e) => this.onPointer(e.element, e.browserEvent)));
    this._register(this.widget.onMouseDblClick((e) => this.onMouseDblClick(e.element, e.browserEvent)));
    if (typeof options?.openOnSingleClick !== "boolean" && options?.configurationService) {
      this.openOnSingleClick = options?.configurationService.getValue(openModeSettingKey) !== "doubleClick";
      this._register(options?.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(openModeSettingKey)) {
          this.openOnSingleClick = options?.configurationService.getValue(openModeSettingKey) !== "doubleClick";
        }
      }));
    } else {
      this.openOnSingleClick = options?.openOnSingleClick ?? true;
    }
  }
  onSelectionFromKeyboard(event) {
    if (event.elements.length !== 1) {
      return;
    }
    const selectionKeyboardEvent = event.browserEvent;
    const preserveFocus = typeof selectionKeyboardEvent.preserveFocus === "boolean" ? selectionKeyboardEvent.preserveFocus : true;
    const pinned = typeof selectionKeyboardEvent.pinned === "boolean" ? selectionKeyboardEvent.pinned : !preserveFocus;
    const sideBySide = false;
    this._open(this.getSelectedElement(), preserveFocus, pinned, sideBySide, event.browserEvent);
  }
  onPointer(element, browserEvent) {
    if (!this.openOnSingleClick) {
      return;
    }
    const isDoubleClick = browserEvent.detail === 2;
    if (isDoubleClick) {
      return;
    }
    const isMiddleClick = browserEvent.button === 1;
    const preserveFocus = true;
    const pinned = isMiddleClick;
    const sideBySide = browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey;
    this._open(element, preserveFocus, pinned, sideBySide, browserEvent);
  }
  onMouseDblClick(element, browserEvent) {
    if (!browserEvent) {
      return;
    }
    const target = browserEvent.target;
    const onTwistie = target.classList.contains("monaco-tl-twistie") || target.classList.contains("monaco-icon-label") && target.classList.contains("folder-icon") && browserEvent.offsetX < 16;
    if (onTwistie) {
      return;
    }
    const preserveFocus = false;
    const pinned = true;
    const sideBySide = browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey;
    this._open(element, preserveFocus, pinned, sideBySide, browserEvent);
  }
  _open(element, preserveFocus, pinned, sideBySide, browserEvent) {
    if (!element) {
      return;
    }
    this._onDidOpen.fire({
      editorOptions: {
        preserveFocus,
        pinned,
        revealIfVisible: true
      },
      sideBySide,
      element,
      browserEvent
    });
  }
}
class ListResourceNavigator extends ResourceNavigator {
  constructor(widget, options) {
    super(widget, options);
    this.widget = widget;
  }
  getSelectedElement() {
    return this.widget.getSelectedElements()[0];
  }
}
class TableResourceNavigator extends ResourceNavigator {
  constructor(widget, options) {
    super(widget, options);
  }
  getSelectedElement() {
    return this.widget.getSelectedElements()[0];
  }
}
class TreeResourceNavigator extends ResourceNavigator {
  constructor(widget, options) {
    super(widget, options);
  }
  getSelectedElement() {
    return this.widget.getSelection()[0] ?? void 0;
  }
}
function createKeyboardNavigationEventFilter(keybindingService) {
  let inMultiChord = false;
  return (event) => {
    if (event.toKeyCodeChord().isModifierKey()) {
      return false;
    }
    if (inMultiChord) {
      inMultiChord = false;
      return false;
    }
    const result = keybindingService.softDispatch(event, event.target);
    if (result.kind === ResultKind.MoreChordsNeeded) {
      inMultiChord = true;
      return false;
    }
    inMultiChord = false;
    return result.kind === ResultKind.NoMatchingKb;
  };
}
let WorkbenchObjectTree = class extends ObjectTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, delegate, renderers, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options = {}) {
    super.updateOptions(options);
    if (options.overrideStyles) {
      this.internals.updateStyleOverrides(options.overrideStyles);
    }
    this.internals.updateOptions(options);
  }
};
WorkbenchObjectTree = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IListService),
  __decorateParam(8, IConfigurationService)
], WorkbenchObjectTree);
let WorkbenchCompressibleObjectTree = class extends CompressibleObjectTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, delegate, renderers, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options = {}) {
    super.updateOptions(options);
    if (options.overrideStyles) {
      this.internals.updateStyleOverrides(options.overrideStyles);
    }
    this.internals.updateOptions(options);
  }
};
WorkbenchCompressibleObjectTree = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IListService),
  __decorateParam(8, IConfigurationService)
], WorkbenchCompressibleObjectTree);
let WorkbenchDataTree = class extends DataTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, delegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, delegate, renderers, dataSource, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options = {}) {
    super.updateOptions(options);
    if (options.overrideStyles !== void 0) {
      this.internals.updateStyleOverrides(options.overrideStyles);
    }
    this.internals.updateOptions(options);
  }
};
WorkbenchDataTree = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IListService),
  __decorateParam(9, IConfigurationService)
], WorkbenchDataTree);
let WorkbenchAsyncDataTree = class extends AsyncDataTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, delegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, delegate, renderers, dataSource, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options = {}) {
    super.updateOptions(options);
    if (options.overrideStyles) {
      this.internals.updateStyleOverrides(options.overrideStyles);
    }
    this.internals.updateOptions(options);
  }
};
WorkbenchAsyncDataTree = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IListService),
  __decorateParam(9, IConfigurationService)
], WorkbenchAsyncDataTree);
let WorkbenchCompressibleAsyncDataTree = class extends CompressibleAsyncDataTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options) {
    super.updateOptions(options);
    this.internals.updateOptions(options);
  }
};
WorkbenchCompressibleAsyncDataTree = __decorateClass([
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IListService),
  __decorateParam(10, IConfigurationService)
], WorkbenchCompressibleAsyncDataTree);
function getDefaultTreeFindMode(configurationService) {
  const value = configurationService.getValue(defaultFindModeSettingKey);
  if (value === "highlight") {
    return TreeFindMode.Highlight;
  } else if (value === "filter") {
    return TreeFindMode.Filter;
  }
  const deprecatedValue = configurationService.getValue(keyboardNavigationSettingKey);
  if (deprecatedValue === "simple" || deprecatedValue === "highlight") {
    return TreeFindMode.Highlight;
  } else if (deprecatedValue === "filter") {
    return TreeFindMode.Filter;
  }
  return void 0;
}
function getDefaultTreeFindMatchType(configurationService) {
  const value = configurationService.getValue(defaultFindMatchTypeSettingKey);
  if (value === "fuzzy") {
    return TreeFindMatchType.Fuzzy;
  } else if (value === "contiguous") {
    return TreeFindMatchType.Contiguous;
  }
  return void 0;
}
function workbenchTreeDataPreamble(accessor, options) {
  const configurationService = accessor.get(IConfigurationService);
  const contextViewService = accessor.get(IContextViewService);
  const contextKeyService = accessor.get(IContextKeyService);
  const instantiationService = accessor.get(IInstantiationService);
  const getTypeNavigationMode = () => {
    const modeString = contextKeyService.getContextKeyValue(WorkbenchListTypeNavigationModeKey);
    if (modeString === "automatic") {
      return TypeNavigationMode.Automatic;
    } else if (modeString === "trigger") {
      return TypeNavigationMode.Trigger;
    }
    const modeBoolean = contextKeyService.getContextKeyValue(WorkbenchListAutomaticKeyboardNavigationLegacyKey);
    if (modeBoolean === false) {
      return TypeNavigationMode.Trigger;
    }
    const configString = configurationService.getValue(typeNavigationModeSettingKey);
    if (configString === "automatic") {
      return TypeNavigationMode.Automatic;
    } else if (configString === "trigger") {
      return TypeNavigationMode.Trigger;
    }
    return void 0;
  };
  const horizontalScrolling = options.horizontalScrolling !== void 0 ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
  const [workbenchListOptions, disposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
  const paddingBottom = options.paddingBottom;
  const renderIndentGuides = options.renderIndentGuides !== void 0 ? options.renderIndentGuides : configurationService.getValue(treeRenderIndentGuidesKey);
  return {
    getTypeNavigationMode,
    disposable,
    // eslint-disable-next-line local/code-no-dangerous-type-assertions
    options: {
      // ...options, // TODO@Joao why is this not splatted here?
      keyboardSupport: false,
      ...workbenchListOptions,
      indent: typeof configurationService.getValue(treeIndentKey) === "number" ? configurationService.getValue(treeIndentKey) : void 0,
      renderIndentGuides,
      smoothScrolling: Boolean(configurationService.getValue(listSmoothScrolling)),
      defaultFindMode: options.defaultFindMode ?? getDefaultTreeFindMode(configurationService),
      defaultFindMatchType: options.defaultFindMatchType ?? getDefaultTreeFindMatchType(configurationService),
      horizontalScrolling,
      scrollByPage: Boolean(configurationService.getValue(scrollByPageKey)),
      paddingBottom,
      hideTwistiesOfChildlessElements: options.hideTwistiesOfChildlessElements,
      expandOnlyOnTwistieClick: options.expandOnlyOnTwistieClick ?? configurationService.getValue(treeExpandMode) === "doubleClick",
      contextViewProvider: contextViewService,
      findWidgetStyles: defaultFindWidgetStyles,
      enableStickyScroll: Boolean(configurationService.getValue(treeStickyScroll)),
      stickyScrollMaxItemCount: Number(configurationService.getValue(treeStickyScrollMaxElements))
    }
  };
}
let WorkbenchTreeInternals = class {
  constructor(tree, options, getTypeNavigationMode, overrideStyles, contextKeyService, listService, configurationService) {
    this.tree = tree;
    this.disposables = [];
    this.contextKeyService = createScopedContextKeyService(contextKeyService, tree);
    this.disposables.push(createScrollObserver(this.contextKeyService, tree));
    this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
    this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
    const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
    listSelectionNavigation.set(Boolean(options.selectionNavigation));
    this.listSupportFindWidget = WorkbenchListSupportsFind.bindTo(this.contextKeyService);
    this.listSupportFindWidget.set(options.findWidgetEnabled ?? true);
    this.hasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
    this.hasDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
    this.hasMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
    this.treeElementCanCollapse = WorkbenchTreeElementCanCollapse.bindTo(this.contextKeyService);
    this.treeElementHasParent = WorkbenchTreeElementHasParent.bindTo(this.contextKeyService);
    this.treeElementCanExpand = WorkbenchTreeElementCanExpand.bindTo(this.contextKeyService);
    this.treeElementHasChild = WorkbenchTreeElementHasChild.bindTo(this.contextKeyService);
    this.treeFindOpen = WorkbenchTreeFindOpen.bindTo(this.contextKeyService);
    this.treeStickyScrollFocused = WorkbenchTreeStickyScrollFocused.bindTo(this.contextKeyService);
    this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.updateStyleOverrides(overrideStyles);
    const updateCollapseContextKeys = () => {
      const focus = tree.getFocus()[0];
      if (!focus) {
        return;
      }
      const node = tree.getNode(focus);
      this.treeElementCanCollapse.set(node.collapsible && !node.collapsed);
      this.treeElementHasParent.set(!!tree.getParentElement(focus));
      this.treeElementCanExpand.set(node.collapsible && node.collapsed);
      this.treeElementHasChild.set(!!tree.getFirstElementChild(focus));
    };
    const interestingContextKeys = /* @__PURE__ */ new Set();
    interestingContextKeys.add(WorkbenchListTypeNavigationModeKey);
    interestingContextKeys.add(WorkbenchListAutomaticKeyboardNavigationLegacyKey);
    this.disposables.push(
      this.contextKeyService,
      listService.register(tree),
      tree.onDidChangeSelection(() => {
        const selection = tree.getSelection();
        const focus = tree.getFocus();
        this.contextKeyService.bufferChangeEvents(() => {
          this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
          this.hasMultiSelection.set(selection.length > 1);
          this.hasDoubleSelection.set(selection.length === 2);
        });
      }),
      tree.onDidChangeFocus(() => {
        const selection = tree.getSelection();
        const focus = tree.getFocus();
        this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
        updateCollapseContextKeys();
      }),
      tree.onDidChangeCollapseState(updateCollapseContextKeys),
      tree.onDidChangeModel(updateCollapseContextKeys),
      tree.onDidChangeFindOpenState((enabled) => this.treeFindOpen.set(enabled)),
      tree.onDidChangeStickyScrollFocused((focused) => this.treeStickyScrollFocused.set(focused)),
      configurationService.onDidChangeConfiguration((e) => {
        let newOptions = {};
        if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
          this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
        }
        if (e.affectsConfiguration(treeIndentKey)) {
          const indent = configurationService.getValue(treeIndentKey);
          newOptions = { ...newOptions, indent };
        }
        if (e.affectsConfiguration(treeRenderIndentGuidesKey) && options.renderIndentGuides === void 0) {
          const renderIndentGuides = configurationService.getValue(treeRenderIndentGuidesKey);
          newOptions = { ...newOptions, renderIndentGuides };
        }
        if (e.affectsConfiguration(listSmoothScrolling)) {
          const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
          newOptions = { ...newOptions, smoothScrolling };
        }
        if (e.affectsConfiguration(defaultFindModeSettingKey) || e.affectsConfiguration(keyboardNavigationSettingKey)) {
          const defaultFindMode = getDefaultTreeFindMode(configurationService);
          newOptions = { ...newOptions, defaultFindMode };
        }
        if (e.affectsConfiguration(typeNavigationModeSettingKey) || e.affectsConfiguration(keyboardNavigationSettingKey)) {
          const typeNavigationMode = getTypeNavigationMode();
          newOptions = { ...newOptions, typeNavigationMode };
        }
        if (e.affectsConfiguration(defaultFindMatchTypeSettingKey)) {
          const defaultFindMatchType = getDefaultTreeFindMatchType(configurationService);
          newOptions = { ...newOptions, defaultFindMatchType };
        }
        if (e.affectsConfiguration(horizontalScrollingKey) && options.horizontalScrolling === void 0) {
          const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
          newOptions = { ...newOptions, horizontalScrolling };
        }
        if (e.affectsConfiguration(scrollByPageKey)) {
          const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
          newOptions = { ...newOptions, scrollByPage };
        }
        if (e.affectsConfiguration(treeExpandMode) && options.expandOnlyOnTwistieClick === void 0) {
          newOptions = { ...newOptions, expandOnlyOnTwistieClick: configurationService.getValue(treeExpandMode) === "doubleClick" };
        }
        if (e.affectsConfiguration(treeStickyScroll)) {
          const enableStickyScroll = configurationService.getValue(treeStickyScroll);
          newOptions = { ...newOptions, enableStickyScroll };
        }
        if (e.affectsConfiguration(treeStickyScrollMaxElements)) {
          const stickyScrollMaxItemCount = Math.max(1, configurationService.getValue(treeStickyScrollMaxElements));
          newOptions = { ...newOptions, stickyScrollMaxItemCount };
        }
        if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
          const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
          newOptions = { ...newOptions, mouseWheelScrollSensitivity };
        }
        if (e.affectsConfiguration(fastScrollSensitivityKey)) {
          const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
          newOptions = { ...newOptions, fastScrollSensitivity };
        }
        if (Object.keys(newOptions).length > 0) {
          tree.updateOptions(newOptions);
        }
      }),
      this.contextKeyService.onDidChangeContext((e) => {
        if (e.affectsSome(interestingContextKeys)) {
          tree.updateOptions({ typeNavigationMode: getTypeNavigationMode() });
        }
      })
    );
    this.navigator = new TreeResourceNavigator(tree, { configurationService, ...options });
    this.disposables.push(this.navigator);
  }
  get onDidOpen() {
    return this.navigator.onDidOpen;
  }
  get useAltAsMultipleSelectionModifier() {
    return this._useAltAsMultipleSelectionModifier;
  }
  updateOptions(options) {
    if (options.multipleSelectionSupport !== void 0) {
      this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
    }
  }
  updateStyleOverrides(overrideStyles) {
    this.tree.style(overrideStyles ? getListStyles(overrideStyles) : defaultListStyles);
  }
  dispose() {
    this.disposables = dispose(this.disposables);
  }
};
WorkbenchTreeInternals = __decorateClass([
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IListService),
  __decorateParam(6, IConfigurationService)
], WorkbenchTreeInternals);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "workbench",
  order: 7,
  title: localize("workbenchConfigurationTitle", "Workbench"),
  type: "object",
  properties: {
    [multiSelectModifierSettingKey]: {
      type: "string",
      enum: ["ctrlCmd", "alt"],
      markdownEnumDescriptions: [
        localize("multiSelectModifier.ctrlCmd", "Maps to `Control` on Windows and Linux and to `Command` on macOS."),
        localize("multiSelectModifier.alt", "Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
      ],
      default: "ctrlCmd",
      description: localize({
        key: "multiSelectModifier",
        comment: [
          "- `ctrlCmd` refers to a value the setting can take and should not be localized.",
          "- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized."
        ]
      }, "The modifier to be used to add an item in trees and lists to a multi-selection with the mouse (for example in the explorer, open editors and scm view). The 'Open to Side' mouse gestures - if supported - will adapt such that they do not conflict with the multiselect modifier.")
    },
    [openModeSettingKey]: {
      type: "string",
      enum: ["singleClick", "doubleClick"],
      default: "singleClick",
      description: localize({
        key: "openModeModifier",
        comment: ["`singleClick` and `doubleClick` refers to a value the setting can take and should not be localized."]
      }, "Controls how to open items in trees and lists using the mouse (if supported). Note that some trees and lists might choose to ignore this setting if it is not applicable.")
    },
    [horizontalScrollingKey]: {
      type: "boolean",
      default: false,
      description: localize("horizontalScrolling setting", "Controls whether lists and trees support horizontal scrolling in the workbench. Warning: turning on this setting has a performance implication.")
    },
    [scrollByPageKey]: {
      type: "boolean",
      default: false,
      description: localize("list.scrollByPage", "Controls whether clicks in the scrollbar scroll page by page.")
    },
    [treeIndentKey]: {
      type: "number",
      default: 8,
      minimum: 4,
      maximum: 40,
      description: localize("tree indent setting", "Controls tree indentation in pixels.")
    },
    [treeRenderIndentGuidesKey]: {
      type: "string",
      enum: ["none", "onHover", "always"],
      default: "onHover",
      description: localize("render tree indent guides", "Controls whether the tree should render indent guides.")
    },
    [listSmoothScrolling]: {
      type: "boolean",
      default: false,
      description: localize("list smoothScrolling setting", "Controls whether lists and trees have smooth scrolling.")
    },
    [mouseWheelScrollSensitivityKey]: {
      type: "number",
      default: 1,
      markdownDescription: localize("Mouse Wheel Scroll Sensitivity", "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.")
    },
    [fastScrollSensitivityKey]: {
      type: "number",
      default: 5,
      markdownDescription: localize("Fast Scroll Sensitivity", "Scrolling speed multiplier when pressing `Alt`.")
    },
    [defaultFindModeSettingKey]: {
      type: "string",
      enum: ["highlight", "filter"],
      enumDescriptions: [
        localize("defaultFindModeSettingKey.highlight", "Highlight elements when searching. Further up and down navigation will traverse only the highlighted elements."),
        localize("defaultFindModeSettingKey.filter", "Filter elements when searching.")
      ],
      default: "highlight",
      description: localize("defaultFindModeSettingKey", "Controls the default find mode for lists and trees in the workbench.")
    },
    [keyboardNavigationSettingKey]: {
      type: "string",
      enum: ["simple", "highlight", "filter"],
      enumDescriptions: [
        localize("keyboardNavigationSettingKey.simple", "Simple keyboard navigation focuses elements which match the keyboard input. Matching is done only on prefixes."),
        localize("keyboardNavigationSettingKey.highlight", "Highlight keyboard navigation highlights elements which match the keyboard input. Further up and down navigation will traverse only the highlighted elements."),
        localize("keyboardNavigationSettingKey.filter", "Filter keyboard navigation will filter out and hide all the elements which do not match the keyboard input.")
      ],
      default: "highlight",
      description: localize("keyboardNavigationSettingKey", "Controls the keyboard navigation style for lists and trees in the workbench. Can be simple, highlight and filter."),
      deprecated: true,
      deprecationMessage: localize("keyboardNavigationSettingKeyDeprecated", "Please use 'workbench.list.defaultFindMode' and	'workbench.list.typeNavigationMode' instead.")
    },
    [defaultFindMatchTypeSettingKey]: {
      type: "string",
      enum: ["fuzzy", "contiguous"],
      enumDescriptions: [
        localize("defaultFindMatchTypeSettingKey.fuzzy", "Use fuzzy matching when searching."),
        localize("defaultFindMatchTypeSettingKey.contiguous", "Use contiguous matching when searching.")
      ],
      default: "fuzzy",
      description: localize("defaultFindMatchTypeSettingKey", "Controls the type of matching used when searching lists and trees in the workbench.")
    },
    [treeExpandMode]: {
      type: "string",
      enum: ["singleClick", "doubleClick"],
      default: "singleClick",
      description: localize("expand mode", "Controls how tree folders are expanded when clicking the folder names. Note that some trees and lists might choose to ignore this setting if it is not applicable.")
    },
    [treeStickyScroll]: {
      type: "boolean",
      default: true,
      description: localize("sticky scroll", "Controls whether sticky scrolling is enabled in trees.")
    },
    [treeStickyScrollMaxElements]: {
      type: "number",
      minimum: 1,
      default: 7,
      markdownDescription: localize("sticky scroll maximum items", "Controls the number of sticky elements displayed in the tree when {0} is enabled.", "`#workbench.tree.enableStickyScroll#`")
    },
    [typeNavigationModeSettingKey]: {
      type: "string",
      enum: ["automatic", "trigger"],
      default: "automatic",
      markdownDescription: localize("typeNavigationMode2", "Controls how type navigation works in lists and trees in the workbench. When set to `trigger`, type navigation begins once the `list.triggerTypeNavigation` command is run.")
    }
  }
});
export {
  IListService,
  ListService,
  RawWorkbenchListFocusContextKey,
  RawWorkbenchListScrollAtBoundaryContextKey,
  WorkbenchAsyncDataTree,
  WorkbenchCompressibleAsyncDataTree,
  WorkbenchCompressibleObjectTree,
  WorkbenchDataTree,
  WorkbenchList,
  WorkbenchListDoubleSelection,
  WorkbenchListFocusContextKey,
  WorkbenchListHasSelectionOrFocus,
  WorkbenchListMultiSelection,
  WorkbenchListScrollAtBottomContextKey,
  WorkbenchListScrollAtTopContextKey,
  WorkbenchListSelectionNavigation,
  WorkbenchListSupportsFind,
  WorkbenchListSupportsMultiSelectContextKey,
  WorkbenchObjectTree,
  WorkbenchPagedList,
  WorkbenchTable,
  WorkbenchTreeElementCanCollapse,
  WorkbenchTreeElementCanExpand,
  WorkbenchTreeElementHasChild,
  WorkbenchTreeElementHasParent,
  WorkbenchTreeFindOpen,
  WorkbenchTreeStickyScrollFocused,
  getSelectionKeyboardEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzQWN0aXZlRWxlbWVudCwgaXNLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBJTGlzdE1vdXNlRXZlbnQsIElMaXN0UmVuZGVyZXIsIElMaXN0VG91Y2hFdmVudCwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElQYWdlZExpc3RPcHRpb25zLCBJUGFnZWRSZW5kZXJlciwgUGFnZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFBhZ2luZy5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmROYXZpZ2F0aW9uRXZlbnRGaWx0ZXIsIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBJTGlzdE9wdGlvbnMsIElMaXN0T3B0aW9uc1VwZGF0ZSwgSUxpc3RTdHlsZXMsIElNdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIsIGlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudCwgaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudCwgTGlzdCwgVHlwZU5hdmlnYXRpb25Nb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVGFibGVDb2x1bW4sIElUYWJsZVJlbmRlcmVyLCBJVGFibGVWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdGFibGUvdGFibGUuanMnO1xuaW1wb3J0IHsgSVRhYmxlT3B0aW9ucywgSVRhYmxlT3B0aW9uc1VwZGF0ZSwgSVRhYmxlU3R5bGVzLCBUYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZVdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWJzdHJhY3RUcmVlT3B0aW9ucywgSUFic3RyYWN0VHJlZU9wdGlvbnNVcGRhdGUsIFJlbmRlckluZGVudEd1aWRlcywgVHJlZUZpbmRNYXRjaFR5cGUsIFRyZWVGaW5kTW9kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2Fic3RyYWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBBc3luY0RhdGFUcmVlLCBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlLCBJQXN5bmNEYXRhVHJlZU5vZGUsIElBc3luY0RhdGFUcmVlT3B0aW9ucywgSUFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlLCBJQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU9wdGlvbnMsIElDb21wcmVzc2libGVBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZSwgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYXN5bmNEYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBEYXRhVHJlZSwgSURhdGFUcmVlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2RhdGFUcmVlLmpzJztcbmltcG9ydCB7IENvbXByZXNzaWJsZU9iamVjdFRyZWUsIElDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9ucywgSUNvbXByZXNzaWJsZU9iamVjdFRyZWVPcHRpb25zVXBkYXRlLCBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyLCBJT2JqZWN0VHJlZU9wdGlvbnMsIE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElEYXRhU291cmNlLCBJVHJlZUV2ZW50LCBJVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJbnB1dEZvY3VzZWRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGRlZmF1bHRGaW5kV2lkZ2V0U3R5bGVzLCBkZWZhdWx0TGlzdFN0eWxlcywgZ2V0TGlzdFN0eWxlcywgSVN0eWxlT3ZlcnJpZGUgfSBmcm9tICcuLi8uLi90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuXG5leHBvcnQgdHlwZSBMaXN0V2lkZ2V0ID0gTGlzdDxhbnk+IHwgUGFnZWRMaXN0PGFueT4gfCBPYmplY3RUcmVlPGFueSwgYW55PiB8IERhdGFUcmVlPGFueSwgYW55LCBhbnk+IHwgQXN5bmNEYXRhVHJlZTxhbnksIGFueSwgYW55PiB8IFRhYmxlPGFueT47XG5leHBvcnQgdHlwZSBXb3JrYmVuY2hMaXN0V2lkZ2V0ID0gV29ya2JlbmNoTGlzdDxhbnk+IHwgV29ya2JlbmNoUGFnZWRMaXN0PGFueT4gfCBXb3JrYmVuY2hPYmplY3RUcmVlPGFueSwgYW55PiB8IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8YW55LCBhbnk+IHwgV29ya2JlbmNoRGF0YVRyZWU8YW55LCBhbnksIGFueT4gfCBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPGFueSwgYW55LCBhbnk+IHwgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxhbnksIGFueSwgYW55PiB8IFdvcmtiZW5jaFRhYmxlPGFueT47XG5cbmV4cG9ydCBjb25zdCBJTGlzdFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxpc3RTZXJ2aWNlPignbGlzdFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJTGlzdFNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgY3VycmVudGx5IGZvY3VzZWQgbGlzdCB3aWRnZXQgaWYgYW55LlxuXHQgKi9cblx0cmVhZG9ubHkgbGFzdEZvY3VzZWRMaXN0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0IHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSVJlZ2lzdGVyZWRMaXN0IHtcblx0d2lkZ2V0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0O1xuXHRleHRyYUNvbnRleHRLZXlzPzogKElDb250ZXh0S2V5PGJvb2xlYW4+KVtdO1xufVxuXG5leHBvcnQgY2xhc3MgTGlzdFNlcnZpY2UgaW1wbGVtZW50cyBJTGlzdFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgbGlzdHM6IElSZWdpc3RlcmVkTGlzdFtdID0gW107XG5cdHByaXZhdGUgX2xhc3RGb2N1c2VkV2lkZ2V0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGdldCBsYXN0Rm9jdXNlZExpc3QoKTogV29ya2JlbmNoTGlzdFdpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RGb2N1c2VkV2lkZ2V0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoKSB7IH1cblxuXHRwcml2YXRlIHNldExhc3RGb2N1c2VkTGlzdCh3aWRnZXQ6IFdvcmtiZW5jaExpc3RXaWRnZXQgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAod2lkZ2V0ID09PSB0aGlzLl9sYXN0Rm9jdXNlZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RGb2N1c2VkV2lkZ2V0Py5nZXRIVE1MRWxlbWVudCgpLmNsYXNzTGlzdC5yZW1vdmUoJ2xhc3QtZm9jdXNlZCcpO1xuXHRcdHRoaXMuX2xhc3RGb2N1c2VkV2lkZ2V0ID0gd2lkZ2V0O1xuXHRcdHRoaXMuX2xhc3RGb2N1c2VkV2lkZ2V0Py5nZXRIVE1MRWxlbWVudCgpLmNsYXNzTGlzdC5hZGQoJ2xhc3QtZm9jdXNlZCcpO1xuXHR9XG5cblx0cmVnaXN0ZXIod2lkZ2V0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0LCBleHRyYUNvbnRleHRLZXlzPzogKElDb250ZXh0S2V5PGJvb2xlYW4+KVtdKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLmxpc3RzLnNvbWUobCA9PiBsLndpZGdldCA9PT0gd2lkZ2V0KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcmVnaXN0ZXIgdGhlIHNhbWUgd2lkZ2V0IG11bHRpcGxlIHRpbWVzJyk7XG5cdFx0fVxuXG5cdFx0Ly8gS2VlcCBpbiBvdXIgbGlzdHMgbGlzdFxuXHRcdGNvbnN0IHJlZ2lzdGVyZWRMaXN0OiBJUmVnaXN0ZXJlZExpc3QgPSB7IHdpZGdldCwgZXh0cmFDb250ZXh0S2V5cyB9O1xuXHRcdHRoaXMubGlzdHMucHVzaChyZWdpc3RlcmVkTGlzdCk7XG5cblx0XHQvLyBDaGVjayBmb3IgY3VycmVudGx5IGJlaW5nIGZvY3VzZWRcblx0XHRpZiAoaXNBY3RpdmVFbGVtZW50KHdpZGdldC5nZXRIVE1MRWxlbWVudCgpKSkge1xuXHRcdFx0dGhpcy5zZXRMYXN0Rm9jdXNlZExpc3Qod2lkZ2V0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0d2lkZ2V0Lm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5zZXRMYXN0Rm9jdXNlZExpc3Qod2lkZ2V0KSksXG5cdFx0XHR0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5saXN0cy5zcGxpY2UodGhpcy5saXN0cy5pbmRleE9mKHJlZ2lzdGVyZWRMaXN0KSwgMSkpLFxuXHRcdFx0d2lkZ2V0Lm9uRGlkRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMubGlzdHMgPSB0aGlzLmxpc3RzLmZpbHRlcihsID0+IGwgIT09IHJlZ2lzdGVyZWRMaXN0KTtcblx0XHRcdFx0aWYgKHRoaXMuX2xhc3RGb2N1c2VkV2lkZ2V0ID09PSB3aWRnZXQpIHtcblx0XHRcdFx0XHR0aGlzLnNldExhc3RGb2N1c2VkTGlzdCh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBSYXdXb3JrYmVuY2hMaXN0U2Nyb2xsQXRCb3VuZGFyeUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTwnbm9uZScgfCAndG9wJyB8ICdib3R0b20nIHwgJ2JvdGgnPignbGlzdFNjcm9sbEF0Qm91bmRhcnknLCAnbm9uZScpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaExpc3RTY3JvbGxBdFRvcENvbnRleHRLZXkgPSBDb250ZXh0S2V5RXhwci5vcihcblx0UmF3V29ya2JlbmNoTGlzdFNjcm9sbEF0Qm91bmRhcnlDb250ZXh0S2V5LmlzRXF1YWxUbygndG9wJyksXG5cdFJhd1dvcmtiZW5jaExpc3RTY3JvbGxBdEJvdW5kYXJ5Q29udGV4dEtleS5pc0VxdWFsVG8oJ2JvdGgnKSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoTGlzdFNjcm9sbEF0Qm90dG9tQ29udGV4dEtleSA9IENvbnRleHRLZXlFeHByLm9yKFxuXHRSYXdXb3JrYmVuY2hMaXN0U2Nyb2xsQXRCb3VuZGFyeUNvbnRleHRLZXkuaXNFcXVhbFRvKCdib3R0b20nKSxcblx0UmF3V29ya2JlbmNoTGlzdFNjcm9sbEF0Qm91bmRhcnlDb250ZXh0S2V5LmlzRXF1YWxUbygnYm90aCcpKTtcblxuZXhwb3J0IGNvbnN0IFJhd1dvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignbGlzdEZvY3VzJywgdHJ1ZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoVHJlZVN0aWNreVNjcm9sbEZvY3VzZWQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndHJlZXN0aWNreVNjcm9sbEZvY3VzZWQnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoTGlzdFN1cHBvcnRzTXVsdGlTZWxlY3RDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2xpc3RTdXBwb3J0c011bHRpc2VsZWN0JywgdHJ1ZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSA9IENvbnRleHRLZXlFeHByLmFuZChSYXdXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSksIFdvcmtiZW5jaFRyZWVTdGlja3lTY3JvbGxGb2N1c2VkLm5lZ2F0ZSgpKTtcbmV4cG9ydCBjb25zdCBXb3JrYmVuY2hMaXN0SGFzU2VsZWN0aW9uT3JGb2N1cyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdsaXN0SGFzU2VsZWN0aW9uT3JGb2N1cycsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2xpc3REb3VibGVTZWxlY3Rpb24nLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoTGlzdE11bHRpU2VsZWN0aW9uID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2xpc3RNdWx0aVNlbGVjdGlvbicsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBXb3JrYmVuY2hMaXN0U2VsZWN0aW9uTmF2aWdhdGlvbiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdsaXN0U2VsZWN0aW9uTmF2aWdhdGlvbicsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBXb3JrYmVuY2hMaXN0U3VwcG9ydHNGaW5kID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2xpc3RTdXBwb3J0c0ZpbmQnLCB0cnVlKTtcbmV4cG9ydCBjb25zdCBXb3JrYmVuY2hUcmVlRWxlbWVudENhbkNvbGxhcHNlID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3RyZWVFbGVtZW50Q2FuQ29sbGFwc2UnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoVHJlZUVsZW1lbnRIYXNQYXJlbnQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndHJlZUVsZW1lbnRIYXNQYXJlbnQnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5FeHBhbmQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndHJlZUVsZW1lbnRDYW5FeHBhbmQnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoVHJlZUVsZW1lbnRIYXNDaGlsZCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd0cmVlRWxlbWVudEhhc0NoaWxkJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaFRyZWVGaW5kT3BlbiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd0cmVlRmluZE9wZW4nLCBmYWxzZSk7XG5jb25zdCBXb3JrYmVuY2hMaXN0VHlwZU5hdmlnYXRpb25Nb2RlS2V5ID0gJ2xpc3RUeXBlTmF2aWdhdGlvbk1vZGUnO1xuXG4vKipcbiAqIEBkZXByZWNhdGVkIGluIGZhdm9yIG9mIFdvcmtiZW5jaExpc3RUeXBlTmF2aWdhdGlvbk1vZGVLZXlcbiAqL1xuY29uc3QgV29ya2JlbmNoTGlzdEF1dG9tYXRpY0tleWJvYXJkTmF2aWdhdGlvbkxlZ2FjeUtleSA9ICdsaXN0QXV0b21hdGljS2V5Ym9hcmROYXZpZ2F0aW9uJztcblxuZnVuY3Rpb24gY3JlYXRlU2NvcGVkQ29udGV4dEtleVNlcnZpY2UoY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgd2lkZ2V0OiBMaXN0V2lkZ2V0KTogSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlIHtcblx0Y29uc3QgcmVzdWx0ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHdpZGdldC5nZXRIVE1MRWxlbWVudCgpKTtcblx0UmF3V29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleS5iaW5kVG8ocmVzdWx0KTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLy8gTm90ZTogV2UgbXVzdCBkZWNsYXJlIElTY3JvbGxPYnNlcnZhcmFibGUgYXMgdGhlIGFyaXRobWV0aWMgb2YgY29uY3JldGUgY2xhc3Nlcyxcbi8vIGluc3RlYWQgb2Ygb2JqZWN0IHR5cGUgbGlrZSB7IG9uRGlkU2Nyb2xsOiBFdmVudDxhbnk+OyAuLi4gfS4gVGhlIGxhdHRlciB3aWxsIG5vdCBtYXJrXG4vLyB0aG9zZSBwcm9wZXJ0aWVzIGFzIHJlZmVyZW5jZWQgZHVyaW5nIHRyZWUtc2hha2luZywgY2F1c2luZyB0aGVtIHRvIGJlIHNoYWtlZCBhd2F5LlxudHlwZSBJU2Nyb2xsT2JzZXJ2YXJhYmxlID0gRXhjbHVkZTxXb3JrYmVuY2hMaXN0V2lkZ2V0LCBXb3JrYmVuY2hQYWdlZExpc3Q8YW55Pj4gfCBMaXN0PGFueT47XG5cbmZ1bmN0aW9uIGNyZWF0ZVNjcm9sbE9ic2VydmVyKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIHdpZGdldDogSVNjcm9sbE9ic2VydmFyYWJsZSk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGlzdFNjcm9sbEF0ID0gUmF3V29ya2JlbmNoTGlzdFNjcm9sbEF0Qm91bmRhcnlDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdGNvbnN0IHVwZGF0ZSA9ICgpID0+IHtcblx0XHRjb25zdCBhdFRvcCA9IHdpZGdldC5zY3JvbGxUb3AgPT09IDA7XG5cblx0XHQvLyBXZSBuZWVkIGEgdGhyZXNob2xkIGAxYCBzaW5jZSBzY3JvbGxIZWlnaHQgaXMgcm91bmRlZC5cblx0XHQvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvRWxlbWVudC9zY3JvbGxIZWlnaHQjZGV0ZXJtaW5lX2lmX2FuX2VsZW1lbnRfaGFzX2JlZW5fdG90YWxseV9zY3JvbGxlZFxuXHRcdGNvbnN0IGF0Qm90dG9tID0gd2lkZ2V0LnNjcm9sbEhlaWdodCAtIHdpZGdldC5yZW5kZXJIZWlnaHQgLSB3aWRnZXQuc2Nyb2xsVG9wIDwgMTtcblx0XHRpZiAoYXRUb3AgJiYgYXRCb3R0b20pIHtcblx0XHRcdGxpc3RTY3JvbGxBdC5zZXQoJ2JvdGgnKTtcblx0XHR9IGVsc2UgaWYgKGF0VG9wKSB7XG5cdFx0XHRsaXN0U2Nyb2xsQXQuc2V0KCd0b3AnKTtcblx0XHR9IGVsc2UgaWYgKGF0Qm90dG9tKSB7XG5cdFx0XHRsaXN0U2Nyb2xsQXQuc2V0KCdib3R0b20nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGlzdFNjcm9sbEF0LnNldCgnbm9uZScpO1xuXHRcdH1cblx0fTtcblx0dXBkYXRlKCk7XG5cdHJldHVybiB3aWRnZXQub25EaWRTY3JvbGwodXBkYXRlKTtcbn1cblxuY29uc3QgbXVsdGlTZWxlY3RNb2RpZmllclNldHRpbmdLZXkgPSAnd29ya2JlbmNoLmxpc3QubXVsdGlTZWxlY3RNb2RpZmllcic7XG5jb25zdCBvcGVuTW9kZVNldHRpbmdLZXkgPSAnd29ya2JlbmNoLmxpc3Qub3Blbk1vZGUnO1xuY29uc3QgaG9yaXpvbnRhbFNjcm9sbGluZ0tleSA9ICd3b3JrYmVuY2gubGlzdC5ob3Jpem9udGFsU2Nyb2xsaW5nJztcbmNvbnN0IGRlZmF1bHRGaW5kTW9kZVNldHRpbmdLZXkgPSAnd29ya2JlbmNoLmxpc3QuZGVmYXVsdEZpbmRNb2RlJztcbmNvbnN0IHR5cGVOYXZpZ2F0aW9uTW9kZVNldHRpbmdLZXkgPSAnd29ya2JlbmNoLmxpc3QudHlwZU5hdmlnYXRpb25Nb2RlJztcbi8qKiBAZGVwcmVjYXRlZCBpbiBmYXZvciBvZiBgd29ya2JlbmNoLmxpc3QuZGVmYXVsdEZpbmRNb2RlYCBhbmQgYHdvcmtiZW5jaC5saXN0LnR5cGVOYXZpZ2F0aW9uTW9kZWAgKi9cbmNvbnN0IGtleWJvYXJkTmF2aWdhdGlvblNldHRpbmdLZXkgPSAnd29ya2JlbmNoLmxpc3Qua2V5Ym9hcmROYXZpZ2F0aW9uJztcbmNvbnN0IHNjcm9sbEJ5UGFnZUtleSA9ICd3b3JrYmVuY2gubGlzdC5zY3JvbGxCeVBhZ2UnO1xuY29uc3QgZGVmYXVsdEZpbmRNYXRjaFR5cGVTZXR0aW5nS2V5ID0gJ3dvcmtiZW5jaC5saXN0LmRlZmF1bHRGaW5kTWF0Y2hUeXBlJztcbmNvbnN0IHRyZWVJbmRlbnRLZXkgPSAnd29ya2JlbmNoLnRyZWUuaW5kZW50JztcbmNvbnN0IHRyZWVSZW5kZXJJbmRlbnRHdWlkZXNLZXkgPSAnd29ya2JlbmNoLnRyZWUucmVuZGVySW5kZW50R3VpZGVzJztcbmNvbnN0IGxpc3RTbW9vdGhTY3JvbGxpbmcgPSAnd29ya2JlbmNoLmxpc3Quc21vb3RoU2Nyb2xsaW5nJztcbmNvbnN0IG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eUtleSA9ICd3b3JrYmVuY2gubGlzdC5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHknO1xuY29uc3QgZmFzdFNjcm9sbFNlbnNpdGl2aXR5S2V5ID0gJ3dvcmtiZW5jaC5saXN0LmZhc3RTY3JvbGxTZW5zaXRpdml0eSc7XG5jb25zdCB0cmVlRXhwYW5kTW9kZSA9ICd3b3JrYmVuY2gudHJlZS5leHBhbmRNb2RlJztcbmNvbnN0IHRyZWVTdGlja3lTY3JvbGwgPSAnd29ya2JlbmNoLnRyZWUuZW5hYmxlU3RpY2t5U2Nyb2xsJztcbmNvbnN0IHRyZWVTdGlja3lTY3JvbGxNYXhFbGVtZW50cyA9ICd3b3JrYmVuY2gudHJlZS5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQnO1xuXG5mdW5jdGlvbiB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUobXVsdGlTZWxlY3RNb2RpZmllclNldHRpbmdLZXkpID09PSAnYWx0Jztcbn1cblxuY2xhc3MgTXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyPFQ+IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI8VD4ge1xuXHRwcml2YXRlIHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIgPSB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKG11bHRpU2VsZWN0TW9kaWZpZXJTZXR0aW5nS2V5KSkge1xuXHRcdFx0XHR0aGlzLnVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllciA9IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRpc1NlbGVjdGlvblNpbmdsZUNoYW5nZUV2ZW50KGV2ZW50OiBJTGlzdE1vdXNlRXZlbnQ8VD4gfCBJTGlzdFRvdWNoRXZlbnQ8VD4pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy51c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIpIHtcblx0XHRcdHJldHVybiBldmVudC5icm93c2VyRXZlbnQuYWx0S2V5O1xuXHRcdH1cblxuXHRcdHJldHVybiBpc1NlbGVjdGlvblNpbmdsZUNoYW5nZUV2ZW50KGV2ZW50KTtcblx0fVxuXG5cdGlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudChldmVudDogSUxpc3RNb3VzZUV2ZW50PFQ+IHwgSUxpc3RUb3VjaEV2ZW50PFQ+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudChldmVudCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9Xb3JrYmVuY2hMaXN0T3B0aW9uczxUPihcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdG9wdGlvbnM6IElMaXN0T3B0aW9uczxUPixcbik6IFtJTGlzdE9wdGlvbnM8VD4sIElEaXNwb3NhYmxlXSB7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHJlc3VsdDogSUxpc3RPcHRpb25zPFQ+ID0ge1xuXHRcdC4uLm9wdGlvbnMsXG5cdFx0a2V5Ym9hcmROYXZpZ2F0aW9uRGVsZWdhdGU6IHsgbWlnaHRQcm9kdWNlUHJpbnRhYmxlQ2hhcmFjdGVyKGUpIHsgcmV0dXJuIGtleWJpbmRpbmdTZXJ2aWNlLm1pZ2h0UHJvZHVjZVByaW50YWJsZUNoYXJhY3RlcihlKTsgfSB9LFxuXHRcdHNtb290aFNjcm9sbGluZzogQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShsaXN0U21vb3RoU2Nyb2xsaW5nKSksXG5cdFx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eUtleSksXG5cdFx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KGZhc3RTY3JvbGxTZW5zaXRpdml0eUtleSksXG5cdFx0bXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyOiBvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlciA/PyBkaXNwb3NhYmxlcy5hZGQobmV3IE11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcihjb25maWd1cmF0aW9uU2VydmljZSkpLFxuXHRcdGtleWJvYXJkTmF2aWdhdGlvbkV2ZW50RmlsdGVyOiBjcmVhdGVLZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlcihrZXliaW5kaW5nU2VydmljZSksXG5cdFx0c2Nyb2xsQnlQYWdlOiBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHNjcm9sbEJ5UGFnZUtleSkpXG5cdH07XG5cblx0cmV0dXJuIFtyZXN1bHQsIGRpc3Bvc2FibGVzXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoTGlzdE9wdGlvbnNVcGRhdGUgZXh0ZW5kcyBJTGlzdE9wdGlvbnNVcGRhdGUge1xuXHRyZWFkb25seSBvdmVycmlkZVN0eWxlcz86IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoTGlzdE9wdGlvbnM8VD4gZXh0ZW5kcyBJV29ya2JlbmNoTGlzdE9wdGlvbnNVcGRhdGUsIElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnMsIElMaXN0T3B0aW9uczxUPiB7XG5cdHJlYWRvbmx5IHNlbGVjdGlvbk5hdmlnYXRpb24/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoTGlzdDxUPiBleHRlbmRzIExpc3Q8VD4ge1xuXG5cdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgbGlzdFN1cHBvcnRzTXVsdGlTZWxlY3Q6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGxpc3RIYXNTZWxlY3Rpb25PckZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsaXN0RG91YmxlU2VsZWN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsaXN0TXVsdGlTZWxlY3Rpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGhvcml6b250YWxTY3JvbGxpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjogYm9vbGVhbjtcblx0cHJpdmF0ZSBuYXZpZ2F0b3I6IExpc3RSZXNvdXJjZU5hdmlnYXRvcjxUPjtcblx0Z2V0IG9uRGlkT3BlbigpOiBFdmVudDxJT3BlbkV2ZW50PFQgfCB1bmRlZmluZWQ+PiB7IHJldHVybiB0aGlzLm5hdmlnYXRvci5vbkRpZE9wZW47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJTGlzdFJlbmRlcmVyPFQsIGFueT5bXSxcblx0XHRvcHRpb25zOiBJV29ya2JlbmNoTGlzdE9wdGlvbnM8VD4sXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGhvcml6b250YWxTY3JvbGxpbmcgPSB0eXBlb2Ygb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nICE9PSAndW5kZWZpbmVkJyA/IG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyA6IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkpO1xuXHRcdGNvbnN0IFt3b3JrYmVuY2hMaXN0T3B0aW9ucywgd29ya2JlbmNoTGlzdE9wdGlvbnNEaXNwb3NhYmxlXSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRvV29ya2JlbmNoTGlzdE9wdGlvbnMsIG9wdGlvbnMpO1xuXG5cdFx0c3VwZXIodXNlciwgY29udGFpbmVyLCBkZWxlZ2F0ZSwgcmVuZGVyZXJzLFxuXHRcdFx0e1xuXHRcdFx0XHRrZXlib2FyZFN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHQuLi53b3JrYmVuY2hMaXN0T3B0aW9ucyxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZyxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoTGlzdE9wdGlvbnNEaXNwb3NhYmxlKTtcblxuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSBjcmVhdGVTY29wZWRDb250ZXh0S2V5U2VydmljZShjb250ZXh0S2V5U2VydmljZSwgdGhpcyk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjcmVhdGVTY3JvbGxPYnNlcnZlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzKSk7XG5cblx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0ID0gV29ya2JlbmNoTGlzdFN1cHBvcnRzTXVsdGlTZWxlY3RDb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0LnNldChvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gZmFsc2UpO1xuXG5cdFx0Y29uc3QgbGlzdFNlbGVjdGlvbk5hdmlnYXRpb24gPSBXb3JrYmVuY2hMaXN0U2VsZWN0aW9uTmF2aWdhdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0bGlzdFNlbGVjdGlvbk5hdmlnYXRpb24uc2V0KEJvb2xlYW4ob3B0aW9ucy5zZWxlY3Rpb25OYXZpZ2F0aW9uKSk7XG5cblx0XHR0aGlzLmxpc3RIYXNTZWxlY3Rpb25PckZvY3VzID0gV29ya2JlbmNoTGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMubGlzdERvdWJsZVNlbGVjdGlvbiA9IFdvcmtiZW5jaExpc3REb3VibGVTZWxlY3Rpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMubGlzdE11bHRpU2VsZWN0aW9uID0gV29ya2JlbmNoTGlzdE11bHRpU2VsZWN0aW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgPSBvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmc7XG5cblx0XHR0aGlzLl91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIgPSB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoKGxpc3RTZXJ2aWNlIGFzIExpc3RTZXJ2aWNlKS5yZWdpc3Rlcih0aGlzKSk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcyhvcHRpb25zLm92ZXJyaWRlU3R5bGVzKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb24oKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IGZvY3VzID0gdGhpcy5nZXRGb2N1cygpO1xuXG5cdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMubGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMuc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAwIHx8IGZvY3VzLmxlbmd0aCA+IDApO1xuXHRcdFx0XHR0aGlzLmxpc3RNdWx0aVNlbGVjdGlvbi5zZXQoc2VsZWN0aW9uLmxlbmd0aCA+IDEpO1xuXHRcdFx0XHR0aGlzLmxpc3REb3VibGVTZWxlY3Rpb24uc2V0KHNlbGVjdGlvbi5sZW5ndGggPT09IDIpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmdldEZvY3VzKCk7XG5cblx0XHRcdHRoaXMubGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMuc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAwIHx8IGZvY3VzLmxlbmd0aCA+IDApO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtdWx0aVNlbGVjdE1vZGlmaWVyU2V0dGluZ0tleSkpIHtcblx0XHRcdFx0dGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyID0gdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG9wdGlvbnM6IElMaXN0T3B0aW9uc1VwZGF0ZSA9IHt9O1xuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihob3Jpem9udGFsU2Nyb2xsaW5nS2V5KSAmJiB0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsaW5nID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShob3Jpem9udGFsU2Nyb2xsaW5nS2V5KSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGhvcml6b250YWxTY3JvbGxpbmcgfTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHNjcm9sbEJ5UGFnZUtleSkpIHtcblx0XHRcdFx0Y29uc3Qgc2Nyb2xsQnlQYWdlID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShzY3JvbGxCeVBhZ2VLZXkpKTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgc2Nyb2xsQnlQYWdlIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihsaXN0U21vb3RoU2Nyb2xsaW5nKSkge1xuXHRcdFx0XHRjb25zdCBzbW9vdGhTY3JvbGxpbmcgPSBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGxpc3RTbW9vdGhTY3JvbGxpbmcpKTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgc21vb3RoU2Nyb2xsaW5nIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHlLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4obW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5KTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgbW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihmYXN0U2Nyb2xsU2Vuc2l0aXZpdHlLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IGZhc3RTY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oZmFzdFNjcm9sbFNlbnNpdGl2aXR5S2V5KTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgZmFzdFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMob3B0aW9ucykubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5uYXZpZ2F0b3IgPSBuZXcgTGlzdFJlc291cmNlTmF2aWdhdG9yKHRoaXMsIHsgY29uZmlndXJhdGlvblNlcnZpY2UsIC4uLm9wdGlvbnMgfSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5uYXZpZ2F0b3IpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJV29ya2JlbmNoTGlzdE9wdGlvbnNVcGRhdGUpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVTdHlsZXMob3B0aW9ucy5vdmVycmlkZVN0eWxlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubGlzdFN1cHBvcnRzTXVsdGlTZWxlY3Quc2V0KCEhb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3R5bGVzKHN0eWxlczogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5zdHlsZShzdHlsZXMgPyBnZXRMaXN0U3R5bGVzKHN0eWxlcykgOiBkZWZhdWx0TGlzdFN0eWxlcyk7XG5cdH1cblxuXHRnZXQgdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoUGFnZWRMaXN0T3B0aW9uczxUPiBleHRlbmRzIElXb3JrYmVuY2hMaXN0T3B0aW9uc1VwZGF0ZSwgSVJlc291cmNlTmF2aWdhdG9yT3B0aW9ucywgSVBhZ2VkTGlzdE9wdGlvbnM8VD4ge1xuXHRyZWFkb25seSBzZWxlY3Rpb25OYXZpZ2F0aW9uPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaFBhZ2VkTGlzdDxUPiBleHRlbmRzIFBhZ2VkTGlzdDxUPiB7XG5cblx0cmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElTY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRwcml2YXRlIGxpc3RTdXBwb3J0c011bHRpU2VsZWN0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyOiBib29sZWFuO1xuXHRwcml2YXRlIGhvcml6b250YWxTY3JvbGxpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbmF2aWdhdG9yOiBMaXN0UmVzb3VyY2VOYXZpZ2F0b3I8VD47XG5cdGdldCBvbkRpZE9wZW4oKTogRXZlbnQ8SU9wZW5FdmVudDxUIHwgdW5kZWZpbmVkPj4geyByZXR1cm4gdGhpcy5uYXZpZ2F0b3Iub25EaWRPcGVuOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPG51bWJlcj4sXG5cdFx0cmVuZGVyZXJzOiBJUGFnZWRSZW5kZXJlcjxULCBhbnk+W10sXG5cdFx0b3B0aW9uczogSVdvcmtiZW5jaFBhZ2VkTGlzdE9wdGlvbnM8VD4sXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGhvcml6b250YWxTY3JvbGxpbmcgPSB0eXBlb2Ygb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nICE9PSAndW5kZWZpbmVkJyA/IG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyA6IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkpO1xuXHRcdGNvbnN0IFt3b3JrYmVuY2hMaXN0T3B0aW9ucywgd29ya2JlbmNoTGlzdE9wdGlvbnNEaXNwb3NhYmxlXSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRvV29ya2JlbmNoTGlzdE9wdGlvbnMsIG9wdGlvbnMpO1xuXHRcdHN1cGVyKHVzZXIsIGNvbnRhaW5lciwgZGVsZWdhdGUsIHJlbmRlcmVycyxcblx0XHRcdHtcblx0XHRcdFx0a2V5Ym9hcmRTdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0Li4ud29ya2JlbmNoTGlzdE9wdGlvbnMsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmcsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoTGlzdE9wdGlvbnNEaXNwb3NhYmxlKTtcblxuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSBjcmVhdGVTY29wZWRDb250ZXh0S2V5U2VydmljZShjb250ZXh0S2V5U2VydmljZSwgdGhpcyk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjcmVhdGVTY3JvbGxPYnNlcnZlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLndpZGdldCkpO1xuXG5cdFx0dGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID0gb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nO1xuXG5cdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdCA9IFdvcmtiZW5jaExpc3RTdXBwb3J0c011bHRpU2VsZWN0Q29udGV4dEtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdC5zZXQob3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgIT09IGZhbHNlKTtcblxuXHRcdGNvbnN0IGxpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uID0gV29ya2JlbmNoTGlzdFNlbGVjdGlvbk5hdmlnYXRpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGxpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uLnNldChCb29sZWFuKG9wdGlvbnMuc2VsZWN0aW9uTmF2aWdhdGlvbikpO1xuXG5cdFx0dGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyID0gdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKChsaXN0U2VydmljZSBhcyBMaXN0U2VydmljZSkucmVnaXN0ZXIodGhpcykpO1xuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMob3B0aW9ucy5vdmVycmlkZVN0eWxlcyk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtdWx0aVNlbGVjdE1vZGlmaWVyU2V0dGluZ0tleSkpIHtcblx0XHRcdFx0dGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyID0gdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG9wdGlvbnM6IElMaXN0T3B0aW9uc1VwZGF0ZSA9IHt9O1xuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihob3Jpem9udGFsU2Nyb2xsaW5nS2V5KSAmJiB0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsaW5nID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShob3Jpem9udGFsU2Nyb2xsaW5nS2V5KSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGhvcml6b250YWxTY3JvbGxpbmcgfTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHNjcm9sbEJ5UGFnZUtleSkpIHtcblx0XHRcdFx0Y29uc3Qgc2Nyb2xsQnlQYWdlID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShzY3JvbGxCeVBhZ2VLZXkpKTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgc2Nyb2xsQnlQYWdlIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihsaXN0U21vb3RoU2Nyb2xsaW5nKSkge1xuXHRcdFx0XHRjb25zdCBzbW9vdGhTY3JvbGxpbmcgPSBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGxpc3RTbW9vdGhTY3JvbGxpbmcpKTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgc21vb3RoU2Nyb2xsaW5nIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHlLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4obW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5KTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgbW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihmYXN0U2Nyb2xsU2Vuc2l0aXZpdHlLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IGZhc3RTY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oZmFzdFNjcm9sbFNlbnNpdGl2aXR5S2V5KTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgZmFzdFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMob3B0aW9ucykubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5uYXZpZ2F0b3IgPSBuZXcgTGlzdFJlc291cmNlTmF2aWdhdG9yKHRoaXMsIHsgY29uZmlndXJhdGlvblNlcnZpY2UsIC4uLm9wdGlvbnMgfSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5uYXZpZ2F0b3IpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJV29ya2JlbmNoTGlzdE9wdGlvbnNVcGRhdGUpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVTdHlsZXMob3B0aW9ucy5vdmVycmlkZVN0eWxlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubGlzdFN1cHBvcnRzTXVsdGlTZWxlY3Quc2V0KCEhb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3R5bGVzKHN0eWxlczogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5zdHlsZShzdHlsZXMgPyBnZXRMaXN0U3R5bGVzKHN0eWxlcykgOiBkZWZhdWx0TGlzdFN0eWxlcyk7XG5cdH1cblxuXHRnZXQgdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hUYWJsZU9wdGlvbnNVcGRhdGUgZXh0ZW5kcyBJVGFibGVPcHRpb25zVXBkYXRlIHtcblx0cmVhZG9ubHkgb3ZlcnJpZGVTdHlsZXM/OiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaFRhYmxlT3B0aW9uczxUPiBleHRlbmRzIElXb3JrYmVuY2hUYWJsZU9wdGlvbnNVcGRhdGUsIElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnMsIElUYWJsZU9wdGlvbnM8VD4ge1xuXHRyZWFkb25seSBzZWxlY3Rpb25OYXZpZ2F0aW9uPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaFRhYmxlPFRSb3c+IGV4dGVuZHMgVGFibGU8VFJvdz4ge1xuXG5cdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgbGlzdFN1cHBvcnRzTXVsdGlTZWxlY3Q6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGxpc3RIYXNTZWxlY3Rpb25PckZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsaXN0RG91YmxlU2VsZWN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsaXN0TXVsdGlTZWxlY3Rpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGhvcml6b250YWxTY3JvbGxpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjogYm9vbGVhbjtcblx0cHJpdmF0ZSBuYXZpZ2F0b3I6IFRhYmxlUmVzb3VyY2VOYXZpZ2F0b3I8VFJvdz47XG5cdGdldCBvbkRpZE9wZW4oKTogRXZlbnQ8SU9wZW5FdmVudDxUUm93IHwgdW5kZWZpbmVkPj4geyByZXR1cm4gdGhpcy5uYXZpZ2F0b3Iub25EaWRPcGVuOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElUYWJsZVZpcnR1YWxEZWxlZ2F0ZTxUUm93Pixcblx0XHRjb2x1bW5zOiBJVGFibGVDb2x1bW48VFJvdywgYW55PltdLFxuXHRcdHJlbmRlcmVyczogSVRhYmxlUmVuZGVyZXI8VFJvdywgYW55PltdLFxuXHRcdG9wdGlvbnM6IElXb3JrYmVuY2hUYWJsZU9wdGlvbnM8VFJvdz4sXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGhvcml6b250YWxTY3JvbGxpbmcgPSB0eXBlb2Ygb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nICE9PSAndW5kZWZpbmVkJyA/IG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyA6IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkpO1xuXHRcdGNvbnN0IFt3b3JrYmVuY2hMaXN0T3B0aW9ucywgd29ya2JlbmNoTGlzdE9wdGlvbnNEaXNwb3NhYmxlXSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRvV29ya2JlbmNoTGlzdE9wdGlvbnMsIG9wdGlvbnMpO1xuXG5cdFx0c3VwZXIodXNlciwgY29udGFpbmVyLCBkZWxlZ2F0ZSwgY29sdW1ucywgcmVuZGVyZXJzLFxuXHRcdFx0e1xuXHRcdFx0XHRrZXlib2FyZFN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0XHQuLi53b3JrYmVuY2hMaXN0T3B0aW9ucyxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZyxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQod29ya2JlbmNoTGlzdE9wdGlvbnNEaXNwb3NhYmxlKTtcblxuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSBjcmVhdGVTY29wZWRDb250ZXh0S2V5U2VydmljZShjb250ZXh0S2V5U2VydmljZSwgdGhpcyk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjcmVhdGVTY3JvbGxPYnNlcnZlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzKSk7XG5cblx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0ID0gV29ya2JlbmNoTGlzdFN1cHBvcnRzTXVsdGlTZWxlY3RDb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0LnNldChvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gZmFsc2UpO1xuXG5cdFx0Y29uc3QgbGlzdFNlbGVjdGlvbk5hdmlnYXRpb24gPSBXb3JrYmVuY2hMaXN0U2VsZWN0aW9uTmF2aWdhdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0bGlzdFNlbGVjdGlvbk5hdmlnYXRpb24uc2V0KEJvb2xlYW4ob3B0aW9ucy5zZWxlY3Rpb25OYXZpZ2F0aW9uKSk7XG5cblx0XHR0aGlzLmxpc3RIYXNTZWxlY3Rpb25PckZvY3VzID0gV29ya2JlbmNoTGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMubGlzdERvdWJsZVNlbGVjdGlvbiA9IFdvcmtiZW5jaExpc3REb3VibGVTZWxlY3Rpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMubGlzdE11bHRpU2VsZWN0aW9uID0gV29ya2JlbmNoTGlzdE11bHRpU2VsZWN0aW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgPSBvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmc7XG5cblx0XHR0aGlzLl91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIgPSB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoKGxpc3RTZXJ2aWNlIGFzIExpc3RTZXJ2aWNlKS5yZWdpc3Rlcih0aGlzKSk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlcyhvcHRpb25zLm92ZXJyaWRlU3R5bGVzKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VTZWxlY3Rpb24oKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IGZvY3VzID0gdGhpcy5nZXRGb2N1cygpO1xuXG5cdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMubGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMuc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAwIHx8IGZvY3VzLmxlbmd0aCA+IDApO1xuXHRcdFx0XHR0aGlzLmxpc3RNdWx0aVNlbGVjdGlvbi5zZXQoc2VsZWN0aW9uLmxlbmd0aCA+IDEpO1xuXHRcdFx0XHR0aGlzLmxpc3REb3VibGVTZWxlY3Rpb24uc2V0KHNlbGVjdGlvbi5sZW5ndGggPT09IDIpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmdldEZvY3VzKCk7XG5cblx0XHRcdHRoaXMubGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMuc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAwIHx8IGZvY3VzLmxlbmd0aCA+IDApO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtdWx0aVNlbGVjdE1vZGlmaWVyU2V0dGluZ0tleSkpIHtcblx0XHRcdFx0dGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyID0gdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG9wdGlvbnM6IElMaXN0T3B0aW9uc1VwZGF0ZSA9IHt9O1xuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihob3Jpem9udGFsU2Nyb2xsaW5nS2V5KSAmJiB0aGlzLmhvcml6b250YWxTY3JvbGxpbmcgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsaW5nID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShob3Jpem9udGFsU2Nyb2xsaW5nS2V5KSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGhvcml6b250YWxTY3JvbGxpbmcgfTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHNjcm9sbEJ5UGFnZUtleSkpIHtcblx0XHRcdFx0Y29uc3Qgc2Nyb2xsQnlQYWdlID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShzY3JvbGxCeVBhZ2VLZXkpKTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgc2Nyb2xsQnlQYWdlIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihsaXN0U21vb3RoU2Nyb2xsaW5nKSkge1xuXHRcdFx0XHRjb25zdCBzbW9vdGhTY3JvbGxpbmcgPSBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGxpc3RTbW9vdGhTY3JvbGxpbmcpKTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgc21vb3RoU2Nyb2xsaW5nIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHlLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4obW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5KTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgbW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihmYXN0U2Nyb2xsU2Vuc2l0aXZpdHlLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IGZhc3RTY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oZmFzdFNjcm9sbFNlbnNpdGl2aXR5S2V5KTtcblx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgZmFzdFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoT2JqZWN0LmtleXMob3B0aW9ucykubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5uYXZpZ2F0b3IgPSBuZXcgVGFibGVSZXNvdXJjZU5hdmlnYXRvcih0aGlzLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAuLi5vcHRpb25zIH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubmF2aWdhdG9yKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSVdvcmtiZW5jaFRhYmxlT3B0aW9uc1VwZGF0ZSk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRpZiAob3B0aW9ucy5vdmVycmlkZVN0eWxlcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0eWxlcyhvcHRpb25zLm92ZXJyaWRlU3R5bGVzKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdC5zZXQoISFvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdHlsZXMoc3R5bGVzOiBJU3R5bGVPdmVycmlkZTxJVGFibGVTdHlsZXM+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5zdHlsZShzdHlsZXMgPyBnZXRMaXN0U3R5bGVzKHN0eWxlcykgOiBkZWZhdWx0TGlzdFN0eWxlcyk7XG5cdH1cblxuXHRnZXQgdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPcGVuRXZlbnQ8VD4ge1xuXHRlZGl0b3JPcHRpb25zOiBJRWRpdG9yT3B0aW9ucztcblx0c2lkZUJ5U2lkZTogYm9vbGVhbjtcblx0ZWxlbWVudDogVDtcblx0YnJvd3NlckV2ZW50PzogVUlFdmVudDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zIHtcblx0cmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U/OiBJQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5IG9wZW5PblNpbmdsZUNsaWNrPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBTZWxlY3Rpb25LZXlib2FyZEV2ZW50IGV4dGVuZHMgS2V5Ym9hcmRFdmVudCB7XG5cdHByZXNlcnZlRm9jdXM/OiBib29sZWFuO1xuXHRwaW5uZWQ/OiBib29sZWFuO1xuXHRfX2ZvcmNlRXZlbnQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2VsZWN0aW9uS2V5Ym9hcmRFdmVudCh0eXBlQXJnID0gJ2tleWRvd24nLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiwgcGlubmVkPzogYm9vbGVhbik6IFNlbGVjdGlvbktleWJvYXJkRXZlbnQge1xuXHRjb25zdCBlID0gbmV3IEtleWJvYXJkRXZlbnQodHlwZUFyZyk7XG5cdCg8U2VsZWN0aW9uS2V5Ym9hcmRFdmVudD5lKS5wcmVzZXJ2ZUZvY3VzID0gcHJlc2VydmVGb2N1cztcblx0KDxTZWxlY3Rpb25LZXlib2FyZEV2ZW50PmUpLnBpbm5lZCA9IHBpbm5lZDtcblx0KDxTZWxlY3Rpb25LZXlib2FyZEV2ZW50PmUpLl9fZm9yY2VFdmVudCA9IHRydWU7XG5cblx0cmV0dXJuIGU7XG59XG5cbmFic3RyYWN0IGNsYXNzIFJlc291cmNlTmF2aWdhdG9yPFQ+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBvcGVuT25TaW5nbGVDbGljazogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE9wZW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJT3BlbkV2ZW50PFQgfCB1bmRlZmluZWQ+PigpKTtcblx0cmVhZG9ubHkgb25EaWRPcGVuOiBFdmVudDxJT3BlbkV2ZW50PFQgfCB1bmRlZmluZWQ+PiA9IHRoaXMuX29uRGlkT3Blbi5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgd2lkZ2V0OiBMaXN0V2lkZ2V0LFxuXHRcdG9wdGlvbnM/OiBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy53aWRnZXQub25EaWRDaGFuZ2VTZWxlY3Rpb24sIGUgPT4gaXNLZXlib2FyZEV2ZW50KGUuYnJvd3NlckV2ZW50KSkoZSA9PiB0aGlzLm9uU2VsZWN0aW9uRnJvbUtleWJvYXJkKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aWRnZXQub25Qb2ludGVyKChlOiB7IGJyb3dzZXJFdmVudDogTW91c2VFdmVudDsgZWxlbWVudDogVCB8IHVuZGVmaW5lZCB9KSA9PiB0aGlzLm9uUG9pbnRlcihlLmVsZW1lbnQsIGUuYnJvd3NlckV2ZW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uTW91c2VEYmxDbGljaygoZTogeyBicm93c2VyRXZlbnQ6IE1vdXNlRXZlbnQ7IGVsZW1lbnQ6IFQgfCB1bmRlZmluZWQgfSkgPT4gdGhpcy5vbk1vdXNlRGJsQ2xpY2soZS5lbGVtZW50LCBlLmJyb3dzZXJFdmVudCkpKTtcblxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucz8ub3Blbk9uU2luZ2xlQ2xpY2sgIT09ICdib29sZWFuJyAmJiBvcHRpb25zPy5jb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdFx0dGhpcy5vcGVuT25TaW5nbGVDbGljayA9IG9wdGlvbnM/LmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKG9wZW5Nb2RlU2V0dGluZ0tleSkgIT09ICdkb3VibGVDbGljayc7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvcHRpb25zPy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKG9wZW5Nb2RlU2V0dGluZ0tleSkpIHtcblx0XHRcdFx0XHR0aGlzLm9wZW5PblNpbmdsZUNsaWNrID0gb3B0aW9ucz8uY29uZmlndXJhdGlvblNlcnZpY2UhLmdldFZhbHVlKG9wZW5Nb2RlU2V0dGluZ0tleSkgIT09ICdkb3VibGVDbGljayc7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5vcGVuT25TaW5nbGVDbGljayA9IG9wdGlvbnM/Lm9wZW5PblNpbmdsZUNsaWNrID8/IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblNlbGVjdGlvbkZyb21LZXlib2FyZChldmVudDogSVRyZWVFdmVudDxhbnk+KTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50LmVsZW1lbnRzLmxlbmd0aCAhPT0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbktleWJvYXJkRXZlbnQgPSBldmVudC5icm93c2VyRXZlbnQgYXMgU2VsZWN0aW9uS2V5Ym9hcmRFdmVudDtcblx0XHRjb25zdCBwcmVzZXJ2ZUZvY3VzID0gdHlwZW9mIHNlbGVjdGlvbktleWJvYXJkRXZlbnQucHJlc2VydmVGb2N1cyA9PT0gJ2Jvb2xlYW4nID8gc2VsZWN0aW9uS2V5Ym9hcmRFdmVudC5wcmVzZXJ2ZUZvY3VzIDogdHJ1ZTtcblx0XHRjb25zdCBwaW5uZWQgPSB0eXBlb2Ygc2VsZWN0aW9uS2V5Ym9hcmRFdmVudC5waW5uZWQgPT09ICdib29sZWFuJyA/IHNlbGVjdGlvbktleWJvYXJkRXZlbnQucGlubmVkIDogIXByZXNlcnZlRm9jdXM7XG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZSA9IGZhbHNlO1xuXG5cdFx0dGhpcy5fb3Blbih0aGlzLmdldFNlbGVjdGVkRWxlbWVudCgpLCBwcmVzZXJ2ZUZvY3VzLCBwaW5uZWQsIHNpZGVCeVNpZGUsIGV2ZW50LmJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIG9uUG9pbnRlcihlbGVtZW50OiBUIHwgdW5kZWZpbmVkLCBicm93c2VyRXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMub3Blbk9uU2luZ2xlQ2xpY2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0RvdWJsZUNsaWNrID0gYnJvd3NlckV2ZW50LmRldGFpbCA9PT0gMjtcblxuXHRcdGlmIChpc0RvdWJsZUNsaWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNNaWRkbGVDbGljayA9IGJyb3dzZXJFdmVudC5idXR0b24gPT09IDE7XG5cdFx0Y29uc3QgcHJlc2VydmVGb2N1cyA9IHRydWU7XG5cdFx0Y29uc3QgcGlubmVkID0gaXNNaWRkbGVDbGljaztcblx0XHRjb25zdCBzaWRlQnlTaWRlID0gYnJvd3NlckV2ZW50LmN0cmxLZXkgfHwgYnJvd3NlckV2ZW50Lm1ldGFLZXkgfHwgYnJvd3NlckV2ZW50LmFsdEtleTtcblxuXHRcdHRoaXMuX29wZW4oZWxlbWVudCwgcHJlc2VydmVGb2N1cywgcGlubmVkLCBzaWRlQnlTaWRlLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk1vdXNlRGJsQ2xpY2soZWxlbWVudDogVCB8IHVuZGVmaW5lZCwgYnJvd3NlckV2ZW50PzogTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghYnJvd3NlckV2ZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gY29waWVkIGZyb20gQWJzdHJhY3RUcmVlXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRjb25zdCBvblR3aXN0aWUgPSB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28tdGwtdHdpc3RpZScpXG5cdFx0XHR8fCAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLWljb24tbGFiZWwnKSAmJiB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb2xkZXItaWNvbicpICYmIGJyb3dzZXJFdmVudC5vZmZzZXRYIDwgMTYpO1xuXG5cdFx0aWYgKG9uVHdpc3RpZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSBmYWxzZTtcblx0XHRjb25zdCBwaW5uZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHNpZGVCeVNpZGUgPSAoYnJvd3NlckV2ZW50LmN0cmxLZXkgfHwgYnJvd3NlckV2ZW50Lm1ldGFLZXkgfHwgYnJvd3NlckV2ZW50LmFsdEtleSk7XG5cblx0XHR0aGlzLl9vcGVuKGVsZW1lbnQsIHByZXNlcnZlRm9jdXMsIHBpbm5lZCwgc2lkZUJ5U2lkZSwgYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW4oZWxlbWVudDogVCB8IHVuZGVmaW5lZCwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgcGlubmVkOiBib29sZWFuLCBzaWRlQnlTaWRlOiBib29sZWFuLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRPcGVuLmZpcmUoe1xuXHRcdFx0ZWRpdG9yT3B0aW9uczoge1xuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0XHRwaW5uZWQsXG5cdFx0XHRcdHJldmVhbElmVmlzaWJsZTogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHNpZGVCeVNpZGUsXG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0YnJvd3NlckV2ZW50XG5cdFx0fSk7XG5cdH1cblxuXHRhYnN0cmFjdCBnZXRTZWxlY3RlZEVsZW1lbnQoKTogVCB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgTGlzdFJlc291cmNlTmF2aWdhdG9yPFQ+IGV4dGVuZHMgUmVzb3VyY2VOYXZpZ2F0b3I8VD4ge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSB3aWRnZXQ6IExpc3Q8VD4gfCBQYWdlZExpc3Q8VD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d2lkZ2V0OiBMaXN0PFQ+IHwgUGFnZWRMaXN0PFQ+LFxuXHRcdG9wdGlvbnM6IElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIod2lkZ2V0LCBvcHRpb25zKTtcblx0XHR0aGlzLndpZGdldCA9IHdpZGdldDtcblx0fVxuXG5cdGdldFNlbGVjdGVkRWxlbWVudCgpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53aWRnZXQuZ2V0U2VsZWN0ZWRFbGVtZW50cygpWzBdO1xuXHR9XG59XG5cbmNsYXNzIFRhYmxlUmVzb3VyY2VOYXZpZ2F0b3I8VFJvdz4gZXh0ZW5kcyBSZXNvdXJjZU5hdmlnYXRvcjxUUm93PiB7XG5cblx0cHJvdGVjdGVkIGRlY2xhcmUgcmVhZG9ubHkgd2lkZ2V0OiBUYWJsZTxUUm93PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3aWRnZXQ6IFRhYmxlPFRSb3c+LFxuXHRcdG9wdGlvbnM6IElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIod2lkZ2V0LCBvcHRpb25zKTtcblx0fVxuXG5cdGdldFNlbGVjdGVkRWxlbWVudCgpOiBUUm93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53aWRnZXQuZ2V0U2VsZWN0ZWRFbGVtZW50cygpWzBdO1xuXHR9XG59XG5cbmNsYXNzIFRyZWVSZXNvdXJjZU5hdmlnYXRvcjxULCBURmlsdGVyRGF0YT4gZXh0ZW5kcyBSZXNvdXJjZU5hdmlnYXRvcjxUPiB7XG5cblx0cHJvdGVjdGVkIGRlY2xhcmUgcmVhZG9ubHkgd2lkZ2V0OiBPYmplY3RUcmVlPFQsIFRGaWx0ZXJEYXRhPiB8IENvbXByZXNzaWJsZU9iamVjdFRyZWU8VCwgVEZpbHRlckRhdGE+IHwgRGF0YVRyZWU8YW55LCBULCBURmlsdGVyRGF0YT4gfCBBc3luY0RhdGFUcmVlPGFueSwgVCwgVEZpbHRlckRhdGE+IHwgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxhbnksIFQsIFRGaWx0ZXJEYXRhPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3aWRnZXQ6IE9iamVjdFRyZWU8VCwgVEZpbHRlckRhdGE+IHwgQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxULCBURmlsdGVyRGF0YT4gfCBEYXRhVHJlZTxhbnksIFQsIFRGaWx0ZXJEYXRhPiB8IEFzeW5jRGF0YVRyZWU8YW55LCBULCBURmlsdGVyRGF0YT4gfCBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPGFueSwgVCwgVEZpbHRlckRhdGE+LFxuXHRcdG9wdGlvbnM6IElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIod2lkZ2V0LCBvcHRpb25zKTtcblx0fVxuXG5cdGdldFNlbGVjdGVkRWxlbWVudCgpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53aWRnZXQuZ2V0U2VsZWN0aW9uKClbMF0gPz8gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUtleWJvYXJkTmF2aWdhdGlvbkV2ZW50RmlsdGVyKGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UpOiBJS2V5Ym9hcmROYXZpZ2F0aW9uRXZlbnRGaWx0ZXIge1xuXHRsZXQgaW5NdWx0aUNob3JkID0gZmFsc2U7XG5cblx0cmV0dXJuIGV2ZW50ID0+IHtcblx0XHRpZiAoZXZlbnQudG9LZXlDb2RlQ2hvcmQoKS5pc01vZGlmaWVyS2V5KCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaW5NdWx0aUNob3JkKSB7XG5cdFx0XHRpbk11bHRpQ2hvcmQgPSBmYWxzZTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBrZXliaW5kaW5nU2VydmljZS5zb2Z0RGlzcGF0Y2goZXZlbnQsIGV2ZW50LnRhcmdldCk7XG5cblx0XHRpZiAocmVzdWx0LmtpbmQgPT09IFJlc3VsdEtpbmQuTW9yZUNob3Jkc05lZWRlZCkge1xuXHRcdFx0aW5NdWx0aUNob3JkID0gdHJ1ZTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpbk11bHRpQ2hvcmQgPSBmYWxzZTtcblx0XHRyZXR1cm4gcmVzdWx0LmtpbmQgPT09IFJlc3VsdEtpbmQuTm9NYXRjaGluZ0tiO1xuXHR9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hPYmplY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiBleHRlbmRzIElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlPFQ+IHtcblx0cmVhZG9ubHkgb3ZlcnJpZGVTdHlsZXM/OiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaE9iamVjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIElPYmplY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4sIElXb3JrYmVuY2hPYmplY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiwgSVJlc291cmNlTmF2aWdhdG9yT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlQcm92aWRlcjogSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD47XG5cdHJlYWRvbmx5IHNlbGVjdGlvbk5hdmlnYXRpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBzY3JvbGxUb0FjdGl2ZUVsZW1lbnQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoT2JqZWN0VHJlZTxUIGV4dGVuZHMgTm9uTnVsbGFibGU8YW55PiwgVEZpbHRlckRhdGEgPSB2b2lkPiBleHRlbmRzIE9iamVjdFRyZWU8VCwgVEZpbHRlckRhdGE+IHtcblxuXHRwcml2YXRlIGludGVybmFsczogV29ya2JlbmNoVHJlZUludGVybmFsczxhbnksIFQsIFRGaWx0ZXJEYXRhPjtcblx0Z2V0IGNvbnRleHRLZXlTZXJ2aWNlKCk6IElDb250ZXh0S2V5U2VydmljZSB7IHJldHVybiB0aGlzLmludGVybmFscy5jb250ZXh0S2V5U2VydmljZTsgfVxuXHRnZXQgdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5pbnRlcm5hbHMudXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyOyB9XG5cdGdldCBvbkRpZE9wZW4oKTogRXZlbnQ8SU9wZW5FdmVudDxUIHwgdW5kZWZpbmVkPj4geyByZXR1cm4gdGhpcy5pbnRlcm5hbHMub25EaWRPcGVuOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+LFxuXHRcdHJlbmRlcmVyczogSVRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgYW55PltdLFxuXHRcdG9wdGlvbnM6IElXb3JrYmVuY2hPYmplY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHsgb3B0aW9uczogdHJlZU9wdGlvbnMsIGdldFR5cGVOYXZpZ2F0aW9uTW9kZSwgZGlzcG9zYWJsZSB9ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24od29ya2JlbmNoVHJlZURhdGFQcmVhbWJsZSwgb3B0aW9ucyBhcyBhbnkpO1xuXHRcdHN1cGVyKHVzZXIsIGNvbnRhaW5lciwgZGVsZWdhdGUsIHJlbmRlcmVycywgdHJlZU9wdGlvbnMpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdHRoaXMuaW50ZXJuYWxzID0gbmV3IFdvcmtiZW5jaFRyZWVJbnRlcm5hbHModGhpcywgb3B0aW9ucywgZ2V0VHlwZU5hdmlnYXRpb25Nb2RlLCBvcHRpb25zLm92ZXJyaWRlU3R5bGVzLCBjb250ZXh0S2V5U2VydmljZSwgbGlzdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmludGVybmFscyk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVPcHRpb25zKG9wdGlvbnM6IElXb3JrYmVuY2hPYmplY3RUcmVlT3B0aW9uc1VwZGF0ZTxUIHwgbnVsbD4gPSB7fSk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRpZiAob3B0aW9ucy5vdmVycmlkZVN0eWxlcykge1xuXHRcdFx0dGhpcy5pbnRlcm5hbHMudXBkYXRlU3R5bGVPdmVycmlkZXMob3B0aW9ucy5vdmVycmlkZVN0eWxlcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5pbnRlcm5hbHMudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiBleHRlbmRzIElDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiB7XG5cdHJlYWRvbmx5IG92ZXJyaWRlU3R5bGVzPzogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gZXh0ZW5kcyBJV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4sIElDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4sIElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnMge1xuXHRyZWFkb25seSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+O1xuXHRyZWFkb25seSBzZWxlY3Rpb25OYXZpZ2F0aW9uPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8VCBleHRlbmRzIE5vbk51bGxhYmxlPGFueT4sIFRGaWx0ZXJEYXRhID0gdm9pZD4gZXh0ZW5kcyBDb21wcmVzc2libGVPYmplY3RUcmVlPFQsIFRGaWx0ZXJEYXRhPiB7XG5cblx0cHJpdmF0ZSBpbnRlcm5hbHM6IFdvcmtiZW5jaFRyZWVJbnRlcm5hbHM8YW55LCBULCBURmlsdGVyRGF0YT47XG5cdGdldCBjb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2UgeyByZXR1cm4gdGhpcy5pbnRlcm5hbHMuY29udGV4dEtleVNlcnZpY2U7IH1cblx0Z2V0IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLnVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjsgfVxuXHRnZXQgb25EaWRPcGVuKCk6IEV2ZW50PElPcGVuRXZlbnQ8VCB8IHVuZGVmaW5lZD4+IHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLm9uRGlkT3BlbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGRlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIGFueT5bXSxcblx0XHRvcHRpb25zOiBJV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaXN0U2VydmljZSBsaXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCB7IG9wdGlvbnM6IHRyZWVPcHRpb25zLCBnZXRUeXBlTmF2aWdhdGlvbk1vZGUsIGRpc3Bvc2FibGUgfSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHdvcmtiZW5jaFRyZWVEYXRhUHJlYW1ibGUsIG9wdGlvbnMgYXMgYW55KTtcblx0XHRzdXBlcih1c2VyLCBjb250YWluZXIsIGRlbGVnYXRlLCByZW5kZXJlcnMsIHRyZWVPcHRpb25zKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHR0aGlzLmludGVybmFscyA9IG5ldyBXb3JrYmVuY2hUcmVlSW50ZXJuYWxzKHRoaXMsIG9wdGlvbnMsIGdldFR5cGVOYXZpZ2F0aW9uTW9kZSwgb3B0aW9ucy5vdmVycmlkZVN0eWxlcywgY29udGV4dEtleVNlcnZpY2UsIGxpc3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnRlcm5hbHMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnNVcGRhdGU8VCB8IG51bGw+ID0ge30pOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpIHtcblx0XHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZVN0eWxlT3ZlcnJpZGVzKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+IGV4dGVuZHMgSUFic3RyYWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4ge1xuXHRyZWFkb25seSBvdmVycmlkZVN0eWxlcz86IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIElXb3JrYmVuY2hEYXRhVHJlZU9wdGlvbnNVcGRhdGU8VD4sIElEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LCBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zIHtcblx0cmVhZG9ubHkgYWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUPjtcblx0cmVhZG9ubHkgc2VsZWN0aW9uTmF2aWdhdGlvbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hEYXRhVHJlZTxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4gZXh0ZW5kcyBEYXRhVHJlZTxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiB7XG5cblx0cHJpdmF0ZSBpbnRlcm5hbHM6IFdvcmtiZW5jaFRyZWVJbnRlcm5hbHM8VElucHV0LCBULCBURmlsdGVyRGF0YT47XG5cdGdldCBjb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2UgeyByZXR1cm4gdGhpcy5pbnRlcm5hbHMuY29udGV4dEtleVNlcnZpY2U7IH1cblx0Z2V0IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLnVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjsgfVxuXHRnZXQgb25EaWRPcGVuKCk6IEV2ZW50PElPcGVuRXZlbnQ8VCB8IHVuZGVmaW5lZD4+IHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLm9uRGlkT3BlbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGRlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIGFueT5bXSxcblx0XHRkYXRhU291cmNlOiBJRGF0YVNvdXJjZTxUSW5wdXQsIFQ+LFxuXHRcdG9wdGlvbnM6IElXb3JrYmVuY2hEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaXN0U2VydmljZSBsaXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCB7IG9wdGlvbnM6IHRyZWVPcHRpb25zLCBnZXRUeXBlTmF2aWdhdGlvbk1vZGUsIGRpc3Bvc2FibGUgfSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHdvcmtiZW5jaFRyZWVEYXRhUHJlYW1ibGUsIG9wdGlvbnMgYXMgYW55KTtcblx0XHRzdXBlcih1c2VyLCBjb250YWluZXIsIGRlbGVnYXRlLCByZW5kZXJlcnMsIGRhdGFTb3VyY2UsIHRyZWVPcHRpb25zKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHR0aGlzLmludGVybmFscyA9IG5ldyBXb3JrYmVuY2hUcmVlSW50ZXJuYWxzKHRoaXMsIG9wdGlvbnMsIGdldFR5cGVOYXZpZ2F0aW9uTW9kZSwgb3B0aW9ucy5vdmVycmlkZVN0eWxlcywgY29udGV4dEtleVNlcnZpY2UsIGxpc3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnRlcm5hbHMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJV29ya2JlbmNoRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQgfCBudWxsPiA9IHt9KTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblxuXHRcdGlmIChvcHRpb25zLm92ZXJyaWRlU3R5bGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZVN0eWxlT3ZlcnJpZGVzKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnNVcGRhdGU8VD4gZXh0ZW5kcyBJQXN5bmNEYXRhVHJlZU9wdGlvbnNVcGRhdGU8VD4ge1xuXHRyZWFkb25seSBvdmVycmlkZVN0eWxlcz86IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IGV4dGVuZHMgSVdvcmtiZW5jaEFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+LCBJQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LCBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zIHtcblx0cmVhZG9ubHkgYWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUPjtcblx0cmVhZG9ubHkgc2VsZWN0aW9uTmF2aWdhdGlvbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPFRJbnB1dCwgVCwgVEZpbHRlckRhdGEgPSB2b2lkPiBleHRlbmRzIEFzeW5jRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YT4ge1xuXG5cdHByaXZhdGUgaW50ZXJuYWxzOiBXb3JrYmVuY2hUcmVlSW50ZXJuYWxzPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+O1xuXHRnZXQgY29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLmNvbnRleHRLZXlTZXJ2aWNlOyB9XG5cdGdldCB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmludGVybmFscy51c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI7IH1cblx0Z2V0IG9uRGlkT3BlbigpOiBFdmVudDxJT3BlbkV2ZW50PFQgfCB1bmRlZmluZWQ+PiB7IHJldHVybiB0aGlzLmludGVybmFscy5vbkRpZE9wZW47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJVHJlZVJlbmRlcmVyPFQsIFRGaWx0ZXJEYXRhLCBhbnk+W10sXG5cdFx0ZGF0YVNvdXJjZTogSUFzeW5jRGF0YVNvdXJjZTxUSW5wdXQsIFQ+LFxuXHRcdG9wdGlvbnM6IElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHsgb3B0aW9uczogdHJlZU9wdGlvbnMsIGdldFR5cGVOYXZpZ2F0aW9uTW9kZSwgZGlzcG9zYWJsZSB9ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24od29ya2JlbmNoVHJlZURhdGFQcmVhbWJsZSwgb3B0aW9ucyBhcyBhbnkpO1xuXHRcdHN1cGVyKHVzZXIsIGNvbnRhaW5lciwgZGVsZWdhdGUsIHJlbmRlcmVycywgZGF0YVNvdXJjZSwgdHJlZU9wdGlvbnMpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdHRoaXMuaW50ZXJuYWxzID0gbmV3IFdvcmtiZW5jaFRyZWVJbnRlcm5hbHModGhpcywgb3B0aW9ucywgZ2V0VHlwZU5hdmlnYXRpb25Nb2RlLCBvcHRpb25zLm92ZXJyaWRlU3R5bGVzLCBjb250ZXh0S2V5U2VydmljZSwgbGlzdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmludGVybmFscyk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVPcHRpb25zKG9wdGlvbnM6IElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGw+ID0ge30pOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpIHtcblx0XHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZVN0eWxlT3ZlcnJpZGVzKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IGV4dGVuZHMgSUNvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiwgSVJlc291cmNlTmF2aWdhdG9yT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlQcm92aWRlcjogSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD47XG5cdHJlYWRvbmx5IG92ZXJyaWRlU3R5bGVzPzogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+O1xuXHRyZWFkb25seSBzZWxlY3Rpb25OYXZpZ2F0aW9uPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGV4dGVuZHMgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiB7XG5cblx0cHJpdmF0ZSBpbnRlcm5hbHM6IFdvcmtiZW5jaFRyZWVJbnRlcm5hbHM8VElucHV0LCBULCBURmlsdGVyRGF0YT47XG5cdGdldCBjb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2UgeyByZXR1cm4gdGhpcy5pbnRlcm5hbHMuY29udGV4dEtleVNlcnZpY2U7IH1cblx0Z2V0IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLnVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjsgfVxuXHRnZXQgb25EaWRPcGVuKCk6IEV2ZW50PElPcGVuRXZlbnQ8VCB8IHVuZGVmaW5lZD4+IHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLm9uRGlkT3BlbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHZpcnR1YWxEZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0Y29tcHJlc3Npb25EZWxlZ2F0ZTogSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlPFQ+LFxuXHRcdHJlbmRlcmVyczogSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgYW55PltdLFxuXHRcdGRhdGFTb3VyY2U6IElBc3luY0RhdGFTb3VyY2U8VElucHV0LCBUPixcblx0XHRvcHRpb25zOiBJV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaXN0U2VydmljZSBsaXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCB7IG9wdGlvbnM6IHRyZWVPcHRpb25zLCBnZXRUeXBlTmF2aWdhdGlvbk1vZGUsIGRpc3Bvc2FibGUgfSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHdvcmtiZW5jaFRyZWVEYXRhUHJlYW1ibGUsIG9wdGlvbnMgYXMgYW55KTtcblx0XHRzdXBlcih1c2VyLCBjb250YWluZXIsIHZpcnR1YWxEZWxlZ2F0ZSwgY29tcHJlc3Npb25EZWxlZ2F0ZSwgcmVuZGVyZXJzLCBkYXRhU291cmNlLCB0cmVlT3B0aW9ucyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0dGhpcy5pbnRlcm5hbHMgPSBuZXcgV29ya2JlbmNoVHJlZUludGVybmFscyh0aGlzLCBvcHRpb25zLCBnZXRUeXBlTmF2aWdhdGlvbk1vZGUsIG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMsIGNvbnRleHRLZXlTZXJ2aWNlLCBsaXN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW50ZXJuYWxzKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSUNvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlPElBc3luY0RhdGFUcmVlTm9kZTxUSW5wdXQsIFQ+IHwgbnVsbD4pOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RGVmYXVsdFRyZWVGaW5kTW9kZShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdGNvbnN0IHZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2hpZ2hsaWdodCcgfCAnZmlsdGVyJz4oZGVmYXVsdEZpbmRNb2RlU2V0dGluZ0tleSk7XG5cblx0aWYgKHZhbHVlID09PSAnaGlnaGxpZ2h0Jykge1xuXHRcdHJldHVybiBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0O1xuXHR9IGVsc2UgaWYgKHZhbHVlID09PSAnZmlsdGVyJykge1xuXHRcdHJldHVybiBUcmVlRmluZE1vZGUuRmlsdGVyO1xuXHR9XG5cblx0Y29uc3QgZGVwcmVjYXRlZFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3NpbXBsZScgfCAnaGlnaGxpZ2h0JyB8ICdmaWx0ZXInPihrZXlib2FyZE5hdmlnYXRpb25TZXR0aW5nS2V5KTtcblxuXHRpZiAoZGVwcmVjYXRlZFZhbHVlID09PSAnc2ltcGxlJyB8fCBkZXByZWNhdGVkVmFsdWUgPT09ICdoaWdobGlnaHQnKSB7XG5cdFx0cmV0dXJuIFRyZWVGaW5kTW9kZS5IaWdobGlnaHQ7XG5cdH0gZWxzZSBpZiAoZGVwcmVjYXRlZFZhbHVlID09PSAnZmlsdGVyJykge1xuXHRcdHJldHVybiBUcmVlRmluZE1vZGUuRmlsdGVyO1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0RGVmYXVsdFRyZWVGaW5kTWF0Y2hUeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0Y29uc3QgdmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZnV6enknIHwgJ2NvbnRpZ3VvdXMnPihkZWZhdWx0RmluZE1hdGNoVHlwZVNldHRpbmdLZXkpO1xuXG5cdGlmICh2YWx1ZSA9PT0gJ2Z1enp5Jykge1xuXHRcdHJldHVybiBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eTtcblx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2NvbnRpZ3VvdXMnKSB7XG5cdFx0cmV0dXJuIFRyZWVGaW5kTWF0Y2hUeXBlLkNvbnRpZ3VvdXM7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gd29ya2JlbmNoVHJlZURhdGFQcmVhbWJsZTxULCBURmlsdGVyRGF0YSwgVE9wdGlvbnMgZXh0ZW5kcyBJQWJzdHJhY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gfCBJQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+Pihcblx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdG9wdGlvbnM6IFRPcHRpb25zLFxuKTogeyBvcHRpb25zOiBUT3B0aW9uczsgZ2V0VHlwZU5hdmlnYXRpb25Nb2RlOiAoKSA9PiBUeXBlTmF2aWdhdGlvbk1vZGUgfCB1bmRlZmluZWQ7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0ge1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBjb250ZXh0Vmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRWaWV3U2VydmljZSk7XG5cdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0Y29uc3QgZ2V0VHlwZU5hdmlnYXRpb25Nb2RlID0gKCkgPT4ge1xuXHRcdC8vIGdpdmUgcHJpb3JpdHkgdG8gdGhlIGNvbnRleHQga2V5IHZhbHVlIHRvIHNwZWNpZnkgYSB2YWx1ZVxuXHRcdGNvbnN0IG1vZGVTdHJpbmcgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8J2F1dG9tYXRpYycgfCAndHJpZ2dlcic+KFdvcmtiZW5jaExpc3RUeXBlTmF2aWdhdGlvbk1vZGVLZXkpO1xuXG5cdFx0aWYgKG1vZGVTdHJpbmcgPT09ICdhdXRvbWF0aWMnKSB7XG5cdFx0XHRyZXR1cm4gVHlwZU5hdmlnYXRpb25Nb2RlLkF1dG9tYXRpYztcblx0XHR9IGVsc2UgaWYgKG1vZGVTdHJpbmcgPT09ICd0cmlnZ2VyJykge1xuXHRcdFx0cmV0dXJuIFR5cGVOYXZpZ2F0aW9uTW9kZS5UcmlnZ2VyO1xuXHRcdH1cblxuXHRcdC8vIGFsc28gY2hlY2sgdGhlIGRlcHJlY2F0ZWQgY29udGV4dCBrZXkgdG8gc2V0IHRoZSBtb2RlIHRvICd0cmlnZ2VyJ1xuXHRcdGNvbnN0IG1vZGVCb29sZWFuID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPGJvb2xlYW4+KFdvcmtiZW5jaExpc3RBdXRvbWF0aWNLZXlib2FyZE5hdmlnYXRpb25MZWdhY3lLZXkpO1xuXG5cdFx0aWYgKG1vZGVCb29sZWFuID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIFR5cGVOYXZpZ2F0aW9uTW9kZS5UcmlnZ2VyO1xuXHRcdH1cblxuXHRcdC8vIGZpbmFsbHksIGNoZWNrIHRoZSBzZXR0aW5nXG5cdFx0Y29uc3QgY29uZmlnU3RyaW5nID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2F1dG9tYXRpYycgfCAndHJpZ2dlcic+KHR5cGVOYXZpZ2F0aW9uTW9kZVNldHRpbmdLZXkpO1xuXG5cdFx0aWYgKGNvbmZpZ1N0cmluZyA9PT0gJ2F1dG9tYXRpYycpIHtcblx0XHRcdHJldHVybiBUeXBlTmF2aWdhdGlvbk1vZGUuQXV0b21hdGljO1xuXHRcdH0gZWxzZSBpZiAoY29uZmlnU3RyaW5nID09PSAndHJpZ2dlcicpIHtcblx0XHRcdHJldHVybiBUeXBlTmF2aWdhdGlvbk1vZGUuVHJpZ2dlcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9O1xuXG5cdGNvbnN0IGhvcml6b250YWxTY3JvbGxpbmcgPSBvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmcgIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyA6IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkpO1xuXHRjb25zdCBbd29ya2JlbmNoTGlzdE9wdGlvbnMsIGRpc3Bvc2FibGVdID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24odG9Xb3JrYmVuY2hMaXN0T3B0aW9ucywgb3B0aW9ucyk7XG5cdGNvbnN0IHBhZGRpbmdCb3R0b20gPSBvcHRpb25zLnBhZGRpbmdCb3R0b207XG5cdGNvbnN0IHJlbmRlckluZGVudEd1aWRlcyA9IG9wdGlvbnMucmVuZGVySW5kZW50R3VpZGVzICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLnJlbmRlckluZGVudEd1aWRlcyA6IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFJlbmRlckluZGVudEd1aWRlcz4odHJlZVJlbmRlckluZGVudEd1aWRlc0tleSk7XG5cblx0cmV0dXJuIHtcblx0XHRnZXRUeXBlTmF2aWdhdGlvbk1vZGUsXG5cdFx0ZGlzcG9zYWJsZSxcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0b3B0aW9uczoge1xuXHRcdFx0Ly8gLi4ub3B0aW9ucywgLy8gVE9ET0BKb2FvIHdoeSBpcyB0aGlzIG5vdCBzcGxhdHRlZCBoZXJlP1xuXHRcdFx0a2V5Ym9hcmRTdXBwb3J0OiBmYWxzZSxcblx0XHRcdC4uLndvcmtiZW5jaExpc3RPcHRpb25zLFxuXHRcdFx0aW5kZW50OiB0eXBlb2YgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodHJlZUluZGVudEtleSkgPT09ICdudW1iZXInID8gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodHJlZUluZGVudEtleSkgOiB1bmRlZmluZWQsXG5cdFx0XHRyZW5kZXJJbmRlbnRHdWlkZXMsXG5cdFx0XHRzbW9vdGhTY3JvbGxpbmc6IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUobGlzdFNtb290aFNjcm9sbGluZykpLFxuXHRcdFx0ZGVmYXVsdEZpbmRNb2RlOiBvcHRpb25zLmRlZmF1bHRGaW5kTW9kZSA/PyBnZXREZWZhdWx0VHJlZUZpbmRNb2RlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdGRlZmF1bHRGaW5kTWF0Y2hUeXBlOiBvcHRpb25zLmRlZmF1bHRGaW5kTWF0Y2hUeXBlID8/IGdldERlZmF1bHRUcmVlRmluZE1hdGNoVHlwZShjb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nLFxuXHRcdFx0c2Nyb2xsQnlQYWdlOiBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHNjcm9sbEJ5UGFnZUtleSkpLFxuXHRcdFx0cGFkZGluZ0JvdHRvbTogcGFkZGluZ0JvdHRvbSxcblx0XHRcdGhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM6IG9wdGlvbnMuaGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50cyxcblx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogb3B0aW9ucy5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgPz8gKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdzaW5nbGVDbGljaycgfCAnZG91YmxlQ2xpY2snPih0cmVlRXhwYW5kTW9kZSkgPT09ICdkb3VibGVDbGljaycpLFxuXHRcdFx0Y29udGV4dFZpZXdQcm92aWRlcjogY29udGV4dFZpZXdTZXJ2aWNlIGFzIElDb250ZXh0Vmlld1Byb3ZpZGVyLFxuXHRcdFx0ZmluZFdpZGdldFN0eWxlczogZGVmYXVsdEZpbmRXaWRnZXRTdHlsZXMsXG5cdFx0XHRlbmFibGVTdGlja3lTY3JvbGw6IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodHJlZVN0aWNreVNjcm9sbCkpLFxuXHRcdFx0c3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50OiBOdW1iZXIoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUodHJlZVN0aWNreVNjcm9sbE1heEVsZW1lbnRzKSksXG5cdFx0fSBhcyBUT3B0aW9uc1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVdvcmtiZW5jaFRyZWVJbnRlcm5hbHNPcHRpb25zVXBkYXRlIHtcblx0cmVhZG9ubHkgbXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0PzogYm9vbGVhbjtcbn1cblxuY2xhc3MgV29ya2JlbmNoVHJlZUludGVybmFsczxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiB7XG5cblx0cmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElTY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0cHJpdmF0ZSBsaXN0U3VwcG9ydHNNdWx0aVNlbGVjdDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgbGlzdFN1cHBvcnRGaW5kV2lkZ2V0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBoYXNTZWxlY3Rpb25PckZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBoYXNEb3VibGVTZWxlY3Rpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGhhc011bHRpU2VsZWN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB0cmVlRWxlbWVudENhbkNvbGxhcHNlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB0cmVlRWxlbWVudEhhc1BhcmVudDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdHJlZUVsZW1lbnRDYW5FeHBhbmQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHRyZWVFbGVtZW50SGFzQ2hpbGQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHRyZWVGaW5kT3BlbjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdHJlZVN0aWNreVNjcm9sbEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI6IGJvb2xlYW47XG5cdHByaXZhdGUgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRwcml2YXRlIG5hdmlnYXRvcjogVHJlZVJlc291cmNlTmF2aWdhdG9yPFQsIFRGaWx0ZXJEYXRhPjtcblxuXHRnZXQgb25EaWRPcGVuKCk6IEV2ZW50PElPcGVuRXZlbnQ8VCB8IHVuZGVmaW5lZD4+IHsgcmV0dXJuIHRoaXMubmF2aWdhdG9yLm9uRGlkT3BlbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdHJlZTogV29ya2JlbmNoT2JqZWN0VHJlZTxULCBURmlsdGVyRGF0YT4gfCBXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlPFQsIFRGaWx0ZXJEYXRhPiB8IFdvcmtiZW5jaERhdGFUcmVlPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+IHwgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiB8IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YT4sXG5cdFx0b3B0aW9uczogSVdvcmtiZW5jaE9iamVjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiB8IElXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gfCBJV29ya2JlbmNoRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiB8IElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gfCBJV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LFxuXHRcdGdldFR5cGVOYXZpZ2F0aW9uTW9kZTogKCkgPT4gVHlwZU5hdmlnYXRpb25Nb2RlIHwgdW5kZWZpbmVkLFxuXHRcdG92ZXJyaWRlU3R5bGVzOiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz4gfCB1bmRlZmluZWQsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSA9IGNyZWF0ZVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKGNvbnRleHRLZXlTZXJ2aWNlLCB0cmVlKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMucHVzaChjcmVhdGVTY3JvbGxPYnNlcnZlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0cmVlKSk7XG5cblx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0ID0gV29ya2JlbmNoTGlzdFN1cHBvcnRzTXVsdGlTZWxlY3RDb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0LnNldChvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gZmFsc2UpO1xuXG5cdFx0Y29uc3QgbGlzdFNlbGVjdGlvbk5hdmlnYXRpb24gPSBXb3JrYmVuY2hMaXN0U2VsZWN0aW9uTmF2aWdhdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0bGlzdFNlbGVjdGlvbk5hdmlnYXRpb24uc2V0KEJvb2xlYW4ob3B0aW9ucy5zZWxlY3Rpb25OYXZpZ2F0aW9uKSk7XG5cblx0XHR0aGlzLmxpc3RTdXBwb3J0RmluZFdpZGdldCA9IFdvcmtiZW5jaExpc3RTdXBwb3J0c0ZpbmQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMubGlzdFN1cHBvcnRGaW5kV2lkZ2V0LnNldChvcHRpb25zLmZpbmRXaWRnZXRFbmFibGVkID8/IHRydWUpO1xuXG5cdFx0dGhpcy5oYXNTZWxlY3Rpb25PckZvY3VzID0gV29ya2JlbmNoTGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzRG91YmxlU2VsZWN0aW9uID0gV29ya2JlbmNoTGlzdERvdWJsZVNlbGVjdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNNdWx0aVNlbGVjdGlvbiA9IFdvcmtiZW5jaExpc3RNdWx0aVNlbGVjdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnRyZWVFbGVtZW50Q2FuQ29sbGFwc2UgPSBXb3JrYmVuY2hUcmVlRWxlbWVudENhbkNvbGxhcHNlLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnRyZWVFbGVtZW50SGFzUGFyZW50ID0gV29ya2JlbmNoVHJlZUVsZW1lbnRIYXNQYXJlbnQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudHJlZUVsZW1lbnRDYW5FeHBhbmQgPSBXb3JrYmVuY2hUcmVlRWxlbWVudENhbkV4cGFuZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50cmVlRWxlbWVudEhhc0NoaWxkID0gV29ya2JlbmNoVHJlZUVsZW1lbnRIYXNDaGlsZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnRyZWVGaW5kT3BlbiA9IFdvcmtiZW5jaFRyZWVGaW5kT3Blbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50cmVlU3RpY2t5U2Nyb2xsRm9jdXNlZCA9IFdvcmtiZW5jaFRyZWVTdGlja3lTY3JvbGxGb2N1c2VkLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllciA9IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLnVwZGF0ZVN0eWxlT3ZlcnJpZGVzKG92ZXJyaWRlU3R5bGVzKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUNvbGxhcHNlQ29udGV4dEtleXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2N1cyA9IHRyZWUuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdFx0aWYgKCFmb2N1cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5vZGUgPSB0cmVlLmdldE5vZGUoZm9jdXMpO1xuXHRcdFx0dGhpcy50cmVlRWxlbWVudENhbkNvbGxhcHNlLnNldChub2RlLmNvbGxhcHNpYmxlICYmICFub2RlLmNvbGxhcHNlZCk7XG5cdFx0XHR0aGlzLnRyZWVFbGVtZW50SGFzUGFyZW50LnNldCghIXRyZWUuZ2V0UGFyZW50RWxlbWVudChmb2N1cykpO1xuXHRcdFx0dGhpcy50cmVlRWxlbWVudENhbkV4cGFuZC5zZXQobm9kZS5jb2xsYXBzaWJsZSAmJiBub2RlLmNvbGxhcHNlZCk7XG5cdFx0XHR0aGlzLnRyZWVFbGVtZW50SGFzQ2hpbGQuc2V0KCEhdHJlZS5nZXRGaXJzdEVsZW1lbnRDaGlsZChmb2N1cykpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpbnRlcmVzdGluZ0NvbnRleHRLZXlzID0gbmV3IFNldCgpO1xuXHRcdGludGVyZXN0aW5nQ29udGV4dEtleXMuYWRkKFdvcmtiZW5jaExpc3RUeXBlTmF2aWdhdGlvbk1vZGVLZXkpO1xuXHRcdGludGVyZXN0aW5nQ29udGV4dEtleXMuYWRkKFdvcmtiZW5jaExpc3RBdXRvbWF0aWNLZXlib2FyZE5hdmlnYXRpb25MZWdhY3lLZXkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5wdXNoKFxuXHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdChsaXN0U2VydmljZSBhcyBMaXN0U2VydmljZSkucmVnaXN0ZXIodHJlZSksXG5cdFx0XHR0cmVlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0Y29uc3QgZm9jdXMgPSB0cmVlLmdldEZvY3VzKCk7XG5cblx0XHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuaGFzU2VsZWN0aW9uT3JGb2N1cy5zZXQoc2VsZWN0aW9uLmxlbmd0aCA+IDAgfHwgZm9jdXMubGVuZ3RoID4gMCk7XG5cdFx0XHRcdFx0dGhpcy5oYXNNdWx0aVNlbGVjdGlvbi5zZXQoc2VsZWN0aW9uLmxlbmd0aCA+IDEpO1xuXHRcdFx0XHRcdHRoaXMuaGFzRG91YmxlU2VsZWN0aW9uLnNldChzZWxlY3Rpb24ubGVuZ3RoID09PSAyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSxcblx0XHRcdHRyZWUub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IGZvY3VzID0gdHJlZS5nZXRGb2N1cygpO1xuXG5cdFx0XHRcdHRoaXMuaGFzU2VsZWN0aW9uT3JGb2N1cy5zZXQoc2VsZWN0aW9uLmxlbmd0aCA+IDAgfHwgZm9jdXMubGVuZ3RoID4gMCk7XG5cdFx0XHRcdHVwZGF0ZUNvbGxhcHNlQ29udGV4dEtleXMoKTtcblx0XHRcdH0pLFxuXHRcdFx0dHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUodXBkYXRlQ29sbGFwc2VDb250ZXh0S2V5cyksXG5cdFx0XHR0cmVlLm9uRGlkQ2hhbmdlTW9kZWwodXBkYXRlQ29sbGFwc2VDb250ZXh0S2V5cyksXG5cdFx0XHR0cmVlLm9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZShlbmFibGVkID0+IHRoaXMudHJlZUZpbmRPcGVuLnNldChlbmFibGVkKSksXG5cdFx0XHR0cmVlLm9uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsRm9jdXNlZChmb2N1c2VkID0+IHRoaXMudHJlZVN0aWNreVNjcm9sbEZvY3VzZWQuc2V0KGZvY3VzZWQpKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0bGV0IG5ld09wdGlvbnM6IElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlPHVua25vd24+ID0ge307XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKG11bHRpU2VsZWN0TW9kaWZpZXJTZXR0aW5nS2V5KSkge1xuXHRcdFx0XHRcdHRoaXMuX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllciA9IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24odHJlZUluZGVudEtleSkpIHtcblx0XHRcdFx0XHRjb25zdCBpbmRlbnQgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KHRyZWVJbmRlbnRLZXkpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIGluZGVudCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHRyZWVSZW5kZXJJbmRlbnRHdWlkZXNLZXkpICYmIG9wdGlvbnMucmVuZGVySW5kZW50R3VpZGVzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCByZW5kZXJJbmRlbnRHdWlkZXMgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxSZW5kZXJJbmRlbnRHdWlkZXM+KHRyZWVSZW5kZXJJbmRlbnRHdWlkZXNLZXkpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIHJlbmRlckluZGVudEd1aWRlcyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGxpc3RTbW9vdGhTY3JvbGxpbmcpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc21vb3RoU2Nyb2xsaW5nID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShsaXN0U21vb3RoU2Nyb2xsaW5nKSk7XG5cdFx0XHRcdFx0bmV3T3B0aW9ucyA9IHsgLi4ubmV3T3B0aW9ucywgc21vb3RoU2Nyb2xsaW5nIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZGVmYXVsdEZpbmRNb2RlU2V0dGluZ0tleSkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihrZXlib2FyZE5hdmlnYXRpb25TZXR0aW5nS2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IGRlZmF1bHRGaW5kTW9kZSA9IGdldERlZmF1bHRUcmVlRmluZE1vZGUoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIGRlZmF1bHRGaW5kTW9kZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHR5cGVOYXZpZ2F0aW9uTW9kZVNldHRpbmdLZXkpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oa2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleSkpIHtcblx0XHRcdFx0XHRjb25zdCB0eXBlTmF2aWdhdGlvbk1vZGUgPSBnZXRUeXBlTmF2aWdhdGlvbk1vZGUoKTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCB0eXBlTmF2aWdhdGlvbk1vZGUgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihkZWZhdWx0RmluZE1hdGNoVHlwZVNldHRpbmdLZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVmYXVsdEZpbmRNYXRjaFR5cGUgPSBnZXREZWZhdWx0VHJlZUZpbmRNYXRjaFR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIGRlZmF1bHRGaW5kTWF0Y2hUeXBlIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkgJiYgb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsaW5nID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShob3Jpem9udGFsU2Nyb2xsaW5nS2V5KSk7XG5cdFx0XHRcdFx0bmV3T3B0aW9ucyA9IHsgLi4ubmV3T3B0aW9ucywgaG9yaXpvbnRhbFNjcm9sbGluZyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHNjcm9sbEJ5UGFnZUtleSkpIHtcblx0XHRcdFx0XHRjb25zdCBzY3JvbGxCeVBhZ2UgPSBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHNjcm9sbEJ5UGFnZUtleSkpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIHNjcm9sbEJ5UGFnZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHRyZWVFeHBhbmRNb2RlKSAmJiBvcHRpb25zLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0bmV3T3B0aW9ucyA9IHsgLi4ubmV3T3B0aW9ucywgZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnc2luZ2xlQ2xpY2snIHwgJ2RvdWJsZUNsaWNrJz4odHJlZUV4cGFuZE1vZGUpID09PSAnZG91YmxlQ2xpY2snIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24odHJlZVN0aWNreVNjcm9sbCkpIHtcblx0XHRcdFx0XHRjb25zdCBlbmFibGVTdGlja3lTY3JvbGwgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPih0cmVlU3RpY2t5U2Nyb2xsKTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCBlbmFibGVTdGlja3lTY3JvbGwgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbih0cmVlU3RpY2t5U2Nyb2xsTWF4RWxlbWVudHMpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50ID0gTWF0aC5tYXgoMSwgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPih0cmVlU3RpY2t5U2Nyb2xsTWF4RWxlbWVudHMpKTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCBzdGlja3lTY3JvbGxNYXhJdGVtQ291bnQgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHlLZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHlLZXkpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGZhc3RTY3JvbGxTZW5zaXRpdml0eUtleSkpIHtcblx0XHRcdFx0XHRjb25zdCBmYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KGZhc3RTY3JvbGxTZW5zaXRpdml0eUtleSk7XG5cdFx0XHRcdFx0bmV3T3B0aW9ucyA9IHsgLi4ubmV3T3B0aW9ucywgZmFzdFNjcm9sbFNlbnNpdGl2aXR5IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKE9iamVjdC5rZXlzKG5ld09wdGlvbnMpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0cmVlLnVwZGF0ZU9wdGlvbnMobmV3T3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNTb21lKGludGVyZXN0aW5nQ29udGV4dEtleXMpKSB7XG5cdFx0XHRcdFx0dHJlZS51cGRhdGVPcHRpb25zKHsgdHlwZU5hdmlnYXRpb25Nb2RlOiBnZXRUeXBlTmF2aWdhdGlvbk1vZGUoKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0dGhpcy5uYXZpZ2F0b3IgPSBuZXcgVHJlZVJlc291cmNlTmF2aWdhdG9yKHRyZWUsIHsgY29uZmlndXJhdGlvblNlcnZpY2UsIC4uLm9wdGlvbnMgfSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5wdXNoKHRoaXMubmF2aWdhdG9yKTtcblx0fVxuXG5cdGdldCB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSVdvcmtiZW5jaFRyZWVJbnRlcm5hbHNPcHRpb25zVXBkYXRlKTogdm9pZCB7XG5cdFx0aWYgKG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubGlzdFN1cHBvcnRzTXVsdGlTZWxlY3Quc2V0KCEhb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZVN0eWxlT3ZlcnJpZGVzKG92ZXJyaWRlU3R5bGVzPzogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+KTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLnN0eWxlKG92ZXJyaWRlU3R5bGVzID8gZ2V0TGlzdFN0eWxlcyhvdmVycmlkZVN0eWxlcykgOiBkZWZhdWx0TGlzdFN0eWxlcyk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMgPSBkaXNwb3NlKHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG59XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICd3b3JrYmVuY2gnLFxuXHRvcmRlcjogNyxcblx0dGl0bGU6IGxvY2FsaXplKCd3b3JrYmVuY2hDb25maWd1cmF0aW9uVGl0bGUnLCBcIldvcmtiZW5jaFwiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbbXVsdGlTZWxlY3RNb2RpZmllclNldHRpbmdLZXldOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnY3RybENtZCcsICdhbHQnXSxcblx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnbXVsdGlTZWxlY3RNb2RpZmllci5jdHJsQ21kJywgXCJNYXBzIHRvIGBDb250cm9sYCBvbiBXaW5kb3dzIGFuZCBMaW51eCBhbmQgdG8gYENvbW1hbmRgIG9uIG1hY09TLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ211bHRpU2VsZWN0TW9kaWZpZXIuYWx0JywgXCJNYXBzIHRvIGBBbHRgIG9uIFdpbmRvd3MgYW5kIExpbnV4IGFuZCB0byBgT3B0aW9uYCBvbiBtYWNPUy5cIilcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnY3RybENtZCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICdtdWx0aVNlbGVjdE1vZGlmaWVyJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdCctIGBjdHJsQ21kYCByZWZlcnMgdG8gYSB2YWx1ZSB0aGUgc2V0dGluZyBjYW4gdGFrZSBhbmQgc2hvdWxkIG5vdCBiZSBsb2NhbGl6ZWQuJyxcblx0XHRcdFx0XHQnLSBgQ29udHJvbGAgYW5kIGBDb21tYW5kYCByZWZlciB0byB0aGUgbW9kaWZpZXIga2V5cyBDdHJsIG9yIENtZCBvbiB0aGUga2V5Ym9hcmQgYW5kIGNhbiBiZSBsb2NhbGl6ZWQuJ1xuXHRcdFx0XHRdXG5cdFx0XHR9LCBcIlRoZSBtb2RpZmllciB0byBiZSB1c2VkIHRvIGFkZCBhbiBpdGVtIGluIHRyZWVzIGFuZCBsaXN0cyB0byBhIG11bHRpLXNlbGVjdGlvbiB3aXRoIHRoZSBtb3VzZSAoZm9yIGV4YW1wbGUgaW4gdGhlIGV4cGxvcmVyLCBvcGVuIGVkaXRvcnMgYW5kIHNjbSB2aWV3KS4gVGhlICdPcGVuIHRvIFNpZGUnIG1vdXNlIGdlc3R1cmVzIC0gaWYgc3VwcG9ydGVkIC0gd2lsbCBhZGFwdCBzdWNoIHRoYXQgdGhleSBkbyBub3QgY29uZmxpY3Qgd2l0aCB0aGUgbXVsdGlzZWxlY3QgbW9kaWZpZXIuXCIpXG5cdFx0fSxcblx0XHRbb3Blbk1vZGVTZXR0aW5nS2V5XToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3NpbmdsZUNsaWNrJywgJ2RvdWJsZUNsaWNrJ10sXG5cdFx0XHRkZWZhdWx0OiAnc2luZ2xlQ2xpY2snLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnb3Blbk1vZGVNb2RpZmllcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFsnYHNpbmdsZUNsaWNrYCBhbmQgYGRvdWJsZUNsaWNrYCByZWZlcnMgdG8gYSB2YWx1ZSB0aGUgc2V0dGluZyBjYW4gdGFrZSBhbmQgc2hvdWxkIG5vdCBiZSBsb2NhbGl6ZWQuJ11cblx0XHRcdH0sIFwiQ29udHJvbHMgaG93IHRvIG9wZW4gaXRlbXMgaW4gdHJlZXMgYW5kIGxpc3RzIHVzaW5nIHRoZSBtb3VzZSAoaWYgc3VwcG9ydGVkKS4gTm90ZSB0aGF0IHNvbWUgdHJlZXMgYW5kIGxpc3RzIG1pZ2h0IGNob29zZSB0byBpZ25vcmUgdGhpcyBzZXR0aW5nIGlmIGl0IGlzIG5vdCBhcHBsaWNhYmxlLlwiKVxuXHRcdH0sXG5cdFx0W2hvcml6b250YWxTY3JvbGxpbmdLZXldOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaG9yaXpvbnRhbFNjcm9sbGluZyBzZXR0aW5nJywgXCJDb250cm9scyB3aGV0aGVyIGxpc3RzIGFuZCB0cmVlcyBzdXBwb3J0IGhvcml6b250YWwgc2Nyb2xsaW5nIGluIHRoZSB3b3JrYmVuY2guIFdhcm5pbmc6IHR1cm5pbmcgb24gdGhpcyBzZXR0aW5nIGhhcyBhIHBlcmZvcm1hbmNlIGltcGxpY2F0aW9uLlwiKVxuXHRcdH0sXG5cdFx0W3Njcm9sbEJ5UGFnZUtleV06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdsaXN0LnNjcm9sbEJ5UGFnZScsIFwiQ29udHJvbHMgd2hldGhlciBjbGlja3MgaW4gdGhlIHNjcm9sbGJhciBzY3JvbGwgcGFnZSBieSBwYWdlLlwiKVxuXHRcdH0sXG5cdFx0W3RyZWVJbmRlbnRLZXldOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDgsXG5cdFx0XHRtaW5pbXVtOiA0LFxuXHRcdFx0bWF4aW11bTogNDAsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3RyZWUgaW5kZW50IHNldHRpbmcnLCBcIkNvbnRyb2xzIHRyZWUgaW5kZW50YXRpb24gaW4gcGl4ZWxzLlwiKVxuXHRcdH0sXG5cdFx0W3RyZWVSZW5kZXJJbmRlbnRHdWlkZXNLZXldOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnbm9uZScsICdvbkhvdmVyJywgJ2Fsd2F5cyddLFxuXHRcdFx0ZGVmYXVsdDogJ29uSG92ZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW5kZXIgdHJlZSBpbmRlbnQgZ3VpZGVzJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSB0cmVlIHNob3VsZCByZW5kZXIgaW5kZW50IGd1aWRlcy5cIilcblx0XHR9LFxuXHRcdFtsaXN0U21vb3RoU2Nyb2xsaW5nXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2xpc3Qgc21vb3RoU2Nyb2xsaW5nIHNldHRpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbGlzdHMgYW5kIHRyZWVzIGhhdmUgc21vb3RoIHNjcm9sbGluZy5cIiksXG5cdFx0fSxcblx0XHRbbW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5XToge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAxLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ01vdXNlIFdoZWVsIFNjcm9sbCBTZW5zaXRpdml0eScsIFwiQSBtdWx0aXBsaWVyIHRvIGJlIHVzZWQgb24gdGhlIGBkZWx0YVhgIGFuZCBgZGVsdGFZYCBvZiBtb3VzZSB3aGVlbCBzY3JvbGwgZXZlbnRzLlwiKVxuXHRcdH0sXG5cdFx0W2Zhc3RTY3JvbGxTZW5zaXRpdml0eUtleV06IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogNSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdGYXN0IFNjcm9sbCBTZW5zaXRpdml0eScsIFwiU2Nyb2xsaW5nIHNwZWVkIG11bHRpcGxpZXIgd2hlbiBwcmVzc2luZyBgQWx0YC5cIilcblx0XHR9LFxuXHRcdFtkZWZhdWx0RmluZE1vZGVTZXR0aW5nS2V5XToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2hpZ2hsaWdodCcsICdmaWx0ZXInXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ2RlZmF1bHRGaW5kTW9kZVNldHRpbmdLZXkuaGlnaGxpZ2h0JywgXCJIaWdobGlnaHQgZWxlbWVudHMgd2hlbiBzZWFyY2hpbmcuIEZ1cnRoZXIgdXAgYW5kIGRvd24gbmF2aWdhdGlvbiB3aWxsIHRyYXZlcnNlIG9ubHkgdGhlIGhpZ2hsaWdodGVkIGVsZW1lbnRzLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2RlZmF1bHRGaW5kTW9kZVNldHRpbmdLZXkuZmlsdGVyJywgXCJGaWx0ZXIgZWxlbWVudHMgd2hlbiBzZWFyY2hpbmcuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2hpZ2hsaWdodCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2RlZmF1bHRGaW5kTW9kZVNldHRpbmdLZXknLCBcIkNvbnRyb2xzIHRoZSBkZWZhdWx0IGZpbmQgbW9kZSBmb3IgbGlzdHMgYW5kIHRyZWVzIGluIHRoZSB3b3JrYmVuY2guXCIpXG5cdFx0fSxcblx0XHRba2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydzaW1wbGUnLCAnaGlnaGxpZ2h0JywgJ2ZpbHRlciddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgna2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleS5zaW1wbGUnLCBcIlNpbXBsZSBrZXlib2FyZCBuYXZpZ2F0aW9uIGZvY3VzZXMgZWxlbWVudHMgd2hpY2ggbWF0Y2ggdGhlIGtleWJvYXJkIGlucHV0LiBNYXRjaGluZyBpcyBkb25lIG9ubHkgb24gcHJlZml4ZXMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgna2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleS5oaWdobGlnaHQnLCBcIkhpZ2hsaWdodCBrZXlib2FyZCBuYXZpZ2F0aW9uIGhpZ2hsaWdodHMgZWxlbWVudHMgd2hpY2ggbWF0Y2ggdGhlIGtleWJvYXJkIGlucHV0LiBGdXJ0aGVyIHVwIGFuZCBkb3duIG5hdmlnYXRpb24gd2lsbCB0cmF2ZXJzZSBvbmx5IHRoZSBoaWdobGlnaHRlZCBlbGVtZW50cy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdrZXlib2FyZE5hdmlnYXRpb25TZXR0aW5nS2V5LmZpbHRlcicsIFwiRmlsdGVyIGtleWJvYXJkIG5hdmlnYXRpb24gd2lsbCBmaWx0ZXIgb3V0IGFuZCBoaWRlIGFsbCB0aGUgZWxlbWVudHMgd2hpY2ggZG8gbm90IG1hdGNoIHRoZSBrZXlib2FyZCBpbnB1dC5cIilcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnaGlnaGxpZ2h0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgna2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleScsIFwiQ29udHJvbHMgdGhlIGtleWJvYXJkIG5hdmlnYXRpb24gc3R5bGUgZm9yIGxpc3RzIGFuZCB0cmVlcyBpbiB0aGUgd29ya2JlbmNoLiBDYW4gYmUgc2ltcGxlLCBoaWdobGlnaHQgYW5kIGZpbHRlci5cIiksXG5cdFx0XHRkZXByZWNhdGVkOiB0cnVlLFxuXHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgna2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleURlcHJlY2F0ZWQnLCBcIlBsZWFzZSB1c2UgJ3dvcmtiZW5jaC5saXN0LmRlZmF1bHRGaW5kTW9kZScgYW5kXHQnd29ya2JlbmNoLmxpc3QudHlwZU5hdmlnYXRpb25Nb2RlJyBpbnN0ZWFkLlwiKVxuXHRcdH0sXG5cdFx0W2RlZmF1bHRGaW5kTWF0Y2hUeXBlU2V0dGluZ0tleV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydmdXp6eScsICdjb250aWd1b3VzJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdkZWZhdWx0RmluZE1hdGNoVHlwZVNldHRpbmdLZXkuZnV6enknLCBcIlVzZSBmdXp6eSBtYXRjaGluZyB3aGVuIHNlYXJjaGluZy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdkZWZhdWx0RmluZE1hdGNoVHlwZVNldHRpbmdLZXkuY29udGlndW91cycsIFwiVXNlIGNvbnRpZ3VvdXMgbWF0Y2hpbmcgd2hlbiBzZWFyY2hpbmcuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2Z1enp5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGVmYXVsdEZpbmRNYXRjaFR5cGVTZXR0aW5nS2V5JywgXCJDb250cm9scyB0aGUgdHlwZSBvZiBtYXRjaGluZyB1c2VkIHdoZW4gc2VhcmNoaW5nIGxpc3RzIGFuZCB0cmVlcyBpbiB0aGUgd29ya2JlbmNoLlwiKVxuXHRcdH0sXG5cdFx0W3RyZWVFeHBhbmRNb2RlXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3NpbmdsZUNsaWNrJywgJ2RvdWJsZUNsaWNrJ10sXG5cdFx0XHRkZWZhdWx0OiAnc2luZ2xlQ2xpY2snLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdleHBhbmQgbW9kZScsIFwiQ29udHJvbHMgaG93IHRyZWUgZm9sZGVycyBhcmUgZXhwYW5kZWQgd2hlbiBjbGlja2luZyB0aGUgZm9sZGVyIG5hbWVzLiBOb3RlIHRoYXQgc29tZSB0cmVlcyBhbmQgbGlzdHMgbWlnaHQgY2hvb3NlIHRvIGlnbm9yZSB0aGlzIHNldHRpbmcgaWYgaXQgaXMgbm90IGFwcGxpY2FibGUuXCIpLFxuXHRcdH0sXG5cdFx0W3RyZWVTdGlja3lTY3JvbGxdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzdGlja3kgc2Nyb2xsJywgXCJDb250cm9scyB3aGV0aGVyIHN0aWNreSBzY3JvbGxpbmcgaXMgZW5hYmxlZCBpbiB0cmVlcy5cIiksXG5cdFx0fSxcblx0XHRbdHJlZVN0aWNreVNjcm9sbE1heEVsZW1lbnRzXToge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRtaW5pbXVtOiAxLFxuXHRcdFx0ZGVmYXVsdDogNyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdzdGlja3kgc2Nyb2xsIG1heGltdW0gaXRlbXMnLCBcIkNvbnRyb2xzIHRoZSBudW1iZXIgb2Ygc3RpY2t5IGVsZW1lbnRzIGRpc3BsYXllZCBpbiB0aGUgdHJlZSB3aGVuIHswfSBpcyBlbmFibGVkLlwiLCAnYCN3b3JrYmVuY2gudHJlZS5lbmFibGVTdGlja3lTY3JvbGwjYCcpLFxuXHRcdH0sXG5cdFx0W3R5cGVOYXZpZ2F0aW9uTW9kZVNldHRpbmdLZXldOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYXV0b21hdGljJywgJ3RyaWdnZXInXSxcblx0XHRcdGRlZmF1bHQ6ICdhdXRvbWF0aWMnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3R5cGVOYXZpZ2F0aW9uTW9kZTInLCBcIkNvbnRyb2xzIGhvdyB0eXBlIG5hdmlnYXRpb24gd29ya3MgaW4gbGlzdHMgYW5kIHRyZWVzIGluIHRoZSB3b3JrYmVuY2guIFdoZW4gc2V0IHRvIGB0cmlnZ2VyYCwgdHlwZSBuYXZpZ2F0aW9uIGJlZ2lucyBvbmNlIHRoZSBgbGlzdC50cmlnZ2VyVHlwZU5hdmlnYXRpb25gIGNvbW1hbmQgaXMgcnVuLlwiKSxcblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGlCQUFpQix1QkFBdUI7QUFHakQsU0FBNEMsaUJBQWlCO0FBQzdELFNBQWtKLDZCQUE2Qiw4QkFBOEIsTUFBTSwwQkFBMEI7QUFFN08sU0FBMkQsYUFBYTtBQUN4RSxTQUEr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TUFBTSxDQUFDLGVBQWUsYUFBYTtBQUFBLE1BQ25DLFNBQVM7QUFBQSxNQUNULGFBQWEsU0FBUyxlQUFlLG9LQUFvSztBQUFBLElBQzFNO0FBQUEsSUFDQSxDQUFDLGdCQUFnQixHQUFHO0FBQUEsTUFDbkIsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsYUFBYSxTQUFTLGlCQUFpQix3REFBd0Q7QUFBQSxJQUNoRztBQUFBLElBQ0EsQ0FBQywyQkFBMkIsR0FBRztBQUFBLE1BQzlCLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxNQUNULHFCQUFxQixTQUFTLCtCQUErQixxRkFBcUYsdUNBQXVDO0FBQUEsSUFDMUw7QUFBQSxJQUNBLENBQUMsNEJBQTRCLEdBQUc7QUFBQSxNQUMvQixNQUFNO0FBQUEsTUFDTixNQUFNLENBQUMsYUFBYSxTQUFTO0FBQUEsTUFDN0IsU0FBUztBQUFBLE1BQ1QscUJBQXFCLFNBQVMsdUJBQXVCLDZLQUE2SztBQUFBLElBQ25PO0FBQUEsRUFDRDtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbIm9wdGlvbnMiLCAiaG9yaXpvbnRhbFNjcm9sbGluZyJdCn0K
