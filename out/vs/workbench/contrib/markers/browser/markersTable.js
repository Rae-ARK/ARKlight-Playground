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
import { localize } from "../../../../nls.js";
import * as DOM from "../../../../base/browser/dom.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { compareMarkersByUri, Marker, MarkerTableItem } from "./markersModel.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { FilterOptions } from "./markersFilterOptions.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { QuickFixAction, QuickFixActionViewItem } from "./markersViewActions.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import Messages from "./messages.js";
import { isUndefinedOrNull } from "../../../../base/common/types.js";
import { Range } from "../../../../editor/common/core/range.js";
import { unsupportedSchemas } from "../../../../platform/markers/common/markerService.js";
import Severity from "../../../../base/common/severity.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
const $ = DOM.$;
let MarkerSeverityColumnRenderer = class {
  constructor(markersViewModel, instantiationService) {
    this.markersViewModel = markersViewModel;
    this.instantiationService = instantiationService;
    this.templateId = MarkerSeverityColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const severityColumn = DOM.append(container, $(".severity"));
    const icon = DOM.append(severityColumn, $(""));
    const actionBarColumn = DOM.append(container, $(".actions"));
    const actionBar = new ActionBar(actionBarColumn, {
      actionViewItemProvider: (action, options) => action.id === QuickFixAction.ID ? this.instantiationService.createInstance(QuickFixActionViewItem, action, options) : void 0
    });
    return { actionBar, icon, elementDisposables: new DisposableStore() };
  }
  renderElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    const toggleQuickFix = (enabled) => {
      if (!isUndefinedOrNull(enabled)) {
        const container = DOM.findParentWithClass(templateData.icon, "monaco-table-td");
        container.classList.toggle("quickFix", enabled);
      }
    };
    templateData.icon.title = MarkerSeverity.toString(element.marker.severity);
    templateData.icon.className = `marker-icon ${Severity.toString(MarkerSeverity.toSeverity(element.marker.severity))} codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(element.marker.severity))}`;
    templateData.actionBar.clear();
    const viewModel = this.markersViewModel.getViewModel(element);
    if (viewModel) {
      const quickFixAction = viewModel.quickFixAction;
      templateData.actionBar.push([quickFixAction], { icon: true, label: false });
      toggleQuickFix(viewModel.quickFixAction.enabled);
      templateData.elementDisposables.add(quickFixAction.onDidChange(({ enabled }) => toggleQuickFix(enabled)));
      templateData.elementDisposables.add(quickFixAction.onShowQuickFixes(() => {
        const quickFixActionViewItem = templateData.actionBar.viewItems[0];
        if (quickFixActionViewItem) {
          quickFixActionViewItem.showQuickFixes();
        }
      }));
    }
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.actionBar.dispose();
  }
};
MarkerSeverityColumnRenderer.TEMPLATE_ID = "severity";
MarkerSeverityColumnRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService)
], MarkerSeverityColumnRenderer);
let MarkerCodeColumnRenderer = class {
  constructor(hoverService, openerService) {
    this.hoverService = hoverService;
    this.openerService = openerService;
    this.templateId = MarkerCodeColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const templateDisposable = new DisposableStore();
    const codeColumn = DOM.append(container, $(".code"));
    const sourceLabel = templateDisposable.add(new HighlightedLabel(codeColumn));
    sourceLabel.element.classList.add("source-label");
    const codeLabel = templateDisposable.add(new HighlightedLabel(codeColumn));
    codeLabel.element.classList.add("code-label");
    const codeLink = templateDisposable.add(new Link(codeColumn, { href: "", label: "" }, {}, this.hoverService, this.openerService));
    return { codeColumn, sourceLabel, codeLabel, codeLink, templateDisposable };
  }
  renderElement(element, index, templateData) {
    templateData.codeColumn.classList.remove("code-label");
    templateData.codeColumn.classList.remove("code-link");
    if (element.marker.source && element.marker.code) {
      if (typeof element.marker.code === "string") {
        templateData.codeColumn.classList.add("code-label");
        templateData.codeColumn.title = `${element.marker.source} (${element.marker.code})`;
        templateData.sourceLabel.set(element.marker.source, element.sourceMatches);
        templateData.codeLabel.set(element.marker.code, element.codeMatches);
      } else {
        templateData.codeColumn.classList.add("code-link");
        templateData.codeColumn.title = `${element.marker.source} (${element.marker.code.value})`;
        templateData.sourceLabel.set(element.marker.source, element.sourceMatches);
        const codeLinkLabel = templateData.templateDisposable.add(new HighlightedLabel($(".code-link-label")));
        codeLinkLabel.set(element.marker.code.value, element.codeMatches);
        templateData.codeLink.link = {
          href: element.marker.code.target.toString(true),
          title: element.marker.code.target.toString(true),
          label: codeLinkLabel.element
        };
      }
    } else {
      templateData.codeColumn.title = "";
      templateData.sourceLabel.set("-");
    }
  }
  disposeTemplate(templateData) {
    templateData.templateDisposable.dispose();
  }
};
MarkerCodeColumnRenderer.TEMPLATE_ID = "code";
MarkerCodeColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, IOpenerService)
], MarkerCodeColumnRenderer);
const _MarkerMessageColumnRenderer = class _MarkerMessageColumnRenderer {
  constructor() {
    this.templateId = _MarkerMessageColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const columnElement = DOM.append(container, $(".message"));
    const highlightedLabel = new HighlightedLabel(columnElement);
    return { columnElement, highlightedLabel };
  }
  renderElement(element, index, templateData) {
    templateData.columnElement.title = element.marker.message;
    templateData.highlightedLabel.set(element.marker.message, element.messageMatches);
  }
  disposeTemplate(templateData) {
    templateData.highlightedLabel.dispose();
  }
};
_MarkerMessageColumnRenderer.TEMPLATE_ID = "message";
let MarkerMessageColumnRenderer = _MarkerMessageColumnRenderer;
let MarkerFileColumnRenderer = class {
  constructor(labelService) {
    this.labelService = labelService;
    this.templateId = MarkerFileColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const columnElement = DOM.append(container, $(".file"));
    const fileLabel = new HighlightedLabel(columnElement);
    fileLabel.element.classList.add("file-label");
    const positionLabel = new HighlightedLabel(columnElement);
    positionLabel.element.classList.add("file-position");
    return { columnElement, fileLabel, positionLabel };
  }
  renderElement(element, index, templateData) {
    const positionLabel = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(element.marker.startLineNumber, element.marker.startColumn);
    templateData.columnElement.title = `${this.labelService.getUriLabel(element.marker.resource, { relative: false })} ${positionLabel}`;
    templateData.fileLabel.set(this.labelService.getUriLabel(element.marker.resource, { relative: true }), element.fileMatches);
    templateData.positionLabel.set(positionLabel, void 0);
  }
  disposeTemplate(templateData) {
    templateData.fileLabel.dispose();
    templateData.positionLabel.dispose();
  }
};
MarkerFileColumnRenderer.TEMPLATE_ID = "file";
MarkerFileColumnRenderer = __decorateClass([
  __decorateParam(0, ILabelService)
], MarkerFileColumnRenderer);
const _MarkerSourceColumnRenderer = class _MarkerSourceColumnRenderer {
  constructor() {
    this.templateId = _MarkerSourceColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const columnElement = DOM.append(container, $(".source"));
    const highlightedLabel = new HighlightedLabel(columnElement);
    return { columnElement, highlightedLabel };
  }
  renderElement(element, index, templateData) {
    templateData.columnElement.title = element.marker.source ?? "";
    templateData.highlightedLabel.set(element.marker.source ?? "", element.sourceMatches);
  }
  disposeTemplate(templateData) {
    templateData.highlightedLabel.dispose();
  }
};
_MarkerSourceColumnRenderer.TEMPLATE_ID = "source";
let MarkerSourceColumnRenderer = _MarkerSourceColumnRenderer;
const _MarkersTableVirtualDelegate = class _MarkersTableVirtualDelegate {
  constructor() {
    this.headerRowHeight = _MarkersTableVirtualDelegate.HEADER_ROW_HEIGHT;
  }
  getHeight(item) {
    return _MarkersTableVirtualDelegate.ROW_HEIGHT;
  }
};
_MarkersTableVirtualDelegate.HEADER_ROW_HEIGHT = 24;
_MarkersTableVirtualDelegate.ROW_HEIGHT = 24;
let MarkersTableVirtualDelegate = _MarkersTableVirtualDelegate;
let MarkersTable = class extends Disposable {
  constructor(container, markersViewModel, resourceMarkers, filterOptions, options, instantiationService, labelService) {
    super();
    this.container = container;
    this.markersViewModel = markersViewModel;
    this.resourceMarkers = resourceMarkers;
    this.filterOptions = filterOptions;
    this.instantiationService = instantiationService;
    this.labelService = labelService;
    this._itemCount = 0;
    this.table = this.instantiationService.createInstance(
      WorkbenchTable,
      "Markers",
      this.container,
      new MarkersTableVirtualDelegate(),
      [
        {
          label: "",
          tooltip: "",
          weight: 0,
          minimumWidth: 36,
          maximumWidth: 36,
          templateId: MarkerSeverityColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("codeColumnLabel", "Code"),
          tooltip: "",
          weight: 1,
          minimumWidth: 100,
          maximumWidth: 300,
          templateId: MarkerCodeColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("messageColumnLabel", "Message"),
          tooltip: "",
          weight: 4,
          templateId: MarkerMessageColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("fileColumnLabel", "File"),
          tooltip: "",
          weight: 2,
          templateId: MarkerFileColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("sourceColumnLabel", "Source"),
          tooltip: "",
          weight: 1,
          minimumWidth: 100,
          maximumWidth: 300,
          templateId: MarkerSourceColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        this.instantiationService.createInstance(MarkerSeverityColumnRenderer, this.markersViewModel),
        this.instantiationService.createInstance(MarkerCodeColumnRenderer),
        this.instantiationService.createInstance(MarkerMessageColumnRenderer),
        this.instantiationService.createInstance(MarkerFileColumnRenderer),
        this.instantiationService.createInstance(MarkerSourceColumnRenderer)
      ],
      options
    );
    const list = this.table.domNode.querySelector(".monaco-list-rows");
    const onRowHover = Event.chain(
      this._register(new DomEmitter(list, "mouseover")).event,
      ($2) => $2.map((e) => DOM.findParentWithClass(e.target, "monaco-list-row", "monaco-list-rows")).filter((e) => !!e).map((e) => parseInt(e.getAttribute("data-index")))
    );
    const onListLeave = Event.map(this._register(new DomEmitter(list, "mouseleave")).event, () => -1);
    const onRowHoverOrLeave = Event.latch(Event.any(onRowHover, onListLeave));
    const onRowPermanentHover = Event.debounce(onRowHoverOrLeave, (_, e) => e, 500);
    this._register(onRowPermanentHover((e) => {
      if (e !== -1 && this.table.row(e)) {
        this.markersViewModel.onMarkerMouseHover(this.table.row(e));
      }
    }));
  }
  get contextKeyService() {
    return this.table.contextKeyService;
  }
  get onContextMenu() {
    return this.table.onContextMenu;
  }
  get onDidOpen() {
    return this.table.onDidOpen;
  }
  get onDidChangeFocus() {
    return this.table.onDidChangeFocus;
  }
  get onDidChangeSelection() {
    return this.table.onDidChangeSelection;
  }
  collapseMarkers() {
  }
  domFocus() {
    this.table.domFocus();
  }
  filterMarkers(resourceMarkers, filterOptions) {
    this.filterOptions = filterOptions;
    this.reset(resourceMarkers);
  }
  getFocus() {
    const focus = this.table.getFocus();
    return focus.length > 0 ? [...focus.map((f) => this.table.row(f))] : [];
  }
  getHTMLElement() {
    return this.table.getHTMLElement();
  }
  getRelativeTop(marker) {
    return marker ? this.table.getRelativeTop(this.table.indexOf(marker)) : null;
  }
  getSelection() {
    const selection = this.table.getSelection();
    return selection.length > 0 ? [...selection.map((i) => this.table.row(i))] : [];
  }
  getVisibleItemCount() {
    return this._itemCount;
  }
  isVisible() {
    return !this.container.classList.contains("hidden");
  }
  layout(height, width) {
    this.container.style.height = `${height}px`;
    this.table.layout(height, width);
  }
  reset(resourceMarkers) {
    this.resourceMarkers = resourceMarkers;
    const items = [];
    for (const resourceMarker of this.resourceMarkers) {
      for (const marker of resourceMarker.markers) {
        if (unsupportedSchemas.has(marker.resource.scheme)) {
          continue;
        }
        if (this.filterOptions.excludesMatcher.matches(marker.resource)) {
          continue;
        }
        if (this.filterOptions.includesMatcher.matches(marker.resource)) {
          items.push(new MarkerTableItem(marker));
          continue;
        }
        const matchesSeverity = this.filterOptions.showErrors && MarkerSeverity.Error === marker.marker.severity || this.filterOptions.showWarnings && MarkerSeverity.Warning === marker.marker.severity || this.filterOptions.showInfos && MarkerSeverity.Info === marker.marker.severity;
        if (!matchesSeverity) {
          continue;
        }
        if (!this.filterOptions.matchesSourceFilters(marker.marker.source)) {
          continue;
        }
        if (this.filterOptions.textFilter.text) {
          const sourceMatches = marker.marker.source ? FilterOptions._filter(this.filterOptions.textFilter.text, marker.marker.source) ?? void 0 : void 0;
          const codeMatches = marker.marker.code ? FilterOptions._filter(this.filterOptions.textFilter.text, typeof marker.marker.code === "string" ? marker.marker.code : marker.marker.code.value) ?? void 0 : void 0;
          const messageMatches = FilterOptions._messageFilter(this.filterOptions.textFilter.text, marker.marker.message) ?? void 0;
          const fileMatches = FilterOptions._messageFilter(this.filterOptions.textFilter.text, this.labelService.getUriLabel(marker.resource, { relative: true })) ?? void 0;
          const matched = sourceMatches || codeMatches || messageMatches || fileMatches;
          if (matched && !this.filterOptions.textFilter.negate || !matched && this.filterOptions.textFilter.negate) {
            items.push(new MarkerTableItem(marker, sourceMatches, codeMatches, messageMatches, fileMatches));
          }
          continue;
        }
        items.push(new MarkerTableItem(marker));
      }
    }
    this._itemCount = items.length;
    this.table.splice(0, Number.POSITIVE_INFINITY, items.sort((a, b) => {
      let result = MarkerSeverity.compare(a.marker.severity, b.marker.severity);
      if (result === 0) {
        result = compareMarkersByUri(a.marker, b.marker);
      }
      if (result === 0) {
        result = Range.compareRangesUsingStarts(a.marker, b.marker);
      }
      return result;
    }));
  }
  revealMarkers(activeResource, focus, lastSelectedRelativeTop) {
    if (activeResource) {
      const activeResourceIndex = this.resourceMarkers.indexOf(activeResource);
      if (activeResourceIndex !== -1) {
        if (this.hasSelectedMarkerFor(activeResource)) {
          const tableSelection = this.table.getSelection();
          this.table.reveal(tableSelection[0], lastSelectedRelativeTop);
          if (focus) {
            this.table.setFocus(tableSelection);
          }
        } else {
          this.table.reveal(activeResourceIndex, 0);
          if (focus) {
            this.table.setFocus([activeResourceIndex]);
            this.table.setSelection([activeResourceIndex]);
          }
        }
      }
    } else if (focus) {
      this.table.setSelection([]);
      this.table.focusFirst();
    }
  }
  setAriaLabel(label) {
    this.table.domNode.ariaLabel = label;
  }
  setMarkerSelection(selection, focus) {
    if (this.isVisible()) {
      if (selection && selection.length > 0) {
        this.table.setSelection(selection.map((m) => this.findMarkerIndex(m)));
        if (focus && focus.length > 0) {
          this.table.setFocus(focus.map((f) => this.findMarkerIndex(f)));
        } else {
          this.table.setFocus([this.findMarkerIndex(selection[0])]);
        }
        this.table.reveal(this.findMarkerIndex(selection[0]));
      } else if (this.getSelection().length === 0 && this.getVisibleItemCount() > 0) {
        this.table.setSelection([0]);
        this.table.setFocus([0]);
        this.table.reveal(0);
      }
    }
  }
  toggleVisibility(hide) {
    this.container.classList.toggle("hidden", hide);
  }
  update(resourceMarkers) {
    for (const resourceMarker of resourceMarkers) {
      const index = this.resourceMarkers.indexOf(resourceMarker);
      this.resourceMarkers.splice(index, 1, resourceMarker);
    }
    this.reset(this.resourceMarkers);
  }
  updateMarker(marker) {
    this.table.rerender();
  }
  findMarkerIndex(marker) {
    for (let index = 0; index < this.table.length; index++) {
      if (this.table.row(index).marker === marker.marker) {
        return index;
      }
    }
    return -1;
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
};
MarkersTable = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILabelService)
], MarkersTable);
export {
  MarkersTable
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtlcnMvYnJvd3Nlci9tYXJrZXJzVGFibGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElUYWJsZUNvbnRleHRNZW51RXZlbnQsIElUYWJsZUV2ZW50LCBJVGFibGVSZW5kZXJlciwgSVRhYmxlVmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RhYmxlL3RhYmxlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuRXZlbnQsIElXb3JrYmVuY2hUYWJsZU9wdGlvbnMsIFdvcmtiZW5jaFRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEhpZ2hsaWdodGVkTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaGlnaGxpZ2h0ZWRsYWJlbC9oaWdobGlnaHRlZExhYmVsLmpzJztcbmltcG9ydCB7IGNvbXBhcmVNYXJrZXJzQnlVcmksIE1hcmtlciwgTWFya2VyVGFibGVJdGVtLCBSZXNvdXJjZU1hcmtlcnMgfSBmcm9tICcuL21hcmtlcnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHlJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NldmVyaXR5SWNvbi9zZXZlcml0eUljb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBGaWx0ZXJPcHRpb25zIH0gZnJvbSAnLi9tYXJrZXJzRmlsdGVyT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2Jyb3dzZXIvbGluay5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IE1hcmtlcnNWaWV3TW9kZWwgfSBmcm9tICcuL21hcmtlcnNUcmVlVmlld2VyLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFF1aWNrRml4QWN0aW9uLCBRdWlja0ZpeEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi9tYXJrZXJzVmlld0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9ldmVudC5qcyc7XG5pbXBvcnQgTWVzc2FnZXMgZnJvbSAnLi9tZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZE9yTnVsbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElQcm9ibGVtc1dpZGdldCB9IGZyb20gJy4vbWFya2Vyc1ZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyB1bnN1cHBvcnRlZFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuaW50ZXJmYWNlIElNYXJrZXJJY29uQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuaW50ZXJmYWNlIElNYXJrZXJDb2RlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29kZUNvbHVtbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHNvdXJjZUxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRyZWFkb25seSBjb2RlTGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdHJlYWRvbmx5IGNvZGVMaW5rOiBMaW5rO1xuXHRyZWFkb25seSB0ZW1wbGF0ZURpc3Bvc2FibGU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuaW50ZXJmYWNlIElNYXJrZXJGaWxlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29sdW1uRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGZpbGVMYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0cmVhZG9ubHkgcG9zaXRpb25MYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcbn1cblxuXG5pbnRlcmZhY2UgSU1hcmtlckhpZ2hsaWdodGVkTGFiZWxDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb2x1bW5FbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaGlnaGxpZ2h0ZWRMYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcbn1cblxuY2xhc3MgTWFya2VyU2V2ZXJpdHlDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPE1hcmtlclRhYmxlSXRlbSwgSU1hcmtlckljb25Db2x1bW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnc2V2ZXJpdHknO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IE1hcmtlclNldmVyaXR5Q29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYXJrZXJzVmlld01vZGVsOiBNYXJrZXJzVmlld01vZGVsLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElNYXJrZXJJY29uQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBzZXZlcml0eUNvbHVtbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V2ZXJpdHknKSk7XG5cdFx0Y29uc3QgaWNvbiA9IERPTS5hcHBlbmQoc2V2ZXJpdHlDb2x1bW4sICQoJycpKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhckNvbHVtbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgQWN0aW9uQmFyKGFjdGlvbkJhckNvbHVtbiwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9ucykgPT4gYWN0aW9uLmlkID09PSBRdWlja0ZpeEFjdGlvbi5JRCA/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tGaXhBY3Rpb25WaWV3SXRlbSwgPFF1aWNrRml4QWN0aW9uPmFjdGlvbiwgb3B0aW9ucykgOiB1bmRlZmluZWRcblx0XHR9KTtcblxuXHRcdHJldHVybiB7IGFjdGlvbkJhciwgaWNvbiwgZWxlbWVudERpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogTWFya2VyVGFibGVJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNYXJrZXJJY29uQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgdG9nZ2xlUXVpY2tGaXggPSAoZW5hYmxlZD86IGJvb2xlYW4pID0+IHtcblx0XHRcdGlmICghaXNVbmRlZmluZWRPck51bGwoZW5hYmxlZCkpIHtcblx0XHRcdFx0Y29uc3QgY29udGFpbmVyID0gRE9NLmZpbmRQYXJlbnRXaXRoQ2xhc3ModGVtcGxhdGVEYXRhLmljb24sICdtb25hY28tdGFibGUtdGQnKSE7XG5cdFx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdxdWlja0ZpeCcsIGVuYWJsZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi50aXRsZSA9IE1hcmtlclNldmVyaXR5LnRvU3RyaW5nKGVsZW1lbnQubWFya2VyLnNldmVyaXR5KTtcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBgbWFya2VyLWljb24gJHtTZXZlcml0eS50b1N0cmluZyhNYXJrZXJTZXZlcml0eS50b1NldmVyaXR5KGVsZW1lbnQubWFya2VyLnNldmVyaXR5KSl9IGNvZGljb24gJHtTZXZlcml0eUljb24uY2xhc3NOYW1lKE1hcmtlclNldmVyaXR5LnRvU2V2ZXJpdHkoZWxlbWVudC5tYXJrZXIuc2V2ZXJpdHkpKX1gO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5nZXRWaWV3TW9kZWwoZWxlbWVudCk7XG5cdFx0aWYgKHZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3QgcXVpY2tGaXhBY3Rpb24gPSB2aWV3TW9kZWwucXVpY2tGaXhBY3Rpb247XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2goW3F1aWNrRml4QWN0aW9uXSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHR0b2dnbGVRdWlja0ZpeCh2aWV3TW9kZWwucXVpY2tGaXhBY3Rpb24uZW5hYmxlZCk7XG5cblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHF1aWNrRml4QWN0aW9uLm9uRGlkQ2hhbmdlKCh7IGVuYWJsZWQgfSkgPT4gdG9nZ2xlUXVpY2tGaXgoZW5hYmxlZCkpKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHF1aWNrRml4QWN0aW9uLm9uU2hvd1F1aWNrRml4ZXMoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWlja0ZpeEFjdGlvblZpZXdJdGVtID0gPFF1aWNrRml4QWN0aW9uVmlld0l0ZW0+dGVtcGxhdGVEYXRhLmFjdGlvbkJhci52aWV3SXRlbXNbMF07XG5cdFx0XHRcdGlmIChxdWlja0ZpeEFjdGlvblZpZXdJdGVtKSB7XG5cdFx0XHRcdFx0cXVpY2tGaXhBY3Rpb25WaWV3SXRlbS5zaG93UXVpY2tGaXhlcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU1hcmtlckljb25Db2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNYXJrZXJDb2RlQ29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxNYXJrZXJUYWJsZUl0ZW0sIElNYXJrZXJDb2RlQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdjb2RlJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBNYXJrZXJDb2RlQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1hcmtlckNvZGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb2RlQ29sdW1uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jb2RlJykpO1xuXG5cdFx0Y29uc3Qgc291cmNlTGFiZWwgPSB0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKGNvZGVDb2x1bW4pKTtcblx0XHRzb3VyY2VMYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NvdXJjZS1sYWJlbCcpO1xuXG5cdFx0Y29uc3QgY29kZUxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlLmFkZChuZXcgSGlnaGxpZ2h0ZWRMYWJlbChjb2RlQ29sdW1uKSk7XG5cdFx0Y29kZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY29kZS1sYWJlbCcpO1xuXG5cdFx0Y29uc3QgY29kZUxpbmsgPSB0ZW1wbGF0ZURpc3Bvc2FibGUuYWRkKG5ldyBMaW5rKGNvZGVDb2x1bW4sIHsgaHJlZjogJycsIGxhYmVsOiAnJyB9LCB7fSwgdGhpcy5ob3ZlclNlcnZpY2UsIHRoaXMub3BlbmVyU2VydmljZSkpO1xuXG5cdFx0cmV0dXJuIHsgY29kZUNvbHVtbiwgc291cmNlTGFiZWwsIGNvZGVMYWJlbCwgY29kZUxpbmssIHRlbXBsYXRlRGlzcG9zYWJsZSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBNYXJrZXJUYWJsZUl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1hcmtlckNvZGVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY29kZUNvbHVtbi5jbGFzc0xpc3QucmVtb3ZlKCdjb2RlLWxhYmVsJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvZGVDb2x1bW4uY2xhc3NMaXN0LnJlbW92ZSgnY29kZS1saW5rJyk7XG5cblx0XHRpZiAoZWxlbWVudC5tYXJrZXIuc291cmNlICYmIGVsZW1lbnQubWFya2VyLmNvZGUpIHtcblx0XHRcdGlmICh0eXBlb2YgZWxlbWVudC5tYXJrZXIuY29kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNvZGVDb2x1bW4uY2xhc3NMaXN0LmFkZCgnY29kZS1sYWJlbCcpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuY29kZUNvbHVtbi50aXRsZSA9IGAke2VsZW1lbnQubWFya2VyLnNvdXJjZX0gKCR7ZWxlbWVudC5tYXJrZXIuY29kZX0pYDtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnNvdXJjZUxhYmVsLnNldChlbGVtZW50Lm1hcmtlci5zb3VyY2UsIGVsZW1lbnQuc291cmNlTWF0Y2hlcyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb2RlTGFiZWwuc2V0KGVsZW1lbnQubWFya2VyLmNvZGUsIGVsZW1lbnQuY29kZU1hdGNoZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNvZGVDb2x1bW4uY2xhc3NMaXN0LmFkZCgnY29kZS1saW5rJyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb2RlQ29sdW1uLnRpdGxlID0gYCR7ZWxlbWVudC5tYXJrZXIuc291cmNlfSAoJHtlbGVtZW50Lm1hcmtlci5jb2RlLnZhbHVlfSlgO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlTGFiZWwuc2V0KGVsZW1lbnQubWFya2VyLnNvdXJjZSwgZWxlbWVudC5zb3VyY2VNYXRjaGVzKTtcblxuXHRcdFx0XHRjb25zdCBjb2RlTGlua0xhYmVsID0gdGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwoJCgnLmNvZGUtbGluay1sYWJlbCcpKSk7XG5cdFx0XHRcdGNvZGVMaW5rTGFiZWwuc2V0KGVsZW1lbnQubWFya2VyLmNvZGUudmFsdWUsIGVsZW1lbnQuY29kZU1hdGNoZXMpO1xuXG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb2RlTGluay5saW5rID0ge1xuXHRcdFx0XHRcdGhyZWY6IGVsZW1lbnQubWFya2VyLmNvZGUudGFyZ2V0LnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0XHRcdHRpdGxlOiBlbGVtZW50Lm1hcmtlci5jb2RlLnRhcmdldC50b1N0cmluZyh0cnVlKSxcblx0XHRcdFx0XHRsYWJlbDogY29kZUxpbmtMYWJlbC5lbGVtZW50LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29kZUNvbHVtbi50aXRsZSA9ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnNvdXJjZUxhYmVsLnNldCgnLScpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElNYXJrZXJDb2RlQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTWFya2VyTWVzc2FnZUNvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8TWFya2VyVGFibGVJdGVtLCBJTWFya2VySGlnaGxpZ2h0ZWRMYWJlbENvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdtZXNzYWdlJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBNYXJrZXJNZXNzYWdlQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElNYXJrZXJIaWdobGlnaHRlZExhYmVsQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBjb2x1bW5FbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tZXNzYWdlJykpO1xuXHRcdGNvbnN0IGhpZ2hsaWdodGVkTGFiZWwgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChjb2x1bW5FbGVtZW50KTtcblxuXHRcdHJldHVybiB7IGNvbHVtbkVsZW1lbnQsIGhpZ2hsaWdodGVkTGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogTWFya2VyVGFibGVJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNYXJrZXJIaWdobGlnaHRlZExhYmVsQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbHVtbkVsZW1lbnQudGl0bGUgPSBlbGVtZW50Lm1hcmtlci5tZXNzYWdlO1xuXHRcdHRlbXBsYXRlRGF0YS5oaWdobGlnaHRlZExhYmVsLnNldChlbGVtZW50Lm1hcmtlci5tZXNzYWdlLCBlbGVtZW50Lm1lc3NhZ2VNYXRjaGVzKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElNYXJrZXJIaWdobGlnaHRlZExhYmVsQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmhpZ2hsaWdodGVkTGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1hcmtlckZpbGVDb2x1bW5SZW5kZXJlciBpbXBsZW1lbnRzIElUYWJsZVJlbmRlcmVyPE1hcmtlclRhYmxlSXRlbSwgSU1hcmtlckZpbGVDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnZmlsZSc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gTWFya2VyRmlsZUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElNYXJrZXJGaWxlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBjb2x1bW5FbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5maWxlJykpO1xuXHRcdGNvbnN0IGZpbGVMYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKGNvbHVtbkVsZW1lbnQpO1xuXHRcdGZpbGVMYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZpbGUtbGFiZWwnKTtcblx0XHRjb25zdCBwb3NpdGlvbkxhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwoY29sdW1uRWxlbWVudCk7XG5cdFx0cG9zaXRpb25MYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZpbGUtcG9zaXRpb24nKTtcblxuXHRcdHJldHVybiB7IGNvbHVtbkVsZW1lbnQsIGZpbGVMYWJlbCwgcG9zaXRpb25MYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBNYXJrZXJUYWJsZUl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1hcmtlckZpbGVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBwb3NpdGlvbkxhYmVsID0gTWVzc2FnZXMuTUFSS0VSU19QQU5FTF9BVF9MSU5FX0NPTF9OVU1CRVIoZWxlbWVudC5tYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCBlbGVtZW50Lm1hcmtlci5zdGFydENvbHVtbik7XG5cblx0XHR0ZW1wbGF0ZURhdGEuY29sdW1uRWxlbWVudC50aXRsZSA9IGAke3RoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGVsZW1lbnQubWFya2VyLnJlc291cmNlLCB7IHJlbGF0aXZlOiBmYWxzZSB9KX0gJHtwb3NpdGlvbkxhYmVsfWA7XG5cdFx0dGVtcGxhdGVEYXRhLmZpbGVMYWJlbC5zZXQodGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5tYXJrZXIucmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSksIGVsZW1lbnQuZmlsZU1hdGNoZXMpO1xuXHRcdHRlbXBsYXRlRGF0YS5wb3NpdGlvbkxhYmVsLnNldChwb3NpdGlvbkxhYmVsLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSU1hcmtlckZpbGVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZmlsZUxhYmVsLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEucG9zaXRpb25MYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTWFya2VyU291cmNlQ29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxNYXJrZXJUYWJsZUl0ZW0sIElNYXJrZXJIaWdobGlnaHRlZExhYmVsQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3NvdXJjZSc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gTWFya2VyU291cmNlQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElNYXJrZXJIaWdobGlnaHRlZExhYmVsQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBjb2x1bW5FbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zb3VyY2UnKSk7XG5cdFx0Y29uc3QgaGlnaGxpZ2h0ZWRMYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKGNvbHVtbkVsZW1lbnQpO1xuXHRcdHJldHVybiB7IGNvbHVtbkVsZW1lbnQsIGhpZ2hsaWdodGVkTGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogTWFya2VyVGFibGVJdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNYXJrZXJIaWdobGlnaHRlZExhYmVsQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbHVtbkVsZW1lbnQudGl0bGUgPSBlbGVtZW50Lm1hcmtlci5zb3VyY2UgPz8gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmhpZ2hsaWdodGVkTGFiZWwuc2V0KGVsZW1lbnQubWFya2VyLnNvdXJjZSA/PyAnJywgZWxlbWVudC5zb3VyY2VNYXRjaGVzKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElNYXJrZXJIaWdobGlnaHRlZExhYmVsQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmhpZ2hsaWdodGVkTGFiZWwuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIE1hcmtlcnNUYWJsZVZpcnR1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZTxNYXJrZXJUYWJsZUl0ZW0+IHtcblx0c3RhdGljIHJlYWRvbmx5IEhFQURFUl9ST1dfSEVJR0hUID0gMjQ7XG5cdHN0YXRpYyByZWFkb25seSBST1dfSEVJR0hUID0gMjQ7XG5cdHJlYWRvbmx5IGhlYWRlclJvd0hlaWdodCA9IE1hcmtlcnNUYWJsZVZpcnR1YWxEZWxlZ2F0ZS5IRUFERVJfUk9XX0hFSUdIVDtcblxuXHRnZXRIZWlnaHQoaXRlbTogTWFya2VyVGFibGVJdGVtKSB7XG5cdFx0cmV0dXJuIE1hcmtlcnNUYWJsZVZpcnR1YWxEZWxlZ2F0ZS5ST1dfSEVJR0hUO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJzVGFibGUgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByb2JsZW1zV2lkZ2V0IHtcblxuXHRwcml2YXRlIF9pdGVtQ291bnQ6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgdGFibGU6IFdvcmtiZW5jaFRhYmxlPE1hcmtlclRhYmxlSXRlbT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFya2Vyc1ZpZXdNb2RlbDogTWFya2Vyc1ZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlc291cmNlTWFya2VyczogUmVzb3VyY2VNYXJrZXJzW10sXG5cdFx0cHJpdmF0ZSBmaWx0ZXJPcHRpb25zOiBGaWx0ZXJPcHRpb25zLFxuXHRcdG9wdGlvbnM6IElXb3JrYmVuY2hUYWJsZU9wdGlvbnM8TWFya2VyVGFibGVJdGVtPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudGFibGUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRhYmxlLFxuXHRcdFx0J01hcmtlcnMnLFxuXHRcdFx0dGhpcy5jb250YWluZXIsXG5cdFx0XHRuZXcgTWFya2Vyc1RhYmxlVmlydHVhbERlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJycsXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0d2VpZ2h0OiAwLFxuXHRcdFx0XHRcdG1pbmltdW1XaWR0aDogMzYsXG5cdFx0XHRcdFx0bWF4aW11bVdpZHRoOiAzNixcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBNYXJrZXJTZXZlcml0eUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBNYXJrZXIpOiBNYXJrZXIgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvZGVDb2x1bW5MYWJlbCcsIFwiQ29kZVwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDEsXG5cdFx0XHRcdFx0bWluaW11bVdpZHRoOiAxMDAsXG5cdFx0XHRcdFx0bWF4aW11bVdpZHRoOiAzMDAsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogTWFya2VyQ29kZUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBNYXJrZXIpOiBNYXJrZXIgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21lc3NhZ2VDb2x1bW5MYWJlbCcsIFwiTWVzc2FnZVwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDQsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogTWFya2VyTWVzc2FnZUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBNYXJrZXIpOiBNYXJrZXIgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ZpbGVDb2x1bW5MYWJlbCcsIFwiRmlsZVwiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDIsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogTWFya2VyRmlsZUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBNYXJrZXIpOiBNYXJrZXIgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NvdXJjZUNvbHVtbkxhYmVsJywgXCJTb3VyY2VcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0d2VpZ2h0OiAxLFxuXHRcdFx0XHRcdG1pbmltdW1XaWR0aDogMTAwLFxuXHRcdFx0XHRcdG1heGltdW1XaWR0aDogMzAwLFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IE1hcmtlclNvdXJjZUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBNYXJrZXIpOiBNYXJrZXIgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2VyU2V2ZXJpdHlDb2x1bW5SZW5kZXJlciwgdGhpcy5tYXJrZXJzVmlld01vZGVsKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXJDb2RlQ29sdW1uUmVuZGVyZXIpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtlck1lc3NhZ2VDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFya2VyRmlsZUNvbHVtblJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYXJrZXJTb3VyY2VDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRdLFxuXHRcdFx0b3B0aW9uc1xuXHRcdCkgYXMgV29ya2JlbmNoVGFibGU8TWFya2VyVGFibGVJdGVtPjtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGxpc3QgPSB0aGlzLnRhYmxlLmRvbU5vZGUucXVlcnlTZWxlY3RvcignLm1vbmFjby1saXN0LXJvd3MnKSEgYXMgSFRNTEVsZW1lbnQ7XG5cblx0XHQvLyBtb3VzZW92ZXIvbW91c2VsZWF2ZSBldmVudCBoYW5kbGVyc1xuXHRcdGNvbnN0IG9uUm93SG92ZXIgPSBFdmVudC5jaGFpbih0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcihsaXN0LCAnbW91c2VvdmVyJykpLmV2ZW50LCAkID0+XG5cdFx0XHQkLm1hcChlID0+IERPTS5maW5kUGFyZW50V2l0aENsYXNzKGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50LCAnbW9uYWNvLWxpc3Qtcm93JywgJ21vbmFjby1saXN0LXJvd3MnKSlcblx0XHRcdFx0LmZpbHRlcjxIVE1MRWxlbWVudD4oZSA9PiAhIWUpXG5cdFx0XHRcdC5tYXAoZSA9PiBwYXJzZUludChlLmdldEF0dHJpYnV0ZSgnZGF0YS1pbmRleCcpISkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IG9uTGlzdExlYXZlID0gRXZlbnQubWFwKHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKGxpc3QsICdtb3VzZWxlYXZlJykpLmV2ZW50LCAoKSA9PiAtMSk7XG5cblx0XHRjb25zdCBvblJvd0hvdmVyT3JMZWF2ZSA9IEV2ZW50LmxhdGNoKEV2ZW50LmFueShvblJvd0hvdmVyLCBvbkxpc3RMZWF2ZSkpO1xuXHRcdGNvbnN0IG9uUm93UGVybWFuZW50SG92ZXIgPSBFdmVudC5kZWJvdW5jZShvblJvd0hvdmVyT3JMZWF2ZSwgKF8sIGUpID0+IGUsIDUwMCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihvblJvd1Blcm1hbmVudEhvdmVyKGUgPT4ge1xuXHRcdFx0aWYgKGUgIT09IC0xICYmIHRoaXMudGFibGUucm93KGUpKSB7XG5cdFx0XHRcdHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5vbk1hcmtlck1vdXNlSG92ZXIodGhpcy50YWJsZS5yb3coZSkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBjb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLnRhYmxlLmNvbnRleHRLZXlTZXJ2aWNlO1xuXHR9XG5cblx0Z2V0IG9uQ29udGV4dE1lbnUoKTogRXZlbnQ8SVRhYmxlQ29udGV4dE1lbnVFdmVudDxNYXJrZXJUYWJsZUl0ZW0+PiB7XG5cdFx0cmV0dXJuIHRoaXMudGFibGUub25Db250ZXh0TWVudTtcblx0fVxuXG5cdGdldCBvbkRpZE9wZW4oKTogRXZlbnQ8SU9wZW5FdmVudDxNYXJrZXJUYWJsZUl0ZW0gfCB1bmRlZmluZWQ+PiB7XG5cdFx0cmV0dXJuIHRoaXMudGFibGUub25EaWRPcGVuO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlRm9jdXMoKTogRXZlbnQ8SVRhYmxlRXZlbnQ8TWFya2VyVGFibGVJdGVtPj4ge1xuXHRcdHJldHVybiB0aGlzLnRhYmxlLm9uRGlkQ2hhbmdlRm9jdXM7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VTZWxlY3Rpb24oKTogRXZlbnQ8SVRhYmxlRXZlbnQ8TWFya2VyVGFibGVJdGVtPj4ge1xuXHRcdHJldHVybiB0aGlzLnRhYmxlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uO1xuXHR9XG5cblx0Y29sbGFwc2VNYXJrZXJzKCk6IHZvaWQgeyB9XG5cblx0ZG9tRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy50YWJsZS5kb21Gb2N1cygpO1xuXHR9XG5cblx0ZmlsdGVyTWFya2VycyhyZXNvdXJjZU1hcmtlcnM6IFJlc291cmNlTWFya2Vyc1tdLCBmaWx0ZXJPcHRpb25zOiBGaWx0ZXJPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5maWx0ZXJPcHRpb25zID0gZmlsdGVyT3B0aW9ucztcblx0XHR0aGlzLnJlc2V0KHJlc291cmNlTWFya2Vycyk7XG5cdH1cblxuXHRnZXRGb2N1cygpOiAoTWFya2VyVGFibGVJdGVtIHwgbnVsbClbXSB7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLnRhYmxlLmdldEZvY3VzKCk7XG5cdFx0cmV0dXJuIGZvY3VzLmxlbmd0aCA+IDAgPyBbLi4uZm9jdXMubWFwKGYgPT4gdGhpcy50YWJsZS5yb3coZikpXSA6IFtdO1xuXHR9XG5cblx0Z2V0SFRNTEVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLnRhYmxlLmdldEhUTUxFbGVtZW50KCk7XG5cdH1cblxuXHRnZXRSZWxhdGl2ZVRvcChtYXJrZXI6IE1hcmtlclRhYmxlSXRlbSB8IG51bGwpOiBudW1iZXIgfCBudWxsIHtcblx0XHRyZXR1cm4gbWFya2VyID8gdGhpcy50YWJsZS5nZXRSZWxhdGl2ZVRvcCh0aGlzLnRhYmxlLmluZGV4T2YobWFya2VyKSkgOiBudWxsO1xuXHR9XG5cblx0Z2V0U2VsZWN0aW9uKCk6IChNYXJrZXJUYWJsZUl0ZW0gfCBudWxsKVtdIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRhYmxlLmdldFNlbGVjdGlvbigpO1xuXHRcdHJldHVybiBzZWxlY3Rpb24ubGVuZ3RoID4gMCA/IFsuLi5zZWxlY3Rpb24ubWFwKGkgPT4gdGhpcy50YWJsZS5yb3coaSkpXSA6IFtdO1xuXHR9XG5cblx0Z2V0VmlzaWJsZUl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtQ291bnQ7XG5cdH1cblxuXHRpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbicpO1xuXHR9XG5cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR0aGlzLnRhYmxlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHJlc2V0KHJlc291cmNlTWFya2VyczogUmVzb3VyY2VNYXJrZXJzW10pOiB2b2lkIHtcblx0XHR0aGlzLnJlc291cmNlTWFya2VycyA9IHJlc291cmNlTWFya2VycztcblxuXHRcdGNvbnN0IGl0ZW1zOiBNYXJrZXJUYWJsZUl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2VNYXJrZXIgb2YgdGhpcy5yZXNvdXJjZU1hcmtlcnMpIHtcblx0XHRcdGZvciAoY29uc3QgbWFya2VyIG9mIHJlc291cmNlTWFya2VyLm1hcmtlcnMpIHtcblx0XHRcdFx0aWYgKHVuc3VwcG9ydGVkU2NoZW1hcy5oYXMobWFya2VyLnJlc291cmNlLnNjaGVtZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEV4Y2x1ZGUgcGF0dGVyblxuXHRcdFx0XHRpZiAodGhpcy5maWx0ZXJPcHRpb25zLmV4Y2x1ZGVzTWF0Y2hlci5tYXRjaGVzKG1hcmtlci5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEluY2x1ZGUgcGF0dGVyblxuXHRcdFx0XHRpZiAodGhpcy5maWx0ZXJPcHRpb25zLmluY2x1ZGVzTWF0Y2hlci5tYXRjaGVzKG1hcmtlci5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKG5ldyBNYXJrZXJUYWJsZUl0ZW0obWFya2VyKSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTZXZlcml0eSBmaWx0ZXJcblx0XHRcdFx0Y29uc3QgbWF0Y2hlc1NldmVyaXR5ID0gdGhpcy5maWx0ZXJPcHRpb25zLnNob3dFcnJvcnMgJiYgTWFya2VyU2V2ZXJpdHkuRXJyb3IgPT09IG1hcmtlci5tYXJrZXIuc2V2ZXJpdHkgfHxcblx0XHRcdFx0XHR0aGlzLmZpbHRlck9wdGlvbnMuc2hvd1dhcm5pbmdzICYmIE1hcmtlclNldmVyaXR5Lldhcm5pbmcgPT09IG1hcmtlci5tYXJrZXIuc2V2ZXJpdHkgfHxcblx0XHRcdFx0XHR0aGlzLmZpbHRlck9wdGlvbnMuc2hvd0luZm9zICYmIE1hcmtlclNldmVyaXR5LkluZm8gPT09IG1hcmtlci5tYXJrZXIuc2V2ZXJpdHk7XG5cblx0XHRcdFx0aWYgKCFtYXRjaGVzU2V2ZXJpdHkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNvdXJjZSBmaWx0ZXJzXG5cdFx0XHRcdGlmICghdGhpcy5maWx0ZXJPcHRpb25zLm1hdGNoZXNTb3VyY2VGaWx0ZXJzKG1hcmtlci5tYXJrZXIuc291cmNlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVGV4dCBmaWx0ZXJcblx0XHRcdFx0aWYgKHRoaXMuZmlsdGVyT3B0aW9ucy50ZXh0RmlsdGVyLnRleHQpIHtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2VNYXRjaGVzID0gbWFya2VyLm1hcmtlci5zb3VyY2UgPyBGaWx0ZXJPcHRpb25zLl9maWx0ZXIodGhpcy5maWx0ZXJPcHRpb25zLnRleHRGaWx0ZXIudGV4dCwgbWFya2VyLm1hcmtlci5zb3VyY2UpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBjb2RlTWF0Y2hlcyA9IG1hcmtlci5tYXJrZXIuY29kZSA/IEZpbHRlck9wdGlvbnMuX2ZpbHRlcih0aGlzLmZpbHRlck9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCB0eXBlb2YgbWFya2VyLm1hcmtlci5jb2RlID09PSAnc3RyaW5nJyA/IG1hcmtlci5tYXJrZXIuY29kZSA6IG1hcmtlci5tYXJrZXIuY29kZS52YWx1ZSkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2VNYXRjaGVzID0gRmlsdGVyT3B0aW9ucy5fbWVzc2FnZUZpbHRlcih0aGlzLmZpbHRlck9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCBtYXJrZXIubWFya2VyLm1lc3NhZ2UpID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBmaWxlTWF0Y2hlcyA9IEZpbHRlck9wdGlvbnMuX21lc3NhZ2VGaWx0ZXIodGhpcy5maWx0ZXJPcHRpb25zLnRleHRGaWx0ZXIudGV4dCwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwobWFya2VyLnJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pKSA/PyB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRjb25zdCBtYXRjaGVkID0gc291cmNlTWF0Y2hlcyB8fCBjb2RlTWF0Y2hlcyB8fCBtZXNzYWdlTWF0Y2hlcyB8fCBmaWxlTWF0Y2hlcztcblx0XHRcdFx0XHRpZiAoKG1hdGNoZWQgJiYgIXRoaXMuZmlsdGVyT3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSkgfHwgKCFtYXRjaGVkICYmIHRoaXMuZmlsdGVyT3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSkpIHtcblx0XHRcdFx0XHRcdGl0ZW1zLnB1c2gobmV3IE1hcmtlclRhYmxlSXRlbShtYXJrZXIsIHNvdXJjZU1hdGNoZXMsIGNvZGVNYXRjaGVzLCBtZXNzYWdlTWF0Y2hlcywgZmlsZU1hdGNoZXMpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGl0ZW1zLnB1c2gobmV3IE1hcmtlclRhYmxlSXRlbShtYXJrZXIpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5faXRlbUNvdW50ID0gaXRlbXMubGVuZ3RoO1xuXHRcdHRoaXMudGFibGUuc3BsaWNlKDAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgaXRlbXMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0bGV0IHJlc3VsdCA9IE1hcmtlclNldmVyaXR5LmNvbXBhcmUoYS5tYXJrZXIuc2V2ZXJpdHksIGIubWFya2VyLnNldmVyaXR5KTtcblxuXHRcdFx0aWYgKHJlc3VsdCA9PT0gMCkge1xuXHRcdFx0XHRyZXN1bHQgPSBjb21wYXJlTWFya2Vyc0J5VXJpKGEubWFya2VyLCBiLm1hcmtlcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQgPT09IDApIHtcblx0XHRcdFx0cmVzdWx0ID0gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEubWFya2VyLCBiLm1hcmtlcik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSkpO1xuXHR9XG5cblx0cmV2ZWFsTWFya2VycyhhY3RpdmVSZXNvdXJjZTogUmVzb3VyY2VNYXJrZXJzIHwgbnVsbCwgZm9jdXM6IGJvb2xlYW4sIGxhc3RTZWxlY3RlZFJlbGF0aXZlVG9wOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoYWN0aXZlUmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVJlc291cmNlSW5kZXggPSB0aGlzLnJlc291cmNlTWFya2Vycy5pbmRleE9mKGFjdGl2ZVJlc291cmNlKTtcblxuXHRcdFx0aWYgKGFjdGl2ZVJlc291cmNlSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdGlmICh0aGlzLmhhc1NlbGVjdGVkTWFya2VyRm9yKGFjdGl2ZVJlc291cmNlKSkge1xuXHRcdFx0XHRcdGNvbnN0IHRhYmxlU2VsZWN0aW9uID0gdGhpcy50YWJsZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0XHR0aGlzLnRhYmxlLnJldmVhbCh0YWJsZVNlbGVjdGlvblswXSwgbGFzdFNlbGVjdGVkUmVsYXRpdmVUb3ApO1xuXG5cdFx0XHRcdFx0aWYgKGZvY3VzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRhYmxlLnNldEZvY3VzKHRhYmxlU2VsZWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy50YWJsZS5yZXZlYWwoYWN0aXZlUmVzb3VyY2VJbmRleCwgMCk7XG5cblx0XHRcdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0XHRcdHRoaXMudGFibGUuc2V0Rm9jdXMoW2FjdGl2ZVJlc291cmNlSW5kZXhdKTtcblx0XHRcdFx0XHRcdHRoaXMudGFibGUuc2V0U2VsZWN0aW9uKFthY3RpdmVSZXNvdXJjZUluZGV4XSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChmb2N1cykge1xuXHRcdFx0dGhpcy50YWJsZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0dGhpcy50YWJsZS5mb2N1c0ZpcnN0KCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0QXJpYUxhYmVsKGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRhYmxlLmRvbU5vZGUuYXJpYUxhYmVsID0gbGFiZWw7XG5cdH1cblxuXHRzZXRNYXJrZXJTZWxlY3Rpb24oc2VsZWN0aW9uPzogTWFya2VyW10sIGZvY3VzPzogTWFya2VyW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0aWYgKHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLnRhYmxlLnNldFNlbGVjdGlvbihzZWxlY3Rpb24ubWFwKG0gPT4gdGhpcy5maW5kTWFya2VySW5kZXgobSkpKTtcblxuXHRcdFx0XHRpZiAoZm9jdXMgJiYgZm9jdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMudGFibGUuc2V0Rm9jdXMoZm9jdXMubWFwKGYgPT4gdGhpcy5maW5kTWFya2VySW5kZXgoZikpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnRhYmxlLnNldEZvY3VzKFt0aGlzLmZpbmRNYXJrZXJJbmRleChzZWxlY3Rpb25bMF0pXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLnRhYmxlLnJldmVhbCh0aGlzLmZpbmRNYXJrZXJJbmRleChzZWxlY3Rpb25bMF0pKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5nZXRTZWxlY3Rpb24oKS5sZW5ndGggPT09IDAgJiYgdGhpcy5nZXRWaXNpYmxlSXRlbUNvdW50KCkgPiAwKSB7XG5cdFx0XHRcdHRoaXMudGFibGUuc2V0U2VsZWN0aW9uKFswXSk7XG5cdFx0XHRcdHRoaXMudGFibGUuc2V0Rm9jdXMoWzBdKTtcblx0XHRcdFx0dGhpcy50YWJsZS5yZXZlYWwoMCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlVmlzaWJpbGl0eShoaWRlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgaGlkZSk7XG5cdH1cblxuXHR1cGRhdGUocmVzb3VyY2VNYXJrZXJzOiBSZXNvdXJjZU1hcmtlcnNbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2VNYXJrZXIgb2YgcmVzb3VyY2VNYXJrZXJzKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMucmVzb3VyY2VNYXJrZXJzLmluZGV4T2YocmVzb3VyY2VNYXJrZXIpO1xuXHRcdFx0dGhpcy5yZXNvdXJjZU1hcmtlcnMuc3BsaWNlKGluZGV4LCAxLCByZXNvdXJjZU1hcmtlcik7XG5cdFx0fVxuXHRcdHRoaXMucmVzZXQodGhpcy5yZXNvdXJjZU1hcmtlcnMpO1xuXHR9XG5cblx0dXBkYXRlTWFya2VyKG1hcmtlcjogTWFya2VyKTogdm9pZCB7XG5cdFx0dGhpcy50YWJsZS5yZXJlbmRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kTWFya2VySW5kZXgobWFya2VyOiBNYXJrZXIpOiBudW1iZXIge1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCB0aGlzLnRhYmxlLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0aWYgKHRoaXMudGFibGUucm93KGluZGV4KS5tYXJrZXIgPT09IG1hcmtlci5tYXJrZXIpIHtcblx0XHRcdFx0cmV0dXJuIGluZGV4O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdHByaXZhdGUgaGFzU2VsZWN0ZWRNYXJrZXJGb3IocmVzb3VyY2U6IFJlc291cmNlTWFya2Vycyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlbGVjdGVkRWxlbWVudCA9IHRoaXMuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHNlbGVjdGVkRWxlbWVudCAmJiBzZWxlY3RlZEVsZW1lbnQubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKHNlbGVjdGVkRWxlbWVudFswXSBpbnN0YW5jZW9mIE1hcmtlcikge1xuXHRcdFx0XHRpZiAocmVzb3VyY2UuaGFzKCg8TWFya2VyPnNlbGVjdGVkRWxlbWVudFswXSkubWFya2VyLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksU0FBUztBQUNyQixTQUFTLGFBQWE7QUFFdEIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUE2QyxzQkFBc0I7QUFDbkUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBcUIsUUFBUSx1QkFBd0M7QUFDOUUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsZ0JBQWdCLDhCQUE4QjtBQUN2RCxTQUFTLGtCQUFrQjtBQUMzQixPQUFPLGNBQWM7QUFDckIsU0FBUyx5QkFBeUI7QUFHbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsMEJBQTBCO0FBQ25DLE9BQU8sY0FBYztBQUNyQixTQUFTLHFCQUFxQjtBQUU5QixNQUFNLElBQUksSUFBSTtBQTRCZCxJQUFNLCtCQUFOLE1BQTZHO0FBQUEsRUFNNUcsWUFDa0Isa0JBQ3VCLHNCQUN2QztBQUZnQjtBQUN1QjtBQUp6QyxTQUFTLGFBQXFCLDZCQUE2QjtBQUFBLEVBS3ZEO0FBQUEsRUFFSixlQUFlLFdBQXVEO0FBQ3JFLFVBQU0saUJBQWlCLElBQUksT0FBTyxXQUFXLEVBQUUsV0FBVyxDQUFDO0FBQzNELFVBQU0sT0FBTyxJQUFJLE9BQU8sZ0JBQWdCLEVBQUUsRUFBRSxDQUFD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
