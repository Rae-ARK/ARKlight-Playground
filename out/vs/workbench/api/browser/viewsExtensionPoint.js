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
import { MarkdownString } from "../../../base/common/htmlContent.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as resources from "../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../base/common/strings.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { localize } from "../../../nls.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier, ExtensionIdentifierSet } from "../../../platform/extensions/common/extensions.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { Extensions as ViewletExtensions } from "../../browser/panecomposite.js";
import { CustomTreeView, TreeViewPane } from "../../browser/parts/views/treeView.js";
import { ViewPaneContainer } from "../../browser/parts/views/viewPaneContainer.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../common/contributions.js";
import { Extensions as ViewContainerExtensions, ViewContainerLocation } from "../../common/views.js";
import { VIEWLET_ID as DEBUG } from "../../contrib/debug/common/debug.js";
import { VIEWLET_ID as EXPLORER } from "../../contrib/files/common/files.js";
import { VIEWLET_ID as REMOTE } from "../../contrib/remote/browser/remoteExplorer.js";
import { VIEWLET_ID as SCM } from "../../contrib/scm/common/scm.js";
import { WebviewViewPane } from "../../contrib/webviewView/browser/webviewViewPane.js";
import { Extensions as ExtensionFeaturesRegistryExtensions } from "../../services/extensionManagement/common/extensionFeatures.js";
import { isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../services/extensions/common/extensionsRegistry.js";
const viewsContainerSchema = {
  type: "object",
  properties: {
    id: {
      description: localize({ key: "vscode.extension.contributes.views.containers.id", comment: ["Contribution refers to those that an extension contributes to VS Code through an extension/contribution point. "] }, "Unique id used to identify the container in which views can be contributed using 'views' contribution point"),
      type: "string",
      pattern: "^[a-zA-Z0-9_-]+$"
    },
    title: {
      description: localize("vscode.extension.contributes.views.containers.title", "Human readable string used to render the container"),
      type: "string"
    },
    icon: {
      description: localize("vscode.extension.contributes.views.containers.icon", "Path to the container icon. Icons are 24x24 centered on a 50x40 block and have a fill color of 'rgb(215, 218, 224)' or '#d7dae0'. It is recommended that icons be in SVG, though any image file type is accepted."),
      type: "string"
    }
  },
  required: ["id", "title", "icon"]
};
const viewsContainersContribution = {
  description: localize("vscode.extension.contributes.viewsContainers", "Contributes views containers to the editor"),
  type: "object",
  properties: {
    "activitybar": {
      description: localize("views.container.activitybar", "Contribute views containers to Activity Bar"),
      type: "array",
      items: viewsContainerSchema
    },
    "panel": {
      description: localize("views.container.panel", "Contribute views containers to Panel"),
      type: "array",
      items: viewsContainerSchema
    },
    "secondarySidebar": {
      description: localize("views.container.secondarySidebar", "Contribute views containers to Secondary Side Bar"),
      type: "array",
      items: viewsContainerSchema
    }
  },
  additionalProperties: false
};
var ViewType = /* @__PURE__ */ ((ViewType2) => {
  ViewType2["Tree"] = "tree";
  ViewType2["Webview"] = "webview";
  return ViewType2;
})(ViewType || {});
var InitialVisibility = /* @__PURE__ */ ((InitialVisibility2) => {
  InitialVisibility2["Visible"] = "visible";
  InitialVisibility2["Hidden"] = "hidden";
  InitialVisibility2["Collapsed"] = "collapsed";
  return InitialVisibility2;
})(InitialVisibility || {});
const viewDescriptor = {
  type: "object",
  required: ["id", "name", "icon"],
  defaultSnippets: [{ body: { id: "${1:id}", name: "${2:name}", icon: "${3:icon}" } }],
  properties: {
    type: {
      markdownDescription: localize("vscode.extension.contributes.view.type", "Type of the view. This can either be `tree` for a tree view based view or `webview` for a webview based view. The default is `tree`."),
      type: "string",
      enum: [
        "tree",
        "webview"
      ],
      markdownEnumDescriptions: [
        localize("vscode.extension.contributes.view.tree", "The view is backed by a `TreeView` created by `createTreeView`."),
        localize("vscode.extension.contributes.view.webview", "The view is backed by a `WebviewView` registered by `registerWebviewViewProvider`.")
      ]
    },
    id: {
      markdownDescription: localize("vscode.extension.contributes.view.id", "Identifier of the view. This should be unique across all views. It is recommended to include your extension id as part of the view id. Use this to register a data provider through `vscode.window.registerTreeDataProviderForView` API. Also to trigger activating your extension by registering `onView:${id}` event to `activationEvents`."),
      type: "string"
    },
    name: {
      description: localize("vscode.extension.contributes.view.name", "The human-readable name of the view. Will be shown"),
      type: "string"
    },
    when: {
      description: localize("vscode.extension.contributes.view.when", "Condition which must be true to show this view"),
      type: "string"
    },
    icon: {
      description: localize("vscode.extension.contributes.view.icon", "Path to the view icon. View icons are displayed when the name of the view cannot be shown. It is recommended that icons be in SVG, though any image file type is accepted."),
      type: "string"
    },
    contextualTitle: {
      description: localize("vscode.extension.contributes.view.contextualTitle", "Human-readable context for when the view is moved out of its original location. By default, the view's container name will be used."),
      type: "string"
    },
    visibility: {
      description: localize("vscode.extension.contributes.view.initialState", "Initial state of the view when the extension is first installed. Once the user has changed the view state by collapsing, moving, or hiding the view, the initial state will not be used again."),
      type: "string",
      enum: [
        "visible",
        "hidden",
        "collapsed"
      ],
      default: "visible",
      enumDescriptions: [
        localize("vscode.extension.contributes.view.initialState.visible", "The default initial state for the view. In most containers the view will be expanded, however; some built-in containers (explorer, scm, and debug) show all contributed views collapsed regardless of the `visibility`."),
        localize("vscode.extension.contributes.view.initialState.hidden", "The view will not be shown in the view container, but will be discoverable through the views menu and other view entry points and can be un-hidden by the user."),
        localize("vscode.extension.contributes.view.initialState.collapsed", "The view will show in the view container, but will be collapsed.")
      ]
    },
    initialSize: {
      type: "number",
      description: localize("vscode.extension.contributs.view.size", "The initial size of the view. The size will behave like the css 'flex' property, and will set the initial size when the view is first shown. In the side bar, this is the height of the view. This value is only respected when the same extension owns both the view and the view container.")
    },
    accessibilityHelpContent: {
      type: "string",
      markdownDescription: localize("vscode.extension.contributes.view.accessibilityHelpContent", "When the accessibility help dialog is invoked in this view, this content will be presented to the user as a markdown string. Keybindings will be resolved when provided in the format of <keybinding:commandId>. If there is no keybinding, that will be indicated and this command will be included in a quickpick for easy configuration.")
    }
  }
};
const remoteViewDescriptor = {
  type: "object",
  required: ["id", "name"],
  properties: {
    id: {
      description: localize("vscode.extension.contributes.view.id", "Identifier of the view. This should be unique across all views. It is recommended to include your extension id as part of the view id. Use this to register a data provider through `vscode.window.registerTreeDataProviderForView` API. Also to trigger activating your extension by registering `onView:${id}` event to `activationEvents`."),
      type: "string"
    },
    name: {
      description: localize("vscode.extension.contributes.view.name", "The human-readable name of the view. Will be shown"),
      type: "string"
    },
    when: {
      description: localize("vscode.extension.contributes.view.when", "Condition which must be true to show this view"),
      type: "string"
    },
    group: {
      description: localize("vscode.extension.contributes.view.group", "Nested group in the viewlet"),
      type: "string"
    },
    remoteName: {
      description: localize("vscode.extension.contributes.view.remoteName", "The name of the remote type associated with this view"),
      type: ["string", "array"],
      items: {
        type: "string"
      }
    }
  }
};
const viewsContribution = {
  description: localize("vscode.extension.contributes.views", "Contributes views to the editor"),
  type: "object",
  properties: {
    "explorer": {
      description: localize("views.explorer", "Contributes views to Explorer container in the Activity bar"),
      type: "array",
      items: viewDescriptor,
      default: []
    },
    "debug": {
      description: localize("views.debug", "Contributes views to Debug container in the Activity bar"),
      type: "array",
      items: viewDescriptor,
      default: []
    },
    "scm": {
      description: localize("views.scm", "Contributes views to SCM container in the Activity bar"),
      type: "array",
      items: viewDescriptor,
      default: []
    },
    "test": {
      description: localize("views.test", "Contributes views to Test container in the Activity bar"),
      type: "array",
      items: viewDescriptor,
      default: []
    },
    "remote": {
      description: localize("views.remote", "Contributes views to Remote container in the Activity bar. To contribute to this container, the 'contribViewsRemote' API proposal must be enabled."),
      type: "array",
      items: remoteViewDescriptor,
      default: []
    }
  },
  additionalProperties: {
    description: localize("views.contributed", "Contributes views to contributed views container"),
    type: "array",
    items: viewDescriptor,
    default: []
  }
};
const viewsContainersExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "viewsContainers",
  jsonSchema: viewsContainersContribution
});
const viewsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "views",
  deps: [viewsContainersExtensionPoint],
  jsonSchema: viewsContribution,
  activationEventsGenerator: function* (viewExtensionPointTypeArray) {
    for (const viewExtensionPointType of viewExtensionPointTypeArray) {
      for (const viewDescriptors of Object.values(viewExtensionPointType)) {
        for (const viewDescriptor2 of viewDescriptors) {
          if (viewDescriptor2.id) {
            yield `onView:${viewDescriptor2.id}`;
          }
        }
      }
    }
  }
});
const CUSTOM_VIEWS_START_ORDER = 7;
let ViewsExtensionHandler = class {
  constructor(instantiationService, logService) {
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.viewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
    this.viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
    this.handleAndRegisterCustomViewContainers();
    this.handleAndRegisterCustomViews();
  }
  handleAndRegisterCustomViewContainers() {
    viewsContainersExtensionPoint.setHandler((extensions, { added, removed }) => {
      if (removed.length) {
        this.removeCustomViewContainers(removed);
      }
      if (added.length) {
        this.addCustomViewContainers(added, this.viewContainersRegistry.all);
      }
    });
  }
  addCustomViewContainers(extensionPoints, existingViewContainers) {
    const viewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
    let activityBarOrder = CUSTOM_VIEWS_START_ORDER + viewContainersRegistry.all.filter((v) => !!v.extensionId && viewContainersRegistry.getViewContainerLocation(v) === ViewContainerLocation.Sidebar).length;
    let panelOrder = 5 + viewContainersRegistry.all.filter((v) => !!v.extensionId && viewContainersRegistry.getViewContainerLocation(v) === ViewContainerLocation.Panel).length + 1;
    let auxiliaryBarOrder = 100 + viewContainersRegistry.all.filter((v) => !!v.extensionId && viewContainersRegistry.getViewContainerLocation(v) === ViewContainerLocation.AuxiliaryBar).length + 1;
    for (const { value, collector, description } of extensionPoints) {
      Object.entries(value).forEach(([key, value2]) => {
        if (!this.isValidViewsContainer(value2, collector)) {
          return;
        }
        switch (key) {
          case "activitybar":
            activityBarOrder = this.registerCustomViewContainers(value2, description, activityBarOrder, existingViewContainers, ViewContainerLocation.Sidebar);
            break;
          case "panel":
            panelOrder = this.registerCustomViewContainers(value2, description, panelOrder, existingViewContainers, ViewContainerLocation.Panel);
            break;
          case "secondarySidebar":
            auxiliaryBarOrder = this.registerCustomViewContainers(value2, description, auxiliaryBarOrder, existingViewContainers, ViewContainerLocation.AuxiliaryBar);
            break;
        }
      });
    }
  }
  removeCustomViewContainers(extensionPoints) {
    const viewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
    const removedExtensions = extensionPoints.reduce((result, e) => {
      result.add(e.description.identifier);
      return result;
    }, new ExtensionIdentifierSet());
    for (const viewContainer of viewContainersRegistry.all) {
      if (viewContainer.extensionId && removedExtensions.has(viewContainer.extensionId)) {
        const views = this.viewsRegistry.getViews(viewContainer);
        if (views.length) {
          this.viewsRegistry.moveViews(views, this.getDefaultViewContainer());
        }
        this.deregisterCustomViewContainer(viewContainer);
      }
    }
  }
  isValidViewsContainer(viewsContainersDescriptors, collector) {
    if (!Array.isArray(viewsContainersDescriptors)) {
      collector.error(localize("viewcontainer requirearray", "views containers must be an array"));
      return false;
    }
    for (const descriptor of viewsContainersDescriptors) {
      if (typeof descriptor.id !== "string" && isFalsyOrWhitespace(descriptor.id)) {
        collector.error(localize("requireidstring", "property `{0}` is mandatory and must be of type `string` with non-empty value. Only alphanumeric characters, '_', and '-' are allowed.", "id"));
        return false;
      }
      if (!/^[a-z0-9_-]+$/i.test(descriptor.id)) {
        collector.error(localize("requireidstring", "property `{0}` is mandatory and must be of type `string` with non-empty value. Only alphanumeric characters, '_', and '-' are allowed.", "id"));
        return false;
      }
      if (typeof descriptor.title !== "string") {
        collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "title"));
        return false;
      }
      if (typeof descriptor.icon !== "string") {
        collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "icon"));
        return false;
      }
      if (isFalsyOrWhitespace(descriptor.title)) {
        collector.warn(localize("requirenonemptystring", "property `{0}` is mandatory and must be of type `string` with non-empty value", "title"));
        return true;
      }
    }
    return true;
  }
  registerCustomViewContainers(containers, extension, order, existingViewContainers, location) {
    containers.forEach((descriptor) => {
      const themeIcon = ThemeIcon.fromString(descriptor.icon);
      const icon = themeIcon || resources.joinPath(extension.extensionLocation, descriptor.icon);
      const id = `workbench.view.extension.${descriptor.id}`;
      const title = descriptor.title || id;
      const viewContainer = this.registerCustomViewContainer(id, title, icon, order++, extension.identifier, location);
      if (existingViewContainers.length) {
        const viewsToMove = [];
        for (const existingViewContainer of existingViewContainers) {
          if (viewContainer !== existingViewContainer) {
            viewsToMove.push(...this.viewsRegistry.getViews(existingViewContainer).filter((view) => view.originalContainerId === descriptor.id));
          }
        }
        if (viewsToMove.length) {
          this.viewsRegistry.moveViews(viewsToMove, viewContainer);
        }
      }
    });
    return order;
  }
  registerCustomViewContainer(id, title, icon, order, extensionId, location) {
    let viewContainer = this.viewContainersRegistry.get(id);
    if (!viewContainer) {
      viewContainer = this.viewContainersRegistry.registerViewContainer({
        id,
        title: { value: title, original: title },
        extensionId,
        ctorDescriptor: new SyncDescriptor(
          ViewPaneContainer,
          [id, { mergeViewWithContainerWhenSingleView: true }]
        ),
        hideIfEmpty: true,
        order,
        icon
      }, location);
    }
    return viewContainer;
  }
  deregisterCustomViewContainer(viewContainer) {
    this.viewContainersRegistry.deregisterViewContainer(viewContainer);
    Registry.as(ViewletExtensions.Viewlets).deregisterPaneComposite(viewContainer.id);
  }
  handleAndRegisterCustomViews() {
    viewsExtensionPoint.setHandler((extensions, { added, removed }) => {
      if (removed.length) {
        this.removeViews(removed);
      }
      if (added.length) {
        this.addViews(added);
      }
    });
  }
  addViews(extensions) {
    const viewIds = /* @__PURE__ */ new Set();
    const allViewDescriptors = [];
    for (const extension of extensions) {
      const { value, collector } = extension;
      Object.entries(value).forEach(([key, value2]) => {
        if (!this.isValidViewDescriptors(value2, collector)) {
          return;
        }
        if (key === "remote" && !isProposedApiEnabled(extension.description, "contribViewsRemote")) {
          collector.warn(localize("ViewContainerRequiresProposedAPI", `View container '{0}' requires 'enabledApiProposals: ["contribViewsRemote"]' to be added to 'Remote'.`, key));
          return;
        }
        if (key === "agentSessions" && !isProposedApiEnabled(extension.description, "chatSessionsProvider")) {
          collector.warn(localize("RequiresChatSessionsProposedAPI", `View container '{0}' requires 'enabledApiProposals: ["chatSessionsProvider"]'.`, key));
          return;
        }
        const viewContainer = this.getViewContainer(key);
        if (!viewContainer) {
          collector.warn(localize("ViewContainerDoesnotExist", "View container '{0}' does not exist and all views registered to it will be added to 'Explorer'.", key));
        }
        const container = viewContainer || this.getDefaultViewContainer();
        const viewDescriptors = [];
        for (let index = 0; index < value2.length; index++) {
          const item = value2[index];
          if (viewIds.has(item.id)) {
            collector.error(localize("duplicateView1", "Cannot register multiple views with same id `{0}`", item.id));
            continue;
          }
          if (this.viewsRegistry.getView(item.id) !== null) {
            collector.error(localize("duplicateView2", "A view with id `{0}` is already registered.", item.id));
            continue;
          }
          const order = ExtensionIdentifier.equals(extension.description.identifier, container.extensionId) ? index + 1 : container.viewOrderDelegate ? container.viewOrderDelegate.getOrder(item.group) : void 0;
          let icon;
          if (typeof item.icon === "string") {
            icon = ThemeIcon.fromString(item.icon) || resources.joinPath(extension.description.extensionLocation, item.icon);
          }
          const initialVisibility = this.convertInitialVisibility(item.visibility);
          const type = this.getViewType(item.type);
          if (!type) {
            collector.error(localize("unknownViewType", "Unknown view type `{0}`.", item.type));
            continue;
          }
          let weight = void 0;
          if (typeof item.initialSize === "number") {
            if (container.extensionId?.value === extension.description.identifier.value) {
              weight = item.initialSize;
            } else {
              this.logService.warn(`${extension.description.identifier.value} tried to set the view size of ${item.id} but it was ignored because the view container does not belong to it.`);
            }
          }
          let accessibilityHelpContent;
          if (isProposedApiEnabled(extension.description, "contribAccessibilityHelpContent") && item.accessibilityHelpContent) {
            accessibilityHelpContent = new MarkdownString(item.accessibilityHelpContent);
          }
          const viewDescriptor2 = {
            type,
            ctorDescriptor: type === "tree" /* Tree */ ? new SyncDescriptor(TreeViewPane) : new SyncDescriptor(WebviewViewPane),
            id: item.id,
            name: { value: item.name, original: item.name },
            when: ContextKeyExpr.deserialize(item.when),
            containerIcon: icon || viewContainer?.icon,
            containerTitle: item.contextualTitle || viewContainer && (typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value),
            canToggleVisibility: true,
            canMoveView: viewContainer?.id !== REMOTE,
            treeView: type === "tree" /* Tree */ ? this.instantiationService.createInstance(CustomTreeView, item.id, item.name, extension.description.identifier.value) : void 0,
            collapsed: this.showCollapsed(container) || initialVisibility === "collapsed" /* Collapsed */,
            order,
            extensionId: extension.description.identifier,
            originalContainerId: key,
            group: item.group,
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            remoteAuthority: item.remoteName || item.remoteAuthority,
            // TODO@roblou - delete after remote extensions are updated
            virtualWorkspace: item.virtualWorkspace,
            hideByDefault: initialVisibility === "hidden" /* Hidden */,
            workspace: viewContainer?.id === REMOTE ? true : void 0,
            weight,
            accessibilityHelpContent
          };
          viewIds.add(viewDescriptor2.id);
          viewDescriptors.push(viewDescriptor2);
        }
        allViewDescriptors.push({ viewContainer: container, views: viewDescriptors });
      });
    }
    this.viewsRegistry.registerViews2(allViewDescriptors);
  }
  getViewType(type) {
    if (type === "webview" /* Webview */) {
      return "webview" /* Webview */;
    }
    if (!type || type === "tree" /* Tree */) {
      return "tree" /* Tree */;
    }
    return void 0;
  }
  getDefaultViewContainer() {
    return this.viewContainersRegistry.get(EXPLORER);
  }
  removeViews(extensions) {
    const removedExtensions = extensions.reduce((result, e) => {
      result.add(e.description.identifier);
      return result;
    }, new ExtensionIdentifierSet());
    for (const viewContainer of this.viewContainersRegistry.all) {
      const removedViews = this.viewsRegistry.getViews(viewContainer).filter((v) => v.extensionId && removedExtensions.has(v.extensionId));
      if (removedViews.length) {
        this.viewsRegistry.deregisterViews(removedViews, viewContainer);
        for (const view of removedViews) {
          const anyView = view;
          if (anyView.treeView) {
            anyView.treeView.dispose();
          }
        }
      }
    }
  }
  convertInitialVisibility(value) {
    if (Object.values(InitialVisibility).includes(value)) {
      return value;
    }
    return void 0;
  }
  isValidViewDescriptors(viewDescriptors, collector) {
    if (!Array.isArray(viewDescriptors)) {
      collector.error(localize("requirearray", "views must be an array"));
      return false;
    }
    for (const descriptor of viewDescriptors) {
      if (typeof descriptor.id !== "string") {
        collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "id"));
        return false;
      }
      if (typeof descriptor.name !== "string") {
        collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "name"));
        return false;
      }
      if (descriptor.when && typeof descriptor.when !== "string") {
        collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "when"));
        return false;
      }
      if (descriptor.icon && typeof descriptor.icon !== "string") {
        collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "icon"));
        return false;
      }
      if (descriptor.contextualTitle && typeof descriptor.contextualTitle !== "string") {
        collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "contextualTitle"));
        return false;
      }
      if (descriptor.visibility && !this.convertInitialVisibility(descriptor.visibility)) {
        collector.error(localize("optenum", "property `{0}` can be omitted or must be one of {1}", "visibility", Object.values(InitialVisibility).join(", ")));
        return false;
      }
    }
    return true;
  }
  getViewContainer(value) {
    switch (value) {
      case "explorer":
        return this.viewContainersRegistry.get(EXPLORER);
      case "debug":
        return this.viewContainersRegistry.get(DEBUG);
      case "scm":
        return this.viewContainersRegistry.get(SCM);
      case "remote":
        return this.viewContainersRegistry.get(REMOTE);
      default:
        return this.viewContainersRegistry.get(`workbench.view.extension.${value}`);
    }
  }
  showCollapsed(container) {
    switch (container.id) {
      case EXPLORER:
      case SCM:
      case DEBUG:
        return true;
    }
    return false;
  }
};
ViewsExtensionHandler.ID = "workbench.contrib.viewsExtensionHandler";
ViewsExtensionHandler = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ILogService)
], ViewsExtensionHandler);
class ViewContainersDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.viewsContainers;
  }
  render(manifest) {
    const contrib = manifest.contributes?.viewsContainers || {};
    const viewContainers = Object.keys(contrib).reduce((result, location) => {
      const viewContainersForLocation = contrib[location];
      result.push(...viewContainersForLocation.map((viewContainer) => ({ ...viewContainer, location })));
      return result;
    }, []);
    if (!viewContainers.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("view container id", "ID"),
      localize("view container title", "Title"),
      localize("view container location", "Where")
    ];
    const rows = viewContainers.sort((a, b) => a.id.localeCompare(b.id)).map((viewContainer) => {
      return [
        viewContainer.id,
        viewContainer.title,
        viewContainer.location
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
class ViewsDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.views;
  }
  render(manifest) {
    const contrib = manifest.contributes?.views || {};
    const views = Object.keys(contrib).reduce((result, location) => {
      const viewsForLocation = contrib[location];
      result.push(...viewsForLocation.map((view) => ({ ...view, location })));
      return result;
    }, []);
    if (!views.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("view id", "ID"),
      localize("view name title", "Name"),
      localize("view container location", "Where")
    ];
    const rows = views.sort((a, b) => a.id.localeCompare(b.id)).map((view) => {
      return [
        view.id,
        view.name,
        view.location
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(ExtensionFeaturesRegistryExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "viewsContainers",
  label: localize("viewsContainers", "View Containers"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ViewContainersDataRenderer)
});
Registry.as(ExtensionFeaturesRegistryExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "views",
  label: localize("views", "Views"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ViewsDataRenderer)
});
registerWorkbenchContribution2(ViewsExtensionHandler.ID, ViewsExtensionHandler, WorkbenchPhase.BlockStartup);
export {
  viewsContainersContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci92aWV3c0V4dGVuc2lvblBvaW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRmFsc3lPcldoaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIEV4dGVuc2lvbklkZW50aWZpZXJTZXQsIElFeHRlbnNpb25EZXNjcmlwdGlvbiwgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBQYW5lQ29tcG9zaXRlUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgVmlld2xldEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgQ3VzdG9tVHJlZVZpZXcsIFRyZWVWaWV3UGFuZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3MvdHJlZVZpZXcuanMnO1xuaW1wb3J0IHsgVmlld1BhbmVDb250YWluZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lQ29udGFpbmVyLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tVmlld0Rlc2NyaXB0b3IsIElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBJVmlld0Rlc2NyaXB0b3IsIElWaWV3c1JlZ2lzdHJ5LCBWaWV3Q29udGFpbmVyLCBFeHRlbnNpb25zIGFzIFZpZXdDb250YWluZXJFeHRlbnNpb25zLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCBhcyBERUJVRyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IFZJRVdMRVRfSUQgYXMgRVhQTE9SRVIgfSBmcm9tICcuLi8uLi9jb250cmliL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBWSUVXTEVUX0lEIGFzIFJFTU9URSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvcmVtb3RlL2Jyb3dzZXIvcmVtb3RlRXhwbG9yZXIuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCBhcyBTQ00gfSBmcm9tICcuLi8uLi9jb250cmliL3NjbS9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IFdlYnZpZXdWaWV3UGFuZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvd2Vidmlld1ZpZXcvYnJvd3Nlci93ZWJ2aWV3Vmlld1BhbmUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5RXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBJRXh0ZW5zaW9uUG9pbnQsIElFeHRlbnNpb25Qb2ludFVzZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElVc2VyRnJpZW5kbHlWaWV3c0NvbnRhaW5lckRlc2NyaXB0b3Ige1xuXHRpZDogc3RyaW5nO1xuXHR0aXRsZTogc3RyaW5nO1xuXHRpY29uOiBzdHJpbmc7XG59XG5cbmNvbnN0IHZpZXdzQ29udGFpbmVyU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRpZDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKHsga2V5OiAndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3cy5jb250YWluZXJzLmlkJywgY29tbWVudDogWydDb250cmlidXRpb24gcmVmZXJzIHRvIHRob3NlIHRoYXQgYW4gZXh0ZW5zaW9uIGNvbnRyaWJ1dGVzIHRvIFZTIENvZGUgdGhyb3VnaCBhbiBleHRlbnNpb24vY29udHJpYnV0aW9uIHBvaW50LiAnXSB9LCBcIlVuaXF1ZSBpZCB1c2VkIHRvIGlkZW50aWZ5IHRoZSBjb250YWluZXIgaW4gd2hpY2ggdmlld3MgY2FuIGJlIGNvbnRyaWJ1dGVkIHVzaW5nICd2aWV3cycgY29udHJpYnV0aW9uIHBvaW50XCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRwYXR0ZXJuOiAnXlthLXpBLVowLTlfLV0rJCdcblx0XHR9LFxuXHRcdHRpdGxlOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlld3MuY29udGFpbmVycy50aXRsZScsICdIdW1hbiByZWFkYWJsZSBzdHJpbmcgdXNlZCB0byByZW5kZXIgdGhlIGNvbnRhaW5lcicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGljb246IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3cy5jb250YWluZXJzLmljb24nLCBcIlBhdGggdG8gdGhlIGNvbnRhaW5lciBpY29uLiBJY29ucyBhcmUgMjR4MjQgY2VudGVyZWQgb24gYSA1MHg0MCBibG9jayBhbmQgaGF2ZSBhIGZpbGwgY29sb3Igb2YgJ3JnYigyMTUsIDIxOCwgMjI0KScgb3IgJyNkN2RhZTAnLiBJdCBpcyByZWNvbW1lbmRlZCB0aGF0IGljb25zIGJlIGluIFNWRywgdGhvdWdoIGFueSBpbWFnZSBmaWxlIHR5cGUgaXMgYWNjZXB0ZWQuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9XG5cdH0sXG5cdHJlcXVpcmVkOiBbJ2lkJywgJ3RpdGxlJywgJ2ljb24nXVxufTtcblxuZXhwb3J0IGNvbnN0IHZpZXdzQ29udGFpbmVyc0NvbnRyaWJ1dGlvbjogSUpTT05TY2hlbWEgPSB7XG5cdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3c0NvbnRhaW5lcnMnLCAnQ29udHJpYnV0ZXMgdmlld3MgY29udGFpbmVycyB0byB0aGUgZWRpdG9yJyksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J2FjdGl2aXR5YmFyJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3cy5jb250YWluZXIuYWN0aXZpdHliYXInLCBcIkNvbnRyaWJ1dGUgdmlld3MgY29udGFpbmVycyB0byBBY3Rpdml0eSBCYXJcIiksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHZpZXdzQ29udGFpbmVyU2NoZW1hXG5cdFx0fSxcblx0XHQncGFuZWwnOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXdzLmNvbnRhaW5lci5wYW5lbCcsIFwiQ29udHJpYnV0ZSB2aWV3cyBjb250YWluZXJzIHRvIFBhbmVsXCIpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB2aWV3c0NvbnRhaW5lclNjaGVtYVxuXHRcdH0sXG5cdFx0J3NlY29uZGFyeVNpZGViYXInOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXdzLmNvbnRhaW5lci5zZWNvbmRhcnlTaWRlYmFyJywgXCJDb250cmlidXRlIHZpZXdzIGNvbnRhaW5lcnMgdG8gU2Vjb25kYXJ5IFNpZGUgQmFyXCIpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB2aWV3c0NvbnRhaW5lclNjaGVtYVxuXHRcdH1cblx0fSxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG59O1xuXG5lbnVtIFZpZXdUeXBlIHtcblx0VHJlZSA9ICd0cmVlJyxcblx0V2VidmlldyA9ICd3ZWJ2aWV3J1xufVxuXG5cbmludGVyZmFjZSBJVXNlckZyaWVuZGx5Vmlld0Rlc2NyaXB0b3Ige1xuXHR0eXBlPzogVmlld1R5cGU7XG5cblx0aWQ6IHN0cmluZztcblx0bmFtZTogc3RyaW5nO1xuXHR3aGVuPzogc3RyaW5nO1xuXG5cdGljb24/OiBzdHJpbmc7XG5cdGNvbnRleHR1YWxUaXRsZT86IHN0cmluZztcblx0dmlzaWJpbGl0eT86IHN0cmluZztcblxuXHRpbml0aWFsU2l6ZT86IG51bWJlcjtcblxuXHQvLyBGcm9tICdyZW1vdGVWaWV3RGVzY3JpcHRvcicgdHlwZVxuXHRncm91cD86IHN0cmluZztcblx0cmVtb3RlTmFtZT86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHR2aXJ0dWFsV29ya3NwYWNlPzogc3RyaW5nO1xuXG5cdGFjY2Vzc2liaWxpdHlIZWxwQ29udGVudD86IHN0cmluZztcbn1cblxuZW51bSBJbml0aWFsVmlzaWJpbGl0eSB7XG5cdFZpc2libGUgPSAndmlzaWJsZScsXG5cdEhpZGRlbiA9ICdoaWRkZW4nLFxuXHRDb2xsYXBzZWQgPSAnY29sbGFwc2VkJ1xufVxuXG5jb25zdCB2aWV3RGVzY3JpcHRvcjogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRyZXF1aXJlZDogWydpZCcsICduYW1lJywgJ2ljb24nXSxcblx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGlkOiAnJHsxOmlkfScsIG5hbWU6ICckezI6bmFtZX0nLCBpY29uOiAnJHszOmljb259JyB9IH1dLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0dHlwZToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy50eXBlJywgXCJUeXBlIG9mIHRoZSB2aWV3LiBUaGlzIGNhbiBlaXRoZXIgYmUgYHRyZWVgIGZvciBhIHRyZWUgdmlldyBiYXNlZCB2aWV3IG9yIGB3ZWJ2aWV3YCBmb3IgYSB3ZWJ2aWV3IGJhc2VkIHZpZXcuIFRoZSBkZWZhdWx0IGlzIGB0cmVlYC5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFtcblx0XHRcdFx0J3RyZWUnLFxuXHRcdFx0XHQnd2VidmlldycsXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcudHJlZScsIFwiVGhlIHZpZXcgaXMgYmFja2VkIGJ5IGEgYFRyZWVWaWV3YCBjcmVhdGVkIGJ5IGBjcmVhdGVUcmVlVmlld2AuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LndlYnZpZXcnLCBcIlRoZSB2aWV3IGlzIGJhY2tlZCBieSBhIGBXZWJ2aWV3Vmlld2AgcmVnaXN0ZXJlZCBieSBgcmVnaXN0ZXJXZWJ2aWV3Vmlld1Byb3ZpZGVyYC5cIiksXG5cdFx0XHRdXG5cdFx0fSxcblx0XHRpZDoge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy5pZCcsICdJZGVudGlmaWVyIG9mIHRoZSB2aWV3LiBUaGlzIHNob3VsZCBiZSB1bmlxdWUgYWNyb3NzIGFsbCB2aWV3cy4gSXQgaXMgcmVjb21tZW5kZWQgdG8gaW5jbHVkZSB5b3VyIGV4dGVuc2lvbiBpZCBhcyBwYXJ0IG9mIHRoZSB2aWV3IGlkLiBVc2UgdGhpcyB0byByZWdpc3RlciBhIGRhdGEgcHJvdmlkZXIgdGhyb3VnaCBgdnNjb2RlLndpbmRvdy5yZWdpc3RlclRyZWVEYXRhUHJvdmlkZXJGb3JWaWV3YCBBUEkuIEFsc28gdG8gdHJpZ2dlciBhY3RpdmF0aW5nIHlvdXIgZXh0ZW5zaW9uIGJ5IHJlZ2lzdGVyaW5nIGBvblZpZXc6JHtpZH1gIGV2ZW50IHRvIGBhY3RpdmF0aW9uRXZlbnRzYC4nKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRuYW1lOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy5uYW1lJywgJ1RoZSBodW1hbi1yZWFkYWJsZSBuYW1lIG9mIHRoZSB2aWV3LiBXaWxsIGJlIHNob3duJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0d2hlbjoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcud2hlbicsICdDb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIHNob3cgdGhpcyB2aWV3JyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0aWNvbjoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcuaWNvbicsIFwiUGF0aCB0byB0aGUgdmlldyBpY29uLiBWaWV3IGljb25zIGFyZSBkaXNwbGF5ZWQgd2hlbiB0aGUgbmFtZSBvZiB0aGUgdmlldyBjYW5ub3QgYmUgc2hvd24uIEl0IGlzIHJlY29tbWVuZGVkIHRoYXQgaWNvbnMgYmUgaW4gU1ZHLCB0aG91Z2ggYW55IGltYWdlIGZpbGUgdHlwZSBpcyBhY2NlcHRlZC5cIiksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0Y29udGV4dHVhbFRpdGxlOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy5jb250ZXh0dWFsVGl0bGUnLCBcIkh1bWFuLXJlYWRhYmxlIGNvbnRleHQgZm9yIHdoZW4gdGhlIHZpZXcgaXMgbW92ZWQgb3V0IG9mIGl0cyBvcmlnaW5hbCBsb2NhdGlvbi4gQnkgZGVmYXVsdCwgdGhlIHZpZXcncyBjb250YWluZXIgbmFtZSB3aWxsIGJlIHVzZWQuXCIpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdHZpc2liaWxpdHk6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LmluaXRpYWxTdGF0ZScsIFwiSW5pdGlhbCBzdGF0ZSBvZiB0aGUgdmlldyB3aGVuIHRoZSBleHRlbnNpb24gaXMgZmlyc3QgaW5zdGFsbGVkLiBPbmNlIHRoZSB1c2VyIGhhcyBjaGFuZ2VkIHRoZSB2aWV3IHN0YXRlIGJ5IGNvbGxhcHNpbmcsIG1vdmluZywgb3IgaGlkaW5nIHRoZSB2aWV3LCB0aGUgaW5pdGlhbCBzdGF0ZSB3aWxsIG5vdCBiZSB1c2VkIGFnYWluLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogW1xuXHRcdFx0XHQndmlzaWJsZScsXG5cdFx0XHRcdCdoaWRkZW4nLFxuXHRcdFx0XHQnY29sbGFwc2VkJ1xuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICd2aXNpYmxlJyxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy5pbml0aWFsU3RhdGUudmlzaWJsZScsIFwiVGhlIGRlZmF1bHQgaW5pdGlhbCBzdGF0ZSBmb3IgdGhlIHZpZXcuIEluIG1vc3QgY29udGFpbmVycyB0aGUgdmlldyB3aWxsIGJlIGV4cGFuZGVkLCBob3dldmVyOyBzb21lIGJ1aWx0LWluIGNvbnRhaW5lcnMgKGV4cGxvcmVyLCBzY20sIGFuZCBkZWJ1Zykgc2hvdyBhbGwgY29udHJpYnV0ZWQgdmlld3MgY29sbGFwc2VkIHJlZ2FyZGxlc3Mgb2YgdGhlIGB2aXNpYmlsaXR5YC5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcuaW5pdGlhbFN0YXRlLmhpZGRlbicsIFwiVGhlIHZpZXcgd2lsbCBub3QgYmUgc2hvd24gaW4gdGhlIHZpZXcgY29udGFpbmVyLCBidXQgd2lsbCBiZSBkaXNjb3ZlcmFibGUgdGhyb3VnaCB0aGUgdmlld3MgbWVudSBhbmQgb3RoZXIgdmlldyBlbnRyeSBwb2ludHMgYW5kIGNhbiBiZSB1bi1oaWRkZW4gYnkgdGhlIHVzZXIuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LmluaXRpYWxTdGF0ZS5jb2xsYXBzZWQnLCBcIlRoZSB2aWV3IHdpbGwgc2hvdyBpbiB0aGUgdmlldyBjb250YWluZXIsIGJ1dCB3aWxsIGJlIGNvbGxhcHNlZC5cIilcblx0XHRcdF1cblx0XHR9LFxuXHRcdGluaXRpYWxTaXplOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRzLnZpZXcuc2l6ZScsIFwiVGhlIGluaXRpYWwgc2l6ZSBvZiB0aGUgdmlldy4gVGhlIHNpemUgd2lsbCBiZWhhdmUgbGlrZSB0aGUgY3NzICdmbGV4JyBwcm9wZXJ0eSwgYW5kIHdpbGwgc2V0IHRoZSBpbml0aWFsIHNpemUgd2hlbiB0aGUgdmlldyBpcyBmaXJzdCBzaG93bi4gSW4gdGhlIHNpZGUgYmFyLCB0aGlzIGlzIHRoZSBoZWlnaHQgb2YgdGhlIHZpZXcuIFRoaXMgdmFsdWUgaXMgb25seSByZXNwZWN0ZWQgd2hlbiB0aGUgc2FtZSBleHRlbnNpb24gb3ducyBib3RoIHRoZSB2aWV3IGFuZCB0aGUgdmlldyBjb250YWluZXIuXCIpLFxuXHRcdH0sXG5cdFx0YWNjZXNzaWJpbGl0eUhlbHBDb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcuYWNjZXNzaWJpbGl0eUhlbHBDb250ZW50JywgXCJXaGVuIHRoZSBhY2Nlc3NpYmlsaXR5IGhlbHAgZGlhbG9nIGlzIGludm9rZWQgaW4gdGhpcyB2aWV3LCB0aGlzIGNvbnRlbnQgd2lsbCBiZSBwcmVzZW50ZWQgdG8gdGhlIHVzZXIgYXMgYSBtYXJrZG93biBzdHJpbmcuIEtleWJpbmRpbmdzIHdpbGwgYmUgcmVzb2x2ZWQgd2hlbiBwcm92aWRlZCBpbiB0aGUgZm9ybWF0IG9mIDxrZXliaW5kaW5nOmNvbW1hbmRJZD4uIElmIHRoZXJlIGlzIG5vIGtleWJpbmRpbmcsIHRoYXQgd2lsbCBiZSBpbmRpY2F0ZWQgYW5kIHRoaXMgY29tbWFuZCB3aWxsIGJlIGluY2x1ZGVkIGluIGEgcXVpY2twaWNrIGZvciBlYXN5IGNvbmZpZ3VyYXRpb24uXCIpXG5cdFx0fVxuXHR9XG59O1xuXG5jb25zdCByZW1vdGVWaWV3RGVzY3JpcHRvcjogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRyZXF1aXJlZDogWydpZCcsICduYW1lJ10sXG5cdHByb3BlcnRpZXM6IHtcblx0XHRpZDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcuaWQnLCAnSWRlbnRpZmllciBvZiB0aGUgdmlldy4gVGhpcyBzaG91bGQgYmUgdW5pcXVlIGFjcm9zcyBhbGwgdmlld3MuIEl0IGlzIHJlY29tbWVuZGVkIHRvIGluY2x1ZGUgeW91ciBleHRlbnNpb24gaWQgYXMgcGFydCBvZiB0aGUgdmlldyBpZC4gVXNlIHRoaXMgdG8gcmVnaXN0ZXIgYSBkYXRhIHByb3ZpZGVyIHRocm91Z2ggYHZzY29kZS53aW5kb3cucmVnaXN0ZXJUcmVlRGF0YVByb3ZpZGVyRm9yVmlld2AgQVBJLiBBbHNvIHRvIHRyaWdnZXIgYWN0aXZhdGluZyB5b3VyIGV4dGVuc2lvbiBieSByZWdpc3RlcmluZyBgb25WaWV3OiR7aWR9YCBldmVudCB0byBgYWN0aXZhdGlvbkV2ZW50c2AuJyksXG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0bmFtZToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnZpZXcubmFtZScsICdUaGUgaHVtYW4tcmVhZGFibGUgbmFtZSBvZiB0aGUgdmlldy4gV2lsbCBiZSBzaG93bicpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdHdoZW46IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3LndoZW4nLCAnQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBzaG93IHRoaXMgdmlldycpLFxuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGdyb3VwOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy5ncm91cCcsICdOZXN0ZWQgZ3JvdXAgaW4gdGhlIHZpZXdsZXQnKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRyZW1vdGVOYW1lOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudmlldy5yZW1vdGVOYW1lJywgJ1RoZSBuYW1lIG9mIHRoZSByZW1vdGUgdHlwZSBhc3NvY2lhdGVkIHdpdGggdGhpcyB2aWV3JyksXG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdhcnJheSddLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH1cblx0XHR9XG5cdH1cbn07XG5jb25zdCB2aWV3c0NvbnRyaWJ1dGlvbjogSUpTT05TY2hlbWEgPSB7XG5cdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy52aWV3cycsIFwiQ29udHJpYnV0ZXMgdmlld3MgdG8gdGhlIGVkaXRvclwiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnZXhwbG9yZXInOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXdzLmV4cGxvcmVyJywgXCJDb250cmlidXRlcyB2aWV3cyB0byBFeHBsb3JlciBjb250YWluZXIgaW4gdGhlIEFjdGl2aXR5IGJhclwiKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogdmlld0Rlc2NyaXB0b3IsXG5cdFx0XHRkZWZhdWx0OiBbXVxuXHRcdH0sXG5cdFx0J2RlYnVnJzoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3cy5kZWJ1ZycsIFwiQ29udHJpYnV0ZXMgdmlld3MgdG8gRGVidWcgY29udGFpbmVyIGluIHRoZSBBY3Rpdml0eSBiYXJcIiksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHZpZXdEZXNjcmlwdG9yLFxuXHRcdFx0ZGVmYXVsdDogW11cblx0XHR9LFxuXHRcdCdzY20nOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXdzLnNjbScsIFwiQ29udHJpYnV0ZXMgdmlld3MgdG8gU0NNIGNvbnRhaW5lciBpbiB0aGUgQWN0aXZpdHkgYmFyXCIpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB2aWV3RGVzY3JpcHRvcixcblx0XHRcdGRlZmF1bHQ6IFtdXG5cdFx0fSxcblx0XHQndGVzdCc6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlld3MudGVzdCcsIFwiQ29udHJpYnV0ZXMgdmlld3MgdG8gVGVzdCBjb250YWluZXIgaW4gdGhlIEFjdGl2aXR5IGJhclwiKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogdmlld0Rlc2NyaXB0b3IsXG5cdFx0XHRkZWZhdWx0OiBbXVxuXHRcdH0sXG5cdFx0J3JlbW90ZSc6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlld3MucmVtb3RlJywgXCJDb250cmlidXRlcyB2aWV3cyB0byBSZW1vdGUgY29udGFpbmVyIGluIHRoZSBBY3Rpdml0eSBiYXIuIFRvIGNvbnRyaWJ1dGUgdG8gdGhpcyBjb250YWluZXIsIHRoZSAnY29udHJpYlZpZXdzUmVtb3RlJyBBUEkgcHJvcG9zYWwgbXVzdCBiZSBlbmFibGVkLlwiKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczogcmVtb3RlVmlld0Rlc2NyaXB0b3IsXG5cdFx0XHRkZWZhdWx0OiBbXVxuXHRcdH0sXG5cdH0sXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3cy5jb250cmlidXRlZCcsIFwiQ29udHJpYnV0ZXMgdmlld3MgdG8gY29udHJpYnV0ZWQgdmlld3MgY29udGFpbmVyXCIpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHZpZXdEZXNjcmlwdG9yLFxuXHRcdGRlZmF1bHQ6IFtdXG5cdH1cbn07XG5cbnR5cGUgVmlld0NvbnRhaW5lckV4dGVuc2lvblBvaW50VHlwZSA9IHsgW2xvYzogc3RyaW5nXTogSVVzZXJGcmllbmRseVZpZXdzQ29udGFpbmVyRGVzY3JpcHRvcltdIH07XG5jb25zdCB2aWV3c0NvbnRhaW5lcnNFeHRlbnNpb25Qb2ludDogSUV4dGVuc2lvblBvaW50PFZpZXdDb250YWluZXJFeHRlbnNpb25Qb2ludFR5cGU+ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8Vmlld0NvbnRhaW5lckV4dGVuc2lvblBvaW50VHlwZT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ3ZpZXdzQ29udGFpbmVycycsXG5cdGpzb25TY2hlbWE6IHZpZXdzQ29udGFpbmVyc0NvbnRyaWJ1dGlvblxufSk7XG5cbnR5cGUgVmlld0V4dGVuc2lvblBvaW50VHlwZSA9IHsgW2xvYzogc3RyaW5nXTogSVVzZXJGcmllbmRseVZpZXdEZXNjcmlwdG9yW10gfTtcbmNvbnN0IHZpZXdzRXh0ZW5zaW9uUG9pbnQ6IElFeHRlbnNpb25Qb2ludDxWaWV3RXh0ZW5zaW9uUG9pbnRUeXBlPiA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PFZpZXdFeHRlbnNpb25Qb2ludFR5cGU+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICd2aWV3cycsXG5cdGRlcHM6IFt2aWV3c0NvbnRhaW5lcnNFeHRlbnNpb25Qb2ludF0sXG5cdGpzb25TY2hlbWE6IHZpZXdzQ29udHJpYnV0aW9uLFxuXHRhY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yOiBmdW5jdGlvbiogKHZpZXdFeHRlbnNpb25Qb2ludFR5cGVBcnJheSkge1xuXHRcdGZvciAoY29uc3Qgdmlld0V4dGVuc2lvblBvaW50VHlwZSBvZiB2aWV3RXh0ZW5zaW9uUG9pbnRUeXBlQXJyYXkpIHtcblx0XHRcdGZvciAoY29uc3Qgdmlld0Rlc2NyaXB0b3JzIG9mIE9iamVjdC52YWx1ZXModmlld0V4dGVuc2lvblBvaW50VHlwZSkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB2aWV3RGVzY3JpcHRvciBvZiB2aWV3RGVzY3JpcHRvcnMpIHtcblx0XHRcdFx0XHRpZiAodmlld0Rlc2NyaXB0b3IuaWQpIHtcblx0XHRcdFx0XHRcdHlpZWxkIGBvblZpZXc6JHt2aWV3RGVzY3JpcHRvci5pZH1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmNvbnN0IENVU1RPTV9WSUVXU19TVEFSVF9PUkRFUiA9IDc7XG5cbmNsYXNzIFZpZXdzRXh0ZW5zaW9uSGFuZGxlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi52aWV3c0V4dGVuc2lvbkhhbmRsZXInO1xuXG5cdHByaXZhdGUgdmlld0NvbnRhaW5lcnNSZWdpc3RyeTogSVZpZXdDb250YWluZXJzUmVnaXN0cnk7XG5cdHByaXZhdGUgdmlld3NSZWdpc3RyeTogSVZpZXdzUmVnaXN0cnk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KFZpZXdDb250YWluZXJFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpO1xuXHRcdHRoaXMudmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblx0XHR0aGlzLmhhbmRsZUFuZFJlZ2lzdGVyQ3VzdG9tVmlld0NvbnRhaW5lcnMoKTtcblx0XHR0aGlzLmhhbmRsZUFuZFJlZ2lzdGVyQ3VzdG9tVmlld3MoKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQW5kUmVnaXN0ZXJDdXN0b21WaWV3Q29udGFpbmVycygpIHtcblx0XHR2aWV3c0NvbnRhaW5lcnNFeHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCB7IGFkZGVkLCByZW1vdmVkIH0pID0+IHtcblx0XHRcdGlmIChyZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLnJlbW92ZUN1c3RvbVZpZXdDb250YWluZXJzKHJlbW92ZWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFkZGVkLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmFkZEN1c3RvbVZpZXdDb250YWluZXJzKGFkZGVkLCB0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkuYWxsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkQ3VzdG9tVmlld0NvbnRhaW5lcnMoZXh0ZW5zaW9uUG9pbnRzOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPFZpZXdDb250YWluZXJFeHRlbnNpb25Qb2ludFR5cGU+W10sIGV4aXN0aW5nVmlld0NvbnRhaW5lcnM6IFZpZXdDb250YWluZXJbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXJzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSk7XG5cdFx0bGV0IGFjdGl2aXR5QmFyT3JkZXIgPSBDVVNUT01fVklFV1NfU1RBUlRfT1JERVIgKyB2aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmFsbC5maWx0ZXIodiA9PiAhIXYuZXh0ZW5zaW9uSWQgJiYgdmlld0NvbnRhaW5lcnNSZWdpc3RyeS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odikgPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKS5sZW5ndGg7XG5cdFx0bGV0IHBhbmVsT3JkZXIgPSA1ICsgdmlld0NvbnRhaW5lcnNSZWdpc3RyeS5hbGwuZmlsdGVyKHYgPT4gISF2LmV4dGVuc2lvbklkICYmIHZpZXdDb250YWluZXJzUmVnaXN0cnkuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHYpID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpLmxlbmd0aCArIDE7XG5cdFx0Ly8gb2Zmc2V0IGJ5IDEwMCBiZWNhdXNlIHRoZSBjaGF0IHZpZXcgY29udGFpbmVyIHVzZWQgdG8gaGF2ZSBvcmRlciAxMDAgKG5vdyAxKS4gRHVlIHRvIGNhY2hpbmcsIHdlIHN0aWxsIG5lZWQgdG8gYWNjb3VudCBmb3IgdGhlIG9yaWdpbmFsIG9yZGVyIHZhbHVlXG5cdFx0bGV0IGF1eGlsaWFyeUJhck9yZGVyID0gMTAwICsgdmlld0NvbnRhaW5lcnNSZWdpc3RyeS5hbGwuZmlsdGVyKHYgPT4gISF2LmV4dGVuc2lvbklkICYmIHZpZXdDb250YWluZXJzUmVnaXN0cnkuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHYpID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKS5sZW5ndGggKyAxO1xuXHRcdGZvciAoY29uc3QgeyB2YWx1ZSwgY29sbGVjdG9yLCBkZXNjcmlwdGlvbiB9IG9mIGV4dGVuc2lvblBvaW50cykge1xuXHRcdFx0T2JqZWN0LmVudHJpZXModmFsdWUpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuaXNWYWxpZFZpZXdzQ29udGFpbmVyKHZhbHVlLCBjb2xsZWN0b3IpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN3aXRjaCAoa2V5KSB7XG5cdFx0XHRcdFx0Y2FzZSAnYWN0aXZpdHliYXInOlxuXHRcdFx0XHRcdFx0YWN0aXZpdHlCYXJPcmRlciA9IHRoaXMucmVnaXN0ZXJDdXN0b21WaWV3Q29udGFpbmVycyh2YWx1ZSwgZGVzY3JpcHRpb24sIGFjdGl2aXR5QmFyT3JkZXIsIGV4aXN0aW5nVmlld0NvbnRhaW5lcnMsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3BhbmVsJzpcblx0XHRcdFx0XHRcdHBhbmVsT3JkZXIgPSB0aGlzLnJlZ2lzdGVyQ3VzdG9tVmlld0NvbnRhaW5lcnModmFsdWUsIGRlc2NyaXB0aW9uLCBwYW5lbE9yZGVyLCBleGlzdGluZ1ZpZXdDb250YWluZXJzLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnc2Vjb25kYXJ5U2lkZWJhcic6XG5cdFx0XHRcdFx0XHRhdXhpbGlhcnlCYXJPcmRlciA9IHRoaXMucmVnaXN0ZXJDdXN0b21WaWV3Q29udGFpbmVycyh2YWx1ZSwgZGVzY3JpcHRpb24sIGF1eGlsaWFyeUJhck9yZGVyLCBleGlzdGluZ1ZpZXdDb250YWluZXJzLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUN1c3RvbVZpZXdDb250YWluZXJzKGV4dGVuc2lvblBvaW50czogcmVhZG9ubHkgSUV4dGVuc2lvblBvaW50VXNlcjxWaWV3Q29udGFpbmVyRXh0ZW5zaW9uUG9pbnRUeXBlPltdKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcnNSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KTtcblx0XHRjb25zdCByZW1vdmVkRXh0ZW5zaW9uczogRXh0ZW5zaW9uSWRlbnRpZmllclNldCA9IGV4dGVuc2lvblBvaW50cy5yZWR1Y2UoKHJlc3VsdCwgZSkgPT4geyByZXN1bHQuYWRkKGUuZGVzY3JpcHRpb24uaWRlbnRpZmllcik7IHJldHVybiByZXN1bHQ7IH0sIG5ldyBFeHRlbnNpb25JZGVudGlmaWVyU2V0KCkpO1xuXHRcdGZvciAoY29uc3Qgdmlld0NvbnRhaW5lciBvZiB2aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmFsbCkge1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXIuZXh0ZW5zaW9uSWQgJiYgcmVtb3ZlZEV4dGVuc2lvbnMuaGFzKHZpZXdDb250YWluZXIuZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdC8vIG1vdmUgYWxsIHZpZXdzIGluIHRoaXMgY29udGFpbmVyIGludG8gZGVmYXVsdCB2aWV3IGNvbnRhaW5lclxuXHRcdFx0XHRjb25zdCB2aWV3cyA9IHRoaXMudmlld3NSZWdpc3RyeS5nZXRWaWV3cyh2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0aWYgKHZpZXdzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMudmlld3NSZWdpc3RyeS5tb3ZlVmlld3Modmlld3MsIHRoaXMuZ2V0RGVmYXVsdFZpZXdDb250YWluZXIoKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5kZXJlZ2lzdGVyQ3VzdG9tVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzVmFsaWRWaWV3c0NvbnRhaW5lcih2aWV3c0NvbnRhaW5lcnNEZXNjcmlwdG9yczogSVVzZXJGcmllbmRseVZpZXdzQ29udGFpbmVyRGVzY3JpcHRvcltdLCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IpOiBib29sZWFuIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmlld3NDb250YWluZXJzRGVzY3JpcHRvcnMpKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3ZpZXdjb250YWluZXIgcmVxdWlyZWFycmF5JywgXCJ2aWV3cyBjb250YWluZXJzIG11c3QgYmUgYW4gYXJyYXlcIikpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgZGVzY3JpcHRvciBvZiB2aWV3c0NvbnRhaW5lcnNEZXNjcmlwdG9ycykge1xuXHRcdFx0aWYgKHR5cGVvZiBkZXNjcmlwdG9yLmlkICE9PSAnc3RyaW5nJyAmJiBpc0ZhbHN5T3JXaGl0ZXNwYWNlKGRlc2NyaXB0b3IuaWQpKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZWlkc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYCB3aXRoIG5vbi1lbXB0eSB2YWx1ZS4gT25seSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycywgJ18nLCBhbmQgJy0nIGFyZSBhbGxvd2VkLlwiLCAnaWQnKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICghKC9eW2EtejAtOV8tXSskL2kudGVzdChkZXNjcmlwdG9yLmlkKSkpIHtcblx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlaWRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgIHdpdGggbm9uLWVtcHR5IHZhbHVlLiBPbmx5IGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzLCAnXycsIGFuZCAnLScgYXJlIGFsbG93ZWQuXCIsICdpZCcpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBkZXNjcmlwdG9yLnRpdGxlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICd0aXRsZScpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGVvZiBkZXNjcmlwdG9yLmljb24gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZXN0cmluZycsIFwicHJvcGVydHkgYHswfWAgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2ljb24nKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0ZhbHN5T3JXaGl0ZXNwYWNlKGRlc2NyaXB0b3IudGl0bGUpKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci53YXJuKGxvY2FsaXplKCdyZXF1aXJlbm9uZW1wdHlzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgIHdpdGggbm9uLWVtcHR5IHZhbHVlXCIsICd0aXRsZScpKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQ3VzdG9tVmlld0NvbnRhaW5lcnMoY29udGFpbmVyczogSVVzZXJGcmllbmRseVZpZXdzQ29udGFpbmVyRGVzY3JpcHRvcltdLCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgb3JkZXI6IG51bWJlciwgZXhpc3RpbmdWaWV3Q29udGFpbmVyczogVmlld0NvbnRhaW5lcltdLCBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogbnVtYmVyIHtcblx0XHRjb250YWluZXJzLmZvckVhY2goZGVzY3JpcHRvciA9PiB7XG5cdFx0XHRjb25zdCB0aGVtZUljb24gPSBUaGVtZUljb24uZnJvbVN0cmluZyhkZXNjcmlwdG9yLmljb24pO1xuXG5cdFx0XHRjb25zdCBpY29uID0gdGhlbWVJY29uIHx8IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGRlc2NyaXB0b3IuaWNvbik7XG5cdFx0XHRjb25zdCBpZCA9IGB3b3JrYmVuY2gudmlldy5leHRlbnNpb24uJHtkZXNjcmlwdG9yLmlkfWA7XG5cdFx0XHRjb25zdCB0aXRsZSA9IGRlc2NyaXB0b3IudGl0bGUgfHwgaWQ7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy5yZWdpc3RlckN1c3RvbVZpZXdDb250YWluZXIoaWQsIHRpdGxlLCBpY29uLCBvcmRlcisrLCBleHRlbnNpb24uaWRlbnRpZmllciwgbG9jYXRpb24pO1xuXG5cdFx0XHQvLyBNb3ZlIHRob3NlIHZpZXdzIHRoYXQgYmVsb25ncyB0byB0aGlzIGNvbnRhaW5lclxuXHRcdFx0aWYgKGV4aXN0aW5nVmlld0NvbnRhaW5lcnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdzVG9Nb3ZlOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4aXN0aW5nVmlld0NvbnRhaW5lciBvZiBleGlzdGluZ1ZpZXdDb250YWluZXJzKSB7XG5cdFx0XHRcdFx0aWYgKHZpZXdDb250YWluZXIgIT09IGV4aXN0aW5nVmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRcdFx0dmlld3NUb01vdmUucHVzaCguLi50aGlzLnZpZXdzUmVnaXN0cnkuZ2V0Vmlld3MoZXhpc3RpbmdWaWV3Q29udGFpbmVyKS5maWx0ZXIodmlldyA9PiAodmlldyBhcyBJQ3VzdG9tVmlld0Rlc2NyaXB0b3IpLm9yaWdpbmFsQ29udGFpbmVySWQgPT09IGRlc2NyaXB0b3IuaWQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHZpZXdzVG9Nb3ZlLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMudmlld3NSZWdpc3RyeS5tb3ZlVmlld3Modmlld3NUb01vdmUsIHZpZXdDb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIG9yZGVyO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckN1c3RvbVZpZXdDb250YWluZXIoaWQ6IHN0cmluZywgdGl0bGU6IHN0cmluZywgaWNvbjogVVJJIHwgVGhlbWVJY29uLCBvcmRlcjogbnVtYmVyLCBleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllciB8IHVuZGVmaW5lZCwgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IFZpZXdDb250YWluZXIge1xuXHRcdGxldCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmdldChpZCk7XG5cblx0XHRpZiAoIXZpZXdDb250YWluZXIpIHtcblxuXHRcdFx0dmlld0NvbnRhaW5lciA9IHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dGl0bGU6IHsgdmFsdWU6IHRpdGxlLCBvcmlnaW5hbDogdGl0bGUgfSxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoXG5cdFx0XHRcdFx0Vmlld1BhbmVDb250YWluZXIsXG5cdFx0XHRcdFx0W2lkLCB7IG1lcmdlVmlld1dpdGhDb250YWluZXJXaGVuU2luZ2xlVmlldzogdHJ1ZSB9XVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRoaWRlSWZFbXB0eTogdHJ1ZSxcblx0XHRcdFx0b3JkZXIsXG5cdFx0XHRcdGljb24sXG5cdFx0XHR9LCBsb2NhdGlvbik7XG5cblx0XHR9XG5cblx0XHRyZXR1cm4gdmlld0NvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgZGVyZWdpc3RlckN1c3RvbVZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5kZXJlZ2lzdGVyVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyKTtcblx0XHRSZWdpc3RyeS5hczxQYW5lQ29tcG9zaXRlUmVnaXN0cnk+KFZpZXdsZXRFeHRlbnNpb25zLlZpZXdsZXRzKS5kZXJlZ2lzdGVyUGFuZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQW5kUmVnaXN0ZXJDdXN0b21WaWV3cygpIHtcblx0XHR2aWV3c0V4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4ge1xuXHRcdFx0aWYgKHJlbW92ZWQubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMucmVtb3ZlVmlld3MocmVtb3ZlZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWRkZWQubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuYWRkVmlld3MoYWRkZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRWaWV3cyhleHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPFZpZXdFeHRlbnNpb25Qb2ludFR5cGU+W10pOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3SWRzOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGFsbFZpZXdEZXNjcmlwdG9yczogeyB2aWV3czogSVZpZXdEZXNjcmlwdG9yW107IHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIgfVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCB7IHZhbHVlLCBjb2xsZWN0b3IgfSA9IGV4dGVuc2lvbjtcblxuXHRcdFx0T2JqZWN0LmVudHJpZXModmFsdWUpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuaXNWYWxpZFZpZXdEZXNjcmlwdG9ycyh2YWx1ZSwgY29sbGVjdG9yKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChrZXkgPT09ICdyZW1vdGUnICYmICFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24uZGVzY3JpcHRpb24sICdjb250cmliVmlld3NSZW1vdGUnKSkge1xuXHRcdFx0XHRcdGNvbGxlY3Rvci53YXJuKGxvY2FsaXplKCdWaWV3Q29udGFpbmVyUmVxdWlyZXNQcm9wb3NlZEFQSScsIFwiVmlldyBjb250YWluZXIgJ3swfScgcmVxdWlyZXMgJ2VuYWJsZWRBcGlQcm9wb3NhbHM6IFtcXFwiY29udHJpYlZpZXdzUmVtb3RlXFxcIl0nIHRvIGJlIGFkZGVkIHRvICdSZW1vdGUnLlwiLCBrZXkpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoa2V5ID09PSAnYWdlbnRTZXNzaW9ucycgJiYgIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJykpIHtcblx0XHRcdFx0XHRjb2xsZWN0b3Iud2Fybihsb2NhbGl6ZSgnUmVxdWlyZXNDaGF0U2Vzc2lvbnNQcm9wb3NlZEFQSScsIFwiVmlldyBjb250YWluZXIgJ3swfScgcmVxdWlyZXMgJ2VuYWJsZWRBcGlQcm9wb3NhbHM6IFtcXFwiY2hhdFNlc3Npb25zUHJvdmlkZXJcXFwiXScuXCIsIGtleSkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLmdldFZpZXdDb250YWluZXIoa2V5KTtcblx0XHRcdFx0aWYgKCF2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLndhcm4obG9jYWxpemUoJ1ZpZXdDb250YWluZXJEb2Vzbm90RXhpc3QnLCBcIlZpZXcgY29udGFpbmVyICd7MH0nIGRvZXMgbm90IGV4aXN0IGFuZCBhbGwgdmlld3MgcmVnaXN0ZXJlZCB0byBpdCB3aWxsIGJlIGFkZGVkIHRvICdFeHBsb3JlcicuXCIsIGtleSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHZpZXdDb250YWluZXIgfHwgdGhpcy5nZXREZWZhdWx0Vmlld0NvbnRhaW5lcigpO1xuXHRcdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnM6IElDdXN0b21WaWV3RGVzY3JpcHRvcltdID0gW107XG5cblx0XHRcdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHZhbHVlLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB2YWx1ZVtpbmRleF07XG5cdFx0XHRcdFx0Ly8gdmFsaWRhdGVcblx0XHRcdFx0XHRpZiAodmlld0lkcy5oYXMoaXRlbS5pZCkpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnZHVwbGljYXRlVmlldzEnLCBcIkNhbm5vdCByZWdpc3RlciBtdWx0aXBsZSB2aWV3cyB3aXRoIHNhbWUgaWQgYHswfWBcIiwgaXRlbS5pZCkpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0aGlzLnZpZXdzUmVnaXN0cnkuZ2V0VmlldyhpdGVtLmlkKSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdkdXBsaWNhdGVWaWV3MicsIFwiQSB2aWV3IHdpdGggaWQgYHswfWAgaXMgYWxyZWFkeSByZWdpc3RlcmVkLlwiLCBpdGVtLmlkKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBvcmRlciA9IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBjb250YWluZXIuZXh0ZW5zaW9uSWQpXG5cdFx0XHRcdFx0XHQ/IGluZGV4ICsgMVxuXHRcdFx0XHRcdFx0OiBjb250YWluZXIudmlld09yZGVyRGVsZWdhdGVcblx0XHRcdFx0XHRcdFx0PyBjb250YWluZXIudmlld09yZGVyRGVsZWdhdGUuZ2V0T3JkZXIoaXRlbS5ncm91cClcblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRsZXQgaWNvbjogVGhlbWVJY29uIHwgVVJJIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgaXRlbS5pY29uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0aWNvbiA9IFRoZW1lSWNvbi5mcm9tU3RyaW5nKGl0ZW0uaWNvbikgfHwgcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgaXRlbS5pY29uKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBpbml0aWFsVmlzaWJpbGl0eSA9IHRoaXMuY29udmVydEluaXRpYWxWaXNpYmlsaXR5KGl0ZW0udmlzaWJpbGl0eSk7XG5cblx0XHRcdFx0XHRjb25zdCB0eXBlID0gdGhpcy5nZXRWaWV3VHlwZShpdGVtLnR5cGUpO1xuXHRcdFx0XHRcdGlmICghdHlwZSkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCd1bmtub3duVmlld1R5cGUnLCBcIlVua25vd24gdmlldyB0eXBlIGB7MH1gLlwiLCBpdGVtLnR5cGUpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxldCB3ZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGl0ZW0uaW5pdGlhbFNpemUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRpZiAoY29udGFpbmVyLmV4dGVuc2lvbklkPy52YWx1ZSA9PT0gZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0d2VpZ2h0ID0gaXRlbS5pbml0aWFsU2l6ZTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGAke2V4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfSB0cmllZCB0byBzZXQgdGhlIHZpZXcgc2l6ZSBvZiAke2l0ZW0uaWR9IGJ1dCBpdCB3YXMgaWdub3JlZCBiZWNhdXNlIHRoZSB2aWV3IGNvbnRhaW5lciBkb2VzIG5vdCBiZWxvbmcgdG8gaXQuYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IGFjY2Vzc2liaWxpdHlIZWxwQ29udGVudDtcblx0XHRcdFx0XHRpZiAoaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCAnY29udHJpYkFjY2Vzc2liaWxpdHlIZWxwQ29udGVudCcpICYmIGl0ZW0uYWNjZXNzaWJpbGl0eUhlbHBDb250ZW50KSB7XG5cdFx0XHRcdFx0XHRhY2Nlc3NpYmlsaXR5SGVscENvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcoaXRlbS5hY2Nlc3NpYmlsaXR5SGVscENvbnRlbnQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJQ3VzdG9tVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdFx0XHR0eXBlOiB0eXBlLFxuXHRcdFx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IHR5cGUgPT09IFZpZXdUeXBlLlRyZWUgPyBuZXcgU3luY0Rlc2NyaXB0b3IoVHJlZVZpZXdQYW5lKSA6IG5ldyBTeW5jRGVzY3JpcHRvcihXZWJ2aWV3Vmlld1BhbmUpLFxuXHRcdFx0XHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdFx0XHRuYW1lOiB7IHZhbHVlOiBpdGVtLm5hbWUsIG9yaWdpbmFsOiBpdGVtLm5hbWUgfSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGl0ZW0ud2hlbiksXG5cdFx0XHRcdFx0XHRjb250YWluZXJJY29uOiBpY29uIHx8IHZpZXdDb250YWluZXI/Lmljb24sXG5cdFx0XHRcdFx0XHRjb250YWluZXJUaXRsZTogaXRlbS5jb250ZXh0dWFsVGl0bGUgfHwgKHZpZXdDb250YWluZXIgJiYgKHR5cGVvZiB2aWV3Q29udGFpbmVyLnRpdGxlID09PSAnc3RyaW5nJyA/IHZpZXdDb250YWluZXIudGl0bGUgOiB2aWV3Q29udGFpbmVyLnRpdGxlLnZhbHVlKSksXG5cdFx0XHRcdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0XHRcdFx0Y2FuTW92ZVZpZXc6IHZpZXdDb250YWluZXI/LmlkICE9PSBSRU1PVEUsXG5cdFx0XHRcdFx0XHR0cmVlVmlldzogdHlwZSA9PT0gVmlld1R5cGUuVHJlZSA/IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ3VzdG9tVHJlZVZpZXcsIGl0ZW0uaWQsIGl0ZW0ubmFtZSwgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y29sbGFwc2VkOiB0aGlzLnNob3dDb2xsYXBzZWQoY29udGFpbmVyKSB8fCBpbml0aWFsVmlzaWJpbGl0eSA9PT0gSW5pdGlhbFZpc2liaWxpdHkuQ29sbGFwc2VkLFxuXHRcdFx0XHRcdFx0b3JkZXI6IG9yZGVyLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxDb250YWluZXJJZDoga2V5LFxuXHRcdFx0XHRcdFx0Z3JvdXA6IGl0ZW0uZ3JvdXAsXG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogaXRlbS5yZW1vdGVOYW1lIHx8ICg8YW55Pml0ZW0pLnJlbW90ZUF1dGhvcml0eSwgLy8gVE9ET0Byb2Jsb3UgLSBkZWxldGUgYWZ0ZXIgcmVtb3RlIGV4dGVuc2lvbnMgYXJlIHVwZGF0ZWRcblx0XHRcdFx0XHRcdHZpcnR1YWxXb3Jrc3BhY2U6IGl0ZW0udmlydHVhbFdvcmtzcGFjZSxcblx0XHRcdFx0XHRcdGhpZGVCeURlZmF1bHQ6IGluaXRpYWxWaXNpYmlsaXR5ID09PSBJbml0aWFsVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2U6IHZpZXdDb250YWluZXI/LmlkID09PSBSRU1PVEUgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0d2VpZ2h0LFxuXHRcdFx0XHRcdFx0YWNjZXNzaWJpbGl0eUhlbHBDb250ZW50XG5cdFx0XHRcdFx0fTtcblxuXG5cdFx0XHRcdFx0dmlld0lkcy5hZGQodmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdFx0XHRcdHZpZXdEZXNjcmlwdG9ycy5wdXNoKHZpZXdEZXNjcmlwdG9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFsbFZpZXdEZXNjcmlwdG9ycy5wdXNoKHsgdmlld0NvbnRhaW5lcjogY29udGFpbmVyLCB2aWV3czogdmlld0Rlc2NyaXB0b3JzIH0pO1xuXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3czIoYWxsVmlld0Rlc2NyaXB0b3JzKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld1R5cGUodHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogVmlld1R5cGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0eXBlID09PSBWaWV3VHlwZS5XZWJ2aWV3KSB7XG5cdFx0XHRyZXR1cm4gVmlld1R5cGUuV2Vidmlldztcblx0XHR9XG5cdFx0aWYgKCF0eXBlIHx8IHR5cGUgPT09IFZpZXdUeXBlLlRyZWUpIHtcblx0XHRcdHJldHVybiBWaWV3VHlwZS5UcmVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0Vmlld0NvbnRhaW5lcigpOiBWaWV3Q29udGFpbmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmdldChFWFBMT1JFUikhO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVWaWV3cyhleHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPFZpZXdFeHRlbnNpb25Qb2ludFR5cGU+W10pOiB2b2lkIHtcblx0XHRjb25zdCByZW1vdmVkRXh0ZW5zaW9uczogRXh0ZW5zaW9uSWRlbnRpZmllclNldCA9IGV4dGVuc2lvbnMucmVkdWNlKChyZXN1bHQsIGUpID0+IHsgcmVzdWx0LmFkZChlLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIpOyByZXR1cm4gcmVzdWx0OyB9LCBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllclNldCgpKTtcblx0XHRmb3IgKGNvbnN0IHZpZXdDb250YWluZXIgb2YgdGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmFsbCkge1xuXHRcdFx0Y29uc3QgcmVtb3ZlZFZpZXdzID0gdGhpcy52aWV3c1JlZ2lzdHJ5LmdldFZpZXdzKHZpZXdDb250YWluZXIpLmZpbHRlcih2ID0+ICh2IGFzIElDdXN0b21WaWV3RGVzY3JpcHRvcikuZXh0ZW5zaW9uSWQgJiYgcmVtb3ZlZEV4dGVuc2lvbnMuaGFzKCh2IGFzIElDdXN0b21WaWV3RGVzY3JpcHRvcikuZXh0ZW5zaW9uSWQpKTtcblx0XHRcdGlmIChyZW1vdmVkVmlld3MubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMudmlld3NSZWdpc3RyeS5kZXJlZ2lzdGVyVmlld3MocmVtb3ZlZFZpZXdzLCB2aWV3Q29udGFpbmVyKTtcblx0XHRcdFx0Zm9yIChjb25zdCB2aWV3IG9mIHJlbW92ZWRWaWV3cykge1xuXHRcdFx0XHRcdGNvbnN0IGFueVZpZXcgPSB2aWV3IGFzIElDdXN0b21WaWV3RGVzY3JpcHRvcjtcblx0XHRcdFx0XHRpZiAoYW55Vmlldy50cmVlVmlldykge1xuXHRcdFx0XHRcdFx0YW55Vmlldy50cmVlVmlldy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb252ZXJ0SW5pdGlhbFZpc2liaWxpdHkodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IEluaXRpYWxWaXNpYmlsaXR5IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoT2JqZWN0LnZhbHVlcyhJbml0aWFsVmlzaWJpbGl0eSkuaW5jbHVkZXModmFsdWUgYXMgSW5pdGlhbFZpc2liaWxpdHkpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUgYXMgSW5pdGlhbFZpc2liaWxpdHk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGlzVmFsaWRWaWV3RGVzY3JpcHRvcnModmlld0Rlc2NyaXB0b3JzOiBJVXNlckZyaWVuZGx5Vmlld0Rlc2NyaXB0b3JbXSwgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHZpZXdEZXNjcmlwdG9ycykpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZWFycmF5JywgXCJ2aWV3cyBtdXN0IGJlIGFuIGFycmF5XCIpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGRlc2NyaXB0b3Igb2Ygdmlld0Rlc2NyaXB0b3JzKSB7XG5cdFx0XHRpZiAodHlwZW9mIGRlc2NyaXB0b3IuaWQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZXN0cmluZycsIFwicHJvcGVydHkgYHswfWAgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2lkJykpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGRlc2NyaXB0b3IubmFtZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnbmFtZScpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRlc2NyaXB0b3Iud2hlbiAmJiB0eXBlb2YgZGVzY3JpcHRvci53aGVuICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICd3aGVuJykpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGVzY3JpcHRvci5pY29uICYmIHR5cGVvZiBkZXNjcmlwdG9yLmljb24gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2ljb24nKSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChkZXNjcmlwdG9yLmNvbnRleHR1YWxUaXRsZSAmJiB0eXBlb2YgZGVzY3JpcHRvci5jb250ZXh0dWFsVGl0bGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2NvbnRleHR1YWxUaXRsZScpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRlc2NyaXB0b3IudmlzaWJpbGl0eSAmJiAhdGhpcy5jb252ZXJ0SW5pdGlhbFZpc2liaWxpdHkoZGVzY3JpcHRvci52aXNpYmlsaXR5KSkge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdGVudW0nLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb25lIG9mIHsxfVwiLCAndmlzaWJpbGl0eScsIE9iamVjdC52YWx1ZXMoSW5pdGlhbFZpc2liaWxpdHkpLmpvaW4oJywgJykpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3Q29udGFpbmVyKHZhbHVlOiBzdHJpbmcpOiBWaWV3Q29udGFpbmVyIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlICdleHBsb3Jlcic6IHJldHVybiB0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkuZ2V0KEVYUExPUkVSKTtcblx0XHRcdGNhc2UgJ2RlYnVnJzogcmV0dXJuIHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5nZXQoREVCVUcpO1xuXHRcdFx0Y2FzZSAnc2NtJzogcmV0dXJuIHRoaXMudmlld0NvbnRhaW5lcnNSZWdpc3RyeS5nZXQoU0NNKTtcblx0XHRcdGNhc2UgJ3JlbW90ZSc6IHJldHVybiB0aGlzLnZpZXdDb250YWluZXJzUmVnaXN0cnkuZ2V0KFJFTU9URSk7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gdGhpcy52aWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmdldChgd29ya2JlbmNoLnZpZXcuZXh0ZW5zaW9uLiR7dmFsdWV9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93Q29sbGFwc2VkKGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IGJvb2xlYW4ge1xuXHRcdHN3aXRjaCAoY29udGFpbmVyLmlkKSB7XG5cdFx0XHRjYXNlIEVYUExPUkVSOlxuXHRcdFx0Y2FzZSBTQ006XG5cdFx0XHRjYXNlIERFQlVHOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmNsYXNzIFZpZXdDb250YWluZXJzRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8udmlld3NDb250YWluZXJzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBjb250cmliID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/LnZpZXdzQ29udGFpbmVycyB8fCB7fTtcblxuXHRcdGNvbnN0IHZpZXdDb250YWluZXJzID0gT2JqZWN0LmtleXMoY29udHJpYikucmVkdWNlKChyZXN1bHQsIGxvY2F0aW9uKSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyc0ZvckxvY2F0aW9uID0gY29udHJpYltsb2NhdGlvbl07XG5cdFx0XHRyZXN1bHQucHVzaCguLi52aWV3Q29udGFpbmVyc0ZvckxvY2F0aW9uLm1hcCh2aWV3Q29udGFpbmVyID0+ICh7IC4uLnZpZXdDb250YWluZXIsIGxvY2F0aW9uIH0pKSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0sIFtdIGFzIEFycmF5PHsgaWQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgbG9jYXRpb246IHN0cmluZyB9Pik7XG5cblx0XHRpZiAoIXZpZXdDb250YWluZXJzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdGxvY2FsaXplKCd2aWV3IGNvbnRhaW5lciBpZCcsIFwiSURcIiksXG5cdFx0XHRsb2NhbGl6ZSgndmlldyBjb250YWluZXIgdGl0bGUnLCBcIlRpdGxlXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3ZpZXcgY29udGFpbmVyIGxvY2F0aW9uJywgXCJXaGVyZVwiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gdmlld0NvbnRhaW5lcnNcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpXG5cdFx0XHQubWFwKHZpZXdDb250YWluZXIgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdHZpZXdDb250YWluZXIuaWQsXG5cdFx0XHRcdFx0dmlld0NvbnRhaW5lci50aXRsZSxcblx0XHRcdFx0XHR2aWV3Q29udGFpbmVyLmxvY2F0aW9uXG5cdFx0XHRcdF07XG5cdFx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdHJvd3Ncblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFZpZXdzRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8udmlld3M7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IGNvbnRyaWIgPSBtYW5pZmVzdC5jb250cmlidXRlcz8udmlld3MgfHwge307XG5cblx0XHRjb25zdCB2aWV3cyA9IE9iamVjdC5rZXlzKGNvbnRyaWIpLnJlZHVjZSgocmVzdWx0LCBsb2NhdGlvbikgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld3NGb3JMb2NhdGlvbiA9IGNvbnRyaWJbbG9jYXRpb25dO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4udmlld3NGb3JMb2NhdGlvbi5tYXAodmlldyA9PiAoeyAuLi52aWV3LCBsb2NhdGlvbiB9KSkpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCBbXSBhcyBBcnJheTx7IGlkOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgbG9jYXRpb246IHN0cmluZyB9Pik7XG5cblx0XHRpZiAoIXZpZXdzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdGxvY2FsaXplKCd2aWV3IGlkJywgXCJJRFwiKSxcblx0XHRcdGxvY2FsaXplKCd2aWV3IG5hbWUgdGl0bGUnLCBcIk5hbWVcIiksXG5cdFx0XHRsb2NhbGl6ZSgndmlldyBjb250YWluZXIgbG9jYXRpb24nLCBcIldoZXJlXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSB2aWV3c1xuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSlcblx0XHRcdC5tYXAodmlldyA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0dmlldy5pZCxcblx0XHRcdFx0XHR2aWV3Lm5hbWUsXG5cdFx0XHRcdFx0dmlldy5sb2NhdGlvblxuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeUV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICd2aWV3c0NvbnRhaW5lcnMnLFxuXHRsYWJlbDogbG9jYWxpemUoJ3ZpZXdzQ29udGFpbmVycycsIFwiVmlldyBDb250YWluZXJzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoVmlld0NvbnRhaW5lcnNEYXRhUmVuZGVyZXIpLFxufSk7XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5RXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ3ZpZXdzJyxcblx0bGFiZWw6IGxvY2FsaXplKCd2aWV3cycsIFwiVmlld3NcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihWaWV3c0RhdGFSZW5kZXJlciksXG59KTtcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFZpZXdzRXh0ZW5zaW9uSGFuZGxlci5JRCwgVmlld3NFeHRlbnNpb25IYW5kbGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGtCQUFrQjtBQUMzQixZQUFZLGVBQWU7QUFDM0IsU0FBUywy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O0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxHQUErQixvQ0FBb0MseUJBQXlCLEVBQUUseUJBQXlCO0FBQUEsRUFDL0gsSUFBSTtBQUFBLEVBQ0osT0FBTyxTQUFTLG1CQUFtQixpQkFBaUI7QUFBQSxFQUNwRCxRQUFRO0FBQUEsSUFDUCxXQUFXO0FBQUEsRUFDWjtBQUFBLEVBQ0EsVUFBVSxJQUFJLGVBQWUsMEJBQTBCO0FBQ3hELENBQUM7QUFFRCxTQUFTLEdBQStCLG9DQUFvQyx5QkFBeUIsRUFBRSx5QkFBeUI7QUFBQSxFQUMvSCxJQUFJO0FBQUEsRUFDSixPQUFPLFNBQVMsU0FBUyxPQUFPO0FBQUEsRUFDaEMsUUFBUTtBQUFBLElBQ1AsV0FBVztBQUFBLEVBQ1o7QUFBQSxFQUNBLFVBQVUsSUFBSSxlQUFlLGlCQUFpQjtBQUMvQyxDQUFDO0FBRUQsK0JBQStCLHNCQUFzQixJQUFJLHVCQUF1QixlQUFlLFlBQVk7IiwKICAibmFtZXMiOiBbIlZpZXdUeXBlIiwgIkluaXRpYWxWaXNpYmlsaXR5IiwgInZpZXdEZXNjcmlwdG9yIiwgInZhbHVlIl0KfQo=
