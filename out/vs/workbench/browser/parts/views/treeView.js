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
import { DataTransfers } from "../../../../base/browser/dnd.js";
import * as DOM from "../../../../base/browser/dom.js";
import * as cssJs from "../../../../base/browser/cssValue.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { TreeDragOverBubble } from "../../../../base/browser/ui/tree/tree.js";
import { CollapseAllAction } from "../../../../base/browser/ui/tree/treeDefaults.js";
import { ActionRunner, Separator } from "../../../../base/common/actions.js";
import { timeout } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { createMatches } from "../../../../base/common/filters.js";
import { isMarkdownString, MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../base/common/mime.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import "./media/views.css";
import { VSDataTransfer } from "../../../../base/common/dataTransfer.js";
import { localize } from "../../../../nls.js";
import { createActionViewItem, getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { FileThemeIcon, FolderThemeIcon, IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { fillEditorsDragData } from "../../dnd.js";
import { ResourceLabels } from "../../labels.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from "../editor/editorCommands.js";
import { getLocationBasedViewColors, ViewPane } from "./viewPane.js";
import { Extensions, IViewDescriptorService, ResolvableTreeItem, TreeItemCollapsibleState } from "../../../common/views.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { CodeDataTransfers, LocalSelectionTransfer } from "../../../../platform/dnd/browser/dnd.js";
import { toExternalVSDataTransfer } from "../../../../editor/browser/dataTransfer.js";
import { CheckboxStateHandler, TreeItemCheckbox } from "./checkbox.js";
import { setTimeout0 } from "../../../../base/common/platform.js";
import { TelemetryTrustedValue } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { ITreeViewsDnDService } from "../../../../editor/common/services/treeViewsDndService.js";
import { DraggedTreeItemsIdentifier } from "../../../../editor/common/services/treeViewsDnd.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { parseLinkedText } from "../../../../base/common/linkedText.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IAccessibleViewInformationService } from "../../../services/accessibility/common/accessibleViewInformationService.js";
let TreeViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, notificationService, hoverService, accessibleViewService) {
    super({ ...options, titleMenuId: MenuId.ViewTitle, donotForwardArgs: false }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, accessibleViewService);
    const { treeView } = Registry.as(Extensions.ViewsRegistry).getView(options.id);
    this.treeView = treeView;
    this._register(this.treeView.onDidChangeActions(() => this.updateActions(), this));
    this._register(this.treeView.onDidChangeTitle((newTitle) => this.updateTitle(newTitle)));
    this._register(this.treeView.onDidChangeDescription((newDescription) => this.updateTitleDescription(newDescription)));
    this._register(toDisposable(() => {
      if (this._container && this.treeView.container && this._container === this.treeView.container) {
        this.treeView.setVisibility(false);
      }
    }));
    this._register(this.onDidChangeBodyVisibility(() => this.updateTreeVisibility()));
    this._register(this.treeView.onDidChangeWelcomeState(() => this._onDidChangeViewWelcomeState.fire()));
    if (options.title !== this.treeView.title) {
      this.updateTitle(this.treeView.title);
    }
    if (options.titleDescription !== this.treeView.description) {
      this.updateTitleDescription(this.treeView.description);
    }
    this._actionRunner = this._register(new MultipleSelectionActionRunner(notificationService, () => this.treeView.getSelection()));
    this.updateTreeVisibility();
  }
  focus() {
    super.focus();
    this.treeView.focus();
  }
  renderBody(container) {
    this._container = container;
    super.renderBody(container);
    this.renderTreeView(container);
  }
  shouldShowWelcome() {
    return (this.treeView.dataProvider === void 0 || !!this.treeView.dataProvider.isTreeEmpty) && (this.treeView.message === void 0 || this.treeView.message === "");
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.layoutTreeView(height, width);
  }
  getOptimalWidth() {
    return this.treeView.getOptimalWidth();
  }
  renderTreeView(container) {
    this.treeView.show(container);
  }
  layoutTreeView(height, width) {
    this.treeView.layout(height, width);
  }
  updateTreeVisibility() {
    this.treeView.setVisibility(this.isBodyVisible());
  }
  getActionRunner() {
    return this._actionRunner;
  }
  getActionsContext() {
    return { $treeViewId: this.id, $focusedTreeItem: true, $selectedTreeItems: true };
  }
};
TreeViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IAccessibleViewInformationService)
], TreeViewPane);
class Root {
  constructor() {
    this.label = { label: "root" };
    this.handle = "0";
    this.parentHandle = void 0;
    this.collapsibleState = TreeItemCollapsibleState.Expanded;
    this.children = void 0;
  }
}
function commandPreconditions(commandId) {
  const command = CommandsRegistry.getCommand(commandId);
  if (command) {
    const commandAction = MenuRegistry.getCommand(command.id);
    return commandAction?.precondition;
  }
  return void 0;
}
function isTreeCommandEnabled(treeCommand, contextKeyService) {
  const commandId = treeCommand.originalId ? treeCommand.originalId : treeCommand.id;
  const precondition = commandPreconditions(commandId);
  if (precondition) {
    return contextKeyService.contextMatchesRules(precondition);
  }
  return true;
}
function isRenderedMessageValue(messageValue) {
  return !!messageValue && typeof messageValue !== "string" && !!messageValue.element && !!messageValue.disposables;
}
const noDataProviderMessage = localize("no-dataprovider", "There is no data provider registered that can provide view data.");
const RawCustomTreeViewContextKey = new RawContextKey("customTreeView", false);
class Tree extends WorkbenchAsyncDataTree {
}
let AbstractTreeView = class extends Disposable {
  constructor(id, _title, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, hoverService, contextKeyService, activityService, logService, openerService, markdownRendererService) {
    super();
    this.id = id;
    this._title = _title;
    this.themeService = themeService;
    this.instantiationService = instantiationService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.progressService = progressService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.notificationService = notificationService;
    this.viewDescriptorService = viewDescriptorService;
    this.hoverService = hoverService;
    this.contextKeyService = contextKeyService;
    this.activityService = activityService;
    this.logService = logService;
    this.openerService = openerService;
    this.markdownRendererService = markdownRendererService;
    this.isVisible = false;
    this._hasIconForParentNode = false;
    this._hasIconForLeafNode = false;
    this.focused = false;
    this._canSelectMany = false;
    this._manuallyManageCheckboxes = false;
    this.elementsToRefresh = [];
    this.lastSelection = [];
    this._onDidExpandItem = this._register(new Emitter());
    this._onDidCollapseItem = this._register(new Emitter());
    this._onDidChangeSelectionAndFocus = this._register(new Emitter());
    this._onDidChangeVisibility = this._register(new Emitter());
    this._onDidChangeActions = this._register(new Emitter());
    this._onDidChangeWelcomeState = this._register(new Emitter());
    this._onDidChangeTitle = this._register(new Emitter());
    this._onDidChangeDescription = this._register(new Emitter());
    this._onDidChangeCheckboxState = this._register(new Emitter());
    this._onDidCompleteRefresh = this._register(new Emitter());
    this._isInitialized = false;
    this._activity = this._register(new MutableDisposable());
    this.activated = false;
    this.treeDisposables = this._register(new DisposableStore());
    this._height = 0;
    this._width = 0;
    this.refreshing = false;
    this.root = new Root();
    this.lastActive = this.root;
  }
  get onDidExpandItem() {
    return this._onDidExpandItem.event;
  }
  get onDidCollapseItem() {
    return this._onDidCollapseItem.event;
  }
  get onDidChangeSelectionAndFocus() {
    return this._onDidChangeSelectionAndFocus.event;
  }
  get onDidChangeVisibility() {
    return this._onDidChangeVisibility.event;
  }
  get onDidChangeActions() {
    return this._onDidChangeActions.event;
  }
  get onDidChangeWelcomeState() {
    return this._onDidChangeWelcomeState.event;
  }
  get onDidChangeTitle() {
    return this._onDidChangeTitle.event;
  }
  get onDidChangeDescription() {
    return this._onDidChangeDescription.event;
  }
  get onDidChangeCheckboxState() {
    return this._onDidChangeCheckboxState.event;
  }
  initialize() {
    if (this._isInitialized) {
      return;
    }
    this._isInitialized = true;
    this.contextKeyService.bufferChangeEvents(() => {
      this.initializeShowCollapseAllAction();
      this.initializeCollapseAllToggle();
      this.initializeShowRefreshAction();
    });
    this.treeViewDnd = this.instantiationService.createInstance(CustomTreeViewDragAndDrop, this.id);
    if (this._dragAndDropController) {
      this.treeViewDnd.controller = this._dragAndDropController;
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("explorer.decorations")) {
        this.doRefresh([this.root]);
      }
    }));
    this._register(this.viewDescriptorService.onDidChangeLocation(({ views, from, to }) => {
      if (views.some((v) => v.id === this.id)) {
        this.tree?.updateOptions({ overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles });
      }
    }));
    this.registerActions();
    this.create();
  }
  get viewContainer() {
    return this.viewDescriptorService.getViewContainerByViewId(this.id);
  }
  get viewLocation() {
    return this.viewDescriptorService.getViewLocationById(this.id);
  }
  get dragAndDropController() {
    return this._dragAndDropController;
  }
  set dragAndDropController(dnd) {
    this._dragAndDropController = dnd;
    if (this.treeViewDnd) {
      this.treeViewDnd.controller = dnd;
    }
  }
  get dataProvider() {
    return this._dataProvider;
  }
  set dataProvider(dataProvider) {
    if (dataProvider) {
      if (this.visible) {
        this.activate();
      }
      const self = this;
      this._dataProvider = new class {
        constructor() {
          this._isEmpty = true;
          this._onDidChangeEmpty = new Emitter();
          this.onDidChangeEmpty = this._onDidChangeEmpty.event;
        }
        get isTreeEmpty() {
          return this._isEmpty;
        }
        async getChildren(element) {
          const batches = await this.getChildrenBatch(element ? [element] : void 0);
          return batches?.[0];
        }
        updateEmptyState(nodes, childrenGroups) {
          if (nodes.length === 1 && nodes[0] instanceof Root) {
            const oldEmpty = this._isEmpty;
            this._isEmpty = childrenGroups.length === 0 || childrenGroups[0].length === 0;
            if (oldEmpty !== this._isEmpty) {
              this._onDidChangeEmpty.fire();
            }
          }
        }
        findCheckboxesUpdated(nodes, childrenGroups) {
          if (childrenGroups.length === 0) {
            return [];
          }
          const checkboxesUpdated = [];
          for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const children = childrenGroups[i];
            for (const child of children) {
              child.parent = node;
              if (!self.manuallyManageCheckboxes && node?.checkbox?.isChecked === true && child.checkbox?.isChecked === false) {
                child.checkbox.isChecked = true;
                checkboxesUpdated.push(child);
              }
            }
          }
          return checkboxesUpdated;
        }
        async getChildrenBatch(nodes) {
          let childrenGroups;
          let checkboxesUpdated = [];
          if (nodes?.every((node) => !!node.children)) {
            childrenGroups = nodes.map((node) => node.children);
          } else {
            nodes = nodes ?? [self.root];
            const batchedChildren = await (nodes.length === 1 && nodes[0] instanceof Root ? doGetChildrenOrBatch(dataProvider, void 0) : doGetChildrenOrBatch(dataProvider, nodes));
            for (let i = 0; i < nodes.length; i++) {
              const node = nodes[i];
              node.children = batchedChildren ? batchedChildren[i] : void 0;
            }
            childrenGroups = batchedChildren ?? [];
            checkboxesUpdated = this.findCheckboxesUpdated(nodes, childrenGroups);
          }
          this.updateEmptyState(nodes, childrenGroups);
          if (checkboxesUpdated.length > 0) {
            self._onDidChangeCheckboxState.fire(checkboxesUpdated);
          }
          return childrenGroups;
        }
      }();
      if (this._dataProvider.onDidChangeEmpty) {
        this._register(this._dataProvider.onDidChangeEmpty(() => {
          this.updateCollapseAllToggle();
          this._onDidChangeWelcomeState.fire();
        }));
      }
      this.updateMessage();
      this.refresh();
    } else {
      this._dataProvider = void 0;
      this.treeDisposables.clear();
      this.activated = false;
      this.updateMessage();
    }
    this._onDidChangeWelcomeState.fire();
  }
  get message() {
    return this._message;
  }
  set message(message) {
    this._message = message;
    this.updateMessage();
    this._onDidChangeWelcomeState.fire();
  }
  get title() {
    return this._title;
  }
  set title(name) {
    this._title = name;
    if (this.tree) {
      this.tree.ariaLabel = this._title;
    }
    this._onDidChangeTitle.fire(this._title);
  }
  get description() {
    return this._description;
  }
  set description(description) {
    this._description = description;
    this._onDidChangeDescription.fire(this._description);
  }
  get badge() {
    return this._badge;
  }
  set badge(badge) {
    if (this._badge?.value === badge?.value && this._badge?.tooltip === badge?.tooltip) {
      return;
    }
    this._badge = badge;
    if (badge) {
      const activity = {
        badge: new NumberBadge(badge.value, () => badge.tooltip),
        priority: 50
      };
      this._activity.value = this.activityService.showViewActivity(this.id, activity);
    } else {
      this._activity.clear();
    }
  }
  get canSelectMany() {
    return this._canSelectMany;
  }
  set canSelectMany(canSelectMany) {
    const oldCanSelectMany = this._canSelectMany;
    this._canSelectMany = canSelectMany;
    if (this._canSelectMany !== oldCanSelectMany) {
      this.tree?.updateOptions({ multipleSelectionSupport: this.canSelectMany });
    }
  }
  get manuallyManageCheckboxes() {
    return this._manuallyManageCheckboxes;
  }
  set manuallyManageCheckboxes(manuallyManageCheckboxes) {
    this._manuallyManageCheckboxes = manuallyManageCheckboxes;
  }
  get hasIconForParentNode() {
    return this._hasIconForParentNode;
  }
  get hasIconForLeafNode() {
    return this._hasIconForLeafNode;
  }
  get visible() {
    return this.isVisible;
  }
  initializeShowCollapseAllAction(startingValue = false) {
    if (!this.collapseAllContext) {
      this.collapseAllContextKey = new RawContextKey(`treeView.${this.id}.enableCollapseAll`, startingValue, localize("treeView.enableCollapseAll", "Whether the tree view with id {0} enables collapse all.", this.id));
      this.collapseAllContext = this.collapseAllContextKey.bindTo(this.contextKeyService);
    }
    return true;
  }
  get showCollapseAllAction() {
    this.initializeShowCollapseAllAction();
    return !!this.collapseAllContext?.get();
  }
  set showCollapseAllAction(showCollapseAllAction) {
    this.initializeShowCollapseAllAction(showCollapseAllAction);
    this.collapseAllContext?.set(showCollapseAllAction);
  }
  initializeShowRefreshAction(startingValue = false) {
    if (!this.refreshContext) {
      this.refreshContextKey = new RawContextKey(`treeView.${this.id}.enableRefresh`, startingValue, localize("treeView.enableRefresh", "Whether the tree view with id {0} enables refresh.", this.id));
      this.refreshContext = this.refreshContextKey.bindTo(this.contextKeyService);
    }
  }
  get showRefreshAction() {
    this.initializeShowRefreshAction();
    return !!this.refreshContext?.get();
  }
  set showRefreshAction(showRefreshAction) {
    this.initializeShowRefreshAction(showRefreshAction);
    this.refreshContext?.set(showRefreshAction);
  }
  registerActions() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.treeView.${that.id}.refresh`,
          title: localize("refresh", "Refresh"),
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", that.id), that.refreshContextKey),
            group: "navigation",
            order: Number.MAX_SAFE_INTEGER - 1
          },
          icon: Codicon.refresh
        });
      }
      async run() {
        return that.refresh();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.actions.treeView.${that.id}.collapseAll`,
          title: localize("collapseAll", "Collapse All"),
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", that.id), that.collapseAllContextKey),
            group: "navigation",
            order: Number.MAX_SAFE_INTEGER
          },
          precondition: that.collapseAllToggleContextKey,
          icon: Codicon.collapseAll
        });
      }
      async run() {
        if (that.tree) {
          return new CollapseAllAction(that.tree, true).run();
        }
      }
    }));
  }
  setVisibility(isVisible) {
    this.initialize();
    isVisible = !!isVisible;
    if (this.isVisible === isVisible) {
      return;
    }
    this.isVisible = isVisible;
    if (this.tree) {
      if (this.isVisible) {
        DOM.show(this.tree.getHTMLElement());
      } else {
        DOM.hide(this.tree.getHTMLElement());
      }
      if (this.isVisible && this.elementsToRefresh.length && this.dataProvider) {
        this.doRefresh(this.elementsToRefresh);
        this.elementsToRefresh = [];
      }
    }
    setTimeout0(() => {
      if (this.dataProvider) {
        this._onDidChangeVisibility.fire(this.isVisible);
      }
    });
    if (this.visible) {
      this.activate();
    }
  }
  focus(reveal = true, revealItem) {
    if (this.tree && this.root.children && this.root.children.length > 0) {
      const element = revealItem ?? this.tree.getSelection()[0];
      if (element && reveal) {
        this.tree.reveal(element, 0.5);
      }
      this.tree.domFocus();
    } else if (this.tree && this.treeContainer && !this.treeContainer.classList.contains("hide")) {
      this.tree.domFocus();
    } else {
      this.domNode.focus();
    }
  }
  show(container) {
    this._container = container;
    DOM.append(container, this.domNode);
  }
  create() {
    this.domNode = DOM.$(".tree-explorer-viewlet-tree-view");
    this.messageElement = DOM.append(this.domNode, DOM.$(".message"));
    this.updateMessage();
    this.treeContainer = DOM.append(this.domNode, DOM.$(".customview-tree"));
    this.treeContainer.classList.add("file-icon-themable-tree", "show-file-icons");
    const focusTracker = this._register(DOM.trackFocus(this.domNode));
    this._register(focusTracker.onDidFocus(() => this.focused = true));
    this._register(focusTracker.onDidBlur(() => this.focused = false));
  }
  createTree() {
    this.treeDisposables.clear();
    const actionViewItemProvider = createActionViewItem.bind(void 0, this.instantiationService);
    const treeMenus = this.treeDisposables.add(this.instantiationService.createInstance(TreeMenus, this.id));
    this.treeLabels = this.treeDisposables.add(this.instantiationService.createInstance(ResourceLabels, this));
    const dataSource = this.instantiationService.createInstance(TreeDataSource, this, (task) => this.progressService.withProgress({ location: this.id }, () => task));
    const aligner = this.treeDisposables.add(new Aligner(this.themeService, this.logService));
    const checkboxStateHandler = this.treeDisposables.add(new CheckboxStateHandler());
    const renderer = this.treeDisposables.add(this.instantiationService.createInstance(TreeRenderer, this.id, treeMenus, this.treeLabels, actionViewItemProvider, aligner, checkboxStateHandler, () => this.manuallyManageCheckboxes));
    this.treeDisposables.add(renderer.onDidChangeCheckboxState((e) => this._onDidChangeCheckboxState.fire(e)));
    const widgetAriaLabel = this._title;
    this.tree = this.treeDisposables.add(this.instantiationService.createInstance(
      Tree,
      this.id,
      this.treeContainer,
      new TreeViewDelegate(),
      [renderer],
      dataSource,
      {
        identityProvider: new TreeViewIdentityProvider(),
        accessibilityProvider: {
          getAriaLabel(element) {
            if (element.accessibilityInformation) {
              return element.accessibilityInformation.label;
            }
            if (isString(element.tooltip)) {
              return treeMenus.getResourceActions([element]).length > 0 ? localize("treeAriaLabelHasActionsTooltip", "{0}, has actions", element.tooltip) : element.tooltip;
            } else {
              if (element.resourceUri && !element.label) {
                return null;
              }
              let buildAriaLabel = "";
              if (element.label) {
                const labelText = isMarkdownString(element.label.label) ? element.label.label.value : element.label.label;
                buildAriaLabel += labelText + " ";
              }
              if (element.description) {
                buildAriaLabel += element.description;
              }
              if (treeMenus.getResourceActions([element]).length > 0) {
                buildAriaLabel = buildAriaLabel ? localize("treeAriaLabelHasActionsSuffix", "{0}, has actions", buildAriaLabel.trim()) : localize("treeAriaLabelHasActions", "has actions");
              }
              return buildAriaLabel;
            }
          },
          getRole(element) {
            return element.accessibilityInformation?.role ?? "treeitem";
          },
          getWidgetAriaLabel() {
            return widgetAriaLabel;
          }
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (item) => {
            if (item.label) {
              return isMarkdownString(item.label.label) ? item.label.label.value : item.label.label;
            }
            return item.resourceUri ? basename(URI.revive(item.resourceUri)) : void 0;
          }
        },
        expandOnlyOnTwistieClick: (e) => {
          return !!e.command || !!e.checkbox || this.configurationService.getValue("workbench.tree.expandMode") === "doubleClick";
        },
        collapseByDefault: (e) => {
          return e.collapsibleState !== TreeItemCollapsibleState.Expanded;
        },
        multipleSelectionSupport: this.canSelectMany,
        dnd: this.treeViewDnd,
        overrideStyles: getLocationBasedViewColors(this.viewLocation).listOverrideStyles
      }
    ));
    this.treeDisposables.add(renderer.onDidChangeMenuContext((e) => e.forEach((e2) => this.tree?.rerender(e2))));
    this.treeDisposables.add(this.tree);
    treeMenus.setContextKeyService(this.tree.contextKeyService);
    aligner.tree = this.tree;
    const actionRunner = this.treeDisposables.add(new MultipleSelectionActionRunner(this.notificationService, () => this.tree.getSelection()));
    renderer.actionRunner = actionRunner;
    this.tree.contextKeyService.createKey(this.id, true);
    const customTreeKey = RawCustomTreeViewContextKey.bindTo(this.tree.contextKeyService);
    customTreeKey.set(true);
    this.treeDisposables.add(this.tree.onContextMenu((e) => this.onContextMenu(treeMenus, e, actionRunner)));
    this.treeDisposables.add(this.tree.onDidChangeSelection((e) => {
      this.lastSelection = e.elements;
      this.lastActive = this.tree?.getFocus()[0] ?? this.lastActive;
      this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
    }));
    this.treeDisposables.add(this.tree.onDidChangeFocus((e) => {
      if (e.elements.length && e.elements[0] !== this.lastActive) {
        this.lastActive = e.elements[0];
        this.lastSelection = this.tree?.getSelection() ?? this.lastSelection;
        this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
      }
    }));
    this.treeDisposables.add(this.tree.onDidChangeCollapseState((e) => {
      if (!e.node.element) {
        return;
      }
      const element = Array.isArray(e.node.element.element) ? e.node.element.element[0] : e.node.element.element;
      if (e.node.collapsed) {
        this._onDidCollapseItem.fire(element);
      } else {
        this._onDidExpandItem.fire(element);
      }
    }));
    this.tree.setInput(this.root).then(() => this.updateContentAreas());
    this.treeDisposables.add(this.tree.onDidOpen(async (e) => {
      if (!e.browserEvent) {
        return;
      }
      if (e.browserEvent.target && e.browserEvent.target.classList.contains(TreeItemCheckbox.checkboxClass)) {
        return;
      }
      const selection = this.tree.getSelection();
      const command = await this.resolveCommand(selection.length === 1 ? selection[0] : void 0);
      if (command && isTreeCommandEnabled(command, this.contextKeyService)) {
        let args = command.arguments || [];
        if (command.id === API_OPEN_EDITOR_COMMAND_ID || command.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
          args = [...args, e];
        }
        try {
          await this.commandService.executeCommand(command.id, ...args);
        } catch (err) {
          this.notificationService.error(err);
        }
      }
    }));
    this.treeDisposables.add(treeMenus.onDidChange((changed) => {
      if (this.tree?.hasNode(changed)) {
        this.tree?.rerender(changed);
      }
    }));
  }
  async resolveCommand(element) {
    let command = element?.command;
    if (element && !command) {
      if (element instanceof ResolvableTreeItem && element.hasResolve) {
        await element.resolve(CancellationToken.None);
        command = element.command;
      }
    }
    return command;
  }
  onContextMenu(treeMenus, treeEvent, actionRunner) {
    this.hoverService.hideHover();
    const node = treeEvent.element;
    if (node === null) {
      return;
    }
    const event = treeEvent.browserEvent;
    event.preventDefault();
    event.stopPropagation();
    this.tree.setFocus([node]);
    let selected = this.canSelectMany ? this.getSelection() : [];
    if (!selected.find((item) => item.handle === node.handle)) {
      selected = [node];
    }
    const actions = treeMenus.getResourceContextActions(selected);
    if (!actions.length) {
      return;
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => treeEvent.anchor,
      getActions: () => actions,
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.tree.domFocus();
        }
      },
      getActionsContext: () => ({ $treeViewId: this.id, $treeItemHandle: node.handle }),
      actionRunner
    });
  }
  updateMessage() {
    if (this._message) {
      this.showMessage(this._message);
    } else if (!this.dataProvider) {
      this.showMessage(noDataProviderMessage);
    } else {
      this.hideMessage();
    }
    this.updateContentAreas();
  }
  processMessage(message, disposables) {
    const lines = message.value.split("\n");
    const result = [];
    let hasFoundButton = false;
    for (const line of lines) {
      const linkedText = parseLinkedText(line);
      if (linkedText.nodes.length === 1 && typeof linkedText.nodes[0] !== "string") {
        const node = linkedText.nodes[0];
        const buttonContainer = document.createElement("div");
        buttonContainer.classList.add("button-container");
        const button = new Button(buttonContainer, { title: node.title, secondary: hasFoundButton, supportIcons: true, ...defaultButtonStyles });
        button.label = node.label;
        button.onDidClick((_) => {
          this.openerService.open(node.href, { allowCommands: true });
        }, null, disposables);
        const href = URI.parse(node.href);
        if (href.scheme === Schemas.command) {
          const preConditions = commandPreconditions(href.path);
          if (preConditions) {
            button.enabled = this.contextKeyService.contextMatchesRules(preConditions);
            disposables.add(this.contextKeyService.onDidChangeContext((e) => {
              if (e.affectsSome(new Set(preConditions.keys()))) {
                button.enabled = this.contextKeyService.contextMatchesRules(preConditions);
              }
            }));
          }
        }
        disposables.add(button);
        hasFoundButton = true;
        result.push(buttonContainer);
      } else {
        hasFoundButton = false;
        const rendered = this.markdownRendererService.render(new MarkdownString(line, { isTrusted: message.isTrusted, supportThemeIcons: message.supportThemeIcons, supportHtml: message.supportHtml }));
        result.push(rendered.element);
        disposables.add(rendered);
      }
    }
    const container = document.createElement("div");
    container.classList.add("rendered-message");
    for (const child of result) {
      if (DOM.isHTMLElement(child)) {
        container.appendChild(child);
      } else {
        container.appendChild(child.element);
      }
    }
    return container;
  }
  showMessage(message) {
    if (isRenderedMessageValue(this._messageValue)) {
      this._messageValue.disposables.dispose();
    }
    if (isMarkdownString(message)) {
      const disposables = new DisposableStore();
      const renderedMessage = this.processMessage(message, disposables);
      this._messageValue = { element: renderedMessage, disposables };
    } else {
      this._messageValue = message;
    }
    if (!this.messageElement) {
      return;
    }
    this.messageElement.classList.remove("hide");
    this.resetMessageElement();
    if (typeof this._messageValue === "string" && !isFalsyOrWhitespace(this._messageValue)) {
      this.messageElement.textContent = this._messageValue;
    } else if (isRenderedMessageValue(this._messageValue)) {
      this.messageElement.appendChild(this._messageValue.element);
    }
    this.layout(this._height, this._width);
  }
  hideMessage() {
    this.resetMessageElement();
    this.messageElement?.classList.add("hide");
    this.layout(this._height, this._width);
  }
  resetMessageElement() {
    if (this.messageElement) {
      DOM.clearNode(this.messageElement);
    }
  }
  layout(height, width) {
    if (height && width && this.messageElement && this.treeContainer) {
      this._height = height;
      this._width = width;
      const treeHeight = height - DOM.getTotalHeight(this.messageElement);
      this.treeContainer.style.height = treeHeight + "px";
      this.tree?.layout(treeHeight, width);
    }
  }
  getOptimalWidth() {
    if (this.tree) {
      const parentNode = this.tree.getHTMLElement();
      const childNodes = [].slice.call(parentNode.querySelectorAll(".outline-item-label > a"));
      return DOM.getLargestChildWidth(parentNode, childNodes);
    }
    return 0;
  }
  updateCheckboxes(elements) {
    return setCascadingCheckboxUpdates(elements);
  }
  async refresh(elements, checkboxes) {
    if (this.dataProvider && this.tree) {
      if (this.refreshing) {
        await Event.toPromise(this._onDidCompleteRefresh.event);
      }
      if (!elements) {
        elements = [this.root];
        this.elementsToRefresh = [];
      }
      for (const element of elements) {
        element.children = void 0;
      }
      if (this.isVisible) {
        const affectedElements = this.updateCheckboxes(checkboxes ?? []);
        return this.doRefresh(elements.concat(affectedElements));
      } else {
        if (this.elementsToRefresh.length) {
          const seen = /* @__PURE__ */ new Set();
          this.elementsToRefresh.forEach((element) => seen.add(element.handle));
          for (const element of elements) {
            if (!seen.has(element.handle)) {
              this.elementsToRefresh.push(element);
            }
          }
        } else {
          this.elementsToRefresh.push(...elements);
        }
      }
    }
    return void 0;
  }
  async expand(itemOrItems) {
    const tree = this.tree;
    if (!tree) {
      return;
    }
    try {
      itemOrItems = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
      for (const element of itemOrItems) {
        await tree.expand(element, false);
      }
    } catch (e) {
    }
  }
  isCollapsed(item) {
    return !!this.tree?.isCollapsed(item);
  }
  setSelection(items) {
    this.tree?.setSelection(items);
  }
  getSelection() {
    return this.tree?.getSelection() ?? [];
  }
  setFocus(item) {
    if (this.tree) {
      if (item) {
        this.focus(true, item);
        this.tree.setFocus([item]);
      } else if (this.tree.getFocus().length === 0) {
        this.tree.setFocus([]);
      }
    }
  }
  async reveal(item) {
    if (this.tree) {
      return this.tree.reveal(item);
    }
  }
  async doRefresh(elements) {
    const tree = this.tree;
    if (tree && this.visible) {
      this.refreshing = true;
      const oldSelection = tree.getSelection();
      try {
        await Promise.all(elements.map((element) => tree.updateChildren(element, true, true)));
      } catch (e) {
        this.logService.error(e);
      }
      const newSelection = tree.getSelection();
      if (oldSelection.length !== newSelection.length || oldSelection.some((value, index) => value.handle !== newSelection[index].handle)) {
        this.lastSelection = newSelection;
        this._onDidChangeSelectionAndFocus.fire({ selection: this.lastSelection, focus: this.lastActive });
      }
      this.refreshing = false;
      this._onDidCompleteRefresh.fire();
      this.updateContentAreas();
      if (this.focused) {
        this.focus(false);
      }
      this.updateCollapseAllToggle();
    }
  }
  initializeCollapseAllToggle() {
    if (!this.collapseAllToggleContext) {
      this.collapseAllToggleContextKey = new RawContextKey(`treeView.${this.id}.toggleCollapseAll`, false, localize("treeView.toggleCollapseAll", "Whether collapse all is toggled for the tree view with id {0}.", this.id));
      this.collapseAllToggleContext = this.collapseAllToggleContextKey.bindTo(this.contextKeyService);
    }
  }
  updateCollapseAllToggle() {
    if (this.showCollapseAllAction) {
      this.initializeCollapseAllToggle();
      this.collapseAllToggleContext?.set(!!this.root.children && this.root.children.length > 0 && this.root.children.some((value) => value.collapsibleState !== TreeItemCollapsibleState.None));
    }
  }
  updateContentAreas() {
    const isTreeEmpty = !this.root.children || this.root.children.length === 0;
    if (this._messageValue && isTreeEmpty && !this.refreshing && this.treeContainer) {
      if (!this.dragAndDropController) {
        this.treeContainer.classList.add("hide");
      }
      this.domNode.setAttribute("tabindex", "0");
    } else if (this.treeContainer) {
      this.treeContainer.classList.remove("hide");
      if (this.domNode === DOM.getActiveElement()) {
        this.focus();
      }
      this.domNode.removeAttribute("tabindex");
    }
  }
  get container() {
    return this._container;
  }
};
AbstractTreeView = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IProgressService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IActivityService),
  __decorateParam(14, ILogService),
  __decorateParam(15, IOpenerService),
  __decorateParam(16, IMarkdownRendererService)
], AbstractTreeView);
class TreeViewIdentityProvider {
  getId(element) {
    return element.handle;
  }
}
class TreeViewDelegate {
  getHeight(element) {
    return TreeRenderer.ITEM_HEIGHT;
  }
  getTemplateId(element) {
    return TreeRenderer.TREE_TEMPLATE_ID;
  }
}
async function doGetChildrenOrBatch(dataProvider, nodes) {
  if (dataProvider.getChildrenBatch) {
    return dataProvider.getChildrenBatch(nodes);
  } else {
    if (nodes) {
      return Promise.all(nodes.map((node) => dataProvider.getChildren(node).then((children) => children ?? [])));
    } else {
      return [await dataProvider.getChildren()].filter((children) => children !== void 0);
    }
  }
}
class TreeDataSource {
  constructor(treeView, withProgress) {
    this.treeView = treeView;
    this.withProgress = withProgress;
  }
  hasChildren(element) {
    return !!this.treeView.dataProvider && element.collapsibleState !== TreeItemCollapsibleState.None;
  }
  async getChildren(element) {
    const dataProvider = this.treeView.dataProvider;
    if (!dataProvider) {
      return [];
    }
    if (this.batch === void 0) {
      this.batch = [element];
      this.batchPromise = void 0;
    } else {
      this.batch.push(element);
    }
    const indexInBatch = this.batch.length - 1;
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        const batch = this.batch;
        this.batch = void 0;
        if (!this.batchPromise) {
          this.batchPromise = this.withProgress(doGetChildrenOrBatch(dataProvider, batch));
        }
        try {
          const result = await this.batchPromise;
          resolve(result && indexInBatch < result.length ? result[indexInBatch] : []);
        } catch (e) {
          if (!e.message.startsWith("Bad progress location:")) {
            reject(e);
          }
        }
      }, 0);
    });
  }
}
let TreeRenderer = class extends Disposable {
  // tree item handle to template data
  constructor(treeViewId, menus, labels, actionViewItemProvider, aligner, checkboxStateHandler, manuallyManageCheckboxes, themeService, configurationService, labelService, contextKeyService, hoverService, instantiationService) {
    super();
    this.treeViewId = treeViewId;
    this.menus = menus;
    this.labels = labels;
    this.actionViewItemProvider = actionViewItemProvider;
    this.aligner = aligner;
    this.checkboxStateHandler = checkboxStateHandler;
    this.manuallyManageCheckboxes = manuallyManageCheckboxes;
    this.themeService = themeService;
    this.configurationService = configurationService;
    this.labelService = labelService;
    this.contextKeyService = contextKeyService;
    this.hoverService = hoverService;
    this._onDidChangeCheckboxState = this._register(new Emitter());
    this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
    this._onDidChangeMenuContext = this._register(new Emitter());
    this.onDidChangeMenuContext = this._onDidChangeMenuContext.event;
    this._hasCheckbox = false;
    this._renderedElements = /* @__PURE__ */ new Map();
    this._hoverDelegate = this._register(instantiationService.createInstance(WorkbenchHoverDelegate, "mouse", void 0, {}));
    this._register(this.themeService.onDidFileIconThemeChange(() => this.rerender()));
    this._register(this.themeService.onDidColorThemeChange(() => this.rerender()));
    this._register(checkboxStateHandler.onDidChangeCheckboxState((items) => {
      this.updateCheckboxes(items);
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => this.onDidChangeContext(e)));
  }
  get templateId() {
    return TreeRenderer.TREE_TEMPLATE_ID;
  }
  set actionRunner(actionRunner) {
    this._actionRunner = actionRunner;
  }
  renderTemplate(container) {
    container.classList.add("custom-view-tree-node-item");
    const checkboxContainer = DOM.append(container, DOM.$(""));
    const resourceLabel = this.labels.create(container, { supportHighlights: true, hoverDelegate: this._hoverDelegate });
    const icon = DOM.prepend(resourceLabel.element, DOM.$(".custom-view-tree-node-item-icon"));
    const actionsContainer = DOM.append(resourceLabel.element, DOM.$(".actions"));
    const actionBar = new ActionBar(actionsContainer, {
      actionViewItemProvider: this.actionViewItemProvider
    });
    return { resourceLabel, icon, checkboxContainer, actionBar, container };
  }
  getHover(label, resource, node) {
    if (!(node instanceof ResolvableTreeItem) || !node.hasResolve) {
      if (resource && !node.tooltip) {
        return void 0;
      } else if (node.tooltip === void 0) {
        if (isMarkdownString(label)) {
          return { markdown: label, markdownNotSupportedFallback: label.value };
        } else {
          return label;
        }
      } else if (!isString(node.tooltip)) {
        return { markdown: node.tooltip, markdownNotSupportedFallback: resource ? void 0 : renderAsPlaintext(node.tooltip) };
      } else if (node.tooltip !== "") {
        return node.tooltip;
      } else {
        return void 0;
      }
    }
    return {
      markdown: typeof node.tooltip === "string" ? node.tooltip : (token) => {
        return new Promise((resolve) => {
          node.resolve(token).then(() => resolve(node.tooltip));
        });
      },
      markdownNotSupportedFallback: resource ? void 0 : label ? isMarkdownString(label) ? label.value : label : ""
      // Passing undefined as the fallback for a resource falls back to the old native hover
    };
  }
  processLabel(label, matches) {
    if (!isMarkdownString(label)) {
      return { label };
    }
    let text = label.value.trim();
    let bold = false;
    let italic = false;
    let strikethrough = false;
    function moveMatches(offset) {
      if (matches) {
        for (const match of matches) {
          match.start -= offset;
          match.end -= offset;
        }
      }
    }
    const syntaxes = [
      { open: "~~", close: "~~", mark: () => {
        strikethrough = true;
      } },
      { open: "**", close: "**", mark: () => {
        bold = true;
      } },
      { open: "*", close: "*", mark: () => {
        italic = true;
      } },
      { open: "_", close: "_", mark: () => {
        italic = true;
      } }
    ];
    function checkSyntaxes() {
      let didChange = false;
      for (const syntax of syntaxes) {
        if (text.startsWith(syntax.open) && text.endsWith(syntax.close)) {
          if (matches?.some((match) => match.start < syntax.open.length || match.end > text.length - syntax.close.length)) {
            return false;
          }
          syntax.mark();
          text = text.substring(syntax.open.length, text.length - syntax.close.length);
          moveMatches(syntax.open.length);
          didChange = true;
        }
      }
      return didChange;
    }
    for (let i = 0; i < 10; i++) {
      if (!checkSyntaxes()) {
        break;
      }
    }
    return {
      label: text,
      bold,
      italic,
      strikethrough,
      supportIcons: label.supportThemeIcons
    };
  }
  renderElement(element, index, templateData) {
    const node = element.element;
    const resource = node.resourceUri ? URI.revive(node.resourceUri) : null;
    const treeItemLabel = node.label ? node.label : resource ? { label: basename(resource) } : void 0;
    const description = isString(node.description) ? node.description : resource && node.description === true ? this.labelService.getUriLabel(dirname(resource), { relative: true }) : void 0;
    const labelStr = treeItemLabel ? isMarkdownString(treeItemLabel.label) ? treeItemLabel.label.value : treeItemLabel.label : void 0;
    const matches = treeItemLabel?.highlights && labelStr ? treeItemLabel.highlights.map(([start, end]) => {
      if (start < 0) {
        start = labelStr.length + start;
      }
      if (end < 0) {
        end = labelStr.length + end;
      }
      if (start >= labelStr.length || end > labelStr.length) {
        return { start: 0, end: 0 };
      }
      if (start > end) {
        const swap = start;
        start = end;
        end = swap;
      }
      return { start, end };
    }) : void 0;
    const { label, bold, italic, strikethrough, supportIcons } = this.processLabel(treeItemLabel?.label, matches);
    const icon = !isDark(this.themeService.getColorTheme().type) ? node.icon : node.iconDark;
    const iconUrl = icon ? URI.revive(icon) : void 0;
    const title = this.getHover(treeItemLabel?.label, resource, node);
    templateData.actionBar.clear();
    templateData.icon.style.color = "";
    let commandEnabled = true;
    if (node.command) {
      commandEnabled = isTreeCommandEnabled(node.command, this.contextKeyService);
    }
    this.renderCheckbox(node, templateData);
    if (resource) {
      const fileDecorations = this.configurationService.getValue("explorer.decorations");
      const labelResource = resource ? resource : URI.parse("missing:_icon_resource");
      templateData.resourceLabel.setResource({ name: label, description, resource: labelResource }, {
        fileKind: this.getFileKind(node),
        title,
        hideIcon: this.shouldHideResourceLabelIcon(iconUrl, node.themeIcon),
        fileDecorations,
        extraClasses: ["custom-view-tree-node-item-resourceLabel"],
        matches: matches ? matches : createMatches(element.filterData),
        bold,
        italic,
        strikethrough,
        disabledCommand: !commandEnabled,
        labelEscapeNewLines: true,
        forceLabel: !!node.label,
        supportIcons
      });
    } else {
      templateData.resourceLabel.setResource({ name: label, description }, {
        title,
        hideIcon: true,
        extraClasses: ["custom-view-tree-node-item-resourceLabel"],
        matches: matches ? matches : createMatches(element.filterData),
        bold,
        italic,
        strikethrough,
        disabledCommand: !commandEnabled,
        labelEscapeNewLines: true,
        supportIcons
      });
    }
    if (iconUrl) {
      templateData.icon.className = "custom-view-tree-node-item-icon";
      templateData.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
    } else {
      let iconClass;
      if (this.shouldShowThemeIcon(!!resource, node.themeIcon)) {
        iconClass = ThemeIcon.asClassName(node.themeIcon);
        if (node.themeIcon.color) {
          templateData.icon.style.color = this.themeService.getColorTheme().getColor(node.themeIcon.color.id)?.toString() ?? "";
        } else {
          iconClass = iconClass + " codicon-colored";
        }
      }
      templateData.icon.className = iconClass ? `custom-view-tree-node-item-icon ${iconClass}` : "";
      templateData.icon.style.backgroundImage = "";
    }
    if (!commandEnabled) {
      templateData.icon.className = templateData.icon.className + " disabled";
      if (templateData.container.parentElement) {
        templateData.container.parentElement.className = templateData.container.parentElement.className + " disabled";
      }
    }
    templateData.actionBar.context = { $treeViewId: this.treeViewId, $treeItemHandle: node.handle };
    const menuActions = this.menus.getResourceActions([node]);
    templateData.actionBar.push(menuActions, { icon: true, label: false });
    if (menuActions.length > 0) {
      const itemName = [label, description].filter((part) => !!part).join(" ").trim();
      templateData.actionBar.setAriaLabel(itemName ? localize("treeActionBarAriaLabel", "Actions for {0}", itemName) : localize("treeActionBarAriaLabelNoName", "Actions"));
    } else {
      templateData.actionBar.setAriaLabel("");
    }
    if (this._actionRunner) {
      templateData.actionBar.actionRunner = this._actionRunner;
    }
    this.setAlignment(templateData.container, node);
    const renderedItems = this._renderedElements.get(element.element.handle) ?? [];
    this._renderedElements.set(element.element.handle, [...renderedItems, { original: element, rendered: templateData }]);
  }
  rerender() {
    const keys = new Set(this._renderedElements.keys());
    for (const key of keys) {
      const values = this._renderedElements.get(key) ?? [];
      for (const value of values) {
        this.disposeElement(value.original, 0, value.rendered);
        this.renderElement(value.original, 0, value.rendered);
      }
    }
  }
  renderCheckbox(node, templateData) {
    if (node.checkbox) {
      if (!this._hasCheckbox) {
        this._hasCheckbox = true;
        this.rerender();
      }
      if (!templateData.checkbox) {
        const checkbox = new TreeItemCheckbox(templateData.checkboxContainer, this.checkboxStateHandler, this._hoverDelegate, this.hoverService);
        templateData.checkbox = checkbox;
      }
      templateData.checkbox.render(node);
    } else if (templateData.checkbox) {
      templateData.checkbox.dispose();
      templateData.checkbox = void 0;
    }
  }
  setAlignment(container, treeItem) {
    container.parentElement.classList.toggle("align-icon-with-twisty", this.aligner.alignIconWithTwisty(treeItem));
  }
  shouldHideResourceLabelIcon(iconUrl, icon) {
    return !!iconUrl || !!icon && !this.isFileKindThemeIcon(icon);
  }
  shouldShowThemeIcon(hasResource, icon) {
    if (!icon) {
      return false;
    }
    return !(hasResource && this.isFileKindThemeIcon(icon));
  }
  isFileKindThemeIcon(icon) {
    return ThemeIcon.isFile(icon) || ThemeIcon.isFolder(icon);
  }
  getFileKind(node) {
    if (node.themeIcon) {
      switch (node.themeIcon.id) {
        case FileThemeIcon.id:
          return FileKind.FILE;
        case FolderThemeIcon.id:
          return FileKind.FOLDER;
      }
    }
    return node.collapsibleState === TreeItemCollapsibleState.Collapsed || node.collapsibleState === TreeItemCollapsibleState.Expanded ? FileKind.FOLDER : FileKind.FILE;
  }
  onDidChangeContext(e) {
    const affectsEntireMenuContexts = e.affectsSome(this.menus.getEntireMenuContexts());
    const items = [];
    for (const [_, elements] of this._renderedElements) {
      for (const element of elements) {
        if (affectsEntireMenuContexts || e.affectsSome(this.menus.getElementOverlayContexts(element.original.element))) {
          items.push(element.original.element);
        }
      }
    }
    if (items.length) {
      this._onDidChangeMenuContext.fire(items);
    }
  }
  updateCheckboxes(items) {
    let allItems = [];
    if (!this.manuallyManageCheckboxes()) {
      allItems = setCascadingCheckboxUpdates(items);
    } else {
      allItems = items;
    }
    allItems.forEach((item) => {
      const renderedItems = this._renderedElements.get(item.handle);
      if (renderedItems) {
        renderedItems.forEach((renderedItems2) => renderedItems2.rendered.checkbox?.render(item));
      }
    });
    this._onDidChangeCheckboxState.fire(allItems);
  }
  disposeElement(resource, index, templateData) {
    const itemRenders = this._renderedElements.get(resource.element.handle) ?? [];
    const renderedIndex = itemRenders.findIndex((renderedItem) => templateData === renderedItem.rendered);
    if (itemRenders.length === 1) {
      this._renderedElements.delete(resource.element.handle);
    } else if (itemRenders.length > 0) {
      itemRenders.splice(renderedIndex, 1);
    }
    templateData.checkbox?.dispose();
    templateData.checkbox = void 0;
  }
  disposeTemplate(templateData) {
    templateData.resourceLabel.dispose();
    templateData.actionBar.dispose();
  }
};
TreeRenderer.ITEM_HEIGHT = 22;
TreeRenderer.TREE_TEMPLATE_ID = "treeExplorer";
TreeRenderer = __decorateClass([
  __decorateParam(7, IThemeService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IInstantiationService)
], TreeRenderer);
class Aligner extends Disposable {
  constructor(themeService, logService) {
    super();
    this.themeService = themeService;
    this.logService = logService;
  }
  set tree(tree) {
    this._tree = tree;
  }
  alignIconWithTwisty(treeItem) {
    if (treeItem.collapsibleState !== TreeItemCollapsibleState.None) {
      return false;
    }
    if (!this.hasIconOrCheckbox(treeItem)) {
      return false;
    }
    if (this._tree) {
      const root = this._tree.getInput();
      let parent;
      try {
        parent = this._tree.getParentElement(treeItem) || root;
      } catch (error) {
        this.logService.error(`[TreeView] Failed to resolve parent for ${treeItem.handle}`, error);
        return false;
      }
      if (this.hasIconOrCheckbox(parent)) {
        return !!parent.children && parent.children.some((c) => c.collapsibleState !== TreeItemCollapsibleState.None && !this.hasIconOrCheckbox(c));
      }
      return !!parent.children && parent.children.every((c) => c.collapsibleState === TreeItemCollapsibleState.None || !this.hasIconOrCheckbox(c));
    } else {
      return false;
    }
  }
  hasIconOrCheckbox(node) {
    return this.hasIcon(node) || !!node.checkbox;
  }
  hasIcon(node) {
    const icon = !isDark(this.themeService.getColorTheme().type) ? node.icon : node.iconDark;
    if (icon) {
      return true;
    }
    if (node.themeIcon && (!node.resourceUri || node.themeIcon.id !== FileThemeIcon.id && node.themeIcon.id !== FolderThemeIcon.id)) {
      return true;
    }
    if (node.resourceUri || node.themeIcon) {
      const fileIconTheme = this.themeService.getFileIconTheme();
      const isFolder = node.themeIcon ? node.themeIcon.id === FolderThemeIcon.id : node.collapsibleState !== TreeItemCollapsibleState.None;
      if (isFolder) {
        return fileIconTheme.hasFileIcons && fileIconTheme.hasFolderIcons;
      }
      return fileIconTheme.hasFileIcons;
    }
    return false;
  }
}
class MultipleSelectionActionRunner extends ActionRunner {
  constructor(notificationService, getSelectedResources) {
    super();
    this.getSelectedResources = getSelectedResources;
    this._register(this.onDidRun((e) => {
      if (e.error && !isCancellationError(e.error)) {
        notificationService.error(localize("command-error", "Error running command {1}: {0}. This is likely caused by the extension that contributes {1}.", e.error.message, e.action.id));
      }
    }));
  }
  async runAction(action, context) {
    const selection = this.getSelectedResources();
    let selectionHandleArgs = void 0;
    let actionInSelected = false;
    if (selection.length > 1) {
      selectionHandleArgs = selection.map((selected) => {
        if (selected.handle === context.$treeItemHandle || context.$selectedTreeItems) {
          actionInSelected = true;
        }
        return { $treeViewId: context.$treeViewId, $treeItemHandle: selected.handle };
      });
    }
    if (!actionInSelected && selectionHandleArgs) {
      selectionHandleArgs = void 0;
    }
    await action.run(context, selectionHandleArgs);
  }
}
let TreeMenus = class {
  constructor(id, menuService) {
    this.id = id;
    this.menuService = menuService;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  /**
   * Gets only the actions that apply to all of the given elements.
   */
  getResourceActions(elements) {
    const actions = this.getActions(this.getMenuId(), elements);
    return actions.primary;
  }
  /**
   * Gets only the actions that apply to all of the given elements.
   */
  getResourceContextActions(elements) {
    return this.getActions(this.getMenuId(), elements).secondary;
  }
  setContextKeyService(service) {
    this.contextKeyService = service;
  }
  filterNonUniversalActions(groups, newActions) {
    const newActionsSet = new Set(newActions.map((a) => a.id));
    for (const group of groups) {
      const actions = group.keys();
      for (const action of actions) {
        if (!newActionsSet.has(action)) {
          group.delete(action);
        }
      }
    }
  }
  buildMenu(groups) {
    const result = [];
    for (const group of groups) {
      if (group.size > 0) {
        if (result.length) {
          result.push(new Separator());
        }
        result.push(...group.values());
      }
    }
    return result;
  }
  createGroups(actions) {
    const groups = [];
    let group = /* @__PURE__ */ new Map();
    for (const action of actions) {
      if (action instanceof Separator) {
        groups.push(group);
        group = /* @__PURE__ */ new Map();
      } else {
        group.set(action.id, action);
      }
    }
    groups.push(group);
    return groups;
  }
  getElementOverlayContexts(element) {
    return /* @__PURE__ */ new Map([
      ["view", this.id],
      ["viewItem", element.contextValue]
    ]);
  }
  getEntireMenuContexts() {
    return this.menuService.getMenuContexts(this.getMenuId());
  }
  getMenuId() {
    return MenuId.ViewItemContext;
  }
  getActions(menuId, elements) {
    if (!this.contextKeyService) {
      return { primary: [], secondary: [] };
    }
    let primaryGroups = [];
    let secondaryGroups = [];
    for (let i = 0; i < elements.length; i++) {
      const element = elements[i];
      const contextKeyService = this.contextKeyService.createOverlay(this.getElementOverlayContexts(element));
      const menuData = this.menuService.getMenuActions(menuId, contextKeyService, { shouldForwardArgs: true });
      const result = getContextMenuActions(menuData, "inline");
      if (i === 0) {
        primaryGroups = this.createGroups(result.primary);
        secondaryGroups = this.createGroups(result.secondary);
      } else {
        this.filterNonUniversalActions(primaryGroups, result.primary);
        this.filterNonUniversalActions(secondaryGroups, result.secondary);
      }
    }
    return { primary: this.buildMenu(primaryGroups), secondary: this.buildMenu(secondaryGroups) };
  }
  dispose() {
    this.contextKeyService = void 0;
    this._onDidChange.dispose();
  }
};
TreeMenus = __decorateClass([
  __decorateParam(1, IMenuService)
], TreeMenus);
let CustomTreeView = class extends AbstractTreeView {
  constructor(id, title, extensionId, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, contextKeyService, hoverService, extensionService, activityService, telemetryService, logService, openerService, markdownRendererService) {
    super(id, title, themeService, instantiationService, commandService, configurationService, progressService, contextMenuService, keybindingService, notificationService, viewDescriptorService, hoverService, contextKeyService, activityService, logService, openerService, markdownRendererService);
    this.extensionId = extensionId;
    this.extensionService = extensionService;
    this.telemetryService = telemetryService;
  }
  activate() {
    if (!this.activated) {
      this.telemetryService.publicLog2("Extension:ViewActivate", {
        extensionId: new TelemetryTrustedValue(this.extensionId),
        id: this.id
      });
      this.createTree();
      this.progressService.withProgress({ location: this.id }, () => this.extensionService.activateByEvent(`onView:${this.id}`)).then(() => timeout(2e3)).then(() => {
        this.updateMessage();
      });
      this.activated = true;
    }
  }
};
CustomTreeView = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IProgressService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IViewDescriptorService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IHoverService),
  __decorateParam(14, IExtensionService),
  __decorateParam(15, IActivityService),
  __decorateParam(16, ITelemetryService),
  __decorateParam(17, ILogService),
  __decorateParam(18, IOpenerService),
  __decorateParam(19, IMarkdownRendererService)
], CustomTreeView);
class TreeView extends AbstractTreeView {
  activate() {
    if (!this.activated) {
      this.createTree();
      this.activated = true;
    }
  }
}
let CustomTreeViewDragAndDrop = class {
  constructor(treeId, labelService, instantiationService, treeViewsDragAndDropService, logService) {
    this.treeId = treeId;
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.treeViewsDragAndDropService = treeViewsDragAndDropService;
    this.logService = logService;
    this.treeItemsTransfer = LocalSelectionTransfer.getInstance();
    this.treeMimeType = `application/vnd.code.tree.${treeId.toLowerCase()}`;
  }
  set controller(controller) {
    this.dndController = controller;
  }
  handleDragAndLog(dndController, itemHandles, uuid, dragCancellationToken) {
    return dndController.handleDrag(itemHandles, uuid, dragCancellationToken).then((additionalDataTransfer) => {
      if (additionalDataTransfer) {
        const unlistedTypes = [];
        for (const item of additionalDataTransfer) {
          if (item[0] !== this.treeMimeType && dndController.dragMimeTypes.findIndex((value) => value === item[0]) < 0) {
            unlistedTypes.push(item[0]);
          }
        }
        if (unlistedTypes.length) {
          this.logService.warn(`Drag and drop controller for tree ${this.treeId} adds the following data transfer types but does not declare them in dragMimeTypes: ${unlistedTypes.join(", ")}`);
        }
      }
      return additionalDataTransfer;
    });
  }
  addExtensionProvidedTransferTypes(originalEvent, itemHandles) {
    if (!originalEvent.dataTransfer || !this.dndController) {
      return;
    }
    const uuid = generateUuid();
    this.dragCancellationToken = new CancellationTokenSource();
    this.treeViewsDragAndDropService.addDragOperationTransfer(uuid, this.handleDragAndLog(this.dndController, itemHandles, uuid, this.dragCancellationToken.token));
    this.treeItemsTransfer.setData([new DraggedTreeItemsIdentifier(uuid)], DraggedTreeItemsIdentifier.prototype);
    originalEvent.dataTransfer.clearData(Mimes.text);
    if (this.dndController.dragMimeTypes.find((element) => element === Mimes.uriList)) {
      originalEvent.dataTransfer?.setData(DataTransfers.RESOURCES, "");
    }
    this.dndController.dragMimeTypes.forEach((supportedType) => {
      originalEvent.dataTransfer?.setData(supportedType, "");
    });
  }
  addResourceInfoToTransfer(originalEvent, resources) {
    if (resources.length && originalEvent.dataTransfer) {
      this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, resources, originalEvent));
      const fileResources = resources.filter((s) => s.scheme === Schemas.file).map((r) => r.fsPath);
      if (fileResources.length) {
        originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
      }
    }
  }
  onDragStart(data, originalEvent) {
    if (originalEvent.dataTransfer) {
      const treeItemsData = data.getData();
      const resources = [];
      const sourceInfo = {
        id: this.treeId,
        itemHandles: []
      };
      treeItemsData.forEach((item) => {
        sourceInfo.itemHandles.push(item.handle);
        if (item.resourceUri) {
          resources.push(URI.revive(item.resourceUri));
        }
      });
      this.addResourceInfoToTransfer(originalEvent, resources);
      this.addExtensionProvidedTransferTypes(originalEvent, sourceInfo.itemHandles);
      originalEvent.dataTransfer.setData(
        this.treeMimeType,
        JSON.stringify(sourceInfo)
      );
    }
  }
  debugLog(types) {
    if (types.size) {
      this.logService.debug(`TreeView dragged mime types: ${Array.from(types).join(", ")}`);
    } else {
      this.logService.debug(`TreeView dragged with no supported mime types.`);
    }
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    const dataTransfer = toExternalVSDataTransfer(originalEvent.dataTransfer);
    const types = new Set(Array.from(dataTransfer, (x) => x[0]));
    if (originalEvent.dataTransfer) {
      for (const item of originalEvent.dataTransfer.items) {
        if (item.kind === "file" || item.type === DataTransfers.RESOURCES.toLowerCase()) {
          types.add(Mimes.uriList);
          break;
        }
      }
    }
    this.debugLog(types);
    const dndController = this.dndController;
    if (!dndController || !originalEvent.dataTransfer || dndController.dropMimeTypes.length === 0) {
      return false;
    }
    const dragContainersSupportedType = Array.from(types).some((value, index) => {
      if (value === this.treeMimeType) {
        return true;
      } else {
        return dndController.dropMimeTypes.indexOf(value) >= 0;
      }
    });
    if (dragContainersSupportedType) {
      return { accept: true, bubble: TreeDragOverBubble.Down, autoExpand: true };
    }
    return false;
  }
  getDragURI(element) {
    if (!this.dndController) {
      return null;
    }
    return element.resourceUri ? URI.revive(element.resourceUri).toString() : element.handle;
  }
  getDragLabel(elements) {
    if (!this.dndController) {
      return void 0;
    }
    if (elements.length > 1) {
      return String(elements.length);
    }
    const element = elements[0];
    if (element.label) {
      return isMarkdownString(element.label.label) ? element.label.label.value : element.label.label;
    }
    return element.resourceUri ? this.labelService.getUriLabel(URI.revive(element.resourceUri)) : void 0;
  }
  async drop(data, targetNode, targetIndex, targetSector, originalEvent) {
    const dndController = this.dndController;
    if (!originalEvent.dataTransfer || !dndController) {
      return;
    }
    let treeSourceInfo;
    let willDropUuid;
    if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
      willDropUuid = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype)[0].identifier;
    }
    const originalDataTransfer = toExternalVSDataTransfer(originalEvent.dataTransfer, true);
    const outDataTransfer = new VSDataTransfer();
    for (const [type, item] of originalDataTransfer) {
      if (type === this.treeMimeType || dndController.dropMimeTypes.includes(type) || item.asFile() && dndController.dropMimeTypes.includes(DataTransfers.FILES.toLowerCase())) {
        outDataTransfer.append(type, item);
        if (type === this.treeMimeType) {
          try {
            treeSourceInfo = JSON.parse(await item.asString());
          } catch {
          }
        }
      }
    }
    const additionalDataTransfer = await this.treeViewsDragAndDropService.removeDragOperationTransfer(willDropUuid);
    if (additionalDataTransfer) {
      for (const [type, item] of additionalDataTransfer) {
        outDataTransfer.append(type, item);
      }
    }
    return dndController.handleDrop(outDataTransfer, targetNode, CancellationToken.None, willDropUuid, treeSourceInfo?.id, treeSourceInfo?.itemHandles);
  }
  onDragEnd(originalEvent) {
    if (originalEvent.dataTransfer?.dropEffect === "none") {
      this.dragCancellationToken?.cancel();
    }
  }
  dispose() {
  }
};
CustomTreeViewDragAndDrop = __decorateClass([
  __decorateParam(1, ILabelService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITreeViewsDnDService),
  __decorateParam(4, ILogService)
], CustomTreeViewDragAndDrop);
function setCascadingCheckboxUpdates(items) {
  const additionalItems = [];
  for (const item of items) {
    if (item.checkbox !== void 0) {
      const checkChildren = (currentItem) => {
        for (const child of currentItem.children ?? []) {
          if (child.checkbox !== void 0 && currentItem.checkbox !== void 0 && child.checkbox.isChecked !== currentItem.checkbox.isChecked) {
            child.checkbox.isChecked = currentItem.checkbox.isChecked;
            additionalItems.push(child);
            checkChildren(child);
          }
        }
      };
      checkChildren(item);
      const visitedParents = /* @__PURE__ */ new Set();
      const checkParents = (currentItem) => {
        if (currentItem.parent?.checkbox !== void 0 && currentItem.parent.children) {
          if (visitedParents.has(currentItem.parent)) {
            return;
          } else {
            visitedParents.add(currentItem.parent);
          }
          let someUnchecked = false;
          let someChecked = false;
          for (const child of currentItem.parent.children) {
            if (someUnchecked && someChecked) {
              break;
            }
            if (child.checkbox !== void 0) {
              if (child.checkbox.isChecked) {
                someChecked = true;
              } else {
                someUnchecked = true;
              }
            }
          }
          if (someChecked && !someUnchecked && currentItem.parent.checkbox.isChecked !== true) {
            currentItem.parent.checkbox.isChecked = true;
            additionalItems.push(currentItem.parent);
            checkParents(currentItem.parent);
          } else if (someUnchecked && currentItem.parent.checkbox.isChecked !== false) {
            currentItem.parent.checkbox.isChecked = false;
            additionalItems.push(currentItem.parent);
            checkParents(currentItem.parent);
          }
        }
      };
      checkParents(item);
    }
  }
  return items.concat(additionalItems);
}
export {
  CustomTreeView,
  CustomTreeViewDragAndDrop,
  RawCustomTreeViewContextKey,
  TreeView,
  TreeViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3ZpZXdzL3RyZWVWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGF0YVRyYW5zZmVycywgSURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICogYXMgY3NzSnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IElSZW5kZXJlZE1hcmtkb3duLCByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciwgSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBFbGVtZW50c0RyYWdBbmREcm9wRGF0YSwgTGlzdFZpZXdUYXJnZXRTZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlRHJhZ0FuZERyb3AsIElUcmVlRHJhZ092ZXJSZWFjdGlvbiwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyLCBUcmVlRHJhZ092ZXJCdWJibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IENvbGxhcHNlQWxsQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZURlZmF1bHRzLmpzJztcbmltcG9ydCB7IEFjdGlvblJ1bm5lciwgSUFjdGlvbiwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlTWF0Y2hlcywgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBpc01hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRmFsc3lPcldoaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0ICcuL21lZGlhL3ZpZXdzLmNzcyc7XG5pbXBvcnQgeyBWU0RhdGFUcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGFUcmFuc2Zlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBY3Rpb25WaWV3SXRlbSwgZ2V0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51U2VydmljZSwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlDaGFuZ2VFdmVudCwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgRmlsZVRoZW1lSWNvbiwgRm9sZGVyVGhlbWVJY29uLCBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgZmlsbEVkaXRvcnNEcmFnRGF0YSB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VMYWJlbCwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQgfSBmcm9tICcuLi9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnMsIElWaWV3UGFuZU9wdGlvbnMsIFZpZXdQYW5lIH0gZnJvbSAnLi92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld2xldFZpZXdPcHRpb25zIH0gZnJvbSAnLi92aWV3c1ZpZXdsZXQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSVRyZWVJdGVtLCBJVHJlZUl0ZW1MYWJlbCwgSVRyZWVWaWV3LCBJVHJlZVZpZXdEYXRhUHJvdmlkZXIsIElUcmVlVmlld0Rlc2NyaXB0b3IsIElUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlciwgSVZpZXdCYWRnZSwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgSVZpZXdzUmVnaXN0cnksIFJlc29sdmFibGVUcmVlSXRlbSwgVHJlZUNvbW1hbmQsIFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSwgVHJlZVZpZXdJdGVtSGFuZGxlQXJnLCBUcmVlVmlld1BhbmVIYW5kbGVBcmcsIFZpZXdDb250YWluZXIsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlLCBOdW1iZXJCYWRnZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgQ29kZURhdGFUcmFuc2ZlcnMsIExvY2FsU2VsZWN0aW9uVHJhbnNmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgdG9FeHRlcm5hbFZTRGF0YVRyYW5zZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZGF0YVRyYW5zZmVyLmpzJztcbmltcG9ydCB7IENoZWNrYm94U3RhdGVIYW5kbGVyLCBUcmVlSXRlbUNoZWNrYm94IH0gZnJvbSAnLi9jaGVja2JveC5qcyc7XG5pbXBvcnQgeyBzZXRUaW1lb3V0MCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEFyaWFSb2xlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElUcmVlVmlld3NEbkRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlVmlld3NEbmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlVmlld3NEbmQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBwYXJzZUxpbmtlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCB7IEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJsZVZpZXdJbmZvcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcblxuZXhwb3J0IGNsYXNzIFRyZWVWaWV3UGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdHJlZVZpZXc6IElUcmVlVmlldztcblx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYWN0aW9uUnVubmVyOiBNdWx0aXBsZVNlbGVjdGlvbkFjdGlvblJ1bm5lcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUFjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlIGFjY2Vzc2libGVWaWV3U2VydmljZTogSUFjY2Vzc2libGVWaWV3SW5mb3JtYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7IC4uLihvcHRpb25zIGFzIElWaWV3UGFuZU9wdGlvbnMpLCB0aXRsZU1lbnVJZDogTWVudUlkLlZpZXdUaXRsZSwgZG9ub3RGb3J3YXJkQXJnczogZmFsc2UgfSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSwgYWNjZXNzaWJsZVZpZXdTZXJ2aWNlKTtcblx0XHRjb25zdCB7IHRyZWVWaWV3IH0gPSAoPElUcmVlVmlld0Rlc2NyaXB0b3I+UmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSkuZ2V0VmlldyhvcHRpb25zLmlkKSk7XG5cdFx0dGhpcy50cmVlVmlldyA9IHRyZWVWaWV3O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZVZpZXcub25EaWRDaGFuZ2VBY3Rpb25zKCgpID0+IHRoaXMudXBkYXRlQWN0aW9ucygpLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlVmlldy5vbkRpZENoYW5nZVRpdGxlKChuZXdUaXRsZSkgPT4gdGhpcy51cGRhdGVUaXRsZShuZXdUaXRsZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWVWaWV3Lm9uRGlkQ2hhbmdlRGVzY3JpcHRpb24oKG5ld0Rlc2NyaXB0aW9uKSA9PiB0aGlzLnVwZGF0ZVRpdGxlRGVzY3JpcHRpb24obmV3RGVzY3JpcHRpb24pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb250YWluZXIgJiYgdGhpcy50cmVlVmlldy5jb250YWluZXIgJiYgKHRoaXMuX2NvbnRhaW5lciA9PT0gdGhpcy50cmVlVmlldy5jb250YWluZXIpKSB7XG5cdFx0XHRcdHRoaXMudHJlZVZpZXcuc2V0VmlzaWJpbGl0eShmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSgoKSA9PiB0aGlzLnVwZGF0ZVRyZWVWaXNpYmlsaXR5KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWVWaWV3Lm9uRGlkQ2hhbmdlV2VsY29tZVN0YXRlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5maXJlKCkpKTtcblx0XHRpZiAob3B0aW9ucy50aXRsZSAhPT0gdGhpcy50cmVlVmlldy50aXRsZSkge1xuXHRcdFx0dGhpcy51cGRhdGVUaXRsZSh0aGlzLnRyZWVWaWV3LnRpdGxlKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMudGl0bGVEZXNjcmlwdGlvbiAhPT0gdGhpcy50cmVlVmlldy5kZXNjcmlwdGlvbikge1xuXHRcdFx0dGhpcy51cGRhdGVUaXRsZURlc2NyaXB0aW9uKHRoaXMudHJlZVZpZXcuZGVzY3JpcHRpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9hY3Rpb25SdW5uZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXVsdGlwbGVTZWxlY3Rpb25BY3Rpb25SdW5uZXIobm90aWZpY2F0aW9uU2VydmljZSwgKCkgPT4gdGhpcy50cmVlVmlldy5nZXRTZWxlY3Rpb24oKSkpO1xuXG5cdFx0dGhpcy51cGRhdGVUcmVlVmlzaWJpbGl0eSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHR0aGlzLnRyZWVWaWV3LmZvY3VzKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblx0XHR0aGlzLnJlbmRlclRyZWVWaWV3KGNvbnRhaW5lcik7XG5cdH1cblxuXHRvdmVycmlkZSBzaG91bGRTaG93V2VsY29tZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKCh0aGlzLnRyZWVWaWV3LmRhdGFQcm92aWRlciA9PT0gdW5kZWZpbmVkKSB8fCAhIXRoaXMudHJlZVZpZXcuZGF0YVByb3ZpZGVyLmlzVHJlZUVtcHR5KSAmJiAoKHRoaXMudHJlZVZpZXcubWVzc2FnZSA9PT0gdW5kZWZpbmVkKSB8fCAodGhpcy50cmVlVmlldy5tZXNzYWdlID09PSAnJykpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMubGF5b3V0VHJlZVZpZXcoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRPcHRpbWFsV2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlVmlldy5nZXRPcHRpbWFsV2lkdGgoKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJUcmVlVmlldyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy50cmVlVmlldy5zaG93KGNvbnRhaW5lcik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgbGF5b3V0VHJlZVZpZXcoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVWaWV3LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVHJlZVZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlVmlldy5zZXRWaXNpYmlsaXR5KHRoaXMuaXNCb2R5VmlzaWJsZSgpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEFjdGlvblJ1bm5lcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uUnVubmVyO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0QWN0aW9uc0NvbnRleHQoKTogVHJlZVZpZXdQYW5lSGFuZGxlQXJnIHtcblx0XHRyZXR1cm4geyAkdHJlZVZpZXdJZDogdGhpcy5pZCwgJGZvY3VzZWRUcmVlSXRlbTogdHJ1ZSwgJHNlbGVjdGVkVHJlZUl0ZW1zOiB0cnVlIH07XG5cdH1cblxufVxuXG5jbGFzcyBSb290IGltcGxlbWVudHMgSVRyZWVJdGVtIHtcblx0bGFiZWwgPSB7IGxhYmVsOiAncm9vdCcgfTtcblx0aGFuZGxlID0gJzAnO1xuXHRwYXJlbnRIYW5kbGU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Y29sbGFwc2libGVTdGF0ZSA9IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5FeHBhbmRlZDtcblx0Y2hpbGRyZW46IElUcmVlSXRlbVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb21tYW5kUHJlY29uZGl0aW9ucyhjb21tYW5kSWQ6IHN0cmluZyk6IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY29tbWFuZCA9IENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kSWQpO1xuXHRpZiAoY29tbWFuZCkge1xuXHRcdGNvbnN0IGNvbW1hbmRBY3Rpb24gPSBNZW51UmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kLmlkKTtcblx0XHRyZXR1cm4gY29tbWFuZEFjdGlvbj8ucHJlY29uZGl0aW9uO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGlzVHJlZUNvbW1hbmRFbmFibGVkKHRyZWVDb21tYW5kOiBUcmVlQ29tbWFuZCB8IENvbW1hbmQsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiBib29sZWFuIHtcblx0Y29uc3QgY29tbWFuZElkOiBzdHJpbmcgPSAodHJlZUNvbW1hbmQgYXMgVHJlZUNvbW1hbmQpLm9yaWdpbmFsSWQgPyAodHJlZUNvbW1hbmQgYXMgVHJlZUNvbW1hbmQpLm9yaWdpbmFsSWQhIDogdHJlZUNvbW1hbmQuaWQ7XG5cdGNvbnN0IHByZWNvbmRpdGlvbiA9IGNvbW1hbmRQcmVjb25kaXRpb25zKGNvbW1hbmRJZCk7XG5cdGlmIChwcmVjb25kaXRpb24pIHtcblx0XHRyZXR1cm4gY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhwcmVjb25kaXRpb24pO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmludGVyZmFjZSBSZW5kZXJlZE1lc3NhZ2UgeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSB9XG5cbmZ1bmN0aW9uIGlzUmVuZGVyZWRNZXNzYWdlVmFsdWUobWVzc2FnZVZhbHVlOiBzdHJpbmcgfCBSZW5kZXJlZE1lc3NhZ2UgfCB1bmRlZmluZWQpOiBtZXNzYWdlVmFsdWUgaXMgUmVuZGVyZWRNZXNzYWdlIHtcblx0cmV0dXJuICEhbWVzc2FnZVZhbHVlICYmIHR5cGVvZiBtZXNzYWdlVmFsdWUgIT09ICdzdHJpbmcnICYmICEhbWVzc2FnZVZhbHVlLmVsZW1lbnQgJiYgISFtZXNzYWdlVmFsdWUuZGlzcG9zYWJsZXM7XG59XG5cbmNvbnN0IG5vRGF0YVByb3ZpZGVyTWVzc2FnZSA9IGxvY2FsaXplKCduby1kYXRhcHJvdmlkZXInLCBcIlRoZXJlIGlzIG5vIGRhdGEgcHJvdmlkZXIgcmVnaXN0ZXJlZCB0aGF0IGNhbiBwcm92aWRlIHZpZXcgZGF0YS5cIik7XG5cbmV4cG9ydCBjb25zdCBSYXdDdXN0b21UcmVlVmlld0NvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignY3VzdG9tVHJlZVZpZXcnLCBmYWxzZSk7XG5cbmNsYXNzIFRyZWUgZXh0ZW5kcyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElUcmVlSXRlbSwgSVRyZWVJdGVtLCBGdXp6eVNjb3JlPiB7IH1cblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RUcmVlVmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJlZVZpZXcge1xuXG5cdHByaXZhdGUgaXNWaXNpYmxlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0ljb25Gb3JQYXJlbnROb2RlID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0ljb25Gb3JMZWFmTm9kZSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgY29sbGFwc2VBbGxDb250ZXh0S2V5OiBSYXdDb250ZXh0S2V5PGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbGxhcHNlQWxsQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29sbGFwc2VBbGxUb2dnbGVDb250ZXh0S2V5OiBSYXdDb250ZXh0S2V5PGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbGxhcHNlQWxsVG9nZ2xlQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVmcmVzaENvbnRleHRLZXk6IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVmcmVzaENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZm9jdXNlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGRvbU5vZGUhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0cmVlQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbWVzc2FnZVZhbHVlOiBzdHJpbmcgfCB7IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NhblNlbGVjdE1hbnk6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfbWFudWFsbHlNYW5hZ2VDaGVja2JveGVzOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgbWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRyZWU6IFRyZWUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdHJlZUxhYmVsczogUmVzb3VyY2VMYWJlbHMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdHJlZVZpZXdEbmQ6IEN1c3RvbVRyZWVWaWV3RHJhZ0FuZERyb3AgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByb290OiBJVHJlZUl0ZW07XG5cdHByaXZhdGUgZWxlbWVudHNUb1JlZnJlc2g6IElUcmVlSXRlbVtdID0gW107XG5cdHByaXZhdGUgbGFzdFNlbGVjdGlvbjogcmVhZG9ubHkgSVRyZWVJdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBsYXN0QWN0aXZlOiBJVHJlZUl0ZW07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFeHBhbmRJdGVtOiBFbWl0dGVyPElUcmVlSXRlbT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVHJlZUl0ZW0+KCkpO1xuXHRnZXQgb25EaWRFeHBhbmRJdGVtKCk6IEV2ZW50PElUcmVlSXRlbT4geyByZXR1cm4gdGhpcy5fb25EaWRFeHBhbmRJdGVtLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb2xsYXBzZUl0ZW06IEVtaXR0ZXI8SVRyZWVJdGVtPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUcmVlSXRlbT4oKSk7XG5cdGdldCBvbkRpZENvbGxhcHNlSXRlbSgpOiBFdmVudDxJVHJlZUl0ZW0+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ29sbGFwc2VJdGVtLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTZWxlY3Rpb25BbmRGb2N1czogRW1pdHRlcjx7IHNlbGVjdGlvbjogcmVhZG9ubHkgSVRyZWVJdGVtW107IGZvY3VzOiBJVHJlZUl0ZW0gfT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHNlbGVjdGlvbjogcmVhZG9ubHkgSVRyZWVJdGVtW107IGZvY3VzOiBJVHJlZUl0ZW0gfT4oKSk7XG5cdGdldCBvbkRpZENoYW5nZVNlbGVjdGlvbkFuZEZvY3VzKCk6IEV2ZW50PHsgc2VsZWN0aW9uOiByZWFkb25seSBJVHJlZUl0ZW1bXTsgZm9jdXM6IElUcmVlSXRlbSB9PiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbkFuZEZvY3VzLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFbWl0dGVyPGJvb2xlYW4+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdGdldCBvbkRpZENoYW5nZVZpc2liaWxpdHkoKTogRXZlbnQ8Ym9vbGVhbj4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3Rpb25zOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZUFjdGlvbnMoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VBY3Rpb25zLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXZWxjb21lU3RhdGU6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlV2VsY29tZVN0YXRlKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlV2VsY29tZVN0YXRlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUaXRsZTogRW1pdHRlcjxzdHJpbmc+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlVGl0bGUoKTogRXZlbnQ8c3RyaW5nPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZVRpdGxlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VEZXNjcmlwdGlvbjogRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nIHwgdW5kZWZpbmVkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlRGVzY3JpcHRpb24oKTogRXZlbnQ8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZURlc2NyaXB0aW9uLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlOiBFbWl0dGVyPHJlYWRvbmx5IElUcmVlSXRlbVtdPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElUcmVlSXRlbVtdPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZSgpOiBFdmVudDxyZWFkb25seSBJVHJlZUl0ZW1bXT4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb21wbGV0ZVJlZnJlc2g6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3RpdGxlOiBzdHJpbmcsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJvb3QgPSBuZXcgUm9vdCgpO1xuXHRcdHRoaXMubGFzdEFjdGl2ZSA9IHRoaXMucm9vdDtcblx0XHQvLyBUcnkgbm90IHRvIGFkZCBhbnl0aGluZyB0aGF0IGNvdWxkIGJlIGNvc3RseSB0byB0aGlzIGNvbnN0cnVjdG9yLiBJdCBnZXRzIGNhbGxlZCBvbmNlIHBlciB0cmVlIHZpZXdcblx0XHQvLyBkdXJpbmcgc3RhcnR1cCwgYW5kIGFueXRoaW5nIGFkZGVkIGhlcmUgY2FuIGFmZmVjdCBwZXJmb3JtYW5jZS5cblx0fVxuXG5cdHByaXZhdGUgX2lzSW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBpbml0aWFsaXplKCkge1xuXHRcdGlmICh0aGlzLl9pc0luaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzSW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gUmVtZW1iZXIgd2hlbiBhZGRpbmcgdG8gdGhpcyBtZXRob2QgdGhhdCBpdCBpc24ndCBjYWxsZWQgdW50aWwgdGhlIHZpZXcgaXMgdmlzaWJsZSwgbWVhbmluZyB0aGF0XG5cdFx0Ly8gcHJvcGVydGllcyBjb3VsZCBiZSBzZXQgYW5kIGV2ZW50cyBjb3VsZCBiZSBmaXJlZCBiZWZvcmUgd2UncmUgaW5pdGlhbGl6ZWQgYW5kIHRoYXQgdGhpcyBuZWVkcyB0byBiZSBoYW5kbGVkLlxuXG5cdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5pbml0aWFsaXplU2hvd0NvbGxhcHNlQWxsQWN0aW9uKCk7XG5cdFx0XHR0aGlzLmluaXRpYWxpemVDb2xsYXBzZUFsbFRvZ2dsZSgpO1xuXHRcdFx0dGhpcy5pbml0aWFsaXplU2hvd1JlZnJlc2hBY3Rpb24oKTtcblx0XHR9KTtcblxuXHRcdHRoaXMudHJlZVZpZXdEbmQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbVRyZWVWaWV3RHJhZ0FuZERyb3AsIHRoaXMuaWQpO1xuXHRcdGlmICh0aGlzLl9kcmFnQW5kRHJvcENvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMudHJlZVZpZXdEbmQuY29udHJvbGxlciA9IHRoaXMuX2RyYWdBbmREcm9wQ29udHJvbGxlcjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdleHBsb3Jlci5kZWNvcmF0aW9ucycpKSB7XG5cdFx0XHRcdHRoaXMuZG9SZWZyZXNoKFt0aGlzLnJvb3RdKTsgLyoqIHNvZnQgcmVmcmVzaCAqKi9cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VMb2NhdGlvbigoeyB2aWV3cywgZnJvbSwgdG8gfSkgPT4ge1xuXHRcdFx0aWYgKHZpZXdzLnNvbWUodiA9PiB2LmlkID09PSB0aGlzLmlkKSkge1xuXHRcdFx0XHR0aGlzLnRyZWU/LnVwZGF0ZU9wdGlvbnMoeyBvdmVycmlkZVN0eWxlczogZ2V0TG9jYXRpb25CYXNlZFZpZXdDb2xvcnModGhpcy52aWV3TG9jYXRpb24pLmxpc3RPdmVycmlkZVN0eWxlcyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoKTtcblxuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdH1cblxuXHRnZXQgdmlld0NvbnRhaW5lcigpOiBWaWV3Q29udGFpbmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHRoaXMuaWQpITtcblx0fVxuXG5cdGdldCB2aWV3TG9jYXRpb24oKTogVmlld0NvbnRhaW5lckxvY2F0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0xvY2F0aW9uQnlJZCh0aGlzLmlkKSE7XG5cdH1cblx0cHJpdmF0ZSBfZHJhZ0FuZERyb3BDb250cm9sbGVyOiBJVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdGdldCBkcmFnQW5kRHJvcENvbnRyb2xsZXIoKTogSVRyZWVWaWV3RHJhZ0FuZERyb3BDb250cm9sbGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZHJhZ0FuZERyb3BDb250cm9sbGVyO1xuXHR9XG5cdHNldCBkcmFnQW5kRHJvcENvbnRyb2xsZXIoZG5kOiBJVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9kcmFnQW5kRHJvcENvbnRyb2xsZXIgPSBkbmQ7XG5cdFx0aWYgKHRoaXMudHJlZVZpZXdEbmQpIHtcblx0XHRcdHRoaXMudHJlZVZpZXdEbmQuY29udHJvbGxlciA9IGRuZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kYXRhUHJvdmlkZXI6IElUcmVlVmlld0RhdGFQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0Z2V0IGRhdGFQcm92aWRlcigpOiBJVHJlZVZpZXdEYXRhUHJvdmlkZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9kYXRhUHJvdmlkZXI7XG5cdH1cblxuXHRzZXQgZGF0YVByb3ZpZGVyKGRhdGFQcm92aWRlcjogSVRyZWVWaWV3RGF0YVByb3ZpZGVyIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKGRhdGFQcm92aWRlcikge1xuXHRcdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLmFjdGl2YXRlKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWxmID0gdGhpcztcblx0XHRcdHRoaXMuX2RhdGFQcm92aWRlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElUcmVlVmlld0RhdGFQcm92aWRlciB7XG5cdFx0XHRcdHByaXZhdGUgX2lzRW1wdHk6IGJvb2xlYW4gPSB0cnVlO1xuXHRcdFx0XHRwcml2YXRlIF9vbkRpZENoYW5nZUVtcHR5OiBFbWl0dGVyPHZvaWQ+ID0gbmV3IEVtaXR0ZXIoKTtcblx0XHRcdFx0cHVibGljIG9uRGlkQ2hhbmdlRW1wdHk6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VFbXB0eS5ldmVudDtcblxuXHRcdFx0XHRnZXQgaXNUcmVlRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2lzRW1wdHk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50PzogSVRyZWVJdGVtKTogUHJvbWlzZTxyZWFkb25seSBJVHJlZUl0ZW1bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRcdGNvbnN0IGJhdGNoZXMgPSBhd2FpdCB0aGlzLmdldENoaWxkcmVuQmF0Y2goZWxlbWVudCA/IFtlbGVtZW50XSA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0cmV0dXJuIGJhdGNoZXM/LlswXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHByaXZhdGUgdXBkYXRlRW1wdHlTdGF0ZShub2RlczogSVRyZWVJdGVtW10sIGNoaWxkcmVuR3JvdXBzOiAocmVhZG9ubHkgSVRyZWVJdGVtW10pW10pOiB2b2lkIHtcblx0XHRcdFx0XHRpZiAoKG5vZGVzLmxlbmd0aCA9PT0gMSkgJiYgKG5vZGVzWzBdIGluc3RhbmNlb2YgUm9vdCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG9sZEVtcHR5ID0gdGhpcy5faXNFbXB0eTtcblx0XHRcdFx0XHRcdHRoaXMuX2lzRW1wdHkgPSAoY2hpbGRyZW5Hcm91cHMubGVuZ3RoID09PSAwKSB8fCAoY2hpbGRyZW5Hcm91cHNbMF0ubGVuZ3RoID09PSAwKTtcblx0XHRcdFx0XHRcdGlmIChvbGRFbXB0eSAhPT0gdGhpcy5faXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVtcHR5LmZpcmUoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwcml2YXRlIGZpbmRDaGVja2JveGVzVXBkYXRlZChub2RlczogSVRyZWVJdGVtW10sIGNoaWxkcmVuR3JvdXBzOiAocmVhZG9ubHkgSVRyZWVJdGVtW10pW10pOiBJVHJlZUl0ZW1bXSB7XG5cdFx0XHRcdFx0aWYgKGNoaWxkcmVuR3JvdXBzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjaGVja2JveGVzVXBkYXRlZDogSVRyZWVJdGVtW10gPSBbXTtcblxuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5vZGUgPSBub2Rlc1tpXTtcblx0XHRcdFx0XHRcdGNvbnN0IGNoaWxkcmVuID0gY2hpbGRyZW5Hcm91cHNbaV07XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdGNoaWxkLnBhcmVudCA9IG5vZGU7XG5cdFx0XHRcdFx0XHRcdGlmICghc2VsZi5tYW51YWxseU1hbmFnZUNoZWNrYm94ZXMgJiYgKG5vZGU/LmNoZWNrYm94Py5pc0NoZWNrZWQgPT09IHRydWUpICYmIChjaGlsZC5jaGVja2JveD8uaXNDaGVja2VkID09PSBmYWxzZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRjaGlsZC5jaGVja2JveC5pc0NoZWNrZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdGNoZWNrYm94ZXNVcGRhdGVkLnB1c2goY2hpbGQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBjaGVja2JveGVzVXBkYXRlZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIGdldENoaWxkcmVuQmF0Y2gobm9kZXM/OiBJVHJlZUl0ZW1bXSk6IFByb21pc2U8KHJlYWRvbmx5IElUcmVlSXRlbVtdKVtdPiB7XG5cdFx0XHRcdFx0bGV0IGNoaWxkcmVuR3JvdXBzOiAocmVhZG9ubHkgSVRyZWVJdGVtW10pW107XG5cdFx0XHRcdFx0bGV0IGNoZWNrYm94ZXNVcGRhdGVkOiBJVHJlZUl0ZW1bXSA9IFtdO1xuXHRcdFx0XHRcdGlmIChub2Rlcz8uZXZlcnkoKG5vZGUpOiBub2RlIGlzIFJlcXVpcmVkPElUcmVlSXRlbSAmIHsgY2hpbGRyZW46IElUcmVlSXRlbVtdIH0+ID0+ICEhbm9kZS5jaGlsZHJlbikpIHtcblx0XHRcdFx0XHRcdGNoaWxkcmVuR3JvdXBzID0gbm9kZXMubWFwKG5vZGUgPT4gbm9kZS5jaGlsZHJlbik7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG5vZGVzID0gbm9kZXMgPz8gW3NlbGYucm9vdF07XG5cdFx0XHRcdFx0XHRjb25zdCBiYXRjaGVkQ2hpbGRyZW4gPSBhd2FpdCAobm9kZXMubGVuZ3RoID09PSAxICYmIG5vZGVzWzBdIGluc3RhbmNlb2YgUm9vdCA/IGRvR2V0Q2hpbGRyZW5PckJhdGNoKGRhdGFQcm92aWRlciwgdW5kZWZpbmVkKSA6IGRvR2V0Q2hpbGRyZW5PckJhdGNoKGRhdGFQcm92aWRlciwgbm9kZXMpKTtcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgbm9kZSA9IG5vZGVzW2ldO1xuXHRcdFx0XHRcdFx0XHRub2RlLmNoaWxkcmVuID0gYmF0Y2hlZENoaWxkcmVuID8gYmF0Y2hlZENoaWxkcmVuW2ldIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2hpbGRyZW5Hcm91cHMgPSBiYXRjaGVkQ2hpbGRyZW4gPz8gW107XG5cdFx0XHRcdFx0XHRjaGVja2JveGVzVXBkYXRlZCA9IHRoaXMuZmluZENoZWNrYm94ZXNVcGRhdGVkKG5vZGVzLCBjaGlsZHJlbkdyb3Vwcyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy51cGRhdGVFbXB0eVN0YXRlKG5vZGVzLCBjaGlsZHJlbkdyb3Vwcyk7XG5cblx0XHRcdFx0XHRpZiAoY2hlY2tib3hlc1VwZGF0ZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0c2VsZi5fb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlLmZpcmUoY2hlY2tib3hlc1VwZGF0ZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gY2hpbGRyZW5Hcm91cHM7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRpZiAodGhpcy5fZGF0YVByb3ZpZGVyLm9uRGlkQ2hhbmdlRW1wdHkpIHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGF0YVByb3ZpZGVyLm9uRGlkQ2hhbmdlRW1wdHkoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlQ29sbGFwc2VBbGxUb2dnbGUoKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVdlbGNvbWVTdGF0ZS5maXJlKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlTWVzc2FnZSgpO1xuXHRcdFx0dGhpcy5yZWZyZXNoKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2RhdGFQcm92aWRlciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMudHJlZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLmFjdGl2YXRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy51cGRhdGVNZXNzYWdlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXZWxjb21lU3RhdGUuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgbWVzc2FnZSgpOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tZXNzYWdlO1xuXHR9XG5cblx0c2V0IG1lc3NhZ2UobWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fbWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0dGhpcy51cGRhdGVNZXNzYWdlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VXZWxjb21lU3RhdGUuZmlyZSgpO1xuXHR9XG5cblx0Z2V0IHRpdGxlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3RpdGxlO1xuXHR9XG5cblx0c2V0IHRpdGxlKG5hbWU6IHN0cmluZykge1xuXHRcdHRoaXMuX3RpdGxlID0gbmFtZTtcblx0XHRpZiAodGhpcy50cmVlKSB7XG5cdFx0XHR0aGlzLnRyZWUuYXJpYUxhYmVsID0gdGhpcy5fdGl0bGU7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVGl0bGUuZmlyZSh0aGlzLl90aXRsZSk7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVzY3JpcHRpb247XG5cdH1cblxuXHRzZXQgZGVzY3JpcHRpb24oZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VEZXNjcmlwdGlvbi5maXJlKHRoaXMuX2Rlc2NyaXB0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2JhZGdlOiBJVmlld0JhZGdlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3Rpdml0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0Z2V0IGJhZGdlKCk6IElWaWV3QmFkZ2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9iYWRnZTtcblx0fVxuXG5cdHNldCBiYWRnZShiYWRnZTogSVZpZXdCYWRnZSB8IHVuZGVmaW5lZCkge1xuXG5cdFx0aWYgKHRoaXMuX2JhZGdlPy52YWx1ZSA9PT0gYmFkZ2U/LnZhbHVlICYmXG5cdFx0XHR0aGlzLl9iYWRnZT8udG9vbHRpcCA9PT0gYmFkZ2U/LnRvb2x0aXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9iYWRnZSA9IGJhZGdlO1xuXHRcdGlmIChiYWRnZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZpdHkgPSB7XG5cdFx0XHRcdGJhZGdlOiBuZXcgTnVtYmVyQmFkZ2UoYmFkZ2UudmFsdWUsICgpID0+IGJhZGdlLnRvb2x0aXApLFxuXHRcdFx0XHRwcmlvcml0eTogNTBcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9hY3Rpdml0eS52YWx1ZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dWaWV3QWN0aXZpdHkodGhpcy5pZCwgYWN0aXZpdHkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9hY3Rpdml0eS5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBjYW5TZWxlY3RNYW55KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jYW5TZWxlY3RNYW55O1xuXHR9XG5cblx0c2V0IGNhblNlbGVjdE1hbnkoY2FuU2VsZWN0TWFueTogYm9vbGVhbikge1xuXHRcdGNvbnN0IG9sZENhblNlbGVjdE1hbnkgPSB0aGlzLl9jYW5TZWxlY3RNYW55O1xuXHRcdHRoaXMuX2NhblNlbGVjdE1hbnkgPSBjYW5TZWxlY3RNYW55O1xuXHRcdGlmICh0aGlzLl9jYW5TZWxlY3RNYW55ICE9PSBvbGRDYW5TZWxlY3RNYW55KSB7XG5cdFx0XHR0aGlzLnRyZWU/LnVwZGF0ZU9wdGlvbnMoeyBtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRoaXMuY2FuU2VsZWN0TWFueSB9KTtcblx0XHR9XG5cdH1cblxuXHRnZXQgbWFudWFsbHlNYW5hZ2VDaGVja2JveGVzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9tYW51YWxseU1hbmFnZUNoZWNrYm94ZXM7XG5cdH1cblxuXHRzZXQgbWFudWFsbHlNYW5hZ2VDaGVja2JveGVzKG1hbnVhbGx5TWFuYWdlQ2hlY2tib3hlczogYm9vbGVhbikge1xuXHRcdHRoaXMuX21hbnVhbGx5TWFuYWdlQ2hlY2tib3hlcyA9IG1hbnVhbGx5TWFuYWdlQ2hlY2tib3hlcztcblx0fVxuXG5cdGdldCBoYXNJY29uRm9yUGFyZW50Tm9kZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzSWNvbkZvclBhcmVudE5vZGU7XG5cdH1cblxuXHRnZXQgaGFzSWNvbkZvckxlYWZOb2RlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oYXNJY29uRm9yTGVhZk5vZGU7XG5cdH1cblxuXHRnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5pc1Zpc2libGU7XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemVTaG93Q29sbGFwc2VBbGxBY3Rpb24oc3RhcnRpbmdWYWx1ZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0aWYgKCF0aGlzLmNvbGxhcHNlQWxsQ29udGV4dCkge1xuXHRcdFx0dGhpcy5jb2xsYXBzZUFsbENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihgdHJlZVZpZXcuJHt0aGlzLmlkfS5lbmFibGVDb2xsYXBzZUFsbGAsIHN0YXJ0aW5nVmFsdWUsIGxvY2FsaXplKCd0cmVlVmlldy5lbmFibGVDb2xsYXBzZUFsbCcsIFwiV2hldGhlciB0aGUgdHJlZSB2aWV3IHdpdGggaWQgezB9IGVuYWJsZXMgY29sbGFwc2UgYWxsLlwiLCB0aGlzLmlkKSk7XG5cdFx0XHR0aGlzLmNvbGxhcHNlQWxsQ29udGV4dCA9IHRoaXMuY29sbGFwc2VBbGxDb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRnZXQgc2hvd0NvbGxhcHNlQWxsQWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuaW5pdGlhbGl6ZVNob3dDb2xsYXBzZUFsbEFjdGlvbigpO1xuXHRcdHJldHVybiAhIXRoaXMuY29sbGFwc2VBbGxDb250ZXh0Py5nZXQoKTtcblx0fVxuXG5cdHNldCBzaG93Q29sbGFwc2VBbGxBY3Rpb24oc2hvd0NvbGxhcHNlQWxsQWN0aW9uOiBib29sZWFuKSB7XG5cdFx0dGhpcy5pbml0aWFsaXplU2hvd0NvbGxhcHNlQWxsQWN0aW9uKHNob3dDb2xsYXBzZUFsbEFjdGlvbik7XG5cdFx0dGhpcy5jb2xsYXBzZUFsbENvbnRleHQ/LnNldChzaG93Q29sbGFwc2VBbGxBY3Rpb24pO1xuXHR9XG5cblxuXHRwcml2YXRlIGluaXRpYWxpemVTaG93UmVmcmVzaEFjdGlvbihzdGFydGluZ1ZhbHVlOiBib29sZWFuID0gZmFsc2UpIHtcblx0XHRpZiAoIXRoaXMucmVmcmVzaENvbnRleHQpIHtcblx0XHRcdHRoaXMucmVmcmVzaENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihgdHJlZVZpZXcuJHt0aGlzLmlkfS5lbmFibGVSZWZyZXNoYCwgc3RhcnRpbmdWYWx1ZSwgbG9jYWxpemUoJ3RyZWVWaWV3LmVuYWJsZVJlZnJlc2gnLCBcIldoZXRoZXIgdGhlIHRyZWUgdmlldyB3aXRoIGlkIHswfSBlbmFibGVzIHJlZnJlc2guXCIsIHRoaXMuaWQpKTtcblx0XHRcdHRoaXMucmVmcmVzaENvbnRleHQgPSB0aGlzLnJlZnJlc2hDb250ZXh0S2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgc2hvd1JlZnJlc2hBY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5pbml0aWFsaXplU2hvd1JlZnJlc2hBY3Rpb24oKTtcblx0XHRyZXR1cm4gISF0aGlzLnJlZnJlc2hDb250ZXh0Py5nZXQoKTtcblx0fVxuXG5cdHNldCBzaG93UmVmcmVzaEFjdGlvbihzaG93UmVmcmVzaEFjdGlvbjogYm9vbGVhbikge1xuXHRcdHRoaXMuaW5pdGlhbGl6ZVNob3dSZWZyZXNoQWN0aW9uKHNob3dSZWZyZXNoQWN0aW9uKTtcblx0XHR0aGlzLnJlZnJlc2hDb250ZXh0Py5zZXQoc2hvd1JlZnJlc2hBY3Rpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbnMudHJlZVZpZXcuJHt0aGF0LmlkfS5yZWZyZXNoYCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JlZnJlc2gnLCBcIlJlZnJlc2hcIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgdGhhdC5pZCksIHRoYXQucmVmcmVzaENvbnRleHRLZXkpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiAtIDEsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnJlZnJlc2hcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHJldHVybiB0aGF0LnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbnMudHJlZVZpZXcuJHt0aGF0LmlkfS5jb2xsYXBzZUFsbGAsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb2xsYXBzZUFsbCcsIFwiQ29sbGFwc2UgQWxsXCIpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIHRoYXQuaWQpLCB0aGF0LmNvbGxhcHNlQWxsQ29udGV4dEtleSksXG5cdFx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdFx0b3JkZXI6IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiB0aGF0LmNvbGxhcHNlQWxsVG9nZ2xlQ29udGV4dEtleSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmNvbGxhcHNlQWxsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRpZiAodGhhdC50cmVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBDb2xsYXBzZUFsbEFjdGlvbjxJVHJlZUl0ZW0sIElUcmVlSXRlbSwgRnV6enlTY29yZT4odGhhdC50cmVlLCB0cnVlKS5ydW4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHNldFZpc2liaWxpdHkoaXNWaXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gVGhyb3VnaG91dCBzZXRWaXNpYmlsaXR5IHdlIG5lZWQgdG8gY2hlY2sgaWYgdGhlIHRyZWUgdmlldydzIGRhdGEgcHJvdmlkZXIgc3RpbGwgZXhpc3RzLlxuXHRcdC8vIFRoaXMgY2FuIGhhcHBlbiBiZWNhdXNlIHRoZSBgZ2V0Q2hpbGRyZW5gIGNhbGwgdG8gdGhlIGV4dGVuc2lvbiBjYW4gcmV0dXJuXG5cdFx0Ly8gYWZ0ZXIgdGhlIHRyZWUgaGFzIGJlZW4gZGlzcG9zZWQuXG5cblx0XHR0aGlzLmluaXRpYWxpemUoKTtcblx0XHRpc1Zpc2libGUgPSAhIWlzVmlzaWJsZTtcblx0XHRpZiAodGhpcy5pc1Zpc2libGUgPT09IGlzVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaXNWaXNpYmxlID0gaXNWaXNpYmxlO1xuXG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKSB7XG5cdFx0XHRcdERPTS5zaG93KHRoaXMudHJlZS5nZXRIVE1MRWxlbWVudCgpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdERPTS5oaWRlKHRoaXMudHJlZS5nZXRIVE1MRWxlbWVudCgpKTsgLy8gbWFrZSBzdXJlIHRoZSB0cmVlIGdvZXMgb3V0IG9mIHRoZSB0YWJpbmRleCB3b3JsZCBieSBoaWRpbmcgaXRcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlICYmIHRoaXMuZWxlbWVudHNUb1JlZnJlc2gubGVuZ3RoICYmIHRoaXMuZGF0YVByb3ZpZGVyKSB7XG5cdFx0XHRcdHRoaXMuZG9SZWZyZXNoKHRoaXMuZWxlbWVudHNUb1JlZnJlc2gpO1xuXHRcdFx0XHR0aGlzLmVsZW1lbnRzVG9SZWZyZXNoID0gW107XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c2V0VGltZW91dDAoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZGF0YVByb3ZpZGVyKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHRoaXMuaXNWaXNpYmxlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdHRoaXMuYWN0aXZhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWN0aXZhdGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBhY3RpdmF0ZSgpOiB2b2lkO1xuXG5cdGZvY3VzKHJldmVhbDogYm9vbGVhbiA9IHRydWUsIHJldmVhbEl0ZW0/OiBJVHJlZUl0ZW0pOiB2b2lkIHtcblx0XHRpZiAodGhpcy50cmVlICYmIHRoaXMucm9vdC5jaGlsZHJlbiAmJiB0aGlzLnJvb3QuY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBjdXJyZW50IHNlbGVjdGVkIGVsZW1lbnQgaXMgcmV2ZWFsZWRcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSByZXZlYWxJdGVtID8/IHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKVswXTtcblx0XHRcdGlmIChlbGVtZW50ICYmIHJldmVhbCkge1xuXHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKGVsZW1lbnQsIDAuNSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFBhc3MgRm9jdXMgdG8gVmlld2VyXG5cdFx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMudHJlZSAmJiB0aGlzLnRyZWVDb250YWluZXIgJiYgIXRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGUnKSkge1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHNob3coY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHRET00uYXBwZW5kKGNvbnRhaW5lciwgdGhpcy5kb21Ob2RlKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlKCkge1xuXHRcdHRoaXMuZG9tTm9kZSA9IERPTS4kKCcudHJlZS1leHBsb3Jlci12aWV3bGV0LXRyZWUtdmlldycpO1xuXHRcdHRoaXMubWVzc2FnZUVsZW1lbnQgPSBET00uYXBwZW5kKHRoaXMuZG9tTm9kZSwgRE9NLiQoJy5tZXNzYWdlJykpO1xuXHRcdHRoaXMudXBkYXRlTWVzc2FnZSgpO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5kb21Ob2RlLCBET00uJCgnLmN1c3RvbXZpZXctdHJlZScpKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZmlsZS1pY29uLXRoZW1hYmxlLXRyZWUnLCAnc2hvdy1maWxlLWljb25zJyk7XG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoRE9NLnRyYWNrRm9jdXModGhpcy5kb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5mb2N1c2VkID0gdHJ1ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4gdGhpcy5mb2N1c2VkID0gZmFsc2UpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgdHJlZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcm90ZWN0ZWQgY3JlYXRlVHJlZSgpIHtcblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IGFjdGlvblZpZXdJdGVtUHJvdmlkZXIgPSBjcmVhdGVBY3Rpb25WaWV3SXRlbS5iaW5kKHVuZGVmaW5lZCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdHJlZU1lbnVzID0gdGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZU1lbnVzLCB0aGlzLmlkKSk7XG5cdFx0dGhpcy50cmVlTGFiZWxzID0gdGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHRoaXMpKTtcblx0XHRjb25zdCBkYXRhU291cmNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlRGF0YVNvdXJjZSwgdGhpcywgPFQ+KHRhc2s6IFByb21pc2U8VD4pID0+IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiB0aGlzLmlkIH0sICgpID0+IHRhc2spKTtcblx0XHRjb25zdCBhbGlnbmVyID0gdGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKG5ldyBBbGlnbmVyKHRoaXMudGhlbWVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBjaGVja2JveFN0YXRlSGFuZGxlciA9IHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZChuZXcgQ2hlY2tib3hTdGF0ZUhhbmRsZXIoKSk7XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlUmVuZGVyZXIsIHRoaXMuaWQsIHRyZWVNZW51cywgdGhpcy50cmVlTGFiZWxzLCBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyLCBhbGlnbmVyLCBjaGVja2JveFN0YXRlSGFuZGxlciwgKCkgPT4gdGhpcy5tYW51YWxseU1hbmFnZUNoZWNrYm94ZXMpKTtcblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQocmVuZGVyZXIub25EaWRDaGFuZ2VDaGVja2JveFN0YXRlKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlLmZpcmUoZSkpKTtcblxuXHRcdGNvbnN0IHdpZGdldEFyaWFMYWJlbCA9IHRoaXMuX3RpdGxlO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJlZSwgdGhpcy5pZCwgdGhpcy50cmVlQ29udGFpbmVyISwgbmV3IFRyZWVWaWV3RGVsZWdhdGUoKSwgW3JlbmRlcmVyXSxcblx0XHRcdGRhdGFTb3VyY2UsIHtcblx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IG5ldyBUcmVlVmlld0lkZW50aXR5UHJvdmlkZXIoKSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSVRyZWVJdGVtKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24ubGFiZWw7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGlzU3RyaW5nKGVsZW1lbnQudG9vbHRpcCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cmVlTWVudXMuZ2V0UmVzb3VyY2VBY3Rpb25zKFtlbGVtZW50XSkubGVuZ3RoID4gMCA/IGxvY2FsaXplKCd0cmVlQXJpYUxhYmVsSGFzQWN0aW9uc1Rvb2x0aXAnLCBcInswfSwgaGFzIGFjdGlvbnNcIiwgZWxlbWVudC50b29sdGlwKSA6IGVsZW1lbnQudG9vbHRpcDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQucmVzb3VyY2VVcmkgJiYgIWVsZW1lbnQubGFiZWwpIHtcblx0XHRcdFx0XHRcdFx0Ly8gVGhlIGN1c3RvbSB0cmVlIGhhcyBubyBnb29kIGluZm9ybWF0aW9uIG9uIHdoYXQgc2hvdWxkIGJlIHVzZWQgZm9yIHRoZSBhcmlhIGxhYmVsLlxuXHRcdFx0XHRcdFx0XHQvLyBBbGxvdyB0aGUgdHJlZSB3aWRnZXQncyBkZWZhdWx0IGFyaWEgbGFiZWwgdG8gYmUgdXNlZC5cblx0XHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRsZXQgYnVpbGRBcmlhTGFiZWw6IHN0cmluZyA9ICcnO1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQubGFiZWwpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbGFiZWxUZXh0ID0gaXNNYXJrZG93blN0cmluZyhlbGVtZW50LmxhYmVsLmxhYmVsKSA/IGVsZW1lbnQubGFiZWwubGFiZWwudmFsdWUgOiBlbGVtZW50LmxhYmVsLmxhYmVsO1xuXHRcdFx0XHRcdFx0XHRidWlsZEFyaWFMYWJlbCArPSBsYWJlbFRleHQgKyAnICc7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0XHRidWlsZEFyaWFMYWJlbCArPSBlbGVtZW50LmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHRyZWVNZW51cy5nZXRSZXNvdXJjZUFjdGlvbnMoW2VsZW1lbnRdKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdGJ1aWxkQXJpYUxhYmVsID0gYnVpbGRBcmlhTGFiZWwgPyBsb2NhbGl6ZSgndHJlZUFyaWFMYWJlbEhhc0FjdGlvbnNTdWZmaXgnLCBcInswfSwgaGFzIGFjdGlvbnNcIiwgYnVpbGRBcmlhTGFiZWwudHJpbSgpKSA6IGxvY2FsaXplKCd0cmVlQXJpYUxhYmVsSGFzQWN0aW9ucycsIFwiaGFzIGFjdGlvbnNcIik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gYnVpbGRBcmlhTGFiZWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRSb2xlKGVsZW1lbnQ6IElUcmVlSXRlbSk6IEFyaWFSb2xlIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24/LnJvbGUgPz8gJ3RyZWVpdGVtJztcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuIHdpZGdldEFyaWFMYWJlbDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChpdGVtOiBJVHJlZUl0ZW0pID0+IHtcblx0XHRcdFx0XHRpZiAoaXRlbS5sYWJlbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGlzTWFya2Rvd25TdHJpbmcoaXRlbS5sYWJlbC5sYWJlbCkgPyBpdGVtLmxhYmVsLmxhYmVsLnZhbHVlIDogaXRlbS5sYWJlbC5sYWJlbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGl0ZW0ucmVzb3VyY2VVcmkgPyBiYXNlbmFtZShVUkkucmV2aXZlKGl0ZW0ucmVzb3VyY2VVcmkpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogKGU6IElUcmVlSXRlbSkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gISFlLmNvbW1hbmQgfHwgISFlLmNoZWNrYm94IHx8IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3NpbmdsZUNsaWNrJyB8ICdkb3VibGVDbGljayc+KCd3b3JrYmVuY2gudHJlZS5leHBhbmRNb2RlJykgPT09ICdkb3VibGVDbGljayc7XG5cdFx0XHR9LFxuXHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IChlOiBJVHJlZUl0ZW0pOiBib29sZWFuID0+IHtcblx0XHRcdFx0cmV0dXJuIGUuY29sbGFwc2libGVTdGF0ZSAhPT0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkO1xuXHRcdFx0fSxcblx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogdGhpcy5jYW5TZWxlY3RNYW55LFxuXHRcdFx0ZG5kOiB0aGlzLnRyZWVWaWV3RG5kLFxuXHRcdFx0b3ZlcnJpZGVTdHlsZXM6IGdldExvY2F0aW9uQmFzZWRWaWV3Q29sb3JzKHRoaXMudmlld0xvY2F0aW9uKS5saXN0T3ZlcnJpZGVTdHlsZXNcblx0XHR9KSk7XG5cblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQocmVuZGVyZXIub25EaWRDaGFuZ2VNZW51Q29udGV4dChlID0+IGUuZm9yRWFjaChlID0+IHRoaXMudHJlZT8ucmVyZW5kZXIoZSkpKSk7XG5cblx0XHR0aGlzLnRyZWVEaXNwb3NhYmxlcy5hZGQodGhpcy50cmVlKTtcblx0XHR0cmVlTWVudXMuc2V0Q29udGV4dEtleVNlcnZpY2UodGhpcy50cmVlLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRhbGlnbmVyLnRyZWUgPSB0aGlzLnRyZWU7XG5cdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gdGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aXBsZVNlbGVjdGlvbkFjdGlvblJ1bm5lcih0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsICgpID0+IHRoaXMudHJlZSEuZ2V0U2VsZWN0aW9uKCkpKTtcblx0XHRyZW5kZXJlci5hY3Rpb25SdW5uZXIgPSBhY3Rpb25SdW5uZXI7XG5cblx0XHR0aGlzLnRyZWUuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KHRoaXMuaWQsIHRydWUpO1xuXHRcdGNvbnN0IGN1c3RvbVRyZWVLZXkgPSBSYXdDdXN0b21UcmVlVmlld0NvbnRleHRLZXkuYmluZFRvKHRoaXMudHJlZS5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y3VzdG9tVHJlZUtleS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KHRyZWVNZW51cywgZSwgYWN0aW9uUnVubmVyKSkpO1xuXG5cdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHtcblx0XHRcdHRoaXMubGFzdFNlbGVjdGlvbiA9IGUuZWxlbWVudHM7XG5cdFx0XHR0aGlzLmxhc3RBY3RpdmUgPSB0aGlzLnRyZWU/LmdldEZvY3VzKClbMF0gPz8gdGhpcy5sYXN0QWN0aXZlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb25BbmRGb2N1cy5maXJlKHsgc2VsZWN0aW9uOiB0aGlzLmxhc3RTZWxlY3Rpb24sIGZvY3VzOiB0aGlzLmxhc3RBY3RpdmUgfSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRyZWUub25EaWRDaGFuZ2VGb2N1cyhlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnRzLmxlbmd0aCAmJiAoZS5lbGVtZW50c1swXSAhPT0gdGhpcy5sYXN0QWN0aXZlKSkge1xuXHRcdFx0XHR0aGlzLmxhc3RBY3RpdmUgPSBlLmVsZW1lbnRzWzBdO1xuXHRcdFx0XHR0aGlzLmxhc3RTZWxlY3Rpb24gPSB0aGlzLnRyZWU/LmdldFNlbGVjdGlvbigpID8/IHRoaXMubGFzdFNlbGVjdGlvbjtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb25BbmRGb2N1cy5maXJlKHsgc2VsZWN0aW9uOiB0aGlzLmxhc3RTZWxlY3Rpb24sIGZvY3VzOiB0aGlzLmxhc3RBY3RpdmUgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKGUgPT4ge1xuXHRcdFx0aWYgKCFlLm5vZGUuZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVsZW1lbnQ6IElUcmVlSXRlbSA9IEFycmF5LmlzQXJyYXkoZS5ub2RlLmVsZW1lbnQuZWxlbWVudCkgPyBlLm5vZGUuZWxlbWVudC5lbGVtZW50WzBdIDogZS5ub2RlLmVsZW1lbnQuZWxlbWVudDtcblx0XHRcdGlmIChlLm5vZGUuY29sbGFwc2VkKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ29sbGFwc2VJdGVtLmZpcmUoZWxlbWVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEV4cGFuZEl0ZW0uZmlyZShlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50cmVlLnNldElucHV0KHRoaXMucm9vdCkudGhlbigoKSA9PiB0aGlzLnVwZGF0ZUNvbnRlbnRBcmVhcygpKTtcblxuXHRcdHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRyZWUub25EaWRPcGVuKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRpZiAoIWUuYnJvd3NlckV2ZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmJyb3dzZXJFdmVudC50YXJnZXQgJiYgKGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkuY2xhc3NMaXN0LmNvbnRhaW5zKFRyZWVJdGVtQ2hlY2tib3guY2hlY2tib3hDbGFzcykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50cmVlIS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBhd2FpdCB0aGlzLnJlc29sdmVDb21tYW5kKHNlbGVjdGlvbi5sZW5ndGggPT09IDEgPyBzZWxlY3Rpb25bMF0gOiB1bmRlZmluZWQpO1xuXG5cdFx0XHRpZiAoY29tbWFuZCAmJiBpc1RyZWVDb21tYW5kRW5hYmxlZChjb21tYW5kLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdFx0XHRsZXQgYXJncyA9IGNvbW1hbmQuYXJndW1lbnRzIHx8IFtdO1xuXHRcdFx0XHRpZiAoY29tbWFuZC5pZCA9PT0gQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQgfHwgY29tbWFuZC5pZCA9PT0gQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCkge1xuXHRcdFx0XHRcdC8vIFNvbWUgY29tbWFuZHMgb3duZWQgYnkgdXMgc2hvdWxkIHJlY2VpdmUgdGhlXG5cdFx0XHRcdFx0Ly8gYElPcGVuRXZlbnRgIGFzIGNvbnRleHQgdG8gb3BlbiBwcm9wZXJseVxuXHRcdFx0XHRcdGFyZ3MgPSBbLi4uYXJncywgZV07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5pZCwgLi4uYXJncyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRyZWVNZW51cy5vbkRpZENoYW5nZSgoY2hhbmdlZCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMudHJlZT8uaGFzTm9kZShjaGFuZ2VkKSkge1xuXHRcdFx0XHR0aGlzLnRyZWU/LnJlcmVuZGVyKGNoYW5nZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUNvbW1hbmQoZWxlbWVudDogSVRyZWVJdGVtIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxUcmVlQ29tbWFuZCB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBjb21tYW5kID0gZWxlbWVudD8uY29tbWFuZDtcblx0XHRpZiAoZWxlbWVudCAmJiAhY29tbWFuZCkge1xuXHRcdFx0aWYgKChlbGVtZW50IGluc3RhbmNlb2YgUmVzb2x2YWJsZVRyZWVJdGVtKSAmJiBlbGVtZW50Lmhhc1Jlc29sdmUpIHtcblx0XHRcdFx0YXdhaXQgZWxlbWVudC5yZXNvbHZlKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRjb21tYW5kID0gZWxlbWVudC5jb21tYW5kO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY29tbWFuZDtcblx0fVxuXG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KHRyZWVNZW51czogVHJlZU1lbnVzLCB0cmVlRXZlbnQ6IElUcmVlQ29udGV4dE1lbnVFdmVudDxJVHJlZUl0ZW0+LCBhY3Rpb25SdW5uZXI6IE11bHRpcGxlU2VsZWN0aW9uQWN0aW9uUnVubmVyKTogdm9pZCB7XG5cdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKCk7XG5cdFx0Y29uc3Qgbm9kZTogSVRyZWVJdGVtIHwgbnVsbCA9IHRyZWVFdmVudC5lbGVtZW50O1xuXHRcdGlmIChub2RlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV2ZW50OiBVSUV2ZW50ID0gdHJlZUV2ZW50LmJyb3dzZXJFdmVudDtcblxuXHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHR0aGlzLnRyZWUhLnNldEZvY3VzKFtub2RlXSk7XG5cdFx0bGV0IHNlbGVjdGVkID0gdGhpcy5jYW5TZWxlY3RNYW55ID8gdGhpcy5nZXRTZWxlY3Rpb24oKSA6IFtdO1xuXHRcdGlmICghc2VsZWN0ZWQuZmluZChpdGVtID0+IGl0ZW0uaGFuZGxlID09PSBub2RlLmhhbmRsZSkpIHtcblx0XHRcdHNlbGVjdGVkID0gW25vZGVdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnMgPSB0cmVlTWVudXMuZ2V0UmVzb3VyY2VDb250ZXh0QWN0aW9ucyhzZWxlY3RlZCk7XG5cdFx0aWYgKCFhY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0cmVlRXZlbnQuYW5jaG9yLFxuXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXG5cdFx0XHRnZXRBY3Rpb25WaWV3SXRlbTogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBBY3Rpb25WaWV3SXRlbShhY3Rpb24sIGFjdGlvbiwgeyBsYWJlbDogdHJ1ZSwga2V5YmluZGluZzoga2V5YmluZGluZy5nZXRMYWJlbCgpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkhpZGU6ICh3YXNDYW5jZWxsZWQ/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmICh3YXNDYW5jZWxsZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUhLmRvbUZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiAoeyAkdHJlZVZpZXdJZDogdGhpcy5pZCwgJHRyZWVJdGVtSGFuZGxlOiBub2RlLmhhbmRsZSB9IHNhdGlzZmllcyBUcmVlVmlld0l0ZW1IYW5kbGVBcmcpLFxuXG5cdFx0XHRhY3Rpb25SdW5uZXJcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVNZXNzYWdlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tZXNzYWdlKSB7XG5cdFx0XHR0aGlzLnNob3dNZXNzYWdlKHRoaXMuX21lc3NhZ2UpO1xuXHRcdH0gZWxzZSBpZiAoIXRoaXMuZGF0YVByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLnNob3dNZXNzYWdlKG5vRGF0YVByb3ZpZGVyTWVzc2FnZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaGlkZU1lc3NhZ2UoKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVDb250ZW50QXJlYXMoKTtcblx0fVxuXG5cdHByaXZhdGUgcHJvY2Vzc01lc3NhZ2UobWVzc2FnZTogSU1hcmtkb3duU3RyaW5nLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGxpbmVzID0gbWVzc2FnZS52YWx1ZS5zcGxpdCgnXFxuJyk7XG5cdFx0Y29uc3QgcmVzdWx0OiAoSVJlbmRlcmVkTWFya2Rvd24gfCBIVE1MRWxlbWVudClbXSA9IFtdO1xuXHRcdGxldCBoYXNGb3VuZEJ1dHRvbiA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0Y29uc3QgbGlua2VkVGV4dCA9IHBhcnNlTGlua2VkVGV4dChsaW5lKTtcblxuXHRcdFx0aWYgKGxpbmtlZFRleHQubm9kZXMubGVuZ3RoID09PSAxICYmIHR5cGVvZiBsaW5rZWRUZXh0Lm5vZGVzWzBdICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCBub2RlID0gbGlua2VkVGV4dC5ub2Rlc1swXTtcblx0XHRcdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGJ1dHRvbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdidXR0b24tY29udGFpbmVyJyk7XG5cdFx0XHRcdGNvbnN0IGJ1dHRvbiA9IG5ldyBCdXR0b24oYnV0dG9uQ29udGFpbmVyLCB7IHRpdGxlOiBub2RlLnRpdGxlLCBzZWNvbmRhcnk6IGhhc0ZvdW5kQnV0dG9uLCBzdXBwb3J0SWNvbnM6IHRydWUsIC4uLmRlZmF1bHRCdXR0b25TdHlsZXMgfSk7XG5cdFx0XHRcdGJ1dHRvbi5sYWJlbCA9IG5vZGUubGFiZWw7XG5cdFx0XHRcdGJ1dHRvbi5vbkRpZENsaWNrKF8gPT4ge1xuXHRcdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKG5vZGUuaHJlZiwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHRcdFx0XHR9LCBudWxsLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRcdFx0Y29uc3QgaHJlZiA9IFVSSS5wYXJzZShub2RlLmhyZWYpO1xuXHRcdFx0XHRpZiAoaHJlZi5zY2hlbWUgPT09IFNjaGVtYXMuY29tbWFuZCkge1xuXHRcdFx0XHRcdGNvbnN0IHByZUNvbmRpdGlvbnMgPSBjb21tYW5kUHJlY29uZGl0aW9ucyhocmVmLnBhdGgpO1xuXHRcdFx0XHRcdGlmIChwcmVDb25kaXRpb25zKSB7XG5cdFx0XHRcdFx0XHRidXR0b24uZW5hYmxlZCA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhwcmVDb25kaXRpb25zKTtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUobmV3IFNldChwcmVDb25kaXRpb25zLmtleXMoKSkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0YnV0dG9uLmVuYWJsZWQgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMocHJlQ29uZGl0aW9ucyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYnV0dG9uKTtcblx0XHRcdFx0aGFzRm91bmRCdXR0b24gPSB0cnVlO1xuXHRcdFx0XHRyZXN1bHQucHVzaChidXR0b25Db250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGFzRm91bmRCdXR0b24gPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZWQgPSB0aGlzLm1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLnJlbmRlcihuZXcgTWFya2Rvd25TdHJpbmcobGluZSwgeyBpc1RydXN0ZWQ6IG1lc3NhZ2UuaXNUcnVzdGVkLCBzdXBwb3J0VGhlbWVJY29uczogbWVzc2FnZS5zdXBwb3J0VGhlbWVJY29ucywgc3VwcG9ydEh0bWw6IG1lc3NhZ2Uuc3VwcG9ydEh0bWwgfSkpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChyZW5kZXJlZC5lbGVtZW50KTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgncmVuZGVyZWQtbWVzc2FnZScpO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2YgcmVzdWx0KSB7XG5cdFx0XHRpZiAoRE9NLmlzSFRNTEVsZW1lbnQoY2hpbGQpKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChjaGlsZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY2hpbGQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIHNob3dNZXNzYWdlKG1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChpc1JlbmRlcmVkTWVzc2FnZVZhbHVlKHRoaXMuX21lc3NhZ2VWYWx1ZSkpIHtcblx0XHRcdHRoaXMuX21lc3NhZ2VWYWx1ZS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGlmIChpc01hcmtkb3duU3RyaW5nKG1lc3NhZ2UpKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkTWVzc2FnZSA9IHRoaXMucHJvY2Vzc01lc3NhZ2UobWVzc2FnZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5fbWVzc2FnZVZhbHVlID0geyBlbGVtZW50OiByZW5kZXJlZE1lc3NhZ2UsIGRpc3Bvc2FibGVzIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21lc3NhZ2VWYWx1ZSA9IG1lc3NhZ2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5tZXNzYWdlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblx0XHR0aGlzLnJlc2V0TWVzc2FnZUVsZW1lbnQoKTtcblx0XHRpZiAodHlwZW9mIHRoaXMuX21lc3NhZ2VWYWx1ZSA9PT0gJ3N0cmluZycgJiYgIWlzRmFsc3lPcldoaXRlc3BhY2UodGhpcy5fbWVzc2FnZVZhbHVlKSkge1xuXHRcdFx0dGhpcy5tZXNzYWdlRWxlbWVudC50ZXh0Q29udGVudCA9IHRoaXMuX21lc3NhZ2VWYWx1ZTtcblx0XHR9IGVsc2UgaWYgKGlzUmVuZGVyZWRNZXNzYWdlVmFsdWUodGhpcy5fbWVzc2FnZVZhbHVlKSkge1xuXHRcdFx0dGhpcy5tZXNzYWdlRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl9tZXNzYWdlVmFsdWUuZWxlbWVudCk7XG5cdFx0fVxuXHRcdHRoaXMubGF5b3V0KHRoaXMuX2hlaWdodCwgdGhpcy5fd2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlTWVzc2FnZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlc2V0TWVzc2FnZUVsZW1lbnQoKTtcblx0XHR0aGlzLm1lc3NhZ2VFbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0dGhpcy5sYXlvdXQodGhpcy5faGVpZ2h0LCB0aGlzLl93aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIHJlc2V0TWVzc2FnZUVsZW1lbnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVzc2FnZUVsZW1lbnQpIHtcblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5tZXNzYWdlRWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGVpZ2h0OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF93aWR0aDogbnVtYmVyID0gMDtcblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKSB7XG5cdFx0aWYgKGhlaWdodCAmJiB3aWR0aCAmJiB0aGlzLm1lc3NhZ2VFbGVtZW50ICYmIHRoaXMudHJlZUNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5faGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdFx0dGhpcy5fd2lkdGggPSB3aWR0aDtcblx0XHRcdGNvbnN0IHRyZWVIZWlnaHQgPSBoZWlnaHQgLSBET00uZ2V0VG90YWxIZWlnaHQodGhpcy5tZXNzYWdlRWxlbWVudCk7XG5cdFx0XHR0aGlzLnRyZWVDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gdHJlZUhlaWdodCArICdweCc7XG5cdFx0XHR0aGlzLnRyZWU/LmxheW91dCh0cmVlSGVpZ2h0LCB3aWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0T3B0aW1hbFdpZHRoKCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0Y29uc3QgcGFyZW50Tm9kZSA9IHRoaXMudHJlZS5nZXRIVE1MRWxlbWVudCgpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBjaGlsZE5vZGVzID0gKFtdIGFzIEhUTUxFbGVtZW50W10pLnNsaWNlLmNhbGwocGFyZW50Tm9kZS5xdWVyeVNlbGVjdG9yQWxsKCcub3V0bGluZS1pdGVtLWxhYmVsID4gYScpKTtcblx0XHRcdHJldHVybiBET00uZ2V0TGFyZ2VzdENoaWxkV2lkdGgocGFyZW50Tm9kZSwgY2hpbGROb2Rlcyk7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGVja2JveGVzKGVsZW1lbnRzOiByZWFkb25seSBJVHJlZUl0ZW1bXSk6IElUcmVlSXRlbVtdIHtcblx0XHRyZXR1cm4gc2V0Q2FzY2FkaW5nQ2hlY2tib3hVcGRhdGVzKGVsZW1lbnRzKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2goZWxlbWVudHM/OiByZWFkb25seSBJVHJlZUl0ZW1bXSwgY2hlY2tib3hlcz86IHJlYWRvbmx5IElUcmVlSXRlbVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZGF0YVByb3ZpZGVyICYmIHRoaXMudHJlZSkge1xuXHRcdFx0aWYgKHRoaXMucmVmcmVzaGluZykge1xuXHRcdFx0XHRhd2FpdCBFdmVudC50b1Byb21pc2UodGhpcy5fb25EaWRDb21wbGV0ZVJlZnJlc2guZXZlbnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFlbGVtZW50cykge1xuXHRcdFx0XHRlbGVtZW50cyA9IFt0aGlzLnJvb3RdO1xuXHRcdFx0XHQvLyByZW1vdmUgYWxsIHdhaXRpbmcgZWxlbWVudHMgdG8gcmVmcmVzaCBpZiByb290IGlzIGFza2VkIHRvIHJlZnJlc2hcblx0XHRcdFx0dGhpcy5lbGVtZW50c1RvUmVmcmVzaCA9IFtdO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRcdGVsZW1lbnQuY2hpbGRyZW4gPSB1bmRlZmluZWQ7IC8vIHJlc2V0IGNoaWxkcmVuXG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5pc1Zpc2libGUpIHtcblx0XHRcdFx0Y29uc3QgYWZmZWN0ZWRFbGVtZW50cyA9IHRoaXMudXBkYXRlQ2hlY2tib3hlcyhjaGVja2JveGVzID8/IFtdKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZG9SZWZyZXNoKGVsZW1lbnRzLmNvbmNhdChhZmZlY3RlZEVsZW1lbnRzKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5lbGVtZW50c1RvUmVmcmVzaC5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBzZWVuOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHRcdHRoaXMuZWxlbWVudHNUb1JlZnJlc2guZm9yRWFjaChlbGVtZW50ID0+IHNlZW4uYWRkKGVsZW1lbnQuaGFuZGxlKSk7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKGVsZW1lbnQuaGFuZGxlKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmVsZW1lbnRzVG9SZWZyZXNoLnB1c2goZWxlbWVudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZWxlbWVudHNUb1JlZnJlc2gucHVzaCguLi5lbGVtZW50cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGV4cGFuZChpdGVtT3JJdGVtczogSVRyZWVJdGVtIHwgSVRyZWVJdGVtW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0cmVlID0gdGhpcy50cmVlO1xuXHRcdGlmICghdHJlZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0aXRlbU9ySXRlbXMgPSBBcnJheS5pc0FycmF5KGl0ZW1Pckl0ZW1zKSA/IGl0ZW1Pckl0ZW1zIDogW2l0ZW1Pckl0ZW1zXTtcblx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBpdGVtT3JJdGVtcykge1xuXHRcdFx0XHRhd2FpdCB0cmVlLmV4cGFuZChlbGVtZW50LCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gVGhlIGV4dGVuc2lvbiBjb3VsZCBoYXZlIGNoYW5nZWQgdGhlIHRyZWUgZHVyaW5nIHRoZSByZXZlYWwuXG5cdFx0XHQvLyBCZWNhdXNlIG9mIHRoYXQsIHdlIGlnbm9yZSBlcnJvcnMuXG5cdFx0fVxuXHR9XG5cblx0aXNDb2xsYXBzZWQoaXRlbTogSVRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy50cmVlPy5pc0NvbGxhcHNlZChpdGVtKTtcblx0fVxuXG5cdHNldFNlbGVjdGlvbihpdGVtczogSVRyZWVJdGVtW10pOiB2b2lkIHtcblx0XHR0aGlzLnRyZWU/LnNldFNlbGVjdGlvbihpdGVtcyk7XG5cdH1cblxuXHRnZXRTZWxlY3Rpb24oKTogSVRyZWVJdGVtW10ge1xuXHRcdHJldHVybiB0aGlzLnRyZWU/LmdldFNlbGVjdGlvbigpID8/IFtdO1xuXHR9XG5cblx0c2V0Rm9jdXMoaXRlbT86IElUcmVlSXRlbSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRyZWUpIHtcblx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXModHJ1ZSwgaXRlbSk7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbaXRlbV0pO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnRyZWUuZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXZlYWwoaXRlbTogSVRyZWVJdGVtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudHJlZS5yZXZlYWwoaXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoaW5nOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgYXN5bmMgZG9SZWZyZXNoKGVsZW1lbnRzOiByZWFkb25seSBJVHJlZUl0ZW1bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRyZWUgPSB0aGlzLnRyZWU7XG5cdFx0aWYgKHRyZWUgJiYgdGhpcy52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hpbmcgPSB0cnVlO1xuXHRcdFx0Y29uc3Qgb2xkU2VsZWN0aW9uID0gdHJlZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKGVsZW1lbnRzLm1hcChlbGVtZW50ID0+IHRyZWUudXBkYXRlQ2hpbGRyZW4oZWxlbWVudCwgdHJ1ZSwgdHJ1ZSkpKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gV2hlbiBtdWx0aXBsZSBjYWxscyBhcmUgbWFkZSB0byByZWZyZXNoIHRoZSB0cmVlIGluIHF1aWNrIHN1Y2Nlc3Npb24sXG5cdFx0XHRcdC8vIHdlIGNhbiBnZXQgYSBcIlRyZWUgZWxlbWVudCBub3QgZm91bmRcIiBlcnJvci4gVGhpcyBpcyBleHBlY3RlZC5cblx0XHRcdFx0Ly8gSWRlYWxseSB0aGlzIGlzIGZpeGFibGUsIHNvIGxvZyBpbnN0ZWFkIG9mIGlnbm9yaW5nIHNvIHRoZSBlcnJvciBpcyBwcmVzZXJ2ZWQuXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5ld1NlbGVjdGlvbiA9IHRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAob2xkU2VsZWN0aW9uLmxlbmd0aCAhPT0gbmV3U2VsZWN0aW9uLmxlbmd0aCB8fCBvbGRTZWxlY3Rpb24uc29tZSgodmFsdWUsIGluZGV4KSA9PiB2YWx1ZS5oYW5kbGUgIT09IG5ld1NlbGVjdGlvbltpbmRleF0uaGFuZGxlKSkge1xuXHRcdFx0XHR0aGlzLmxhc3RTZWxlY3Rpb24gPSBuZXdTZWxlY3Rpb247XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uQW5kRm9jdXMuZmlyZSh7IHNlbGVjdGlvbjogdGhpcy5sYXN0U2VsZWN0aW9uLCBmb2N1czogdGhpcy5sYXN0QWN0aXZlIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZWZyZXNoaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9vbkRpZENvbXBsZXRlUmVmcmVzaC5maXJlKCk7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRBcmVhcygpO1xuXHRcdFx0aWYgKHRoaXMuZm9jdXNlZCkge1xuXHRcdFx0XHR0aGlzLmZvY3VzKGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMudXBkYXRlQ29sbGFwc2VBbGxUb2dnbGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemVDb2xsYXBzZUFsbFRvZ2dsZSgpIHtcblx0XHRpZiAoIXRoaXMuY29sbGFwc2VBbGxUb2dnbGVDb250ZXh0KSB7XG5cdFx0XHR0aGlzLmNvbGxhcHNlQWxsVG9nZ2xlQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KGB0cmVlVmlldy4ke3RoaXMuaWR9LnRvZ2dsZUNvbGxhcHNlQWxsYCwgZmFsc2UsIGxvY2FsaXplKCd0cmVlVmlldy50b2dnbGVDb2xsYXBzZUFsbCcsIFwiV2hldGhlciBjb2xsYXBzZSBhbGwgaXMgdG9nZ2xlZCBmb3IgdGhlIHRyZWUgdmlldyB3aXRoIGlkIHswfS5cIiwgdGhpcy5pZCkpO1xuXHRcdFx0dGhpcy5jb2xsYXBzZUFsbFRvZ2dsZUNvbnRleHQgPSB0aGlzLmNvbGxhcHNlQWxsVG9nZ2xlQ29udGV4dEtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb2xsYXBzZUFsbFRvZ2dsZSgpIHtcblx0XHRpZiAodGhpcy5zaG93Q29sbGFwc2VBbGxBY3Rpb24pIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6ZUNvbGxhcHNlQWxsVG9nZ2xlKCk7XG5cdFx0XHR0aGlzLmNvbGxhcHNlQWxsVG9nZ2xlQ29udGV4dD8uc2V0KCEhdGhpcy5yb290LmNoaWxkcmVuICYmICh0aGlzLnJvb3QuY2hpbGRyZW4ubGVuZ3RoID4gMCkgJiZcblx0XHRcdFx0dGhpcy5yb290LmNoaWxkcmVuLnNvbWUodmFsdWUgPT4gdmFsdWUuY29sbGFwc2libGVTdGF0ZSAhPT0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbnRlbnRBcmVhcygpOiB2b2lkIHtcblx0XHRjb25zdCBpc1RyZWVFbXB0eSA9ICF0aGlzLnJvb3QuY2hpbGRyZW4gfHwgdGhpcy5yb290LmNoaWxkcmVuLmxlbmd0aCA9PT0gMDtcblx0XHQvLyBIaWRlIHRyZWUgY29udGFpbmVyIG9ubHkgd2hlbiB0aGVyZSBpcyBhIG1lc3NhZ2UgYW5kIHRyZWUgaXMgZW1wdHkgYW5kIG5vdCByZWZyZXNoaW5nXG5cdFx0aWYgKHRoaXMuX21lc3NhZ2VWYWx1ZSAmJiBpc1RyZWVFbXB0eSAmJiAhdGhpcy5yZWZyZXNoaW5nICYmIHRoaXMudHJlZUNvbnRhaW5lcikge1xuXHRcdFx0Ly8gSWYgdGhlcmUncyBhIGRuZCBjb250cm9sbGVyIHRoZW4gaGlkaW5nIHRoZSB0cmVlIHByZXZlbnRzIGl0IGZyb20gYmVpbmcgZHJhZ2dlZCBpbnRvLlxuXHRcdFx0aWYgKCF0aGlzLmRyYWdBbmREcm9wQ29udHJvbGxlcikge1xuXHRcdFx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgndGFiaW5kZXgnLCAnMCcpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy50cmVlQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdFx0aWYgKHRoaXMuZG9tTm9kZSA9PT0gRE9NLmdldEFjdGl2ZUVsZW1lbnQoKSkge1xuXHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKCd0YWJpbmRleCcpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBjb250YWluZXIoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXI7XG5cdH1cbn1cblxuY2xhc3MgVHJlZVZpZXdJZGVudGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUlkZW50aXR5UHJvdmlkZXI8SVRyZWVJdGVtPiB7XG5cdGdldElkKGVsZW1lbnQ6IElUcmVlSXRlbSk6IHsgdG9TdHJpbmcoKTogc3RyaW5nIH0ge1xuXHRcdHJldHVybiBlbGVtZW50LmhhbmRsZTtcblx0fVxufVxuXG5jbGFzcyBUcmVlVmlld0RlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SVRyZWVJdGVtPiB7XG5cblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IElUcmVlSXRlbSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIFRyZWVSZW5kZXJlci5JVEVNX0hFSUdIVDtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogSVRyZWVJdGVtKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gVHJlZVJlbmRlcmVyLlRSRUVfVEVNUExBVEVfSUQ7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZG9HZXRDaGlsZHJlbk9yQmF0Y2goZGF0YVByb3ZpZGVyOiBJVHJlZVZpZXdEYXRhUHJvdmlkZXIsIG5vZGVzOiBJVHJlZUl0ZW1bXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8KHJlYWRvbmx5IElUcmVlSXRlbVtdKVtdIHwgdW5kZWZpbmVkPiB7XG5cdGlmIChkYXRhUHJvdmlkZXIuZ2V0Q2hpbGRyZW5CYXRjaCkge1xuXHRcdHJldHVybiBkYXRhUHJvdmlkZXIuZ2V0Q2hpbGRyZW5CYXRjaChub2Rlcyk7XG5cdH0gZWxzZSB7XG5cdFx0aWYgKG5vZGVzKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwobm9kZXMubWFwKG5vZGUgPT4gZGF0YVByb3ZpZGVyLmdldENoaWxkcmVuKG5vZGUpLnRoZW4oY2hpbGRyZW4gPT4gY2hpbGRyZW4gPz8gW10pKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBbYXdhaXQgZGF0YVByb3ZpZGVyLmdldENoaWxkcmVuKCldLmZpbHRlcihjaGlsZHJlbiA9PiBjaGlsZHJlbiAhPT0gdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVHJlZURhdGFTb3VyY2UgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPElUcmVlSXRlbSwgSVRyZWVJdGVtPiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB0cmVlVmlldzogSVRyZWVWaWV3LFxuXHRcdHByaXZhdGUgd2l0aFByb2dyZXNzOiA8VD4odGFzazogUHJvbWlzZTxUPikgPT4gUHJvbWlzZTxUPlxuXHQpIHtcblx0fVxuXG5cdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IElUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMudHJlZVZpZXcuZGF0YVByb3ZpZGVyICYmIChlbGVtZW50LmNvbGxhcHNpYmxlU3RhdGUgIT09IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lKTtcblx0fVxuXG5cdHByaXZhdGUgYmF0Y2g6IElUcmVlSXRlbVtdIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGJhdGNoUHJvbWlzZTogUHJvbWlzZTwocmVhZG9ubHkgSVRyZWVJdGVtW10pW10gfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50OiBJVHJlZUl0ZW0pOiBQcm9taXNlPHJlYWRvbmx5IElUcmVlSXRlbVtdPiB7XG5cdFx0Y29uc3QgZGF0YVByb3ZpZGVyID0gdGhpcy50cmVlVmlldy5kYXRhUHJvdmlkZXI7XG5cdFx0aWYgKCFkYXRhUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYmF0Y2ggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5iYXRjaCA9IFtlbGVtZW50XTtcblx0XHRcdHRoaXMuYmF0Y2hQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmJhdGNoLnB1c2goZWxlbWVudCk7XG5cdFx0fVxuXHRcdGNvbnN0IGluZGV4SW5CYXRjaCA9IHRoaXMuYmF0Y2gubGVuZ3RoIC0gMTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8cmVhZG9ubHkgSVRyZWVJdGVtW10+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBiYXRjaCA9IHRoaXMuYmF0Y2g7XG5cdFx0XHRcdHRoaXMuYmF0Y2ggPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghdGhpcy5iYXRjaFByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLmJhdGNoUHJvbWlzZSA9IHRoaXMud2l0aFByb2dyZXNzKGRvR2V0Q2hpbGRyZW5PckJhdGNoKGRhdGFQcm92aWRlciwgYmF0Y2gpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYmF0Y2hQcm9taXNlO1xuXHRcdFx0XHRcdHJlc29sdmUoKHJlc3VsdCAmJiAoaW5kZXhJbkJhdGNoIDwgcmVzdWx0Lmxlbmd0aCkpID8gcmVzdWx0W2luZGV4SW5CYXRjaF0gOiBbXSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRpZiAoISg8c3RyaW5nPmUubWVzc2FnZSkuc3RhcnRzV2l0aCgnQmFkIHByb2dyZXNzIGxvY2F0aW9uOicpKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QoZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LCAwKTtcblx0XHR9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVRyZWVFeHBsb3JlclRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHJlc291cmNlTGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRyZWFkb25seSBpY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2hlY2tib3hDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRjaGVja2JveD86IFRyZWVJdGVtQ2hlY2tib3g7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xufVxuXG5jbGFzcyBUcmVlUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJVHJlZUl0ZW0sIEZ1enp5U2NvcmUsIElUcmVlRXhwbG9yZXJUZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IElURU1fSEVJR0hUID0gMjI7XG5cdHN0YXRpYyByZWFkb25seSBUUkVFX1RFTVBMQVRFX0lEID0gJ3RyZWVFeHBsb3Jlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlOiBFbWl0dGVyPHJlYWRvbmx5IElUcmVlSXRlbVtdPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElUcmVlSXRlbVtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlOiBFdmVudDxyZWFkb25seSBJVHJlZUl0ZW1bXT4gPSB0aGlzLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VNZW51Q29udGV4dDogRW1pdHRlcjxyZWFkb25seSBJVHJlZUl0ZW1bXT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJVHJlZUl0ZW1bXT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWVudUNvbnRleHQ6IEV2ZW50PHJlYWRvbmx5IElUcmVlSXRlbVtdPiA9IHRoaXMuX29uRGlkQ2hhbmdlTWVudUNvbnRleHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfYWN0aW9uUnVubmVyOiBNdWx0aXBsZVNlbGVjdGlvbkFjdGlvblJ1bm5lciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGU7XG5cdHByaXZhdGUgX2hhc0NoZWNrYm94OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlbmRlcmVkRWxlbWVudHMgPSBuZXcgTWFwPHN0cmluZywgeyBvcmlnaW5hbDogSVRyZWVOb2RlPElUcmVlSXRlbSwgRnV6enlTY29yZT47IHJlbmRlcmVkOiBJVHJlZUV4cGxvcmVyVGVtcGxhdGVEYXRhIH1bXT4oKTsgLy8gdHJlZSBpdGVtIGhhbmRsZSB0byB0ZW1wbGF0ZSBkYXRhXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB0cmVlVmlld0lkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBtZW51czogVHJlZU1lbnVzLFxuXHRcdHByaXZhdGUgbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRwcml2YXRlIGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyLFxuXHRcdHByaXZhdGUgYWxpZ25lcjogQWxpZ25lcixcblx0XHRwcml2YXRlIGNoZWNrYm94U3RhdGVIYW5kbGVyOiBDaGVja2JveFN0YXRlSGFuZGxlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1hbnVhbGx5TWFuYWdlQ2hlY2tib3hlczogKCkgPT4gYm9vbGVhbixcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5faG92ZXJEZWxlZ2F0ZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUsICdtb3VzZScsIHVuZGVmaW5lZCwge30pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5yZXJlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHRoaXMucmVyZW5kZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoZWNrYm94U3RhdGVIYW5kbGVyLm9uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZShpdGVtcyA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNoZWNrYm94ZXMoaXRlbXMpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHRoaXMub25EaWRDaGFuZ2VDb250ZXh0KGUpKSk7XG5cdH1cblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBUcmVlUmVuZGVyZXIuVFJFRV9URU1QTEFURV9JRDtcblx0fVxuXG5cdHNldCBhY3Rpb25SdW5uZXIoYWN0aW9uUnVubmVyOiBNdWx0aXBsZVNlbGVjdGlvbkFjdGlvblJ1bm5lcikge1xuXHRcdHRoaXMuX2FjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJVHJlZUV4cGxvcmVyVGVtcGxhdGVEYXRhIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY3VzdG9tLXZpZXctdHJlZS1ub2RlLWl0ZW0nKTtcblxuXHRcdGNvbnN0IGNoZWNrYm94Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcnKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VMYWJlbCA9IHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIGhvdmVyRGVsZWdhdGU6IHRoaXMuX2hvdmVyRGVsZWdhdGUgfSk7XG5cdFx0Y29uc3QgaWNvbiA9IERPTS5wcmVwZW5kKHJlc291cmNlTGFiZWwuZWxlbWVudCwgRE9NLiQoJy5jdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbS1pY29uJykpO1xuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBET00uYXBwZW5kKHJlc291cmNlTGFiZWwuZWxlbWVudCwgRE9NLiQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoYWN0aW9uc0NvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4geyByZXNvdXJjZUxhYmVsLCBpY29uLCBjaGVja2JveENvbnRhaW5lciwgYWN0aW9uQmFyLCBjb250YWluZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SG92ZXIobGFiZWw6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCwgcmVzb3VyY2U6IFVSSSB8IG51bGwsIG5vZGU6IElUcmVlSXRlbSk6IHN0cmluZyB8IElNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghKG5vZGUgaW5zdGFuY2VvZiBSZXNvbHZhYmxlVHJlZUl0ZW0pIHx8ICFub2RlLmhhc1Jlc29sdmUpIHtcblx0XHRcdGlmIChyZXNvdXJjZSAmJiAhbm9kZS50b29sdGlwKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2UgaWYgKG5vZGUudG9vbHRpcCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGlmIChpc01hcmtkb3duU3RyaW5nKGxhYmVsKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IG1hcmtkb3duOiBsYWJlbCwgbWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogbGFiZWwudmFsdWUgfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gbGFiZWw7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoIWlzU3RyaW5nKG5vZGUudG9vbHRpcCkpIHtcblx0XHRcdFx0cmV0dXJuIHsgbWFya2Rvd246IG5vZGUudG9vbHRpcCwgbWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogcmVzb3VyY2UgPyB1bmRlZmluZWQgOiByZW5kZXJBc1BsYWludGV4dChub2RlLnRvb2x0aXApIH07IC8vIFBhc3NpbmcgdW5kZWZpbmVkIGFzIHRoZSBmYWxsYmFjayBmb3IgYSByZXNvdXJjZSBmYWxscyBiYWNrIHRvIHRoZSBvbGQgbmF0aXZlIGhvdmVyXG5cdFx0XHR9IGVsc2UgaWYgKG5vZGUudG9vbHRpcCAhPT0gJycpIHtcblx0XHRcdFx0cmV0dXJuIG5vZGUudG9vbHRpcDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1hcmtkb3duOiB0eXBlb2Ygbm9kZS50b29sdGlwID09PSAnc3RyaW5nJyA/IG5vZGUudG9vbHRpcCA6XG5cdFx0XHRcdCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElNYXJrZG93blN0cmluZyB8IHN0cmluZyB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcgfCB1bmRlZmluZWQ+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdFx0XHRub2RlLnJlc29sdmUodG9rZW4pLnRoZW4oKCkgPT4gcmVzb2x2ZShub2RlLnRvb2x0aXApKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IHJlc291cmNlID8gdW5kZWZpbmVkIDogKGxhYmVsID8gKGlzTWFya2Rvd25TdHJpbmcobGFiZWwpID8gbGFiZWwudmFsdWUgOiBsYWJlbCkgOiAnJykgLy8gUGFzc2luZyB1bmRlZmluZWQgYXMgdGhlIGZhbGxiYWNrIGZvciBhIHJlc291cmNlIGZhbGxzIGJhY2sgdG8gdGhlIG9sZCBuYXRpdmUgaG92ZXJcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBwcm9jZXNzTGFiZWwobGFiZWw6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCwgbWF0Y2hlczogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlciB9W10gfCB1bmRlZmluZWQpOiB7IGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGJvbGQ/OiBib29sZWFuOyBpdGFsaWM/OiBib29sZWFuOyBzdHJpa2V0aHJvdWdoPzogYm9vbGVhbjsgc3VwcG9ydEljb25zPzogYm9vbGVhbiB9IHtcblx0XHRpZiAoIWlzTWFya2Rvd25TdHJpbmcobGFiZWwpKSB7XG5cdFx0XHRyZXR1cm4geyBsYWJlbCB9O1xuXHRcdH1cblxuXHRcdGxldCB0ZXh0ID0gbGFiZWwudmFsdWUudHJpbSgpO1xuXHRcdGxldCBib2xkID0gZmFsc2U7XG5cdFx0bGV0IGl0YWxpYyA9IGZhbHNlO1xuXHRcdGxldCBzdHJpa2V0aHJvdWdoID0gZmFsc2U7XG5cblx0XHRmdW5jdGlvbiBtb3ZlTWF0Y2hlcyhvZmZzZXQ6IG51bWJlcikge1xuXHRcdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG5cdFx0XHRcdFx0bWF0Y2guc3RhcnQgLT0gb2Zmc2V0O1xuXHRcdFx0XHRcdG1hdGNoLmVuZCAtPSBvZmZzZXQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzeW50YXhlcyA9IFtcblx0XHRcdHsgb3BlbjogJ35+JywgY2xvc2U6ICd+ficsIG1hcms6ICgpID0+IHsgc3RyaWtldGhyb3VnaCA9IHRydWU7IH0gfSxcblx0XHRcdHsgb3BlbjogJyoqJywgY2xvc2U6ICcqKicsIG1hcms6ICgpID0+IHsgYm9sZCA9IHRydWU7IH0gfSxcblx0XHRcdHsgb3BlbjogJyonLCBjbG9zZTogJyonLCBtYXJrOiAoKSA9PiB7IGl0YWxpYyA9IHRydWU7IH0gfSxcblx0XHRcdHsgb3BlbjogJ18nLCBjbG9zZTogJ18nLCBtYXJrOiAoKSA9PiB7IGl0YWxpYyA9IHRydWU7IH0gfVxuXHRcdF07XG5cblx0XHRmdW5jdGlvbiBjaGVja1N5bnRheGVzKCk6IGJvb2xlYW4ge1xuXHRcdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBzeW50YXggb2Ygc3ludGF4ZXMpIHtcblx0XHRcdFx0aWYgKHRleHQuc3RhcnRzV2l0aChzeW50YXgub3BlbikgJiYgdGV4dC5lbmRzV2l0aChzeW50YXguY2xvc2UpKSB7XG5cdFx0XHRcdFx0Ly8gSWYgdGhlcmUgaXMgYSBtYXRjaCB3aXRoaW4gdGhlIG1hcmtlcnMsIHN0b3AgcHJvY2Vzc2luZ1xuXHRcdFx0XHRcdGlmIChtYXRjaGVzPy5zb21lKG1hdGNoID0+IG1hdGNoLnN0YXJ0IDwgc3ludGF4Lm9wZW4ubGVuZ3RoIHx8IG1hdGNoLmVuZCA+IHRleHQubGVuZ3RoIC0gc3ludGF4LmNsb3NlLmxlbmd0aCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzeW50YXgubWFyaygpO1xuXHRcdFx0XHRcdHRleHQgPSB0ZXh0LnN1YnN0cmluZyhzeW50YXgub3Blbi5sZW5ndGgsIHRleHQubGVuZ3RoIC0gc3ludGF4LmNsb3NlLmxlbmd0aCk7XG5cdFx0XHRcdFx0bW92ZU1hdGNoZXMoc3ludGF4Lm9wZW4ubGVuZ3RoKTtcblx0XHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGlkQ2hhbmdlO1xuXHRcdH1cblxuXHRcdC8vIEFyYml0cmFyeSBtYXggIyBvZiBpdGVyYXRpb25zXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG5cdFx0XHRpZiAoIWNoZWNrU3ludGF4ZXMoKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGFiZWw6IHRleHQsXG5cdFx0XHRib2xkLFxuXHRcdFx0aXRhbGljLFxuXHRcdFx0c3RyaWtldGhyb3VnaCxcblx0XHRcdHN1cHBvcnRJY29uczogbGFiZWwuc3VwcG9ydFRoZW1lSWNvbnNcblx0XHR9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8SVRyZWVJdGVtLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVHJlZUV4cGxvcmVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9kZSA9IGVsZW1lbnQuZWxlbWVudDtcblx0XHRjb25zdCByZXNvdXJjZSA9IG5vZGUucmVzb3VyY2VVcmkgPyBVUkkucmV2aXZlKG5vZGUucmVzb3VyY2VVcmkpIDogbnVsbDtcblx0XHRjb25zdCB0cmVlSXRlbUxhYmVsOiBJVHJlZUl0ZW1MYWJlbCB8IHVuZGVmaW5lZCA9IG5vZGUubGFiZWwgPyBub2RlLmxhYmVsIDogKHJlc291cmNlID8geyBsYWJlbDogYmFzZW5hbWUocmVzb3VyY2UpIH0gOiB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gaXNTdHJpbmcobm9kZS5kZXNjcmlwdGlvbikgPyBub2RlLmRlc2NyaXB0aW9uIDogcmVzb3VyY2UgJiYgbm9kZS5kZXNjcmlwdGlvbiA9PT0gdHJ1ZSA/IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUocmVzb3VyY2UpLCB7IHJlbGF0aXZlOiB0cnVlIH0pIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxhYmVsU3RyID0gdHJlZUl0ZW1MYWJlbCA/IGlzTWFya2Rvd25TdHJpbmcodHJlZUl0ZW1MYWJlbC5sYWJlbCkgPyB0cmVlSXRlbUxhYmVsLmxhYmVsLnZhbHVlIDogdHJlZUl0ZW1MYWJlbC5sYWJlbCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtYXRjaGVzID0gKHRyZWVJdGVtTGFiZWw/LmhpZ2hsaWdodHMgJiYgbGFiZWxTdHIpID8gdHJlZUl0ZW1MYWJlbC5oaWdobGlnaHRzLm1hcCgoW3N0YXJ0LCBlbmRdKSA9PiB7XG5cdFx0XHRpZiAoc3RhcnQgPCAwKSB7XG5cdFx0XHRcdHN0YXJ0ID0gbGFiZWxTdHIubGVuZ3RoICsgc3RhcnQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW5kIDwgMCkge1xuXHRcdFx0XHRlbmQgPSBsYWJlbFN0ci5sZW5ndGggKyBlbmQ7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKHN0YXJ0ID49IGxhYmVsU3RyLmxlbmd0aCkgfHwgKGVuZCA+IGxhYmVsU3RyLmxlbmd0aCkpIHtcblx0XHRcdFx0cmV0dXJuICh7IHN0YXJ0OiAwLCBlbmQ6IDAgfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhcnQgPiBlbmQpIHtcblx0XHRcdFx0Y29uc3Qgc3dhcCA9IHN0YXJ0O1xuXHRcdFx0XHRzdGFydCA9IGVuZDtcblx0XHRcdFx0ZW5kID0gc3dhcDtcblx0XHRcdH1cblx0XHRcdHJldHVybiAoeyBzdGFydCwgZW5kIH0pO1xuXHRcdH0pIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHsgbGFiZWwsIGJvbGQsIGl0YWxpYywgc3RyaWtldGhyb3VnaCwgc3VwcG9ydEljb25zIH0gPSB0aGlzLnByb2Nlc3NMYWJlbCh0cmVlSXRlbUxhYmVsPy5sYWJlbCwgbWF0Y2hlcyk7XG5cdFx0Y29uc3QgaWNvbiA9ICFpc0RhcmsodGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpID8gbm9kZS5pY29uIDogbm9kZS5pY29uRGFyaztcblx0XHRjb25zdCBpY29uVXJsID0gaWNvbiA/IFVSSS5yZXZpdmUoaWNvbikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLmdldEhvdmVyKHRyZWVJdGVtTGFiZWw/LmxhYmVsLCByZXNvdXJjZSwgbm9kZSk7XG5cblx0XHQvLyByZXNldFxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5zdHlsZS5jb2xvciA9ICcnO1xuXG5cdFx0bGV0IGNvbW1hbmRFbmFibGVkID0gdHJ1ZTtcblx0XHRpZiAobm9kZS5jb21tYW5kKSB7XG5cdFx0XHRjb21tYW5kRW5hYmxlZCA9IGlzVHJlZUNvbW1hbmRFbmFibGVkKG5vZGUuY29tbWFuZCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJDaGVja2JveChub2RlLCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBmaWxlRGVjb3JhdGlvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgY29sb3JzOiBib29sZWFuOyBiYWRnZXM6IGJvb2xlYW4gfT4oJ2V4cGxvcmVyLmRlY29yYXRpb25zJyk7XG5cdFx0XHRjb25zdCBsYWJlbFJlc291cmNlID0gcmVzb3VyY2UgPyByZXNvdXJjZSA6IFVSSS5wYXJzZSgnbWlzc2luZzpfaWNvbl9yZXNvdXJjZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnJlc291cmNlTGFiZWwuc2V0UmVzb3VyY2UoeyBuYW1lOiBsYWJlbCwgZGVzY3JpcHRpb24sIHJlc291cmNlOiBsYWJlbFJlc291cmNlIH0sIHtcblx0XHRcdFx0ZmlsZUtpbmQ6IHRoaXMuZ2V0RmlsZUtpbmQobm9kZSksXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRoaWRlSWNvbjogdGhpcy5zaG91bGRIaWRlUmVzb3VyY2VMYWJlbEljb24oaWNvblVybCwgbm9kZS50aGVtZUljb24pLFxuXHRcdFx0XHRmaWxlRGVjb3JhdGlvbnMsXG5cdFx0XHRcdGV4dHJhQ2xhc3NlczogWydjdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbS1yZXNvdXJjZUxhYmVsJ10sXG5cdFx0XHRcdG1hdGNoZXM6IG1hdGNoZXMgPyBtYXRjaGVzIDogY3JlYXRlTWF0Y2hlcyhlbGVtZW50LmZpbHRlckRhdGEpLFxuXHRcdFx0XHRib2xkLFxuXHRcdFx0XHRpdGFsaWMsXG5cdFx0XHRcdHN0cmlrZXRocm91Z2gsXG5cdFx0XHRcdGRpc2FibGVkQ29tbWFuZDogIWNvbW1hbmRFbmFibGVkLFxuXHRcdFx0XHRsYWJlbEVzY2FwZU5ld0xpbmVzOiB0cnVlLFxuXHRcdFx0XHRmb3JjZUxhYmVsOiAhIW5vZGUubGFiZWwsXG5cdFx0XHRcdHN1cHBvcnRJY29uc1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5yZXNvdXJjZUxhYmVsLnNldFJlc291cmNlKHsgbmFtZTogbGFiZWwsIGRlc2NyaXB0aW9uIH0sIHtcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdGhpZGVJY29uOiB0cnVlLFxuXHRcdFx0XHRleHRyYUNsYXNzZXM6IFsnY3VzdG9tLXZpZXctdHJlZS1ub2RlLWl0ZW0tcmVzb3VyY2VMYWJlbCddLFxuXHRcdFx0XHRtYXRjaGVzOiBtYXRjaGVzID8gbWF0Y2hlcyA6IGNyZWF0ZU1hdGNoZXMoZWxlbWVudC5maWx0ZXJEYXRhKSxcblx0XHRcdFx0Ym9sZCxcblx0XHRcdFx0aXRhbGljLFxuXHRcdFx0XHRzdHJpa2V0aHJvdWdoLFxuXHRcdFx0XHRkaXNhYmxlZENvbW1hbmQ6ICFjb21tYW5kRW5hYmxlZCxcblx0XHRcdFx0bGFiZWxFc2NhcGVOZXdMaW5lczogdHJ1ZSxcblx0XHRcdFx0c3VwcG9ydEljb25zXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoaWNvblVybCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gJ2N1c3RvbS12aWV3LXRyZWUtbm9kZS1pdGVtLWljb24nO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gY3NzSnMuYXNDU1NVcmwoaWNvblVybCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxldCBpY29uQ2xhc3M6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLnNob3VsZFNob3dUaGVtZUljb24oISFyZXNvdXJjZSwgbm9kZS50aGVtZUljb24pKSB7XG5cdFx0XHRcdGljb25DbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShub2RlLnRoZW1lSWNvbik7XG5cdFx0XHRcdGlmIChub2RlLnRoZW1lSWNvbi5jb2xvcikge1xuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5pY29uLnN0eWxlLmNvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKG5vZGUudGhlbWVJY29uLmNvbG9yLmlkKT8udG9TdHJpbmcoKSA/PyAnJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpY29uQ2xhc3MgPSBpY29uQ2xhc3MgKyAnIGNvZGljb24tY29sb3JlZCc7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9IGljb25DbGFzcyA/IGBjdXN0b20tdmlldy10cmVlLW5vZGUtaXRlbS1pY29uICR7aWNvbkNsYXNzfWAgOiAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS5pY29uLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXHRcdH1cblxuXHRcdGlmICghY29tbWFuZEVuYWJsZWQpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9IHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSArICcgZGlzYWJsZWQnO1xuXHRcdFx0aWYgKHRlbXBsYXRlRGF0YS5jb250YWluZXIucGFyZW50RWxlbWVudCkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnBhcmVudEVsZW1lbnQuY2xhc3NOYW1lID0gdGVtcGxhdGVEYXRhLmNvbnRhaW5lci5wYXJlbnRFbGVtZW50LmNsYXNzTmFtZSArICcgZGlzYWJsZWQnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IHsgJHRyZWVWaWV3SWQ6IHRoaXMudHJlZVZpZXdJZCwgJHRyZWVJdGVtSGFuZGxlOiBub2RlLmhhbmRsZSB9IHNhdGlzZmllcyBUcmVlVmlld0l0ZW1IYW5kbGVBcmc7XG5cblx0XHRjb25zdCBtZW51QWN0aW9ucyA9IHRoaXMubWVudXMuZ2V0UmVzb3VyY2VBY3Rpb25zKFtub2RlXSk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKG1lbnVBY3Rpb25zLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdC8vIEFzc29jaWF0ZSB0aGUgaW5saW5lIHRvb2xiYXIgd2l0aCB0aGUgdHJlZSBpdGVtIHNvIHNjcmVlbiByZWFkZXJzXG5cdFx0Ly8gYW5ub3VuY2Ugd2hpY2ggaXRlbSB0aGUgYWN0aW9ucyBiZWxvbmcgdG8gd2hlbiBmb2N1cyBtb3ZlcyB0byB0aGVtLlxuXHRcdGlmIChtZW51QWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBpdGVtTmFtZSA9IFtsYWJlbCwgZGVzY3JpcHRpb25dLmZpbHRlcigocGFydCk6IHBhcnQgaXMgc3RyaW5nID0+ICEhcGFydCkuam9pbignICcpLnRyaW0oKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuc2V0QXJpYUxhYmVsKGl0ZW1OYW1lID8gbG9jYWxpemUoJ3RyZWVBY3Rpb25CYXJBcmlhTGFiZWwnLCBcIkFjdGlvbnMgZm9yIHswfVwiLCBpdGVtTmFtZSkgOiBsb2NhbGl6ZSgndHJlZUFjdGlvbkJhckFyaWFMYWJlbE5vTmFtZScsIFwiQWN0aW9uc1wiKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuc2V0QXJpYUxhYmVsKCcnKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fYWN0aW9uUnVubmVyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmFjdGlvblJ1bm5lciA9IHRoaXMuX2FjdGlvblJ1bm5lcjtcblx0XHR9XG5cdFx0dGhpcy5zZXRBbGlnbm1lbnQodGVtcGxhdGVEYXRhLmNvbnRhaW5lciwgbm9kZSk7XG5cblx0XHQvLyByZW1lbWJlciByZW5kZXJlZCBlbGVtZW50LCBhbiBlbGVtZW50IGNhbiBiZSByZW5kZXJlZCBtdWx0aXBsZSB0aW1lc1xuXHRcdGNvbnN0IHJlbmRlcmVkSXRlbXMgPSB0aGlzLl9yZW5kZXJlZEVsZW1lbnRzLmdldChlbGVtZW50LmVsZW1lbnQuaGFuZGxlKSA/PyBbXTtcblx0XHR0aGlzLl9yZW5kZXJlZEVsZW1lbnRzLnNldChlbGVtZW50LmVsZW1lbnQuaGFuZGxlLCBbLi4ucmVuZGVyZWRJdGVtcywgeyBvcmlnaW5hbDogZWxlbWVudCwgcmVuZGVyZWQ6IHRlbXBsYXRlRGF0YSB9XSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcmVuZGVyKCkge1xuXHRcdC8vIEFzIHdlIGFkZCBpdGVtcyB0byB0aGUgbWFwIGR1cmluZyB0aGlzIGNhbGwgd2UgY2FuJ3QgZGlyZWN0bHkgdXNlIHRoZSBtYXAgaW4gdGhlIGZvciBsb29wXG5cdFx0Ly8gYnV0IGhhdmUgdG8gY3JlYXRlIGEgY29weSBvZiB0aGUga2V5cyBmaXJzdFxuXHRcdGNvbnN0IGtleXMgPSBuZXcgU2V0KHRoaXMuX3JlbmRlcmVkRWxlbWVudHMua2V5cygpKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRjb25zdCB2YWx1ZXMgPSB0aGlzLl9yZW5kZXJlZEVsZW1lbnRzLmdldChrZXkpID8/IFtdO1xuXHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlRWxlbWVudCh2YWx1ZS5vcmlnaW5hbCwgMCwgdmFsdWUucmVuZGVyZWQpO1xuXHRcdFx0XHR0aGlzLnJlbmRlckVsZW1lbnQodmFsdWUub3JpZ2luYWwsIDAsIHZhbHVlLnJlbmRlcmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoZWNrYm94KG5vZGU6IElUcmVlSXRlbSwgdGVtcGxhdGVEYXRhOiBJVHJlZUV4cGxvcmVyVGVtcGxhdGVEYXRhKSB7XG5cdFx0aWYgKG5vZGUuY2hlY2tib3gpIHtcblx0XHRcdC8vIFRoZSBmaXJzdCB0aW1lIHdlIGZpbmQgYSBjaGVja2JveCB3ZSB3YW50IHRvIHJlcmVuZGVyIHRoZSB2aXNpYmxlIHRyZWUgdG8gYWRhcHQgdGhlIGFsaWdubWVudFxuXHRcdFx0aWYgKCF0aGlzLl9oYXNDaGVja2JveCkge1xuXHRcdFx0XHR0aGlzLl9oYXNDaGVja2JveCA9IHRydWU7XG5cdFx0XHRcdHRoaXMucmVyZW5kZXIoKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGVtcGxhdGVEYXRhLmNoZWNrYm94KSB7XG5cdFx0XHRcdGNvbnN0IGNoZWNrYm94ID0gbmV3IFRyZWVJdGVtQ2hlY2tib3godGVtcGxhdGVEYXRhLmNoZWNrYm94Q29udGFpbmVyLCB0aGlzLmNoZWNrYm94U3RhdGVIYW5kbGVyLCB0aGlzLl9ob3ZlckRlbGVnYXRlLCB0aGlzLmhvdmVyU2VydmljZSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jaGVja2JveCA9IGNoZWNrYm94O1xuXHRcdFx0fVxuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94LnJlbmRlcihub2RlKTtcblx0XHR9IGVsc2UgaWYgKHRlbXBsYXRlRGF0YS5jaGVja2JveCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNoZWNrYm94LmRpc3Bvc2UoKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5jaGVja2JveCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEFsaWdubWVudChjb250YWluZXI6IEhUTUxFbGVtZW50LCB0cmVlSXRlbTogSVRyZWVJdGVtKSB7XG5cdFx0Y29udGFpbmVyLnBhcmVudEVsZW1lbnQhLmNsYXNzTGlzdC50b2dnbGUoJ2FsaWduLWljb24td2l0aC10d2lzdHknLCB0aGlzLmFsaWduZXIuYWxpZ25JY29uV2l0aFR3aXN0eSh0cmVlSXRlbSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRIaWRlUmVzb3VyY2VMYWJlbEljb24oaWNvblVybDogVVJJIHwgdW5kZWZpbmVkLCBpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHQvLyBXZSBhbHdheXMgaGlkZSB0aGUgcmVzb3VyY2UgbGFiZWwgaW4gZmF2b3Igb2YgdGhlIGljb25Vcmwgd2hlbiBpdCdzIHByb3ZpZGVkLlxuXHRcdC8vIFdoZW4gYFRoZW1lSWNvbmAgaXMgcHJvdmlkZWQsIHdlIGhpZGUgdGhlIHJlc291cmNlIGxhYmVsIGljb24gaW4gZmF2b3Igb2YgaXQgb25seSBpZiBpdCdzIGEgbm90IGEgZmlsZSBpY29uLlxuXHRcdHJldHVybiAoISFpY29uVXJsIHx8ICghIWljb24gJiYgIXRoaXMuaXNGaWxlS2luZFRoZW1lSWNvbihpY29uKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93VGhlbWVJY29uKGhhc1Jlc291cmNlOiBib29sZWFuLCBpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQpOiBpY29uIGlzIFRoZW1lSWNvbiB7XG5cdFx0aWYgKCFpY29uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUncyBhIHJlc291cmNlIGFuZCB0aGUgaWNvbiBpcyBhIGZpbGUgaWNvbiwgdGhlbiB0aGUgaWNvbiAob3IgbGFjayB0aGVyZW9mKSB3aWxsIGFscmVhZHkgYmUgY29taW5nIGZyb20gdGhlXG5cdFx0Ly8gaWNvbiB0aGVtZSBhbmQgc2hvdWxkIHVzZSB3aGF0ZXZlciB0aGUgaWNvbiB0aGVtZSBoYXMgcHJvdmlkZWQuXG5cdFx0cmV0dXJuICEoaGFzUmVzb3VyY2UgJiYgdGhpcy5pc0ZpbGVLaW5kVGhlbWVJY29uKGljb24pKTtcblx0fVxuXG5cdHByaXZhdGUgaXNGaWxlS2luZFRoZW1lSWNvbihpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gVGhlbWVJY29uLmlzRmlsZShpY29uKSB8fCBUaGVtZUljb24uaXNGb2xkZXIoaWNvbik7XG5cdH1cblxuXHRwcml2YXRlIGdldEZpbGVLaW5kKG5vZGU6IElUcmVlSXRlbSk6IEZpbGVLaW5kIHtcblx0XHRpZiAobm9kZS50aGVtZUljb24pIHtcblx0XHRcdHN3aXRjaCAobm9kZS50aGVtZUljb24uaWQpIHtcblx0XHRcdFx0Y2FzZSBGaWxlVGhlbWVJY29uLmlkOlxuXHRcdFx0XHRcdHJldHVybiBGaWxlS2luZC5GSUxFO1xuXHRcdFx0XHRjYXNlIEZvbGRlclRoZW1lSWNvbi5pZDpcblx0XHRcdFx0XHRyZXR1cm4gRmlsZUtpbmQuRk9MREVSO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbm9kZS5jb2xsYXBzaWJsZVN0YXRlID09PSBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkIHx8IG5vZGUuY29sbGFwc2libGVTdGF0ZSA9PT0gVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkV4cGFuZGVkID8gRmlsZUtpbmQuRk9MREVSIDogRmlsZUtpbmQuRklMRTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VDb250ZXh0KGU6IElDb250ZXh0S2V5Q2hhbmdlRXZlbnQpIHtcblx0XHRjb25zdCBhZmZlY3RzRW50aXJlTWVudUNvbnRleHRzID0gZS5hZmZlY3RzU29tZSh0aGlzLm1lbnVzLmdldEVudGlyZU1lbnVDb250ZXh0cygpKTtcblxuXHRcdGNvbnN0IGl0ZW1zOiBJVHJlZUl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW18sIGVsZW1lbnRzXSBvZiB0aGlzLl9yZW5kZXJlZEVsZW1lbnRzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgZWxlbWVudHMpIHtcblx0XHRcdFx0aWYgKGFmZmVjdHNFbnRpcmVNZW51Q29udGV4dHMgfHwgZS5hZmZlY3RzU29tZSh0aGlzLm1lbnVzLmdldEVsZW1lbnRPdmVybGF5Q29udGV4dHMoZWxlbWVudC5vcmlnaW5hbC5lbGVtZW50KSkpIHtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKGVsZW1lbnQub3JpZ2luYWwuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNZW51Q29udGV4dC5maXJlKGl0ZW1zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNoZWNrYm94ZXMoaXRlbXM6IElUcmVlSXRlbVtdKSB7XG5cdFx0bGV0IGFsbEl0ZW1zOiBJVHJlZUl0ZW1bXSA9IFtdO1xuXG5cdFx0aWYgKCF0aGlzLm1hbnVhbGx5TWFuYWdlQ2hlY2tib3hlcygpKSB7XG5cdFx0XHRhbGxJdGVtcyA9IHNldENhc2NhZGluZ0NoZWNrYm94VXBkYXRlcyhpdGVtcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFsbEl0ZW1zID0gaXRlbXM7XG5cdFx0fVxuXG5cdFx0YWxsSXRlbXMuZm9yRWFjaChpdGVtID0+IHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkSXRlbXMgPSB0aGlzLl9yZW5kZXJlZEVsZW1lbnRzLmdldChpdGVtLmhhbmRsZSk7XG5cdFx0XHRpZiAocmVuZGVyZWRJdGVtcykge1xuXHRcdFx0XHRyZW5kZXJlZEl0ZW1zLmZvckVhY2gocmVuZGVyZWRJdGVtcyA9PiByZW5kZXJlZEl0ZW1zLnJlbmRlcmVkLmNoZWNrYm94Py5yZW5kZXIoaXRlbSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZS5maXJlKGFsbEl0ZW1zKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KHJlc291cmNlOiBJVHJlZU5vZGU8SVRyZWVJdGVtLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVHJlZUV4cGxvcmVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgaXRlbVJlbmRlcnMgPSB0aGlzLl9yZW5kZXJlZEVsZW1lbnRzLmdldChyZXNvdXJjZS5lbGVtZW50LmhhbmRsZSkgPz8gW107XG5cdFx0Y29uc3QgcmVuZGVyZWRJbmRleCA9IGl0ZW1SZW5kZXJzLmZpbmRJbmRleChyZW5kZXJlZEl0ZW0gPT4gdGVtcGxhdGVEYXRhID09PSByZW5kZXJlZEl0ZW0ucmVuZGVyZWQpO1xuXG5cdFx0aWYgKGl0ZW1SZW5kZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRFbGVtZW50cy5kZWxldGUocmVzb3VyY2UuZWxlbWVudC5oYW5kbGUpO1xuXHRcdH0gZWxzZSBpZiAoaXRlbVJlbmRlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0aXRlbVJlbmRlcnMuc3BsaWNlKHJlbmRlcmVkSW5kZXgsIDEpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5jaGVja2JveD8uZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5jaGVja2JveCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElUcmVlRXhwbG9yZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucmVzb3VyY2VMYWJlbC5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQWxpZ25lciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF90cmVlOiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElUcmVlSXRlbSwgSVRyZWVJdGVtLCBGdXp6eVNjb3JlPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSwgcHJpdmF0ZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRzZXQgdHJlZSh0cmVlOiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPElUcmVlSXRlbSwgSVRyZWVJdGVtLCBGdXp6eVNjb3JlPikge1xuXHRcdHRoaXMuX3RyZWUgPSB0cmVlO1xuXHR9XG5cblx0cHVibGljIGFsaWduSWNvbldpdGhUd2lzdHkodHJlZUl0ZW06IElUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0cmVlSXRlbS5jb2xsYXBzaWJsZVN0YXRlICE9PSBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuaGFzSWNvbk9yQ2hlY2tib3godHJlZUl0ZW0pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3RyZWUpIHtcblx0XHRcdGNvbnN0IHJvb3QgPSB0aGlzLl90cmVlLmdldElucHV0KCk7XG5cdFx0XHRsZXQgcGFyZW50OiBJVHJlZUl0ZW07XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwYXJlbnQgPSB0aGlzLl90cmVlLmdldFBhcmVudEVsZW1lbnQodHJlZUl0ZW0pIHx8IHJvb3Q7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtUcmVlVmlld10gRmFpbGVkIHRvIHJlc29sdmUgcGFyZW50IGZvciAke3RyZWVJdGVtLmhhbmRsZX1gLCBlcnJvcik7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmhhc0ljb25PckNoZWNrYm94KHBhcmVudCkpIHtcblx0XHRcdFx0cmV0dXJuICEhcGFyZW50LmNoaWxkcmVuICYmIHBhcmVudC5jaGlsZHJlbi5zb21lKGMgPT4gYy5jb2xsYXBzaWJsZVN0YXRlICE9PSBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSAmJiAhdGhpcy5oYXNJY29uT3JDaGVja2JveChjKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gISFwYXJlbnQuY2hpbGRyZW4gJiYgcGFyZW50LmNoaWxkcmVuLmV2ZXJ5KGMgPT4gYy5jb2xsYXBzaWJsZVN0YXRlID09PSBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSB8fCAhdGhpcy5oYXNJY29uT3JDaGVja2JveChjKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhc0ljb25PckNoZWNrYm94KG5vZGU6IElUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmhhc0ljb24obm9kZSkgfHwgISFub2RlLmNoZWNrYm94O1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNJY29uKG5vZGU6IElUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGljb24gPSAhaXNEYXJrKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKSA/IG5vZGUuaWNvbiA6IG5vZGUuaWNvbkRhcms7XG5cdFx0aWYgKGljb24pIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHQvLyBgZmlsZWAgYW5kIGBmb2xkZXJgIFRoZW1lSWNvbnMgZGVmZXIgdG8gdGhlIGZpbGUgaWNvbiB0aGVtZSBvbmx5IHdoZW4gdGhlIGl0ZW0gaGFzIGEgcmVzb3VyY2UuXG5cdFx0Ly8gQW55IG90aGVyIFRoZW1lSWNvbiwgb3IgYSBgZmlsZWAvYGZvbGRlcmAgVGhlbWVJY29uIG9uIGFuIGl0ZW0gd2l0aG91dCBhIHJlc291cmNlLCBpcyBhbHdheXNcblx0XHQvLyByZW5kZXJlZCBhcyBhIGNvZGljb24gYW5kIHRoZXJlZm9yZSBhbHdheXMgaGFzIGFuIGljb24gcmVnYXJkbGVzcyBvZiB0aGUgZmlsZSBpY29uIHRoZW1lLlxuXHRcdGlmIChub2RlLnRoZW1lSWNvbiAmJiAoIW5vZGUucmVzb3VyY2VVcmkgfHwgKG5vZGUudGhlbWVJY29uLmlkICE9PSBGaWxlVGhlbWVJY29uLmlkICYmIG5vZGUudGhlbWVJY29uLmlkICE9PSBGb2xkZXJUaGVtZUljb24uaWQpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChub2RlLnJlc291cmNlVXJpIHx8IG5vZGUudGhlbWVJY29uKSB7XG5cdFx0XHRjb25zdCBmaWxlSWNvblRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpO1xuXHRcdFx0Y29uc3QgaXNGb2xkZXIgPSBub2RlLnRoZW1lSWNvbiA/IG5vZGUudGhlbWVJY29uLmlkID09PSBGb2xkZXJUaGVtZUljb24uaWQgOiBub2RlLmNvbGxhcHNpYmxlU3RhdGUgIT09IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lO1xuXHRcdFx0aWYgKGlzRm9sZGVyKSB7XG5cdFx0XHRcdHJldHVybiBmaWxlSWNvblRoZW1lLmhhc0ZpbGVJY29ucyAmJiBmaWxlSWNvblRoZW1lLmhhc0ZvbGRlckljb25zO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZpbGVJY29uVGhlbWUuaGFzRmlsZUljb25zO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuY2xhc3MgTXVsdGlwbGVTZWxlY3Rpb25BY3Rpb25SdW5uZXIgZXh0ZW5kcyBBY3Rpb25SdW5uZXIge1xuXG5cdGNvbnN0cnVjdG9yKG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLCBwcml2YXRlIGdldFNlbGVjdGVkUmVzb3VyY2VzOiAoKCkgPT4gSVRyZWVJdGVtW10pKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkUnVuKGUgPT4ge1xuXHRcdFx0aWYgKGUuZXJyb3IgJiYgIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZS5lcnJvcikpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnY29tbWFuZC1lcnJvcicsICdFcnJvciBydW5uaW5nIGNvbW1hbmQgezF9OiB7MH0uIFRoaXMgaXMgbGlrZWx5IGNhdXNlZCBieSB0aGUgZXh0ZW5zaW9uIHRoYXQgY29udHJpYnV0ZXMgezF9LicsIGUuZXJyb3IubWVzc2FnZSwgZS5hY3Rpb24uaWQpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiwgY29udGV4dDogVHJlZVZpZXdJdGVtSGFuZGxlQXJnIHwgVHJlZVZpZXdQYW5lSGFuZGxlQXJnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3RlZFJlc291cmNlcygpO1xuXHRcdGxldCBzZWxlY3Rpb25IYW5kbGVBcmdzOiBUcmVlVmlld0l0ZW1IYW5kbGVBcmdbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgYWN0aW9uSW5TZWxlY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdGlmIChzZWxlY3Rpb24ubGVuZ3RoID4gMSkge1xuXHRcdFx0c2VsZWN0aW9uSGFuZGxlQXJncyA9IHNlbGVjdGlvbi5tYXAoc2VsZWN0ZWQgPT4ge1xuXHRcdFx0XHRpZiAoKHNlbGVjdGVkLmhhbmRsZSA9PT0gKGNvbnRleHQgYXMgVHJlZVZpZXdJdGVtSGFuZGxlQXJnKS4kdHJlZUl0ZW1IYW5kbGUpIHx8IChjb250ZXh0IGFzIFRyZWVWaWV3UGFuZUhhbmRsZUFyZykuJHNlbGVjdGVkVHJlZUl0ZW1zKSB7XG5cdFx0XHRcdFx0YWN0aW9uSW5TZWxlY3RlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgJHRyZWVWaWV3SWQ6IGNvbnRleHQuJHRyZWVWaWV3SWQsICR0cmVlSXRlbUhhbmRsZTogc2VsZWN0ZWQuaGFuZGxlIH07XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoIWFjdGlvbkluU2VsZWN0ZWQgJiYgc2VsZWN0aW9uSGFuZGxlQXJncykge1xuXHRcdFx0c2VsZWN0aW9uSGFuZGxlQXJncyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhd2FpdCBhY3Rpb24ucnVuKGNvbnRleHQsIHNlbGVjdGlvbkhhbmRsZUFyZ3MpO1xuXHR9XG59XG5cbmNsYXNzIFRyZWVNZW51cyBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPElUcmVlSXRlbT4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBpZDogc3RyaW5nLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlXG5cdCkgeyB9XG5cblx0LyoqXG5cdCAqIEdldHMgb25seSB0aGUgYWN0aW9ucyB0aGF0IGFwcGx5IHRvIGFsbCBvZiB0aGUgZ2l2ZW4gZWxlbWVudHMuXG5cdCAqL1xuXHRnZXRSZXNvdXJjZUFjdGlvbnMoZWxlbWVudHM6IElUcmVlSXRlbVtdKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5nZXRBY3Rpb25zKHRoaXMuZ2V0TWVudUlkKCksIGVsZW1lbnRzKTtcblx0XHRyZXR1cm4gYWN0aW9ucy5wcmltYXJ5O1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgb25seSB0aGUgYWN0aW9ucyB0aGF0IGFwcGx5IHRvIGFsbCBvZiB0aGUgZ2l2ZW4gZWxlbWVudHMuXG5cdCAqL1xuXHRnZXRSZXNvdXJjZUNvbnRleHRBY3Rpb25zKGVsZW1lbnRzOiBJVHJlZUl0ZW1bXSk6IElBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QWN0aW9ucyh0aGlzLmdldE1lbnVJZCgpLCBlbGVtZW50cykuc2Vjb25kYXJ5O1xuXHR9XG5cblx0cHVibGljIHNldENvbnRleHRLZXlTZXJ2aWNlKHNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSkge1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSBzZXJ2aWNlO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJOb25Vbml2ZXJzYWxBY3Rpb25zKGdyb3VwczogTWFwPHN0cmluZywgSUFjdGlvbj5bXSwgbmV3QWN0aW9uczogSUFjdGlvbltdKSB7XG5cdFx0Y29uc3QgbmV3QWN0aW9uc1NldDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KG5ld0FjdGlvbnMubWFwKGEgPT4gYS5pZCkpO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gZ3JvdXAua2V5cygpO1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRpZiAoIW5ld0FjdGlvbnNTZXQuaGFzKGFjdGlvbikpIHtcblx0XHRcdFx0XHRncm91cC5kZWxldGUoYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYnVpbGRNZW51KGdyb3VwczogTWFwPHN0cmluZywgSUFjdGlvbj5bXSk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGdyb3Vwcykge1xuXHRcdFx0aWYgKGdyb3VwLnNpemUgPiAwKSB7XG5cdFx0XHRcdGlmIChyZXN1bHQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQucHVzaCguLi5ncm91cC52YWx1ZXMoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUdyb3VwcyhhY3Rpb25zOiBJQWN0aW9uW10pOiBNYXA8c3RyaW5nLCBJQWN0aW9uPltdIHtcblx0XHRjb25zdCBncm91cHM6IE1hcDxzdHJpbmcsIElBY3Rpb24+W10gPSBbXTtcblx0XHRsZXQgZ3JvdXA6IE1hcDxzdHJpbmcsIElBY3Rpb24+ID0gbmV3IE1hcCgpO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2goZ3JvdXApO1xuXHRcdFx0XHRncm91cCA9IG5ldyBNYXAoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGdyb3VwLnNldChhY3Rpb24uaWQsIGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGdyb3Vwcy5wdXNoKGdyb3VwKTtcblx0XHRyZXR1cm4gZ3JvdXBzO1xuXHR9XG5cblx0cHVibGljIGdldEVsZW1lbnRPdmVybGF5Q29udGV4dHMoZWxlbWVudDogSVRyZWVJdGVtKTogTWFwPHN0cmluZywgdW5rbm93bj4ge1xuXHRcdHJldHVybiBuZXcgTWFwKFtcblx0XHRcdFsndmlldycsIHRoaXMuaWRdLFxuXHRcdFx0Wyd2aWV3SXRlbScsIGVsZW1lbnQuY29udGV4dFZhbHVlXVxuXHRcdF0pO1xuXHR9XG5cblx0cHVibGljIGdldEVudGlyZU1lbnVDb250ZXh0cygpOiBSZWFkb25seVNldDxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5tZW51U2VydmljZS5nZXRNZW51Q29udGV4dHModGhpcy5nZXRNZW51SWQoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TWVudUlkKCk6IE1lbnVJZCB7XG5cdFx0cmV0dXJuIE1lbnVJZC5WaWV3SXRlbUNvbnRleHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbnMobWVudUlkOiBNZW51SWQsIGVsZW1lbnRzOiBJVHJlZUl0ZW1bXSk6IHsgcHJpbWFyeTogSUFjdGlvbltdOyBzZWNvbmRhcnk6IElBY3Rpb25bXSB9IHtcblx0XHRpZiAoIXRoaXMuY29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdHJldHVybiB7IHByaW1hcnk6IFtdLCBzZWNvbmRhcnk6IFtdIH07XG5cdFx0fVxuXG5cdFx0bGV0IHByaW1hcnlHcm91cHM6IE1hcDxzdHJpbmcsIElBY3Rpb24+W10gPSBbXTtcblx0XHRsZXQgc2Vjb25kYXJ5R3JvdXBzOiBNYXA8c3RyaW5nLCBJQWN0aW9uPltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlbGVtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGVsZW1lbnRzW2ldO1xuXHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkodGhpcy5nZXRFbGVtZW50T3ZlcmxheUNvbnRleHRzKGVsZW1lbnQpKTtcblxuXHRcdFx0Y29uc3QgbWVudURhdGEgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKG1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UsIHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldENvbnRleHRNZW51QWN0aW9ucyhtZW51RGF0YSwgJ2lubGluZScpO1xuXHRcdFx0aWYgKGkgPT09IDApIHtcblx0XHRcdFx0cHJpbWFyeUdyb3VwcyA9IHRoaXMuY3JlYXRlR3JvdXBzKHJlc3VsdC5wcmltYXJ5KTtcblx0XHRcdFx0c2Vjb25kYXJ5R3JvdXBzID0gdGhpcy5jcmVhdGVHcm91cHMocmVzdWx0LnNlY29uZGFyeSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpbHRlck5vblVuaXZlcnNhbEFjdGlvbnMocHJpbWFyeUdyb3VwcywgcmVzdWx0LnByaW1hcnkpO1xuXHRcdFx0XHR0aGlzLmZpbHRlck5vblVuaXZlcnNhbEFjdGlvbnMoc2Vjb25kYXJ5R3JvdXBzLCByZXN1bHQuc2Vjb25kYXJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBwcmltYXJ5OiB0aGlzLmJ1aWxkTWVudShwcmltYXJ5R3JvdXBzKSwgc2Vjb25kYXJ5OiB0aGlzLmJ1aWxkTWVudShzZWNvbmRhcnlHcm91cHMpIH07XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21UcmVlVmlldyBleHRlbmRzIEFic3RyYWN0VHJlZVZpZXcge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0dGl0bGU6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbklkOiBzdHJpbmcsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGlkLCB0aXRsZSwgdGhlbWVTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwcm9ncmVzc1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaG92ZXJTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgYWN0aXZpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBtYXJrZG93blJlbmRlcmVyU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWN0aXZhdGUoKSB7XG5cdFx0aWYgKCF0aGlzLmFjdGl2YXRlZCkge1xuXHRcdFx0dHlwZSBFeHRlbnNpb25WaWV3VGVsZW1ldHJ5ID0ge1xuXHRcdFx0XHRleHRlbnNpb25JZDogVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdFx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBFeHRlbnNpb25WaWV3VGVsZW1ldHJ5TWV0YSA9IHtcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJZCBvZiB0aGUgZXh0ZW5zaW9uJyB9O1xuXHRcdFx0XHRpZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lkIG9mIHRoZSB2aWV3JyB9O1xuXHRcdFx0XHRvd25lcjogJ2RpZ2l0YXJhbGQnO1xuXHRcdFx0XHRjb21tZW50OiAnSGVscHMgdG8gZ2FpbiBpbnNpZ2h0cyBvbiB3aGF0IGV4dGVuc2lvbiBjb250cmlidXRlZCB2aWV3cyBhcmUgbW9zdCBwb3B1bGFyJztcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFeHRlbnNpb25WaWV3VGVsZW1ldHJ5LCBFeHRlbnNpb25WaWV3VGVsZW1ldHJ5TWV0YT4oJ0V4dGVuc2lvbjpWaWV3QWN0aXZhdGUnLCB7XG5cdFx0XHRcdGV4dGVuc2lvbklkOiBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKHRoaXMuZXh0ZW5zaW9uSWQpLFxuXHRcdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5jcmVhdGVUcmVlKCk7XG5cdFx0XHR0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogdGhpcy5pZCB9LCAoKSA9PiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvblZpZXc6JHt0aGlzLmlkfWApKVxuXHRcdFx0XHQudGhlbigoKSA9PiB0aW1lb3V0KDIwMDApKVxuXHRcdFx0XHQudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVNZXNzYWdlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0dGhpcy5hY3RpdmF0ZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHJlZVZpZXcgZXh0ZW5kcyBBYnN0cmFjdFRyZWVWaWV3IHtcblxuXHRwcm90ZWN0ZWQgYWN0aXZhdGUoKSB7XG5cdFx0aWYgKCF0aGlzLmFjdGl2YXRlZCkge1xuXHRcdFx0dGhpcy5jcmVhdGVUcmVlKCk7XG5cdFx0XHR0aGlzLmFjdGl2YXRlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBUcmVlRHJhZ1NvdXJjZUluZm8ge1xuXHRpZDogc3RyaW5nO1xuXHRpdGVtSGFuZGxlczogc3RyaW5nW107XG59XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21UcmVlVmlld0RyYWdBbmREcm9wIGltcGxlbWVudHMgSVRyZWVEcmFnQW5kRHJvcDxJVHJlZUl0ZW0+IHtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlTWltZVR5cGU6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlSXRlbXNUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXI+KCk7XG5cdHByaXZhdGUgZHJhZ0NhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRyZWVJZDogc3RyaW5nLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVHJlZVZpZXdzRG5EU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRyZWVWaWV3c0RyYWdBbmREcm9wU2VydmljZTogSVRyZWVWaWV3c0RuRFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UpIHtcblx0XHR0aGlzLnRyZWVNaW1lVHlwZSA9IGBhcHBsaWNhdGlvbi92bmQuY29kZS50cmVlLiR7dHJlZUlkLnRvTG93ZXJDYXNlKCl9YDtcblx0fVxuXG5cdHByaXZhdGUgZG5kQ29udHJvbGxlcjogSVRyZWVWaWV3RHJhZ0FuZERyb3BDb250cm9sbGVyIHwgdW5kZWZpbmVkO1xuXHRzZXQgY29udHJvbGxlcihjb250cm9sbGVyOiBJVHJlZVZpZXdEcmFnQW5kRHJvcENvbnRyb2xsZXIgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmRuZENvbnRyb2xsZXIgPSBjb250cm9sbGVyO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVEcmFnQW5kTG9nKGRuZENvbnRyb2xsZXI6IElUcmVlVmlld0RyYWdBbmREcm9wQ29udHJvbGxlciwgaXRlbUhhbmRsZXM6IHN0cmluZ1tdLCB1dWlkOiBzdHJpbmcsIGRyYWdDYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFZTRGF0YVRyYW5zZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIGRuZENvbnRyb2xsZXIuaGFuZGxlRHJhZyhpdGVtSGFuZGxlcywgdXVpZCwgZHJhZ0NhbmNlbGxhdGlvblRva2VuKS50aGVuKGFkZGl0aW9uYWxEYXRhVHJhbnNmZXIgPT4ge1xuXHRcdFx0aWYgKGFkZGl0aW9uYWxEYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0Y29uc3QgdW5saXN0ZWRUeXBlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGFkZGl0aW9uYWxEYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0XHRpZiAoKGl0ZW1bMF0gIT09IHRoaXMudHJlZU1pbWVUeXBlKSAmJiAoZG5kQ29udHJvbGxlci5kcmFnTWltZVR5cGVzLmZpbmRJbmRleCh2YWx1ZSA9PiB2YWx1ZSA9PT0gaXRlbVswXSkgPCAwKSkge1xuXHRcdFx0XHRcdFx0dW5saXN0ZWRUeXBlcy5wdXNoKGl0ZW1bMF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodW5saXN0ZWRUeXBlcy5sZW5ndGgpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRHJhZyBhbmQgZHJvcCBjb250cm9sbGVyIGZvciB0cmVlICR7dGhpcy50cmVlSWR9IGFkZHMgdGhlIGZvbGxvd2luZyBkYXRhIHRyYW5zZmVyIHR5cGVzIGJ1dCBkb2VzIG5vdCBkZWNsYXJlIHRoZW0gaW4gZHJhZ01pbWVUeXBlczogJHt1bmxpc3RlZFR5cGVzLmpvaW4oJywgJyl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBhZGRpdGlvbmFsRGF0YVRyYW5zZmVyO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRFeHRlbnNpb25Qcm92aWRlZFRyYW5zZmVyVHlwZXMob3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50LCBpdGVtSGFuZGxlczogc3RyaW5nW10pIHtcblx0XHRpZiAoIW9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyIHx8ICF0aGlzLmRuZENvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdXVpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0dGhpcy5kcmFnQ2FuY2VsbGF0aW9uVG9rZW4gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLnRyZWVWaWV3c0RyYWdBbmREcm9wU2VydmljZS5hZGREcmFnT3BlcmF0aW9uVHJhbnNmZXIodXVpZCwgdGhpcy5oYW5kbGVEcmFnQW5kTG9nKHRoaXMuZG5kQ29udHJvbGxlciwgaXRlbUhhbmRsZXMsIHV1aWQsIHRoaXMuZHJhZ0NhbmNlbGxhdGlvblRva2VuLnRva2VuKSk7XG5cdFx0dGhpcy50cmVlSXRlbXNUcmFuc2Zlci5zZXREYXRhKFtuZXcgRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIodXVpZCldLCBEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyLmNsZWFyRGF0YShNaW1lcy50ZXh0KTtcblx0XHRpZiAodGhpcy5kbmRDb250cm9sbGVyLmRyYWdNaW1lVHlwZXMuZmluZCgoZWxlbWVudCkgPT4gZWxlbWVudCA9PT0gTWltZXMudXJpTGlzdCkpIHtcblx0XHRcdC8vIEFkZCB0aGUgdHlwZSB0aGF0IHRoZSBlZGl0b3Iga25vd3Ncblx0XHRcdG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyPy5zZXREYXRhKERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTLCAnJyk7XG5cdFx0fVxuXHRcdHRoaXMuZG5kQ29udHJvbGxlci5kcmFnTWltZVR5cGVzLmZvckVhY2goc3VwcG9ydGVkVHlwZSA9PiB7XG5cdFx0XHRvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlcj8uc2V0RGF0YShzdXBwb3J0ZWRUeXBlLCAnJyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZFJlc291cmNlSW5mb1RvVHJhbnNmZXIob3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50LCByZXNvdXJjZXM6IFVSSVtdKSB7XG5cdFx0aWYgKHJlc291cmNlcy5sZW5ndGggJiYgb3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdC8vIEFwcGx5IHNvbWUgZGF0YXRyYW5zZmVyIHR5cGVzIHRvIGFsbG93IGZvciBkcmFnZ2luZyB0aGUgZWxlbWVudCBvdXRzaWRlIG9mIHRoZSBhcHBsaWNhdGlvblxuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCByZXNvdXJjZXMsIG9yaWdpbmFsRXZlbnQpKTtcblxuXHRcdFx0Ly8gVGhlIG9ubHkgY3VzdG9tIGRhdGEgdHJhbnNmZXIgd2Ugc2V0IGZyb20gdGhlIGV4cGxvcmVyIGlzIGEgZmlsZSB0cmFuc2ZlclxuXHRcdFx0Ly8gdG8gYmUgYWJsZSB0byBETkQgYmV0d2VlbiBtdWx0aXBsZSBjb2RlIGZpbGUgZXhwbG9yZXJzIGFjcm9zcyB3aW5kb3dzXG5cdFx0XHRjb25zdCBmaWxlUmVzb3VyY2VzID0gcmVzb3VyY2VzLmZpbHRlcihzID0+IHMuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpLm1hcChyID0+IHIuZnNQYXRoKTtcblx0XHRcdGlmIChmaWxlUmVzb3VyY2VzLmxlbmd0aCkge1xuXHRcdFx0XHRvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlci5zZXREYXRhKENvZGVEYXRhVHJhbnNmZXJzLkZJTEVTLCBKU09OLnN0cmluZ2lmeShmaWxlUmVzb3VyY2VzKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0b25EcmFnU3RhcnQoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0aWYgKG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRjb25zdCB0cmVlSXRlbXNEYXRhID0gKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8SVRyZWVJdGVtLCBJVHJlZUl0ZW1bXT4pLmdldERhdGEoKTtcblx0XHRcdGNvbnN0IHJlc291cmNlczogVVJJW10gPSBbXTtcblx0XHRcdGNvbnN0IHNvdXJjZUluZm86IFRyZWVEcmFnU291cmNlSW5mbyA9IHtcblx0XHRcdFx0aWQ6IHRoaXMudHJlZUlkLFxuXHRcdFx0XHRpdGVtSGFuZGxlczogW11cblx0XHRcdH07XG5cdFx0XHR0cmVlSXRlbXNEYXRhLmZvckVhY2goaXRlbSA9PiB7XG5cdFx0XHRcdHNvdXJjZUluZm8uaXRlbUhhbmRsZXMucHVzaChpdGVtLmhhbmRsZSk7XG5cdFx0XHRcdGlmIChpdGVtLnJlc291cmNlVXJpKSB7XG5cdFx0XHRcdFx0cmVzb3VyY2VzLnB1c2goVVJJLnJldml2ZShpdGVtLnJlc291cmNlVXJpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5hZGRSZXNvdXJjZUluZm9Ub1RyYW5zZmVyKG9yaWdpbmFsRXZlbnQsIHJlc291cmNlcyk7XG5cdFx0XHR0aGlzLmFkZEV4dGVuc2lvblByb3ZpZGVkVHJhbnNmZXJUeXBlcyhvcmlnaW5hbEV2ZW50LCBzb3VyY2VJbmZvLml0ZW1IYW5kbGVzKTtcblx0XHRcdG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEodGhpcy50cmVlTWltZVR5cGUsXG5cdFx0XHRcdEpTT04uc3RyaW5naWZ5KHNvdXJjZUluZm8pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRlYnVnTG9nKHR5cGVzOiBTZXQ8c3RyaW5nPikge1xuXHRcdGlmICh0eXBlcy5zaXplKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFRyZWVWaWV3IGRyYWdnZWQgbWltZSB0eXBlczogJHtBcnJheS5mcm9tKHR5cGVzKS5qb2luKCcsICcpfWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFRyZWVWaWV3IGRyYWdnZWQgd2l0aCBubyBzdXBwb3J0ZWQgbWltZSB0eXBlcy5gKTtcblx0XHR9XG5cdH1cblxuXHRvbkRyYWdPdmVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IElUcmVlSXRlbSwgdGFyZ2V0SW5kZXg6IG51bWJlciwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbiB8IElUcmVlRHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0Y29uc3QgZGF0YVRyYW5zZmVyID0gdG9FeHRlcm5hbFZTRGF0YVRyYW5zZmVyKG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyISk7XG5cblx0XHRjb25zdCB0eXBlcyA9IG5ldyBTZXQ8c3RyaW5nPihBcnJheS5mcm9tKGRhdGFUcmFuc2ZlciwgeCA9PiB4WzBdKSk7XG5cblx0XHRpZiAob3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdC8vIEFsc28gYWRkIHVyaS1saXN0IGlmIHdlIGhhdmUgYW55IGZpbGVzLiBBdCB0aGlzIHN0YWdlIHdlIGNhbid0IGFjdHVhbGx5IGFjY2VzcyB0aGUgZmlsZSBpdHNlbGYgdGhvdWdoLlxuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyLml0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtLmtpbmQgPT09ICdmaWxlJyB8fCBpdGVtLnR5cGUgPT09IERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0XHR0eXBlcy5hZGQoTWltZXMudXJpTGlzdCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmRlYnVnTG9nKHR5cGVzKTtcblxuXHRcdGNvbnN0IGRuZENvbnRyb2xsZXIgPSB0aGlzLmRuZENvbnRyb2xsZXI7XG5cdFx0aWYgKCFkbmRDb250cm9sbGVyIHx8ICFvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2ZlciB8fCAoZG5kQ29udHJvbGxlci5kcm9wTWltZVR5cGVzLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZHJhZ0NvbnRhaW5lcnNTdXBwb3J0ZWRUeXBlID0gQXJyYXkuZnJvbSh0eXBlcykuc29tZSgodmFsdWUsIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAodmFsdWUgPT09IHRoaXMudHJlZU1pbWVUeXBlKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGRuZENvbnRyb2xsZXIuZHJvcE1pbWVUeXBlcy5pbmRleE9mKHZhbHVlKSA+PSAwO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmIChkcmFnQ29udGFpbmVyc1N1cHBvcnRlZFR5cGUpIHtcblx0XHRcdHJldHVybiB7IGFjY2VwdDogdHJ1ZSwgYnViYmxlOiBUcmVlRHJhZ092ZXJCdWJibGUuRG93biwgYXV0b0V4cGFuZDogdHJ1ZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXREcmFnVVJJKGVsZW1lbnQ6IElUcmVlSXRlbSk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5kbmRDb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2VVcmkgPyBVUkkucmV2aXZlKGVsZW1lbnQucmVzb3VyY2VVcmkpLnRvU3RyaW5nKCkgOiBlbGVtZW50LmhhbmRsZTtcblx0fVxuXG5cdGdldERyYWdMYWJlbD8oZWxlbWVudHM6IElUcmVlSXRlbVtdKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuZG5kQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHJldHVybiBTdHJpbmcoZWxlbWVudHMubGVuZ3RoKTtcblx0XHR9XG5cdFx0Y29uc3QgZWxlbWVudCA9IGVsZW1lbnRzWzBdO1xuXHRcdGlmIChlbGVtZW50LmxhYmVsKSB7XG5cdFx0XHRyZXR1cm4gaXNNYXJrZG93blN0cmluZyhlbGVtZW50LmxhYmVsLmxhYmVsKSA/IGVsZW1lbnQubGFiZWwubGFiZWwudmFsdWUgOiBlbGVtZW50LmxhYmVsLmxhYmVsO1xuXHRcdH1cblx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZVVyaSA/IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKFVSSS5yZXZpdmUoZWxlbWVudC5yZXNvdXJjZVVyaSkpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZHJvcChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXROb2RlOiBJVHJlZUl0ZW0gfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRuZENvbnRyb2xsZXIgPSB0aGlzLmRuZENvbnRyb2xsZXI7XG5cdFx0aWYgKCFvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2ZlciB8fCAhZG5kQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB0cmVlU291cmNlSW5mbzogVHJlZURyYWdTb3VyY2VJbmZvIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB3aWxsRHJvcFV1aWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy50cmVlSXRlbXNUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRUcmVlSXRlbXNJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdHdpbGxEcm9wVXVpZCA9IHRoaXMudHJlZUl0ZW1zVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllci5wcm90b3R5cGUpIVswXS5pZGVudGlmaWVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsRGF0YVRyYW5zZmVyID0gdG9FeHRlcm5hbFZTRGF0YVRyYW5zZmVyKG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyLCB0cnVlKTtcblxuXHRcdGNvbnN0IG91dERhdGFUcmFuc2ZlciA9IG5ldyBWU0RhdGFUcmFuc2ZlcigpO1xuXHRcdGZvciAoY29uc3QgW3R5cGUsIGl0ZW1dIG9mIG9yaWdpbmFsRGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRpZiAodHlwZSA9PT0gdGhpcy50cmVlTWltZVR5cGUgfHwgZG5kQ29udHJvbGxlci5kcm9wTWltZVR5cGVzLmluY2x1ZGVzKHR5cGUpIHx8IChpdGVtLmFzRmlsZSgpICYmIGRuZENvbnRyb2xsZXIuZHJvcE1pbWVUeXBlcy5pbmNsdWRlcyhEYXRhVHJhbnNmZXJzLkZJTEVTLnRvTG93ZXJDYXNlKCkpKSkge1xuXHRcdFx0XHRvdXREYXRhVHJhbnNmZXIuYXBwZW5kKHR5cGUsIGl0ZW0pO1xuXHRcdFx0XHRpZiAodHlwZSA9PT0gdGhpcy50cmVlTWltZVR5cGUpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dHJlZVNvdXJjZUluZm8gPSBKU09OLnBhcnNlKGF3YWl0IGl0ZW0uYXNTdHJpbmcoKSk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBub29wXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkaXRpb25hbERhdGFUcmFuc2ZlciA9IGF3YWl0IHRoaXMudHJlZVZpZXdzRHJhZ0FuZERyb3BTZXJ2aWNlLnJlbW92ZURyYWdPcGVyYXRpb25UcmFuc2Zlcih3aWxsRHJvcFV1aWQpO1xuXHRcdGlmIChhZGRpdGlvbmFsRGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFt0eXBlLCBpdGVtXSBvZiBhZGRpdGlvbmFsRGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdG91dERhdGFUcmFuc2Zlci5hcHBlbmQodHlwZSwgaXRlbSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBkbmRDb250cm9sbGVyLmhhbmRsZURyb3Aob3V0RGF0YVRyYW5zZmVyLCB0YXJnZXROb2RlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB3aWxsRHJvcFV1aWQsIHRyZWVTb3VyY2VJbmZvPy5pZCwgdHJlZVNvdXJjZUluZm8/Lml0ZW1IYW5kbGVzKTtcblx0fVxuXG5cdG9uRHJhZ0VuZChvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBDaGVjayBpZiB0aGUgZHJhZyB3YXMgY2FuY2VsbGVkLlxuXHRcdGlmIChvcmlnaW5hbEV2ZW50LmRhdGFUcmFuc2Zlcj8uZHJvcEVmZmVjdCA9PT0gJ25vbmUnKSB7XG5cdFx0XHR0aGlzLmRyYWdDYW5jZWxsYXRpb25Ub2tlbj8uY2FuY2VsKCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG5mdW5jdGlvbiBzZXRDYXNjYWRpbmdDaGVja2JveFVwZGF0ZXMoaXRlbXM6IHJlYWRvbmx5IElUcmVlSXRlbVtdKSB7XG5cdGNvbnN0IGFkZGl0aW9uYWxJdGVtczogSVRyZWVJdGVtW10gPSBbXTtcblxuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRpZiAoaXRlbS5jaGVja2JveCAhPT0gdW5kZWZpbmVkKSB7XG5cblx0XHRcdGNvbnN0IGNoZWNrQ2hpbGRyZW4gPSAoY3VycmVudEl0ZW06IElUcmVlSXRlbSkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIChjdXJyZW50SXRlbS5jaGlsZHJlbiA/PyBbXSkpIHtcblx0XHRcdFx0XHRpZiAoKGNoaWxkLmNoZWNrYm94ICE9PSB1bmRlZmluZWQpICYmIChjdXJyZW50SXRlbS5jaGVja2JveCAhPT0gdW5kZWZpbmVkKSAmJiAoY2hpbGQuY2hlY2tib3guaXNDaGVja2VkICE9PSBjdXJyZW50SXRlbS5jaGVja2JveC5pc0NoZWNrZWQpKSB7XG5cdFx0XHRcdFx0XHRjaGlsZC5jaGVja2JveC5pc0NoZWNrZWQgPSBjdXJyZW50SXRlbS5jaGVja2JveC5pc0NoZWNrZWQ7XG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsSXRlbXMucHVzaChjaGlsZCk7XG5cdFx0XHRcdFx0XHRjaGVja0NoaWxkcmVuKGNoaWxkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRjaGVja0NoaWxkcmVuKGl0ZW0pO1xuXG5cdFx0XHRjb25zdCB2aXNpdGVkUGFyZW50czogU2V0PElUcmVlSXRlbT4gPSBuZXcgU2V0KCk7XG5cdFx0XHRjb25zdCBjaGVja1BhcmVudHMgPSAoY3VycmVudEl0ZW06IElUcmVlSXRlbSkgPT4ge1xuXHRcdFx0XHRpZiAoY3VycmVudEl0ZW0ucGFyZW50Py5jaGVja2JveCAhPT0gdW5kZWZpbmVkICYmIGN1cnJlbnRJdGVtLnBhcmVudC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGlmICh2aXNpdGVkUGFyZW50cy5oYXMoY3VycmVudEl0ZW0ucGFyZW50KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR2aXNpdGVkUGFyZW50cy5hZGQoY3VycmVudEl0ZW0ucGFyZW50KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgc29tZVVuY2hlY2tlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGxldCBzb21lQ2hlY2tlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY3VycmVudEl0ZW0ucGFyZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRpZiAoc29tZVVuY2hlY2tlZCAmJiBzb21lQ2hlY2tlZCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChjaGlsZC5jaGVja2JveCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChjaGlsZC5jaGVja2JveC5pc0NoZWNrZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRzb21lQ2hlY2tlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0c29tZVVuY2hlY2tlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHNvbWVDaGVja2VkICYmICFzb21lVW5jaGVja2VkICYmIChjdXJyZW50SXRlbS5wYXJlbnQuY2hlY2tib3guaXNDaGVja2VkICE9PSB0cnVlKSkge1xuXHRcdFx0XHRcdFx0Y3VycmVudEl0ZW0ucGFyZW50LmNoZWNrYm94LmlzQ2hlY2tlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsSXRlbXMucHVzaChjdXJyZW50SXRlbS5wYXJlbnQpO1xuXHRcdFx0XHRcdFx0Y2hlY2tQYXJlbnRzKGN1cnJlbnRJdGVtLnBhcmVudCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzb21lVW5jaGVja2VkICYmIChjdXJyZW50SXRlbS5wYXJlbnQuY2hlY2tib3guaXNDaGVja2VkICE9PSBmYWxzZSkpIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRJdGVtLnBhcmVudC5jaGVja2JveC5pc0NoZWNrZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxJdGVtcy5wdXNoKGN1cnJlbnRJdGVtLnBhcmVudCk7XG5cdFx0XHRcdFx0XHRjaGVja1BhcmVudHMoY3VycmVudEl0ZW0ucGFyZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRjaGVja1BhcmVudHMoaXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGl0ZW1zLmNvbmNhdChhZGRpdGlvbmFsSXRlbXMpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUF1QztBQUNoRCxZQUFZLFNBQVM7QUFDckIsWUFBWSxXQUFXO0FBQ3ZCLFNBQTRCLHlCQUF5QjtBQUNyRCxTQUFTLGlCQUEwQztBQUNuRCxTQUFTLHNCQUFzQjtBQUkvQixTQUFxSCwwQkFBMEI7QUFDL0ksU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUF1QixpQkFBaUI7QUFDakQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxxQkFBaUM7QUFDMUMsU0FBMEIsa0JBQWtCLHNCQUFzQjtBQUNsRSxTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTztBQUNQLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCLDZCQUE2QjtBQUM1RCxTQUFTLFNBQVMsY0FBYyxRQUFRLGNBQWMsdUJBQXVCO0FBQzdFLFNB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
