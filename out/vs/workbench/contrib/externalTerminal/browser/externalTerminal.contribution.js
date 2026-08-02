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
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { URI } from "../../../../base/common/uri.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { ITerminalGroupService, ITerminalService as IIntegratedTerminalService } from "../../terminal/browser/terminal.js";
import { ResourceContextKey } from "../../../common/contextkeys.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { getMultiSelectedResources, IExplorerService } from "../../files/browser/files.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { Schemas } from "../../../../base/common/network.js";
import { distinct } from "../../../../base/common/arrays.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isWindows } from "../../../../base/common/platform.js";
import { dirname, basename } from "../../../../base/common/path.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IExternalTerminalService } from "../../../../platform/externalTerminal/common/externalTerminal.js";
import { TerminalLocation } from "../../../../platform/terminal/common/terminal.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
const OPEN_IN_TERMINAL_COMMAND_ID = "openInTerminal";
const OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID = "openInIntegratedTerminal";
function registerOpenTerminalCommand(id, explorerKind) {
  CommandsRegistry.registerCommand({
    id,
    handler: async (accessor, resource) => {
      const configurationService = accessor.get(IConfigurationService);
      const fileService = accessor.get(IFileService);
      const integratedTerminalService = accessor.get(IIntegratedTerminalService);
      const remoteAgentService = accessor.get(IRemoteAgentService);
      const terminalGroupService = accessor.get(ITerminalGroupService);
      let externalTerminalService = void 0;
      try {
        externalTerminalService = accessor.get(IExternalTerminalService);
      } catch {
      }
      const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
      return fileService.resolveAll(resources.map((r) => ({ resource: r }))).then(async (stats) => {
        const config = configurationService.getValue();
        const useIntegratedTerminal = remoteAgentService.getConnection() || explorerKind === "integrated";
        const targets = distinct(stats.filter((data) => data.success));
        if (useIntegratedTerminal) {
          const opened = {};
          const cwds = targets.map(({ stat }) => {
            const resource2 = stat.resource;
            if (stat.isDirectory) {
              return resource2;
            }
            return URI.from({
              scheme: resource2.scheme,
              authority: resource2.authority,
              fragment: resource2.fragment,
              query: resource2.query,
              path: dirname(resource2.path)
            });
          });
          for (const cwd of cwds) {
            if (opened[cwd.path]) {
              return;
            }
            opened[cwd.path] = true;
            const instance = await integratedTerminalService.createTerminal({ config: { cwd } });
            if (instance && instance.target !== TerminalLocation.Editor && (resources.length === 1 || !resource || cwd.path === resource.path || cwd.path === dirname(resource.path))) {
              integratedTerminalService.setActiveInstance(instance);
              terminalGroupService.showPanel(true);
            }
          }
        } else if (externalTerminalService) {
          distinct(targets.map(({ stat }) => stat.isDirectory ? stat.resource.fsPath : dirname(stat.resource.fsPath))).forEach((cwd) => {
            externalTerminalService.openTerminal(config.terminal.external, cwd);
          });
        }
      });
    }
  });
}
registerOpenTerminalCommand(OPEN_IN_TERMINAL_COMMAND_ID, "external");
registerOpenTerminalCommand(OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID, "integrated");
let ExternalTerminalContribution = class extends Disposable {
  constructor(_configurationService) {
    super();
    this._configurationService = _configurationService;
    const shouldShowIntegratedOnLocal = ContextKeyExpr.and(
      ResourceContextKey.Scheme.isEqualTo(Schemas.file),
      ContextKeyExpr.or(ContextKeyExpr.equals("config.terminal.explorerKind", "integrated"), ContextKeyExpr.equals("config.terminal.explorerKind", "both"))
    );
    const shouldShowExternalKindOnLocal = ContextKeyExpr.and(
      ResourceContextKey.Scheme.isEqualTo(Schemas.file),
      ContextKeyExpr.or(ContextKeyExpr.equals("config.terminal.explorerKind", "external"), ContextKeyExpr.equals("config.terminal.explorerKind", "both"))
    );
    this._openInIntegratedTerminalMenuItem = {
      group: "navigation",
      order: 30,
      command: {
        id: OPEN_IN_INTEGRATED_TERMINAL_COMMAND_ID,
        title: nls.localize("scopedConsoleAction.Integrated", "Open in Integrated Terminal")
      },
      when: ContextKeyExpr.or(shouldShowIntegratedOnLocal, ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeRemote))
    };
    this._openInTerminalMenuItem = {
      group: "navigation",
      order: 31,
      command: {
        id: OPEN_IN_TERMINAL_COMMAND_ID,
        title: nls.localize("scopedConsoleAction.external", "Open in External Terminal")
      },
      when: shouldShowExternalKindOnLocal
    };
    MenuRegistry.appendMenuItem(MenuId.ExplorerContext, this._openInTerminalMenuItem);
    MenuRegistry.appendMenuItem(MenuId.ExplorerContext, this._openInIntegratedTerminalMenuItem);
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("terminal.explorerKind") || e.affectsConfiguration("terminal.external")) {
        this._refreshOpenInTerminalMenuItemTitle();
      }
    }));
    this._refreshOpenInTerminalMenuItemTitle();
  }
  isWindows() {
    const config = this._configurationService.getValue().terminal;
    if (isWindows && config.external?.windowsExec) {
      const file = basename(config.external.windowsExec);
      if (file === "wt" || file === "wt.exe") {
        return true;
      }
    }
    return false;
  }
  _refreshOpenInTerminalMenuItemTitle() {
    if (this.isWindows()) {
      this._openInTerminalMenuItem.command.title = nls.localize("scopedConsoleAction.wt", "Open in Windows Terminal");
    }
  }
};
ExternalTerminalContribution = __decorateClass([
  __decorateParam(0, IConfigurationService)
], ExternalTerminalContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ExternalTerminalContribution, LifecyclePhase.Restored);
export {
  ExternalTerminalContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVybmFsVGVybWluYWwvYnJvd3Nlci9leHRlcm5hbFRlcm1pbmFsLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51UmVnaXN0cnksIElNZW51SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlIGFzIElJbnRlZ3JhdGVkVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGdldE11bHRpU2VsZWN0ZWRSZXNvdXJjZXMsIElFeHBsb3JlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9icm93c2VyL2ZpbGVzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZGlzdGluY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFeHRlcm5hbFRlcm1pbmFsQ29uZmlndXJhdGlvbiwgSUV4dGVybmFsVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZXJuYWxUZXJtaW5hbC9jb21tb24vZXh0ZXJuYWxUZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5cbmNvbnN0IE9QRU5fSU5fVEVSTUlOQUxfQ09NTUFORF9JRCA9ICdvcGVuSW5UZXJtaW5hbCc7XG5jb25zdCBPUEVOX0lOX0lOVEVHUkFURURfVEVSTUlOQUxfQ09NTUFORF9JRCA9ICdvcGVuSW5JbnRlZ3JhdGVkVGVybWluYWwnO1xuXG5mdW5jdGlvbiByZWdpc3Rlck9wZW5UZXJtaW5hbENvbW1hbmQoaWQ6IHN0cmluZywgZXhwbG9yZXJLaW5kOiAnaW50ZWdyYXRlZCcgfCAnZXh0ZXJuYWwnKSB7XG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRpZDogaWQsXG5cdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCByZXNvdXJjZTogVVJJKSA9PiB7XG5cblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgaW50ZWdyYXRlZFRlcm1pbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW50ZWdyYXRlZFRlcm1pbmFsU2VydmljZSk7XG5cdFx0XHRjb25zdCByZW1vdGVBZ2VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUFnZW50U2VydmljZSk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbEdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxHcm91cFNlcnZpY2UpO1xuXHRcdFx0bGV0IGV4dGVybmFsVGVybWluYWxTZXJ2aWNlOiBJRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRleHRlcm5hbFRlcm1pbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UpO1xuXHRcdFx0fSBjYXRjaCB7IH1cblxuXHRcdFx0Y29uc3QgcmVzb3VyY2VzID0gZ2V0TXVsdGlTZWxlY3RlZFJlc291cmNlcyhyZXNvdXJjZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJRXhwbG9yZXJTZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gZmlsZVNlcnZpY2UucmVzb2x2ZUFsbChyZXNvdXJjZXMubWFwKHIgPT4gKHsgcmVzb3VyY2U6IHIgfSkpKS50aGVuKGFzeW5jIHN0YXRzID0+IHtcblx0XHRcdFx0Ly8gQWx3YXlzIHVzZSBpbnRlZ3JhdGVkIHRlcm1pbmFsIHdoZW4gdXNpbmcgYSByZW1vdGVcblx0XHRcdFx0Y29uc3QgY29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUV4dGVybmFsVGVybWluYWxDb25maWd1cmF0aW9uPigpO1xuXG5cdFx0XHRcdGNvbnN0IHVzZUludGVncmF0ZWRUZXJtaW5hbCA9IHJlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCkgfHwgZXhwbG9yZXJLaW5kID09PSAnaW50ZWdyYXRlZCc7XG5cdFx0XHRcdGNvbnN0IHRhcmdldHMgPSBkaXN0aW5jdChzdGF0cy5maWx0ZXIoZGF0YSA9PiBkYXRhLnN1Y2Nlc3MpKTtcblx0XHRcdFx0aWYgKHVzZUludGVncmF0ZWRUZXJtaW5hbCkge1xuXHRcdFx0XHRcdC8vIFRPRE86IFVzZSB1cmkgZm9yIGN3ZCBpbiBjcmVhdGV0ZXJtaW5hbFxuXHRcdFx0XHRcdGNvbnN0IG9wZW5lZDogeyBbcGF0aDogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XG5cdFx0XHRcdFx0Y29uc3QgY3dkcyA9IHRhcmdldHMubWFwKCh7IHN0YXQgfSkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBzdGF0IS5yZXNvdXJjZTtcblx0XHRcdFx0XHRcdGlmIChzdGF0IS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVzb3VyY2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gVVJJLmZyb20oe1xuXHRcdFx0XHRcdFx0XHRzY2hlbWU6IHJlc291cmNlLnNjaGVtZSxcblx0XHRcdFx0XHRcdFx0YXV0aG9yaXR5OiByZXNvdXJjZS5hdXRob3JpdHksXG5cdFx0XHRcdFx0XHRcdGZyYWdtZW50OiByZXNvdXJjZS5mcmFnbWVudCxcblx0XHRcdFx0XHRcdFx0cXVlcnk6IHJlc291cmNlLnF1ZXJ5LFxuXHRcdFx0XHRcdFx0XHRwYXRoOiBkaXJuYW1lKHJlc291cmNlLnBhdGgpXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGN3ZCBvZiBjd2RzKSB7XG5cdFx0XHRcdFx0XHRpZiAob3BlbmVkW2N3ZC5wYXRoXSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRvcGVuZWRbY3dkLnBhdGhdID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gYXdhaXQgaW50ZWdyYXRlZFRlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGNvbmZpZzogeyBjd2QgfSB9KTtcblx0XHRcdFx0XHRcdGlmIChpbnN0YW5jZSAmJiBpbnN0YW5jZS50YXJnZXQgIT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yICYmIChyZXNvdXJjZXMubGVuZ3RoID09PSAxIHx8ICFyZXNvdXJjZSB8fCBjd2QucGF0aCA9PT0gcmVzb3VyY2UucGF0aCB8fCBjd2QucGF0aCA9PT0gZGlybmFtZShyZXNvdXJjZS5wYXRoKSkpIHtcblx0XHRcdFx0XHRcdFx0aW50ZWdyYXRlZFRlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRcdFx0XHRcdHRlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2UpIHtcblx0XHRcdFx0XHRkaXN0aW5jdCh0YXJnZXRzLm1hcCgoeyBzdGF0IH0pID0+IHN0YXQhLmlzRGlyZWN0b3J5ID8gc3RhdCEucmVzb3VyY2UuZnNQYXRoIDogZGlybmFtZShzdGF0IS5yZXNvdXJjZS5mc1BhdGgpKSkuZm9yRWFjaChjd2QgPT4ge1xuXHRcdFx0XHRcdFx0ZXh0ZXJuYWxUZXJtaW5hbFNlcnZpY2Uub3BlblRlcm1pbmFsKGNvbmZpZy50ZXJtaW5hbC5leHRlcm5hbCwgY3dkKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcbn1cblxucmVnaXN0ZXJPcGVuVGVybWluYWxDb21tYW5kKE9QRU5fSU5fVEVSTUlOQUxfQ09NTUFORF9JRCwgJ2V4dGVybmFsJyk7XG5yZWdpc3Rlck9wZW5UZXJtaW5hbENvbW1hbmQoT1BFTl9JTl9JTlRFR1JBVEVEX1RFUk1JTkFMX0NPTU1BTkRfSUQsICdpbnRlZ3JhdGVkJyk7XG5cbmV4cG9ydCBjbGFzcyBFeHRlcm5hbFRlcm1pbmFsQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIF9vcGVuSW5JbnRlZ3JhdGVkVGVybWluYWxNZW51SXRlbTogSU1lbnVJdGVtO1xuXHRwcml2YXRlIF9vcGVuSW5UZXJtaW5hbE1lbnVJdGVtOiBJTWVudUl0ZW07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBzaG91bGRTaG93SW50ZWdyYXRlZE9uTG9jYWwgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLmZpbGUpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIub3IoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcudGVybWluYWwuZXhwbG9yZXJLaW5kJywgJ2ludGVncmF0ZWQnKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcudGVybWluYWwuZXhwbG9yZXJLaW5kJywgJ2JvdGgnKSkpO1xuXG5cblx0XHRjb25zdCBzaG91bGRTaG93RXh0ZXJuYWxLaW5kT25Mb2NhbCA9IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFJlc291cmNlQ29udGV4dEtleS5TY2hlbWUuaXNFcXVhbFRvKFNjaGVtYXMuZmlsZSksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy50ZXJtaW5hbC5leHBsb3JlcktpbmQnLCAnZXh0ZXJuYWwnKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcudGVybWluYWwuZXhwbG9yZXJLaW5kJywgJ2JvdGgnKSkpO1xuXG5cdFx0dGhpcy5fb3BlbkluSW50ZWdyYXRlZFRlcm1pbmFsTWVudUl0ZW0gPSB7XG5cdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0b3JkZXI6IDMwLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogT1BFTl9JTl9JTlRFR1JBVEVEX1RFUk1JTkFMX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3Njb3BlZENvbnNvbGVBY3Rpb24uSW50ZWdyYXRlZCcsIFwiT3BlbiBpbiBJbnRlZ3JhdGVkIFRlcm1pbmFsXCIpXG5cdFx0XHR9LFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3Ioc2hvdWxkU2hvd0ludGVncmF0ZWRPbkxvY2FsLCBSZXNvdXJjZUNvbnRleHRLZXkuU2NoZW1lLmlzRXF1YWxUbyhTY2hlbWFzLnZzY29kZVJlbW90ZSkpXG5cdFx0fTtcblxuXG5cdFx0dGhpcy5fb3BlbkluVGVybWluYWxNZW51SXRlbSA9IHtcblx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRvcmRlcjogMzEsXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiBPUEVOX0lOX1RFUk1JTkFMX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3Njb3BlZENvbnNvbGVBY3Rpb24uZXh0ZXJuYWwnLCBcIk9wZW4gaW4gRXh0ZXJuYWwgVGVybWluYWxcIilcblx0XHRcdH0sXG5cdFx0XHR3aGVuOiBzaG91bGRTaG93RXh0ZXJuYWxLaW5kT25Mb2NhbFxuXHRcdH07XG5cblxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRXhwbG9yZXJDb250ZXh0LCB0aGlzLl9vcGVuSW5UZXJtaW5hbE1lbnVJdGVtKTtcblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkV4cGxvcmVyQ29udGV4dCwgdGhpcy5fb3BlbkluSW50ZWdyYXRlZFRlcm1pbmFsTWVudUl0ZW0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsLmV4cGxvcmVyS2luZCcpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsLmV4dGVybmFsJykpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaE9wZW5JblRlcm1pbmFsTWVudUl0ZW1UaXRsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZnJlc2hPcGVuSW5UZXJtaW5hbE1lbnVJdGVtVGl0bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgaXNXaW5kb3dzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFeHRlcm5hbFRlcm1pbmFsQ29uZmlndXJhdGlvbj4oKS50ZXJtaW5hbDtcblx0XHRpZiAoaXNXaW5kb3dzICYmIGNvbmZpZy5leHRlcm5hbD8ud2luZG93c0V4ZWMpIHtcblx0XHRcdGNvbnN0IGZpbGUgPSBiYXNlbmFtZShjb25maWcuZXh0ZXJuYWwud2luZG93c0V4ZWMpO1xuXHRcdFx0aWYgKGZpbGUgPT09ICd3dCcgfHwgZmlsZSA9PT0gJ3d0LmV4ZScpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hPcGVuSW5UZXJtaW5hbE1lbnVJdGVtVGl0bGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNXaW5kb3dzKCkpIHtcblx0XHRcdHRoaXMuX29wZW5JblRlcm1pbmFsTWVudUl0ZW0uY29tbWFuZC50aXRsZSA9IG5scy5sb2NhbGl6ZSgnc2NvcGVkQ29uc29sZUFjdGlvbi53dCcsIFwiT3BlbiBpbiBXaW5kb3dzIFRlcm1pbmFsXCIpO1xuXHRcdH1cblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRXh0ZXJuYWxUZXJtaW5hbENvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsUUFBUSxvQkFBK0I7QUFDaEQsU0FBUyx1QkFBdUIsb0JBQW9CLGtDQUFrQztBQUN0RixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDJCQUEyQix3QkFBd0I7QUFDNUQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQWtFLGNBQWMsMkJBQTJCO0FBQzNHLFNBQVMsa0JBQWtCO0FBQzNCLFNB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
