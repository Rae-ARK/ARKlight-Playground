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
import "./media/scm.css";
import { $, append, h, reset } from "../../../../base/browser/dom.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { createMatches } from "../../../../base/common/filters.js";
import { combinedDisposable, Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue, waitForState, constObservable, latestChangedValue, observableFromEvent, runOnChange, observableSignal } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { asCssVariable, foreground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewAction, ViewPane, ViewPaneShowActions } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { renderSCMHistoryItemGraph, toISCMHistoryItemViewModelArray, SWIMLANE_WIDTH, renderSCMHistoryGraphPlaceholder, historyItemHoverLabelForeground, historyItemHoverDefaultLabelBackground, getHistoryItemIndex, toHistoryItemHoverContent } from "./scmHistory.js";
import { getHistoryItemEditorTitle, getProviderKey, isSCMHistoryItemChangeNode, isSCMHistoryItemChangeViewModelTreeElement, isSCMHistoryItemLoadMoreTreeElement, isSCMHistoryItemViewModelTreeElement, isSCMRepository } from "./util.js";
import { SCMIncomingHistoryItemId, SCMOutgoingHistoryItemId } from "../common/history.js";
import { HISTORY_VIEW_PANE_ID, ISCMService, ISCMViewService, ViewMode } from "../common/scm.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { Action2, IMenuService, isIMenuItem, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Sequencer, Throttler } from "../../../../base/common/async.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { delta, groupBy } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
import { ContextKeys } from "./scmViewPane.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Event } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { clamp } from "../../../../base/common/numbers.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { compare } from "../../../../base/common/strings.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { groupBy as groupBy2 } from "../../../../base/common/collections.js";
import { getActionBarActions, getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { basename } from "../../../../base/common/path.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ScmHistoryItemResolver } from "../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { URI } from "../../../../base/common/uri.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { CodeDataTransfers } from "../../../../platform/dnd/browser/dnd.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
const PICK_REPOSITORY_ACTION_ID = "workbench.scm.action.graph.pickRepository";
const PICK_HISTORY_ITEM_REFS_ACTION_ID = "workbench.scm.action.graph.pickHistoryItemRefs";
class SCMRepositoryActionViewItem extends ActionViewItem {
  constructor(_repository, action, options) {
    super(null, action, { ...options, icon: false, label: true });
    this._repository = _repository;
  }
  updateLabel() {
    if (this.options.label && this.label) {
      this.label.classList.add("scm-graph-repository-picker");
      const icon = $(".icon");
      const iconClassNameArray = ThemeIcon.isThemeIcon(this._repository.provider.iconPath) ? ThemeIcon.asClassNameArray(this._repository.provider.iconPath) : ThemeIcon.asClassNameArray(Codicon.repo);
      icon.classList.add(...iconClassNameArray);
      const name = $(".name");
      name.textContent = this._repository.provider.name;
      reset(this.label, icon, name);
    }
  }
  getTooltip() {
    return this._repository.provider.name;
  }
}
class SCMHistoryItemRefsActionViewItem extends ActionViewItem {
  constructor(_repository, _historyItemsFilter, action, options) {
    super(null, action, { ...options, icon: false, label: true });
    this._repository = _repository;
    this._historyItemsFilter = _historyItemsFilter;
  }
  updateLabel() {
    if (this.options.label && this.label) {
      this.label.classList.add("scm-graph-history-item-picker");
      const icon = $(".icon");
      icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.gitBranch));
      const name = $(".name");
      if (this._historyItemsFilter === "all") {
        name.textContent = localize("all", "All");
      } else if (this._historyItemsFilter === "auto") {
        name.textContent = localize("auto", "Auto");
      } else if (this._historyItemsFilter.length === 1) {
        name.textContent = this._historyItemsFilter[0].name;
      } else {
        name.textContent = localize("items", "{0} Items", this._historyItemsFilter.length);
      }
      reset(this.label, icon, name);
    }
  }
  getTooltip() {
    if (this._historyItemsFilter === "all") {
      return localize("allHistoryItemRefs", "All history item references");
    } else if (this._historyItemsFilter === "auto") {
      const historyProvider = this._repository.provider.historyProvider.get();
      return [
        historyProvider?.historyItemRef.get()?.name,
        historyProvider?.historyItemRemoteRef.get()?.name,
        historyProvider?.historyItemBaseRef.get()?.name
      ].filter((ref) => !!ref).join(", ");
    } else if (this._historyItemsFilter.length === 1) {
      return this._historyItemsFilter[0].name;
    } else {
      return this._historyItemsFilter.map((ref) => ref.name).join(", ");
    }
  }
}
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: PICK_REPOSITORY_ACTION_ID,
      title: localize("repositoryPicker", "Repository Picker"),
      viewId: HISTORY_VIEW_PANE_ID,
      f1: false,
      menu: {
        id: MenuId.SCMHistoryTitle,
        when: ContextKeyExpr.and(
          ContextKeyExpr.has("scm.providerCount"),
          ContextKeyExpr.greater("scm.providerCount", 1),
          ContextKeyExpr.equals("config.scm.repositories.selectionMode", "multiple")
        ),
        group: "navigation",
        order: 0
      }
    });
  }
  async runInView(_, view) {
    view.pickRepository();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: PICK_HISTORY_ITEM_REFS_ACTION_ID,
      title: localize("referencePicker", "History Item Reference Picker"),
      icon: Codicon.gitBranch,
      viewId: HISTORY_VIEW_PANE_ID,
      precondition: ContextKeys.SCMHistoryItemCount.notEqualsTo(0),
      f1: false,
      menu: {
        id: MenuId.SCMHistoryTitle,
        group: "navigation",
        order: 1
      }
    });
  }
  async runInView(_, view) {
    view.pickHistoryItemRef();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.scm.action.graph.revealCurrentHistoryItem",
      title: localize("goToCurrentHistoryItem", "Go to Current History Item"),
      icon: Codicon.target,
      viewId: HISTORY_VIEW_PANE_ID,
      precondition: ContextKeyExpr.and(
        ContextKeys.SCMHistoryItemCount.notEqualsTo(0),
        ContextKeys.SCMCurrentHistoryItemRefInFilter.isEqualTo(true)
      ),
      f1: false,
      menu: {
        id: MenuId.SCMHistoryTitle,
        group: "navigation",
        order: 2
      }
    });
  }
  async runInView(_, view) {
    view.revealCurrentHistoryItem();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.scm.action.graph.refresh",
      title: localize("refreshGraph", "Refresh"),
      viewId: HISTORY_VIEW_PANE_ID,
      f1: false,
      icon: Codicon.refresh,
      menu: {
        id: MenuId.SCMHistoryTitle,
        group: "navigation",
        order: 1e3
      }
    });
  }
  async runInView(_, view) {
    view.refresh();
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.scm.action.graph.setListViewMode",
      title: localize("setListViewMode", "View as List"),
      viewId: HISTORY_VIEW_PANE_ID,
      toggled: ContextKeys.SCMHistoryViewMode.isEqualTo(ViewMode.List),
      menu: { id: MenuId.SCMHistoryTitle, group: "9_viewmode", order: 1 },
      f1: false
    });
  }
  async runInView(_, view) {
    view.setViewMode(ViewMode.List);
  }
});
registerAction2(class extends ViewAction {
  constructor() {
    super({
      id: "workbench.scm.action.graph.setTreeViewMode",
      title: localize("setTreeViewMode", "View as Tree"),
      viewId: HISTORY_VIEW_PANE_ID,
      toggled: ContextKeys.SCMHistoryViewMode.isEqualTo(ViewMode.Tree),
      menu: { id: MenuId.SCMHistoryTitle, group: "9_viewmode", order: 2 },
      f1: false
    });
  }
  async runInView(_, view) {
    view.setViewMode(ViewMode.Tree);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.scm.action.graph.viewChanges",
      title: localize("openChanges", "Open Changes"),
      icon: Codicon.diffMultiple,
      f1: false,
      menu: [
        {
          id: MenuId.SCMHistoryItemContext,
          group: "inline",
          order: 1
        },
        {
          id: MenuId.SCMHistoryItemContext,
          group: "0_view",
          order: 1
        }
      ]
    });
  }
  async run(accessor, provider, ...historyItems) {
    const commandService = accessor.get(ICommandService);
    const historyProvider = provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
    if (!provider || !historyProvider || !historyItemRef || historyItems.length === 0) {
      return;
    }
    const historyItem = historyItems[0];
    let title, historyItemId, historyItemParentId;
    if (historyItemRemoteRef && (historyItem.id === SCMIncomingHistoryItemId || historyItem.id === SCMOutgoingHistoryItemId)) {
      const mergeBase = await historyProvider.resolveHistoryItemRefsCommonAncestor([
        historyItemRef.name,
        historyItemRemoteRef.name
      ]);
      if (mergeBase && historyItem.id === SCMIncomingHistoryItemId) {
        title = `${historyItem.subject} - ${historyItemRef.name} \u2194 ${historyItemRemoteRef.name}`;
        historyItemId = historyItemRemoteRef.id;
        historyItemParentId = mergeBase;
      } else if (mergeBase && historyItem.id === SCMOutgoingHistoryItemId) {
        title = `${historyItem.subject} - ${historyItemRemoteRef.name} \u2194 ${historyItemRef.name}`;
        historyItemId = historyItemRef.id;
        historyItemParentId = mergeBase;
      }
    } else {
      title = getHistoryItemEditorTitle(historyItem);
      historyItemId = historyItem.id;
      if (historyItem.parentIds.length > 0) {
        if (historyItem.parentIds[0] === SCMIncomingHistoryItemId && historyItemRemoteRef) {
          historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
            historyItemRef.name,
            historyItemRemoteRef.name
          ]);
        } else {
          historyItemParentId = historyItem.parentIds[0];
        }
      }
    }
    if (!title || !historyItemId || !historyItemParentId) {
      return;
    }
    const multiDiffSourceUri = ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItemId, historyItemParentId, "");
    commandService.executeCommand("_workbench.openMultiDiffEditor", { title, multiDiffSourceUri });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.scm.action.graph.openFile",
      title: localize("openFile", "Open File"),
      icon: Codicon.goToFile,
      f1: false,
      menu: [
        {
          id: MenuId.SCMHistoryItemChangeContext,
          group: "inline",
          order: 1
        },
        {
          id: MenuId.SCMHistoryItemChangeContext,
          group: "0_view",
          order: 1
        }
      ]
    });
  }
  async run(accessor, historyItem, historyItemChange) {
    const editorService = accessor.get(IEditorService);
    if (!historyItem || !historyItemChange.modifiedUri) {
      return;
    }
    let version;
    if (historyItem.id === SCMIncomingHistoryItemId) {
      version = localize("incomingChanges", "Incoming Changes");
    } else if (historyItem.id === SCMOutgoingHistoryItemId) {
      version = localize("outgoingChanges", "Outgoing Changes");
    } else {
      version = historyItem.displayId ?? historyItem.id;
    }
    const name = basename(historyItemChange.modifiedUri.fsPath);
    await editorService.openEditor({ resource: historyItemChange.modifiedUri, label: `${name} (${version})` });
  }
});
class ListDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId(element) {
    if (isSCMHistoryItemViewModelTreeElement(element)) {
      return HistoryItemRenderer.TEMPLATE_ID;
    } else if (isSCMHistoryItemChangeViewModelTreeElement(element) || isSCMHistoryItemChangeNode(element)) {
      return HistoryItemChangeRenderer.TEMPLATE_ID;
    } else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
      return HistoryItemLoadMoreRenderer.TEMPLATE_ID;
    } else {
      throw new Error("Unknown element");
    }
  }
}
let HistoryItemRenderer = class {
  constructor(_viewContainerLocation, _commandService, _configurationService, _contextKeyService, _contextMenuService, _hoverService, _keybindingService, _markdownRendererService, _menuService, _telemetryService) {
    this._viewContainerLocation = _viewContainerLocation;
    this._commandService = _commandService;
    this._configurationService = _configurationService;
    this._contextKeyService = _contextKeyService;
    this._contextMenuService = _contextMenuService;
    this._hoverService = _hoverService;
    this._keybindingService = _keybindingService;
    this._markdownRendererService = _markdownRendererService;
    this._menuService = _menuService;
    this._telemetryService = _telemetryService;
    this._badgesConfig = observableConfigValue("scm.graph.badges", "filter", this._configurationService);
  }
  get templateId() {
    return HistoryItemRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".history-item"));
    const graphContainer = append(element, $(".graph-container"));
    const iconLabel = new IconLabel(element, {
      supportIcons: true,
      supportHighlights: true,
      supportDescriptionHighlights: true
    });
    const labelContainer = append(element, $(".label-container"));
    const actionsContainer = append(element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, void 0, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
    return { element, graphContainer, label: iconLabel, labelContainer, actionBar, elementDisposables: new DisposableStore(), disposables: combinedDisposable(iconLabel, actionBar) };
  }
  renderElement(node, index, templateData) {
    const provider = node.element.repository.provider;
    const historyItemViewModel = node.element.historyItemViewModel;
    const historyItem = historyItemViewModel.historyItem;
    const { content, disposables } = toHistoryItemHoverContent(this._markdownRendererService, historyItem, true);
    const { hoverOptions, hoverLifecycleOptions } = this._getHoverOptions();
    const historyItemHover = this._hoverService.setupDelayedHover(templateData.element, { ...hoverOptions, content }, hoverLifecycleOptions);
    templateData.elementDisposables.add(historyItemHover);
    templateData.elementDisposables.add(disposables);
    templateData.graphContainer.textContent = "";
    templateData.graphContainer.classList.toggle("current", historyItemViewModel.kind === "HEAD");
    templateData.graphContainer.classList.toggle("incoming-changes", historyItemViewModel.kind === "incoming-changes");
    templateData.graphContainer.classList.toggle("outgoing-changes", historyItemViewModel.kind === "outgoing-changes");
    templateData.graphContainer.appendChild(renderSCMHistoryItemGraph(historyItemViewModel));
    const historyItemRef = provider.historyProvider.get()?.historyItemRef?.get();
    const extraClasses = historyItemRef?.revision === historyItem.id ? ["history-item-current"] : [];
    const [matches, descriptionMatches] = this._processMatches(historyItemViewModel, node.filterData);
    templateData.label.setLabel(historyItem.subject, historyItem.author, { matches, descriptionMatches, extraClasses });
    this._renderBadges(historyItem, templateData);
    const actions = this._menuService.getMenuActions(
      MenuId.SCMHistoryItemContext,
      this._contextKeyService,
      { arg: provider, shouldForwardArgs: true }
    );
    templateData.actionBar.context = historyItem;
    templateData.actionBar.setActions(getActionBarActions(actions, "inline").primary);
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Should never happen since node is incompressible");
  }
  _renderBadges(historyItem, templateData) {
    templateData.elementDisposables.add(autorun((reader) => {
      const labelConfig = this._badgesConfig.read(reader);
      templateData.labelContainer.replaceChildren();
      const references = historyItem.references ? historyItem.references.slice(0) : [];
      if (references.length > 0 && references[0].color) {
        this._renderBadge([references[0]], true, templateData);
        references.splice(0, 1);
      }
      const historyItemRefsByColor = groupBy2(references, (ref) => ref.color ? ref.color : "");
      for (const [key, historyItemRefs] of Object.entries(historyItemRefsByColor)) {
        if (key === "" && labelConfig !== "all") {
          continue;
        }
        if (!historyItemRefs) {
          continue;
        }
        const historyItemRefByIconId = groupBy2(historyItemRefs, (ref) => ThemeIcon.isThemeIcon(ref.icon) ? ref.icon.id : "");
        for (const [key2, historyItemRefs2] of Object.entries(historyItemRefByIconId)) {
          if (key2 === "" || !historyItemRefs2) {
            continue;
          }
          this._renderBadge(historyItemRefs2, false, templateData);
        }
      }
    }));
  }
  _renderBadge(historyItemRefs, showDescription, templateData) {
    if (historyItemRefs.length === 0 || !ThemeIcon.isThemeIcon(historyItemRefs[0].icon)) {
      return;
    }
    const elements = h("div.label", {
      style: {
        color: historyItemRefs[0].color ? asCssVariable(historyItemHoverLabelForeground) : asCssVariable(foreground),
        backgroundColor: historyItemRefs[0].color ? asCssVariable(historyItemRefs[0].color) : asCssVariable(historyItemHoverDefaultLabelBackground)
      }
    }, [
      h("div.count@count", {
        style: {
          display: historyItemRefs.length > 1 ? "" : "none"
        }
      }),
      h("div.icon@icon"),
      h("div.description@description", {
        style: {
          display: showDescription ? "" : "none"
        }
      })
    ]);
    elements.count.textContent = historyItemRefs.length > 1 ? historyItemRefs.length.toString() : "";
    elements.icon.classList.add(...ThemeIcon.asClassNameArray(historyItemRefs[0].icon));
    elements.description.textContent = showDescription ? historyItemRefs[0].name : "";
    append(templateData.labelContainer, elements.root);
  }
  _getHoverOptions() {
    if (this._viewContainerLocation === ViewContainerLocation.Panel) {
      return {
        hoverOptions: {
          additionalClasses: ["history-item-hover"],
          appearance: {
            compact: true
          },
          position: {
            hoverPosition: HoverPosition.RIGHT
          },
          style: HoverStyle.Mouse
        },
        hoverLifecycleOptions: void 0
      };
    }
    return {
      hoverOptions: {
        additionalClasses: ["history-item-hover"],
        appearance: {
          compact: true,
          showPointer: true
        },
        position: {
          hoverPosition: HoverPosition.RIGHT
        },
        style: HoverStyle.Pointer
      },
      hoverLifecycleOptions: {
        groupId: "scm-history-item"
      }
    };
  }
  _processMatches(historyItemViewModel, filterData) {
    if (!filterData) {
      return [void 0, void 0];
    }
    return [
      historyItemViewModel.historyItem.message === filterData.label ? createMatches(filterData.score) : void 0,
      historyItemViewModel.historyItem.author === filterData.label ? createMatches(filterData.score) : void 0
    ];
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.disposables.dispose();
  }
};
HistoryItemRenderer.TEMPLATE_ID = "history-item";
HistoryItemRenderer = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IMarkdownRendererService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, ITelemetryService)
], HistoryItemRenderer);
let HistoryItemChangeRenderer = class {
  constructor(viewMode, resourceLabels, _commandService, _contextKeyService, _contextMenuService, _keybindingService, _labelService, _menuService, _telemetryService) {
    this.viewMode = viewMode;
    this.resourceLabels = resourceLabels;
    this._commandService = _commandService;
    this._contextKeyService = _contextKeyService;
    this._contextMenuService = _contextMenuService;
    this._keybindingService = _keybindingService;
    this._labelService = _labelService;
    this._menuService = _menuService;
    this._telemetryService = _telemetryService;
  }
  get templateId() {
    return HistoryItemChangeRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const rowElement = container.parentElement;
    const element = append(container, $(".history-item-change"));
    const graphPlaceholder = append(element, $(".graph-placeholder"));
    const labelContainer = append(element, $(".label-container"));
    const resourceLabel = this.resourceLabels.create(labelContainer, {
      supportDescriptionHighlights: true,
      supportHighlights: true
    });
    const disposables = new DisposableStore();
    const actionsContainer = append(resourceLabel.element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, void 0, this._menuService, this._contextKeyService, this._contextMenuService, this._keybindingService, this._commandService, this._telemetryService);
    disposables.add(actionBar);
    return { rowElement, element, graphPlaceholder, resourceLabel, actionBar, disposables };
  }
  renderElement(elementOrNode, index, templateData, details) {
    const historyItemViewModel = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.historyItemViewModel : elementOrNode.element.context.historyItemViewModel;
    const historyItemChange = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.historyItemChange : elementOrNode.element;
    const graphColumns = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? elementOrNode.element.graphColumns : elementOrNode.element.context.historyItemViewModel.outputSwimlanes;
    this._renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns);
    const hidePath = this.viewMode() === ViewMode.Tree;
    const fileKind = isSCMHistoryItemChangeViewModelTreeElement(elementOrNode.element) ? FileKind.FILE : FileKind.FOLDER;
    templateData.resourceLabel.setFile(historyItemChange.uri, { fileDecorations: { colors: false, badges: true }, fileKind, hidePath });
    if (fileKind === FileKind.FILE) {
      const actions = this._menuService.getMenuActions(
        MenuId.SCMHistoryItemChangeContext,
        this._contextKeyService,
        { arg: historyItemViewModel.historyItem, shouldForwardArgs: true }
      );
      templateData.actionBar.context = historyItemChange;
      templateData.actionBar.setActions(getActionBarActions(actions, "inline").primary);
    } else {
      templateData.actionBar.context = void 0;
      templateData.actionBar.setActions([]);
    }
  }
  renderCompressedElements(node, index, templateData, details) {
    const compressed = node.element;
    const historyItemViewModel = compressed.elements[0].context.historyItemViewModel;
    const graphColumns = compressed.elements[0].context.historyItemViewModel.outputSwimlanes;
    this._renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns);
    const label = compressed.elements.map((e) => e.name);
    const folder = compressed.elements[compressed.elements.length - 1];
    templateData.resourceLabel.setResource({ resource: folder.uri, name: label }, {
      fileDecorations: { colors: false, badges: true },
      fileKind: FileKind.FOLDER,
      separator: this._labelService.getSeparator(folder.uri.scheme)
    });
    templateData.actionBar.context = void 0;
    templateData.actionBar.setActions([]);
  }
  _renderGraphPlaceholder(templateData, historyItemViewModel, graphColumns) {
    const graphPlaceholderSvgWidth = SWIMLANE_WIDTH * (graphColumns.length + 1);
    const marginLeft = graphPlaceholderSvgWidth - 16;
    templateData.rowElement.style.marginLeft = `${marginLeft}px`;
    templateData.graphPlaceholder.textContent = "";
    templateData.graphPlaceholder.style.left = `${-1 * marginLeft}px`;
    templateData.graphPlaceholder.style.width = `${graphPlaceholderSvgWidth}px`;
    templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(graphColumns, getHistoryItemIndex(historyItemViewModel)));
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
};
HistoryItemChangeRenderer.TEMPLATE_ID = "history-item-change";
HistoryItemChangeRenderer = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IMenuService),
  __decorateParam(8, ITelemetryService)
], HistoryItemChangeRenderer);
let HistoryItemLoadMoreRenderer = class {
  constructor(_isLoadingMore, _loadMoreCallback, _configurationService) {
    this._isLoadingMore = _isLoadingMore;
    this._loadMoreCallback = _loadMoreCallback;
    this._configurationService = _configurationService;
  }
  get templateId() {
    return HistoryItemLoadMoreRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".history-item-load-more"));
    const graphPlaceholder = append(element, $(".graph-placeholder"));
    const historyItemPlaceholderContainer = append(element, $(".history-item-placeholder"));
    const historyItemPlaceholderLabel = new IconLabel(historyItemPlaceholderContainer, { supportIcons: true });
    return { element, graphPlaceholder, historyItemPlaceholderContainer, historyItemPlaceholderLabel, elementDisposables: new DisposableStore(), disposables: historyItemPlaceholderLabel };
  }
  renderElement(element, index, templateData) {
    templateData.graphPlaceholder.textContent = "";
    templateData.graphPlaceholder.style.width = `${SWIMLANE_WIDTH * (element.element.graphColumns.length + 1)}px`;
    templateData.graphPlaceholder.appendChild(renderSCMHistoryGraphPlaceholder(element.element.graphColumns));
    const pageOnScroll = this._configurationService.getValue("scm.graph.pageOnScroll") === true;
    templateData.historyItemPlaceholderContainer.classList.toggle("shimmer", pageOnScroll);
    if (pageOnScroll) {
      templateData.historyItemPlaceholderLabel.setLabel("");
      this._loadMoreCallback();
    } else {
      templateData.elementDisposables.add(autorun((reader) => {
        const isLoadingMore = this._isLoadingMore.read(reader);
        const icon = `$(${isLoadingMore ? "loading~spin" : "fold-down"})`;
        templateData.historyItemPlaceholderLabel.setLabel(localize("loadMore", "{0} Load More...", icon));
      }));
    }
  }
  renderCompressedElements(node, index, templateData) {
    throw new Error("Should never happen since node is incompressible");
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.disposables.dispose();
  }
};
HistoryItemLoadMoreRenderer.TEMPLATE_ID = "historyItemLoadMore";
HistoryItemLoadMoreRenderer = __decorateClass([
  __decorateParam(2, IConfigurationService)
], HistoryItemLoadMoreRenderer);
let SCMHistoryViewPaneActionRunner = class extends ActionRunner {
  constructor(_progressService) {
    super();
    this._progressService = _progressService;
  }
  runAction(action, context) {
    return this._progressService.withProgress(
      { location: HISTORY_VIEW_PANE_ID },
      async () => await super.runAction(action, context)
    );
  }
};
SCMHistoryViewPaneActionRunner = __decorateClass([
  __decorateParam(0, IProgressService)
], SCMHistoryViewPaneActionRunner);
class SCMHistoryTreeAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("scm history", "Source Control History");
  }
  getAriaLabel(element) {
    if (isSCMRepository(element)) {
      return `${element.provider.name} ${element.provider.label}`;
    } else if (isSCMHistoryItemViewModelTreeElement(element)) {
      const historyItem = element.historyItemViewModel.historyItem;
      return `${stripIcons(historyItem.message).trim()}${historyItem.author ? `, ${historyItem.author}` : ""}`;
    } else {
      return "";
    }
  }
}
class SCMHistoryTreeIdentityProvider {
  getId(element) {
    if (isSCMRepository(element)) {
      const provider = element.provider;
      return `repo:${provider.id}`;
    } else if (isSCMHistoryItemViewModelTreeElement(element)) {
      const provider = element.repository.provider;
      const historyItem = element.historyItemViewModel.historyItem;
      return `historyItem:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(",")}`;
    } else if (isSCMHistoryItemChangeViewModelTreeElement(element)) {
      const provider = element.repository.provider;
      const historyItem = element.historyItemViewModel.historyItem;
      return `historyItemChange:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(",")}/${element.historyItemChange.uri.fsPath}`;
    } else if (isSCMHistoryItemChangeNode(element)) {
      const provider = element.context.repository.provider;
      const historyItem = element.context.historyItemViewModel.historyItem;
      return `historyItemChangeFolder:${provider.id}/${historyItem.id}/${historyItem.parentIds.join(",")}/${element.uri.fsPath}`;
    } else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
      const provider = element.repository.provider;
      return `historyItemLoadMore:${provider.id}`;
    } else {
      throw new Error("Invalid tree element");
    }
  }
}
class SCMHistoryTreeKeyboardNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    if (isSCMRepository(element)) {
      return void 0;
    } else if (isSCMHistoryItemViewModelTreeElement(element)) {
      return [element.historyItemViewModel.historyItem.message, element.historyItemViewModel.historyItem.author];
    } else if (isSCMHistoryItemLoadMoreTreeElement(element)) {
      return "";
    } else {
      throw new Error("Invalid tree element");
    }
  }
  getCompressedNodeKeyboardNavigationLabel(elements) {
    const folders = elements;
    return folders.map((e) => e.name).join("/");
  }
}
class SCMHistoryTreeCompressionDelegate {
  isIncompressible(element) {
    if (ResourceTree.isResourceNode(element)) {
      return element.childrenCount === 0 || !element.parent || !element.parent.parent;
    }
    return true;
  }
}
class SCMHistoryTreeDataSource extends Disposable {
  constructor(viewMode) {
    super();
    this.viewMode = viewMode;
  }
  async getChildren(inputOrElement) {
    const children = [];
    if (inputOrElement instanceof SCMHistoryViewModel) {
      const historyItems = await inputOrElement.getHistoryItems();
      children.push(...historyItems);
      const repository = inputOrElement.repository.get();
      const lastHistoryItem = historyItems.at(-1);
      if (repository && lastHistoryItem && lastHistoryItem.historyItemViewModel.outputSwimlanes.length > 0) {
        children.push({
          repository,
          graphColumns: lastHistoryItem.historyItemViewModel.outputSwimlanes,
          type: "historyItemLoadMore"
        });
      }
    } else if (isSCMHistoryItemViewModelTreeElement(inputOrElement)) {
      const historyProvider = inputOrElement.repository.provider.historyProvider.get();
      const historyItemViewModel = inputOrElement.historyItemViewModel;
      const historyItem = historyItemViewModel.historyItem;
      let historyItemId, historyItemParentId;
      if (historyItemViewModel.kind === "incoming-changes" || historyItemViewModel.kind === "outgoing-changes") {
        const historyItemRef = historyProvider?.historyItemRef.get();
        const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
        if (!historyProvider || !historyItemRef || !historyItemRemoteRef) {
          return [];
        }
        historyItemId = historyItemViewModel.kind === "incoming-changes" ? historyItemRemoteRef.id : historyItemRef.id;
        historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
          historyItemRef.name,
          historyItemRemoteRef.name
        ]);
      } else {
        historyItemId = historyItem.id;
        if (historyItem.parentIds.length > 0) {
          if (historyItem.parentIds[0] === SCMIncomingHistoryItemId) {
            const historyItemRef = historyProvider?.historyItemRef.get();
            const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
            if (!historyProvider || !historyItemRef || !historyItemRemoteRef) {
              return [];
            }
            historyItemParentId = await historyProvider.resolveHistoryItemRefsCommonAncestor([
              historyItemRef.name,
              historyItemRemoteRef.name
            ]);
          } else {
            historyItemParentId = historyItem.parentIds[0];
          }
        }
      }
      const historyItemChanges = await historyProvider?.provideHistoryItemChanges(historyItemId, historyItemParentId) ?? [];
      if (this.viewMode() === ViewMode.List) {
        children.push(...historyItemChanges.map((change) => ({
          repository: inputOrElement.repository,
          historyItemViewModel: inputOrElement.historyItemViewModel,
          historyItemChange: change,
          graphColumns: inputOrElement.historyItemViewModel.outputSwimlanes,
          type: "historyItemChangeViewModel"
        })));
      } else if (this.viewMode() === ViewMode.Tree) {
        const rootUri = inputOrElement.repository.provider.rootUri ?? URI.file("/");
        const historyItemChangesTree = new ResourceTree(inputOrElement, rootUri);
        for (const change of historyItemChanges) {
          historyItemChangesTree.add(change.uri, {
            repository: inputOrElement.repository,
            historyItemViewModel: inputOrElement.historyItemViewModel,
            historyItemChange: change,
            graphColumns: inputOrElement.historyItemViewModel.outputSwimlanes,
            type: "historyItemChangeViewModel"
          });
        }
        for (const node of historyItemChangesTree.root.children) {
          children.push(node.element ?? node);
        }
      }
    } else if (ResourceTree.isResourceNode(inputOrElement) && isSCMHistoryItemChangeNode(inputOrElement)) {
      for (const node of inputOrElement.children) {
        children.push(node.element && node.childrenCount === 0 ? node.element : node);
      }
    }
    return children;
  }
  hasChildren(inputOrElement) {
    return inputOrElement instanceof SCMHistoryViewModel || isSCMHistoryItemViewModelTreeElement(inputOrElement) || isSCMHistoryItemChangeNode(inputOrElement) && inputOrElement.childrenCount > 0;
  }
}
class SCMHistoryTreeDragAndDrop {
  getDragURI(element) {
    const uri = this._getTreeElementUri(element);
    return uri ? uri.toString() : null;
  }
  onDragStart(data, originalEvent) {
    if (!originalEvent.dataTransfer) {
      return;
    }
    const historyItems = this._getDragAndDropData(data);
    if (historyItems.length === 0) {
      return;
    }
    originalEvent.dataTransfer.setData(CodeDataTransfers.SCM_HISTORY_ITEM, JSON.stringify(historyItems));
  }
  getDragLabel(elements, originalEvent) {
    if (elements.length === 1) {
      const element = elements[0];
      return this._getTreeElementLabel(element);
    }
    return String(elements.length);
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    return false;
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
  }
  _getDragAndDropData(data) {
    const historyItems = [];
    for (const element of [...data.context ?? [], ...data.elements]) {
      if (!isSCMHistoryItemViewModelTreeElement(element)) {
        continue;
      }
      const provider = element.repository.provider;
      const historyItem = element.historyItemViewModel.historyItem;
      const attachmentName = `$(${Codicon.repo.id})\xA0${provider.name}\xA0$(${Codicon.gitCommit.id})\xA0${historyItem.displayId ?? historyItem.id}`;
      const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : void 0;
      historyItems.push({
        name: attachmentName,
        resource: ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem.id, historyItemParentId, historyItem.displayId),
        historyItem
      });
    }
    return historyItems;
  }
  _getTreeElementLabel(element) {
    if (isSCMHistoryItemViewModelTreeElement(element)) {
      const historyItem = element.historyItemViewModel.historyItem;
      return historyItem.displayId ?? historyItem.id;
    }
    return void 0;
  }
  _getTreeElementUri(element) {
    if (isSCMHistoryItemViewModelTreeElement(element)) {
      const provider = element.repository.provider;
      const historyItem = element.historyItemViewModel.historyItem;
      const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : void 0;
      return ScmHistoryItemResolver.getMultiDiffSourceUri(provider, historyItem.id, historyItemParentId, historyItem.displayId);
    }
    return void 0;
  }
  dispose() {
  }
}
let SCMHistoryViewModel = class extends Disposable {
  constructor(_configurationService, _contextKeyService, _extensionService, _scmService, _scmViewService, _storageService) {
    super();
    this._configurationService = _configurationService;
    this._contextKeyService = _contextKeyService;
    this._extensionService = _extensionService;
    this._scmService = _scmService;
    this._scmViewService = _scmViewService;
    this._storageService = _storageService;
    this._selectedRepository = observableValue(this, "auto");
    this.onDidChangeHistoryItemsFilter = observableSignal(this);
    this.isViewModelEmpty = observableValue(this, false);
    this._repositoryState = /* @__PURE__ */ new Map();
    this._repositoryFilterState = /* @__PURE__ */ new Map();
    this._repositoryFilterState = this._loadHistoryItemsFilterState();
    this.viewMode = observableValue(this, this._getViewMode());
    this._extensionService.onWillStop(this._saveHistoryItemsFilterState, this, this._store);
    this._storageService.onWillSaveState(this._saveHistoryItemsFilterState, this, this._store);
    this._scmHistoryItemCountCtx = ContextKeys.SCMHistoryItemCount.bindTo(this._contextKeyService);
    this._scmHistoryViewModeCtx = ContextKeys.SCMHistoryViewMode.bindTo(this._contextKeyService);
    this._scmHistoryViewModeCtx.set(this.viewMode.get());
    const firstRepository = this._scmService.repositoryCount > 0 ? constObservable(Iterable.first(this._scmService.repositories)) : observableFromEvent(
      this,
      Event.once(this._scmService.onDidAddRepository),
      (repository) => repository
    );
    const graphRepository = derived((reader) => {
      const selectedRepository = this._selectedRepository.read(reader);
      if (selectedRepository !== "auto") {
        return selectedRepository;
      }
      return this._scmViewService.activeRepository.read(reader)?.repository;
    });
    this.repository = latestChangedValue(this, [firstRepository, graphRepository]);
    const closedRepository = observableFromEvent(
      this,
      this._scmService.onDidRemoveRepository,
      (repository) => repository
    );
    this._register(autorun((reader) => {
      const repository = closedRepository.read(reader);
      if (!repository) {
        return;
      }
      if (this.repository.read(void 0) === repository) {
        this._selectedRepository.set(Iterable.first(this._scmService.repositories) ?? "auto", void 0);
      }
      this._repositoryState.delete(repository);
    }));
  }
  clearRepositoryState() {
    const repository = this.repository.get();
    if (!repository) {
      return;
    }
    this._repositoryState.delete(repository);
  }
  getHistoryItemsFilter() {
    const repository = this.repository.get();
    if (!repository) {
      return;
    }
    const filterState = this._repositoryFilterState.get(getProviderKey(repository.provider)) ?? "auto";
    if (filterState === "all" || filterState === "auto") {
      return filterState;
    }
    const repositoryState = this._repositoryState.get(repository);
    return repositoryState?.historyItemsFilter;
  }
  getCurrentHistoryItemTreeElement() {
    const repository = this.repository.get();
    if (!repository) {
      return void 0;
    }
    const state = this._repositoryState.get(repository);
    if (!state) {
      return void 0;
    }
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    return state.viewModels.find((viewModel) => viewModel.historyItemViewModel.historyItem.id === historyItemRef?.revision);
  }
  loadMore(cursor) {
    const repository = this.repository.get();
    if (!repository) {
      return;
    }
    const state = this._repositoryState.get(repository);
    if (!state) {
      return;
    }
    this._repositoryState.set(repository, { ...state, loadMore: cursor ?? true });
  }
  async getHistoryItems() {
    const repository = this.repository.get();
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
    if (!repository || !historyProvider) {
      this._scmHistoryItemCountCtx.set(0);
      this.isViewModelEmpty.set(true, void 0);
      return [];
    }
    let state = this._repositoryState.get(repository);
    if (!state || state.loadMore !== false) {
      const historyItems = state?.viewModels.filter((vm) => vm.historyItemViewModel.kind !== "incoming-changes" && vm.historyItemViewModel.kind !== "outgoing-changes").map((vm) => vm.historyItemViewModel.historyItem) ?? [];
      const historyItemRefs = state?.historyItemsFilter ?? await this._resolveHistoryItemFilter(repository, historyProvider);
      const limit = clamp(this._configurationService.getValue("scm.graph.pageSize"), 1, 1e3);
      const historyItemRefIds = historyItemRefs.map((ref) => ref.revision ?? ref.id);
      do {
        historyItems.push(...await historyProvider.provideHistoryItems({
          historyItemRefs: historyItemRefIds,
          limit,
          skip: historyItems.length
        }) ?? []);
      } while (typeof state?.loadMore === "string" && !historyItems.find((item) => item.id === state?.loadMore));
      const mergeBase = historyItemRef && historyItemRemoteRef && state?.mergeBase === void 0 ? await historyProvider.resolveHistoryItemRefsCommonAncestor([
        historyItemRef.name,
        historyItemRemoteRef.name
      ]) : state?.mergeBase;
      const colorMap = this._getGraphColorMap(historyItemRefs);
      const addIncomingChangesNode = this._scmViewService.graphShowIncomingChangesConfig.get() && historyItemRefs.some((ref) => ref.id === historyItemRemoteRef?.id);
      const addOutgoingChangesNode = this._scmViewService.graphShowOutgoingChangesConfig.get() && historyItemRefs.some((ref) => ref.id === historyItemRef?.id);
      const viewModels = toISCMHistoryItemViewModelArray(
        historyItems,
        colorMap,
        historyProvider.historyItemRef.get(),
        historyProvider.historyItemRemoteRef.get(),
        historyProvider.historyItemBaseRef.get(),
        addIncomingChangesNode,
        addOutgoingChangesNode,
        mergeBase
      ).map((historyItemViewModel) => ({
        repository,
        historyItemViewModel,
        type: "historyItemViewModel"
      }));
      state = { historyItemsFilter: historyItemRefs, viewModels, mergeBase, loadMore: false };
      this._repositoryState.set(repository, state);
      this._scmHistoryItemCountCtx.set(viewModels.length);
      this.isViewModelEmpty.set(viewModels.length === 0, void 0);
    }
    return state.viewModels;
  }
  setRepository(repository) {
    this._selectedRepository.set(repository, void 0);
  }
  setHistoryItemsFilter(filter) {
    const repository = this.repository.get();
    if (!repository) {
      return;
    }
    if (filter !== "auto") {
      this._repositoryFilterState.set(getProviderKey(repository.provider), filter);
    } else {
      this._repositoryFilterState.delete(getProviderKey(repository.provider));
    }
    this._saveHistoryItemsFilterState();
    this.onDidChangeHistoryItemsFilter.trigger(void 0);
  }
  setViewMode(viewMode) {
    if (viewMode === this.viewMode.get()) {
      return;
    }
    this.viewMode.set(viewMode, void 0);
    this._scmHistoryViewModeCtx.set(viewMode);
    this._storageService.store("scm.graphView.viewMode", viewMode, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  _getViewMode() {
    let mode = this._configurationService.getValue("scm.defaultViewMode") === "list" ? ViewMode.List : ViewMode.Tree;
    const storageMode = this._storageService.get("scm.graphView.viewMode", StorageScope.WORKSPACE);
    if (typeof storageMode === "string") {
      mode = storageMode;
    }
    return mode;
  }
  _getGraphColorMap(historyItemRefs) {
    const repository = this.repository.get();
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    const historyItemRemoteRef = historyProvider?.historyItemRemoteRef.get();
    const historyItemBaseRef = historyProvider?.historyItemBaseRef.get();
    const colorMap = /* @__PURE__ */ new Map();
    if (historyItemRef) {
      colorMap.set(historyItemRef.id, historyItemRef.color);
      if (historyItemRemoteRef) {
        colorMap.set(historyItemRemoteRef.id, historyItemRemoteRef.color);
      }
      if (historyItemBaseRef) {
        colorMap.set(historyItemBaseRef.id, historyItemBaseRef.color);
      }
    }
    for (const ref of historyItemRefs) {
      if (!colorMap.has(ref.id)) {
        colorMap.set(ref.id, void 0);
      }
    }
    return colorMap;
  }
  async _resolveHistoryItemFilter(repository, historyProvider) {
    const historyItemRefs = [];
    const historyItemsFilter = this._repositoryFilterState.get(getProviderKey(repository.provider)) ?? "auto";
    switch (historyItemsFilter) {
      case "all":
        historyItemRefs.push(...await historyProvider.provideHistoryItemRefs() ?? []);
        break;
      case "auto":
        historyItemRefs.push(...[
          historyProvider.historyItemRef.get(),
          historyProvider.historyItemRemoteRef.get(),
          historyProvider.historyItemBaseRef.get()
        ].filter((ref) => !!ref));
        break;
      default: {
        const refs = (await historyProvider.provideHistoryItemRefs(historyItemsFilter) ?? []).filter((ref) => historyItemsFilter.some((filter) => filter === ref.id));
        if (refs.length === 0) {
          historyItemRefs.push(...[
            historyProvider.historyItemRef.get(),
            historyProvider.historyItemRemoteRef.get(),
            historyProvider.historyItemBaseRef.get()
          ].filter((ref) => !!ref));
          this._repositoryFilterState.delete(getProviderKey(repository.provider));
        } else {
          historyItemRefs.push(...refs);
          this._repositoryFilterState.set(getProviderKey(repository.provider), refs.map((ref) => ref.id));
        }
        this._saveHistoryItemsFilterState();
        break;
      }
    }
    return historyItemRefs;
  }
  _loadHistoryItemsFilterState() {
    try {
      const filterData = this._storageService.get("scm.graphView.referencesFilter", StorageScope.WORKSPACE);
      if (filterData) {
        return new Map(JSON.parse(filterData));
      }
    } catch {
    }
    return /* @__PURE__ */ new Map();
  }
  _saveHistoryItemsFilterState() {
    const filter = Array.from(this._repositoryFilterState.entries());
    this._storageService.store("scm.graphView.referencesFilter", JSON.stringify(filter), StorageScope.WORKSPACE, StorageTarget.USER);
  }
  dispose() {
    this._repositoryState.clear();
    super.dispose();
  }
};
SCMHistoryViewModel = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, ISCMService),
  __decorateParam(4, ISCMViewService),
  __decorateParam(5, IStorageService)
], SCMHistoryViewModel);
let RepositoryPicker = class {
  constructor(_quickInputService, _scmViewService) {
    this._quickInputService = _quickInputService;
    this._scmViewService = _scmViewService;
    this._autoQuickPickItem = {
      label: localize("auto", "Auto"),
      description: localize("activeRepository", "Show the source control graph for the active repository"),
      repository: "auto"
    };
  }
  async pickRepository() {
    const picks = [
      this._autoQuickPickItem,
      { type: "separator" }
    ];
    picks.push(...this._scmViewService.repositories.map((r) => ({
      label: r.provider.name,
      description: r.provider.rootUri?.fsPath,
      iconClass: ThemeIcon.isThemeIcon(r.provider.iconPath) ? ThemeIcon.asClassName(r.provider.iconPath) : ThemeIcon.asClassName(Codicon.repo),
      repository: r
    })));
    return this._quickInputService.pick(picks, {
      placeHolder: localize("scmGraphRepository", "Select the repository to view, type to filter all repositories")
    });
  }
};
RepositoryPicker = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, ISCMViewService)
], RepositoryPicker);
let HistoryItemRefPicker = class extends Disposable {
  constructor(_historyProvider, _historyItemsFilter, _quickInputService) {
    super();
    this._historyProvider = _historyProvider;
    this._historyItemsFilter = _historyItemsFilter;
    this._quickInputService = _quickInputService;
    this._allQuickPickItem = {
      id: "all",
      label: localize("all", "All"),
      description: localize("allHistoryItemRefs", "All history item references"),
      historyItemRef: "all"
    };
    this._autoQuickPickItem = {
      id: "auto",
      label: localize("auto", "Auto"),
      description: localize("currentHistoryItemRef", "Current history item reference(s)"),
      historyItemRef: "auto"
    };
  }
  async pickHistoryItemRef() {
    const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
    this._store.add(quickPick);
    quickPick.placeholder = localize("scmGraphHistoryItemRef", "Select one/more history item references to view, type to filter");
    quickPick.canSelectMany = true;
    quickPick.hideCheckAll = true;
    quickPick.busy = true;
    quickPick.show();
    const items = await this._createQuickPickItems();
    let selectedItems = [];
    if (this._historyItemsFilter === "all") {
      selectedItems.push(this._allQuickPickItem);
    } else if (this._historyItemsFilter === "auto") {
      selectedItems.push(this._autoQuickPickItem);
    } else {
      let index = 0;
      while (index < items.length) {
        if (items[index].type === "separator") {
          index++;
          continue;
        }
        if (this._historyItemsFilter.some((ref) => ref.id === items[index].id)) {
          const item = items.splice(index, 1);
          selectedItems.push(...item);
        } else {
          index++;
        }
      }
      items.splice(2, 0, { type: "separator" }, ...selectedItems);
    }
    quickPick.items = items;
    quickPick.selectedItems = selectedItems;
    quickPick.busy = false;
    return new Promise((resolve) => {
      this._store.add(quickPick.onDidChangeSelection((items2) => {
        const { added } = delta(selectedItems, items2, (a, b) => compare(a.id ?? "", b.id ?? ""));
        if (added.length > 0) {
          if (added[0].historyItemRef === "all" || added[0].historyItemRef === "auto") {
            quickPick.selectedItems = [added[0]];
          } else {
            quickPick.selectedItems = [...quickPick.selectedItems.filter((i) => i.historyItemRef !== "all" && i.historyItemRef !== "auto")];
          }
        }
        selectedItems = [...quickPick.selectedItems];
      }));
      this._store.add(quickPick.onDidAccept(() => {
        if (selectedItems.length === 0) {
          resolve(void 0);
        } else if (selectedItems.length === 1 && selectedItems[0].historyItemRef === "all") {
          resolve("all");
        } else if (selectedItems.length === 1 && selectedItems[0].historyItemRef === "auto") {
          resolve("auto");
        } else {
          resolve(selectedItems.map((item) => item.historyItemRef.id));
        }
        quickPick.hide();
      }));
      this._store.add(quickPick.onDidHide(() => {
        resolve(void 0);
        this.dispose();
      }));
    });
  }
  async _createQuickPickItems() {
    const picks = [
      this._allQuickPickItem,
      this._autoQuickPickItem
    ];
    const historyItemRefs = await this._historyProvider.provideHistoryItemRefs() ?? [];
    const historyItemRefsByCategory = groupBy(historyItemRefs, (a, b) => compare(a.category ?? "", b.category ?? ""));
    for (const refs of historyItemRefsByCategory) {
      if (refs.length === 0) {
        continue;
      }
      picks.push({ type: "separator", label: refs[0].category });
      picks.push(...refs.map((ref) => {
        return {
          id: ref.id,
          label: ref.name,
          description: ref.description,
          iconClass: ThemeIcon.isThemeIcon(ref.icon) ? ThemeIcon.asClassName(ref.icon) : void 0,
          historyItemRef: ref
        };
      }));
    }
    return picks;
  }
};
HistoryItemRefPicker = __decorateClass([
  __decorateParam(2, IQuickInputService)
], HistoryItemRefPicker);
let SCMHistoryViewPane = class extends ViewPane {
  constructor(options, _editorService, _instantiationService, _menuService, _progressService, _scmViewService, configurationService, contextMenuService, keybindingService, instantiationService, viewDescriptorService, contextKeyService, openerService, themeService, hoverService) {
    super({
      ...options,
      titleMenuId: MenuId.SCMHistoryTitle,
      showActions: ViewPaneShowActions.WhenExpanded
    }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._menuService = _menuService;
    this._progressService = _progressService;
    this._scmViewService = _scmViewService;
    this._repositoryIsLoadingMore = observableValue(this, false);
    this._repositoryOutdated = observableValue(this, false);
    this._visibilityDisposables = new DisposableStore();
    this._treeOperationSequencer = new Sequencer();
    this._treeLoadMoreSequencer = new Sequencer();
    this._refreshThrottler = new Throttler();
    this._updateChildrenThrottler = new Throttler();
    this._contextMenuDisposables = new MutableDisposable();
    this._scmProviderCtx = ContextKeys.SCMProvider.bindTo(this.scopedContextKeyService);
    this._scmCurrentHistoryItemRefHasRemote = ContextKeys.SCMCurrentHistoryItemRefHasRemote.bindTo(this.scopedContextKeyService);
    this._scmCurrentHistoryItemRefHasBase = ContextKeys.SCMCurrentHistoryItemRefHasBase.bindTo(this.scopedContextKeyService);
    this._scmCurrentHistoryItemRefInFilter = ContextKeys.SCMCurrentHistoryItemRefInFilter.bindTo(this.scopedContextKeyService);
    this._actionRunner = this.instantiationService.createInstance(SCMHistoryViewPaneActionRunner);
    this._register(this._actionRunner);
    this._register(this._refreshThrottler);
    this._register(this._updateChildrenThrottler);
  }
  renderHeaderTitle(container) {
    super.renderHeaderTitle(container, this.title);
    const element = h("div.scm-graph-view-badge-container", [
      h("div.scm-graph-view-badge.monaco-count-badge.long@badge")
    ]);
    element.badge.textContent = "Outdated";
    container.appendChild(element.root);
    this._register(autorun((reader) => {
      const outdated = this._repositoryOutdated.read(reader);
      element.root.style.display = outdated ? "" : "none";
      if (outdated) {
        reader.store.add(this.hoverService.setupDelayedHover(element.root, {
          appearance: {
            compact: true,
            showPointer: true
          },
          content: new MarkdownString(localize("scmGraphViewOutdated", "Please refresh the graph using the refresh action ({0}).", "$(refresh)"), { supportThemeIcons: true }),
          position: {
            hoverPosition: HoverPosition.BELOW
          }
        }));
      }
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    this._treeContainer = append(container, $(".scm-view.scm-history-view.show-file-icons"));
    this._treeContainer.classList.add("file-icon-themable-tree");
    this._createTree(this._treeContainer);
    this.onDidChangeBodyVisibility(async (visible) => {
      if (!visible) {
        this._visibilityDisposables.clear();
        return;
      }
      this._treeViewModel = this.instantiationService.createInstance(SCMHistoryViewModel);
      this._visibilityDisposables.add(this._treeViewModel);
      const firstRepositoryInitialized = derived(this, (reader) => {
        const repository = this._treeViewModel.repository.read(reader);
        const historyProvider = repository?.provider.historyProvider.read(reader);
        const historyItemRef = historyProvider?.historyItemRef.read(reader);
        return historyItemRef !== void 0 ? true : void 0;
      });
      await waitForState(firstRepositoryInitialized);
      await this._progressService.withProgress({ location: this.id }, async () => {
        await this._treeOperationSequencer.queue(async () => {
          await this._tree.setInput(this._treeViewModel);
          this._tree.scrollTop = 0;
        });
      });
      this._visibilityDisposables.add(autorun((reader) => {
        this._treeViewModel.isViewModelEmpty.read(reader);
        this._onDidChangeViewWelcomeState.fire();
      }));
      this._visibilityDisposables.add(runOnChange(this._scmViewService.graphShowIncomingChangesConfig, async () => {
        await this.refresh();
      }));
      this._visibilityDisposables.add(runOnChange(this._scmViewService.graphShowOutgoingChangesConfig, async () => {
        await this.refresh();
      }));
      let isFirstRun = true;
      this._visibilityDisposables.add(autorun((reader) => {
        const repository = this._treeViewModel.repository.read(reader);
        const historyProvider = repository?.provider.historyProvider.read(reader);
        if (!repository || !historyProvider) {
          return;
        }
        const historyItemRefId = derived((reader2) => {
          return historyProvider.historyItemRef.read(reader2)?.id;
        });
        reader.store.add(runOnChange(historyItemRefId, async (historyItemRefIdValue) => {
          await this.refresh();
          this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefIdValue));
        }));
        reader.store.add(runOnChange(historyProvider.historyItemRefChanges, (changes) => {
          if (changes.silent) {
            if (this._tree.scrollTop === 0) {
              this.refresh();
              return;
            }
            this._repositoryOutdated.set(true, void 0);
            return;
          }
          this.refresh();
        }));
        reader.store.add(runOnChange(this._treeViewModel.onDidChangeHistoryItemsFilter, async () => {
          await this.refresh();
          this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefId.read(void 0)));
        }));
        reader.store.add(autorun((reader2) => {
          this._scmCurrentHistoryItemRefHasRemote.set(!!historyProvider.historyItemRemoteRef.read(reader2));
        }));
        reader.store.add(autorun((reader2) => {
          this._scmCurrentHistoryItemRefHasBase.set(!!historyProvider.historyItemBaseRef.read(reader2));
        }));
        reader.store.add(runOnChange(this._treeViewModel.viewMode, async () => {
          await this._updateChildren();
        }));
        this._scmProviderCtx.set(repository.provider.providerId);
        this._scmCurrentHistoryItemRefInFilter.set(this._isCurrentHistoryItemInFilter(historyItemRefId.read(void 0)));
        if (!isFirstRun) {
          this.refresh();
        }
        isFirstRun = false;
      }));
      const fileIconThemeObs = observableFromEvent(
        this.themeService.onDidFileIconThemeChange,
        () => this.themeService.getFileIconTheme()
      );
      this._visibilityDisposables.add(autorun((reader) => {
        const fileIconTheme = fileIconThemeObs.read(reader);
        const viewMode = this._treeViewModel.viewMode.read(reader);
        this._updateIndentStyles(fileIconTheme, viewMode);
      }));
    }, this, this._store);
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this._tree.layout(height, width);
  }
  getActionRunner() {
    return this._actionRunner;
  }
  getActionsContext() {
    return this._treeViewModel?.repository.get()?.provider;
  }
  createActionViewItem(action, options) {
    if (action.id === PICK_REPOSITORY_ACTION_ID) {
      const repository = this._treeViewModel?.repository.get();
      if (repository) {
        return new SCMRepositoryActionViewItem(repository, action, options);
      }
    } else if (action.id === PICK_HISTORY_ITEM_REFS_ACTION_ID) {
      const repository = this._treeViewModel?.repository.get();
      const historyItemsFilter = this._treeViewModel?.getHistoryItemsFilter();
      if (repository && historyItemsFilter) {
        return new SCMHistoryItemRefsActionViewItem(repository, historyItemsFilter, action, options);
      }
    }
    return super.createActionViewItem(action, options);
  }
  focus() {
    super.focus();
    const fakeKeyboardEvent = new KeyboardEvent("keydown");
    this._tree.focusFirst(fakeKeyboardEvent);
    this._tree.domFocus();
  }
  shouldShowWelcome() {
    return this._treeViewModel?.isViewModelEmpty.get() === true;
  }
  async refresh() {
    return this._refreshThrottler.queue((token) => this._refresh(token));
  }
  async _refresh(token) {
    if (token.isCancellationRequested) {
      return;
    }
    this._treeViewModel.clearRepositoryState();
    await this._updateChildren();
    if (token.isCancellationRequested) {
      return;
    }
    this.updateActions();
    this._repositoryOutdated.set(false, void 0);
    this._tree.scrollTop = 0;
  }
  async pickRepository() {
    const picker = this._instantiationService.createInstance(RepositoryPicker);
    const result = await picker.pickRepository();
    if (result) {
      this._treeViewModel.setRepository(result.repository);
    }
  }
  async pickHistoryItemRef() {
    const repository = this._treeViewModel.repository.get();
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemsFilter = this._treeViewModel.getHistoryItemsFilter();
    if (!historyProvider || !historyItemsFilter) {
      return;
    }
    const picker = this._instantiationService.createInstance(HistoryItemRefPicker, historyProvider, historyItemsFilter);
    const result = await picker.pickHistoryItemRef();
    if (result) {
      this._treeViewModel.setHistoryItemsFilter(result);
    }
  }
  async revealCurrentHistoryItem() {
    const repository = this._treeViewModel.repository.get();
    const historyProvider = repository?.provider.historyProvider.get();
    const historyItemRef = historyProvider?.historyItemRef.get();
    if (!repository || !historyItemRef?.id || !historyItemRef?.revision) {
      return;
    }
    if (!this._isCurrentHistoryItemInFilter(historyItemRef.id)) {
      return;
    }
    const revealTreeNode = () => {
      const historyItemTreeElement = this._treeViewModel.getCurrentHistoryItemTreeElement();
      if (historyItemTreeElement && this._tree.hasNode(historyItemTreeElement)) {
        this._tree.reveal(historyItemTreeElement, 0.5);
        this._tree.setSelection([historyItemTreeElement]);
        this._tree.setFocus([historyItemTreeElement]);
        return true;
      }
      return false;
    };
    if (revealTreeNode()) {
      return;
    }
    await this._loadMore(historyItemRef.revision);
    revealTreeNode();
  }
  setViewMode(viewMode) {
    this._treeViewModel.setViewMode(viewMode);
  }
  _createTree(container) {
    this._treeIdentityProvider = new SCMHistoryTreeIdentityProvider();
    const resourceLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this._register(resourceLabels);
    this._treeDataSource = this.instantiationService.createInstance(SCMHistoryTreeDataSource, () => this._treeViewModel.viewMode.get());
    this._register(this._treeDataSource);
    const compressionEnabled = observableConfigValue("scm.compactFolders", true, this.configurationService);
    this._tree = this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "SCM History Tree",
      container,
      new ListDelegate(),
      new SCMHistoryTreeCompressionDelegate(),
      [
        this.instantiationService.createInstance(HistoryItemRenderer, this.viewDescriptorService.getViewLocationById(this.id)),
        this.instantiationService.createInstance(HistoryItemChangeRenderer, () => this._treeViewModel.viewMode.get(), resourceLabels),
        this.instantiationService.createInstance(HistoryItemLoadMoreRenderer, this._repositoryIsLoadingMore, () => this._loadMore())
      ],
      this._treeDataSource,
      {
        accessibilityProvider: new SCMHistoryTreeAccessibilityProvider(),
        identityProvider: this._treeIdentityProvider,
        collapseByDefault: (e) => !isSCMHistoryItemChangeNode(e),
        compressionEnabled: compressionEnabled.get(),
        dnd: new SCMHistoryTreeDragAndDrop(),
        keyboardNavigationLabelProvider: new SCMHistoryTreeKeyboardNavigationLabelProvider(),
        horizontalScrolling: false,
        multipleSelectionSupport: false,
        twistieAdditionalCssClass: (e) => {
          return isSCMHistoryItemViewModelTreeElement(e) || isSCMHistoryItemLoadMoreTreeElement(e) ? "force-no-twistie" : void 0;
        }
      }
    );
    this._register(this._tree);
    this._tree.onDidOpen(this._onDidOpen, this, this._store);
    this._tree.onContextMenu(this._onContextMenu, this, this._store);
  }
  _isCurrentHistoryItemInFilter(historyItemRefId) {
    if (!historyItemRefId) {
      return false;
    }
    const historyItemFilter = this._treeViewModel.getHistoryItemsFilter();
    if (historyItemFilter === "all" || historyItemFilter === "auto") {
      return true;
    }
    return Array.isArray(historyItemFilter) && !!historyItemFilter.find((ref) => ref.id === historyItemRefId);
  }
  async _onDidOpen(e) {
    if (!e.element) {
      return;
    } else if (isSCMHistoryItemChangeViewModelTreeElement(e.element)) {
      const historyItemChange = e.element.historyItemChange;
      const historyItem = e.element.historyItemViewModel.historyItem;
      const historyItemDisplayId = historyItem.id === SCMIncomingHistoryItemId ? localize("incomingChanges", "Incoming Changes") : historyItem.id === SCMOutgoingHistoryItemId ? localize("outgoingChanges", "Outgoing Changes") : historyItem.displayId ?? historyItem.id;
      const historyItemParentId = historyItem.parentIds.length > 0 ? historyItem.parentIds[0] : void 0;
      const historyItemParentDisplayId = historyItemParentId && historyItem.displayId ? historyItemParentId.substring(0, historyItem.displayId.length) : historyItemParentId;
      if (historyItemChange.originalUri && historyItemChange.modifiedUri) {
        const originalUriTitle = `${basename(historyItemChange.originalUri.fsPath)} (${historyItemParentDisplayId})`;
        const modifiedUriTitle = `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItemDisplayId})`;
        const title = `${originalUriTitle} \u2194 ${modifiedUriTitle}`;
        await this._editorService.openEditor({
          label: title,
          original: { resource: historyItemChange.originalUri },
          modified: { resource: historyItemChange.modifiedUri },
          options: e.editorOptions
        });
      } else if (historyItemChange.modifiedUri) {
        await this._editorService.openEditor({
          label: `${basename(historyItemChange.modifiedUri.fsPath)} (${historyItemDisplayId})`,
          resource: historyItemChange.modifiedUri,
          options: e.editorOptions
        });
      } else if (historyItemChange.originalUri) {
        await this._editorService.openEditor({
          label: `${basename(historyItemChange.originalUri.fsPath)} (${historyItemParentDisplayId})`,
          resource: historyItemChange.originalUri,
          options: e.editorOptions
        });
      }
    } else if (isSCMHistoryItemLoadMoreTreeElement(e.element)) {
      const pageOnScroll = this.configurationService.getValue("scm.graph.pageOnScroll") === true;
      if (!pageOnScroll) {
        this._loadMore();
        this._tree.setSelection([]);
      }
    }
  }
  _onContextMenu(e) {
    const element = e.element;
    if (isSCMHistoryItemViewModelTreeElement(element)) {
      if (element.historyItemViewModel.kind === "incoming-changes" || element.historyItemViewModel.kind === "outgoing-changes") {
        return;
      }
      this._contextMenuDisposables.value = new DisposableStore();
      const historyProvider = element.repository.provider.historyProvider.get();
      const historyItemRef = historyProvider?.historyItemRef.get();
      const historyItem = element.historyItemViewModel.historyItem;
      const historyItemRefMenuItems = MenuRegistry.getMenuItems(MenuId.SCMHistoryItemRefContext).filter((item) => isIMenuItem(item));
      if (historyItemRefMenuItems.length > 0 && element.historyItemViewModel.historyItem.references?.length) {
        const historyItemRefActions = /* @__PURE__ */ new Map();
        for (const ref of element.historyItemViewModel.historyItem.references) {
          const contextKeyService2 = this.scopedContextKeyService.createOverlay([
            ["scmHistoryItemRef", ref.id]
          ]);
          const menuActions2 = this._menuService.getMenuActions(
            MenuId.SCMHistoryItemRefContext,
            contextKeyService2
          );
          for (const action of menuActions2.flatMap((a) => a[1])) {
            if (!historyItemRefActions.has(action.id)) {
              historyItemRefActions.set(action.id, []);
            }
            historyItemRefActions.get(action.id).push(ref);
          }
        }
        for (const historyItemRefMenuItem of historyItemRefMenuItems) {
          const actionId = historyItemRefMenuItem.command.id;
          if (!historyItemRefActions.has(actionId)) {
            continue;
          }
          this._contextMenuDisposables.value.add(MenuRegistry.appendMenuItem(MenuId.SCMHistoryItemContext, {
            title: historyItemRefMenuItem.command.title,
            submenu: MenuId.for(actionId),
            group: historyItemRefMenuItem?.group,
            order: historyItemRefMenuItem?.order
          }));
          for (const historyItemRef2 of historyItemRefActions.get(actionId) ?? []) {
            this._contextMenuDisposables.value.add(registerAction2(class extends Action2 {
              constructor() {
                super({
                  id: `${actionId}.${historyItemRef2.id}`,
                  title: historyItemRef2.name,
                  menu: {
                    id: MenuId.for(actionId),
                    group: historyItemRef2.category
                  }
                });
              }
              run(accessor, ...args) {
                const commandService = accessor.get(ICommandService);
                commandService.executeCommand(actionId, ...args, historyItemRef2.id);
              }
            }));
          }
        }
      }
      const contextKeyService = this.scopedContextKeyService.createOverlay([
        ["scmHistoryItemHasCurrentHistoryItemRef", historyItem.references?.find((ref) => ref.id === historyItemRef?.id) !== void 0]
      ]);
      const menuActions = this._menuService.getMenuActions(
        MenuId.SCMHistoryItemContext,
        contextKeyService,
        {
          arg: element.repository.provider,
          shouldForwardArgs: true
        }
      ).filter((group) => group[0] !== "inline");
      this.contextMenuService.showContextMenu({
        contextKeyService: this.scopedContextKeyService,
        getAnchor: () => e.anchor,
        getActions: () => getFlatContextMenuActions(menuActions),
        getActionsContext: () => element.historyItemViewModel.historyItem
      });
    } else if (isSCMHistoryItemChangeViewModelTreeElement(element)) {
      const menuActions = this._menuService.getMenuActions(
        MenuId.SCMHistoryItemChangeContext,
        this.scopedContextKeyService,
        {
          arg: element.historyItemViewModel.historyItem,
          shouldForwardArgs: true
        }
      ).filter((group) => group[0] !== "inline");
      this.contextMenuService.showContextMenu({
        contextKeyService: this.scopedContextKeyService,
        getAnchor: () => e.anchor,
        getActions: () => getFlatContextMenuActions(menuActions),
        getActionsContext: () => element.historyItemChange
      });
    }
  }
  async _loadMore(cursor) {
    return this._treeLoadMoreSequencer.queue(async () => {
      if (this._repositoryIsLoadingMore.get()) {
        return;
      }
      this._repositoryIsLoadingMore.set(true, void 0);
      this._treeViewModel.loadMore(cursor);
      await this._updateChildren();
      this._repositoryIsLoadingMore.set(false, void 0);
    });
  }
  _updateChildren() {
    return this._updateChildrenThrottler.queue(
      () => this._treeOperationSequencer.queue(
        async () => {
          await this._progressService.withProgress(
            { location: this.id, delay: 100 },
            async () => {
              await this._tree.updateChildren(void 0, void 0, void 0, {
                // diffIdentityProvider: this._treeIdentityProvider
              });
            }
          );
        }
      )
    );
  }
  _updateIndentStyles(theme, viewMode) {
    this._treeContainer.classList.toggle("list-view-mode", viewMode === ViewMode.List);
    this._treeContainer.classList.toggle("tree-view-mode", viewMode === ViewMode.Tree);
    this._treeContainer.classList.toggle("align-icons-and-twisties", viewMode === ViewMode.List && theme.hasFileIcons || theme.hasFileIcons && !theme.hasFolderIcons);
    this._treeContainer.classList.toggle("hide-arrows", viewMode === ViewMode.Tree && theme.hidesExplorerArrows === true);
  }
  dispose() {
    this._contextMenuDisposables.dispose();
    this._visibilityDisposables.dispose();
    super.dispose();
  }
};
SCMHistoryViewPane = __decorateClass([
  __decorateParam(1, IEditorService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, IProgressService),
  __decorateParam(5, ISCMViewService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService)
], SCMHistoryViewPane);
export {
  SCMHistoryViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbUhpc3RvcnlWaWV3UGFuZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9zY20uY3NzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgaCwgcmVzZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEhvdmVyU3R5bGUsIElEZWxheWVkSG92ZXJPcHRpb25zLCBJSG92ZXJMaWZlY3ljbGVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEljb25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgTGFiZWxGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlQ29udGV4dE1lbnVFdmVudCwgSVRyZWVEcmFnQW5kRHJvcCwgSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscywgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNYXRjaGVzLCBGdXp6eVNjb3JlLCBJTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgd2FpdEZvclN0YXRlLCBjb25zdE9ic2VydmFibGUsIGxhdGVzdENoYW5nZWRWYWx1ZSwgb2JzZXJ2YWJsZUZyb21FdmVudCwgcnVuT25DaGFuZ2UsIG9ic2VydmFibGVTaWduYWwsIElTZXR0YWJsZU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU9wZW5FdmVudCwgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUsIENvbG9ySWRlbnRpZmllciwgZm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElGaWxlSWNvblRoZW1lLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld1BhbmVPcHRpb25zLCBWaWV3QWN0aW9uLCBWaWV3UGFuZSwgVmlld1BhbmVTaG93QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IHJlbmRlclNDTUhpc3RvcnlJdGVtR3JhcGgsIHRvSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsQXJyYXksIFNXSU1MQU5FX1dJRFRILCByZW5kZXJTQ01IaXN0b3J5R3JhcGhQbGFjZWhvbGRlciwgaGlzdG9yeUl0ZW1Ib3ZlckxhYmVsRm9yZWdyb3VuZCwgaGlzdG9yeUl0ZW1Ib3ZlckRlZmF1bHRMYWJlbEJhY2tncm91bmQsIGdldEhpc3RvcnlJdGVtSW5kZXgsIHRvSGlzdG9yeUl0ZW1Ib3ZlckNvbnRlbnQgfSBmcm9tICcuL3NjbUhpc3RvcnkuanMnO1xuaW1wb3J0IHsgZ2V0SGlzdG9yeUl0ZW1FZGl0b3JUaXRsZSwgZ2V0UHJvdmlkZXJLZXksIGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VOb2RlLCBpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQsIGlzU0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50LCBpc1NDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQsIGlzU0NNUmVwb3NpdG9yeSB9IGZyb20gJy4vdXRpbC5qcyc7XG5pbXBvcnQgeyBJU0NNSGlzdG9yeUl0ZW0sIElTQ01IaXN0b3J5SXRlbUNoYW5nZSwgSVNDTUhpc3RvcnlJdGVtR3JhcGhOb2RlLCBJU0NNSGlzdG9yeUl0ZW1SZWYsIElTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbCwgSVNDTUhpc3RvcnlQcm92aWRlciwgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgU0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50LCBTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50LCBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQsIFNDTU91dGdvaW5nSGlzdG9yeUl0ZW1JZCB9IGZyb20gJy4uL2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IEhJU1RPUllfVklFV19QQU5FX0lELCBJU0NNUHJvdmlkZXIsIElTQ01SZXBvc2l0b3J5LCBJU0NNU2VydmljZSwgSVNDTVZpZXdTZXJ2aWNlLCBWaWV3TW9kZSB9IGZyb20gJy4uL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBpc0lNZW51SXRlbSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VxdWVuY2VyLCBUaHJvdHRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBJQWN0aW9uUnVubmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkZWx0YSwgZ3JvdXBCeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5cyB9IGZyb20gJy4vc2NtVmlld1BhbmUuanMnO1xuaW1wb3J0IHsgSUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSURyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGdyb3VwQnkgYXMgZ3JvdXBCeTIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zLCBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY21IaXN0b3J5SXRlbVJlc29sdmVyIH0gZnJvbSAnLi4vLi4vbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvc2NtTXVsdGlEaWZmU291cmNlUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTm9kZSwgUmVzb3VyY2VUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VUcmVlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NlZFRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElEcmFnQW5kRHJvcERhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IENvZGVEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IFNDTUhpc3RvcnlJdGVtVHJhbnNmZXJEYXRhIH0gZnJvbSAnLi9zY21IaXN0b3J5Q2hhdENvbnRleHQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuXG5jb25zdCBQSUNLX1JFUE9TSVRPUllfQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5zY20uYWN0aW9uLmdyYXBoLnBpY2tSZXBvc2l0b3J5JztcbmNvbnN0IFBJQ0tfSElTVE9SWV9JVEVNX1JFRlNfQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5zY20uYWN0aW9uLmdyYXBoLnBpY2tIaXN0b3J5SXRlbVJlZnMnO1xuXG50eXBlIFRyZWVFbGVtZW50ID0gU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudCB8IFNDTUhpc3RvcnlJdGVtTG9hZE1vcmVUcmVlRWxlbWVudCB8IFNDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQgfCBJUmVzb3VyY2VOb2RlPFNDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQsIFNDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQ+O1xuXG5jbGFzcyBTQ01SZXBvc2l0b3J5QWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3JlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5LCBhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM/OiBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLmxhYmVsICYmIHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LmFkZCgnc2NtLWdyYXBoLXJlcG9zaXRvcnktcGlja2VyJyk7XG5cblx0XHRcdGNvbnN0IGljb24gPSAkKCcuaWNvbicpO1xuXHRcdFx0Y29uc3QgaWNvbkNsYXNzTmFtZUFycmF5ID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKHRoaXMuX3JlcG9zaXRvcnkucHJvdmlkZXIuaWNvblBhdGgpXG5cdFx0XHRcdD8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGhpcy5fcmVwb3NpdG9yeS5wcm92aWRlci5pY29uUGF0aClcblx0XHRcdFx0OiBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnJlcG8pO1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKC4uLmljb25DbGFzc05hbWVBcnJheSk7XG5cblx0XHRcdGNvbnN0IG5hbWUgPSAkKCcubmFtZScpO1xuXHRcdFx0bmFtZS50ZXh0Q29udGVudCA9IHRoaXMuX3JlcG9zaXRvcnkucHJvdmlkZXIubmFtZTtcblxuXG5cdFx0XHRyZXNldCh0aGlzLmxhYmVsLCBpY29uLCBuYW1lKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZXBvc2l0b3J5LnByb3ZpZGVyLm5hbWU7XG5cdH1cbn1cblxuY2xhc3MgU0NNSGlzdG9yeUl0ZW1SZWZzQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlJdGVtc0ZpbHRlcjogJ2FsbCcgfCAnYXV0bycgfCBJU0NNSGlzdG9yeUl0ZW1SZWZbXSxcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9ucz86IElEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbU9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IGZhbHNlLCBsYWJlbDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLmxhYmVsICYmIHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LmFkZCgnc2NtLWdyYXBoLWhpc3RvcnktaXRlbS1waWNrZXInKTtcblxuXHRcdFx0Y29uc3QgaWNvbiA9ICQoJy5pY29uJyk7XG5cdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5naXRCcmFuY2gpKTtcblxuXHRcdFx0Y29uc3QgbmFtZSA9ICQoJy5uYW1lJyk7XG5cdFx0XHRpZiAodGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyID09PSAnYWxsJykge1xuXHRcdFx0XHRuYW1lLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FsbCcsIFwiQWxsXCIpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIgPT09ICdhdXRvJykge1xuXHRcdFx0XHRuYW1lLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2F1dG8nLCBcIkF1dG9cIik7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2hpc3RvcnlJdGVtc0ZpbHRlci5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0bmFtZS50ZXh0Q29udGVudCA9IHRoaXMuX2hpc3RvcnlJdGVtc0ZpbHRlclswXS5uYW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bmFtZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdpdGVtcycsIFwiezB9IEl0ZW1zXCIsIHRoaXMuX2hpc3RvcnlJdGVtc0ZpbHRlci5sZW5ndGgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXNldCh0aGlzLmxhYmVsLCBpY29uLCBuYW1lKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9oaXN0b3J5SXRlbXNGaWx0ZXIgPT09ICdhbGwnKSB7XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FsbEhpc3RvcnlJdGVtUmVmcycsIFwiQWxsIGhpc3RvcnkgaXRlbSByZWZlcmVuY2VzXCIpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyID09PSAnYXV0bycpIHtcblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHRoaXMuX3JlcG9zaXRvcnkucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLmdldCgpPy5uYW1lLFxuXHRcdFx0XHRoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVtb3RlUmVmLmdldCgpPy5uYW1lLFxuXHRcdFx0XHRoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtQmFzZVJlZi5nZXQoKT8ubmFtZVxuXHRcdFx0XS5maWx0ZXIocmVmID0+ICEhcmVmKS5qb2luKCcsICcpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2hpc3RvcnlJdGVtc0ZpbHRlclswXS5uYW1lO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyLm1hcChyZWYgPT4gcmVmLm5hbWUpLmpvaW4oJywgJyk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248U0NNSGlzdG9yeVZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBQSUNLX1JFUE9TSVRPUllfQUNUSU9OX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZXBvc2l0b3J5UGlja2VyJywgXCJSZXBvc2l0b3J5IFBpY2tlclwiKSxcblx0XHRcdHZpZXdJZDogSElTVE9SWV9WSUVXX1BBTkVfSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuU0NNSGlzdG9yeVRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdzY20ucHJvdmlkZXJDb3VudCcpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmdyZWF0ZXIoJ3NjbS5wcm92aWRlckNvdW50JywgMSksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuc2NtLnJlcG9zaXRvcmllcy5zZWxlY3Rpb25Nb2RlJywgJ211bHRpcGxlJykpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF86IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTUhpc3RvcnlWaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHZpZXcucGlja1JlcG9zaXRvcnkoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248U0NNSGlzdG9yeVZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBQSUNLX0hJU1RPUllfSVRFTV9SRUZTX0FDVElPTl9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmVmZXJlbmNlUGlja2VyJywgXCJIaXN0b3J5IEl0ZW0gUmVmZXJlbmNlIFBpY2tlclwiKSxcblx0XHRcdGljb246IENvZGljb24uZ2l0QnJhbmNoLFxuXHRcdFx0dmlld0lkOiBISVNUT1JZX1ZJRVdfUEFORV9JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleXMuU0NNSGlzdG9yeUl0ZW1Db3VudC5ub3RFcXVhbHNUbygwKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01IaXN0b3J5VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoXzogU2VydmljZXNBY2Nlc3NvciwgdmlldzogU0NNSGlzdG9yeVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5waWNrSGlzdG9yeUl0ZW1SZWYoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248U0NNSGlzdG9yeVZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnNjbS5hY3Rpb24uZ3JhcGgucmV2ZWFsQ3VycmVudEhpc3RvcnlJdGVtJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ29Ub0N1cnJlbnRIaXN0b3J5SXRlbScsIFwiR28gdG8gQ3VycmVudCBIaXN0b3J5IEl0ZW1cIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnRhcmdldCxcblx0XHRcdHZpZXdJZDogSElTVE9SWV9WSUVXX1BBTkVfSUQsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0Q29udGV4dEtleXMuU0NNSGlzdG9yeUl0ZW1Db3VudC5ub3RFcXVhbHNUbygwKSxcblx0XHRcdFx0Q29udGV4dEtleXMuU0NNQ3VycmVudEhpc3RvcnlJdGVtUmVmSW5GaWx0ZXIuaXNFcXVhbFRvKHRydWUpKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01IaXN0b3J5VGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoXzogU2VydmljZXNBY2Nlc3NvciwgdmlldzogU0NNSGlzdG9yeVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5yZXZlYWxDdXJyZW50SGlzdG9yeUl0ZW0oKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIFZpZXdBY3Rpb248U0NNSGlzdG9yeVZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnNjbS5hY3Rpb24uZ3JhcGgucmVmcmVzaCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JlZnJlc2hHcmFwaCcsIFwiUmVmcmVzaFwiKSxcblx0XHRcdHZpZXdJZDogSElTVE9SWV9WSUVXX1BBTkVfSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLnJlZnJlc2gsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuU0NNSGlzdG9yeVRpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMTAwMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF86IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTUhpc3RvcnlWaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHZpZXcucmVmcmVzaCgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVmlld0FjdGlvbjxTQ01IaXN0b3J5Vmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5ncmFwaC5zZXRMaXN0Vmlld01vZGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZXRMaXN0Vmlld01vZGUnLCBcIlZpZXcgYXMgTGlzdFwiKSxcblx0XHRcdHZpZXdJZDogSElTVE9SWV9WSUVXX1BBTkVfSUQsXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5cy5TQ01IaXN0b3J5Vmlld01vZGUuaXNFcXVhbFRvKFZpZXdNb2RlLkxpc3QpLFxuXHRcdFx0bWVudTogeyBpZDogTWVudUlkLlNDTUhpc3RvcnlUaXRsZSwgZ3JvdXA6ICc5X3ZpZXdtb2RlJywgb3JkZXI6IDEgfSxcblx0XHRcdGYxOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF86IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTUhpc3RvcnlWaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHZpZXcuc2V0Vmlld01vZGUoVmlld01vZGUuTGlzdCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBWaWV3QWN0aW9uPFNDTUhpc3RvcnlWaWV3UGFuZT4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5zY20uYWN0aW9uLmdyYXBoLnNldFRyZWVWaWV3TW9kZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NldFRyZWVWaWV3TW9kZScsIFwiVmlldyBhcyBUcmVlXCIpLFxuXHRcdFx0dmlld0lkOiBISVNUT1JZX1ZJRVdfUEFORV9JRCxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlzLlNDTUhpc3RvcnlWaWV3TW9kZS5pc0VxdWFsVG8oVmlld01vZGUuVHJlZSksXG5cdFx0XHRtZW51OiB7IGlkOiBNZW51SWQuU0NNSGlzdG9yeVRpdGxlLCBncm91cDogJzlfdmlld21vZGUnLCBvcmRlcjogMiB9LFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5JblZpZXcoXzogU2VydmljZXNBY2Nlc3NvciwgdmlldzogU0NNSGlzdG9yeVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy5zZXRWaWV3TW9kZShWaWV3TW9kZS5UcmVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5zY20uYWN0aW9uLmdyYXBoLnZpZXdDaGFuZ2VzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnb3BlbkNoYW5nZXMnLCBcIk9wZW4gQ2hhbmdlc1wiKSxcblx0XHRcdGljb246IENvZGljb24uZGlmZk11bHRpcGxlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01IaXN0b3J5SXRlbUNvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNDTUhpc3RvcnlJdGVtQ29udGV4dCxcblx0XHRcdFx0XHRncm91cDogJzBfdmlldycsXG5cdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBwcm92aWRlcjogSVNDTVByb3ZpZGVyLCAuLi5oaXN0b3J5SXRlbXM6IElTQ01IaXN0b3J5SXRlbVtdKSB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSBwcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVtb3RlUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlbW90ZVJlZi5nZXQoKTtcblxuXHRcdGlmICghcHJvdmlkZXIgfHwgIWhpc3RvcnlQcm92aWRlciB8fCAhaGlzdG9yeUl0ZW1SZWYgfHwgaGlzdG9yeUl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gaGlzdG9yeUl0ZW1zWzBdO1xuXHRcdGxldCB0aXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBoaXN0b3J5SXRlbUlkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGhpc3RvcnlJdGVtUGFyZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChoaXN0b3J5SXRlbVJlbW90ZVJlZiAmJiAoaGlzdG9yeUl0ZW0uaWQgPT09IFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZCB8fCBoaXN0b3J5SXRlbS5pZCA9PT0gU0NNT3V0Z29pbmdIaXN0b3J5SXRlbUlkKSkge1xuXHRcdFx0Ly8gSW5jb21pbmcvT3V0Z29pbmcgY2hhbmdlcyBoaXN0b3J5IGl0ZW1cblx0XHRcdGNvbnN0IG1lcmdlQmFzZSA9IGF3YWl0IGhpc3RvcnlQcm92aWRlci5yZXNvbHZlSGlzdG9yeUl0ZW1SZWZzQ29tbW9uQW5jZXN0b3IoW1xuXHRcdFx0XHRoaXN0b3J5SXRlbVJlZi5uYW1lLFxuXHRcdFx0XHRoaXN0b3J5SXRlbVJlbW90ZVJlZi5uYW1lXG5cdFx0XHRdKTtcblxuXHRcdFx0aWYgKG1lcmdlQmFzZSAmJiBoaXN0b3J5SXRlbS5pZCA9PT0gU0NNSW5jb21pbmdIaXN0b3J5SXRlbUlkKSB7XG5cdFx0XHRcdC8vIEluY29taW5nIGNoYW5nZXMgaGlzdG9yeSBpdGVtXG5cdFx0XHRcdHRpdGxlID0gYCR7aGlzdG9yeUl0ZW0uc3ViamVjdH0gLSAke2hpc3RvcnlJdGVtUmVmLm5hbWV9IFxcdTIxOTQgJHtoaXN0b3J5SXRlbVJlbW90ZVJlZi5uYW1lfWA7XG5cdFx0XHRcdGhpc3RvcnlJdGVtSWQgPSBoaXN0b3J5SXRlbVJlbW90ZVJlZi5pZDtcblx0XHRcdFx0aGlzdG9yeUl0ZW1QYXJlbnRJZCA9IG1lcmdlQmFzZTtcblx0XHRcdH0gZWxzZSBpZiAobWVyZ2VCYXNlICYmIGhpc3RvcnlJdGVtLmlkID09PSBTQ01PdXRnb2luZ0hpc3RvcnlJdGVtSWQpIHtcblx0XHRcdFx0Ly8gT3V0Z29pbmcgY2hhbmdlcyBoaXN0b3J5IGl0ZW1cblx0XHRcdFx0dGl0bGUgPSBgJHtoaXN0b3J5SXRlbS5zdWJqZWN0fSAtICR7aGlzdG9yeUl0ZW1SZW1vdGVSZWYubmFtZX0gXFx1MjE5NCAke2hpc3RvcnlJdGVtUmVmLm5hbWV9YDtcblx0XHRcdFx0aGlzdG9yeUl0ZW1JZCA9IGhpc3RvcnlJdGVtUmVmLmlkO1xuXHRcdFx0XHRoaXN0b3J5SXRlbVBhcmVudElkID0gbWVyZ2VCYXNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aXRsZSA9IGdldEhpc3RvcnlJdGVtRWRpdG9yVGl0bGUoaGlzdG9yeUl0ZW0pO1xuXHRcdFx0aGlzdG9yeUl0ZW1JZCA9IGhpc3RvcnlJdGVtLmlkO1xuXG5cdFx0XHRpZiAoaGlzdG9yeUl0ZW0ucGFyZW50SWRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gSGlzdG9yeSBpdGVtIHJpZ2h0IGFib3ZlIHRoZSBpbmNvbWluZyBjaGFuZ2VzIGhpc3RvcnkgaXRlbVxuXHRcdFx0XHRpZiAoaGlzdG9yeUl0ZW0ucGFyZW50SWRzWzBdID09PSBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQgJiYgaGlzdG9yeUl0ZW1SZW1vdGVSZWYpIHtcblx0XHRcdFx0XHRoaXN0b3J5SXRlbVBhcmVudElkID0gYXdhaXQgaGlzdG9yeVByb3ZpZGVyLnJlc29sdmVIaXN0b3J5SXRlbVJlZnNDb21tb25BbmNlc3RvcihbXG5cdFx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlZi5uYW1lLFxuXHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZW1vdGVSZWYubmFtZVxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhpc3RvcnlJdGVtUGFyZW50SWQgPSBoaXN0b3J5SXRlbS5wYXJlbnRJZHNbMF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRpdGxlIHx8ICFoaXN0b3J5SXRlbUlkIHx8ICFoaXN0b3J5SXRlbVBhcmVudElkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbXVsdGlEaWZmU291cmNlVXJpID0gU2NtSGlzdG9yeUl0ZW1SZXNvbHZlci5nZXRNdWx0aURpZmZTb3VyY2VVcmkocHJvdmlkZXIsIGhpc3RvcnlJdGVtSWQsIGhpc3RvcnlJdGVtUGFyZW50SWQsICcnKTtcblx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX3dvcmtiZW5jaC5vcGVuTXVsdGlEaWZmRWRpdG9yJywgeyB0aXRsZSwgbXVsdGlEaWZmU291cmNlVXJpIH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLnNjbS5hY3Rpb24uZ3JhcGgub3BlbkZpbGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdvcGVuRmlsZScsIFwiT3BlbiBGaWxlXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5nb1RvRmlsZSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU0NNSGlzdG9yeUl0ZW1DaGFuZ2VDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnaW5saW5lJyxcblx0XHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01IaXN0b3J5SXRlbUNoYW5nZUNvbnRleHQsXG5cdFx0XHRcdFx0Z3JvdXA6ICcwX3ZpZXcnLFxuXHRcdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaGlzdG9yeUl0ZW06IElTQ01IaXN0b3J5SXRlbSwgaGlzdG9yeUl0ZW1DaGFuZ2U6IElTQ01IaXN0b3J5SXRlbUNoYW5nZSkge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0aWYgKCFoaXN0b3J5SXRlbSB8fCAhaGlzdG9yeUl0ZW1DaGFuZ2UubW9kaWZpZWRVcmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgdmVyc2lvbjogc3RyaW5nO1xuXHRcdGlmIChoaXN0b3J5SXRlbS5pZCA9PT0gU0NNSW5jb21pbmdIaXN0b3J5SXRlbUlkKSB7XG5cdFx0XHR2ZXJzaW9uID0gbG9jYWxpemUoJ2luY29taW5nQ2hhbmdlcycsIFwiSW5jb21pbmcgQ2hhbmdlc1wiKTtcblx0XHR9IGVsc2UgaWYgKGhpc3RvcnlJdGVtLmlkID09PSBTQ01PdXRnb2luZ0hpc3RvcnlJdGVtSWQpIHtcblx0XHRcdHZlcnNpb24gPSBsb2NhbGl6ZSgnb3V0Z29pbmdDaGFuZ2VzJywgXCJPdXRnb2luZyBDaGFuZ2VzXCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2ZXJzaW9uID0gaGlzdG9yeUl0ZW0uZGlzcGxheUlkID8/IGhpc3RvcnlJdGVtLmlkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5hbWUgPSBiYXNlbmFtZShoaXN0b3J5SXRlbUNoYW5nZS5tb2RpZmllZFVyaS5mc1BhdGgpO1xuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBoaXN0b3J5SXRlbUNoYW5nZS5tb2RpZmllZFVyaSwgbGFiZWw6IGAke25hbWV9ICgke3ZlcnNpb259KWAgfSk7XG5cdH1cbn0pO1xuXG5jbGFzcyBMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUcmVlRWxlbWVudD4ge1xuXG5cdGdldEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdGlmIChpc1NDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBIaXN0b3J5SXRlbVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpIHx8IGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gSGlzdG9yeUl0ZW1DaGFuZ2VSZW5kZXJlci5URU1QTEFURV9JRDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gSGlzdG9yeUl0ZW1Mb2FkTW9yZVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZWxlbWVudCcpO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSGlzdG9yeUl0ZW1UZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSWNvbkxhYmVsO1xuXHRyZWFkb25seSBncmFwaENvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogV29ya2JlbmNoVG9vbEJhcjtcblx0cmVhZG9ubHkgbGFiZWxDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlO1xufVxuXG5jbGFzcyBIaXN0b3J5SXRlbVJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50LCBMYWJlbEZ1enp5U2NvcmUsIEhpc3RvcnlJdGVtVGVtcGxhdGU+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnaGlzdG9yeS1pdGVtJztcblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIEhpc3RvcnlJdGVtUmVuZGVyZXIuVEVNUExBVEVfSUQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9iYWRnZXNDb25maWc6IElPYnNlcnZhYmxlPCdhbGwnIHwgJ2ZpbHRlcic+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIHwgbnVsbCxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9iYWRnZXNDb25maWcgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8J2FsbCcgfCAnZmlsdGVyJz4oJ3NjbS5ncmFwaC5iYWRnZXMnLCAnZmlsdGVyJywgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhpc3RvcnlJdGVtVGVtcGxhdGUge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuaGlzdG9yeS1pdGVtJykpO1xuXHRcdGNvbnN0IGdyYXBoQ29udGFpbmVyID0gYXBwZW5kKGVsZW1lbnQsICQoJy5ncmFwaC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgaWNvbkxhYmVsID0gbmV3IEljb25MYWJlbChlbGVtZW50LCB7XG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsIHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlLCBzdXBwb3J0RGVzY3JpcHRpb25IaWdobGlnaHRzOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBsYWJlbENvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcubGFiZWwtY29udGFpbmVyJykpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcuYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBuZXcgV29ya2JlbmNoVG9vbEJhcihhY3Rpb25zQ29udGFpbmVyLCB1bmRlZmluZWQsIHRoaXMuX21lbnVTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgdGhpcy5fY29tbWFuZFNlcnZpY2UsIHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHsgZWxlbWVudCwgZ3JhcGhDb250YWluZXIsIGxhYmVsOiBpY29uTGFiZWwsIGxhYmVsQ29udGFpbmVyLCBhY3Rpb25CYXIsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCBkaXNwb3NhYmxlczogY29tYmluZWREaXNwb3NhYmxlKGljb25MYWJlbCwgYWN0aW9uQmFyKSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8U0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudCwgTGFiZWxGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBIaXN0b3J5SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBub2RlLmVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVZpZXdNb2RlbCA9IG5vZGUuZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbDtcblx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtO1xuXG5cdFx0Y29uc3QgeyBjb250ZW50LCBkaXNwb3NhYmxlcyB9ID0gdG9IaXN0b3J5SXRlbUhvdmVyQ29udGVudCh0aGlzLl9tYXJrZG93blJlbmRlcmVyU2VydmljZSwgaGlzdG9yeUl0ZW0sIHRydWUpO1xuXHRcdGNvbnN0IHsgaG92ZXJPcHRpb25zLCBob3ZlckxpZmVjeWNsZU9wdGlvbnMgfSA9IHRoaXMuX2dldEhvdmVyT3B0aW9ucygpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtSG92ZXIgPSB0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGVtcGxhdGVEYXRhLmVsZW1lbnQsIHsgLi4uaG92ZXJPcHRpb25zLCBjb250ZW50IH0sIGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoaGlzdG9yeUl0ZW1Ib3Zlcik7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZXMpO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoQ29udGFpbmVyLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2N1cnJlbnQnLCBoaXN0b3J5SXRlbVZpZXdNb2RlbC5raW5kID09PSAnSEVBRCcpO1xuXHRcdHRlbXBsYXRlRGF0YS5ncmFwaENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdpbmNvbWluZy1jaGFuZ2VzJywgaGlzdG9yeUl0ZW1WaWV3TW9kZWwua2luZCA9PT0gJ2luY29taW5nLWNoYW5nZXMnKTtcblx0XHR0ZW1wbGF0ZURhdGEuZ3JhcGhDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnb3V0Z29pbmctY2hhbmdlcycsIGhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdvdXRnb2luZy1jaGFuZ2VzJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoQ29udGFpbmVyLmFwcGVuZENoaWxkKHJlbmRlclNDTUhpc3RvcnlJdGVtR3JhcGgoaGlzdG9yeUl0ZW1WaWV3TW9kZWwpKTtcblxuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gcHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpPy5oaXN0b3J5SXRlbVJlZj8uZ2V0KCk7XG5cdFx0Y29uc3QgZXh0cmFDbGFzc2VzID0gaGlzdG9yeUl0ZW1SZWY/LnJldmlzaW9uID09PSBoaXN0b3J5SXRlbS5pZCA/IFsnaGlzdG9yeS1pdGVtLWN1cnJlbnQnXSA6IFtdO1xuXHRcdGNvbnN0IFttYXRjaGVzLCBkZXNjcmlwdGlvbk1hdGNoZXNdID0gdGhpcy5fcHJvY2Vzc01hdGNoZXMoaGlzdG9yeUl0ZW1WaWV3TW9kZWwsIG5vZGUuZmlsdGVyRGF0YSk7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldExhYmVsKGhpc3RvcnlJdGVtLnN1YmplY3QsIGhpc3RvcnlJdGVtLmF1dGhvciwgeyBtYXRjaGVzLCBkZXNjcmlwdGlvbk1hdGNoZXMsIGV4dHJhQ2xhc3NlcyB9KTtcblxuXHRcdHRoaXMuX3JlbmRlckJhZGdlcyhoaXN0b3J5SXRlbSwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhcblx0XHRcdE1lbnVJZC5TQ01IaXN0b3J5SXRlbUNvbnRleHQsXG5cdFx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHsgYXJnOiBwcm92aWRlciwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gaGlzdG9yeUl0ZW07XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKGdldEFjdGlvbkJhckFjdGlvbnMoYWN0aW9ucywgJ2lubGluZScpLnByaW1hcnkpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPFNDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQ+LCBMYWJlbEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhpc3RvcnlJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZCBuZXZlciBoYXBwZW4gc2luY2Ugbm9kZSBpcyBpbmNvbXByZXNzaWJsZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyQmFkZ2VzKGhpc3RvcnlJdGVtOiBJU0NNSGlzdG9yeUl0ZW0sIHRlbXBsYXRlRGF0YTogSGlzdG9yeUl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxhYmVsQ29uZmlnID0gdGhpcy5fYmFkZ2VzQ29uZmlnLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0dGVtcGxhdGVEYXRhLmxhYmVsQ29udGFpbmVyLnJlcGxhY2VDaGlsZHJlbigpO1xuXG5cdFx0XHRjb25zdCByZWZlcmVuY2VzID0gaGlzdG9yeUl0ZW0ucmVmZXJlbmNlcyA/XG5cdFx0XHRcdGhpc3RvcnlJdGVtLnJlZmVyZW5jZXMuc2xpY2UoMCkgOiBbXTtcblxuXHRcdFx0Ly8gSWYgdGhlIGZpcnN0IHJlZmVyZW5jZSBpcyBjb2xvcmVkLCB3ZSByZW5kZXIgaXRcblx0XHRcdC8vIHNlcGFyYXRlbHkgc2luY2Ugd2UgaGF2ZSB0byBzaG93IHRoZSBkZXNjcmlwdGlvblxuXHRcdFx0Ly8gZm9yIHRoZSBmaXJzdCBjb2xvcmVkIHJlZmVyZW5jZS5cblx0XHRcdGlmIChyZWZlcmVuY2VzLmxlbmd0aCA+IDAgJiYgcmVmZXJlbmNlc1swXS5jb2xvcikge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJCYWRnZShbcmVmZXJlbmNlc1swXV0sIHRydWUsIHRlbXBsYXRlRGF0YSk7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIHRoZSByZW5kZXJlZCByZWZlcmVuY2UgZnJvbSB0aGUgY29sbGVjdGlvblxuXHRcdFx0XHRyZWZlcmVuY2VzLnNwbGljZSgwLCAxKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gR3JvdXAgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZXMgYnkgY29sb3Jcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmc0J5Q29sb3IgPSBncm91cEJ5MihyZWZlcmVuY2VzLCByZWYgPT4gcmVmLmNvbG9yID8gcmVmLmNvbG9yIDogJycpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIGhpc3RvcnlJdGVtUmVmc10gb2YgT2JqZWN0LmVudHJpZXMoaGlzdG9yeUl0ZW1SZWZzQnlDb2xvcikpIHtcblx0XHRcdFx0Ly8gSWYgbmVlZGVkIHNraXAgYmFkZ2VzIHdpdGhvdXQgYSBjb2xvclxuXHRcdFx0XHRpZiAoa2V5ID09PSAnJyAmJiBsYWJlbENvbmZpZyAhPT0gJ2FsbCcpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaGlzdG9yeUl0ZW1SZWZzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBHcm91cCBoaXN0b3J5IGl0ZW0gcmVmZXJlbmNlcyBieSBpY29uXG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmQnlJY29uSWQgPSBncm91cEJ5MihoaXN0b3J5SXRlbVJlZnMsIHJlZiA9PiBUaGVtZUljb24uaXNUaGVtZUljb24ocmVmLmljb24pID8gcmVmLmljb24uaWQgOiAnJyk7XG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgaGlzdG9yeUl0ZW1SZWZzXSBvZiBPYmplY3QuZW50cmllcyhoaXN0b3J5SXRlbVJlZkJ5SWNvbklkKSkge1xuXHRcdFx0XHRcdC8vIFNraXAgYmFkZ2VzIHdpdGhvdXQgYW4gaWNvblxuXHRcdFx0XHRcdGlmIChrZXkgPT09ICcnIHx8ICFoaXN0b3J5SXRlbVJlZnMpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX3JlbmRlckJhZGdlKGhpc3RvcnlJdGVtUmVmcywgZmFsc2UsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJCYWRnZShoaXN0b3J5SXRlbVJlZnM6IElTQ01IaXN0b3J5SXRlbVJlZltdLCBzaG93RGVzY3JpcHRpb246IGJvb2xlYW4sIHRlbXBsYXRlRGF0YTogSGlzdG9yeUl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGlmIChoaXN0b3J5SXRlbVJlZnMubGVuZ3RoID09PSAwIHx8ICFUaGVtZUljb24uaXNUaGVtZUljb24oaGlzdG9yeUl0ZW1SZWZzWzBdLmljb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudHMgPSBoKCdkaXYubGFiZWwnLCB7XG5cdFx0XHRzdHlsZToge1xuXHRcdFx0XHRjb2xvcjogaGlzdG9yeUl0ZW1SZWZzWzBdLmNvbG9yID8gYXNDc3NWYXJpYWJsZShoaXN0b3J5SXRlbUhvdmVyTGFiZWxGb3JlZ3JvdW5kKSA6IGFzQ3NzVmFyaWFibGUoZm9yZWdyb3VuZCksXG5cdFx0XHRcdGJhY2tncm91bmRDb2xvcjogaGlzdG9yeUl0ZW1SZWZzWzBdLmNvbG9yID8gYXNDc3NWYXJpYWJsZShoaXN0b3J5SXRlbVJlZnNbMF0uY29sb3IpIDogYXNDc3NWYXJpYWJsZShoaXN0b3J5SXRlbUhvdmVyRGVmYXVsdExhYmVsQmFja2dyb3VuZClcblx0XHRcdH1cblx0XHR9LCBbXG5cdFx0XHRoKCdkaXYuY291bnRAY291bnQnLCB7XG5cdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0ZGlzcGxheTogaGlzdG9yeUl0ZW1SZWZzLmxlbmd0aCA+IDEgPyAnJyA6ICdub25lJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdGgoJ2Rpdi5pY29uQGljb24nKSxcblx0XHRcdGgoJ2Rpdi5kZXNjcmlwdGlvbkBkZXNjcmlwdGlvbicsIHtcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRkaXNwbGF5OiBzaG93RGVzY3JpcHRpb24gPyAnJyA6ICdub25lJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdF0pO1xuXG5cdFx0ZWxlbWVudHMuY291bnQudGV4dENvbnRlbnQgPSBoaXN0b3J5SXRlbVJlZnMubGVuZ3RoID4gMSA/IGhpc3RvcnlJdGVtUmVmcy5sZW5ndGgudG9TdHJpbmcoKSA6ICcnO1xuXHRcdGVsZW1lbnRzLmljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShoaXN0b3J5SXRlbVJlZnNbMF0uaWNvbikpO1xuXHRcdGVsZW1lbnRzLmRlc2NyaXB0aW9uLnRleHRDb250ZW50ID0gc2hvd0Rlc2NyaXB0aW9uID8gaGlzdG9yeUl0ZW1SZWZzWzBdLm5hbWUgOiAnJztcblxuXHRcdGFwcGVuZCh0ZW1wbGF0ZURhdGEubGFiZWxDb250YWluZXIsIGVsZW1lbnRzLnJvb3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SG92ZXJPcHRpb25zKCk6IHtcblx0XHRob3Zlck9wdGlvbnM6IFBhcnRpYWw8SURlbGF5ZWRIb3Zlck9wdGlvbnM+O1xuXHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9uczogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0fSB7XG5cdFx0Ly8gU291cmNlIENvbnRyb2wgR3JhcGggdmlldyBpbiB0aGUgcGFuZWxcblx0XHRpZiAodGhpcy5fdmlld0NvbnRhaW5lckxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGhvdmVyT3B0aW9uczoge1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxDbGFzc2VzOiBbJ2hpc3RvcnktaXRlbS1ob3ZlciddLFxuXHRcdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRcdGNvbXBhY3Q6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLlJJR0hUXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzdHlsZTogSG92ZXJTdHlsZS5Nb3VzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnM6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aG92ZXJPcHRpb25zOiB7XG5cdFx0XHRcdGFkZGl0aW9uYWxDbGFzc2VzOiBbJ2hpc3RvcnktaXRlbS1ob3ZlciddLFxuXHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0Y29tcGFjdDogdHJ1ZSxcblx0XHRcdFx0XHRzaG93UG9pbnRlcjogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwb3NpdGlvbjoge1xuXHRcdFx0XHRcdGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uUklHSFRcblx0XHRcdFx0fSxcblx0XHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlclxuXHRcdFx0fSxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9uczoge1xuXHRcdFx0XHRncm91cElkOiAnc2NtLWhpc3RvcnktaXRlbSdcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvY2Vzc01hdGNoZXMoaGlzdG9yeUl0ZW1WaWV3TW9kZWw6IElTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbCwgZmlsdGVyRGF0YTogTGFiZWxGdXp6eVNjb3JlIHwgdW5kZWZpbmVkKTogW0lNYXRjaFtdIHwgdW5kZWZpbmVkLCBJTWF0Y2hbXSB8IHVuZGVmaW5lZF0ge1xuXHRcdGlmICghZmlsdGVyRGF0YSkge1xuXHRcdFx0cmV0dXJuIFt1bmRlZmluZWQsIHVuZGVmaW5lZF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtcblx0XHRcdGhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtLm1lc3NhZ2UgPT09IGZpbHRlckRhdGEubGFiZWwgPyBjcmVhdGVNYXRjaGVzKGZpbHRlckRhdGEuc2NvcmUpIDogdW5kZWZpbmVkLFxuXHRcdFx0aGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW0uYXV0aG9yID09PSBmaWx0ZXJEYXRhLmxhYmVsID8gY3JlYXRlTWF0Y2hlcyhmaWx0ZXJEYXRhLnNjb3JlKSA6IHVuZGVmaW5lZFxuXHRcdF07XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudCwgTGFiZWxGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBIaXN0b3J5SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSGlzdG9yeUl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIEhpc3RvcnlJdGVtQ2hhbmdlVGVtcGxhdGUge1xuXHRyZWFkb25seSByb3dFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGdyYXBoUGxhY2Vob2xkZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByZXNvdXJjZUxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcblx0cmVhZG9ubHkgYWN0aW9uQmFyOiBXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogSURpc3Bvc2FibGU7XG59XG5cbmNsYXNzIEhpc3RvcnlJdGVtQ2hhbmdlUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPFNDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQgfCBJUmVzb3VyY2VOb2RlPFNDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQsIFNDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQ+LCB2b2lkLCBIaXN0b3J5SXRlbUNoYW5nZVRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdoaXN0b3J5LWl0ZW0tY2hhbmdlJztcblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIEhpc3RvcnlJdGVtQ2hhbmdlUmVuZGVyZXIuVEVNUExBVEVfSUQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdNb2RlOiAoKSA9PiBWaWV3TW9kZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhpc3RvcnlJdGVtQ2hhbmdlVGVtcGxhdGUge1xuXHRcdGNvbnN0IHJvd0VsZW1lbnQgPSBjb250YWluZXIucGFyZW50RWxlbWVudCEgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5oaXN0b3J5LWl0ZW0tY2hhbmdlJykpO1xuXHRcdGNvbnN0IGdyYXBoUGxhY2Vob2xkZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLmdyYXBoLXBsYWNlaG9sZGVyJykpO1xuXG5cdFx0Y29uc3QgbGFiZWxDb250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLmxhYmVsLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCByZXNvdXJjZUxhYmVsID0gdGhpcy5yZXNvdXJjZUxhYmVscy5jcmVhdGUobGFiZWxDb250YWluZXIsIHtcblx0XHRcdHN1cHBvcnREZXNjcmlwdGlvbkhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKHJlc291cmNlTGFiZWwuZWxlbWVudCwgJCgnLmFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IFdvcmtiZW5jaFRvb2xCYXIoYWN0aW9uc0NvbnRhaW5lciwgdW5kZWZpbmVkLCB0aGlzLl9tZW51U2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLCB0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWN0aW9uQmFyKTtcblxuXHRcdHJldHVybiB7IHJvd0VsZW1lbnQsIGVsZW1lbnQsIGdyYXBoUGxhY2Vob2xkZXIsIHJlc291cmNlTGFiZWwsIGFjdGlvbkJhciwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudE9yTm9kZTogSVRyZWVOb2RlPFNDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQgfCBJUmVzb3VyY2VOb2RlPFNDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQsIFNDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQ+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBIaXN0b3J5SXRlbUNoYW5nZVRlbXBsYXRlLCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtVmlld01vZGVsID0gaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnRPck5vZGUuZWxlbWVudCkgPyBlbGVtZW50T3JOb2RlLmVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwgOiBlbGVtZW50T3JOb2RlLmVsZW1lbnQuY29udGV4dC5oaXN0b3J5SXRlbVZpZXdNb2RlbDtcblx0XHRjb25zdCBoaXN0b3J5SXRlbUNoYW5nZSA9IGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudChlbGVtZW50T3JOb2RlLmVsZW1lbnQpID8gZWxlbWVudE9yTm9kZS5lbGVtZW50Lmhpc3RvcnlJdGVtQ2hhbmdlIDogZWxlbWVudE9yTm9kZS5lbGVtZW50O1xuXHRcdGNvbnN0IGdyYXBoQ29sdW1ucyA9IGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudChlbGVtZW50T3JOb2RlLmVsZW1lbnQpID8gZWxlbWVudE9yTm9kZS5lbGVtZW50LmdyYXBoQ29sdW1ucyA6IGVsZW1lbnRPck5vZGUuZWxlbWVudC5jb250ZXh0Lmhpc3RvcnlJdGVtVmlld01vZGVsLm91dHB1dFN3aW1sYW5lcztcblxuXHRcdHRoaXMuX3JlbmRlckdyYXBoUGxhY2Vob2xkZXIodGVtcGxhdGVEYXRhLCBoaXN0b3J5SXRlbVZpZXdNb2RlbCwgZ3JhcGhDb2x1bW5zKTtcblxuXHRcdGNvbnN0IGhpZGVQYXRoID0gdGhpcy52aWV3TW9kZSgpID09PSBWaWV3TW9kZS5UcmVlO1xuXHRcdGNvbnN0IGZpbGVLaW5kID0gaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnRPck5vZGUuZWxlbWVudCkgPyBGaWxlS2luZC5GSUxFIDogRmlsZUtpbmQuRk9MREVSO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXNvdXJjZUxhYmVsLnNldEZpbGUoaGlzdG9yeUl0ZW1DaGFuZ2UudXJpLCB7IGZpbGVEZWNvcmF0aW9uczogeyBjb2xvcnM6IGZhbHNlLCBiYWRnZXM6IHRydWUgfSwgZmlsZUtpbmQsIGhpZGVQYXRoIH0pO1xuXG5cdFx0aWYgKGZpbGVLaW5kID09PSBGaWxlS2luZC5GSUxFKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5fbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoXG5cdFx0XHRcdE1lbnVJZC5TQ01IaXN0b3J5SXRlbUNoYW5nZUNvbnRleHQsXG5cdFx0XHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHR7IGFyZzogaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW0sIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSBoaXN0b3J5SXRlbUNoYW5nZTtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuc2V0QWN0aW9ucyhnZXRBY3Rpb25CYXJBY3Rpb25zKGFjdGlvbnMsICdpbmxpbmUnKS5wcmltYXJ5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKFtdKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCB8IElSZXNvdXJjZU5vZGU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudD4+LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBIaXN0b3J5SXRlbUNoYW5nZVRlbXBsYXRlLCBkZXRhaWxzPzogSVRyZWVFbGVtZW50UmVuZGVyRGV0YWlscyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbXByZXNzZWQgPSBub2RlLmVsZW1lbnQgYXMgSUNvbXByZXNzZWRUcmVlTm9kZTxJUmVzb3VyY2VOb2RlPFNDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQsIFNDTUhpc3RvcnlJdGVtVmlld01vZGVsVHJlZUVsZW1lbnQ+Pjtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVZpZXdNb2RlbCA9IGNvbXByZXNzZWQuZWxlbWVudHNbMF0uY29udGV4dC5oaXN0b3J5SXRlbVZpZXdNb2RlbDtcblx0XHRjb25zdCBncmFwaENvbHVtbnMgPSBjb21wcmVzc2VkLmVsZW1lbnRzWzBdLmNvbnRleHQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwub3V0cHV0U3dpbWxhbmVzO1xuXG5cdFx0dGhpcy5fcmVuZGVyR3JhcGhQbGFjZWhvbGRlcih0ZW1wbGF0ZURhdGEsIGhpc3RvcnlJdGVtVmlld01vZGVsLCBncmFwaENvbHVtbnMpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSBjb21wcmVzc2VkLmVsZW1lbnRzLm1hcChlID0+IGUubmFtZSk7XG5cdFx0Y29uc3QgZm9sZGVyID0gY29tcHJlc3NlZC5lbGVtZW50c1tjb21wcmVzc2VkLmVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXNvdXJjZUxhYmVsLnNldFJlc291cmNlKHsgcmVzb3VyY2U6IGZvbGRlci51cmksIG5hbWU6IGxhYmVsIH0sIHtcblx0XHRcdGZpbGVEZWNvcmF0aW9uczogeyBjb2xvcnM6IGZhbHNlLCBiYWRnZXM6IHRydWUgfSxcblx0XHRcdGZpbGVLaW5kOiBGaWxlS2luZC5GT0xERVIsXG5cdFx0XHRzZXBhcmF0b3I6IHRoaXMuX2xhYmVsU2VydmljZS5nZXRTZXBhcmF0b3IoZm9sZGVyLnVyaS5zY2hlbWUpXG5cdFx0fSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKFtdKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckdyYXBoUGxhY2Vob2xkZXIodGVtcGxhdGVEYXRhOiBIaXN0b3J5SXRlbUNoYW5nZVRlbXBsYXRlLCBoaXN0b3J5SXRlbVZpZXdNb2RlbDogSVNDTUhpc3RvcnlJdGVtVmlld01vZGVsLCBncmFwaENvbHVtbnM6IElTQ01IaXN0b3J5SXRlbUdyYXBoTm9kZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JhcGhQbGFjZWhvbGRlclN2Z1dpZHRoID0gU1dJTUxBTkVfV0lEVEggKiAoZ3JhcGhDb2x1bW5zLmxlbmd0aCArIDEpO1xuXHRcdGNvbnN0IG1hcmdpbkxlZnQgPSBncmFwaFBsYWNlaG9sZGVyU3ZnV2lkdGggLSAxNiAvKiAubW9uYWNvLXRsLWluZGVudCBsZWZ0ICovO1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dFbGVtZW50LnN0eWxlLm1hcmdpbkxlZnQgPSBgJHttYXJnaW5MZWZ0fXB4YDtcblxuXHRcdHRlbXBsYXRlRGF0YS5ncmFwaFBsYWNlaG9sZGVyLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoUGxhY2Vob2xkZXIuc3R5bGUubGVmdCA9IGAkey0xICogbWFyZ2luTGVmdH1weGA7XG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoUGxhY2Vob2xkZXIuc3R5bGUud2lkdGggPSBgJHtncmFwaFBsYWNlaG9sZGVyU3ZnV2lkdGh9cHhgO1xuXHRcdHRlbXBsYXRlRGF0YS5ncmFwaFBsYWNlaG9sZGVyLmFwcGVuZENoaWxkKHJlbmRlclNDTUhpc3RvcnlHcmFwaFBsYWNlaG9sZGVyKGdyYXBoQ29sdW1ucywgZ2V0SGlzdG9yeUl0ZW1JbmRleChoaXN0b3J5SXRlbVZpZXdNb2RlbCkpKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IEhpc3RvcnlJdGVtQ2hhbmdlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBMb2FkTW9yZVRlbXBsYXRlIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGdyYXBoUGxhY2Vob2xkZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBoaXN0b3J5SXRlbVBsYWNlaG9sZGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaGlzdG9yeUl0ZW1QbGFjZWhvbGRlckxhYmVsOiBJY29uTGFiZWw7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogSURpc3Bvc2FibGU7XG59XG5cbmNsYXNzIEhpc3RvcnlJdGVtTG9hZE1vcmVSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8U0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50LCB2b2lkLCBMb2FkTW9yZVRlbXBsYXRlPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2hpc3RvcnlJdGVtTG9hZE1vcmUnO1xuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gSGlzdG9yeUl0ZW1Mb2FkTW9yZVJlbmRlcmVyLlRFTVBMQVRFX0lEOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNMb2FkaW5nTW9yZTogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9hZE1vcmVDYWxsYmFjazogKCkgPT4gdm9pZCxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogTG9hZE1vcmVUZW1wbGF0ZSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGFwcGVuZChjb250YWluZXIsICQoJy5oaXN0b3J5LWl0ZW0tbG9hZC1tb3JlJykpO1xuXHRcdGNvbnN0IGdyYXBoUGxhY2Vob2xkZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLmdyYXBoLXBsYWNlaG9sZGVyJykpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUGxhY2Vob2xkZXJDb250YWluZXIgPSBhcHBlbmQoZWxlbWVudCwgJCgnLmhpc3RvcnktaXRlbS1wbGFjZWhvbGRlcicpKTtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVBsYWNlaG9sZGVyTGFiZWwgPSBuZXcgSWNvbkxhYmVsKGhpc3RvcnlJdGVtUGxhY2Vob2xkZXJDb250YWluZXIsIHsgc3VwcG9ydEljb25zOiB0cnVlIH0pO1xuXG5cdFx0cmV0dXJuIHsgZWxlbWVudCwgZ3JhcGhQbGFjZWhvbGRlciwgaGlzdG9yeUl0ZW1QbGFjZWhvbGRlckNvbnRhaW5lciwgaGlzdG9yeUl0ZW1QbGFjZWhvbGRlckxhYmVsLCBlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSwgZGlzcG9zYWJsZXM6IGhpc3RvcnlJdGVtUGxhY2Vob2xkZXJMYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBMb2FkTW9yZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmdyYXBoUGxhY2Vob2xkZXIudGV4dENvbnRlbnQgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEuZ3JhcGhQbGFjZWhvbGRlci5zdHlsZS53aWR0aCA9IGAke1NXSU1MQU5FX1dJRFRIICogKGVsZW1lbnQuZWxlbWVudC5ncmFwaENvbHVtbnMubGVuZ3RoICsgMSl9cHhgO1xuXHRcdHRlbXBsYXRlRGF0YS5ncmFwaFBsYWNlaG9sZGVyLmFwcGVuZENoaWxkKHJlbmRlclNDTUhpc3RvcnlHcmFwaFBsYWNlaG9sZGVyKGVsZW1lbnQuZWxlbWVudC5ncmFwaENvbHVtbnMpKTtcblxuXHRcdGNvbnN0IHBhZ2VPblNjcm9sbCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdzY20uZ3JhcGgucGFnZU9uU2Nyb2xsJykgPT09IHRydWU7XG5cdFx0dGVtcGxhdGVEYXRhLmhpc3RvcnlJdGVtUGxhY2Vob2xkZXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hpbW1lcicsIHBhZ2VPblNjcm9sbCk7XG5cblx0XHRpZiAocGFnZU9uU2Nyb2xsKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaGlzdG9yeUl0ZW1QbGFjZWhvbGRlckxhYmVsLnNldExhYmVsKCcnKTtcblx0XHRcdHRoaXMuX2xvYWRNb3JlQ2FsbGJhY2soKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBpc0xvYWRpbmdNb3JlID0gdGhpcy5faXNMb2FkaW5nTW9yZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGljb24gPSBgJCgke2lzTG9hZGluZ01vcmUgPyAnbG9hZGluZ35zcGluJyA6ICdmb2xkLWRvd24nfSlgO1xuXG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5oaXN0b3J5SXRlbVBsYWNlaG9sZGVyTGFiZWwuc2V0TGFiZWwobG9jYWxpemUoJ2xvYWRNb3JlJywgXCJ7MH0gTG9hZCBNb3JlLi4uXCIsIGljb24pKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8U0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50Piwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogTG9hZE1vcmVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5ldmVyIGhhcHBlbiBzaW5jZSBub2RlIGlzIGluY29tcHJlc3NpYmxlJyk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8U0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBMb2FkTW9yZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogTG9hZE1vcmVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgU0NNSGlzdG9yeVZpZXdQYW5lQWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblx0Y29uc3RydWN0b3IoQElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0PzogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IEhJU1RPUllfVklFV19QQU5FX0lEIH0sXG5cdFx0XHRhc3luYyAoKSA9PiBhd2FpdCBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCBjb250ZXh0KSk7XG5cdH1cbn1cblxuY2xhc3MgU0NNSGlzdG9yeVRyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUcmVlRWxlbWVudD4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnc2NtIGhpc3RvcnknLCBcIlNvdXJjZSBDb250cm9sIEhpc3RvcnlcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdGlmIChpc1NDTVJlcG9zaXRvcnkoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBgJHtlbGVtZW50LnByb3ZpZGVyLm5hbWV9ICR7ZWxlbWVudC5wcm92aWRlci5sYWJlbH1gO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cdFx0XHRyZXR1cm4gYCR7c3RyaXBJY29ucyhoaXN0b3J5SXRlbS5tZXNzYWdlKS50cmltKCl9JHtoaXN0b3J5SXRlbS5hdXRob3IgPyBgLCAke2hpc3RvcnlJdGVtLmF1dGhvcn1gIDogJyd9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTQ01IaXN0b3J5VHJlZUlkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxUcmVlRWxlbWVudD4ge1xuXG5cdGdldElkKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGVsZW1lbnQucHJvdmlkZXI7XG5cdFx0XHRyZXR1cm4gYHJlcG86JHtwcm92aWRlci5pZH1gO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbTtcblx0XHRcdHJldHVybiBgaGlzdG9yeUl0ZW06JHtwcm92aWRlci5pZH0vJHtoaXN0b3J5SXRlbS5pZH0vJHtoaXN0b3J5SXRlbS5wYXJlbnRJZHMuam9pbignLCcpfWA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBlbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtO1xuXHRcdFx0cmV0dXJuIGBoaXN0b3J5SXRlbUNoYW5nZToke3Byb3ZpZGVyLmlkfS8ke2hpc3RvcnlJdGVtLmlkfS8ke2hpc3RvcnlJdGVtLnBhcmVudElkcy5qb2luKCcsJyl9LyR7ZWxlbWVudC5oaXN0b3J5SXRlbUNoYW5nZS51cmkuZnNQYXRofWA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlbGVtZW50LmNvbnRleHQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gZWxlbWVudC5jb250ZXh0Lmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtO1xuXHRcdFx0cmV0dXJuIGBoaXN0b3J5SXRlbUNoYW5nZUZvbGRlcjoke3Byb3ZpZGVyLmlkfS8ke2hpc3RvcnlJdGVtLmlkfS8ke2hpc3RvcnlJdGVtLnBhcmVudElkcy5qb2luKCcsJyl9LyR7ZWxlbWVudC51cmkuZnNQYXRofWA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtTG9hZE1vcmVUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXI7XG5cdFx0XHRyZXR1cm4gYGhpc3RvcnlJdGVtTG9hZE1vcmU6JHtwcm92aWRlci5pZH1gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgdHJlZSBlbGVtZW50Jyk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFNDTUhpc3RvcnlUcmVlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPFRyZWVFbGVtZW50PiB7XG5cdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB8IHsgdG9TdHJpbmcoKTogc3RyaW5nIH1bXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Ly8gRm9yIGEgaGlzdG9yeSBpdGVtIHdlIHdhbnQgdG8gbWF0Y2ggYm90aCB0aGUgbWVzc2FnZSBhbmRcblx0XHRcdC8vIHRoZSBhdXRob3IuIEEgbWF0Y2ggaW4gdGhlIG1lc3NhZ2UgdGFrZXMgcHJlY2VkZW5jZSBvdmVyXG5cdFx0XHQvLyBhIG1hdGNoIGluIHRoZSBhdXRob3IuXG5cdFx0XHRyZXR1cm4gW2VsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW0ubWVzc2FnZSwgZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbS5hdXRob3JdO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdC8vIFdlIGRvbid0IHdhbnQgdG8gbWF0Y2ggdGhlIGxvYWQgbW9yZSBlbGVtZW50XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0cmVlIGVsZW1lbnQnKTtcblx0XHR9XG5cdH1cblxuXHRnZXRDb21wcmVzc2VkTm9kZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnRzOiBUcmVlRWxlbWVudFtdKTogeyB0b1N0cmluZygpOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm9sZGVycyA9IGVsZW1lbnRzIGFzIElSZXNvdXJjZU5vZGU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudD5bXTtcblx0XHRyZXR1cm4gZm9sZGVycy5tYXAoZSA9PiBlLm5hbWUpLmpvaW4oJy8nKTtcblx0fVxufVxuXG5jbGFzcyBTQ01IaXN0b3J5VHJlZUNvbXByZXNzaW9uRGVsZWdhdGUgaW1wbGVtZW50cyBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGU8VHJlZUVsZW1lbnQ+IHtcblxuXHRpc0luY29tcHJlc3NpYmxlKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuY2hpbGRyZW5Db3VudCA9PT0gMCB8fCAhZWxlbWVudC5wYXJlbnQgfHwgIWVsZW1lbnQucGFyZW50LnBhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBTQ01IaXN0b3J5VHJlZURhdGFTb3VyY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxTQ01IaXN0b3J5Vmlld01vZGVsLCBUcmVlRWxlbWVudD4ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHZpZXdNb2RlOiAoKSA9PiBWaWV3TW9kZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbihpbnB1dE9yRWxlbWVudDogU0NNSGlzdG9yeVZpZXdNb2RlbCB8IFRyZWVFbGVtZW50KTogUHJvbWlzZTxJdGVyYWJsZTxUcmVlRWxlbWVudD4+IHtcblx0XHRjb25zdCBjaGlsZHJlbjogVHJlZUVsZW1lbnRbXSA9IFtdO1xuXG5cdFx0aWYgKGlucHV0T3JFbGVtZW50IGluc3RhbmNlb2YgU0NNSGlzdG9yeVZpZXdNb2RlbCkge1xuXHRcdFx0Ly8gSGlzdG9yeSBpdGVtc1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1zID0gYXdhaXQgaW5wdXRPckVsZW1lbnQuZ2V0SGlzdG9yeUl0ZW1zKCk7XG5cdFx0XHRjaGlsZHJlbi5wdXNoKC4uLmhpc3RvcnlJdGVtcyk7XG5cblx0XHRcdC8vIExvYWQgTW9yZSBlbGVtZW50XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gaW5wdXRPckVsZW1lbnQucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRcdGNvbnN0IGxhc3RIaXN0b3J5SXRlbSA9IGhpc3RvcnlJdGVtcy5hdCgtMSk7XG5cdFx0XHRpZiAocmVwb3NpdG9yeSAmJiBsYXN0SGlzdG9yeUl0ZW0gJiYgbGFzdEhpc3RvcnlJdGVtLmhpc3RvcnlJdGVtVmlld01vZGVsLm91dHB1dFN3aW1sYW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdHJlcG9zaXRvcnksXG5cdFx0XHRcdFx0Z3JhcGhDb2x1bW5zOiBsYXN0SGlzdG9yeUl0ZW0uaGlzdG9yeUl0ZW1WaWV3TW9kZWwub3V0cHV0U3dpbWxhbmVzLFxuXHRcdFx0XHRcdHR5cGU6ICdoaXN0b3J5SXRlbUxvYWRNb3JlJ1xuXHRcdFx0XHR9IHNhdGlzZmllcyBTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0Ly8gSGlzdG9yeSBpdGVtIGNoYW5nZXNcblx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IGlucHV0T3JFbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1WaWV3TW9kZWwgPSBpbnB1dE9yRWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbDtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtID0gaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cblx0XHRcdGxldCBoaXN0b3J5SXRlbUlkOiBzdHJpbmcsIGhpc3RvcnlJdGVtUGFyZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKFxuXHRcdFx0XHRoaXN0b3J5SXRlbVZpZXdNb2RlbC5raW5kID09PSAnaW5jb21pbmctY2hhbmdlcycgfHxcblx0XHRcdFx0aGlzdG9yeUl0ZW1WaWV3TW9kZWwua2luZCA9PT0gJ291dGdvaW5nLWNoYW5nZXMnXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gSW5jb21pbmcvT3V0Z29pbmcgY2hhbmdlcyBoaXN0b3J5IGl0ZW1cblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXHRcdFx0XHRjb25zdCBoaXN0b3J5SXRlbVJlbW90ZVJlZiA9IGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZW1vdGVSZWYuZ2V0KCk7XG5cblx0XHRcdFx0aWYgKCFoaXN0b3J5UHJvdmlkZXIgfHwgIWhpc3RvcnlJdGVtUmVmIHx8ICFoaXN0b3J5SXRlbVJlbW90ZVJlZikge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGhpc3RvcnlJdGVtSWQgPSBoaXN0b3J5SXRlbVZpZXdNb2RlbC5raW5kID09PSAnaW5jb21pbmctY2hhbmdlcydcblx0XHRcdFx0XHQ/IGhpc3RvcnlJdGVtUmVtb3RlUmVmLmlkXG5cdFx0XHRcdFx0OiBoaXN0b3J5SXRlbVJlZi5pZDtcblxuXHRcdFx0XHRoaXN0b3J5SXRlbVBhcmVudElkID0gYXdhaXQgaGlzdG9yeVByb3ZpZGVyLnJlc29sdmVIaXN0b3J5SXRlbVJlZnNDb21tb25BbmNlc3RvcihbXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZWYubmFtZSxcblx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlbW90ZVJlZi5uYW1lXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBIaXN0b3J5IGl0ZW1cblx0XHRcdFx0aGlzdG9yeUl0ZW1JZCA9IGhpc3RvcnlJdGVtLmlkO1xuXG5cdFx0XHRcdGlmIChoaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdC8vIEhpc3RvcnkgaXRlbSByaWdodCBhYm92ZSB0aGUgaW5jb21pbmcgY2hhbmdlcyBoaXN0b3J5IGl0ZW1cblx0XHRcdFx0XHRpZiAoaGlzdG9yeUl0ZW0ucGFyZW50SWRzWzBdID09PSBTQ01JbmNvbWluZ0hpc3RvcnlJdGVtSWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlZi5nZXQoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVtb3RlUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlbW90ZVJlZi5nZXQoKTtcblxuXHRcdFx0XHRcdFx0aWYgKCFoaXN0b3J5UHJvdmlkZXIgfHwgIWhpc3RvcnlJdGVtUmVmIHx8ICFoaXN0b3J5SXRlbVJlbW90ZVJlZikge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGhpc3RvcnlJdGVtUGFyZW50SWQgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXIucmVzb2x2ZUhpc3RvcnlJdGVtUmVmc0NvbW1vbkFuY2VzdG9yKFtcblx0XHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZWYubmFtZSxcblx0XHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZW1vdGVSZWYubmFtZV0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRoaXN0b3J5SXRlbVBhcmVudElkID0gaGlzdG9yeUl0ZW0ucGFyZW50SWRzWzBdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbUNoYW5nZXMgPSBhd2FpdCBoaXN0b3J5UHJvdmlkZXI/LnByb3ZpZGVIaXN0b3J5SXRlbUNoYW5nZXMoaGlzdG9yeUl0ZW1JZCwgaGlzdG9yeUl0ZW1QYXJlbnRJZCkgPz8gW107XG5cblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlKCkgPT09IFZpZXdNb2RlLkxpc3QpIHtcblx0XHRcdFx0Ly8gTGlzdFxuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKC4uLmhpc3RvcnlJdGVtQ2hhbmdlcy5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHRcdFx0cmVwb3NpdG9yeTogaW5wdXRPckVsZW1lbnQucmVwb3NpdG9yeSxcblx0XHRcdFx0XHRoaXN0b3J5SXRlbVZpZXdNb2RlbDogaW5wdXRPckVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwsXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1DaGFuZ2U6IGNoYW5nZSxcblx0XHRcdFx0XHRncmFwaENvbHVtbnM6IGlucHV0T3JFbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLm91dHB1dFN3aW1sYW5lcyxcblx0XHRcdFx0XHR0eXBlOiAnaGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWwnXG5cdFx0XHRcdH0gc2F0aXNmaWVzIFNDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQpKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMudmlld01vZGUoKSA9PT0gVmlld01vZGUuVHJlZSkge1xuXHRcdFx0XHQvLyBUcmVlXG5cdFx0XHRcdGNvbnN0IHJvb3RVcmkgPSBpbnB1dE9yRWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyLnJvb3RVcmkgPz8gVVJJLmZpbGUoJy8nKTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1DaGFuZ2VzVHJlZSA9IG5ldyBSZXNvdXJjZVRyZWU8U0NNSGlzdG9yeUl0ZW1DaGFuZ2VWaWV3TW9kZWxUcmVlRWxlbWVudCwgU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudD4oaW5wdXRPckVsZW1lbnQsIHJvb3RVcmkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBoaXN0b3J5SXRlbUNoYW5nZXMpIHtcblx0XHRcdFx0XHRoaXN0b3J5SXRlbUNoYW5nZXNUcmVlLmFkZChjaGFuZ2UudXJpLCB7XG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5OiBpbnB1dE9yRWxlbWVudC5yZXBvc2l0b3J5LFxuXHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW1WaWV3TW9kZWw6IGlucHV0T3JFbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLFxuXHRcdFx0XHRcdFx0aGlzdG9yeUl0ZW1DaGFuZ2U6IGNoYW5nZSxcblx0XHRcdFx0XHRcdGdyYXBoQ29sdW1uczogaW5wdXRPckVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwub3V0cHV0U3dpbWxhbmVzLFxuXHRcdFx0XHRcdFx0dHlwZTogJ2hpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsJ1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBoaXN0b3J5SXRlbUNoYW5nZXNUcmVlLnJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKG5vZGUuZWxlbWVudCA/PyBub2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGlucHV0T3JFbGVtZW50KSAmJiBpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlTm9kZShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdC8vIFRyZWVcblx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBpbnB1dE9yRWxlbWVudC5jaGlsZHJlbikge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKG5vZGUuZWxlbWVudCAmJiBub2RlLmNoaWxkcmVuQ291bnQgPT09IDAgPyBub2RlLmVsZW1lbnQgOiBub2RlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdH1cblxuXHRoYXNDaGlsZHJlbihpbnB1dE9yRWxlbWVudDogU0NNSGlzdG9yeVZpZXdNb2RlbCB8IFRyZWVFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlucHV0T3JFbGVtZW50IGluc3RhbmNlb2YgU0NNSGlzdG9yeVZpZXdNb2RlbCB8fFxuXHRcdFx0aXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGlucHV0T3JFbGVtZW50KSB8fFxuXHRcdFx0KGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VOb2RlKGlucHV0T3JFbGVtZW50KSAmJiBpbnB1dE9yRWxlbWVudC5jaGlsZHJlbkNvdW50ID4gMCk7XG5cdH1cbn1cblxuY2xhc3MgU0NNSGlzdG9yeVRyZWVEcmFnQW5kRHJvcCBpbXBsZW1lbnRzIElUcmVlRHJhZ0FuZERyb3A8VHJlZUVsZW1lbnQ+IHtcblx0Z2V0RHJhZ1VSSShlbGVtZW50OiBUcmVlRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuX2dldFRyZWVFbGVtZW50VXJpKGVsZW1lbnQpO1xuXHRcdHJldHVybiB1cmkgPyB1cmkudG9TdHJpbmcoKSA6IG51bGw7XG5cdH1cblxuXHRvbkRyYWdTdGFydChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIW9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1zID0gdGhpcy5fZ2V0RHJhZ0FuZERyb3BEYXRhKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VHJlZUVsZW1lbnQsIFRyZWVFbGVtZW50W10+KTtcblx0XHRpZiAoaGlzdG9yeUl0ZW1zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoQ29kZURhdGFUcmFuc2ZlcnMuU0NNX0hJU1RPUllfSVRFTSwgSlNPTi5zdHJpbmdpZnkoaGlzdG9yeUl0ZW1zKSk7XG5cdH1cblxuXHRnZXREcmFnTGFiZWwoZWxlbWVudHM6IFRyZWVFbGVtZW50W10sIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGVsZW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGVsZW1lbnRzWzBdO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldFRyZWVFbGVtZW50TGFiZWwoZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFN0cmluZyhlbGVtZW50cy5sZW5ndGgpO1xuXHR9XG5cblx0b25EcmFnT3ZlcihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBUcmVlRWxlbWVudCB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0ZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBUcmVlRWxlbWVudCB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7IH1cblxuXHRwcml2YXRlIF9nZXREcmFnQW5kRHJvcERhdGEoZGF0YTogRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VHJlZUVsZW1lbnQsIFRyZWVFbGVtZW50W10+KTogU0NNSGlzdG9yeUl0ZW1UcmFuc2ZlckRhdGFbXSB7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1zOiBTQ01IaXN0b3J5SXRlbVRyYW5zZmVyRGF0YVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIFsuLi5kYXRhLmNvbnRleHQgPz8gW10sIC4uLmRhdGEuZWxlbWVudHNdKSB7XG5cdFx0XHRpZiAoIWlzU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXI7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cdFx0XHRjb25zdCBhdHRhY2htZW50TmFtZSA9IGAkKCR7Q29kaWNvbi5yZXBvLmlkfSlcXHUwMEEwJHtwcm92aWRlci5uYW1lfVxcdTAwQTAkKCR7Q29kaWNvbi5naXRDb21taXQuaWR9KVxcdTAwQTAke2hpc3RvcnlJdGVtLmRpc3BsYXlJZCA/PyBoaXN0b3J5SXRlbS5pZH1gO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1QYXJlbnRJZCA9IGhpc3RvcnlJdGVtLnBhcmVudElkcy5sZW5ndGggPiAwID8gaGlzdG9yeUl0ZW0ucGFyZW50SWRzWzBdIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRoaXN0b3J5SXRlbXMucHVzaCh7XG5cdFx0XHRcdG5hbWU6IGF0dGFjaG1lbnROYW1lLFxuXHRcdFx0XHRyZXNvdXJjZTogU2NtSGlzdG9yeUl0ZW1SZXNvbHZlci5nZXRNdWx0aURpZmZTb3VyY2VVcmkocHJvdmlkZXIsIGhpc3RvcnlJdGVtLmlkLCBoaXN0b3J5SXRlbVBhcmVudElkLCBoaXN0b3J5SXRlbS5kaXNwbGF5SWQpLFxuXHRcdFx0XHRoaXN0b3J5SXRlbTogaGlzdG9yeUl0ZW1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBoaXN0b3J5SXRlbXM7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUcmVlRWxlbWVudExhYmVsKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cdFx0XHRyZXR1cm4gaGlzdG9yeUl0ZW0uZGlzcGxheUlkID8/IGhpc3RvcnlJdGVtLmlkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUcmVlRWxlbWVudFVyaShlbGVtZW50OiBUcmVlRWxlbWVudCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXI7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW07XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbVBhcmVudElkID0gaGlzdG9yeUl0ZW0ucGFyZW50SWRzLmxlbmd0aCA+IDAgPyBoaXN0b3J5SXRlbS5wYXJlbnRJZHNbMF0gOiB1bmRlZmluZWQ7XG5cblx0XHRcdHJldHVybiBTY21IaXN0b3J5SXRlbVJlc29sdmVyLmdldE11bHRpRGlmZlNvdXJjZVVyaShwcm92aWRlciwgaGlzdG9yeUl0ZW0uaWQsIGhpc3RvcnlJdGVtUGFyZW50SWQsIGhpc3RvcnlJdGVtLmRpc3BsYXlJZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7IH1cbn1cblxudHlwZSBIaXN0b3J5SXRlbVJlZnNGaWx0ZXIgPSAnYWxsJyB8ICdhdXRvJyB8IHN0cmluZ1tdO1xuXG50eXBlIFJlcG9zaXRvcnlTdGF0ZSA9IHtcblx0dmlld01vZGVsczogU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudFtdO1xuXHRoaXN0b3J5SXRlbXNGaWx0ZXI6IElTQ01IaXN0b3J5SXRlbVJlZltdO1xuXHRtZXJnZUJhc2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bG9hZE1vcmU6IGJvb2xlYW4gfCBzdHJpbmc7XG59O1xuXG5jbGFzcyBTQ01IaXN0b3J5Vmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IHZpZXdNb2RlOiBJU2V0dGFibGVPYnNlcnZhYmxlPFZpZXdNb2RlPjtcblxuXHQvKipcblx0ICogVGhlIGFjdGl2ZSB8IHNlbGVjdGVkIHJlcG9zaXRvcnkgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBmaXJzdCByZXBvc2l0b3J5IHdoZW4gdGhlIG9ic2VydmFibGVcblx0ICogdmFsdWVzIGFyZSB1cGRhdGVkIGluIHRoZSBzYW1lIHRyYW5zYWN0aW9uIChvciBkdXJpbmcgdGhlIGluaXRpYWwgcmVhZCBvZiB0aGUgb2JzZXJ2YWJsZSB2YWx1ZSkuXG5cdCAqL1xuXHRyZWFkb25seSByZXBvc2l0b3J5OiBJT2JzZXJ2YWJsZTxJU0NNUmVwb3NpdG9yeSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGVkUmVwb3NpdG9yeSA9IG9ic2VydmFibGVWYWx1ZTwnYXV0bycgfCBJU0NNUmVwb3NpdG9yeT4odGhpcywgJ2F1dG8nKTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUhpc3RvcnlJdGVtc0ZpbHRlciA9IG9ic2VydmFibGVTaWduYWwodGhpcyk7XG5cdHJlYWRvbmx5IGlzVmlld01vZGVsRW1wdHkgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcG9zaXRvcnlTdGF0ZSA9IG5ldyBNYXA8SVNDTVJlcG9zaXRvcnksIFJlcG9zaXRvcnlTdGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yeUZpbHRlclN0YXRlID0gbmV3IE1hcDxzdHJpbmcsIEhpc3RvcnlJdGVtUmVmc0ZpbHRlcj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zY21IaXN0b3J5SXRlbUNvdW50Q3R4OiBJQ29udGV4dEtleTxudW1iZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY21IaXN0b3J5Vmlld01vZGVDdHg6IElDb250ZXh0S2V5PFZpZXdNb2RlPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVNDTVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2NtU2VydmljZTogSVNDTVNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVwb3NpdG9yeUZpbHRlclN0YXRlID0gdGhpcy5fbG9hZEhpc3RvcnlJdGVtc0ZpbHRlclN0YXRlKCk7XG5cdFx0dGhpcy52aWV3TW9kZSA9IG9ic2VydmFibGVWYWx1ZTxWaWV3TW9kZT4odGhpcywgdGhpcy5fZ2V0Vmlld01vZGUoKSk7XG5cblx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLm9uV2lsbFN0b3AodGhpcy5fc2F2ZUhpc3RvcnlJdGVtc0ZpbHRlclN0YXRlLCB0aGlzLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKHRoaXMuX3NhdmVIaXN0b3J5SXRlbXNGaWx0ZXJTdGF0ZSwgdGhpcywgdGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5fc2NtSGlzdG9yeUl0ZW1Db3VudEN0eCA9IENvbnRleHRLZXlzLlNDTUhpc3RvcnlJdGVtQ291bnQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9zY21IaXN0b3J5Vmlld01vZGVDdHggPSBDb250ZXh0S2V5cy5TQ01IaXN0b3J5Vmlld01vZGUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9zY21IaXN0b3J5Vmlld01vZGVDdHguc2V0KHRoaXMudmlld01vZGUuZ2V0KCkpO1xuXG5cdFx0Y29uc3QgZmlyc3RSZXBvc2l0b3J5ID0gdGhpcy5fc2NtU2VydmljZS5yZXBvc2l0b3J5Q291bnQgPiAwXG5cdFx0XHQ/IGNvbnN0T2JzZXJ2YWJsZShJdGVyYWJsZS5maXJzdCh0aGlzLl9zY21TZXJ2aWNlLnJlcG9zaXRvcmllcykpXG5cdFx0XHQ6IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdFx0RXZlbnQub25jZSh0aGlzLl9zY21TZXJ2aWNlLm9uRGlkQWRkUmVwb3NpdG9yeSksXG5cdFx0XHRcdHJlcG9zaXRvcnkgPT4gcmVwb3NpdG9yeSk7XG5cblx0XHRjb25zdCBncmFwaFJlcG9zaXRvcnkgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZFJlcG9zaXRvcnkgPSB0aGlzLl9zZWxlY3RlZFJlcG9zaXRvcnkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHNlbGVjdGVkUmVwb3NpdG9yeSAhPT0gJ2F1dG8nKSB7XG5cdFx0XHRcdHJldHVybiBzZWxlY3RlZFJlcG9zaXRvcnk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLl9zY21WaWV3U2VydmljZS5hY3RpdmVSZXBvc2l0b3J5LnJlYWQocmVhZGVyKT8ucmVwb3NpdG9yeTtcblx0XHR9KTtcblxuXHRcdHRoaXMucmVwb3NpdG9yeSA9IGxhdGVzdENoYW5nZWRWYWx1ZSh0aGlzLCBbZmlyc3RSZXBvc2l0b3J5LCBncmFwaFJlcG9zaXRvcnldKTtcblxuXHRcdGNvbnN0IGNsb3NlZFJlcG9zaXRvcnkgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLl9zY21TZXJ2aWNlLm9uRGlkUmVtb3ZlUmVwb3NpdG9yeSxcblx0XHRcdHJlcG9zaXRvcnkgPT4gcmVwb3NpdG9yeSk7XG5cblx0XHQvLyBDbG9zZWQgcmVwb3NpdG9yeSBjbGVhbnVwXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IGNsb3NlZFJlcG9zaXRvcnkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMucmVwb3NpdG9yeS5yZWFkKHVuZGVmaW5lZCkgPT09IHJlcG9zaXRvcnkpIHtcblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRSZXBvc2l0b3J5LnNldChJdGVyYWJsZS5maXJzdCh0aGlzLl9zY21TZXJ2aWNlLnJlcG9zaXRvcmllcykgPz8gJ2F1dG8nLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZXBvc2l0b3J5U3RhdGUuZGVsZXRlKHJlcG9zaXRvcnkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGNsZWFyUmVwb3NpdG9yeVN0YXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLnJlcG9zaXRvcnkuZ2V0KCk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVwb3NpdG9yeVN0YXRlLmRlbGV0ZShyZXBvc2l0b3J5KTtcblx0fVxuXG5cdGdldEhpc3RvcnlJdGVtc0ZpbHRlcigpOiAnYWxsJyB8ICdhdXRvJyB8IElTQ01IaXN0b3J5SXRlbVJlZltdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5yZXBvc2l0b3J5LmdldCgpO1xuXHRcdGlmICghcmVwb3NpdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbHRlclN0YXRlID0gdGhpcy5fcmVwb3NpdG9yeUZpbHRlclN0YXRlLmdldChnZXRQcm92aWRlcktleShyZXBvc2l0b3J5LnByb3ZpZGVyKSkgPz8gJ2F1dG8nO1xuXHRcdGlmIChmaWx0ZXJTdGF0ZSA9PT0gJ2FsbCcgfHwgZmlsdGVyU3RhdGUgPT09ICdhdXRvJykge1xuXHRcdFx0cmV0dXJuIGZpbHRlclN0YXRlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcG9zaXRvcnlTdGF0ZSA9IHRoaXMuX3JlcG9zaXRvcnlTdGF0ZS5nZXQocmVwb3NpdG9yeSk7XG5cdFx0cmV0dXJuIHJlcG9zaXRvcnlTdGF0ZT8uaGlzdG9yeUl0ZW1zRmlsdGVyO1xuXHR9XG5cblx0Z2V0Q3VycmVudEhpc3RvcnlJdGVtVHJlZUVsZW1lbnQoKTogU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9yZXBvc2l0b3J5U3RhdGUuZ2V0KHJlcG9zaXRvcnkpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlZi5nZXQoKTtcblxuXHRcdHJldHVybiBzdGF0ZS52aWV3TW9kZWxzXG5cdFx0XHQuZmluZCh2aWV3TW9kZWwgPT4gdmlld01vZGVsLmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtLmlkID09PSBoaXN0b3J5SXRlbVJlZj8ucmV2aXNpb24pO1xuXHR9XG5cblx0bG9hZE1vcmUoY3Vyc29yPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3JlcG9zaXRvcnlTdGF0ZS5nZXQocmVwb3NpdG9yeSk7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlcG9zaXRvcnlTdGF0ZS5zZXQocmVwb3NpdG9yeSwgeyAuLi5zdGF0ZSwgbG9hZE1vcmU6IGN1cnNvciA/PyB0cnVlIH0pO1xuXHR9XG5cblx0YXN5bmMgZ2V0SGlzdG9yeUl0ZW1zKCk6IFByb21pc2U8U0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudFtdPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSByZXBvc2l0b3J5Py5wcm92aWRlci5oaXN0b3J5UHJvdmlkZXIuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVtb3RlUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlbW90ZVJlZi5nZXQoKTtcblxuXHRcdGlmICghcmVwb3NpdG9yeSB8fCAhaGlzdG9yeVByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9zY21IaXN0b3J5SXRlbUNvdW50Q3R4LnNldCgwKTtcblx0XHRcdHRoaXMuaXNWaWV3TW9kZWxFbXB0eS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRsZXQgc3RhdGUgPSB0aGlzLl9yZXBvc2l0b3J5U3RhdGUuZ2V0KHJlcG9zaXRvcnkpO1xuXG5cdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS5sb2FkTW9yZSAhPT0gZmFsc2UpIHtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtcyA9IHN0YXRlPy52aWV3TW9kZWxzXG5cdFx0XHRcdC5maWx0ZXIodm0gPT5cblx0XHRcdFx0XHR2bS5oaXN0b3J5SXRlbVZpZXdNb2RlbC5raW5kICE9PSAnaW5jb21pbmctY2hhbmdlcycgJiZcblx0XHRcdFx0XHR2bS5oaXN0b3J5SXRlbVZpZXdNb2RlbC5raW5kICE9PSAnb3V0Z29pbmctY2hhbmdlcycpXG5cdFx0XHRcdC5tYXAodm0gPT4gdm0uaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW0pID8/IFtdO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZnMgPSBzdGF0ZT8uaGlzdG9yeUl0ZW1zRmlsdGVyID8/XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVIaXN0b3J5SXRlbUZpbHRlcihyZXBvc2l0b3J5LCBoaXN0b3J5UHJvdmlkZXIpO1xuXG5cdFx0XHRjb25zdCBsaW1pdCA9IGNsYW1wKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3NjbS5ncmFwaC5wYWdlU2l6ZScpLCAxLCAxMDAwKTtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmSWRzID0gaGlzdG9yeUl0ZW1SZWZzLm1hcChyZWYgPT4gcmVmLnJldmlzaW9uID8/IHJlZi5pZCk7XG5cblx0XHRcdGRvIHtcblx0XHRcdFx0Ly8gRmV0Y2ggdGhlIG5leHQgcGFnZSBvZiBoaXN0b3J5IGl0ZW1zXG5cdFx0XHRcdGhpc3RvcnlJdGVtcy5wdXNoKC4uLihhd2FpdCBoaXN0b3J5UHJvdmlkZXIucHJvdmlkZUhpc3RvcnlJdGVtcyh7XG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZWZzOiBoaXN0b3J5SXRlbVJlZklkcywgbGltaXQsIHNraXA6IGhpc3RvcnlJdGVtcy5sZW5ndGhcblx0XHRcdFx0fSkgPz8gW10pKTtcblx0XHRcdH0gd2hpbGUgKHR5cGVvZiBzdGF0ZT8ubG9hZE1vcmUgPT09ICdzdHJpbmcnICYmICFoaXN0b3J5SXRlbXMuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IHN0YXRlPy5sb2FkTW9yZSkpO1xuXG5cdFx0XHQvLyBDb21wdXRlIHRoZSBtZXJnZSBiYXNlXG5cdFx0XHRjb25zdCBtZXJnZUJhc2UgPSBoaXN0b3J5SXRlbVJlZiAmJiBoaXN0b3J5SXRlbVJlbW90ZVJlZiAmJiBzdGF0ZT8ubWVyZ2VCYXNlID09PSB1bmRlZmluZWRcblx0XHRcdFx0PyBhd2FpdCBoaXN0b3J5UHJvdmlkZXIucmVzb2x2ZUhpc3RvcnlJdGVtUmVmc0NvbW1vbkFuY2VzdG9yKFtcblx0XHRcdFx0XHRoaXN0b3J5SXRlbVJlZi5uYW1lLFxuXHRcdFx0XHRcdGhpc3RvcnlJdGVtUmVtb3RlUmVmLm5hbWVdKVxuXHRcdFx0XHQ6IHN0YXRlPy5tZXJnZUJhc2U7XG5cblx0XHRcdC8vIENyZWF0ZSB0aGUgY29sb3IgbWFwXG5cdFx0XHRjb25zdCBjb2xvck1hcCA9IHRoaXMuX2dldEdyYXBoQ29sb3JNYXAoaGlzdG9yeUl0ZW1SZWZzKTtcblxuXHRcdFx0Ly8gT25seSBzaG93IGluY29taW5nIGNoYW5nZXMgbm9kZSBpZiB0aGUgcmVtb3RlIGhpc3RvcnkgaXRlbSByZWZlcmVuY2UgaXMgcGFydCBvZiB0aGUgZ3JhcGhcblx0XHRcdGNvbnN0IGFkZEluY29taW5nQ2hhbmdlc05vZGUgPSB0aGlzLl9zY21WaWV3U2VydmljZS5ncmFwaFNob3dJbmNvbWluZ0NoYW5nZXNDb25maWcuZ2V0KClcblx0XHRcdFx0JiYgaGlzdG9yeUl0ZW1SZWZzLnNvbWUocmVmID0+IHJlZi5pZCA9PT0gaGlzdG9yeUl0ZW1SZW1vdGVSZWY/LmlkKTtcblxuXHRcdFx0Ly8gT25seSBzaG93IG91dGdvaW5nIGNoYW5nZXMgbm9kZSBpZiB0aGUgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZSBpcyBwYXJ0IG9mIHRoZSBncmFwaFxuXHRcdFx0Y29uc3QgYWRkT3V0Z29pbmdDaGFuZ2VzTm9kZSA9IHRoaXMuX3NjbVZpZXdTZXJ2aWNlLmdyYXBoU2hvd091dGdvaW5nQ2hhbmdlc0NvbmZpZy5nZXQoKVxuXHRcdFx0XHQmJiBoaXN0b3J5SXRlbVJlZnMuc29tZShyZWYgPT4gcmVmLmlkID09PSBoaXN0b3J5SXRlbVJlZj8uaWQpO1xuXG5cdFx0XHRjb25zdCB2aWV3TW9kZWxzID0gdG9JU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxBcnJheShcblx0XHRcdFx0aGlzdG9yeUl0ZW1zLFxuXHRcdFx0XHRjb2xvck1hcCxcblx0XHRcdFx0aGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVmLmdldCgpLFxuXHRcdFx0XHRoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZW1vdGVSZWYuZ2V0KCksXG5cdFx0XHRcdGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbUJhc2VSZWYuZ2V0KCksXG5cdFx0XHRcdGFkZEluY29taW5nQ2hhbmdlc05vZGUsXG5cdFx0XHRcdGFkZE91dGdvaW5nQ2hhbmdlc05vZGUsXG5cdFx0XHRcdG1lcmdlQmFzZSlcblx0XHRcdFx0Lm1hcChoaXN0b3J5SXRlbVZpZXdNb2RlbCA9PiAoe1xuXHRcdFx0XHRcdHJlcG9zaXRvcnksXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1WaWV3TW9kZWwsXG5cdFx0XHRcdFx0dHlwZTogJ2hpc3RvcnlJdGVtVmlld01vZGVsJ1xuXHRcdFx0XHR9KSBzYXRpc2ZpZXMgU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudCk7XG5cblx0XHRcdHN0YXRlID0geyBoaXN0b3J5SXRlbXNGaWx0ZXI6IGhpc3RvcnlJdGVtUmVmcywgdmlld01vZGVscywgbWVyZ2VCYXNlLCBsb2FkTW9yZTogZmFsc2UgfTtcblx0XHRcdHRoaXMuX3JlcG9zaXRvcnlTdGF0ZS5zZXQocmVwb3NpdG9yeSwgc3RhdGUpO1xuXG5cdFx0XHR0aGlzLl9zY21IaXN0b3J5SXRlbUNvdW50Q3R4LnNldCh2aWV3TW9kZWxzLmxlbmd0aCk7XG5cdFx0XHR0aGlzLmlzVmlld01vZGVsRW1wdHkuc2V0KHZpZXdNb2RlbHMubGVuZ3RoID09PSAwLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZS52aWV3TW9kZWxzO1xuXHR9XG5cblx0c2V0UmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSB8ICdhdXRvJyk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGVkUmVwb3NpdG9yeS5zZXQocmVwb3NpdG9yeSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldEhpc3RvcnlJdGVtc0ZpbHRlcihmaWx0ZXI6IEhpc3RvcnlJdGVtUmVmc0ZpbHRlcik6IHZvaWQge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLnJlcG9zaXRvcnkuZ2V0KCk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGZpbHRlciAhPT0gJ2F1dG8nKSB7XG5cdFx0XHR0aGlzLl9yZXBvc2l0b3J5RmlsdGVyU3RhdGUuc2V0KGdldFByb3ZpZGVyS2V5KHJlcG9zaXRvcnkucHJvdmlkZXIpLCBmaWx0ZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZXBvc2l0b3J5RmlsdGVyU3RhdGUuZGVsZXRlKGdldFByb3ZpZGVyS2V5KHJlcG9zaXRvcnkucHJvdmlkZXIpKTtcblx0XHR9XG5cdFx0dGhpcy5fc2F2ZUhpc3RvcnlJdGVtc0ZpbHRlclN0YXRlKCk7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlSGlzdG9yeUl0ZW1zRmlsdGVyLnRyaWdnZXIodW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFZpZXdNb2RlKHZpZXdNb2RlOiBWaWV3TW9kZSk6IHZvaWQge1xuXHRcdGlmICh2aWV3TW9kZSA9PT0gdGhpcy52aWV3TW9kZS5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld01vZGUuc2V0KHZpZXdNb2RlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3NjbUhpc3RvcnlWaWV3TW9kZUN0eC5zZXQodmlld01vZGUpO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzY20uZ3JhcGhWaWV3LnZpZXdNb2RlJywgdmlld01vZGUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWaWV3TW9kZSgpOiBWaWV3TW9kZSB7XG5cdFx0bGV0IG1vZGUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwndHJlZScgfCAnbGlzdCc+KCdzY20uZGVmYXVsdFZpZXdNb2RlJykgPT09ICdsaXN0JyA/IFZpZXdNb2RlLkxpc3QgOiBWaWV3TW9kZS5UcmVlO1xuXHRcdGNvbnN0IHN0b3JhZ2VNb2RlID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KCdzY20uZ3JhcGhWaWV3LnZpZXdNb2RlJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgYXMgVmlld01vZGU7XG5cdFx0aWYgKHR5cGVvZiBzdG9yYWdlTW9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG1vZGUgPSBzdG9yYWdlTW9kZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEdyYXBoQ29sb3JNYXAoaGlzdG9yeUl0ZW1SZWZzOiBJU0NNSGlzdG9yeUl0ZW1SZWZbXSk6IE1hcDxzdHJpbmcsIENvbG9ySWRlbnRpZmllciB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLnJlcG9zaXRvcnkuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlZi5nZXQoKTtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlbW90ZVJlZiA9IGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZW1vdGVSZWYuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1CYXNlUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbUJhc2VSZWYuZ2V0KCk7XG5cblx0XHRjb25zdCBjb2xvck1hcCA9IG5ldyBNYXA8c3RyaW5nLCBDb2xvcklkZW50aWZpZXIgfCB1bmRlZmluZWQ+KCk7XG5cblx0XHRpZiAoaGlzdG9yeUl0ZW1SZWYpIHtcblx0XHRcdGNvbG9yTWFwLnNldChoaXN0b3J5SXRlbVJlZi5pZCwgaGlzdG9yeUl0ZW1SZWYuY29sb3IpO1xuXG5cdFx0XHRpZiAoaGlzdG9yeUl0ZW1SZW1vdGVSZWYpIHtcblx0XHRcdFx0Y29sb3JNYXAuc2V0KGhpc3RvcnlJdGVtUmVtb3RlUmVmLmlkLCBoaXN0b3J5SXRlbVJlbW90ZVJlZi5jb2xvcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGlzdG9yeUl0ZW1CYXNlUmVmKSB7XG5cdFx0XHRcdGNvbG9yTWFwLnNldChoaXN0b3J5SXRlbUJhc2VSZWYuaWQsIGhpc3RvcnlJdGVtQmFzZVJlZi5jb2xvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIHRoZSByZW1haW5pbmcgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZXMgdG8gdGhlIGNvbG9yIG1hcFxuXHRcdC8vIGlmIG5vdCBhbHJlYWR5IHByZXNlbnQuIFRoZXNlIGhpc3RvcnkgaXRlbSByZWZlcmVuY2VzIHdpbGxcblx0XHQvLyBiZSBjb2xvcmVkIHVzaW5nIHRoZSBjb2xvciBvZiB0aGUgaGlzdG9yeSBpdGVtIHRvIHdoaWNoIHRoZXlcblx0XHQvLyBwb2ludCB0by5cblx0XHRmb3IgKGNvbnN0IHJlZiBvZiBoaXN0b3J5SXRlbVJlZnMpIHtcblx0XHRcdGlmICghY29sb3JNYXAuaGFzKHJlZi5pZCkpIHtcblx0XHRcdFx0Y29sb3JNYXAuc2V0KHJlZi5pZCwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY29sb3JNYXA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlSGlzdG9yeUl0ZW1GaWx0ZXIocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnksIGhpc3RvcnlQcm92aWRlcjogSVNDTUhpc3RvcnlQcm92aWRlcik6IFByb21pc2U8SVNDTUhpc3RvcnlJdGVtUmVmW10+IHtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZnM6IElTQ01IaXN0b3J5SXRlbVJlZltdID0gW107XG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1zRmlsdGVyID0gdGhpcy5fcmVwb3NpdG9yeUZpbHRlclN0YXRlLmdldChnZXRQcm92aWRlcktleShyZXBvc2l0b3J5LnByb3ZpZGVyKSkgPz8gJ2F1dG8nO1xuXG5cdFx0c3dpdGNoIChoaXN0b3J5SXRlbXNGaWx0ZXIpIHtcblx0XHRcdGNhc2UgJ2FsbCc6XG5cdFx0XHRcdGhpc3RvcnlJdGVtUmVmcy5wdXNoKC4uLihhd2FpdCBoaXN0b3J5UHJvdmlkZXIucHJvdmlkZUhpc3RvcnlJdGVtUmVmcygpID8/IFtdKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnYXV0byc6XG5cdFx0XHRcdGhpc3RvcnlJdGVtUmVmcy5wdXNoKC4uLltcblx0XHRcdFx0XHRoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZWYuZ2V0KCksXG5cdFx0XHRcdFx0aGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVtb3RlUmVmLmdldCgpLFxuXHRcdFx0XHRcdGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbUJhc2VSZWYuZ2V0KCksXG5cdFx0XHRcdF0uZmlsdGVyKHJlZiA9PiAhIXJlZikpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0Ly8gR2V0IHRoZSBsYXRlc3QgcmV2aXNpb25zIGZvciB0aGUgaGlzdG9yeSBpdGVtcyByZWZlcmVuY2VzIGluIHRoZSBmaWxlclxuXHRcdFx0XHRjb25zdCByZWZzID0gKGF3YWl0IGhpc3RvcnlQcm92aWRlci5wcm92aWRlSGlzdG9yeUl0ZW1SZWZzKGhpc3RvcnlJdGVtc0ZpbHRlcikgPz8gW10pXG5cdFx0XHRcdFx0LmZpbHRlcihyZWYgPT4gaGlzdG9yeUl0ZW1zRmlsdGVyLnNvbWUoZmlsdGVyID0+IGZpbHRlciA9PT0gcmVmLmlkKSk7XG5cblx0XHRcdFx0aWYgKHJlZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gUmVzZXQgdGhlIGZpbHRlclxuXHRcdFx0XHRcdGhpc3RvcnlJdGVtUmVmcy5wdXNoKC4uLltcblx0XHRcdFx0XHRcdGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbVJlZi5nZXQoKSxcblx0XHRcdFx0XHRcdGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbVJlbW90ZVJlZi5nZXQoKSxcblx0XHRcdFx0XHRcdGhpc3RvcnlQcm92aWRlci5oaXN0b3J5SXRlbUJhc2VSZWYuZ2V0KCksXG5cdFx0XHRcdFx0XS5maWx0ZXIocmVmID0+ICEhcmVmKSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3NpdG9yeUZpbHRlclN0YXRlLmRlbGV0ZShnZXRQcm92aWRlcktleShyZXBvc2l0b3J5LnByb3ZpZGVyKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGZpbHRlclxuXHRcdFx0XHRcdGhpc3RvcnlJdGVtUmVmcy5wdXNoKC4uLnJlZnMpO1xuXHRcdFx0XHRcdHRoaXMuX3JlcG9zaXRvcnlGaWx0ZXJTdGF0ZS5zZXQoZ2V0UHJvdmlkZXJLZXkocmVwb3NpdG9yeS5wcm92aWRlciksIHJlZnMubWFwKHJlZiA9PiByZWYuaWQpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX3NhdmVIaXN0b3J5SXRlbXNGaWx0ZXJTdGF0ZSgpO1xuXG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBoaXN0b3J5SXRlbVJlZnM7XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkSGlzdG9yeUl0ZW1zRmlsdGVyU3RhdGUoKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZpbHRlckRhdGEgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoJ3NjbS5ncmFwaFZpZXcucmVmZXJlbmNlc0ZpbHRlcicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0aWYgKGZpbHRlckRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBNYXA8c3RyaW5nLCBIaXN0b3J5SXRlbVJlZnNGaWx0ZXI+KEpTT04ucGFyc2UoZmlsdGVyRGF0YSkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggeyB9XG5cblx0XHRyZXR1cm4gbmV3IE1hcDxzdHJpbmcsIEhpc3RvcnlJdGVtUmVmc0ZpbHRlcj4oKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVIaXN0b3J5SXRlbXNGaWx0ZXJTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBmaWx0ZXIgPSBBcnJheS5mcm9tKHRoaXMuX3JlcG9zaXRvcnlGaWx0ZXJTdGF0ZS5lbnRyaWVzKCkpO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdzY20uZ3JhcGhWaWV3LnJlZmVyZW5jZXNGaWx0ZXInLCBKU09OLnN0cmluZ2lmeShmaWx0ZXIpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXBvc2l0b3J5U3RhdGUuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxudHlwZSBSZXBvc2l0b3J5UXVpY2tQaWNrSXRlbSA9IElRdWlja1BpY2tJdGVtICYgeyByZXBvc2l0b3J5OiAnYXV0bycgfCBJU0NNUmVwb3NpdG9yeSB9O1xuXG5jbGFzcyBSZXBvc2l0b3J5UGlja2VyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfYXV0b1F1aWNrUGlja0l0ZW06IFJlcG9zaXRvcnlRdWlja1BpY2tJdGVtID0ge1xuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXV0bycsIFwiQXV0b1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FjdGl2ZVJlcG9zaXRvcnknLCBcIlNob3cgdGhlIHNvdXJjZSBjb250cm9sIGdyYXBoIGZvciB0aGUgYWN0aXZlIHJlcG9zaXRvcnlcIiksXG5cdFx0cmVwb3NpdG9yeTogJ2F1dG8nXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2NtVmlld1NlcnZpY2U6IElTQ01WaWV3U2VydmljZVxuXHQpIHsgfVxuXG5cdGFzeW5jIHBpY2tSZXBvc2l0b3J5KCk6IFByb21pc2U8UmVwb3NpdG9yeVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwaWNrczogKFJlcG9zaXRvcnlRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXSA9IFtcblx0XHRcdHRoaXMuX2F1dG9RdWlja1BpY2tJdGVtLFxuXHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJyB9XTtcblxuXHRcdHBpY2tzLnB1c2goLi4udGhpcy5fc2NtVmlld1NlcnZpY2UucmVwb3NpdG9yaWVzLm1hcChyID0+ICh7XG5cdFx0XHRsYWJlbDogci5wcm92aWRlci5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHIucHJvdmlkZXIucm9vdFVyaT8uZnNQYXRoLFxuXHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uaXNUaGVtZUljb24oci5wcm92aWRlci5pY29uUGF0aClcblx0XHRcdFx0PyBUaGVtZUljb24uYXNDbGFzc05hbWUoci5wcm92aWRlci5pY29uUGF0aClcblx0XHRcdFx0OiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5yZXBvKSxcblx0XHRcdHJlcG9zaXRvcnk6IHJcblx0XHR9KSkpO1xuXG5cdFx0cmV0dXJuIHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHtcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc2NtR3JhcGhSZXBvc2l0b3J5JywgXCJTZWxlY3QgdGhlIHJlcG9zaXRvcnkgdG8gdmlldywgdHlwZSB0byBmaWx0ZXIgYWxsIHJlcG9zaXRvcmllc1wiKVxuXHRcdH0pO1xuXHR9XG59XG5cbnR5cGUgSGlzdG9yeUl0ZW1SZWZRdWlja1BpY2tJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7IGhpc3RvcnlJdGVtUmVmOiAnYWxsJyB8ICdhdXRvJyB8IElTQ01IaXN0b3J5SXRlbVJlZiB9O1xuXG5jbGFzcyBIaXN0b3J5SXRlbVJlZlBpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGxRdWlja1BpY2tJdGVtOiBIaXN0b3J5SXRlbVJlZlF1aWNrUGlja0l0ZW0gPSB7XG5cdFx0aWQ6ICdhbGwnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWxsJywgXCJBbGxcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhbGxIaXN0b3J5SXRlbVJlZnMnLCBcIkFsbCBoaXN0b3J5IGl0ZW0gcmVmZXJlbmNlc1wiKSxcblx0XHRoaXN0b3J5SXRlbVJlZjogJ2FsbCdcblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXRvUXVpY2tQaWNrSXRlbTogSGlzdG9yeUl0ZW1SZWZRdWlja1BpY2tJdGVtID0ge1xuXHRcdGlkOiAnYXV0bycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdhdXRvJywgXCJBdXRvXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY3VycmVudEhpc3RvcnlJdGVtUmVmJywgXCJDdXJyZW50IGhpc3RvcnkgaXRlbSByZWZlcmVuY2UocylcIiksXG5cdFx0aGlzdG9yeUl0ZW1SZWY6ICdhdXRvJ1xuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlQcm92aWRlcjogSVNDTUhpc3RvcnlQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oaXN0b3J5SXRlbXNGaWx0ZXI6ICdhbGwnIHwgJ2F1dG8nIHwgSVNDTUhpc3RvcnlJdGVtUmVmW10sXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgcGlja0hpc3RvcnlJdGVtUmVmKCk6IFByb21pc2U8SGlzdG9yeUl0ZW1SZWZzRmlsdGVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPEhpc3RvcnlJdGVtUmVmUXVpY2tQaWNrSXRlbT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChxdWlja1BpY2spO1xuXG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NjbUdyYXBoSGlzdG9yeUl0ZW1SZWYnLCBcIlNlbGVjdCBvbmUvbW9yZSBoaXN0b3J5IGl0ZW0gcmVmZXJlbmNlcyB0byB2aWV3LCB0eXBlIHRvIGZpbHRlclwiKTtcblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLmhpZGVDaGVja0FsbCA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cblx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IHRoaXMuX2NyZWF0ZVF1aWNrUGlja0l0ZW1zKCk7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCBzZWxlY3Rpb25cblx0XHRsZXQgc2VsZWN0ZWRJdGVtczogSGlzdG9yeUl0ZW1SZWZRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRpZiAodGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyID09PSAnYWxsJykge1xuXHRcdFx0c2VsZWN0ZWRJdGVtcy5wdXNoKHRoaXMuX2FsbFF1aWNrUGlja0l0ZW0pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyID09PSAnYXV0bycpIHtcblx0XHRcdHNlbGVjdGVkSXRlbXMucHVzaCh0aGlzLl9hdXRvUXVpY2tQaWNrSXRlbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBpbmRleCA9IDA7XG5cdFx0XHR3aGlsZSAoaW5kZXggPCBpdGVtcy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKGl0ZW1zW2luZGV4XS50eXBlID09PSAnc2VwYXJhdG9yJykge1xuXHRcdFx0XHRcdGluZGV4Kys7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5faGlzdG9yeUl0ZW1zRmlsdGVyLnNvbWUocmVmID0+IHJlZi5pZCA9PT0gaXRlbXNbaW5kZXhdLmlkKSkge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSBpdGVtcy5zcGxpY2UoaW5kZXgsIDEpIGFzIEhpc3RvcnlJdGVtUmVmUXVpY2tQaWNrSXRlbVtdO1xuXHRcdFx0XHRcdHNlbGVjdGVkSXRlbXMucHVzaCguLi5pdGVtKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEluc2VydCB0aGUgc2VsZWN0ZWQgaXRlbXMgYWZ0ZXIgYEFsbGAgYW5kIGBBdXRvYFxuXHRcdFx0aXRlbXMuc3BsaWNlKDIsIDAsIHsgdHlwZTogJ3NlcGFyYXRvcicgfSwgLi4uc2VsZWN0ZWRJdGVtcyk7XG5cdFx0fVxuXG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0cXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMgPSBzZWxlY3RlZEl0ZW1zO1xuXHRcdHF1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SGlzdG9yeUl0ZW1SZWZzRmlsdGVyIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdHRoaXMuX3N0b3JlLmFkZChxdWlja1BpY2sub25EaWRDaGFuZ2VTZWxlY3Rpb24oaXRlbXMgPT4ge1xuXHRcdFx0XHRjb25zdCB7IGFkZGVkIH0gPSBkZWx0YShzZWxlY3RlZEl0ZW1zLCBpdGVtcywgKGEsIGIpID0+IGNvbXBhcmUoYS5pZCA/PyAnJywgYi5pZCA/PyAnJykpO1xuXHRcdFx0XHRpZiAoYWRkZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGlmIChhZGRlZFswXS5oaXN0b3J5SXRlbVJlZiA9PT0gJ2FsbCcgfHwgYWRkZWRbMF0uaGlzdG9yeUl0ZW1SZWYgPT09ICdhdXRvJykge1xuXHRcdFx0XHRcdFx0cXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMgPSBbYWRkZWRbMF1dO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBSZW1vdmUgJ2FsbCcgYW5kICdhdXRvJyBpdGVtcyBpZiBwcmVzZW50XG5cdFx0XHRcdFx0XHRxdWlja1BpY2suc2VsZWN0ZWRJdGVtcyA9IFsuLi5xdWlja1BpY2suc2VsZWN0ZWRJdGVtc1xuXHRcdFx0XHRcdFx0XHQuZmlsdGVyKGkgPT4gaS5oaXN0b3J5SXRlbVJlZiAhPT0gJ2FsbCcgJiYgaS5oaXN0b3J5SXRlbVJlZiAhPT0gJ2F1dG8nKV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2VsZWN0ZWRJdGVtcyA9IFsuLi5xdWlja1BpY2suc2VsZWN0ZWRJdGVtc107XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3N0b3JlLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWRJdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoc2VsZWN0ZWRJdGVtcy5sZW5ndGggPT09IDEgJiYgc2VsZWN0ZWRJdGVtc1swXS5oaXN0b3J5SXRlbVJlZiA9PT0gJ2FsbCcpIHtcblx0XHRcdFx0XHRyZXNvbHZlKCdhbGwnKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzZWxlY3RlZEl0ZW1zLmxlbmd0aCA9PT0gMSAmJiBzZWxlY3RlZEl0ZW1zWzBdLmhpc3RvcnlJdGVtUmVmID09PSAnYXV0bycpIHtcblx0XHRcdFx0XHRyZXNvbHZlKCdhdXRvJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShzZWxlY3RlZEl0ZW1zLm1hcChpdGVtID0+IChpdGVtLmhpc3RvcnlJdGVtUmVmIGFzIElTQ01IaXN0b3J5SXRlbVJlZikuaWQpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3N0b3JlLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVF1aWNrUGlja0l0ZW1zKCk6IFByb21pc2U8KEhpc3RvcnlJdGVtUmVmUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10+IHtcblx0XHRjb25zdCBwaWNrczogKEhpc3RvcnlJdGVtUmVmUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXG5cdFx0XHR0aGlzLl9hbGxRdWlja1BpY2tJdGVtLCB0aGlzLl9hdXRvUXVpY2tQaWNrSXRlbVxuXHRcdF07XG5cblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZnMgPSBhd2FpdCB0aGlzLl9oaXN0b3J5UHJvdmlkZXIucHJvdmlkZUhpc3RvcnlJdGVtUmVmcygpID8/IFtdO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmc0J5Q2F0ZWdvcnkgPSBncm91cEJ5KGhpc3RvcnlJdGVtUmVmcywgKGEsIGIpID0+IGNvbXBhcmUoYS5jYXRlZ29yeSA/PyAnJywgYi5jYXRlZ29yeSA/PyAnJykpO1xuXG5cdFx0Zm9yIChjb25zdCByZWZzIG9mIGhpc3RvcnlJdGVtUmVmc0J5Q2F0ZWdvcnkpIHtcblx0XHRcdGlmIChyZWZzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0cGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogcmVmc1swXS5jYXRlZ29yeSB9KTtcblxuXHRcdFx0cGlja3MucHVzaCguLi5yZWZzLm1hcChyZWYgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiByZWYuaWQsXG5cdFx0XHRcdFx0bGFiZWw6IHJlZi5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiByZWYuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uaXNUaGVtZUljb24ocmVmLmljb24pID9cblx0XHRcdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShyZWYuaWNvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aGlzdG9yeUl0ZW1SZWY6IHJlZlxuXHRcdFx0XHR9O1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwaWNrcztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU0NNSGlzdG9yeVZpZXdQYW5lIGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByaXZhdGUgX3RyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfdHJlZSE6IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8U0NNSGlzdG9yeVZpZXdNb2RlbCwgVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+O1xuXHRwcml2YXRlIF90cmVlVmlld01vZGVsITogU0NNSGlzdG9yeVZpZXdNb2RlbDtcblx0cHJpdmF0ZSBfdHJlZURhdGFTb3VyY2UhOiBTQ01IaXN0b3J5VHJlZURhdGFTb3VyY2U7XG5cdHByaXZhdGUgX3RyZWVJZGVudGl0eVByb3ZpZGVyITogU0NNSGlzdG9yeVRyZWVJZGVudGl0eVByb3ZpZGVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcG9zaXRvcnlJc0xvYWRpbmdNb3JlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yeU91dGRhdGVkID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Zpc2liaWxpdHlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90cmVlT3BlcmF0aW9uU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmVlTG9hZE1vcmVTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZnJlc2hUaHJvdHRsZXIgPSBuZXcgVGhyb3R0bGVyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VwZGF0ZUNoaWxkcmVuVGhyb3R0bGVyID0gbmV3IFRocm90dGxlcigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjbVByb3ZpZGVyQ3R4OiBJQ29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY21DdXJyZW50SGlzdG9yeUl0ZW1SZWZIYXNSZW1vdGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY21DdXJyZW50SGlzdG9yeUl0ZW1SZWZIYXNCYXNlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSW5GaWx0ZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51RGlzcG9zYWJsZXMgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2NtVmlld1NlcnZpY2U6IElTQ01WaWV3U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0dGl0bGVNZW51SWQ6IE1lbnVJZC5TQ01IaXN0b3J5VGl0bGUsXG5cdFx0XHRzaG93QWN0aW9uczogVmlld1BhbmVTaG93QWN0aW9ucy5XaGVuRXhwYW5kZWRcblx0XHR9LCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3NjbVByb3ZpZGVyQ3R4ID0gQ29udGV4dEtleXMuU0NNUHJvdmlkZXIuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc1JlbW90ZSA9IENvbnRleHRLZXlzLlNDTUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc1JlbW90ZS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fc2NtQ3VycmVudEhpc3RvcnlJdGVtUmVmSGFzQmFzZSA9IENvbnRleHRLZXlzLlNDTUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc0Jhc2UuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkluRmlsdGVyID0gQ29udGV4dEtleXMuU0NNQ3VycmVudEhpc3RvcnlJdGVtUmVmSW5GaWx0ZXIuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fYWN0aW9uUnVubmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTQ01IaXN0b3J5Vmlld1BhbmVBY3Rpb25SdW5uZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FjdGlvblJ1bm5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZWZyZXNoVGhyb3R0bGVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl91cGRhdGVDaGlsZHJlblRocm90dGxlcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVySGVhZGVyVGl0bGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckhlYWRlclRpdGxlKGNvbnRhaW5lciwgdGhpcy50aXRsZSk7XG5cblx0XHRjb25zdCBlbGVtZW50ID0gaCgnZGl2LnNjbS1ncmFwaC12aWV3LWJhZGdlLWNvbnRhaW5lcicsIFtcblx0XHRcdGgoJ2Rpdi5zY20tZ3JhcGgtdmlldy1iYWRnZS5tb25hY28tY291bnQtYmFkZ2UubG9uZ0BiYWRnZScpXG5cdFx0XSk7XG5cblx0XHRlbGVtZW50LmJhZGdlLnRleHRDb250ZW50ID0gJ091dGRhdGVkJztcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWxlbWVudC5yb290KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG91dGRhdGVkID0gdGhpcy5fcmVwb3NpdG9yeU91dGRhdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGVsZW1lbnQucm9vdC5zdHlsZS5kaXNwbGF5ID0gb3V0ZGF0ZWQgPyAnJyA6ICdub25lJztcblxuXHRcdFx0aWYgKG91dGRhdGVkKSB7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoZWxlbWVudC5yb290LCB7XG5cdFx0XHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRcdFx0Y29tcGFjdDogdHJ1ZSxcblx0XHRcdFx0XHRcdHNob3dQb2ludGVyOiB0cnVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3NjbUdyYXBoVmlld091dGRhdGVkJywgXCJQbGVhc2UgcmVmcmVzaCB0aGUgZ3JhcGggdXNpbmcgdGhlIHJlZnJlc2ggYWN0aW9uICh7MH0pLlwiLCAnJChyZWZyZXNoKScpLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3RyZWVDb250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2NtLXZpZXcuc2NtLWhpc3Rvcnktdmlldy5zaG93LWZpbGUtaWNvbnMnKSk7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdmaWxlLWljb24tdGhlbWFibGUtdHJlZScpO1xuXG5cdFx0dGhpcy5fY3JlYXRlVHJlZSh0aGlzLl90cmVlQ29udGFpbmVyKTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eShhc3luYyB2aXNpYmxlID0+IHtcblx0XHRcdGlmICghdmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl92aXNpYmlsaXR5RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDcmVhdGUgdmlldyBtb2RlbFxuXHRcdFx0dGhpcy5fdHJlZVZpZXdNb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU0NNSGlzdG9yeVZpZXdNb2RlbCk7XG5cdFx0XHR0aGlzLl92aXNpYmlsaXR5RGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RyZWVWaWV3TW9kZWwpO1xuXG5cdFx0XHQvLyBXYWl0IGZvciBmaXJzdCByZXBvc2l0b3J5IHRvIGJlIGluaXRpYWxpemVkXG5cdFx0XHRjb25zdCBmaXJzdFJlcG9zaXRvcnlJbml0aWFsaXplZCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3RyZWVWaWV3TW9kZWwucmVwb3NpdG9yeS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHJlcG9zaXRvcnk/LnByb3ZpZGVyLmhpc3RvcnlQcm92aWRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUmVmID0gaGlzdG9yeVByb3ZpZGVyPy5oaXN0b3J5SXRlbVJlZi5yZWFkKHJlYWRlcik7XG5cblx0XHRcdFx0cmV0dXJuIGhpc3RvcnlJdGVtUmVmICE9PSB1bmRlZmluZWQgPyB0cnVlIDogdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoZmlyc3RSZXBvc2l0b3J5SW5pdGlhbGl6ZWQpO1xuXG5cdFx0XHQvLyBJbml0aWFsIHJlbmRlcmluZ1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiB0aGlzLmlkIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdHJlZS5zZXRJbnB1dCh0aGlzLl90cmVlVmlld01vZGVsKTtcblx0XHRcdFx0XHR0aGlzLl90cmVlLnNjcm9sbFRvcCA9IDA7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuX3Zpc2liaWxpdHlEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHR0aGlzLl90cmVlVmlld01vZGVsLmlzVmlld01vZGVsRW1wdHkucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBTZXR0aW5ncyBjaGFuZ2Vcblx0XHRcdHRoaXMuX3Zpc2liaWxpdHlEaXNwb3NhYmxlcy5hZGQocnVuT25DaGFuZ2UodGhpcy5fc2NtVmlld1NlcnZpY2UuZ3JhcGhTaG93SW5jb21pbmdDaGFuZ2VzQ29uZmlnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fdmlzaWJpbGl0eURpc3Bvc2FibGVzLmFkZChydW5PbkNoYW5nZSh0aGlzLl9zY21WaWV3U2VydmljZS5ncmFwaFNob3dPdXRnb2luZ0NoYW5nZXNDb25maWcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFJlcG9zaXRvcnkgY2hhbmdlXG5cdFx0XHRsZXQgaXNGaXJzdFJ1biA9IHRydWU7XG5cdFx0XHR0aGlzLl92aXNpYmlsaXR5RGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuX3RyZWVWaWV3TW9kZWwucmVwb3NpdG9yeS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHJlcG9zaXRvcnk/LnByb3ZpZGVyLmhpc3RvcnlQcm92aWRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICghcmVwb3NpdG9yeSB8fCAhaGlzdG9yeVByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSGlzdG9yeUl0ZW1JZCBjaGFuZ2VkIChjaGVja291dClcblx0XHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWZJZCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gaGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVmLnJlYWQocmVhZGVyKT8uaWQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJ1bk9uQ2hhbmdlKGhpc3RvcnlJdGVtUmVmSWQsIGFzeW5jIGhpc3RvcnlJdGVtUmVmSWRWYWx1ZSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cblx0XHRcdFx0XHQvLyBVcGRhdGUgY29udGV4dCBrZXkgKG5lZWRzIHRvIGJlIGRvbmUgYWZ0ZXIgdGhlIHJlZnJlc2ggY2FsbClcblx0XHRcdFx0XHR0aGlzLl9zY21DdXJyZW50SGlzdG9yeUl0ZW1SZWZJbkZpbHRlci5zZXQodGhpcy5faXNDdXJyZW50SGlzdG9yeUl0ZW1JbkZpbHRlcihoaXN0b3J5SXRlbVJlZklkVmFsdWUpKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIEhpc3RvcnlJdGVtUmVmcyBjaGFuZ2VkXG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocnVuT25DaGFuZ2UoaGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtUmVmQ2hhbmdlcywgY2hhbmdlcyA9PiB7XG5cdFx0XHRcdFx0aWYgKGNoYW5nZXMuc2lsZW50KSB7XG5cdFx0XHRcdFx0XHQvLyBUaGUgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZSBjaGFuZ2VzIG9jY3VycmVkIGluIHRoZSBiYWNrZ3JvdW5kIChleDogQXV0byBGZXRjaClcblx0XHRcdFx0XHRcdC8vIElmIHRyZWUgaXMgc2Nyb2xsZWQgdG8gdGhlIHRvcCwgd2UgY2FuIHNhZmVseSByZWZyZXNoIHRoZSB0cmVlLCBvdGhlcndpc2Ugd2Vcblx0XHRcdFx0XHRcdC8vIHdpbGwgc2hvdyBhIHZpc3VhbCBjdWUgdGhhdCB0aGUgdmlldyBpcyBvdXRkYXRlZC5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl90cmVlLnNjcm9sbFRvcCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBTaG93IHRoZSBcIk91dGRhdGVkXCIgYmFkZ2Ugb24gdGhlIHZpZXdcblx0XHRcdFx0XHRcdHRoaXMuX3JlcG9zaXRvcnlPdXRkYXRlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLnJlZnJlc2goKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIEhpc3RvcnlJdGVtUmVmcyBmaWx0ZXIgY2hhbmdlZFxuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJ1bk9uQ2hhbmdlKHRoaXMuX3RyZWVWaWV3TW9kZWwub25EaWRDaGFuZ2VIaXN0b3J5SXRlbXNGaWx0ZXIsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2goKTtcblxuXHRcdFx0XHRcdC8vIFVwZGF0ZSBjb250ZXh0IGtleSAobmVlZHMgdG8gYmUgZG9uZSBhZnRlciB0aGUgcmVmcmVzaCBjYWxsKVxuXHRcdFx0XHRcdHRoaXMuX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkluRmlsdGVyLnNldCh0aGlzLl9pc0N1cnJlbnRIaXN0b3J5SXRlbUluRmlsdGVyKGhpc3RvcnlJdGVtUmVmSWQucmVhZCh1bmRlZmluZWQpKSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBIaXN0b3J5SXRlbVJlbW90ZVJlZiBjaGFuZ2VkXG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc1JlbW90ZS5zZXQoISFoaXN0b3J5UHJvdmlkZXIuaGlzdG9yeUl0ZW1SZW1vdGVSZWYucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIEhpc3RvcnlJdGVtQmFzZVJlZiBjaGFuZ2VkXG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc0Jhc2Uuc2V0KCEhaGlzdG9yeVByb3ZpZGVyLmhpc3RvcnlJdGVtQmFzZVJlZi5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gVmlld01vZGUgY2hhbmdlZFxuXHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJ1bk9uQ2hhbmdlKHRoaXMuX3RyZWVWaWV3TW9kZWwudmlld01vZGUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gVXBkYXRlIGNvbnRleHRcblx0XHRcdFx0dGhpcy5fc2NtUHJvdmlkZXJDdHguc2V0KHJlcG9zaXRvcnkucHJvdmlkZXIucHJvdmlkZXJJZCk7XG5cdFx0XHRcdHRoaXMuX3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkluRmlsdGVyLnNldCh0aGlzLl9pc0N1cnJlbnRIaXN0b3J5SXRlbUluRmlsdGVyKGhpc3RvcnlJdGVtUmVmSWQucmVhZCh1bmRlZmluZWQpKSk7XG5cblx0XHRcdFx0Ly8gV2Ugc2tpcCByZWZyZXNoaW5nIHRoZSBncmFwaCBvbiB0aGUgZmlyc3QgZXhlY3V0aW9uIG9mIHRoZSBhdXRvcnVuXG5cdFx0XHRcdC8vIHNpbmNlIHRoZSBncmFwaCBmb3IgdGhlIGZpcnN0IHJlcG9zaXRvcnkgaXMgcmVuZGVyZWQgd2hlbiB0aGUgdHJlZVxuXHRcdFx0XHQvLyBpbnB1dCBpcyBzZXQuXG5cdFx0XHRcdGlmICghaXNGaXJzdFJ1bikge1xuXHRcdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlzRmlyc3RSdW4gPSBmYWxzZTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gRmlsZUljb25UaGVtZSAmIHZpZXdNb2RlIGNoYW5nZVxuXHRcdFx0Y29uc3QgZmlsZUljb25UaGVtZU9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHRcdHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSxcblx0XHRcdFx0KCkgPT4gdGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpKTtcblxuXHRcdFx0dGhpcy5fdmlzaWJpbGl0eURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVJY29uVGhlbWUgPSBmaWxlSWNvblRoZW1lT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3Qgdmlld01vZGUgPSB0aGlzLl90cmVlVmlld01vZGVsLnZpZXdNb2RlLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHR0aGlzLl91cGRhdGVJbmRlbnRTdHlsZXMoZmlsZUljb25UaGVtZSwgdmlld01vZGUpO1xuXHRcdFx0fSkpO1xuXHRcdH0sIHRoaXMsIHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLl90cmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEFjdGlvblJ1bm5lcigpOiBJQWN0aW9uUnVubmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uUnVubmVyO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aW9uc0NvbnRleHQoKTogSVNDTVByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZVZpZXdNb2RlbD8ucmVwb3NpdG9yeS5nZXQoKT8ucHJvdmlkZXI7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM/OiBJRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW1PcHRpb25zKTogSUFjdGlvblZpZXdJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoYWN0aW9uLmlkID09PSBQSUNLX1JFUE9TSVRPUllfQUNUSU9OX0lEKSB7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fdHJlZVZpZXdNb2RlbD8ucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRcdGlmIChyZXBvc2l0b3J5KSB7XG5cdFx0XHRcdHJldHVybiBuZXcgU0NNUmVwb3NpdG9yeUFjdGlvblZpZXdJdGVtKHJlcG9zaXRvcnksIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChhY3Rpb24uaWQgPT09IFBJQ0tfSElTVE9SWV9JVEVNX1JFRlNfQUNUSU9OX0lEKSB7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fdHJlZVZpZXdNb2RlbD8ucmVwb3NpdG9yeS5nZXQoKTtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtc0ZpbHRlciA9IHRoaXMuX3RyZWVWaWV3TW9kZWw/LmdldEhpc3RvcnlJdGVtc0ZpbHRlcigpO1xuXHRcdFx0aWYgKHJlcG9zaXRvcnkgJiYgaGlzdG9yeUl0ZW1zRmlsdGVyKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgU0NNSGlzdG9yeUl0ZW1SZWZzQWN0aW9uVmlld0l0ZW0ocmVwb3NpdG9yeSwgaGlzdG9yeUl0ZW1zRmlsdGVyLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzdXBlci5jcmVhdGVBY3Rpb25WaWV3SXRlbShhY3Rpb24sIG9wdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHR0aGlzLl90cmVlLmZvY3VzRmlyc3QoZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdHRoaXMuX3RyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNob3VsZFNob3dXZWxjb21lKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl90cmVlVmlld01vZGVsPy5pc1ZpZXdNb2RlbEVtcHR5LmdldCgpID09PSB0cnVlO1xuXHR9XG5cblx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVmcmVzaFRocm90dGxlci5xdWV1ZSh0b2tlbiA9PiB0aGlzLl9yZWZyZXNoKHRva2VuKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3RyZWVWaWV3TW9kZWwuY2xlYXJSZXBvc2l0b3J5U3RhdGUoKTtcblx0XHRhd2FpdCB0aGlzLl91cGRhdGVDaGlsZHJlbigpO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVBY3Rpb25zKCk7XG5cdFx0dGhpcy5fcmVwb3NpdG9yeU91dGRhdGVkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl90cmVlLnNjcm9sbFRvcCA9IDA7XG5cdH1cblxuXHRhc3luYyBwaWNrUmVwb3NpdG9yeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwaWNrZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBvc2l0b3J5UGlja2VyKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwaWNrZXIucGlja1JlcG9zaXRvcnkoKTtcblxuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHRoaXMuX3RyZWVWaWV3TW9kZWwuc2V0UmVwb3NpdG9yeShyZXN1bHQucmVwb3NpdG9yeSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcGlja0hpc3RvcnlJdGVtUmVmKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSB0aGlzLl90cmVlVmlld01vZGVsLnJlcG9zaXRvcnkuZ2V0KCk7XG5cdFx0Y29uc3QgaGlzdG9yeVByb3ZpZGVyID0gcmVwb3NpdG9yeT8ucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlJdGVtc0ZpbHRlciA9IHRoaXMuX3RyZWVWaWV3TW9kZWwuZ2V0SGlzdG9yeUl0ZW1zRmlsdGVyKCk7XG5cblx0XHRpZiAoIWhpc3RvcnlQcm92aWRlciB8fCAhaGlzdG9yeUl0ZW1zRmlsdGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGlja2VyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSGlzdG9yeUl0ZW1SZWZQaWNrZXIsIGhpc3RvcnlQcm92aWRlciwgaGlzdG9yeUl0ZW1zRmlsdGVyKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwaWNrZXIucGlja0hpc3RvcnlJdGVtUmVmKCk7XG5cblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHR0aGlzLl90cmVlVmlld01vZGVsLnNldEhpc3RvcnlJdGVtc0ZpbHRlcihyZXN1bHQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJldmVhbEN1cnJlbnRIaXN0b3J5SXRlbSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gdGhpcy5fdHJlZVZpZXdNb2RlbC5yZXBvc2l0b3J5LmdldCgpO1xuXHRcdGNvbnN0IGhpc3RvcnlQcm92aWRlciA9IHJlcG9zaXRvcnk/LnByb3ZpZGVyLmhpc3RvcnlQcm92aWRlci5nZXQoKTtcblx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZiA9IGhpc3RvcnlQcm92aWRlcj8uaGlzdG9yeUl0ZW1SZWYuZ2V0KCk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5IHx8ICFoaXN0b3J5SXRlbVJlZj8uaWQgfHwgIWhpc3RvcnlJdGVtUmVmPy5yZXZpc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5faXNDdXJyZW50SGlzdG9yeUl0ZW1JbkZpbHRlcihoaXN0b3J5SXRlbVJlZi5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXZlYWxUcmVlTm9kZSA9ICgpOiBib29sZWFuID0+IHtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtVHJlZUVsZW1lbnQgPSB0aGlzLl90cmVlVmlld01vZGVsLmdldEN1cnJlbnRIaXN0b3J5SXRlbVRyZWVFbGVtZW50KCk7XG5cblx0XHRcdGlmIChoaXN0b3J5SXRlbVRyZWVFbGVtZW50ICYmIHRoaXMuX3RyZWUuaGFzTm9kZShoaXN0b3J5SXRlbVRyZWVFbGVtZW50KSkge1xuXHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChoaXN0b3J5SXRlbVRyZWVFbGVtZW50LCAwLjUpO1xuXG5cdFx0XHRcdHRoaXMuX3RyZWUuc2V0U2VsZWN0aW9uKFtoaXN0b3J5SXRlbVRyZWVFbGVtZW50XSk7XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW2hpc3RvcnlJdGVtVHJlZUVsZW1lbnRdKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0aWYgKHJldmVhbFRyZWVOb2RlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGZXRjaCBjdXJyZW50IGhpc3RvcnkgaXRlbVxuXHRcdGF3YWl0IHRoaXMuX2xvYWRNb3JlKGhpc3RvcnlJdGVtUmVmLnJldmlzaW9uKTtcblxuXHRcdC8vIFJldmVhbCBub2RlXG5cdFx0cmV2ZWFsVHJlZU5vZGUoKTtcblx0fVxuXG5cdHNldFZpZXdNb2RlKHZpZXdNb2RlOiBWaWV3TW9kZSk6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWVWaWV3TW9kZWwuc2V0Vmlld01vZGUodmlld01vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVHJlZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fdHJlZUlkZW50aXR5UHJvdmlkZXIgPSBuZXcgU0NNSGlzdG9yeVRyZWVJZGVudGl0eVByb3ZpZGVyKCk7XG5cblx0XHRjb25zdCByZXNvdXJjZUxhYmVscyA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHsgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkgfSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVzb3VyY2VMYWJlbHMpO1xuXG5cdFx0dGhpcy5fdHJlZURhdGFTb3VyY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTUhpc3RvcnlUcmVlRGF0YVNvdXJjZSwgKCkgPT4gdGhpcy5fdHJlZVZpZXdNb2RlbC52aWV3TW9kZS5nZXQoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZURhdGFTb3VyY2UpO1xuXG5cdFx0Y29uc3QgY29tcHJlc3Npb25FbmFibGVkID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKCdzY20uY29tcGFjdEZvbGRlcnMnLCB0cnVlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3RyZWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSxcblx0XHRcdCdTQ00gSGlzdG9yeSBUcmVlJyxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdG5ldyBMaXN0RGVsZWdhdGUoKSxcblx0XHRcdG5ldyBTQ01IaXN0b3J5VHJlZUNvbXByZXNzaW9uRGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShIaXN0b3J5SXRlbVJlbmRlcmVyLCB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHRoaXMuaWQpKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShIaXN0b3J5SXRlbUNoYW5nZVJlbmRlcmVyLCAoKSA9PiB0aGlzLl90cmVlVmlld01vZGVsLnZpZXdNb2RlLmdldCgpLCByZXNvdXJjZUxhYmVscyksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSGlzdG9yeUl0ZW1Mb2FkTW9yZVJlbmRlcmVyLCB0aGlzLl9yZXBvc2l0b3J5SXNMb2FkaW5nTW9yZSwgKCkgPT4gdGhpcy5fbG9hZE1vcmUoKSksXG5cdFx0XHRdLFxuXHRcdFx0dGhpcy5fdHJlZURhdGFTb3VyY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFNDTUhpc3RvcnlUcmVlQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHRoaXMuX3RyZWVJZGVudGl0eVByb3ZpZGVyLFxuXHRcdFx0XHRjb2xsYXBzZUJ5RGVmYXVsdDogKGU6IHVua25vd24pID0+ICFpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlTm9kZShlKSxcblx0XHRcdFx0Y29tcHJlc3Npb25FbmFibGVkOiBjb21wcmVzc2lvbkVuYWJsZWQuZ2V0KCksXG5cdFx0XHRcdGRuZDogbmV3IFNDTUhpc3RvcnlUcmVlRHJhZ0FuZERyb3AoKSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogbmV3IFNDTUhpc3RvcnlUcmVlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcigpLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0dHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzczogKGU6IHVua25vd24pID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gaXNTQ01IaXN0b3J5SXRlbVZpZXdNb2RlbFRyZWVFbGVtZW50KGUpIHx8IGlzU0NNSGlzdG9yeUl0ZW1Mb2FkTW9yZVRyZWVFbGVtZW50KGUpXG5cdFx0XHRcdFx0XHQ/ICdmb3JjZS1uby10d2lzdGllJ1xuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpIGFzIFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8U0NNSGlzdG9yeVZpZXdNb2RlbCwgVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUpO1xuXG5cdFx0dGhpcy5fdHJlZS5vbkRpZE9wZW4odGhpcy5fb25EaWRPcGVuLCB0aGlzLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fdHJlZS5vbkNvbnRleHRNZW51KHRoaXMuX29uQ29udGV4dE1lbnUsIHRoaXMsIHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQ3VycmVudEhpc3RvcnlJdGVtSW5GaWx0ZXIoaGlzdG9yeUl0ZW1SZWZJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFoaXN0b3J5SXRlbVJlZklkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeUl0ZW1GaWx0ZXIgPSB0aGlzLl90cmVlVmlld01vZGVsLmdldEhpc3RvcnlJdGVtc0ZpbHRlcigpO1xuXHRcdGlmIChoaXN0b3J5SXRlbUZpbHRlciA9PT0gJ2FsbCcgfHwgaGlzdG9yeUl0ZW1GaWx0ZXIgPT09ICdhdXRvJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkoaGlzdG9yeUl0ZW1GaWx0ZXIpICYmICEhaGlzdG9yeUl0ZW1GaWx0ZXIuZmluZChyZWYgPT4gcmVmLmlkID09PSBoaXN0b3J5SXRlbVJlZklkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29uRGlkT3BlbihlOiBJT3BlbkV2ZW50PFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlVmlld01vZGVsVHJlZUVsZW1lbnQoZS5lbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1DaGFuZ2UgPSBlLmVsZW1lbnQuaGlzdG9yeUl0ZW1DaGFuZ2U7XG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbSA9IGUuZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbTtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtRGlzcGxheUlkID0gaGlzdG9yeUl0ZW0uaWQgPT09IFNDTUluY29taW5nSGlzdG9yeUl0ZW1JZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdpbmNvbWluZ0NoYW5nZXMnLCBcIkluY29taW5nIENoYW5nZXNcIilcblx0XHRcdFx0OiBoaXN0b3J5SXRlbS5pZCA9PT0gU0NNT3V0Z29pbmdIaXN0b3J5SXRlbUlkXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnb3V0Z29pbmdDaGFuZ2VzJywgXCJPdXRnb2luZyBDaGFuZ2VzXCIpXG5cdFx0XHRcdFx0OiBoaXN0b3J5SXRlbS5kaXNwbGF5SWQgPz8gaGlzdG9yeUl0ZW0uaWQ7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUGFyZW50SWQgPSBoaXN0b3J5SXRlbS5wYXJlbnRJZHMubGVuZ3RoID4gMCA/IGhpc3RvcnlJdGVtLnBhcmVudElkc1swXSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGhpc3RvcnlJdGVtUGFyZW50RGlzcGxheUlkID0gaGlzdG9yeUl0ZW1QYXJlbnRJZCAmJiBoaXN0b3J5SXRlbS5kaXNwbGF5SWRcblx0XHRcdFx0PyBoaXN0b3J5SXRlbVBhcmVudElkLnN1YnN0cmluZygwLCBoaXN0b3J5SXRlbS5kaXNwbGF5SWQubGVuZ3RoKVxuXHRcdFx0XHQ6IGhpc3RvcnlJdGVtUGFyZW50SWQ7XG5cblx0XHRcdGlmIChoaXN0b3J5SXRlbUNoYW5nZS5vcmlnaW5hbFVyaSAmJiBoaXN0b3J5SXRlbUNoYW5nZS5tb2RpZmllZFVyaSkge1xuXHRcdFx0XHQvLyBEaWZmIEVkaXRvclxuXHRcdFx0XHRjb25zdCBvcmlnaW5hbFVyaVRpdGxlID0gYCR7YmFzZW5hbWUoaGlzdG9yeUl0ZW1DaGFuZ2Uub3JpZ2luYWxVcmkuZnNQYXRoKX0gKCR7aGlzdG9yeUl0ZW1QYXJlbnREaXNwbGF5SWR9KWA7XG5cdFx0XHRcdGNvbnN0IG1vZGlmaWVkVXJpVGl0bGUgPSBgJHtiYXNlbmFtZShoaXN0b3J5SXRlbUNoYW5nZS5tb2RpZmllZFVyaS5mc1BhdGgpfSAoJHtoaXN0b3J5SXRlbURpc3BsYXlJZH0pYDtcblxuXHRcdFx0XHRjb25zdCB0aXRsZSA9IGAke29yaWdpbmFsVXJpVGl0bGV9IFxcdTIxOTQgJHttb2RpZmllZFVyaVRpdGxlfWA7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0bGFiZWw6IHRpdGxlLFxuXHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBoaXN0b3J5SXRlbUNoYW5nZS5vcmlnaW5hbFVyaSB9LFxuXHRcdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBoaXN0b3J5SXRlbUNoYW5nZS5tb2RpZmllZFVyaSB9LFxuXHRcdFx0XHRcdG9wdGlvbnM6IGUuZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaGlzdG9yeUl0ZW1DaGFuZ2UubW9kaWZpZWRVcmkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRsYWJlbDogYCR7YmFzZW5hbWUoaGlzdG9yeUl0ZW1DaGFuZ2UubW9kaWZpZWRVcmkuZnNQYXRoKX0gKCR7aGlzdG9yeUl0ZW1EaXNwbGF5SWR9KWAsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IGhpc3RvcnlJdGVtQ2hhbmdlLm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IGUuZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaGlzdG9yeUl0ZW1DaGFuZ2Uub3JpZ2luYWxVcmkpIHtcblx0XHRcdFx0Ly8gRWRpdG9yIChEZWxldGVkKVxuXHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdGxhYmVsOiBgJHtiYXNlbmFtZShoaXN0b3J5SXRlbUNoYW5nZS5vcmlnaW5hbFVyaS5mc1BhdGgpfSAoJHtoaXN0b3J5SXRlbVBhcmVudERpc3BsYXlJZH0pYCxcblx0XHRcdFx0XHRyZXNvdXJjZTogaGlzdG9yeUl0ZW1DaGFuZ2Uub3JpZ2luYWxVcmksXG5cdFx0XHRcdFx0b3B0aW9uczogZS5lZGl0b3JPcHRpb25zXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbUxvYWRNb3JlVHJlZUVsZW1lbnQoZS5lbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcGFnZU9uU2Nyb2xsID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignc2NtLmdyYXBoLnBhZ2VPblNjcm9sbCcpID09PSB0cnVlO1xuXHRcdFx0aWYgKCFwYWdlT25TY3JvbGwpIHtcblx0XHRcdFx0dGhpcy5fbG9hZE1vcmUoKTtcblx0XHRcdFx0dGhpcy5fdHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uQ29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PFRyZWVFbGVtZW50IHwgbnVsbD4pOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXG5cdFx0aWYgKGlzU0NNSGlzdG9yeUl0ZW1WaWV3TW9kZWxUcmVlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdFx0Ly8gSGlzdG9yeUl0ZW1cblx0XHRcdGlmIChlbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdpbmNvbWluZy1jaGFuZ2VzJyB8fCBlbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmtpbmQgPT09ICdvdXRnb2luZy1jaGFuZ2VzJykge1xuXHRcdFx0XHQvLyBJbmNvbWluZy9PdXRnb2luZyBjaGFuZ2VzIG5vZGUgZG9lcyBub3Qgc3VwcG9ydCBhbnkgY29udGV4dCBtZW51IGFjdGlvbnNcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jb250ZXh0TWVudURpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5UHJvdmlkZXIgPSBlbGVtZW50LnJlcG9zaXRvcnkucHJvdmlkZXIuaGlzdG9yeVByb3ZpZGVyLmdldCgpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW1SZWYgPSBoaXN0b3J5UHJvdmlkZXI/Lmhpc3RvcnlJdGVtUmVmLmdldCgpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeUl0ZW0gPSBlbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZk1lbnVJdGVtcyA9IE1lbnVSZWdpc3RyeS5nZXRNZW51SXRlbXMoTWVudUlkLlNDTUhpc3RvcnlJdGVtUmVmQ29udGV4dCkuZmlsdGVyKGl0ZW0gPT4gaXNJTWVudUl0ZW0oaXRlbSkpO1xuXG5cdFx0XHQvLyBJZiB0aGVyZSBhcmUgYW55IGhpc3RvcnkgaXRlbSByZWZlcmVuY2VzIHdlIGhhdmUgdG8gYWRkIGEgc3VibWVudSBpdGVtIGZvciBlYWNoIG9yaWduYWwgYWN0aW9uLFxuXHRcdFx0Ly8gYW5kIGEgbWVudSBpdGVtIGZvciBlYWNoIGhpc3RvcnkgaXRlbSByZWYgdGhhdCBtYXRjaGVzIHRoZSBgd2hlbmAgY2xhdXNlIG9mIHRoZSBvcmlnaW5hbCBhY3Rpb24uXG5cdFx0XHRpZiAoaGlzdG9yeUl0ZW1SZWZNZW51SXRlbXMubGVuZ3RoID4gMCAmJiBlbGVtZW50Lmhpc3RvcnlJdGVtVmlld01vZGVsLmhpc3RvcnlJdGVtLnJlZmVyZW5jZXM/Lmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBoaXN0b3J5SXRlbVJlZkFjdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSVNDTUhpc3RvcnlJdGVtUmVmW10+KCk7XG5cblx0XHRcdFx0Zm9yIChjb25zdCByZWYgb2YgZWxlbWVudC5oaXN0b3J5SXRlbVZpZXdNb2RlbC5oaXN0b3J5SXRlbS5yZWZlcmVuY2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0XHRcdFx0WydzY21IaXN0b3J5SXRlbVJlZicsIHJlZi5pZF1cblx0XHRcdFx0XHRdKTtcblxuXHRcdFx0XHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gdGhpcy5fbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoXG5cdFx0XHRcdFx0XHRNZW51SWQuU0NNSGlzdG9yeUl0ZW1SZWZDb250ZXh0LCBjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBtZW51QWN0aW9ucy5mbGF0TWFwKGEgPT4gYVsxXSkpIHtcblx0XHRcdFx0XHRcdGlmICghaGlzdG9yeUl0ZW1SZWZBY3Rpb25zLmhhcyhhY3Rpb24uaWQpKSB7XG5cdFx0XHRcdFx0XHRcdGhpc3RvcnlJdGVtUmVmQWN0aW9ucy5zZXQoYWN0aW9uLmlkLCBbXSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGhpc3RvcnlJdGVtUmVmQWN0aW9ucy5nZXQoYWN0aW9uLmlkKSEucHVzaChyZWYpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlZ2lzdGVyIHN1Ym1lbnUsIG1lbnUgaXRlbXNcblx0XHRcdFx0Zm9yIChjb25zdCBoaXN0b3J5SXRlbVJlZk1lbnVJdGVtIG9mIGhpc3RvcnlJdGVtUmVmTWVudUl0ZW1zKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uSWQgPSBoaXN0b3J5SXRlbVJlZk1lbnVJdGVtLmNvbW1hbmQuaWQ7XG5cblx0XHRcdFx0XHRpZiAoIWhpc3RvcnlJdGVtUmVmQWN0aW9ucy5oYXMoYWN0aW9uSWQpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSZWdpc3RlciB0aGUgc3VibWVudSBmb3IgdGhlIG9yaWdpbmFsIGFjdGlvblxuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRNZW51RGlzcG9zYWJsZXMudmFsdWUuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuU0NNSGlzdG9yeUl0ZW1Db250ZXh0LCB7XG5cdFx0XHRcdFx0XHR0aXRsZTogaGlzdG9yeUl0ZW1SZWZNZW51SXRlbS5jb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRcdFx0c3VibWVudTogTWVudUlkLmZvcihhY3Rpb25JZCksXG5cdFx0XHRcdFx0XHRncm91cDogaGlzdG9yeUl0ZW1SZWZNZW51SXRlbT8uZ3JvdXAsXG5cdFx0XHRcdFx0XHRvcmRlcjogaGlzdG9yeUl0ZW1SZWZNZW51SXRlbT8ub3JkZXJcblx0XHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0XHQvLyBSZWdpc3RlciB0aGUgYWN0aW9uIGZvciB0aGUgaGlzdG9yeSBpdGVtIHJlZlxuXHRcdFx0XHRcdGZvciAoY29uc3QgaGlzdG9yeUl0ZW1SZWYgb2YgaGlzdG9yeUl0ZW1SZWZBY3Rpb25zLmdldChhY3Rpb25JZCkgPz8gW10pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbnRleHRNZW51RGlzcG9zYWJsZXMudmFsdWUuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZDogYCR7YWN0aW9uSWR9LiR7aGlzdG9yeUl0ZW1SZWYuaWR9YCxcblx0XHRcdFx0XHRcdFx0XHRcdHRpdGxlOiBoaXN0b3J5SXRlbVJlZi5uYW1lLFxuXHRcdFx0XHRcdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLmZvcihhY3Rpb25JZCksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGdyb3VwOiBoaXN0b3J5SXRlbVJlZi5jYXRlZ29yeVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhY3Rpb25JZCwgLi4uYXJncywgaGlzdG9yeUl0ZW1SZWYuaWQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KFtcblx0XHRcdFx0WydzY21IaXN0b3J5SXRlbUhhc0N1cnJlbnRIaXN0b3J5SXRlbVJlZicsIGhpc3RvcnlJdGVtLnJlZmVyZW5jZXM/LmZpbmQocmVmID0+IHJlZi5pZCA9PT0gaGlzdG9yeUl0ZW1SZWY/LmlkKSAhPT0gdW5kZWZpbmVkXVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gdGhpcy5fbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoXG5cdFx0XHRcdE1lbnVJZC5TQ01IaXN0b3J5SXRlbUNvbnRleHQsXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlLCB7XG5cdFx0XHRcdGFyZzogZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyLFxuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0fSkuZmlsdGVyKGdyb3VwID0+IGdyb3VwWzBdICE9PSAnaW5saW5lJyk7XG5cblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnVBY3Rpb25zKSxcblx0XHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW1cblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbUNoYW5nZVZpZXdNb2RlbFRyZWVFbGVtZW50KGVsZW1lbnQpKSB7XG5cdFx0XHQvLyBIaXN0b3J5SXRlbUNoYW5nZVxuXHRcdFx0Y29uc3QgbWVudUFjdGlvbnMgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhcblx0XHRcdFx0TWVudUlkLlNDTUhpc3RvcnlJdGVtQ2hhbmdlQ29udGV4dCxcblx0XHRcdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSwge1xuXHRcdFx0XHRhcmc6IGVsZW1lbnQuaGlzdG9yeUl0ZW1WaWV3TW9kZWwuaGlzdG9yeUl0ZW0sXG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9KS5maWx0ZXIoZ3JvdXAgPT4gZ3JvdXBbMF0gIT09ICdpbmxpbmUnKTtcblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudUFjdGlvbnMpLFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gZWxlbWVudC5oaXN0b3J5SXRlbUNoYW5nZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZE1vcmUoY3Vyc29yPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWVMb2FkTW9yZVNlcXVlbmNlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcmVwb3NpdG9yeUlzTG9hZGluZ01vcmUuZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZXBvc2l0b3J5SXNMb2FkaW5nTW9yZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3RyZWVWaWV3TW9kZWwubG9hZE1vcmUoY3Vyc29yKTtcblxuXHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlQ2hpbGRyZW4oKTtcblx0XHRcdHRoaXMuX3JlcG9zaXRvcnlJc0xvYWRpbmdNb3JlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNoaWxkcmVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl91cGRhdGVDaGlsZHJlblRocm90dGxlci5xdWV1ZShcblx0XHRcdCgpID0+IHRoaXMuX3RyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IHRoaXMuaWQsIGRlbGF5OiAxMDAgfSxcblx0XHRcdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fdHJlZS51cGRhdGVDaGlsZHJlbih1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gZGlmZklkZW50aXR5UHJvdmlkZXI6IHRoaXMuX3RyZWVJZGVudGl0eVByb3ZpZGVyXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUluZGVudFN0eWxlcyh0aGVtZTogSUZpbGVJY29uVGhlbWUsIHZpZXdNb2RlOiBWaWV3TW9kZSk6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbGlzdC12aWV3LW1vZGUnLCB2aWV3TW9kZSA9PT0gVmlld01vZGUuTGlzdCk7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd0cmVlLXZpZXctbW9kZScsIHZpZXdNb2RlID09PSBWaWV3TW9kZS5UcmVlKTtcblx0XHR0aGlzLl90cmVlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FsaWduLWljb25zLWFuZC10d2lzdGllcycsICh2aWV3TW9kZSA9PT0gVmlld01vZGUuTGlzdCAmJiB0aGVtZS5oYXNGaWxlSWNvbnMpIHx8ICh0aGVtZS5oYXNGaWxlSWNvbnMgJiYgIXRoZW1lLmhhc0ZvbGRlckljb25zKSk7XG5cdFx0dGhpcy5fdHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlLWFycm93cycsIHZpZXdNb2RlID09PSBWaWV3TW9kZS5UcmVlICYmIHRoZW1lLmhpZGVzRXhwbG9yZXJBcnJvd3MgPT09IHRydWUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZXh0TWVudURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl92aXNpYmlsaXR5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLFFBQVEsR0FBRyxhQUFhO0FBQ3BDLFNBQVMsa0JBQWdFO0FBQ3pFLFNBQVMsaUJBQWlCO0FBSTFCLFNBQVMscUJBQXlDO0FBQ2xELFNBQVMsb0JBQW9CLFlBQVksaUJBQThCLHlCQUF5QjtBQUNoRyxTQUFTLFNBQVMsU0FBc0IsaUJBQWlCLGNBQWMsaUJBQWlCLG9CQUFvQixxQkFBcUIsYUFBYSx3QkFBNkM7QUFDM0wsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBNkIsMEJBQTBCO0FBQ2hFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQXFCLDBDQUEwQztBQUMvRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWdDLGtCQUFrQjtBQUMzRCxTQUF5QixxQkFBcUI7QUFDOUMsU0FBMkIsWUFBWSxVQUFVLDJCQUEyQjtBQUM1RSxTQUFTLHdCQUF3Qiw2QkFBNkI7QUFDOUQsU0FBUywyQkFBMkIsaUNBQWlDLGdCQUFnQixrQ0FBa0MsaUNBQWlDLHdDQUF3QyxxQkFBcUIsaUNBQWlDO0FBQ3RQLFNBQVMsMkJBQTJCLGdCQUFnQiw0QkFBNEIsNENBQTRDLHFDQUFxQyxzQ0FBc0Ms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QkFBNkIsYUFBYSxTQUFTLFFBQVEsTUFBTSxnQkFBa0IsTUFBTSxnQkFBZ0IsQ0FBQyxNQUFNLGNBQWU7QUFDcEssU0FBSyxlQUFlLFVBQVUsT0FBTyxlQUFlLGFBQWEsU0FBUyxRQUFRLE1BQU0sd0JBQXdCLElBQUk7QUFBQSxFQUNySDtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyx3QkFBd0IsUUFBUTtBQUNyQyxTQUFLLHVCQUF1QixRQUFRO0FBQ3BDLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQTVtQmEscUJBQU47QUFBQSxFQTRCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXpDVTsiLAogICJuYW1lcyI6IFsia2V5IiwgImhpc3RvcnlJdGVtUmVmcyIsICJpdGVtcyIsICJyZWFkZXIiLCAiY29udGV4dEtleVNlcnZpY2UiLCAibWVudUFjdGlvbnMiLCAiaGlzdG9yeUl0ZW1SZWYiXQp9Cg==
