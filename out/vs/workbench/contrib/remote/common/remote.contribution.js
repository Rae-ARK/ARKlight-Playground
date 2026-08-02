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
import { WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { OperatingSystem, isWeb, OS } from "../../../../base/common/platform.js";
import { Schemas } from "../../../../base/common/network.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { ILoggerService } from "../../../../platform/log/common/log.js";
import { localize, localize2 } from "../../../../nls.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { PersistentConnection } from "../../../../platform/remote/common/remoteAgentConnection.js";
import { IDownloadService } from "../../../../platform/download/common/download.js";
import { DownloadServiceChannel } from "../../../../platform/download/common/downloadIpc.js";
import { RemoteLoggerChannelClient } from "../../../../platform/log/common/logIpc.js";
import { REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS } from "../../../../platform/remote/common/remote.js";
import product from "../../../../platform/product/common/product.js";
const EXTENSION_IDENTIFIER_PATTERN = "([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$";
let LabelContribution = class {
  constructor(labelService, remoteAgentService) {
    this.labelService = labelService;
    this.remoteAgentService = remoteAgentService;
    this.registerFormatters();
  }
  registerFormatters() {
    this.remoteAgentService.getEnvironment().then((remoteEnvironment) => {
      const os = remoteEnvironment?.os || OS;
      const formatting = {
        label: "${path}",
        separator: os === OperatingSystem.Windows ? "\\" : "/",
        tildify: os !== OperatingSystem.Windows,
        normalizeDriveLetter: os === OperatingSystem.Windows,
        workspaceSuffix: isWeb ? void 0 : Schemas.vscodeRemote
      };
      this.labelService.registerFormatter({
        scheme: Schemas.vscodeRemote,
        formatting
      });
      if (remoteEnvironment) {
        this.labelService.registerFormatter({
          scheme: Schemas.vscodeUserData,
          formatting
        });
      }
    });
  }
};
LabelContribution.ID = "workbench.contrib.remoteLabel";
LabelContribution = __decorateClass([
  __decorateParam(0, ILabelService),
  __decorateParam(1, IRemoteAgentService)
], LabelContribution);
let RemoteChannelsContribution = class extends Disposable {
  constructor(remoteAgentService, downloadService, loggerService) {
    super();
    const connection = remoteAgentService.getConnection();
    if (connection) {
      connection.registerChannel("download", new DownloadServiceChannel(downloadService));
      connection.withChannel("logger", async (channel) => this._register(new RemoteLoggerChannelClient(loggerService, channel)));
    }
  }
};
RemoteChannelsContribution = __decorateClass([
  __decorateParam(0, IRemoteAgentService),
  __decorateParam(1, IDownloadService),
  __decorateParam(2, ILoggerService)
], RemoteChannelsContribution);
let RemoteInvalidWorkspaceDetector = class extends Disposable {
  constructor(fileService, dialogService, environmentService, contextService, fileDialogService, remoteAgentService) {
    super();
    this.fileService = fileService;
    this.dialogService = dialogService;
    this.environmentService = environmentService;
    this.contextService = contextService;
    this.fileDialogService = fileDialogService;
    if (this.environmentService.remoteAuthority) {
      remoteAgentService.getEnvironment().then((remoteEnv) => {
        if (remoteEnv) {
          this.validateRemoteWorkspace();
        }
      });
    }
  }
  async validateRemoteWorkspace() {
    const workspace = this.contextService.getWorkspace();
    const workspaceUriToStat = workspace.configuration ?? workspace.folders.at(0)?.uri;
    if (!workspaceUriToStat) {
      return;
    }
    const exists = await this.fileService.exists(workspaceUriToStat);
    if (exists) {
      return;
    }
    const res = await this.dialogService.confirm({
      type: "warning",
      message: localize("invalidWorkspaceMessage", "Workspace does not exist"),
      detail: localize("invalidWorkspaceDetail", "Please select another workspace to open."),
      primaryButton: localize({ key: "invalidWorkspacePrimary", comment: ["&& denotes a mnemonic"] }, "&&Open Workspace...")
    });
    if (res.confirmed) {
      if (workspace.configuration) {
        return this.fileDialogService.pickWorkspaceAndOpen({});
      }
      return this.fileDialogService.pickFolderAndOpen({});
    }
  }
};
RemoteInvalidWorkspaceDetector.ID = "workbench.contrib.remoteInvalidWorkspaceDetector";
RemoteInvalidWorkspaceDetector = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IWorkbenchEnvironmentService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IRemoteAgentService)
], RemoteInvalidWorkspaceDetector);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(LabelContribution.ID, LabelContribution, WorkbenchPhase.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(RemoteChannelsContribution, LifecyclePhase.Restored);
registerWorkbenchContribution2(RemoteInvalidWorkspaceDetector.ID, RemoteInvalidWorkspaceDetector, WorkbenchPhase.BlockStartup);
const enableDiagnostics = true;
if (enableDiagnostics) {
  class TriggerReconnectAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.triggerReconnect",
        title: localize2("triggerReconnect", "Connection: Trigger Reconnect"),
        category: Categories.Developer,
        f1: true
      });
    }
    async run(accessor) {
      PersistentConnection.debugTriggerReconnection();
    }
  }
  class PauseSocketWriting extends Action2 {
    constructor() {
      super({
        id: "workbench.action.pauseSocketWriting",
        title: localize2("pauseSocketWriting", "Connection: Pause socket writing"),
        category: Categories.Developer,
        f1: true
      });
    }
    async run(accessor) {
      PersistentConnection.debugPauseSocketWriting();
    }
  }
  registerAction2(TriggerReconnectAction);
  registerAction2(PauseSocketWriting);
}
const extensionKindSchema = {
  type: "string",
  enum: [
    "ui",
    "workspace"
  ],
  enumDescriptions: [
    localize("ui", "UI extension kind. In a remote window, such extensions are enabled only when available on the local machine."),
    localize("workspace", "Workspace extension kind. In a remote window, such extensions are enabled only when available on the remote.")
  ]
};
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "remote",
  title: localize("remote", "Remote"),
  type: "object",
  properties: {
    "remote.extensionKind": {
      type: "object",
      markdownDescription: localize("remote.extensionKind", "Override the kind of an extension. `ui` extensions are installed and run on the local machine while `workspace` extensions are run on the remote. By overriding an extension's default kind using this setting, you specify if that extension should be installed and enabled locally or remotely."),
      patternProperties: {
        [EXTENSION_IDENTIFIER_PATTERN]: {
          oneOf: [{ type: "array", items: extensionKindSchema }, extensionKindSchema],
          default: ["ui"]
        }
      },
      default: {
        "pub.name": ["ui"]
      }
    },
    "remote.restoreForwardedPorts": {
      type: "boolean",
      markdownDescription: localize("remote.restoreForwardedPorts", "Restores the ports you forwarded in a workspace."),
      default: true
    },
    "remote.autoForwardPorts": {
      type: "boolean",
      markdownDescription: localize("remote.autoForwardPorts", "When enabled, new running processes are detected and ports that they listen on are automatically forwarded. Disabling this setting will not prevent all ports from being forwarded. Even when disabled, extensions will still be able to cause ports to be forwarded, and opening some URLs will still cause ports to forwarded. Also see {0}.", "`#remote.autoForwardPortsSource#`"),
      default: true
    },
    "remote.autoForwardPortsSource": {
      type: "string",
      markdownDescription: localize("remote.autoForwardPortsSource", "Sets the source from which ports are automatically forwarded when {0} is true. When {0} is false, {1} will be used to find information about ports that have already been forwarded. On Windows and macOS remotes, the `process` and `hybrid` options have no effect and `output` will be used.", "`#remote.autoForwardPorts#`", "`#remote.autoForwardPortsSource#`"),
      enum: ["process", "output", "hybrid"],
      enumDescriptions: [
        localize("remote.autoForwardPortsSource.process", "Ports will be automatically forwarded when discovered by watching for processes that are started and include a port."),
        localize("remote.autoForwardPortsSource.output", 'Ports will be automatically forwarded when discovered by reading terminal and debug output. Not all processes that use ports will print to the integrated terminal or debug console, so some ports will be missed. Ports forwarded based on output will not be "un-forwarded" until reload or until the port is closed by the user in the Ports view.'),
        localize("remote.autoForwardPortsSource.hybrid", 'Ports will be automatically forwarded when discovered by reading terminal and debug output. Not all processes that use ports will print to the integrated terminal or debug console, so some ports will be missed. Ports will be "un-forwarded" by watching for processes that listen on that port to be terminated.')
      ],
      default: "process"
    },
    "remote.autoForwardPortsFallback": {
      type: "number",
      default: 20,
      markdownDescription: localize("remote.autoForwardPortFallback", "The number of auto forwarded ports that will trigger the switch from `process` to `hybrid` when automatically forwarding ports and `remote.autoForwardPortsSource` is set to `process` by default. Set to `0` to disable the fallback. When `remote.autoForwardPortsFallback` hasn't been configured, but `remote.autoForwardPortsSource` has, `remote.autoForwardPortsFallback` will be treated as though it's set to `0`.")
    },
    "remote.forwardOnOpen": {
      type: "boolean",
      description: localize("remote.forwardOnClick", "Controls whether local URLs with a port will be forwarded when opened from the terminal and the debug console."),
      default: true
    },
    // Consider making changes to extensions\configuration-editing\schemas\devContainer.schema.src.json
    // and extensions\configuration-editing\schemas\attachContainer.schema.json
    // to keep in sync with devcontainer.json schema.
    "remote.portsAttributes": {
      type: "object",
      patternProperties: {
        "(^\\d+(-\\d+)?$)|(.+)": {
          type: "object",
          description: localize("remote.portsAttributes.port", 'A port, range of ports (ex. "40000-55000"), host and port (ex. "db:1234"), or regular expression (ex. ".+\\\\/server.js").  For a port number or range, the attributes will apply to that port number or range of port numbers. Attributes which use a regular expression will apply to ports whose associated process command line matches the expression.'),
          properties: {
            "onAutoForward": {
              type: "string",
              enum: ["notify", "openBrowser", "openBrowserOnce", "openPreview", "silent", "ignore"],
              enumDescriptions: [
                localize("remote.portsAttributes.notify", "Shows a notification when a port is automatically forwarded."),
                localize("remote.portsAttributes.openBrowser", "Opens the browser when the port is automatically forwarded. Depending on your settings, this could open an embedded browser."),
                localize("remote.portsAttributes.openBrowserOnce", "Opens the browser when the port is automatically forwarded, but only the first time the port is forward during a session. Depending on your settings, this could open an embedded browser."),
                localize("remote.portsAttributes.openPreview", "Opens a preview in the same window when the port is automatically forwarded."),
                localize("remote.portsAttributes.silent", "Shows no notification and takes no action when this port is automatically forwarded."),
                localize("remote.portsAttributes.ignore", "This port will not be automatically forwarded.")
              ],
              description: localize("remote.portsAttributes.onForward", "Defines the action that occurs when the port is discovered for automatic forwarding"),
              default: "notify"
            },
            "elevateIfNeeded": {
              type: "boolean",
              description: localize("remote.portsAttributes.elevateIfNeeded", "Automatically prompt for elevation (if needed) when this port is forwarded. Elevate is required if the local port is a privileged port."),
              default: false
            },
            "label": {
              type: "string",
              description: localize("remote.portsAttributes.label", "Label that will be shown in the UI for this port."),
              default: localize("remote.portsAttributes.labelDefault", "Application")
            },
            "requireLocalPort": {
              type: "boolean",
              markdownDescription: localize("remote.portsAttributes.requireLocalPort", "When true, a modal dialog will show if the chosen local port isn't used for forwarding."),
              default: false
            },
            "protocol": {
              type: "string",
              enum: ["http", "https"],
              description: localize("remote.portsAttributes.protocol", "The protocol to use when forwarding this port.")
            }
          },
          default: {
            "label": localize("remote.portsAttributes.labelDefault", "Application"),
            "onAutoForward": "notify"
          }
        }
      },
      markdownDescription: localize("remote.portsAttributes", 'Set properties that are applied when a specific port number is forwarded. For example:\n\n```\n"3000": {\n  "label": "Application"\n},\n"40000-55000": {\n  "onAutoForward": "ignore"\n},\n".+\\\\/server.js": {\n "onAutoForward": "openPreview"\n}\n```'),
      defaultSnippets: [{ body: { "${1:3000}": { label: "${2:Application}", onAutoForward: "openPreview" } } }],
      errorMessage: localize("remote.portsAttributes.patternError", "Must be a port number, range of port numbers, or regular expression."),
      additionalProperties: false,
      default: {
        "443": {
          "protocol": "https"
        },
        "8443": {
          "protocol": "https"
        }
      }
    },
    "remote.otherPortsAttributes": {
      type: "object",
      properties: {
        "onAutoForward": {
          type: "string",
          enum: ["notify", "openBrowser", "openPreview", "silent", "ignore"],
          enumDescriptions: [
            localize("remote.portsAttributes.notify", "Shows a notification when a port is automatically forwarded."),
            localize("remote.portsAttributes.openBrowser", "Opens the browser when the port is automatically forwarded. Depending on your settings, this could open an embedded browser."),
            localize("remote.portsAttributes.openPreview", "Opens a preview in the same window when the port is automatically forwarded."),
            localize("remote.portsAttributes.silent", "Shows no notification and takes no action when this port is automatically forwarded."),
            localize("remote.portsAttributes.ignore", "This port will not be automatically forwarded.")
          ],
          description: localize("remote.portsAttributes.onForward", "Defines the action that occurs when the port is discovered for automatic forwarding"),
          default: "notify"
        },
        "elevateIfNeeded": {
          type: "boolean",
          description: localize("remote.portsAttributes.elevateIfNeeded", "Automatically prompt for elevation (if needed) when this port is forwarded. Elevate is required if the local port is a privileged port."),
          default: false
        },
        "label": {
          type: "string",
          description: localize("remote.portsAttributes.label", "Label that will be shown in the UI for this port."),
          default: localize("remote.portsAttributes.labelDefault", "Application")
        },
        "requireLocalPort": {
          type: "boolean",
          markdownDescription: localize("remote.portsAttributes.requireLocalPort", "When true, a modal dialog will show if the chosen local port isn't used for forwarding."),
          default: false
        },
        "protocol": {
          type: "string",
          enum: ["http", "https"],
          description: localize("remote.portsAttributes.protocol", "The protocol to use when forwarding this port.")
        }
      },
      defaultSnippets: [{ body: { onAutoForward: "ignore" } }],
      markdownDescription: localize("remote.portsAttributes.defaults", 'Set default properties that are applied to all ports that don\'t get properties from the setting {0}. For example:\n\n```\n{\n  "onAutoForward": "ignore"\n}\n```', "`#remote.portsAttributes#`"),
      additionalProperties: false
    },
    "remote.localPortHost": {
      type: "string",
      enum: ["localhost", "allInterfaces"],
      default: "localhost",
      description: localize("remote.localPortHost", "Specifies the local host name that will be used for port forwarding.")
    },
    [REMOTE_DEFAULT_IF_LOCAL_EXTENSIONS]: {
      type: "array",
      markdownDescription: localize("remote.defaultExtensionsIfInstalledLocally.markdownDescription", "List of extensions to install upon connection to a remote when already installed locally."),
      default: product?.remoteDefaultExtensionsIfInstalledLocally || [],
      items: {
        type: "string",
        pattern: EXTENSION_IDENTIFIER_PATTERN,
        patternErrorMessage: localize("remote.defaultExtensionsIfInstalledLocally.invalidFormat", 'Extension identifier must be in format "publisher.name".')
      }
    }
  }
});
export {
  LabelContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3JlbW90ZS9jb21tb24vcmVtb3RlLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIFdvcmtiZW5jaFBoYXNlLCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSwgUmVzb3VyY2VMYWJlbEZvcm1hdHRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBpc1dlYiwgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBQZXJzaXN0ZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IElEb3dubG9hZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kb3dubG9hZC9jb21tb24vZG93bmxvYWQuanMnO1xuaW1wb3J0IHsgRG93bmxvYWRTZXJ2aWNlQ2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Rvd25sb2FkL2NvbW1vbi9kb3dubG9hZElwYy5qcyc7XG5pbXBvcnQgeyBSZW1vdGVMb2dnZXJDaGFubmVsQ2xpZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2dJcGMuanMnO1xuaW1wb3J0IHsgUkVNT1RFX0RFRkFVTFRfSUZfTE9DQUxfRVhURU5TSU9OUyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vcmVtb3RlLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuXG5cbmNvbnN0IEVYVEVOU0lPTl9JREVOVElGSUVSX1BBVFRFUk4gPSAnKFthLXowLTlBLVpdW2EtejAtOS1BLVpdKilcXFxcLihbYS16MC05QS1aXVthLXowLTktQS1aXSopJCc7XG5cbmV4cG9ydCBjbGFzcyBMYWJlbENvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5yZW1vdGVMYWJlbCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UpIHtcblx0XHR0aGlzLnJlZ2lzdGVyRm9ybWF0dGVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckZvcm1hdHRlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKHJlbW90ZUVudmlyb25tZW50ID0+IHtcblx0XHRcdGNvbnN0IG9zID0gcmVtb3RlRW52aXJvbm1lbnQ/Lm9zIHx8IE9TO1xuXHRcdFx0Y29uc3QgZm9ybWF0dGluZzogUmVzb3VyY2VMYWJlbEZvcm1hdHRpbmcgPSB7XG5cdFx0XHRcdGxhYmVsOiAnJHtwYXRofScsXG5cdFx0XHRcdHNlcGFyYXRvcjogb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gJ1xcXFwnIDogJy8nLFxuXHRcdFx0XHR0aWxkaWZ5OiBvcyAhPT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsXG5cdFx0XHRcdG5vcm1hbGl6ZURyaXZlTGV0dGVyOiBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsXG5cdFx0XHRcdHdvcmtzcGFjZVN1ZmZpeDogaXNXZWIgPyB1bmRlZmluZWQgOiBTY2hlbWFzLnZzY29kZVJlbW90ZVxuXHRcdFx0fTtcblx0XHRcdHRoaXMubGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSxcblx0XHRcdFx0Zm9ybWF0dGluZ1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChyZW1vdGVFbnZpcm9ubWVudCkge1xuXHRcdFx0XHR0aGlzLmxhYmVsU2VydmljZS5yZWdpc3RlckZvcm1hdHRlcih7XG5cdFx0XHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZVVzZXJEYXRhLFxuXHRcdFx0XHRcdGZvcm1hdHRpbmdcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgUmVtb3RlQ2hhbm5lbHNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJRG93bmxvYWRTZXJ2aWNlIGRvd25sb2FkU2VydmljZTogSURvd25sb2FkU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHJlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdGNvbm5lY3Rpb24ucmVnaXN0ZXJDaGFubmVsKCdkb3dubG9hZCcsIG5ldyBEb3dubG9hZFNlcnZpY2VDaGFubmVsKGRvd25sb2FkU2VydmljZSkpO1xuXHRcdFx0Y29ubmVjdGlvbi53aXRoQ2hhbm5lbCgnbG9nZ2VyJywgYXN5bmMgY2hhbm5lbCA9PiB0aGlzLl9yZWdpc3RlcihuZXcgUmVtb3RlTG9nZ2VyQ2hhbm5lbENsaWVudChsb2dnZXJTZXJ2aWNlLCBjaGFubmVsKSkpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBSZW1vdGVJbnZhbGlkV29ya3NwYWNlRGV0ZWN0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnJlbW90ZUludmFsaWRXb3Jrc3BhY2VEZXRlY3Rvcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElGaWxlRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVEaWFsb2dTZXJ2aWNlOiBJRmlsZURpYWxvZ1NlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBXaGVuIGNvbm5lY3RlZCB0byBhIHJlbW90ZSB3b3Jrc3BhY2UsIHdlIGN1cnJlbnRseSBjYW5ub3Rcblx0XHQvLyB2YWxpZGF0ZSB0aGF0IHRoZSB3b3Jrc3BhY2UgZXhpc3RzIGJlZm9yZSBhY3R1YWxseSBvcGVuaW5nXG5cdFx0Ly8gaXQuIEFzIHN1Y2gsIHdlIG5lZWQgdG8gY2hlY2sgb24gdGhhdCBhZnRlciBzdGFydHVwIGFuZCBndWlkZVxuXHRcdC8vIHRoZSB1c2VyIHRvIGEgdmFsaWQgd29ya3NwYWNlLlxuXHRcdC8vIChzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzMzg3Milcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKHJlbW90ZUVudiA9PiB7XG5cdFx0XHRcdGlmIChyZW1vdGVFbnYpIHtcblx0XHRcdFx0XHQvLyB3ZSB1c2UgdGhlIHByZXNlbmNlIG9mIGByZW1vdGVFbnZgIHRvIGZpZ3VyZSBvdXRcblx0XHRcdFx0XHQvLyBpZiB3ZSBnb3QgYSBoZWFsdGh5IHJlbW90ZSBjb25uZWN0aW9uXG5cdFx0XHRcdFx0Ly8gKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTM1MzMxKVxuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVSZW1vdGVXb3Jrc3BhY2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVJlbW90ZVdvcmtzcGFjZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaVRvU3RhdCA9IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uID8/IHdvcmtzcGFjZS5mb2xkZXJzLmF0KDApPy51cmk7XG5cdFx0aWYgKCF3b3Jrc3BhY2VVcmlUb1N0YXQpIHtcblx0XHRcdHJldHVybjsgLy8gb25seSB3aGVuIGluIHdvcmtzcGFjZVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHdvcmtzcGFjZVVyaVRvU3RhdCk7XG5cdFx0aWYgKGV4aXN0cykge1xuXHRcdFx0cmV0dXJuOyAvLyBhbGwgZ29vZCFcblx0XHR9XG5cblx0XHRjb25zdCByZXMgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnaW52YWxpZFdvcmtzcGFjZU1lc3NhZ2UnLCBcIldvcmtzcGFjZSBkb2VzIG5vdCBleGlzdFwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2ludmFsaWRXb3Jrc3BhY2VEZXRhaWwnLCBcIlBsZWFzZSBzZWxlY3QgYW5vdGhlciB3b3Jrc3BhY2UgdG8gb3Blbi5cIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ2ludmFsaWRXb3Jrc3BhY2VQcmltYXJ5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT3BlbiBXb3Jrc3BhY2UuLi5cIilcblx0XHR9KTtcblxuXHRcdGlmIChyZXMuY29uZmlybWVkKSB7XG5cblx0XHRcdC8vIFBpY2sgV29ya3NwYWNlXG5cdFx0XHRpZiAod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UucGlja1dvcmtzcGFjZUFuZE9wZW4oe30pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQaWNrIEZvbGRlclxuXHRcdFx0cmV0dXJuIHRoaXMuZmlsZURpYWxvZ1NlcnZpY2UucGlja0ZvbGRlckFuZE9wZW4oe30pO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCB3b3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTGFiZWxDb250cmlidXRpb24uSUQsIExhYmVsQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xud29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFJlbW90ZUNoYW5uZWxzQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoUmVtb3RlSW52YWxpZFdvcmtzcGFjZURldGVjdG9yLklELCBSZW1vdGVJbnZhbGlkV29ya3NwYWNlRGV0ZWN0b3IsIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbmNvbnN0IGVuYWJsZURpYWdub3N0aWNzID0gdHJ1ZTtcblxuaWYgKGVuYWJsZURpYWdub3N0aWNzKSB7XG5cdGNsYXNzIFRyaWdnZXJSZWNvbm5lY3RBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRyaWdnZXJSZWNvbm5lY3QnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0cmlnZ2VyUmVjb25uZWN0JywgJ0Nvbm5lY3Rpb246IFRyaWdnZXIgUmVjb25uZWN0JyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFBlcnNpc3RlbnRDb25uZWN0aW9uLmRlYnVnVHJpZ2dlclJlY29ubmVjdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIFBhdXNlU29ja2V0V3JpdGluZyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucGF1c2VTb2NrZXRXcml0aW5nJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigncGF1c2VTb2NrZXRXcml0aW5nJywgJ0Nvbm5lY3Rpb246IFBhdXNlIHNvY2tldCB3cml0aW5nJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLkRldmVsb3Blcixcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFBlcnNpc3RlbnRDb25uZWN0aW9uLmRlYnVnUGF1c2VTb2NrZXRXcml0aW5nKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJBY3Rpb24yKFRyaWdnZXJSZWNvbm5lY3RBY3Rpb24pO1xuXHRyZWdpc3RlckFjdGlvbjIoUGF1c2VTb2NrZXRXcml0aW5nKTtcbn1cblxuY29uc3QgZXh0ZW5zaW9uS2luZFNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRlbnVtOiBbXG5cdFx0J3VpJyxcblx0XHQnd29ya3NwYWNlJ1xuXHRdLFxuXHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0bG9jYWxpemUoJ3VpJywgXCJVSSBleHRlbnNpb24ga2luZC4gSW4gYSByZW1vdGUgd2luZG93LCBzdWNoIGV4dGVuc2lvbnMgYXJlIGVuYWJsZWQgb25seSB3aGVuIGF2YWlsYWJsZSBvbiB0aGUgbG9jYWwgbWFjaGluZS5cIiksXG5cdFx0bG9jYWxpemUoJ3dvcmtzcGFjZScsIFwiV29ya3NwYWNlIGV4dGVuc2lvbiBraW5kLiBJbiBhIHJlbW90ZSB3aW5kb3csIHN1Y2ggZXh0ZW5zaW9ucyBhcmUgZW5hYmxlZCBvbmx5IHdoZW4gYXZhaWxhYmxlIG9uIHRoZSByZW1vdGUuXCIpXG5cdF0sXG59O1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKVxuXHQucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRpZDogJ3JlbW90ZScsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdyZW1vdGUnLCBcIlJlbW90ZVwiKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHQncmVtb3RlLmV4dGVuc2lvbktpbmQnOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLmV4dGVuc2lvbktpbmQnLCBcIk92ZXJyaWRlIHRoZSBraW5kIG9mIGFuIGV4dGVuc2lvbi4gYHVpYCBleHRlbnNpb25zIGFyZSBpbnN0YWxsZWQgYW5kIHJ1biBvbiB0aGUgbG9jYWwgbWFjaGluZSB3aGlsZSBgd29ya3NwYWNlYCBleHRlbnNpb25zIGFyZSBydW4gb24gdGhlIHJlbW90ZS4gQnkgb3ZlcnJpZGluZyBhbiBleHRlbnNpb24ncyBkZWZhdWx0IGtpbmQgdXNpbmcgdGhpcyBzZXR0aW5nLCB5b3Ugc3BlY2lmeSBpZiB0aGF0IGV4dGVuc2lvbiBzaG91bGQgYmUgaW5zdGFsbGVkIGFuZCBlbmFibGVkIGxvY2FsbHkgb3IgcmVtb3RlbHkuXCIpLFxuXHRcdFx0XHRwYXR0ZXJuUHJvcGVydGllczoge1xuXHRcdFx0XHRcdFtFWFRFTlNJT05fSURFTlRJRklFUl9QQVRURVJOXToge1xuXHRcdFx0XHRcdFx0b25lT2Y6IFt7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiBleHRlbnNpb25LaW5kU2NoZW1hIH0sIGV4dGVuc2lvbktpbmRTY2hlbWFdLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogWyd1aSddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHQncHViLm5hbWUnOiBbJ3VpJ11cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCdyZW1vdGUucmVzdG9yZUZvcndhcmRlZFBvcnRzJzoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucmVzdG9yZUZvcndhcmRlZFBvcnRzJywgXCJSZXN0b3JlcyB0aGUgcG9ydHMgeW91IGZvcndhcmRlZCBpbiBhIHdvcmtzcGFjZS5cIiksXG5cdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdH0sXG5cdFx0XHQncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHMnOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzJywgXCJXaGVuIGVuYWJsZWQsIG5ldyBydW5uaW5nIHByb2Nlc3NlcyBhcmUgZGV0ZWN0ZWQgYW5kIHBvcnRzIHRoYXQgdGhleSBsaXN0ZW4gb24gYXJlIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLiBEaXNhYmxpbmcgdGhpcyBzZXR0aW5nIHdpbGwgbm90IHByZXZlbnQgYWxsIHBvcnRzIGZyb20gYmVpbmcgZm9yd2FyZGVkLiBFdmVuIHdoZW4gZGlzYWJsZWQsIGV4dGVuc2lvbnMgd2lsbCBzdGlsbCBiZSBhYmxlIHRvIGNhdXNlIHBvcnRzIHRvIGJlIGZvcndhcmRlZCwgYW5kIG9wZW5pbmcgc29tZSBVUkxzIHdpbGwgc3RpbGwgY2F1c2UgcG9ydHMgdG8gZm9yd2FyZGVkLiBBbHNvIHNlZSB7MH0uXCIsICdgI3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlI2AnKSxcblx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZSc6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZScsIFwiU2V0cyB0aGUgc291cmNlIGZyb20gd2hpY2ggcG9ydHMgYXJlIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkIHdoZW4gezB9IGlzIHRydWUuIFdoZW4gezB9IGlzIGZhbHNlLCB7MX0gd2lsbCBiZSB1c2VkIHRvIGZpbmQgaW5mb3JtYXRpb24gYWJvdXQgcG9ydHMgdGhhdCBoYXZlIGFscmVhZHkgYmVlbiBmb3J3YXJkZWQuIE9uIFdpbmRvd3MgYW5kIG1hY09TIHJlbW90ZXMsIHRoZSBgcHJvY2Vzc2AgYW5kIGBoeWJyaWRgIG9wdGlvbnMgaGF2ZSBubyBlZmZlY3QgYW5kIGBvdXRwdXRgIHdpbGwgYmUgdXNlZC5cIiwgJ2AjcmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHMjYCcsICdgI3JlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlI2AnKSxcblx0XHRcdFx0ZW51bTogWydwcm9jZXNzJywgJ291dHB1dCcsICdoeWJyaWQnXSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZS5wcm9jZXNzJywgXCJQb3J0cyB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkIHdoZW4gZGlzY292ZXJlZCBieSB3YXRjaGluZyBmb3IgcHJvY2Vzc2VzIHRoYXQgYXJlIHN0YXJ0ZWQgYW5kIGluY2x1ZGUgYSBwb3J0LlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNTb3VyY2Uub3V0cHV0JywgXCJQb3J0cyB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkIHdoZW4gZGlzY292ZXJlZCBieSByZWFkaW5nIHRlcm1pbmFsIGFuZCBkZWJ1ZyBvdXRwdXQuIE5vdCBhbGwgcHJvY2Vzc2VzIHRoYXQgdXNlIHBvcnRzIHdpbGwgcHJpbnQgdG8gdGhlIGludGVncmF0ZWQgdGVybWluYWwgb3IgZGVidWcgY29uc29sZSwgc28gc29tZSBwb3J0cyB3aWxsIGJlIG1pc3NlZC4gUG9ydHMgZm9yd2FyZGVkIGJhc2VkIG9uIG91dHB1dCB3aWxsIG5vdCBiZSBcXFwidW4tZm9yd2FyZGVkXFxcIiB1bnRpbCByZWxvYWQgb3IgdW50aWwgdGhlIHBvcnQgaXMgY2xvc2VkIGJ5IHRoZSB1c2VyIGluIHRoZSBQb3J0cyB2aWV3LlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNTb3VyY2UuaHlicmlkJywgXCJQb3J0cyB3aWxsIGJlIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkIHdoZW4gZGlzY292ZXJlZCBieSByZWFkaW5nIHRlcm1pbmFsIGFuZCBkZWJ1ZyBvdXRwdXQuIE5vdCBhbGwgcHJvY2Vzc2VzIHRoYXQgdXNlIHBvcnRzIHdpbGwgcHJpbnQgdG8gdGhlIGludGVncmF0ZWQgdGVybWluYWwgb3IgZGVidWcgY29uc29sZSwgc28gc29tZSBwb3J0cyB3aWxsIGJlIG1pc3NlZC4gUG9ydHMgd2lsbCBiZSBcXFwidW4tZm9yd2FyZGVkXFxcIiBieSB3YXRjaGluZyBmb3IgcHJvY2Vzc2VzIHRoYXQgbGlzdGVuIG9uIHRoYXQgcG9ydCB0byBiZSB0ZXJtaW5hdGVkLlwiKVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkZWZhdWx0OiAncHJvY2Vzcydcblx0XHRcdH0sXG5cdFx0XHQncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydHNGYWxsYmFjayc6IHtcblx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdGRlZmF1bHQ6IDIwLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLmF1dG9Gb3J3YXJkUG9ydEZhbGxiYWNrJywgXCJUaGUgbnVtYmVyIG9mIGF1dG8gZm9yd2FyZGVkIHBvcnRzIHRoYXQgd2lsbCB0cmlnZ2VyIHRoZSBzd2l0Y2ggZnJvbSBgcHJvY2Vzc2AgdG8gYGh5YnJpZGAgd2hlbiBhdXRvbWF0aWNhbGx5IGZvcndhcmRpbmcgcG9ydHMgYW5kIGByZW1vdGUuYXV0b0ZvcndhcmRQb3J0c1NvdXJjZWAgaXMgc2V0IHRvIGBwcm9jZXNzYCBieSBkZWZhdWx0LiBTZXQgdG8gYDBgIHRvIGRpc2FibGUgdGhlIGZhbGxiYWNrLiBXaGVuIGByZW1vdGUuYXV0b0ZvcndhcmRQb3J0c0ZhbGxiYWNrYCBoYXNuJ3QgYmVlbiBjb25maWd1cmVkLCBidXQgYHJlbW90ZS5hdXRvRm9yd2FyZFBvcnRzU291cmNlYCBoYXMsIGByZW1vdGUuYXV0b0ZvcndhcmRQb3J0c0ZhbGxiYWNrYCB3aWxsIGJlIHRyZWF0ZWQgYXMgdGhvdWdoIGl0J3Mgc2V0IHRvIGAwYC5cIilcblx0XHRcdH0sXG5cdFx0XHQncmVtb3RlLmZvcndhcmRPbk9wZW4nOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUuZm9yd2FyZE9uQ2xpY2snLCBcIkNvbnRyb2xzIHdoZXRoZXIgbG9jYWwgVVJMcyB3aXRoIGEgcG9ydCB3aWxsIGJlIGZvcndhcmRlZCB3aGVuIG9wZW5lZCBmcm9tIHRoZSB0ZXJtaW5hbCBhbmQgdGhlIGRlYnVnIGNvbnNvbGUuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0Ly8gQ29uc2lkZXIgbWFraW5nIGNoYW5nZXMgdG8gZXh0ZW5zaW9uc1xcY29uZmlndXJhdGlvbi1lZGl0aW5nXFxzY2hlbWFzXFxkZXZDb250YWluZXIuc2NoZW1hLnNyYy5qc29uXG5cdFx0XHQvLyBhbmQgZXh0ZW5zaW9uc1xcY29uZmlndXJhdGlvbi1lZGl0aW5nXFxzY2hlbWFzXFxhdHRhY2hDb250YWluZXIuc2NoZW1hLmpzb25cblx0XHRcdC8vIHRvIGtlZXAgaW4gc3luYyB3aXRoIGRldmNvbnRhaW5lci5qc29uIHNjaGVtYS5cblx0XHRcdCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzJzoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHQnKF5cXFxcZCsoLVxcXFxkKyk/JCl8KC4rKSc6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLnBvcnQnLCBcIkEgcG9ydCwgcmFuZ2Ugb2YgcG9ydHMgKGV4LiBcXFwiNDAwMDAtNTUwMDBcXFwiKSwgaG9zdCBhbmQgcG9ydCAoZXguIFxcXCJkYjoxMjM0XFxcIiksIG9yIHJlZ3VsYXIgZXhwcmVzc2lvbiAoZXguIFxcXCIuK1xcXFxcXFxcL3NlcnZlci5qc1xcXCIpLiAgRm9yIGEgcG9ydCBudW1iZXIgb3IgcmFuZ2UsIHRoZSBhdHRyaWJ1dGVzIHdpbGwgYXBwbHkgdG8gdGhhdCBwb3J0IG51bWJlciBvciByYW5nZSBvZiBwb3J0IG51bWJlcnMuIEF0dHJpYnV0ZXMgd2hpY2ggdXNlIGEgcmVndWxhciBleHByZXNzaW9uIHdpbGwgYXBwbHkgdG8gcG9ydHMgd2hvc2UgYXNzb2NpYXRlZCBwcm9jZXNzIGNvbW1hbmQgbGluZSBtYXRjaGVzIHRoZSBleHByZXNzaW9uLlwiKSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0J29uQXV0b0ZvcndhcmQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydub3RpZnknLCAnb3BlbkJyb3dzZXInLCAnb3BlbkJyb3dzZXJPbmNlJywgJ29wZW5QcmV2aWV3JywgJ3NpbGVudCcsICdpZ25vcmUnXSxcblx0XHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5ub3RpZnknLCBcIlNob3dzIGEgbm90aWZpY2F0aW9uIHdoZW4gYSBwb3J0IGlzIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLm9wZW5Ccm93c2VyJywgXCJPcGVucyB0aGUgYnJvd3NlciB3aGVuIHRoZSBwb3J0IGlzIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLiBEZXBlbmRpbmcgb24geW91ciBzZXR0aW5ncywgdGhpcyBjb3VsZCBvcGVuIGFuIGVtYmVkZGVkIGJyb3dzZXIuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMub3BlbkJyb3dzZXJPbmNlJywgXCJPcGVucyB0aGUgYnJvd3NlciB3aGVuIHRoZSBwb3J0IGlzIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLCBidXQgb25seSB0aGUgZmlyc3QgdGltZSB0aGUgcG9ydCBpcyBmb3J3YXJkIGR1cmluZyBhIHNlc3Npb24uIERlcGVuZGluZyBvbiB5b3VyIHNldHRpbmdzLCB0aGlzIGNvdWxkIG9wZW4gYW4gZW1iZWRkZWQgYnJvd3Nlci5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5vcGVuUHJldmlldycsIFwiT3BlbnMgYSBwcmV2aWV3IGluIHRoZSBzYW1lIHdpbmRvdyB3aGVuIHRoZSBwb3J0IGlzIGF1dG9tYXRpY2FsbHkgZm9yd2FyZGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLnNpbGVudCcsIFwiU2hvd3Mgbm8gbm90aWZpY2F0aW9uIGFuZCB0YWtlcyBubyBhY3Rpb24gd2hlbiB0aGlzIHBvcnQgaXMgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMuaWdub3JlJywgXCJUaGlzIHBvcnQgd2lsbCBub3QgYmUgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuXCIpXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMub25Gb3J3YXJkJywgXCJEZWZpbmVzIHRoZSBhY3Rpb24gdGhhdCBvY2N1cnMgd2hlbiB0aGUgcG9ydCBpcyBkaXNjb3ZlcmVkIGZvciBhdXRvbWF0aWMgZm9yd2FyZGluZ1wiKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnbm90aWZ5J1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQnZWxldmF0ZUlmTmVlZGVkJzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMuZWxldmF0ZUlmTmVlZGVkJywgXCJBdXRvbWF0aWNhbGx5IHByb21wdCBmb3IgZWxldmF0aW9uIChpZiBuZWVkZWQpIHdoZW4gdGhpcyBwb3J0IGlzIGZvcndhcmRlZC4gRWxldmF0ZSBpcyByZXF1aXJlZCBpZiB0aGUgbG9jYWwgcG9ydCBpcyBhIHByaXZpbGVnZWQgcG9ydC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0J2xhYmVsJzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5sYWJlbCcsIFwiTGFiZWwgdGhhdCB3aWxsIGJlIHNob3duIGluIHRoZSBVSSBmb3IgdGhpcyBwb3J0LlwiKSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5sYWJlbERlZmF1bHQnLCBcIkFwcGxpY2F0aW9uXCIpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdCdyZXF1aXJlTG9jYWxQb3J0Jzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5yZXF1aXJlTG9jYWxQb3J0JywgXCJXaGVuIHRydWUsIGEgbW9kYWwgZGlhbG9nIHdpbGwgc2hvdyBpZiB0aGUgY2hvc2VuIGxvY2FsIHBvcnQgaXNuJ3QgdXNlZCBmb3IgZm9yd2FyZGluZy5cIiksXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0J3Byb3RvY29sJzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsnaHR0cCcsICdodHRwcyddLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5wcm90b2NvbCcsIFwiVGhlIHByb3RvY29sIHRvIHVzZSB3aGVuIGZvcndhcmRpbmcgdGhpcyBwb3J0LlwiKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdFx0XHQnbGFiZWwnOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5sYWJlbERlZmF1bHQnLCBcIkFwcGxpY2F0aW9uXCIpLFxuXHRcdFx0XHRcdFx0XHQnb25BdXRvRm9yd2FyZCc6ICdub3RpZnknXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcycsIFwiU2V0IHByb3BlcnRpZXMgdGhhdCBhcmUgYXBwbGllZCB3aGVuIGEgc3BlY2lmaWMgcG9ydCBudW1iZXIgaXMgZm9yd2FyZGVkLiBGb3IgZXhhbXBsZTpcXG5cXG5gYGBcXG5cXFwiMzAwMFxcXCI6IHtcXG4gIFxcXCJsYWJlbFxcXCI6IFxcXCJBcHBsaWNhdGlvblxcXCJcXG59LFxcblxcXCI0MDAwMC01NTAwMFxcXCI6IHtcXG4gIFxcXCJvbkF1dG9Gb3J3YXJkXFxcIjogXFxcImlnbm9yZVxcXCJcXG59LFxcblxcXCIuK1xcXFxcXFxcL3NlcnZlci5qc1xcXCI6IHtcXG4gXFxcIm9uQXV0b0ZvcndhcmRcXFwiOiBcXFwib3BlblByZXZpZXdcXFwiXFxufVxcbmBgYFwiKSxcblx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7ICckezE6MzAwMH0nOiB7IGxhYmVsOiAnJHsyOkFwcGxpY2F0aW9ufScsIG9uQXV0b0ZvcndhcmQ6ICdvcGVuUHJldmlldycgfSB9IH1dLFxuXHRcdFx0XHRlcnJvck1lc3NhZ2U6IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLnBhdHRlcm5FcnJvcicsIFwiTXVzdCBiZSBhIHBvcnQgbnVtYmVyLCByYW5nZSBvZiBwb3J0IG51bWJlcnMsIG9yIHJlZ3VsYXIgZXhwcmVzc2lvbi5cIiksXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRcdCc0NDMnOiB7XG5cdFx0XHRcdFx0XHQncHJvdG9jb2wnOiAnaHR0cHMnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnODQ0Myc6IHtcblx0XHRcdFx0XHRcdCdwcm90b2NvbCc6ICdodHRwcydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQncmVtb3RlLm90aGVyUG9ydHNBdHRyaWJ1dGVzJzoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdCdvbkF1dG9Gb3J3YXJkJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRlbnVtOiBbJ25vdGlmeScsICdvcGVuQnJvd3NlcicsICdvcGVuUHJldmlldycsICdzaWxlbnQnLCAnaWdub3JlJ10sXG5cdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLm5vdGlmeScsIFwiU2hvd3MgYSBub3RpZmljYXRpb24gd2hlbiBhIHBvcnQgaXMgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5vcGVuQnJvd3NlcicsIFwiT3BlbnMgdGhlIGJyb3dzZXIgd2hlbiB0aGUgcG9ydCBpcyBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZC4gRGVwZW5kaW5nIG9uIHlvdXIgc2V0dGluZ3MsIHRoaXMgY291bGQgb3BlbiBhbiBlbWJlZGRlZCBicm93c2VyLlwiKSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMub3BlblByZXZpZXcnLCBcIk9wZW5zIGEgcHJldmlldyBpbiB0aGUgc2FtZSB3aW5kb3cgd2hlbiB0aGUgcG9ydCBpcyBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZC5cIiksXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLnNpbGVudCcsIFwiU2hvd3Mgbm8gbm90aWZpY2F0aW9uIGFuZCB0YWtlcyBubyBhY3Rpb24gd2hlbiB0aGlzIHBvcnQgaXMgYXV0b21hdGljYWxseSBmb3J3YXJkZWQuXCIpLFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5pZ25vcmUnLCBcIlRoaXMgcG9ydCB3aWxsIG5vdCBiZSBhdXRvbWF0aWNhbGx5IGZvcndhcmRlZC5cIilcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMub25Gb3J3YXJkJywgXCJEZWZpbmVzIHRoZSBhY3Rpb24gdGhhdCBvY2N1cnMgd2hlbiB0aGUgcG9ydCBpcyBkaXNjb3ZlcmVkIGZvciBhdXRvbWF0aWMgZm9yd2FyZGluZ1wiKSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdub3RpZnknXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnZWxldmF0ZUlmTmVlZGVkJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLmVsZXZhdGVJZk5lZWRlZCcsIFwiQXV0b21hdGljYWxseSBwcm9tcHQgZm9yIGVsZXZhdGlvbiAoaWYgbmVlZGVkKSB3aGVuIHRoaXMgcG9ydCBpcyBmb3J3YXJkZWQuIEVsZXZhdGUgaXMgcmVxdWlyZWQgaWYgdGhlIGxvY2FsIHBvcnQgaXMgYSBwcml2aWxlZ2VkIHBvcnQuXCIpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdCdsYWJlbCc6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLmxhYmVsJywgXCJMYWJlbCB0aGF0IHdpbGwgYmUgc2hvd24gaW4gdGhlIFVJIGZvciB0aGlzIHBvcnQuXCIpLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogbG9jYWxpemUoJ3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMubGFiZWxEZWZhdWx0JywgXCJBcHBsaWNhdGlvblwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3JlcXVpcmVMb2NhbFBvcnQnOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5yZXF1aXJlTG9jYWxQb3J0JywgXCJXaGVuIHRydWUsIGEgbW9kYWwgZGlhbG9nIHdpbGwgc2hvdyBpZiB0aGUgY2hvc2VuIGxvY2FsIHBvcnQgaXNuJ3QgdXNlZCBmb3IgZm9yd2FyZGluZy5cIiksXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J3Byb3RvY29sJzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRlbnVtOiBbJ2h0dHAnLCAnaHR0cHMnXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLnBvcnRzQXR0cmlidXRlcy5wcm90b2NvbCcsIFwiVGhlIHByb3RvY29sIHRvIHVzZSB3aGVuIGZvcndhcmRpbmcgdGhpcyBwb3J0LlwiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IG9uQXV0b0ZvcndhcmQ6ICdpZ25vcmUnIH0gfV0sXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdyZW1vdGUucG9ydHNBdHRyaWJ1dGVzLmRlZmF1bHRzJywgXCJTZXQgZGVmYXVsdCBwcm9wZXJ0aWVzIHRoYXQgYXJlIGFwcGxpZWQgdG8gYWxsIHBvcnRzIHRoYXQgZG9uJ3QgZ2V0IHByb3BlcnRpZXMgZnJvbSB0aGUgc2V0dGluZyB7MH0uIEZvciBleGFtcGxlOlxcblxcbmBgYFxcbntcXG4gIFxcXCJvbkF1dG9Gb3J3YXJkXFxcIjogXFxcImlnbm9yZVxcXCJcXG59XFxuYGBgXCIsICdgI3JlbW90ZS5wb3J0c0F0dHJpYnV0ZXMjYCcpLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHQncmVtb3RlLmxvY2FsUG9ydEhvc3QnOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ2xvY2FsaG9zdCcsICdhbGxJbnRlcmZhY2VzJ10sXG5cdFx0XHRcdGRlZmF1bHQ6ICdsb2NhbGhvc3QnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlbW90ZS5sb2NhbFBvcnRIb3N0JywgXCJTcGVjaWZpZXMgdGhlIGxvY2FsIGhvc3QgbmFtZSB0aGF0IHdpbGwgYmUgdXNlZCBmb3IgcG9ydCBmb3J3YXJkaW5nLlwiKVxuXHRcdFx0fSxcblx0XHRcdFtSRU1PVEVfREVGQVVMVF9JRl9MT0NBTF9FWFRFTlNJT05TXToge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVtb3RlLmRlZmF1bHRFeHRlbnNpb25zSWZJbnN0YWxsZWRMb2NhbGx5Lm1hcmtkb3duRGVzY3JpcHRpb24nLCAnTGlzdCBvZiBleHRlbnNpb25zIHRvIGluc3RhbGwgdXBvbiBjb25uZWN0aW9uIHRvIGEgcmVtb3RlIHdoZW4gYWxyZWFkeSBpbnN0YWxsZWQgbG9jYWxseS4nKSxcblx0XHRcdFx0ZGVmYXVsdDogcHJvZHVjdD8ucmVtb3RlRGVmYXVsdEV4dGVuc2lvbnNJZkluc3RhbGxlZExvY2FsbHkgfHwgW10sXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0cGF0dGVybjogRVhURU5TSU9OX0lERU5USUZJRVJfUEFUVEVSTixcblx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBsb2NhbGl6ZSgncmVtb3RlLmRlZmF1bHRFeHRlbnNpb25zSWZJbnN0YWxsZWRMb2NhbGx5LmludmFsaWRGb3JtYXQnLCAnRXh0ZW5zaW9uIGlkZW50aWZpZXIgbXVzdCBiZSBpbiBmb3JtYXQgXCJwdWJsaXNoZXIubmFtZVwiLicpXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBa0UsZ0JBQWdCLGNBQWMscUJBQXFCLHNDQUFzQztBQUMzSixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMv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
