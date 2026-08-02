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
import "./media/processExplorer.css";
import { localize } from "../../../../nls.js";
import { $, append, getDocument } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { isRemoteDiagnosticError } from "../../../../platform/diagnostics/common/diagnostics.js";
import { ByteSize } from "../../../../platform/files/common/files.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { WorkbenchDataTree } from "../../../../platform/list/browser/listService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Separator, toAction } from "../../../../base/common/actions.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { RenderIndentGuides } from "../../../../base/browser/ui/tree/abstractTree.js";
import { Delayer } from "../../../../base/common/async.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Schemas } from "../../../../base/common/network.js";
import { isWeb } from "../../../../base/common/platform.js";
const DEBUG_FLAGS_PATTERN = /\s--inspect(?:-brk|port)?=(?<port>\d+)?/;
const DEBUG_PORT_PATTERN = /\s--inspect-port=(?<port>\d+)/;
function isMachineProcessInformation(item) {
  const candidate = item;
  return !!candidate?.name && !!candidate?.rootProcess;
}
function isProcessInformation(item) {
  const candidate = item;
  return !!candidate?.processRoots;
}
function isProcessItem(item) {
  const candidate = item;
  return typeof candidate?.pid === "number";
}
class ProcessListDelegate {
  getHeight() {
    return 22;
  }
  getTemplateId(element) {
    if (isProcessItem(element)) {
      return "process";
    }
    if (isMachineProcessInformation(element)) {
      return "machine";
    }
    if (isRemoteDiagnosticError(element)) {
      return "error";
    }
    if (isProcessInformation(element)) {
      return "header";
    }
    return "";
  }
}
class ProcessTreeDataSource {
  hasChildren(element) {
    if (isRemoteDiagnosticError(element)) {
      return false;
    }
    if (isProcessItem(element)) {
      return !!element.children?.length;
    }
    return true;
  }
  getChildren(element) {
    if (isProcessItem(element)) {
      return element.children ?? [];
    }
    if (isRemoteDiagnosticError(element)) {
      return [];
    }
    if (isProcessInformation(element)) {
      if (element.processRoots.length > 1) {
        return element.processRoots;
      }
      if (element.processRoots.length > 0) {
        return [element.processRoots[0].rootProcess];
      }
      return [];
    }
    if (isMachineProcessInformation(element)) {
      return [element.rootProcess];
    }
    return element.processes ? [element.processes] : [];
  }
}
function createRow(container, extraClass) {
  const row = append(container, $(".row"));
  if (extraClass) {
    row.classList.add(extraClass);
  }
  const name = append(row, $(".cell.name"));
  const cpu = append(row, $(".cell.cpu"));
  const memory = append(row, $(".cell.memory"));
  const pid = append(row, $(".cell.pid"));
  return { name, cpu, memory, pid };
}
class ProcessHeaderTreeRenderer {
  constructor() {
    this.templateId = "header";
  }
  renderTemplate(container) {
    container.previousElementSibling?.classList.add("force-no-twistie");
    return createRow(container, "header");
  }
  renderElement(node, index, templateData) {
    templateData.name.textContent = localize("processName", "Process Name");
    templateData.cpu.textContent = localize("processCpu", "CPU (%)");
    templateData.pid.textContent = localize("processPid", "PID");
    templateData.memory.textContent = localize("processMemory", "Memory (MB)");
  }
  disposeTemplate(templateData) {
  }
}
class MachineRenderer {
  constructor() {
    this.templateId = "machine";
  }
  renderTemplate(container) {
    return createRow(container);
  }
  renderElement(node, index, templateData) {
    templateData.name.textContent = node.element.name;
  }
  disposeTemplate(templateData) {
  }
}
class ErrorRenderer {
  constructor() {
    this.templateId = "error";
  }
  renderTemplate(container) {
    return createRow(container);
  }
  renderElement(node, index, templateData) {
    templateData.name.textContent = node.element.errorMessage;
  }
  disposeTemplate(templateData) {
  }
}
let ProcessItemHover = class extends Disposable {
  constructor(container, hoverService) {
    super();
    this.content = "";
    this.hover = this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), container, this.content));
  }
  update(content) {
    if (this.content !== content) {
      this.content = content;
      this.hover.update(content);
    }
  }
};
ProcessItemHover = __decorateClass([
  __decorateParam(1, IHoverService)
], ProcessItemHover);
let ProcessRenderer = class {
  constructor(model, hoverService) {
    this.model = model;
    this.hoverService = hoverService;
    this.templateId = "process";
  }
  renderTemplate(container) {
    const row = createRow(container);
    return {
      name: row.name,
      cpu: row.cpu,
      memory: row.memory,
      pid: row.pid,
      hover: new ProcessItemHover(row.name, this.hoverService)
    };
  }
  renderElement(node, index, templateData) {
    const { element } = node;
    const pid = element.pid.toFixed(0);
    templateData.name.textContent = this.model.getName(element.pid, element.name);
    templateData.cpu.textContent = element.load.toFixed(0);
    templateData.memory.textContent = (element.mem / ByteSize.MB).toFixed(0);
    templateData.pid.textContent = pid;
    templateData.pid.parentElement.id = `pid-${pid}`;
    templateData.hover?.update(element.cmd);
  }
  disposeTemplate(templateData) {
    templateData.hover?.dispose();
  }
};
ProcessRenderer = __decorateClass([
  __decorateParam(1, IHoverService)
], ProcessRenderer);
class ProcessAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("processExplorer", "Process Explorer");
  }
  getAriaLabel(element) {
    if (isProcessItem(element) || isMachineProcessInformation(element)) {
      return element.name;
    }
    if (isRemoteDiagnosticError(element)) {
      return element.hostName;
    }
    return null;
  }
}
class ProcessIdentityProvider {
  getId(element) {
    if (isProcessItem(element)) {
      return element.pid.toString();
    }
    if (isRemoteDiagnosticError(element)) {
      return element.hostName;
    }
    if (isProcessInformation(element)) {
      return "processes";
    }
    if (isMachineProcessInformation(element)) {
      return element.name;
    }
    return "header";
  }
}
let ProcessExplorerControl = class extends Disposable {
  constructor(instantiationService, productService, contextMenuService, commandService, clipboardService) {
    super();
    this.instantiationService = instantiationService;
    this.productService = productService;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
    this.clipboardService = clipboardService;
    this.dimensions = void 0;
    this.delayer = this._register(new Delayer(1e3));
    this.model = new ProcessExplorerModel(this.productService);
  }
  create(container) {
    this.createProcessTree(container);
    this.update();
  }
  createProcessTree(container) {
    container.classList.add("process-explorer");
    container.id = "process-explorer";
    const renderers = [
      this.instantiationService.createInstance(ProcessRenderer, this.model),
      new ProcessHeaderTreeRenderer(),
      new MachineRenderer(),
      new ErrorRenderer()
    ];
    this.tree = this._register(this.instantiationService.createInstance(
      WorkbenchDataTree,
      "processExplorer",
      container,
      new ProcessListDelegate(),
      renderers,
      new ProcessTreeDataSource(),
      {
        accessibilityProvider: new ProcessAccessibilityProvider(),
        identityProvider: new ProcessIdentityProvider(),
        expandOnlyOnTwistieClick: true,
        renderIndentGuides: RenderIndentGuides.OnHover
      }
    ));
    this._register(this.tree.onKeyDown((e) => this.onTreeKeyDown(e)));
    this._register(this.tree.onContextMenu((e) => this.onTreeContextMenu(container, e)));
    this.tree.setInput(this.model);
    this.layoutTree();
  }
  async onTreeKeyDown(e) {
    const event = new StandardKeyboardEvent(e);
    if (event.keyCode === KeyCode.KeyE && event.altKey) {
      const selectionPids = this.getSelectedPids();
      await Promise.all(selectionPids.map((pid) => this.killProcess?.(pid, "SIGTERM")));
    }
  }
  onTreeContextMenu(container, e) {
    if (!isProcessItem(e.element)) {
      return;
    }
    const item = e.element;
    const pid = Number(item.pid);
    const actions = [];
    if (typeof this.killProcess === "function") {
      actions.push(toAction({ id: "killProcess", label: localize("killProcess", "Kill Process"), run: () => this.killProcess?.(pid, "SIGTERM") }));
      actions.push(toAction({ id: "forceKillProcess", label: localize("forceKillProcess", "Force Kill Process"), run: () => this.killProcess?.(pid, "SIGKILL") }));
      actions.push(new Separator());
    }
    actions.push(toAction({
      id: "copy",
      label: localize("copy", "Copy"),
      run: () => {
        const selectionPids = this.getSelectedPids();
        if (!selectionPids?.includes(pid)) {
          selectionPids.length = 0;
          selectionPids.push(pid);
        }
        const rows = selectionPids?.map((e2) => getDocument(container).getElementById(`pid-${e2}`)).filter((e2) => !!e2);
        if (rows) {
          const text = rows.map((e2) => e2.innerText).filter((e2) => !!e2);
          this.clipboardService.writeText(text.join("\n"));
        }
      }
    }));
    actions.push(toAction({
      id: "copyAll",
      label: localize("copyAll", "Copy All"),
      run: () => {
        const processList = getDocument(container).getElementById("process-explorer");
        if (processList) {
          this.clipboardService.writeText(processList.innerText);
        }
      }
    }));
    if (this.isDebuggable(item.cmd)) {
      actions.push(new Separator());
      actions.push(toAction({ id: "debug", label: localize("debug", "Debug"), run: () => this.attachTo(item) }));
    }
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => actions
    });
  }
  isDebuggable(cmd) {
    if (isWeb) {
      return false;
    }
    const matches = DEBUG_FLAGS_PATTERN.exec(cmd);
    return matches && matches.groups.port !== "0" || cmd.indexOf("node ") >= 0 || cmd.indexOf("node.exe") >= 0;
  }
  attachTo(item) {
    const config = {
      type: "node",
      request: "attach",
      name: `process ${item.pid}`
    };
    let matches = DEBUG_FLAGS_PATTERN.exec(item.cmd);
    if (matches) {
      config.port = Number(matches.groups.port);
    } else {
      config.processId = String(item.pid);
    }
    matches = DEBUG_PORT_PATTERN.exec(item.cmd);
    if (matches) {
      config.port = Number(matches.groups.port);
    }
    this.commandService.executeCommand("debug.startFromConfig", config);
  }
  getSelectedPids() {
    return coalesce(this.tree?.getSelection()?.map((e) => {
      if (!isProcessItem(e)) {
        return void 0;
      }
      return e.pid;
    }) ?? []);
  }
  async update() {
    const { processes, pidToNames } = await this.resolveProcesses();
    this.model.update(processes, pidToNames);
    this.tree?.updateChildren();
    this.layoutTree();
    this.delayer.trigger(() => this.update());
  }
  focus() {
    this.tree?.domFocus();
  }
  layout(dimension) {
    this.dimensions = dimension;
    this.layoutTree();
  }
  layoutTree() {
    if (this.dimensions && this.tree) {
      this.tree.layout(this.dimensions.height, this.dimensions.width);
    }
  }
};
ProcessExplorerControl = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IProductService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IClipboardService)
], ProcessExplorerControl);
let ProcessExplorerModel = class {
  constructor(productService) {
    this.productService = productService;
    this.processes = { processRoots: [] };
    this.mapPidToName = /* @__PURE__ */ new Map();
  }
  update(processRoots, pidToNames) {
    this.mapPidToName.clear();
    for (const [pid, name] of pidToNames) {
      this.mapPidToName.set(pid, name);
    }
    processRoots.forEach((info, index) => {
      if (isProcessItem(info.rootProcess)) {
        info.rootProcess.name = index === 0 ? this.productService.applicationName : "remote-server";
      }
    });
    this.processes = { processRoots };
  }
  getName(pid, fallback) {
    return this.mapPidToName.get(pid) ?? fallback;
  }
};
ProcessExplorerModel = __decorateClass([
  __decorateParam(0, IProductService)
], ProcessExplorerModel);
let BrowserProcessExplorerControl = class extends ProcessExplorerControl {
  constructor(container, instantiationService, productService, contextMenuService, commandService, clipboardService, remoteAgentService, labelService) {
    super(instantiationService, productService, contextMenuService, commandService, clipboardService);
    this.remoteAgentService = remoteAgentService;
    this.labelService = labelService;
    this.create(container);
  }
  async resolveProcesses() {
    const connection = this.remoteAgentService.getConnection();
    if (!connection) {
      return { pidToNames: [], processes: [] };
    }
    const processes = [];
    const hostName = this.labelService.getHostLabel(Schemas.vscodeRemote, connection.remoteAuthority);
    const result = await this.remoteAgentService.getDiagnosticInfo({ includeProcesses: true });
    if (result) {
      if (isRemoteDiagnosticError(result)) {
        processes.push({ name: result.hostName, rootProcess: result });
      } else if (result.processes) {
        processes.push({ name: hostName, rootProcess: result.processes });
      }
    }
    return { pidToNames: [], processes };
  }
};
BrowserProcessExplorerControl = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IClipboardService),
  __decorateParam(6, IRemoteAgentService),
  __decorateParam(7, ILabelService)
], BrowserProcessExplorerControl);
export {
  BrowserProcessExplorerControl,
  ProcessExplorerControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Byb2Nlc3NFeHBsb3Jlci9icm93c2VyL3Byb2Nlc3NFeHBsb3JlckNvbnRyb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvcHJvY2Vzc0V4cGxvcmVyLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyAkLCBhcHBlbmQsIERpbWVuc2lvbiwgZ2V0RG9jdW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElJZGVudGl0eVByb3ZpZGVyLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSURhdGFTb3VyY2UsIElUcmVlUmVuZGVyZXIsIElUcmVlTm9kZSwgSVRyZWVDb250ZXh0TWVudUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBQcm9jZXNzSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yLCBpc1JlbW90ZURpYWdub3N0aWNFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWdub3N0aWNzL2NvbW1vbi9kaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBCeXRlU2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgUmVuZGVySW5kZW50R3VpZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTWFuYWdlZEhvdmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFByb2Nlc3NJbmZvcm1hdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2Nlc3MvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmNvbnN0IERFQlVHX0ZMQUdTX1BBVFRFUk4gPSAvXFxzLS1pbnNwZWN0KD86LWJya3xwb3J0KT89KD88cG9ydD5cXGQrKT8vO1xuY29uc3QgREVCVUdfUE9SVF9QQVRURVJOID0gL1xccy0taW5zcGVjdC1wb3J0PSg/PHBvcnQ+XFxkKykvO1xuXG4vLyNyZWdpb24gLS0tIHByb2Nlc3MgZXhwbG9yZXIgdHJlZVxuXG5pbnRlcmZhY2UgSVByb2Nlc3NUcmVlIHtcblx0cmVhZG9ubHkgcHJvY2Vzc2VzOiBJUHJvY2Vzc0luZm9ybWF0aW9uO1xufVxuXG5pbnRlcmZhY2UgSVByb2Nlc3NJbmZvcm1hdGlvbiB7XG5cdHJlYWRvbmx5IHByb2Nlc3NSb290czogSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb25bXTtcbn1cblxuaW50ZXJmYWNlIElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSByb290UHJvY2VzczogUHJvY2Vzc0l0ZW0gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yO1xufVxuXG5mdW5jdGlvbiBpc01hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBpdGVtIGFzIElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiAhIWNhbmRpZGF0ZT8ubmFtZSAmJiAhIWNhbmRpZGF0ZT8ucm9vdFByb2Nlc3M7XG59XG5cbmZ1bmN0aW9uIGlzUHJvY2Vzc0luZm9ybWF0aW9uKGl0ZW06IHVua25vd24pOiBpdGVtIGlzIElQcm9jZXNzSW5mb3JtYXRpb24ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBpdGVtIGFzIElQcm9jZXNzSW5mb3JtYXRpb24gfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuICEhY2FuZGlkYXRlPy5wcm9jZXNzUm9vdHM7XG59XG5cbmZ1bmN0aW9uIGlzUHJvY2Vzc0l0ZW0oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgUHJvY2Vzc0l0ZW0ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBpdGVtIGFzIFByb2Nlc3NJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiB0eXBlb2YgY2FuZGlkYXRlPy5waWQgPT09ICdudW1iZXInO1xufVxuXG5jbGFzcyBQcm9jZXNzTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24gfCBQcm9jZXNzSXRlbSB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3I+IHtcblxuXHRnZXRIZWlnaHQoKSB7XG5cdFx0cmV0dXJuIDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJUHJvY2Vzc0luZm9ybWF0aW9uIHwgSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24gfCBQcm9jZXNzSXRlbSB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3IpIHtcblx0XHRpZiAoaXNQcm9jZXNzSXRlbShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuICdwcm9jZXNzJztcblx0XHR9XG5cblx0XHRpZiAoaXNNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gJ21hY2hpbmUnO1xuXHRcdH1cblxuXHRcdGlmIChpc1JlbW90ZURpYWdub3N0aWNFcnJvcihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuICdlcnJvcic7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUHJvY2Vzc0luZm9ybWF0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gJ2hlYWRlcic7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICcnO1xuXHR9XG59XG5cbmNsYXNzIFByb2Nlc3NUcmVlRGF0YVNvdXJjZSBpbXBsZW1lbnRzIElEYXRhU291cmNlPElQcm9jZXNzVHJlZSwgSVByb2Nlc3NJbmZvcm1hdGlvbiB8IElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uIHwgUHJvY2Vzc0l0ZW0gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yPiB7XG5cblx0aGFzQ2hpbGRyZW4oZWxlbWVudDogSVByb2Nlc3NUcmVlIHwgSVByb2Nlc3NJbmZvcm1hdGlvbiB8IElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uIHwgUHJvY2Vzc0l0ZW0gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKGlzUmVtb3RlRGlhZ25vc3RpY0Vycm9yKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGlzUHJvY2Vzc0l0ZW0oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiAhIWVsZW1lbnQuY2hpbGRyZW4/Lmxlbmd0aDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGdldENoaWxkcmVuKGVsZW1lbnQ6IElQcm9jZXNzVHJlZSB8IElQcm9jZXNzSW5mb3JtYXRpb24gfCBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcikge1xuXHRcdGlmIChpc1Byb2Nlc3NJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5jaGlsZHJlbiA/PyBbXTtcblx0XHR9XG5cblx0XHRpZiAoaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRpZiAoaXNQcm9jZXNzSW5mb3JtYXRpb24oZWxlbWVudCkpIHtcblx0XHRcdGlmIChlbGVtZW50LnByb2Nlc3NSb290cy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50LnByb2Nlc3NSb290czsgLy8gSWYgdGhlcmUgYXJlIG11bHRpcGxlIHByb2Nlc3Mgcm9vdHMsIHJldHVybiB0aGVzZSwgb3RoZXJ3aXNlIGdvIGRpcmVjdGx5IHRvIHRoZSByb290IHByb2Nlc3Ncblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQucHJvY2Vzc1Jvb3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmV0dXJuIFtlbGVtZW50LnByb2Nlc3NSb290c1swXS5yb290UHJvY2Vzc107XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRpZiAoaXNNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gW2VsZW1lbnQucm9vdFByb2Nlc3NdO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50LnByb2Nlc3NlcyA/IFtlbGVtZW50LnByb2Nlc3Nlc10gOiBbXTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVSb3coY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZXh0cmFDbGFzcz86IHN0cmluZykge1xuXHRjb25zdCByb3cgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcucm93JykpO1xuXHRpZiAoZXh0cmFDbGFzcykge1xuXHRcdHJvdy5jbGFzc0xpc3QuYWRkKGV4dHJhQ2xhc3MpO1xuXHR9XG5cblx0Y29uc3QgbmFtZSA9IGFwcGVuZChyb3csICQoJy5jZWxsLm5hbWUnKSk7XG5cdGNvbnN0IGNwdSA9IGFwcGVuZChyb3csICQoJy5jZWxsLmNwdScpKTtcblx0Y29uc3QgbWVtb3J5ID0gYXBwZW5kKHJvdywgJCgnLmNlbGwubWVtb3J5JykpO1xuXHRjb25zdCBwaWQgPSBhcHBlbmQocm93LCAkKCcuY2VsbC5waWQnKSk7XG5cblx0cmV0dXJuIHsgbmFtZSwgY3B1LCBtZW1vcnksIHBpZCB9O1xufVxuXG5pbnRlcmZhY2UgSVByb2Nlc3NSb3dUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBuYW1lOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElQcm9jZXNzSXRlbVRlbXBsYXRlRGF0YSBleHRlbmRzIElQcm9jZXNzUm93VGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY3B1OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbWVtb3J5OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgcGlkOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaG92ZXI/OiBQcm9jZXNzSXRlbUhvdmVyO1xufVxuXG5jbGFzcyBQcm9jZXNzSGVhZGVyVHJlZVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJUHJvY2Vzc0luZm9ybWF0aW9uLCB2b2lkLCBJUHJvY2Vzc0l0ZW1UZW1wbGF0ZURhdGE+IHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnaGVhZGVyJztcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVByb2Nlc3NJdGVtVGVtcGxhdGVEYXRhIHtcblx0XHRjb250YWluZXIucHJldmlvdXNFbGVtZW50U2libGluZz8uY2xhc3NMaXN0LmFkZCgnZm9yY2Utbm8tdHdpc3RpZScpOyAvLyBoYWNrLCBidXQgbm8gQVBJIGZvciBoaWRpbmcgdHdpc3RpZSBvbiB0cmVlXG5cblx0XHRyZXR1cm4gY3JlYXRlUm93KGNvbnRhaW5lciwgJ2hlYWRlcicpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVByb2Nlc3NJbmZvcm1hdGlvbiwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb2Nlc3NJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncHJvY2Vzc05hbWUnLCBcIlByb2Nlc3MgTmFtZVwiKTtcblx0XHR0ZW1wbGF0ZURhdGEuY3B1LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Byb2Nlc3NDcHUnLCBcIkNQVSAoJSlcIik7XG5cdFx0dGVtcGxhdGVEYXRhLnBpZC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdwcm9jZXNzUGlkJywgXCJQSURcIik7XG5cdFx0dGVtcGxhdGVEYXRhLm1lbW9yeS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdwcm9jZXNzTWVtb3J5JywgXCJNZW1vcnkgKE1CKVwiKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IHVua25vd24pOiB2b2lkIHtcblx0XHQvLyBOb3RoaW5nIHRvIGRvXG5cdH1cbn1cblxuY2xhc3MgTWFjaGluZVJlbmRlcmVyIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiwgdm9pZCwgSVByb2Nlc3NSb3dUZW1wbGF0ZURhdGE+IHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnbWFjaGluZSc7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElQcm9jZXNzUm93VGVtcGxhdGVEYXRhIHtcblx0XHRyZXR1cm4gY3JlYXRlUm93KGNvbnRhaW5lcik7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb2Nlc3NSb3dUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubmFtZS50ZXh0Q29udGVudCA9IG5vZGUuZWxlbWVudC5uYW1lO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVByb2Nlc3NSb3dUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyBOb3RoaW5nIHRvIGRvXG5cdH1cbn1cblxuY2xhc3MgRXJyb3JSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SVJlbW90ZURpYWdub3N0aWNFcnJvciwgdm9pZCwgSVByb2Nlc3NSb3dUZW1wbGF0ZURhdGE+IHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAnZXJyb3InO1xuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJUHJvY2Vzc1Jvd1RlbXBsYXRlRGF0YSB7XG5cdFx0cmV0dXJuIGNyZWF0ZVJvdyhjb250YWluZXIpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SVJlbW90ZURpYWdub3N0aWNFcnJvciwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVByb2Nlc3NSb3dUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubmFtZS50ZXh0Q29udGVudCA9IG5vZGUuZWxlbWVudC5lcnJvck1lc3NhZ2U7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUHJvY2Vzc1Jvd1RlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIE5vdGhpbmcgdG8gZG9cblx0fVxufVxuXG5jbGFzcyBQcm9jZXNzSXRlbUhvdmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBob3ZlcjogSU1hbmFnZWRIb3Zlcjtcblx0cHJpdmF0ZSBjb250ZW50ID0gJyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaG92ZXIgPSB0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIGNvbnRhaW5lciwgdGhpcy5jb250ZW50KSk7XG5cdH1cblxuXHR1cGRhdGUoY29udGVudDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGVudCAhPT0gY29udGVudCkge1xuXHRcdFx0dGhpcy5jb250ZW50ID0gY29udGVudDtcblx0XHRcdHRoaXMuaG92ZXIudXBkYXRlKGNvbnRlbnQpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBQcm9jZXNzUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFByb2Nlc3NJdGVtLCB2b2lkLCBJUHJvY2Vzc0l0ZW1UZW1wbGF0ZURhdGE+IHtcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSAncHJvY2Vzcyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBtb2RlbDogUHJvY2Vzc0V4cGxvcmVyTW9kZWwsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVByb2Nlc3NJdGVtVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCByb3cgPSBjcmVhdGVSb3coY29udGFpbmVyKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiByb3cubmFtZSxcblx0XHRcdGNwdTogcm93LmNwdSxcblx0XHRcdG1lbW9yeTogcm93Lm1lbW9yeSxcblx0XHRcdHBpZDogcm93LnBpZCxcblx0XHRcdGhvdmVyOiBuZXcgUHJvY2Vzc0l0ZW1Ib3Zlcihyb3cubmFtZSwgdGhpcy5ob3ZlclNlcnZpY2UpXG5cdFx0fTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFByb2Nlc3NJdGVtLCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvY2Vzc0l0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCB7IGVsZW1lbnQgfSA9IG5vZGU7XG5cblx0XHRjb25zdCBwaWQgPSBlbGVtZW50LnBpZC50b0ZpeGVkKDApO1xuXG5cdFx0dGVtcGxhdGVEYXRhLm5hbWUudGV4dENvbnRlbnQgPSB0aGlzLm1vZGVsLmdldE5hbWUoZWxlbWVudC5waWQsIGVsZW1lbnQubmFtZSk7XG5cdFx0dGVtcGxhdGVEYXRhLmNwdS50ZXh0Q29udGVudCA9IGVsZW1lbnQubG9hZC50b0ZpeGVkKDApO1xuXHRcdHRlbXBsYXRlRGF0YS5tZW1vcnkudGV4dENvbnRlbnQgPSAoZWxlbWVudC5tZW0gLyBCeXRlU2l6ZS5NQikudG9GaXhlZCgwKTtcblx0XHR0ZW1wbGF0ZURhdGEucGlkLnRleHRDb250ZW50ID0gcGlkO1xuXHRcdHRlbXBsYXRlRGF0YS5waWQucGFyZW50RWxlbWVudCEuaWQgPSBgcGlkLSR7cGlkfWA7XG5cblx0XHR0ZW1wbGF0ZURhdGEuaG92ZXI/LnVwZGF0ZShlbGVtZW50LmNtZCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJUHJvY2Vzc0l0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuaG92ZXI/LmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBQcm9jZXNzQWNjZXNzaWJpbGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24gfCBQcm9jZXNzSXRlbSB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3I+IHtcblxuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb2Nlc3NFeHBsb3JlcicsIFwiUHJvY2VzcyBFeHBsb3JlclwiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvcik6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChpc1Byb2Nlc3NJdGVtKGVsZW1lbnQpIHx8IGlzTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQubmFtZTtcblx0XHR9XG5cblx0XHRpZiAoaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50Lmhvc3ROYW1lO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmNsYXNzIFByb2Nlc3NJZGVudGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUlkZW50aXR5UHJvdmlkZXI8SU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24gfCBQcm9jZXNzSXRlbSB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3I+IHtcblxuXHRnZXRJZChlbGVtZW50OiBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yIHwgUHJvY2Vzc0l0ZW0gfCBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbik6IHsgdG9TdHJpbmcoKTogc3RyaW5nIH0ge1xuXHRcdGlmIChpc1Byb2Nlc3NJdGVtKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudC5waWQudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRpZiAoaXNSZW1vdGVEaWFnbm9zdGljRXJyb3IoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50Lmhvc3ROYW1lO1xuXHRcdH1cblxuXHRcdGlmIChpc1Byb2Nlc3NJbmZvcm1hdGlvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuICdwcm9jZXNzZXMnO1xuXHRcdH1cblxuXHRcdGlmIChpc01hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBlbGVtZW50Lm5hbWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICdoZWFkZXInO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgUHJvY2Vzc0V4cGxvcmVyQ29udHJvbCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgZGltZW5zaW9uczogRGltZW5zaW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IFByb2Nlc3NFeHBsb3Jlck1vZGVsO1xuXHRwcml2YXRlIHRyZWU6IFdvcmtiZW5jaERhdGFUcmVlPElQcm9jZXNzVHJlZSwgSVByb2Nlc3NUcmVlIHwgSU1hY2hpbmVQcm9jZXNzSW5mb3JtYXRpb24gfCBQcm9jZXNzSXRlbSB8IElQcm9jZXNzSW5mb3JtYXRpb24gfCBJUmVtb3RlRGlhZ25vc3RpY0Vycm9yPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcigxMDAwKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMubW9kZWwgPSBuZXcgUHJvY2Vzc0V4cGxvcmVyTW9kZWwodGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQga2lsbFByb2Nlc3M/KHBpZDogbnVtYmVyLCBzaWduYWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZXNvbHZlUHJvY2Vzc2VzKCk6IFByb21pc2U8SVJlc29sdmVkUHJvY2Vzc0luZm9ybWF0aW9uPjtcblxuXHRwcm90ZWN0ZWQgY3JlYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmNyZWF0ZVByb2Nlc3NUcmVlKGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQcm9jZXNzVHJlZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Byb2Nlc3MtZXhwbG9yZXInKTtcblx0XHRjb250YWluZXIuaWQgPSAncHJvY2Vzcy1leHBsb3Jlcic7XG5cblx0XHRjb25zdCByZW5kZXJlcnMgPSBbXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb2Nlc3NSZW5kZXJlciwgdGhpcy5tb2RlbCksXG5cdFx0XHRuZXcgUHJvY2Vzc0hlYWRlclRyZWVSZW5kZXJlcigpLFxuXHRcdFx0bmV3IE1hY2hpbmVSZW5kZXJlcigpLFxuXHRcdFx0bmV3IEVycm9yUmVuZGVyZXIoKVxuXHRcdF07XG5cblx0XHR0aGlzLnRyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoRGF0YVRyZWU8SVByb2Nlc3NUcmVlLCBJUHJvY2Vzc1RyZWUgfCBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVByb2Nlc3NJbmZvcm1hdGlvbiB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3I+LFxuXHRcdFx0J3Byb2Nlc3NFeHBsb3JlcicsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRuZXcgUHJvY2Vzc0xpc3REZWxlZ2F0ZSgpLFxuXHRcdFx0cmVuZGVyZXJzLFxuXHRcdFx0bmV3IFByb2Nlc3NUcmVlRGF0YVNvdXJjZSgpLFxuXHRcdFx0e1xuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBQcm9jZXNzQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IG5ldyBQcm9jZXNzSWRlbnRpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRcdHJlbmRlckluZGVudEd1aWRlczogUmVuZGVySW5kZW50R3VpZGVzLk9uSG92ZXJcblx0XHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbktleURvd24oZSA9PiB0aGlzLm9uVHJlZUtleURvd24oZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Db250ZXh0TWVudShlID0+IHRoaXMub25UcmVlQ29udGV4dE1lbnUoY29udGFpbmVyLCBlKSkpO1xuXG5cdFx0dGhpcy50cmVlLnNldElucHV0KHRoaXMubW9kZWwpO1xuXHRcdHRoaXMubGF5b3V0VHJlZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblRyZWVLZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0aWYgKGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuS2V5RSAmJiBldmVudC5hbHRLZXkpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvblBpZHMgPSB0aGlzLmdldFNlbGVjdGVkUGlkcygpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2VsZWN0aW9uUGlkcy5tYXAocGlkID0+IHRoaXMua2lsbFByb2Nlc3M/LihwaWQsICdTSUdURVJNJykpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVHJlZUNvbnRleHRNZW51KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGU6IElUcmVlQ29udGV4dE1lbnVFdmVudDxJUHJvY2Vzc1RyZWUgfCBJTWFjaGluZVByb2Nlc3NJbmZvcm1hdGlvbiB8IFByb2Nlc3NJdGVtIHwgSVByb2Nlc3NJbmZvcm1hdGlvbiB8IElSZW1vdGVEaWFnbm9zdGljRXJyb3IgfCBudWxsPik6IHZvaWQge1xuXHRcdGlmICghaXNQcm9jZXNzSXRlbShlLmVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbSA9IGUuZWxlbWVudDtcblx0XHRjb25zdCBwaWQgPSBOdW1iZXIoaXRlbS5waWQpO1xuXG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRpZiAodHlwZW9mIHRoaXMua2lsbFByb2Nlc3MgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7IGlkOiAna2lsbFByb2Nlc3MnLCBsYWJlbDogbG9jYWxpemUoJ2tpbGxQcm9jZXNzJywgXCJLaWxsIFByb2Nlc3NcIiksIHJ1bjogKCkgPT4gdGhpcy5raWxsUHJvY2Vzcz8uKHBpZCwgJ1NJR1RFUk0nKSB9KSk7XG5cdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oeyBpZDogJ2ZvcmNlS2lsbFByb2Nlc3MnLCBsYWJlbDogbG9jYWxpemUoJ2ZvcmNlS2lsbFByb2Nlc3MnLCBcIkZvcmNlIEtpbGwgUHJvY2Vzc1wiKSwgcnVuOiAoKSA9PiB0aGlzLmtpbGxQcm9jZXNzPy4ocGlkLCAnU0lHS0lMTCcpIH0pKTtcblxuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0fVxuXG5cdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnY29weScsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvcHknLCBcIkNvcHlcIiksXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uUGlkcyA9IHRoaXMuZ2V0U2VsZWN0ZWRQaWRzKCk7XG5cblx0XHRcdFx0aWYgKCFzZWxlY3Rpb25QaWRzPy5pbmNsdWRlcyhwaWQpKSB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uUGlkcy5sZW5ndGggPSAwOyAvLyBJZiB0aGUgc2VsZWN0aW9uIGRvZXMgbm90IGNvbnRhaW4gdGhlIHJpZ2h0IGNsaWNrZWQgaXRlbSwgY29weSB0aGUgcmlnaHQgY2xpY2tlZCBpdGVtIG9ubHkuXG5cdFx0XHRcdFx0c2VsZWN0aW9uUGlkcy5wdXNoKHBpZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3Qgcm93cyA9IHNlbGVjdGlvblBpZHM/Lm1hcChlID0+IGdldERvY3VtZW50KGNvbnRhaW5lcikuZ2V0RWxlbWVudEJ5SWQoYHBpZC0ke2V9YCkpLmZpbHRlcihlID0+ICEhZSk7XG5cdFx0XHRcdGlmIChyb3dzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dCA9IHJvd3MubWFwKGUgPT4gZS5pbm5lclRleHQpLmZpbHRlcihlID0+ICEhZSk7XG5cdFx0XHRcdFx0dGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dCh0ZXh0LmpvaW4oJ1xcbicpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRpZDogJ2NvcHlBbGwnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb3B5QWxsJywgXCJDb3B5IEFsbFwiKSxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3QgcHJvY2Vzc0xpc3QgPSBnZXREb2N1bWVudChjb250YWluZXIpLmdldEVsZW1lbnRCeUlkKCdwcm9jZXNzLWV4cGxvcmVyJyk7XG5cdFx0XHRcdGlmIChwcm9jZXNzTGlzdCkge1xuXHRcdFx0XHRcdHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQocHJvY2Vzc0xpc3QuaW5uZXJUZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICh0aGlzLmlzRGVidWdnYWJsZShpdGVtLmNtZCkpIHtcblx0XHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHsgaWQ6ICdkZWJ1ZycsIGxhYmVsOiBsb2NhbGl6ZSgnZGVidWcnLCBcIkRlYnVnXCIpLCBydW46ICgpID0+IHRoaXMuYXR0YWNoVG8oaXRlbSkgfSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9uc1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0RlYnVnZ2FibGUoY21kOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBtYXRjaGVzID0gREVCVUdfRkxBR1NfUEFUVEVSTi5leGVjKGNtZCk7XG5cblx0XHRyZXR1cm4gKG1hdGNoZXMgJiYgbWF0Y2hlcy5ncm91cHMhLnBvcnQgIT09ICcwJykgfHwgY21kLmluZGV4T2YoJ25vZGUgJykgPj0gMCB8fCBjbWQuaW5kZXhPZignbm9kZS5leGUnKSA+PSAwO1xuXHR9XG5cblx0cHJpdmF0ZSBhdHRhY2hUbyhpdGVtOiBQcm9jZXNzSXRlbSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZzogeyB0eXBlOiBzdHJpbmc7IHJlcXVlc3Q6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBwb3J0PzogbnVtYmVyOyBwcm9jZXNzSWQ/OiBzdHJpbmcgfSA9IHtcblx0XHRcdHR5cGU6ICdub2RlJyxcblx0XHRcdHJlcXVlc3Q6ICdhdHRhY2gnLFxuXHRcdFx0bmFtZTogYHByb2Nlc3MgJHtpdGVtLnBpZH1gXG5cdFx0fTtcblxuXHRcdGxldCBtYXRjaGVzID0gREVCVUdfRkxBR1NfUEFUVEVSTi5leGVjKGl0ZW0uY21kKTtcblx0XHRpZiAobWF0Y2hlcykge1xuXHRcdFx0Y29uZmlnLnBvcnQgPSBOdW1iZXIobWF0Y2hlcy5ncm91cHMhLnBvcnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25maWcucHJvY2Vzc0lkID0gU3RyaW5nKGl0ZW0ucGlkKTsgLy8gbm8gcG9ydCAtPiB0cnkgdG8gYXR0YWNoIHZpYSBwaWQgKHNlbmQgU0lHVVNSMSlcblx0XHR9XG5cblx0XHQvLyBhIGRlYnVnLXBvcnQ9biBvciBpbnNwZWN0LXBvcnQ9biBvdmVycmlkZXMgdGhlIHBvcnRcblx0XHRtYXRjaGVzID0gREVCVUdfUE9SVF9QQVRURVJOLmV4ZWMoaXRlbS5jbWQpO1xuXHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRjb25maWcucG9ydCA9IE51bWJlcihtYXRjaGVzLmdyb3VwcyEucG9ydCk7IC8vIG92ZXJyaWRlIHBvcnRcblx0XHR9XG5cblx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdkZWJ1Zy5zdGFydEZyb21Db25maWcnLCBjb25maWcpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3RlZFBpZHMoKTogbnVtYmVyW10ge1xuXHRcdHJldHVybiBjb2FsZXNjZSh0aGlzLnRyZWU/LmdldFNlbGVjdGlvbigpPy5tYXAoZSA9PiB7XG5cdFx0XHRpZiAoIWlzUHJvY2Vzc0l0ZW0oZSkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGUucGlkO1xuXHRcdH0pID8/IFtdKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgcHJvY2Vzc2VzLCBwaWRUb05hbWVzIH0gPSBhd2FpdCB0aGlzLnJlc29sdmVQcm9jZXNzZXMoKTtcblxuXHRcdHRoaXMubW9kZWwudXBkYXRlKHByb2Nlc3NlcywgcGlkVG9OYW1lcyk7XG5cblx0XHR0aGlzLnRyZWU/LnVwZGF0ZUNoaWxkcmVuKCk7XG5cdFx0dGhpcy5sYXlvdXRUcmVlKCk7XG5cblx0XHR0aGlzLmRlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnVwZGF0ZSgpKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZT8uZG9tRm9jdXMoKTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuZGltZW5zaW9ucyA9IGRpbWVuc2lvbjtcblxuXHRcdHRoaXMubGF5b3V0VHJlZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRUcmVlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRpbWVuc2lvbnMgJiYgdGhpcy50cmVlKSB7XG5cdFx0XHR0aGlzLnRyZWUubGF5b3V0KHRoaXMuZGltZW5zaW9ucy5oZWlnaHQsIHRoaXMuZGltZW5zaW9ucy53aWR0aCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFByb2Nlc3NFeHBsb3Jlck1vZGVsIGltcGxlbWVudHMgSVByb2Nlc3NUcmVlIHtcblxuXHRwcm9jZXNzZXM6IElQcm9jZXNzSW5mb3JtYXRpb24gPSB7IHByb2Nlc3NSb290czogW10gfTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG1hcFBpZFRvTmFtZSA9IG5ldyBNYXA8bnVtYmVyLCBzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoQElQcm9kdWN0U2VydmljZSBwcml2YXRlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UpIHsgfVxuXG5cdHVwZGF0ZShwcm9jZXNzUm9vdHM6IElNYWNoaW5lUHJvY2Vzc0luZm9ybWF0aW9uW10sIHBpZFRvTmFtZXM6IFtudW1iZXIsIHN0cmluZ11bXSk6IHZvaWQge1xuXG5cdFx0Ly8gUElEIHRvIE5hbWVzXG5cdFx0dGhpcy5tYXBQaWRUb05hbWUuY2xlYXIoKTtcblxuXHRcdGZvciAoY29uc3QgW3BpZCwgbmFtZV0gb2YgcGlkVG9OYW1lcykge1xuXHRcdFx0dGhpcy5tYXBQaWRUb05hbWUuc2V0KHBpZCwgbmFtZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUHJvY2Vzc2VzXG5cdFx0cHJvY2Vzc1Jvb3RzLmZvckVhY2goKGluZm8sIGluZGV4KSA9PiB7XG5cdFx0XHRpZiAoaXNQcm9jZXNzSXRlbShpbmZvLnJvb3RQcm9jZXNzKSkge1xuXHRcdFx0XHRpbmZvLnJvb3RQcm9jZXNzLm5hbWUgPSBpbmRleCA9PT0gMCA/IHRoaXMucHJvZHVjdFNlcnZpY2UuYXBwbGljYXRpb25OYW1lIDogJ3JlbW90ZS1zZXJ2ZXInO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5wcm9jZXNzZXMgPSB7IHByb2Nlc3NSb290cyB9O1xuXHR9XG5cblx0Z2V0TmFtZShwaWQ6IG51bWJlciwgZmFsbGJhY2s6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubWFwUGlkVG9OYW1lLmdldChwaWQpID8/IGZhbGxiYWNrO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyUHJvY2Vzc0V4cGxvcmVyQ29udHJvbCBleHRlbmRzIFByb2Nlc3NFeHBsb3JlckNvbnRyb2wge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihpbnN0YW50aWF0aW9uU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29tbWFuZFNlcnZpY2UsIGNsaXBib2FyZFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jcmVhdGUoY29udGFpbmVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyByZXNvbHZlUHJvY2Vzc2VzKCk6IFByb21pc2U8SVJlc29sdmVkUHJvY2Vzc0luZm9ybWF0aW9uPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMucmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybiB7IHBpZFRvTmFtZXM6IFtdLCBwcm9jZXNzZXM6IFtdIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvY2Vzc2VzOiB7IG5hbWU6IHN0cmluZzsgcm9vdFByb2Nlc3M6IFByb2Nlc3NJdGVtIHwgSVJlbW90ZURpYWdub3N0aWNFcnJvciB9W10gPSBbXTtcblxuXHRcdGNvbnN0IGhvc3ROYW1lID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsKFNjaGVtYXMudnNjb2RlUmVtb3RlLCBjb25uZWN0aW9uLnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RGlhZ25vc3RpY0luZm8oeyBpbmNsdWRlUHJvY2Vzc2VzOiB0cnVlIH0pO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdGlmIChpc1JlbW90ZURpYWdub3N0aWNFcnJvcihyZXN1bHQpKSB7XG5cdFx0XHRcdHByb2Nlc3Nlcy5wdXNoKHsgbmFtZTogcmVzdWx0Lmhvc3ROYW1lLCByb290UHJvY2VzczogcmVzdWx0IH0pO1xuXHRcdFx0fSBlbHNlIGlmIChyZXN1bHQucHJvY2Vzc2VzKSB7XG5cdFx0XHRcdHByb2Nlc3Nlcy5wdXNoKHsgbmFtZTogaG9zdE5hbWUsIHJvb3RQcm9jZXNzOiByZXN1bHQucHJvY2Vzc2VzIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHBpZFRvTmFtZXM6IFtdLCBwcm9jZXNzZXMgfTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxHQUFHLFFBQW1CLG1CQUFtQjtBQUNsRCxTQUFTLDZCQUE2QjtBQUl0QyxTQUFpQywrQkFBK0I7QUFDaEUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQWtCLFdBQVcsZ0JBQWdCO0FBQzdDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxhQUFhO0FBRXRCLE1BQU0sc0JBQXNCO0FBQzVCLE1BQU0scUJBQXFCO0FBaUIzQixTQUFTLDRCQUE0QixNQUFtRDtBQUN2RixRQUFNLFlBQVk7QUFFbEIsU0FBTyxDQUFDLENBQUMsV0FBVyxR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
