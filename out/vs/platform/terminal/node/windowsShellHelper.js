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
import { timeout } from "../../../base/common/async.js";
import { debounce } from "../../../base/common/decorators.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isWindows, platform } from "../../../base/common/platform.js";
import { GeneralShellType, WindowsShellType } from "../common/terminal.js";
const SHELL_EXECUTABLES = [
  "cmd.exe",
  "powershell.exe",
  "pwsh.exe",
  "bash.exe",
  "git-cmd.exe",
  "wsl.exe",
  "ubuntu.exe",
  "ubuntu1804.exe",
  "kali.exe",
  "debian.exe",
  "opensuse-42.exe",
  "sles-12.exe",
  "julia.exe",
  "nu.exe",
  "node.exe",
  "xonsh.exe"
];
const SHELL_EXECUTABLE_REGEXES = [
  /^python(\d(\.\d{0,2})?)?\.exe$/
];
const NODE_AGENT_CLI_PATTERNS = [
  { regex: /[\\/]claude-code[\\/]/i, executable: "claude.exe" },
  { regex: /[\\/]codex[\\/]/i, executable: "codex.exe" },
  { regex: /[\\/]command-code[\\/]/i, executable: "commandcode.exe" },
  { regex: /[\\/]copilot[\\/]/i, executable: "copilot.exe" },
  { regex: /[\\/]gemini-cli[\\/]/i, executable: "gemini.exe" }
];
let windowsProcessTree;
class WindowsShellHelper extends Disposable {
  constructor(_rootProcessId) {
    super();
    this._rootProcessId = _rootProcessId;
    this._shellTitle = "";
    this._onShellNameChanged = this._register(new Emitter());
    this._onShellTypeChanged = this._register(new Emitter());
    if (!isWindows) {
      throw new Error(`WindowsShellHelper cannot be instantiated on ${platform}`);
    }
    this._startMonitoringShell();
  }
  get shellType() {
    return this._shellType;
  }
  get shellTitle() {
    return this._shellTitle;
  }
  get onShellNameChanged() {
    return this._onShellNameChanged.event;
  }
  get onShellTypeChanged() {
    return this._onShellTypeChanged.event;
  }
  async _startMonitoringShell() {
    if (this._store.isDisposed) {
      return;
    }
    this.checkShell();
  }
  async checkShell() {
    if (isWindows) {
      await timeout(300);
      this.getShellName().then((title) => {
        const type = this.getShellType(title);
        if (type !== this._shellType) {
          this._onShellTypeChanged.fire(type);
          this._onShellNameChanged.fire(title);
          this._shellType = type;
          this._shellTitle = title;
        }
      });
    }
  }
  traverseTree(tree) {
    if (!tree) {
      return "";
    }
    if (tree.name === "node.exe" && tree.commandLine) {
      for (const { regex, executable } of NODE_AGENT_CLI_PATTERNS) {
        if (regex.test(tree.commandLine)) {
          return executable;
        }
      }
    }
    if (SHELL_EXECUTABLES.indexOf(tree.name) === -1) {
      return tree.name;
    }
    for (const regex of SHELL_EXECUTABLE_REGEXES) {
      if (tree.name.match(regex)) {
        return tree.name;
      }
    }
    if (!tree.children || tree.children.length === 0) {
      return tree.name;
    }
    let favouriteChild = 0;
    for (; favouriteChild < tree.children.length; favouriteChild++) {
      const child = tree.children[favouriteChild];
      if (!child.children || child.children.length === 0) {
        break;
      }
      if (child.children[0].name !== "conhost.exe") {
        break;
      }
    }
    if (favouriteChild >= tree.children.length) {
      return tree.name;
    }
    return this.traverseTree(tree.children[favouriteChild]);
  }
  /**
   * Returns the innermost shell executable running in the terminal
   */
  async getShellName() {
    if (this._store.isDisposed) {
      return Promise.resolve("");
    }
    if (this._currentRequest) {
      return this._currentRequest;
    }
    if (!windowsProcessTree) {
      windowsProcessTree = await import("@vscode/windows-process-tree");
    }
    this._currentRequest = new Promise((resolve) => {
      windowsProcessTree.getProcessTree(this._rootProcessId, (tree) => {
        const name = this.traverseTree(tree);
        this._currentRequest = void 0;
        resolve(name);
      }, windowsProcessTree.ProcessDataFlag.CommandLine);
    });
    return this._currentRequest;
  }
  getShellType(executable) {
    switch (executable.toLowerCase()) {
      case "cmd.exe":
        return WindowsShellType.CommandPrompt;
      case "powershell.exe":
      case "pwsh.exe":
        return GeneralShellType.PowerShell;
      case "bash.exe":
      case "git-cmd.exe":
        return WindowsShellType.GitBash;
      case "julia.exe":
        return GeneralShellType.Julia;
      case "node.exe":
        return GeneralShellType.Node;
      case "nu.exe":
        return GeneralShellType.NuShell;
      case "xonsh.exe":
        return GeneralShellType.Xonsh;
      case "claude.exe":
        return GeneralShellType.Claude;
      case "codex.exe":
        return GeneralShellType.Codex;
      case "commandcode.exe":
        return GeneralShellType.CommandCode;
      case "copilot.exe":
        return GeneralShellType.Copilot;
      case "gemini.exe":
        return GeneralShellType.Gemini;
      case "wsl.exe":
      case "ubuntu.exe":
      case "ubuntu1804.exe":
      case "kali.exe":
      case "debian.exe":
      case "opensuse-42.exe":
      case "sles-12.exe":
        return WindowsShellType.Wsl;
      default:
        if (executable.match(/python(\d(\.\d{0,2})?)?\.exe/)) {
          return GeneralShellType.Python;
        }
        return void 0;
    }
  }
}
__decorateClass([
  debounce(500)
], WindowsShellHelper.prototype, "checkShell", 1);
export {
  WindowsShellHelper
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvd2luZG93c1NoZWxsSGVscGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRlYm91bmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2luZG93cywgcGxhdGZvcm0gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBHZW5lcmFsU2hlbGxUeXBlLCBUZXJtaW5hbFNoZWxsVHlwZSwgV2luZG93c1NoZWxsVHlwZSB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIFdpbmRvd3NQcm9jZXNzVHJlZVR5cGUgZnJvbSAnQHZzY29kZS93aW5kb3dzLXByb2Nlc3MtdHJlZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdpbmRvd3NTaGVsbEhlbHBlciBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgb25TaGVsbE5hbWVDaGFuZ2VkOiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvblNoZWxsVHlwZUNoYW5nZWQ6IEV2ZW50PFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkPjtcblx0Z2V0U2hlbGxUeXBlKHRpdGxlOiBzdHJpbmcpOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZDtcblx0Z2V0U2hlbGxOYW1lKCk6IFByb21pc2U8c3RyaW5nPjtcbn1cblxuY29uc3QgU0hFTExfRVhFQ1VUQUJMRVMgPSBbXG5cdCdjbWQuZXhlJyxcblx0J3Bvd2Vyc2hlbGwuZXhlJyxcblx0J3B3c2guZXhlJyxcblx0J2Jhc2guZXhlJyxcblx0J2dpdC1jbWQuZXhlJyxcblx0J3dzbC5leGUnLFxuXHQndWJ1bnR1LmV4ZScsXG5cdCd1YnVudHUxODA0LmV4ZScsXG5cdCdrYWxpLmV4ZScsXG5cdCdkZWJpYW4uZXhlJyxcblx0J29wZW5zdXNlLTQyLmV4ZScsXG5cdCdzbGVzLTEyLmV4ZScsXG5cdCdqdWxpYS5leGUnLFxuXHQnbnUuZXhlJyxcblx0J25vZGUuZXhlJyxcblx0J3hvbnNoLmV4ZScsXG5dO1xuXG5jb25zdCBTSEVMTF9FWEVDVVRBQkxFX1JFR0VYRVMgPSBbXG5cdC9ecHl0aG9uKFxcZChcXC5cXGR7MCwyfSk/KT9cXC5leGUkLyxcbl07XG5cbi8qKlxuICogbnBtLWluc3RhbGxlZCBhZ2VudCBDTElzIGFwcGVhciBpbiB0aGUgcHJvY2VzcyB0cmVlIGFzIHBsYWluIGBub2RlLmV4ZWAsIHNvIHdlIGlkZW50aWZ5XG4gKiB0aGVtIGJ5IG1hdGNoaW5nIHRoZSBwYWNrYWdlIGZvbGRlciBpbiBub2RlJ3MgY29tbWFuZCBsaW5lLlxuICovXG5jb25zdCBOT0RFX0FHRU5UX0NMSV9QQVRURVJOUzogUmVhZG9ubHlBcnJheTx7IHJlZ2V4OiBSZWdFeHA7IGV4ZWN1dGFibGU6IHN0cmluZyB9PiA9IFtcblx0eyByZWdleDogL1tcXFxcL11jbGF1ZGUtY29kZVtcXFxcL10vaSwgZXhlY3V0YWJsZTogJ2NsYXVkZS5leGUnIH0sXG5cdHsgcmVnZXg6IC9bXFxcXC9dY29kZXhbXFxcXC9dL2ksIGV4ZWN1dGFibGU6ICdjb2RleC5leGUnIH0sXG5cdHsgcmVnZXg6IC9bXFxcXC9dY29tbWFuZC1jb2RlW1xcXFwvXS9pLCBleGVjdXRhYmxlOiAnY29tbWFuZGNvZGUuZXhlJyB9LFxuXHR7IHJlZ2V4OiAvW1xcXFwvXWNvcGlsb3RbXFxcXC9dL2ksIGV4ZWN1dGFibGU6ICdjb3BpbG90LmV4ZScgfSxcblx0eyByZWdleDogL1tcXFxcL11nZW1pbmktY2xpW1xcXFwvXS9pLCBleGVjdXRhYmxlOiAnZ2VtaW5pLmV4ZScgfSxcbl07XG5cbmxldCB3aW5kb3dzUHJvY2Vzc1RyZWU6IHR5cGVvZiBXaW5kb3dzUHJvY2Vzc1RyZWVUeXBlO1xuXG5leHBvcnQgY2xhc3MgV2luZG93c1NoZWxsSGVscGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXaW5kb3dzU2hlbGxIZWxwZXIge1xuXHRwcml2YXRlIF9jdXJyZW50UmVxdWVzdDogUHJvbWlzZTxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkO1xuXHRnZXQgc2hlbGxUeXBlKCk6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NoZWxsVHlwZTsgfVxuXHRwcml2YXRlIF9zaGVsbFRpdGxlOiBzdHJpbmcgPSAnJztcblx0Z2V0IHNoZWxsVGl0bGUoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX3NoZWxsVGl0bGU7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25TaGVsbE5hbWVDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0Z2V0IG9uU2hlbGxOYW1lQ2hhbmdlZCgpOiBFdmVudDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuX29uU2hlbGxOYW1lQ2hhbmdlZC5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblNoZWxsVHlwZUNoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZD4oKSk7XG5cdGdldCBvblNoZWxsVHlwZUNoYW5nZWQoKTogRXZlbnQ8VGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX29uU2hlbGxUeXBlQ2hhbmdlZC5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX3Jvb3RQcm9jZXNzSWQ6IG51bWJlclxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgV2luZG93c1NoZWxsSGVscGVyIGNhbm5vdCBiZSBpbnN0YW50aWF0ZWQgb24gJHtwbGF0Zm9ybX1gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGFydE1vbml0b3JpbmdTaGVsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnRNb25pdG9yaW5nU2hlbGwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jaGVja1NoZWxsKCk7XG5cdH1cblxuXHRAZGVib3VuY2UoNTAwKVxuXHRhc3luYyBjaGVja1NoZWxsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdC8vIFdhaXQgdG8gZ2l2ZSB0aGUgc2hlbGwgc29tZSB0aW1lIHRvIGFjdHVhbGx5IGxhdW5jaCBhIHByb2Nlc3MsIHRoaXNcblx0XHRcdC8vIGNvdWxkIGxlYWQgdG8gYSByYWNlIGNvbmRpdGlvbiBidXQgaXQgd291bGQgYmUgcmVjb3ZlcmVkIGZyb20gd2hlblxuXHRcdFx0Ly8gZGF0YSBzdG9wcyBhbmQgc2hvdWxkIGNvdmVyIHRoZSBtYWpvcml0eSBvZiBjYXNlc1xuXHRcdFx0YXdhaXQgdGltZW91dCgzMDApO1xuXHRcdFx0dGhpcy5nZXRTaGVsbE5hbWUoKS50aGVuKHRpdGxlID0+IHtcblx0XHRcdFx0Y29uc3QgdHlwZSA9IHRoaXMuZ2V0U2hlbGxUeXBlKHRpdGxlKTtcblx0XHRcdFx0aWYgKHR5cGUgIT09IHRoaXMuX3NoZWxsVHlwZSkge1xuXHRcdFx0XHRcdHRoaXMuX29uU2hlbGxUeXBlQ2hhbmdlZC5maXJlKHR5cGUpO1xuXHRcdFx0XHRcdHRoaXMuX29uU2hlbGxOYW1lQ2hhbmdlZC5maXJlKHRpdGxlKTtcblx0XHRcdFx0XHR0aGlzLl9zaGVsbFR5cGUgPSB0eXBlO1xuXHRcdFx0XHRcdHRoaXMuX3NoZWxsVGl0bGUgPSB0aXRsZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cmF2ZXJzZVRyZWUodHJlZTogV2luZG93c1Byb2Nlc3NUcmVlVHlwZS5JUHJvY2Vzc1RyZWVOb2RlIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAoIXRyZWUpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0Ly8gRGV0ZWN0IG5wbS1pbnN0YWxsZWQgYWdlbnQgQ0xJcyBydW5uaW5nIGluc2lkZSBgbm9kZS5leGVgIGJ5IGluc3BlY3RpbmcgdGhlIGNvbW1hbmQgbGluZVxuXHRcdC8vIHBhc3NlZCB0byBOb2RlLiBXaXRob3V0IHRoaXMgd2UnZCB0cmVhdCB0aGVtIGFzIGEgZ2VuZXJpYyBOb2RlIHNoZWxsLlxuXHRcdGlmICh0cmVlLm5hbWUgPT09ICdub2RlLmV4ZScgJiYgdHJlZS5jb21tYW5kTGluZSkge1xuXHRcdFx0Zm9yIChjb25zdCB7IHJlZ2V4LCBleGVjdXRhYmxlIH0gb2YgTk9ERV9BR0VOVF9DTElfUEFUVEVSTlMpIHtcblx0XHRcdFx0aWYgKHJlZ2V4LnRlc3QodHJlZS5jb21tYW5kTGluZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXhlY3V0YWJsZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoU0hFTExfRVhFQ1VUQUJMRVMuaW5kZXhPZih0cmVlLm5hbWUpID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHRyZWUubmFtZTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByZWdleCBvZiBTSEVMTF9FWEVDVVRBQkxFX1JFR0VYRVMpIHtcblx0XHRcdGlmICh0cmVlLm5hbWUubWF0Y2gocmVnZXgpKSB7XG5cdFx0XHRcdHJldHVybiB0cmVlLm5hbWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdHJlZS5jaGlsZHJlbiB8fCB0cmVlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRyZWUubmFtZTtcblx0XHR9XG5cdFx0bGV0IGZhdm91cml0ZUNoaWxkID0gMDtcblx0XHRmb3IgKDsgZmF2b3VyaXRlQ2hpbGQgPCB0cmVlLmNoaWxkcmVuLmxlbmd0aDsgZmF2b3VyaXRlQ2hpbGQrKykge1xuXHRcdFx0Y29uc3QgY2hpbGQgPSB0cmVlLmNoaWxkcmVuW2Zhdm91cml0ZUNoaWxkXTtcblx0XHRcdGlmICghY2hpbGQuY2hpbGRyZW4gfHwgY2hpbGQuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoaWxkLmNoaWxkcmVuWzBdLm5hbWUgIT09ICdjb25ob3N0LmV4ZScpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChmYXZvdXJpdGVDaGlsZCA+PSB0cmVlLmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRyZWUubmFtZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudHJhdmVyc2VUcmVlKHRyZWUuY2hpbGRyZW5bZmF2b3VyaXRlQ2hpbGRdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBpbm5lcm1vc3Qgc2hlbGwgZXhlY3V0YWJsZSBydW5uaW5nIGluIHRoZSB0ZXJtaW5hbFxuXHQgKi9cblx0YXN5bmMgZ2V0U2hlbGxOYW1lKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoJycpO1xuXHRcdH1cblx0XHQvLyBQcmV2ZW50IG11bHRpcGxlIHJlcXVlc3RzIGF0IG9uY2UsIGluc3RlYWQgcmV0dXJuIGN1cnJlbnQgcmVxdWVzdFxuXHRcdGlmICh0aGlzLl9jdXJyZW50UmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRSZXF1ZXN0O1xuXHRcdH1cblx0XHRpZiAoIXdpbmRvd3NQcm9jZXNzVHJlZSkge1xuXHRcdFx0d2luZG93c1Byb2Nlc3NUcmVlID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3dpbmRvd3MtcHJvY2Vzcy10cmVlJyk7XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRSZXF1ZXN0ID0gbmV3IFByb21pc2U8c3RyaW5nPihyZXNvbHZlID0+IHtcblx0XHRcdHdpbmRvd3NQcm9jZXNzVHJlZS5nZXRQcm9jZXNzVHJlZSh0aGlzLl9yb290UHJvY2Vzc0lkLCB0cmVlID0+IHtcblx0XHRcdFx0Y29uc3QgbmFtZSA9IHRoaXMudHJhdmVyc2VUcmVlKHRyZWUpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmVzb2x2ZShuYW1lKTtcblx0XHRcdH0sIHdpbmRvd3NQcm9jZXNzVHJlZS5Qcm9jZXNzRGF0YUZsYWcuQ29tbWFuZExpbmUpO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50UmVxdWVzdDtcblx0fVxuXG5cdGdldFNoZWxsVHlwZShleGVjdXRhYmxlOiBzdHJpbmcpOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0c3dpdGNoIChleGVjdXRhYmxlLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdGNhc2UgJ2NtZC5leGUnOlxuXHRcdFx0XHRyZXR1cm4gV2luZG93c1NoZWxsVHlwZS5Db21tYW5kUHJvbXB0O1xuXHRcdFx0Y2FzZSAncG93ZXJzaGVsbC5leGUnOlxuXHRcdFx0Y2FzZSAncHdzaC5leGUnOlxuXHRcdFx0XHRyZXR1cm4gR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsO1xuXHRcdFx0Y2FzZSAnYmFzaC5leGUnOlxuXHRcdFx0Y2FzZSAnZ2l0LWNtZC5leGUnOlxuXHRcdFx0XHRyZXR1cm4gV2luZG93c1NoZWxsVHlwZS5HaXRCYXNoO1xuXHRcdFx0Y2FzZSAnanVsaWEuZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuSnVsaWE7XG5cdFx0XHRjYXNlICdub2RlLmV4ZSc6XG5cdFx0XHRcdHJldHVybiBHZW5lcmFsU2hlbGxUeXBlLk5vZGU7XG5cdFx0XHRjYXNlICdudS5leGUnOlxuXHRcdFx0XHRyZXR1cm4gR2VuZXJhbFNoZWxsVHlwZS5OdVNoZWxsO1xuXHRcdFx0Y2FzZSAneG9uc2guZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuWG9uc2g7XG5cdFx0XHRjYXNlICdjbGF1ZGUuZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuQ2xhdWRlO1xuXHRcdFx0Y2FzZSAnY29kZXguZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuQ29kZXg7XG5cdFx0XHRjYXNlICdjb21tYW5kY29kZS5leGUnOlxuXHRcdFx0XHRyZXR1cm4gR2VuZXJhbFNoZWxsVHlwZS5Db21tYW5kQ29kZTtcblx0XHRcdGNhc2UgJ2NvcGlsb3QuZXhlJzpcblx0XHRcdFx0cmV0dXJuIEdlbmVyYWxTaGVsbFR5cGUuQ29waWxvdDtcblx0XHRcdGNhc2UgJ2dlbWluaS5leGUnOlxuXHRcdFx0XHRyZXR1cm4gR2VuZXJhbFNoZWxsVHlwZS5HZW1pbmk7XG5cdFx0XHRjYXNlICd3c2wuZXhlJzpcblx0XHRcdGNhc2UgJ3VidW50dS5leGUnOlxuXHRcdFx0Y2FzZSAndWJ1bnR1MTgwNC5leGUnOlxuXHRcdFx0Y2FzZSAna2FsaS5leGUnOlxuXHRcdFx0Y2FzZSAnZGViaWFuLmV4ZSc6XG5cdFx0XHRjYXNlICdvcGVuc3VzZS00Mi5leGUnOlxuXHRcdFx0Y2FzZSAnc2xlcy0xMi5leGUnOlxuXHRcdFx0XHRyZXR1cm4gV2luZG93c1NoZWxsVHlwZS5Xc2w7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRpZiAoZXhlY3V0YWJsZS5tYXRjaCgvcHl0aG9uKFxcZChcXC5cXGR7MCwyfSk/KT9cXC5leGUvKSkge1xuXHRcdFx0XHRcdHJldHVybiBHZW5lcmFsU2hlbGxUeXBlLlB5dGhvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsV0FBVyxnQkFBZ0I7QUFDcEMsU0FBUyxrQkFBcUMsd0JBQXdCO0FBVXRFLE1BQU0sb0JBQW9CO0FBQUEsRUFDekI7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRDtBQUVBLE1BQU0sMkJBQTJCO0FBQUEsRUFDaEM7QUFDRDtBQU1BLE1BQU0sMEJBQWdGO0FBQUEsRUFDckYsRUFBRSxPQUFPLDBCQUEwQixZQUFZLGFBQWE7QUFBQSxFQUM1RCxFQUFFLE9BQU8sb0JBQW9CLFlBQVksWUFBWTtBQUFBLEVBQ3JELEVBQUUsT0FBTywyQkFBMkIsWUFBWSxrQkFBa0I7QUFBQSxFQUNsRSxFQUFFLE9BQU8sc0JBQXNCLFlBQVksY0FBYztBQUFBLEVBQ3pELEVBQUUsT0FBTyx5QkFBeUIsWUFBWSxhQUFhO0FBQzVEO0FBRUEsSUFBSTtBQUVHLE1BQU0sMkJBQTJCLFdBQTBDO0FBQUEsRUFXakYsWUFDUyxnQkFDUDtBQUNELFVBQU07QUFGRTtBQVJULFNBQVEsY0FBc0I7QUFFOUIsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQWdCLENBQUM7QUFFM0UsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXVDLENBQUM7QUFRakcsUUFBSSxDQUFDLFdBQVc7QUFDZixZQUFNLElBQUksTUFBTSxnREFBZ0QsUUFBUSxFQUFFO0FBQUEsSUFDM0U7QUFFQSxTQUFLLHNCQUFzQjtBQUFBLEVBQzVCO0FBQUEsRUFsQkEsSUFBSSxZQUEyQztBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVk7QUFBQSxFQUV6RSxJQUFJLGFBQXFCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBYTtBQUFBLEVBRXBELElBQUkscUJBQW9DO0FBQUUsV0FBTyxLQUFLLG9CQUFvQjtBQUFBLEVBQU87QUFBQSxFQUVqRixJQUFJLHFCQUEyRDtBQUFFLFdBQU8sS0FBSyxvQkFBb0I7QUFBQSxFQUFPO0FBQUEsRUFjeEcsTUFBYyx3QkFBdUM7QUFDcEQsUUFBSSxLQUFLLE9BQU8sWUFBWTtBQUMzQjtBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVc7QUFBQSxFQUNqQjtBQUFBLEVBR0EsTUFBTSxhQUE0QjtBQUNqQyxRQUFJLFdBQVc7QUFJZCxZQUFNLFFBQVEsR0FBRztBQUNqQixXQUFLLGFBQWEsRUFBRSxLQUFLLFdBQVM7QUFDakMsY0FBTSxPQUFPLEtBQUssYUFBYSxLQUFLO0FBQ3BDLFlBQUksU0FBUyxLQUFLLFlBQVk7QUFDN0IsZUFBSyxvQkFBb0IsS0FBSyxJQUFJO0FBQ2xDLGVBQUssb0JBQW9CLEtBQUssS0FBSztBQUNuQyxlQUFLLGFBQWE7QUFDbEIsZUFBSyxjQUFjO0FBQUEsUUFDcEI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBYSxNQUFtRTtBQUN2RixRQUFJLENBQUMsTUFBTTtBQUNWLGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxLQUFLLFNBQVMsY0FBYyxLQUFLLGFBQWE7QUFDakQsaUJBQVcsRUFBRSxPQUFPLFdBQVcsS0FBSyx5QkFBeUI7QUFDNUQsWUFBSSxNQUFNLEtBQUssS0FBSyxXQUFXLEdBQUc7QUFDakMsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLGtCQUFrQixRQUFRLEtBQUssSUFBSSxNQUFNLElBQUk7QUFDaEQsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLGVBQVcsU0FBUywwQkFBMEI7QUFDN0MsVUFBSSxLQUFLLEtBQUssTUFBTSxLQUFLLEdBQUc7QUFDM0IsZUFBTyxLQUFLO0FBQUEsTUFDYjtBQUFBLElBQ0Q7QUFDQSxRQUFJLENBQUMsS0FBSyxZQUFZLEtBQUssU0FBUyxXQUFXLEdBQUc7QUFDakQsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFFBQUksaUJBQWlCO0FBQ3JCLFdBQU8saUJBQWlCLEtBQUssU0FBUyxRQUFRLGtCQUFrQjtBQUMvRCxZQUFNLFFBQVEsS0FBSyxTQUFTLGNBQWM7QUFDMUMsVUFBSSxDQUFDLE1BQU0sWUFBWSxNQUFNLFNBQVMsV0FBVyxHQUFHO0FBQ25EO0FBQUEsTUFDRDtBQUNBLFVBQUksTUFBTSxTQUFTLENBQUMsRUFBRSxTQUFTLGVBQWU7QUFDN0M7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFFBQUksa0JBQWtCLEtBQUssU0FBUyxRQUFRO0FBQzNDLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPLEtBQUssYUFBYSxLQUFLLFNBQVMsY0FBYyxDQUFDO0FBQUEsRUFDdkQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0sZUFBZ0M7QUFDckMsUUFBSSxLQUFLLE9BQU8sWUFBWTtBQUMzQixhQUFPLFFBQVEsUUFBUSxFQUFFO0FBQUEsSUFDMUI7QUFFQSxRQUFJLEtBQUssaUJBQWlCO0FBQ3pCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxRQUFJLENBQUMsb0JBQW9CO0FBQ3hCLDJCQUFxQixNQUFNLE9BQU8sOEJBQThCO0FBQUEsSUFDakU7QUFDQSxTQUFLLGtCQUFrQixJQUFJLFFBQWdCLGFBQVc7QUFDckQseUJBQW1CLGVBQWUsS0FBSyxnQkFBZ0IsVUFBUTtBQUM5RCxjQUFNLE9BQU8sS0FBSyxhQUFhLElBQUk7QUFDbkMsYUFBSyxrQkFBa0I7QUFDdkIsZ0JBQVEsSUFBSTtBQUFBLE1BQ2IsR0FBRyxtQkFBbUIsZ0JBQWdCLFdBQVc7QUFBQSxJQUNsRCxDQUFDO0FBQ0QsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsYUFBYSxZQUFtRDtBQUMvRCxZQUFRLFdBQVcsWUFBWSxHQUFHO0FBQUEsTUFDakMsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekIsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUNKLGVBQU8saUJBQWlCO0FBQUEsTUFDekI7QUFDQyxZQUFJLFdBQVcsTUFBTSw4QkFBOEIsR0FBRztBQUNyRCxpQkFBTyxpQkFBaUI7QUFBQSxRQUN6QjtBQUNBLGVBQU87QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUNEO0FBN0hPO0FBQUEsRUFETCxTQUFTLEdBQUc7QUFBQSxHQTlCRCxtQkErQk47IiwKICAibmFtZXMiOiBbXQp9Cg==
