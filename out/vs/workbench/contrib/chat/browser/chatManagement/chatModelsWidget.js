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
import "./media/chatModelsWidget.css";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import * as DOM from "../../../../../base/browser/dom.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { ILanguageModelsService, resolveProviderDeprecationLink } from "../../../chat/common/languageModels.js";
import { localize } from "../../../../../nls.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchTable } from "../../../../../platform/list/browser/listService.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { toAction, Action, Separator } from "../../../../../base/common/actions.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ChatModelsViewModel, SEARCH_SUGGESTIONS, isLanguageModelProviderEntry, isLanguageModelGroupEntry, isStatusEntry } from "./chatModelsViewModel.js";
import { HighlightedLabel } from "../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { Link } from "../../../../../platform/opener/browser/link.js";
import { SuggestEnabledInput } from "../../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { Delayer } from "../../../../../base/common/async.js";
import { settingsTextInputBorder } from "../../../preferences/common/settingsEditorColorRegistry.js";
import { IChatEntitlementService, ChatEntitlement } from "../../../../services/chat/common/chatEntitlementService.js";
import { DropdownMenuActionViewItem } from "../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { AnchorAlignment } from "../../../../../base/browser/ui/contextview/contextview.js";
import { ToolBar } from "../../../../../base/browser/ui/toolbar/toolbar.js";
import { preferencesClearInputIcon } from "../../../preferences/browser/preferencesIcons.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IEditorProgressService } from "../../../../../platform/progress/common/progress.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { CONTEXT_MODELS_SEARCH_FOCUS } from "../../common/constants.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { LANGUAGE_MODEL_CHAT_PROVIDER_EXTENSION_TAG } from "../../../../../platform/extensionManagement/common/extensionManagement.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import Severity from "../../../../../base/common/severity.js";
import { formatTokenCount } from "../../../../../base/common/numbers.js";
const $ = DOM.$;
const HEADER_HEIGHT = 30;
const VENDOR_ROW_HEIGHT = 30;
const MODEL_ROW_HEIGHT = 26;
const CLOSE_MODAL_EDITOR_COMMAND_ID = "workbench.action.closeModalEditor";
function getModelHoverContent(model) {
  const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
  markdown.appendMarkdown(`**${model.metadata.name}**`);
  if (model.metadata.id !== model.metadata.version) {
    markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}&#64;${model.metadata.version}_&nbsp;</span>`);
  } else {
    markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}_&nbsp;</span>`);
  }
  markdown.appendText(`
`);
  if (model.metadata.statusIcon && model.metadata.tooltip) {
    if (model.metadata.statusIcon) {
      markdown.appendMarkdown(`$(${model.metadata.statusIcon.id})&nbsp;`);
    }
    markdown.appendMarkdown(`${model.metadata.tooltip}`);
    markdown.appendText(`
`);
  }
  if (model.metadata.pricing) {
    markdown.appendMarkdown(`${localize("models.pricing", "Pricing")}: `);
    markdown.appendMarkdown(model.metadata.pricing);
    markdown.appendText(`
`);
  }
  if (model.metadata.inputCost !== void 0 || model.metadata.outputCost !== void 0 || model.metadata.cacheCost !== void 0 || model.metadata.cacheWriteCost !== void 0) {
    if (model.metadata.inputCost !== void 0) {
      markdown.appendMarkdown(model.metadata.inputCost === 1 ? localize("models.inputCost.singular", "Input Cost: {0} credit per 1M tokens", model.metadata.inputCost) : localize("models.inputCost.plural", "Input Cost: {0} credits per 1M tokens", model.metadata.inputCost));
      markdown.appendText(`
`);
    }
    if (model.metadata.cacheCost !== void 0) {
      markdown.appendMarkdown(model.metadata.cacheCost === 1 ? localize("models.cacheCost.singular", "Cache Read Cost: {0} credit per 1M tokens", model.metadata.cacheCost) : localize("models.cacheCost.plural", "Cache Read Cost: {0} credits per 1M tokens", model.metadata.cacheCost));
      markdown.appendText(`
`);
    }
    if (model.metadata.cacheWriteCost !== void 0) {
      markdown.appendMarkdown(model.metadata.cacheWriteCost === 1 ? localize("models.cacheWriteCost.singular", "Cache Write Cost: {0} credit per 1M tokens", model.metadata.cacheWriteCost) : localize("models.cacheWriteCost.plural", "Cache Write Cost: {0} credits per 1M tokens", model.metadata.cacheWriteCost));
      markdown.appendText(`
`);
    }
    if (model.metadata.outputCost !== void 0) {
      markdown.appendMarkdown(model.metadata.outputCost === 1 ? localize("models.outputCost.singular", "Output Cost: {0} credit per 1M tokens", model.metadata.outputCost) : localize("models.outputCost.plural", "Output Cost: {0} credits per 1M tokens", model.metadata.outputCost));
      markdown.appendText(`
`);
    }
    if (model.metadata.longContextInputCost !== void 0 || model.metadata.longContextOutputCost !== void 0 || model.metadata.longContextCacheCost !== void 0 || model.metadata.longContextCacheWriteCost !== void 0) {
      markdown.appendText(`
`);
      markdown.appendMarkdown(`**${localize("models.longContextPricing", "Long Context Pricing")}**`);
      markdown.appendText(`
`);
      if (model.metadata.longContextInputCost !== void 0) {
        markdown.appendMarkdown(model.metadata.longContextInputCost === 1 ? localize("models.longContextInputCost.singular", "Input Cost: {0} credit per 1M tokens", model.metadata.longContextInputCost) : localize("models.longContextInputCost.plural", "Input Cost: {0} credits per 1M tokens", model.metadata.longContextInputCost));
        markdown.appendText(`
`);
      }
      if (model.metadata.longContextCacheCost !== void 0) {
        markdown.appendMarkdown(model.metadata.longContextCacheCost === 1 ? localize("models.longContextCacheCost.singular", "Cache Read Cost: {0} credit per 1M tokens", model.metadata.longContextCacheCost) : localize("models.longContextCacheCost.plural", "Cache Read Cost: {0} credits per 1M tokens", model.metadata.longContextCacheCost));
        markdown.appendText(`
`);
      }
      if (model.metadata.longContextCacheWriteCost !== void 0) {
        markdown.appendMarkdown(model.metadata.longContextCacheWriteCost === 1 ? localize("models.longContextCacheWriteCost.singular", "Cache Write Cost: {0} credit per 1M tokens", model.metadata.longContextCacheWriteCost) : localize("models.longContextCacheWriteCost.plural", "Cache Write Cost: {0} credits per 1M tokens", model.metadata.longContextCacheWriteCost));
        markdown.appendText(`
`);
      }
      if (model.metadata.longContextOutputCost !== void 0) {
        markdown.appendMarkdown(model.metadata.longContextOutputCost === 1 ? localize("models.longContextOutputCost.singular", "Output Cost: {0} credit per 1M tokens", model.metadata.longContextOutputCost) : localize("models.longContextOutputCost.plural", "Output Cost: {0} credits per 1M tokens", model.metadata.longContextOutputCost));
        markdown.appendText(`
`);
      }
    }
  }
  if (model.metadata.maxInputTokens || model.metadata.maxOutputTokens) {
    const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
    markdown.appendMarkdown(`${localize("models.contextSize", "Context Size")}: `);
    markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
    markdown.appendText(`
`);
  }
  if (model.metadata.capabilities) {
    markdown.appendMarkdown(`${localize("models.capabilities", "Capabilities")}: `);
    if (model.metadata.capabilities?.toolCalling) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize("models.toolCalling", "Tools")}_&nbsp;</span>`);
    }
    if (model.metadata.capabilities?.vision) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize("models.vision", "Vision")}_&nbsp;</span>`);
    }
    if (model.metadata.capabilities?.agentMode) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize("models.agentMode", "Agent Mode")}_&nbsp;</span>`);
    }
    for (const editTool of model.metadata.capabilities.editTools ?? []) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${editTool}_&nbsp;</span>`);
    }
    markdown.appendText(`
`);
  }
  return markdown;
}
function buildAddModelsDropdownActions(configurableVendors, supportsAddingModels, runVendorAction) {
  if (!supportsAddingModels) {
    return [];
  }
  const customEndpointVendor = configurableVendors.find((v) => v.vendor === "customendpoint");
  const customOaiVendor = configurableVendors.find((v) => v.vendor === "customoai");
  const sortedVendors = configurableVendors.filter((v) => v.vendor !== "customendpoint" && v.vendor !== "customoai").sort((a, b) => {
    const aDeprecated = a.deprecation?.link ? 1 : 0;
    const bDeprecated = b.deprecation?.link ? 1 : 0;
    if (aDeprecated !== bDeprecated) {
      return aDeprecated - bDeprecated;
    }
    return a.displayName.localeCompare(b.displayName);
  });
  if (customOaiVendor) {
    sortedVendors.push(customOaiVendor);
  }
  const toVendorAction = (vendor) => toAction({
    id: `enable-${vendor.vendor}`,
    label: vendor.displayName,
    run: async () => {
      await runVendorAction(vendor);
    }
  });
  const actions = sortedVendors.map(toVendorAction);
  if (customEndpointVendor) {
    if (actions.length > 0) {
      actions.push(new Separator());
    }
    actions.push(toVendorAction(customEndpointVendor));
  }
  return actions;
}
class ModelsFilterAction extends Action {
  constructor() {
    super("workbench.models.filter", localize("filter", "Filter"), ThemeIcon.asClassName(Codicon.filter));
  }
  async run() {
  }
}
function toggleFilter(currentQuery, filter) {
  const { query, synonyms = [], excludes = [] } = filter;
  const allSynonyms = [query, ...synonyms];
  const isChecked = allSynonyms.some((q) => currentQuery.includes(q));
  const hasExcludedQuery = excludes.some((q) => currentQuery.includes(q));
  if (isChecked) {
    let queryWithRemovedFilter = currentQuery;
    for (const q of allSynonyms) {
      queryWithRemovedFilter = queryWithRemovedFilter.replace(q, "");
    }
    return queryWithRemovedFilter.replace(/\s+/g, " ").trim();
  } else if (hasExcludedQuery) {
    let newQuery = currentQuery;
    for (const q of excludes) {
      newQuery = newQuery.replace(q, "");
    }
    newQuery = newQuery.replace(/\s+/g, " ").trim();
    return newQuery ? `${newQuery} ${query}` : query;
  } else {
    const trimmedQuery = currentQuery.trim();
    return trimmedQuery ? `${trimmedQuery} ${query}` : query;
  }
}
let ModelsSearchFilterDropdownMenuActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(action, options, search, viewModel, contextMenuService) {
    super(
      action,
      { getActions: () => this.getActions() },
      contextMenuService,
      {
        ...options,
        classNames: action.class,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
        menuAsChild: true
      }
    );
    this.search = search;
    this.viewModel = viewModel;
  }
  createProviderAction(vendor, displayName) {
    const query = `@provider:"${displayName}"`;
    const currentQuery = this.search.getValue();
    const isChecked = currentQuery.includes(query) || currentQuery.includes(`@provider:${vendor}`);
    return {
      id: `provider-${vendor}`,
      label: displayName,
      tooltip: localize("filterByProvider", "Filter by {0}", displayName),
      class: void 0,
      enabled: true,
      checked: isChecked,
      run: () => this.toggleFilterAndSearch({ query, synonyms: [`@provider:${vendor}`] })
    };
  }
  createCapabilityAction(capability, label) {
    const query = `@capability:${capability}`;
    const currentQuery = this.search.getValue();
    const isChecked = currentQuery.includes(query);
    return {
      id: `capability-${capability}`,
      label,
      tooltip: localize("filterByCapability", "Filter by {0}", label),
      class: void 0,
      enabled: true,
      checked: isChecked,
      run: () => this.toggleFilterAndSearch({ query })
    };
  }
  toggleFilterAndSearch(filter) {
    const currentQuery = this.search.getValue();
    const newQuery = toggleFilter(currentQuery, filter);
    this.search.setValue(newQuery);
  }
  getActions() {
    const actions = [];
    actions.push(
      this.createCapabilityAction("tools", localize("capability.tools", "Tools")),
      this.createCapabilityAction("vision", localize("capability.vision", "Vision")),
      this.createCapabilityAction("agent", localize("capability.agent", "Agent Mode"))
    );
    const configuredVendors = this.viewModel.getConfiguredVendors();
    if (configuredVendors.length > 1) {
      actions.push(new Separator());
      actions.push(...configuredVendors.map((vendor) => this.createProviderAction(vendor.vendor.vendor, vendor.group.name)));
    }
    return actions;
  }
};
ModelsSearchFilterDropdownMenuActionViewItem = __decorateClass([
  __decorateParam(4, IContextMenuService)
], ModelsSearchFilterDropdownMenuActionViewItem);
class Delegate {
  constructor() {
    this.headerRowHeight = HEADER_HEIGHT;
  }
  getHeight(element) {
    return isLanguageModelProviderEntry(element) || isLanguageModelGroupEntry(element) ? VENDOR_ROW_HEIGHT : MODEL_ROW_HEIGHT;
  }
}
class ModelsTableColumnRenderer {
  renderElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    const isVendor = isLanguageModelProviderEntry(element);
    const isGroup = isLanguageModelGroupEntry(element);
    const isStatus = isStatusEntry(element);
    templateData.container.classList.add("models-table-column");
    const row = templateData.container.parentElement;
    row.classList.toggle("models-vendor-row", isVendor || isGroup);
    row.classList.toggle("models-model-row", !isVendor && !isGroup);
    row.classList.toggle("models-status-row", isStatus);
    const isHidden = isVendor && element.hidden || !isVendor && !isGroup && !isStatus && element.model?.hidden;
    row.classList.toggle("models-row-hidden", !!isHidden);
    if (isVendor) {
      this.renderVendorElement(element, index, templateData);
    } else if (isGroup) {
      this.renderGroupElement(element, index, templateData);
    } else if (isStatus) {
      this.renderStatusElement(element, index, templateData);
    } else {
      this.renderModelElement(element, index, templateData);
    }
  }
  renderStatusElement(element, index, templateData) {
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.disposables.dispose();
  }
}
const _GutterColumnRenderer = class _GutterColumnRenderer extends ModelsTableColumnRenderer {
  constructor(viewModel) {
    super();
    this.viewModel = viewModel;
    this.templateId = _GutterColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("models-gutter-column");
    const actionBar = disposables.add(new ActionBar(container));
    return {
      listRowElement: container.parentElement?.parentElement ?? null,
      container,
      actionBar,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    templateData.actionBar.clear();
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
    this.renderCollapsableElement(entry, templateData);
    this.renderGroupVisibilityElement(entry, templateData);
  }
  renderGroupElement(entry, index, templateData) {
    this.renderCollapsableElement(entry, templateData);
  }
  renderCollapsableElement(entry, templateData) {
    if (templateData.listRowElement) {
      templateData.listRowElement.setAttribute("aria-expanded", entry.collapsed ? "false" : "true");
    }
    const label = entry.collapsed ? localize("expand", "Expand") : localize("collapse", "Collapse");
    const toggleCollapseAction = {
      id: "toggleCollapse",
      label,
      tooltip: label,
      enabled: true,
      class: ThemeIcon.asClassName(entry.collapsed ? Codicon.chevronRight : Codicon.chevronDown),
      run: () => this.viewModel.toggleCollapsed(entry)
    };
    templateData.actionBar.push(toggleCollapseAction, { icon: true, label: false });
  }
  renderModelElement(entry, index, templateData) {
    this.renderModelVisibilityElement(entry, templateData);
  }
  renderGroupVisibilityElement(entry, templateData) {
    const hidden = entry.hidden;
    templateData.actionBar.push({
      id: hidden ? "showGroup" : "hideGroup",
      label: hidden ? localize("models.showGroup", "Show All Models") : localize("models.hideGroup", "Hide All Models"),
      tooltip: hidden ? localize("models.showGroup", "Show All Models") : localize("models.hideGroup", "Hide All Models"),
      class: `model-visibility-toggle ${ThemeIcon.asClassName(hidden ? Codicon.eyeClosed : Codicon.eye)}`,
      enabled: true,
      run: () => this.viewModel.toggleGroupHidden(entry)
    }, { icon: true, label: false });
  }
  renderModelVisibilityElement(entry, templateData) {
    const hidden = entry.model.hidden;
    templateData.actionBar.push({
      id: hidden ? "showModel" : "hideModel",
      label: hidden ? localize("models.showModel", "Show Model") : localize("models.hideModel", "Hide Model"),
      tooltip: hidden ? localize("models.showModel", "Show Model") : localize("models.hideModel", "Hide Model"),
      class: `model-visibility-toggle ${ThemeIcon.asClassName(hidden ? Codicon.eyeClosed : Codicon.eye)}`,
      enabled: true,
      run: () => this.viewModel.toggleModelHidden(entry)
    }, { icon: true, label: false });
  }
};
_GutterColumnRenderer.TEMPLATE_ID = "gutter";
let GutterColumnRenderer = _GutterColumnRenderer;
let ModelNameColumnRenderer = class extends ModelsTableColumnRenderer {
  constructor(hoverService, instantiationService, productService) {
    super();
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.productService = productService;
    this.templateId = ModelNameColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    const nameContainer = DOM.append(container, $(".model-name-container"));
    const statusIcon = DOM.append(nameContainer, $(".status-icon"));
    const nameLabel = disposables.add(new HighlightedLabel(DOM.append(nameContainer, $(".model-name"))));
    const deprecationLinkContainer = DOM.append(nameContainer, $(".model-deprecation-link"));
    deprecationLinkContainer.style.display = "none";
    const deprecationLink = disposables.add(this.instantiationService.createInstance(Link, deprecationLinkContainer, { label: "", href: "" }, {}));
    const modelStatusIcon = DOM.append(nameContainer, $(".model-status-icon"));
    return {
      container,
      statusIcon,
      nameLabel,
      modelStatusIcon,
      deprecationLinkContainer,
      deprecationLink,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    DOM.clearNode(templateData.modelStatusIcon);
    templateData.nameLabel.element.classList.remove("error-status", "warning-status", "info-status");
    templateData.deprecationLinkContainer.style.display = "none";
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
    templateData.nameLabel.set(entry.vendorEntry.group.name, void 0);
    const deprecationLink = entry.vendorEntry.vendor.deprecation?.link;
    if (deprecationLink) {
      const icon = $("span");
      icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.linkExternal));
      icon.setAttribute("aria-hidden", "true");
      const label = $("span.model-deprecation-link-label", void 0, localize("models.deprecation.link.label", "Migrate"), icon);
      templateData.deprecationLink.link = {
        label,
        href: resolveProviderDeprecationLink(deprecationLink, this.productService.urlProtocol).toString(),
        title: localize("models.deprecation.link.tooltip", "The Ollama model provider is deprecated. Please migrate to the official extension.")
      };
      templateData.deprecationLinkContainer.style.display = "";
    }
  }
  renderGroupElement(entry, index, templateData) {
    templateData.nameLabel.set(entry.label, void 0);
  }
  renderModelElement(entry, index, templateData) {
    const { model: modelEntry, modelNameMatches } = entry;
    templateData.statusIcon.style.display = "none";
    templateData.modelStatusIcon.className = "model-status-icon";
    if (modelEntry.metadata.statusIcon) {
      templateData.modelStatusIcon.classList.add(...ThemeIcon.asClassNameArray(modelEntry.metadata.statusIcon));
      templateData.modelStatusIcon.style.display = "";
    } else {
      templateData.modelStatusIcon.style.display = "none";
    }
    templateData.nameLabel.set(modelEntry.metadata.name, modelNameMatches);
    const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    markdown.appendMarkdown(`**${entry.model.metadata.name}**`);
    if (entry.model.metadata.id !== entry.model.metadata.version) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${entry.model.metadata.id}&#64;${entry.model.metadata.version}_&nbsp;</span>`);
    } else {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${entry.model.metadata.id}_&nbsp;</span>`);
    }
    markdown.appendText(`
`);
    if (entry.model.metadata.statusIcon && entry.model.metadata.tooltip) {
      if (entry.model.metadata.statusIcon) {
        markdown.appendMarkdown(`$(${entry.model.metadata.statusIcon.id})&nbsp;`);
      }
      markdown.appendMarkdown(`${entry.model.metadata.tooltip}`);
      markdown.appendText(`
`);
    }
    templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
      content: markdown,
      appearance: {
        compact: true,
        skipFadeInAnimation: true
      }
    })));
  }
  renderStatusElement(entry, index, templateData) {
    templateData.statusIcon.style.display = "";
    templateData.statusIcon.className = "status-icon";
    switch (entry.severity) {
      case Severity.Error:
        templateData.nameLabel.element.classList.add("error-status");
        templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
        break;
      case Severity.Warning:
        templateData.nameLabel.element.classList.add("warning-status");
        templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
        break;
      case Severity.Info:
        templateData.nameLabel.element.classList.add("info-status");
        templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
        break;
    }
    templateData.nameLabel.set(entry.message, void 0, entry.message);
  }
};
ModelNameColumnRenderer.TEMPLATE_ID = "modelName";
ModelNameColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IProductService)
], ModelNameColumnRenderer);
let CombinedCostColumnRenderer = class extends ModelsTableColumnRenderer {
  constructor(hoverService) {
    super();
    this.hoverService = hoverService;
    this.templateId = CombinedCostColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    const grid = DOM.append(container, $(".model-cost-grid"));
    const inputCell = DOM.append(grid, $("span.model-cost-cell"));
    const outputCell = DOM.append(grid, $("span.model-cost-cell"));
    const cacheReadCell = DOM.append(grid, $("span.model-cost-cell"));
    const cacheWriteCell = DOM.append(grid, $("span.model-cost-cell"));
    return {
      container,
      inputCell,
      outputCell,
      cacheReadCell,
      cacheWriteCell,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    templateData.inputCell.textContent = "";
    templateData.outputCell.textContent = "";
    templateData.cacheReadCell.textContent = "";
    templateData.cacheWriteCell.textContent = "";
    super.renderElement(entry, index, templateData);
  }
  renderGroupElement(_element, _index, _templateData) {
  }
  renderVendorElement(_element, _index, _templateData) {
  }
  renderModelElement(entry, index, templateData) {
    const { inputCost, outputCost, cacheCost, cacheWriteCost } = entry.model.metadata;
    const hasCost = inputCost !== void 0 || outputCost !== void 0 || cacheCost !== void 0 || cacheWriteCost !== void 0;
    if (hasCost) {
      templateData.inputCell.textContent = inputCost !== void 0 ? localize("cost.input", "In: {0}", inputCost) : "";
      templateData.outputCell.textContent = outputCost !== void 0 ? localize("cost.output", "Out: {0}", outputCost) : "";
      templateData.cacheReadCell.textContent = cacheCost !== void 0 ? localize("cost.cacheRead", "Cache Read: {0}", cacheCost) : "";
      templateData.cacheWriteCell.textContent = cacheWriteCost !== void 0 ? localize("cost.cacheWrite", "Cache Write: {0}", cacheWriteCost) : "";
      const parts = [];
      if (inputCost !== void 0) {
        parts.push(inputCost === 1 ? localize("cost.inputHover.singular", "Input: {0} credit per 1M tokens", inputCost) : localize("cost.inputHover.plural", "Input: {0} credits per 1M tokens", inputCost));
      }
      if (outputCost !== void 0) {
        parts.push(outputCost === 1 ? localize("cost.outputHover.singular", "Output: {0} credit per 1M tokens", outputCost) : localize("cost.outputHover.plural", "Output: {0} credits per 1M tokens", outputCost));
      }
      if (cacheCost !== void 0) {
        parts.push(cacheCost === 1 ? localize("cost.cacheHover.singular", "Cache Read: {0} credit per 1M tokens", cacheCost) : localize("cost.cacheHover.plural", "Cache Read: {0} credits per 1M tokens", cacheCost));
      }
      if (cacheWriteCost !== void 0) {
        parts.push(cacheWriteCost === 1 ? localize("cost.cacheWriteHover.singular", "Cache Write: {0} credit per 1M tokens", cacheWriteCost) : localize("cost.cacheWriteHover.plural", "Cache Write: {0} credits per 1M tokens", cacheWriteCost));
      }
      templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
        content: parts.join("\n"),
        appearance: {
          compact: true,
          skipFadeInAnimation: true
        }
      })));
    } else {
      const pricingText = entry.model.metadata.pricing;
      if (pricingText) {
        templateData.inputCell.textContent = pricingText;
        templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
          content: localize("pricing.tooltip", "Pricing: {0}", pricingText),
          appearance: {
            compact: true,
            skipFadeInAnimation: true
          }
        })));
      }
    }
  }
};
CombinedCostColumnRenderer.TEMPLATE_ID = "combinedCost";
CombinedCostColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService)
], CombinedCostColumnRenderer);
let TokenLimitsColumnRenderer = class extends ModelsTableColumnRenderer {
  constructor(hoverService) {
    super();
    this.hoverService = hoverService;
    this.templateId = TokenLimitsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    const tokenLimitsElement = DOM.append(container, $(".model-token-limits"));
    return {
      container,
      tokenLimitsElement,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    DOM.clearNode(templateData.tokenLimitsElement);
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
  }
  renderGroupElement(entry, index, templateData) {
  }
  renderModelElement(entry, index, templateData) {
    const { model: modelEntry } = entry;
    const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    if (modelEntry.metadata.maxInputTokens || modelEntry.metadata.maxOutputTokens) {
      const totalTokens = (modelEntry.metadata.maxInputTokens ?? 0) + (modelEntry.metadata.maxOutputTokens ?? 0);
      const tokenDiv = DOM.append(templateData.tokenLimitsElement, $(".token-limit-item"));
      const tokenText = DOM.append(tokenDiv, $("span"));
      tokenText.textContent = formatTokenCount(totalTokens);
      markdown.appendMarkdown(`${localize("models.contextSize", "Context Size")}: `);
      markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
    }
    templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
      content: markdown,
      appearance: {
        compact: true,
        skipFadeInAnimation: true
      }
    })));
  }
};
TokenLimitsColumnRenderer.TEMPLATE_ID = "tokenLimits";
TokenLimitsColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService)
], TokenLimitsColumnRenderer);
const _CapabilitiesColumnRenderer = class _CapabilitiesColumnRenderer extends ModelsTableColumnRenderer {
  constructor() {
    super(...arguments);
    this.templateId = _CapabilitiesColumnRenderer.TEMPLATE_ID;
    this._onDidClickCapability = new Emitter();
    this.onDidClickCapability = this._onDidClickCapability.event;
  }
  dispose() {
    this._onDidClickCapability.dispose();
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("model-capability-column");
    const metadataRow = DOM.append(container, $(".model-capabilities"));
    return {
      container,
      metadataRow,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    DOM.clearNode(templateData.metadataRow);
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
  }
  renderGroupElement(entry, index, templateData) {
  }
  renderModelElement(entry, index, templateData) {
    const { model: modelEntry, capabilityMatches } = entry;
    if (modelEntry.metadata.capabilities?.toolCalling) {
      templateData.elementDisposables.add(this.createCapabilityButton(
        templateData.metadataRow,
        capabilityMatches?.includes("toolCalling") || false,
        localize("models.tools", "Tools"),
        "tools"
      ));
    }
    if (modelEntry.metadata.capabilities?.vision) {
      templateData.elementDisposables.add(this.createCapabilityButton(
        templateData.metadataRow,
        capabilityMatches?.includes("vision") || false,
        localize("models.vision", "Vision"),
        "vision"
      ));
    }
  }
  createCapabilityButton(container, isActive, label, capability) {
    const disposables = new DisposableStore();
    const buttonContainer = DOM.append(container, $(".model-badge-container"));
    const button = disposables.add(new Button(buttonContainer, { secondary: true }));
    button.element.classList.add("model-capability");
    button.element.classList.toggle("active", isActive);
    button.label = label;
    disposables.add(button.onDidClick(() => this._onDidClickCapability.fire(capability)));
    return disposables;
  }
};
_CapabilitiesColumnRenderer.TEMPLATE_ID = "capabilities";
let CapabilitiesColumnRenderer = _CapabilitiesColumnRenderer;
function createProviderGroupActions(viewModel, vendor, groupName, languageModelsService, dialogService) {
  const configuration = vendor.configuration;
  if (!configuration) {
    return [];
  }
  const actions = [];
  const configurationProperties = configuration.properties;
  actions.push(toAction({
    id: "goToSettingsAction",
    label: localize("models.goToSettings", "Open in Language Models (JSON)"),
    run: () => languageModelsService.openLanguageModelsProviderGroupSettings(vendor.vendor, groupName)
  }));
  actions.push(new Separator());
  actions.push(toAction({
    id: "renameGroupAction",
    label: localize("models.renameGroup", "Rename Group"),
    run: () => languageModelsService.renameLanguageModelsProviderGroup(vendor.vendor, groupName)
  }));
  if (configurationProperties?.apiKey) {
    actions.push(toAction({
      id: "updateApiKeyAction",
      label: localize("models.updateApiKey", "Update API Key"),
      run: () => languageModelsService.updateLanguageModelsProviderGroupApiKey(vendor.vendor, groupName)
    }));
  }
  if (configurationProperties?.models?.defaultSnippets?.[0]) {
    actions.push(toAction({
      id: "addModelAction",
      label: localize("models.addModel", "Add Model"),
      run: () => languageModelsService.addLanguageModelsProviderGroupModel(vendor.vendor, groupName)
    }));
  }
  actions.push(new Separator());
  actions.push(toAction({
    id: "deleteAction",
    label: localize("models.deleteAction", "Delete"),
    class: ThemeIcon.asClassName(Codicon.trash),
    run: async () => {
      const result = await dialogService.confirm({
        type: "info",
        message: localize("models.deleteConfirmation", "Would you like to delete {0}?", groupName)
      });
      if (!result.confirmed) {
        return;
      }
      await languageModelsService.removeLanguageModelsProviderGroup(vendor.vendor, groupName);
      viewModel.refresh();
    }
  }));
  return actions;
}
let ActionsColumnRenderer = class extends ModelsTableColumnRenderer {
  constructor(viewModel, instantiationService, languageModelsService, dialogService, commandService, contextMenuService) {
    super();
    this.viewModel = viewModel;
    this.instantiationService = instantiationService;
    this.languageModelsService = languageModelsService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.contextMenuService = contextMenuService;
    this.templateId = ActionsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("models-actions-column");
    const parent = DOM.append(container, $(".actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      ToolBar,
      parent,
      this.contextMenuService,
      {
        icon: true,
        label: false,
        moreIcon: Codicon.gear,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT
      }
    ));
    return {
      container,
      actionBar,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    templateData.actionBar.setActions([]);
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
    const { vendorEntry } = entry;
    const primaryActions = [];
    const secondaryActions = [];
    if (vendorEntry.vendor.configuration) {
      secondaryActions.push(...createProviderGroupActions(this.viewModel, vendorEntry.vendor, vendorEntry.group.name, this.languageModelsService, this.dialogService));
    } else if (vendorEntry.vendor.managementCommand) {
      primaryActions.push(toAction({
        id: "manageVendor",
        label: localize("models.manageProvider", "Manage {0}...", vendorEntry.group.name),
        class: ThemeIcon.asClassName(Codicon.gear),
        run: async () => {
          await this.commandService.executeCommand(vendorEntry.vendor.managementCommand, vendorEntry.vendor.vendor);
          this.viewModel.refresh();
        }
      }));
    }
    templateData.actionBar.setActions(primaryActions, secondaryActions);
  }
  renderGroupElement(entry, index, templateData) {
  }
  renderModelElement(entry, index, templateData) {
    const primaryActions = [];
    if (entry.model.metadata.id !== "auto") {
      primaryActions.push(this.createPinAction(entry.model.identifier));
    }
    const configActions = this.languageModelsService.getModelConfigurationActions(entry.model.identifier);
    const secondaryActions = [...configActions];
    const vendor = entry.model.provider.vendor;
    if (!vendor.isDefault && !vendor.managementCommand && (configActions.length > 0 || entry.model.metadata.configurationSchema)) {
      secondaryActions.push(toAction({
        id: "configureModel",
        label: localize("models.configureModel", "Configure..."),
        run: () => this.languageModelsService.configureModel(entry.model.identifier)
      }));
    }
    templateData.actionBar.setActions(primaryActions, secondaryActions);
  }
  createPinAction(modelIdentifier) {
    const isPinned = this.languageModelsService.isModelPinned(modelIdentifier);
    return toAction({
      id: isPinned ? `unpin.${modelIdentifier}` : `pin.${modelIdentifier}`,
      label: isPinned ? localize("models.unpinModel", "Unpin Model") : localize("models.pinModel", "Pin Model"),
      class: ThemeIcon.asClassName(isPinned ? Codicon.pinned : Codicon.pin),
      run: () => {
        if (isPinned) {
          this.languageModelsService.unpinModel(modelIdentifier);
        } else {
          this.languageModelsService.pinModel(modelIdentifier);
        }
        this.viewModel.refresh();
      }
    });
  }
};
ActionsColumnRenderer.TEMPLATE_ID = "actions";
ActionsColumnRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IContextMenuService)
], ActionsColumnRenderer);
const _ProviderColumnRenderer = class _ProviderColumnRenderer extends ModelsTableColumnRenderer {
  constructor() {
    super(...arguments);
    this.templateId = _ProviderColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    const providerElement = DOM.append(container, $(".model-provider"));
    return {
      container,
      providerElement,
      disposables,
      elementDisposables
    };
  }
  renderVendorElement(entry, index, templateData) {
    templateData.providerElement.textContent = "";
  }
  renderGroupElement(entry, index, templateData) {
    templateData.providerElement.textContent = "";
  }
  renderModelElement(entry, index, templateData) {
    templateData.providerElement.textContent = entry.model.provider.vendor.displayName;
  }
};
_ProviderColumnRenderer.TEMPLATE_ID = "provider";
let ProviderColumnRenderer = _ProviderColumnRenderer;
let ChatModelsWidget = class extends Disposable {
  constructor(languageModelsService, instantiationService, extensionService, contextMenuService, chatEntitlementService, editorProgressService, commandService, editorGroupsService, contextKeyService, dialogService, extensionsWorkbenchService, environmentService) {
    super();
    this.languageModelsService = languageModelsService;
    this.instantiationService = instantiationService;
    this.extensionService = extensionService;
    this.contextMenuService = contextMenuService;
    this.chatEntitlementService = chatEntitlementService;
    this.editorProgressService = editorProgressService;
    this.commandService = commandService;
    this.editorGroupsService = editorGroupsService;
    this.contextKeyService = contextKeyService;
    this.dialogService = dialogService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.environmentService = environmentService;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this.tableMinWidth = 0;
    this.dropdownActions = [];
    this.tableDisposables = this._register(new DisposableStore());
    this.searchFocusContextKey = CONTEXT_MODELS_SEARCH_FOCUS.bindTo(this.contextKeyService);
    this.delayedFiltering = this._register(new Delayer(200));
    this.viewModel = this._register(this.instantiationService.createInstance(ChatModelsViewModel));
    this.element = DOM.$(".models-widget");
    this.create(this.element);
    const loadingPromise = this.extensionService.whenInstalledExtensionsRegistered().then(() => this.viewModel.refresh());
    this.editorProgressService.showWhile(loadingPromise, 300);
  }
  create(container) {
    const searchAndButtonContainer = DOM.append(container, $(".models-search-and-button-container"));
    const placeholder = localize("Search.FullTextSearchPlaceholder", "Type to search...");
    const searchContainer = DOM.append(searchAndButtonContainer, $(".models-search-container"));
    this.searchWidget = this._register(this.instantiationService.createInstance(
      SuggestEnabledInput,
      "chatModelsWidget.searchbox",
      searchContainer,
      {
        triggerCharacters: ["@", ":"],
        provideResults: (query) => {
          const providerSuggestions = this.viewModel.getVendors().map((v) => `@provider:"${v.displayName}"`);
          const allSuggestions = [
            ...providerSuggestions,
            ...SEARCH_SUGGESTIONS.CAPABILITIES
          ];
          if (!query.trim()) {
            return allSuggestions;
          }
          const queryParts = query.split(/\s/g);
          const lastPart = queryParts[queryParts.length - 1];
          if (lastPart.startsWith("@provider:")) {
            return providerSuggestions;
          } else if (lastPart.startsWith("@capability:")) {
            return SEARCH_SUGGESTIONS.CAPABILITIES;
          } else if (lastPart.startsWith("@")) {
            return allSuggestions;
          }
          return [];
        }
      },
      placeholder,
      `chatModelsWidget:searchinput:${ChatModelsWidget.NUM_INSTANCES++}`,
      {
        placeholderText: placeholder,
        styleOverrides: {
          inputBorder: settingsTextInputBorder
        },
        focusContextKey: this.searchFocusContextKey
      }
    ));
    const filterAction = this._register(new ModelsFilterAction());
    const clearSearchAction = this._register(new Action(
      "workbench.models.clearSearch",
      localize("clearSearch", "Clear Search"),
      ThemeIcon.asClassName(preferencesClearInputIcon),
      false,
      () => this.clearSearch()
    ));
    const collapseAllAction = this._register(new Action(
      "workbench.models.collapseAll",
      localize("collapseAll", "Collapse All"),
      ThemeIcon.asClassName(Codicon.collapseAll),
      false,
      () => {
        this.viewModel.collapseAll();
      }
    ));
    collapseAllAction.enabled = this.viewModel.viewModelEntries.some((e) => isLanguageModelGroupEntry(e) || isLanguageModelProviderEntry(e));
    this._register(this.viewModel.onDidChange(() => collapseAllAction.enabled = this.viewModel.viewModelEntries.some((e) => isLanguageModelProviderEntry(e) || isLanguageModelGroupEntry(e))));
    this._register(this.searchWidget.onInputDidChange(() => {
      clearSearchAction.enabled = !!this.searchWidget.getValue();
      this.filterModels();
    }));
    this.searchActionsContainer = DOM.append(searchContainer, $(".models-search-actions"));
    const actions = [clearSearchAction, collapseAllAction, filterAction];
    const toolBar = this._register(new ToolBar(this.searchActionsContainer, this.contextMenuService, {
      actionViewItemProvider: (action, options) => {
        if (action.id === filterAction.id) {
          return this.instantiationService.createInstance(ModelsSearchFilterDropdownMenuActionViewItem, action, options, {
            getValue: () => this.searchWidget.getValue(),
            setValue: (searchValue) => this.search(searchValue)
          }, this.viewModel);
        }
        return void 0;
      },
      getKeyBinding: () => void 0
    }));
    toolBar.setActions(actions);
    this.searchWidget.inputWidget.getContainerDomNode().style.paddingRight = `${DOM.getTotalWidth(this.searchActionsContainer) + 12}px`;
    this.addButtonContainer = DOM.append(searchAndButtonContainer, $(".section-title-actions"));
    const buttonOptions = {
      ...defaultButtonStyles,
      supportIcons: true
    };
    this.addButton = this._register(new Button(this.addButtonContainer, buttonOptions));
    this.addButton.label = `$(${Codicon.add.id}) ${localize("models.enableModelProvider", "Add Models")}`;
    this.addButton.element.classList.add("models-add-model-button");
    this.updateAddModelsButton();
    this._register(this.addButton.onDidClick((e) => {
      if (this.dropdownActions.length > 0) {
        this.contextMenuService.showContextMenu({
          getAnchor: () => this.addButton.element,
          getActions: () => this.dropdownActions
        });
      }
    }));
    if (!this.environmentService.isSessionsWindow) {
      const browseMarketplaceButton = this._register(new Button(this.addButtonContainer, {
        ...buttonOptions,
        secondary: true
      }));
      browseMarketplaceButton.label = `$(${Codicon.extensions.id}) ${localize("models.installProviderExtensions", "Install Model Providers")}`;
      browseMarketplaceButton.element.classList.add("models-browse-marketplace-button");
      this._register(browseMarketplaceButton.onDidClick(() => this.openLanguageModelProviderExtensionsSearch()));
    }
    this.tableContainer = DOM.append(container, $(".models-table-container"));
    this.createTable();
    this._register(this.viewModel.onDidChangeGrouping(() => this.createTable()));
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
      this.updateAddModelsButton();
      this.createTable();
    }));
    this._register(this.chatEntitlementService.onDidChangeUsageBasedBilling(() => this.createTable()));
    this._register(this.languageModelsService.onDidChangeLanguageModelVendors(() => this.updateAddModelsButton()));
    this._register(this.languageModelsService.onDidChangePinnedModels(() => this.viewModel.refresh()));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set(["github.copilot.clientByokEnabled"]))) {
        this.updateAddModelsButton();
      }
    }));
  }
  createTable() {
    this.tableDisposables.clear();
    DOM.clearNode(this.tableContainer);
    this.tableViewport = $(".models-table-viewport");
    this.tableInner = DOM.append(this.tableViewport, $(".models-table-inner"));
    this.tableScrollable = this.tableDisposables.add(new DomScrollableElement(this.tableViewport, {
      horizontal: ScrollbarVisibility.Auto,
      vertical: ScrollbarVisibility.Hidden,
      useShadows: false,
      scrollYToX: true
    }));
    this.tableContainer.appendChild(this.tableScrollable.getDomNode());
    const gutterColumnRenderer = this.instantiationService.createInstance(GutterColumnRenderer, this.viewModel);
    const modelNameColumnRenderer = this.instantiationService.createInstance(ModelNameColumnRenderer);
    const combinedCostColumnRenderer = this.instantiationService.createInstance(CombinedCostColumnRenderer);
    const tokenLimitsColumnRenderer = this.instantiationService.createInstance(TokenLimitsColumnRenderer);
    const capabilitiesColumnRenderer = this.instantiationService.createInstance(CapabilitiesColumnRenderer);
    const actionsColumnRenderer = this.instantiationService.createInstance(ActionsColumnRenderer, this.viewModel);
    const providerColumnRenderer = this.instantiationService.createInstance(ProviderColumnRenderer);
    this.tableDisposables.add(capabilitiesColumnRenderer);
    this.tableDisposables.add(capabilitiesColumnRenderer.onDidClickCapability((capability) => {
      const currentQuery = this.searchWidget.getValue();
      const query = `@capability:${capability}`;
      const newQuery = toggleFilter(currentQuery, { query });
      this.search(newQuery);
    }));
    const columns = [
      {
        label: "",
        tooltip: "",
        weight: 0.05,
        minimumWidth: 64,
        maximumWidth: 64,
        templateId: GutterColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      },
      {
        label: localize("modelName", "Name"),
        tooltip: "",
        weight: 0.35,
        minimumWidth: 200,
        templateId: ModelNameColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      }
    ];
    const isUBB = this.chatEntitlementService.quotas.usageBasedBilling === true;
    columns.push(
      {
        label: localize("tokenLimits", "Context Size"),
        tooltip: "",
        weight: 0.1,
        minimumWidth: 140,
        templateId: TokenLimitsColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      },
      {
        label: localize("capabilities", "Capabilities"),
        tooltip: "",
        weight: 0.15,
        minimumWidth: 180,
        templateId: CapabilitiesColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      },
      {
        label: isUBB ? localize("cost", "Cost (Credits per 1M Tokens)") : localize("pricing", "Pricing"),
        tooltip: "",
        weight: isUBB ? 0.24 : 0.15,
        minimumWidth: isUBB ? 240 : 200,
        templateId: CombinedCostColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      },
      {
        label: "",
        tooltip: "",
        weight: 0.05,
        minimumWidth: 64,
        maximumWidth: 64,
        templateId: ActionsColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      }
    );
    this.tableMinWidth = columns.reduce((sum, c) => sum + c.minimumWidth, 0);
    this.tableInner.style.minWidth = `${this.tableMinWidth}px`;
    this.table = this.tableDisposables.add(this.instantiationService.createInstance(
      WorkbenchTable,
      "ModelsWidget",
      this.tableInner,
      new Delegate(),
      columns,
      [
        gutterColumnRenderer,
        modelNameColumnRenderer,
        combinedCostColumnRenderer,
        tokenLimitsColumnRenderer,
        capabilitiesColumnRenderer,
        actionsColumnRenderer,
        providerColumnRenderer
      ],
      {
        identityProvider: { getId: (e) => e.id },
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel: (e) => {
            if (isLanguageModelProviderEntry(e)) {
              return e.hidden ? localize("vendor.hidden.ariaLabel", "{0} Models (hidden)", e.vendorEntry.group.name) : localize("vendor.ariaLabel", "{0} Models", e.vendorEntry.group.name);
            } else if (isLanguageModelGroupEntry(e)) {
              return e.id === "visible" ? localize("visible.ariaLabel", "Visible Models") : localize("hidden.ariaLabel", "Hidden Models");
            } else if (isStatusEntry(e)) {
              return localize("status.ariaLabel", "Status: {0}", e.message);
            }
            const ariaLabels = [];
            ariaLabels.push(e.model.hidden ? localize("model.name.hidden", "{0} from {1} (hidden)", e.model.metadata.name, e.model.provider.vendor.displayName) : localize("model.name", "{0} from {1}", e.model.metadata.name, e.model.provider.vendor.displayName));
            if (e.model.metadata.maxInputTokens || e.model.metadata.maxOutputTokens) {
              const totalTokens = (e.model.metadata.maxInputTokens ?? 0) + (e.model.metadata.maxOutputTokens ?? 0);
              ariaLabels.push(localize("model.contextSize.totalTokens", "Context size: {0} tokens", formatTokenCount(totalTokens)));
            }
            if (e.model.metadata.capabilities) {
              ariaLabels.push(localize("model.capabilities", "Capabilities: {0}", Object.keys(e.model.metadata.capabilities).join(", ")));
            }
            const pricingText = e.model.metadata.pricing ?? "-";
            if (pricingText !== "-") {
              ariaLabels.push(localize("pricing.ariaLabel", "Pricing: {0}", pricingText));
            }
            if (e.model.metadata.inputCost !== void 0) {
              ariaLabels.push(e.model.metadata.inputCost === 1 ? localize("inputCost.ariaLabel.singular", "Input cost: {0} credit per 1M tokens", e.model.metadata.inputCost) : localize("inputCost.ariaLabel.plural", "Input cost: {0} credits per 1M tokens", e.model.metadata.inputCost));
            }
            if (e.model.metadata.cacheCost !== void 0) {
              ariaLabels.push(e.model.metadata.cacheCost === 1 ? localize("cacheCost.ariaLabel.singular", "Cache read cost: {0} credit per 1M tokens", e.model.metadata.cacheCost) : localize("cacheCost.ariaLabel.plural", "Cache read cost: {0} credits per 1M tokens", e.model.metadata.cacheCost));
            }
            if (e.model.metadata.cacheWriteCost !== void 0) {
              ariaLabels.push(e.model.metadata.cacheWriteCost === 1 ? localize("cacheWriteCost.ariaLabel.singular", "Cache write cost: {0} credit per 1M tokens", e.model.metadata.cacheWriteCost) : localize("cacheWriteCost.ariaLabel.plural", "Cache write cost: {0} credits per 1M tokens", e.model.metadata.cacheWriteCost));
            }
            if (e.model.metadata.outputCost !== void 0) {
              ariaLabels.push(e.model.metadata.outputCost === 1 ? localize("outputCost.ariaLabel.singular", "Output cost: {0} credit per 1M tokens", e.model.metadata.outputCost) : localize("outputCost.ariaLabel.plural", "Output cost: {0} credits per 1M tokens", e.model.metadata.outputCost));
            }
            return ariaLabels.join(". ");
          },
          getWidgetAriaLabel: () => localize("modelsTable.ariaLabel", "Language Models")
        },
        multipleSelectionSupport: true,
        setRowLineHeight: false,
        openOnSingleClick: true,
        alwaysConsumeMouseWheel: false
      }
    ));
    this.tableDisposables.add(this.table.onContextMenu((e) => {
      if (!e.element) {
        return;
      }
      const selection = this.table.getSelection();
      const selectedEntries = selection.every((i) => i !== e.index) ? [e.element] : selection.map((i) => this.viewModel.viewModelEntries[i]).filter((e2) => !!e2);
      const selectedModelEntries = selectedEntries.filter(
        (entry) => !isLanguageModelProviderEntry(entry) && !isLanguageModelGroupEntry(entry) && !isStatusEntry(entry)
      );
      const actions = [];
      let configureGroup;
      let configureVendor;
      if (selectedModelEntries.length) {
        const pinnableEntries = selectedModelEntries.filter((e2) => e2.model.metadata.id !== "auto");
        if (pinnableEntries.length > 0) {
          const allPinned = pinnableEntries.every((e2) => this.languageModelsService.isModelPinned(e2.model.identifier));
          actions.push(toAction({
            id: allPinned ? "unpinModels" : "pinModels",
            label: allPinned ? localize("models.unpinModel", "Unpin Model") : localize("models.pinModel", "Pin Model"),
            class: ThemeIcon.asClassName(allPinned ? Codicon.pinned : Codicon.pin),
            run: () => {
              for (const entry of pinnableEntries) {
                if (allPinned) {
                  this.languageModelsService.unpinModel(entry.model.identifier);
                } else {
                  this.languageModelsService.pinModel(entry.model.identifier);
                }
              }
            }
          }));
        }
        const allHidden = selectedModelEntries.every((e2) => e2.model.hidden);
        actions.push(toAction({
          id: allHidden ? "showModels" : "hideModels",
          label: allHidden ? selectedModelEntries.length === 1 ? localize("models.showModel", "Show Model") : localize("models.showModelsPlural", "Show Models") : selectedModelEntries.length === 1 ? localize("models.hideModel", "Hide Model") : localize("models.hideModelsPlural", "Hide Models"),
          class: ThemeIcon.asClassName(allHidden ? Codicon.eyeClosed : Codicon.eye),
          run: () => this.viewModel.setModelsHidden(selectedModelEntries, !allHidden)
        }));
        if (selectedModelEntries.length === 1) {
          const configActions = this.languageModelsService.getModelConfigurationActions(selectedModelEntries[0].model.identifier);
          if (configActions.length) {
            actions.push(new Separator());
            actions.push(...configActions);
          }
        }
        configureGroup = selectedModelEntries[0].model.provider.group.name;
        configureVendor = selectedModelEntries[0].model.provider.vendor;
        if (selectedModelEntries.some((entry) => entry.model.provider.vendor.isDefault || entry.model.provider.group.name !== configureGroup)) {
          configureGroup = void 0;
          configureVendor = void 0;
        }
      } else if (selectedEntries.length === 1) {
        const entry = e.element;
        if (isLanguageModelProviderEntry(entry)) {
          configureGroup = entry.vendorEntry.group.name;
          configureVendor = entry.vendorEntry.vendor;
          actions.push(toAction({
            id: entry.hidden ? "showGroup" : "hideGroup",
            label: entry.hidden ? localize("models.showGroup", "Show All Models") : localize("models.hideGroup", "Hide All Models"),
            class: ThemeIcon.asClassName(entry.hidden ? Codicon.eyeClosed : Codicon.eye),
            run: () => this.viewModel.toggleGroupHidden(entry)
          }));
        }
      }
      if (configureGroup && configureVendor) {
        const groupActions = configureVendor.managementCommand ? [toAction({
          id: "manageVendor",
          label: localize("models.manageProvider", "Manage {0}...", configureGroup),
          run: async () => {
            await this.commandService.executeCommand(configureVendor.managementCommand, configureVendor.vendor);
            await this.viewModel.refresh();
          }
        })] : createProviderGroupActions(this.viewModel, configureVendor, configureGroup, this.languageModelsService, this.dialogService);
        if (groupActions.length) {
          if (actions.length) {
            actions.push(new Separator());
          }
          actions.push(...groupActions);
        }
      }
      if (actions.length > 0) {
        this.contextMenuService.showContextMenu({
          getAnchor: () => e.anchor,
          getActions: () => actions
        });
      }
    }));
    this.table.splice(0, this.table.length, this.viewModel.viewModelEntries);
    this._onDidChangeItemCount.fire(this.itemCount);
    this.tableDisposables.add(this.viewModel.onDidChange(({ at, removed, added }) => {
      this.table.splice(at, removed, added);
      this._onDidChangeItemCount.fire(this.itemCount);
      if (this.viewModel.selectedEntry) {
        const selectedEntryIndex = this.viewModel.viewModelEntries.indexOf(this.viewModel.selectedEntry);
        this.table.setFocus([selectedEntryIndex]);
        this.table.setSelection([selectedEntryIndex]);
      }
    }));
    this.tableDisposables.add(this.table.onDidOpen(async ({ element, browserEvent }) => {
      if (!element) {
        return;
      }
      if (isStatusEntry(element)) {
        return;
      }
      if (isLanguageModelProviderEntry(element) || isLanguageModelGroupEntry(element)) {
        this.viewModel.toggleCollapsed(element);
      }
    }));
    this.tableDisposables.add(this.table.onDidChangeSelection((e) => this.viewModel.selectedEntry = e.elements[0]));
    this.tableDisposables.add(this.table.onDidBlur(() => {
      if (this.viewModel.shouldRefilter()) {
        this.viewModel.filter(this.searchWidget.getValue());
      }
    }));
    this.layout(this.element.clientHeight, this.element.clientWidth);
  }
  updateAddModelsButton() {
    const configurableVendors = this.languageModelsService.getVendors().filter((vendor) => vendor.managementCommand || vendor.configuration);
    const entitlement = this.chatEntitlementService.entitlement;
    const isManagedEntitlement = entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
    const supportsAddingModels = this.chatEntitlementService.isInternal || this.chatEntitlementService.clientByokEnabled || entitlement !== ChatEntitlement.Unknown && entitlement !== ChatEntitlement.Available && !isManagedEntitlement;
    this.dropdownActions = buildAddModelsDropdownActions(
      configurableVendors,
      supportsAddingModels,
      (vendor) => this.addModelsForVendor(vendor)
    );
    this.addButton.enabled = supportsAddingModels && this.dropdownActions.length > 0;
    this.addButton.setTitle(!supportsAddingModels && isManagedEntitlement ? localize("models.managedByOrganization", "Adding models is managed by your organization") : "");
  }
  async openLanguageModelProviderExtensionsSearch() {
    const activeModalEditorPart = this.editorGroupsService.activeModalEditorPart;
    const isInModalEditor = !!activeModalEditorPart && this.editorGroupsService.getPart(this.editorGroupsService.activeGroup) === activeModalEditorPart;
    if (isInModalEditor) {
      await this.commandService.executeCommand(CLOSE_MODAL_EDITOR_COMMAND_ID);
    }
    await this.extensionsWorkbenchService.openSearch(`tag:"${LANGUAGE_MODEL_CHAT_PROVIDER_EXTENSION_TAG}"`, false);
  }
  filterModels() {
    this.delayedFiltering.trigger(() => {
      this.viewModel.filter(this.searchWidget.getValue());
    });
  }
  async addModelsForVendor(vendor) {
    await this.languageModelsService.configureLanguageModelsProviderGroup(vendor.vendor);
    await this.viewModel.refresh();
  }
  layout(height, width) {
    width = width - 24;
    this.searchWidget.layout(new DOM.Dimension(width - this.searchActionsContainer.clientWidth - this.addButtonContainer.clientWidth - 8, 22));
    const tableHeight = height - 40;
    this.tableContainer.style.height = `${tableHeight}px`;
    const tableWidth = Math.max(width, this.tableMinWidth);
    this.table.layout(tableHeight, tableWidth);
    this.tableScrollable?.scanDomNode();
  }
  focusSearch() {
    this.searchWidget.focus();
  }
  search(filter) {
    this.focusSearch();
    this.searchWidget.setValue(filter);
    this.viewModel.filter(filter);
  }
  clearSearch() {
    this.focusSearch();
    this.searchWidget.setValue("");
  }
  render() {
    if (this.viewModel.shouldRefilter()) {
      this.viewModel.filter(this.searchWidget.getValue());
    }
  }
  /**
   * Gets the total model count (excluding vendor/group/status headers).
   */
  get itemCount() {
    return this.viewModel.viewModelEntries.filter((e) => !isLanguageModelProviderEntry(e) && !isLanguageModelGroupEntry(e) && !isStatusEntry(e)).length;
  }
  /**
   * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
   * to ensure the subscriber receives the latest count.
   */
  fireItemCount() {
    this._onDidChangeItemCount.fire(this.itemCount);
  }
};
ChatModelsWidget.NUM_INSTANCES = 0;
ChatModelsWidget = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IChatEntitlementService),
  __decorateParam(5, IEditorProgressService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IDialogService),
  __decorateParam(10, IExtensionsWorkbenchService),
  __decorateParam(11, IWorkbenchEnvironmentService)
], ChatModelsWidget);
export {
  ChatModelsWidget,
  buildAddModelsDropdownActions,
  getModelHoverContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0TWFuYWdlbWVudC9jaGF0TW9kZWxzV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRNb2RlbHNXaWRnZXQuY3NzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIElCdXR0b25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yLCByZXNvbHZlUHJvdmlkZXJEZXByZWNhdGlvbkxpbmsgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRhYmxlVmlydHVhbERlbGVnYXRlLCBJVGFibGVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCB0b0FjdGlvbiwgQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWxzVmlld01vZGVsLCBJTGFuZ3VhZ2VNb2RlbCwgSUxhbmd1YWdlTW9kZWxFbnRyeSwgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnksIFNFQVJDSF9TVUdHRVNUSU9OUywgaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSwgaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeSwgSVZpZXdNb2RlbEVudHJ5LCBpc1N0YXR1c0VudHJ5LCBJU3RhdHVzRW50cnkgfSBmcm9tICcuL2NoYXRNb2RlbHNWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdEVuYWJsZWRJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zdWdnZXN0RW5hYmxlZElucHV0L3N1Z2dlc3RFbmFibGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHNldHRpbmdzVGV4dElucHV0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vcHJlZmVyZW5jZXMvY29tbW9uL3NldHRpbmdzRWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgQ2hhdEVudGl0bGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgcHJlZmVyZW5jZXNDbGVhcklucHV0SWNvbiB9IGZyb20gJy4uLy4uLy4uL3ByZWZlcmVuY2VzL2Jyb3dzZXIvcHJlZmVyZW5jZXNJY29ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDT05URVhUX01PREVMU19TRUFSQ0hfRk9DVVMgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTEFOR1VBR0VfTU9ERUxfQ0hBVF9QUk9WSURFUl9FWFRFTlNJT05fVEFHIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBmb3JtYXRUb2tlbkNvdW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgSEVBREVSX0hFSUdIVCA9IDMwO1xuY29uc3QgVkVORE9SX1JPV19IRUlHSFQgPSAzMDtcbmNvbnN0IE1PREVMX1JPV19IRUlHSFQgPSAyNjtcbmNvbnN0IENMT1NFX01PREFMX0VESVRPUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VNb2RhbEVkaXRvcic7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2RlbEhvdmVyQ29udGVudChtb2RlbDogSUxhbmd1YWdlTW9kZWwpOiBNYXJrZG93blN0cmluZyB7XG5cdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAqKiR7bW9kZWwubWV0YWRhdGEubmFtZX0qKmApO1xuXHRpZiAobW9kZWwubWV0YWRhdGEuaWQgIT09IG1vZGVsLm1ldGFkYXRhLnZlcnNpb24pIHtcblx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJm5ic3A7PHNwYW4gc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiM4MDgwODAyQjtcIj4mbmJzcDtfJHttb2RlbC5tZXRhZGF0YS5pZH0mIzY0OyR7bW9kZWwubWV0YWRhdGEudmVyc2lvbn1fJm5ic3A7PC9zcGFuPmApO1xuXHR9IGVsc2Uge1xuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPiZuYnNwO18ke21vZGVsLm1ldGFkYXRhLmlkfV8mbmJzcDs8L3NwYW4+YCk7XG5cdH1cblx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cblx0aWYgKG1vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24gJiYgbW9kZWwubWV0YWRhdGEudG9vbHRpcCkge1xuXHRcdGlmIChtb2RlbC5tZXRhZGF0YS5zdGF0dXNJY29uKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke21vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24uaWR9KSZuYnNwO2ApO1xuXHRcdH1cblx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJHttb2RlbC5tZXRhZGF0YS50b29sdGlwfWApO1xuXHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHR9XG5cblx0aWYgKG1vZGVsLm1ldGFkYXRhLnByaWNpbmcpIHtcblx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJHtsb2NhbGl6ZSgnbW9kZWxzLnByaWNpbmcnLCAnUHJpY2luZycpfTogYCk7XG5cdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEucHJpY2luZyk7XG5cdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdH1cblxuXHRpZiAobW9kZWwubWV0YWRhdGEuaW5wdXRDb3N0ICE9PSB1bmRlZmluZWQgfHwgbW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCAhPT0gdW5kZWZpbmVkIHx8IG1vZGVsLm1ldGFkYXRhLmNhY2hlQ29zdCAhPT0gdW5kZWZpbmVkIHx8IG1vZGVsLm1ldGFkYXRhLmNhY2hlV3JpdGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRpZiAobW9kZWwubWV0YWRhdGEuaW5wdXRDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKG1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMuaW5wdXRDb3N0LnNpbmd1bGFyJywgJ0lucHV0IENvc3Q6IHswfSBjcmVkaXQgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLmlucHV0Q29zdC5wbHVyYWwnLCAnSW5wdXQgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCkpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXHRcdGlmIChtb2RlbC5tZXRhZGF0YS5jYWNoZUNvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEuY2FjaGVDb3N0ID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5jYWNoZUNvc3Quc2luZ3VsYXInLCAnQ2FjaGUgUmVhZCBDb3N0OiB7MH0gY3JlZGl0IHBlciAxTSB0b2tlbnMnLCBtb2RlbC5tZXRhZGF0YS5jYWNoZUNvc3QpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5jYWNoZUNvc3QucGx1cmFsJywgJ0NhY2hlIFJlYWQgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmNhY2hlQ29zdCkpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXHRcdGlmIChtb2RlbC5tZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihtb2RlbC5tZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMuY2FjaGVXcml0ZUNvc3Quc2luZ3VsYXInLCAnQ2FjaGUgV3JpdGUgQ29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEuY2FjaGVXcml0ZUNvc3QpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5jYWNoZVdyaXRlQ29zdC5wbHVyYWwnLCAnQ2FjaGUgV3JpdGUgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmNhY2hlV3JpdGVDb3N0KSk7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cdFx0aWYgKG1vZGVsLm1ldGFkYXRhLm91dHB1dENvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMub3V0cHV0Q29zdC5zaW5ndWxhcicsICdPdXRwdXQgQ29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLm91dHB1dENvc3QucGx1cmFsJywgJ091dHB1dCBDb3N0OiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCkpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0ICE9PSB1bmRlZmluZWQgfHwgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0ICE9PSB1bmRlZmluZWQgfHwgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZUNvc3QgIT09IHVuZGVmaW5lZCB8fCBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlV3JpdGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCoqJHtsb2NhbGl6ZSgnbW9kZWxzLmxvbmdDb250ZXh0UHJpY2luZycsICdMb25nIENvbnRleHQgUHJpY2luZycpfSoqYCk7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHRcdGlmIChtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dElucHV0Q29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLmxvbmdDb250ZXh0SW5wdXRDb3N0LnNpbmd1bGFyJywgJ0lucHV0IENvc3Q6IHswfSBjcmVkaXQgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5sb25nQ29udGV4dElucHV0Q29zdC5wbHVyYWwnLCAnSW5wdXQgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0KSk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZUNvc3QgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMubG9uZ0NvbnRleHRDYWNoZUNvc3Quc2luZ3VsYXInLCAnQ2FjaGUgUmVhZCBDb3N0OiB7MH0gY3JlZGl0IHBlciAxTSB0b2tlbnMnLCBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlQ29zdClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMubG9uZ0NvbnRleHRDYWNoZUNvc3QucGx1cmFsJywgJ0NhY2hlIFJlYWQgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVDb3N0KSk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlV3JpdGVDb3N0ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLmxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3Quc2luZ3VsYXInLCAnQ2FjaGUgV3JpdGUgQ29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMubG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdC5wbHVyYWwnLCAnQ2FjaGUgV3JpdGUgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3QpKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLmxvbmdDb250ZXh0T3V0cHV0Q29zdC5zaW5ndWxhcicsICdPdXRwdXQgQ29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5sb25nQ29udGV4dE91dHB1dENvc3QucGx1cmFsJywgJ091dHB1dCBDb3N0OiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0KSk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChtb2RlbC5tZXRhZGF0YS5tYXhJbnB1dFRva2VucyB8fCBtb2RlbC5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMpIHtcblx0XHRjb25zdCB0b3RhbFRva2VucyA9IChtb2RlbC5tZXRhZGF0YS5tYXhJbnB1dFRva2VucyA/PyAwKSArIChtb2RlbC5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMgPz8gMCk7XG5cdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7bG9jYWxpemUoJ21vZGVscy5jb250ZXh0U2l6ZScsICdDb250ZXh0IFNpemUnKX06IGApO1xuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2Zvcm1hdFRva2VuQ291bnQodG90YWxUb2tlbnMpfWApO1xuXHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHR9XG5cblx0aWYgKG1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcykge1xuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2xvY2FsaXplKCdtb2RlbHMuY2FwYWJpbGl0aWVzJywgJ0NhcGFiaWxpdGllcycpfTogYCk7XG5cdFx0aWYgKG1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udG9vbENhbGxpbmcpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPiZuYnNwO18ke2xvY2FsaXplKCdtb2RlbHMudG9vbENhbGxpbmcnLCAnVG9vbHMnKX1fJm5ic3A7PC9zcGFuPmApO1xuXHRcdH1cblx0XHRpZiAobW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24pIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPiZuYnNwO18ke2xvY2FsaXplKCdtb2RlbHMudmlzaW9uJywgJ1Zpc2lvbicpfV8mbmJzcDs8L3NwYW4+YCk7XG5cdFx0fVxuXHRcdGlmIChtb2RlbC5tZXRhZGF0YS5jYXBhYmlsaXRpZXM/LmFnZW50TW9kZSkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCZuYnNwOzxzcGFuIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjojODA4MDgwMkI7XCI+Jm5ic3A7XyR7bG9jYWxpemUoJ21vZGVscy5hZ2VudE1vZGUnLCAnQWdlbnQgTW9kZScpfV8mbmJzcDs8L3NwYW4+YCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZWRpdFRvb2wgb2YgbW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzLmVkaXRUb29scyA/PyBbXSkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCZuYnNwOzxzcGFuIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjojODA4MDgwMkI7XCI+Jm5ic3A7XyR7ZWRpdFRvb2x9XyZuYnNwOzwvc3Bhbj5gKTtcblx0XHR9XG5cdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdH1cblxuXHRyZXR1cm4gbWFya2Rvd247XG59XG5cbi8qKlxuICogUHVyZSBoZWxwZXIgZm9yIGJ1aWxkaW5nIHRoZSBkcm9wZG93biBhY3Rpb25zIHNob3duIGJ5IHRoZSAqKkFkZCBNb2RlbHMqKiBidXR0b24uXG4gKlxuICogRXhwb3NlZCBmb3IgdW5pdCB0ZXN0aW5nLiBXaGVuIGBzdXBwb3J0c0FkZGluZ01vZGVsc2AgaXMgZmFsc2UsIG5vIGFjdGlvbnMgYXJlIHJldHVybmVkXG4gKiByZWdhcmRsZXNzIG9mIHRoZSBvdGhlciBpbnB1dHMgc28gdGhhdCB0aGUgZXhpc3RpbmcgZW50aXRsZW1lbnQvbWFuYWdlZC1ieS1vcmdhbml6YXRpb25cbiAqIHJlc3RyaWN0aW9uIGlzIHByZXNlcnZlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQWRkTW9kZWxzRHJvcGRvd25BY3Rpb25zKFxuXHRjb25maWd1cmFibGVWZW5kb3JzOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcltdLFxuXHRzdXBwb3J0c0FkZGluZ01vZGVsczogYm9vbGVhbixcblx0cnVuVmVuZG9yQWN0aW9uOiAodmVuZG9yOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcikgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4sXG4pOiBJQWN0aW9uW10ge1xuXHRpZiAoIXN1cHBvcnRzQWRkaW5nTW9kZWxzKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Ly8gU29ydCB2ZW5kb3JzIGFscGhhYmV0aWNhbGx5IGJ5IGRpc3BsYXlOYW1lLCBidXQgc2luayBkZXByZWNhdGVkIHByb3ZpZGVycyAodGhvc2UgZGVjbGFyaW5nIGFcblx0Ly8gYGRlcHJlY2F0aW9uLmxpbmtgLCBlLmcuIE9sbGFtYSkgdG8gdGhlIGVuZCBvZiB0aGUgbGlzdC4gXCJPcGVuQUkgQ29tcGF0aWJsZSAoRGVwcmVjYXRlZClcIiAoY3VzdG9tb2FpKVxuXHQvLyBpcyBwaW5uZWQgYWZ0ZXIgdGhlIHNvcnRlZCBsaXN0IGFuZCBcIkN1c3RvbSBFbmRwb2ludFwiIChjdXN0b21lbmRwb2ludCkgYWZ0ZXIgYSBzZXBhcmF0b3IgYXQgdGhlIHZlcnkgZW5kLlxuXHRjb25zdCBjdXN0b21FbmRwb2ludFZlbmRvciA9IGNvbmZpZ3VyYWJsZVZlbmRvcnMuZmluZCh2ID0+IHYudmVuZG9yID09PSAnY3VzdG9tZW5kcG9pbnQnKTtcblx0Y29uc3QgY3VzdG9tT2FpVmVuZG9yID0gY29uZmlndXJhYmxlVmVuZG9ycy5maW5kKHYgPT4gdi52ZW5kb3IgPT09ICdjdXN0b21vYWknKTtcblx0Y29uc3Qgc29ydGVkVmVuZG9ycyA9IGNvbmZpZ3VyYWJsZVZlbmRvcnNcblx0XHQuZmlsdGVyKHYgPT4gdi52ZW5kb3IgIT09ICdjdXN0b21lbmRwb2ludCcgJiYgdi52ZW5kb3IgIT09ICdjdXN0b21vYWknKVxuXHRcdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRjb25zdCBhRGVwcmVjYXRlZCA9IGEuZGVwcmVjYXRpb24/LmxpbmsgPyAxIDogMDtcblx0XHRcdGNvbnN0IGJEZXByZWNhdGVkID0gYi5kZXByZWNhdGlvbj8ubGluayA/IDEgOiAwO1xuXHRcdFx0aWYgKGFEZXByZWNhdGVkICE9PSBiRGVwcmVjYXRlZCkge1xuXHRcdFx0XHRyZXR1cm4gYURlcHJlY2F0ZWQgLSBiRGVwcmVjYXRlZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoYi5kaXNwbGF5TmFtZSk7XG5cdFx0fSk7XG5cdGlmIChjdXN0b21PYWlWZW5kb3IpIHtcblx0XHRzb3J0ZWRWZW5kb3JzLnB1c2goY3VzdG9tT2FpVmVuZG9yKTtcblx0fVxuXG5cdGNvbnN0IHRvVmVuZG9yQWN0aW9uID0gKHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IpID0+IHRvQWN0aW9uKHtcblx0XHRpZDogYGVuYWJsZS0ke3ZlbmRvci52ZW5kb3J9YCxcblx0XHRsYWJlbDogdmVuZG9yLmRpc3BsYXlOYW1lLFxuXHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcnVuVmVuZG9yQWN0aW9uKHZlbmRvcik7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBzb3J0ZWRWZW5kb3JzLm1hcCh0b1ZlbmRvckFjdGlvbik7XG5cdGlmIChjdXN0b21FbmRwb2ludFZlbmRvcikge1xuXHRcdGlmIChhY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdH1cblx0XHRhY3Rpb25zLnB1c2godG9WZW5kb3JBY3Rpb24oY3VzdG9tRW5kcG9pbnRWZW5kb3IpKTtcblx0fVxuXG5cdHJldHVybiBhY3Rpb25zO1xufVxuXG5jbGFzcyBNb2RlbHNGaWx0ZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcignd29ya2JlbmNoLm1vZGVscy5maWx0ZXInLCBsb2NhbGl6ZSgnZmlsdGVyJywgXCJGaWx0ZXJcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmZpbHRlcikpO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUZpbHRlclF1ZXJ5IHtcblx0LyoqIFRoZSBwcmltYXJ5IGZpbHRlciBxdWVyeSBzdHJpbmcgKi9cblx0cXVlcnk6IHN0cmluZztcblx0LyoqIEFsdGVybmF0aXZlIHF1ZXJ5IHN0cmluZ3MgdGhhdCBhcmUgdHJlYXRlZCBhcyBzeW5vbnltcyBvZiB0aGUgcHJpbWFyeSBxdWVyeSAqL1xuXHRzeW5vbnltcz86IHN0cmluZ1tdO1xuXHQvKiogUXVlcnkgc3RyaW5ncyB0aGF0IHNob3VsZCBiZSByZW1vdmVkIHdoZW4gYWRkaW5nIHRoaXMgZmlsdGVyIChtdXR1YWxseSBleGNsdXNpdmUgZmlsdGVycykgKi9cblx0ZXhjbHVkZXM/OiBzdHJpbmdbXTtcbn1cblxuZnVuY3Rpb24gdG9nZ2xlRmlsdGVyKGN1cnJlbnRRdWVyeTogc3RyaW5nLCBmaWx0ZXI6IElGaWx0ZXJRdWVyeSk6IHN0cmluZyB7XG5cdGNvbnN0IHsgcXVlcnksIHN5bm9ueW1zID0gW10sIGV4Y2x1ZGVzID0gW10gfSA9IGZpbHRlcjtcblx0Y29uc3QgYWxsU3lub255bXMgPSBbcXVlcnksIC4uLnN5bm9ueW1zXTtcblx0Y29uc3QgaXNDaGVja2VkID0gYWxsU3lub255bXMuc29tZShxID0+IGN1cnJlbnRRdWVyeS5pbmNsdWRlcyhxKSk7XG5cdGNvbnN0IGhhc0V4Y2x1ZGVkUXVlcnkgPSBleGNsdWRlcy5zb21lKHEgPT4gY3VycmVudFF1ZXJ5LmluY2x1ZGVzKHEpKTtcblxuXHRpZiAoaXNDaGVja2VkKSB7XG5cdFx0Ly8gUXVlcnkgb3Igc3lub255bSBpcyBhbHJlYWR5IHNldCwgcmVtb3ZlIGFsbCBvZiB0aGVtICh0b2dnbGUgb2ZmKVxuXHRcdGxldCBxdWVyeVdpdGhSZW1vdmVkRmlsdGVyID0gY3VycmVudFF1ZXJ5O1xuXHRcdGZvciAoY29uc3QgcSBvZiBhbGxTeW5vbnltcykge1xuXHRcdFx0cXVlcnlXaXRoUmVtb3ZlZEZpbHRlciA9IHF1ZXJ5V2l0aFJlbW92ZWRGaWx0ZXIucmVwbGFjZShxLCAnJyk7XG5cdFx0fVxuXHRcdHJldHVybiBxdWVyeVdpdGhSZW1vdmVkRmlsdGVyLnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG5cdH0gZWxzZSBpZiAoaGFzRXhjbHVkZWRRdWVyeSkge1xuXHRcdC8vIEFuIGV4Y2x1ZGVkIHF1ZXJ5IGlzIHNldCwgcmVwbGFjZSBpdCB3aXRoIHRoZSBuZXcgcXVlcnlcblx0XHRsZXQgbmV3UXVlcnkgPSBjdXJyZW50UXVlcnk7XG5cdFx0Zm9yIChjb25zdCBxIG9mIGV4Y2x1ZGVzKSB7XG5cdFx0XHRuZXdRdWVyeSA9IG5ld1F1ZXJ5LnJlcGxhY2UocSwgJycpO1xuXHRcdH1cblx0XHRuZXdRdWVyeSA9IG5ld1F1ZXJ5LnJlcGxhY2UoL1xccysvZywgJyAnKS50cmltKCk7XG5cdFx0cmV0dXJuIG5ld1F1ZXJ5ID8gYCR7bmV3UXVlcnl9ICR7cXVlcnl9YCA6IHF1ZXJ5O1xuXHR9IGVsc2Uge1xuXHRcdC8vIE5vIGZpbHRlciBpcyBzZXQsIGFkZCB0aGUgbmV3IHF1ZXJ5XG5cdFx0Y29uc3QgdHJpbW1lZFF1ZXJ5ID0gY3VycmVudFF1ZXJ5LnRyaW0oKTtcblx0XHRyZXR1cm4gdHJpbW1lZFF1ZXJ5ID8gYCR7dHJpbW1lZFF1ZXJ5fSAke3F1ZXJ5fWAgOiBxdWVyeTtcblx0fVxufVxuXG5jbGFzcyBNb2RlbHNTZWFyY2hGaWx0ZXJEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSBleHRlbmRzIERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlYXJjaDoge1xuXHRcdFx0Z2V0VmFsdWUoKTogc3RyaW5nO1xuXHRcdFx0c2V0VmFsdWUobmV3VmFsdWU6IHN0cmluZyk6IHZvaWQ7XG5cdFx0fSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdNb2RlbDogQ2hhdE1vZGVsc1ZpZXdNb2RlbCxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoYWN0aW9uLFxuXHRcdFx0eyBnZXRBY3Rpb25zOiAoKSA9PiB0aGlzLmdldEFjdGlvbnMoKSB9LFxuXHRcdFx0Y29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRjbGFzc05hbWVzOiBhY3Rpb24uY2xhc3MsXG5cdFx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiBBbmNob3JBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRcdG1lbnVBc0NoaWxkOiB0cnVlXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUHJvdmlkZXJBY3Rpb24odmVuZG9yOiBzdHJpbmcsIGRpc3BsYXlOYW1lOiBzdHJpbmcpOiBJQWN0aW9uIHtcblx0XHRjb25zdCBxdWVyeSA9IGBAcHJvdmlkZXI6XCIke2Rpc3BsYXlOYW1lfVwiYDtcblx0XHRjb25zdCBjdXJyZW50UXVlcnkgPSB0aGlzLnNlYXJjaC5nZXRWYWx1ZSgpO1xuXHRcdGNvbnN0IGlzQ2hlY2tlZCA9IGN1cnJlbnRRdWVyeS5pbmNsdWRlcyhxdWVyeSkgfHwgY3VycmVudFF1ZXJ5LmluY2x1ZGVzKGBAcHJvdmlkZXI6JHt2ZW5kb3J9YCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGBwcm92aWRlci0ke3ZlbmRvcn1gLFxuXHRcdFx0bGFiZWw6IGRpc3BsYXlOYW1lLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2ZpbHRlckJ5UHJvdmlkZXInLCBcIkZpbHRlciBieSB7MH1cIiwgZGlzcGxheU5hbWUpLFxuXHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjaGVja2VkOiBpc0NoZWNrZWQsXG5cdFx0XHRydW46ICgpID0+IHRoaXMudG9nZ2xlRmlsdGVyQW5kU2VhcmNoKHsgcXVlcnksIHN5bm9ueW1zOiBbYEBwcm92aWRlcjoke3ZlbmRvcn1gXSB9KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNhcGFiaWxpdHlBY3Rpb24oY2FwYWJpbGl0eTogc3RyaW5nLCBsYWJlbDogc3RyaW5nKTogSUFjdGlvbiB7XG5cdFx0Y29uc3QgcXVlcnkgPSBgQGNhcGFiaWxpdHk6JHtjYXBhYmlsaXR5fWA7XG5cdFx0Y29uc3QgY3VycmVudFF1ZXJ5ID0gdGhpcy5zZWFyY2guZ2V0VmFsdWUoKTtcblx0XHRjb25zdCBpc0NoZWNrZWQgPSBjdXJyZW50UXVlcnkuaW5jbHVkZXMocXVlcnkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBgY2FwYWJpbGl0eS0ke2NhcGFiaWxpdHl9YCxcblx0XHRcdGxhYmVsLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2ZpbHRlckJ5Q2FwYWJpbGl0eScsIFwiRmlsdGVyIGJ5IHswfVwiLCBsYWJlbCksXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNoZWNrZWQ6IGlzQ2hlY2tlZCxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy50b2dnbGVGaWx0ZXJBbmRTZWFyY2goeyBxdWVyeSB9KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUZpbHRlckFuZFNlYXJjaChmaWx0ZXI6IElGaWx0ZXJRdWVyeSk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRRdWVyeSA9IHRoaXMuc2VhcmNoLmdldFZhbHVlKCk7XG5cdFx0Y29uc3QgbmV3UXVlcnkgPSB0b2dnbGVGaWx0ZXIoY3VycmVudFF1ZXJ5LCBmaWx0ZXIpO1xuXHRcdHRoaXMuc2VhcmNoLnNldFZhbHVlKG5ld1F1ZXJ5KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0Ly8gQ2FwYWJpbGl0eSBmaWx0ZXJzXG5cdFx0YWN0aW9ucy5wdXNoKFxuXHRcdFx0dGhpcy5jcmVhdGVDYXBhYmlsaXR5QWN0aW9uKCd0b29scycsIGxvY2FsaXplKCdjYXBhYmlsaXR5LnRvb2xzJywgXCJUb29sc1wiKSksXG5cdFx0XHR0aGlzLmNyZWF0ZUNhcGFiaWxpdHlBY3Rpb24oJ3Zpc2lvbicsIGxvY2FsaXplKCdjYXBhYmlsaXR5LnZpc2lvbicsIFwiVmlzaW9uXCIpKSxcblx0XHRcdHRoaXMuY3JlYXRlQ2FwYWJpbGl0eUFjdGlvbignYWdlbnQnLCBsb2NhbGl6ZSgnY2FwYWJpbGl0eS5hZ2VudCcsIFwiQWdlbnQgTW9kZVwiKSlcblx0XHQpO1xuXG5cdFx0Ly8gUHJvdmlkZXIgZmlsdGVycyAtIG9ubHkgc2hvdyBwcm92aWRlcnMgd2l0aCBjb25maWd1cmVkIG1vZGVsc1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRWZW5kb3JzID0gdGhpcy52aWV3TW9kZWwuZ2V0Q29uZmlndXJlZFZlbmRvcnMoKTtcblx0XHRpZiAoY29uZmlndXJlZFZlbmRvcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRhY3Rpb25zLnB1c2goLi4uY29uZmlndXJlZFZlbmRvcnMubWFwKHZlbmRvciA9PiB0aGlzLmNyZWF0ZVByb3ZpZGVyQWN0aW9uKHZlbmRvci52ZW5kb3IudmVuZG9yLCB2ZW5kb3IuZ3JvdXAubmFtZSkpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxufVxuXG5jbGFzcyBEZWxlZ2F0ZSBpbXBsZW1lbnRzIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZTxJVmlld01vZGVsRW50cnk+IHtcblx0cmVhZG9ubHkgaGVhZGVyUm93SGVpZ2h0ID0gSEVBREVSX0hFSUdIVDtcblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IElWaWV3TW9kZWxFbnRyeSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZWxlbWVudCkgfHwgaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShlbGVtZW50KSA/IFZFTkRPUl9ST1dfSEVJR0hUIDogTU9ERUxfUk9XX0hFSUdIVDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSU1vZGVsVGFibGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuYWJzdHJhY3QgY2xhc3MgTW9kZWxzVGFibGVDb2x1bW5SZW5kZXJlcjxUIGV4dGVuZHMgSU1vZGVsVGFibGVDb2x1bW5UZW1wbGF0ZURhdGE+IGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SVZpZXdNb2RlbEVudHJ5LCBUPiB7XG5cdGFic3RyYWN0IHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZztcblx0YWJzdHJhY3QgcmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFQ7XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVmlld01vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogVCk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBpc1ZlbmRvciA9IGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZWxlbWVudCk7XG5cdFx0Y29uc3QgaXNHcm91cCA9IGlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkoZWxlbWVudCk7XG5cdFx0Y29uc3QgaXNTdGF0dXMgPSBpc1N0YXR1c0VudHJ5KGVsZW1lbnQpO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9kZWxzLXRhYmxlLWNvbHVtbicpO1xuXHRcdGNvbnN0IHJvdyA9IHRlbXBsYXRlRGF0YS5jb250YWluZXIucGFyZW50RWxlbWVudCE7XG5cdFx0cm93LmNsYXNzTGlzdC50b2dnbGUoJ21vZGVscy12ZW5kb3Itcm93JywgaXNWZW5kb3IgfHwgaXNHcm91cCk7XG5cdFx0cm93LmNsYXNzTGlzdC50b2dnbGUoJ21vZGVscy1tb2RlbC1yb3cnLCAhaXNWZW5kb3IgJiYgIWlzR3JvdXApO1xuXHRcdHJvdy5jbGFzc0xpc3QudG9nZ2xlKCdtb2RlbHMtc3RhdHVzLXJvdycsIGlzU3RhdHVzKTtcblx0XHRjb25zdCBpc0hpZGRlbiA9IChpc1ZlbmRvciAmJiBlbGVtZW50LmhpZGRlbikgfHwgKCFpc1ZlbmRvciAmJiAhaXNHcm91cCAmJiAhaXNTdGF0dXMgJiYgKGVsZW1lbnQgYXMgSUxhbmd1YWdlTW9kZWxFbnRyeSkubW9kZWw/LmhpZGRlbik7XG5cdFx0cm93LmNsYXNzTGlzdC50b2dnbGUoJ21vZGVscy1yb3ctaGlkZGVuJywgISFpc0hpZGRlbik7XG5cdFx0aWYgKGlzVmVuZG9yKSB7XG5cdFx0XHR0aGlzLnJlbmRlclZlbmRvckVsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fSBlbHNlIGlmIChpc0dyb3VwKSB7XG5cdFx0XHR0aGlzLnJlbmRlckdyb3VwRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9IGVsc2UgaWYgKGlzU3RhdHVzKSB7XG5cdFx0XHR0aGlzLnJlbmRlclN0YXR1c0VsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVuZGVyTW9kZWxFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblx0fVxuXG5cdGFic3RyYWN0IHJlbmRlclZlbmRvckVsZW1lbnQoZWxlbWVudDogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IFQpOiB2b2lkO1xuXHRhYnN0cmFjdCByZW5kZXJHcm91cEVsZW1lbnQoZWxlbWVudDogSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IFQpOiB2b2lkO1xuXHRhYnN0cmFjdCByZW5kZXJNb2RlbEVsZW1lbnQoZWxlbWVudDogSUxhbmd1YWdlTW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBUKTogdm9pZDtcblxuXHRwcm90ZWN0ZWQgcmVuZGVyU3RhdHVzRWxlbWVudChlbGVtZW50OiBJU3RhdHVzRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogVCk6IHZvaWQgeyB9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogVCk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YSBleHRlbmRzIElNb2RlbFRhYmxlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgbGlzdFJvd0VsZW1lbnQ6IEhUTUxFbGVtZW50IHwgbnVsbDtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBBY3Rpb25CYXI7XG59XG5cbmNsYXNzIEd1dHRlckNvbHVtblJlbmRlcmVyIGV4dGVuZHMgTW9kZWxzVGFibGVDb2x1bW5SZW5kZXJlcjxJVG9nZ2xlQ29sbGFwc2VDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnZ3V0dGVyJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBHdXR0ZXJDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdNb2RlbDogQ2hhdE1vZGVsc1ZpZXdNb2RlbCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJVG9nZ2xlQ29sbGFwc2VDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9kZWxzLWd1dHRlci1jb2x1bW4nKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbkJhcihjb250YWluZXIpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGlzdFJvd0VsZW1lbnQ6IGNvbnRhaW5lci5wYXJlbnRFbGVtZW50Py5wYXJlbnRFbGVtZW50ID8/IG51bGwsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRhY3Rpb25CYXIsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJFbGVtZW50KGVudHJ5OiBJVmlld01vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRvZ2dsZUNvbGxhcHNlQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jbGVhcigpO1xuXHRcdHN1cGVyLnJlbmRlckVsZW1lbnQoZW50cnksIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyVmVuZG9yRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyQ29sbGFwc2FibGVFbGVtZW50KGVudHJ5LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdHRoaXMucmVuZGVyR3JvdXBWaXNpYmlsaXR5RWxlbWVudChlbnRyeSwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckdyb3VwRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyQ29sbGFwc2FibGVFbGVtZW50KGVudHJ5LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb2xsYXBzYWJsZUVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSB8IElMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeSwgdGVtcGxhdGVEYXRhOiBJVG9nZ2xlQ29sbGFwc2VDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRpZiAodGVtcGxhdGVEYXRhLmxpc3RSb3dFbGVtZW50KSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubGlzdFJvd0VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgZW50cnkuY29sbGFwc2VkID8gJ2ZhbHNlJyA6ICd0cnVlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSBlbnRyeS5jb2xsYXBzZWQgPyBsb2NhbGl6ZSgnZXhwYW5kJywgJ0V4cGFuZCcpIDogbG9jYWxpemUoJ2NvbGxhcHNlJywgJ0NvbGxhcHNlJyk7XG5cdFx0Y29uc3QgdG9nZ2xlQ29sbGFwc2VBY3Rpb24gPSB7XG5cdFx0XHRpZDogJ3RvZ2dsZUNvbGxhcHNlJyxcblx0XHRcdGxhYmVsLFxuXHRcdFx0dG9vbHRpcDogbGFiZWwsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShlbnRyeS5jb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd24pLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLnZpZXdNb2RlbC50b2dnbGVDb2xsYXBzZWQoZW50cnkpXG5cdFx0fTtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2godG9nZ2xlQ29sbGFwc2VBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyTW9kZWxFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyTW9kZWxWaXNpYmlsaXR5RWxlbWVudChlbnRyeSwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyR3JvdXBWaXNpYmlsaXR5RWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCB0ZW1wbGF0ZURhdGE6IElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGhpZGRlbiA9IGVudHJ5LmhpZGRlbjtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2goe1xuXHRcdFx0aWQ6IGhpZGRlbiA/ICdzaG93R3JvdXAnIDogJ2hpZGVHcm91cCcsXG5cdFx0XHRsYWJlbDogaGlkZGVuXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5zaG93R3JvdXAnLCBcIlNob3cgQWxsIE1vZGVsc1wiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMuaGlkZUdyb3VwJywgXCJIaWRlIEFsbCBNb2RlbHNcIiksXG5cdFx0XHR0b29sdGlwOiBoaWRkZW5cblx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLnNob3dHcm91cCcsIFwiU2hvdyBBbGwgTW9kZWxzXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5oaWRlR3JvdXAnLCBcIkhpZGUgQWxsIE1vZGVsc1wiKSxcblx0XHRcdGNsYXNzOiBgbW9kZWwtdmlzaWJpbGl0eS10b2dnbGUgJHtUaGVtZUljb24uYXNDbGFzc05hbWUoaGlkZGVuID8gQ29kaWNvbi5leWVDbG9zZWQgOiBDb2RpY29uLmV5ZSl9YCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRydW46ICgpID0+IHRoaXMudmlld01vZGVsLnRvZ2dsZUdyb3VwSGlkZGVuKGVudHJ5KSxcblx0XHR9LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTW9kZWxWaXNpYmlsaXR5RWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxFbnRyeSwgdGVtcGxhdGVEYXRhOiBJVG9nZ2xlQ29sbGFwc2VDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBoaWRkZW4gPSBlbnRyeS5tb2RlbC5oaWRkZW47XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKHtcblx0XHRcdGlkOiBoaWRkZW4gPyAnc2hvd01vZGVsJyA6ICdoaWRlTW9kZWwnLFxuXHRcdFx0bGFiZWw6IGhpZGRlblxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMuc2hvd01vZGVsJywgXCJTaG93IE1vZGVsXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5oaWRlTW9kZWwnLCBcIkhpZGUgTW9kZWxcIiksXG5cdFx0XHR0b29sdGlwOiBoaWRkZW5cblx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLnNob3dNb2RlbCcsIFwiU2hvdyBNb2RlbFwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMuaGlkZU1vZGVsJywgXCJIaWRlIE1vZGVsXCIpLFxuXHRcdFx0Y2xhc3M6IGBtb2RlbC12aXNpYmlsaXR5LXRvZ2dsZSAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShoaWRkZW4gPyBDb2RpY29uLmV5ZUNsb3NlZCA6IENvZGljb24uZXllKX1gLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy52aWV3TW9kZWwudG9nZ2xlTW9kZWxIaWRkZW4oZW50cnkpLFxuXHRcdH0sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTW9kZWxOYW1lQ29sdW1uVGVtcGxhdGVEYXRhIGV4dGVuZHMgSU1vZGVsVGFibGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBzdGF0dXNJY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbmFtZUxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRyZWFkb25seSBtb2RlbFN0YXR1c0ljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXByZWNhdGlvbkxpbmtDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXByZWNhdGlvbkxpbms6IExpbms7XG59XG5cbmNsYXNzIE1vZGVsTmFtZUNvbHVtblJlbmRlcmVyIGV4dGVuZHMgTW9kZWxzVGFibGVDb2x1bW5SZW5kZXJlcjxJTW9kZWxOYW1lQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdtb2RlbE5hbWUnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IE1vZGVsTmFtZUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSU1vZGVsTmFtZUNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG5hbWVDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vZGVsLW5hbWUtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHN0YXR1c0ljb24gPSBET00uYXBwZW5kKG5hbWVDb250YWluZXIsICQoJy5zdGF0dXMtaWNvbicpKTtcblx0XHRjb25zdCBuYW1lTGFiZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwoRE9NLmFwcGVuZChuYW1lQ29udGFpbmVyLCAkKCcubW9kZWwtbmFtZScpKSkpO1xuXHRcdGNvbnN0IGRlcHJlY2F0aW9uTGlua0NvbnRhaW5lciA9IERPTS5hcHBlbmQobmFtZUNvbnRhaW5lciwgJCgnLm1vZGVsLWRlcHJlY2F0aW9uLWxpbmsnKSk7XG5cdFx0ZGVwcmVjYXRpb25MaW5rQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29uc3QgZGVwcmVjYXRpb25MaW5rID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGluaywgZGVwcmVjYXRpb25MaW5rQ29udGFpbmVyLCB7IGxhYmVsOiAnJywgaHJlZjogJycgfSwge30pKTtcblx0XHRjb25zdCBtb2RlbFN0YXR1c0ljb24gPSBET00uYXBwZW5kKG5hbWVDb250YWluZXIsICQoJy5tb2RlbC1zdGF0dXMtaWNvbicpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0c3RhdHVzSWNvbixcblx0XHRcdG5hbWVMYWJlbCxcblx0XHRcdG1vZGVsU3RhdHVzSWNvbixcblx0XHRcdGRlcHJlY2F0aW9uTGlua0NvbnRhaW5lcixcblx0XHRcdGRlcHJlY2F0aW9uTGluayxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckVsZW1lbnQoZW50cnk6IElWaWV3TW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTW9kZWxOYW1lQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEubW9kZWxTdGF0dXNJY29uKTtcblx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZXJyb3Itc3RhdHVzJywgJ3dhcm5pbmctc3RhdHVzJywgJ2luZm8tc3RhdHVzJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmRlcHJlY2F0aW9uTGlua0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHN1cGVyLnJlbmRlckVsZW1lbnQoZW50cnksIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyVmVuZG9yRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNb2RlbE5hbWVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLnNldChlbnRyeS52ZW5kb3JFbnRyeS5ncm91cC5uYW1lLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgZGVwcmVjYXRpb25MaW5rID0gZW50cnkudmVuZG9yRW50cnkudmVuZG9yLmRlcHJlY2F0aW9uPy5saW5rO1xuXHRcdGlmIChkZXByZWNhdGlvbkxpbmspIHtcblx0XHRcdGNvbnN0IGljb24gPSAkKCdzcGFuJyk7XG5cdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5saW5rRXh0ZXJuYWwpKTtcblx0XHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCBsYWJlbCA9ICQoJ3NwYW4ubW9kZWwtZGVwcmVjYXRpb24tbGluay1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ21vZGVscy5kZXByZWNhdGlvbi5saW5rLmxhYmVsJywgXCJNaWdyYXRlXCIpLCBpY29uKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXByZWNhdGlvbkxpbmsubGluayA9IHtcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGhyZWY6IHJlc29sdmVQcm92aWRlckRlcHJlY2F0aW9uTGluayhkZXByZWNhdGlvbkxpbmssIHRoaXMucHJvZHVjdFNlcnZpY2UudXJsUHJvdG9jb2wpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbW9kZWxzLmRlcHJlY2F0aW9uLmxpbmsudG9vbHRpcCcsIFwiVGhlIE9sbGFtYSBtb2RlbCBwcm92aWRlciBpcyBkZXByZWNhdGVkLiBQbGVhc2UgbWlncmF0ZSB0byB0aGUgb2ZmaWNpYWwgZXh0ZW5zaW9uLlwiKVxuXHRcdFx0fTtcblx0XHRcdHRlbXBsYXRlRGF0YS5kZXByZWNhdGlvbkxpbmtDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckdyb3VwRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNb2RlbE5hbWVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLnNldChlbnRyeS5sYWJlbCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlck1vZGVsRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTW9kZWxOYW1lQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBtb2RlbDogbW9kZWxFbnRyeSwgbW9kZWxOYW1lTWF0Y2hlcyB9ID0gZW50cnk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzSWNvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlRGF0YS5tb2RlbFN0YXR1c0ljb24uY2xhc3NOYW1lID0gJ21vZGVsLXN0YXR1cy1pY29uJztcblx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5zdGF0dXNJY29uKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubW9kZWxTdGF0dXNJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkobW9kZWxFbnRyeS5tZXRhZGF0YS5zdGF0dXNJY29uKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEubW9kZWxTdGF0dXNJY29uLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLm1vZGVsU3RhdHVzSWNvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5uYW1lTGFiZWwuc2V0KG1vZGVsRW50cnkubWV0YWRhdGEubmFtZSwgbW9kZWxOYW1lTWF0Y2hlcyk7XG5cblx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygnJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAqKiR7ZW50cnkubW9kZWwubWV0YWRhdGEubmFtZX0qKmApO1xuXHRcdGlmIChlbnRyeS5tb2RlbC5tZXRhZGF0YS5pZCAhPT0gZW50cnkubW9kZWwubWV0YWRhdGEudmVyc2lvbikge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCZuYnNwOzxzcGFuIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjojODA4MDgwMkI7XCI+Jm5ic3A7XyR7ZW50cnkubW9kZWwubWV0YWRhdGEuaWR9JiM2NDske2VudHJ5Lm1vZGVsLm1ldGFkYXRhLnZlcnNpb259XyZuYnNwOzwvc3Bhbj5gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCZuYnNwOzxzcGFuIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjojODA4MDgwMkI7XCI+Jm5ic3A7XyR7ZW50cnkubW9kZWwubWV0YWRhdGEuaWR9XyZuYnNwOzwvc3Bhbj5gKTtcblx0XHR9XG5cdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cblx0XHRpZiAoZW50cnkubW9kZWwubWV0YWRhdGEuc3RhdHVzSWNvbiAmJiBlbnRyeS5tb2RlbC5tZXRhZGF0YS50b29sdGlwKSB7XG5cdFx0XHRpZiAoZW50cnkubW9kZWwubWV0YWRhdGEuc3RhdHVzSWNvbikge1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke2VudHJ5Lm1vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24uaWR9KSZuYnNwO2ApO1xuXHRcdFx0fVxuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7ZW50cnkubW9kZWwubWV0YWRhdGEudG9vbHRpcH1gKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyQXRNb3VzZSh0ZW1wbGF0ZURhdGEuY29udGFpbmVyISwgKCkgPT4gKHtcblx0XHRcdGNvbnRlbnQ6IG1hcmtkb3duLFxuXHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRjb21wYWN0OiB0cnVlLFxuXHRcdFx0XHRza2lwRmFkZUluQW5pbWF0aW9uOiB0cnVlLFxuXHRcdFx0fVxuXHRcdH0pKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyU3RhdHVzRWxlbWVudChlbnRyeTogSVN0YXR1c0VudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNb2RlbE5hbWVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzSWNvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0ljb24uY2xhc3NOYW1lID0gJ3N0YXR1cy1pY29uJztcblx0XHRzd2l0Y2ggKGVudHJ5LnNldmVyaXR5KSB7XG5cdFx0XHRjYXNlIFNldmVyaXR5LkVycm9yOlxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZXJyb3Itc3RhdHVzJyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5lcnJvcikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU2V2ZXJpdHkuV2FybmluZzpcblx0XHRcdFx0dGVtcGxhdGVEYXRhLm5hbWVMYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3dhcm5pbmctc3RhdHVzJyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi53YXJuaW5nKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBTZXZlcml0eS5JbmZvOlxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW5mby1zdGF0dXMnKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0ljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmluZm8pKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5uYW1lTGFiZWwuc2V0KGVudHJ5Lm1lc3NhZ2UsIHVuZGVmaW5lZCwgZW50cnkubWVzc2FnZSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDb21iaW5lZENvc3RDb2x1bW5UZW1wbGF0ZURhdGEgZXh0ZW5kcyBJTW9kZWxUYWJsZUNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGlucHV0Q2VsbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG91dHB1dENlbGw6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBjYWNoZVJlYWRDZWxsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2FjaGVXcml0ZUNlbGw6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBDb21iaW5lZENvc3RDb2x1bW5SZW5kZXJlciBleHRlbmRzIE1vZGVsc1RhYmxlQ29sdW1uUmVuZGVyZXI8SUNvbWJpbmVkQ29zdENvbHVtblRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnY29tYmluZWRDb3N0JztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBDb21iaW5lZENvc3RDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQ29tYmluZWRDb3N0Q29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZ3JpZCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcubW9kZWwtY29zdC1ncmlkJykpO1xuXHRcdGNvbnN0IGlucHV0Q2VsbCA9IERPTS5hcHBlbmQoZ3JpZCwgJCgnc3Bhbi5tb2RlbC1jb3N0LWNlbGwnKSk7XG5cdFx0Y29uc3Qgb3V0cHV0Q2VsbCA9IERPTS5hcHBlbmQoZ3JpZCwgJCgnc3Bhbi5tb2RlbC1jb3N0LWNlbGwnKSk7XG5cdFx0Y29uc3QgY2FjaGVSZWFkQ2VsbCA9IERPTS5hcHBlbmQoZ3JpZCwgJCgnc3Bhbi5tb2RlbC1jb3N0LWNlbGwnKSk7XG5cdFx0Y29uc3QgY2FjaGVXcml0ZUNlbGwgPSBET00uYXBwZW5kKGdyaWQsICQoJ3NwYW4ubW9kZWwtY29zdC1jZWxsJykpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRpbnB1dENlbGwsXG5cdFx0XHRvdXRwdXRDZWxsLFxuXHRcdFx0Y2FjaGVSZWFkQ2VsbCxcblx0XHRcdGNhY2hlV3JpdGVDZWxsLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyRWxlbWVudChlbnRyeTogSVZpZXdNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDb21iaW5lZENvc3RDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuaW5wdXRDZWxsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLm91dHB1dENlbGwudGV4dENvbnRlbnQgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEuY2FjaGVSZWFkQ2VsbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5jYWNoZVdyaXRlQ2VsbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHN1cGVyLnJlbmRlckVsZW1lbnQoZW50cnksIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyR3JvdXBFbGVtZW50KF9lbGVtZW50OiBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnksIF9pbmRleDogbnVtYmVyLCBfdGVtcGxhdGVEYXRhOiBJQ29tYmluZWRDb3N0Q29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJWZW5kb3JFbGVtZW50KF9lbGVtZW50OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIF9pbmRleDogbnVtYmVyLCBfdGVtcGxhdGVEYXRhOiBJQ29tYmluZWRDb3N0Q29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJNb2RlbEVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNvbWJpbmVkQ29zdENvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgaW5wdXRDb3N0LCBvdXRwdXRDb3N0LCBjYWNoZUNvc3QsIGNhY2hlV3JpdGVDb3N0IH0gPSBlbnRyeS5tb2RlbC5tZXRhZGF0YTtcblx0XHRjb25zdCBoYXNDb3N0ID0gaW5wdXRDb3N0ICE9PSB1bmRlZmluZWQgfHwgb3V0cHV0Q29zdCAhPT0gdW5kZWZpbmVkIHx8IGNhY2hlQ29zdCAhPT0gdW5kZWZpbmVkIHx8IGNhY2hlV3JpdGVDb3N0ICE9PSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoaGFzQ29zdCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmlucHV0Q2VsbC50ZXh0Q29udGVudCA9IGlucHV0Q29zdCAhPT0gdW5kZWZpbmVkID8gbG9jYWxpemUoJ2Nvc3QuaW5wdXQnLCBcIkluOiB7MH1cIiwgaW5wdXRDb3N0KSA6ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLm91dHB1dENlbGwudGV4dENvbnRlbnQgPSBvdXRwdXRDb3N0ICE9PSB1bmRlZmluZWQgPyBsb2NhbGl6ZSgnY29zdC5vdXRwdXQnLCBcIk91dDogezB9XCIsIG91dHB1dENvc3QpIDogJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY2FjaGVSZWFkQ2VsbC50ZXh0Q29udGVudCA9IGNhY2hlQ29zdCAhPT0gdW5kZWZpbmVkID8gbG9jYWxpemUoJ2Nvc3QuY2FjaGVSZWFkJywgXCJDYWNoZSBSZWFkOiB7MH1cIiwgY2FjaGVDb3N0KSA6ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNhY2hlV3JpdGVDZWxsLnRleHRDb250ZW50ID0gY2FjaGVXcml0ZUNvc3QgIT09IHVuZGVmaW5lZCA/IGxvY2FsaXplKCdjb3N0LmNhY2hlV3JpdGUnLCBcIkNhY2hlIFdyaXRlOiB7MH1cIiwgY2FjaGVXcml0ZUNvc3QpIDogJyc7XG5cblx0XHRcdGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0aWYgKGlucHV0Q29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2goaW5wdXRDb3N0ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY29zdC5pbnB1dEhvdmVyLnNpbmd1bGFyJywgXCJJbnB1dDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zXCIsIGlucHV0Q29zdClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb3N0LmlucHV0SG92ZXIucGx1cmFsJywgXCJJbnB1dDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBpbnB1dENvc3QpKTtcblx0XHRcdH1cblx0XHRcdGlmIChvdXRwdXRDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFydHMucHVzaChvdXRwdXRDb3N0ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY29zdC5vdXRwdXRIb3Zlci5zaW5ndWxhcicsIFwiT3V0cHV0OiB7MH0gY3JlZGl0IHBlciAxTSB0b2tlbnNcIiwgb3V0cHV0Q29zdClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb3N0Lm91dHB1dEhvdmVyLnBsdXJhbCcsIFwiT3V0cHV0OiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zXCIsIG91dHB1dENvc3QpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjYWNoZUNvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGNhY2hlQ29zdCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Nvc3QuY2FjaGVIb3Zlci5zaW5ndWxhcicsIFwiQ2FjaGUgUmVhZDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zXCIsIGNhY2hlQ29zdClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb3N0LmNhY2hlSG92ZXIucGx1cmFsJywgXCJDYWNoZSBSZWFkOiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zXCIsIGNhY2hlQ29zdCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNhY2hlV3JpdGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFydHMucHVzaChjYWNoZVdyaXRlQ29zdCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Nvc3QuY2FjaGVXcml0ZUhvdmVyLnNpbmd1bGFyJywgXCJDYWNoZSBXcml0ZTogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zXCIsIGNhY2hlV3JpdGVDb3N0KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2Nvc3QuY2FjaGVXcml0ZUhvdmVyLnBsdXJhbCcsIFwiQ2FjaGUgV3JpdGU6IHswfSBjcmVkaXRzIHBlciAxTSB0b2tlbnNcIiwgY2FjaGVXcml0ZUNvc3QpKTtcblx0XHRcdH1cblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyQXRNb3VzZSh0ZW1wbGF0ZURhdGEuY29udGFpbmVyLCAoKSA9PiAoe1xuXHRcdFx0XHRjb250ZW50OiBwYXJ0cy5qb2luKCdcXG4nKSxcblx0XHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRcdGNvbXBhY3Q6IHRydWUsXG5cdFx0XHRcdFx0c2tpcEZhZGVJbkFuaW1hdGlvbjogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9KSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBGYWxsYmFjayBmb3Igbm9uLXRva2VuLWJhc2VkIGJpbGxpbmcgKHByZW1pdW0gcmVxdWVzdHMgdXNlcnMpXG5cdFx0XHRjb25zdCBwcmljaW5nVGV4dCA9IGVudHJ5Lm1vZGVsLm1ldGFkYXRhLnByaWNpbmc7XG5cdFx0XHRpZiAocHJpY2luZ1RleHQpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmlucHV0Q2VsbC50ZXh0Q29udGVudCA9IHByaWNpbmdUZXh0O1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlckF0TW91c2UodGVtcGxhdGVEYXRhLmNvbnRhaW5lciwgKCkgPT4gKHtcblx0XHRcdFx0XHRjb250ZW50OiBsb2NhbGl6ZSgncHJpY2luZy50b29sdGlwJywgXCJQcmljaW5nOiB7MH1cIiwgcHJpY2luZ1RleHQpLFxuXHRcdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRcdGNvbXBhY3Q6IHRydWUsXG5cdFx0XHRcdFx0XHRza2lwRmFkZUluQW5pbWF0aW9uOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSVRva2VuTGltaXRzQ29sdW1uVGVtcGxhdGVEYXRhIGV4dGVuZHMgSU1vZGVsVGFibGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSB0b2tlbkxpbWl0c0VsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBUb2tlbkxpbWl0c0NvbHVtblJlbmRlcmVyIGV4dGVuZHMgTW9kZWxzVGFibGVDb2x1bW5SZW5kZXJlcjxJVG9rZW5MaW1pdHNDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Rva2VuTGltaXRzJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBUb2tlbkxpbWl0c0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVRva2VuTGltaXRzQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdG9rZW5MaW1pdHNFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tb2RlbC10b2tlbi1saW1pdHMnKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHRva2VuTGltaXRzRWxlbWVudCxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckVsZW1lbnQoZW50cnk6IElWaWV3TW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVG9rZW5MaW1pdHNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRET00uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS50b2tlbkxpbWl0c0VsZW1lbnQpO1xuXHRcdHN1cGVyLnJlbmRlckVsZW1lbnQoZW50cnksIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyVmVuZG9yRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUb2tlbkxpbWl0c0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyR3JvdXBFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRva2VuTGltaXRzQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJNb2RlbEVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRva2VuTGltaXRzQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBtb2RlbDogbW9kZWxFbnRyeSB9ID0gZW50cnk7XG5cdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5tYXhJbnB1dFRva2VucyB8fCBtb2RlbEVudHJ5Lm1ldGFkYXRhLm1heE91dHB1dFRva2Vucykge1xuXHRcdFx0Y29uc3QgdG90YWxUb2tlbnMgPSAobW9kZWxFbnRyeS5tZXRhZGF0YS5tYXhJbnB1dFRva2VucyA/PyAwKSArIChtb2RlbEVudHJ5Lm1ldGFkYXRhLm1heE91dHB1dFRva2VucyA/PyAwKTtcblx0XHRcdGNvbnN0IHRva2VuRGl2ID0gRE9NLmFwcGVuZCh0ZW1wbGF0ZURhdGEudG9rZW5MaW1pdHNFbGVtZW50LCAkKCcudG9rZW4tbGltaXQtaXRlbScpKTtcblx0XHRcdGNvbnN0IHRva2VuVGV4dCA9IERPTS5hcHBlbmQodG9rZW5EaXYsICQoJ3NwYW4nKSk7XG5cdFx0XHR0b2tlblRleHQudGV4dENvbnRlbnQgPSBmb3JtYXRUb2tlbkNvdW50KHRvdGFsVG9rZW5zKTtcblxuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7bG9jYWxpemUoJ21vZGVscy5jb250ZXh0U2l6ZScsICdDb250ZXh0IFNpemUnKX06IGApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7Zm9ybWF0VG9rZW5Db3VudCh0b3RhbFRva2Vucyl9YCk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXJBdE1vdXNlKHRlbXBsYXRlRGF0YS5jb250YWluZXIsICgpID0+ICh7XG5cdFx0XHRjb250ZW50OiBtYXJrZG93bixcblx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0Y29tcGFjdDogdHJ1ZSxcblx0XHRcdFx0c2tpcEZhZGVJbkFuaW1hdGlvbjogdHJ1ZSxcblx0XHRcdH1cblx0XHR9KSkpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ2FwYWJpbGl0aWVzQ29sdW1uVGVtcGxhdGVEYXRhIGV4dGVuZHMgSU1vZGVsVGFibGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBtZXRhZGF0YVJvdzogSFRNTEVsZW1lbnQ7XG59XG5cbmNsYXNzIENhcGFiaWxpdGllc0NvbHVtblJlbmRlcmVyIGV4dGVuZHMgTW9kZWxzVGFibGVDb2x1bW5SZW5kZXJlcjxJQ2FwYWJpbGl0aWVzQ29sdW1uVGVtcGxhdGVEYXRhPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2NhcGFiaWxpdGllcyc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gQ2FwYWJpbGl0aWVzQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGlja0NhcGFiaWxpdHkgPSBuZXcgRW1pdHRlcjxzdHJpbmc+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tDYXBhYmlsaXR5ID0gdGhpcy5fb25EaWRDbGlja0NhcGFiaWxpdHkuZXZlbnQ7XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENsaWNrQ2FwYWJpbGl0eS5kaXNwb3NlKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUNhcGFiaWxpdGllc0NvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb2RlbC1jYXBhYmlsaXR5LWNvbHVtbicpO1xuXHRcdGNvbnN0IG1ldGFkYXRhUm93ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tb2RlbC1jYXBhYmlsaXRpZXMnKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdG1ldGFkYXRhUm93LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyRWxlbWVudChlbnRyeTogSVZpZXdNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDYXBhYmlsaXRpZXNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRET00uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS5tZXRhZGF0YVJvdyk7XG5cdFx0c3VwZXIucmVuZGVyRWxlbWVudChlbnRyeSwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJWZW5kb3JFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNhcGFiaWxpdGllc0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyR3JvdXBFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNhcGFiaWxpdGllc0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyTW9kZWxFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDYXBhYmlsaXRpZXNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCB7IG1vZGVsOiBtb2RlbEVudHJ5LCBjYXBhYmlsaXR5TWF0Y2hlcyB9ID0gZW50cnk7XG5cblx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXM/LnRvb2xDYWxsaW5nKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmNyZWF0ZUNhcGFiaWxpdHlCdXR0b24oXG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5tZXRhZGF0YVJvdyxcblx0XHRcdFx0Y2FwYWJpbGl0eU1hdGNoZXM/LmluY2x1ZGVzKCd0b29sQ2FsbGluZycpIHx8IGZhbHNlLFxuXHRcdFx0XHRsb2NhbGl6ZSgnbW9kZWxzLnRvb2xzJywgJ1Rvb2xzJyksXG5cdFx0XHRcdCd0b29scydcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbEVudHJ5Lm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udmlzaW9uKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmNyZWF0ZUNhcGFiaWxpdHlCdXR0b24oXG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5tZXRhZGF0YVJvdyxcblx0XHRcdFx0Y2FwYWJpbGl0eU1hdGNoZXM/LmluY2x1ZGVzKCd2aXNpb24nKSB8fCBmYWxzZSxcblx0XHRcdFx0bG9jYWxpemUoJ21vZGVscy52aXNpb24nLCAnVmlzaW9uJyksXG5cdFx0XHRcdCd2aXNpb24nXG5cdFx0XHQpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNhcGFiaWxpdHlCdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaXNBY3RpdmU6IGJvb2xlYW4sIGxhYmVsOiBzdHJpbmcsIGNhcGFiaWxpdHk6IHN0cmluZyk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBidXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vZGVsLWJhZGdlLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBidXR0b24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihidXR0b25Db250YWluZXIsIHsgc2Vjb25kYXJ5OiB0cnVlIH0pKTtcblx0XHRidXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb2RlbC1jYXBhYmlsaXR5Jyk7XG5cdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgaXNBY3RpdmUpO1xuXHRcdGJ1dHRvbi5sYWJlbCA9IGxhYmVsO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChidXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLl9vbkRpZENsaWNrQ2FwYWJpbGl0eS5maXJlKGNhcGFiaWxpdHkpKSk7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YSBleHRlbmRzIElNb2RlbFRhYmxlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBUb29sQmFyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQcm92aWRlckdyb3VwQWN0aW9ucyhcblx0dmlld01vZGVsOiBDaGF0TW9kZWxzVmlld01vZGVsLFxuXHR2ZW5kb3I6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yLFxuXHRncm91cE5hbWU6IHN0cmluZyxcblx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcbik6IElBY3Rpb25bXSB7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB2ZW5kb3IuY29uZmlndXJhdGlvbiBhcyBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZDtcblx0aWYgKCFjb25maWd1cmF0aW9uKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzO1xuXHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdGlkOiAnZ29Ub1NldHRpbmdzQWN0aW9uJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ21vZGVscy5nb1RvU2V0dGluZ3MnLCBcIk9wZW4gaW4gTGFuZ3VhZ2UgTW9kZWxzIChKU09OKVwiKSxcblx0XHRydW46ICgpID0+IGxhbmd1YWdlTW9kZWxzU2VydmljZS5vcGVuTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwU2V0dGluZ3ModmVuZG9yLnZlbmRvciwgZ3JvdXBOYW1lKVxuXHR9KSk7XG5cdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdGlkOiAncmVuYW1lR3JvdXBBY3Rpb24nLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzLnJlbmFtZUdyb3VwJywgJ1JlbmFtZSBHcm91cCcpLFxuXHRcdHJ1bjogKCkgPT4gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnJlbmFtZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCh2ZW5kb3IudmVuZG9yLCBncm91cE5hbWUpXG5cdH0pKTtcblx0aWYgKGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPy5hcGlLZXkpIHtcblx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICd1cGRhdGVBcGlLZXlBY3Rpb24nLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbHMudXBkYXRlQXBpS2V5JywgXCJVcGRhdGUgQVBJIEtleVwiKSxcblx0XHRcdHJ1bjogKCkgPT4gbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnVwZGF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cEFwaUtleSh2ZW5kb3IudmVuZG9yLCBncm91cE5hbWUpXG5cdFx0fSkpO1xuXHR9XG5cdGlmIChjb25maWd1cmF0aW9uUHJvcGVydGllcz8ubW9kZWxzPy5kZWZhdWx0U25pcHBldHM/LlswXSkge1xuXHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRpZDogJ2FkZE1vZGVsQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzLmFkZE1vZGVsJywgXCJBZGQgTW9kZWxcIiksXG5cdFx0XHRydW46ICgpID0+IGxhbmd1YWdlTW9kZWxzU2VydmljZS5hZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBNb2RlbCh2ZW5kb3IudmVuZG9yLCBncm91cE5hbWUpXG5cdFx0fSkpO1xuXHR9XG5cdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdGlkOiAnZGVsZXRlQWN0aW9uJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ21vZGVscy5kZWxldGVBY3Rpb24nLCAnRGVsZXRlJyksXG5cdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnRyYXNoKSxcblx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHR5cGU6ICdpbmZvJyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ21vZGVscy5kZWxldGVDb25maXJtYXRpb24nLCBcIldvdWxkIHlvdSBsaWtlIHRvIGRlbGV0ZSB7MH0/XCIsIGdyb3VwTmFtZSlcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGF3YWl0IGxhbmd1YWdlTW9kZWxzU2VydmljZS5yZW1vdmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9yLnZlbmRvciwgZ3JvdXBOYW1lKTtcblx0XHRcdHZpZXdNb2RlbC5yZWZyZXNoKCk7XG5cdFx0fVxuXHR9KSk7XG5cdHJldHVybiBhY3Rpb25zO1xufVxuXG5jbGFzcyBBY3Rpb25zQ29sdW1uUmVuZGVyZXIgZXh0ZW5kcyBNb2RlbHNUYWJsZUNvbHVtblJlbmRlcmVyPElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdhY3Rpb25zJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBBY3Rpb25zQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3TW9kZWw6IENoYXRNb2RlbHNWaWV3TW9kZWwsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb2RlbHMtYWN0aW9ucy1jb2x1bW4nKTtcblx0XHRjb25zdCBwYXJlbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFjdGlvbnMtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvb2xCYXIsXG5cdFx0XHRwYXJlbnQsXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdHtcblx0XHRcdFx0aWNvbjogdHJ1ZSxcblx0XHRcdFx0bGFiZWw6IGZhbHNlLFxuXHRcdFx0XHRtb3JlSWNvbjogQ29kaWNvbi5nZWFyLFxuXHRcdFx0XHRhbmNob3JBbGlnbm1lbnRQcm92aWRlcjogKCkgPT4gQW5jaG9yQWxpZ25tZW50LlJJR0hUXG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGFjdGlvbkJhcixcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckVsZW1lbnQoZW50cnk6IElWaWV3TW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuc2V0QWN0aW9ucyhbXSk7XG5cdFx0c3VwZXIucmVuZGVyRWxlbWVudChlbnRyeSwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJWZW5kb3JFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCB7IHZlbmRvckVudHJ5IH0gPSBlbnRyeTtcblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0aWYgKHZlbmRvckVudHJ5LnZlbmRvci5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2goLi4uY3JlYXRlUHJvdmlkZXJHcm91cEFjdGlvbnModGhpcy52aWV3TW9kZWwsIHZlbmRvckVudHJ5LnZlbmRvciwgdmVuZG9yRW50cnkuZ3JvdXAubmFtZSwgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHRoaXMuZGlhbG9nU2VydmljZSkpO1xuXHRcdH0gZWxzZSBpZiAodmVuZG9yRW50cnkudmVuZG9yLm1hbmFnZW1lbnRDb21tYW5kKSB7XG5cdFx0XHRwcmltYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdtYW5hZ2VWZW5kb3InLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21vZGVscy5tYW5hZ2VQcm92aWRlcicsICdNYW5hZ2UgezB9Li4uJywgdmVuZG9yRW50cnkuZ3JvdXAubmFtZSksXG5cdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nZWFyKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh2ZW5kb3JFbnRyeS52ZW5kb3IubWFuYWdlbWVudENvbW1hbmQhLCB2ZW5kb3JFbnRyeS52ZW5kb3IudmVuZG9yKTtcblx0XHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5yZWZyZXNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKHByaW1hcnlBY3Rpb25zLCBzZWNvbmRhcnlBY3Rpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckdyb3VwRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJNb2RlbEVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHQvLyBBdXRvIG1vZGVsIGNhbm5vdCBiZSBwaW5uZWRcblx0XHRpZiAoZW50cnkubW9kZWwubWV0YWRhdGEuaWQgIT09ICdhdXRvJykge1xuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZVBpbkFjdGlvbihlbnRyeS5tb2RlbC5pZGVudGlmaWVyKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlnQWN0aW9ucyA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldE1vZGVsQ29uZmlndXJhdGlvbkFjdGlvbnMoZW50cnkubW9kZWwuaWRlbnRpZmllcik7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9uczogSUFjdGlvbltdID0gWy4uLmNvbmZpZ0FjdGlvbnNdO1xuXG5cdFx0Ly8gT25seSBvZmZlciB0aGUgSlNPTi1iYXNlZCBcIkNvbmZpZ3VyZS4uLlwiIGVudHJ5IGZvciBub24tZGVmYXVsdCB2ZW5kb3JzIHRoYXQgYXJlXG5cdFx0Ly8gY29uZmlndXJlZCB2aWEgdGhlIGxhbmd1YWdlIG1vZGVscyBKU09OIGZpbGUuIFRoZSBkZWZhdWx0IHZlbmRvciAoQ29waWxvdCkgYW5kXG5cdFx0Ly8gdmVuZG9ycyB3aXRoIGEgYG1hbmFnZW1lbnRDb21tYW5kYCBhcmUgY29uZmlndXJlZCBlbHNld2hlcmUsIHNvIHRoaXMgZW50cnkgd291bGRcblx0XHQvLyBkbyBub3RoaW5nIHVzZWZ1bCBmb3IgdGhlaXIgbW9kZWxzLlxuXHRcdGNvbnN0IHZlbmRvciA9IGVudHJ5Lm1vZGVsLnByb3ZpZGVyLnZlbmRvcjtcblx0XHRpZiAoIXZlbmRvci5pc0RlZmF1bHQgJiYgIXZlbmRvci5tYW5hZ2VtZW50Q29tbWFuZCAmJiAoY29uZmlnQWN0aW9ucy5sZW5ndGggPiAwIHx8IGVudHJ5Lm1vZGVsLm1ldGFkYXRhLmNvbmZpZ3VyYXRpb25TY2hlbWEpKSB7XG5cdFx0XHRzZWNvbmRhcnlBY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogJ2NvbmZpZ3VyZU1vZGVsJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbHMuY29uZmlndXJlTW9kZWwnLCAnQ29uZmlndXJlLi4uJyksXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuY29uZmlndXJlTW9kZWwoZW50cnkubW9kZWwuaWRlbnRpZmllcilcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMocHJpbWFyeUFjdGlvbnMsIHNlY29uZGFyeUFjdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQaW5BY3Rpb24obW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiBJQWN0aW9uIHtcblx0XHRjb25zdCBpc1Bpbm5lZCA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzTW9kZWxQaW5uZWQobW9kZWxJZGVudGlmaWVyKTtcblx0XHRyZXR1cm4gdG9BY3Rpb24oe1xuXHRcdFx0aWQ6IGlzUGlubmVkID8gYHVucGluLiR7bW9kZWxJZGVudGlmaWVyfWAgOiBgcGluLiR7bW9kZWxJZGVudGlmaWVyfWAsXG5cdFx0XHRsYWJlbDogaXNQaW5uZWRcblx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLnVucGluTW9kZWwnLCBcIlVucGluIE1vZGVsXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5waW5Nb2RlbCcsIFwiUGluIE1vZGVsXCIpLFxuXHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpc1Bpbm5lZCA/IENvZGljb24ucGlubmVkIDogQ29kaWNvbi5waW4pLFxuXHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdGlmIChpc1Bpbm5lZCkge1xuXHRcdFx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnVucGluTW9kZWwobW9kZWxJZGVudGlmaWVyKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5waW5Nb2RlbChtb2RlbElkZW50aWZpZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMudmlld01vZGVsLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVByb3ZpZGVyQ29sdW1uVGVtcGxhdGVEYXRhIGV4dGVuZHMgSU1vZGVsVGFibGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBwcm92aWRlckVsZW1lbnQ6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBQcm92aWRlckNvbHVtblJlbmRlcmVyIGV4dGVuZHMgTW9kZWxzVGFibGVDb2x1bW5SZW5kZXJlcjxJUHJvdmlkZXJDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Byb3ZpZGVyJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBQcm92aWRlckNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUHJvdmlkZXJDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm92aWRlckVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vZGVsLXByb3ZpZGVyJykpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRwcm92aWRlckVsZW1lbnQsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJWZW5kb3JFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb3ZpZGVyQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnByb3ZpZGVyRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyR3JvdXBFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb3ZpZGVyQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnByb3ZpZGVyRWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyTW9kZWxFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElQcm92aWRlckNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5wcm92aWRlckVsZW1lbnQudGV4dENvbnRlbnQgPSBlbnRyeS5tb2RlbC5wcm92aWRlci52ZW5kb3IuZGlzcGxheU5hbWU7XG5cdH1cbn1cblxuXG5cblxuXG5leHBvcnQgY2xhc3MgQ2hhdE1vZGVsc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIE5VTV9JTlNUQU5DRVM6IG51bWJlciA9IDA7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtQ291bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1Db3VudCA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmV2ZW50O1xuXG5cdHByaXZhdGUgc2VhcmNoV2lkZ2V0ITogU3VnZ2VzdEVuYWJsZWRJbnB1dDtcblx0cHJpdmF0ZSBzZWFyY2hBY3Rpb25zQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGFibGUhOiBXb3JrYmVuY2hUYWJsZTxJVmlld01vZGVsRW50cnk+O1xuXHRwcml2YXRlIHRhYmxlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGFibGVWaWV3cG9ydCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRhYmxlSW5uZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0YWJsZVNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRhYmxlTWluV2lkdGg6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgYWRkQnV0dG9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYWRkQnV0dG9uITogQnV0dG9uO1xuXHRwcml2YXRlIGRyb3Bkb3duQWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdHByaXZhdGUgdmlld01vZGVsOiBDaGF0TW9kZWxzVmlld01vZGVsO1xuXHRwcml2YXRlIGRlbGF5ZWRGaWx0ZXJpbmc6IERlbGF5ZXI8dm9pZD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hGb2N1c0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGFibGVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JQcm9ncmVzc1NlcnZpY2U6IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnNlYXJjaEZvY3VzQ29udGV4dEtleSA9IENPTlRFWFRfTU9ERUxTX1NFQVJDSF9GT0NVUy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5kZWxheWVkRmlsdGVyaW5nID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMjAwKSk7XG5cdFx0dGhpcy52aWV3TW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbHNWaWV3TW9kZWwpKTtcblx0XHR0aGlzLmVsZW1lbnQgPSBET00uJCgnLm1vZGVscy13aWRnZXQnKTtcblx0XHR0aGlzLmNyZWF0ZSh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0Y29uc3QgbG9hZGluZ1Byb21pc2UgPSB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbigoKSA9PiB0aGlzLnZpZXdNb2RlbC5yZWZyZXNoKCkpO1xuXHRcdHRoaXMuZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLnNob3dXaGlsZShsb2FkaW5nUHJvbWlzZSwgMzAwKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZWFyY2hBbmRCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vZGVscy1zZWFyY2gtYW5kLWJ1dHRvbi1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdTZWFyY2guRnVsbFRleHRTZWFyY2hQbGFjZWhvbGRlcicsIFwiVHlwZSB0byBzZWFyY2guLi5cIik7XG5cdFx0Y29uc3Qgc2VhcmNoQ29udGFpbmVyID0gRE9NLmFwcGVuZChzZWFyY2hBbmRCdXR0b25Db250YWluZXIsICQoJy5tb2RlbHMtc2VhcmNoLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRTdWdnZXN0RW5hYmxlZElucHV0LFxuXHRcdFx0J2NoYXRNb2RlbHNXaWRnZXQuc2VhcmNoYm94Jyxcblx0XHRcdHNlYXJjaENvbnRhaW5lcixcblx0XHRcdHtcblx0XHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnQCcsICc6J10sXG5cdFx0XHRcdHByb3ZpZGVSZXN1bHRzOiAocXVlcnk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyU3VnZ2VzdGlvbnMgPSB0aGlzLnZpZXdNb2RlbC5nZXRWZW5kb3JzKCkubWFwKHYgPT4gYEBwcm92aWRlcjpcIiR7di5kaXNwbGF5TmFtZX1cImApO1xuXHRcdFx0XHRcdGNvbnN0IGFsbFN1Z2dlc3Rpb25zID0gW1xuXHRcdFx0XHRcdFx0Li4ucHJvdmlkZXJTdWdnZXN0aW9ucyxcblx0XHRcdFx0XHRcdC4uLlNFQVJDSF9TVUdHRVNUSU9OUy5DQVBBQklMSVRJRVMsXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0XHRpZiAoIXF1ZXJ5LnRyaW0oKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFsbFN1Z2dlc3Rpb25zO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBxdWVyeVBhcnRzID0gcXVlcnkuc3BsaXQoL1xccy9nKTtcblx0XHRcdFx0XHRjb25zdCBsYXN0UGFydCA9IHF1ZXJ5UGFydHNbcXVlcnlQYXJ0cy5sZW5ndGggLSAxXTtcblx0XHRcdFx0XHRpZiAobGFzdFBhcnQuc3RhcnRzV2l0aCgnQHByb3ZpZGVyOicpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcHJvdmlkZXJTdWdnZXN0aW9ucztcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGxhc3RQYXJ0LnN0YXJ0c1dpdGgoJ0BjYXBhYmlsaXR5OicpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gU0VBUkNIX1NVR0dFU1RJT05TLkNBUEFCSUxJVElFUztcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGxhc3RQYXJ0LnN0YXJ0c1dpdGgoJ0AnKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGFsbFN1Z2dlc3Rpb25zO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRwbGFjZWhvbGRlcixcblx0XHRcdGBjaGF0TW9kZWxzV2lkZ2V0OnNlYXJjaGlucHV0OiR7Q2hhdE1vZGVsc1dpZGdldC5OVU1fSU5TVEFOQ0VTKyt9YCxcblx0XHRcdHtcblx0XHRcdFx0cGxhY2Vob2xkZXJUZXh0OiBwbGFjZWhvbGRlcixcblx0XHRcdFx0c3R5bGVPdmVycmlkZXM6IHtcblx0XHRcdFx0XHRpbnB1dEJvcmRlcjogc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXJcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9jdXNDb250ZXh0S2V5OiB0aGlzLnNlYXJjaEZvY3VzQ29udGV4dEtleSxcblx0XHRcdH0sXG5cdFx0KSk7XG5cblx0XHRjb25zdCBmaWx0ZXJBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTW9kZWxzRmlsdGVyQWN0aW9uKCkpO1xuXHRcdGNvbnN0IGNsZWFyU2VhcmNoQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihcblx0XHRcdCd3b3JrYmVuY2gubW9kZWxzLmNsZWFyU2VhcmNoJyxcblx0XHRcdGxvY2FsaXplKCdjbGVhclNlYXJjaCcsIFwiQ2xlYXIgU2VhcmNoXCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHByZWZlcmVuY2VzQ2xlYXJJbnB1dEljb24pLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQoKSA9PiB0aGlzLmNsZWFyU2VhcmNoKClcblx0XHQpKTtcblx0XHRjb25zdCBjb2xsYXBzZUFsbEFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oXG5cdFx0XHQnd29ya2JlbmNoLm1vZGVscy5jb2xsYXBzZUFsbCcsXG5cdFx0XHRsb2NhbGl6ZSgnY29sbGFwc2VBbGwnLCBcIkNvbGxhcHNlIEFsbFwiKSxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNvbGxhcHNlQWxsKSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5jb2xsYXBzZUFsbCgpO1xuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdGNvbGxhcHNlQWxsQWN0aW9uLmVuYWJsZWQgPSB0aGlzLnZpZXdNb2RlbC52aWV3TW9kZWxFbnRyaWVzLnNvbWUoZSA9PiBpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KGUpIHx8IGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld01vZGVsLm9uRGlkQ2hhbmdlKCgpID0+IGNvbGxhcHNlQWxsQWN0aW9uLmVuYWJsZWQgPSB0aGlzLnZpZXdNb2RlbC52aWV3TW9kZWxFbnRyaWVzLnNvbWUoZSA9PiBpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGUpIHx8IGlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkoZSkpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5vbklucHV0RGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNsZWFyU2VhcmNoQWN0aW9uLmVuYWJsZWQgPSAhIXRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCk7XG5cdFx0XHR0aGlzLmZpbHRlck1vZGVscygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2VhcmNoQWN0aW9uc0NvbnRhaW5lciA9IERPTS5hcHBlbmQoc2VhcmNoQ29udGFpbmVyLCAkKCcubW9kZWxzLXNlYXJjaC1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBbY2xlYXJTZWFyY2hBY3Rpb24sIGNvbGxhcHNlQWxsQWN0aW9uLCBmaWx0ZXJBY3Rpb25dO1xuXHRcdGNvbnN0IHRvb2xCYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9vbEJhcih0aGlzLnNlYXJjaEFjdGlvbnNDb250YWluZXIsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IGZpbHRlckFjdGlvbi5pZCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGVsc1NlYXJjaEZpbHRlckRyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMsIHtcblx0XHRcdFx0XHRcdGdldFZhbHVlOiAoKSA9PiB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRcdFx0c2V0VmFsdWU6IChzZWFyY2hWYWx1ZSkgPT4gdGhpcy5zZWFyY2goc2VhcmNoVmFsdWUpXG5cdFx0XHRcdFx0fSwgdGhpcy52aWV3TW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0S2V5QmluZGluZzogKCkgPT4gdW5kZWZpbmVkXG5cdFx0fSkpO1xuXHRcdHRvb2xCYXIuc2V0QWN0aW9ucyhhY3Rpb25zKTtcblxuXHRcdC8vIEFkZCBwYWRkaW5nIHRvIGlucHV0IGJveCBmb3IgdG9vbGJhclxuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0V2lkZ2V0LmdldENvbnRhaW5lckRvbU5vZGUoKS5zdHlsZS5wYWRkaW5nUmlnaHQgPSBgJHtET00uZ2V0VG90YWxXaWR0aCh0aGlzLnNlYXJjaEFjdGlvbnNDb250YWluZXIpICsgMTJ9cHhgO1xuXG5cdFx0dGhpcy5hZGRCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKHNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciwgJCgnLnNlY3Rpb24tdGl0bGUtYWN0aW9ucycpKTtcblx0XHRjb25zdCBidXR0b25PcHRpb25zOiBJQnV0dG9uT3B0aW9ucyA9IHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0fTtcblxuXHRcdHRoaXMuYWRkQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmFkZEJ1dHRvbkNvbnRhaW5lciwgYnV0dG9uT3B0aW9ucykpO1xuXHRcdHRoaXMuYWRkQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmFkZC5pZH0pICR7bG9jYWxpemUoJ21vZGVscy5lbmFibGVNb2RlbFByb3ZpZGVyJywgJ0FkZCBNb2RlbHMnKX1gO1xuXHRcdHRoaXMuYWRkQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9kZWxzLWFkZC1tb2RlbC1idXR0b24nKTtcblx0XHR0aGlzLnVwZGF0ZUFkZE1vZGVsc0J1dHRvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWRkQnV0dG9uLm9uRGlkQ2xpY2soKGUpID0+IHtcblx0XHRcdGlmICh0aGlzLmRyb3Bkb3duQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLmFkZEJ1dHRvbi5lbGVtZW50LFxuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZHJvcGRvd25BY3Rpb25zLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUaGUgbWFya2V0cGxhY2UgYnV0dG9uIGlzIGhpZGRlbiBpbiB0aGUgQWdlbnRzIHdpbmRvdyB3aGVyZSBpbnN0YWxsaW5nXG5cdFx0Ly8gbW9kZWwgcHJvdmlkZXIgZXh0ZW5zaW9ucyBpcyBub3Qgc3VwcG9ydGVkLlxuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0Y29uc3QgYnJvd3NlTWFya2V0cGxhY2VCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuYWRkQnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHRcdC4uLmJ1dHRvbk9wdGlvbnMsXG5cdFx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdH0pKTtcblx0XHRcdGJyb3dzZU1hcmtldHBsYWNlQnV0dG9uLmxhYmVsID0gYCQoJHtDb2RpY29uLmV4dGVuc2lvbnMuaWR9KSAke2xvY2FsaXplKCdtb2RlbHMuaW5zdGFsbFByb3ZpZGVyRXh0ZW5zaW9ucycsIFwiSW5zdGFsbCBNb2RlbCBQcm92aWRlcnNcIil9YDtcblx0XHRcdGJyb3dzZU1hcmtldHBsYWNlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9kZWxzLWJyb3dzZS1tYXJrZXRwbGFjZS1idXR0b24nKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGJyb3dzZU1hcmtldHBsYWNlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5vcGVuTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRXh0ZW5zaW9uc1NlYXJjaCgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGFibGUgY29udGFpbmVyXG5cdFx0dGhpcy50YWJsZUNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcubW9kZWxzLXRhYmxlLWNvbnRhaW5lcicpKTtcblxuXHRcdC8vIENyZWF0ZSB0YWJsZVxuXHRcdHRoaXMuY3JlYXRlVGFibGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdNb2RlbC5vbkRpZENoYW5nZUdyb3VwaW5nKCgpID0+IHRoaXMuY3JlYXRlVGFibGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVudGl0bGVtZW50KCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQWRkTW9kZWxzQnV0dG9uKCk7XG5cdFx0XHR0aGlzLmNyZWF0ZVRhYmxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVVzYWdlQmFzZWRCaWxsaW5nKCgpID0+IHRoaXMuY3JlYXRlVGFibGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbFZlbmRvcnMoKCkgPT4gdGhpcy51cGRhdGVBZGRNb2RlbHNCdXR0b24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlUGlubmVkTW9kZWxzKCgpID0+IHRoaXMudmlld01vZGVsLnJlZnJlc2goKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUobmV3IFNldChbJ2dpdGh1Yi5jb3BpbG90LmNsaWVudEJ5b2tFbmFibGVkJ10pKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFkZE1vZGVsc0J1dHRvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVGFibGUoKTogdm9pZCB7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLnRhYmxlQ29udGFpbmVyKTtcblxuXHRcdHRoaXMudGFibGVWaWV3cG9ydCA9ICQoJy5tb2RlbHMtdGFibGUtdmlld3BvcnQnKTtcblx0XHR0aGlzLnRhYmxlSW5uZXIgPSBET00uYXBwZW5kKHRoaXMudGFibGVWaWV3cG9ydCwgJCgnLm1vZGVscy10YWJsZS1pbm5lcicpKTtcblx0XHR0aGlzLnRhYmxlU2Nyb2xsYWJsZSA9IHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQobmV3IERvbVNjcm9sbGFibGVFbGVtZW50KHRoaXMudGFibGVWaWV3cG9ydCwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0XHRzY3JvbGxZVG9YOiB0cnVlLFxuXHRcdH0pKTtcblx0XHR0aGlzLnRhYmxlQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMudGFibGVTY3JvbGxhYmxlLmdldERvbU5vZGUoKSk7XG5cblx0XHRjb25zdCBndXR0ZXJDb2x1bW5SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR3V0dGVyQ29sdW1uUmVuZGVyZXIsIHRoaXMudmlld01vZGVsKTtcblx0XHRjb25zdCBtb2RlbE5hbWVDb2x1bW5SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZWxOYW1lQ29sdW1uUmVuZGVyZXIpO1xuXHRcdGNvbnN0IGNvbWJpbmVkQ29zdENvbHVtblJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21iaW5lZENvc3RDb2x1bW5SZW5kZXJlcik7XG5cdFx0Y29uc3QgdG9rZW5MaW1pdHNDb2x1bW5SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9rZW5MaW1pdHNDb2x1bW5SZW5kZXJlcik7XG5cdFx0Y29uc3QgY2FwYWJpbGl0aWVzQ29sdW1uUmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENhcGFiaWxpdGllc0NvbHVtblJlbmRlcmVyKTtcblx0XHRjb25zdCBhY3Rpb25zQ29sdW1uUmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFjdGlvbnNDb2x1bW5SZW5kZXJlciwgdGhpcy52aWV3TW9kZWwpO1xuXHRcdGNvbnN0IHByb3ZpZGVyQ29sdW1uUmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb3ZpZGVyQ29sdW1uUmVuZGVyZXIpO1xuXG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZChjYXBhYmlsaXRpZXNDb2x1bW5SZW5kZXJlcik7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZChjYXBhYmlsaXRpZXNDb2x1bW5SZW5kZXJlci5vbkRpZENsaWNrQ2FwYWJpbGl0eShjYXBhYmlsaXR5ID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRRdWVyeSA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCk7XG5cdFx0XHRjb25zdCBxdWVyeSA9IGBAY2FwYWJpbGl0eToke2NhcGFiaWxpdHl9YDtcblx0XHRcdGNvbnN0IG5ld1F1ZXJ5ID0gdG9nZ2xlRmlsdGVyKGN1cnJlbnRRdWVyeSwgeyBxdWVyeSB9KTtcblx0XHRcdHRoaXMuc2VhcmNoKG5ld1F1ZXJ5KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjb2x1bW5zID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJycsXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHR3ZWlnaHQ6IDAuMDUsXG5cdFx0XHRcdG1pbmltdW1XaWR0aDogNjQsXG5cdFx0XHRcdG1heGltdW1XaWR0aDogNjQsXG5cdFx0XHRcdHRlbXBsYXRlSWQ6IEd1dHRlckNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRwcm9qZWN0KHJvdzogSVZpZXdNb2RlbEVudHJ5KTogSVZpZXdNb2RlbEVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbE5hbWUnLCAnTmFtZScpLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0d2VpZ2h0OiAwLjM1LFxuXHRcdFx0XHRtaW5pbXVtV2lkdGg6IDIwMCxcblx0XHRcdFx0dGVtcGxhdGVJZDogTW9kZWxOYW1lQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdHByb2plY3Qocm93OiBJVmlld01vZGVsRW50cnkpOiBJVmlld01vZGVsRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGNvbnN0IGlzVUJCID0gdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcy51c2FnZUJhc2VkQmlsbGluZyA9PT0gdHJ1ZTtcblx0XHRjb2x1bW5zLnB1c2goXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndG9rZW5MaW1pdHMnLCAnQ29udGV4dCBTaXplJyksXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHR3ZWlnaHQ6IDAuMSxcblx0XHRcdFx0bWluaW11bVdpZHRoOiAxNDAsXG5cdFx0XHRcdHRlbXBsYXRlSWQ6IFRva2VuTGltaXRzQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdHByb2plY3Qocm93OiBJVmlld01vZGVsRW50cnkpOiBJVmlld01vZGVsRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NhcGFiaWxpdGllcycsICdDYXBhYmlsaXRpZXMnKSxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdHdlaWdodDogMC4xNSxcblx0XHRcdFx0bWluaW11bVdpZHRoOiAxODAsXG5cdFx0XHRcdHRlbXBsYXRlSWQ6IENhcGFiaWxpdGllc0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRwcm9qZWN0KHJvdzogSVZpZXdNb2RlbEVudHJ5KTogSVZpZXdNb2RlbEVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGlzVUJCID8gbG9jYWxpemUoJ2Nvc3QnLCAnQ29zdCAoQ3JlZGl0cyBwZXIgMU0gVG9rZW5zKScpIDogbG9jYWxpemUoJ3ByaWNpbmcnLCAnUHJpY2luZycpLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0d2VpZ2h0OiBpc1VCQiA/IDAuMjQgOiAwLjE1LFxuXHRcdFx0XHRtaW5pbXVtV2lkdGg6IGlzVUJCID8gMjQwIDogMjAwLFxuXHRcdFx0XHR0ZW1wbGF0ZUlkOiBDb21iaW5lZENvc3RDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0cHJvamVjdChyb3c6IElWaWV3TW9kZWxFbnRyeSk6IElWaWV3TW9kZWxFbnRyeSB7IHJldHVybiByb3c7IH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdHdlaWdodDogMC4wNSxcblx0XHRcdFx0bWluaW11bVdpZHRoOiA2NCxcblx0XHRcdFx0bWF4aW11bVdpZHRoOiA2NCxcblx0XHRcdFx0dGVtcGxhdGVJZDogQWN0aW9uc0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRwcm9qZWN0KHJvdzogSVZpZXdNb2RlbEVudHJ5KTogSVZpZXdNb2RlbEVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR0aGlzLnRhYmxlTWluV2lkdGggPSBjb2x1bW5zLnJlZHVjZSgoc3VtLCBjKSA9PiBzdW0gKyBjLm1pbmltdW1XaWR0aCwgMCk7XG5cdFx0dGhpcy50YWJsZUlubmVyLnN0eWxlLm1pbldpZHRoID0gYCR7dGhpcy50YWJsZU1pbldpZHRofXB4YDtcblxuXHRcdHRoaXMudGFibGUgPSB0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hUYWJsZSxcblx0XHRcdCdNb2RlbHNXaWRnZXQnLFxuXHRcdFx0dGhpcy50YWJsZUlubmVyLFxuXHRcdFx0bmV3IERlbGVnYXRlKCksXG5cdFx0XHRjb2x1bW5zLFxuXHRcdFx0W1xuXHRcdFx0XHRndXR0ZXJDb2x1bW5SZW5kZXJlcixcblx0XHRcdFx0bW9kZWxOYW1lQ29sdW1uUmVuZGVyZXIsXG5cdFx0XHRcdGNvbWJpbmVkQ29zdENvbHVtblJlbmRlcmVyLFxuXHRcdFx0XHR0b2tlbkxpbWl0c0NvbHVtblJlbmRlcmVyLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXNDb2x1bW5SZW5kZXJlcixcblx0XHRcdFx0YWN0aW9uc0NvbHVtblJlbmRlcmVyLFxuXHRcdFx0XHRwcm92aWRlckNvbHVtblJlbmRlcmVyXG5cdFx0XHRdLFxuXHRcdFx0e1xuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7IGdldElkOiAoZTogSVZpZXdNb2RlbEVudHJ5KSA9PiBlLmlkIH0sXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChlOiBJVmlld01vZGVsRW50cnkpID0+IHtcblx0XHRcdFx0XHRcdGlmIChpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlLmhpZGRlblxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3ZlbmRvci5oaWRkZW4uYXJpYUxhYmVsJywgJ3swfSBNb2RlbHMgKGhpZGRlbiknLCBlLnZlbmRvckVudHJ5Lmdyb3VwLm5hbWUpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgndmVuZG9yLmFyaWFMYWJlbCcsICd7MH0gTW9kZWxzJywgZS52ZW5kb3JFbnRyeS5ncm91cC5uYW1lKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZS5pZCA9PT0gJ3Zpc2libGUnID8gbG9jYWxpemUoJ3Zpc2libGUuYXJpYUxhYmVsJywgJ1Zpc2libGUgTW9kZWxzJykgOiBsb2NhbGl6ZSgnaGlkZGVuLmFyaWFMYWJlbCcsICdIaWRkZW4gTW9kZWxzJyk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzU3RhdHVzRW50cnkoZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzdGF0dXMuYXJpYUxhYmVsJywgJ1N0YXR1czogezB9JywgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGFyaWFMYWJlbHMgPSBbXTtcblx0XHRcdFx0XHRcdGFyaWFMYWJlbHMucHVzaChlLm1vZGVsLmhpZGRlblxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbC5uYW1lLmhpZGRlbicsICd7MH0gZnJvbSB7MX0gKGhpZGRlbiknLCBlLm1vZGVsLm1ldGFkYXRhLm5hbWUsIGUubW9kZWwucHJvdmlkZXIudmVuZG9yLmRpc3BsYXlOYW1lKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbC5uYW1lJywgJ3swfSBmcm9tIHsxfScsIGUubW9kZWwubWV0YWRhdGEubmFtZSwgZS5tb2RlbC5wcm92aWRlci52ZW5kb3IuZGlzcGxheU5hbWUpKTtcblx0XHRcdFx0XHRcdGlmIChlLm1vZGVsLm1ldGFkYXRhLm1heElucHV0VG9rZW5zIHx8IGUubW9kZWwubWV0YWRhdGEubWF4T3V0cHV0VG9rZW5zKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRvdGFsVG9rZW5zID0gKGUubW9kZWwubWV0YWRhdGEubWF4SW5wdXRUb2tlbnMgPz8gMCkgKyAoZS5tb2RlbC5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMgPz8gMCk7XG5cdFx0XHRcdFx0XHRcdGFyaWFMYWJlbHMucHVzaChsb2NhbGl6ZSgnbW9kZWwuY29udGV4dFNpemUudG90YWxUb2tlbnMnLCAnQ29udGV4dCBzaXplOiB7MH0gdG9rZW5zJywgZm9ybWF0VG9rZW5Db3VudCh0b3RhbFRva2VucykpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlLm1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcykge1xuXHRcdFx0XHRcdFx0XHRhcmlhTGFiZWxzLnB1c2gobG9jYWxpemUoJ21vZGVsLmNhcGFiaWxpdGllcycsICdDYXBhYmlsaXRpZXM6IHswfScsIE9iamVjdC5rZXlzKGUubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzKS5qb2luKCcsICcpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBwcmljaW5nVGV4dCA9IGUubW9kZWwubWV0YWRhdGEucHJpY2luZyA/PyAnLSc7XG5cdFx0XHRcdFx0XHRpZiAocHJpY2luZ1RleHQgIT09ICctJykge1xuXHRcdFx0XHRcdFx0XHRhcmlhTGFiZWxzLnB1c2gobG9jYWxpemUoJ3ByaWNpbmcuYXJpYUxhYmVsJywgXCJQcmljaW5nOiB7MH1cIiwgcHJpY2luZ1RleHQpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlLm1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGFyaWFMYWJlbHMucHVzaChlLm1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2lucHV0Q29zdC5hcmlhTGFiZWwuc2luZ3VsYXInLCBcIklucHV0IGNvc3Q6IHswfSBjcmVkaXQgcGVyIDFNIHRva2Vuc1wiLCBlLm1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdClcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdpbnB1dENvc3QuYXJpYUxhYmVsLnBsdXJhbCcsIFwiSW5wdXQgY29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBlLm1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGUubW9kZWwubWV0YWRhdGEuY2FjaGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0YXJpYUxhYmVscy5wdXNoKGUubW9kZWwubWV0YWRhdGEuY2FjaGVDb3N0ID09PSAxXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2FjaGVDb3N0LmFyaWFMYWJlbC5zaW5ndWxhcicsIFwiQ2FjaGUgcmVhZCBjb3N0OiB7MH0gY3JlZGl0IHBlciAxTSB0b2tlbnNcIiwgZS5tb2RlbC5tZXRhZGF0YS5jYWNoZUNvc3QpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2FjaGVDb3N0LmFyaWFMYWJlbC5wbHVyYWwnLCBcIkNhY2hlIHJlYWQgY29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBlLm1vZGVsLm1ldGFkYXRhLmNhY2hlQ29zdCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGUubW9kZWwubWV0YWRhdGEuY2FjaGVXcml0ZUNvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRhcmlhTGFiZWxzLnB1c2goZS5tb2RlbC5tZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NhY2hlV3JpdGVDb3N0LmFyaWFMYWJlbC5zaW5ndWxhcicsIFwiQ2FjaGUgd3JpdGUgY29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zXCIsIGUubW9kZWwubWV0YWRhdGEuY2FjaGVXcml0ZUNvc3QpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2FjaGVXcml0ZUNvc3QuYXJpYUxhYmVsLnBsdXJhbCcsIFwiQ2FjaGUgd3JpdGUgY29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBlLm1vZGVsLm1ldGFkYXRhLmNhY2hlV3JpdGVDb3N0KSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZS5tb2RlbC5tZXRhZGF0YS5vdXRwdXRDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0YXJpYUxhYmVscy5wdXNoKGUubW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ291dHB1dENvc3QuYXJpYUxhYmVsLnNpbmd1bGFyJywgXCJPdXRwdXQgY29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zXCIsIGUubW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdClcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdvdXRwdXRDb3N0LmFyaWFMYWJlbC5wbHVyYWwnLCBcIk91dHB1dCBjb3N0OiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zXCIsIGUubW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGFyaWFMYWJlbHMuam9pbignLiAnKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ21vZGVsc1RhYmxlLmFyaWFMYWJlbCcsICdMYW5ndWFnZSBNb2RlbHMnKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCkpIGFzIFdvcmtiZW5jaFRhYmxlPElWaWV3TW9kZWxFbnRyeT47XG5cblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudGFibGUub25Db250ZXh0TWVudShlID0+IHtcblx0XHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50YWJsZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IHNlbGVjdGVkRW50cmllcyA9IHNlbGVjdGlvbi5ldmVyeShpID0+IGkgIT09IGUuaW5kZXgpID8gW2UuZWxlbWVudF0gOiBzZWxlY3Rpb24ubWFwKGkgPT4gdGhpcy52aWV3TW9kZWwudmlld01vZGVsRW50cmllc1tpXSkuZmlsdGVyKGUgPT4gISFlKTtcblxuXHRcdFx0Ly8gR2V0IG1vZGVsIGVudHJpZXMgZnJvbSBzZWxlY3Rpb24gKGZpbHRlciBvdXQgdmVuZG9yL2dyb3VwL3N0YXR1cyBlbnRyaWVzKVxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbEVudHJpZXMgPSBzZWxlY3RlZEVudHJpZXMuZmlsdGVyKChlbnRyeSk6IGVudHJ5IGlzIElMYW5ndWFnZU1vZGVsRW50cnkgPT5cblx0XHRcdFx0IWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZW50cnkpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KGVudHJ5KSAmJiAhaXNTdGF0dXNFbnRyeShlbnRyeSlcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0bGV0IGNvbmZpZ3VyZUdyb3VwOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY29uZmlndXJlVmVuZG9yOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvciB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKHNlbGVjdGVkTW9kZWxFbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBQaW4vdW5waW4gYWN0aW9uIFx1MjAxNCBzaW5nbGUgYWN0aW9uIGZvciBhbGwgc2VsZWN0ZWQgbW9kZWxzXG5cdFx0XHRcdGNvbnN0IHBpbm5hYmxlRW50cmllcyA9IHNlbGVjdGVkTW9kZWxFbnRyaWVzLmZpbHRlcihlID0+IGUubW9kZWwubWV0YWRhdGEuaWQgIT09ICdhdXRvJyk7XG5cdFx0XHRcdGlmIChwaW5uYWJsZUVudHJpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGFsbFBpbm5lZCA9IHBpbm5hYmxlRW50cmllcy5ldmVyeShlID0+IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzTW9kZWxQaW5uZWQoZS5tb2RlbC5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiBhbGxQaW5uZWQgPyAndW5waW5Nb2RlbHMnIDogJ3Bpbk1vZGVscycsXG5cdFx0XHRcdFx0XHRsYWJlbDogYWxsUGlubmVkXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy51bnBpbk1vZGVsJywgXCJVbnBpbiBNb2RlbFwiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMucGluTW9kZWwnLCBcIlBpbiBNb2RlbFwiKSxcblx0XHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoYWxsUGlubmVkID8gQ29kaWNvbi5waW5uZWQgOiBDb2RpY29uLnBpbiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBwaW5uYWJsZUVudHJpZXMpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoYWxsUGlubmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS51bnBpbk1vZGVsKGVudHJ5Lm1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5waW5Nb2RlbChlbnRyeS5tb2RlbC5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBIaWRlL3Nob3cgYWN0aW9uIFx1MjAxNCBzaW5nbGUgYWN0aW9uIGZvciBhbGwgc2VsZWN0ZWQgbW9kZWxzXG5cdFx0XHRcdGNvbnN0IGFsbEhpZGRlbiA9IHNlbGVjdGVkTW9kZWxFbnRyaWVzLmV2ZXJ5KGUgPT4gZS5tb2RlbC5oaWRkZW4pO1xuXHRcdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiBhbGxIaWRkZW4gPyAnc2hvd01vZGVscycgOiAnaGlkZU1vZGVscycsXG5cdFx0XHRcdFx0bGFiZWw6IGFsbEhpZGRlblxuXHRcdFx0XHRcdFx0PyAoc2VsZWN0ZWRNb2RlbEVudHJpZXMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5zaG93TW9kZWwnLCBcIlNob3cgTW9kZWxcIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLnNob3dNb2RlbHNQbHVyYWwnLCBcIlNob3cgTW9kZWxzXCIpKVxuXHRcdFx0XHRcdFx0OiAoc2VsZWN0ZWRNb2RlbEVudHJpZXMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5oaWRlTW9kZWwnLCBcIkhpZGUgTW9kZWxcIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLmhpZGVNb2RlbHNQbHVyYWwnLCBcIkhpZGUgTW9kZWxzXCIpKSxcblx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGFsbEhpZGRlbiA/IENvZGljb24uZXllQ2xvc2VkIDogQ29kaWNvbi5leWUpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy52aWV3TW9kZWwuc2V0TW9kZWxzSGlkZGVuKHNlbGVjdGVkTW9kZWxFbnRyaWVzLCAhYWxsSGlkZGVuKSxcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFNob3cgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gYWN0aW9ucyBmb3IgYSBzaW5nbGUgbW9kZWxcblx0XHRcdFx0aWYgKHNlbGVjdGVkTW9kZWxFbnRyaWVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZ0FjdGlvbnMgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKHNlbGVjdGVkTW9kZWxFbnRyaWVzWzBdLm1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdGlmIChjb25maWdBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2goLi4uY29uZmlnQWN0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2hvdyBjb25maWd1cmUgYWN0aW9uIGlmIGFsbCBtb2RlbHMgYXJlIGZyb20gdGhlIHNhbWUgZ3JvdXBcblx0XHRcdFx0Y29uZmlndXJlR3JvdXAgPSBzZWxlY3RlZE1vZGVsRW50cmllc1swXS5tb2RlbC5wcm92aWRlci5ncm91cC5uYW1lO1xuXHRcdFx0XHRjb25maWd1cmVWZW5kb3IgPSBzZWxlY3RlZE1vZGVsRW50cmllc1swXS5tb2RlbC5wcm92aWRlci52ZW5kb3I7XG5cdFx0XHRcdGlmIChzZWxlY3RlZE1vZGVsRW50cmllcy5zb21lKGVudHJ5ID0+IGVudHJ5Lm1vZGVsLnByb3ZpZGVyLnZlbmRvci5pc0RlZmF1bHQgfHwgZW50cnkubW9kZWwucHJvdmlkZXIuZ3JvdXAubmFtZSAhPT0gY29uZmlndXJlR3JvdXApKSB7XG5cdFx0XHRcdFx0Y29uZmlndXJlR3JvdXAgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uZmlndXJlVmVuZG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkRW50cmllcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlLmVsZW1lbnQ7XG5cdFx0XHRcdGlmIChpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGVudHJ5KSkge1xuXHRcdFx0XHRcdGNvbmZpZ3VyZUdyb3VwID0gZW50cnkudmVuZG9yRW50cnkuZ3JvdXAubmFtZTtcblx0XHRcdFx0XHRjb25maWd1cmVWZW5kb3IgPSBlbnRyeS52ZW5kb3JFbnRyeS52ZW5kb3I7XG5cblx0XHRcdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6IGVudHJ5LmhpZGRlbiA/ICdzaG93R3JvdXAnIDogJ2hpZGVHcm91cCcsXG5cdFx0XHRcdFx0XHRsYWJlbDogZW50cnkuaGlkZGVuXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5zaG93R3JvdXAnLCBcIlNob3cgQWxsIE1vZGVsc1wiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMuaGlkZUdyb3VwJywgXCJIaWRlIEFsbCBNb2RlbHNcIiksXG5cdFx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGVudHJ5LmhpZGRlbiA/IENvZGljb24uZXllQ2xvc2VkIDogQ29kaWNvbi5leWUpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnZpZXdNb2RlbC50b2dnbGVHcm91cEhpZGRlbihlbnRyeSksXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25maWd1cmVHcm91cCAmJiBjb25maWd1cmVWZW5kb3IpIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBBY3Rpb25zID0gY29uZmlndXJlVmVuZG9yLm1hbmFnZW1lbnRDb21tYW5kXG5cdFx0XHRcdFx0PyBbdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6ICdtYW5hZ2VWZW5kb3InLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbHMubWFuYWdlUHJvdmlkZXInLCAnTWFuYWdlIHswfS4uLicsIGNvbmZpZ3VyZUdyb3VwKSxcblx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbmZpZ3VyZVZlbmRvci5tYW5hZ2VtZW50Q29tbWFuZCEsIGNvbmZpZ3VyZVZlbmRvci52ZW5kb3IpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXdNb2RlbC5yZWZyZXNoKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSldXG5cdFx0XHRcdFx0OiBjcmVhdGVQcm92aWRlckdyb3VwQWN0aW9ucyh0aGlzLnZpZXdNb2RlbCwgY29uZmlndXJlVmVuZG9yLCBjb25maWd1cmVHcm91cCwgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHRoaXMuZGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGlmIChncm91cEFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKC4uLmdyb3VwQWN0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9uc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRhYmxlLnNwbGljZSgwLCB0aGlzLnRhYmxlLmxlbmd0aCwgdGhpcy52aWV3TW9kZWwudmlld01vZGVsRW50cmllcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZmlyZSh0aGlzLml0ZW1Db3VudCk7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnZpZXdNb2RlbC5vbkRpZENoYW5nZSgoeyBhdCwgcmVtb3ZlZCwgYWRkZWQgfSkgPT4ge1xuXHRcdFx0dGhpcy50YWJsZS5zcGxpY2UoYXQsIHJlbW92ZWQsIGFkZGVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmZpcmUodGhpcy5pdGVtQ291bnQpO1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGVsLnNlbGVjdGVkRW50cnkpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRFbnRyeUluZGV4ID0gdGhpcy52aWV3TW9kZWwudmlld01vZGVsRW50cmllcy5pbmRleE9mKHRoaXMudmlld01vZGVsLnNlbGVjdGVkRW50cnkpO1xuXHRcdFx0XHR0aGlzLnRhYmxlLnNldEZvY3VzKFtzZWxlY3RlZEVudHJ5SW5kZXhdKTtcblx0XHRcdFx0dGhpcy50YWJsZS5zZXRTZWxlY3Rpb24oW3NlbGVjdGVkRW50cnlJbmRleF0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZS5vbkRpZE9wZW4oYXN5bmMgKHsgZWxlbWVudCwgYnJvd3NlckV2ZW50IH0pID0+IHtcblx0XHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNTdGF0dXNFbnRyeShlbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShlbGVtZW50KSB8fCBpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KGVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMudmlld01vZGVsLnRvZ2dsZUNvbGxhcHNlZChlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudGFibGUub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB0aGlzLnZpZXdNb2RlbC5zZWxlY3RlZEVudHJ5ID0gZS5lbGVtZW50c1swXSkpO1xuXG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZWwuc2hvdWxkUmVmaWx0ZXIoKSkge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5maWx0ZXIodGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5lbGVtZW50LmNsaWVudEhlaWdodCwgdGhpcy5lbGVtZW50LmNsaWVudFdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWRkTW9kZWxzQnV0dG9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYWJsZVZlbmRvcnMgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRWZW5kb3JzKCkuZmlsdGVyKHZlbmRvciA9PiB2ZW5kb3IubWFuYWdlbWVudENvbW1hbmQgfHwgdmVuZG9yLmNvbmZpZ3VyYXRpb24pO1xuXG5cdFx0Y29uc3QgZW50aXRsZW1lbnQgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQ7XG5cdFx0Y29uc3QgaXNNYW5hZ2VkRW50aXRsZW1lbnQgPSBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzIHx8IGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZTtcblx0XHRjb25zdCBzdXBwb3J0c0FkZGluZ01vZGVscyA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5pc0ludGVybmFsXG5cdFx0XHR8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuY2xpZW50Qnlva0VuYWJsZWRcblx0XHRcdHx8IChlbnRpdGxlbWVudCAhPT0gQ2hhdEVudGl0bGVtZW50LlVua25vd25cblx0XHRcdFx0JiYgZW50aXRsZW1lbnQgIT09IENoYXRFbnRpdGxlbWVudC5BdmFpbGFibGVcblx0XHRcdFx0JiYgIWlzTWFuYWdlZEVudGl0bGVtZW50KTtcblxuXHRcdHRoaXMuZHJvcGRvd25BY3Rpb25zID0gYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnMoXG5cdFx0XHRjb25maWd1cmFibGVWZW5kb3JzLFxuXHRcdFx0c3VwcG9ydHNBZGRpbmdNb2RlbHMsXG5cdFx0XHR2ZW5kb3IgPT4gdGhpcy5hZGRNb2RlbHNGb3JWZW5kb3IodmVuZG9yKSxcblx0XHQpO1xuXG5cdFx0dGhpcy5hZGRCdXR0b24uZW5hYmxlZCA9IHN1cHBvcnRzQWRkaW5nTW9kZWxzICYmIHRoaXMuZHJvcGRvd25BY3Rpb25zLmxlbmd0aCA+IDA7XG5cdFx0dGhpcy5hZGRCdXR0b24uc2V0VGl0bGUoIXN1cHBvcnRzQWRkaW5nTW9kZWxzICYmIGlzTWFuYWdlZEVudGl0bGVtZW50ID8gbG9jYWxpemUoJ21vZGVscy5tYW5hZ2VkQnlPcmdhbml6YXRpb24nLCBcIkFkZGluZyBtb2RlbHMgaXMgbWFuYWdlZCBieSB5b3VyIG9yZ2FuaXphdGlvblwiKSA6ICcnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbkxhbmd1YWdlTW9kZWxQcm92aWRlckV4dGVuc2lvbnNTZWFyY2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWN0aXZlTW9kYWxFZGl0b3JQYXJ0ID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydDtcblx0XHRjb25zdCBpc0luTW9kYWxFZGl0b3IgPSAhIWFjdGl2ZU1vZGFsRWRpdG9yUGFydCAmJiB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0UGFydCh0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXApID09PSBhY3RpdmVNb2RhbEVkaXRvclBhcnQ7XG5cdFx0aWYgKGlzSW5Nb2RhbEVkaXRvcikge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDTE9TRV9NT0RBTF9FRElUT1JfQ09NTUFORF9JRCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGB0YWc6XCIke0xBTkdVQUdFX01PREVMX0NIQVRfUFJPVklERVJfRVhURU5TSU9OX1RBR31cImAsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyTW9kZWxzKCk6IHZvaWQge1xuXHRcdHRoaXMuZGVsYXllZEZpbHRlcmluZy50cmlnZ2VyKCgpID0+IHtcblx0XHRcdHRoaXMudmlld01vZGVsLmZpbHRlcih0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWRkTW9kZWxzRm9yVmVuZG9yKHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5jb25maWd1cmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9yLnZlbmRvcik7XG5cdFx0YXdhaXQgdGhpcy52aWV3TW9kZWwucmVmcmVzaCgpO1xuXHR9XG5cblx0cHVibGljIGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHdpZHRoID0gd2lkdGggLSAyNDtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5sYXlvdXQobmV3IERPTS5EaW1lbnNpb24od2lkdGggLSB0aGlzLnNlYXJjaEFjdGlvbnNDb250YWluZXIuY2xpZW50V2lkdGggLSB0aGlzLmFkZEJ1dHRvbkNvbnRhaW5lci5jbGllbnRXaWR0aCAtIDgsIDIyKSk7XG5cdFx0Y29uc3QgdGFibGVIZWlnaHQgPSBoZWlnaHQgLSA0MDtcblx0XHR0aGlzLnRhYmxlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RhYmxlSGVpZ2h0fXB4YDtcblx0XHRjb25zdCB0YWJsZVdpZHRoID0gTWF0aC5tYXgod2lkdGgsIHRoaXMudGFibGVNaW5XaWR0aCk7XG5cdFx0dGhpcy50YWJsZS5sYXlvdXQodGFibGVIZWlnaHQsIHRhYmxlV2lkdGgpO1xuXHRcdHRoaXMudGFibGVTY3JvbGxhYmxlPy5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHVibGljIGZvY3VzU2VhcmNoKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgc2VhcmNoKGZpbHRlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5mb2N1c1NlYXJjaCgpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKGZpbHRlcik7XG5cdFx0dGhpcy52aWV3TW9kZWwuZmlsdGVyKGZpbHRlcik7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJTZWFyY2goKTogdm9pZCB7XG5cdFx0dGhpcy5mb2N1c1NlYXJjaCgpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKCcnKTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld01vZGVsLnNob3VsZFJlZmlsdGVyKCkpIHtcblx0XHRcdHRoaXMudmlld01vZGVsLmZpbHRlcih0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgdG90YWwgbW9kZWwgY291bnQgKGV4Y2x1ZGluZyB2ZW5kb3IvZ3JvdXAvc3RhdHVzIGhlYWRlcnMpLlxuXHQgKi9cblx0Z2V0IGl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbC52aWV3TW9kZWxFbnRyaWVzXG5cdFx0XHQuZmlsdGVyKGUgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZSkgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkoZSkgJiYgIWlzU3RhdHVzRW50cnkoZSkpXG5cdFx0XHQubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWZpcmVzIHRoZSBjdXJyZW50IGl0ZW0gY291bnQuIENhbGwgYWZ0ZXIgc3Vic2NyaWJpbmcgdG8gb25EaWRDaGFuZ2VJdGVtQ291bnRcblx0ICogdG8gZW5zdXJlIHRoZSBzdWJzY3JpYmVyIHJlY2VpdmVzIHRoZSBsYXRlc3QgY291bnQuXG5cdCAqL1xuXHRmaXJlSXRlbUNvdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmZpcmUodGhpcy5pdGVtQ291bnQpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxlQUFlO0FBQ3hCLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQThCO0FBQ3ZDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQTBELHNDQUFzQztBQUN6RyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFrQixVQUFVLFFBQVEsaUJBQWlCO0FBQ3JELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFpSCxvQkFBb0IsOEJBQThCLDJCQUE0QyxxQkFBbUM7QUFDM1AsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5Qix1QkFBdUI7QUFDekQsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGtEQUFrRDtBQUMzRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9DQUFvQztBQUM3QyxPQUFPLGNBQWM7QUFFckIsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxJQUFJLElBQUk7QUFFZCxNQUFNLGdCQUFnQjtBQUN0QixNQUFNLG9CQUFvQjtBQUMxQixNQUFNLG1CQUFtQjtBQUN6QixNQUFNLGdDQUFnQztBQUUvQixTQUFTLHFCQUFxQixPQUF1QztBQUMzRSxRQUFNLFdBQVcsSUFBSSxlQUFlLElBQUksRUFBRSxXQUFXLE1BQU0sbUJBQW1CLEtBQUssQ0FBQztBQUNwRixXQUFTLGVBQWUsS0FBSyxNQUFNLFNBQVMsSUFBSSxJQUFJO0FBQ3BELE1BQUksTUFBTSxTQUFTLE9BQU8sTUFBTSxTQUFTLFNBQVM7QUFDakQsYUFBUyxlQUFlLDBEQUEwRCxNQUFNLFNBQVMsRUFBRSxRQUFRLE1BQU0sU0FBUyxPQUFPLGdCQUFnQjtBQUFBLEVBQ2xKLE9BQU87QUFDTixhQUFTLGVBQWUsMERBQTBELE1BQU0sU0FBUyxFQUFFLGdCQUFnQjtBQUFBLEVBQ3BIO0FBQ0EsV0FBUyxXQUFXO0FBQUEsQ0FBSTtBQUV4QixNQUFJLE1BQU0sU0FBUyxjQUFjLE1BQU0sU0FBUyxTQUFTO0FBQ3hELFFBQUksTUFBTSxTQUFTLFlBQVk7QUFDOUIsZUFBUyxlQUFlLEtBQUssTUFBTSxTQUFTLFdBQVcsRUFBRSxTQUFTO0FBQUEsSUFDbkU7QUFDQSxhQUFTLGVBQWUsR0FBRyxNQUFNLFNBQVMsT0FBTyxFQUFFO0FBQ25ELGFBQVMsV0FBVztBQUFBLENBQUk7QUFBQSxFQUN6QjtBQUVBLE1BQUksTUFBTSxTQUFTLFNBQVM7QUFDM0IsYUFBUyxlQUFlLEdBQUcsU0FBUyxrQkFBa0IsU0FBUyxDQUFDLElBQUk7QUFDcEUsYUFBUyxlQUFlLE1BQU0sU0FBUyxPQUFPO0FBQzlDLGFBQVMsV0FBVztBQUFBLENBQUk7QUFBQSxFQUN6QjtBQUVBLE1BQUksTUFBTSxTQUFTLGNBQWMsVUFBYSxNQUFNLFNBQVMsZUFBZSxVQUFhLE1BQU0sU0FBUyxjQUFjLFVBQWEsTUFBTSxTQUFTLG1CQUFtQixRQUFXO0FBQy9LLFFBQUksTUFBTSxTQUFTLGNBQWMsUUFBVztBQUMzQyxlQUFTLGVBQWUsTUFBTSxTQUFTLGNBQWMsSUFDbEQsU0FBUyw2QkFBNkIsd0NBQXdDLE1BQU0sU0FBUyxTQUFTLElBQ3RHLFNBQVMsMkJBQTJCLHlDQUF5QyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQ3pHLGVBQVMsV0FBVztBQUFBLENBQUk7QUFBQSxJQUN6QjtBQUNBLFFBQUksTUFBTSxTQUFTLGNBQWMsUUFBVztBQUMzQyxlQUFTLGVBQWUsTUFBTSxTQUFTLGNBQWMsSUFDbEQsU0FBUyw2QkFBNkIsNkNBQTZDLE1BQU0sU0FBUyxTQUFTLElBQzNHLFNBQVMsMkJBQTJCLDhDQUE4QyxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQzlHLGVBQVMsV0FBVztBQUFBLENBQUk7QUFBQSxJQUN6QjtBQUNBLFFBQUksTUFBTSxTQUFTLG1CQUFtQixRQUFXO0FBQ2hELGVBQVMsZUFBZSxNQUFNLFNBQVMsbUJBQW1CLElBQ3ZELFNBQVMsa0NBQWtDLDhDQUE4QyxNQUFNLFNBQVMsY0FBYyxJQUN0SCxTQUFTLGdDQUFnQywrQ0FBK0MsTUFBTSxTQUFTLGNBQWMsQ0FBQztBQUN6SCxlQUFTLFdBQVc7QUFBQSxDQUFJO0FBQUEsSUFDekI7QUFDQSxRQUFJLE1BQU0sU0FBUyxlQUFlLFFBQVc7QUFDNUMsZUFBUyxlQUFlLE1BQU0sU0FBUyxlQUFlLElBQ25ELFNBQVMsOEJBQThCLHlDQUF5QyxNQUFNLFNBQVMsVUFBVSxJQUN6RyxTQUFTLDRCQUE0QiwwQ0FBMEMsTUFBTSxTQUFTLFVBQVUsQ0FBQztBQUM1RyxlQUFTLFdBQVc7QUFBQSxDQUFJO0FBQUEsSUFDekI7QUFFQSxRQUFJLE1BQU0sU0FBUyx5QkFBeUIsVUFBYSxNQUFNLFNBQVMsMEJBQTBCLFVBQWEsTUFBTSxTQUFTLHlCQUF5QixVQUFhLE1BQU0sU0FBUyw4QkFBOEIsUUFBVztBQUMzTixlQUFTLFdBQVc7QUFBQSxDQUFJO0FBQ3hCLGVBQVMsZUFBZSxLQUFLLFNBQVMsNkJBQTZCLHNCQUFzQixDQUFDLElBQUk7QUFDOUYsZUFBUyxXQUFXO0FBQUEsQ0FBSTtBQUN4QixVQUFJLE1BQU0sU0FBUyx5QkFBeUIsUUFBVztBQUN0RCxpQkFBUyxlQUFlLE1BQU0sU0FBUyx5QkFBeUIsSUFDN0QsU0FBUyx3Q0FBd0Msd0NBQXdDLE1BQU0sU0FBUyxvQkFBb0IsSUFDNUgsU0FBUyxzQ0FBc0MseUNBQXlDLE1BQU0sU0FBUyxvQkFBb0IsQ0FBQztBQUMvSCxpQkFBUyxXQUFXO0FBQUEsQ0FBSTtBQUFBLE1BQ3pCO0FBQ0EsVUFBSSxNQUFNLFNBQVMseUJBQXlCLFFBQVc7QUFDdEQsaUJBQVMsZUFBZSxNQUFNLFNBQVMseUJBQXlCLElBQzdELFNBQVMsd0NBQXdDLDZDQUE2QyxNQUFNLFNBQVMsb0JBQW9CLElBQ2pJLFNBQVMsc0NBQXNDLDhDQUE4QyxNQUFNLFNBQVMsb0JBQW9CLENBQUM7QUFDcEksaUJBQVMsV0FBVztBQUFBLENBQUk7QUFBQSxNQUN6QjtBQUNBLFVBQUksTUFBTSxTQUFTLDhCQUE4QixRQUFXO0FBQzNELGlCQUFTLGVBQWUsTUFBTSxTQUFTLDhCQUE4QixJQUNsRSxTQUFTLDZDQUE2Qyw4Q0FBOEMsTUFBTSxTQUFTLHlCQUF5QixJQUM1SSxTQUFTLDJDQUEyQywrQ0FBK0MsTUFBTSxTQUFTLHlCQUF5QixDQUFDO0FBQy9JLGlCQUFTLFdBQVc7QUFBQSxDQUFJO0FBQUEsTUFDekI7QUFDQSxVQUFJLE1BQU0sU0FBUywwQkFBMEIsUUFBVztBQUN2RCxpQkFBUyxlQUFlLE1BQU0sU0FBUywwQkFBMEIsSUFDOUQsU0FBUyx5Q0FBeUMseUNBQXlDLE1BQU0sU0FBUyxxQkFBcUIsSUFDL0gsU0FBUyx1Q0FBdUMsMENBQTBDLE1BQU0sU0FBUyxxQkFBcUIsQ0FBQztBQUNsSSxpQkFBUyxXQUFXO0FBQUEsQ0FBSTtBQUFBLE1BQ3pCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxNQUFJLE1BQU0sU0FBUyxrQkFBa0IsTUFBTSxTQUFTLGlCQUFpQjtBQUNwRSxVQUFNLGVBQWUsTUFBTSxTQUFTLGtCQUFrQixNQUFNLE1BQU0sU0FBUyxtQkFBbUI7QUFDOUYsYUFBUyxlQUFlLEdBQUcsU0FBUyxzQkFBc0IsY0FBYyxDQUFDLElBQUk7QUFDN0UsYUFBUyxlQUFlLEdBQUcsaUJBQWlCLFdBQVcsQ0FBQyxFQUFFO0FBQzFELGFBQVMsV0FBVztBQUFBLENBQUk7QUFBQSxFQUN6QjtBQUVBLE1BQUksTUFBTSxTQUFTLGNBQWM7QUFDaEMsYUFBUyxlQUFlLEdBQUcsU0FBUyx1QkFBdUIsY0FBYyxDQUFDLElBQUk7QUFDOUUsUUFBSSxNQUFNLFNBQVMsY0FBYyxhQUFhO0FBQzdDLGVBQVMsZUFBZSwwREFBMEQsU0FBUyxzQkFBc0IsT0FBTyxDQUFDLGdCQUFnQjtBQUFBLElBQzFJO0FBQ0EsUUFBSSxNQUFNLFNBQVMsY0FBYyxRQUFRO0FBQ3hDLGVBQVMsZUFBZSwwREFBMEQsU0FBUyxpQkFBaUIsUUFBUSxDQUFDLGdCQUFnQjtBQUFBLElBQ3RJO0FBQ0EsUUFBSSxNQUFNLFNBQVMsY0FBYyxXQUFXO0FBQzNDLGVBQVMsZUFBZSwwREFBMEQsU0FBUyxvQkFBb0IsWUFBWSxDQUFDLGdCQUFnQjtBQUFBLElBQzdJO0FBQ0EsZUFBVyxZQUFZLE1BQU0sU0FBUyxhQUFhLGFBQWEsQ0FBQyxHQUFHO0FBQ25FLGVBQVMsZUFBZSwwREFBMEQsUUFBUSxnQkFBZ0I7QUFBQSxJQUMzRztBQUNBLGFBQVMsV0FBVztBQUFBLENBQUk7QUFBQSxFQUN6QjtBQUVBLFNBQU87QUFDUjtBQVNPLFNBQVMsOEJBQ2YscUJBQ0Esc0JBQ0EsaUJBQ1k7QUFDWixNQUFJLENBQUMsc0JBQXNCO0FBQzFCLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFLQSxRQUFNLHVCQUF1QixvQkFBb0IsS0FBSyxPQUFLLEVBQUUsV0FBVyxnQkFBZ0I7QUFDeEYsUUFBTSxrQkFBa0Isb0JBQW9CLEtBQUssT0FBSyxFQUFFLFdBQVcsV0FBVztBQUM5RSxRQUFNLGdCQUFnQixvQkFDcEIsT0FBTyxPQUFLLEVBQUUsV0FBVyxvQkFBb0IsRUFBRSxXQUFXLFdBQVcsRUFDckUsS0FBSyxDQUFDLEdBQUcsTUFBTTtBQUNmLFVBQU0sY0FBYyxFQUFFLGFBQWEsT0FBTyxJQUFJO0FBQzlDLFVBQU0sY0FBYyxFQUFFLGFBQWEsT0FBTyxJQUFJO0FBQzlDLFFBQUksZ0JBQWdCLGFBQWE7QUFDaEMsYUFBTyxjQUFjO0FBQUEsSUFDdEI7QUFDQSxXQUFPLEVBQUUsWUFBWSxjQUFjLEVBQUUsV0FBVztBQUFBLEVBQ2pELENBQUM7QUFDRixNQUFJLGlCQUFpQjtBQUNwQixrQkFBYyxLQUFLLGVBQWU7QUFBQSxFQUNuQztBQUVBLFFBQU0saUJBQWlCLENBQUMsV0FBNkMsU0FBUztBQUFBLElBQzdFLElBQUksVUFBVSxPQUFPLE1BQU07QUFBQSxJQUMzQixPQUFPLE9BQU87QUFBQSxJQUNkLEtBQUssWUFBWTtBQUNoQixZQUFNLGdCQUFnQixNQUFNO0FBQUEsSUFDN0I7QUFBQSxFQUNELENBQUM7QUFFRCxRQUFNLFVBQXFCLGNBQWMsSUFBSSxjQUFjO0FBQzNELE1BQUksc0JBQXNCO0FBQ3pCLFFBQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsY0FBUSxLQUFLLElBQUksVUFBVSxDQUFDO0FBQUEsSUFDN0I7QUFDQSxZQUFRLEtBQUssZUFBZSxvQkFBb0IsQ0FBQztBQUFBLEVBQ2xEO0FBRUEsU0FBTztBQUNSO0FBRUEsTUFBTSwyQkFBMkIsT0FBTztBQUFBLEVBQ3ZDLGNBQWM7QUFDYixVQUFNLDJCQUEyQixTQUFTLFVBQVUsUUFBUSxHQUFHLFVBQVUsWUFBWSxRQUFRLE1BQU0sQ0FBQztBQUFBLEVBQ3JHO0FBQUEsRUFDQSxNQUFlLE1BQXFCO0FBQUEsRUFDcEM7QUFDRDtBQVdBLFNBQVMsYUFBYSxjQUFzQixRQUE4QjtBQUN6RSxRQUFNLEVBQUUsT0FBTyxXQUFXLENBQUMsR0FBRyxXQUFXLENBQUMsRUFBRSxJQUFJO0FBQ2hELFFBQU0sY0FBYyxDQUFDLE9BQU8sR0FBRyxRQUFRO0FBQ3ZDLFFBQU0sWUFBWSxZQUFZLEtBQUssT0FBSyxhQUFhLFNBQVMsQ0FBQyxDQUFDO0FBQ2hFLFFBQU0sbUJBQW1CLFNBQVMsS0FBSyxPQUFLLGFBQWEsU0FBUyxDQUFDLENBQUM7QUFFcEUsTUFBSSxXQUFXO0FBRWQsUUFBSSx5QkFBeUI7QUFDN0IsZUFBVyxLQUFLLGFBQWE7QUFDNUIsK0JBQXlCLHVCQUF1QixRQUFRLEdBQUcsRUFBRTtBQUFBLElBQzlEO0FBQ0EsV0FBTyx1QkFBdUIsUUFBUSxRQUFRLEdBQUcsRUFBRSxLQUFLO0FBQUEsRUFDekQsV0FBVyxrQkFBa0I7QUFFNUIsUUFBSSxXQUFXO0FBQ2YsZUFBVyxLQUFLLFVBQVU7QUFDekIsaUJBQVcsU0FBUyxRQUFRLEdBQUcsRUFBRTtBQUFBLElBQ2xDO0FBQ0EsZUFBVyxTQUFTLFFBQVEsUUFBUSxHQUFHLEVBQUUsS0FBSztBQUM5QyxXQUFPLFdBQVcsR0FBRyxRQUFRLElBQUksS0FBSyxLQUFLO0FBQUEsRUFDNUMsT0FBTztBQUVOLFVBQU0sZUFBZSxhQUFhLEtBQUs7QUFDdkMsV0FBTyxlQUFlLEdBQUcsWUFBWSxJQUFJLEtBQUssS0FBSztBQUFBLEVBQ3BEO0FBQ0Q7QUFFQSxJQUFNLCtDQUFOLGNBQTJELDJCQUEyQjtBQUFBLEVBRXJGLFlBQ0MsUUFDQSxTQUNpQixRQUlBLFdBQ0ksb0JBQ3BCO0FBQ0Q7QUFBQSxNQUFNO0FBQUEsTUFDTCxFQUFFLFlBQVksTUFBTSxLQUFLLFdBQVcsRUFBRTtBQUFBLE1BQ3RDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsR0FBRztBQUFBLFFBQ0gsWUFBWSxPQUFPO0FBQUEsUUFDbkIseUJBQXlCLE1BQU0sZ0JBQWdCO0FBQUEsUUFDL0MsYUFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBaEJpQjtBQUlBO0FBQUEsRUFhbEI7QUFBQSxFQUVRLHFCQUFxQixRQUFnQixhQUE4QjtBQUMxRSxVQUFNLFFBQVEsY0FBYyxXQUFXO0FBQ3ZDLFVBQU0sZUFBZSxLQUFLLE9BQU8sU0FBUztBQUMxQyxVQUFNLFlBQVksYUFBYSxTQUFTLEtBQUssS0FBSyxhQUFhLFNBQVMsYUFBYSxNQUFNLEVBQUU7QUFFN0YsV0FBTztBQUFBLE1BQ04sSUFBSSxZQUFZLE1BQU07QUFBQSxNQUN0QixPQUFPO0FBQUEsTUFDUCxTQUFTLFNBQVMsb0JBQW9CLGlCQUFpQixXQUFXO0FBQUEsTUFDbEUsT0FBTztBQUFBLE1BQ1AsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsS0FBSyxNQUFNLEtBQUssc0JBQXNCLEVBQUUsT0FBTyxVQUFVLENBQUMsYUFBYSxNQUFNLEVBQUUsRUFBRSxDQUFDO0FBQUEsSUFDbkY7QUFBQSxFQUNEO0FBQUEsRUFFUSx1QkFBdUIsWUFBb0IsT0FBd0I7QUFDMUUsVUFBTSxRQUFRLGVBQWUsVUFBVTtBQUN2QyxVQUFNLGVBQWUsS0FBSyxPQUFPLFNBQVM7QUFDMUMsVUFBTSxZQUFZLGFBQWEsU0FBUyxLQUFLO0FBRTdDLFdBQU87QUFBQSxNQUNOLElBQUksY0FBYyxVQUFVO0FBQUEsTUFDNUI7QUFBQSxNQUNBLFNBQVMsU0FBUyxzQkFBc0IsaUJBQWlCLEtBQUs7QUFBQSxNQUM5RCxPQUFPO0FBQUEsTUFDUCxTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsTUFDVCxLQUFLLE1BQU0sS0FBSyxzQkFBc0IsRUFBRSxNQUFNLENBQUM7QUFBQSxJQUNoRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixRQUE0QjtBQUN6RCxVQUFNLGVBQWUsS0FBSyxPQUFPLFNBQVM7QUFDMUMsVUFBTSxXQUFXLGFBQWEsY0FBYyxNQUFNO0FBQ2xELFNBQUssT0FBTyxTQUFTLFFBQVE7QUFBQSxFQUM5QjtBQUFBLEVBRVEsYUFBd0I7QUFDL0IsVUFBTSxVQUFxQixDQUFDO0FBRzVCLFlBQVE7QUFBQSxNQUNQLEtBQUssdUJBQXVCLFNBQVMsU0FBUyxvQkFBb0IsT0FBTyxDQUFDO0FBQUEsTUFDMUUsS0FBSyx1QkFBdUIsVUFBVSxTQUFTLHFCQUFxQixRQUFRLENBQUM7QUFBQSxNQUM3RSxLQUFLLHVCQUF1QixTQUFTLFNBQVMsb0JBQW9CLFlBQVksQ0FBQztBQUFBLElBQ2hGO0FBR0EsVUFBTSxvQkFBb0IsS0FBSyxVQUFVLHFCQUFxQjtBQUM5RCxRQUFJLGtCQUFrQixTQUFTLEdBQUc7QUFDakMsY0FBUSxLQUFLLElBQUksVUFBVSxDQUFDO0FBQzVCLGNBQVEsS0FBSyxHQUFHLGtCQUFrQixJQUFJLFlBQVUsS0FBSyxxQkFBcUIsT0FBTyxPQUFPLFFBQVEsT0FBTyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBQUEsSUFDcEg7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBakZNLCtDQUFOO0FBQUEsRUFVRztBQUFBLEdBVkc7QUFtRk4sTUFBTSxTQUEyRDtBQUFBLEVBQWpFO0FBQ0MsU0FBUyxrQkFBa0I7QUFBQTtBQUFBLEVBQzNCLFVBQVUsU0FBa0M7QUFDM0MsV0FBTyw2QkFBNkIsT0FBTyxLQUFLLDBCQUEwQixPQUFPLElBQUksb0JBQW9CO0FBQUEsRUFDMUc7QUFDRDtBQVFBLE1BQWUsMEJBQWlIO0FBQUEsRUFJL0gsY0FBYyxTQUEwQixPQUFlLGNBQXVCO0FBQzdFLGlCQUFhLG1CQUFtQixNQUFNO0FBQ3RDLFVBQU0sV0FBVyw2QkFBNkIsT0FBTztBQUNyRCxVQUFNLFVBQVUsMEJBQTBCLE9BQU87QUFDakQsVUFBTSxXQUFXLGNBQWMsT0FBTztBQUN0QyxpQkFBYSxVQUFVLFVBQVUsSUFBSSxxQkFBcUI7QUFDMUQsVUFBTSxNQUFNLGFBQWEsVUFBVTtBQUNuQyxRQUFJLFVBQVUsT0FBTyxxQkFBcUIsWUFBWSxPQUFPO0FBQzdELFFBQUksVUFBVSxPQUFPLG9CQUFvQixDQUFDLFlBQVksQ0FBQyxPQUFPO0FBQzlELFFBQUksVUFBVSxPQUFPLHFCQUFxQixRQUFRO0FBQ2xELFVBQU0sV0FBWSxZQUFZLFFBQVEsVUFBWSxDQUFDLFlBQVksQ0FBQyxXQUFXLENBQUMsWUFBYSxRQUFnQyxPQUFPO0FBQ2hJLFFBQUksVUFBVSxPQUFPLHFCQUFxQixDQUFDLENBQUMsUUFBUTtBQUNwRCxRQUFJLFVBQVU7QUFDYixXQUFLLG9CQUFvQixTQUFTLE9BQU8sWUFBWTtBQUFBLElBQ3RELFdBQVcsU0FBUztBQUNuQixXQUFLLG1CQUFtQixTQUFTLE9BQU8sWUFBWTtBQUFBLElBQ3JELFdBQVcsVUFBVTtBQUNwQixXQUFLLG9CQUFvQixTQUFTLE9BQU8sWUFBWTtBQUFBLElBQ3RELE9BQU87QUFDTixXQUFLLG1CQUFtQixTQUFTLE9BQU8sWUFBWTtBQUFBLElBQ3JEO0FBQUEsRUFDRDtBQUFBLEVBTVUsb0JBQW9CLFNBQXVCLE9BQWUsY0FBdUI7QUFBQSxFQUFFO0FBQUEsRUFFN0YsZ0JBQWdCLGNBQXVCO0FBQ3RDLGlCQUFhLG1CQUFtQixRQUFRO0FBQ3hDLGlCQUFhLFlBQVksUUFBUTtBQUFBLEVBQ2xDO0FBQ0Q7QUFRQSxNQUFNLHdCQUFOLE1BQU0sOEJBQTZCLDBCQUE2RDtBQUFBLEVBTS9GLFlBQ2tCLFdBQ2hCO0FBQ0QsVUFBTTtBQUZXO0FBSGxCLFNBQVMsYUFBcUIsc0JBQXFCO0FBQUEsRUFNbkQ7QUFBQSxFQUVBLGVBQWUsV0FBMkQ7QUFDekUsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0scUJBQXFCLElBQUksZ0JBQWdCO0FBQy9DLGNBQVUsVUFBVSxJQUFJLHNCQUFzQjtBQUM5QyxVQUFNLFlBQVksWUFBWSxJQUFJLElBQUksVUFBVSxTQUFTLENBQUM7QUFDMUQsV0FBTztBQUFBLE1BQ04sZ0JBQWdCLFVBQVUsZUFBZSxpQkFBaUI7QUFBQSxNQUMxRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUyxjQUFjLE9BQXdCLE9BQWUsY0FBdUQ7QUFDcEgsaUJBQWEsVUFBVSxNQUFNO0FBQzdCLFVBQU0sY0FBYyxPQUFPLE9BQU8sWUFBWTtBQUFBLEVBQy9DO0FBQUEsRUFFUyxvQkFBb0IsT0FBb0MsT0FBZSxjQUF1RDtBQUN0SSxTQUFLLHlCQUF5QixPQUFPLFlBQVk7QUFDakQsU0FBSyw2QkFBNkIsT0FBTyxZQUFZO0FBQUEsRUFDdEQ7QUFBQSxFQUVTLG1CQUFtQixPQUFpQyxPQUFlLGNBQXVEO0FBQ2xJLFNBQUsseUJBQXlCLE9BQU8sWUFBWTtBQUFBLEVBQ2xEO0FBQUEsRUFFUSx5QkFBeUIsT0FBK0QsY0FBdUQ7QUFDdEosUUFBSSxhQUFhLGdCQUFnQjtBQUNoQyxtQkFBYSxlQUFlLGFBQWEsaUJBQWlCLE1BQU0sWUFBWSxVQUFVLE1BQU07QUFBQSxJQUM3RjtBQUVBLFVBQU0sUUFBUSxNQUFNLFlBQVksU0FBUyxVQUFVLFFBQVEsSUFBSSxTQUFTLFlBQVksVUFBVTtBQUM5RixVQUFNLHVCQUF1QjtBQUFBLE1BQzVCLElBQUk7QUFBQSxNQUNKO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsTUFDVCxPQUFPLFVBQVUsWUFBWSxNQUFNLFlBQVksUUFBUSxlQUFlLFFBQVEsV0FBVztBQUFBLE1BQ3pGLEtBQUssTUFBTSxLQUFLLFVBQVUsZ0JBQWdCLEtBQUs7QUFBQSxJQUNoRDtBQUNBLGlCQUFhLFVBQVUsS0FBSyxzQkFBc0IsRUFBRSxNQUFNLE1BQU0sT0FBTyxNQUFNLENBQUM7QUFBQSxFQUMvRTtBQUFBLEVBRVMsbUJBQW1CLE9BQTRCLE9BQWUsY0FBdUQ7QUFDN0gsU0FBSyw2QkFBNkIsT0FBTyxZQUFZO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLDZCQUE2QixPQUFvQyxjQUF1RDtBQUMvSCxVQUFNLFNBQVMsTUFBTTtBQUNyQixpQkFBYSxVQUFVLEtBQUs7QUFBQSxNQUMzQixJQUFJLFNBQVMsY0FBYztBQUFBLE1BQzNCLE9BQU8sU0FDSixTQUFTLG9CQUFvQixpQkFBaUIsSUFDOUMsU0FBUyxvQkFBb0IsaUJBQWlCO0FBQUEsTUFDakQsU0FBUyxTQUNOLFNBQVMsb0JBQW9CLGlCQUFpQixJQUM5QyxTQUFTLG9CQUFvQixpQkFBaUI7QUFBQSxNQUNqRCxPQUFPLDJCQUEyQixVQUFVLFlBQVksU0FBUyxRQUFRLFlBQVksUUFBUSxHQUFHLENBQUM7QUFBQSxNQUNqRyxTQUFTO0FBQUEsTUFDVCxLQUFLLE1BQU0sS0FBSyxVQUFVLGtCQUFrQixLQUFLO0FBQUEsSUFDbEQsR0FBRyxFQUFFLE1BQU0sTUFBTSxPQUFPLE1BQU0sQ0FBQztBQUFBLEVBQ2hDO0FBQUEsRUFFUSw2QkFBNkIsT0FBNEIsY0FBdUQ7QUFDdkgsVUFBTSxTQUFTLE1BQU0sTUFBTTtBQUMzQixpQkFBYSxVQUFVLEtBQUs7QUFBQSxNQUMzQixJQUFJLFNBQVMsY0FBYztBQUFBLE1BQzNCLE9BQU8sU0FDSixTQUFTLG9CQUFvQixZQUFZLElBQ3pDLFNBQVMsb0JBQW9CLFlBQVk7QUFBQSxNQUM1QyxTQUFTLFNBQ04sU0FBUyxvQkFBb0IsWUFBWSxJQUN6QyxTQUFTLG9CQUFvQixZQUFZO0FBQUEsTUFDNUMsT0FBTywyQkFBMkIsVUFBVSxZQUFZLFNBQVMsUUFBUSxZQUFZLFFBQVEsR0FBRyxDQUFDO0FBQUEsTUFDakcsU0FBUztBQUFBLE1BQ1QsS0FBSyxNQUFNLEtBQUssVUFBVSxrQkFBa0IsS0FBSztBQUFBLElBQ2xELEdBQUcsRUFBRSxNQUFNLE1BQU0sT0FBTyxNQUFNLENBQUM7QUFBQSxFQUNoQztBQUNEO0FBNUZNLHNCQUVXLGNBQWM7QUFGL0IsSUFBTSx1QkFBTjtBQXNHQSxJQUFNLDBCQUFOLGNBQXNDLDBCQUF3RDtBQUFBLEVBSzdGLFlBQ2lDLGNBQ1Esc0JBQ04sZ0JBQ2pDO0FBQ0QsVUFBTTtBQUowQjtBQUNRO0FBQ047QUFMbkMsU0FBUyxhQUFxQix3QkFBd0I7QUFBQSxFQVF0RDtBQUFBLEVBRUEsZUFBZSxXQUFzRDtBQUNwRSxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0MsVUFBTSxnQkFBZ0IsSUFBSSxPQUFPLFdBQVcsRUFBRSx1QkFBdUIsQ0FBQztBQUN0RSxVQUFNLGFBQWEsSUFBSSxPQUFPLGVBQWUsRUFBRSxjQUFjLENBQUM7QUFDOUQsVUFBTSxZQUFZLFlBQVksSUFBSSxJQUFJLGlCQUFpQixJQUFJLE9BQU8sZUFBZSxFQUFFLGFBQWEsQ0FBQyxDQUFDLENBQUM7QUFDbkcsVUFBTSwyQkFBMkIsSUFBSSxPQUFPLGVBQWUsRUFBRSx5QkFBeUIsQ0FBQztBQUN2Riw2QkFBeUIsTUFBTSxVQUFVO0FBQ3pDLFVBQU0sa0JBQWtCLFlBQVksSUFBSSxLQUFLLHFCQUFxQixlQUFlLE1BQU0sMEJBQTBCLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzdJLFVBQU0sa0JBQWtCLElBQUksT0FBTyxlQUFlLEVBQUUsb0JBQW9CLENBQUM7QUFDekUsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLGNBQWMsT0FBd0IsT0FBZSxjQUFrRDtBQUMvRyxRQUFJLFVBQVUsYUFBYSxlQUFlO0FBQzFDLGlCQUFhLFVBQVUsUUFBUSxVQUFVLE9BQU8sZ0JBQWdCLGtCQUFrQixhQUFhO0FBQy9GLGlCQUFhLHlCQUF5QixNQUFNLFVBQVU7QUFDdEQsVUFBTSxjQUFjLE9BQU8sT0FBTyxZQUFZO0FBQUEsRUFDL0M7QUFBQSxFQUVTLG9CQUFvQixPQUFvQyxPQUFlLGNBQWtEO0FBQ2pJLGlCQUFhLFVBQVUsSUFBSSxNQUFNLFlBQVksTUFBTSxNQUFNLE1BQVM7QUFFbEUsVUFBTSxrQkFBa0IsTUFBTSxZQUFZLE9BQU8sYUFBYTtBQUM5RCxRQUFJLGlCQUFpQjtBQUNwQixZQUFNLE9BQU8sRUFBRSxNQUFNO0FBQ3JCLFdBQUssVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxZQUFZLENBQUM7QUFDdEUsV0FBSyxhQUFhLGVBQWUsTUFBTTtBQUN2QyxZQUFNLFFBQVEsRUFBRSxxQ0FBcUMsUUFBVyxTQUFTLGlDQUFpQyxTQUFTLEdBQUcsSUFBSTtBQUMxSCxtQkFBYSxnQkFBZ0IsT0FBTztBQUFBLFFBQ25DO0FBQUEsUUFDQSxNQUFNLCtCQUErQixpQkFBaUIsS0FBSyxlQUFlLFdBQVcsRUFBRSxTQUFTO0FBQUEsUUFDaEcsT0FBTyxTQUFTLG1DQUFtQyxvRkFBb0Y7QUFBQSxNQUN4STtBQUNBLG1CQUFhLHlCQUF5QixNQUFNLFVBQVU7QUFBQSxJQUN2RDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLG1CQUFtQixPQUFpQyxPQUFlLGNBQWtEO0FBQzdILGlCQUFhLFVBQVUsSUFBSSxNQUFNLE9BQU8sTUFBUztBQUFBLEVBQ2xEO0FBQUEsRUFFUyxtQkFBbUIsT0FBNEIsT0FBZSxjQUFrRDtBQUN4SCxVQUFNLEVBQUUsT0FBTyxZQUFZLGlCQUFpQixJQUFJO0FBRWhELGlCQUFhLFdBQVcsTUFBTSxVQUFVO0FBQ3hDLGlCQUFhLGdCQUFnQixZQUFZO0FBQ3pDLFFBQUksV0FBVyxTQUFTLFlBQVk7QUFDbkMsbUJBQWEsZ0JBQWdCLFVBQVUsSUFBSSxHQUFHLFVBQVUsaUJBQWlCLFdBQVcsU0FBUyxVQUFVLENBQUM7QUFDeEcsbUJBQWEsZ0JBQWdCLE1BQU0sVUFBVTtBQUFBLElBQzlDLE9BQU87QUFDTixtQkFBYSxnQkFBZ0IsTUFBTSxVQUFVO0FBQUEsSUFDOUM7QUFFQSxpQkFBYSxVQUFVLElBQUksV0FBVyxTQUFTLE1BQU0sZ0JBQWdCO0FBRXJFLFVBQU0sV0FBVyxJQUFJLGVBQWUsSUFBSSxFQUFFLFdBQVcsTUFBTSxtQkFBbUIsS0FBSyxDQUFDO0FBQ3BGLGFBQVMsZUFBZSxLQUFLLE1BQU0sTUFBTSxTQUFTLElBQUksSUFBSTtBQUMxRCxRQUFJLE1BQU0sTUFBTSxTQUFTLE9BQU8sTUFBTSxNQUFNLFNBQVMsU0FBUztBQUM3RCxlQUFTLGVBQWUsMERBQTBELE1BQU0sTUFBTSxTQUFTLEVBQUUsUUFBUSxNQUFNLE1BQU0sU0FBUyxPQUFPLGdCQUFnQjtBQUFBLElBQzlKLE9BQU87QUFDTixlQUFTLGVBQWUsMERBQTBELE1BQU0sTUFBTSxTQUFTLEVBQUUsZ0JBQWdCO0FBQUEsSUFDMUg7QUFDQSxhQUFTLFdBQVc7QUFBQSxDQUFJO0FBRXhCLFFBQUksTUFBTSxNQUFNLFNBQVMsY0FBYyxNQUFNLE1BQU0sU0FBUyxTQUFTO0FBQ3BFLFVBQUksTUFBTSxNQUFNLFNBQVMsWUFBWTtBQUNwQyxpQkFBUyxlQUFlLEtBQUssTUFBTSxNQUFNLFNBQVMsV0FBVyxFQUFFLFNBQVM7QUFBQSxNQUN6RTtBQUNBLGVBQVMsZUFBZSxHQUFHLE1BQU0sTUFBTSxTQUFTLE9BQU8sRUFBRTtBQUN6RCxlQUFTLFdBQVc7QUFBQSxDQUFJO0FBQUEsSUFDekI7QUFFQSxpQkFBYSxtQkFBbUIsSUFBSSxLQUFLLGFBQWEseUJBQXlCLGFBQWEsV0FBWSxPQUFPO0FBQUEsTUFDOUcsU0FBUztBQUFBLE1BQ1QsWUFBWTtBQUFBLFFBQ1gsU0FBUztBQUFBLFFBQ1QscUJBQXFCO0FBQUEsTUFDdEI7QUFBQSxJQUNELEVBQUUsQ0FBQztBQUFBLEVBQ0o7QUFBQSxFQUVtQixvQkFBb0IsT0FBcUIsT0FBZSxjQUFrRDtBQUM1SCxpQkFBYSxXQUFXLE1BQU0sVUFBVTtBQUN4QyxpQkFBYSxXQUFXLFlBQVk7QUFDcEMsWUFBUSxNQUFNLFVBQVU7QUFBQSxNQUN2QixLQUFLLFNBQVM7QUFDYixxQkFBYSxVQUFVLFFBQVEsVUFBVSxJQUFJLGNBQWM7QUFDM0QscUJBQWEsV0FBVyxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixRQUFRLEtBQUssQ0FBQztBQUNsRjtBQUFBLE1BQ0QsS0FBSyxTQUFTO0FBQ2IscUJBQWEsVUFBVSxRQUFRLFVBQVUsSUFBSSxnQkFBZ0I7QUFDN0QscUJBQWEsV0FBVyxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixRQUFRLE9BQU8sQ0FBQztBQUNwRjtBQUFBLE1BQ0QsS0FBSyxTQUFTO0FBQ2IscUJBQWEsVUFBVSxRQUFRLFVBQVUsSUFBSSxhQUFhO0FBQzFELHFCQUFhLFdBQVcsVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxJQUFJLENBQUM7QUFDakY7QUFBQSxJQUNGO0FBQ0EsaUJBQWEsVUFBVSxJQUFJLE1BQU0sU0FBUyxRQUFXLE1BQU0sT0FBTztBQUFBLEVBQ25FO0FBQ0Q7QUEzSE0sd0JBQ1csY0FBYztBQUR6QiwwQkFBTjtBQUFBLEVBTUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUkc7QUFvSU4sSUFBTSw2QkFBTixjQUF5QywwQkFBMkQ7QUFBQSxFQUtuRyxZQUNpQyxjQUMvQjtBQUNELFVBQU07QUFGMEI7QUFIakMsU0FBUyxhQUFxQiwyQkFBMkI7QUFBQSxFQU16RDtBQUFBLEVBRUEsZUFBZSxXQUF5RDtBQUN2RSxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0MsVUFBTSxPQUFPLElBQUksT0FBTyxXQUFXLEVBQUUsa0JBQWtCLENBQUM7QUFDeEQsVUFBTSxZQUFZLElBQUksT0FBTyxNQUFNLEVBQUUsc0JBQXNCLENBQUM7QUFDNUQsVUFBTSxhQUFhLElBQUksT0FBTyxNQUFNLEVBQUUsc0JBQXNCLENBQUM7QUFDN0QsVUFBTSxnQkFBZ0IsSUFBSSxPQUFPLE1BQU0sRUFBRSxzQkFBc0IsQ0FBQztBQUNoRSxVQUFNLGlCQUFpQixJQUFJLE9BQU8sTUFBTSxFQUFFLHNCQUFzQixDQUFDO0FBQ2pFLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLGNBQWMsT0FBd0IsT0FBZSxjQUFxRDtBQUNsSCxpQkFBYSxVQUFVLGNBQWM7QUFDckMsaUJBQWEsV0FBVyxjQUFjO0FBQ3RDLGlCQUFhLGNBQWMsY0FBYztBQUN6QyxpQkFBYSxlQUFlLGNBQWM7QUFDMUMsVUFBTSxjQUFjLE9BQU8sT0FBTyxZQUFZO0FBQUEsRUFDL0M7QUFBQSxFQUVTLG1CQUFtQixVQUFvQyxRQUFnQixlQUFzRDtBQUFBLEVBQ3RJO0FBQUEsRUFFUyxvQkFBb0IsVUFBdUMsUUFBZ0IsZUFBc0Q7QUFBQSxFQUMxSTtBQUFBLEVBRVMsbUJBQW1CLE9BQTRCLE9BQWUsY0FBcUQ7QUFDM0gsVUFBTSxFQUFFLFdBQVcsWUFBWSxXQUFXLGVBQWUsSUFBSSxNQUFNLE1BQU07QUFDekUsVUFBTSxVQUFVLGNBQWMsVUFBYSxlQUFlLFVBQWEsY0FBYyxVQUFhLG1CQUFtQjtBQUVySCxRQUFJLFNBQVM7QUFDWixtQkFBYSxVQUFVLGNBQWMsY0FBYyxTQUFZLFNBQVMsY0FBYyxXQUFXLFNBQVMsSUFBSTtBQUM5RyxtQkFBYSxXQUFXLGNBQWMsZUFBZSxTQUFZLFNBQVMsZUFBZSxZQUFZLFVBQVUsSUFBSTtBQUNuSCxtQkFBYSxjQUFjLGNBQWMsY0FBYyxTQUFZLFNBQVMsa0JBQWtCLG1CQUFtQixTQUFTLElBQUk7QUFDOUgsbUJBQWEsZUFBZSxjQUFjLG1CQUFtQixTQUFZLFNBQVMsbUJBQW1CLG9CQUFvQixjQUFjLElBQUk7QUFFM0ksWUFBTSxRQUFrQixDQUFDO0FBQ3pCLFVBQUksY0FBYyxRQUFXO0FBQzVCLGNBQU0sS0FBSyxjQUFjLElBQ3RCLFNBQVMsNEJBQTRCLG1DQUFtQyxTQUFTLElBQ2pGLFNBQVMsMEJBQTBCLG9DQUFvQyxTQUFTLENBQUM7QUFBQSxNQUNyRjtBQUNBLFVBQUksZUFBZSxRQUFXO0FBQzdCLGNBQU0sS0FBSyxlQUFlLElBQ3ZCLFNBQVMsNkJBQTZCLG9DQUFvQyxVQUFVLElBQ3BGLFNBQVMsMkJBQTJCLHFDQUFxQyxVQUFVLENBQUM7QUFBQSxNQUN4RjtBQUNBLFVBQUksY0FBYyxRQUFXO0FBQzVCLGNBQU0sS0FBSyxjQUFjLElBQ3RCLFNBQVMsNEJBQTRCLHdDQUF3QyxTQUFTLElBQ3RGLFNBQVMsMEJBQTBCLHlDQUF5QyxTQUFTLENBQUM7QUFBQSxNQUMxRjtBQUNBLFVBQUksbUJBQW1CLFFBQVc7QUFDakMsY0FBTSxLQUFLLG1CQUFtQixJQUMzQixTQUFTLGlDQUFpQyx5Q0FBeUMsY0FBYyxJQUNqRyxTQUFTLCtCQUErQiwwQ0FBMEMsY0FBYyxDQUFDO0FBQUEsTUFDckc7QUFDQSxtQkFBYSxtQkFBbUIsSUFBSSxLQUFLLGFBQWEseUJBQXlCLGFBQWEsV0FBVyxPQUFPO0FBQUEsUUFDN0csU0FBUyxNQUFNLEtBQUssSUFBSTtBQUFBLFFBQ3hCLFlBQVk7QUFBQSxVQUNYLFNBQVM7QUFBQSxVQUNULHFCQUFxQjtBQUFBLFFBQ3RCO0FBQUEsTUFDRCxFQUFFLENBQUM7QUFBQSxJQUNKLE9BQU87QUFFTixZQUFNLGNBQWMsTUFBTSxNQUFNLFNBQVM7QUFDekMsVUFBSSxhQUFhO0FBQ2hCLHFCQUFhLFVBQVUsY0FBYztBQUNyQyxxQkFBYSxtQkFBbUIsSUFBSSxLQUFLLGFBQWEseUJBQXlCLGFBQWEsV0FBVyxPQUFPO0FBQUEsVUFDN0csU0FBUyxTQUFTLG1CQUFtQixnQkFBZ0IsV0FBVztBQUFBLFVBQ2hFLFlBQVk7QUFBQSxZQUNYLFNBQVM7QUFBQSxZQUNULHFCQUFxQjtBQUFBLFVBQ3RCO0FBQUEsUUFDRCxFQUFFLENBQUM7QUFBQSxNQUNKO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQWpHTSwyQkFDVyxjQUFjO0FBRHpCLDZCQUFOO0FBQUEsRUFNRztBQUFBLEdBTkc7QUF1R04sSUFBTSw0QkFBTixjQUF3QywwQkFBMEQ7QUFBQSxFQUtqRyxZQUNpQyxjQUMvQjtBQUNELFVBQU07QUFGMEI7QUFIakMsU0FBUyxhQUFxQiwwQkFBMEI7QUFBQSxFQU14RDtBQUFBLEVBRUEsZUFBZSxXQUF3RDtBQUN0RSxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0MsVUFBTSxxQkFBcUIsSUFBSSxPQUFPLFdBQVcsRUFBRSxxQkFBcUIsQ0FBQztBQUN6RSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUyxjQUFjLE9BQXdCLE9BQWUsY0FBb0Q7QUFDakgsUUFBSSxVQUFVLGFBQWEsa0JBQWtCO0FBQzdDLFVBQU0sY0FBYyxPQUFPLE9BQU8sWUFBWTtBQUFBLEVBQy9DO0FBQUEsRUFFUyxvQkFBb0IsT0FBb0MsT0FBZSxjQUFvRDtBQUFBLEVBQ3BJO0FBQUEsRUFFUyxtQkFBbUIsT0FBaUMsT0FBZSxjQUFvRDtBQUFBLEVBQ2hJO0FBQUEsRUFFUyxtQkFBbUIsT0FBNEIsT0FBZSxjQUFvRDtBQUMxSCxVQUFNLEVBQUUsT0FBTyxXQUFXLElBQUk7QUFDOUIsVUFBTSxXQUFXLElBQUksZUFBZSxJQUFJLEVBQUUsV0FBVyxNQUFNLG1CQUFtQixLQUFLLENBQUM7QUFDcEYsUUFBSSxXQUFXLFNBQVMsa0JBQWtCLFdBQVcsU0FBUyxpQkFBaUI7QUFDOUUsWUFBTSxlQUFlLFdBQVcsU0FBUyxrQkFBa0IsTUFBTSxXQUFXLFNBQVMsbUJBQW1CO0FBQ3hHLFlBQU0sV0FBVyxJQUFJLE9BQU8sYUFBYSxvQkFBb0IsRUFBRSxtQkFBbUIsQ0FBQztBQUNuRixZQUFNLFlBQVksSUFBSSxPQUFPLFVBQVUsRUFBRSxNQUFNLENBQUM7QUFDaEQsZ0JBQVUsY0FBYyxpQkFBaUIsV0FBVztBQUVwRCxlQUFTLGVBQWUsR0FBRyxTQUFTLHNCQUFzQixjQUFjLENBQUMsSUFBSTtBQUM3RSxlQUFTLGVBQWUsR0FBRyxpQkFBaUIsV0FBVyxDQUFDLEVBQUU7QUFBQSxJQUMzRDtBQUVBLGlCQUFhLG1CQUFtQixJQUFJLEtBQUssYUFBYSx5QkFBeUIsYUFBYSxXQUFXLE9BQU87QUFBQSxNQUM3RyxTQUFTO0FBQUEsTUFDVCxZQUFZO0FBQUEsUUFDWCxTQUFTO0FBQUEsUUFDVCxxQkFBcUI7QUFBQSxNQUN0QjtBQUFBLElBQ0QsRUFBRSxDQUFDO0FBQUEsRUFDSjtBQUNEO0FBdkRNLDBCQUNXLGNBQWM7QUFEekIsNEJBQU47QUFBQSxFQU1HO0FBQUEsR0FORztBQTZETixNQUFNLDhCQUFOLE1BQU0sb0NBQW1DLDBCQUFrRjtBQUFBLEVBQTNIO0FBQUE7QUFHQyxTQUFTLGFBQXFCLDRCQUEyQjtBQUV6RCxTQUFpQix3QkFBd0IsSUFBSSxRQUFnQjtBQUM3RCxTQUFTLHVCQUF1QixLQUFLLHNCQUFzQjtBQUFBO0FBQUEsRUFFM0QsVUFBZ0I7QUFDZixTQUFLLHNCQUFzQixRQUFRO0FBQUEsRUFDcEM7QUFBQSxFQUVBLGVBQWUsV0FBeUQ7QUFDdkUsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0scUJBQXFCLElBQUksZ0JBQWdCO0FBQy9DLGNBQVUsVUFBVSxJQUFJLHlCQUF5QjtBQUNqRCxVQUFNLGNBQWMsSUFBSSxPQUFPLFdBQVcsRUFBRSxxQkFBcUIsQ0FBQztBQUNsRSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUyxjQUFjLE9BQXdCLE9BQWUsY0FBcUQ7QUFDbEgsUUFBSSxVQUFVLGFBQWEsV0FBVztBQUN0QyxVQUFNLGNBQWMsT0FBTyxPQUFPLFlBQVk7QUFBQSxFQUMvQztBQUFBLEVBRVMsb0JBQW9CLE9BQW9DLE9BQWUsY0FBcUQ7QUFBQSxFQUNySTtBQUFBLEVBRVMsbUJBQW1CLE9BQWlDLE9BQWUsY0FBcUQ7QUFBQSxFQUNqSTtBQUFBLEVBRVMsbUJBQW1CLE9BQTRCLE9BQWUsY0FBcUQ7QUFDM0gsVUFBTSxFQUFFLE9BQU8sWUFBWSxrQkFBa0IsSUFBSTtBQUVqRCxRQUFJLFdBQVcsU0FBUyxjQUFjLGFBQWE7QUFDbEQsbUJBQWEsbUJBQW1CLElBQUksS0FBSztBQUFBLFFBQ3hDLGFBQWE7QUFBQSxRQUNiLG1CQUFtQixTQUFTLGFBQWEsS0FBSztBQUFBLFFBQzlDLFNBQVMsZ0JBQWdCLE9BQU87QUFBQSxRQUNoQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFFQSxRQUFJLFdBQVcsU0FBUyxjQUFjLFFBQVE7QUFDN0MsbUJBQWEsbUJBQW1CLElBQUksS0FBSztBQUFBLFFBQ3hDLGFBQWE7QUFBQSxRQUNiLG1CQUFtQixTQUFTLFFBQVEsS0FBSztBQUFBLFFBQ3pDLFNBQVMsaUJBQWlCLFFBQVE7QUFBQSxRQUNsQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUEsRUFFUSx1QkFBdUIsV0FBd0IsVUFBbUIsT0FBZSxZQUFpQztBQUN6SCxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxrQkFBa0IsSUFBSSxPQUFPLFdBQVcsRUFBRSx3QkFBd0IsQ0FBQztBQUN6RSxVQUFNLFNBQVMsWUFBWSxJQUFJLElBQUksT0FBTyxpQkFBaUIsRUFBRSxXQUFXLEtBQUssQ0FBQyxDQUFDO0FBQy9FLFdBQU8sUUFBUSxVQUFVLElBQUksa0JBQWtCO0FBQy9DLFdBQU8sUUFBUSxVQUFVLE9BQU8sVUFBVSxRQUFRO0FBQ2xELFdBQU8sUUFBUTtBQUNmLGdCQUFZLElBQUksT0FBTyxXQUFXLE1BQU0sS0FBSyxzQkFBc0IsS0FBSyxVQUFVLENBQUMsQ0FBQztBQUNwRixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBcEVNLDRCQUNXLGNBQWM7QUFEL0IsSUFBTSw2QkFBTjtBQTBFQSxTQUFTLDJCQUNSLFdBQ0EsUUFDQSxXQUNBLHVCQUNBLGVBQ1k7QUFDWixRQUFNLGdCQUFnQixPQUFPO0FBQzdCLE1BQUksQ0FBQyxlQUFlO0FBQ25CLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFFQSxRQUFNLFVBQXFCLENBQUM7QUFDNUIsUUFBTSwwQkFBMEIsY0FBYztBQUM5QyxVQUFRLEtBQUssU0FBUztBQUFBLElBQ3JCLElBQUk7QUFBQSxJQUNKLE9BQU8sU0FBUyx1QkFBdUIsZ0NBQWdDO0FBQUEsSUFDdkUsS0FBSyxNQUFNLHNCQUFzQix3Q0FBd0MsT0FBTyxRQUFRLFNBQVM7QUFBQSxFQUNsRyxDQUFDLENBQUM7QUFDRixVQUFRLEtBQUssSUFBSSxVQUFVLENBQUM7QUFDNUIsVUFBUSxLQUFLLFNBQVM7QUFBQSxJQUNyQixJQUFJO0FBQUEsSUFDSixPQUFPLFNBQVMsc0JBQXNCLGNBQWM7QUFBQSxJQUNwRCxLQUFLLE1BQU0sc0JBQXNCLGtDQUFrQyxPQUFPLFFBQVEsU0FBUztBQUFBLEVBQzVGLENBQUMsQ0FBQztBQUNGLE1BQUkseUJBQXlCLFFBQVE7QUFDcEMsWUFBUSxLQUFLLFNBQVM7QUFBQSxNQUNyQixJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsdUJBQXVCLGdCQUFnQjtBQUFBLE1BQ3ZELEtBQUssTUFBTSxzQkFBc0Isd0NBQXdDLE9BQU8sUUFBUSxTQUFTO0FBQUEsSUFDbEcsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNBLE1BQUkseUJBQXlCLFFBQVEsa0JBQWtCLENBQUMsR0FBRztBQUMxRCxZQUFRLEtBQUssU0FBUztBQUFBLE1BQ3JCLElBQUk7QUFBQSxNQUNKLE9BQU8sU0FBUyxtQkFBbUIsV0FBVztBQUFBLE1BQzlDLEtBQUssTUFBTSxzQkFBc0Isb0NBQW9DLE9BQU8sUUFBUSxTQUFTO0FBQUEsSUFDOUYsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNBLFVBQVEsS0FBSyxJQUFJLFVBQVUsQ0FBQztBQUM1QixVQUFRLEtBQUssU0FBUztBQUFBLElBQ3JCLElBQUk7QUFBQSxJQUNKLE9BQU8sU0FBUyx1QkFBdUIsUUFBUTtBQUFBLElBQy9DLE9BQU8sVUFBVSxZQUFZLFFBQVEsS0FBSztBQUFBLElBQzFDLEtBQUssWUFBWTtBQUNoQixZQUFNLFNBQVMsTUFBTSxjQUFjLFFBQVE7QUFBQSxRQUMxQyxNQUFNO0FBQUEsUUFDTixTQUFTLFNBQVMsNkJBQTZCLGlDQUFpQyxTQUFTO0FBQUEsTUFDMUYsQ0FBQztBQUNELFVBQUksQ0FBQyxPQUFPLFdBQVc7QUFDdEI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxzQkFBc0Isa0NBQWtDLE9BQU8sUUFBUSxTQUFTO0FBQ3RGLGdCQUFVLFFBQVE7QUFBQSxJQUNuQjtBQUFBLEVBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBTztBQUNSO0FBRUEsSUFBTSx3QkFBTixjQUFvQywwQkFBc0Q7QUFBQSxFQUt6RixZQUNrQixXQUN1QixzQkFDQyx1QkFDUixlQUNDLGdCQUNJLG9CQUNyQztBQUNELFVBQU07QUFQVztBQUN1QjtBQUNDO0FBQ1I7QUFDQztBQUNJO0FBUnZDLFNBQVMsYUFBcUIsc0JBQXNCO0FBQUEsRUFXcEQ7QUFBQSxFQUVBLGVBQWUsV0FBb0Q7QUFDbEUsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFVBQU0scUJBQXFCLElBQUksZ0JBQWdCO0FBQy9DLGNBQVUsVUFBVSxJQUFJLHVCQUF1QjtBQUMvQyxVQUFNLFNBQVMsSUFBSSxPQUFPLFdBQVcsRUFBRSxvQkFBb0IsQ0FBQztBQUM1RCxVQUFNLFlBQVksWUFBWSxJQUFJLEtBQUsscUJBQXFCO0FBQUEsTUFBZTtBQUFBLE1BQzFFO0FBQUEsTUFDQSxLQUFLO0FBQUEsTUFDTDtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLFFBQ1AsVUFBVSxRQUFRO0FBQUEsUUFDbEIseUJBQXlCLE1BQU0sZ0JBQWdCO0FBQUEsTUFDaEQ7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUyxjQUFjLE9BQXdCLE9BQWUsY0FBZ0Q7QUFDN0csaUJBQWEsVUFBVSxXQUFXLENBQUMsQ0FBQztBQUNwQyxVQUFNLGNBQWMsT0FBTyxPQUFPLFlBQVk7QUFBQSxFQUMvQztBQUFBLEVBRVMsb0JBQW9CLE9BQW9DLE9BQWUsY0FBZ0Q7QUFDL0gsVUFBTSxFQUFFLFlBQVksSUFBSTtBQUN4QixVQUFNLGlCQUE0QixDQUFDO0FBQ25DLFVBQU0sbUJBQThCLENBQUM7QUFDckMsUUFBSSxZQUFZLE9BQU8sZUFBZTtBQUNyQyx1QkFBaUIsS0FBSyxHQUFHLDJCQUEyQixLQUFLLFdBQVcsWUFBWSxRQUFRLFlBQVksTUFBTSxNQUFNLEtBQUssdUJBQXVCLEtBQUssYUFBYSxDQUFDO0FBQUEsSUFDaEssV0FBVyxZQUFZLE9BQU8sbUJBQW1CO0FBQ2hELHFCQUFlLEtBQUssU0FBUztBQUFBLFFBQzVCLElBQUk7QUFBQSxRQUNKLE9BQU8sU0FBUyx5QkFBeUIsaUJBQWlCLFlBQVksTUFBTSxJQUFJO0FBQUEsUUFDaEYsT0FBTyxVQUFVLFlBQVksUUFBUSxJQUFJO0FBQUEsUUFDekMsS0FBSyxZQUFZO0FBQ2hCLGdCQUFNLEtBQUssZUFBZSxlQUFlLFlBQVksT0FBTyxtQkFBb0IsWUFBWSxPQUFPLE1BQU07QUFDekcsZUFBSyxVQUFVLFFBQVE7QUFBQSxRQUN4QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUNBLGlCQUFhLFVBQVUsV0FBVyxnQkFBZ0IsZ0JBQWdCO0FBQUEsRUFDbkU7QUFBQSxFQUVTLG1CQUFtQixPQUFpQyxPQUFlLGNBQWdEO0FBQUEsRUFDNUg7QUFBQSxFQUVTLG1CQUFtQixPQUE0QixPQUFlLGNBQWdEO0FBQ3RILFVBQU0saUJBQTRCLENBQUM7QUFHbkMsUUFBSSxNQUFNLE1BQU0sU0FBUyxPQUFPLFFBQVE7QUFDdkMscUJBQWUsS0FBSyxLQUFLLGdCQUFnQixNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQUEsSUFDakU7QUFFQSxVQUFNLGdCQUFnQixLQUFLLHNCQUFzQiw2QkFBNkIsTUFBTSxNQUFNLFVBQVU7QUFDcEcsVUFBTSxtQkFBOEIsQ0FBQyxHQUFHLGFBQWE7QUFNckQsVUFBTSxTQUFTLE1BQU0sTUFBTSxTQUFTO0FBQ3BDLFFBQUksQ0FBQyxPQUFPLGFBQWEsQ0FBQyxPQUFPLHNCQUFzQixjQUFjLFNBQVMsS0FBSyxNQUFNLE1BQU0sU0FBUyxzQkFBc0I7QUFDN0gsdUJBQWlCLEtBQUssU0FBUztBQUFBLFFBQzlCLElBQUk7QUFBQSxRQUNKLE9BQU8sU0FBUyx5QkFBeUIsY0FBYztBQUFBLFFBQ3ZELEtBQUssTUFBTSxLQUFLLHNCQUFzQixlQUFlLE1BQU0sTUFBTSxVQUFVO0FBQUEsTUFDNUUsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLGlCQUFhLFVBQVUsV0FBVyxnQkFBZ0IsZ0JBQWdCO0FBQUEsRUFDbkU7QUFBQSxFQUVRLGdCQUFnQixpQkFBa0M7QUFDekQsVUFBTSxXQUFXLEtBQUssc0JBQXNCLGNBQWMsZUFBZTtBQUN6RSxXQUFPLFNBQVM7QUFBQSxNQUNmLElBQUksV0FBVyxTQUFTLGVBQWUsS0FBSyxPQUFPLGVBQWU7QUFBQSxNQUNsRSxPQUFPLFdBQ0osU0FBUyxxQkFBcUIsYUFBYSxJQUMzQyxTQUFTLG1CQUFtQixXQUFXO0FBQUEsTUFDMUMsT0FBTyxVQUFVLFlBQVksV0FBVyxRQUFRLFNBQVMsUUFBUSxHQUFHO0FBQUEsTUFDcEUsS0FBSyxNQUFNO0FBQ1YsWUFBSSxVQUFVO0FBQ2IsZUFBSyxzQkFBc0IsV0FBVyxlQUFlO0FBQUEsUUFDdEQsT0FBTztBQUNOLGVBQUssc0JBQXNCLFNBQVMsZUFBZTtBQUFBLFFBQ3BEO0FBQ0EsYUFBSyxVQUFVLFFBQVE7QUFBQSxNQUN4QjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWhITSxzQkFDVyxjQUFjO0FBRHpCLHdCQUFOO0FBQUEsRUFPRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVhHO0FBc0hOLE1BQU0sMEJBQU4sTUFBTSxnQ0FBK0IsMEJBQXVEO0FBQUEsRUFBNUY7QUFBQTtBQUdDLFNBQVMsYUFBcUIsd0JBQXVCO0FBQUE7QUFBQSxFQUVyRCxlQUFlLFdBQXFEO0FBQ25FLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLHFCQUFxQixJQUFJLGdCQUFnQjtBQUMvQyxVQUFNLGtCQUFrQixJQUFJLE9BQU8sV0FBVyxFQUFFLGlCQUFpQixDQUFDO0FBQ2xFLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLG9CQUFvQixPQUFvQyxPQUFlLGNBQWlEO0FBQ2hJLGlCQUFhLGdCQUFnQixjQUFjO0FBQUEsRUFDNUM7QUFBQSxFQUVTLG1CQUFtQixPQUFpQyxPQUFlLGNBQWlEO0FBQzVILGlCQUFhLGdCQUFnQixjQUFjO0FBQUEsRUFDNUM7QUFBQSxFQUVTLG1CQUFtQixPQUE0QixPQUFlLGNBQWlEO0FBQ3ZILGlCQUFhLGdCQUFnQixjQUFjLE1BQU0sTUFBTSxTQUFTLE9BQU87QUFBQSxFQUN4RTtBQUNEO0FBNUJNLHdCQUNXLGNBQWM7QUFEL0IsSUFBTSx5QkFBTjtBQWtDTyxJQUFNLG1CQUFOLGNBQStCLFdBQVc7QUFBQSxFQTJCaEQsWUFDMEMsdUJBQ0Qsc0JBQ0osa0JBQ0Usb0JBQ0ksd0JBQ0QsdUJBQ1AsZ0JBQ0sscUJBQ0YsbUJBQ0osZUFDYSw0QkFDQyxvQkFDOUM7QUFDRCxVQUFNO0FBYm1DO0FBQ0Q7QUFDSjtBQUNFO0FBQ0k7QUFDRDtBQUNQO0FBQ0s7QUFDRjtBQUNKO0FBQ2E7QUFDQztBQWpDaEQsU0FBaUIsd0JBQXdCLEtBQUssVUFBVSxJQUFJLFFBQWdCLENBQUM7QUFDN0UsU0FBUyx1QkFBdUIsS0FBSyxzQkFBc0I7QUFTM0QsU0FBUSxnQkFBd0I7QUFHaEMsU0FBUSxrQkFBNkIsQ0FBQztBQU10QyxTQUFpQixtQkFBbUIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFrQnZFLFNBQUssd0JBQXdCLDRCQUE0QixPQUFPLEtBQUssaUJBQWlCO0FBQ3RGLFNBQUssbUJBQW1CLEtBQUssVUFBVSxJQUFJLFFBQWMsR0FBRyxDQUFDO0FBQzdELFNBQUssWUFBWSxLQUFLLFVBQVUsS0FBSyxxQkFBcUIsZUFBZSxtQkFBbUIsQ0FBQztBQUM3RixTQUFLLFVBQVUsSUFBSSxFQUFFLGdCQUFnQjtBQUNyQyxTQUFLLE9BQU8sS0FBSyxPQUFPO0FBRXhCLFVBQU0saUJBQWlCLEtBQUssaUJBQWlCLGtDQUFrQyxFQUFFLEtBQUssTUFBTSxLQUFLLFVBQVUsUUFBUSxDQUFDO0FBQ3BILFNBQUssc0JBQXNCLFVBQVUsZ0JBQWdCLEdBQUc7QUFBQSxFQUN6RDtBQUFBLEVBRVEsT0FBTyxXQUE4QjtBQUM1QyxVQUFNLDJCQUEyQixJQUFJLE9BQU8sV0FBVyxFQUFFLHFDQUFxQyxDQUFDO0FBRS9GLFVBQU0sY0FBYyxTQUFTLG9DQUFvQyxtQkFBbUI7QUFDcEYsVUFBTSxrQkFBa0IsSUFBSSxPQUFPLDBCQUEwQixFQUFFLDBCQUEwQixDQUFDO0FBQzFGLFNBQUssZUFBZSxLQUFLLFVBQVUsS0FBSyxxQkFBcUI7QUFBQSxNQUM1RDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsbUJBQW1CLENBQUMsS0FBSyxHQUFHO0FBQUEsUUFDNUIsZ0JBQWdCLENBQUMsVUFBa0I7QUFDbEMsZ0JBQU0sc0JBQXNCLEtBQUssVUFBVSxXQUFXLEVBQUUsSUFBSSxPQUFLLGNBQWMsRUFBRSxXQUFXLEdBQUc7QUFDL0YsZ0JBQU0saUJBQWlCO0FBQUEsWUFDdEIsR0FBRztBQUFBLFlBQ0gsR0FBRyxtQkFBbUI7QUFBQSxVQUN2QjtBQUNBLGNBQUksQ0FBQyxNQUFNLEtBQUssR0FBRztBQUNsQixtQkFBTztBQUFBLFVBQ1I7QUFDQSxnQkFBTSxhQUFhLE1BQU0sTUFBTSxLQUFLO0FBQ3BDLGdCQUFNLFdBQVcsV0FBVyxXQUFXLFNBQVMsQ0FBQztBQUNqRCxjQUFJLFNBQVMsV0FBVyxZQUFZLEdBQUc7QUFDdEMsbUJBQU87QUFBQSxVQUNSLFdBQVcsU0FBUyxXQUFXLGNBQWMsR0FBRztBQUMvQyxtQkFBTyxtQkFBbUI7QUFBQSxVQUMzQixXQUFXLFNBQVMsV0FBVyxHQUFHLEdBQUc7QUFDcEMsbUJBQU87QUFBQSxVQUNSO0FBQ0EsaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLE1BQ0EsZ0NBQWdDLGlCQUFpQixlQUFlO0FBQUEsTUFDaEU7QUFBQSxRQUNDLGlCQUFpQjtBQUFBLFFBQ2pCLGdCQUFnQjtBQUFBLFVBQ2YsYUFBYTtBQUFBLFFBQ2Q7QUFBQSxRQUNBLGlCQUFpQixLQUFLO0FBQUEsTUFDdkI7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLGVBQWUsS0FBSyxVQUFVLElBQUksbUJBQW1CLENBQUM7QUFDNUQsVUFBTSxvQkFBb0IsS0FBSyxVQUFVLElBQUk7QUFBQSxNQUM1QztBQUFBLE1BQ0EsU0FBUyxlQUFlLGNBQWM7QUFBQSxNQUN0QyxVQUFVLFlBQVkseUJBQXlCO0FBQUEsTUFDL0M7QUFBQSxNQUNBLE1BQU0sS0FBSyxZQUFZO0FBQUEsSUFDeEIsQ0FBQztBQUNELFVBQU0sb0JBQW9CLEtBQUssVUFBVSxJQUFJO0FBQUEsTUFDNUM7QUFBQSxNQUNBLFNBQVMsZUFBZSxjQUFjO0FBQUEsTUFDdEMsVUFBVSxZQUFZLFFBQVEsV0FBVztBQUFBLE1BQ3pDO0FBQUEsTUFDQSxNQUFNO0FBQ0wsYUFBSyxVQUFVLFlBQVk7QUFBQSxNQUM1QjtBQUFBLElBQ0QsQ0FBQztBQUNELHNCQUFrQixVQUFVLEtBQUssVUFBVSxpQkFBaUIsS0FBSyxPQUFLLDBCQUEwQixDQUFDLEtBQUssNkJBQTZCLENBQUMsQ0FBQztBQUNySSxTQUFLLFVBQVUsS0FBSyxVQUFVLFlBQVksTUFBTSxrQkFBa0IsVUFBVSxLQUFLLFVBQVUsaUJBQWlCLEtBQUssT0FBSyw2QkFBNkIsQ0FBQyxLQUFLLDBCQUEwQixDQUFDLENBQUMsQ0FBQyxDQUFDO0FBRXZMLFNBQUssVUFBVSxLQUFLLGFBQWEsaUJBQWlCLE1BQU07QUFDdkQsd0JBQWtCLFVBQVUsQ0FBQyxDQUFDLEtBQUssYUFBYSxTQUFTO0FBQ3pELFdBQUssYUFBYTtBQUFBLElBQ25CLENBQUMsQ0FBQztBQUVGLFNBQUsseUJBQXlCLElBQUksT0FBTyxpQkFBaUIsRUFBRSx3QkFBd0IsQ0FBQztBQUNyRixVQUFNLFVBQVUsQ0FBQyxtQkFBbUIsbUJBQW1CLFlBQVk7QUFDbkUsVUFBTSxVQUFVLEtBQUssVUFBVSxJQUFJLFFBQVEsS0FBSyx3QkFBd0IsS0FBSyxvQkFBb0I7QUFBQSxNQUNoRyx3QkFBd0IsQ0FBQyxRQUFpQixZQUFvQztBQUM3RSxZQUFJLE9BQU8sT0FBTyxhQUFhLElBQUk7QUFDbEMsaUJBQU8sS0FBSyxxQkFBcUIsZUFBZSw4Q0FBOEMsUUFBUSxTQUFTO0FBQUEsWUFDOUcsVUFBVSxNQUFNLEtBQUssYUFBYSxTQUFTO0FBQUEsWUFDM0MsVUFBVSxDQUFDLGdCQUFnQixLQUFLLE9BQU8sV0FBVztBQUFBLFVBQ25ELEdBQUcsS0FBSyxTQUFTO0FBQUEsUUFDbEI7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsZUFBZSxNQUFNO0FBQUEsSUFDdEIsQ0FBQyxDQUFDO0FBQ0YsWUFBUSxXQUFXLE9BQU87QUFHMUIsU0FBSyxhQUFhLFlBQVksb0JBQW9CLEVBQUUsTUFBTSxlQUFlLEdBQUcsSUFBSSxjQUFjLEtBQUssc0JBQXNCLElBQUksRUFBRTtBQUUvSCxTQUFLLHFCQUFxQixJQUFJLE9BQU8sMEJBQTBCLEVBQUUsd0JBQXdCLENBQUM7QUFDMUYsVUFBTSxnQkFBZ0M7QUFBQSxNQUNyQyxHQUFHO0FBQUEsTUFDSCxjQUFjO0FBQUEsSUFDZjtBQUVBLFNBQUssWUFBWSxLQUFLLFVBQVUsSUFBSSxPQUFPLEtBQUssb0JBQW9CLGFBQWEsQ0FBQztBQUNsRixTQUFLLFVBQVUsUUFBUSxLQUFLLFFBQVEsSUFBSSxFQUFFLEtBQUssU0FBUyw4QkFBOEIsWUFBWSxDQUFDO0FBQ25HLFNBQUssVUFBVSxRQUFRLFVBQVUsSUFBSSx5QkFBeUI7QUFDOUQsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSyxVQUFVLEtBQUssVUFBVSxXQUFXLENBQUMsTUFBTTtBQUMvQyxVQUFJLEtBQUssZ0JBQWdCLFNBQVMsR0FBRztBQUNwQyxhQUFLLG1CQUFtQixnQkFBZ0I7QUFBQSxVQUN2QyxXQUFXLE1BQU0sS0FBSyxVQUFVO0FBQUEsVUFDaEMsWUFBWSxNQUFNLEtBQUs7QUFBQSxRQUN4QixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBSUYsUUFBSSxDQUFDLEtBQUssbUJBQW1CLGtCQUFrQjtBQUM5QyxZQUFNLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxPQUFPLEtBQUssb0JBQW9CO0FBQUEsUUFDbEYsR0FBRztBQUFBLFFBQ0gsV0FBVztBQUFBLE1BQ1osQ0FBQyxDQUFDO0FBQ0YsOEJBQXdCLFFBQVEsS0FBSyxRQUFRLFdBQVcsRUFBRSxLQUFLLFNBQVMsb0NBQW9DLHlCQUF5QixDQUFDO0FBQ3RJLDhCQUF3QixRQUFRLFVBQVUsSUFBSSxrQ0FBa0M7QUFDaEYsV0FBSyxVQUFVLHdCQUF3QixXQUFXLE1BQU0sS0FBSywwQ0FBMEMsQ0FBQyxDQUFDO0FBQUEsSUFDMUc7QUFHQSxTQUFLLGlCQUFpQixJQUFJLE9BQU8sV0FBVyxFQUFFLHlCQUF5QixDQUFDO0FBR3hFLFNBQUssWUFBWTtBQUNqQixTQUFLLFVBQVUsS0FBSyxVQUFVLG9CQUFvQixNQUFNLEtBQUssWUFBWSxDQUFDLENBQUM7QUFDM0UsU0FBSyxVQUFVLEtBQUssdUJBQXVCLHVCQUF1QixNQUFNO0FBQ3ZFLFdBQUssc0JBQXNCO0FBQzNCLFdBQUssWUFBWTtBQUFBLElBQ2xCLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLHVCQUF1Qiw2QkFBNkIsTUFBTSxLQUFLLFlBQVksQ0FBQyxDQUFDO0FBQ2pHLFNBQUssVUFBVSxLQUFLLHNCQUFzQixnQ0FBZ0MsTUFBTSxLQUFLLHNCQUFzQixDQUFDLENBQUM7QUFDN0csU0FBSyxVQUFVLEtBQUssc0JBQXNCLHdCQUF3QixNQUFNLEtBQUssVUFBVSxRQUFRLENBQUMsQ0FBQztBQUNqRyxTQUFLLFVBQVUsS0FBSyxrQkFBa0IsbUJBQW1CLE9BQUs7QUFDN0QsVUFBSSxFQUFFLFlBQVksb0JBQUksSUFBSSxDQUFDLGtDQUFrQyxDQUFDLENBQUMsR0FBRztBQUNqRSxhQUFLLHNCQUFzQjtBQUFBLE1BQzVCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxjQUFvQjtBQUMzQixTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFFBQUksVUFBVSxLQUFLLGNBQWM7QUFFakMsU0FBSyxnQkFBZ0IsRUFBRSx3QkFBd0I7QUFDL0MsU0FBSyxhQUFhLElBQUksT0FBTyxLQUFLLGVBQWUsRUFBRSxxQkFBcUIsQ0FBQztBQUN6RSxTQUFLLGtCQUFrQixLQUFLLGlCQUFpQixJQUFJLElBQUkscUJBQXFCLEtBQUssZUFBZTtBQUFBLE1BQzdGLFlBQVksb0JBQW9CO0FBQUEsTUFDaEMsVUFBVSxvQkFBb0I7QUFBQSxNQUM5QixZQUFZO0FBQUEsTUFDWixZQUFZO0FBQUEsSUFDYixDQUFDLENBQUM7QUFDRixTQUFLLGVBQWUsWUFBWSxLQUFLLGdCQUFnQixXQUFXLENBQUM7QUFFakUsVUFBTSx1QkFBdUIsS0FBSyxxQkFBcUIsZUFBZSxzQkFBc0IsS0FBSyxTQUFTO0FBQzFHLFVBQU0sMEJBQTBCLEtBQUsscUJBQXFCLGVBQWUsdUJBQXVCO0FBQ2hHLFVBQU0sNkJBQTZCLEtBQUsscUJBQXFCLGVBQWUsMEJBQTBCO0FBQ3RHLFVBQU0sNEJBQTRCLEtBQUsscUJBQXFCLGVBQWUseUJBQXlCO0FBQ3BHLFVBQU0sNkJBQTZCLEtBQUsscUJBQXFCLGVBQWUsMEJBQTBCO0FBQ3RHLFVBQU0sd0JBQXdCLEtBQUsscUJBQXFCLGVBQWUsdUJBQXVCLEtBQUssU0FBUztBQUM1RyxVQUFNLHlCQUF5QixLQUFLLHFCQUFxQixlQUFlLHNCQUFzQjtBQUU5RixTQUFLLGlCQUFpQixJQUFJLDBCQUEwQjtBQUNwRCxTQUFLLGlCQUFpQixJQUFJLDJCQUEyQixxQkFBcUIsZ0JBQWM7QUFDdkYsWUFBTSxlQUFlLEtBQUssYUFBYSxTQUFTO0FBQ2hELFlBQU0sUUFBUSxlQUFlLFVBQVU7QUFDdkMsWUFBTSxXQUFXLGFBQWEsY0FBYyxFQUFFLE1BQU0sQ0FBQztBQUNyRCxXQUFLLE9BQU8sUUFBUTtBQUFBLElBQ3JCLENBQUMsQ0FBQztBQUVGLFVBQU0sVUFBVTtBQUFBLE1BQ2Y7QUFBQSxRQUNDLE9BQU87QUFBQSxRQUNQLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxRQUNkLGNBQWM7QUFBQSxRQUNkLFlBQVkscUJBQXFCO0FBQUEsUUFDakMsUUFBUSxLQUF1QztBQUFFLGlCQUFPO0FBQUEsUUFBSztBQUFBLE1BQzlEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxTQUFTLGFBQWEsTUFBTTtBQUFBLFFBQ25DLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxRQUNkLFlBQVksd0JBQXdCO0FBQUEsUUFDcEMsUUFBUSxLQUF1QztBQUFFLGlCQUFPO0FBQUEsUUFBSztBQUFBLE1BQzlEO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxLQUFLLHVCQUF1QixPQUFPLHNCQUFzQjtBQUN2RSxZQUFRO0FBQUEsTUFDUDtBQUFBLFFBQ0MsT0FBTyxTQUFTLGVBQWUsY0FBYztBQUFBLFFBQzdDLFNBQVM7QUFBQSxRQUNULFFBQVE7QUFBQSxRQUNSLGNBQWM7QUFBQSxRQUNkLFlBQVksMEJBQTBCO0FBQUEsUUFDdEMsUUFBUSxLQUF1QztBQUFFLGlCQUFPO0FBQUEsUUFBSztBQUFBLE1BQzlEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTyxTQUFTLGdCQUFnQixjQUFjO0FBQUEsUUFDOUMsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsWUFBWSwyQkFBMkI7QUFBQSxRQUN2QyxRQUFRLEtBQXVDO0FBQUUsaUJBQU87QUFBQSxRQUFLO0FBQUEsTUFDOUQ7QUFBQSxNQUNBO0FBQUEsUUFDQyxPQUFPLFFBQVEsU0FBUyxRQUFRLDhCQUE4QixJQUFJLFNBQVMsV0FBVyxTQUFTO0FBQUEsUUFDL0YsU0FBUztBQUFBLFFBQ1QsUUFBUSxRQUFRLE9BQU87QUFBQSxRQUN2QixjQUFjLFFBQVEsTUFBTTtBQUFBLFFBQzVCLFlBQVksMkJBQTJCO0FBQUEsUUFDdkMsUUFBUSxLQUF1QztBQUFFLGlCQUFPO0FBQUEsUUFBSztBQUFBLE1BQzlEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsT0FBTztBQUFBLFFBQ1AsU0FBUztBQUFBLFFBQ1QsUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLFFBQ2QsY0FBYztBQUFBLFFBQ2QsWUFBWSxzQkFBc0I7QUFBQSxRQUNsQyxRQUFRLEtBQXVDO0FBQUUsaUJBQU87QUFBQSxRQUFLO0FBQUEsTUFDOUQ7QUFBQSxJQUNEO0FBRUEsU0FBSyxnQkFBZ0IsUUFBUSxPQUFPLENBQUMsS0FBSyxNQUFNLE1BQU0sRUFBRSxjQUFjLENBQUM7QUFDdkUsU0FBSyxXQUFXLE1BQU0sV0FBVyxHQUFHLEtBQUssYUFBYTtBQUV0RCxTQUFLLFFBQVEsS0FBSyxpQkFBaUIsSUFBSSxLQUFLLHFCQUFxQjtBQUFBLE1BQ2hFO0FBQUEsTUFDQTtBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0wsSUFBSSxTQUFTO0FBQUEsTUFDYjtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxRQUNDLGtCQUFrQixFQUFFLE9BQU8sQ0FBQyxNQUF1QixFQUFFLEdBQUc7QUFBQSxRQUN4RCxxQkFBcUI7QUFBQSxRQUNyQix1QkFBdUI7QUFBQSxVQUN0QixjQUFjLENBQUMsTUFBdUI7QUFDckMsZ0JBQUksNkJBQTZCLENBQUMsR0FBRztBQUNwQyxxQkFBTyxFQUFFLFNBQ04sU0FBUywyQkFBMkIsdUJBQXVCLEVBQUUsWUFBWSxNQUFNLElBQUksSUFDbkYsU0FBUyxvQkFBb0IsY0FBYyxFQUFFLFlBQVksTUFBTSxJQUFJO0FBQUEsWUFDdkUsV0FBVywwQkFBMEIsQ0FBQyxHQUFHO0FBQ3hDLHFCQUFPLEVBQUUsT0FBTyxZQUFZLFNBQVMscUJBQXFCLGdCQUFnQixJQUFJLFNBQVMsb0JBQW9CLGVBQWU7QUFBQSxZQUMzSCxXQUFXLGNBQWMsQ0FBQyxHQUFHO0FBQzVCLHFCQUFPLFNBQVMsb0JBQW9CLGVBQWUsRUFBRSxPQUFPO0FBQUEsWUFDN0Q7QUFDQSxrQkFBTSxhQUFhLENBQUM7QUFDcEIsdUJBQVcsS0FBSyxFQUFFLE1BQU0sU0FDckIsU0FBUyxxQkFBcUIseUJBQXlCLEVBQUUsTUFBTSxTQUFTLE1BQU0sRUFBRSxNQUFNLFNBQVMsT0FBTyxXQUFXLElBQ2pILFNBQVMsY0FBYyxnQkFBZ0IsRUFBRSxNQUFNLFNBQVMsTUFBTSxFQUFFLE1BQU0sU0FBUyxPQUFPLFdBQVcsQ0FBQztBQUNyRyxnQkFBSSxFQUFFLE1BQU0sU0FBUyxrQkFBa0IsRUFBRSxNQUFNLFNBQVMsaUJBQWlCO0FBQ3hFLG9CQUFNLGVBQWUsRUFBRSxNQUFNLFNBQVMsa0JBQWtCLE1BQU0sRUFBRSxNQUFNLFNBQVMsbUJBQW1CO0FBQ2xHLHlCQUFXLEtBQUssU0FBUyxpQ0FBaUMsNEJBQTRCLGlCQUFpQixXQUFXLENBQUMsQ0FBQztBQUFBLFlBQ3JIO0FBQ0EsZ0JBQUksRUFBRSxNQUFNLFNBQVMsY0FBYztBQUNsQyx5QkFBVyxLQUFLLFNBQVMsc0JBQXNCLHFCQUFxQixPQUFPLEtBQUssRUFBRSxNQUFNLFNBQVMsWUFBWSxFQUFFLEtBQUssSUFBSSxDQUFDLENBQUM7QUFBQSxZQUMzSDtBQUNBLGtCQUFNLGNBQWMsRUFBRSxNQUFNLFNBQVMsV0FBVztBQUNoRCxnQkFBSSxnQkFBZ0IsS0FBSztBQUN4Qix5QkFBVyxLQUFLLFNBQVMscUJBQXFCLGdCQUFnQixXQUFXLENBQUM7QUFBQSxZQUMzRTtBQUNBLGdCQUFJLEVBQUUsTUFBTSxTQUFTLGNBQWMsUUFBVztBQUM3Qyx5QkFBVyxLQUFLLEVBQUUsTUFBTSxTQUFTLGNBQWMsSUFDNUMsU0FBUyxnQ0FBZ0Msd0NBQXdDLEVBQUUsTUFBTSxTQUFTLFNBQVMsSUFDM0csU0FBUyw4QkFBOEIseUNBQXlDLEVBQUUsTUFBTSxTQUFTLFNBQVMsQ0FBQztBQUFBLFlBQy9HO0FBQ0EsZ0JBQUksRUFBRSxNQUFNLFNBQVMsY0FBYyxRQUFXO0FBQzdDLHlCQUFXLEtBQUssRUFBRSxNQUFNLFNBQVMsY0FBYyxJQUM1QyxTQUFTLGdDQUFnQyw2Q0FBNkMsRUFBRSxNQUFNLFNBQVMsU0FBUyxJQUNoSCxTQUFTLDhCQUE4Qiw4Q0FBOEMsRUFBRSxNQUFNLFNBQVMsU0FBUyxDQUFDO0FBQUEsWUFDcEg7QUFDQSxnQkFBSSxFQUFFLE1BQU0sU0FBUyxtQkFBbUIsUUFBVztBQUNsRCx5QkFBVyxLQUFLLEVBQUUsTUFBTSxTQUFTLG1CQUFtQixJQUNqRCxTQUFTLHFDQUFxQyw4Q0FBOEMsRUFBRSxNQUFNLFNBQVMsY0FBYyxJQUMzSCxTQUFTLG1DQUFtQywrQ0FBK0MsRUFBRSxNQUFNLFNBQVMsY0FBYyxDQUFDO0FBQUEsWUFDL0g7QUFDQSxnQkFBSSxFQUFFLE1BQU0sU0FBUyxlQUFlLFFBQVc7QUFDOUMseUJBQVcsS0FBSyxFQUFFLE1BQU0sU0FBUyxlQUFlLElBQzdDLFNBQVMsaUNBQWlDLHlDQUF5QyxFQUFFLE1BQU0sU0FBUyxVQUFVLElBQzlHLFNBQVMsK0JBQStCLDBDQUEwQyxFQUFFLE1BQU0sU0FBUyxVQUFVLENBQUM7QUFBQSxZQUNsSDtBQUNBLG1CQUFPLFdBQVcsS0FBSyxJQUFJO0FBQUEsVUFDNUI7QUFBQSxVQUNBLG9CQUFvQixNQUFNLFNBQVMseUJBQXlCLGlCQUFpQjtBQUFBLFFBQzlFO0FBQUEsUUFDQSwwQkFBMEI7QUFBQSxRQUMxQixrQkFBa0I7QUFBQSxRQUNsQixtQkFBbUI7QUFBQSxRQUNuQix5QkFBeUI7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssaUJBQWlCLElBQUksS0FBSyxNQUFNLGNBQWMsT0FBSztBQUN2RCxVQUFJLENBQUMsRUFBRSxTQUFTO0FBQ2Y7QUFBQSxNQUNEO0FBRUEsWUFBTSxZQUFZLEtBQUssTUFBTSxhQUFhO0FBQzFDLFlBQU0sa0JBQWtCLFVBQVUsTUFBTSxPQUFLLE1BQU0sRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFLE9BQU8sSUFBSSxVQUFVLElBQUksT0FBSyxLQUFLLFVBQVUsaUJBQWlCLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQUEsT0FBSyxDQUFDLENBQUNBLEVBQUM7QUFHbEosWUFBTSx1QkFBdUIsZ0JBQWdCO0FBQUEsUUFBTyxDQUFDLFVBQ3BELENBQUMsNkJBQTZCLEtBQUssS0FBSyxDQUFDLDBCQUEwQixLQUFLLEtBQUssQ0FBQyxjQUFjLEtBQUs7QUFBQSxNQUNsRztBQUVBLFlBQU0sVUFBcUIsQ0FBQztBQUM1QixVQUFJO0FBQ0osVUFBSTtBQUVKLFVBQUkscUJBQXFCLFFBQVE7QUFFaEMsY0FBTSxrQkFBa0IscUJBQXFCLE9BQU8sQ0FBQUEsT0FBS0EsR0FBRSxNQUFNLFNBQVMsT0FBTyxNQUFNO0FBQ3ZGLFlBQUksZ0JBQWdCLFNBQVMsR0FBRztBQUMvQixnQkFBTSxZQUFZLGdCQUFnQixNQUFNLENBQUFBLE9BQUssS0FBSyxzQkFBc0IsY0FBY0EsR0FBRSxNQUFNLFVBQVUsQ0FBQztBQUN6RyxrQkFBUSxLQUFLLFNBQVM7QUFBQSxZQUNyQixJQUFJLFlBQVksZ0JBQWdCO0FBQUEsWUFDaEMsT0FBTyxZQUNKLFNBQVMscUJBQXFCLGFBQWEsSUFDM0MsU0FBUyxtQkFBbUIsV0FBVztBQUFBLFlBQzFDLE9BQU8sVUFBVSxZQUFZLFlBQVksUUFBUSxTQUFTLFFBQVEsR0FBRztBQUFBLFlBQ3JFLEtBQUssTUFBTTtBQUNWLHlCQUFXLFNBQVMsaUJBQWlCO0FBQ3BDLG9CQUFJLFdBQVc7QUFDZCx1QkFBSyxzQkFBc0IsV0FBVyxNQUFNLE1BQU0sVUFBVTtBQUFBLGdCQUM3RCxPQUFPO0FBQ04sdUJBQUssc0JBQXNCLFNBQVMsTUFBTSxNQUFNLFVBQVU7QUFBQSxnQkFDM0Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0QsQ0FBQyxDQUFDO0FBQUEsUUFDSDtBQUdBLGNBQU0sWUFBWSxxQkFBcUIsTUFBTSxDQUFBQSxPQUFLQSxHQUFFLE1BQU0sTUFBTTtBQUNoRSxnQkFBUSxLQUFLLFNBQVM7QUFBQSxVQUNyQixJQUFJLFlBQVksZUFBZTtBQUFBLFVBQy9CLE9BQU8sWUFDSCxxQkFBcUIsV0FBVyxJQUNoQyxTQUFTLG9CQUFvQixZQUFZLElBQ3pDLFNBQVMsMkJBQTJCLGFBQWEsSUFDakQscUJBQXFCLFdBQVcsSUFDaEMsU0FBUyxvQkFBb0IsWUFBWSxJQUN6QyxTQUFTLDJCQUEyQixhQUFhO0FBQUEsVUFDckQsT0FBTyxVQUFVLFlBQVksWUFBWSxRQUFRLFlBQVksUUFBUSxHQUFHO0FBQUEsVUFDeEUsS0FBSyxNQUFNLEtBQUssVUFBVSxnQkFBZ0Isc0JBQXNCLENBQUMsU0FBUztBQUFBLFFBQzNFLENBQUMsQ0FBQztBQUdGLFlBQUkscUJBQXFCLFdBQVcsR0FBRztBQUN0QyxnQkFBTSxnQkFBZ0IsS0FBSyxzQkFBc0IsNkJBQTZCLHFCQUFxQixDQUFDLEVBQUUsTUFBTSxVQUFVO0FBQ3RILGNBQUksY0FBYyxRQUFRO0FBQ3pCLG9CQUFRLEtBQUssSUFBSSxVQUFVLENBQUM7QUFDNUIsb0JBQVEsS0FBSyxHQUFHLGFBQWE7QUFBQSxVQUM5QjtBQUFBLFFBQ0Q7QUFHQSx5QkFBaUIscUJBQXFCLENBQUMsRUFBRSxNQUFNLFNBQVMsTUFBTTtBQUM5RCwwQkFBa0IscUJBQXFCLENBQUMsRUFBRSxNQUFNLFNBQVM7QUFDekQsWUFBSSxxQkFBcUIsS0FBSyxXQUFTLE1BQU0sTUFBTSxTQUFTLE9BQU8sYUFBYSxNQUFNLE1BQU0sU0FBUyxNQUFNLFNBQVMsY0FBYyxHQUFHO0FBQ3BJLDJCQUFpQjtBQUNqQiw0QkFBa0I7QUFBQSxRQUNuQjtBQUFBLE1BQ0QsV0FBVyxnQkFBZ0IsV0FBVyxHQUFHO0FBQ3hDLGNBQU0sUUFBUSxFQUFFO0FBQ2hCLFlBQUksNkJBQTZCLEtBQUssR0FBRztBQUN4QywyQkFBaUIsTUFBTSxZQUFZLE1BQU07QUFDekMsNEJBQWtCLE1BQU0sWUFBWTtBQUVwQyxrQkFBUSxLQUFLLFNBQVM7QUFBQSxZQUNyQixJQUFJLE1BQU0sU0FBUyxjQUFjO0FBQUEsWUFDakMsT0FBTyxNQUFNLFNBQ1YsU0FBUyxvQkFBb0IsaUJBQWlCLElBQzlDLFNBQVMsb0JBQW9CLGlCQUFpQjtBQUFBLFlBQ2pELE9BQU8sVUFBVSxZQUFZLE1BQU0sU0FBUyxRQUFRLFlBQVksUUFBUSxHQUFHO0FBQUEsWUFDM0UsS0FBSyxNQUFNLEtBQUssVUFBVSxrQkFBa0IsS0FBSztBQUFBLFVBQ2xELENBQUMsQ0FBQztBQUFBLFFBQ0g7QUFBQSxNQUNEO0FBRUEsVUFBSSxrQkFBa0IsaUJBQWlCO0FBQ3RDLGNBQU0sZUFBZSxnQkFBZ0Isb0JBQ2xDLENBQUMsU0FBUztBQUFBLFVBQ1gsSUFBSTtBQUFBLFVBQ0osT0FBTyxTQUFTLHlCQUF5QixpQkFBaUIsY0FBYztBQUFBLFVBQ3hFLEtBQUssWUFBWTtBQUNoQixrQkFBTSxLQUFLLGVBQWUsZUFBZSxnQkFBZ0IsbUJBQW9CLGdCQUFnQixNQUFNO0FBQ25HLGtCQUFNLEtBQUssVUFBVSxRQUFRO0FBQUEsVUFDOUI7QUFBQSxRQUNELENBQUMsQ0FBQyxJQUNBLDJCQUEyQixLQUFLLFdBQVcsaUJBQWlCLGdCQUFnQixLQUFLLHVCQUF1QixLQUFLLGFBQWE7QUFDN0gsWUFBSSxhQUFhLFFBQVE7QUFDeEIsY0FBSSxRQUFRLFFBQVE7QUFDbkIsb0JBQVEsS0FBSyxJQUFJLFVBQVUsQ0FBQztBQUFBLFVBQzdCO0FBQ0Esa0JBQVEsS0FBSyxHQUFHLFlBQVk7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFFBQVEsU0FBUyxHQUFHO0FBQ3ZCLGFBQUssbUJBQW1CLGdCQUFnQjtBQUFBLFVBQ3ZDLFdBQVcsTUFBTSxFQUFFO0FBQUEsVUFDbkIsWUFBWSxNQUFNO0FBQUEsUUFDbkIsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssTUFBTSxPQUFPLEdBQUcsS0FBSyxNQUFNLFFBQVEsS0FBSyxVQUFVLGdCQUFnQjtBQUN2RSxTQUFLLHNCQUFzQixLQUFLLEtBQUssU0FBUztBQUM5QyxTQUFLLGlCQUFpQixJQUFJLEtBQUssVUFBVSxZQUFZLENBQUMsRUFBRSxJQUFJLFNBQVMsTUFBTSxNQUFNO0FBQ2hGLFdBQUssTUFBTSxPQUFPLElBQUksU0FBUyxLQUFLO0FBQ3BDLFdBQUssc0JBQXNCLEtBQUssS0FBSyxTQUFTO0FBQzlDLFVBQUksS0FBSyxVQUFVLGVBQWU7QUFDakMsY0FBTSxxQkFBcUIsS0FBSyxVQUFVLGlCQUFpQixRQUFRLEtBQUssVUFBVSxhQUFhO0FBQy9GLGFBQUssTUFBTSxTQUFTLENBQUMsa0JBQWtCLENBQUM7QUFDeEMsYUFBSyxNQUFNLGFBQWEsQ0FBQyxrQkFBa0IsQ0FBQztBQUFBLE1BQzdDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLGlCQUFpQixJQUFJLEtBQUssTUFBTSxVQUFVLE9BQU8sRUFBRSxTQUFTLGFBQWEsTUFBTTtBQUNuRixVQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsTUFDRDtBQUNBLFVBQUksY0FBYyxPQUFPLEdBQUc7QUFDM0I7QUFBQSxNQUNEO0FBQ0EsVUFBSSw2QkFBNkIsT0FBTyxLQUFLLDBCQUEwQixPQUFPLEdBQUc7QUFDaEYsYUFBSyxVQUFVLGdCQUFnQixPQUFPO0FBQUEsTUFDdkM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssaUJBQWlCLElBQUksS0FBSyxNQUFNLHFCQUFxQixPQUFLLEtBQUssVUFBVSxnQkFBZ0IsRUFBRSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBRTVHLFNBQUssaUJBQWlCLElBQUksS0FBSyxNQUFNLFVBQVUsTUFBTTtBQUNwRCxVQUFJLEtBQUssVUFBVSxlQUFlLEdBQUc7QUFDcEMsYUFBSyxVQUFVLE9BQU8sS0FBSyxhQUFhLFNBQVMsQ0FBQztBQUFBLE1BQ25EO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLE9BQU8sS0FBSyxRQUFRLGNBQWMsS0FBSyxRQUFRLFdBQVc7QUFBQSxFQUNoRTtBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFVBQU0sc0JBQXNCLEtBQUssc0JBQXNCLFdBQVcsRUFBRSxPQUFPLFlBQVUsT0FBTyxxQkFBcUIsT0FBTyxhQUFhO0FBRXJJLFVBQU0sY0FBYyxLQUFLLHVCQUF1QjtBQUNoRCxVQUFNLHVCQUF1QixnQkFBZ0IsZ0JBQWdCLFlBQVksZ0JBQWdCLGdCQUFnQjtBQUN6RyxVQUFNLHVCQUF1QixLQUFLLHVCQUF1QixjQUNyRCxLQUFLLHVCQUF1QixxQkFDM0IsZ0JBQWdCLGdCQUFnQixXQUNoQyxnQkFBZ0IsZ0JBQWdCLGFBQ2hDLENBQUM7QUFFTixTQUFLLGtCQUFrQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsWUFBVSxLQUFLLG1CQUFtQixNQUFNO0FBQUEsSUFDekM7QUFFQSxTQUFLLFVBQVUsVUFBVSx3QkFBd0IsS0FBSyxnQkFBZ0IsU0FBUztBQUMvRSxTQUFLLFVBQVUsU0FBUyxDQUFDLHdCQUF3Qix1QkFBdUIsU0FBUyxnQ0FBZ0MsK0NBQStDLElBQUksRUFBRTtBQUFBLEVBQ3ZLO0FBQUEsRUFFQSxNQUFjLDRDQUEyRDtBQUN4RSxVQUFNLHdCQUF3QixLQUFLLG9CQUFvQjtBQUN2RCxVQUFNLGtCQUFrQixDQUFDLENBQUMseUJBQXlCLEtBQUssb0JBQW9CLFFBQVEsS0FBSyxvQkFBb0IsV0FBVyxNQUFNO0FBQzlILFFBQUksaUJBQWlCO0FBQ3BCLFlBQU0sS0FBSyxlQUFlLGVBQWUsNkJBQTZCO0FBQUEsSUFDdkU7QUFFQSxVQUFNLEtBQUssMkJBQTJCLFdBQVcsUUFBUSwwQ0FBMEMsS0FBSyxLQUFLO0FBQUEsRUFDOUc7QUFBQSxFQUVRLGVBQXFCO0FBQzVCLFNBQUssaUJBQWlCLFFBQVEsTUFBTTtBQUNuQyxXQUFLLFVBQVUsT0FBTyxLQUFLLGFBQWEsU0FBUyxDQUFDO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLFFBQXlEO0FBQ3pGLFVBQU0sS0FBSyxzQkFBc0IscUNBQXFDLE9BQU8sTUFBTTtBQUNuRixVQUFNLEtBQUssVUFBVSxRQUFRO0FBQUEsRUFDOUI7QUFBQSxFQUVPLE9BQU8sUUFBZ0IsT0FBcUI7QUFDbEQsWUFBUSxRQUFRO0FBQ2hCLFNBQUssYUFBYSxPQUFPLElBQUksSUFBSSxVQUFVLFFBQVEsS0FBSyx1QkFBdUIsY0FBYyxLQUFLLG1CQUFtQixjQUFjLEdBQUcsRUFBRSxDQUFDO0FBQ3pJLFVBQU0sY0FBYyxTQUFTO0FBQzdCLFNBQUssZUFBZSxNQUFNLFNBQVMsR0FBRyxXQUFXO0FBQ2pELFVBQU0sYUFBYSxLQUFLLElBQUksT0FBTyxLQUFLLGFBQWE7QUFDckQsU0FBSyxNQUFNLE9BQU8sYUFBYSxVQUFVO0FBQ3pDLFNBQUssaUJBQWlCLFlBQVk7QUFBQSxFQUNuQztBQUFBLEVBRU8sY0FBb0I7QUFDMUIsU0FBSyxhQUFhLE1BQU07QUFBQSxFQUN6QjtBQUFBLEVBRU8sT0FBTyxRQUFzQjtBQUNuQyxTQUFLLFlBQVk7QUFDakIsU0FBSyxhQUFhLFNBQVMsTUFBTTtBQUNqQyxTQUFLLFVBQVUsT0FBTyxNQUFNO0FBQUEsRUFDN0I7QUFBQSxFQUVPLGNBQW9CO0FBQzFCLFNBQUssWUFBWTtBQUNqQixTQUFLLGFBQWEsU0FBUyxFQUFFO0FBQUEsRUFDOUI7QUFBQSxFQUVPLFNBQWU7QUFDckIsUUFBSSxLQUFLLFVBQVUsZUFBZSxHQUFHO0FBQ3BDLFdBQUssVUFBVSxPQUFPLEtBQUssYUFBYSxTQUFTLENBQUM7QUFBQSxJQUNuRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLElBQUksWUFBb0I7QUFDdkIsV0FBTyxLQUFLLFVBQVUsaUJBQ3BCLE9BQU8sT0FBSyxDQUFDLDZCQUE2QixDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxLQUFLLENBQUMsY0FBYyxDQUFDLENBQUMsRUFDbEc7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGdCQUFzQjtBQUNyQixTQUFLLHNCQUFzQixLQUFLLEtBQUssU0FBUztBQUFBLEVBQy9DO0FBRUQ7QUFwbEJhLGlCQUVHLGdCQUF3QjtBQUYzQixtQkFBTjtBQUFBLEVBNEJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZDVTsiLAogICJuYW1lcyI6IFsiZSJdCn0K
