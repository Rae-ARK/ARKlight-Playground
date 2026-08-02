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
import { Event, Emitter } from "../../../../base/common/event.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { Disposable, DisposableStore, combinedDisposable, dispose, toDisposable, MutableDisposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { ViewPane, ViewAction } from "../../../browser/parts/views/viewPane.js";
import { append, $, clearNode, isPointerEvent, isActiveElement } from "../../../../base/browser/dom.js";
import { asCSSUrl } from "../../../../base/browser/cssValue.js";
import { ISCMViewService, ISCMService, VIEW_PANE_ID, ISCMRepositorySortKey, ViewMode, ISCMRepositorySelectionMode } from "../common/scm.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { CountBadge } from "../../../../base/browser/ui/countBadge/countBadge.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService, ContextKeyExpr, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { MenuItemAction, IMenuService, registerAction2, MenuId, MenuRegistry, Action2 } from "../../../../platform/actions/common/actions.js";
import { ActionRunner, Separator, toAction } from "../../../../base/common/actions.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { isSCMResource, isSCMResourceGroup, isSCMRepository, isSCMInput, collectContextMenuActions, getActionViewItemProvider, isSCMActionButton, isSCMViewService, isSCMResourceNode, connectPrimaryMenu } from "./util.js";
import { WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { disposableTimeout, Sequencer, Throttler } from "../../../../base/common/async.js";
import { ResourceTree } from "../../../../base/common/resourceTree.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { compareFileNames, comparePaths } from "../../../../base/common/comparers.js";
import { createMatches } from "../../../../base/common/filters.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { localize } from "../../../../nls.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { compare } from "../../../../base/common/strings.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { RepositoryActionRunner, RepositoryRenderer } from "./scmRepositoryRenderer.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { API_OPEN_DIFF_EDITOR_COMMAND_ID, API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { getFlatContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Button, ButtonWithDropdown } from "../../../../base/browser/ui/button/button.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { RepositoryContextKeys } from "./scmViewService.js";
import { defaultButtonStyles, defaultCountBadgeStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { Schemas } from "../../../../base/common/network.js";
import { fillEditorsDragData } from "../../../browser/dnd.js";
import { CodeDataTransfers } from "../../../../platform/dnd/browser/dnd.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { WorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { rot } from "../../../../base/common/numbers.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { OpenScmGroupAction } from "../../multiDiffEditor/browser/scmMultiDiffSourceResolver.js";
import { autorun } from "../../../../base/common/observable.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { SCMInputWidget } from "./scmInput.js";
function processResourceFilterData(uri, filterData) {
  if (!filterData) {
    return [void 0, void 0];
  }
  if (!filterData.label) {
    const matches2 = createMatches(filterData);
    return [matches2, void 0];
  }
  const fileName = basename(uri);
  const label = filterData.label;
  const pathLength = label.length - fileName.length;
  const matches = createMatches(filterData.score);
  if (label === fileName) {
    return [matches, void 0];
  }
  const labelMatches = [];
  const descriptionMatches = [];
  for (const match of matches) {
    if (match.start > pathLength) {
      labelMatches.push({
        start: match.start - pathLength,
        end: match.end - pathLength
      });
    } else if (match.end < pathLength) {
      descriptionMatches.push(match);
    } else {
      labelMatches.push({
        start: 0,
        end: match.end - pathLength
      });
      descriptionMatches.push({
        start: match.start,
        end: pathLength
      });
    }
  }
  return [labelMatches, descriptionMatches];
}
let ActionButtonRenderer = class {
  constructor(commandService, contextMenuService, notificationService) {
    this.commandService = commandService;
    this.contextMenuService = contextMenuService;
    this.notificationService = notificationService;
    this.actionButtons = /* @__PURE__ */ new Map();
  }
  get templateId() {
    return ActionButtonRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.parentElement.parentElement.classList.add("cursor-default", "force-no-hover");
    const buttonContainer = append(container, $(".button-container"));
    const actionButton = new SCMActionButton(buttonContainer, this.contextMenuService, this.commandService, this.notificationService);
    return { actionButton, disposable: Disposable.None, templateDisposable: actionButton };
  }
  renderElement(node, index, templateData) {
    templateData.disposable.dispose();
    const disposables = new DisposableStore();
    const actionButton = node.element;
    templateData.actionButton.setButton(node.element.button);
    this.actionButtons.set(actionButton, templateData.actionButton);
    disposables.add({ dispose: () => this.actionButtons.delete(actionButton) });
    templateData.disposable = disposables;
  }
  renderCompressedElements() {
    throw new Error("Should never happen since node is incompressible");
  }
  focusActionButton(actionButton) {
    this.actionButtons.get(actionButton)?.focus();
  }
  disposeElement(node, index, template) {
    template.disposable.dispose();
  }
  disposeTemplate(templateData) {
    templateData.disposable.dispose();
    templateData.templateDisposable.dispose();
  }
};
ActionButtonRenderer.DEFAULT_HEIGHT = 28;
ActionButtonRenderer.TEMPLATE_ID = "actionButton";
ActionButtonRenderer = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, INotificationService)
], ActionButtonRenderer);
class SCMTreeDragAndDrop {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  getDragURI(element) {
    if (isSCMResource(element)) {
      return element.sourceUri.toString();
    }
    return null;
  }
  onDragStart(data, originalEvent) {
    const items = SCMTreeDragAndDrop.getResourcesFromDragAndDropData(data);
    if (originalEvent.dataTransfer && items?.length) {
      this.instantiationService.invokeFunction((accessor) => fillEditorsDragData(accessor, items, originalEvent));
      const fileResources = items.filter((s) => s.scheme === Schemas.file).map((r) => r.fsPath);
      if (fileResources.length) {
        originalEvent.dataTransfer.setData(CodeDataTransfers.FILES, JSON.stringify(fileResources));
      }
    }
  }
  getDragLabel(elements, originalEvent) {
    if (elements.length === 1) {
      const element = elements[0];
      if (isSCMResource(element)) {
        return basename(element.sourceUri);
      }
    }
    return String(elements.length);
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    return true;
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
  }
  static getResourcesFromDragAndDropData(data) {
    const uris = [];
    for (const element of [...data.context ?? [], ...data.elements]) {
      if (isSCMResource(element)) {
        uris.push(element.sourceUri);
      }
    }
    return uris;
  }
  dispose() {
  }
}
let InputRenderer = class {
  constructor(outerLayout, overflowWidgetsDomNode, updateHeight, instantiationService) {
    this.outerLayout = outerLayout;
    this.overflowWidgetsDomNode = overflowWidgetsDomNode;
    this.updateHeight = updateHeight;
    this.instantiationService = instantiationService;
    this.inputWidgets = /* @__PURE__ */ new Map();
    this.contentHeights = /* @__PURE__ */ new WeakMap();
    this.editorSelections = /* @__PURE__ */ new WeakMap();
  }
  get templateId() {
    return InputRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    container.parentElement.parentElement.classList.add("force-no-hover");
    const templateDisposable = new DisposableStore();
    const inputElement = append(container, $(".scm-input"));
    const inputWidget = this.instantiationService.createInstance(SCMInputWidget, inputElement, this.overflowWidgetsDomNode);
    templateDisposable.add(inputWidget);
    return { inputWidget, inputWidgetHeight: InputRenderer.DEFAULT_HEIGHT, elementDisposables: new DisposableStore(), templateDisposable };
  }
  renderElement(node, index, templateData) {
    const input = node.element;
    templateData.inputWidget.input = input;
    this.inputWidgets.set(input, templateData.inputWidget);
    templateData.elementDisposables.add({
      dispose: () => this.inputWidgets.delete(input)
    });
    const selections = this.editorSelections.get(input);
    if (selections) {
      templateData.inputWidget.selections = selections;
    }
    templateData.elementDisposables.add(toDisposable(() => {
      const selections2 = templateData.inputWidget.selections;
      if (selections2) {
        this.editorSelections.set(input, selections2);
      }
    }));
    templateData.inputWidgetHeight = InputRenderer.DEFAULT_HEIGHT;
    const onDidChangeContentHeight = () => {
      const contentHeight = templateData.inputWidget.getContentHeight();
      this.contentHeights.set(input, contentHeight);
      if (templateData.inputWidgetHeight !== contentHeight) {
        this.updateHeight(input, contentHeight + 10);
        templateData.inputWidgetHeight = contentHeight;
        templateData.inputWidget.layout();
      }
    };
    const startListeningContentHeightChange = () => {
      templateData.elementDisposables.add(templateData.inputWidget.onDidChangeContentHeight(onDidChangeContentHeight));
      onDidChangeContentHeight();
    };
    disposableTimeout(startListeningContentHeightChange, 0, templateData.elementDisposables);
    const layoutEditor = () => templateData.inputWidget.layout();
    templateData.elementDisposables.add(this.outerLayout.onDidChange(layoutEditor));
    layoutEditor();
  }
  renderCompressedElements() {
    throw new Error("Should never happen since node is incompressible");
  }
  disposeElement(group, index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.templateDisposable.dispose();
  }
  getHeight(input) {
    return (this.contentHeights.get(input) ?? InputRenderer.DEFAULT_HEIGHT) + 10;
  }
  getRenderedInputWidget(input) {
    return this.inputWidgets.get(input);
  }
  getFocusedInput() {
    for (const [input, inputWidget] of this.inputWidgets) {
      if (inputWidget.hasFocus()) {
        return input;
      }
    }
    return void 0;
  }
  clearValidation() {
    for (const [, inputWidget] of this.inputWidgets) {
      inputWidget.clearValidation();
    }
  }
};
InputRenderer.DEFAULT_HEIGHT = 26;
InputRenderer.TEMPLATE_ID = "input";
InputRenderer = __decorateClass([
  __decorateParam(3, IInstantiationService)
], InputRenderer);
let ResourceGroupRenderer = class {
  constructor(actionViewItemProvider, actionRunner, commandService, contextKeyService, contextMenuService, keybindingService, menuService, scmViewService, telemetryService) {
    this.actionViewItemProvider = actionViewItemProvider;
    this.actionRunner = actionRunner;
    this.commandService = commandService;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.menuService = menuService;
    this.scmViewService = scmViewService;
    this.telemetryService = telemetryService;
  }
  get templateId() {
    return ResourceGroupRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".resource-group"));
    const name = append(element, $(".name"));
    const actionsContainer = append(element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, {
      actionViewItemProvider: this.actionViewItemProvider,
      actionRunner: this.actionRunner
    }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
    const countContainer = append(element, $(".count"));
    const count = new CountBadge(countContainer, {}, defaultCountBadgeStyles);
    const disposables = combinedDisposable(actionBar, count);
    return { name, count, actionBar, elementDisposables: new DisposableStore(), disposables };
  }
  renderElement(node, index, template) {
    const group = node.element;
    template.name.textContent = group.label;
    template.count.setCount(group.resources.length);
    const menus = this.scmViewService.menus.getRepositoryMenus(group.provider);
    template.elementDisposables.add(connectPrimaryMenu(menus.getResourceGroupMenu(group), (primary) => {
      template.actionBar.setActions(primary);
    }, "inline"));
    template.actionBar.context = group;
  }
  renderCompressedElements(node) {
    throw new Error("Should never happen since node is incompressible");
  }
  disposeElement(group, index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(template) {
    template.elementDisposables.dispose();
    template.disposables.dispose();
  }
};
ResourceGroupRenderer.TEMPLATE_ID = "resource group";
ResourceGroupRenderer = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, ISCMViewService),
  __decorateParam(8, ITelemetryService)
], ResourceGroupRenderer);
class RepositoryPaneActionRunner extends ActionRunner {
  constructor(getSelectedResources) {
    super();
    this.getSelectedResources = getSelectedResources;
  }
  async runAction(action, context) {
    if (!(action instanceof MenuItemAction)) {
      return super.runAction(action, context);
    }
    const isContextResourceGroup = isSCMResourceGroup(context);
    const selection = this.getSelectedResources().filter((r) => isSCMResourceGroup(r) === isContextResourceGroup);
    const contextIsSelected = selection.some((s) => s === context);
    const actualContext = contextIsSelected ? selection : [context];
    const args = actualContext.map((e) => ResourceTree.isResourceNode(e) ? ResourceTree.collect(e) : [e]).flat();
    await action.run(...args);
  }
}
let ResourceRenderer = class {
  constructor(viewMode, labels, actionViewItemProvider, actionRunner, commandService, contextKeyService, contextMenuService, keybindingService, labelService, menuService, scmViewService, telemetryService, themeService) {
    this.viewMode = viewMode;
    this.labels = labels;
    this.actionViewItemProvider = actionViewItemProvider;
    this.actionRunner = actionRunner;
    this.commandService = commandService;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.labelService = labelService;
    this.menuService = menuService;
    this.scmViewService = scmViewService;
    this.telemetryService = telemetryService;
    this.themeService = themeService;
    this.disposables = new DisposableStore();
    this.renderedResources = /* @__PURE__ */ new Map();
    themeService.onDidColorThemeChange(this.onDidColorThemeChange, this, this.disposables);
  }
  get templateId() {
    return ResourceRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = append(container, $(".resource"));
    const name = append(element, $(".name"));
    const fileLabel = this.labels.create(name, { supportDescriptionHighlights: true, supportHighlights: true });
    const actionsContainer = append(fileLabel.element, $(".actions"));
    const actionBar = new WorkbenchToolBar(actionsContainer, {
      actionViewItemProvider: this.actionViewItemProvider,
      actionRunner: this.actionRunner
    }, this.menuService, this.contextKeyService, this.contextMenuService, this.keybindingService, this.commandService, this.telemetryService);
    const decorationIcon = append(element, $(".decoration-icon"));
    const actionBarMenuListener = new MutableDisposable();
    const disposables = combinedDisposable(actionBar, fileLabel, actionBarMenuListener);
    return { element, name, fileLabel, decorationIcon, actionBar, actionBarMenu: void 0, actionBarMenuListener, elementDisposables: new DisposableStore(), disposables };
  }
  renderElement(node, index, template) {
    const resourceOrFolder = node.element;
    const iconResource = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.element : resourceOrFolder;
    const uri = ResourceTree.isResourceNode(resourceOrFolder) ? resourceOrFolder.uri : resourceOrFolder.sourceUri;
    const fileKind = ResourceTree.isResourceNode(resourceOrFolder) ? FileKind.FOLDER : FileKind.FILE;
    const tooltip = !ResourceTree.isResourceNode(resourceOrFolder) && resourceOrFolder.decorations.tooltip || "";
    const hidePath = this.viewMode() === ViewMode.Tree;
    let matches;
    let descriptionMatches;
    let strikethrough;
    if (ResourceTree.isResourceNode(resourceOrFolder)) {
      if (resourceOrFolder.element) {
        const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.element.resourceGroup.provider);
        this._renderActionBar(template, resourceOrFolder, menus.getResourceMenu(resourceOrFolder.element));
        template.element.classList.toggle("faded", resourceOrFolder.element.decorations.faded);
        strikethrough = resourceOrFolder.element.decorations.strikeThrough;
      } else {
        const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.context.provider);
        this._renderActionBar(template, resourceOrFolder, menus.getResourceFolderMenu(resourceOrFolder.context));
        matches = createMatches(node.filterData);
        template.element.classList.remove("faded");
      }
    } else {
      const menus = this.scmViewService.menus.getRepositoryMenus(resourceOrFolder.resourceGroup.provider);
      this._renderActionBar(template, resourceOrFolder, menus.getResourceMenu(resourceOrFolder));
      [matches, descriptionMatches] = processResourceFilterData(uri, node.filterData);
      template.element.classList.toggle("faded", resourceOrFolder.decorations.faded);
      strikethrough = resourceOrFolder.decorations.strikeThrough;
    }
    const renderedData = {
      tooltip,
      uri,
      fileLabelOptions: { hidePath, fileKind, matches, descriptionMatches, strikethrough },
      iconResource
    };
    this.renderIcon(template, renderedData);
    this.renderedResources.set(template, renderedData);
    template.elementDisposables.add(toDisposable(() => this.renderedResources.delete(template)));
    template.element.setAttribute("data-tooltip", tooltip);
  }
  disposeElement(resource, index, template) {
    template.elementDisposables.clear();
  }
  renderCompressedElements(node, index, template) {
    const compressed = node.element;
    const folder = compressed.elements[compressed.elements.length - 1];
    const label = compressed.elements.map((e) => e.name);
    const fileKind = FileKind.FOLDER;
    const matches = createMatches(node.filterData);
    template.fileLabel.setResource({ resource: folder.uri, name: label }, {
      fileDecorations: { colors: false, badges: true },
      fileKind,
      matches,
      separator: this.labelService.getSeparator(folder.uri.scheme)
    });
    const menus = this.scmViewService.menus.getRepositoryMenus(folder.context.provider);
    this._renderActionBar(template, folder, menus.getResourceFolderMenu(folder.context));
    template.name.classList.remove("strike-through");
    template.element.classList.remove("faded");
    template.decorationIcon.style.display = "none";
    template.decorationIcon.style.backgroundImage = "";
    template.element.setAttribute("data-tooltip", "");
  }
  disposeCompressedElements(node, index, template) {
    template.elementDisposables.clear();
  }
  disposeTemplate(template) {
    template.elementDisposables.dispose();
    template.disposables.dispose();
  }
  _renderActionBar(template, resourceOrFolder, menu) {
    if (!template.actionBarMenu || template.actionBarMenu !== menu) {
      template.actionBarMenu = menu;
      template.actionBarMenuListener.value = connectPrimaryMenu(menu, (primary) => {
        template.actionBar.setActions(primary);
      }, "inline");
    }
    template.actionBar.context = resourceOrFolder;
  }
  onDidColorThemeChange() {
    for (const [template, data] of this.renderedResources) {
      this.renderIcon(template, data);
    }
  }
  renderIcon(template, data) {
    const theme = this.themeService.getColorTheme();
    const icon = isDark(theme.type) ? data.iconResource?.decorations.iconDark : data.iconResource?.decorations.icon;
    template.fileLabel.setFile(data.uri, {
      ...data.fileLabelOptions,
      fileDecorations: { colors: false, badges: !icon }
    });
    if (icon) {
      if (ThemeIcon.isThemeIcon(icon)) {
        template.decorationIcon.className = `decoration-icon ${ThemeIcon.asClassName(icon)}`;
        if (icon.color) {
          template.decorationIcon.style.color = theme.getColor(icon.color.id)?.toString() ?? "";
        }
        template.decorationIcon.style.display = "";
        template.decorationIcon.style.backgroundImage = "";
      } else {
        template.decorationIcon.className = "decoration-icon";
        template.decorationIcon.style.color = "";
        template.decorationIcon.style.display = "";
        template.decorationIcon.style.backgroundImage = asCSSUrl(icon);
      }
      template.decorationIcon.title = data.tooltip;
    } else {
      template.decorationIcon.className = "decoration-icon";
      template.decorationIcon.style.color = "";
      template.decorationIcon.style.display = "none";
      template.decorationIcon.style.backgroundImage = "";
      template.decorationIcon.title = "";
    }
  }
  dispose() {
    this.disposables.dispose();
  }
};
ResourceRenderer.TEMPLATE_ID = "resource";
ResourceRenderer = __decorateClass([
  __decorateParam(4, ICommandService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, ILabelService),
  __decorateParam(9, IMenuService),
  __decorateParam(10, ISCMViewService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IThemeService)
], ResourceRenderer);
class ListDelegate {
  constructor(inputRenderer) {
    this.inputRenderer = inputRenderer;
  }
  getHeight(element) {
    if (isSCMInput(element)) {
      return this.inputRenderer.getHeight(element);
    } else if (isSCMActionButton(element)) {
      return ActionButtonRenderer.DEFAULT_HEIGHT + 8;
    } else {
      return 22;
    }
  }
  getTemplateId(element) {
    if (isSCMRepository(element)) {
      return RepositoryRenderer.TEMPLATE_ID;
    } else if (isSCMInput(element)) {
      return InputRenderer.TEMPLATE_ID;
    } else if (isSCMActionButton(element)) {
      return ActionButtonRenderer.TEMPLATE_ID;
    } else if (isSCMResourceGroup(element)) {
      return ResourceGroupRenderer.TEMPLATE_ID;
    } else if (isSCMResource(element) || isSCMResourceNode(element)) {
      return ResourceRenderer.TEMPLATE_ID;
    } else {
      throw new Error("Unknown element");
    }
  }
}
class SCMTreeCompressionDelegate {
  isIncompressible(element) {
    if (ResourceTree.isResourceNode(element)) {
      return element.childrenCount === 0 || !element.parent || !element.parent.parent;
    }
    return true;
  }
}
class SCMTreeFilter {
  filter(element) {
    if (isSCMResourceGroup(element)) {
      return element.resources.length > 0 || !element.hideWhenEmpty;
    } else {
      return true;
    }
  }
}
class SCMTreeSorter {
  constructor(viewMode, viewSortKey) {
    this.viewMode = viewMode;
    this.viewSortKey = viewSortKey;
  }
  compare(one, other) {
    if (isSCMRepository(one)) {
      if (!isSCMRepository(other)) {
        throw new Error("Invalid comparison");
      }
      return 0;
    }
    if (isSCMInput(one)) {
      return -1;
    } else if (isSCMInput(other)) {
      return 1;
    }
    if (isSCMActionButton(one)) {
      return -1;
    } else if (isSCMActionButton(other)) {
      return 1;
    }
    if (isSCMResourceGroup(one)) {
      return isSCMResourceGroup(other) ? 0 : -1;
    }
    if (this.viewMode() === ViewMode.List) {
      if (this.viewSortKey() === "name" /* Name */) {
        const oneName2 = basename(one.sourceUri);
        const otherName2 = basename(other.sourceUri);
        return compareFileNames(oneName2, otherName2);
      }
      if (this.viewSortKey() === "status" /* Status */) {
        const oneTooltip = one.decorations.tooltip ?? "";
        const otherTooltip = other.decorations.tooltip ?? "";
        if (oneTooltip !== otherTooltip) {
          return compare(oneTooltip, otherTooltip);
        }
      }
      const onePath = one.sourceUri.fsPath;
      const otherPath = other.sourceUri.fsPath;
      return comparePaths(onePath, otherPath);
    }
    const oneIsDirectory = ResourceTree.isResourceNode(one);
    const otherIsDirectory = ResourceTree.isResourceNode(other);
    if (oneIsDirectory !== otherIsDirectory) {
      return oneIsDirectory ? -1 : 1;
    }
    const oneName = ResourceTree.isResourceNode(one) ? one.name : basename(one.sourceUri);
    const otherName = ResourceTree.isResourceNode(other) ? other.name : basename(other.sourceUri);
    return compareFileNames(oneName, otherName);
  }
}
let SCMTreeKeyboardNavigationLabelProvider = class {
  constructor(viewMode, labelService) {
    this.viewMode = viewMode;
    this.labelService = labelService;
  }
  getKeyboardNavigationLabel(element) {
    if (ResourceTree.isResourceNode(element)) {
      return element.name;
    } else if (isSCMRepository(element) || isSCMInput(element) || isSCMActionButton(element)) {
      return void 0;
    } else if (isSCMResourceGroup(element)) {
      return element.label;
    } else {
      if (this.viewMode() === ViewMode.List) {
        const fileName = basename(element.sourceUri);
        const filePath = this.labelService.getUriLabel(element.sourceUri, { relative: true });
        return [fileName, filePath];
      } else {
        return basename(element.sourceUri);
      }
    }
  }
  getCompressedNodeKeyboardNavigationLabel(elements) {
    const folders = elements;
    return folders.map((e) => e.name).join("/");
  }
};
SCMTreeKeyboardNavigationLabelProvider = __decorateClass([
  __decorateParam(1, ILabelService)
], SCMTreeKeyboardNavigationLabelProvider);
function getSCMResourceId(element) {
  if (isSCMRepository(element)) {
    const provider = element.provider;
    return `repo:${provider.id}`;
  } else if (isSCMInput(element)) {
    const provider = element.repository.provider;
    return `input:${provider.id}`;
  } else if (isSCMActionButton(element)) {
    const provider = element.repository.provider;
    return `actionButton:${provider.id}`;
  } else if (isSCMResourceGroup(element)) {
    const provider = element.provider;
    return `resourceGroup:${provider.id}/${element.id}`;
  } else if (isSCMResource(element)) {
    const group = element.resourceGroup;
    const provider = group.provider;
    return `resource:${provider.id}/${group.id}/${element.sourceUri.toString()}`;
  } else if (isSCMResourceNode(element)) {
    const group = element.context;
    return `folder:${group.provider.id}/${group.id}/$FOLDER/${element.uri.toString()}`;
  } else {
    throw new Error("Invalid tree element");
  }
}
class SCMResourceIdentityProvider {
  getId(element) {
    return getSCMResourceId(element);
  }
}
let SCMAccessibilityProvider = class {
  constructor(accessibilityService, configurationService, keybindingService, labelService) {
    this.accessibilityService = accessibilityService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.labelService = labelService;
  }
  getWidgetAriaLabel() {
    return localize("scm", "Source Control Management");
  }
  getAriaLabel(element) {
    if (ResourceTree.isResourceNode(element)) {
      return this.labelService.getUriLabel(element.uri, { relative: true, noPrefix: true }) || element.name;
    } else if (isSCMRepository(element)) {
      return `${element.provider.name} ${element.provider.label}`;
    } else if (isSCMInput(element)) {
      const verbosity = this.configurationService.getValue(AccessibilityVerbositySettingId.SourceControl) === true;
      if (!verbosity || !this.accessibilityService.isScreenReaderOptimized()) {
        return localize("scmInput", "Source Control Input");
      }
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      return kbLabel ? localize("scmInputRow.accessibilityHelp", "Source Control Input, Use {0} to open Source Control Accessibility Help.", kbLabel) : localize("scmInputRow.accessibilityHelpNoKb", "Source Control Input, Run the Open Accessibility Help command for more information.");
    } else if (isSCMActionButton(element)) {
      return element.button?.command.title ?? "";
    } else if (isSCMResourceGroup(element)) {
      return element.label;
    } else {
      const result = [];
      result.push(basename(element.sourceUri));
      if (element.decorations.tooltip) {
        result.push(element.decorations.tooltip);
      }
      const path = this.labelService.getUriLabel(dirname(element.sourceUri), { relative: true, noPrefix: true });
      if (path) {
        result.push(path);
      }
      return result.join(", ");
    }
  }
};
SCMAccessibilityProvider = __decorateClass([
  __decorateParam(0, IAccessibilityService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, ILabelService)
], SCMAccessibilityProvider);
var ViewSortKey = /* @__PURE__ */ ((ViewSortKey2) => {
  ViewSortKey2["Path"] = "path";
  ViewSortKey2["Name"] = "name";
  ViewSortKey2["Status"] = "status";
  return ViewSortKey2;
})(ViewSortKey || {});
const Menus = {
  ViewSort: new MenuId("SCMViewSort"),
  Repositories: new MenuId("SCMRepositories"),
  ChangesSettings: new MenuId("SCMChangesSettings")
};
const ContextKeys = {
  SCMViewMode: new RawContextKey("scmViewMode", ViewMode.List),
  SCMViewSortKey: new RawContextKey("scmViewSortKey", "path" /* Path */),
  SCMViewAreAllRepositoriesCollapsed: new RawContextKey("scmViewAreAllRepositoriesCollapsed", false),
  SCMViewIsAnyRepositoryCollapsible: new RawContextKey("scmViewIsAnyRepositoryCollapsible", false),
  SCMProvider: new RawContextKey("scmProvider", void 0),
  SCMProviderRootUri: new RawContextKey("scmProviderRootUri", void 0),
  SCMProviderHasRootUri: new RawContextKey("scmProviderHasRootUri", void 0),
  SCMHistoryItemCount: new RawContextKey("scmHistoryItemCount", 0),
  SCMHistoryViewMode: new RawContextKey("scmHistoryViewMode", ViewMode.List),
  SCMCurrentHistoryItemRefHasRemote: new RawContextKey("scmCurrentHistoryItemRefHasRemote", false),
  SCMCurrentHistoryItemRefHasBase: new RawContextKey("scmCurrentHistoryItemRefHasBase", false),
  SCMCurrentHistoryItemRefInFilter: new RawContextKey("scmCurrentHistoryItemRefInFilter", false),
  RepositoryCount: new RawContextKey("scmRepositoryCount", 0),
  RepositoryVisibilityCount: new RawContextKey("scmRepositoryVisibleCount", 0),
  RepositoryVisibility(repository) {
    return new RawContextKey(`scmRepositoryVisible:${repository.provider.id}`, false);
  }
};
MenuRegistry.appendMenuItem(MenuId.SCMTitle, {
  title: localize("sortAction", "View & Sort"),
  submenu: Menus.ViewSort,
  when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0)),
  group: "0_view&sort",
  order: 1
});
MenuRegistry.appendMenuItem(Menus.ViewSort, {
  title: localize("repositories", "Repositories"),
  submenu: Menus.Repositories,
  when: ContextKeyExpr.greater(ContextKeys.RepositoryCount.key, 1),
  group: "0_repositories"
});
class RepositoryVisibilityAction extends Action2 {
  constructor(repository) {
    super({
      id: `workbench.scm.action.toggleRepositoryVisibility.${repository.provider.id}`,
      title: repository.provider.name,
      f1: false,
      precondition: ContextKeyExpr.or(ContextKeys.RepositoryVisibilityCount.notEqualsTo(1), ContextKeys.RepositoryVisibility(repository).isEqualTo(false)),
      toggled: ContextKeys.RepositoryVisibility(repository).isEqualTo(true),
      menu: { id: Menus.Repositories, group: "0_repositories" }
    });
    this.repository = repository;
  }
  run(accessor) {
    const scmViewService = accessor.get(ISCMViewService);
    scmViewService.toggleVisibility(this.repository);
  }
}
let RepositoryVisibilityActionController = class {
  constructor(contextKeyService, scmViewService, scmService) {
    this.contextKeyService = contextKeyService;
    this.scmViewService = scmViewService;
    this.items = /* @__PURE__ */ new Map();
    this.disposables = new DisposableStore();
    this.repositoryCountContextKey = ContextKeys.RepositoryCount.bindTo(contextKeyService);
    this.repositoryVisibilityCountContextKey = ContextKeys.RepositoryVisibilityCount.bindTo(contextKeyService);
    scmViewService.onDidChangeVisibleRepositories(this.onDidChangeVisibleRepositories, this, this.disposables);
    scmService.onDidAddRepository(this.onDidAddRepository, this, this.disposables);
    scmService.onDidRemoveRepository(this.onDidRemoveRepository, this, this.disposables);
    for (const repository of scmService.repositories) {
      this.onDidAddRepository(repository);
    }
  }
  onDidAddRepository(repository) {
    if (repository.provider.isHidden) {
      return;
    }
    const action = registerAction2(class extends RepositoryVisibilityAction {
      constructor() {
        super(repository);
      }
    });
    const contextKey = ContextKeys.RepositoryVisibility(repository).bindTo(this.contextKeyService);
    contextKey.set(this.scmViewService.isVisible(repository));
    this.items.set(repository, {
      contextKey,
      dispose() {
        contextKey.reset();
        action.dispose();
      }
    });
    this.updateRepositoryContextKeys();
  }
  onDidRemoveRepository(repository) {
    this.items.get(repository)?.dispose();
    this.items.delete(repository);
    this.updateRepositoryContextKeys();
  }
  onDidChangeVisibleRepositories() {
    let count = 0;
    for (const [repository, item] of this.items) {
      const isVisible = this.scmViewService.isVisible(repository);
      item.contextKey.set(isVisible);
      if (isVisible) {
        count++;
      }
    }
    this.repositoryCountContextKey.set(this.items.size);
    this.repositoryVisibilityCountContextKey.set(count);
  }
  updateRepositoryContextKeys() {
    this.repositoryCountContextKey.set(this.items.size);
    this.repositoryVisibilityCountContextKey.set(Iterable.reduce(this.items.keys(), (r, repository) => r + (this.scmViewService.isVisible(repository) ? 1 : 0), 0));
  }
  dispose() {
    this.disposables.dispose();
    dispose(this.items.values());
    this.items.clear();
  }
};
RepositoryVisibilityActionController = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ISCMViewService),
  __decorateParam(2, ISCMService)
], RepositoryVisibilityActionController);
class SetListViewModeAction extends ViewAction {
  constructor(id = "workbench.scm.action.setListViewMode", menu = {}) {
    super({
      id,
      title: localize("setListViewMode", "View as List"),
      viewId: VIEW_PANE_ID,
      f1: false,
      icon: Codicon.listTree,
      toggled: ContextKeys.SCMViewMode.isEqualTo(ViewMode.List),
      menu: { id: Menus.ViewSort, group: "1_viewmode", ...menu }
    });
  }
  async runInView(_, view) {
    view.viewMode = ViewMode.List;
  }
}
class SetListViewModeNavigationAction extends SetListViewModeAction {
  constructor() {
    super(
      "workbench.scm.action.setListViewModeNavigation",
      {
        id: MenuId.SCMTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.SCMViewMode.isEqualTo(ViewMode.Tree)),
        group: "navigation",
        isHiddenByDefault: true,
        order: -1e3
      }
    );
  }
}
class SetTreeViewModeAction extends ViewAction {
  constructor(id = "workbench.scm.action.setTreeViewMode", menu = {}) {
    super(
      {
        id,
        title: localize("setTreeViewMode", "View as Tree"),
        viewId: VIEW_PANE_ID,
        f1: false,
        icon: Codicon.listFlat,
        toggled: ContextKeys.SCMViewMode.isEqualTo(ViewMode.Tree),
        menu: { id: Menus.ViewSort, group: "1_viewmode", ...menu }
      }
    );
  }
  async runInView(_, view) {
    view.viewMode = ViewMode.Tree;
  }
}
class SetTreeViewModeNavigationAction extends SetTreeViewModeAction {
  constructor() {
    super(
      "workbench.scm.action.setTreeViewModeNavigation",
      {
        id: MenuId.SCMTitle,
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.RepositoryCount.notEqualsTo(0), ContextKeys.SCMViewMode.isEqualTo(ViewMode.List)),
        group: "navigation",
        isHiddenByDefault: true,
        order: -1e3
      }
    );
  }
}
registerAction2(SetListViewModeAction);
registerAction2(SetTreeViewModeAction);
registerAction2(SetListViewModeNavigationAction);
registerAction2(SetTreeViewModeNavigationAction);
class RepositorySortAction extends Action2 {
  constructor(sortKey, title) {
    super({
      id: `workbench.scm.action.repositories.setSortKey.${sortKey}`,
      title,
      f1: false,
      toggled: RepositoryContextKeys.RepositorySortKey.isEqualTo(sortKey),
      menu: [
        {
          id: Menus.Repositories,
          group: "1_sort"
        },
        {
          id: MenuId.SCMSourceControlTitle,
          group: "1_sort"
        }
      ]
    });
    this.sortKey = sortKey;
  }
  run(accessor) {
    accessor.get(ISCMViewService).toggleSortKey(this.sortKey);
  }
}
class RepositorySortByDiscoveryTimeAction extends RepositorySortAction {
  constructor() {
    super(ISCMRepositorySortKey.DiscoveryTime, localize("repositorySortByDiscoveryTime", "Sort by Discovery Time"));
  }
}
class RepositorySortByNameAction extends RepositorySortAction {
  constructor() {
    super(ISCMRepositorySortKey.Name, localize("repositorySortByName", "Sort by Name"));
  }
}
class RepositorySortByPathAction extends RepositorySortAction {
  constructor() {
    super(ISCMRepositorySortKey.Path, localize("repositorySortByPath", "Sort by Path"));
  }
}
registerAction2(RepositorySortByDiscoveryTimeAction);
registerAction2(RepositorySortByNameAction);
registerAction2(RepositorySortByPathAction);
class RepositorySelectionModeAction extends Action2 {
  constructor(selectionMode, title, order) {
    super({
      id: `workbench.scm.action.repositories.setSelectionMode.${selectionMode}`,
      title,
      f1: false,
      toggled: RepositoryContextKeys.RepositorySelectionMode.isEqualTo(selectionMode),
      menu: [
        {
          id: Menus.Repositories,
          when: ContextKeyExpr.and(
            ContextKeyExpr.has("scm.providerCount"),
            ContextKeyExpr.greater("scm.providerCount", 1)
          ),
          group: "2_selectionMode",
          order
        },
        {
          id: MenuId.SCMSourceControlTitle,
          when: ContextKeyExpr.and(
            ContextKeyExpr.has("scm.providerCount"),
            ContextKeyExpr.greater("scm.providerCount", 1)
          ),
          group: "2_selectionMode",
          order
        }
      ]
    });
    this.selectionMode = selectionMode;
  }
  run(accessor) {
    accessor.get(ISCMViewService).toggleSelectionMode(this.selectionMode);
  }
}
class RepositorySingleSelectionModeAction extends RepositorySelectionModeAction {
  constructor() {
    super(ISCMRepositorySelectionMode.Single, localize("repositorySingleSelectionMode", "Select Single Repository"), 1);
  }
}
class RepositoryMultiSelectionModeAction extends RepositorySelectionModeAction {
  constructor() {
    super(ISCMRepositorySelectionMode.Multiple, localize("repositoryMultiSelectionMode", "Select Multiple Repositories"), 2);
  }
}
registerAction2(RepositorySingleSelectionModeAction);
registerAction2(RepositoryMultiSelectionModeAction);
class SetSortKeyAction extends ViewAction {
  constructor(sortKey, title) {
    super({
      id: `workbench.scm.action.setSortKey.${sortKey}`,
      title,
      viewId: VIEW_PANE_ID,
      f1: false,
      toggled: ContextKeys.SCMViewSortKey.isEqualTo(sortKey),
      precondition: ContextKeys.SCMViewMode.isEqualTo(ViewMode.List),
      menu: { id: Menus.ViewSort, group: "2_sort" }
    });
    this.sortKey = sortKey;
  }
  async runInView(_, view) {
    view.viewSortKey = this.sortKey;
  }
}
class SetSortByNameAction extends SetSortKeyAction {
  constructor() {
    super("name" /* Name */, localize("sortChangesByName", "Sort Changes by Name"));
  }
}
class SetSortByPathAction extends SetSortKeyAction {
  constructor() {
    super("path" /* Path */, localize("sortChangesByPath", "Sort Changes by Path"));
  }
}
class SetSortByStatusAction extends SetSortKeyAction {
  constructor() {
    super("status" /* Status */, localize("sortChangesByStatus", "Sort Changes by Status"));
  }
}
registerAction2(SetSortByNameAction);
registerAction2(SetSortByPathAction);
registerAction2(SetSortByStatusAction);
class CollapseAllRepositoriesAction extends ViewAction {
  constructor() {
    super({
      id: `workbench.scm.action.collapseAllRepositories`,
      title: localize("collapse all", "Collapse All Repositories"),
      viewId: VIEW_PANE_ID,
      f1: false,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.SCMTitle,
        group: "navigation",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.SCMViewIsAnyRepositoryCollapsible.isEqualTo(true), ContextKeys.SCMViewAreAllRepositoriesCollapsed.isEqualTo(false))
      }
    });
  }
  async runInView(_, view) {
    view.collapseAllRepositories();
  }
}
class ExpandAllRepositoriesAction extends ViewAction {
  constructor() {
    super({
      id: `workbench.scm.action.expandAllRepositories`,
      title: localize("expand all", "Expand All Repositories"),
      viewId: VIEW_PANE_ID,
      f1: false,
      icon: Codicon.expandAll,
      menu: {
        id: MenuId.SCMTitle,
        group: "navigation",
        when: ContextKeyExpr.and(ContextKeyExpr.equals("view", VIEW_PANE_ID), ContextKeys.SCMViewIsAnyRepositoryCollapsible.isEqualTo(true), ContextKeys.SCMViewAreAllRepositoriesCollapsed.isEqualTo(true))
      }
    });
  }
  async runInView(_, view) {
    view.expandAllRepositories();
  }
}
registerAction2(CollapseAllRepositoriesAction);
registerAction2(ExpandAllRepositoriesAction);
class CollapseAllAction extends ViewAction {
  constructor() {
    super({
      id: `workbench.scm.action.collapseAll`,
      title: localize("scmCollapseAll", "Collapse All"),
      viewId: VIEW_PANE_ID,
      f1: false,
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.SCMResourceGroupContext,
        group: "9_collapse",
        when: ContextKeys.SCMViewMode.isEqualTo(ViewMode.Tree)
      }
    });
  }
  async runInView(_accessor, view, context) {
    if (context) {
      view.collapseAllResources(context);
    }
  }
}
registerAction2(CollapseAllAction);
let SCMViewPane = class extends ViewPane {
  constructor(options, commandService, editorService, menuService, scmService, scmViewService, storageService, uriIdentityService, keybindingService, themeService, contextMenuService, instantiationService, viewDescriptorService, configurationService, contextKeyService, openerService, hoverService) {
    super({ ...options, titleMenuId: MenuId.SCMTitle }, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.commandService = commandService;
    this.editorService = editorService;
    this.menuService = menuService;
    this.scmService = scmService;
    this.scmViewService = scmViewService;
    this.storageService = storageService;
    this.uriIdentityService = uriIdentityService;
    this._onDidChangeViewMode = this._register(new Emitter());
    this.onDidChangeViewMode = this._onDidChangeViewMode.event;
    this._onDidChangeViewSortKey = this._register(new Emitter());
    this.onDidChangeViewSortKey = this._onDidChangeViewSortKey.event;
    this.items = new DisposableMap();
    this.visibilityDisposables = new DisposableStore();
    this.treeOperationSequencer = new Sequencer();
    this.revealResourceThrottler = new Throttler();
    this.updateChildrenThrottler = new Throttler();
    this.disposables = new DisposableStore();
    this._viewMode = this.getViewMode();
    this._viewSortKey = this.getViewSortKey();
    this.viewModeContextKey = ContextKeys.SCMViewMode.bindTo(contextKeyService);
    this.viewModeContextKey.set(this._viewMode);
    this.viewSortKeyContextKey = ContextKeys.SCMViewSortKey.bindTo(contextKeyService);
    this.viewSortKeyContextKey.set(this.viewSortKey);
    this.areAllRepositoriesCollapsedContextKey = ContextKeys.SCMViewAreAllRepositoriesCollapsed.bindTo(contextKeyService);
    this.isAnyRepositoryCollapsibleContextKey = ContextKeys.SCMViewIsAnyRepositoryCollapsible.bindTo(contextKeyService);
    this.scmProviderContextKey = ContextKeys.SCMProvider.bindTo(contextKeyService);
    this.scmProviderRootUriContextKey = ContextKeys.SCMProviderRootUri.bindTo(contextKeyService);
    this.scmProviderHasRootUriContextKey = ContextKeys.SCMProviderHasRootUri.bindTo(contextKeyService);
    this._onDidLayout = this._register(new Emitter());
    this.layoutCache = { height: void 0, width: void 0, onDidChange: this._onDidLayout.event };
    this.storageService.onDidChangeValue(StorageScope.WORKSPACE, void 0, this.disposables)((e) => {
      switch (e.key) {
        case "scm.viewMode":
          this.viewMode = this.getViewMode();
          break;
        case "scm.viewSortKey":
          this.viewSortKey = this.getViewSortKey();
          break;
      }
    }, this, this.disposables);
    this.storageService.onWillSaveState((e) => {
      this.viewMode = this.getViewMode();
      this.viewSortKey = this.getViewSortKey();
      this.storeTreeViewState();
    }, this, this.disposables);
    Event.any(this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository)(() => this._onDidChangeViewWelcomeState.fire(), this, this.disposables);
    this.disposables.add(this.revealResourceThrottler);
    this.disposables.add(this.updateChildrenThrottler);
  }
  get viewMode() {
    return this._viewMode;
  }
  set viewMode(mode) {
    if (this._viewMode === mode) {
      return;
    }
    this._viewMode = mode;
    this.viewSortKey = this.getViewSortKey();
    this.updateChildren();
    this.onDidActiveEditorChange();
    this._onDidChangeViewMode.fire(mode);
    this.viewModeContextKey.set(mode);
    this.updateIndentStyles(this.themeService.getFileIconTheme());
    this.storageService.store(`scm.viewMode`, mode, StorageScope.WORKSPACE, StorageTarget.USER);
  }
  get viewSortKey() {
    return this._viewSortKey;
  }
  set viewSortKey(sortKey) {
    if (this._viewSortKey === sortKey) {
      return;
    }
    this._viewSortKey = sortKey;
    this.updateChildren();
    this.viewSortKeyContextKey.set(sortKey);
    this._onDidChangeViewSortKey.fire(sortKey);
    if (this._viewMode === ViewMode.List) {
      this.storageService.store(`scm.viewSortKey`, sortKey, StorageScope.WORKSPACE, StorageTarget.USER);
    }
  }
  layoutBody(height = this.layoutCache.height, width = this.layoutCache.width) {
    if (height === void 0) {
      return;
    }
    if (width !== void 0) {
      super.layoutBody(height, width);
    }
    this.layoutCache.height = height;
    this.layoutCache.width = width;
    this._onDidLayout.fire();
    this.treeContainer.style.height = `${height}px`;
    this.tree.layout(height, width);
  }
  renderBody(container) {
    super.renderBody(container);
    this.treeContainer = append(container, $(".scm-view.show-file-icons"));
    this.treeContainer.classList.add("file-icon-themable-tree");
    this.treeContainer.classList.add("show-file-icons");
    const updateActionsVisibility = () => this.treeContainer.classList.toggle("show-actions", this.configurationService.getValue("scm.alwaysShowActions"));
    Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.alwaysShowActions"), this.disposables)(updateActionsVisibility, this, this.disposables);
    updateActionsVisibility();
    const updateProviderCountVisibility = () => {
      const value = this.configurationService.getValue("scm.providerCountBadge");
      this.treeContainer.classList.toggle("hide-provider-counts", value === "hidden");
      this.treeContainer.classList.toggle("auto-provider-counts", value === "auto");
    };
    Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("scm.providerCountBadge"), this.disposables)(updateProviderCountVisibility, this, this.disposables);
    updateProviderCountVisibility();
    const viewState = this.loadTreeViewState();
    this.createTree(this.treeContainer, viewState);
    this.onDidChangeBodyVisibility(async (visible) => {
      if (visible) {
        this.treeOperationSequencer.queue(async () => {
          await this.tree.setInput(this.scmViewService, viewState);
          Event.filter(
            this.configurationService.onDidChangeConfiguration,
            (e) => e.affectsConfiguration("scm.alwaysShowRepositories"),
            this.visibilityDisposables
          )(() => {
            this.updateActions();
            this.updateChildren();
          }, this, this.visibilityDisposables);
          Event.filter(
            this.configurationService.onDidChangeConfiguration,
            (e) => e.affectsConfiguration("scm.inputMinLineCount") || e.affectsConfiguration("scm.inputMaxLineCount") || e.affectsConfiguration("scm.showActionButton"),
            this.visibilityDisposables
          )(() => this.updateChildren(), this, this.visibilityDisposables);
          this.editorService.onDidActiveEditorChange(this.onDidActiveEditorChange, this, this.visibilityDisposables);
          this.scmViewService.onDidChangeVisibleRepositories(this.onDidChangeVisibleRepositories, this, this.visibilityDisposables);
          this.onDidChangeVisibleRepositories({ added: this.scmViewService.visibleRepositories, removed: Iterable.empty() });
          if (typeof this.treeScrollTop === "number") {
            this.tree.scrollTop = this.treeScrollTop;
            this.treeScrollTop = void 0;
          }
          this.updateRepositoryCollapseAllContextKeys();
        });
      } else {
        this.visibilityDisposables.clear();
        this.onDidChangeVisibleRepositories({ added: Iterable.empty(), removed: [...this.items.keys()] });
        this.treeScrollTop = this.tree.scrollTop;
        this.updateRepositoryCollapseAllContextKeys();
      }
    }, this, this.disposables);
    this.disposables.add(this.instantiationService.createInstance(RepositoryVisibilityActionController));
    this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this, this.disposables);
    this.updateIndentStyles(this.themeService.getFileIconTheme());
  }
  createTree(container, viewState) {
    const overflowWidgetsDomNode = $(".scm-overflow-widgets-container.monaco-editor");
    this.inputRenderer = this.instantiationService.createInstance(InputRenderer, this.layoutCache, overflowWidgetsDomNode, (input, height) => {
      try {
        this.tree.updateElementHeight(input, height);
      } catch {
      }
    });
    this.actionButtonRenderer = this.instantiationService.createInstance(ActionButtonRenderer);
    this.listLabels = this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility });
    this.disposables.add(this.listLabels);
    const resourceActionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
    resourceActionRunner.onWillRun(() => this.tree.domFocus(), this, this.disposables);
    this.disposables.add(resourceActionRunner);
    const treeDataSource = this.instantiationService.createInstance(SCMTreeDataSource, () => this.viewMode);
    this.disposables.add(treeDataSource);
    const compressionEnabled = observableConfigValue("scm.compactFolders", true, this.configurationService);
    this.tree = this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "SCM Tree Repo",
      container,
      new ListDelegate(this.inputRenderer),
      new SCMTreeCompressionDelegate(),
      [
        this.inputRenderer,
        this.actionButtonRenderer,
        this.instantiationService.createInstance(RepositoryRenderer, MenuId.SCMTitle, getActionViewItemProvider(this.instantiationService)),
        this.instantiationService.createInstance(ResourceGroupRenderer, getActionViewItemProvider(this.instantiationService), resourceActionRunner),
        this.instantiationService.createInstance(ResourceRenderer, () => this.viewMode, this.listLabels, getActionViewItemProvider(this.instantiationService), resourceActionRunner)
      ],
      treeDataSource,
      {
        horizontalScrolling: false,
        setRowLineHeight: false,
        transformOptimization: false,
        filter: new SCMTreeFilter(),
        dnd: new SCMTreeDragAndDrop(this.instantiationService),
        identityProvider: new SCMResourceIdentityProvider(),
        sorter: new SCMTreeSorter(() => this.viewMode, () => this.viewSortKey),
        keyboardNavigationLabelProvider: this.instantiationService.createInstance(SCMTreeKeyboardNavigationLabelProvider, () => this.viewMode),
        overrideStyles: this.getLocationBasedColors().listOverrideStyles,
        compressionEnabled: compressionEnabled.get(),
        collapseByDefault: (e) => {
          return !(isSCMRepository(e) || isSCMResourceGroup(e) || isSCMResourceNode(e));
        },
        accessibilityProvider: this.instantiationService.createInstance(SCMAccessibilityProvider),
        twistieAdditionalCssClass: (e) => {
          if (isSCMActionButton(e) || isSCMInput(e)) {
            return "force-no-twistie";
          }
          return void 0;
        }
      }
    );
    this.disposables.add(this.tree);
    this.tree.onDidOpen(this.open, this, this.disposables);
    this.tree.onContextMenu(this.onListContextMenu, this, this.disposables);
    this.tree.onDidScroll(this.inputRenderer.clearValidation, this.inputRenderer, this.disposables);
    Event.filter(this.tree.onDidChangeCollapseState, (e) => isSCMRepository(e.node.element?.element), this.disposables)(this.updateRepositoryCollapseAllContextKeys, this, this.disposables);
    this.disposables.add(autorun((reader) => {
      this.tree.updateOptions({
        compressionEnabled: compressionEnabled.read(reader)
      });
    }));
    append(container, overflowWidgetsDomNode);
  }
  async open(e) {
    if (!e.element) {
      return;
    } else if (isSCMRepository(e.element)) {
      this.scmViewService.focus(e.element);
      return;
    } else if (isSCMInput(e.element)) {
      this.scmViewService.focus(e.element.repository);
      const widget = this.inputRenderer.getRenderedInputWidget(e.element);
      if (widget) {
        widget.focus();
        this.tree.setFocus([], e.browserEvent);
        const selection = this.tree.getSelection();
        if (selection.length === 1 && selection[0] === e.element) {
          setTimeout(() => this.tree.setSelection([]));
        }
      }
      return;
    } else if (isSCMActionButton(e.element)) {
      this.scmViewService.focus(e.element.repository);
      this.actionButtonRenderer.focusActionButton(e.element);
      this.tree.setFocus([], e.browserEvent);
      return;
    } else if (isSCMResourceGroup(e.element)) {
      const provider = e.element.provider;
      const repository = Iterable.find(this.scmService.repositories, (r) => r.provider === provider);
      if (repository) {
        this.scmViewService.focus(repository);
      }
      return;
    } else if (isSCMResource(e.element)) {
      if (e.element.command?.id === API_OPEN_EDITOR_COMMAND_ID || e.element.command?.id === API_OPEN_DIFF_EDITOR_COMMAND_ID) {
        if (isPointerEvent(e.browserEvent) && e.browserEvent.button === 1) {
          const resourceGroup = e.element.resourceGroup;
          const title = `${resourceGroup.provider.label}: ${resourceGroup.label}`;
          await OpenScmGroupAction.openMultiFileDiffEditor(this.editorService, title, resourceGroup.provider.rootUri, resourceGroup.id, {
            ...e.editorOptions,
            viewState: {
              revealData: {
                resource: {
                  original: e.element.multiDiffEditorOriginalUri,
                  modified: e.element.multiDiffEditorModifiedUri
                }
              }
            },
            preserveFocus: true
          });
        } else {
          await this.commandService.executeCommand(e.element.command.id, ...e.element.command.arguments || [], e);
        }
      } else {
        await e.element.open(!!e.editorOptions.preserveFocus);
        if (e.editorOptions.pinned) {
          const activeEditorPane = this.editorService.activeEditorPane;
          activeEditorPane?.group.pinEditor(activeEditorPane.input);
        }
      }
      const provider = e.element.resourceGroup.provider;
      const repository = Iterable.find(this.scmService.repositories, (r) => r.provider === provider);
      if (repository) {
        this.scmViewService.focus(repository);
      }
    } else if (isSCMResourceNode(e.element)) {
      const provider = e.element.context.provider;
      const repository = Iterable.find(this.scmService.repositories, (r) => r.provider === provider);
      if (repository) {
        this.scmViewService.focus(repository);
      }
      return;
    }
  }
  onDidActiveEditorChange() {
    if (!this.configurationService.getValue("scm.autoReveal")) {
      return;
    }
    const uri = EditorResourceAccessor.getOriginalUri(this.editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (!uri) {
      return;
    }
    if (this.tree.getFocus().some((e) => isSCMResource(e) && this.uriIdentityService.extUri.isEqual(e.sourceUri, uri)) && this.tree.getSelection().some((e) => isSCMResource(e) && this.uriIdentityService.extUri.isEqual(e.sourceUri, uri))) {
      return;
    }
    this.revealResourceThrottler.queue(
      () => this.treeOperationSequencer.queue(
        async () => {
          for (const repository of this.scmViewService.visibleRepositories) {
            const item = this.items.get(repository);
            if (!item) {
              continue;
            }
            for (let j = repository.provider.groups.length - 1; j >= 0; j--) {
              const groupItem = repository.provider.groups[j];
              const resource = this.viewMode === ViewMode.Tree ? groupItem.resourceTree.getNode(uri)?.element : groupItem.resources.find((r) => this.uriIdentityService.extUri.isEqual(r.sourceUri, uri));
              if (resource) {
                await this.tree.expandTo(resource);
                this.tree.reveal(resource);
                this.tree.setSelection([resource]);
                this.tree.setFocus([resource]);
                return;
              }
            }
          }
        }
      )
    );
  }
  onDidChangeVisibleRepositories({ added, removed }) {
    for (const repository of added) {
      const repositoryDisposables = new DisposableStore();
      repositoryDisposables.add(autorun((reader) => {
        repository.provider.actionButton.read(reader);
        this.updateChildren(repository);
      }));
      repositoryDisposables.add(repository.input.onDidChangeVisibility(() => this.updateChildren(repository)));
      repositoryDisposables.add(repository.provider.onDidChangeResourceGroups(() => this.updateChildren(repository)));
      const resourceGroupDisposables = repositoryDisposables.add(new DisposableMap());
      const onDidChangeResourceGroups = () => {
        for (const [resourceGroup] of resourceGroupDisposables) {
          if (!repository.provider.groups.includes(resourceGroup)) {
            resourceGroupDisposables.deleteAndDispose(resourceGroup);
          }
        }
        for (const resourceGroup of repository.provider.groups) {
          if (!resourceGroupDisposables.has(resourceGroup)) {
            const disposableStore = new DisposableStore();
            disposableStore.add(resourceGroup.onDidChange(() => this.updateChildren(repository)));
            disposableStore.add(resourceGroup.onDidChangeResources(() => this.updateChildren(repository)));
            resourceGroupDisposables.set(resourceGroup, disposableStore);
          }
        }
      };
      repositoryDisposables.add(repository.provider.onDidChangeResourceGroups(onDidChangeResourceGroups));
      onDidChangeResourceGroups();
      this.items.set(repository, repositoryDisposables);
    }
    for (const repository of removed) {
      this.items.deleteAndDispose(repository);
    }
    this.updateChildren();
    this.onDidActiveEditorChange();
  }
  onListContextMenu(e) {
    if (!e.element) {
      const menu = this.menuService.getMenuActions(Menus.ViewSort, this.contextKeyService);
      const actions2 = getFlatContextMenuActions(menu);
      return this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => actions2,
        onHide: () => {
        }
      });
    }
    const element = e.element;
    let context = element;
    let actions = [];
    const disposables = new DisposableStore();
    let actionRunner = new RepositoryPaneActionRunner(() => this.getSelectedResources());
    disposables.add(actionRunner);
    if (isSCMRepository(element)) {
      const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
      const menu = menus.getRepositoryContextMenu(element);
      context = element.provider;
      actionRunner = new RepositoryActionRunner(() => this.getSelectedRepositories());
      disposables.add(actionRunner);
      actions = collectContextMenuActions(menu);
    } else if (isSCMInput(element) || isSCMActionButton(element)) {
    } else if (isSCMResourceGroup(element)) {
      const menus = this.scmViewService.menus.getRepositoryMenus(element.provider);
      const menu = menus.getResourceGroupMenu(element);
      actions = collectContextMenuActions(menu);
    } else if (isSCMResource(element)) {
      const menus = this.scmViewService.menus.getRepositoryMenus(element.resourceGroup.provider);
      const menu = menus.getResourceMenu(element);
      actions = collectContextMenuActions(menu);
    } else if (isSCMResourceNode(element)) {
      if (element.element) {
        const menus = this.scmViewService.menus.getRepositoryMenus(element.element.resourceGroup.provider);
        const menu = menus.getResourceMenu(element.element);
        actions = collectContextMenuActions(menu);
      } else {
        const menus = this.scmViewService.menus.getRepositoryMenus(element.context.provider);
        const menu = menus.getResourceFolderMenu(element.context);
        actions = collectContextMenuActions(menu);
      }
    }
    disposables.add(actionRunner.onWillRun(() => this.tree.domFocus()));
    this.contextMenuService.showContextMenu({
      actionRunner,
      getAnchor: () => e.anchor,
      getActions: () => actions,
      getActionsContext: () => context,
      onHide: () => disposables.dispose()
    });
  }
  getSelectedRepositories() {
    const focusedRepositories = this.tree.getFocus().filter((r) => !!r && isSCMRepository(r));
    const selectedRepositories = this.tree.getSelection().filter((r) => !!r && isSCMRepository(r));
    return Array.from(/* @__PURE__ */ new Set([...focusedRepositories, ...selectedRepositories]));
  }
  getSelectedResources() {
    return this.tree.getSelection().filter((r) => isSCMResourceGroup(r) || isSCMResource(r) || isSCMResourceNode(r));
  }
  getViewMode() {
    let mode = this.configurationService.getValue("scm.defaultViewMode") === "list" ? ViewMode.List : ViewMode.Tree;
    const storageMode = this.storageService.get(`scm.viewMode`, StorageScope.WORKSPACE);
    if (typeof storageMode === "string") {
      mode = storageMode;
    }
    return mode;
  }
  getViewSortKey() {
    if (this._viewMode === ViewMode.Tree) {
      return "path" /* Path */;
    }
    let viewSortKey;
    const viewSortKeyString = this.configurationService.getValue("scm.defaultViewSortKey");
    switch (viewSortKeyString) {
      case "name":
        viewSortKey = "name" /* Name */;
        break;
      case "status":
        viewSortKey = "status" /* Status */;
        break;
      default:
        viewSortKey = "path" /* Path */;
        break;
    }
    const storageSortKey = this.storageService.get(`scm.viewSortKey`, StorageScope.WORKSPACE);
    if (typeof storageSortKey === "string") {
      viewSortKey = storageSortKey;
    }
    return viewSortKey;
  }
  loadTreeViewState() {
    const storageViewState = this.storageService.get("scm.viewState2", StorageScope.WORKSPACE);
    if (!storageViewState) {
      return void 0;
    }
    try {
      const treeViewState = JSON.parse(storageViewState);
      return treeViewState;
    } catch {
      return void 0;
    }
  }
  storeTreeViewState() {
    if (this.tree) {
      this.storageService.store("scm.viewState2", JSON.stringify(this.tree.getViewState()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  updateChildren(element) {
    this.updateChildrenThrottler.queue(
      () => this.treeOperationSequencer.queue(
        async () => {
          const focusedInput = this.inputRenderer.getFocusedInput();
          if (element && this.tree.hasNode(element)) {
            await this.tree.updateChildren(element);
          } else {
            await this.tree.updateChildren(void 0);
          }
          if (focusedInput) {
            this.inputRenderer.getRenderedInputWidget(focusedInput)?.focus();
          }
          this.updateScmProviderContextKeys();
          this.updateRepositoryCollapseAllContextKeys();
        }
      )
    );
  }
  updateIndentStyles(theme) {
    this.treeContainer.classList.toggle("list-view-mode", this.viewMode === ViewMode.List);
    this.treeContainer.classList.toggle("tree-view-mode", this.viewMode === ViewMode.Tree);
    this.treeContainer.classList.toggle("align-icons-and-twisties", this.viewMode === ViewMode.List && theme.hasFileIcons || theme.hasFileIcons && !theme.hasFolderIcons);
    this.treeContainer.classList.toggle("hide-arrows", this.viewMode === ViewMode.Tree && theme.hidesExplorerArrows === true);
  }
  updateScmProviderContextKeys() {
    const alwaysShowRepositories = this.configurationService.getValue("scm.alwaysShowRepositories");
    if (!alwaysShowRepositories && this.items.size === 1) {
      const provider = Iterable.first(this.items.keys()).provider;
      this.scmProviderContextKey.set(provider.providerId);
      this.scmProviderRootUriContextKey.set(provider.rootUri?.toString());
      this.scmProviderHasRootUriContextKey.set(!!provider.rootUri);
    } else {
      this.scmProviderContextKey.set(void 0);
      this.scmProviderRootUriContextKey.set(void 0);
      this.scmProviderHasRootUriContextKey.set(false);
    }
  }
  updateRepositoryCollapseAllContextKeys() {
    if (!this.isBodyVisible() || this.items.size === 1) {
      this.isAnyRepositoryCollapsibleContextKey.set(false);
      this.areAllRepositoriesCollapsedContextKey.set(false);
      return;
    }
    this.isAnyRepositoryCollapsibleContextKey.set(this.scmViewService.visibleRepositories.some((r) => this.tree.hasNode(r) && this.tree.isCollapsible(r)));
    this.areAllRepositoriesCollapsedContextKey.set(this.scmViewService.visibleRepositories.every((r) => this.tree.hasNode(r) && (!this.tree.isCollapsible(r) || this.tree.isCollapsed(r))));
  }
  collapseAllRepositories() {
    for (const repository of this.scmViewService.visibleRepositories) {
      if (this.tree.isCollapsible(repository)) {
        this.tree.collapse(repository);
      }
    }
  }
  expandAllRepositories() {
    for (const repository of this.scmViewService.visibleRepositories) {
      if (this.tree.isCollapsible(repository)) {
        this.tree.expand(repository);
      }
    }
  }
  collapseAllResources(group) {
    for (const { element } of this.tree.getNode(group).children) {
      if (!isSCMViewService(element)) {
        this.tree.collapse(element, true);
      }
    }
  }
  focusPreviousInput() {
    this.treeOperationSequencer.queue(() => this.focusInput(-1));
  }
  focusNextInput() {
    this.treeOperationSequencer.queue(() => this.focusInput(1));
  }
  async focusInput(delta) {
    if (!this.scmViewService.focusedRepository || this.scmViewService.visibleRepositories.length === 0) {
      return;
    }
    let input = this.scmViewService.focusedRepository.input;
    const repositories = this.scmViewService.visibleRepositories;
    if (repositories.length === 1 && this.inputRenderer.getRenderedInputWidget(input)?.hasFocus() === true) {
      return;
    }
    if (repositories.length > 1 && this.inputRenderer.getRenderedInputWidget(input)?.hasFocus() === true) {
      const focusedRepositoryIndex = repositories.indexOf(this.scmViewService.focusedRepository);
      const newFocusedRepositoryIndex = rot(focusedRepositoryIndex + delta, repositories.length);
      input = repositories[newFocusedRepositoryIndex].input;
    }
    await this.tree.expandTo(input);
    this.tree.reveal(input);
    this.inputRenderer.getRenderedInputWidget(input)?.focus();
  }
  focusPreviousResourceGroup() {
    this.treeOperationSequencer.queue(() => this.focusResourceGroup(-1));
  }
  focusNextResourceGroup() {
    this.treeOperationSequencer.queue(() => this.focusResourceGroup(1));
  }
  async focusResourceGroup(delta) {
    if (!this.scmViewService.focusedRepository || this.scmViewService.visibleRepositories.length === 0) {
      return;
    }
    const treeHasDomFocus = isActiveElement(this.tree.getHTMLElement());
    const resourceGroups = this.scmViewService.focusedRepository.provider.groups;
    const focusedResourceGroup = this.tree.getFocus().find((e) => isSCMResourceGroup(e));
    const focusedResourceGroupIndex = treeHasDomFocus && focusedResourceGroup ? resourceGroups.indexOf(focusedResourceGroup) : -1;
    let resourceGroupNext;
    if (focusedResourceGroupIndex === -1) {
      for (const resourceGroup of resourceGroups) {
        if (this.tree.hasNode(resourceGroup)) {
          resourceGroupNext = resourceGroup;
          break;
        }
      }
    } else {
      let index = rot(focusedResourceGroupIndex + delta, resourceGroups.length);
      while (index !== focusedResourceGroupIndex) {
        if (this.tree.hasNode(resourceGroups[index])) {
          resourceGroupNext = resourceGroups[index];
          break;
        }
        index = rot(index + delta, resourceGroups.length);
      }
    }
    if (resourceGroupNext) {
      await this.tree.expandTo(resourceGroupNext);
      this.tree.reveal(resourceGroupNext);
      this.tree.setSelection([resourceGroupNext]);
      this.tree.setFocus([resourceGroupNext]);
      this.tree.domFocus();
    }
  }
  shouldShowWelcome() {
    return this.scmService.repositoryCount === 0;
  }
  getActionsContext() {
    return this.scmViewService.visibleRepositories.length === 1 ? this.scmViewService.visibleRepositories[0].provider : void 0;
  }
  focus() {
    super.focus();
    this.treeOperationSequencer.queue(() => {
      return new Promise((resolve) => {
        if (this.isExpanded()) {
          if (this.tree.getFocus().length === 0) {
            for (const repository of this.scmViewService.visibleRepositories) {
              const widget = this.inputRenderer.getRenderedInputWidget(repository.input);
              if (widget) {
                widget.focus();
                resolve();
                return;
              }
            }
          }
          this.tree.domFocus();
          resolve();
        }
      });
    });
  }
  dispose() {
    this._onDidChangeViewMode.dispose();
    this._onDidChangeViewSortKey.dispose();
    this.visibilityDisposables.dispose();
    this.disposables.dispose();
    this.items.dispose();
    super.dispose();
  }
};
SCMViewPane = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IMenuService),
  __decorateParam(4, ISCMService),
  __decorateParam(5, ISCMViewService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IUriIdentityService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IContextMenuService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IViewDescriptorService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IOpenerService),
  __decorateParam(16, IHoverService)
], SCMViewPane);
let SCMTreeDataSource = class extends Disposable {
  constructor(viewMode, configurationService, scmViewService) {
    super();
    this.viewMode = viewMode;
    this.configurationService = configurationService;
    this.scmViewService = scmViewService;
  }
  async getChildren(inputOrElement) {
    const repositoryCount = this.scmViewService.visibleRepositories.length;
    const showActionButton = this.configurationService.getValue("scm.showActionButton") === true;
    const alwaysShowRepositories = this.configurationService.getValue("scm.alwaysShowRepositories") === true;
    if (isSCMViewService(inputOrElement) && (repositoryCount > 1 || alwaysShowRepositories)) {
      return this.scmViewService.visibleRepositories;
    } else if (isSCMViewService(inputOrElement) && repositoryCount === 1 && !alwaysShowRepositories || isSCMRepository(inputOrElement)) {
      const children = [];
      inputOrElement = isSCMRepository(inputOrElement) ? inputOrElement : this.scmViewService.visibleRepositories[0];
      const actionButton = inputOrElement.provider.actionButton.get();
      const resourceGroups = inputOrElement.provider.groups;
      if (inputOrElement.input.visible) {
        children.push(inputOrElement.input);
      }
      if (showActionButton && actionButton) {
        children.push({
          type: "actionButton",
          repository: inputOrElement,
          button: actionButton
        });
      }
      const hasSomeChanges = resourceGroups.some((group) => group.resources.length > 0);
      if (hasSomeChanges || repositoryCount === 1 && (!showActionButton || !actionButton)) {
        children.push(...resourceGroups);
      }
      return children;
    } else if (isSCMResourceGroup(inputOrElement)) {
      if (this.viewMode() === ViewMode.List) {
        return inputOrElement.resources;
      } else if (this.viewMode() === ViewMode.Tree) {
        const children = [];
        for (const node of inputOrElement.resourceTree.root.children) {
          children.push(node.element && node.childrenCount === 0 ? node.element : node);
        }
        return children;
      }
    } else if (isSCMResourceNode(inputOrElement)) {
      const children = [];
      for (const node of inputOrElement.children) {
        children.push(node.element && node.childrenCount === 0 ? node.element : node);
      }
      return children;
    }
    return [];
  }
  getParent(element) {
    if (isSCMResourceNode(element)) {
      if (element.parent === element.context.resourceTree.root) {
        return element.context;
      } else if (element.parent) {
        return element.parent;
      } else {
        throw new Error("Invalid element passed to getParent");
      }
    } else if (isSCMResource(element)) {
      if (this.viewMode() === ViewMode.List) {
        return element.resourceGroup;
      }
      const node = element.resourceGroup.resourceTree.getNode(element.sourceUri);
      const result = node?.parent;
      if (!result) {
        throw new Error("Invalid element passed to getParent");
      }
      if (result === element.resourceGroup.resourceTree.root) {
        return element.resourceGroup;
      }
      return result;
    } else if (isSCMInput(element)) {
      return element.repository;
    } else if (isSCMActionButton(element)) {
      return element.repository;
    } else if (isSCMResourceGroup(element)) {
      const repository = this.scmViewService.visibleRepositories.find((r) => r.provider === element.provider);
      if (!repository) {
        throw new Error("Invalid element passed to getParent");
      }
      return repository;
    } else if (isSCMRepository(element)) {
      return this.scmViewService;
    } else {
      throw new Error("Unexpected call to getParent");
    }
  }
  hasChildren(inputOrElement) {
    if (isSCMViewService(inputOrElement)) {
      return this.scmViewService.visibleRepositories.length !== 0;
    } else if (isSCMRepository(inputOrElement)) {
      return true;
    } else if (isSCMInput(inputOrElement)) {
      return false;
    } else if (isSCMActionButton(inputOrElement)) {
      return false;
    } else if (isSCMResourceGroup(inputOrElement)) {
      return true;
    } else if (isSCMResource(inputOrElement)) {
      return false;
    } else if (ResourceTree.isResourceNode(inputOrElement)) {
      return inputOrElement.childrenCount > 0;
    } else {
      throw new Error("hasChildren not implemented.");
    }
  }
};
SCMTreeDataSource = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ISCMViewService)
], SCMTreeDataSource);
class SCMActionButton {
  constructor(container, contextMenuService, commandService, notificationService) {
    this.container = container;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
    this.notificationService = notificationService;
    this.disposables = new MutableDisposable();
  }
  dispose() {
    this.disposables?.dispose();
  }
  setButton(button) {
    this.clear();
    if (!button) {
      return;
    }
    if (button.secondaryCommands?.length) {
      const actions = [];
      for (let index = 0; index < button.secondaryCommands.length; index++) {
        const commands = button.secondaryCommands[index];
        for (const command of commands) {
          actions.push(toAction({
            id: command.id,
            label: command.title,
            enabled: true,
            run: async () => {
              await this.executeCommand(command.id, ...command.arguments || []);
            }
          }));
        }
        if (commands.length) {
          actions.push(new Separator());
        }
      }
      actions.pop();
      this.button = new ButtonWithDropdown(this.container, {
        actions,
        addPrimaryActionToDropdown: false,
        contextMenuProvider: this.contextMenuService,
        title: button.command.tooltip,
        supportIcons: true,
        ...defaultButtonStyles
      });
    } else {
      this.button = new Button(this.container, { supportIcons: true, supportShortLabel: !!button.command.shortTitle, title: button.command.tooltip, ...defaultButtonStyles });
    }
    this.button.enabled = button.enabled;
    this.button.label = button.command.title;
    if (this.button instanceof Button && button.command.shortTitle) {
      this.button.labelShort = button.command.shortTitle;
    }
    this.button.onDidClick(async () => await this.executeCommand(button.command.id, ...button.command.arguments || []), null, this.disposables.value);
    this.disposables.value.add(this.button);
  }
  focus() {
    this.button?.focus();
  }
  clear() {
    this.disposables.value = new DisposableStore();
    this.button = void 0;
    clearNode(this.container);
  }
  async executeCommand(commandId, ...args) {
    try {
      await this.commandService.executeCommand(commandId, ...args);
    } catch (ex) {
      this.notificationService.error(ex);
    }
  }
}
export {
  ActionButtonRenderer,
  ContextKeys,
  SCMAccessibilityProvider,
  SCMActionButton,
  SCMTreeKeyboardNavigationLabelProvider,
  SCMTreeSorter,
  SCMViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NjbS9icm93c2VyL3NjbVZpZXdQYW5lLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3NjbS5jc3MnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBjb21iaW5lZERpc3Bvc2FibGUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMsIFZpZXdBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IGFwcGVuZCwgJCwgY2xlYXJOb2RlLCBpc1BvaW50ZXJFdmVudCwgaXNBY3RpdmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhc0NTU1VybCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUlkZW50aXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElTQ01SZXNvdXJjZUdyb3VwLCBJU0NNUmVzb3VyY2UsIElTQ01SZXBvc2l0b3J5LCBJU0NNSW5wdXQsIElTQ01WaWV3U2VydmljZSwgSVNDTVZpZXdWaXNpYmxlUmVwb3NpdG9yeUNoYW5nZUV2ZW50LCBJU0NNU2VydmljZSwgVklFV19QQU5FX0lELCBJU0NNQWN0aW9uQnV0dG9uLCBJU0NNQWN0aW9uQnV0dG9uRGVzY3JpcHRvciwgSVNDTVJlcG9zaXRvcnlTb3J0S2V5LCBWaWV3TW9kZSwgSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlIH0gZnJvbSAnLi4vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscywgSVJlc291cmNlTGFiZWwsIElGaWxlTGFiZWxPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgQ291bnRCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb3VudEJhZGdlL2NvdW50QmFkZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5LCBDb250ZXh0S2V5RXhwciwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgTWVudUl0ZW1BY3Rpb24sIElNZW51U2VydmljZSwgcmVnaXN0ZXJBY3Rpb24yLCBNZW51SWQsIElBY3Rpb24yT3B0aW9ucywgTWVudVJlZ2lzdHJ5LCBBY3Rpb24yLCBJTWVudSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgQWN0aW9uUnVubmVyLCBTZXBhcmF0b3IsIElBY3Rpb25SdW5uZXIsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UsIElGaWxlSWNvblRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1NDTVJlc291cmNlLCBpc1NDTVJlc291cmNlR3JvdXAsIGlzU0NNUmVwb3NpdG9yeSwgaXNTQ01JbnB1dCwgY29sbGVjdENvbnRleHRNZW51QWN0aW9ucywgZ2V0QWN0aW9uVmlld0l0ZW1Qcm92aWRlciwgaXNTQ01BY3Rpb25CdXR0b24sIGlzU0NNVmlld1NlcnZpY2UsIGlzU0NNUmVzb3VyY2VOb2RlLCBjb25uZWN0UHJpbWFyeU1lbnUgfSBmcm9tICcuL3V0aWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSwgSU9wZW5FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0LCBTZXF1ZW5jZXIsIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElUcmVlTm9kZSwgSVRyZWVGaWx0ZXIsIElUcmVlU29ydGVyLCBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlRHJhZ0FuZERyb3AsIElUcmVlRHJhZ092ZXJSZWFjdGlvbiwgSUFzeW5jRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VUcmVlLCBJUmVzb3VyY2VOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VUcmVlLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIsIElDb21wcmVzc2libGVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlRmlsZU5hbWVzLCBjb21wYXJlUGF0aHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb21wYXJlcnMuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSwgY3JlYXRlTWF0Y2hlcywgSU1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBSZXBvc2l0b3J5QWN0aW9uUnVubmVyLCBSZXBvc2l0b3J5UmVuZGVyZXIgfSBmcm9tICcuL3NjbVJlcG9zaXRvcnlSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgTGFiZWxGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0Q29udGV4dE1lbnVBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEJ1dHRvbiwgQnV0dG9uV2l0aERlc2NyaXB0aW9uLCBCdXR0b25XaXRoRHJvcGRvd24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFJlcG9zaXRvcnlDb250ZXh0S2V5cyB9IGZyb20gJy4vc2NtVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdENvdW50QmFkZ2VTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgZmlsbEVkaXRvcnNEcmFnRGF0YSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhLCBMaXN0Vmlld1RhcmdldFNlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IENvZGVEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZG5kL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFUcmVlVmlld1N0YXRlLCBJVHJlZUNvbXByZXNzaW9uRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IHJvdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL251bWJlcnMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgT3BlblNjbUdyb3VwQWN0aW9uIH0gZnJvbSAnLi4vLi4vbXVsdGlEaWZmRWRpdG9yL2Jyb3dzZXIvc2NtTXVsdGlEaWZmU291cmNlUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU0NNSW5wdXRXaWRnZXQgfSBmcm9tICcuL3NjbUlucHV0LmpzJztcblxudHlwZSBUcmVlRWxlbWVudCA9IElTQ01SZXBvc2l0b3J5IHwgSVNDTUlucHV0IHwgSVNDTUFjdGlvbkJ1dHRvbiB8IElTQ01SZXNvdXJjZUdyb3VwIHwgSVNDTVJlc291cmNlIHwgSVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPjtcblxuZnVuY3Rpb24gcHJvY2Vzc1Jlc291cmNlRmlsdGVyRGF0YSh1cmk6IFVSSSwgZmlsdGVyRGF0YTogRnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZSB8IHVuZGVmaW5lZCk6IFtJTWF0Y2hbXSB8IHVuZGVmaW5lZCwgSU1hdGNoW10gfCB1bmRlZmluZWRdIHtcblx0aWYgKCFmaWx0ZXJEYXRhKSB7XG5cdFx0cmV0dXJuIFt1bmRlZmluZWQsIHVuZGVmaW5lZF07XG5cdH1cblxuXHRpZiAoIShmaWx0ZXJEYXRhIGFzIExhYmVsRnV6enlTY29yZSkubGFiZWwpIHtcblx0XHRjb25zdCBtYXRjaGVzID0gY3JlYXRlTWF0Y2hlcyhmaWx0ZXJEYXRhIGFzIEZ1enp5U2NvcmUpO1xuXHRcdHJldHVybiBbbWF0Y2hlcywgdW5kZWZpbmVkXTtcblx0fVxuXG5cdGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUodXJpKTtcblx0Y29uc3QgbGFiZWwgPSAoZmlsdGVyRGF0YSBhcyBMYWJlbEZ1enp5U2NvcmUpLmxhYmVsO1xuXHRjb25zdCBwYXRoTGVuZ3RoID0gbGFiZWwubGVuZ3RoIC0gZmlsZU5hbWUubGVuZ3RoO1xuXHRjb25zdCBtYXRjaGVzID0gY3JlYXRlTWF0Y2hlcygoZmlsdGVyRGF0YSBhcyBMYWJlbEZ1enp5U2NvcmUpLnNjb3JlKTtcblxuXHQvLyBGaWxlTmFtZSBtYXRjaFxuXHRpZiAobGFiZWwgPT09IGZpbGVOYW1lKSB7XG5cdFx0cmV0dXJuIFttYXRjaGVzLCB1bmRlZmluZWRdO1xuXHR9XG5cblx0Ly8gRmlsZVBhdGggbWF0Y2hcblx0Y29uc3QgbGFiZWxNYXRjaGVzOiBJTWF0Y2hbXSA9IFtdO1xuXHRjb25zdCBkZXNjcmlwdGlvbk1hdGNoZXM6IElNYXRjaFtdID0gW107XG5cblx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG5cdFx0aWYgKG1hdGNoLnN0YXJ0ID4gcGF0aExlbmd0aCkge1xuXHRcdFx0Ly8gTGFiZWwgbWF0Y2hcblx0XHRcdGxhYmVsTWF0Y2hlcy5wdXNoKHtcblx0XHRcdFx0c3RhcnQ6IG1hdGNoLnN0YXJ0IC0gcGF0aExlbmd0aCxcblx0XHRcdFx0ZW5kOiBtYXRjaC5lbmQgLSBwYXRoTGVuZ3RoXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKG1hdGNoLmVuZCA8IHBhdGhMZW5ndGgpIHtcblx0XHRcdC8vIERlc2NyaXB0aW9uIG1hdGNoXG5cdFx0XHRkZXNjcmlwdGlvbk1hdGNoZXMucHVzaChtYXRjaCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFNwYW5uaW5nIG1hdGNoXG5cdFx0XHRsYWJlbE1hdGNoZXMucHVzaCh7XG5cdFx0XHRcdHN0YXJ0OiAwLFxuXHRcdFx0XHRlbmQ6IG1hdGNoLmVuZCAtIHBhdGhMZW5ndGhcblx0XHRcdH0pO1xuXHRcdFx0ZGVzY3JpcHRpb25NYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRzdGFydDogbWF0Y2guc3RhcnQsXG5cdFx0XHRcdGVuZDogcGF0aExlbmd0aFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIFtsYWJlbE1hdGNoZXMsIGRlc2NyaXB0aW9uTWF0Y2hlc107XG59XG5cbmludGVyZmFjZSBJU0NNTGF5b3V0IHtcblx0aGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcbn1cblxuaW50ZXJmYWNlIEFjdGlvbkJ1dHRvblRlbXBsYXRlIHtcblx0cmVhZG9ubHkgYWN0aW9uQnV0dG9uOiBTQ01BY3Rpb25CdXR0b247XG5cdGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHRyZWFkb25seSB0ZW1wbGF0ZURpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xufVxuXG5leHBvcnQgY2xhc3MgQWN0aW9uQnV0dG9uUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElTQ01BY3Rpb25CdXR0b24sIEZ1enp5U2NvcmUsIEFjdGlvbkJ1dHRvblRlbXBsYXRlPiB7XG5cdHN0YXRpYyByZWFkb25seSBERUZBVUxUX0hFSUdIVCA9IDI4O1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdhY3Rpb25CdXR0b24nO1xuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gQWN0aW9uQnV0dG9uUmVuZGVyZXIuVEVNUExBVEVfSUQ7IH1cblxuXHRwcml2YXRlIGFjdGlvbkJ1dHRvbnMgPSBuZXcgTWFwPElTQ01BY3Rpb25CdXR0b24sIFNDTUFjdGlvbkJ1dHRvbj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogQWN0aW9uQnV0dG9uVGVtcGxhdGUge1xuXHRcdC8vIFVzZSBkZWZhdWx0IGN1cnNvciAmIGRpc2FibGUgaG92ZXIgZm9yIGxpc3QgaXRlbVxuXHRcdGNvbnRhaW5lci5wYXJlbnRFbGVtZW50IS5wYXJlbnRFbGVtZW50IS5jbGFzc0xpc3QuYWRkKCdjdXJzb3ItZGVmYXVsdCcsICdmb3JjZS1uby1ob3ZlcicpO1xuXG5cdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYWN0aW9uQnV0dG9uID0gbmV3IFNDTUFjdGlvbkJ1dHRvbihidXR0b25Db250YWluZXIsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0cmV0dXJuIHsgYWN0aW9uQnV0dG9uLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlLk5vbmUsIHRlbXBsYXRlRGlzcG9zYWJsZTogYWN0aW9uQnV0dG9uIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJU0NNQWN0aW9uQnV0dG9uLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBBY3Rpb25CdXR0b25UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFjdGlvbkJ1dHRvbiA9IG5vZGUuZWxlbWVudDtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQnV0dG9uLnNldEJ1dHRvbihub2RlLmVsZW1lbnQuYnV0dG9uKTtcblxuXHRcdC8vIFJlbWVtYmVyIGFjdGlvbiBidXR0b25cblx0XHR0aGlzLmFjdGlvbkJ1dHRvbnMuc2V0KGFjdGlvbkJ1dHRvbiwgdGVtcGxhdGVEYXRhLmFjdGlvbkJ1dHRvbik7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gdGhpcy5hY3Rpb25CdXR0b25zLmRlbGV0ZShhY3Rpb25CdXR0b24pIH0pO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGUgPSBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cygpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZCBuZXZlciBoYXBwZW4gc2luY2Ugbm9kZSBpcyBpbmNvbXByZXNzaWJsZScpO1xuXHR9XG5cblx0Zm9jdXNBY3Rpb25CdXR0b24oYWN0aW9uQnV0dG9uOiBJU0NNQWN0aW9uQnV0dG9uKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25CdXR0b25zLmdldChhY3Rpb25CdXR0b24pPy5mb2N1cygpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElTQ01BY3Rpb25CdXR0b24sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogQWN0aW9uQnV0dG9uVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZS5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IEFjdGlvbkJ1dHRvblRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG59XG5cblxuY2xhc3MgU0NNVHJlZURyYWdBbmREcm9wIGltcGxlbWVudHMgSVRyZWVEcmFnQW5kRHJvcDxUcmVlRWxlbWVudD4ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpIHsgfVxuXG5cdGdldERyYWdVUkkoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoaXNTQ01SZXNvdXJjZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuc291cmNlVXJpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRvbkRyYWdTdGFydChkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBpdGVtcyA9IFNDTVRyZWVEcmFnQW5kRHJvcC5nZXRSZXNvdXJjZXNGcm9tRHJhZ0FuZERyb3BEYXRhKGRhdGEgYXMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VHJlZUVsZW1lbnQsIFRyZWVFbGVtZW50W10+KTtcblx0XHRpZiAob3JpZ2luYWxFdmVudC5kYXRhVHJhbnNmZXIgJiYgaXRlbXM/Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBmaWxsRWRpdG9yc0RyYWdEYXRhKGFjY2Vzc29yLCBpdGVtcywgb3JpZ2luYWxFdmVudCkpO1xuXG5cdFx0XHRjb25zdCBmaWxlUmVzb3VyY2VzID0gaXRlbXMuZmlsdGVyKHMgPT4gcy5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkubWFwKHIgPT4gci5mc1BhdGgpO1xuXHRcdFx0aWYgKGZpbGVSZXNvdXJjZXMubGVuZ3RoKSB7XG5cdFx0XHRcdG9yaWdpbmFsRXZlbnQuZGF0YVRyYW5zZmVyLnNldERhdGEoQ29kZURhdGFUcmFuc2ZlcnMuRklMRVMsIEpTT04uc3RyaW5naWZ5KGZpbGVSZXNvdXJjZXMpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXREcmFnTGFiZWwoZWxlbWVudHM6IFRyZWVFbGVtZW50W10sIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGVsZW1lbnRzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGVsZW1lbnRzWzBdO1xuXHRcdFx0aWYgKGlzU0NNUmVzb3VyY2UoZWxlbWVudCkpIHtcblx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKGVsZW1lbnQuc291cmNlVXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gU3RyaW5nKGVsZW1lbnRzLmxlbmd0aCk7XG5cdH1cblxuXHRvbkRyYWdPdmVyKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldEVsZW1lbnQ6IFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkLCB0YXJnZXRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkLCB0YXJnZXRTZWN0b3I6IExpc3RWaWV3VGFyZ2V0U2VjdG9yIHwgdW5kZWZpbmVkLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBib29sZWFuIHwgSVRyZWVEcmFnT3ZlclJlYWN0aW9uIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGRyb3AoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQgeyB9XG5cblx0cHJpdmF0ZSBzdGF0aWMgZ2V0UmVzb3VyY2VzRnJvbURyYWdBbmREcm9wRGF0YShkYXRhOiBFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxUcmVlRWxlbWVudCwgVHJlZUVsZW1lbnRbXT4pOiBVUklbXSB7XG5cdFx0Y29uc3QgdXJpczogVVJJW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgWy4uLmRhdGEuY29udGV4dCA/PyBbXSwgLi4uZGF0YS5lbGVtZW50c10pIHtcblx0XHRcdGlmIChpc1NDTVJlc291cmNlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdHVyaXMucHVzaChlbGVtZW50LnNvdXJjZVVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1cmlzO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxufVxuXG5pbnRlcmZhY2UgSW5wdXRUZW1wbGF0ZSB7XG5cdHJlYWRvbmx5IGlucHV0V2lkZ2V0OiBTQ01JbnB1dFdpZGdldDtcblx0aW5wdXRXaWRnZXRIZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZTogSURpc3Bvc2FibGU7XG59XG5cbmNsYXNzIElucHV0UmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPElTQ01JbnB1dCwgRnV6enlTY29yZSwgSW5wdXRUZW1wbGF0ZT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBERUZBVUxUX0hFSUdIVCA9IDI2O1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdpbnB1dCc7XG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBJbnB1dFJlbmRlcmVyLlRFTVBMQVRFX0lEOyB9XG5cblx0cHJpdmF0ZSBpbnB1dFdpZGdldHMgPSBuZXcgTWFwPElTQ01JbnB1dCwgU0NNSW5wdXRXaWRnZXQ+KCk7XG5cdHByaXZhdGUgY29udGVudEhlaWdodHMgPSBuZXcgV2Vha01hcDxJU0NNSW5wdXQsIG51bWJlcj4oKTtcblx0cHJpdmF0ZSBlZGl0b3JTZWxlY3Rpb25zID0gbmV3IFdlYWtNYXA8SVNDTUlucHV0LCBTZWxlY3Rpb25bXT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIG91dGVyTGF5b3V0OiBJU0NNTGF5b3V0LFxuXHRcdHByaXZhdGUgb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSB1cGRhdGVIZWlnaHQ6IChpbnB1dDogSVNDTUlucHV0LCBoZWlnaHQ6IG51bWJlcikgPT4gdm9pZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJbnB1dFRlbXBsYXRlIHtcblx0XHQvLyBEaXNhYmxlIGhvdmVyIGZvciBsaXN0IGl0ZW1cblx0XHRjb250YWluZXIucGFyZW50RWxlbWVudCEucGFyZW50RWxlbWVudCEuY2xhc3NMaXN0LmFkZCgnZm9yY2Utbm8taG92ZXInKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnB1dEVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuc2NtLWlucHV0JykpO1xuXHRcdGNvbnN0IGlucHV0V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTQ01JbnB1dFdpZGdldCwgaW5wdXRFbGVtZW50LCB0aGlzLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUpO1xuXHRcdHRlbXBsYXRlRGlzcG9zYWJsZS5hZGQoaW5wdXRXaWRnZXQpO1xuXG5cdFx0cmV0dXJuIHsgaW5wdXRXaWRnZXQsIGlucHV0V2lkZ2V0SGVpZ2h0OiBJbnB1dFJlbmRlcmVyLkRFRkFVTFRfSEVJR0hULCBlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSwgdGVtcGxhdGVEaXNwb3NhYmxlIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJU0NNSW5wdXQsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElucHV0VGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dCA9IG5vZGUuZWxlbWVudDtcblx0XHR0ZW1wbGF0ZURhdGEuaW5wdXRXaWRnZXQuaW5wdXQgPSBpbnB1dDtcblxuXHRcdC8vIFJlbWVtYmVyIHdpZGdldFxuXHRcdHRoaXMuaW5wdXRXaWRnZXRzLnNldChpbnB1dCwgdGVtcGxhdGVEYXRhLmlucHV0V2lkZ2V0KTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB0aGlzLmlucHV0V2lkZ2V0cy5kZWxldGUoaW5wdXQpXG5cdFx0fSk7XG5cblx0XHQvLyBXaWRnZXQgY3Vyc29yIHNlbGVjdGlvbnNcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5lZGl0b3JTZWxlY3Rpb25zLmdldChpbnB1dCk7XG5cblx0XHRpZiAoc2VsZWN0aW9ucykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmlucHV0V2lkZ2V0LnNlbGVjdGlvbnMgPSBzZWxlY3Rpb25zO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGVtcGxhdGVEYXRhLmlucHV0V2lkZ2V0LnNlbGVjdGlvbnM7XG5cblx0XHRcdGlmIChzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yU2VsZWN0aW9ucy5zZXQoaW5wdXQsIHNlbGVjdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlc2V0IHdpZGdldCBoZWlnaHQgc28gaXQncyByZWNhbGN1bGF0ZWRcblx0XHR0ZW1wbGF0ZURhdGEuaW5wdXRXaWRnZXRIZWlnaHQgPSBJbnB1dFJlbmRlcmVyLkRFRkFVTFRfSEVJR0hUO1xuXG5cdFx0Ly8gUmVyZW5kZXIgdGhlIGVsZW1lbnQgd2hlbmV2ZXIgdGhlIGVkaXRvciBjb250ZW50IGhlaWdodCBjaGFuZ2VzXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudEhlaWdodCA9IHRlbXBsYXRlRGF0YS5pbnB1dFdpZGdldC5nZXRDb250ZW50SGVpZ2h0KCk7XG5cdFx0XHR0aGlzLmNvbnRlbnRIZWlnaHRzLnNldChpbnB1dCwgY29udGVudEhlaWdodCk7XG5cblx0XHRcdGlmICh0ZW1wbGF0ZURhdGEuaW5wdXRXaWRnZXRIZWlnaHQgIT09IGNvbnRlbnRIZWlnaHQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVIZWlnaHQoaW5wdXQsIGNvbnRlbnRIZWlnaHQgKyAxMCk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5pbnB1dFdpZGdldEhlaWdodCA9IGNvbnRlbnRIZWlnaHQ7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5pbnB1dFdpZGdldC5sYXlvdXQoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RhcnRMaXN0ZW5pbmdDb250ZW50SGVpZ2h0Q2hhbmdlID0gKCkgPT4ge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGVtcGxhdGVEYXRhLmlucHV0V2lkZ2V0Lm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodChvbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQpKTtcblx0XHRcdG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgpO1xuXHRcdH07XG5cblx0XHQvLyBTZXR1cCBoZWlnaHQgY2hhbmdlIGxpc3RlbmVyIG9uIG5leHQgdGlja1xuXHRcdGRpc3Bvc2FibGVUaW1lb3V0KHN0YXJ0TGlzdGVuaW5nQ29udGVudEhlaWdodENoYW5nZSwgMCwgdGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBMYXlvdXQgdGhlIGVkaXRvciB3aGVuZXZlciB0aGUgb3V0ZXIgbGF5b3V0IGhhcHBlbnNcblx0XHRjb25zdCBsYXlvdXRFZGl0b3IgPSAoKSA9PiB0ZW1wbGF0ZURhdGEuaW5wdXRXaWRnZXQubGF5b3V0KCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5vdXRlckxheW91dC5vbkRpZENoYW5nZShsYXlvdXRFZGl0b3IpKTtcblx0XHRsYXlvdXRFZGl0b3IoKTtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cygpOiB2b2lkIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nob3VsZCBuZXZlciBoYXBwZW4gc2luY2Ugbm9kZSBpcyBpbmNvbXByZXNzaWJsZScpO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoZ3JvdXA6IElUcmVlTm9kZTxJU0NNSW5wdXQsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogSW5wdXRUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSW5wdXRUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0SGVpZ2h0KGlucHV0OiBJU0NNSW5wdXQpOiBudW1iZXIge1xuXHRcdHJldHVybiAodGhpcy5jb250ZW50SGVpZ2h0cy5nZXQoaW5wdXQpID8/IElucHV0UmVuZGVyZXIuREVGQVVMVF9IRUlHSFQpICsgMTA7XG5cdH1cblxuXHRnZXRSZW5kZXJlZElucHV0V2lkZ2V0KGlucHV0OiBJU0NNSW5wdXQpOiBTQ01JbnB1dFdpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRXaWRnZXRzLmdldChpbnB1dCk7XG5cdH1cblxuXHRnZXRGb2N1c2VkSW5wdXQoKTogSVNDTUlucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IFtpbnB1dCwgaW5wdXRXaWRnZXRdIG9mIHRoaXMuaW5wdXRXaWRnZXRzKSB7XG5cdFx0XHRpZiAoaW5wdXRXaWRnZXQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNsZWFyVmFsaWRhdGlvbigpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFssIGlucHV0V2lkZ2V0XSBvZiB0aGlzLmlucHV0V2lkZ2V0cykge1xuXHRcdFx0aW5wdXRXaWRnZXQuY2xlYXJWYWxpZGF0aW9uKCk7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBSZXNvdXJjZUdyb3VwVGVtcGxhdGUge1xuXHRyZWFkb25seSBuYW1lOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY291bnQ6IENvdW50QmFkZ2U7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogV29ya2JlbmNoVG9vbEJhcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZTtcbn1cblxuY2xhc3MgUmVzb3VyY2VHcm91cFJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxJU0NNUmVzb3VyY2VHcm91cCwgRnV6enlTY29yZSwgUmVzb3VyY2VHcm91cFRlbXBsYXRlPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ3Jlc291cmNlIGdyb3VwJztcblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIFJlc291cmNlR3JvdXBSZW5kZXJlci5URU1QTEFURV9JRDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSBhY3Rpb25SdW5uZXI6IEFjdGlvblJ1bm5lcixcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVNDTVZpZXdTZXJ2aWNlIHByaXZhdGUgc2NtVmlld1NlcnZpY2U6IElTQ01WaWV3U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZVxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBSZXNvdXJjZUdyb3VwVGVtcGxhdGUge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucmVzb3VyY2UtZ3JvdXAnKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGFwcGVuZChlbGVtZW50LCAkKCcubmFtZScpKTtcblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKGVsZW1lbnQsICQoJy5hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBXb3JrYmVuY2hUb29sQmFyKGFjdGlvbnNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IHRoaXMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcixcblx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5hY3Rpb25SdW5uZXJcblx0XHR9LCB0aGlzLm1lbnVTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgdGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy50ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRjb25zdCBjb3VudENvbnRhaW5lciA9IGFwcGVuZChlbGVtZW50LCAkKCcuY291bnQnKSk7XG5cdFx0Y29uc3QgY291bnQgPSBuZXcgQ291bnRCYWRnZShjb3VudENvbnRhaW5lciwge30sIGRlZmF1bHRDb3VudEJhZGdlU3R5bGVzKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IGNvbWJpbmVkRGlzcG9zYWJsZShhY3Rpb25CYXIsIGNvdW50KTtcblxuXHRcdHJldHVybiB7IG5hbWUsIGNvdW50LCBhY3Rpb25CYXIsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCBkaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVNDTVJlc291cmNlR3JvdXAsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogUmVzb3VyY2VHcm91cFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3JvdXAgPSBub2RlLmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGUubmFtZS50ZXh0Q29udGVudCA9IGdyb3VwLmxhYmVsO1xuXHRcdHRlbXBsYXRlLmNvdW50LnNldENvdW50KGdyb3VwLnJlc291cmNlcy5sZW5ndGgpO1xuXG5cdFx0Y29uc3QgbWVudXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLm1lbnVzLmdldFJlcG9zaXRvcnlNZW51cyhncm91cC5wcm92aWRlcik7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChjb25uZWN0UHJpbWFyeU1lbnUobWVudXMuZ2V0UmVzb3VyY2VHcm91cE1lbnUoZ3JvdXApLCBwcmltYXJ5ID0+IHtcblx0XHRcdHRlbXBsYXRlLmFjdGlvbkJhci5zZXRBY3Rpb25zKHByaW1hcnkpO1xuXHRcdH0sICdpbmxpbmUnKSk7XG5cdFx0dGVtcGxhdGUuYWN0aW9uQmFyLmNvbnRleHQgPSBncm91cDtcblx0fVxuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxJU0NNUmVzb3VyY2VHcm91cD4sIEZ1enp5U2NvcmU+KTogdm9pZCB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdTaG91bGQgbmV2ZXIgaGFwcGVuIHNpbmNlIG5vZGUgaXMgaW5jb21wcmVzc2libGUnKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGdyb3VwOiBJVHJlZU5vZGU8SVNDTVJlc291cmNlR3JvdXAsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogUmVzb3VyY2VHcm91cFRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGU6IFJlc291cmNlR3JvdXBUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGUuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBSZXNvdXJjZVRlbXBsYXRlIHtcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdG5hbWU6IEhUTUxFbGVtZW50O1xuXHRmaWxlTGFiZWw6IElSZXNvdXJjZUxhYmVsO1xuXHRkZWNvcmF0aW9uSWNvbjogSFRNTEVsZW1lbnQ7XG5cdGFjdGlvbkJhcjogV29ya2JlbmNoVG9vbEJhcjtcblx0YWN0aW9uQmFyTWVudTogSU1lbnUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGFjdGlvbkJhck1lbnVMaXN0ZW5lcjogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+O1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlO1xufVxuXG5pbnRlcmZhY2UgUmVuZGVyZWRSZXNvdXJjZURhdGEge1xuXHRyZWFkb25seSB0b29sdGlwOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBmaWxlTGFiZWxPcHRpb25zOiBQYXJ0aWFsPElGaWxlTGFiZWxPcHRpb25zPjtcblx0cmVhZG9ubHkgaWNvblJlc291cmNlOiBJU0NNUmVzb3VyY2UgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIFJlcG9zaXRvcnlQYW5lQWN0aW9uUnVubmVyIGV4dGVuZHMgQWN0aW9uUnVubmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGdldFNlbGVjdGVkUmVzb3VyY2VzOiAoKSA9PiAoSVNDTVJlc291cmNlR3JvdXAgfCBJU0NNUmVzb3VyY2UgfCBJUmVzb3VyY2VOb2RlPElTQ01SZXNvdXJjZSwgSVNDTVJlc291cmNlR3JvdXA+KVtdKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBydW5BY3Rpb24oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0OiBJU0NNUmVzb3VyY2VHcm91cCB8IElTQ01SZXNvdXJjZSB8IElSZXNvdXJjZU5vZGU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdHJldHVybiBzdXBlci5ydW5BY3Rpb24oYWN0aW9uLCBjb250ZXh0KTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0NvbnRleHRSZXNvdXJjZUdyb3VwID0gaXNTQ01SZXNvdXJjZUdyb3VwKGNvbnRleHQpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0ZWRSZXNvdXJjZXMoKS5maWx0ZXIociA9PiBpc1NDTVJlc291cmNlR3JvdXAocikgPT09IGlzQ29udGV4dFJlc291cmNlR3JvdXApO1xuXG5cdFx0Y29uc3QgY29udGV4dElzU2VsZWN0ZWQgPSBzZWxlY3Rpb24uc29tZShzID0+IHMgPT09IGNvbnRleHQpO1xuXHRcdGNvbnN0IGFjdHVhbENvbnRleHQgPSBjb250ZXh0SXNTZWxlY3RlZCA/IHNlbGVjdGlvbiA6IFtjb250ZXh0XTtcblx0XHRjb25zdCBhcmdzID0gYWN0dWFsQ29udGV4dC5tYXAoZSA9PiBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZSkgPyBSZXNvdXJjZVRyZWUuY29sbGVjdChlKSA6IFtlXSkuZmxhdCgpO1xuXHRcdGF3YWl0IGFjdGlvbi5ydW4oLi4uYXJncyk7XG5cdH1cbn1cblxuY2xhc3MgUmVzb3VyY2VSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8SVNDTVJlc291cmNlIHwgSVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPiwgRnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZSwgUmVzb3VyY2VUZW1wbGF0ZT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdyZXNvdXJjZSc7XG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBSZXNvdXJjZVJlbmRlcmVyLlRFTVBMQVRFX0lEOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZW5kZXJlZFJlc291cmNlcyA9IG5ldyBNYXA8UmVzb3VyY2VUZW1wbGF0ZSwgUmVuZGVyZWRSZXNvdXJjZURhdGE+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSB2aWV3TW9kZTogKCkgPT4gVmlld01vZGUsXG5cdFx0cHJpdmF0ZSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHByaXZhdGUgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIsXG5cdFx0cHJpdmF0ZSBhY3Rpb25SdW5uZXI6IEFjdGlvblJ1bm5lcixcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVNDTVZpZXdTZXJ2aWNlIHByaXZhdGUgc2NtVmlld1NlcnZpY2U6IElTQ01WaWV3U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZVxuXHQpIHtcblx0XHR0aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoaXMub25EaWRDb2xvclRoZW1lQ2hhbmdlLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBSZXNvdXJjZVRlbXBsYXRlIHtcblx0XHRjb25zdCBlbGVtZW50ID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLnJlc291cmNlJykpO1xuXHRcdGNvbnN0IG5hbWUgPSBhcHBlbmQoZWxlbWVudCwgJCgnLm5hbWUnKSk7XG5cdFx0Y29uc3QgZmlsZUxhYmVsID0gdGhpcy5sYWJlbHMuY3JlYXRlKG5hbWUsIHsgc3VwcG9ydERlc2NyaXB0aW9uSGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUgfSk7XG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZChmaWxlTGFiZWwuZWxlbWVudCwgJCgnLmFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IFdvcmtiZW5jaFRvb2xCYXIoYWN0aW9uc0NvbnRhaW5lciwge1xuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogdGhpcy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyLFxuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLmFjdGlvblJ1bm5lclxuXHRcdH0sIHRoaXMubWVudVNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLnRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbkljb24gPSBhcHBlbmQoZWxlbWVudCwgJCgnLmRlY29yYXRpb24taWNvbicpKTtcblx0XHRjb25zdCBhY3Rpb25CYXJNZW51TGlzdGVuZXIgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBjb21iaW5lZERpc3Bvc2FibGUoYWN0aW9uQmFyLCBmaWxlTGFiZWwsIGFjdGlvbkJhck1lbnVMaXN0ZW5lcik7XG5cblx0XHRyZXR1cm4geyBlbGVtZW50LCBuYW1lLCBmaWxlTGFiZWwsIGRlY29yYXRpb25JY29uLCBhY3Rpb25CYXIsIGFjdGlvbkJhck1lbnU6IHVuZGVmaW5lZCwgYWN0aW9uQmFyTWVudUxpc3RlbmVyLCBlbGVtZW50RGlzcG9zYWJsZXM6IG5ldyBEaXNwb3NhYmxlU3RvcmUoKSwgZGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElTQ01SZXNvdXJjZSwgRnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT4gfCBJVHJlZU5vZGU8SVNDTVJlc291cmNlIHwgSVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPiwgRnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBSZXNvdXJjZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VPckZvbGRlciA9IG5vZGUuZWxlbWVudDtcblx0XHRjb25zdCBpY29uUmVzb3VyY2UgPSBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUocmVzb3VyY2VPckZvbGRlcikgPyByZXNvdXJjZU9yRm9sZGVyLmVsZW1lbnQgOiByZXNvdXJjZU9yRm9sZGVyO1xuXHRcdGNvbnN0IHVyaSA9IFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShyZXNvdXJjZU9yRm9sZGVyKSA/IHJlc291cmNlT3JGb2xkZXIudXJpIDogcmVzb3VyY2VPckZvbGRlci5zb3VyY2VVcmk7XG5cdFx0Y29uc3QgZmlsZUtpbmQgPSBSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUocmVzb3VyY2VPckZvbGRlcikgPyBGaWxlS2luZC5GT0xERVIgOiBGaWxlS2luZC5GSUxFO1xuXHRcdGNvbnN0IHRvb2x0aXAgPSAhUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKHJlc291cmNlT3JGb2xkZXIpICYmIHJlc291cmNlT3JGb2xkZXIuZGVjb3JhdGlvbnMudG9vbHRpcCB8fCAnJztcblx0XHRjb25zdCBoaWRlUGF0aCA9IHRoaXMudmlld01vZGUoKSA9PT0gVmlld01vZGUuVHJlZTtcblxuXHRcdGxldCBtYXRjaGVzOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGVzY3JpcHRpb25NYXRjaGVzOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc3RyaWtldGhyb3VnaDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUocmVzb3VyY2VPckZvbGRlcikpIHtcblx0XHRcdGlmIChyZXNvdXJjZU9yRm9sZGVyLmVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgbWVudXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLm1lbnVzLmdldFJlcG9zaXRvcnlNZW51cyhyZXNvdXJjZU9yRm9sZGVyLmVsZW1lbnQucmVzb3VyY2VHcm91cC5wcm92aWRlcik7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckFjdGlvbkJhcih0ZW1wbGF0ZSwgcmVzb3VyY2VPckZvbGRlciwgbWVudXMuZ2V0UmVzb3VyY2VNZW51KHJlc291cmNlT3JGb2xkZXIuZWxlbWVudCkpO1xuXG5cdFx0XHRcdHRlbXBsYXRlLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZmFkZWQnLCByZXNvdXJjZU9yRm9sZGVyLmVsZW1lbnQuZGVjb3JhdGlvbnMuZmFkZWQpO1xuXHRcdFx0XHRzdHJpa2V0aHJvdWdoID0gcmVzb3VyY2VPckZvbGRlci5lbGVtZW50LmRlY29yYXRpb25zLnN0cmlrZVRocm91Z2g7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKHJlc291cmNlT3JGb2xkZXIuY29udGV4dC5wcm92aWRlcik7XG5cdFx0XHRcdHRoaXMuX3JlbmRlckFjdGlvbkJhcih0ZW1wbGF0ZSwgcmVzb3VyY2VPckZvbGRlciwgbWVudXMuZ2V0UmVzb3VyY2VGb2xkZXJNZW51KHJlc291cmNlT3JGb2xkZXIuY29udGV4dCkpO1xuXG5cdFx0XHRcdG1hdGNoZXMgPSBjcmVhdGVNYXRjaGVzKG5vZGUuZmlsdGVyRGF0YSBhcyBGdXp6eVNjb3JlIHwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGVtcGxhdGUuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmYWRlZCcpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKHJlc291cmNlT3JGb2xkZXIucmVzb3VyY2VHcm91cC5wcm92aWRlcik7XG5cdFx0XHR0aGlzLl9yZW5kZXJBY3Rpb25CYXIodGVtcGxhdGUsIHJlc291cmNlT3JGb2xkZXIsIG1lbnVzLmdldFJlc291cmNlTWVudShyZXNvdXJjZU9yRm9sZGVyKSk7XG5cblx0XHRcdFttYXRjaGVzLCBkZXNjcmlwdGlvbk1hdGNoZXNdID0gcHJvY2Vzc1Jlc291cmNlRmlsdGVyRGF0YSh1cmksIG5vZGUuZmlsdGVyRGF0YSk7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2ZhZGVkJywgcmVzb3VyY2VPckZvbGRlci5kZWNvcmF0aW9ucy5mYWRlZCk7XG5cdFx0XHRzdHJpa2V0aHJvdWdoID0gcmVzb3VyY2VPckZvbGRlci5kZWNvcmF0aW9ucy5zdHJpa2VUaHJvdWdoO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlbmRlcmVkRGF0YTogUmVuZGVyZWRSZXNvdXJjZURhdGEgPSB7XG5cdFx0XHR0b29sdGlwLCB1cmksIGZpbGVMYWJlbE9wdGlvbnM6IHsgaGlkZVBhdGgsIGZpbGVLaW5kLCBtYXRjaGVzLCBkZXNjcmlwdGlvbk1hdGNoZXMsIHN0cmlrZXRocm91Z2ggfSwgaWNvblJlc291cmNlXG5cdFx0fTtcblxuXHRcdHRoaXMucmVuZGVySWNvbih0ZW1wbGF0ZSwgcmVuZGVyZWREYXRhKTtcblxuXHRcdHRoaXMucmVuZGVyZWRSZXNvdXJjZXMuc2V0KHRlbXBsYXRlLCByZW5kZXJlZERhdGEpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMucmVuZGVyZWRSZXNvdXJjZXMuZGVsZXRlKHRlbXBsYXRlKSkpO1xuXG5cdFx0dGVtcGxhdGUuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdG9vbHRpcCcsIHRvb2x0aXApO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQocmVzb3VyY2U6IElUcmVlTm9kZTxJU0NNUmVzb3VyY2UsIEZ1enp5U2NvcmUgfCBMYWJlbEZ1enp5U2NvcmU+IHwgSVRyZWVOb2RlPElSZXNvdXJjZU5vZGU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4sIEZ1enp5U2NvcmUgfCBMYWJlbEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogUmVzb3VyY2VUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPElTQ01SZXNvdXJjZT4gfCBJQ29tcHJlc3NlZFRyZWVOb2RlPElSZXNvdXJjZU5vZGU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4+LCBGdXp6eVNjb3JlIHwgTGFiZWxGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGU6IFJlc291cmNlVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wcmVzc2VkID0gbm9kZS5lbGVtZW50IGFzIElDb21wcmVzc2VkVHJlZU5vZGU8SVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPj47XG5cdFx0Y29uc3QgZm9sZGVyID0gY29tcHJlc3NlZC5lbGVtZW50c1tjb21wcmVzc2VkLmVsZW1lbnRzLmxlbmd0aCAtIDFdO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSBjb21wcmVzc2VkLmVsZW1lbnRzLm1hcChlID0+IGUubmFtZSk7XG5cdFx0Y29uc3QgZmlsZUtpbmQgPSBGaWxlS2luZC5GT0xERVI7XG5cblx0XHRjb25zdCBtYXRjaGVzID0gY3JlYXRlTWF0Y2hlcyhub2RlLmZpbHRlckRhdGEgYXMgRnV6enlTY29yZSB8IHVuZGVmaW5lZCk7XG5cdFx0dGVtcGxhdGUuZmlsZUxhYmVsLnNldFJlc291cmNlKHsgcmVzb3VyY2U6IGZvbGRlci51cmksIG5hbWU6IGxhYmVsIH0sIHtcblx0XHRcdGZpbGVEZWNvcmF0aW9uczogeyBjb2xvcnM6IGZhbHNlLCBiYWRnZXM6IHRydWUgfSxcblx0XHRcdGZpbGVLaW5kLFxuXHRcdFx0bWF0Y2hlcyxcblx0XHRcdHNlcGFyYXRvcjogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0U2VwYXJhdG9yKGZvbGRlci51cmkuc2NoZW1lKVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbWVudXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLm1lbnVzLmdldFJlcG9zaXRvcnlNZW51cyhmb2xkZXIuY29udGV4dC5wcm92aWRlcik7XG5cdFx0dGhpcy5fcmVuZGVyQWN0aW9uQmFyKHRlbXBsYXRlLCBmb2xkZXIsIG1lbnVzLmdldFJlc291cmNlRm9sZGVyTWVudShmb2xkZXIuY29udGV4dCkpO1xuXG5cdFx0dGVtcGxhdGUubmFtZS5jbGFzc0xpc3QucmVtb3ZlKCdzdHJpa2UtdGhyb3VnaCcpO1xuXHRcdHRlbXBsYXRlLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZmFkZWQnKTtcblx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXG5cdFx0dGVtcGxhdGUuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtdG9vbHRpcCcsICcnKTtcblx0fVxuXG5cdGRpc3Bvc2VDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8SVNDTVJlc291cmNlPiB8IElDb21wcmVzc2VkVHJlZU5vZGU8SVJlc291cmNlTm9kZTxJU0NNUmVzb3VyY2UsIElTQ01SZXNvdXJjZUdyb3VwPj4sIEZ1enp5U2NvcmUgfCBMYWJlbEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZTogUmVzb3VyY2VUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlOiBSZXNvdXJjZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJBY3Rpb25CYXIodGVtcGxhdGU6IFJlc291cmNlVGVtcGxhdGUsIHJlc291cmNlT3JGb2xkZXI6IElTQ01SZXNvdXJjZSB8IElSZXNvdXJjZU5vZGU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4sIG1lbnU6IElNZW51KTogdm9pZCB7XG5cdFx0aWYgKCF0ZW1wbGF0ZS5hY3Rpb25CYXJNZW51IHx8IHRlbXBsYXRlLmFjdGlvbkJhck1lbnUgIT09IG1lbnUpIHtcblx0XHRcdHRlbXBsYXRlLmFjdGlvbkJhck1lbnUgPSBtZW51O1xuXHRcdFx0dGVtcGxhdGUuYWN0aW9uQmFyTWVudUxpc3RlbmVyLnZhbHVlID0gY29ubmVjdFByaW1hcnlNZW51KG1lbnUsIHByaW1hcnkgPT4ge1xuXHRcdFx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIuc2V0QWN0aW9ucyhwcmltYXJ5KTtcblx0XHRcdH0sICdpbmxpbmUnKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZS5hY3Rpb25CYXIuY29udGV4dCA9IHJlc291cmNlT3JGb2xkZXI7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ29sb3JUaGVtZUNoYW5nZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFt0ZW1wbGF0ZSwgZGF0YV0gb2YgdGhpcy5yZW5kZXJlZFJlc291cmNlcykge1xuXHRcdFx0dGhpcy5yZW5kZXJJY29uKHRlbXBsYXRlLCBkYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckljb24odGVtcGxhdGU6IFJlc291cmNlVGVtcGxhdGUsIGRhdGE6IFJlbmRlcmVkUmVzb3VyY2VEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhlbWUgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0Y29uc3QgaWNvbiA9IGlzRGFyayh0aGVtZS50eXBlKSA/IGRhdGEuaWNvblJlc291cmNlPy5kZWNvcmF0aW9ucy5pY29uRGFyayA6IGRhdGEuaWNvblJlc291cmNlPy5kZWNvcmF0aW9ucy5pY29uO1xuXG5cdFx0dGVtcGxhdGUuZmlsZUxhYmVsLnNldEZpbGUoZGF0YS51cmksIHtcblx0XHRcdC4uLmRhdGEuZmlsZUxhYmVsT3B0aW9ucyxcblx0XHRcdGZpbGVEZWNvcmF0aW9uczogeyBjb2xvcnM6IGZhbHNlLCBiYWRnZXM6ICFpY29uIH0sXG5cdFx0fSk7XG5cblx0XHRpZiAoaWNvbikge1xuXHRcdFx0aWYgKFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSkge1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5jbGFzc05hbWUgPSBgZGVjb3JhdGlvbi1pY29uICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGljb24pfWA7XG5cdFx0XHRcdGlmIChpY29uLmNvbG9yKSB7XG5cdFx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uc3R5bGUuY29sb3IgPSB0aGVtZS5nZXRDb2xvcihpY29uLmNvbG9yLmlkKT8udG9TdHJpbmcoKSA/PyAnJztcblx0XHRcdFx0fVxuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uY2xhc3NOYW1lID0gJ2RlY29yYXRpb24taWNvbic7XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnN0eWxlLmNvbG9yID0gJyc7XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gYXNDU1NVcmwoaWNvbik7XG5cdFx0XHR9XG5cdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi50aXRsZSA9IGRhdGEudG9vbHRpcDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uY2xhc3NOYW1lID0gJ2RlY29yYXRpb24taWNvbic7XG5cdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uSWNvbi5zdHlsZS5jb2xvciA9ICcnO1xuXHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb25JY29uLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbkljb24udGl0bGUgPSAnJztcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIExpc3REZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPFRyZWVFbGVtZW50PiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBpbnB1dFJlbmRlcmVyOiBJbnB1dFJlbmRlcmVyKSB7IH1cblxuXHRnZXRIZWlnaHQoZWxlbWVudDogVHJlZUVsZW1lbnQpIHtcblx0XHRpZiAoaXNTQ01JbnB1dChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5wdXRSZW5kZXJlci5nZXRIZWlnaHQoZWxlbWVudCk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEFjdGlvbkJ1dHRvblJlbmRlcmVyLkRFRkFVTFRfSEVJR0hUICsgODtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIDIyO1xuXHRcdH1cblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogVHJlZUVsZW1lbnQpIHtcblx0XHRpZiAoaXNTQ01SZXBvc2l0b3J5KGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gUmVwb3NpdG9yeVJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01JbnB1dChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIElucHV0UmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEFjdGlvbkJ1dHRvblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZUdyb3VwKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gUmVzb3VyY2VHcm91cFJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZShlbGVtZW50KSB8fCBpc1NDTVJlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIFJlc291cmNlUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbGVtZW50Jyk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFNDTVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlIGltcGxlbWVudHMgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlPFRyZWVFbGVtZW50PiB7XG5cblx0aXNJbmNvbXByZXNzaWJsZShlbGVtZW50OiBUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmNoaWxkcmVuQ291bnQgPT09IDAgfHwgIWVsZW1lbnQucGFyZW50IHx8ICFlbGVtZW50LnBhcmVudC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxufVxuXG5jbGFzcyBTQ01UcmVlRmlsdGVyIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8VHJlZUVsZW1lbnQ+IHtcblxuXHRmaWx0ZXIoZWxlbWVudDogVHJlZUVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRpZiAoaXNTQ01SZXNvdXJjZUdyb3VwKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZXMubGVuZ3RoID4gMCB8fCAhZWxlbWVudC5oaWRlV2hlbkVtcHR5O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNDTVRyZWVTb3J0ZXIgaW1wbGVtZW50cyBJVHJlZVNvcnRlcjxUcmVlRWxlbWVudD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGU6ICgpID0+IFZpZXdNb2RlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld1NvcnRLZXk6ICgpID0+IFZpZXdTb3J0S2V5KSB7IH1cblxuXHRjb21wYXJlKG9uZTogVHJlZUVsZW1lbnQsIG90aGVyOiBUcmVlRWxlbWVudCk6IG51bWJlciB7XG5cdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShvbmUpKSB7XG5cdFx0XHRpZiAoIWlzU0NNUmVwb3NpdG9yeShvdGhlcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbXBhcmlzb24nKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0aWYgKGlzU0NNSW5wdXQob25lKSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01JbnB1dChvdGhlcikpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblxuXHRcdGlmIChpc1NDTUFjdGlvbkJ1dHRvbihvbmUpKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihvdGhlcikpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblxuXHRcdGlmIChpc1NDTVJlc291cmNlR3JvdXAob25lKSkge1xuXHRcdFx0cmV0dXJuIGlzU0NNUmVzb3VyY2VHcm91cChvdGhlcikgPyAwIDogLTE7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb3VyY2UgKExpc3QpXG5cdFx0aWYgKHRoaXMudmlld01vZGUoKSA9PT0gVmlld01vZGUuTGlzdCkge1xuXHRcdFx0Ly8gRmlsZU5hbWVcblx0XHRcdGlmICh0aGlzLnZpZXdTb3J0S2V5KCkgPT09IFZpZXdTb3J0S2V5Lk5hbWUpIHtcblx0XHRcdFx0Y29uc3Qgb25lTmFtZSA9IGJhc2VuYW1lKChvbmUgYXMgSVNDTVJlc291cmNlKS5zb3VyY2VVcmkpO1xuXHRcdFx0XHRjb25zdCBvdGhlck5hbWUgPSBiYXNlbmFtZSgob3RoZXIgYXMgSVNDTVJlc291cmNlKS5zb3VyY2VVcmkpO1xuXG5cdFx0XHRcdHJldHVybiBjb21wYXJlRmlsZU5hbWVzKG9uZU5hbWUsIG90aGVyTmFtZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN0YXR1c1xuXHRcdFx0aWYgKHRoaXMudmlld1NvcnRLZXkoKSA9PT0gVmlld1NvcnRLZXkuU3RhdHVzKSB7XG5cdFx0XHRcdGNvbnN0IG9uZVRvb2x0aXAgPSAob25lIGFzIElTQ01SZXNvdXJjZSkuZGVjb3JhdGlvbnMudG9vbHRpcCA/PyAnJztcblx0XHRcdFx0Y29uc3Qgb3RoZXJUb29sdGlwID0gKG90aGVyIGFzIElTQ01SZXNvdXJjZSkuZGVjb3JhdGlvbnMudG9vbHRpcCA/PyAnJztcblxuXHRcdFx0XHRpZiAob25lVG9vbHRpcCAhPT0gb3RoZXJUb29sdGlwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbXBhcmUob25lVG9vbHRpcCwgb3RoZXJUb29sdGlwKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBQYXRoIChkZWZhdWx0KVxuXHRcdFx0Y29uc3Qgb25lUGF0aCA9IChvbmUgYXMgSVNDTVJlc291cmNlKS5zb3VyY2VVcmkuZnNQYXRoO1xuXHRcdFx0Y29uc3Qgb3RoZXJQYXRoID0gKG90aGVyIGFzIElTQ01SZXNvdXJjZSkuc291cmNlVXJpLmZzUGF0aDtcblxuXHRcdFx0cmV0dXJuIGNvbXBhcmVQYXRocyhvbmVQYXRoLCBvdGhlclBhdGgpO1xuXHRcdH1cblxuXHRcdC8vIFJlc291cmNlIChUcmVlKVxuXHRcdGNvbnN0IG9uZUlzRGlyZWN0b3J5ID0gUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKG9uZSk7XG5cdFx0Y29uc3Qgb3RoZXJJc0RpcmVjdG9yeSA9IFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShvdGhlcik7XG5cblx0XHRpZiAob25lSXNEaXJlY3RvcnkgIT09IG90aGVySXNEaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiBvbmVJc0RpcmVjdG9yeSA/IC0xIDogMTtcblx0XHR9XG5cblx0XHRjb25zdCBvbmVOYW1lID0gUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKG9uZSkgPyBvbmUubmFtZSA6IGJhc2VuYW1lKChvbmUgYXMgSVNDTVJlc291cmNlKS5zb3VyY2VVcmkpO1xuXHRcdGNvbnN0IG90aGVyTmFtZSA9IFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShvdGhlcikgPyBvdGhlci5uYW1lIDogYmFzZW5hbWUoKG90aGVyIGFzIElTQ01SZXNvdXJjZSkuc291cmNlVXJpKTtcblxuXHRcdHJldHVybiBjb21wYXJlRmlsZU5hbWVzKG9uZU5hbWUsIG90aGVyTmFtZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNDTVRyZWVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI8VHJlZUVsZW1lbnQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHZpZXdNb2RlOiAoKSA9PiBWaWV3TW9kZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7IH1cblxuXHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlbGVtZW50OiBUcmVlRWxlbWVudCk6IHsgdG9TdHJpbmcoKTogc3RyaW5nIH0gfCB7IHRvU3RyaW5nKCk6IHN0cmluZyB9W10gfCB1bmRlZmluZWQge1xuXHRcdGlmIChSZXNvdXJjZVRyZWUuaXNSZXNvdXJjZU5vZGUoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50Lm5hbWU7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlcG9zaXRvcnkoZWxlbWVudCkgfHwgaXNTQ01JbnB1dChlbGVtZW50KSB8fCBpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlKCkgPT09IFZpZXdNb2RlLkxpc3QpIHtcblx0XHRcdFx0Ly8gSW4gTGlzdCBtb2RlIG1hdGNoIHVzaW5nIHRoZSBmaWxlIG5hbWUgYW5kIHRoZSBwYXRoLlxuXHRcdFx0XHQvLyBTaW5jZSB3ZSB3YW50IHRvIG1hdGNoIGJvdGggb24gdGhlIGZpbGUgbmFtZSBhbmQgdGhlXG5cdFx0XHRcdC8vIGZ1bGwgcGF0aCB3ZSByZXR1cm4gYW4gYXJyYXkgb2YgbGFiZWxzLiBBIG1hdGNoIGluIHRoZVxuXHRcdFx0XHQvLyBmaWxlIG5hbWUgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIGEgbWF0Y2ggaW4gdGhlIHBhdGguXG5cdFx0XHRcdGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUoZWxlbWVudC5zb3VyY2VVcmkpO1xuXHRcdFx0XHRjb25zdCBmaWxlUGF0aCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGVsZW1lbnQuc291cmNlVXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXG5cdFx0XHRcdHJldHVybiBbZmlsZU5hbWUsIGZpbGVQYXRoXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEluIFRyZWUgbW9kZSBvbmx5IG1hdGNoIHVzaW5nIHRoZSBmaWxlIG5hbWVcblx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKGVsZW1lbnQuc291cmNlVXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRDb21wcmVzc2VkTm9kZUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGVsZW1lbnRzOiBUcmVlRWxlbWVudFtdKTogeyB0b1N0cmluZygpOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm9sZGVycyA9IGVsZW1lbnRzIGFzIElSZXNvdXJjZU5vZGU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD5bXTtcblx0XHRyZXR1cm4gZm9sZGVycy5tYXAoZSA9PiBlLm5hbWUpLmpvaW4oJy8nKTtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXRTQ01SZXNvdXJjZUlkKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0aWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZWxlbWVudC5wcm92aWRlcjtcblx0XHRyZXR1cm4gYHJlcG86JHtwcm92aWRlci5pZH1gO1xuXHR9IGVsc2UgaWYgKGlzU0NNSW5wdXQoZWxlbWVudCkpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IGVsZW1lbnQucmVwb3NpdG9yeS5wcm92aWRlcjtcblx0XHRyZXR1cm4gYGlucHV0OiR7cHJvdmlkZXIuaWR9YDtcblx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZWxlbWVudC5yZXBvc2l0b3J5LnByb3ZpZGVyO1xuXHRcdHJldHVybiBgYWN0aW9uQnV0dG9uOiR7cHJvdmlkZXIuaWR9YDtcblx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlR3JvdXAoZWxlbWVudCkpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IGVsZW1lbnQucHJvdmlkZXI7XG5cdFx0cmV0dXJuIGByZXNvdXJjZUdyb3VwOiR7cHJvdmlkZXIuaWR9LyR7ZWxlbWVudC5pZH1gO1xuXHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2UoZWxlbWVudCkpIHtcblx0XHRjb25zdCBncm91cCA9IGVsZW1lbnQucmVzb3VyY2VHcm91cDtcblx0XHRjb25zdCBwcm92aWRlciA9IGdyb3VwLnByb3ZpZGVyO1xuXHRcdHJldHVybiBgcmVzb3VyY2U6JHtwcm92aWRlci5pZH0vJHtncm91cC5pZH0vJHtlbGVtZW50LnNvdXJjZVVyaS50b1N0cmluZygpfWA7XG5cdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZU5vZGUoZWxlbWVudCkpIHtcblx0XHRjb25zdCBncm91cCA9IGVsZW1lbnQuY29udGV4dDtcblx0XHRyZXR1cm4gYGZvbGRlcjoke2dyb3VwLnByb3ZpZGVyLmlkfS8ke2dyb3VwLmlkfS8kRk9MREVSLyR7ZWxlbWVudC51cmkudG9TdHJpbmcoKX1gO1xuXHR9IGVsc2Uge1xuXHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCB0cmVlIGVsZW1lbnQnKTtcblx0fVxufVxuXG5jbGFzcyBTQ01SZXNvdXJjZUlkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxUcmVlRWxlbWVudD4ge1xuXG5cdGdldElkKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZ2V0U0NNUmVzb3VyY2VJZChlbGVtZW50KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU0NNQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VHJlZUVsZW1lbnQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHsgfVxuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnc2NtJywgXCJTb3VyY2UgQ29udHJvbCBNYW5hZ2VtZW50XCIpO1xuXHR9XG5cblx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoUmVzb3VyY2VUcmVlLmlzUmVzb3VyY2VOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWxlbWVudC51cmksIHsgcmVsYXRpdmU6IHRydWUsIG5vUHJlZml4OiB0cnVlIH0pIHx8IGVsZW1lbnQubmFtZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGAke2VsZW1lbnQucHJvdmlkZXIubmFtZX0gJHtlbGVtZW50LnByb3ZpZGVyLmxhYmVsfWA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUlucHV0KGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCB2ZXJib3NpdHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuU291cmNlQ29udHJvbCkgPT09IHRydWU7XG5cblx0XHRcdGlmICghdmVyYm9zaXR5IHx8ICF0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzY21JbnB1dCcsIFwiU291cmNlIENvbnRyb2wgSW5wdXRcIik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGtiTGFiZWwgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5PcGVuQWNjZXNzaWJpbGl0eUhlbHApPy5nZXRMYWJlbCgpO1xuXHRcdFx0cmV0dXJuIGtiTGFiZWxcblx0XHRcdFx0PyBsb2NhbGl6ZSgnc2NtSW5wdXRSb3cuYWNjZXNzaWJpbGl0eUhlbHAnLCBcIlNvdXJjZSBDb250cm9sIElucHV0LCBVc2UgezB9IHRvIG9wZW4gU291cmNlIENvbnRyb2wgQWNjZXNzaWJpbGl0eSBIZWxwLlwiLCBrYkxhYmVsKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdzY21JbnB1dFJvdy5hY2Nlc3NpYmlsaXR5SGVscE5vS2InLCBcIlNvdXJjZSBDb250cm9sIElucHV0LCBSdW4gdGhlIE9wZW4gQWNjZXNzaWJpbGl0eSBIZWxwIGNvbW1hbmQgZm9yIG1vcmUgaW5mb3JtYXRpb24uXCIpO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01BY3Rpb25CdXR0b24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmJ1dHRvbj8uY29tbWFuZC50aXRsZSA/PyAnJztcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0cmVzdWx0LnB1c2goYmFzZW5hbWUoZWxlbWVudC5zb3VyY2VVcmkpKTtcblxuXHRcdFx0aWYgKGVsZW1lbnQuZGVjb3JhdGlvbnMudG9vbHRpcCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChlbGVtZW50LmRlY29yYXRpb25zLnRvb2x0aXApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXRoID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShlbGVtZW50LnNvdXJjZVVyaSksIHsgcmVsYXRpdmU6IHRydWUsIG5vUHJlZml4OiB0cnVlIH0pO1xuXG5cdFx0XHRpZiAocGF0aCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChwYXRoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdC5qb2luKCcsICcpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCBlbnVtIFZpZXdTb3J0S2V5IHtcblx0UGF0aCA9ICdwYXRoJyxcblx0TmFtZSA9ICduYW1lJyxcblx0U3RhdHVzID0gJ3N0YXR1cydcbn1cblxuY29uc3QgTWVudXMgPSB7XG5cdFZpZXdTb3J0OiBuZXcgTWVudUlkKCdTQ01WaWV3U29ydCcpLFxuXHRSZXBvc2l0b3JpZXM6IG5ldyBNZW51SWQoJ1NDTVJlcG9zaXRvcmllcycpLFxuXHRDaGFuZ2VzU2V0dGluZ3M6IG5ldyBNZW51SWQoJ1NDTUNoYW5nZXNTZXR0aW5ncycpLFxufTtcblxuZXhwb3J0IGNvbnN0IENvbnRleHRLZXlzID0ge1xuXHRTQ01WaWV3TW9kZTogbmV3IFJhd0NvbnRleHRLZXk8Vmlld01vZGU+KCdzY21WaWV3TW9kZScsIFZpZXdNb2RlLkxpc3QpLFxuXHRTQ01WaWV3U29ydEtleTogbmV3IFJhd0NvbnRleHRLZXk8Vmlld1NvcnRLZXk+KCdzY21WaWV3U29ydEtleScsIFZpZXdTb3J0S2V5LlBhdGgpLFxuXHRTQ01WaWV3QXJlQWxsUmVwb3NpdG9yaWVzQ29sbGFwc2VkOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2NtVmlld0FyZUFsbFJlcG9zaXRvcmllc0NvbGxhcHNlZCcsIGZhbHNlKSxcblx0U0NNVmlld0lzQW55UmVwb3NpdG9yeUNvbGxhcHNpYmxlOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignc2NtVmlld0lzQW55UmVwb3NpdG9yeUNvbGxhcHNpYmxlJywgZmFsc2UpLFxuXHRTQ01Qcm92aWRlcjogbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPignc2NtUHJvdmlkZXInLCB1bmRlZmluZWQpLFxuXHRTQ01Qcm92aWRlclJvb3RVcmk6IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZyB8IHVuZGVmaW5lZD4oJ3NjbVByb3ZpZGVyUm9vdFVyaScsIHVuZGVmaW5lZCksXG5cdFNDTVByb3ZpZGVySGFzUm9vdFVyaTogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NjbVByb3ZpZGVySGFzUm9vdFVyaScsIHVuZGVmaW5lZCksXG5cdFNDTUhpc3RvcnlJdGVtQ291bnQ6IG5ldyBSYXdDb250ZXh0S2V5PG51bWJlcj4oJ3NjbUhpc3RvcnlJdGVtQ291bnQnLCAwKSxcblx0U0NNSGlzdG9yeVZpZXdNb2RlOiBuZXcgUmF3Q29udGV4dEtleTxWaWV3TW9kZT4oJ3NjbUhpc3RvcnlWaWV3TW9kZScsIFZpZXdNb2RlLkxpc3QpLFxuXHRTQ01DdXJyZW50SGlzdG9yeUl0ZW1SZWZIYXNSZW1vdGU6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzY21DdXJyZW50SGlzdG9yeUl0ZW1SZWZIYXNSZW1vdGUnLCBmYWxzZSksXG5cdFNDTUN1cnJlbnRIaXN0b3J5SXRlbVJlZkhhc0Jhc2U6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzY21DdXJyZW50SGlzdG9yeUl0ZW1SZWZIYXNCYXNlJywgZmFsc2UpLFxuXHRTQ01DdXJyZW50SGlzdG9yeUl0ZW1SZWZJbkZpbHRlcjogbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3NjbUN1cnJlbnRIaXN0b3J5SXRlbVJlZkluRmlsdGVyJywgZmFsc2UpLFxuXHRSZXBvc2l0b3J5Q291bnQ6IG5ldyBSYXdDb250ZXh0S2V5PG51bWJlcj4oJ3NjbVJlcG9zaXRvcnlDb3VudCcsIDApLFxuXHRSZXBvc2l0b3J5VmlzaWJpbGl0eUNvdW50OiBuZXcgUmF3Q29udGV4dEtleTxudW1iZXI+KCdzY21SZXBvc2l0b3J5VmlzaWJsZUNvdW50JywgMCksXG5cdFJlcG9zaXRvcnlWaXNpYmlsaXR5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KSB7XG5cdFx0cmV0dXJuIG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KGBzY21SZXBvc2l0b3J5VmlzaWJsZToke3JlcG9zaXRvcnkucHJvdmlkZXIuaWR9YCwgZmFsc2UpO1xuXHR9XG59O1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlNDTVRpdGxlLCB7XG5cdHRpdGxlOiBsb2NhbGl6ZSgnc29ydEFjdGlvbicsIFwiVmlldyAmIFNvcnRcIiksXG5cdHN1Ym1lbnU6IE1lbnVzLlZpZXdTb3J0LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19QQU5FX0lEKSwgQ29udGV4dEtleXMuUmVwb3NpdG9yeUNvdW50Lm5vdEVxdWFsc1RvKDApKSxcblx0Z3JvdXA6ICcwX3ZpZXcmc29ydCcsXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLlZpZXdTb3J0LCB7XG5cdHRpdGxlOiBsb2NhbGl6ZSgncmVwb3NpdG9yaWVzJywgXCJSZXBvc2l0b3JpZXNcIiksXG5cdHN1Ym1lbnU6IE1lbnVzLlJlcG9zaXRvcmllcyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuZ3JlYXRlcihDb250ZXh0S2V5cy5SZXBvc2l0b3J5Q291bnQua2V5LCAxKSxcblx0Z3JvdXA6ICcwX3JlcG9zaXRvcmllcydcbn0pO1xuXG5jbGFzcyBSZXBvc2l0b3J5VmlzaWJpbGl0eUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHByaXZhdGUgcmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnk7XG5cblx0Y29uc3RydWN0b3IocmVwb3NpdG9yeTogSVNDTVJlcG9zaXRvcnkpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5zY20uYWN0aW9uLnRvZ2dsZVJlcG9zaXRvcnlWaXNpYmlsaXR5LiR7cmVwb3NpdG9yeS5wcm92aWRlci5pZH1gLFxuXHRcdFx0dGl0bGU6IHJlcG9zaXRvcnkucHJvdmlkZXIubmFtZSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoQ29udGV4dEtleXMuUmVwb3NpdG9yeVZpc2liaWxpdHlDb3VudC5ub3RFcXVhbHNUbygxKSwgQ29udGV4dEtleXMuUmVwb3NpdG9yeVZpc2liaWxpdHkocmVwb3NpdG9yeSkuaXNFcXVhbFRvKGZhbHNlKSksXG5cdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5cy5SZXBvc2l0b3J5VmlzaWJpbGl0eShyZXBvc2l0b3J5KS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRtZW51OiB7IGlkOiBNZW51cy5SZXBvc2l0b3JpZXMsIGdyb3VwOiAnMF9yZXBvc2l0b3JpZXMnIH1cblx0XHR9KTtcblx0XHR0aGlzLnJlcG9zaXRvcnkgPSByZXBvc2l0b3J5O1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3Qgc2NtVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNDTVZpZXdTZXJ2aWNlKTtcblx0XHRzY21WaWV3U2VydmljZS50b2dnbGVWaXNpYmlsaXR5KHRoaXMucmVwb3NpdG9yeSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFJlcG9zaXRvcnlWaXNpYmlsaXR5SXRlbSB7XG5cdHJlYWRvbmx5IGNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmNsYXNzIFJlcG9zaXRvcnlWaXNpYmlsaXR5QWN0aW9uQ29udHJvbGxlciB7XG5cblx0cHJpdmF0ZSBpdGVtcyA9IG5ldyBNYXA8SVNDTVJlcG9zaXRvcnksIFJlcG9zaXRvcnlWaXNpYmlsaXR5SXRlbT4oKTtcblx0cHJpdmF0ZSByZXBvc2l0b3J5Q291bnRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxudW1iZXI+O1xuXHRwcml2YXRlIHJlcG9zaXRvcnlWaXNpYmlsaXR5Q291bnRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxudW1iZXI+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU0NNVmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21WaWV3U2VydmljZTogSVNDTVZpZXdTZXJ2aWNlLFxuXHRcdEBJU0NNU2VydmljZSBzY21TZXJ2aWNlOiBJU0NNU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLnJlcG9zaXRvcnlDb3VudENvbnRleHRLZXkgPSBDb250ZXh0S2V5cy5SZXBvc2l0b3J5Q291bnQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlWaXNpYmlsaXR5Q291bnRDb250ZXh0S2V5ID0gQ29udGV4dEtleXMuUmVwb3NpdG9yeVZpc2liaWxpdHlDb3VudC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0c2NtVmlld1NlcnZpY2Uub25EaWRDaGFuZ2VWaXNpYmxlUmVwb3NpdG9yaWVzKHRoaXMub25EaWRDaGFuZ2VWaXNpYmxlUmVwb3NpdG9yaWVzLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRzY21TZXJ2aWNlLm9uRGlkQWRkUmVwb3NpdG9yeSh0aGlzLm9uRGlkQWRkUmVwb3NpdG9yeSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0c2NtU2VydmljZS5vbkRpZFJlbW92ZVJlcG9zaXRvcnkodGhpcy5vbkRpZFJlbW92ZVJlcG9zaXRvcnksIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXG5cdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIHNjbVNlcnZpY2UucmVwb3NpdG9yaWVzKSB7XG5cdFx0XHR0aGlzLm9uRGlkQWRkUmVwb3NpdG9yeShyZXBvc2l0b3J5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQWRkUmVwb3NpdG9yeShyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSk6IHZvaWQge1xuXHRcdGlmIChyZXBvc2l0b3J5LnByb3ZpZGVyLmlzSGlkZGVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uID0gcmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgUmVwb3NpdG9yeVZpc2liaWxpdHlBY3Rpb24ge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29udGV4dEtleSA9IENvbnRleHRLZXlzLlJlcG9zaXRvcnlWaXNpYmlsaXR5KHJlcG9zaXRvcnkpLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb250ZXh0S2V5LnNldCh0aGlzLnNjbVZpZXdTZXJ2aWNlLmlzVmlzaWJsZShyZXBvc2l0b3J5KSk7XG5cblx0XHR0aGlzLml0ZW1zLnNldChyZXBvc2l0b3J5LCB7XG5cdFx0XHRjb250ZXh0S2V5LFxuXHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0Y29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0XHRhY3Rpb24uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy51cGRhdGVSZXBvc2l0b3J5Q29udGV4dEtleXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRSZW1vdmVSZXBvc2l0b3J5KHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KTogdm9pZCB7XG5cdFx0dGhpcy5pdGVtcy5nZXQocmVwb3NpdG9yeSk/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLml0ZW1zLmRlbGV0ZShyZXBvc2l0b3J5KTtcblx0XHR0aGlzLnVwZGF0ZVJlcG9zaXRvcnlDb250ZXh0S2V5cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMoKTogdm9pZCB7XG5cdFx0bGV0IGNvdW50ID0gMDtcblxuXHRcdGZvciAoY29uc3QgW3JlcG9zaXRvcnksIGl0ZW1dIG9mIHRoaXMuaXRlbXMpIHtcblx0XHRcdGNvbnN0IGlzVmlzaWJsZSA9IHRoaXMuc2NtVmlld1NlcnZpY2UuaXNWaXNpYmxlKHJlcG9zaXRvcnkpO1xuXHRcdFx0aXRlbS5jb250ZXh0S2V5LnNldChpc1Zpc2libGUpO1xuXG5cdFx0XHRpZiAoaXNWaXNpYmxlKSB7XG5cdFx0XHRcdGNvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yZXBvc2l0b3J5Q291bnRDb250ZXh0S2V5LnNldCh0aGlzLml0ZW1zLnNpemUpO1xuXHRcdHRoaXMucmVwb3NpdG9yeVZpc2liaWxpdHlDb3VudENvbnRleHRLZXkuc2V0KGNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVwb3NpdG9yeUNvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdHRoaXMucmVwb3NpdG9yeUNvdW50Q29udGV4dEtleS5zZXQodGhpcy5pdGVtcy5zaXplKTtcblx0XHR0aGlzLnJlcG9zaXRvcnlWaXNpYmlsaXR5Q291bnRDb250ZXh0S2V5LnNldChJdGVyYWJsZS5yZWR1Y2UodGhpcy5pdGVtcy5rZXlzKCksIChyLCByZXBvc2l0b3J5KSA9PiByICsgKHRoaXMuc2NtVmlld1NlcnZpY2UuaXNWaXNpYmxlKHJlcG9zaXRvcnkpID8gMSA6IDApLCAwKSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5pdGVtcy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5pdGVtcy5jbGVhcigpO1xuXHR9XG59XG5cbmNsYXNzIFNldExpc3RWaWV3TW9kZUFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248U0NNVmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0aWQgPSAnd29ya2JlbmNoLnNjbS5hY3Rpb24uc2V0TGlzdFZpZXdNb2RlJyxcblx0XHRtZW51OiBQYXJ0aWFsPElBY3Rpb24yT3B0aW9uc1snbWVudSddPiA9IHt9KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NldExpc3RWaWV3TW9kZScsIFwiVmlldyBhcyBMaXN0XCIpLFxuXHRcdFx0dmlld0lkOiBWSUVXX1BBTkVfSUQsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpc3RUcmVlLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleXMuU0NNVmlld01vZGUuaXNFcXVhbFRvKFZpZXdNb2RlLkxpc3QpLFxuXHRcdFx0bWVudTogeyBpZDogTWVudXMuVmlld1NvcnQsIGdyb3VwOiAnMV92aWV3bW9kZScsIC4uLm1lbnUgfVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuSW5WaWV3KF86IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTVZpZXdQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dmlldy52aWV3TW9kZSA9IFZpZXdNb2RlLkxpc3Q7XG5cdH1cbn1cblxuY2xhc3MgU2V0TGlzdFZpZXdNb2RlTmF2aWdhdGlvbkFjdGlvbiBleHRlbmRzIFNldExpc3RWaWV3TW9kZUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0J3dvcmtiZW5jaC5zY20uYWN0aW9uLnNldExpc3RWaWV3TW9kZU5hdmlnYXRpb24nLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlNDTVRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVklFV19QQU5FX0lEKSwgQ29udGV4dEtleXMuUmVwb3NpdG9yeUNvdW50Lm5vdEVxdWFsc1RvKDApLCBDb250ZXh0S2V5cy5TQ01WaWV3TW9kZS5pc0VxdWFsVG8oVmlld01vZGUuVHJlZSkpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0b3JkZXI6IC0xMDAwXG5cdFx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBTZXRUcmVlVmlld01vZGVBY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFNDTVZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkID0gJ3dvcmtiZW5jaC5zY20uYWN0aW9uLnNldFRyZWVWaWV3TW9kZScsXG5cdFx0bWVudTogUGFydGlhbDxJQWN0aW9uMk9wdGlvbnNbJ21lbnUnXT4gPSB7fSkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzZXRUcmVlVmlld01vZGUnLCBcIlZpZXcgYXMgVHJlZVwiKSxcblx0XHRcdFx0dmlld0lkOiBWSUVXX1BBTkVfSUQsXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5saXN0RmxhdCxcblx0XHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleXMuU0NNVmlld01vZGUuaXNFcXVhbFRvKFZpZXdNb2RlLlRyZWUpLFxuXHRcdFx0XHRtZW51OiB7IGlkOiBNZW51cy5WaWV3U29ydCwgZ3JvdXA6ICcxX3ZpZXdtb2RlJywgLi4ubWVudSB9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhfOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBTQ01WaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHZpZXcudmlld01vZGUgPSBWaWV3TW9kZS5UcmVlO1xuXHR9XG59XG5cbmNsYXNzIFNldFRyZWVWaWV3TW9kZU5hdmlnYXRpb25BY3Rpb24gZXh0ZW5kcyBTZXRUcmVlVmlld01vZGVBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdCd3b3JrYmVuY2guc2NtLmFjdGlvbi5zZXRUcmVlVmlld01vZGVOYXZpZ2F0aW9uJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01UaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFZJRVdfUEFORV9JRCksIENvbnRleHRLZXlzLlJlcG9zaXRvcnlDb3VudC5ub3RFcXVhbHNUbygwKSwgQ29udGV4dEtleXMuU0NNVmlld01vZGUuaXNFcXVhbFRvKFZpZXdNb2RlLkxpc3QpKSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdG9yZGVyOiAtMTAwMFxuXHRcdFx0fSk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKFNldExpc3RWaWV3TW9kZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU2V0VHJlZVZpZXdNb2RlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTZXRMaXN0Vmlld01vZGVOYXZpZ2F0aW9uQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTZXRUcmVlVmlld01vZGVOYXZpZ2F0aW9uQWN0aW9uKTtcblxuYWJzdHJhY3QgY2xhc3MgUmVwb3NpdG9yeVNvcnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSBzb3J0S2V5OiBJU0NNUmVwb3NpdG9yeVNvcnRLZXksIHRpdGxlOiBzdHJpbmcpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5zY20uYWN0aW9uLnJlcG9zaXRvcmllcy5zZXRTb3J0S2V5LiR7c29ydEtleX1gLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHR0b2dnbGVkOiBSZXBvc2l0b3J5Q29udGV4dEtleXMuUmVwb3NpdG9yeVNvcnRLZXkuaXNFcXVhbFRvKHNvcnRLZXkpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVzLlJlcG9zaXRvcmllcyxcblx0XHRcdFx0XHRncm91cDogJzFfc29ydCdcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuU0NNU291cmNlQ29udHJvbFRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnMV9zb3J0Jyxcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGFjY2Vzc29yLmdldChJU0NNVmlld1NlcnZpY2UpLnRvZ2dsZVNvcnRLZXkodGhpcy5zb3J0S2V5KTtcblx0fVxufVxuXG5cbmNsYXNzIFJlcG9zaXRvcnlTb3J0QnlEaXNjb3ZlcnlUaW1lQWN0aW9uIGV4dGVuZHMgUmVwb3NpdG9yeVNvcnRBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihJU0NNUmVwb3NpdG9yeVNvcnRLZXkuRGlzY292ZXJ5VGltZSwgbG9jYWxpemUoJ3JlcG9zaXRvcnlTb3J0QnlEaXNjb3ZlcnlUaW1lJywgXCJTb3J0IGJ5IERpc2NvdmVyeSBUaW1lXCIpKTtcblx0fVxufVxuXG5jbGFzcyBSZXBvc2l0b3J5U29ydEJ5TmFtZUFjdGlvbiBleHRlbmRzIFJlcG9zaXRvcnlTb3J0QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoSVNDTVJlcG9zaXRvcnlTb3J0S2V5Lk5hbWUsIGxvY2FsaXplKCdyZXBvc2l0b3J5U29ydEJ5TmFtZScsIFwiU29ydCBieSBOYW1lXCIpKTtcblx0fVxufVxuXG5jbGFzcyBSZXBvc2l0b3J5U29ydEJ5UGF0aEFjdGlvbiBleHRlbmRzIFJlcG9zaXRvcnlTb3J0QWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoSVNDTVJlcG9zaXRvcnlTb3J0S2V5LlBhdGgsIGxvY2FsaXplKCdyZXBvc2l0b3J5U29ydEJ5UGF0aCcsIFwiU29ydCBieSBQYXRoXCIpKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoUmVwb3NpdG9yeVNvcnRCeURpc2NvdmVyeVRpbWVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFJlcG9zaXRvcnlTb3J0QnlOYW1lQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZXBvc2l0b3J5U29ydEJ5UGF0aEFjdGlvbik7XG5cbmFic3RyYWN0IGNsYXNzIFJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc2VsZWN0aW9uTW9kZTogSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLCB0aXRsZTogc3RyaW5nLCBvcmRlcjogbnVtYmVyKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guc2NtLmFjdGlvbi5yZXBvc2l0b3JpZXMuc2V0U2VsZWN0aW9uTW9kZS4ke3NlbGVjdGlvbk1vZGV9YCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0dG9nZ2xlZDogUmVwb3NpdG9yeUNvbnRleHRLZXlzLlJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLmlzRXF1YWxUbyhzZWxlY3Rpb25Nb2RlKSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51cy5SZXBvc2l0b3JpZXMsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdzY20ucHJvdmlkZXJDb3VudCcpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZ3JlYXRlcignc2NtLnByb3ZpZGVyQ291bnQnLCAxKSksXG5cdFx0XHRcdFx0Z3JvdXA6ICcyX3NlbGVjdGlvbk1vZGUnLFxuXHRcdFx0XHRcdG9yZGVyXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLlNDTVNvdXJjZUNvbnRyb2xUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ3NjbS5wcm92aWRlckNvdW50JyksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ncmVhdGVyKCdzY20ucHJvdmlkZXJDb3VudCcsIDEpKSxcblx0XHRcdFx0XHRncm91cDogJzJfc2VsZWN0aW9uTW9kZScsXG5cdFx0XHRcdFx0b3JkZXJcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGFjY2Vzc29yLmdldChJU0NNVmlld1NlcnZpY2UpLnRvZ2dsZVNlbGVjdGlvbk1vZGUodGhpcy5zZWxlY3Rpb25Nb2RlKTtcblx0fVxufVxuXG5jbGFzcyBSZXBvc2l0b3J5U2luZ2xlU2VsZWN0aW9uTW9kZUFjdGlvbiBleHRlbmRzIFJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoSVNDTVJlcG9zaXRvcnlTZWxlY3Rpb25Nb2RlLlNpbmdsZSwgbG9jYWxpemUoJ3JlcG9zaXRvcnlTaW5nbGVTZWxlY3Rpb25Nb2RlJywgXCJTZWxlY3QgU2luZ2xlIFJlcG9zaXRvcnlcIiksIDEpO1xuXHR9XG59XG5cbmNsYXNzIFJlcG9zaXRvcnlNdWx0aVNlbGVjdGlvbk1vZGVBY3Rpb24gZXh0ZW5kcyBSZXBvc2l0b3J5U2VsZWN0aW9uTW9kZUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKElTQ01SZXBvc2l0b3J5U2VsZWN0aW9uTW9kZS5NdWx0aXBsZSwgbG9jYWxpemUoJ3JlcG9zaXRvcnlNdWx0aVNlbGVjdGlvbk1vZGUnLCBcIlNlbGVjdCBNdWx0aXBsZSBSZXBvc2l0b3JpZXNcIiksIDIpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihSZXBvc2l0b3J5U2luZ2xlU2VsZWN0aW9uTW9kZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUmVwb3NpdG9yeU11bHRpU2VsZWN0aW9uTW9kZUFjdGlvbik7XG5cbmFic3RyYWN0IGNsYXNzIFNldFNvcnRLZXlBY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFNDTVZpZXdQYW5lPiB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc29ydEtleTogVmlld1NvcnRLZXksIHRpdGxlOiBzdHJpbmcpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogYHdvcmtiZW5jaC5zY20uYWN0aW9uLnNldFNvcnRLZXkuJHtzb3J0S2V5fWAsXG5cdFx0XHR0aXRsZSxcblx0XHRcdHZpZXdJZDogVklFV19QQU5FX0lELFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleXMuU0NNVmlld1NvcnRLZXkuaXNFcXVhbFRvKHNvcnRLZXkpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5cy5TQ01WaWV3TW9kZS5pc0VxdWFsVG8oVmlld01vZGUuTGlzdCksXG5cdFx0XHRtZW51OiB7IGlkOiBNZW51cy5WaWV3U29ydCwgZ3JvdXA6ICcyX3NvcnQnIH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhfOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBTQ01WaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHZpZXcudmlld1NvcnRLZXkgPSB0aGlzLnNvcnRLZXk7XG5cdH1cbn1cblxuY2xhc3MgU2V0U29ydEJ5TmFtZUFjdGlvbiBleHRlbmRzIFNldFNvcnRLZXlBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihWaWV3U29ydEtleS5OYW1lLCBsb2NhbGl6ZSgnc29ydENoYW5nZXNCeU5hbWUnLCBcIlNvcnQgQ2hhbmdlcyBieSBOYW1lXCIpKTtcblx0fVxufVxuXG5jbGFzcyBTZXRTb3J0QnlQYXRoQWN0aW9uIGV4dGVuZHMgU2V0U29ydEtleUFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFZpZXdTb3J0S2V5LlBhdGgsIGxvY2FsaXplKCdzb3J0Q2hhbmdlc0J5UGF0aCcsIFwiU29ydCBDaGFuZ2VzIGJ5IFBhdGhcIikpO1xuXHR9XG59XG5cbmNsYXNzIFNldFNvcnRCeVN0YXR1c0FjdGlvbiBleHRlbmRzIFNldFNvcnRLZXlBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihWaWV3U29ydEtleS5TdGF0dXMsIGxvY2FsaXplKCdzb3J0Q2hhbmdlc0J5U3RhdHVzJywgXCJTb3J0IENoYW5nZXMgYnkgU3RhdHVzXCIpKTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoU2V0U29ydEJ5TmFtZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU2V0U29ydEJ5UGF0aEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU2V0U29ydEJ5U3RhdHVzQWN0aW9uKTtcblxuY2xhc3MgQ29sbGFwc2VBbGxSZXBvc2l0b3JpZXNBY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFNDTVZpZXdQYW5lPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guc2NtLmFjdGlvbi5jb2xsYXBzZUFsbFJlcG9zaXRvcmllc2AsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvbGxhcHNlIGFsbCcsIFwiQ29sbGFwc2UgQWxsIFJlcG9zaXRvcmllc1wiKSxcblx0XHRcdHZpZXdJZDogVklFV19QQU5FX0lELFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb2xsYXBzZUFsbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5TQ01UaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFZJRVdfUEFORV9JRCksIENvbnRleHRLZXlzLlNDTVZpZXdJc0FueVJlcG9zaXRvcnlDb2xsYXBzaWJsZS5pc0VxdWFsVG8odHJ1ZSksIENvbnRleHRLZXlzLlNDTVZpZXdBcmVBbGxSZXBvc2l0b3JpZXNDb2xsYXBzZWQuaXNFcXVhbFRvKGZhbHNlKSlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhfOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBTQ01WaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHZpZXcuY29sbGFwc2VBbGxSZXBvc2l0b3JpZXMoKTtcblx0fVxufVxuXG5jbGFzcyBFeHBhbmRBbGxSZXBvc2l0b3JpZXNBY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFNDTVZpZXdQYW5lPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guc2NtLmFjdGlvbi5leHBhbmRBbGxSZXBvc2l0b3JpZXNgLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdleHBhbmQgYWxsJywgXCJFeHBhbmQgQWxsIFJlcG9zaXRvcmllc1wiKSxcblx0XHRcdHZpZXdJZDogVklFV19QQU5FX0lELFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5leHBhbmRBbGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuU0NNVGl0bGUsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBWSUVXX1BBTkVfSUQpLCBDb250ZXh0S2V5cy5TQ01WaWV3SXNBbnlSZXBvc2l0b3J5Q29sbGFwc2libGUuaXNFcXVhbFRvKHRydWUpLCBDb250ZXh0S2V5cy5TQ01WaWV3QXJlQWxsUmVwb3NpdG9yaWVzQ29sbGFwc2VkLmlzRXF1YWxUbyh0cnVlKSlcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhfOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBTQ01WaWV3UGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHZpZXcuZXhwYW5kQWxsUmVwb3NpdG9yaWVzKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKENvbGxhcHNlQWxsUmVwb3NpdG9yaWVzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihFeHBhbmRBbGxSZXBvc2l0b3JpZXNBY3Rpb24pO1xuXG5jbGFzcyBDb2xsYXBzZUFsbEFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248U0NNVmlld1BhbmU+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGB3b3JrYmVuY2guc2NtLmFjdGlvbi5jb2xsYXBzZUFsbGAsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NjbUNvbGxhcHNlQWxsJywgXCJDb2xsYXBzZSBBbGxcIiksXG5cdFx0XHR2aWV3SWQ6IFZJRVdfUEFORV9JRCxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuU0NNUmVzb3VyY2VHcm91cENvbnRleHQsXG5cdFx0XHRcdGdyb3VwOiAnOV9jb2xsYXBzZScsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlzLlNDTVZpZXdNb2RlLmlzRXF1YWxUbyhWaWV3TW9kZS5UcmVlKSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFNDTVZpZXdQYW5lLCBjb250ZXh0PzogSVNDTVJlc291cmNlR3JvdXApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY29udGV4dCkge1xuXHRcdFx0dmlldy5jb2xsYXBzZUFsbFJlc291cmNlcyhjb250ZXh0KTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKENvbGxhcHNlQWxsQWN0aW9uKTtcblxuZXhwb3J0IGNsYXNzIFNDTVZpZXdQYW5lIGV4dGVuZHMgVmlld1BhbmUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0OiBFbWl0dGVyPHZvaWQ+O1xuXHRwcml2YXRlIGxheW91dENhY2hlOiBJU0NNTGF5b3V0O1xuXG5cdHByaXZhdGUgdHJlZVNjcm9sbFRvcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRyZWVDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0cmVlITogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU0NNVmlld1NlcnZpY2UsIFRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPjtcblxuXHRwcml2YXRlIGxpc3RMYWJlbHMhOiBSZXNvdXJjZUxhYmVscztcblx0cHJpdmF0ZSBpbnB1dFJlbmRlcmVyITogSW5wdXRSZW5kZXJlcjtcblx0cHJpdmF0ZSBhY3Rpb25CdXR0b25SZW5kZXJlciE6IEFjdGlvbkJ1dHRvblJlbmRlcmVyO1xuXG5cdHByaXZhdGUgX3ZpZXdNb2RlOiBWaWV3TW9kZTtcblx0Z2V0IHZpZXdNb2RlKCk6IFZpZXdNb2RlIHsgcmV0dXJuIHRoaXMuX3ZpZXdNb2RlOyB9XG5cdHNldCB2aWV3TW9kZShtb2RlOiBWaWV3TW9kZSkge1xuXHRcdGlmICh0aGlzLl92aWV3TW9kZSA9PT0gbW9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZpZXdNb2RlID0gbW9kZTtcblxuXHRcdC8vIFVwZGF0ZSBzb3J0IGtleSBiYXNlZCBvbiB2aWV3IG1vZGVcblx0XHR0aGlzLnZpZXdTb3J0S2V5ID0gdGhpcy5nZXRWaWV3U29ydEtleSgpO1xuXG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlbigpO1xuXHRcdHRoaXMub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdNb2RlLmZpcmUobW9kZSk7XG5cdFx0dGhpcy52aWV3TW9kZUNvbnRleHRLZXkuc2V0KG1vZGUpO1xuXG5cdFx0dGhpcy51cGRhdGVJbmRlbnRTdHlsZXModGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGBzY20udmlld01vZGVgLCBtb2RlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaWV3TW9kZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFZpZXdNb2RlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3TW9kZSA9IHRoaXMuX29uRGlkQ2hhbmdlVmlld01vZGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfdmlld1NvcnRLZXk6IFZpZXdTb3J0S2V5O1xuXHRnZXQgdmlld1NvcnRLZXkoKTogVmlld1NvcnRLZXkgeyByZXR1cm4gdGhpcy5fdmlld1NvcnRLZXk7IH1cblx0c2V0IHZpZXdTb3J0S2V5KHNvcnRLZXk6IFZpZXdTb3J0S2V5KSB7XG5cdFx0aWYgKHRoaXMuX3ZpZXdTb3J0S2V5ID09PSBzb3J0S2V5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fdmlld1NvcnRLZXkgPSBzb3J0S2V5O1xuXG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlbigpO1xuXHRcdHRoaXMudmlld1NvcnRLZXlDb250ZXh0S2V5LnNldChzb3J0S2V5KTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdTb3J0S2V5LmZpcmUoc29ydEtleSk7XG5cblx0XHRpZiAodGhpcy5fdmlld01vZGUgPT09IFZpZXdNb2RlLkxpc3QpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoYHNjbS52aWV3U29ydEtleWAsIHNvcnRLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaWV3U29ydEtleSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFZpZXdTb3J0S2V5PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3U29ydEtleSA9IHRoaXMuX29uRGlkQ2hhbmdlVmlld1NvcnRLZXkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpdGVtcyA9IG5ldyBEaXNwb3NhYmxlTWFwPElTQ01SZXBvc2l0b3J5LCBJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmlsaXR5RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0cmVlT3BlcmF0aW9uU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJldmVhbFJlc291cmNlVGhyb3R0bGVyID0gbmV3IFRocm90dGxlcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZUNoaWxkcmVuVGhyb3R0bGVyID0gbmV3IFRocm90dGxlcigpO1xuXG5cdHByaXZhdGUgdmlld01vZGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxWaWV3TW9kZT47XG5cdHByaXZhdGUgdmlld1NvcnRLZXlDb250ZXh0S2V5OiBJQ29udGV4dEtleTxWaWV3U29ydEtleT47XG5cdHByaXZhdGUgYXJlQWxsUmVwb3NpdG9yaWVzQ29sbGFwc2VkQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaXNBbnlSZXBvc2l0b3J5Q29sbGFwc2libGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHNjbVByb3ZpZGVyQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBzY21Qcm92aWRlclJvb3RVcmlDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHNjbVByb3ZpZGVySGFzUm9vdFVyaUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASVNDTVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21TZXJ2aWNlOiBJU0NNU2VydmljZSxcblx0XHRASVNDTVZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2NtVmlld1NlcnZpY2U6IElTQ01WaWV3U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoeyAuLi5vcHRpb25zLCB0aXRsZU1lbnVJZDogTWVudUlkLlNDTVRpdGxlIH0sIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gVmlldyBtb2RlIGFuZCBzb3J0IGtleVxuXHRcdHRoaXMuX3ZpZXdNb2RlID0gdGhpcy5nZXRWaWV3TW9kZSgpO1xuXHRcdHRoaXMuX3ZpZXdTb3J0S2V5ID0gdGhpcy5nZXRWaWV3U29ydEtleSgpO1xuXG5cdFx0Ly8gQ29udGV4dCBLZXlzXG5cdFx0dGhpcy52aWV3TW9kZUNvbnRleHRLZXkgPSBDb250ZXh0S2V5cy5TQ01WaWV3TW9kZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudmlld01vZGVDb250ZXh0S2V5LnNldCh0aGlzLl92aWV3TW9kZSk7XG5cdFx0dGhpcy52aWV3U29ydEtleUNvbnRleHRLZXkgPSBDb250ZXh0S2V5cy5TQ01WaWV3U29ydEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudmlld1NvcnRLZXlDb250ZXh0S2V5LnNldCh0aGlzLnZpZXdTb3J0S2V5KTtcblx0XHR0aGlzLmFyZUFsbFJlcG9zaXRvcmllc0NvbGxhcHNlZENvbnRleHRLZXkgPSBDb250ZXh0S2V5cy5TQ01WaWV3QXJlQWxsUmVwb3NpdG9yaWVzQ29sbGFwc2VkLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pc0FueVJlcG9zaXRvcnlDb2xsYXBzaWJsZUNvbnRleHRLZXkgPSBDb250ZXh0S2V5cy5TQ01WaWV3SXNBbnlSZXBvc2l0b3J5Q29sbGFwc2libGUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNjbVByb3ZpZGVyQ29udGV4dEtleSA9IENvbnRleHRLZXlzLlNDTVByb3ZpZGVyLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zY21Qcm92aWRlclJvb3RVcmlDb250ZXh0S2V5ID0gQ29udGV4dEtleXMuU0NNUHJvdmlkZXJSb290VXJpLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zY21Qcm92aWRlckhhc1Jvb3RVcmlDb250ZXh0S2V5ID0gQ29udGV4dEtleXMuU0NNUHJvdmlkZXJIYXNSb290VXJpLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9vbkRpZExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdHRoaXMubGF5b3V0Q2FjaGUgPSB7IGhlaWdodDogdW5kZWZpbmVkLCB3aWR0aDogdW5kZWZpbmVkLCBvbkRpZENoYW5nZTogdGhpcy5fb25EaWRMYXlvdXQuZXZlbnQgfTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCB1bmRlZmluZWQsIHRoaXMuZGlzcG9zYWJsZXMpKGUgPT4ge1xuXHRcdFx0c3dpdGNoIChlLmtleSkge1xuXHRcdFx0XHRjYXNlICdzY20udmlld01vZGUnOlxuXHRcdFx0XHRcdHRoaXMudmlld01vZGUgPSB0aGlzLmdldFZpZXdNb2RlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ3NjbS52aWV3U29ydEtleSc6XG5cdFx0XHRcdFx0dGhpcy52aWV3U29ydEtleSA9IHRoaXMuZ2V0Vmlld1NvcnRLZXkoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKGUgPT4ge1xuXHRcdFx0dGhpcy52aWV3TW9kZSA9IHRoaXMuZ2V0Vmlld01vZGUoKTtcblx0XHRcdHRoaXMudmlld1NvcnRLZXkgPSB0aGlzLmdldFZpZXdTb3J0S2V5KCk7XG5cblx0XHRcdHRoaXMuc3RvcmVUcmVlVmlld1N0YXRlKCk7XG5cdFx0fSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cblx0XHRFdmVudC5hbnkodGhpcy5zY21TZXJ2aWNlLm9uRGlkQWRkUmVwb3NpdG9yeSwgdGhpcy5zY21TZXJ2aWNlLm9uRGlkUmVtb3ZlUmVwb3NpdG9yeSkoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlLmZpcmUoKSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnJldmVhbFJlc291cmNlVGhyb3R0bGVyKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnVwZGF0ZUNoaWxkcmVuVGhyb3R0bGVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdGhpcy5sYXlvdXRDYWNoZS5oZWlnaHQsIHdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQgPSB0aGlzLmxheW91dENhY2hlLndpZHRoKTogdm9pZCB7XG5cdFx0aWYgKGhlaWdodCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHdpZHRoICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXlvdXRDYWNoZS5oZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5sYXlvdXRDYWNoZS53aWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuX29uRGlkTGF5b3V0LmZpcmUoKTtcblxuXHRcdHRoaXMudHJlZUNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0Ly8gVHJlZVxuXHRcdHRoaXMudHJlZUNvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5zY20tdmlldy5zaG93LWZpbGUtaWNvbnMnKSk7XG5cdFx0dGhpcy50cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2ZpbGUtaWNvbi10aGVtYWJsZS10cmVlJyk7XG5cdFx0dGhpcy50cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Nob3ctZmlsZS1pY29ucycpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQWN0aW9uc1Zpc2liaWxpdHkgPSAoKSA9PiB0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdy1hY3Rpb25zJywgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignc2NtLmFsd2F5c1Nob3dBY3Rpb25zJykpO1xuXHRcdEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uYWx3YXlzU2hvd0FjdGlvbnMnKSwgdGhpcy5kaXNwb3NhYmxlcykodXBkYXRlQWN0aW9uc1Zpc2liaWxpdHksIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHVwZGF0ZUFjdGlvbnNWaXNpYmlsaXR5KCk7XG5cblx0XHRjb25zdCB1cGRhdGVQcm92aWRlckNvdW50VmlzaWJpbGl0eSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnaGlkZGVuJyB8ICdhdXRvJyB8ICd2aXNpYmxlJz4oJ3NjbS5wcm92aWRlckNvdW50QmFkZ2UnKTtcblx0XHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlLXByb3ZpZGVyLWNvdW50cycsIHZhbHVlID09PSAnaGlkZGVuJyk7XG5cdFx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYXV0by1wcm92aWRlci1jb3VudHMnLCB2YWx1ZSA9PT0gJ2F1dG8nKTtcblx0XHR9O1xuXHRcdEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20ucHJvdmlkZXJDb3VudEJhZGdlJyksIHRoaXMuZGlzcG9zYWJsZXMpKHVwZGF0ZVByb3ZpZGVyQ291bnRWaXNpYmlsaXR5LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHR1cGRhdGVQcm92aWRlckNvdW50VmlzaWJpbGl0eSgpO1xuXG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5sb2FkVHJlZVZpZXdTdGF0ZSgpO1xuXHRcdHRoaXMuY3JlYXRlVHJlZSh0aGlzLnRyZWVDb250YWluZXIsIHZpZXdTdGF0ZSk7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkoYXN5bmMgdmlzaWJsZSA9PiB7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS5zZXRJbnB1dCh0aGlzLnNjbVZpZXdTZXJ2aWNlLCB2aWV3U3RhdGUpO1xuXG5cdFx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLFxuXHRcdFx0XHRcdFx0ZSA9PlxuXHRcdFx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uYWx3YXlzU2hvd1JlcG9zaXRvcmllcycpLFxuXHRcdFx0XHRcdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMpXG5cdFx0XHRcdFx0XHQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblx0XHRcdFx0XHRcdFx0dGhpcy51cGRhdGVDaGlsZHJlbigpO1xuXHRcdFx0XHRcdFx0fSwgdGhpcywgdGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLFxuXHRcdFx0XHRcdFx0ZSA9PlxuXHRcdFx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uaW5wdXRNaW5MaW5lQ291bnQnKSB8fFxuXHRcdFx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uaW5wdXRNYXhMaW5lQ291bnQnKSB8fFxuXHRcdFx0XHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzY20uc2hvd0FjdGlvbkJ1dHRvbicpLFxuXHRcdFx0XHRcdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMpXG5cdFx0XHRcdFx0XHQoKCkgPT4gdGhpcy51cGRhdGVDaGlsZHJlbigpLCB0aGlzLCB0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyk7XG5cblx0XHRcdFx0XHQvLyBBZGQgdmlzaWJsZSByZXBvc2l0b3JpZXNcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UodGhpcy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgdGhpcywgdGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRcdHRoaXMuc2NtVmlld1NlcnZpY2Uub25EaWRDaGFuZ2VWaXNpYmxlUmVwb3NpdG9yaWVzKHRoaXMub25EaWRDaGFuZ2VWaXNpYmxlUmVwb3NpdG9yaWVzLCB0aGlzLCB0aGlzLnZpc2liaWxpdHlEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMoeyBhZGRlZDogdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLCByZW1vdmVkOiBJdGVyYWJsZS5lbXB0eSgpIH0pO1xuXG5cdFx0XHRcdFx0Ly8gUmVzdG9yZSBzY3JvbGwgcG9zaXRpb25cblx0XHRcdFx0XHRpZiAodHlwZW9mIHRoaXMudHJlZVNjcm9sbFRvcCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdHRoaXMudHJlZS5zY3JvbGxUb3AgPSB0aGlzLnRyZWVTY3JvbGxUb3A7XG5cdFx0XHRcdFx0XHR0aGlzLnRyZWVTY3JvbGxUb3AgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy51cGRhdGVSZXBvc2l0b3J5Q29sbGFwc2VBbGxDb250ZXh0S2V5cygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudmlzaWJpbGl0eURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMub25EaWRDaGFuZ2VWaXNpYmxlUmVwb3NpdG9yaWVzKHsgYWRkZWQ6IEl0ZXJhYmxlLmVtcHR5KCksIHJlbW92ZWQ6IFsuLi50aGlzLml0ZW1zLmtleXMoKV0gfSk7XG5cdFx0XHRcdHRoaXMudHJlZVNjcm9sbFRvcCA9IHRoaXMudHJlZS5zY3JvbGxUb3A7XG5cblx0XHRcdFx0dGhpcy51cGRhdGVSZXBvc2l0b3J5Q29sbGFwc2VBbGxDb250ZXh0S2V5cygpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBvc2l0b3J5VmlzaWJpbGl0eUFjdGlvbkNvbnRyb2xsZXIpKTtcblxuXHRcdHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSh0aGlzLnVwZGF0ZUluZGVudFN0eWxlcywgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy51cGRhdGVJbmRlbnRTdHlsZXModGhpcy50aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVHJlZShjb250YWluZXI6IEhUTUxFbGVtZW50LCB2aWV3U3RhdGU/OiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUgPSAkKCcuc2NtLW92ZXJmbG93LXdpZGdldHMtY29udGFpbmVyLm1vbmFjby1lZGl0b3InKTtcblxuXHRcdHRoaXMuaW5wdXRSZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5wdXRSZW5kZXJlciwgdGhpcy5sYXlvdXRDYWNoZSwgb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSwgKGlucHV0LCBoZWlnaHQpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIEF0dGVtcHQgdG8gdXBkYXRlIHRoZSBpbnB1dCBlbGVtZW50IGhlaWdodC4gVGhlcmUgaXMgYW5cblx0XHRcdFx0Ly8gZWRnZSBjYXNlIHdoZXJlIHRoZSBpbnB1dCBoYXMgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkIGFuZFxuXHRcdFx0XHQvLyB1cGRhdGluZyB0aGUgaGVpZ2h0IHdvdWxkIGZhaWwuXG5cdFx0XHRcdHRoaXMudHJlZS51cGRhdGVFbGVtZW50SGVpZ2h0KGlucHV0LCBoZWlnaHQpO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2ggeyB9XG5cdFx0fSk7XG5cdFx0dGhpcy5hY3Rpb25CdXR0b25SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWN0aW9uQnV0dG9uUmVuZGVyZXIpO1xuXG5cdFx0dGhpcy5saXN0TGFiZWxzID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgeyBvbkRpZENoYW5nZVZpc2liaWxpdHk6IHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSB9KTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmxpc3RMYWJlbHMpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2VBY3Rpb25SdW5uZXIgPSBuZXcgUmVwb3NpdG9yeVBhbmVBY3Rpb25SdW5uZXIoKCkgPT4gdGhpcy5nZXRTZWxlY3RlZFJlc291cmNlcygpKTtcblx0XHRyZXNvdXJjZUFjdGlvblJ1bm5lci5vbldpbGxSdW4oKCkgPT4gdGhpcy50cmVlLmRvbUZvY3VzKCksIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHJlc291cmNlQWN0aW9uUnVubmVyKTtcblxuXHRcdGNvbnN0IHRyZWVEYXRhU291cmNlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTQ01UcmVlRGF0YVNvdXJjZSwgKCkgPT4gdGhpcy52aWV3TW9kZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodHJlZURhdGFTb3VyY2UpO1xuXG5cdFx0Y29uc3QgY29tcHJlc3Npb25FbmFibGVkID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKCdzY20uY29tcGFjdEZvbGRlcnMnLCB0cnVlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMudHJlZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlLFxuXHRcdFx0J1NDTSBUcmVlIFJlcG8nLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IExpc3REZWxlZ2F0ZSh0aGlzLmlucHV0UmVuZGVyZXIpLFxuXHRcdFx0bmV3IFNDTVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdHRoaXMuaW5wdXRSZW5kZXJlcixcblx0XHRcdFx0dGhpcy5hY3Rpb25CdXR0b25SZW5kZXJlcixcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXBvc2l0b3J5UmVuZGVyZXIsIE1lbnVJZC5TQ01UaXRsZSwgZ2V0QWN0aW9uVmlld0l0ZW1Qcm92aWRlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VHcm91cFJlbmRlcmVyLCBnZXRBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpLCByZXNvdXJjZUFjdGlvblJ1bm5lciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VSZW5kZXJlciwgKCkgPT4gdGhpcy52aWV3TW9kZSwgdGhpcy5saXN0TGFiZWxzLCBnZXRBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpLCByZXNvdXJjZUFjdGlvblJ1bm5lcilcblx0XHRcdF0sXG5cdFx0XHR0cmVlRGF0YVNvdXJjZSxcblx0XHRcdHtcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHR0cmFuc2Zvcm1PcHRpbWl6YXRpb246IGZhbHNlLFxuXHRcdFx0XHRmaWx0ZXI6IG5ldyBTQ01UcmVlRmlsdGVyKCksXG5cdFx0XHRcdGRuZDogbmV3IFNDTVRyZWVEcmFnQW5kRHJvcCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogbmV3IFNDTVJlc291cmNlSWRlbnRpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRzb3J0ZXI6IG5ldyBTQ01UcmVlU29ydGVyKCgpID0+IHRoaXMudmlld01vZGUsICgpID0+IHRoaXMudmlld1NvcnRLZXkpLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTVRyZWVLZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLCAoKSA9PiB0aGlzLnZpZXdNb2RlKSxcblx0XHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHRoaXMuZ2V0TG9jYXRpb25CYXNlZENvbG9ycygpLmxpc3RPdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0Y29tcHJlc3Npb25FbmFibGVkOiBjb21wcmVzc2lvbkVuYWJsZWQuZ2V0KCksXG5cdFx0XHRcdGNvbGxhcHNlQnlEZWZhdWx0OiAoZTogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRcdC8vIFJlcG9zaXRvcnksIFJlc291cmNlIEdyb3VwLCBSZXNvdXJjZSBGb2xkZXIgKFRyZWUpIGFyZSBub3QgY29sbGFwc2VkIGJ5IGRlZmF1bHRcblx0XHRcdFx0XHRyZXR1cm4gIShpc1NDTVJlcG9zaXRvcnkoZSkgfHwgaXNTQ01SZXNvdXJjZUdyb3VwKGUpIHx8IGlzU0NNUmVzb3VyY2VOb2RlKGUpKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNDTUFjY2Vzc2liaWxpdHlQcm92aWRlciksXG5cdFx0XHRcdHR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3M6IChlOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzU0NNQWN0aW9uQnV0dG9uKGUpIHx8IGlzU0NNSW5wdXQoZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiAnZm9yY2Utbm8tdHdpc3RpZSc7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fSxcblx0XHRcdH0pIGFzIFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8SVNDTVZpZXdTZXJ2aWNlLCBUcmVlRWxlbWVudCwgRnV6enlTY29yZT47XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnRyZWUpO1xuXG5cdFx0dGhpcy50cmVlLm9uRGlkT3Blbih0aGlzLm9wZW4sIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMudHJlZS5vbkNvbnRleHRNZW51KHRoaXMub25MaXN0Q29udGV4dE1lbnUsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMudHJlZS5vbkRpZFNjcm9sbCh0aGlzLmlucHV0UmVuZGVyZXIuY2xlYXJWYWxpZGF0aW9uLCB0aGlzLmlucHV0UmVuZGVyZXIsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdEV2ZW50LmZpbHRlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlLCBlID0+IGlzU0NNUmVwb3NpdG9yeShlLm5vZGUuZWxlbWVudD8uZWxlbWVudCksIHRoaXMuZGlzcG9zYWJsZXMpKHRoaXMudXBkYXRlUmVwb3NpdG9yeUNvbGxhcHNlQWxsQ29udGV4dEtleXMsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy50cmVlLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRjb21wcmVzc2lvbkVuYWJsZWQ6IGNvbXByZXNzaW9uRW5hYmxlZC5yZWFkKHJlYWRlcilcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGFwcGVuZChjb250YWluZXIsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuKGU6IElPcGVuRXZlbnQ8VHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFlLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVwb3NpdG9yeShlLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKGUuZWxlbWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTUlucHV0KGUuZWxlbWVudCkpIHtcblx0XHRcdHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXMoZS5lbGVtZW50LnJlcG9zaXRvcnkpO1xuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmlucHV0UmVuZGVyZXIuZ2V0UmVuZGVyZWRJbnB1dFdpZGdldChlLmVsZW1lbnQpO1xuXG5cdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdHdpZGdldC5mb2N1cygpO1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10sIGUuYnJvd3NlckV2ZW50KTtcblxuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cblx0XHRcdFx0aWYgKHNlbGVjdGlvbi5sZW5ndGggPT09IDEgJiYgc2VsZWN0aW9uWzBdID09PSBlLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW10pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihlLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKGUuZWxlbWVudC5yZXBvc2l0b3J5KTtcblxuXHRcdFx0Ly8gRm9jdXMgdGhlIGFjdGlvbiBidXR0b25cblx0XHRcdHRoaXMuYWN0aW9uQnV0dG9uUmVuZGVyZXIuZm9jdXNBY3Rpb25CdXR0b24oZS5lbGVtZW50KTtcblx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSwgZS5icm93c2VyRXZlbnQpO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlR3JvdXAoZS5lbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlLmVsZW1lbnQucHJvdmlkZXI7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5ID0gSXRlcmFibGUuZmluZCh0aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzLCByID0+IHIucHJvdmlkZXIgPT09IHByb3ZpZGVyKTtcblx0XHRcdGlmIChyZXBvc2l0b3J5KSB7XG5cdFx0XHRcdHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXMocmVwb3NpdG9yeSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlKGUuZWxlbWVudCkpIHtcblx0XHRcdGlmIChlLmVsZW1lbnQuY29tbWFuZD8uaWQgPT09IEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lEIHx8IGUuZWxlbWVudC5jb21tYW5kPy5pZCA9PT0gQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCkge1xuXHRcdFx0XHRpZiAoaXNQb2ludGVyRXZlbnQoZS5icm93c2VyRXZlbnQpICYmIGUuYnJvd3NlckV2ZW50LmJ1dHRvbiA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlR3JvdXAgPSBlLmVsZW1lbnQucmVzb3VyY2VHcm91cDtcblx0XHRcdFx0XHRjb25zdCB0aXRsZSA9IGAke3Jlc291cmNlR3JvdXAucHJvdmlkZXIubGFiZWx9OiAke3Jlc291cmNlR3JvdXAubGFiZWx9YDtcblx0XHRcdFx0XHRhd2FpdCBPcGVuU2NtR3JvdXBBY3Rpb24ub3Blbk11bHRpRmlsZURpZmZFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLCB0aXRsZSwgcmVzb3VyY2VHcm91cC5wcm92aWRlci5yb290VXJpLCByZXNvdXJjZUdyb3VwLmlkLCB7XG5cdFx0XHRcdFx0XHQuLi5lLmVkaXRvck9wdGlvbnMsXG5cdFx0XHRcdFx0XHR2aWV3U3RhdGU6IHtcblx0XHRcdFx0XHRcdFx0cmV2ZWFsRGF0YToge1xuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogZS5lbGVtZW50Lm11bHRpRGlmZkVkaXRvck9yaWdpbmFsVXJpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bW9kaWZpZWQ6IGUuZWxlbWVudC5tdWx0aURpZmZFZGl0b3JNb2RpZmllZFVyaSxcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiB0cnVlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZS5lbGVtZW50LmNvbW1hbmQuaWQsIC4uLihlLmVsZW1lbnQuY29tbWFuZC5hcmd1bWVudHMgfHwgW10pLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgZS5lbGVtZW50Lm9wZW4oISFlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cyk7XG5cblx0XHRcdFx0aWYgKGUuZWRpdG9yT3B0aW9ucy5waW5uZWQpIHtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cblx0XHRcdFx0XHRhY3RpdmVFZGl0b3JQYW5lPy5ncm91cC5waW5FZGl0b3IoYWN0aXZlRWRpdG9yUGFuZS5pbnB1dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlLmVsZW1lbnQucmVzb3VyY2VHcm91cC5wcm92aWRlcjtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBJdGVyYWJsZS5maW5kKHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMsIHIgPT4gci5wcm92aWRlciA9PT0gcHJvdmlkZXIpO1xuXG5cdFx0XHRpZiAocmVwb3NpdG9yeSkge1xuXHRcdFx0XHR0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzKHJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZU5vZGUoZS5lbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBlLmVsZW1lbnQuY29udGV4dC5wcm92aWRlcjtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBJdGVyYWJsZS5maW5kKHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMsIHIgPT4gci5wcm92aWRlciA9PT0gcHJvdmlkZXIpO1xuXHRcdFx0aWYgKHJlcG9zaXRvcnkpIHtcblx0XHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS5mb2N1cyhyZXBvc2l0b3J5KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignc2NtLmF1dG9SZXZlYWwnKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVyaSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEbyBub3Qgc2V0IGZvY3VzL3NlbGVjdGlvbiB3aGVuIHRoZSByZXNvdXJjZSBpcyBhbHJlYWR5IGZvY3VzZWQgYW5kIHNlbGVjdGVkXG5cdFx0aWYgKHRoaXMudHJlZS5nZXRGb2N1cygpLnNvbWUoZSA9PiBpc1NDTVJlc291cmNlKGUpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUuc291cmNlVXJpLCB1cmkpKSAmJlxuXHRcdFx0dGhpcy50cmVlLmdldFNlbGVjdGlvbigpLnNvbWUoZSA9PiBpc1NDTVJlc291cmNlKGUpICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGUuc291cmNlVXJpLCB1cmkpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMucmV2ZWFsUmVzb3VyY2VUaHJvdHRsZXIucXVldWUoXG5cdFx0XHQoKSA9PiB0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoXG5cdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5pdGVtcy5nZXQocmVwb3NpdG9yeSk7XG5cblx0XHRcdFx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gZ28gYmFja3dhcmRzIGZyb20gbGFzdCBncm91cFxuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaiA9IHJlcG9zaXRvcnkucHJvdmlkZXIuZ3JvdXBzLmxlbmd0aCAtIDE7IGogPj0gMDsgai0tKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGdyb3VwSXRlbSA9IHJlcG9zaXRvcnkucHJvdmlkZXIuZ3JvdXBzW2pdO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMudmlld01vZGUgPT09IFZpZXdNb2RlLlRyZWVcblx0XHRcdFx0XHRcdFx0XHQ/IGdyb3VwSXRlbS5yZXNvdXJjZVRyZWUuZ2V0Tm9kZSh1cmkpPy5lbGVtZW50XG5cdFx0XHRcdFx0XHRcdFx0OiBncm91cEl0ZW0ucmVzb3VyY2VzLmZpbmQociA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChyLnNvdXJjZVVyaSwgdXJpKSk7XG5cblx0XHRcdFx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZFRvKHJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRyZWUucmV2ZWFsKHJlc291cmNlKTtcblxuXHRcdFx0XHRcdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW3Jlc291cmNlXSk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtyZXNvdXJjZV0pO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVZpc2libGVSZXBvc2l0b3JpZXMoeyBhZGRlZCwgcmVtb3ZlZCB9OiBJU0NNVmlld1Zpc2libGVSZXBvc2l0b3J5Q2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBBZGRlZCByZXBvc2l0b3JpZXNcblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgYWRkZWQpIHtcblx0XHRcdGNvbnN0IHJlcG9zaXRvcnlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0cmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdC8qKiBAZGVzY3JpcHRpb24gYWN0aW9uIGJ1dHRvbiAqL1xuXHRcdFx0XHRyZXBvc2l0b3J5LnByb3ZpZGVyLmFjdGlvbkJ1dHRvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2hpbGRyZW4ocmVwb3NpdG9yeSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQocmVwb3NpdG9yeS5pbnB1dC5vbkRpZENoYW5nZVZpc2liaWxpdHkoKCkgPT4gdGhpcy51cGRhdGVDaGlsZHJlbihyZXBvc2l0b3J5KSkpO1xuXHRcdFx0cmVwb3NpdG9yeURpc3Bvc2FibGVzLmFkZChyZXBvc2l0b3J5LnByb3ZpZGVyLm9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMoKCkgPT4gdGhpcy51cGRhdGVDaGlsZHJlbihyZXBvc2l0b3J5KSkpO1xuXG5cdFx0XHRjb25zdCByZXNvdXJjZUdyb3VwRGlzcG9zYWJsZXMgPSByZXBvc2l0b3J5RGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlTWFwPElTQ01SZXNvdXJjZUdyb3VwLCBJRGlzcG9zYWJsZT4oKSk7XG5cblx0XHRcdGNvbnN0IG9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMgPSAoKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgW3Jlc291cmNlR3JvdXBdIG9mIHJlc291cmNlR3JvdXBEaXNwb3NhYmxlcykge1xuXHRcdFx0XHRcdGlmICghcmVwb3NpdG9yeS5wcm92aWRlci5ncm91cHMuaW5jbHVkZXMocmVzb3VyY2VHcm91cCkpIHtcblx0XHRcdFx0XHRcdHJlc291cmNlR3JvdXBEaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHJlc291cmNlR3JvdXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgcmVzb3VyY2VHcm91cCBvZiByZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcykge1xuXHRcdFx0XHRcdGlmICghcmVzb3VyY2VHcm91cERpc3Bvc2FibGVzLmhhcyhyZXNvdXJjZUdyb3VwKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHJlc291cmNlR3JvdXAub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVDaGlsZHJlbihyZXBvc2l0b3J5KSkpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChyZXNvdXJjZUdyb3VwLm9uRGlkQ2hhbmdlUmVzb3VyY2VzKCgpID0+IHRoaXMudXBkYXRlQ2hpbGRyZW4ocmVwb3NpdG9yeSkpKTtcblx0XHRcdFx0XHRcdHJlc291cmNlR3JvdXBEaXNwb3NhYmxlcy5zZXQocmVzb3VyY2VHcm91cCwgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHJlcG9zaXRvcnlEaXNwb3NhYmxlcy5hZGQocmVwb3NpdG9yeS5wcm92aWRlci5vbkRpZENoYW5nZVJlc291cmNlR3JvdXBzKG9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMpKTtcblx0XHRcdG9uRGlkQ2hhbmdlUmVzb3VyY2VHcm91cHMoKTtcblxuXHRcdFx0dGhpcy5pdGVtcy5zZXQocmVwb3NpdG9yeSwgcmVwb3NpdG9yeURpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmVkIHJlcG9zaXRvcmllc1xuXHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiByZW1vdmVkKSB7XG5cdFx0XHR0aGlzLml0ZW1zLmRlbGV0ZUFuZERpc3Bvc2UocmVwb3NpdG9yeSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlbigpO1xuXHRcdHRoaXMub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgb25MaXN0Q29udGV4dE1lbnUoZTogSVRyZWVDb250ZXh0TWVudUV2ZW50PFRyZWVFbGVtZW50IHwgbnVsbD4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudXMuVmlld1NvcnQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cblx0XHRcdHJldHVybiB0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IHsgfVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblx0XHRsZXQgY29udGV4dDogdW5rbm93biA9IGVsZW1lbnQ7XG5cdFx0bGV0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lciA9IG5ldyBSZXBvc2l0b3J5UGFuZUFjdGlvblJ1bm5lcigoKSA9PiB0aGlzLmdldFNlbGVjdGVkUmVzb3VyY2VzKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhY3Rpb25SdW5uZXIpO1xuXG5cdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgbWVudXMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLm1lbnVzLmdldFJlcG9zaXRvcnlNZW51cyhlbGVtZW50LnByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IG1lbnUgPSBtZW51cy5nZXRSZXBvc2l0b3J5Q29udGV4dE1lbnUoZWxlbWVudCk7XG5cdFx0XHRjb250ZXh0ID0gZWxlbWVudC5wcm92aWRlcjtcblx0XHRcdGFjdGlvblJ1bm5lciA9IG5ldyBSZXBvc2l0b3J5QWN0aW9uUnVubmVyKCgpID0+IHRoaXMuZ2V0U2VsZWN0ZWRSZXBvc2l0b3JpZXMoKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWN0aW9uUnVubmVyKTtcblx0XHRcdGFjdGlvbnMgPSBjb2xsZWN0Q29udGV4dE1lbnVBY3Rpb25zKG1lbnUpO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01JbnB1dChlbGVtZW50KSB8fCBpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdFx0Ly8gbm9vcFxuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZUdyb3VwKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKGVsZW1lbnQucHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldFJlc291cmNlR3JvdXBNZW51KGVsZW1lbnQpO1xuXHRcdFx0YWN0aW9ucyA9IGNvbGxlY3RDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKGVsZW1lbnQucmVzb3VyY2VHcm91cC5wcm92aWRlcik7XG5cdFx0XHRjb25zdCBtZW51ID0gbWVudXMuZ2V0UmVzb3VyY2VNZW51KGVsZW1lbnQpO1xuXHRcdFx0YWN0aW9ucyA9IGNvbGxlY3RDb250ZXh0TWVudUFjdGlvbnMobWVudSk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0aWYgKGVsZW1lbnQuZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBtZW51cyA9IHRoaXMuc2NtVmlld1NlcnZpY2UubWVudXMuZ2V0UmVwb3NpdG9yeU1lbnVzKGVsZW1lbnQuZWxlbWVudC5yZXNvdXJjZUdyb3VwLnByb3ZpZGVyKTtcblx0XHRcdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldFJlc291cmNlTWVudShlbGVtZW50LmVsZW1lbnQpO1xuXHRcdFx0XHRhY3Rpb25zID0gY29sbGVjdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1lbnVzID0gdGhpcy5zY21WaWV3U2VydmljZS5tZW51cy5nZXRSZXBvc2l0b3J5TWVudXMoZWxlbWVudC5jb250ZXh0LnByb3ZpZGVyKTtcblx0XHRcdFx0Y29uc3QgbWVudSA9IG1lbnVzLmdldFJlc291cmNlRm9sZGVyTWVudShlbGVtZW50LmNvbnRleHQpO1xuXHRcdFx0XHRhY3Rpb25zID0gY29sbGVjdENvbnRleHRNZW51QWN0aW9ucyhtZW51KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoYWN0aW9uUnVubmVyLm9uV2lsbFJ1bigoKSA9PiB0aGlzLnRyZWUuZG9tRm9jdXMoKSkpO1xuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGFjdGlvblJ1bm5lcixcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IGNvbnRleHQsXG5cdFx0XHRvbkhpZGU6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3RlZFJlcG9zaXRvcmllcygpOiBJU0NNUmVwb3NpdG9yeVtdIHtcblx0XHRjb25zdCBmb2N1c2VkUmVwb3NpdG9yaWVzID0gdGhpcy50cmVlLmdldEZvY3VzKCkuZmlsdGVyKHIgPT4gISFyICYmIGlzU0NNUmVwb3NpdG9yeShyKSkhIGFzIElTQ01SZXBvc2l0b3J5W107XG5cdFx0Y29uc3Qgc2VsZWN0ZWRSZXBvc2l0b3JpZXMgPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCkuZmlsdGVyKHIgPT4gISFyICYmIGlzU0NNUmVwb3NpdG9yeShyKSkhIGFzIElTQ01SZXBvc2l0b3J5W107XG5cblx0XHRyZXR1cm4gQXJyYXkuZnJvbShuZXcgU2V0PElTQ01SZXBvc2l0b3J5PihbLi4uZm9jdXNlZFJlcG9zaXRvcmllcywgLi4uc2VsZWN0ZWRSZXBvc2l0b3JpZXNdKSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFNlbGVjdGVkUmVzb3VyY2VzKCk6IChJU0NNUmVzb3VyY2VHcm91cCB8IElTQ01SZXNvdXJjZSB8IElSZXNvdXJjZU5vZGU8SVNDTVJlc291cmNlLCBJU0NNUmVzb3VyY2VHcm91cD4pW10ge1xuXHRcdHJldHVybiB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCkuZmlsdGVyKHIgPT4gaXNTQ01SZXNvdXJjZUdyb3VwKHIpIHx8IGlzU0NNUmVzb3VyY2UocikgfHwgaXNTQ01SZXNvdXJjZU5vZGUocikpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3TW9kZSgpOiBWaWV3TW9kZSB7XG5cdFx0bGV0IG1vZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCd0cmVlJyB8ICdsaXN0Jz4oJ3NjbS5kZWZhdWx0Vmlld01vZGUnKSA9PT0gJ2xpc3QnID8gVmlld01vZGUuTGlzdCA6IFZpZXdNb2RlLlRyZWU7XG5cdFx0Y29uc3Qgc3RvcmFnZU1vZGUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChgc2NtLnZpZXdNb2RlYCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgYXMgVmlld01vZGU7XG5cdFx0aWYgKHR5cGVvZiBzdG9yYWdlTW9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG1vZGUgPSBzdG9yYWdlTW9kZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld1NvcnRLZXkoKTogVmlld1NvcnRLZXkge1xuXHRcdC8vIFRyZWVcblx0XHRpZiAodGhpcy5fdmlld01vZGUgPT09IFZpZXdNb2RlLlRyZWUpIHtcblx0XHRcdHJldHVybiBWaWV3U29ydEtleS5QYXRoO1xuXHRcdH1cblxuXHRcdC8vIExpc3Rcblx0XHRsZXQgdmlld1NvcnRLZXk6IFZpZXdTb3J0S2V5O1xuXHRcdGNvbnN0IHZpZXdTb3J0S2V5U3RyaW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwncGF0aCcgfCAnbmFtZScgfCAnc3RhdHVzJz4oJ3NjbS5kZWZhdWx0Vmlld1NvcnRLZXknKTtcblx0XHRzd2l0Y2ggKHZpZXdTb3J0S2V5U3RyaW5nKSB7XG5cdFx0XHRjYXNlICduYW1lJzpcblx0XHRcdFx0dmlld1NvcnRLZXkgPSBWaWV3U29ydEtleS5OYW1lO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3N0YXR1cyc6XG5cdFx0XHRcdHZpZXdTb3J0S2V5ID0gVmlld1NvcnRLZXkuU3RhdHVzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHZpZXdTb3J0S2V5ID0gVmlld1NvcnRLZXkuUGF0aDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RvcmFnZVNvcnRLZXkgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChgc2NtLnZpZXdTb3J0S2V5YCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSkgYXMgVmlld1NvcnRLZXk7XG5cdFx0aWYgKHR5cGVvZiBzdG9yYWdlU29ydEtleSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHZpZXdTb3J0S2V5ID0gc3RvcmFnZVNvcnRLZXk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZpZXdTb3J0S2V5O1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkVHJlZVZpZXdTdGF0ZSgpOiBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3RvcmFnZVZpZXdTdGF0ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KCdzY20udmlld1N0YXRlMicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmICghc3RvcmFnZVZpZXdTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdHJlZVZpZXdTdGF0ZSA9IEpTT04ucGFyc2Uoc3RvcmFnZVZpZXdTdGF0ZSk7XG5cdFx0XHRyZXR1cm4gdHJlZVZpZXdTdGF0ZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdG9yZVRyZWVWaWV3U3RhdGUoKSB7XG5cdFx0aWYgKHRoaXMudHJlZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSgnc2NtLnZpZXdTdGF0ZTInLCBKU09OLnN0cmluZ2lmeSh0aGlzLnRyZWUuZ2V0Vmlld1N0YXRlKCkpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2hpbGRyZW4oZWxlbWVudD86IElTQ01SZXBvc2l0b3J5KSB7XG5cdFx0dGhpcy51cGRhdGVDaGlsZHJlblRocm90dGxlci5xdWV1ZShcblx0XHRcdCgpID0+IHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZShcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZvY3VzZWRJbnB1dCA9IHRoaXMuaW5wdXRSZW5kZXJlci5nZXRGb2N1c2VkSW5wdXQoKTtcblxuXHRcdFx0XHRcdGlmIChlbGVtZW50ICYmIHRoaXMudHJlZS5oYXNOb2RlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHQvLyBSZWZyZXNoIHNwZWNpZmljIHJlcG9zaXRvcnlcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbihlbGVtZW50KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Ly8gUmVmcmVzaCB0aGUgZW50aXJlIHRyZWVcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMudHJlZS51cGRhdGVDaGlsZHJlbih1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChmb2N1c2VkSW5wdXQpIHtcblx0XHRcdFx0XHRcdHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KGZvY3VzZWRJbnB1dCk/LmZvY3VzKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTY21Qcm92aWRlckNvbnRleHRLZXlzKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVSZXBvc2l0b3J5Q29sbGFwc2VBbGxDb250ZXh0S2V5cygpO1xuXHRcdFx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUluZGVudFN0eWxlcyh0aGVtZTogSUZpbGVJY29uVGhlbWUpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbGlzdC12aWV3LW1vZGUnLCB0aGlzLnZpZXdNb2RlID09PSBWaWV3TW9kZS5MaXN0KTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndHJlZS12aWV3LW1vZGUnLCB0aGlzLnZpZXdNb2RlID09PSBWaWV3TW9kZS5UcmVlKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWxpZ24taWNvbnMtYW5kLXR3aXN0aWVzJywgKHRoaXMudmlld01vZGUgPT09IFZpZXdNb2RlLkxpc3QgJiYgdGhlbWUuaGFzRmlsZUljb25zKSB8fCAodGhlbWUuaGFzRmlsZUljb25zICYmICF0aGVtZS5oYXNGb2xkZXJJY29ucykpO1xuXHRcdHRoaXMudHJlZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlLWFycm93cycsIHRoaXMudmlld01vZGUgPT09IFZpZXdNb2RlLlRyZWUgJiYgdGhlbWUuaGlkZXNFeHBsb3JlckFycm93cyA9PT0gdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNjbVByb3ZpZGVyQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWx3YXlzU2hvd1JlcG9zaXRvcmllcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ3NjbS5hbHdheXNTaG93UmVwb3NpdG9yaWVzJyk7XG5cblx0XHRpZiAoIWFsd2F5c1Nob3dSZXBvc2l0b3JpZXMgJiYgdGhpcy5pdGVtcy5zaXplID09PSAxKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IEl0ZXJhYmxlLmZpcnN0KHRoaXMuaXRlbXMua2V5cygpKSEucHJvdmlkZXI7XG5cdFx0XHR0aGlzLnNjbVByb3ZpZGVyQ29udGV4dEtleS5zZXQocHJvdmlkZXIucHJvdmlkZXJJZCk7XG5cdFx0XHR0aGlzLnNjbVByb3ZpZGVyUm9vdFVyaUNvbnRleHRLZXkuc2V0KHByb3ZpZGVyLnJvb3RVcmk/LnRvU3RyaW5nKCkpO1xuXHRcdFx0dGhpcy5zY21Qcm92aWRlckhhc1Jvb3RVcmlDb250ZXh0S2V5LnNldCghIXByb3ZpZGVyLnJvb3RVcmkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNjbVByb3ZpZGVyQ29udGV4dEtleS5zZXQodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuc2NtUHJvdmlkZXJSb290VXJpQ29udGV4dEtleS5zZXQodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuc2NtUHJvdmlkZXJIYXNSb290VXJpQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVwb3NpdG9yeUNvbGxhcHNlQWxsQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzQm9keVZpc2libGUoKSB8fCB0aGlzLml0ZW1zLnNpemUgPT09IDEpIHtcblx0XHRcdHRoaXMuaXNBbnlSZXBvc2l0b3J5Q29sbGFwc2libGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLmFyZUFsbFJlcG9zaXRvcmllc0NvbGxhcHNlZENvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmlzQW55UmVwb3NpdG9yeUNvbGxhcHNpYmxlQ29udGV4dEtleS5zZXQodGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLnNvbWUociA9PiB0aGlzLnRyZWUuaGFzTm9kZShyKSAmJiB0aGlzLnRyZWUuaXNDb2xsYXBzaWJsZShyKSkpO1xuXHRcdHRoaXMuYXJlQWxsUmVwb3NpdG9yaWVzQ29sbGFwc2VkQ29udGV4dEtleS5zZXQodGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmV2ZXJ5KHIgPT4gdGhpcy50cmVlLmhhc05vZGUocikgJiYgKCF0aGlzLnRyZWUuaXNDb2xsYXBzaWJsZShyKSB8fCB0aGlzLnRyZWUuaXNDb2xsYXBzZWQocikpKSk7XG5cdH1cblxuXHRjb2xsYXBzZUFsbFJlcG9zaXRvcmllcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmlzQ29sbGFwc2libGUocmVwb3NpdG9yeSkpIHtcblx0XHRcdFx0dGhpcy50cmVlLmNvbGxhcHNlKHJlcG9zaXRvcnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGV4cGFuZEFsbFJlcG9zaXRvcmllcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmlzQ29sbGFwc2libGUocmVwb3NpdG9yeSkpIHtcblx0XHRcdFx0dGhpcy50cmVlLmV4cGFuZChyZXBvc2l0b3J5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjb2xsYXBzZUFsbFJlc291cmNlcyhncm91cDogSVNDTVJlc291cmNlR3JvdXApOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHsgZWxlbWVudCB9IG9mIHRoaXMudHJlZS5nZXROb2RlKGdyb3VwKS5jaGlsZHJlbikge1xuXHRcdFx0aWYgKCFpc1NDTVZpZXdTZXJ2aWNlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5jb2xsYXBzZShlbGVtZW50LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzSW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuZm9jdXNJbnB1dCgtMSkpO1xuXHR9XG5cblx0Zm9jdXNOZXh0SW5wdXQoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlT3BlcmF0aW9uU2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuZm9jdXNJbnB1dCgxKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZvY3VzSW5wdXQoZGVsdGE6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5zY21WaWV3U2VydmljZS5mb2N1c2VkUmVwb3NpdG9yeSB8fFxuXHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBpbnB1dCA9IHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXNlZFJlcG9zaXRvcnkuaW5wdXQ7XG5cdFx0Y29uc3QgcmVwb3NpdG9yaWVzID0gdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzO1xuXG5cdFx0Ly8gT25lIHZpc2libGUgcmVwb3NpdG9yeSBhbmQgdGhlIGlucHV0IGlzIGFscmVhZHkgZm9jdXNlZFxuXHRcdGlmIChyZXBvc2l0b3JpZXMubGVuZ3RoID09PSAxICYmIHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KGlucHV0KT8uaGFzRm9jdXMoKSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE11bHRpcGxlIHZpc2libGUgcmVwb3NpdG9yaWVzIGFuZCB0aGUgaW5wdXQgYWxyZWFkeSBmb2N1c2VkXG5cdFx0aWYgKHJlcG9zaXRvcmllcy5sZW5ndGggPiAxICYmIHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KGlucHV0KT8uaGFzRm9jdXMoKSA9PT0gdHJ1ZSkge1xuXHRcdFx0Y29uc3QgZm9jdXNlZFJlcG9zaXRvcnlJbmRleCA9IHJlcG9zaXRvcmllcy5pbmRleE9mKHRoaXMuc2NtVmlld1NlcnZpY2UuZm9jdXNlZFJlcG9zaXRvcnkpO1xuXHRcdFx0Y29uc3QgbmV3Rm9jdXNlZFJlcG9zaXRvcnlJbmRleCA9IHJvdChmb2N1c2VkUmVwb3NpdG9yeUluZGV4ICsgZGVsdGEsIHJlcG9zaXRvcmllcy5sZW5ndGgpO1xuXHRcdFx0aW5wdXQgPSByZXBvc2l0b3JpZXNbbmV3Rm9jdXNlZFJlcG9zaXRvcnlJbmRleF0uaW5wdXQ7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZFRvKGlucHV0KTtcblxuXHRcdHRoaXMudHJlZS5yZXZlYWwoaW5wdXQpO1xuXHRcdHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KGlucHV0KT8uZm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzUHJldmlvdXNSZXNvdXJjZUdyb3VwKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZU9wZXJhdGlvblNlcXVlbmNlci5xdWV1ZSgoKSA9PiB0aGlzLmZvY3VzUmVzb3VyY2VHcm91cCgtMSkpO1xuXHR9XG5cblx0Zm9jdXNOZXh0UmVzb3VyY2VHcm91cCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoKCkgPT4gdGhpcy5mb2N1c1Jlc291cmNlR3JvdXAoMSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBmb2N1c1Jlc291cmNlR3JvdXAoZGVsdGE6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5zY21WaWV3U2VydmljZS5mb2N1c2VkUmVwb3NpdG9yeSB8fFxuXHRcdFx0dGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyZWVIYXNEb21Gb2N1cyA9IGlzQWN0aXZlRWxlbWVudCh0aGlzLnRyZWUuZ2V0SFRNTEVsZW1lbnQoKSk7XG5cdFx0Y29uc3QgcmVzb3VyY2VHcm91cHMgPSB0aGlzLnNjbVZpZXdTZXJ2aWNlLmZvY3VzZWRSZXBvc2l0b3J5LnByb3ZpZGVyLmdyb3Vwcztcblx0XHRjb25zdCBmb2N1c2VkUmVzb3VyY2VHcm91cCA9IHRoaXMudHJlZS5nZXRGb2N1cygpLmZpbmQoZSA9PiBpc1NDTVJlc291cmNlR3JvdXAoZSkpO1xuXHRcdGNvbnN0IGZvY3VzZWRSZXNvdXJjZUdyb3VwSW5kZXggPSB0cmVlSGFzRG9tRm9jdXMgJiYgZm9jdXNlZFJlc291cmNlR3JvdXAgPyByZXNvdXJjZUdyb3Vwcy5pbmRleE9mKGZvY3VzZWRSZXNvdXJjZUdyb3VwKSA6IC0xO1xuXG5cdFx0bGV0IHJlc291cmNlR3JvdXBOZXh0OiBJU0NNUmVzb3VyY2VHcm91cCB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChmb2N1c2VkUmVzb3VyY2VHcm91cEluZGV4ID09PSAtMSkge1xuXHRcdFx0Ly8gRmlyc3QgdmlzaWJsZSByZXNvdXJjZSBncm91cFxuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZUdyb3VwIG9mIHJlc291cmNlR3JvdXBzKSB7XG5cdFx0XHRcdGlmICh0aGlzLnRyZWUuaGFzTm9kZShyZXNvdXJjZUdyb3VwKSkge1xuXHRcdFx0XHRcdHJlc291cmNlR3JvdXBOZXh0ID0gcmVzb3VyY2VHcm91cDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBOZXh0L1ByZXZpb3VzIHZpc2libGUgcmVzb3VyY2UgZ3JvdXBcblx0XHRcdGxldCBpbmRleCA9IHJvdChmb2N1c2VkUmVzb3VyY2VHcm91cEluZGV4ICsgZGVsdGEsIHJlc291cmNlR3JvdXBzLmxlbmd0aCk7XG5cdFx0XHR3aGlsZSAoaW5kZXggIT09IGZvY3VzZWRSZXNvdXJjZUdyb3VwSW5kZXgpIHtcblx0XHRcdFx0aWYgKHRoaXMudHJlZS5oYXNOb2RlKHJlc291cmNlR3JvdXBzW2luZGV4XSkpIHtcblx0XHRcdFx0XHRyZXNvdXJjZUdyb3VwTmV4dCA9IHJlc291cmNlR3JvdXBzW2luZGV4XTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRpbmRleCA9IHJvdChpbmRleCArIGRlbHRhLCByZXNvdXJjZUdyb3Vwcy5sZW5ndGgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXNvdXJjZUdyb3VwTmV4dCkge1xuXHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZFRvKHJlc291cmNlR3JvdXBOZXh0KTtcblx0XHRcdHRoaXMudHJlZS5yZXZlYWwocmVzb3VyY2VHcm91cE5leHQpO1xuXG5cdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKFtyZXNvdXJjZUdyb3VwTmV4dF0pO1xuXHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtyZXNvdXJjZUdyb3VwTmV4dF0pO1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdWxkU2hvd1dlbGNvbWUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3J5Q291bnQgPT09IDA7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRBY3Rpb25zQ29udGV4dCgpOiB1bmtub3duIHtcblx0XHRyZXR1cm4gdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMSA/IHRoaXMuc2NtVmlld1NlcnZpY2UudmlzaWJsZVJlcG9zaXRvcmllc1swXS5wcm92aWRlciA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHR0aGlzLnRyZWVPcGVyYXRpb25TZXF1ZW5jZXIucXVldWUoKCkgPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdFx0XHRpZiAodGhpcy50cmVlLmdldEZvY3VzKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHJlcG9zaXRvcnkgb2YgdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuaW5wdXRSZW5kZXJlci5nZXRSZW5kZXJlZElucHV0V2lkZ2V0KHJlcG9zaXRvcnkuaW5wdXQpO1xuXG5cdFx0XHRcdFx0XHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdFx0XHRcdFx0XHR3aWRnZXQuZm9jdXMoKTtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3TW9kZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3U29ydEtleS5kaXNwb3NlKCk7XG5cdFx0dGhpcy52aXNpYmlsaXR5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuaXRlbXMuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBTQ01UcmVlRGF0YVNvdXJjZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPElTQ01WaWV3U2VydmljZSwgVHJlZUVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3TW9kZTogKCkgPT4gVmlld01vZGUsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElTQ01WaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVZpZXdTZXJ2aWNlOiBJU0NNVmlld1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGdldENoaWxkcmVuKGlucHV0T3JFbGVtZW50OiBJU0NNVmlld1NlcnZpY2UgfCBUcmVlRWxlbWVudCk6IFByb21pc2U8SXRlcmFibGU8VHJlZUVsZW1lbnQ+PiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeUNvdW50ID0gdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzLmxlbmd0aDtcblxuXHRcdGNvbnN0IHNob3dBY3Rpb25CdXR0b24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdzY20uc2hvd0FjdGlvbkJ1dHRvbicpID09PSB0cnVlO1xuXHRcdGNvbnN0IGFsd2F5c1Nob3dSZXBvc2l0b3JpZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdzY20uYWx3YXlzU2hvd1JlcG9zaXRvcmllcycpID09PSB0cnVlO1xuXG5cdFx0aWYgKGlzU0NNVmlld1NlcnZpY2UoaW5wdXRPckVsZW1lbnQpICYmIChyZXBvc2l0b3J5Q291bnQgPiAxIHx8IGFsd2F5c1Nob3dSZXBvc2l0b3JpZXMpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zY21WaWV3U2VydmljZS52aXNpYmxlUmVwb3NpdG9yaWVzO1xuXHRcdH0gZWxzZSBpZiAoKGlzU0NNVmlld1NlcnZpY2UoaW5wdXRPckVsZW1lbnQpICYmIHJlcG9zaXRvcnlDb3VudCA9PT0gMSAmJiAhYWx3YXlzU2hvd1JlcG9zaXRvcmllcykgfHwgaXNTQ01SZXBvc2l0b3J5KGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgY2hpbGRyZW46IFRyZWVFbGVtZW50W10gPSBbXTtcblxuXHRcdFx0aW5wdXRPckVsZW1lbnQgPSBpc1NDTVJlcG9zaXRvcnkoaW5wdXRPckVsZW1lbnQpID8gaW5wdXRPckVsZW1lbnQgOiB0aGlzLnNjbVZpZXdTZXJ2aWNlLnZpc2libGVSZXBvc2l0b3JpZXNbMF07XG5cdFx0XHRjb25zdCBhY3Rpb25CdXR0b24gPSBpbnB1dE9yRWxlbWVudC5wcm92aWRlci5hY3Rpb25CdXR0b24uZ2V0KCk7XG5cdFx0XHRjb25zdCByZXNvdXJjZUdyb3VwcyA9IGlucHV0T3JFbGVtZW50LnByb3ZpZGVyLmdyb3VwcztcblxuXHRcdFx0Ly8gU0NNIElucHV0XG5cdFx0XHRpZiAoaW5wdXRPckVsZW1lbnQuaW5wdXQudmlzaWJsZSkge1xuXHRcdFx0XHRjaGlsZHJlbi5wdXNoKGlucHV0T3JFbGVtZW50LmlucHV0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWN0aW9uIEJ1dHRvblxuXHRcdFx0aWYgKHNob3dBY3Rpb25CdXR0b24gJiYgYWN0aW9uQnV0dG9uKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6ICdhY3Rpb25CdXR0b24nLFxuXHRcdFx0XHRcdHJlcG9zaXRvcnk6IGlucHV0T3JFbGVtZW50LFxuXHRcdFx0XHRcdGJ1dHRvbjogYWN0aW9uQnV0dG9uXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElTQ01BY3Rpb25CdXR0b24pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNvdXJjZUdyb3Vwc1xuXHRcdFx0Y29uc3QgaGFzU29tZUNoYW5nZXMgPSByZXNvdXJjZUdyb3Vwcy5zb21lKGdyb3VwID0+IGdyb3VwLnJlc291cmNlcy5sZW5ndGggPiAwKTtcblx0XHRcdGlmIChoYXNTb21lQ2hhbmdlcyB8fCAocmVwb3NpdG9yeUNvdW50ID09PSAxICYmICghc2hvd0FjdGlvbkJ1dHRvbiB8fCAhYWN0aW9uQnV0dG9uKSkpIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCguLi5yZXNvdXJjZUdyb3Vwcyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBjaGlsZHJlbjtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlKCkgPT09IFZpZXdNb2RlLkxpc3QpIHtcblx0XHRcdFx0Ly8gUmVzb3VyY2VzIChMaXN0KVxuXHRcdFx0XHRyZXR1cm4gaW5wdXRPckVsZW1lbnQucmVzb3VyY2VzO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnZpZXdNb2RlKCkgPT09IFZpZXdNb2RlLlRyZWUpIHtcblx0XHRcdFx0Ly8gUmVzb3VyY2VzIChUcmVlKVxuXHRcdFx0XHRjb25zdCBjaGlsZHJlbjogVHJlZUVsZW1lbnRbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgaW5wdXRPckVsZW1lbnQucmVzb3VyY2VUcmVlLnJvb3QuY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRjaGlsZHJlbi5wdXNoKG5vZGUuZWxlbWVudCAmJiBub2RlLmNoaWxkcmVuQ291bnQgPT09IDAgPyBub2RlLmVsZW1lbnQgOiBub2RlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBjaGlsZHJlbjtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VOb2RlKGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0Ly8gUmVzb3VyY2VzIChUcmVlKSwgSGlzdG9yeSBpdGVtIGNoYW5nZXMgKFRyZWUpXG5cdFx0XHRjb25zdCBjaGlsZHJlbjogVHJlZUVsZW1lbnRbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIGlucHV0T3JFbGVtZW50LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2gobm9kZS5lbGVtZW50ICYmIG5vZGUuY2hpbGRyZW5Db3VudCA9PT0gMCA/IG5vZGUuZWxlbWVudCA6IG5vZGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hpbGRyZW47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Z2V0UGFyZW50KGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogSVNDTVZpZXdTZXJ2aWNlIHwgVHJlZUVsZW1lbnQge1xuXHRcdGlmIChpc1NDTVJlc291cmNlTm9kZShlbGVtZW50KSkge1xuXHRcdFx0aWYgKGVsZW1lbnQucGFyZW50ID09PSBlbGVtZW50LmNvbnRleHQucmVzb3VyY2VUcmVlLnJvb3QpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuY29udGV4dDtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5wYXJlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQucGFyZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGVsZW1lbnQgcGFzc2VkIHRvIGdldFBhcmVudCcpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZShlbGVtZW50KSkge1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGUoKSA9PT0gVmlld01vZGUuTGlzdCkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5yZXNvdXJjZUdyb3VwO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub2RlID0gZWxlbWVudC5yZXNvdXJjZUdyb3VwLnJlc291cmNlVHJlZS5nZXROb2RlKGVsZW1lbnQuc291cmNlVXJpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vZGU/LnBhcmVudDtcblxuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGVsZW1lbnQgcGFzc2VkIHRvIGdldFBhcmVudCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzdWx0ID09PSBlbGVtZW50LnJlc291cmNlR3JvdXAucmVzb3VyY2VUcmVlLnJvb3QpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2VHcm91cDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSW5wdXQoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnJlcG9zaXRvcnk7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQucmVwb3NpdG9yeTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHRoaXMuc2NtVmlld1NlcnZpY2UudmlzaWJsZVJlcG9zaXRvcmllcy5maW5kKHIgPT4gci5wcm92aWRlciA9PT0gZWxlbWVudC5wcm92aWRlcik7XG5cdFx0XHRpZiAoIXJlcG9zaXRvcnkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGVsZW1lbnQgcGFzc2VkIHRvIGdldFBhcmVudCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVwb3NpdG9yeTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVwb3NpdG9yeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2NtVmlld1NlcnZpY2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBjYWxsIHRvIGdldFBhcmVudCcpO1xuXHRcdH1cblx0fVxuXG5cdGhhc0NoaWxkcmVuKGlucHV0T3JFbGVtZW50OiBJU0NNVmlld1NlcnZpY2UgfCBUcmVlRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc1NDTVZpZXdTZXJ2aWNlKGlucHV0T3JFbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2NtVmlld1NlcnZpY2UudmlzaWJsZVJlcG9zaXRvcmllcy5sZW5ndGggIT09IDA7XG5cdFx0fSBlbHNlIGlmIChpc1NDTVJlcG9zaXRvcnkoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNSW5wdXQoaW5wdXRPckVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIGlmIChpc1NDTUFjdGlvbkJ1dHRvbihpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKGlzU0NNUmVzb3VyY2VHcm91cChpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAoaXNTQ01SZXNvdXJjZShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKFJlc291cmNlVHJlZS5pc1Jlc291cmNlTm9kZShpbnB1dE9yRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBpbnB1dE9yRWxlbWVudC5jaGlsZHJlbkNvdW50ID4gMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdoYXNDaGlsZHJlbiBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTQ01BY3Rpb25CdXR0b24gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgYnV0dG9uOiBCdXR0b24gfCBCdXR0b25XaXRoRGVzY3JpcHRpb24gfCBCdXR0b25XaXRoRHJvcGRvd24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcz8uZGlzcG9zZSgpO1xuXHR9XG5cblx0c2V0QnV0dG9uKGJ1dHRvbjogSVNDTUFjdGlvbkJ1dHRvbkRlc2NyaXB0b3IgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBvbGQgYnV0dG9uXG5cdFx0dGhpcy5jbGVhcigpO1xuXHRcdGlmICghYnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGJ1dHRvbi5zZWNvbmRhcnlDb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBidXR0b24uc2Vjb25kYXJ5Q29tbWFuZHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRzID0gYnV0dG9uLnNlY29uZGFyeUNvbW1hbmRzW2luZGV4XTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiBjb21tYW5kLmlkLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGNvbW1hbmQudGl0bGUsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZC5pZCwgLi4uKGNvbW1hbmQuYXJndW1lbnRzIHx8IFtdKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb21tYW5kcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gUmVtb3ZlIGxhc3Qgc2VwYXJhdG9yXG5cdFx0XHRhY3Rpb25zLnBvcCgpO1xuXG5cdFx0XHQvLyBCdXR0b25XaXRoRHJvcGRvd25cblx0XHRcdHRoaXMuYnV0dG9uID0gbmV3IEJ1dHRvbldpdGhEcm9wZG93bih0aGlzLmNvbnRhaW5lciwge1xuXHRcdFx0XHRhY3Rpb25zOiBhY3Rpb25zLFxuXHRcdFx0XHRhZGRQcmltYXJ5QWN0aW9uVG9Ecm9wZG93bjogZmFsc2UsXG5cdFx0XHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0XHR0aXRsZTogYnV0dG9uLmNvbW1hbmQudG9vbHRpcCxcblx0XHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gQnV0dG9uXG5cdFx0XHR0aGlzLmJ1dHRvbiA9IG5ldyBCdXR0b24odGhpcy5jb250YWluZXIsIHsgc3VwcG9ydEljb25zOiB0cnVlLCBzdXBwb3J0U2hvcnRMYWJlbDogISFidXR0b24uY29tbWFuZC5zaG9ydFRpdGxlLCB0aXRsZTogYnV0dG9uLmNvbW1hbmQudG9vbHRpcCwgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KTtcblx0XHR9XG5cblx0XHR0aGlzLmJ1dHRvbi5lbmFibGVkID0gYnV0dG9uLmVuYWJsZWQ7XG5cdFx0dGhpcy5idXR0b24ubGFiZWwgPSBidXR0b24uY29tbWFuZC50aXRsZTtcblx0XHRpZiAodGhpcy5idXR0b24gaW5zdGFuY2VvZiBCdXR0b24gJiYgYnV0dG9uLmNvbW1hbmQuc2hvcnRUaXRsZSkge1xuXHRcdFx0dGhpcy5idXR0b24ubGFiZWxTaG9ydCA9IGJ1dHRvbi5jb21tYW5kLnNob3J0VGl0bGU7XG5cdFx0fVxuXHRcdHRoaXMuYnV0dG9uLm9uRGlkQ2xpY2soYXN5bmMgKCkgPT4gYXdhaXQgdGhpcy5leGVjdXRlQ29tbWFuZChidXR0b24uY29tbWFuZC5pZCwgLi4uKGJ1dHRvbi5jb21tYW5kLmFyZ3VtZW50cyB8fCBbXSkpLCBudWxsLCB0aGlzLmRpc3Bvc2FibGVzLnZhbHVlKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMudmFsdWUhLmFkZCh0aGlzLmJ1dHRvbik7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmJ1dHRvbj8uZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLmJ1dHRvbiA9IHVuZGVmaW5lZDtcblx0XHRjbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBleGVjdXRlQ29tbWFuZChjb21tYW5kSWQ6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkLCAuLi5hcmdzKTtcblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGV4KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsT0FBTyxlQUFlO0FBQy9CLFNBQVMsVUFBVSxlQUFlO0FBQ2xDLFNBQXNCLFlBQVksaUJBQWlCLG9CQUFvQixTQUFTLGNBQWMsbUJBQW1CLHFCQUFxQjtBQUN0SSxTQUFTLFVBQTRCLGtCQUFrQjtBQUN2RCxTQUFTLFFBQVEsR0FBRyxXQUFXLGdCQUFnQix1QkFBdUI7QUFDdEUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBcUUsaUJBQXVELGFBQWEsY0FBNEQsdUJBQXVCLFVBQVUsbUNBQW1DO0FBQ3pRLFNBQVMsc0JBQXlEO0FBQ2xFLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQWlDLGdCQUFnQixxQkFBcUI7QUFDL0UsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0IsY0FBYyxpQkFBaUIsUUFBeUIs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VCxLQUFLLFlBQVk7QUFDaEIsb0JBQU0sS0FBSyxlQUFlLFFBQVEsSUFBSSxHQUFJLFFBQVEsYUFBYSxDQUFDLENBQUU7QUFBQSxZQUNuRTtBQUFBLFVBQ0QsQ0FBQyxDQUFDO0FBQUEsUUFDSDtBQUNBLFlBQUksU0FBUyxRQUFRO0FBQ3BCLGtCQUFRLEtBQUssSUFBSSxVQUFVLENBQUM7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFFQSxjQUFRLElBQUk7QUFHWixXQUFLLFNBQVMsSUFBSSxtQkFBbUIsS0FBSyxXQUFXO0FBQUEsUUFDcEQ7QUFBQSxRQUNBLDRCQUE0QjtBQUFBLFFBQzVCLHFCQUFxQixLQUFLO0FBQUEsUUFDMUIsT0FBTyxPQUFPLFFBQVE7QUFBQSxRQUN0QixjQUFjO0FBQUEsUUFDZCxHQUFHO0FBQUEsTUFDSixDQUFDO0FBQUEsSUFDRixPQUFPO0FBRU4sV0FBSyxTQUFTLElBQUksT0FBTyxLQUFLLFdBQVcsRUFBRSxjQUFjLE1BQU0sbUJBQW1CLENBQUMsQ0FBQyxPQUFPLFFBQVEsWUFBWSxPQUFPLE9BQU8sUUFBUSxTQUFTLEdBQUcsb0JBQW9CLENBQUM7QUFBQSxJQUN2SztBQUVBLFNBQUssT0FBTyxVQUFVLE9BQU87QUFDN0IsU0FBSyxPQUFPLFFBQVEsT0FBTyxRQUFRO0FBQ25DLFFBQUksS0FBSyxrQkFBa0IsVUFBVSxPQUFPLFFBQVEsWUFBWTtBQUMvRCxXQUFLLE9BQU8sYUFBYSxPQUFPLFFBQVE7QUFBQSxJQUN6QztBQUNBLFNBQUssT0FBTyxXQUFXLFlBQVksTUFBTSxLQUFLLGVBQWUsT0FBTyxRQUFRLElBQUksR0FBSSxPQUFPLFFBQVEsYUFBYSxDQUFDLENBQUUsR0FBRyxNQUFNLEtBQUssWUFBWSxLQUFLO0FBRWxKLFNBQUssWUFBWSxNQUFPLElBQUksS0FBSyxNQUFNO0FBQUEsRUFDeEM7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLFFBQVEsTUFBTTtBQUFBLEVBQ3BCO0FBQUEsRUFFUSxRQUFjO0FBQ3JCLFNBQUssWUFBWSxRQUFRLElBQUksZ0JBQWdCO0FBQzdDLFNBQUssU0FBUztBQUNkLGNBQVUsS0FBSyxTQUFTO0FBQUEsRUFDekI7QUFBQSxFQUVBLE1BQWMsZUFBZSxjQUFzQixNQUFnQztBQUNsRixRQUFJO0FBQ0gsWUFBTSxLQUFLLGVBQWUsZUFBZSxXQUFXLEdBQUcsSUFBSTtBQUFBLElBQzVELFNBQVMsSUFBSTtBQUNaLFdBQUssb0JBQW9CLE1BQU0sRUFBRTtBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUNEOyIsCiAgIm5hbWVzIjogWyJtYXRjaGVzIiwgInNlbGVjdGlvbnMiLCAib25lTmFtZSIsICJvdGhlck5hbWUiLCAiVmlld1NvcnRLZXkiLCAiYWN0aW9ucyJdCn0K
