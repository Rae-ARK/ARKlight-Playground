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
import { Emitter, Event } from "../../../../base/common/event.js";
import { IHostService } from "./host.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { isFolderToOpen, isWorkspaceToOpen, isFileToOpen } from "../../../../platform/window/common/window.js";
import { isResourceEditorInput, pathsToEditors } from "../../../common/editor.js";
import { whenEditorClosed } from "../../../browser/editor.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { EventType, ModifierKeyEmitter, addDisposableListener, addDisposableThrottledListener, detectFullscreen, disposableWindowInterval, getActiveDocument, getActiveWindow, getWindowId, onDidRegisterWindow, trackFocus, getWindows as getDOMWindows } from "../../../../base/browser/dom.js";
import { Disposable, DisposableSet, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IBrowserWorkbenchEnvironmentService } from "../../environment/browser/environmentService.js";
import { memoize } from "../../../../base/common/decorators.js";
import { parseLineAndColumnAware } from "../../../../base/common/extpath.js";
import { IWorkspaceEditingService } from "../../workspaces/common/workspaceEditing.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILifecycleService, ShutdownReason } from "../../lifecycle/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { getWorkspaceIdentifier } from "../../../../platform/workspaces/common/workspaceIdentifier.js";
import { localize } from "../../../../nls.js";
import Severity from "../../../../base/common/severity.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { isUndefined } from "../../../../base/common/types.js";
import { isTemporaryWorkspace, IWorkspaceContextService, toWorkspaceIdentifier } from "../../../../platform/workspace/common/workspace.js";
import { Schemas } from "../../../../base/common/network.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { mainWindow, isAuxiliaryWindow } from "../../../../base/browser/window.js";
import { isIOS, isMacintosh } from "../../../../base/common/platform.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { showBrowserToast } from "./toasts.js";
var HostShutdownReason = /* @__PURE__ */ ((HostShutdownReason2) => {
  HostShutdownReason2[HostShutdownReason2["Unknown"] = 1] = "Unknown";
  HostShutdownReason2[HostShutdownReason2["Keyboard"] = 2] = "Keyboard";
  HostShutdownReason2[HostShutdownReason2["Api"] = 3] = "Api";
  return HostShutdownReason2;
})(HostShutdownReason || {});
let BrowserHostService = class extends Disposable {
  constructor(layoutService, configurationService, fileService, labelService, environmentService, instantiationService, lifecycleService, logService, dialogService, contextService, userDataProfilesService) {
    super();
    this.layoutService = layoutService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.labelService = labelService;
    this.environmentService = environmentService;
    this.instantiationService = instantiationService;
    this.lifecycleService = lifecycleService;
    this.logService = logService;
    this.dialogService = dialogService;
    this.contextService = contextService;
    this.userDataProfilesService = userDataProfilesService;
    this.shutdownReason = 1 /* Unknown */;
    //#endregion
    //#region Toast Notifications
    this.activeToasts = this._register(new DisposableSet());
    if (environmentService.options?.workspaceProvider) {
      this.workspaceProvider = environmentService.options.workspaceProvider;
    } else {
      this.workspaceProvider = new class {
        constructor() {
          this.workspace = void 0;
          this.trusted = void 0;
        }
        async open() {
          return true;
        }
      }();
    }
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.lifecycleService.onBeforeShutdown((e) => this.onBeforeShutdown(e)));
    this._register(ModifierKeyEmitter.getInstance().event(() => this.updateShutdownReasonFromEvent()));
    this._register(this.onDidChangeFocus((focus) => {
      if (focus) {
        this.clearToasts();
      }
    }));
  }
  onBeforeShutdown(e) {
    switch (this.shutdownReason) {
      // Unknown / Keyboard shows veto depending on setting
      case 1 /* Unknown */:
      case 2 /* Keyboard */: {
        const confirmBeforeClose = this.configurationService.getValue("window.confirmBeforeClose");
        if (confirmBeforeClose === "always" || confirmBeforeClose === "keyboardOnly" && this.shutdownReason === 2 /* Keyboard */) {
          e.veto(true, "veto.confirmBeforeClose");
        }
        break;
      }
      // Api never shows veto
      case 3 /* Api */:
        break;
    }
    this.shutdownReason = 1 /* Unknown */;
  }
  updateShutdownReasonFromEvent() {
    if (this.shutdownReason === 3 /* Api */) {
      return;
    }
    if (ModifierKeyEmitter.getInstance().isModifierPressed) {
      this.shutdownReason = 2 /* Keyboard */;
    } else {
      this.shutdownReason = 1 /* Unknown */;
    }
  }
  get onDidChangeFocus() {
    const emitter = this._register(new Emitter());
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      const focusTracker = disposables.add(trackFocus(window));
      const visibilityTracker = disposables.add(new DomEmitter(window.document, "visibilitychange"));
      Event.any(
        Event.map(focusTracker.onDidFocus, () => this.hasFocus, disposables),
        Event.map(focusTracker.onDidBlur, () => this.hasFocus, disposables),
        Event.map(visibilityTracker.event, () => this.hasFocus, disposables),
        Event.map(this.onDidChangeActiveWindow, () => this.hasFocus, disposables)
      )((focus) => emitter.fire(focus), void 0, disposables);
    }, { window: mainWindow, disposables: this._store }));
    return Event.latch(emitter.event, void 0, this._store);
  }
  get hasFocus() {
    return getActiveDocument().hasFocus();
  }
  async hadLastFocus() {
    return true;
  }
  async focus(targetWindow) {
    targetWindow.focus();
  }
  get onDidChangeActiveWindow() {
    const emitter = this._register(new Emitter());
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      const windowId = getWindowId(window);
      const focusTracker = disposables.add(trackFocus(window));
      disposables.add(focusTracker.onDidFocus(() => emitter.fire(windowId)));
      if (isAuxiliaryWindow(window)) {
        disposables.add(disposableWindowInterval(window, () => {
          const hasFocus = window.document.hasFocus();
          if (hasFocus) {
            emitter.fire(windowId);
          }
          return hasFocus;
        }, 100, 20));
      }
    }, { window: mainWindow, disposables: this._store }));
    return Event.latch(emitter.event, void 0, this._store);
  }
  get onDidChangeFullScreen() {
    const emitter = this._register(new Emitter());
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      const windowId = getWindowId(window);
      const viewport = isIOS && window.visualViewport ? window.visualViewport : window;
      for (const event of [EventType.FULLSCREEN_CHANGE, EventType.WK_FULLSCREEN_CHANGE]) {
        disposables.add(addDisposableListener(window.document, event, () => emitter.fire({ windowId, fullscreen: !!detectFullscreen(window) })));
      }
      disposables.add(addDisposableThrottledListener(
        viewport,
        EventType.RESIZE,
        () => emitter.fire({ windowId, fullscreen: !!detectFullscreen(window) }),
        void 0,
        isMacintosh ? 2e3 : 800
        /* can be throttled */
      ));
    }, { window: mainWindow, disposables: this._store }));
    return emitter.event;
  }
  openWindow(arg1, arg2) {
    if (Array.isArray(arg1)) {
      return this.doOpenWindow(arg1, arg2);
    }
    return this.doOpenEmptyWindow(arg1);
  }
  async doOpenWindow(toOpen, options) {
    const payload = this.preservePayload(false, options);
    const fileOpenables = [];
    const foldersToAdd = [];
    const foldersToRemove = [];
    for (const openable of toOpen) {
      openable.label = openable.label || this.getRecentLabel(openable);
      if (isFolderToOpen(openable)) {
        if (options?.addMode) {
          foldersToAdd.push({ uri: openable.folderUri });
        } else if (options?.removeMode) {
          foldersToRemove.push(openable.folderUri);
        } else {
          this.doOpen({ folderUri: openable.folderUri }, { reuse: this.shouldReuse(
            options,
            false
            /* no file */
          ), payload });
        }
      } else if (isWorkspaceToOpen(openable)) {
        this.doOpen({ workspaceUri: openable.workspaceUri }, { reuse: this.shouldReuse(
          options,
          false
          /* no file */
        ), payload });
      } else if (isFileToOpen(openable)) {
        fileOpenables.push(openable);
      }
    }
    if (foldersToAdd.length > 0 || foldersToRemove.length > 0) {
      this.withServices(async (accessor) => {
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        if (foldersToAdd.length > 0) {
          await workspaceEditingService.addFolders(foldersToAdd);
        }
        if (foldersToRemove.length > 0) {
          await workspaceEditingService.removeFolders(foldersToRemove);
        }
      });
    }
    if (fileOpenables.length > 0) {
      this.withServices(async (accessor) => {
        const editorService = accessor.get(IEditorService);
        if (options?.mergeMode && fileOpenables.length === 4) {
          const editors = coalesce(await pathsToEditors(fileOpenables, this.fileService, this.logService));
          if (editors.length !== 4 || !isResourceEditorInput(editors[0]) || !isResourceEditorInput(editors[1]) || !isResourceEditorInput(editors[2]) || !isResourceEditorInput(editors[3])) {
            return;
          }
          if (this.shouldReuse(
            options,
            true
            /* file */
          )) {
            editorService.openEditor({
              input1: { resource: editors[0].resource },
              input2: { resource: editors[1].resource },
              base: { resource: editors[2].resource },
              result: { resource: editors[3].resource },
              options: { pinned: true }
            });
          } else {
            const environment = /* @__PURE__ */ new Map();
            environment.set("mergeFile1", editors[0].resource.toString());
            environment.set("mergeFile2", editors[1].resource.toString());
            environment.set("mergeFileBase", editors[2].resource.toString());
            environment.set("mergeFileResult", editors[3].resource.toString());
            this.doOpen(void 0, { payload: Array.from(environment.entries()) });
          }
        } else if (options?.diffMode && fileOpenables.length === 2) {
          const editors = coalesce(await pathsToEditors(fileOpenables, this.fileService, this.logService));
          if (editors.length !== 2 || !isResourceEditorInput(editors[0]) || !isResourceEditorInput(editors[1])) {
            return;
          }
          if (this.shouldReuse(
            options,
            true
            /* file */
          )) {
            editorService.openEditor({
              original: { resource: editors[0].resource },
              modified: { resource: editors[1].resource },
              options: { pinned: true }
            });
          } else {
            const environment = /* @__PURE__ */ new Map();
            environment.set("diffFileSecondary", editors[0].resource.toString());
            environment.set("diffFilePrimary", editors[1].resource.toString());
            this.doOpen(void 0, { payload: Array.from(environment.entries()) });
          }
        } else {
          for (const openable of fileOpenables) {
            if (this.shouldReuse(
              options,
              true
              /* file */
            )) {
              let openables = [];
              if (options?.gotoLineMode) {
                const pathColumnAware = parseLineAndColumnAware(openable.fileUri.path);
                openables = [{
                  fileUri: openable.fileUri.with({ path: pathColumnAware.path }),
                  options: {
                    selection: !isUndefined(pathColumnAware.line) ? { startLineNumber: pathColumnAware.line, startColumn: pathColumnAware.column || 1 } : void 0
                  }
                }];
              } else {
                openables = [openable];
              }
              editorService.openEditors(coalesce(await pathsToEditors(openables, this.fileService, this.logService)), void 0, { validateTrust: true });
            } else {
              const environment = /* @__PURE__ */ new Map();
              environment.set("openFile", openable.fileUri.toString());
              if (options?.gotoLineMode) {
                environment.set("gotoLineMode", "true");
              }
              this.doOpen(void 0, { payload: Array.from(environment.entries()) });
            }
          }
        }
        const waitMarkerFileURI = options?.waitMarkerFileURI;
        if (waitMarkerFileURI) {
          (async () => {
            const filesToWaitFor = [];
            if (options.mergeMode) {
              filesToWaitFor.push(
                fileOpenables[3].fileUri
                /* [3] is the resulting merge file */
              );
            } else {
              filesToWaitFor.push(...fileOpenables.map((fileOpenable) => fileOpenable.fileUri));
            }
            await this.instantiationService.invokeFunction((accessor2) => whenEditorClosed(accessor2, filesToWaitFor));
            await this.fileService.del(waitMarkerFileURI);
          })();
        }
      });
    }
  }
  withServices(fn) {
    this.instantiationService.invokeFunction((accessor) => fn(accessor));
  }
  preservePayload(isEmptyWindow, options) {
    const newPayload = [];
    if (!isEmptyWindow && this.environmentService.extensionDevelopmentLocationURI) {
      newPayload.push(["extensionDevelopmentPath", this.environmentService.extensionDevelopmentLocationURI.toString()]);
      if (this.environmentService.debugExtensionHost.debugId) {
        newPayload.push(["debugId", this.environmentService.debugExtensionHost.debugId]);
      }
      if (this.environmentService.debugExtensionHost.port) {
        newPayload.push(["inspect-brk-extensions", String(this.environmentService.debugExtensionHost.port)]);
      }
    }
    const newWindowProfile = options?.forceProfile ? this.userDataProfilesService.profiles.find((profile) => profile.name === options?.forceProfile) : void 0;
    if (newWindowProfile && !newWindowProfile.isDefault) {
      newPayload.push(["profile", newWindowProfile.name]);
    }
    return newPayload.length ? newPayload : void 0;
  }
  getRecentLabel(openable) {
    if (isFolderToOpen(openable)) {
      return this.labelService.getWorkspaceLabel(openable.folderUri, { verbose: Verbosity.LONG });
    }
    if (isWorkspaceToOpen(openable)) {
      return this.labelService.getWorkspaceLabel(getWorkspaceIdentifier(openable.workspaceUri), { verbose: Verbosity.LONG });
    }
    return this.labelService.getUriLabel(openable.fileUri, { appendWorkspaceSuffix: true });
  }
  shouldReuse(options = /* @__PURE__ */ Object.create(null), isFile) {
    if (options.waitMarkerFileURI) {
      return true;
    }
    const windowConfig = this.configurationService.getValue("window");
    const openInNewWindowConfig = isFile ? windowConfig?.openFilesInNewWindow || "off" : windowConfig?.openFoldersInNewWindow || "default";
    let openInNewWindow = (options.preferNewWindow || !!options.forceNewWindow) && !options.forceReuseWindow;
    if (!options.forceNewWindow && !options.forceReuseWindow && (openInNewWindowConfig === "on" || openInNewWindowConfig === "off")) {
      openInNewWindow = openInNewWindowConfig === "on";
    }
    return !openInNewWindow;
  }
  async doOpenEmptyWindow(options) {
    return this.doOpen(void 0, {
      reuse: options?.forceReuseWindow,
      payload: this.preservePayload(true, options)
    });
  }
  async doOpen(workspace, options) {
    if (workspace && isFolderToOpen(workspace) && workspace.folderUri.scheme === Schemas.file && isTemporaryWorkspace(this.contextService.getWorkspace())) {
      this.withServices(async (accessor) => {
        const workspaceEditingService = accessor.get(IWorkspaceEditingService);
        await workspaceEditingService.updateFolders(0, this.contextService.getWorkspace().folders.length, [{ uri: workspace.folderUri }]);
      });
      return;
    }
    if (options?.reuse) {
      await this.handleExpectedShutdown(ShutdownReason.LOAD);
    }
    const opened = await this.workspaceProvider.open(workspace, options);
    if (!opened) {
      await this.dialogService.prompt({
        type: Severity.Warning,
        message: workspace ? localize("unableToOpenExternalWorkspace", "The browser blocked opening a new tab or window for '{0}'. Press 'Retry' to try again.", this.getRecentLabel(workspace)) : localize("unableToOpenExternal", "The browser blocked opening a new tab or window. Press 'Retry' to try again."),
        custom: {
          markdownDetails: [{ markdown: new MarkdownString(localize("unableToOpenWindowDetail", "Please allow pop-ups for this website in your [browser settings]({0}).", "https://aka.ms/allow-vscode-popup"), true) }]
        },
        buttons: [
          {
            label: localize({ key: "retry", comment: ["&& denotes a mnemonic"] }, "&&Retry"),
            run: () => this.workspaceProvider.open(workspace, options)
          }
        ],
        cancelButton: true
      });
    }
  }
  async toggleFullScreen(targetWindow) {
    const target = this.layoutService.getContainer(targetWindow);
    if (targetWindow.document.fullscreen !== void 0) {
      if (!targetWindow.document.fullscreen) {
        try {
          return await target.requestFullscreen();
        } catch (error) {
          this.logService.warn("toggleFullScreen(): requestFullscreen failed");
        }
      } else {
        try {
          return await targetWindow.document.exitFullscreen();
        } catch (error) {
          this.logService.warn("toggleFullScreen(): exitFullscreen failed");
        }
      }
    }
    const webkitDocument = targetWindow.document;
    const webkitElement = target;
    if (webkitDocument.webkitIsFullScreen !== void 0) {
      try {
        if (!webkitDocument.webkitIsFullScreen) {
          webkitElement.webkitRequestFullscreen();
        } else {
          webkitDocument.webkitExitFullscreen();
        }
      } catch {
        this.logService.warn("toggleFullScreen(): requestFullscreen/exitFullscreen failed");
      }
    }
  }
  async moveTop(targetWindow) {
  }
  async setWindowDimmed(_targetWindow, _dimmed) {
  }
  async getCursorScreenPoint() {
    return void 0;
  }
  async getWindows(options) {
    const activeWindow = getActiveWindow();
    const activeWindowId = getWindowId(activeWindow);
    const result = [{
      id: activeWindowId,
      title: activeWindow.document.title,
      workspace: toWorkspaceIdentifier(this.contextService.getWorkspace()),
      dirty: false
    }];
    if (options.includeAuxiliaryWindows) {
      for (const { window } of getDOMWindows()) {
        const windowId = getWindowId(window);
        if (windowId !== activeWindowId && isAuxiliaryWindow(window)) {
          result.push({
            id: windowId,
            title: window.document.title,
            parentId: activeWindowId
          });
        }
      }
    }
    return result;
  }
  //#endregion
  //#region Lifecycle
  async restart() {
    this.reload();
  }
  async reload() {
    await this.handleExpectedShutdown(ShutdownReason.RELOAD);
    mainWindow.location.reload();
  }
  async close() {
    await this.handleExpectedShutdown(ShutdownReason.CLOSE);
    mainWindow.close();
  }
  async shutdown() {
    return this.close();
  }
  async withExpectedShutdown(expectedShutdownTask) {
    const previousShutdownReason = this.shutdownReason;
    try {
      this.shutdownReason = 3 /* Api */;
      return await expectedShutdownTask();
    } finally {
      this.shutdownReason = previousShutdownReason;
    }
  }
  async handleExpectedShutdown(reason) {
    this.shutdownReason = 3 /* Api */;
    return this.lifecycleService.withExpectedShutdown(reason);
  }
  //#endregion
  //#region Screenshots
  async getScreenshot() {
    const store = new DisposableStore();
    const video = document.createElement("video");
    store.add(toDisposable(() => video.remove()));
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: true
      });
      video.srcObject = stream;
      video.play();
      await Promise.all([
        new Promise((r) => store.add(addDisposableListener(video, "loadedmetadata", () => r()))),
        new Promise((r) => store.add(addDisposableListener(video, "canplaythrough", () => r())))
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return void 0;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob((blob2) => resolve(blob2), "image/jpeg", 0.95));
      if (!blob) {
        throw new Error("Failed to create blob from canvas");
      }
      const buf = await blob.bytes();
      return VSBuffer.wrap(buf);
    } catch (error) {
      console.error("Error taking screenshot:", error);
      return void 0;
    } finally {
      store.dispose();
      if (stream) {
        for (const track of stream.getTracks()) {
          track.stop();
        }
      }
    }
  }
  async getBrowserId() {
    return void 0;
  }
  //#endregion
  //#region Native Handle
  async getNativeWindowHandle(_windowId) {
    return void 0;
  }
  async showToast(options, token) {
    return showBrowserToast({
      onDidCreateToast: (disposable) => this.activeToasts.add(disposable),
      onDidDisposeToast: (disposable) => this.activeToasts.deleteAndDispose(disposable)
    }, options, token);
  }
  async clearToasts() {
    this.activeToasts.clearAndDisposeAll();
  }
  //#endregion
};
__decorateClass([
  memoize
], BrowserHostService.prototype, "onDidChangeFocus", 1);
__decorateClass([
  memoize
], BrowserHostService.prototype, "onDidChangeActiveWindow", 1);
__decorateClass([
  memoize
], BrowserHostService.prototype, "onDidChangeFullScreen", 1);
BrowserHostService = __decorateClass([
  __decorateParam(0, ILayoutService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IFileService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IBrowserWorkbenchEnvironmentService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILifecycleService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IUserDataProfilesService)
], BrowserHostService);
registerSingleton(IHostService, BrowserHostService, InstantiationType.Delayed);
export {
  BrowserHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvYnJvd3Nlckhvc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UsIElUb2FzdE9wdGlvbnMsIElUb2FzdFJlc3VsdCB9IGZyb20gJy4vaG9zdC5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXaW5kb3dTZXR0aW5ncywgSVdpbmRvd09wZW5hYmxlLCBJT3BlbldpbmRvd09wdGlvbnMsIGlzRm9sZGVyVG9PcGVuLCBpc1dvcmtzcGFjZVRvT3BlbiwgaXNGaWxlVG9PcGVuLCBJT3BlbkVtcHR5V2luZG93T3B0aW9ucywgSVBhdGhEYXRhLCBJRmlsZVRvT3BlbiwgSU9wZW5lZE1haW5XaW5kb3csIElPcGVuZWRBdXhpbGlhcnlXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBpc1Jlc291cmNlRWRpdG9ySW5wdXQsIHBhdGhzVG9FZGl0b3JzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyB3aGVuRWRpdG9yQ2xvc2VkIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93ZWIuYXBpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlLCBWZXJib3NpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlLCBNb2RpZmllcktleUVtaXR0ZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYWRkRGlzcG9zYWJsZVRocm90dGxlZExpc3RlbmVyLCBkZXRlY3RGdWxsc2NyZWVuLCBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwsIGdldEFjdGl2ZURvY3VtZW50LCBnZXRBY3RpdmVXaW5kb3csIGdldFdpbmRvd0lkLCBvbkRpZFJlZ2lzdGVyV2luZG93LCB0cmFja0ZvY3VzLCBnZXRXaW5kb3dzIGFzIGdldERPTVdpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTZXQsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgcGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZUVkaXRpbmcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgQmVmb3JlU2h1dGRvd25FdmVudCwgU2h1dGRvd25SZWFzb24gfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBCcm93c2VyTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9icm93c2VyL2xpZmVjeWNsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBnZXRXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlSWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IERvbUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBpc1RlbXBvcmFyeVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB0b1dvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93LCBpc0F1eGlsaWFyeVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgaXNJT1MsIGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgc2hvd0Jyb3dzZXJUb2FzdCB9IGZyb20gJy4vdG9hc3RzLmpzJztcblxuZW51bSBIb3N0U2h1dGRvd25SZWFzb24ge1xuXG5cdC8qKlxuXHQgKiBBbiB1bmtub3duIHNodXRkb3duIHJlYXNvbi5cblx0ICovXG5cdFVua25vd24gPSAxLFxuXG5cdC8qKlxuXHQgKiBBIHNodXRkb3duIHRoYXQgd2FzIHBvdGVudGlhbGx5IHRyaWdnZXJlZCBieSBrZXlib2FyZCB1c2UuXG5cdCAqL1xuXHRLZXlib2FyZCA9IDIsXG5cblx0LyoqXG5cdCAqIEFuIGV4cGxpY2l0IHNodXRkb3duIHZpYSBjb2RlLlxuXHQgKi9cblx0QXBpID0gM1xufVxuXG5leHBvcnQgY2xhc3MgQnJvd3Nlckhvc3RTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElIb3N0U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB3b3Jrc3BhY2VQcm92aWRlcjogSVdvcmtzcGFjZVByb3ZpZGVyO1xuXG5cdHByaXZhdGUgc2h1dGRvd25SZWFzb24gPSBIb3N0U2h1dGRvd25SZWFzb24uVW5rbm93bjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IEJyb3dzZXJMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRpZiAoZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LndvcmtzcGFjZVByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLndvcmtzcGFjZVByb3ZpZGVyID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnMud29ya3NwYWNlUHJvdmlkZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMud29ya3NwYWNlUHJvdmlkZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJV29ya3NwYWNlUHJvdmlkZXIge1xuXHRcdFx0XHRyZWFkb25seSB3b3Jrc3BhY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJlYWRvbmx5IHRydXN0ZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGFzeW5jIG9wZW4oKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIFZldG8gc2h1dGRvd24gZGVwZW5kaW5nIG9uIGB3aW5kb3cuY29uZmlybUJlZm9yZUNsb3NlYCBzZXR0aW5nXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uQmVmb3JlU2h1dGRvd24oZSA9PiB0aGlzLm9uQmVmb3JlU2h1dGRvd24oZSkpKTtcblxuXHRcdC8vIFRyYWNrIG1vZGlmaWVyIGtleXMgdG8gZGV0ZWN0IGtleWJpbmRpbmcgdXNhZ2Vcblx0XHR0aGlzLl9yZWdpc3RlcihNb2RpZmllcktleUVtaXR0ZXIuZ2V0SW5zdGFuY2UoKS5ldmVudCgoKSA9PiB0aGlzLnVwZGF0ZVNodXRkb3duUmVhc29uRnJvbUV2ZW50KCkpKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0byBoaWRlIGFsbCB0b2FzdHMgd2hlbiB0aGUgd2luZG93IGdhaW5zIGZvY3VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUZvY3VzKGZvY3VzID0+IHtcblx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHR0aGlzLmNsZWFyVG9hc3RzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkJlZm9yZVNodXRkb3duKGU6IEJlZm9yZVNodXRkb3duRXZlbnQpOiB2b2lkIHtcblxuXHRcdHN3aXRjaCAodGhpcy5zaHV0ZG93blJlYXNvbikge1xuXG5cdFx0XHQvLyBVbmtub3duIC8gS2V5Ym9hcmQgc2hvd3MgdmV0byBkZXBlbmRpbmcgb24gc2V0dGluZ1xuXHRcdFx0Y2FzZSBIb3N0U2h1dGRvd25SZWFzb24uVW5rbm93bjpcblx0XHRcdGNhc2UgSG9zdFNodXRkb3duUmVhc29uLktleWJvYXJkOiB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpcm1CZWZvcmVDbG9zZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dpbmRvdy5jb25maXJtQmVmb3JlQ2xvc2UnKTtcblx0XHRcdFx0aWYgKGNvbmZpcm1CZWZvcmVDbG9zZSA9PT0gJ2Fsd2F5cycgfHwgKGNvbmZpcm1CZWZvcmVDbG9zZSA9PT0gJ2tleWJvYXJkT25seScgJiYgdGhpcy5zaHV0ZG93blJlYXNvbiA9PT0gSG9zdFNodXRkb3duUmVhc29uLktleWJvYXJkKSkge1xuXHRcdFx0XHRcdGUudmV0byh0cnVlLCAndmV0by5jb25maXJtQmVmb3JlQ2xvc2UnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdC8vIEFwaSBuZXZlciBzaG93cyB2ZXRvXG5cdFx0XHRjYXNlIEhvc3RTaHV0ZG93blJlYXNvbi5BcGk6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdC8vIFVuc2V0IGZvciBuZXh0IHNodXRkb3duXG5cdFx0dGhpcy5zaHV0ZG93blJlYXNvbiA9IEhvc3RTaHV0ZG93blJlYXNvbi5Vbmtub3duO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTaHV0ZG93blJlYXNvbkZyb21FdmVudCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zaHV0ZG93blJlYXNvbiA9PT0gSG9zdFNodXRkb3duUmVhc29uLkFwaSkge1xuXHRcdFx0cmV0dXJuOyAvLyBkbyBub3Qgb3ZlcndyaXRlIGFueSBleHBsaWNpdGx5IHNldCBzaHV0ZG93biByZWFzb25cblx0XHR9XG5cblx0XHRpZiAoTW9kaWZpZXJLZXlFbWl0dGVyLmdldEluc3RhbmNlKCkuaXNNb2RpZmllclByZXNzZWQpIHtcblx0XHRcdHRoaXMuc2h1dGRvd25SZWFzb24gPSBIb3N0U2h1dGRvd25SZWFzb24uS2V5Ym9hcmQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2h1dGRvd25SZWFzb24gPSBIb3N0U2h1dGRvd25SZWFzb24uVW5rbm93bjtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gRm9jdXNcblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25EaWRDaGFuZ2VGb2N1cygpOiBFdmVudDxib29sZWFuPiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKG9uRGlkUmVnaXN0ZXJXaW5kb3csICh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4ge1xuXHRcdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKHRyYWNrRm9jdXMod2luZG93KSk7XG5cdFx0XHRjb25zdCB2aXNpYmlsaXR5VHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih3aW5kb3cuZG9jdW1lbnQsICd2aXNpYmlsaXR5Y2hhbmdlJykpO1xuXG5cdFx0XHRFdmVudC5hbnkoXG5cdFx0XHRcdEV2ZW50Lm1hcChmb2N1c1RyYWNrZXIub25EaWRGb2N1cywgKCkgPT4gdGhpcy5oYXNGb2N1cywgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRFdmVudC5tYXAoZm9jdXNUcmFja2VyLm9uRGlkQmx1ciwgKCkgPT4gdGhpcy5oYXNGb2N1cywgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRFdmVudC5tYXAodmlzaWJpbGl0eVRyYWNrZXIuZXZlbnQsICgpID0+IHRoaXMuaGFzRm9jdXMsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0RXZlbnQubWFwKHRoaXMub25EaWRDaGFuZ2VBY3RpdmVXaW5kb3csICgpID0+IHRoaXMuaGFzRm9jdXMsIGRpc3Bvc2FibGVzKSxcblx0XHRcdCkoZm9jdXMgPT4gZW1pdHRlci5maXJlKGZvY3VzKSwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcyk7XG5cdFx0fSwgeyB3aW5kb3c6IG1haW5XaW5kb3csIGRpc3Bvc2FibGVzOiB0aGlzLl9zdG9yZSB9KSk7XG5cblx0XHRyZXR1cm4gRXZlbnQubGF0Y2goZW1pdHRlci5ldmVudCwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHRnZXQgaGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGdldEFjdGl2ZURvY3VtZW50KCkuaGFzRm9jdXMoKTtcblx0fVxuXG5cdGFzeW5jIGhhZExhc3RGb2N1cygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGZvY3VzKHRhcmdldFdpbmRvdzogV2luZG93KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGFyZ2V0V2luZG93LmZvY3VzKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBXaW5kb3dcblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25EaWRDaGFuZ2VBY3RpdmVXaW5kb3coKTogRXZlbnQ8bnVtYmVyPiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUob25EaWRSZWdpc3RlcldpbmRvdywgKHsgd2luZG93LCBkaXNwb3NhYmxlcyB9KSA9PiB7XG5cdFx0XHRjb25zdCB3aW5kb3dJZCA9IGdldFdpbmRvd0lkKHdpbmRvdyk7XG5cblx0XHRcdC8vIEVtaXQgdmlhIGZvY3VzIHRyYWNraW5nXG5cdFx0XHRjb25zdCBmb2N1c1RyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQodHJhY2tGb2N1cyh3aW5kb3cpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChmb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiBlbWl0dGVyLmZpcmUod2luZG93SWQpKSk7XG5cblx0XHRcdC8vIEVtaXQgdmlhIGludGVydmFsOiBpbW1lZGlhdGVseSB3aGVuIG9wZW5pbmcgYW4gYXV4aWxpYXJ5IHdpbmRvdyxcblx0XHRcdC8vIGl0IGlzIHBvc3NpYmxlIHRoYXQgZG9jdW1lbnQgZm9jdXMgaGFzIG5vdCB5ZXQgY2hhbmdlZCwgc28gd2Vcblx0XHRcdC8vIHBvbGwgZm9yIGEgd2hpbGUgdG8gZW5zdXJlIHdlIGNhdGNoIHRoZSBldmVudC5cblx0XHRcdGlmIChpc0F1eGlsaWFyeVdpbmRvdyh3aW5kb3cpKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwod2luZG93LCAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaGFzRm9jdXMgPSB3aW5kb3cuZG9jdW1lbnQuaGFzRm9jdXMoKTtcblx0XHRcdFx0XHRpZiAoaGFzRm9jdXMpIHtcblx0XHRcdFx0XHRcdGVtaXR0ZXIuZmlyZSh3aW5kb3dJZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGhhc0ZvY3VzO1xuXHRcdFx0XHR9LCAxMDAsIDIwKSk7XG5cdFx0XHR9XG5cdFx0fSwgeyB3aW5kb3c6IG1haW5XaW5kb3csIGRpc3Bvc2FibGVzOiB0aGlzLl9zdG9yZSB9KSk7XG5cblx0XHRyZXR1cm4gRXZlbnQubGF0Y2goZW1pdHRlci5ldmVudCwgdW5kZWZpbmVkLCB0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25EaWRDaGFuZ2VGdWxsU2NyZWVuKCk6IEV2ZW50PHsgd2luZG93SWQ6IG51bWJlcjsgZnVsbHNjcmVlbjogYm9vbGVhbiB9PiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgd2luZG93SWQ6IG51bWJlcjsgZnVsbHNjcmVlbjogYm9vbGVhbiB9PigpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShvbkRpZFJlZ2lzdGVyV2luZG93LCAoeyB3aW5kb3csIGRpc3Bvc2FibGVzIH0pID0+IHtcblx0XHRcdGNvbnN0IHdpbmRvd0lkID0gZ2V0V2luZG93SWQod2luZG93KTtcblx0XHRcdGNvbnN0IHZpZXdwb3J0ID0gaXNJT1MgJiYgd2luZG93LnZpc3VhbFZpZXdwb3J0ID8gd2luZG93LnZpc3VhbFZpZXdwb3J0IC8qKiBWaXN1YWwgdmlld3BvcnQgKi8gOiB3aW5kb3cgLyoqIExheW91dCB2aWV3cG9ydCAqLztcblxuXHRcdFx0Ly8gRnVsbHNjcmVlbiAoQnJvd3Nlcilcblx0XHRcdGZvciAoY29uc3QgZXZlbnQgb2YgW0V2ZW50VHlwZS5GVUxMU0NSRUVOX0NIQU5HRSwgRXZlbnRUeXBlLldLX0ZVTExTQ1JFRU5fQ0hBTkdFXSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdy5kb2N1bWVudCwgZXZlbnQsICgpID0+IGVtaXR0ZXIuZmlyZSh7IHdpbmRvd0lkLCBmdWxsc2NyZWVuOiAhIWRldGVjdEZ1bGxzY3JlZW4od2luZG93KSB9KSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGdWxsc2NyZWVuIChOYXRpdmUpXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZVRocm90dGxlZExpc3RlbmVyKHZpZXdwb3J0LCBFdmVudFR5cGUuUkVTSVpFLCAoKSA9PiBlbWl0dGVyLmZpcmUoeyB3aW5kb3dJZCwgZnVsbHNjcmVlbjogISFkZXRlY3RGdWxsc2NyZWVuKHdpbmRvdykgfSksIHVuZGVmaW5lZCwgaXNNYWNpbnRvc2ggPyAyMDAwIC8qIGFkanVzdCBmb3IgbWFjT1MgYW5pbWF0aW9uICovIDogODAwIC8qIGNhbiBiZSB0aHJvdHRsZWQgKi8pKTtcblx0XHR9LCB7IHdpbmRvdzogbWFpbldpbmRvdywgZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlIH0pKTtcblxuXHRcdHJldHVybiBlbWl0dGVyLmV2ZW50O1xuXHR9XG5cblx0b3BlbldpbmRvdyhvcHRpb25zPzogSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRvcGVuV2luZG93KHRvT3BlbjogSVdpbmRvd09wZW5hYmxlW10sIG9wdGlvbnM/OiBJT3BlbldpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRvcGVuV2luZG93KGFyZzE/OiBJT3BlbkVtcHR5V2luZG93T3B0aW9ucyB8IElXaW5kb3dPcGVuYWJsZVtdLCBhcmcyPzogSU9wZW5XaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoYXJnMSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvT3BlbldpbmRvdyhhcmcxLCBhcmcyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb09wZW5FbXB0eVdpbmRvdyhhcmcxKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuV2luZG93KHRvT3BlbjogSVdpbmRvd09wZW5hYmxlW10sIG9wdGlvbnM/OiBJT3BlbldpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwYXlsb2FkID0gdGhpcy5wcmVzZXJ2ZVBheWxvYWQoZmFsc2UgLyogbm90IGFuIGVtcHR5IHdpbmRvdyAqLywgb3B0aW9ucyk7XG5cdFx0Y29uc3QgZmlsZU9wZW5hYmxlczogSUZpbGVUb09wZW5bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZm9sZGVyc1RvQWRkOiBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhW10gPSBbXTtcblx0XHRjb25zdCBmb2xkZXJzVG9SZW1vdmU6IFVSSVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IG9wZW5hYmxlIG9mIHRvT3Blbikge1xuXHRcdFx0b3BlbmFibGUubGFiZWwgPSBvcGVuYWJsZS5sYWJlbCB8fCB0aGlzLmdldFJlY2VudExhYmVsKG9wZW5hYmxlKTtcblxuXHRcdFx0Ly8gRm9sZGVyXG5cdFx0XHRpZiAoaXNGb2xkZXJUb09wZW4ob3BlbmFibGUpKSB7XG5cdFx0XHRcdGlmIChvcHRpb25zPy5hZGRNb2RlKSB7XG5cdFx0XHRcdFx0Zm9sZGVyc1RvQWRkLnB1c2goeyB1cmk6IG9wZW5hYmxlLmZvbGRlclVyaSB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChvcHRpb25zPy5yZW1vdmVNb2RlKSB7XG5cdFx0XHRcdFx0Zm9sZGVyc1RvUmVtb3ZlLnB1c2gob3BlbmFibGUuZm9sZGVyVXJpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmRvT3Blbih7IGZvbGRlclVyaTogb3BlbmFibGUuZm9sZGVyVXJpIH0sIHsgcmV1c2U6IHRoaXMuc2hvdWxkUmV1c2Uob3B0aW9ucywgZmFsc2UgLyogbm8gZmlsZSAqLyksIHBheWxvYWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gV29ya3NwYWNlXG5cdFx0XHRlbHNlIGlmIChpc1dvcmtzcGFjZVRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdFx0dGhpcy5kb09wZW4oeyB3b3Jrc3BhY2VVcmk6IG9wZW5hYmxlLndvcmtzcGFjZVVyaSB9LCB7IHJldXNlOiB0aGlzLnNob3VsZFJldXNlKG9wdGlvbnMsIGZhbHNlIC8qIG5vIGZpbGUgKi8pLCBwYXlsb2FkIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaWxlIChoYW5kbGVkIGxhdGVyIGluIGJ1bGspXG5cdFx0XHRlbHNlIGlmIChpc0ZpbGVUb09wZW4ob3BlbmFibGUpKSB7XG5cdFx0XHRcdGZpbGVPcGVuYWJsZXMucHVzaChvcGVuYWJsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIEZvbGRlcnMgdG8gYWRkIG9yIHJlbW92ZVxuXHRcdGlmIChmb2xkZXJzVG9BZGQubGVuZ3RoID4gMCB8fCBmb2xkZXJzVG9SZW1vdmUubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy53aXRoU2VydmljZXMoYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VFZGl0aW5nU2VydmljZTogSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSk7XG5cdFx0XHRcdGlmIChmb2xkZXJzVG9BZGQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGF3YWl0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLmFkZEZvbGRlcnMoZm9sZGVyc1RvQWRkKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChmb2xkZXJzVG9SZW1vdmUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGF3YWl0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLnJlbW92ZUZvbGRlcnMoZm9sZGVyc1RvUmVtb3ZlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIEZpbGVzXG5cdFx0aWYgKGZpbGVPcGVuYWJsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy53aXRoU2VydmljZXMoYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBTdXBwb3J0IG1lcmdlTW9kZVxuXHRcdFx0XHRpZiAob3B0aW9ucz8ubWVyZ2VNb2RlICYmIGZpbGVPcGVuYWJsZXMubGVuZ3RoID09PSA0KSB7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9ycyA9IGNvYWxlc2NlKGF3YWl0IHBhdGhzVG9FZGl0b3JzKGZpbGVPcGVuYWJsZXMsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSkpO1xuXHRcdFx0XHRcdGlmIChlZGl0b3JzLmxlbmd0aCAhPT0gNCB8fCAhaXNSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcnNbMF0pIHx8ICFpc1Jlc291cmNlRWRpdG9ySW5wdXQoZWRpdG9yc1sxXSkgfHwgIWlzUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3JzWzJdKSB8fCAhaXNSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcnNbM10pKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIGludmFsaWQgcmVzb3VyY2VzXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gU2FtZSBXaW5kb3c6IG9wZW4gdmlhIGVkaXRvciBzZXJ2aWNlIGluIGN1cnJlbnQgd2luZG93XG5cdFx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkUmV1c2Uob3B0aW9ucywgdHJ1ZSAvKiBmaWxlICovKSkge1xuXHRcdFx0XHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdFx0aW5wdXQxOiB7IHJlc291cmNlOiBlZGl0b3JzWzBdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRcdGlucHV0MjogeyByZXNvdXJjZTogZWRpdG9yc1sxXS5yZXNvdXJjZSB9LFxuXHRcdFx0XHRcdFx0XHRiYXNlOiB7IHJlc291cmNlOiBlZGl0b3JzWzJdLnJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRcdHJlc3VsdDogeyByZXNvdXJjZTogZWRpdG9yc1szXS5yZXNvdXJjZSB9LFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBOZXcgV2luZG93OiBvcGVuIGludG8gZW1wdHkgd2luZG93XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnZpcm9ubWVudCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdFx0XHRlbnZpcm9ubWVudC5zZXQoJ21lcmdlRmlsZTEnLCBlZGl0b3JzWzBdLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdFx0ZW52aXJvbm1lbnQuc2V0KCdtZXJnZUZpbGUyJywgZWRpdG9yc1sxXS5yZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRcdGVudmlyb25tZW50LnNldCgnbWVyZ2VGaWxlQmFzZScsIGVkaXRvcnNbMl0ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRlbnZpcm9ubWVudC5zZXQoJ21lcmdlRmlsZVJlc3VsdCcsIGVkaXRvcnNbM10ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0XHRcdHRoaXMuZG9PcGVuKHVuZGVmaW5lZCwgeyBwYXlsb2FkOiBBcnJheS5mcm9tKGVudmlyb25tZW50LmVudHJpZXMoKSkgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU3VwcG9ydCBkaWZmTW9kZVxuXHRcdFx0XHRlbHNlIGlmIChvcHRpb25zPy5kaWZmTW9kZSAmJiBmaWxlT3BlbmFibGVzLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvcnMgPSBjb2FsZXNjZShhd2FpdCBwYXRoc1RvRWRpdG9ycyhmaWxlT3BlbmFibGVzLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKTtcblx0XHRcdFx0XHRpZiAoZWRpdG9ycy5sZW5ndGggIT09IDIgfHwgIWlzUmVzb3VyY2VFZGl0b3JJbnB1dChlZGl0b3JzWzBdKSB8fCAhaXNSZXNvdXJjZUVkaXRvcklucHV0KGVkaXRvcnNbMV0pKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIGludmFsaWQgcmVzb3VyY2VzXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gU2FtZSBXaW5kb3c6IG9wZW4gdmlhIGVkaXRvciBzZXJ2aWNlIGluIGN1cnJlbnQgd2luZG93XG5cdFx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkUmV1c2Uob3B0aW9ucywgdHJ1ZSAvKiBmaWxlICovKSkge1xuXHRcdFx0XHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IGVkaXRvcnNbMF0ucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IGVkaXRvcnNbMV0ucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gTmV3IFdpbmRvdzogb3BlbiBpbnRvIGVtcHR5IHdpbmRvd1xuXHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdFx0XHRcdFx0ZW52aXJvbm1lbnQuc2V0KCdkaWZmRmlsZVNlY29uZGFyeScsIGVkaXRvcnNbMF0ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRlbnZpcm9ubWVudC5zZXQoJ2RpZmZGaWxlUHJpbWFyeScsIGVkaXRvcnNbMV0ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRcdFx0XHRcdHRoaXMuZG9PcGVuKHVuZGVmaW5lZCwgeyBwYXlsb2FkOiBBcnJheS5mcm9tKGVudmlyb25tZW50LmVudHJpZXMoKSkgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSnVzdCBvcGVuIG5vcm1hbGx5XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgb3BlbmFibGUgb2YgZmlsZU9wZW5hYmxlcykge1xuXG5cdFx0XHRcdFx0XHQvLyBTYW1lIFdpbmRvdzogb3BlbiB2aWEgZWRpdG9yIHNlcnZpY2UgaW4gY3VycmVudCB3aW5kb3dcblx0XHRcdFx0XHRcdGlmICh0aGlzLnNob3VsZFJldXNlKG9wdGlvbnMsIHRydWUgLyogZmlsZSAqLykpIHtcblx0XHRcdFx0XHRcdFx0bGV0IG9wZW5hYmxlczogSVBhdGhEYXRhPElUZXh0RWRpdG9yT3B0aW9ucz5bXSA9IFtdO1xuXG5cdFx0XHRcdFx0XHRcdC8vIFN1cHBvcnQ6IC0tZ290byBwYXJhbWV0ZXIgdG8gb3BlbiBvbiBsaW5lL2NvbFxuXHRcdFx0XHRcdFx0XHRpZiAob3B0aW9ucz8uZ290b0xpbmVNb2RlKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgcGF0aENvbHVtbkF3YXJlID0gcGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUob3BlbmFibGUuZmlsZVVyaS5wYXRoKTtcblx0XHRcdFx0XHRcdFx0XHRvcGVuYWJsZXMgPSBbe1xuXHRcdFx0XHRcdFx0XHRcdFx0ZmlsZVVyaTogb3BlbmFibGUuZmlsZVVyaS53aXRoKHsgcGF0aDogcGF0aENvbHVtbkF3YXJlLnBhdGggfSksXG5cdFx0XHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHNlbGVjdGlvbjogIWlzVW5kZWZpbmVkKHBhdGhDb2x1bW5Bd2FyZS5saW5lKSA/IHsgc3RhcnRMaW5lTnVtYmVyOiBwYXRoQ29sdW1uQXdhcmUubGluZSwgc3RhcnRDb2x1bW46IHBhdGhDb2x1bW5Bd2FyZS5jb2x1bW4gfHwgMSB9IDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fV07XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0b3BlbmFibGVzID0gW29wZW5hYmxlXTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcnMoY29hbGVzY2UoYXdhaXQgcGF0aHNUb0VkaXRvcnMob3BlbmFibGVzLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKSwgdW5kZWZpbmVkLCB7IHZhbGlkYXRlVHJ1c3Q6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIE5ldyBXaW5kb3c6IG9wZW4gaW50byBlbXB0eSB3aW5kb3dcblx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlbnZpcm9ubWVudCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdFx0XHRcdGVudmlyb25tZW50LnNldCgnb3BlbkZpbGUnLCBvcGVuYWJsZS5maWxlVXJpLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zPy5nb3RvTGluZU1vZGUpIHtcblx0XHRcdFx0XHRcdFx0XHRlbnZpcm9ubWVudC5zZXQoJ2dvdG9MaW5lTW9kZScsICd0cnVlJyk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHR0aGlzLmRvT3Blbih1bmRlZmluZWQsIHsgcGF5bG9hZDogQXJyYXkuZnJvbShlbnZpcm9ubWVudC5lbnRyaWVzKCkpIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFN1cHBvcnQgd2FpdCBtb2RlXG5cdFx0XHRcdGNvbnN0IHdhaXRNYXJrZXJGaWxlVVJJID0gb3B0aW9ucz8ud2FpdE1hcmtlckZpbGVVUkk7XG5cdFx0XHRcdGlmICh3YWl0TWFya2VyRmlsZVVSSSkge1xuXHRcdFx0XHRcdChhc3luYyAoKSA9PiB7XG5cblx0XHRcdFx0XHRcdC8vIFdhaXQgZm9yIHRoZSByZXNvdXJjZXMgdG8gYmUgY2xvc2VkIGluIHRoZSB0ZXh0IGVkaXRvci4uLlxuXHRcdFx0XHRcdFx0Y29uc3QgZmlsZXNUb1dhaXRGb3I6IFVSSVtdID0gW107XG5cdFx0XHRcdFx0XHRpZiAob3B0aW9ucy5tZXJnZU1vZGUpIHtcblx0XHRcdFx0XHRcdFx0ZmlsZXNUb1dhaXRGb3IucHVzaChmaWxlT3BlbmFibGVzWzNdLmZpbGVVcmkgLyogWzNdIGlzIHRoZSByZXN1bHRpbmcgbWVyZ2UgZmlsZSAqLyk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRmaWxlc1RvV2FpdEZvci5wdXNoKC4uLmZpbGVPcGVuYWJsZXMubWFwKGZpbGVPcGVuYWJsZSA9PiBmaWxlT3BlbmFibGUuZmlsZVVyaSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiB3aGVuRWRpdG9yQ2xvc2VkKGFjY2Vzc29yLCBmaWxlc1RvV2FpdEZvcikpO1xuXG5cdFx0XHRcdFx0XHQvLyAuLi5iZWZvcmUgZGVsZXRpbmcgdGhlIHdhaXQgbWFya2VyIGZpbGVcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHdhaXRNYXJrZXJGaWxlVVJJKTtcblx0XHRcdFx0XHR9KSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHdpdGhTZXJ2aWNlcyhmbjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB1bmtub3duKTogdm9pZCB7XG5cdFx0Ly8gSG9zdCBzZXJ2aWNlIGlzIHVzZWQgaW4gYSBsb3Qgb2YgY29udGV4dHMgYW5kIHNvbWUgc2VydmljZXNcblx0XHQvLyBuZWVkIHRvIGJlIHJlc29sdmVkIGR5bmFtaWNhbGx5IHRvIGF2b2lkIGN5Y2xpYyBkZXBlbmRlbmNpZXNcblx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwODUyMilcblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGZuKGFjY2Vzc29yKSk7XG5cdH1cblxuXHRwcml2YXRlIHByZXNlcnZlUGF5bG9hZChpc0VtcHR5V2luZG93OiBib29sZWFuLCBvcHRpb25zPzogSU9wZW5XaW5kb3dPcHRpb25zKTogQXJyYXk8dW5rbm93bj4gfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gU2VsZWN0aXZlbHkgY29weSBwYXlsb2FkOiBmb3Igbm93IG9ubHkgZXh0ZW5zaW9uIGRlYnVnZ2luZyBwcm9wZXJ0aWVzIGFyZSBjb25zaWRlcmVkXG5cdFx0Y29uc3QgbmV3UGF5bG9hZDogQXJyYXk8dW5rbm93bj4gPSBbXTtcblx0XHRpZiAoIWlzRW1wdHlXaW5kb3cgJiYgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSSkge1xuXHRcdFx0bmV3UGF5bG9hZC5wdXNoKFsnZXh0ZW5zaW9uRGV2ZWxvcG1lbnRQYXRoJywgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uRGV2ZWxvcG1lbnRMb2NhdGlvblVSSS50b1N0cmluZygpXSk7XG5cblx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZGVidWdJZCkge1xuXHRcdFx0XHRuZXdQYXlsb2FkLnB1c2goWydkZWJ1Z0lkJywgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LmRlYnVnSWRdKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5wb3J0KSB7XG5cdFx0XHRcdG5ld1BheWxvYWQucHVzaChbJ2luc3BlY3QtYnJrLWV4dGVuc2lvbnMnLCBTdHJpbmcodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZGVidWdFeHRlbnNpb25Ib3N0LnBvcnQpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3V2luZG93UHJvZmlsZSA9IG9wdGlvbnM/LmZvcmNlUHJvZmlsZVxuXHRcdFx0PyB0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLnByb2ZpbGVzLmZpbmQocHJvZmlsZSA9PiBwcm9maWxlLm5hbWUgPT09IG9wdGlvbnM/LmZvcmNlUHJvZmlsZSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChuZXdXaW5kb3dQcm9maWxlICYmICFuZXdXaW5kb3dQcm9maWxlLmlzRGVmYXVsdCkge1xuXHRcdFx0bmV3UGF5bG9hZC5wdXNoKFsncHJvZmlsZScsIG5ld1dpbmRvd1Byb2ZpbGUubmFtZV0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXdQYXlsb2FkLmxlbmd0aCA/IG5ld1BheWxvYWQgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFJlY2VudExhYmVsKG9wZW5hYmxlOiBJV2luZG93T3BlbmFibGUpOiBzdHJpbmcge1xuXHRcdGlmIChpc0ZvbGRlclRvT3BlbihvcGVuYWJsZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmxhYmVsU2VydmljZS5nZXRXb3Jrc3BhY2VMYWJlbChvcGVuYWJsZS5mb2xkZXJVcmksIHsgdmVyYm9zZTogVmVyYm9zaXR5LkxPTkcgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzV29ya3NwYWNlVG9PcGVuKG9wZW5hYmxlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKGdldFdvcmtzcGFjZUlkZW50aWZpZXIob3BlbmFibGUud29ya3NwYWNlVXJpKSwgeyB2ZXJib3NlOiBWZXJib3NpdHkuTE9ORyB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwob3BlbmFibGUuZmlsZVVyaSwgeyBhcHBlbmRXb3Jrc3BhY2VTdWZmaXg6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZFJldXNlKG9wdGlvbnM6IElPcGVuV2luZG93T3B0aW9ucyA9IE9iamVjdC5jcmVhdGUobnVsbCksIGlzRmlsZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmIChvcHRpb25zLndhaXRNYXJrZXJGaWxlVVJJKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gYWx3YXlzIGhhbmRsZSAtLXdhaXQgaW4gc2FtZSB3aW5kb3dcblx0XHR9XG5cblx0XHRjb25zdCB3aW5kb3dDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElXaW5kb3dTZXR0aW5ncyB8IHVuZGVmaW5lZD4oJ3dpbmRvdycpO1xuXHRcdGNvbnN0IG9wZW5Jbk5ld1dpbmRvd0NvbmZpZyA9IGlzRmlsZSA/ICh3aW5kb3dDb25maWc/Lm9wZW5GaWxlc0luTmV3V2luZG93IHx8ICdvZmYnIC8qIGRlZmF1bHQgKi8pIDogKHdpbmRvd0NvbmZpZz8ub3BlbkZvbGRlcnNJbk5ld1dpbmRvdyB8fCAnZGVmYXVsdCcgLyogZGVmYXVsdCAqLyk7XG5cblx0XHRsZXQgb3BlbkluTmV3V2luZG93ID0gKG9wdGlvbnMucHJlZmVyTmV3V2luZG93IHx8ICEhb3B0aW9ucy5mb3JjZU5ld1dpbmRvdykgJiYgIW9wdGlvbnMuZm9yY2VSZXVzZVdpbmRvdztcblx0XHRpZiAoIW9wdGlvbnMuZm9yY2VOZXdXaW5kb3cgJiYgIW9wdGlvbnMuZm9yY2VSZXVzZVdpbmRvdyAmJiAob3BlbkluTmV3V2luZG93Q29uZmlnID09PSAnb24nIHx8IG9wZW5Jbk5ld1dpbmRvd0NvbmZpZyA9PT0gJ29mZicpKSB7XG5cdFx0XHRvcGVuSW5OZXdXaW5kb3cgPSAob3BlbkluTmV3V2luZG93Q29uZmlnID09PSAnb24nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gIW9wZW5Jbk5ld1dpbmRvdztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuRW1wdHlXaW5kb3cob3B0aW9ucz86IElPcGVuRW1wdHlXaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9PcGVuKHVuZGVmaW5lZCwge1xuXHRcdFx0cmV1c2U6IG9wdGlvbnM/LmZvcmNlUmV1c2VXaW5kb3csXG5cdFx0XHRwYXlsb2FkOiB0aGlzLnByZXNlcnZlUGF5bG9hZCh0cnVlIC8qIGVtcHR5IHdpbmRvdyAqLywgb3B0aW9ucylcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9PcGVuKHdvcmtzcGFjZTogSVdvcmtzcGFjZSwgb3B0aW9ucz86IHsgcmV1c2U/OiBib29sZWFuOyBwYXlsb2FkPzogb2JqZWN0IH0pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFdoZW4gd2UgYXJlIGluIGEgdGVtcG9yYXJ5IHdvcmtzcGFjZSBhbmQgYXJlIGFza2VkIHRvIG9wZW4gYSBsb2NhbCBmb2xkZXJcblx0XHQvLyB3ZSBzd2FwIHRoYXQgZm9sZGVyIGludG8gdGhlIHdvcmtzcGFjZSB0byBhdm9pZCBhIHdpbmRvdyByZWxvYWQuIEFjY2Vzc1xuXHRcdC8vIHRvIGxvY2FsIHJlc291cmNlcyBpcyBvbmx5IHBvc3NpYmxlIHdpdGhvdXQgYSB3aW5kb3cgcmVsb2FkIGJlY2F1c2UgaXRcblx0XHQvLyBuZWVkcyB1c2VyIGFjdGl2YXRpb24uXG5cdFx0aWYgKHdvcmtzcGFjZSAmJiBpc0ZvbGRlclRvT3Blbih3b3Jrc3BhY2UpICYmIHdvcmtzcGFjZS5mb2xkZXJVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgaXNUZW1wb3JhcnlXb3Jrc3BhY2UodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSkpIHtcblx0XHRcdHRoaXMud2l0aFNlcnZpY2VzKGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRWRpdGluZ1NlcnZpY2U6IElXb3Jrc3BhY2VFZGl0aW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UpO1xuXG5cdFx0XHRcdGF3YWl0IHdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlLnVwZGF0ZUZvbGRlcnMoMCwgdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmxlbmd0aCwgW3sgdXJpOiB3b3Jrc3BhY2UuZm9sZGVyVXJpIH1dKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gV2Uga25vdyB0aGF0IGB3b3Jrc3BhY2VQcm92aWRlci5vcGVuYCB3aWxsIHRyaWdnZXIgYSBzaHV0ZG93blxuXHRcdC8vIHdpdGggYG9wdGlvbnMucmV1c2VgIHNvIHdlIGhhbmRsZSB0aGlzIGV4cGVjdGVkIHNodXRkb3duXG5cdFx0aWYgKG9wdGlvbnM/LnJldXNlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmhhbmRsZUV4cGVjdGVkU2h1dGRvd24oU2h1dGRvd25SZWFzb24uTE9BRCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BlbmVkID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VQcm92aWRlci5vcGVuKHdvcmtzcGFjZSwgb3B0aW9ucyk7XG5cdFx0aWYgKCFvcGVuZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiB3b3Jrc3BhY2UgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCd1bmFibGVUb09wZW5FeHRlcm5hbFdvcmtzcGFjZScsIFwiVGhlIGJyb3dzZXIgYmxvY2tlZCBvcGVuaW5nIGEgbmV3IHRhYiBvciB3aW5kb3cgZm9yICd7MH0nLiBQcmVzcyAnUmV0cnknIHRvIHRyeSBhZ2Fpbi5cIiwgdGhpcy5nZXRSZWNlbnRMYWJlbCh3b3Jrc3BhY2UpKSA6XG5cdFx0XHRcdFx0bG9jYWxpemUoJ3VuYWJsZVRvT3BlbkV4dGVybmFsJywgXCJUaGUgYnJvd3NlciBibG9ja2VkIG9wZW5pbmcgYSBuZXcgdGFiIG9yIHdpbmRvdy4gUHJlc3MgJ1JldHJ5JyB0byB0cnkgYWdhaW4uXCIpLFxuXHRcdFx0XHRjdXN0b206IHtcblx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IFt7IG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3VuYWJsZVRvT3BlbldpbmRvd0RldGFpbCcsIFwiUGxlYXNlIGFsbG93IHBvcC11cHMgZm9yIHRoaXMgd2Vic2l0ZSBpbiB5b3VyIFticm93c2VyIHNldHRpbmdzXSh7MH0pLlwiLCAnaHR0cHM6Ly9ha2EubXMvYWxsb3ctdnNjb2RlLXBvcHVwJyksIHRydWUpIH1dXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdyZXRyeScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJldHJ5XCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLndvcmtzcGFjZVByb3ZpZGVyLm9wZW4od29ya3NwYWNlLCBvcHRpb25zKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB0b2dnbGVGdWxsU2NyZWVuKHRhcmdldFdpbmRvdzogV2luZG93KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcih0YXJnZXRXaW5kb3cpO1xuXG5cdFx0Ly8gQ2hyb21pdW1cblx0XHRpZiAodGFyZ2V0V2luZG93LmRvY3VtZW50LmZ1bGxzY3JlZW4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKCF0YXJnZXRXaW5kb3cuZG9jdW1lbnQuZnVsbHNjcmVlbikge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0YXJnZXQucmVxdWVzdEZ1bGxzY3JlZW4oKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybigndG9nZ2xlRnVsbFNjcmVlbigpOiByZXF1ZXN0RnVsbHNjcmVlbiBmYWlsZWQnKTsgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0VsZW1lbnQvcmVxdWVzdEZ1bGxzY3JlZW5cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGFyZ2V0V2luZG93LmRvY3VtZW50LmV4aXRGdWxsc2NyZWVuKCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ3RvZ2dsZUZ1bGxTY3JlZW4oKTogZXhpdEZ1bGxzY3JlZW4gZmFpbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTYWZhcmkgYW5kIEVkZ2UgMTQgYXJlIGFsbCB1c2luZyB3ZWJraXQgcHJlZml4XG5cblx0XHRpbnRlcmZhY2UgV2Via2l0RG9jdW1lbnQgZXh0ZW5kcyBEb2N1bWVudCB7XG5cdFx0XHR3ZWJraXRGdWxsc2NyZWVuRWxlbWVudDogRWxlbWVudCB8IG51bGw7XG5cdFx0XHR3ZWJraXRFeGl0RnVsbHNjcmVlbigpOiBQcm9taXNlPHZvaWQ+O1xuXHRcdFx0d2Via2l0SXNGdWxsU2NyZWVuOiBib29sZWFuO1xuXHRcdH1cblxuXHRcdGludGVyZmFjZSBXZWJraXRIVE1MRWxlbWVudCBleHRlbmRzIEhUTUxFbGVtZW50IHtcblx0XHRcdHdlYmtpdFJlcXVlc3RGdWxsc2NyZWVuKCk6IFByb21pc2U8dm9pZD47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2Via2l0RG9jdW1lbnQgPSB0YXJnZXRXaW5kb3cuZG9jdW1lbnQgYXMgV2Via2l0RG9jdW1lbnQ7XG5cdFx0Y29uc3Qgd2Via2l0RWxlbWVudCA9IHRhcmdldCBhcyBXZWJraXRIVE1MRWxlbWVudDtcblx0XHRpZiAod2Via2l0RG9jdW1lbnQud2Via2l0SXNGdWxsU2NyZWVuICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmICghd2Via2l0RG9jdW1lbnQud2Via2l0SXNGdWxsU2NyZWVuKSB7XG5cdFx0XHRcdFx0d2Via2l0RWxlbWVudC53ZWJraXRSZXF1ZXN0RnVsbHNjcmVlbigpOyAvLyBpdCdzIGFzeW5jLCBidXQgZG9lc24ndCByZXR1cm4gYSByZWFsIHByb21pc2Vcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR3ZWJraXREb2N1bWVudC53ZWJraXRFeGl0RnVsbHNjcmVlbigpOyAvLyBpdCdzIGFzeW5jLCBidXQgZG9lc24ndCByZXR1cm4gYSByZWFsIHByb21pc2Vcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCd0b2dnbGVGdWxsU2NyZWVuKCk6IHJlcXVlc3RGdWxsc2NyZWVuL2V4aXRGdWxsc2NyZWVuIGZhaWxlZCcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIG1vdmVUb3AodGFyZ2V0V2luZG93OiBXaW5kb3cpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBUaGVyZSBzZWVtcyB0byBiZSBubyBBUEkgdG8gYnJpbmcgYSB3aW5kb3cgdG8gZnJvbnQgaW4gYnJvd3NlcnNcblx0fVxuXG5cdGFzeW5jIHNldFdpbmRvd0RpbW1lZChfdGFyZ2V0V2luZG93OiBXaW5kb3csIF9kaW1tZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub3Qgc3VwcG9ydGVkIGluIGJyb3dzZXJcblx0fVxuXG5cdGFzeW5jIGdldEN1cnNvclNjcmVlblBvaW50KCk6IFByb21pc2U8dW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFdpbmRvd3Mob3B0aW9uczogeyBpbmNsdWRlQXV4aWxpYXJ5V2luZG93czogdHJ1ZSB9KTogUHJvbWlzZTxBcnJheTxJT3BlbmVkTWFpbldpbmRvdyB8IElPcGVuZWRBdXhpbGlhcnlXaW5kb3c+Pjtcblx0Z2V0V2luZG93cyhvcHRpb25zOiB7IGluY2x1ZGVBdXhpbGlhcnlXaW5kb3dzOiBmYWxzZSB9KTogUHJvbWlzZTxBcnJheTxJT3BlbmVkTWFpbldpbmRvdz4+O1xuXHRhc3luYyBnZXRXaW5kb3dzKG9wdGlvbnM6IHsgaW5jbHVkZUF1eGlsaWFyeVdpbmRvd3M6IGJvb2xlYW4gfSk6IFByb21pc2U8QXJyYXk8SU9wZW5lZE1haW5XaW5kb3cgfCBJT3BlbmVkQXV4aWxpYXJ5V2luZG93Pj4ge1xuXHRcdGNvbnN0IGFjdGl2ZVdpbmRvdyA9IGdldEFjdGl2ZVdpbmRvdygpO1xuXHRcdGNvbnN0IGFjdGl2ZVdpbmRvd0lkID0gZ2V0V2luZG93SWQoYWN0aXZlV2luZG93KTtcblxuXHRcdC8vIE1haW4gd2luZG93XG5cdFx0Y29uc3QgcmVzdWx0OiBBcnJheTxJT3BlbmVkTWFpbldpbmRvdyB8IElPcGVuZWRBdXhpbGlhcnlXaW5kb3c+ID0gW3tcblx0XHRcdGlkOiBhY3RpdmVXaW5kb3dJZCxcblx0XHRcdHRpdGxlOiBhY3RpdmVXaW5kb3cuZG9jdW1lbnQudGl0bGUsXG5cdFx0XHR3b3Jrc3BhY2U6IHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSxcblx0XHRcdGRpcnR5OiBmYWxzZVxuXHRcdH1dO1xuXG5cdFx0Ly8gQXV4aWxpYXJ5IHdpbmRvd3Ncblx0XHRpZiAob3B0aW9ucy5pbmNsdWRlQXV4aWxpYXJ5V2luZG93cykge1xuXHRcdFx0Zm9yIChjb25zdCB7IHdpbmRvdyB9IG9mIGdldERPTVdpbmRvd3MoKSkge1xuXHRcdFx0XHRjb25zdCB3aW5kb3dJZCA9IGdldFdpbmRvd0lkKHdpbmRvdyk7XG5cdFx0XHRcdGlmICh3aW5kb3dJZCAhPT0gYWN0aXZlV2luZG93SWQgJiYgaXNBdXhpbGlhcnlXaW5kb3cod2luZG93KSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdGlkOiB3aW5kb3dJZCxcblx0XHRcdFx0XHRcdHRpdGxlOiB3aW5kb3cuZG9jdW1lbnQudGl0bGUsXG5cdFx0XHRcdFx0XHRwYXJlbnRJZDogYWN0aXZlV2luZG93SWRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTGlmZWN5Y2xlXG5cblx0YXN5bmMgcmVzdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnJlbG9hZCgpO1xuXHR9XG5cblx0YXN5bmMgcmVsb2FkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuaGFuZGxlRXhwZWN0ZWRTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5SRUxPQUQpO1xuXG5cdFx0bWFpbldpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTtcblx0fVxuXG5cdGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuaGFuZGxlRXhwZWN0ZWRTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5DTE9TRSk7XG5cblx0XHRtYWluV2luZG93LmNsb3NlKCk7XG5cdH1cblxuXHRhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jbG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgd2l0aEV4cGVjdGVkU2h1dGRvd248VD4oZXhwZWN0ZWRTaHV0ZG93blRhc2s6ICgpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBwcmV2aW91c1NodXRkb3duUmVhc29uID0gdGhpcy5zaHV0ZG93blJlYXNvbjtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5zaHV0ZG93blJlYXNvbiA9IEhvc3RTaHV0ZG93blJlYXNvbi5BcGk7XG5cdFx0XHRyZXR1cm4gYXdhaXQgZXhwZWN0ZWRTaHV0ZG93blRhc2soKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5zaHV0ZG93blJlYXNvbiA9IHByZXZpb3VzU2h1dGRvd25SZWFzb247XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVFeHBlY3RlZFNodXRkb3duKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFVwZGF0ZSBzaHV0ZG93biByZWFzb24gaW4gYSB3YXkgdGhhdCB3ZSBkb1xuXHRcdC8vIG5vdCBzaG93IGEgZGlhbG9nIGJlY2F1c2UgdGhpcyBpcyBhIGV4cGVjdGVkXG5cdFx0Ly8gc2h1dGRvd24uXG5cdFx0dGhpcy5zaHV0ZG93blJlYXNvbiA9IEhvc3RTaHV0ZG93blJlYXNvbi5BcGk7XG5cblx0XHQvLyBTaWduYWwgc2h1dGRvd24gcmVhc29uIHRvIGxpZmVjeWNsZVxuXHRcdHJldHVybiB0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2l0aEV4cGVjdGVkU2h1dGRvd24ocmVhc29uKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTY3JlZW5zaG90c1xuXG5cdGFzeW5jIGdldFNjcmVlbnNob3QoKTogUHJvbWlzZTxWU0J1ZmZlciB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIEdldHMgYSBzY3JlZW5zaG90IGZyb20gdGhlIGJyb3dzZXIuIFRoaXMgZ2V0cyB0aGUgc2NyZWVuc2hvdCB2aWEgdGhlIGJyb3dzZXIncyBkaXNwbGF5XG5cdFx0Ly8gbWVkaWEgQVBJIHdoaWNoIHdpbGwgdHlwaWNhbGx5IG9mZmVyIGEgcGlja2VyIG9mIGFsbCBhdmFpbGFibGUgc2NyZWVucyBhbmQgd2luZG93cyBmb3Jcblx0XHQvLyB0aGUgdXNlciB0byBzZWxlY3QuIFVzaW5nIHRoZSB2aWRlbyBzdHJlYW0gcHJvdmlkZWQgYnkgdGhlIGRpc3BsYXkgbWVkaWEgQVBJLCB0aGlzIHdpbGxcblx0XHQvLyBjYXB0dXJlIGEgc2luZ2xlIGZyYW1lIG9mIHRoZSB2aWRlbyBhbmQgY29udmVydCBpdCB0byBhIEpQRUcgaW1hZ2UuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBDcmVhdGUgYSB2aWRlbyBlbGVtZW50IHRvIHBsYXkgdGhlIGNhcHR1cmVkIHNjcmVlbiBzb3VyY2Vcblx0XHRjb25zdCB2aWRlbyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB2aWRlby5yZW1vdmUoKSkpO1xuXHRcdGxldCBzdHJlYW06IE1lZGlhU3RyZWFtIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBDcmVhdGUgYSBzdHJlYW0gZnJvbSB0aGUgc2NyZWVuIHNvdXJjZSAoY2FwdHVyZSBzY3JlZW4gd2l0aG91dCBhdWRpbylcblx0XHRcdHN0cmVhbSA9IGF3YWl0IG5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0RGlzcGxheU1lZGlhKHtcblx0XHRcdFx0YXVkaW86IGZhbHNlLFxuXHRcdFx0XHR2aWRlbzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFNldCB0aGUgc3RyZWFtIGFzIHRoZSBzb3VyY2Ugb2YgdGhlIHZpZGVvIGVsZW1lbnRcblx0XHRcdHZpZGVvLnNyY09iamVjdCA9IHN0cmVhbTtcblx0XHRcdHZpZGVvLnBsYXkoKTtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHZpZGVvIHRvIGxvYWQgcHJvcGVybHkgYmVmb3JlIGNhcHR1cmluZyB0aGUgc2NyZWVuc2hvdFxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRuZXcgUHJvbWlzZTx2b2lkPihyID0+IHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodmlkZW8sICdsb2FkZWRtZXRhZGF0YScsICgpID0+IHIoKSkpKSxcblx0XHRcdFx0bmV3IFByb21pc2U8dm9pZD4ociA9PiBzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHZpZGVvLCAnY2FucGxheXRocm91Z2gnLCAoKSA9PiByKCkpKSlcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBjYW52YXMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjYW52YXMnKTtcblx0XHRcdGNhbnZhcy53aWR0aCA9IHZpZGVvLnZpZGVvV2lkdGg7XG5cdFx0XHRjYW52YXMuaGVpZ2h0ID0gdmlkZW8udmlkZW9IZWlnaHQ7XG5cblx0XHRcdGNvbnN0IGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXHRcdFx0aWYgKCFjdHgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRHJhdyB0aGUgcG9ydGlvbiBvZiB0aGUgdmlkZW8gKHgsIHkpIHdpdGggdGhlIHNwZWNpZmllZCB3aWR0aCBhbmQgaGVpZ2h0XG5cdFx0XHRjdHguZHJhd0ltYWdlKHZpZGVvLCAwLCAwLCBjYW52YXMud2lkdGgsIGNhbnZhcy5oZWlnaHQpO1xuXG5cdFx0XHQvLyBDb252ZXJ0IHRoZSBjYW52YXMgdG8gYSBCbG9iIChKUEVHIGZvcm1hdCksIHVzZSAuOTUgZm9yIHF1YWxpdHlcblx0XHRcdGNvbnN0IGJsb2I6IEJsb2IgfCBudWxsID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUpID0+IGNhbnZhcy50b0Jsb2IoKGJsb2IpID0+IHJlc29sdmUoYmxvYiksICdpbWFnZS9qcGVnJywgMC45NSkpO1xuXHRcdFx0aWYgKCFibG9iKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGNyZWF0ZSBibG9iIGZyb20gY2FudmFzJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJ1ZiA9IGF3YWl0IGJsb2IuYnl0ZXMoKTtcblx0XHRcdHJldHVybiBWU0J1ZmZlci53cmFwKGJ1Zik7XG5cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc29sZS5lcnJvcignRXJyb3IgdGFraW5nIHNjcmVlbnNob3Q6JywgZXJyb3IpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0aWYgKHN0cmVhbSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRyYWNrIG9mIHN0cmVhbS5nZXRUcmFja3MoKSkge1xuXHRcdFx0XHRcdHRyYWNrLnN0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldEJyb3dzZXJJZCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gTmF0aXZlIEhhbmRsZVxuXG5cdGFzeW5jIGdldE5hdGl2ZVdpbmRvd0hhbmRsZShfd2luZG93SWQ6IG51bWJlcikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gVG9hc3QgTm90aWZpY2F0aW9uc1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlVG9hc3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTZXQoKSk7XG5cblx0YXN5bmMgc2hvd1RvYXN0KG9wdGlvbnM6IElUb2FzdE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvYXN0UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHNob3dCcm93c2VyVG9hc3Qoe1xuXHRcdFx0b25EaWRDcmVhdGVUb2FzdDogZGlzcG9zYWJsZSA9PiB0aGlzLmFjdGl2ZVRvYXN0cy5hZGQoZGlzcG9zYWJsZSksXG5cdFx0XHRvbkRpZERpc3Bvc2VUb2FzdDogZGlzcG9zYWJsZSA9PiB0aGlzLmFjdGl2ZVRvYXN0cy5kZWxldGVBbmREaXNwb3NlKGRpc3Bvc2FibGUpXG5cdFx0fSwgb3B0aW9ucywgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhclRvYXN0cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmFjdGl2ZVRvYXN0cy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJSG9zdFNlcnZpY2UsIEJyb3dzZXJIb3N0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsb0JBQWlEO0FBQzFELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUErRCxnQkFBZ0IsbUJBQW1CLG9CQUFnSDtBQUNsTixTQUFTLHVCQUF1QixzQkFBc0I7QUFDdEQsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlLGlCQUFpQjtBQUN6QyxTQUFTLFdBQVcsb0JBQW9CLHVCQUF1QixnQ0FBZ0Msa0JBQWtCLDBCQUEwQixtQkFBbUIsaUJBQWlCLGFBQWEscUJBQXFCLFlBQVksY0FBYyxxQkFBcUI7QUFDaFEsU0FBUyxZQUFZLGVBQWUsaUJBQWlCLG9CQUFvQjtBQUN6RSxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLGVBQWU7QUFDeEIsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBd0Msc0JBQXNCO0FBRXZFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsZ0JBQWdCO0FBQ3pCLE9BQU8sY0FBYztBQUNyQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQiwwQkFBMEIsNkJBQTZCO0FBRXRGLFNBQVMsZUFBZTtBQUV4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsT0FBTyxtQkFBbUI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFB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QUFzQixPQUFPLGtCQUFrQixNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUM1RixDQUFDO0FBRUQsWUFBTSxTQUFTLFNBQVMsY0FBYyxRQUFRO0FBQzlDLGFBQU8sUUFBUSxNQUFNO0FBQ3JCLGFBQU8sU0FBUyxNQUFNO0FBRXRCLFlBQU0sTUFBTSxPQUFPLFdBQVcsSUFBSTtBQUNsQyxVQUFJLENBQUMsS0FBSztBQUNULGVBQU87QUFBQSxNQUNSO0FBR0EsVUFBSSxVQUFVLE9BQU8sR0FBRyxHQUFHLE9BQU8sT0FBTyxPQUFPLE1BQU07QUFHdEQsWUFBTSxPQUFvQixNQUFNLElBQUksUUFBUSxDQUFDLFlBQVksT0FBTyxPQUFPLENBQUNDLFVBQVMsUUFBUUEsS0FBSSxHQUFHLGNBQWMsSUFBSSxDQUFDO0FBQ25ILFVBQUksQ0FBQyxNQUFNO0FBQ1YsY0FBTSxJQUFJLE1BQU0sbUNBQW1DO0FBQUEsTUFDcEQ7QUFFQSxZQUFNLE1BQU0sTUFBTSxLQUFLLE1BQU07QUFDN0IsYUFBTyxTQUFTLEtBQUssR0FBRztBQUFBLElBRXpCLFNBQVMsT0FBTztBQUNmLGNBQVEsTUFBTSw0QkFBNEIsS0FBSztBQUMvQyxhQUFPO0FBQUEsSUFDUixVQUFFO0FBQ0QsWUFBTSxRQUFRO0FBQ2QsVUFBSSxRQUFRO0FBQ1gsbUJBQVcsU0FBUyxPQUFPLFVBQVUsR0FBRztBQUN2QyxnQkFBTSxLQUFLO0FBQUEsUUFDWjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxlQUE0QztBQUNqRCxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQU0sc0JBQXNCLFdBQW1CO0FBQzlDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFRQSxNQUFNLFVBQVUsU0FBd0IsT0FBaUQ7QUFDeEYsV0FBTyxpQkFBaUI7QUFBQSxNQUN2QixrQkFBa0IsZ0JBQWMsS0FBSyxhQUFhLElBQUksVUFBVTtBQUFBLE1BQ2hFLG1CQUFtQixnQkFBYyxLQUFLLGFBQWEsaUJBQWlCLFVBQVU7QUFBQSxJQUMvRSxHQUFHLFNBQVMsS0FBSztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxNQUFjLGNBQTZCO0FBQzFDLFNBQUssYUFBYSxtQkFBbUI7QUFBQSxFQUN0QztBQUFBO0FBR0Q7QUEzbEJLO0FBQUEsRUFESDtBQUFBLEdBekZXLG1CQTBGUjtBQW9DQTtBQUFBLEVBREg7QUFBQSxHQTdIVyxtQkE4SFI7QUE2QkE7QUFBQSxFQURIO0FBQUEsR0ExSlcsbUJBMkpSO0FBM0pRLHFCQUFOO0FBQUEsRUFTSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5CVTtBQXVyQmIsa0JBQWtCLGNBQWMsb0JBQW9CLGtCQUFrQixPQUFPOyIsCiAgIm5hbWVzIjogWyJIb3N0U2h1dGRvd25SZWFzb24iLCAiYWNjZXNzb3IiLCAiYmxvYiJdCn0K
