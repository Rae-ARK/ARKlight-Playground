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
import { localize } from "../../../../../../nls.js";
import * as DOM from "../../../../../../base/browser/dom.js";
import { ToolBar } from "../../../../../../base/browser/ui/toolbar/toolbar.js";
import { IconLabel } from "../../../../../../base/browser/ui/iconLabel/iconLabel.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { createMatches } from "../../../../../../base/common/filters.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { getIconClassesForLanguageId } from "../../../../../../editor/common/services/getIconClasses.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../../../platform/configuration/common/configurationRegistry.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { MarkerSeverity } from "../../../../../../platform/markers/common/markers.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { listErrorForeground, listWarningForeground } from "../../../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { Extensions as WorkbenchExtensions } from "../../../../../common/contributions.js";
import { CellFoldingState, CellRevealType } from "../../notebookBrowser.js";
import { NotebookEditor } from "../../notebookEditor.js";
import { CellKind, NotebookCellsChangeType, NotebookSetting } from "../../../common/notebookCommon.js";
import { IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IOutlineService, OutlineConfigCollapseItemsValues, OutlineConfigKeys, OutlineTarget } from "../../../../../services/outline/browser/outline.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { Action2, IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../../platform/contextkey/common/contextkey.js";
import { MenuEntryActionViewItem, getActionBarActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Delayer, disposableTimeout } from "../../../../../../base/common/async.js";
import { IOutlinePane } from "../../../../outline/browser/outline.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { NOTEBOOK_IS_ACTIVE_EDITOR } from "../../../common/notebookContextKeys.js";
import { NotebookOutlineConstants } from "../../viewModel/notebookOutlineEntryFactory.js";
import { INotebookCellOutlineDataSourceFactory } from "../../viewModel/notebookOutlineDataSourceFactory.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { safeIntl } from "../../../../../../base/common/date.js";
class NotebookOutlineTemplate {
  constructor(container, iconClass, iconLabel, decoration, actionMenu, elementDisposables) {
    this.container = container;
    this.iconClass = iconClass;
    this.iconLabel = iconLabel;
    this.decoration = decoration;
    this.actionMenu = actionMenu;
    this.elementDisposables = elementDisposables;
  }
}
NotebookOutlineTemplate.templateId = "NotebookOutlineRenderer";
let NotebookOutlineRenderer = class {
  constructor(_editor, _target, _themeService, _configurationService, _contextMenuService, _contextKeyService, _menuService, _instantiationService) {
    this._editor = _editor;
    this._target = _target;
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._contextMenuService = _contextMenuService;
    this._contextKeyService = _contextKeyService;
    this._menuService = _menuService;
    this._instantiationService = _instantiationService;
    this.templateId = NotebookOutlineTemplate.templateId;
  }
  renderTemplate(container) {
    const elementDisposables = new DisposableStore();
    container.classList.add("notebook-outline-element", "show-file-icons");
    const iconClass = document.createElement("div");
    container.append(iconClass);
    const iconLabel = new IconLabel(container, { supportHighlights: true });
    const decoration = document.createElement("div");
    decoration.className = "element-decoration";
    container.append(decoration);
    const actionMenu = document.createElement("div");
    actionMenu.className = "action-menu";
    container.append(actionMenu);
    return new NotebookOutlineTemplate(container, iconClass, iconLabel, decoration, actionMenu, elementDisposables);
  }
  renderElement(node, _index, template) {
    const extraClasses = [];
    const options = {
      matches: createMatches(node.filterData),
      labelEscapeNewLines: true,
      extraClasses
    };
    const isCodeCell = node.element.cell.cellKind === CellKind.Code;
    if (node.element.level >= 8) {
      template.iconClass.className = "element-icon " + ThemeIcon.asClassNameArray(node.element.icon).join(" ");
    } else if (isCodeCell && this._themeService.getFileIconTheme().hasFileIcons && !node.element.isExecuting) {
      template.iconClass.className = "";
      extraClasses.push(...getIconClassesForLanguageId(node.element.cell.language ?? ""));
    } else {
      template.iconClass.className = "element-icon " + ThemeIcon.asClassNameArray(node.element.icon).join(" ");
    }
    template.iconLabel.setLabel(" " + node.element.label, void 0, options);
    const { markerInfo } = node.element;
    template.container.style.removeProperty("--outline-element-color");
    template.decoration.innerText = "";
    if (markerInfo) {
      const problem = this._configurationService.getValue("problems.visibility");
      const useBadges = this._configurationService.getValue(OutlineConfigKeys.problemsBadges);
      if (!useBadges || !problem) {
        template.decoration.classList.remove("bubble");
        template.decoration.innerText = "";
      } else if (markerInfo.count === 0) {
        template.decoration.classList.add("bubble");
        template.decoration.innerText = "\uEA71";
      } else {
        template.decoration.classList.remove("bubble");
        template.decoration.innerText = markerInfo.count > 9 ? "9+" : String(markerInfo.count);
      }
      const color = this._themeService.getColorTheme().getColor(markerInfo.topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground);
      if (problem === void 0) {
        return;
      }
      const useColors = this._configurationService.getValue(OutlineConfigKeys.problemsColors);
      if (!useColors || !problem) {
        template.container.style.removeProperty("--outline-element-color");
        template.decoration.style.setProperty("--outline-element-color", color?.toString() ?? "inherit");
      } else {
        template.container.style.setProperty("--outline-element-color", color?.toString() ?? "inherit");
      }
    }
    if (this._target === OutlineTarget.OutlinePane) {
      if (!this._editor) {
        return;
      }
      const nbCell = node.element.cell;
      const nbViewModel = this._editor.getViewModel();
      if (!nbViewModel) {
        return;
      }
      const idx = nbViewModel.getCellIndex(nbCell);
      const length = isCodeCell ? 0 : nbViewModel.getFoldedLength(idx);
      const scopedContextKeyService = template.elementDisposables.add(this._contextKeyService.createScoped(template.container));
      NotebookOutlineContext.CellKind.bindTo(scopedContextKeyService).set(isCodeCell ? CellKind.Code : CellKind.Markup);
      NotebookOutlineContext.CellHasChildren.bindTo(scopedContextKeyService).set(length > 0);
      NotebookOutlineContext.CellHasHeader.bindTo(scopedContextKeyService).set(node.element.level !== NotebookOutlineConstants.NonHeaderOutlineLevel);
      NotebookOutlineContext.OutlineElementTarget.bindTo(scopedContextKeyService).set(this._target);
      this.setupFolding(isCodeCell, nbViewModel, scopedContextKeyService, template, nbCell);
      const outlineEntryToolbar = template.elementDisposables.add(new ToolBar(template.actionMenu, this._contextMenuService, {
        actionViewItemProvider: (action) => {
          if (action instanceof MenuItemAction) {
            return this._instantiationService.createInstance(MenuEntryActionViewItem, action, void 0);
          }
          return void 0;
        }
      }));
      const menu = template.elementDisposables.add(this._menuService.createMenu(MenuId.NotebookOutlineActionMenu, scopedContextKeyService));
      const actions = getOutlineToolbarActions(menu, { notebookEditor: this._editor, outlineEntry: node.element });
      outlineEntryToolbar.setActions(actions.primary, actions.secondary);
      this.setupToolbarListeners(this._editor, outlineEntryToolbar, menu, actions, node.element, template);
      template.actionMenu.style.padding = "0 0.8em 0 0.4em";
    }
  }
  disposeTemplate(templateData) {
    templateData.iconLabel.dispose();
    templateData.elementDisposables.dispose();
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    DOM.clearNode(templateData.actionMenu);
  }
  setupFolding(isCodeCell, nbViewModel, scopedContextKeyService, template, nbCell) {
    const foldingState = isCodeCell ? CellFoldingState.None : nbCell.foldingState;
    const foldingStateCtx = NotebookOutlineContext.CellFoldingState.bindTo(scopedContextKeyService);
    foldingStateCtx.set(foldingState);
    if (!isCodeCell) {
      template.elementDisposables.add(nbViewModel.onDidFoldingStateChanged(() => {
        const foldingState2 = nbCell.foldingState;
        NotebookOutlineContext.CellFoldingState.bindTo(scopedContextKeyService).set(foldingState2);
        foldingStateCtx.set(foldingState2);
      }));
    }
  }
  setupToolbarListeners(editor, toolbar, menu, initActions, entry, templateData) {
    let dropdownIsVisible = false;
    let deferredUpdate;
    toolbar.setActions(initActions.primary, initActions.secondary);
    templateData.elementDisposables.add(menu.onDidChange(() => {
      if (dropdownIsVisible) {
        const actions2 = getOutlineToolbarActions(menu, { notebookEditor: editor, outlineEntry: entry });
        deferredUpdate = () => toolbar.setActions(actions2.primary, actions2.secondary);
        return;
      }
      const actions = getOutlineToolbarActions(menu, { notebookEditor: editor, outlineEntry: entry });
      toolbar.setActions(actions.primary, actions.secondary);
    }));
    templateData.container.classList.remove("notebook-outline-toolbar-dropdown-active");
    templateData.elementDisposables.add(toolbar.onDidChangeDropdownVisibility((visible) => {
      dropdownIsVisible = visible;
      if (visible) {
        templateData.container.classList.add("notebook-outline-toolbar-dropdown-active");
      } else {
        templateData.container.classList.remove("notebook-outline-toolbar-dropdown-active");
      }
      if (deferredUpdate && !visible) {
        disposableTimeout(() => {
          deferredUpdate?.();
        }, 0, templateData.elementDisposables);
        deferredUpdate = void 0;
      }
    }));
  }
};
NotebookOutlineRenderer = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IInstantiationService)
], NotebookOutlineRenderer);
function getOutlineToolbarActions(menu, args) {
  return getActionBarActions(menu.getActions({ shouldForwardArgs: true, arg: args }), (g) => /^inline/.test(g));
}
class NotebookOutlineAccessibility {
  getAriaLabel(element) {
    return element.label;
  }
  getWidgetAriaLabel() {
    return "";
  }
}
class NotebookNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    return element.label;
  }
}
class NotebookOutlineVirtualDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(_element) {
    return NotebookOutlineTemplate.templateId;
  }
}
let NotebookQuickPickProvider = class {
  constructor(notebookCellOutlineDataSourceRef, _configurationService, _themeService) {
    this.notebookCellOutlineDataSourceRef = notebookCellOutlineDataSourceRef;
    this._configurationService = _configurationService;
    this._themeService = _themeService;
    this._disposables = new DisposableStore();
    this.gotoShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.gotoSymbolsAllSymbols);
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.gotoSymbolsAllSymbols)) {
        this.gotoShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.gotoSymbolsAllSymbols);
      }
    }));
  }
  getQuickPickElements() {
    const bucket = [];
    for (const entry of this.notebookCellOutlineDataSourceRef?.object?.entries ?? []) {
      entry.asFlatList(bucket);
    }
    const result = [];
    const { hasFileIcons } = this._themeService.getFileIconTheme();
    const isSymbol = (element) => !!element.symbolKind;
    const isCodeCell = (element) => element.cell.cellKind === CellKind.Code && element.level === NotebookOutlineConstants.NonHeaderOutlineLevel;
    for (let i = 0; i < bucket.length; i++) {
      const element = bucket[i];
      const nextElement = bucket[i + 1];
      if (!this.gotoShowCodeCellSymbols && isSymbol(element)) {
        continue;
      }
      if (this.gotoShowCodeCellSymbols && isCodeCell(element) && nextElement && isSymbol(nextElement)) {
        continue;
      }
      const useFileIcon = hasFileIcons && !element.symbolKind;
      result.push({
        element,
        label: useFileIcon ? element.label : `$(${element.icon.id}) ${element.label}`,
        ariaLabel: element.label,
        iconClasses: useFileIcon ? getIconClassesForLanguageId(element.cell.language ?? "") : void 0
      });
    }
    return result;
  }
  dispose() {
    this._disposables.dispose();
  }
};
NotebookQuickPickProvider = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IThemeService)
], NotebookQuickPickProvider);
function filterEntry(entry, showMarkdownHeadersOnly, showCodeCells, showCodeCellSymbols) {
  if (showMarkdownHeadersOnly && entry.cell.cellKind === CellKind.Markup && entry.level === NotebookOutlineConstants.NonHeaderOutlineLevel || // show headers only   + cell is mkdn + is level 7 (not header)
  !showCodeCells && entry.cell.cellKind === CellKind.Code || // show code cells off + cell is code
  !showCodeCellSymbols && entry.cell.cellKind === CellKind.Code && entry.level > NotebookOutlineConstants.NonHeaderOutlineLevel) {
    return true;
  }
  return false;
}
let NotebookOutlinePaneProvider = class {
  constructor(outlineDataSourceRef, _configurationService) {
    this.outlineDataSourceRef = outlineDataSourceRef;
    this._configurationService = _configurationService;
    this._disposables = new DisposableStore();
    this.showCodeCells = this._configurationService.getValue(NotebookSetting.outlineShowCodeCells);
    this.showCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
    this.showMarkdownHeadersOnly = this._configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.outlineShowCodeCells)) {
        this.showCodeCells = this._configurationService.getValue(NotebookSetting.outlineShowCodeCells);
      }
      if (e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols)) {
        this.showCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
      }
      if (e.affectsConfiguration(NotebookSetting.outlineShowMarkdownHeadersOnly)) {
        this.showMarkdownHeadersOnly = this._configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
      }
    }));
  }
  getActiveEntry() {
    const newActive = this.outlineDataSourceRef?.object?.activeElement;
    if (!newActive) {
      return void 0;
    }
    if (!filterEntry(newActive, this.showMarkdownHeadersOnly, this.showCodeCells, this.showCodeCellSymbols)) {
      return newActive;
    }
    let parent = newActive.parent;
    while (parent) {
      if (filterEntry(parent, this.showMarkdownHeadersOnly, this.showCodeCells, this.showCodeCellSymbols)) {
        parent = parent.parent;
      } else {
        return parent;
      }
    }
    return void 0;
  }
  *getChildren(element) {
    const isOutline = element instanceof NotebookCellOutline;
    const entries = isOutline ? this.outlineDataSourceRef?.object?.entries ?? [] : element.children;
    for (const entry of entries) {
      if (entry.cell.cellKind === CellKind.Markup) {
        if (!this.showMarkdownHeadersOnly) {
          yield entry;
        } else if (entry.level < NotebookOutlineConstants.NonHeaderOutlineLevel) {
          yield entry;
        }
      } else if (this.showCodeCells && entry.cell.cellKind === CellKind.Code) {
        if (this.showCodeCellSymbols) {
          yield entry;
        } else if (entry.level === NotebookOutlineConstants.NonHeaderOutlineLevel) {
          yield entry;
        }
      }
    }
  }
  dispose() {
    this._disposables.dispose();
  }
};
NotebookOutlinePaneProvider = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookOutlinePaneProvider);
let NotebookBreadcrumbsProvider = class {
  constructor(outlineDataSourceRef, _configurationService) {
    this.outlineDataSourceRef = outlineDataSourceRef;
    this._configurationService = _configurationService;
    this._disposables = new DisposableStore();
    this.showCodeCells = this._configurationService.getValue(NotebookSetting.breadcrumbsShowCodeCells);
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.breadcrumbsShowCodeCells)) {
        this.showCodeCells = this._configurationService.getValue(NotebookSetting.breadcrumbsShowCodeCells);
      }
    }));
  }
  getBreadcrumbElements() {
    const result = [];
    let candidate = this.outlineDataSourceRef?.object?.activeElement;
    while (candidate) {
      if (this.showCodeCells || candidate.cell.cellKind !== CellKind.Code) {
        result.unshift({ element: candidate, label: candidate.label });
      }
      candidate = candidate.parent;
    }
    return result;
  }
  dispose() {
    this._disposables.dispose();
  }
};
NotebookBreadcrumbsProvider = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookBreadcrumbsProvider);
class NotebookComparator {
  constructor() {
    this._collator = safeIntl.Collator(void 0, { numeric: true });
  }
  compareByPosition(a, b) {
    return a.index - b.index;
  }
  compareByType(a, b) {
    return a.cell.cellKind - b.cell.cellKind || this._collator.value.compare(a.label, b.label);
  }
  compareByName(a, b) {
    return this._collator.value.compare(a.label, b.label);
  }
}
let NotebookCellOutline = class {
  constructor(_editor, _target, _themeService, _editorService, _instantiationService, _configurationService, _languageFeaturesService, _notebookExecutionStateService) {
    this._editor = _editor;
    this._target = _target;
    this._themeService = _themeService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._languageFeaturesService = _languageFeaturesService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this.outlineKind = "notebookCells";
    this._disposables = new DisposableStore();
    this._modelDisposables = new DisposableStore();
    this._dataSourceDisposables = new DisposableStore();
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this.delayerRecomputeState = this._disposables.add(new Delayer(300));
    this.delayerRecomputeActive = this._disposables.add(new Delayer(200));
    // this can be long, because it will force a recompute at the end, so ideally we only do this once all nb language features are registered
    this.delayerRecomputeSymbols = this._disposables.add(new Delayer(2e3));
    this.outlineShowCodeCells = this._configurationService.getValue(NotebookSetting.outlineShowCodeCells);
    this.outlineShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
    this.outlineShowMarkdownHeadersOnly = this._configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
    this.initializeOutline();
    const delegate = new NotebookOutlineVirtualDelegate();
    const renderers = [this._instantiationService.createInstance(NotebookOutlineRenderer, this._editor.getControl(), this._target)];
    const comparator = new NotebookComparator();
    const options = {
      collapseByDefault: this._target === OutlineTarget.Breadcrumbs || this._target === OutlineTarget.OutlinePane && this._configurationService.getValue(OutlineConfigKeys.collapseItems) === OutlineConfigCollapseItemsValues.Collapsed,
      expandOnlyOnTwistieClick: true,
      multipleSelectionSupport: false,
      accessibilityProvider: new NotebookOutlineAccessibility(),
      identityProvider: { getId: (element) => element.cell.uri.toString() },
      keyboardNavigationLabelProvider: new NotebookNavigationLabelProvider()
    };
    this.config = {
      treeDataSource: this._treeDataSource,
      quickPickDataSource: this._quickPickDataSource,
      breadcrumbsDataSource: this._breadcrumbsDataSource,
      delegate,
      renderers,
      comparator,
      options
    };
  }
  // getters
  get activeElement() {
    this.checkDelayer();
    if (this._target === OutlineTarget.OutlinePane) {
      return this.config.treeDataSource.getActiveEntry();
    } else {
      console.error("activeElement should not be called outside of the OutlinePane");
      return void 0;
    }
  }
  get entries() {
    this.checkDelayer();
    return this._outlineDataSourceReference?.object?.entries ?? [];
  }
  get uri() {
    return this._outlineDataSourceReference?.object?.uri;
  }
  get isEmpty() {
    if (!this._outlineDataSourceReference?.object?.entries) {
      return true;
    }
    return !this._outlineDataSourceReference.object.entries.some((entry) => {
      return !filterEntry(entry, this.outlineShowMarkdownHeadersOnly, this.outlineShowCodeCells, this.outlineShowCodeCellSymbols);
    });
  }
  checkDelayer() {
    if (this.delayerRecomputeState.isTriggered()) {
      this.delayerRecomputeState.cancel();
      this.recomputeState();
    }
  }
  initializeOutline() {
    this.setDataSources();
    this.setModelListeners();
    this._disposables.add(this._editor.onDidChangeModel(() => {
      this.setDataSources();
      this.setModelListeners();
      this.computeSymbols();
    }));
    this._disposables.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => {
      this.delayedComputeSymbols();
    }));
    this._disposables.add(this._editor.onDidChangeSelection(() => {
      this.delayedRecomputeActive();
    }));
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.outlineShowMarkdownHeadersOnly) || e.affectsConfiguration(NotebookSetting.outlineShowCodeCells) || e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols) || e.affectsConfiguration(NotebookSetting.breadcrumbsShowCodeCells)) {
        this.outlineShowCodeCells = this._configurationService.getValue(NotebookSetting.outlineShowCodeCells);
        this.outlineShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
        this.outlineShowMarkdownHeadersOnly = this._configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
        this.delayedRecomputeState();
      }
    }));
    this._disposables.add(this._notebookExecutionStateService.onDidChangeExecution((e) => {
      if (e.type === NotebookExecutionType.cell && !!this._editor.textModel && e.affectsNotebook(this._editor.textModel?.uri)) {
        this.delayedRecomputeState();
      }
    }));
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols)) {
        this.outlineShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
        this.computeSymbols();
      }
    }));
    this._disposables.add(this._themeService.onDidFileIconThemeChange(() => {
      this._onDidChange.fire({});
    }));
    this.recomputeState();
  }
  /**
   * set up the primary data source + three viewing sources for the various outline views
   */
  setDataSources() {
    const notebookEditor = this._editor.getControl();
    this._outlineDataSourceReference?.dispose();
    this._dataSourceDisposables.clear();
    if (!notebookEditor?.hasModel()) {
      this._outlineDataSourceReference = void 0;
    } else {
      this._outlineDataSourceReference = this._dataSourceDisposables.add(this._instantiationService.invokeFunction((accessor) => accessor.get(INotebookCellOutlineDataSourceFactory).getOrCreate(notebookEditor)));
      this._dataSourceDisposables.add(this._outlineDataSourceReference.object.onDidChange(() => {
        this._onDidChange.fire({});
      }));
    }
    this._treeDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookOutlinePaneProvider, this._outlineDataSourceReference));
    this._quickPickDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookQuickPickProvider, this._outlineDataSourceReference));
    this._breadcrumbsDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookBreadcrumbsProvider, this._outlineDataSourceReference));
  }
  /**
   * set up the listeners for the outline content, these respond to model changes in the notebook
   */
  setModelListeners() {
    this._modelDisposables.clear();
    if (!this._editor.textModel) {
      return;
    }
    if (!this.entries.length) {
      this.computeSymbols();
    }
    this._modelDisposables.add(this._editor.textModel.onDidChangeContent((contentChanges) => {
      if (contentChanges.rawEvents.some((c) => c.kind === NotebookCellsChangeType.ChangeCellContent || c.kind === NotebookCellsChangeType.ChangeCellInternalMetadata || c.kind === NotebookCellsChangeType.Move || c.kind === NotebookCellsChangeType.ModelChange)) {
        this.delayedRecomputeState();
      }
    }));
  }
  async computeSymbols(cancelToken = CancellationToken.None) {
    if (this._target === OutlineTarget.OutlinePane && this.outlineShowCodeCellSymbols) {
      void this.doComputeSymbols(cancelToken);
    }
  }
  async doComputeSymbols(cancelToken) {
    await this._outlineDataSourceReference?.object?.computeFullSymbols(cancelToken);
  }
  async delayedComputeSymbols() {
    this.delayerRecomputeState.cancel();
    this.delayerRecomputeActive.cancel();
    this.delayerRecomputeSymbols.trigger(() => {
      this.computeSymbols();
    });
  }
  recomputeState() {
    this._outlineDataSourceReference?.object?.recomputeState();
  }
  delayedRecomputeState() {
    this.delayerRecomputeActive.cancel();
    this.delayerRecomputeState.trigger(() => {
      this.recomputeState();
    });
  }
  recomputeActive() {
    this._outlineDataSourceReference?.object?.recomputeActive();
  }
  delayedRecomputeActive() {
    this.delayerRecomputeActive.trigger(() => {
      this.recomputeActive();
    });
  }
  async reveal(entry, options, sideBySide) {
    const notebookEditorOptions = {
      ...options,
      override: this._editor.input?.editorId,
      cellRevealType: CellRevealType.Top,
      selection: entry.position,
      viewState: void 0
    };
    await this._editorService.openEditor({
      resource: entry.cell.uri,
      options: notebookEditorOptions
    }, sideBySide ? SIDE_GROUP : void 0);
  }
  preview(entry) {
    const widget = this._editor.getControl();
    if (!widget) {
      return Disposable.None;
    }
    if (entry.range) {
      const range = Range.lift(entry.range);
      widget.revealRangeInCenterIfOutsideViewportAsync(entry.cell, range);
    } else {
      widget.revealInCenterIfOutsideViewport(entry.cell);
    }
    const ids = widget.deltaCellDecorations([], [{
      handle: entry.cell.handle,
      options: { className: "nb-symbolHighlight", outputClassName: "nb-symbolHighlight" }
    }]);
    let editorDecorations;
    widget.changeModelDecorations((accessor) => {
      if (entry.range) {
        const decorations = [
          {
            range: entry.range,
            options: {
              description: "document-symbols-outline-range-highlight",
              className: "rangeHighlight",
              isWholeLine: true
            }
          }
        ];
        const deltaDecoration = {
          ownerId: entry.cell.handle,
          decorations
        };
        editorDecorations = accessor.deltaDecorations([], [deltaDecoration]);
      }
    });
    return toDisposable(() => {
      widget.deltaCellDecorations(ids, []);
      if (editorDecorations?.length) {
        widget.changeModelDecorations((accessor) => {
          accessor.deltaDecorations(editorDecorations, []);
        });
      }
    });
  }
  captureViewState() {
    const widget = this._editor.getControl();
    const viewState = widget?.getEditorViewState();
    return toDisposable(() => {
      if (viewState) {
        widget?.restoreListViewState(viewState);
      }
    });
  }
  dispose() {
    this._onDidChange.dispose();
    this._disposables.dispose();
    this._modelDisposables.dispose();
    this._dataSourceDisposables.dispose();
    this._outlineDataSourceReference?.dispose();
  }
};
NotebookCellOutline = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ILanguageFeaturesService),
  __decorateParam(7, INotebookExecutionStateService)
], NotebookCellOutline);
let NotebookOutlineCreator = class {
  constructor(outlineService, _instantiationService) {
    this._instantiationService = _instantiationService;
    const reg = outlineService.registerOutlineCreator(this);
    this.dispose = () => reg.dispose();
  }
  matches(candidate) {
    return candidate.getId() === NotebookEditor.ID;
  }
  async createOutline(editor, target, cancelToken) {
    const outline = this._instantiationService.createInstance(NotebookCellOutline, editor, target);
    if (target === OutlineTarget.QuickPick) {
      await outline.doComputeSymbols(cancelToken);
    }
    return outline;
  }
};
NotebookOutlineCreator = __decorateClass([
  __decorateParam(0, IOutlineService),
  __decorateParam(1, IInstantiationService)
], NotebookOutlineCreator);
const NotebookOutlineContext = {
  CellKind: new RawContextKey("notebookCellKind", void 0),
  CellHasChildren: new RawContextKey("notebookCellHasChildren", false),
  CellHasHeader: new RawContextKey("notebookCellHasHeader", false),
  CellFoldingState: new RawContextKey("notebookCellFoldingState", CellFoldingState.None),
  OutlineElementTarget: new RawContextKey("notebookOutlineElementTarget", void 0)
};
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookOutlineCreator, LifecyclePhase.Eventually);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "notebook",
  order: 100,
  type: "object",
  "properties": {
    [NotebookSetting.outlineShowMarkdownHeadersOnly]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("outline.showMarkdownHeadersOnly", "When enabled, notebook outline will show only markdown cells containing a header.")
    },
    [NotebookSetting.outlineShowCodeCells]: {
      type: "boolean",
      default: false,
      markdownDescription: localize("outline.showCodeCells", "When enabled, notebook outline shows code cells.")
    },
    [NotebookSetting.outlineShowCodeCellSymbols]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("outline.showCodeCellSymbols", "When enabled, notebook outline shows code cell symbols. Relies on `#notebook.outline.showCodeCells#` being enabled.")
    },
    [NotebookSetting.breadcrumbsShowCodeCells]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("breadcrumbs.showCodeCells", "When enabled, notebook breadcrumbs contain code cells.")
    },
    [NotebookSetting.gotoSymbolsAllSymbols]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("notebook.gotoSymbols.showAllSymbols", "When enabled, the Go to Symbol Quick Pick will display full code symbols from the notebook, as well as Markdown headers.")
    }
  }
});
MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
  submenu: MenuId.NotebookOutlineFilter,
  title: localize("filter", "Filter Entries"),
  icon: Codicon.filter,
  group: "navigation",
  order: -1,
  when: ContextKeyExpr.and(ContextKeyExpr.equals("view", IOutlinePane.Id), NOTEBOOK_IS_ACTIVE_EDITOR)
});
registerAction2(class ToggleShowMarkdownHeadersOnly extends Action2 {
  constructor() {
    super({
      id: "notebook.outline.toggleShowMarkdownHeadersOnly",
      title: localize("toggleShowMarkdownHeadersOnly", "Markdown Headers Only"),
      f1: false,
      toggled: {
        condition: ContextKeyExpr.equals("config.notebook.outline.showMarkdownHeadersOnly", true)
      },
      menu: {
        id: MenuId.NotebookOutlineFilter,
        group: "0_markdown_cells"
      }
    });
  }
  run(accessor, ...args) {
    const configurationService = accessor.get(IConfigurationService);
    const showMarkdownHeadersOnly = configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
    configurationService.updateValue(NotebookSetting.outlineShowMarkdownHeadersOnly, !showMarkdownHeadersOnly);
  }
});
registerAction2(class ToggleCodeCellEntries extends Action2 {
  constructor() {
    super({
      id: "notebook.outline.toggleCodeCells",
      title: localize("toggleCodeCells", "Code Cells"),
      f1: false,
      toggled: {
        condition: ContextKeyExpr.equals("config.notebook.outline.showCodeCells", true)
      },
      menu: {
        id: MenuId.NotebookOutlineFilter,
        order: 1,
        group: "1_code_cells"
      }
    });
  }
  run(accessor, ...args) {
    const configurationService = accessor.get(IConfigurationService);
    const showCodeCells = configurationService.getValue(NotebookSetting.outlineShowCodeCells);
    configurationService.updateValue(NotebookSetting.outlineShowCodeCells, !showCodeCells);
  }
});
registerAction2(class ToggleCodeCellSymbolEntries extends Action2 {
  constructor() {
    super({
      id: "notebook.outline.toggleCodeCellSymbols",
      title: localize("toggleCodeCellSymbols", "Code Cell Symbols"),
      f1: false,
      toggled: {
        condition: ContextKeyExpr.equals("config.notebook.outline.showCodeCellSymbols", true)
      },
      menu: {
        id: MenuId.NotebookOutlineFilter,
        order: 2,
        group: "1_code_cells"
      }
    });
  }
  run(accessor, ...args) {
    const configurationService = accessor.get(IConfigurationService);
    const showCodeCellSymbols = configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
    configurationService.updateValue(NotebookSetting.outlineShowCodeCellSymbols, !showCodeCellSymbols);
  }
});
export {
  NotebookBreadcrumbsProvider,
  NotebookCellOutline,
  NotebookOutlineContext,
  NotebookOutlineCreator,
  NotebookOutlinePaneProvider,
  NotebookQuickPickProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9vdXRsaW5lL25vdGVib29rT3V0bGluZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9vbGJhci90b29sYmFyLmpzJztcbmltcG9ydCB7IElJY29uTGFiZWxWYWx1ZU9wdGlvbnMsIEljb25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElEYXRhU291cmNlLCBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSwgY3JlYXRlTWF0Y2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCB0eXBlIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3Nlc0Zvckxhbmd1YWdlSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaERhdGFUcmVlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbGlzdEVycm9yRm9yZWdyb3VuZCwgbGlzdFdhcm5pbmdGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IENlbGxGb2xkaW5nU3RhdGUsIENlbGxSZXZlYWxUeXBlLCBJQ2VsbE1vZGVsRGVjb3JhdGlvbnMsIElDZWxsTW9kZWxEZWx0YURlY29yYXRpb25zLCBJQ2VsbFZpZXdNb2RlbCwgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JPcHRpb25zLCBJTm90ZWJvb2tFZGl0b3JQYW5lLCBJTm90ZWJvb2tWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9va0VkaXRvci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2UsIE5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL25vdGVib29rT3V0bGluZURhdGFTb3VyY2UuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLCBOb3RlYm9va1NldHRpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQnJlYWRjcnVtYnNEYXRhU291cmNlLCBJQnJlYWRjcnVtYnNPdXRsaW5lRWxlbWVudCwgSU91dGxpbmUsIElPdXRsaW5lQ29tcGFyYXRvciwgSU91dGxpbmVDcmVhdG9yLCBJT3V0bGluZUxpc3RDb25maWcsIElPdXRsaW5lU2VydmljZSwgSVF1aWNrUGlja0RhdGFTb3VyY2UsIElRdWlja1BpY2tPdXRsaW5lRWxlbWVudCwgT3V0bGluZUNoYW5nZUV2ZW50LCBPdXRsaW5lQ29uZmlnQ29sbGFwc2VJdGVtc1ZhbHVlcywgT3V0bGluZUNvbmZpZ0tleXMsIE91dGxpbmVUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZS5qcyc7XG5pbXBvcnQgeyBPdXRsaW5lRW50cnkgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvT3V0bGluZUVudHJ5LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnUsIElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBnZXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rT3V0bGluZUVudHJ5QXJncyB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvc2VjdGlvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWFya3VwQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9tYXJrdXBDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSU91dGxpbmVQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vb3V0bGluZS9icm93c2VyL291dGxpbmUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va091dGxpbmVDb25zdGFudHMgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvbm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnkgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvbm90ZWJvb2tPdXRsaW5lRGF0YVNvdXJjZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLCBOb3RlYm9va0V4ZWN1dGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IHNhZmVJbnRsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5cbmNsYXNzIE5vdGVib29rT3V0bGluZVRlbXBsYXRlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdOb3RlYm9va091dGxpbmVSZW5kZXJlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRyZWFkb25seSBpY29uQ2xhc3M6IEhUTUxFbGVtZW50LFxuXHRcdHJlYWRvbmx5IGljb25MYWJlbDogSWNvbkxhYmVsLFxuXHRcdHJlYWRvbmx5IGRlY29yYXRpb246IEhUTUxFbGVtZW50LFxuXHRcdHJlYWRvbmx5IGFjdGlvbk1lbnU6IEhUTUxFbGVtZW50LFxuXHRcdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHQpIHsgfVxufVxuXG5jbGFzcyBOb3RlYm9va091dGxpbmVSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8T3V0bGluZUVudHJ5LCBGdXp6eVNjb3JlLCBOb3RlYm9va091dGxpbmVUZW1wbGF0ZT4ge1xuXG5cdHRlbXBsYXRlSWQ6IHN0cmluZyA9IE5vdGVib29rT3V0bGluZVRlbXBsYXRlLnRlbXBsYXRlSWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGFyZ2V0OiBPdXRsaW5lVGFyZ2V0LFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBOb3RlYm9va091dGxpbmVUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLW91dGxpbmUtZWxlbWVudCcsICdzaG93LWZpbGUtaWNvbnMnKTtcblx0XHRjb25zdCBpY29uQ2xhc3MgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuYXBwZW5kKGljb25DbGFzcyk7XG5cdFx0Y29uc3QgaWNvbkxhYmVsID0gbmV3IEljb25MYWJlbChjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUgfSk7XG5cdFx0Y29uc3QgZGVjb3JhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRlY29yYXRpb24uY2xhc3NOYW1lID0gJ2VsZW1lbnQtZGVjb3JhdGlvbic7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChkZWNvcmF0aW9uKTtcblx0XHRjb25zdCBhY3Rpb25NZW51ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0YWN0aW9uTWVudS5jbGFzc05hbWUgPSAnYWN0aW9uLW1lbnUnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQoYWN0aW9uTWVudSk7XG5cblx0XHRyZXR1cm4gbmV3IE5vdGVib29rT3V0bGluZVRlbXBsYXRlKGNvbnRhaW5lciwgaWNvbkNsYXNzLCBpY29uTGFiZWwsIGRlY29yYXRpb24sIGFjdGlvbk1lbnUsIGVsZW1lbnREaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxPdXRsaW5lRW50cnksIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IE5vdGVib29rT3V0bGluZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0cmFDbGFzc2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG9wdGlvbnM6IElJY29uTGFiZWxWYWx1ZU9wdGlvbnMgPSB7XG5cdFx0XHRtYXRjaGVzOiBjcmVhdGVNYXRjaGVzKG5vZGUuZmlsdGVyRGF0YSksXG5cdFx0XHRsYWJlbEVzY2FwZU5ld0xpbmVzOiB0cnVlLFxuXHRcdFx0ZXh0cmFDbGFzc2VzLFxuXHRcdH07XG5cblx0XHRjb25zdCBpc0NvZGVDZWxsID0gbm9kZS5lbGVtZW50LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGU7XG5cdFx0aWYgKG5vZGUuZWxlbWVudC5sZXZlbCA+PSA4KSB7IC8vIHN5bWJvbFxuXHRcdFx0dGVtcGxhdGUuaWNvbkNsYXNzLmNsYXNzTmFtZSA9ICdlbGVtZW50LWljb24gJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KG5vZGUuZWxlbWVudC5pY29uKS5qb2luKCcgJyk7XG5cdFx0fSBlbHNlIGlmIChpc0NvZGVDZWxsICYmIHRoaXMuX3RoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkuaGFzRmlsZUljb25zICYmICFub2RlLmVsZW1lbnQuaXNFeGVjdXRpbmcpIHtcblx0XHRcdHRlbXBsYXRlLmljb25DbGFzcy5jbGFzc05hbWUgPSAnJztcblx0XHRcdGV4dHJhQ2xhc3Nlcy5wdXNoKC4uLmdldEljb25DbGFzc2VzRm9yTGFuZ3VhZ2VJZChub2RlLmVsZW1lbnQuY2VsbC5sYW5ndWFnZSA/PyAnJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uQ2xhc3MuY2xhc3NOYW1lID0gJ2VsZW1lbnQtaWNvbiAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkobm9kZS5lbGVtZW50Lmljb24pLmpvaW4oJyAnKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZS5pY29uTGFiZWwuc2V0TGFiZWwoJyAnICsgbm9kZS5lbGVtZW50LmxhYmVsLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgeyBtYXJrZXJJbmZvIH0gPSBub2RlLmVsZW1lbnQ7XG5cblx0XHR0ZW1wbGF0ZS5jb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tb3V0bGluZS1lbGVtZW50LWNvbG9yJyk7XG5cdFx0dGVtcGxhdGUuZGVjb3JhdGlvbi5pbm5lclRleHQgPSAnJztcblx0XHRpZiAobWFya2VySW5mbykge1xuXHRcdFx0Y29uc3QgcHJvYmxlbSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdwcm9ibGVtcy52aXNpYmlsaXR5Jyk7XG5cdFx0XHRjb25zdCB1c2VCYWRnZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShPdXRsaW5lQ29uZmlnS2V5cy5wcm9ibGVtc0JhZGdlcyk7XG5cblx0XHRcdGlmICghdXNlQmFkZ2VzIHx8ICFwcm9ibGVtKSB7XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb24uY2xhc3NMaXN0LnJlbW92ZSgnYnViYmxlJyk7XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb24uaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHR9IGVsc2UgaWYgKG1hcmtlckluZm8uY291bnQgPT09IDApIHtcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbi5jbGFzc0xpc3QuYWRkKCdidWJibGUnKTtcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbi5pbm5lclRleHQgPSAnXFx1ZWE3MSc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uLmNsYXNzTGlzdC5yZW1vdmUoJ2J1YmJsZScpO1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uLmlubmVyVGV4dCA9IG1hcmtlckluZm8uY291bnQgPiA5ID8gJzkrJyA6IFN0cmluZyhtYXJrZXJJbmZvLmNvdW50KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihtYXJrZXJJbmZvLnRvcFNldiA9PT0gTWFya2VyU2V2ZXJpdHkuRXJyb3IgPyBsaXN0RXJyb3JGb3JlZ3JvdW5kIDogbGlzdFdhcm5pbmdGb3JlZ3JvdW5kKTtcblx0XHRcdGlmIChwcm9ibGVtID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXNlQ29sb3JzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoT3V0bGluZUNvbmZpZ0tleXMucHJvYmxlbXNDb2xvcnMpO1xuXHRcdFx0aWYgKCF1c2VDb2xvcnMgfHwgIXByb2JsZW0pIHtcblx0XHRcdFx0dGVtcGxhdGUuY29udGFpbmVyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCctLW91dGxpbmUtZWxlbWVudC1jb2xvcicpO1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uLnN0eWxlLnNldFByb3BlcnR5KCctLW91dGxpbmUtZWxlbWVudC1jb2xvcicsIGNvbG9yPy50b1N0cmluZygpID8/ICdpbmhlcml0Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZS5jb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tb3V0bGluZS1lbGVtZW50LWNvbG9yJywgY29sb3I/LnRvU3RyaW5nKCkgPz8gJ2luaGVyaXQnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fdGFyZ2V0ID09PSBPdXRsaW5lVGFyZ2V0Lk91dGxpbmVQYW5lKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2VkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5iQ2VsbCA9IG5vZGUuZWxlbWVudC5jZWxsO1xuXHRcdFx0Y29uc3QgbmJWaWV3TW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0Vmlld01vZGVsKCk7XG5cdFx0XHRpZiAoIW5iVmlld01vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGlkeCA9IG5iVmlld01vZGVsLmdldENlbGxJbmRleChuYkNlbGwpO1xuXHRcdFx0Y29uc3QgbGVuZ3RoID0gaXNDb2RlQ2VsbCA/IDAgOiBuYlZpZXdNb2RlbC5nZXRGb2xkZWRMZW5ndGgoaWR4KTtcblxuXHRcdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0ZW1wbGF0ZS5jb250YWluZXIpKTtcblx0XHRcdE5vdGVib29rT3V0bGluZUNvbnRleHQuQ2VsbEtpbmQuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQoaXNDb2RlQ2VsbCA/IENlbGxLaW5kLkNvZGUgOiBDZWxsS2luZC5NYXJrdXApO1xuXHRcdFx0Tm90ZWJvb2tPdXRsaW5lQ29udGV4dC5DZWxsSGFzQ2hpbGRyZW4uYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQobGVuZ3RoID4gMCk7XG5cdFx0XHROb3RlYm9va091dGxpbmVDb250ZXh0LkNlbGxIYXNIZWFkZXIuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQobm9kZS5lbGVtZW50LmxldmVsICE9PSBOb3RlYm9va091dGxpbmVDb25zdGFudHMuTm9uSGVhZGVyT3V0bGluZUxldmVsKTtcblx0XHRcdE5vdGVib29rT3V0bGluZUNvbnRleHQuT3V0bGluZUVsZW1lbnRUYXJnZXQuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodGhpcy5fdGFyZ2V0KTtcblx0XHRcdHRoaXMuc2V0dXBGb2xkaW5nKGlzQ29kZUNlbGwsIG5iVmlld01vZGVsLCBzY29wZWRDb250ZXh0S2V5U2VydmljZSwgdGVtcGxhdGUsIG5iQ2VsbCk7XG5cblx0XHRcdGNvbnN0IG91dGxpbmVFbnRyeVRvb2xiYXIgPSB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBUb29sQmFyKHRlbXBsYXRlLmFjdGlvbk1lbnUsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBhY3Rpb24gPT4ge1xuXHRcdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IG1lbnUgPSB0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuX21lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLk5vdGVib29rT3V0bGluZUFjdGlvbk1lbnUsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZ2V0T3V0bGluZVRvb2xiYXJBY3Rpb25zKG1lbnUsIHsgbm90ZWJvb2tFZGl0b3I6IHRoaXMuX2VkaXRvciwgb3V0bGluZUVudHJ5OiBub2RlLmVsZW1lbnQgfSk7XG5cdFx0XHRvdXRsaW5lRW50cnlUb29sYmFyLnNldEFjdGlvbnMoYWN0aW9ucy5wcmltYXJ5LCBhY3Rpb25zLnNlY29uZGFyeSk7XG5cblx0XHRcdHRoaXMuc2V0dXBUb29sYmFyTGlzdGVuZXJzKHRoaXMuX2VkaXRvciwgb3V0bGluZUVudHJ5VG9vbGJhciwgbWVudSwgYWN0aW9ucywgbm9kZS5lbGVtZW50LCB0ZW1wbGF0ZSk7XG5cdFx0XHR0ZW1wbGF0ZS5hY3Rpb25NZW51LnN0eWxlLnBhZGRpbmcgPSAnMCAwLjhlbSAwIDAuNGVtJztcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBOb3RlYm9va091dGxpbmVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uTGFiZWwuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPE91dGxpbmVFbnRyeSwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogTm90ZWJvb2tPdXRsaW5lVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuYWN0aW9uTWVudSk7XG5cdH1cblxuXHRwcml2YXRlIHNldHVwRm9sZGluZyhpc0NvZGVDZWxsOiBib29sZWFuLCBuYlZpZXdNb2RlbDogSU5vdGVib29rVmlld01vZGVsLCBzY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCB0ZW1wbGF0ZTogTm90ZWJvb2tPdXRsaW5lVGVtcGxhdGUsIG5iQ2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0XHRjb25zdCBmb2xkaW5nU3RhdGUgPSBpc0NvZGVDZWxsID8gQ2VsbEZvbGRpbmdTdGF0ZS5Ob25lIDogKChuYkNlbGwgYXMgTWFya3VwQ2VsbFZpZXdNb2RlbCkuZm9sZGluZ1N0YXRlKTtcblx0XHRjb25zdCBmb2xkaW5nU3RhdGVDdHggPSBOb3RlYm9va091dGxpbmVDb250ZXh0LkNlbGxGb2xkaW5nU3RhdGUuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRmb2xkaW5nU3RhdGVDdHguc2V0KGZvbGRpbmdTdGF0ZSk7XG5cblx0XHRpZiAoIWlzQ29kZUNlbGwpIHtcblx0XHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmJWaWV3TW9kZWwub25EaWRGb2xkaW5nU3RhdGVDaGFuZ2VkKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ1N0YXRlID0gKG5iQ2VsbCBhcyBNYXJrdXBDZWxsVmlld01vZGVsKS5mb2xkaW5nU3RhdGU7XG5cdFx0XHRcdE5vdGVib29rT3V0bGluZUNvbnRleHQuQ2VsbEZvbGRpbmdTdGF0ZS5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldChmb2xkaW5nU3RhdGUpO1xuXHRcdFx0XHRmb2xkaW5nU3RhdGVDdHguc2V0KGZvbGRpbmdTdGF0ZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cFRvb2xiYXJMaXN0ZW5lcnMoZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsIHRvb2xiYXI6IFRvb2xCYXIsIG1lbnU6IElNZW51LCBpbml0QWN0aW9uczogeyBwcmltYXJ5OiBJQWN0aW9uW107IHNlY29uZGFyeTogSUFjdGlvbltdIH0sIGVudHJ5OiBPdXRsaW5lRW50cnksIHRlbXBsYXRlRGF0YTogTm90ZWJvb2tPdXRsaW5lVGVtcGxhdGUpOiB2b2lkIHtcblx0XHQvLyBzYW1lIGZpeCBhcyBpbiBjZWxsVG9vbGJhcnMgc2V0dXBMaXN0ZW5lcnMgcmUgIzEwMzkyNlxuXHRcdGxldCBkcm9wZG93bklzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdGxldCBkZWZlcnJlZFVwZGF0ZTogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdFx0dG9vbGJhci5zZXRBY3Rpb25zKGluaXRBY3Rpb25zLnByaW1hcnksIGluaXRBY3Rpb25zLnNlY29uZGFyeSk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobWVudS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAoZHJvcGRvd25Jc1Zpc2libGUpIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldE91dGxpbmVUb29sYmFyQWN0aW9ucyhtZW51LCB7IG5vdGVib29rRWRpdG9yOiBlZGl0b3IsIG91dGxpbmVFbnRyeTogZW50cnkgfSk7XG5cdFx0XHRcdGRlZmVycmVkVXBkYXRlID0gKCkgPT4gdG9vbGJhci5zZXRBY3Rpb25zKGFjdGlvbnMucHJpbWFyeSwgYWN0aW9ucy5zZWNvbmRhcnkpO1xuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldE91dGxpbmVUb29sYmFyQWN0aW9ucyhtZW51LCB7IG5vdGVib29rRWRpdG9yOiBlZGl0b3IsIG91dGxpbmVFbnRyeTogZW50cnkgfSk7XG5cdFx0XHR0b29sYmFyLnNldEFjdGlvbnMoYWN0aW9ucy5wcmltYXJ5LCBhY3Rpb25zLnNlY29uZGFyeSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdub3RlYm9vay1vdXRsaW5lLXRvb2xiYXItZHJvcGRvd24tYWN0aXZlJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodG9vbGJhci5vbkRpZENoYW5nZURyb3Bkb3duVmlzaWJpbGl0eSh2aXNpYmxlID0+IHtcblx0XHRcdGRyb3Bkb3duSXNWaXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbm90ZWJvb2stb3V0bGluZS10b29sYmFyLWRyb3Bkb3duLWFjdGl2ZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdub3RlYm9vay1vdXRsaW5lLXRvb2xiYXItZHJvcGRvd24tYWN0aXZlJyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkZWZlcnJlZFVwZGF0ZSAmJiAhdmlzaWJsZSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0ZGVmZXJyZWRVcGRhdGU/LigpO1xuXHRcdFx0XHR9LCAwLCB0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzKTtcblxuXHRcdFx0XHRkZWZlcnJlZFVwZGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0fVxufVxuXG5mdW5jdGlvbiBnZXRPdXRsaW5lVG9vbGJhckFjdGlvbnMobWVudTogSU1lbnUsIGFyZ3M/OiBOb3RlYm9va091dGxpbmVFbnRyeUFyZ3MpOiB7IHByaW1hcnk6IElBY3Rpb25bXTsgc2Vjb25kYXJ5OiBJQWN0aW9uW10gfSB7XG5cdHJldHVybiBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucyh7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLCBhcmc6IGFyZ3MgfSksIGcgPT4gL15pbmxpbmUvLnRlc3QoZykpO1xufVxuXG5jbGFzcyBOb3RlYm9va091dGxpbmVBY2Nlc3NpYmlsaXR5IGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8T3V0bGluZUVudHJ5PiB7XG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBPdXRsaW5lRW50cnkpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0fVxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tOYXZpZ2F0aW9uTGFiZWxQcm92aWRlciBpbXBsZW1lbnRzIElLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPE91dGxpbmVFbnRyeT4ge1xuXHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlbGVtZW50OiBPdXRsaW5lRW50cnkpOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgeyB0b1N0cmluZygpOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va091dGxpbmVWaXJ0dWFsRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxPdXRsaW5lRW50cnk+IHtcblxuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IE91dGxpbmVFbnRyeSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChfZWxlbWVudDogT3V0bGluZUVudHJ5KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gTm90ZWJvb2tPdXRsaW5lVGVtcGxhdGUudGVtcGxhdGVJZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tRdWlja1BpY2tQcm92aWRlciBpbXBsZW1lbnRzIElRdWlja1BpY2tEYXRhU291cmNlPE91dGxpbmVFbnRyeT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgZ290b1Nob3dDb2RlQ2VsbFN5bWJvbHM6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZVJlZjogSVJlZmVyZW5jZTxJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2U+IHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5nb3RvU2hvd0NvZGVDZWxsU3ltYm9scyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5nb3RvU3ltYm9sc0FsbFN5bWJvbHMpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5nb3RvU3ltYm9sc0FsbFN5bWJvbHMpKSB7XG5cdFx0XHRcdHRoaXMuZ290b1Nob3dDb2RlQ2VsbFN5bWJvbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuZ290b1N5bWJvbHNBbGxTeW1ib2xzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXRRdWlja1BpY2tFbGVtZW50cygpOiBJUXVpY2tQaWNrT3V0bGluZUVsZW1lbnQ8T3V0bGluZUVudHJ5PltdIHtcblx0XHRjb25zdCBidWNrZXQ6IE91dGxpbmVFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLm5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlUmVmPy5vYmplY3Q/LmVudHJpZXMgPz8gW10pIHtcblx0XHRcdGVudHJ5LmFzRmxhdExpc3QoYnVja2V0KTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBJUXVpY2tQaWNrT3V0bGluZUVsZW1lbnQ8T3V0bGluZUVudHJ5PltdID0gW107XG5cdFx0Y29uc3QgeyBoYXNGaWxlSWNvbnMgfSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCk7XG5cblx0XHRjb25zdCBpc1N5bWJvbCA9IChlbGVtZW50OiBPdXRsaW5lRW50cnkpID0+ICEhZWxlbWVudC5zeW1ib2xLaW5kO1xuXHRcdGNvbnN0IGlzQ29kZUNlbGwgPSAoZWxlbWVudDogT3V0bGluZUVudHJ5KSA9PiAoZWxlbWVudC5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlICYmIGVsZW1lbnQubGV2ZWwgPT09IE5vdGVib29rT3V0bGluZUNvbnN0YW50cy5Ob25IZWFkZXJPdXRsaW5lTGV2ZWwpOyAvLyBjb2RlIGNlbGwgZW50cmllcyBhcmUgZXhhY3RseSBsZXZlbCA3IGJ5IHRoaXMgY29uc3RhbnRcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGJ1Y2tldC5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGJ1Y2tldFtpXTtcblx0XHRcdGNvbnN0IG5leHRFbGVtZW50ID0gYnVja2V0W2kgKyAxXTsgLy8gY2FuIGJlIHVuZGVmaW5lZFxuXG5cdFx0XHRpZiAoIXRoaXMuZ290b1Nob3dDb2RlQ2VsbFN5bWJvbHNcblx0XHRcdFx0JiYgaXNTeW1ib2woZWxlbWVudCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmdvdG9TaG93Q29kZUNlbGxTeW1ib2xzXG5cdFx0XHRcdCYmIGlzQ29kZUNlbGwoZWxlbWVudClcblx0XHRcdFx0JiYgbmV4dEVsZW1lbnQgJiYgaXNTeW1ib2wobmV4dEVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1c2VGaWxlSWNvbiA9IGhhc0ZpbGVJY29ucyAmJiAhZWxlbWVudC5zeW1ib2xLaW5kO1xuXHRcdFx0Ly8gdG9kb0Bqcmlla2VuIGl0IGlzIGZpc2h5IHRoYXQgY29kaWNvbnMgY2Fubm90IGJlIHVzZWQgd2l0aCBpY29uQ2xhc3Nlc1xuXHRcdFx0Ly8gYnV0IGZpbGUgaWNvbnMgY2FuLi4uXG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdGxhYmVsOiB1c2VGaWxlSWNvbiA/IGVsZW1lbnQubGFiZWwgOiBgJCgke2VsZW1lbnQuaWNvbi5pZH0pICR7ZWxlbWVudC5sYWJlbH1gLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGVsZW1lbnQubGFiZWwsXG5cdFx0XHRcdGljb25DbGFzc2VzOiB1c2VGaWxlSWNvbiA/IGdldEljb25DbGFzc2VzRm9yTGFuZ3VhZ2VJZChlbGVtZW50LmNlbGwubGFuZ3VhZ2UgPz8gJycpIDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgZ2l2ZW4gb3V0bGluZSBlbnRyeSBzaG91bGQgYmUgZmlsdGVyZWQgb3V0IG9mIHRoZSBvdXRsaW5lUGFuZVxuICpcbiAqIEBwYXJhbSBlbnRyeSB0aGUgT3V0bGluZUVudHJ5IHRvIGNoZWNrXG4gKiBAcGFyYW0gc2hvd01hcmtkb3duSGVhZGVyc09ubHkgd2hldGhlciB0byBzaG93IG9ubHkgbWFya2Rvd24gaGVhZGVyc1xuICogQHBhcmFtIHNob3dDb2RlQ2VsbHMgd2hldGhlciB0byBzaG93IGNvZGUgY2VsbHNcbiAqIEBwYXJhbSBzaG93Q29kZUNlbGxTeW1ib2xzIHdoZXRoZXIgdG8gc2hvdyBjb2RlIGNlbGwgc3ltYm9sc1xuICogQHJldHVybnMgdHJ1ZSBpZiB0aGUgZW50cnkgc2hvdWxkIGJlIGZpbHRlcmVkIG91dCBvZiB0aGUgb3V0bGluZVBhbmUsIGZhbHNlIGlmIHRoZSBlbnRyeSBzaG91bGQgYmUgdmlzaWJsZS5cbiAqL1xuZnVuY3Rpb24gZmlsdGVyRW50cnkoZW50cnk6IE91dGxpbmVFbnRyeSwgc2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGJvb2xlYW4sIHNob3dDb2RlQ2VsbHM6IGJvb2xlYW4sIHNob3dDb2RlQ2VsbFN5bWJvbHM6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0Ly8gaWYgYW55IGFyZSB0cnVlLCByZXR1cm4gdHJ1ZSwgdGhpcyBlbnRyeSBzaG91bGQgTk9UIGJlIGluY2x1ZGVkIGluIHRoZSBvdXRsaW5lXG5cdGlmIChcblx0XHQoc2hvd01hcmtkb3duSGVhZGVyc09ubHkgJiYgZW50cnkuY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwICYmIGVudHJ5LmxldmVsID09PSBOb3RlYm9va091dGxpbmVDb25zdGFudHMuTm9uSGVhZGVyT3V0bGluZUxldmVsKSB8fFx0Ly8gc2hvdyBoZWFkZXJzIG9ubHkgICArIGNlbGwgaXMgbWtkbiArIGlzIGxldmVsIDcgKG5vdCBoZWFkZXIpXG5cdFx0KCFzaG93Q29kZUNlbGxzICYmIGVudHJ5LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUpIHx8XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIHNob3cgY29kZSBjZWxscyBvZmYgKyBjZWxsIGlzIGNvZGVcblx0XHQoIXNob3dDb2RlQ2VsbFN5bWJvbHMgJiYgZW50cnkuY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSAmJiBlbnRyeS5sZXZlbCA+IE5vdGVib29rT3V0bGluZUNvbnN0YW50cy5Ob25IZWFkZXJPdXRsaW5lTGV2ZWwpXHRcdFx0XHQvLyBzaG93IHN5bWJvbHMgb2ZmICAgICsgY2VsbCBpcyBjb2RlICsgaXMgbGV2ZWwgPjcgKG5iIHN5bWJvbCBsZXZlbHMpXG5cdCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tPdXRsaW5lUGFuZVByb3ZpZGVyIGltcGxlbWVudHMgSURhdGFTb3VyY2U8Tm90ZWJvb2tDZWxsT3V0bGluZSwgT3V0bGluZUVudHJ5PiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSBzaG93Q29kZUNlbGxzOiBib29sZWFuO1xuXHRwcml2YXRlIHNob3dDb2RlQ2VsbFN5bWJvbHM6IGJvb2xlYW47XG5cdHByaXZhdGUgc2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvdXRsaW5lRGF0YVNvdXJjZVJlZjogSVJlZmVyZW5jZTxJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2U+IHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5zaG93Q29kZUNlbGxzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxzKTtcblx0XHR0aGlzLnNob3dDb2RlQ2VsbFN5bWJvbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpO1xuXHRcdHRoaXMuc2hvd01hcmtkb3duSGVhZGVyc09ubHkgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5KTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbHMpKSB7XG5cdFx0XHRcdHRoaXMuc2hvd0NvZGVDZWxscyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxscyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpKSB7XG5cdFx0XHRcdHRoaXMuc2hvd0NvZGVDZWxsU3ltYm9scyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9scyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5KSkge1xuXHRcdFx0XHR0aGlzLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldEFjdGl2ZUVudHJ5KCk6IE91dGxpbmVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbmV3QWN0aXZlID0gdGhpcy5vdXRsaW5lRGF0YVNvdXJjZVJlZj8ub2JqZWN0Py5hY3RpdmVFbGVtZW50O1xuXHRcdGlmICghbmV3QWN0aXZlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghZmlsdGVyRW50cnkobmV3QWN0aXZlLCB0aGlzLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5LCB0aGlzLnNob3dDb2RlQ2VsbHMsIHRoaXMuc2hvd0NvZGVDZWxsU3ltYm9scykpIHtcblx0XHRcdHJldHVybiBuZXdBY3RpdmU7XG5cdFx0fVxuXG5cdFx0Ly8gZmluZCBhIHZhbGlkIHBhcmVudFxuXHRcdGxldCBwYXJlbnQgPSBuZXdBY3RpdmUucGFyZW50O1xuXHRcdHdoaWxlIChwYXJlbnQpIHtcblx0XHRcdGlmIChmaWx0ZXJFbnRyeShwYXJlbnQsIHRoaXMuc2hvd01hcmtkb3duSGVhZGVyc09ubHksIHRoaXMuc2hvd0NvZGVDZWxscywgdGhpcy5zaG93Q29kZUNlbGxTeW1ib2xzKSkge1xuXHRcdFx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHBhcmVudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBubyB2YWxpZCBwYXJlbnQgZm91bmQsIHJldHVybiB1bmRlZmluZWRcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0KmdldENoaWxkcmVuKGVsZW1lbnQ6IE5vdGVib29rQ2VsbE91dGxpbmUgfCBPdXRsaW5lRW50cnkpOiBJdGVyYWJsZTxPdXRsaW5lRW50cnk+IHtcblx0XHRjb25zdCBpc091dGxpbmUgPSBlbGVtZW50IGluc3RhbmNlb2YgTm90ZWJvb2tDZWxsT3V0bGluZTtcblx0XHRjb25zdCBlbnRyaWVzID0gaXNPdXRsaW5lID8gdGhpcy5vdXRsaW5lRGF0YVNvdXJjZVJlZj8ub2JqZWN0Py5lbnRyaWVzID8/IFtdIDogZWxlbWVudC5jaGlsZHJlbjtcblxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0aWYgKGVudHJ5LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCkge1xuXHRcdFx0XHRpZiAoIXRoaXMuc2hvd01hcmtkb3duSGVhZGVyc09ubHkpIHtcblx0XHRcdFx0XHR5aWVsZCBlbnRyeTtcblx0XHRcdFx0fSBlbHNlIGlmIChlbnRyeS5sZXZlbCA8IE5vdGVib29rT3V0bGluZUNvbnN0YW50cy5Ob25IZWFkZXJPdXRsaW5lTGV2ZWwpIHtcblx0XHRcdFx0XHR5aWVsZCBlbnRyeTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuc2hvd0NvZGVDZWxscyAmJiBlbnRyeS5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKSB7XG5cdFx0XHRcdGlmICh0aGlzLnNob3dDb2RlQ2VsbFN5bWJvbHMpIHtcblx0XHRcdFx0XHR5aWVsZCBlbnRyeTtcblx0XHRcdFx0fSBlbHNlIGlmIChlbnRyeS5sZXZlbCA9PT0gTm90ZWJvb2tPdXRsaW5lQ29uc3RhbnRzLk5vbkhlYWRlck91dGxpbmVMZXZlbCkge1xuXHRcdFx0XHRcdHlpZWxkIGVudHJ5O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rQnJlYWRjcnVtYnNQcm92aWRlciBpbXBsZW1lbnRzIElCcmVhZGNydW1ic0RhdGFTb3VyY2U8T3V0bGluZUVudHJ5PiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSBzaG93Q29kZUNlbGxzOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0bGluZURhdGFTb3VyY2VSZWY6IElSZWZlcmVuY2U8SU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlPiB8IHVuZGVmaW5lZCxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuc2hvd0NvZGVDZWxscyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5icmVhZGNydW1ic1Nob3dDb2RlQ2VsbHMpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuYnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzKSkge1xuXHRcdFx0XHR0aGlzLnNob3dDb2RlQ2VsbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuYnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXRCcmVhZGNydW1iRWxlbWVudHMoKTogcmVhZG9ubHkgSUJyZWFkY3J1bWJzT3V0bGluZUVsZW1lbnQ8T3V0bGluZUVudHJ5PltdIHtcblx0XHRjb25zdCByZXN1bHQ6IElCcmVhZGNydW1ic091dGxpbmVFbGVtZW50PE91dGxpbmVFbnRyeT5bXSA9IFtdO1xuXHRcdGxldCBjYW5kaWRhdGUgPSB0aGlzLm91dGxpbmVEYXRhU291cmNlUmVmPy5vYmplY3Q/LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0d2hpbGUgKGNhbmRpZGF0ZSkge1xuXHRcdFx0aWYgKHRoaXMuc2hvd0NvZGVDZWxscyB8fCBjYW5kaWRhdGUuY2VsbC5jZWxsS2luZCAhPT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0XHRyZXN1bHQudW5zaGlmdCh7IGVsZW1lbnQ6IGNhbmRpZGF0ZSwgbGFiZWw6IGNhbmRpZGF0ZS5sYWJlbCB9KTtcblx0XHRcdH1cblx0XHRcdGNhbmRpZGF0ZSA9IGNhbmRpZGF0ZS5wYXJlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va0NvbXBhcmF0b3IgaW1wbGVtZW50cyBJT3V0bGluZUNvbXBhcmF0b3I8T3V0bGluZUVudHJ5PiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29sbGF0b3IgPSBzYWZlSW50bC5Db2xsYXRvcih1bmRlZmluZWQsIHsgbnVtZXJpYzogdHJ1ZSB9KTtcblxuXHRjb21wYXJlQnlQb3NpdGlvbihhOiBPdXRsaW5lRW50cnksIGI6IE91dGxpbmVFbnRyeSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGEuaW5kZXggLSBiLmluZGV4O1xuXHR9XG5cdGNvbXBhcmVCeVR5cGUoYTogT3V0bGluZUVudHJ5LCBiOiBPdXRsaW5lRW50cnkpOiBudW1iZXIge1xuXHRcdHJldHVybiBhLmNlbGwuY2VsbEtpbmQgLSBiLmNlbGwuY2VsbEtpbmQgfHwgdGhpcy5fY29sbGF0b3IudmFsdWUuY29tcGFyZShhLmxhYmVsLCBiLmxhYmVsKTtcblx0fVxuXHRjb21wYXJlQnlOYW1lKGE6IE91dGxpbmVFbnRyeSwgYjogT3V0bGluZUVudHJ5KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY29sbGF0b3IudmFsdWUuY29tcGFyZShhLmxhYmVsLCBiLmxhYmVsKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tDZWxsT3V0bGluZSBpbXBsZW1lbnRzIElPdXRsaW5lPE91dGxpbmVFbnRyeT4ge1xuXHRyZWFkb25seSBvdXRsaW5lS2luZCA9ICdub3RlYm9va0NlbGxzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGF0YVNvdXJjZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8T3V0bGluZUNoYW5nZUV2ZW50PigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8T3V0bGluZUNoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGVsYXllclJlY29tcHV0ZVN0YXRlOiBEZWxheWVyPHZvaWQ+ID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWxheWVyPHZvaWQ+KDMwMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGF5ZXJSZWNvbXB1dGVBY3RpdmU6IERlbGF5ZXI8dm9pZD4gPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IERlbGF5ZXI8dm9pZD4oMjAwKSk7XG5cdC8vIHRoaXMgY2FuIGJlIGxvbmcsIGJlY2F1c2UgaXQgd2lsbCBmb3JjZSBhIHJlY29tcHV0ZSBhdCB0aGUgZW5kLCBzbyBpZGVhbGx5IHdlIG9ubHkgZG8gdGhpcyBvbmNlIGFsbCBuYiBsYW5ndWFnZSBmZWF0dXJlcyBhcmUgcmVnaXN0ZXJlZFxuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGF5ZXJSZWNvbXB1dGVTeW1ib2xzOiBEZWxheWVyPHZvaWQ+ID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWxheWVyPHZvaWQ+KDIwMDApKTtcblxuXHRyZWFkb25seSBjb25maWc6IElPdXRsaW5lTGlzdENvbmZpZzxPdXRsaW5lRW50cnk+O1xuXHRwcml2YXRlIF9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZTogSVJlZmVyZW5jZTxOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZT4gfCB1bmRlZmluZWQ7XG5cdC8vIFRoZXNlIHRocmVlIGZpZWxkcyB3aWxsIGFsd2F5cyBiZSBzZXQgdmlhIHNldERhdGFTb3VyY2VzKCkgb24gTDQ3NVxuXHRwcml2YXRlIF90cmVlRGF0YVNvdXJjZSE6IElEYXRhU291cmNlPE5vdGVib29rQ2VsbE91dGxpbmUsIE91dGxpbmVFbnRyeT47XG5cdHByaXZhdGUgX3F1aWNrUGlja0RhdGFTb3VyY2UhOiBJUXVpY2tQaWNrRGF0YVNvdXJjZTxPdXRsaW5lRW50cnk+O1xuXHRwcml2YXRlIF9icmVhZGNydW1ic0RhdGFTb3VyY2UhOiBJQnJlYWRjcnVtYnNEYXRhU291cmNlPE91dGxpbmVFbnRyeT47XG5cblx0Ly8gdmlldyBzZXR0aW5nc1xuXHRwcml2YXRlIG91dGxpbmVTaG93Q29kZUNlbGxzOiBib29sZWFuO1xuXHRwcml2YXRlIG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiBib29sZWFuO1xuXHRwcml2YXRlIG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogYm9vbGVhbjtcblxuXHQvLyBnZXR0ZXJzXG5cdGdldCBhY3RpdmVFbGVtZW50KCk6IE91dGxpbmVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5jaGVja0RlbGF5ZXIoKTtcblx0XHRpZiAodGhpcy5fdGFyZ2V0ID09PSBPdXRsaW5lVGFyZ2V0Lk91dGxpbmVQYW5lKSB7XG5cdFx0XHRyZXR1cm4gKHRoaXMuY29uZmlnLnRyZWVEYXRhU291cmNlIGFzIE5vdGVib29rT3V0bGluZVBhbmVQcm92aWRlcikuZ2V0QWN0aXZlRW50cnkoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5lcnJvcignYWN0aXZlRWxlbWVudCBzaG91bGQgbm90IGJlIGNhbGxlZCBvdXRzaWRlIG9mIHRoZSBPdXRsaW5lUGFuZScpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblx0Z2V0IGVudHJpZXMoKTogT3V0bGluZUVudHJ5W10ge1xuXHRcdHRoaXMuY2hlY2tEZWxheWVyKCk7XG5cdFx0cmV0dXJuIHRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlPy5vYmplY3Q/LmVudHJpZXMgPz8gW107XG5cdH1cblx0Z2V0IHVyaSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZT8ub2JqZWN0Py51cmk7XG5cdH1cblx0Z2V0IGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZT8ub2JqZWN0Py5lbnRyaWVzKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gIXRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlLm9iamVjdC5lbnRyaWVzLnNvbWUoZW50cnkgPT4ge1xuXHRcdFx0cmV0dXJuICFmaWx0ZXJFbnRyeShlbnRyeSwgdGhpcy5vdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHksIHRoaXMub3V0bGluZVNob3dDb2RlQ2VsbHMsIHRoaXMub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjaGVja0RlbGF5ZXIoKSB7XG5cdFx0aWYgKHRoaXMuZGVsYXllclJlY29tcHV0ZVN0YXRlLmlzVHJpZ2dlcmVkKCkpIHtcblx0XHRcdHRoaXMuZGVsYXllclJlY29tcHV0ZVN0YXRlLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5yZWNvbXB1dGVTdGF0ZSgpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSU5vdGVib29rRWRpdG9yUGFuZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YXJnZXQ6IE91dGxpbmVUYXJnZXQsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMub3V0bGluZVNob3dDb2RlQ2VsbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbHMpO1xuXHRcdHRoaXMub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpO1xuXHRcdHRoaXMub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSk7XG5cblx0XHR0aGlzLmluaXRpYWxpemVPdXRsaW5lKCk7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBOb3RlYm9va091dGxpbmVWaXJ0dWFsRGVsZWdhdGUoKTtcblx0XHRjb25zdCByZW5kZXJlcnMgPSBbdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tPdXRsaW5lUmVuZGVyZXIsIHRoaXMuX2VkaXRvci5nZXRDb250cm9sKCksIHRoaXMuX3RhcmdldCldO1xuXHRcdGNvbnN0IGNvbXBhcmF0b3IgPSBuZXcgTm90ZWJvb2tDb21wYXJhdG9yKCk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBJV29ya2JlbmNoRGF0YVRyZWVPcHRpb25zPE91dGxpbmVFbnRyeSwgRnV6enlTY29yZT4gPSB7XG5cdFx0XHRjb2xsYXBzZUJ5RGVmYXVsdDogdGhpcy5fdGFyZ2V0ID09PSBPdXRsaW5lVGFyZ2V0LkJyZWFkY3J1bWJzIHx8ICh0aGlzLl90YXJnZXQgPT09IE91dGxpbmVUYXJnZXQuT3V0bGluZVBhbmUgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoT3V0bGluZUNvbmZpZ0tleXMuY29sbGFwc2VJdGVtcykgPT09IE91dGxpbmVDb25maWdDb2xsYXBzZUl0ZW1zVmFsdWVzLkNvbGxhcHNlZCksXG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgTm90ZWJvb2tPdXRsaW5lQWNjZXNzaWJpbGl0eSgpLFxuXHRcdFx0aWRlbnRpdHlQcm92aWRlcjogeyBnZXRJZDogZWxlbWVudCA9PiBlbGVtZW50LmNlbGwudXJpLnRvU3RyaW5nKCkgfSxcblx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IG5ldyBOb3RlYm9va05hdmlnYXRpb25MYWJlbFByb3ZpZGVyKClcblx0XHR9O1xuXG5cdFx0dGhpcy5jb25maWcgPSB7XG5cdFx0XHR0cmVlRGF0YVNvdXJjZTogdGhpcy5fdHJlZURhdGFTb3VyY2UsXG5cdFx0XHRxdWlja1BpY2tEYXRhU291cmNlOiB0aGlzLl9xdWlja1BpY2tEYXRhU291cmNlLFxuXHRcdFx0YnJlYWRjcnVtYnNEYXRhU291cmNlOiB0aGlzLl9icmVhZGNydW1ic0RhdGFTb3VyY2UsXG5cdFx0XHRkZWxlZ2F0ZSxcblx0XHRcdHJlbmRlcmVycyxcblx0XHRcdGNvbXBhcmF0b3IsXG5cdFx0XHRvcHRpb25zLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemVPdXRsaW5lKCkge1xuXHRcdC8vIGluaXRpYWwgc2V0dXBcblx0XHR0aGlzLnNldERhdGFTb3VyY2VzKCk7XG5cdFx0dGhpcy5zZXRNb2RlbExpc3RlbmVycygpO1xuXG5cdFx0Ly8gcmVzZXQgdGhlIGRhdGEgc291cmNlcyArIG1vZGVsIGxpc3RlbmVycyB3aGVuIHdlIGdldCBhIG5ldyBub3RlYm9vayBtb2RlbFxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHR0aGlzLnNldERhdGFTb3VyY2VzKCk7XG5cdFx0XHR0aGlzLnNldE1vZGVsTGlzdGVuZXJzKCk7XG5cdFx0XHR0aGlzLmNvbXB1dGVTeW1ib2xzKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVjb21wdXRlIHN5bWJvbHMgYXMgZG9jdW1lbnQgc3ltYm9sIHByb3ZpZGVycyBhcmUgdXBkYXRlZCBpbiB0aGUgbGFuZ3VhZ2UgZmVhdHVyZXMgcmVnaXN0cnlcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmRlbGF5ZWRDb21wdXRlU3ltYm9scygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIHJlY29tcHV0ZSBhY3RpdmUgd2hlbiB0aGUgc2VsZWN0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdHRoaXMuZGVsYXllZFJlY29tcHV0ZUFjdGl2ZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIHJlY29tcHV0ZSBzdGF0ZSB3aGVuIGZpbHRlciBjb25maWcgY2hhbmdlc1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5KSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxscykgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmJyZWFkY3J1bWJzU2hvd0NvZGVDZWxscylcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLm91dGxpbmVTaG93Q29kZUNlbGxzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxzKTtcblx0XHRcdFx0dGhpcy5vdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9scyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9scyk7XG5cdFx0XHRcdHRoaXMub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSk7XG5cblx0XHRcdFx0dGhpcy5kZWxheWVkUmVjb21wdXRlU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyByZWNvbXB1dGUgc3RhdGUgd2hlbiBleGVjdXRpb24gc3RhdGVzIGNoYW5nZVxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5vbkRpZENoYW5nZUV4ZWN1dGlvbihlID0+IHtcblx0XHRcdGlmIChlLnR5cGUgPT09IE5vdGVib29rRXhlY3V0aW9uVHlwZS5jZWxsICYmICEhdGhpcy5fZWRpdG9yLnRleHRNb2RlbCAmJiBlLmFmZmVjdHNOb3RlYm9vayh0aGlzLl9lZGl0b3IudGV4dE1vZGVsPy51cmkpKSB7XG5cdFx0XHRcdHRoaXMuZGVsYXllZFJlY29tcHV0ZVN0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVjb21wdXRlIHN5bWJvbHMgd2hlbiB0aGUgY29uZmlndXJhdGlvbiBjaGFuZ2VzIChyZWNvbXB1dGUgc3RhdGUgLSBhbmQgdGhlcmVmb3JlIHJlY29tcHV0ZSBhY3RpdmUgLSBpcyBhbHNvIGNhbGxlZCB3aXRoaW4gY29tcHV0ZSBzeW1ib2xzKVxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpKSB7XG5cdFx0XHRcdHRoaXMub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpO1xuXHRcdFx0XHR0aGlzLmNvbXB1dGVTeW1ib2xzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gZmlyZSBhIGNoYW5nZSBldmVudCB3aGVuIHRoZSB0aGVtZSBjaGFuZ2VzXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gZmluaXNoIHdpdGggYSByZWNvbXB1dGUgc3RhdGVcblx0XHR0aGlzLnJlY29tcHV0ZVN0YXRlKCk7XG5cdH1cblxuXHQvKipcblx0ICogc2V0IHVwIHRoZSBwcmltYXJ5IGRhdGEgc291cmNlICsgdGhyZWUgdmlld2luZyBzb3VyY2VzIGZvciB0aGUgdmFyaW91cyBvdXRsaW5lIHZpZXdzXG5cdCAqL1xuXHRwcml2YXRlIHNldERhdGFTb3VyY2VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gdGhpcy5fZWRpdG9yLmdldENvbnRyb2woKTtcblx0XHR0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RhdGFTb3VyY2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKCFub3RlYm9va0VkaXRvcj8uaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2UgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlID0gdGhpcy5fZGF0YVNvdXJjZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IGFjY2Vzc29yLmdldChJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5KS5nZXRPckNyZWF0ZShub3RlYm9va0VkaXRvcikpKTtcblx0XHRcdC8vIGVzY2FsYXRlIG91dGxpbmUgZGF0YSBzb3VyY2UgY2hhbmdlIGV2ZW50c1xuXHRcdFx0dGhpcy5fZGF0YVNvdXJjZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZS5vYmplY3Qub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHt9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyB0aGVzZSBmaWVsZHMgY2FuIGJlIHBhc3NlZCB1bmRlZmluZWQgb3V0bGluZURhdGFTb3VyY2VzLiBWaWV3IFByb3ZpZGVycyBhbGwgaGFuZGxlIGl0IGFjY29yZGluZ2x5XG5cdFx0dGhpcy5fdHJlZURhdGFTb3VyY2UgPSB0aGlzLl9kYXRhU291cmNlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rT3V0bGluZVBhbmVQcm92aWRlciwgdGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2UpKTtcblx0XHR0aGlzLl9xdWlja1BpY2tEYXRhU291cmNlID0gdGhpcy5fZGF0YVNvdXJjZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va1F1aWNrUGlja1Byb3ZpZGVyLCB0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZSkpO1xuXHRcdHRoaXMuX2JyZWFkY3J1bWJzRGF0YVNvdXJjZSA9IHRoaXMuX2RhdGFTb3VyY2VEaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tCcmVhZGNydW1ic1Byb3ZpZGVyLCB0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIHNldCB1cCB0aGUgbGlzdGVuZXJzIGZvciB0aGUgb3V0bGluZSBjb250ZW50LCB0aGVzZSByZXNwb25kIHRvIG1vZGVsIGNoYW5nZXMgaW4gdGhlIG5vdGVib29rXG5cdCAqL1xuXHRwcml2YXRlIHNldE1vZGVsTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci50ZXh0TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBQZXJoYXBzIHRoaXMgaXMgdGhlIGZpcnN0IHRpbWUgd2UncmUgYnVpbGRpbmcgdGhlIG91dGxpbmVcblx0XHRpZiAoIXRoaXMuZW50cmllcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuY29tcHV0ZVN5bWJvbHMoKTtcblx0XHR9XG5cblx0XHQvLyByZWNvbXB1dGUgc3RhdGUgd2hlbiB0aGVyZSBhcmUgbm90ZWJvb2sgY29udGVudCBjaGFuZ2VzXG5cdFx0dGhpcy5fbW9kZWxEaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLnRleHRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoY29udGVudENoYW5nZXMgPT4ge1xuXHRcdFx0aWYgKGNvbnRlbnRDaGFuZ2VzLnJhd0V2ZW50cy5zb21lKGMgPT5cblx0XHRcdFx0Yy5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsQ29udGVudCB8fFxuXHRcdFx0XHRjLmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxJbnRlcm5hbE1ldGFkYXRhIHx8XG5cdFx0XHRcdGMua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW92ZSB8fFxuXHRcdFx0XHRjLmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlKSkge1xuXHRcdFx0XHR0aGlzLmRlbGF5ZWRSZWNvbXB1dGVTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZVN5bWJvbHMoY2FuY2VsVG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkge1xuXHRcdGlmICh0aGlzLl90YXJnZXQgPT09IE91dGxpbmVUYXJnZXQuT3V0bGluZVBhbmUgJiYgdGhpcy5vdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9scykge1xuXHRcdFx0Ly8gTm8gbmVlZCB0byB3YWl0IGZvciB0aGlzLCB3ZSB3YW50IHRoZSBvdXRsaW5lIHRvIHNob3cgdXAgcXVpY2tseS5cblx0XHRcdHZvaWQgdGhpcy5kb0NvbXB1dGVTeW1ib2xzKGNhbmNlbFRva2VuKTtcblx0XHR9XG5cdH1cblx0cHVibGljIGFzeW5jIGRvQ29tcHV0ZVN5bWJvbHMoY2FuY2VsVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2U/Lm9iamVjdD8uY29tcHV0ZUZ1bGxTeW1ib2xzKGNhbmNlbFRva2VuKTtcblx0fVxuXHRwcml2YXRlIGFzeW5jIGRlbGF5ZWRDb21wdXRlU3ltYm9scygpIHtcblx0XHR0aGlzLmRlbGF5ZXJSZWNvbXB1dGVTdGF0ZS5jYW5jZWwoKTtcblx0XHR0aGlzLmRlbGF5ZXJSZWNvbXB1dGVBY3RpdmUuY2FuY2VsKCk7XG5cdFx0dGhpcy5kZWxheWVyUmVjb21wdXRlU3ltYm9scy50cmlnZ2VyKCgpID0+IHsgdGhpcy5jb21wdXRlU3ltYm9scygpOyB9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVjb21wdXRlU3RhdGUoKSB7IHRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlPy5vYmplY3Q/LnJlY29tcHV0ZVN0YXRlKCk7IH1cblx0cHJpdmF0ZSBkZWxheWVkUmVjb21wdXRlU3RhdGUoKSB7XG5cdFx0dGhpcy5kZWxheWVyUmVjb21wdXRlQWN0aXZlLmNhbmNlbCgpOyAvLyBBY3RpdmUgaXMgYWx3YXlzIHJlY29tcHV0ZWQgYWZ0ZXIgYSByZWNvbXB1dGluZyB0aGUgU3RhdGUuXG5cdFx0dGhpcy5kZWxheWVyUmVjb21wdXRlU3RhdGUudHJpZ2dlcigoKSA9PiB7IHRoaXMucmVjb21wdXRlU3RhdGUoKTsgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlY29tcHV0ZUFjdGl2ZSgpIHsgdGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2U/Lm9iamVjdD8ucmVjb21wdXRlQWN0aXZlKCk7IH1cblx0cHJpdmF0ZSBkZWxheWVkUmVjb21wdXRlQWN0aXZlKCkge1xuXHRcdHRoaXMuZGVsYXllclJlY29tcHV0ZUFjdGl2ZS50cmlnZ2VyKCgpID0+IHsgdGhpcy5yZWNvbXB1dGVBY3RpdmUoKTsgfSk7XG5cdH1cblxuXHRhc3luYyByZXZlYWwoZW50cnk6IE91dGxpbmVFbnRyeSwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMsIHNpZGVCeVNpZGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvck9wdGlvbnM6IElOb3RlYm9va0VkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0b3ZlcnJpZGU6IHRoaXMuX2VkaXRvci5pbnB1dD8uZWRpdG9ySWQsXG5cdFx0XHRjZWxsUmV2ZWFsVHlwZTogQ2VsbFJldmVhbFR5cGUuVG9wLFxuXHRcdFx0c2VsZWN0aW9uOiBlbnRyeS5wb3NpdGlvbixcblx0XHRcdHZpZXdTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiBlbnRyeS5jZWxsLnVyaSxcblx0XHRcdG9wdGlvbnM6IG5vdGVib29rRWRpdG9yT3B0aW9ucyxcblx0XHR9LCBzaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcmV2aWV3KGVudHJ5OiBPdXRsaW5lRW50cnkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fZWRpdG9yLmdldENvbnRyb2woKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblxuXHRcdGlmIChlbnRyeS5yYW5nZSkge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBSYW5nZS5saWZ0KGVudHJ5LnJhbmdlKTtcblx0XHRcdHdpZGdldC5yZXZlYWxSYW5nZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnRBc3luYyhlbnRyeS5jZWxsLCByYW5nZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHdpZGdldC5yZXZlYWxJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGVudHJ5LmNlbGwpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlkcyA9IHdpZGdldC5kZWx0YUNlbGxEZWNvcmF0aW9ucyhbXSwgW3tcblx0XHRcdGhhbmRsZTogZW50cnkuY2VsbC5oYW5kbGUsXG5cdFx0XHRvcHRpb25zOiB7IGNsYXNzTmFtZTogJ25iLXN5bWJvbEhpZ2hsaWdodCcsIG91dHB1dENsYXNzTmFtZTogJ25iLXN5bWJvbEhpZ2hsaWdodCcgfVxuXHRcdH1dKTtcblxuXHRcdGxldCBlZGl0b3JEZWNvcmF0aW9uczogSUNlbGxNb2RlbERlY29yYXRpb25zW107XG5cdFx0d2lkZ2V0LmNoYW5nZU1vZGVsRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0aWYgKGVudHJ5LnJhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyYW5nZTogZW50cnkucmFuZ2UsIG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdkb2N1bWVudC1zeW1ib2xzLW91dGxpbmUtcmFuZ2UtaGlnaGxpZ2h0Jyxcblx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiAncmFuZ2VIaWdobGlnaHQnLFxuXHRcdFx0XHRcdFx0XHRpc1dob2xlTGluZTogdHJ1ZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XTtcblx0XHRcdFx0Y29uc3QgZGVsdGFEZWNvcmF0aW9uOiBJQ2VsbE1vZGVsRGVsdGFEZWNvcmF0aW9ucyA9IHtcblx0XHRcdFx0XHRvd25lcklkOiBlbnRyeS5jZWxsLmhhbmRsZSxcblx0XHRcdFx0XHRkZWNvcmF0aW9uczogZGVjb3JhdGlvbnNcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRlZGl0b3JEZWNvcmF0aW9ucyA9IGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMoW10sIFtkZWx0YURlY29yYXRpb25dKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0d2lkZ2V0LmRlbHRhQ2VsbERlY29yYXRpb25zKGlkcywgW10pO1xuXHRcdFx0aWYgKGVkaXRvckRlY29yYXRpb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0d2lkZ2V0LmNoYW5nZU1vZGVsRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMoZWRpdG9yRGVjb3JhdGlvbnMsIFtdKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0fVxuXG5cdGNhcHR1cmVWaWV3U3RhdGUoKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2VkaXRvci5nZXRDb250cm9sKCk7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gd2lkZ2V0Py5nZXRFZGl0b3JWaWV3U3RhdGUoKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh2aWV3U3RhdGUpIHtcblx0XHRcdFx0d2lkZ2V0Py5yZXN0b3JlTGlzdFZpZXdTdGF0ZSh2aWV3U3RhdGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2RhdGFTb3VyY2VEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2U/LmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tPdXRsaW5lQ3JlYXRvciBpbXBsZW1lbnRzIElPdXRsaW5lQ3JlYXRvcjxOb3RlYm9va0VkaXRvciwgT3V0bGluZUVudHJ5PiB7XG5cblx0cmVhZG9ubHkgZGlzcG9zZTogKCkgPT4gdm9pZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU91dGxpbmVTZXJ2aWNlIG91dGxpbmVTZXJ2aWNlOiBJT3V0bGluZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IHJlZyA9IG91dGxpbmVTZXJ2aWNlLnJlZ2lzdGVyT3V0bGluZUNyZWF0b3IodGhpcyk7XG5cdFx0dGhpcy5kaXNwb3NlID0gKCkgPT4gcmVnLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG1hdGNoZXMoY2FuZGlkYXRlOiBJRWRpdG9yUGFuZSk6IGNhbmRpZGF0ZSBpcyBOb3RlYm9va0VkaXRvciB7XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZS5nZXRJZCgpID09PSBOb3RlYm9va0VkaXRvci5JRDtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZU91dGxpbmUoZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3JQYW5lLCB0YXJnZXQ6IE91dGxpbmVUYXJnZXQsIGNhbmNlbFRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SU91dGxpbmU8T3V0bGluZUVudHJ5PiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG91dGxpbmUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0NlbGxPdXRsaW5lLCBlZGl0b3IsIHRhcmdldCk7XG5cdFx0aWYgKHRhcmdldCA9PT0gT3V0bGluZVRhcmdldC5RdWlja1BpY2spIHtcblx0XHRcdC8vIFRoZSBxdWlja3BpY2sgY3JlYXRlcyB0aGUgb3V0bGluZSBvbiBkZW1hbmRcblx0XHRcdC8vIHNvIHdlIG5lZWQgdG8gZW5zdXJlIHRoZSBzeW1ib2xzIGFyZSBwcmUtY2FjaGVkIGJlZm9yZSB0aGUgZW50cmllcyBhcmUgc3luY3Jvbm91c2x5IHJlcXVlc3RlZFxuXHRcdFx0YXdhaXQgb3V0bGluZS5kb0NvbXB1dGVTeW1ib2xzKGNhbmNlbFRva2VuKTtcblx0XHR9XG5cdFx0cmV0dXJuIG91dGxpbmU7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IE5vdGVib29rT3V0bGluZUNvbnRleHQgPSB7XG5cdENlbGxLaW5kOiBuZXcgUmF3Q29udGV4dEtleTxDZWxsS2luZD4oJ25vdGVib29rQ2VsbEtpbmQnLCB1bmRlZmluZWQpLFxuXHRDZWxsSGFzQ2hpbGRyZW46IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdub3RlYm9va0NlbGxIYXNDaGlsZHJlbicsIGZhbHNlKSxcblx0Q2VsbEhhc0hlYWRlcjogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ25vdGVib29rQ2VsbEhhc0hlYWRlcicsIGZhbHNlKSxcblx0Q2VsbEZvbGRpbmdTdGF0ZTogbmV3IFJhd0NvbnRleHRLZXk8Q2VsbEZvbGRpbmdTdGF0ZT4oJ25vdGVib29rQ2VsbEZvbGRpbmdTdGF0ZScsIENlbGxGb2xkaW5nU3RhdGUuTm9uZSksXG5cdE91dGxpbmVFbGVtZW50VGFyZ2V0OiBuZXcgUmF3Q29udGV4dEtleTxPdXRsaW5lVGFyZ2V0Pignbm90ZWJvb2tPdXRsaW5lRWxlbWVudFRhcmdldCcsIHVuZGVmaW5lZCksXG59O1xuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oTm90ZWJvb2tPdXRsaW5lQ3JlYXRvciwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnbm90ZWJvb2snLFxuXHRvcmRlcjogMTAwLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0W05vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHldOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ291dGxpbmUuc2hvd01hcmtkb3duSGVhZGVyc09ubHknLCBcIldoZW4gZW5hYmxlZCwgbm90ZWJvb2sgb3V0bGluZSB3aWxsIHNob3cgb25seSBtYXJrZG93biBjZWxscyBjb250YWluaW5nIGEgaGVhZGVyLlwiKVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxsc106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ291dGxpbmUuc2hvd0NvZGVDZWxscycsIFwiV2hlbiBlbmFibGVkLCBub3RlYm9vayBvdXRsaW5lIHNob3dzIGNvZGUgY2VsbHMuXCIpXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdvdXRsaW5lLnNob3dDb2RlQ2VsbFN5bWJvbHMnLCBcIldoZW4gZW5hYmxlZCwgbm90ZWJvb2sgb3V0bGluZSBzaG93cyBjb2RlIGNlbGwgc3ltYm9scy4gUmVsaWVzIG9uIGAjbm90ZWJvb2sub3V0bGluZS5zaG93Q29kZUNlbGxzI2AgYmVpbmcgZW5hYmxlZC5cIilcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuYnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdicmVhZGNydW1icy5zaG93Q29kZUNlbGxzJywgXCJXaGVuIGVuYWJsZWQsIG5vdGVib29rIGJyZWFkY3J1bWJzIGNvbnRhaW4gY29kZSBjZWxscy5cIilcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcuZ290b1N5bWJvbHNBbGxTeW1ib2xzXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9vay5nb3RvU3ltYm9scy5zaG93QWxsU3ltYm9scycsIFwiV2hlbiBlbmFibGVkLCB0aGUgR28gdG8gU3ltYm9sIFF1aWNrIFBpY2sgd2lsbCBkaXNwbGF5IGZ1bGwgY29kZSBzeW1ib2xzIGZyb20gdGhlIG5vdGVib29rLCBhcyB3ZWxsIGFzIE1hcmtkb3duIGhlYWRlcnMuXCIpXG5cdFx0fSxcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVmlld1RpdGxlLCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5Ob3RlYm9va091dGxpbmVGaWx0ZXIsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnZmlsdGVyJywgXCJGaWx0ZXIgRW50cmllc1wiKSxcblx0aWNvbjogQ29kaWNvbi5maWx0ZXIsXG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiAtMSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIElPdXRsaW5lUGFuZS5JZCksIE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IpLFxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVTaG93TWFya2Rvd25IZWFkZXJzT25seSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLm91dGxpbmUudG9nZ2xlU2hvd01hcmtkb3duSGVhZGVyc09ubHknLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCd0b2dnbGVTaG93TWFya2Rvd25IZWFkZXJzT25seScsIFwiTWFya2Rvd24gSGVhZGVycyBPbmx5XCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm91dGxpbmUuc2hvd01hcmtkb3duSGVhZGVyc09ubHknLCB0cnVlKVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va091dGxpbmVGaWx0ZXIsXG5cdFx0XHRcdGdyb3VwOiAnMF9tYXJrZG93bl9jZWxscycsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgc2hvd01hcmtkb3duSGVhZGVyc09ubHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5KTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5LCAhc2hvd01hcmtkb3duSGVhZGVyc09ubHkpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZUNvZGVDZWxsRW50cmllcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLm91dGxpbmUudG9nZ2xlQ29kZUNlbGxzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndG9nZ2xlQ29kZUNlbGxzJywgXCJDb2RlIENlbGxzXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxscycsIHRydWUpXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rT3V0bGluZUZpbHRlcixcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdGdyb3VwOiAnMV9jb2RlX2NlbGxzJyxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBzaG93Q29kZUNlbGxzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxzKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbHMsICFzaG93Q29kZUNlbGxzKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVDb2RlQ2VsbFN5bWJvbEVudHJpZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5vdXRsaW5lLnRvZ2dsZUNvZGVDZWxsU3ltYm9scycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3RvZ2dsZUNvZGVDZWxsU3ltYm9scycsIFwiQ29kZSBDZWxsIFN5bWJvbHNcIiksXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2sub3V0bGluZS5zaG93Q29kZUNlbGxTeW1ib2xzJywgdHJ1ZSlcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tPdXRsaW5lRmlsdGVyLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0Z3JvdXA6ICcxX2NvZGVfY2VsbHMnLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNob3dDb2RlQ2VsbFN5bWJvbHMgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9scywgIXNob3dDb2RlQ2VsbFN5bWJvbHMpO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxTQUFTO0FBQ3JCLFNB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
