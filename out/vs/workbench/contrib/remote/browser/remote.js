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
import "./media/remoteViewlet.css";
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { URI } from "../../../../base/common/uri.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IExtensionService, isProposedApiEnabled } from "../../../services/extensions/common/extensions.js";
import { FilterViewPaneContainer } from "../../../browser/parts/views/viewsViewlet.js";
import { VIEWLET_ID } from "./remoteExplorer.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { Extensions, ViewContainerLocation, IViewDescriptorService } from "../../../common/views.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { PersistentConnectionEventType } from "../../../../platform/remote/common/remoteAgentConnection.js";
import Severity from "../../../../base/common/severity.js";
import { ReloadWindowAction } from "../../../browser/actions/windowActions.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { SwitchRemoteViewItem } from "./explorerViewItems.js";
import { isStringArray } from "../../../../base/common/types.js";
import { IRemoteExplorerService } from "../../../services/remote/common/remoteExplorerService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import * as icons from "./remoteIcons.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
import { getRemoteName } from "../../../../platform/remote/common/remoteHosts.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IWalkthroughsService } from "../../welcomeGettingStarted/browser/gettingStartedService.js";
import { Schemas } from "../../../../base/common/network.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
class HelpTreeVirtualDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    return "HelpItemTemplate";
  }
}
class HelpTreeRenderer {
  constructor() {
    this.templateId = "HelpItemTemplate";
  }
  renderTemplate(container) {
    container.classList.add("remote-help-tree-node-item");
    const icon = dom.append(container, dom.$(".remote-help-tree-node-item-icon"));
    const parent = container;
    return { parent, icon };
  }
  renderElement(element, index, templateData) {
    const container = templateData.parent;
    dom.append(container, templateData.icon);
    templateData.icon.classList.add(...element.element.iconClasses);
    const labelContainer = dom.append(container, dom.$(".help-item-label"));
    labelContainer.innerText = element.element.label;
  }
  disposeTemplate(templateData) {
  }
}
class HelpDataSource {
  hasChildren(element) {
    return element instanceof HelpModel;
  }
  getChildren(element) {
    if (element instanceof HelpModel && element.items) {
      return element.items;
    }
    return [];
  }
}
class HelpModel extends Disposable {
  constructor(viewModel, openerService, quickInputService, commandService, remoteExplorerService, environmentService, workspaceContextService, walkthroughsService) {
    super();
    this.viewModel = viewModel;
    this.openerService = openerService;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.remoteExplorerService = remoteExplorerService;
    this.environmentService = environmentService;
    this.workspaceContextService = workspaceContextService;
    this.walkthroughsService = walkthroughsService;
    this.updateItems();
    this._register(viewModel.onDidChangeHelpInformation(() => this.updateItems()));
  }
  createHelpItemValue(info, infoKey) {
    return new HelpItemValue(
      this.commandService,
      this.walkthroughsService,
      info.extensionDescription,
      typeof info.remoteName === "string" ? [info.remoteName] : info.remoteName,
      info.virtualWorkspace,
      info[infoKey]
    );
  }
  updateItems() {
    const helpItems = [];
    const getStarted = this.viewModel.helpInformation.filter((info) => info.getStarted);
    if (getStarted.length) {
      const helpItemValues = getStarted.map((info) => this.createHelpItemValue(info, "getStarted"));
      const getStartedHelpItem = this.items?.find((item) => item.icon === icons.getStartedIcon) ?? new GetStartedHelpItem(
        icons.getStartedIcon,
        nls.localize("remote.help.getStarted", "Get Started"),
        helpItemValues,
        this.quickInputService,
        this.environmentService,
        this.openerService,
        this.remoteExplorerService,
        this.workspaceContextService,
        this.commandService
      );
      getStartedHelpItem.values = helpItemValues;
      helpItems.push(getStartedHelpItem);
    }
    const documentation = this.viewModel.helpInformation.filter((info) => info.documentation);
    if (documentation.length) {
      const helpItemValues = documentation.map((info) => this.createHelpItemValue(info, "documentation"));
      const documentationHelpItem = this.items?.find((item) => item.icon === icons.documentationIcon) ?? new HelpItem(
        icons.documentationIcon,
        nls.localize("remote.help.documentation", "Read Documentation"),
        helpItemValues,
        this.quickInputService,
        this.environmentService,
        this.openerService,
        this.remoteExplorerService,
        this.workspaceContextService
      );
      documentationHelpItem.values = helpItemValues;
      helpItems.push(documentationHelpItem);
    }
    const issues = this.viewModel.helpInformation.filter((info) => info.issues);
    if (issues.length) {
      const helpItemValues = issues.map((info) => this.createHelpItemValue(info, "issues"));
      const reviewIssuesHelpItem = this.items?.find((item) => item.icon === icons.reviewIssuesIcon) ?? new HelpItem(
        icons.reviewIssuesIcon,
        nls.localize("remote.help.issues", "Review Issues"),
        helpItemValues,
        this.quickInputService,
        this.environmentService,
        this.openerService,
        this.remoteExplorerService,
        this.workspaceContextService
      );
      reviewIssuesHelpItem.values = helpItemValues;
      helpItems.push(reviewIssuesHelpItem);
    }
    if (helpItems.length) {
      const helpItemValues = this.viewModel.helpInformation.map((info) => this.createHelpItemValue(info, "reportIssue"));
      const issueReporterItem = this.items?.find((item) => item.icon === icons.reportIssuesIcon) ?? new IssueReporterItem(
        icons.reportIssuesIcon,
        nls.localize("remote.help.report", "Report Issue"),
        helpItemValues,
        this.quickInputService,
        this.environmentService,
        this.commandService,
        this.openerService,
        this.remoteExplorerService,
        this.workspaceContextService
      );
      issueReporterItem.values = helpItemValues;
      helpItems.push(issueReporterItem);
    }
    if (helpItems.length) {
      this.items = helpItems;
    }
  }
}
class HelpItemValue {
  constructor(commandService, walkthroughService, extensionDescription, remoteAuthority, virtualWorkspace, urlOrCommandOrId) {
    this.commandService = commandService;
    this.walkthroughService = walkthroughService;
    this.extensionDescription = extensionDescription;
    this.remoteAuthority = remoteAuthority;
    this.virtualWorkspace = virtualWorkspace;
    this.urlOrCommandOrId = urlOrCommandOrId;
  }
  get description() {
    return this.getUrl().then(() => this._description);
  }
  get url() {
    return this.getUrl();
  }
  async getUrl() {
    if (this._url === void 0) {
      if (typeof this.urlOrCommandOrId === "string") {
        const url = URI.parse(this.urlOrCommandOrId);
        if (url.authority) {
          this._url = this.urlOrCommandOrId;
        } else {
          const urlCommand = this.commandService.executeCommand(this.urlOrCommandOrId).then((result) => {
            this._url = result;
            return this._url;
          });
          const emptyString = new Promise((resolve) => setTimeout(() => resolve(""), 500));
          this._url = await Promise.race([urlCommand, emptyString]);
        }
      } else if (this.urlOrCommandOrId?.id) {
        try {
          const walkthroughId = `${this.extensionDescription.id}#${this.urlOrCommandOrId.id}`;
          const walkthrough = await this.walkthroughService.getWalkthrough(walkthroughId);
          this._description = walkthrough.title;
          this._url = walkthroughId;
        } catch {
        }
      }
    }
    if (this._url === void 0) {
      this._url = "";
    }
    return this._url;
  }
}
class HelpItemBase {
  constructor(icon, label, values, quickInputService, environmentService, remoteExplorerService, workspaceContextService) {
    this.icon = icon;
    this.label = label;
    this.values = values;
    this.quickInputService = quickInputService;
    this.environmentService = environmentService;
    this.remoteExplorerService = remoteExplorerService;
    this.workspaceContextService = workspaceContextService;
    this.iconClasses = [];
    this.iconClasses.push(...ThemeIcon.asClassNameArray(icon));
    this.iconClasses.push("remote-help-tree-node-item-icon");
  }
  async getActions() {
    return (await Promise.all(this.values.map(async (value) => {
      return {
        label: value.extensionDescription.displayName || value.extensionDescription.identifier.value,
        description: await value.description ?? await value.url,
        url: await value.url,
        extensionDescription: value.extensionDescription
      };
    }))).filter((item) => item.description);
  }
  async handleClick() {
    const remoteAuthority = this.environmentService.remoteAuthority;
    if (remoteAuthority) {
      for (let i = 0; i < this.remoteExplorerService.targetType.length; i++) {
        if (remoteAuthority.startsWith(this.remoteExplorerService.targetType[i])) {
          for (const value of this.values) {
            if (value.remoteAuthority) {
              for (const authority of value.remoteAuthority) {
                if (remoteAuthority.startsWith(authority)) {
                  await this.takeAction(value.extensionDescription, await value.url);
                  return;
                }
              }
            }
          }
        }
      }
    } else {
      const virtualWorkspace = getVirtualWorkspaceLocation(this.workspaceContextService.getWorkspace())?.scheme;
      if (virtualWorkspace) {
        for (let i = 0; i < this.remoteExplorerService.targetType.length; i++) {
          for (const value of this.values) {
            if (value.virtualWorkspace && value.remoteAuthority) {
              for (const authority of value.remoteAuthority) {
                if (this.remoteExplorerService.targetType[i].startsWith(authority) && virtualWorkspace.startsWith(value.virtualWorkspace)) {
                  await this.takeAction(value.extensionDescription, await value.url);
                  return;
                }
              }
            }
          }
        }
      }
    }
    if (this.values.length > 1) {
      const actions = await this.getActions();
      if (actions.length) {
        const action = await this.quickInputService.pick(actions, { placeHolder: nls.localize("pickRemoteExtension", "Select url to open") });
        if (action) {
          await this.takeAction(action.extensionDescription, action.url);
        }
      }
    } else {
      await this.takeAction(this.values[0].extensionDescription, await this.values[0].url);
    }
  }
}
class GetStartedHelpItem extends HelpItemBase {
  constructor(icon, label, values, quickInputService, environmentService, openerService, remoteExplorerService, workspaceContextService, commandService) {
    super(icon, label, values, quickInputService, environmentService, remoteExplorerService, workspaceContextService);
    this.openerService = openerService;
    this.commandService = commandService;
  }
  async takeAction(extensionDescription, urlOrWalkthroughId) {
    if ([Schemas.http, Schemas.https].includes(URI.parse(urlOrWalkthroughId).scheme)) {
      this.openerService.open(urlOrWalkthroughId, { allowCommands: true });
      return;
    }
    this.commandService.executeCommand("workbench.action.openWalkthrough", urlOrWalkthroughId);
  }
}
class HelpItem extends HelpItemBase {
  constructor(icon, label, values, quickInputService, environmentService, openerService, remoteExplorerService, workspaceContextService) {
    super(icon, label, values, quickInputService, environmentService, remoteExplorerService, workspaceContextService);
    this.openerService = openerService;
  }
  async takeAction(extensionDescription, url) {
    await this.openerService.open(URI.parse(url), { allowCommands: true });
  }
}
class IssueReporterItem extends HelpItemBase {
  constructor(icon, label, values, quickInputService, environmentService, commandService, openerService, remoteExplorerService, workspaceContextService) {
    super(icon, label, values, quickInputService, environmentService, remoteExplorerService, workspaceContextService);
    this.commandService = commandService;
    this.openerService = openerService;
  }
  async getActions() {
    return Promise.all(this.values.map(async (value) => {
      return {
        label: value.extensionDescription.displayName || value.extensionDescription.identifier.value,
        description: "",
        url: await value.url,
        extensionDescription: value.extensionDescription
      };
    }));
  }
  async takeAction(extensionDescription, url) {
    if (!url) {
      await this.commandService.executeCommand("workbench.action.openIssueReporter", [extensionDescription.identifier.value]);
    } else {
      await this.openerService.open(URI.parse(url));
    }
  }
}
let HelpPanel = class extends ViewPane {
  constructor(viewModel, options, keybindingService, contextMenuService, contextKeyService, configurationService, instantiationService, viewDescriptorService, openerService, quickInputService, commandService, remoteExplorerService, environmentService, themeService, hoverService, workspaceContextService, walkthroughsService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.viewModel = viewModel;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.remoteExplorerService = remoteExplorerService;
    this.environmentService = environmentService;
    this.workspaceContextService = workspaceContextService;
    this.walkthroughsService = walkthroughsService;
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("remote-help");
    const treeContainer = document.createElement("div");
    treeContainer.classList.add("remote-help-content");
    container.appendChild(treeContainer);
    this.tree = this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "RemoteHelp",
      treeContainer,
      new HelpTreeVirtualDelegate(),
      [new HelpTreeRenderer()],
      new HelpDataSource(),
      {
        accessibilityProvider: {
          getAriaLabel: (item) => {
            return item.label;
          },
          getWidgetAriaLabel: () => nls.localize("remotehelp", "Remote Help")
        }
      }
    );
    const model = this._register(new HelpModel(this.viewModel, this.openerService, this.quickInputService, this.commandService, this.remoteExplorerService, this.environmentService, this.workspaceContextService, this.walkthroughsService));
    this.tree.setInput(model);
    this._register(Event.debounce(this.tree.onDidOpen, (last, event) => event, 75, true)((e) => {
      e.element?.handleClick();
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.layout(height, width);
  }
};
HelpPanel.ID = "~remote.helpPanel";
HelpPanel.TITLE = nls.localize2("remote.help", "Help and feedback");
HelpPanel = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IViewDescriptorService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IQuickInputService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IRemoteExplorerService),
  __decorateParam(12, IWorkbenchEnvironmentService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IWorkspaceContextService),
  __decorateParam(16, IWalkthroughsService)
], HelpPanel);
class HelpPanelDescriptor {
  constructor(viewModel) {
    this.id = HelpPanel.ID;
    this.name = HelpPanel.TITLE;
    this.canToggleVisibility = true;
    this.hideByDefault = false;
    this.group = "help@50";
    this.order = -10;
    this.ctorDescriptor = new SyncDescriptor(HelpPanel, [viewModel]);
  }
}
let RemoteViewPaneContainer = class extends FilterViewPaneContainer {
  constructor(layoutService, telemetryService, contextService, storageService, configurationService, instantiationService, themeService, contextMenuService, extensionService, remoteExplorerService, viewDescriptorService, logService) {
    super(VIEWLET_ID, remoteExplorerService.onDidChangeTargetType, configurationService, layoutService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService, viewDescriptorService, logService);
    this.remoteExplorerService = remoteExplorerService;
    this.helpPanelDescriptor = new HelpPanelDescriptor(this);
    this.helpInformation = [];
    this._onDidChangeHelpInformation = this._register(new Emitter());
    this.onDidChangeHelpInformation = this._onDidChangeHelpInformation.event;
    this.hasRegisteredHelpView = false;
    this.addConstantViewDescriptors([this.helpPanelDescriptor]);
    this._register(this.remoteSwitcher = this.instantiationService.createInstance(SwitchRemoteViewItem));
    this._register(this.remoteExplorerService.onDidChangeHelpInformation((extensions) => {
      this._setHelpInformation(extensions);
    }));
    this._setHelpInformation(this.remoteExplorerService.helpInformation);
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    this.remoteSwitcher.createOptionItems(viewsRegistry.getViews(this.viewContainer));
    this._register(viewsRegistry.onViewsRegistered((e) => {
      const remoteViews = [];
      for (const view of e) {
        if (view.viewContainer.id === VIEWLET_ID) {
          remoteViews.push(...view.views);
        }
      }
      if (remoteViews.length > 0) {
        this.remoteSwitcher.createOptionItems(remoteViews);
      }
    }));
    this._register(viewsRegistry.onViewsDeregistered((e) => {
      if (e.viewContainer.id === VIEWLET_ID) {
        this.remoteSwitcher.removeOptionItems(e.views);
      }
    }));
  }
  _setHelpInformation(extensions) {
    const helpInformation = [];
    for (const extension of extensions) {
      this._handleRemoteInfoExtensionPoint(extension, helpInformation);
    }
    this.helpInformation = helpInformation;
    this._onDidChangeHelpInformation.fire();
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    if (this.helpInformation.length && !this.hasRegisteredHelpView) {
      const view = viewsRegistry.getView(this.helpPanelDescriptor.id);
      if (!view) {
        viewsRegistry.registerViews([this.helpPanelDescriptor], this.viewContainer);
      }
      this.hasRegisteredHelpView = true;
    } else if (this.hasRegisteredHelpView) {
      viewsRegistry.deregisterViews([this.helpPanelDescriptor], this.viewContainer);
      this.hasRegisteredHelpView = false;
    }
  }
  _handleRemoteInfoExtensionPoint(extension, helpInformation) {
    if (!isProposedApiEnabled(extension.description, "contribRemoteHelp")) {
      return;
    }
    if (!extension.value.documentation && !extension.value.getStarted && !extension.value.issues) {
      return;
    }
    helpInformation.push({
      extensionDescription: extension.description,
      getStarted: extension.value.getStarted,
      documentation: extension.value.documentation,
      reportIssue: extension.value.reportIssue,
      issues: extension.value.issues,
      remoteName: extension.value.remoteName,
      virtualWorkspace: extension.value.virtualWorkspace
    });
  }
  getFilterOn(viewDescriptor) {
    return isStringArray(viewDescriptor.remoteAuthority) ? viewDescriptor.remoteAuthority[0] : viewDescriptor.remoteAuthority;
  }
  setFilter(viewDescriptor) {
    this.remoteExplorerService.targetType = isStringArray(viewDescriptor.remoteAuthority) ? viewDescriptor.remoteAuthority : [viewDescriptor.remoteAuthority];
  }
  getTitle() {
    const title = nls.localize("remote.explorer", "Remote Explorer");
    return title;
  }
};
RemoteViewPaneContainer = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IExtensionService),
  __decorateParam(9, IRemoteExplorerService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, ILogService)
], RemoteViewPaneContainer);
Registry.as(Extensions.ViewContainersRegistry).registerViewContainer(
  {
    id: VIEWLET_ID,
    title: nls.localize2("remote.explorer", "Remote Explorer"),
    ctorDescriptor: new SyncDescriptor(RemoteViewPaneContainer),
    hideIfEmpty: true,
    viewOrderDelegate: {
      getOrder: (group) => {
        if (!group) {
          return;
        }
        let matches = /^targets@(\d+)$/.exec(group);
        if (matches) {
          return -1e3;
        }
        matches = /^details(@(\d+))?$/.exec(group);
        if (matches) {
          return -500 + Number(matches[2]);
        }
        matches = /^help(@(\d+))?$/.exec(group);
        if (matches) {
          return -10;
        }
        return;
      }
    },
    icon: icons.remoteExplorerViewIcon,
    order: 4
  },
  ViewContainerLocation.Sidebar
);
let RemoteMarkers = class {
  constructor(remoteAgentService, timerService) {
    remoteAgentService.getEnvironment().then((remoteEnv) => {
      if (remoteEnv) {
        timerService.setPerformanceMarks("server", remoteEnv.marks);
      }
    });
  }
};
RemoteMarkers = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, ITimerService)
], RemoteMarkers);
class VisibleProgress {
  get lastReport() {
    return this._lastReport;
  }
  constructor(progressService, location, initialReport, buttons, onDidCancel) {
    this.location = location;
    this._isDisposed = false;
    this._lastReport = initialReport;
    this._currentProgressPromiseResolve = null;
    this._currentProgress = null;
    this._currentTimer = null;
    const promise = new Promise((resolve) => this._currentProgressPromiseResolve = resolve);
    progressService.withProgress(
      { location, buttons },
      (progress) => {
        if (!this._isDisposed) {
          this._currentProgress = progress;
        }
        return promise;
      },
      (choice) => onDidCancel(choice, this._lastReport)
    );
    if (this._lastReport) {
      this.report();
    }
  }
  dispose() {
    this._isDisposed = true;
    if (this._currentProgressPromiseResolve) {
      this._currentProgressPromiseResolve();
      this._currentProgressPromiseResolve = null;
    }
    this._currentProgress = null;
    if (this._currentTimer) {
      this._currentTimer.dispose();
      this._currentTimer = null;
    }
  }
  report(message) {
    if (message) {
      this._lastReport = message;
    }
    if (this._lastReport && this._currentProgress) {
      this._currentProgress.report({ message: this._lastReport });
    }
  }
  startTimer(completionTime) {
    this.stopTimer();
    this._currentTimer = new ReconnectionTimer(this, completionTime);
  }
  stopTimer() {
    if (this._currentTimer) {
      this._currentTimer.dispose();
      this._currentTimer = null;
    }
  }
}
class ReconnectionTimer {
  constructor(parent, completionTime) {
    this._parent = parent;
    this._completionTime = completionTime;
    this._renderInterval = dom.disposableWindowInterval(mainWindow, () => this._render(), 1e3);
    this._render();
  }
  dispose() {
    this._renderInterval.dispose();
  }
  _render() {
    const remainingTimeMs = this._completionTime - Date.now();
    if (remainingTimeMs < 0) {
      return;
    }
    const remainingTime = Math.ceil(remainingTimeMs / 1e3);
    if (remainingTime === 1) {
      this._parent.report(nls.localize("reconnectionWaitOne", "Attempting to reconnect in {0} second...", remainingTime));
    } else {
      this._parent.report(nls.localize("reconnectionWaitMany", "Attempting to reconnect in {0} seconds...", remainingTime));
    }
  }
}
const DISCONNECT_PROMPT_TIME = 40 * 1e3;
let RemoteAgentConnectionStatusListener = class extends Disposable {
  constructor(remoteAgentService, progressService, dialogService, commandService, quickInputService, logService, environmentService, telemetryService) {
    super();
    this._reloadWindowShown = false;
    const connection = remoteAgentService.getConnection();
    if (connection) {
      let showProgress2 = function(location, buttons, initialReport = null) {
        if (visibleProgress) {
          visibleProgress.dispose();
          visibleProgress = null;
        }
        if (!location) {
          location = quickInputVisible ? ProgressLocation.Notification : ProgressLocation.Dialog;
        }
        return new VisibleProgress(
          progressService,
          location,
          initialReport,
          buttons.map((button) => button.label),
          (choice, lastReport) => {
            if (typeof choice !== "undefined" && buttons[choice]) {
              buttons[choice].callback();
            } else {
              if (location === ProgressLocation.Dialog) {
                visibleProgress = showProgress2(ProgressLocation.Notification, buttons, lastReport);
              } else {
                hideProgress2();
              }
            }
          }
        );
      }, hideProgress2 = function() {
        if (visibleProgress) {
          visibleProgress.dispose();
          visibleProgress = null;
        }
      };
      var showProgress = showProgress2, hideProgress = hideProgress2;
      let quickInputVisible = false;
      this._register(quickInputService.onShow(() => quickInputVisible = true));
      this._register(quickInputService.onHide(() => quickInputVisible = false));
      let visibleProgress = null;
      let reconnectWaitEvent = null;
      const disposableListener = this._register(new MutableDisposable());
      let reconnectionToken = "";
      let lastIncomingDataTime = 0;
      let reconnectionAttempts = 0;
      const reconnectButton = {
        label: nls.localize("reconnectNow", "Reconnect Now"),
        callback: () => {
          reconnectWaitEvent?.skipWait();
        }
      };
      const reloadButton = {
        label: nls.localize("reloadWindow", "Reload Window"),
        callback: () => {
          telemetryService.publicLog2("remoteReconnectionReload", {
            remoteName: getRemoteName(environmentService.remoteAuthority),
            reconnectionToken,
            millisSinceLastIncomingData: Date.now() - lastIncomingDataTime,
            attempt: reconnectionAttempts
          });
          commandService.executeCommand(ReloadWindowAction.ID);
        }
      };
      this._register(connection.onDidStateChange((e) => {
        visibleProgress?.stopTimer();
        disposableListener.clear();
        switch (e.type) {
          case PersistentConnectionEventType.ConnectionLost:
            reconnectionToken = e.reconnectionToken;
            lastIncomingDataTime = Date.now() - e.millisSinceLastIncomingData;
            reconnectionAttempts = 0;
            telemetryService.publicLog2("remoteConnectionLost", {
              remoteName: getRemoteName(environmentService.remoteAuthority),
              reconnectionToken: e.reconnectionToken
            });
            if (visibleProgress || e.millisSinceLastIncomingData > DISCONNECT_PROMPT_TIME) {
              if (!visibleProgress) {
                visibleProgress = showProgress2(null, [reconnectButton, reloadButton]);
              }
              visibleProgress.report(nls.localize("connectionLost", "Connection Lost"));
            }
            break;
          case PersistentConnectionEventType.ReconnectionWait:
            if (visibleProgress) {
              reconnectWaitEvent = e;
              visibleProgress = showProgress2(null, [reconnectButton, reloadButton]);
              visibleProgress.startTimer(Date.now() + 1e3 * e.durationSeconds);
            }
            break;
          case PersistentConnectionEventType.ReconnectionRunning:
            reconnectionToken = e.reconnectionToken;
            lastIncomingDataTime = Date.now() - e.millisSinceLastIncomingData;
            reconnectionAttempts = e.attempt;
            telemetryService.publicLog2("remoteReconnectionRunning", {
              remoteName: getRemoteName(environmentService.remoteAuthority),
              reconnectionToken: e.reconnectionToken,
              millisSinceLastIncomingData: e.millisSinceLastIncomingData,
              attempt: e.attempt
            });
            if (visibleProgress || e.millisSinceLastIncomingData > DISCONNECT_PROMPT_TIME) {
              visibleProgress = showProgress2(null, [reloadButton]);
              visibleProgress.report(nls.localize("reconnectionRunning", "Disconnected. Attempting to reconnect..."));
              disposableListener.value = quickInputService.onShow(() => {
                if (visibleProgress && visibleProgress.location === ProgressLocation.Dialog) {
                  visibleProgress = showProgress2(ProgressLocation.Notification, [reloadButton], visibleProgress.lastReport);
                }
              });
            }
            break;
          case PersistentConnectionEventType.ReconnectionPermanentFailure:
            reconnectionToken = e.reconnectionToken;
            lastIncomingDataTime = Date.now() - e.millisSinceLastIncomingData;
            reconnectionAttempts = e.attempt;
            telemetryService.publicLog2("remoteReconnectionPermanentFailure", {
              remoteName: getRemoteName(environmentService.remoteAuthority),
              reconnectionToken: e.reconnectionToken,
              millisSinceLastIncomingData: e.millisSinceLastIncomingData,
              attempt: e.attempt,
              handled: e.handled
            });
            hideProgress2();
            if (e.handled) {
              logService.info(`Error handled: Not showing a notification for the error.`);
            } else if (!this._reloadWindowShown) {
              this._reloadWindowShown = true;
              dialogService.confirm({
                type: Severity.Error,
                message: nls.localize("reconnectionPermanentFailure", "Cannot reconnect. Please reload the window."),
                primaryButton: nls.localize({ key: "reloadWindow.dialog", comment: ["&& denotes a mnemonic"] }, "&&Reload Window")
              }).then((result) => {
                if (result.confirmed) {
                  commandService.executeCommand(ReloadWindowAction.ID);
                }
              });
            }
            break;
          case PersistentConnectionEventType.ConnectionGain:
            reconnectionToken = e.reconnectionToken;
            lastIncomingDataTime = Date.now() - e.millisSinceLastIncomingData;
            reconnectionAttempts = e.attempt;
            telemetryService.publicLog2("remoteConnectionGain", {
              remoteName: getRemoteName(environmentService.remoteAuthority),
              reconnectionToken: e.reconnectionToken,
              millisSinceLastIncomingData: e.millisSinceLastIncomingData,
              attempt: e.attempt
            });
            hideProgress2();
            break;
        }
      }));
    }
  }
};
RemoteAgentConnectionStatusListener = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, IProgressService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, ITelemetryService)
], RemoteAgentConnectionStatusListener);
export {
  RemoteAgentConnectionStatusListener,
  RemoteMarkers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3JlbW90ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9yZW1vdGVWaWV3bGV0LmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBGaWx0ZXJWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IFZJRVdMRVRfSUQgfSBmcm9tICcuL3JlbW90ZUV4cGxvcmVyLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yLCBJVmlld3NSZWdpc3RyeSwgRXh0ZW5zaW9ucywgVmlld0NvbnRhaW5lckxvY2F0aW9uLCBJVmlld0NvbnRhaW5lcnNSZWdpc3RyeSwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTdGVwLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFJlY29ubmVjdGlvbldhaXRFdmVudCwgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50Q29ubmVjdGlvbi5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgUmVsb2FkV2luZG93QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dpbmRvd0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN3aXRjaFJlbW90ZVZpZXdJdGVtIH0gZnJvbSAnLi9leHBsb3JlclZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZ0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSGVscEluZm9ybWF0aW9uLCBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHBsb3JlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJVHJlZVJlbmRlcmVyLCBJVHJlZU5vZGUsIElBc3luY0RhdGFTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Qb2ludFVzZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuL3JlbW90ZUljb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRpbWVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RpbWVyL2Jyb3dzZXIvdGltZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFJlbW90ZU5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUhvc3RzLmpzJztcbmltcG9ydCB7IGdldFZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV2Fsa3Rocm91Z2hzU2VydmljZSB9IGZyb20gJy4uLy4uL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9icm93c2VyL2dldHRpbmdTdGFydGVkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmludGVyZmFjZSBJVmlld01vZGVsIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIZWxwSW5mb3JtYXRpb246IEV2ZW50PHZvaWQ+O1xuXHRoZWxwSW5mb3JtYXRpb246IEhlbHBJbmZvcm1hdGlvbltdO1xufVxuXG5jbGFzcyBIZWxwVHJlZVZpcnR1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElIZWxwSXRlbT4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSUhlbHBJdGVtKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElIZWxwSXRlbSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdIZWxwSXRlbVRlbXBsYXRlJztcblx0fVxufVxuXG5pbnRlcmZhY2UgSUhlbHBJdGVtVGVtcGxhdGVEYXRhIHtcblx0cGFyZW50OiBIVE1MRWxlbWVudDtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG59XG5cbmNsYXNzIEhlbHBUcmVlUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPEhlbHBNb2RlbCB8IElIZWxwSXRlbSwgSUhlbHBJdGVtLCBJSGVscEl0ZW1UZW1wbGF0ZURhdGE+IHtcblx0dGVtcGxhdGVJZDogc3RyaW5nID0gJ0hlbHBJdGVtVGVtcGxhdGUnO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJSGVscEl0ZW1UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdyZW1vdGUtaGVscC10cmVlLW5vZGUtaXRlbScpO1xuXHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5yZW1vdGUtaGVscC10cmVlLW5vZGUtaXRlbS1pY29uJykpO1xuXHRcdGNvbnN0IHBhcmVudCA9IGNvbnRhaW5lcjtcblx0XHRyZXR1cm4geyBwYXJlbnQsIGljb24gfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPElIZWxwSXRlbSwgSUhlbHBJdGVtPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJSGVscEl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0ZW1wbGF0ZURhdGEucGFyZW50O1xuXHRcdGRvbS5hcHBlbmQoY29udGFpbmVyLCB0ZW1wbGF0ZURhdGEuaWNvbik7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NMaXN0LmFkZCguLi5lbGVtZW50LmVsZW1lbnQuaWNvbkNsYXNzZXMpO1xuXHRcdGNvbnN0IGxhYmVsQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuaGVscC1pdGVtLWxhYmVsJykpO1xuXHRcdGxhYmVsQ29udGFpbmVyLmlubmVyVGV4dCA9IGVsZW1lbnQuZWxlbWVudC5sYWJlbDtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElIZWxwSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXG5cdH1cbn1cblxuY2xhc3MgSGVscERhdGFTb3VyY2UgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPEhlbHBNb2RlbCwgSUhlbHBJdGVtPiB7XG5cdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IEhlbHBNb2RlbCkge1xuXHRcdHJldHVybiBlbGVtZW50IGluc3RhbmNlb2YgSGVscE1vZGVsO1xuXHR9XG5cblx0Z2V0Q2hpbGRyZW4oZWxlbWVudDogSGVscE1vZGVsKSB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBIZWxwTW9kZWwgJiYgZWxlbWVudC5pdGVtcykge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuaXRlbXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG59XG5pbnRlcmZhY2UgSUhlbHBJdGVtIHtcblx0aWNvbjogVGhlbWVJY29uO1xuXHRpY29uQ2xhc3Nlczogc3RyaW5nW107XG5cdGxhYmVsOiBzdHJpbmc7XG5cdHZhbHVlczogSGVscEl0ZW1WYWx1ZVtdO1xuXHRoYW5kbGVDbGljaygpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5jbGFzcyBIZWxwTW9kZWwgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0aXRlbXM6IElIZWxwSXRlbVtdIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdmlld01vZGVsOiBJVmlld01vZGVsLFxuXHRcdHByaXZhdGUgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRwcml2YXRlIHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRwcml2YXRlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRwcml2YXRlIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSB3YWxrdGhyb3VnaHNTZXJ2aWNlOiBJV2Fsa3Rocm91Z2hzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51cGRhdGVJdGVtcygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHZpZXdNb2RlbC5vbkRpZENoYW5nZUhlbHBJbmZvcm1hdGlvbigoKSA9PiB0aGlzLnVwZGF0ZUl0ZW1zKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlSGVscEl0ZW1WYWx1ZShpbmZvOiBIZWxwSW5mb3JtYXRpb24sIGluZm9LZXk6IEV4Y2x1ZGU8a2V5b2YgSGVscEluZm9ybWF0aW9uLCAnZXh0ZW5zaW9uRGVzY3JpcHRpb24nIHwgJ3JlbW90ZU5hbWUnIHwgJ3ZpcnR1YWxXb3Jrc3BhY2UnPikge1xuXHRcdHJldHVybiBuZXcgSGVscEl0ZW1WYWx1ZSh0aGlzLmNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0dGhpcy53YWxrdGhyb3VnaHNTZXJ2aWNlLFxuXHRcdFx0aW5mby5leHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRcdCh0eXBlb2YgaW5mby5yZW1vdGVOYW1lID09PSAnc3RyaW5nJykgPyBbaW5mby5yZW1vdGVOYW1lXSA6IGluZm8ucmVtb3RlTmFtZSxcblx0XHRcdGluZm8udmlydHVhbFdvcmtzcGFjZSxcblx0XHRcdGluZm9baW5mb0tleV0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJdGVtcygpIHtcblx0XHRjb25zdCBoZWxwSXRlbXM6IElIZWxwSXRlbVtdID0gW107XG5cblx0XHRjb25zdCBnZXRTdGFydGVkID0gdGhpcy52aWV3TW9kZWwuaGVscEluZm9ybWF0aW9uLmZpbHRlcihpbmZvID0+IGluZm8uZ2V0U3RhcnRlZCk7XG5cdFx0aWYgKGdldFN0YXJ0ZWQubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBoZWxwSXRlbVZhbHVlcyA9IGdldFN0YXJ0ZWQubWFwKChpbmZvOiBIZWxwSW5mb3JtYXRpb24pID0+IHRoaXMuY3JlYXRlSGVscEl0ZW1WYWx1ZShpbmZvLCAnZ2V0U3RhcnRlZCcpKTtcblx0XHRcdGNvbnN0IGdldFN0YXJ0ZWRIZWxwSXRlbSA9IHRoaXMuaXRlbXM/LmZpbmQoaXRlbSA9PiBpdGVtLmljb24gPT09IGljb25zLmdldFN0YXJ0ZWRJY29uKSA/PyBuZXcgR2V0U3RhcnRlZEhlbHBJdGVtKFxuXHRcdFx0XHRpY29ucy5nZXRTdGFydGVkSWNvbixcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZW1vdGUuaGVscC5nZXRTdGFydGVkJywgXCJHZXQgU3RhcnRlZFwiKSxcblx0XHRcdFx0aGVscEl0ZW1WYWx1ZXMsXG5cdFx0XHRcdHRoaXMucXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlXG5cdFx0XHQpO1xuXHRcdFx0Z2V0U3RhcnRlZEhlbHBJdGVtLnZhbHVlcyA9IGhlbHBJdGVtVmFsdWVzO1xuXHRcdFx0aGVscEl0ZW1zLnB1c2goZ2V0U3RhcnRlZEhlbHBJdGVtKTtcblx0XHR9XG5cblx0XHRjb25zdCBkb2N1bWVudGF0aW9uID0gdGhpcy52aWV3TW9kZWwuaGVscEluZm9ybWF0aW9uLmZpbHRlcihpbmZvID0+IGluZm8uZG9jdW1lbnRhdGlvbik7XG5cdFx0aWYgKGRvY3VtZW50YXRpb24ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBoZWxwSXRlbVZhbHVlcyA9IGRvY3VtZW50YXRpb24ubWFwKChpbmZvOiBIZWxwSW5mb3JtYXRpb24pID0+IHRoaXMuY3JlYXRlSGVscEl0ZW1WYWx1ZShpbmZvLCAnZG9jdW1lbnRhdGlvbicpKTtcblx0XHRcdGNvbnN0IGRvY3VtZW50YXRpb25IZWxwSXRlbSA9IHRoaXMuaXRlbXM/LmZpbmQoaXRlbSA9PiBpdGVtLmljb24gPT09IGljb25zLmRvY3VtZW50YXRpb25JY29uKSA/PyBuZXcgSGVscEl0ZW0oXG5cdFx0XHRcdGljb25zLmRvY3VtZW50YXRpb25JY29uLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3JlbW90ZS5oZWxwLmRvY3VtZW50YXRpb24nLCBcIlJlYWQgRG9jdW1lbnRhdGlvblwiKSxcblx0XHRcdFx0aGVscEl0ZW1WYWx1ZXMsXG5cdFx0XHRcdHRoaXMucXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2UsXG5cdFx0XHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdFx0XHQpO1xuXHRcdFx0ZG9jdW1lbnRhdGlvbkhlbHBJdGVtLnZhbHVlcyA9IGhlbHBJdGVtVmFsdWVzO1xuXHRcdFx0aGVscEl0ZW1zLnB1c2goZG9jdW1lbnRhdGlvbkhlbHBJdGVtKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc3N1ZXMgPSB0aGlzLnZpZXdNb2RlbC5oZWxwSW5mb3JtYXRpb24uZmlsdGVyKGluZm8gPT4gaW5mby5pc3N1ZXMpO1xuXHRcdGlmIChpc3N1ZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBoZWxwSXRlbVZhbHVlcyA9IGlzc3Vlcy5tYXAoKGluZm86IEhlbHBJbmZvcm1hdGlvbikgPT4gdGhpcy5jcmVhdGVIZWxwSXRlbVZhbHVlKGluZm8sICdpc3N1ZXMnKSk7XG5cdFx0XHRjb25zdCByZXZpZXdJc3N1ZXNIZWxwSXRlbSA9IHRoaXMuaXRlbXM/LmZpbmQoaXRlbSA9PiBpdGVtLmljb24gPT09IGljb25zLnJldmlld0lzc3Vlc0ljb24pID8/IG5ldyBIZWxwSXRlbShcblx0XHRcdFx0aWNvbnMucmV2aWV3SXNzdWVzSWNvbixcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZW1vdGUuaGVscC5pc3N1ZXMnLCBcIlJldmlldyBJc3N1ZXNcIiksXG5cdFx0XHRcdGhlbHBJdGVtVmFsdWVzLFxuXHRcdFx0XHR0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmVudmlyb25tZW50U2VydmljZSxcblx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRcdFx0dGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHRcdFx0KTtcblx0XHRcdHJldmlld0lzc3Vlc0hlbHBJdGVtLnZhbHVlcyA9IGhlbHBJdGVtVmFsdWVzO1xuXHRcdFx0aGVscEl0ZW1zLnB1c2gocmV2aWV3SXNzdWVzSGVscEl0ZW0pO1xuXHRcdH1cblxuXHRcdGlmIChoZWxwSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBoZWxwSXRlbVZhbHVlcyA9IHRoaXMudmlld01vZGVsLmhlbHBJbmZvcm1hdGlvbi5tYXAoaW5mbyA9PiB0aGlzLmNyZWF0ZUhlbHBJdGVtVmFsdWUoaW5mbywgJ3JlcG9ydElzc3VlJykpO1xuXHRcdFx0Y29uc3QgaXNzdWVSZXBvcnRlckl0ZW0gPSB0aGlzLml0ZW1zPy5maW5kKGl0ZW0gPT4gaXRlbS5pY29uID09PSBpY29ucy5yZXBvcnRJc3N1ZXNJY29uKSA/PyBuZXcgSXNzdWVSZXBvcnRlckl0ZW0oXG5cdFx0XHRcdGljb25zLnJlcG9ydElzc3Vlc0ljb24sXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVtb3RlLmhlbHAucmVwb3J0JywgXCJSZXBvcnQgSXNzdWVcIiksXG5cdFx0XHRcdGhlbHBJdGVtVmFsdWVzLFxuXHRcdFx0XHR0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLmVudmlyb25tZW50U2VydmljZSxcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZSxcblx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRcdFx0dGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHRcdFx0KTtcblx0XHRcdGlzc3VlUmVwb3J0ZXJJdGVtLnZhbHVlcyA9IGhlbHBJdGVtVmFsdWVzO1xuXHRcdFx0aGVscEl0ZW1zLnB1c2goaXNzdWVSZXBvcnRlckl0ZW0pO1xuXHRcdH1cblxuXHRcdGlmIChoZWxwSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLml0ZW1zID0gaGVscEl0ZW1zO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBIZWxwSXRlbVZhbHVlIHtcblx0cHJpdmF0ZSBfdXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLCBwcml2YXRlIHdhbGt0aHJvdWdoU2VydmljZTogSVdhbGt0aHJvdWdoc1NlcnZpY2UsIHB1YmxpYyBleHRlbnNpb25EZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBwdWJsaWMgcmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgcHVibGljIHJlYWRvbmx5IHZpcnR1YWxXb3Jrc3BhY2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgcHJpdmF0ZSB1cmxPckNvbW1hbmRPcklkPzogc3RyaW5nIHwgeyBpZDogc3RyaW5nIH0pIHtcblx0fVxuXG5cdGdldCBkZXNjcmlwdGlvbigpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFVybCgpLnRoZW4oKCkgPT4gdGhpcy5fZGVzY3JpcHRpb24pO1xuXHR9XG5cblx0Z2V0IHVybCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLmdldFVybCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRVcmwoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAodGhpcy5fdXJsID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmICh0eXBlb2YgdGhpcy51cmxPckNvbW1hbmRPcklkID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UodGhpcy51cmxPckNvbW1hbmRPcklkKTtcblx0XHRcdFx0aWYgKHVybC5hdXRob3JpdHkpIHtcblx0XHRcdFx0XHR0aGlzLl91cmwgPSB0aGlzLnVybE9yQ29tbWFuZE9ySWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgdXJsQ29tbWFuZCA9IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8c3RyaW5nPih0aGlzLnVybE9yQ29tbWFuZE9ySWQpLnRoZW4oKHJlc3VsdCkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gaWYgZXhlY3V0aW5nIHRoaXMgY29tbWFuZCB0aW1lcyBvdXQsIGNhY2hlIGl0cyB2YWx1ZSB3aGVuZXZlciBpdCBldmVudHVhbGx5IHJlc29sdmVzXG5cdFx0XHRcdFx0XHR0aGlzLl91cmwgPSByZXN1bHQ7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fdXJsO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdC8vIFdlIG11c3QgYmUgZGVmZW5zaXZlLiBUaGUgY29tbWFuZCBtYXkgbmV2ZXIgcmV0dXJuLCBtZWFuaW5nIHRoYXQgbm8gaGVscCBhdCBhbGwgaXMgZXZlciBzaG93biFcblx0XHRcdFx0XHRjb25zdCBlbXB0eVN0cmluZzogUHJvbWlzZTxzdHJpbmc+ID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUoJycpLCA1MDApKTtcblx0XHRcdFx0XHR0aGlzLl91cmwgPSBhd2FpdCBQcm9taXNlLnJhY2UoW3VybENvbW1hbmQsIGVtcHR5U3RyaW5nXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAodGhpcy51cmxPckNvbW1hbmRPcklkPy5pZCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHdhbGt0aHJvdWdoSWQgPSBgJHt0aGlzLmV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkfSMke3RoaXMudXJsT3JDb21tYW5kT3JJZC5pZH1gO1xuXHRcdFx0XHRcdGNvbnN0IHdhbGt0aHJvdWdoID0gYXdhaXQgdGhpcy53YWxrdGhyb3VnaFNlcnZpY2UuZ2V0V2Fsa3Rocm91Z2god2Fsa3Rocm91Z2hJZCk7XG5cdFx0XHRcdFx0dGhpcy5fZGVzY3JpcHRpb24gPSB3YWxrdGhyb3VnaC50aXRsZTtcblx0XHRcdFx0XHR0aGlzLl91cmwgPSB3YWxrdGhyb3VnaElkO1xuXHRcdFx0XHR9IGNhdGNoIHsgfVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fdXJsID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3VybCA9ICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fdXJsO1xuXHR9XG59XG5cbmFic3RyYWN0IGNsYXNzIEhlbHBJdGVtQmFzZSBpbXBsZW1lbnRzIElIZWxwSXRlbSB7XG5cdHB1YmxpYyBpY29uQ2xhc3Nlczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIGljb246IFRoZW1lSWNvbixcblx0XHRwdWJsaWMgbGFiZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgdmFsdWVzOiBIZWxwSXRlbVZhbHVlW10sXG5cdFx0cHJpdmF0ZSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHR0aGlzLmljb25DbGFzc2VzLnB1c2goLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaWNvbikpO1xuXHRcdHRoaXMuaWNvbkNsYXNzZXMucHVzaCgncmVtb3RlLWhlbHAtdHJlZS1ub2RlLWl0ZW0taWNvbicpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGdldEFjdGlvbnMoKTogUHJvbWlzZTx7XG5cdFx0bGFiZWw6IHN0cmluZztcblx0XHR1cmw6IHN0cmluZztcblx0XHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdH1bXT4ge1xuXHRcdHJldHVybiAoYXdhaXQgUHJvbWlzZS5hbGwodGhpcy52YWx1ZXMubWFwKGFzeW5jICh2YWx1ZSkgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IHZhbHVlLmV4dGVuc2lvbkRlc2NyaXB0aW9uLmRpc3BsYXlOYW1lIHx8IHZhbHVlLmV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBhd2FpdCB2YWx1ZS5kZXNjcmlwdGlvbiA/PyBhd2FpdCB2YWx1ZS51cmwsXG5cdFx0XHRcdHVybDogYXdhaXQgdmFsdWUudXJsLFxuXHRcdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbjogdmFsdWUuZXh0ZW5zaW9uRGVzY3JpcHRpb25cblx0XHRcdH07XG5cdFx0fSkpKS5maWx0ZXIoaXRlbSA9PiBpdGVtLmRlc2NyaXB0aW9uKTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZUNsaWNrKCkge1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRpZiAocmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnRhcmdldFR5cGUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aWYgKHJlbW90ZUF1dGhvcml0eS5zdGFydHNXaXRoKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnRhcmdldFR5cGVbaV0pKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB0aGlzLnZhbHVlcykge1xuXHRcdFx0XHRcdFx0aWYgKHZhbHVlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGF1dGhvcml0eSBvZiB2YWx1ZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAocmVtb3RlQXV0aG9yaXR5LnN0YXJ0c1dpdGgoYXV0aG9yaXR5KSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy50YWtlQWN0aW9uKHZhbHVlLmV4dGVuc2lvbkRlc2NyaXB0aW9uLCBhd2FpdCB2YWx1ZS51cmwpO1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB2aXJ0dWFsV29ya3NwYWNlID0gZ2V0VmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpPy5zY2hlbWU7XG5cdFx0XHRpZiAodmlydHVhbFdvcmtzcGFjZSkge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnRhcmdldFR5cGUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHRoaXMudmFsdWVzKSB7XG5cdFx0XHRcdFx0XHRpZiAodmFsdWUudmlydHVhbFdvcmtzcGFjZSAmJiB2YWx1ZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBhdXRob3JpdHkgb2YgdmFsdWUucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnRhcmdldFR5cGVbaV0uc3RhcnRzV2l0aChhdXRob3JpdHkpICYmIHZpcnR1YWxXb3Jrc3BhY2Uuc3RhcnRzV2l0aCh2YWx1ZS52aXJ0dWFsV29ya3NwYWNlKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy50YWtlQWN0aW9uKHZhbHVlLmV4dGVuc2lvbkRlc2NyaXB0aW9uLCBhd2FpdCB2YWx1ZS51cmwpO1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmFsdWVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCB0aGlzLmdldEFjdGlvbnMoKTtcblxuXHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhhY3Rpb25zLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3BpY2tSZW1vdGVFeHRlbnNpb24nLCBcIlNlbGVjdCB1cmwgdG8gb3BlblwiKSB9KTtcblx0XHRcdFx0aWYgKGFjdGlvbikge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudGFrZUFjdGlvbihhY3Rpb24uZXh0ZW5zaW9uRGVzY3JpcHRpb24sIGFjdGlvbi51cmwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IHRoaXMudGFrZUFjdGlvbih0aGlzLnZhbHVlc1swXS5leHRlbnNpb25EZXNjcmlwdGlvbiwgYXdhaXQgdGhpcy52YWx1ZXNbMF0udXJsKTtcblx0XHR9XG5cblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCB0YWtlQWN0aW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHVybD86IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG59XG5cbmNsYXNzIEdldFN0YXJ0ZWRIZWxwSXRlbSBleHRlbmRzIEhlbHBJdGVtQmFzZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGljb246IFRoZW1lSWNvbixcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdHZhbHVlczogSGVscEl0ZW1WYWx1ZVtdLFxuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGljb24sIGxhYmVsLCB2YWx1ZXMsIHF1aWNrSW5wdXRTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHJlbW90ZUV4cGxvcmVyU2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHRha2VBY3Rpb24oZXh0ZW5zaW9uRGVzY3JpcHRpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdXJsT3JXYWxrdGhyb3VnaElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoW1NjaGVtYXMuaHR0cCwgU2NoZW1hcy5odHRwc10uaW5jbHVkZXMoVVJJLnBhcnNlKHVybE9yV2Fsa3Rocm91Z2hJZCkuc2NoZW1lKSkge1xuXHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odXJsT3JXYWxrdGhyb3VnaElkLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuV2Fsa3Rocm91Z2gnLCB1cmxPcldhbGt0aHJvdWdoSWQpO1xuXHR9XG59XG5cbmNsYXNzIEhlbHBJdGVtIGV4dGVuZHMgSGVscEl0ZW1CYXNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0aWNvbjogVGhlbWVJY29uLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0dmFsdWVzOiBIZWxwSXRlbVZhbHVlW10sXG5cdFx0cXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRyZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0d29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihpY29uLCBsYWJlbCwgdmFsdWVzLCBxdWlja0lucHV0U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCByZW1vdGVFeHBsb3JlclNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyB0YWtlQWN0aW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHVybDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHVybCksIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0fVxufVxuXG5jbGFzcyBJc3N1ZVJlcG9ydGVySXRlbSBleHRlbmRzIEhlbHBJdGVtQmFzZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGljb246IFRoZW1lSWNvbixcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdHZhbHVlczogSGVscEl0ZW1WYWx1ZVtdLFxuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0ZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRwcml2YXRlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGljb24sIGxhYmVsLCB2YWx1ZXMsIHF1aWNrSW5wdXRTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIHJlbW90ZUV4cGxvcmVyU2VydmljZSwgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIGdldEFjdGlvbnMoKTogUHJvbWlzZTx7XG5cdFx0bGFiZWw6IHN0cmluZztcblx0XHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdHVybDogc3RyaW5nO1xuXHRcdGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdH1bXT4ge1xuXHRcdHJldHVybiBQcm9taXNlLmFsbCh0aGlzLnZhbHVlcy5tYXAoYXN5bmMgKHZhbHVlKSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogdmFsdWUuZXh0ZW5zaW9uRGVzY3JpcHRpb24uZGlzcGxheU5hbWUgfHwgdmFsdWUuZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHR1cmw6IGF3YWl0IHZhbHVlLnVybCxcblx0XHRcdFx0ZXh0ZW5zaW9uRGVzY3JpcHRpb246IHZhbHVlLmV4dGVuc2lvbkRlc2NyaXB0aW9uXG5cdFx0XHR9O1xuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyB0YWtlQWN0aW9uKGV4dGVuc2lvbkRlc2NyaXB0aW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHVybDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF1cmwpIHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbklzc3VlUmVwb3J0ZXInLCBbZXh0ZW5zaW9uRGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZV0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodXJsKSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEhlbHBQYW5lbCBleHRlbmRzIFZpZXdQYW5lIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ35yZW1vdGUuaGVscFBhbmVsJztcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFID0gbmxzLmxvY2FsaXplMigncmVtb3RlLmhlbHAnLCBcIkhlbHAgYW5kIGZlZWRiYWNrXCIpO1xuXHRwcml2YXRlIHRyZWUhOiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPEhlbHBNb2RlbCwgSUhlbHBJdGVtLCBJSGVscEl0ZW0+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCB2aWV3TW9kZWw6IElWaWV3TW9kZWwsXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcm90ZWN0ZWQgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByb3RlY3RlZCBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV2Fsa3Rocm91Z2hzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdhbGt0aHJvdWdoc1NlcnZpY2U6IElXYWxrdGhyb3VnaHNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgncmVtb3RlLWhlbHAnKTtcblx0XHRjb25zdCB0cmVlQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdyZW1vdGUtaGVscC1jb250ZW50Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRyZWVDb250YWluZXIpO1xuXG5cdFx0dGhpcy50cmVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hBc3luY0RhdGFUcmVlPEhlbHBNb2RlbCwgSUhlbHBJdGVtLCBJSGVscEl0ZW0+LFxuXHRcdFx0J1JlbW90ZUhlbHAnLFxuXHRcdFx0dHJlZUNvbnRhaW5lcixcblx0XHRcdG5ldyBIZWxwVHJlZVZpcnR1YWxEZWxlZ2F0ZSgpLFxuXHRcdFx0W25ldyBIZWxwVHJlZVJlbmRlcmVyKCldLFxuXHRcdFx0bmV3IEhlbHBEYXRhU291cmNlKCksXG5cdFx0XHR7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGl0ZW06IEhlbHBJdGVtQmFzZSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGl0ZW0ubGFiZWw7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IG5scy5sb2NhbGl6ZSgncmVtb3RlaGVscCcsIFwiUmVtb3RlIEhlbHBcIilcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBIZWxwTW9kZWwodGhpcy52aWV3TW9kZWwsIHRoaXMub3BlbmVyU2VydmljZSwgdGhpcy5xdWlja0lucHV0U2VydmljZSwgdGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB0aGlzLndhbGt0aHJvdWdoc1NlcnZpY2UpKTtcblxuXHRcdHRoaXMudHJlZS5zZXRJbnB1dChtb2RlbCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5kZWJvdW5jZSh0aGlzLnRyZWUub25EaWRPcGVuLCAobGFzdCwgZXZlbnQpID0+IGV2ZW50LCA3NSwgdHJ1ZSkoZSA9PiB7XG5cdFx0XHRlLmVsZW1lbnQ/LmhhbmRsZUNsaWNrKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cbn1cblxuY2xhc3MgSGVscFBhbmVsRGVzY3JpcHRvciBpbXBsZW1lbnRzIElWaWV3RGVzY3JpcHRvciB7XG5cdHJlYWRvbmx5IGlkID0gSGVscFBhbmVsLklEO1xuXHRyZWFkb25seSBuYW1lID0gSGVscFBhbmVsLlRJVExFO1xuXHRyZWFkb25seSBjdG9yRGVzY3JpcHRvcjogU3luY0Rlc2NyaXB0b3I8SGVscFBhbmVsPjtcblx0cmVhZG9ubHkgY2FuVG9nZ2xlVmlzaWJpbGl0eSA9IHRydWU7XG5cdHJlYWRvbmx5IGhpZGVCeURlZmF1bHQgPSBmYWxzZTtcblx0cmVhZG9ubHkgZ3JvdXAgPSAnaGVscEA1MCc7XG5cdHJlYWRvbmx5IG9yZGVyID0gLTEwO1xuXG5cdGNvbnN0cnVjdG9yKHZpZXdNb2RlbDogSVZpZXdNb2RlbCkge1xuXHRcdHRoaXMuY3RvckRlc2NyaXB0b3IgPSBuZXcgU3luY0Rlc2NyaXB0b3IoSGVscFBhbmVsLCBbdmlld01vZGVsXSk7XG5cdH1cbn1cblxuY2xhc3MgUmVtb3RlVmlld1BhbmVDb250YWluZXIgZXh0ZW5kcyBGaWx0ZXJWaWV3UGFuZUNvbnRhaW5lciBpbXBsZW1lbnRzIElWaWV3TW9kZWwge1xuXHRwcml2YXRlIGhlbHBQYW5lbERlc2NyaXB0b3IgPSBuZXcgSGVscFBhbmVsRGVzY3JpcHRvcih0aGlzKTtcblx0aGVscEluZm9ybWF0aW9uOiBIZWxwSW5mb3JtYXRpb25bXSA9IFtdO1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZUhlbHBJbmZvcm1hdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgb25EaWRDaGFuZ2VIZWxwSW5mb3JtYXRpb246IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWxwSW5mb3JtYXRpb24uZXZlbnQ7XG5cdHByaXZhdGUgaGFzUmVnaXN0ZXJlZEhlbHBWaWV3OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVtb3RlU3dpdGNoZXI6IFN3aXRjaFJlbW90ZVZpZXdJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFZJRVdMRVRfSUQsIHJlbW90ZUV4cGxvcmVyU2VydmljZS5vbkRpZENoYW5nZVRhcmdldFR5cGUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCBjb250ZXh0U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLmFkZENvbnN0YW50Vmlld0Rlc2NyaXB0b3JzKFt0aGlzLmhlbHBQYW5lbERlc2NyaXB0b3JdKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlbW90ZVN3aXRjaGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTd2l0Y2hSZW1vdGVWaWV3SXRlbSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlSGVscEluZm9ybWF0aW9uKGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0dGhpcy5fc2V0SGVscEluZm9ybWF0aW9uKGV4dGVuc2lvbnMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3NldEhlbHBJbmZvcm1hdGlvbih0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5oZWxwSW5mb3JtYXRpb24pO1xuXHRcdGNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblxuXHRcdHRoaXMucmVtb3RlU3dpdGNoZXIuY3JlYXRlT3B0aW9uSXRlbXModmlld3NSZWdpc3RyeS5nZXRWaWV3cyh0aGlzLnZpZXdDb250YWluZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih2aWV3c1JlZ2lzdHJ5Lm9uVmlld3NSZWdpc3RlcmVkKGUgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlVmlld3M6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHZpZXcgb2YgZSkge1xuXHRcdFx0XHRpZiAodmlldy52aWV3Q29udGFpbmVyLmlkID09PSBWSUVXTEVUX0lEKSB7XG5cdFx0XHRcdFx0cmVtb3RlVmlld3MucHVzaCguLi52aWV3LnZpZXdzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHJlbW90ZVZpZXdzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5yZW1vdGVTd2l0Y2hlciEuY3JlYXRlT3B0aW9uSXRlbXMocmVtb3RlVmlld3MpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih2aWV3c1JlZ2lzdHJ5Lm9uVmlld3NEZXJlZ2lzdGVyZWQoZSA9PiB7XG5cdFx0XHRpZiAoZS52aWV3Q29udGFpbmVyLmlkID09PSBWSUVXTEVUX0lEKSB7XG5cdFx0XHRcdHRoaXMucmVtb3RlU3dpdGNoZXIhLnJlbW92ZU9wdGlvbkl0ZW1zKGUudmlld3MpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEhlbHBJbmZvcm1hdGlvbihleHRlbnNpb25zOiByZWFkb25seSBJRXh0ZW5zaW9uUG9pbnRVc2VyPEhlbHBJbmZvcm1hdGlvbj5bXSkge1xuXHRcdGNvbnN0IGhlbHBJbmZvcm1hdGlvbjogSGVscEluZm9ybWF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVSZW1vdGVJbmZvRXh0ZW5zaW9uUG9pbnQoZXh0ZW5zaW9uLCBoZWxwSW5mb3JtYXRpb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuaGVscEluZm9ybWF0aW9uID0gaGVscEluZm9ybWF0aW9uO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSGVscEluZm9ybWF0aW9uLmZpcmUoKTtcblxuXHRcdGNvbnN0IHZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcblx0XHRpZiAodGhpcy5oZWxwSW5mb3JtYXRpb24ubGVuZ3RoICYmICF0aGlzLmhhc1JlZ2lzdGVyZWRIZWxwVmlldykge1xuXHRcdFx0Y29uc3QgdmlldyA9IHZpZXdzUmVnaXN0cnkuZ2V0Vmlldyh0aGlzLmhlbHBQYW5lbERlc2NyaXB0b3IuaWQpO1xuXHRcdFx0aWYgKCF2aWV3KSB7XG5cdFx0XHRcdHZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdGhpcy5oZWxwUGFuZWxEZXNjcmlwdG9yXSwgdGhpcy52aWV3Q29udGFpbmVyKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuaGFzUmVnaXN0ZXJlZEhlbHBWaWV3ID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaGFzUmVnaXN0ZXJlZEhlbHBWaWV3KSB7XG5cdFx0XHR2aWV3c1JlZ2lzdHJ5LmRlcmVnaXN0ZXJWaWV3cyhbdGhpcy5oZWxwUGFuZWxEZXNjcmlwdG9yXSwgdGhpcy52aWV3Q29udGFpbmVyKTtcblx0XHRcdHRoaXMuaGFzUmVnaXN0ZXJlZEhlbHBWaWV3ID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlUmVtb3RlSW5mb0V4dGVuc2lvblBvaW50KGV4dGVuc2lvbjogSUV4dGVuc2lvblBvaW50VXNlcjxIZWxwSW5mb3JtYXRpb24+LCBoZWxwSW5mb3JtYXRpb246IEhlbHBJbmZvcm1hdGlvbltdKSB7XG5cdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24uZGVzY3JpcHRpb24sICdjb250cmliUmVtb3RlSGVscCcpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFleHRlbnNpb24udmFsdWUuZG9jdW1lbnRhdGlvbiAmJiAhZXh0ZW5zaW9uLnZhbHVlLmdldFN0YXJ0ZWQgJiYgIWV4dGVuc2lvbi52YWx1ZS5pc3N1ZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRoZWxwSW5mb3JtYXRpb24ucHVzaCh7XG5cdFx0XHRleHRlbnNpb25EZXNjcmlwdGlvbjogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0Z2V0U3RhcnRlZDogZXh0ZW5zaW9uLnZhbHVlLmdldFN0YXJ0ZWQsXG5cdFx0XHRkb2N1bWVudGF0aW9uOiBleHRlbnNpb24udmFsdWUuZG9jdW1lbnRhdGlvbixcblx0XHRcdHJlcG9ydElzc3VlOiBleHRlbnNpb24udmFsdWUucmVwb3J0SXNzdWUsXG5cdFx0XHRpc3N1ZXM6IGV4dGVuc2lvbi52YWx1ZS5pc3N1ZXMsXG5cdFx0XHRyZW1vdGVOYW1lOiBleHRlbnNpb24udmFsdWUucmVtb3RlTmFtZSxcblx0XHRcdHZpcnR1YWxXb3Jrc3BhY2U6IGV4dGVuc2lvbi52YWx1ZS52aXJ0dWFsV29ya3NwYWNlXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RmlsdGVyT24odmlld0Rlc2NyaXB0b3I6IElWaWV3RGVzY3JpcHRvcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGlzU3RyaW5nQXJyYXkodmlld0Rlc2NyaXB0b3IucmVtb3RlQXV0aG9yaXR5KSA/IHZpZXdEZXNjcmlwdG9yLnJlbW90ZUF1dGhvcml0eVswXSA6IHZpZXdEZXNjcmlwdG9yLnJlbW90ZUF1dGhvcml0eTtcblx0fVxuXG5cdHByb3RlY3RlZCBzZXRGaWx0ZXIodmlld0Rlc2NyaXB0b3I6IElWaWV3RGVzY3JpcHRvcik6IHZvaWQge1xuXHRcdHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnRhcmdldFR5cGUgPSBpc1N0cmluZ0FycmF5KHZpZXdEZXNjcmlwdG9yLnJlbW90ZUF1dGhvcml0eSkgPyB2aWV3RGVzY3JpcHRvci5yZW1vdGVBdXRob3JpdHkgOiBbdmlld0Rlc2NyaXB0b3IucmVtb3RlQXV0aG9yaXR5IV07XG5cdH1cblxuXHRnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHRpdGxlID0gbmxzLmxvY2FsaXplKCdyZW1vdGUuZXhwbG9yZXInLCBcIlJlbW90ZSBFeHBsb3JlclwiKTtcblx0XHRyZXR1cm4gdGl0bGU7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKFxuXHR7XG5cdFx0aWQ6IFZJRVdMRVRfSUQsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3JlbW90ZS5leHBsb3JlcicsIFwiUmVtb3RlIEV4cGxvcmVyXCIpLFxuXHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoUmVtb3RlVmlld1BhbmVDb250YWluZXIpLFxuXHRcdGhpZGVJZkVtcHR5OiB0cnVlLFxuXHRcdHZpZXdPcmRlckRlbGVnYXRlOiB7XG5cdFx0XHRnZXRPcmRlcjogKGdyb3VwPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgbWF0Y2hlcyA9IC9edGFyZ2V0c0AoXFxkKykkLy5leGVjKGdyb3VwKTtcblx0XHRcdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gLTEwMDA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRtYXRjaGVzID0gL15kZXRhaWxzKEAoXFxkKykpPyQvLmV4ZWMoZ3JvdXApO1xuXG5cdFx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC01MDAgKyBOdW1iZXIobWF0Y2hlc1syXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRtYXRjaGVzID0gL15oZWxwKEAoXFxkKykpPyQvLmV4ZWMoZ3JvdXApO1xuXHRcdFx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0XHRcdHJldHVybiAtMTA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRpY29uOiBpY29ucy5yZW1vdGVFeHBsb3JlclZpZXdJY29uLFxuXHRcdG9yZGVyOiA0XG5cdH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblxuZXhwb3J0IGNsYXNzIFJlbW90ZU1hcmtlcnMgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElUaW1lclNlcnZpY2UgdGltZXJTZXJ2aWNlOiBJVGltZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRyZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKHJlbW90ZUVudiA9PiB7XG5cdFx0XHRpZiAocmVtb3RlRW52KSB7XG5cdFx0XHRcdHRpbWVyU2VydmljZS5zZXRQZXJmb3JtYW5jZU1hcmtzKCdzZXJ2ZXInLCByZW1vdGVFbnYubWFya3MpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFZpc2libGVQcm9ncmVzcyB7XG5cblx0cHVibGljIHJlYWRvbmx5IGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuO1xuXHRwcml2YXRlIF9sYXN0UmVwb3J0OiBzdHJpbmcgfCBudWxsO1xuXHRwcml2YXRlIF9jdXJyZW50UHJvZ3Jlc3NQcm9taXNlUmVzb2x2ZTogKCgpID0+IHZvaWQpIHwgbnVsbDtcblx0cHJpdmF0ZSBfY3VycmVudFByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4gfCBudWxsO1xuXHRwcml2YXRlIF9jdXJyZW50VGltZXI6IFJlY29ubmVjdGlvblRpbWVyIHwgbnVsbDtcblxuXHRwdWJsaWMgZ2V0IGxhc3RSZXBvcnQoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhc3RSZXBvcnQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsIGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLCBpbml0aWFsUmVwb3J0OiBzdHJpbmcgfCBudWxsLCBidXR0b25zOiBzdHJpbmdbXSwgb25EaWRDYW5jZWw6IChjaG9pY2U6IG51bWJlciB8IHVuZGVmaW5lZCwgbGFzdFJlcG9ydDogc3RyaW5nIHwgbnVsbCkgPT4gdm9pZCkge1xuXHRcdHRoaXMubG9jYXRpb24gPSBsb2NhdGlvbjtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fbGFzdFJlcG9ydCA9IGluaXRpYWxSZXBvcnQ7XG5cdFx0dGhpcy5fY3VycmVudFByb2dyZXNzUHJvbWlzZVJlc29sdmUgPSBudWxsO1xuXHRcdHRoaXMuX2N1cnJlbnRQcm9ncmVzcyA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudFRpbWVyID0gbnVsbDtcblxuXHRcdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4gdGhpcy5fY3VycmVudFByb2dyZXNzUHJvbWlzZVJlc29sdmUgPSByZXNvbHZlKTtcblxuXHRcdHByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHR7IGxvY2F0aW9uOiBsb2NhdGlvbiwgYnV0dG9uczogYnV0dG9ucyB9LFxuXHRcdFx0KHByb2dyZXNzKSA9PiB7IGlmICghdGhpcy5faXNEaXNwb3NlZCkgeyB0aGlzLl9jdXJyZW50UHJvZ3Jlc3MgPSBwcm9ncmVzczsgfSByZXR1cm4gcHJvbWlzZTsgfSxcblx0XHRcdChjaG9pY2UpID0+IG9uRGlkQ2FuY2VsKGNob2ljZSwgdGhpcy5fbGFzdFJlcG9ydClcblx0XHQpO1xuXG5cdFx0aWYgKHRoaXMuX2xhc3RSZXBvcnQpIHtcblx0XHRcdHRoaXMucmVwb3J0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRQcm9ncmVzc1Byb21pc2VSZXNvbHZlKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50UHJvZ3Jlc3NQcm9taXNlUmVzb2x2ZSgpO1xuXHRcdFx0dGhpcy5fY3VycmVudFByb2dyZXNzUHJvbWlzZVJlc29sdmUgPSBudWxsO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50UHJvZ3Jlc3MgPSBudWxsO1xuXHRcdGlmICh0aGlzLl9jdXJyZW50VGltZXIpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRUaW1lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50VGltZXIgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZXBvcnQobWVzc2FnZT86IHN0cmluZykge1xuXHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHR0aGlzLl9sYXN0UmVwb3J0ID0gbWVzc2FnZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbGFzdFJlcG9ydCAmJiB0aGlzLl9jdXJyZW50UHJvZ3Jlc3MpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRQcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiB0aGlzLl9sYXN0UmVwb3J0IH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzdGFydFRpbWVyKGNvbXBsZXRpb25UaW1lOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3BUaW1lcigpO1xuXHRcdHRoaXMuX2N1cnJlbnRUaW1lciA9IG5ldyBSZWNvbm5lY3Rpb25UaW1lcih0aGlzLCBjb21wbGV0aW9uVGltZSk7XG5cdH1cblxuXHRwdWJsaWMgc3RvcFRpbWVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50VGltZXIpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRUaW1lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50VGltZXIgPSBudWxsO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZWNvbm5lY3Rpb25UaW1lciBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcGFyZW50OiBWaXNpYmxlUHJvZ3Jlc3M7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbXBsZXRpb25UaW1lOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckludGVydmFsOiBJRGlzcG9zYWJsZTtcblxuXHRjb25zdHJ1Y3RvcihwYXJlbnQ6IFZpc2libGVQcm9ncmVzcywgY29tcGxldGlvblRpbWU6IG51bWJlcikge1xuXHRcdHRoaXMuX3BhcmVudCA9IHBhcmVudDtcblx0XHR0aGlzLl9jb21wbGV0aW9uVGltZSA9IGNvbXBsZXRpb25UaW1lO1xuXHRcdHRoaXMuX3JlbmRlckludGVydmFsID0gZG9tLmRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChtYWluV2luZG93LCAoKSA9PiB0aGlzLl9yZW5kZXIoKSwgMTAwMCk7XG5cdFx0dGhpcy5fcmVuZGVyKCk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJJbnRlcnZhbC5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIoKSB7XG5cdFx0Y29uc3QgcmVtYWluaW5nVGltZU1zID0gdGhpcy5fY29tcGxldGlvblRpbWUgLSBEYXRlLm5vdygpO1xuXHRcdGlmIChyZW1haW5pbmdUaW1lTXMgPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbWFpbmluZ1RpbWUgPSBNYXRoLmNlaWwocmVtYWluaW5nVGltZU1zIC8gMTAwMCk7XG5cdFx0aWYgKHJlbWFpbmluZ1RpbWUgPT09IDEpIHtcblx0XHRcdHRoaXMuX3BhcmVudC5yZXBvcnQobmxzLmxvY2FsaXplKCdyZWNvbm5lY3Rpb25XYWl0T25lJywgXCJBdHRlbXB0aW5nIHRvIHJlY29ubmVjdCBpbiB7MH0gc2Vjb25kLi4uXCIsIHJlbWFpbmluZ1RpbWUpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcGFyZW50LnJlcG9ydChubHMubG9jYWxpemUoJ3JlY29ubmVjdGlvbldhaXRNYW55JywgXCJBdHRlbXB0aW5nIHRvIHJlY29ubmVjdCBpbiB7MH0gc2Vjb25kcy4uLlwiLCByZW1haW5pbmdUaW1lKSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogVGhlIHRpbWUgd2hlbiBhIHByb21wdCBpcyBzaG93biB0byB0aGUgdXNlclxuICovXG5jb25zdCBESVNDT05ORUNUX1BST01QVF9USU1FID0gNDAgKiAxMDAwOyAvLyA0MCBzZWNvbmRzXG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVBZ2VudENvbm5lY3Rpb25TdGF0dXNMaXN0ZW5lciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIF9yZWxvYWRXaW5kb3dTaG93bjogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0bGV0IHF1aWNrSW5wdXRWaXNpYmxlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihxdWlja0lucHV0U2VydmljZS5vblNob3coKCkgPT4gcXVpY2tJbnB1dFZpc2libGUgPSB0cnVlKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihxdWlja0lucHV0U2VydmljZS5vbkhpZGUoKCkgPT4gcXVpY2tJbnB1dFZpc2libGUgPSBmYWxzZSkpO1xuXG5cdFx0XHRsZXQgdmlzaWJsZVByb2dyZXNzOiBWaXNpYmxlUHJvZ3Jlc3MgfCBudWxsID0gbnVsbDtcblx0XHRcdGxldCByZWNvbm5lY3RXYWl0RXZlbnQ6IFJlY29ubmVjdGlvbldhaXRFdmVudCB8IG51bGwgPSBudWxsO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdFx0XHRmdW5jdGlvbiBzaG93UHJvZ3Jlc3MobG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uRGlhbG9nIHwgUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24gfCBudWxsLCBidXR0b25zOiB7IGxhYmVsOiBzdHJpbmc7IGNhbGxiYWNrOiAoKSA9PiB2b2lkIH1bXSwgaW5pdGlhbFJlcG9ydDogc3RyaW5nIHwgbnVsbCA9IG51bGwpOiBWaXNpYmxlUHJvZ3Jlc3Mge1xuXHRcdFx0XHRpZiAodmlzaWJsZVByb2dyZXNzKSB7XG5cdFx0XHRcdFx0dmlzaWJsZVByb2dyZXNzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3MgPSBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFsb2NhdGlvbikge1xuXHRcdFx0XHRcdGxvY2F0aW9uID0gcXVpY2tJbnB1dFZpc2libGUgPyBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbiA6IFByb2dyZXNzTG9jYXRpb24uRGlhbG9nO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG5ldyBWaXNpYmxlUHJvZ3Jlc3MoXG5cdFx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLCBsb2NhdGlvbiwgaW5pdGlhbFJlcG9ydCwgYnV0dG9ucy5tYXAoYnV0dG9uID0+IGJ1dHRvbi5sYWJlbCksXG5cdFx0XHRcdFx0KGNob2ljZSwgbGFzdFJlcG9ydCkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gSGFuZGxlIGNob2ljZSBmcm9tIGRpYWxvZ1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBjaG9pY2UgIT09ICd1bmRlZmluZWQnICYmIGJ1dHRvbnNbY2hvaWNlXSkge1xuXHRcdFx0XHRcdFx0XHRidXR0b25zW2Nob2ljZV0uY2FsbGJhY2soKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGlmIChsb2NhdGlvbiA9PT0gUHJvZ3Jlc3NMb2NhdGlvbi5EaWFsb2cpIHtcblx0XHRcdFx0XHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3MgPSBzaG93UHJvZ3Jlc3MoUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sIGJ1dHRvbnMsIGxhc3RSZXBvcnQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGhpZGVQcm9ncmVzcygpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRmdW5jdGlvbiBoaWRlUHJvZ3Jlc3MoKSB7XG5cdFx0XHRcdGlmICh2aXNpYmxlUHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3MuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcyA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmcgPSAnJztcblx0XHRcdGxldCBsYXN0SW5jb21pbmdEYXRhVGltZTogbnVtYmVyID0gMDtcblx0XHRcdGxldCByZWNvbm5lY3Rpb25BdHRlbXB0czogbnVtYmVyID0gMDtcblxuXHRcdFx0Y29uc3QgcmVjb25uZWN0QnV0dG9uID0ge1xuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZWNvbm5lY3ROb3cnLCBcIlJlY29ubmVjdCBOb3dcIiksXG5cdFx0XHRcdGNhbGxiYWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmVjb25uZWN0V2FpdEV2ZW50Py5za2lwV2FpdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZWxvYWRCdXR0b24gPSB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbG9hZFdpbmRvdycsIFwiUmVsb2FkIFdpbmRvd1wiKSxcblx0XHRcdFx0Y2FsbGJhY2s6ICgpID0+IHtcblxuXHRcdFx0XHRcdHR5cGUgUmVjb25uZWN0UmVsb2FkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRvd25lcjogJ2FsZXhkaW1hJztcblx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdUaGUgcmVsb2FkIGJ1dHRvbiBpbiB0aGUgYnVpbHRpbiBwZXJtYW5lbnQgcmVjb25uZWN0aW9uIGZhaWx1cmUgZGlhbG9nIHdhcyBwcmVzc2VkJztcblx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgcmVzb2x2ZXIuJyB9O1xuXHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgY29ubmVjdGlvbi4nIH07XG5cdFx0XHRcdFx0XHRtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdFbGFwc2VkIHRpbWUgKGluIG1zKSBzaW5jZSBkYXRhIHdhcyBsYXN0IHJlY2VpdmVkLicgfTtcblx0XHRcdFx0XHRcdGF0dGVtcHQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgcmVjb25uZWN0aW9uIGF0dGVtcHQgY291bnRlci4nIH07XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0eXBlIFJlY29ubmVjdFJlbG9hZEV2ZW50ID0ge1xuXHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IHN0cmluZztcblx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogbnVtYmVyO1xuXHRcdFx0XHRcdFx0YXR0ZW1wdDogbnVtYmVyO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJlY29ubmVjdFJlbG9hZEV2ZW50LCBSZWNvbm5lY3RSZWxvYWRDbGFzc2lmaWNhdGlvbj4oJ3JlbW90ZVJlY29ubmVjdGlvblJlbG9hZCcsIHtcblx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IGdldFJlbW90ZU5hbWUoZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSksXG5cdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogcmVjb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdFx0XHRtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IERhdGUubm93KCkgLSBsYXN0SW5jb21pbmdEYXRhVGltZSxcblx0XHRcdFx0XHRcdGF0dGVtcHQ6IHJlY29ubmVjdGlvbkF0dGVtcHRzXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChSZWxvYWRXaW5kb3dBY3Rpb24uSUQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBQb3NzaWJsZSBzdGF0ZSB0cmFuc2l0aW9uczpcblx0XHRcdC8vIENvbm5lY3Rpb25HYWluICAgICAgLT4gQ29ubmVjdGlvbkxvc3Rcblx0XHRcdC8vIENvbm5lY3Rpb25Mb3N0ICAgICAgLT4gUmVjb25uZWN0aW9uV2FpdCwgUmVjb25uZWN0aW9uUnVubmluZ1xuXHRcdFx0Ly8gUmVjb25uZWN0aW9uV2FpdCAgICAtPiBSZWNvbm5lY3Rpb25SdW5uaW5nXG5cdFx0XHQvLyBSZWNvbm5lY3Rpb25SdW5uaW5nIC0+IENvbm5lY3Rpb25HYWluLCBSZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlXG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNvbm5lY3Rpb24ub25EaWRTdGF0ZUNoYW5nZSgoZSkgPT4ge1xuXHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3M/LnN0b3BUaW1lcigpO1xuXHRcdFx0XHRkaXNwb3NhYmxlTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdFx0XHRzd2l0Y2ggKGUudHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuQ29ubmVjdGlvbkxvc3Q6XG5cdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbiA9IGUucmVjb25uZWN0aW9uVG9rZW47XG5cdFx0XHRcdFx0XHRsYXN0SW5jb21pbmdEYXRhVGltZSA9IERhdGUubm93KCkgLSBlLm1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTtcblx0XHRcdFx0XHRcdHJlY29ubmVjdGlvbkF0dGVtcHRzID0gMDtcblxuXHRcdFx0XHRcdFx0dHlwZSBSZW1vdGVDb25uZWN0aW9uTG9zdENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRcdFx0XHRvd25lcjogJ2FsZXhkaW1hJztcblx0XHRcdFx0XHRcdFx0Y29tbWVudDogJ1RoZSByZW1vdGUgY29ubmVjdGlvbiBzdGF0ZSBpcyBub3cgYENvbm5lY3Rpb25Mb3N0YCc7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgcmVzb2x2ZXIuJyB9O1xuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBjb25uZWN0aW9uLicgfTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0eXBlIFJlbW90ZUNvbm5lY3Rpb25Mb3N0RXZlbnQgPSB7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IHN0cmluZztcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVtb3RlQ29ubmVjdGlvbkxvc3RFdmVudCwgUmVtb3RlQ29ubmVjdGlvbkxvc3RDbGFzc2lmaWNhdGlvbj4oJ3JlbW90ZUNvbm5lY3Rpb25Mb3N0Jywge1xuXHRcdFx0XHRcdFx0XHRyZW1vdGVOYW1lOiBnZXRSZW1vdGVOYW1lKGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpLFxuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogZS5yZWNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHRpZiAodmlzaWJsZVByb2dyZXNzIHx8IGUubWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhID4gRElTQ09OTkVDVF9QUk9NUFRfVElNRSkge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXZpc2libGVQcm9ncmVzcykge1xuXHRcdFx0XHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcyA9IHNob3dQcm9ncmVzcyhudWxsLCBbcmVjb25uZWN0QnV0dG9uLCByZWxvYWRCdXR0b25dKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3MucmVwb3J0KG5scy5sb2NhbGl6ZSgnY29ubmVjdGlvbkxvc3QnLCBcIkNvbm5lY3Rpb24gTG9zdFwiKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuUmVjb25uZWN0aW9uV2FpdDpcblx0XHRcdFx0XHRcdGlmICh2aXNpYmxlUHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdFx0cmVjb25uZWN0V2FpdEV2ZW50ID0gZTtcblx0XHRcdFx0XHRcdFx0dmlzaWJsZVByb2dyZXNzID0gc2hvd1Byb2dyZXNzKG51bGwsIFtyZWNvbm5lY3RCdXR0b24sIHJlbG9hZEJ1dHRvbl0pO1xuXHRcdFx0XHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3Muc3RhcnRUaW1lcihEYXRlLm5vdygpICsgMTAwMCAqIGUuZHVyYXRpb25TZWNvbmRzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Y2FzZSBQZXJzaXN0ZW50Q29ubmVjdGlvbkV2ZW50VHlwZS5SZWNvbm5lY3Rpb25SdW5uaW5nOlxuXHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW4gPSBlLnJlY29ubmVjdGlvblRva2VuO1xuXHRcdFx0XHRcdFx0bGFzdEluY29taW5nRGF0YVRpbWUgPSBEYXRlLm5vdygpIC0gZS5taWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE7XG5cdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25BdHRlbXB0cyA9IGUuYXR0ZW1wdDtcblxuXHRcdFx0XHRcdFx0dHlwZSBSZW1vdGVSZWNvbm5lY3Rpb25SdW5uaW5nQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRcdG93bmVyOiAnYWxleGRpbWEnO1xuXHRcdFx0XHRcdFx0XHRjb21tZW50OiAnVGhlIHJlbW90ZSBjb25uZWN0aW9uIHN0YXRlIGlzIG5vdyBgUmVjb25uZWN0aW9uUnVubmluZ2AnO1xuXHRcdFx0XHRcdFx0XHRyZW1vdGVOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIG5hbWUgb2YgdGhlIHJlc29sdmVyLicgfTtcblx0XHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgaWRlbnRpZmllciBvZiB0aGUgY29ubmVjdGlvbi4nIH07XG5cdFx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0VsYXBzZWQgdGltZSAoaW4gbXMpIHNpbmNlIGRhdGEgd2FzIGxhc3QgcmVjZWl2ZWQuJyB9O1xuXHRcdFx0XHRcdFx0XHRhdHRlbXB0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHJlY29ubmVjdGlvbiBhdHRlbXB0IGNvdW50ZXIuJyB9O1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHR5cGUgUmVtb3RlUmVjb25uZWN0aW9uUnVubmluZ0V2ZW50ID0ge1xuXHRcdFx0XHRcdFx0XHRyZW1vdGVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiBzdHJpbmc7XG5cdFx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogbnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRhdHRlbXB0OiBudW1iZXI7XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJlbW90ZVJlY29ubmVjdGlvblJ1bm5pbmdFdmVudCwgUmVtb3RlUmVjb25uZWN0aW9uUnVubmluZ0NsYXNzaWZpY2F0aW9uPigncmVtb3RlUmVjb25uZWN0aW9uUnVubmluZycsIHtcblx0XHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogZ2V0UmVtb3RlTmFtZShlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSxcblx0XHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IGUucmVjb25uZWN0aW9uVG9rZW4sXG5cdFx0XHRcdFx0XHRcdG1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTogZS5taWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEsXG5cdFx0XHRcdFx0XHRcdGF0dGVtcHQ6IGUuYXR0ZW1wdFxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdGlmICh2aXNpYmxlUHJvZ3Jlc3MgfHwgZS5taWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGEgPiBESVNDT05ORUNUX1BST01QVF9USU1FKSB7XG5cdFx0XHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcyA9IHNob3dQcm9ncmVzcyhudWxsLCBbcmVsb2FkQnV0dG9uXSk7XG5cdFx0XHRcdFx0XHRcdHZpc2libGVQcm9ncmVzcy5yZXBvcnQobmxzLmxvY2FsaXplKCdyZWNvbm5lY3Rpb25SdW5uaW5nJywgXCJEaXNjb25uZWN0ZWQuIEF0dGVtcHRpbmcgdG8gcmVjb25uZWN0Li4uXCIpKTtcblxuXHRcdFx0XHRcdFx0XHQvLyBSZWdpc3RlciB0byBsaXN0ZW4gZm9yIHF1aWNrIGlucHV0IGlzIG9wZW5lZFxuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlTGlzdGVuZXIudmFsdWUgPSBxdWlja0lucHV0U2VydmljZS5vblNob3coKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIE5lZWQgdG8gbW92ZSBmcm9tIGRpYWxvZyBpZiBiZWluZyBzaG93biBhbmQgdXNlciBuZWVkcyB0byB0eXBlIGluIGEgcHJvbXB0XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHZpc2libGVQcm9ncmVzcyAmJiB2aXNpYmxlUHJvZ3Jlc3MubG9jYXRpb24gPT09IFByb2dyZXNzTG9jYXRpb24uRGlhbG9nKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR2aXNpYmxlUHJvZ3Jlc3MgPSBzaG93UHJvZ3Jlc3MoUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sIFtyZWxvYWRCdXR0b25dLCB2aXNpYmxlUHJvZ3Jlc3MubGFzdFJlcG9ydCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRjYXNlIFBlcnNpc3RlbnRDb25uZWN0aW9uRXZlbnRUeXBlLlJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmU6XG5cdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbiA9IGUucmVjb25uZWN0aW9uVG9rZW47XG5cdFx0XHRcdFx0XHRsYXN0SW5jb21pbmdEYXRhVGltZSA9IERhdGUubm93KCkgLSBlLm1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTtcblx0XHRcdFx0XHRcdHJlY29ubmVjdGlvbkF0dGVtcHRzID0gZS5hdHRlbXB0O1xuXG5cdFx0XHRcdFx0XHR0eXBlIFJlbW90ZVJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdFx0b3duZXI6ICdhbGV4ZGltYSc7XG5cdFx0XHRcdFx0XHRcdGNvbW1lbnQ6ICdUaGUgcmVtb3RlIGNvbm5lY3Rpb24gc3RhdGUgaXMgbm93IGBSZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlYCc7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgcmVzb2x2ZXIuJyB9O1xuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBjb25uZWN0aW9uLicgfTtcblx0XHRcdFx0XHRcdFx0bWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnRWxhcHNlZCB0aW1lIChpbiBtcykgc2luY2UgZGF0YSB3YXMgbGFzdCByZWNlaXZlZC4nIH07XG5cdFx0XHRcdFx0XHRcdGF0dGVtcHQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgcmVjb25uZWN0aW9uIGF0dGVtcHQgY291bnRlci4nIH07XG5cdFx0XHRcdFx0XHRcdGhhbmRsZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgZXJyb3Igd2FzIGhhbmRsZWQgYnkgdGhlIHJlc29sdmVyLicgfTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0eXBlIFJlbW90ZVJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmVFdmVudCA9IHtcblx0XHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nO1xuXHRcdFx0XHRcdFx0XHRtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IG51bWJlcjtcblx0XHRcdFx0XHRcdFx0YXR0ZW1wdDogbnVtYmVyO1xuXHRcdFx0XHRcdFx0XHRoYW5kbGVkOiBib29sZWFuO1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSZW1vdGVSZWNvbm5lY3Rpb25QZXJtYW5lbnRGYWlsdXJlRXZlbnQsIFJlbW90ZVJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmVDbGFzc2lmaWNhdGlvbj4oJ3JlbW90ZVJlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmUnLCB7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IGdldFJlbW90ZU5hbWUoZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSksXG5cdFx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiBlLnJlY29ubmVjdGlvblRva2VuLFxuXHRcdFx0XHRcdFx0XHRtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IGUubWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhLFxuXHRcdFx0XHRcdFx0XHRhdHRlbXB0OiBlLmF0dGVtcHQsXG5cdFx0XHRcdFx0XHRcdGhhbmRsZWQ6IGUuaGFuZGxlZFxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdGhpZGVQcm9ncmVzcygpO1xuXG5cdFx0XHRcdFx0XHRpZiAoZS5oYW5kbGVkKSB7XG5cdFx0XHRcdFx0XHRcdGxvZ1NlcnZpY2UuaW5mbyhgRXJyb3IgaGFuZGxlZDogTm90IHNob3dpbmcgYSBub3RpZmljYXRpb24gZm9yIHRoZSBlcnJvci5gKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoIXRoaXMuX3JlbG9hZFdpbmRvd1Nob3duKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3JlbG9hZFdpbmRvd1Nob3duID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0ZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3JlY29ubmVjdGlvblBlcm1hbmVudEZhaWx1cmUnLCBcIkNhbm5vdCByZWNvbm5lY3QuIFBsZWFzZSByZWxvYWQgdGhlIHdpbmRvdy5cIiksXG5cdFx0XHRcdFx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAncmVsb2FkV2luZG93LmRpYWxvZycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlbG9hZCBXaW5kb3dcIilcblx0XHRcdFx0XHRcdFx0fSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChSZWxvYWRXaW5kb3dBY3Rpb24uSUQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdGNhc2UgUGVyc2lzdGVudENvbm5lY3Rpb25FdmVudFR5cGUuQ29ubmVjdGlvbkdhaW46XG5cdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbiA9IGUucmVjb25uZWN0aW9uVG9rZW47XG5cdFx0XHRcdFx0XHRsYXN0SW5jb21pbmdEYXRhVGltZSA9IERhdGUubm93KCkgLSBlLm1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YTtcblx0XHRcdFx0XHRcdHJlY29ubmVjdGlvbkF0dGVtcHRzID0gZS5hdHRlbXB0O1xuXG5cdFx0XHRcdFx0XHR0eXBlIFJlbW90ZUNvbm5lY3Rpb25HYWluQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRcdG93bmVyOiAnYWxleGRpbWEnO1xuXHRcdFx0XHRcdFx0XHRjb21tZW50OiAnVGhlIHJlbW90ZSBjb25uZWN0aW9uIHN0YXRlIGlzIG5vdyBgQ29ubmVjdGlvbkdhaW5gJztcblx0XHRcdFx0XHRcdFx0cmVtb3RlTmFtZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBuYW1lIG9mIHRoZSByZXNvbHZlci4nIH07XG5cdFx0XHRcdFx0XHRcdHJlY29ubmVjdGlvblRva2VuOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIGNvbm5lY3Rpb24uJyB9O1xuXHRcdFx0XHRcdFx0XHRtaWxsaXNTaW5jZUxhc3RJbmNvbWluZ0RhdGE6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdFbGFwc2VkIHRpbWUgKGluIG1zKSBzaW5jZSBkYXRhIHdhcyBsYXN0IHJlY2VpdmVkLicgfTtcblx0XHRcdFx0XHRcdFx0YXR0ZW1wdDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSByZWNvbm5lY3Rpb24gYXR0ZW1wdCBjb3VudGVyLicgfTtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0eXBlIFJlbW90ZUNvbm5lY3Rpb25HYWluRXZlbnQgPSB7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZU5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0cmVjb25uZWN0aW9uVG9rZW46IHN0cmluZztcblx0XHRcdFx0XHRcdFx0bWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBudW1iZXI7XG5cdFx0XHRcdFx0XHRcdGF0dGVtcHQ6IG51bWJlcjtcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmVtb3RlQ29ubmVjdGlvbkdhaW5FdmVudCwgUmVtb3RlQ29ubmVjdGlvbkdhaW5DbGFzc2lmaWNhdGlvbj4oJ3JlbW90ZUNvbm5lY3Rpb25HYWluJywge1xuXHRcdFx0XHRcdFx0XHRyZW1vdGVOYW1lOiBnZXRSZW1vdGVOYW1lKGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpLFxuXHRcdFx0XHRcdFx0XHRyZWNvbm5lY3Rpb25Ub2tlbjogZS5yZWNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0XHRcdFx0bWlsbGlzU2luY2VMYXN0SW5jb21pbmdEYXRhOiBlLm1pbGxpc1NpbmNlTGFzdEluY29taW5nRGF0YSxcblx0XHRcdFx0XHRcdFx0YXR0ZW1wdDogZS5hdHRlbXB0XG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0aGlkZVByb2dyZXNzKCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUIsNEJBQTRCO0FBQ3hELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQTBDLFlBQVksdUJBQWdELDhCQUE4QjtBQUNwSSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFtQyxrQkFBa0Isd0JBQXdCO0FBRTdFLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQWdDLHFDQUFxQztBQUNyRSxPQUFPLGNBQWM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxZQUF5Qix5QkFBeUI7QUFDM0QsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBMEIsOEJBQThCO0FBQ3hELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZ0JBQWtDO0FBRzNDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsT0FBTyxlQUFlO0FBRS9CLFNBQVMsc0JBQXNCO0FBQy9CLFlBQVksV0FBVztBQUN2QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxxQkFBcUI7QUFPOUIsTUFBTSx3QkFBbUU7QUFBQSxFQUN4RSxVQUFVLFNBQTRCO0FBQ3JDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLFNBQTRCO0FBQ3pDLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFPQSxNQUFNLGlCQUFtRztBQUFBLEVBQXpHO0FBQ0Msc0JBQXFCO0FBQUE7QUFBQSxFQUVyQixlQUFlLFdBQStDO0FBQzdELGNBQVUsVUFBVSxJQUFJLDRCQUE0QjtBQUNwRCxVQUFNLE9BQU8sSUFBSSxPQUFPLFdBQVcsSUFBSSxFQUFFLGtDQUFrQyxDQUFDO0FBQzVFLFVBQU0sU0FBUztBQUNmLFdBQU8sRUFBRSxRQUFRLEtBQUs7QUFBQSxFQUN2QjtBQUFBLEVBRUEsY0FBYyxTQUEwQyxPQUFlLGNBQTJDO0FBQ2pILFVBQU0sWUFBWSxhQUFhO0FBQy9CLFFBQUksT0FBTyxXQUFXLGFBQWEsSUFBSTtBQUN2QyxpQkFBYSxLQUFLLFVBQVUsSUFBSSxHQUFHLFFBQVEsUUFBUSxXQUFXO0FBQzlELFVBQU0saUJBQWlCLElBQUksT0FBTyxXQUFXLElBQUksRUFBRSxrQkFBa0IsQ0FBQztBQUN0RSxtQkFBZSxZQUFZLFFBQVEsUUFBUTtBQUFBLEVBQzVDO0FBQUEsRUFFQSxnQkFBZ0IsY0FBMkM7QUFBQSxFQUUzRDtBQUNEO0FBRUEsTUFBTSxlQUFpRTtBQUFBLEVBQ3RFLFlBQVksU0FBb0I7QUFDL0IsV0FBTyxtQkFBbUI7QUFBQSxFQUMzQjtBQUFBLEVBRUEsWUFBWSxTQUFvQjtBQUMvQixRQUFJLG1CQUFtQixhQUFhLFFBQVEsT0FBTztBQUNsRCxhQUFPLFFBQVE7QUFBQSxJQUNoQjtBQUVBLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFDRDtBQVNBLE1BQU0sa0JBQWtCLFdBQVc7QUFBQSxFQUdsQyxZQUNTLFdBQ0EsZUFDQSxtQkFDQSxnQkFDQSx1QkFDQSxvQkFDQSx5QkFDQSxxQkFDUDtBQUNELFVBQU07QUFURTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBSVIsU0FBSyxZQUFZO0FBQ2pCLFNBQUssVUFBVSxVQUFVLDJCQUEyQixNQUFNLEtBQUssWUFBWSxDQUFDLENBQUM7QUFBQSxFQUM5RTtBQUFBLEVBRVEsb0JBQW9CLE1BQXVCLFNBQXFHO0FBQ3ZKLFdBQU8sSUFBSTtBQUFBLE1BQWMsS0FBSztBQUFBLE1BQzdCLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNKLE9BQU8sS0FBSyxlQUFlLFdBQVksQ0FBQyxLQUFLLFVBQVUsSUFBSSxLQUFLO0FBQUEsTUFDakUsS0FBSztBQUFBLE1BQ0wsS0FBSyxPQUFPO0FBQUEsSUFBQztBQUFBLEVBQ2Y7QUFBQSxFQUVRLGNBQWM7QUFDckIsVUFBTSxZQUF5QixDQUFDO0FBRWhDLFVBQU0sYUFBYSxLQUFLLFVBQVUsZ0JBQWdCLE9BQU8sVUFBUSxLQUFLLFVBQVU7QUFDaEYsUUFBSSxXQUFXLFFBQVE7QUFDdEIsWUFBTSxpQkFBaUIsV0FBVyxJQUFJLENBQUMsU0FBMEIsS0FBSyxvQkFBb0IsTUFBTSxZQUFZLENBQUM7QUFDN0csWUFBTSxxQkFBcUIsS0FBSyxPQUFPLEtBQUssVUFBUSxLQUFLLFNBQVMsTUFBTSxjQUFjLEtBQUssSUFBSTtBQUFBLFFBQzlGLE1BQU07QUFBQSxRQUNOLElBQUksU0FBUywwQkFBMEIsYUFBYTtBQUFBLFFBQ3BEO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsUUFDTCxLQUFLO0FBQUEsTUFDTjtBQUNBLHlCQUFtQixTQUFTO0FBQzVCLGdCQUFVLEtBQUssa0JBQWtCO0FBQUEsSUFDbEM7QUFFQSxVQUFNLGdCQUFnQixLQUFLLFVBQVUsZ0JBQWdCLE9BQU8sVUFBUSxLQUFLLGFBQWE7QUFDdEYsUUFBSSxjQUFjLFFBQVE7QUFDekIsWUFBTSxpQkFBaUIsY0FBYyxJQUFJLENBQUMsU0FBMEIsS0FBSyxvQkFBb0IsTUFBTSxlQUFlLENBQUM7QUFDbkgsWUFBTSx3QkFBd0IsS0FBSyxPQUFPLEtBQUssVUFBUSxLQUFLLFNBQVMsTUFBTSxpQkFBaUIsS0FBSyxJQUFJO0FBQUEsUUFDcEcsTUFBTTtBQUFBLFFBQ04sSUFBSSxTQUFTLDZCQUE2QixvQkFBb0I7QUFBQSxRQUM5RDtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLE1BQ047QUFDQSw0QkFBc0IsU0FBUztBQUMvQixnQkFBVSxLQUFLLHFCQUFxQjtBQUFBLElBQ3JDO0FBRUEsVUFBTSxTQUFTLEtBQUssVUFBVSxnQkFBZ0IsT0FBTyxVQUFRLEtBQUssTUFBTTtBQUN4RSxRQUFJLE9BQU8sUUFBUTtBQUNsQixZQUFNLGlCQUFpQixPQUFPLElBQUksQ0FBQyxTQUEwQixLQUFLLG9CQUFvQixNQUFNLFFBQVEsQ0FBQztBQUNyRyxZQUFNLHVCQUF1QixLQUFLLE9BQU8sS0FBSyxVQUFRLEtBQUssU0FBUyxNQUFNLGdCQUFnQixLQUFLLElBQUk7QUFBQSxRQUNsRyxNQUFNO0FBQUEsUUFDTixJQUFJLFNBQVMsc0JBQXNCLGVBQWU7QUFBQSxRQUNsRDtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLE1BQ047QUFDQSwyQkFBcUIsU0FBUztBQUM5QixnQkFBVSxLQUFLLG9CQUFvQjtBQUFBLElBQ3BDO0FBRUEsUUFBSSxVQUFVLFFBQVE7QUFDckIsWUFBTSxpQkFBaUIsS0FBSyxVQUFVLGdCQUFnQixJQUFJLFVBQVEsS0FBSyxvQkFBb0IsTUFBTSxhQUFhLENBQUM7QUFDL0csWUFBTSxvQkFBb0IsS0FBSyxPQUFPLEtBQUssVUFBUSxLQUFLLFNBQVMsTUFBTSxnQkFBZ0IsS0FBSyxJQUFJO0FBQUEsUUFDL0YsTUFBTTtBQUFBLFFBQ04sSUFBSSxTQUFTLHNCQUFzQixjQUFjO0FBQUEsUUFDakQ7QUFBQSxRQUNBLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxNQUNOO0FBQ0Esd0JBQWtCLFNBQVM7QUFDM0IsZ0JBQVUsS0FBSyxpQkFBaUI7QUFBQSxJQUNqQztBQUVBLFFBQUksVUFBVSxRQUFRO0FBQ3JCLFdBQUssUUFBUTtBQUFBLElBQ2Q7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLGNBQWM7QUFBQSxFQUluQixZQUFvQixnQkFBeUMsb0JBQWlELHNCQUE2RCxpQkFBdUQsa0JBQThDLGtCQUE0QztBQUF4UztBQUF5QztBQUFpRDtBQUE2RDtBQUF1RDtBQUE4QztBQUFBLEVBQ2hSO0FBQUEsRUFFQSxJQUFJLGNBQTJDO0FBQzlDLFdBQU8sS0FBSyxPQUFPLEVBQUUsS0FBSyxNQUFNLEtBQUssWUFBWTtBQUFBLEVBQ2xEO0FBQUEsRUFFQSxJQUFJLE1BQXVCO0FBQzFCLFdBQU8sS0FBSyxPQUFPO0FBQUEsRUFDcEI7QUFBQSxFQUVBLE1BQWMsU0FBMEI7QUFDdkMsUUFBSSxLQUFLLFNBQVMsUUFBVztBQUM1QixVQUFJLE9BQU8sS0FBSyxxQkFBcUIsVUFBVTtBQUM5QyxjQUFNLE1BQU0sSUFBSSxNQUFNLEtBQUssZ0JBQWdCO0FBQzNDLFlBQUksSUFBSSxXQUFXO0FBQ2xCLGVBQUssT0FBTyxLQUFLO0FBQUEsUUFDbEIsT0FBTztBQUNOLGdCQUFNLGFBQWEsS0FBSyxlQUFlLGVBQXVCLEtBQUssZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLFdBQVc7QUFFckcsaUJBQUssT0FBTztBQUNaLG1CQUFPLEtBQUs7QUFBQSxVQUNiLENBQUM7QUFFRCxnQkFBTSxjQUErQixJQUFJLFFBQVEsYUFBVyxXQUFXLE1BQU0sUUFBUSxFQUFFLEdBQUcsR0FBRyxDQUFDO0FBQzlGLGVBQUssT0FBTyxNQUFNLFFBQVEsS0FBSyxDQUFDLFlBQVksV0FBVyxDQUFDO0FBQUEsUUFDekQ7QUFBQSxNQUNELFdBQVcsS0FBSyxrQkFBa0IsSUFBSTtBQUNyQyxZQUFJO0FBQ0gsZ0JBQU0sZ0JBQWdCLEdBQUcsS0FBSyxxQkFBcUIsRUFBRSxJQUFJLEtBQUssaUJBQWlCLEVBQUU7QUFDakYsZ0JBQU0sY0FBYyxNQUFNLEtBQUssbUJBQW1CLGVBQWUsYUFBYTtBQUM5RSxlQUFLLGVBQWUsWUFBWTtBQUNoQyxlQUFLLE9BQU87QUFBQSxRQUNiLFFBQVE7QUFBQSxRQUFFO0FBQUEsTUFDWDtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssU0FBUyxRQUFXO0FBQzVCLFdBQUssT0FBTztBQUFBLElBQ2I7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFQSxNQUFlLGFBQWtDO0FBQUEsRUFFaEQsWUFDUSxNQUNBLE9BQ0EsUUFDQyxtQkFDQSxvQkFDQSx1QkFDQSx5QkFDUDtBQVBNO0FBQ0E7QUFDQTtBQUNDO0FBQ0E7QUFDQTtBQUNBO0FBUlQsU0FBTyxjQUF3QixDQUFDO0FBVS9CLFNBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSxpQkFBaUIsSUFBSSxDQUFDO0FBQ3pELFNBQUssWUFBWSxLQUFLLGlDQUFpQztBQUFBLEVBQ3hEO0FBQUEsRUFFQSxNQUFnQixhQUtYO0FBQ0osWUFBUSxNQUFNLFFBQVEsSUFBSSxLQUFLLE9BQU8sSUFBSSxPQUFPLFVBQVU7QUFDMUQsYUFBTztBQUFBLFFBQ04sT0FBTyxNQUFNLHFCQUFxQixlQUFlLE1BQU0scUJBQXFCLFdBQVc7QUFBQSxRQUN2RixhQUFhLE1BQU0sTUFBTSxlQUFlLE1BQU0sTUFBTTtBQUFBLFFBQ3BELEtBQUssTUFBTSxNQUFNO0FBQUEsUUFDakIsc0JBQXNCLE1BQU07QUFBQSxNQUM3QjtBQUFBLElBQ0QsQ0FBQyxDQUFDLEdBQUcsT0FBTyxVQUFRLEtBQUssV0FBVztBQUFBLEVBQ3JDO0FBQUEsRUFFQSxNQUFNLGNBQWM7QUFDbkIsVUFBTSxrQkFBa0IsS0FBSyxtQkFBbUI7QUFDaEQsUUFBSSxpQkFBaUI7QUFDcEIsZUFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLHNCQUFzQixXQUFXLFFBQVEsS0FBSztBQUN0RSxZQUFJLGdCQUFnQixXQUFXLEtBQUssc0JBQXNCLFdBQVcsQ0FBQyxDQUFDLEdBQUc7QUFDekUscUJBQVcsU0FBUyxLQUFLLFFBQVE7QUFDaEMsZ0JBQUksTUFBTSxpQkFBaUI7QUFDMUIseUJBQVcsYUFBYSxNQUFNLGlCQUFpQjtBQUM5QyxvQkFBSSxnQkFBZ0IsV0FBVyxTQUFTLEdBQUc7QUFDMUMsd0JBQU0sS0FBSyxXQUFXLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSxHQUFHO0FBQ2pFO0FBQUEsZ0JBQ0Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsT0FBTztBQUNOLFlBQU0sbUJBQW1CLDRCQUE0QixLQUFLLHdCQUF3QixhQUFhLENBQUMsR0FBRztBQUNuRyxVQUFJLGtCQUFrQjtBQUNyQixpQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLHNCQUFzQixXQUFXLFFBQVEsS0FBSztBQUN0RSxxQkFBVyxTQUFTLEtBQUssUUFBUTtBQUNoQyxnQkFBSSxNQUFNLG9CQUFvQixNQUFNLGlCQUFpQjtBQUNwRCx5QkFBVyxhQUFhLE1BQU0saUJBQWlCO0FBQzlDLG9CQUFJLEtBQUssc0JBQXNCLFdBQVcsQ0FBQyxFQUFFLFdBQVcsU0FBUyxLQUFLLGlCQUFpQixXQUFXLE1BQU0sZ0JBQWdCLEdBQUc7QUFDMUgsd0JBQU0sS0FBSyxXQUFXLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSxHQUFHO0FBQ2pFO0FBQUEsZ0JBQ0Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBRUQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssT0FBTyxTQUFTLEdBQUc7QUFDM0IsWUFBTSxVQUFVLE1BQU0sS0FBSyxXQUFXO0FBRXRDLFVBQUksUUFBUSxRQUFRO0FBQ25CLGNBQU0sU0FBUyxNQUFNLEtBQUssa0JBQWtCLEtBQUssU0FBUyxFQUFFLGFBQWEsSUFBSSxTQUFTLHVCQUF1QixvQkFBb0IsRUFBRSxDQUFDO0FBQ3BJLFlBQUksUUFBUTtBQUNYLGdCQUFNLEtBQUssV0FBVyxPQUFPLHNCQUFzQixPQUFPLEdBQUc7QUFBQSxRQUM5RDtBQUFBLE1BQ0Q7QUFBQSxJQUNELE9BQU87QUFDTixZQUFNLEtBQUssV0FBVyxLQUFLLE9BQU8sQ0FBQyxFQUFFLHNCQUFzQixNQUFNLEtBQUssT0FBTyxDQUFDLEVBQUUsR0FBRztBQUFBLElBQ3BGO0FBQUEsRUFFRDtBQUdEO0FBRUEsTUFBTSwyQkFBMkIsYUFBYTtBQUFBLEVBQzdDLFlBQ0MsTUFDQSxPQUNBLFFBQ0EsbUJBQ0Esb0JBQ1EsZUFDUix1QkFDQSx5QkFDUSxnQkFDUDtBQUNELFVBQU0sTUFBTSxPQUFPLFFBQVEsbUJBQW1CLG9CQUFvQix1QkFBdUIsdUJBQXVCO0FBTHhHO0FBR0E7QUFBQSxFQUdUO0FBQUEsRUFFQSxNQUFnQixXQUFXLHNCQUE2QyxvQkFBMkM7QUFDbEgsUUFBSSxDQUFDLFFBQVEsTUFBTSxRQUFRLEtBQUssRUFBRSxTQUFTLElBQUksTUFBTSxrQkFBa0IsRUFBRSxNQUFNLEdBQUc7QUFDakYsV0FBSyxjQUFjLEtBQUssb0JBQW9CLEVBQUUsZUFBZSxLQUFLLENBQUM7QUFDbkU7QUFBQSxJQUNEO0FBRUEsU0FBSyxlQUFlLGVBQWUsb0NBQW9DLGtCQUFrQjtBQUFBLEVBQzFGO0FBQ0Q7QUFFQSxNQUFNLGlCQUFpQixhQUFhO0FBQUEsRUFDbkMsWUFDQyxNQUNBLE9BQ0EsUUFDQSxtQkFDQSxvQkFDUSxlQUNSLHVCQUNBLHlCQUNDO0FBQ0QsVUFBTSxNQUFNLE9BQU8sUUFBUSxtQkFBbUIsb0JBQW9CLHVCQUF1Qix1QkFBdUI7QUFKeEc7QUFBQSxFQUtUO0FBQUEsRUFFQSxNQUFnQixXQUFXLHNCQUE2QyxLQUE0QjtBQUNuRyxVQUFNLEtBQUssY0FBYyxLQUFLLElBQUksTUFBTSxHQUFHLEdBQUcsRUFBRSxlQUFlLEtBQUssQ0FBQztBQUFBLEVBQ3RFO0FBQ0Q7QUFFQSxNQUFNLDBCQUEwQixhQUFhO0FBQUEsRUFDNUMsWUFDQyxNQUNBLE9BQ0EsUUFDQSxtQkFDQSxvQkFDUSxnQkFDQSxlQUNSLHVCQUNBLHlCQUNDO0FBQ0QsVUFBTSxNQUFNLE9BQU8sUUFBUSxtQkFBbUIsb0JBQW9CLHVCQUF1Qix1QkFBdUI7QUFMeEc7QUFDQTtBQUFBLEVBS1Q7QUFBQSxFQUVBLE1BQXlCLGFBS3BCO0FBQ0osV0FBTyxRQUFRLElBQUksS0FBSyxPQUFPLElBQUksT0FBTyxVQUFVO0FBQ25ELGFBQU87QUFBQSxRQUNOLE9BQU8sTUFBTSxxQkFBcUIsZUFBZSxNQUFNLHFCQUFxQixXQUFXO0FBQUEsUUFDdkYsYUFBYTtBQUFBLFFBQ2IsS0FBSyxNQUFNLE1BQU07QUFBQSxRQUNqQixzQkFBc0IsTUFBTTtBQUFBLE1BQzdCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFnQixXQUFXLHNCQUE2QyxLQUE0QjtBQUNuRyxRQUFJLENBQUMsS0FBSztBQUNULFlBQU0sS0FBSyxlQUFlLGVBQWUsc0NBQXNDLENBQUMscUJBQXFCLFdBQVcsS0FBSyxDQUFDO0FBQUEsSUFDdkgsT0FBTztBQUNOLFlBQU0sS0FBSyxjQUFjLEtBQUssSUFBSSxNQUFNLEdBQUcsQ0FBQztBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUNEO0FBRUEsSUFBTSxZQUFOLGNBQXdCLFNBQVM7QUFBQSxFQUtoQyxZQUNXLFdBQ1YsU0FDb0IsbUJBQ0Msb0JBQ0QsbUJBQ0csc0JBQ0Esc0JBQ0MsdUJBQ1IsZUFDYyxtQkFDSCxnQkFDZ0IsdUJBQ00sb0JBQ2xDLGNBQ0EsY0FDNEIseUJBQ0oscUJBQ3RDO0FBQ0QsVUFBTSxTQUFTLG1CQUFtQixvQkFBb0Isc0JBQXNCLG1CQUFtQix1QkFBdUIsc0JBQXNCLGVBQWUsY0FBYyxZQUFZO0FBbEIzSztBQVNvQjtBQUNIO0FBQ2dCO0FBQ007QUFHTjtBQUNKO0FBQUEsRUFHeEM7QUFBQSxFQUVtQixXQUFXLFdBQThCO0FBQzNELFVBQU0sV0FBVyxTQUFTO0FBRTFCLGNBQVUsVUFBVSxJQUFJLGFBQWE7QUFDckMsVUFBTSxnQkFBZ0IsU0FBUyxjQUFjLEtBQUs7QUFDbEQsa0JBQWMsVUFBVSxJQUFJLHFCQUFxQjtBQUNqRCxjQUFVLFlBQVksYUFBYTtBQUVuQyxTQUFLLE9BQU8sS0FBSyxxQkFBcUI7QUFBQSxNQUFlO0FBQUEsTUFDcEQ7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLHdCQUF3QjtBQUFBLE1BQzVCLENBQUMsSUFBSSxpQkFBaUIsQ0FBQztBQUFBLE1BQ3ZCLElBQUksZUFBZTtBQUFBLE1BQ25CO0FBQUEsUUFDQyx1QkFBdUI7QUFBQSxVQUN0QixjQUFjLENBQUMsU0FBdUI7QUFDckMsbUJBQU8sS0FBSztBQUFBLFVBQ2I7QUFBQSxVQUNBLG9CQUFvQixNQUFNLElBQUksU0FBUyxjQUFjLGFBQWE7QUFBQSxRQUNuRTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssVUFBVSxJQUFJLFVBQVUsS0FBSyxXQUFXLEtBQUssZUFBZSxLQUFLLG1CQUFtQixLQUFLLGdCQUFnQixLQUFLLHVCQUF1QixLQUFLLG9CQUFvQixLQUFLLHlCQUF5QixLQUFLLG1CQUFtQixDQUFDO0FBRXhPLFNBQUssS0FBSyxTQUFTLEtBQUs7QUFFeEIsU0FBSyxVQUFVLE1BQU0sU0FBUyxLQUFLLEtBQUssV0FBVyxDQUFDLE1BQU0sVUFBVSxPQUFPLElBQUksSUFBSSxFQUFFLE9BQUs7QUFDekYsUUFBRSxTQUFTLFlBQVk7QUFBQSxJQUN4QixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFbUIsV0FBVyxRQUFnQixPQUFxQjtBQUNsRSxVQUFNLFdBQVcsUUFBUSxLQUFLO0FBQzlCLFNBQUssS0FBSyxPQUFPLFFBQVEsS0FBSztBQUFBLEVBQy9CO0FBQ0Q7QUFoRU0sVUFDVyxLQUFLO0FBRGhCLFVBRVcsUUFBUSxJQUFJLFVBQVUsZUFBZSxtQkFBbUI7QUFGbkUsWUFBTjtBQUFBLEVBUUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdEJHO0FBa0VOLE1BQU0sb0JBQStDO0FBQUEsRUFTcEQsWUFBWSxXQUF1QjtBQVJuQyxTQUFTLEtBQUssVUFBVTtBQUN4QixTQUFTLE9BQU8sVUFBVTtBQUUxQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFFBQVE7QUFDakIsU0FBUyxRQUFRO0FBR2hCLFNBQUssaUJBQWlCLElBQUksZUFBZSxXQUFXLENBQUMsU0FBUyxDQUFDO0FBQUEsRUFDaEU7QUFDRDtBQUVBLElBQU0sMEJBQU4sY0FBc0Msd0JBQThDO0FBQUEsRUFRbkYsWUFDMEIsZUFDTixrQkFDTyxnQkFDVCxnQkFDTSxzQkFDQSxzQkFDUixjQUNNLG9CQUNGLGtCQUNzQix1QkFDakIsdUJBQ1gsWUFDWjtBQUNELFVBQU0sWUFBWSxzQkFBc0IsdUJBQXVCLHNCQUFzQixlQUFlLGtCQUFrQixnQkFBZ0Isc0JBQXNCLGNBQWMsb0JBQW9CLGtCQUFrQixnQkFBZ0IsdUJBQXVCLFVBQVU7QUFKeE47QUFqQjFDLFNBQVEsc0JBQXNCLElBQUksb0JBQW9CLElBQUk7QUFDMUQsMkJBQXFDLENBQUM7QUFDdEMsU0FBUSw4QkFBOEIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3hFLFNBQU8sNkJBQTBDLEtBQUssNEJBQTRCO0FBQ2xGLFNBQVEsd0JBQWlDO0FBa0J4QyxTQUFLLDJCQUEyQixDQUFDLEtBQUssbUJBQW1CLENBQUM7QUFDMUQsU0FBSyxVQUFVLEtBQUssaUJBQWlCLEtBQUsscUJBQXFCLGVBQWUsb0JBQW9CLENBQUM7QUFDbkcsU0FBSyxVQUFVLEtBQUssc0JBQXNCLDJCQUEyQixnQkFBYztBQUNsRixXQUFLLG9CQUFvQixVQUFVO0FBQUEsSUFDcEMsQ0FBQyxDQUFDO0FBRUYsU0FBSyxvQkFBb0IsS0FBSyxzQkFBc0IsZUFBZTtBQUNuRSxVQUFNLGdCQUFnQixTQUFTLEdBQW1CLFdBQVcsYUFBYTtBQUUxRSxTQUFLLGVBQWUsa0JBQWtCLGNBQWMsU0FBUyxLQUFLLGFBQWEsQ0FBQztBQUNoRixTQUFLLFVBQVUsY0FBYyxrQkFBa0IsT0FBSztBQUNuRCxZQUFNLGNBQWlDLENBQUM7QUFDeEMsaUJBQVcsUUFBUSxHQUFHO0FBQ3JCLFlBQUksS0FBSyxjQUFjLE9BQU8sWUFBWTtBQUN6QyxzQkFBWSxLQUFLLEdBQUcsS0FBSyxLQUFLO0FBQUEsUUFDL0I7QUFBQSxNQUNEO0FBQ0EsVUFBSSxZQUFZLFNBQVMsR0FBRztBQUMzQixhQUFLLGVBQWdCLGtCQUFrQixXQUFXO0FBQUEsTUFDbkQ7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxjQUFjLG9CQUFvQixPQUFLO0FBQ3JELFVBQUksRUFBRSxjQUFjLE9BQU8sWUFBWTtBQUN0QyxhQUFLLGVBQWdCLGtCQUFrQixFQUFFLEtBQUs7QUFBQSxNQUMvQztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsb0JBQW9CLFlBQTZEO0FBQ3hGLFVBQU0sa0JBQXFDLENBQUM7QUFDNUMsZUFBVyxhQUFhLFlBQVk7QUFDbkMsV0FBSyxnQ0FBZ0MsV0FBVyxlQUFlO0FBQUEsSUFDaEU7QUFFQSxTQUFLLGtCQUFrQjtBQUN2QixTQUFLLDRCQUE0QixLQUFLO0FBRXRDLFVBQU0sZ0JBQWdCLFNBQVMsR0FBbUIsV0FBVyxhQUFhO0FBQzFFLFFBQUksS0FBSyxnQkFBZ0IsVUFBVSxDQUFDLEtBQUssdUJBQXVCO0FBQy9ELFlBQU0sT0FBTyxjQUFjLFFBQVEsS0FBSyxvQkFBb0IsRUFBRTtBQUM5RCxVQUFJLENBQUMsTUFBTTtBQUNWLHNCQUFjLGNBQWMsQ0FBQyxLQUFLLG1CQUFtQixHQUFHLEtBQUssYUFBYTtBQUFBLE1BQzNFO0FBQ0EsV0FBSyx3QkFBd0I7QUFBQSxJQUM5QixXQUFXLEtBQUssdUJBQXVCO0FBQ3RDLG9CQUFjLGdCQUFnQixDQUFDLEtBQUssbUJBQW1CLEdBQUcsS0FBSyxhQUFhO0FBQzVFLFdBQUssd0JBQXdCO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQ0FBZ0MsV0FBaUQsaUJBQW9DO0FBQzVILFFBQUksQ0FBQyxxQkFBcUIsVUFBVSxhQUFhLG1CQUFtQixHQUFHO0FBQ3RFO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxVQUFVLE1BQU0saUJBQWlCLENBQUMsVUFBVSxNQUFNLGNBQWMsQ0FBQyxVQUFVLE1BQU0sUUFBUTtBQUM3RjtBQUFBLElBQ0Q7QUFFQSxvQkFBZ0IsS0FBSztBQUFBLE1BQ3BCLHNCQUFzQixVQUFVO0FBQUEsTUFDaEMsWUFBWSxVQUFVLE1BQU07QUFBQSxNQUM1QixlQUFlLFVBQVUsTUFBTTtBQUFBLE1BQy9CLGFBQWEsVUFBVSxNQUFNO0FBQUEsTUFDN0IsUUFBUSxVQUFVLE1BQU07QUFBQSxNQUN4QixZQUFZLFVBQVUsTUFBTTtBQUFBLE1BQzVCLGtCQUFrQixVQUFVLE1BQU07QUFBQSxJQUNuQyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVUsWUFBWSxnQkFBcUQ7QUFDMUUsV0FBTyxjQUFjLGVBQWUsZUFBZSxJQUFJLGVBQWUsZ0JBQWdCLENBQUMsSUFBSSxlQUFlO0FBQUEsRUFDM0c7QUFBQSxFQUVVLFVBQVUsZ0JBQXVDO0FBQzFELFNBQUssc0JBQXNCLGFBQWEsY0FBYyxlQUFlLGVBQWUsSUFBSSxlQUFlLGtCQUFrQixDQUFDLGVBQWUsZUFBZ0I7QUFBQSxFQUMxSjtBQUFBLEVBRUEsV0FBbUI7QUFDbEIsVUFBTSxRQUFRLElBQUksU0FBUyxtQkFBbUIsaUJBQWlCO0FBQy9ELFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUF6R00sMEJBQU47QUFBQSxFQVNHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBCRztBQTJHTixTQUFTLEdBQTRCLFdBQVcsc0JBQXNCLEVBQUU7QUFBQSxFQUN2RTtBQUFBLElBQ0MsSUFBSTtBQUFBLElBQ0osT0FBTyxJQUFJLFVBQVUsbUJBQW1CLGlCQUFpQjtBQUFBLElBQ3pELGdCQUFnQixJQUFJLGVBQWUsdUJBQXVCO0FBQUEsSUFDMUQsYUFBYTtBQUFBLElBQ2IsbUJBQW1CO0FBQUEsTUFDbEIsVUFBVSxDQUFDLFVBQW1CO0FBQzdCLFlBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxRQUNEO0FBRUEsWUFBSSxVQUFVLGtCQUFrQixLQUFLLEtBQUs7QUFDMUMsWUFBSSxTQUFTO0FBQ1osaUJBQU87QUFBQSxRQUNSO0FBRUEsa0JBQVUscUJBQXFCLEtBQUssS0FBSztBQUV6QyxZQUFJLFNBQVM7QUFDWixpQkFBTyxPQUFPLE9BQU8sUUFBUSxDQUFDLENBQUM7QUFBQSxRQUNoQztBQUVBLGtCQUFVLGtCQUFrQixLQUFLLEtBQUs7QUFDdEMsWUFBSSxTQUFTO0FBQ1osaUJBQU87QUFBQSxRQUNSO0FBRUE7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsTUFBTSxNQUFNO0FBQUEsSUFDWixPQUFPO0FBQUEsRUFDUjtBQUFBLEVBQUcsc0JBQXNCO0FBQU87QUFFMUIsSUFBTSxnQkFBTixNQUFzRDtBQUFBLEVBRTVELFlBQ3NCLG9CQUNOLGNBQ2Q7QUFDRCx1QkFBbUIsZUFBZSxFQUFFLEtBQUssZUFBYTtBQUNyRCxVQUFJLFdBQVc7QUFDZCxxQkFBYSxvQkFBb0IsVUFBVSxVQUFVLEtBQUs7QUFBQSxNQUMzRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQVphLGdCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxHQUpVO0FBY2IsTUFBTSxnQkFBZ0I7QUFBQSxFQVNyQixJQUFXLGFBQTRCO0FBQ3RDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLFlBQVksaUJBQW1DLFVBQTRCLGVBQThCLFNBQW1CLGFBQThFO0FBQ3pNLFNBQUssV0FBVztBQUNoQixTQUFLLGNBQWM7QUFDbkIsU0FBSyxjQUFjO0FBQ25CLFNBQUssaUNBQWlDO0FBQ3RDLFNBQUssbUJBQW1CO0FBQ3hCLFNBQUssZ0JBQWdCO0FBRXJCLFVBQU0sVUFBVSxJQUFJLFFBQWMsQ0FBQyxZQUFZLEtBQUssaUNBQWlDLE9BQU87QUFFNUYsb0JBQWdCO0FBQUEsTUFDZixFQUFFLFVBQW9CLFFBQWlCO0FBQUEsTUFDdkMsQ0FBQyxhQUFhO0FBQUUsWUFBSSxDQUFDLEtBQUssYUFBYTtBQUFFLGVBQUssbUJBQW1CO0FBQUEsUUFBVTtBQUFFLGVBQU87QUFBQSxNQUFTO0FBQUEsTUFDN0YsQ0FBQyxXQUFXLFlBQVksUUFBUSxLQUFLLFdBQVc7QUFBQSxJQUNqRDtBQUVBLFFBQUksS0FBSyxhQUFhO0FBQ3JCLFdBQUssT0FBTztBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUEsRUFFTyxVQUFnQjtBQUN0QixTQUFLLGNBQWM7QUFDbkIsUUFBSSxLQUFLLGdDQUFnQztBQUN4QyxXQUFLLCtCQUErQjtBQUNwQyxXQUFLLGlDQUFpQztBQUFBLElBQ3ZDO0FBQ0EsU0FBSyxtQkFBbUI7QUFDeEIsUUFBSSxLQUFLLGVBQWU7QUFDdkIsV0FBSyxjQUFjLFFBQVE7QUFDM0IsV0FBSyxnQkFBZ0I7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLE9BQU8sU0FBa0I7QUFDL0IsUUFBSSxTQUFTO0FBQ1osV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFFQSxRQUFJLEtBQUssZUFBZSxLQUFLLGtCQUFrQjtBQUM5QyxXQUFLLGlCQUFpQixPQUFPLEVBQUUsU0FBUyxLQUFLLFlBQVksQ0FBQztBQUFBLElBQzNEO0FBQUEsRUFDRDtBQUFBLEVBRU8sV0FBVyxnQkFBOEI7QUFDL0MsU0FBSyxVQUFVO0FBQ2YsU0FBSyxnQkFBZ0IsSUFBSSxrQkFBa0IsTUFBTSxjQUFjO0FBQUEsRUFDaEU7QUFBQSxFQUVPLFlBQWtCO0FBQ3hCLFFBQUksS0FBSyxlQUFlO0FBQ3ZCLFdBQUssY0FBYyxRQUFRO0FBQzNCLFdBQUssZ0JBQWdCO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxNQUFNLGtCQUF5QztBQUFBLEVBSzlDLFlBQVksUUFBeUIsZ0JBQXdCO0FBQzVELFNBQUssVUFBVTtBQUNmLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssa0JBQWtCLElBQUkseUJBQXlCLFlBQVksTUFBTSxLQUFLLFFBQVEsR0FBRyxHQUFJO0FBQzFGLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVPLFVBQWdCO0FBQ3RCLFNBQUssZ0JBQWdCLFFBQVE7QUFBQSxFQUM5QjtBQUFBLEVBRVEsVUFBVTtBQUNqQixVQUFNLGtCQUFrQixLQUFLLGtCQUFrQixLQUFLLElBQUk7QUFDeEQsUUFBSSxrQkFBa0IsR0FBRztBQUN4QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLGdCQUFnQixLQUFLLEtBQUssa0JBQWtCLEdBQUk7QUFDdEQsUUFBSSxrQkFBa0IsR0FBRztBQUN4QixXQUFLLFFBQVEsT0FBTyxJQUFJLFNBQVMsdUJBQXVCLDRDQUE0QyxhQUFhLENBQUM7QUFBQSxJQUNuSCxPQUFPO0FBQ04sV0FBSyxRQUFRLE9BQU8sSUFBSSxTQUFTLHdCQUF3Qiw2Q0FBNkMsYUFBYSxDQUFDO0FBQUEsSUFDckg7QUFBQSxFQUNEO0FBQ0Q7QUFLQSxNQUFNLHlCQUF5QixLQUFLO0FBRTdCLElBQU0sc0NBQU4sY0FBa0QsV0FBNkM7QUFBQSxFQUlyRyxZQUNzQixvQkFDSCxpQkFDRixlQUNDLGdCQUNHLG1CQUNQLFlBQ2lCLG9CQUNYLGtCQUNsQjtBQUNELFVBQU07QUFaUCxTQUFRLHFCQUE4QjtBQWFyQyxVQUFNLGFBQWEsbUJBQW1CLGNBQWM7QUFDcEQsUUFBSSxZQUFZO0FBU2YsVUFBU0EsZ0JBQVQsU0FBc0IsVUFBMEUsU0FBb0QsZ0JBQStCLE1BQXVCO0FBQ3pNLFlBQUksaUJBQWlCO0FBQ3BCLDBCQUFnQixRQUFRO0FBQ3hCLDRCQUFrQjtBQUFBLFFBQ25CO0FBRUEsWUFBSSxDQUFDLFVBQVU7QUFDZCxxQkFBVyxvQkFBb0IsaUJBQWlCLGVBQWUsaUJBQWlCO0FBQUEsUUFDakY7QUFFQSxlQUFPLElBQUk7QUFBQSxVQUNWO0FBQUEsVUFBaUI7QUFBQSxVQUFVO0FBQUEsVUFBZSxRQUFRLElBQUksWUFBVSxPQUFPLEtBQUs7QUFBQSxVQUM1RSxDQUFDLFFBQVEsZUFBZTtBQUV2QixnQkFBSSxPQUFPLFdBQVcsZUFBZSxRQUFRLE1BQU0sR0FBRztBQUNyRCxzQkFBUSxNQUFNLEVBQUUsU0FBUztBQUFBLFlBQzFCLE9BQU87QUFDTixrQkFBSSxhQUFhLGlCQUFpQixRQUFRO0FBQ3pDLGtDQUFrQkEsY0FBYSxpQkFBaUIsY0FBYyxTQUFTLFVBQVU7QUFBQSxjQUNsRixPQUFPO0FBQ04sZ0JBQUFDLGNBQWE7QUFBQSxjQUNkO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxHQUVTQSxnQkFBVCxXQUF3QjtBQUN2QixZQUFJLGlCQUFpQjtBQUNwQiwwQkFBZ0IsUUFBUTtBQUN4Qiw0QkFBa0I7QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFoQ1MseUJBQUFELGVBMkJBLGVBQUFDO0FBbkNULFVBQUksb0JBQW9CO0FBQ3hCLFdBQUssVUFBVSxrQkFBa0IsT0FBTyxNQUFNLG9CQUFvQixJQUFJLENBQUM7QUFDdkUsV0FBSyxVQUFVLGtCQUFrQixPQUFPLE1BQU0sb0JBQW9CLEtBQUssQ0FBQztBQUV4RSxVQUFJLGtCQUEwQztBQUM5QyxVQUFJLHFCQUFtRDtBQUN2RCxZQUFNLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQW9DakUsVUFBSSxvQkFBNEI7QUFDaEMsVUFBSSx1QkFBK0I7QUFDbkMsVUFBSSx1QkFBK0I7QUFFbkMsWUFBTSxrQkFBa0I7QUFBQSxRQUN2QixPQUFPLElBQUksU0FBUyxnQkFBZ0IsZUFBZTtBQUFBLFFBQ25ELFVBQVUsTUFBTTtBQUNmLDhCQUFvQixTQUFTO0FBQUEsUUFDOUI7QUFBQSxNQUNEO0FBRUEsWUFBTSxlQUFlO0FBQUEsUUFDcEIsT0FBTyxJQUFJLFNBQVMsZ0JBQWdCLGVBQWU7QUFBQSxRQUNuRCxVQUFVLE1BQU07QUFnQmYsMkJBQWlCLFdBQWdFLDRCQUE0QjtBQUFBLFlBQzVHLFlBQVksY0FBYyxtQkFBbUIsZUFBZTtBQUFBLFlBQzVEO0FBQUEsWUFDQSw2QkFBNkIsS0FBSyxJQUFJLElBQUk7QUFBQSxZQUMxQyxTQUFTO0FBQUEsVUFDVixDQUFDO0FBRUQseUJBQWUsZUFBZSxtQkFBbUIsRUFBRTtBQUFBLFFBQ3BEO0FBQUEsTUFDRDtBQVFBLFdBQUssVUFBVSxXQUFXLGlCQUFpQixDQUFDLE1BQU07QUFDakQseUJBQWlCLFVBQVU7QUFDM0IsMkJBQW1CLE1BQU07QUFFekIsZ0JBQVEsRUFBRSxNQUFNO0FBQUEsVUFDZixLQUFLLDhCQUE4QjtBQUNsQyxnQ0FBb0IsRUFBRTtBQUN0QixtQ0FBdUIsS0FBSyxJQUFJLElBQUksRUFBRTtBQUN0QyxtQ0FBdUI7QUFZdkIsNkJBQWlCLFdBQTBFLHdCQUF3QjtBQUFBLGNBQ2xILFlBQVksY0FBYyxtQkFBbUIsZUFBZTtBQUFBLGNBQzVELG1CQUFtQixFQUFFO0FBQUEsWUFDdEIsQ0FBQztBQUVELGdCQUFJLG1CQUFtQixFQUFFLDhCQUE4Qix3QkFBd0I7QUFDOUUsa0JBQUksQ0FBQyxpQkFBaUI7QUFDckIsa0NBQWtCRCxjQUFhLE1BQU0sQ0FBQyxpQkFBaUIsWUFBWSxDQUFDO0FBQUEsY0FDckU7QUFDQSw4QkFBZ0IsT0FBTyxJQUFJLFNBQVMsa0JBQWtCLGlCQUFpQixDQUFDO0FBQUEsWUFDekU7QUFDQTtBQUFBLFVBRUQsS0FBSyw4QkFBOEI7QUFDbEMsZ0JBQUksaUJBQWlCO0FBQ3BCLG1DQUFxQjtBQUNyQixnQ0FBa0JBLGNBQWEsTUFBTSxDQUFDLGlCQUFpQixZQUFZLENBQUM7QUFDcEUsOEJBQWdCLFdBQVcsS0FBSyxJQUFJLElBQUksTUFBTyxFQUFFLGVBQWU7QUFBQSxZQUNqRTtBQUNBO0FBQUEsVUFFRCxLQUFLLDhCQUE4QjtBQUNsQyxnQ0FBb0IsRUFBRTtBQUN0QixtQ0FBdUIsS0FBSyxJQUFJLElBQUksRUFBRTtBQUN0QyxtQ0FBdUIsRUFBRTtBQWdCekIsNkJBQWlCLFdBQW9GLDZCQUE2QjtBQUFBLGNBQ2pJLFlBQVksY0FBYyxtQkFBbUIsZUFBZTtBQUFBLGNBQzVELG1CQUFtQixFQUFFO0FBQUEsY0FDckIsNkJBQTZCLEVBQUU7QUFBQSxjQUMvQixTQUFTLEVBQUU7QUFBQSxZQUNaLENBQUM7QUFFRCxnQkFBSSxtQkFBbUIsRUFBRSw4QkFBOEIsd0JBQXdCO0FBQzlFLGdDQUFrQkEsY0FBYSxNQUFNLENBQUMsWUFBWSxDQUFDO0FBQ25ELDhCQUFnQixPQUFPLElBQUksU0FBUyx1QkFBdUIsMENBQTBDLENBQUM7QUFHdEcsaUNBQW1CLFFBQVEsa0JBQWtCLE9BQU8sTUFBTTtBQUV6RCxvQkFBSSxtQkFBbUIsZ0JBQWdCLGFBQWEsaUJBQWlCLFFBQVE7QUFDNUUsb0NBQWtCQSxjQUFhLGlCQUFpQixjQUFjLENBQUMsWUFBWSxHQUFHLGdCQUFnQixVQUFVO0FBQUEsZ0JBQ3pHO0FBQUEsY0FDRCxDQUFDO0FBQUEsWUFDRjtBQUVBO0FBQUEsVUFFRCxLQUFLLDhCQUE4QjtBQUNsQyxnQ0FBb0IsRUFBRTtBQUN0QixtQ0FBdUIsS0FBSyxJQUFJLElBQUksRUFBRTtBQUN0QyxtQ0FBdUIsRUFBRTtBQWtCekIsNkJBQWlCLFdBQXNHLHNDQUFzQztBQUFBLGNBQzVKLFlBQVksY0FBYyxtQkFBbUIsZUFBZTtBQUFBLGNBQzVELG1CQUFtQixFQUFFO0FBQUEsY0FDckIsNkJBQTZCLEVBQUU7QUFBQSxjQUMvQixTQUFTLEVBQUU7QUFBQSxjQUNYLFNBQVMsRUFBRTtBQUFBLFlBQ1osQ0FBQztBQUVELFlBQUFDLGNBQWE7QUFFYixnQkFBSSxFQUFFLFNBQVM7QUFDZCx5QkFBVyxLQUFLLDBEQUEwRDtBQUFBLFlBQzNFLFdBQVcsQ0FBQyxLQUFLLG9CQUFvQjtBQUNwQyxtQkFBSyxxQkFBcUI7QUFDMUIsNEJBQWMsUUFBUTtBQUFBLGdCQUNyQixNQUFNLFNBQVM7QUFBQSxnQkFDZixTQUFTLElBQUksU0FBUyxnQ0FBZ0MsNkNBQTZDO0FBQUEsZ0JBQ25HLGVBQWUsSUFBSSxTQUFTLEVBQUUsS0FBSyx1QkFBdUIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsaUJBQWlCO0FBQUEsY0FDbEgsQ0FBQyxFQUFFLEtBQUssWUFBVTtBQUNqQixvQkFBSSxPQUFPLFdBQVc7QUFDckIsaUNBQWUsZUFBZSxtQkFBbUIsRUFBRTtBQUFBLGdCQUNwRDtBQUFBLGNBQ0QsQ0FBQztBQUFBLFlBQ0Y7QUFDQTtBQUFBLFVBRUQsS0FBSyw4QkFBOEI7QUFDbEMsZ0NBQW9CLEVBQUU7QUFDdEIsbUNBQXVCLEtBQUssSUFBSSxJQUFJLEVBQUU7QUFDdEMsbUNBQXVCLEVBQUU7QUFnQnpCLDZCQUFpQixXQUEwRSx3QkFBd0I7QUFBQSxjQUNsSCxZQUFZLGNBQWMsbUJBQW1CLGVBQWU7QUFBQSxjQUM1RCxtQkFBbUIsRUFBRTtBQUFBLGNBQ3JCLDZCQUE2QixFQUFFO0FBQUEsY0FDL0IsU0FBUyxFQUFFO0FBQUEsWUFDWixDQUFDO0FBRUQsWUFBQUEsY0FBYTtBQUNiO0FBQUEsUUFDRjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUFBLEVBQ0Q7QUFDRDtBQTFRYSxzQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFsic2hvd1Byb2dyZXNzIiwgImhpZGVQcm9ncmVzcyJdCn0K
