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
import { Schemas } from "../../../../base/common/network.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { memoize } from "../../../../base/common/decorators.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { parseLineAndColumnAware } from "../../../../base/common/extpath.js";
import { LogLevelToString } from "../../../../platform/log/common/log.js";
import { isUndefined } from "../../../../base/common/types.js";
import { refineServiceDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { EXTENSION_IDENTIFIER_WITH_LOG_REGEX } from "../../../../platform/environment/common/environmentService.js";
const IBrowserWorkbenchEnvironmentService = refineServiceDecorator(IEnvironmentService);
class BrowserWorkbenchEnvironmentService {
  constructor(workspaceId, logsHome, options, productService) {
    this.workspaceId = workspaceId;
    this.logsHome = logsHome;
    this.options = options;
    this.productService = productService;
    this.extensionHostDebugEnvironment = void 0;
    if (options.workspaceProvider && Array.isArray(options.workspaceProvider.payload)) {
      try {
        this.payload = new Map(options.workspaceProvider.payload);
      } catch (error) {
        onUnexpectedError(error);
      }
    }
  }
  get remoteAuthority() {
    return this.options.remoteAuthority;
  }
  get expectsResolverExtension() {
    return !!this.options.remoteAuthority?.includes("+") && !this.options.webSocketFactory;
  }
  get isBuilt() {
    return !!this.productService.commit;
  }
  get logLevel() {
    const logLevelFromPayload = this.payload?.get("logLevel");
    if (logLevelFromPayload) {
      return logLevelFromPayload.split(",").find((entry) => !EXTENSION_IDENTIFIER_WITH_LOG_REGEX.test(entry));
    }
    return this.options.developmentOptions?.logLevel !== void 0 ? LogLevelToString(this.options.developmentOptions?.logLevel) : void 0;
  }
  get extensionLogLevel() {
    const logLevelFromPayload = this.payload?.get("logLevel");
    if (logLevelFromPayload) {
      const result = [];
      for (const entry of logLevelFromPayload.split(",")) {
        const matches = EXTENSION_IDENTIFIER_WITH_LOG_REGEX.exec(entry);
        if (matches?.[1] && matches[2]) {
          result.push([matches[1], matches[2]]);
        }
      }
      return result.length ? result : void 0;
    }
    return this.options.developmentOptions?.extensionLogLevel !== void 0 ? this.options.developmentOptions?.extensionLogLevel.map(([extension, logLevel]) => [extension, LogLevelToString(logLevel)]) : void 0;
  }
  get profDurationMarkers() {
    const profDurationMarkersFromPayload = this.payload?.get("profDurationMarkers");
    if (profDurationMarkersFromPayload) {
      const result = [];
      for (const entry of profDurationMarkersFromPayload.split(",")) {
        result.push(entry);
      }
      return result.length === 2 ? result : void 0;
    }
    return void 0;
  }
  get windowLogsPath() {
    return this.logsHome;
  }
  get logFile() {
    return joinPath(this.windowLogsPath, "window.log");
  }
  get userRoamingDataHome() {
    return URI.file("/User").with({ scheme: Schemas.vscodeUserData });
  }
  get argvResource() {
    return joinPath(this.userRoamingDataHome, "argv.json");
  }
  get cacheHome() {
    return joinPath(this.userRoamingDataHome, "caches");
  }
  get workspaceStorageHome() {
    return joinPath(this.userRoamingDataHome, "workspaceStorage");
  }
  get appSharedDataHome() {
    return joinPath(this.userRoamingDataHome, "sharedData");
  }
  get localHistoryHome() {
    return joinPath(this.userRoamingDataHome, "History");
  }
  get stateResource() {
    return joinPath(this.userRoamingDataHome, "State", "storage.json");
  }
  get userDataSyncHome() {
    return joinPath(this.userRoamingDataHome, "sync", this.workspaceId);
  }
  get sync() {
    return void 0;
  }
  get keyboardLayoutResource() {
    return joinPath(this.userRoamingDataHome, "keyboardLayout.json");
  }
  get untitledWorkspacesHome() {
    return joinPath(this.userRoamingDataHome, "Workspaces");
  }
  get agentSessionsWorkspace() {
    return joinPath(this.userRoamingDataHome, "agent-sessions.code-workspace");
  }
  get serviceMachineIdResource() {
    return joinPath(this.userRoamingDataHome, "machineid");
  }
  get extHostLogsPath() {
    return joinPath(this.logsHome, "exthost");
  }
  get debugExtensionHost() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.params;
  }
  get isExtensionDevelopment() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.isExtensionDevelopment;
  }
  get extensionDevelopmentLocationURI() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.extensionDevelopmentLocationURI;
  }
  get extensionDevelopmentLocationKind() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.extensionDevelopmentKind;
  }
  get extensionTestsLocationURI() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.extensionTestsLocationURI;
  }
  get extensionEnabledProposedApi() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    if (this.extensionHostDebugEnvironment.extensionEnabledProposedApi !== void 0) {
      return this.extensionHostDebugEnvironment.extensionEnabledProposedApi;
    }
    if (this.options.enabledExtensionProposedApi !== void 0) {
      return [...this.options.enabledExtensionProposedApi];
    }
    return void 0;
  }
  get debugRenderer() {
    if (!this.extensionHostDebugEnvironment) {
      this.extensionHostDebugEnvironment = this.resolveExtensionHostDebugEnvironment();
    }
    return this.extensionHostDebugEnvironment.debugRenderer;
  }
  get enableSmokeTestDriver() {
    return this.options.developmentOptions?.enableSmokeTestDriver;
  }
  get disableExtensions() {
    return this.payload?.get("disableExtensions") === "true";
  }
  get enableExtensions() {
    return this.options.enabledExtensions;
  }
  get webviewExternalEndpoint() {
    const endpoint = this.options.webviewEndpoint || this.productService.webviewContentExternalBaseUrlTemplate || "https://{{uuid}}.vscode-cdn.net/{{quality}}/{{commit}}/out/vs/workbench/contrib/webview/browser/pre/";
    const webviewExternalEndpointCommit = this.payload?.get("webviewExternalEndpointCommit");
    return endpoint.replace("{{commit}}", webviewExternalEndpointCommit ?? this.productService.commit ?? "ef65ac1ba57f57f2a3961bfe94aa20481caca4c6").replace("{{quality}}", (webviewExternalEndpointCommit ? "insider" : this.productService.quality) ?? "insider");
  }
  get extensionTelemetryLogResource() {
    return joinPath(this.logsHome, "extensionTelemetry.log");
  }
  get disableTelemetry() {
    return false;
  }
  get disableExperiments() {
    return false;
  }
  get verbose() {
    return this.payload?.get("verbose") === "true";
  }
  get logExtensionHostCommunication() {
    return this.payload?.get("logExtensionHostCommunication") === "true";
  }
  get skipReleaseNotes() {
    return this.payload?.get("skipReleaseNotes") === "true";
  }
  get skipWelcome() {
    return this.payload?.get("skipWelcome") === "true";
  }
  get disableWorkspaceTrust() {
    return !this.options.enableWorkspaceTrust;
  }
  get isSessionsWindow() {
    return this.payload?.get("isSessionsWindow") === "true";
  }
  get profile() {
    return this.payload?.get("profile");
  }
  get editSessionId() {
    return this.options.editSessionId;
  }
  resolveExtensionHostDebugEnvironment() {
    const extensionHostDebugEnvironment = {
      params: {
        port: null,
        break: false
      },
      debugRenderer: false,
      isExtensionDevelopment: false,
      extensionDevelopmentLocationURI: void 0,
      extensionDevelopmentKind: void 0
    };
    if (this.payload) {
      for (const [key, value] of this.payload) {
        switch (key) {
          case "extensionDevelopmentPath":
            if (!extensionHostDebugEnvironment.extensionDevelopmentLocationURI) {
              extensionHostDebugEnvironment.extensionDevelopmentLocationURI = [];
            }
            extensionHostDebugEnvironment.extensionDevelopmentLocationURI.push(URI.parse(value));
            extensionHostDebugEnvironment.isExtensionDevelopment = true;
            break;
          case "extensionDevelopmentKind":
            extensionHostDebugEnvironment.extensionDevelopmentKind = [value];
            break;
          case "extensionTestsPath":
            extensionHostDebugEnvironment.extensionTestsLocationURI = URI.parse(value);
            break;
          case "debugRenderer":
            extensionHostDebugEnvironment.debugRenderer = value === "true";
            break;
          case "debugId":
            extensionHostDebugEnvironment.params.debugId = value;
            break;
          case "inspect-brk-extensions":
            extensionHostDebugEnvironment.params.port = parseInt(value);
            extensionHostDebugEnvironment.params.break = true;
            break;
          case "inspect-extensions":
            extensionHostDebugEnvironment.params.port = parseInt(value);
            break;
          case "extensionEnvironment":
            try {
              extensionHostDebugEnvironment.params.env = JSON.parse(value);
            } catch (error) {
              onUnexpectedError(error);
            }
            break;
          case "enableProposedApi":
            extensionHostDebugEnvironment.extensionEnabledProposedApi = [];
            break;
        }
      }
    }
    const developmentOptions = this.options.developmentOptions;
    if (developmentOptions && !extensionHostDebugEnvironment.isExtensionDevelopment) {
      if (developmentOptions.extensions?.length) {
        extensionHostDebugEnvironment.extensionDevelopmentLocationURI = developmentOptions.extensions.map((e) => URI.revive(e));
        extensionHostDebugEnvironment.isExtensionDevelopment = true;
      }
      if (developmentOptions.extensionTestsPath) {
        extensionHostDebugEnvironment.extensionTestsLocationURI = URI.revive(developmentOptions.extensionTestsPath);
      }
    }
    return extensionHostDebugEnvironment;
  }
  get filesToOpenOrCreate() {
    if (this.payload) {
      const fileToOpen = this.payload.get("openFile");
      if (fileToOpen) {
        const fileUri = URI.parse(fileToOpen);
        if (this.payload.has("gotoLineMode")) {
          const pathColumnAware = parseLineAndColumnAware(fileUri.path);
          return [{
            fileUri: fileUri.with({ path: pathColumnAware.path }),
            options: {
              selection: !isUndefined(pathColumnAware.line) ? { startLineNumber: pathColumnAware.line, startColumn: pathColumnAware.column || 1 } : void 0
            }
          }];
        }
        return [{ fileUri }];
      }
    }
    return void 0;
  }
  get filesToDiff() {
    if (this.payload) {
      const fileToDiffPrimary = this.payload.get("diffFilePrimary");
      const fileToDiffSecondary = this.payload.get("diffFileSecondary");
      if (fileToDiffPrimary && fileToDiffSecondary) {
        return [
          { fileUri: URI.parse(fileToDiffSecondary) },
          { fileUri: URI.parse(fileToDiffPrimary) }
        ];
      }
    }
    return void 0;
  }
  get filesToMerge() {
    if (this.payload) {
      const fileToMerge1 = this.payload.get("mergeFile1");
      const fileToMerge2 = this.payload.get("mergeFile2");
      const fileToMergeBase = this.payload.get("mergeFileBase");
      const fileToMergeResult = this.payload.get("mergeFileResult");
      if (fileToMerge1 && fileToMerge2 && fileToMergeBase && fileToMergeResult) {
        return [
          { fileUri: URI.parse(fileToMerge1) },
          { fileUri: URI.parse(fileToMerge2) },
          { fileUri: URI.parse(fileToMergeBase) },
          { fileUri: URI.parse(fileToMergeResult) }
        ];
      }
    }
    return void 0;
  }
}
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "remoteAuthority", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "expectsResolverExtension", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "isBuilt", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "logLevel", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "windowLogsPath", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "logFile", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "userRoamingDataHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "argvResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "cacheHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "workspaceStorageHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "appSharedDataHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "localHistoryHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "stateResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "userDataSyncHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "sync", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "keyboardLayoutResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "untitledWorkspacesHome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "agentSessionsWorkspace", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "serviceMachineIdResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extHostLogsPath", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "debugExtensionHost", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "isExtensionDevelopment", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionDevelopmentLocationURI", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionDevelopmentLocationKind", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionTestsLocationURI", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionEnabledProposedApi", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "debugRenderer", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "enableSmokeTestDriver", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableExtensions", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "enableExtensions", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "webviewExternalEndpoint", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "extensionTelemetryLogResource", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableTelemetry", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableExperiments", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "verbose", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "logExtensionHostCommunication", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "skipReleaseNotes", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "skipWelcome", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "disableWorkspaceTrust", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "isSessionsWindow", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "profile", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "editSessionId", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToOpenOrCreate", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToDiff", 1);
__decorateClass([
  memoize
], BrowserWorkbenchEnvironmentService.prototype, "filesToMerge", 1);
export {
  BrowserWorkbenchEnvironmentService,
  IBrowserWorkbenchEnvironmentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25LaW5kLCBJRW52aXJvbm1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uSG9zdERlYnVnUGFyYW1zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnN0cnVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dlYi5hcGkuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgcGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IExvZ0xldmVsVG9TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBpc1VuZGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IHJlZmluZVNlcnZpY2VEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTl9JREVOVElGSUVSX1dJVEhfTE9HX1JFR0VYIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSA9IHJlZmluZVNlcnZpY2VEZWNvcmF0b3I8SUVudmlyb25tZW50U2VydmljZSwgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U+KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG4vKipcbiAqIEEgc3ViY2xhc3Mgb2YgdGhlIGBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlYCB0byBiZSB1c2VkIG9ubHkgZW52aXJvbm1lbnRzXG4gKiB3aGVyZSB0aGUgd2ViIEFQSSBpcyBhdmFpbGFibGUgKGJyb3dzZXJzLCBFbGVjdHJvbikuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZXh0ZW5kcyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHtcblxuXHQvKipcblx0ICogT3B0aW9ucyB1c2VkIHRvIGNvbmZpZ3VyZSB0aGUgd29ya2JlbmNoLlxuXHQgKi9cblx0cmVhZG9ubHkgb3B0aW9ucz86IElXb3JrYmVuY2hDb25zdHJ1Y3Rpb25PcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBHZXRzIHdoZXRoZXIgYSByZXNvbHZlciBleHRlbnNpb24gaXMgZXhwZWN0ZWQgZm9yIHRoZSBlbnZpcm9ubWVudC5cblx0ICovXG5cdHJlYWRvbmx5IGV4cGVjdHNSZXNvbHZlckV4dGVuc2lvbjogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgaW1wbGVtZW50cyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0QG1lbW9pemVcblx0Z2V0IHJlbW90ZUF1dGhvcml0eSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5vcHRpb25zLnJlbW90ZUF1dGhvcml0eTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBleHBlY3RzUmVzb2x2ZXJFeHRlbnNpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5vcHRpb25zLnJlbW90ZUF1dGhvcml0eT8uaW5jbHVkZXMoJysnKSAmJiAhdGhpcy5vcHRpb25zLndlYlNvY2tldEZhY3Rvcnk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgaXNCdWlsdCgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQ7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgbG9nTGV2ZWwoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsb2dMZXZlbEZyb21QYXlsb2FkID0gdGhpcy5wYXlsb2FkPy5nZXQoJ2xvZ0xldmVsJyk7XG5cdFx0aWYgKGxvZ0xldmVsRnJvbVBheWxvYWQpIHtcblx0XHRcdHJldHVybiBsb2dMZXZlbEZyb21QYXlsb2FkLnNwbGl0KCcsJykuZmluZChlbnRyeSA9PiAhRVhURU5TSU9OX0lERU5USUZJRVJfV0lUSF9MT0dfUkVHRVgudGVzdChlbnRyeSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuZGV2ZWxvcG1lbnRPcHRpb25zPy5sb2dMZXZlbCAhPT0gdW5kZWZpbmVkID8gTG9nTGV2ZWxUb1N0cmluZyh0aGlzLm9wdGlvbnMuZGV2ZWxvcG1lbnRPcHRpb25zPy5sb2dMZXZlbCkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgZXh0ZW5zaW9uTG9nTGV2ZWwoKTogW3N0cmluZywgc3RyaW5nXVtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsb2dMZXZlbEZyb21QYXlsb2FkID0gdGhpcy5wYXlsb2FkPy5nZXQoJ2xvZ0xldmVsJyk7XG5cdFx0aWYgKGxvZ0xldmVsRnJvbVBheWxvYWQpIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogW3N0cmluZywgc3RyaW5nXVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGxvZ0xldmVsRnJvbVBheWxvYWQuc3BsaXQoJywnKSkge1xuXHRcdFx0XHRjb25zdCBtYXRjaGVzID0gRVhURU5TSU9OX0lERU5USUZJRVJfV0lUSF9MT0dfUkVHRVguZXhlYyhlbnRyeSk7XG5cdFx0XHRcdGlmIChtYXRjaGVzPy5bMV0gJiYgbWF0Y2hlc1syXSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKFttYXRjaGVzWzFdLCBtYXRjaGVzWzJdXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdC5sZW5ndGggPyByZXN1bHQgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5kZXZlbG9wbWVudE9wdGlvbnM/LmV4dGVuc2lvbkxvZ0xldmVsICE9PSB1bmRlZmluZWQgPyB0aGlzLm9wdGlvbnMuZGV2ZWxvcG1lbnRPcHRpb25zPy5leHRlbnNpb25Mb2dMZXZlbC5tYXAoKFtleHRlbnNpb24sIGxvZ0xldmVsXSkgPT4gKFtleHRlbnNpb24sIExvZ0xldmVsVG9TdHJpbmcobG9nTGV2ZWwpXSkpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHByb2ZEdXJhdGlvbk1hcmtlcnMoKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByb2ZEdXJhdGlvbk1hcmtlcnNGcm9tUGF5bG9hZCA9IHRoaXMucGF5bG9hZD8uZ2V0KCdwcm9mRHVyYXRpb25NYXJrZXJzJyk7XG5cdFx0aWYgKHByb2ZEdXJhdGlvbk1hcmtlcnNGcm9tUGF5bG9hZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBwcm9mRHVyYXRpb25NYXJrZXJzRnJvbVBheWxvYWQuc3BsaXQoJywnKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChlbnRyeSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQubGVuZ3RoID09PSAyID8gcmVzdWx0IDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgd2luZG93TG9nc1BhdGgoKTogVVJJIHsgcmV0dXJuIHRoaXMubG9nc0hvbWU7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgbG9nRmlsZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy53aW5kb3dMb2dzUGF0aCwgJ3dpbmRvdy5sb2cnKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCB1c2VyUm9hbWluZ0RhdGFIb21lKCk6IFVSSSB7IHJldHVybiBVUkkuZmlsZSgnL1VzZXInKS53aXRoKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVVzZXJEYXRhIH0pOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGFyZ3ZSZXNvdXJjZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy51c2VyUm9hbWluZ0RhdGFIb21lLCAnYXJndi5qc29uJyk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgY2FjaGVIb21lKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLnVzZXJSb2FtaW5nRGF0YUhvbWUsICdjYWNoZXMnKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCB3b3Jrc3BhY2VTdG9yYWdlSG9tZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy51c2VyUm9hbWluZ0RhdGFIb21lLCAnd29ya3NwYWNlU3RvcmFnZScpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGFwcFNoYXJlZERhdGFIb21lKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLnVzZXJSb2FtaW5nRGF0YUhvbWUsICdzaGFyZWREYXRhJyk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgbG9jYWxIaXN0b3J5SG9tZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy51c2VyUm9hbWluZ0RhdGFIb21lLCAnSGlzdG9yeScpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHN0YXRlUmVzb3VyY2UoKTogVVJJIHsgcmV0dXJuIGpvaW5QYXRoKHRoaXMudXNlclJvYW1pbmdEYXRhSG9tZSwgJ1N0YXRlJywgJ3N0b3JhZ2UuanNvbicpOyB9XG5cblx0LyoqXG5cdCAqIEluIFdlYiBldmVyeSB3b3Jrc3BhY2UgY2FuIHBvdGVudGlhbGx5IGhhdmUgc2NvcGVkIHVzZXItZGF0YVxuXHQgKiBhbmQvb3IgZXh0ZW5zaW9ucyBhbmQgaWYgU3luYyBzdGF0ZSBpcyBzaGFyZWQgdGhlbiBpdCBjYW4gbWFrZVxuXHQgKiBTeW5jIGVycm9yIHByb25lIC0gc2F5IHJlbW92aW5nIGV4dGVuc2lvbnMgZnJvbSBhbm90aGVyIHdvcmtzcGFjZS5cblx0ICogSGVuY2Ugc2NvcGUgU3luYyBzdGF0ZSBwZXIgd29ya3NwYWNlLiBTeW5jIHNjb3BlZCB0byBhIHdvcmtzcGFjZVxuXHQgKiBpcyBjYXBhYmxlIG9mIGhhbmRsaW5nIG9wZW5pbmcgc2FtZSB3b3Jrc3BhY2UgaW4gbXVsdGlwbGUgd2luZG93cy5cblx0ICovXG5cdEBtZW1vaXplXG5cdGdldCB1c2VyRGF0YVN5bmNIb21lKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLnVzZXJSb2FtaW5nRGF0YUhvbWUsICdzeW5jJywgdGhpcy53b3Jrc3BhY2VJZCk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgc3luYygpOiAnb24nIHwgJ29mZicgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGtleWJvYXJkTGF5b3V0UmVzb3VyY2UoKTogVVJJIHsgcmV0dXJuIGpvaW5QYXRoKHRoaXMudXNlclJvYW1pbmdEYXRhSG9tZSwgJ2tleWJvYXJkTGF5b3V0Lmpzb24nKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCB1bnRpdGxlZFdvcmtzcGFjZXNIb21lKCk6IFVSSSB7IHJldHVybiBqb2luUGF0aCh0aGlzLnVzZXJSb2FtaW5nRGF0YUhvbWUsICdXb3Jrc3BhY2VzJyk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgYWdlbnRTZXNzaW9uc1dvcmtzcGFjZSgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy51c2VyUm9hbWluZ0RhdGFIb21lLCAnYWdlbnQtc2Vzc2lvbnMuY29kZS13b3Jrc3BhY2UnKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBzZXJ2aWNlTWFjaGluZUlkUmVzb3VyY2UoKTogVVJJIHsgcmV0dXJuIGpvaW5QYXRoKHRoaXMudXNlclJvYW1pbmdEYXRhSG9tZSwgJ21hY2hpbmVpZCcpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGV4dEhvc3RMb2dzUGF0aCgpOiBVUkkgeyByZXR1cm4gam9pblBhdGgodGhpcy5sb2dzSG9tZSwgJ2V4dGhvc3QnKTsgfVxuXG5cdHByaXZhdGUgZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQ6IElFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRAbWVtb2l6ZVxuXHRnZXQgZGVidWdFeHRlbnNpb25Ib3N0KCk6IElFeHRlbnNpb25Ib3N0RGVidWdQYXJhbXMge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCA9IHRoaXMucmVzb2x2ZUV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQucGFyYW1zO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50ID0gdGhpcy5yZXNvbHZlRXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5pc0V4dGVuc2lvbkRldmVsb3BtZW50O1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkkoKTogVVJJW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCA9IHRoaXMucmVzb2x2ZUV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCBleHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uS2luZCgpOiBFeHRlbnNpb25LaW5kW10gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCkge1xuXHRcdFx0dGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCA9IHRoaXMucmVzb2x2ZUV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRLaW5kO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQgPSB0aGlzLnJlc29sdmVFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZXh0ZW5zaW9uRW5hYmxlZFByb3Bvc2VkQXBpKCk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQpIHtcblx0XHRcdHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQgPSB0aGlzLnJlc29sdmVFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmV4dGVuc2lvbkVuYWJsZWRQcm9wb3NlZEFwaSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25FbmFibGVkUHJvcG9zZWRBcGk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5lbmFibGVkRXh0ZW5zaW9uUHJvcG9zZWRBcGkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIFsuLi50aGlzLm9wdGlvbnMuZW5hYmxlZEV4dGVuc2lvblByb3Bvc2VkQXBpXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGRlYnVnUmVuZGVyZXIoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50KSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50ID0gdGhpcy5yZXNvbHZlRXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5kZWJ1Z1JlbmRlcmVyO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGVuYWJsZVNtb2tlVGVzdERyaXZlcigpIHsgcmV0dXJuIHRoaXMub3B0aW9ucy5kZXZlbG9wbWVudE9wdGlvbnM/LmVuYWJsZVNtb2tlVGVzdERyaXZlcjsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBkaXNhYmxlRXh0ZW5zaW9ucygpIHsgcmV0dXJuIHRoaXMucGF5bG9hZD8uZ2V0KCdkaXNhYmxlRXh0ZW5zaW9ucycpID09PSAndHJ1ZSc7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZW5hYmxlRXh0ZW5zaW9ucygpIHsgcmV0dXJuIHRoaXMub3B0aW9ucy5lbmFibGVkRXh0ZW5zaW9uczsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCB3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGVuZHBvaW50ID0gdGhpcy5vcHRpb25zLndlYnZpZXdFbmRwb2ludFxuXHRcdFx0fHwgdGhpcy5wcm9kdWN0U2VydmljZS53ZWJ2aWV3Q29udGVudEV4dGVybmFsQmFzZVVybFRlbXBsYXRlXG5cdFx0XHR8fCAnaHR0cHM6Ly97e3V1aWR9fS52c2NvZGUtY2RuLm5ldC97e3F1YWxpdHl9fS97e2NvbW1pdH19L291dC92cy93b3JrYmVuY2gvY29udHJpYi93ZWJ2aWV3L2Jyb3dzZXIvcHJlLyc7XG5cblx0XHRjb25zdCB3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludENvbW1pdCA9IHRoaXMucGF5bG9hZD8uZ2V0KCd3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludENvbW1pdCcpO1xuXHRcdHJldHVybiBlbmRwb2ludFxuXHRcdFx0LnJlcGxhY2UoJ3t7Y29tbWl0fX0nLCB3ZWJ2aWV3RXh0ZXJuYWxFbmRwb2ludENvbW1pdCA/PyB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCA/PyAnZWY2NWFjMWJhNTdmNTdmMmEzOTYxYmZlOTRhYTIwNDgxY2FjYTRjNicpXG5cdFx0XHQucmVwbGFjZSgne3txdWFsaXR5fX0nLCAod2Vidmlld0V4dGVybmFsRW5kcG9pbnRDb21taXQgPyAnaW5zaWRlcicgOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkpID8/ICdpbnNpZGVyJyk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZXh0ZW5zaW9uVGVsZW1ldHJ5TG9nUmVzb3VyY2UoKTogVVJJIHsgcmV0dXJuIGpvaW5QYXRoKHRoaXMubG9nc0hvbWUsICdleHRlbnNpb25UZWxlbWV0cnkubG9nJyk7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZGlzYWJsZVRlbGVtZXRyeSgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGRpc2FibGVFeHBlcmltZW50cygpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHZlcmJvc2UoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnBheWxvYWQ/LmdldCgndmVyYm9zZScpID09PSAndHJ1ZSc7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgbG9nRXh0ZW5zaW9uSG9zdENvbW11bmljYXRpb24oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnBheWxvYWQ/LmdldCgnbG9nRXh0ZW5zaW9uSG9zdENvbW11bmljYXRpb24nKSA9PT0gJ3RydWUnOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHNraXBSZWxlYXNlTm90ZXMoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnBheWxvYWQ/LmdldCgnc2tpcFJlbGVhc2VOb3RlcycpID09PSAndHJ1ZSc7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgc2tpcFdlbGNvbWUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnBheWxvYWQ/LmdldCgnc2tpcFdlbGNvbWUnKSA9PT0gJ3RydWUnOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGRpc2FibGVXb3Jrc3BhY2VUcnVzdCgpOiBib29sZWFuIHsgcmV0dXJuICF0aGlzLm9wdGlvbnMuZW5hYmxlV29ya3NwYWNlVHJ1c3Q7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgaXNTZXNzaW9uc1dpbmRvdygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMucGF5bG9hZD8uZ2V0KCdpc1Nlc3Npb25zV2luZG93JykgPT09ICd0cnVlJzsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBwcm9maWxlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLnBheWxvYWQ/LmdldCgncHJvZmlsZScpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGVkaXRTZXNzaW9uSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMub3B0aW9ucy5lZGl0U2Vzc2lvbklkOyB9XG5cblx0cHJpdmF0ZSBwYXlsb2FkOiBNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlSWQ6IHN0cmluZyxcblx0XHRyZWFkb25seSBsb2dzSG9tZTogVVJJLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IElXb3JrYmVuY2hDb25zdHJ1Y3Rpb25PcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZVxuXHQpIHtcblx0XHRpZiAob3B0aW9ucy53b3Jrc3BhY2VQcm92aWRlciAmJiBBcnJheS5pc0FycmF5KG9wdGlvbnMud29ya3NwYWNlUHJvdmlkZXIucGF5bG9hZCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMucGF5bG9hZCA9IG5ldyBNYXAob3B0aW9ucy53b3Jrc3BhY2VQcm92aWRlci5wYXlsb2FkKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycm9yKTsgLy8gcG9zc2libGUgaW52YWxpZCBwYXlsb2FkIGZvciBtYXBcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVFeHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudCgpOiBJRXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQge1xuXHRcdGNvbnN0IGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50OiBJRXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQgPSB7XG5cdFx0XHRwYXJhbXM6IHtcblx0XHRcdFx0cG9ydDogbnVsbCxcblx0XHRcdFx0YnJlYWs6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0ZGVidWdSZW5kZXJlcjogZmFsc2UsXG5cdFx0XHRpc0V4dGVuc2lvbkRldmVsb3BtZW50OiBmYWxzZSxcblx0XHRcdGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkk6IHVuZGVmaW5lZCxcblx0XHRcdGV4dGVuc2lvbkRldmVsb3BtZW50S2luZDogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdC8vIEZpbGwgaW4gc2VsZWN0ZWQgZXh0cmEgZW52aXJvbm1lbnRhbCBwcm9wZXJ0aWVzXG5cdFx0aWYgKHRoaXMucGF5bG9hZCkge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgdGhpcy5wYXlsb2FkKSB7XG5cdFx0XHRcdHN3aXRjaCAoa2V5KSB7XG5cdFx0XHRcdFx0Y2FzZSAnZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoJzpcblx0XHRcdFx0XHRcdGlmICghZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSkge1xuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJID0gW107XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJLnB1c2goVVJJLnBhcnNlKHZhbHVlKSk7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5pc0V4dGVuc2lvbkRldmVsb3BtZW50ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2V4dGVuc2lvbkRldmVsb3BtZW50S2luZCc6XG5cdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5leHRlbnNpb25EZXZlbG9wbWVudEtpbmQgPSBbPEV4dGVuc2lvbktpbmQ+dmFsdWVdO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZXh0ZW5zaW9uVGVzdHNQYXRoJzpcblx0XHRcdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LmV4dGVuc2lvblRlc3RzTG9jYXRpb25VUkkgPSBVUkkucGFyc2UodmFsdWUpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZGVidWdSZW5kZXJlcic6XG5cdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5kZWJ1Z1JlbmRlcmVyID0gdmFsdWUgPT09ICd0cnVlJztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2RlYnVnSWQnOlxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQucGFyYW1zLmRlYnVnSWQgPSB2YWx1ZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2luc3BlY3QtYnJrLWV4dGVuc2lvbnMnOlxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQucGFyYW1zLnBvcnQgPSBwYXJzZUludCh2YWx1ZSk7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5wYXJhbXMuYnJlYWsgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnaW5zcGVjdC1leHRlbnNpb25zJzpcblx0XHRcdFx0XHRcdGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50LnBhcmFtcy5wb3J0ID0gcGFyc2VJbnQodmFsdWUpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZXh0ZW5zaW9uRW52aXJvbm1lbnQnOlxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQucGFyYW1zLmVudiA9IEpTT04ucGFyc2UodmFsdWUpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnZW5hYmxlUHJvcG9zZWRBcGknOlxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uRW5hYmxlZFByb3Bvc2VkQXBpID0gW107XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGRldmVsb3BtZW50T3B0aW9ucyA9IHRoaXMub3B0aW9ucy5kZXZlbG9wbWVudE9wdGlvbnM7XG5cdFx0aWYgKGRldmVsb3BtZW50T3B0aW9ucyAmJiAhZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuaXNFeHRlbnNpb25EZXZlbG9wbWVudCkge1xuXHRcdFx0aWYgKGRldmVsb3BtZW50T3B0aW9ucy5leHRlbnNpb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSA9IGRldmVsb3BtZW50T3B0aW9ucy5leHRlbnNpb25zLm1hcChlID0+IFVSSS5yZXZpdmUoZSkpO1xuXHRcdFx0XHRleHRlbnNpb25Ib3N0RGVidWdFbnZpcm9ubWVudC5pc0V4dGVuc2lvbkRldmVsb3BtZW50ID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRldmVsb3BtZW50T3B0aW9ucy5leHRlbnNpb25UZXN0c1BhdGgpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQuZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSSSA9IFVSSS5yZXZpdmUoZGV2ZWxvcG1lbnRPcHRpb25zLmV4dGVuc2lvblRlc3RzUGF0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4dGVuc2lvbkhvc3REZWJ1Z0Vudmlyb25tZW50O1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGZpbGVzVG9PcGVuT3JDcmVhdGUoKTogSVBhdGg8SVRleHRFZGl0b3JPcHRpb25zPltdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5wYXlsb2FkKSB7XG5cdFx0XHRjb25zdCBmaWxlVG9PcGVuID0gdGhpcy5wYXlsb2FkLmdldCgnb3BlbkZpbGUnKTtcblx0XHRcdGlmIChmaWxlVG9PcGVuKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkucGFyc2UoZmlsZVRvT3Blbik7XG5cblx0XHRcdFx0Ly8gU3VwcG9ydDogLS1nb3RvIHBhcmFtZXRlciB0byBvcGVuIG9uIGxpbmUvY29sXG5cdFx0XHRcdGlmICh0aGlzLnBheWxvYWQuaGFzKCdnb3RvTGluZU1vZGUnKSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhdGhDb2x1bW5Bd2FyZSA9IHBhcnNlTGluZUFuZENvbHVtbkF3YXJlKGZpbGVVcmkucGF0aCk7XG5cblx0XHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRcdGZpbGVVcmk6IGZpbGVVcmkud2l0aCh7IHBhdGg6IHBhdGhDb2x1bW5Bd2FyZS5wYXRoIH0pLFxuXHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb246ICFpc1VuZGVmaW5lZChwYXRoQ29sdW1uQXdhcmUubGluZSkgPyB7IHN0YXJ0TGluZU51bWJlcjogcGF0aENvbHVtbkF3YXJlLmxpbmUsIHN0YXJ0Q29sdW1uOiBwYXRoQ29sdW1uQXdhcmUuY29sdW1uIHx8IDEgfSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFt7IGZpbGVVcmkgfV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCBmaWxlc1RvRGlmZigpOiBJUGF0aFtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5wYXlsb2FkKSB7XG5cdFx0XHRjb25zdCBmaWxlVG9EaWZmUHJpbWFyeSA9IHRoaXMucGF5bG9hZC5nZXQoJ2RpZmZGaWxlUHJpbWFyeScpO1xuXHRcdFx0Y29uc3QgZmlsZVRvRGlmZlNlY29uZGFyeSA9IHRoaXMucGF5bG9hZC5nZXQoJ2RpZmZGaWxlU2Vjb25kYXJ5Jyk7XG5cdFx0XHRpZiAoZmlsZVRvRGlmZlByaW1hcnkgJiYgZmlsZVRvRGlmZlNlY29uZGFyeSkge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdHsgZmlsZVVyaTogVVJJLnBhcnNlKGZpbGVUb0RpZmZTZWNvbmRhcnkpIH0sXG5cdFx0XHRcdFx0eyBmaWxlVXJpOiBVUkkucGFyc2UoZmlsZVRvRGlmZlByaW1hcnkpIH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IGZpbGVzVG9NZXJnZSgpOiBJUGF0aFtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5wYXlsb2FkKSB7XG5cdFx0XHRjb25zdCBmaWxlVG9NZXJnZTEgPSB0aGlzLnBheWxvYWQuZ2V0KCdtZXJnZUZpbGUxJyk7XG5cdFx0XHRjb25zdCBmaWxlVG9NZXJnZTIgPSB0aGlzLnBheWxvYWQuZ2V0KCdtZXJnZUZpbGUyJyk7XG5cdFx0XHRjb25zdCBmaWxlVG9NZXJnZUJhc2UgPSB0aGlzLnBheWxvYWQuZ2V0KCdtZXJnZUZpbGVCYXNlJyk7XG5cdFx0XHRjb25zdCBmaWxlVG9NZXJnZVJlc3VsdCA9IHRoaXMucGF5bG9hZC5nZXQoJ21lcmdlRmlsZVJlc3VsdCcpO1xuXHRcdFx0aWYgKGZpbGVUb01lcmdlMSAmJiBmaWxlVG9NZXJnZTIgJiYgZmlsZVRvTWVyZ2VCYXNlICYmIGZpbGVUb01lcmdlUmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0eyBmaWxlVXJpOiBVUkkucGFyc2UoZmlsZVRvTWVyZ2UxKSB9LFxuXHRcdFx0XHRcdHsgZmlsZVVyaTogVVJJLnBhcnNlKGZpbGVUb01lcmdlMikgfSxcblx0XHRcdFx0XHR7IGZpbGVVcmk6IFVSSS5wYXJzZShmaWxlVG9NZXJnZUJhc2UpIH0sXG5cdFx0XHRcdFx0eyBmaWxlVXJpOiBVUkkucGFyc2UoZmlsZVRvTWVyZ2VSZXN1bHQpIH1cblx0XHRcdFx0XTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uSG9zdERlYnVnRW52aXJvbm1lbnQge1xuXHRwYXJhbXM6IElFeHRlbnNpb25Ib3N0RGVidWdQYXJhbXM7XG5cdGRlYnVnUmVuZGVyZXI6IGJvb2xlYW47XG5cdGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQ6IGJvb2xlYW47XG5cdGV4dGVuc2lvbkRldmVsb3BtZW50TG9jYXRpb25VUkk/OiBVUklbXTtcblx0ZXh0ZW5zaW9uRGV2ZWxvcG1lbnRLaW5kPzogRXh0ZW5zaW9uS2luZFtdO1xuXHRleHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJPzogVVJJO1xuXHRleHRlbnNpb25FbmFibGVkUHJvcG9zZWRBcGk/OiBzdHJpbmdbXTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQXdCLDJCQUFzRDtBQUs5RSxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUywyQ0FBMkM7QUFFN0MsTUFBTSxzQ0FBc0MsdUJB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
