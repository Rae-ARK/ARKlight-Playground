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
import * as dom from "../../../../base/browser/dom.js";
import * as paths from "../../../../base/common/path.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { ResourceMarkers, Marker, RelatedInformation, MarkerTableItem } from "./markersModel.js";
import Messages from "./messages.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { dispose, Disposable, toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { QuickFixAction, QuickFixActionViewItem } from "./markersViewActions.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { basename, isEqual } from "../../../../base/common/resources.js";
import { TreeVisibility } from "../../../../base/browser/ui/tree/tree.js";
import { FilterOptions } from "./markersFilterOptions.js";
import { Emitter } from "../../../../base/common/event.js";
import { isUndefinedOrNull } from "../../../../base/common/types.js";
import { Action, toAction } from "../../../../base/common/actions.js";
import { localize } from "../../../../nls.js";
import { createCancelablePromise, Delayer } from "../../../../base/common/async.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Range } from "../../../../editor/common/core/range.js";
import { applyCodeAction, ApplyCodeActionReason, getCodeActions } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionKind, CodeActionTriggerSource } from "../../../../editor/contrib/codeAction/common/types.js";
import { IEditorService, ACTIVE_GROUP } from "../../../services/editor/common/editorService.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { CodeActionTriggerType } from "../../../../editor/common/languages.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Link } from "../../../../platform/opener/browser/link.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { MarkersContextKeys, MarkersViewMode } from "../common/markers.js";
import { unsupportedSchemas } from "../../../../platform/markers/common/markerService.js";
import { defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import Severity from "../../../../base/common/severity.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
let MarkersWidgetAccessibilityProvider = class {
  constructor(labelService) {
    this.labelService = labelService;
  }
  getWidgetAriaLabel() {
    return localize("problemsView", "Problems View");
  }
  getAriaLabel(element) {
    if (element instanceof ResourceMarkers) {
      const path = this.labelService.getUriLabel(element.resource, { relative: true }) || element.resource.fsPath;
      return Messages.MARKERS_TREE_ARIA_LABEL_RESOURCE(element.markers.length, element.name, paths.dirname(path));
    }
    if (element instanceof Marker || element instanceof MarkerTableItem) {
      return Messages.MARKERS_TREE_ARIA_LABEL_MARKER(element);
    }
    if (element instanceof RelatedInformation) {
      return Messages.MARKERS_TREE_ARIA_LABEL_RELATED_INFORMATION(element.raw);
    }
    return null;
  }
};
MarkersWidgetAccessibilityProvider = __decorateClass([
  __decorateParam(0, ILabelService)
], MarkersWidgetAccessibilityProvider);
var TemplateId = /* @__PURE__ */ ((TemplateId2) => {
  TemplateId2["ResourceMarkers"] = "rm";
  TemplateId2["Marker"] = "m";
  TemplateId2["RelatedInformation"] = "ri";
  return TemplateId2;
})(TemplateId || {});
const _VirtualDelegate = class _VirtualDelegate {
  constructor(markersViewState) {
    this.markersViewState = markersViewState;
  }
  getHeight(element) {
    if (element instanceof Marker) {
      const viewModel = this.markersViewState.getViewModel(element);
      const noOfLines = !viewModel || viewModel.multiline ? element.lines.length : 1;
      return noOfLines * _VirtualDelegate.LINE_HEIGHT;
    }
    return _VirtualDelegate.LINE_HEIGHT;
  }
  getTemplateId(element) {
    if (element instanceof ResourceMarkers) {
      return "rm" /* ResourceMarkers */;
    } else if (element instanceof Marker) {
      return "m" /* Marker */;
    } else {
      return "ri" /* RelatedInformation */;
    }
  }
};
_VirtualDelegate.LINE_HEIGHT = 22;
let VirtualDelegate = _VirtualDelegate;
var FilterDataType = /* @__PURE__ */ ((FilterDataType2) => {
  FilterDataType2[FilterDataType2["ResourceMarkers"] = 0] = "ResourceMarkers";
  FilterDataType2[FilterDataType2["Marker"] = 1] = "Marker";
  FilterDataType2[FilterDataType2["RelatedInformation"] = 2] = "RelatedInformation";
  return FilterDataType2;
})(FilterDataType || {});
class ResourceMarkersRenderer {
  constructor(labels, onDidChangeRenderNodeCount) {
    this.labels = labels;
    this.renderedNodes = /* @__PURE__ */ new Map();
    this.disposables = new DisposableStore();
    this.templateId = "rm" /* ResourceMarkers */;
    onDidChangeRenderNodeCount(this.onDidChangeRenderNodeCount, this, this.disposables);
  }
  renderTemplate(container) {
    const resourceLabelContainer = dom.append(container, dom.$(".resource-label-container"));
    const resourceLabel = this.labels.create(resourceLabelContainer, { supportHighlights: true });
    const badgeWrapper = dom.append(container, dom.$(".count-badge-wrapper"));
    const count = new CountBadge(badgeWrapper, {}, defaultCountBadgeStyles);
    return { count, resourceLabel };
  }
  renderElement(node, _, templateData) {
    const resourceMarkers = node.element;
    const uriMatches = node.filterData && node.filterData.uriMatches || [];
    templateData.resourceLabel.setFile(resourceMarkers.resource, { matches: uriMatches });
    this.updateCount(node, templateData);
    const nodeRenders = this.renderedNodes.get(resourceMarkers) ?? [];
    this.renderedNodes.set(resourceMarkers, [...nodeRenders, templateData]);
  }
  disposeElement(node, index, templateData) {
    const nodeRenders = this.renderedNodes.get(node.element) ?? [];
    const nodeRenderIndex = nodeRenders.findIndex((nodeRender) => templateData === nodeRender);
    if (nodeRenderIndex < 0) {
      throw new Error("Disposing unknown resource marker");
    }
    if (nodeRenders.length === 1) {
      this.renderedNodes.delete(node.element);
    } else {
      nodeRenders.splice(nodeRenderIndex, 1);
    }
  }
  disposeTemplate(templateData) {
    templateData.resourceLabel.dispose();
    templateData.count.dispose();
  }
  onDidChangeRenderNodeCount(node) {
    const nodeRenders = this.renderedNodes.get(node.element);
    if (!nodeRenders) {
      return;
    }
    nodeRenders.forEach((nodeRender) => this.updateCount(node, nodeRender));
  }
  updateCount(node, templateData) {
    templateData.count.setCount(node.children.reduce((r, n) => r + (n.visible ? 1 : 0), 0));
  }
  dispose() {
    this.disposables.dispose();
  }
}
class FileResourceMarkersRenderer extends ResourceMarkersRenderer {
}
let MarkerRenderer = class {
  constructor(markersViewState, hoverService, instantiationService, openerService) {
    this.markersViewState = markersViewState;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.templateId = "m" /* Marker */;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.markerWidget = new MarkerWidget(container, this.markersViewState, this.hoverService, this.openerService, this.instantiationService);
    return data;
  }
  renderElement(node, _, templateData) {
    templateData.markerWidget.render(node.element, node.filterData);
  }
  disposeTemplate(templateData) {
    templateData.markerWidget.dispose();
  }
};
MarkerRenderer = __decorateClass([
  __decorateParam(1, IHoverService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IOpenerService)
], MarkerRenderer);
const expandedIcon = registerIcon("markers-view-multi-line-expanded", Codicon.chevronUp, localize("expandedIcon", "Icon indicating that multiple lines are shown in the markers view."));
const collapsedIcon = registerIcon("markers-view-multi-line-collapsed", Codicon.chevronDown, localize("collapsedIcon", "Icon indicating that multiple lines are collapsed in the markers view."));
const toggleMultilineAction = "problems.action.toggleMultiline";
class ToggleMultilineActionViewItem extends ActionViewItem {
  render(container) {
    super.render(container);
    this.updateExpandedAttribute();
  }
  updateClass() {
    super.updateClass();
    this.updateExpandedAttribute();
  }
  updateExpandedAttribute() {
    this.element?.setAttribute("aria-expanded", `${this._action.class === ThemeIcon.asClassName(expandedIcon)}`);
  }
}
class MarkerWidget extends Disposable {
  constructor(parent, markersViewModel, _hoverService, _openerService, _instantiationService) {
    super();
    this.parent = parent;
    this.markersViewModel = markersViewModel;
    this._hoverService = _hoverService;
    this._openerService = _openerService;
    this.disposables = this._register(new DisposableStore());
    this.actionBar = this._register(new ActionBar(dom.append(parent, dom.$(".actions")), {
      actionViewItemProvider: (action, options) => action.id === QuickFixAction.ID ? _instantiationService.createInstance(QuickFixActionViewItem, action, options) : void 0
    }));
    this.iconContainer = dom.append(parent, dom.$(""));
    this.icon = dom.append(this.iconContainer, dom.$(""));
    this.messageAndDetailsContainer = dom.append(parent, dom.$(".marker-message-details-container"));
    this.messageAndDetailsContainerHover = this._register(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.messageAndDetailsContainer, ""));
  }
  render(element, filterData) {
    this.actionBar.clear();
    this.disposables.clear();
    dom.clearNode(this.messageAndDetailsContainer);
    this.iconContainer.className = `marker-icon ${Severity.toString(MarkerSeverity.toSeverity(element.marker.severity))}`;
    this.icon.className = `codicon ${SeverityIcon.className(MarkerSeverity.toSeverity(element.marker.severity))}`;
    this.renderQuickfixActionbar(element);
    this.renderMessageAndDetails(element, filterData);
    this.disposables.add(dom.addDisposableListener(this.parent, dom.EventType.MOUSE_OVER, () => this.markersViewModel.onMarkerMouseHover(element)));
    this.disposables.add(dom.addDisposableListener(this.parent, dom.EventType.MOUSE_LEAVE, () => this.markersViewModel.onMarkerMouseLeave(element)));
  }
  renderQuickfixActionbar(marker) {
    const viewModel = this.markersViewModel.getViewModel(marker);
    if (viewModel) {
      const quickFixAction = viewModel.quickFixAction;
      this.actionBar.push([quickFixAction], { icon: true, label: false });
      this.iconContainer.classList.toggle("quickFix", quickFixAction.enabled);
      quickFixAction.onDidChange(({ enabled }) => {
        if (!isUndefinedOrNull(enabled)) {
          this.iconContainer.classList.toggle("quickFix", enabled);
        }
      }, this, this.disposables);
      quickFixAction.onShowQuickFixes(() => {
        const quickFixActionViewItem = this.actionBar.viewItems[0];
        if (quickFixActionViewItem) {
          quickFixActionViewItem.showQuickFixes();
        }
      }, this, this.disposables);
    }
  }
  renderMultilineActionbar(marker, parent) {
    const multilineActionbar = this.disposables.add(new ActionBar(dom.append(parent, dom.$(".multiline-actions")), {
      actionViewItemProvider: (action2, options) => {
        if (action2.id === toggleMultilineAction) {
          return new ToggleMultilineActionViewItem(void 0, action2, { ...options, icon: true });
        }
        return void 0;
      }
    }));
    this.disposables.add(multilineActionbar);
    const viewModel = this.markersViewModel.getViewModel(marker);
    const multiline = viewModel && viewModel.multiline;
    const action = this.disposables.add(new Action(toggleMultilineAction));
    action.enabled = !!viewModel && marker.lines.length > 1;
    action.tooltip = multiline ? localize("single line", "Show message in single line") : localize("multi line", "Show message in multiple lines");
    action.class = ThemeIcon.asClassName(multiline ? expandedIcon : collapsedIcon);
    action.run = () => {
      if (viewModel) {
        viewModel.multiline = !viewModel.multiline;
      }
      return Promise.resolve();
    };
    multilineActionbar.push([action], { icon: true, label: false });
  }
  renderMessageAndDetails(element, filterData) {
    const { marker, lines } = element;
    const viewState = this.markersViewModel.getViewModel(element);
    const multiline = !viewState || viewState.multiline;
    const lineMatches = filterData && filterData.lineMatches || [];
    this.messageAndDetailsContainerHover.update(element.marker.message);
    const lineElements = [];
    for (let index = 0; index < (multiline ? lines.length : 1); index++) {
      const lineElement = dom.append(this.messageAndDetailsContainer, dom.$(".marker-message-line"));
      const messageElement = dom.append(lineElement, dom.$(".marker-message"));
      const highlightedLabel = this.disposables.add(new HighlightedLabel(messageElement));
      highlightedLabel.set(lines[index].length > 1e3 ? `${lines[index].substring(0, 1e3)}...` : lines[index], lineMatches[index]);
      if (lines[index] === "") {
        lineElement.style.height = `${VirtualDelegate.LINE_HEIGHT}px`;
      }
      lineElements.push(lineElement);
    }
    this.renderDetails(marker, filterData, lineElements[0]);
    this.renderMultilineActionbar(element, lineElements[0]);
  }
  renderDetails(marker, filterData, parent) {
    parent.classList.add("details-container");
    if (marker.source || marker.code) {
      const source = this.disposables.add(new HighlightedLabel(dom.append(parent, dom.$(".marker-source"))));
      const sourceMatches = filterData && filterData.sourceMatches || [];
      source.set(marker.source, sourceMatches);
      if (marker.code) {
        if (typeof marker.code === "string") {
          const code = this.disposables.add(new HighlightedLabel(dom.append(parent, dom.$(".marker-code"))));
          const codeMatches = filterData && filterData.codeMatches || [];
          code.set(marker.code, codeMatches);
        } else {
          const container = dom.$(".marker-code");
          const code = this.disposables.add(new HighlightedLabel(container));
          const link = marker.code.target.toString(true);
          this.disposables.add(new Link(parent, { href: link, label: container, title: link }, void 0, this._hoverService, this._openerService));
          const codeMatches = filterData && filterData.codeMatches || [];
          code.set(marker.code.value, codeMatches);
        }
      }
    }
    const lnCol = dom.append(parent, dom.$("span.marker-line"));
    lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(marker.startLineNumber, marker.startColumn);
  }
}
let RelatedInformationRenderer = class {
  constructor(labelService) {
    this.labelService = labelService;
    this.templateId = "ri" /* RelatedInformation */;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    dom.append(container, dom.$(".actions"));
    dom.append(container, dom.$(".icon"));
    data.resourceLabel = new HighlightedLabel(dom.append(container, dom.$(".related-info-resource")));
    data.lnCol = dom.append(container, dom.$("span.marker-line"));
    const separator = dom.append(container, dom.$("span.related-info-resource-separator"));
    separator.textContent = ":";
    separator.style.paddingRight = "4px";
    data.description = new HighlightedLabel(dom.append(container, dom.$(".marker-description")));
    return data;
  }
  renderElement(node, _, templateData) {
    const relatedInformation = node.element.raw;
    const uriMatches = node.filterData && node.filterData.uriMatches || [];
    const messageMatches = node.filterData && node.filterData.messageMatches || [];
    const resourceLabelTitle = this.labelService.getUriLabel(relatedInformation.resource, { relative: true });
    templateData.resourceLabel.set(basename(relatedInformation.resource), uriMatches, resourceLabelTitle);
    templateData.lnCol.textContent = Messages.MARKERS_PANEL_AT_LINE_COL_NUMBER(relatedInformation.startLineNumber, relatedInformation.startColumn);
    templateData.description.set(relatedInformation.message, messageMatches, relatedInformation.message);
  }
  disposeTemplate(templateData) {
    templateData.resourceLabel.dispose();
    templateData.description.dispose();
  }
};
RelatedInformationRenderer = __decorateClass([
  __decorateParam(0, ILabelService)
], RelatedInformationRenderer);
class Filter {
  constructor(options) {
    this.options = options;
  }
  filter(element, parentVisibility) {
    if (element instanceof ResourceMarkers) {
      return this.filterResourceMarkers(element);
    } else if (element instanceof Marker) {
      return this.filterMarker(element, parentVisibility);
    } else {
      return this.filterRelatedInformation(element, parentVisibility);
    }
  }
  filterResourceMarkers(resourceMarkers) {
    if (unsupportedSchemas.has(resourceMarkers.resource.scheme)) {
      return false;
    }
    if (this.options.excludesMatcher.matches(resourceMarkers.resource)) {
      return false;
    }
    if (this.options.includesMatcher.matches(resourceMarkers.resource)) {
      return true;
    }
    if (this.options.textFilter.text && !this.options.textFilter.negate) {
      const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(resourceMarkers.resource));
      if (uriMatches) {
        return { visibility: true, data: { type: 0 /* ResourceMarkers */, uriMatches: uriMatches || [] } };
      }
    }
    return TreeVisibility.Recurse;
  }
  filterMarker(marker, parentVisibility) {
    const matchesSeverity = this.options.showErrors && MarkerSeverity.Error === marker.marker.severity || this.options.showWarnings && MarkerSeverity.Warning === marker.marker.severity || this.options.showInfos && MarkerSeverity.Info === marker.marker.severity;
    if (!matchesSeverity) {
      return false;
    }
    if (!this.options.matchesSourceFilters(marker.marker.source)) {
      return false;
    }
    if (!this.options.textFilter.text) {
      return true;
    }
    const lineMatches = [];
    for (const line of marker.lines) {
      const lineMatch = FilterOptions._messageFilter(this.options.textFilter.text, line);
      lineMatches.push(lineMatch || []);
    }
    const sourceMatches = marker.marker.source ? FilterOptions._filter(this.options.textFilter.text, marker.marker.source) : void 0;
    const codeMatches = marker.marker.code ? FilterOptions._filter(this.options.textFilter.text, typeof marker.marker.code === "string" ? marker.marker.code : marker.marker.code.value) : void 0;
    const matched = sourceMatches || codeMatches || lineMatches.some((lineMatch) => lineMatch.length > 0);
    if (matched && !this.options.textFilter.negate) {
      return { visibility: true, data: { type: 1 /* Marker */, lineMatches, sourceMatches: sourceMatches || [], codeMatches: codeMatches || [] } };
    }
    if (matched && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return false;
    }
    if (!matched && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return true;
    }
    return parentVisibility;
  }
  filterRelatedInformation(relatedInformation, parentVisibility) {
    if (!this.options.textFilter.text) {
      return true;
    }
    const uriMatches = FilterOptions._filter(this.options.textFilter.text, basename(relatedInformation.raw.resource));
    const messageMatches = FilterOptions._messageFilter(this.options.textFilter.text, paths.basename(relatedInformation.raw.message));
    const matched = uriMatches || messageMatches;
    if (matched && !this.options.textFilter.negate) {
      return { visibility: true, data: { type: 2 /* RelatedInformation */, uriMatches: uriMatches || [], messageMatches: messageMatches || [] } };
    }
    if (matched && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return false;
    }
    if (!matched && this.options.textFilter.negate && parentVisibility === TreeVisibility.Recurse) {
      return true;
    }
    return parentVisibility;
  }
}
let MarkerViewModel = class extends Disposable {
  constructor(marker, modelService, instantiationService, editorService, languageFeaturesService) {
    super();
    this.marker = marker;
    this.modelService = modelService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.languageFeaturesService = languageFeaturesService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.modelPromise = null;
    this.codeActionsPromise = null;
    this._multiline = true;
    this._quickFixAction = null;
    this._register(toDisposable(() => {
      if (this.modelPromise) {
        this.modelPromise.cancel();
      }
      if (this.codeActionsPromise) {
        this.codeActionsPromise.cancel();
      }
    }));
  }
  get multiline() {
    return this._multiline;
  }
  set multiline(value) {
    if (this._multiline !== value) {
      this._multiline = value;
      this._onDidChange.fire();
    }
  }
  get quickFixAction() {
    if (!this._quickFixAction) {
      this._quickFixAction = this._register(this.instantiationService.createInstance(QuickFixAction, this.marker));
    }
    return this._quickFixAction;
  }
  showLightBulb() {
    this.setQuickFixes(true);
  }
  async setQuickFixes(waitForModel) {
    const codeActions = await this.getCodeActions(waitForModel);
    this.quickFixAction.quickFixes = codeActions ? this.toActions(codeActions) : [];
    this.quickFixAction.autoFixable(!!codeActions && codeActions.hasAutoFix);
  }
  getCodeActions(waitForModel) {
    if (this.codeActionsPromise !== null) {
      return this.codeActionsPromise;
    }
    return this.getModel(waitForModel).then((model) => {
      if (model) {
        if (!this.codeActionsPromise) {
          this.codeActionsPromise = createCancelablePromise((cancellationToken) => {
            return getCodeActions(this.languageFeaturesService.codeActionProvider, model, new Range(this.marker.range.startLineNumber, this.marker.range.startColumn, this.marker.range.endLineNumber, this.marker.range.endColumn), {
              type: CodeActionTriggerType.Invoke,
              triggerAction: CodeActionTriggerSource.ProblemsView,
              filter: { include: CodeActionKind.QuickFix }
            }, Progress.None, cancellationToken).then((actions) => {
              return this._register(actions);
            });
          });
        }
        return this.codeActionsPromise;
      }
      return null;
    });
  }
  toActions(codeActions) {
    return codeActions.validActions.map((item) => toAction({
      id: item.action.command ? item.action.command.id : item.action.title,
      label: item.action.title,
      run: async () => {
        await this.openFileAtMarker(this.marker);
        return await this.instantiationService.invokeFunction(applyCodeAction, item, ApplyCodeActionReason.FromProblemsView);
      }
    }));
  }
  openFileAtMarker(element) {
    const { resource, selection } = { resource: element.resource, selection: element.range };
    return this.editorService.openEditor({
      resource,
      options: {
        selection,
        preserveFocus: true,
        pinned: false,
        revealIfVisible: true
      }
    }, ACTIVE_GROUP).then(() => void 0);
  }
  getModel(waitForModel) {
    const model = this.modelService.getModel(this.marker.resource);
    if (model) {
      return Promise.resolve(model);
    }
    if (waitForModel) {
      if (!this.modelPromise) {
        this.modelPromise = createCancelablePromise((cancellationToken) => {
          return new Promise((c) => {
            this._register(this.modelService.onModelAdded((model2) => {
              if (isEqual(model2.uri, this.marker.resource)) {
                c(model2);
              }
            }));
          });
        });
      }
      return this.modelPromise;
    }
    return Promise.resolve(null);
  }
};
MarkerViewModel = __decorateClass([
  __decorateParam(1, IModelService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, ILanguageFeaturesService)
], MarkerViewModel);
let MarkersViewModel = class extends Disposable {
  constructor(multiline = true, viewMode = MarkersViewMode.Tree, contextKeyService, instantiationService) {
    super();
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._onDidChangeViewMode = this._register(new Emitter());
    this.onDidChangeViewMode = this._onDidChangeViewMode.event;
    this.markersViewStates = /* @__PURE__ */ new Map();
    this.markersPerResource = /* @__PURE__ */ new Map();
    this.bulkUpdate = false;
    this.hoveredMarker = null;
    this.hoverDelayer = this._register(new Delayer(300));
    this._multiline = true;
    this._viewMode = MarkersViewMode.Tree;
    this._multiline = multiline;
    this._viewMode = viewMode;
    this.viewModeContextKey = MarkersContextKeys.MarkersViewModeContextKey.bindTo(this.contextKeyService);
    this.viewModeContextKey.set(viewMode);
  }
  add(marker) {
    if (!this.markersViewStates.has(marker.id)) {
      const viewModel = this.instantiationService.createInstance(MarkerViewModel, marker);
      const disposables = [viewModel];
      viewModel.multiline = this.multiline;
      viewModel.onDidChange(() => {
        if (!this.bulkUpdate) {
          this._onDidChange.fire(marker);
        }
      }, this, disposables);
      this.markersViewStates.set(marker.id, { viewModel, disposables });
      const markers = this.markersPerResource.get(marker.resource.toString()) || [];
      markers.push(marker);
      this.markersPerResource.set(marker.resource.toString(), markers);
    }
  }
  remove(resource) {
    const markers = this.markersPerResource.get(resource.toString()) || [];
    for (const marker of markers) {
      const value = this.markersViewStates.get(marker.id);
      if (value) {
        dispose(value.disposables);
      }
      this.markersViewStates.delete(marker.id);
      if (this.hoveredMarker === marker) {
        this.hoveredMarker = null;
      }
    }
    this.markersPerResource.delete(resource.toString());
  }
  getViewModel(marker) {
    const value = this.markersViewStates.get(marker.id);
    return value ? value.viewModel : null;
  }
  onMarkerMouseHover(marker) {
    this.hoveredMarker = marker;
    this.hoverDelayer.trigger(() => {
      if (this.hoveredMarker) {
        const model = this.getViewModel(this.hoveredMarker);
        if (model) {
          model.showLightBulb();
        }
      }
    });
  }
  onMarkerMouseLeave(marker) {
    if (this.hoveredMarker === marker) {
      this.hoveredMarker = null;
    }
  }
  get multiline() {
    return this._multiline;
  }
  set multiline(value) {
    let changed = false;
    if (this._multiline !== value) {
      this._multiline = value;
      changed = true;
    }
    this.bulkUpdate = true;
    this.markersViewStates.forEach(({ viewModel }) => {
      if (viewModel.multiline !== value) {
        viewModel.multiline = value;
        changed = true;
      }
    });
    this.bulkUpdate = false;
    if (changed) {
      this._onDidChange.fire(void 0);
    }
  }
  get viewMode() {
    return this._viewMode;
  }
  set viewMode(value) {
    if (this._viewMode === value) {
      return;
    }
    this._viewMode = value;
    this._onDidChangeViewMode.fire(value);
    this.viewModeContextKey.set(value);
  }
  dispose() {
    this.markersViewStates.forEach(({ disposables }) => dispose(disposables));
    this.markersViewStates.clear();
    this.markersPerResource.clear();
    super.dispose();
  }
};
MarkersViewModel = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IInstantiationService)
], MarkersViewModel);
export {
  FileResourceMarkersRenderer,
  Filter,
  MarkerRenderer,
  MarkerViewModel,
  MarkersViewModel,
  MarkersWidgetAccessibilityProvider,
  RelatedInformationRenderer,
  ResourceMarkersRenderer,
  VirtualDelegate
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtlcnMvYnJvd3Nlci9tYXJrZXJzVHJlZVZpZXdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIHBhdGhzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb3VudEJhZGdlL2NvdW50QmFkZ2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbHMsIElSZXNvdXJjZUxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgSU1hcmtlciwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFya2VycywgTWFya2VyLCBSZWxhdGVkSW5mb3JtYXRpb24sIE1hcmtlckVsZW1lbnQsIE1hcmtlclRhYmxlSXRlbSB9IGZyb20gJy4vbWFya2Vyc01vZGVsLmpzJztcbmltcG9ydCBNZXNzYWdlcyBmcm9tICcuL21lc3NhZ2VzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlLCBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBRdWlja0ZpeEFjdGlvbiwgUXVpY2tGaXhBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vbWFya2Vyc1ZpZXdBY3Rpb25zLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElUcmVlRmlsdGVyLCBUcmVlVmlzaWJpbGl0eSwgVHJlZUZpbHRlclJlc3VsdCwgSVRyZWVSZW5kZXJlciwgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBGaWx0ZXJPcHRpb25zIH0gZnJvbSAnLi9tYXJrZXJzRmlsdGVyT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgSUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSwgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGFwcGx5Q29kZUFjdGlvbiwgQXBwbHlDb2RlQWN0aW9uUmVhc29uLCBnZXRDb2RlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25LaW5kLCBDb2RlQWN0aW9uU2V0LCBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBBQ1RJVkVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2V2ZXJpdHlJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NldmVyaXR5SWNvbi9zZXZlcml0eUljb24uanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvblRyaWdnZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvYnJvd3Nlci9saW5rLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNYXJrZXJzQ29udGV4dEtleXMsIE1hcmtlcnNWaWV3TW9kZSB9IGZyb20gJy4uL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IHVuc3VwcG9ydGVkU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmludGVyZmFjZSBJUmVzb3VyY2VNYXJrZXJzVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgcmVzb3VyY2VMYWJlbDogSVJlc291cmNlTGFiZWw7XG5cdHJlYWRvbmx5IGNvdW50OiBDb3VudEJhZGdlO1xufVxuXG5pbnRlcmZhY2UgSU1hcmtlclRlbXBsYXRlRGF0YSB7XG5cdG1hcmtlcldpZGdldDogTWFya2VyV2lkZ2V0O1xufVxuXG5pbnRlcmZhY2UgSVJlbGF0ZWRJbmZvcm1hdGlvblRlbXBsYXRlRGF0YSB7XG5cdHJlc291cmNlTGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdGxuQ29sOiBIVE1MRWxlbWVudDtcblx0ZGVzY3JpcHRpb246IEhpZ2hsaWdodGVkTGFiZWw7XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJzV2lkZ2V0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8TWFya2VyRWxlbWVudCB8IE1hcmtlclRhYmxlSXRlbT4ge1xuXG5cdGNvbnN0cnVjdG9yKEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlKSB7IH1cblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb2JsZW1zVmlldycsIFwiUHJvYmxlbXMgVmlld1wiKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBcmlhTGFiZWwoZWxlbWVudDogTWFya2VyRWxlbWVudCB8IE1hcmtlclRhYmxlSXRlbSk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgUmVzb3VyY2VNYXJrZXJzKSB7XG5cdFx0XHRjb25zdCBwYXRoID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC5yZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSB8fCBlbGVtZW50LnJlc291cmNlLmZzUGF0aDtcblx0XHRcdHJldHVybiBNZXNzYWdlcy5NQVJLRVJTX1RSRUVfQVJJQV9MQUJFTF9SRVNPVVJDRShlbGVtZW50Lm1hcmtlcnMubGVuZ3RoLCBlbGVtZW50Lm5hbWUsIHBhdGhzLmRpcm5hbWUocGF0aCkpO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlciB8fCBlbGVtZW50IGluc3RhbmNlb2YgTWFya2VyVGFibGVJdGVtKSB7XG5cdFx0XHRyZXR1cm4gTWVzc2FnZXMuTUFSS0VSU19UUkVFX0FSSUFfTEFCRUxfTUFSS0VSKGVsZW1lbnQpO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlbGF0ZWRJbmZvcm1hdGlvbikge1xuXHRcdFx0cmV0dXJuIE1lc3NhZ2VzLk1BUktFUlNfVFJFRV9BUklBX0xBQkVMX1JFTEFURURfSU5GT1JNQVRJT04oZWxlbWVudC5yYXcpO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5jb25zdCBlbnVtIFRlbXBsYXRlSWQge1xuXHRSZXNvdXJjZU1hcmtlcnMgPSAncm0nLFxuXHRNYXJrZXIgPSAnbScsXG5cdFJlbGF0ZWRJbmZvcm1hdGlvbiA9ICdyaSdcbn1cblxuZXhwb3J0IGNsYXNzIFZpcnR1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPE1hcmtlckVsZW1lbnQ+IHtcblxuXHRzdGF0aWMgTElORV9IRUlHSFQ6IG51bWJlciA9IDIyO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbWFya2Vyc1ZpZXdTdGF0ZTogTWFya2Vyc1ZpZXdNb2RlbCkgeyB9XG5cblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IE1hcmtlckVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgTWFya2VyKSB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLm1hcmtlcnNWaWV3U3RhdGUuZ2V0Vmlld01vZGVsKGVsZW1lbnQpO1xuXHRcdFx0Y29uc3Qgbm9PZkxpbmVzID0gIXZpZXdNb2RlbCB8fCB2aWV3TW9kZWwubXVsdGlsaW5lID8gZWxlbWVudC5saW5lcy5sZW5ndGggOiAxO1xuXHRcdFx0cmV0dXJuIG5vT2ZMaW5lcyAqIFZpcnR1YWxEZWxlZ2F0ZS5MSU5FX0hFSUdIVDtcblx0XHR9XG5cdFx0cmV0dXJuIFZpcnR1YWxEZWxlZ2F0ZS5MSU5FX0hFSUdIVDtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogTWFya2VyRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBSZXNvdXJjZU1hcmtlcnMpIHtcblx0XHRcdHJldHVybiBUZW1wbGF0ZUlkLlJlc291cmNlTWFya2Vycztcblx0XHR9IGVsc2UgaWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBNYXJrZXIpIHtcblx0XHRcdHJldHVybiBUZW1wbGF0ZUlkLk1hcmtlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFRlbXBsYXRlSWQuUmVsYXRlZEluZm9ybWF0aW9uO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBlbnVtIEZpbHRlckRhdGFUeXBlIHtcblx0UmVzb3VyY2VNYXJrZXJzLFxuXHRNYXJrZXIsXG5cdFJlbGF0ZWRJbmZvcm1hdGlvblxufVxuXG5pbnRlcmZhY2UgUmVzb3VyY2VNYXJrZXJzRmlsdGVyRGF0YSB7XG5cdHR5cGU6IEZpbHRlckRhdGFUeXBlLlJlc291cmNlTWFya2Vycztcblx0dXJpTWF0Y2hlczogSU1hdGNoW107XG59XG5cbmludGVyZmFjZSBNYXJrZXJGaWx0ZXJEYXRhIHtcblx0dHlwZTogRmlsdGVyRGF0YVR5cGUuTWFya2VyO1xuXHRsaW5lTWF0Y2hlczogSU1hdGNoW11bXTtcblx0c291cmNlTWF0Y2hlczogSU1hdGNoW107XG5cdGNvZGVNYXRjaGVzOiBJTWF0Y2hbXTtcbn1cblxuaW50ZXJmYWNlIFJlbGF0ZWRJbmZvcm1hdGlvbkZpbHRlckRhdGEge1xuXHR0eXBlOiBGaWx0ZXJEYXRhVHlwZS5SZWxhdGVkSW5mb3JtYXRpb247XG5cdHVyaU1hdGNoZXM6IElNYXRjaFtdO1xuXHRtZXNzYWdlTWF0Y2hlczogSU1hdGNoW107XG59XG5cbmV4cG9ydCB0eXBlIEZpbHRlckRhdGEgPSBSZXNvdXJjZU1hcmtlcnNGaWx0ZXJEYXRhIHwgTWFya2VyRmlsdGVyRGF0YSB8IFJlbGF0ZWRJbmZvcm1hdGlvbkZpbHRlckRhdGE7XG5cbmV4cG9ydCBjbGFzcyBSZXNvdXJjZU1hcmtlcnNSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8UmVzb3VyY2VNYXJrZXJzLCBSZXNvdXJjZU1hcmtlcnNGaWx0ZXJEYXRhLCBJUmVzb3VyY2VNYXJrZXJzVGVtcGxhdGVEYXRhPiB7XG5cblx0cHJpdmF0ZSByZW5kZXJlZE5vZGVzID0gbmV3IE1hcDxSZXNvdXJjZU1hcmtlcnMsIElSZXNvdXJjZU1hcmtlcnNUZW1wbGF0ZURhdGFbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0b25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQ6IEV2ZW50PElUcmVlTm9kZTxSZXNvdXJjZU1hcmtlcnMsIFJlc291cmNlTWFya2Vyc0ZpbHRlckRhdGE+Pixcblx0KSB7XG5cdFx0b25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQodGhpcy5vbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudCwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHR0ZW1wbGF0ZUlkID0gVGVtcGxhdGVJZC5SZXNvdXJjZU1hcmtlcnM7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElSZXNvdXJjZU1hcmtlcnNUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHJlc291cmNlTGFiZWxDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5yZXNvdXJjZS1sYWJlbC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VMYWJlbCA9IHRoaXMubGFiZWxzLmNyZWF0ZShyZXNvdXJjZUxhYmVsQ29udGFpbmVyLCB7IHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlIH0pO1xuXG5cdFx0Y29uc3QgYmFkZ2VXcmFwcGVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuY291bnQtYmFkZ2Utd3JhcHBlcicpKTtcblx0XHRjb25zdCBjb3VudCA9IG5ldyBDb3VudEJhZGdlKGJhZGdlV3JhcHBlciwge30sIGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzKTtcblxuXHRcdHJldHVybiB7IGNvdW50LCByZXNvdXJjZUxhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxSZXNvdXJjZU1hcmtlcnMsIFJlc291cmNlTWFya2Vyc0ZpbHRlckRhdGE+LCBfOiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVJlc291cmNlTWFya2Vyc1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlTWFya2VycyA9IG5vZGUuZWxlbWVudDtcblx0XHRjb25zdCB1cmlNYXRjaGVzID0gbm9kZS5maWx0ZXJEYXRhICYmIG5vZGUuZmlsdGVyRGF0YS51cmlNYXRjaGVzIHx8IFtdO1xuXG5cdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuc2V0RmlsZShyZXNvdXJjZU1hcmtlcnMucmVzb3VyY2UsIHsgbWF0Y2hlczogdXJpTWF0Y2hlcyB9KTtcblxuXHRcdHRoaXMudXBkYXRlQ291bnQobm9kZSwgdGVtcGxhdGVEYXRhKTtcblx0XHRjb25zdCBub2RlUmVuZGVycyA9IHRoaXMucmVuZGVyZWROb2Rlcy5nZXQocmVzb3VyY2VNYXJrZXJzKSA/PyBbXTtcblx0XHR0aGlzLnJlbmRlcmVkTm9kZXMuc2V0KHJlc291cmNlTWFya2VycywgWy4uLm5vZGVSZW5kZXJzLCB0ZW1wbGF0ZURhdGFdKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxSZXNvdXJjZU1hcmtlcnMsIFJlc291cmNlTWFya2Vyc0ZpbHRlckRhdGE+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElSZXNvdXJjZU1hcmtlcnNUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlUmVuZGVycyA9IHRoaXMucmVuZGVyZWROb2Rlcy5nZXQobm9kZS5lbGVtZW50KSA/PyBbXTtcblx0XHRjb25zdCBub2RlUmVuZGVySW5kZXggPSBub2RlUmVuZGVycy5maW5kSW5kZXgobm9kZVJlbmRlciA9PiB0ZW1wbGF0ZURhdGEgPT09IG5vZGVSZW5kZXIpO1xuXG5cdFx0aWYgKG5vZGVSZW5kZXJJbmRleCA8IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRGlzcG9zaW5nIHVua25vd24gcmVzb3VyY2UgbWFya2VyJyk7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGVSZW5kZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0dGhpcy5yZW5kZXJlZE5vZGVzLmRlbGV0ZShub2RlLmVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRub2RlUmVuZGVycy5zcGxpY2Uobm9kZVJlbmRlckluZGV4LCAxKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUmVzb3VyY2VNYXJrZXJzVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5jb3VudC5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50KG5vZGU6IElUcmVlTm9kZTxSZXNvdXJjZU1hcmtlcnMsIFJlc291cmNlTWFya2Vyc0ZpbHRlckRhdGE+KTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZVJlbmRlcnMgPSB0aGlzLnJlbmRlcmVkTm9kZXMuZ2V0KG5vZGUuZWxlbWVudCk7XG5cblx0XHRpZiAoIW5vZGVSZW5kZXJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bm9kZVJlbmRlcnMuZm9yRWFjaChub2RlUmVuZGVyID0+IHRoaXMudXBkYXRlQ291bnQobm9kZSwgbm9kZVJlbmRlcikpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb3VudChub2RlOiBJVHJlZU5vZGU8UmVzb3VyY2VNYXJrZXJzLCBSZXNvdXJjZU1hcmtlcnNGaWx0ZXJEYXRhPiwgdGVtcGxhdGVEYXRhOiBJUmVzb3VyY2VNYXJrZXJzVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmNvdW50LnNldENvdW50KG5vZGUuY2hpbGRyZW4ucmVkdWNlKChyLCBuKSA9PiByICsgKG4udmlzaWJsZSA/IDEgOiAwKSwgMCkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmlsZVJlc291cmNlTWFya2Vyc1JlbmRlcmVyIGV4dGVuZHMgUmVzb3VyY2VNYXJrZXJzUmVuZGVyZXIge1xufVxuXG5leHBvcnQgY2xhc3MgTWFya2VyUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPE1hcmtlciwgTWFya2VyRmlsdGVyRGF0YSwgSU1hcmtlclRlbXBsYXRlRGF0YT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFya2Vyc1ZpZXdTdGF0ZTogTWFya2Vyc1ZpZXdNb2RlbCxcblx0XHRASUhvdmVyU2VydmljZSBwcm90ZWN0ZWQgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByb3RlY3RlZCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7IH1cblxuXHR0ZW1wbGF0ZUlkID0gVGVtcGxhdGVJZC5NYXJrZXI7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElNYXJrZXJUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRhdGE6IElNYXJrZXJUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGRhdGEubWFya2VyV2lkZ2V0ID0gbmV3IE1hcmtlcldpZGdldChjb250YWluZXIsIHRoaXMubWFya2Vyc1ZpZXdTdGF0ZSwgdGhpcy5ob3ZlclNlcnZpY2UsIHRoaXMub3BlbmVyU2VydmljZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxNYXJrZXIsIE1hcmtlckZpbHRlckRhdGE+LCBfOiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1hcmtlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5tYXJrZXJXaWRnZXQucmVuZGVyKG5vZGUuZWxlbWVudCwgbm9kZS5maWx0ZXJEYXRhKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElNYXJrZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubWFya2VyV2lkZ2V0LmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cbmNvbnN0IGV4cGFuZGVkSWNvbiA9IHJlZ2lzdGVySWNvbignbWFya2Vycy12aWV3LW11bHRpLWxpbmUtZXhwYW5kZWQnLCBDb2RpY29uLmNoZXZyb25VcCwgbG9jYWxpemUoJ2V4cGFuZGVkSWNvbicsICdJY29uIGluZGljYXRpbmcgdGhhdCBtdWx0aXBsZSBsaW5lcyBhcmUgc2hvd24gaW4gdGhlIG1hcmtlcnMgdmlldy4nKSk7XG5jb25zdCBjb2xsYXBzZWRJY29uID0gcmVnaXN0ZXJJY29uKCdtYXJrZXJzLXZpZXctbXVsdGktbGluZS1jb2xsYXBzZWQnLCBDb2RpY29uLmNoZXZyb25Eb3duLCBsb2NhbGl6ZSgnY29sbGFwc2VkSWNvbicsICdJY29uIGluZGljYXRpbmcgdGhhdCBtdWx0aXBsZSBsaW5lcyBhcmUgY29sbGFwc2VkIGluIHRoZSBtYXJrZXJzIHZpZXcuJykpO1xuXG5jb25zdCB0b2dnbGVNdWx0aWxpbmVBY3Rpb24gPSAncHJvYmxlbXMuYWN0aW9uLnRvZ2dsZU11bHRpbGluZSc7XG5cbmNsYXNzIFRvZ2dsZU11bHRpbGluZUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0dGhpcy51cGRhdGVFeHBhbmRlZEF0dHJpYnV0ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNsYXNzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZUNsYXNzKCk7XG5cdFx0dGhpcy51cGRhdGVFeHBhbmRlZEF0dHJpYnV0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHBhbmRlZEF0dHJpYnV0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnQ/LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIGAke3RoaXMuX2FjdGlvbi5jbGFzcyA9PT0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGV4cGFuZGVkSWNvbil9YCk7XG5cdH1cblxufVxuXG5jbGFzcyBNYXJrZXJXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGljb25Db250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VBbmREZXRhaWxzQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlQW5kRGV0YWlsc0NvbnRhaW5lckhvdmVyOiBJTWFuYWdlZEhvdmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYXJrZXJzVmlld01vZGVsOiBNYXJrZXJzVmlld01vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuYWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5hY3Rpb25zJykpLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zKSA9PiBhY3Rpb24uaWQgPT09IFF1aWNrRml4QWN0aW9uLklEID8gX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrRml4QWN0aW9uVmlld0l0ZW0sIDxRdWlja0ZpeEFjdGlvbj5hY3Rpb24sIG9wdGlvbnMpIDogdW5kZWZpbmVkXG5cdFx0fSkpO1xuXG5cdFx0Ly8gd3JhcCB0aGUgaWNvbiBpbiBhIGNvbnRhaW5lciB0aGF0IGdldCB0aGUgaWNvbiBjb2xvciBhcyBmb3JlZ3JvdW5kIGNvbG9yLiBUaGF0IHdheSwgaWYgdGhlXG5cdFx0Ly8gbGlzdCB2aWV3IGRvZXMgbm90IGhhdmUgYSBzcGVjaWZpYyBjb2xvciBmb3IgdGhlIGljb24gKD10aGUgY29sb3IgdmFyaWFibGUgaXMgaW52YWxpZCkgaXRcblx0XHQvLyBmYWxscyBiYWNrIHRvIHRoZSBmb3JlZ3JvdW5kIGNvbG9yIG9mIGNvbnRhaW5lciAoaW5oZXJpdClcblx0XHR0aGlzLmljb25Db250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJycpKTtcblx0XHR0aGlzLmljb24gPSBkb20uYXBwZW5kKHRoaXMuaWNvbkNvbnRhaW5lciwgZG9tLiQoJycpKTtcblx0XHR0aGlzLm1lc3NhZ2VBbmREZXRhaWxzQ29udGFpbmVyID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcubWFya2VyLW1lc3NhZ2UtZGV0YWlscy1jb250YWluZXInKSk7XG5cdFx0dGhpcy5tZXNzYWdlQW5kRGV0YWlsc0NvbnRhaW5lckhvdmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLm1lc3NhZ2VBbmREZXRhaWxzQ29udGFpbmVyLCAnJykpO1xuXHR9XG5cblx0cmVuZGVyKGVsZW1lbnQ6IE1hcmtlciwgZmlsdGVyRGF0YTogTWFya2VyRmlsdGVyRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5tZXNzYWdlQW5kRGV0YWlsc0NvbnRhaW5lcik7XG5cblx0XHR0aGlzLmljb25Db250YWluZXIuY2xhc3NOYW1lID0gYG1hcmtlci1pY29uICR7U2V2ZXJpdHkudG9TdHJpbmcoTWFya2VyU2V2ZXJpdHkudG9TZXZlcml0eShlbGVtZW50Lm1hcmtlci5zZXZlcml0eSkpfWA7XG5cdFx0dGhpcy5pY29uLmNsYXNzTmFtZSA9IGBjb2RpY29uICR7U2V2ZXJpdHlJY29uLmNsYXNzTmFtZShNYXJrZXJTZXZlcml0eS50b1NldmVyaXR5KGVsZW1lbnQubWFya2VyLnNldmVyaXR5KSl9YDtcblx0XHR0aGlzLnJlbmRlclF1aWNrZml4QWN0aW9uYmFyKGVsZW1lbnQpO1xuXG5cdFx0dGhpcy5yZW5kZXJNZXNzYWdlQW5kRGV0YWlscyhlbGVtZW50LCBmaWx0ZXJEYXRhKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucGFyZW50LCBkb20uRXZlbnRUeXBlLk1PVVNFX09WRVIsICgpID0+IHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5vbk1hcmtlck1vdXNlSG92ZXIoZWxlbWVudCkpKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMucGFyZW50LCBkb20uRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCAoKSA9PiB0aGlzLm1hcmtlcnNWaWV3TW9kZWwub25NYXJrZXJNb3VzZUxlYXZlKGVsZW1lbnQpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclF1aWNrZml4QWN0aW9uYmFyKG1hcmtlcjogTWFya2VyKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy5tYXJrZXJzVmlld01vZGVsLmdldFZpZXdNb2RlbChtYXJrZXIpO1xuXHRcdGlmICh2aWV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IHF1aWNrRml4QWN0aW9uID0gdmlld01vZGVsLnF1aWNrRml4QWN0aW9uO1xuXHRcdFx0dGhpcy5hY3Rpb25CYXIucHVzaChbcXVpY2tGaXhBY3Rpb25dLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHRcdHRoaXMuaWNvbkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdxdWlja0ZpeCcsIHF1aWNrRml4QWN0aW9uLmVuYWJsZWQpO1xuXHRcdFx0cXVpY2tGaXhBY3Rpb24ub25EaWRDaGFuZ2UoKHsgZW5hYmxlZCB9KSA9PiB7XG5cdFx0XHRcdGlmICghaXNVbmRlZmluZWRPck51bGwoZW5hYmxlZCkpIHtcblx0XHRcdFx0XHR0aGlzLmljb25Db250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgncXVpY2tGaXgnLCBlbmFibGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0XHRxdWlja0ZpeEFjdGlvbi5vblNob3dRdWlja0ZpeGVzKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgcXVpY2tGaXhBY3Rpb25WaWV3SXRlbSA9IDxRdWlja0ZpeEFjdGlvblZpZXdJdGVtPnRoaXMuYWN0aW9uQmFyLnZpZXdJdGVtc1swXTtcblx0XHRcdFx0aWYgKHF1aWNrRml4QWN0aW9uVmlld0l0ZW0pIHtcblx0XHRcdFx0XHRxdWlja0ZpeEFjdGlvblZpZXdJdGVtLnNob3dRdWlja0ZpeGVzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTXVsdGlsaW5lQWN0aW9uYmFyKG1hcmtlcjogTWFya2VyLCBwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgbXVsdGlsaW5lQWN0aW9uYmFyID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbkJhcihkb20uYXBwZW5kKHBhcmVudCwgZG9tLiQoJy5tdWx0aWxpbmUtYWN0aW9ucycpKSwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSB0b2dnbGVNdWx0aWxpbmVBY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFRvZ2dsZU11bHRpbGluZUFjdGlvblZpZXdJdGVtKHVuZGVmaW5lZCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQobXVsdGlsaW5lQWN0aW9uYmFyKTtcblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMubWFya2Vyc1ZpZXdNb2RlbC5nZXRWaWV3TW9kZWwobWFya2VyKTtcblx0XHRjb25zdCBtdWx0aWxpbmUgPSB2aWV3TW9kZWwgJiYgdmlld01vZGVsLm11bHRpbGluZTtcblx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKHRvZ2dsZU11bHRpbGluZUFjdGlvbikpO1xuXHRcdGFjdGlvbi5lbmFibGVkID0gISF2aWV3TW9kZWwgJiYgbWFya2VyLmxpbmVzLmxlbmd0aCA+IDE7XG5cdFx0YWN0aW9uLnRvb2x0aXAgPSBtdWx0aWxpbmUgPyBsb2NhbGl6ZSgnc2luZ2xlIGxpbmUnLCBcIlNob3cgbWVzc2FnZSBpbiBzaW5nbGUgbGluZVwiKSA6IGxvY2FsaXplKCdtdWx0aSBsaW5lJywgXCJTaG93IG1lc3NhZ2UgaW4gbXVsdGlwbGUgbGluZXNcIik7XG5cdFx0YWN0aW9uLmNsYXNzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKG11bHRpbGluZSA/IGV4cGFuZGVkSWNvbiA6IGNvbGxhcHNlZEljb24pO1xuXHRcdGFjdGlvbi5ydW4gPSAoKSA9PiB7IGlmICh2aWV3TW9kZWwpIHsgdmlld01vZGVsLm11bHRpbGluZSA9ICF2aWV3TW9kZWwubXVsdGlsaW5lOyB9IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfTtcblx0XHRtdWx0aWxpbmVBY3Rpb25iYXIucHVzaChbYWN0aW9uXSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1lc3NhZ2VBbmREZXRhaWxzKGVsZW1lbnQ6IE1hcmtlciwgZmlsdGVyRGF0YTogTWFya2VyRmlsdGVyRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgbWFya2VyLCBsaW5lcyB9ID0gZWxlbWVudDtcblx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLm1hcmtlcnNWaWV3TW9kZWwuZ2V0Vmlld01vZGVsKGVsZW1lbnQpO1xuXHRcdGNvbnN0IG11bHRpbGluZSA9ICF2aWV3U3RhdGUgfHwgdmlld1N0YXRlLm11bHRpbGluZTtcblx0XHRjb25zdCBsaW5lTWF0Y2hlcyA9IGZpbHRlckRhdGEgJiYgZmlsdGVyRGF0YS5saW5lTWF0Y2hlcyB8fCBbXTtcblx0XHR0aGlzLm1lc3NhZ2VBbmREZXRhaWxzQ29udGFpbmVySG92ZXIudXBkYXRlKGVsZW1lbnQubWFya2VyLm1lc3NhZ2UpO1xuXG5cdFx0Y29uc3QgbGluZUVsZW1lbnRzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IChtdWx0aWxpbmUgPyBsaW5lcy5sZW5ndGggOiAxKTsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbGluZUVsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMubWVzc2FnZUFuZERldGFpbHNDb250YWluZXIsIGRvbS4kKCcubWFya2VyLW1lc3NhZ2UtbGluZScpKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VFbGVtZW50ID0gZG9tLmFwcGVuZChsaW5lRWxlbWVudCwgZG9tLiQoJy5tYXJrZXItbWVzc2FnZScpKTtcblx0XHRcdGNvbnN0IGhpZ2hsaWdodGVkTGFiZWwgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgSGlnaGxpZ2h0ZWRMYWJlbChtZXNzYWdlRWxlbWVudCkpO1xuXHRcdFx0aGlnaGxpZ2h0ZWRMYWJlbC5zZXQobGluZXNbaW5kZXhdLmxlbmd0aCA+IDEwMDAgPyBgJHtsaW5lc1tpbmRleF0uc3Vic3RyaW5nKDAsIDEwMDApfS4uLmAgOiBsaW5lc1tpbmRleF0sIGxpbmVNYXRjaGVzW2luZGV4XSk7XG5cdFx0XHRpZiAobGluZXNbaW5kZXhdID09PSAnJykge1xuXHRcdFx0XHRsaW5lRWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtWaXJ0dWFsRGVsZWdhdGUuTElORV9IRUlHSFR9cHhgO1xuXHRcdFx0fVxuXHRcdFx0bGluZUVsZW1lbnRzLnB1c2gobGluZUVsZW1lbnQpO1xuXHRcdH1cblx0XHR0aGlzLnJlbmRlckRldGFpbHMobWFya2VyLCBmaWx0ZXJEYXRhLCBsaW5lRWxlbWVudHNbMF0pO1xuXHRcdHRoaXMucmVuZGVyTXVsdGlsaW5lQWN0aW9uYmFyKGVsZW1lbnQsIGxpbmVFbGVtZW50c1swXSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckRldGFpbHMobWFya2VyOiBJTWFya2VyLCBmaWx0ZXJEYXRhOiBNYXJrZXJGaWx0ZXJEYXRhIHwgdW5kZWZpbmVkLCBwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ2RldGFpbHMtY29udGFpbmVyJyk7XG5cblx0XHRpZiAobWFya2VyLnNvdXJjZSB8fCBtYXJrZXIuY29kZSkge1xuXHRcdFx0Y29uc3Qgc291cmNlID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwoZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcubWFya2VyLXNvdXJjZScpKSkpO1xuXHRcdFx0Y29uc3Qgc291cmNlTWF0Y2hlcyA9IGZpbHRlckRhdGEgJiYgZmlsdGVyRGF0YS5zb3VyY2VNYXRjaGVzIHx8IFtdO1xuXHRcdFx0c291cmNlLnNldChtYXJrZXIuc291cmNlLCBzb3VyY2VNYXRjaGVzKTtcblxuXHRcdFx0aWYgKG1hcmtlci5jb2RlKSB7XG5cdFx0XHRcdGlmICh0eXBlb2YgbWFya2VyLmNvZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29kZSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLm1hcmtlci1jb2RlJykpKSk7XG5cdFx0XHRcdFx0Y29uc3QgY29kZU1hdGNoZXMgPSBmaWx0ZXJEYXRhICYmIGZpbHRlckRhdGEuY29kZU1hdGNoZXMgfHwgW107XG5cdFx0XHRcdFx0Y29kZS5zZXQobWFya2VyLmNvZGUsIGNvZGVNYXRjaGVzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLm1hcmtlci1jb2RlJyk7XG5cdFx0XHRcdFx0Y29uc3QgY29kZSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKGNvbnRhaW5lcikpO1xuXHRcdFx0XHRcdGNvbnN0IGxpbmsgPSBtYXJrZXIuY29kZS50YXJnZXQudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IExpbmsocGFyZW50LCB7IGhyZWY6IGxpbmssIGxhYmVsOiBjb250YWluZXIsIHRpdGxlOiBsaW5rIH0sIHVuZGVmaW5lZCwgdGhpcy5faG92ZXJTZXJ2aWNlLCB0aGlzLl9vcGVuZXJTZXJ2aWNlKSk7XG5cdFx0XHRcdFx0Y29uc3QgY29kZU1hdGNoZXMgPSBmaWx0ZXJEYXRhICYmIGZpbHRlckRhdGEuY29kZU1hdGNoZXMgfHwgW107XG5cdFx0XHRcdFx0Y29kZS5zZXQobWFya2VyLmNvZGUudmFsdWUsIGNvZGVNYXRjaGVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxuQ29sID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCdzcGFuLm1hcmtlci1saW5lJykpO1xuXHRcdGxuQ29sLnRleHRDb250ZW50ID0gTWVzc2FnZXMuTUFSS0VSU19QQU5FTF9BVF9MSU5FX0NPTF9OVU1CRVIobWFya2VyLnN0YXJ0TGluZU51bWJlciwgbWFya2VyLnN0YXJ0Q29sdW1uKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBSZWxhdGVkSW5mb3JtYXRpb25SZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8UmVsYXRlZEluZm9ybWF0aW9uLCBSZWxhdGVkSW5mb3JtYXRpb25GaWx0ZXJEYXRhLCBJUmVsYXRlZEluZm9ybWF0aW9uVGVtcGxhdGVEYXRhPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2Vcblx0KSB7IH1cblxuXHR0ZW1wbGF0ZUlkID0gVGVtcGxhdGVJZC5SZWxhdGVkSW5mb3JtYXRpb247XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElSZWxhdGVkSW5mb3JtYXRpb25UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRhdGE6IElSZWxhdGVkSW5mb3JtYXRpb25UZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0ZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuYWN0aW9ucycpKTtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5pY29uJykpO1xuXG5cdFx0ZGF0YS5yZXNvdXJjZUxhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwoZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcucmVsYXRlZC1pbmZvLXJlc291cmNlJykpKTtcblx0XHRkYXRhLmxuQ29sID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdzcGFuLm1hcmtlci1saW5lJykpO1xuXG5cdFx0Y29uc3Qgc2VwYXJhdG9yID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdzcGFuLnJlbGF0ZWQtaW5mby1yZXNvdXJjZS1zZXBhcmF0b3InKSk7XG5cdFx0c2VwYXJhdG9yLnRleHRDb250ZW50ID0gJzonO1xuXHRcdHNlcGFyYXRvci5zdHlsZS5wYWRkaW5nUmlnaHQgPSAnNHB4JztcblxuXHRcdGRhdGEuZGVzY3JpcHRpb24gPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5tYXJrZXItZGVzY3JpcHRpb24nKSkpO1xuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8UmVsYXRlZEluZm9ybWF0aW9uLCBSZWxhdGVkSW5mb3JtYXRpb25GaWx0ZXJEYXRhPiwgXzogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElSZWxhdGVkSW5mb3JtYXRpb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCByZWxhdGVkSW5mb3JtYXRpb24gPSBub2RlLmVsZW1lbnQucmF3O1xuXHRcdGNvbnN0IHVyaU1hdGNoZXMgPSBub2RlLmZpbHRlckRhdGEgJiYgbm9kZS5maWx0ZXJEYXRhLnVyaU1hdGNoZXMgfHwgW107XG5cdFx0Y29uc3QgbWVzc2FnZU1hdGNoZXMgPSBub2RlLmZpbHRlckRhdGEgJiYgbm9kZS5maWx0ZXJEYXRhLm1lc3NhZ2VNYXRjaGVzIHx8IFtdO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VMYWJlbFRpdGxlID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVsYXRlZEluZm9ybWF0aW9uLnJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXNvdXJjZUxhYmVsLnNldChiYXNlbmFtZShyZWxhdGVkSW5mb3JtYXRpb24ucmVzb3VyY2UpLCB1cmlNYXRjaGVzLCByZXNvdXJjZUxhYmVsVGl0bGUpO1xuXHRcdHRlbXBsYXRlRGF0YS5sbkNvbC50ZXh0Q29udGVudCA9IE1lc3NhZ2VzLk1BUktFUlNfUEFORUxfQVRfTElORV9DT0xfTlVNQkVSKHJlbGF0ZWRJbmZvcm1hdGlvbi5zdGFydExpbmVOdW1iZXIsIHJlbGF0ZWRJbmZvcm1hdGlvbi5zdGFydENvbHVtbik7XG5cdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnNldChyZWxhdGVkSW5mb3JtYXRpb24ubWVzc2FnZSwgbWVzc2FnZU1hdGNoZXMsIHJlbGF0ZWRJbmZvcm1hdGlvbi5tZXNzYWdlKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElSZWxhdGVkSW5mb3JtYXRpb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucmVzb3VyY2VMYWJlbC5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRmlsdGVyIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8TWFya2VyRWxlbWVudCwgRmlsdGVyRGF0YT4ge1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBvcHRpb25zOiBGaWx0ZXJPcHRpb25zKSB7IH1cblxuXHRmaWx0ZXIoZWxlbWVudDogTWFya2VyRWxlbWVudCwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlRmlsdGVyUmVzdWx0PEZpbHRlckRhdGE+IHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFJlc291cmNlTWFya2Vycykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsdGVyUmVzb3VyY2VNYXJrZXJzKGVsZW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCBpbnN0YW5jZW9mIE1hcmtlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuZmlsdGVyTWFya2VyKGVsZW1lbnQsIHBhcmVudFZpc2liaWxpdHkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWx0ZXJSZWxhdGVkSW5mb3JtYXRpb24oZWxlbWVudCwgcGFyZW50VmlzaWJpbGl0eSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJSZXNvdXJjZU1hcmtlcnMocmVzb3VyY2VNYXJrZXJzOiBSZXNvdXJjZU1hcmtlcnMpOiBUcmVlRmlsdGVyUmVzdWx0PEZpbHRlckRhdGE+IHtcblx0XHRpZiAodW5zdXBwb3J0ZWRTY2hlbWFzLmhhcyhyZXNvdXJjZU1hcmtlcnMucmVzb3VyY2Uuc2NoZW1lKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlciByZXNvdXJjZSBieSBwYXR0ZXJuIGZpcnN0IChnbG9icylcblx0XHQvLyBFeGNsdWRlcyBwYXR0ZXJuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5leGNsdWRlc01hdGNoZXIubWF0Y2hlcyhyZXNvdXJjZU1hcmtlcnMucmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gSW5jbHVkZXMgcGF0dGVyblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuaW5jbHVkZXNNYXRjaGVyLm1hdGNoZXMocmVzb3VyY2VNYXJrZXJzLnJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gRml0ZXIgYnkgdGV4dC4gRG8gbm90IGFwcGx5IG5lZ2F0ZWQgZmlsdGVycyBvbiByZXNvdXJjZXMgaW5zdGVhZCB1c2UgZXhjbHVkZSBwYXR0ZXJuc1xuXHRcdGlmICh0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0ICYmICF0aGlzLm9wdGlvbnMudGV4dEZpbHRlci5uZWdhdGUpIHtcblx0XHRcdGNvbnN0IHVyaU1hdGNoZXMgPSBGaWx0ZXJPcHRpb25zLl9maWx0ZXIodGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCwgYmFzZW5hbWUocmVzb3VyY2VNYXJrZXJzLnJlc291cmNlKSk7XG5cdFx0XHRpZiAodXJpTWF0Y2hlcykge1xuXHRcdFx0XHRyZXR1cm4geyB2aXNpYmlsaXR5OiB0cnVlLCBkYXRhOiB7IHR5cGU6IEZpbHRlckRhdGFUeXBlLlJlc291cmNlTWFya2VycywgdXJpTWF0Y2hlczogdXJpTWF0Y2hlcyB8fCBbXSB9IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2U7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlck1hcmtlcihtYXJrZXI6IE1hcmtlciwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlRmlsdGVyUmVzdWx0PEZpbHRlckRhdGE+IHtcblxuXHRcdGNvbnN0IG1hdGNoZXNTZXZlcml0eSA9IHRoaXMub3B0aW9ucy5zaG93RXJyb3JzICYmIE1hcmtlclNldmVyaXR5LkVycm9yID09PSBtYXJrZXIubWFya2VyLnNldmVyaXR5IHx8XG5cdFx0XHR0aGlzLm9wdGlvbnMuc2hvd1dhcm5pbmdzICYmIE1hcmtlclNldmVyaXR5Lldhcm5pbmcgPT09IG1hcmtlci5tYXJrZXIuc2V2ZXJpdHkgfHxcblx0XHRcdHRoaXMub3B0aW9ucy5zaG93SW5mb3MgJiYgTWFya2VyU2V2ZXJpdHkuSW5mbyA9PT0gbWFya2VyLm1hcmtlci5zZXZlcml0eTtcblxuXHRcdGlmICghbWF0Y2hlc1NldmVyaXR5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgc291cmNlIGZpbHRlcnMgaWYgcHJlc2VudFxuXHRcdGlmICghdGhpcy5vcHRpb25zLm1hdGNoZXNTb3VyY2VGaWx0ZXJzKG1hcmtlci5tYXJrZXIuc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZU1hdGNoZXM6IElNYXRjaFtdW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxpbmUgb2YgbWFya2VyLmxpbmVzKSB7XG5cdFx0XHRjb25zdCBsaW5lTWF0Y2ggPSBGaWx0ZXJPcHRpb25zLl9tZXNzYWdlRmlsdGVyKHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQsIGxpbmUpO1xuXHRcdFx0bGluZU1hdGNoZXMucHVzaChsaW5lTWF0Y2ggfHwgW10pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNvdXJjZU1hdGNoZXMgPSBtYXJrZXIubWFya2VyLnNvdXJjZSA/IEZpbHRlck9wdGlvbnMuX2ZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCBtYXJrZXIubWFya2VyLnNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29kZU1hdGNoZXMgPSBtYXJrZXIubWFya2VyLmNvZGUgPyBGaWx0ZXJPcHRpb25zLl9maWx0ZXIodGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCwgdHlwZW9mIG1hcmtlci5tYXJrZXIuY29kZSA9PT0gJ3N0cmluZycgPyBtYXJrZXIubWFya2VyLmNvZGUgOiBtYXJrZXIubWFya2VyLmNvZGUudmFsdWUpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1hdGNoZWQgPSBzb3VyY2VNYXRjaGVzIHx8IGNvZGVNYXRjaGVzIHx8IGxpbmVNYXRjaGVzLnNvbWUobGluZU1hdGNoID0+IGxpbmVNYXRjaC5sZW5ndGggPiAwKTtcblxuXHRcdC8vIE1hdGNoZWQgYW5kIG5vdCBuZWdhdGVkXG5cdFx0aWYgKG1hdGNoZWQgJiYgIXRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSkge1xuXHRcdFx0cmV0dXJuIHsgdmlzaWJpbGl0eTogdHJ1ZSwgZGF0YTogeyB0eXBlOiBGaWx0ZXJEYXRhVHlwZS5NYXJrZXIsIGxpbmVNYXRjaGVzLCBzb3VyY2VNYXRjaGVzOiBzb3VyY2VNYXRjaGVzIHx8IFtdLCBjb2RlTWF0Y2hlczogY29kZU1hdGNoZXMgfHwgW10gfSB9O1xuXHRcdH1cblxuXHRcdC8vIE1hdGNoZWQgYW5kIG5lZ2F0ZWQgLSBleGNsdWRlIGl0IG9ubHkgaWYgcGFyZW50IHZpc2liaWxpdHkgaXMgbm90IHNldFxuXHRcdGlmIChtYXRjaGVkICYmIHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSAmJiBwYXJlbnRWaXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gTm90IG1hdGNoZWQgYW5kIG5lZ2F0ZWQgLSBpbmNsdWRlIGl0IG9ubHkgaWYgcGFyZW50IHZpc2liaWxpdHkgaXMgbm90IHNldFxuXHRcdGlmICghbWF0Y2hlZCAmJiB0aGlzLm9wdGlvbnMudGV4dEZpbHRlci5uZWdhdGUgJiYgcGFyZW50VmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuUmVjdXJzZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhcmVudFZpc2liaWxpdHk7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlclJlbGF0ZWRJbmZvcm1hdGlvbihyZWxhdGVkSW5mb3JtYXRpb246IFJlbGF0ZWRJbmZvcm1hdGlvbiwgcGFyZW50VmlzaWJpbGl0eTogVHJlZVZpc2liaWxpdHkpOiBUcmVlRmlsdGVyUmVzdWx0PEZpbHRlckRhdGE+IHtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLnRleHQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaU1hdGNoZXMgPSBGaWx0ZXJPcHRpb25zLl9maWx0ZXIodGhpcy5vcHRpb25zLnRleHRGaWx0ZXIudGV4dCwgYmFzZW5hbWUocmVsYXRlZEluZm9ybWF0aW9uLnJhdy5yZXNvdXJjZSkpO1xuXHRcdGNvbnN0IG1lc3NhZ2VNYXRjaGVzID0gRmlsdGVyT3B0aW9ucy5fbWVzc2FnZUZpbHRlcih0aGlzLm9wdGlvbnMudGV4dEZpbHRlci50ZXh0LCBwYXRocy5iYXNlbmFtZShyZWxhdGVkSW5mb3JtYXRpb24ucmF3Lm1lc3NhZ2UpKTtcblx0XHRjb25zdCBtYXRjaGVkID0gdXJpTWF0Y2hlcyB8fCBtZXNzYWdlTWF0Y2hlcztcblxuXHRcdC8vIE1hdGNoZWQgYW5kIG5vdCBuZWdhdGVkXG5cdFx0aWYgKG1hdGNoZWQgJiYgIXRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSkge1xuXHRcdFx0cmV0dXJuIHsgdmlzaWJpbGl0eTogdHJ1ZSwgZGF0YTogeyB0eXBlOiBGaWx0ZXJEYXRhVHlwZS5SZWxhdGVkSW5mb3JtYXRpb24sIHVyaU1hdGNoZXM6IHVyaU1hdGNoZXMgfHwgW10sIG1lc3NhZ2VNYXRjaGVzOiBtZXNzYWdlTWF0Y2hlcyB8fCBbXSB9IH07XG5cdFx0fVxuXG5cdFx0Ly8gTWF0Y2hlZCBhbmQgbmVnYXRlZCAtIGV4Y2x1ZGUgaXQgb25seSBpZiBwYXJlbnQgdmlzaWJpbGl0eSBpcyBub3Qgc2V0XG5cdFx0aWYgKG1hdGNoZWQgJiYgdGhpcy5vcHRpb25zLnRleHRGaWx0ZXIubmVnYXRlICYmIHBhcmVudFZpc2liaWxpdHkgPT09IFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBOb3QgbWF0Y2hlZCBhbmQgbmVnYXRlZCAtIGluY2x1ZGUgaXQgb25seSBpZiBwYXJlbnQgdmlzaWJpbGl0eSBpcyBub3Qgc2V0XG5cdFx0aWYgKCFtYXRjaGVkICYmIHRoaXMub3B0aW9ucy50ZXh0RmlsdGVyLm5lZ2F0ZSAmJiBwYXJlbnRWaXNpYmlsaXR5ID09PSBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyZW50VmlzaWJpbGl0eTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWFya2VyVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBtb2RlbFByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPElUZXh0TW9kZWw+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgY29kZUFjdGlvbnNQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxDb2RlQWN0aW9uU2V0PiB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFya2VyOiBNYXJrZXIsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLm1vZGVsUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLm1vZGVsUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmNvZGVBY3Rpb25zUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLmNvZGVBY3Rpb25zUHJvbWlzZS5jYW5jZWwoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9tdWx0aWxpbmU6IGJvb2xlYW4gPSB0cnVlO1xuXHRnZXQgbXVsdGlsaW5lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tdWx0aWxpbmU7XG5cdH1cblxuXHRzZXQgbXVsdGlsaW5lKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX211bHRpbGluZSAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuX211bHRpbGluZSA9IHZhbHVlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3F1aWNrRml4QWN0aW9uOiBRdWlja0ZpeEFjdGlvbiB8IG51bGwgPSBudWxsO1xuXHRnZXQgcXVpY2tGaXhBY3Rpb24oKTogUXVpY2tGaXhBY3Rpb24ge1xuXHRcdGlmICghdGhpcy5fcXVpY2tGaXhBY3Rpb24pIHtcblx0XHRcdHRoaXMuX3F1aWNrRml4QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja0ZpeEFjdGlvbiwgdGhpcy5tYXJrZXIpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrRml4QWN0aW9uO1xuXHR9XG5cblx0c2hvd0xpZ2h0QnVsYigpOiB2b2lkIHtcblx0XHR0aGlzLnNldFF1aWNrRml4ZXModHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNldFF1aWNrRml4ZXMod2FpdEZvck1vZGVsOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29kZUFjdGlvbnMgPSBhd2FpdCB0aGlzLmdldENvZGVBY3Rpb25zKHdhaXRGb3JNb2RlbCk7XG5cdFx0dGhpcy5xdWlja0ZpeEFjdGlvbi5xdWlja0ZpeGVzID0gY29kZUFjdGlvbnMgPyB0aGlzLnRvQWN0aW9ucyhjb2RlQWN0aW9ucykgOiBbXTtcblx0XHR0aGlzLnF1aWNrRml4QWN0aW9uLmF1dG9GaXhhYmxlKCEhY29kZUFjdGlvbnMgJiYgY29kZUFjdGlvbnMuaGFzQXV0b0ZpeCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvZGVBY3Rpb25zKHdhaXRGb3JNb2RlbDogYm9vbGVhbik6IFByb21pc2U8Q29kZUFjdGlvblNldCB8IG51bGw+IHtcblx0XHRpZiAodGhpcy5jb2RlQWN0aW9uc1Byb21pc2UgIT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0aGlzLmNvZGVBY3Rpb25zUHJvbWlzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TW9kZWwod2FpdEZvck1vZGVsKVxuXHRcdFx0LnRoZW48Q29kZUFjdGlvblNldCB8IG51bGw+KG1vZGVsID0+IHtcblx0XHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmNvZGVBY3Rpb25zUHJvbWlzZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jb2RlQWN0aW9uc1Byb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShjYW5jZWxsYXRpb25Ub2tlbiA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZXRDb2RlQWN0aW9ucyh0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlciwgbW9kZWwsIG5ldyBSYW5nZSh0aGlzLm1hcmtlci5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHRoaXMubWFya2VyLnJhbmdlLnN0YXJ0Q29sdW1uLCB0aGlzLm1hcmtlci5yYW5nZS5lbmRMaW5lTnVtYmVyLCB0aGlzLm1hcmtlci5yYW5nZS5lbmRDb2x1bW4pLCB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkludm9rZSwgdHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuUHJvYmxlbXNWaWV3LCBmaWx0ZXI6IHsgaW5jbHVkZTogQ29kZUFjdGlvbktpbmQuUXVpY2tGaXggfVxuXHRcdFx0XHRcdFx0XHR9LCBQcm9ncmVzcy5Ob25lLCBjYW5jZWxsYXRpb25Ub2tlbikudGhlbihhY3Rpb25zID0+IHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXIoYWN0aW9ucyk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNvZGVBY3Rpb25zUHJvbWlzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0FjdGlvbnMoY29kZUFjdGlvbnM6IENvZGVBY3Rpb25TZXQpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiBjb2RlQWN0aW9ucy52YWxpZEFjdGlvbnMubWFwKGl0ZW0gPT4gdG9BY3Rpb24oe1xuXHRcdFx0aWQ6IGl0ZW0uYWN0aW9uLmNvbW1hbmQgPyBpdGVtLmFjdGlvbi5jb21tYW5kLmlkIDogaXRlbS5hY3Rpb24udGl0bGUsXG5cdFx0XHRsYWJlbDogaXRlbS5hY3Rpb24udGl0bGUsXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuRmlsZUF0TWFya2VyKHRoaXMubWFya2VyKTtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXBwbHlDb2RlQWN0aW9uLCBpdGVtLCBBcHBseUNvZGVBY3Rpb25SZWFzb24uRnJvbVByb2JsZW1zVmlldyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuRmlsZUF0TWFya2VyKGVsZW1lbnQ6IE1hcmtlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgcmVzb3VyY2UsIHNlbGVjdGlvbiB9ID0geyByZXNvdXJjZTogZWxlbWVudC5yZXNvdXJjZSwgc2VsZWN0aW9uOiBlbGVtZW50LnJhbmdlIH07XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRzZWxlY3Rpb24sXG5cdFx0XHRcdHByZXNlcnZlRm9jdXM6IHRydWUsXG5cdFx0XHRcdHBpbm5lZDogZmFsc2UsXG5cdFx0XHRcdHJldmVhbElmVmlzaWJsZTogdHJ1ZVxuXHRcdFx0fSxcblx0XHR9LCBBQ1RJVkVfR1JPVVApLnRoZW4oKCkgPT4gdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TW9kZWwod2FpdEZvck1vZGVsOiBib29sZWFuKTogUHJvbWlzZTxJVGV4dE1vZGVsIHwgbnVsbD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwodGhpcy5tYXJrZXIucmVzb3VyY2UpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShtb2RlbCk7XG5cdFx0fVxuXHRcdGlmICh3YWl0Rm9yTW9kZWwpIHtcblx0XHRcdGlmICghdGhpcy5tb2RlbFByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5tb2RlbFByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShjYW5jZWxsYXRpb25Ub2tlbiA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlKChjKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQobW9kZWwgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNFcXVhbChtb2RlbC51cmksIHRoaXMubWFya2VyLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRcdGMobW9kZWwpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMubW9kZWxQcm9taXNlO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIE1hcmtlcnNWaWV3TW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZTogRW1pdHRlcjxNYXJrZXIgfCB1bmRlZmluZWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TWFya2VyIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PE1hcmtlciB8IHVuZGVmaW5lZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdNb2RlOiBFbWl0dGVyPE1hcmtlcnNWaWV3TW9kZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNYXJrZXJzVmlld01vZGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdNb2RlOiBFdmVudDxNYXJrZXJzVmlld01vZGU+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaWV3TW9kZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcmtlcnNWaWV3U3RhdGVzOiBNYXA8c3RyaW5nLCB7IHZpZXdNb2RlbDogTWFya2VyVmlld01vZGVsOyBkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSB9PiA9IG5ldyBNYXA8c3RyaW5nLCB7IHZpZXdNb2RlbDogTWFya2VyVmlld01vZGVsOyBkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1hcmtlcnNQZXJSZXNvdXJjZTogTWFwPHN0cmluZywgTWFya2VyW10+ID0gbmV3IE1hcDxzdHJpbmcsIE1hcmtlcltdPigpO1xuXG5cdHByaXZhdGUgYnVsa1VwZGF0ZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgaG92ZXJlZE1hcmtlcjogTWFya2VyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgaG92ZXJEZWxheWVyOiBEZWxheWVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMzAwKSk7XG5cdHByaXZhdGUgdmlld01vZGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxNYXJrZXJzVmlld01vZGU+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG11bHRpbGluZTogYm9vbGVhbiA9IHRydWUsXG5cdFx0dmlld01vZGU6IE1hcmtlcnNWaWV3TW9kZSA9IE1hcmtlcnNWaWV3TW9kZS5UcmVlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbXVsdGlsaW5lID0gbXVsdGlsaW5lO1xuXHRcdHRoaXMuX3ZpZXdNb2RlID0gdmlld01vZGU7XG5cblx0XHR0aGlzLnZpZXdNb2RlQ29udGV4dEtleSA9IE1hcmtlcnNDb250ZXh0S2V5cy5NYXJrZXJzVmlld01vZGVDb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnZpZXdNb2RlQ29udGV4dEtleS5zZXQodmlld01vZGUpO1xuXHR9XG5cblx0YWRkKG1hcmtlcjogTWFya2VyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1hcmtlcnNWaWV3U3RhdGVzLmhhcyhtYXJrZXIuaWQpKSB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hcmtlclZpZXdNb2RlbCwgbWFya2VyKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW3ZpZXdNb2RlbF07XG5cdFx0XHR2aWV3TW9kZWwubXVsdGlsaW5lID0gdGhpcy5tdWx0aWxpbmU7XG5cdFx0XHR2aWV3TW9kZWwub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuYnVsa1VwZGF0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUobWFya2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdGhpcywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5tYXJrZXJzVmlld1N0YXRlcy5zZXQobWFya2VyLmlkLCB7IHZpZXdNb2RlbCwgZGlzcG9zYWJsZXMgfSk7XG5cblx0XHRcdGNvbnN0IG1hcmtlcnMgPSB0aGlzLm1hcmtlcnNQZXJSZXNvdXJjZS5nZXQobWFya2VyLnJlc291cmNlLnRvU3RyaW5nKCkpIHx8IFtdO1xuXHRcdFx0bWFya2Vycy5wdXNoKG1hcmtlcik7XG5cdFx0XHR0aGlzLm1hcmtlcnNQZXJSZXNvdXJjZS5zZXQobWFya2VyLnJlc291cmNlLnRvU3RyaW5nKCksIG1hcmtlcnMpO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZShyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgbWFya2VycyA9IHRoaXMubWFya2Vyc1BlclJlc291cmNlLmdldChyZXNvdXJjZS50b1N0cmluZygpKSB8fCBbXTtcblx0XHRmb3IgKGNvbnN0IG1hcmtlciBvZiBtYXJrZXJzKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMubWFya2Vyc1ZpZXdTdGF0ZXMuZ2V0KG1hcmtlci5pZCk7XG5cdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0ZGlzcG9zZSh2YWx1ZS5kaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLm1hcmtlcnNWaWV3U3RhdGVzLmRlbGV0ZShtYXJrZXIuaWQpO1xuXHRcdFx0aWYgKHRoaXMuaG92ZXJlZE1hcmtlciA9PT0gbWFya2VyKSB7XG5cdFx0XHRcdHRoaXMuaG92ZXJlZE1hcmtlciA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMubWFya2Vyc1BlclJlc291cmNlLmRlbGV0ZShyZXNvdXJjZS50b1N0cmluZygpKTtcblx0fVxuXG5cdGdldFZpZXdNb2RlbChtYXJrZXI6IE1hcmtlcik6IE1hcmtlclZpZXdNb2RlbCB8IG51bGwge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5tYXJrZXJzVmlld1N0YXRlcy5nZXQobWFya2VyLmlkKTtcblx0XHRyZXR1cm4gdmFsdWUgPyB2YWx1ZS52aWV3TW9kZWwgOiBudWxsO1xuXHR9XG5cblx0b25NYXJrZXJNb3VzZUhvdmVyKG1hcmtlcjogTWFya2VyKTogdm9pZCB7XG5cdFx0dGhpcy5ob3ZlcmVkTWFya2VyID0gbWFya2VyO1xuXHRcdHRoaXMuaG92ZXJEZWxheWVyLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaG92ZXJlZE1hcmtlcikge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZ2V0Vmlld01vZGVsKHRoaXMuaG92ZXJlZE1hcmtlcik7XG5cdFx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRcdG1vZGVsLnNob3dMaWdodEJ1bGIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b25NYXJrZXJNb3VzZUxlYXZlKG1hcmtlcjogTWFya2VyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaG92ZXJlZE1hcmtlciA9PT0gbWFya2VyKSB7XG5cdFx0XHR0aGlzLmhvdmVyZWRNYXJrZXIgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX211bHRpbGluZTogYm9vbGVhbiA9IHRydWU7XG5cdGdldCBtdWx0aWxpbmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX211bHRpbGluZTtcblx0fVxuXG5cdHNldCBtdWx0aWxpbmUodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLl9tdWx0aWxpbmUgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLl9tdWx0aWxpbmUgPSB2YWx1ZTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLmJ1bGtVcGRhdGUgPSB0cnVlO1xuXHRcdHRoaXMubWFya2Vyc1ZpZXdTdGF0ZXMuZm9yRWFjaCgoeyB2aWV3TW9kZWwgfSkgPT4ge1xuXHRcdFx0aWYgKHZpZXdNb2RlbC5tdWx0aWxpbmUgIT09IHZhbHVlKSB7XG5cdFx0XHRcdHZpZXdNb2RlbC5tdWx0aWxpbmUgPSB2YWx1ZTtcblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5idWxrVXBkYXRlID0gZmFsc2U7XG5cdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF92aWV3TW9kZTogTWFya2Vyc1ZpZXdNb2RlID0gTWFya2Vyc1ZpZXdNb2RlLlRyZWU7XG5cdGdldCB2aWV3TW9kZSgpOiBNYXJrZXJzVmlld01vZGUge1xuXHRcdHJldHVybiB0aGlzLl92aWV3TW9kZTtcblx0fVxuXG5cdHNldCB2aWV3TW9kZSh2YWx1ZTogTWFya2Vyc1ZpZXdNb2RlKSB7XG5cdFx0aWYgKHRoaXMuX3ZpZXdNb2RlID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZpZXdNb2RlID0gdmFsdWU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3TW9kZS5maXJlKHZhbHVlKTtcblx0XHR0aGlzLnZpZXdNb2RlQ29udGV4dEtleS5zZXQodmFsdWUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLm1hcmtlcnNWaWV3U3RhdGVzLmZvckVhY2goKHsgZGlzcG9zYWJsZXMgfSkgPT4gZGlzcG9zZShkaXNwb3NhYmxlcykpO1xuXHRcdHRoaXMubWFya2Vyc1ZpZXdTdGF0ZXMuY2xlYXIoKTtcblx0XHR0aGlzLm1hcmtlcnNQZXJSZXNvdXJjZS5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBa0Isc0JBQXNCO0FBQ3hDLFNBQVMsaUJBQWlCLFFBQVEsb0JBQW1DLHVCQUF1QjtBQUM1RixPQUFPLGNBQWM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBc0IsU0FBUyxZQUFZLGNBQWMsdUJBQXVCO0FBQ2hGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCLDhCQUE4QjtBQUN2RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFVBQVUsZUFBZTtBQUVsQyxTQUFzQixzQkFBa0U7QUFDeEYsU0FBUyxxQkFBcUI7QUFFOUIsU0FBZ0IsZUFBZTtBQUUvQixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLFFBQWlCLGdCQUFnQjtBQUMxQyxTQUFTLGdCQUFnQjtBQUN6QixTQUE0Qix5QkFBeUIsZUFBZTtBQUNwRSxTQUFTLHFCQUFxQjtBQUM5QixTQUFT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LFVBQUksS0FBSyxrQkFBa0IsUUFBUTtBQUNsQyxhQUFLLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsSUFDRDtBQUNBLFNBQUssbUJBQW1CLE9BQU8sU0FBUyxTQUFTLENBQUM7QUFBQSxFQUNuRDtBQUFBLEVBRUEsYUFBYSxRQUF3QztBQUNwRCxVQUFNLFFBQVEsS0FBSyxrQkFBa0IsSUFBSSxPQUFPLEVBQUU7QUFDbEQsV0FBTyxRQUFRLE1BQU0sWUFBWTtBQUFBLEVBQ2xDO0FBQUEsRUFFQSxtQkFBbUIsUUFBc0I7QUFDeEMsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxhQUFhLFFBQVEsTUFBTTtBQUMvQixVQUFJLEtBQUssZUFBZTtBQUN2QixjQUFNLFFBQVEsS0FBSyxhQUFhLEtBQUssYUFBYTtBQUNsRCxZQUFJLE9BQU87QUFDVixnQkFBTSxjQUFjO0FBQUEsUUFDckI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsbUJBQW1CLFFBQXNCO0FBQ3hDLFFBQUksS0FBSyxrQkFBa0IsUUFBUTtBQUNsQyxXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUFBLEVBR0EsSUFBSSxZQUFxQjtBQUN4QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFVBQVUsT0FBZ0I7QUFDN0IsUUFBSSxVQUFVO0FBQ2QsUUFBSSxLQUFLLGVBQWUsT0FBTztBQUM5QixXQUFLLGFBQWE7QUFDbEIsZ0JBQVU7QUFBQSxJQUNYO0FBQ0EsU0FBSyxhQUFhO0FBQ2xCLFNBQUssa0JBQWtCLFFBQVEsQ0FBQyxFQUFFLFVBQVUsTUFBTTtBQUNqRCxVQUFJLFVBQVUsY0FBYyxPQUFPO0FBQ2xDLGtCQUFVLFlBQVk7QUFDdEIsa0JBQVU7QUFBQSxNQUNYO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxhQUFhO0FBQ2xCLFFBQUksU0FBUztBQUNaLFdBQUssYUFBYSxLQUFLLE1BQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFBQSxFQUdBLElBQUksV0FBNEI7QUFDL0IsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxTQUFTLE9BQXdCO0FBQ3BDLFFBQUksS0FBSyxjQUFjLE9BQU87QUFDN0I7QUFBQSxJQUNEO0FBRUEsU0FBSyxZQUFZO0FBQ2pCLFNBQUsscUJBQXFCLEtBQUssS0FBSztBQUNwQyxTQUFLLG1CQUFtQixJQUFJLEtBQUs7QUFBQSxFQUNsQztBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxrQkFBa0IsUUFBUSxDQUFDLEVBQUUsWUFBWSxNQUFNLFFBQVEsV0FBVyxDQUFDO0FBQ3hFLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxtQkFBbUIsTUFBTTtBQUM5QixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBRUQ7QUFySWEsbUJBQU47QUFBQSxFQW9CSjtBQUFBLEVBQ0E7QUFBQSxHQXJCVTsiLAogICJuYW1lcyI6IFsiVGVtcGxhdGVJZCIsICJGaWx0ZXJEYXRhVHlwZSIsICJhY3Rpb24iLCAibW9kZWwiXQp9Cg==
