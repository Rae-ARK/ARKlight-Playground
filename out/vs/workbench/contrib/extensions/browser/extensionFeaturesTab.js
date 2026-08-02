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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { $, append, clearNode, addDisposableListener, EventType } from "../../../../base/browser/dom.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { localize } from "../../../../nls.js";
import { WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { getExtensionId } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles, defaultKeybindingLabelStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { PANEL_SECTION_BORDER } from "../../../common/theme.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import Severity from "../../../../base/common/severity.js";
import { errorIcon, infoIcon, warningIcon } from "./extensionsIcons.js";
import { SeverityIcon } from "../../../../base/browser/ui/severityIcon/severityIcon.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { OS } from "../../../../base/common/platform.js";
import { MarkdownString, isMarkdownString } from "../../../../base/common/htmlContent.js";
import { Color } from "../../../../base/common/color.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ResolvedKeybinding } from "../../../../base/common/keybindings.js";
import { asCssVariable } from "../../../../platform/theme/common/colorUtils.js";
import { foreground, chartAxis, chartGuide, chartLine } from "../../../../platform/theme/common/colorRegistry.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
let RuntimeStatusMarkdownRenderer = class extends Disposable {
  constructor(extensionService, hoverService, extensionFeaturesManagementService, markdownRendererService) {
    super();
    this.extensionService = extensionService;
    this.hoverService = hoverService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.markdownRendererService = markdownRendererService;
    this.type = "element";
  }
  shouldRender(manifest) {
    const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
    if (!this.extensionService.extensions.some((e) => ExtensionIdentifier.equals(e.identifier, extensionId))) {
      return false;
    }
    return !!manifest.main || !!manifest.browser;
  }
  render(manifest) {
    const disposables = new DisposableStore();
    const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
    const emitter = disposables.add(new Emitter());
    disposables.add(this.extensionService.onDidChangeExtensionsStatus((e) => {
      if (e.some((extension) => ExtensionIdentifier.equals(extension, extensionId))) {
        emitter.fire(this.createElement(manifest, disposables));
      }
    }));
    disposables.add(this.extensionFeaturesManagementService.onDidChangeAccessData((e) => emitter.fire(this.createElement(manifest, disposables))));
    return {
      onDidChange: emitter.event,
      data: this.createElement(manifest, disposables),
      dispose: () => disposables.dispose()
    };
  }
  createElement(manifest, disposables) {
    const container = $(".runtime-status");
    const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
    const status = this.extensionService.getExtensionsStatus()[extensionId.value];
    if (this.extensionService.extensions.some((extension) => ExtensionIdentifier.equals(extension.identifier, extensionId))) {
      const data = new MarkdownString();
      data.appendMarkdown(`### ${localize("activation", "Activation")}

`);
      if (status.activationTimes) {
        if (status.activationTimes.activationReason.startup) {
          data.appendMarkdown(`Activated on Startup: \`${status.activationTimes.activateCallTime}ms\``);
        } else {
          data.appendMarkdown(`Activated by \`${status.activationTimes.activationReason.activationEvent}\` event: \`${status.activationTimes.activateCallTime}ms\``);
        }
      } else {
        data.appendMarkdown("Not yet activated");
      }
      this.renderMarkdown(data, container, disposables);
    }
    const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
    for (const feature of features) {
      const accessData = this.extensionFeaturesManagementService.getAccessData(extensionId, feature.id);
      if (accessData) {
        this.renderMarkdown(new MarkdownString(`
 ### ${localize("label", "{0} Usage", feature.label)}

`), container, disposables);
        if (accessData.accessTimes.length) {
          const description = append(
            container,
            $(
              ".feature-chart-description",
              void 0,
              localize("chartDescription", "There were {0} {1} requests from this extension in the last 30 days.", accessData?.accessTimes.length, feature.accessDataLabel ?? feature.label)
            )
          );
          description.style.marginBottom = "8px";
          this.renderRequestsChart(container, accessData.accessTimes, disposables);
        }
        const status2 = accessData?.current?.status;
        if (status2) {
          const data = new MarkdownString();
          if (status2?.severity === Severity.Error) {
            data.appendMarkdown(`$(${errorIcon.id}) ${status2.message}

`);
          }
          if (status2?.severity === Severity.Warning) {
            data.appendMarkdown(`$(${warningIcon.id}) ${status2.message}

`);
          }
          if (data.value) {
            this.renderMarkdown(data, container, disposables);
          }
        }
      }
    }
    if (status.runtimeErrors.length || status.messages.length) {
      const data = new MarkdownString();
      if (status.runtimeErrors.length) {
        data.appendMarkdown(`
 ### ${localize("uncaught errors", "Uncaught Errors ({0})", status.runtimeErrors.length)}
`);
        for (const error of status.runtimeErrors) {
          data.appendMarkdown(`$(${Codicon.error.id})&nbsp;${getErrorMessage(error)}

`);
        }
      }
      if (status.messages.length) {
        data.appendMarkdown(`
 ### ${localize("messaages", "Messages ({0})", status.messages.length)}
`);
        for (const message of status.messages) {
          data.appendMarkdown(`$(${(message.type === Severity.Error ? Codicon.error : message.type === Severity.Warning ? Codicon.warning : Codicon.info).id})&nbsp;${message.message}

`);
        }
      }
      if (data.value) {
        this.renderMarkdown(data, container, disposables);
      }
    }
    return container;
  }
  renderMarkdown(markdown, container, disposables) {
    const { element } = disposables.add(this.markdownRendererService.render({
      value: markdown.value,
      isTrusted: markdown.isTrusted,
      supportThemeIcons: true
    }));
    append(container, element);
  }
  renderRequestsChart(container, accessTimes, disposables) {
    const width = 450;
    const height = 250;
    const margin = { top: 0, right: 4, bottom: 20, left: 4 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const chartContainer = append(container, $(".feature-chart-container"));
    chartContainer.style.position = "relative";
    const tooltip = append(chartContainer, $(".feature-chart-tooltip"));
    tooltip.style.position = "absolute";
    tooltip.style.width = "0px";
    tooltip.style.height = "0px";
    let maxCount = 100;
    const map = /* @__PURE__ */ new Map();
    for (const accessTime of accessTimes) {
      const day = `${accessTime.getDate()} ${accessTime.toLocaleString("default", { month: "short" })}`;
      map.set(day, (map.get(day) ?? 0) + 1);
      maxCount = Math.max(maxCount, map.get(day));
    }
    const now = /* @__PURE__ */ new Date();
    const points = [];
    for (let i = 0; i <= 30; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() - (30 - i));
      const dateString = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })}`;
      const count = map.get(dateString) ?? 0;
      const x = i / 30 * innerWidth;
      const y = innerHeight - count / maxCount * innerHeight;
      points.push({ x, y, date: dateString, count });
    }
    const chart = append(chartContainer, $(".feature-chart"));
    const svg = append(chart, $.SVG("svg"));
    svg.setAttribute("width", `${width}px`);
    svg.setAttribute("height", `${height}px`);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const g = $.SVG("g");
    g.setAttribute("transform", `translate(${margin.left},${margin.top})`);
    svg.appendChild(g);
    const xAxisLine = $.SVG("line");
    xAxisLine.setAttribute("x1", "0");
    xAxisLine.setAttribute("y1", `${innerHeight}`);
    xAxisLine.setAttribute("x2", `${innerWidth}`);
    xAxisLine.setAttribute("y2", `${innerHeight}`);
    xAxisLine.setAttribute("stroke", asCssVariable(chartAxis));
    xAxisLine.setAttribute("stroke-width", "1px");
    g.appendChild(xAxisLine);
    for (let i = 1; i <= 30; i += 7) {
      const date = new Date(now);
      date.setDate(now.getDate() - (30 - i));
      const dateString = `${date.getDate()} ${date.toLocaleString("default", { month: "short" })}`;
      const x = i / 30 * innerWidth;
      const tick = $.SVG("line");
      tick.setAttribute("x1", `${x}`);
      tick.setAttribute("y1", `${innerHeight}`);
      tick.setAttribute("x2", `${x}`);
      tick.setAttribute("y2", `${innerHeight + 10}`);
      tick.setAttribute("stroke", asCssVariable(chartAxis));
      tick.setAttribute("stroke-width", "1px");
      g.appendChild(tick);
      const ruler = $.SVG("line");
      ruler.setAttribute("x1", `${x}`);
      ruler.setAttribute("y1", `0`);
      ruler.setAttribute("x2", `${x}`);
      ruler.setAttribute("y2", `${innerHeight}`);
      ruler.setAttribute("stroke", asCssVariable(chartGuide));
      ruler.setAttribute("stroke-width", "1px");
      g.appendChild(ruler);
      const xAxisDate = $.SVG("text");
      xAxisDate.setAttribute("x", `${x}`);
      xAxisDate.setAttribute("y", `${height}`);
      xAxisDate.setAttribute("text-anchor", "middle");
      xAxisDate.setAttribute("fill", asCssVariable(foreground));
      xAxisDate.setAttribute("font-size", "10px");
      xAxisDate.textContent = dateString;
      g.appendChild(xAxisDate);
    }
    const line = $.SVG("polyline");
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", asCssVariable(chartLine));
    line.setAttribute("stroke-width", `2px`);
    line.setAttribute("points", points.map((p) => `${p.x},${p.y}`).join(" "));
    g.appendChild(line);
    const highlightCircle = $.SVG("circle");
    highlightCircle.setAttribute("r", `4px`);
    highlightCircle.style.display = "none";
    g.appendChild(highlightCircle);
    const hoverDisposable = disposables.add(new MutableDisposable());
    const mouseMoveListener = (event) => {
      const rect = svg.getBoundingClientRect();
      const mouseX = event.clientX - rect.left - margin.left;
      let closestPoint;
      let minDistance = Infinity;
      points.forEach((point) => {
        const distance = Math.abs(point.x - mouseX);
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });
      if (closestPoint) {
        highlightCircle.setAttribute("cx", `${closestPoint.x}`);
        highlightCircle.setAttribute("cy", `${closestPoint.y}`);
        highlightCircle.style.display = "block";
        tooltip.style.left = `${closestPoint.x + 24}px`;
        tooltip.style.top = `${closestPoint.y + 14}px`;
        hoverDisposable.value = this.hoverService.showInstantHover({
          content: new MarkdownString(`${closestPoint.date}: ${closestPoint.count} requests`),
          target: tooltip,
          appearance: {
            showPointer: true,
            skipFadeInAnimation: true
          }
        });
      } else {
        hoverDisposable.value = void 0;
      }
    };
    disposables.add(addDisposableListener(svg, EventType.MOUSE_MOVE, mouseMoveListener));
    const mouseLeaveListener = () => {
      highlightCircle.style.display = "none";
      hoverDisposable.value = void 0;
    };
    disposables.add(addDisposableListener(svg, EventType.MOUSE_LEAVE, mouseLeaveListener));
  }
};
RuntimeStatusMarkdownRenderer.ID = "runtimeStatus";
RuntimeStatusMarkdownRenderer = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IHoverService),
  __decorateParam(2, IExtensionFeaturesManagementService),
  __decorateParam(3, IMarkdownRendererService)
], RuntimeStatusMarkdownRenderer);
const runtimeStatusFeature = {
  id: RuntimeStatusMarkdownRenderer.ID,
  label: localize("runtime", "Runtime Status"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(RuntimeStatusMarkdownRenderer)
};
let ExtensionFeaturesTab = class extends Themable {
  constructor(manifest, feature, themeService, instantiationService) {
    super(themeService);
    this.manifest = manifest;
    this.feature = feature;
    this.instantiationService = instantiationService;
    this.featureView = this._register(new MutableDisposable());
    this.layoutParticipants = [];
    this.extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
    this.domNode = $("div.subcontent.feature-contributions");
    this.create();
  }
  layout(height, width) {
    this.layoutParticipants.forEach((participant) => participant.layout(height, width));
  }
  create() {
    const features = this.getFeatures();
    if (features.length === 0) {
      append($(".no-features"), this.domNode).textContent = localize("noFeatures", "No features contributed.");
      return;
    }
    const splitView = this._register(new SplitView(this.domNode, {
      orientation: Orientation.HORIZONTAL,
      proportionalLayout: true
    }));
    this.layoutParticipants.push({
      layout: (height, width) => {
        splitView.el.style.height = `${height - 14}px`;
        splitView.layout(width);
      }
    });
    const featuresListContainer = $(".features-list-container");
    const list = this._register(this.createFeaturesList(featuresListContainer));
    list.splice(0, list.length, features);
    const featureViewContainer = $(".feature-view-container");
    this._register(list.onDidChangeSelection((e) => {
      const feature = e.elements[0];
      if (feature) {
        this.showFeatureView(feature, featureViewContainer);
      }
    }));
    const index = this.feature ? features.findIndex((f) => f.id === this.feature) : 0;
    list.setSelection([index === -1 ? 0 : index]);
    splitView.addView({
      onDidChange: Event.None,
      element: featuresListContainer,
      minimumSize: 100,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        featuresListContainer.style.width = `${width}px`;
        list.layout(height, width);
      }
    }, 200, void 0, true);
    splitView.addView({
      onDidChange: Event.None,
      element: featureViewContainer,
      minimumSize: 500,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        featureViewContainer.style.width = `${width}px`;
        this.featureViewDimension = { height, width };
        this.layoutFeatureView();
      }
    }, Sizing.Distribute, void 0, true);
    splitView.style({
      separatorBorder: this.theme.getColor(PANEL_SECTION_BORDER)
    });
  }
  createFeaturesList(container) {
    const renderer = this.instantiationService.createInstance(ExtensionFeatureItemRenderer, this.extensionId);
    const delegate = new ExtensionFeatureItemDelegate();
    const list = this.instantiationService.createInstance(WorkbenchList, "ExtensionFeaturesList", append(container, $(".features-list-wrapper")), delegate, [renderer], {
      multipleSelectionSupport: false,
      setRowLineHeight: false,
      horizontalScrolling: false,
      accessibilityProvider: {
        getAriaLabel(extensionFeature) {
          return extensionFeature?.label ?? "";
        },
        getWidgetAriaLabel() {
          return localize("extension features list", "Extension Features");
        }
      },
      openOnSingleClick: true
    });
    return list;
  }
  layoutFeatureView() {
    this.featureView.value?.layout(this.featureViewDimension?.height, this.featureViewDimension?.width);
  }
  showFeatureView(feature, container) {
    if (this.featureView.value?.feature.id === feature.id) {
      return;
    }
    clearNode(container);
    this.featureView.value = this.instantiationService.createInstance(ExtensionFeatureView, this.extensionId, this.manifest, feature);
    container.appendChild(this.featureView.value.domNode);
    this.layoutFeatureView();
  }
  getFeatures() {
    const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures().filter((feature) => {
      const renderer2 = this.getRenderer(feature);
      const shouldRender = renderer2?.shouldRender(this.manifest);
      renderer2?.dispose();
      return shouldRender;
    }).sort((a, b) => a.label.localeCompare(b.label));
    const renderer = this.getRenderer(runtimeStatusFeature);
    if (renderer?.shouldRender(this.manifest)) {
      features.splice(0, 0, runtimeStatusFeature);
    }
    renderer?.dispose();
    return features;
  }
  getRenderer(feature) {
    return feature.renderer ? this.instantiationService.createInstance(feature.renderer) : void 0;
  }
};
ExtensionFeaturesTab = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService)
], ExtensionFeaturesTab);
class ExtensionFeatureItemDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId() {
    return "extensionFeatureDescriptor";
  }
}
let ExtensionFeatureItemRenderer = class {
  constructor(extensionId, extensionFeaturesManagementService) {
    this.extensionId = extensionId;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.templateId = "extensionFeatureDescriptor";
  }
  renderTemplate(container) {
    container.classList.add("extension-feature-list-item");
    const label = append(container, $(".extension-feature-label"));
    const disabledElement = append(container, $(".extension-feature-disabled-label"));
    disabledElement.textContent = localize("revoked", "No Access");
    const statusElement = append(container, $(".extension-feature-status"));
    return { label, disabledElement, statusElement, disposables: new DisposableStore() };
  }
  renderElement(element, index, templateData) {
    templateData.disposables.clear();
    templateData.label.textContent = element.label;
    templateData.disabledElement.style.display = element.id === runtimeStatusFeature.id || this.extensionFeaturesManagementService.isEnabled(this.extensionId, element.id) ? "none" : "inherit";
    templateData.disposables.add(this.extensionFeaturesManagementService.onDidChangeEnablement(({ extension, featureId, enabled }) => {
      if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === element.id) {
        templateData.disabledElement.style.display = enabled ? "none" : "inherit";
      }
    }));
    const statusElementClassName = templateData.statusElement.className;
    const updateStatus = () => {
      const accessData = this.extensionFeaturesManagementService.getAccessData(this.extensionId, element.id);
      if (accessData?.current?.status) {
        templateData.statusElement.style.display = "inherit";
        templateData.statusElement.className = `${statusElementClassName} ${SeverityIcon.className(accessData.current.status.severity)}`;
      } else {
        templateData.statusElement.style.display = "none";
      }
    };
    updateStatus();
    templateData.disposables.add(this.extensionFeaturesManagementService.onDidChangeAccessData(({ extension, featureId }) => {
      if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === element.id) {
        updateStatus();
      }
    }));
  }
  disposeElement(element, index, templateData) {
    templateData.disposables.dispose();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
ExtensionFeatureItemRenderer = __decorateClass([
  __decorateParam(1, IExtensionFeaturesManagementService)
], ExtensionFeatureItemRenderer);
let ExtensionFeatureView = class extends Disposable {
  constructor(extensionId, manifest, feature, instantiationService, extensionFeaturesManagementService, dialogService, markdownRendererService) {
    super();
    this.extensionId = extensionId;
    this.manifest = manifest;
    this.feature = feature;
    this.instantiationService = instantiationService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.dialogService = dialogService;
    this.markdownRendererService = markdownRendererService;
    this.layoutParticipants = [];
    this.domNode = $(".extension-feature-content");
    this.create(this.domNode);
  }
  create(content) {
    const header = append(content, $(".feature-header"));
    const title = append(header, $(".feature-title"));
    title.textContent = this.feature.label;
    if (this.feature.access.canToggle) {
      const actionsContainer = append(header, $(".feature-actions"));
      const button = new Button(actionsContainer, defaultButtonStyles);
      this.updateButtonLabel(button);
      this._register(this.extensionFeaturesManagementService.onDidChangeEnablement(({ extension, featureId }) => {
        if (ExtensionIdentifier.equals(extension, this.extensionId) && featureId === this.feature.id) {
          this.updateButtonLabel(button);
        }
      }));
      this._register(button.onDidClick(async () => {
        const enabled = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id);
        const confirmationResult = await this.dialogService.confirm({
          title: localize("accessExtensionFeature", "Enable '{0}' Feature", this.feature.label),
          message: enabled ? localize("disableAccessExtensionFeatureMessage", "Would you like to revoke '{0}' extension to access '{1}' feature?", this.manifest.displayName ?? this.extensionId.value, this.feature.label) : localize("enableAccessExtensionFeatureMessage", "Would you like to allow '{0}' extension to access '{1}' feature?", this.manifest.displayName ?? this.extensionId.value, this.feature.label),
          custom: true,
          primaryButton: enabled ? localize("revoke", "Revoke Access") : localize("grant", "Allow Access"),
          cancelButton: localize("cancel", "Cancel")
        });
        if (confirmationResult.confirmed) {
          this.extensionFeaturesManagementService.setEnablement(this.extensionId, this.feature.id, !enabled);
        }
      }));
    }
    const body = append(content, $(".feature-body"));
    const bodyContent = $(".feature-body-content");
    const scrollableContent = this._register(new DomScrollableElement(bodyContent, {}));
    append(body, scrollableContent.getDomNode());
    this.layoutParticipants.push({ layout: () => scrollableContent.scanDomNode() });
    scrollableContent.scanDomNode();
    if (this.feature.description) {
      const description = append(bodyContent, $(".feature-description"));
      description.textContent = this.feature.description;
    }
    const accessData = this.extensionFeaturesManagementService.getAccessData(this.extensionId, this.feature.id);
    if (accessData?.current?.status) {
      append(bodyContent, $(
        ".feature-status",
        void 0,
        $(`span${ThemeIcon.asCSSSelector(accessData.current.status.severity === Severity.Error ? errorIcon : accessData.current.status.severity === Severity.Warning ? warningIcon : infoIcon)}`, void 0),
        $("span", void 0, accessData.current.status.message)
      ));
    }
    const featureContentElement = append(bodyContent, $(".feature-content"));
    if (this.feature.renderer) {
      const renderer = this.instantiationService.createInstance(this.feature.renderer);
      if (renderer.type === "table") {
        this.renderTableData(featureContentElement, renderer);
      } else if (renderer.type === "markdown") {
        this.renderMarkdownData(featureContentElement, renderer);
      } else if (renderer.type === "markdown+table") {
        this.renderMarkdownAndTableData(featureContentElement, renderer);
      } else if (renderer.type === "element") {
        this.renderElementData(featureContentElement, renderer);
      }
    }
  }
  updateButtonLabel(button) {
    button.label = this.extensionFeaturesManagementService.isEnabled(this.extensionId, this.feature.id) ? localize("revoke", "Revoke Access") : localize("enable", "Allow Access");
  }
  renderTableData(container, renderer) {
    const tableData = this._register(renderer.render(this.manifest));
    const tableDisposable = this._register(new MutableDisposable());
    if (tableData.onDidChange) {
      this._register(tableData.onDidChange((data) => {
        clearNode(container);
        tableDisposable.value = this.renderTable(data, container);
      }));
    }
    tableDisposable.value = this.renderTable(tableData.data, container);
  }
  renderTable(tableData, container) {
    const disposables = new DisposableStore();
    append(
      container,
      $(
        "table",
        void 0,
        $(
          "tr",
          void 0,
          ...tableData.headers.map((header) => $("th", void 0, header))
        ),
        ...tableData.rows.map((row) => {
          return $(
            "tr",
            void 0,
            ...row.map((rowData) => {
              if (typeof rowData === "string") {
                return $("td", void 0, $("p", void 0, rowData));
              }
              const data = Array.isArray(rowData) ? rowData : [rowData];
              return $("td", void 0, ...data.map((item) => {
                const result = [];
                if (isMarkdownString(rowData)) {
                  const element = $("", void 0);
                  this.renderMarkdown(rowData, element);
                  result.push(element);
                } else if (item instanceof ResolvedKeybinding) {
                  const element = $("");
                  const kbl = disposables.add(new KeybindingLabel(element, OS, defaultKeybindingLabelStyles));
                  kbl.set(item);
                  result.push(element);
                } else if (item instanceof Color) {
                  result.push($("span", { class: "colorBox", style: "background-color: " + Color.Format.CSS.format(item) }, ""));
                  result.push($("code", void 0, Color.Format.CSS.formatHex(item)));
                }
                return result;
              }).flat());
            })
          );
        })
      )
    );
    return disposables;
  }
  renderMarkdownAndTableData(container, renderer) {
    const markdownAndTableData = this._register(renderer.render(this.manifest));
    if (markdownAndTableData.onDidChange) {
      this._register(markdownAndTableData.onDidChange((data) => {
        clearNode(container);
        this.renderMarkdownAndTable(data, container);
      }));
    }
    this.renderMarkdownAndTable(markdownAndTableData.data, container);
  }
  renderMarkdownData(container, renderer) {
    container.classList.add("markdown");
    const markdownData = this._register(renderer.render(this.manifest));
    if (markdownData.onDidChange) {
      this._register(markdownData.onDidChange((data) => {
        clearNode(container);
        this.renderMarkdown(data, container);
      }));
    }
    this.renderMarkdown(markdownData.data, container);
  }
  renderMarkdown(markdown, container) {
    const { element } = this._register(this.markdownRendererService.render({
      value: markdown.value,
      isTrusted: markdown.isTrusted,
      supportThemeIcons: true
    }));
    append(container, element);
  }
  renderMarkdownAndTable(data, container) {
    for (const markdownOrTable of data) {
      if (isMarkdownString(markdownOrTable)) {
        const element = $("", void 0);
        this.renderMarkdown(markdownOrTable, element);
        append(container, element);
      } else {
        const tableElement = append(container, $("table"));
        this.renderTable(markdownOrTable, tableElement);
      }
    }
  }
  renderElementData(container, renderer) {
    const elementData = this._register(renderer.render(this.manifest));
    if (elementData.onDidChange) {
      this._register(elementData.onDidChange((data) => {
        clearNode(container);
        container.appendChild(data);
      }));
    }
    container.appendChild(elementData.data);
  }
  layout(height, width) {
    this.layoutParticipants.forEach((p) => p.layout(height, width));
  }
};
ExtensionFeatureView = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IExtensionFeaturesManagementService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IMarkdownRendererService)
], ExtensionFeatureView);
export {
  ExtensionFeaturesTab
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25GZWF0dXJlc1RhYi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgY2xlYXJOb2RlLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uLCBTaXppbmcsIFNwbGl0VmlldyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvciwgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElFeHRlbnNpb25GZWF0dXJlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlTWFya2Rvd25SZW5kZXJlciwgSVRhYmxlRGF0YSwgSVJlbmRlcmVkRGF0YSwgSUV4dGVuc2lvbkZlYXR1cmVNYXJrZG93bkFuZFRhYmxlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RXh0ZW5zaW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBJTGlzdFJlbmRlcmVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBnZXRFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgUEFORUxfU0VDVElPTl9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgVGhlbWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBlcnJvckljb24sIGluZm9JY29uLCB3YXJuaW5nSWNvbiB9IGZyb20gJy4vZXh0ZW5zaW9uc0ljb25zLmpzJztcbmltcG9ydCB7IFNldmVyaXR5SWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZXZlcml0eUljb24vc2V2ZXJpdHlJY29uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZywgaXNNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBmb3JlZ3JvdW5kLCBjaGFydEF4aXMsIGNoYXJ0R3VpZGUsIGNoYXJ0TGluZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uRmVhdHVyZUVsZW1lbnRSZW5kZXJlciBleHRlbmRzIElFeHRlbnNpb25GZWF0dXJlUmVuZGVyZXIge1xuXHR0eXBlOiAnZWxlbWVudCc7XG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxIVE1MRWxlbWVudD47XG59XG5cbmNsYXNzIFJ1bnRpbWVTdGF0dXNNYXJrZG93blJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlRWxlbWVudFJlbmRlcmVyIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAncnVudGltZVN0YXR1cyc7XG5cdHJlYWRvbmx5IHR5cGUgPSAnZWxlbWVudCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoZ2V0RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSk7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5zb21lKGUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZS5pZGVudGlmaWVyLCBleHRlbnNpb25JZCkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAhIW1hbmlmZXN0Lm1haW4gfHwgISFtYW5pZmVzdC5icm93c2VyO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPEhUTUxFbGVtZW50PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihnZXRFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpKTtcblx0XHRjb25zdCBlbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPEhUTUxFbGVtZW50PigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cyhlID0+IHtcblx0XHRcdGlmIChlLnNvbWUoZXh0ZW5zaW9uID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbiwgZXh0ZW5zaW9uSWQpKSkge1xuXHRcdFx0XHRlbWl0dGVyLmZpcmUodGhpcy5jcmVhdGVFbGVtZW50KG1hbmlmZXN0LCBkaXNwb3NhYmxlcykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWNjZXNzRGF0YShlID0+IGVtaXR0ZXIuZmlyZSh0aGlzLmNyZWF0ZUVsZW1lbnQobWFuaWZlc3QsIGRpc3Bvc2FibGVzKSkpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRkYXRhOiB0aGlzLmNyZWF0ZUVsZW1lbnQobWFuaWZlc3QsIGRpc3Bvc2FibGVzKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVsZW1lbnQobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjb250YWluZXIgPSAkKCcucnVudGltZS1zdGF0dXMnKTtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGdldEV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSkpO1xuXHRcdGNvbnN0IHN0YXR1cyA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb25zU3RhdHVzKClbZXh0ZW5zaW9uSWQudmFsdWVdO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5zb21lKGV4dGVuc2lvbiA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uSWQpKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdFx0ZGF0YS5hcHBlbmRNYXJrZG93bihgIyMjICR7bG9jYWxpemUoJ2FjdGl2YXRpb24nLCBcIkFjdGl2YXRpb25cIil9XFxuXFxuYCk7XG5cdFx0XHRpZiAoc3RhdHVzLmFjdGl2YXRpb25UaW1lcykge1xuXHRcdFx0XHRpZiAoc3RhdHVzLmFjdGl2YXRpb25UaW1lcy5hY3RpdmF0aW9uUmVhc29uLnN0YXJ0dXApIHtcblx0XHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGBBY3RpdmF0ZWQgb24gU3RhcnR1cDogXFxgJHtzdGF0dXMuYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRlQ2FsbFRpbWV9bXNcXGBgKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGBBY3RpdmF0ZWQgYnkgXFxgJHtzdGF0dXMuYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRpb25SZWFzb24uYWN0aXZhdGlvbkV2ZW50fVxcYCBldmVudDogXFxgJHtzdGF0dXMuYWN0aXZhdGlvblRpbWVzLmFjdGl2YXRlQ2FsbFRpbWV9bXNcXGBgKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGF0YS5hcHBlbmRNYXJrZG93bignTm90IHlldCBhY3RpdmF0ZWQnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd24oZGF0YSwgY29udGFpbmVyLCBkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXHRcdGNvbnN0IGZlYXR1cmVzID0gUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkuZ2V0RXh0ZW5zaW9uRmVhdHVyZXMoKTtcblx0XHRmb3IgKGNvbnN0IGZlYXR1cmUgb2YgZmVhdHVyZXMpIHtcblx0XHRcdGNvbnN0IGFjY2Vzc0RhdGEgPSB0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UuZ2V0QWNjZXNzRGF0YShleHRlbnNpb25JZCwgZmVhdHVyZS5pZCk7XG5cdFx0XHRpZiAoYWNjZXNzRGF0YSkge1xuXHRcdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duKG5ldyBNYXJrZG93blN0cmluZyhgXFxuICMjIyAke2xvY2FsaXplKCdsYWJlbCcsIFwiezB9IFVzYWdlXCIsIGZlYXR1cmUubGFiZWwpfVxcblxcbmApLCBjb250YWluZXIsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0aWYgKGFjY2Vzc0RhdGEuYWNjZXNzVGltZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhcHBlbmQoY29udGFpbmVyLFxuXHRcdFx0XHRcdFx0JCgnLmZlYXR1cmUtY2hhcnQtZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdjaGFydERlc2NyaXB0aW9uJywgXCJUaGVyZSB3ZXJlIHswfSB7MX0gcmVxdWVzdHMgZnJvbSB0aGlzIGV4dGVuc2lvbiBpbiB0aGUgbGFzdCAzMCBkYXlzLlwiLCBhY2Nlc3NEYXRhPy5hY2Nlc3NUaW1lcy5sZW5ndGgsIGZlYXR1cmUuYWNjZXNzRGF0YUxhYmVsID8/IGZlYXR1cmUubGFiZWwpKSk7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb24uc3R5bGUubWFyZ2luQm90dG9tID0gJzhweCc7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJSZXF1ZXN0c0NoYXJ0KGNvbnRhaW5lciwgYWNjZXNzRGF0YS5hY2Nlc3NUaW1lcywgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IGFjY2Vzc0RhdGE/LmN1cnJlbnQ/LnN0YXR1cztcblx0XHRcdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRcdFx0XHRpZiAoc3RhdHVzPy5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuRXJyb3IpIHtcblx0XHRcdFx0XHRcdGRhdGEuYXBwZW5kTWFya2Rvd24oYCQoJHtlcnJvckljb24uaWR9KSAke3N0YXR1cy5tZXNzYWdlfVxcblxcbmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc3RhdHVzPy5zZXZlcml0eSA9PT0gU2V2ZXJpdHkuV2FybmluZykge1xuXHRcdFx0XHRcdFx0ZGF0YS5hcHBlbmRNYXJrZG93bihgJCgke3dhcm5pbmdJY29uLmlkfSkgJHtzdGF0dXMubWVzc2FnZX1cXG5cXG5gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGRhdGEudmFsdWUpIHtcblx0XHRcdFx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd24oZGF0YSwgY29udGFpbmVyLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChzdGF0dXMucnVudGltZUVycm9ycy5sZW5ndGggfHwgc3RhdHVzLm1lc3NhZ2VzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdFx0aWYgKHN0YXR1cy5ydW50aW1lRXJyb3JzLmxlbmd0aCkge1xuXHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGBcXG4gIyMjICR7bG9jYWxpemUoJ3VuY2F1Z2h0IGVycm9ycycsIFwiVW5jYXVnaHQgRXJyb3JzICh7MH0pXCIsIHN0YXR1cy5ydW50aW1lRXJyb3JzLmxlbmd0aCl9XFxuYCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZXJyb3Igb2Ygc3RhdHVzLnJ1bnRpbWVFcnJvcnMpIHtcblx0XHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGAkKCR7Q29kaWNvbi5lcnJvci5pZH0pJm5ic3A7JHtnZXRFcnJvck1lc3NhZ2UoZXJyb3IpfVxcblxcbmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdHVzLm1lc3NhZ2VzLmxlbmd0aCkge1xuXHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGBcXG4gIyMjICR7bG9jYWxpemUoJ21lc3NhYWdlcycsIFwiTWVzc2FnZXMgKHswfSlcIiwgc3RhdHVzLm1lc3NhZ2VzLmxlbmd0aCl9XFxuYCk7XG5cdFx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiBzdGF0dXMubWVzc2FnZXMpIHtcblx0XHRcdFx0XHRkYXRhLmFwcGVuZE1hcmtkb3duKGAkKCR7KG1lc3NhZ2UudHlwZSA9PT0gU2V2ZXJpdHkuRXJyb3IgPyBDb2RpY29uLmVycm9yIDogbWVzc2FnZS50eXBlID09PSBTZXZlcml0eS5XYXJuaW5nID8gQ29kaWNvbi53YXJuaW5nIDogQ29kaWNvbi5pbmZvKS5pZH0pJm5ic3A7JHttZXNzYWdlLm1lc3NhZ2V9XFxuXFxuYCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChkYXRhLnZhbHVlKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd24oZGF0YSwgY29udGFpbmVyLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duKG1hcmtkb3duOiBJTWFya2Rvd25TdHJpbmcsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRjb25zdCB7IGVsZW1lbnQgfSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcih7XG5cdFx0XHR2YWx1ZTogbWFya2Rvd24udmFsdWUsXG5cdFx0XHRpc1RydXN0ZWQ6IG1hcmtkb3duLmlzVHJ1c3RlZCxcblx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlXG5cdFx0fSkpO1xuXHRcdGFwcGVuZChjb250YWluZXIsIGVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJSZXF1ZXN0c0NoYXJ0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGFjY2Vzc1RpbWVzOiBEYXRlW10sIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHRjb25zdCB3aWR0aCA9IDQ1MDtcblx0XHRjb25zdCBoZWlnaHQgPSAyNTA7XG5cdFx0Y29uc3QgbWFyZ2luID0geyB0b3A6IDAsIHJpZ2h0OiA0LCBib3R0b206IDIwLCBsZWZ0OiA0IH07XG5cdFx0Y29uc3QgaW5uZXJXaWR0aCA9IHdpZHRoIC0gbWFyZ2luLmxlZnQgLSBtYXJnaW4ucmlnaHQ7XG5cdFx0Y29uc3QgaW5uZXJIZWlnaHQgPSBoZWlnaHQgLSBtYXJnaW4udG9wIC0gbWFyZ2luLmJvdHRvbTtcblxuXHRcdGNvbnN0IGNoYXJ0Q29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmZlYXR1cmUtY2hhcnQtY29udGFpbmVyJykpO1xuXHRcdGNoYXJ0Q29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblxuXHRcdGNvbnN0IHRvb2x0aXAgPSBhcHBlbmQoY2hhcnRDb250YWluZXIsICQoJy5mZWF0dXJlLWNoYXJ0LXRvb2x0aXAnKSk7XG5cdFx0dG9vbHRpcC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0dG9vbHRpcC5zdHlsZS53aWR0aCA9ICcwcHgnO1xuXHRcdHRvb2x0aXAuc3R5bGUuaGVpZ2h0ID0gJzBweCc7XG5cblx0XHRsZXQgbWF4Q291bnQgPSAxMDA7XG5cdFx0Y29uc3QgbWFwID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRmb3IgKGNvbnN0IGFjY2Vzc1RpbWUgb2YgYWNjZXNzVGltZXMpIHtcblx0XHRcdGNvbnN0IGRheSA9IGAke2FjY2Vzc1RpbWUuZ2V0RGF0ZSgpfSAke2FjY2Vzc1RpbWUudG9Mb2NhbGVTdHJpbmcoJ2RlZmF1bHQnLCB7IG1vbnRoOiAnc2hvcnQnIH0pfWA7XG5cdFx0XHRtYXAuc2V0KGRheSwgKG1hcC5nZXQoZGF5KSA/PyAwKSArIDEpO1xuXHRcdFx0bWF4Q291bnQgPSBNYXRoLm1heChtYXhDb3VudCwgbWFwLmdldChkYXkpISk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm93ID0gbmV3IERhdGUoKTtcblx0XHR0eXBlIFBvaW50ID0geyB4OiBudW1iZXI7IHk6IG51bWJlcjsgZGF0ZTogc3RyaW5nOyBjb3VudDogbnVtYmVyIH07XG5cdFx0Y29uc3QgcG9pbnRzOiBQb2ludFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPD0gMzA7IGkrKykge1xuXHRcdFx0Y29uc3QgZGF0ZSA9IG5ldyBEYXRlKG5vdyk7XG5cdFx0XHRkYXRlLnNldERhdGUobm93LmdldERhdGUoKSAtICgzMCAtIGkpKTtcblx0XHRcdGNvbnN0IGRhdGVTdHJpbmcgPSBgJHtkYXRlLmdldERhdGUoKX0gJHtkYXRlLnRvTG9jYWxlU3RyaW5nKCdkZWZhdWx0JywgeyBtb250aDogJ3Nob3J0JyB9KX1gO1xuXHRcdFx0Y29uc3QgY291bnQgPSBtYXAuZ2V0KGRhdGVTdHJpbmcpID8/IDA7XG5cdFx0XHRjb25zdCB4ID0gKGkgLyAzMCkgKiBpbm5lcldpZHRoO1xuXHRcdFx0Y29uc3QgeSA9IGlubmVySGVpZ2h0IC0gKGNvdW50IC8gbWF4Q291bnQpICogaW5uZXJIZWlnaHQ7XG5cdFx0XHRwb2ludHMucHVzaCh7IHgsIHksIGRhdGU6IGRhdGVTdHJpbmcsIGNvdW50IH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXJ0ID0gYXBwZW5kKGNoYXJ0Q29udGFpbmVyLCAkKCcuZmVhdHVyZS1jaGFydCcpKTtcblx0XHRjb25zdCBzdmcgPSBhcHBlbmQoY2hhcnQsICQuU1ZHKCdzdmcnKSk7XG5cdFx0c3ZnLnNldEF0dHJpYnV0ZSgnd2lkdGgnLCBgJHt3aWR0aH1weGApO1xuXHRcdHN2Zy5zZXRBdHRyaWJ1dGUoJ2hlaWdodCcsIGAke2hlaWdodH1weGApO1xuXHRcdHN2Zy5zZXRBdHRyaWJ1dGUoJ3ZpZXdCb3gnLCBgMCAwICR7d2lkdGh9ICR7aGVpZ2h0fWApO1xuXG5cdFx0Y29uc3QgZyA9ICQuU1ZHKCdnJyk7XG5cdFx0Zy5zZXRBdHRyaWJ1dGUoJ3RyYW5zZm9ybScsIGB0cmFuc2xhdGUoJHttYXJnaW4ubGVmdH0sJHttYXJnaW4udG9wfSlgKTtcblx0XHRzdmcuYXBwZW5kQ2hpbGQoZyk7XG5cblx0XHRjb25zdCB4QXhpc0xpbmUgPSAkLlNWRygnbGluZScpO1xuXHRcdHhBeGlzTGluZS5zZXRBdHRyaWJ1dGUoJ3gxJywgJzAnKTtcblx0XHR4QXhpc0xpbmUuc2V0QXR0cmlidXRlKCd5MScsIGAke2lubmVySGVpZ2h0fWApO1xuXHRcdHhBeGlzTGluZS5zZXRBdHRyaWJ1dGUoJ3gyJywgYCR7aW5uZXJXaWR0aH1gKTtcblx0XHR4QXhpc0xpbmUuc2V0QXR0cmlidXRlKCd5MicsIGAke2lubmVySGVpZ2h0fWApO1xuXHRcdHhBeGlzTGluZS5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsIGFzQ3NzVmFyaWFibGUoY2hhcnRBeGlzKSk7XG5cdFx0eEF4aXNMaW5lLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgJzFweCcpO1xuXHRcdGcuYXBwZW5kQ2hpbGQoeEF4aXNMaW5lKTtcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDw9IDMwOyBpICs9IDcpIHtcblx0XHRcdGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShub3cpO1xuXHRcdFx0ZGF0ZS5zZXREYXRlKG5vdy5nZXREYXRlKCkgLSAoMzAgLSBpKSk7XG5cdFx0XHRjb25zdCBkYXRlU3RyaW5nID0gYCR7ZGF0ZS5nZXREYXRlKCl9ICR7ZGF0ZS50b0xvY2FsZVN0cmluZygnZGVmYXVsdCcsIHsgbW9udGg6ICdzaG9ydCcgfSl9YDtcblx0XHRcdGNvbnN0IHggPSAoaSAvIDMwKSAqIGlubmVyV2lkdGg7XG5cblx0XHRcdC8vIEFkZCB2ZXJ0aWNhbCBsaW5lXG5cdFx0XHRjb25zdCB0aWNrID0gJC5TVkcoJ2xpbmUnKTtcblx0XHRcdHRpY2suc2V0QXR0cmlidXRlKCd4MScsIGAke3h9YCk7XG5cdFx0XHR0aWNrLnNldEF0dHJpYnV0ZSgneTEnLCBgJHtpbm5lckhlaWdodH1gKTtcblx0XHRcdHRpY2suc2V0QXR0cmlidXRlKCd4MicsIGAke3h9YCk7XG5cdFx0XHR0aWNrLnNldEF0dHJpYnV0ZSgneTInLCBgJHtpbm5lckhlaWdodCArIDEwfWApO1xuXHRcdFx0dGljay5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsIGFzQ3NzVmFyaWFibGUoY2hhcnRBeGlzKSk7XG5cdFx0XHR0aWNrLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgJzFweCcpO1xuXHRcdFx0Zy5hcHBlbmRDaGlsZCh0aWNrKTtcblxuXHRcdFx0Y29uc3QgcnVsZXIgPSAkLlNWRygnbGluZScpO1xuXHRcdFx0cnVsZXIuc2V0QXR0cmlidXRlKCd4MScsIGAke3h9YCk7XG5cdFx0XHRydWxlci5zZXRBdHRyaWJ1dGUoJ3kxJywgYDBgKTtcblx0XHRcdHJ1bGVyLnNldEF0dHJpYnV0ZSgneDInLCBgJHt4fWApO1xuXHRcdFx0cnVsZXIuc2V0QXR0cmlidXRlKCd5MicsIGAke2lubmVySGVpZ2h0fWApO1xuXHRcdFx0cnVsZXIuc2V0QXR0cmlidXRlKCdzdHJva2UnLCBhc0Nzc1ZhcmlhYmxlKGNoYXJ0R3VpZGUpKTtcblx0XHRcdHJ1bGVyLnNldEF0dHJpYnV0ZSgnc3Ryb2tlLXdpZHRoJywgJzFweCcpO1xuXHRcdFx0Zy5hcHBlbmRDaGlsZChydWxlcik7XG5cblx0XHRcdGNvbnN0IHhBeGlzRGF0ZSA9ICQuU1ZHKCd0ZXh0Jyk7XG5cdFx0XHR4QXhpc0RhdGUuc2V0QXR0cmlidXRlKCd4JywgYCR7eH1gKTtcblx0XHRcdHhBeGlzRGF0ZS5zZXRBdHRyaWJ1dGUoJ3knLCBgJHtoZWlnaHR9YCk7IC8vIEFkanVzdGVkIHkgcG9zaXRpb24gdG8gYmUgd2l0aGluIHRoZSBTVkcgdmlldyBwb3J0XG5cdFx0XHR4QXhpc0RhdGUuc2V0QXR0cmlidXRlKCd0ZXh0LWFuY2hvcicsICdtaWRkbGUnKTtcblx0XHRcdHhBeGlzRGF0ZS5zZXRBdHRyaWJ1dGUoJ2ZpbGwnLCBhc0Nzc1ZhcmlhYmxlKGZvcmVncm91bmQpKTtcblx0XHRcdHhBeGlzRGF0ZS5zZXRBdHRyaWJ1dGUoJ2ZvbnQtc2l6ZScsICcxMHB4Jyk7XG5cdFx0XHR4QXhpc0RhdGUudGV4dENvbnRlbnQgPSBkYXRlU3RyaW5nO1xuXHRcdFx0Zy5hcHBlbmRDaGlsZCh4QXhpc0RhdGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmUgPSAkLlNWRygncG9seWxpbmUnKTtcblx0XHRsaW5lLnNldEF0dHJpYnV0ZSgnZmlsbCcsICdub25lJyk7XG5cdFx0bGluZS5zZXRBdHRyaWJ1dGUoJ3N0cm9rZScsIGFzQ3NzVmFyaWFibGUoY2hhcnRMaW5lKSk7XG5cdFx0bGluZS5zZXRBdHRyaWJ1dGUoJ3N0cm9rZS13aWR0aCcsIGAycHhgKTtcblx0XHRsaW5lLnNldEF0dHJpYnV0ZSgncG9pbnRzJywgcG9pbnRzLm1hcChwID0+IGAke3AueH0sJHtwLnl9YCkuam9pbignICcpKTtcblx0XHRnLmFwcGVuZENoaWxkKGxpbmUpO1xuXG5cdFx0Y29uc3QgaGlnaGxpZ2h0Q2lyY2xlID0gJC5TVkcoJ2NpcmNsZScpO1xuXHRcdGhpZ2hsaWdodENpcmNsZS5zZXRBdHRyaWJ1dGUoJ3InLCBgNHB4YCk7XG5cdFx0aGlnaGxpZ2h0Q2lyY2xlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Zy5hcHBlbmRDaGlsZChoaWdobGlnaHRDaXJjbGUpO1xuXG5cdFx0Y29uc3QgaG92ZXJEaXNwb3NhYmxlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdFx0Y29uc3QgbW91c2VNb3ZlTGlzdGVuZXIgPSAoZXZlbnQ6IE1vdXNlRXZlbnQpOiB2b2lkID0+IHtcblx0XHRcdGNvbnN0IHJlY3QgPSBzdmcuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRjb25zdCBtb3VzZVggPSBldmVudC5jbGllbnRYIC0gcmVjdC5sZWZ0IC0gbWFyZ2luLmxlZnQ7XG5cblx0XHRcdGxldCBjbG9zZXN0UG9pbnQ6IFBvaW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IG1pbkRpc3RhbmNlID0gSW5maW5pdHk7XG5cblx0XHRcdHBvaW50cy5mb3JFYWNoKHBvaW50ID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzdGFuY2UgPSBNYXRoLmFicyhwb2ludC54IC0gbW91c2VYKTtcblx0XHRcdFx0aWYgKGRpc3RhbmNlIDwgbWluRGlzdGFuY2UpIHtcblx0XHRcdFx0XHRtaW5EaXN0YW5jZSA9IGRpc3RhbmNlO1xuXHRcdFx0XHRcdGNsb3Nlc3RQb2ludCA9IHBvaW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGNsb3Nlc3RQb2ludCkge1xuXHRcdFx0XHRoaWdobGlnaHRDaXJjbGUuc2V0QXR0cmlidXRlKCdjeCcsIGAke2Nsb3Nlc3RQb2ludC54fWApO1xuXHRcdFx0XHRoaWdobGlnaHRDaXJjbGUuc2V0QXR0cmlidXRlKCdjeScsIGAke2Nsb3Nlc3RQb2ludC55fWApO1xuXHRcdFx0XHRoaWdobGlnaHRDaXJjbGUuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHRcdHRvb2x0aXAuc3R5bGUubGVmdCA9IGAke2Nsb3Nlc3RQb2ludC54ICsgMjR9cHhgO1xuXHRcdFx0XHR0b29sdGlwLnN0eWxlLnRvcCA9IGAke2Nsb3Nlc3RQb2ludC55ICsgMTR9cHhgO1xuXHRcdFx0XHRob3ZlckRpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoYCR7Y2xvc2VzdFBvaW50LmRhdGV9OiAke2Nsb3Nlc3RQb2ludC5jb3VudH0gcmVxdWVzdHNgKSxcblx0XHRcdFx0XHR0YXJnZXQ6IHRvb2x0aXAsXG5cdFx0XHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRcdFx0c2hvd1BvaW50ZXI6IHRydWUsXG5cdFx0XHRcdFx0XHRza2lwRmFkZUluQW5pbWF0aW9uOiB0cnVlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRob3ZlckRpc3Bvc2FibGUudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHN2ZywgRXZlbnRUeXBlLk1PVVNFX01PVkUsIG1vdXNlTW92ZUxpc3RlbmVyKSk7XG5cblx0XHRjb25zdCBtb3VzZUxlYXZlTGlzdGVuZXIgPSAoKSA9PiB7XG5cdFx0XHRoaWdobGlnaHRDaXJjbGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdGhvdmVyRGlzcG9zYWJsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc3ZnLCBFdmVudFR5cGUuTU9VU0VfTEVBVkUsIG1vdXNlTGVhdmVMaXN0ZW5lcikpO1xuXHR9XG59XG5cblxuaW50ZXJmYWNlIElMYXlvdXRQYXJ0aWNpcGFudCB7XG5cdGxheW91dChoZWlnaHQ/OiBudW1iZXIsIHdpZHRoPzogbnVtYmVyKTogdm9pZDtcbn1cblxuY29uc3QgcnVudGltZVN0YXR1c0ZlYXR1cmUgPSB7XG5cdGlkOiBSdW50aW1lU3RhdHVzTWFya2Rvd25SZW5kZXJlci5JRCxcblx0bGFiZWw6IGxvY2FsaXplKCdydW50aW1lJywgXCJSdW50aW1lIFN0YXR1c1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKFJ1bnRpbWVTdGF0dXNNYXJrZG93blJlbmRlcmVyKSxcbn07XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25GZWF0dXJlc1RhYiBleHRlbmRzIFRoZW1hYmxlIHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZlYXR1cmVWaWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEV4dGVuc2lvbkZlYXR1cmVWaWV3PigpKTtcblx0cHJpdmF0ZSBmZWF0dXJlVmlld0RpbWVuc2lvbj86IHsgaGVpZ2h0PzogbnVtYmVyOyB3aWR0aD86IG51bWJlciB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0UGFydGljaXBhbnRzOiBJTGF5b3V0UGFydGljaXBhbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZlYXR1cmU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIodGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMuZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihnZXRFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpKTtcblx0XHR0aGlzLmRvbU5vZGUgPSAkKCdkaXYuc3ViY29udGVudC5mZWF0dXJlLWNvbnRyaWJ1dGlvbnMnKTtcblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHR9XG5cblx0bGF5b3V0KGhlaWdodD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmxheW91dFBhcnRpY2lwYW50cy5mb3JFYWNoKHBhcnRpY2lwYW50ID0+IHBhcnRpY2lwYW50LmxheW91dChoZWlnaHQsIHdpZHRoKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBmZWF0dXJlcyA9IHRoaXMuZ2V0RmVhdHVyZXMoKTtcblx0XHRpZiAoZmVhdHVyZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhcHBlbmQoJCgnLm5vLWZlYXR1cmVzJyksIHRoaXMuZG9tTm9kZSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9GZWF0dXJlcycsIFwiTm8gZmVhdHVyZXMgY29udHJpYnV0ZWQuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNwbGl0VmlldyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTcGxpdFZpZXc8bnVtYmVyPih0aGlzLmRvbU5vZGUsIHtcblx0XHRcdG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMLFxuXHRcdFx0cHJvcG9ydGlvbmFsTGF5b3V0OiB0cnVlXG5cdFx0fSkpO1xuXHRcdHRoaXMubGF5b3V0UGFydGljaXBhbnRzLnB1c2goe1xuXHRcdFx0bGF5b3V0OiAoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpID0+IHtcblx0XHRcdFx0c3BsaXRWaWV3LmVsLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodCAtIDE0fXB4YDtcblx0XHRcdFx0c3BsaXRWaWV3LmxheW91dCh3aWR0aCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBmZWF0dXJlc0xpc3RDb250YWluZXIgPSAkKCcuZmVhdHVyZXMtbGlzdC1jb250YWluZXInKTtcblx0XHRjb25zdCBsaXN0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVGZWF0dXJlc0xpc3QoZmVhdHVyZXNMaXN0Q29udGFpbmVyKSk7XG5cdFx0bGlzdC5zcGxpY2UoMCwgbGlzdC5sZW5ndGgsIGZlYXR1cmVzKTtcblxuXHRcdGNvbnN0IGZlYXR1cmVWaWV3Q29udGFpbmVyID0gJCgnLmZlYXR1cmUtdmlldy1jb250YWluZXInKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsaXN0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0Y29uc3QgZmVhdHVyZSA9IGUuZWxlbWVudHNbMF07XG5cdFx0XHRpZiAoZmVhdHVyZSkge1xuXHRcdFx0XHR0aGlzLnNob3dGZWF0dXJlVmlldyhmZWF0dXJlLCBmZWF0dXJlVmlld0NvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmZlYXR1cmUgPyBmZWF0dXJlcy5maW5kSW5kZXgoZiA9PiBmLmlkID09PSB0aGlzLmZlYXR1cmUpIDogMDtcblx0XHRsaXN0LnNldFNlbGVjdGlvbihbaW5kZXggPT09IC0xID8gMCA6IGluZGV4XSk7XG5cblx0XHRzcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IGZlYXR1cmVzTGlzdENvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiAxMDAsXG5cdFx0XHRtYXhpbXVtU2l6ZTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHRcdFx0bGF5b3V0OiAod2lkdGgsIF8sIGhlaWdodCkgPT4ge1xuXHRcdFx0XHRmZWF0dXJlc0xpc3RDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0XHRcdGxpc3QubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHRcdFx0fVxuXHRcdH0sIDIwMCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdHNwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogZmVhdHVyZVZpZXdDb250YWluZXIsXG5cdFx0XHRtaW5pbXVtU2l6ZTogNTAwLFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdGxheW91dDogKHdpZHRoLCBfLCBoZWlnaHQpID0+IHtcblx0XHRcdFx0ZmVhdHVyZVZpZXdDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdFx0XHRcdHRoaXMuZmVhdHVyZVZpZXdEaW1lbnNpb24gPSB7IGhlaWdodCwgd2lkdGggfTtcblx0XHRcdFx0dGhpcy5sYXlvdXRGZWF0dXJlVmlldygpO1xuXHRcdFx0fVxuXHRcdH0sIFNpemluZy5EaXN0cmlidXRlLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0c3BsaXRWaWV3LnN0eWxlKHtcblx0XHRcdHNlcGFyYXRvckJvcmRlcjogdGhpcy50aGVtZS5nZXRDb2xvcihQQU5FTF9TRUNUSU9OX0JPUkRFUikhXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUZlYXR1cmVzTGlzdChjb250YWluZXI6IEhUTUxFbGVtZW50KTogV29ya2JlbmNoTGlzdDxJRXh0ZW5zaW9uRmVhdHVyZURlc2NyaXB0b3I+IHtcblx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uRmVhdHVyZUl0ZW1SZW5kZXJlciwgdGhpcy5leHRlbnNpb25JZCk7XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgRXh0ZW5zaW9uRmVhdHVyZUl0ZW1EZWxlZ2F0ZSgpO1xuXHRcdGNvbnN0IGxpc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaExpc3QsICdFeHRlbnNpb25GZWF0dXJlc0xpc3QnLCBhcHBlbmQoY29udGFpbmVyLCAkKCcuZmVhdHVyZXMtbGlzdC13cmFwcGVyJykpLCBkZWxlZ2F0ZSwgW3JlbmRlcmVyXSwge1xuXHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsKGV4dGVuc2lvbkZlYXR1cmU6IElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvciB8IG51bGwpOiBzdHJpbmcge1xuXHRcdFx0XHRcdHJldHVybiBleHRlbnNpb25GZWF0dXJlPy5sYWJlbCA/PyAnJztcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdleHRlbnNpb24gZmVhdHVyZXMgbGlzdCcsIFwiRXh0ZW5zaW9uIEZlYXR1cmVzXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IHRydWVcblx0XHR9KSBhcyBXb3JrYmVuY2hMaXN0PElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvcj47XG5cdFx0cmV0dXJuIGxpc3Q7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dEZlYXR1cmVWaWV3KCk6IHZvaWQge1xuXHRcdHRoaXMuZmVhdHVyZVZpZXcudmFsdWU/LmxheW91dCh0aGlzLmZlYXR1cmVWaWV3RGltZW5zaW9uPy5oZWlnaHQsIHRoaXMuZmVhdHVyZVZpZXdEaW1lbnNpb24/LndpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0ZlYXR1cmVWaWV3KGZlYXR1cmU6IElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvciwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmZlYXR1cmVWaWV3LnZhbHVlPy5mZWF0dXJlLmlkID09PSBmZWF0dXJlLmlkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNsZWFyTm9kZShjb250YWluZXIpO1xuXHRcdHRoaXMuZmVhdHVyZVZpZXcudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4dGVuc2lvbkZlYXR1cmVWaWV3LCB0aGlzLmV4dGVuc2lvbklkLCB0aGlzLm1hbmlmZXN0LCBmZWF0dXJlKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5mZWF0dXJlVmlldy52YWx1ZS5kb21Ob2RlKTtcblx0XHR0aGlzLmxheW91dEZlYXR1cmVWaWV3KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEZlYXR1cmVzKCk6IElFeHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvcltdIHtcblx0XHRjb25zdCBmZWF0dXJlcyA9IFJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpXG5cdFx0XHQuZ2V0RXh0ZW5zaW9uRmVhdHVyZXMoKS5maWx0ZXIoZmVhdHVyZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5nZXRSZW5kZXJlcihmZWF0dXJlKTtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkUmVuZGVyID0gcmVuZGVyZXI/LnNob3VsZFJlbmRlcih0aGlzLm1hbmlmZXN0KTtcblx0XHRcdFx0cmVuZGVyZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHNob3VsZFJlbmRlcjtcblx0XHRcdH0pLnNvcnQoKGEsIGIpID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKSk7XG5cblx0XHRjb25zdCByZW5kZXJlciA9IHRoaXMuZ2V0UmVuZGVyZXIocnVudGltZVN0YXR1c0ZlYXR1cmUpO1xuXHRcdGlmIChyZW5kZXJlcj8uc2hvdWxkUmVuZGVyKHRoaXMubWFuaWZlc3QpKSB7XG5cdFx0XHRmZWF0dXJlcy5zcGxpY2UoMCwgMCwgcnVudGltZVN0YXR1c0ZlYXR1cmUpO1xuXHRcdH1cblx0XHRyZW5kZXJlcj8uZGlzcG9zZSgpO1xuXHRcdHJldHVybiBmZWF0dXJlcztcblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVuZGVyZXIoZmVhdHVyZTogSUV4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yKTogSUV4dGVuc2lvbkZlYXR1cmVSZW5kZXJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZlYXR1cmUucmVuZGVyZXIgPyB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGZlYXR1cmUucmVuZGVyZXIpIDogdW5kZWZpbmVkO1xuXHR9XG5cbn1cblxuaW50ZXJmYWNlIElFeHRlbnNpb25GZWF0dXJlSXRlbVRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGlzYWJsZWRFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc3RhdHVzRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmNsYXNzIEV4dGVuc2lvbkZlYXR1cmVJdGVtRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJRXh0ZW5zaW9uRmVhdHVyZURlc2NyaXB0b3I+IHtcblx0Z2V0SGVpZ2h0KCkgeyByZXR1cm4gMjI7IH1cblx0Z2V0VGVtcGxhdGVJZCgpIHsgcmV0dXJuICdleHRlbnNpb25GZWF0dXJlRGVzY3JpcHRvcic7IH1cbn1cblxuY2xhc3MgRXh0ZW5zaW9uRmVhdHVyZUl0ZW1SZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUV4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yLCBJRXh0ZW5zaW9uRmVhdHVyZUl0ZW1UZW1wbGF0ZURhdGE+IHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2V4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLFxuXHRcdEBJRXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElFeHRlbnNpb25GZWF0dXJlSXRlbVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2V4dGVuc2lvbi1mZWF0dXJlLWxpc3QtaXRlbScpO1xuXHRcdGNvbnN0IGxhYmVsID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmV4dGVuc2lvbi1mZWF0dXJlLWxhYmVsJykpO1xuXHRcdGNvbnN0IGRpc2FibGVkRWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5leHRlbnNpb24tZmVhdHVyZS1kaXNhYmxlZC1sYWJlbCcpKTtcblx0XHRkaXNhYmxlZEVsZW1lbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncmV2b2tlZCcsIFwiTm8gQWNjZXNzXCIpO1xuXHRcdGNvbnN0IHN0YXR1c0VsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuZXh0ZW5zaW9uLWZlYXR1cmUtc3RhdHVzJykpO1xuXHRcdHJldHVybiB7IGxhYmVsLCBkaXNhYmxlZEVsZW1lbnQsIHN0YXR1c0VsZW1lbnQsIGRpc3Bvc2FibGVzOiBuZXcgRGlzcG9zYWJsZVN0b3JlKCkgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSUV4dGVuc2lvbkZlYXR1cmVEZXNjcmlwdG9yLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElFeHRlbnNpb25GZWF0dXJlSXRlbVRlbXBsYXRlRGF0YSkge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IGVsZW1lbnQubGFiZWw7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc2FibGVkRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gZWxlbWVudC5pZCA9PT0gcnVudGltZVN0YXR1c0ZlYXR1cmUuaWQgfHwgdGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCh0aGlzLmV4dGVuc2lvbklkLCBlbGVtZW50LmlkKSA/ICdub25lJyA6ICdpbmhlcml0JztcblxuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5hZGQodGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW5hYmxlbWVudCgoeyBleHRlbnNpb24sIGZlYXR1cmVJZCwgZW5hYmxlZCB9KSA9PiB7XG5cdFx0XHRpZiAoRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0ZW5zaW9uLCB0aGlzLmV4dGVuc2lvbklkKSAmJiBmZWF0dXJlSWQgPT09IGVsZW1lbnQuaWQpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmRpc2FibGVkRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gZW5hYmxlZCA/ICdub25lJyA6ICdpbmhlcml0Jztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzdGF0dXNFbGVtZW50Q2xhc3NOYW1lID0gdGVtcGxhdGVEYXRhLnN0YXR1c0VsZW1lbnQuY2xhc3NOYW1lO1xuXHRcdGNvbnN0IHVwZGF0ZVN0YXR1cyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGFjY2Vzc0RhdGEgPSB0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UuZ2V0QWNjZXNzRGF0YSh0aGlzLmV4dGVuc2lvbklkLCBlbGVtZW50LmlkKTtcblx0XHRcdGlmIChhY2Nlc3NEYXRhPy5jdXJyZW50Py5zdGF0dXMpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0VsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmhlcml0Jztcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0VsZW1lbnQuY2xhc3NOYW1lID0gYCR7c3RhdHVzRWxlbWVudENsYXNzTmFtZX0gJHtTZXZlcml0eUljb24uY2xhc3NOYW1lKGFjY2Vzc0RhdGEuY3VycmVudC5zdGF0dXMuc2V2ZXJpdHkpfWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dXBkYXRlU3RhdHVzKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VBY2Nlc3NEYXRhKCh7IGV4dGVuc2lvbiwgZmVhdHVyZUlkIH0pID0+IHtcblx0XHRcdGlmIChFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb24sIHRoaXMuZXh0ZW5zaW9uSWQpICYmIGZlYXR1cmVJZCA9PT0gZWxlbWVudC5pZCkge1xuXHRcdFx0XHR1cGRhdGVTdGF0dXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJRXh0ZW5zaW9uRmVhdHVyZURlc2NyaXB0b3IsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUV4dGVuc2lvbkZlYXR1cmVJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElFeHRlbnNpb25GZWF0dXJlSXRlbVRlbXBsYXRlRGF0YSkge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxufVxuXG5jbGFzcyBFeHRlbnNpb25GZWF0dXJlVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGxheW91dFBhcnRpY2lwYW50czogSUxheW91dFBhcnRpY2lwYW50W10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCxcblx0XHRyZWFkb25seSBmZWF0dXJlOiBJRXh0ZW5zaW9uRmVhdHVyZURlc2NyaXB0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuZXh0ZW5zaW9uLWZlYXR1cmUtY29udGVudCcpO1xuXHRcdHRoaXMuY3JlYXRlKHRoaXMuZG9tTm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZShjb250ZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGhlYWRlciA9IGFwcGVuZChjb250ZW50LCAkKCcuZmVhdHVyZS1oZWFkZXInKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBhcHBlbmQoaGVhZGVyLCAkKCcuZmVhdHVyZS10aXRsZScpKTtcblx0XHR0aXRsZS50ZXh0Q29udGVudCA9IHRoaXMuZmVhdHVyZS5sYWJlbDtcblxuXHRcdGlmICh0aGlzLmZlYXR1cmUuYWNjZXNzLmNhblRvZ2dsZSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChoZWFkZXIsICQoJy5mZWF0dXJlLWFjdGlvbnMnKSk7XG5cdFx0XHRjb25zdCBidXR0b24gPSBuZXcgQnV0dG9uKGFjdGlvbnNDb250YWluZXIsIGRlZmF1bHRCdXR0b25TdHlsZXMpO1xuXHRcdFx0dGhpcy51cGRhdGVCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW5hYmxlbWVudCgoeyBleHRlbnNpb24sIGZlYXR1cmVJZCB9KSA9PiB7XG5cdFx0XHRcdGlmIChFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb24sIHRoaXMuZXh0ZW5zaW9uSWQpICYmIGZlYXR1cmVJZCA9PT0gdGhpcy5mZWF0dXJlLmlkKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVCdXR0b25MYWJlbChidXR0b24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihidXR0b24ub25EaWRDbGljayhhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UuaXNFbmFibGVkKHRoaXMuZXh0ZW5zaW9uSWQsIHRoaXMuZmVhdHVyZS5pZCk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1hdGlvblJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FjY2Vzc0V4dGVuc2lvbkZlYXR1cmUnLCBcIkVuYWJsZSAnezB9JyBGZWF0dXJlXCIsIHRoaXMuZmVhdHVyZS5sYWJlbCksXG5cdFx0XHRcdFx0bWVzc2FnZTogZW5hYmxlZFxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZGlzYWJsZUFjY2Vzc0V4dGVuc2lvbkZlYXR1cmVNZXNzYWdlJywgXCJXb3VsZCB5b3UgbGlrZSB0byByZXZva2UgJ3swfScgZXh0ZW5zaW9uIHRvIGFjY2VzcyAnezF9JyBmZWF0dXJlP1wiLCB0aGlzLm1hbmlmZXN0LmRpc3BsYXlOYW1lID8/IHRoaXMuZXh0ZW5zaW9uSWQudmFsdWUsIHRoaXMuZmVhdHVyZS5sYWJlbClcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2VuYWJsZUFjY2Vzc0V4dGVuc2lvbkZlYXR1cmVNZXNzYWdlJywgXCJXb3VsZCB5b3UgbGlrZSB0byBhbGxvdyAnezB9JyBleHRlbnNpb24gdG8gYWNjZXNzICd7MX0nIGZlYXR1cmU/XCIsIHRoaXMubWFuaWZlc3QuZGlzcGxheU5hbWUgPz8gdGhpcy5leHRlbnNpb25JZC52YWx1ZSwgdGhpcy5mZWF0dXJlLmxhYmVsKSxcblx0XHRcdFx0XHRjdXN0b206IHRydWUsXG5cdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogZW5hYmxlZCA/IGxvY2FsaXplKCdyZXZva2UnLCBcIlJldm9rZSBBY2Nlc3NcIikgOiBsb2NhbGl6ZSgnZ3JhbnQnLCBcIkFsbG93IEFjY2Vzc1wiKSxcblx0XHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChjb25maXJtYXRpb25SZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0dGhpcy5leHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLnNldEVuYWJsZW1lbnQodGhpcy5leHRlbnNpb25JZCwgdGhpcy5mZWF0dXJlLmlkLCAhZW5hYmxlZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCBib2R5ID0gYXBwZW5kKGNvbnRlbnQsICQoJy5mZWF0dXJlLWJvZHknKSk7XG5cblx0XHRjb25zdCBib2R5Q29udGVudCA9ICQoJy5mZWF0dXJlLWJvZHktY29udGVudCcpO1xuXHRcdGNvbnN0IHNjcm9sbGFibGVDb250ZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGJvZHlDb250ZW50LCB7fSkpO1xuXHRcdGFwcGVuZChib2R5LCBzY3JvbGxhYmxlQ29udGVudC5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMubGF5b3V0UGFydGljaXBhbnRzLnB1c2goeyBsYXlvdXQ6ICgpID0+IHNjcm9sbGFibGVDb250ZW50LnNjYW5Eb21Ob2RlKCkgfSk7XG5cdFx0c2Nyb2xsYWJsZUNvbnRlbnQuc2NhbkRvbU5vZGUoKTtcblxuXHRcdGlmICh0aGlzLmZlYXR1cmUuZGVzY3JpcHRpb24pIHtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYXBwZW5kKGJvZHlDb250ZW50LCAkKCcuZmVhdHVyZS1kZXNjcmlwdGlvbicpKTtcblx0XHRcdGRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gdGhpcy5mZWF0dXJlLmRlc2NyaXB0aW9uO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjY2Vzc0RhdGEgPSB0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UuZ2V0QWNjZXNzRGF0YSh0aGlzLmV4dGVuc2lvbklkLCB0aGlzLmZlYXR1cmUuaWQpO1xuXHRcdGlmIChhY2Nlc3NEYXRhPy5jdXJyZW50Py5zdGF0dXMpIHtcblx0XHRcdGFwcGVuZChib2R5Q29udGVudCwgJCgnLmZlYXR1cmUtc3RhdHVzJywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKGBzcGFuJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihhY2Nlc3NEYXRhLmN1cnJlbnQuc3RhdHVzLnNldmVyaXR5ID09PSBTZXZlcml0eS5FcnJvciA/IGVycm9ySWNvbiA6IGFjY2Vzc0RhdGEuY3VycmVudC5zdGF0dXMuc2V2ZXJpdHkgPT09IFNldmVyaXR5Lldhcm5pbmcgPyB3YXJuaW5nSWNvbiA6IGluZm9JY29uKX1gLCB1bmRlZmluZWQpLFxuXHRcdFx0XHQkKCdzcGFuJywgdW5kZWZpbmVkLCBhY2Nlc3NEYXRhLmN1cnJlbnQuc3RhdHVzLm1lc3NhZ2UpKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmVhdHVyZUNvbnRlbnRFbGVtZW50ID0gYXBwZW5kKGJvZHlDb250ZW50LCAkKCcuZmVhdHVyZS1jb250ZW50JykpO1xuXHRcdGlmICh0aGlzLmZlYXR1cmUucmVuZGVyZXIpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZTxJRXh0ZW5zaW9uRmVhdHVyZVJlbmRlcmVyPih0aGlzLmZlYXR1cmUucmVuZGVyZXIpO1xuXHRcdFx0aWYgKHJlbmRlcmVyLnR5cGUgPT09ICd0YWJsZScpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJUYWJsZURhdGEoZmVhdHVyZUNvbnRlbnRFbGVtZW50LCA8SUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyPnJlbmRlcmVyKTtcblx0XHRcdH0gZWxzZSBpZiAocmVuZGVyZXIudHlwZSA9PT0gJ21hcmtkb3duJykge1xuXHRcdFx0XHR0aGlzLnJlbmRlck1hcmtkb3duRGF0YShmZWF0dXJlQ29udGVudEVsZW1lbnQsIDxJRXh0ZW5zaW9uRmVhdHVyZU1hcmtkb3duUmVuZGVyZXI+cmVuZGVyZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChyZW5kZXJlci50eXBlID09PSAnbWFya2Rvd24rdGFibGUnKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd25BbmRUYWJsZURhdGEoZmVhdHVyZUNvbnRlbnRFbGVtZW50LCA8SUV4dGVuc2lvbkZlYXR1cmVNYXJrZG93bkFuZFRhYmxlUmVuZGVyZXI+cmVuZGVyZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChyZW5kZXJlci50eXBlID09PSAnZWxlbWVudCcpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJFbGVtZW50RGF0YShmZWF0dXJlQ29udGVudEVsZW1lbnQsIDxJRXh0ZW5zaW9uRmVhdHVyZUVsZW1lbnRSZW5kZXJlcj5yZW5kZXJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVCdXR0b25MYWJlbChidXR0b246IEJ1dHRvbik6IHZvaWQge1xuXHRcdGJ1dHRvbi5sYWJlbCA9IHRoaXMuZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZS5pc0VuYWJsZWQodGhpcy5leHRlbnNpb25JZCwgdGhpcy5mZWF0dXJlLmlkKSA/IGxvY2FsaXplKCdyZXZva2UnLCBcIlJldm9rZSBBY2Nlc3NcIikgOiBsb2NhbGl6ZSgnZW5hYmxlJywgXCJBbGxvdyBBY2Nlc3NcIik7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclRhYmxlRGF0YShjb250YWluZXI6IEhUTUxFbGVtZW50LCByZW5kZXJlcjogSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFibGVEYXRhID0gdGhpcy5fcmVnaXN0ZXIocmVuZGVyZXIucmVuZGVyKHRoaXMubWFuaWZlc3QpKTtcblx0XHRjb25zdCB0YWJsZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0aWYgKHRhYmxlRGF0YS5vbkRpZENoYW5nZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGFibGVEYXRhLm9uRGlkQ2hhbmdlKGRhdGEgPT4ge1xuXHRcdFx0XHRjbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHRcdFx0dGFibGVEaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5yZW5kZXJUYWJsZShkYXRhLCBjb250YWluZXIpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0YWJsZURpc3Bvc2FibGUudmFsdWUgPSB0aGlzLnJlbmRlclRhYmxlKHRhYmxlRGF0YS5kYXRhLCBjb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUYWJsZSh0YWJsZURhdGE6IElUYWJsZURhdGEsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0YXBwZW5kKGNvbnRhaW5lcixcblx0XHRcdCQoJ3RhYmxlJywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQuLi50YWJsZURhdGEuaGVhZGVycy5tYXAoaGVhZGVyID0+ICQoJ3RoJywgdW5kZWZpbmVkLCBoZWFkZXIpKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHQuLi50YWJsZURhdGEucm93c1xuXHRcdFx0XHRcdC5tYXAocm93ID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiAkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Li4ucm93Lm1hcChyb3dEYXRhID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIHJvd0RhdGEgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gJCgndGQnLCB1bmRlZmluZWQsICQoJ3AnLCB1bmRlZmluZWQsIHJvd0RhdGEpKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgZGF0YSA9IEFycmF5LmlzQXJyYXkocm93RGF0YSkgPyByb3dEYXRhIDogW3Jvd0RhdGFdO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiAkKCd0ZCcsIHVuZGVmaW5lZCwgLi4uZGF0YS5tYXAoaXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQ6IE5vZGVbXSA9IFtdO1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcocm93RGF0YSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZWxlbWVudCA9ICQoJycsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHRoaXMucmVuZGVyTWFya2Rvd24ocm93RGF0YSwgZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChpdGVtIGluc3RhbmNlb2YgUmVzb2x2ZWRLZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSAkKCcnKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3Qga2JsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBLZXliaW5kaW5nTGFiZWwoZWxlbWVudCwgT1MsIGRlZmF1bHRLZXliaW5kaW5nTGFiZWxTdHlsZXMpKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0a2JsLnNldChpdGVtKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGl0ZW0gaW5zdGFuY2VvZiBDb2xvcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCgkKCdzcGFuJywgeyBjbGFzczogJ2NvbG9yQm94Jywgc3R5bGU6ICdiYWNrZ3JvdW5kLWNvbG9yOiAnICsgQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXQoaXRlbSkgfSwgJycpKTtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goJCgnY29kZScsIHVuZGVmaW5lZCwgQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXgoaXRlbSkpKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0XHRcdFx0fSkuZmxhdCgpKTtcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fSkpKTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duQW5kVGFibGVEYXRhKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHJlbmRlcmVyOiBJRXh0ZW5zaW9uRmVhdHVyZU1hcmtkb3duQW5kVGFibGVSZW5kZXJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG1hcmtkb3duQW5kVGFibGVEYXRhID0gdGhpcy5fcmVnaXN0ZXIocmVuZGVyZXIucmVuZGVyKHRoaXMubWFuaWZlc3QpKTtcblx0XHRpZiAobWFya2Rvd25BbmRUYWJsZURhdGEub25EaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG1hcmtkb3duQW5kVGFibGVEYXRhLm9uRGlkQ2hhbmdlKGRhdGEgPT4ge1xuXHRcdFx0XHRjbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJNYXJrZG93bkFuZFRhYmxlKGRhdGEsIGNvbnRhaW5lcik7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyTWFya2Rvd25BbmRUYWJsZShtYXJrZG93bkFuZFRhYmxlRGF0YS5kYXRhLCBjb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYXJrZG93bkRhdGEoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcmVuZGVyZXI6IElFeHRlbnNpb25GZWF0dXJlTWFya2Rvd25SZW5kZXJlcik6IHZvaWQge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtYXJrZG93bicpO1xuXHRcdGNvbnN0IG1hcmtkb3duRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKHJlbmRlcmVyLnJlbmRlcih0aGlzLm1hbmlmZXN0KSk7XG5cdFx0aWYgKG1hcmtkb3duRGF0YS5vbkRpZENoYW5nZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobWFya2Rvd25EYXRhLm9uRGlkQ2hhbmdlKGRhdGEgPT4ge1xuXHRcdFx0XHRjbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJNYXJrZG93bihkYXRhLCBjb250YWluZXIpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLnJlbmRlck1hcmtkb3duKG1hcmtkb3duRGF0YS5kYXRhLCBjb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYXJrZG93bihtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgeyBlbGVtZW50IH0gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcih7XG5cdFx0XHR2YWx1ZTogbWFya2Rvd24udmFsdWUsXG5cdFx0XHRpc1RydXN0ZWQ6IG1hcmtkb3duLmlzVHJ1c3RlZCxcblx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlXG5cdFx0fSkpO1xuXHRcdGFwcGVuZChjb250YWluZXIsIGVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNYXJrZG93bkFuZFRhYmxlKGRhdGE6IEFycmF5PElNYXJrZG93blN0cmluZyB8IElUYWJsZURhdGE+LCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBtYXJrZG93bk9yVGFibGUgb2YgZGF0YSkge1xuXHRcdFx0aWYgKGlzTWFya2Rvd25TdHJpbmcobWFya2Rvd25PclRhYmxlKSkge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gJCgnJywgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJNYXJrZG93bihtYXJrZG93bk9yVGFibGUsIGVsZW1lbnQpO1xuXHRcdFx0XHRhcHBlbmQoY29udGFpbmVyLCBlbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHRhYmxlRWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJ3RhYmxlJykpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclRhYmxlKG1hcmtkb3duT3JUYWJsZSwgdGFibGVFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckVsZW1lbnREYXRhKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHJlbmRlcmVyOiBJRXh0ZW5zaW9uRmVhdHVyZUVsZW1lbnRSZW5kZXJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnREYXRhID0gdGhpcy5fcmVnaXN0ZXIocmVuZGVyZXIucmVuZGVyKHRoaXMubWFuaWZlc3QpKTtcblx0XHRpZiAoZWxlbWVudERhdGEub25EaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGVsZW1lbnREYXRhLm9uRGlkQ2hhbmdlKGRhdGEgPT4ge1xuXHRcdFx0XHRjbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGRhdGEpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWxlbWVudERhdGEuZGF0YSk7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubGF5b3V0UGFydGljaXBhbnRzLmZvckVhY2gocCA9PiBwLmxheW91dChoZWlnaHQsIHdpZHRoKSk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxTQUFTLEdBQUcsUUFBUSxXQUFXLHVCQUF1QixpQkFBaUI7QUFDdkUsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUywyQkFBK0M7QUFDeEQsU0FBUyxhQUFhLFFBQVEsaUJBQWlCO0FBQy9DLFNBQXNDLFlBQW1FLDJDQUFvTDtBQUM3UixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxxQkFBcUIsb0NBQW9DO0FBQ2xFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUI7QUFDMUIsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsV0FBVyxVQUFVLG1CQUFtQjtBQUNqRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFVBQVU7QUFDbkIsU0FBMEIsZ0JBQWdCLHdCQUF3QjtBQUNsRSxTQUFTLGFBQWE7QUFDdEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsWUFBWSxXQUFXLFlBQVksaUJBQWlCO0FBQzdELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0NBQWdDO0FBT3pDLElBQU0sZ0NBQU4sY0FBNEMsV0FBdUQ7QUFBQSxFQUtsRyxZQUNxQyxrQkFDSixjQUNzQixvQ0FDWCx5QkFDMUM7QUFDRCxVQUFNO0FBTDhCO0FBQ0o7QUFDc0I7QUFDWDtBQU41QyxTQUFTLE9BQU87QUFBQSxFQVNoQjtBQUFBLEVBRUEsYUFBYSxVQUF1QztBQUNuRCxVQUFNLGNBQWMsSUFBSSxvQkFBb0IsZUFBZSxTQUFTLFdBQVcsU0FBUyxJQUFJLENBQUM7QUFDN0YsUUFBSSxDQUFDLEtBQUssaUJBQWlCLFdBQVcsS0FBSyxPQUFLLG9CQUFvQixPQUFPLEVBQUUsWUFBWSxXQUFXLENBQUMsR0FBRztBQUN2RyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sQ0FBQyxDQUFDLFNBQVMsUUFBUSxDQUFDLENBQUMsU0FBUztBQUFBLEVBQ3RDO0FBQUEsRUFFQSxPQUFPLFVBQTBEO0FBQ2hFLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLGNBQWMsSUFBSSxvQkFBb0IsZUFBZSxTQUFTLFdBQVcsU0FBUyxJQUFJLENBQUM7QUFDN0YsVUFBTSxVQUFVLFlBQVksSUFBSSxJQUFJLFFBQXFCLENBQUM7QUFDMUQsZ0JBQVksSUFBSSxLQUFLLGlCQUFpQiw0QkFBNEIsT0FBSztBQUN0RSxVQUFJLEVBQUUsS0FBSyxlQUFhLG9CQUFvQixPQUFPLFdBQVcsV0FBVyxDQUFDLEdBQUc7QUFDNUUsZ0JBQVEsS0FBSyxLQUFLLGNBQWMsVUFBVSxXQUFXLENBQUM7QUFBQSxNQUN2RDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxLQUFLLG1DQUFtQyxzQkFBc0IsT0FBSyxRQUFRLEtBQUssS0FBSyxjQUFjLFVBQVUsV0FBVyxDQUFDLENBQUMsQ0FBQztBQUMzSSxXQUFPO0FBQUEsTUFDTixhQUFhLFFBQVE7QUFBQSxNQUNyQixNQUFNLEtBQUssY0FBYyxVQUFVLFdBQVc7QUFBQSxNQUM5QyxTQUFTLE1BQU0sWUFBWSxRQUFRO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLFVBQThCLGFBQTJDO0FBQzlGLFVBQU0sWUFBWSxFQUFFLGlCQUFpQjtBQUNyQyxVQUFNLGNBQWMsSUFBSSxvQkFBb0IsZUFBZSxTQUFTLFdBQVcsU0FBUyxJQUFJLENBQUM7QUFDN0YsVUFBTSxTQUFTLEtBQUssaUJBQWlCLG9CQUFvQixFQUFFLFlBQVksS0FBSztBQUM1RSxRQUFJLEtBQUssaUJBQWlCLFdBQVcsS0FBSyxlQUFhLG9CQUFvQixPQUFPLFVBQVUsWUFBWSxXQUFXLENBQUMsR0FBRztBQUN0SCxZQUFNLE9BQU8sSUFBSSxlQUFlO0FBQ2hDLFdBQUssZUFBZSxPQUFPLFNBQVMsY0FBYyxZQUFZLENBQUM7QUFBQTtBQUFBLENBQU07QUFDckUsVUFBSSxPQUFPLGlCQUFpQjtBQUMzQixZQUFJLE9BQU8sZ0JBQWdCLGlCQUFpQixTQUFTO0FBQ3BELGVBQUssZUFBZSwyQkFBMkIsT0FBTyxnQkFBZ0IsZ0JBQWdCLE1BQU07QUFBQSxRQUM3RixPQUFPO0FBQ04sZUFBSyxlQUFlLGtCQUFrQixPQUFPLGdCQUFnQixpQkFBaUIsZUFBZSxlQUFlLE9BQU8sZ0JBQWdCLGdCQUFnQixNQUFNO0FBQUEsUUFDMUo7QUFBQSxNQUNELE9BQU87QUFDTixhQUFLLGVBQWUsbUJBQW1CO0FBQUEsTUFDeEM7QUFDQSxXQUFLLGVBQWUsTUFBTSxXQUFXLFdBQVc7QUFBQSxJQUNqRDtBQUNBLFVBQU0sV0FBVyxTQUFTLEdBQStCLFdBQVcseUJBQXlCLEVBQUUscUJBQXFCO0FBQ3BILGVBQVcsV0FBVyxVQUFVO0FBQy9CLFlBQU0sYUFBYSxLQUFLLG1DQUFtQyxjQUFjLGFBQWEsUUFBUSxFQUFFO0FBQ2hHLFVBQUksWUFBWTtBQUNmLGFBQUssZUFBZSxJQUFJLGVBQWU7QUFBQSxPQUFVLFNBQVMsU0FBUyxhQUFhLFFBQVEsS0FBSyxDQUFDO0FBQUE7QUFBQSxDQUFNLEdBQUcsV0FBVyxXQUFXO0FBQzdILFlBQUksV0FBVyxZQUFZLFFBQVE7QUFDbEMsZ0JBQU0sY0FBYztBQUFBLFlBQU87QUFBQSxZQUMxQjtBQUFBLGNBQUU7QUFBQSxjQUNEO0FBQUEsY0FDQSxTQUFTLG9CQUFvQix3RUFBd0UsWUFBWSxZQUFZLFFBQVEsUUFBUSxtQkFBbUIsUUFBUSxLQUFLO0FBQUEsWUFBQztBQUFBLFVBQUM7QUFDakwsc0JBQVksTUFBTSxlQUFlO0FBQ2pDLGVBQUssb0JBQW9CLFdBQVcsV0FBVyxhQUFhLFdBQVc7QUFBQSxRQUN4RTtBQUNBLGNBQU1BLFVBQVMsWUFBWSxTQUFTO0FBQ3BDLFlBQUlBLFNBQVE7QUFDWCxnQkFBTSxPQUFPLElBQUksZUFBZTtBQUNoQyxjQUFJQSxTQUFRLGFBQWEsU0FBUyxPQUFPO0FBQ3hDLGlCQUFLLGVBQWUsS0FBSyxVQUFVLEVBQUUsS0FBS0EsUUFBTyxPQUFPO0FBQUE7QUFBQSxDQUFNO0FBQUEsVUFDL0Q7QUFDQSxjQUFJQSxTQUFRLGFBQWEsU0FBUyxTQUFTO0FBQzFDLGlCQUFLLGVBQWUsS0FBSyxZQUFZLEVBQUUsS0FBS0EsUUFBTyxPQUFPO0FBQUE7QUFBQSxDQUFNO0FBQUEsVUFDakU7QUFDQSxjQUFJLEtBQUssT0FBTztBQUNmLGlCQUFLLGVBQWUsTUFBTSxXQUFXLFdBQVc7QUFBQSxVQUNqRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFFBQUksT0FBTyxjQUFjLFVBQVUsT0FBTyxTQUFTLFFBQVE7QUFDMUQsWUFBTSxPQUFPLElBQUksZUFBZTtBQUNoQyxVQUFJLE9BQU8sY0FBYyxRQUFRO0FBQ2hDLGFBQUssZUFBZTtBQUFBLE9BQVUsU0FBUyxtQkFBbUIseUJBQXlCLE9BQU8sY0FBYyxNQUFNLENBQUM7QUFBQSxDQUFJO0FBQ25ILG1CQUFXLFNBQVMsT0FBTyxlQUFlO0FBQ3pDLGVBQUssZUFBZSxLQUFLLFFBQVEsTUFBTSxFQUFFLFVBQVUsZ0JBQWdCLEtBQUssQ0FBQztBQUFBO0FBQUEsQ0FBTTtBQUFBLFFBQ2hGO0FBQUEsTUFDRDtBQUNBLFVBQUksT0FBTyxTQUFTLFFBQVE7QUFDM0IsYUFBSyxlQUFlO0FBQUEsT0FBVSxTQUFTLGFBQWEsa0JBQWtCLE9BQU8sU0FBUyxNQUFNLENBQUM7QUFBQSxDQUFJO0FBQ2pHLG1CQUFXLFdBQVcsT0FBTyxVQUFVO0FBQ3RDLGVBQUssZUFBZSxNQUFNLFFBQVEsU0FBUyxTQUFTLFFBQVEsUUFBUSxRQUFRLFFBQVEsU0FBUyxTQUFTLFVBQVUsUUFBUSxVQUFVLFFBQVEsTUFBTSxFQUFFLFVBQVUsUUFBUSxPQUFPO0FBQUE7QUFBQSxDQUFNO0FBQUEsUUFDbEw7QUFBQSxNQUNEO0FBQ0EsVUFBSSxLQUFLLE9BQU87QUFDZixhQUFLLGVBQWUsTUFBTSxXQUFXLFdBQVc7QUFBQSxNQUNqRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZUFBZSxVQUEyQixXQUF3QixhQUFvQztBQUM3RyxVQUFNLEVBQUUsUUFBUSxJQUFJLFlBQVksSUFBSSxLQUFLLHdCQUF3QixPQUFPO0FBQUEsTUFDdkUsT0FBTyxTQUFTO0FBQUEsTUFDaEIsV0FBVyxTQUFTO0FBQUEsTUFDcEIsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQyxDQUFDO0FBQ0YsV0FBTyxXQUFXLE9BQU87QUFBQSxFQUMxQjtBQUFBLEVBRVEsb0JBQW9CLFdBQXdCLGFBQXFCLGFBQW9DO0FBQzVHLFVBQU0sUUFBUTtBQUNkLFVBQU0sU0FBUztBQUNmLFVBQU0sU0FBUyxFQUFFLEtBQUssR0FBRyxPQUFPLEdBQUcsUUFBUSxJQUFJLE1BQU0sRUFBRTtBQUN2RCxVQUFNLGFBQWEsUUFBUSxPQUFPLE9BQU8sT0FBTztBQUNoRCxVQUFNLGNBQWMsU0FBUyxPQUFPLE1BQU0sT0FBTztBQUVqRCxVQUFNLGlCQUFpQixPQUFPLFdBQVcsRUFBRSwwQkFBMEIsQ0FBQztBQUN0RSxtQkFBZSxNQUFNLFdBQVc7QUFFaEMsVUFBTSxVQUFVLE9BQU8sZ0JBQWdCLEVBQUUsd0JBQXdCLENBQUM7QUFDbEUsWUFBUSxNQUFNLFdBQVc7QUFDekIsWUFBUSxNQUFNLFFBQVE7QUFDdEIsWUFBUSxNQUFNLFNBQVM7QUFFdkIsUUFBSSxXQUFXO0FBQ2YsVUFBTSxNQUFNLG9CQUFJLElBQW9CO0FBQ3BDLGVBQVcsY0FBYyxhQUFhO0FBQ3JDLFlBQU0sTUFBTSxHQUFHLFdBQVcsUUFBUSxDQUFDLElBQUksV0FBVyxlQUFlLFdBQVcsRUFBRSxPQUFPLFFBQVEsQ0FBQyxDQUFDO0FBQy9GLFVBQUksSUFBSSxNQUFNLElBQUksSUFBSSxHQUFHLEtBQUssS0FBSyxDQUFDO0FBQ3BDLGlCQUFXLEtBQUssSUFBSSxVQUFVLElBQUksSUFBSSxHQUFHLENBQUU7QUFBQSxJQUM1QztBQUVBLFVBQU0sTUFBTSxvQkFBSSxLQUFLO0FBRXJCLFVBQU0sU0FBa0IsQ0FBQztBQUN6QixhQUFTLElBQUksR0FBRyxLQUFLLElBQUksS0FBSztBQUM3QixZQUFNLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFDekIsV0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLEtBQUssRUFBRTtBQUNyQyxZQUFNLGFBQWEsR0FBRyxLQUFLLFFBQVEsQ0FBQyxJQUFJLEtBQUssZUFBZSxXQUFXLEVBQUUsT0FBTyxRQUFRLENBQUMsQ0FBQztBQUMxRixZQUFNLFFBQVEsSUFBSSxJQUFJLFVBQVUsS0FBSztBQUNyQyxZQUFNLElBQUssSUFBSSxLQUFNO0FBQ3JCLFlBQU0sSUFBSSxjQUFlLFFBQVEsV0FBWTtBQUM3QyxhQUFPLEtBQUssRUFBRSxHQUFHLEdBQUcsTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUFBLElBQzlDO0FBRUEsVUFBTSxRQUFRLE9BQU8sZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUM7QUFDeEQsVUFBTSxNQUFNLE9BQU8sT0FBTyxFQUFFLElBQUksS0FBSyxDQUFDO0FBQ3RDLFFBQUksYUFBYSxTQUFTLEdBQUcsS0FBSyxJQUFJO0FBQ3RDLFFBQUksYUFBYSxVQUFVLEdBQUcsTUFBTSxJQUFJO0FBQ3hDLFFBQUksYUFBYSxXQUFXLE9BQU8sS0FBSyxJQUFJLE1BQU0sRUFBRTtBQUVwRCxVQUFNLElBQUksRUFBRSxJQUFJLEdBQUc7QUFDbkIsTUFBRSxhQUFhLGFBQWEsYUFBYSxPQUFPLElBQUksSUFBSSxPQUFPLEdBQUcsR0FBRztBQUNyRSxRQUFJLFlBQVksQ0FBQztBQUVqQixVQUFNLFlBQVksRUFBRSxJQUFJLE1BQU07QUFDOUIsY0FBVSxhQUFhLE1BQU0sR0FBRztBQUNoQyxjQUFVLGFBQWEsTUFBTSxHQUFHLFdBQVcsRUFBRTtBQUM3QyxjQUFVLGFBQWEsTUFBTSxHQUFHLFVBQVUsRUFBRTtBQUM1QyxjQUFVLGFBQWEsTUFBTSxHQUFHLFdBQVcsRUFBRTtBQUM3QyxjQUFVLGFBQWEsVUFBVSxjQUFjLFNBQVMsQ0FBQztBQUN6RCxjQUFVLGFBQWEsZ0JBQWdCLEtBQUs7QUFDNUMsTUFBRSxZQUFZLFNBQVM7QUFFdkIsYUFBUyxJQUFJLEdBQUcsS0FBSyxJQUFJLEtBQUssR0FBRztBQUNoQyxZQUFNLE9BQU8sSUFBSSxLQUFLLEdBQUc7QUFDekIsV0FBSyxRQUFRLElBQUksUUFBUSxLQUFLLEtBQUssRUFBRTtBQUNyQyxZQUFNLGFBQWEsR0FBRyxLQUFLLFFBQVEsQ0FBQyxJQUFJLEtBQUssZUFBZSxXQUFXLEVBQUUsT0FBTyxRQUFRLENBQUMsQ0FBQztBQUMxRixZQUFNLElBQUssSUFBSSxLQUFNO0FBR3JCLFlBQU0sT0FBTyxFQUFFLElBQUksTUFBTTtBQUN6QixXQUFLLGFBQWEsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUM5QixXQUFLLGFBQWEsTUFBTSxHQUFHLFdBQVcsRUFBRTtBQUN4QyxXQUFLLGFBQWEsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUM5QixXQUFLLGFBQWEsTUFBTSxHQUFHLGNBQWMsRUFBRSxFQUFFO0FBQzdDLFdBQUssYUFBYSxVQUFVLGNBQWMsU0FBUyxDQUFDO0FBQ3BELFdBQUssYUFBYSxnQkFBZ0IsS0FBSztBQUN2QyxRQUFFLFlBQVksSUFBSTtBQUVsQixZQUFNLFFBQVEsRUFBRSxJQUFJLE1BQU07QUFDMUIsWUFBTSxhQUFhLE1BQU0sR0FBRyxDQUFDLEVBQUU7QUFDL0IsWUFBTSxhQUFhLE1BQU0sR0FBRztBQUM1QixZQUFNLGFBQWEsTUFBTSxHQUFHLENBQUMsRUFBRTtBQUMvQixZQUFNLGFBQWEsTUFBTSxHQUFHLFdBQVcsRUFBRTtBQUN6QyxZQUFNLGFBQWEsVUFBVSxjQUFjLFVBQVUsQ0FBQztBQUN0RCxZQUFNLGFBQWEsZ0JBQWdCLEtBQUs7QUFDeEMsUUFBRSxZQUFZLEtBQUs7QUFFbkIsWUFBTSxZQUFZLEVBQUUsSUFBSSxNQUFNO0FBQzlCLGdCQUFVLGFBQWEsS0FBSyxHQUFHLENBQUMsRUFBRTtBQUNsQyxnQkFBVSxhQUFhLEtBQUssR0FBRyxNQUFNLEVBQUU7QUFDdkMsZ0JBQVUsYUFBYSxlQUFlLFFBQVE7QUFDOUMsZ0JBQVUsYUFBYSxRQUFRLGNBQWMsVUFBVSxDQUFDO0FBQ3hELGdCQUFVLGFBQWEsYUFBYSxNQUFNO0FBQzFDLGdCQUFVLGNBQWM7QUFDeEIsUUFBRSxZQUFZLFNBQVM7QUFBQSxJQUN4QjtBQUVBLFVBQU0sT0FBTyxFQUFFLElBQUksVUFBVTtBQUM3QixTQUFLLGFBQWEsUUFBUSxNQUFNO0FBQ2hDLFNBQUssYUFBYSxVQUFVLGNBQWMsU0FBUyxDQUFDO0FBQ3BELFNBQUssYUFBYSxnQkFBZ0IsS0FBSztBQUN2QyxTQUFLLGFBQWEsVUFBVSxPQUFPLElBQUksT0FBSyxHQUFHLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFLEVBQUUsS0FBSyxHQUFHLENBQUM7QUFDdEUsTUFBRSxZQUFZLElBQUk7QUFFbEIsVUFBTSxrQkFBa0IsRUFBRSxJQUFJLFFBQVE7QUFDdEMsb0JBQWdCLGFBQWEsS0FBSyxLQUFLO0FBQ3ZDLG9CQUFnQixNQUFNLFVBQVU7QUFDaEMsTUFBRSxZQUFZLGVBQWU7QUFFN0IsVUFBTSxrQkFBa0IsWUFBWSxJQUFJLElBQUksa0JBQStCLENBQUM7QUFDNUUsVUFBTSxvQkFBb0IsQ0FBQyxVQUE0QjtBQUN0RCxZQUFNLE9BQU8sSUFBSSxzQkFBc0I7QUFDdkMsWUFBTSxTQUFTLE1BQU0sVUFBVSxLQUFLLE9BQU8sT0FBTztBQUVsRCxVQUFJO0FBQ0osVUFBSSxjQUFjO0FBRWxCLGFBQU8sUUFBUSxXQUFTO0FBQ3ZCLGNBQU0sV0FBVyxLQUFLLElBQUksTUFBTSxJQUFJLE1BQU07QUFDMUMsWUFBSSxXQUFXLGFBQWE7QUFDM0Isd0JBQWM7QUFDZCx5QkFBZTtBQUFBLFFBQ2hCO0FBQUEsTUFDRCxDQUFDO0FBRUQsVUFBSSxjQUFjO0FBQ2pCLHdCQUFnQixhQUFhLE1BQU0sR0FBRyxhQUFhLENBQUMsRUFBRTtBQUN0RCx3QkFBZ0IsYUFBYSxNQUFNLEdBQUcsYUFBYSxDQUFDLEVBQUU7QUFDdEQsd0JBQWdCLE1BQU0sVUFBVTtBQUNoQyxnQkFBUSxNQUFNLE9BQU8sR0FBRyxhQUFhLElBQUksRUFBRTtBQUMzQyxnQkFBUSxNQUFNLE1BQU0sR0FBRyxhQUFhLElBQUksRUFBRTtBQUMxQyx3QkFBZ0IsUUFBUSxLQUFLLGFBQWEsaUJBQWlCO0FBQUEsVUFDMUQsU0FBUyxJQUFJLGVBQWUsR0FBRyxhQUFhLElBQUksS0FBSyxhQUFhLEtBQUssV0FBVztBQUFBLFVBQ2xGLFFBQVE7QUFBQSxVQUNSLFlBQVk7QUFBQSxZQUNYLGFBQWE7QUFBQSxZQUNiLHFCQUFxQjtBQUFBLFVBQ3RCO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixPQUFPO0FBQ04sd0JBQWdCLFFBQVE7QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFDQSxnQkFBWSxJQUFJLHNCQUFzQixLQUFLLFVBQVUsWUFBWSxpQkFBaUIsQ0FBQztBQUVuRixVQUFNLHFCQUFxQixNQUFNO0FBQ2hDLHNCQUFnQixNQUFNLFVBQVU7QUFDaEMsc0JBQWdCLFFBQVE7QUFBQSxJQUN6QjtBQUNBLGdCQUFZLElBQUksc0JBQXNCLEtBQUssVUFBVSxhQUFhLGtCQUFrQixDQUFDO0FBQUEsRUFDdEY7QUFDRDtBQW5RTSw4QkFFVyxLQUFLO0FBRmhCLGdDQUFOO0FBQUEsRUFNRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVEc7QUEwUU4sTUFBTSx1QkFBdUI7QUFBQSxFQUM1QixJQUFJLDhCQUE4QjtBQUFBLEVBQ2xDLE9BQU8sU0FBUyxXQUFXLGdCQUFnQjtBQUFBLEVBQzNDLFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxFQUNaO0FBQUEsRUFDQSxVQUFVLElBQUksZUFBZSw2QkFBNkI7QUFDM0Q7QUFFTyxJQUFNLHVCQUFOLGNBQW1DLFNBQVM7QUFBQSxFQVVsRCxZQUNrQixVQUNBLFNBQ0YsY0FDeUIsc0JBQ3ZDO0FBQ0QsVUFBTSxZQUFZO0FBTEQ7QUFDQTtBQUV1QjtBQVZ6QyxTQUFpQixjQUFjLEtBQUssVUFBVSxJQUFJLGtCQUF3QyxDQUFDO0FBRzNGLFNBQWlCLHFCQUEyQyxDQUFDO0FBVzVELFNBQUssY0FBYyxJQUFJLG9CQUFvQixlQUFlLFNBQVMsV0FBVyxTQUFTLElBQUksQ0FBQztBQUM1RixTQUFLLFVBQVUsRUFBRSxzQ0FBc0M7QUFDdkQsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUFBLEVBRUEsT0FBTyxRQUFpQixPQUFzQjtBQUM3QyxTQUFLLG1CQUFtQixRQUFRLGlCQUFlLFlBQVksT0FBTyxRQUFRLEtBQUssQ0FBQztBQUFBLEVBQ2pGO0FBQUEsRUFFUSxTQUFlO0FBQ3RCLFVBQU0sV0FBVyxLQUFLLFlBQVk7QUFDbEMsUUFBSSxTQUFTLFdBQVcsR0FBRztBQUMxQixhQUFPLEVBQUUsY0FBYyxHQUFHLEtBQUssT0FBTyxFQUFFLGNBQWMsU0FBUyxjQUFjLDBCQUEwQjtBQUN2RztBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksS0FBSyxVQUFVLElBQUksVUFBa0IsS0FBSyxTQUFTO0FBQUEsTUFDcEUsYUFBYSxZQUFZO0FBQUEsTUFDekIsb0JBQW9CO0FBQUEsSUFDckIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxtQkFBbUIsS0FBSztBQUFBLE1BQzVCLFFBQVEsQ0FBQyxRQUFnQixVQUFrQjtBQUMxQyxrQkFBVSxHQUFHLE1BQU0sU0FBUyxHQUFHLFNBQVMsRUFBRTtBQUMxQyxrQkFBVSxPQUFPLEtBQUs7QUFBQSxNQUN2QjtBQUFBLElBQ0QsQ0FBQztBQUVELFVBQU0sd0JBQXdCLEVBQUUsMEJBQTBCO0FBQzFELFVBQU0sT0FBTyxLQUFLLFVBQVUsS0FBSyxtQkFBbUIscUJBQXFCLENBQUM7QUFDMUUsU0FBSyxPQUFPLEdBQUcsS0FBSyxRQUFRLFFBQVE7QUFFcEMsVUFBTSx1QkFBdUIsRUFBRSx5QkFBeUI7QUFDeEQsU0FBSyxVQUFVLEtBQUsscUJBQXFCLE9BQUs7QUFDN0MsWUFBTSxVQUFVLEVBQUUsU0FBUyxDQUFDO0FBQzVCLFVBQUksU0FBUztBQUNaLGFBQUssZ0JBQWdCLFNBQVMsb0JBQW9CO0FBQUEsTUFDbkQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sUUFBUSxLQUFLLFVBQVUsU0FBUyxVQUFVLE9BQUssRUFBRSxPQUFPLEtBQUssT0FBTyxJQUFJO0FBQzlFLFNBQUssYUFBYSxDQUFDLFVBQVUsS0FBSyxJQUFJLEtBQUssQ0FBQztBQUU1QyxjQUFVLFFBQVE7QUFBQSxNQUNqQixhQUFhLE1BQU07QUFBQSxNQUNuQixTQUFTO0FBQUEsTUFDVCxhQUFhO0FBQUEsTUFDYixhQUFhLE9BQU87QUFBQSxNQUNwQixRQUFRLENBQUMsT0FBTyxHQUFHLFdBQVc7QUFDN0IsOEJBQXNCLE1BQU0sUUFBUSxHQUFHLEtBQUs7QUFDNUMsYUFBSyxPQUFPLFFBQVEsS0FBSztBQUFBLE1BQzFCO0FBQUEsSUFDRCxHQUFHLEtBQUssUUFBVyxJQUFJO0FBRXZCLGNBQVUsUUFBUTtBQUFBLE1BQ2pCLGFBQWEsTUFBTTtBQUFBLE1BQ25CLFNBQVM7QUFBQSxNQUNULGFBQWE7QUFBQSxNQUNiLGFBQWEsT0FBTztBQUFBLE1BQ3BCLFFBQVEsQ0FBQyxPQUFPLEdBQUcsV0FBVztBQUM3Qiw2QkFBcUIsTUFBTSxRQUFRLEdBQUcsS0FBSztBQUMzQyxhQUFLLHVCQUF1QixFQUFFLFFBQVEsTUFBTTtBQUM1QyxhQUFLLGtCQUFrQjtBQUFBLE1BQ3hCO0FBQUEsSUFDRCxHQUFHLE9BQU8sWUFBWSxRQUFXLElBQUk7QUFFckMsY0FBVSxNQUFNO0FBQUEsTUFDZixpQkFBaUIsS0FBSyxNQUFNLFNBQVMsb0JBQW9CO0FBQUEsSUFDMUQsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLG1CQUFtQixXQUFvRTtBQUM5RixVQUFNLFdBQVcsS0FBSyxxQkFBcUIsZUFBZSw4QkFBOEIsS0FBSyxXQUFXO0FBQ3hHLFVBQU0sV0FBVyxJQUFJLDZCQUE2QjtBQUNsRCxVQUFNLE9BQU8sS0FBSyxxQkFBcUIsZUFBZSxlQUFlLHlCQUF5QixPQUFPLFdBQVcsRUFBRSx3QkFBd0IsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxRQUFRLEdBQUc7QUFBQSxNQUNuSywwQkFBMEI7QUFBQSxNQUMxQixrQkFBa0I7QUFBQSxNQUNsQixxQkFBcUI7QUFBQSxNQUNyQix1QkFBdUI7QUFBQSxRQUN0QixhQUFhLGtCQUE4RDtBQUMxRSxpQkFBTyxrQkFBa0IsU0FBUztBQUFBLFFBQ25DO0FBQUEsUUFDQSxxQkFBNkI7QUFDNUIsaUJBQU8sU0FBUywyQkFBMkIsb0JBQW9CO0FBQUEsUUFDaEU7QUFBQSxNQUNEO0FBQUEsTUFDQSxtQkFBbUI7QUFBQSxJQUNwQixDQUFDO0FBQ0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLG9CQUEwQjtBQUNqQyxTQUFLLFlBQVksT0FBTyxPQUFPLEtBQUssc0JBQXNCLFFBQVEsS0FBSyxzQkFBc0IsS0FBSztBQUFBLEVBQ25HO0FBQUEsRUFFUSxnQkFBZ0IsU0FBc0MsV0FBOEI7QUFDM0YsUUFBSSxLQUFLLFlBQVksT0FBTyxRQUFRLE9BQU8sUUFBUSxJQUFJO0FBQ3REO0FBQUEsSUFDRDtBQUNBLGNBQVUsU0FBUztBQUNuQixTQUFLLFlBQVksUUFBUSxLQUFLLHFCQUFxQixlQUFlLHNCQUFzQixLQUFLLGFBQWEsS0FBSyxVQUFVLE9BQU87QUFDaEksY0FBVSxZQUFZLEtBQUssWUFBWSxNQUFNLE9BQU87QUFDcEQsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEsY0FBNkM7QUFDcEQsVUFBTSxXQUFXLFNBQVMsR0FBK0IsV0FBVyx5QkFBeUIsRUFDM0YscUJBQXFCLEVBQUUsT0FBTyxhQUFXO0FBQ3pDLFlBQU1DLFlBQVcsS0FBSyxZQUFZLE9BQU87QUFDekMsWUFBTSxlQUFlQSxXQUFVLGFBQWEsS0FBSyxRQUFRO0FBQ3pELE1BQUFBLFdBQVUsUUFBUTtBQUNsQixhQUFPO0FBQUEsSUFDUixDQUFDLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLE1BQU0sY0FBYyxFQUFFLEtBQUssQ0FBQztBQUVqRCxVQUFNLFdBQVcsS0FBSyxZQUFZLG9CQUFvQjtBQUN0RCxRQUFJLFVBQVUsYUFBYSxLQUFLLFFBQVEsR0FBRztBQUMxQyxlQUFTLE9BQU8sR0FBRyxHQUFHLG9CQUFvQjtBQUFBLElBQzNDO0FBQ0EsY0FBVSxRQUFRO0FBQ2xCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxZQUFZLFNBQTZFO0FBQ2hHLFdBQU8sUUFBUSxXQUFXLEtBQUsscUJBQXFCLGVBQWUsUUFBUSxRQUFRLElBQUk7QUFBQSxFQUN4RjtBQUVEO0FBL0lhLHVCQUFOO0FBQUEsRUFhSjtBQUFBLEVBQ0E7QUFBQSxHQWRVO0FBd0piLE1BQU0sNkJBQTBGO0FBQUEsRUFDL0YsWUFBWTtBQUFFLFdBQU87QUFBQSxFQUFJO0FBQUEsRUFDekIsZ0JBQWdCO0FBQUUsV0FBTztBQUFBLEVBQThCO0FBQ3hEO0FBRUEsSUFBTSwrQkFBTixNQUE0SDtBQUFBLEVBSTNILFlBQ2tCLGFBQ3FDLG9DQUNyRDtBQUZnQjtBQUNxQztBQUp2RCxTQUFTLGFBQWE7QUFBQSxFQUtsQjtBQUFBLEVBRUosZUFBZSxXQUEyRDtBQUN6RSxjQUFVLFVBQVUsSUFBSSw2QkFBNkI7QUFDckQsVUFBTSxRQUFRLE9BQU8sV0FBVyxFQUFFLDBCQUEwQixDQUFDO0FBQzdELFVBQU0sa0JBQWtCLE9BQU8sV0FBVyxFQUFFLG1DQUFtQyxDQUFDO0FBQ2hGLG9CQUFnQixjQUFjLFNBQVMsV0FBVyxXQUFXO0FBQzdELFVBQU0sZ0JBQWdCLE9BQU8sV0FBVyxFQUFFLDJCQUEyQixDQUFDO0FBQ3RFLFdBQU8sRUFBRSxPQUFPLGlCQUFpQixlQUFlLGFBQWEsSUFBSSxnQkFBZ0IsRUFBRTtBQUFBLEVBQ3BGO0FBQUEsRUFFQSxjQUFjLFNBQXNDLE9BQWUsY0FBaUQ7QUFDbkgsaUJBQWEsWUFBWSxNQUFNO0FBQy9CLGlCQUFhLE1BQU0sY0FBYyxRQUFRO0FBQ3pDLGlCQUFhLGdCQUFnQixNQUFNLFVBQVUsUUFBUSxPQUFPLHFCQUFxQixNQUFNLEtBQUssbUNBQW1DLFVBQVUsS0FBSyxhQUFhLFFBQVEsRUFBRSxJQUFJLFNBQVM7QUFFbEwsaUJBQWEsWUFBWSxJQUFJLEtBQUssbUNBQW1DLHNCQUFzQixDQUFDLEVBQUUsV0FBVyxXQUFXLFFBQVEsTUFBTTtBQUNqSSxVQUFJLG9CQUFvQixPQUFPLFdBQVcsS0FBSyxXQUFXLEtBQUssY0FBYyxRQUFRLElBQUk7QUFDeEYscUJBQWEsZ0JBQWdCLE1BQU0sVUFBVSxVQUFVLFNBQVM7QUFBQSxNQUNqRTtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSx5QkFBeUIsYUFBYSxjQUFjO0FBQzFELFVBQU0sZUFBZSxNQUFNO0FBQzFCLFlBQU0sYUFBYSxLQUFLLG1DQUFtQyxjQUFjLEtBQUssYUFBYSxRQUFRLEVBQUU7QUFDckcsVUFBSSxZQUFZLFNBQVMsUUFBUTtBQUNoQyxxQkFBYSxjQUFjLE1BQU0sVUFBVTtBQUMzQyxxQkFBYSxjQUFjLFlBQVksR0FBRyxzQkFBc0IsSUFBSSxhQUFhLFVBQVUsV0FBVyxRQUFRLE9BQU8sUUFBUSxDQUFDO0FBQUEsTUFDL0gsT0FBTztBQUNOLHFCQUFhLGNBQWMsTUFBTSxVQUFVO0FBQUEsTUFDNUM7QUFBQSxJQUNEO0FBQ0EsaUJBQWE7QUFDYixpQkFBYSxZQUFZLElBQUksS0FBSyxtQ0FBbUMsc0JBQXNCLENBQUMsRUFBRSxXQUFXLFVBQVUsTUFBTTtBQUN4SCxVQUFJLG9CQUFvQixPQUFPLFdBQVcsS0FBSyxXQUFXLEtBQUssY0FBYyxRQUFRLElBQUk7QUFDeEYscUJBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxlQUFlLFNBQXNDLE9BQWUsY0FBdUQ7QUFDMUgsaUJBQWEsWUFBWSxRQUFRO0FBQUEsRUFDbEM7QUFBQSxFQUVBLGdCQUFnQixjQUFpRDtBQUNoRSxpQkFBYSxZQUFZLFFBQVE7QUFBQSxFQUNsQztBQUVEO0FBdkRNLCtCQUFOO0FBQUEsRUFNRztBQUFBLEdBTkc7QUF5RE4sSUFBTSx1QkFBTixjQUFtQyxXQUFXO0FBQUEsRUFLN0MsWUFDa0IsYUFDQSxVQUNSLFNBQytCLHNCQUNjLG9DQUNyQixlQUNVLHlCQUMxQztBQUNELFVBQU07QUFSVztBQUNBO0FBQ1I7QUFDK0I7QUFDYztBQUNyQjtBQUNVO0FBVDVDLFNBQWlCLHFCQUEyQyxDQUFDO0FBYTVELFNBQUssVUFBVSxFQUFFLDRCQUE0QjtBQUM3QyxTQUFLLE9BQU8sS0FBSyxPQUFPO0FBQUEsRUFDekI7QUFBQSxFQUVRLE9BQU8sU0FBNEI7QUFDMUMsVUFBTSxTQUFTLE9BQU8sU0FBUyxFQUFFLGlCQUFpQixDQUFDO0FBQ25ELFVBQU0sUUFBUSxPQUFPLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQztBQUNoRCxVQUFNLGNBQWMsS0FBSyxRQUFRO0FBRWpDLFFBQUksS0FBSyxRQUFRLE9BQU8sV0FBVztBQUNsQyxZQUFNLG1CQUFtQixPQUFPLFFBQVEsRUFBRSxrQkFBa0IsQ0FBQztBQUM3RCxZQUFNLFNBQVMsSUFBSSxPQUFPLGtCQUFrQixtQkFBbUI7QUFDL0QsV0FBSyxrQkFBa0IsTUFBTTtBQUM3QixXQUFLLFVBQVUsS0FBSyxtQ0FBbUMsc0JBQXNCLENBQUMsRUFBRSxXQUFXLFVBQVUsTUFBTTtBQUMxRyxZQUFJLG9CQUFvQixPQUFPLFdBQVcsS0FBSyxXQUFXLEtBQUssY0FBYyxLQUFLLFFBQVEsSUFBSTtBQUM3RixlQUFLLGtCQUFrQixNQUFNO0FBQUEsUUFDOUI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLFdBQUssVUFBVSxPQUFPLFdBQVcsWUFBWTtBQUM1QyxjQUFNLFVBQVUsS0FBSyxtQ0FBbUMsVUFBVSxLQUFLLGFBQWEsS0FBSyxRQUFRLEVBQUU7QUFDbkcsY0FBTSxxQkFBcUIsTUFBTSxLQUFLLGNBQWMsUUFBUTtBQUFBLFVBQzNELE9BQU8sU0FBUywwQkFBMEIsd0JBQXdCLEtBQUssUUFBUSxLQUFLO0FBQUEsVUFDcEYsU0FBUyxVQUNOLFNBQVMsd0NBQXdDLHFFQUFxRSxLQUFLLFNBQVMsZUFBZSxLQUFLLFlBQVksT0FBTyxLQUFLLFFBQVEsS0FBSyxJQUM3TCxTQUFTLHVDQUF1QyxvRUFBb0UsS0FBSyxTQUFTLGVBQWUsS0FBSyxZQUFZLE9BQU8sS0FBSyxRQUFRLEtBQUs7QUFBQSxVQUM5TCxRQUFRO0FBQUEsVUFDUixlQUFlLFVBQVUsU0FBUyxVQUFVLGVBQWUsSUFBSSxTQUFTLFNBQVMsY0FBYztBQUFBLFVBQy9GLGNBQWMsU0FBUyxVQUFVLFFBQVE7QUFBQSxRQUMxQyxDQUFDO0FBQ0QsWUFBSSxtQkFBbUIsV0FBVztBQUNqQyxlQUFLLG1DQUFtQyxjQUFjLEtBQUssYUFBYSxLQUFLLFFBQVEsSUFBSSxDQUFDLE9BQU87QUFBQSxRQUNsRztBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFVBQU0sT0FBTyxPQUFPLFNBQVMsRUFBRSxlQUFlLENBQUM7QUFFL0MsVUFBTSxjQUFjLEVBQUUsdUJBQXVCO0FBQzdDLFVBQU0sb0JBQW9CLEtBQUssVUFBVSxJQUFJLHFCQUFxQixhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQ2xGLFdBQU8sTUFBTSxrQkFBa0IsV0FBVyxDQUFDO0FBQzNDLFNBQUssbUJBQW1CLEtBQUssRUFBRSxRQUFRLE1BQU0sa0JBQWtCLFlBQVksRUFBRSxDQUFDO0FBQzlFLHNCQUFrQixZQUFZO0FBRTlCLFFBQUksS0FBSyxRQUFRLGFBQWE7QUFDN0IsWUFBTSxjQUFjLE9BQU8sYUFBYSxFQUFFLHNCQUFzQixDQUFDO0FBQ2pFLGtCQUFZLGNBQWMsS0FBSyxRQUFRO0FBQUEsSUFDeEM7QUFFQSxVQUFNLGFBQWEsS0FBSyxtQ0FBbUMsY0FBYyxLQUFLLGFBQWEsS0FBSyxRQUFRLEVBQUU7QUFDMUcsUUFBSSxZQUFZLFNBQVMsUUFBUTtBQUNoQyxhQUFPLGFBQWE7QUFBQSxRQUFFO0FBQUEsUUFBbUI7QUFBQSxRQUN4QyxFQUFFLE9BQU8sVUFBVSxjQUFjLFdBQVcsUUFBUSxPQUFPLGFBQWEsU0FBUyxRQUFRLFlBQVksV0FBVyxRQUFRLE9BQU8sYUFBYSxTQUFTLFVBQVUsY0FBYyxRQUFRLENBQUMsSUFBSSxNQUFTO0FBQUEsUUFDbk0sRUFBRSxRQUFRLFFBQVcsV0FBVyxRQUFRLE9BQU8sT0FBTztBQUFBLE1BQUMsQ0FBQztBQUFBLElBQzFEO0FBRUEsVUFBTSx3QkFBd0IsT0FBTyxhQUFhLEVBQUUsa0JBQWtCLENBQUM7QUFDdkUsUUFBSSxLQUFLLFFBQVEsVUFBVTtBQUMxQixZQUFNLFdBQVcsS0FBSyxxQkFBcUIsZUFBMEMsS0FBSyxRQUFRLFFBQVE7QUFDMUcsVUFBSSxTQUFTLFNBQVMsU0FBUztBQUM5QixhQUFLLGdCQUFnQix1QkFBdUQsUUFBUTtBQUFBLE1BQ3JGLFdBQVcsU0FBUyxTQUFTLFlBQVk7QUFDeEMsYUFBSyxtQkFBbUIsdUJBQTBELFFBQVE7QUFBQSxNQUMzRixXQUFXLFNBQVMsU0FBUyxrQkFBa0I7QUFDOUMsYUFBSywyQkFBMkIsdUJBQWtFLFFBQVE7QUFBQSxNQUMzRyxXQUFXLFNBQVMsU0FBUyxXQUFXO0FBQ3ZDLGFBQUssa0JBQWtCLHVCQUF5RCxRQUFRO0FBQUEsTUFDekY7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsa0JBQWtCLFFBQXNCO0FBQy9DLFdBQU8sUUFBUSxLQUFLLG1DQUFtQyxVQUFVLEtBQUssYUFBYSxLQUFLLFFBQVEsRUFBRSxJQUFJLFNBQVMsVUFBVSxlQUFlLElBQUksU0FBUyxVQUFVLGNBQWM7QUFBQSxFQUM5SztBQUFBLEVBRVEsZ0JBQWdCLFdBQXdCLFVBQWdEO0FBQy9GLFVBQU0sWUFBWSxLQUFLLFVBQVUsU0FBUyxPQUFPLEtBQUssUUFBUSxDQUFDO0FBQy9ELFVBQU0sa0JBQWtCLEtBQUssVUFBVSxJQUFJLGtCQUFrQixDQUFDO0FBQzlELFFBQUksVUFBVSxhQUFhO0FBQzFCLFdBQUssVUFBVSxVQUFVLFlBQVksVUFBUTtBQUM1QyxrQkFBVSxTQUFTO0FBQ25CLHdCQUFnQixRQUFRLEtBQUssWUFBWSxNQUFNLFNBQVM7QUFBQSxNQUN6RCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBQ0Esb0JBQWdCLFFBQVEsS0FBSyxZQUFZLFVBQVUsTUFBTSxTQUFTO0FBQUEsRUFDbkU7QUFBQSxFQUVRLFlBQVksV0FBdUIsV0FBcUM7QUFDL0UsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDO0FBQUEsTUFBTztBQUFBLE1BQ047QUFBQSxRQUFFO0FBQUEsUUFBUztBQUFBLFFBQ1Y7QUFBQSxVQUFFO0FBQUEsVUFBTTtBQUFBLFVBQ1AsR0FBRyxVQUFVLFFBQVEsSUFBSSxZQUFVLEVBQUUsTUFBTSxRQUFXLE1BQU0sQ0FBQztBQUFBLFFBQzlEO0FBQUEsUUFDQSxHQUFHLFVBQVUsS0FDWCxJQUFJLFNBQU87QUFDWCxpQkFBTztBQUFBLFlBQUU7QUFBQSxZQUFNO0FBQUEsWUFDZCxHQUFHLElBQUksSUFBSSxhQUFXO0FBQ3JCLGtCQUFJLE9BQU8sWUFBWSxVQUFVO0FBQ2hDLHVCQUFPLEVBQUUsTUFBTSxRQUFXLEVBQUUsS0FBSyxRQUFXLE9BQU8sQ0FBQztBQUFBLGNBQ3JEO0FBQ0Esb0JBQU0sT0FBTyxNQUFNLFFBQVEsT0FBTyxJQUFJLFVBQVUsQ0FBQyxPQUFPO0FBQ3hELHFCQUFPLEVBQUUsTUFBTSxRQUFXLEdBQUcsS0FBSyxJQUFJLFVBQVE7QUFDN0Msc0JBQU0sU0FBaUIsQ0FBQztBQUN4QixvQkFBSSxpQkFBaUIsT0FBTyxHQUFHO0FBQzlCLHdCQUFNLFVBQVUsRUFBRSxJQUFJLE1BQVM7QUFDL0IsdUJBQUssZUFBZSxTQUFTLE9BQU87QUFDcEMseUJBQU8sS0FBSyxPQUFPO0FBQUEsZ0JBQ3BCLFdBQVcsZ0JBQWdCLG9CQUFvQjtBQUM5Qyx3QkFBTSxVQUFVLEVBQUUsRUFBRTtBQUNwQix3QkFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLGdCQUFnQixTQUFTLElBQUksNEJBQTRCLENBQUM7QUFDMUYsc0JBQUksSUFBSSxJQUFJO0FBQ1oseUJBQU8sS0FBSyxPQUFPO0FBQUEsZ0JBQ3BCLFdBQVcsZ0JBQWdCLE9BQU87QUFDakMseUJBQU8sS0FBSyxFQUFFLFFBQVEsRUFBRSxPQUFPLFlBQVksT0FBTyx1QkFBdUIsTUFBTSxPQUFPLElBQUksT0FBTyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDN0cseUJBQU8sS0FBSyxFQUFFLFFBQVEsUUFBVyxNQUFNLE9BQU8sSUFBSSxVQUFVLElBQUksQ0FBQyxDQUFDO0FBQUEsZ0JBQ25FO0FBQ0EsdUJBQU87QUFBQSxjQUNSLENBQUMsRUFBRSxLQUFLLENBQUM7QUFBQSxZQUNWLENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFBQztBQUFBLElBQUM7QUFDTixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsMkJBQTJCLFdBQXdCLFVBQTJEO0FBQ3JILFVBQU0sdUJBQXVCLEtBQUssVUFBVSxTQUFTLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFDMUUsUUFBSSxxQkFBcUIsYUFBYTtBQUNyQyxXQUFLLFVBQVUscUJBQXFCLFlBQVksVUFBUTtBQUN2RCxrQkFBVSxTQUFTO0FBQ25CLGFBQUssdUJBQXVCLE1BQU0sU0FBUztBQUFBLE1BQzVDLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxTQUFLLHVCQUF1QixxQkFBcUIsTUFBTSxTQUFTO0FBQUEsRUFDakU7QUFBQSxFQUVRLG1CQUFtQixXQUF3QixVQUFtRDtBQUNyRyxjQUFVLFVBQVUsSUFBSSxVQUFVO0FBQ2xDLFVBQU0sZUFBZSxLQUFLLFVBQVUsU0FBUyxPQUFPLEtBQUssUUFBUSxDQUFDO0FBQ2xFLFFBQUksYUFBYSxhQUFhO0FBQzdCLFdBQUssVUFBVSxhQUFhLFlBQVksVUFBUTtBQUMvQyxrQkFBVSxTQUFTO0FBQ25CLGFBQUssZUFBZSxNQUFNLFNBQVM7QUFBQSxNQUNwQyxDQUFDLENBQUM7QUFBQSxJQUNIO0FBQ0EsU0FBSyxlQUFlLGFBQWEsTUFBTSxTQUFTO0FBQUEsRUFDakQ7QUFBQSxFQUVRLGVBQWUsVUFBMkIsV0FBOEI7QUFDL0UsVUFBTSxFQUFFLFFBQVEsSUFBSSxLQUFLLFVBQVUsS0FBSyx3QkFBd0IsT0FBTztBQUFBLE1BQ3RFLE9BQU8sU0FBUztBQUFBLE1BQ2hCLFdBQVcsU0FBUztBQUFBLE1BQ3BCLG1CQUFtQjtBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUNGLFdBQU8sV0FBVyxPQUFPO0FBQUEsRUFDMUI7QUFBQSxFQUVRLHVCQUF1QixNQUEyQyxXQUE4QjtBQUN2RyxlQUFXLG1CQUFtQixNQUFNO0FBQ25DLFVBQUksaUJBQWlCLGVBQWUsR0FBRztBQUN0QyxjQUFNLFVBQVUsRUFBRSxJQUFJLE1BQVM7QUFDL0IsYUFBSyxlQUFlLGlCQUFpQixPQUFPO0FBQzVDLGVBQU8sV0FBVyxPQUFPO0FBQUEsTUFDMUIsT0FBTztBQUNOLGNBQU0sZUFBZSxPQUFPLFdBQVcsRUFBRSxPQUFPLENBQUM7QUFDakQsYUFBSyxZQUFZLGlCQUFpQixZQUFZO0FBQUEsTUFDL0M7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsa0JBQWtCLFdBQXdCLFVBQWtEO0FBQ25HLFVBQU0sY0FBYyxLQUFLLFVBQVUsU0FBUyxPQUFPLEtBQUssUUFBUSxDQUFDO0FBQ2pFLFFBQUksWUFBWSxhQUFhO0FBQzVCLFdBQUssVUFBVSxZQUFZLFlBQVksVUFBUTtBQUM5QyxrQkFBVSxTQUFTO0FBQ25CLGtCQUFVLFlBQVksSUFBSTtBQUFBLE1BQzNCLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxjQUFVLFlBQVksWUFBWSxJQUFJO0FBQUEsRUFDdkM7QUFBQSxFQUVBLE9BQU8sUUFBaUIsT0FBc0I7QUFDN0MsU0FBSyxtQkFBbUIsUUFBUSxPQUFLLEVBQUUsT0FBTyxRQUFRLEtBQUssQ0FBQztBQUFBLEVBQzdEO0FBRUQ7QUF4TU0sdUJBQU47QUFBQSxFQVNHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaRzsiLAogICJuYW1lcyI6IFsic3RhdHVzIiwgInJlbmRlcmVyIl0KfQo=
