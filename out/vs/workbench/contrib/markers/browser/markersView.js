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
import "./media/markers.css";
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Separator } from "../../../../base/common/actions.js";
import { groupBy } from "../../../../base/common/arrays.js";
import { Event, Relay } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { deepClone } from "../../../../base/common/objects.js";
import { isDefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { fillInMarkersDragData } from "../../../../platform/dnd/browser/dnd.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResultKind } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { IListService, WorkbenchObjectTree } from "../../../../platform/list/browser/listService.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IOpenerService, withSelection } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { RangeHighlightDecorations } from "../../../browser/codeeditor.js";
import { ResourceListDnDHandler } from "../../../browser/dnd.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { FilterViewPane } from "../../../browser/parts/views/viewPane.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { Memento } from "../../../common/memento.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { Markers, MarkersContextKeys, MarkersViewMode } from "../common/markers.js";
import { FilterOptions } from "./markersFilterOptions.js";
import { compareMarkersByUri, Marker, MarkersModel, MarkerTableItem, RelatedInformation, ResourceMarkers } from "./markersModel.js";
import { MarkersTable } from "./markersTable.js";
import { Filter, MarkerRenderer, MarkersViewModel, MarkersWidgetAccessibilityProvider, RelatedInformationRenderer, ResourceMarkersRenderer, VirtualDelegate } from "./markersTreeViewer.js";
import { MarkersFilters } from "./markersViewActions.js";
import Messages from "./messages.js";
function createResourceMarkersIterator(resourceMarkers) {
  return Iterable.map(resourceMarkers.markers, (m) => {
    const relatedInformationIt = Iterable.from(m.relatedInformation);
    const children = Iterable.map(relatedInformationIt, (r) => ({ element: r }));
    return { element: m, children };
  });
}
let MarkersView = class extends FilterViewPane {
  constructor(options, instantiationService, viewDescriptorService, editorService, configurationService, markerService, contextKeyService, workspaceContextService, contextMenuService, uriIdentityService, keybindingService, storageService, openerService, themeService, hoverService) {
    const memento = new Memento(Markers.MARKERS_VIEW_STORAGE_ID, storageService);
    const panelState = memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    super({
      ...options,
      filterOptions: {
        ariaLabel: Messages.MARKERS_PANEL_FILTER_ARIA_LABEL,
        placeholder: Messages.MARKERS_PANEL_FILTER_PLACEHOLDER,
        focusContextKey: MarkersContextKeys.MarkerViewFilterFocusContextKey.key,
        text: panelState.filter || "",
        history: panelState.filterHistory || []
      }
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.editorService = editorService;
    this.markerService = markerService;
    this.workspaceContextService = workspaceContextService;
    this.uriIdentityService = uriIdentityService;
    this.lastSelectedRelativeTop = 0;
    this.currentActiveResource = null;
    this.onVisibleDisposables = this._register(new DisposableStore());
    this.widgetDisposables = this._register(new DisposableStore());
    this.currentHeight = 0;
    this.currentWidth = 0;
    this.cachedFilterStats = void 0;
    this.currentResourceGotAddedToMarkersData = false;
    this.onDidChangeVisibility = this.onDidChangeBodyVisibility;
    this.memento = memento;
    this.panelState = panelState;
    this.markersModel = this._register(instantiationService.createInstance(MarkersModel));
    this.markersViewModel = this._register(instantiationService.createInstance(MarkersViewModel, this.panelState.multiline, this.panelState.viewMode ?? this.getDefaultViewMode()));
    this._register(this.onDidChangeVisibility((visible) => this.onDidChangeMarkersViewVisibility(visible)));
    this._register(this.markersViewModel.onDidChangeViewMode((_) => this.onDidChangeViewMode()));
    this.widgetAccessibilityProvider = instantiationService.createInstance(MarkersWidgetAccessibilityProvider);
    this.widgetIdentityProvider = { getId(element) {
      return element.id;
    } };
    this.setCurrentActiveEditor();
    this.filter = new Filter(FilterOptions.EMPTY(uriIdentityService));
    this.rangeHighlightDecorations = this._register(this.instantiationService.createInstance(RangeHighlightDecorations));
    this.filters = this._register(new MarkersFilters({
      filterHistory: this.panelState.filterHistory || [],
      showErrors: this.panelState.showErrors !== false,
      showWarnings: this.panelState.showWarnings !== false,
      showInfos: this.panelState.showInfos !== false,
      excludedFiles: !!this.panelState.useFilesExclude,
      activeFile: !!this.panelState.activeFile
    }, this.contextKeyService));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (this.filters.excludedFiles && e.affectsConfiguration("files.exclude")) {
        this.updateFilter();
      }
    }));
  }
  render() {
    super.render();
    this._register(registerNavigableContainer({
      name: "markersView",
      focusNotifiers: [this, this.filterWidget],
      focusNextWidget: () => {
        if (this.filterWidget.hasFocus()) {
          this.focus();
        }
      },
      focusPreviousWidget: () => {
        if (!this.filterWidget.hasFocus()) {
          this.focusFilter();
        }
      }
    }));
  }
  renderBody(parent) {
    super.renderBody(parent);
    parent.classList.add("markers-panel");
    this._register(dom.addDisposableListener(parent, "keydown", (e) => {
      const event = new StandardKeyboardEvent(e);
      if (!this.keybindingService.mightProducePrintableCharacter(event)) {
        return;
      }
      const result = this.keybindingService.softDispatch(event, event.target);
      if (result.kind === ResultKind.MoreChordsNeeded || result.kind === ResultKind.KbFound) {
        return;
      }
      this.focusFilter();
    }));
    const panelContainer = dom.append(parent, dom.$(".markers-panel-container"));
    this.createArialLabelElement(panelContainer);
    this.createMessageBox(panelContainer);
    this.widgetContainer = dom.append(panelContainer, dom.$(".widget-container"));
    this.createWidget(this.widgetContainer);
    this.updateFilter();
    this.renderContent();
  }
  getTitle() {
    return Messages.MARKERS_PANEL_TITLE_PROBLEMS.value;
  }
  layoutBodyContent(height = this.currentHeight, width = this.currentWidth) {
    if (this.messageBoxContainer) {
      this.messageBoxContainer.style.height = `${height}px`;
    }
    this.widget.layout(height, width);
    this.currentHeight = height;
    this.currentWidth = width;
  }
  focus() {
    super.focus();
    if (dom.isActiveElement(this.widget.getHTMLElement())) {
      return;
    }
    if (this.hasNoProblems()) {
      this.messageBoxContainer.focus();
    } else {
      this.widget.domFocus();
      this.widget.setMarkerSelection();
    }
  }
  focusFilter() {
    this.filterWidget.focus();
  }
  updateBadge(total, filtered) {
    this.filterWidget.updateBadge(total === filtered || total === 0 ? void 0 : localize("showing filtered problems", "Showing {0} of {1}", filtered, total));
  }
  checkMoreFilters() {
    this.filterWidget.checkMoreFilters(!this.filters.showErrors || !this.filters.showWarnings || !this.filters.showInfos || this.filters.excludedFiles || this.filters.activeFile);
  }
  clearFilterText() {
    this.filterWidget.setFilterText("");
  }
  showQuickFixes(marker) {
    const viewModel = this.markersViewModel.getViewModel(marker);
    if (viewModel) {
      viewModel.quickFixAction.run();
    }
  }
  openFileAtElement(element, preserveFocus, sideByside, pinned) {
    const { resource, selection } = element instanceof Marker ? { resource: element.resource, selection: element.range } : element instanceof RelatedInformation ? { resource: element.raw.resource, selection: element.raw } : "marker" in element ? { resource: element.marker.resource, selection: element.marker.range } : { resource: null, selection: null };
    if (resource && selection) {
      this.editorService.openEditor({
        resource,
        options: {
          selection,
          preserveFocus,
          pinned,
          revealIfVisible: true
        }
      }, sideByside ? SIDE_GROUP : ACTIVE_GROUP).then((editor) => {
        if (editor && preserveFocus) {
          this.rangeHighlightDecorations.highlightRange({ resource, range: selection }, editor.getControl());
        } else {
          this.rangeHighlightDecorations.removeHighlightRange();
        }
      });
      return true;
    } else {
      this.rangeHighlightDecorations.removeHighlightRange();
    }
    return false;
  }
  refreshPanel(markerOrChange) {
    if (this.isVisible()) {
      const hasSelection = this.widget.getSelection().length > 0;
      if (markerOrChange) {
        if (markerOrChange instanceof Marker) {
          this.widget.updateMarker(markerOrChange);
        } else {
          if (markerOrChange.added.size || markerOrChange.removed.size || this.filters.activeFile) {
            this.resetWidget();
          } else {
            this.widget.update([...markerOrChange.updated]);
          }
        }
      } else {
        this.resetWidget();
      }
      if (hasSelection) {
        this.widget.setMarkerSelection();
      }
      this.cachedFilterStats = void 0;
      const { total, filtered } = this.getFilterStats();
      this.toggleVisibility(total === 0 || filtered === 0);
      this.renderMessage();
      this.updateBadge(total, filtered);
      this.checkMoreFilters();
    }
  }
  onDidChangeViewState(marker) {
    this.refreshPanel(marker);
  }
  resetWidget() {
    this.widget.reset(this.getResourceMarkers());
  }
  updateFilter() {
    this.filter.options = new FilterOptions(this.filterWidget.getFilterText(), this.getFilesExcludeExpressions(), this.filters.showWarnings, this.filters.showErrors, this.filters.showInfos, this.uriIdentityService);
    this.widget.filterMarkers(this.getResourceMarkers(), this.filter.options);
    this.cachedFilterStats = void 0;
    const { total, filtered } = this.getFilterStats();
    this.toggleVisibility(total === 0 || filtered === 0);
    this.renderMessage();
    this.updateBadge(total, filtered);
    this.checkMoreFilters();
  }
  getDefaultViewMode() {
    switch (this.configurationService.getValue("problems.defaultViewMode")) {
      case "table":
        return MarkersViewMode.Table;
      case "tree":
        return MarkersViewMode.Tree;
      default:
        return MarkersViewMode.Tree;
    }
  }
  getFilesExcludeExpressions() {
    if (!this.filters.excludedFiles) {
      return [];
    }
    const workspaceFolders = this.workspaceContextService.getWorkspace().folders;
    return workspaceFolders.length ? workspaceFolders.map((workspaceFolder) => ({ root: workspaceFolder.uri, expression: this.getFilesExclude(workspaceFolder.uri) })) : this.getFilesExclude();
  }
  getFilesExclude(resource) {
    return deepClone(this.configurationService.getValue("files.exclude", { resource })) || {};
  }
  getResourceMarkers() {
    if (!this.filters.activeFile) {
      return this.markersModel.resourceMarkers;
    }
    let resourceMarkers = [];
    if (this.currentActiveResource) {
      const activeResourceMarkers = this.markersModel.getResourceMarkers(this.currentActiveResource);
      if (activeResourceMarkers) {
        resourceMarkers = [activeResourceMarkers];
      }
    }
    return resourceMarkers;
  }
  createMessageBox(parent) {
    this.messageBoxContainer = dom.append(parent, dom.$(".message-box-container"));
    this.messageBoxContainer.setAttribute("aria-labelledby", "markers-panel-arialabel");
  }
  createArialLabelElement(parent) {
    this.ariaLabelElement = dom.append(parent, dom.$(""));
    this.ariaLabelElement.setAttribute("id", "markers-panel-arialabel");
  }
  createWidget(parent) {
    this.widget = this.markersViewModel.viewMode === MarkersViewMode.Table ? this.createTable(parent) : this.createTree(parent);
    this.widgetDisposables.add(this.widget);
    const markerFocusContextKey = MarkersContextKeys.MarkerFocusContextKey.bindTo(this.widget.contextKeyService);
    const relatedInformationFocusContextKey = MarkersContextKeys.RelatedInformationFocusContextKey.bindTo(this.widget.contextKeyService);
    this.widgetDisposables.add(this.widget.onDidChangeFocus((focus) => {
      markerFocusContextKey.set(focus.elements.some((e) => e instanceof Marker));
      relatedInformationFocusContextKey.set(focus.elements.some((e) => e instanceof RelatedInformation));
    }));
    this.widgetDisposables.add(Event.debounce(this.widget.onDidOpen, (last, event) => event, 75, true)((options) => {
      this.openFileAtElement(options.element, !!options.editorOptions.preserveFocus, options.sideBySide, !!options.editorOptions.pinned);
    }));
    this.widgetDisposables.add(Event.any(this.widget.onDidChangeSelection, this.widget.onDidChangeFocus)(() => {
      const elements = [...this.widget.getSelection(), ...this.widget.getFocus()];
      for (const element of elements) {
        if (element instanceof Marker) {
          const viewModel = this.markersViewModel.getViewModel(element);
          viewModel?.showLightBulb();
        }
      }
    }));
    this.widgetDisposables.add(this.widget.onContextMenu(this.onContextMenu, this));
    this.widgetDisposables.add(this.widget.onDidChangeSelection(this.onSelected, this));
  }
  createTable(parent) {
    const table = this.instantiationService.createInstance(
      MarkersTable,
      dom.append(parent, dom.$(".markers-table-container")),
      this.markersViewModel,
      this.getResourceMarkers(),
      this.filter.options,
      {
        accessibilityProvider: this.widgetAccessibilityProvider,
        dnd: this.instantiationService.createInstance(ResourceListDnDHandler, (element) => {
          if (element instanceof MarkerTableItem) {
            return withSelection(element.resource, element.range);
          }
          return null;
        }),
        horizontalScrolling: false,
        identityProvider: this.widgetIdentityProvider,
        multipleSelectionSupport: true,
        selectionNavigation: true
      }
    );
    return table;
  }
  createTree(parent) {
    const onDidChangeRenderNodeCount = new Relay();
    const treeLabels = this.instantiationService.createInstance(ResourceLabels, this);
    const virtualDelegate = new VirtualDelegate(this.markersViewModel);
    const renderers = [
      this.instantiationService.createInstance(ResourceMarkersRenderer, treeLabels, onDidChangeRenderNodeCount.event),
      this.instantiationService.createInstance(MarkerRenderer, this.markersViewModel),
      this.instantiationService.createInstance(RelatedInformationRenderer)
    ];
    const tree = this.instantiationService.createInstance(
      MarkersTree,
      "MarkersView",
      dom.append(parent, dom.$(".tree-container.show-file-icons")),
      virtualDelegate,
      renderers,
      {
        filter: this.filter,
        accessibilityProvider: this.widgetAccessibilityProvider,
        identityProvider: this.widgetIdentityProvider,
        dnd: this.instantiationService.createInstance(MarkersListDnDHandler),
        expandOnlyOnTwistieClick: (e) => e instanceof Marker && e.relatedInformation.length > 0,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles,
        selectionNavigation: true,
        multipleSelectionSupport: true
      }
    );
    onDidChangeRenderNodeCount.input = tree.onDidChangeRenderNodeCount;
    return tree;
  }
  collapseAll() {
    this.widget.collapseMarkers();
  }
  setMultiline(multiline) {
    this.markersViewModel.multiline = multiline;
  }
  setViewMode(viewMode) {
    this.markersViewModel.viewMode = viewMode;
  }
  onDidChangeMarkersViewVisibility(visible) {
    this.onVisibleDisposables.clear();
    if (visible) {
      for (const disposable of this.reInitialize()) {
        this.onVisibleDisposables.add(disposable);
      }
      this.refreshPanel();
    }
  }
  reInitialize() {
    const disposables = [];
    const readMarkers = (resource) => this.markerService.read({ resource, severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info });
    this.markersModel.setResourceMarkers(groupBy(readMarkers(), compareMarkersByUri).map((group) => [group[0].resource, group]));
    disposables.push(Event.debounce(this.markerService.onMarkerChanged, (resourcesMap, resources) => {
      resourcesMap = resourcesMap || new ResourceMap();
      resources.forEach((resource) => resourcesMap.set(resource, resource));
      return resourcesMap;
    }, 64)((resourcesMap) => {
      this.markersModel.setResourceMarkers([...resourcesMap.values()].map((resource) => [resource, readMarkers(resource)]));
    }));
    disposables.push(Event.any(this.markersModel.onDidChange, this.editorService.onDidActiveEditorChange)((changes) => {
      if (changes) {
        this.onDidChangeModel(changes);
      } else {
        this.onActiveEditorChanged();
      }
    }));
    disposables.push(toDisposable(() => this.markersModel.reset()));
    this.markersModel.resourceMarkers.forEach((resourceMarker) => resourceMarker.markers.forEach((marker) => this.markersViewModel.add(marker)));
    disposables.push(this.markersViewModel.onDidChange((marker) => this.onDidChangeViewState(marker)));
    disposables.push(toDisposable(() => this.markersModel.resourceMarkers.forEach((resourceMarker) => this.markersViewModel.remove(resourceMarker.resource))));
    disposables.push(this.filters.onDidChange((event) => {
      if (event.activeFile) {
        this.refreshPanel();
      } else if (event.excludedFiles || event.showWarnings || event.showErrors || event.showInfos) {
        this.updateFilter();
      }
    }));
    disposables.push(this.filterWidget.onDidChangeFilterText((e) => this.updateFilter()));
    disposables.push(toDisposable(() => {
      this.cachedFilterStats = void 0;
    }));
    disposables.push(toDisposable(() => this.rangeHighlightDecorations.removeHighlightRange()));
    return disposables;
  }
  onDidChangeModel(change) {
    const resourceMarkers = [...change.added, ...change.removed, ...change.updated];
    const resources = [];
    for (const { resource } of resourceMarkers) {
      this.markersViewModel.remove(resource);
      const resourceMarkers2 = this.markersModel.getResourceMarkers(resource);
      if (resourceMarkers2) {
        for (const marker of resourceMarkers2.markers) {
          this.markersViewModel.add(marker);
        }
      }
      resources.push(resource);
    }
    this.currentResourceGotAddedToMarkersData = this.currentResourceGotAddedToMarkersData || this.isCurrentResourceGotAddedToMarkersData(resources);
    this.refreshPanel(change);
    this.updateRangeHighlights();
    if (this.currentResourceGotAddedToMarkersData) {
      this.autoReveal();
      this.currentResourceGotAddedToMarkersData = false;
    }
  }
  onDidChangeViewMode() {
    if (this.widgetContainer && this.widget) {
      this.widgetContainer.textContent = "";
      this.widgetDisposables.clear();
    }
    const selection = /* @__PURE__ */ new Set();
    for (const marker of this.widget.getSelection()) {
      if (marker instanceof ResourceMarkers) {
        marker.markers.forEach((m) => selection.add(m));
      } else if (marker instanceof Marker || marker instanceof MarkerTableItem) {
        selection.add(marker);
      }
    }
    const focus = /* @__PURE__ */ new Set();
    for (const marker of this.widget.getFocus()) {
      if (marker instanceof Marker || marker instanceof MarkerTableItem) {
        focus.add(marker);
      }
    }
    this.createWidget(this.widgetContainer);
    this.refreshPanel();
    if (selection.size > 0) {
      this.widget.setMarkerSelection(Array.from(selection), Array.from(focus));
      this.widget.domFocus();
    }
  }
  isCurrentResourceGotAddedToMarkersData(changedResources) {
    const currentlyActiveResource = this.currentActiveResource;
    if (!currentlyActiveResource) {
      return false;
    }
    const resourceForCurrentActiveResource = this.getResourceForCurrentActiveResource();
    if (resourceForCurrentActiveResource) {
      return false;
    }
    return changedResources.some((r) => r.toString() === currentlyActiveResource.toString());
  }
  onActiveEditorChanged() {
    this.setCurrentActiveEditor();
    if (this.filters.activeFile) {
      this.refreshPanel();
    }
    this.autoReveal();
  }
  setCurrentActiveEditor() {
    const activeEditor = this.editorService.activeEditor;
    this.currentActiveResource = activeEditor ? EditorResourceAccessor.getOriginalUri(activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY }) ?? null : null;
  }
  onSelected() {
    const selection = this.widget.getSelection();
    if (selection && selection.length > 0) {
      this.lastSelectedRelativeTop = this.widget.getRelativeTop(selection[0]) || 0;
    }
  }
  hasNoProblems() {
    const { total, filtered } = this.getFilterStats();
    return total === 0 || filtered === 0;
  }
  renderContent() {
    this.cachedFilterStats = void 0;
    this.resetWidget();
    this.toggleVisibility(this.hasNoProblems());
    this.renderMessage();
  }
  renderMessage() {
    if (!this.messageBoxContainer || !this.ariaLabelElement) {
      return;
    }
    dom.clearNode(this.messageBoxContainer);
    const { total, filtered } = this.getFilterStats();
    if (filtered === 0) {
      this.messageBoxContainer.style.display = "block";
      this.messageBoxContainer.setAttribute("tabIndex", "0");
      if (this.filters.activeFile) {
        this.renderFilterMessageForActiveFile(this.messageBoxContainer);
      } else {
        if (total > 0) {
          this.renderFilteredByFilterMessage(this.messageBoxContainer);
        } else {
          this.renderNoProblemsMessage(this.messageBoxContainer);
        }
      }
    } else {
      this.messageBoxContainer.style.display = "none";
      if (filtered === total) {
        this.setAriaLabel(localize("No problems filtered", "Showing {0} problems", total));
      } else {
        this.setAriaLabel(localize("problems filtered", "Showing {0} of {1} problems", filtered, total));
      }
      this.messageBoxContainer.removeAttribute("tabIndex");
    }
  }
  renderFilterMessageForActiveFile(container) {
    if (this.currentActiveResource && this.markersModel.getResourceMarkers(this.currentActiveResource)) {
      this.renderFilteredByFilterMessage(container);
    } else {
      this.renderNoProblemsMessageForActiveFile(container);
    }
  }
  renderFilteredByFilterMessage(container) {
    const span1 = dom.append(container, dom.$("span"));
    span1.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS;
    const link = dom.append(container, dom.$("a.messageAction"));
    link.textContent = localize("clearFilter", "Clear Filters");
    link.setAttribute("tabIndex", "0");
    const span2 = dom.append(container, dom.$("span"));
    span2.textContent = ".";
    dom.addStandardDisposableListener(link, dom.EventType.CLICK, () => this.clearFilters());
    dom.addStandardDisposableListener(link, dom.EventType.KEY_DOWN, (e) => {
      if (e.equals(KeyCode.Enter) || e.equals(KeyCode.Space)) {
        this.clearFilters();
        e.stopPropagation();
      }
    });
    this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_FILTERS);
  }
  renderNoProblemsMessageForActiveFile(container) {
    const span = dom.append(container, dom.$("span"));
    span.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_ACTIVE_FILE_BUILT;
    this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_ACTIVE_FILE_BUILT);
  }
  renderNoProblemsMessage(container) {
    const span = dom.append(container, dom.$("span"));
    span.textContent = Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT;
    this.setAriaLabel(Messages.MARKERS_PANEL_NO_PROBLEMS_BUILT);
  }
  setAriaLabel(label) {
    this.widget.setAriaLabel(label);
    this.ariaLabelElement.setAttribute("aria-label", label);
  }
  clearFilters() {
    this.filterWidget.setFilterText("");
    this.filters.excludedFiles = false;
    this.filters.showErrors = true;
    this.filters.showWarnings = true;
    this.filters.showInfos = true;
  }
  autoReveal(focus = false) {
    if (this.filters.activeFile) {
      return;
    }
    const autoReveal = this.configurationService.getValue("problems.autoReveal");
    if (typeof autoReveal === "boolean" && autoReveal) {
      const currentActiveResource = this.getResourceForCurrentActiveResource();
      this.widget.revealMarkers(currentActiveResource, focus, this.lastSelectedRelativeTop);
    }
  }
  getResourceForCurrentActiveResource() {
    return this.currentActiveResource ? this.markersModel.getResourceMarkers(this.currentActiveResource) : null;
  }
  updateRangeHighlights() {
    this.rangeHighlightDecorations.removeHighlightRange();
    if (dom.isActiveElement(this.widget.getHTMLElement())) {
      this.highlightCurrentSelectedMarkerRange();
    }
  }
  highlightCurrentSelectedMarkerRange() {
    const selections = this.widget.getSelection() ?? [];
    if (selections.length !== 1) {
      return;
    }
    const selection = selections[0];
    if (!(selection instanceof Marker)) {
      return;
    }
    this.rangeHighlightDecorations.highlightRange(selection);
  }
  onContextMenu(e) {
    const element = e.element;
    if (!element) {
      return;
    }
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      menuId: MenuId.ProblemsPanelContext,
      contextKeyService: this.widget.contextKeyService,
      getActions: () => this.getMenuActions(element),
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.widget.domFocus();
        }
      }
    });
  }
  getMenuActions(element) {
    const result = [];
    if (element instanceof Marker) {
      const viewModel = this.markersViewModel.getViewModel(element);
      if (viewModel) {
        const quickFixActions = viewModel.quickFixAction.quickFixes;
        if (quickFixActions.length) {
          result.push(...quickFixActions);
          result.push(new Separator());
        }
      }
    }
    return result;
  }
  getFocusElement() {
    return this.widget.getFocus()[0] ?? void 0;
  }
  getFocusedSelectedElements() {
    const focus = this.getFocusElement();
    if (!focus) {
      return null;
    }
    const selection = this.widget.getSelection();
    if (selection.includes(focus)) {
      const result = [];
      for (const selected of selection) {
        if (selected) {
          result.push(selected);
        }
      }
      return result;
    } else {
      return [focus];
    }
  }
  getAllResourceMarkers() {
    return this.markersModel.resourceMarkers;
  }
  getFilterStats() {
    if (!this.cachedFilterStats) {
      this.cachedFilterStats = {
        total: this.markersModel.total,
        filtered: this.widget?.getVisibleItemCount() ?? 0
      };
    }
    return this.cachedFilterStats;
  }
  toggleVisibility(hide) {
    this.widget.toggleVisibility(hide);
    this.layoutBodyContent();
  }
  saveState() {
    this.panelState.filter = this.filterWidget.getFilterText();
    this.panelState.filterHistory = this.filters.filterHistory;
    this.panelState.showErrors = this.filters.showErrors;
    this.panelState.showWarnings = this.filters.showWarnings;
    this.panelState.showInfos = this.filters.showInfos;
    this.panelState.useFilesExclude = this.filters.excludedFiles;
    this.panelState.activeFile = this.filters.activeFile;
    this.panelState.multiline = this.markersViewModel.multiline;
    this.panelState.viewMode = this.markersViewModel.viewMode;
    this.memento.saveMemento();
    super.saveState();
  }
  dispose() {
    super.dispose();
  }
};
MarkersView = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IViewDescriptorService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IMarkerService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService)
], MarkersView);
let MarkersTree = class extends WorkbenchObjectTree {
  constructor(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, themeService, configurationService) {
    super(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService);
    this.container = container;
    this.visibilityContextKey = MarkersContextKeys.MarkersTreeVisibilityContextKey.bindTo(contextKeyService);
  }
  collapseMarkers() {
    this.collapseAll();
    this.setSelection([]);
    this.setFocus([]);
    this.getHTMLElement().focus();
    this.focusFirst();
  }
  filterMarkers() {
    this.refilter();
  }
  getVisibleItemCount() {
    let filtered = 0;
    const root = this.getNode();
    for (const resourceMarkerNode of root.children) {
      for (const markerNode of resourceMarkerNode.children) {
        if (resourceMarkerNode.visible && markerNode.visible) {
          filtered++;
        }
      }
    }
    return filtered;
  }
  isVisible() {
    return !this.container.classList.contains("hidden");
  }
  toggleVisibility(hide) {
    this.visibilityContextKey.set(!hide);
    this.container.classList.toggle("hidden", hide);
  }
  reset(resourceMarkers) {
    this.setChildren(null, Iterable.map(resourceMarkers, (m) => ({ element: m, children: createResourceMarkersIterator(m) })));
  }
  revealMarkers(activeResource, focus, lastSelectedRelativeTop) {
    if (activeResource) {
      if (this.hasElement(activeResource)) {
        if (!this.isCollapsed(activeResource) && this.hasSelectedMarkerFor(activeResource)) {
          this.reveal(this.getSelection()[0], lastSelectedRelativeTop);
          if (focus) {
            this.setFocus(this.getSelection());
          }
        } else {
          this.expand(activeResource);
          this.reveal(activeResource, 0);
          if (focus) {
            this.setFocus([activeResource]);
            this.setSelection([activeResource]);
          }
        }
      }
    } else if (focus) {
      this.setSelection([]);
      this.focusFirst();
    }
  }
  setAriaLabel(label) {
    this.ariaLabel = label;
  }
  setMarkerSelection(selection, focus) {
    if (this.isVisible()) {
      if (selection && selection.length > 0) {
        this.setSelection(selection.map((m) => this.findMarkerNode(m)));
        if (focus && focus.length > 0) {
          this.setFocus(focus.map((f) => this.findMarkerNode(f)));
        } else {
          this.setFocus([this.findMarkerNode(selection[0])]);
        }
        this.reveal(this.findMarkerNode(selection[0]));
      } else if (this.getSelection().length === 0) {
        const firstVisibleElement = this.firstVisibleElement;
        const marker = firstVisibleElement ? firstVisibleElement instanceof ResourceMarkers ? firstVisibleElement.markers[0] : firstVisibleElement instanceof Marker ? firstVisibleElement : void 0 : void 0;
        if (marker) {
          this.setSelection([marker]);
          this.setFocus([marker]);
          this.reveal(marker);
        }
      }
    }
  }
  update(resourceMarkers) {
    for (const resourceMarker of resourceMarkers) {
      if (this.hasElement(resourceMarker)) {
        this.setChildren(resourceMarker, createResourceMarkersIterator(resourceMarker));
        this.rerender(resourceMarker);
      }
    }
  }
  updateMarker(marker) {
    this.rerender(marker);
  }
  findMarkerNode(marker) {
    for (const resourceNode of this.getNode().children) {
      for (const markerNode of resourceNode.children) {
        if (markerNode.element instanceof Marker && markerNode.element.marker === marker.marker) {
          return markerNode.element;
        }
      }
    }
    return null;
  }
  hasSelectedMarkerFor(resource) {
    const selectedElement = this.getSelection();
    if (selectedElement && selectedElement.length > 0) {
      if (selectedElement[0] instanceof Marker) {
        if (resource.has(selectedElement[0].marker.resource)) {
          return true;
        }
      }
    }
    return false;
  }
  dispose() {
    super.dispose();
  }
  layout(height, width) {
    this.container.style.height = `${height}px`;
    super.layout(height, width);
  }
};
MarkersTree = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IListService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IConfigurationService)
], MarkersTree);
let MarkersListDnDHandler = class extends ResourceListDnDHandler {
  constructor(instantiationService) {
    super((element) => {
      if (element instanceof MarkerTableItem) {
        return withSelection(element.resource, element.range);
      } else if (element instanceof ResourceMarkers) {
        return element.resource;
      } else if (element instanceof Marker) {
        return withSelection(element.resource, element.range);
      } else if (element instanceof RelatedInformation) {
        return withSelection(element.raw.resource, element.raw);
      }
      return null;
    }, instantiationService);
  }
  onWillDragElements(elements, originalEvent) {
    const data = elements.map((e) => {
      if (e instanceof RelatedInformation || e instanceof Marker) {
        return e.marker;
      }
      if (e instanceof ResourceMarkers) {
        return { uri: e.resource };
      }
      return void 0;
    }).filter(isDefined);
    if (!data.length) {
      return;
    }
    fillInMarkersDragData(data, originalEvent);
  }
};
MarkersListDnDHandler = __decorateClass([
  __decorateParam(0, IInstantiationService)
], MarkersListDnDHandler);
export {
  MarkersView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtlcnMvYnJvd3Nlci9tYXJrZXJzVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9tYXJrZXJzLmNzcyc7XG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50LCBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSVRhYmxlQ29udGV4dE1lbnVFdmVudCwgSVRhYmxlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdGFibGUvdGFibGUuanMnO1xuaW1wb3J0IHsgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBJVHJlZUVsZW1lbnQsIElUcmVlRXZlbnQsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBncm91cEJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBSZWxheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZGVlcENsb25lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBmaWxsSW5NYXJrZXJzRHJhZ0RhdGEsIE1hcmtlclRyYW5zZmVyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVzdWx0S2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIElPcGVuRXZlbnQsIElXb3JrYmVuY2hPYmplY3RUcmVlT3B0aW9ucywgV29ya2JlbmNoT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlLCB3aXRoU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2lkZ2V0TmF2aWdhdGlvbkNvbW1hbmRzLmpzJztcbmltcG9ydCB7IFJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvZGVlZGl0b3IuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMaXN0RG5ESGFuZGxlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgRmlsdGVyVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IE1lbWVudG8gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbWVtZW50by5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFya2VycywgTWFya2Vyc0NvbnRleHRLZXlzLCBNYXJrZXJzVmlld01vZGUgfSBmcm9tICcuLi9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBJTWFya2Vyc1ZpZXcgfSBmcm9tICcuL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgRmlsdGVyT3B0aW9ucyB9IGZyb20gJy4vbWFya2Vyc0ZpbHRlck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgY29tcGFyZU1hcmtlcnNCeVVyaSwgTWFya2VyLCBNYXJrZXJDaGFuZ2VzRXZlbnQsIE1hcmtlckVsZW1lbnQsIE1hcmtlcnNNb2RlbCwgTWFya2VyVGFibGVJdGVtLCBSZWxhdGVkSW5mb3JtYXRpb24sIFJlc291cmNlTWFya2VycyB9IGZyb20gJy4vbWFya2Vyc01vZGVsLmpzJztcbmltcG9ydCB7IE1hcmtlcnNUYWJsZSB9IGZyb20gJy4vbWFya2Vyc1RhYmxlLmpzJztcbmltcG9ydCB7IEZpbHRlciwgRmlsdGVyRGF0YSwgTWFya2VyUmVuZGVyZXIsIE1hcmtlcnNWaWV3TW9kZWwsIE1hcmtlcnNXaWRnZXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsIFJlbGF0ZWRJbmZvcm1hdGlvblJlbmRlcmVyLCBSZXNvdXJjZU1hcmtlcnNSZW5kZXJlciwgVmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi9tYXJrZXJzVHJlZVZpZXdlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Vyc0ZpbHRlcnNDaGFuZ2VFdmVudCwgTWFya2Vyc0ZpbHRlcnMgfSBmcm9tICcuL21hcmtlcnNWaWV3QWN0aW9ucy5qcyc7XG5pbXBvcnQgTWVzc2FnZXMgZnJvbSAnLi9tZXNzYWdlcy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZVJlc291cmNlTWFya2Vyc0l0ZXJhdG9yKHJlc291cmNlTWFya2VyczogUmVzb3VyY2VNYXJrZXJzKTogSXRlcmFibGU8SVRyZWVFbGVtZW50PE1hcmtlckVsZW1lbnQ+PiB7XG5cdHJldHVybiBJdGVyYWJsZS5tYXAocmVzb3VyY2VNYXJrZXJzLm1hcmtlcnMsIG0gPT4ge1xuXHRcdGNvbnN0IHJlbGF0ZWRJbmZvcm1hdGlvbkl0ID0gSXRlcmFibGUuZnJvbShtLnJlbGF0ZWRJbmZvcm1hdGlvbik7XG5cdFx0Y29uc3QgY2hpbGRyZW4gPSBJdGVyYWJsZS5tYXAocmVsYXRlZEluZm9ybWF0aW9uSXQsIHIgPT4gKHsgZWxlbWVudDogciB9KSk7XG5cblx0XHRyZXR1cm4geyBlbGVtZW50OiBtLCBjaGlsZHJlbiB9O1xuXHR9KTtcbn1cblxuaW50ZXJmYWNlIElNYXJrZXJzUGFuZWxTdGF0ZSB7XG5cdGZpbHRlcj86IHN0cmluZztcblx0ZmlsdGVySGlzdG9yeT86IHN0cmluZ1tdO1xuXHRzaG93RXJyb3JzPzogYm9vbGVhbjtcblx0c2hvd1dhcm5pbmdzPzogYm9vbGVhbjtcblx0c2hvd0luZm9zPzogYm9vbGVhbjtcblx0dXNlRmlsZXNFeGNsdWRlPzogYm9vbGVhbjtcblx0YWN0aXZlRmlsZT86IGJvb2xlYW47XG5cdG11bHRpbGluZT86IGJvb2xlYW47XG5cdHZpZXdNb2RlPzogTWFya2Vyc1ZpZXdNb2RlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQcm9ibGVtc1dpZGdldCB7XG5cdGdldCBjb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0Z2V0IG9uQ29udGV4dE1lbnUoKTogRXZlbnQ8SVRyZWVDb250ZXh0TWVudUV2ZW50PE1hcmtlckVsZW1lbnQgfCBudWxsPj4gfCBFdmVudDxJVGFibGVDb250ZXh0TWVudUV2ZW50PE1hcmtlclRhYmxlSXRlbT4+O1xuXHRnZXQgb25EaWRDaGFuZ2VGb2N1cygpOiBFdmVudDxJVHJlZUV2ZW50PE1hcmtlckVsZW1lbnQgfCBudWxsPj4gfCBFdmVudDxJVGFibGVFdmVudDxNYXJrZXJUYWJsZUl0ZW0+Pjtcblx0Z2V0IG9uRGlkQ2hhbmdlU2VsZWN0aW9uKCk6IEV2ZW50PElUcmVlRXZlbnQ8TWFya2VyRWxlbWVudCB8IG51bGw+PiB8IEV2ZW50PElUYWJsZUV2ZW50PE1hcmtlclRhYmxlSXRlbT4+O1xuXHRnZXQgb25EaWRPcGVuKCk6IEV2ZW50PElPcGVuRXZlbnQ8TWFya2VyRWxlbWVudCB8IE1hcmtlclRhYmxlSXRlbSB8IHVuZGVmaW5lZD4+O1xuXG5cdGNvbGxhcHNlTWFya2VycygpOiB2b2lkO1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG5cdGRvbUZvY3VzKCk6IHZvaWQ7XG5cdGZpbHRlck1hcmtlcnMocmVzb3VyY2VNYXJrZXJzOiBSZXNvdXJjZU1hcmtlcnNbXSwgZmlsdGVyT3B0aW9uczogRmlsdGVyT3B0aW9ucyk6IHZvaWQ7XG5cdGdldEZvY3VzKCk6IChNYXJrZXJFbGVtZW50IHwgTWFya2VyVGFibGVJdGVtIHwgbnVsbClbXTtcblx0Z2V0SFRNTEVsZW1lbnQoKTogSFRNTEVsZW1lbnQ7XG5cdGdldFJlbGF0aXZlVG9wKGxvY2F0aW9uOiBNYXJrZXJFbGVtZW50IHwgTWFya2VyVGFibGVJdGVtIHwgbnVsbCk6IG51bWJlciB8IG51bGw7XG5cdGdldFNlbGVjdGlvbigpOiAoTWFya2VyRWxlbWVudCB8IE1hcmtlclRhYmxlSXRlbSB8IG51bGwpW107XG5cdGdldFZpc2libGVJdGVtQ291bnQoKTogbnVtYmVyO1xuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkO1xuXHRyZXNldChyZXNvdXJjZU1hcmtlcnM6IFJlc291cmNlTWFya2Vyc1tdKTogdm9pZDtcblx0cmV2ZWFsTWFya2VycyhhY3RpdmVSZXNvdXJjZTogUmVzb3VyY2VNYXJrZXJzIHwgbnVsbCwgZm9jdXM6IGJvb2xlYW4sIGxhc3RTZWxlY3RlZFJlbGF0aXZlVG9wOiBudW1iZXIpOiB2b2lkO1xuXHRzZXRBcmlhTGFiZWwobGFiZWw6IHN0cmluZyk6IHZvaWQ7XG5cdHNldE1hcmtlclNlbGVjdGlvbihzZWxlY3Rpb24/OiBNYXJrZXJbXSwgZm9jdXM/OiBNYXJrZXJbXSk6IHZvaWQ7XG5cdHRvZ2dsZVZpc2liaWxpdHkoaGlkZTogYm9vbGVhbik6IHZvaWQ7XG5cdHVwZGF0ZShyZXNvdXJjZU1hcmtlcnM6IFJlc291cmNlTWFya2Vyc1tdKTogdm9pZDtcblx0dXBkYXRlTWFya2VyKG1hcmtlcjogTWFya2VyKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtlcnNWaWV3IGV4dGVuZHMgRmlsdGVyVmlld1BhbmUgaW1wbGVtZW50cyBJTWFya2Vyc1ZpZXcge1xuXG5cdHByaXZhdGUgbGFzdFNlbGVjdGVkUmVsYXRpdmVUb3A6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgY3VycmVudEFjdGl2ZVJlc291cmNlOiBVUkkgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnM6IFJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFya2Vyc01vZGVsOiBNYXJrZXJzTW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyOiBGaWx0ZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25WaXNpYmxlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgd2lkZ2V0ITogSVByb2JsZW1zV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSB3aWRnZXRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB3aWRnZXRJZGVudGl0eVByb3ZpZGVyOiBJSWRlbnRpdHlQcm92aWRlcjxNYXJrZXJFbGVtZW50IHwgTWFya2VyVGFibGVJdGVtPjtcblx0cHJpdmF0ZSB3aWRnZXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IE1hcmtlcnNXaWRnZXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXI7XG5cdHByaXZhdGUgbWVzc2FnZUJveENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXJpYUxhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGZpbHRlcnM6IE1hcmtlcnNGaWx0ZXJzO1xuXG5cdHByaXZhdGUgY3VycmVudEhlaWdodCA9IDA7XG5cdHByaXZhdGUgY3VycmVudFdpZHRoID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBtZW1lbnRvOiBNZW1lbnRvPElNYXJrZXJzUGFuZWxTdGF0ZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgcGFuZWxTdGF0ZTogSU1hcmtlcnNQYW5lbFN0YXRlO1xuXG5cdHByaXZhdGUgY2FjaGVkRmlsdGVyU3RhdHM6IHsgdG90YWw6IG51bWJlcjsgZmlsdGVyZWQ6IG51bWJlciB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY3VycmVudFJlc291cmNlR290QWRkZWRUb01hcmtlcnNEYXRhOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFya2Vyc1ZpZXdNb2RlbDogTWFya2Vyc1ZpZXdNb2RlbDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IG1lbWVudG8gPSBuZXcgTWVtZW50bzxJTWFya2Vyc1BhbmVsU3RhdGU+KE1hcmtlcnMuTUFSS0VSU19WSUVXX1NUT1JBR0VfSUQsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBwYW5lbFN0YXRlID0gbWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGZpbHRlck9wdGlvbnM6IHtcblx0XHRcdFx0YXJpYUxhYmVsOiBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX0ZJTFRFUl9BUklBX0xBQkVMLFxuXHRcdFx0XHRwbGFjZWhvbGRlcjogTWVzc2FnZXMuTUFSS0VSU19QQU5FTF9GSUxURVJfUExBQ0VIT0xERVIsXG5cdFx0XHRcdGZvY3VzQ29udGV4dEtleTogTWFya2Vyc0NvbnRleHRLZXlzLk1hcmtlclZpZXdGaWx0ZXJGb2N1c0NvbnRleHRLZXkua2V5LFxuXHRcdFx0XHR0ZXh0OiBwYW5lbFN0YXRlLmZpbHRlciB8fCAnJyxcblx0XHRcdFx0aGlzdG9yeTogcGFuZWxTdGF0ZS5maWx0ZXJIaXN0b3J5IHx8IFtdXG5cdFx0XHR9XG5cdFx0fSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0dGhpcy5tZW1lbnRvID0gbWVtZW50bztcblx0XHR0aGlzLnBhbmVsU3RhdGUgPSBwYW5lbFN0YXRlO1xuXG5cdFx0dGhpcy5tYXJrZXJzTW9kZWwgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXJzTW9kZWwpKTtcblx0XHR0aGlzLm1hcmtlcnNWaWV3TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXJzVmlld01vZGVsLCB0aGlzLnBhbmVsU3RhdGUubXVsdGlsaW5lLCB0aGlzLnBhbmVsU3RhdGUudmlld01vZGUgPz8gdGhpcy5nZXREZWZhdWx0Vmlld01vZGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VWaXNpYmlsaXR5KHZpc2libGUgPT4gdGhpcy5vbkRpZENoYW5nZU1hcmtlcnNWaWV3VmlzaWJpbGl0eSh2aXNpYmxlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5vbkRpZENoYW5nZVZpZXdNb2RlKF8gPT4gdGhpcy5vbkRpZENoYW5nZVZpZXdNb2RlKCkpKTtcblxuXHRcdHRoaXMud2lkZ2V0QWNjZXNzaWJpbGl0eVByb3ZpZGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2Vyc1dpZGdldEFjY2Vzc2liaWxpdHlQcm92aWRlcik7XG5cdFx0dGhpcy53aWRnZXRJZGVudGl0eVByb3ZpZGVyID0geyBnZXRJZChlbGVtZW50OiBNYXJrZXJFbGVtZW50IHwgTWFya2VyVGFibGVJdGVtKSB7IHJldHVybiBlbGVtZW50LmlkOyB9IH07XG5cblx0XHR0aGlzLnNldEN1cnJlbnRBY3RpdmVFZGl0b3IoKTtcblxuXHRcdHRoaXMuZmlsdGVyID0gbmV3IEZpbHRlcihGaWx0ZXJPcHRpb25zLkVNUFRZKHVyaUlkZW50aXR5U2VydmljZSkpO1xuXHRcdHRoaXMucmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucykpO1xuXG5cdFx0dGhpcy5maWx0ZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE1hcmtlcnNGaWx0ZXJzKHtcblx0XHRcdGZpbHRlckhpc3Rvcnk6IHRoaXMucGFuZWxTdGF0ZS5maWx0ZXJIaXN0b3J5IHx8IFtdLFxuXHRcdFx0c2hvd0Vycm9yczogdGhpcy5wYW5lbFN0YXRlLnNob3dFcnJvcnMgIT09IGZhbHNlLFxuXHRcdFx0c2hvd1dhcm5pbmdzOiB0aGlzLnBhbmVsU3RhdGUuc2hvd1dhcm5pbmdzICE9PSBmYWxzZSxcblx0XHRcdHNob3dJbmZvczogdGhpcy5wYW5lbFN0YXRlLnNob3dJbmZvcyAhPT0gZmFsc2UsXG5cdFx0XHRleGNsdWRlZEZpbGVzOiAhIXRoaXMucGFuZWxTdGF0ZS51c2VGaWxlc0V4Y2x1ZGUsXG5cdFx0XHRhY3RpdmVGaWxlOiAhIXRoaXMucGFuZWxTdGF0ZS5hY3RpdmVGaWxlLFxuXHRcdH0sIHRoaXMuY29udGV4dEtleVNlcnZpY2UpKTtcblxuXHRcdC8vIFVwZGF0ZSBmaWx0ZXIsIHdoZW5ldmVyIHRoZSBcImZpbGVzLmV4Y2x1ZGVcIiBzZXR0aW5nIGlzIGNoYW5nZWRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmICh0aGlzLmZpbHRlcnMuZXhjbHVkZWRGaWxlcyAmJiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdmaWxlcy5leGNsdWRlJykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGaWx0ZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoKTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJOYXZpZ2FibGVDb250YWluZXIoe1xuXHRcdFx0bmFtZTogJ21hcmtlcnNWaWV3Jyxcblx0XHRcdGZvY3VzTm90aWZpZXJzOiBbdGhpcywgdGhpcy5maWx0ZXJXaWRnZXRdLFxuXHRcdFx0Zm9jdXNOZXh0V2lkZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmZpbHRlcldpZGdldC5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXNQcmV2aW91c1dpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuZmlsdGVyV2lkZ2V0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzRmlsdGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShwYXJlbnQpO1xuXG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ21hcmtlcnMtcGFuZWwnKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudCwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmICghdGhpcy5rZXliaW5kaW5nU2VydmljZS5taWdodFByb2R1Y2VQcmludGFibGVDaGFyYWN0ZXIoZXZlbnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoKGV2ZW50LCBldmVudC50YXJnZXQpO1xuXHRcdFx0aWYgKHJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLk1vcmVDaG9yZHNOZWVkZWQgfHwgcmVzdWx0LmtpbmQgPT09IFJlc3VsdEtpbmQuS2JGb3VuZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmZvY3VzRmlsdGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcGFuZWxDb250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5tYXJrZXJzLXBhbmVsLWNvbnRhaW5lcicpKTtcblxuXHRcdHRoaXMuY3JlYXRlQXJpYWxMYWJlbEVsZW1lbnQocGFuZWxDb250YWluZXIpO1xuXG5cdFx0dGhpcy5jcmVhdGVNZXNzYWdlQm94KHBhbmVsQ29udGFpbmVyKTtcblxuXHRcdHRoaXMud2lkZ2V0Q29udGFpbmVyID0gZG9tLmFwcGVuZChwYW5lbENvbnRhaW5lciwgZG9tLiQoJy53aWRnZXQtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuY3JlYXRlV2lkZ2V0KHRoaXMud2lkZ2V0Q29udGFpbmVyKTtcblxuXHRcdHRoaXMudXBkYXRlRmlsdGVyKCk7XG5cdFx0dGhpcy5yZW5kZXJDb250ZW50KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VGl0bGUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gTWVzc2FnZXMuTUFSS0VSU19QQU5FTF9USVRMRV9QUk9CTEVNUy52YWx1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBsYXlvdXRCb2R5Q29udGVudChoZWlnaHQ6IG51bWJlciA9IHRoaXMuY3VycmVudEhlaWdodCwgd2lkdGg6IG51bWJlciA9IHRoaXMuY3VycmVudFdpZHRoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVzc2FnZUJveENvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5tZXNzYWdlQm94Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0fVxuXHRcdHRoaXMud2lkZ2V0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblxuXHRcdHRoaXMuY3VycmVudEhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLmN1cnJlbnRXaWR0aCA9IHdpZHRoO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0aWYgKGRvbS5pc0FjdGl2ZUVsZW1lbnQodGhpcy53aWRnZXQuZ2V0SFRNTEVsZW1lbnQoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5oYXNOb1Byb2JsZW1zKCkpIHtcblx0XHRcdHRoaXMubWVzc2FnZUJveENvbnRhaW5lciEuZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy53aWRnZXQuZG9tRm9jdXMoKTtcblx0XHRcdHRoaXMud2lkZ2V0LnNldE1hcmtlclNlbGVjdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmb2N1c0ZpbHRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmZpbHRlcldpZGdldC5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZUJhZGdlKHRvdGFsOiBudW1iZXIsIGZpbHRlcmVkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmZpbHRlcldpZGdldC51cGRhdGVCYWRnZSh0b3RhbCA9PT0gZmlsdGVyZWQgfHwgdG90YWwgPT09IDAgPyB1bmRlZmluZWQgOiBsb2NhbGl6ZSgnc2hvd2luZyBmaWx0ZXJlZCBwcm9ibGVtcycsIFwiU2hvd2luZyB7MH0gb2YgezF9XCIsIGZpbHRlcmVkLCB0b3RhbCkpO1xuXHR9XG5cblx0cHVibGljIGNoZWNrTW9yZUZpbHRlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQuY2hlY2tNb3JlRmlsdGVycyghdGhpcy5maWx0ZXJzLnNob3dFcnJvcnMgfHwgIXRoaXMuZmlsdGVycy5zaG93V2FybmluZ3MgfHwgIXRoaXMuZmlsdGVycy5zaG93SW5mb3MgfHwgdGhpcy5maWx0ZXJzLmV4Y2x1ZGVkRmlsZXMgfHwgdGhpcy5maWx0ZXJzLmFjdGl2ZUZpbGUpO1xuXHR9XG5cblx0cHVibGljIGNsZWFyRmlsdGVyVGV4dCgpOiB2b2lkIHtcblx0XHR0aGlzLmZpbHRlcldpZGdldC5zZXRGaWx0ZXJUZXh0KCcnKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93UXVpY2tGaXhlcyhtYXJrZXI6IE1hcmtlcik6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5nZXRWaWV3TW9kZWwobWFya2VyKTtcblx0XHRpZiAodmlld01vZGVsKSB7XG5cdFx0XHR2aWV3TW9kZWwucXVpY2tGaXhBY3Rpb24ucnVuKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG9wZW5GaWxlQXRFbGVtZW50KGVsZW1lbnQ6IGFueSwgcHJlc2VydmVGb2N1czogYm9vbGVhbiwgc2lkZUJ5c2lkZTogYm9vbGVhbiwgcGlubmVkOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgeyByZXNvdXJjZSwgc2VsZWN0aW9uIH0gPSBlbGVtZW50IGluc3RhbmNlb2YgTWFya2VyID8geyByZXNvdXJjZTogZWxlbWVudC5yZXNvdXJjZSwgc2VsZWN0aW9uOiBlbGVtZW50LnJhbmdlIH0gOlxuXHRcdFx0ZWxlbWVudCBpbnN0YW5jZW9mIFJlbGF0ZWRJbmZvcm1hdGlvbiA/IHsgcmVzb3VyY2U6IGVsZW1lbnQucmF3LnJlc291cmNlLCBzZWxlY3Rpb246IGVsZW1lbnQucmF3IH0gOlxuXHRcdFx0XHQnbWFya2VyJyBpbiBlbGVtZW50ID8geyByZXNvdXJjZTogZWxlbWVudC5tYXJrZXIucmVzb3VyY2UsIHNlbGVjdGlvbjogZWxlbWVudC5tYXJrZXIucmFuZ2UgfSA6XG5cdFx0XHRcdFx0eyByZXNvdXJjZTogbnVsbCwgc2VsZWN0aW9uOiBudWxsIH07XG5cdFx0aWYgKHJlc291cmNlICYmIHNlbGVjdGlvbikge1xuXHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0XHRcdHBpbm5lZCxcblx0XHRcdFx0XHRyZXZlYWxJZlZpc2libGU6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdH0sIHNpZGVCeXNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQKS50aGVuKGVkaXRvciA9PiB7XG5cdFx0XHRcdGlmIChlZGl0b3IgJiYgcHJlc2VydmVGb2N1cykge1xuXHRcdFx0XHRcdHRoaXMucmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucy5oaWdobGlnaHRSYW5nZSh7IHJlc291cmNlLCByYW5nZTogc2VsZWN0aW9uIH0sIDxJQ29kZUVkaXRvcj5lZGl0b3IuZ2V0Q29udHJvbCgpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnMucmVtb3ZlSGlnaGxpZ2h0UmFuZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yYW5nZUhpZ2hsaWdodERlY29yYXRpb25zLnJlbW92ZUhpZ2hsaWdodFJhbmdlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaFBhbmVsKG1hcmtlck9yQ2hhbmdlPzogTWFya2VyIHwgTWFya2VyQ2hhbmdlc0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdGNvbnN0IGhhc1NlbGVjdGlvbiA9IHRoaXMud2lkZ2V0LmdldFNlbGVjdGlvbigpLmxlbmd0aCA+IDA7XG5cblx0XHRcdGlmIChtYXJrZXJPckNoYW5nZSkge1xuXHRcdFx0XHRpZiAobWFya2VyT3JDaGFuZ2UgaW5zdGFuY2VvZiBNYXJrZXIpIHtcblx0XHRcdFx0XHR0aGlzLndpZGdldC51cGRhdGVNYXJrZXIobWFya2VyT3JDaGFuZ2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChtYXJrZXJPckNoYW5nZS5hZGRlZC5zaXplIHx8IG1hcmtlck9yQ2hhbmdlLnJlbW92ZWQuc2l6ZSB8fCB0aGlzLmZpbHRlcnMuYWN0aXZlRmlsZSkge1xuXHRcdFx0XHRcdFx0Ly8gUmVzZXQgY29tcGxldGUgd2lkZ2V0XG5cdFx0XHRcdFx0XHR0aGlzLnJlc2V0V2lkZ2V0KCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFVwZGF0ZSByZXNvdXJjZVxuXHRcdFx0XHRcdFx0dGhpcy53aWRnZXQudXBkYXRlKFsuLi5tYXJrZXJPckNoYW5nZS51cGRhdGVkXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBSZXNldCBjb21wbGV0ZSB3aWRnZXRcblx0XHRcdFx0dGhpcy5yZXNldFdpZGdldCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFzU2VsZWN0aW9uKSB7XG5cdFx0XHRcdHRoaXMud2lkZ2V0LnNldE1hcmtlclNlbGVjdGlvbigpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNhY2hlZEZpbHRlclN0YXRzID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgeyB0b3RhbCwgZmlsdGVyZWQgfSA9IHRoaXMuZ2V0RmlsdGVyU3RhdHMoKTtcblx0XHRcdHRoaXMudG9nZ2xlVmlzaWJpbGl0eSh0b3RhbCA9PT0gMCB8fCBmaWx0ZXJlZCA9PT0gMCk7XG5cdFx0XHR0aGlzLnJlbmRlck1lc3NhZ2UoKTtcblxuXHRcdFx0dGhpcy51cGRhdGVCYWRnZSh0b3RhbCwgZmlsdGVyZWQpO1xuXHRcdFx0dGhpcy5jaGVja01vcmVGaWx0ZXJzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVZpZXdTdGF0ZShtYXJrZXI/OiBNYXJrZXIpOiB2b2lkIHtcblx0XHR0aGlzLnJlZnJlc2hQYW5lbChtYXJrZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldFdpZGdldCgpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC5yZXNldCh0aGlzLmdldFJlc291cmNlTWFya2VycygpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRmlsdGVyKCkge1xuXHRcdHRoaXMuZmlsdGVyLm9wdGlvbnMgPSBuZXcgRmlsdGVyT3B0aW9ucyh0aGlzLmZpbHRlcldpZGdldC5nZXRGaWx0ZXJUZXh0KCksIHRoaXMuZ2V0RmlsZXNFeGNsdWRlRXhwcmVzc2lvbnMoKSwgdGhpcy5maWx0ZXJzLnNob3dXYXJuaW5ncywgdGhpcy5maWx0ZXJzLnNob3dFcnJvcnMsIHRoaXMuZmlsdGVycy5zaG93SW5mb3MsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHR0aGlzLndpZGdldC5maWx0ZXJNYXJrZXJzKHRoaXMuZ2V0UmVzb3VyY2VNYXJrZXJzKCksIHRoaXMuZmlsdGVyLm9wdGlvbnMpO1xuXG5cdFx0dGhpcy5jYWNoZWRGaWx0ZXJTdGF0cyA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCB7IHRvdGFsLCBmaWx0ZXJlZCB9ID0gdGhpcy5nZXRGaWx0ZXJTdGF0cygpO1xuXHRcdHRoaXMudG9nZ2xlVmlzaWJpbGl0eSh0b3RhbCA9PT0gMCB8fCBmaWx0ZXJlZCA9PT0gMCk7XG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUJhZGdlKHRvdGFsLCBmaWx0ZXJlZCk7XG5cdFx0dGhpcy5jaGVja01vcmVGaWx0ZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlZmF1bHRWaWV3TW9kZSgpOiBNYXJrZXJzVmlld01vZGUge1xuXHRcdHN3aXRjaCAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdwcm9ibGVtcy5kZWZhdWx0Vmlld01vZGUnKSkge1xuXHRcdFx0Y2FzZSAndGFibGUnOlxuXHRcdFx0XHRyZXR1cm4gTWFya2Vyc1ZpZXdNb2RlLlRhYmxlO1xuXHRcdFx0Y2FzZSAndHJlZSc6XG5cdFx0XHRcdHJldHVybiBNYXJrZXJzVmlld01vZGUuVHJlZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBNYXJrZXJzVmlld01vZGUuVHJlZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEZpbGVzRXhjbHVkZUV4cHJlc3Npb25zKCk6IHsgcm9vdDogVVJJOyBleHByZXNzaW9uOiBJRXhwcmVzc2lvbiB9W10gfCBJRXhwcmVzc2lvbiB7XG5cdFx0aWYgKCF0aGlzLmZpbHRlcnMuZXhjbHVkZWRGaWxlcykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0cmV0dXJuIHdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoXG5cdFx0XHQ/IHdvcmtzcGFjZUZvbGRlcnMubWFwKHdvcmtzcGFjZUZvbGRlciA9PiAoeyByb290OiB3b3Jrc3BhY2VGb2xkZXIudXJpLCBleHByZXNzaW9uOiB0aGlzLmdldEZpbGVzRXhjbHVkZSh3b3Jrc3BhY2VGb2xkZXIudXJpKSB9KSlcblx0XHRcdDogdGhpcy5nZXRGaWxlc0V4Y2x1ZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RmlsZXNFeGNsdWRlKHJlc291cmNlPzogVVJJKTogSUV4cHJlc3Npb24ge1xuXHRcdHJldHVybiBkZWVwQ2xvbmUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZmlsZXMuZXhjbHVkZScsIHsgcmVzb3VyY2UgfSkpIHx8IHt9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXNvdXJjZU1hcmtlcnMoKTogUmVzb3VyY2VNYXJrZXJzW10ge1xuXHRcdGlmICghdGhpcy5maWx0ZXJzLmFjdGl2ZUZpbGUpIHtcblx0XHRcdHJldHVybiB0aGlzLm1hcmtlcnNNb2RlbC5yZXNvdXJjZU1hcmtlcnM7XG5cdFx0fVxuXG5cdFx0bGV0IHJlc291cmNlTWFya2VyczogUmVzb3VyY2VNYXJrZXJzW10gPSBbXTtcblx0XHRpZiAodGhpcy5jdXJyZW50QWN0aXZlUmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVJlc291cmNlTWFya2VycyA9IHRoaXMubWFya2Vyc01vZGVsLmdldFJlc291cmNlTWFya2Vycyh0aGlzLmN1cnJlbnRBY3RpdmVSZXNvdXJjZSk7XG5cdFx0XHRpZiAoYWN0aXZlUmVzb3VyY2VNYXJrZXJzKSB7XG5cdFx0XHRcdHJlc291cmNlTWFya2VycyA9IFthY3RpdmVSZXNvdXJjZU1hcmtlcnNdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXNvdXJjZU1hcmtlcnM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1lc3NhZ2VCb3gocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMubWVzc2FnZUJveENvbnRhaW5lciA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLm1lc3NhZ2UtYm94LWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsbGVkYnknLCAnbWFya2Vycy1wYW5lbC1hcmlhbGFiZWwnKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQXJpYWxMYWJlbEVsZW1lbnQocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudCA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnJykpO1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2lkJywgJ21hcmtlcnMtcGFuZWwtYXJpYWxhYmVsJyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVdpZGdldChwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQgPSB0aGlzLm1hcmtlcnNWaWV3TW9kZWwudmlld01vZGUgPT09IE1hcmtlcnNWaWV3TW9kZS5UYWJsZSA/IHRoaXMuY3JlYXRlVGFibGUocGFyZW50KSA6IHRoaXMuY3JlYXRlVHJlZShwYXJlbnQpO1xuXHRcdHRoaXMud2lkZ2V0RGlzcG9zYWJsZXMuYWRkKHRoaXMud2lkZ2V0KTtcblxuXHRcdGNvbnN0IG1hcmtlckZvY3VzQ29udGV4dEtleSA9IE1hcmtlcnNDb250ZXh0S2V5cy5NYXJrZXJGb2N1c0NvbnRleHRLZXkuYmluZFRvKHRoaXMud2lkZ2V0LmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCByZWxhdGVkSW5mb3JtYXRpb25Gb2N1c0NvbnRleHRLZXkgPSBNYXJrZXJzQ29udGV4dEtleXMuUmVsYXRlZEluZm9ybWF0aW9uRm9jdXNDb250ZXh0S2V5LmJpbmRUbyh0aGlzLndpZGdldC5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy53aWRnZXREaXNwb3NhYmxlcy5hZGQodGhpcy53aWRnZXQub25EaWRDaGFuZ2VGb2N1cyhmb2N1cyA9PiB7XG5cdFx0XHRtYXJrZXJGb2N1c0NvbnRleHRLZXkuc2V0KGZvY3VzLmVsZW1lbnRzLnNvbWUoZSA9PiBlIGluc3RhbmNlb2YgTWFya2VyKSk7XG5cdFx0XHRyZWxhdGVkSW5mb3JtYXRpb25Gb2N1c0NvbnRleHRLZXkuc2V0KGZvY3VzLmVsZW1lbnRzLnNvbWUoZSA9PiBlIGluc3RhbmNlb2YgUmVsYXRlZEluZm9ybWF0aW9uKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy53aWRnZXREaXNwb3NhYmxlcy5hZGQoRXZlbnQuZGVib3VuY2UodGhpcy53aWRnZXQub25EaWRPcGVuLCAobGFzdCwgZXZlbnQpID0+IGV2ZW50LCA3NSwgdHJ1ZSkob3B0aW9ucyA9PiB7XG5cdFx0XHR0aGlzLm9wZW5GaWxlQXRFbGVtZW50KG9wdGlvbnMuZWxlbWVudCwgISFvcHRpb25zLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cywgb3B0aW9ucy5zaWRlQnlTaWRlLCAhIW9wdGlvbnMuZWRpdG9yT3B0aW9ucy5waW5uZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMud2lkZ2V0RGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueTxhbnk+KHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uLCB0aGlzLndpZGdldC5vbkRpZENoYW5nZUZvY3VzKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50cyA9IFsuLi50aGlzLndpZGdldC5nZXRTZWxlY3Rpb24oKSwgLi4udGhpcy53aWRnZXQuZ2V0Rm9jdXMoKV07XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMpIHtcblx0XHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBNYXJrZXIpIHtcblx0XHRcdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLm1hcmtlcnNWaWV3TW9kZWwuZ2V0Vmlld01vZGVsKGVsZW1lbnQpO1xuXHRcdFx0XHRcdHZpZXdNb2RlbD8uc2hvd0xpZ2h0QnVsYigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy53aWRnZXREaXNwb3NhYmxlcy5hZGQodGhpcy53aWRnZXQub25Db250ZXh0TWVudSh0aGlzLm9uQ29udGV4dE1lbnUsIHRoaXMpKTtcblx0XHR0aGlzLndpZGdldERpc3Bvc2FibGVzLmFkZCh0aGlzLndpZGdldC5vbkRpZENoYW5nZVNlbGVjdGlvbih0aGlzLm9uU2VsZWN0ZWQsIHRoaXMpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVGFibGUocGFyZW50OiBIVE1MRWxlbWVudCk6IElQcm9ibGVtc1dpZGdldCB7XG5cdFx0Y29uc3QgdGFibGUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtlcnNUYWJsZSxcblx0XHRcdGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLm1hcmtlcnMtdGFibGUtY29udGFpbmVyJykpLFxuXHRcdFx0dGhpcy5tYXJrZXJzVmlld01vZGVsLFxuXHRcdFx0dGhpcy5nZXRSZXNvdXJjZU1hcmtlcnMoKSxcblx0XHRcdHRoaXMuZmlsdGVyLm9wdGlvbnMsXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogdGhpcy53aWRnZXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHRcdGRuZDogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxpc3REbkRIYW5kbGVyLCAoZWxlbWVudCkgPT4ge1xuXHRcdFx0XHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgTWFya2VyVGFibGVJdGVtKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gd2l0aFNlbGVjdGlvbihlbGVtZW50LnJlc291cmNlLCBlbGVtZW50LnJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogdGhpcy53aWRnZXRJZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdHNlbGVjdGlvbk5hdmlnYXRpb246IHRydWVcblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdHJldHVybiB0YWJsZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVHJlZShwYXJlbnQ6IEhUTUxFbGVtZW50KTogSVByb2JsZW1zV2lkZ2V0IHtcblx0XHRjb25zdCBvbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudCA9IG5ldyBSZWxheTxJVHJlZU5vZGU8YW55LCBhbnk+PigpO1xuXG5cdFx0Y29uc3QgdHJlZUxhYmVscyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHRoaXMpO1xuXG5cdFx0Y29uc3QgdmlydHVhbERlbGVnYXRlID0gbmV3IFZpcnR1YWxEZWxlZ2F0ZSh0aGlzLm1hcmtlcnNWaWV3TW9kZWwpO1xuXHRcdGNvbnN0IHJlbmRlcmVycyA9IFtcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VNYXJrZXJzUmVuZGVyZXIsIHRyZWVMYWJlbHMsIG9uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50LmV2ZW50KSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2VyUmVuZGVyZXIsIHRoaXMubWFya2Vyc1ZpZXdNb2RlbCksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbGF0ZWRJbmZvcm1hdGlvblJlbmRlcmVyKVxuXHRcdF07XG5cblx0XHRjb25zdCB0cmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXJzVHJlZSxcblx0XHRcdCdNYXJrZXJzVmlldycsXG5cdFx0XHRkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy50cmVlLWNvbnRhaW5lci5zaG93LWZpbGUtaWNvbnMnKSksXG5cdFx0XHR2aXJ0dWFsRGVsZWdhdGUsXG5cdFx0XHRyZW5kZXJlcnMsXG5cdFx0XHR7XG5cdFx0XHRcdGZpbHRlcjogdGhpcy5maWx0ZXIsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogdGhpcy53aWRnZXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHRoaXMud2lkZ2V0SWRlbnRpdHlQcm92aWRlcixcblx0XHRcdFx0ZG5kOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtlcnNMaXN0RG5ESGFuZGxlciksXG5cdFx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogKGU6IE1hcmtlckVsZW1lbnQpID0+IGUgaW5zdGFuY2VvZiBNYXJrZXIgJiYgZS5yZWxhdGVkSW5mb3JtYXRpb24ubGVuZ3RoID4gMCxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMuZ2V0TG9jYXRpb25CYXNlZENvbG9ycygpLmxpc3RPdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0c2VsZWN0aW9uTmF2aWdhdGlvbjogdHJ1ZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiB0cnVlLFxuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0b25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQuaW5wdXQgPSB0cmVlLm9uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50O1xuXG5cdFx0cmV0dXJuIHRyZWU7XG5cdH1cblxuXHRjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC5jb2xsYXBzZU1hcmtlcnMoKTtcblx0fVxuXG5cdHNldE11bHRpbGluZShtdWx0aWxpbmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLm1hcmtlcnNWaWV3TW9kZWwubXVsdGlsaW5lID0gbXVsdGlsaW5lO1xuXHR9XG5cblx0c2V0Vmlld01vZGUodmlld01vZGU6IE1hcmtlcnNWaWV3TW9kZSk6IHZvaWQge1xuXHRcdHRoaXMubWFya2Vyc1ZpZXdNb2RlbC52aWV3TW9kZSA9IHZpZXdNb2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZU1hcmtlcnNWaWV3VmlzaWJpbGl0eSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5vblZpc2libGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRpc3Bvc2FibGUgb2YgdGhpcy5yZUluaXRpYWxpemUoKSkge1xuXHRcdFx0XHR0aGlzLm9uVmlzaWJsZURpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMucmVmcmVzaFBhbmVsKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZUluaXRpYWxpemUoKTogSURpc3Bvc2FibGVbXSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBbXTtcblxuXHRcdC8vIE1hcmtlcnMgTW9kZWxcblx0XHRjb25zdCByZWFkTWFya2VycyA9IChyZXNvdXJjZT86IFVSSSkgPT4gdGhpcy5tYXJrZXJTZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSwgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuRXJyb3IgfCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nIHwgTWFya2VyU2V2ZXJpdHkuSW5mbyB9KTtcblx0XHR0aGlzLm1hcmtlcnNNb2RlbC5zZXRSZXNvdXJjZU1hcmtlcnMoZ3JvdXBCeShyZWFkTWFya2VycygpLCBjb21wYXJlTWFya2Vyc0J5VXJpKS5tYXAoZ3JvdXAgPT4gW2dyb3VwWzBdLnJlc291cmNlLCBncm91cF0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKEV2ZW50LmRlYm91bmNlPHJlYWRvbmx5IFVSSVtdLCBSZXNvdXJjZU1hcDxVUkk+Pih0aGlzLm1hcmtlclNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkLCAocmVzb3VyY2VzTWFwLCByZXNvdXJjZXMpID0+IHtcblx0XHRcdHJlc291cmNlc01hcCA9IHJlc291cmNlc01hcCB8fCBuZXcgUmVzb3VyY2VNYXA8VVJJPigpO1xuXHRcdFx0cmVzb3VyY2VzLmZvckVhY2gocmVzb3VyY2UgPT4gcmVzb3VyY2VzTWFwLnNldChyZXNvdXJjZSwgcmVzb3VyY2UpKTtcblx0XHRcdHJldHVybiByZXNvdXJjZXNNYXA7XG5cdFx0fSwgNjQpKHJlc291cmNlc01hcCA9PiB7XG5cdFx0XHR0aGlzLm1hcmtlcnNNb2RlbC5zZXRSZXNvdXJjZU1hcmtlcnMoWy4uLnJlc291cmNlc01hcC52YWx1ZXMoKV0ubWFwKHJlc291cmNlID0+IFtyZXNvdXJjZSwgcmVhZE1hcmtlcnMocmVzb3VyY2UpXSkpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKEV2ZW50LmFueTxNYXJrZXJDaGFuZ2VzRXZlbnQgfCB2b2lkPih0aGlzLm1hcmtlcnNNb2RlbC5vbkRpZENoYW5nZSwgdGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKShjaGFuZ2VzID0+IHtcblx0XHRcdGlmIChjaGFuZ2VzKSB7XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VNb2RlbChjaGFuZ2VzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMub25BY3RpdmVFZGl0b3JDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2godG9EaXNwb3NhYmxlKCgpID0+IHRoaXMubWFya2Vyc01vZGVsLnJlc2V0KCkpKTtcblxuXHRcdC8vIE1hcmtlcnMgVmlldyBNb2RlbFxuXHRcdHRoaXMubWFya2Vyc01vZGVsLnJlc291cmNlTWFya2Vycy5mb3JFYWNoKHJlc291cmNlTWFya2VyID0+IHJlc291cmNlTWFya2VyLm1hcmtlcnMuZm9yRWFjaChtYXJrZXIgPT4gdGhpcy5tYXJrZXJzVmlld01vZGVsLmFkZChtYXJrZXIpKSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaCh0aGlzLm1hcmtlcnNWaWV3TW9kZWwub25EaWRDaGFuZ2UobWFya2VyID0+IHRoaXMub25EaWRDaGFuZ2VWaWV3U3RhdGUobWFya2VyKSkpO1xuXHRcdGRpc3Bvc2FibGVzLnB1c2godG9EaXNwb3NhYmxlKCgpID0+IHRoaXMubWFya2Vyc01vZGVsLnJlc291cmNlTWFya2Vycy5mb3JFYWNoKHJlc291cmNlTWFya2VyID0+IHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5yZW1vdmUocmVzb3VyY2VNYXJrZXIucmVzb3VyY2UpKSkpO1xuXG5cdFx0Ly8gTWFya2VycyBGaWx0ZXJzXG5cdFx0ZGlzcG9zYWJsZXMucHVzaCh0aGlzLmZpbHRlcnMub25EaWRDaGFuZ2UoKGV2ZW50OiBJTWFya2Vyc0ZpbHRlcnNDaGFuZ2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LmFjdGl2ZUZpbGUpIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoUGFuZWwoKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXhjbHVkZWRGaWxlcyB8fCBldmVudC5zaG93V2FybmluZ3MgfHwgZXZlbnQuc2hvd0Vycm9ycyB8fCBldmVudC5zaG93SW5mb3MpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVGaWx0ZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaCh0aGlzLmZpbHRlcldpZGdldC5vbkRpZENoYW5nZUZpbHRlclRleHQoZSA9PiB0aGlzLnVwZGF0ZUZpbHRlcigpKSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaCh0b0Rpc3Bvc2FibGUoKCkgPT4geyB0aGlzLmNhY2hlZEZpbHRlclN0YXRzID0gdW5kZWZpbmVkOyB9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5wdXNoKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnMucmVtb3ZlSGlnaGxpZ2h0UmFuZ2UoKSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZU1vZGVsKGNoYW5nZTogTWFya2VyQ2hhbmdlc0V2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VNYXJrZXJzID0gWy4uLmNoYW5nZS5hZGRlZCwgLi4uY2hhbmdlLnJlbW92ZWQsIC4uLmNoYW5nZS51cGRhdGVkXTtcblx0XHRjb25zdCByZXNvdXJjZXM6IFVSSVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB7IHJlc291cmNlIH0gb2YgcmVzb3VyY2VNYXJrZXJzKSB7XG5cdFx0XHR0aGlzLm1hcmtlcnNWaWV3TW9kZWwucmVtb3ZlKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IHJlc291cmNlTWFya2VycyA9IHRoaXMubWFya2Vyc01vZGVsLmdldFJlc291cmNlTWFya2VycyhyZXNvdXJjZSk7XG5cdFx0XHRpZiAocmVzb3VyY2VNYXJrZXJzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgbWFya2VyIG9mIHJlc291cmNlTWFya2Vycy5tYXJrZXJzKSB7XG5cdFx0XHRcdFx0dGhpcy5tYXJrZXJzVmlld01vZGVsLmFkZChtYXJrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXNvdXJjZXMucHVzaChyZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHRoaXMuY3VycmVudFJlc291cmNlR290QWRkZWRUb01hcmtlcnNEYXRhID0gdGhpcy5jdXJyZW50UmVzb3VyY2VHb3RBZGRlZFRvTWFya2Vyc0RhdGEgfHwgdGhpcy5pc0N1cnJlbnRSZXNvdXJjZUdvdEFkZGVkVG9NYXJrZXJzRGF0YShyZXNvdXJjZXMpO1xuXHRcdHRoaXMucmVmcmVzaFBhbmVsKGNoYW5nZSk7XG5cdFx0dGhpcy51cGRhdGVSYW5nZUhpZ2hsaWdodHMoKTtcblx0XHRpZiAodGhpcy5jdXJyZW50UmVzb3VyY2VHb3RBZGRlZFRvTWFya2Vyc0RhdGEpIHtcblx0XHRcdHRoaXMuYXV0b1JldmVhbCgpO1xuXHRcdFx0dGhpcy5jdXJyZW50UmVzb3VyY2VHb3RBZGRlZFRvTWFya2Vyc0RhdGEgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVmlld01vZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud2lkZ2V0Q29udGFpbmVyICYmIHRoaXMud2lkZ2V0KSB7XG5cdFx0XHR0aGlzLndpZGdldENvbnRhaW5lci50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0dGhpcy53aWRnZXREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH1cblxuXHRcdC8vIFNhdmUgc2VsZWN0aW9uXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbmV3IFNldDxNYXJrZXI+KCk7XG5cdFx0Zm9yIChjb25zdCBtYXJrZXIgb2YgdGhpcy53aWRnZXQuZ2V0U2VsZWN0aW9uKCkpIHtcblx0XHRcdGlmIChtYXJrZXIgaW5zdGFuY2VvZiBSZXNvdXJjZU1hcmtlcnMpIHtcblx0XHRcdFx0bWFya2VyLm1hcmtlcnMuZm9yRWFjaChtID0+IHNlbGVjdGlvbi5hZGQobSkpO1xuXHRcdFx0fSBlbHNlIGlmIChtYXJrZXIgaW5zdGFuY2VvZiBNYXJrZXIgfHwgbWFya2VyIGluc3RhbmNlb2YgTWFya2VyVGFibGVJdGVtKSB7XG5cdFx0XHRcdHNlbGVjdGlvbi5hZGQobWFya2VyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTYXZlIGZvY3VzXG5cdFx0Y29uc3QgZm9jdXMgPSBuZXcgU2V0PE1hcmtlcj4oKTtcblx0XHRmb3IgKGNvbnN0IG1hcmtlciBvZiB0aGlzLndpZGdldC5nZXRGb2N1cygpKSB7XG5cdFx0XHRpZiAobWFya2VyIGluc3RhbmNlb2YgTWFya2VyIHx8IG1hcmtlciBpbnN0YW5jZW9mIE1hcmtlclRhYmxlSXRlbSkge1xuXHRcdFx0XHRmb2N1cy5hZGQobWFya2VyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgbmV3IHdpZGdldFxuXHRcdHRoaXMuY3JlYXRlV2lkZ2V0KHRoaXMud2lkZ2V0Q29udGFpbmVyKTtcblx0XHR0aGlzLnJlZnJlc2hQYW5lbCgpO1xuXG5cdFx0Ly8gUmVzdG9yZSBzZWxlY3Rpb25cblx0XHRpZiAoc2VsZWN0aW9uLnNpemUgPiAwKSB7XG5cdFx0XHR0aGlzLndpZGdldC5zZXRNYXJrZXJTZWxlY3Rpb24oQXJyYXkuZnJvbShzZWxlY3Rpb24pLCBBcnJheS5mcm9tKGZvY3VzKSk7XG5cdFx0XHR0aGlzLndpZGdldC5kb21Gb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNDdXJyZW50UmVzb3VyY2VHb3RBZGRlZFRvTWFya2Vyc0RhdGEoY2hhbmdlZFJlc291cmNlczogVVJJW10pIHtcblx0XHRjb25zdCBjdXJyZW50bHlBY3RpdmVSZXNvdXJjZSA9IHRoaXMuY3VycmVudEFjdGl2ZVJlc291cmNlO1xuXHRcdGlmICghY3VycmVudGx5QWN0aXZlUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2VGb3JDdXJyZW50QWN0aXZlUmVzb3VyY2UgPSB0aGlzLmdldFJlc291cmNlRm9yQ3VycmVudEFjdGl2ZVJlc291cmNlKCk7XG5cdFx0aWYgKHJlc291cmNlRm9yQ3VycmVudEFjdGl2ZVJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBjaGFuZ2VkUmVzb3VyY2VzLnNvbWUociA9PiByLnRvU3RyaW5nKCkgPT09IGN1cnJlbnRseUFjdGl2ZVJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkFjdGl2ZUVkaXRvckNoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRDdXJyZW50QWN0aXZlRWRpdG9yKCk7XG5cdFx0aWYgKHRoaXMuZmlsdGVycy5hY3RpdmVGaWxlKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hQYW5lbCgpO1xuXHRcdH1cblx0XHR0aGlzLmF1dG9SZXZlYWwoKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Q3VycmVudEFjdGl2ZUVkaXRvcigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdHRoaXMuY3VycmVudEFjdGl2ZVJlc291cmNlID0gYWN0aXZlRWRpdG9yID8gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShhY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KSA/PyBudWxsIDogbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgb25TZWxlY3RlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLndpZGdldC5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxhc3RTZWxlY3RlZFJlbGF0aXZlVG9wID0gdGhpcy53aWRnZXQuZ2V0UmVsYXRpdmVUb3Aoc2VsZWN0aW9uWzBdKSB8fCAwO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFzTm9Qcm9ibGVtcygpOiBib29sZWFuIHtcblx0XHRjb25zdCB7IHRvdGFsLCBmaWx0ZXJlZCB9ID0gdGhpcy5nZXRGaWx0ZXJTdGF0cygpO1xuXHRcdHJldHVybiB0b3RhbCA9PT0gMCB8fCBmaWx0ZXJlZCA9PT0gMDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29udGVudCgpOiB2b2lkIHtcblx0XHR0aGlzLmNhY2hlZEZpbHRlclN0YXRzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMucmVzZXRXaWRnZXQoKTtcblx0XHR0aGlzLnRvZ2dsZVZpc2liaWxpdHkodGhpcy5oYXNOb1Byb2JsZW1zKCkpO1xuXHRcdHRoaXMucmVuZGVyTWVzc2FnZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNZXNzYWdlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tZXNzYWdlQm94Q29udGFpbmVyIHx8ICF0aGlzLmFyaWFMYWJlbEVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIpO1xuXHRcdGNvbnN0IHsgdG90YWwsIGZpbHRlcmVkIH0gPSB0aGlzLmdldEZpbHRlclN0YXRzKCk7XG5cblx0XHRpZiAoZmlsdGVyZWQgPT09IDApIHtcblx0XHRcdHRoaXMubWVzc2FnZUJveENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHRcdHRoaXMubWVzc2FnZUJveENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3RhYkluZGV4JywgJzAnKTtcblx0XHRcdGlmICh0aGlzLmZpbHRlcnMuYWN0aXZlRmlsZSkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckZpbHRlck1lc3NhZ2VGb3JBY3RpdmVGaWxlKHRoaXMubWVzc2FnZUJveENvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodG90YWwgPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJGaWx0ZXJlZEJ5RmlsdGVyTWVzc2FnZSh0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyTm9Qcm9ibGVtc01lc3NhZ2UodGhpcy5tZXNzYWdlQm94Q29udGFpbmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdGlmIChmaWx0ZXJlZCA9PT0gdG90YWwpIHtcblx0XHRcdFx0dGhpcy5zZXRBcmlhTGFiZWwobG9jYWxpemUoJ05vIHByb2JsZW1zIGZpbHRlcmVkJywgXCJTaG93aW5nIHswfSBwcm9ibGVtc1wiLCB0b3RhbCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZXRBcmlhTGFiZWwobG9jYWxpemUoJ3Byb2JsZW1zIGZpbHRlcmVkJywgXCJTaG93aW5nIHswfSBvZiB7MX0gcHJvYmxlbXNcIiwgZmlsdGVyZWQsIHRvdGFsKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm1lc3NhZ2VCb3hDb250YWluZXIucmVtb3ZlQXR0cmlidXRlKCd0YWJJbmRleCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRmlsdGVyTWVzc2FnZUZvckFjdGl2ZUZpbGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRBY3RpdmVSZXNvdXJjZSAmJiB0aGlzLm1hcmtlcnNNb2RlbC5nZXRSZXNvdXJjZU1hcmtlcnModGhpcy5jdXJyZW50QWN0aXZlUmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLnJlbmRlckZpbHRlcmVkQnlGaWx0ZXJNZXNzYWdlKGNvbnRhaW5lcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVuZGVyTm9Qcm9ibGVtc01lc3NhZ2VGb3JBY3RpdmVGaWxlKGNvbnRhaW5lcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJGaWx0ZXJlZEJ5RmlsdGVyTWVzc2FnZShjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3Qgc3BhbjEgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJ3NwYW4nKSk7XG5cdFx0c3BhbjEudGV4dENvbnRlbnQgPSBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX05PX1BST0JMRU1TX0ZJTFRFUlM7XG5cdFx0Y29uc3QgbGluayA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnYS5tZXNzYWdlQWN0aW9uJykpO1xuXHRcdGxpbmsudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY2xlYXJGaWx0ZXInLCBcIkNsZWFyIEZpbHRlcnNcIik7XG5cdFx0bGluay5zZXRBdHRyaWJ1dGUoJ3RhYkluZGV4JywgJzAnKTtcblx0XHRjb25zdCBzcGFuMiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnc3BhbicpKTtcblx0XHRzcGFuMi50ZXh0Q29udGVudCA9ICcuJztcblx0XHRkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIobGluaywgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5jbGVhckZpbHRlcnMoKSk7XG5cdFx0ZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIChlOiBJS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGUuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJGaWx0ZXJzKCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5zZXRBcmlhTGFiZWwoTWVzc2FnZXMuTUFSS0VSU19QQU5FTF9OT19QUk9CTEVNU19GSUxURVJTKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTm9Qcm9ibGVtc01lc3NhZ2VGb3JBY3RpdmVGaWxlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCBzcGFuID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdzcGFuJykpO1xuXHRcdHNwYW4udGV4dENvbnRlbnQgPSBNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX05PX1BST0JMRU1TX0FDVElWRV9GSUxFX0JVSUxUO1xuXHRcdHRoaXMuc2V0QXJpYUxhYmVsKE1lc3NhZ2VzLk1BUktFUlNfUEFORUxfTk9fUFJPQkxFTVNfQUNUSVZFX0ZJTEVfQlVJTFQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJOb1Byb2JsZW1zTWVzc2FnZShjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3Qgc3BhbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnc3BhbicpKTtcblx0XHRzcGFuLnRleHRDb250ZW50ID0gTWVzc2FnZXMuTUFSS0VSU19QQU5FTF9OT19QUk9CTEVNU19CVUlMVDtcblx0XHR0aGlzLnNldEFyaWFMYWJlbChNZXNzYWdlcy5NQVJLRVJTX1BBTkVMX05PX1BST0JMRU1TX0JVSUxUKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0QXJpYUxhYmVsKGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLndpZGdldC5zZXRBcmlhTGFiZWwobGFiZWwpO1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudCEuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbGFiZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckZpbHRlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5maWx0ZXJXaWRnZXQuc2V0RmlsdGVyVGV4dCgnJyk7XG5cdFx0dGhpcy5maWx0ZXJzLmV4Y2x1ZGVkRmlsZXMgPSBmYWxzZTtcblx0XHR0aGlzLmZpbHRlcnMuc2hvd0Vycm9ycyA9IHRydWU7XG5cdFx0dGhpcy5maWx0ZXJzLnNob3dXYXJuaW5ncyA9IHRydWU7XG5cdFx0dGhpcy5maWx0ZXJzLnNob3dJbmZvcyA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGF1dG9SZXZlYWwoZm9jdXM6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdC8vIE5vIG5lZWQgdG8gYXV0byByZXZlYWwgaWYgYWN0aXZlIGZpbGUgZmlsdGVyIGlzIG9uXG5cdFx0aWYgKHRoaXMuZmlsdGVycy5hY3RpdmVGaWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGF1dG9SZXZlYWwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdwcm9ibGVtcy5hdXRvUmV2ZWFsJyk7XG5cdFx0aWYgKHR5cGVvZiBhdXRvUmV2ZWFsID09PSAnYm9vbGVhbicgJiYgYXV0b1JldmVhbCkge1xuXHRcdFx0Y29uc3QgY3VycmVudEFjdGl2ZVJlc291cmNlID0gdGhpcy5nZXRSZXNvdXJjZUZvckN1cnJlbnRBY3RpdmVSZXNvdXJjZSgpO1xuXHRcdFx0dGhpcy53aWRnZXQucmV2ZWFsTWFya2VycyhjdXJyZW50QWN0aXZlUmVzb3VyY2UsIGZvY3VzLCB0aGlzLmxhc3RTZWxlY3RlZFJlbGF0aXZlVG9wKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFJlc291cmNlRm9yQ3VycmVudEFjdGl2ZVJlc291cmNlKCk6IFJlc291cmNlTWFya2VycyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnRBY3RpdmVSZXNvdXJjZSA/IHRoaXMubWFya2Vyc01vZGVsLmdldFJlc291cmNlTWFya2Vycyh0aGlzLmN1cnJlbnRBY3RpdmVSZXNvdXJjZSkgOiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVSYW5nZUhpZ2hsaWdodHMoKSB7XG5cdFx0dGhpcy5yYW5nZUhpZ2hsaWdodERlY29yYXRpb25zLnJlbW92ZUhpZ2hsaWdodFJhbmdlKCk7XG5cdFx0aWYgKGRvbS5pc0FjdGl2ZUVsZW1lbnQodGhpcy53aWRnZXQuZ2V0SFRNTEVsZW1lbnQoKSkpIHtcblx0XHRcdHRoaXMuaGlnaGxpZ2h0Q3VycmVudFNlbGVjdGVkTWFya2VyUmFuZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhpZ2hsaWdodEN1cnJlbnRTZWxlY3RlZE1hcmtlclJhbmdlKCkge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLndpZGdldC5nZXRTZWxlY3Rpb24oKSA/PyBbXTtcblxuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCAhPT0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbMF07XG5cblx0XHRpZiAoIShzZWxlY3Rpb24gaW5zdGFuY2VvZiBNYXJrZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yYW5nZUhpZ2hsaWdodERlY29yYXRpb25zLmhpZ2hsaWdodFJhbmdlKHNlbGVjdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PE1hcmtlckVsZW1lbnQgfCBudWxsPiB8IElUYWJsZUNvbnRleHRNZW51RXZlbnQ8TWFya2VyVGFibGVJdGVtPik6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZS5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRlLmJyb3dzZXJFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0bWVudUlkOiBNZW51SWQuUHJvYmxlbXNQYW5lbENvbnRleHQsXG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogdGhpcy53aWRnZXQuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLmdldE1lbnVBY3Rpb25zKGVsZW1lbnQpLFxuXHRcdFx0Z2V0QWN0aW9uVmlld0l0ZW06IChhY3Rpb24pID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpO1xuXHRcdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgQWN0aW9uVmlld0l0ZW0oYWN0aW9uLCBhY3Rpb24sIHsgbGFiZWw6IHRydWUsIGtleWJpbmRpbmc6IGtleWJpbmRpbmcuZ2V0TGFiZWwoKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKHdhc0NhbmNlbGxlZD86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0aWYgKHdhc0NhbmNlbGxlZCkge1xuXHRcdFx0XHRcdHRoaXMud2lkZ2V0LmRvbUZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWVudUFjdGlvbnMoZWxlbWVudDogTWFya2VyRWxlbWVudCB8IG51bGwpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUFjdGlvbltdID0gW107XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlcikge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5tYXJrZXJzVmlld01vZGVsLmdldFZpZXdNb2RlbChlbGVtZW50KTtcblx0XHRcdGlmICh2aWV3TW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgcXVpY2tGaXhBY3Rpb25zID0gdmlld01vZGVsLnF1aWNrRml4QWN0aW9uLnF1aWNrRml4ZXM7XG5cdFx0XHRcdGlmIChxdWlja0ZpeEFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goLi4ucXVpY2tGaXhBY3Rpb25zKTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRGb2N1c0VsZW1lbnQoKTogTWFya2VyRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud2lkZ2V0LmdldEZvY3VzKClbMF0gPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldEZvY3VzZWRTZWxlY3RlZEVsZW1lbnRzKCk6IE1hcmtlckVsZW1lbnRbXSB8IG51bGwge1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5nZXRGb2N1c0VsZW1lbnQoKTtcblx0XHRpZiAoIWZvY3VzKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy53aWRnZXQuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHNlbGVjdGlvbi5pbmNsdWRlcyhmb2N1cykpIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogTWFya2VyRWxlbWVudFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHNlbGVjdGVkIG9mIHNlbGVjdGlvbikge1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChzZWxlY3RlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBbZm9jdXNdO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRBbGxSZXNvdXJjZU1hcmtlcnMoKTogUmVzb3VyY2VNYXJrZXJzW10ge1xuXHRcdHJldHVybiB0aGlzLm1hcmtlcnNNb2RlbC5yZXNvdXJjZU1hcmtlcnM7XG5cdH1cblxuXHRnZXRGaWx0ZXJTdGF0cygpOiB7IHRvdGFsOiBudW1iZXI7IGZpbHRlcmVkOiBudW1iZXIgfSB7XG5cdFx0aWYgKCF0aGlzLmNhY2hlZEZpbHRlclN0YXRzKSB7XG5cdFx0XHR0aGlzLmNhY2hlZEZpbHRlclN0YXRzID0ge1xuXHRcdFx0XHR0b3RhbDogdGhpcy5tYXJrZXJzTW9kZWwudG90YWwsXG5cdFx0XHRcdGZpbHRlcmVkOiB0aGlzLndpZGdldD8uZ2V0VmlzaWJsZUl0ZW1Db3VudCgpID8/IDBcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVkRmlsdGVyU3RhdHM7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZVZpc2liaWxpdHkoaGlkZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMud2lkZ2V0LnRvZ2dsZVZpc2liaWxpdHkoaGlkZSk7XG5cdFx0dGhpcy5sYXlvdXRCb2R5Q29udGVudCgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMucGFuZWxTdGF0ZS5maWx0ZXIgPSB0aGlzLmZpbHRlcldpZGdldC5nZXRGaWx0ZXJUZXh0KCk7XG5cdFx0dGhpcy5wYW5lbFN0YXRlLmZpbHRlckhpc3RvcnkgPSB0aGlzLmZpbHRlcnMuZmlsdGVySGlzdG9yeTtcblx0XHR0aGlzLnBhbmVsU3RhdGUuc2hvd0Vycm9ycyA9IHRoaXMuZmlsdGVycy5zaG93RXJyb3JzO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS5zaG93V2FybmluZ3MgPSB0aGlzLmZpbHRlcnMuc2hvd1dhcm5pbmdzO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS5zaG93SW5mb3MgPSB0aGlzLmZpbHRlcnMuc2hvd0luZm9zO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS51c2VGaWxlc0V4Y2x1ZGUgPSB0aGlzLmZpbHRlcnMuZXhjbHVkZWRGaWxlcztcblx0XHR0aGlzLnBhbmVsU3RhdGUuYWN0aXZlRmlsZSA9IHRoaXMuZmlsdGVycy5hY3RpdmVGaWxlO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS5tdWx0aWxpbmUgPSB0aGlzLm1hcmtlcnNWaWV3TW9kZWwubXVsdGlsaW5lO1xuXHRcdHRoaXMucGFuZWxTdGF0ZS52aWV3TW9kZSA9IHRoaXMubWFya2Vyc1ZpZXdNb2RlbC52aWV3TW9kZTtcblxuXHRcdHRoaXMubWVtZW50by5zYXZlTWVtZW50bygpO1xuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxufVxuXG5jbGFzcyBNYXJrZXJzVHJlZSBleHRlbmRzIFdvcmtiZW5jaE9iamVjdFRyZWU8TWFya2VyRWxlbWVudCwgRmlsdGVyRGF0YT4gaW1wbGVtZW50cyBJUHJvYmxlbXNXaWRnZXQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlzaWJpbGl0eUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPE1hcmtlckVsZW1lbnQ+LFxuXHRcdHJlbmRlcmVyczogSVRyZWVSZW5kZXJlcjxNYXJrZXJFbGVtZW50LCBGaWx0ZXJEYXRhLCBhbnk+W10sXG5cdFx0b3B0aW9uczogSVdvcmtiZW5jaE9iamVjdFRyZWVPcHRpb25zPE1hcmtlckVsZW1lbnQsIEZpbHRlckRhdGE+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaXN0U2VydmljZSBsaXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVzZXIsIGNvbnRhaW5lciwgZGVsZWdhdGUsIHJlbmRlcmVycywgb3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCBsaXN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMudmlzaWJpbGl0eUNvbnRleHRLZXkgPSBNYXJrZXJzQ29udGV4dEtleXMuTWFya2Vyc1RyZWVWaXNpYmlsaXR5Q29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0Y29sbGFwc2VNYXJrZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuY29sbGFwc2VBbGwoKTtcblx0XHR0aGlzLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0dGhpcy5zZXRGb2N1cyhbXSk7XG5cdFx0dGhpcy5nZXRIVE1MRWxlbWVudCgpLmZvY3VzKCk7XG5cdFx0dGhpcy5mb2N1c0ZpcnN0KCk7XG5cdH1cblxuXHRmaWx0ZXJNYXJrZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMucmVmaWx0ZXIoKTtcblx0fVxuXG5cdGdldFZpc2libGVJdGVtQ291bnQoKTogbnVtYmVyIHtcblx0XHRsZXQgZmlsdGVyZWQgPSAwO1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLmdldE5vZGUoKTtcblxuXHRcdGZvciAoY29uc3QgcmVzb3VyY2VNYXJrZXJOb2RlIG9mIHJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdGZvciAoY29uc3QgbWFya2VyTm9kZSBvZiByZXNvdXJjZU1hcmtlck5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKHJlc291cmNlTWFya2VyTm9kZS52aXNpYmxlICYmIG1hcmtlck5vZGUudmlzaWJsZSkge1xuXHRcdFx0XHRcdGZpbHRlcmVkKys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsdGVyZWQ7XG5cdH1cblxuXHRpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbicpO1xuXHR9XG5cblx0dG9nZ2xlVmlzaWJpbGl0eShoaWRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy52aXNpYmlsaXR5Q29udGV4dEtleS5zZXQoIWhpZGUpO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIGhpZGUpO1xuXHR9XG5cblx0cmVzZXQocmVzb3VyY2VNYXJrZXJzOiBSZXNvdXJjZU1hcmtlcnNbXSk6IHZvaWQge1xuXHRcdHRoaXMuc2V0Q2hpbGRyZW4obnVsbCwgSXRlcmFibGUubWFwKHJlc291cmNlTWFya2VycywgbSA9PiAoeyBlbGVtZW50OiBtLCBjaGlsZHJlbjogY3JlYXRlUmVzb3VyY2VNYXJrZXJzSXRlcmF0b3IobSkgfSkpKTtcblx0fVxuXG5cdHJldmVhbE1hcmtlcnMoYWN0aXZlUmVzb3VyY2U6IFJlc291cmNlTWFya2VycyB8IG51bGwsIGZvY3VzOiBib29sZWFuLCBsYXN0U2VsZWN0ZWRSZWxhdGl2ZVRvcDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKGFjdGl2ZVJlc291cmNlKSB7XG5cdFx0XHRpZiAodGhpcy5oYXNFbGVtZW50KGFjdGl2ZVJlc291cmNlKSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuaXNDb2xsYXBzZWQoYWN0aXZlUmVzb3VyY2UpICYmIHRoaXMuaGFzU2VsZWN0ZWRNYXJrZXJGb3IoYWN0aXZlUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXZlYWwodGhpcy5nZXRTZWxlY3Rpb24oKVswXSwgbGFzdFNlbGVjdGVkUmVsYXRpdmVUb3ApO1xuXHRcdFx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRGb2N1cyh0aGlzLmdldFNlbGVjdGlvbigpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5leHBhbmQoYWN0aXZlUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMucmV2ZWFsKGFjdGl2ZVJlc291cmNlLCAwKTtcblxuXHRcdFx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRGb2N1cyhbYWN0aXZlUmVzb3VyY2VdKTtcblx0XHRcdFx0XHRcdHRoaXMuc2V0U2VsZWN0aW9uKFthY3RpdmVSZXNvdXJjZV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZm9jdXMpIHtcblx0XHRcdHRoaXMuc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdHRoaXMuZm9jdXNGaXJzdCgpO1xuXHRcdH1cblx0fVxuXG5cdHNldEFyaWFMYWJlbChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5hcmlhTGFiZWwgPSBsYWJlbDtcblx0fVxuXG5cdHNldE1hcmtlclNlbGVjdGlvbihzZWxlY3Rpb24/OiBNYXJrZXJbXSwgZm9jdXM/OiBNYXJrZXJbXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRpZiAoc2VsZWN0aW9uICYmIHNlbGVjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuc2V0U2VsZWN0aW9uKHNlbGVjdGlvbi5tYXAobSA9PiB0aGlzLmZpbmRNYXJrZXJOb2RlKG0pKSk7XG5cblx0XHRcdFx0aWYgKGZvY3VzICYmIGZvY3VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLnNldEZvY3VzKGZvY3VzLm1hcChmID0+IHRoaXMuZmluZE1hcmtlck5vZGUoZikpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNldEZvY3VzKFt0aGlzLmZpbmRNYXJrZXJOb2RlKHNlbGVjdGlvblswXSldKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucmV2ZWFsKHRoaXMuZmluZE1hcmtlck5vZGUoc2VsZWN0aW9uWzBdKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuZ2V0U2VsZWN0aW9uKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnN0IGZpcnN0VmlzaWJsZUVsZW1lbnQgPSB0aGlzLmZpcnN0VmlzaWJsZUVsZW1lbnQ7XG5cdFx0XHRcdGNvbnN0IG1hcmtlciA9IGZpcnN0VmlzaWJsZUVsZW1lbnQgP1xuXHRcdFx0XHRcdGZpcnN0VmlzaWJsZUVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvdXJjZU1hcmtlcnMgPyBmaXJzdFZpc2libGVFbGVtZW50Lm1hcmtlcnNbMF0gOlxuXHRcdFx0XHRcdFx0Zmlyc3RWaXNpYmxlRWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlciA/IGZpcnN0VmlzaWJsZUVsZW1lbnQgOiB1bmRlZmluZWRcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRpZiAobWFya2VyKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRTZWxlY3Rpb24oW21hcmtlcl0pO1xuXHRcdFx0XHRcdHRoaXMuc2V0Rm9jdXMoW21hcmtlcl0pO1xuXHRcdFx0XHRcdHRoaXMucmV2ZWFsKG1hcmtlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR1cGRhdGUocmVzb3VyY2VNYXJrZXJzOiBSZXNvdXJjZU1hcmtlcnNbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2VNYXJrZXIgb2YgcmVzb3VyY2VNYXJrZXJzKSB7XG5cdFx0XHRpZiAodGhpcy5oYXNFbGVtZW50KHJlc291cmNlTWFya2VyKSkge1xuXHRcdFx0XHR0aGlzLnNldENoaWxkcmVuKHJlc291cmNlTWFya2VyLCBjcmVhdGVSZXNvdXJjZU1hcmtlcnNJdGVyYXRvcihyZXNvdXJjZU1hcmtlcikpO1xuXHRcdFx0XHR0aGlzLnJlcmVuZGVyKHJlc291cmNlTWFya2VyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR1cGRhdGVNYXJrZXIobWFya2VyOiBNYXJrZXIpOiB2b2lkIHtcblx0XHR0aGlzLnJlcmVuZGVyKG1hcmtlcik7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRNYXJrZXJOb2RlKG1hcmtlcjogTWFya2VyKSB7XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZU5vZGUgb2YgdGhpcy5nZXROb2RlKCkuY2hpbGRyZW4pIHtcblx0XHRcdGZvciAoY29uc3QgbWFya2VyTm9kZSBvZiByZXNvdXJjZU5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKG1hcmtlck5vZGUuZWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlciAmJiBtYXJrZXJOb2RlLmVsZW1lbnQubWFya2VyID09PSBtYXJrZXIubWFya2VyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG1hcmtlck5vZGUuZWxlbWVudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNTZWxlY3RlZE1hcmtlckZvcihyZXNvdXJjZTogUmVzb3VyY2VNYXJrZXJzKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRFbGVtZW50ID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsZWN0ZWRFbGVtZW50ICYmIHNlbGVjdGVkRWxlbWVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAoc2VsZWN0ZWRFbGVtZW50WzBdIGluc3RhbmNlb2YgTWFya2VyKSB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZS5oYXMoKDxNYXJrZXI+c2VsZWN0ZWRFbGVtZW50WzBdKS5tYXJrZXIucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0c3VwZXIubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG59XG5cbmNsYXNzIE1hcmtlcnNMaXN0RG5ESGFuZGxlciBleHRlbmRzIFJlc291cmNlTGlzdERuREhhbmRsZXI8TWFya2VyRWxlbWVudCB8IE1hcmtlclRhYmxlSXRlbT4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWxlbWVudCA9PiB7XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlclRhYmxlSXRlbSkge1xuXHRcdFx0XHRyZXR1cm4gd2l0aFNlbGVjdGlvbihlbGVtZW50LnJlc291cmNlLCBlbGVtZW50LnJhbmdlKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlc291cmNlTWFya2Vycykge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlcikge1xuXHRcdFx0XHRyZXR1cm4gd2l0aFNlbGVjdGlvbihlbGVtZW50LnJlc291cmNlLCBlbGVtZW50LnJhbmdlKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlbGF0ZWRJbmZvcm1hdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gd2l0aFNlbGVjdGlvbihlbGVtZW50LnJhdy5yZXNvdXJjZSwgZWxlbWVudC5yYXcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uV2lsbERyYWdFbGVtZW50cyhlbGVtZW50czogKE1hcmtlckVsZW1lbnQgfCBNYXJrZXJUYWJsZUl0ZW0pW10sIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCkge1xuXHRcdGNvbnN0IGRhdGEgPSBlbGVtZW50cy5tYXAoKGUpOiBNYXJrZXJUcmFuc2ZlckRhdGEgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBSZWxhdGVkSW5mb3JtYXRpb24gfHwgZSBpbnN0YW5jZW9mIE1hcmtlcikge1xuXHRcdFx0XHRyZXR1cm4gZS5tYXJrZXI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZSBpbnN0YW5jZW9mIFJlc291cmNlTWFya2Vycykge1xuXHRcdFx0XHRyZXR1cm4geyB1cmk6IGUucmVzb3VyY2UgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHRpZiAoIWRhdGEubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZmlsbEluTWFya2Vyc0RyYWdEYXRhKGRhdGEsIG9yaWdpbmFsRXZlbnQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFFUCxZQUFZLFNBQVM7QUFDckIsU0FBeUIsNkJBQTZCO0FBQ3RELFNBQVMsc0JBQXNCO0FBSS9CLFNBQWtCLGlCQUFpQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxPQUFPLGFBQWE7QUFFN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQThCLG9CQUFvQjtBQUMzRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlCQUFpQjtBQUcxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQWlEO0FBQzFELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsY0FBdUQsMkJBQTJCO0FBQzNGLFNBQVMsZ0JBQWdCLHNCQUFzQjtBQUMvQyxTQUFTLGdCQUFnQixxQkFBcUI7QUFDOUMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxpQ0FB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VSxXQUFXLFFBQVEsV0FBVyxPQUFPLFFBQVE7QUFDeEYsaUJBQU8sV0FBVztBQUFBLFFBQ25CO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEscUJBQXFCLFVBQW9DO0FBQ2hFLFVBQU0sa0JBQWtCLEtBQUssYUFBYTtBQUMxQyxRQUFJLG1CQUFtQixnQkFBZ0IsU0FBUyxHQUFHO0FBQ2xELFVBQUksZ0JBQWdCLENBQUMsYUFBYSxRQUFRO0FBQ3pDLFlBQUksU0FBUyxJQUFhLGdCQUFnQixDQUFDLEVBQUcsT0FBTyxRQUFRLEdBQUc7QUFDL0QsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUFBLEVBRVMsT0FBTyxRQUFnQixPQUFxQjtBQUNwRCxTQUFLLFVBQVUsTUFBTSxTQUFTLEdBQUcsTUFBTTtBQUN2QyxVQUFNLE9BQU8sUUFBUSxLQUFLO0FBQUEsRUFDM0I7QUFDRDtBQWxLTSxjQUFOO0FBQUEsRUFVRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWRHO0FBb0tOLElBQU0sd0JBQU4sY0FBb0MsdUJBQXdEO0FBQUEsRUFDM0YsWUFDd0Isc0JBQ3RCO0FBQ0QsVUFBTSxhQUFXO0FBQ2hCLFVBQUksbUJBQW1CLGlCQUFpQjtBQUN2QyxlQUFPLGNBQWMsUUFBUSxVQUFVLFFBQVEsS0FBSztBQUFBLE1BQ3JELFdBQVcsbUJBQW1CLGlCQUFpQjtBQUM5QyxlQUFPLFFBQVE7QUFBQSxNQUNoQixXQUFXLG1CQUFtQixRQUFRO0FBQ3JDLGVBQU8sY0FBYyxRQUFRLFVBQVUsUUFBUSxLQUFLO0FBQUEsTUFDckQsV0FBVyxtQkFBbUIsb0JBQW9CO0FBQ2pELGVBQU8sY0FBYyxRQUFRLElBQUksVUFBVSxRQUFRLEdBQUc7QUFBQSxNQUN2RDtBQUNBLGFBQU87QUFBQSxJQUNSLEdBQUcsb0JBQW9CO0FBQUEsRUFDeEI7QUFBQSxFQUVtQixtQkFBbUIsVUFBK0MsZUFBMEI7QUFDOUcsVUFBTSxPQUFPLFNBQVMsSUFBSSxDQUFDLE1BQXNDO0FBQ2hFLFVBQUksYUFBYSxzQkFBc0IsYUFBYSxRQUFRO0FBQzNELGVBQU8sRUFBRTtBQUFBLE1BQ1Y7QUFDQSxVQUFJLGFBQWEsaUJBQWlCO0FBQ2pDLGVBQU8sRUFBRSxLQUFLLEVBQUUsU0FBUztBQUFBLE1BQzFCO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQyxFQUFFLE9BQU8sU0FBUztBQUVuQixRQUFJLENBQUMsS0FBSyxRQUFRO0FBQ2pCO0FBQUEsSUFDRDtBQUVBLDBCQUFzQixNQUFNLGFBQWE7QUFBQSxFQUMxQztBQUNEO0FBbkNNLHdCQUFOO0FBQUEsRUFFRztBQUFBLEdBRkc7IiwKICAibmFtZXMiOiBbInJlc291cmNlTWFya2VycyJdCn0K
