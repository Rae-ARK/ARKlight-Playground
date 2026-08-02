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
import { isFirefox } from "../../../../base/browser/browser.js";
import { BrowserFeatures } from "../../../../base/browser/canIUse.js";
import { DataTransfers } from "../../../../base/browser/dnd.js";
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Orientation } from "../../../../base/browser/ui/sash/sash.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { AutoOpenBarrier, Promises, disposableTimeout, timeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { debounce } from "../../../../base/common/decorators.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { normalizeDriveLetter, template, tildify } from "../../../../base/common/labels.js";
import { Disposable, DisposableMap, DisposableStore, ImmortalReference, MutableDisposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as path from "../../../../base/common/path.js";
import { OS, OperatingSystem, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { URI } from "../../../../base/common/uri.js";
import { TabFocus } from "../../../../editor/browser/config/tabFocus.js";
import * as nls from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { CodeDataTransfers, containsDragType, getPathForFile } from "../../../../platform/dnd/browser/dnd.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResultKind } from "../../../../platform/keybinding/common/keybindingResolver.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCapabilityStoreMultiplexer } from "../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { deserializeEnvironmentVariableCollections } from "../../../../platform/terminal/common/environmentVariableShared.js";
import { GeneralShellType, ITerminalLogService, PosixShellType, ProcessPropertyType, ShellIntegrationStatus, TerminalExitReason, TerminalLocation, TerminalSettingId, TitleEventSource, WindowsShellType } from "../../../../platform/terminal/common/terminal.js";
import { formatMessageForTerminal } from "../../../../platform/terminal/common/terminalStrings.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { PANEL_BACKGROUND, SIDE_BAR_BACKGROUND } from "../../../common/theme.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { ITerminalConfigurationService, TerminalDataTransfers } from "./terminal.js";
import { TerminalLaunchHelpAction } from "./terminalActions.js";
import { TerminalEditorInput } from "./terminalEditorInput.js";
import { TerminalExtensionsRegistry } from "./terminalExtensions.js";
import { getColorClass, createColorStyleElement, getStandardColors } from "./terminalIcon.js";
import { TerminalProcessManager } from "./terminalProcessManager.js";
import { TerminalStatus, TerminalStatusList } from "./terminalStatusList.js";
import { getTerminalResourcesFromDragEvent, getTerminalUri } from "./terminalUri.js";
import { TerminalWidgetManager } from "./widgets/widgetManager.js";
import { LineDataEventAddon } from "./xterm/lineDataEventAddon.js";
import { XtermTerminal, getXtermScaledDimensions } from "./xterm/xtermTerminal.js";
import { ITerminalProfileResolverService, ProcessState, TERMINAL_VIEW_ID, TerminalCommandId } from "../common/terminal.js";
import { TERMINAL_BACKGROUND_COLOR } from "../common/terminalColorRegistry.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { getUriLabelForShell, getShellIntegrationTimeout, getWorkspaceForTerminal, preparePathForShell } from "../common/terminalEnvironment.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { isHorizontal, IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { importAMDNodeModule } from "../../../../amdX.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { terminalStrings } from "../common/terminalStrings.js";
import { TerminalIconPicker } from "./terminalIconPicker.js";
import { TerminalResizeDebouncer } from "./terminalResizeDebouncer.js";
import { openContextMenu } from "./terminalContextMenu.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { TerminalContribCommandId } from "../terminalContribExports.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { PromptInputState } from "../../../../platform/terminal/common/capabilities/commandDetection/promptInputModel.js";
import { hasKey, isNumber, isString } from "../../../../base/common/types.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["WaitForContainerThreshold"] = 100] = "WaitForContainerThreshold";
  Constants2[Constants2["DefaultCols"] = 80] = "DefaultCols";
  Constants2[Constants2["DefaultRows"] = 30] = "DefaultRows";
  Constants2[Constants2["MaxCanvasWidth"] = 4096] = "MaxCanvasWidth";
  return Constants2;
})(Constants || {});
let xtermConstructor;
const shellIntegrationSupportedShellTypes = [
  PosixShellType.Bash,
  PosixShellType.Zsh,
  GeneralShellType.PowerShell,
  GeneralShellType.Python
];
const agentCliTitlePatterns = /* @__PURE__ */ new Map([
  [GeneralShellType.Claude, /claude\s*code/i],
  // [GeneralShellType.Codex, /\bcodex\b/i], // codex does not report osc title.
  [GeneralShellType.CommandCode, /command\s*code/i],
  [GeneralShellType.Copilot, /\bcopilot\b/i],
  [GeneralShellType.Gemini, /\bgemini\b/i]
]);
let TerminalInstance = class extends Disposable {
  constructor(_terminalShellTypeContextKey, _shellLaunchConfig, _contextKeyService, _contextMenuService, instantiationService, _terminalConfigurationService, _terminalProfileResolverService, _pathService, _fileService, _keybindingService, _notificationService, _preferencesService, _viewsService, _themeService, _configurationService, _logService, _storageService, _accessibilityService, _productService, _quickInputService, _workbenchEnvironmentService, _workspaceContextService, _editorService, _workspaceTrustRequestService, _historyService, _telemetryService, _openerService, _commandService, _accessibilitySignalService, _viewDescriptorService) {
    super();
    this._terminalShellTypeContextKey = _terminalShellTypeContextKey;
    this._shellLaunchConfig = _shellLaunchConfig;
    this._contextKeyService = _contextKeyService;
    this._contextMenuService = _contextMenuService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._pathService = _pathService;
    this._fileService = _fileService;
    this._keybindingService = _keybindingService;
    this._notificationService = _notificationService;
    this._viewsService = _viewsService;
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._accessibilityService = _accessibilityService;
    this._quickInputService = _quickInputService;
    this._workbenchEnvironmentService = _workbenchEnvironmentService;
    this._workspaceContextService = _workspaceContextService;
    this._editorService = _editorService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._historyService = _historyService;
    this._telemetryService = _telemetryService;
    this._openerService = _openerService;
    this._commandService = _commandService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._viewDescriptorService = _viewDescriptorService;
    this._contributions = /* @__PURE__ */ new Map();
    this._latestXtermWriteData = 0;
    this._latestXtermParseData = 0;
    this._title = "";
    this._titleSource = TitleEventSource.Process;
    this._cols = 0;
    this._rows = 0;
    this._cwd = void 0;
    this._initialCwd = void 0;
    this._injectedArgs = void 0;
    this._layoutSettingsChanged = true;
    this._areLinksReady = false;
    this._initialDataEventsListener = this._register(new MutableDisposable());
    this._initialDataEvents = [];
    this._messageTitleDisposable = this._register(new MutableDisposable());
    this._dndObserver = this._register(new MutableDisposable());
    this._processName = "";
    this._usedShellIntegrationInjection = false;
    this.capabilities = this._register(new TerminalCapabilityStoreMultiplexer());
    this.disableLayout = false;
    this._targetRef = new ImmortalReference(void 0);
    // The onExit event is special in that it fires and is disposed after the terminal instance
    // itself is disposed
    this._onExit = new Emitter();
    this.onExit = this._onExit.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDisposed = this._register(new Emitter());
    this.onDisposed = this._onDisposed.event;
    this._onProcessIdReady = this._register(new Emitter());
    this.onProcessIdReady = this._onProcessIdReady.event;
    this._onProcessReplayComplete = this._register(new Emitter());
    this.onProcessReplayComplete = this._onProcessReplayComplete.event;
    this._onTitleChanged = this._register(new Emitter());
    this.onTitleChanged = this._onTitleChanged.event;
    this._onIconChanged = this._register(new Emitter());
    this.onIconChanged = this._onIconChanged.event;
    this._onWillData = this._register(new Emitter());
    this.onWillData = this._onWillData.event;
    this._onData = this._register(new Emitter());
    this.onData = this._onData.event;
    this._onBinary = this._register(new Emitter());
    this.onBinary = this._onBinary.event;
    this._onRequestExtHostProcess = this._register(new Emitter());
    this.onRequestExtHostProcess = this._onRequestExtHostProcess.event;
    this._onDimensionsChanged = this._register(new Emitter());
    this.onDimensionsChanged = this._onDimensionsChanged.event;
    this._onMaximumDimensionsChanged = this._register(new Emitter());
    this.onMaximumDimensionsChanged = this._onMaximumDimensionsChanged.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidRequestFocus = this._register(new Emitter());
    this.onDidRequestFocus = this._onDidRequestFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._onDidInputData = this._register(new Emitter());
    this.onDidInputData = this._onDidInputData.event;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._onRequestAddInstanceToGroup = this._register(new Emitter());
    this.onRequestAddInstanceToGroup = this._onRequestAddInstanceToGroup.event;
    this._onDidChangeHasChildProcesses = this._register(new Emitter());
    this.onDidChangeHasChildProcesses = this._onDidChangeHasChildProcesses.event;
    this._onDidExecuteText = this._register(new Emitter());
    this.onDidExecuteText = this._onDidExecuteText.event;
    this._onDidChangeTarget = this._register(new Emitter());
    this.onDidChangeTarget = this._onDidChangeTarget.event;
    this._onDidSendText = this._register(new Emitter());
    this.onDidSendText = this._onDidSendText.event;
    this._onDidChangeShellType = this._register(new Emitter());
    this.onDidChangeShellType = this._onDidChangeShellType.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._onLineData = this._register(new Emitter({
      onDidAddFirstListener: async () => (this.xterm ?? await this._xtermReadyPromise)?.raw.loadAddon(this._lineDataEventAddon)
    }));
    this.onLineData = this._onLineData.event;
    this.sessionId = generateUuid();
    this._wrapperElement = document.createElement("div");
    this._wrapperElement.classList.add("terminal-wrapper");
    this._widgetManager = this._register(instantiationService.createInstance(TerminalWidgetManager));
    this._isExiting = false;
    this._isDisposing = false;
    this._hadFocusOnExit = false;
    this._isVisible = false;
    this._instanceId = TerminalInstance._instanceIdCounter++;
    this._fixedRows = _shellLaunchConfig.attachPersistentProcess?.fixedDimensions?.rows;
    this._fixedCols = _shellLaunchConfig.attachPersistentProcess?.fixedDimensions?.cols;
    this._shellLaunchConfig.shellIntegrationEnvironmentReporting = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnvironmentReporting);
    this._resource = getTerminalUri(this._workspaceContextService.getWorkspace().id, this.instanceId, this.title);
    if (this._shellLaunchConfig.attachPersistentProcess?.hideFromUser) {
      this._shellLaunchConfig.hideFromUser = this._shellLaunchConfig.attachPersistentProcess.hideFromUser;
    }
    if (this._shellLaunchConfig.attachPersistentProcess?.isFeatureTerminal) {
      this._shellLaunchConfig.isFeatureTerminal = this._shellLaunchConfig.attachPersistentProcess.isFeatureTerminal;
    }
    if (this._shellLaunchConfig.attachPersistentProcess?.type) {
      this._shellLaunchConfig.type = this._shellLaunchConfig.attachPersistentProcess.type;
    }
    if (this._shellLaunchConfig.attachPersistentProcess?.tabActions) {
      this._shellLaunchConfig.tabActions = this._shellLaunchConfig.attachPersistentProcess.tabActions;
    }
    if (this.shellLaunchConfig.cwd) {
      const cwdUri = isString(this._shellLaunchConfig.cwd) ? URI.from({
        scheme: Schemas.file,
        path: this._shellLaunchConfig.cwd
      }) : this._shellLaunchConfig.cwd;
      if (cwdUri) {
        this._workspaceFolder = this._workspaceContextService.getWorkspaceFolder(cwdUri) ?? void 0;
      }
    }
    if (!this._workspaceFolder) {
      const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
      this._workspaceFolder = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? void 0 : void 0;
    }
    const scopedContextKeyService = this._register(_contextKeyService.createScoped(this._wrapperElement));
    this._scopedContextKeyService = scopedContextKeyService;
    this._scopedInstantiationService = this._register(instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, scopedContextKeyService]
    )));
    this._terminalFocusContextKey = TerminalContextKeys.focus.bindTo(scopedContextKeyService);
    this._terminalHasFixedWidth = TerminalContextKeys.terminalHasFixedWidth.bindTo(scopedContextKeyService);
    this._terminalHasTextContextKey = TerminalContextKeys.textSelected.bindTo(this._contextKeyService);
    this._terminalAltBufferActiveContextKey = TerminalContextKeys.altBufferActive.bindTo(scopedContextKeyService);
    this._terminalShellIntegrationEnabledContextKey = TerminalContextKeys.terminalShellIntegrationEnabled.bindTo(scopedContextKeyService);
    this._logService.trace(`terminalInstance#ctor (instanceId: ${this.instanceId})`, this._shellLaunchConfig);
    this._register(this.capabilities.onDidAddCapability((e) => this._logService.debug("terminalInstance added capability", e.id)));
    this._register(this.capabilities.onDidRemoveCapability((e) => this._logService.debug("terminalInstance removed capability", e.id)));
    const capabilityListeners = this._register(new DisposableMap());
    this._register(this.capabilities.onDidAddCapability((e) => {
      capabilityListeners.get(e.id)?.dispose();
      const refreshInfo = () => {
        this._labelComputer?.refreshLabel(this);
        this._refreshShellIntegrationInfoStatus(this);
      };
      switch (e.id) {
        case TerminalCapability.CwdDetection: {
          capabilityListeners.set(e.id, e.capability.onDidChangeCwd((e2) => {
            this._cwd = e2;
            this._setTitle(this.title, TitleEventSource.Config);
          }));
          break;
        }
        case TerminalCapability.CommandDetection: {
          e.capability.promptInputModel.setShellType(this.shellType);
          const store = new DisposableStore();
          store.add(Event.any(
            e.capability.promptInputModel.onDidStartInput,
            e.capability.promptInputModel.onDidChangeInput,
            e.capability.promptInputModel.onDidFinishInput
          )(refreshInfo));
          store.add(e.capability.onCommandExecuted(async (command) => {
            if (!command.id && command.command) {
              const commandId = generateUuid();
              this.xterm?.shellIntegration.setNextCommandId(command.command, commandId);
              await this._processManager.setNextCommandId(command.command, commandId);
            }
          }));
          capabilityListeners.set(e.id, store);
          break;
        }
        case TerminalCapability.PromptTypeDetection: {
          capabilityListeners.set(e.id, e.capability.onPromptTypeChanged(refreshInfo));
          break;
        }
      }
    }));
    this._register(this.onDidChangeShellType(() => this._refreshShellIntegrationInfoStatus(this)));
    this._register(this.capabilities.onDidRemoveCapability((e) => {
      capabilityListeners.get(e.id)?.dispose();
    }));
    if (!this.shellLaunchConfig.executable && !this._workbenchEnvironmentService.remoteAuthority) {
      this._terminalProfileResolverService.resolveIcon(this._shellLaunchConfig, OS);
    }
    this._icon = _shellLaunchConfig.attachPersistentProcess?.icon || _shellLaunchConfig.icon;
    if (this.shellLaunchConfig.customPtyImplementation && !this._shellLaunchConfig.titleTemplate) {
      this._setTitle(this._shellLaunchConfig.name, TitleEventSource.Api);
    }
    this.statusList = this._register(this._scopedInstantiationService.createInstance(TerminalStatusList));
    this._initDimensions();
    this._processManager = this._createProcessManager();
    this._containerReadyBarrier = new AutoOpenBarrier(100 /* WaitForContainerThreshold */);
    this._attachBarrier = new AutoOpenBarrier(1e3);
    this._xtermReadyPromise = this._createXterm();
    this._xtermReadyPromise.then(async () => {
      await this._containerReadyBarrier.wait();
      let os;
      if (!this.shellLaunchConfig.customPtyImplementation && this._terminalConfigurationService.config.shellIntegration?.enabled && !this.shellLaunchConfig.executable) {
        os = await this._processManager.getBackendOS();
        const defaultProfile = await this._terminalProfileResolverService.getDefaultProfile({ remoteAuthority: this.remoteAuthority, os });
        this.shellLaunchConfig.executable = defaultProfile.path;
        this.shellLaunchConfig.args = defaultProfile.args;
        this.shellLaunchConfig.icon ??= defaultProfile.icon;
        this.shellLaunchConfig.color ??= defaultProfile.color;
        this.shellLaunchConfig.env ??= defaultProfile.env;
      }
      if (os && this.shellLaunchConfig.executable) {
        this.setShellType(guessShellTypeFromExecutable(os, this.shellLaunchConfig.executable));
      }
      await this._createProcess();
      if (this.shellLaunchConfig.attachPersistentProcess) {
        this._cwd = this.shellLaunchConfig.attachPersistentProcess.cwd;
        this._setTitle(this.shellLaunchConfig.attachPersistentProcess.title, this.shellLaunchConfig.attachPersistentProcess.titleSource);
        this.setShellType(this.shellType);
      }
      if (this._fixedCols) {
        await this._addScrollbar();
      }
    }).catch((err) => {
      if (!this.isDisposed) {
        throw err;
      }
    });
    this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(AccessibilityVerbositySettingId.Terminal)) {
        this._setAriaLabel(this.xterm?.raw, this._instanceId, this.title);
      }
      if (e.affectsConfiguration("terminal.integrated")) {
        this.updateConfig();
        this.setVisible(this._isVisible);
      }
      const layoutSettings = [
        TerminalSettingId.FontSize,
        TerminalSettingId.FontFamily,
        TerminalSettingId.FontWeight,
        TerminalSettingId.FontWeightBold,
        TerminalSettingId.LetterSpacing,
        TerminalSettingId.LineHeight,
        "editor.fontFamily"
      ];
      if (layoutSettings.some((id) => e.affectsConfiguration(id))) {
        this._layoutSettingsChanged = true;
        await this._resize();
      }
      if (e.affectsConfiguration(TerminalSettingId.UnicodeVersion)) {
        this._updateUnicodeVersion();
      }
      if (e.affectsConfiguration("editor.accessibilitySupport")) {
        this.updateAccessibilitySupport();
      }
      if (e.affectsConfiguration(TerminalSettingId.TerminalTitle) || e.affectsConfiguration(TerminalSettingId.TerminalTitleSeparator) || e.affectsConfiguration(TerminalSettingId.TerminalDescription)) {
        this._labelComputer?.refreshLabel(this);
      }
    }));
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => this._labelComputer?.refreshLabel(this)));
    let initialDataEventsTimeout = dom.getWindow(this._container).setTimeout(() => {
      initialDataEventsTimeout = void 0;
      this._initialDataEvents = void 0;
      this._initialDataEventsListener.clear();
    }, 1e4);
    this._register(toDisposable(() => {
      if (initialDataEventsTimeout) {
        dom.getWindow(this._container).clearTimeout(initialDataEventsTimeout);
      }
    }));
    const contributionDescs = TerminalExtensionsRegistry.getTerminalContributions();
    for (const desc of contributionDescs) {
      if (this._contributions.has(desc.id)) {
        onUnexpectedError(new Error(`Cannot have two terminal contributions with the same id ${desc.id}`));
        continue;
      }
      let contribution;
      try {
        contribution = this._register(this._scopedInstantiationService.createInstance(desc.ctor, {
          instance: this,
          processManager: this._processManager,
          widgetManager: this._widgetManager
        }));
        this._contributions.set(desc.id, contribution);
      } catch (err) {
        onUnexpectedError(err);
      }
      this._xtermReadyPromise.then((xterm) => {
        if (xterm) {
          contribution.xtermReady?.(xterm);
        }
      });
      this._register(this.onWillDispose(() => {
        contribution.dispose();
        this._contributions.delete(desc.id);
      }));
    }
  }
  get xtermReadyPromise() {
    return this._xtermReadyPromise;
  }
  get domElement() {
    return this._wrapperElement;
  }
  get usedShellIntegrationInjection() {
    return this._usedShellIntegrationInjection;
  }
  get shellIntegrationInjectionFailureReason() {
    return this._shellIntegrationInjectionInfo;
  }
  get store() {
    return this._store;
  }
  get extEnvironmentVariableCollection() {
    return this._processManager.extEnvironmentVariableCollection;
  }
  get waitOnExit() {
    return this._shellLaunchConfig.attachPersistentProcess?.waitOnExit || this._shellLaunchConfig.waitOnExit;
  }
  set waitOnExit(value) {
    this._shellLaunchConfig.waitOnExit = value;
  }
  get isVisible() {
    return this._isVisible;
  }
  get targetRef() {
    return this._targetRef;
  }
  get target() {
    return this._targetRef.object;
  }
  set target(value) {
    this._targetRef.object = value;
    this._onDidChangeTarget.fire(value);
  }
  get instanceId() {
    return this._instanceId;
  }
  get resource() {
    return this._resource;
  }
  get cols() {
    if (this._fixedCols !== void 0) {
      return this._fixedCols;
    }
    if (this._dimensionsOverride && this._dimensionsOverride.cols) {
      if (this._dimensionsOverride.forceExactSize) {
        return this._dimensionsOverride.cols;
      }
      return Math.min(Math.max(this._dimensionsOverride.cols, 2), this._cols);
    }
    return this._cols;
  }
  get rows() {
    if (this._fixedRows !== void 0) {
      return this._fixedRows;
    }
    if (this._dimensionsOverride && this._dimensionsOverride.rows) {
      if (this._dimensionsOverride.forceExactSize) {
        return this._dimensionsOverride.rows;
      }
      return Math.min(Math.max(this._dimensionsOverride.rows, 2), this._rows);
    }
    return this._rows;
  }
  get isDisposed() {
    return this._store.isDisposed;
  }
  get fixedCols() {
    return this._fixedCols;
  }
  get fixedRows() {
    return this._fixedRows;
  }
  get maxCols() {
    return this._cols;
  }
  get maxRows() {
    return this._rows;
  }
  // TODO: Ideally processId would be merged into processReady
  get processId() {
    return this._processManager.shellProcessId;
  }
  // TODO: How does this work with detached processes?
  // TODO: Should this be an event as it can fire twice?
  get processReady() {
    return this._processManager.ptyProcessReady;
  }
  get hasChildProcesses() {
    return this.shellLaunchConfig.attachPersistentProcess?.hasChildProcesses || this._processManager.hasChildProcesses;
  }
  get reconnectionProperties() {
    return this.shellLaunchConfig.attachPersistentProcess?.reconnectionProperties || this.shellLaunchConfig.reconnectionProperties;
  }
  get areLinksReady() {
    return this._areLinksReady;
  }
  get initialDataEvents() {
    return this._initialDataEvents;
  }
  get exitCode() {
    return this._exitCode;
  }
  get exitReason() {
    return this._exitReason;
  }
  get hadFocusOnExit() {
    return this._hadFocusOnExit;
  }
  get isTitleSetByProcess() {
    return !!this._messageTitleDisposable.value;
  }
  get shellLaunchConfig() {
    return this._shellLaunchConfig;
  }
  get shellType() {
    return this._shellType;
  }
  get os() {
    return this._processManager.os;
  }
  get hasRemoteAuthority() {
    return this._processManager.remoteAuthority !== void 0;
  }
  get remoteAuthority() {
    return this._processManager.remoteAuthority;
  }
  get hasFocus() {
    return dom.isAncestorOfActiveElement(this._wrapperElement);
  }
  get title() {
    return this._title;
  }
  get titleSource() {
    return this._titleSource;
  }
  get icon() {
    return this._getIcon();
  }
  get color() {
    return this._getColor();
  }
  get processName() {
    return this._processName;
  }
  get sequence() {
    return this._sequence;
  }
  get staticTitle() {
    return this._staticTitle;
  }
  get progressState() {
    return this.xterm?.progressState;
  }
  get workspaceFolder() {
    return this._workspaceFolder;
  }
  get cwd() {
    return this._cwd;
  }
  get initialCwd() {
    return this._initialCwd;
  }
  get description() {
    if (this._description) {
      return this._description;
    }
    const type = this.shellLaunchConfig.attachPersistentProcess?.type || this.shellLaunchConfig.type;
    switch (type) {
      case "Task":
        return terminalStrings.typeTask;
      case "Local":
        return terminalStrings.typeLocal;
      default:
        return void 0;
    }
  }
  get userHome() {
    return this._userHome;
  }
  get shellIntegrationNonce() {
    return this._processManager.shellIntegrationNonce;
  }
  get injectedArgs() {
    return this._injectedArgs;
  }
  getContribution(id) {
    return this._contributions.get(id);
  }
  async _handleOnData(data) {
    await this._processManager.write(data);
    this._onDidInputData.fire(data);
  }
  _getIcon() {
    if (!this._icon) {
      this._icon = this._processManager.processState >= ProcessState.Launching ? getIconRegistry().getIcon(this._configurationService.getValue(TerminalSettingId.TabsDefaultIcon)) : void 0;
    }
    return this._icon;
  }
  _getColor() {
    if (this.shellLaunchConfig.color) {
      return this.shellLaunchConfig.color;
    }
    if (this.shellLaunchConfig?.attachPersistentProcess?.color) {
      return this.shellLaunchConfig.attachPersistentProcess.color;
    }
    if (this._processManager.processState >= ProcessState.Launching) {
      return void 0;
    }
    return void 0;
  }
  _initDimensions() {
    if (!this._container) {
      this._cols = 80 /* DefaultCols */;
      this._rows = 30 /* DefaultRows */;
      return;
    }
    const computedStyle = dom.getWindow(this._container).getComputedStyle(this._container);
    const width = parseInt(computedStyle.width);
    const height = parseInt(computedStyle.height);
    this._evaluateColsAndRows(width, height);
  }
  /**
   * Evaluates and sets the cols and rows of the terminal if possible.
   * @param width The width of the container.
   * @param height The height of the container.
   * @return The terminal's width if it requires a layout.
   */
  _evaluateColsAndRows(width, height) {
    if (!width || !height) {
      this._setLastKnownColsAndRows();
      return null;
    }
    const dimension = this._getDimension(width, height);
    if (!dimension) {
      this._setLastKnownColsAndRows();
      return null;
    }
    const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
    const newRC = getXtermScaledDimensions(dom.getWindow(this.domElement), font, dimension.width, dimension.height);
    if (!newRC) {
      this._setLastKnownColsAndRows();
      return null;
    }
    if (this._cols !== newRC.cols || this._rows !== newRC.rows) {
      this._cols = newRC.cols;
      this._rows = newRC.rows;
      this._fireMaximumDimensionsChanged();
    }
    return dimension.width;
  }
  _setLastKnownColsAndRows() {
    if (TerminalInstance._lastKnownGridDimensions) {
      this._cols = TerminalInstance._lastKnownGridDimensions.cols;
      this._rows = TerminalInstance._lastKnownGridDimensions.rows;
    }
  }
  _fireMaximumDimensionsChanged() {
    this._onMaximumDimensionsChanged.fire();
  }
  _getDimension(width, height) {
    const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
    if (!font || !font.charWidth || !font.charHeight) {
      return void 0;
    }
    if (!this.xterm?.raw.element) {
      return void 0;
    }
    const computedStyle = dom.getWindow(this.xterm.raw.element).getComputedStyle(this.xterm.raw.element);
    const horizontalPadding = parseInt(computedStyle.paddingLeft) + parseInt(computedStyle.paddingRight) + this.xterm.scrollbarWidth;
    const verticalPadding = parseInt(computedStyle.paddingTop) + parseInt(computedStyle.paddingBottom);
    TerminalInstance._lastKnownCanvasDimensions = new dom.Dimension(
      Math.min(4096 /* MaxCanvasWidth */, width - horizontalPadding),
      height - verticalPadding + (this._hasScrollBar && this._horizontalScrollbar ? -5 : 0)
    );
    return TerminalInstance._lastKnownCanvasDimensions;
  }
  get persistentProcessId() {
    return this._processManager.persistentProcessId;
  }
  get shouldPersist() {
    return this._processManager.shouldPersist && !this.shellLaunchConfig.isTransient && (!this.reconnectionProperties || this._configurationService.getValue("task.reconnection") === true);
  }
  static getXtermConstructor(keybindingService, contextKeyService) {
    const keybinding = keybindingService.lookupKeybinding(TerminalContribCommandId.A11yFocusAccessibleBuffer, contextKeyService);
    if (xtermConstructor) {
      return xtermConstructor;
    }
    xtermConstructor = Promises.withAsyncBody(async (resolve) => {
      const Terminal = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
      Terminal.strings.promptLabel = nls.localize("terminal.integrated.a11yPromptLabel", "Terminal input");
      Terminal.strings.tooMuchOutput = keybinding ? nls.localize("terminal.integrated.useAccessibleBuffer", "Use the accessible buffer {0} to manually review output", keybinding.getLabel()) : nls.localize("terminal.integrated.useAccessibleBufferNoKb", "Use the Terminal: Focus Accessible Buffer command to manually review output");
      resolve(Terminal);
    });
    return xtermConstructor;
  }
  /**
   * Create xterm.js instance and attach data listeners.
   */
  async _createXterm() {
    const Terminal = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
    if (this.isDisposed) {
      return void 0;
    }
    const disableShellIntegrationReporting = this.shellLaunchConfig.executable === void 0 || this.shellType === void 0 || !shellIntegrationSupportedShellTypes.includes(this.shellType);
    const xterm = this._scopedInstantiationService.createInstance(XtermTerminal, this._resource, Terminal, {
      cols: this._cols,
      rows: this._rows,
      xtermColorProvider: this._scopedInstantiationService.createInstance(TerminalInstanceColorProvider, this._targetRef),
      capabilities: this.capabilities,
      shellIntegrationNonce: this._processManager.shellIntegrationNonce,
      disableShellIntegrationReporting
    }, this.onDidExecuteText);
    this.xterm = xterm;
    this._resizeDebouncer = this._register(new TerminalResizeDebouncer(
      () => this._isVisible,
      () => xterm,
      async (cols, rows) => {
        if (this.isDisposed) {
          return;
        }
        xterm.resize(cols, rows);
        await this._updatePtyDimensions(xterm.raw);
      },
      async (cols) => {
        if (this.isDisposed) {
          return;
        }
        xterm.resize(cols, xterm.raw.rows);
        await this._updatePtyDimensions(xterm.raw);
      },
      async (rows) => {
        if (this.isDisposed) {
          return;
        }
        xterm.resize(xterm.raw.cols, rows);
        await this._updatePtyDimensions(xterm.raw);
      }
    ));
    this._register(toDisposable(() => this._resizeDebouncer = void 0));
    this.updateAccessibilitySupport();
    this._register(this.xterm.onDidRequestRunCommand((e) => {
      this.sendText(e.command.command, e.noNewLine ? false : true);
    }));
    this._register(this.xterm.onDidRequestRefreshDimensions(() => {
      if (this._lastLayoutDimensions) {
        this.layout(this._lastLayoutDimensions);
      }
    }));
    const initialTextWrittenPromise = this._shellLaunchConfig.initialText ? new Promise((r) => this._writeInitialText(xterm, r)) : void 0;
    const lineDataEventAddon = this._register(new LineDataEventAddon(initialTextWrittenPromise));
    this._register(lineDataEventAddon.onLineData((e) => this._onLineData.fire(e)));
    this._lineDataEventAddon = lineDataEventAddon;
    disposableTimeout(() => {
      this._register(xterm.raw.onBell(() => {
        if (this._configurationService.getValue(TerminalSettingId.EnableBell) || this._configurationService.getValue(TerminalSettingId.EnableVisualBell)) {
          this.statusList.add({
            id: TerminalStatus.Bell,
            severity: Severity.Warning,
            icon: Codicon.bell,
            tooltip: nls.localize("bellStatus", "Bell")
          }, this._terminalConfigurationService.config.bellDuration);
        }
        this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalBell);
      }));
    }, 1e3, this._store);
    this._register(xterm.raw.onSelectionChange(() => this._onDidChangeSelection.fire(this)));
    this._register(xterm.raw.buffer.onBufferChange(() => this._refreshAltBufferContextKey()));
    this._register(this._processManager.onProcessData((e) => this._onProcessData(e)));
    this._register(xterm.raw.onData(async (data) => {
      await this._handleOnData(data);
    }));
    this._register(xterm.raw.onBinary((data) => this._processManager.processBinary(data)));
    this._register(this._processManager.onProcessReady(async (processTraits) => {
      if (processTraits?.windowsPty?.backend === "conpty") {
        this._register(xterm.raw.parser.registerCsiHandler({ final: "c" }, (params) => {
          if (params.length === 0 || params.length === 1 && params[0] === 0) {
            this._handleOnData("\x1B[?61;4c");
            return true;
          }
          return false;
        }));
      }
      if (this._processManager.os) {
        lineDataEventAddon.setOperatingSystem(this._processManager.os);
      }
      xterm.raw.options.windowsPty = processTraits.windowsPty;
      xterm.raw.options.reflowCursorLine = processTraits?.windowsPty?.backend === "conpty" && !!this._terminalConfigurationService.config.windowsUseConptyDll;
    }));
    this._register(this._processManager.onRestoreCommands((e) => this.xterm?.shellIntegration.deserialize(e)));
    this._register(this._viewDescriptorService.onDidChangeLocation(({ views }) => {
      if (views.some((v) => v.id === TERMINAL_VIEW_ID)) {
        xterm.refresh();
      }
    }));
    this._register(xterm.onDidChangeProgress(() => this._labelComputer?.refreshLabel(this)));
    this._register(Event.runAndSubscribe(xterm.shellIntegration.onDidChangeSeenSequences, () => {
      if (xterm.shellIntegration.seenSequences.size > 0) {
        this._refreshShellIntegrationInfoStatus(this);
      }
    }));
    if (!this.capabilities.has(TerminalCapability.CwdDetection)) {
      let onKeyListener = xterm.raw.onKey((e) => {
        const event = new StandardKeyboardEvent(e.domEvent);
        if (event.equals(KeyCode.Enter)) {
          this._updateProcessCwd();
        }
      });
      this._register(this.capabilities.onDidAddCwdDetectionCapability(() => {
        onKeyListener?.dispose();
        onKeyListener = void 0;
      }));
    }
    if (this.xterm?.shellIntegration) {
      this.capabilities.add(this.xterm.shellIntegration.capabilities);
    }
    this._pathService.userHome().then((userHome) => {
      this._userHome = userHome.fsPath;
    });
    if (this._isVisible) {
      this._open();
    }
    return xterm;
  }
  _refreshShellIntegrationInfoStatus(instance) {
    if (!instance.xterm) {
      return;
    }
    const cmdDetectionType = instance.capabilities.get(TerminalCapability.CommandDetection)?.hasRichCommandDetection ? nls.localize("shellIntegration.rich", "Rich") : instance.capabilities.has(TerminalCapability.CommandDetection) ? nls.localize("shellIntegration.basic", "Basic") : instance.usedShellIntegrationInjection ? nls.localize("shellIntegration.injectionFailed", "Injection failed to activate") : nls.localize("shellIntegration.no", "No");
    const detailedAdditions = [];
    if (instance.shellType) {
      detailedAdditions.push(`Shell type: \`${instance.shellType}\``);
    }
    const cwd = instance.cwd;
    if (cwd) {
      detailedAdditions.push(`Current working directory: \`${cwd}\``);
    }
    const seenSequences = Array.from(instance.xterm.shellIntegration.seenSequences);
    if (seenSequences.length > 0) {
      detailedAdditions.push(`Seen sequences: ${seenSequences.map((e) => `\`${e}\``).join(", ")}`);
    }
    const promptType = instance.capabilities.get(TerminalCapability.PromptTypeDetection)?.promptType;
    if (promptType) {
      detailedAdditions.push(`Prompt type: \`${promptType}\``);
    }
    const combinedString = instance.capabilities.get(TerminalCapability.CommandDetection)?.promptInputModel.getCombinedString();
    if (combinedString !== void 0) {
      detailedAdditions.push(`Prompt input: \`\`\`${combinedString}\`\`\``);
    }
    const detailedAdditionsString = detailedAdditions.length > 0 ? "\n\n" + detailedAdditions.map((e) => `- ${e}`).join("\n") : "";
    instance.statusList.add({
      id: TerminalStatus.ShellIntegrationInfo,
      severity: Severity.Info,
      tooltip: `${nls.localize("shellIntegration", "Shell integration")}: ${cmdDetectionType}`,
      detailedTooltip: `${nls.localize("shellIntegration", "Shell integration")}: ${cmdDetectionType}${detailedAdditionsString}`
    });
  }
  async runCommand(commandLine, shouldExecute, commandId, forceBracketedPasteMode, commandLineForMetadata) {
    let commandDetection = this.capabilities.get(TerminalCapability.CommandDetection);
    const siInjectionEnabled = this._configurationService.getValue(TerminalSettingId.ShellIntegrationEnabled) === true;
    const timeoutMs = getShellIntegrationTimeout(
      this._configurationService,
      siInjectionEnabled,
      this.hasRemoteAuthority,
      this._processManager.processReadyTimestamp
    );
    if (!commandDetection || commandDetection.promptInputModel.state !== PromptInputState.Input) {
      const store = new DisposableStore();
      await Promise.race([
        new Promise((r) => {
          store.add(this.capabilities.onDidAddCommandDetectionCapability((e) => {
            commandDetection = e;
            if (commandDetection.promptInputModel.state === PromptInputState.Input) {
              r();
            } else {
              store.add(commandDetection.promptInputModel.onDidStartInput(() => {
                r();
              }));
            }
          }));
        }),
        timeout(timeoutMs)
      ]);
      store.dispose();
    }
    if (commandId && commandDetection) {
      const commandLineToReport = commandLineForMetadata ?? commandLine;
      this.xterm?.shellIntegration.setNextCommandId(commandLineToReport, commandId);
      await this._processManager.setNextCommandId(commandLineToReport, commandId);
    }
    if (shouldExecute && (!commandDetection || commandDetection.promptInputModel.value.length > 0)) {
      await this.sendText("", false);
      await timeout(100);
    }
    await this.sendText(commandLine, shouldExecute, !shouldExecute || forceBracketedPasteMode);
  }
  detachFromElement() {
    this._wrapperElement.remove();
    this._container = void 0;
  }
  attachToElement(container) {
    if (this._container === container) {
      return;
    }
    if (!this._attachBarrier.isOpen()) {
      this._attachBarrier.open();
    }
    this._container = container;
    this._container.appendChild(this._wrapperElement);
    if (this.xterm?.raw.element) {
      this.xterm.raw.open(this.xterm.raw.element);
    }
    this.xterm?.refresh();
    setTimeout(() => {
      if (this._store.isDisposed) {
        return;
      }
      this._initDragAndDrop(container);
    }, 0);
  }
  /**
   * Opens the terminal instance inside the parent DOM element previously set with
   * `attachToElement`, you must ensure the parent DOM element is explicitly visible before
   * invoking this function as it performs some DOM calculations internally
   */
  _open() {
    if (!this.xterm || this.xterm.raw.element) {
      return;
    }
    if (!this._container || !this._container.isConnected) {
      throw new Error("A container element needs to be set with `attachToElement` and be part of the DOM before calling `_open`");
    }
    const xtermHost = document.createElement("div");
    xtermHost.classList.add("terminal-xterm-host");
    this._wrapperElement.appendChild(xtermHost);
    this._container.appendChild(this._wrapperElement);
    const xterm = this.xterm;
    this._wrapperElement.xterm = xterm.raw;
    const screenElement = xterm.attachToElement(xtermHost);
    for (const contribution of this._contributions.values()) {
      if (!this.xterm) {
        this._xtermReadyPromise.then((xterm2) => {
          if (xterm2) {
            contribution.xtermOpen?.(xterm2);
          }
        });
      } else {
        contribution.xtermOpen?.(this.xterm);
      }
    }
    this._register(xterm.shellIntegration.onDidChangeStatus(() => {
      if (this.hasFocus) {
        this._setShellIntegrationContextKey();
      } else {
        this._terminalShellIntegrationEnabledContextKey.reset();
      }
    }));
    if (!xterm.raw.element || !xterm.raw.textarea) {
      throw new Error("xterm elements not set after open");
    }
    this._setAriaLabel(xterm.raw, this._instanceId, this._title);
    xterm.raw.attachCustomKeyEventHandler((event) => {
      if (this._isExiting) {
        return false;
      }
      const standardKeyboardEvent = new StandardKeyboardEvent(event);
      const resolveResult = this._keybindingService.softDispatch(standardKeyboardEvent, standardKeyboardEvent.target);
      const isValidChord = resolveResult.kind === ResultKind.MoreChordsNeeded && this._terminalConfigurationService.config.allowChords && event.key !== "Escape";
      if (this._keybindingService.inChordMode || isValidChord) {
        event.preventDefault();
        return false;
      }
      if (!this._terminalConfigurationService.config.sendKeybindingsToShell && resolveResult.kind === ResultKind.KbFound && resolveResult.commandId && (event.metaKey || this._terminalConfigurationService.shouldCommandSkipShell(resolveResult.commandId))) {
        event.preventDefault();
        return false;
      }
      if (this._terminalConfigurationService.config.allowMnemonics && !isMacintosh && event.altKey) {
        return false;
      }
      if (TabFocus.getTabFocusMode() && event.key === "Tab") {
        return false;
      }
      if (event.key === "Tab" && event.shiftKey) {
        event.preventDefault();
        return true;
      }
      if (isWindows && event.altKey && event.key === "F4" && !event.ctrlKey) {
        return false;
      }
      if (!BrowserFeatures.clipboard.readText && event.key === "v" && event.ctrlKey) {
        return false;
      }
      return true;
    });
    this._register(dom.addDisposableListener(xterm.raw.element, "mousedown", () => {
      const listener = dom.addDisposableListener(xterm.raw.element.ownerDocument, "mouseup", () => {
        setTimeout(() => this._refreshSelectionContextKey(), 0);
        listener.dispose();
      });
    }));
    this._register(dom.addDisposableListener(xterm.raw.element, "touchstart", () => {
      xterm.raw.focus();
    }));
    this._register(dom.addDisposableListener(xterm.raw.element, "keyup", () => {
      setTimeout(() => this._refreshSelectionContextKey(), 0);
    }));
    this._register(dom.addDisposableListener(xterm.raw.textarea, "focus", () => this._setFocus(true)));
    this._register(dom.addDisposableListener(xterm.raw.textarea, "blur", () => this._setFocus(false)));
    this._register(dom.addDisposableListener(xterm.raw.textarea, "focusout", () => this._setFocus(false)));
    this._initDragAndDrop(this._container);
    this._widgetManager.attachToElement(screenElement);
    if (this._lastLayoutDimensions) {
      this.layout(this._lastLayoutDimensions);
    }
    this.updateConfig();
    if (xterm.raw.options.disableStdin) {
      this._attachPressAnyKeyToCloseListener(xterm.raw);
    }
  }
  _setFocus(focused) {
    if (focused) {
      this._terminalFocusContextKey.set(true);
      this._setShellIntegrationContextKey();
      this._onDidFocus.fire(this);
    } else {
      this.resetFocusContextKey();
      this._onDidBlur.fire(this);
      this._refreshSelectionContextKey();
    }
  }
  _setShellIntegrationContextKey() {
    if (this.xterm) {
      this._terminalShellIntegrationEnabledContextKey.set(this.xterm.shellIntegration.status === ShellIntegrationStatus.VSCode);
    }
  }
  resetFocusContextKey() {
    this._terminalFocusContextKey.reset();
    this._terminalShellIntegrationEnabledContextKey.reset();
  }
  _initDragAndDrop(container) {
    const store = new DisposableStore();
    const dndController = store.add(this._scopedInstantiationService.createInstance(TerminalInstanceDragAndDropController, container));
    store.add(dndController.onDropTerminal((e) => this._onRequestAddInstanceToGroup.fire(e)));
    store.add(dndController.onDropFile(async (path2) => {
      this.focus();
      await this.sendPath(path2, false);
    }));
    store.add(new dom.DragAndDropObserver(container, dndController));
    this._dndObserver.value = store;
  }
  hasSelection() {
    return this.xterm ? this.xterm.raw.hasSelection() : false;
  }
  get selection() {
    return this.xterm && this.hasSelection() ? this.xterm.raw.getSelection() : void 0;
  }
  clearSelection() {
    this.xterm?.raw.clearSelection();
  }
  _refreshAltBufferContextKey() {
    this._terminalAltBufferActiveContextKey.set(!!(this.xterm && this.xterm.raw.buffer.active === this.xterm.raw.buffer.alternate));
  }
  dispose(reason) {
    if (this.shellLaunchConfig.type === "Task" && reason === TerminalExitReason.Process && this._exitCode !== 0 && !this.shellLaunchConfig.waitOnExit) {
      return;
    }
    if (this.isDisposed) {
      return;
    }
    this._logService.trace(`terminalInstance#dispose (instanceId: ${this.instanceId})`);
    this._isDisposing = true;
    dispose(this._widgetManager);
    if (this.xterm?.raw.element) {
      this._hadFocusOnExit = this.hasFocus;
    }
    if (this._wrapperElement.xterm) {
      this._wrapperElement.xterm = void 0;
    }
    if (this._horizontalScrollbar) {
      this._horizontalScrollbar.dispose();
      this._horizontalScrollbar = void 0;
    }
    this._onWillDispose.fire(this);
    try {
      this.xterm?.dispose();
    } catch (err) {
      this._logService.error("Exception occurred during xterm disposal", err);
    }
    if (isFirefox) {
      this.resetFocusContextKey();
      this._terminalHasTextContextKey.reset();
      this._onDidBlur.fire(this);
    }
    if (this._pressAnyKeyToCloseListener) {
      this._pressAnyKeyToCloseListener.dispose();
      this._pressAnyKeyToCloseListener = void 0;
    }
    if (this._exitReason === void 0) {
      this._exitReason = reason ?? TerminalExitReason.Unknown;
    }
    this._resizeDebouncer?.dispose();
    this._resizeDebouncer = void 0;
    this._processManager.dispose();
    this._onProcessExit(void 0);
    this._onDisposed.fire(this);
    super.dispose();
  }
  async detachProcessAndDispose(reason) {
    await this._processManager.detachFromProcess(reason === TerminalExitReason.User);
    this.dispose(reason);
  }
  focus(force) {
    this._refreshAltBufferContextKey();
    if (!this.xterm) {
      return;
    }
    if (force || !dom.getActiveWindow().getSelection()?.toString()) {
      this.xterm.raw.focus();
      this._onDidRequestFocus.fire();
    }
  }
  async focusWhenReady(force) {
    await this._xtermReadyPromise;
    await this._attachBarrier.wait();
    this.focus(force);
  }
  async sendText(text, shouldExecute, forceBracketedPasteMode) {
    if (forceBracketedPasteMode && this.xterm?.raw.modes.bracketedPasteMode) {
      text = `\x1B[200~${text}\x1B[201~`;
    }
    text = text.replace(/\r?\n/g, "\r");
    if (shouldExecute && !text.endsWith("\r")) {
      text += "\r";
    }
    this._logService.debug("sending data (vscode)", text);
    await this._processManager.write(text);
    this._onDidInputData.fire(text);
    this._onDidSendText.fire(text);
    this.xterm?.scrollToBottom();
    if (shouldExecute) {
      this._onDidExecuteText.fire();
    }
  }
  async sendSignal(signal) {
    this._logService.debug("sending signal (vscode)", signal);
    await this._processManager.sendSignal(signal);
  }
  async sendPath(originalPath, shouldExecute) {
    return this.sendText(await this.preparePathForShell(originalPath), shouldExecute);
  }
  async preparePathForShell(originalPath) {
    await this.processReady;
    return preparePathForShell(originalPath, this.shellLaunchConfig.executable, this.title, this.shellType, this._processManager.backend, this._processManager.os);
  }
  async getUriLabelForShell(uri) {
    await this.processReady;
    return getUriLabelForShell(uri, this._processManager.backend, this.shellType, this.os);
  }
  setVisible(visible) {
    const didChange = this._isVisible !== visible;
    this._isVisible = visible;
    this._wrapperElement.classList.toggle("active", visible);
    if (visible && this.xterm) {
      this._open();
      this._resizeDebouncer?.flush();
      this._resize();
    }
    if (didChange) {
      this._onDidChangeVisibility.fire(visible);
    }
  }
  scrollDownLine() {
    this.xterm?.scrollDownLine();
  }
  scrollDownPage() {
    this.xterm?.scrollDownPage();
  }
  scrollToBottom() {
    this.xterm?.scrollToBottom();
  }
  scrollUpLine() {
    this.xterm?.scrollUpLine();
  }
  scrollUpPage() {
    this.xterm?.scrollUpPage();
  }
  scrollToTop() {
    this.xterm?.scrollToTop();
  }
  clearBuffer() {
    this._processManager.clearBuffer();
    this.xterm?.clearBuffer();
  }
  _refreshSelectionContextKey() {
    const isActive = !!this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
    let isEditorActive = false;
    const editor = this._editorService.activeEditor;
    if (editor) {
      isEditorActive = editor instanceof TerminalEditorInput;
    }
    this._terminalHasTextContextKey.set((isActive || isEditorActive) && this.hasSelection());
  }
  _createProcessManager() {
    let deserializedCollections;
    if (this.shellLaunchConfig.attachPersistentProcess?.environmentVariableCollections) {
      deserializedCollections = deserializeEnvironmentVariableCollections(this.shellLaunchConfig.attachPersistentProcess.environmentVariableCollections);
    }
    const processManager = this._scopedInstantiationService.createInstance(
      TerminalProcessManager,
      this._instanceId,
      this.shellLaunchConfig?.cwd,
      deserializedCollections,
      this.shellLaunchConfig.shellIntegrationNonce ?? this.shellLaunchConfig.attachPersistentProcess?.shellIntegrationNonce
    );
    this.capabilities.add(processManager.capabilities);
    this._register(processManager.onProcessReady(async (e) => {
      this._onProcessIdReady.fire(this);
      this._initialCwd = await this.getInitialCwd();
      if (!this._labelComputer) {
        this._labelComputer = this._register(this._scopedInstantiationService.createInstance(TerminalLabelComputer));
        this._register(this._labelComputer.onDidChangeLabel((e2) => {
          const wasChanged = this._title !== e2.title || this._description !== e2.description;
          if (wasChanged) {
            this._title = e2.title;
            this._description = e2.description;
            this._onTitleChanged.fire(this);
          }
        }));
      }
      if (this._shellLaunchConfig.name && !this._shellLaunchConfig.titleTemplate) {
        this._setTitle(this._shellLaunchConfig.name, TitleEventSource.Api);
      } else {
        setTimeout(() => {
          this._xtermReadyPromise.then((xterm) => {
            if (xterm) {
              this._messageTitleDisposable.value = xterm.raw.onTitleChange((e2) => this._onTitleChange(e2));
            }
          });
        });
        if (this._shellLaunchConfig.titleTemplate && this._shellLaunchConfig.name) {
          this._setTitle(this._shellLaunchConfig.name, TitleEventSource.Process);
        } else {
          this._setTitle(this._shellLaunchConfig.executable, TitleEventSource.Process);
        }
      }
    }));
    this._register(processManager.onProcessExit((exitCode) => this._onProcessExit(exitCode)));
    this._register(processManager.onDidChangeProperty(({ type, value }) => {
      switch (type) {
        case ProcessPropertyType.Cwd:
          this._cwd = value;
          this._labelComputer?.refreshLabel(this);
          break;
        case ProcessPropertyType.InitialCwd:
          this._initialCwd = value;
          this._cwd = this._initialCwd;
          this._setTitle(this.title, TitleEventSource.Config);
          this._icon = this._shellLaunchConfig.attachPersistentProcess?.icon || this._shellLaunchConfig.icon;
          this._onIconChanged.fire({ instance: this, userInitiated: false });
          break;
        case ProcessPropertyType.Title:
          this._setTitle(value ?? "", TitleEventSource.Process);
          break;
        case ProcessPropertyType.OverrideDimensions:
          this.setOverrideDimensions(value, true);
          break;
        case ProcessPropertyType.ResolvedShellLaunchConfig:
          this._setResolvedShellLaunchConfig(value);
          break;
        case ProcessPropertyType.ShellType:
          this._handleShellTypeChange(value);
          break;
        case ProcessPropertyType.HasChildProcesses:
          this._onDidChangeHasChildProcesses.fire(value);
          break;
        case ProcessPropertyType.UsedShellIntegrationInjection:
          this._usedShellIntegrationInjection = true;
          break;
        case ProcessPropertyType.ShellIntegrationInjectionFailureReason:
          this._shellIntegrationInjectionInfo = value;
          break;
      }
    }));
    this._initialDataEventsListener.value = processManager.onProcessData((ev) => this._initialDataEvents?.push(ev.data));
    this._register(processManager.onProcessReplayComplete(() => this._onProcessReplayComplete.fire()));
    this._register(processManager.onEnvironmentVariableInfoChanged((e) => this._onEnvironmentVariableInfoChanged(e)));
    this._register(processManager.onPtyDisconnect(() => {
      if (this.xterm) {
        this.xterm.raw.options.disableStdin = true;
      }
      this.statusList.add({
        id: TerminalStatus.Disconnected,
        severity: Severity.Error,
        icon: Codicon.debugDisconnect,
        tooltip: nls.localize("disconnectStatus", "Lost connection to process")
      });
    }));
    this._register(processManager.onPtyReconnect(() => {
      if (this.xterm) {
        this.xterm.raw.options.disableStdin = false;
      }
      this.statusList.remove(TerminalStatus.Disconnected);
    }));
    return processManager;
  }
  async _createProcess() {
    if (this.isDisposed) {
      return;
    }
    const trusted = await this._trust();
    const isRemoteTerminal = !!this.remoteAuthority;
    if (!trusted && !(isRemoteTerminal && this._workbenchEnvironmentService.remoteAuthority)) {
      this._onProcessExit({ message: nls.localize("workspaceNotTrustedCreateTerminal", "Cannot launch a terminal process in an untrusted workspace") });
    } else if (this._workspaceContextService.getWorkspace().folders.length === 0 && this._cwd && this._userHome && normalizeDriveLetter(this._cwd) !== normalizeDriveLetter(this._userHome)) {
      this._onProcessExit({
        message: nls.localize("workspaceEmptyCreateTerminalCwd", "Cannot launch a terminal process in an empty workspace with cwd {0} different from userHome {1}", this._cwd, this._userHome)
      });
    }
    if (this._container && this._cols === 0 && this._rows === 0) {
      this._initDimensions();
      this.xterm?.resize(this._cols || 80 /* DefaultCols */, this._rows || 30 /* DefaultRows */);
    }
    const originalIcon = this.shellLaunchConfig.icon;
    await this._processManager.createProcess(this._shellLaunchConfig, this._cols || 80 /* DefaultCols */, this._rows || 30 /* DefaultRows */).then((result) => {
      if (result) {
        if (hasKey(result, { message: true })) {
          this._onProcessExit(result);
        } else if (hasKey(result, { injectedArgs: true })) {
          this._injectedArgs = result.injectedArgs;
        }
      }
    });
    if (this.isDisposed) {
      return;
    }
    if (originalIcon !== this.shellLaunchConfig.icon || this.shellLaunchConfig.color) {
      this._icon = this._shellLaunchConfig.attachPersistentProcess?.icon || this._shellLaunchConfig.icon;
      this._onIconChanged.fire({ instance: this, userInitiated: false });
    }
  }
  registerMarker(offset) {
    return this.xterm?.raw.registerMarker(offset);
  }
  addBufferMarker(properties) {
    this.capabilities.get(TerminalCapability.BufferMarkDetection)?.addMark(properties);
  }
  scrollToMark(startMarkId, endMarkId, highlight) {
    this.xterm?.markTracker.scrollToClosestMarker(startMarkId, endMarkId, highlight);
  }
  async freePortKillProcess(port, command) {
    await this._processManager?.freePortKillProcess(port);
    this.runCommand(command, false);
  }
  _onProcessData(ev) {
    const leadingSegmentedData = [];
    const matches = ev.data.matchAll(/(?<seq>\x1b\][16]33;(?:C|D(?:;\d+)?)\x07)/g);
    let i = 0;
    for (const match of matches) {
      if (match.groups?.seq === void 0) {
        throw new BugIndicatingError("seq must be defined");
      }
      leadingSegmentedData.push(ev.data.substring(i, match.index));
      leadingSegmentedData.push(match.groups?.seq ?? "");
      i = match.index + match[0].length;
    }
    const lastData = ev.data.substring(i);
    for (let i2 = 0; i2 < leadingSegmentedData.length; i2++) {
      this._writeProcessData(leadingSegmentedData[i2]);
    }
    if (ev.trackCommit) {
      ev.writePromise = new Promise((r) => this._writeProcessData(lastData, r));
    } else {
      this._writeProcessData(lastData);
    }
  }
  _writeProcessData(data, cb) {
    this._onWillData.fire(data);
    const messageId = ++this._latestXtermWriteData;
    this.xterm?.raw.write(data, () => {
      this._latestXtermParseData = messageId;
      this._processManager.acknowledgeDataEvent(data.length);
      cb?.();
      this._onData.fire(data);
    });
  }
  /**
   * Called when either a process tied to a terminal has exited or when a terminal renderer
   * simulates a process exiting (e.g. custom execution task).
   * @param exitCode The exit code of the process, this is undefined when the terminal was exited
   * through user action.
   */
  async _onProcessExit(exitCodeOrError) {
    if (this._isExiting || this.isDisposed) {
      return;
    }
    const parsedExitResult = parseExitResult(exitCodeOrError, this.shellLaunchConfig, this._processManager.processState, this._initialCwd);
    if (this._usedShellIntegrationInjection && this._processManager.processState === ProcessState.KilledDuringLaunch && parsedExitResult?.code !== 0) {
      this._relaunchWithShellIntegrationDisabled(parsedExitResult?.message);
      this._onExit.fire(exitCodeOrError);
      return;
    }
    this._isExiting = true;
    await this._flushXtermData();
    this._exitCode = parsedExitResult?.code;
    const exitMessage = parsedExitResult?.message;
    this._logService.debug("Terminal process exit", "instanceId", this.instanceId, "code", this._exitCode, "processState", this._processManager.processState);
    this._onExit.fire(exitCodeOrError);
    if (this.isDisposed) {
      return;
    }
    const waitOnExit = this.waitOnExit;
    if (waitOnExit && this._processManager.processState !== ProcessState.KilledByUser) {
      this._xtermReadyPromise.then((xterm) => {
        if (!xterm) {
          return;
        }
        if (exitMessage) {
          xterm.raw.write(formatMessageForTerminal(exitMessage));
        }
        switch (typeof waitOnExit) {
          case "string":
            xterm.raw.write(formatMessageForTerminal(waitOnExit, { excludeLeadingNewLine: true }));
            break;
          case "function":
            if (this.exitCode !== void 0) {
              xterm.raw.write(formatMessageForTerminal(waitOnExit(this.exitCode), { excludeLeadingNewLine: true }));
            }
            break;
        }
        xterm.raw.options.disableStdin = true;
        if (xterm.raw.textarea) {
          this._attachPressAnyKeyToCloseListener(xterm.raw);
        }
      });
    } else {
      if (exitMessage) {
        const failedDuringLaunch = this._processManager.processState === ProcessState.KilledDuringLaunch;
        if (failedDuringLaunch || this._terminalConfigurationService.config.showExitAlert && this.xterm?.lastInputEvent !== /*Ctrl+D*/
        "") {
          this._notificationService.notify({
            message: exitMessage,
            severity: Severity.Error,
            actions: { primary: [this._scopedInstantiationService.createInstance(TerminalLaunchHelpAction)] }
          });
        } else {
          this._logService.warn(exitMessage);
        }
      }
      this.dispose(TerminalExitReason.Process);
    }
    if (this.isDisposed) {
      this._onExit.dispose();
    }
  }
  _relaunchWithShellIntegrationDisabled(exitMessage) {
    this._shellLaunchConfig.ignoreShellIntegration = true;
    this.relaunch();
    this.statusList.add({
      id: TerminalStatus.ShellIntegrationAttentionNeeded,
      severity: Severity.Warning,
      icon: Codicon.warning,
      tooltip: `${exitMessage} ` + nls.localize("launchFailed.exitCodeOnlyShellIntegration", "Disabling shell integration in user settings might help."),
      hoverActions: [{
        commandId: TerminalCommandId.ShellIntegrationLearnMore,
        label: nls.localize("shellIntegration.learnMore", "Learn more about shell integration"),
        run: () => {
          this._openerService.open("https://code.visualstudio.com/docs/terminal/shell-integration?referrer=in-product");
        }
      }, {
        commandId: "workbench.action.openSettings",
        label: nls.localize("shellIntegration.openSettings", "Open user settings"),
        run: () => {
          this._commandService.executeCommand("workbench.action.openSettings", "terminal.integrated.shellIntegration.enabled");
        }
      }]
    });
    this._telemetryService.publicLog2("terminal/shellIntegrationFailureProcessExit");
  }
  /**
   * Ensure write calls to xterm.js have finished before resolving.
   */
  _flushXtermData() {
    if (this._latestXtermWriteData === this._latestXtermParseData) {
      return Promise.resolve();
    }
    let retries = 0;
    return new Promise((r) => {
      const interval = dom.disposableWindowInterval(dom.getActiveWindow().window, () => {
        if (this._latestXtermWriteData === this._latestXtermParseData || ++retries === 5) {
          interval.dispose();
          r();
        }
      }, 20);
    });
  }
  _attachPressAnyKeyToCloseListener(xterm) {
    if (xterm.textarea && !this._pressAnyKeyToCloseListener) {
      this._pressAnyKeyToCloseListener = dom.addDisposableListener(xterm.textarea, "keypress", (event) => {
        if (this._pressAnyKeyToCloseListener) {
          this._pressAnyKeyToCloseListener.dispose();
          this._pressAnyKeyToCloseListener = void 0;
          this.dispose(TerminalExitReason.Process);
          event.preventDefault();
        }
      });
    }
  }
  _writeInitialText(xterm, callback) {
    if (!this._shellLaunchConfig.initialText) {
      callback?.();
      return;
    }
    const text = isString(this._shellLaunchConfig.initialText) ? this._shellLaunchConfig.initialText : this._shellLaunchConfig.initialText?.text;
    if (isString(this._shellLaunchConfig.initialText)) {
      xterm.raw.writeln(text, callback);
    } else {
      if (this._shellLaunchConfig.initialText.trailingNewLine) {
        xterm.raw.writeln(text, callback);
      } else {
        xterm.raw.write(text, callback);
      }
    }
  }
  async reuseTerminal(shell, reset = false) {
    this._pressAnyKeyToCloseListener?.dispose();
    this._pressAnyKeyToCloseListener = void 0;
    const xterm = this.xterm;
    if (xterm) {
      if (!reset) {
        await new Promise((r) => xterm.raw.write("\n\x1B[G", r));
      }
      if (shell.initialText) {
        this._shellLaunchConfig.initialText = shell.initialText;
        await new Promise((r) => this._writeInitialText(xterm, r));
      }
      if (this._isExiting && this._shellLaunchConfig.waitOnExit) {
        xterm.raw.options.disableStdin = false;
        this._isExiting = false;
      }
      if (reset) {
        xterm.clearDecorations();
      }
    }
    this.statusList.remove(TerminalStatus.RelaunchNeeded);
    if (!reset) {
      shell.initialText = " ";
    }
    this._shellLaunchConfig = shell;
    this._agentShellTypeFromSequence = void 0;
    await this._processManager.relaunch(this._shellLaunchConfig, this._cols || 80 /* DefaultCols */, this._rows || 30 /* DefaultRows */, reset).then((result) => {
      if (result) {
        if (hasKey(result, { message: true })) {
          this._onProcessExit(result);
        } else if (hasKey(result, { injectedArgs: true })) {
          this._injectedArgs = result.injectedArgs;
        }
      }
    });
  }
  relaunch() {
    const shellLaunchConfig = { ...this._shellLaunchConfig };
    delete shellLaunchConfig.attachPersistentProcess;
    this.reuseTerminal(shellLaunchConfig, true);
  }
  _onTitleChange(title) {
    if (this.isTitleSetByProcess) {
      this._setTitle(title, TitleEventSource.Sequence);
    }
    for (const [shellType, pattern] of agentCliTitlePatterns) {
      if (pattern.test(title)) {
        this._agentShellTypeFromSequence = shellType;
        this.setShellType(shellType);
        break;
      }
    }
  }
  _handleShellTypeChange(shellType) {
    if (this._agentShellTypeFromSequence) {
      if (shellType === GeneralShellType.Node || shellType === void 0) {
        return;
      }
      this._agentShellTypeFromSequence = void 0;
    }
    this.setShellType(shellType);
  }
  async _trust() {
    if (this._configurationService.getValue(TerminalSettingId.AllowInUntrustedWorkspace)) {
      this._logService.info(`Workspace trust check bypassed due to ${TerminalSettingId.AllowInUntrustedWorkspace}`);
      return true;
    }
    const trustRequest = await this._workspaceTrustRequestService.requestWorkspaceTrust({
      message: nls.localize("terminal.requestTrust", "Creating a terminal process requires executing code")
    });
    return trustRequest === true;
  }
  async _updateProcessCwd() {
    if (this.isDisposed || this.shellLaunchConfig.customPtyImplementation) {
      return;
    }
    try {
      const cwd = await this._refreshProperty(ProcessPropertyType.Cwd);
      if (!isString(cwd)) {
        throw new Error(`cwd is not a string ${cwd}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Cannot refresh property when process is not set") {
        return;
      }
      throw e;
    }
  }
  updateConfig() {
    this._refreshEnvironmentVariableInfoWidgetState(this._processManager.environmentVariableInfo);
  }
  async _updateUnicodeVersion() {
    this._processManager.setUnicodeVersion(this._terminalConfigurationService.config.unicodeVersion);
  }
  updateAccessibilitySupport() {
    this.xterm.raw.options.screenReaderMode = this._accessibilityService.isScreenReaderOptimized();
  }
  layout(dimension) {
    this._lastLayoutDimensions = dimension;
    if (this.disableLayout) {
      return;
    }
    if (dimension.width <= 0 || dimension.height <= 0) {
      return;
    }
    const terminalWidth = this._evaluateColsAndRows(dimension.width, dimension.height);
    if (!terminalWidth) {
      return;
    }
    this._resize();
    if (!this._containerReadyBarrier.isOpen()) {
      this._containerReadyBarrier.open();
    }
    for (const contribution of this._contributions.values()) {
      if (!this.xterm) {
        this._xtermReadyPromise.then((xterm) => {
          if (xterm) {
            contribution.layout?.(xterm, dimension);
          }
        });
      } else {
        contribution.layout?.(this.xterm, dimension);
      }
    }
  }
  async _resize(immediate) {
    if (!this.xterm || !this._resizeDebouncer || this.isDisposed || this._isDisposing) {
      return;
    }
    let cols = this.cols;
    let rows = this.rows;
    if (this._isVisible && this._layoutSettingsChanged) {
      const font = this.xterm.getFont();
      const config = this._terminalConfigurationService.config;
      this.xterm.raw.options.letterSpacing = font.letterSpacing;
      this.xterm.raw.options.lineHeight = font.lineHeight;
      this.xterm.raw.options.fontSize = font.fontSize;
      this.xterm.raw.options.fontFamily = font.fontFamily;
      this.xterm.raw.options.fontWeight = config.fontWeight;
      this.xterm.raw.options.fontWeightBold = config.fontWeightBold;
      this._initDimensions();
      cols = this.cols;
      rows = this.rows;
      this._layoutSettingsChanged = false;
    }
    if (isNaN(cols) || isNaN(rows)) {
      return;
    }
    if (cols !== this.xterm.raw.cols || rows !== this.xterm.raw.rows) {
      if (this._fixedRows || this._fixedCols) {
        await this._updateProperty(ProcessPropertyType.FixedDimensions, { cols: this._fixedCols, rows: this._fixedRows });
      }
      this._onDimensionsChanged.fire();
    }
    TerminalInstance._lastKnownGridDimensions = { cols, rows };
    this._resizeDebouncer?.resize(cols, rows, immediate ?? false);
  }
  async _updatePtyDimensions(rawXterm) {
    if (this.isDisposed) {
      return;
    }
    const pixelWidth = rawXterm.dimensions?.css.canvas.width;
    const pixelHeight = rawXterm.dimensions?.css.canvas.height;
    const roundedPixelWidth = pixelWidth ? Math.round(pixelWidth) : void 0;
    const roundedPixelHeight = pixelHeight ? Math.round(pixelHeight) : void 0;
    await this._processManager.setDimensions(rawXterm.cols, rawXterm.rows, void 0, roundedPixelWidth, roundedPixelHeight);
  }
  setShellType(shellType) {
    if (this._shellType === shellType) {
      return;
    }
    this._shellType = shellType;
    if (shellType === void 0) {
      this._terminalShellTypeContextKey.reset();
    } else {
      this._terminalShellTypeContextKey.set(shellType?.toString());
    }
    this._onDidChangeShellType.fire(shellType);
    this._labelComputer?.refreshLabel(this);
  }
  _setAriaLabel(xterm, terminalId, title) {
    const labelParts = [];
    if (xterm && xterm.textarea) {
      if (title && title.length > 0) {
        labelParts.push(nls.localize("terminalTextBoxAriaLabelNumberAndTitle", "Terminal {0}, {1}", terminalId, title));
      } else {
        labelParts.push(nls.localize("terminalTextBoxAriaLabel", "Terminal {0}", terminalId));
      }
      const screenReaderOptimized = this._accessibilityService.isScreenReaderOptimized();
      if (!screenReaderOptimized) {
        labelParts.push(nls.localize("terminalScreenReaderMode", "Run the command: Toggle Screen Reader Accessibility Mode for an optimized screen reader experience"));
      }
      const accessibilityHelpKeybinding = this._keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      if (this._configurationService.getValue(AccessibilityVerbositySettingId.Terminal) && accessibilityHelpKeybinding) {
        labelParts.push(nls.localize("terminalHelpAriaLabel", "Use {0} for terminal accessibility help", accessibilityHelpKeybinding));
      }
      xterm.textarea.setAttribute("aria-label", labelParts.join("\n"));
    }
  }
  _updateTitleProperties(title, eventSource) {
    if (title === void 0) {
      return this._processName;
    }
    switch (eventSource) {
      case TitleEventSource.Process:
        if (this._processManager.os === OperatingSystem.Windows) {
          title = path.win32.parse(title).name;
        } else {
          const firstSpaceIndex = title.indexOf(" ");
          if (title.startsWith("/")) {
            title = path.basename(title);
          } else if (firstSpaceIndex > -1) {
            title = title.substring(0, firstSpaceIndex);
          }
        }
        this._processName = title;
        break;
      case TitleEventSource.Api:
        this._staticTitle = title;
        this._messageTitleDisposable.value = void 0;
        break;
      case TitleEventSource.Sequence:
        this._sequence = title;
        if (this._processManager.os === OperatingSystem.Windows && title.match(/^[a-zA-Z]:\\.+\.[a-zA-Z]{1,3}/)) {
          this._sequence = path.win32.parse(title).name;
        }
        break;
    }
    this._titleSource = eventSource;
    return title;
  }
  setOverrideDimensions(dimensions, immediate = false) {
    if (this._dimensionsOverride && this._dimensionsOverride.forceExactSize && !dimensions && this._rows === 0 && this._cols === 0) {
      this._cols = this._dimensionsOverride.cols;
      this._rows = this._dimensionsOverride.rows;
    }
    this._dimensionsOverride = dimensions;
    if (immediate) {
      this._resize(true);
    } else {
      this._resize();
    }
  }
  async setFixedDimensions() {
    const cols = await this._quickInputService.input({
      title: nls.localize("setTerminalDimensionsColumn", "Set Fixed Dimensions: Column"),
      placeHolder: "Enter a number of columns or leave empty for automatic width",
      validateInput: async (text) => text.length > 0 && !text.match(/^\d+$/) ? { content: "Enter a number or leave empty size automatically", severity: Severity.Error } : void 0
    });
    if (cols === void 0) {
      return;
    }
    this._fixedCols = this._parseFixedDimension(cols);
    this._labelComputer?.refreshLabel(this);
    this._terminalHasFixedWidth.set(!!this._fixedCols);
    const rows = await this._quickInputService.input({
      title: nls.localize("setTerminalDimensionsRow", "Set Fixed Dimensions: Row"),
      placeHolder: "Enter a number of rows or leave empty for automatic height",
      validateInput: async (text) => text.length > 0 && !text.match(/^\d+$/) ? { content: "Enter a number or leave empty size automatically", severity: Severity.Error } : void 0
    });
    if (rows === void 0) {
      return;
    }
    this._fixedRows = this._parseFixedDimension(rows);
    this._labelComputer?.refreshLabel(this);
    await this._refreshScrollbar();
    this._resize();
    this.focus();
  }
  _parseFixedDimension(value) {
    if (value === "") {
      return void 0;
    }
    const parsed = parseInt(value);
    if (parsed <= 0) {
      throw new Error(`Could not parse dimension "${value}"`);
    }
    return parsed;
  }
  async toggleSizeToContentWidth() {
    if (!this.xterm?.raw.buffer.active) {
      return;
    }
    if (this._hasScrollBar) {
      this._terminalHasFixedWidth.set(false);
      this._fixedCols = void 0;
      this._fixedRows = void 0;
      this._hasScrollBar = false;
      this._initDimensions();
      await this._resize();
    } else {
      const font = this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement));
      const maxColsForTexture = Math.floor(4096 /* MaxCanvasWidth */ / (font.charWidth ?? 20));
      const proposedCols = Math.max(this.maxCols, Math.min(this.xterm.getLongestViewportWrappedLineLength(), maxColsForTexture));
      if (proposedCols > this.xterm.raw.cols) {
        this._fixedCols = proposedCols;
      }
    }
    await this._refreshScrollbar();
    this._labelComputer?.refreshLabel(this);
    this.focus();
  }
  _refreshScrollbar() {
    if (this._fixedCols || this._fixedRows) {
      return this._addScrollbar();
    }
    return this._removeScrollbar();
  }
  async _addScrollbar() {
    const charWidth = (this.xterm ? this.xterm.getFont() : this._terminalConfigurationService.getFont(dom.getWindow(this.domElement))).charWidth;
    if (!this.xterm?.raw.element || !this._container || !charWidth || !this._fixedCols) {
      return;
    }
    this._wrapperElement.classList.add("fixed-dims");
    this._hasScrollBar = true;
    this._initDimensions();
    await this._resize();
    this._terminalHasFixedWidth.set(true);
    if (!this._horizontalScrollbar) {
      this._horizontalScrollbar = this._register(new DomScrollableElement(this._wrapperElement, {
        vertical: ScrollbarVisibility.Hidden,
        horizontal: ScrollbarVisibility.Auto,
        useShadows: false,
        scrollYToX: false,
        consumeMouseWheelIfScrollbarIsNeeded: false
      }));
      this._container.appendChild(this._horizontalScrollbar.getDomNode());
    }
    this._horizontalScrollbar.setScrollDimensions({
      width: this.xterm.raw.element.clientWidth,
      scrollWidth: this._fixedCols * charWidth + 40
      // Padding + scroll bar
    });
    this._horizontalScrollbar.getDomNode().style.paddingBottom = "16px";
    if (isWindows) {
      for (let i = this.xterm.raw.buffer.active.viewportY; i < this.xterm.raw.buffer.active.length; i++) {
        const line = this.xterm.raw.buffer.active.getLine(i);
        line._line.isWrapped = false;
      }
    }
  }
  async _removeScrollbar() {
    if (!this._container || !this._horizontalScrollbar) {
      return;
    }
    this._horizontalScrollbar.getDomNode().remove();
    this._horizontalScrollbar.dispose();
    this._horizontalScrollbar = void 0;
    this._wrapperElement.remove();
    this._wrapperElement.classList.remove("fixed-dims");
    this._container.appendChild(this._wrapperElement);
  }
  _setResolvedShellLaunchConfig(shellLaunchConfig) {
    this._shellLaunchConfig.args = shellLaunchConfig.args;
    this._shellLaunchConfig.cwd = shellLaunchConfig.cwd;
    this._shellLaunchConfig.executable = shellLaunchConfig.executable;
    this._shellLaunchConfig.env = shellLaunchConfig.env;
  }
  _onEnvironmentVariableInfoChanged(info) {
    if (info.requiresAction) {
      this.xterm?.raw.textarea?.setAttribute("aria-label", nls.localize("terminalStaleTextBoxAriaLabel", "Terminal {0} environment is stale, run the 'Show Environment Information' command for more information", this._instanceId));
    }
    this._refreshEnvironmentVariableInfoWidgetState(info);
  }
  async _refreshEnvironmentVariableInfoWidgetState(info) {
    if (!info) {
      this.statusList.remove(TerminalStatus.RelaunchNeeded);
      this.statusList.remove(TerminalStatus.EnvironmentVariableInfoChangesActive);
      return;
    }
    if (
      // The change requires a relaunch
      info.requiresAction && // The feature is enabled
      this._terminalConfigurationService.config.environmentChangesRelaunch && // Has not been interacted with
      !this._processManager.hasWrittenData && // Not a feature terminal or is a reconnecting task terminal (TODO: Need to explain the latter case)
      (!this._shellLaunchConfig.isFeatureTerminal || this.reconnectionProperties && this._configurationService.getValue("task.reconnection") === true) && // Not a custom pty
      !this._shellLaunchConfig.customPtyImplementation && // Not an extension owned terminal
      !this._shellLaunchConfig.isExtensionOwnedTerminal && // Not a reconnected or revived terminal
      !this._shellLaunchConfig.attachPersistentProcess && // Not a Windows remote using ConPTY which cannot relaunch (#187084). ConPTY is used on
      // Windows builds 18309+.
      !(this._processManager.remoteAuthority && await this._processManager.getBackendOS() === OperatingSystem.Windows && this._processManager.processTraits?.windowsPty?.buildNumber && this._processManager.processTraits.windowsPty.buildNumber >= 18309)
    ) {
      this.relaunch();
      return;
    }
    const workspaceFolder = getWorkspaceForTerminal(this.shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
    this.statusList.add(info.getStatus({ workspaceFolder }));
  }
  async getInitialCwd() {
    if (!this._initialCwd) {
      this._initialCwd = this._processManager.initialCwd;
    }
    return this._initialCwd;
  }
  async getSpeculativeCwd() {
    if (this.capabilities.has(TerminalCapability.CwdDetection)) {
      return this.capabilities.get(TerminalCapability.CwdDetection).getCwd();
    } else if (this.capabilities.has(TerminalCapability.NaiveCwdDetection)) {
      return this.capabilities.get(TerminalCapability.NaiveCwdDetection).getCwd();
    }
    return this._processManager.initialCwd;
  }
  async getCwdResource() {
    const cwd = this.capabilities.get(TerminalCapability.CwdDetection)?.getCwd();
    if (!cwd) {
      return void 0;
    }
    let resource;
    if (this.remoteAuthority) {
      resource = await this._pathService.fileURI(cwd);
    } else {
      resource = URI.file(cwd);
    }
    if (!await this._fileService.canHandleResource(resource)) {
      return void 0;
    }
    if (await this._fileService.exists(resource)) {
      return resource;
    }
    return void 0;
  }
  async _refreshProperty(type) {
    await this.processReady;
    return this._processManager.refreshProperty(type);
  }
  async _updateProperty(type, value) {
    return this._processManager.updateProperty(type, value);
  }
  async rename(title, source) {
    if (title !== void 0 && !title) {
      title = void 0;
    }
    this._setTitle(title, source ?? TitleEventSource.Api);
  }
  _setTitle(title, eventSource) {
    if ((this._shellLaunchConfig?.type === "Task" || this._titleSource === TitleEventSource.Api) && eventSource === TitleEventSource.Process) {
      return;
    }
    const reset = !title;
    title = this._updateTitleProperties(title, eventSource);
    const titleChanged = title !== this._title;
    this._title = title;
    this._labelComputer?.refreshLabel(this, reset);
    this._setAriaLabel(this.xterm?.raw, this._instanceId, this._title);
    if (titleChanged) {
      this._onTitleChanged.fire(this);
    }
  }
  async changeIcon(icon) {
    if (icon) {
      this._icon = icon;
      this._onIconChanged.fire({ instance: this, userInitiated: true });
      return icon;
    }
    const iconPicker = this._scopedInstantiationService.createInstance(TerminalIconPicker);
    const pickedIcon = await iconPicker.pickIcons();
    iconPicker.dispose();
    if (!pickedIcon) {
      return void 0;
    }
    this._icon = pickedIcon;
    this._onIconChanged.fire({ instance: this, userInitiated: true });
    return pickedIcon;
  }
  async changeColor(color, skipQuickPick) {
    if (color) {
      this.shellLaunchConfig.color = color;
      this._onIconChanged.fire({ instance: this, userInitiated: true });
      return color;
    } else if (skipQuickPick) {
      this.shellLaunchConfig.color = "";
      this._onIconChanged.fire({ instance: this, userInitiated: true });
      return;
    }
    const icon = this._getIcon();
    if (!icon) {
      return;
    }
    const colorTheme = this._themeService.getColorTheme();
    const standardColors = getStandardColors(colorTheme);
    const colorStyleDisposable = createColorStyleElement(colorTheme);
    const items = [];
    for (const colorKey of standardColors) {
      const colorClass = getColorClass(colorKey);
      items.push({
        label: `$(${Codicon.circleFilled.id}) ${colorKey.replace("terminal.ansi", "")}`,
        id: colorKey,
        description: colorKey,
        iconClasses: [colorClass]
      });
    }
    items.push({ type: "separator" });
    const showAllColorsItem = { label: "Reset to default" };
    items.push(showAllColorsItem);
    const disposables = [];
    const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
    disposables.push(quickPick);
    quickPick.items = items;
    quickPick.matchOnDescription = true;
    quickPick.placeholder = nls.localize("changeColor", "Select a color for the terminal");
    quickPick.show();
    const result = await new Promise((r) => {
      disposables.push(quickPick.onDidHide(() => r(void 0)));
      disposables.push(quickPick.onDidAccept(() => r(quickPick.selectedItems[0])));
    });
    dispose(disposables);
    if (result) {
      this.shellLaunchConfig.color = result.id;
      this._onIconChanged.fire({ instance: this, userInitiated: true });
    }
    quickPick.hide();
    colorStyleDisposable.dispose();
    return result?.id;
  }
  forceScrollbarVisibility() {
    this._wrapperElement.classList.add("force-scrollbar");
  }
  resetScrollbarVisibility() {
    this._wrapperElement.classList.remove("force-scrollbar");
  }
  setParentContextKeyService(parentContextKeyService) {
    this._scopedContextKeyService.updateParent(parentContextKeyService);
  }
  async handleMouseEvent(event, contextMenu) {
    if (dom.isHTMLElement(event.target) && (event.target.classList.contains("scrollbar") || event.target.classList.contains("slider"))) {
      return { cancelContextMenu: true };
    }
    for (const contrib of this._contributions.values()) {
      const result = await contrib.handleMouseEvent?.(event);
      if (result?.handled) {
        return { cancelContextMenu: true };
      }
    }
    if (event.which === 2) {
      switch (this._terminalConfigurationService.config.middleClickBehavior) {
        case "default":
        default:
          this.focus();
          break;
      }
      return;
    }
    if (event.which === 3) {
      if (event.shiftKey) {
        openContextMenu(dom.getActiveWindow(), event, this, contextMenu, this._contextMenuService);
        return;
      }
      const rightClickBehavior = this._terminalConfigurationService.config.rightClickBehavior;
      if (rightClickBehavior === "nothing") {
        if (!event.shiftKey) {
          return { cancelContextMenu: true };
        }
        return;
      }
    }
  }
};
TerminalInstance._instanceIdCounter = 1;
__decorateClass([
  debounce(50)
], TerminalInstance.prototype, "_fireMaximumDimensionsChanged", 1);
__decorateClass([
  debounce(500)
], TerminalInstance.prototype, "_refreshShellIntegrationInfoStatus", 1);
__decorateClass([
  debounce(1e3)
], TerminalInstance.prototype, "relaunch", 1);
__decorateClass([
  debounce(2e3)
], TerminalInstance.prototype, "_updateProcessCwd", 1);
TerminalInstance = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ITerminalConfigurationService),
  __decorateParam(6, ITerminalProfileResolverService),
  __decorateParam(7, IPathService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IPreferencesService),
  __decorateParam(12, IViewsService),
  __decorateParam(13, IThemeService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, ITerminalLogService),
  __decorateParam(16, IStorageService),
  __decorateParam(17, IAccessibilityService),
  __decorateParam(18, IProductService),
  __decorateParam(19, IQuickInputService),
  __decorateParam(20, IWorkbenchEnvironmentService),
  __decorateParam(21, IWorkspaceContextService),
  __decorateParam(22, IEditorService),
  __decorateParam(23, IWorkspaceTrustRequestService),
  __decorateParam(24, IHistoryService),
  __decorateParam(25, ITelemetryService),
  __decorateParam(26, IOpenerService),
  __decorateParam(27, ICommandService),
  __decorateParam(28, IAccessibilitySignalService),
  __decorateParam(29, IViewDescriptorService)
], TerminalInstance);
let TerminalInstanceDragAndDropController = class extends Disposable {
  constructor(_container, _layoutService, _viewDescriptorService) {
    super();
    this._container = _container;
    this._layoutService = _layoutService;
    this._viewDescriptorService = _viewDescriptorService;
    this._onDropFile = this._register(new Emitter());
    this._onDropTerminal = this._register(new Emitter());
    this._register(toDisposable(() => this._clearDropOverlay()));
  }
  get onDropFile() {
    return this._onDropFile.event;
  }
  get onDropTerminal() {
    return this._onDropTerminal.event;
  }
  _clearDropOverlay() {
    this._dropOverlay?.remove();
    this._dropOverlay = void 0;
  }
  onDragEnter(e) {
    if (!containsDragType(e, DataTransfers.FILES, DataTransfers.RESOURCES, TerminalDataTransfers.Terminals, CodeDataTransfers.FILES)) {
      return;
    }
    if (!this._dropOverlay) {
      this._dropOverlay = document.createElement("div");
      this._dropOverlay.classList.add("terminal-drop-overlay");
    }
    if (containsDragType(e, TerminalDataTransfers.Terminals)) {
      const side = this._getDropSide(e);
      this._dropOverlay.classList.toggle("drop-before", side === "before");
      this._dropOverlay.classList.toggle("drop-after", side === "after");
    }
    if (!this._dropOverlay.parentElement) {
      this._container.appendChild(this._dropOverlay);
    }
  }
  onDragLeave(e) {
    this._clearDropOverlay();
  }
  onDragEnd(e) {
    this._clearDropOverlay();
  }
  onDragOver(e) {
    if (!e.dataTransfer || !this._dropOverlay) {
      return;
    }
    if (containsDragType(e, TerminalDataTransfers.Terminals)) {
      const side = this._getDropSide(e);
      this._dropOverlay.classList.toggle("drop-before", side === "before");
      this._dropOverlay.classList.toggle("drop-after", side === "after");
    }
    this._dropOverlay.style.opacity = "1";
  }
  async onDrop(e) {
    this._clearDropOverlay();
    if (!e.dataTransfer) {
      return;
    }
    const terminalResources = getTerminalResourcesFromDragEvent(e);
    if (terminalResources) {
      for (const uri of terminalResources) {
        const side = this._getDropSide(e);
        this._onDropTerminal.fire({ uri, side });
      }
      return;
    }
    let path2;
    const rawResources = e.dataTransfer.getData(DataTransfers.RESOURCES);
    if (rawResources) {
      path2 = URI.parse(JSON.parse(rawResources)[0]);
    }
    const rawCodeFiles = e.dataTransfer.getData(CodeDataTransfers.FILES);
    if (!path2 && rawCodeFiles) {
      path2 = URI.file(JSON.parse(rawCodeFiles)[0]);
    }
    if (!path2 && e.dataTransfer.files.length > 0 && getPathForFile(e.dataTransfer.files[0])) {
      path2 = URI.file(getPathForFile(e.dataTransfer.files[0]));
    }
    if (!path2) {
      return;
    }
    this._onDropFile.fire(path2);
  }
  _getDropSide(e) {
    const target = this._container;
    if (!target) {
      return "after";
    }
    const rect = target.getBoundingClientRect();
    return this._getViewOrientation() === Orientation.HORIZONTAL ? e.clientX - rect.left < rect.width / 2 ? "before" : "after" : e.clientY - rect.top < rect.height / 2 ? "before" : "after";
  }
  _getViewOrientation() {
    const panelPosition = this._layoutService.getPanelPosition();
    const terminalLocation = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
    return terminalLocation === ViewContainerLocation.Panel && isHorizontal(panelPosition) ? Orientation.HORIZONTAL : Orientation.VERTICAL;
  }
};
TerminalInstanceDragAndDropController = __decorateClass([
  __decorateParam(1, IWorkbenchLayoutService),
  __decorateParam(2, IViewDescriptorService)
], TerminalInstanceDragAndDropController);
var TerminalLabelType = /* @__PURE__ */ ((TerminalLabelType2) => {
  TerminalLabelType2["Title"] = "title";
  TerminalLabelType2["Description"] = "description";
  return TerminalLabelType2;
})(TerminalLabelType || {});
let TerminalLabelComputer = class extends Disposable {
  constructor(_fileService, _terminalConfigurationService, _workspaceContextService) {
    super();
    this._fileService = _fileService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._workspaceContextService = _workspaceContextService;
    this._title = "";
    this._description = "";
    this._onDidChangeLabel = this._register(new Emitter());
    this.onDidChangeLabel = this._onDidChangeLabel.event;
  }
  get title() {
    return this._title;
  }
  get description() {
    return this._description;
  }
  refreshLabel(instance, reset) {
    const tabs = this._terminalConfigurationService.config.tabs;
    const useAgentCliTitle = tabs.allowAgentCliTitle && TerminalLabelComputer.agentCliShellTypes.has(instance.shellType);
    const titleTemplate = instance.shellLaunchConfig.titleTemplate ?? (useAgentCliTitle ? "${sequence}" : tabs.title);
    this._title = this.computeLabel(instance, titleTemplate, "title" /* Title */, reset);
    this._description = this.computeLabel(instance, tabs.description, "description" /* Description */);
    if (this._title !== instance.title || this._description !== instance.description || reset) {
      this._onDidChangeLabel.fire({ title: this._title, description: this._description });
    }
  }
  computeLabel(instance, labelTemplate, labelType, reset) {
    const type = instance.shellLaunchConfig.attachPersistentProcess?.type || instance.shellLaunchConfig.type;
    const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
    const promptInputModel = commandDetection?.promptInputModel;
    const nonTaskSpinner = type === "Task" ? "" : " $(loading~spin)";
    let cwd = instance.cwd || instance.initialCwd || "";
    const os = instance.os ?? OS;
    cwd = tildify(cwd, instance.userHome || "", os);
    if (os !== OperatingSystem.Windows && cwd && instance.userHome && cwd === instance.userHome) {
      cwd = "~";
    }
    const templateProperties = {
      cwd,
      cwdFolder: "",
      workspaceFolderName: instance.workspaceFolder?.name,
      workspaceFolder: instance.workspaceFolder ? path.basename(instance.workspaceFolder.uri.fsPath) : void 0,
      local: type === "Local" ? terminalStrings.typeLocal : void 0,
      process: instance.processName,
      sequence: instance.sequence,
      task: type === "Task" ? terminalStrings.typeTask : void 0,
      fixedDimensions: instance.fixedCols ? instance.fixedRows ? `\u2194${instance.fixedCols} \u2195${instance.fixedRows}` : `\u2194${instance.fixedCols}` : instance.fixedRows ? `\u2195${instance.fixedRows}` : "",
      separator: { label: this._terminalConfigurationService.config.tabs.separator },
      shellType: instance.shellType,
      // Shell command requires high confidence
      shellCommand: commandDetection?.executingCommand && commandDetection.executingCommandConfidence === "high" && promptInputModel ? promptInputModel.value + nonTaskSpinner : void 0,
      // Shell prompt input does not require high confidence as it's largely for VS Code developers
      shellPromptInput: commandDetection?.executingCommand && promptInputModel ? promptInputModel.getCombinedString(true) + nonTaskSpinner : promptInputModel?.getCombinedString(true),
      progress: this._getProgressStateString(instance.progressState)
    };
    templateProperties.workspaceFolderName = instance.workspaceFolder?.name ?? templateProperties.workspaceFolder;
    labelTemplate = labelTemplate.trim();
    if (!labelTemplate) {
      return labelType === "title" /* Title */ ? instance.processName || "" : "";
    }
    if (!reset && instance.staticTitle && labelType === "title" /* Title */) {
      return instance.staticTitle.replace(/[\n\r\t]/g, "") || templateProperties.process?.replace(/[\n\r\t]/g, "") || "";
    }
    const detection = instance.capabilities.has(TerminalCapability.CwdDetection) || instance.capabilities.has(TerminalCapability.NaiveCwdDetection);
    const folders = this._workspaceContextService.getWorkspace().folders;
    const multiRootWorkspace = folders.length > 1;
    if (templateProperties.cwd && detection && (!instance.shellLaunchConfig.isFeatureTerminal || labelType === "title" /* Title */)) {
      const cwdUri = URI.from({
        scheme: instance.workspaceFolder?.uri.scheme || Schemas.file,
        path: instance.cwd ? path.resolve(instance.cwd) : void 0
      });
      let showCwd = false;
      if (multiRootWorkspace) {
        showCwd = true;
      } else if (instance.workspaceFolder?.uri) {
        const caseSensitive = this._fileService.hasCapability(instance.workspaceFolder.uri, FileSystemProviderCapabilities.PathCaseSensitive);
        showCwd = cwdUri.fsPath.localeCompare(instance.workspaceFolder.uri.fsPath, void 0, { sensitivity: caseSensitive ? "case" : "base" }) !== 0;
      }
      if (showCwd) {
        templateProperties.cwdFolder = path.basename(templateProperties.cwd);
      }
    }
    const label = template(labelTemplate, templateProperties).replace(/[\n\r\t]/g, "").trim();
    return label === "" && labelType === "title" /* Title */ ? instance.processName || "" : label;
  }
  _getProgressStateString(progressState) {
    if (!progressState) {
      return "";
    }
    switch (progressState.state) {
      case 0:
        return "";
      case 1:
        return `${Math.round(progressState.value)}%`;
      case 2:
        return "$(error)";
      case 3:
        return "$(loading~spin)";
      case 4:
        return "$(alert)";
    }
  }
};
/**
 * Agent CLIs whose tab title should come from their own escape sequences rather
 * than the configured template or a static profile name.
 */
TerminalLabelComputer.agentCliShellTypes = /* @__PURE__ */ new Set([
  GeneralShellType.Claude,
  GeneralShellType.Codex,
  GeneralShellType.CommandCode,
  GeneralShellType.Copilot,
  GeneralShellType.Gemini
]);
TerminalLabelComputer = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITerminalConfigurationService),
  __decorateParam(2, IWorkspaceContextService)
], TerminalLabelComputer);
function parseExitResult(exitCodeOrError, shellLaunchConfig, processState, initialCwd) {
  if (exitCodeOrError === void 0 || exitCodeOrError === 0) {
    return { code: exitCodeOrError, message: void 0 };
  }
  const code = isNumber(exitCodeOrError) ? exitCodeOrError : exitCodeOrError.code;
  let message = void 0;
  switch (typeof exitCodeOrError) {
    case "number": {
      let commandLine = void 0;
      if (shellLaunchConfig.executable) {
        commandLine = shellLaunchConfig.executable;
        if (isString(shellLaunchConfig.args)) {
          commandLine += ` ${shellLaunchConfig.args}`;
        } else if (shellLaunchConfig.args && shellLaunchConfig.args.length) {
          commandLine += shellLaunchConfig.args.map((a) => ` '${a}'`).join();
        }
      }
      if (processState === ProcessState.KilledDuringLaunch) {
        if (commandLine) {
          message = nls.localize("launchFailed.exitCodeAndCommandLine", 'The terminal process "{0}" failed to launch (exit code: {1}).', commandLine, code);
        } else {
          message = nls.localize("launchFailed.exitCodeOnly", "The terminal process failed to launch (exit code: {0}).", code);
        }
      } else {
        if (commandLine) {
          message = nls.localize("terminated.exitCodeAndCommandLine", 'The terminal process "{0}" terminated with exit code: {1}.', commandLine, code);
        } else {
          message = nls.localize("terminated.exitCodeOnly", "The terminal process terminated with exit code: {0}.", code);
        }
      }
      break;
    }
    case "object": {
      if (exitCodeOrError.message.toString().includes("Could not find pty with id")) {
        break;
      }
      let innerMessage = exitCodeOrError.message;
      const conptyError = exitCodeOrError.message.match(/.*error code:\s*(\d+).*$/);
      if (conptyError) {
        const errorCode = conptyError.length > 1 ? parseInt(conptyError[1]) : void 0;
        switch (errorCode) {
          case 5:
            innerMessage = `Access was denied to the path containing your executable "${shellLaunchConfig.executable}". Manage and change your permissions to get this to work`;
            break;
          case 267:
            innerMessage = `Invalid starting directory "${initialCwd}", review your terminal.integrated.cwd setting`;
            break;
          case 1260:
            innerMessage = `Windows cannot open this program because it has been prevented by a software restriction policy. For more information, open Event Viewer or contact your system Administrator`;
            break;
        }
      }
      message = nls.localize("launchFailed.errorMessage", "The terminal process failed to launch: {0}.", innerMessage);
      break;
    }
  }
  return { code, message };
}
let TerminalInstanceColorProvider = class {
  constructor(_target, _viewDescriptorService) {
    this._target = _target;
    this._viewDescriptorService = _viewDescriptorService;
  }
  getBackgroundColor(theme) {
    const terminalBackground = theme.getColor(TERMINAL_BACKGROUND_COLOR);
    if (terminalBackground) {
      return terminalBackground;
    }
    if (this._target.object === TerminalLocation.Editor) {
      return theme.getColor(editorBackground);
    }
    const location = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID);
    if (location === ViewContainerLocation.Panel) {
      return theme.getColor(PANEL_BACKGROUND);
    }
    return theme.getColor(SIDE_BAR_BACKGROUND);
  }
};
TerminalInstanceColorProvider = __decorateClass([
  __decorateParam(1, IViewDescriptorService)
], TerminalInstanceColorProvider);
function guessShellTypeFromExecutable(os, executable) {
  const exeBasename = path.basename(executable);
  const generalShellTypeMap = /* @__PURE__ */ new Map([
    [GeneralShellType.Julia, /^julia$/],
    [GeneralShellType.Node, /^node$/],
    [GeneralShellType.NuShell, /^nu$/],
    [GeneralShellType.PowerShell, /^pwsh(-preview)?|powershell$/],
    [GeneralShellType.Python, /^py(?:thon)?$/],
    [GeneralShellType.Xonsh, /^xonsh/]
  ]);
  for (const [shellType, pattern] of generalShellTypeMap) {
    if (exeBasename.match(pattern)) {
      return shellType;
    }
  }
  if (os === OperatingSystem.Windows) {
    const windowsShellTypeMap = /* @__PURE__ */ new Map([
      [WindowsShellType.CommandPrompt, /^cmd$/],
      [WindowsShellType.GitBash, /^bash$/],
      [WindowsShellType.Wsl, /^wsl$/]
    ]);
    for (const [shellType, pattern] of windowsShellTypeMap) {
      if (exeBasename.match(pattern)) {
        return shellType;
      }
    }
  } else {
    const posixShellTypes = [
      PosixShellType.Bash,
      PosixShellType.Csh,
      PosixShellType.Fish,
      PosixShellType.Ksh,
      PosixShellType.Sh,
      PosixShellType.Zsh
    ];
    for (const type of posixShellTypes) {
      if (exeBasename === type) {
        return type;
      }
    }
  }
  return void 0;
}
export {
  TerminalInstance,
  TerminalInstanceColorProvider,
  TerminalLabelComputer,
  parseExitResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxJbnN0YW5jZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzRmlyZWZveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IEJyb3dzZXJGZWF0dXJlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jYW5JVXNlLmpzJztcbmltcG9ydCB7IERhdGFUcmFuc2ZlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG5kLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IE9yaWVudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQXV0b09wZW5CYXJyaWVyLCBQcm9taXNlcywgZGlzcG9zYWJsZVRpbWVvdXQsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZGVib3VuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgSVNlcGFyYXRvciwgbm9ybWFsaXplRHJpdmVMZXR0ZXIsIHRlbXBsYXRlLCB0aWxkaWZ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIEltbW9ydGFsUmVmZXJlbmNlLCBNdXRhYmxlRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlLCB0eXBlIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IE9TLCBPcGVyYXRpbmdTeXN0ZW0sIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVGFiRm9jdXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvdGFiRm9jdXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDb2RlRGF0YVRyYW5zZmVycywgY29udGFpbnNEcmFnVHlwZSwgZ2V0UGF0aEZvckZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kbmQvYnJvd3Nlci9kbmQuanMnO1xuaW1wb3J0IHsgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVzdWx0S2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIFF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJTWFya1Byb3BlcnRpZXMsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlTXVsdGlwbGV4ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiwgSU1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZVNoYXJlZC5qcyc7XG5pbXBvcnQgeyBHZW5lcmFsU2hlbGxUeXBlLCBJUHJvY2Vzc0RhdGFFdmVudCwgSVByb2Nlc3NQcm9wZXJ0eU1hcCwgSVJlY29ubmVjdGlvblByb3BlcnRpZXMsIElTaGVsbExhdW5jaENvbmZpZywgSVRlcm1pbmFsRGltZW5zaW9uc092ZXJyaWRlLCBJVGVybWluYWxMYXVuY2hFcnJvciwgSVRlcm1pbmFsTG9nU2VydmljZSwgUG9zaXhTaGVsbFR5cGUsIFByb2Nlc3NQcm9wZXJ0eVR5cGUsIFNoZWxsSW50ZWdyYXRpb25TdGF0dXMsIFRlcm1pbmFsRXhpdFJlYXNvbiwgVGVybWluYWxJY29uLCBUZXJtaW5hbExvY2F0aW9uLCBUZXJtaW5hbFNldHRpbmdJZCwgVGVybWluYWxTaGVsbFR5cGUsIFRpdGxlRXZlbnRTb3VyY2UsIFdpbmRvd3NTaGVsbFR5cGUsIHR5cGUgU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBlZGl0b3JCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZ2V0SWNvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IFBBTkVMX0JBQ0tHUk9VTkQsIFNJREVfQkFSX0JBQ0tHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RBZGRJbnN0YW5jZVRvR3JvdXBFdmVudCwgSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIElUZXJtaW5hbENvbnRyaWJ1dGlvbiwgSVRlcm1pbmFsSW5zdGFuY2UsIElYdGVybUNvbG9yUHJvdmlkZXIsIFRlcm1pbmFsRGF0YVRyYW5zZmVycyB9IGZyb20gJy4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxMYXVuY2hIZWxwQWN0aW9uIH0gZnJvbSAnLi90ZXJtaW5hbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxFZGl0b3JJbnB1dCB9IGZyb20gJy4vdGVybWluYWxFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4vdGVybWluYWxFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGdldENvbG9yQ2xhc3MsIGNyZWF0ZUNvbG9yU3R5bGVFbGVtZW50LCBnZXRTdGFuZGFyZENvbG9ycyB9IGZyb20gJy4vdGVybWluYWxJY29uLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsUHJvY2Vzc01hbmFnZXIgfSBmcm9tICcuL3Rlcm1pbmFsUHJvY2Vzc01hbmFnZXIuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsU3RhdHVzTGlzdCwgVGVybWluYWxTdGF0dXMsIFRlcm1pbmFsU3RhdHVzTGlzdCB9IGZyb20gJy4vdGVybWluYWxTdGF0dXNMaXN0LmpzJztcbmltcG9ydCB7IGdldFRlcm1pbmFsUmVzb3VyY2VzRnJvbURyYWdFdmVudCwgZ2V0VGVybWluYWxVcmkgfSBmcm9tICcuL3Rlcm1pbmFsVXJpLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsV2lkZ2V0TWFuYWdlciB9IGZyb20gJy4vd2lkZ2V0cy93aWRnZXRNYW5hZ2VyLmpzJztcbmltcG9ydCB7IExpbmVEYXRhRXZlbnRBZGRvbiB9IGZyb20gJy4veHRlcm0vbGluZURhdGFFdmVudEFkZG9uLmpzJztcbmltcG9ydCB7IFh0ZXJtVGVybWluYWwsIGdldFh0ZXJtU2NhbGVkRGltZW5zaW9ucyB9IGZyb20gJy4veHRlcm0veHRlcm1UZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8gfSBmcm9tICcuLi9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9jZXNzTWFuYWdlciwgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSwgUHJvY2Vzc1N0YXRlLCBURVJNSU5BTF9WSUVXX0lELCBUZXJtaW5hbENvbW1hbmRJZCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBURVJNSU5BTF9CQUNLR1JPVU5EX0NPTE9SIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyBnZXRVcmlMYWJlbEZvclNoZWxsLCBnZXRTaGVsbEludGVncmF0aW9uVGltZW91dCwgZ2V0V29ya3NwYWNlRm9yVGVybWluYWwsIHByZXBhcmVQYXRoRm9yU2hlbGwgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IGlzSG9yaXpvbnRhbCwgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFya2VyLCBUZXJtaW5hbCBhcyBYVGVybVRlcm1pbmFsLCBJQnVmZmVyTGluZSB9IGZyb20gJ0B4dGVybS94dGVybSc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IHRlcm1pbmFsU3RyaW5ncyB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGVybWluYWxJY29uUGlja2VyIH0gZnJvbSAnLi90ZXJtaW5hbEljb25QaWNrZXIuanMnO1xuaW1wb3J0IHsgVGVybWluYWxSZXNpemVEZWJvdW5jZXIgfSBmcm9tICcuL3Rlcm1pbmFsUmVzaXplRGVib3VuY2VyLmpzJztcbmltcG9ydCB7IG9wZW5Db250ZXh0TWVudSB9IGZyb20gJy4vdGVybWluYWxDb250ZXh0TWVudS5qcyc7XG5pbXBvcnQgdHlwZSB7IElNZW51IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQgfSBmcm9tICcuLi90ZXJtaW5hbENvbnRyaWJFeHBvcnRzLmpzJztcbmltcG9ydCB0eXBlIHsgSVByb2dyZXNzU3RhdGUgfSBmcm9tICdAeHRlcm0vYWRkb24tcHJvZ3Jlc3MnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBQcm9tcHRJbnB1dFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jb21tYW5kRGV0ZWN0aW9uL3Byb21wdElucHV0TW9kZWwuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBpc051bWJlciwgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0LyoqXG5cdCAqIFRoZSBtYXhpbXVtIGFtb3VudCBvZiBtaWxsaXNlY29uZHMgdG8gd2FpdCBmb3IgYSBjb250YWluZXIgYmVmb3JlIHN0YXJ0aW5nIHRvIGNyZWF0ZSB0aGVcblx0ICogdGVybWluYWwgcHJvY2Vzcy4gVGhpcyBwZXJpb2QgaGVscHMgZW5zdXJlIHRoZSB0ZXJtaW5hbCBoYXMgZ29vZCBpbml0aWFsIGRpbWVuc2lvbnMgdG8gd29ya1xuXHQgKiB3aXRoIGlmIGl0J3MgZ29pbmcgdG8gYmUgYSBmb3JlZ3JvdW5kIHRlcm1pbmFsLlxuXHQgKi9cblx0V2FpdEZvckNvbnRhaW5lclRocmVzaG9sZCA9IDEwMCxcblxuXHREZWZhdWx0Q29scyA9IDgwLFxuXHREZWZhdWx0Um93cyA9IDMwLFxuXHRNYXhDYW52YXNXaWR0aCA9IDQwOTZcbn1cblxubGV0IHh0ZXJtQ29uc3RydWN0b3I6IFByb21pc2U8dHlwZW9mIFhUZXJtVGVybWluYWw+IHwgdW5kZWZpbmVkO1xuXG5pbnRlcmZhY2UgSUNhbnZhc0RpbWVuc2lvbnMge1xuXHR3aWR0aDogbnVtYmVyO1xuXHRoZWlnaHQ6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIElHcmlkRGltZW5zaW9ucyB7XG5cdGNvbHM6IG51bWJlcjtcblx0cm93czogbnVtYmVyO1xufVxuXG5jb25zdCBzaGVsbEludGVncmF0aW9uU3VwcG9ydGVkU2hlbGxUeXBlczogKFBvc2l4U2hlbGxUeXBlIHwgR2VuZXJhbFNoZWxsVHlwZSB8IFdpbmRvd3NTaGVsbFR5cGUpW10gPSBbXG5cdFBvc2l4U2hlbGxUeXBlLkJhc2gsXG5cdFBvc2l4U2hlbGxUeXBlLlpzaCxcblx0R2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsLFxuXHRHZW5lcmFsU2hlbGxUeXBlLlB5dGhvbixcbl07XG5cbi8qKlxuICogUGF0dGVybnMgZm9yIGRldGVjdGluZyBhZ2VudCBDTElzIGZyb20gdGhlIE9TQyB0aXRsZSB0aGV5IGVtaXQuXG4gKi9cbmNvbnN0IGFnZW50Q2xpVGl0bGVQYXR0ZXJuczogUmVhZG9ubHlNYXA8R2VuZXJhbFNoZWxsVHlwZSwgUmVnRXhwPiA9IG5ldyBNYXAoW1xuXHRbR2VuZXJhbFNoZWxsVHlwZS5DbGF1ZGUsIC9jbGF1ZGVcXHMqY29kZS9pXSxcblx0Ly8gW0dlbmVyYWxTaGVsbFR5cGUuQ29kZXgsIC9cXGJjb2RleFxcYi9pXSwgLy8gY29kZXggZG9lcyBub3QgcmVwb3J0IG9zYyB0aXRsZS5cblx0W0dlbmVyYWxTaGVsbFR5cGUuQ29tbWFuZENvZGUsIC9jb21tYW5kXFxzKmNvZGUvaV0sXG5cdFtHZW5lcmFsU2hlbGxUeXBlLkNvcGlsb3QsIC9cXGJjb3BpbG90XFxiL2ldLFxuXHRbR2VuZXJhbFNoZWxsVHlwZS5HZW1pbmksIC9cXGJnZW1pbmlcXGIvaV0sXG5dKTtcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsSW5zdGFuY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRlcm1pbmFsSW5zdGFuY2Uge1xuXHRwcml2YXRlIHN0YXRpYyBfbGFzdEtub3duQ2FudmFzRGltZW5zaW9uczogSUNhbnZhc0RpbWVuc2lvbnMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3RhdGljIF9sYXN0S25vd25HcmlkRGltZW5zaW9uczogSUdyaWREaW1lbnNpb25zIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0YXRpYyBfaW5zdGFuY2VJZENvdW50ZXIgPSAxO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvY2Vzc01hbmFnZXI6IElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRpb25zOiBNYXA8c3RyaW5nLCBJVGVybWluYWxDb250cmlidXRpb24+ID0gbmV3IE1hcCgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZTogVVJJO1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB3aGVuIHh0ZXJtLmpzIGlzIHJlYWR5LCB0aGlzIHdpbGwgYmUgdW5kZWZpbmVkIGlmIHRoZSB0ZXJtaW5hbCBpbnN0YW5jZSBpcyBkaXNwb3NlZFxuXHQgKiBiZWZvcmUgeHRlcm0uanMgY291bGQgYmUgY3JlYXRlZC5cblx0ICovXG5cdHByaXZhdGUgX3h0ZXJtUmVhZHlQcm9taXNlOiBQcm9taXNlPFh0ZXJtVGVybWluYWwgfCB1bmRlZmluZWQ+O1xuXHRnZXQgeHRlcm1SZWFkeVByb21pc2UoKTogUHJvbWlzZTxYdGVybVRlcm1pbmFsIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl94dGVybVJlYWR5UHJvbWlzZTsgfVxuXG5cdHByaXZhdGUgX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaW5zdGFuY2VJZDogbnVtYmVyO1xuXHRwcml2YXRlIF9sYXRlc3RYdGVybVdyaXRlRGF0YTogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfbGF0ZXN0WHRlcm1QYXJzZURhdGE6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2lzRXhpdGluZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaXNEaXNwb3Npbmc6IGJvb2xlYW47XG5cdHByaXZhdGUgX2hhZEZvY3VzT25FeGl0OiBib29sZWFuO1xuXHRwcml2YXRlIF9leGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9leGl0UmVhc29uOiBUZXJtaW5hbEV4aXRSZWFzb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NoZWxsVHlwZTogVGVybWluYWxTaGVsbFR5cGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FnZW50U2hlbGxUeXBlRnJvbVNlcXVlbmNlOiBHZW5lcmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90aXRsZTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX3RpdGxlU291cmNlOiBUaXRsZUV2ZW50U291cmNlID0gVGl0bGVFdmVudFNvdXJjZS5Qcm9jZXNzO1xuXHRwcml2YXRlIF9jb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93cmFwcGVyRWxlbWVudDogKEhUTUxFbGVtZW50ICYgeyB4dGVybT86IFhUZXJtVGVybWluYWwgfSk7XG5cdGdldCBkb21FbGVtZW50KCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMuX3dyYXBwZXJFbGVtZW50OyB9XG5cdHByaXZhdGUgX2hvcml6b250YWxTY3JvbGxiYXI6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90ZXJtaW5hbEZvY3VzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX3Rlcm1pbmFsSGFzRml4ZWRXaWR0aDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX3Rlcm1pbmFsSGFzVGV4dENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF90ZXJtaW5hbEFsdEJ1ZmZlckFjdGl2ZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF90ZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25FbmFibGVkQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2NvbHM6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX3Jvd3M6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2ZpeGVkQ29sczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9maXhlZFJvd3M6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2luaXRpYWxDd2Q6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaW5qZWN0ZWRBcmdzOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGF5b3V0U2V0dGluZ3NDaGFuZ2VkOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBfZGltZW5zaW9uc092ZXJyaWRlOiBJVGVybWluYWxEaW1lbnNpb25zT3ZlcnJpZGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2FyZUxpbmtzUmVhZHk6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5pdGlhbERhdGFFdmVudHNMaXN0ZW5lcjogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9pbml0aWFsRGF0YUV2ZW50czogc3RyaW5nW10gfCB1bmRlZmluZWQgPSBbXTtcblx0cHJpdmF0ZSBfY29udGFpbmVyUmVhZHlCYXJyaWVyOiBBdXRvT3BlbkJhcnJpZXI7XG5cdHByaXZhdGUgX2F0dGFjaEJhcnJpZXI6IEF1dG9PcGVuQmFycmllcjtcblx0cHJpdmF0ZSBfaWNvbjogVGVybWluYWxJY29uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlVGl0bGVEaXNwb3NhYmxlOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX3dpZGdldE1hbmFnZXI6IFRlcm1pbmFsV2lkZ2V0TWFuYWdlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZG5kT2JzZXJ2ZXI6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBfbGFzdExheW91dERpbWVuc2lvbnM6IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRwcml2YXRlIF9wcm9jZXNzTmFtZTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX3NlcXVlbmNlPzogc3RyaW5nO1xuXHRwcml2YXRlIF9zdGF0aWNUaXRsZT86IHN0cmluZztcblx0cHJpdmF0ZSBfd29ya3NwYWNlRm9sZGVyPzogSVdvcmtzcGFjZUZvbGRlcjtcblx0cHJpdmF0ZSBfbGFiZWxDb21wdXRlcj86IFRlcm1pbmFsTGFiZWxDb21wdXRlcjtcblx0cHJpdmF0ZSBfdXNlckhvbWU/OiBzdHJpbmc7XG5cdHByaXZhdGUgX2hhc1Njcm9sbEJhcj86IGJvb2xlYW47XG5cdHByaXZhdGUgX3VzZWRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uOiBib29sZWFuID0gZmFsc2U7XG5cdGdldCB1c2VkU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3VzZWRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uOyB9XG5cdHByaXZhdGUgX3NoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25JbmZvOiBTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZVJlYXNvbiB8IHVuZGVmaW5lZDtcblx0Z2V0IHNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uKCk6IFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25GYWlsdXJlUmVhc29uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NoZWxsSW50ZWdyYXRpb25JbmplY3Rpb25JbmZvOyB9XG5cdHByaXZhdGUgX2xpbmVEYXRhRXZlbnRBZGRvbjogTGluZURhdGFFdmVudEFkZG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIF9yZXNpemVEZWJvdW5jZXI/OiBUZXJtaW5hbFJlc2l6ZURlYm91bmNlcjtcblxuXHRyZWFkb25seSBjYXBhYmlsaXRpZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmVNdWx0aXBsZXhlcigpKTtcblx0cmVhZG9ubHkgc3RhdHVzTGlzdDogSVRlcm1pbmFsU3RhdHVzTGlzdDtcblxuXHRnZXQgc3RvcmUoKTogRGlzcG9zYWJsZVN0b3JlIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmU7XG5cdH1cblxuXHRnZXQgZXh0RW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oKTogSU1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmV4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uOyB9XG5cblx0eHRlcm0/OiBYdGVybVRlcm1pbmFsO1xuXHRkaXNhYmxlTGF5b3V0OiBib29sZWFuID0gZmFsc2U7XG5cblx0Z2V0IHdhaXRPbkV4aXQoKTogSVRlcm1pbmFsSW5zdGFuY2VbJ3dhaXRPbkV4aXQnXSB7IHJldHVybiB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8ud2FpdE9uRXhpdCB8fCB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy53YWl0T25FeGl0OyB9XG5cdHNldCB3YWl0T25FeGl0KHZhbHVlOiBJVGVybWluYWxJbnN0YW5jZVsnd2FpdE9uRXhpdCddKSB7XG5cdFx0dGhpcy5fc2hlbGxMYXVuY2hDb25maWcud2FpdE9uRXhpdCA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNWaXNpYmxlOiBib29sZWFuO1xuXHRnZXQgaXNWaXNpYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNWaXNpYmxlOyB9XG5cblx0cHJpdmF0ZSBfdGFyZ2V0UmVmOiBJbW1vcnRhbFJlZmVyZW5jZTxUZXJtaW5hbExvY2F0aW9uIHwgdW5kZWZpbmVkPiA9IG5ldyBJbW1vcnRhbFJlZmVyZW5jZSh1bmRlZmluZWQpO1xuXHRnZXQgdGFyZ2V0UmVmKCk6IElSZWZlcmVuY2U8VGVybWluYWxMb2NhdGlvbiB8IHVuZGVmaW5lZD4geyByZXR1cm4gdGhpcy5fdGFyZ2V0UmVmOyB9XG5cblx0Z2V0IHRhcmdldCgpOiBUZXJtaW5hbExvY2F0aW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3RhcmdldFJlZi5vYmplY3Q7IH1cblx0c2V0IHRhcmdldCh2YWx1ZTogVGVybWluYWxMb2NhdGlvbiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3RhcmdldFJlZi5vYmplY3QgPSB2YWx1ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRhcmdldC5maXJlKHZhbHVlKTtcblx0fVxuXG5cdGdldCBpbnN0YW5jZUlkKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9pbnN0YW5jZUlkOyB9XG5cdGdldCByZXNvdXJjZSgpOiBVUkkgeyByZXR1cm4gdGhpcy5fcmVzb3VyY2U7IH1cblx0Z2V0IGNvbHMoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fZml4ZWRDb2xzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9maXhlZENvbHM7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUgJiYgdGhpcy5fZGltZW5zaW9uc092ZXJyaWRlLmNvbHMpIHtcblx0XHRcdGlmICh0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUuZm9yY2VFeGFjdFNpemUpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RpbWVuc2lvbnNPdmVycmlkZS5jb2xzO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIE1hdGgubWluKE1hdGgubWF4KHRoaXMuX2RpbWVuc2lvbnNPdmVycmlkZS5jb2xzLCAyKSwgdGhpcy5fY29scyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb2xzO1xuXHR9XG5cdGdldCByb3dzKCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2ZpeGVkUm93cyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZml4ZWRSb3dzO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZGltZW5zaW9uc092ZXJyaWRlICYmIHRoaXMuX2RpbWVuc2lvbnNPdmVycmlkZS5yb3dzKSB7XG5cdFx0XHRpZiAodGhpcy5fZGltZW5zaW9uc092ZXJyaWRlLmZvcmNlRXhhY3RTaXplKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUucm93cztcblx0XHRcdH1cblx0XHRcdHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUucm93cywgMiksIHRoaXMuX3Jvd3MpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcm93cztcblx0fVxuXHRnZXQgaXNEaXNwb3NlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQ7IH1cblx0Z2V0IGZpeGVkQ29scygpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZml4ZWRDb2xzOyB9XG5cdGdldCBmaXhlZFJvd3MoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2ZpeGVkUm93czsgfVxuXHRnZXQgbWF4Q29scygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fY29sczsgfVxuXHRnZXQgbWF4Um93cygpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fcm93czsgfVxuXHQvLyBUT0RPOiBJZGVhbGx5IHByb2Nlc3NJZCB3b3VsZCBiZSBtZXJnZWQgaW50byBwcm9jZXNzUmVhZHlcblx0Z2V0IHByb2Nlc3NJZCgpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcHJvY2Vzc01hbmFnZXIuc2hlbGxQcm9jZXNzSWQ7IH1cblx0Ly8gVE9ETzogSG93IGRvZXMgdGhpcyB3b3JrIHdpdGggZGV0YWNoZWQgcHJvY2Vzc2VzP1xuXHQvLyBUT0RPOiBTaG91bGQgdGhpcyBiZSBhbiBldmVudCBhcyBpdCBjYW4gZmlyZSB0d2ljZT9cblx0Z2V0IHByb2Nlc3NSZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnB0eVByb2Nlc3NSZWFkeTsgfVxuXHRnZXQgaGFzQ2hpbGRQcm9jZXNzZXMoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5oYXNDaGlsZFByb2Nlc3NlcyB8fCB0aGlzLl9wcm9jZXNzTWFuYWdlci5oYXNDaGlsZFByb2Nlc3NlczsgfVxuXHRnZXQgcmVjb25uZWN0aW9uUHJvcGVydGllcygpOiBJUmVjb25uZWN0aW9uUHJvcGVydGllcyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzIHx8IHRoaXMuc2hlbGxMYXVuY2hDb25maWcucmVjb25uZWN0aW9uUHJvcGVydGllczsgfVxuXHRnZXQgYXJlTGlua3NSZWFkeSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2FyZUxpbmtzUmVhZHk7IH1cblx0Z2V0IGluaXRpYWxEYXRhRXZlbnRzKCk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2luaXRpYWxEYXRhRXZlbnRzOyB9XG5cdGdldCBleGl0Q29kZSgpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZXhpdENvZGU7IH1cblx0Z2V0IGV4aXRSZWFzb24oKTogVGVybWluYWxFeGl0UmVhc29uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2V4aXRSZWFzb247IH1cblx0Z2V0IGhhZEZvY3VzT25FeGl0KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faGFkRm9jdXNPbkV4aXQ7IH1cblx0Z2V0IGlzVGl0bGVTZXRCeVByb2Nlc3MoKTogYm9vbGVhbiB7IHJldHVybiAhIXRoaXMuX21lc3NhZ2VUaXRsZURpc3Bvc2FibGUudmFsdWU7IH1cblx0Z2V0IHNoZWxsTGF1bmNoQ29uZmlnKCk6IElTaGVsbExhdW5jaENvbmZpZyB7IHJldHVybiB0aGlzLl9zaGVsbExhdW5jaENvbmZpZzsgfVxuXHRnZXQgc2hlbGxUeXBlKCk6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NoZWxsVHlwZTsgfVxuXHRnZXQgb3MoKTogT3BlcmF0aW5nU3lzdGVtIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLm9zOyB9XG5cdGdldCBoYXNSZW1vdGVBdXRob3JpdHkoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9wcm9jZXNzTWFuYWdlci5yZW1vdGVBdXRob3JpdHkgIT09IHVuZGVmaW5lZDsgfVxuXHRnZXQgcmVtb3RlQXV0aG9yaXR5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcm9jZXNzTWFuYWdlci5yZW1vdGVBdXRob3JpdHk7IH1cblx0Z2V0IGhhc0ZvY3VzKCk6IGJvb2xlYW4geyByZXR1cm4gZG9tLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQodGhpcy5fd3JhcHBlckVsZW1lbnQpOyB9XG5cdGdldCB0aXRsZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fdGl0bGU7IH1cblx0Z2V0IHRpdGxlU291cmNlKCk6IFRpdGxlRXZlbnRTb3VyY2UgeyByZXR1cm4gdGhpcy5fdGl0bGVTb3VyY2U7IH1cblx0Z2V0IGljb24oKTogVGVybWluYWxJY29uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2dldEljb24oKTsgfVxuXHRnZXQgY29sb3IoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2dldENvbG9yKCk7IH1cblx0Z2V0IHByb2Nlc3NOYW1lKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9wcm9jZXNzTmFtZTsgfVxuXHRnZXQgc2VxdWVuY2UoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3NlcXVlbmNlOyB9XG5cdGdldCBzdGF0aWNUaXRsZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc3RhdGljVGl0bGU7IH1cblx0Z2V0IHByb2dyZXNzU3RhdGUoKTogSVByb2dyZXNzU3RhdGUgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy54dGVybT8ucHJvZ3Jlc3NTdGF0ZTsgfVxuXHRnZXQgd29ya3NwYWNlRm9sZGVyKCk6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fd29ya3NwYWNlRm9sZGVyOyB9XG5cdGdldCBjd2QoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2N3ZDsgfVxuXHRnZXQgaW5pdGlhbEN3ZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5faW5pdGlhbEN3ZDsgfVxuXHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fZGVzY3JpcHRpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9kZXNjcmlwdGlvbjtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZSA9IHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LnR5cGUgfHwgdGhpcy5zaGVsbExhdW5jaENvbmZpZy50eXBlO1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSAnVGFzayc6IHJldHVybiB0ZXJtaW5hbFN0cmluZ3MudHlwZVRhc2s7XG5cdFx0XHRjYXNlICdMb2NhbCc6IHJldHVybiB0ZXJtaW5hbFN0cmluZ3MudHlwZUxvY2FsO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblx0Z2V0IHVzZXJIb21lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl91c2VySG9tZTsgfVxuXHRnZXQgc2hlbGxJbnRlZ3JhdGlvbk5vbmNlKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9wcm9jZXNzTWFuYWdlci5zaGVsbEludGVncmF0aW9uTm9uY2U7IH1cblx0Z2V0IGluamVjdGVkQXJncygpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9pbmplY3RlZEFyZ3M7IH1cblxuXHQvLyBUaGUgb25FeGl0IGV2ZW50IGlzIHNwZWNpYWwgaW4gdGhhdCBpdCBmaXJlcyBhbmQgaXMgZGlzcG9zZWQgYWZ0ZXIgdGhlIHRlcm1pbmFsIGluc3RhbmNlXG5cdC8vIGl0c2VsZiBpcyBkaXNwb3NlZFxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkV4aXQgPSBuZXcgRW1pdHRlcjxudW1iZXIgfCBJVGVybWluYWxMYXVuY2hFcnJvciB8IHVuZGVmaW5lZD4oKTtcblx0cmVhZG9ubHkgb25FeGl0ID0gdGhpcy5fb25FeGl0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRyZWFkb25seSBvbldpbGxEaXNwb3NlID0gdGhpcy5fb25XaWxsRGlzcG9zZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaXNwb3NlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25EaXNwb3NlZCA9IHRoaXMuX29uRGlzcG9zZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc0lkUmVhZHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc0lkUmVhZHkgPSB0aGlzLl9vblByb2Nlc3NJZFJlYWR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NSZXBsYXlDb21wbGV0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZXBsYXlDb21wbGV0ZSA9IHRoaXMuX29uUHJvY2Vzc1JlcGxheUNvbXBsZXRlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblRpdGxlQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25UaXRsZUNoYW5nZWQgPSB0aGlzLl9vblRpdGxlQ2hhbmdlZC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25JY29uQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlOyB1c2VySW5pdGlhdGVkOiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkljb25DaGFuZ2VkID0gdGhpcy5fb25JY29uQ2hhbmdlZC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERhdGEgPSB0aGlzLl9vbldpbGxEYXRhLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRhdGEgPSB0aGlzLl9vbkRhdGEuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmluYXJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25CaW5hcnkgPSB0aGlzLl9vbkJpbmFyeS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXF1ZXN0RXh0SG9zdFByb2Nlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uUmVxdWVzdEV4dEhvc3RQcm9jZXNzID0gdGhpcy5fb25SZXF1ZXN0RXh0SG9zdFByb2Nlc3MuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGltZW5zaW9uc0NoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaW1lbnNpb25zQ2hhbmdlZCA9IHRoaXMuX29uRGltZW5zaW9uc0NoYW5nZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWF4aW11bURpbWVuc2lvbnNDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uTWF4aW11bURpbWVuc2lvbnNDaGFuZ2VkID0gdGhpcy5fb25NYXhpbXVtRGltZW5zaW9uc0NoYW5nZWQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RGb2N1cyA9IHRoaXMuX29uRGlkUmVxdWVzdEZvY3VzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEJsdXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQmx1ciA9IHRoaXMuX29uRGlkQmx1ci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbnB1dERhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZElucHV0RGF0YSA9IHRoaXMuX29uRGlkSW5wdXREYXRhLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25SZXF1ZXN0QWRkSW5zdGFuY2VUb0dyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVJlcXVlc3RBZGRJbnN0YW5jZVRvR3JvdXBFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uUmVxdWVzdEFkZEluc3RhbmNlVG9Hcm91cCA9IHRoaXMuX29uUmVxdWVzdEFkZEluc3RhbmNlVG9Hcm91cC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3NlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhhc0NoaWxkUHJvY2Vzc2VzID0gdGhpcy5fb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3Nlcy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFeGVjdXRlVGV4dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEV4ZWN1dGVUZXh0ID0gdGhpcy5fb25EaWRFeGVjdXRlVGV4dC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VUYXJnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxUZXJtaW5hbExvY2F0aW9uIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUYXJnZXQgPSB0aGlzLl9vbkRpZENoYW5nZVRhcmdldC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZW5kVGV4dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU2VuZFRleHQgPSB0aGlzLl9vbkRpZFNlbmRUZXh0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNoZWxsVHlwZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFRlcm1pbmFsU2hlbGxUeXBlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTaGVsbFR5cGUgPSB0aGlzLl9vbkRpZENoYW5nZVNoZWxsVHlwZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkxpbmVEYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPih7XG5cdFx0b25EaWRBZGRGaXJzdExpc3RlbmVyOiBhc3luYyAoKSA9PiAodGhpcy54dGVybSA/PyBhd2FpdCB0aGlzLl94dGVybVJlYWR5UHJvbWlzZSk/LnJhdy5sb2FkQWRkb24odGhpcy5fbGluZURhdGFFdmVudEFkZG9uISlcblx0fSkpO1xuXHRyZWFkb25seSBvbkxpbmVEYXRhID0gdGhpcy5fb25MaW5lRGF0YS5ldmVudDtcblxuXHRyZWFkb25seSBzZXNzaW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNoZWxsVHlwZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZz4sXG5cdFx0cHJpdmF0ZSBfc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZTogSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBfcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElUZXJtaW5hbExvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJSGlzdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fd3JhcHBlckVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudC5jbGFzc0xpc3QuYWRkKCd0ZXJtaW5hbC13cmFwcGVyJyk7XG5cblx0XHR0aGlzLl93aWRnZXRNYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxXaWRnZXRNYW5hZ2VyKSk7XG5cblx0XHR0aGlzLl9pc0V4aXRpbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9pc0Rpc3Bvc2luZyA9IGZhbHNlO1xuXHRcdHRoaXMuX2hhZEZvY3VzT25FeGl0ID0gZmFsc2U7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5faW5zdGFuY2VJZCA9IFRlcm1pbmFsSW5zdGFuY2UuX2luc3RhbmNlSWRDb3VudGVyKys7XG5cdFx0dGhpcy5fZml4ZWRSb3dzID0gX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5maXhlZERpbWVuc2lvbnM/LnJvd3M7XG5cdFx0dGhpcy5fZml4ZWRDb2xzID0gX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5maXhlZERpbWVuc2lvbnM/LmNvbHM7XG5cdFx0dGhpcy5fc2hlbGxMYXVuY2hDb25maWcuc2hlbGxJbnRlZ3JhdGlvbkVudmlyb25tZW50UmVwb3J0aW5nID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVudmlyb25tZW50UmVwb3J0aW5nKTtcblxuXHRcdHRoaXMuX3Jlc291cmNlID0gZ2V0VGVybWluYWxVcmkodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuaWQsIHRoaXMuaW5zdGFuY2VJZCwgdGhpcy50aXRsZSk7XG5cblx0XHRpZiAodGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LmhpZGVGcm9tVXNlcikge1xuXHRcdFx0dGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaGlkZUZyb21Vc2VyID0gdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuaGlkZUZyb21Vc2VyO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8uaXNGZWF0dXJlVGVybWluYWwpIHtcblx0XHRcdHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsID0gdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuaXNGZWF0dXJlVGVybWluYWw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy50eXBlKSB7XG5cdFx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy50eXBlID0gdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MudHlwZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LnRhYkFjdGlvbnMpIHtcblx0XHRcdHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLnRhYkFjdGlvbnMgPSB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy50YWJBY3Rpb25zO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmN3ZCkge1xuXHRcdFx0Y29uc3QgY3dkVXJpID0gaXNTdHJpbmcodGhpcy5fc2hlbGxMYXVuY2hDb25maWcuY3dkKSA/IFVSSS5mcm9tKHtcblx0XHRcdFx0c2NoZW1lOiBTY2hlbWFzLmZpbGUsXG5cdFx0XHRcdHBhdGg6IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmN3ZFxuXHRcdFx0fSkgOiB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5jd2Q7XG5cdFx0XHRpZiAoY3dkVXJpKSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtzcGFjZUZvbGRlciA9IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihjd2RVcmkpID8/IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCF0aGlzLl93b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkgPSB0aGlzLl9oaXN0b3J5U2VydmljZS5nZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdCgpO1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlRm9sZGVyID0gYWN0aXZlV29ya3NwYWNlUm9vdFVyaSA/IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihhY3RpdmVXb3Jrc3BhY2VSb290VXJpKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihfY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX3dyYXBwZXJFbGVtZW50KSk7XG5cdFx0dGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSBzY29wZWRDb250ZXh0S2V5U2VydmljZTtcblx0XHR0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJQ29udGV4dEtleVNlcnZpY2UsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXVxuXHRcdCkpKTtcblxuXHRcdHRoaXMuX3Rlcm1pbmFsRm9jdXNDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5mb2N1cy5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsSGFzRml4ZWRXaWR0aCA9IFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNGaXhlZFdpZHRoLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fdGVybWluYWxIYXNUZXh0Q29udGV4dEtleSA9IFRlcm1pbmFsQ29udGV4dEtleXMudGV4dFNlbGVjdGVkLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fdGVybWluYWxBbHRCdWZmZXJBY3RpdmVDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5hbHRCdWZmZXJBY3RpdmUuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl90ZXJtaW5hbFNoZWxsSW50ZWdyYXRpb25FbmFibGVkQ29udGV4dEtleSA9IFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxTaGVsbEludGVncmF0aW9uRW5hYmxlZC5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgdGVybWluYWxJbnN0YW5jZSNjdG9yIChpbnN0YW5jZUlkOiAke3RoaXMuaW5zdGFuY2VJZH0pYCwgdGhpcy5fc2hlbGxMYXVuY2hDb25maWcpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ2FwYWJpbGl0eShlID0+IHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ3Rlcm1pbmFsSW5zdGFuY2UgYWRkZWQgY2FwYWJpbGl0eScsIGUuaWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jYXBhYmlsaXRpZXMub25EaWRSZW1vdmVDYXBhYmlsaXR5KGUgPT4gdGhpcy5fbG9nU2VydmljZS5kZWJ1ZygndGVybWluYWxJbnN0YW5jZSByZW1vdmVkIGNhcGFiaWxpdHknLCBlLmlkKSkpO1xuXG5cdFx0Y29uc3QgY2FwYWJpbGl0eUxpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPFRlcm1pbmFsQ2FwYWJpbGl0eSwgSURpc3Bvc2FibGU+KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2FwYWJpbGl0aWVzLm9uRGlkQWRkQ2FwYWJpbGl0eShlID0+IHtcblx0XHRcdGNhcGFiaWxpdHlMaXN0ZW5lcnMuZ2V0KGUuaWQpPy5kaXNwb3NlKCk7XG5cdFx0XHRjb25zdCByZWZyZXNoSW5mbyA9ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fbGFiZWxDb21wdXRlcj8ucmVmcmVzaExhYmVsKHRoaXMpO1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoU2hlbGxJbnRlZ3JhdGlvbkluZm9TdGF0dXModGhpcyk7XG5cdFx0XHR9O1xuXHRcdFx0c3dpdGNoIChlLmlkKSB7XG5cdFx0XHRcdGNhc2UgVGVybWluYWxDYXBhYmlsaXR5LkN3ZERldGVjdGlvbjoge1xuXHRcdFx0XHRcdGNhcGFiaWxpdHlMaXN0ZW5lcnMuc2V0KGUuaWQsIGUuY2FwYWJpbGl0eS5vbkRpZENoYW5nZUN3ZChlID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2N3ZCA9IGU7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXRUaXRsZSh0aGlzLnRpdGxlLCBUaXRsZUV2ZW50U291cmNlLkNvbmZpZyk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb246IHtcblx0XHRcdFx0XHRlLmNhcGFiaWxpdHkucHJvbXB0SW5wdXRNb2RlbC5zZXRTaGVsbFR5cGUodGhpcy5zaGVsbFR5cGUpO1xuXHRcdFx0XHRcdC8vIFVzZSBEaXNwb3NhYmxlU3RvcmUgdG8gdHJhY2sgbXVsdGlwbGUgbGlzdGVuZXJzIGZvciB0aGlzIGNhcGFiaWxpdHlcblx0XHRcdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRzdG9yZS5hZGQoRXZlbnQuYW55KFxuXHRcdFx0XHRcdFx0ZS5jYXBhYmlsaXR5LnByb21wdElucHV0TW9kZWwub25EaWRTdGFydElucHV0LFxuXHRcdFx0XHRcdFx0ZS5jYXBhYmlsaXR5LnByb21wdElucHV0TW9kZWwub25EaWRDaGFuZ2VJbnB1dCxcblx0XHRcdFx0XHRcdGUuY2FwYWJpbGl0eS5wcm9tcHRJbnB1dE1vZGVsLm9uRGlkRmluaXNoSW5wdXRcblx0XHRcdFx0XHQpKHJlZnJlc2hJbmZvKSk7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKGUuY2FwYWJpbGl0eS5vbkNvbW1hbmRFeGVjdXRlZChhc3luYyAoY29tbWFuZCkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gT25seSBnZW5lcmF0ZSBJRCBpZiBjb21tYW5kIGRvZXNuJ3QgYWxyZWFkeSBoYXZlIG9uZSAoaS5lLiwgaXQncyBhIG1hbnVhbCBjb21tYW5kLCBub3QgQ29waWxvdC1pbml0aWF0ZWQpXG5cdFx0XHRcdFx0XHQvLyBUaGUgdG9vbCB0ZXJtaW5hbCBzZXRzIHRoZSBjb21tYW5kIElEIGJlZm9yZSBjb21tYW5kIHN0YXJ0LCBzbyB0aGlzIHdvbid0IG92ZXJyaWRlIGl0XG5cdFx0XHRcdFx0XHRpZiAoIWNvbW1hbmQuaWQgJiYgY29tbWFuZC5jb21tYW5kKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnh0ZXJtPy5zaGVsbEludGVncmF0aW9uLnNldE5leHRDb21tYW5kSWQoY29tbWFuZC5jb21tYW5kLCBjb21tYW5kSWQpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcm9jZXNzTWFuYWdlci5zZXROZXh0Q29tbWFuZElkKGNvbW1hbmQuY29tbWFuZCwgY29tbWFuZElkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0Y2FwYWJpbGl0eUxpc3RlbmVycy5zZXQoZS5pZCwgc3RvcmUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgVGVybWluYWxDYXBhYmlsaXR5LlByb21wdFR5cGVEZXRlY3Rpb246IHtcblx0XHRcdFx0XHRjYXBhYmlsaXR5TGlzdGVuZXJzLnNldChlLmlkLCBlLmNhcGFiaWxpdHkub25Qcm9tcHRUeXBlQ2hhbmdlZChyZWZyZXNoSW5mbykpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VTaGVsbFR5cGUoKCkgPT4gdGhpcy5fcmVmcmVzaFNoZWxsSW50ZWdyYXRpb25JbmZvU3RhdHVzKHRoaXMpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jYXBhYmlsaXRpZXMub25EaWRSZW1vdmVDYXBhYmlsaXR5KGUgPT4ge1xuXHRcdFx0Y2FwYWJpbGl0eUxpc3RlbmVycy5nZXQoZS5pZCk/LmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZXNvbHZlIGp1c3QgdGhlIGljb24gYWhlYWQgb2YgdGltZSBzbyB0aGF0IGl0IHNob3dzIHVwIGltbWVkaWF0ZWx5IGluIHRoZSB0YWJzLiBUaGlzIGlzXG5cdFx0Ly8gZGlzYWJsZWQgaW4gcmVtb3RlIGJlY2F1c2UgdGhpcyBuZWVkcyB0byBiZSBzeW5jIGFuZCB0aGUgT1MgbWF5IGRpZmZlciBvbiB0aGUgcmVtb3RlXG5cdFx0Ly8gd2hpY2ggd291bGQgcmVzdWx0IGluIHRoZSB3cm9uZyBwcm9maWxlIGJlaW5nIHNlbGVjdGVkIGFuZCB0aGUgd3JvbmcgaWNvbiBiZWluZ1xuXHRcdC8vIHBlcm1hbmVudGx5IGF0dGFjaGVkIHRvIHRoZSB0ZXJtaW5hbC4gVGhpcyBhbHNvIGRvZXNuJ3Qgd29yayB3aGVuIHRoZSBkZWZhdWx0IHByb2ZpbGVcblx0XHQvLyBzZXR0aW5nIGlzIHNldCB0byBudWxsLCB0aGF0J3MgaGFuZGxlZCBhZnRlciB0aGUgcHJvY2VzcyBpcyBjcmVhdGVkLlxuXHRcdGlmICghdGhpcy5zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlICYmICF0aGlzLl93b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UucmVzb2x2ZUljb24odGhpcy5fc2hlbGxMYXVuY2hDb25maWcsIE9TKTtcblx0XHR9XG5cdFx0dGhpcy5faWNvbiA9IF9zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8uaWNvbiB8fCBfc2hlbGxMYXVuY2hDb25maWcuaWNvbjtcblxuXHRcdC8vIFdoZW4gYSBjdXN0b20gcHR5IGlzIHVzZWQgc2V0IHRoZSBuYW1lIGltbWVkaWF0ZWx5IHNvIGl0IGdldHMgcGFzc2VkIG92ZXIgdG8gdGhlIGV4dGhvc3Rcblx0XHQvLyBhbmQgaXMgYXZhaWxhYmxlIHdoZW4gUHNldWRvdGVybWluYWwub3BlbiBmaXJlcy5cblx0XHRpZiAodGhpcy5zaGVsbExhdW5jaENvbmZpZy5jdXN0b21QdHlJbXBsZW1lbnRhdGlvbiAmJiAhdGhpcy5fc2hlbGxMYXVuY2hDb25maWcudGl0bGVUZW1wbGF0ZSkge1xuXHRcdFx0dGhpcy5fc2V0VGl0bGUodGhpcy5fc2hlbGxMYXVuY2hDb25maWcubmFtZSwgVGl0bGVFdmVudFNvdXJjZS5BcGkpO1xuXHRcdH1cblxuXHRcdHRoaXMuc3RhdHVzTGlzdCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsU3RhdHVzTGlzdCkpO1xuXHRcdHRoaXMuX2luaXREaW1lbnNpb25zKCk7XG5cdFx0dGhpcy5fcHJvY2Vzc01hbmFnZXIgPSB0aGlzLl9jcmVhdGVQcm9jZXNzTWFuYWdlcigpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyUmVhZHlCYXJyaWVyID0gbmV3IEF1dG9PcGVuQmFycmllcihDb25zdGFudHMuV2FpdEZvckNvbnRhaW5lclRocmVzaG9sZCk7XG5cdFx0dGhpcy5fYXR0YWNoQmFycmllciA9IG5ldyBBdXRvT3BlbkJhcnJpZXIoMTAwMCk7XG5cdFx0dGhpcy5feHRlcm1SZWFkeVByb21pc2UgPSB0aGlzLl9jcmVhdGVYdGVybSgpO1xuXHRcdHRoaXMuX3h0ZXJtUmVhZHlQcm9taXNlLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gV2FpdCBmb3IgYSBwZXJpb2QgdG8gYWxsb3cgYSBjb250YWluZXIgdG8gYmUgcmVhZHlcblx0XHRcdGF3YWl0IHRoaXMuX2NvbnRhaW5lclJlYWR5QmFycmllci53YWl0KCk7XG5cblx0XHRcdC8vIFJlc29sdmUgdGhlIGV4ZWN1dGFibGUgYWhlYWQgb2YgdGltZSBpZiBzaGVsbCBpbnRlZ3JhdGlvbiBpcyBlbmFibGVkLCB0aGlzIHNob3VsZCBub3Rcblx0XHRcdC8vIGJlIGRvbmUgZm9yIGN1c3RvbSBQVFlzIGFzIHRoYXQgd291bGQgY2F1c2UgZXh0ZW5zaW9uIFBzZXVkb3Rlcm1pbmFsLWJhc2VkIHRlcm1pbmFsc1xuXHRcdFx0Ly8gdG8gaGFuZyBpbiByZXNvbHZlciBleHRlbnNpb25zXG5cdFx0XHRsZXQgb3M6IE9wZXJhdGluZ1N5c3RlbSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICghdGhpcy5zaGVsbExhdW5jaENvbmZpZy5jdXN0b21QdHlJbXBsZW1lbnRhdGlvbiAmJiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5zaGVsbEludGVncmF0aW9uPy5lbmFibGVkICYmICF0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUpIHtcblx0XHRcdFx0b3MgPSBhd2FpdCB0aGlzLl9wcm9jZXNzTWFuYWdlci5nZXRCYWNrZW5kT1MoKTtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdFByb2ZpbGUgPSAoYXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLmdldERlZmF1bHRQcm9maWxlKHsgcmVtb3RlQXV0aG9yaXR5OiB0aGlzLnJlbW90ZUF1dGhvcml0eSwgb3MgfSkpO1xuXHRcdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUgPSBkZWZhdWx0UHJvZmlsZS5wYXRoO1xuXHRcdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MgPSBkZWZhdWx0UHJvZmlsZS5hcmdzO1xuXHRcdFx0XHQvLyBPbmx5IHVzZSBkZWZhdWx0IGljb24gYW5kIGNvbG9yIGFuZCBlbnYgaWYgdGhleSBhcmUgdW5kZWZpbmVkIGluIHRoZSBTTENcblx0XHRcdFx0dGhpcy5zaGVsbExhdW5jaENvbmZpZy5pY29uID8/PSBkZWZhdWx0UHJvZmlsZS5pY29uO1xuXHRcdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmNvbG9yID8/PSBkZWZhdWx0UHJvZmlsZS5jb2xvcjtcblx0XHRcdFx0dGhpcy5zaGVsbExhdW5jaENvbmZpZy5lbnYgPz89IGRlZmF1bHRQcm9maWxlLmVudjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgc2hlbGwgdHlwZSBhaGVhZCBvZiB0aW1lIHRvIGFsbG93IGZlYXR1cmVzIHRoYXQgZGVwZW5kIHVwb24gaXQgdG8gd29ya1xuXHRcdFx0Ly8gYmVmb3JlIHRoZSBwcm9jZXNzIGlzIGFjdHVhbGx5IGNyZWF0ZWQgKGxpa2UgdGVybWluYWwgc3VnZ2VzdCBtYW51YWwgcmVxdWVzdClcblx0XHRcdGlmIChvcyAmJiB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUpIHtcblx0XHRcdFx0dGhpcy5zZXRTaGVsbFR5cGUoZ3Vlc3NTaGVsbFR5cGVGcm9tRXhlY3V0YWJsZShvcywgdGhpcy5zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuX2NyZWF0ZVByb2Nlc3MoKTtcblxuXHRcdFx0Ly8gUmUtZXN0YWJsaXNoIHRoZSB0aXRsZSBhZnRlciByZWNvbm5lY3Rcblx0XHRcdGlmICh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzKSB7XG5cdFx0XHRcdHRoaXMuX2N3ZCA9IHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuY3dkO1xuXHRcdFx0XHR0aGlzLl9zZXRUaXRsZSh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLnRpdGxlLCB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLnRpdGxlU291cmNlKTtcblx0XHRcdFx0dGhpcy5zZXRTaGVsbFR5cGUodGhpcy5zaGVsbFR5cGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fZml4ZWRDb2xzKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2FkZFNjcm9sbGJhcigpO1xuXHRcdFx0fVxuXHRcdH0pLmNhdGNoKChlcnIpID0+IHtcblx0XHRcdC8vIElnbm9yZSBleGNlcHRpb25zIGlmIHRoZSB0ZXJtaW5hbCBpcyBhbHJlYWR5IGRpc3Bvc2VkXG5cdFx0XHRpZiAoIXRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlRlcm1pbmFsKSkge1xuXHRcdFx0XHR0aGlzLl9zZXRBcmlhTGFiZWwodGhpcy54dGVybT8ucmF3LCB0aGlzLl9pbnN0YW5jZUlkLCB0aGlzLnRpdGxlKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkJykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb25maWcoKTtcblx0XHRcdFx0dGhpcy5zZXRWaXNpYmxlKHRoaXMuX2lzVmlzaWJsZSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsYXlvdXRTZXR0aW5nczogc3RyaW5nW10gPSBbXG5cdFx0XHRcdFRlcm1pbmFsU2V0dGluZ0lkLkZvbnRTaXplLFxuXHRcdFx0XHRUZXJtaW5hbFNldHRpbmdJZC5Gb250RmFtaWx5LFxuXHRcdFx0XHRUZXJtaW5hbFNldHRpbmdJZC5Gb250V2VpZ2h0LFxuXHRcdFx0XHRUZXJtaW5hbFNldHRpbmdJZC5Gb250V2VpZ2h0Qm9sZCxcblx0XHRcdFx0VGVybWluYWxTZXR0aW5nSWQuTGV0dGVyU3BhY2luZyxcblx0XHRcdFx0VGVybWluYWxTZXR0aW5nSWQuTGluZUhlaWdodCxcblx0XHRcdFx0J2VkaXRvci5mb250RmFtaWx5J1xuXHRcdFx0XTtcblx0XHRcdGlmIChsYXlvdXRTZXR0aW5ncy5zb21lKGlkID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oaWQpKSkge1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRTZXR0aW5nc0NoYW5nZWQgPSB0cnVlO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZXNpemUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlVuaWNvZGVWZXJzaW9uKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVVbmljb2RlVmVyc2lvbigpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5hY2Nlc3NpYmlsaXR5U3VwcG9ydCcpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWNjZXNzaWJpbGl0eVN1cHBvcnQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5UZXJtaW5hbFRpdGxlKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsU2V0dGluZ0lkLlRlcm1pbmFsVGl0bGVTZXBhcmF0b3IpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuVGVybWluYWxEZXNjcmlwdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fbGFiZWxDb21wdXRlcj8ucmVmcmVzaExhYmVsKHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy5fbGFiZWxDb21wdXRlcj8ucmVmcmVzaExhYmVsKHRoaXMpKSk7XG5cblx0XHQvLyBDbGVhciBvdXQgaW5pdGlhbCBkYXRhIGV2ZW50cyBhZnRlciAxMCBzZWNvbmRzLCBob3BlZnVsbHkgZXh0ZW5zaW9uIGhvc3RzIGFyZSB1cCBhbmRcblx0XHQvLyBydW5uaW5nIGF0IHRoYXQgcG9pbnQuXG5cdFx0bGV0IGluaXRpYWxEYXRhRXZlbnRzVGltZW91dDogbnVtYmVyIHwgdW5kZWZpbmVkID0gZG9tLmdldFdpbmRvdyh0aGlzLl9jb250YWluZXIpLnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0aW5pdGlhbERhdGFFdmVudHNUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5faW5pdGlhbERhdGFFdmVudHMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9pbml0aWFsRGF0YUV2ZW50c0xpc3RlbmVyLmNsZWFyKCk7XG5cdFx0fSwgMTAwMDApO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoaW5pdGlhbERhdGFFdmVudHNUaW1lb3V0KSB7XG5cdFx0XHRcdGRvbS5nZXRXaW5kb3codGhpcy5fY29udGFpbmVyKS5jbGVhclRpbWVvdXQoaW5pdGlhbERhdGFFdmVudHNUaW1lb3V0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBJbml0aWFsaXplIGNvbnRyaWJ1dGlvbnNcblx0XHRjb25zdCBjb250cmlidXRpb25EZXNjcyA9IFRlcm1pbmFsRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldFRlcm1pbmFsQ29udHJpYnV0aW9ucygpO1xuXHRcdGZvciAoY29uc3QgZGVzYyBvZiBjb250cmlidXRpb25EZXNjcykge1xuXHRcdFx0aWYgKHRoaXMuX2NvbnRyaWJ1dGlvbnMuaGFzKGRlc2MuaWQpKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBFcnJvcihgQ2Fubm90IGhhdmUgdHdvIHRlcm1pbmFsIGNvbnRyaWJ1dGlvbnMgd2l0aCB0aGUgc2FtZSBpZCAke2Rlc2MuaWR9YCkpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxldCBjb250cmlidXRpb246IElUZXJtaW5hbENvbnRyaWJ1dGlvbjtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnRyaWJ1dGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGRlc2MuY3Rvciwge1xuXHRcdFx0XHRcdGluc3RhbmNlOiB0aGlzLFxuXHRcdFx0XHRcdHByb2Nlc3NNYW5hZ2VyOiB0aGlzLl9wcm9jZXNzTWFuYWdlcixcblx0XHRcdFx0XHR3aWRnZXRNYW5hZ2VyOiB0aGlzLl93aWRnZXRNYW5hZ2VyXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fY29udHJpYnV0aW9ucy5zZXQoZGVzYy5pZCwgY29udHJpYnV0aW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5feHRlcm1SZWFkeVByb21pc2UudGhlbih4dGVybSA9PiB7XG5cdFx0XHRcdGlmICh4dGVybSkge1xuXHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi54dGVybVJlYWR5Py4oeHRlcm0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdGNvbnRyaWJ1dGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnMuZGVsZXRlKGRlc2MuaWQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRDb250cmlidXRpb248VCBleHRlbmRzIElUZXJtaW5hbENvbnRyaWJ1dGlvbj4oaWQ6IHN0cmluZyk6IFQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQoaWQpIGFzIFQgfCBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlT25EYXRhKGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLndyaXRlKGRhdGEpO1xuXHRcdHRoaXMuX29uRGlkSW5wdXREYXRhLmZpcmUoZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRJY29uKCk6IFRlcm1pbmFsSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLl9pY29uKSB7XG5cdFx0XHR0aGlzLl9pY29uID0gdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1N0YXRlID49IFByb2Nlc3NTdGF0ZS5MYXVuY2hpbmdcblx0XHRcdFx0PyBnZXRJY29uUmVnaXN0cnkoKS5nZXRJY29uKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlRhYnNEZWZhdWx0SWNvbikpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faWNvbjtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbG9yKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuc2hlbGxMYXVuY2hDb25maWcuY29sb3IpIHtcblx0XHRcdHJldHVybiB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmNvbG9yO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zaGVsbExhdW5jaENvbmZpZz8uYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LmNvbG9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy5jb2xvcjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1N0YXRlID49IFByb2Nlc3NTdGF0ZS5MYXVuY2hpbmcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9pbml0RGltZW5zaW9ucygpOiB2b2lkIHtcblx0XHQvLyBUaGUgdGVybWluYWwgcGFuZWwgbmVlZHMgdG8gaGF2ZSBiZWVuIGNyZWF0ZWQgdG8gZ2V0IHRoZSByZWFsIHZpZXcgZGltZW5zaW9uc1xuXHRcdGlmICghdGhpcy5fY29udGFpbmVyKSB7XG5cdFx0XHQvLyBTZXQgdGhlIGZhbGxiYWNrIGRpbWVuc2lvbnMgaWYgbm90XG5cdFx0XHR0aGlzLl9jb2xzID0gQ29uc3RhbnRzLkRlZmF1bHRDb2xzO1xuXHRcdFx0dGhpcy5fcm93cyA9IENvbnN0YW50cy5EZWZhdWx0Um93cztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wdXRlZFN0eWxlID0gZG9tLmdldFdpbmRvdyh0aGlzLl9jb250YWluZXIpLmdldENvbXB1dGVkU3R5bGUodGhpcy5fY29udGFpbmVyKTtcblx0XHRjb25zdCB3aWR0aCA9IHBhcnNlSW50KGNvbXB1dGVkU3R5bGUud2lkdGgpO1xuXHRcdGNvbnN0IGhlaWdodCA9IHBhcnNlSW50KGNvbXB1dGVkU3R5bGUuaGVpZ2h0KTtcblxuXHRcdHRoaXMuX2V2YWx1YXRlQ29sc0FuZFJvd3Mod2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHQvKipcblx0ICogRXZhbHVhdGVzIGFuZCBzZXRzIHRoZSBjb2xzIGFuZCByb3dzIG9mIHRoZSB0ZXJtaW5hbCBpZiBwb3NzaWJsZS5cblx0ICogQHBhcmFtIHdpZHRoIFRoZSB3aWR0aCBvZiB0aGUgY29udGFpbmVyLlxuXHQgKiBAcGFyYW0gaGVpZ2h0IFRoZSBoZWlnaHQgb2YgdGhlIGNvbnRhaW5lci5cblx0ICogQHJldHVybiBUaGUgdGVybWluYWwncyB3aWR0aCBpZiBpdCByZXF1aXJlcyBhIGxheW91dC5cblx0ICovXG5cdHByaXZhdGUgX2V2YWx1YXRlQ29sc0FuZFJvd3Mod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBudW1iZXIgfCBudWxsIHtcblx0XHQvLyBJZ25vcmUgaWYgZGltZW5zaW9ucyBhcmUgdW5kZWZpbmVkIG9yIDBcblx0XHRpZiAoIXdpZHRoIHx8ICFoZWlnaHQpIHtcblx0XHRcdHRoaXMuX3NldExhc3RLbm93bkNvbHNBbmRSb3dzKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBkaW1lbnNpb24gPSB0aGlzLl9nZXREaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0aWYgKCFkaW1lbnNpb24pIHtcblx0XHRcdHRoaXMuX3NldExhc3RLbm93bkNvbHNBbmRSb3dzKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBmb250ID0gdGhpcy54dGVybSA/IHRoaXMueHRlcm0uZ2V0Rm9udCgpIDogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGRvbS5nZXRXaW5kb3codGhpcy5kb21FbGVtZW50KSk7XG5cdFx0Y29uc3QgbmV3UkMgPSBnZXRYdGVybVNjYWxlZERpbWVuc2lvbnMoZG9tLmdldFdpbmRvdyh0aGlzLmRvbUVsZW1lbnQpLCBmb250LCBkaW1lbnNpb24ud2lkdGgsIGRpbWVuc2lvbi5oZWlnaHQpO1xuXHRcdGlmICghbmV3UkMpIHtcblx0XHRcdHRoaXMuX3NldExhc3RLbm93bkNvbHNBbmRSb3dzKCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY29scyAhPT0gbmV3UkMuY29scyB8fCB0aGlzLl9yb3dzICE9PSBuZXdSQy5yb3dzKSB7XG5cdFx0XHR0aGlzLl9jb2xzID0gbmV3UkMuY29scztcblx0XHRcdHRoaXMuX3Jvd3MgPSBuZXdSQy5yb3dzO1xuXHRcdFx0dGhpcy5fZmlyZU1heGltdW1EaW1lbnNpb25zQ2hhbmdlZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBkaW1lbnNpb24ud2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRMYXN0S25vd25Db2xzQW5kUm93cygpOiB2b2lkIHtcblx0XHRpZiAoVGVybWluYWxJbnN0YW5jZS5fbGFzdEtub3duR3JpZERpbWVuc2lvbnMpIHtcblx0XHRcdHRoaXMuX2NvbHMgPSBUZXJtaW5hbEluc3RhbmNlLl9sYXN0S25vd25HcmlkRGltZW5zaW9ucy5jb2xzO1xuXHRcdFx0dGhpcy5fcm93cyA9IFRlcm1pbmFsSW5zdGFuY2UuX2xhc3RLbm93bkdyaWREaW1lbnNpb25zLnJvd3M7XG5cdFx0fVxuXHR9XG5cblx0QGRlYm91bmNlKDUwKVxuXHRwcml2YXRlIF9maXJlTWF4aW11bURpbWVuc2lvbnNDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uTWF4aW11bURpbWVuc2lvbnNDaGFuZ2VkLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERpbWVuc2lvbih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IElDYW52YXNEaW1lbnNpb25zIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBUaGUgZm9udCBuZWVkcyB0byBoYXZlIGJlZW4gaW5pdGlhbGl6ZWRcblx0XHRjb25zdCBmb250ID0gdGhpcy54dGVybSA/IHRoaXMueHRlcm0uZ2V0Rm9udCgpIDogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGRvbS5nZXRXaW5kb3codGhpcy5kb21FbGVtZW50KSk7XG5cdFx0aWYgKCFmb250IHx8ICFmb250LmNoYXJXaWR0aCB8fCAhZm9udC5jaGFySGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy54dGVybT8ucmF3LmVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbXB1dGVkU3R5bGUgPSBkb20uZ2V0V2luZG93KHRoaXMueHRlcm0ucmF3LmVsZW1lbnQpLmdldENvbXB1dGVkU3R5bGUodGhpcy54dGVybS5yYXcuZWxlbWVudCk7XG5cdFx0Y29uc3QgaG9yaXpvbnRhbFBhZGRpbmcgPSBwYXJzZUludChjb21wdXRlZFN0eWxlLnBhZGRpbmdMZWZ0KSArIHBhcnNlSW50KGNvbXB1dGVkU3R5bGUucGFkZGluZ1JpZ2h0KSArIHRoaXMueHRlcm0uc2Nyb2xsYmFyV2lkdGgvKnNjcm9sbCBiYXIgcGFkZGluZyovO1xuXHRcdGNvbnN0IHZlcnRpY2FsUGFkZGluZyA9IHBhcnNlSW50KGNvbXB1dGVkU3R5bGUucGFkZGluZ1RvcCkgKyBwYXJzZUludChjb21wdXRlZFN0eWxlLnBhZGRpbmdCb3R0b20pO1xuXHRcdFRlcm1pbmFsSW5zdGFuY2UuX2xhc3RLbm93bkNhbnZhc0RpbWVuc2lvbnMgPSBuZXcgZG9tLkRpbWVuc2lvbihcblx0XHRcdE1hdGgubWluKENvbnN0YW50cy5NYXhDYW52YXNXaWR0aCwgd2lkdGggLSBob3Jpem9udGFsUGFkZGluZyksXG5cdFx0XHRoZWlnaHQgLSB2ZXJ0aWNhbFBhZGRpbmcgKyAodGhpcy5faGFzU2Nyb2xsQmFyICYmIHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIgPyAtNS8qIHNjcm9sbCBiYXIgaGVpZ2h0ICovIDogMCkpO1xuXHRcdHJldHVybiBUZXJtaW5hbEluc3RhbmNlLl9sYXN0S25vd25DYW52YXNEaW1lbnNpb25zO1xuXHR9XG5cblx0Z2V0IHBlcnNpc3RlbnRQcm9jZXNzSWQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnBlcnNpc3RlbnRQcm9jZXNzSWQ7IH1cblx0Z2V0IHNob3VsZFBlcnNpc3QoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9wcm9jZXNzTWFuYWdlci5zaG91bGRQZXJzaXN0ICYmICF0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmlzVHJhbnNpZW50ICYmICghdGhpcy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzIHx8IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd0YXNrLnJlY29ubmVjdGlvbicpID09PSB0cnVlKTsgfVxuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0WHRlcm1Db25zdHJ1Y3RvcihrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IGtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoVGVybWluYWxDb250cmliQ29tbWFuZElkLkExMXlGb2N1c0FjY2Vzc2libGVCdWZmZXIsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoeHRlcm1Db25zdHJ1Y3Rvcikge1xuXHRcdFx0cmV0dXJuIHh0ZXJtQ29uc3RydWN0b3I7XG5cdFx0fVxuXHRcdHh0ZXJtQ29uc3RydWN0b3IgPSBQcm9taXNlcy53aXRoQXN5bmNCb2R5PHR5cGVvZiBYVGVybVRlcm1pbmFsPihhc3luYyAocmVzb2x2ZSkgPT4ge1xuXHRcdFx0Y29uc3QgVGVybWluYWwgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0XHQvLyBMb2NhbGl6ZSBzdHJpbmdzXG5cdFx0XHRUZXJtaW5hbC5zdHJpbmdzLnByb21wdExhYmVsID0gbmxzLmxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmExMXlQcm9tcHRMYWJlbCcsICdUZXJtaW5hbCBpbnB1dCcpO1xuXHRcdFx0VGVybWluYWwuc3RyaW5ncy50b29NdWNoT3V0cHV0ID0ga2V5YmluZGluZyA/IG5scy5sb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC51c2VBY2Nlc3NpYmxlQnVmZmVyJywgJ1VzZSB0aGUgYWNjZXNzaWJsZSBidWZmZXIgezB9IHRvIG1hbnVhbGx5IHJldmlldyBvdXRwdXQnLCBrZXliaW5kaW5nLmdldExhYmVsKCkpIDogbmxzLmxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnVzZUFjY2Vzc2libGVCdWZmZXJOb0tiJywgJ1VzZSB0aGUgVGVybWluYWw6IEZvY3VzIEFjY2Vzc2libGUgQnVmZmVyIGNvbW1hbmQgdG8gbWFudWFsbHkgcmV2aWV3IG91dHB1dCcpO1xuXHRcdFx0cmVzb2x2ZShUZXJtaW5hbCk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHh0ZXJtQ29uc3RydWN0b3I7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIHh0ZXJtLmpzIGluc3RhbmNlIGFuZCBhdHRhY2ggZGF0YSBsaXN0ZW5lcnMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgYXN5bmMgX2NyZWF0ZVh0ZXJtKCk6IFByb21pc2U8WHRlcm1UZXJtaW5hbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IFRlcm1pbmFsID0gYXdhaXQgVGVybWluYWxJbnN0YW5jZS5nZXRYdGVybUNvbnN0cnVjdG9yKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNhYmxlU2hlbGxJbnRlZ3JhdGlvblJlcG9ydGluZyA9ICh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUgPT09IHVuZGVmaW5lZCB8fCB0aGlzLnNoZWxsVHlwZSA9PT0gdW5kZWZpbmVkKSB8fCAhc2hlbGxJbnRlZ3JhdGlvblN1cHBvcnRlZFNoZWxsVHlwZXMuaW5jbHVkZXModGhpcy5zaGVsbFR5cGUpO1xuXHRcdGNvbnN0IHh0ZXJtID0gdGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoWHRlcm1UZXJtaW5hbCwgdGhpcy5fcmVzb3VyY2UsIFRlcm1pbmFsLCB7XG5cdFx0XHRjb2xzOiB0aGlzLl9jb2xzLFxuXHRcdFx0cm93czogdGhpcy5fcm93cyxcblx0XHRcdHh0ZXJtQ29sb3JQcm92aWRlcjogdGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxJbnN0YW5jZUNvbG9yUHJvdmlkZXIsIHRoaXMuX3RhcmdldFJlZiksXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHRoaXMuY2FwYWJpbGl0aWVzLFxuXHRcdFx0c2hlbGxJbnRlZ3JhdGlvbk5vbmNlOiB0aGlzLl9wcm9jZXNzTWFuYWdlci5zaGVsbEludGVncmF0aW9uTm9uY2UsXG5cdFx0XHRkaXNhYmxlU2hlbGxJbnRlZ3JhdGlvblJlcG9ydGluZyxcblx0XHR9LCB0aGlzLm9uRGlkRXhlY3V0ZVRleHQpO1xuXHRcdHRoaXMueHRlcm0gPSB4dGVybTtcblx0XHR0aGlzLl9yZXNpemVEZWJvdW5jZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGVybWluYWxSZXNpemVEZWJvdW5jZXIoXG5cdFx0XHQoKSA9PiB0aGlzLl9pc1Zpc2libGUsXG5cdFx0XHQoKSA9PiB4dGVybSxcblx0XHRcdGFzeW5jIChjb2xzLCByb3dzKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0eHRlcm0ucmVzaXplKGNvbHMsIHJvd3MpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVQdHlEaW1lbnNpb25zKHh0ZXJtLnJhdyk7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKGNvbHMpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR4dGVybS5yZXNpemUoY29scywgeHRlcm0ucmF3LnJvd3MpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVQdHlEaW1lbnNpb25zKHh0ZXJtLnJhdyk7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKHJvd3MpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR4dGVybS5yZXNpemUoeHRlcm0ucmF3LmNvbHMsIHJvd3MpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVQdHlEaW1lbnNpb25zKHh0ZXJtLnJhdyk7XG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3Jlc2l6ZURlYm91bmNlciA9IHVuZGVmaW5lZCkpO1xuXHRcdHRoaXMudXBkYXRlQWNjZXNzaWJpbGl0eVN1cHBvcnQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnh0ZXJtLm9uRGlkUmVxdWVzdFJ1bkNvbW1hbmQoZSA9PiB7XG5cdFx0XHR0aGlzLnNlbmRUZXh0KGUuY29tbWFuZC5jb21tYW5kLCBlLm5vTmV3TGluZSA/IGZhbHNlIDogdHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMueHRlcm0ub25EaWRSZXF1ZXN0UmVmcmVzaERpbWVuc2lvbnMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Ly8gV3JpdGUgaW5pdGlhbCB0ZXh0LCBkZWZlcnJpbmcgb25MaW5lRmVlZCBsaXN0ZW5lciB3aGVuIGFwcGxpY2FibGUgdG8gYXZvaWQgZmlyaW5nXG5cdFx0Ly8gb25MaW5lRGF0YSBldmVudHMgY29udGFpbmluZyBpbml0aWFsVGV4dFxuXHRcdGNvbnN0IGluaXRpYWxUZXh0V3JpdHRlblByb21pc2UgPSB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA/IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gdGhpcy5fd3JpdGVJbml0aWFsVGV4dCh4dGVybSwgcikpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxpbmVEYXRhRXZlbnRBZGRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMaW5lRGF0YUV2ZW50QWRkb24oaW5pdGlhbFRleHRXcml0dGVuUHJvbWlzZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxpbmVEYXRhRXZlbnRBZGRvbi5vbkxpbmVEYXRhKGUgPT4gdGhpcy5fb25MaW5lRGF0YS5maXJlKGUpKSk7XG5cdFx0dGhpcy5fbGluZURhdGFFdmVudEFkZG9uID0gbGluZURhdGFFdmVudEFkZG9uO1xuXHRcdC8vIERlbGF5IHRoZSBjcmVhdGlvbiBvZiB0aGUgYmVsbCBsaXN0ZW5lciB0byBhdm9pZCBzaG93aW5nIHRoZSBiZWxsIHdoZW4gdGhlIHRlcm1pbmFsXG5cdFx0Ly8gc3RhcnRzIHVwIG9yIHJlY29ubmVjdHNcblx0XHRkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5yYXcub25CZWxsKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZUJlbGwpIHx8IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZVZpc3VhbEJlbGwpKSB7XG5cdFx0XHRcdFx0dGhpcy5zdGF0dXNMaXN0LmFkZCh7XG5cdFx0XHRcdFx0XHRpZDogVGVybWluYWxTdGF0dXMuQmVsbCxcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5iZWxsLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdiZWxsU3RhdHVzJywgXCJCZWxsXCIpXG5cdFx0XHRcdFx0fSwgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuYmVsbER1cmF0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwudGVybWluYWxCZWxsKTtcblx0XHRcdH0pKTtcblx0XHR9LCAxMDAwLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeHRlcm0ucmF3Lm9uU2VsZWN0aW9uQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmZpcmUodGhpcykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5yYXcuYnVmZmVyLm9uQnVmZmVyQ2hhbmdlKCgpID0+IHRoaXMuX3JlZnJlc2hBbHRCdWZmZXJDb250ZXh0S2V5KCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLm9uUHJvY2Vzc0RhdGEoZSA9PiB0aGlzLl9vblByb2Nlc3NEYXRhKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeHRlcm0ucmF3Lm9uRGF0YShhc3luYyBkYXRhID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuX2hhbmRsZU9uRGF0YShkYXRhKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeHRlcm0ucmF3Lm9uQmluYXJ5KGRhdGEgPT4gdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc0JpbmFyeShkYXRhKSkpO1xuXHRcdC8vIEluaXQgY29ucHR5IGNvbXBhdCBhbmQgbGluayBoYW5kbGVyIGFmdGVyIHByb2Nlc3MgY3JlYXRpb24gYXMgdGhleSByZWx5IG9uIHRoZVxuXHRcdC8vIHVuZGVybHlpbmcgcHJvY2VzcyBPU1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLm9uUHJvY2Vzc1JlYWR5KGFzeW5jIChwcm9jZXNzVHJhaXRzKSA9PiB7XG5cdFx0XHQvLyBSZXNwb25kIHRvIERBMSB3aXRoIGJhc2ljIGNvbmZvcm1hbmNlLiBOb3RlIHRoYXQgaW5jbHVkaW5nIHRoaXMgaXMgcmVxdWlyZWQgdG8gYXZvaWRcblx0XHRcdC8vIGEgbG9uZyBkZWxheSBpbiBjb25wdHkgMS4yMisgd2hlcmUgaXQgd2FpdHMgZm9yIHRoZSByZXNwb25zZS5cblx0XHRcdC8vIFJlZmVyZW5jZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC90ZXJtaW5hbC9ibG9iLzM3NjBjYWVkOTdmYTkxNDBhNDA3NzdhOGZiYzFjOTU3ODVlNmQyYWIvc3JjL3Rlcm1pbmFsL2FkYXB0ZXIvYWRhcHREaXNwYXRjaC5jcHAjTDE0NzEtTDE0OTVcblx0XHRcdGlmIChwcm9jZXNzVHJhaXRzPy53aW5kb3dzUHR5Py5iYWNrZW5kID09PSAnY29ucHR5Jykge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih4dGVybS5yYXcucGFyc2VyLnJlZ2lzdGVyQ3NpSGFuZGxlcih7IGZpbmFsOiAnYycgfSwgcGFyYW1zID0+IHtcblx0XHRcdFx0XHRpZiAocGFyYW1zLmxlbmd0aCA9PT0gMCB8fCBwYXJhbXMubGVuZ3RoID09PSAxICYmIHBhcmFtc1swXSA9PT0gMCkge1xuXHRcdFx0XHRcdFx0dGhpcy5faGFuZGxlT25EYXRhKCdcXHgxYls/NjE7NGMnKTtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9wcm9jZXNzTWFuYWdlci5vcykge1xuXHRcdFx0XHRsaW5lRGF0YUV2ZW50QWRkb24uc2V0T3BlcmF0aW5nU3lzdGVtKHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLm9zKTtcblx0XHRcdH1cblx0XHRcdHh0ZXJtLnJhdy5vcHRpb25zLndpbmRvd3NQdHkgPSBwcm9jZXNzVHJhaXRzLndpbmRvd3NQdHk7XG5cdFx0XHQvLyBFbmFibGUgcmVmbG93IGN1cnNvciB0byBhdm9pZCBwcm9tcHQgbG9zczogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3NDM3MlxuXHRcdFx0eHRlcm0ucmF3Lm9wdGlvbnMucmVmbG93Q3Vyc29yTGluZSA9IHByb2Nlc3NUcmFpdHM/LndpbmRvd3NQdHk/LmJhY2tlbmQgPT09ICdjb25wdHknICYmICEhdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcud2luZG93c1VzZUNvbnB0eURsbDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcHJvY2Vzc01hbmFnZXIub25SZXN0b3JlQ29tbWFuZHMoZSA9PiB0aGlzLnh0ZXJtPy5zaGVsbEludGVncmF0aW9uLmRlc2VyaWFsaXplKGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl92aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VMb2NhdGlvbigoeyB2aWV3cyB9KSA9PiB7XG5cdFx0XHRpZiAodmlld3Muc29tZSh2ID0+IHYuaWQgPT09IFRFUk1JTkFMX1ZJRVdfSUQpKSB7XG5cdFx0XHRcdHh0ZXJtLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeHRlcm0ub25EaWRDaGFuZ2VQcm9ncmVzcygoKSA9PiB0aGlzLl9sYWJlbENvbXB1dGVyPy5yZWZyZXNoTGFiZWwodGhpcykpKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGFuZCB1cGRhdGUgdGhlIHRlcm1pbmFsJ3Mgc2hlbGwgaW50ZWdyYXRpb24gc3RhdHVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHh0ZXJtLnNoZWxsSW50ZWdyYXRpb24ub25EaWRDaGFuZ2VTZWVuU2VxdWVuY2VzLCAoKSA9PiB7XG5cdFx0XHRpZiAoeHRlcm0uc2hlbGxJbnRlZ3JhdGlvbi5zZWVuU2VxdWVuY2VzLnNpemUgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3JlZnJlc2hTaGVsbEludGVncmF0aW9uSW5mb1N0YXR1cyh0aGlzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTZXQgdXAgdXBkYXRpbmcgb2YgdGhlIHByb2Nlc3MgY3dkIG9uIGtleSBwcmVzcywgdGhpcyBpcyBvbmx5IG5lZWRlZCB3aGVuIHRoZSBjd2Rcblx0XHQvLyBkZXRlY3Rpb24gY2FwYWJpbGl0eSBoYXMgbm90IGJlZW4gcmVnaXN0ZXJlZFxuXHRcdGlmICghdGhpcy5jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24pKSB7XG5cdFx0XHRsZXQgb25LZXlMaXN0ZW5lcjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQgPSB4dGVybS5yYXcub25LZXkoZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlLmRvbUV2ZW50KTtcblx0XHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZVByb2Nlc3NDd2QoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNhcGFiaWxpdGllcy5vbkRpZEFkZEN3ZERldGVjdGlvbkNhcGFiaWxpdHkoKCkgPT4ge1xuXHRcdFx0XHRvbktleUxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0XHRcdG9uS2V5TGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMueHRlcm0/LnNoZWxsSW50ZWdyYXRpb24pIHtcblx0XHRcdHRoaXMuY2FwYWJpbGl0aWVzLmFkZCh0aGlzLnh0ZXJtLnNoZWxsSW50ZWdyYXRpb24uY2FwYWJpbGl0aWVzKTtcblx0XHR9XG5cblx0XHR0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpLnRoZW4odXNlckhvbWUgPT4ge1xuXHRcdFx0dGhpcy5fdXNlckhvbWUgPSB1c2VySG9tZS5mc1BhdGg7XG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLl9vcGVuKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHh0ZXJtO1xuXHR9XG5cblx0Ly8gRGVib3VuY2UgdGhpcyB0byBhdm9pZCBpbXBhY3RpbmcgaW5wdXQgbGF0ZW5jeSB3aGlsZSB0eXBpbmcgaW50byB0aGUgcHJvbXB0XG5cdEBkZWJvdW5jZSg1MDApXG5cdHByaXZhdGUgX3JlZnJlc2hTaGVsbEludGVncmF0aW9uSW5mb1N0YXR1cyhpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRpZiAoIWluc3RhbmNlLnh0ZXJtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNtZERldGVjdGlvblR5cGUgPSAoXG5cdFx0XHRpbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKT8uaGFzUmljaENvbW1hbmREZXRlY3Rpb25cblx0XHRcdFx0PyBubHMubG9jYWxpemUoJ3NoZWxsSW50ZWdyYXRpb24ucmljaCcsICdSaWNoJylcblx0XHRcdFx0OiBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKVxuXHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdzaGVsbEludGVncmF0aW9uLmJhc2ljJywgJ0Jhc2ljJylcblx0XHRcdFx0XHQ6IGluc3RhbmNlLnVzZWRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uXG5cdFx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnc2hlbGxJbnRlZ3JhdGlvbi5pbmplY3Rpb25GYWlsZWQnLCBcIkluamVjdGlvbiBmYWlsZWQgdG8gYWN0aXZhdGVcIilcblx0XHRcdFx0XHRcdDogbmxzLmxvY2FsaXplKCdzaGVsbEludGVncmF0aW9uLm5vJywgJ05vJylcblx0XHQpO1xuXG5cdFx0Y29uc3QgZGV0YWlsZWRBZGRpdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGluc3RhbmNlLnNoZWxsVHlwZSkge1xuXHRcdFx0ZGV0YWlsZWRBZGRpdGlvbnMucHVzaChgU2hlbGwgdHlwZTogXFxgJHtpbnN0YW5jZS5zaGVsbFR5cGV9XFxgYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGN3ZCA9IGluc3RhbmNlLmN3ZDtcblx0XHRpZiAoY3dkKSB7XG5cdFx0XHRkZXRhaWxlZEFkZGl0aW9ucy5wdXNoKGBDdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5OiBcXGAke2N3ZH1cXGBgKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VlblNlcXVlbmNlcyA9IEFycmF5LmZyb20oaW5zdGFuY2UueHRlcm0uc2hlbGxJbnRlZ3JhdGlvbi5zZWVuU2VxdWVuY2VzKTtcblx0XHRpZiAoc2VlblNlcXVlbmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRkZXRhaWxlZEFkZGl0aW9ucy5wdXNoKGBTZWVuIHNlcXVlbmNlczogJHtzZWVuU2VxdWVuY2VzLm1hcChlID0+IGBcXGAke2V9XFxgYCkuam9pbignLCAnKX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvbXB0VHlwZSA9IGluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LlByb21wdFR5cGVEZXRlY3Rpb24pPy5wcm9tcHRUeXBlO1xuXHRcdGlmIChwcm9tcHRUeXBlKSB7XG5cdFx0XHRkZXRhaWxlZEFkZGl0aW9ucy5wdXNoKGBQcm9tcHQgdHlwZTogXFxgJHtwcm9tcHRUeXBlfVxcYGApO1xuXHRcdH1cblx0XHRjb25zdCBjb21iaW5lZFN0cmluZyA9IGluc3RhbmNlLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pPy5wcm9tcHRJbnB1dE1vZGVsLmdldENvbWJpbmVkU3RyaW5nKCk7XG5cdFx0aWYgKGNvbWJpbmVkU3RyaW5nICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRldGFpbGVkQWRkaXRpb25zLnB1c2goYFByb21wdCBpbnB1dDogXFxgXFxgXFxgJHtjb21iaW5lZFN0cmluZ31cXGBcXGBcXGBgKTtcblx0XHR9XG5cdFx0Y29uc3QgZGV0YWlsZWRBZGRpdGlvbnNTdHJpbmcgPSBkZXRhaWxlZEFkZGl0aW9ucy5sZW5ndGggPiAwXG5cdFx0XHQ/ICdcXG5cXG4nICsgZGV0YWlsZWRBZGRpdGlvbnMubWFwKGUgPT4gYC0gJHtlfWApLmpvaW4oJ1xcbicpXG5cdFx0XHQ6ICcnO1xuXG5cdFx0aW5zdGFuY2Uuc3RhdHVzTGlzdC5hZGQoe1xuXHRcdFx0aWQ6IFRlcm1pbmFsU3RhdHVzLlNoZWxsSW50ZWdyYXRpb25JbmZvLFxuXHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHR0b29sdGlwOiBgJHtubHMubG9jYWxpemUoJ3NoZWxsSW50ZWdyYXRpb24nLCBcIlNoZWxsIGludGVncmF0aW9uXCIpfTogJHtjbWREZXRlY3Rpb25UeXBlfWAsXG5cdFx0XHRkZXRhaWxlZFRvb2x0aXA6IGAke25scy5sb2NhbGl6ZSgnc2hlbGxJbnRlZ3JhdGlvbicsIFwiU2hlbGwgaW50ZWdyYXRpb25cIil9OiAke2NtZERldGVjdGlvblR5cGV9JHtkZXRhaWxlZEFkZGl0aW9uc1N0cmluZ31gXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5Db21tYW5kKGNvbW1hbmRMaW5lOiBzdHJpbmcsIHNob3VsZEV4ZWN1dGU6IGJvb2xlYW4sIGNvbW1hbmRJZD86IHN0cmluZywgZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGU/OiBib29sZWFuLCBjb21tYW5kTGluZUZvck1ldGFkYXRhPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGNvbW1hbmREZXRlY3Rpb24gPSB0aGlzLmNhcGFiaWxpdGllcy5nZXQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pO1xuXHRcdGNvbnN0IHNpSW5qZWN0aW9uRW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25FbmFibGVkKSA9PT0gdHJ1ZTtcblx0XHRjb25zdCB0aW1lb3V0TXMgPSBnZXRTaGVsbEludGVncmF0aW9uVGltZW91dChcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0c2lJbmplY3Rpb25FbmFibGVkLFxuXHRcdFx0dGhpcy5oYXNSZW1vdGVBdXRob3JpdHksXG5cdFx0XHR0aGlzLl9wcm9jZXNzTWFuYWdlci5wcm9jZXNzUmVhZHlUaW1lc3RhbXBcblx0XHQpO1xuXG5cdFx0aWYgKCFjb21tYW5kRGV0ZWN0aW9uIHx8IGNvbW1hbmREZXRlY3Rpb24ucHJvbXB0SW5wdXRNb2RlbC5zdGF0ZSAhPT0gUHJvbXB0SW5wdXRTdGF0ZS5JbnB1dCkge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0XHRcdHN0b3JlLmFkZCh0aGlzLmNhcGFiaWxpdGllcy5vbkRpZEFkZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5KGUgPT4ge1xuXHRcdFx0XHRcdFx0Y29tbWFuZERldGVjdGlvbiA9IGU7XG5cdFx0XHRcdFx0XHRpZiAoY29tbWFuZERldGVjdGlvbi5wcm9tcHRJbnB1dE1vZGVsLnN0YXRlID09PSBQcm9tcHRJbnB1dFN0YXRlLklucHV0KSB7XG5cdFx0XHRcdFx0XHRcdHIoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHN0b3JlLmFkZChjb21tYW5kRGV0ZWN0aW9uLnByb21wdElucHV0TW9kZWwub25EaWRTdGFydElucHV0KCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRyKCk7XG5cdFx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR0aW1lb3V0KHRpbWVvdXRNcylcblx0XHRcdF0pO1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdC8vIElmIGEgY29tbWFuZCBJRCB3YXMgcHJvdmlkZWQgYW5kIHdlIGhhdmUgY29tbWFuZCBkZXRlY3Rpb24sIHNldCBpdCBhcyB0aGUgbmV4dCBjb21tYW5kIElEXG5cdFx0Ly8gc28gaXQgd2lsbCBiZSB1c2VkIHdoZW4gdGhlIHNoZWxsIHNlbmRzIHRoZSBjb21tYW5kIHN0YXJ0IHNlcXVlbmNlXG5cdFx0aWYgKGNvbW1hbmRJZCAmJiBjb21tYW5kRGV0ZWN0aW9uKSB7XG5cdFx0XHRjb25zdCBjb21tYW5kTGluZVRvUmVwb3J0ID0gY29tbWFuZExpbmVGb3JNZXRhZGF0YSA/PyBjb21tYW5kTGluZTtcblx0XHRcdHRoaXMueHRlcm0/LnNoZWxsSW50ZWdyYXRpb24uc2V0TmV4dENvbW1hbmRJZChjb21tYW5kTGluZVRvUmVwb3J0LCBjb21tYW5kSWQpO1xuXHRcdFx0YXdhaXQgdGhpcy5fcHJvY2Vzc01hbmFnZXIuc2V0TmV4dENvbW1hbmRJZChjb21tYW5kTGluZVRvUmVwb3J0LCBjb21tYW5kSWQpO1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSB3aGV0aGVyIHRvIHNlbmQgRVRYIChjdHJsK2MpIGJlZm9yZSBydW5uaW5nIHRoZSBjb21tYW5kLiBPbmx5IGRvIHRoaXMgd2hlbiB0aGVcblx0XHQvLyBjb21tYW5kIHdpbGwgYmUgZXhlY3V0ZWQgaW1tZWRpYXRlbHkgb3Igd2hlbiBjb21tYW5kIGRldGVjdGlvbiBzaG93cyB0aGUgcHJvbXB0IGNvbnRhaW5zIHRleHQuXG5cdFx0aWYgKHNob3VsZEV4ZWN1dGUgJiYgKCFjb21tYW5kRGV0ZWN0aW9uIHx8IGNvbW1hbmREZXRlY3Rpb24ucHJvbXB0SW5wdXRNb2RlbC52YWx1ZS5sZW5ndGggPiAwKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5zZW5kVGV4dCgnXFx4MDMnLCBmYWxzZSk7XG5cdFx0XHQvLyBXYWl0IGEgbGl0dGxlIGJlZm9yZSBydW5uaW5nIHRoZSBjb21tYW5kIHRvIGF2b2lkIHRoZSBzZXF1ZW5jZXMgYmVpbmcgZWNob2VkIHdoaWxlIHRoZSBeQ1xuXHRcdFx0Ly8gaXMgYmVpbmcgZXZhbHVhdGVkXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwMCk7XG5cdFx0fVxuXHRcdC8vIEJ5IGRlZmF1bHQsIHVzZSBicmFja2V0ZWQgcGFzdGUgbW9kZSBvbmx5IHdoZW4gbm90IHJ1bm5pbmcgdGhlIGNvbW1hbmQ7IGNhbGxlcnMgY2FuIG92ZXJyaWRlXG5cdFx0Ly8gdGhpcyBieSBleHBsaWNpdGx5IGVuYWJsaW5nIGl0IHZpYSB0aGUgYnJhY2tldGVkUGFzdGVNb2RlIGFyZ3VtZW50LlxuXHRcdGF3YWl0IHRoaXMuc2VuZFRleHQoY29tbWFuZExpbmUsIHNob3VsZEV4ZWN1dGUsICFzaG91bGRFeGVjdXRlIHx8IGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlKTtcblx0fVxuXG5cdGRldGFjaEZyb21FbGVtZW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LnJlbW92ZSgpO1xuXHRcdHRoaXMuX2NvbnRhaW5lciA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGF0dGFjaFRvRWxlbWVudChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gVGhlIGNvbnRhaW5lciBkaWQgbm90IGNoYW5nZSwgZG8gbm90aGluZ1xuXHRcdGlmICh0aGlzLl9jb250YWluZXIgPT09IGNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fYXR0YWNoQmFycmllci5pc09wZW4oKSkge1xuXHRcdFx0dGhpcy5fYXR0YWNoQmFycmllci5vcGVuKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGNvbnRhaW5lciBjaGFuZ2VkLCByZWF0dGFjaFxuXHRcdHRoaXMuX2NvbnRhaW5lciA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fd3JhcHBlckVsZW1lbnQpO1xuXG5cdFx0Ly8gSWYgeHRlcm0gaXMgYWxyZWFkeSBhdHRhY2hlZCwgY2FsbCBvcGVuIGFnYWluIHRvIHBpY2sgdXAgYW55IGNoYW5nZXMgdG8gdGhlIHdpbmRvdy5cblx0XHRpZiAodGhpcy54dGVybT8ucmF3LmVsZW1lbnQpIHtcblx0XHRcdHRoaXMueHRlcm0ucmF3Lm9wZW4odGhpcy54dGVybS5yYXcuZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0dGhpcy54dGVybT8ucmVmcmVzaCgpO1xuXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9pbml0RHJhZ0FuZERyb3AoY29udGFpbmVyKTtcblx0XHR9LCAwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVucyB0aGUgdGVybWluYWwgaW5zdGFuY2UgaW5zaWRlIHRoZSBwYXJlbnQgRE9NIGVsZW1lbnQgcHJldmlvdXNseSBzZXQgd2l0aFxuXHQgKiBgYXR0YWNoVG9FbGVtZW50YCwgeW91IG11c3QgZW5zdXJlIHRoZSBwYXJlbnQgRE9NIGVsZW1lbnQgaXMgZXhwbGljaXRseSB2aXNpYmxlIGJlZm9yZVxuXHQgKiBpbnZva2luZyB0aGlzIGZ1bmN0aW9uIGFzIGl0IHBlcmZvcm1zIHNvbWUgRE9NIGNhbGN1bGF0aW9ucyBpbnRlcm5hbGx5XG5cdCAqL1xuXHRwcml2YXRlIF9vcGVuKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy54dGVybSB8fCB0aGlzLnh0ZXJtLnJhdy5lbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIgfHwgIXRoaXMuX2NvbnRhaW5lci5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBIGNvbnRhaW5lciBlbGVtZW50IG5lZWRzIHRvIGJlIHNldCB3aXRoIGBhdHRhY2hUb0VsZW1lbnRgIGFuZCBiZSBwYXJ0IG9mIHRoZSBET00gYmVmb3JlIGNhbGxpbmcgYF9vcGVuYCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHh0ZXJtSG9zdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHh0ZXJtSG9zdC5jbGFzc0xpc3QuYWRkKCd0ZXJtaW5hbC14dGVybS1ob3N0Jyk7XG5cdFx0dGhpcy5fd3JhcHBlckVsZW1lbnQuYXBwZW5kQ2hpbGQoeHRlcm1Ib3N0KTtcblxuXHRcdHRoaXMuX2NvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl93cmFwcGVyRWxlbWVudCk7XG5cblx0XHRjb25zdCB4dGVybSA9IHRoaXMueHRlcm07XG5cblx0XHQvLyBBdHRhY2ggdGhlIHh0ZXJtIG9iamVjdCB0byB0aGUgRE9NLCBleHBvc2luZyBpdCB0byB0aGUgc21va2UgdGVzdHNcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudC54dGVybSA9IHh0ZXJtLnJhdztcblxuXHRcdGNvbnN0IHNjcmVlbkVsZW1lbnQgPSB4dGVybS5hdHRhY2hUb0VsZW1lbnQoeHRlcm1Ib3N0KTtcblxuXHRcdC8vIEZpcmUgeHRlcm1PcGVuIG9uIGFsbCBjb250cmlidXRpb25zXG5cdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgdGhpcy5fY29udHJpYnV0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKCF0aGlzLnh0ZXJtKSB7XG5cdFx0XHRcdHRoaXMuX3h0ZXJtUmVhZHlQcm9taXNlLnRoZW4oeHRlcm0gPT4ge1xuXHRcdFx0XHRcdGlmICh4dGVybSkge1xuXHRcdFx0XHRcdFx0Y29udHJpYnV0aW9uLnh0ZXJtT3Blbj8uKHh0ZXJtKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udHJpYnV0aW9uLnh0ZXJtT3Blbj8uKHRoaXMueHRlcm0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHh0ZXJtLnNoZWxsSW50ZWdyYXRpb24ub25EaWRDaGFuZ2VTdGF0dXMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaGFzRm9jdXMpIHtcblx0XHRcdFx0dGhpcy5fc2V0U2hlbGxJbnRlZ3JhdGlvbkNvbnRleHRLZXkoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWRDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKCF4dGVybS5yYXcuZWxlbWVudCB8fCAheHRlcm0ucmF3LnRleHRhcmVhKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3h0ZXJtIGVsZW1lbnRzIG5vdCBzZXQgYWZ0ZXIgb3BlbicpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NldEFyaWFMYWJlbCh4dGVybS5yYXcsIHRoaXMuX2luc3RhbmNlSWQsIHRoaXMuX3RpdGxlKTtcblxuXHRcdHh0ZXJtLnJhdy5hdHRhY2hDdXN0b21LZXlFdmVudEhhbmRsZXIoKGV2ZW50OiBLZXlib2FyZEV2ZW50KTogYm9vbGVhbiA9PiB7XG5cdFx0XHQvLyBEaXNhYmxlIGFsbCBpbnB1dCBpZiB0aGUgdGVybWluYWwgaXMgZXhpdGluZ1xuXHRcdFx0aWYgKHRoaXMuX2lzRXhpdGluZykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YW5kYXJkS2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZXZlbnQpO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZVJlc3VsdCA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLnNvZnREaXNwYXRjaChzdGFuZGFyZEtleWJvYXJkRXZlbnQsIHN0YW5kYXJkS2V5Ym9hcmRFdmVudC50YXJnZXQpO1xuXG5cdFx0XHQvLyBSZXNwZWN0IGNob3JkcyBpZiB0aGUgYWxsb3dDaG9yZHMgc2V0dGluZyBpcyBzZXQgYW5kIGl0J3Mgbm90IEVzY2FwZS4gRXNjYXBlIGlzXG5cdFx0XHQvLyBoYW5kbGVkIHNwZWNpYWxseSBmb3IgWmVuIE1vZGUncyBFc2NhcGUsIEVzY2FwZSBjaG9yZCwgcGx1cyBpdCdzIGltcG9ydGFudCBpblxuXHRcdFx0Ly8gdGVybWluYWxzIGdlbmVyYWxseVxuXHRcdFx0Y29uc3QgaXNWYWxpZENob3JkID0gcmVzb2x2ZVJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLk1vcmVDaG9yZHNOZWVkZWQgJiYgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuYWxsb3dDaG9yZHMgJiYgZXZlbnQua2V5ICE9PSAnRXNjYXBlJztcblx0XHRcdGlmICh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5pbkNob3JkTW9kZSB8fCBpc1ZhbGlkQ2hvcmQpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTa2lwIHByb2Nlc3NpbmcgYnkgeHRlcm0uanMgb2Yga2V5Ym9hcmQgZXZlbnRzIHRoYXQgcmVzb2x2ZSB0byBjb21tYW5kcyBkZWZpbmVkIGluXG5cdFx0XHQvLyB0aGUgY29tbWFuZHNUb1NraXBTaGVsbCBzZXR0aW5nLCBvciB0aGF0IHVzZSB0aGUgTWV0YS5cblx0XHRcdC8vIFRoZSBtZXRhS2V5IGNoZWNrIGlzIG5lZWRlZCBiZWNhdXNlIHdoZW4gYSBzaGVsbCBsaWtlIGZpc2ggZW5hYmxlcyB0aGUga2l0dHlcblx0XHRcdC8vIGtleWJvYXJkIHByb3RvY29sLCB4dGVybS5qcyBlbmNvZGVzIE1ldGEtbW9kaWZpZWQga2V5cyBhcyBDU0kgdSBzZXF1ZW5jZXMgYW5kXG5cdFx0XHQvLyBjb25zdW1lcyB0aGVtIHZpYSBwcmV2ZW50RGVmYXVsdC4gVGhlIChub24ta2l0dHkpIHRyYWRpdGlvbmFsIHh0ZXJtLmpzIGhhbmRsZXIgYWxyZWFkeSBza2lwc1xuXHRcdFx0Ly8gTWV0YSBrZXlzIHNvIHRoZXkgYnViYmxlIHVwIG5hdHVyYWxseSwgYnV0IHRoZSBraXR0eSBoYW5kbGVyIGRvZXMgbm90LlxuXHRcdFx0aWYgKCF0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5zZW5kS2V5YmluZGluZ3NUb1NoZWxsICYmIHJlc29sdmVSZXN1bHQua2luZCA9PT0gUmVzdWx0S2luZC5LYkZvdW5kICYmIHJlc29sdmVSZXN1bHQuY29tbWFuZElkICYmIChldmVudC5tZXRhS2V5IHx8IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2Uuc2hvdWxkQ29tbWFuZFNraXBTaGVsbChyZXNvbHZlUmVzdWx0LmNvbW1hbmRJZCkpKSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2tpcCBwcm9jZXNzaW5nIGJ5IHh0ZXJtLmpzIG9mIGtleWJvYXJkIGV2ZW50cyB0aGF0IG1hdGNoIG1lbnUgYmFyIG1uZW1vbmljc1xuXHRcdFx0aWYgKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmFsbG93TW5lbW9uaWNzICYmICFpc01hY2ludG9zaCAmJiBldmVudC5hbHRLZXkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB0YWIgZm9jdXMgbW9kZSBpcyBvbiwgdGFiIGlzIG5vdCBwYXNzZWQgdG8gdGhlIHRlcm1pbmFsXG5cdFx0XHRpZiAoVGFiRm9jdXMuZ2V0VGFiRm9jdXNNb2RlKCkgJiYgZXZlbnQua2V5ID09PSAnVGFiJykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFByZXZlbnQgZGVmYXVsdCB3aGVuIHNoaWZ0K3RhYiBpcyBiZWluZyBzZW50IHRvIHRoZSB0ZXJtaW5hbCB0byBhdm9pZCBpdCBidWJibGluZyB1cFxuXHRcdFx0Ly8gYW5kIGNoYW5naW5nIGZvY3VzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xODgzMjlcblx0XHRcdGlmIChldmVudC5rZXkgPT09ICdUYWInICYmIGV2ZW50LnNoaWZ0S2V5KSB7XG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBbHdheXMgaGF2ZSBhbHQrRjQgc2tpcCB0aGUgdGVybWluYWwgb24gV2luZG93cyBhbmQgYWxsb3cgaXQgdG8gYmUgaGFuZGxlZCBieSB0aGVcblx0XHRcdC8vIHN5c3RlbVxuXHRcdFx0aWYgKGlzV2luZG93cyAmJiBldmVudC5hbHRLZXkgJiYgZXZlbnQua2V5ID09PSAnRjQnICYmICFldmVudC5jdHJsS2V5KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRmFsbGJhY2sgdG8gZm9yY2UgY3RybCt2IHRvIHBhc3RlIG9uIGJyb3dzZXJzIHRoYXQgZG8gbm90IHN1cHBvcnRcblx0XHRcdC8vIG5hdmlnYXRvci5jbGlwYm9hcmQucmVhZFRleHRcblx0XHRcdGlmICghQnJvd3NlckZlYXR1cmVzLmNsaXBib2FyZC5yZWFkVGV4dCAmJiBldmVudC5rZXkgPT09ICd2JyAmJiBldmVudC5jdHJsS2V5KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih4dGVybS5yYXcuZWxlbWVudCwgJ21vdXNlZG93bicsICgpID0+IHtcblx0XHRcdC8vIFdlIG5lZWQgdG8gbGlzdGVuIHRvIHRoZSBtb3VzZXVwIGV2ZW50IG9uIHRoZSBkb2N1bWVudCBzaW5jZSB0aGUgdXNlciBtYXkgcmVsZWFzZVxuXHRcdFx0Ly8gdGhlIG1vdXNlIGJ1dHRvbiBhbnl3aGVyZSBvdXRzaWRlIG9mIF94dGVybS5lbGVtZW50LlxuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHh0ZXJtLnJhdy5lbGVtZW50IS5vd25lckRvY3VtZW50LCAnbW91c2V1cCcsICgpID0+IHtcblx0XHRcdFx0Ly8gRGVsYXkgd2l0aCBhIHNldFRpbWVvdXQgdG8gYWxsb3cgdGhlIG1vdXNldXAgdG8gcHJvcGFnYXRlIHRocm91Z2ggdGhlIERPTVxuXHRcdFx0XHQvLyBiZWZvcmUgZXZhbHVhdGluZyB0aGUgbmV3IHNlbGVjdGlvbiBzdGF0ZS5cblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLl9yZWZyZXNoU2VsZWN0aW9uQ29udGV4dEtleSgpLCAwKTtcblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoeHRlcm0ucmF3LmVsZW1lbnQsICd0b3VjaHN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0eHRlcm0ucmF3LmZvY3VzKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8geHRlcm0uanMgY3VycmVudGx5IGRyb3BzIHNlbGVjdGlvbiBvbiBrZXl1cCBhcyB3ZSBuZWVkIHRvIGhhbmRsZSB0aGlzIGNhc2UuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih4dGVybS5yYXcuZWxlbWVudCwgJ2tleXVwJywgKCkgPT4ge1xuXHRcdFx0Ly8gV2FpdCB1bnRpbCBrZXl1cCBoYXMgcHJvcGFnYXRlZCB0aHJvdWdoIHRoZSBET00gYmVmb3JlIGV2YWx1YXRpbmdcblx0XHRcdC8vIHRoZSBuZXcgc2VsZWN0aW9uIHN0YXRlLlxuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLl9yZWZyZXNoU2VsZWN0aW9uQ29udGV4dEtleSgpLCAwKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHh0ZXJtLnJhdy50ZXh0YXJlYSwgJ2ZvY3VzJywgKCkgPT4gdGhpcy5fc2V0Rm9jdXModHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHh0ZXJtLnJhdy50ZXh0YXJlYSwgJ2JsdXInLCAoKSA9PiB0aGlzLl9zZXRGb2N1cyhmYWxzZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHh0ZXJtLnJhdy50ZXh0YXJlYSwgJ2ZvY3Vzb3V0JywgKCkgPT4gdGhpcy5fc2V0Rm9jdXMoZmFsc2UpKSk7XG5cblx0XHR0aGlzLl9pbml0RHJhZ0FuZERyb3AodGhpcy5fY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3dpZGdldE1hbmFnZXIuYXR0YWNoVG9FbGVtZW50KHNjcmVlbkVsZW1lbnQpO1xuXG5cdFx0aWYgKHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9ucyk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlQ29uZmlnKCk7XG5cblx0XHQvLyBJZiBJU2hlbGxMYXVuY2hDb25maWcud2FpdE9uRXhpdCB3YXMgdHJ1ZSBhbmQgdGhlIHByb2Nlc3MgZmluaXNoZWQgYmVmb3JlIHRoZSB0ZXJtaW5hbFxuXHRcdC8vIHBhbmVsIHdhcyBpbml0aWFsaXplZC5cblx0XHRpZiAoeHRlcm0ucmF3Lm9wdGlvbnMuZGlzYWJsZVN0ZGluKSB7XG5cdFx0XHR0aGlzLl9hdHRhY2hQcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lcih4dGVybS5yYXcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEZvY3VzKGZvY3VzZWQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsRm9jdXNDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHRcdHRoaXMuX3NldFNoZWxsSW50ZWdyYXRpb25Db250ZXh0S2V5KCk7XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUodGhpcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVzZXRGb2N1c0NvbnRleHRLZXkoKTtcblx0XHRcdHRoaXMuX29uRGlkQmx1ci5maXJlKHRoaXMpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaFNlbGVjdGlvbkNvbnRleHRLZXkoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTaGVsbEludGVncmF0aW9uQ29udGV4dEtleSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy54dGVybSkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxTaGVsbEludGVncmF0aW9uRW5hYmxlZENvbnRleHRLZXkuc2V0KHRoaXMueHRlcm0uc2hlbGxJbnRlZ3JhdGlvbi5zdGF0dXMgPT09IFNoZWxsSW50ZWdyYXRpb25TdGF0dXMuVlNDb2RlKTtcblx0XHR9XG5cdH1cblxuXHRyZXNldEZvY3VzQ29udGV4dEtleSgpOiB2b2lkIHtcblx0XHR0aGlzLl90ZXJtaW5hbEZvY3VzQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbkVuYWJsZWRDb250ZXh0S2V5LnJlc2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbml0RHJhZ0FuZERyb3AoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGRuZENvbnRyb2xsZXIgPSBzdG9yZS5hZGQodGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxJbnN0YW5jZURyYWdBbmREcm9wQ29udHJvbGxlciwgY29udGFpbmVyKSk7XG5cdFx0c3RvcmUuYWRkKGRuZENvbnRyb2xsZXIub25Ecm9wVGVybWluYWwoZSA9PiB0aGlzLl9vblJlcXVlc3RBZGRJbnN0YW5jZVRvR3JvdXAuZmlyZShlKSkpO1xuXHRcdHN0b3JlLmFkZChkbmRDb250cm9sbGVyLm9uRHJvcEZpbGUoYXN5bmMgcGF0aCA9PiB7XG5cdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHRhd2FpdCB0aGlzLnNlbmRQYXRoKHBhdGgsIGZhbHNlKTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKG5ldyBkb20uRHJhZ0FuZERyb3BPYnNlcnZlcihjb250YWluZXIsIGRuZENvbnRyb2xsZXIpKTtcblx0XHR0aGlzLl9kbmRPYnNlcnZlci52YWx1ZSA9IHN0b3JlO1xuXHR9XG5cblx0aGFzU2VsZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnh0ZXJtID8gdGhpcy54dGVybS5yYXcuaGFzU2VsZWN0aW9uKCkgOiBmYWxzZTtcblx0fVxuXG5cdGdldCBzZWxlY3Rpb24oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy54dGVybSAmJiB0aGlzLmhhc1NlbGVjdGlvbigpID8gdGhpcy54dGVybS5yYXcuZ2V0U2VsZWN0aW9uKCkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjbGVhclNlbGVjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnh0ZXJtPy5yYXcuY2xlYXJTZWxlY3Rpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hBbHRCdWZmZXJDb250ZXh0S2V5KCkge1xuXHRcdHRoaXMuX3Rlcm1pbmFsQWx0QnVmZmVyQWN0aXZlQ29udGV4dEtleS5zZXQoISEodGhpcy54dGVybSAmJiB0aGlzLnh0ZXJtLnJhdy5idWZmZXIuYWN0aXZlID09PSB0aGlzLnh0ZXJtLnJhdy5idWZmZXIuYWx0ZXJuYXRlKSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKHJlYXNvbj86IFRlcm1pbmFsRXhpdFJlYXNvbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLnR5cGUgPT09ICdUYXNrJyAmJiByZWFzb24gPT09IFRlcm1pbmFsRXhpdFJlYXNvbi5Qcm9jZXNzICYmIHRoaXMuX2V4aXRDb2RlICE9PSAwICYmICF0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLndhaXRPbkV4aXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGB0ZXJtaW5hbEluc3RhbmNlI2Rpc3Bvc2UgKGluc3RhbmNlSWQ6ICR7dGhpcy5pbnN0YW5jZUlkfSlgKTtcblx0XHR0aGlzLl9pc0Rpc3Bvc2luZyA9IHRydWU7XG5cdFx0ZGlzcG9zZSh0aGlzLl93aWRnZXRNYW5hZ2VyKTtcblxuXHRcdGlmICh0aGlzLnh0ZXJtPy5yYXcuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5faGFkRm9jdXNPbkV4aXQgPSB0aGlzLmhhc0ZvY3VzO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fd3JhcHBlckVsZW1lbnQueHRlcm0pIHtcblx0XHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50Lnh0ZXJtID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhcikge1xuXHRcdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIEZpcmUgb25XaWxsRGlzcG9zZSBiZWZvcmUgZGlzcG9zaW5nIHh0ZXJtIHNvIHRoYXQgY29udHJpYnV0aW9ucyBjYW4gY2xlYW5cblx0XHQvLyB1cCB0aGVpciB4dGVybSBhZGRvbnMgd2hpbGUgdGhlIHJhdyB0ZXJtaW5hbCBpcyBzdGlsbCBhbGl2ZS4gRGlzcG9zaW5nXG5cdFx0Ly8geHRlcm0gZmlyc3Qgd291bGQgY2F1c2UgQWRkb25NYW5hZ2VyIHRvIHJlbW92ZSBhZGRvbnMgZnJvbSBpdHMgbGlzdCxcblx0XHQvLyBhbmQgc3Vic2VxdWVudCBjb250cmlidXRpb24gZGlzcG9zYWwgd291bGQgZmFpbCB3aXRoIFwiQ291bGQgbm90IGRpc3Bvc2Vcblx0XHQvLyBhbiBhZGRvbiB0aGF0IGhhcyBub3QgYmVlbiBsb2FkZWRcIi5cblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUodGhpcyk7XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy54dGVybT8uZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2ggKGVycjogdW5rbm93bikge1xuXHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNTM0ODZcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0V4Y2VwdGlvbiBvY2N1cnJlZCBkdXJpbmcgeHRlcm0gZGlzcG9zYWwnLCBlcnIpO1xuXHRcdH1cblxuXHRcdC8vIEhBQ0s6IFdvcmthcm91bmQgZm9yIEZpcmVmb3ggYnVnIGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTU1OTU2MSxcblx0XHQvLyBhcyAnYmx1cicgZXZlbnQgaW4geHRlcm0ucmF3LnRleHRhcmVhIGlzIG5vdCB0cmlnZ2VyZWQgb24geHRlcm0uZGlzcG9zZSgpXG5cdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzgzNThcblx0XHRpZiAoaXNGaXJlZm94KSB7XG5cdFx0XHR0aGlzLnJlc2V0Rm9jdXNDb250ZXh0S2V5KCk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEhhc1RleHRDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9vbkRpZEJsdXIuZmlyZSh0aGlzKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcHJlc3NBbnlLZXlUb0Nsb3NlTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMuX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9leGl0UmVhc29uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2V4aXRSZWFzb24gPSByZWFzb24gPz8gVGVybWluYWxFeGl0UmVhc29uLlVua25vd247XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSB0aGUgcmVzaXplIGRlYm91bmNlciBiZWZvcmUgdGhlIHByb2Nlc3MgbWFuYWdlciBzbyB0aGF0IG5vXG5cdFx0Ly8gcmVzaXplIGNhbGxiYWNrcyBjYW4gZmlyZSBhZnRlciBwdHlQcm9jZXNzUmVhZHkgaGFzIGJlZW4gbnVsbGVkLlxuXHRcdHRoaXMuX3Jlc2l6ZURlYm91bmNlcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Jlc2l6ZURlYm91bmNlciA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmRpc3Bvc2UoKTtcblx0XHQvLyBQcm9jZXNzIG1hbmFnZXIgZGlzcG9zZS9zaHV0ZG93biBkb2Vzbid0IGZpcmUgcHJvY2VzcyBleGl0LCB0cmlnZ2VyIHdpdGggdW5kZWZpbmVkIGlmIGl0XG5cdFx0Ly8gaGFzbid0IGhhcHBlbmVkIHlldFxuXHRcdHRoaXMuX29uUHJvY2Vzc0V4aXQodW5kZWZpbmVkKTtcblxuXHRcdC8vIEZpcmUgb25EaXNwb3NlZCBvbmx5IGFmdGVyIHh0ZXJtIGhhcyBiZWVuIGRpc3Bvc2VkIHNvIHRoYXQgc3Vic2NyaWJlcnNcblx0XHQvLyBvYnNlcnZlIGEgZnVsbHkgZGlzcG9zZWQgaW5zdGFuY2UuXG5cdFx0dGhpcy5fb25EaXNwb3NlZC5maXJlKHRoaXMpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgZGV0YWNoUHJvY2Vzc0FuZERpc3Bvc2UocmVhc29uOiBUZXJtaW5hbEV4aXRSZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBEZXRhY2ggdGhlIHByb2Nlc3MgYW5kIGRpc3Bvc2UgdGhlIGluc3RhbmNlLCB3aXRob3V0IHRoZSBpbnN0YW5jZSBkaXNwb3NlIHRoZSB0ZXJtaW5hbFxuXHRcdC8vIHdvbid0IGdvIGF3YXkuIEZvcmNlIHBlcnNpc3QgaWYgdGhlIGRldGFjaCB3YXMgcmVxdWVzdGVkIGJ5IHRoZSB1c2VyIChub3Qgc2h1dGRvd24pLlxuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmRldGFjaEZyb21Qcm9jZXNzKHJlYXNvbiA9PT0gVGVybWluYWxFeGl0UmVhc29uLlVzZXIpO1xuXHRcdHRoaXMuZGlzcG9zZShyZWFzb24pO1xuXHR9XG5cblx0Zm9jdXMoZm9yY2U/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVmcmVzaEFsdEJ1ZmZlckNvbnRleHRLZXkoKTtcblx0XHRpZiAoIXRoaXMueHRlcm0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGZvcmNlIHx8ICFkb20uZ2V0QWN0aXZlV2luZG93KCkuZ2V0U2VsZWN0aW9uKCk/LnRvU3RyaW5nKCkpIHtcblx0XHRcdHRoaXMueHRlcm0ucmF3LmZvY3VzKCk7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RGb2N1cy5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZm9jdXNXaGVuUmVhZHkoZm9yY2U/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5feHRlcm1SZWFkeVByb21pc2U7XG5cdFx0YXdhaXQgdGhpcy5fYXR0YWNoQmFycmllci53YWl0KCk7XG5cdFx0dGhpcy5mb2N1cyhmb3JjZSk7XG5cdH1cblxuXHRhc3luYyBzZW5kVGV4dCh0ZXh0OiBzdHJpbmcsIHNob3VsZEV4ZWN1dGU6IGJvb2xlYW4sIGZvcmNlQnJhY2tldGVkUGFzdGVNb2RlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEFwcGx5IGJyYWNrZXRlZCBwYXN0ZSBzZXF1ZW5jZXMgaWYgdGhlIHRlcm1pbmFsIGhhcyB0aGUgbW9kZSBlbmFibGVkLCB0aGlzIHdpbGwgcHJldmVudFxuXHRcdC8vIHRoZSB0ZXh0IGZyb20gdHJpZ2dlcmluZyBrZXliaW5kaW5ncyBhbmQgZW5zdXJlIG5ldyBsaW5lcyBhcmUgaGFuZGxlZCBwcm9wZXJseVxuXHRcdGlmIChmb3JjZUJyYWNrZXRlZFBhc3RlTW9kZSAmJiB0aGlzLnh0ZXJtPy5yYXcubW9kZXMuYnJhY2tldGVkUGFzdGVNb2RlKSB7XG5cdFx0XHR0ZXh0ID0gYFxceDFiWzIwMH4ke3RleHR9XFx4MWJbMjAxfmA7XG5cdFx0fVxuXG5cdFx0Ly8gTm9ybWFsaXplIGxpbmUgZW5kaW5ncyB0byAnZW50ZXInIHByZXNzLlxuXHRcdHRleHQgPSB0ZXh0LnJlcGxhY2UoL1xccj9cXG4vZywgJ1xccicpO1xuXHRcdGlmIChzaG91bGRFeGVjdXRlICYmICF0ZXh0LmVuZHNXaXRoKCdcXHInKSkge1xuXHRcdFx0dGV4dCArPSAnXFxyJztcblx0XHR9XG5cblx0XHQvLyBTZW5kIGl0IHRvIHRoZSBwcm9jZXNzXG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1Zygnc2VuZGluZyBkYXRhICh2c2NvZGUpJywgdGV4dCk7XG5cdFx0YXdhaXQgdGhpcy5fcHJvY2Vzc01hbmFnZXIud3JpdGUodGV4dCk7XG5cdFx0dGhpcy5fb25EaWRJbnB1dERhdGEuZmlyZSh0ZXh0KTtcblx0XHR0aGlzLl9vbkRpZFNlbmRUZXh0LmZpcmUodGV4dCk7XG5cdFx0dGhpcy54dGVybT8uc2Nyb2xsVG9Cb3R0b20oKTtcblx0XHRpZiAoc2hvdWxkRXhlY3V0ZSkge1xuXHRcdFx0dGhpcy5fb25EaWRFeGVjdXRlVGV4dC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc2VuZFNpZ25hbChzaWduYWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoJ3NlbmRpbmcgc2lnbmFsICh2c2NvZGUpJywgc2lnbmFsKTtcblx0XHRhd2FpdCB0aGlzLl9wcm9jZXNzTWFuYWdlci5zZW5kU2lnbmFsKHNpZ25hbCk7XG5cdH1cblxuXHRhc3luYyBzZW5kUGF0aChvcmlnaW5hbFBhdGg6IHN0cmluZyB8IFVSSSwgc2hvdWxkRXhlY3V0ZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNlbmRUZXh0KGF3YWl0IHRoaXMucHJlcGFyZVBhdGhGb3JTaGVsbChvcmlnaW5hbFBhdGgpLCBzaG91bGRFeGVjdXRlKTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVQYXRoRm9yU2hlbGwob3JpZ2luYWxQYXRoOiBzdHJpbmcgfCBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdC8vIFdhaXQgZm9yIHNoZWxsIHR5cGUgdG8gYmUgcmVhZHlcblx0XHRhd2FpdCB0aGlzLnByb2Nlc3NSZWFkeTtcblx0XHRyZXR1cm4gcHJlcGFyZVBhdGhGb3JTaGVsbChvcmlnaW5hbFBhdGgsIHRoaXMuc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSwgdGhpcy50aXRsZSwgdGhpcy5zaGVsbFR5cGUsIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmJhY2tlbmQsIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLm9zKTtcblx0fVxuXG5cdGFzeW5jIGdldFVyaUxhYmVsRm9yU2hlbGwodXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdC8vIFdhaXQgZm9yIHNoZWxsIHR5cGUgdG8gYmUgcmVhZHlcblx0XHRhd2FpdCB0aGlzLnByb2Nlc3NSZWFkeTtcblx0XHRyZXR1cm4gZ2V0VXJpTGFiZWxGb3JTaGVsbCh1cmksIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmJhY2tlbmQhLCB0aGlzLnNoZWxsVHlwZSwgdGhpcy5vcyk7XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBkaWRDaGFuZ2UgPSB0aGlzLl9pc1Zpc2libGUgIT09IHZpc2libGU7XG5cdFx0dGhpcy5faXNWaXNpYmxlID0gdmlzaWJsZTtcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCB2aXNpYmxlKTtcblx0XHRpZiAodmlzaWJsZSAmJiB0aGlzLnh0ZXJtKSB7XG5cdFx0XHR0aGlzLl9vcGVuKCk7XG5cdFx0XHQvLyBGbHVzaCBhbnkgcGVuZGluZyByZXNpemVzXG5cdFx0XHR0aGlzLl9yZXNpemVEZWJvdW5jZXI/LmZsdXNoKCk7XG5cdFx0XHQvLyBSZXNpemUgdG8gcmUtZXZhbHVhdGUgZGltZW5zaW9ucywgdGhpcyB3aWxsIGVuc3VyZSB3aGVuIHN3aXRjaGluZyB0byBhIHRlcm1pbmFsIGl0IGlzXG5cdFx0XHQvLyB1c2luZyB0aGUgbW9zdCB1cCB0byBkYXRlIGRpbWVuc2lvbnMgKGVnLiB3aGVuIHRlcm1pbmFsIGlzIGNyZWF0ZWQgaW4gdGhlIGJhY2tncm91bmRcblx0XHRcdC8vIHVzaW5nIGNhY2hlZCBkaW1lbnNpb25zIG9mIGEgc3BsaXQgdGVybWluYWwpLlxuXHRcdFx0dGhpcy5fcmVzaXplKCk7XG5cdFx0fVxuXHRcdGlmIChkaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHZpc2libGUpO1xuXHRcdH1cblx0fVxuXG5cdHNjcm9sbERvd25MaW5lKCk6IHZvaWQge1xuXHRcdHRoaXMueHRlcm0/LnNjcm9sbERvd25MaW5lKCk7XG5cdH1cblxuXHRzY3JvbGxEb3duUGFnZSgpOiB2b2lkIHtcblx0XHR0aGlzLnh0ZXJtPy5zY3JvbGxEb3duUGFnZSgpO1xuXHR9XG5cblx0c2Nyb2xsVG9Cb3R0b20oKTogdm9pZCB7XG5cdFx0dGhpcy54dGVybT8uc2Nyb2xsVG9Cb3R0b20oKTtcblx0fVxuXG5cdHNjcm9sbFVwTGluZSgpOiB2b2lkIHtcblx0XHR0aGlzLnh0ZXJtPy5zY3JvbGxVcExpbmUoKTtcblx0fVxuXG5cdHNjcm9sbFVwUGFnZSgpOiB2b2lkIHtcblx0XHR0aGlzLnh0ZXJtPy5zY3JvbGxVcFBhZ2UoKTtcblx0fVxuXG5cdHNjcm9sbFRvVG9wKCk6IHZvaWQge1xuXHRcdHRoaXMueHRlcm0/LnNjcm9sbFRvVG9wKCk7XG5cdH1cblxuXHRjbGVhckJ1ZmZlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm9jZXNzTWFuYWdlci5jbGVhckJ1ZmZlcigpO1xuXHRcdHRoaXMueHRlcm0/LmNsZWFyQnVmZmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoU2VsZWN0aW9uQ29udGV4dEtleSgpIHtcblx0XHRjb25zdCBpc0FjdGl2ZSA9ICEhdGhpcy5fdmlld3NTZXJ2aWNlLmdldEFjdGl2ZVZpZXdXaXRoSWQoVEVSTUlOQUxfVklFV19JRCk7XG5cdFx0bGV0IGlzRWRpdG9yQWN0aXZlID0gZmFsc2U7XG5cdFx0Y29uc3QgZWRpdG9yID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0aXNFZGl0b3JBY3RpdmUgPSBlZGl0b3IgaW5zdGFuY2VvZiBUZXJtaW5hbEVkaXRvcklucHV0O1xuXHRcdH1cblx0XHR0aGlzLl90ZXJtaW5hbEhhc1RleHRDb250ZXh0S2V5LnNldCgoaXNBY3RpdmUgfHwgaXNFZGl0b3JBY3RpdmUpICYmIHRoaXMuaGFzU2VsZWN0aW9uKCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVQcm9jZXNzTWFuYWdlcigpOiBUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyIHtcblx0XHRsZXQgZGVzZXJpYWxpemVkQ29sbGVjdGlvbnM6IFJlYWRvbmx5TWFwPHN0cmluZywgSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uPiB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8uZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKSB7XG5cdFx0XHRkZXNlcmlhbGl6ZWRDb2xsZWN0aW9ucyA9IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKHRoaXMuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuZW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb25zKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvY2Vzc01hbmFnZXIgPSB0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFRlcm1pbmFsUHJvY2Vzc01hbmFnZXIsXG5cdFx0XHR0aGlzLl9pbnN0YW5jZUlkLFxuXHRcdFx0dGhpcy5zaGVsbExhdW5jaENvbmZpZz8uY3dkLFxuXHRcdFx0ZGVzZXJpYWxpemVkQ29sbGVjdGlvbnMsXG5cdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLnNoZWxsSW50ZWdyYXRpb25Ob25jZSA/PyB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5zaGVsbEludGVncmF0aW9uTm9uY2Vcblx0XHQpO1xuXHRcdHRoaXMuY2FwYWJpbGl0aWVzLmFkZChwcm9jZXNzTWFuYWdlci5jYXBhYmlsaXRpZXMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHByb2Nlc3NNYW5hZ2VyLm9uUHJvY2Vzc1JlYWR5KGFzeW5jIChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vblByb2Nlc3NJZFJlYWR5LmZpcmUodGhpcyk7XG5cdFx0XHR0aGlzLl9pbml0aWFsQ3dkID0gYXdhaXQgdGhpcy5nZXRJbml0aWFsQ3dkKCk7XG5cdFx0XHQvLyBTZXQgdGhlIGluaXRpYWwgbmFtZSBiYXNlZCBvbiB0aGUgX3Jlc29sdmVkXyBzaGVsbCBsYXVuY2ggY29uZmlnLCB0aGlzIHdpbGwgYWxzb1xuXHRcdFx0Ly8gZW5zdXJlIHRoZSByZXNvbHZlZCBpY29uIGdldHMgc2hvd25cblx0XHRcdGlmICghdGhpcy5fbGFiZWxDb21wdXRlcikge1xuXHRcdFx0XHR0aGlzLl9sYWJlbENvbXB1dGVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMYWJlbENvbXB1dGVyKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xhYmVsQ29tcHV0ZXIub25EaWRDaGFuZ2VMYWJlbChlID0+IHtcblx0XHRcdFx0XHRjb25zdCB3YXNDaGFuZ2VkID0gdGhpcy5fdGl0bGUgIT09IGUudGl0bGUgfHwgdGhpcy5fZGVzY3JpcHRpb24gIT09IGUuZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0aWYgKHdhc0NoYW5nZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3RpdGxlID0gZS50aXRsZTtcblx0XHRcdFx0XHRcdHRoaXMuX2Rlc2NyaXB0aW9uID0gZS5kZXNjcmlwdGlvbjtcblx0XHRcdFx0XHRcdHRoaXMuX29uVGl0bGVDaGFuZ2VkLmZpcmUodGhpcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fc2hlbGxMYXVuY2hDb25maWcubmFtZSAmJiAhdGhpcy5fc2hlbGxMYXVuY2hDb25maWcudGl0bGVUZW1wbGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9zZXRUaXRsZSh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5uYW1lLCBUaXRsZUV2ZW50U291cmNlLkFwaSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBMaXN0ZW4gdG8geHRlcm0uanMnIHNlcXVlbmNlIHRpdGxlIGNoYW5nZSBldmVudCwgdHJpZ2dlciB0aGlzIGFzeW5jIHRvIGVuc3VyZVxuXHRcdFx0XHQvLyBfeHRlcm1SZWFkeVByb21pc2UgaXMgcmVhZHkgY29uc3RydWN0ZWQgc2luY2UgdGhpcyBpcyBjYWxsZWQgZnJvbSB0aGUgY3RvclxuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl94dGVybVJlYWR5UHJvbWlzZS50aGVuKHh0ZXJtID0+IHtcblx0XHRcdFx0XHRcdGlmICh4dGVybSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9tZXNzYWdlVGl0bGVEaXNwb3NhYmxlLnZhbHVlID0geHRlcm0ucmF3Lm9uVGl0bGVDaGFuZ2UoZSA9PiB0aGlzLl9vblRpdGxlQ2hhbmdlKGUpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8vIFdoZW4gYSB0aXRsZSB0ZW1wbGF0ZSBpcyBwcm92aWRlZCwgdXNlIHRoZSBuYW1lIGFzIHRoZSBpbml0aWFsIHByb2Nlc3MgbmFtZVxuXHRcdFx0XHQvLyBzbyBpdCBjYW4gYmUgcmVmZXJlbmNlZCB2aWEgJHtwcm9jZXNzfSBpbiB0aGUgdGVtcGxhdGVcblx0XHRcdFx0aWYgKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLnRpdGxlVGVtcGxhdGUgJiYgdGhpcy5fc2hlbGxMYXVuY2hDb25maWcubmFtZSkge1xuXHRcdFx0XHRcdHRoaXMuX3NldFRpdGxlKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLm5hbWUsIFRpdGxlRXZlbnRTb3VyY2UuUHJvY2Vzcyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0VGl0bGUodGhpcy5fc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZSwgVGl0bGVFdmVudFNvdXJjZS5Qcm9jZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihwcm9jZXNzTWFuYWdlci5vblByb2Nlc3NFeGl0KGV4aXRDb2RlID0+IHRoaXMuX29uUHJvY2Vzc0V4aXQoZXhpdENvZGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocHJvY2Vzc01hbmFnZXIub25EaWRDaGFuZ2VQcm9wZXJ0eSgoeyB0eXBlLCB2YWx1ZSB9KSA9PiB7XG5cdFx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLkN3ZDpcblx0XHRcdFx0XHR0aGlzLl9jd2QgPSB2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuQ3dkXTtcblx0XHRcdFx0XHR0aGlzLl9sYWJlbENvbXB1dGVyPy5yZWZyZXNoTGFiZWwodGhpcyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5Jbml0aWFsQ3dkOlxuXHRcdFx0XHRcdHRoaXMuX2luaXRpYWxDd2QgPSB2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuSW5pdGlhbEN3ZF07XG5cdFx0XHRcdFx0dGhpcy5fY3dkID0gdGhpcy5faW5pdGlhbEN3ZDtcblx0XHRcdFx0XHR0aGlzLl9zZXRUaXRsZSh0aGlzLnRpdGxlLCBUaXRsZUV2ZW50U291cmNlLkNvbmZpZyk7XG5cdFx0XHRcdFx0dGhpcy5faWNvbiA9IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5pY29uIHx8IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmljb247XG5cdFx0XHRcdFx0dGhpcy5fb25JY29uQ2hhbmdlZC5maXJlKHsgaW5zdGFuY2U6IHRoaXMsIHVzZXJJbml0aWF0ZWQ6IGZhbHNlIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFByb2Nlc3NQcm9wZXJ0eVR5cGUuVGl0bGU6XG5cdFx0XHRcdFx0dGhpcy5fc2V0VGl0bGUodmFsdWUgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtQcm9jZXNzUHJvcGVydHlUeXBlLlRpdGxlXSA/PyAnJywgVGl0bGVFdmVudFNvdXJjZS5Qcm9jZXNzKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLk92ZXJyaWRlRGltZW5zaW9uczpcblx0XHRcdFx0XHR0aGlzLnNldE92ZXJyaWRlRGltZW5zaW9ucyh2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuT3ZlcnJpZGVEaW1lbnNpb25zXSwgdHJ1ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUHJvY2Vzc1Byb3BlcnR5VHlwZS5SZXNvbHZlZFNoZWxsTGF1bmNoQ29uZmlnOlxuXHRcdFx0XHRcdHRoaXMuX3NldFJlc29sdmVkU2hlbGxMYXVuY2hDb25maWcodmFsdWUgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtQcm9jZXNzUHJvcGVydHlUeXBlLlJlc29sdmVkU2hlbGxMYXVuY2hDb25maWddKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBQcm9jZXNzUHJvcGVydHlUeXBlLlNoZWxsVHlwZTpcblx0XHRcdFx0XHR0aGlzLl9oYW5kbGVTaGVsbFR5cGVDaGFuZ2UodmFsdWUgYXMgSVByb2Nlc3NQcm9wZXJ0eU1hcFtQcm9jZXNzUHJvcGVydHlUeXBlLlNoZWxsVHlwZV0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFByb2Nlc3NQcm9wZXJ0eVR5cGUuSGFzQ2hpbGRQcm9jZXNzZXM6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3Nlcy5maXJlKHZhbHVlIGFzIElQcm9jZXNzUHJvcGVydHlNYXBbUHJvY2Vzc1Byb3BlcnR5VHlwZS5IYXNDaGlsZFByb2Nlc3Nlc10pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFByb2Nlc3NQcm9wZXJ0eVR5cGUuVXNlZFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb246XG5cdFx0XHRcdFx0dGhpcy5fdXNlZFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24gPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFByb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb246XG5cdFx0XHRcdFx0dGhpcy5fc2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkluZm8gPSB2YWx1ZSBhcyBJUHJvY2Vzc1Byb3BlcnR5TWFwW1Byb2Nlc3NQcm9wZXJ0eVR5cGUuU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbkZhaWx1cmVSZWFzb25dO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2luaXRpYWxEYXRhRXZlbnRzTGlzdGVuZXIudmFsdWUgPSBwcm9jZXNzTWFuYWdlci5vblByb2Nlc3NEYXRhKGV2ID0+IHRoaXMuX2luaXRpYWxEYXRhRXZlbnRzPy5wdXNoKGV2LmRhdGEpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihwcm9jZXNzTWFuYWdlci5vblByb2Nlc3NSZXBsYXlDb21wbGV0ZSgoKSA9PiB0aGlzLl9vblByb2Nlc3NSZXBsYXlDb21wbGV0ZS5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihwcm9jZXNzTWFuYWdlci5vbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlZChlID0+IHRoaXMuX29uRW52aXJvbm1lbnRWYXJpYWJsZUluZm9DaGFuZ2VkKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocHJvY2Vzc01hbmFnZXIub25QdHlEaXNjb25uZWN0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnh0ZXJtKSB7XG5cdFx0XHRcdHRoaXMueHRlcm0ucmF3Lm9wdGlvbnMuZGlzYWJsZVN0ZGluID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc3RhdHVzTGlzdC5hZGQoe1xuXHRcdFx0XHRpZDogVGVybWluYWxTdGF0dXMuRGlzY29ubmVjdGVkLFxuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdGljb246IENvZGljb24uZGVidWdEaXNjb25uZWN0LFxuXHRcdFx0XHR0b29sdGlwOiBubHMubG9jYWxpemUoJ2Rpc2Nvbm5lY3RTdGF0dXMnLCBcIkxvc3QgY29ubmVjdGlvbiB0byBwcm9jZXNzXCIpXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocHJvY2Vzc01hbmFnZXIub25QdHlSZWNvbm5lY3QoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMueHRlcm0pIHtcblx0XHRcdFx0dGhpcy54dGVybS5yYXcub3B0aW9ucy5kaXNhYmxlU3RkaW4gPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc3RhdHVzTGlzdC5yZW1vdmUoVGVybWluYWxTdGF0dXMuRGlzY29ubmVjdGVkKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcHJvY2Vzc01hbmFnZXI7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVQcm9jZXNzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdHJ1c3RlZCA9IGF3YWl0IHRoaXMuX3RydXN0KCk7XG5cdFx0Ly8gQWxsb3cgcmVtb3RlIHRlcm1pbmFscyBpbiBhIHJlbW90ZSB3b3Jrc3BhY2UgdG8gYmUgY3JlYXRlZCB3aGVuIHRydXN0IGlzIGRlbmllZCwgYnV0XG5cdFx0Ly8gc3RpbGwgYmxvY2sgbG9jYWwgdGVybWluYWxzICh0aG9zZSB3aXRob3V0IGEgcmVtb3RlQXV0aG9yaXR5KSBldmVuIHdoZW4gdGhlIHdvcmtzcGFjZSBpcyByZW1vdGUuXG5cdFx0Y29uc3QgaXNSZW1vdGVUZXJtaW5hbCA9ICEhdGhpcy5yZW1vdGVBdXRob3JpdHk7XG5cdFx0aWYgKCF0cnVzdGVkICYmICEoaXNSZW1vdGVUZXJtaW5hbCAmJiB0aGlzLl93b3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSkge1xuXHRcdFx0dGhpcy5fb25Qcm9jZXNzRXhpdCh7IG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlTm90VHJ1c3RlZENyZWF0ZVRlcm1pbmFsJywgXCJDYW5ub3QgbGF1bmNoIGEgdGVybWluYWwgcHJvY2VzcyBpbiBhbiB1bnRydXN0ZWQgd29ya3NwYWNlXCIpIH0pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGggPT09IDAgJiYgdGhpcy5fY3dkICYmIHRoaXMuX3VzZXJIb21lICYmIG5vcm1hbGl6ZURyaXZlTGV0dGVyKHRoaXMuX2N3ZCkgIT09IG5vcm1hbGl6ZURyaXZlTGV0dGVyKHRoaXMuX3VzZXJIb21lKSkge1xuXHRcdFx0Ly8gc29tZXRoaW5nIHN0cmFuZ2UgaXMgZ29pbmcgb24gaWYgY3dkIGlzIG5vdCB1c2VySG9tZSBpbiBhbiBlbXB0eSB3b3Jrc3BhY2Vcblx0XHRcdHRoaXMuX29uUHJvY2Vzc0V4aXQoe1xuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZUVtcHR5Q3JlYXRlVGVybWluYWxDd2QnLCBcIkNhbm5vdCBsYXVuY2ggYSB0ZXJtaW5hbCBwcm9jZXNzIGluIGFuIGVtcHR5IHdvcmtzcGFjZSB3aXRoIGN3ZCB7MH0gZGlmZmVyZW50IGZyb20gdXNlckhvbWUgezF9XCIsIHRoaXMuX2N3ZCwgdGhpcy5fdXNlckhvbWUpXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Ly8gUmUtZXZhbHVhdGUgZGltZW5zaW9ucyBpZiB0aGUgY29udGFpbmVyIGhhcyBiZWVuIHNldCBzaW5jZSB0aGUgeHRlcm0gaW5zdGFuY2Ugd2FzIGNyZWF0ZWRcblx0XHRpZiAodGhpcy5fY29udGFpbmVyICYmIHRoaXMuX2NvbHMgPT09IDAgJiYgdGhpcy5fcm93cyA9PT0gMCkge1xuXHRcdFx0dGhpcy5faW5pdERpbWVuc2lvbnMoKTtcblx0XHRcdHRoaXMueHRlcm0/LnJlc2l6ZSh0aGlzLl9jb2xzIHx8IENvbnN0YW50cy5EZWZhdWx0Q29scywgdGhpcy5fcm93cyB8fCBDb25zdGFudHMuRGVmYXVsdFJvd3MpO1xuXHRcdH1cblx0XHRjb25zdCBvcmlnaW5hbEljb24gPSB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmljb247XG5cdFx0YXdhaXQgdGhpcy5fcHJvY2Vzc01hbmFnZXIuY3JlYXRlUHJvY2Vzcyh0aGlzLl9zaGVsbExhdW5jaENvbmZpZywgdGhpcy5fY29scyB8fCBDb25zdGFudHMuRGVmYXVsdENvbHMsIHRoaXMuX3Jvd3MgfHwgQ29uc3RhbnRzLkRlZmF1bHRSb3dzKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGlmIChoYXNLZXkocmVzdWx0LCB7IG1lc3NhZ2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHR0aGlzLl9vblByb2Nlc3NFeGl0KHJlc3VsdCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzS2V5KHJlc3VsdCwgeyBpbmplY3RlZEFyZ3M6IHRydWUgfSkpIHtcblx0XHRcdFx0XHR0aGlzLl9pbmplY3RlZEFyZ3MgPSByZXN1bHQuaW5qZWN0ZWRBcmdzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAob3JpZ2luYWxJY29uICE9PSB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmljb24gfHwgdGhpcy5zaGVsbExhdW5jaENvbmZpZy5jb2xvcikge1xuXHRcdFx0dGhpcy5faWNvbiA9IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzPy5pY29uIHx8IHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmljb247XG5cdFx0XHR0aGlzLl9vbkljb25DaGFuZ2VkLmZpcmUoeyBpbnN0YW5jZTogdGhpcywgdXNlckluaXRpYXRlZDogZmFsc2UgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyTWFya2VyKG9mZnNldD86IG51bWJlcik6IElNYXJrZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnh0ZXJtPy5yYXcucmVnaXN0ZXJNYXJrZXIob2Zmc2V0KTtcblx0fVxuXG5cdHB1YmxpYyBhZGRCdWZmZXJNYXJrZXIocHJvcGVydGllczogSU1hcmtQcm9wZXJ0aWVzKTogdm9pZCB7XG5cdFx0dGhpcy5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKT8uYWRkTWFyayhwcm9wZXJ0aWVzKTtcblx0fVxuXG5cdHB1YmxpYyBzY3JvbGxUb01hcmsoc3RhcnRNYXJrSWQ6IHN0cmluZywgZW5kTWFya0lkPzogc3RyaW5nLCBoaWdobGlnaHQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy54dGVybT8ubWFya1RyYWNrZXIuc2Nyb2xsVG9DbG9zZXN0TWFya2VyKHN0YXJ0TWFya0lkLCBlbmRNYXJrSWQsIGhpZ2hsaWdodCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZnJlZVBvcnRLaWxsUHJvY2Vzcyhwb3J0OiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyPy5mcmVlUG9ydEtpbGxQcm9jZXNzKHBvcnQpO1xuXHRcdHRoaXMucnVuQ29tbWFuZChjb21tYW5kLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF9vblByb2Nlc3NEYXRhKGV2OiBJUHJvY2Vzc0RhdGFFdmVudCk6IHZvaWQge1xuXHRcdC8vIEVuc3VyZSBldmVudHMgYXJlIHNwbGl0IGJ5IFNJIGNvbW1hbmQgZXhlY3V0ZSBhbmQgY29tbWFuZCBmaW5pc2hlZCBzZXF1ZW5jZSB0byBlbnN1cmUgdGhlXG5cdFx0Ly8gb3V0cHV0IG9mIHRoZSBjb21tYW5kIGNhbiBiZSByZWFkIGJ5IGV4dGVuc2lvbnMgYW5kIHRoZSBvdXRwdXQgb2YgdGhlIGNvbW1hbmQgaXMgb2YgYVxuXHRcdC8vIGNvbnNpc3RlbnQgZm9ybSByZXNwZWN0aXZlbHkuIFRoaXMgbXVzdCBiZSBkb25lIGhlcmUgYXMgeHRlcm0uanMgZG9lcyBub3QgY3VycmVudGx5IGhhdmVcblx0XHQvLyBhIGxpc3RlbmVyIGZvciB3aGVuIGluZGl2aWR1YWwgZGF0YSBldmVudHMgYXJlIHBhcnNlZCwgb25seSBgb25Xcml0ZVBhcnNlZGAgd2hpY2ggZmlyZXNcblx0XHQvLyB3aGVuIHRoZSB3cml0ZSBidWZmZXIgaXMgZmx1c2hlZC5cblx0XHRjb25zdCBsZWFkaW5nU2VnbWVudGVkRGF0YTogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBtYXRjaGVzID0gZXYuZGF0YS5tYXRjaEFsbCgvKD88c2VxPlxceDFiXFxdWzE2XTMzOyg/OkN8RCg/OjtcXGQrKT8pXFx4MDcpL2cpO1xuXHRcdGxldCBpID0gMDtcblx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRcdGlmIChtYXRjaC5ncm91cHM/LnNlcSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ3NlcSBtdXN0IGJlIGRlZmluZWQnKTtcblx0XHRcdH1cblx0XHRcdGxlYWRpbmdTZWdtZW50ZWREYXRhLnB1c2goZXYuZGF0YS5zdWJzdHJpbmcoaSwgbWF0Y2guaW5kZXgpKTtcblx0XHRcdGxlYWRpbmdTZWdtZW50ZWREYXRhLnB1c2gobWF0Y2guZ3JvdXBzPy5zZXEgPz8gJycpO1xuXHRcdFx0aSA9IG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0RGF0YSA9IGV2LmRhdGEuc3Vic3RyaW5nKGkpO1xuXG5cdFx0Ly8gV3JpdGUgYWxsIGxlYWRpbmcgc2VnbWVudGVkIGRhdGEgZmlyc3QsIGZvbGxvd2VkIGJ5IHRoZSBsYXN0IGRhdGEsIHRyYWNraW5nIGNvbW1pdCBpZlxuXHRcdC8vIG5lY2Vzc2FyeVxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVhZGluZ1NlZ21lbnRlZERhdGEubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX3dyaXRlUHJvY2Vzc0RhdGEobGVhZGluZ1NlZ21lbnRlZERhdGFbaV0pO1xuXHRcdH1cblx0XHRpZiAoZXYudHJhY2tDb21taXQpIHtcblx0XHRcdGV2LndyaXRlUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gdGhpcy5fd3JpdGVQcm9jZXNzRGF0YShsYXN0RGF0YSwgcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93cml0ZVByb2Nlc3NEYXRhKGxhc3REYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF93cml0ZVByb2Nlc3NEYXRhKGRhdGE6IHN0cmluZywgY2I/OiAoKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy5fb25XaWxsRGF0YS5maXJlKGRhdGEpO1xuXHRcdGNvbnN0IG1lc3NhZ2VJZCA9ICsrdGhpcy5fbGF0ZXN0WHRlcm1Xcml0ZURhdGE7XG5cdFx0dGhpcy54dGVybT8ucmF3LndyaXRlKGRhdGEsICgpID0+IHtcblx0XHRcdHRoaXMuX2xhdGVzdFh0ZXJtUGFyc2VEYXRhID0gbWVzc2FnZUlkO1xuXHRcdFx0dGhpcy5fcHJvY2Vzc01hbmFnZXIuYWNrbm93bGVkZ2VEYXRhRXZlbnQoZGF0YS5sZW5ndGgpO1xuXHRcdFx0Y2I/LigpO1xuXHRcdFx0dGhpcy5fb25EYXRhLmZpcmUoZGF0YSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gZWl0aGVyIGEgcHJvY2VzcyB0aWVkIHRvIGEgdGVybWluYWwgaGFzIGV4aXRlZCBvciB3aGVuIGEgdGVybWluYWwgcmVuZGVyZXJcblx0ICogc2ltdWxhdGVzIGEgcHJvY2VzcyBleGl0aW5nIChlLmcuIGN1c3RvbSBleGVjdXRpb24gdGFzaykuXG5cdCAqIEBwYXJhbSBleGl0Q29kZSBUaGUgZXhpdCBjb2RlIG9mIHRoZSBwcm9jZXNzLCB0aGlzIGlzIHVuZGVmaW5lZCB3aGVuIHRoZSB0ZXJtaW5hbCB3YXMgZXhpdGVkXG5cdCAqIHRocm91Z2ggdXNlciBhY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9vblByb2Nlc3NFeGl0KGV4aXRDb2RlT3JFcnJvcj86IG51bWJlciB8IElUZXJtaW5hbExhdW5jaEVycm9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUHJldmVudCBkaXNwb3NlIGZ1bmN0aW9ucyBiZWluZyB0cmlnZ2VyZWQgbXVsdGlwbGUgdGltZXNcblx0XHRpZiAodGhpcy5faXNFeGl0aW5nIHx8IHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWRFeGl0UmVzdWx0ID0gcGFyc2VFeGl0UmVzdWx0KGV4aXRDb2RlT3JFcnJvciwgdGhpcy5zaGVsbExhdW5jaENvbmZpZywgdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1N0YXRlLCB0aGlzLl9pbml0aWFsQ3dkKTtcblxuXHRcdGlmICh0aGlzLl91c2VkU2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbiAmJiB0aGlzLl9wcm9jZXNzTWFuYWdlci5wcm9jZXNzU3RhdGUgPT09IFByb2Nlc3NTdGF0ZS5LaWxsZWREdXJpbmdMYXVuY2ggJiYgcGFyc2VkRXhpdFJlc3VsdD8uY29kZSAhPT0gMCkge1xuXHRcdFx0dGhpcy5fcmVsYXVuY2hXaXRoU2hlbGxJbnRlZ3JhdGlvbkRpc2FibGVkKHBhcnNlZEV4aXRSZXN1bHQ/Lm1lc3NhZ2UpO1xuXHRcdFx0dGhpcy5fb25FeGl0LmZpcmUoZXhpdENvZGVPckVycm9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0V4aXRpbmcgPSB0cnVlO1xuXG5cdFx0YXdhaXQgdGhpcy5fZmx1c2hYdGVybURhdGEoKTtcblxuXHRcdHRoaXMuX2V4aXRDb2RlID0gcGFyc2VkRXhpdFJlc3VsdD8uY29kZTtcblx0XHRjb25zdCBleGl0TWVzc2FnZSA9IHBhcnNlZEV4aXRSZXN1bHQ/Lm1lc3NhZ2U7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdUZXJtaW5hbCBwcm9jZXNzIGV4aXQnLCAnaW5zdGFuY2VJZCcsIHRoaXMuaW5zdGFuY2VJZCwgJ2NvZGUnLCB0aGlzLl9leGl0Q29kZSwgJ3Byb2Nlc3NTdGF0ZScsIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnByb2Nlc3NTdGF0ZSk7XG5cblx0XHQvLyBGaXJlIG9uRXhpdCBCRUZPUkUgcnVubmluZyBhbnkgZGlzcG9zaXRpb24gbG9naWMgKGluIHBhcnRpY3VsYXIgYmVmb3JlXG5cdFx0Ly8gYGRpc3Bvc2UoKWAgYmVsb3csIHdoaWNoIGZpcmVzIGBvbkRpc3Bvc2VkYCkuIENvbnN1bWVycyByYWNpbmdcblx0XHQvLyBgb25FeGl0YCBhZ2FpbnN0IGBvbkRpc3Bvc2VkYCAoZS5nLiB0aGUgY2hhdCBhZ2VudCBydW4taW4tdGVybWluYWxcblx0XHQvLyBleGVjdXRlIHN0cmF0ZWdpZXMpIG5lZWQgdG8gc2VlIHRoZSBleGl0IGNvZGUgZXZlbnQgZmlyc3Qgc28gdGhleSBjYW5cblx0XHQvLyByZXR1cm4gdGhlIGNhcHR1cmVkIGV4aXQgY29kZS4gT3RoZXJ3aXNlIGBvbkRpc3Bvc2VkYCB3aW5zIHRoZSByYWNlXG5cdFx0Ly8gYW5kIHRoZSBzdHJhdGVneSB0cmVhdHMgdGhlIGV4aXQgYXMgdGhlIHRlcm1pbmFsIGhhdmluZyBiZWVuIGNsb3NlZFxuXHRcdC8vIHdpdGhvdXQgYW4gZXhpdCBjb2RlLCBsZWF2aW5nIGNvbW1hbmRzIGxpa2UgYGV4aXQgNDJgIHN0dWNrIGluIGFcblx0XHQvLyBcIlJ1bm5pbmdcIiBzdGF0ZS5cblx0XHR0aGlzLl9vbkV4aXQuZmlyZShleGl0Q29kZU9yRXJyb3IpO1xuXG5cdFx0Ly8gQmFpbCBpZiBkaXNwb3NlZCBkdXJpbmcgZmx1c2g7IHRoZSB3b3JrIGJlbG93IHdvdWxkIHRvdWNoIGRpc3Bvc2VkIHNlcnZpY2VzLlxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHRyaWdnZXIgd2FpdCBvbiBleGl0IHdoZW4gdGhlIGV4aXQgd2FzICpub3QqIHRyaWdnZXJlZCBieSB0aGVcblx0XHQvLyB1c2VyICh2aWEgdGhlIGB3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmtpbGxgIGNvbW1hbmQpLlxuXHRcdGNvbnN0IHdhaXRPbkV4aXQgPSB0aGlzLndhaXRPbkV4aXQ7XG5cdFx0aWYgKHdhaXRPbkV4aXQgJiYgdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1N0YXRlICE9PSBQcm9jZXNzU3RhdGUuS2lsbGVkQnlVc2VyKSB7XG5cdFx0XHR0aGlzLl94dGVybVJlYWR5UHJvbWlzZS50aGVuKHh0ZXJtID0+IHtcblx0XHRcdFx0aWYgKCF4dGVybSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXhpdE1lc3NhZ2UpIHtcblx0XHRcdFx0XHR4dGVybS5yYXcud3JpdGUoZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsKGV4aXRNZXNzYWdlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dpdGNoICh0eXBlb2Ygd2FpdE9uRXhpdCkge1xuXHRcdFx0XHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRcdFx0XHR4dGVybS5yYXcud3JpdGUoZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsKHdhaXRPbkV4aXQsIHsgZXhjbHVkZUxlYWRpbmdOZXdMaW5lOiB0cnVlIH0pKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2Z1bmN0aW9uJzpcblx0XHRcdFx0XHRcdGlmICh0aGlzLmV4aXRDb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0eHRlcm0ucmF3LndyaXRlKGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbCh3YWl0T25FeGl0KHRoaXMuZXhpdENvZGUpLCB7IGV4Y2x1ZGVMZWFkaW5nTmV3TGluZTogdHJ1ZSB9KSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBEaXNhYmxlIGFsbCBpbnB1dCBpZiB0aGUgdGVybWluYWwgaXMgZXhpdGluZyBhbmQgbGlzdGVuIGZvciBuZXh0IGtleXByZXNzXG5cdFx0XHRcdHh0ZXJtLnJhdy5vcHRpb25zLmRpc2FibGVTdGRpbiA9IHRydWU7XG5cdFx0XHRcdGlmICh4dGVybS5yYXcudGV4dGFyZWEpIHtcblx0XHRcdFx0XHR0aGlzLl9hdHRhY2hQcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lcih4dGVybS5yYXcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGV4aXRNZXNzYWdlKSB7XG5cdFx0XHRcdGNvbnN0IGZhaWxlZER1cmluZ0xhdW5jaCA9IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnByb2Nlc3NTdGF0ZSA9PT0gUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaDtcblx0XHRcdFx0aWYgKGZhaWxlZER1cmluZ0xhdW5jaCB8fCAodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuc2hvd0V4aXRBbGVydCAmJiB0aGlzLnh0ZXJtPy5sYXN0SW5wdXRFdmVudCAhPT0gLypDdHJsK0QqLydcXHgwNCcpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXhpdE1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0XHRhY3Rpb25zOiB7IHByaW1hcnk6IFt0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExhdW5jaEhlbHBBY3Rpb24pXSB9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gTG9nIHRvIGhlbHAgc3VyZmFjZSB0aGUgZXJyb3IgaW4gY2FzZSB1c2VycyByZXBvcnQgaXNzdWVzIHdpdGggc2hvd0V4aXRBbGVydFxuXHRcdFx0XHRcdC8vIGRpc2FibGVkXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGV4aXRNZXNzYWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5kaXNwb3NlKFRlcm1pbmFsRXhpdFJlYXNvbi5Qcm9jZXNzKTtcblx0XHR9XG5cblx0XHQvLyBEaXNwb3NlIG9mIHRoZSBvbkV4aXQgZXZlbnQgaWYgdGhlIHRlcm1pbmFsIHdpbGwgbm90IGJlIHJldXNlZCBhZ2FpblxuXHRcdGlmICh0aGlzLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX29uRXhpdC5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVsYXVuY2hXaXRoU2hlbGxJbnRlZ3JhdGlvbkRpc2FibGVkKGV4aXRNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pZ25vcmVTaGVsbEludGVncmF0aW9uID0gdHJ1ZTtcblx0XHR0aGlzLnJlbGF1bmNoKCk7XG5cdFx0dGhpcy5zdGF0dXNMaXN0LmFkZCh7XG5cdFx0XHRpZDogVGVybWluYWxTdGF0dXMuU2hlbGxJbnRlZ3JhdGlvbkF0dGVudGlvbk5lZWRlZCxcblx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0aWNvbjogQ29kaWNvbi53YXJuaW5nLFxuXHRcdFx0dG9vbHRpcDogYCR7ZXhpdE1lc3NhZ2V9IGAgKyBubHMubG9jYWxpemUoJ2xhdW5jaEZhaWxlZC5leGl0Q29kZU9ubHlTaGVsbEludGVncmF0aW9uJywgJ0Rpc2FibGluZyBzaGVsbCBpbnRlZ3JhdGlvbiBpbiB1c2VyIHNldHRpbmdzIG1pZ2h0IGhlbHAuJyksXG5cdFx0XHRob3ZlckFjdGlvbnM6IFt7XG5cdFx0XHRcdGNvbW1hbmRJZDogVGVybWluYWxDb21tYW5kSWQuU2hlbGxJbnRlZ3JhdGlvbkxlYXJuTW9yZSxcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc2hlbGxJbnRlZ3JhdGlvbi5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmUgYWJvdXQgc2hlbGwgaW50ZWdyYXRpb25cIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbignaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy90ZXJtaW5hbC9zaGVsbC1pbnRlZ3JhdGlvbj9yZWZlcnJlcj1pbi1wcm9kdWN0Jyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tbWFuZElkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLFxuXHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdzaGVsbEludGVncmF0aW9uLm9wZW5TZXR0aW5ncycsIFwiT3BlbiB1c2VyIHNldHRpbmdzXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCAndGVybWluYWwuaW50ZWdyYXRlZC5zaGVsbEludGVncmF0aW9uLmVuYWJsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fV1cblx0XHR9KTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8e30sIHsgb3duZXI6ICdtZWdhbnJvZ2dlJzsgY29tbWVudDogJ0luZGljYXRlcyB0aGUgcHJvY2VzcyBleGl0ZWQgd2hlbiBjcmVhdGVkIHdpdGggc2hlbGwgaW50ZWdyYXRpb24gYXJncycgfT4oJ3Rlcm1pbmFsL3NoZWxsSW50ZWdyYXRpb25GYWlsdXJlUHJvY2Vzc0V4aXQnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmUgd3JpdGUgY2FsbHMgdG8geHRlcm0uanMgaGF2ZSBmaW5pc2hlZCBiZWZvcmUgcmVzb2x2aW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmx1c2hYdGVybURhdGEoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2xhdGVzdFh0ZXJtV3JpdGVEYXRhID09PSB0aGlzLl9sYXRlc3RYdGVybVBhcnNlRGF0YSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRsZXQgcmV0cmllcyA9IDA7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0Y29uc3QgaW50ZXJ2YWwgPSBkb20uZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKGRvbS5nZXRBY3RpdmVXaW5kb3coKS53aW5kb3csICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2xhdGVzdFh0ZXJtV3JpdGVEYXRhID09PSB0aGlzLl9sYXRlc3RYdGVybVBhcnNlRGF0YSB8fCArK3JldHJpZXMgPT09IDUpIHtcblx0XHRcdFx0XHRpbnRlcnZhbC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAyMCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9hdHRhY2hQcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lcih4dGVybTogWFRlcm1UZXJtaW5hbCkge1xuXHRcdGlmICh4dGVybS50ZXh0YXJlYSAmJiAhdGhpcy5fcHJlc3NBbnlLZXlUb0Nsb3NlTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMuX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyID0gZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih4dGVybS50ZXh0YXJlYSwgJ2tleXByZXNzJywgKGV2ZW50OiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9wcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lcikge1xuXHRcdFx0XHRcdHRoaXMuX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9wcmVzc0FueUtleVRvQ2xvc2VMaXN0ZW5lciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR0aGlzLmRpc3Bvc2UoVGVybWluYWxFeGl0UmVhc29uLlByb2Nlc3MpO1xuXHRcdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlSW5pdGlhbFRleHQoeHRlcm06IFh0ZXJtVGVybWluYWwsIGNhbGxiYWNrPzogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQpIHtcblx0XHRcdGNhbGxiYWNrPy4oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IGlzU3RyaW5nKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0KVxuXHRcdFx0PyB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dFxuXHRcdFx0OiB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dD8udGV4dDtcblx0XHRpZiAoaXNTdHJpbmcodGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQpKSB7XG5cdFx0XHR4dGVybS5yYXcud3JpdGVsbih0ZXh0LCBjYWxsYmFjayk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dC50cmFpbGluZ05ld0xpbmUpIHtcblx0XHRcdFx0eHRlcm0ucmF3LndyaXRlbG4odGV4dCwgY2FsbGJhY2spO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0eHRlcm0ucmF3LndyaXRlKHRleHQsIGNhbGxiYWNrKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXVzZVRlcm1pbmFsKHNoZWxsOiBJU2hlbGxMYXVuY2hDb25maWcsIHJlc2V0OiBib29sZWFuID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBVbnN1YnNjcmliZSBhbnkga2V5IGxpc3RlbmVyIHdlIG1heSBoYXZlLlxuXHRcdHRoaXMuX3ByZXNzQW55S2V5VG9DbG9zZUxpc3RlbmVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcHJlc3NBbnlLZXlUb0Nsb3NlTGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCB4dGVybSA9IHRoaXMueHRlcm07XG5cdFx0aWYgKHh0ZXJtKSB7XG5cdFx0XHRpZiAoIXJlc2V0KSB7XG5cdFx0XHRcdC8vIEVuc3VyZSBuZXcgcHJvY2Vzc2VzJyBvdXRwdXQgc3RhcnRzIGF0IHN0YXJ0IG9mIG5ldyBsaW5lXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4geHRlcm0ucmF3LndyaXRlKCdcXG5cXHgxYltHJywgcikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcmludCBpbml0aWFsVGV4dCBpZiBzcGVjaWZpZWRcblx0XHRcdGlmIChzaGVsbC5pbml0aWFsVGV4dCkge1xuXHRcdFx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA9IHNoZWxsLmluaXRpYWxUZXh0O1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHRoaXMuX3dyaXRlSW5pdGlhbFRleHQoeHRlcm0sIHIpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2xlYW4gdXAgd2FpdE9uRXhpdCBzdGF0ZVxuXHRcdFx0aWYgKHRoaXMuX2lzRXhpdGluZyAmJiB0aGlzLl9zaGVsbExhdW5jaENvbmZpZy53YWl0T25FeGl0KSB7XG5cdFx0XHRcdHh0ZXJtLnJhdy5vcHRpb25zLmRpc2FibGVTdGRpbiA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9pc0V4aXRpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXNldCkge1xuXHRcdFx0XHR4dGVybS5jbGVhckRlY29yYXRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSB0aGUgZW52aXJvbm1lbnQgaW5mbyB3aWRnZXQgaWYgaXQgZXhpc3RzXG5cdFx0dGhpcy5zdGF0dXNMaXN0LnJlbW92ZShUZXJtaW5hbFN0YXR1cy5SZWxhdW5jaE5lZWRlZCk7XG5cblx0XHRpZiAoIXJlc2V0KSB7XG5cdFx0XHQvLyBIQUNLOiBGb3JjZSBpbml0aWFsVGV4dCB0byBiZSBub24tZmFsc3kgZm9yIHJldXNlZCB0ZXJtaW5hbHMgc3VjaCB0aGF0IHRoZVxuXHRcdFx0Ly8gY29ucHR5SW5oZXJpdEN1cnNvciBmbGFnIGlzIHBhc3NlZCB0byB0aGUgbm9kZS1wdHksIHRoaXMgZmxhZyBjYW4gY2F1c2UgYSBXaW5kb3cgdG8gc3RvcFxuXHRcdFx0Ly8gcmVzcG9uZGluZyBpbiBXaW5kb3dzIDEwIDE5MDMgc28gd2Ugb25seSB3YW50IHRvIHVzZSBpdCB3aGVuIHNvbWV0aGluZyBpcyBkZWZpbml0ZWx5IHdyaXR0ZW5cblx0XHRcdC8vIHRvIHRoZSB0ZXJtaW5hbC5cblx0XHRcdHNoZWxsLmluaXRpYWxUZXh0ID0gJyAnO1xuXHRcdH1cblxuXHRcdC8vIFNldCB0aGUgbmV3IHNoZWxsIGxhdW5jaCBjb25maWdcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZyA9IHNoZWxsOyAvLyBNdXN0IGJlIGRvbmUgYmVmb3JlIGNhbGxpbmcgX2NyZWF0ZVByb2Nlc3MoKVxuXHRcdHRoaXMuX2FnZW50U2hlbGxUeXBlRnJvbVNlcXVlbmNlID0gdW5kZWZpbmVkO1xuXHRcdGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnJlbGF1bmNoKHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLCB0aGlzLl9jb2xzIHx8IENvbnN0YW50cy5EZWZhdWx0Q29scywgdGhpcy5fcm93cyB8fCBDb25zdGFudHMuRGVmYXVsdFJvd3MsIHJlc2V0KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGlmIChoYXNLZXkocmVzdWx0LCB7IG1lc3NhZ2U6IHRydWUgfSkpIHtcblx0XHRcdFx0XHR0aGlzLl9vblByb2Nlc3NFeGl0KHJlc3VsdCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzS2V5KHJlc3VsdCwgeyBpbmplY3RlZEFyZ3M6IHRydWUgfSkpIHtcblx0XHRcdFx0XHR0aGlzLl9pbmplY3RlZEFyZ3MgPSByZXN1bHQuaW5qZWN0ZWRBcmdzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRAZGVib3VuY2UoMTAwMClcblx0cmVsYXVuY2goKTogdm9pZCB7XG5cdFx0Ly8gQ2xlYXIgdGhlIGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzIGZsYWcgdG8gZW5zdXJlIHdlIGNyZWF0ZSBhIG5ldyBwcm9jZXNzXG5cdFx0Ly8gaW5zdGVhZCBvZiB0cnlpbmcgdG8gcmVhdHRhY2ggdG8gdGhlIGV4aXN0aW5nIG9uZSBkdXJpbmcgcmVsYXVuY2guXG5cdFx0Y29uc3Qgc2hlbGxMYXVuY2hDb25maWcgPSB7IC4uLnRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnIH07XG5cdFx0ZGVsZXRlIHNoZWxsTGF1bmNoQ29uZmlnLmF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzO1xuXG5cdFx0dGhpcy5yZXVzZVRlcm1pbmFsKHNoZWxsTGF1bmNoQ29uZmlnLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgX29uVGl0bGVDaGFuZ2UodGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzVGl0bGVTZXRCeVByb2Nlc3MpIHtcblx0XHRcdHRoaXMuX3NldFRpdGxlKHRpdGxlLCBUaXRsZUV2ZW50U291cmNlLlNlcXVlbmNlKTtcblx0XHR9XG5cdFx0Ly8gQWdlbnQgQ0xJcyBydW4gYXMgYG5vZGVgLCBzbyB0aGUgT1NDIHRpdGxlIGlzIG91ciBvbmx5IGNyb3NzLXBsYXRmb3JtIHNpZ25hbC5cblx0XHRmb3IgKGNvbnN0IFtzaGVsbFR5cGUsIHBhdHRlcm5dIG9mIGFnZW50Q2xpVGl0bGVQYXR0ZXJucykge1xuXHRcdFx0aWYgKHBhdHRlcm4udGVzdCh0aXRsZSkpIHtcblx0XHRcdFx0dGhpcy5fYWdlbnRTaGVsbFR5cGVGcm9tU2VxdWVuY2UgPSBzaGVsbFR5cGU7XG5cdFx0XHRcdHRoaXMuc2V0U2hlbGxUeXBlKHNoZWxsVHlwZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVNoZWxsVHlwZUNoYW5nZShzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gT25jZSBhbiBhZ2VudCBDTEkgaXMgbG9ja2VkIGluLCBpZ25vcmUgc3RhbGUgYG5vZGVgL3VuZGVmaW5lZCByZXBvcnRzIGZyb20gdGhlIHB0eVxuXHRcdC8vIHVudGlsIGEgcmVhbCBzaGVsbCB0YWtlcyBvdmVyIChtZWFuaW5nIHRoZSBhZ2VudCBleGl0ZWQpLlxuXHRcdGlmICh0aGlzLl9hZ2VudFNoZWxsVHlwZUZyb21TZXF1ZW5jZSkge1xuXHRcdFx0aWYgKHNoZWxsVHlwZSA9PT0gR2VuZXJhbFNoZWxsVHlwZS5Ob2RlIHx8IHNoZWxsVHlwZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FnZW50U2hlbGxUeXBlRnJvbVNlcXVlbmNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLnNldFNoZWxsVHlwZShzaGVsbFR5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJ1c3QoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLkFsbG93SW5VbnRydXN0ZWRXb3Jrc3BhY2UpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFdvcmtzcGFjZSB0cnVzdCBjaGVjayBieXBhc3NlZCBkdWUgdG8gJHtUZXJtaW5hbFNldHRpbmdJZC5BbGxvd0luVW50cnVzdGVkV29ya3NwYWNlfWApO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHRydXN0UmVxdWVzdCA9IGF3YWl0IHRoaXMuX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdFdvcmtzcGFjZVRydXN0KHtcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndGVybWluYWwucmVxdWVzdFRydXN0JywgXCJDcmVhdGluZyBhIHRlcm1pbmFsIHByb2Nlc3MgcmVxdWlyZXMgZXhlY3V0aW5nIGNvZGVcIilcblx0XHR9KTtcblx0XHRyZXR1cm4gdHJ1c3RSZXF1ZXN0ID09PSB0cnVlO1xuXHR9XG5cblx0QGRlYm91bmNlKDIwMDApXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVByb2Nlc3NDd2QoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCB8fCB0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIHJlc2V0IGN3ZCBpZiBpdCBoYXMgY2hhbmdlZCwgc28gZmlsZSBiYXNlZCB1cmwgcGF0aHMgY2FuIGJlIHJlc29sdmVkXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGN3ZCA9IGF3YWl0IHRoaXMuX3JlZnJlc2hQcm9wZXJ0eShQcm9jZXNzUHJvcGVydHlUeXBlLkN3ZCk7XG5cdFx0XHRpZiAoIWlzU3RyaW5nKGN3ZCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBjd2QgaXMgbm90IGEgc3RyaW5nICR7Y3dkfWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGU6IHVua25vd24pIHtcblx0XHRcdC8vIFN3YWxsb3cgdGhpcyBhcyBpdCBtZWFucyB0aGUgcHJvY2VzcyBoYXMgYmVlbiBraWxsZWRcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgRXJyb3IgJiYgZS5tZXNzYWdlID09PSAnQ2Fubm90IHJlZnJlc2ggcHJvcGVydHkgd2hlbiBwcm9jZXNzIGlzIG5vdCBzZXQnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRocm93IGU7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlQ29uZmlnKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZnJlc2hFbnZpcm9ubWVudFZhcmlhYmxlSW5mb1dpZGdldFN0YXRlKHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmVudmlyb25tZW50VmFyaWFibGVJbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVVuaWNvZGVWZXJzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnNldFVuaWNvZGVWZXJzaW9uKHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnVuaWNvZGVWZXJzaW9uKTtcblx0fVxuXG5cdHVwZGF0ZUFjY2Vzc2liaWxpdHlTdXBwb3J0KCk6IHZvaWQge1xuXHRcdHRoaXMueHRlcm0hLnJhdy5vcHRpb25zLnNjcmVlblJlYWRlck1vZGUgPSB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogZG9tLkRpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb25zID0gZGltZW5zaW9uO1xuXHRcdGlmICh0aGlzLmRpc2FibGVMYXlvdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBsYXlvdXQgaWYgZGltZW5zaW9ucyBhcmUgaW52YWxpZCAoZWcuIHRoZSBjb250YWluZXIgaXMgbm90IGF0dGFjaGVkIHRvIHRoZSBET00gb3Jcblx0XHQvLyBpZiBkaXNwbGF5OiBub25lXG5cdFx0aWYgKGRpbWVuc2lvbi53aWR0aCA8PSAwIHx8IGRpbWVuc2lvbi5oZWlnaHQgPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEV2YWx1YXRlIGNvbHVtbnMgYW5kIHJvd3MsIGV4Y2x1ZGUgdGhlIHdyYXBwZXIgZWxlbWVudCdzIG1hcmdpblxuXHRcdGNvbnN0IHRlcm1pbmFsV2lkdGggPSB0aGlzLl9ldmFsdWF0ZUNvbHNBbmRSb3dzKGRpbWVuc2lvbi53aWR0aCwgZGltZW5zaW9uLmhlaWdodCk7XG5cdFx0aWYgKCF0ZXJtaW5hbFdpZHRoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVzaXplKCk7XG5cblx0XHQvLyBTaWduYWwgdGhlIGNvbnRhaW5lciBpcyByZWFkeVxuXHRcdGlmICghdGhpcy5fY29udGFpbmVyUmVhZHlCYXJyaWVyLmlzT3BlbigpKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXJSZWFkeUJhcnJpZXIub3BlbigpO1xuXHRcdH1cblxuXHRcdC8vIExheW91dCBhbGwgY29udHJpYnV0aW9uc1xuXHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmICghdGhpcy54dGVybSkge1xuXHRcdFx0XHR0aGlzLl94dGVybVJlYWR5UHJvbWlzZS50aGVuKHh0ZXJtID0+IHtcblx0XHRcdFx0XHRpZiAoeHRlcm0pIHtcblx0XHRcdFx0XHRcdGNvbnRyaWJ1dGlvbi5sYXlvdXQ/Lih4dGVybSwgZGltZW5zaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udHJpYnV0aW9uLmxheW91dD8uKHRoaXMueHRlcm0sIGRpbWVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzaXplKGltbWVkaWF0ZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMueHRlcm0gfHwgIXRoaXMuX3Jlc2l6ZURlYm91bmNlciB8fCB0aGlzLmlzRGlzcG9zZWQgfHwgdGhpcy5faXNEaXNwb3NpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgY29scyA9IHRoaXMuY29scztcblx0XHRsZXQgcm93cyA9IHRoaXMucm93cztcblxuXHRcdC8vIE9ubHkgYXBwbHkgdGhlc2Ugc2V0dGluZ3Mgd2hlbiB0aGUgdGVybWluYWwgaXMgdmlzaWJsZSBzbyB0aGF0XG5cdFx0Ly8gdGhlIGNoYXJhY3RlcnMgYXJlIG1lYXN1cmVkIGNvcnJlY3RseS5cblx0XHRpZiAodGhpcy5faXNWaXNpYmxlICYmIHRoaXMuX2xheW91dFNldHRpbmdzQ2hhbmdlZCkge1xuXHRcdFx0Y29uc3QgZm9udCA9IHRoaXMueHRlcm0uZ2V0Rm9udCgpO1xuXHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWc7XG5cdFx0XHR0aGlzLnh0ZXJtLnJhdy5vcHRpb25zLmxldHRlclNwYWNpbmcgPSBmb250LmxldHRlclNwYWNpbmc7XG5cdFx0XHR0aGlzLnh0ZXJtLnJhdy5vcHRpb25zLmxpbmVIZWlnaHQgPSBmb250LmxpbmVIZWlnaHQ7XG5cdFx0XHR0aGlzLnh0ZXJtLnJhdy5vcHRpb25zLmZvbnRTaXplID0gZm9udC5mb250U2l6ZTtcblx0XHRcdHRoaXMueHRlcm0ucmF3Lm9wdGlvbnMuZm9udEZhbWlseSA9IGZvbnQuZm9udEZhbWlseTtcblx0XHRcdHRoaXMueHRlcm0ucmF3Lm9wdGlvbnMuZm9udFdlaWdodCA9IGNvbmZpZy5mb250V2VpZ2h0O1xuXHRcdFx0dGhpcy54dGVybS5yYXcub3B0aW9ucy5mb250V2VpZ2h0Qm9sZCA9IGNvbmZpZy5mb250V2VpZ2h0Qm9sZDtcblxuXHRcdFx0Ly8gQW55IG9mIHRoZSBhYm92ZSBzZXR0aW5nIGNoYW5nZXMgY291bGQgaGF2ZSBjaGFuZ2VkIHRoZSBkaW1lbnNpb25zIG9mIHRoZVxuXHRcdFx0Ly8gdGVybWluYWwsIHJlLWV2YWx1YXRlIG5vdy5cblx0XHRcdHRoaXMuX2luaXREaW1lbnNpb25zKCk7XG5cdFx0XHRjb2xzID0gdGhpcy5jb2xzO1xuXHRcdFx0cm93cyA9IHRoaXMucm93cztcblxuXHRcdFx0dGhpcy5fbGF5b3V0U2V0dGluZ3NDaGFuZ2VkID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTmFOKGNvbHMpIHx8IGlzTmFOKHJvd3MpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNvbHMgIT09IHRoaXMueHRlcm0ucmF3LmNvbHMgfHwgcm93cyAhPT0gdGhpcy54dGVybS5yYXcucm93cykge1xuXHRcdFx0aWYgKHRoaXMuX2ZpeGVkUm93cyB8fCB0aGlzLl9maXhlZENvbHMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlUHJvcGVydHkoUHJvY2Vzc1Byb3BlcnR5VHlwZS5GaXhlZERpbWVuc2lvbnMsIHsgY29sczogdGhpcy5fZml4ZWRDb2xzLCByb3dzOiB0aGlzLl9maXhlZFJvd3MgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpbWVuc2lvbnNDaGFuZ2VkLmZpcmUoKTtcblx0XHR9XG5cblx0XHRUZXJtaW5hbEluc3RhbmNlLl9sYXN0S25vd25HcmlkRGltZW5zaW9ucyA9IHsgY29scywgcm93cyB9O1xuXHRcdHRoaXMuX3Jlc2l6ZURlYm91bmNlcj8ucmVzaXplKGNvbHMsIHJvd3MsIGltbWVkaWF0ZSA/PyBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVQdHlEaW1lbnNpb25zKHJhd1h0ZXJtOiBYVGVybVRlcm1pbmFsKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwaXhlbFdpZHRoID0gcmF3WHRlcm0uZGltZW5zaW9ucz8uY3NzLmNhbnZhcy53aWR0aDtcblx0XHRjb25zdCBwaXhlbEhlaWdodCA9IHJhd1h0ZXJtLmRpbWVuc2lvbnM/LmNzcy5jYW52YXMuaGVpZ2h0O1xuXHRcdGNvbnN0IHJvdW5kZWRQaXhlbFdpZHRoID0gcGl4ZWxXaWR0aCA/IE1hdGgucm91bmQocGl4ZWxXaWR0aCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgcm91bmRlZFBpeGVsSGVpZ2h0ID0gcGl4ZWxIZWlnaHQgPyBNYXRoLnJvdW5kKHBpeGVsSGVpZ2h0KSA6IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLl9wcm9jZXNzTWFuYWdlci5zZXREaW1lbnNpb25zKHJhd1h0ZXJtLmNvbHMsIHJhd1h0ZXJtLnJvd3MsIHVuZGVmaW5lZCwgcm91bmRlZFBpeGVsV2lkdGgsIHJvdW5kZWRQaXhlbEhlaWdodCk7XG5cdH1cblxuXHRzZXRTaGVsbFR5cGUoc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9zaGVsbFR5cGUgPT09IHNoZWxsVHlwZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zaGVsbFR5cGUgPSBzaGVsbFR5cGU7XG5cdFx0aWYgKHNoZWxsVHlwZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNoZWxsVHlwZUNvbnRleHRLZXkucmVzZXQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdGVybWluYWxTaGVsbFR5cGVDb250ZXh0S2V5LnNldChzaGVsbFR5cGU/LnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZVNoZWxsVHlwZS5maXJlKHNoZWxsVHlwZSk7XG5cdFx0dGhpcy5fbGFiZWxDb21wdXRlcj8ucmVmcmVzaExhYmVsKHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0QXJpYUxhYmVsKHh0ZXJtOiBYVGVybVRlcm1pbmFsIHwgdW5kZWZpbmVkLCB0ZXJtaW5hbElkOiBudW1iZXIsIHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBsYWJlbFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmICh4dGVybSAmJiB4dGVybS50ZXh0YXJlYSkge1xuXHRcdFx0aWYgKHRpdGxlICYmIHRpdGxlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0bGFiZWxQYXJ0cy5wdXNoKG5scy5sb2NhbGl6ZSgndGVybWluYWxUZXh0Qm94QXJpYUxhYmVsTnVtYmVyQW5kVGl0bGUnLCBcIlRlcm1pbmFsIHswfSwgezF9XCIsIHRlcm1pbmFsSWQsIHRpdGxlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbFBhcnRzLnB1c2gobmxzLmxvY2FsaXplKCd0ZXJtaW5hbFRleHRCb3hBcmlhTGFiZWwnLCBcIlRlcm1pbmFsIHswfVwiLCB0ZXJtaW5hbElkKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzY3JlZW5SZWFkZXJPcHRpbWl6ZWQgPSB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpO1xuXHRcdFx0aWYgKCFzY3JlZW5SZWFkZXJPcHRpbWl6ZWQpIHtcblx0XHRcdFx0bGFiZWxQYXJ0cy5wdXNoKG5scy5sb2NhbGl6ZSgndGVybWluYWxTY3JlZW5SZWFkZXJNb2RlJywgXCJSdW4gdGhlIGNvbW1hbmQ6IFRvZ2dsZSBTY3JlZW4gUmVhZGVyIEFjY2Vzc2liaWxpdHkgTW9kZSBmb3IgYW4gb3B0aW1pemVkIHNjcmVlbiByZWFkZXIgZXhwZXJpZW5jZVwiKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5SGVscEtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2Vzc2liaWxpdHlDb21tYW5kSWQuT3BlbkFjY2Vzc2liaWxpdHlIZWxwKT8uZ2V0TGFiZWwoKTtcblx0XHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlRlcm1pbmFsKSAmJiBhY2Nlc3NpYmlsaXR5SGVscEtleWJpbmRpbmcpIHtcblx0XHRcdFx0bGFiZWxQYXJ0cy5wdXNoKG5scy5sb2NhbGl6ZSgndGVybWluYWxIZWxwQXJpYUxhYmVsJywgXCJVc2UgezB9IGZvciB0ZXJtaW5hbCBhY2Nlc3NpYmlsaXR5IGhlbHBcIiwgYWNjZXNzaWJpbGl0eUhlbHBLZXliaW5kaW5nKSk7XG5cdFx0XHR9XG5cdFx0XHR4dGVybS50ZXh0YXJlYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbFBhcnRzLmpvaW4oJ1xcbicpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUaXRsZVByb3BlcnRpZXModGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZXZlbnRTb3VyY2U6IFRpdGxlRXZlbnRTb3VyY2UpOiBzdHJpbmcge1xuXHRcdGlmICh0aXRsZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJvY2Vzc05hbWU7XG5cdFx0fVxuXHRcdHN3aXRjaCAoZXZlbnRTb3VyY2UpIHtcblx0XHRcdGNhc2UgVGl0bGVFdmVudFNvdXJjZS5Qcm9jZXNzOlxuXHRcdFx0XHRpZiAodGhpcy5fcHJvY2Vzc01hbmFnZXIub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHRcdFx0Ly8gRXh0cmFjdCB0aGUgZmlsZSBuYW1lIHdpdGhvdXQgZXh0ZW5zaW9uXG5cdFx0XHRcdFx0dGl0bGUgPSBwYXRoLndpbjMyLnBhcnNlKHRpdGxlKS5uYW1lO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZpcnN0U3BhY2VJbmRleCA9IHRpdGxlLmluZGV4T2YoJyAnKTtcblx0XHRcdFx0XHRpZiAodGl0bGUuc3RhcnRzV2l0aCgnLycpKSB7XG5cdFx0XHRcdFx0XHR0aXRsZSA9IHBhdGguYmFzZW5hbWUodGl0bGUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZmlyc3RTcGFjZUluZGV4ID4gLTEpIHtcblx0XHRcdFx0XHRcdHRpdGxlID0gdGl0bGUuc3Vic3RyaW5nKDAsIGZpcnN0U3BhY2VJbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Byb2Nlc3NOYW1lID0gdGl0bGU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBUaXRsZUV2ZW50U291cmNlLkFwaTpcblx0XHRcdFx0Ly8gSWYgdGhlIHRpdGxlIGhhcyBub3QgYmVlbiBzZXQgYnkgdGhlIEFQSSBvciB0aGUgcmVuYW1lIGNvbW1hbmQsIHVucmVnaXN0ZXIgdGhlIGhhbmRsZXIgdGhhdFxuXHRcdFx0XHQvLyBhdXRvbWF0aWNhbGx5IHVwZGF0ZXMgdGhlIHRlcm1pbmFsIG5hbWVcblx0XHRcdFx0dGhpcy5fc3RhdGljVGl0bGUgPSB0aXRsZTtcblx0XHRcdFx0dGhpcy5fbWVzc2FnZVRpdGxlRGlzcG9zYWJsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFRpdGxlRXZlbnRTb3VyY2UuU2VxdWVuY2U6XG5cdFx0XHRcdC8vIE9uIFdpbmRvd3MsIHNvbWUgc2hlbGxzIHdpbGwgZmlyZSB0aGlzIHdpdGggdGhlIGZ1bGwgcGF0aCB3aGljaCB3ZSB3YW50IHRvIHRyaW1cblx0XHRcdFx0Ly8gdG8gc2hvdyBqdXN0IHRoZSBmaWxlIG5hbWUuIFRoaXMgc2hvdWxkIG9ubHkgaGFwcGVuIGlmIHRoZSB0aXRsZSBsb29rcyBsaWtlIGFuXG5cdFx0XHRcdC8vIGFic29sdXRlIFdpbmRvd3MgZmlsZSBwYXRoXG5cdFx0XHRcdHRoaXMuX3NlcXVlbmNlID0gdGl0bGU7XG5cdFx0XHRcdGlmICh0aGlzLl9wcm9jZXNzTWFuYWdlci5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiZcblx0XHRcdFx0XHR0aXRsZS5tYXRjaCgvXlthLXpBLVpdOlxcXFwuK1xcLlthLXpBLVpdezEsM30vKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NlcXVlbmNlID0gcGF0aC53aW4zMi5wYXJzZSh0aXRsZSkubmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0dGhpcy5fdGl0bGVTb3VyY2UgPSBldmVudFNvdXJjZTtcblx0XHRyZXR1cm4gdGl0bGU7XG5cdH1cblxuXHRzZXRPdmVycmlkZURpbWVuc2lvbnMoZGltZW5zaW9uczogSVRlcm1pbmFsRGltZW5zaW9uc092ZXJyaWRlIHwgdW5kZWZpbmVkLCBpbW1lZGlhdGU6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUgJiYgdGhpcy5fZGltZW5zaW9uc092ZXJyaWRlLmZvcmNlRXhhY3RTaXplICYmICFkaW1lbnNpb25zICYmIHRoaXMuX3Jvd3MgPT09IDAgJiYgdGhpcy5fY29scyA9PT0gMCkge1xuXHRcdFx0Ly8gdGhpcyB0ZXJtaW5hbCBuZXZlciBoYWQgYSByZWFsIHNpemUgPT4ga2VlcCB0aGUgbGFzdCBkaW1lbnNpb25zIG92ZXJyaWRlIGV4YWN0IHNpemVcblx0XHRcdHRoaXMuX2NvbHMgPSB0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUuY29scztcblx0XHRcdHRoaXMuX3Jvd3MgPSB0aGlzLl9kaW1lbnNpb25zT3ZlcnJpZGUucm93cztcblx0XHR9XG5cdFx0dGhpcy5fZGltZW5zaW9uc092ZXJyaWRlID0gZGltZW5zaW9ucztcblx0XHRpZiAoaW1tZWRpYXRlKSB7XG5cdFx0XHR0aGlzLl9yZXNpemUodHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Jlc2l6ZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNldEZpeGVkRGltZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb2xzID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnc2V0VGVybWluYWxEaW1lbnNpb25zQ29sdW1uJywgXCJTZXQgRml4ZWQgRGltZW5zaW9uczogQ29sdW1uXCIpLFxuXHRcdFx0cGxhY2VIb2xkZXI6ICdFbnRlciBhIG51bWJlciBvZiBjb2x1bW5zIG9yIGxlYXZlIGVtcHR5IGZvciBhdXRvbWF0aWMgd2lkdGgnLFxuXHRcdFx0dmFsaWRhdGVJbnB1dDogYXN5bmMgKHRleHQpID0+IHRleHQubGVuZ3RoID4gMCAmJiAhdGV4dC5tYXRjaCgvXlxcZCskLykgPyB7IGNvbnRlbnQ6ICdFbnRlciBhIG51bWJlciBvciBsZWF2ZSBlbXB0eSBzaXplIGF1dG9tYXRpY2FsbHknLCBzZXZlcml0eTogU2V2ZXJpdHkuRXJyb3IgfSA6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHRcdGlmIChjb2xzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZml4ZWRDb2xzID0gdGhpcy5fcGFyc2VGaXhlZERpbWVuc2lvbihjb2xzKTtcblx0XHR0aGlzLl9sYWJlbENvbXB1dGVyPy5yZWZyZXNoTGFiZWwodGhpcyk7XG5cdFx0dGhpcy5fdGVybWluYWxIYXNGaXhlZFdpZHRoLnNldCghIXRoaXMuX2ZpeGVkQ29scyk7XG5cdFx0Y29uc3Qgcm93cyA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3NldFRlcm1pbmFsRGltZW5zaW9uc1JvdycsIFwiU2V0IEZpeGVkIERpbWVuc2lvbnM6IFJvd1wiKSxcblx0XHRcdHBsYWNlSG9sZGVyOiAnRW50ZXIgYSBudW1iZXIgb2Ygcm93cyBvciBsZWF2ZSBlbXB0eSBmb3IgYXV0b21hdGljIGhlaWdodCcsXG5cdFx0XHR2YWxpZGF0ZUlucHV0OiBhc3luYyAodGV4dCkgPT4gdGV4dC5sZW5ndGggPiAwICYmICF0ZXh0Lm1hdGNoKC9eXFxkKyQvKSA/IHsgY29udGVudDogJ0VudGVyIGEgbnVtYmVyIG9yIGxlYXZlIGVtcHR5IHNpemUgYXV0b21hdGljYWxseScsIHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciB9IDogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdFx0aWYgKHJvd3MgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9maXhlZFJvd3MgPSB0aGlzLl9wYXJzZUZpeGVkRGltZW5zaW9uKHJvd3MpO1xuXHRcdHRoaXMuX2xhYmVsQ29tcHV0ZXI/LnJlZnJlc2hMYWJlbCh0aGlzKTtcblx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoU2Nyb2xsYmFyKCk7XG5cdFx0dGhpcy5fcmVzaXplKCk7XG5cdFx0dGhpcy5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VGaXhlZERpbWVuc2lvbih2YWx1ZTogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUludCh2YWx1ZSk7XG5cdFx0aWYgKHBhcnNlZCA8PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvdWxkIG5vdCBwYXJzZSBkaW1lbnNpb24gXCIke3ZhbHVlfVwiYCk7XG5cdFx0fVxuXHRcdHJldHVybiBwYXJzZWQ7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVTaXplVG9Db250ZW50V2lkdGgoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLnh0ZXJtPy5yYXcuYnVmZmVyLmFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faGFzU2Nyb2xsQmFyKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEhhc0ZpeGVkV2lkdGguc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMuX2ZpeGVkQ29scyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2ZpeGVkUm93cyA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2hhc1Njcm9sbEJhciA9IGZhbHNlO1xuXHRcdFx0dGhpcy5faW5pdERpbWVuc2lvbnMoKTtcblx0XHRcdGF3YWl0IHRoaXMuX3Jlc2l6ZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBmb250ID0gdGhpcy54dGVybSA/IHRoaXMueHRlcm0uZ2V0Rm9udCgpIDogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGRvbS5nZXRXaW5kb3codGhpcy5kb21FbGVtZW50KSk7XG5cdFx0XHRjb25zdCBtYXhDb2xzRm9yVGV4dHVyZSA9IE1hdGguZmxvb3IoQ29uc3RhbnRzLk1heENhbnZhc1dpZHRoIC8gKGZvbnQuY2hhcldpZHRoID8/IDIwKSk7XG5cdFx0XHQvLyBGaXhlZCBjb2x1bW5zIHNob3VsZCBiZSBhdCBsZWFzdCB4dGVybS5qcycgcmVndWxhciBjb2x1bW4gY291bnRcblx0XHRcdGNvbnN0IHByb3Bvc2VkQ29scyA9IE1hdGgubWF4KHRoaXMubWF4Q29scywgTWF0aC5taW4odGhpcy54dGVybS5nZXRMb25nZXN0Vmlld3BvcnRXcmFwcGVkTGluZUxlbmd0aCgpLCBtYXhDb2xzRm9yVGV4dHVyZSkpO1xuXHRcdFx0Ly8gRG9uJ3Qgc3dpdGNoIHRvIGZpeGVkIGRpbWVuc2lvbnMgaWYgdGhlIGNvbnRlbnQgYWxyZWFkeSBmaXRzIGFzIGl0IG1ha2VzIHRoZSBzY3JvbGxcblx0XHRcdC8vIGJhciBsb29rIGJhZCBiZWluZyBvZmYgdGhlIGVkZ2Vcblx0XHRcdGlmIChwcm9wb3NlZENvbHMgPiB0aGlzLnh0ZXJtLnJhdy5jb2xzKSB7XG5cdFx0XHRcdHRoaXMuX2ZpeGVkQ29scyA9IHByb3Bvc2VkQ29scztcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcmVmcmVzaFNjcm9sbGJhcigpO1xuXHRcdHRoaXMuX2xhYmVsQ29tcHV0ZXI/LnJlZnJlc2hMYWJlbCh0aGlzKTtcblx0XHR0aGlzLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoU2Nyb2xsYmFyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9maXhlZENvbHMgfHwgdGhpcy5fZml4ZWRSb3dzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYWRkU2Nyb2xsYmFyKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZW1vdmVTY3JvbGxiYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FkZFNjcm9sbGJhcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGFyV2lkdGggPSAodGhpcy54dGVybSA/IHRoaXMueHRlcm0uZ2V0Rm9udCgpIDogdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5nZXRGb250KGRvbS5nZXRXaW5kb3codGhpcy5kb21FbGVtZW50KSkpLmNoYXJXaWR0aDtcblx0XHRpZiAoIXRoaXMueHRlcm0/LnJhdy5lbGVtZW50IHx8ICF0aGlzLl9jb250YWluZXIgfHwgIWNoYXJXaWR0aCB8fCAhdGhpcy5fZml4ZWRDb2xzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZpeGVkLWRpbXMnKTtcblx0XHR0aGlzLl9oYXNTY3JvbGxCYXIgPSB0cnVlO1xuXHRcdHRoaXMuX2luaXREaW1lbnNpb25zKCk7XG5cdFx0YXdhaXQgdGhpcy5fcmVzaXplKCk7XG5cdFx0dGhpcy5fdGVybWluYWxIYXNGaXhlZFdpZHRoLnNldCh0cnVlKTtcblx0XHRpZiAoIXRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIpIHtcblx0XHRcdHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5fd3JhcHBlckVsZW1lbnQsIHtcblx0XHRcdFx0dmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuLFxuXHRcdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdFx0XHRzY3JvbGxZVG9YOiBmYWxzZSxcblx0XHRcdFx0Y29uc3VtZU1vdXNlV2hlZWxJZlNjcm9sbGJhcklzTmVlZGVkOiBmYWxzZVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIuZ2V0RG9tTm9kZSgpKTtcblx0XHR9XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5zZXRTY3JvbGxEaW1lbnNpb25zKHtcblx0XHRcdHdpZHRoOiB0aGlzLnh0ZXJtLnJhdy5lbGVtZW50LmNsaWVudFdpZHRoLFxuXHRcdFx0c2Nyb2xsV2lkdGg6IHRoaXMuX2ZpeGVkQ29scyAqIGNoYXJXaWR0aCArIDQwIC8vIFBhZGRpbmcgKyBzY3JvbGwgYmFyXG5cdFx0fSk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5nZXREb21Ob2RlKCkuc3R5bGUucGFkZGluZ0JvdHRvbSA9ICcxNnB4JztcblxuXHRcdC8vIHdvcmsgYXJvdW5kIGZvciBodHRwczovL2dpdGh1Yi5jb20veHRlcm1qcy94dGVybS5qcy9pc3N1ZXMvMzQ4MlxuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGZvciAobGV0IGkgPSB0aGlzLnh0ZXJtLnJhdy5idWZmZXIuYWN0aXZlLnZpZXdwb3J0WTsgaSA8IHRoaXMueHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aW50ZXJmYWNlIElMaW5lV2l0aEludGVybmFscyBleHRlbmRzIElCdWZmZXJMaW5lIHtcblx0XHRcdFx0XHRfbGluZToge1xuXHRcdFx0XHRcdFx0aXNXcmFwcGVkOiBib29sZWFuO1xuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMueHRlcm0ucmF3LmJ1ZmZlci5hY3RpdmUuZ2V0TGluZShpKTtcblx0XHRcdFx0KGxpbmUgYXMgSUxpbmVXaXRoSW50ZXJuYWxzKS5fbGluZS5pc1dyYXBwZWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZW1vdmVTY3JvbGxiYXIoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9jb250YWluZXIgfHwgIXRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5nZXREb21Ob2RlKCkucmVtb3ZlKCk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudC5yZW1vdmUoKTtcblx0XHR0aGlzLl93cmFwcGVyRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdmaXhlZC1kaW1zJyk7XG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3dyYXBwZXJFbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFJlc29sdmVkU2hlbGxMYXVuY2hDb25maWcoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyk6IHZvaWQge1xuXHRcdHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmFyZ3MgPSBzaGVsbExhdW5jaENvbmZpZy5hcmdzO1xuXHRcdHRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmN3ZCA9IHNoZWxsTGF1bmNoQ29uZmlnLmN3ZDtcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlID0gc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZTtcblx0XHR0aGlzLl9zaGVsbExhdW5jaENvbmZpZy5lbnYgPSBzaGVsbExhdW5jaENvbmZpZy5lbnY7XG5cdH1cblxuXHRwcml2YXRlIF9vbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlZChpbmZvOiBJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8pOiB2b2lkIHtcblx0XHRpZiAoaW5mby5yZXF1aXJlc0FjdGlvbikge1xuXHRcdFx0dGhpcy54dGVybT8ucmF3LnRleHRhcmVhPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBubHMubG9jYWxpemUoJ3Rlcm1pbmFsU3RhbGVUZXh0Qm94QXJpYUxhYmVsJywgXCJUZXJtaW5hbCB7MH0gZW52aXJvbm1lbnQgaXMgc3RhbGUsIHJ1biB0aGUgJ1Nob3cgRW52aXJvbm1lbnQgSW5mb3JtYXRpb24nIGNvbW1hbmQgZm9yIG1vcmUgaW5mb3JtYXRpb25cIiwgdGhpcy5faW5zdGFuY2VJZCkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWZyZXNoRW52aXJvbm1lbnRWYXJpYWJsZUluZm9XaWRnZXRTdGF0ZShpbmZvKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hFbnZpcm9ubWVudFZhcmlhYmxlSW5mb1dpZGdldFN0YXRlKGluZm8/OiBJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDaGVjayBpZiB0aGUgc3RhdHVzIHNob3VsZCBleGlzdFxuXHRcdGlmICghaW5mbykge1xuXHRcdFx0dGhpcy5zdGF0dXNMaXN0LnJlbW92ZShUZXJtaW5hbFN0YXR1cy5SZWxhdW5jaE5lZWRlZCk7XG5cdFx0XHR0aGlzLnN0YXR1c0xpc3QucmVtb3ZlKFRlcm1pbmFsU3RhdHVzLkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlc0FjdGl2ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVjcmVhdGUgdGhlIHByb2Nlc3Mgc2VhbWxlc3NseSB3aXRob3V0IGluZm9ybWluZyB0aGUgdXNlIGlmIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmVcblx0XHQvLyBtZXQuXG5cdFx0aWYgKFxuXHRcdFx0Ly8gVGhlIGNoYW5nZSByZXF1aXJlcyBhIHJlbGF1bmNoXG5cdFx0XHRpbmZvLnJlcXVpcmVzQWN0aW9uICYmXG5cdFx0XHQvLyBUaGUgZmVhdHVyZSBpcyBlbmFibGVkXG5cdFx0XHR0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbnZpcm9ubWVudENoYW5nZXNSZWxhdW5jaCAmJlxuXHRcdFx0Ly8gSGFzIG5vdCBiZWVuIGludGVyYWN0ZWQgd2l0aFxuXHRcdFx0IXRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmhhc1dyaXR0ZW5EYXRhICYmXG5cdFx0XHQvLyBOb3QgYSBmZWF0dXJlIHRlcm1pbmFsIG9yIGlzIGEgcmVjb25uZWN0aW5nIHRhc2sgdGVybWluYWwgKFRPRE86IE5lZWQgdG8gZXhwbGFpbiB0aGUgbGF0dGVyIGNhc2UpXG5cdFx0XHQoIXRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsIHx8ICh0aGlzLnJlY29ubmVjdGlvblByb3BlcnRpZXMgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3Rhc2sucmVjb25uZWN0aW9uJykgPT09IHRydWUpKSAmJlxuXHRcdFx0Ly8gTm90IGEgY3VzdG9tIHB0eVxuXHRcdFx0IXRoaXMuX3NoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uICYmXG5cdFx0XHQvLyBOb3QgYW4gZXh0ZW5zaW9uIG93bmVkIHRlcm1pbmFsXG5cdFx0XHQhdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuaXNFeHRlbnNpb25Pd25lZFRlcm1pbmFsICYmXG5cdFx0XHQvLyBOb3QgYSByZWNvbm5lY3RlZCBvciByZXZpdmVkIHRlcm1pbmFsXG5cdFx0XHQhdGhpcy5fc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MgJiZcblx0XHRcdC8vIE5vdCBhIFdpbmRvd3MgcmVtb3RlIHVzaW5nIENvblBUWSB3aGljaCBjYW5ub3QgcmVsYXVuY2ggKCMxODcwODQpLiBDb25QVFkgaXMgdXNlZCBvblxuXHRcdFx0Ly8gV2luZG93cyBidWlsZHMgMTgzMDkrLlxuXHRcdFx0ISh0aGlzLl9wcm9jZXNzTWFuYWdlci5yZW1vdGVBdXRob3JpdHkgJiYgKGF3YWl0IHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmdldEJhY2tlbmRPUygpKSA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiYgdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1RyYWl0cz8ud2luZG93c1B0eT8uYnVpbGROdW1iZXIgJiYgdGhpcy5fcHJvY2Vzc01hbmFnZXIucHJvY2Vzc1RyYWl0cy53aW5kb3dzUHR5LmJ1aWxkTnVtYmVyID49IDE4MzA5KVxuXHRcdCkge1xuXHRcdFx0dGhpcy5yZWxhdW5jaCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBSZS1jcmVhdGUgc3RhdHVzZXNcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBnZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbCh0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmN3ZCwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHRoaXMuX2hpc3RvcnlTZXJ2aWNlKTtcblx0XHR0aGlzLnN0YXR1c0xpc3QuYWRkKGluZm8uZ2V0U3RhdHVzKHsgd29ya3NwYWNlRm9sZGVyIH0pKTtcblx0fVxuXG5cdGFzeW5jIGdldEluaXRpYWxDd2QoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAoIXRoaXMuX2luaXRpYWxDd2QpIHtcblx0XHRcdHRoaXMuX2luaXRpYWxDd2QgPSB0aGlzLl9wcm9jZXNzTWFuYWdlci5pbml0aWFsQ3dkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5faW5pdGlhbEN3ZDtcblx0fVxuXG5cdGFzeW5jIGdldFNwZWN1bGF0aXZlQ3dkKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKSEuZ2V0Q3dkKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5Lk5haXZlQ3dkRGV0ZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuTmFpdmVDd2REZXRlY3Rpb24pIS5nZXRDd2QoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLmluaXRpYWxDd2Q7XG5cdH1cblxuXHRhc3luYyBnZXRDd2RSZXNvdXJjZSgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGN3ZCA9IHRoaXMuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKT8uZ2V0Q3dkKCk7XG5cdFx0aWYgKCFjd2QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCByZXNvdXJjZTogVVJJO1xuXHRcdGlmICh0aGlzLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmVzb3VyY2UgPSBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS5maWxlVVJJKGN3ZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc291cmNlID0gVVJJLmZpbGUoY3dkKTtcblx0XHR9XG5cdFx0Ly8gSW4gVlMgQ29kZSB3ZWIgKHNlcnZlci1saW51eC14NjQtd2ViIGFjY2Vzc2VkIHZpYSBicm93c2VyKSwgcmVtb3RlQXV0aG9yaXR5XG5cdFx0Ly8gaXMgZmFsc3kgZnJvbSB0aGUgdGVybWluYWwncyBwZXJzcGVjdGl2ZSwgc28gVVJJLmZpbGUoKSBpcyB1c2VkIGFib3ZlLlxuXHRcdC8vIFRoZSBicm93c2VyIEZpbGVTZXJ2aWNlIGhhcyBubyBmaWxlOi8vIHByb3ZpZGVyIHJlZ2lzdGVyZWQgKG9ubHkgdGhlIHJlbW90ZVxuXHRcdC8vIHByb3ZpZGVyKSwgc28gZ3VhcmQgd2l0aCBjYW5IYW5kbGVSZXNvdXJjZSBiZWZvcmUgY2FsbGluZyBleGlzdHMoKSB0byBhdm9pZFxuXHRcdC8vIGFuIEVOT1BSTyBlcnJvciBwcm9wYWdhdGluZyB0byBjYWxsZXJzLlxuXHRcdGlmICghYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY2FuSGFuZGxlUmVzb3VyY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHJlc291cmNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBUKTogUHJvbWlzZTxJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdPiB7XG5cdFx0YXdhaXQgdGhpcy5wcm9jZXNzUmVhZHk7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2Nlc3NNYW5hZ2VyLnJlZnJlc2hQcm9wZXJ0eSh0eXBlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBULCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm9jZXNzTWFuYWdlci51cGRhdGVQcm9wZXJ0eSh0eXBlLCB2YWx1ZSk7XG5cdH1cblxuXHRhc3luYyByZW5hbWUodGl0bGU/OiBzdHJpbmcsIHNvdXJjZT86IFRpdGxlRXZlbnRTb3VyY2UpIHtcblx0XHRpZiAodGl0bGUgIT09IHVuZGVmaW5lZCAmJiAhdGl0bGUpIHtcblx0XHRcdHRpdGxlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9zZXRUaXRsZSh0aXRsZSwgc291cmNlID8/IFRpdGxlRXZlbnRTb3VyY2UuQXBpKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFRpdGxlKHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV2ZW50U291cmNlOiBUaXRsZUV2ZW50U291cmNlKTogdm9pZCB7XG5cdFx0aWYgKCh0aGlzLl9zaGVsbExhdW5jaENvbmZpZz8udHlwZSA9PT0gJ1Rhc2snIHx8IHRoaXMuX3RpdGxlU291cmNlID09PSBUaXRsZUV2ZW50U291cmNlLkFwaSkgJiYgZXZlbnRTb3VyY2UgPT09IFRpdGxlRXZlbnRTb3VyY2UuUHJvY2Vzcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc2V0ID0gIXRpdGxlO1xuXHRcdHRpdGxlID0gdGhpcy5fdXBkYXRlVGl0bGVQcm9wZXJ0aWVzKHRpdGxlLCBldmVudFNvdXJjZSk7XG5cdFx0Y29uc3QgdGl0bGVDaGFuZ2VkID0gdGl0bGUgIT09IHRoaXMuX3RpdGxlO1xuXHRcdHRoaXMuX3RpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5fbGFiZWxDb21wdXRlcj8ucmVmcmVzaExhYmVsKHRoaXMsIHJlc2V0KTtcblx0XHR0aGlzLl9zZXRBcmlhTGFiZWwodGhpcy54dGVybT8ucmF3LCB0aGlzLl9pbnN0YW5jZUlkLCB0aGlzLl90aXRsZSk7XG5cblx0XHRpZiAodGl0bGVDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLl9vblRpdGxlQ2hhbmdlZC5maXJlKHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNoYW5nZUljb24oaWNvbj86IFRlcm1pbmFsSWNvbik6IFByb21pc2U8VGVybWluYWxJY29uIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGljb24pIHtcblx0XHRcdHRoaXMuX2ljb24gPSBpY29uO1xuXHRcdFx0dGhpcy5fb25JY29uQ2hhbmdlZC5maXJlKHsgaW5zdGFuY2U6IHRoaXMsIHVzZXJJbml0aWF0ZWQ6IHRydWUgfSk7XG5cdFx0XHRyZXR1cm4gaWNvbjtcblx0XHR9XG5cdFx0Y29uc3QgaWNvblBpY2tlciA9IHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsSWNvblBpY2tlcik7XG5cdFx0Y29uc3QgcGlja2VkSWNvbiA9IGF3YWl0IGljb25QaWNrZXIucGlja0ljb25zKCk7XG5cdFx0aWNvblBpY2tlci5kaXNwb3NlKCk7XG5cdFx0aWYgKCFwaWNrZWRJY29uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9pY29uID0gcGlja2VkSWNvbjtcblx0XHR0aGlzLl9vbkljb25DaGFuZ2VkLmZpcmUoeyBpbnN0YW5jZTogdGhpcywgdXNlckluaXRpYXRlZDogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gcGlja2VkSWNvbjtcblx0fVxuXG5cdGFzeW5jIGNoYW5nZUNvbG9yKGNvbG9yPzogc3RyaW5nLCBza2lwUXVpY2tQaWNrPzogYm9vbGVhbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHR0aGlzLnNoZWxsTGF1bmNoQ29uZmlnLmNvbG9yID0gY29sb3I7XG5cdFx0XHR0aGlzLl9vbkljb25DaGFuZ2VkLmZpcmUoeyBpbnN0YW5jZTogdGhpcywgdXNlckluaXRpYXRlZDogdHJ1ZSB9KTtcblx0XHRcdHJldHVybiBjb2xvcjtcblx0XHR9IGVsc2UgaWYgKHNraXBRdWlja1BpY2spIHtcblx0XHRcdC8vIFJlc2V0IHRoaXMgdGFiJ3MgY29sb3Jcblx0XHRcdHRoaXMuc2hlbGxMYXVuY2hDb25maWcuY29sb3IgPSAnJztcblx0XHRcdHRoaXMuX29uSWNvbkNoYW5nZWQuZmlyZSh7IGluc3RhbmNlOiB0aGlzLCB1c2VySW5pdGlhdGVkOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpY29uID0gdGhpcy5fZ2V0SWNvbigpO1xuXHRcdGlmICghaWNvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb2xvclRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRjb25zdCBzdGFuZGFyZENvbG9yczogc3RyaW5nW10gPSBnZXRTdGFuZGFyZENvbG9ycyhjb2xvclRoZW1lKTtcblx0XHRjb25zdCBjb2xvclN0eWxlRGlzcG9zYWJsZSA9IGNyZWF0ZUNvbG9yU3R5bGVFbGVtZW50KGNvbG9yVGhlbWUpO1xuXHRcdGNvbnN0IGl0ZW1zOiBRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvbG9yS2V5IG9mIHN0YW5kYXJkQ29sb3JzKSB7XG5cdFx0XHRjb25zdCBjb2xvckNsYXNzID0gZ2V0Q29sb3JDbGFzcyhjb2xvcktleSk7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5jaXJjbGVGaWxsZWQuaWR9KSAke2NvbG9yS2V5LnJlcGxhY2UoJ3Rlcm1pbmFsLmFuc2knLCAnJyl9YCwgaWQ6IGNvbG9yS2V5LCBkZXNjcmlwdGlvbjogY29sb3JLZXksIGljb25DbGFzc2VzOiBbY29sb3JDbGFzc11cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpdGVtcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0Y29uc3Qgc2hvd0FsbENvbG9yc0l0ZW0gPSB7IGxhYmVsOiAnUmVzZXQgdG8gZGVmYXVsdCcgfTtcblx0XHRpdGVtcy5wdXNoKHNob3dBbGxDb2xvcnNJdGVtKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKHF1aWNrUGljayk7XG5cdFx0cXVpY2tQaWNrLml0ZW1zID0gaXRlbXM7XG5cdFx0cXVpY2tQaWNrLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbmxzLmxvY2FsaXplKCdjaGFuZ2VDb2xvcicsICdTZWxlY3QgYSBjb2xvciBmb3IgdGhlIHRlcm1pbmFsJyk7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTxJUXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD4ociA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5wdXNoKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gcih1bmRlZmluZWQpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5wdXNoKHF1aWNrUGljay5vbkRpZEFjY2VwdCgoKSA9PiByKHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdKSkpO1xuXHRcdH0pO1xuXHRcdGRpc3Bvc2UoZGlzcG9zYWJsZXMpO1xuXG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0dGhpcy5zaGVsbExhdW5jaENvbmZpZy5jb2xvciA9IHJlc3VsdC5pZDtcblx0XHRcdHRoaXMuX29uSWNvbkNoYW5nZWQuZmlyZSh7IGluc3RhbmNlOiB0aGlzLCB1c2VySW5pdGlhdGVkOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0Y29sb3JTdHlsZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHJldHVybiByZXN1bHQ/LmlkO1xuXHR9XG5cblx0Zm9yY2VTY3JvbGxiYXJWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZvcmNlLXNjcm9sbGJhcicpO1xuXHR9XG5cblx0cmVzZXRTY3JvbGxiYXJWaXNpYmlsaXR5KCk6IHZvaWQge1xuXHRcdHRoaXMuX3dyYXBwZXJFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZvcmNlLXNjcm9sbGJhcicpO1xuXHR9XG5cblx0c2V0UGFyZW50Q29udGV4dEtleVNlcnZpY2UocGFyZW50Q29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlLnVwZGF0ZVBhcmVudChwYXJlbnRDb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVNb3VzZUV2ZW50KGV2ZW50OiBNb3VzZUV2ZW50LCBjb250ZXh0TWVudTogSU1lbnUpOiBQcm9taXNlPHsgY2FuY2VsQ29udGV4dE1lbnU6IGJvb2xlYW4gfSB8IHZvaWQ+IHtcblx0XHQvLyBEb24ndCBoYW5kbGUgbW91c2UgZXZlbnQgaWYgaXQgd2FzIG9uIHRoZSBzY3JvbGwgYmFyXG5cdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KGV2ZW50LnRhcmdldCkgJiYgKGV2ZW50LnRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3Njcm9sbGJhcicpIHx8IGV2ZW50LnRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3NsaWRlcicpKSkge1xuXHRcdFx0cmV0dXJuIHsgY2FuY2VsQ29udGV4dE1lbnU6IHRydWUgfTtcblx0XHR9XG5cblx0XHQvLyBBbGxvdyBjb250cmlidXRpb25zIHRvIGhhbmRsZSB0aGUgbW91c2UgZXZlbnQgZmlyc3Rcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgdGhpcy5fY29udHJpYnV0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udHJpYi5oYW5kbGVNb3VzZUV2ZW50Py4oZXZlbnQpO1xuXHRcdFx0aWYgKHJlc3VsdD8uaGFuZGxlZCkge1xuXHRcdFx0XHRyZXR1cm4geyBjYW5jZWxDb250ZXh0TWVudTogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE1pZGRsZSBjbGlja1xuXHRcdGlmIChldmVudC53aGljaCA9PT0gMikge1xuXHRcdFx0c3dpdGNoICh0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5taWRkbGVDbGlja0JlaGF2aW9yKSB7XG5cdFx0XHRcdGNhc2UgJ2RlZmF1bHQnOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdC8vIERyb3Agc2VsZWN0aW9uIGFuZCBmb2N1cyB0ZXJtaW5hbCBvbiBMaW51eCB0byBlbmFibGUgbWlkZGxlIGJ1dHRvbiBwYXN0ZVxuXHRcdFx0XHRcdC8vIHdoZW4gY2xpY2sgb2NjdXJzIG9uIHRoZSBzZWxlY3Rpb24gaXRzZWxmLlxuXHRcdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSaWdodCBjbGlja1xuXHRcdGlmIChldmVudC53aGljaCA9PT0gMykge1xuXHRcdFx0Ly8gU2hpZnQgY2xpY2sgZm9yY2VzIHRoZSBjb250ZXh0IG1lbnVcblx0XHRcdGlmIChldmVudC5zaGlmdEtleSkge1xuXHRcdFx0XHRvcGVuQ29udGV4dE1lbnUoZG9tLmdldEFjdGl2ZVdpbmRvdygpLCBldmVudCwgdGhpcywgY29udGV4dE1lbnUsIHRoaXMuX2NvbnRleHRNZW51U2VydmljZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmlnaHRDbGlja0JlaGF2aW9yID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcucmlnaHRDbGlja0JlaGF2aW9yO1xuXHRcdFx0aWYgKHJpZ2h0Q2xpY2tCZWhhdmlvciA9PT0gJ25vdGhpbmcnKSB7XG5cdFx0XHRcdGlmICghZXZlbnQuc2hpZnRLZXkpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBjYW5jZWxDb250ZXh0TWVudTogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVGVybWluYWxJbnN0YW5jZURyYWdBbmREcm9wQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBkb20uSURyYWdBbmREcm9wT2JzZXJ2ZXJDYWxsYmFja3Mge1xuXHRwcml2YXRlIF9kcm9wT3ZlcmxheT86IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRHJvcEZpbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCBVUkk+KCkpO1xuXHRnZXQgb25Ecm9wRmlsZSgpOiBFdmVudDxzdHJpbmcgfCBVUkk+IHsgcmV0dXJuIHRoaXMuX29uRHJvcEZpbGUuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25Ecm9wVGVybWluYWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVxdWVzdEFkZEluc3RhbmNlVG9Hcm91cEV2ZW50PigpKTtcblx0Z2V0IG9uRHJvcFRlcm1pbmFsKCk6IEV2ZW50PElSZXF1ZXN0QWRkSW5zdGFuY2VUb0dyb3VwRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uRHJvcFRlcm1pbmFsLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9jbGVhckRyb3BPdmVybGF5KCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyRHJvcE92ZXJsYXkoKSB7XG5cdFx0dGhpcy5fZHJvcE92ZXJsYXk/LnJlbW92ZSgpO1xuXHRcdHRoaXMuX2Ryb3BPdmVybGF5ID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0b25EcmFnRW50ZXIoZTogRHJhZ0V2ZW50KSB7XG5cdFx0aWYgKCFjb250YWluc0RyYWdUeXBlKGUsIERhdGFUcmFuc2ZlcnMuRklMRVMsIERhdGFUcmFuc2ZlcnMuUkVTT1VSQ0VTLCBUZXJtaW5hbERhdGFUcmFuc2ZlcnMuVGVybWluYWxzLCBDb2RlRGF0YVRyYW5zZmVycy5GSUxFUykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2Ryb3BPdmVybGF5KSB7XG5cdFx0XHR0aGlzLl9kcm9wT3ZlcmxheSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5fZHJvcE92ZXJsYXkuY2xhc3NMaXN0LmFkZCgndGVybWluYWwtZHJvcC1vdmVybGF5Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gRHJhZ2dpbmcgdGVybWluYWxzXG5cdFx0aWYgKGNvbnRhaW5zRHJhZ1R5cGUoZSwgVGVybWluYWxEYXRhVHJhbnNmZXJzLlRlcm1pbmFscykpIHtcblx0XHRcdGNvbnN0IHNpZGUgPSB0aGlzLl9nZXREcm9wU2lkZShlKTtcblx0XHRcdHRoaXMuX2Ryb3BPdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ2Ryb3AtYmVmb3JlJywgc2lkZSA9PT0gJ2JlZm9yZScpO1xuXHRcdFx0dGhpcy5fZHJvcE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnZHJvcC1hZnRlcicsIHNpZGUgPT09ICdhZnRlcicpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZHJvcE92ZXJsYXkucGFyZW50RWxlbWVudCkge1xuXHRcdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2Ryb3BPdmVybGF5KTtcblx0XHR9XG5cdH1cblx0b25EcmFnTGVhdmUoZTogRHJhZ0V2ZW50KSB7XG5cdFx0dGhpcy5fY2xlYXJEcm9wT3ZlcmxheSgpO1xuXHR9XG5cblx0b25EcmFnRW5kKGU6IERyYWdFdmVudCkge1xuXHRcdHRoaXMuX2NsZWFyRHJvcE92ZXJsYXkoKTtcblx0fVxuXG5cdG9uRHJhZ092ZXIoZTogRHJhZ0V2ZW50KSB7XG5cdFx0aWYgKCFlLmRhdGFUcmFuc2ZlciB8fCAhdGhpcy5fZHJvcE92ZXJsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEcmFnZ2luZyB0ZXJtaW5hbHNcblx0XHRpZiAoY29udGFpbnNEcmFnVHlwZShlLCBUZXJtaW5hbERhdGFUcmFuc2ZlcnMuVGVybWluYWxzKSkge1xuXHRcdFx0Y29uc3Qgc2lkZSA9IHRoaXMuX2dldERyb3BTaWRlKGUpO1xuXHRcdFx0dGhpcy5fZHJvcE92ZXJsYXkuY2xhc3NMaXN0LnRvZ2dsZSgnZHJvcC1iZWZvcmUnLCBzaWRlID09PSAnYmVmb3JlJyk7XG5cdFx0XHR0aGlzLl9kcm9wT3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKCdkcm9wLWFmdGVyJywgc2lkZSA9PT0gJ2FmdGVyJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZHJvcE92ZXJsYXkuc3R5bGUub3BhY2l0eSA9ICcxJztcblx0fVxuXG5cdGFzeW5jIG9uRHJvcChlOiBEcmFnRXZlbnQpIHtcblx0XHR0aGlzLl9jbGVhckRyb3BPdmVybGF5KCk7XG5cblx0XHRpZiAoIWUuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVybWluYWxSZXNvdXJjZXMgPSBnZXRUZXJtaW5hbFJlc291cmNlc0Zyb21EcmFnRXZlbnQoZSk7XG5cdFx0aWYgKHRlcm1pbmFsUmVzb3VyY2VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0ZXJtaW5hbFJlc291cmNlcykge1xuXHRcdFx0XHRjb25zdCBzaWRlID0gdGhpcy5fZ2V0RHJvcFNpZGUoZSk7XG5cdFx0XHRcdHRoaXMuX29uRHJvcFRlcm1pbmFsLmZpcmUoeyB1cmksIHNpZGUgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgZmlsZXMgd2VyZSBkcmFnZ2VkIGZyb20gdGhlIHRyZWUgZXhwbG9yZXJcblx0XHRsZXQgcGF0aDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJhd1Jlc291cmNlcyA9IGUuZGF0YVRyYW5zZmVyLmdldERhdGEoRGF0YVRyYW5zZmVycy5SRVNPVVJDRVMpO1xuXHRcdGlmIChyYXdSZXNvdXJjZXMpIHtcblx0XHRcdHBhdGggPSBVUkkucGFyc2UoSlNPTi5wYXJzZShyYXdSZXNvdXJjZXMpWzBdKTtcblx0XHR9XG5cblx0XHRjb25zdCByYXdDb2RlRmlsZXMgPSBlLmRhdGFUcmFuc2Zlci5nZXREYXRhKENvZGVEYXRhVHJhbnNmZXJzLkZJTEVTKTtcblx0XHRpZiAoIXBhdGggJiYgcmF3Q29kZUZpbGVzKSB7XG5cdFx0XHRwYXRoID0gVVJJLmZpbGUoSlNPTi5wYXJzZShyYXdDb2RlRmlsZXMpWzBdKTtcblx0XHR9XG5cblx0XHRpZiAoIXBhdGggJiYgZS5kYXRhVHJhbnNmZXIuZmlsZXMubGVuZ3RoID4gMCAmJiBnZXRQYXRoRm9yRmlsZShlLmRhdGFUcmFuc2Zlci5maWxlc1swXSkpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBmaWxlIHdhcyBkcmFnZ2VkIGZyb20gdGhlIGZpbGVzeXN0ZW1cblx0XHRcdHBhdGggPSBVUkkuZmlsZShnZXRQYXRoRm9yRmlsZShlLmRhdGFUcmFuc2Zlci5maWxlc1swXSkhKTtcblx0XHR9XG5cblx0XHRpZiAoIXBhdGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRyb3BGaWxlLmZpcmUocGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREcm9wU2lkZShlOiBEcmFnRXZlbnQpOiAnYmVmb3JlJyB8ICdhZnRlcicge1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2NvbnRhaW5lcjtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuICdhZnRlcic7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVjdCA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Vmlld09yaWVudGF0aW9uKCkgPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUxcblx0XHRcdD8gKGUuY2xpZW50WCAtIHJlY3QubGVmdCA8IHJlY3Qud2lkdGggLyAyID8gJ2JlZm9yZScgOiAnYWZ0ZXInKVxuXHRcdFx0OiAoZS5jbGllbnRZIC0gcmVjdC50b3AgPCByZWN0LmhlaWdodCAvIDIgPyAnYmVmb3JlJyA6ICdhZnRlcicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Vmlld09yaWVudGF0aW9uKCk6IE9yaWVudGF0aW9uIHtcblx0XHRjb25zdCBwYW5lbFBvc2l0aW9uID0gdGhpcy5fbGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgdGVybWluYWxMb2NhdGlvbiA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKFRFUk1JTkFMX1ZJRVdfSUQpO1xuXHRcdHJldHVybiB0ZXJtaW5hbExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgJiYgaXNIb3Jpem9udGFsKHBhbmVsUG9zaXRpb24pXG5cdFx0XHQ/IE9yaWVudGF0aW9uLkhPUklaT05UQUxcblx0XHRcdDogT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUZXJtaW5hbExhYmVsVGVtcGxhdGVQcm9wZXJ0aWVzIHtcblx0Y3dkPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0Y3dkRm9sZGVyPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0d29ya3NwYWNlRm9sZGVyTmFtZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdHdvcmtzcGFjZUZvbGRlcj86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdGxvY2FsPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0cHJvY2Vzcz86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdHNlcXVlbmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0cHJvZ3Jlc3M/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkO1xuXHR0YXNrPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0Zml4ZWREaW1lbnNpb25zPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZDtcblx0c2VwYXJhdG9yPzogc3RyaW5nIHwgSVNlcGFyYXRvciB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdHNoZWxsVHlwZT86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c2hlbGxDb21tYW5kPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRzaGVsbFByb21wdElucHV0Pzogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCBlbnVtIFRlcm1pbmFsTGFiZWxUeXBlIHtcblx0VGl0bGUgPSAndGl0bGUnLFxuXHREZXNjcmlwdGlvbiA9ICdkZXNjcmlwdGlvbidcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsTGFiZWxDb21wdXRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF90aXRsZTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX2Rlc2NyaXB0aW9uOiBzdHJpbmcgPSAnJztcblx0Z2V0IHRpdGxlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl90aXRsZTsgfVxuXHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX2Rlc2NyaXB0aW9uOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgdGl0bGU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYWJlbCA9IHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIEFnZW50IENMSXMgd2hvc2UgdGFiIHRpdGxlIHNob3VsZCBjb21lIGZyb20gdGhlaXIgb3duIGVzY2FwZSBzZXF1ZW5jZXMgcmF0aGVyXG5cdCAqIHRoYW4gdGhlIGNvbmZpZ3VyZWQgdGVtcGxhdGUgb3IgYSBzdGF0aWMgcHJvZmlsZSBuYW1lLlxuXHQgKi9cblx0c3RhdGljIHJlYWRvbmx5IGFnZW50Q2xpU2hlbGxUeXBlczogUmVhZG9ubHlTZXQ8R2VuZXJhbFNoZWxsVHlwZT4gPSBuZXcgU2V0KFtcblx0XHRHZW5lcmFsU2hlbGxUeXBlLkNsYXVkZSxcblx0XHRHZW5lcmFsU2hlbGxUeXBlLkNvZGV4LFxuXHRcdEdlbmVyYWxTaGVsbFR5cGUuQ29tbWFuZENvZGUsXG5cdFx0R2VuZXJhbFNoZWxsVHlwZS5Db3BpbG90LFxuXHRcdEdlbmVyYWxTaGVsbFR5cGUuR2VtaW5pLFxuXHRdKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVmcmVzaExhYmVsKGluc3RhbmNlOiBQaWNrPElUZXJtaW5hbEluc3RhbmNlLCAnc2hlbGxMYXVuY2hDb25maWcnIHwgJ3NoZWxsVHlwZScgfCAnY3dkJyB8ICdmaXhlZENvbHMnIHwgJ2ZpeGVkUm93cycgfCAnaW5pdGlhbEN3ZCcgfCAncHJvY2Vzc05hbWUnIHwgJ3NlcXVlbmNlJyB8ICd1c2VySG9tZScgfCAnd29ya3NwYWNlRm9sZGVyJyB8ICdzdGF0aWNUaXRsZScgfCAnY2FwYWJpbGl0aWVzJyB8ICd0aXRsZScgfCAnZGVzY3JpcHRpb24nIHwgJ29zJz4sIHJlc2V0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHRhYnMgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy50YWJzO1xuXHRcdGNvbnN0IHVzZUFnZW50Q2xpVGl0bGUgPSB0YWJzLmFsbG93QWdlbnRDbGlUaXRsZSAmJiBUZXJtaW5hbExhYmVsQ29tcHV0ZXIuYWdlbnRDbGlTaGVsbFR5cGVzLmhhcyhpbnN0YW5jZS5zaGVsbFR5cGUgYXMgR2VuZXJhbFNoZWxsVHlwZSk7XG5cdFx0Y29uc3QgdGl0bGVUZW1wbGF0ZSA9IGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLnRpdGxlVGVtcGxhdGUgPz8gKHVzZUFnZW50Q2xpVGl0bGUgPyAnJHtzZXF1ZW5jZX0nIDogdGFicy50aXRsZSk7XG5cdFx0dGhpcy5fdGl0bGUgPSB0aGlzLmNvbXB1dGVMYWJlbChpbnN0YW5jZSwgdGl0bGVUZW1wbGF0ZSwgVGVybWluYWxMYWJlbFR5cGUuVGl0bGUsIHJlc2V0KTtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbiA9IHRoaXMuY29tcHV0ZUxhYmVsKGluc3RhbmNlLCB0YWJzLmRlc2NyaXB0aW9uLCBUZXJtaW5hbExhYmVsVHlwZS5EZXNjcmlwdGlvbik7XG5cdFx0aWYgKHRoaXMuX3RpdGxlICE9PSBpbnN0YW5jZS50aXRsZSB8fCB0aGlzLl9kZXNjcmlwdGlvbiAhPT0gaW5zdGFuY2UuZGVzY3JpcHRpb24gfHwgcmVzZXQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGFiZWwuZmlyZSh7IHRpdGxlOiB0aGlzLl90aXRsZSwgZGVzY3JpcHRpb246IHRoaXMuX2Rlc2NyaXB0aW9uIH0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbXB1dGVMYWJlbChcblx0XHRpbnN0YW5jZTogUGljazxJVGVybWluYWxJbnN0YW5jZSwgJ3NoZWxsTGF1bmNoQ29uZmlnJyB8ICdzaGVsbFR5cGUnIHwgJ2N3ZCcgfCAnZml4ZWRDb2xzJyB8ICdmaXhlZFJvd3MnIHwgJ2luaXRpYWxDd2QnIHwgJ3Byb2Nlc3NOYW1lJyB8ICdzZXF1ZW5jZScgfCAndXNlckhvbWUnIHwgJ3dvcmtzcGFjZUZvbGRlcicgfCAnc3RhdGljVGl0bGUnIHwgJ2NhcGFiaWxpdGllcycgfCAndGl0bGUnIHwgJ2Rlc2NyaXB0aW9uJyB8ICdwcm9ncmVzc1N0YXRlJyB8ICdvcyc+LFxuXHRcdGxhYmVsVGVtcGxhdGU6IHN0cmluZyxcblx0XHRsYWJlbFR5cGU6IFRlcm1pbmFsTGFiZWxUeXBlLFxuXHRcdHJlc2V0PzogYm9vbGVhblxuXHQpIHtcblx0XHRjb25zdCB0eXBlID0gaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LnR5cGUgfHwgaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcudHlwZTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0Y29uc3QgcHJvbXB0SW5wdXRNb2RlbCA9IGNvbW1hbmREZXRlY3Rpb24/LnByb21wdElucHV0TW9kZWw7XG5cdFx0Y29uc3Qgbm9uVGFza1NwaW5uZXIgPSB0eXBlID09PSAnVGFzaycgPyAnJyA6ICcgJChsb2FkaW5nfnNwaW4pJztcblxuXHRcdGxldCBjd2QgPSBpbnN0YW5jZS5jd2QgfHwgaW5zdGFuY2UuaW5pdGlhbEN3ZCB8fCAnJztcblx0XHRjb25zdCBvcyA9IGluc3RhbmNlLm9zID8/IE9TO1xuXHRcdGN3ZCA9IHRpbGRpZnkoY3dkLCBpbnN0YW5jZS51c2VySG9tZSB8fCAnJywgb3MpO1xuXHRcdGlmIChvcyAhPT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgJiYgY3dkICYmIGluc3RhbmNlLnVzZXJIb21lICYmIGN3ZCA9PT0gaW5zdGFuY2UudXNlckhvbWUpIHtcblx0XHRcdGN3ZCA9ICd+Jztcblx0XHR9XG5cblx0XHRjb25zdCB0ZW1wbGF0ZVByb3BlcnRpZXM6IElUZXJtaW5hbExhYmVsVGVtcGxhdGVQcm9wZXJ0aWVzID0ge1xuXHRcdFx0Y3dkLFxuXHRcdFx0Y3dkRm9sZGVyOiAnJyxcblx0XHRcdHdvcmtzcGFjZUZvbGRlck5hbWU6IGluc3RhbmNlLndvcmtzcGFjZUZvbGRlcj8ubmFtZSxcblx0XHRcdHdvcmtzcGFjZUZvbGRlcjogaW5zdGFuY2Uud29ya3NwYWNlRm9sZGVyID8gcGF0aC5iYXNlbmFtZShpbnN0YW5jZS53b3Jrc3BhY2VGb2xkZXIudXJpLmZzUGF0aCkgOiB1bmRlZmluZWQsXG5cdFx0XHRsb2NhbDogdHlwZSA9PT0gJ0xvY2FsJyA/IHRlcm1pbmFsU3RyaW5ncy50eXBlTG9jYWwgOiB1bmRlZmluZWQsXG5cdFx0XHRwcm9jZXNzOiBpbnN0YW5jZS5wcm9jZXNzTmFtZSxcblx0XHRcdHNlcXVlbmNlOiBpbnN0YW5jZS5zZXF1ZW5jZSxcblx0XHRcdHRhc2s6IHR5cGUgPT09ICdUYXNrJyA/IHRlcm1pbmFsU3RyaW5ncy50eXBlVGFzayA6IHVuZGVmaW5lZCxcblx0XHRcdGZpeGVkRGltZW5zaW9uczogaW5zdGFuY2UuZml4ZWRDb2xzXG5cdFx0XHRcdD8gKGluc3RhbmNlLmZpeGVkUm93cyA/IGBcXHUyMTk0JHtpbnN0YW5jZS5maXhlZENvbHN9IFxcdTIxOTUke2luc3RhbmNlLmZpeGVkUm93c31gIDogYFxcdTIxOTQke2luc3RhbmNlLmZpeGVkQ29sc31gKVxuXHRcdFx0XHQ6IChpbnN0YW5jZS5maXhlZFJvd3MgPyBgXFx1MjE5NSR7aW5zdGFuY2UuZml4ZWRSb3dzfWAgOiAnJyksXG5cdFx0XHRzZXBhcmF0b3I6IHsgbGFiZWw6IHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLnRhYnMuc2VwYXJhdG9yIH0sXG5cdFx0XHRzaGVsbFR5cGU6IGluc3RhbmNlLnNoZWxsVHlwZSxcblx0XHRcdC8vIFNoZWxsIGNvbW1hbmQgcmVxdWlyZXMgaGlnaCBjb25maWRlbmNlXG5cdFx0XHRzaGVsbENvbW1hbmQ6IGNvbW1hbmREZXRlY3Rpb24/LmV4ZWN1dGluZ0NvbW1hbmQgJiYgY29tbWFuZERldGVjdGlvbi5leGVjdXRpbmdDb21tYW5kQ29uZmlkZW5jZSA9PT0gJ2hpZ2gnICYmIHByb21wdElucHV0TW9kZWxcblx0XHRcdFx0PyBwcm9tcHRJbnB1dE1vZGVsLnZhbHVlICsgbm9uVGFza1NwaW5uZXJcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHQvLyBTaGVsbCBwcm9tcHQgaW5wdXQgZG9lcyBub3QgcmVxdWlyZSBoaWdoIGNvbmZpZGVuY2UgYXMgaXQncyBsYXJnZWx5IGZvciBWUyBDb2RlIGRldmVsb3BlcnNcblx0XHRcdHNoZWxsUHJvbXB0SW5wdXQ6IGNvbW1hbmREZXRlY3Rpb24/LmV4ZWN1dGluZ0NvbW1hbmQgJiYgcHJvbXB0SW5wdXRNb2RlbFxuXHRcdFx0XHQ/IHByb21wdElucHV0TW9kZWwuZ2V0Q29tYmluZWRTdHJpbmcodHJ1ZSkgKyBub25UYXNrU3Bpbm5lclxuXHRcdFx0XHQ6IHByb21wdElucHV0TW9kZWw/LmdldENvbWJpbmVkU3RyaW5nKHRydWUpLFxuXHRcdFx0cHJvZ3Jlc3M6IHRoaXMuX2dldFByb2dyZXNzU3RhdGVTdHJpbmcoaW5zdGFuY2UucHJvZ3Jlc3NTdGF0ZSlcblx0XHR9O1xuXHRcdHRlbXBsYXRlUHJvcGVydGllcy53b3Jrc3BhY2VGb2xkZXJOYW1lID0gaW5zdGFuY2Uud29ya3NwYWNlRm9sZGVyPy5uYW1lID8/IHRlbXBsYXRlUHJvcGVydGllcy53b3Jrc3BhY2VGb2xkZXI7XG5cdFx0bGFiZWxUZW1wbGF0ZSA9IGxhYmVsVGVtcGxhdGUudHJpbSgpO1xuXHRcdGlmICghbGFiZWxUZW1wbGF0ZSkge1xuXHRcdFx0cmV0dXJuIGxhYmVsVHlwZSA9PT0gVGVybWluYWxMYWJlbFR5cGUuVGl0bGUgPyAoaW5zdGFuY2UucHJvY2Vzc05hbWUgfHwgJycpIDogJyc7XG5cdFx0fVxuXHRcdGlmICghcmVzZXQgJiYgaW5zdGFuY2Uuc3RhdGljVGl0bGUgJiYgbGFiZWxUeXBlID09PSBUZXJtaW5hbExhYmVsVHlwZS5UaXRsZSkge1xuXHRcdFx0cmV0dXJuIGluc3RhbmNlLnN0YXRpY1RpdGxlLnJlcGxhY2UoL1tcXG5cXHJcXHRdL2csICcnKSB8fCB0ZW1wbGF0ZVByb3BlcnRpZXMucHJvY2Vzcz8ucmVwbGFjZSgvW1xcblxcclxcdF0vZywgJycpIHx8ICcnO1xuXHRcdH1cblx0XHRjb25zdCBkZXRlY3Rpb24gPSBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Dd2REZXRlY3Rpb24pIHx8IGluc3RhbmNlLmNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5Lk5haXZlQ3dkRGV0ZWN0aW9uKTtcblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRjb25zdCBtdWx0aVJvb3RXb3Jrc3BhY2UgPSBmb2xkZXJzLmxlbmd0aCA+IDE7XG5cblx0XHQvLyBPbmx5IHNldCBjd2RGb2xkZXIgaWYgZGV0ZWN0aW9uIGlzIG9uXG5cdFx0aWYgKHRlbXBsYXRlUHJvcGVydGllcy5jd2QgJiYgZGV0ZWN0aW9uICYmICghaW5zdGFuY2Uuc2hlbGxMYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwgfHwgbGFiZWxUeXBlID09PSBUZXJtaW5hbExhYmVsVHlwZS5UaXRsZSkpIHtcblx0XHRcdGNvbnN0IGN3ZFVyaSA9IFVSSS5mcm9tKHtcblx0XHRcdFx0c2NoZW1lOiBpbnN0YW5jZS53b3Jrc3BhY2VGb2xkZXI/LnVyaS5zY2hlbWUgfHwgU2NoZW1hcy5maWxlLFxuXHRcdFx0XHRwYXRoOiBpbnN0YW5jZS5jd2QgPyBwYXRoLnJlc29sdmUoaW5zdGFuY2UuY3dkKSA6IHVuZGVmaW5lZFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBNdWx0aS1yb290IHdvcmtzcGFjZXMgYWx3YXlzIHNob3cgY3dkRm9sZGVyIHRvIGRpc2FtYmlndWF0ZSB0aGVtLCBvdGhlcndpc2Ugb25seSBzaG93XG5cdFx0XHQvLyB3aGVuIGl0IGRpZmZlcnMgZnJvbSB0aGUgd29ya3NwYWNlIGZvbGRlciBpbiB3aGljaCBpdCB3YXMgbGF1bmNoZWQgZnJvbVxuXHRcdFx0bGV0IHNob3dDd2QgPSBmYWxzZTtcblx0XHRcdGlmIChtdWx0aVJvb3RXb3Jrc3BhY2UpIHtcblx0XHRcdFx0c2hvd0N3ZCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKGluc3RhbmNlLndvcmtzcGFjZUZvbGRlcj8udXJpKSB7XG5cdFx0XHRcdGNvbnN0IGNhc2VTZW5zaXRpdmUgPSB0aGlzLl9maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KGluc3RhbmNlLndvcmtzcGFjZUZvbGRlci51cmksIEZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllcy5QYXRoQ2FzZVNlbnNpdGl2ZSk7XG5cdFx0XHRcdHNob3dDd2QgPSBjd2RVcmkuZnNQYXRoLmxvY2FsZUNvbXBhcmUoaW5zdGFuY2Uud29ya3NwYWNlRm9sZGVyLnVyaS5mc1BhdGgsIHVuZGVmaW5lZCwgeyBzZW5zaXRpdml0eTogY2FzZVNlbnNpdGl2ZSA/ICdjYXNlJyA6ICdiYXNlJyB9KSAhPT0gMDtcblx0XHRcdH1cblx0XHRcdGlmIChzaG93Q3dkKSB7XG5cdFx0XHRcdHRlbXBsYXRlUHJvcGVydGllcy5jd2RGb2xkZXIgPSBwYXRoLmJhc2VuYW1lKHRlbXBsYXRlUHJvcGVydGllcy5jd2QpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBzcGVjaWFsIGNoYXJhY3RlcnMgdGhhdCBjb3VsZCBtZXNzIHdpdGggcmVuZGVyaW5nXG5cdFx0Y29uc3QgbGFiZWwgPSB0ZW1wbGF0ZShsYWJlbFRlbXBsYXRlLCAodGVtcGxhdGVQcm9wZXJ0aWVzIGFzIHVua25vd24pIGFzIHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgSVNlcGFyYXRvciB8IHVuZGVmaW5lZCB8IG51bGwgfSkucmVwbGFjZSgvW1xcblxcclxcdF0vZywgJycpLnRyaW0oKTtcblx0XHRyZXR1cm4gbGFiZWwgPT09ICcnICYmIGxhYmVsVHlwZSA9PT0gVGVybWluYWxMYWJlbFR5cGUuVGl0bGUgPyAoaW5zdGFuY2UucHJvY2Vzc05hbWUgfHwgJycpIDogbGFiZWw7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRQcm9ncmVzc1N0YXRlU3RyaW5nKHByb2dyZXNzU3RhdGU/OiBJUHJvZ3Jlc3NTdGF0ZSk6IHN0cmluZyB7XG5cdFx0aWYgKCFwcm9ncmVzc1N0YXRlKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHN3aXRjaCAocHJvZ3Jlc3NTdGF0ZS5zdGF0ZSkge1xuXHRcdFx0Y2FzZSAwOiByZXR1cm4gJyc7XG5cdFx0XHRjYXNlIDE6IHJldHVybiBgJHtNYXRoLnJvdW5kKHByb2dyZXNzU3RhdGUudmFsdWUpfSVgO1xuXHRcdFx0Y2FzZSAyOiByZXR1cm4gJyQoZXJyb3IpJztcblx0XHRcdGNhc2UgMzogcmV0dXJuICckKGxvYWRpbmd+c3BpbiknO1xuXHRcdFx0Y2FzZSA0OiByZXR1cm4gJyQoYWxlcnQpJztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRXhpdFJlc3VsdChcblx0ZXhpdENvZGVPckVycm9yOiBJVGVybWluYWxMYXVuY2hFcnJvciB8IG51bWJlciB8IHVuZGVmaW5lZCxcblx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0cHJvY2Vzc1N0YXRlOiBQcm9jZXNzU3RhdGUsXG5cdGluaXRpYWxDd2Q6IHN0cmluZyB8IHVuZGVmaW5lZFxuKTogeyBjb2RlOiBudW1iZXIgfCB1bmRlZmluZWQ7IG1lc3NhZ2U6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkIHtcblx0Ly8gT25seSByZXR1cm4gYSBtZXNzYWdlIGlmIHRoZSBleGl0IGNvZGUgaXMgbm9uLXplcm9cblx0aWYgKGV4aXRDb2RlT3JFcnJvciA9PT0gdW5kZWZpbmVkIHx8IGV4aXRDb2RlT3JFcnJvciA9PT0gMCkge1xuXHRcdHJldHVybiB7IGNvZGU6IGV4aXRDb2RlT3JFcnJvciwgbWVzc2FnZTogdW5kZWZpbmVkIH07XG5cdH1cblxuXHRjb25zdCBjb2RlID0gaXNOdW1iZXIoZXhpdENvZGVPckVycm9yKSA/IGV4aXRDb2RlT3JFcnJvciA6IGV4aXRDb2RlT3JFcnJvci5jb2RlO1xuXG5cdC8vIENyZWF0ZSBleGl0IGNvZGUgbWVzc2FnZVxuXHRsZXQgbWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRzd2l0Y2ggKHR5cGVvZiBleGl0Q29kZU9yRXJyb3IpIHtcblx0XHRjYXNlICdudW1iZXInOiB7XG5cdFx0XHRsZXQgY29tbWFuZExpbmU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlKSB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lID0gc2hlbGxMYXVuY2hDb25maWcuZXhlY3V0YWJsZTtcblx0XHRcdFx0aWYgKGlzU3RyaW5nKHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MpKSB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmUgKz0gYCAke3NoZWxsTGF1bmNoQ29uZmlnLmFyZ3N9YDtcblx0XHRcdFx0fSBlbHNlIGlmIChzaGVsbExhdW5jaENvbmZpZy5hcmdzICYmIHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29tbWFuZExpbmUgKz0gc2hlbGxMYXVuY2hDb25maWcuYXJncy5tYXAoYSA9PiBgICcke2F9J2ApLmpvaW4oKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2Nlc3NTdGF0ZSA9PT0gUHJvY2Vzc1N0YXRlLktpbGxlZER1cmluZ0xhdW5jaCkge1xuXHRcdFx0XHRpZiAoY29tbWFuZExpbmUpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdsYXVuY2hGYWlsZWQuZXhpdENvZGVBbmRDb21tYW5kTGluZScsIFwiVGhlIHRlcm1pbmFsIHByb2Nlc3MgXFxcInswfVxcXCIgZmFpbGVkIHRvIGxhdW5jaCAoZXhpdCBjb2RlOiB7MX0pLlwiLCBjb21tYW5kTGluZSwgY29kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnbGF1bmNoRmFpbGVkLmV4aXRDb2RlT25seScsIFwiVGhlIHRlcm1pbmFsIHByb2Nlc3MgZmFpbGVkIHRvIGxhdW5jaCAoZXhpdCBjb2RlOiB7MH0pLlwiLCBjb2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKGNvbW1hbmRMaW5lKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgndGVybWluYXRlZC5leGl0Q29kZUFuZENvbW1hbmRMaW5lJywgXCJUaGUgdGVybWluYWwgcHJvY2VzcyBcXFwiezB9XFxcIiB0ZXJtaW5hdGVkIHdpdGggZXhpdCBjb2RlOiB7MX0uXCIsIGNvbW1hbmRMaW5lLCBjb2RlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCd0ZXJtaW5hdGVkLmV4aXRDb2RlT25seScsIFwiVGhlIHRlcm1pbmFsIHByb2Nlc3MgdGVybWluYXRlZCB3aXRoIGV4aXQgY29kZTogezB9LlwiLCBjb2RlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGNhc2UgJ29iamVjdCc6IHtcblx0XHRcdC8vIElnbm9yZSBpbnRlcm5hbCBlcnJvcnNcblx0XHRcdGlmIChleGl0Q29kZU9yRXJyb3IubWVzc2FnZS50b1N0cmluZygpLmluY2x1ZGVzKCdDb3VsZCBub3QgZmluZCBwdHkgd2l0aCBpZCcpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ29udmVydCBjb25wdHkgY29kZS1iYXNlZCBmYWlsdXJlcyBpbnRvIGh1bWFuIGZyaWVuZGx5IG1lc3NhZ2VzXG5cdFx0XHRsZXQgaW5uZXJNZXNzYWdlID0gZXhpdENvZGVPckVycm9yLm1lc3NhZ2U7XG5cdFx0XHRjb25zdCBjb25wdHlFcnJvciA9IGV4aXRDb2RlT3JFcnJvci5tZXNzYWdlLm1hdGNoKC8uKmVycm9yIGNvZGU6XFxzKihcXGQrKS4qJC8pO1xuXHRcdFx0aWYgKGNvbnB0eUVycm9yKSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yQ29kZSA9IGNvbnB0eUVycm9yLmxlbmd0aCA+IDEgPyBwYXJzZUludChjb25wdHlFcnJvclsxXSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHN3aXRjaCAoZXJyb3JDb2RlKSB7XG5cdFx0XHRcdFx0Y2FzZSA1OlxuXHRcdFx0XHRcdFx0aW5uZXJNZXNzYWdlID0gYEFjY2VzcyB3YXMgZGVuaWVkIHRvIHRoZSBwYXRoIGNvbnRhaW5pbmcgeW91ciBleGVjdXRhYmxlIFwiJHtzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlfVwiLiBNYW5hZ2UgYW5kIGNoYW5nZSB5b3VyIHBlcm1pc3Npb25zIHRvIGdldCB0aGlzIHRvIHdvcmtgO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAyNjc6XG5cdFx0XHRcdFx0XHRpbm5lck1lc3NhZ2UgPSBgSW52YWxpZCBzdGFydGluZyBkaXJlY3RvcnkgXCIke2luaXRpYWxDd2R9XCIsIHJldmlldyB5b3VyIHRlcm1pbmFsLmludGVncmF0ZWQuY3dkIHNldHRpbmdgO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAxMjYwOlxuXHRcdFx0XHRcdFx0aW5uZXJNZXNzYWdlID0gYFdpbmRvd3MgY2Fubm90IG9wZW4gdGhpcyBwcm9ncmFtIGJlY2F1c2UgaXQgaGFzIGJlZW4gcHJldmVudGVkIGJ5IGEgc29mdHdhcmUgcmVzdHJpY3Rpb24gcG9saWN5LiBGb3IgbW9yZSBpbmZvcm1hdGlvbiwgb3BlbiBFdmVudCBWaWV3ZXIgb3IgY29udGFjdCB5b3VyIHN5c3RlbSBBZG1pbmlzdHJhdG9yYDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdsYXVuY2hGYWlsZWQuZXJyb3JNZXNzYWdlJywgXCJUaGUgdGVybWluYWwgcHJvY2VzcyBmYWlsZWQgdG8gbGF1bmNoOiB7MH0uXCIsIGlubmVyTWVzc2FnZSk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4geyBjb2RlLCBtZXNzYWdlIH07XG59XG5cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsSW5zdGFuY2VDb2xvclByb3ZpZGVyIGltcGxlbWVudHMgSVh0ZXJtQ29sb3JQcm92aWRlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhcmdldDogSVJlZmVyZW5jZTxUZXJtaW5hbExvY2F0aW9uIHwgdW5kZWZpbmVkPixcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0Z2V0QmFja2dyb3VuZENvbG9yKHRoZW1lOiBJQ29sb3JUaGVtZSkge1xuXHRcdGNvbnN0IHRlcm1pbmFsQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRFUk1JTkFMX0JBQ0tHUk9VTkRfQ09MT1IpO1xuXHRcdGlmICh0ZXJtaW5hbEJhY2tncm91bmQpIHtcblx0XHRcdHJldHVybiB0ZXJtaW5hbEJhY2tncm91bmQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl90YXJnZXQub2JqZWN0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0cmV0dXJuIHRoZW1lLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpO1xuXHRcdH1cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKFRFUk1JTkFMX1ZJRVdfSUQpITtcblx0XHRpZiAobG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCkge1xuXHRcdFx0cmV0dXJuIHRoZW1lLmdldENvbG9yKFBBTkVMX0JBQ0tHUk9VTkQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhlbWUuZ2V0Q29sb3IoU0lERV9CQVJfQkFDS0dST1VORCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ3Vlc3NTaGVsbFR5cGVGcm9tRXhlY3V0YWJsZShvczogT3BlcmF0aW5nU3lzdGVtLCBleGVjdXRhYmxlOiBzdHJpbmcpOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGV4ZUJhc2VuYW1lID0gcGF0aC5iYXNlbmFtZShleGVjdXRhYmxlKTtcblx0Y29uc3QgZ2VuZXJhbFNoZWxsVHlwZU1hcDogTWFwPFRlcm1pbmFsU2hlbGxUeXBlLCBSZWdFeHA+ID0gbmV3IE1hcChbXG5cdFx0W0dlbmVyYWxTaGVsbFR5cGUuSnVsaWEsIC9eanVsaWEkL10sXG5cdFx0W0dlbmVyYWxTaGVsbFR5cGUuTm9kZSwgL15ub2RlJC9dLFxuXHRcdFtHZW5lcmFsU2hlbGxUeXBlLk51U2hlbGwsIC9ebnUkL10sXG5cdFx0W0dlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbCwgL15wd3NoKC1wcmV2aWV3KT98cG93ZXJzaGVsbCQvXSxcblx0XHRbR2VuZXJhbFNoZWxsVHlwZS5QeXRob24sIC9ecHkoPzp0aG9uKT8kL10sXG5cdFx0W0dlbmVyYWxTaGVsbFR5cGUuWG9uc2gsIC9eeG9uc2gvXVxuXHRdKTtcblx0Zm9yIChjb25zdCBbc2hlbGxUeXBlLCBwYXR0ZXJuXSBvZiBnZW5lcmFsU2hlbGxUeXBlTWFwKSB7XG5cdFx0aWYgKGV4ZUJhc2VuYW1lLm1hdGNoKHBhdHRlcm4pKSB7XG5cdFx0XHRyZXR1cm4gc2hlbGxUeXBlO1xuXHRcdH1cblx0fVxuXG5cdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRjb25zdCB3aW5kb3dzU2hlbGxUeXBlTWFwOiBNYXA8VGVybWluYWxTaGVsbFR5cGUsIFJlZ0V4cD4gPSBuZXcgTWFwKFtcblx0XHRcdFtXaW5kb3dzU2hlbGxUeXBlLkNvbW1hbmRQcm9tcHQsIC9eY21kJC9dLFxuXHRcdFx0W1dpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCwgL15iYXNoJC9dLFxuXHRcdFx0W1dpbmRvd3NTaGVsbFR5cGUuV3NsLCAvXndzbCQvXVxuXHRcdF0pO1xuXHRcdGZvciAoY29uc3QgW3NoZWxsVHlwZSwgcGF0dGVybl0gb2Ygd2luZG93c1NoZWxsVHlwZU1hcCkge1xuXHRcdFx0aWYgKGV4ZUJhc2VuYW1lLm1hdGNoKHBhdHRlcm4pKSB7XG5cdFx0XHRcdHJldHVybiBzaGVsbFR5cGU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHBvc2l4U2hlbGxUeXBlczogUG9zaXhTaGVsbFR5cGVbXSA9IFtcblx0XHRcdFBvc2l4U2hlbGxUeXBlLkJhc2gsXG5cdFx0XHRQb3NpeFNoZWxsVHlwZS5Dc2gsXG5cdFx0XHRQb3NpeFNoZWxsVHlwZS5GaXNoLFxuXHRcdFx0UG9zaXhTaGVsbFR5cGUuS3NoLFxuXHRcdFx0UG9zaXhTaGVsbFR5cGUuU2gsXG5cdFx0XHRQb3NpeFNoZWxsVHlwZS5ac2gsXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHR5cGUgb2YgcG9zaXhTaGVsbFR5cGVzKSB7XG5cdFx0XHRpZiAoZXhlQmFzZW5hbWUgPT09IHR5cGUpIHtcblx0XHRcdFx0cmV0dXJuIHR5cGU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFt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QkFBaUIsUUFBUTtBQUNwRCxhQUFPLE1BQU0sU0FBUyxnQkFBZ0I7QUFBQSxJQUN2QztBQUNBLFVBQU0sV0FBVyxLQUFLLHVCQUF1QixvQkFBb0IsZ0JBQWdCO0FBQ2pGLFFBQUksYUFBYSxzQkFBc0IsT0FBTztBQUM3QyxhQUFPLE1BQU0sU0FBUyxnQkFBZ0I7QUFBQSxJQUN2QztBQUNBLFdBQU8sTUFBTSxTQUFTLG1CQUFtQjtBQUFBLEVBQzFDO0FBQ0Q7QUFyQmEsZ0NBQU47QUFBQSxFQUdKO0FBQUEsR0FIVTtBQXVCYixTQUFTLDZCQUE2QixJQUFxQixZQUFtRDtBQUM3RyxRQUFNLGNBQWMsS0FBSyxTQUFTLFVBQVU7QUFDNUMsUUFBTSxzQkFBc0Qsb0JBQUksSUFBSTtBQUFBLElBQ25FLENBQUMsaUJBQWlCLE9BQU8sU0FBUztBQUFBLElBQ2xDLENBQUMsaUJBQWlCLE1BQU0sUUFBUTtBQUFBLElBQ2hDLENBQUMsaUJBQWlCLFNBQVMsTUFBTTtBQUFBLElBQ2pDLENBQUMsaUJBQWlCLFlBQVksOEJBQThCO0FBQUEsSUFDNUQsQ0FBQyxpQkFBaUIsUUFBUSxlQUFlO0FBQUEsSUFDekMsQ0FBQyxpQkFBaUIsT0FBTyxRQUFRO0FBQUEsRUFDbEMsQ0FBQztBQUNELGFBQVcsQ0FBQyxXQUFXLE9BQU8sS0FBSyxxQkFBcUI7QUFDdkQsUUFBSSxZQUFZLE1BQU0sT0FBTyxHQUFHO0FBQy9CLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUVBLE1BQUksT0FBTyxnQkFBZ0IsU0FBUztBQUNuQyxVQUFNLHNCQUFzRCxvQkFBSSxJQUFJO0FBQUEsTUFDbkUsQ0FBQyxpQkFBaUIsZUFBZSxPQUFPO0FBQUEsTUFDeEMsQ0FBQyxpQkFBaUIsU0FBUyxRQUFRO0FBQUEsTUFDbkMsQ0FBQyxpQkFBaUIsS0FBSyxPQUFPO0FBQUEsSUFDL0IsQ0FBQztBQUNELGVBQVcsQ0FBQyxXQUFXLE9BQU8sS0FBSyxxQkFBcUI7QUFDdkQsVUFBSSxZQUFZLE1BQU0sT0FBTyxHQUFHO0FBQy9CLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0QsT0FBTztBQUNOLFVBQU0sa0JBQW9DO0FBQUEsTUFDekMsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLE1BQ2YsZUFBZTtBQUFBLElBQ2hCO0FBQ0EsZUFBVyxRQUFRLGlCQUFpQjtBQUNuQyxVQUFJLGdCQUFnQixNQUFNO0FBQ3pCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIkNvbnN0YW50cyIsICJlIiwgInh0ZXJtIiwgInBhdGgiLCAiaSIsICJUZXJtaW5hbExhYmVsVHlwZSJdCn0K
