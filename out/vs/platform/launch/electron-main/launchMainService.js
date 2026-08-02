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
import { app } from "electron";
import { coalesce } from "../../../base/common/arrays.js";
import { isMacintosh } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import { whenDeleted } from "../../../base/node/pfs.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { isLaunchedFromCli } from "../../environment/node/argvHelper.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IURLService } from "../../url/common/url.js";
import { IWindowsMainService, OpenContext } from "../../windows/electron-main/windows.js";
const ID = "launchMainService";
const ILaunchMainService = createDecorator(ID);
let LaunchMainService = class {
  constructor(logService, windowsMainService, urlService, configurationService) {
    this.logService = logService;
    this.windowsMainService = windowsMainService;
    this.urlService = urlService;
    this.configurationService = configurationService;
  }
  async start(args, userEnv) {
    this.logService.trace("Received data from other instance: ", args, userEnv);
    if (isMacintosh) {
      app.focus({ steal: true });
    }
    const urlsToOpen = this.parseOpenUrl(args);
    if (urlsToOpen.length) {
      let whenWindowReady = Promise.resolve();
      if (this.windowsMainService.getWindowCount() === 0) {
        const window = (await this.windowsMainService.openEmptyWindow({ context: OpenContext.DESKTOP })).at(0);
        if (window) {
          whenWindowReady = window.ready();
        }
      }
      whenWindowReady.then(() => {
        for (const { uri, originalUrl } of urlsToOpen) {
          this.urlService.open(uri, { originalUrl });
        }
      });
    } else {
      return this.startOpenWindow(args, userEnv);
    }
  }
  parseOpenUrl(args) {
    if (args["open-url"] && args._urls && args._urls.length > 0) {
      return coalesce(args._urls.map((url) => {
        try {
          return { uri: URI.parse(url), originalUrl: url };
        } catch (err) {
          return null;
        }
      }));
    }
    return [];
  }
  async startOpenWindow(args, userEnv) {
    const context = isLaunchedFromCli(userEnv) ? OpenContext.CLI : OpenContext.DESKTOP;
    let usedWindows = [];
    const waitMarkerFileURI = args.wait && args.waitMarkerFilePath ? URI.file(args.waitMarkerFilePath) : void 0;
    const remoteAuthority = args.remote || void 0;
    const baseConfig = {
      context,
      cli: args,
      /**
       * When opening a new window from a second instance that sent args and env
       * over to this instance, we want to preserve the environment only if that second
       * instance was spawned from the CLI or used the `--preserve-env` flag (example:
       * when using `open -n "VSCode.app" --args --preserve-env WORKSPACE_FOLDER`).
       *
       * This is done to ensure that the second window gets treated exactly the same
       * as the first window, for example, it gets the same resolved user shell environment.
       *
       * https://github.com/microsoft/vscode/issues/194736
       */
      userEnv: args["preserve-env"] || context === OpenContext.CLI ? userEnv : void 0,
      waitMarkerFileURI,
      remoteAuthority,
      forceProfile: args.profile,
      forceTempProfile: args["profile-temp"]
    };
    if (args.extensionDevelopmentPath) {
      await this.windowsMainService.openExtensionDevelopmentHostWindow(args.extensionDevelopmentPath, baseConfig);
    } else if (args["agents"]) {
      usedWindows = await this.windowsMainService.openAgentsWindow(baseConfig);
    } else if (!args._.length && !args["folder-uri"] && !args["file-uri"]) {
      let openNewWindow = false;
      if (args["new-window"] || baseConfig.forceProfile || baseConfig.forceTempProfile) {
        openNewWindow = true;
      } else if (args["reuse-window"]) {
        openNewWindow = false;
      } else {
        const windowConfig = this.configurationService.getValue("window");
        const openWithoutArgumentsInNewWindowConfig = windowConfig?.openWithoutArgumentsInNewWindow || "default";
        switch (openWithoutArgumentsInNewWindowConfig) {
          case "on":
            openNewWindow = true;
            break;
          case "off":
            openNewWindow = false;
            break;
          default:
            openNewWindow = !isMacintosh;
        }
      }
      if (openNewWindow) {
        usedWindows = await this.windowsMainService.open({
          ...baseConfig,
          forceNewWindow: true,
          forceEmpty: true
        });
      } else {
        const lastActive = this.windowsMainService.getLastActiveWindow();
        if (lastActive) {
          this.windowsMainService.openExistingWindow(lastActive, baseConfig);
          usedWindows = [lastActive];
        } else {
          usedWindows = await this.windowsMainService.open({
            ...baseConfig,
            forceEmpty: true
          });
        }
      }
    } else {
      usedWindows = await this.windowsMainService.open({
        ...baseConfig,
        forceNewWindow: args["new-window"],
        preferNewWindow: !args["reuse-window"] && !args.wait,
        forceReuseWindow: args["reuse-window"],
        diffMode: args.diff,
        mergeMode: args.merge,
        addMode: args.add,
        removeMode: args.remove,
        noRecentEntry: !!args["skip-add-to-recently-opened"],
        gotoLineMode: args.goto
      });
    }
    if (waitMarkerFileURI && usedWindows.length === 1 && usedWindows[0]) {
      return Promise.race([
        usedWindows[0].whenClosedOrLoaded,
        whenDeleted(waitMarkerFileURI.fsPath)
      ]).then(() => void 0, () => void 0);
    }
  }
  async getMainProcessId() {
    this.logService.trace("Received request for process ID from other instance.");
    return process.pid;
  }
};
LaunchMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IWindowsMainService),
  __decorateParam(2, IURLService),
  __decorateParam(3, IConfigurationService)
], LaunchMainService);
export {
  ID,
  ILaunchMainService,
  LaunchMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xhdW5jaC9lbGVjdHJvbi1tYWluL2xhdW5jaE1haW5TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXBwIH0gZnJvbSAnZWxlY3Ryb24nO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgd2hlbkRlbGV0ZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTmF0aXZlUGFyc2VkQXJncyB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9hcmd2LmpzJztcbmltcG9ydCB7IGlzTGF1bmNoZWRGcm9tQ2xpIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvbm9kZS9hcmd2SGVscGVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVVJMU2VydmljZSB9IGZyb20gJy4uLy4uL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IElDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vd2luZG93L2VsZWN0cm9uLW1haW4vd2luZG93LmpzJztcbmltcG9ydCB7IElXaW5kb3dTZXR0aW5ncyB9IGZyb20gJy4uLy4uL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IElPcGVuQ29uZmlndXJhdGlvbiwgSVdpbmRvd3NNYWluU2VydmljZSwgT3BlbkNvbnRleHQgfSBmcm9tICcuLi8uLi93aW5kb3dzL2VsZWN0cm9uLW1haW4vd2luZG93cy5qcyc7XG5pbXBvcnQgeyBJUHJvdG9jb2xVcmwgfSBmcm9tICcuLi8uLi91cmwvZWxlY3Ryb24tbWFpbi91cmwuanMnO1xuXG5leHBvcnQgY29uc3QgSUQgPSAnbGF1bmNoTWFpblNlcnZpY2UnO1xuZXhwb3J0IGNvbnN0IElMYXVuY2hNYWluU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJTGF1bmNoTWFpblNlcnZpY2U+KElEKTtcblxuZXhwb3J0IGludGVyZmFjZSBJU3RhcnRBcmd1bWVudHMge1xuXHRyZWFkb25seSBhcmdzOiBOYXRpdmVQYXJzZWRBcmdzO1xuXHRyZWFkb25seSB1c2VyRW52OiBJUHJvY2Vzc0Vudmlyb25tZW50O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMYXVuY2hNYWluU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHN0YXJ0KGFyZ3M6IE5hdGl2ZVBhcnNlZEFyZ3MsIHVzZXJFbnY6IElQcm9jZXNzRW52aXJvbm1lbnQpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdGdldE1haW5Qcm9jZXNzSWQoKTogUHJvbWlzZTxudW1iZXI+O1xufVxuXG5leHBvcnQgY2xhc3MgTGF1bmNoTWFpblNlcnZpY2UgaW1wbGVtZW50cyBJTGF1bmNoTWFpblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV2luZG93c01haW5TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2luZG93c01haW5TZXJ2aWNlOiBJV2luZG93c01haW5TZXJ2aWNlLFxuXHRcdEBJVVJMU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVybFNlcnZpY2U6IElVUkxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHN0YXJ0KGFyZ3M6IE5hdGl2ZVBhcnNlZEFyZ3MsIHVzZXJFbnY6IElQcm9jZXNzRW52aXJvbm1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1JlY2VpdmVkIGRhdGEgZnJvbSBvdGhlciBpbnN0YW5jZTogJywgYXJncywgdXNlckVudik7XG5cblx0XHQvLyBtYWNPUzogRWxlY3Ryb24gPiA3LnggY2hhbmdlZCBpdHMgYmVoYXZpb3VyIHRvIG5vdFxuXHRcdC8vIGJyaW5nIHRoZSBhcHBsaWNhdGlvbiB0byB0aGUgZm9yZWdyb3VuZCB3aGVuIGEgd2luZG93XG5cdFx0Ly8gaXMgZm9jdXNlZCBwcm9ncmFtbWF0aWNhbGx5LiBPbmx5IHZpYSBgYXBwLmZvY3VzYCBhbmRcblx0XHQvLyB0aGUgb3B0aW9uIGBzdGVhbDogdHJ1ZWAgY2FuIHlvdSBnZXQgdGhlIHByZXZpb3VzXG5cdFx0Ly8gYmVoYXZpb3VyIGJhY2suIFRoZSBvbmx5IHJlYXNvbiB0byB1c2UgdGhpcyBvcHRpb24gaXNcblx0XHQvLyB3aGVuIGEgd2luZG93IGlzIGdldHRpbmcgZm9jdXNlZCB3aGlsZSB0aGUgYXBwbGljYXRpb25cblx0XHQvLyBpcyBub3QgaW4gdGhlIGZvcmVncm91bmQgYW5kIHNpbmNlIHdlIGdvdCBpbnN0cnVjdGVkXG5cdFx0Ly8gdG8gb3BlbiBhIG5ldyB3aW5kb3cgZnJvbSBhbm90aGVyIGluc3RhbmNlLCB3ZSBlbnN1cmVcblx0XHQvLyB0aGF0IHRoZSBhcHAgaGFzIGZvY3VzLlxuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0YXBwLmZvY3VzKHsgc3RlYWw6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZWFybHkgZm9yIG9wZW4tdXJsIHdoaWNoIGlzIGhhbmRsZWQgaW4gVVJMIHNlcnZpY2Vcblx0XHRjb25zdCB1cmxzVG9PcGVuID0gdGhpcy5wYXJzZU9wZW5VcmwoYXJncyk7XG5cdFx0aWYgKHVybHNUb09wZW4ubGVuZ3RoKSB7XG5cdFx0XHRsZXQgd2hlbldpbmRvd1JlYWR5OiBQcm9taXNlPHVua25vd24+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdC8vIENyZWF0ZSBhIHdpbmRvdyBpZiB0aGVyZSBpcyBub25lXG5cdFx0XHRpZiAodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA9PT0gMCkge1xuXHRcdFx0XHRjb25zdCB3aW5kb3cgPSAoYXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3BlbkVtcHR5V2luZG93KHsgY29udGV4dDogT3BlbkNvbnRleHQuREVTS1RPUCB9KSkuYXQoMCk7XG5cdFx0XHRcdGlmICh3aW5kb3cpIHtcblx0XHRcdFx0XHR3aGVuV2luZG93UmVhZHkgPSB3aW5kb3cucmVhZHkoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgYSB3aW5kb3cgaXMgb3BlbiwgcmVhZHkgdG8gcmVjZWl2ZSB0aGUgdXJsIGV2ZW50XG5cdFx0XHR3aGVuV2luZG93UmVhZHkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgeyB1cmksIG9yaWdpbmFsVXJsIH0gb2YgdXJsc1RvT3Blbikge1xuXHRcdFx0XHRcdHRoaXMudXJsU2VydmljZS5vcGVuKHVyaSwgeyBvcmlnaW5hbFVybCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGhhbmRsZSBpbiB3aW5kb3dzIHNlcnZpY2Vcblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLnN0YXJ0T3BlbldpbmRvdyhhcmdzLCB1c2VyRW52KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlT3BlblVybChhcmdzOiBOYXRpdmVQYXJzZWRBcmdzKTogSVByb3RvY29sVXJsW10ge1xuXHRcdGlmIChhcmdzWydvcGVuLXVybCddICYmIGFyZ3MuX3VybHMgJiYgYXJncy5fdXJscy5sZW5ndGggPiAwKSB7XG5cblx0XHRcdC8vIC0tb3Blbi11cmwgbXVzdCBjb250YWluIC0tIGZvbGxvd2VkIGJ5IHRoZSB1cmwocylcblx0XHRcdC8vIHByb2Nlc3MuYXJndiBpcyB1c2VkIG92ZXIgYXJncy5fIGFzIGFyZ3MuXyBhcmUgcmVzb2x2ZWQgdG8gZmlsZSBwYXRocyBhdCB0aGlzIHBvaW50XG5cblx0XHRcdHJldHVybiBjb2FsZXNjZShhcmdzLl91cmxzXG5cdFx0XHRcdC5tYXAodXJsID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgdXJpOiBVUkkucGFyc2UodXJsKSwgb3JpZ2luYWxVcmw6IHVybCB9O1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzdGFydE9wZW5XaW5kb3coYXJnczogTmF0aXZlUGFyc2VkQXJncywgdXNlckVudjogSVByb2Nlc3NFbnZpcm9ubWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBpc0xhdW5jaGVkRnJvbUNsaSh1c2VyRW52KSA/IE9wZW5Db250ZXh0LkNMSSA6IE9wZW5Db250ZXh0LkRFU0tUT1A7XG5cblx0XHRsZXQgdXNlZFdpbmRvd3M6IElDb2RlV2luZG93W10gPSBbXTtcblxuXHRcdGNvbnN0IHdhaXRNYXJrZXJGaWxlVVJJID0gYXJncy53YWl0ICYmIGFyZ3Mud2FpdE1hcmtlckZpbGVQYXRoID8gVVJJLmZpbGUoYXJncy53YWl0TWFya2VyRmlsZVBhdGgpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlbW90ZUF1dGhvcml0eSA9IGFyZ3MucmVtb3RlIHx8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGJhc2VDb25maWc6IElPcGVuQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdGNvbnRleHQsXG5cdFx0XHRjbGk6IGFyZ3MsXG5cdFx0XHQvKipcblx0XHRcdCAqIFdoZW4gb3BlbmluZyBhIG5ldyB3aW5kb3cgZnJvbSBhIHNlY29uZCBpbnN0YW5jZSB0aGF0IHNlbnQgYXJncyBhbmQgZW52XG5cdFx0XHQgKiBvdmVyIHRvIHRoaXMgaW5zdGFuY2UsIHdlIHdhbnQgdG8gcHJlc2VydmUgdGhlIGVudmlyb25tZW50IG9ubHkgaWYgdGhhdCBzZWNvbmRcblx0XHRcdCAqIGluc3RhbmNlIHdhcyBzcGF3bmVkIGZyb20gdGhlIENMSSBvciB1c2VkIHRoZSBgLS1wcmVzZXJ2ZS1lbnZgIGZsYWcgKGV4YW1wbGU6XG5cdFx0XHQgKiB3aGVuIHVzaW5nIGBvcGVuIC1uIFwiVlNDb2RlLmFwcFwiIC0tYXJncyAtLXByZXNlcnZlLWVudiBXT1JLU1BBQ0VfRk9MREVSYCkuXG5cdFx0XHQgKlxuXHRcdFx0ICogVGhpcyBpcyBkb25lIHRvIGVuc3VyZSB0aGF0IHRoZSBzZWNvbmQgd2luZG93IGdldHMgdHJlYXRlZCBleGFjdGx5IHRoZSBzYW1lXG5cdFx0XHQgKiBhcyB0aGUgZmlyc3Qgd2luZG93LCBmb3IgZXhhbXBsZSwgaXQgZ2V0cyB0aGUgc2FtZSByZXNvbHZlZCB1c2VyIHNoZWxsIGVudmlyb25tZW50LlxuXHRcdFx0ICpcblx0XHRcdCAqIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTQ3MzZcblx0XHRcdCAqL1xuXHRcdFx0dXNlckVudjogKGFyZ3NbJ3ByZXNlcnZlLWVudiddIHx8IGNvbnRleHQgPT09IE9wZW5Db250ZXh0LkNMSSkgPyB1c2VyRW52IDogdW5kZWZpbmVkLFxuXHRcdFx0d2FpdE1hcmtlckZpbGVVUkksXG5cdFx0XHRyZW1vdGVBdXRob3JpdHksXG5cdFx0XHRmb3JjZVByb2ZpbGU6IGFyZ3MucHJvZmlsZSxcblx0XHRcdGZvcmNlVGVtcFByb2ZpbGU6IGFyZ3NbJ3Byb2ZpbGUtdGVtcCddXG5cdFx0fTtcblxuXHRcdC8vIFNwZWNpYWwgY2FzZSBleHRlbnNpb24gZGV2ZWxvcG1lbnRcblx0XHRpZiAoYXJncy5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgpIHtcblx0XHRcdGF3YWl0IHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9wZW5FeHRlbnNpb25EZXZlbG9wbWVudEhvc3RXaW5kb3coYXJncy5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgsIGJhc2VDb25maWcpO1xuXHRcdH1cblxuXHRcdC8vIEFnZW50cyB3aW5kb3dcblx0XHRlbHNlIGlmIChhcmdzWydhZ2VudHMnXSkge1xuXHRcdFx0dXNlZFdpbmRvd3MgPSBhd2FpdCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuQWdlbnRzV2luZG93KGJhc2VDb25maWcpO1xuXHRcdH1cblxuXHRcdC8vIFN0YXJ0IHdpdGhvdXQgZmlsZS9mb2xkZXIgYXJndW1lbnRzXG5cdFx0ZWxzZSBpZiAoIWFyZ3MuXy5sZW5ndGggJiYgIWFyZ3NbJ2ZvbGRlci11cmknXSAmJiAhYXJnc1snZmlsZS11cmknXSkge1xuXHRcdFx0bGV0IG9wZW5OZXdXaW5kb3cgPSBmYWxzZTtcblxuXHRcdFx0Ly8gRm9yY2UgbmV3IHdpbmRvd1xuXHRcdFx0aWYgKGFyZ3NbJ25ldy13aW5kb3cnXSB8fCBiYXNlQ29uZmlnLmZvcmNlUHJvZmlsZSB8fCBiYXNlQ29uZmlnLmZvcmNlVGVtcFByb2ZpbGUpIHtcblx0XHRcdFx0b3Blbk5ld1dpbmRvdyA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvcmNlIHJldXNlIHdpbmRvd1xuXHRcdFx0ZWxzZSBpZiAoYXJnc1sncmV1c2Utd2luZG93J10pIHtcblx0XHRcdFx0b3Blbk5ld1dpbmRvdyA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdGhlcndpc2UgY2hlY2sgZm9yIHNldHRpbmdzXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Y29uc3Qgd2luZG93Q29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV2luZG93U2V0dGluZ3MgfCB1bmRlZmluZWQ+KCd3aW5kb3cnKTtcblx0XHRcdFx0Y29uc3Qgb3BlbldpdGhvdXRBcmd1bWVudHNJbk5ld1dpbmRvd0NvbmZpZyA9IHdpbmRvd0NvbmZpZz8ub3BlbldpdGhvdXRBcmd1bWVudHNJbk5ld1dpbmRvdyB8fCAnZGVmYXVsdCcgLyogZGVmYXVsdCAqLztcblx0XHRcdFx0c3dpdGNoIChvcGVuV2l0aG91dEFyZ3VtZW50c0luTmV3V2luZG93Q29uZmlnKSB7XG5cdFx0XHRcdFx0Y2FzZSAnb24nOlxuXHRcdFx0XHRcdFx0b3Blbk5ld1dpbmRvdyA9IHRydWU7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdvZmYnOlxuXHRcdFx0XHRcdFx0b3Blbk5ld1dpbmRvdyA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdG9wZW5OZXdXaW5kb3cgPSAhaXNNYWNpbnRvc2g7IC8vIHByZWZlciB0byByZXN0b3JlIHJ1bm5pbmcgaW5zdGFuY2Ugb24gbWFjT1Ncblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPcGVuIG5ldyBXaW5kb3dcblx0XHRcdGlmIChvcGVuTmV3V2luZG93KSB7XG5cdFx0XHRcdHVzZWRXaW5kb3dzID0gYXdhaXQgdGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3Blbih7XG5cdFx0XHRcdFx0Li4uYmFzZUNvbmZpZyxcblx0XHRcdFx0XHRmb3JjZU5ld1dpbmRvdzogdHJ1ZSxcblx0XHRcdFx0XHRmb3JjZUVtcHR5OiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGb2N1cyBleGlzdGluZyB3aW5kb3cgb3Igb3BlbiBpZiBub25lIG9wZW5lZFxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RBY3RpdmUgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cdFx0XHRcdGlmIChsYXN0QWN0aXZlKSB7XG5cdFx0XHRcdFx0dGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub3BlbkV4aXN0aW5nV2luZG93KGxhc3RBY3RpdmUsIGJhc2VDb25maWcpO1xuXG5cdFx0XHRcdFx0dXNlZFdpbmRvd3MgPSBbbGFzdEFjdGl2ZV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dXNlZFdpbmRvd3MgPSBhd2FpdCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdFx0XHRcdC4uLmJhc2VDb25maWcsXG5cdFx0XHRcdFx0XHRmb3JjZUVtcHR5OiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTdGFydCB3aXRoIGZpbGUvZm9sZGVyIGFyZ3VtZW50c1xuXHRcdGVsc2Uge1xuXHRcdFx0dXNlZFdpbmRvd3MgPSBhd2FpdCB0aGlzLndpbmRvd3NNYWluU2VydmljZS5vcGVuKHtcblx0XHRcdFx0Li4uYmFzZUNvbmZpZyxcblx0XHRcdFx0Zm9yY2VOZXdXaW5kb3c6IGFyZ3NbJ25ldy13aW5kb3cnXSxcblx0XHRcdFx0cHJlZmVyTmV3V2luZG93OiAhYXJnc1sncmV1c2Utd2luZG93J10gJiYgIWFyZ3Mud2FpdCxcblx0XHRcdFx0Zm9yY2VSZXVzZVdpbmRvdzogYXJnc1sncmV1c2Utd2luZG93J10sXG5cdFx0XHRcdGRpZmZNb2RlOiBhcmdzLmRpZmYsXG5cdFx0XHRcdG1lcmdlTW9kZTogYXJncy5tZXJnZSxcblx0XHRcdFx0YWRkTW9kZTogYXJncy5hZGQsXG5cdFx0XHRcdHJlbW92ZU1vZGU6IGFyZ3MucmVtb3ZlLFxuXHRcdFx0XHRub1JlY2VudEVudHJ5OiAhIWFyZ3NbJ3NraXAtYWRkLXRvLXJlY2VudGx5LW9wZW5lZCddLFxuXHRcdFx0XHRnb3RvTGluZU1vZGU6IGFyZ3MuZ290b1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIG90aGVyIGluc3RhbmNlIGlzIHdhaXRpbmcgdG8gYmUga2lsbGVkLCB3ZSBob29rIHVwIGEgd2luZG93IGxpc3RlbmVyIGlmIG9uZSB3aW5kb3dcblx0XHQvLyBpcyBiZWluZyB1c2VkIGFuZCBvbmx5IHRoZW4gcmVzb2x2ZSB0aGUgc3RhcnR1cCBwcm9taXNlIHdoaWNoIHdpbGwga2lsbCB0aGlzIHNlY29uZCBpbnN0YW5jZS5cblx0XHQvLyBJbiBhZGRpdGlvbiwgd2UgcG9sbCBmb3IgdGhlIHdhaXQgbWFya2VyIGZpbGUgdG8gYmUgZGVsZXRlZCB0byByZXR1cm4uXG5cdFx0aWYgKHdhaXRNYXJrZXJGaWxlVVJJICYmIHVzZWRXaW5kb3dzLmxlbmd0aCA9PT0gMSAmJiB1c2VkV2luZG93c1swXSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmFjZShbXG5cdFx0XHRcdHVzZWRXaW5kb3dzWzBdLndoZW5DbG9zZWRPckxvYWRlZCxcblx0XHRcdFx0d2hlbkRlbGV0ZWQod2FpdE1hcmtlckZpbGVVUkkuZnNQYXRoKVxuXHRcdFx0XSkudGhlbigoKSA9PiB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0TWFpblByb2Nlc3NJZCgpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnUmVjZWl2ZWQgcmVxdWVzdCBmb3IgcHJvY2VzcyBJRCBmcm9tIG90aGVyIGluc3RhbmNlLicpO1xuXG5cdFx0cmV0dXJuIHByb2Nlc3MucGlkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUE4QixtQkFBbUI7QUFDakQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsbUJBQW1CO0FBRzVCLFNBQTZCLHFCQUFxQixtQkFBbUI7QUFHOUQsTUFBTSxLQUFLO0FBQ1gsTUFBTSxxQkFBcUIsZ0JBQW9DLEVBQUU7QUFnQmpFLElBQU0sb0JBQU4sTUFBc0Q7QUFBQSxFQUk1RCxZQUMrQixZQUNRLG9CQUNSLFlBQ1Usc0JBQ3ZDO0FBSjZCO0FBQ1E7QUFDUjtBQUNVO0FBQUEsRUFDckM7QUFBQSxFQUVKLE1BQU0sTUFBTSxNQUF3QixTQUE2QztBQUNoRixTQUFLLFdBQVcsTUFBTSx1Q0FBdUMsTUFBTSxPQUFPO0FBVzFFLFFBQUksYUFBYTtBQUNoQixVQUFJLE1BQU0sRUFBRSxPQUFPLEtBQUssQ0FBQztBQUFBLElBQzFCO0FBR0EsVUFBTSxhQUFhLEtBQUssYUFBYSxJQUFJO0FBQ3pDLFFB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
