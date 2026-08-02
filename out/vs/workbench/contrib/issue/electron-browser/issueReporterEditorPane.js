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
import "../browser/media/issueReporterOverlay.css";
import { $, append, clearNode } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { decodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { URI } from "../../../../base/common/uri.js";
import { FileAccess } from "../../../../base/common/network.js";
import { IssueReporterOverlay } from "../browser/issueReporterOverlay.js";
import { IRecordingService, RecordingState } from "../browser/recordingService.js";
import { IScreenshotService } from "../browser/screenshotService.js";
import { IIssueFormService } from "../common/issue.js";
import { IProcessService } from "../../../../platform/process/common/process.js";
import { IWorkbenchAssignmentService } from "../../../services/assignment/common/assignmentService.js";
import product from "../../../../platform/product/common/product.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { ChatMessageRole, ILanguageModelsService, getTextResponseFromStream } from "../../chat/common/languageModels.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IUpdateService, StateType } from "../../../../platform/update/common/update.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { isMacintosh } from "../../../../base/common/platform.js";
const IssueReporterOpenContext = new RawContextKey("issueReporterOpen", false);
let IssueReporterEditorPane = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, recordingService, screenshotService, logService, fileService, environmentService, editorService, issueFormService, processService, experimentService, contextMenuService, contextViewService, markdownRendererService, languageModelsService, notificationService, openerService, updateService, keybindingService, editorGroupsService, extensionService, configurationService) {
    super(IssueReporterEditorPane.ID, group, telemetryService, themeService, storageService);
    this.recordingService = recordingService;
    this.screenshotService = screenshotService;
    this.logService = logService;
    this.fileService = fileService;
    this.environmentService = environmentService;
    this.editorService = editorService;
    this.issueFormService = issueFormService;
    this.processService = processService;
    this.experimentService = experimentService;
    this.contextMenuService = contextMenuService;
    this.contextViewService = contextViewService;
    this.markdownRendererService = markdownRendererService;
    this.languageModelsService = languageModelsService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.updateService = updateService;
    this.keybindingService = keybindingService;
    this.editorGroupsService = editorGroupsService;
    this.extensionService = extensionService;
    this.configurationService = configurationService;
    this.inputDisposables = this._register(new DisposableStore());
    IssueReporterEditorPane.liveInstances.add(this);
    this._register({ dispose: () => IssueReporterEditorPane.liveInstances.delete(this) });
  }
  static getAnyLiveInstance() {
    for (const inst of IssueReporterEditorPane.liveInstances) {
      if (inst.wizard) {
        return inst;
      }
    }
    return void 0;
  }
  getWizard() {
    return this.wizard;
  }
  /**
   * Bring this pane's tab to the front of its group and activate that group
   * so the wizard receives keyboard focus.
   */
  async revealAndActivate() {
    const input = this.wizardInput;
    if (!input) {
      return;
    }
    this.editorGroupsService.activateGroup(this.group);
    await this.editorService.openEditor(input, { activation: EditorActivation.ACTIVATE }, this.group);
  }
  createEditor(parent) {
    this.container = append(parent, $("div.issue-reporter-editor-tab"));
    this.container.style.height = "100%";
    this.container.style.overflow = "auto";
  }
  shouldShowUpdateBanner() {
    return this.updateService.state.type === StateType.AvailableForDownload || this.updateService.state.type === StateType.Ready || this.updateService.state.type === StateType.Downloaded;
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (token.isCancellationRequested || !this.container) {
      return;
    }
    this.wizardInput = input;
    if (this.wizard && this.container.contains(this.wizard.getPanel())) {
      this.wizard.reparentFloatingBar();
      this.wizard.showFloatingBar();
      this.wizard.setUpdateAvailable(this.shouldShowUpdateBanner());
      this.restoreAttachmentsFromInput(input);
      return;
    }
    this.inputDisposables.clear();
    clearNode(this.container);
    const data = input.data;
    if (!data) {
      const msg = append(this.container, $("p"));
      msg.textContent = localize("noData", "No issue reporter data available.");
      return;
    }
    this.wizard = new IssueReporterOverlay(
      data,
      this.recordingService.isSupported,
      this.container,
      this.contextViewService,
      this.contextMenuService,
      this.markdownRendererService,
      true,
      (extensionId) => this.issueFormService.sendReporterMenu(extensionId),
      async (url) => {
        await this.openerService.open(URI.parse(url), { openExternal: true });
      },
      this.shouldShowUpdateBanner(),
      () => this.refreshPerformanceInfo(),
      (commandId) => this.keybindingService.lookupKeybinding(commandId)
    );
    this.inputDisposables.add(this.wizard);
    this.inputDisposables.add(this.updateService.onStateChange(() => this.wizard?.setUpdateAvailable(this.shouldShowUpdateBanner())));
    input.hasUserInputFn = () => this.wizard?.hasUnsavedChanges() ?? false;
    this.inputDisposables.add(this.wizard.onDidClose(() => {
      input.hasUserInputFn = void 0;
      this.group.closeEditor(this.input);
    }));
    this.inputDisposables.add(input.onWillDispose(() => {
      this.destroyWizard();
    }));
    this.wizard.show();
    this.restoreAttachmentsFromInput(input);
    this.inputDisposables.add(this.wizard.onDidChangeAttachments(() => {
      input.savedScreenshots = this.wizard?.getScreenshots().slice();
      input.savedRecordings = this.wizard?.getRecordings().slice();
    }));
    void this.populateSystemInfo();
    this.inputDisposables.add(this.wizard.onDidRequestScreenshot(async () => {
      try {
        const shouldHide = this.wizard?.shouldHideToolbarForCapture ?? true;
        if (shouldHide) {
          this.wizard?.hideFloatingBar();
          await new Promise((r) => setTimeout(r, 100));
        }
        const dataUrl = await this.screenshotService.captureScreenshot();
        if (shouldHide) {
          setTimeout(() => this.wizard?.showFloatingBar(), 1e3);
        }
        if (!dataUrl || !this.wizard) {
          return;
        }
        const img = await new Promise((resolve, reject) => {
          const image = mainWindow.document.createElement("img");
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = dataUrl;
        });
        this.wizard.addScreenshot({ dataUrl, width: img.naturalWidth, height: img.naturalHeight });
        await this.revealAndActivate();
      } catch (err) {
        setTimeout(() => this.wizard?.showFloatingBar(), 1e3);
        this.logService.error("[IssueReporterEditorPane] Screenshot failed:", err);
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestStartRecording(async () => {
      const permissionState = await this.recordingService.getScreenCapturePermissionStatus();
      if (permissionState === "denied" || permissionState === "restricted") {
        this.showScreenRecordingPermissionNotification();
        this.wizard?.setRecordingState(RecordingState.Idle);
        return;
      }
      try {
        await this.recordingService.startRecording("video/mp4");
        this.wizard?.setRecordingState(RecordingState.Recording);
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Recording failed:", err);
        this.wizard?.setRecordingState(RecordingState.Idle);
        const postState = await this.recordingService.getScreenCapturePermissionStatus();
        if (postState === "denied" || postState === "restricted") {
          this.showScreenRecordingPermissionNotification();
        }
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestStopRecording(async () => {
      try {
        const recordingData = await this.recordingService.stopRecording();
        if (recordingData) {
          await this.saveRecordingAndAdd(recordingData);
        }
        this.wizard?.setRecordingState(RecordingState.Idle);
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Stop recording failed:", err);
        this.wizard?.setRecordingState(RecordingState.Idle);
      }
    }));
    this.inputDisposables.add(this.recordingService.onDidChangeState(async (state) => {
      if (state === RecordingState.Stopped && this.wizard?.recordingState === RecordingState.Recording) {
        try {
          const recordingData = await this.recordingService.stopRecording();
          if (recordingData) {
            await this.saveRecordingAndAdd(recordingData);
            if (recordingData.stoppedBySize) {
              this.notificationService.notify({
                severity: Severity.Warning,
                message: localize("recordingTooLarge", "Recording stopped automatically: the 100 MB upload limit was reached.")
              });
            }
          }
        } catch (err) {
          this.logService.error("[IssueReporterEditorPane] Auto-stop recording failed:", err);
        }
        this.wizard?.setRecordingState(RecordingState.Idle);
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestOpenScreenshot(async (screenshot) => {
      try {
        const dataUrl = screenshot.annotatedDataUrl ?? screenshot.dataUrl;
        const commaIndex = dataUrl.indexOf(",");
        if (commaIndex === -1) {
          return;
        }
        const extension = dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
        const folder = URI.joinPath(this.environmentService.tmpDir, "issue-screenshots");
        const target = URI.joinPath(folder, `screenshot-${Date.now()}.${extension}`);
        await this.fileService.createFolder(folder);
        await this.fileService.writeFile(target, decodeBase64(dataUrl.substring(commaIndex + 1)));
        await this.editorService.openEditor({ resource: target });
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Open screenshot failed:", err);
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestOpenRecording(async (filePath) => {
      try {
        await this.editorService.openEditor({ resource: URI.file(filePath) });
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Open recording failed:", err);
      }
    }));
    this.inputDisposables.add(this.wizard.onDidSubmit(async ({ title, body }) => {
      if (!this.wizard) {
        return;
      }
      const opened = await this.issueFormService.submitIssue(this.wizard, data, title, body);
      if (opened) {
        this.wizard.markPreviewOpened();
        this.wizard.showCloseButton();
      }
    }));
    this.inputDisposables.add(this.wizard.onDidRequestGenerateTitle(async (description) => {
      try {
        await this.extensionService.whenInstalledExtensionsRegistered();
        const modelIds = await this.languageModelsService.selectLanguageModels({ vendor: "copilot", id: "copilot-utility-small" });
        if (modelIds.length === 0) {
          this.logService.warn("[IssueReporterEditorPane] No language models available for title generation");
          this.wizard?.resetGenerateButton();
          return;
        }
        const modelId = modelIds[0];
        const response = await this.languageModelsService.sendChatRequest(
          modelId,
          void 0,
          [{
            role: ChatMessageRole.User,
            content: [{
              type: "text",
              value: `Generate a concise issue title (max 10 words, no quotes, no prefix like "Bug:" or "Feature:") for this bug report description:

${description}`
            }]
          }],
          {},
          CancellationToken.None
        );
        const title = (await getTextResponseFromStream(response)).trim().replace(/^["']|["']$/g, "");
        if (title && this.wizard) {
          this.wizard.setGeneratedTitle(title);
        } else {
          this.wizard?.resetGenerateButton();
        }
      } catch (err) {
        this.logService.error("[IssueReporterEditorPane] Title generation failed:", err);
        this.wizard?.resetGenerateButton();
      }
    }));
  }
  async fetchPerformanceInfo(options) {
    if (!this.wizard) {
      return;
    }
    try {
      const performanceInfo = await this.processService.getPerformanceInfo(options);
      this.wizard.updateModel({
        processInfo: performanceInfo.processInfo,
        workspaceInfo: performanceInfo.workspaceInfo
      });
    } catch (err) {
      this.logService.error("[IssueReporterEditorPane] Failed to fetch performance info:", err);
    } finally {
      this.wizard?.markPerformanceInfoLoaded();
    }
  }
  async refreshPerformanceInfo() {
    await this.fetchPerformanceInfo({ skipCache: true, unbounded: true });
  }
  async populateSystemInfo() {
    if (!this.wizard) {
      return;
    }
    const input = this.input;
    const data = input?.data;
    try {
      const vscodeVersion = `${product.nameShort} ${!!product.darwinUniversalAssetId ? `${product.version} (Universal)` : product.version} (${product.commit || "Commit unknown"}, ${product.date || "Date unknown"})`;
      const systemInfo = await this.processService.getSystemInfo();
      this.wizard.updateModel({
        versionInfo: { vscodeVersion, os: systemInfo.os },
        systemInfo,
        systemInfoWeb: navigator.userAgent
      });
      const fullScan = this.configurationService.getValue("issueReporter.wizard.fullWorkspaceScan") !== false;
      await this.fetchPerformanceInfo({ unbounded: fullScan });
    } catch (err) {
      this.logService.error("[IssueReporterEditorPane] Failed to collect system info:", err);
      this.wizard?.markPerformanceInfoLoaded();
    }
    try {
      const experiments = await this.experimentService.getCurrentExperiments();
      this.wizard?.updateModel({ experimentInfo: experiments?.join("\n") ?? localize("noExperiments", "No current experiments.") });
    } catch {
    }
    await data?.whenExtensionsLoaded;
    if (data && data.enabledExtensions.length > 0) {
      const nonTheme = data.enabledExtensions.filter((e) => !e.isTheme && !e.isBuiltin);
      const themeCount = data.enabledExtensions.filter((e) => e.isTheme).length;
      this.wizard?.updateModel({
        allExtensions: data.enabledExtensions,
        enabledNonThemeExtesions: nonTheme,
        numberOfThemeExtesions: themeCount
      });
    }
    await data?.whenDataComplete;
    if (data) {
      this.wizard?.updateModel({
        isInstallationPure: data.isInstallationPure
      });
    }
  }
  restoreAttachmentsFromInput(input) {
    if (!this.wizard) {
      return;
    }
    if (input.savedScreenshots?.length || input.savedRecordings?.length) {
      this.wizard.restoreAttachments(input.savedScreenshots ?? [], input.savedRecordings ?? []);
    }
  }
  destroyWizard() {
    if (this.recordingService.state === RecordingState.Recording) {
      this.recordingService.discardRecording();
    }
    this.inputDisposables.clear();
    this.wizard = void 0;
    this.wizardInput = void 0;
    if (this.container) {
      clearNode(this.container);
    }
  }
  /**
   * Surface a notification telling the user how to grant Screen Recording
   * permission. On macOS, includes a deep-link to System Settings.
   */
  showScreenRecordingPermissionNotification() {
    if (isMacintosh) {
      this.notificationService.prompt(
        Severity.Warning,
        localize("screenRecordingPermissionDenied", "{0} needs Screen Recording permission to record videos. Grant access in System Settings, then click Record again.", product.nameShort),
        [
          {
            label: localize("openSystemSettings", "Open System Settings"),
            run: () => {
              this.recordingService.openScreenCapturePermissionSettings();
            }
          }
        ]
      );
    } else {
      this.notificationService.warn(
        localize("screenRecordingPermissionDeniedGeneric", "Screen recording permission was denied. Allow {0} to record the screen and try again.", product.nameShort)
      );
    }
  }
  focus() {
    super.focus();
    this.wizard?.focus();
  }
  async saveRecordingAndAdd(data) {
    try {
      const extension = data.mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      const fileName = `vscode-recording-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.${extension}`;
      const folder = URI.joinPath(this.environmentService.tmpDir, "issue-recordings");
      const target = URI.joinPath(folder, fileName);
      const arrayBuffer = await data.blob.arrayBuffer();
      await this.fileService.createFolder(folder);
      await this.fileService.writeFile(target, VSBuffer.wrap(new Uint8Array(arrayBuffer)));
      this.logService.info(`[IssueReporterEditorPane] Recording saved to ${target.toString()}`);
      const thumbnailDataUrl = await this.generateVideoThumbnail(target);
      this.wizard?.addRecording(target.fsPath, data.durationMs, thumbnailDataUrl);
    } catch (err) {
      this.logService.error("[IssueReporterEditorPane] Failed to save recording:", err);
    }
  }
  generateVideoThumbnail(fileUri) {
    const browserUri = FileAccess.uriToBrowserUri(URI.file(fileUri.fsPath));
    return new Promise((resolve) => {
      const video = mainWindow.document.createElement("video");
      const timeout = setTimeout(() => finish(void 0), 5e3);
      let resolved = false;
      const finish = (result) => {
        if (resolved) {
          return;
        }
        resolved = true;
        clearTimeout(timeout);
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        resolve(result);
      };
      const captureFrame = () => {
        try {
          if (!video.videoWidth || !video.videoHeight) {
            finish(void 0);
            return;
          }
          const canvas = mainWindow.document.createElement("canvas");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            finish(void 0);
            return;
          }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL("image/jpeg", 0.7));
        } catch {
          finish(void 0);
        }
      };
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:320px;height:240px;opacity:0;pointer-events:none;";
      mainWindow.document.body.appendChild(video);
      video.src = browserUri.toString(true);
      video.addEventListener("loadeddata", () => {
        video.pause();
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        if (duration > 0.5) {
          video.addEventListener("seeked", () => captureFrame(), { once: true });
          try {
            video.currentTime = Math.min(0.5, duration / 2);
          } catch {
            captureFrame();
          }
          return;
        }
        captureFrame();
      }, { once: true });
      video.addEventListener("error", () => finish(void 0), { once: true });
      video.load();
    });
  }
  layout(dimension) {
    if (this.container) {
      this.container.style.width = `${dimension.width}px`;
      this.container.style.height = `${dimension.height}px`;
    }
  }
};
IssueReporterEditorPane.ID = "workbench.editor.issueReporter";
/**
 * Live registry of issue reporter panes so commands can target the wizard
 * even when its tab is not the active editor in its group.
 * (IEditorService.visibleEditorPanes only exposes the active pane per group.)
 */
IssueReporterEditorPane.liveInstances = /* @__PURE__ */ new Set();
IssueReporterEditorPane = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IRecordingService),
  __decorateParam(5, IScreenshotService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IFileService),
  __decorateParam(8, INativeWorkbenchEnvironmentService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IIssueFormService),
  __decorateParam(11, IProcessService),
  __decorateParam(12, IWorkbenchAssignmentService),
  __decorateParam(13, IContextMenuService),
  __decorateParam(14, IContextViewService),
  __decorateParam(15, IMarkdownRendererService),
  __decorateParam(16, ILanguageModelsService),
  __decorateParam(17, INotificationService),
  __decorateParam(18, IOpenerService),
  __decorateParam(19, IUpdateService),
  __decorateParam(20, IKeybindingService),
  __decorateParam(21, IEditorGroupsService),
  __decorateParam(22, IExtensionService),
  __decorateParam(23, IConfigurationService)
], IssueReporterEditorPane);
export {
  IssueReporterEditorPane,
  IssueReporterOpenContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2VsZWN0cm9uLWJyb3dzZXIvaXNzdWVSZXBvcnRlckVkaXRvclBhbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uL2Jyb3dzZXIvbWVkaWEvaXNzdWVSZXBvcnRlck92ZXJsYXkuY3NzJztcbmltcG9ydCB7ICQsIGFwcGVuZCwgY2xlYXJOb2RlLCBEaW1lbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3RpdmF0aW9uLCBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSXNzdWVSZXBvcnRlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vYnJvd3Nlci9pc3N1ZVJlcG9ydGVyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSXNzdWVSZXBvcnRlck92ZXJsYXkgfSBmcm9tICcuLi9icm93c2VyL2lzc3VlUmVwb3J0ZXJPdmVybGF5LmpzJztcbmltcG9ydCB7IElSZWNvcmRpbmdTZXJ2aWNlLCBJUmVjb3JkaW5nRGF0YSwgUmVjb3JkaW5nU3RhdGUgfSBmcm9tICcuLi9icm93c2VyL3JlY29yZGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNjcmVlbnNob3RTZXJ2aWNlIH0gZnJvbSAnLi4vYnJvd3Nlci9zY3JlZW5zaG90U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSXNzdWVGb3JtU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9pc3N1ZS5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9jZXNzL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IENoYXRNZXNzYWdlUm9sZSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgZ2V0VGV4dFJlc3BvbnNlRnJvbVN0cmVhbSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UsIFN0YXRlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG4vKiogQ29udGV4dCBrZXkgdGhhdCdzIGB0cnVlYCB3aGVuZXZlciBhbnkgSXNzdWVSZXBvcnRlciBlZGl0b3IgaXMgb3BlbiBpbiBhbnkgZ3JvdXAsIGV2ZW4gd2hlbiBub3QgZm9jdXNlZC4gKi9cbmV4cG9ydCBjb25zdCBJc3N1ZVJlcG9ydGVyT3BlbkNvbnRleHQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaXNzdWVSZXBvcnRlck9wZW4nLCBmYWxzZSk7XG5cbi8qKlxuICogRWRpdG9yIHBhbmUgdGhhdCBob3N0cyB0aGUgaXNzdWUgcmVwb3J0ZXIgd2l6YXJkIGluc2lkZSBhbiBlZGl0b3IgdGFiLlxuICovXG5leHBvcnQgY2xhc3MgSXNzdWVSZXBvcnRlckVkaXRvclBhbmUgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmVkaXRvci5pc3N1ZVJlcG9ydGVyJztcblxuXHQvKipcblx0ICogTGl2ZSByZWdpc3RyeSBvZiBpc3N1ZSByZXBvcnRlciBwYW5lcyBzbyBjb21tYW5kcyBjYW4gdGFyZ2V0IHRoZSB3aXphcmRcblx0ICogZXZlbiB3aGVuIGl0cyB0YWIgaXMgbm90IHRoZSBhY3RpdmUgZWRpdG9yIGluIGl0cyBncm91cC5cblx0ICogKElFZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JQYW5lcyBvbmx5IGV4cG9zZXMgdGhlIGFjdGl2ZSBwYW5lIHBlciBncm91cC4pXG5cdCAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBsaXZlSW5zdGFuY2VzID0gbmV3IFNldDxJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZT4oKTtcblx0c3RhdGljIGdldEFueUxpdmVJbnN0YW5jZSgpOiBJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBpbnN0IG9mIElzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lLmxpdmVJbnN0YW5jZXMpIHtcblx0XHRcdGlmIChpbnN0LndpemFyZCkge1xuXHRcdFx0XHRyZXR1cm4gaW5zdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgY29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB3aXphcmQ6IElzc3VlUmVwb3J0ZXJPdmVybGF5IHwgdW5kZWZpbmVkO1xuXHQvKiogU3Vydml2ZXMgdGhlIGZyYW1ld29yayBjYWxsaW5nIGNsZWFySW5wdXQoKSB3aGVuIHRoZSB1c2VyIHN3aXRjaGVzIGF3YXkuICovXG5cdHByaXZhdGUgd2l6YXJkSW5wdXQ6IElzc3VlUmVwb3J0ZXJFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBpbnB1dERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRncm91cDogSUVkaXRvckdyb3VwLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUmVjb3JkaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlY29yZGluZ1NlcnZpY2U6IElSZWNvcmRpbmdTZXJ2aWNlLFxuXHRcdEBJU2NyZWVuc2hvdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY3JlZW5zaG90U2VydmljZTogSVNjcmVlbnNob3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSXNzdWVGb3JtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlzc3VlRm9ybVNlcnZpY2U6IElJc3N1ZUZvcm1TZXJ2aWNlLFxuXHRcdEBJUHJvY2Vzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9jZXNzU2VydmljZTogSVByb2Nlc3NTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHBlcmltZW50U2VydmljZTogSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVXBkYXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZS5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdElzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lLmxpdmVJbnN0YW5jZXMuYWRkKHRoaXMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gSXNzdWVSZXBvcnRlckVkaXRvclBhbmUubGl2ZUluc3RhbmNlcy5kZWxldGUodGhpcykgfSk7XG5cdH1cblxuXHRnZXRXaXphcmQoKTogSXNzdWVSZXBvcnRlck92ZXJsYXkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLndpemFyZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBCcmluZyB0aGlzIHBhbmUncyB0YWIgdG8gdGhlIGZyb250IG9mIGl0cyBncm91cCBhbmQgYWN0aXZhdGUgdGhhdCBncm91cFxuXHQgKiBzbyB0aGUgd2l6YXJkIHJlY2VpdmVzIGtleWJvYXJkIGZvY3VzLlxuXHQgKi9cblx0YXN5bmMgcmV2ZWFsQW5kQWN0aXZhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLndpemFyZElucHV0O1xuXHRcdGlmICghaW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2YXRlR3JvdXAodGhpcy5ncm91cCk7XG5cdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgYWN0aXZhdGlvbjogRWRpdG9yQWN0aXZhdGlvbi5BQ1RJVkFURSB9LCB0aGlzLmdyb3VwKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnZGl2Lmlzc3VlLXJlcG9ydGVyLWVkaXRvci10YWInKSk7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLm92ZXJmbG93ID0gJ2F1dG8nO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93VXBkYXRlQmFubmVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLkF2YWlsYWJsZUZvckRvd25sb2FkXG5cdFx0XHR8fCB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLlJlYWR5XG5cdFx0XHR8fCB0aGlzLnVwZGF0ZVNlcnZpY2Uuc3RhdGUudHlwZSA9PT0gU3RhdGVUeXBlLkRvd25sb2FkZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChcblx0XHRpbnB1dDogSXNzdWVSZXBvcnRlckVkaXRvcklucHV0LFxuXHRcdG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgb3VyIG93biBpbnB1dCByZWZlcmVuY2UgZm9yIHJldmVhbEFuZEFjdGl2YXRlKCkgYWZ0ZXIgY2xlYXJJbnB1dCgpLlxuXHRcdHRoaXMud2l6YXJkSW5wdXQgPSBpbnB1dDtcblxuXHRcdC8vIElmIHRoZSB3aXphcmQgaXMgYWxyZWFkeSBidWlsdCBhbmQgaXRzIERPTSBpcyBzdGlsbCBhdHRhY2hlZCwgcmUtcGFyZW50IGZsb2F0aW5nIGJhciBpZiBuZWVkZWRcblx0XHRpZiAodGhpcy53aXphcmQgJiYgdGhpcy5jb250YWluZXIuY29udGFpbnModGhpcy53aXphcmQuZ2V0UGFuZWwoKSkpIHtcblx0XHRcdHRoaXMud2l6YXJkLnJlcGFyZW50RmxvYXRpbmdCYXIoKTtcblx0XHRcdHRoaXMud2l6YXJkLnNob3dGbG9hdGluZ0JhcigpO1xuXHRcdFx0dGhpcy53aXphcmQuc2V0VXBkYXRlQXZhaWxhYmxlKHRoaXMuc2hvdWxkU2hvd1VwZGF0ZUJhbm5lcigpKTtcblx0XHRcdC8vIFJlc3RvcmUgYXR0YWNobWVudHMgY2FwdHVyZWQgYmVmb3JlIHRoZSBlZGl0b3Igd2FzIG1vdmVkIGJhY2sgaW50b1xuXHRcdFx0Ly8gdGhpcyBwYW5lIGZyb20gYSBtb2RhbCBlZGl0b3IgcGFydC4gVGhlIGlucHV0IGlzIHRoZSBzb3VyY2Ugb2YgdHJ1dGg7XG5cdFx0XHQvLyB0aGUgZXhpc3Rpbmcgb25EaWRDaGFuZ2VBdHRhY2htZW50cyBzdWJzY3JpcHRpb24ga2VlcHMgaXQgaW4gc3luYy5cblx0XHRcdHRoaXMucmVzdG9yZUF0dGFjaG1lbnRzRnJvbUlucHV0KGlucHV0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjbGVhck5vZGUodGhpcy5jb250YWluZXIpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IGlucHV0LmRhdGE7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRjb25zdCBtc2cgPSBhcHBlbmQodGhpcy5jb250YWluZXIsICQoJ3AnKSk7XG5cdFx0XHRtc2cudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbm9EYXRhJywgXCJObyBpc3N1ZSByZXBvcnRlciBkYXRhIGF2YWlsYWJsZS5cIik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIHRoZSB3aXphcmQgXHUyMDE0IHJlbmRlcnMgaW5zaWRlIHRoaXMgY29udGFpbmVyXG5cdFx0dGhpcy53aXphcmQgPSBuZXcgSXNzdWVSZXBvcnRlck92ZXJsYXkoXG5cdFx0XHRkYXRhLFxuXHRcdFx0dGhpcy5yZWNvcmRpbmdTZXJ2aWNlLmlzU3VwcG9ydGVkLFxuXHRcdFx0dGhpcy5jb250YWluZXIsXG5cdFx0XHR0aGlzLmNvbnRleHRWaWV3U2VydmljZSxcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdFx0dGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRcdHRydWUsXG5cdFx0XHRleHRlbnNpb25JZCA9PiB0aGlzLmlzc3VlRm9ybVNlcnZpY2Uuc2VuZFJlcG9ydGVyTWVudShleHRlbnNpb25JZCksXG5cdFx0XHRhc3luYyB1cmwgPT4geyBhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodXJsKSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7IH0sXG5cdFx0XHR0aGlzLnNob3VsZFNob3dVcGRhdGVCYW5uZXIoKSxcblx0XHRcdCgpID0+IHRoaXMucmVmcmVzaFBlcmZvcm1hbmNlSW5mbygpLFxuXHRcdFx0Y29tbWFuZElkID0+IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhjb21tYW5kSWQpLFxuXHRcdCk7XG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLndpemFyZCk7XG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLnVwZGF0ZVNlcnZpY2Uub25TdGF0ZUNoYW5nZSgoKSA9PiB0aGlzLndpemFyZD8uc2V0VXBkYXRlQXZhaWxhYmxlKHRoaXMuc2hvdWxkU2hvd1VwZGF0ZUJhbm5lcigpKSkpO1xuXG5cdFx0Ly8gTGV0IHRoZSBpbnB1dCBjaGVjayB3aXphcmQgc3RhdGUgZm9yIGNsb3NlIGNvbmZpcm1hdGlvblxuXHRcdGlucHV0Lmhhc1VzZXJJbnB1dEZuID0gKCkgPT4gdGhpcy53aXphcmQ/Lmhhc1Vuc2F2ZWRDaGFuZ2VzKCkgPz8gZmFsc2U7XG5cblx0XHQvLyBDbG9zZSB0aGUgZWRpdG9yIHRhYiB3aGVuIHRoZSB1c2VyIGRpc2NhcmRzXG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLndpemFyZC5vbkRpZENsb3NlKCgpID0+IHtcblx0XHRcdC8vIFJlc2V0IHNvIGNsb3NlIGhhbmRsZXIgZG9lc24ndCBwcm9tcHQgYWdhaW5cblx0XHRcdGlucHV0Lmhhc1VzZXJJbnB1dEZuID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5ncm91cC5jbG9zZUVkaXRvcih0aGlzLmlucHV0ISk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZChpbnB1dC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuZGVzdHJveVdpemFyZCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMud2l6YXJkLnNob3coKTtcblxuXHRcdC8vIFJlc3RvcmUgYXR0YWNobWVudHMgbWlycm9yZWQgb250byB0aGUgaW5wdXQgYmVmb3JlIGEgbW92ZSwgYW5kIGtlZXAgdGhlXG5cdFx0Ly8gaW5wdXQgaW4gc3luYyBhcyBhdHRhY2htZW50cyBjaGFuZ2Ugc28gdGhleSBzdXJ2aXZlIHRoZSB3aXphcmQgYmVpbmdcblx0XHQvLyByZWJ1aWx0IHdoZW4gdGhlIGVkaXRvciBtb3ZlcyBiZXR3ZWVuIHRoZSBtYWluIGVkaXRvciBhcmVhIGFuZCBhIG1vZGFsXG5cdFx0Ly8gZWRpdG9yIHBhcnQgaW4gdGhlIEFnZW50cyBXaW5kb3cuXG5cdFx0dGhpcy5yZXN0b3JlQXR0YWNobWVudHNGcm9tSW5wdXQoaW5wdXQpO1xuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy53aXphcmQub25EaWRDaGFuZ2VBdHRhY2htZW50cygoKSA9PiB7XG5cdFx0XHRpbnB1dC5zYXZlZFNjcmVlbnNob3RzID0gdGhpcy53aXphcmQ/LmdldFNjcmVlbnNob3RzKCkuc2xpY2UoKTtcblx0XHRcdGlucHV0LnNhdmVkUmVjb3JkaW5ncyA9IHRoaXMud2l6YXJkPy5nZXRSZWNvcmRpbmdzKCkuc2xpY2UoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBQb3B1bGF0ZSBzeXN0ZW0gaW5mbyBpbiBiYWNrZ3JvdW5kIChub24tYmxvY2tpbmcpXG5cdFx0dm9pZCB0aGlzLnBvcHVsYXRlU3lzdGVtSW5mbygpO1xuXG5cdFx0Ly8gV2lyZSBzY3JlZW5zaG90IGNhcHR1cmVcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMud2l6YXJkLm9uRGlkUmVxdWVzdFNjcmVlbnNob3QoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gQ29uZGl0aW9uYWxseSBoaWRlIHRoZSBmbG9hdGluZyBiYXIgYmFzZWQgb24gdXNlciBzZXR0aW5nXG5cdFx0XHRcdGNvbnN0IHNob3VsZEhpZGUgPSB0aGlzLndpemFyZD8uc2hvdWxkSGlkZVRvb2xiYXJGb3JDYXB0dXJlID8/IHRydWU7XG5cdFx0XHRcdGlmIChzaG91bGRIaWRlKSB7XG5cdFx0XHRcdFx0dGhpcy53aXphcmQ/LmhpZGVGbG9hdGluZ0JhcigpO1xuXG5cdFx0XHRcdFx0Ly8gU21hbGwgZGVsYXkgdG8gbGV0IHRoZSBiYXIgZGlzYXBwZWFyIGJlZm9yZSBjYXB0dXJlXG5cdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwMCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGF0YVVybCA9IGF3YWl0IHRoaXMuc2NyZWVuc2hvdFNlcnZpY2UuY2FwdHVyZVNjcmVlbnNob3QoKTtcblxuXHRcdFx0XHQvLyBTaG93IGJhciBhZ2FpbiBhZnRlciBjYXB0dXJlXG5cdFx0XHRcdGlmIChzaG91bGRIaWRlKSB7XG5cdFx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLndpemFyZD8uc2hvd0Zsb2F0aW5nQmFyKCksIDEwMDApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFkYXRhVXJsIHx8ICF0aGlzLndpemFyZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGltZyA9IGF3YWl0IG5ldyBQcm9taXNlPEhUTUxJbWFnZUVsZW1lbnQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0XHRjb25zdCBpbWFnZSA9IG1haW5XaW5kb3cuZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW1nJyk7XG5cdFx0XHRcdFx0aW1hZ2Uub25sb2FkID0gKCkgPT4gcmVzb2x2ZShpbWFnZSk7XG5cdFx0XHRcdFx0aW1hZ2Uub25lcnJvciA9IHJlamVjdDtcblx0XHRcdFx0XHRpbWFnZS5zcmMgPSBkYXRhVXJsO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0aGlzLndpemFyZC5hZGRTY3JlZW5zaG90KHsgZGF0YVVybCwgd2lkdGg6IGltZy5uYXR1cmFsV2lkdGgsIGhlaWdodDogaW1nLm5hdHVyYWxIZWlnaHQgfSk7XG5cblx0XHRcdFx0Ly8gQnJpbmcgdGhlIHdpemFyZCBiYWNrIGludG8gZm9jdXMgYWZ0ZXIgdGhlIGNhcHR1cmUgaW4gY2FzZVxuXHRcdFx0XHQvLyB0aGUgdXNlciBzd2l0Y2hlZCBlZGl0b3JzL2dyb3VwcyB3aGlsZSBzZXR0aW5nIHVwIHRoZSBzaG90LlxuXHRcdFx0XHRhd2FpdCB0aGlzLnJldmVhbEFuZEFjdGl2YXRlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLndpemFyZD8uc2hvd0Zsb2F0aW5nQmFyKCksIDEwMDApO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gU2NyZWVuc2hvdCBmYWlsZWQ6JywgZXJyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaXJlIHJlY29yZGluZyBzdGFydFxuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy53aXphcmQub25EaWRSZXF1ZXN0U3RhcnRSZWNvcmRpbmcoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gbWFjT1Mtb25seTogc2tpcCBnZXREaXNwbGF5TWVkaWEgd2hlbiBwZXJtaXNzaW9uIGlzIGRlbmllZCBhbmRcblx0XHRcdC8vIHN1cmZhY2UgdGhlIGdyYW50LXBlcm1pc3Npb24gbm90aWZpY2F0aW9uIGluc3RlYWQuXG5cdFx0XHRjb25zdCBwZXJtaXNzaW9uU3RhdGUgPSBhd2FpdCB0aGlzLnJlY29yZGluZ1NlcnZpY2UuZ2V0U2NyZWVuQ2FwdHVyZVBlcm1pc3Npb25TdGF0dXMoKTtcblx0XHRcdGlmIChwZXJtaXNzaW9uU3RhdGUgPT09ICdkZW5pZWQnIHx8IHBlcm1pc3Npb25TdGF0ZSA9PT0gJ3Jlc3RyaWN0ZWQnKSB7XG5cdFx0XHRcdHRoaXMuc2hvd1NjcmVlblJlY29yZGluZ1Blcm1pc3Npb25Ob3RpZmljYXRpb24oKTtcblx0XHRcdFx0dGhpcy53aXphcmQ/LnNldFJlY29yZGluZ1N0YXRlKFJlY29yZGluZ1N0YXRlLklkbGUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJlY29yZGluZ1NlcnZpY2Uuc3RhcnRSZWNvcmRpbmcoJ3ZpZGVvL21wNCcpO1xuXHRcdFx0XHR0aGlzLndpemFyZD8uc2V0UmVjb3JkaW5nU3RhdGUoUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gUmVjb3JkaW5nIGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0XHR0aGlzLndpemFyZD8uc2V0UmVjb3JkaW5nU3RhdGUoUmVjb3JkaW5nU3RhdGUuSWRsZSk7XG5cdFx0XHRcdC8vIE9ubHkgbnVkZ2UgdGhlIHVzZXIgdG8gU3lzdGVtIFNldHRpbmdzIG9uIGFuIGV4cGxpY2l0IGRlbnkvcmVzdHJpY3QuIE9uIG1hY09TLFxuXHRcdFx0XHQvLyBgbm90LWRldGVybWluZWRgIGNhbiBhbHNvIG1lYW4gdGhlIHVzZXIganVzdCBjYW5jZWxsZWQgdGhlIGdldERpc3BsYXlNZWRpYVxuXHRcdFx0XHQvLyBwaWNrZXIgKG5vIFRDQyBkZWNpc2lvbiByZWNvcmRlZCkgXHUyMDE0IHN1cmZhY2luZyBhIHBlcm1pc3Npb24gcHJvbXB0IHRoZW4gd291bGRcblx0XHRcdFx0Ly8gYmUgbWlzbGVhZGluZywgc28gd2UgdHJlYXQgdGhhdCBhcyBhIHNpbGVudCBjYW5jZWwuXG5cdFx0XHRcdGNvbnN0IHBvc3RTdGF0ZSA9IGF3YWl0IHRoaXMucmVjb3JkaW5nU2VydmljZS5nZXRTY3JlZW5DYXB0dXJlUGVybWlzc2lvblN0YXR1cygpO1xuXHRcdFx0XHRpZiAocG9zdFN0YXRlID09PSAnZGVuaWVkJyB8fCBwb3N0U3RhdGUgPT09ICdyZXN0cmljdGVkJykge1xuXHRcdFx0XHRcdHRoaXMuc2hvd1NjcmVlblJlY29yZGluZ1Blcm1pc3Npb25Ob3RpZmljYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpcmUgcmVjb3JkaW5nIHN0b3AgKHVzZXItaW5pdGlhdGVkKVxuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy53aXphcmQub25EaWRSZXF1ZXN0U3RvcFJlY29yZGluZyhhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZWNvcmRpbmdEYXRhID0gYXdhaXQgdGhpcy5yZWNvcmRpbmdTZXJ2aWNlLnN0b3BSZWNvcmRpbmcoKTtcblx0XHRcdFx0aWYgKHJlY29yZGluZ0RhdGEpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnNhdmVSZWNvcmRpbmdBbmRBZGQocmVjb3JkaW5nRGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy53aXphcmQ/LnNldFJlY29yZGluZ1N0YXRlKFJlY29yZGluZ1N0YXRlLklkbGUpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0lzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lXSBTdG9wIHJlY29yZGluZyBmYWlsZWQ6JywgZXJyKTtcblx0XHRcdFx0dGhpcy53aXphcmQ/LnNldFJlY29yZGluZ1N0YXRlKFJlY29yZGluZ1N0YXRlLklkbGUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEhhbmRsZSBhdXRvLXN0b3AgdHJpZ2dlcmVkIGJ5IHRoZSByZWNvcmRpbmcgc2VydmljZSAoZS5nLiBzaXplIGxpbWl0IHJlYWNoZWQpXG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLnJlY29yZGluZ1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0ZShhc3luYyAoc3RhdGUpID0+IHtcblx0XHRcdC8vIE9ubHkgaGFuZGxlIGF1dG8tc3RvcDogaWYgdGhlIHNlcnZpY2Ugc3RvcHBlZCBvbiBpdHMgb3duIHdoaWxlIHRoZSB3aXphcmRcblx0XHRcdC8vIHN0aWxsIHRoaW5rcyB3ZSdyZSByZWNvcmRpbmcgKHVzZXIgZGlkbid0IHByZXNzIFN0b3AgbWFudWFsbHkpXG5cdFx0XHRpZiAoc3RhdGUgPT09IFJlY29yZGluZ1N0YXRlLlN0b3BwZWQgJiYgdGhpcy53aXphcmQ/LnJlY29yZGluZ1N0YXRlID09PSBSZWNvcmRpbmdTdGF0ZS5SZWNvcmRpbmcpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZWNvcmRpbmdEYXRhID0gYXdhaXQgdGhpcy5yZWNvcmRpbmdTZXJ2aWNlLnN0b3BSZWNvcmRpbmcoKTtcblx0XHRcdFx0XHRpZiAocmVjb3JkaW5nRGF0YSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zYXZlUmVjb3JkaW5nQW5kQWRkKHJlY29yZGluZ0RhdGEpO1xuXHRcdFx0XHRcdFx0aWYgKHJlY29yZGluZ0RhdGEuc3RvcHBlZEJ5U2l6ZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncmVjb3JkaW5nVG9vTGFyZ2UnLCBcIlJlY29yZGluZyBzdG9wcGVkIGF1dG9tYXRpY2FsbHk6IHRoZSAxMDAgTUIgdXBsb2FkIGxpbWl0IHdhcyByZWFjaGVkLlwiKSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gQXV0by1zdG9wIHJlY29yZGluZyBmYWlsZWQ6JywgZXJyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLndpemFyZD8uc2V0UmVjb3JkaW5nU3RhdGUoUmVjb3JkaW5nU3RhdGUuSWRsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2lyZSBvcGVuIHNjcmVlbnNob3QgXHUyMDE0IHNhdmUgdG8gdGVtcCBmaWxlIGFuZCBvcGVuIGluIGVkaXRvclxuXHRcdHRoaXMuaW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy53aXphcmQub25EaWRSZXF1ZXN0T3BlblNjcmVlbnNob3QoYXN5bmMgKHNjcmVlbnNob3QpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGRhdGFVcmwgPSBzY3JlZW5zaG90LmFubm90YXRlZERhdGFVcmwgPz8gc2NyZWVuc2hvdC5kYXRhVXJsO1xuXHRcdFx0XHRjb25zdCBjb21tYUluZGV4ID0gZGF0YVVybC5pbmRleE9mKCcsJyk7XG5cdFx0XHRcdGlmIChjb21tYUluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBTY3JlZW5zaG90cyBhcmUgZWl0aGVyIGFubm90YXRlZCAoYWx3YXlzIFBORyB2aWEgY2FudmFzLnRvRGF0YVVSTClcblx0XHRcdFx0Ly8gb3IgcmF3IG5hdGl2ZSBjYXB0dXJlcyAoYWx3YXlzIEpQRUcpOyBmYWxsIGJhY2sgdG8gUE5HLlxuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBkYXRhVXJsLnN0YXJ0c1dpdGgoJ2RhdGE6aW1hZ2UvanBlZycpID8gJ2pwZycgOiAncG5nJztcblx0XHRcdFx0Ly8gV3JpdGUgdG8gdGhlIE9TIHRlbXAgZm9sZGVyIHNvIGFydGlmYWN0cyBhcmUgY2xlYW5lZCB1cCBhdXRvbWF0aWNhbGx5LlxuXHRcdFx0XHRjb25zdCBmb2xkZXIgPSBVUkkuam9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UudG1wRGlyLCAnaXNzdWUtc2NyZWVuc2hvdHMnKTtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmpvaW5QYXRoKGZvbGRlciwgYHNjcmVlbnNob3QtJHtEYXRlLm5vdygpfS4ke2V4dGVuc2lvbn1gKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGFyZ2V0LCBkZWNvZGVCYXNlNjQoZGF0YVVybC5zdWJzdHJpbmcoY29tbWFJbmRleCArIDEpKSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHRhcmdldCB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gT3BlbiBzY3JlZW5zaG90IGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpcmUgb3BlbiByZWNvcmRpbmcgXHUyMDE0IG9wZW4gZmlsZSBpbiBlZGl0b3Jcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMud2l6YXJkLm9uRGlkUmVxdWVzdE9wZW5SZWNvcmRpbmcoYXN5bmMgKGZpbGVQYXRoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBVUkkuZmlsZShmaWxlUGF0aCkgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbSXNzdWVSZXBvcnRlckVkaXRvclBhbmVdIE9wZW4gcmVjb3JkaW5nIGZhaWxlZDonLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdpcmUgc3VibWl0IFx1MjAxNCBkZWxlZ2F0ZSB0byBmb3JtIHNlcnZpY2UgZm9yIHVwbG9hZCArIG9wZW4gVVJMXG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZCh0aGlzLndpemFyZC5vbkRpZFN1Ym1pdChhc3luYyAoeyB0aXRsZSwgYm9keSB9KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMud2l6YXJkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9wZW5lZCA9IGF3YWl0IHRoaXMuaXNzdWVGb3JtU2VydmljZS5zdWJtaXRJc3N1ZSh0aGlzLndpemFyZCwgZGF0YSwgdGl0bGUsIGJvZHkpO1xuXHRcdFx0aWYgKG9wZW5lZCkge1xuXHRcdFx0XHQvLyBVc2VyIG9wZW5lZCB0aGUgbGluayBcdTIwMTQga2VlcCB0aGUgd2l6YXJkIGVkaXRhYmxlLCBidXQgb2ZmZXIgYW4gZXhwbGljaXQgY2xvc2UgYWN0aW9uLlxuXHRcdFx0XHR0aGlzLndpemFyZC5tYXJrUHJldmlld09wZW5lZCgpO1xuXHRcdFx0XHR0aGlzLndpemFyZC5zaG93Q2xvc2VCdXR0b24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaXJlIEFJIHRpdGxlIGdlbmVyYXRpb25cblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMud2l6YXJkLm9uRGlkUmVxdWVzdEdlbmVyYXRlVGl0bGUoYXN5bmMgKGRlc2NyaXB0aW9uKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBXYWl0IGZvciBpbnN0YWxsZWQgZXh0ZW5zaW9ucyB0byBiZSByZWdpc3RlcmVkIHNvIHRoZSBDb3BpbG90IENoYXRcblx0XHRcdFx0Ly8gZXh0ZW5zaW9uIGhhcyBoYWQgYSBjaGFuY2UgdG8gY29udHJpYnV0ZSBpdHMgYGNvcGlsb3RgIGxhbmd1YWdlXG5cdFx0XHRcdC8vIG1vZGVsIHZlbmRvciBiZWZvcmUgd2UgdHJ5IHRvIHJlc29sdmUgYSBtb2RlbC4gKE90aGVyIGNhbGwgc2l0ZXNcblx0XHRcdFx0Ly8gbGlrZSB0aGUgY2hhdCB0aGlua2luZyB0aXRsZSBnZW5lcmF0b3IgYXJlIHJlYWNoZWQgYWZ0ZXIgQ29waWxvdFxuXHRcdFx0XHQvLyBoYXMgYWxyZWFkeSBhY3RpdmF0ZWQ7IHdlJ3JlIHRoZSBvbmx5IHBsYWNlIHRoYXQgY2FuIGJlIGludm9rZWRcblx0XHRcdFx0Ly8gYmVmb3JlIGl0IGhhcy4pXG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdFx0XHQvLyBgY29waWxvdC11dGlsaXR5LXNtYWxsYCBtYXRjaGVzIHdoYXQgb3RoZXIgdXRpbGl0eSBjYWxsZXJzIGluIHRoZVxuXHRcdFx0XHQvLyB3b3JrYmVuY2ggdXNlIChjaGF0IHRoaW5raW5nIHN1bW1hcmllcywgdG9vbC1yaXNrIGFzc2Vzc21lbnQsXG5cdFx0XHRcdC8vIGNoYXQtZWRpdCBleHBsYW5hdGlvbnMpLiBUaGUgZWFybGllciBgY29waWxvdC1mYXN0YCBpZCBuZXZlclxuXHRcdFx0XHQvLyBleGlzdGVkIGFuZCB3YXMgdGhlIHJvb3QgY2F1c2Ugb2YgdGhlIGVtcHR5LXJlc3VsdCByZWdyZXNzaW9uLlxuXHRcdFx0XHRjb25zdCBtb2RlbElkcyA9IGF3YWl0IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHsgdmVuZG9yOiAnY29waWxvdCcsIGlkOiAnY29waWxvdC11dGlsaXR5LXNtYWxsJyB9KTtcblx0XHRcdFx0aWYgKG1vZGVsSWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbSXNzdWVSZXBvcnRlckVkaXRvclBhbmVdIE5vIGxhbmd1YWdlIG1vZGVscyBhdmFpbGFibGUgZm9yIHRpdGxlIGdlbmVyYXRpb24nKTtcblx0XHRcdFx0XHR0aGlzLndpemFyZD8ucmVzZXRHZW5lcmF0ZUJ1dHRvbigpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtb2RlbElkID0gbW9kZWxJZHNbMF07XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uuc2VuZENoYXRSZXF1ZXN0KFxuXHRcdFx0XHRcdG1vZGVsSWQsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRyb2xlOiBDaGF0TWVzc2FnZVJvbGUuVXNlcixcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGBHZW5lcmF0ZSBhIGNvbmNpc2UgaXNzdWUgdGl0bGUgKG1heCAxMCB3b3Jkcywgbm8gcXVvdGVzLCBubyBwcmVmaXggbGlrZSBcIkJ1ZzpcIiBvciBcIkZlYXR1cmU6XCIpIGZvciB0aGlzIGJ1ZyByZXBvcnQgZGVzY3JpcHRpb246XFxuXFxuJHtkZXNjcmlwdGlvbn1gLFxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0e30sXG5cdFx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdFx0KTtcblx0XHRcdFx0Y29uc3QgdGl0bGUgPSAoYXdhaXQgZ2V0VGV4dFJlc3BvbnNlRnJvbVN0cmVhbShyZXNwb25zZSkpLnRyaW0oKS5yZXBsYWNlKC9eW1wiJ118W1wiJ10kL2csICcnKTtcblx0XHRcdFx0aWYgKHRpdGxlICYmIHRoaXMud2l6YXJkKSB7XG5cdFx0XHRcdFx0dGhpcy53aXphcmQuc2V0R2VuZXJhdGVkVGl0bGUodGl0bGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMud2l6YXJkPy5yZXNldEdlbmVyYXRlQnV0dG9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gVGl0bGUgZ2VuZXJhdGlvbiBmYWlsZWQ6JywgZXJyKTtcblx0XHRcdFx0dGhpcy53aXphcmQ/LnJlc2V0R2VuZXJhdGVCdXR0b24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZldGNoUGVyZm9ybWFuY2VJbmZvKG9wdGlvbnM/OiB7IHNraXBDYWNoZT86IGJvb2xlYW47IHVuYm91bmRlZD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy53aXphcmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBlcmZvcm1hbmNlSW5mbyA9IGF3YWl0IHRoaXMucHJvY2Vzc1NlcnZpY2UuZ2V0UGVyZm9ybWFuY2VJbmZvKG9wdGlvbnMpO1xuXHRcdFx0dGhpcy53aXphcmQudXBkYXRlTW9kZWwoe1xuXHRcdFx0XHRwcm9jZXNzSW5mbzogcGVyZm9ybWFuY2VJbmZvLnByb2Nlc3NJbmZvLFxuXHRcdFx0XHR3b3Jrc3BhY2VJbmZvOiBwZXJmb3JtYW5jZUluZm8ud29ya3NwYWNlSW5mbyxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbSXNzdWVSZXBvcnRlckVkaXRvclBhbmVdIEZhaWxlZCB0byBmZXRjaCBwZXJmb3JtYW5jZSBpbmZvOicsIGVycik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMud2l6YXJkPy5tYXJrUGVyZm9ybWFuY2VJbmZvTG9hZGVkKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoUGVyZm9ybWFuY2VJbmZvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFVzZXItaW5pdGlhdGVkIHJlZnJlc2g6IGJ5cGFzcyB0aGUgd29ya3NwYWNlLXN0YXRzIGNhY2hlIGFuZCB3YWxrIHRoZVxuXHRcdC8vIGZ1bGwgZmlsZXN5c3RlbSAobm8gY2FwKSBzbyB0aGUgcmVwb3J0ZWQgZmlsZSBjb3VudHMgYW5kIGZpbGUtdHlwZVxuXHRcdC8vIGJyZWFrZG93biByZWZsZWN0IHRoZSBhY3R1YWwgd29ya3NwYWNlLlxuXHRcdGF3YWl0IHRoaXMuZmV0Y2hQZXJmb3JtYW5jZUluZm8oeyBza2lwQ2FjaGU6IHRydWUsIHVuYm91bmRlZDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcG9wdWxhdGVTeXN0ZW1JbmZvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy53aXphcmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5wdXQgYXMgSXNzdWVSZXBvcnRlckVkaXRvcklucHV0IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGRhdGEgPSBpbnB1dD8uZGF0YTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBWZXJzaW9uIGluZm9cblx0XHRcdGNvbnN0IHZzY29kZVZlcnNpb24gPSBgJHtwcm9kdWN0Lm5hbWVTaG9ydH0gJHshIXByb2R1Y3QuZGFyd2luVW5pdmVyc2FsQXNzZXRJZCA/IGAke3Byb2R1Y3QudmVyc2lvbn0gKFVuaXZlcnNhbClgIDogcHJvZHVjdC52ZXJzaW9ufSAoJHtwcm9kdWN0LmNvbW1pdCB8fCAnQ29tbWl0IHVua25vd24nfSwgJHtwcm9kdWN0LmRhdGUgfHwgJ0RhdGUgdW5rbm93bid9KWA7XG5cdFx0XHRjb25zdCBzeXN0ZW1JbmZvID0gYXdhaXQgdGhpcy5wcm9jZXNzU2VydmljZS5nZXRTeXN0ZW1JbmZvKCk7XG5cdFx0XHR0aGlzLndpemFyZC51cGRhdGVNb2RlbCh7XG5cdFx0XHRcdHZlcnNpb25JbmZvOiB7IHZzY29kZVZlcnNpb24sIG9zOiBzeXN0ZW1JbmZvLm9zIH0sXG5cdFx0XHRcdHN5c3RlbUluZm8sXG5cdFx0XHRcdHN5c3RlbUluZm9XZWI6IG5hdmlnYXRvci51c2VyQWdlbnQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gSG9ub3VyIGBpc3N1ZVJlcG9ydGVyLndpemFyZC5mdWxsV29ya3NwYWNlU2NhbmAgb25seSBvbiB0aGUgYXV0b21hdGljXG5cdFx0XHQvLyAoaW5pdGlhbCkgY29sbGVjdGlvbi4gVGhlIHVzZXItaW5pdGlhdGVkIHJlZnJlc2ggYmVsb3cgaXMgYWx3YXlzXG5cdFx0XHQvLyB1bmJvdW5kZWQgXHUyMDE0IHRoZSB1c2VyIGhhcyBleHBsaWNpdGx5IGFza2VkIGZvciBmcmVzaCBkYXRhIGFuZCB0aGVcblx0XHRcdC8vIGJ1dHRvbiBzaG93cyBhIHNwaW5uZXIgd2hpbGUgaXQgcnVucy5cblx0XHRcdGNvbnN0IGZ1bGxTY2FuID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignaXNzdWVSZXBvcnRlci53aXphcmQuZnVsbFdvcmtzcGFjZVNjYW4nKSAhPT0gZmFsc2U7XG5cdFx0XHRhd2FpdCB0aGlzLmZldGNoUGVyZm9ybWFuY2VJbmZvKHsgdW5ib3VuZGVkOiBmdWxsU2NhbiB9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0lzc3VlUmVwb3J0ZXJFZGl0b3JQYW5lXSBGYWlsZWQgdG8gY29sbGVjdCBzeXN0ZW0gaW5mbzonLCBlcnIpO1xuXHRcdFx0dGhpcy53aXphcmQ/Lm1hcmtQZXJmb3JtYW5jZUluZm9Mb2FkZWQoKTtcblx0XHR9XG5cblx0XHQvLyBFeHBlcmltZW50cyAoaW5kZXBlbmRlbnQgZnJvbSBzeXN0ZW0gaW5mbylcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXhwZXJpbWVudHMgPSBhd2FpdCB0aGlzLmV4cGVyaW1lbnRTZXJ2aWNlLmdldEN1cnJlbnRFeHBlcmltZW50cygpO1xuXHRcdFx0dGhpcy53aXphcmQ/LnVwZGF0ZU1vZGVsKHsgZXhwZXJpbWVudEluZm86IGV4cGVyaW1lbnRzPy5qb2luKCdcXG4nKSA/PyBsb2NhbGl6ZSgnbm9FeHBlcmltZW50cycsIFwiTm8gY3VycmVudCBleHBlcmltZW50cy5cIikgfSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmVcblx0XHR9XG5cblx0XHQvLyBXYWl0IGZvciB0aGUgaXNzdWUgc2VydmljZSB0byBmaW5pc2ggZW51bWVyYXRpbmcgaW5zdGFsbGVkIGV4dGVuc2lvbnNcblx0XHQvLyAoaXQga2lja3Mgb2ZmIGVudW1lcmF0aW9uIGluIHBhcmFsbGVsIHdpdGggdGhpcyBwYW5lIG9wZW5pbmcpLlxuXHRcdGF3YWl0IGRhdGE/LndoZW5FeHRlbnNpb25zTG9hZGVkO1xuXHRcdGlmIChkYXRhICYmIGRhdGEuZW5hYmxlZEV4dGVuc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgbm9uVGhlbWUgPSBkYXRhLmVuYWJsZWRFeHRlbnNpb25zLmZpbHRlcihlID0+ICFlLmlzVGhlbWUgJiYgIWUuaXNCdWlsdGluKTtcblx0XHRcdGNvbnN0IHRoZW1lQ291bnQgPSBkYXRhLmVuYWJsZWRFeHRlbnNpb25zLmZpbHRlcihlID0+IGUuaXNUaGVtZSkubGVuZ3RoO1xuXHRcdFx0dGhpcy53aXphcmQ/LnVwZGF0ZU1vZGVsKHtcblx0XHRcdFx0YWxsRXh0ZW5zaW9uczogZGF0YS5lbmFibGVkRXh0ZW5zaW9ucyxcblx0XHRcdFx0ZW5hYmxlZE5vblRoZW1lRXh0ZXNpb25zOiBub25UaGVtZSxcblx0XHRcdFx0bnVtYmVyT2ZUaGVtZUV4dGVzaW9uczogdGhlbWVDb3VudCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBmdWxsIGFzeW5jIHBvcHVsYXRpb24gKHRva2VuLCBpbnRlZ3JpdHkgY2hlY2ssIGV4cGVyaW1lbnRzKVxuXHRcdC8vIHRvIGZpbmlzaCBzbyB3ZSBjYW4gZm9yd2FyZCBsYXRlLWFycml2aW5nIHZhbHVlcyBpbnRvIHRoZSB3aXphcmQgbW9kZWwuXG5cdFx0Ly8gTm90ZTogZ2l0aHViQWNjZXNzVG9rZW4gZG9lc24ndCBuZWVkIGZvcndhcmRpbmcgXHUyMDE0IGl0J3MgcmVhZCBmcm9tIHRoZVxuXHRcdC8vIHNoYXJlZCBkYXRhIG9iamVjdCBhdCBzdWJtaXQgdGltZSwgbm90IGZyb20gdGhlIG92ZXJsYXkncyBpbnRlcm5hbCBtb2RlbC5cblx0XHRhd2FpdCBkYXRhPy53aGVuRGF0YUNvbXBsZXRlO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHR0aGlzLndpemFyZD8udXBkYXRlTW9kZWwoe1xuXHRcdFx0XHRpc0luc3RhbGxhdGlvblB1cmU6IGRhdGEuaXNJbnN0YWxsYXRpb25QdXJlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlQXR0YWNobWVudHNGcm9tSW5wdXQoaW5wdXQ6IElzc3VlUmVwb3J0ZXJFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53aXphcmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGlucHV0LnNhdmVkU2NyZWVuc2hvdHM/Lmxlbmd0aCB8fCBpbnB1dC5zYXZlZFJlY29yZGluZ3M/Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy53aXphcmQucmVzdG9yZUF0dGFjaG1lbnRzKGlucHV0LnNhdmVkU2NyZWVuc2hvdHMgPz8gW10sIGlucHV0LnNhdmVkUmVjb3JkaW5ncyA/PyBbXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkZXN0cm95V2l6YXJkKCk6IHZvaWQge1xuXHRcdC8vIFN0b3AgYW55IGFjdGl2ZSByZWNvcmRpbmcgdG8gYXZvaWQgbWVtb3J5IGxlYWtzXG5cdFx0aWYgKHRoaXMucmVjb3JkaW5nU2VydmljZS5zdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKSB7XG5cdFx0XHR0aGlzLnJlY29yZGluZ1NlcnZpY2UuZGlzY2FyZFJlY29yZGluZygpO1xuXHRcdH1cblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLndpemFyZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLndpemFyZElucHV0ID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0Y2xlYXJOb2RlKHRoaXMuY29udGFpbmVyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3VyZmFjZSBhIG5vdGlmaWNhdGlvbiB0ZWxsaW5nIHRoZSB1c2VyIGhvdyB0byBncmFudCBTY3JlZW4gUmVjb3JkaW5nXG5cdCAqIHBlcm1pc3Npb24uIE9uIG1hY09TLCBpbmNsdWRlcyBhIGRlZXAtbGluayB0byBTeXN0ZW0gU2V0dGluZ3MuXG5cdCAqL1xuXHRwcml2YXRlIHNob3dTY3JlZW5SZWNvcmRpbmdQZXJtaXNzaW9uTm90aWZpY2F0aW9uKCk6IHZvaWQge1xuXHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bG9jYWxpemUoJ3NjcmVlblJlY29yZGluZ1Blcm1pc3Npb25EZW5pZWQnLCBcInswfSBuZWVkcyBTY3JlZW4gUmVjb3JkaW5nIHBlcm1pc3Npb24gdG8gcmVjb3JkIHZpZGVvcy4gR3JhbnQgYWNjZXNzIGluIFN5c3RlbSBTZXR0aW5ncywgdGhlbiBjbGljayBSZWNvcmQgYWdhaW4uXCIsIHByb2R1Y3QubmFtZVNob3J0KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb3BlblN5c3RlbVNldHRpbmdzJywgXCJPcGVuIFN5c3RlbSBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnJlY29yZGluZ1NlcnZpY2Uub3BlblNjcmVlbkNhcHR1cmVQZXJtaXNzaW9uU2V0dGluZ3MoKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS53YXJuKFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NyZWVuUmVjb3JkaW5nUGVybWlzc2lvbkRlbmllZEdlbmVyaWMnLCBcIlNjcmVlbiByZWNvcmRpbmcgcGVybWlzc2lvbiB3YXMgZGVuaWVkLiBBbGxvdyB7MH0gdG8gcmVjb3JkIHRoZSBzY3JlZW4gYW5kIHRyeSBhZ2Fpbi5cIiwgcHJvZHVjdC5uYW1lU2hvcnQpXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cdFx0dGhpcy53aXphcmQ/LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmVSZWNvcmRpbmdBbmRBZGQoZGF0YTogSVJlY29yZGluZ0RhdGEpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gZGF0YS5taW1lVHlwZS5zdGFydHNXaXRoKCd2aWRlby9tcDQnKSA/ICdtcDQnIDogJ3dlYm0nO1xuXHRcdFx0Y29uc3QgZmlsZU5hbWUgPSBgdnNjb2RlLXJlY29yZGluZy0ke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5yZXBsYWNlKC9bOi5dL2csICctJyl9LiR7ZXh0ZW5zaW9ufWA7XG5cdFx0XHQvLyBXcml0ZSB0byB0aGUgT1MgdGVtcCBmb2xkZXIgc28gYXJ0aWZhY3RzIGFyZSBjbGVhbmVkIHVwIGF1dG9tYXRpY2FsbHkuXG5cdFx0XHRjb25zdCBmb2xkZXIgPSBVUkkuam9pblBhdGgodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UudG1wRGlyLCAnaXNzdWUtcmVjb3JkaW5ncycpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmpvaW5QYXRoKGZvbGRlciwgZmlsZU5hbWUpO1xuXG5cdFx0XHRjb25zdCBhcnJheUJ1ZmZlciA9IGF3YWl0IGRhdGEuYmxvYi5hcnJheUJ1ZmZlcigpO1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS5jcmVhdGVGb2xkZXIoZm9sZGVyKTtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldCwgVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShhcnJheUJ1ZmZlcikpKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbSXNzdWVSZXBvcnRlckVkaXRvclBhbmVdIFJlY29yZGluZyBzYXZlZCB0byAke3RhcmdldC50b1N0cmluZygpfWApO1xuXG5cdFx0XHQvLyBHZW5lcmF0ZSB0aHVtYm5haWwgZnJvbSB0aGUgc2F2ZWQgZmlsZSBcdTIwMTQgYmxvYiBVUkxzIGFyZSBibG9ja2VkIGJ5XG5cdFx0XHQvLyBFbGVjdHJvbidzIENTUCBmb3IgbWVkaWEgZWxlbWVudHMsIHNvIHdlIHVzZSB0aGUgc2F2ZWQgZmlsZSB2aWFcblx0XHRcdC8vIHRoZSB2c2NvZGUtZmlsZTovLyBwcm90b2NvbCB3aGljaCB0aGUgcmVuZGVyZXIgY2FuIGxvYWQuXG5cdFx0XHRjb25zdCB0aHVtYm5haWxEYXRhVXJsID0gYXdhaXQgdGhpcy5nZW5lcmF0ZVZpZGVvVGh1bWJuYWlsKHRhcmdldCk7XG5cdFx0XHR0aGlzLndpemFyZD8uYWRkUmVjb3JkaW5nKHRhcmdldC5mc1BhdGgsIGRhdGEuZHVyYXRpb25NcywgdGh1bWJuYWlsRGF0YVVybCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZV0gRmFpbGVkIHRvIHNhdmUgcmVjb3JkaW5nOicsIGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZVZpZGVvVGh1bWJuYWlsKGZpbGVVcmk6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gVGhlIGZpbGVVcmkgbWF5IHVzZSB0aGUgdnNjb2RlLXVzZXJkYXRhOiBzY2hlbWUuIENvbnZlcnQgdG8gYSByZWFsXG5cdFx0Ly8gZmlsZTovLyBVUkkgdmlhIGZzUGF0aCwgdGhlbiB0byB2c2NvZGUtZmlsZTovL3ZzY29kZS1hcHAvIHNvIHRoZVxuXHRcdC8vIHJlbmRlcmVyJ3MgQ1NQIGFsbG93cyBsb2FkaW5nIGl0IGFzIGEgbWVkaWEgc291cmNlLlxuXHRcdGNvbnN0IGJyb3dzZXJVcmkgPSBGaWxlQWNjZXNzLnVyaVRvQnJvd3NlclVyaShVUkkuZmlsZShmaWxlVXJpLmZzUGF0aCkpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgdmlkZW8gPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ZpZGVvJyk7XG5cdFx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBmaW5pc2godW5kZWZpbmVkKSwgNTAwMCk7XG5cdFx0XHRsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGZpbmlzaCA9IChyZXN1bHQ6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRpZiAocmVzb2x2ZWQpIHsgcmV0dXJuOyB9XG5cdFx0XHRcdHJlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuXHRcdFx0XHR2aWRlby5wYXVzZSgpO1xuXHRcdFx0XHR2aWRlby5yZW1vdmVBdHRyaWJ1dGUoJ3NyYycpO1xuXHRcdFx0XHR2aWRlby5sb2FkKCk7XG5cdFx0XHRcdHZpZGVvLnJlbW92ZSgpO1xuXHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY2FwdHVyZUZyYW1lID0gKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmICghdmlkZW8udmlkZW9XaWR0aCB8fCAhdmlkZW8udmlkZW9IZWlnaHQpIHtcblx0XHRcdFx0XHRcdGZpbmlzaCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjYW52YXMgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHRcdFx0XHRcdGNhbnZhcy53aWR0aCA9IHZpZGVvLnZpZGVvV2lkdGg7XG5cdFx0XHRcdFx0Y2FudmFzLmhlaWdodCA9IHZpZGVvLnZpZGVvSGVpZ2h0O1xuXHRcdFx0XHRcdGNvbnN0IGN0eCA9IGNhbnZhcy5nZXRDb250ZXh0KCcyZCcpO1xuXHRcdFx0XHRcdGlmICghY3R4KSB7XG5cdFx0XHRcdFx0XHRmaW5pc2godW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y3R4LmRyYXdJbWFnZSh2aWRlbywgMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcblx0XHRcdFx0XHRmaW5pc2goY2FudmFzLnRvRGF0YVVSTCgnaW1hZ2UvanBlZycsIDAuNykpO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRmaW5pc2godW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0dmlkZW8ubXV0ZWQgPSB0cnVlO1xuXHRcdFx0dmlkZW8ucGxheXNJbmxpbmUgPSB0cnVlO1xuXHRcdFx0dmlkZW8ucHJlbG9hZCA9ICdhdXRvJztcblx0XHRcdHZpZGVvLnN0eWxlLmNzc1RleHQgPSAncG9zaXRpb246Zml4ZWQ7dG9wOi05OTk5cHg7bGVmdDotOTk5OXB4O3dpZHRoOjMyMHB4O2hlaWdodDoyNDBweDtvcGFjaXR5OjA7cG9pbnRlci1ldmVudHM6bm9uZTsnO1xuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHZpZGVvKTtcblx0XHRcdHZpZGVvLnNyYyA9IGJyb3dzZXJVcmkudG9TdHJpbmcodHJ1ZSk7XG5cblx0XHRcdHZpZGVvLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWRlZGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRcdHZpZGVvLnBhdXNlKCk7XG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uID0gTnVtYmVyLmlzRmluaXRlKHZpZGVvLmR1cmF0aW9uKSA/IHZpZGVvLmR1cmF0aW9uIDogMDtcblx0XHRcdFx0aWYgKGR1cmF0aW9uID4gMC41KSB7XG5cdFx0XHRcdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignc2Vla2VkJywgKCkgPT4gY2FwdHVyZUZyYW1lKCksIHsgb25jZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dmlkZW8uY3VycmVudFRpbWUgPSBNYXRoLm1pbigwLjUsIGR1cmF0aW9uIC8gMik7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHRjYXB0dXJlRnJhbWUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhcHR1cmVGcmFtZSgpO1xuXHRcdFx0fSwgeyBvbmNlOiB0cnVlIH0pO1xuXHRcdFx0dmlkZW8uYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCAoKSA9PiBmaW5pc2godW5kZWZpbmVkKSwgeyBvbmNlOiB0cnVlIH0pO1xuXHRcdFx0dmlkZW8ubG9hZCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke2RpbWVuc2lvbi53aWR0aH1weGA7XG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtkaW1lbnNpb24uaGVpZ2h0fXB4YDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyxRQUFRLGlCQUE0QjtBQUNoRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQjtBQUMzQixTQUF1Qiw0QkFBNEI7QUFFbkQsU0FBUyx3QkFBd0M7QUFDakQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxrQkFB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
