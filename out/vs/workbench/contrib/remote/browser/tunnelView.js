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
import "./media/tunnelView.css";
import * as nls from "../../../../nls.js";
import * as dom from "../../../../base/browser/dom.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IContextKeyService, RawContextKey, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ICommandService, CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { Event } from "../../../../base/common/event.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { toDisposable, dispose, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { IconLabel } from "../../../../base/browser/ui/iconLabel/iconLabel.js";
import { ActionRunner } from "../../../../base/common/actions.js";
import { IMenuService, MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { createActionViewItem, getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IRemoteExplorerService, TunnelType, TUNNEL_VIEW_ID, TunnelEditId } from "../../../services/remote/common/remoteExplorerService.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { InputBox, MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { URI } from "../../../../base/common/uri.js";
import { isAllInterfaces, isLocalhost, isRemoteTunnel, ITunnelService, TunnelPrivacyId, TunnelProtocol } from "../../../../platform/tunnel/common/tunnel.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { copyAddressIcon, forwardedPortWithoutProcessIcon, forwardedPortWithProcessIcon, forwardPortIcon, labelPortIcon, openBrowserIcon, openPreviewIcon, portsViewIcon, privatePortIcon, stopForwardIcon } from "./remoteIcons.js";
import { IExternalUriOpenerService } from "../../externalUriOpener/common/externalUriOpenerService.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { STATUS_BAR_REMOTE_ITEM_BACKGROUND } from "../../../common/theme.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { defaultButtonStyles, defaultInputBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { TunnelCloseReason, TunnelSource, forwardedPortsViewEnabled, makeAddress, mapHasAddressLocalhostOrAllInterfaces, parseAddress } from "../../../services/remote/common/tunnelModel.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
const openPreviewEnabledContext = new RawContextKey("openPreviewEnabled", false);
class TunnelTreeVirtualDelegate {
  constructor(remoteExplorerService) {
    this.remoteExplorerService = remoteExplorerService;
    this.headerRowHeight = 22;
  }
  getHeight(row) {
    return row.tunnelType === TunnelType.Add && !this.remoteExplorerService.getEditableData(void 0) ? 30 : 22;
  }
}
let TunnelViewModel = class {
  constructor(remoteExplorerService, tunnelService) {
    this.remoteExplorerService = remoteExplorerService;
    this.tunnelService = tunnelService;
    this._candidates = /* @__PURE__ */ new Map();
    this.input = {
      label: nls.localize("remote.tunnelsView.addPort", "Add Port"),
      icon: void 0,
      tunnelType: TunnelType.Add,
      hasRunningProcess: false,
      remoteHost: "",
      remotePort: 0,
      processDescription: "",
      tooltipPostfix: "",
      iconTooltip: "",
      portTooltip: "",
      processTooltip: "",
      originTooltip: "",
      privacyTooltip: "",
      source: { source: TunnelSource.User, description: "" },
      protocol: TunnelProtocol.Http,
      privacy: {
        id: TunnelPrivacyId.Private,
        themeIcon: privatePortIcon.id,
        label: nls.localize("tunnelPrivacy.private", "Private")
      },
      strip: () => void 0
    };
    this.model = remoteExplorerService.tunnelModel;
    this.onForwardedPortsChanged = Event.any(this.model.onForwardPort, this.model.onClosePort, this.model.onPortName, this.model.onCandidatesChanged);
  }
  get all() {
    const result = [];
    this._candidates = /* @__PURE__ */ new Map();
    this.model.candidates.forEach((candidate) => {
      this._candidates.set(makeAddress(candidate.host, candidate.port), candidate);
    });
    if (this.model.forwarded.size > 0 || this.remoteExplorerService.getEditableData(void 0)) {
      result.push(...this.forwarded);
    }
    if (this.model.detected.size > 0) {
      result.push(...this.detected);
    }
    result.push(this.input);
    return result;
  }
  addProcessInfoFromCandidate(tunnelItem) {
    const key = makeAddress(tunnelItem.remoteHost, tunnelItem.remotePort);
    if (this._candidates.has(key)) {
      tunnelItem.processDescription = this._candidates.get(key).detail;
    }
  }
  get forwarded() {
    const forwarded = Array.from(this.model.forwarded.values()).map((tunnel) => {
      const tunnelItem = TunnelItem.createFromTunnel(this.remoteExplorerService, this.tunnelService, tunnel);
      this.addProcessInfoFromCandidate(tunnelItem);
      return tunnelItem;
    }).sort((a, b) => {
      if (a.remotePort === b.remotePort) {
        return a.remoteHost < b.remoteHost ? -1 : 1;
      } else {
        return a.remotePort < b.remotePort ? -1 : 1;
      }
    });
    return forwarded;
  }
  get detected() {
    return Array.from(this.model.detected.values()).map((tunnel) => {
      const tunnelItem = TunnelItem.createFromTunnel(this.remoteExplorerService, this.tunnelService, tunnel, TunnelType.Detected, false);
      this.addProcessInfoFromCandidate(tunnelItem);
      return tunnelItem;
    });
  }
  isEmpty() {
    return this.detected.length === 0 && (this.forwarded.length === 0 || this.forwarded.length === 1 && this.forwarded[0].tunnelType === TunnelType.Add && !this.remoteExplorerService.getEditableData(void 0));
  }
};
TunnelViewModel = __decorateClass([
  __decorateParam(0, IRemoteExplorerService),
  __decorateParam(1, ITunnelService)
], TunnelViewModel);
function emptyCell(item) {
  return { label: "", tunnel: item, editId: TunnelEditId.None, tooltip: "" };
}
class IconColumn {
  constructor() {
    this.label = "";
    this.tooltip = "";
    this.weight = 1;
    this.minimumWidth = 40;
    this.maximumWidth = 40;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const icon = row.processDescription ? forwardedPortWithProcessIcon : forwardedPortWithoutProcessIcon;
    let tooltip = "";
    if (row instanceof TunnelItem) {
      tooltip = `${row.iconTooltip} ${row.tooltipPostfix}`;
    }
    return {
      label: "",
      icon,
      tunnel: row,
      editId: TunnelEditId.None,
      tooltip
    };
  }
}
class PortColumn {
  constructor() {
    this.label = nls.localize("tunnel.portColumn.label", "Port");
    this.tooltip = nls.localize("tunnel.portColumn.tooltip", "The label and remote port number of the forwarded port.");
    this.weight = 1;
    this.templateId = "actionbar";
  }
  project(row) {
    const isAdd = row.tunnelType === TunnelType.Add;
    const label = row.label;
    let tooltip = "";
    if (row instanceof TunnelItem && !isAdd) {
      tooltip = `${row.portTooltip} ${row.tooltipPostfix}`;
    } else {
      tooltip = label;
    }
    return {
      label,
      tunnel: row,
      menuId: MenuId.TunnelPortInline,
      editId: row.tunnelType === TunnelType.Add ? TunnelEditId.New : TunnelEditId.Label,
      tooltip
    };
  }
}
class LocalAddressColumn {
  constructor() {
    this.label = nls.localize("tunnel.addressColumn.label", "Forwarded Address");
    this.tooltip = nls.localize("tunnel.addressColumn.tooltip", "The address that the forwarded port is available at.");
    this.weight = 1;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const label = row.localAddress ?? "";
    let tooltip = label;
    if (row instanceof TunnelItem) {
      tooltip = row.tooltipPostfix;
    }
    return {
      label,
      menuId: MenuId.TunnelLocalAddressInline,
      tunnel: row,
      editId: TunnelEditId.LocalPort,
      tooltip,
      markdownTooltip: label ? LocalAddressColumn.getHoverText(label) : void 0
    };
  }
  static getHoverText(localAddress) {
    return function(configurationService) {
      const editorConf = configurationService.getValue("editor");
      let clickLabel = "";
      if (editorConf.multiCursorModifier === "ctrlCmd") {
        if (isMacintosh) {
          clickLabel = nls.localize("portsLink.followLinkAlt.mac", "option + click");
        } else {
          clickLabel = nls.localize("portsLink.followLinkAlt", "alt + click");
        }
      } else {
        if (isMacintosh) {
          clickLabel = nls.localize("portsLink.followLinkCmd", "cmd + click");
        } else {
          clickLabel = nls.localize("portsLink.followLinkCtrl", "ctrl + click");
        }
      }
      const markdown = new MarkdownString("", true);
      const uri = localAddress.startsWith("http") ? localAddress : `http://${localAddress}`;
      return markdown.appendLink(uri, "Follow link").appendMarkdown(` (${clickLabel})`);
    };
  }
}
class RunningProcessColumn {
  constructor() {
    this.label = nls.localize("tunnel.processColumn.label", "Running Process");
    this.tooltip = nls.localize("tunnel.processColumn.tooltip", "The command line of the process that is using the port.");
    this.weight = 2;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const label = row.processDescription ?? "";
    return { label, tunnel: row, editId: TunnelEditId.None, tooltip: row instanceof TunnelItem ? row.processTooltip : "" };
  }
}
class OriginColumn {
  constructor() {
    this.label = nls.localize("tunnel.originColumn.label", "Origin");
    this.tooltip = nls.localize("tunnel.originColumn.tooltip", "The source that a forwarded port originates from. Can be an extension, user forwarded, statically forwarded, or automatically forwarded.");
    this.weight = 1;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const label = row.source.description;
    const tooltip = `${row instanceof TunnelItem ? row.originTooltip : ""}. ${row instanceof TunnelItem ? row.tooltipPostfix : ""}`;
    return { label, menuId: MenuId.TunnelOriginInline, tunnel: row, editId: TunnelEditId.None, tooltip };
  }
}
class PrivacyColumn {
  constructor() {
    this.label = nls.localize("tunnel.privacyColumn.label", "Visibility");
    this.tooltip = nls.localize("tunnel.privacyColumn.tooltip", "The availability of the forwarded port.");
    this.weight = 1;
    this.templateId = "actionbar";
  }
  project(row) {
    if (row.tunnelType === TunnelType.Add) {
      return emptyCell(row);
    }
    const label = row.privacy?.label;
    let tooltip = "";
    if (row instanceof TunnelItem) {
      tooltip = `${row.privacy.label} ${row.tooltipPostfix}`;
    }
    return { label, tunnel: row, icon: { id: row.privacy.themeIcon }, editId: TunnelEditId.None, tooltip };
  }
}
let ActionBarRenderer = class {
  constructor(instantiationService, contextKeyService, menuService, contextViewService, remoteExplorerService, commandService, configurationService) {
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this.contextViewService = contextViewService;
    this.remoteExplorerService = remoteExplorerService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.templateId = "actionbar";
    this._hoverDelegate = getDefaultHoverDelegate("mouse");
  }
  set actionRunner(actionRunner) {
    this._actionRunner = actionRunner;
  }
  renderTemplate(container) {
    const cell = dom.append(container, dom.$(".ports-view-actionbar-cell"));
    const icon = dom.append(cell, dom.$(".ports-view-actionbar-cell-icon"));
    const templateDisposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    templateDisposables.add(elementDisposables);
    const label = templateDisposables.add(new IconLabel(
      cell,
      {
        supportHighlights: true,
        hoverDelegate: this._hoverDelegate
      }
    ));
    const actionsContainer = dom.append(cell, dom.$(".actions"));
    const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
      actionViewItemProvider: createActionViewItem.bind(void 0, this.instantiationService),
      hoverDelegate: this._hoverDelegate
    }));
    return { label, icon, actionBar, container: cell, templateDisposables, elementDisposables };
  }
  renderElement(element, index, templateData) {
    templateData.actionBar.clear();
    templateData.icon.className = "ports-view-actionbar-cell-icon";
    templateData.icon.style.display = "none";
    templateData.label.setLabel("");
    templateData.label.element.style.display = "none";
    templateData.container.style.height = "22px";
    if (templateData.button) {
      templateData.button.element.style.display = "none";
    }
    templateData.container.style.paddingLeft = "0px";
    templateData.elementDisposables.clear();
    let editableData;
    if (element.editId === TunnelEditId.New && (editableData = this.remoteExplorerService.getEditableData(void 0))) {
      this.renderInputBox(templateData, editableData);
    } else {
      editableData = this.remoteExplorerService.getEditableData(element.tunnel, element.editId);
      if (editableData) {
        this.renderInputBox(templateData, editableData);
      } else if (element.tunnel.tunnelType === TunnelType.Add && element.menuId === MenuId.TunnelPortInline) {
        this.renderButton(element, templateData);
      } else {
        this.renderActionBarItem(element, templateData);
      }
    }
  }
  renderButton(element, templateData) {
    templateData.container.style.paddingLeft = "7px";
    templateData.container.style.height = "28px";
    templateData.button = templateData.elementDisposables.add(new Button(templateData.container, defaultButtonStyles));
    templateData.button.label = element.label;
    templateData.button.element.title = element.tooltip;
    templateData.elementDisposables.add(templateData.button.onDidClick(() => {
      this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
    }));
  }
  tunnelContext(tunnel) {
    let context;
    if (tunnel instanceof TunnelItem) {
      context = tunnel.strip();
    }
    if (!context) {
      context = {
        tunnelType: tunnel.tunnelType,
        remoteHost: tunnel.remoteHost,
        remotePort: tunnel.remotePort,
        localAddress: tunnel.localAddress,
        protocol: tunnel.protocol,
        localUri: tunnel.localUri,
        localPort: tunnel.localPort,
        name: tunnel.name,
        closeable: tunnel.closeable,
        source: tunnel.source,
        privacy: tunnel.privacy,
        processDescription: tunnel.processDescription,
        label: tunnel.label
      };
    }
    return context;
  }
  renderActionBarItem(element, templateData) {
    templateData.label.element.style.display = "flex";
    templateData.label.setLabel(
      element.label,
      void 0,
      {
        title: element.markdownTooltip ? { markdown: element.markdownTooltip(this.configurationService), markdownNotSupportedFallback: element.tooltip } : element.tooltip,
        extraClasses: element.menuId === MenuId.TunnelLocalAddressInline ? ["ports-view-actionbar-cell-localaddress"] : void 0
      }
    );
    templateData.actionBar.context = this.tunnelContext(element.tunnel);
    templateData.container.style.paddingLeft = "10px";
    const context = [
      ["view", TUNNEL_VIEW_ID],
      [TunnelTypeContextKey.key, element.tunnel.tunnelType],
      [TunnelCloseableContextKey.key, element.tunnel.closeable],
      [TunnelPrivacyContextKey.key, element.tunnel.privacy.id],
      [TunnelProtocolContextKey.key, element.tunnel.protocol]
    ];
    const contextKeyService = this.contextKeyService.createOverlay(context);
    if (element.menuId) {
      const menu = templateData.elementDisposables.add(this.menuService.createMenu(element.menuId, contextKeyService));
      let actions = getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
      if (actions) {
        const labelActions = actions.filter((action) => action.id.toLowerCase().indexOf("label") >= 0);
        if (labelActions.length > 1) {
          labelActions.sort((a, b) => a.label.length - b.label.length);
          labelActions.pop();
          actions = actions.filter((action) => labelActions.indexOf(action) < 0);
        }
        templateData.actionBar.push(actions, { icon: true, label: false });
        if (this._actionRunner) {
          templateData.actionBar.actionRunner = this._actionRunner;
        }
      }
    }
    if (element.icon) {
      templateData.icon.className = `ports-view-actionbar-cell-icon ${ThemeIcon.asClassName(element.icon)}`;
      templateData.icon.title = element.tooltip;
      templateData.icon.style.display = "inline";
    }
  }
  renderInputBox(templateData, editableData) {
    if (this.inputDone) {
      this.inputDone(false, false);
      this.inputDone = void 0;
    }
    const { container } = templateData;
    container.style.paddingLeft = "5px";
    const value = editableData.startingValue || "";
    const inputBox = new InputBox(container, this.contextViewService, {
      ariaLabel: nls.localize("remote.tunnelsView.input", "Press Enter to confirm or Escape to cancel."),
      validationOptions: {
        validation: (value2) => {
          const message = editableData.validationMessage(value2);
          if (!message) {
            return null;
          }
          return {
            content: message.content,
            formatContent: true,
            type: message.severity === Severity.Error ? MessageType.ERROR : MessageType.INFO
          };
        }
      },
      placeholder: editableData.placeholder || "",
      inputBoxStyles: defaultInputBoxStyles
    });
    inputBox.value = value;
    inputBox.focus();
    inputBox.select({ start: 0, end: editableData.startingValue ? editableData.startingValue.length : 0 });
    const done = createSingleCallFunction(async (success, finishEditing) => {
      dispose(toDispose);
      if (this.inputDone) {
        this.inputDone = void 0;
      }
      inputBox.element.style.display = "none";
      const inputValue = inputBox.value;
      if (finishEditing) {
        return editableData.onFinish(inputValue, success);
      }
    });
    this.inputDone = done;
    const toDispose = [
      inputBox,
      dom.addStandardDisposableListener(inputBox.inputElement, dom.EventType.KEY_DOWN, async (e) => {
        if (e.equals(KeyCode.Enter)) {
          e.stopPropagation();
          if (inputBox.validate() !== MessageType.ERROR) {
            return done(true, true);
          } else {
            return done(false, true);
          }
        } else if (e.equals(KeyCode.Escape)) {
          e.preventDefault();
          e.stopPropagation();
          return done(false, true);
        }
      }),
      dom.addDisposableListener(inputBox.inputElement, dom.EventType.BLUR, () => {
        return done(inputBox.validate() !== MessageType.ERROR, true);
      })
    ];
    templateData.elementDisposables.add(toDisposable(() => {
      done(false, false);
    }));
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
};
ActionBarRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IMenuService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IRemoteExplorerService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IConfigurationService)
], ActionBarRenderer);
class TunnelItem {
  constructor(tunnelType, remoteHost, remotePort, source, hasRunningProcess, protocol, localUri, localAddress, localPort, closeable, name, runningProcess, pid, _privacy, remoteExplorerService, tunnelService) {
    this.tunnelType = tunnelType;
    this.remoteHost = remoteHost;
    this.remotePort = remotePort;
    this.source = source;
    this.hasRunningProcess = hasRunningProcess;
    this.protocol = protocol;
    this.localUri = localUri;
    this.localAddress = localAddress;
    this.localPort = localPort;
    this.closeable = closeable;
    this.name = name;
    this.runningProcess = runningProcess;
    this.pid = pid;
    this._privacy = _privacy;
    this.remoteExplorerService = remoteExplorerService;
    this.tunnelService = tunnelService;
  }
  static createFromTunnel(remoteExplorerService, tunnelService, tunnel, type = TunnelType.Forwarded, closeable) {
    return new TunnelItem(
      type,
      tunnel.remoteHost,
      tunnel.remotePort,
      tunnel.source,
      !!tunnel.hasRunningProcess,
      tunnel.protocol,
      tunnel.localUri,
      tunnel.localAddress,
      tunnel.localPort,
      closeable === void 0 ? tunnel.closeable : closeable,
      tunnel.name,
      tunnel.runningProcess,
      tunnel.pid,
      tunnel.privacy,
      remoteExplorerService,
      tunnelService
    );
  }
  /**
   * Removes all non-serializable properties from the tunnel
   * @returns A new TunnelItem without any services
   */
  strip() {
    return new TunnelItem(
      this.tunnelType,
      this.remoteHost,
      this.remotePort,
      this.source,
      this.hasRunningProcess,
      this.protocol,
      this.localUri,
      this.localAddress,
      this.localPort,
      this.closeable,
      this.name,
      this.runningProcess,
      this.pid,
      this._privacy
    );
  }
  get label() {
    if (this.tunnelType === TunnelType.Add && this.name) {
      return this.name;
    }
    const portNumberLabel = isLocalhost(this.remoteHost) || isAllInterfaces(this.remoteHost) ? `${this.remotePort}` : `${this.remoteHost}:${this.remotePort}`;
    if (this.name) {
      return `${this.name} (${portNumberLabel})`;
    } else {
      return portNumberLabel;
    }
  }
  set processDescription(description) {
    this.runningProcess = description;
  }
  get processDescription() {
    let description = "";
    if (this.runningProcess) {
      if (this.pid && this.remoteExplorerService?.namedProcesses.has(this.pid)) {
        description = this.remoteExplorerService.namedProcesses.get(this.pid);
      } else {
        description = this.runningProcess.replace(/\0/g, " ").trim();
      }
      if (this.pid) {
        description += ` (${this.pid})`;
      }
    } else if (this.hasRunningProcess) {
      description = nls.localize("tunnelView.runningProcess.inacessable", "Process information unavailable");
    }
    return description;
  }
  get tooltipPostfix() {
    let information;
    if (this.localAddress) {
      information = nls.localize("remote.tunnel.tooltipForwarded", "Remote port {0}:{1} forwarded to local address {2}. ", this.remoteHost, this.remotePort, this.localAddress);
    } else {
      information = nls.localize("remote.tunnel.tooltipCandidate", "Remote port {0}:{1} not forwarded. ", this.remoteHost, this.remotePort);
    }
    return information;
  }
  get iconTooltip() {
    const isAdd = this.tunnelType === TunnelType.Add;
    if (!isAdd) {
      return `${this.processDescription ? nls.localize("tunnel.iconColumn.running", "Port has running process.") : nls.localize("tunnel.iconColumn.notRunning", "No running process.")}`;
    } else {
      return this.label;
    }
  }
  get portTooltip() {
    const isAdd = this.tunnelType === TunnelType.Add;
    if (!isAdd) {
      return `${this.name ? nls.localize("remote.tunnel.tooltipName", "Port labeled {0}. ", this.name) : ""}`;
    } else {
      return "";
    }
  }
  get processTooltip() {
    return this.processDescription ?? "";
  }
  get originTooltip() {
    return this.source.description;
  }
  get privacy() {
    if (this.tunnelService?.privacyOptions) {
      return this.tunnelService?.privacyOptions.find((element) => element.id === this._privacy) ?? {
        id: "",
        themeIcon: Codicon.question.id,
        label: nls.localize("tunnelPrivacy.unknown", "Unknown")
      };
    } else {
      return {
        id: TunnelPrivacyId.Private,
        themeIcon: privatePortIcon.id,
        label: nls.localize("tunnelPrivacy.private", "Private")
      };
    }
  }
}
const TunnelTypeContextKey = new RawContextKey("tunnelType", TunnelType.Add, true);
const TunnelCloseableContextKey = new RawContextKey("tunnelCloseable", false, true);
const TunnelPrivacyContextKey = new RawContextKey("tunnelPrivacy", void 0, true);
const TunnelPrivacyEnabledContextKey = new RawContextKey("tunnelPrivacyEnabled", false, true);
const TunnelProtocolContextKey = new RawContextKey("tunnelProtocol", TunnelProtocol.Http, true);
const TunnelViewFocusContextKey = new RawContextKey("tunnelViewFocus", false, nls.localize("tunnel.focusContext", "Whether the Ports view has focus."));
const TunnelViewSelectionKeyName = "tunnelViewSelection";
const TunnelViewSelectionContextKey = new RawContextKey(TunnelViewSelectionKeyName, void 0, true);
const TunnelViewMultiSelectionKeyName = "tunnelViewMultiSelection";
const TunnelViewMultiSelectionContextKey = new RawContextKey(TunnelViewMultiSelectionKeyName, void 0, true);
const PortChangableContextKey = new RawContextKey("portChangable", false, true);
const ProtocolChangeableContextKey = new RawContextKey("protocolChangable", true, true);
let TunnelPanel = class extends ViewPane {
  constructor(viewModel, options, keybindingService, contextMenuService, contextKeyService, configurationService, instantiationService, viewDescriptorService, openerService, quickInputService, commandService, menuService, themeService, remoteExplorerService, hoverService, tunnelService, contextViewService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.viewModel = viewModel;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.menuService = menuService;
    this.remoteExplorerService = remoteExplorerService;
    this.tunnelService = tunnelService;
    this.contextViewService = contextViewService;
    this.tableDisposables = this._register(new DisposableStore());
    this.isEditing = false;
    // TODO: Should this be removed?
    //@ts-expect-error
    this.titleActions = [];
    this.lastFocus = [];
    this.height = 0;
    this.width = 0;
    this.tunnelTypeContext = TunnelTypeContextKey.bindTo(contextKeyService);
    this.tunnelCloseableContext = TunnelCloseableContextKey.bindTo(contextKeyService);
    this.tunnelPrivacyContext = TunnelPrivacyContextKey.bindTo(contextKeyService);
    this.tunnelPrivacyEnabledContext = TunnelPrivacyEnabledContextKey.bindTo(contextKeyService);
    this.tunnelPrivacyEnabledContext.set(tunnelService.canChangePrivacy);
    this.protocolChangableContextKey = ProtocolChangeableContextKey.bindTo(contextKeyService);
    this.protocolChangableContextKey.set(tunnelService.canChangeProtocol);
    this.tunnelProtocolContext = TunnelProtocolContextKey.bindTo(contextKeyService);
    this.tunnelViewFocusContext = TunnelViewFocusContextKey.bindTo(contextKeyService);
    this.tunnelViewSelectionContext = TunnelViewSelectionContextKey.bindTo(contextKeyService);
    this.tunnelViewMultiSelectionContext = TunnelViewMultiSelectionContextKey.bindTo(contextKeyService);
    this.portChangableContextKey = PortChangableContextKey.bindTo(contextKeyService);
    const overlayContextKeyService = this.contextKeyService.createOverlay([["view", TunnelPanel.ID]]);
    const titleMenu = this._register(this.menuService.createMenu(MenuId.TunnelTitle, overlayContextKeyService));
    const updateActions = () => {
      this.titleActions = getFlatActionBarActions(titleMenu.getActions());
      this.updateActions();
    };
    this._register(titleMenu.onDidChange(updateActions));
    updateActions();
    this._register(toDisposable(() => {
      this.titleActions = [];
    }));
    this.registerPrivacyActions();
    this._register(Event.once(this.tunnelService.onAddedTunnelProvider)(() => {
      let updated = false;
      if (this.tunnelPrivacyEnabledContext.get() === false) {
        this.tunnelPrivacyEnabledContext.set(tunnelService.canChangePrivacy);
        updated = true;
      }
      if (this.protocolChangableContextKey.get() === true) {
        this.protocolChangableContextKey.set(tunnelService.canChangeProtocol);
        updated = true;
      }
      if (updated) {
        updateActions();
        this.registerPrivacyActions();
        this.createTable();
        this.table?.layout(this.height, this.width);
      }
    }));
  }
  registerPrivacyActions() {
    for (const privacyOption of this.tunnelService.privacyOptions) {
      const optionId = `remote.tunnel.privacy${privacyOption.id}`;
      CommandsRegistry.registerCommand(optionId, ChangeTunnelPrivacyAction.handler(privacyOption.id));
      MenuRegistry.appendMenuItem(MenuId.TunnelPrivacy, {
        order: 0,
        command: {
          id: optionId,
          title: privacyOption.label,
          toggled: TunnelPrivacyContextKey.isEqualTo(privacyOption.id)
        }
      });
    }
  }
  get portCount() {
    return this.remoteExplorerService.tunnelModel.forwarded.size + this.remoteExplorerService.tunnelModel.detected.size;
  }
  createTable() {
    if (!this.panelContainer) {
      return;
    }
    this.tableDisposables.clear();
    dom.clearNode(this.panelContainer);
    const widgetContainer = dom.append(this.panelContainer, dom.$(".customview-tree"));
    widgetContainer.classList.add("ports-view");
    widgetContainer.classList.add("file-icon-themable-tree", "show-file-icons");
    const actionBarRenderer = new ActionBarRenderer(
      this.instantiationService,
      this.contextKeyService,
      this.menuService,
      this.contextViewService,
      this.remoteExplorerService,
      this.commandService,
      this.configurationService
    );
    const columns = [new IconColumn(), new PortColumn(), new LocalAddressColumn(), new RunningProcessColumn()];
    if (this.tunnelService.canChangePrivacy) {
      columns.push(new PrivacyColumn());
    }
    columns.push(new OriginColumn());
    this.table = this.instantiationService.createInstance(
      WorkbenchTable,
      "RemoteTunnels",
      widgetContainer,
      new TunnelTreeVirtualDelegate(this.remoteExplorerService),
      columns,
      [actionBarRenderer],
      {
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (item) => {
            return item.label;
          }
        },
        multipleSelectionSupport: true,
        accessibilityProvider: {
          getAriaLabel: (item) => {
            if (item instanceof TunnelItem) {
              return `${item.tooltipPostfix} ${item.portTooltip} ${item.iconTooltip} ${item.processTooltip} ${item.originTooltip} ${this.tunnelService.canChangePrivacy ? item.privacy.label : ""}`;
            } else {
              return item.label;
            }
          },
          getWidgetAriaLabel: () => nls.localize("tunnelView", "Tunnel View")
        },
        openOnSingleClick: true
      }
    );
    const actionRunner = this.tableDisposables.add(new ActionRunner());
    actionBarRenderer.actionRunner = actionRunner;
    this.tableDisposables.add(this.table);
    this.tableDisposables.add(this.table.onContextMenu((e) => this.onContextMenu(e, actionRunner)));
    this.tableDisposables.add(this.table.onMouseDblClick((e) => this.onMouseDblClick(e)));
    this.tableDisposables.add(this.table.onDidChangeFocus((e) => this.onFocusChanged(e)));
    this.tableDisposables.add(this.table.onDidChangeSelection((e) => this.onSelectionChanged(e)));
    this.tableDisposables.add(this.table.onDidFocus(() => this.tunnelViewFocusContext.set(true)));
    this.tableDisposables.add(this.table.onDidBlur(() => this.tunnelViewFocusContext.set(false)));
    const rerender = () => this.table?.splice(0, Number.POSITIVE_INFINITY, this.viewModel.all);
    rerender();
    let lastPortCount = this.portCount;
    this.tableDisposables.add(Event.debounce(this.viewModel.onForwardedPortsChanged, (_last, e) => e, 50)(() => {
      const newPortCount = this.portCount;
      if ((lastPortCount === 0 || newPortCount === 0) && lastPortCount !== newPortCount) {
        this._onDidChangeViewWelcomeState.fire();
      }
      lastPortCount = newPortCount;
      rerender();
    }));
    this.tableDisposables.add(this.table.onMouseClick((e) => {
      if (this.hasOpenLinkModifier(e.browserEvent) && this.table) {
        const selection = this.table.getSelectedElements();
        if (selection.length === 0 || selection.length === 1 && selection[0] === e.element) {
          this.commandService.executeCommand(OpenPortInBrowserAction.ID, e.element);
        }
      }
    }));
    this.tableDisposables.add(this.table.onDidOpen((e) => {
      if (!e.element || e.element.tunnelType !== TunnelType.Forwarded) {
        return;
      }
      if (e.browserEvent?.type === "dblclick") {
        this.commandService.executeCommand(LabelTunnelAction.ID);
      }
    }));
    this.tableDisposables.add(this.remoteExplorerService.onDidChangeEditable((e) => {
      this.isEditing = !!this.remoteExplorerService.getEditableData(e?.tunnel, e?.editId);
      this._onDidChangeViewWelcomeState.fire();
      if (!this.isEditing) {
        widgetContainer.classList.remove("highlight");
      }
      rerender();
      if (this.isEditing) {
        widgetContainer.classList.add("highlight");
        if (!e) {
          this.table?.reveal(this.table.indexOf(this.viewModel.input));
        }
      } else {
        if (e && e.tunnel.tunnelType !== TunnelType.Add) {
          this.table?.setFocus(this.lastFocus);
        }
        this.focus();
      }
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    this.panelContainer = dom.append(container, dom.$(".tree-explorer-viewlet-tree-view"));
    this.createTable();
  }
  shouldShowWelcome() {
    return this.viewModel.isEmpty() && !this.isEditing;
  }
  focus() {
    super.focus();
    this.table?.domFocus();
  }
  onFocusChanged(event) {
    if (event.indexes.length > 0 && event.elements.length > 0) {
      this.lastFocus = [...event.indexes];
    }
    const elements = event.elements;
    const item = elements && elements.length ? elements[0] : void 0;
    if (item) {
      this.tunnelViewSelectionContext.set(makeAddress(item.remoteHost, item.remotePort));
      this.tunnelTypeContext.set(item.tunnelType);
      this.tunnelCloseableContext.set(!!item.closeable);
      this.tunnelPrivacyContext.set(item.privacy.id);
      this.tunnelProtocolContext.set(item.protocol === TunnelProtocol.Https ? TunnelProtocol.Https : TunnelProtocol.Http);
      this.portChangableContextKey.set(!!item.localPort);
    } else {
      this.tunnelTypeContext.reset();
      this.tunnelViewSelectionContext.reset();
      this.tunnelCloseableContext.reset();
      this.tunnelPrivacyContext.reset();
      this.tunnelProtocolContext.reset();
      this.portChangableContextKey.reset();
    }
  }
  hasOpenLinkModifier(e) {
    const editorConf = this.configurationService.getValue("editor");
    let modifierKey = false;
    if (editorConf.multiCursorModifier === "ctrlCmd") {
      modifierKey = e.altKey;
    } else {
      if (isMacintosh) {
        modifierKey = e.metaKey;
      } else {
        modifierKey = e.ctrlKey;
      }
    }
    return modifierKey;
  }
  onSelectionChanged(event) {
    const elements = event.elements;
    if (elements.length > 1) {
      this.tunnelViewMultiSelectionContext.set(elements.map((element) => makeAddress(element.remoteHost, element.remotePort)));
    } else {
      this.tunnelViewMultiSelectionContext.set(void 0);
    }
  }
  onContextMenu(event, actionRunner) {
    if (event.element !== void 0 && !(event.element instanceof TunnelItem)) {
      return;
    }
    event.browserEvent.preventDefault();
    event.browserEvent.stopPropagation();
    const node = event.element;
    if (node) {
      this.table?.setFocus([this.table.indexOf(node)]);
      this.tunnelTypeContext.set(node.tunnelType);
      this.tunnelCloseableContext.set(!!node.closeable);
      this.tunnelPrivacyContext.set(node.privacy.id);
      this.tunnelProtocolContext.set(node.protocol);
      this.portChangableContextKey.set(!!node.localPort);
    } else {
      this.tunnelTypeContext.set(TunnelType.Add);
      this.tunnelCloseableContext.set(false);
      this.tunnelPrivacyContext.set(void 0);
      this.tunnelProtocolContext.set(void 0);
      this.portChangableContextKey.set(false);
    }
    this.contextMenuService.showContextMenu({
      menuId: MenuId.TunnelContext,
      menuActionOptions: { shouldForwardArgs: true },
      contextKeyService: this.table?.contextKeyService,
      getAnchor: () => event.anchor,
      getActionViewItem: (action) => {
        const keybinding = this.keybindingService.lookupKeybinding(action.id);
        if (keybinding) {
          return new ActionViewItem(action, action, { label: true, keybinding: keybinding.getLabel() });
        }
        return void 0;
      },
      onHide: (wasCancelled) => {
        if (wasCancelled) {
          this.table?.domFocus();
        }
      },
      getActionsContext: () => node?.strip(),
      actionRunner
    });
  }
  onMouseDblClick(e) {
    if (!e.element) {
      this.commandService.executeCommand(ForwardPortAction.INLINE_ID);
    }
  }
  layoutBody(height, width) {
    this.height = height;
    this.width = width;
    super.layoutBody(height, width);
    this.table?.layout(height, width);
  }
};
TunnelPanel.ID = TUNNEL_VIEW_ID;
TunnelPanel.TITLE = nls.localize2("remote.tunnel", "Ports");
TunnelPanel = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IViewDescriptorService),
  __decorateParam(8, IOpenerService),
  __decorateParam(9, IQuickInputService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IMenuService),
  __decorateParam(12, IThemeService),
  __decorateParam(13, IRemoteExplorerService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, ITunnelService),
  __decorateParam(16, IContextViewService)
], TunnelPanel);
class TunnelPanelDescriptor {
  constructor(viewModel, environmentService) {
    this.id = TunnelPanel.ID;
    this.name = TunnelPanel.TITLE;
    this.canToggleVisibility = true;
    this.hideByDefault = false;
    // group is not actually used for views that are not extension contributed. Use order instead.
    this.group = "details@0";
    // -500 comes from the remote explorer viewOrderDelegate
    this.order = -500;
    this.canMoveView = true;
    this.containerIcon = portsViewIcon;
    this.ctorDescriptor = new SyncDescriptor(TunnelPanel, [viewModel]);
    this.remoteAuthority = environmentService.remoteAuthority ? environmentService.remoteAuthority.split("+")[0] : void 0;
  }
}
function isITunnelItem(item) {
  return item && item.tunnelType && item.remoteHost && item.source;
}
var LabelTunnelAction;
((LabelTunnelAction2) => {
  LabelTunnelAction2.ID = "remote.tunnel.label";
  LabelTunnelAction2.LABEL = nls.localize("remote.tunnel.label", "Set Port Label");
  LabelTunnelAction2.COMMAND_ID_KEYWORD = "label";
  function handler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      let tunnelContext;
      if (isITunnelItem(arg)) {
        tunnelContext = arg;
      } else {
        const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
        const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : void 0;
        if (tunnel) {
          const tunnelService = accessor.get(ITunnelService);
          tunnelContext = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, tunnel);
        }
      }
      if (tunnelContext) {
        const tunnelItem = tunnelContext;
        return new Promise((resolve) => {
          const startingValue = tunnelItem.name ? tunnelItem.name : `${tunnelItem.remotePort}`;
          remoteExplorerService.setEditable(tunnelItem, TunnelEditId.Label, {
            onFinish: async (value, success) => {
              value = value.trim();
              remoteExplorerService.setEditable(tunnelItem, TunnelEditId.Label, null);
              const changed = success && value !== startingValue;
              if (changed) {
                await remoteExplorerService.tunnelModel.name(tunnelItem.remoteHost, tunnelItem.remotePort, value);
              }
              resolve(changed ? { port: tunnelItem.remotePort, label: value } : void 0);
            },
            validationMessage: () => null,
            placeholder: nls.localize("remote.tunnelsView.labelPlaceholder", "Port label"),
            startingValue
          });
        });
      }
      return void 0;
    };
  }
  LabelTunnelAction2.handler = handler;
})(LabelTunnelAction || (LabelTunnelAction = {}));
const invalidPortString = nls.localize("remote.tunnelsView.portNumberValid", "Forwarded port should be a number or a host:port.");
const maxPortNumber = 65536;
const invalidPortNumberString = nls.localize("remote.tunnelsView.portNumberToHigh", "Port number must be \u2265 0 and < {0}.", maxPortNumber);
const requiresSudoString = nls.localize("remote.tunnelView.inlineElevationMessage", "May Require Sudo");
const alreadyForwarded = nls.localize("remote.tunnelView.alreadyForwarded", "Port is already forwarded");
var ForwardPortAction;
((ForwardPortAction2) => {
  ForwardPortAction2.INLINE_ID = "remote.tunnel.forwardInline";
  ForwardPortAction2.COMMANDPALETTE_ID = "remote.tunnel.forwardCommandPalette";
  ForwardPortAction2.LABEL = nls.localize2("remote.tunnel.forward", "Forward a Port");
  ForwardPortAction2.TREEITEM_LABEL = nls.localize("remote.tunnel.forwardItem", "Forward Port");
  const forwardPrompt = nls.localize("remote.tunnel.forwardPrompt", "Port number or address (eg. 3000 or 10.10.10.10:2000).");
  function validateInput(remoteExplorerService, tunnelService, value, canElevate) {
    const parsed = parseAddress(value);
    if (!parsed) {
      return { content: invalidPortString, severity: Severity.Error };
    } else if (parsed.port >= maxPortNumber) {
      return { content: invalidPortNumberString, severity: Severity.Error };
    } else if (canElevate && tunnelService.isPortPrivileged(parsed.port)) {
      return { content: requiresSudoString, severity: Severity.Info };
    } else if (mapHasAddressLocalhostOrAllInterfaces(remoteExplorerService.tunnelModel.forwarded, parsed.host, parsed.port)) {
      return { content: alreadyForwarded, severity: Severity.Error };
    }
    return null;
  }
  function error(notificationService, tunnelOrError, host, port) {
    if (!tunnelOrError) {
      notificationService.warn(nls.localize("remote.tunnel.forwardError", "Unable to forward {0}:{1}. The host may not be available or that remote port may already be forwarded", host, port));
    } else if (typeof tunnelOrError === "string") {
      notificationService.warn(nls.localize("remote.tunnel.forwardErrorProvided", "Unable to forward {0}:{1}. {2}", host, port, tunnelOrError));
    }
  }
  function inlineHandler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const notificationService = accessor.get(INotificationService);
      const tunnelService = accessor.get(ITunnelService);
      remoteExplorerService.setEditable(void 0, TunnelEditId.New, {
        onFinish: async (value, success) => {
          remoteExplorerService.setEditable(void 0, TunnelEditId.New, null);
          let parsed;
          if (success && (parsed = parseAddress(value))) {
            remoteExplorerService.forward({
              remote: { host: parsed.host, port: parsed.port },
              elevateIfNeeded: true
            }).then((tunnelOrError) => error(notificationService, tunnelOrError, parsed.host, parsed.port));
          }
        },
        validationMessage: (value) => validateInput(remoteExplorerService, tunnelService, value, tunnelService.canElevate),
        placeholder: forwardPrompt
      });
    };
  }
  ForwardPortAction2.inlineHandler = inlineHandler;
  function commandPaletteHandler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const notificationService = accessor.get(INotificationService);
      const viewsService = accessor.get(IViewsService);
      const quickInputService = accessor.get(IQuickInputService);
      const tunnelService = accessor.get(ITunnelService);
      await viewsService.openView(TunnelPanel.ID, true);
      const value = await quickInputService.input({
        prompt: forwardPrompt,
        validateInput: (value2) => Promise.resolve(validateInput(remoteExplorerService, tunnelService, value2, tunnelService.canElevate))
      });
      let parsed;
      if (value && (parsed = parseAddress(value))) {
        remoteExplorerService.forward({
          remote: { host: parsed.host, port: parsed.port },
          elevateIfNeeded: true
        }).then((tunnel) => error(notificationService, tunnel, parsed.host, parsed.port));
      }
    };
  }
  ForwardPortAction2.commandPaletteHandler = commandPaletteHandler;
})(ForwardPortAction || (ForwardPortAction = {}));
function makeTunnelPicks(tunnels, remoteExplorerService, tunnelService) {
  const picks = tunnels.map((forwarded) => {
    const item = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, forwarded);
    return {
      label: item.label,
      description: item.processDescription,
      tunnel: item
    };
  });
  if (picks.length === 0) {
    picks.push({
      label: nls.localize("remote.tunnel.closeNoPorts", "No ports currently forwarded. Try running the {0} command", ForwardPortAction.LABEL.value)
    });
  }
  return picks;
}
var ClosePortAction;
((ClosePortAction2) => {
  ClosePortAction2.INLINE_ID = "remote.tunnel.closeInline";
  ClosePortAction2.COMMANDPALETTE_ID = "remote.tunnel.closeCommandPalette";
  ClosePortAction2.LABEL = nls.localize2("remote.tunnel.close", "Stop Forwarding Port");
  function inlineHandler() {
    return async (accessor, arg) => {
      const contextKeyService = accessor.get(IContextKeyService);
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      let ports = [];
      const multiSelectContext = contextKeyService.getContextKeyValue(TunnelViewMultiSelectionKeyName);
      if (multiSelectContext) {
        multiSelectContext.forEach((context) => {
          const tunnel = remoteExplorerService.tunnelModel.forwarded.get(context);
          if (tunnel) {
            ports?.push(tunnel);
          }
        });
      } else if (isITunnelItem(arg)) {
        ports = [arg];
      } else {
        const context = contextKeyService.getContextKeyValue(TunnelViewSelectionKeyName);
        const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : void 0;
        if (tunnel) {
          ports = [tunnel];
        }
      }
      if (!ports || ports.length === 0) {
        return;
      }
      return Promise.all(ports.map((port) => remoteExplorerService.close({ host: port.remoteHost, port: port.remotePort }, TunnelCloseReason.User)));
    };
  }
  ClosePortAction2.inlineHandler = inlineHandler;
  function commandPaletteHandler() {
    return async (accessor) => {
      const quickInputService = accessor.get(IQuickInputService);
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const tunnelService = accessor.get(ITunnelService);
      const commandService = accessor.get(ICommandService);
      const picks = makeTunnelPicks(Array.from(remoteExplorerService.tunnelModel.forwarded.values()).filter((tunnel) => tunnel.closeable), remoteExplorerService, tunnelService);
      const result = await quickInputService.pick(picks, { placeHolder: nls.localize("remote.tunnel.closePlaceholder", "Choose a port to stop forwarding") });
      if (result && result.tunnel) {
        await remoteExplorerService.close({ host: result.tunnel.remoteHost, port: result.tunnel.remotePort }, TunnelCloseReason.User);
      } else if (result) {
        await commandService.executeCommand(ForwardPortAction.COMMANDPALETTE_ID);
      }
    };
  }
  ClosePortAction2.commandPaletteHandler = commandPaletteHandler;
})(ClosePortAction || (ClosePortAction = {}));
var OpenPortInBrowserAction;
((OpenPortInBrowserAction2) => {
  OpenPortInBrowserAction2.ID = "remote.tunnel.open";
  OpenPortInBrowserAction2.LABEL = nls.localize("remote.tunnel.open", "Open in Browser");
  function handler() {
    return async (accessor, arg) => {
      let key;
      if (isITunnelItem(arg)) {
        key = makeAddress(arg.remoteHost, arg.remotePort);
      } else if (isRemoteTunnel(arg)) {
        key = makeAddress(arg.tunnelRemoteHost, arg.tunnelRemotePort);
      }
      if (key) {
        const model = accessor.get(IRemoteExplorerService).tunnelModel;
        const openerService = accessor.get(IOpenerService);
        return run(model, openerService, key);
      }
    };
  }
  OpenPortInBrowserAction2.handler = handler;
  function run(model, openerService, key) {
    const tunnel = model.forwarded.get(key) || model.detected.get(key);
    if (tunnel) {
      return openerService.open(tunnel.localUri, { allowContributedOpeners: false });
    }
    return Promise.resolve();
  }
  OpenPortInBrowserAction2.run = run;
})(OpenPortInBrowserAction || (OpenPortInBrowserAction = {}));
var OpenPortInPreviewAction;
((OpenPortInPreviewAction2) => {
  OpenPortInPreviewAction2.ID = "remote.tunnel.openPreview";
  OpenPortInPreviewAction2.LABEL = nls.localize("remote.tunnel.openPreview", "Preview in Editor");
  function handler() {
    return async (accessor, arg) => {
      let key;
      if (isITunnelItem(arg)) {
        key = makeAddress(arg.remoteHost, arg.remotePort);
      } else if (isRemoteTunnel(arg)) {
        key = makeAddress(arg.tunnelRemoteHost, arg.tunnelRemotePort);
      }
      if (key) {
        const model = accessor.get(IRemoteExplorerService).tunnelModel;
        const openerService = accessor.get(IOpenerService);
        const externalOpenerService = accessor.get(IExternalUriOpenerService);
        return run(model, openerService, externalOpenerService, key);
      }
    };
  }
  OpenPortInPreviewAction2.handler = handler;
  async function run(model, openerService, externalOpenerService, key) {
    const tunnel = model.forwarded.get(key) || model.detected.get(key);
    if (tunnel) {
      const remoteHost = tunnel.remoteHost.includes(":") ? `[${tunnel.remoteHost}]` : tunnel.remoteHost;
      const sourceUri = URI.parse(`http://${remoteHost}:${tunnel.remotePort}`);
      const opener = await externalOpenerService.getOpener(tunnel.localUri, { sourceUri }, CancellationToken.None);
      if (opener) {
        return opener.openExternalUri(tunnel.localUri, { sourceUri }, CancellationToken.None);
      }
      return openerService.open(tunnel.localUri);
    }
    return Promise.resolve();
  }
  OpenPortInPreviewAction2.run = run;
})(OpenPortInPreviewAction || (OpenPortInPreviewAction = {}));
var OpenPortInBrowserCommandPaletteAction;
((OpenPortInBrowserCommandPaletteAction2) => {
  OpenPortInBrowserCommandPaletteAction2.ID = "remote.tunnel.openCommandPalette";
  OpenPortInBrowserCommandPaletteAction2.LABEL = nls.localize("remote.tunnel.openCommandPalette", "Open Port in Browser");
  function handler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const tunnelService = accessor.get(ITunnelService);
      const model = remoteExplorerService.tunnelModel;
      const quickPickService = accessor.get(IQuickInputService);
      const openerService = accessor.get(IOpenerService);
      const commandService = accessor.get(ICommandService);
      const options = [...model.forwarded, ...model.detected].map((value) => {
        const tunnelItem = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService, value[1]);
        return {
          label: tunnelItem.label,
          description: tunnelItem.processDescription,
          tunnel: tunnelItem
        };
      });
      if (options.length === 0) {
        options.push({
          label: nls.localize("remote.tunnel.openCommandPaletteNone", "No ports currently forwarded. Open the Ports view to get started.")
        });
      } else {
        options.push({
          label: nls.localize("remote.tunnel.openCommandPaletteView", "Open the Ports view...")
        });
      }
      const picked = await quickPickService.pick(options, { placeHolder: nls.localize("remote.tunnel.openCommandPalettePick", "Choose the port to open") });
      if (picked && picked.tunnel) {
        return OpenPortInBrowserAction.run(model, openerService, makeAddress(picked.tunnel.remoteHost, picked.tunnel.remotePort));
      } else if (picked) {
        return commandService.executeCommand(`${TUNNEL_VIEW_ID}.focus`);
      }
    };
  }
  OpenPortInBrowserCommandPaletteAction2.handler = handler;
})(OpenPortInBrowserCommandPaletteAction || (OpenPortInBrowserCommandPaletteAction = {}));
var CopyAddressAction;
((CopyAddressAction2) => {
  CopyAddressAction2.INLINE_ID = "remote.tunnel.copyAddressInline";
  CopyAddressAction2.COMMANDPALETTE_ID = "remote.tunnel.copyAddressCommandPalette";
  CopyAddressAction2.INLINE_LABEL = nls.localize("remote.tunnel.copyAddressInline", "Copy Local Address");
  CopyAddressAction2.COMMANDPALETTE_LABEL = nls.localize("remote.tunnel.copyAddressCommandPalette", "Copy Forwarded Port Address");
  async function copyAddress(remoteExplorerService, clipboardService, tunnelItem) {
    const address = remoteExplorerService.tunnelModel.address(tunnelItem.remoteHost, tunnelItem.remotePort);
    if (address) {
      await clipboardService.writeText(address.toString());
    }
  }
  function inlineHandler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      let tunnelItem;
      if (isITunnelItem(arg)) {
        tunnelItem = arg;
      } else {
        const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
        tunnelItem = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : void 0;
      }
      if (tunnelItem) {
        return copyAddress(remoteExplorerService, accessor.get(IClipboardService), tunnelItem);
      }
    };
  }
  CopyAddressAction2.inlineHandler = inlineHandler;
  function commandPaletteHandler() {
    return async (accessor, arg) => {
      const quickInputService = accessor.get(IQuickInputService);
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const tunnelService = accessor.get(ITunnelService);
      const commandService = accessor.get(ICommandService);
      const clipboardService = accessor.get(IClipboardService);
      const tunnels = Array.from(remoteExplorerService.tunnelModel.forwarded.values()).concat(Array.from(remoteExplorerService.tunnelModel.detected.values()));
      const result = await quickInputService.pick(makeTunnelPicks(tunnels, remoteExplorerService, tunnelService), { placeHolder: nls.localize("remote.tunnel.copyAddressPlaceholdter", "Choose a forwarded port") });
      if (result && result.tunnel) {
        await copyAddress(remoteExplorerService, clipboardService, result.tunnel);
      } else if (result) {
        await commandService.executeCommand(ForwardPortAction.COMMANDPALETTE_ID);
      }
    };
  }
  CopyAddressAction2.commandPaletteHandler = commandPaletteHandler;
})(CopyAddressAction || (CopyAddressAction = {}));
var ChangeLocalPortAction;
((ChangeLocalPortAction2) => {
  ChangeLocalPortAction2.ID = "remote.tunnel.changeLocalPort";
  ChangeLocalPortAction2.LABEL = nls.localize("remote.tunnel.changeLocalPort", "Change Local Address Port");
  function validateInput(tunnelService, value, canElevate) {
    if (!value.match(/^[0-9]+$/)) {
      return { content: nls.localize("remote.tunnelsView.portShouldBeNumber", "Local port should be a number."), severity: Severity.Error };
    } else if (Number(value) >= maxPortNumber) {
      return { content: invalidPortNumberString, severity: Severity.Error };
    } else if (canElevate && tunnelService.isPortPrivileged(Number(value))) {
      return { content: requiresSudoString, severity: Severity.Info };
    }
    return null;
  }
  function handler() {
    return async (accessor, arg) => {
      const remoteExplorerService = accessor.get(IRemoteExplorerService);
      const notificationService = accessor.get(INotificationService);
      const tunnelService = accessor.get(ITunnelService);
      let tunnelContext;
      if (isITunnelItem(arg)) {
        tunnelContext = arg;
      } else {
        const context = accessor.get(IContextKeyService).getContextKeyValue(TunnelViewSelectionKeyName);
        const tunnel = context ? remoteExplorerService.tunnelModel.forwarded.get(context) : void 0;
        if (tunnel) {
          const tunnelService2 = accessor.get(ITunnelService);
          tunnelContext = TunnelItem.createFromTunnel(remoteExplorerService, tunnelService2, tunnel);
        }
      }
      if (tunnelContext) {
        const tunnelItem = tunnelContext;
        remoteExplorerService.setEditable(tunnelItem, TunnelEditId.LocalPort, {
          onFinish: async (value, success) => {
            remoteExplorerService.setEditable(tunnelItem, TunnelEditId.LocalPort, null);
            if (success) {
              await remoteExplorerService.close({ host: tunnelItem.remoteHost, port: tunnelItem.remotePort }, TunnelCloseReason.Other);
              const numberValue = Number(value);
              const newForward = await remoteExplorerService.forward({
                remote: { host: tunnelItem.remoteHost, port: tunnelItem.remotePort },
                local: numberValue,
                name: tunnelItem.name,
                elevateIfNeeded: true,
                source: tunnelItem.source
              });
              if (newForward && typeof newForward !== "string" && newForward.tunnelLocalPort !== numberValue) {
                notificationService.warn(nls.localize("remote.tunnel.changeLocalPortNumber", "The local port {0} is not available. Port number {1} has been used instead", value, newForward.tunnelLocalPort ?? newForward.localAddress));
              }
            }
          },
          validationMessage: (value) => validateInput(tunnelService, value, tunnelService.canElevate),
          placeholder: nls.localize("remote.tunnelsView.changePort", "New local port")
        });
      }
    };
  }
  ChangeLocalPortAction2.handler = handler;
})(ChangeLocalPortAction || (ChangeLocalPortAction = {}));
var ChangeTunnelPrivacyAction;
((ChangeTunnelPrivacyAction2) => {
  function handler(privacyId) {
    return async (accessor, arg) => {
      if (isITunnelItem(arg)) {
        const remoteExplorerService = accessor.get(IRemoteExplorerService);
        await remoteExplorerService.close({ host: arg.remoteHost, port: arg.remotePort }, TunnelCloseReason.Other);
        return remoteExplorerService.forward({
          remote: { host: arg.remoteHost, port: arg.remotePort },
          local: arg.localPort,
          name: arg.name,
          elevateIfNeeded: true,
          privacy: privacyId,
          source: arg.source
        });
      }
      return void 0;
    };
  }
  ChangeTunnelPrivacyAction2.handler = handler;
})(ChangeTunnelPrivacyAction || (ChangeTunnelPrivacyAction = {}));
var SetTunnelProtocolAction;
((SetTunnelProtocolAction2) => {
  SetTunnelProtocolAction2.ID_HTTP = "remote.tunnel.setProtocolHttp";
  SetTunnelProtocolAction2.ID_HTTPS = "remote.tunnel.setProtocolHttps";
  SetTunnelProtocolAction2.LABEL_HTTP = nls.localize("remote.tunnel.protocolHttp", "HTTP");
  SetTunnelProtocolAction2.LABEL_HTTPS = nls.localize("remote.tunnel.protocolHttps", "HTTPS");
  async function handler(arg, protocol, remoteExplorerService, environmentService) {
    if (isITunnelItem(arg)) {
      const attributes = {
        protocol
      };
      const target = environmentService.remoteAuthority ? ConfigurationTarget.USER_REMOTE : ConfigurationTarget.USER_LOCAL;
      return remoteExplorerService.tunnelModel.configPortsAttributes.addAttributes(arg.remotePort, attributes, target);
    }
  }
  function handlerHttp() {
    return async (accessor, arg) => {
      return handler(arg, TunnelProtocol.Http, accessor.get(IRemoteExplorerService), accessor.get(IWorkbenchEnvironmentService));
    };
  }
  SetTunnelProtocolAction2.handlerHttp = handlerHttp;
  function handlerHttps() {
    return async (accessor, arg) => {
      return handler(arg, TunnelProtocol.Https, accessor.get(IRemoteExplorerService), accessor.get(IWorkbenchEnvironmentService));
    };
  }
  SetTunnelProtocolAction2.handlerHttps = handlerHttps;
})(SetTunnelProtocolAction || (SetTunnelProtocolAction = {}));
const tunnelViewCommandsWeightBonus = 10;
const isForwardedExpr = TunnelTypeContextKey.isEqualTo(TunnelType.Forwarded);
const isForwardedOrDetectedExpr = ContextKeyExpr.or(isForwardedExpr, TunnelTypeContextKey.isEqualTo(TunnelType.Detected));
const isNotMultiSelectionExpr = TunnelViewMultiSelectionContextKey.isEqualTo(void 0);
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: LabelTunnelAction.ID,
  weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
  when: ContextKeyExpr.and(TunnelViewFocusContextKey, isForwardedExpr, isNotMultiSelectionExpr),
  primary: KeyCode.F2,
  mac: {
    primary: KeyCode.Enter
  },
  handler: LabelTunnelAction.handler()
});
CommandsRegistry.registerCommand(ForwardPortAction.INLINE_ID, ForwardPortAction.inlineHandler());
CommandsRegistry.registerCommand(ForwardPortAction.COMMANDPALETTE_ID, ForwardPortAction.commandPaletteHandler());
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: ClosePortAction.INLINE_ID,
  weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
  when: ContextKeyExpr.and(TunnelCloseableContextKey, TunnelViewFocusContextKey),
  primary: KeyCode.Delete,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.Backspace,
    secondary: [KeyCode.Delete]
  },
  handler: ClosePortAction.inlineHandler()
});
CommandsRegistry.registerCommand(ClosePortAction.COMMANDPALETTE_ID, ClosePortAction.commandPaletteHandler());
CommandsRegistry.registerCommand(OpenPortInBrowserAction.ID, OpenPortInBrowserAction.handler());
CommandsRegistry.registerCommand(OpenPortInPreviewAction.ID, OpenPortInPreviewAction.handler());
CommandsRegistry.registerCommand(OpenPortInBrowserCommandPaletteAction.ID, OpenPortInBrowserCommandPaletteAction.handler());
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: CopyAddressAction.INLINE_ID,
  weight: KeybindingWeight.WorkbenchContrib + tunnelViewCommandsWeightBonus,
  when: ContextKeyExpr.and(TunnelViewFocusContextKey, isForwardedOrDetectedExpr, isNotMultiSelectionExpr),
  primary: KeyMod.CtrlCmd | KeyCode.KeyC,
  handler: CopyAddressAction.inlineHandler()
});
CommandsRegistry.registerCommand(CopyAddressAction.COMMANDPALETTE_ID, CopyAddressAction.commandPaletteHandler());
CommandsRegistry.registerCommand(ChangeLocalPortAction.ID, ChangeLocalPortAction.handler());
CommandsRegistry.registerCommand(SetTunnelProtocolAction.ID_HTTP, SetTunnelProtocolAction.handlerHttp());
CommandsRegistry.registerCommand(SetTunnelProtocolAction.ID_HTTPS, SetTunnelProtocolAction.handlerHttps());
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ClosePortAction.COMMANDPALETTE_ID,
    title: ClosePortAction.LABEL
  },
  when: forwardedPortsViewEnabled
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ForwardPortAction.COMMANDPALETTE_ID,
    title: ForwardPortAction.LABEL
  },
  when: forwardedPortsViewEnabled
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: CopyAddressAction.COMMANDPALETTE_ID,
    title: CopyAddressAction.COMMANDPALETTE_LABEL
  },
  when: forwardedPortsViewEnabled
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: OpenPortInBrowserCommandPaletteAction.ID,
    title: OpenPortInBrowserCommandPaletteAction.LABEL
  },
  when: forwardedPortsViewEnabled
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "._open",
  order: 0,
  command: {
    id: OpenPortInBrowserAction.ID,
    title: OpenPortInBrowserAction.LABEL
  },
  when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "._open",
  order: 1,
  command: {
    id: OpenPortInPreviewAction.ID,
    title: OpenPortInPreviewAction.LABEL
  },
  when: ContextKeyExpr.and(
    isForwardedOrDetectedExpr,
    isNotMultiSelectionExpr
  )
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "0_manage",
  order: 1,
  command: {
    id: LabelTunnelAction.ID,
    title: LabelTunnelAction.LABEL,
    icon: labelPortIcon
  },
  when: ContextKeyExpr.and(isForwardedExpr, isNotMultiSelectionExpr)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "2_localaddress",
  order: 0,
  command: {
    id: CopyAddressAction.INLINE_ID,
    title: CopyAddressAction.INLINE_LABEL
  },
  when: ContextKeyExpr.and(isForwardedOrDetectedExpr, isNotMultiSelectionExpr)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "2_localaddress",
  order: 1,
  command: {
    id: ChangeLocalPortAction.ID,
    title: ChangeLocalPortAction.LABEL
  },
  when: ContextKeyExpr.and(isForwardedExpr, PortChangableContextKey, isNotMultiSelectionExpr)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "2_localaddress",
  order: 2,
  submenu: MenuId.TunnelPrivacy,
  title: nls.localize("tunnelContext.privacyMenu", "Port Visibility"),
  when: ContextKeyExpr.and(isForwardedExpr, TunnelPrivacyEnabledContextKey)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "2_localaddress",
  order: 3,
  submenu: MenuId.TunnelProtocol,
  title: nls.localize("tunnelContext.protocolMenu", "Change Port Protocol"),
  when: ContextKeyExpr.and(isForwardedExpr, isNotMultiSelectionExpr, ProtocolChangeableContextKey)
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "3_forward",
  order: 0,
  command: {
    id: ClosePortAction.INLINE_ID,
    title: ClosePortAction.LABEL
  },
  when: TunnelCloseableContextKey
});
MenuRegistry.appendMenuItem(MenuId.TunnelContext, {
  group: "3_forward",
  order: 1,
  command: {
    id: ForwardPortAction.INLINE_ID,
    title: ForwardPortAction.LABEL
  }
});
MenuRegistry.appendMenuItem(MenuId.TunnelProtocol, {
  order: 0,
  command: {
    id: SetTunnelProtocolAction.ID_HTTP,
    title: SetTunnelProtocolAction.LABEL_HTTP,
    toggled: TunnelProtocolContextKey.isEqualTo(TunnelProtocol.Http)
  }
});
MenuRegistry.appendMenuItem(MenuId.TunnelProtocol, {
  order: 1,
  command: {
    id: SetTunnelProtocolAction.ID_HTTPS,
    title: SetTunnelProtocolAction.LABEL_HTTPS,
    toggled: TunnelProtocolContextKey.isEqualTo(TunnelProtocol.Https)
  }
});
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, {
  group: "0_manage",
  order: 0,
  command: {
    id: ForwardPortAction.INLINE_ID,
    title: ForwardPortAction.TREEITEM_LABEL,
    icon: forwardPortIcon
  },
  when: TunnelTypeContextKey.isEqualTo(TunnelType.Candidate)
});
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, {
  group: "0_manage",
  order: 4,
  command: {
    id: LabelTunnelAction.ID,
    title: LabelTunnelAction.LABEL,
    icon: labelPortIcon
  },
  when: isForwardedExpr
});
MenuRegistry.appendMenuItem(MenuId.TunnelPortInline, {
  group: "0_manage",
  order: 5,
  command: {
    id: ClosePortAction.INLINE_ID,
    title: ClosePortAction.LABEL,
    icon: stopForwardIcon
  },
  when: TunnelCloseableContextKey
});
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, {
  order: -1,
  command: {
    id: CopyAddressAction.INLINE_ID,
    title: CopyAddressAction.INLINE_LABEL,
    icon: copyAddressIcon
  },
  when: isForwardedOrDetectedExpr
});
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, {
  order: 0,
  command: {
    id: OpenPortInBrowserAction.ID,
    title: OpenPortInBrowserAction.LABEL,
    icon: openBrowserIcon
  },
  when: isForwardedOrDetectedExpr
});
MenuRegistry.appendMenuItem(MenuId.TunnelLocalAddressInline, {
  order: 1,
  command: {
    id: OpenPortInPreviewAction.ID,
    title: OpenPortInPreviewAction.LABEL,
    icon: openPreviewIcon
  },
  when: isForwardedOrDetectedExpr
});
registerColor("ports.iconRunningProcessForeground", STATUS_BAR_REMOTE_ITEM_BACKGROUND, nls.localize("portWithRunningProcess.foreground", "The color of the icon for a port that has an associated running process."));
export {
  ForwardPortAction,
  OpenPortInBrowserAction,
  OpenPortInPreviewAction,
  TunnelPanel,
  TunnelPanelDescriptor,
  TunnelViewModel,
  openPreviewEnabledContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9icm93c2VyL3R1bm5lbFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvdHVubmVsVmlldy5jc3MnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3IsIElFZGl0YWJsZURhdGEsIElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5LCBSYXdDb250ZXh0S2V5LCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSwgSUNvbW1hbmRIYW5kbGVyLCBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlLCBkaXNwb3NlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSWNvbkxhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWwuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsIFR1bm5lbFR5cGUsIElUdW5uZWxJdGVtLCBUVU5ORUxfVklFV19JRCwgVHVubmVsRWRpdElkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVFeHBsb3JlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSW5wdXRCb3gsIE1lc3NhZ2VUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgVmlld1BhbmUsIElWaWV3UGFuZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0FsbEludGVyZmFjZXMsIGlzTG9jYWxob3N0LCBpc1JlbW90ZVR1bm5lbCwgSVR1bm5lbFNlcnZpY2UsIFJlbW90ZVR1bm5lbCwgVHVubmVsUHJpdmFjeUlkLCBUdW5uZWxQcm90b2NvbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3R1bm5lbC9jb21tb24vdHVubmVsLmpzJztcbmltcG9ydCB7IFR1bm5lbFByaXZhY3kgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ3NSZWdpc3RyeSwgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBjb3B5QWRkcmVzc0ljb24sIGZvcndhcmRlZFBvcnRXaXRob3V0UHJvY2Vzc0ljb24sIGZvcndhcmRlZFBvcnRXaXRoUHJvY2Vzc0ljb24sIGZvcndhcmRQb3J0SWNvbiwgbGFiZWxQb3J0SWNvbiwgb3BlbkJyb3dzZXJJY29uLCBvcGVuUHJldmlld0ljb24sIHBvcnRzVmlld0ljb24sIHByaXZhdGVQb3J0SWNvbiwgc3RvcEZvcndhcmRJY29uIH0gZnJvbSAnLi9yZW1vdGVJY29ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZXJuYWxVcmlPcGVuZXIvY29tbW9uL2V4dGVybmFsVXJpT3BlbmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElUYWJsZUNvbHVtbiwgSVRhYmxlQ29udGV4dE1lbnVFdmVudCwgSVRhYmxlRXZlbnQsIElUYWJsZU1vdXNlRXZlbnQsIElUYWJsZVJlbmRlcmVyLCBJVGFibGVWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdGFibGUvdGFibGUuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IFNUQVRVU19CQVJfUkVNT1RFX0lURU1fQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcywgZGVmYXVsdElucHV0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IEF0dHJpYnV0ZXMsIENhbmRpZGF0ZVBvcnQsIFR1bm5lbCwgVHVubmVsQ2xvc2VSZWFzb24sIFR1bm5lbE1vZGVsLCBUdW5uZWxTb3VyY2UsIGZvcndhcmRlZFBvcnRzVmlld0VuYWJsZWQsIG1ha2VBZGRyZXNzLCBtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzLCBwYXJzZUFkZHJlc3MgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3R1bm5lbE1vZGVsLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcblxuZXhwb3J0IGNvbnN0IG9wZW5QcmV2aWV3RW5hYmxlZENvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignb3BlblByZXZpZXdFbmFibGVkJywgZmFsc2UpO1xuXG5jbGFzcyBUdW5uZWxUcmVlVmlydHVhbERlbGVnYXRlIGltcGxlbWVudHMgSVRhYmxlVmlydHVhbERlbGVnYXRlPElUdW5uZWxJdGVtPiB7XG5cblx0cmVhZG9ubHkgaGVhZGVyUm93SGVpZ2h0OiBudW1iZXIgPSAyMjtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSkgeyB9XG5cblx0Z2V0SGVpZ2h0KHJvdzogSVR1bm5lbEl0ZW0pOiBudW1iZXIge1xuXHRcdHJldHVybiAocm93LnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkICYmICF0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5nZXRFZGl0YWJsZURhdGEodW5kZWZpbmVkKSkgPyAzMCA6IDIyO1xuXHR9XG59XG5cbmludGVyZmFjZSBJVHVubmVsVmlld01vZGVsIHtcblx0cmVhZG9ubHkgb25Gb3J3YXJkZWRQb3J0c0NoYW5nZWQ6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBhbGw6IFR1bm5lbEl0ZW1bXTtcblx0cmVhZG9ubHkgaW5wdXQ6IFR1bm5lbEl0ZW07XG5cdGlzRW1wdHkoKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFR1bm5lbFZpZXdNb2RlbCBpbXBsZW1lbnRzIElUdW5uZWxWaWV3TW9kZWwge1xuXG5cdHJlYWRvbmx5IG9uRm9yd2FyZGVkUG9ydHNDaGFuZ2VkOiBFdmVudDx2b2lkPjtcblx0cHJpdmF0ZSBtb2RlbDogVHVubmVsTW9kZWw7XG5cdHByaXZhdGUgX2NhbmRpZGF0ZXM6IE1hcDxzdHJpbmcsIENhbmRpZGF0ZVBvcnQ+ID0gbmV3IE1hcCgpO1xuXG5cdHJlYWRvbmx5IGlucHV0ID0ge1xuXHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxzVmlldy5hZGRQb3J0JywgXCJBZGQgUG9ydFwiKSxcblx0XHRpY29uOiB1bmRlZmluZWQsXG5cdFx0dHVubmVsVHlwZTogVHVubmVsVHlwZS5BZGQsXG5cdFx0aGFzUnVubmluZ1Byb2Nlc3M6IGZhbHNlLFxuXHRcdHJlbW90ZUhvc3Q6ICcnLFxuXHRcdHJlbW90ZVBvcnQ6IDAsXG5cdFx0cHJvY2Vzc0Rlc2NyaXB0aW9uOiAnJyxcblx0XHR0b29sdGlwUG9zdGZpeDogJycsXG5cdFx0aWNvblRvb2x0aXA6ICcnLFxuXHRcdHBvcnRUb29sdGlwOiAnJyxcblx0XHRwcm9jZXNzVG9vbHRpcDogJycsXG5cdFx0b3JpZ2luVG9vbHRpcDogJycsXG5cdFx0cHJpdmFjeVRvb2x0aXA6ICcnLFxuXHRcdHNvdXJjZTogeyBzb3VyY2U6IFR1bm5lbFNvdXJjZS5Vc2VyLCBkZXNjcmlwdGlvbjogJycgfSxcblx0XHRwcm90b2NvbDogVHVubmVsUHJvdG9jb2wuSHR0cCxcblx0XHRwcml2YWN5OiB7XG5cdFx0XHRpZDogVHVubmVsUHJpdmFjeUlkLlByaXZhdGUsXG5cdFx0XHR0aGVtZUljb246IHByaXZhdGVQb3J0SWNvbi5pZCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3R1bm5lbFByaXZhY3kucHJpdmF0ZScsIFwiUHJpdmF0ZVwiKVxuXHRcdH0sXG5cdFx0c3RyaXA6ICgpID0+IHVuZGVmaW5lZFxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJVHVubmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMubW9kZWwgPSByZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWw7XG5cdFx0dGhpcy5vbkZvcndhcmRlZFBvcnRzQ2hhbmdlZCA9IEV2ZW50LmFueSh0aGlzLm1vZGVsLm9uRm9yd2FyZFBvcnQsIHRoaXMubW9kZWwub25DbG9zZVBvcnQsIHRoaXMubW9kZWwub25Qb3J0TmFtZSwgdGhpcy5tb2RlbC5vbkNhbmRpZGF0ZXNDaGFuZ2VkKTtcblx0fVxuXG5cdGdldCBhbGwoKTogVHVubmVsSXRlbVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFR1bm5lbEl0ZW1bXSA9IFtdO1xuXHRcdHRoaXMuX2NhbmRpZGF0ZXMgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5tb2RlbC5jYW5kaWRhdGVzLmZvckVhY2goY2FuZGlkYXRlID0+IHtcblx0XHRcdHRoaXMuX2NhbmRpZGF0ZXMuc2V0KG1ha2VBZGRyZXNzKGNhbmRpZGF0ZS5ob3N0LCBjYW5kaWRhdGUucG9ydCksIGNhbmRpZGF0ZSk7XG5cdFx0fSk7XG5cdFx0aWYgKCh0aGlzLm1vZGVsLmZvcndhcmRlZC5zaXplID4gMCkgfHwgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuZ2V0RWRpdGFibGVEYXRhKHVuZGVmaW5lZCkpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLnRoaXMuZm9yd2FyZGVkKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubW9kZWwuZGV0ZWN0ZWQuc2l6ZSA+IDApIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLnRoaXMuZGV0ZWN0ZWQpO1xuXHRcdH1cblxuXHRcdHJlc3VsdC5wdXNoKHRoaXMuaW5wdXQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFkZFByb2Nlc3NJbmZvRnJvbUNhbmRpZGF0ZSh0dW5uZWxJdGVtOiBJVHVubmVsSXRlbSkge1xuXHRcdGNvbnN0IGtleSA9IG1ha2VBZGRyZXNzKHR1bm5lbEl0ZW0ucmVtb3RlSG9zdCwgdHVubmVsSXRlbS5yZW1vdGVQb3J0KTtcblx0XHRpZiAodGhpcy5fY2FuZGlkYXRlcy5oYXMoa2V5KSkge1xuXHRcdFx0dHVubmVsSXRlbS5wcm9jZXNzRGVzY3JpcHRpb24gPSB0aGlzLl9jYW5kaWRhdGVzLmdldChrZXkpIS5kZXRhaWw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZm9yd2FyZGVkKCk6IFR1bm5lbEl0ZW1bXSB7XG5cdFx0Y29uc3QgZm9yd2FyZGVkID0gQXJyYXkuZnJvbSh0aGlzLm1vZGVsLmZvcndhcmRlZC52YWx1ZXMoKSkubWFwKHR1bm5lbCA9PiB7XG5cdFx0XHRjb25zdCB0dW5uZWxJdGVtID0gVHVubmVsSXRlbS5jcmVhdGVGcm9tVHVubmVsKHRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0aGlzLnR1bm5lbFNlcnZpY2UsIHR1bm5lbCk7XG5cdFx0XHR0aGlzLmFkZFByb2Nlc3NJbmZvRnJvbUNhbmRpZGF0ZSh0dW5uZWxJdGVtKTtcblx0XHRcdHJldHVybiB0dW5uZWxJdGVtO1xuXHRcdH0pLnNvcnQoKGE6IFR1bm5lbEl0ZW0sIGI6IFR1bm5lbEl0ZW0pID0+IHtcblx0XHRcdGlmIChhLnJlbW90ZVBvcnQgPT09IGIucmVtb3RlUG9ydCkge1xuXHRcdFx0XHRyZXR1cm4gYS5yZW1vdGVIb3N0IDwgYi5yZW1vdGVIb3N0ID8gLTEgOiAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGEucmVtb3RlUG9ydCA8IGIucmVtb3RlUG9ydCA/IC0xIDogMTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gZm9yd2FyZGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZGV0ZWN0ZWQoKTogVHVubmVsSXRlbVtdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLm1vZGVsLmRldGVjdGVkLnZhbHVlcygpKS5tYXAodHVubmVsID0+IHtcblx0XHRcdGNvbnN0IHR1bm5lbEl0ZW0gPSBUdW5uZWxJdGVtLmNyZWF0ZUZyb21UdW5uZWwodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UsIHRoaXMudHVubmVsU2VydmljZSwgdHVubmVsLCBUdW5uZWxUeXBlLkRldGVjdGVkLCBmYWxzZSk7XG5cdFx0XHR0aGlzLmFkZFByb2Nlc3NJbmZvRnJvbUNhbmRpZGF0ZSh0dW5uZWxJdGVtKTtcblx0XHRcdHJldHVybiB0dW5uZWxJdGVtO1xuXHRcdH0pO1xuXHR9XG5cblx0aXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuZGV0ZWN0ZWQubGVuZ3RoID09PSAwKSAmJlxuXHRcdFx0KCh0aGlzLmZvcndhcmRlZC5sZW5ndGggPT09IDApIHx8ICh0aGlzLmZvcndhcmRlZC5sZW5ndGggPT09IDEgJiZcblx0XHRcdFx0KHRoaXMuZm9yd2FyZGVkWzBdLnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkKSAmJiAhdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UuZ2V0RWRpdGFibGVEYXRhKHVuZGVmaW5lZCkpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBlbXB0eUNlbGwoaXRlbTogSVR1bm5lbEl0ZW0pOiBBY3Rpb25CYXJDZWxsIHtcblx0cmV0dXJuIHsgbGFiZWw6ICcnLCB0dW5uZWw6IGl0ZW0sIGVkaXRJZDogVHVubmVsRWRpdElkLk5vbmUsIHRvb2x0aXA6ICcnIH07XG59XG5cbmNsYXNzIEljb25Db2x1bW4gaW1wbGVtZW50cyBJVGFibGVDb2x1bW48SVR1bm5lbEl0ZW0sIEFjdGlvbkJhckNlbGw+IHtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZyA9ICcnO1xuXHRyZWFkb25seSB0b29sdGlwOiBzdHJpbmcgPSAnJztcblx0cmVhZG9ubHkgd2VpZ2h0OiBudW1iZXIgPSAxO1xuXHRyZWFkb25seSBtaW5pbXVtV2lkdGggPSA0MDtcblx0cmVhZG9ubHkgbWF4aW11bVdpZHRoID0gNDA7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdhY3Rpb25iYXInO1xuXHRwcm9qZWN0KHJvdzogSVR1bm5lbEl0ZW0pOiBBY3Rpb25CYXJDZWxsIHtcblx0XHRpZiAocm93LnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkKSB7XG5cdFx0XHRyZXR1cm4gZW1wdHlDZWxsKHJvdyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaWNvbiA9IHJvdy5wcm9jZXNzRGVzY3JpcHRpb24gPyBmb3J3YXJkZWRQb3J0V2l0aFByb2Nlc3NJY29uIDogZm9yd2FyZGVkUG9ydFdpdGhvdXRQcm9jZXNzSWNvbjtcblx0XHRsZXQgdG9vbHRpcDogc3RyaW5nID0gJyc7XG5cdFx0aWYgKHJvdyBpbnN0YW5jZW9mIFR1bm5lbEl0ZW0pIHtcblx0XHRcdHRvb2x0aXAgPSBgJHtyb3cuaWNvblRvb2x0aXB9ICR7cm93LnRvb2x0aXBQb3N0Zml4fWA7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRsYWJlbDogJycsIGljb24sIHR1bm5lbDogcm93LCBlZGl0SWQ6IFR1bm5lbEVkaXRJZC5Ob25lLCB0b29sdGlwXG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBQb3J0Q29sdW1uIGltcGxlbWVudHMgSVRhYmxlQ29sdW1uPElUdW5uZWxJdGVtLCBBY3Rpb25CYXJDZWxsPiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3R1bm5lbC5wb3J0Q29sdW1uLmxhYmVsJywgXCJQb3J0XCIpO1xuXHRyZWFkb25seSB0b29sdGlwOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3R1bm5lbC5wb3J0Q29sdW1uLnRvb2x0aXAnLCBcIlRoZSBsYWJlbCBhbmQgcmVtb3RlIHBvcnQgbnVtYmVyIG9mIHRoZSBmb3J3YXJkZWQgcG9ydC5cIik7XG5cdHJlYWRvbmx5IHdlaWdodDogbnVtYmVyID0gMTtcblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gJ2FjdGlvbmJhcic7XG5cdHByb2plY3Qocm93OiBJVHVubmVsSXRlbSk6IEFjdGlvbkJhckNlbGwge1xuXHRcdGNvbnN0IGlzQWRkID0gcm93LnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkO1xuXHRcdGNvbnN0IGxhYmVsID0gcm93LmxhYmVsO1xuXHRcdGxldCB0b29sdGlwOiBzdHJpbmcgPSAnJztcblx0XHRpZiAocm93IGluc3RhbmNlb2YgVHVubmVsSXRlbSAmJiAhaXNBZGQpIHtcblx0XHRcdHRvb2x0aXAgPSBgJHtyb3cucG9ydFRvb2x0aXB9ICR7cm93LnRvb2x0aXBQb3N0Zml4fWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRvb2x0aXAgPSBsYWJlbDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsLCB0dW5uZWw6IHJvdywgbWVudUlkOiBNZW51SWQuVHVubmVsUG9ydElubGluZSxcblx0XHRcdGVkaXRJZDogcm93LnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkID8gVHVubmVsRWRpdElkLk5ldyA6IFR1bm5lbEVkaXRJZC5MYWJlbCwgdG9vbHRpcFxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgTG9jYWxBZGRyZXNzQ29sdW1uIGltcGxlbWVudHMgSVRhYmxlQ29sdW1uPElUdW5uZWxJdGVtLCBBY3Rpb25CYXJDZWxsPiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3R1bm5lbC5hZGRyZXNzQ29sdW1uLmxhYmVsJywgXCJGb3J3YXJkZWQgQWRkcmVzc1wiKTtcblx0cmVhZG9ubHkgdG9vbHRpcDogc3RyaW5nID0gbmxzLmxvY2FsaXplKCd0dW5uZWwuYWRkcmVzc0NvbHVtbi50b29sdGlwJywgXCJUaGUgYWRkcmVzcyB0aGF0IHRoZSBmb3J3YXJkZWQgcG9ydCBpcyBhdmFpbGFibGUgYXQuXCIpO1xuXHRyZWFkb25seSB3ZWlnaHQ6IG51bWJlciA9IDE7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdhY3Rpb25iYXInO1xuXHRwcm9qZWN0KHJvdzogSVR1bm5lbEl0ZW0pOiBBY3Rpb25CYXJDZWxsIHtcblx0XHRpZiAocm93LnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkKSB7XG5cdFx0XHRyZXR1cm4gZW1wdHlDZWxsKHJvdyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSByb3cubG9jYWxBZGRyZXNzID8/ICcnO1xuXHRcdGxldCB0b29sdGlwOiBzdHJpbmcgPSBsYWJlbDtcblx0XHRpZiAocm93IGluc3RhbmNlb2YgVHVubmVsSXRlbSkge1xuXHRcdFx0dG9vbHRpcCA9IHJvdy50b29sdGlwUG9zdGZpeDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsLFxuXHRcdFx0bWVudUlkOiBNZW51SWQuVHVubmVsTG9jYWxBZGRyZXNzSW5saW5lLFxuXHRcdFx0dHVubmVsOiByb3csXG5cdFx0XHRlZGl0SWQ6IFR1bm5lbEVkaXRJZC5Mb2NhbFBvcnQsXG5cdFx0XHR0b29sdGlwLFxuXHRcdFx0bWFya2Rvd25Ub29sdGlwOiBsYWJlbCA/IExvY2FsQWRkcmVzc0NvbHVtbi5nZXRIb3ZlclRleHQobGFiZWwpIDogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGdldEhvdmVyVGV4dChsb2NhbEFkZHJlc3M6IHN0cmluZykge1xuXHRcdHJldHVybiBmdW5jdGlvbiAoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRcdFx0Y29uc3QgZWRpdG9yQ29uZiA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgbXVsdGlDdXJzb3JNb2RpZmllcjogJ2N0cmxDbWQnIHwgJ2FsdCcgfT4oJ2VkaXRvcicpO1xuXG5cdFx0XHRsZXQgY2xpY2tMYWJlbCA9ICcnO1xuXHRcdFx0aWYgKGVkaXRvckNvbmYubXVsdGlDdXJzb3JNb2RpZmllciA9PT0gJ2N0cmxDbWQnKSB7XG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHRcdGNsaWNrTGFiZWwgPSBubHMubG9jYWxpemUoJ3BvcnRzTGluay5mb2xsb3dMaW5rQWx0Lm1hYycsIFwib3B0aW9uICsgY2xpY2tcIik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2xpY2tMYWJlbCA9IG5scy5sb2NhbGl6ZSgncG9ydHNMaW5rLmZvbGxvd0xpbmtBbHQnLCBcImFsdCArIGNsaWNrXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0XHRjbGlja0xhYmVsID0gbmxzLmxvY2FsaXplKCdwb3J0c0xpbmsuZm9sbG93TGlua0NtZCcsIFwiY21kICsgY2xpY2tcIik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y2xpY2tMYWJlbCA9IG5scy5sb2NhbGl6ZSgncG9ydHNMaW5rLmZvbGxvd0xpbmtDdHJsJywgXCJjdHJsICsgY2xpY2tcIik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHRydWUpO1xuXHRcdFx0Y29uc3QgdXJpID0gbG9jYWxBZGRyZXNzLnN0YXJ0c1dpdGgoJ2h0dHAnKSA/IGxvY2FsQWRkcmVzcyA6IGBodHRwOi8vJHtsb2NhbEFkZHJlc3N9YDtcblx0XHRcdHJldHVybiBtYXJrZG93bi5hcHBlbmRMaW5rKHVyaSwgJ0ZvbGxvdyBsaW5rJykuYXBwZW5kTWFya2Rvd24oYCAoJHtjbGlja0xhYmVsfSlgKTtcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFJ1bm5pbmdQcm9jZXNzQ29sdW1uIGltcGxlbWVudHMgSVRhYmxlQ29sdW1uPElUdW5uZWxJdGVtLCBBY3Rpb25CYXJDZWxsPiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3R1bm5lbC5wcm9jZXNzQ29sdW1uLmxhYmVsJywgXCJSdW5uaW5nIFByb2Nlc3NcIik7XG5cdHJlYWRvbmx5IHRvb2x0aXA6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndHVubmVsLnByb2Nlc3NDb2x1bW4udG9vbHRpcCcsIFwiVGhlIGNvbW1hbmQgbGluZSBvZiB0aGUgcHJvY2VzcyB0aGF0IGlzIHVzaW5nIHRoZSBwb3J0LlwiKTtcblx0cmVhZG9ubHkgd2VpZ2h0OiBudW1iZXIgPSAyO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnYWN0aW9uYmFyJztcblx0cHJvamVjdChyb3c6IElUdW5uZWxJdGVtKTogQWN0aW9uQmFyQ2VsbCB7XG5cdFx0aWYgKHJvdy50dW5uZWxUeXBlID09PSBUdW5uZWxUeXBlLkFkZCkge1xuXHRcdFx0cmV0dXJuIGVtcHR5Q2VsbChyb3cpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsID0gcm93LnByb2Nlc3NEZXNjcmlwdGlvbiA/PyAnJztcblx0XHRyZXR1cm4geyBsYWJlbCwgdHVubmVsOiByb3csIGVkaXRJZDogVHVubmVsRWRpdElkLk5vbmUsIHRvb2x0aXA6IHJvdyBpbnN0YW5jZW9mIFR1bm5lbEl0ZW0gPyByb3cucHJvY2Vzc1Rvb2x0aXAgOiAnJyB9O1xuXHR9XG59XG5cbmNsYXNzIE9yaWdpbkNvbHVtbiBpbXBsZW1lbnRzIElUYWJsZUNvbHVtbjxJVHVubmVsSXRlbSwgQWN0aW9uQmFyQ2VsbD4ge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gbmxzLmxvY2FsaXplKCd0dW5uZWwub3JpZ2luQ29sdW1uLmxhYmVsJywgXCJPcmlnaW5cIik7XG5cdHJlYWRvbmx5IHRvb2x0aXA6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndHVubmVsLm9yaWdpbkNvbHVtbi50b29sdGlwJywgXCJUaGUgc291cmNlIHRoYXQgYSBmb3J3YXJkZWQgcG9ydCBvcmlnaW5hdGVzIGZyb20uIENhbiBiZSBhbiBleHRlbnNpb24sIHVzZXIgZm9yd2FyZGVkLCBzdGF0aWNhbGx5IGZvcndhcmRlZCwgb3IgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuXCIpO1xuXHRyZWFkb25seSB3ZWlnaHQ6IG51bWJlciA9IDE7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdhY3Rpb25iYXInO1xuXHRwcm9qZWN0KHJvdzogSVR1bm5lbEl0ZW0pOiBBY3Rpb25CYXJDZWxsIHtcblx0XHRpZiAocm93LnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkKSB7XG5cdFx0XHRyZXR1cm4gZW1wdHlDZWxsKHJvdyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFiZWwgPSByb3cuc291cmNlLmRlc2NyaXB0aW9uO1xuXHRcdGNvbnN0IHRvb2x0aXAgPSBgJHtyb3cgaW5zdGFuY2VvZiBUdW5uZWxJdGVtID8gcm93Lm9yaWdpblRvb2x0aXAgOiAnJ30uICR7cm93IGluc3RhbmNlb2YgVHVubmVsSXRlbSA/IHJvdy50b29sdGlwUG9zdGZpeCA6ICcnfWA7XG5cdFx0cmV0dXJuIHsgbGFiZWwsIG1lbnVJZDogTWVudUlkLlR1bm5lbE9yaWdpbklubGluZSwgdHVubmVsOiByb3csIGVkaXRJZDogVHVubmVsRWRpdElkLk5vbmUsIHRvb2x0aXAgfTtcblx0fVxufVxuXG5jbGFzcyBQcml2YWN5Q29sdW1uIGltcGxlbWVudHMgSVRhYmxlQ29sdW1uPElUdW5uZWxJdGVtLCBBY3Rpb25CYXJDZWxsPiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3R1bm5lbC5wcml2YWN5Q29sdW1uLmxhYmVsJywgXCJWaXNpYmlsaXR5XCIpO1xuXHRyZWFkb25seSB0b29sdGlwOiBzdHJpbmcgPSBubHMubG9jYWxpemUoJ3R1bm5lbC5wcml2YWN5Q29sdW1uLnRvb2x0aXAnLCBcIlRoZSBhdmFpbGFiaWxpdHkgb2YgdGhlIGZvcndhcmRlZCBwb3J0LlwiKTtcblx0cmVhZG9ubHkgd2VpZ2h0OiBudW1iZXIgPSAxO1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnYWN0aW9uYmFyJztcblx0cHJvamVjdChyb3c6IElUdW5uZWxJdGVtKTogQWN0aW9uQmFyQ2VsbCB7XG5cdFx0aWYgKHJvdy50dW5uZWxUeXBlID09PSBUdW5uZWxUeXBlLkFkZCkge1xuXHRcdFx0cmV0dXJuIGVtcHR5Q2VsbChyb3cpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsID0gcm93LnByaXZhY3k/LmxhYmVsO1xuXHRcdGxldCB0b29sdGlwOiBzdHJpbmcgPSAnJztcblx0XHRpZiAocm93IGluc3RhbmNlb2YgVHVubmVsSXRlbSkge1xuXHRcdFx0dG9vbHRpcCA9IGAke3Jvdy5wcml2YWN5LmxhYmVsfSAke3Jvdy50b29sdGlwUG9zdGZpeH1gO1xuXHRcdH1cblx0XHRyZXR1cm4geyBsYWJlbCwgdHVubmVsOiByb3csIGljb246IHsgaWQ6IHJvdy5wcml2YWN5LnRoZW1lSWNvbiB9LCBlZGl0SWQ6IFR1bm5lbEVkaXRJZC5Ob25lLCB0b29sdGlwIH07XG5cdH1cbn1cblxuaW50ZXJmYWNlIElBY3Rpb25CYXJUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRsYWJlbDogSWNvbkxhYmVsO1xuXHRidXR0b24/OiBCdXR0b247XG5cdGljb246IEhUTUxFbGVtZW50O1xuXHRhY3Rpb25CYXI6IEFjdGlvbkJhcjtcbn1cblxuaW50ZXJmYWNlIEFjdGlvbkJhckNlbGwge1xuXHRsYWJlbDogc3RyaW5nO1xuXHRpY29uPzogVGhlbWVJY29uO1xuXHR0b29sdGlwOiBzdHJpbmc7XG5cdG1hcmtkb3duVG9vbHRpcD86IChjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSA9PiBJTWFya2Rvd25TdHJpbmc7XG5cdG1lbnVJZD86IE1lbnVJZDtcblx0dHVubmVsOiBJVHVubmVsSXRlbTtcblx0ZWRpdElkOiBUdW5uZWxFZGl0SWQ7XG59XG5cbmNsYXNzIEFjdGlvbkJhclJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8QWN0aW9uQmFyQ2VsbCwgSUFjdGlvbkJhclRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2FjdGlvbmJhcic7XG5cdHByaXZhdGUgaW5wdXREb25lPzogKHN1Y2Nlc3M6IGJvb2xlYW4sIGZpbmlzaEVkaXRpbmc6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdHByaXZhdGUgX2FjdGlvblJ1bm5lcjogQWN0aW9uUnVubmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASVJlbW90ZUV4cGxvcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5faG92ZXJEZWxlZ2F0ZSA9IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpO1xuXHR9XG5cblx0c2V0IGFjdGlvblJ1bm5lcihhY3Rpb25SdW5uZXI6IEFjdGlvblJ1bm5lcikge1xuXHRcdHRoaXMuX2FjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQWN0aW9uQmFyVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBjZWxsID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcucG9ydHMtdmlldy1hY3Rpb25iYXItY2VsbCcpKTtcblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZChjZWxsLCBkb20uJCgnLnBvcnRzLXZpZXctYWN0aW9uYmFyLWNlbGwtaWNvbicpKTtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChlbGVtZW50RGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGxhYmVsID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IEljb25MYWJlbChjZWxsLFxuXHRcdFx0e1xuXHRcdFx0XHRzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSxcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZTogdGhpcy5faG92ZXJEZWxlZ2F0ZVxuXHRcdFx0fSkpO1xuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBkb20uYXBwZW5kKGNlbGwsIGRvbS4kKCcuYWN0aW9ucycpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbnNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGNyZWF0ZUFjdGlvblZpZXdJdGVtLmJpbmQodW5kZWZpbmVkLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHRcdGhvdmVyRGVsZWdhdGU6IHRoaXMuX2hvdmVyRGVsZWdhdGVcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHsgbGFiZWwsIGljb24sIGFjdGlvbkJhciwgY29udGFpbmVyOiBjZWxsLCB0ZW1wbGF0ZURpc3Bvc2FibGVzLCBlbGVtZW50RGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogQWN0aW9uQmFyQ2VsbCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQWN0aW9uQmFyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gcmVzZXRcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gJ3BvcnRzLXZpZXctYWN0aW9uYmFyLWNlbGwtaWNvbic7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuc2V0TGFiZWwoJycpO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMjJweCc7XG5cdFx0aWYgKHRlbXBsYXRlRGF0YS5idXR0b24pIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5idXR0b24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzBweCc7XG5cblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblxuXHRcdGxldCBlZGl0YWJsZURhdGE6IElFZGl0YWJsZURhdGEgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGVsZW1lbnQuZWRpdElkID09PSBUdW5uZWxFZGl0SWQuTmV3ICYmIChlZGl0YWJsZURhdGEgPSB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5nZXRFZGl0YWJsZURhdGEodW5kZWZpbmVkKSkpIHtcblx0XHRcdHRoaXMucmVuZGVySW5wdXRCb3godGVtcGxhdGVEYXRhLCBlZGl0YWJsZURhdGEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlZGl0YWJsZURhdGEgPSB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5nZXRFZGl0YWJsZURhdGEoZWxlbWVudC50dW5uZWwsIGVsZW1lbnQuZWRpdElkKTtcblx0XHRcdGlmIChlZGl0YWJsZURhdGEpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJJbnB1dEJveCh0ZW1wbGF0ZURhdGEsIGVkaXRhYmxlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKChlbGVtZW50LnR1bm5lbC50dW5uZWxUeXBlID09PSBUdW5uZWxUeXBlLkFkZCkgJiYgKGVsZW1lbnQubWVudUlkID09PSBNZW51SWQuVHVubmVsUG9ydElubGluZSkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJCdXR0b24oZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyQWN0aW9uQmFySXRlbShlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlbmRlckJ1dHRvbihlbGVtZW50OiBBY3Rpb25CYXJDZWxsLCB0ZW1wbGF0ZURhdGE6IElBY3Rpb25CYXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzdweCc7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMjhweCc7XG5cdFx0dGVtcGxhdGVEYXRhLmJ1dHRvbiA9IHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24odGVtcGxhdGVEYXRhLmNvbnRhaW5lciwgZGVmYXVsdEJ1dHRvblN0eWxlcykpO1xuXHRcdHRlbXBsYXRlRGF0YS5idXR0b24ubGFiZWwgPSBlbGVtZW50LmxhYmVsO1xuXHRcdHRlbXBsYXRlRGF0YS5idXR0b24uZWxlbWVudC50aXRsZSA9IGVsZW1lbnQudG9vbHRpcDtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0ZW1wbGF0ZURhdGEuYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChGb3J3YXJkUG9ydEFjdGlvbi5JTkxJTkVfSUQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdHVubmVsQ29udGV4dCh0dW5uZWw6IElUdW5uZWxJdGVtKTogSVR1bm5lbEl0ZW0ge1xuXHRcdGxldCBjb250ZXh0OiBJVHVubmVsSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHVubmVsIGluc3RhbmNlb2YgVHVubmVsSXRlbSkge1xuXHRcdFx0Y29udGV4dCA9IHR1bm5lbC5zdHJpcCgpO1xuXHRcdH1cblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdGNvbnRleHQgPSB7XG5cdFx0XHRcdHR1bm5lbFR5cGU6IHR1bm5lbC50dW5uZWxUeXBlLFxuXHRcdFx0XHRyZW1vdGVIb3N0OiB0dW5uZWwucmVtb3RlSG9zdCxcblx0XHRcdFx0cmVtb3RlUG9ydDogdHVubmVsLnJlbW90ZVBvcnQsXG5cdFx0XHRcdGxvY2FsQWRkcmVzczogdHVubmVsLmxvY2FsQWRkcmVzcyxcblx0XHRcdFx0cHJvdG9jb2w6IHR1bm5lbC5wcm90b2NvbCxcblx0XHRcdFx0bG9jYWxVcmk6IHR1bm5lbC5sb2NhbFVyaSxcblx0XHRcdFx0bG9jYWxQb3J0OiB0dW5uZWwubG9jYWxQb3J0LFxuXHRcdFx0XHRuYW1lOiB0dW5uZWwubmFtZSxcblx0XHRcdFx0Y2xvc2VhYmxlOiB0dW5uZWwuY2xvc2VhYmxlLFxuXHRcdFx0XHRzb3VyY2U6IHR1bm5lbC5zb3VyY2UsXG5cdFx0XHRcdHByaXZhY3k6IHR1bm5lbC5wcml2YWN5LFxuXHRcdFx0XHRwcm9jZXNzRGVzY3JpcHRpb246IHR1bm5lbC5wcm9jZXNzRGVzY3JpcHRpb24sXG5cdFx0XHRcdGxhYmVsOiB0dW5uZWwubGFiZWxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0O1xuXHR9XG5cblx0cmVuZGVyQWN0aW9uQmFySXRlbShlbGVtZW50OiBBY3Rpb25CYXJDZWxsLCB0ZW1wbGF0ZURhdGE6IElBY3Rpb25CYXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRMYWJlbChlbGVtZW50LmxhYmVsLCB1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlOiBlbGVtZW50Lm1hcmtkb3duVG9vbHRpcCA/XG5cdFx0XHRcdFx0eyBtYXJrZG93bjogZWxlbWVudC5tYXJrZG93blRvb2x0aXAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSksIG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IGVsZW1lbnQudG9vbHRpcCB9XG5cdFx0XHRcdFx0OiBlbGVtZW50LnRvb2x0aXAsXG5cdFx0XHRcdGV4dHJhQ2xhc3NlczogZWxlbWVudC5tZW51SWQgPT09IE1lbnVJZC5UdW5uZWxMb2NhbEFkZHJlc3NJbmxpbmUgPyBbJ3BvcnRzLXZpZXctYWN0aW9uYmFyLWNlbGwtbG9jYWxhZGRyZXNzJ10gOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IHRoaXMudHVubmVsQ29udGV4dChlbGVtZW50LnR1bm5lbCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5zdHlsZS5wYWRkaW5nTGVmdCA9ICcxMHB4Jztcblx0XHRjb25zdCBjb250ZXh0OiBbc3RyaW5nLCBhbnldW10gPVxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZpZXcnLCBUVU5ORUxfVklFV19JRF0sXG5cdFx0XHRcdFtUdW5uZWxUeXBlQ29udGV4dEtleS5rZXksIGVsZW1lbnQudHVubmVsLnR1bm5lbFR5cGVdLFxuXHRcdFx0XHRbVHVubmVsQ2xvc2VhYmxlQ29udGV4dEtleS5rZXksIGVsZW1lbnQudHVubmVsLmNsb3NlYWJsZV0sXG5cdFx0XHRcdFtUdW5uZWxQcml2YWN5Q29udGV4dEtleS5rZXksIGVsZW1lbnQudHVubmVsLnByaXZhY3kuaWRdLFxuXHRcdFx0XHRbVHVubmVsUHJvdG9jb2xDb250ZXh0S2V5LmtleSwgZWxlbWVudC50dW5uZWwucHJvdG9jb2xdXG5cdFx0XHRdO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVPdmVybGF5KGNvbnRleHQpO1xuXHRcdGlmIChlbGVtZW50Lm1lbnVJZCkge1xuXHRcdFx0Y29uc3QgbWVudSA9IHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShlbGVtZW50Lm1lbnVJZCwgY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRcdGxldCBhY3Rpb25zID0gZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXHRcdFx0aWYgKGFjdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgbGFiZWxBY3Rpb25zID0gYWN0aW9ucy5maWx0ZXIoYWN0aW9uID0+IGFjdGlvbi5pZC50b0xvd2VyQ2FzZSgpLmluZGV4T2YoJ2xhYmVsJykgPj0gMCk7XG5cdFx0XHRcdGlmIChsYWJlbEFjdGlvbnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdGxhYmVsQWN0aW9ucy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxlbmd0aCAtIGIubGFiZWwubGVuZ3RoKTtcblx0XHRcdFx0XHRsYWJlbEFjdGlvbnMucG9wKCk7XG5cdFx0XHRcdFx0YWN0aW9ucyA9IGFjdGlvbnMuZmlsdGVyKGFjdGlvbiA9PiBsYWJlbEFjdGlvbnMuaW5kZXhPZihhY3Rpb24pIDwgMCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0XHRpZiAodGhpcy5fYWN0aW9uUnVubmVyKSB7XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5hY3Rpb25SdW5uZXIgPSB0aGlzLl9hY3Rpb25SdW5uZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQuaWNvbikge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gYHBvcnRzLXZpZXctYWN0aW9uYmFyLWNlbGwtaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShlbGVtZW50Lmljb24pfWA7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaWNvbi50aXRsZSA9IGVsZW1lbnQudG9vbHRpcDtcblx0XHRcdHRlbXBsYXRlRGF0YS5pY29uLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcklucHV0Qm94KHRlbXBsYXRlRGF0YTogSUFjdGlvbkJhclRlbXBsYXRlRGF0YSwgZWRpdGFibGVEYXRhOiBJRWRpdGFibGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gUmVxdWlyZWQgZm9yIEZpcmVGb3guIFRoZSBibHVyIGV2ZW50IGRvZXNuJ3QgZmlyZSBvbiBGaXJlRm94IHdoZW4geW91IGp1c3QgbWFzaCB0aGUgXCIrXCIgYnV0dG9uIHRvIGZvcndhcmQgYSBwb3J0LlxuXHRcdGlmICh0aGlzLmlucHV0RG9uZSkge1xuXHRcdFx0dGhpcy5pbnB1dERvbmUoZmFsc2UsIGZhbHNlKTtcblx0XHRcdHRoaXMuaW5wdXREb25lID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IGNvbnRhaW5lciB9ID0gdGVtcGxhdGVEYXRhO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5wYWRkaW5nTGVmdCA9ICc1cHgnO1xuXHRcdGNvbnN0IHZhbHVlID0gZWRpdGFibGVEYXRhLnN0YXJ0aW5nVmFsdWUgfHwgJyc7XG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBuZXcgSW5wdXRCb3goY29udGFpbmVyLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0YXJpYUxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxzVmlldy5pbnB1dCcsIFwiUHJlc3MgRW50ZXIgdG8gY29uZmlybSBvciBFc2NhcGUgdG8gY2FuY2VsLlwiKSxcblx0XHRcdHZhbGlkYXRpb25PcHRpb25zOiB7XG5cdFx0XHRcdHZhbGlkYXRpb246ICh2YWx1ZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlZGl0YWJsZURhdGEudmFsaWRhdGlvbk1lc3NhZ2UodmFsdWUpO1xuXHRcdFx0XHRcdGlmICghbWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IG1lc3NhZ2UuY29udGVudCxcblx0XHRcdFx0XHRcdGZvcm1hdENvbnRlbnQ6IHRydWUsXG5cdFx0XHRcdFx0XHR0eXBlOiBtZXNzYWdlLnNldmVyaXR5ID09PSBTZXZlcml0eS5FcnJvciA/IE1lc3NhZ2VUeXBlLkVSUk9SIDogTWVzc2FnZVR5cGUuSU5GT1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRwbGFjZWhvbGRlcjogZWRpdGFibGVEYXRhLnBsYWNlaG9sZGVyIHx8ICcnLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlc1xuXHRcdH0pO1xuXHRcdGlucHV0Qm94LnZhbHVlID0gdmFsdWU7XG5cdFx0aW5wdXRCb3guZm9jdXMoKTtcblx0XHRpbnB1dEJveC5zZWxlY3QoeyBzdGFydDogMCwgZW5kOiBlZGl0YWJsZURhdGEuc3RhcnRpbmdWYWx1ZSA/IGVkaXRhYmxlRGF0YS5zdGFydGluZ1ZhbHVlLmxlbmd0aCA6IDAgfSk7XG5cblx0XHRjb25zdCBkb25lID0gY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKGFzeW5jIChzdWNjZXNzOiBib29sZWFuLCBmaW5pc2hFZGl0aW5nOiBib29sZWFuKSA9PiB7XG5cdFx0XHRkaXNwb3NlKHRvRGlzcG9zZSk7XG5cdFx0XHRpZiAodGhpcy5pbnB1dERvbmUpIHtcblx0XHRcdFx0dGhpcy5pbnB1dERvbmUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRpbnB1dEJveC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRjb25zdCBpbnB1dFZhbHVlID0gaW5wdXRCb3gudmFsdWU7XG5cdFx0XHRpZiAoZmluaXNoRWRpdGluZykge1xuXHRcdFx0XHRyZXR1cm4gZWRpdGFibGVEYXRhLm9uRmluaXNoKGlucHV0VmFsdWUsIHN1Y2Nlc3MpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuaW5wdXREb25lID0gZG9uZTtcblxuXHRcdGNvbnN0IHRvRGlzcG9zZSA9IFtcblx0XHRcdGlucHV0Qm94LFxuXHRcdFx0ZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgYXN5bmMgKGU6IElLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKGlucHV0Qm94LnZhbGlkYXRlKCkgIT09IE1lc3NhZ2VUeXBlLkVSUk9SKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZG9uZSh0cnVlLCB0cnVlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRvbmUoZmFsc2UsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRyZXR1cm4gZG9uZShmYWxzZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdFx0ZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsIGRvbS5FdmVudFR5cGUuQkxVUiwgKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZG9uZShpbnB1dEJveC52YWxpZGF0ZSgpICE9PSBNZXNzYWdlVHlwZS5FUlJPUiwgdHJ1ZSk7XG5cdFx0XHR9KVxuXHRcdF07XG5cblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZG9uZShmYWxzZSwgZmFsc2UpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IEFjdGlvbkJhckNlbGwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFjdGlvbkJhclRlbXBsYXRlRGF0YSkge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElBY3Rpb25CYXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgVHVubmVsSXRlbSBpbXBsZW1lbnRzIElUdW5uZWxJdGVtIHtcblx0c3RhdGljIGNyZWF0ZUZyb21UdW5uZWwocmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSxcblx0XHR0dW5uZWw6IFR1bm5lbCwgdHlwZTogVHVubmVsVHlwZSA9IFR1bm5lbFR5cGUuRm9yd2FyZGVkLCBjbG9zZWFibGU/OiBib29sZWFuKSB7XG5cdFx0cmV0dXJuIG5ldyBUdW5uZWxJdGVtKHR5cGUsXG5cdFx0XHR0dW5uZWwucmVtb3RlSG9zdCxcblx0XHRcdHR1bm5lbC5yZW1vdGVQb3J0LFxuXHRcdFx0dHVubmVsLnNvdXJjZSxcblx0XHRcdCEhdHVubmVsLmhhc1J1bm5pbmdQcm9jZXNzLFxuXHRcdFx0dHVubmVsLnByb3RvY29sLFxuXHRcdFx0dHVubmVsLmxvY2FsVXJpLFxuXHRcdFx0dHVubmVsLmxvY2FsQWRkcmVzcyxcblx0XHRcdHR1bm5lbC5sb2NhbFBvcnQsXG5cdFx0XHRjbG9zZWFibGUgPT09IHVuZGVmaW5lZCA/IHR1bm5lbC5jbG9zZWFibGUgOiBjbG9zZWFibGUsXG5cdFx0XHR0dW5uZWwubmFtZSxcblx0XHRcdHR1bm5lbC5ydW5uaW5nUHJvY2Vzcyxcblx0XHRcdHR1bm5lbC5waWQsXG5cdFx0XHR0dW5uZWwucHJpdmFjeSxcblx0XHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRcdHR1bm5lbFNlcnZpY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYWxsIG5vbi1zZXJpYWxpemFibGUgcHJvcGVydGllcyBmcm9tIHRoZSB0dW5uZWxcblx0ICogQHJldHVybnMgQSBuZXcgVHVubmVsSXRlbSB3aXRob3V0IGFueSBzZXJ2aWNlc1xuXHQgKi9cblx0cHVibGljIHN0cmlwKCk6IFR1bm5lbEl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBuZXcgVHVubmVsSXRlbShcblx0XHRcdHRoaXMudHVubmVsVHlwZSxcblx0XHRcdHRoaXMucmVtb3RlSG9zdCxcblx0XHRcdHRoaXMucmVtb3RlUG9ydCxcblx0XHRcdHRoaXMuc291cmNlLFxuXHRcdFx0dGhpcy5oYXNSdW5uaW5nUHJvY2Vzcyxcblx0XHRcdHRoaXMucHJvdG9jb2wsXG5cdFx0XHR0aGlzLmxvY2FsVXJpLFxuXHRcdFx0dGhpcy5sb2NhbEFkZHJlc3MsXG5cdFx0XHR0aGlzLmxvY2FsUG9ydCxcblx0XHRcdHRoaXMuY2xvc2VhYmxlLFxuXHRcdFx0dGhpcy5uYW1lLFxuXHRcdFx0dGhpcy5ydW5uaW5nUHJvY2Vzcyxcblx0XHRcdHRoaXMucGlkLFxuXHRcdFx0dGhpcy5fcHJpdmFjeVxuXHRcdCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgdHVubmVsVHlwZTogVHVubmVsVHlwZSxcblx0XHRwdWJsaWMgcmVtb3RlSG9zdDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZW1vdGVQb3J0OiBudW1iZXIsXG5cdFx0cHVibGljIHNvdXJjZTogeyBzb3VyY2U6IFR1bm5lbFNvdXJjZTsgZGVzY3JpcHRpb246IHN0cmluZyB9LFxuXHRcdHB1YmxpYyBoYXNSdW5uaW5nUHJvY2VzczogYm9vbGVhbixcblx0XHRwdWJsaWMgcHJvdG9jb2w6IFR1bm5lbFByb3RvY29sLFxuXHRcdHB1YmxpYyBsb2NhbFVyaT86IFVSSSxcblx0XHRwdWJsaWMgbG9jYWxBZGRyZXNzPzogc3RyaW5nLFxuXHRcdHB1YmxpYyBsb2NhbFBvcnQ/OiBudW1iZXIsXG5cdFx0cHVibGljIGNsb3NlYWJsZT86IGJvb2xlYW4sXG5cdFx0cHVibGljIG5hbWU/OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSBydW5uaW5nUHJvY2Vzcz86IHN0cmluZyxcblx0XHRwcml2YXRlIHBpZD86IG51bWJlcixcblx0XHRwcml2YXRlIF9wcml2YWN5PzogVHVubmVsUHJpdmFjeUlkIHwgc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlPzogSVJlbW90ZUV4cGxvcmVyU2VydmljZSxcblx0XHRwcml2YXRlIHR1bm5lbFNlcnZpY2U/OiBJVHVubmVsU2VydmljZVxuXHQpIHsgfVxuXG5cdGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkICYmIHRoaXMubmFtZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubmFtZTtcblx0XHR9XG5cdFx0Y29uc3QgcG9ydE51bWJlckxhYmVsID0gKGlzTG9jYWxob3N0KHRoaXMucmVtb3RlSG9zdCkgfHwgaXNBbGxJbnRlcmZhY2VzKHRoaXMucmVtb3RlSG9zdCkpXG5cdFx0XHQ/IGAke3RoaXMucmVtb3RlUG9ydH1gXG5cdFx0XHQ6IGAke3RoaXMucmVtb3RlSG9zdH06JHt0aGlzLnJlbW90ZVBvcnR9YDtcblx0XHRpZiAodGhpcy5uYW1lKSB7XG5cdFx0XHRyZXR1cm4gYCR7dGhpcy5uYW1lfSAoJHtwb3J0TnVtYmVyTGFiZWx9KWA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBwb3J0TnVtYmVyTGFiZWw7XG5cdFx0fVxuXHR9XG5cblx0c2V0IHByb2Nlc3NEZXNjcmlwdGlvbihkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5ydW5uaW5nUHJvY2VzcyA9IGRlc2NyaXB0aW9uO1xuXHR9XG5cblx0Z2V0IHByb2Nlc3NEZXNjcmlwdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCBkZXNjcmlwdGlvbjogc3RyaW5nID0gJyc7XG5cdFx0aWYgKHRoaXMucnVubmluZ1Byb2Nlc3MpIHtcblx0XHRcdGlmICh0aGlzLnBpZCAmJiB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZT8ubmFtZWRQcm9jZXNzZXMuaGFzKHRoaXMucGlkKSkge1xuXHRcdFx0XHQvLyBUaGlzIGlzIGEga25vd24gcHJvY2Vzcy4gR2l2ZSBpdCBhIGZyaWVuZGx5IG5hbWUuXG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UubmFtZWRQcm9jZXNzZXMuZ2V0KHRoaXMucGlkKSE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IHRoaXMucnVubmluZ1Byb2Nlc3MucmVwbGFjZSgvXFwwL2csICcgJykudHJpbSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMucGlkKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uICs9IGAgKCR7dGhpcy5waWR9KWA7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLmhhc1J1bm5pbmdQcm9jZXNzKSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IG5scy5sb2NhbGl6ZSgndHVubmVsVmlldy5ydW5uaW5nUHJvY2Vzcy5pbmFjZXNzYWJsZScsIFwiUHJvY2VzcyBpbmZvcm1hdGlvbiB1bmF2YWlsYWJsZVwiKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVzY3JpcHRpb247XG5cdH1cblxuXHRnZXQgdG9vbHRpcFBvc3RmaXgoKTogc3RyaW5nIHtcblx0XHRsZXQgaW5mb3JtYXRpb246IHN0cmluZztcblx0XHRpZiAodGhpcy5sb2NhbEFkZHJlc3MpIHtcblx0XHRcdGluZm9ybWF0aW9uID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLnRvb2x0aXBGb3J3YXJkZWQnLCBcIlJlbW90ZSBwb3J0IHswfTp7MX0gZm9yd2FyZGVkIHRvIGxvY2FsIGFkZHJlc3MgezJ9LiBcIiwgdGhpcy5yZW1vdGVIb3N0LCB0aGlzLnJlbW90ZVBvcnQsIHRoaXMubG9jYWxBZGRyZXNzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5mb3JtYXRpb24gPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwudG9vbHRpcENhbmRpZGF0ZScsIFwiUmVtb3RlIHBvcnQgezB9OnsxfSBub3QgZm9yd2FyZGVkLiBcIiwgdGhpcy5yZW1vdGVIb3N0LCB0aGlzLnJlbW90ZVBvcnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbmZvcm1hdGlvbjtcblx0fVxuXG5cdGdldCBpY29uVG9vbHRpcCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGlzQWRkID0gdGhpcy50dW5uZWxUeXBlID09PSBUdW5uZWxUeXBlLkFkZDtcblx0XHRpZiAoIWlzQWRkKSB7XG5cdFx0XHRyZXR1cm4gYCR7dGhpcy5wcm9jZXNzRGVzY3JpcHRpb24gPyBubHMubG9jYWxpemUoJ3R1bm5lbC5pY29uQ29sdW1uLnJ1bm5pbmcnLCBcIlBvcnQgaGFzIHJ1bm5pbmcgcHJvY2Vzcy5cIikgOlxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3R1bm5lbC5pY29uQ29sdW1uLm5vdFJ1bm5pbmcnLCBcIk5vIHJ1bm5pbmcgcHJvY2Vzcy5cIil9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMubGFiZWw7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHBvcnRUb29sdGlwKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgaXNBZGQgPSB0aGlzLnR1bm5lbFR5cGUgPT09IFR1bm5lbFR5cGUuQWRkO1xuXHRcdGlmICghaXNBZGQpIHtcblx0XHRcdHJldHVybiBgJHt0aGlzLm5hbWUgPyBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwudG9vbHRpcE5hbWUnLCBcIlBvcnQgbGFiZWxlZCB7MH0uIFwiLCB0aGlzLm5hbWUpIDogJyd9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0fVxuXG5cdGdldCBwcm9jZXNzVG9vbHRpcCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnByb2Nlc3NEZXNjcmlwdGlvbiA/PyAnJztcblx0fVxuXG5cdGdldCBvcmlnaW5Ub29sdGlwKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuc291cmNlLmRlc2NyaXB0aW9uO1xuXHR9XG5cblx0Z2V0IHByaXZhY3koKTogVHVubmVsUHJpdmFjeSB7XG5cdFx0aWYgKHRoaXMudHVubmVsU2VydmljZT8ucHJpdmFjeU9wdGlvbnMpIHtcblx0XHRcdHJldHVybiB0aGlzLnR1bm5lbFNlcnZpY2U/LnByaXZhY3lPcHRpb25zLmZpbmQoZWxlbWVudCA9PiBlbGVtZW50LmlkID09PSB0aGlzLl9wcml2YWN5KSA/P1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogJycsXG5cdFx0XHRcdHRoZW1lSWNvbjogQ29kaWNvbi5xdWVzdGlvbi5pZCxcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgndHVubmVsUHJpdmFjeS51bmtub3duJywgXCJVbmtub3duXCIpXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZDogVHVubmVsUHJpdmFjeUlkLlByaXZhdGUsXG5cdFx0XHRcdHRoZW1lSWNvbjogcHJpdmF0ZVBvcnRJY29uLmlkLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCd0dW5uZWxQcml2YWN5LnByaXZhdGUnLCBcIlByaXZhdGVcIilcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IFR1bm5lbFR5cGVDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8VHVubmVsVHlwZT4oJ3R1bm5lbFR5cGUnLCBUdW5uZWxUeXBlLkFkZCwgdHJ1ZSk7XG5jb25zdCBUdW5uZWxDbG9zZWFibGVDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3R1bm5lbENsb3NlYWJsZScsIGZhbHNlLCB0cnVlKTtcbmNvbnN0IFR1bm5lbFByaXZhY3lDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8VHVubmVsUHJpdmFjeUlkIHwgc3RyaW5nIHwgdW5kZWZpbmVkPigndHVubmVsUHJpdmFjeScsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5jb25zdCBUdW5uZWxQcml2YWN5RW5hYmxlZENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndHVubmVsUHJpdmFjeUVuYWJsZWQnLCBmYWxzZSwgdHJ1ZSk7XG5jb25zdCBUdW5uZWxQcm90b2NvbENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxUdW5uZWxQcm90b2NvbCB8IHVuZGVmaW5lZD4oJ3R1bm5lbFByb3RvY29sJywgVHVubmVsUHJvdG9jb2wuSHR0cCwgdHJ1ZSk7XG5jb25zdCBUdW5uZWxWaWV3Rm9jdXNDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3R1bm5lbFZpZXdGb2N1cycsIGZhbHNlLCBubHMubG9jYWxpemUoJ3R1bm5lbC5mb2N1c0NvbnRleHQnLCBcIldoZXRoZXIgdGhlIFBvcnRzIHZpZXcgaGFzIGZvY3VzLlwiKSk7XG5jb25zdCBUdW5uZWxWaWV3U2VsZWN0aW9uS2V5TmFtZSA9ICd0dW5uZWxWaWV3U2VsZWN0aW9uJztcbi8vIGhvc3Q6cG9ydFxuY29uc3QgVHVubmVsVmlld1NlbGVjdGlvbkNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+KFR1bm5lbFZpZXdTZWxlY3Rpb25LZXlOYW1lLCB1bmRlZmluZWQsIHRydWUpO1xuY29uc3QgVHVubmVsVmlld011bHRpU2VsZWN0aW9uS2V5TmFtZSA9ICd0dW5uZWxWaWV3TXVsdGlTZWxlY3Rpb24nO1xuLy8gaG9zdDpwb3J0W11cbmNvbnN0IFR1bm5lbFZpZXdNdWx0aVNlbGVjdGlvbkNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4oVHVubmVsVmlld011bHRpU2VsZWN0aW9uS2V5TmFtZSwgdW5kZWZpbmVkLCB0cnVlKTtcbmNvbnN0IFBvcnRDaGFuZ2FibGVDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3BvcnRDaGFuZ2FibGUnLCBmYWxzZSwgdHJ1ZSk7XG5jb25zdCBQcm90b2NvbENoYW5nZWFibGVDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Byb3RvY29sQ2hhbmdhYmxlJywgdHJ1ZSwgdHJ1ZSk7XG5cbmV4cG9ydCBjbGFzcyBUdW5uZWxQYW5lbCBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBUVU5ORUxfVklFV19JRDtcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFOiBJTG9jYWxpemVkU3RyaW5nID0gbmxzLmxvY2FsaXplMigncmVtb3RlLnR1bm5lbCcsIFwiUG9ydHNcIik7XG5cblx0cHJpdmF0ZSBwYW5lbENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGFibGU6IFdvcmtiZW5jaFRhYmxlPElUdW5uZWxJdGVtPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB0YWJsZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHR1bm5lbFR5cGVDb250ZXh0OiBJQ29udGV4dEtleTxUdW5uZWxUeXBlPjtcblx0cHJpdmF0ZSB0dW5uZWxDbG9zZWFibGVDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB0dW5uZWxQcml2YWN5Q29udGV4dDogSUNvbnRleHRLZXk8VHVubmVsUHJpdmFjeUlkIHwgc3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSB0dW5uZWxQcml2YWN5RW5hYmxlZENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHR1bm5lbFByb3RvY29sQ29udGV4dDogSUNvbnRleHRLZXk8VHVubmVsUHJvdG9jb2wgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHR1bm5lbFZpZXdGb2N1c0NvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHR1bm5lbFZpZXdTZWxlY3Rpb25Db250ZXh0OiBJQ29udGV4dEtleTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHR1bm5lbFZpZXdNdWx0aVNlbGVjdGlvbkNvbnRleHQ6IElDb250ZXh0S2V5PHN0cmluZ1tdIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBwb3J0Q2hhbmdhYmxlQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcHJvdG9jb2xDaGFuZ2FibGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpc0VkaXRpbmc6IGJvb2xlYW4gPSBmYWxzZTtcblx0Ly8gVE9ETzogU2hvdWxkIHRoaXMgYmUgcmVtb3ZlZD9cblx0Ly9AdHMtZXhwZWN0LWVycm9yXG5cdHByaXZhdGUgdGl0bGVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0cHJpdmF0ZSBsYXN0Rm9jdXM6IG51bWJlcltdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHZpZXdNb2RlbDogSVR1bm5lbFZpZXdNb2RlbCxcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByb3RlY3RlZCBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJvdGVjdGVkIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVR1bm5lbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0dGhpcy50dW5uZWxUeXBlQ29udGV4dCA9IFR1bm5lbFR5cGVDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50dW5uZWxDbG9zZWFibGVDb250ZXh0ID0gVHVubmVsQ2xvc2VhYmxlQ29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudHVubmVsUHJpdmFjeUNvbnRleHQgPSBUdW5uZWxQcml2YWN5Q29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudHVubmVsUHJpdmFjeUVuYWJsZWRDb250ZXh0ID0gVHVubmVsUHJpdmFjeUVuYWJsZWRDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50dW5uZWxQcml2YWN5RW5hYmxlZENvbnRleHQuc2V0KHR1bm5lbFNlcnZpY2UuY2FuQ2hhbmdlUHJpdmFjeSk7XG5cdFx0dGhpcy5wcm90b2NvbENoYW5nYWJsZUNvbnRleHRLZXkgPSBQcm90b2NvbENoYW5nZWFibGVDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5wcm90b2NvbENoYW5nYWJsZUNvbnRleHRLZXkuc2V0KHR1bm5lbFNlcnZpY2UuY2FuQ2hhbmdlUHJvdG9jb2wpO1xuXHRcdHRoaXMudHVubmVsUHJvdG9jb2xDb250ZXh0ID0gVHVubmVsUHJvdG9jb2xDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50dW5uZWxWaWV3Rm9jdXNDb250ZXh0ID0gVHVubmVsVmlld0ZvY3VzQ29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudHVubmVsVmlld1NlbGVjdGlvbkNvbnRleHQgPSBUdW5uZWxWaWV3U2VsZWN0aW9uQ29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudHVubmVsVmlld011bHRpU2VsZWN0aW9uQ29udGV4dCA9IFR1bm5lbFZpZXdNdWx0aVNlbGVjdGlvbkNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnBvcnRDaGFuZ2FibGVDb250ZXh0S2V5ID0gUG9ydENoYW5nYWJsZUNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG92ZXJsYXlDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShbWyd2aWV3JywgVHVubmVsUGFuZWwuSURdXSk7XG5cdFx0Y29uc3QgdGl0bGVNZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5UdW5uZWxUaXRsZSwgb3ZlcmxheUNvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdXBkYXRlQWN0aW9ucyA9ICgpID0+IHtcblx0XHRcdHRoaXMudGl0bGVBY3Rpb25zID0gZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnModGl0bGVNZW51LmdldEFjdGlvbnMoKSk7XG5cdFx0XHR0aGlzLnVwZGF0ZUFjdGlvbnMoKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGl0bGVNZW51Lm9uRGlkQ2hhbmdlKHVwZGF0ZUFjdGlvbnMpKTtcblx0XHR1cGRhdGVBY3Rpb25zKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy50aXRsZUFjdGlvbnMgPSBbXTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyUHJpdmFjeUFjdGlvbnMoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5vbmNlKHRoaXMudHVubmVsU2VydmljZS5vbkFkZGVkVHVubmVsUHJvdmlkZXIpKCgpID0+IHtcblx0XHRcdGxldCB1cGRhdGVkID0gZmFsc2U7XG5cdFx0XHRpZiAodGhpcy50dW5uZWxQcml2YWN5RW5hYmxlZENvbnRleHQuZ2V0KCkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdHRoaXMudHVubmVsUHJpdmFjeUVuYWJsZWRDb250ZXh0LnNldCh0dW5uZWxTZXJ2aWNlLmNhbkNoYW5nZVByaXZhY3kpO1xuXHRcdFx0XHR1cGRhdGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnByb3RvY29sQ2hhbmdhYmxlQ29udGV4dEtleS5nZXQoKSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHR0aGlzLnByb3RvY29sQ2hhbmdhYmxlQ29udGV4dEtleS5zZXQodHVubmVsU2VydmljZS5jYW5DaGFuZ2VQcm90b2NvbCk7XG5cdFx0XHRcdHVwZGF0ZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVwZGF0ZWQpIHtcblx0XHRcdFx0dXBkYXRlQWN0aW9ucygpO1xuXHRcdFx0XHR0aGlzLnJlZ2lzdGVyUHJpdmFjeUFjdGlvbnMoKTtcblx0XHRcdFx0dGhpcy5jcmVhdGVUYWJsZSgpO1xuXHRcdFx0XHR0aGlzLnRhYmxlPy5sYXlvdXQodGhpcy5oZWlnaHQsIHRoaXMud2lkdGgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJQcml2YWN5QWN0aW9ucygpIHtcblx0XHRmb3IgKGNvbnN0IHByaXZhY3lPcHRpb24gb2YgdGhpcy50dW5uZWxTZXJ2aWNlLnByaXZhY3lPcHRpb25zKSB7XG5cdFx0XHRjb25zdCBvcHRpb25JZCA9IGByZW1vdGUudHVubmVsLnByaXZhY3kke3ByaXZhY3lPcHRpb24uaWR9YDtcblx0XHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKG9wdGlvbklkLCBDaGFuZ2VUdW5uZWxQcml2YWN5QWN0aW9uLmhhbmRsZXIocHJpdmFjeU9wdGlvbi5pZCkpO1xuXHRcdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxQcml2YWN5LCAoe1xuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiBvcHRpb25JZCxcblx0XHRcdFx0XHR0aXRsZTogcHJpdmFjeU9wdGlvbi5sYWJlbCxcblx0XHRcdFx0XHR0b2dnbGVkOiBUdW5uZWxQcml2YWN5Q29udGV4dEtleS5pc0VxdWFsVG8ocHJpdmFjeU9wdGlvbi5pZClcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBwb3J0Q291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLnNpemUgKyB0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5kZXRlY3RlZC5zaXplO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUYWJsZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucGFuZWxDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRkb20uY2xlYXJOb2RlKHRoaXMucGFuZWxDb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0Q29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLnBhbmVsQ29udGFpbmVyLCBkb20uJCgnLmN1c3RvbXZpZXctdHJlZScpKTtcblx0XHR3aWRnZXRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncG9ydHMtdmlldycpO1xuXHRcdHdpZGdldENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdmaWxlLWljb24tdGhlbWFibGUtdHJlZScsICdzaG93LWZpbGUtaWNvbnMnKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhclJlbmRlcmVyID0gbmV3IEFjdGlvbkJhclJlbmRlcmVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR0aGlzLm1lbnVTZXJ2aWNlLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwgdGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UsIHRoaXMuY29tbWFuZFNlcnZpY2UsXG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb2x1bW5zID0gW25ldyBJY29uQ29sdW1uKCksIG5ldyBQb3J0Q29sdW1uKCksIG5ldyBMb2NhbEFkZHJlc3NDb2x1bW4oKSwgbmV3IFJ1bm5pbmdQcm9jZXNzQ29sdW1uKCldO1xuXHRcdGlmICh0aGlzLnR1bm5lbFNlcnZpY2UuY2FuQ2hhbmdlUHJpdmFjeSkge1xuXHRcdFx0Y29sdW1ucy5wdXNoKG5ldyBQcml2YWN5Q29sdW1uKCkpO1xuXHRcdH1cblx0XHRjb2x1bW5zLnB1c2gobmV3IE9yaWdpbkNvbHVtbigpKTtcblxuXHRcdHRoaXMudGFibGUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRhYmxlLFxuXHRcdFx0J1JlbW90ZVR1bm5lbHMnLFxuXHRcdFx0d2lkZ2V0Q29udGFpbmVyLFxuXHRcdFx0bmV3IFR1bm5lbFRyZWVWaXJ0dWFsRGVsZWdhdGUodGhpcy5yZW1vdGVFeHBsb3JlclNlcnZpY2UpLFxuXHRcdFx0Y29sdW1ucyxcblx0XHRcdFthY3Rpb25CYXJSZW5kZXJlcl0sXG5cdFx0XHR7XG5cdFx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGl0ZW06IElUdW5uZWxJdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaXRlbS5sYWJlbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogdHJ1ZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoaXRlbTogSVR1bm5lbEl0ZW0pID0+IHtcblx0XHRcdFx0XHRcdGlmIChpdGVtIGluc3RhbmNlb2YgVHVubmVsSXRlbSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gYCR7aXRlbS50b29sdGlwUG9zdGZpeH0gJHtpdGVtLnBvcnRUb29sdGlwfSAke2l0ZW0uaWNvblRvb2x0aXB9ICR7aXRlbS5wcm9jZXNzVG9vbHRpcH0gJHtpdGVtLm9yaWdpblRvb2x0aXB9ICR7dGhpcy50dW5uZWxTZXJ2aWNlLmNhbkNoYW5nZVByaXZhY3kgPyBpdGVtLnByaXZhY3kubGFiZWwgOiAnJ31gO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGl0ZW0ubGFiZWw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IG5scy5sb2NhbGl6ZSgndHVubmVsVmlldycsIFwiVHVubmVsIFZpZXdcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IHRydWVcblx0XHRcdH1cblx0XHQpIGFzIFdvcmtiZW5jaFRhYmxlPElUdW5uZWxJdGVtPjtcblxuXHRcdGNvbnN0IGFjdGlvblJ1bm5lcjogQWN0aW9uUnVubmVyID0gdGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uUnVubmVyKCkpO1xuXHRcdGFjdGlvbkJhclJlbmRlcmVyLmFjdGlvblJ1bm5lciA9IGFjdGlvblJ1bm5lcjtcblxuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZSk7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uQ29udGV4dE1lbnUoZSA9PiB0aGlzLm9uQ29udGV4dE1lbnUoZSwgYWN0aW9uUnVubmVyKSkpO1xuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZS5vbk1vdXNlRGJsQ2xpY2soZSA9PiB0aGlzLm9uTW91c2VEYmxDbGljayhlKSkpO1xuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZS5vbkRpZENoYW5nZUZvY3VzKGUgPT4gdGhpcy5vbkZvY3VzQ2hhbmdlZChlKSkpO1xuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHRoaXMub25TZWxlY3Rpb25DaGFuZ2VkKGUpKSk7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy50dW5uZWxWaWV3Rm9jdXNDb250ZXh0LnNldCh0cnVlKSkpO1xuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZS5vbkRpZEJsdXIoKCkgPT4gdGhpcy50dW5uZWxWaWV3Rm9jdXNDb250ZXh0LnNldChmYWxzZSkpKTtcblxuXHRcdGNvbnN0IHJlcmVuZGVyID0gKCkgPT4gdGhpcy50YWJsZT8uc3BsaWNlKDAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgdGhpcy52aWV3TW9kZWwuYWxsKTtcblxuXHRcdHJlcmVuZGVyKCk7XG5cdFx0bGV0IGxhc3RQb3J0Q291bnQgPSB0aGlzLnBvcnRDb3VudDtcblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKEV2ZW50LmRlYm91bmNlKHRoaXMudmlld01vZGVsLm9uRm9yd2FyZGVkUG9ydHNDaGFuZ2VkLCAoX2xhc3QsIGUpID0+IGUsIDUwKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdQb3J0Q291bnQgPSB0aGlzLnBvcnRDb3VudDtcblx0XHRcdGlmICgoKGxhc3RQb3J0Q291bnQgPT09IDApIHx8IChuZXdQb3J0Q291bnQgPT09IDApKSAmJiAobGFzdFBvcnRDb3VudCAhPT0gbmV3UG9ydENvdW50KSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0bGFzdFBvcnRDb3VudCA9IG5ld1BvcnRDb3VudDtcblx0XHRcdHJlcmVuZGVyKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uTW91c2VDbGljayhlID0+IHtcblx0XHRcdGlmICh0aGlzLmhhc09wZW5MaW5rTW9kaWZpZXIoZS5icm93c2VyRXZlbnQpICYmIHRoaXMudGFibGUpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50YWJsZS5nZXRTZWxlY3RlZEVsZW1lbnRzKCk7XG5cdFx0XHRcdGlmICgoc2VsZWN0aW9uLmxlbmd0aCA9PT0gMCkgfHxcblx0XHRcdFx0XHQoKHNlbGVjdGlvbi5sZW5ndGggPT09IDEpICYmIChzZWxlY3Rpb25bMF0gPT09IGUuZWxlbWVudCkpKSB7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChPcGVuUG9ydEluQnJvd3NlckFjdGlvbi5JRCwgZS5lbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRpZiAoIWUuZWxlbWVudCB8fCAoZS5lbGVtZW50LnR1bm5lbFR5cGUgIT09IFR1bm5lbFR5cGUuRm9yd2FyZGVkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5icm93c2VyRXZlbnQ/LnR5cGUgPT09ICdkYmxjbGljaycpIHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChMYWJlbFR1bm5lbEFjdGlvbi5JRCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnJlbW90ZUV4cGxvcmVyU2VydmljZS5vbkRpZENoYW5nZUVkaXRhYmxlKGUgPT4ge1xuXHRcdFx0dGhpcy5pc0VkaXRpbmcgPSAhIXRoaXMucmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmdldEVkaXRhYmxlRGF0YShlPy50dW5uZWwsIGU/LmVkaXRJZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdXZWxjb21lU3RhdGUuZmlyZSgpO1xuXG5cdFx0XHRpZiAoIXRoaXMuaXNFZGl0aW5nKSB7XG5cdFx0XHRcdHdpZGdldENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWdobGlnaHQnKTtcblx0XHRcdH1cblxuXHRcdFx0cmVyZW5kZXIoKTtcblxuXHRcdFx0aWYgKHRoaXMuaXNFZGl0aW5nKSB7XG5cdFx0XHRcdHdpZGdldENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWdobGlnaHQnKTtcblx0XHRcdFx0aWYgKCFlKSB7XG5cdFx0XHRcdFx0Ly8gV2hlbiB3ZSBhcmUgaW4gZWRpdGluZyBtb2RlIGZvciBhIG5ldyBmb3J3YXJkLCByYXRoZXIgdGhhbiB1cGRhdGluZyBhbiBleGlzdGluZyBvbmUgd2UgbmVlZCB0byByZXZlYWwgdGhlIGlucHV0IGJveCBzaW5jZSBpdCBtaWdodCBiZSBvdXQgb2Ygdmlldy5cblx0XHRcdFx0XHR0aGlzLnRhYmxlPy5yZXZlYWwodGhpcy50YWJsZS5pbmRleE9mKHRoaXMudmlld01vZGVsLmlucHV0KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChlICYmIChlLnR1bm5lbC50dW5uZWxUeXBlICE9PSBUdW5uZWxUeXBlLkFkZCkpIHtcblx0XHRcdFx0XHR0aGlzLnRhYmxlPy5zZXRGb2N1cyh0aGlzLmxhc3RGb2N1cyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnBhbmVsQ29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcudHJlZS1leHBsb3Jlci12aWV3bGV0LXRyZWUtdmlldycpKTtcblx0XHR0aGlzLmNyZWF0ZVRhYmxlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBzaG91bGRTaG93V2VsY29tZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWwuaXNFbXB0eSgpICYmICF0aGlzLmlzRWRpdGluZztcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy50YWJsZT8uZG9tRm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Gb2N1c0NoYW5nZWQoZXZlbnQ6IElUYWJsZUV2ZW50PElUdW5uZWxJdGVtPikge1xuXHRcdGlmIChldmVudC5pbmRleGVzLmxlbmd0aCA+IDAgJiYgZXZlbnQuZWxlbWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5sYXN0Rm9jdXMgPSBbLi4uZXZlbnQuaW5kZXhlc107XG5cdFx0fVxuXHRcdGNvbnN0IGVsZW1lbnRzID0gZXZlbnQuZWxlbWVudHM7XG5cdFx0Y29uc3QgaXRlbSA9IGVsZW1lbnRzICYmIGVsZW1lbnRzLmxlbmd0aCA/IGVsZW1lbnRzWzBdIDogdW5kZWZpbmVkO1xuXHRcdGlmIChpdGVtKSB7XG5cdFx0XHR0aGlzLnR1bm5lbFZpZXdTZWxlY3Rpb25Db250ZXh0LnNldChtYWtlQWRkcmVzcyhpdGVtLnJlbW90ZUhvc3QsIGl0ZW0ucmVtb3RlUG9ydCkpO1xuXHRcdFx0dGhpcy50dW5uZWxUeXBlQ29udGV4dC5zZXQoaXRlbS50dW5uZWxUeXBlKTtcblx0XHRcdHRoaXMudHVubmVsQ2xvc2VhYmxlQ29udGV4dC5zZXQoISFpdGVtLmNsb3NlYWJsZSk7XG5cdFx0XHR0aGlzLnR1bm5lbFByaXZhY3lDb250ZXh0LnNldChpdGVtLnByaXZhY3kuaWQpO1xuXHRcdFx0dGhpcy50dW5uZWxQcm90b2NvbENvbnRleHQuc2V0KGl0ZW0ucHJvdG9jb2wgPT09IFR1bm5lbFByb3RvY29sLkh0dHBzID8gVHVubmVsUHJvdG9jb2wuSHR0cHMgOiBUdW5uZWxQcm90b2NvbC5IdHRwKTtcblx0XHRcdHRoaXMucG9ydENoYW5nYWJsZUNvbnRleHRLZXkuc2V0KCEhaXRlbS5sb2NhbFBvcnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnR1bm5lbFR5cGVDb250ZXh0LnJlc2V0KCk7XG5cdFx0XHR0aGlzLnR1bm5lbFZpZXdTZWxlY3Rpb25Db250ZXh0LnJlc2V0KCk7XG5cdFx0XHR0aGlzLnR1bm5lbENsb3NlYWJsZUNvbnRleHQucmVzZXQoKTtcblx0XHRcdHRoaXMudHVubmVsUHJpdmFjeUNvbnRleHQucmVzZXQoKTtcblx0XHRcdHRoaXMudHVubmVsUHJvdG9jb2xDb250ZXh0LnJlc2V0KCk7XG5cdFx0XHR0aGlzLnBvcnRDaGFuZ2FibGVDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYXNPcGVuTGlua01vZGlmaWVyKGU6IE1vdXNlRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBlZGl0b3JDb25mID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IG11bHRpQ3Vyc29yTW9kaWZpZXI6ICdjdHJsQ21kJyB8ICdhbHQnIH0+KCdlZGl0b3InKTtcblxuXHRcdGxldCBtb2RpZmllcktleSA9IGZhbHNlO1xuXHRcdGlmIChlZGl0b3JDb25mLm11bHRpQ3Vyc29yTW9kaWZpZXIgPT09ICdjdHJsQ21kJykge1xuXHRcdFx0bW9kaWZpZXJLZXkgPSBlLmFsdEtleTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdG1vZGlmaWVyS2V5ID0gZS5tZXRhS2V5O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bW9kaWZpZXJLZXkgPSBlLmN0cmxLZXk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtb2RpZmllcktleTtcblx0fVxuXG5cdHByaXZhdGUgb25TZWxlY3Rpb25DaGFuZ2VkKGV2ZW50OiBJVGFibGVFdmVudDxJVHVubmVsSXRlbT4pIHtcblx0XHRjb25zdCBlbGVtZW50cyA9IGV2ZW50LmVsZW1lbnRzO1xuXHRcdGlmIChlbGVtZW50cy5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aGlzLnR1bm5lbFZpZXdNdWx0aVNlbGVjdGlvbkNvbnRleHQuc2V0KGVsZW1lbnRzLm1hcChlbGVtZW50ID0+IG1ha2VBZGRyZXNzKGVsZW1lbnQucmVtb3RlSG9zdCwgZWxlbWVudC5yZW1vdGVQb3J0KSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnR1bm5lbFZpZXdNdWx0aVNlbGVjdGlvbkNvbnRleHQuc2V0KHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGV2ZW50OiBJVGFibGVDb250ZXh0TWVudUV2ZW50PElUdW5uZWxJdGVtPiwgYWN0aW9uUnVubmVyOiBBY3Rpb25SdW5uZXIpOiB2b2lkIHtcblx0XHRpZiAoKGV2ZW50LmVsZW1lbnQgIT09IHVuZGVmaW5lZCkgJiYgIShldmVudC5lbGVtZW50IGluc3RhbmNlb2YgVHVubmVsSXRlbSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRldmVudC5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRldmVudC5icm93c2VyRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRjb25zdCBub2RlOiBUdW5uZWxJdGVtIHwgdW5kZWZpbmVkID0gZXZlbnQuZWxlbWVudDtcblxuXHRcdGlmIChub2RlKSB7XG5cdFx0XHR0aGlzLnRhYmxlPy5zZXRGb2N1cyhbdGhpcy50YWJsZS5pbmRleE9mKG5vZGUpXSk7XG5cdFx0XHR0aGlzLnR1bm5lbFR5cGVDb250ZXh0LnNldChub2RlLnR1bm5lbFR5cGUpO1xuXHRcdFx0dGhpcy50dW5uZWxDbG9zZWFibGVDb250ZXh0LnNldCghIW5vZGUuY2xvc2VhYmxlKTtcblx0XHRcdHRoaXMudHVubmVsUHJpdmFjeUNvbnRleHQuc2V0KG5vZGUucHJpdmFjeS5pZCk7XG5cdFx0XHR0aGlzLnR1bm5lbFByb3RvY29sQ29udGV4dC5zZXQobm9kZS5wcm90b2NvbCk7XG5cdFx0XHR0aGlzLnBvcnRDaGFuZ2FibGVDb250ZXh0S2V5LnNldCghIW5vZGUubG9jYWxQb3J0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50dW5uZWxUeXBlQ29udGV4dC5zZXQoVHVubmVsVHlwZS5BZGQpO1xuXHRcdFx0dGhpcy50dW5uZWxDbG9zZWFibGVDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLnR1bm5lbFByaXZhY3lDb250ZXh0LnNldCh1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy50dW5uZWxQcm90b2NvbENvbnRleHQuc2V0KHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnBvcnRDaGFuZ2FibGVDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdG1lbnVJZDogTWVudUlkLlR1bm5lbENvbnRleHQsXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMudGFibGU/LmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudC5hbmNob3IsXG5cdFx0XHRnZXRBY3Rpb25WaWV3SXRlbTogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cdFx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBBY3Rpb25WaWV3SXRlbShhY3Rpb24sIGFjdGlvbiwgeyBsYWJlbDogdHJ1ZSwga2V5YmluZGluZzoga2V5YmluZGluZy5nZXRMYWJlbCgpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAod2FzQ2FuY2VsbGVkPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRpZiAod2FzQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0dGhpcy50YWJsZT8uZG9tRm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBub2RlPy5zdHJpcCgpLFxuXHRcdFx0YWN0aW9uUnVubmVyXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG9uTW91c2VEYmxDbGljayhlOiBJVGFibGVNb3VzZUV2ZW50PElUdW5uZWxJdGVtPik6IHZvaWQge1xuXHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKEZvcndhcmRQb3J0QWN0aW9uLklOTElORV9JRCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoZWlnaHQgPSAwO1xuXHRwcml2YXRlIHdpZHRoID0gMDtcblx0cHJvdGVjdGVkIG92ZXJyaWRlIGxheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmhlaWdodCA9IGhlaWdodDtcblx0XHR0aGlzLndpZHRoID0gd2lkdGg7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLnRhYmxlPy5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFR1bm5lbFBhbmVsRGVzY3JpcHRvciBpbXBsZW1lbnRzIElWaWV3RGVzY3JpcHRvciB7XG5cdHJlYWRvbmx5IGlkID0gVHVubmVsUGFuZWwuSUQ7XG5cdHJlYWRvbmx5IG5hbWU6IElMb2NhbGl6ZWRTdHJpbmcgPSBUdW5uZWxQYW5lbC5USVRMRTtcblx0cmVhZG9ubHkgY3RvckRlc2NyaXB0b3I6IFN5bmNEZXNjcmlwdG9yPFR1bm5lbFBhbmVsPjtcblx0cmVhZG9ubHkgY2FuVG9nZ2xlVmlzaWJpbGl0eSA9IHRydWU7XG5cdHJlYWRvbmx5IGhpZGVCeURlZmF1bHQgPSBmYWxzZTtcblx0Ly8gZ3JvdXAgaXMgbm90IGFjdHVhbGx5IHVzZWQgZm9yIHZpZXdzIHRoYXQgYXJlIG5vdCBleHRlbnNpb24gY29udHJpYnV0ZWQuIFVzZSBvcmRlciBpbnN0ZWFkLlxuXHRyZWFkb25seSBncm91cCA9ICdkZXRhaWxzQDAnO1xuXHQvLyAtNTAwIGNvbWVzIGZyb20gdGhlIHJlbW90ZSBleHBsb3JlciB2aWV3T3JkZXJEZWxlZ2F0ZVxuXHRyZWFkb25seSBvcmRlciA9IC01MDA7XG5cdHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyB8IHN0cmluZ1tdO1xuXHRyZWFkb25seSBjYW5Nb3ZlVmlldyA9IHRydWU7XG5cdHJlYWRvbmx5IGNvbnRhaW5lckljb24gPSBwb3J0c1ZpZXdJY29uO1xuXG5cdGNvbnN0cnVjdG9yKHZpZXdNb2RlbDogSVR1bm5lbFZpZXdNb2RlbCwgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlKSB7XG5cdFx0dGhpcy5jdG9yRGVzY3JpcHRvciA9IG5ldyBTeW5jRGVzY3JpcHRvcihUdW5uZWxQYW5lbCwgW3ZpZXdNb2RlbF0pO1xuXHRcdHRoaXMucmVtb3RlQXV0aG9yaXR5ID0gZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSA/IGVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkuc3BsaXQoJysnKVswXSA6IHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0lUdW5uZWxJdGVtKGl0ZW06IGFueSk6IGl0ZW0gaXMgSVR1bm5lbEl0ZW0ge1xuXHRyZXR1cm4gaXRlbSAmJiBpdGVtLnR1bm5lbFR5cGUgJiYgaXRlbS5yZW1vdGVIb3N0ICYmIGl0ZW0uc291cmNlO1xufVxuXG5uYW1lc3BhY2UgTGFiZWxUdW5uZWxBY3Rpb24ge1xuXHRleHBvcnQgY29uc3QgSUQgPSAncmVtb3RlLnR1bm5lbC5sYWJlbCc7XG5cdGV4cG9ydCBjb25zdCBMQUJFTCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5sYWJlbCcsIFwiU2V0IFBvcnQgTGFiZWxcIik7XG5cdGV4cG9ydCBjb25zdCBDT01NQU5EX0lEX0tFWVdPUkQgPSAnbGFiZWwnO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBoYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKTogUHJvbWlzZTx7IHBvcnQ6IG51bWJlcjsgbGFiZWw6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRjb25zdCByZW1vdGVFeHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUV4cGxvcmVyU2VydmljZSk7XG5cdFx0XHRsZXQgdHVubmVsQ29udGV4dDogSVR1bm5lbEl0ZW0gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNJVHVubmVsSXRlbShhcmcpKSB7XG5cdFx0XHRcdHR1bm5lbENvbnRleHQgPSBhcmc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSkuZ2V0Q29udGV4dEtleVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oVHVubmVsVmlld1NlbGVjdGlvbktleU5hbWUpO1xuXHRcdFx0XHRjb25zdCB0dW5uZWwgPSBjb250ZXh0ID8gcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC5nZXQoY29udGV4dCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0dW5uZWwpIHtcblx0XHRcdFx0XHRjb25zdCB0dW5uZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUdW5uZWxTZXJ2aWNlKTtcblx0XHRcdFx0XHR0dW5uZWxDb250ZXh0ID0gVHVubmVsSXRlbS5jcmVhdGVGcm9tVHVubmVsKHJlbW90ZUV4cGxvcmVyU2VydmljZSwgdHVubmVsU2VydmljZSwgdHVubmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHR1bm5lbENvbnRleHQpIHtcblx0XHRcdFx0Y29uc3QgdHVubmVsSXRlbTogSVR1bm5lbEl0ZW0gPSB0dW5uZWxDb250ZXh0O1xuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhcnRpbmdWYWx1ZSA9IHR1bm5lbEl0ZW0ubmFtZSA/IHR1bm5lbEl0ZW0ubmFtZSA6IGAke3R1bm5lbEl0ZW0ucmVtb3RlUG9ydH1gO1xuXHRcdFx0XHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZS5zZXRFZGl0YWJsZSh0dW5uZWxJdGVtLCBUdW5uZWxFZGl0SWQuTGFiZWwsIHtcblx0XHRcdFx0XHRcdG9uRmluaXNoOiBhc3luYyAodmFsdWUsIHN1Y2Nlc3MpID0+IHtcblx0XHRcdFx0XHRcdFx0dmFsdWUgPSB2YWx1ZS50cmltKCk7XG5cdFx0XHRcdFx0XHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZS5zZXRFZGl0YWJsZSh0dW5uZWxJdGVtLCBUdW5uZWxFZGl0SWQuTGFiZWwsIG51bGwpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjaGFuZ2VkID0gc3VjY2VzcyAmJiAodmFsdWUgIT09IHN0YXJ0aW5nVmFsdWUpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5uYW1lKHR1bm5lbEl0ZW0ucmVtb3RlSG9zdCwgdHVubmVsSXRlbS5yZW1vdGVQb3J0LCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmVzb2x2ZShjaGFuZ2VkID8geyBwb3J0OiB0dW5uZWxJdGVtLnJlbW90ZVBvcnQsIGxhYmVsOiB2YWx1ZSB9IDogdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR2YWxpZGF0aW9uTWVzc2FnZTogKCkgPT4gbnVsbCxcblx0XHRcdFx0XHRcdHBsYWNlaG9sZGVyOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWxzVmlldy5sYWJlbFBsYWNlaG9sZGVyJywgXCJQb3J0IGxhYmVsXCIpLFxuXHRcdFx0XHRcdFx0c3RhcnRpbmdWYWx1ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0fVxufVxuXG5jb25zdCBpbnZhbGlkUG9ydFN0cmluZzogc3RyaW5nID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsc1ZpZXcucG9ydE51bWJlclZhbGlkJywgXCJGb3J3YXJkZWQgcG9ydCBzaG91bGQgYmUgYSBudW1iZXIgb3IgYSBob3N0OnBvcnQuXCIpO1xuY29uc3QgbWF4UG9ydE51bWJlcjogbnVtYmVyID0gNjU1MzY7XG5jb25zdCBpbnZhbGlkUG9ydE51bWJlclN0cmluZzogc3RyaW5nID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsc1ZpZXcucG9ydE51bWJlclRvSGlnaCcsIFwiUG9ydCBudW1iZXIgbXVzdCBiZSBcXHUyMjY1IDAgYW5kIDwgezB9LlwiLCBtYXhQb3J0TnVtYmVyKTtcbmNvbnN0IHJlcXVpcmVzU3Vkb1N0cmluZzogc3RyaW5nID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsVmlldy5pbmxpbmVFbGV2YXRpb25NZXNzYWdlJywgXCJNYXkgUmVxdWlyZSBTdWRvXCIpO1xuY29uc3QgYWxyZWFkeUZvcndhcmRlZDogc3RyaW5nID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsVmlldy5hbHJlYWR5Rm9yd2FyZGVkJywgXCJQb3J0IGlzIGFscmVhZHkgZm9yd2FyZGVkXCIpO1xuXG5leHBvcnQgbmFtZXNwYWNlIEZvcndhcmRQb3J0QWN0aW9uIHtcblx0ZXhwb3J0IGNvbnN0IElOTElORV9JRCA9ICdyZW1vdGUudHVubmVsLmZvcndhcmRJbmxpbmUnO1xuXHRleHBvcnQgY29uc3QgQ09NTUFORFBBTEVUVEVfSUQgPSAncmVtb3RlLnR1bm5lbC5mb3J3YXJkQ29tbWFuZFBhbGV0dGUnO1xuXHRleHBvcnQgY29uc3QgTEFCRUw6IElMb2NhbGl6ZWRTdHJpbmcgPSBubHMubG9jYWxpemUyKCdyZW1vdGUudHVubmVsLmZvcndhcmQnLCBcIkZvcndhcmQgYSBQb3J0XCIpO1xuXHRleHBvcnQgY29uc3QgVFJFRUlURU1fTEFCRUwgPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwuZm9yd2FyZEl0ZW0nLCBcIkZvcndhcmQgUG9ydFwiKTtcblx0Y29uc3QgZm9yd2FyZFByb21wdCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5mb3J3YXJkUHJvbXB0JywgXCJQb3J0IG51bWJlciBvciBhZGRyZXNzIChlZy4gMzAwMCBvciAxMC4xMC4xMC4xMDoyMDAwKS5cIik7XG5cblx0ZnVuY3Rpb24gdmFsaWRhdGVJbnB1dChyZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlLCB2YWx1ZTogc3RyaW5nLCBjYW5FbGV2YXRlOiBib29sZWFuKTogeyBjb250ZW50OiBzdHJpbmc7IHNldmVyaXR5OiBTZXZlcml0eSB9IHwgbnVsbCB7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VBZGRyZXNzKHZhbHVlKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogaW52YWxpZFBvcnRTdHJpbmcsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9O1xuXHRcdH0gZWxzZSBpZiAocGFyc2VkLnBvcnQgPj0gbWF4UG9ydE51bWJlcikge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogaW52YWxpZFBvcnROdW1iZXJTdHJpbmcsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9O1xuXHRcdH0gZWxzZSBpZiAoY2FuRWxldmF0ZSAmJiB0dW5uZWxTZXJ2aWNlLmlzUG9ydFByaXZpbGVnZWQocGFyc2VkLnBvcnQpKSB7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiByZXF1aXJlc1N1ZG9TdHJpbmcsIHNldmVyaXR5OiBTZXZlcml0eS5JbmZvIH07XG5cdFx0fSBlbHNlIGlmIChtYXBIYXNBZGRyZXNzTG9jYWxob3N0T3JBbGxJbnRlcmZhY2VzKHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQsIHBhcnNlZC5ob3N0LCBwYXJzZWQucG9ydCkpIHtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IGFscmVhZHlGb3J3YXJkZWQsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGVycm9yKG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLCB0dW5uZWxPckVycm9yOiBSZW1vdGVUdW5uZWwgfCBzdHJpbmcgfCB2b2lkLCBob3N0OiBzdHJpbmcsIHBvcnQ6IG51bWJlcikge1xuXHRcdGlmICghdHVubmVsT3JFcnJvcikge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5mb3J3YXJkRXJyb3InLCBcIlVuYWJsZSB0byBmb3J3YXJkIHswfTp7MX0uIFRoZSBob3N0IG1heSBub3QgYmUgYXZhaWxhYmxlIG9yIHRoYXQgcmVtb3RlIHBvcnQgbWF5IGFscmVhZHkgYmUgZm9yd2FyZGVkXCIsIGhvc3QsIHBvcnQpKTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiB0dW5uZWxPckVycm9yID09PSAnc3RyaW5nJykge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5mb3J3YXJkRXJyb3JQcm92aWRlZCcsIFwiVW5hYmxlIHRvIGZvcndhcmQgezB9OnsxfS4gezJ9XCIsIGhvc3QsIHBvcnQsIHR1bm5lbE9yRXJyb3IpKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaW5saW5lSGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhc3luYyAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCB0dW5uZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUdW5uZWxTZXJ2aWNlKTtcblx0XHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZS5zZXRFZGl0YWJsZSh1bmRlZmluZWQsIFR1bm5lbEVkaXRJZC5OZXcsIHtcblx0XHRcdFx0b25GaW5pc2g6IGFzeW5jICh2YWx1ZSwgc3VjY2VzcykgPT4ge1xuXHRcdFx0XHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZS5zZXRFZGl0YWJsZSh1bmRlZmluZWQsIFR1bm5lbEVkaXRJZC5OZXcsIG51bGwpO1xuXHRcdFx0XHRcdGxldCBwYXJzZWQ6IHsgaG9zdDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoc3VjY2VzcyAmJiAocGFyc2VkID0gcGFyc2VBZGRyZXNzKHZhbHVlKSkpIHtcblx0XHRcdFx0XHRcdHJlbW90ZUV4cGxvcmVyU2VydmljZS5mb3J3YXJkKHtcblx0XHRcdFx0XHRcdFx0cmVtb3RlOiB7IGhvc3Q6IHBhcnNlZC5ob3N0LCBwb3J0OiBwYXJzZWQucG9ydCB9LFxuXHRcdFx0XHRcdFx0XHRlbGV2YXRlSWZOZWVkZWQ6IHRydWVcblx0XHRcdFx0XHRcdH0pLnRoZW4odHVubmVsT3JFcnJvciA9PiBlcnJvcihub3RpZmljYXRpb25TZXJ2aWNlLCB0dW5uZWxPckVycm9yLCBwYXJzZWQhLmhvc3QsIHBhcnNlZCEucG9ydCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0dmFsaWRhdGlvbk1lc3NhZ2U6ICh2YWx1ZSkgPT4gdmFsaWRhdGVJbnB1dChyZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2UsIHZhbHVlLCB0dW5uZWxTZXJ2aWNlLmNhbkVsZXZhdGUpLFxuXHRcdFx0XHRwbGFjZWhvbGRlcjogZm9yd2FyZFByb21wdFxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBjb21tYW5kUGFsZXR0ZUhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYXN5bmMgKGFjY2Vzc29yLCBhcmcpID0+IHtcblx0XHRcdGNvbnN0IHJlbW90ZUV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgdmlld3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVR1bm5lbFNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3KFR1bm5lbFBhbmVsLklELCB0cnVlKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0XHRwcm9tcHQ6IGZvcndhcmRQcm9tcHQsXG5cdFx0XHRcdHZhbGlkYXRlSW5wdXQ6ICh2YWx1ZSkgPT4gUHJvbWlzZS5yZXNvbHZlKHZhbGlkYXRlSW5wdXQocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlLCB2YWx1ZSwgdHVubmVsU2VydmljZS5jYW5FbGV2YXRlKSlcblx0XHRcdH0pO1xuXHRcdFx0bGV0IHBhcnNlZDogeyBob3N0OiBzdHJpbmc7IHBvcnQ6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHZhbHVlICYmIChwYXJzZWQgPSBwYXJzZUFkZHJlc3ModmFsdWUpKSkge1xuXHRcdFx0XHRyZW1vdGVFeHBsb3JlclNlcnZpY2UuZm9yd2FyZCh7XG5cdFx0XHRcdFx0cmVtb3RlOiB7IGhvc3Q6IHBhcnNlZC5ob3N0LCBwb3J0OiBwYXJzZWQucG9ydCB9LFxuXHRcdFx0XHRcdGVsZXZhdGVJZk5lZWRlZDogdHJ1ZVxuXHRcdFx0XHR9KS50aGVuKHR1bm5lbCA9PiBlcnJvcihub3RpZmljYXRpb25TZXJ2aWNlLCB0dW5uZWwsIHBhcnNlZCEuaG9zdCwgcGFyc2VkIS5wb3J0KSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5pbnRlcmZhY2UgUXVpY2tQaWNrVHVubmVsIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHR0dW5uZWw/OiBJVHVubmVsSXRlbTtcbn1cblxuZnVuY3Rpb24gbWFrZVR1bm5lbFBpY2tzKHR1bm5lbHM6IFR1bm5lbFtdLCByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2U6IElUdW5uZWxTZXJ2aWNlKTogUXVpY2tQaWNrSW5wdXQ8UXVpY2tQaWNrVHVubmVsPltdIHtcblx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0lucHV0PFF1aWNrUGlja1R1bm5lbD5bXSA9IHR1bm5lbHMubWFwKGZvcndhcmRlZCA9PiB7XG5cdFx0Y29uc3QgaXRlbSA9IFR1bm5lbEl0ZW0uY3JlYXRlRnJvbVR1bm5lbChyZW1vdGVFeHBsb3JlclNlcnZpY2UsIHR1bm5lbFNlcnZpY2UsIGZvcndhcmRlZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb246IGl0ZW0ucHJvY2Vzc0Rlc2NyaXB0aW9uLFxuXHRcdFx0dHVubmVsOiBpdGVtXG5cdFx0fTtcblx0fSk7XG5cdGlmIChwaWNrcy5sZW5ndGggPT09IDApIHtcblx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwuY2xvc2VOb1BvcnRzJywgXCJObyBwb3J0cyBjdXJyZW50bHkgZm9yd2FyZGVkLiBUcnkgcnVubmluZyB0aGUgezB9IGNvbW1hbmRcIiwgRm9yd2FyZFBvcnRBY3Rpb24uTEFCRUwudmFsdWUpXG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIHBpY2tzO1xufVxuXG5uYW1lc3BhY2UgQ2xvc2VQb3J0QWN0aW9uIHtcblx0ZXhwb3J0IGNvbnN0IElOTElORV9JRCA9ICdyZW1vdGUudHVubmVsLmNsb3NlSW5saW5lJztcblx0ZXhwb3J0IGNvbnN0IENPTU1BTkRQQUxFVFRFX0lEID0gJ3JlbW90ZS50dW5uZWwuY2xvc2VDb21tYW5kUGFsZXR0ZSc7XG5cdGV4cG9ydCBjb25zdCBMQUJFTDogSUxvY2FsaXplZFN0cmluZyA9IG5scy5sb2NhbGl6ZTIoJ3JlbW90ZS50dW5uZWwuY2xvc2UnLCBcIlN0b3AgRm9yd2FyZGluZyBQb3J0XCIpO1xuXG5cdGV4cG9ydCBmdW5jdGlvbiBpbmxpbmVIYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0bGV0IHBvcnRzOiAoSVR1bm5lbEl0ZW0gfCBUdW5uZWwpW10gPSBbXTtcblx0XHRcdGNvbnN0IG11bHRpU2VsZWN0Q29udGV4dCA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4oVHVubmVsVmlld011bHRpU2VsZWN0aW9uS2V5TmFtZSk7XG5cdFx0XHRpZiAobXVsdGlTZWxlY3RDb250ZXh0KSB7XG5cdFx0XHRcdG11bHRpU2VsZWN0Q29udGV4dC5mb3JFYWNoKGNvbnRleHQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHR1bm5lbCA9IHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQuZ2V0KGNvbnRleHQpO1xuXHRcdFx0XHRcdGlmICh0dW5uZWwpIHtcblx0XHRcdFx0XHRcdHBvcnRzPy5wdXNoKHR1bm5lbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNJVHVubmVsSXRlbShhcmcpKSB7XG5cdFx0XHRcdHBvcnRzID0gW2FyZ107XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjb250ZXh0ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oVHVubmVsVmlld1NlbGVjdGlvbktleU5hbWUpO1xuXHRcdFx0XHRjb25zdCB0dW5uZWwgPSBjb250ZXh0ID8gcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnR1bm5lbE1vZGVsLmZvcndhcmRlZC5nZXQoY29udGV4dCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh0dW5uZWwpIHtcblx0XHRcdFx0XHRwb3J0cyA9IFt0dW5uZWxdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghcG9ydHMgfHwgcG9ydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChwb3J0cy5tYXAocG9ydCA9PiByZW1vdGVFeHBsb3JlclNlcnZpY2UuY2xvc2UoeyBob3N0OiBwb3J0LnJlbW90ZUhvc3QsIHBvcnQ6IHBvcnQucmVtb3RlUG9ydCB9LCBUdW5uZWxDbG9zZVJlYXNvbi5Vc2VyKSkpO1xuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gY29tbWFuZFBhbGV0dGVIYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHJlbW90ZUV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVR1bm5lbFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0lucHV0PFF1aWNrUGlja1R1bm5lbD5bXSA9IG1ha2VUdW5uZWxQaWNrcyhBcnJheS5mcm9tKHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQudmFsdWVzKCkpLmZpbHRlcih0dW5uZWwgPT4gdHVubmVsLmNsb3NlYWJsZSksIHJlbW90ZUV4cGxvcmVyU2VydmljZSwgdHVubmVsU2VydmljZSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwuY2xvc2VQbGFjZWhvbGRlcicsIFwiQ2hvb3NlIGEgcG9ydCB0byBzdG9wIGZvcndhcmRpbmdcIikgfSk7XG5cdFx0XHRpZiAocmVzdWx0ICYmIHJlc3VsdC50dW5uZWwpIHtcblx0XHRcdFx0YXdhaXQgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmNsb3NlKHsgaG9zdDogcmVzdWx0LnR1bm5lbC5yZW1vdGVIb3N0LCBwb3J0OiByZXN1bHQudHVubmVsLnJlbW90ZVBvcnQgfSwgVHVubmVsQ2xvc2VSZWFzb24uVXNlcik7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc3VsdCkge1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChGb3J3YXJkUG9ydEFjdGlvbi5DT01NQU5EUEFMRVRURV9JRCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uIHtcblx0ZXhwb3J0IGNvbnN0IElEID0gJ3JlbW90ZS50dW5uZWwub3Blbic7XG5cdGV4cG9ydCBjb25zdCBMQUJFTCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5vcGVuJywgXCJPcGVuIGluIEJyb3dzZXJcIik7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZXIoKTogSUNvbW1hbmRIYW5kbGVyIHtcblx0XHRyZXR1cm4gYXN5bmMgKGFjY2Vzc29yLCBhcmcpID0+IHtcblx0XHRcdGxldCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpc0lUdW5uZWxJdGVtKGFyZykpIHtcblx0XHRcdFx0a2V5ID0gbWFrZUFkZHJlc3MoYXJnLnJlbW90ZUhvc3QsIGFyZy5yZW1vdGVQb3J0KTtcblx0XHRcdH0gZWxzZSBpZiAoaXNSZW1vdGVUdW5uZWwoYXJnKSkge1xuXHRcdFx0XHRrZXkgPSBtYWtlQWRkcmVzcyhhcmcudHVubmVsUmVtb3RlSG9zdCwgYXJnLnR1bm5lbFJlbW90ZVBvcnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGFjY2Vzc29yLmdldChJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlKS50dW5uZWxNb2RlbDtcblx0XHRcdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdHJldHVybiBydW4obW9kZWwsIG9wZW5lclNlcnZpY2UsIGtleSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBydW4obW9kZWw6IFR1bm5lbE1vZGVsLCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSwga2V5OiBzdHJpbmcpIHtcblx0XHRjb25zdCB0dW5uZWwgPSBtb2RlbC5mb3J3YXJkZWQuZ2V0KGtleSkgfHwgbW9kZWwuZGV0ZWN0ZWQuZ2V0KGtleSk7XG5cdFx0aWYgKHR1bm5lbCkge1xuXHRcdFx0cmV0dXJuIG9wZW5lclNlcnZpY2Uub3Blbih0dW5uZWwubG9jYWxVcmksIHsgYWxsb3dDb250cmlidXRlZE9wZW5lcnM6IGZhbHNlIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBPcGVuUG9ydEluUHJldmlld0FjdGlvbiB7XG5cdGV4cG9ydCBjb25zdCBJRCA9ICdyZW1vdGUudHVubmVsLm9wZW5QcmV2aWV3Jztcblx0ZXhwb3J0IGNvbnN0IExBQkVMID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLm9wZW5QcmV2aWV3JywgXCJQcmV2aWV3IGluIEVkaXRvclwiKTtcblxuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhc3luYyAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0bGV0IGtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlzSVR1bm5lbEl0ZW0oYXJnKSkge1xuXHRcdFx0XHRrZXkgPSBtYWtlQWRkcmVzcyhhcmcucmVtb3RlSG9zdCwgYXJnLnJlbW90ZVBvcnQpO1xuXHRcdFx0fSBlbHNlIGlmIChpc1JlbW90ZVR1bm5lbChhcmcpKSB7XG5cdFx0XHRcdGtleSA9IG1ha2VBZGRyZXNzKGFyZy50dW5uZWxSZW1vdGVIb3N0LCBhcmcudHVubmVsUmVtb3RlUG9ydCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpLnR1bm5lbE1vZGVsO1xuXHRcdFx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UpO1xuXHRcdFx0XHRyZXR1cm4gcnVuKG1vZGVsLCBvcGVuZXJTZXJ2aWNlLCBleHRlcm5hbE9wZW5lclNlcnZpY2UsIGtleSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW4obW9kZWw6IFR1bm5lbE1vZGVsLCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSwgZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlOiBJRXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlLCBrZXk6IHN0cmluZykge1xuXHRcdGNvbnN0IHR1bm5lbCA9IG1vZGVsLmZvcndhcmRlZC5nZXQoa2V5KSB8fCBtb2RlbC5kZXRlY3RlZC5nZXQoa2V5KTtcblx0XHRpZiAodHVubmVsKSB7XG5cdFx0XHRjb25zdCByZW1vdGVIb3N0ID0gdHVubmVsLnJlbW90ZUhvc3QuaW5jbHVkZXMoJzonKSA/IGBbJHt0dW5uZWwucmVtb3RlSG9zdH1dYCA6IHR1bm5lbC5yZW1vdGVIb3N0O1xuXHRcdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLnBhcnNlKGBodHRwOi8vJHtyZW1vdGVIb3N0fToke3R1bm5lbC5yZW1vdGVQb3J0fWApO1xuXHRcdFx0Y29uc3Qgb3BlbmVyID0gYXdhaXQgZXh0ZXJuYWxPcGVuZXJTZXJ2aWNlLmdldE9wZW5lcih0dW5uZWwubG9jYWxVcmksIHsgc291cmNlVXJpIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0aWYgKG9wZW5lcikge1xuXHRcdFx0XHRyZXR1cm4gb3BlbmVyLm9wZW5FeHRlcm5hbFVyaSh0dW5uZWwubG9jYWxVcmksIHsgc291cmNlVXJpIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG9wZW5lclNlcnZpY2Uub3Blbih0dW5uZWwubG9jYWxVcmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxubmFtZXNwYWNlIE9wZW5Qb3J0SW5Ccm93c2VyQ29tbWFuZFBhbGV0dGVBY3Rpb24ge1xuXHRleHBvcnQgY29uc3QgSUQgPSAncmVtb3RlLnR1bm5lbC5vcGVuQ29tbWFuZFBhbGV0dGUnO1xuXHRleHBvcnQgY29uc3QgTEFCRUwgPSBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwub3BlbkNvbW1hbmRQYWxldHRlJywgXCJPcGVuIFBvcnQgaW4gQnJvd3NlclwiKTtcblxuXHRpbnRlcmZhY2UgUXVpY2tQaWNrVHVubmVsIGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdHR1bm5lbD86IFR1bm5lbEl0ZW07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhc3luYyAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdHVubmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVHVubmVsU2VydmljZSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbDtcblx0XHRcdGNvbnN0IHF1aWNrUGlja1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IG9wdGlvbnM6IFF1aWNrUGlja1R1bm5lbFtdID0gWy4uLm1vZGVsLmZvcndhcmRlZCwgLi4ubW9kZWwuZGV0ZWN0ZWRdLm1hcCh2YWx1ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHR1bm5lbEl0ZW0gPSBUdW5uZWxJdGVtLmNyZWF0ZUZyb21UdW5uZWwocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlLCB2YWx1ZVsxXSk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0bGFiZWw6IHR1bm5lbEl0ZW0ubGFiZWwsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHR1bm5lbEl0ZW0ucHJvY2Vzc0Rlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHR1bm5lbDogdHVubmVsSXRlbVxuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAob3B0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0b3B0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLm9wZW5Db21tYW5kUGFsZXR0ZU5vbmUnLCBcIk5vIHBvcnRzIGN1cnJlbnRseSBmb3J3YXJkZWQuIE9wZW4gdGhlIFBvcnRzIHZpZXcgdG8gZ2V0IHN0YXJ0ZWQuXCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3B0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLm9wZW5Db21tYW5kUGFsZXR0ZVZpZXcnLCBcIk9wZW4gdGhlIFBvcnRzIHZpZXcuLi5cIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwaWNrZWQgPSBhd2FpdCBxdWlja1BpY2tTZXJ2aWNlLnBpY2s8UXVpY2tQaWNrVHVubmVsPihvcHRpb25zLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ3JlbW90ZS50dW5uZWwub3BlbkNvbW1hbmRQYWxldHRlUGljaycsIFwiQ2hvb3NlIHRoZSBwb3J0IHRvIG9wZW5cIikgfSk7XG5cdFx0XHRpZiAocGlja2VkICYmIHBpY2tlZC50dW5uZWwpIHtcblx0XHRcdFx0cmV0dXJuIE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLnJ1bihtb2RlbCwgb3BlbmVyU2VydmljZSwgbWFrZUFkZHJlc3MocGlja2VkLnR1bm5lbC5yZW1vdGVIb3N0LCBwaWNrZWQudHVubmVsLnJlbW90ZVBvcnQpKTtcblx0XHRcdH0gZWxzZSBpZiAocGlja2VkKSB7XG5cdFx0XHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChgJHtUVU5ORUxfVklFV19JRH0uZm9jdXNgKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBDb3B5QWRkcmVzc0FjdGlvbiB7XG5cdGV4cG9ydCBjb25zdCBJTkxJTkVfSUQgPSAncmVtb3RlLnR1bm5lbC5jb3B5QWRkcmVzc0lubGluZSc7XG5cdGV4cG9ydCBjb25zdCBDT01NQU5EUEFMRVRURV9JRCA9ICdyZW1vdGUudHVubmVsLmNvcHlBZGRyZXNzQ29tbWFuZFBhbGV0dGUnO1xuXHRleHBvcnQgY29uc3QgSU5MSU5FX0xBQkVMID0gbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmNvcHlBZGRyZXNzSW5saW5lJywgXCJDb3B5IExvY2FsIEFkZHJlc3NcIik7XG5cdGV4cG9ydCBjb25zdCBDT01NQU5EUEFMRVRURV9MQUJFTCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5jb3B5QWRkcmVzc0NvbW1hbmRQYWxldHRlJywgXCJDb3B5IEZvcndhcmRlZCBQb3J0IEFkZHJlc3NcIik7XG5cblx0YXN5bmMgZnVuY3Rpb24gY29weUFkZHJlc3MocmVtb3RlRXhwbG9yZXJTZXJ2aWNlOiBJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSwgdHVubmVsSXRlbTogeyByZW1vdGVIb3N0OiBzdHJpbmc7IHJlbW90ZVBvcnQ6IG51bWJlciB9KSB7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5hZGRyZXNzKHR1bm5lbEl0ZW0ucmVtb3RlSG9zdCwgdHVubmVsSXRlbS5yZW1vdGVQb3J0KTtcblx0XHRpZiAoYWRkcmVzcykge1xuXHRcdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoYWRkcmVzcy50b1N0cmluZygpKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaW5saW5lSGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhc3luYyAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0bGV0IHR1bm5lbEl0ZW06IElUdW5uZWxJdGVtIHwgVHVubmVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGlzSVR1bm5lbEl0ZW0oYXJnKSkge1xuXHRcdFx0XHR0dW5uZWxJdGVtID0gYXJnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpLmdldENvbnRleHRLZXlWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KFR1bm5lbFZpZXdTZWxlY3Rpb25LZXlOYW1lKTtcblx0XHRcdFx0dHVubmVsSXRlbSA9IGNvbnRleHQgPyByZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLmdldChjb250ZXh0KSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICh0dW5uZWxJdGVtKSB7XG5cdFx0XHRcdHJldHVybiBjb3B5QWRkcmVzcyhyZW1vdGVFeHBsb3JlclNlcnZpY2UsIGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSksIHR1bm5lbEl0ZW0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gY29tbWFuZFBhbGV0dGVIYW5kbGVyKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdHVubmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVHVubmVsU2VydmljZSk7XG5cdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2xpcGJvYXJkU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHR1bm5lbHMgPSBBcnJheS5mcm9tKHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5mb3J3YXJkZWQudmFsdWVzKCkpLmNvbmNhdChBcnJheS5mcm9tKHJlbW90ZUV4cGxvcmVyU2VydmljZS50dW5uZWxNb2RlbC5kZXRlY3RlZC52YWx1ZXMoKSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhtYWtlVHVubmVsUGlja3ModHVubmVscywgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlKSwgeyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmNvcHlBZGRyZXNzUGxhY2Vob2xkdGVyJywgXCJDaG9vc2UgYSBmb3J3YXJkZWQgcG9ydFwiKSB9KTtcblx0XHRcdGlmIChyZXN1bHQgJiYgcmVzdWx0LnR1bm5lbCkge1xuXHRcdFx0XHRhd2FpdCBjb3B5QWRkcmVzcyhyZW1vdGVFeHBsb3JlclNlcnZpY2UsIGNsaXBib2FyZFNlcnZpY2UsIHJlc3VsdC50dW5uZWwpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXN1bHQpIHtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRm9yd2FyZFBvcnRBY3Rpb24uQ09NTUFORFBBTEVUVEVfSUQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxubmFtZXNwYWNlIENoYW5nZUxvY2FsUG9ydEFjdGlvbiB7XG5cdGV4cG9ydCBjb25zdCBJRCA9ICdyZW1vdGUudHVubmVsLmNoYW5nZUxvY2FsUG9ydCc7XG5cdGV4cG9ydCBjb25zdCBMQUJFTCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5jaGFuZ2VMb2NhbFBvcnQnLCBcIkNoYW5nZSBMb2NhbCBBZGRyZXNzIFBvcnRcIik7XG5cblx0ZnVuY3Rpb24gdmFsaWRhdGVJbnB1dCh0dW5uZWxTZXJ2aWNlOiBJVHVubmVsU2VydmljZSwgdmFsdWU6IHN0cmluZywgY2FuRWxldmF0ZTogYm9vbGVhbik6IHsgY29udGVudDogc3RyaW5nOyBzZXZlcml0eTogU2V2ZXJpdHkgfSB8IG51bGwge1xuXHRcdGlmICghdmFsdWUubWF0Y2goL15bMC05XSskLykpIHtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbHNWaWV3LnBvcnRTaG91bGRCZU51bWJlcicsIFwiTG9jYWwgcG9ydCBzaG91bGQgYmUgYSBudW1iZXIuXCIpLCBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IgfTtcblx0XHR9IGVsc2UgaWYgKE51bWJlcih2YWx1ZSkgPj0gbWF4UG9ydE51bWJlcikge1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogaW52YWxpZFBvcnROdW1iZXJTdHJpbmcsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9O1xuXHRcdH0gZWxzZSBpZiAoY2FuRWxldmF0ZSAmJiB0dW5uZWxTZXJ2aWNlLmlzUG9ydFByaXZpbGVnZWQoTnVtYmVyKHZhbHVlKSkpIHtcblx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IHJlcXVpcmVzU3Vkb1N0cmluZywgc2V2ZXJpdHk6IFNldmVyaXR5LkluZm8gfTtcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlcigpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhc3luYyAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCB0dW5uZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUdW5uZWxTZXJ2aWNlKTtcblx0XHRcdGxldCB0dW5uZWxDb250ZXh0OiBJVHVubmVsSXRlbSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpc0lUdW5uZWxJdGVtKGFyZykpIHtcblx0XHRcdFx0dHVubmVsQ29udGV4dCA9IGFyZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHQgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKS5nZXRDb250ZXh0S2V5VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPihUdW5uZWxWaWV3U2VsZWN0aW9uS2V5TmFtZSk7XG5cdFx0XHRcdGNvbnN0IHR1bm5lbCA9IGNvbnRleHQgPyByZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuZm9yd2FyZGVkLmdldChjb250ZXh0KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHR1bm5lbCkge1xuXHRcdFx0XHRcdGNvbnN0IHR1bm5lbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVR1bm5lbFNlcnZpY2UpO1xuXHRcdFx0XHRcdHR1bm5lbENvbnRleHQgPSBUdW5uZWxJdGVtLmNyZWF0ZUZyb21UdW5uZWwocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLCB0dW5uZWxTZXJ2aWNlLCB0dW5uZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0dW5uZWxDb250ZXh0KSB7XG5cdFx0XHRcdGNvbnN0IHR1bm5lbEl0ZW06IElUdW5uZWxJdGVtID0gdHVubmVsQ29udGV4dDtcblx0XHRcdFx0cmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldEVkaXRhYmxlKHR1bm5lbEl0ZW0sIFR1bm5lbEVkaXRJZC5Mb2NhbFBvcnQsIHtcblx0XHRcdFx0XHRvbkZpbmlzaDogYXN5bmMgKHZhbHVlLCBzdWNjZXNzKSA9PiB7XG5cdFx0XHRcdFx0XHRyZW1vdGVFeHBsb3JlclNlcnZpY2Uuc2V0RWRpdGFibGUodHVubmVsSXRlbSwgVHVubmVsRWRpdElkLkxvY2FsUG9ydCwgbnVsbCk7XG5cdFx0XHRcdFx0XHRpZiAoc3VjY2Vzcykge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCByZW1vdGVFeHBsb3JlclNlcnZpY2UuY2xvc2UoeyBob3N0OiB0dW5uZWxJdGVtLnJlbW90ZUhvc3QsIHBvcnQ6IHR1bm5lbEl0ZW0ucmVtb3RlUG9ydCB9LCBUdW5uZWxDbG9zZVJlYXNvbi5PdGhlcik7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG51bWJlclZhbHVlID0gTnVtYmVyKHZhbHVlKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3Rm9yd2FyZCA9IGF3YWl0IHJlbW90ZUV4cGxvcmVyU2VydmljZS5mb3J3YXJkKHtcblx0XHRcdFx0XHRcdFx0XHRyZW1vdGU6IHsgaG9zdDogdHVubmVsSXRlbS5yZW1vdGVIb3N0LCBwb3J0OiB0dW5uZWxJdGVtLnJlbW90ZVBvcnQgfSxcblx0XHRcdFx0XHRcdFx0XHRsb2NhbDogbnVtYmVyVmFsdWUsXG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogdHVubmVsSXRlbS5uYW1lLFxuXHRcdFx0XHRcdFx0XHRcdGVsZXZhdGVJZk5lZWRlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRzb3VyY2U6IHR1bm5lbEl0ZW0uc291cmNlXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRpZiAobmV3Rm9yd2FyZCAmJiAodHlwZW9mIG5ld0ZvcndhcmQgIT09ICdzdHJpbmcnKSAmJiBuZXdGb3J3YXJkLnR1bm5lbExvY2FsUG9ydCAhPT0gbnVtYmVyVmFsdWUpIHtcblx0XHRcdFx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdyZW1vdGUudHVubmVsLmNoYW5nZUxvY2FsUG9ydE51bWJlcicsIFwiVGhlIGxvY2FsIHBvcnQgezB9IGlzIG5vdCBhdmFpbGFibGUuIFBvcnQgbnVtYmVyIHsxfSBoYXMgYmVlbiB1c2VkIGluc3RlYWRcIiwgdmFsdWUsIG5ld0ZvcndhcmQudHVubmVsTG9jYWxQb3J0ID8/IG5ld0ZvcndhcmQubG9jYWxBZGRyZXNzKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHZhbGlkYXRpb25NZXNzYWdlOiAodmFsdWUpID0+IHZhbGlkYXRlSW5wdXQodHVubmVsU2VydmljZSwgdmFsdWUsIHR1bm5lbFNlcnZpY2UuY2FuRWxldmF0ZSksXG5cdFx0XHRcdFx0cGxhY2Vob2xkZXI6IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbHNWaWV3LmNoYW5nZVBvcnQnLCBcIk5ldyBsb2NhbCBwb3J0XCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cbn1cblxubmFtZXNwYWNlIENoYW5nZVR1bm5lbFByaXZhY3lBY3Rpb24ge1xuXHRleHBvcnQgZnVuY3Rpb24gaGFuZGxlcihwcml2YWN5SWQ6IHN0cmluZyk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRpZiAoaXNJVHVubmVsSXRlbShhcmcpKSB7XG5cdFx0XHRcdGNvbnN0IHJlbW90ZUV4cGxvcmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlKTtcblx0XHRcdFx0YXdhaXQgcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmNsb3NlKHsgaG9zdDogYXJnLnJlbW90ZUhvc3QsIHBvcnQ6IGFyZy5yZW1vdGVQb3J0IH0sIFR1bm5lbENsb3NlUmVhc29uLk90aGVyKTtcblx0XHRcdFx0cmV0dXJuIHJlbW90ZUV4cGxvcmVyU2VydmljZS5mb3J3YXJkKHtcblx0XHRcdFx0XHRyZW1vdGU6IHsgaG9zdDogYXJnLnJlbW90ZUhvc3QsIHBvcnQ6IGFyZy5yZW1vdGVQb3J0IH0sXG5cdFx0XHRcdFx0bG9jYWw6IGFyZy5sb2NhbFBvcnQsXG5cdFx0XHRcdFx0bmFtZTogYXJnLm5hbWUsXG5cdFx0XHRcdFx0ZWxldmF0ZUlmTmVlZGVkOiB0cnVlLFxuXHRcdFx0XHRcdHByaXZhY3k6IHByaXZhY3lJZCxcblx0XHRcdFx0XHRzb3VyY2U6IGFyZy5zb3VyY2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0fVxufVxuXG5uYW1lc3BhY2UgU2V0VHVubmVsUHJvdG9jb2xBY3Rpb24ge1xuXHRleHBvcnQgY29uc3QgSURfSFRUUCA9ICdyZW1vdGUudHVubmVsLnNldFByb3RvY29sSHR0cCc7XG5cdGV4cG9ydCBjb25zdCBJRF9IVFRQUyA9ICdyZW1vdGUudHVubmVsLnNldFByb3RvY29sSHR0cHMnO1xuXHRleHBvcnQgY29uc3QgTEFCRUxfSFRUUCA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5wcm90b2NvbEh0dHAnLCBcIkhUVFBcIik7XG5cdGV4cG9ydCBjb25zdCBMQUJFTF9IVFRQUyA9IG5scy5sb2NhbGl6ZSgncmVtb3RlLnR1bm5lbC5wcm90b2NvbEh0dHBzJywgXCJIVFRQU1wiKTtcblxuXHRhc3luYyBmdW5jdGlvbiBoYW5kbGVyKGFyZzogYW55LCBwcm90b2NvbDogVHVubmVsUHJvdG9jb2wsIHJlbW90ZUV4cGxvcmVyU2VydmljZTogSVJlbW90ZUV4cGxvcmVyU2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlKSB7XG5cdFx0aWYgKGlzSVR1bm5lbEl0ZW0oYXJnKSkge1xuXHRcdFx0Y29uc3QgYXR0cmlidXRlczogUGFydGlhbDxBdHRyaWJ1dGVzPiA9IHtcblx0XHRcdFx0cHJvdG9jb2xcblx0XHRcdH07XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ID8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSA6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDtcblx0XHRcdHJldHVybiByZW1vdGVFeHBsb3JlclNlcnZpY2UudHVubmVsTW9kZWwuY29uZmlnUG9ydHNBdHRyaWJ1dGVzLmFkZEF0dHJpYnV0ZXMoYXJnLnJlbW90ZVBvcnQsIGF0dHJpYnV0ZXMsIHRhcmdldCk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZXJIdHRwKCk6IElDb21tYW5kSGFuZGxlciB7XG5cdFx0cmV0dXJuIGFzeW5jIChhY2Nlc3NvciwgYXJnKSA9PiB7XG5cdFx0XHRyZXR1cm4gaGFuZGxlcihhcmcsIFR1bm5lbFByb3RvY29sLkh0dHAsIGFjY2Vzc29yLmdldChJUmVtb3RlRXhwbG9yZXJTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UpKTtcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGhhbmRsZXJIdHRwcygpOiBJQ29tbWFuZEhhbmRsZXIge1xuXHRcdHJldHVybiBhc3luYyAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0cmV0dXJuIGhhbmRsZXIoYXJnLCBUdW5uZWxQcm90b2NvbC5IdHRwcywgYWNjZXNzb3IuZ2V0KElSZW1vdGVFeHBsb3JlclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSkpO1xuXHRcdH07XG5cdH1cbn1cblxuY29uc3QgdHVubmVsVmlld0NvbW1hbmRzV2VpZ2h0Qm9udXMgPSAxMDsgLy8gZ2l2ZSBvdXIgY29tbWFuZHMgYSBsaXR0bGUgYml0IG1vcmUgd2VpZ2h0IG92ZXIgb3RoZXIgZGVmYXVsdCBsaXN0L3RyZWUgY29tbWFuZHNcblxuY29uc3QgaXNGb3J3YXJkZWRFeHByID0gVHVubmVsVHlwZUNvbnRleHRLZXkuaXNFcXVhbFRvKFR1bm5lbFR5cGUuRm9yd2FyZGVkKTtcbmNvbnN0IGlzRm9yd2FyZGVkT3JEZXRlY3RlZEV4cHIgPSBDb250ZXh0S2V5RXhwci5vcihpc0ZvcndhcmRlZEV4cHIsIFR1bm5lbFR5cGVDb250ZXh0S2V5LmlzRXF1YWxUbyhUdW5uZWxUeXBlLkRldGVjdGVkKSk7XG5jb25zdCBpc05vdE11bHRpU2VsZWN0aW9uRXhwciA9IFR1bm5lbFZpZXdNdWx0aVNlbGVjdGlvbkNvbnRleHRLZXkuaXNFcXVhbFRvKHVuZGVmaW5lZCk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogTGFiZWxUdW5uZWxBY3Rpb24uSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgdHVubmVsVmlld0NvbW1hbmRzV2VpZ2h0Qm9udXMsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUdW5uZWxWaWV3Rm9jdXNDb250ZXh0S2V5LCBpc0ZvcndhcmRlZEV4cHIsIGlzTm90TXVsdGlTZWxlY3Rpb25FeHByKSxcblx0cHJpbWFyeTogS2V5Q29kZS5GMixcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlclxuXHR9LFxuXHRoYW5kbGVyOiBMYWJlbFR1bm5lbEFjdGlvbi5oYW5kbGVyKClcbn0pO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoRm9yd2FyZFBvcnRBY3Rpb24uSU5MSU5FX0lELCBGb3J3YXJkUG9ydEFjdGlvbi5pbmxpbmVIYW5kbGVyKCkpO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoRm9yd2FyZFBvcnRBY3Rpb24uQ09NTUFORFBBTEVUVEVfSUQsIEZvcndhcmRQb3J0QWN0aW9uLmNvbW1hbmRQYWxldHRlSGFuZGxlcigpKTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogQ2xvc2VQb3J0QWN0aW9uLklOTElORV9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyB0dW5uZWxWaWV3Q29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFR1bm5lbENsb3NlYWJsZUNvbnRleHRLZXksIFR1bm5lbFZpZXdGb2N1c0NvbnRleHRLZXkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZSxcblx0XHRzZWNvbmRhcnk6IFtLZXlDb2RlLkRlbGV0ZV1cblx0fSxcblx0aGFuZGxlcjogQ2xvc2VQb3J0QWN0aW9uLmlubGluZUhhbmRsZXIoKVxufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKENsb3NlUG9ydEFjdGlvbi5DT01NQU5EUEFMRVRURV9JRCwgQ2xvc2VQb3J0QWN0aW9uLmNvbW1hbmRQYWxldHRlSGFuZGxlcigpKTtcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLklELCBPcGVuUG9ydEluQnJvd3NlckFjdGlvbi5oYW5kbGVyKCkpO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoT3BlblBvcnRJblByZXZpZXdBY3Rpb24uSUQsIE9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uLmhhbmRsZXIoKSk7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChPcGVuUG9ydEluQnJvd3NlckNvbW1hbmRQYWxldHRlQWN0aW9uLklELCBPcGVuUG9ydEluQnJvd3NlckNvbW1hbmRQYWxldHRlQWN0aW9uLmhhbmRsZXIoKSk7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IENvcHlBZGRyZXNzQWN0aW9uLklOTElORV9JRCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyB0dW5uZWxWaWV3Q29tbWFuZHNXZWlnaHRCb251cyxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFR1bm5lbFZpZXdGb2N1c0NvbnRleHRLZXksIGlzRm9yd2FyZGVkT3JEZXRlY3RlZEV4cHIsIGlzTm90TXVsdGlTZWxlY3Rpb25FeHByKSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUMsXG5cdGhhbmRsZXI6IENvcHlBZGRyZXNzQWN0aW9uLmlubGluZUhhbmRsZXIoKVxufSk7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChDb3B5QWRkcmVzc0FjdGlvbi5DT01NQU5EUEFMRVRURV9JRCwgQ29weUFkZHJlc3NBY3Rpb24uY29tbWFuZFBhbGV0dGVIYW5kbGVyKCkpO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQ2hhbmdlTG9jYWxQb3J0QWN0aW9uLklELCBDaGFuZ2VMb2NhbFBvcnRBY3Rpb24uaGFuZGxlcigpKTtcbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFNldFR1bm5lbFByb3RvY29sQWN0aW9uLklEX0hUVFAsIFNldFR1bm5lbFByb3RvY29sQWN0aW9uLmhhbmRsZXJIdHRwKCkpO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoU2V0VHVubmVsUHJvdG9jb2xBY3Rpb24uSURfSFRUUFMsIFNldFR1bm5lbFByb3RvY29sQWN0aW9uLmhhbmRsZXJIdHRwcygpKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgKHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDbG9zZVBvcnRBY3Rpb24uQ09NTUFORFBBTEVUVEVfSUQsXG5cdFx0dGl0bGU6IENsb3NlUG9ydEFjdGlvbi5MQUJFTFxuXHR9LFxuXHR3aGVuOiBmb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCAoe1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEZvcndhcmRQb3J0QWN0aW9uLkNPTU1BTkRQQUxFVFRFX0lELFxuXHRcdHRpdGxlOiBGb3J3YXJkUG9ydEFjdGlvbi5MQUJFTFxuXHR9LFxuXHR3aGVuOiBmb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCAoe1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENvcHlBZGRyZXNzQWN0aW9uLkNPTU1BTkRQQUxFVFRFX0lELFxuXHRcdHRpdGxlOiBDb3B5QWRkcmVzc0FjdGlvbi5DT01NQU5EUEFMRVRURV9MQUJFTFxuXHR9LFxuXHR3aGVuOiBmb3J3YXJkZWRQb3J0c1ZpZXdFbmFibGVkXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCAoe1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE9wZW5Qb3J0SW5Ccm93c2VyQ29tbWFuZFBhbGV0dGVBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IE9wZW5Qb3J0SW5Ccm93c2VyQ29tbWFuZFBhbGV0dGVBY3Rpb24uTEFCRUxcblx0fSxcblx0d2hlbjogZm9yd2FyZGVkUG9ydHNWaWV3RW5hYmxlZFxufSkpO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbENvbnRleHQsICh7XG5cdGdyb3VwOiAnLl9vcGVuJyxcblx0b3JkZXI6IDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT3BlblBvcnRJbkJyb3dzZXJBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLkxBQkVMLFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaXNGb3J3YXJkZWRPckRldGVjdGVkRXhwciwgaXNOb3RNdWx0aVNlbGVjdGlvbkV4cHIpXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbENvbnRleHQsICh7XG5cdGdyb3VwOiAnLl9vcGVuJyxcblx0b3JkZXI6IDEsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogT3BlblBvcnRJblByZXZpZXdBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IE9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uLkxBQkVMLFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0aXNGb3J3YXJkZWRPckRldGVjdGVkRXhwcixcblx0XHRpc05vdE11bHRpU2VsZWN0aW9uRXhwcilcbn0pKTtcbi8vIFRoZSBncm91cCAwX21hbmFnZSBpcyB1c2VkIGJ5IGV4dGVuc2lvbnMsIHNvIHRyeSBub3QgdG8gY2hhbmdlIGl0XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbENvbnRleHQsICh7XG5cdGdyb3VwOiAnMF9tYW5hZ2UnLFxuXHRvcmRlcjogMSxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBMYWJlbFR1bm5lbEFjdGlvbi5JRCxcblx0XHR0aXRsZTogTGFiZWxUdW5uZWxBY3Rpb24uTEFCRUwsXG5cdFx0aWNvbjogbGFiZWxQb3J0SWNvblxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaXNGb3J3YXJkZWRFeHByLCBpc05vdE11bHRpU2VsZWN0aW9uRXhwcilcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsQ29udGV4dCwgKHtcblx0Z3JvdXA6ICcyX2xvY2FsYWRkcmVzcycsXG5cdG9yZGVyOiAwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IENvcHlBZGRyZXNzQWN0aW9uLklOTElORV9JRCxcblx0XHR0aXRsZTogQ29weUFkZHJlc3NBY3Rpb24uSU5MSU5FX0xBQkVMLFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoaXNGb3J3YXJkZWRPckRldGVjdGVkRXhwciwgaXNOb3RNdWx0aVNlbGVjdGlvbkV4cHIpXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbENvbnRleHQsICh7XG5cdGdyb3VwOiAnMl9sb2NhbGFkZHJlc3MnLFxuXHRvcmRlcjogMSxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDaGFuZ2VMb2NhbFBvcnRBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IENoYW5nZUxvY2FsUG9ydEFjdGlvbi5MQUJFTCxcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGlzRm9yd2FyZGVkRXhwciwgUG9ydENoYW5nYWJsZUNvbnRleHRLZXksIGlzTm90TXVsdGlTZWxlY3Rpb25FeHByKVxufSkpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxDb250ZXh0LCAoe1xuXHRncm91cDogJzJfbG9jYWxhZGRyZXNzJyxcblx0b3JkZXI6IDIsXG5cdHN1Ym1lbnU6IE1lbnVJZC5UdW5uZWxQcml2YWN5LFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCd0dW5uZWxDb250ZXh0LnByaXZhY3lNZW51JywgXCJQb3J0IFZpc2liaWxpdHlcIiksXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChpc0ZvcndhcmRlZEV4cHIsIFR1bm5lbFByaXZhY3lFbmFibGVkQ29udGV4dEtleSlcbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsQ29udGV4dCwgKHtcblx0Z3JvdXA6ICcyX2xvY2FsYWRkcmVzcycsXG5cdG9yZGVyOiAzLFxuXHRzdWJtZW51OiBNZW51SWQuVHVubmVsUHJvdG9jb2wsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ3R1bm5lbENvbnRleHQucHJvdG9jb2xNZW51JywgXCJDaGFuZ2UgUG9ydCBQcm90b2NvbFwiKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGlzRm9yd2FyZGVkRXhwciwgaXNOb3RNdWx0aVNlbGVjdGlvbkV4cHIsIFByb3RvY29sQ2hhbmdlYWJsZUNvbnRleHRLZXkpXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbENvbnRleHQsICh7XG5cdGdyb3VwOiAnM19mb3J3YXJkJyxcblx0b3JkZXI6IDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ2xvc2VQb3J0QWN0aW9uLklOTElORV9JRCxcblx0XHR0aXRsZTogQ2xvc2VQb3J0QWN0aW9uLkxBQkVMLFxuXHR9LFxuXHR3aGVuOiBUdW5uZWxDbG9zZWFibGVDb250ZXh0S2V5XG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbENvbnRleHQsICh7XG5cdGdyb3VwOiAnM19mb3J3YXJkJyxcblx0b3JkZXI6IDEsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRm9yd2FyZFBvcnRBY3Rpb24uSU5MSU5FX0lELFxuXHRcdHRpdGxlOiBGb3J3YXJkUG9ydEFjdGlvbi5MQUJFTCxcblx0fSxcbn0pKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxQcm90b2NvbCwgKHtcblx0b3JkZXI6IDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU2V0VHVubmVsUHJvdG9jb2xBY3Rpb24uSURfSFRUUCxcblx0XHR0aXRsZTogU2V0VHVubmVsUHJvdG9jb2xBY3Rpb24uTEFCRUxfSFRUUCxcblx0XHR0b2dnbGVkOiBUdW5uZWxQcm90b2NvbENvbnRleHRLZXkuaXNFcXVhbFRvKFR1bm5lbFByb3RvY29sLkh0dHApXG5cdH1cbn0pKTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuVHVubmVsUHJvdG9jb2wsICh7XG5cdG9yZGVyOiAxLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNldFR1bm5lbFByb3RvY29sQWN0aW9uLklEX0hUVFBTLFxuXHRcdHRpdGxlOiBTZXRUdW5uZWxQcm90b2NvbEFjdGlvbi5MQUJFTF9IVFRQUyxcblx0XHR0b2dnbGVkOiBUdW5uZWxQcm90b2NvbENvbnRleHRLZXkuaXNFcXVhbFRvKFR1bm5lbFByb3RvY29sLkh0dHBzKVxuXHR9XG59KSk7XG5cblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxQb3J0SW5saW5lLCAoe1xuXHRncm91cDogJzBfbWFuYWdlJyxcblx0b3JkZXI6IDAsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRm9yd2FyZFBvcnRBY3Rpb24uSU5MSU5FX0lELFxuXHRcdHRpdGxlOiBGb3J3YXJkUG9ydEFjdGlvbi5UUkVFSVRFTV9MQUJFTCxcblx0XHRpY29uOiBmb3J3YXJkUG9ydEljb25cblx0fSxcblx0d2hlbjogVHVubmVsVHlwZUNvbnRleHRLZXkuaXNFcXVhbFRvKFR1bm5lbFR5cGUuQ2FuZGlkYXRlKVxufSkpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxQb3J0SW5saW5lLCAoe1xuXHRncm91cDogJzBfbWFuYWdlJyxcblx0b3JkZXI6IDQsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogTGFiZWxUdW5uZWxBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IExhYmVsVHVubmVsQWN0aW9uLkxBQkVMLFxuXHRcdGljb246IGxhYmVsUG9ydEljb25cblx0fSxcblx0d2hlbjogaXNGb3J3YXJkZWRFeHByXG59KSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlR1bm5lbFBvcnRJbmxpbmUsICh7XG5cdGdyb3VwOiAnMF9tYW5hZ2UnLFxuXHRvcmRlcjogNSxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDbG9zZVBvcnRBY3Rpb24uSU5MSU5FX0lELFxuXHRcdHRpdGxlOiBDbG9zZVBvcnRBY3Rpb24uTEFCRUwsXG5cdFx0aWNvbjogc3RvcEZvcndhcmRJY29uXG5cdH0sXG5cdHdoZW46IFR1bm5lbENsb3NlYWJsZUNvbnRleHRLZXlcbn0pKTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxMb2NhbEFkZHJlc3NJbmxpbmUsICh7XG5cdG9yZGVyOiAtMSxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDb3B5QWRkcmVzc0FjdGlvbi5JTkxJTkVfSUQsXG5cdFx0dGl0bGU6IENvcHlBZGRyZXNzQWN0aW9uLklOTElORV9MQUJFTCxcblx0XHRpY29uOiBjb3B5QWRkcmVzc0ljb25cblx0fSxcblx0d2hlbjogaXNGb3J3YXJkZWRPckRldGVjdGVkRXhwclxufSkpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxMb2NhbEFkZHJlc3NJbmxpbmUsICh7XG5cdG9yZGVyOiAwLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uLklELFxuXHRcdHRpdGxlOiBPcGVuUG9ydEluQnJvd3NlckFjdGlvbi5MQUJFTCxcblx0XHRpY29uOiBvcGVuQnJvd3Nlckljb25cblx0fSxcblx0d2hlbjogaXNGb3J3YXJkZWRPckRldGVjdGVkRXhwclxufSkpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5UdW5uZWxMb2NhbEFkZHJlc3NJbmxpbmUsICh7XG5cdG9yZGVyOiAxLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uLklELFxuXHRcdHRpdGxlOiBPcGVuUG9ydEluUHJldmlld0FjdGlvbi5MQUJFTCxcblx0XHRpY29uOiBvcGVuUHJldmlld0ljb25cblx0fSxcblx0d2hlbjogaXNGb3J3YXJkZWRPckRldGVjdGVkRXhwclxufSkpO1xuXG5yZWdpc3RlckNvbG9yKCdwb3J0cy5pY29uUnVubmluZ1Byb2Nlc3NGb3JlZ3JvdW5kJywgU1RBVFVTX0JBUl9SRU1PVEVfSVRFTV9CQUNLR1JPVU5ELCBubHMubG9jYWxpemUoJ3BvcnRXaXRoUnVubmluZ1Byb2Nlc3MuZm9yZWdyb3VuZCcsIFwiVGhlIGNvbG9yIG9mIHRoZSBpY29uIGZvciBhIHBvcnQgdGhhdCBoYXMgYW4gYXNzb2NpYXRlZCBydW5uaW5nIHByb2Nlc3MuXCIpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixZQUFZLFNBQVM7QUFDckIsU0FBeUMsOEJBQThCO0FBQ3ZFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLG9CQUFpQyxlQUFlLHNCQUFzQjtBQUMvRSxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FB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YUFBYSxlQUFlLE9BQU8sMEJBQTJCO0FBQUEsRUFDN0QsT0FBTztBQUFBLEVBQ1AsU0FBUztBQUFBLElBQ1IsSUFBSSx3QkFBd0I7QUFBQSxJQUM1QixPQUFPLHdCQUF3QjtBQUFBLElBQy9CLE1BQU07QUFBQSxFQUNQO0FBQUEsRUFDQSxNQUFNO0FBQ1AsQ0FBRTtBQUNGLGFBQWEsZUFBZSxPQUFPLDBCQUEyQjtBQUFBLEVBQzdELE9BQU87QUFBQSxFQUNQLFNBQVM7QUFBQSxJQUNSLElBQUksd0JBQXdCO0FBQUEsSUFDNUIsT0FBTyx3QkFBd0I7QUFBQSxJQUMvQixNQUFNO0FBQUEsRUFDUDtBQUFBLEVBQ0EsTUFBTTtBQUNQLENBQUU7QUFFRixjQUFjLHNDQUFzQyxtQ0FBbUMsSUFBSSxTQUFTLHFDQUFxQywwRUFBMEUsQ0FBQzsiLAogICJuYW1lcyI6IFsidmFsdWUiLCAiTGFiZWxUdW5uZWxBY3Rpb24iLCAiRm9yd2FyZFBvcnRBY3Rpb24iLCAiQ2xvc2VQb3J0QWN0aW9uIiwgIk9wZW5Qb3J0SW5Ccm93c2VyQWN0aW9uIiwgIk9wZW5Qb3J0SW5QcmV2aWV3QWN0aW9uIiwgIk9wZW5Qb3J0SW5Ccm93c2VyQ29tbWFuZFBhbGV0dGVBY3Rpb24iLCAiQ29weUFkZHJlc3NBY3Rpb24iLCAiQ2hhbmdlTG9jYWxQb3J0QWN0aW9uIiwgInR1bm5lbFNlcnZpY2UiLCAiQ2hhbmdlVHVubmVsUHJpdmFjeUFjdGlvbiIsICJTZXRUdW5uZWxQcm90b2NvbEFjdGlvbiJdCn0K
