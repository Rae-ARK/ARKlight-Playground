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
import { insert } from "../../../base/common/arrays.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Event } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { IModelService } from "../../../editor/common/services/model.js";
import { IFileDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { INativeEnvironmentService } from "../../../platform/environment/common/environment.js";
import { IExtensionManagementService } from "../../../platform/extensionManagement/common/extensionManagement.js";
import { AbstractNativeExtensionTipsService } from "../../../platform/extensionManagement/common/extensionTipsService.js";
import { IExtensionRecommendationNotificationService } from "../../../platform/extensionRecommendations/common/extensionRecommendations.js";
import { IFileService, FileSystemProviderCapabilities, FileType } from "../../../platform/files/common/files.js";
import { FileService } from "../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../platform/log/common/log.js";
import { INativeHostService } from "../../../platform/native/common/native.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../platform/telemetry/common/telemetry.js";
import { UriIdentityService } from "../../../platform/uriIdentity/common/uriIdentityService.js";
import { FileUserDataProvider } from "../../../platform/userData/common/fileUserDataProvider.js";
import { UserDataProfilesService } from "../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import { IEditorService } from "../../services/editor/common/editorService.js";
import { IFilesConfigurationService } from "../../services/filesConfiguration/common/filesConfigurationService.js";
import { ILifecycleService } from "../../services/lifecycle/common/lifecycle.js";
import { ITextFileService } from "../../services/textfile/common/textfiles.js";
import { NativeTextFileService } from "../../services/textfile/electron-browser/nativeTextFileService.js";
import { IWorkingCopyBackupService } from "../../services/workingCopy/common/workingCopyBackup.js";
import { IWorkingCopyService } from "../../services/workingCopy/common/workingCopyService.js";
import { NativeWorkingCopyBackupService } from "../../services/workingCopy/electron-browser/workingCopyBackupService.js";
import { workbenchInstantiationService as browserWorkbenchInstantiationService, TestEncodingOracle, TestEnvironmentService, TestLifecycleService } from "../browser/workbenchTestServices.js";
class TestSharedProcessService {
  createRawConnection() {
    throw new Error("Not Implemented");
  }
  getChannel(channelName) {
    return void 0;
  }
  registerChannel(channelName, channel) {
  }
  notifyRestored() {
  }
}
class TestNativeHostService {
  constructor() {
    this.windowId = -1;
    this.onDidOpenMainWindow = Event.None;
    this.onDidMaximizeWindow = Event.None;
    this.onDidUnmaximizeWindow = Event.None;
    this.onDidFocusMainWindow = Event.None;
    this.onDidBlurMainWindow = Event.None;
    this.onDidFocusMainOrAuxiliaryWindow = Event.None;
    this.onDidBlurMainOrAuxiliaryWindow = Event.None;
    this.onDidSuspendOS = Event.None;
    this.onDidResumeOS = Event.None;
    this.onDidChangeOnBatteryPower = Event.None;
    this.onDidChangeThermalState = Event.None;
    this.onDidChangeSpeedLimit = Event.None;
    this.onWillShutdownOS = Event.None;
    this.onDidLockScreen = Event.None;
    this.onDidUnlockScreen = Event.None;
    this.onDidChangeColorScheme = Event.None;
    this.onDidChangePassword = Event.None;
    this.onDidTriggerWindowSystemContextMenu = Event.None;
    this.onDidChangeWindowFullScreen = Event.None;
    this.onDidChangeWindowAlwaysOnTop = Event.None;
    this.onDidChangeDisplay = Event.None;
    this.windowCount = Promise.resolve(1);
  }
  getWindowCount() {
    return this.windowCount;
  }
  async getWindows() {
    return [];
  }
  async getActiveWindowId() {
    return void 0;
  }
  async getActiveWindowPosition() {
    return void 0;
  }
  async getNativeWindowHandle(windowId) {
    return void 0;
  }
  openWindow(arg1, arg2) {
    throw new Error("Method not implemented.");
  }
  async openAgentsWindow(_options) {
  }
  async syncSystemWideKeybindings(_keybindings) {
    return { failed: [] };
  }
  async toggleFullScreen() {
  }
  async isMaximized() {
    return true;
  }
  async isFullScreen() {
    return true;
  }
  async maximizeWindow() {
  }
  async unmaximizeWindow() {
  }
  async minimizeWindow() {
  }
  async moveWindowTop(options) {
  }
  async isWindowAlwaysOnTop(options) {
    return false;
  }
  async toggleWindowAlwaysOnTop(options) {
  }
  async setWindowAlwaysOnTop(alwaysOnTop, options) {
  }
  async getCursorScreenPoint() {
    throw new Error("Method not implemented.");
  }
  async positionWindow(position, options) {
  }
  async updateWindowControls(options) {
  }
  async updateWindowAccentColor(color) {
  }
  async setMinimumSize(width, height) {
  }
  async saveWindowSplash(value) {
  }
  async setBackgroundThrottling(throttling) {
  }
  async focusWindow(options) {
  }
  async showMessageBox(options) {
    throw new Error("Method not implemented.");
  }
  async showSaveDialog(options) {
    throw new Error("Method not implemented.");
  }
  async showOpenDialog(options) {
    throw new Error("Method not implemented.");
  }
  async pickFileFolderAndOpen(options) {
  }
  async pickFileAndOpen(options) {
  }
  async pickFolderAndOpen(options) {
  }
  async pickWorkspaceAndOpen(options) {
  }
  async showItemInFolder(path) {
  }
  async setRepresentedFilename(path) {
  }
  async isAdmin() {
    return false;
  }
  async writeElevated(source, target) {
  }
  async isRunningUnderARM64Translation() {
    return false;
  }
  async getOSProperties() {
    return /* @__PURE__ */ Object.create(null);
  }
  async getOSStatistics() {
    return /* @__PURE__ */ Object.create(null);
  }
  async getOSVirtualMachineHint() {
    return 0;
  }
  async getOSColorScheme() {
    return { dark: true, highContrast: false };
  }
  async hasWSLFeatureInstalled() {
    return false;
  }
  async getProcessId() {
    throw new Error("Method not implemented.");
  }
  async killProcess() {
  }
  async setDocumentEdited(edited) {
  }
  async openExternal(url, defaultApplication) {
    return false;
  }
  async updateTouchBar() {
  }
  async moveItemToTrash() {
  }
  async getMediaAccessStatus(_mediaType) {
    return "granted";
  }
  async newWindowTab() {
  }
  async showPreviousWindowTab() {
  }
  async showNextWindowTab() {
  }
  async moveWindowTabToNewWindow() {
  }
  async mergeAllWindowTabs() {
  }
  async toggleWindowTabsBar() {
  }
  async installShellCommand() {
  }
  async uninstallShellCommand() {
  }
  async notifyReady() {
  }
  async relaunch(options) {
  }
  async reload() {
  }
  async closeWindow() {
  }
  async quit() {
  }
  async exit(code) {
  }
  async openDevTools(options) {
  }
  async toggleDevTools() {
  }
  async stopTracing() {
  }
  async openDevToolsWindow(url) {
  }
  async openGPUInfoWindow() {
  }
  async openContentTracingWindow() {
  }
  async resolveProxy(url) {
    return void 0;
  }
  async resolveProxyWithPackage() {
    return [];
  }
  async readProxyConfigWithPackage() {
    return {
      environment: {},
      autoDetect: false,
      wpadDhcp: { state: "unsupported" },
      wpadDns: { state: "disabled" },
      configuredPac: { state: "unconfigured" }
    };
  }
  async lookupAuthorization(authInfo) {
    return void 0;
  }
  async lookupKerberosAuthorization(url) {
    return void 0;
  }
  async loadCertificates() {
    return [];
  }
  async isPortFree() {
    return Promise.resolve(true);
  }
  async findFreePort(startPort, giveUpAfter, timeout, stride) {
    return -1;
  }
  async readClipboardText(type) {
    return "";
  }
  async writeClipboardText(text, type) {
  }
  async readClipboardFindText() {
    return "";
  }
  async writeClipboardFindText(text) {
  }
  async writeClipboardBuffer(format, buffer, type) {
  }
  async triggerPaste(options) {
  }
  async readImage() {
    return Uint8Array.from([]);
  }
  async readClipboardBuffer(format) {
    return VSBuffer.wrap(Uint8Array.from([]));
  }
  async hasClipboard(format, type) {
    return false;
  }
  async windowsGetStringRegKey(hive, path, name) {
    return void 0;
  }
  async createZipFile(zipPath, files) {
  }
  async profileRenderer() {
    throw new Error();
  }
  async startTracing() {
    throw new Error();
  }
  async getScreenshot(rect) {
    return void 0;
  }
  async uploadFileViaMobileApi(_token, _repoId, fileName, _fileBytes, contentType) {
    return { fileName, assetUrl: "", contentType };
  }
  async showToast(options) {
    return { supported: false, clicked: false };
  }
  async clearToast(id) {
  }
  async clearToasts() {
  }
  // Power APIs
  async getSystemIdleState(idleThreshold) {
    return "unknown";
  }
  async getSystemIdleTime() {
    return 0;
  }
  async getCurrentThermalState() {
    return "unknown";
  }
  async isOnBatteryPower() {
    return false;
  }
  async startPowerSaveBlocker(type) {
    return -1;
  }
  async stopPowerSaveBlocker(id) {
    return false;
  }
  async isPowerSaveBlockerStarted(id) {
    return false;
  }
}
let TestExtensionTipsService = class extends AbstractNativeExtensionTipsService {
  constructor(environmentService, telemetryService, extensionManagementService, storageService, nativeHostService, extensionRecommendationNotificationService, fileService, productService) {
    super(environmentService.userHome, nativeHostService, telemetryService, extensionManagementService, storageService, extensionRecommendationNotificationService, fileService, productService);
  }
};
TestExtensionTipsService = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IExtensionManagementService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, INativeHostService),
  __decorateParam(5, IExtensionRecommendationNotificationService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IProductService)
], TestExtensionTipsService);
function workbenchInstantiationService(overrides, disposables = new DisposableStore()) {
  const instantiationService = browserWorkbenchInstantiationService({
    workingCopyBackupService: () => disposables.add(new TestNativeWorkingCopyBackupService()),
    ...overrides
  }, disposables);
  instantiationService.stub(INativeHostService, new TestNativeHostService());
  return instantiationService;
}
let TestServiceAccessor = class {
  constructor(lifecycleService, textFileService, filesConfigurationService, contextService, modelService, fileService, nativeHostService, fileDialogService, workingCopyBackupService, workingCopyService, editorService) {
    this.lifecycleService = lifecycleService;
    this.textFileService = textFileService;
    this.filesConfigurationService = filesConfigurationService;
    this.contextService = contextService;
    this.modelService = modelService;
    this.fileService = fileService;
    this.nativeHostService = nativeHostService;
    this.fileDialogService = fileDialogService;
    this.workingCopyBackupService = workingCopyBackupService;
    this.workingCopyService = workingCopyService;
    this.editorService = editorService;
  }
};
TestServiceAccessor = __decorateClass([
  __decorateParam(0, ILifecycleService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, IFilesConfigurationService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IFileService),
  __decorateParam(6, INativeHostService),
  __decorateParam(7, IFileDialogService),
  __decorateParam(8, IWorkingCopyBackupService),
  __decorateParam(9, IWorkingCopyService),
  __decorateParam(10, IEditorService)
], TestServiceAccessor);
class TestNativeTextFileServiceWithEncodingOverrides extends NativeTextFileService {
  get encoding() {
    if (!this._testEncoding) {
      this._testEncoding = this._register(this.instantiationService.createInstance(TestEncodingOracle));
    }
    return this._testEncoding;
  }
}
class TestNativeWorkingCopyBackupService extends NativeWorkingCopyBackupService {
  constructor() {
    const environmentService = TestEnvironmentService;
    const logService = new NullLogService();
    const fileService = new FileService(logService);
    const lifecycleService = new TestLifecycleService();
    super(environmentService, fileService, logService, lifecycleService);
    const inMemoryFileSystemProvider = this._register(new InMemoryFileSystemProvider());
    this._register(fileService.registerProvider(Schemas.inMemory, inMemoryFileSystemProvider));
    const uriIdentityService = this._register(new UriIdentityService(fileService));
    const userDataProfilesService = this._register(new UserDataProfilesService(environmentService, fileService, uriIdentityService, logService));
    this._register(fileService.registerProvider(Schemas.vscodeUserData, this._register(new FileUserDataProvider(Schemas.file, inMemoryFileSystemProvider, Schemas.vscodeUserData, userDataProfilesService, uriIdentityService, logService))));
    this.backupResourceJoiners = [];
    this.discardBackupJoiners = [];
    this.discardedBackups = [];
    this.pendingBackupsArr = [];
    this.discardedAllBackups = false;
    this._register(fileService);
    this._register(lifecycleService);
  }
  testGetFileService() {
    return this.fileService;
  }
  async waitForAllBackups() {
    await Promise.all(this.pendingBackupsArr);
  }
  joinBackupResource() {
    return new Promise((resolve) => this.backupResourceJoiners.push(resolve));
  }
  async backup(identifier, content, versionId, meta, token) {
    const p = super.backup(identifier, content, versionId, meta, token);
    const removeFromPendingBackups = insert(this.pendingBackupsArr, p.then(void 0, void 0));
    try {
      await p;
    } finally {
      removeFromPendingBackups();
    }
    while (this.backupResourceJoiners.length) {
      this.backupResourceJoiners.pop()();
    }
  }
  joinDiscardBackup() {
    return new Promise((resolve) => this.discardBackupJoiners.push(resolve));
  }
  async discardBackup(identifier) {
    await super.discardBackup(identifier);
    this.discardedBackups.push(identifier);
    while (this.discardBackupJoiners.length) {
      this.discardBackupJoiners.pop()();
    }
  }
  async discardBackups(filter) {
    this.discardedAllBackups = true;
    return super.discardBackups(filter);
  }
  async getBackupContents(identifier) {
    const backupResource = this.toBackupResource(identifier);
    const fileContents = await this.fileService.readFile(backupResource);
    return fileContents.value.toString();
  }
}
class TestIPCFileSystemProvider {
  constructor() {
    this.capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
    this.onDidChangeCapabilities = Event.None;
    this.onDidChangeFile = Event.None;
  }
  async stat(resource) {
    const { ipcRenderer } = require("electron");
    const stats = await ipcRenderer.invoke("vscode:statFile", resource.fsPath);
    return {
      type: stats.isDirectory ? FileType.Directory : stats.isFile ? FileType.File : FileType.Unknown,
      ctime: stats.ctimeMs,
      mtime: stats.mtimeMs,
      size: stats.size,
      permissions: stats.isReadonly ? 1 : void 0
    };
  }
  async readFile(resource) {
    const { ipcRenderer } = require("electron");
    const result = await ipcRenderer.invoke("vscode:readFile", resource.fsPath);
    return VSBuffer.wrap(result).buffer;
  }
  watch(resource, opts) {
    return { dispose: () => {
    } };
  }
  mkdir(resource) {
    throw new Error("mkdir not implemented in test provider");
  }
  readdir(resource) {
    throw new Error("readdir not implemented in test provider");
  }
  delete(resource, opts) {
    throw new Error("delete not implemented in test provider");
  }
  rename(from, to, opts) {
    throw new Error("rename not implemented in test provider");
  }
  writeFile(resource, content, opts) {
    throw new Error("writeFile not implemented in test provider");
  }
  readFileStream(resource, opts, token) {
    throw new Error("readFileStream not implemented in test provider");
  }
  open(resource, opts) {
    throw new Error("open not implemented in test provider");
  }
  close(fd) {
    throw new Error("close not implemented in test provider");
  }
  read(fd, pos, data, offset, length) {
    throw new Error("read not implemented in test provider");
  }
  write(fd, pos, data, offset, length) {
    throw new Error("write not implemented in test provider");
  }
}
export {
  TestExtensionTipsService,
  TestIPCFileSystemProvider,
  TestNativeHostService,
  TestNativeTextFileServiceWithEncodingOverrides,
  TestNativeWorkingCopyBackupService,
  TestServiceAccessor,
  TestSharedProcessService,
  workbenchInstantiationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2VsZWN0cm9uLWJyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaW5zZXJ0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyLCBWU0J1ZmZlclJlYWRhYmxlLCBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZURpYWxvZ1NlcnZpY2UsIElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSwgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEFic3RyYWN0TmF0aXZlRXh0ZW5zaW9uVGlwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25UaXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZVN5c3RlbVByb3ZpZGVyLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIElGaWxlUmVhZFN0cmVhbU9wdGlvbnMsIElGaWxlV3JpdGVPcHRpb25zLCBJRmlsZU9wZW5PcHRpb25zLCBJRmlsZURlbGV0ZU9wdGlvbnMsIElGaWxlT3ZlcndyaXRlT3B0aW9ucywgSVN0YXQsIEZpbGVUeXBlLCBJV2F0Y2hPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVNoYXJlZFByb2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaXBjL2VsZWN0cm9uLWJyb3dzZXIvc2VydmljZXMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdE9wdGlvbnMsIElOYXRpdmVIb3N0U2VydmljZSwgSU5hdGl2ZVN5c3RlbVdpZGVLZXliaW5kaW5nLCBJTmF0aXZlU3lzdGVtV2lkZUtleWJpbmRpbmdSZXN1bHQsIElOYXRpdmVaaXBGaWxlLCBJT1NQcm9wZXJ0aWVzLCBJT1NTdGF0aXN0aWNzLCBJVG9hc3RPcHRpb25zLCBJVG9hc3RSZXN1bHQsIFBvd2VyU2F2ZUJsb2NrZXJUeXBlLCBTeXN0ZW1JZGxlU3RhdGUsIFRoZXJtYWxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhJbmZvLCBDcmVkZW50aWFscyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElQYXJ0c1NwbGFzaCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlVXNlckRhdGFQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhL2NvbW1vbi9maWxlVXNlckRhdGFQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElDb2xvclNjaGVtZSwgSU9wZW5lZE1haW5XaW5kb3csIElPcGVuRW1wdHlXaW5kb3dPcHRpb25zLCBJT3BlbldpbmRvd09wdGlvbnMsIElQb2ludCwgSVJlY3RhbmdsZSwgSVdpbmRvd09wZW5hYmxlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dEVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgTmF0aXZlVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvZWxlY3Ryb24tYnJvd3Nlci9uYXRpdmVUZXh0RmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5SWRlbnRpZmllciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5QmFja3VwLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2VsZWN0cm9uLWJyb3dzZXIvd29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIGFzIGJyb3dzZXJXb3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSwgSVRlc3RJbnN0YW50aWF0aW9uU2VydmljZSwgVGVzdEVuY29kaW5nT3JhY2xlLCBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlLCBUZXN0RmlsZURpYWxvZ1NlcnZpY2UsIFRlc3RGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0TGlmZWN5Y2xlU2VydmljZSwgVGVzdFRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uL2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSwgVGVzdEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBSZWFkYWJsZVN0cmVhbUV2ZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmVhbS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXN0U2hhcmVkUHJvY2Vzc1NlcnZpY2UgaW1wbGVtZW50cyBJU2hhcmVkUHJvY2Vzc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNyZWF0ZVJhd0Nvbm5lY3Rpb24oKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBJbXBsZW1lbnRlZCcpOyB9XG5cdGdldENoYW5uZWwoY2hhbm5lbE5hbWU6IHN0cmluZyk6IGFueSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0cmVnaXN0ZXJDaGFubmVsKGNoYW5uZWxOYW1lOiBzdHJpbmcsIGNoYW5uZWw6IGFueSk6IHZvaWQgeyB9XG5cdG5vdGlmeVJlc3RvcmVkKCk6IHZvaWQgeyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TmF0aXZlSG9zdFNlcnZpY2UgaW1wbGVtZW50cyBJTmF0aXZlSG9zdFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHdpbmRvd0lkID0gLTE7XG5cblx0cmVhZG9ubHkgb25EaWRPcGVuTWFpbldpbmRvdzogRXZlbnQ8bnVtYmVyPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkTWF4aW1pemVXaW5kb3c6IEV2ZW50PG51bWJlcj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZFVubWF4aW1pemVXaW5kb3c6IEV2ZW50PG51bWJlcj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzTWFpbldpbmRvdzogRXZlbnQ8bnVtYmVyPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQmx1ck1haW5XaW5kb3c6IEV2ZW50PG51bWJlcj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzTWFpbk9yQXV4aWxpYXJ5V2luZG93OiBFdmVudDxudW1iZXI+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRCbHVyTWFpbk9yQXV4aWxpYXJ5V2luZG93OiBFdmVudDxudW1iZXI+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRTdXNwZW5kT1M6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRSZXN1bWVPUzogRXZlbnQ8dW5rbm93bj4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9uQmF0dGVyeVBvd2VyOiBFdmVudDxib29sZWFuPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGhlcm1hbFN0YXRlOiBFdmVudDxUaGVybWFsU3RhdGU+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTcGVlZExpbWl0OiBFdmVudDxudW1iZXI+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25XaWxsU2h1dGRvd25PUzogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZExvY2tTY3JlZW46IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRVbmxvY2tTY3JlZW46IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VDb2xvclNjaGVtZSA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlUGFzc3dvcmQgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJXaW5kb3dTeXN0ZW1Db250ZXh0TWVudTogRXZlbnQ8eyB3aW5kb3dJZDogbnVtYmVyOyB4OiBudW1iZXI7IHk6IG51bWJlciB9PiA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlV2luZG93RnVsbFNjcmVlbiA9IEV2ZW50Lk5vbmU7XG5cdG9uRGlkQ2hhbmdlV2luZG93QWx3YXlzT25Ub3AgPSBFdmVudC5Ob25lO1xuXHRvbkRpZENoYW5nZURpc3BsYXkgPSBFdmVudC5Ob25lO1xuXG5cdHdpbmRvd0NvdW50ID0gUHJvbWlzZS5yZXNvbHZlKDEpO1xuXHRnZXRXaW5kb3dDb3VudCgpOiBQcm9taXNlPG51bWJlcj4geyByZXR1cm4gdGhpcy53aW5kb3dDb3VudDsgfVxuXG5cdGFzeW5jIGdldFdpbmRvd3MoKTogUHJvbWlzZTxJT3BlbmVkTWFpbldpbmRvd1tdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBnZXRBY3RpdmVXaW5kb3dJZCgpOiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldEFjdGl2ZVdpbmRvd1Bvc2l0aW9uKCk6IFByb21pc2U8SVJlY3RhbmdsZSB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldE5hdGl2ZVdpbmRvd0hhbmRsZSh3aW5kb3dJZDogbnVtYmVyKTogUHJvbWlzZTxWU0J1ZmZlciB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0b3BlbldpbmRvdyhvcHRpb25zPzogSU9wZW5FbXB0eVdpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRvcGVuV2luZG93KHRvT3BlbjogSVdpbmRvd09wZW5hYmxlW10sIG9wdGlvbnM/OiBJT3BlbldpbmRvd09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRvcGVuV2luZG93KGFyZzE/OiBJT3BlbkVtcHR5V2luZG93T3B0aW9ucyB8IElXaW5kb3dPcGVuYWJsZVtdLCBhcmcyPzogSU9wZW5XaW5kb3dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0YXN5bmMgb3BlbkFnZW50c1dpbmRvdyhfb3B0aW9ucz86IHsgZm9sZGVyVXJpPzogVXJpQ29tcG9uZW50czsgc2Vzc2lvblJlc291cmNlPzogVXJpQ29tcG9uZW50cyB9KTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRhc3luYyBzeW5jU3lzdGVtV2lkZUtleWJpbmRpbmdzKF9rZXliaW5kaW5nczogSU5hdGl2ZVN5c3RlbVdpZGVLZXliaW5kaW5nW10pOiBQcm9taXNlPElOYXRpdmVTeXN0ZW1XaWRlS2V5YmluZGluZ1Jlc3VsdD4geyByZXR1cm4geyBmYWlsZWQ6IFtdIH07IH1cblxuXHRhc3luYyB0b2dnbGVGdWxsU2NyZWVuKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGlzTWF4aW1pemVkKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gdHJ1ZTsgfVxuXHRhc3luYyBpc0Z1bGxTY3JlZW4oKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiB0cnVlOyB9XG5cdGFzeW5jIG1heGltaXplV2luZG93KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHVubWF4aW1pemVXaW5kb3coKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgbWluaW1pemVXaW5kb3coKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgbW92ZVdpbmRvd1RvcChvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgaXNXaW5kb3dBbHdheXNPblRvcChvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyB0b2dnbGVXaW5kb3dBbHdheXNPblRvcChvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2V0V2luZG93QWx3YXlzT25Ub3AoYWx3YXlzT25Ub3A6IGJvb2xlYW4sIG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXRDdXJzb3JTY3JlZW5Qb2ludCgpOiBQcm9taXNlPHsgcmVhZG9ubHkgcG9pbnQ6IElQb2ludDsgcmVhZG9ubHkgZGlzcGxheTogSVJlY3RhbmdsZSB9PiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhc3luYyBwb3NpdGlvbldpbmRvdyhwb3NpdGlvbjogSVJlY3RhbmdsZSwgb3B0aW9ucz86IElOYXRpdmVIb3N0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHVwZGF0ZVdpbmRvd0NvbnRyb2xzKG9wdGlvbnM6IHsgaGVpZ2h0PzogbnVtYmVyOyBiYWNrZ3JvdW5kQ29sb3I/OiBzdHJpbmc7IGZvcmVncm91bmRDb2xvcj86IHN0cmluZyB9KTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgdXBkYXRlV2luZG93QWNjZW50Q29sb3IoY29sb3I6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNldE1pbmltdW1TaXplKHdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQsIGhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2F2ZVdpbmRvd1NwbGFzaCh2YWx1ZTogSVBhcnRzU3BsYXNoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2V0QmFja2dyb3VuZFRocm90dGxpbmcodGhyb3R0bGluZzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGZvY3VzV2luZG93KG9wdGlvbnM/OiBJTmF0aXZlSG9zdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzaG93TWVzc2FnZUJveChvcHRpb25zOiBFbGVjdHJvbi5NZXNzYWdlQm94T3B0aW9ucyk6IFByb21pc2U8RWxlY3Ryb24uTWVzc2FnZUJveFJldHVyblZhbHVlPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhc3luYyBzaG93U2F2ZURpYWxvZyhvcHRpb25zOiBFbGVjdHJvbi5TYXZlRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8RWxlY3Ryb24uU2F2ZURpYWxvZ1JldHVyblZhbHVlPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhc3luYyBzaG93T3BlbkRpYWxvZyhvcHRpb25zOiBFbGVjdHJvbi5PcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8RWxlY3Ryb24uT3BlbkRpYWxvZ1JldHVyblZhbHVlPiB7IHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTsgfVxuXHRhc3luYyBwaWNrRmlsZUZvbGRlckFuZE9wZW4ob3B0aW9uczogSU5hdGl2ZU9wZW5EaWFsb2dPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcGlja0ZpbGVBbmRPcGVuKG9wdGlvbnM6IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHBpY2tGb2xkZXJBbmRPcGVuKG9wdGlvbnM6IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHBpY2tXb3Jrc3BhY2VBbmRPcGVuKG9wdGlvbnM6IElOYXRpdmVPcGVuRGlhbG9nT3B0aW9ucyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNob3dJdGVtSW5Gb2xkZXIocGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2V0UmVwcmVzZW50ZWRGaWxlbmFtZShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBpc0FkbWluKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gZmFsc2U7IH1cblx0YXN5bmMgd3JpdGVFbGV2YXRlZChzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBpc1J1bm5pbmdVbmRlckFSTTY0VHJhbnNsYXRpb24oKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBnZXRPU1Byb3BlcnRpZXMoKTogUHJvbWlzZTxJT1NQcm9wZXJ0aWVzPiB7IHJldHVybiBPYmplY3QuY3JlYXRlKG51bGwpOyB9XG5cdGFzeW5jIGdldE9TU3RhdGlzdGljcygpOiBQcm9taXNlPElPU1N0YXRpc3RpY3M+IHsgcmV0dXJuIE9iamVjdC5jcmVhdGUobnVsbCk7IH1cblx0YXN5bmMgZ2V0T1NWaXJ0dWFsTWFjaGluZUhpbnQoKTogUHJvbWlzZTxudW1iZXI+IHsgcmV0dXJuIDA7IH1cblx0YXN5bmMgZ2V0T1NDb2xvclNjaGVtZSgpOiBQcm9taXNlPElDb2xvclNjaGVtZT4geyByZXR1cm4geyBkYXJrOiB0cnVlLCBoaWdoQ29udHJhc3Q6IGZhbHNlIH07IH1cblx0YXN5bmMgaGFzV1NMRmVhdHVyZUluc3RhbGxlZCgpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIGdldFByb2Nlc3NJZCgpOiBQcm9taXNlPG51bWJlcj4geyB0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7IH1cblx0YXN5bmMga2lsbFByb2Nlc3MoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2V0RG9jdW1lbnRFZGl0ZWQoZWRpdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgb3BlbkV4dGVybmFsKHVybDogc3RyaW5nLCBkZWZhdWx0QXBwbGljYXRpb24/OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHVwZGF0ZVRvdWNoQmFyKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG1vdmVJdGVtVG9UcmFzaCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXRNZWRpYUFjY2Vzc1N0YXR1cyhfbWVkaWFUeXBlOiAnbWljcm9waG9uZScgfCAnY2FtZXJhJyB8ICdzY3JlZW4nKTogUHJvbWlzZTwnbm90LWRldGVybWluZWQnIHwgJ2dyYW50ZWQnIHwgJ2RlbmllZCcgfCAncmVzdHJpY3RlZCcgfCAndW5rbm93bic+IHsgcmV0dXJuICdncmFudGVkJzsgfVxuXHRhc3luYyBuZXdXaW5kb3dUYWIoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgc2hvd1ByZXZpb3VzV2luZG93VGFiKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHNob3dOZXh0V2luZG93VGFiKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIG1vdmVXaW5kb3dUYWJUb05ld1dpbmRvdygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBtZXJnZUFsbFdpbmRvd1RhYnMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgdG9nZ2xlV2luZG93VGFic0JhcigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBpbnN0YWxsU2hlbGxDb21tYW5kKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHVuaW5zdGFsbFNoZWxsQ29tbWFuZCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBub3RpZnlSZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZWxhdW5jaChvcHRpb25zPzogeyBhZGRBcmdzPzogc3RyaW5nW10gfCB1bmRlZmluZWQ7IHJlbW92ZUFyZ3M/OiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmVsb2FkKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGNsb3NlV2luZG93KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHF1aXQoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZXhpdChjb2RlOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBvcGVuRGV2VG9vbHMob3B0aW9ucz86IFBhcnRpYWw8RWxlY3Ryb24uT3BlbkRldlRvb2xzT3B0aW9ucz4gJiBJTmF0aXZlSG9zdE9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyB0b2dnbGVEZXZUb29scygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBzdG9wVHJhY2luZygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBvcGVuRGV2VG9vbHNXaW5kb3codXJsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBvcGVuR1BVSW5mb1dpbmRvdygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBvcGVuQ29udGVudFRyYWNpbmdXaW5kb3coKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmVzb2x2ZVByb3h5KHVybDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyByZXNvbHZlUHJveHlXaXRoUGFja2FnZSgpIHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIHJlYWRQcm94eUNvbmZpZ1dpdGhQYWNrYWdlKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbnZpcm9ubWVudDoge30sXG5cdFx0XHRhdXRvRGV0ZWN0OiBmYWxzZSxcblx0XHRcdHdwYWREaGNwOiB7IHN0YXRlOiAndW5zdXBwb3J0ZWQnIGFzIGNvbnN0IH0sXG5cdFx0XHR3cGFkRG5zOiB7IHN0YXRlOiAnZGlzYWJsZWQnIGFzIGNvbnN0IH0sXG5cdFx0XHRjb25maWd1cmVkUGFjOiB7IHN0YXRlOiAndW5jb25maWd1cmVkJyBhcyBjb25zdCB9XG5cdFx0fTtcblx0fVxuXHRhc3luYyBsb29rdXBBdXRob3JpemF0aW9uKGF1dGhJbmZvOiBBdXRoSW5mbyk6IFByb21pc2U8Q3JlZGVudGlhbHMgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb24odXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGxvYWRDZXJ0aWZpY2F0ZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgaXNQb3J0RnJlZSgpIHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTsgfVxuXHRhc3luYyBmaW5kRnJlZVBvcnQoc3RhcnRQb3J0OiBudW1iZXIsIGdpdmVVcEFmdGVyOiBudW1iZXIsIHRpbWVvdXQ6IG51bWJlciwgc3RyaWRlPzogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHsgcmV0dXJuIC0xOyB9XG5cdGFzeW5jIHJlYWRDbGlwYm9hcmRUZXh0KHR5cGU/OiAnc2VsZWN0aW9uJyB8ICdjbGlwYm9hcmQnIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuICcnOyB9XG5cdGFzeW5jIHdyaXRlQ2xpcGJvYXJkVGV4dCh0ZXh0OiBzdHJpbmcsIHR5cGU/OiAnc2VsZWN0aW9uJyB8ICdjbGlwYm9hcmQnIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmVhZENsaXBib2FyZEZpbmRUZXh0KCk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiAnJzsgfVxuXHRhc3luYyB3cml0ZUNsaXBib2FyZEZpbmRUZXh0KHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHdyaXRlQ2xpcGJvYXJkQnVmZmVyKGZvcm1hdDogc3RyaW5nLCBidWZmZXI6IFZTQnVmZmVyLCB0eXBlPzogJ3NlbGVjdGlvbicgfCAnY2xpcGJvYXJkJyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIHRyaWdnZXJQYXN0ZShvcHRpb25zPzogSU5hdGl2ZUhvc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmVhZEltYWdlKCk6IFByb21pc2U8VWludDhBcnJheT4geyByZXR1cm4gVWludDhBcnJheS5mcm9tKFtdKTsgfVxuXHRhc3luYyByZWFkQ2xpcGJvYXJkQnVmZmVyKGZvcm1hdDogc3RyaW5nKTogUHJvbWlzZTxWU0J1ZmZlcj4geyByZXR1cm4gVlNCdWZmZXIud3JhcChVaW50OEFycmF5LmZyb20oW10pKTsgfVxuXHRhc3luYyBoYXNDbGlwYm9hcmQoZm9ybWF0OiBzdHJpbmcsIHR5cGU/OiAnc2VsZWN0aW9uJyB8ICdjbGlwYm9hcmQnIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyB3aW5kb3dzR2V0U3RyaW5nUmVnS2V5KGhpdmU6ICdIS0VZX0NVUlJFTlRfVVNFUicgfCAnSEtFWV9MT0NBTF9NQUNISU5FJyB8ICdIS0VZX0NMQVNTRVNfUk9PVCcgfCAnSEtFWV9VU0VSUycgfCAnSEtFWV9DVVJSRU5UX0NPTkZJRycsIHBhdGg6IHN0cmluZywgbmFtZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBjcmVhdGVaaXBGaWxlKHppcFBhdGg6IFVSSSwgZmlsZXM6IElOYXRpdmVaaXBGaWxlW10pOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBwcm9maWxlUmVuZGVyZXIoKTogUHJvbWlzZTxhbnk+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH1cblx0YXN5bmMgc3RhcnRUcmFjaW5nKCk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoKTsgfVxuXHRhc3luYyBnZXRTY3JlZW5zaG90KHJlY3Q/OiBJUmVjdGFuZ2xlKTogUHJvbWlzZTxWU0J1ZmZlciB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHVwbG9hZEZpbGVWaWFNb2JpbGVBcGkoX3Rva2VuOiBzdHJpbmcsIF9yZXBvSWQ6IHN0cmluZywgZmlsZU5hbWU6IHN0cmluZywgX2ZpbGVCeXRlczogVlNCdWZmZXIsIGNvbnRlbnRUeXBlOiBzdHJpbmcpOiBQcm9taXNlPHsgZmlsZU5hbWU6IHN0cmluZzsgYXNzZXRVcmw6IHN0cmluZzsgY29udGVudFR5cGU6IHN0cmluZyB9PiB7IHJldHVybiB7IGZpbGVOYW1lLCBhc3NldFVybDogJycsIGNvbnRlbnRUeXBlIH07IH1cblx0YXN5bmMgc2hvd1RvYXN0KG9wdGlvbnM6IElUb2FzdE9wdGlvbnMpOiBQcm9taXNlPElUb2FzdFJlc3VsdD4geyByZXR1cm4geyBzdXBwb3J0ZWQ6IGZhbHNlLCBjbGlja2VkOiBmYWxzZSB9OyB9XG5cdGFzeW5jIGNsZWFyVG9hc3QoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGNsZWFyVG9hc3RzKCk6IFByb21pc2U8dm9pZD4geyB9XG5cblx0Ly8gUG93ZXIgQVBJc1xuXHRhc3luYyBnZXRTeXN0ZW1JZGxlU3RhdGUoaWRsZVRocmVzaG9sZDogbnVtYmVyKTogUHJvbWlzZTxTeXN0ZW1JZGxlU3RhdGU+IHsgcmV0dXJuICd1bmtub3duJzsgfVxuXHRhc3luYyBnZXRTeXN0ZW1JZGxlVGltZSgpOiBQcm9taXNlPG51bWJlcj4geyByZXR1cm4gMDsgfVxuXHRhc3luYyBnZXRDdXJyZW50VGhlcm1hbFN0YXRlKCk6IFByb21pc2U8VGhlcm1hbFN0YXRlPiB7IHJldHVybiAndW5rbm93bic7IH1cblx0YXN5bmMgaXNPbkJhdHRlcnlQb3dlcigpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHN0YXJ0UG93ZXJTYXZlQmxvY2tlcih0eXBlOiBQb3dlclNhdmVCbG9ja2VyVHlwZSk6IFByb21pc2U8bnVtYmVyPiB7IHJldHVybiAtMTsgfVxuXHRhc3luYyBzdG9wUG93ZXJTYXZlQmxvY2tlcihpZDogbnVtYmVyKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBpc1Bvd2VyU2F2ZUJsb2NrZXJTdGFydGVkKGlkOiBudW1iZXIpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0RXh0ZW5zaW9uVGlwc1NlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdE5hdGl2ZUV4dGVuc2lvblRpcHNTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25Ob3RpZmljYXRpb25TZXJ2aWNlIGV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZTogSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWUsIG5hdGl2ZUhvc3RTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSwgZmlsZVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uob3ZlcnJpZGVzPzoge1xuXHRlbnZpcm9ubWVudFNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSUVudmlyb25tZW50U2VydmljZTtcblx0ZmlsZVNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSUZpbGVTZXJ2aWNlO1xuXHRjb25maWd1cmF0aW9uU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHRleHRGaWxlU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJVGV4dEZpbGVTZXJ2aWNlO1xuXHRwYXRoU2VydmljZT86IChpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiBJUGF0aFNlcnZpY2U7XG5cdGVkaXRvclNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSUVkaXRvclNlcnZpY2U7XG5cdGNvbnRleHRLZXlTZXJ2aWNlPzogKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpID0+IElDb250ZXh0S2V5U2VydmljZTtcblx0dGV4dEVkaXRvclNlcnZpY2U/OiAoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkgPT4gSVRleHRFZGl0b3JTZXJ2aWNlO1xufSwgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCkpOiBJVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBicm93c2VyV29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdHdvcmtpbmdDb3B5QmFja3VwU2VydmljZTogKCkgPT4gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0TmF0aXZlV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlKCkpLFxuXHRcdC4uLm92ZXJyaWRlc1xuXHR9LCBkaXNwb3NhYmxlcyk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTmF0aXZlSG9zdFNlcnZpY2UsIG5ldyBUZXN0TmF0aXZlSG9zdFNlcnZpY2UoKSk7XG5cblx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xufVxuXG5leHBvcnQgY2xhc3MgVGVzdFNlcnZpY2VBY2Nlc3NvciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwdWJsaWMgbGlmZWN5Y2xlU2VydmljZTogVGVzdExpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHVibGljIHRleHRGaWxlU2VydmljZTogVGVzdFRleHRGaWxlU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgcHVibGljIGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHVibGljIGNvbnRleHRTZXJ2aWNlOiBUZXN0Q29udGV4dFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHVibGljIG1vZGVsU2VydmljZTogTW9kZWxTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHVibGljIGZpbGVTZXJ2aWNlOiBUZXN0RmlsZVNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwdWJsaWMgbmF0aXZlSG9zdFNlcnZpY2U6IFRlc3ROYXRpdmVIb3N0U2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHB1YmxpYyBmaWxlRGlhbG9nU2VydmljZTogVGVzdEZpbGVEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHB1YmxpYyB3b3JraW5nQ29weUJhY2t1cFNlcnZpY2U6IFRlc3ROYXRpdmVXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHVibGljIHdvcmtpbmdDb3B5U2VydmljZTogSVdvcmtpbmdDb3B5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHVibGljIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0TmF0aXZlVGV4dEZpbGVTZXJ2aWNlV2l0aEVuY29kaW5nT3ZlcnJpZGVzIGV4dGVuZHMgTmF0aXZlVGV4dEZpbGVTZXJ2aWNlIHtcblxuXHRwcml2YXRlIF90ZXN0RW5jb2Rpbmc6IFRlc3RFbmNvZGluZ09yYWNsZSB8IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgZ2V0IGVuY29kaW5nKCk6IFRlc3RFbmNvZGluZ09yYWNsZSB7XG5cdFx0aWYgKCF0aGlzLl90ZXN0RW5jb2RpbmcpIHtcblx0XHRcdHRoaXMuX3Rlc3RFbmNvZGluZyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdEVuY29kaW5nT3JhY2xlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Rlc3RFbmNvZGluZztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdE5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSBleHRlbmRzIE5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGJhY2t1cFJlc291cmNlSm9pbmVyczogRnVuY3Rpb25bXTtcblx0cHJpdmF0ZSBkaXNjYXJkQmFja3VwSm9pbmVyczogRnVuY3Rpb25bXTtcblx0ZGlzY2FyZGVkQmFja3VwczogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdO1xuXHRkaXNjYXJkZWRBbGxCYWNrdXBzOiBib29sZWFuO1xuXHRwcml2YXRlIHBlbmRpbmdCYWNrdXBzQXJyOiBQcm9taXNlPHZvaWQ+W107XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gVGVzdEVudmlyb25tZW50U2VydmljZTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSk7XG5cdFx0Y29uc3QgbGlmZWN5Y2xlU2VydmljZSA9IG5ldyBUZXN0TGlmZWN5Y2xlU2VydmljZSgpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHN1cGVyKGVudmlyb25tZW50U2VydmljZSBhcyBhbnksIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBsaWZlY3ljbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgaW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIpKTtcblx0XHRjb25zdCB1cmlJZGVudGl0eVNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgVXNlckRhdGFQcm9maWxlc1NlcnZpY2UoZW52aXJvbm1lbnRTZXJ2aWNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCB0aGlzLl9yZWdpc3RlcihuZXcgRmlsZVVzZXJEYXRhUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBpbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciwgU2NoZW1hcy52c2NvZGVVc2VyRGF0YSwgdXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpKSk7XG5cblx0XHR0aGlzLmJhY2t1cFJlc291cmNlSm9pbmVycyA9IFtdO1xuXHRcdHRoaXMuZGlzY2FyZEJhY2t1cEpvaW5lcnMgPSBbXTtcblx0XHR0aGlzLmRpc2NhcmRlZEJhY2t1cHMgPSBbXTtcblx0XHR0aGlzLnBlbmRpbmdCYWNrdXBzQXJyID0gW107XG5cdFx0dGhpcy5kaXNjYXJkZWRBbGxCYWNrdXBzID0gZmFsc2U7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGlmZWN5Y2xlU2VydmljZSk7XG5cdH1cblxuXHR0ZXN0R2V0RmlsZVNlcnZpY2UoKTogSUZpbGVTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZTtcblx0fVxuXG5cdGFzeW5jIHdhaXRGb3JBbGxCYWNrdXBzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHRoaXMucGVuZGluZ0JhY2t1cHNBcnIpO1xuXHR9XG5cblx0am9pbkJhY2t1cFJlc291cmNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHRoaXMuYmFja3VwUmVzb3VyY2VKb2luZXJzLnB1c2gocmVzb2x2ZSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgYmFja3VwKGlkZW50aWZpZXI6IElXb3JraW5nQ29weUlkZW50aWZpZXIsIGNvbnRlbnQ/OiBWU0J1ZmZlclJlYWRhYmxlU3RyZWFtIHwgVlNCdWZmZXJSZWFkYWJsZSwgdmVyc2lvbklkPzogbnVtYmVyLCBtZXRhPzogYW55LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcCA9IHN1cGVyLmJhY2t1cChpZGVudGlmaWVyLCBjb250ZW50LCB2ZXJzaW9uSWQsIG1ldGEsIHRva2VuKTtcblx0XHRjb25zdCByZW1vdmVGcm9tUGVuZGluZ0JhY2t1cHMgPSBpbnNlcnQodGhpcy5wZW5kaW5nQmFja3Vwc0FyciwgcC50aGVuKHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVtb3ZlRnJvbVBlbmRpbmdCYWNrdXBzKCk7XG5cdFx0fVxuXG5cdFx0d2hpbGUgKHRoaXMuYmFja3VwUmVzb3VyY2VKb2luZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5iYWNrdXBSZXNvdXJjZUpvaW5lcnMucG9wKCkhKCk7XG5cdFx0fVxuXHR9XG5cblx0am9pbkRpc2NhcmRCYWNrdXAoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gdGhpcy5kaXNjYXJkQmFja3VwSm9pbmVycy5wdXNoKHJlc29sdmUpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGRpc2NhcmRCYWNrdXAoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLmRpc2NhcmRCYWNrdXAoaWRlbnRpZmllcik7XG5cdFx0dGhpcy5kaXNjYXJkZWRCYWNrdXBzLnB1c2goaWRlbnRpZmllcik7XG5cblx0XHR3aGlsZSAodGhpcy5kaXNjYXJkQmFja3VwSm9pbmVycy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuZGlzY2FyZEJhY2t1cEpvaW5lcnMucG9wKCkhKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGlzY2FyZEJhY2t1cHMoZmlsdGVyPzogeyBleGNlcHQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNjYXJkZWRBbGxCYWNrdXBzID0gdHJ1ZTtcblxuXHRcdHJldHVybiBzdXBlci5kaXNjYXJkQmFja3VwcyhmaWx0ZXIpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QmFja3VwQ29udGVudHMoaWRlbnRpZmllcjogSVdvcmtpbmdDb3B5SWRlbnRpZmllcik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgYmFja3VwUmVzb3VyY2UgPSB0aGlzLnRvQmFja3VwUmVzb3VyY2UoaWRlbnRpZmllcik7XG5cblx0XHRjb25zdCBmaWxlQ29udGVudHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGJhY2t1cFJlc291cmNlKTtcblxuXHRcdHJldHVybiBmaWxlQ29udGVudHMudmFsdWUudG9TdHJpbmcoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVGVzdElQQ0ZpbGVTeXN0ZW1Qcm92aWRlciBpbXBsZW1lbnRzIElGaWxlU3lzdGVtUHJvdmlkZXIge1xuXG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcyA9IEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5GaWxlUmVhZFdyaXRlIHwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2FwYWJpbGl0aWVzID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlID0gRXZlbnQuTm9uZTtcblxuXHRhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElTdGF0PiB7XG5cdFx0Y29uc3QgeyBpcGNSZW5kZXJlciB9ID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcblx0XHRjb25zdCBzdGF0cyA9IGF3YWl0IGlwY1JlbmRlcmVyLmludm9rZSgndnNjb2RlOnN0YXRGaWxlJywgcmVzb3VyY2UuZnNQYXRoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogc3RhdHMuaXNEaXJlY3RvcnkgPyBGaWxlVHlwZS5EaXJlY3RvcnkgOiAoc3RhdHMuaXNGaWxlID8gRmlsZVR5cGUuRmlsZSA6IEZpbGVUeXBlLlVua25vd24pLFxuXHRcdFx0Y3RpbWU6IHN0YXRzLmN0aW1lTXMsXG5cdFx0XHRtdGltZTogc3RhdHMubXRpbWVNcyxcblx0XHRcdHNpemU6IHN0YXRzLnNpemUsXG5cdFx0XHRwZXJtaXNzaW9uczogc3RhdHMuaXNSZWFkb25seSA/IDEgLyogRmlsZVBlcm1pc3Npb24uUmVhZG9ubHkgKi8gOiB1bmRlZmluZWRcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VWludDhBcnJheT4ge1xuXHRcdGNvbnN0IHsgaXBjUmVuZGVyZXIgfSA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKCd2c2NvZGU6cmVhZEZpbGUnLCByZXNvdXJjZS5mc1BhdGgpO1xuXHRcdHJldHVybiBWU0J1ZmZlci53cmFwKHJlc3VsdCkuYnVmZmVyO1xuXHR9XG5cblx0d2F0Y2gocmVzb3VyY2U6IFVSSSwgb3B0czogSVdhdGNoT3B0aW9ucyk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07IH1cblx0bWtkaXIocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ21rZGlyIG5vdCBpbXBsZW1lbnRlZCBpbiB0ZXN0IHByb3ZpZGVyJyk7IH1cblx0cmVhZGRpcihyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxbc3RyaW5nLCBGaWxlVHlwZV1bXT4geyB0aHJvdyBuZXcgRXJyb3IoJ3JlYWRkaXIgbm90IGltcGxlbWVudGVkIGluIHRlc3QgcHJvdmlkZXInKTsgfVxuXHRkZWxldGUocmVzb3VyY2U6IFVSSSwgb3B0czogSUZpbGVEZWxldGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignZGVsZXRlIG5vdCBpbXBsZW1lbnRlZCBpbiB0ZXN0IHByb3ZpZGVyJyk7IH1cblx0cmVuYW1lKGZyb206IFVSSSwgdG86IFVSSSwgb3B0czogSUZpbGVPdmVyd3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcigncmVuYW1lIG5vdCBpbXBsZW1lbnRlZCBpbiB0ZXN0IHByb3ZpZGVyJyk7IH1cblx0d3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IFVpbnQ4QXJyYXksIG9wdHM6IElGaWxlV3JpdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7IHRocm93IG5ldyBFcnJvcignd3JpdGVGaWxlIG5vdCBpbXBsZW1lbnRlZCBpbiB0ZXN0IHByb3ZpZGVyJyk7IH1cblx0cmVhZEZpbGVTdHJlYW0/KHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlUmVhZFN0cmVhbU9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFJlYWRhYmxlU3RyZWFtRXZlbnRzPFVpbnQ4QXJyYXk+IHsgdGhyb3cgbmV3IEVycm9yKCdyZWFkRmlsZVN0cmVhbSBub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBwcm92aWRlcicpOyB9XG5cdG9wZW4/KHJlc291cmNlOiBVUkksIG9wdHM6IElGaWxlT3Blbk9wdGlvbnMpOiBQcm9taXNlPG51bWJlcj4geyB0aHJvdyBuZXcgRXJyb3IoJ29wZW4gbm90IGltcGxlbWVudGVkIGluIHRlc3QgcHJvdmlkZXInKTsgfVxuXHRjbG9zZT8oZmQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4geyB0aHJvdyBuZXcgRXJyb3IoJ2Nsb3NlIG5vdCBpbXBsZW1lbnRlZCBpbiB0ZXN0IHByb3ZpZGVyJyk7IH1cblx0cmVhZD8oZmQ6IG51bWJlciwgcG9zOiBudW1iZXIsIGRhdGE6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7IHRocm93IG5ldyBFcnJvcigncmVhZCBub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBwcm92aWRlcicpOyB9XG5cdHdyaXRlPyhmZDogbnVtYmVyLCBwb3M6IG51bWJlciwgZGF0YTogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXI+IHsgdGhyb3cgbmV3IEVycm9yKCd3cml0ZSBub3QgaW1wbGVtZW50ZWQgaW4gdGVzdCBwcm92aWRlcicpOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUEwRDtBQUVuRSxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBb0M7QUFDN0MsU0FBUyxlQUFlO0FBRXhCLFNBQVMscUJBQXFCO0FBSTlCLFNBQVMsMEJBQW9EO0FBQzdELFNBQThCLGlDQUFpQztBQUMvRCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLG1EQUFtRDtBQUM1RCxTQUFTLGNBQW1DLGdDQUErSSxnQkFBK0I7QUFDMU4sU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFHM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBNkIsMEJBQTBOO0FBQ3ZQLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMseUJBQXlCO0FBR2xDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsaUNBQWlDLHNDQUFpRSxvQkFBb0Isd0JBQThFLDRCQUFpRDtBQUl2UCxNQUFNLHlCQUEwRDtBQUFBLEVBSXRFLHNCQUE2QjtBQUFFLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQUc7QUFBQSxFQUNuRSxX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
