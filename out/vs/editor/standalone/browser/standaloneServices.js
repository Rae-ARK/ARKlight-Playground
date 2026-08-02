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
import "../../../platform/hover/browser/hoverService.js";
import "../../../platform/undoRedo/common/undoRedoService.js";
import "../../browser/services/inlineCompletionsService.js";
import "../../common/services/languageFeatureDebounce.js";
import "../../common/services/languageFeaturesService.js";
import "../../common/services/semanticTokensStylingService.js";
import "./standaloneCodeEditorService.js";
import "./standaloneLayoutService.js";
import * as dom from "../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { mainWindow } from "../../../base/browser/window.js";
import { onUnexpectedError } from "../../../base/common/errors.js";
import { Emitter, Event, ValueWithChangeEvent } from "../../../base/common/event.js";
import { KeyCodeChord, decodeKeybinding } from "../../../base/common/keybindings.js";
import { Disposable, DisposableStore, ImmortalReference, combinedDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { OS, isLinux, isMacintosh } from "../../../base/common/platform.js";
import { basename } from "../../../base/common/resources.js";
import Severity from "../../../base/common/severity.js";
import * as strings from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { AccessibilityService } from "../../../platform/accessibility/browser/accessibilityService.js";
import { IAccessibilityService } from "../../../platform/accessibility/common/accessibility.js";
import { IAccessibilitySignalService } from "../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IMenuService } from "../../../platform/actions/common/actions.js";
import { MenuService } from "../../../platform/actions/common/menuService.js";
import { BrowserClipboardService } from "../../../platform/clipboard/browser/clipboardService.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { CommandsRegistry, ICommandService } from "../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { Configuration, ConfigurationChangeEvent, ConfigurationModel } from "../../../platform/configuration/common/configurationModels.js";
import { DefaultConfiguration } from "../../../platform/configuration/common/configurations.js";
import { ContextKeyService } from "../../../platform/contextkey/browser/contextKeyService.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { ContextMenuService } from "../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService, IContextViewService } from "../../../platform/contextview/browser/contextView.js";
import { ContextViewService } from "../../../platform/contextview/browser/contextViewService.js";
import { IDataChannelService, NullDataChannelService } from "../../../platform/dataChannel/common/dataChannel.js";
import { IDefaultAccountService } from "../../../platform/defaultAccount/common/defaultAccount.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { InstantiationType, getSingletonServiceDescriptors, registerSingleton } from "../../../platform/instantiation/common/extensions.js";
import { IInstantiationService, createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { InstantiationService } from "../../../platform/instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../platform/instantiation/common/serviceCollection.js";
import { AbstractKeybindingService } from "../../../platform/keybinding/common/abstractKeybindingService.js";
import { IKeybindingService } from "../../../platform/keybinding/common/keybinding.js";
import { KeybindingResolver } from "../../../platform/keybinding/common/keybindingResolver.js";
import { KeybindingsRegistry } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { ResolvedKeybindingItem } from "../../../platform/keybinding/common/resolvedKeybindingItem.js";
import { USLayoutResolvedKeybinding } from "../../../platform/keybinding/common/usLayoutResolvedKeybinding.js";
import { ILabelService } from "../../../platform/label/common/label.js";
import { ILayoutService } from "../../../platform/layout/browser/layoutService.js";
import { IListService, ListService } from "../../../platform/list/browser/listService.js";
import { ConsoleLogger, ILogService, ILoggerService, NullLoggerService } from "../../../platform/log/common/log.js";
import { LogService } from "../../../platform/log/common/logService.js";
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { MarkerService } from "../../../platform/markers/common/markerService.js";
import { INotificationService, NoOpNotification, NotificationsFilter } from "../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../platform/opener/common/opener.js";
import { IEditorProgressService, IProgressService } from "../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../platform/quickinput/common/quickInput.js";
import { IStorageService, InMemoryStorageService } from "../../../platform/storage/common/storage.js";
import { ITelemetryService, TelemetryLevel } from "../../../platform/telemetry/common/telemetry.js";
import { IUserInteractionService } from "../../../platform/userInteraction/browser/userInteractionService.js";
import { UserInteractionService } from "../../../platform/userInteraction/browser/userInteractionServiceImpl.js";
import { IWebWorkerService } from "../../../platform/webWorker/browser/webWorkerService.js";
import { IWorkspaceContextService, STANDALONE_EDITOR_WORKSPACE_ID, WorkbenchState, WorkspaceFolder } from "../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../platform/workspace/common/workspaceTrust.js";
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from "../../browser/services/bulkEditService.js";
import { ICodeEditorService } from "../../browser/services/codeEditorService.js";
import { OpenerService } from "../../browser/services/openerService.js";
import { IRenameSymbolTrackerService, NullRenameSymbolTrackerService } from "../../browser/services/renameSymbolTrackerService.js";
import { isDiffEditorConfigurationKey, isEditorConfigurationKey } from "../../common/config/editorConfigurationSchema.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { EditOperation } from "../../common/core/editOperation.js";
import { Position as Pos } from "../../common/core/position.js";
import { Range } from "../../common/core/range.js";
import { getEditorFeatures } from "../../common/editorFeatures.js";
import { ILanguageService } from "../../common/languages/language.js";
import { LanguageService } from "../../common/services/languageService.js";
import { IMarkerDecorationsService } from "../../common/services/markerDecorations.js";
import { MarkerDecorationsService } from "../../common/services/markerDecorationsService.js";
import { IModelService } from "../../common/services/model.js";
import { ModelService } from "../../common/services/modelService.js";
import { ITextModelService } from "../../common/services/resolverService.js";
import { ITextResourceConfigurationService, ITextResourcePropertiesService } from "../../common/services/textResourceConfiguration.js";
import { ITreeSitterLibraryService } from "../../common/services/treeSitter/treeSitterLibraryService.js";
import { StandaloneServicesNLS } from "../../common/standaloneStrings.js";
import { IStandaloneThemeService } from "../common/standaloneTheme.js";
import { StandaloneQuickInputService } from "./quickInput/standaloneQuickInputService.js";
import { StandaloneWebWorkerService } from "./services/standaloneWebWorkerService.js";
import { StandaloneThemeService } from "./standaloneThemeService.js";
import { StandaloneTreeSitterLibraryService } from "./standaloneTreeSitterLibraryService.js";
class SimpleModel {
  constructor(model) {
    this.disposed = false;
    this.model = model;
    this._onWillDispose = new Emitter();
  }
  get onWillDispose() {
    return this._onWillDispose.event;
  }
  resolve() {
    return Promise.resolve();
  }
  get textEditorModel() {
    return this.model;
  }
  createSnapshot() {
    return this.model.createSnapshot();
  }
  isReadonly() {
    return false;
  }
  dispose() {
    this.disposed = true;
    this._onWillDispose.fire();
  }
  isDisposed() {
    return this.disposed;
  }
  isResolved() {
    return true;
  }
  getLanguageId() {
    return this.model.getLanguageId();
  }
}
let StandaloneTextModelService = class {
  constructor(modelService) {
    this.modelService = modelService;
  }
  createModelReference(resource) {
    const model = this.modelService.getModel(resource);
    if (!model) {
      return Promise.reject(new Error(`Model not found`));
    }
    return Promise.resolve(new ImmortalReference(new SimpleModel(model)));
  }
  registerTextModelContentProvider(scheme, provider) {
    return {
      dispose: function() {
      }
    };
  }
  canHandleResource(resource) {
    return false;
  }
};
StandaloneTextModelService = __decorateClass([
  __decorateParam(0, IModelService)
], StandaloneTextModelService);
const _StandaloneEditorProgressService = class _StandaloneEditorProgressService {
  show() {
    return _StandaloneEditorProgressService.NULL_PROGRESS_RUNNER;
  }
  async showWhile(promise, delay) {
    await promise;
  }
};
_StandaloneEditorProgressService.NULL_PROGRESS_RUNNER = {
  done: () => {
  },
  total: () => {
  },
  worked: () => {
  }
};
let StandaloneEditorProgressService = _StandaloneEditorProgressService;
class StandaloneProgressService {
  withProgress(_options, task, onDidCancel) {
    return task({
      report: () => {
      }
    });
  }
}
class StandaloneEnvironmentService {
  constructor() {
    this.stateResource = URI.from({ scheme: "monaco", authority: "stateResource" });
    this.userRoamingDataHome = URI.from({ scheme: "monaco", authority: "userRoamingDataHome" });
    this.keyboardLayoutResource = URI.from({ scheme: "monaco", authority: "keyboardLayoutResource" });
    this.argvResource = URI.from({ scheme: "monaco", authority: "argvResource" });
    this.untitledWorkspacesHome = URI.from({ scheme: "monaco", authority: "untitledWorkspacesHome" });
    this.workspaceStorageHome = URI.from({ scheme: "monaco", authority: "workspaceStorageHome" });
    this.appSharedDataHome = URI.from({ scheme: "monaco", authority: "appSharedDataHome" });
    this.localHistoryHome = URI.from({ scheme: "monaco", authority: "localHistoryHome" });
    this.cacheHome = URI.from({ scheme: "monaco", authority: "cacheHome" });
    this.userDataSyncHome = URI.from({ scheme: "monaco", authority: "userDataSyncHome" });
    this.sync = void 0;
    this.continueOn = void 0;
    this.editSessionId = void 0;
    this.debugExtensionHost = { port: null, break: false };
    this.isExtensionDevelopment = false;
    this.disableExtensions = false;
    this.disableExperiments = false;
    this.enableExtensions = void 0;
    this.extensionDevelopmentLocationURI = void 0;
    this.extensionDevelopmentKind = void 0;
    this.extensionTestsLocationURI = void 0;
    this.logsHome = URI.from({ scheme: "monaco", authority: "logsHome" });
    this.logLevel = void 0;
    this.extensionLogLevel = void 0;
    this.verbose = false;
    this.isBuilt = false;
    this.disableTelemetry = false;
    this.serviceMachineIdResource = URI.from({ scheme: "monaco", authority: "serviceMachineIdResource" });
    this.agentSessionsWorkspace = URI.from({ scheme: "monaco", authority: "agentSessionsWorkspace" });
    this.policyFile = void 0;
  }
}
class StandaloneDialogService {
  constructor() {
    this.onWillShowDialog = Event.None;
    this.onDidShowDialog = Event.None;
  }
  async confirm(confirmation) {
    const confirmed = this.doConfirm(confirmation.message, confirmation.detail);
    return {
      confirmed,
      checkboxChecked: false
      // unsupported
    };
  }
  doConfirm(message, detail) {
    let messageText = message;
    if (detail) {
      messageText = messageText + "\n\n" + detail;
    }
    return mainWindow.confirm(messageText);
  }
  async prompt(prompt) {
    let result = void 0;
    const confirmed = this.doConfirm(prompt.message, prompt.detail);
    if (confirmed) {
      const promptButtons = [...prompt.buttons ?? []];
      if (prompt.cancelButton && typeof prompt.cancelButton !== "string" && typeof prompt.cancelButton !== "boolean") {
        promptButtons.push(prompt.cancelButton);
      }
      result = await promptButtons[0]?.run({ checkboxChecked: false });
    }
    return { result };
  }
  async info(message, detail) {
    await this.prompt({ type: Severity.Info, message, detail });
  }
  async warn(message, detail) {
    await this.prompt({ type: Severity.Warning, message, detail });
  }
  async error(message, detail) {
    await this.prompt({ type: Severity.Error, message, detail });
  }
  input() {
    return Promise.resolve({ confirmed: false });
  }
  about() {
    return Promise.resolve(void 0);
  }
}
const _StandaloneNotificationService = class _StandaloneNotificationService {
  constructor() {
    this.onDidChangeFilter = Event.None;
  }
  info(message) {
    return this.notify({ severity: Severity.Info, message });
  }
  warn(message) {
    return this.notify({ severity: Severity.Warning, message });
  }
  error(error) {
    return this.notify({ severity: Severity.Error, message: error });
  }
  notify(notification) {
    switch (notification.severity) {
      case Severity.Error:
        console.error(notification.message);
        break;
      case Severity.Warning:
        console.warn(notification.message);
        break;
      default:
        console.log(notification.message);
        break;
    }
    return _StandaloneNotificationService.NO_OP;
  }
  prompt(severity, message, choices, options) {
    return _StandaloneNotificationService.NO_OP;
  }
  status(message, options) {
    return { close: () => {
    } };
  }
  setFilter(filter) {
  }
  getFilter(source) {
    return NotificationsFilter.OFF;
  }
  getFilters() {
    return [];
  }
  removeFilter(sourceId) {
  }
};
_StandaloneNotificationService.NO_OP = new NoOpNotification();
let StandaloneNotificationService = _StandaloneNotificationService;
let StandaloneCommandService = class {
  constructor(instantiationService) {
    this._onWillExecuteCommand = new Emitter();
    this._onDidExecuteCommand = new Emitter();
    this.onWillExecuteCommand = this._onWillExecuteCommand.event;
    this.onDidExecuteCommand = this._onDidExecuteCommand.event;
    this._instantiationService = instantiationService;
  }
  executeCommand(id, ...args) {
    const command = CommandsRegistry.getCommand(id);
    if (!command) {
      return Promise.reject(new Error(`command '${id}' not found`));
    }
    try {
      this._onWillExecuteCommand.fire({ commandId: id, args });
      const result = this._instantiationService.invokeFunction.apply(this._instantiationService, [command.handler, ...args]);
      this._onDidExecuteCommand.fire({ commandId: id, args });
      return Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err);
    }
  }
};
StandaloneCommandService = __decorateClass([
  __decorateParam(0, IInstantiationService)
], StandaloneCommandService);
let StandaloneKeybindingService = class extends AbstractKeybindingService {
  constructor(contextKeyService, commandService, telemetryService, notificationService, logService, codeEditorService) {
    super(contextKeyService, commandService, telemetryService, notificationService, logService);
    this._cachedResolver = null;
    this._dynamicKeybindings = [];
    this._domNodeListeners = [];
    const addContainer = (domNode) => {
      const disposables = new DisposableStore();
      disposables.add(dom.addDisposableListener(domNode, dom.EventType.KEY_DOWN, (e) => {
        const keyEvent = new StandardKeyboardEvent(e);
        const shouldPreventDefault = this._dispatch(keyEvent, keyEvent.target);
        if (shouldPreventDefault) {
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
        }
      }));
      disposables.add(dom.addDisposableListener(domNode, dom.EventType.KEY_UP, (e) => {
        const keyEvent = new StandardKeyboardEvent(e);
        const shouldPreventDefault = this._singleModifierDispatch(keyEvent, keyEvent.target);
        if (shouldPreventDefault) {
          keyEvent.preventDefault();
        }
      }));
      this._domNodeListeners.push(new DomNodeListeners(domNode, disposables));
    };
    const removeContainer = (domNode) => {
      for (let i = 0; i < this._domNodeListeners.length; i++) {
        const domNodeListeners = this._domNodeListeners[i];
        if (domNodeListeners.domNode === domNode) {
          this._domNodeListeners.splice(i, 1);
          domNodeListeners.dispose();
        }
      }
    };
    const addCodeEditor = (codeEditor) => {
      if (codeEditor.getOption(EditorOption.inDiffEditor)) {
        return;
      }
      addContainer(codeEditor.getContainerDomNode());
    };
    const removeCodeEditor = (codeEditor) => {
      if (codeEditor.getOption(EditorOption.inDiffEditor)) {
        return;
      }
      removeContainer(codeEditor.getContainerDomNode());
    };
    this._register(codeEditorService.onCodeEditorAdd(addCodeEditor));
    this._register(codeEditorService.onCodeEditorRemove(removeCodeEditor));
    codeEditorService.listCodeEditors().forEach(addCodeEditor);
    const addDiffEditor = (diffEditor) => {
      addContainer(diffEditor.getContainerDomNode());
    };
    const removeDiffEditor = (diffEditor) => {
      removeContainer(diffEditor.getContainerDomNode());
    };
    this._register(codeEditorService.onDiffEditorAdd(addDiffEditor));
    this._register(codeEditorService.onDiffEditorRemove(removeDiffEditor));
    codeEditorService.listDiffEditors().forEach(addDiffEditor);
  }
  addDynamicKeybinding(command, keybinding, handler, when) {
    return combinedDisposable(
      CommandsRegistry.registerCommand(command, handler),
      this.addDynamicKeybindings([{
        keybinding,
        command,
        when
      }])
    );
  }
  addDynamicKeybindings(rules) {
    const entries = rules.map((rule) => {
      const keybinding = decodeKeybinding(rule.keybinding, OS);
      return {
        keybinding,
        command: rule.command ?? null,
        commandArgs: rule.commandArgs,
        when: rule.when,
        weight1: 1e3,
        weight2: 0,
        extensionId: null,
        isBuiltinExtension: false
      };
    });
    this._dynamicKeybindings = this._dynamicKeybindings.concat(entries);
    this.updateResolver();
    return toDisposable(() => {
      for (let i = 0; i < this._dynamicKeybindings.length; i++) {
        if (this._dynamicKeybindings[i] === entries[0]) {
          this._dynamicKeybindings.splice(i, entries.length);
          this.updateResolver();
          return;
        }
      }
    });
  }
  updateResolver() {
    this._cachedResolver = null;
    this._onDidUpdateKeybindings.fire();
  }
  _getResolver() {
    if (!this._cachedResolver) {
      const defaults = this._toNormalizedKeybindingItems(KeybindingsRegistry.getDefaultKeybindings(), true);
      const overrides = this._toNormalizedKeybindingItems(this._dynamicKeybindings, false);
      this._cachedResolver = new KeybindingResolver(defaults, overrides, (str) => this._log(str));
    }
    return this._cachedResolver;
  }
  _documentHasFocus() {
    return mainWindow.document.hasFocus();
  }
  _toNormalizedKeybindingItems(items, isDefault) {
    const result = [];
    let resultLen = 0;
    for (const item of items) {
      const when = item.when || void 0;
      const keybinding = item.keybinding;
      if (!keybinding) {
        result[resultLen++] = new ResolvedKeybindingItem(void 0, item.command, item.commandArgs, when, isDefault, null, false);
      } else {
        const resolvedKeybindings = USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
        for (const resolvedKeybinding of resolvedKeybindings) {
          result[resultLen++] = new ResolvedKeybindingItem(resolvedKeybinding, item.command, item.commandArgs, when, isDefault, null, false);
        }
      }
    }
    return result;
  }
  resolveKeybinding(keybinding) {
    return USLayoutResolvedKeybinding.resolveKeybinding(keybinding, OS);
  }
  resolveKeyboardEvent(keyboardEvent) {
    const chord = new KeyCodeChord(
      keyboardEvent.ctrlKey,
      keyboardEvent.shiftKey,
      keyboardEvent.altKey,
      keyboardEvent.metaKey,
      keyboardEvent.keyCode
    );
    return new USLayoutResolvedKeybinding([chord], OS);
  }
  resolveUserBinding(userBinding) {
    return [];
  }
  _dumpDebugInfo() {
    return "";
  }
  _dumpDebugInfoJSON() {
    return "";
  }
  registerSchemaContribution(contribution) {
    return Disposable.None;
  }
  /**
   * not yet supported
   */
  enableKeybindingHoldMode(commandId) {
    return void 0;
  }
};
StandaloneKeybindingService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, ICodeEditorService)
], StandaloneKeybindingService);
class DomNodeListeners extends Disposable {
  constructor(domNode, disposables) {
    super();
    this.domNode = domNode;
    this._register(disposables);
  }
}
function isConfigurationOverrides(thing) {
  return !!thing && typeof thing === "object" && (!thing.overrideIdentifier || typeof thing.overrideIdentifier === "string") && (!thing.resource || thing.resource instanceof URI);
}
let StandaloneConfigurationService = class {
  constructor(logService) {
    this.logService = logService;
    this._onDidChangeConfiguration = new Emitter();
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    const defaultConfiguration = new DefaultConfiguration(logService);
    this._configuration = new Configuration(
      defaultConfiguration.reload(),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      logService
    );
    defaultConfiguration.dispose();
  }
  getValue(arg1, arg2) {
    const section = typeof arg1 === "string" ? arg1 : void 0;
    const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
    return this._configuration.getValue(section, overrides, void 0);
  }
  updateValues(values) {
    const previous = { data: this._configuration.toData() };
    const changedKeys = [];
    for (const entry of values) {
      const [key, value] = entry;
      if (this.getValue(key) === value) {
        continue;
      }
      this._configuration.updateValue(key, value);
      changedKeys.push(key);
    }
    if (changedKeys.length > 0) {
      const configurationChangeEvent = new ConfigurationChangeEvent({ keys: changedKeys, overrides: [] }, previous, this._configuration, void 0, this.logService);
      configurationChangeEvent.source = ConfigurationTarget.MEMORY;
      this._onDidChangeConfiguration.fire(configurationChangeEvent);
    }
    return Promise.resolve();
  }
  updateValue(key, value, arg3, arg4) {
    return this.updateValues([[key, value]]);
  }
  inspect(key, options = {}) {
    return this._configuration.inspect(key, options, void 0);
  }
  keys() {
    return this._configuration.keys(void 0);
  }
  reloadConfiguration() {
    return Promise.resolve(void 0);
  }
  getConfigurationData() {
    const emptyModel = {
      contents: {},
      keys: [],
      overrides: []
    };
    return {
      defaults: emptyModel,
      policy: emptyModel,
      application: emptyModel,
      userLocal: emptyModel,
      userRemote: emptyModel,
      workspace: emptyModel,
      folders: []
    };
  }
};
StandaloneConfigurationService = __decorateClass([
  __decorateParam(0, ILogService)
], StandaloneConfigurationService);
let StandaloneResourceConfigurationService = class extends Disposable {
  constructor(configurationService, modelService, languageService) {
    super();
    this.configurationService = configurationService;
    this.modelService = modelService;
    this.languageService = languageService;
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      this._onDidChangeConfiguration.fire({ affectedKeys: e.affectedKeys, affectsConfiguration: (resource, configuration) => e.affectsConfiguration(configuration) });
    }));
  }
  getValue(resource, arg2, arg3) {
    const position = Pos.isIPosition(arg2) ? arg2 : null;
    const section = position ? typeof arg3 === "string" ? arg3 : void 0 : typeof arg2 === "string" ? arg2 : void 0;
    const language = resource ? this.getLanguage(resource, position) : void 0;
    if (typeof section === "undefined") {
      return this.configurationService.getValue({
        resource,
        overrideIdentifier: language
      });
    }
    return this.configurationService.getValue(section, {
      resource,
      overrideIdentifier: language
    });
  }
  inspect(resource, position, section) {
    const language = resource ? this.getLanguage(resource, position) : void 0;
    return this.configurationService.inspect(section, { resource, overrideIdentifier: language });
  }
  getLanguage(resource, position) {
    const model = this.modelService.getModel(resource);
    if (model) {
      return position ? model.getLanguageIdAtPosition(position.lineNumber, position.column) : model.getLanguageId();
    }
    return this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
  }
  updateValue(resource, key, value, configurationTarget) {
    return this.configurationService.updateValue(key, value, { resource }, configurationTarget);
  }
};
StandaloneResourceConfigurationService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IModelService),
  __decorateParam(2, ILanguageService)
], StandaloneResourceConfigurationService);
let StandaloneResourcePropertiesService = class {
  constructor(configurationService) {
    this.configurationService = configurationService;
  }
  getEOL(resource, language) {
    const eol = this.configurationService.getValue("files.eol", { overrideIdentifier: language, resource });
    if (eol && typeof eol === "string" && eol !== "auto") {
      return eol;
    }
    return isLinux || isMacintosh ? "\n" : "\r\n";
  }
};
StandaloneResourcePropertiesService = __decorateClass([
  __decorateParam(0, IConfigurationService)
], StandaloneResourcePropertiesService);
class StandaloneTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.NONE;
    this.sessionId = "someValue.sessionId";
    this.machineId = "someValue.machineId";
    this.sqmId = "someValue.sqmId";
    this.devDeviceId = "someValue.devDeviceId";
    this.firstSessionDate = "someValue.firstSessionDate";
    this.sendErrorTelemetry = false;
  }
  setEnabled() {
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
  publicLog() {
  }
  publicLog2() {
  }
  publicLogError() {
  }
  publicLogError2() {
  }
}
const _StandaloneWorkspaceContextService = class _StandaloneWorkspaceContextService {
  constructor() {
    this._onDidChangeWorkspaceName = new Emitter();
    this.onDidChangeWorkspaceName = this._onDidChangeWorkspaceName.event;
    this._onWillChangeWorkspaceFolders = new Emitter();
    this.onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;
    this._onDidChangeWorkspaceFolders = new Emitter();
    this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
    this._onDidChangeWorkbenchState = new Emitter();
    this.onDidChangeWorkbenchState = this._onDidChangeWorkbenchState.event;
    const resource = URI.from({ scheme: _StandaloneWorkspaceContextService.SCHEME, authority: "model", path: "/" });
    this.workspace = { id: STANDALONE_EDITOR_WORKSPACE_ID, folders: [new WorkspaceFolder({ uri: resource, name: "", index: 0 })] };
  }
  getCompleteWorkspace() {
    return Promise.resolve(this.getWorkspace());
  }
  getWorkspace() {
    return this.workspace;
  }
  getWorkbenchState() {
    if (this.workspace) {
      if (this.workspace.configuration) {
        return WorkbenchState.WORKSPACE;
      }
      return WorkbenchState.FOLDER;
    }
    return WorkbenchState.EMPTY;
  }
  hasWorkspaceData() {
    return this.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  getWorkspaceFolder(resource) {
    return resource && resource.scheme === _StandaloneWorkspaceContextService.SCHEME ? this.workspace.folders[0] : null;
  }
  isInsideWorkspace(resource) {
    return resource && resource.scheme === _StandaloneWorkspaceContextService.SCHEME;
  }
  isCurrentWorkspace(workspaceIdOrFolder) {
    return true;
  }
};
_StandaloneWorkspaceContextService.SCHEME = "inmemory";
let StandaloneWorkspaceContextService = _StandaloneWorkspaceContextService;
function updateConfigurationService(configurationService, source, isDiffEditor) {
  if (!source) {
    return;
  }
  if (!(configurationService instanceof StandaloneConfigurationService)) {
    return;
  }
  const toUpdate = [];
  Object.keys(source).forEach((key) => {
    if (isEditorConfigurationKey(key)) {
      toUpdate.push([`editor.${key}`, source[key]]);
    }
    if (isDiffEditor && isDiffEditorConfigurationKey(key)) {
      toUpdate.push([`diffEditor.${key}`, source[key]]);
    }
  });
  if (toUpdate.length > 0) {
    configurationService.updateValues(toUpdate);
  }
}
let StandaloneBulkEditService = class {
  constructor(_modelService) {
    this._modelService = _modelService;
  }
  hasPreviewHandler() {
    return false;
  }
  setPreviewHandler() {
    return Disposable.None;
  }
  async apply(editsIn, _options) {
    const edits = Array.isArray(editsIn) ? editsIn : ResourceEdit.convert(editsIn);
    const textEdits = /* @__PURE__ */ new Map();
    for (const edit of edits) {
      if (!(edit instanceof ResourceTextEdit)) {
        throw new Error("bad edit - only text edits are supported");
      }
      const model = this._modelService.getModel(edit.resource);
      if (!model) {
        throw new Error("bad edit - model not found");
      }
      if (typeof edit.versionId === "number" && model.getVersionId() !== edit.versionId) {
        throw new Error("bad state - model changed in the meantime");
      }
      let array = textEdits.get(model);
      if (!array) {
        array = [];
        textEdits.set(model, array);
      }
      array.push(EditOperation.replaceMove(Range.lift(edit.textEdit.range), edit.textEdit.text));
    }
    let totalEdits = 0;
    let totalFiles = 0;
    for (const [model, edits2] of textEdits) {
      model.pushStackElement();
      model.pushEditOperations([], edits2, () => []);
      model.pushStackElement();
      totalFiles += 1;
      totalEdits += edits2.length;
    }
    return {
      ariaSummary: strings.format(StandaloneServicesNLS.bulkEditServiceSummary, totalEdits, totalFiles),
      isApplied: totalEdits > 0
    };
  }
};
StandaloneBulkEditService = __decorateClass([
  __decorateParam(0, IModelService)
], StandaloneBulkEditService);
class StandaloneUriLabelService {
  constructor() {
    this.onDidChangeFormatters = Event.None;
  }
  getUriLabel(resource, options) {
    if (resource.scheme === "file") {
      return resource.fsPath;
    }
    return resource.path;
  }
  getUriBasenameLabel(resource) {
    return basename(resource);
  }
  getWorkspaceLabel(workspace, options) {
    return "";
  }
  getSeparator(scheme, authority) {
    return "/";
  }
  registerFormatter(formatter) {
    throw new Error("Not implemented");
  }
  registerCachedFormatter(formatter) {
    return this.registerFormatter(formatter);
  }
  getHostLabel() {
    return "";
  }
  getHostTooltip() {
    return void 0;
  }
}
let StandaloneContextViewService = class extends ContextViewService {
  constructor(layoutService, _codeEditorService) {
    super(layoutService);
    this._codeEditorService = _codeEditorService;
  }
  showContextView(delegate, container, shadowRoot) {
    if (!container) {
      const codeEditor = this._codeEditorService.getFocusedCodeEditor() || this._codeEditorService.getActiveCodeEditor();
      if (codeEditor) {
        container = codeEditor.getContainerDomNode();
      }
    }
    return super.showContextView(delegate, container, shadowRoot);
  }
};
StandaloneContextViewService = __decorateClass([
  __decorateParam(0, ILayoutService),
  __decorateParam(1, ICodeEditorService)
], StandaloneContextViewService);
class StandaloneWorkspaceTrustManagementService {
  constructor() {
    this._neverEmitter = new Emitter();
    this.onDidChangeTrust = this._neverEmitter.event;
    this.onDidChangeTrustedFolders = this._neverEmitter.event;
    this.workspaceResolved = Promise.resolve();
    this.workspaceTrustInitialized = Promise.resolve();
    this.acceptsOutOfWorkspaceFiles = true;
  }
  isWorkspaceTrusted() {
    return true;
  }
  isWorkspaceTrustForced() {
    return false;
  }
  canSetParentFolderTrust() {
    return false;
  }
  async setParentFolderTrust(trusted) {
  }
  canSetWorkspaceTrust() {
    return false;
  }
  async setWorkspaceTrust(trusted) {
  }
  getUriTrustInfo(uri) {
    throw new Error("Method not supported.");
  }
  async setUrisTrust(uri, trusted) {
  }
  getTrustedUris() {
    return [];
  }
  async setTrustedUris(uris) {
  }
  addWorkspaceTrustTransitionParticipant(participant) {
    throw new Error("Method not supported.");
  }
}
class StandaloneLanguageService extends LanguageService {
  constructor() {
    super();
  }
}
class StandaloneLogService extends LogService {
  constructor() {
    super(new ConsoleLogger());
  }
}
let StandaloneContextMenuService = class extends ContextMenuService {
  constructor(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService) {
    super(telemetryService, notificationService, contextViewService, keybindingService, menuService, contextKeyService);
    this.configure({ blockMouse: false });
  }
};
StandaloneContextMenuService = __decorateClass([
  __decorateParam(0, ITelemetryService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IContextKeyService)
], StandaloneContextMenuService);
class StandaloneAccessbilitySignalService {
  async playSignal(cue, options) {
  }
  async playSignals(cues) {
  }
  getEnabledState(signal, userGesture, modality) {
    return ValueWithChangeEvent.const(false);
  }
  getDelayMs(signal, modality) {
    return 0;
  }
  isSoundEnabled(cue) {
    return false;
  }
  isAnnouncementEnabled(cue) {
    return false;
  }
  onSoundEnabledChanged(cue) {
    return Event.None;
  }
  async playSound(cue, allowManyInParallel) {
  }
  playSignalLoop(cue) {
    return toDisposable(() => {
    });
  }
}
class StandaloneDefaultAccountService {
  constructor() {
    this.onDidChangeDefaultAccount = Event.None;
    this.onDidChangePolicyData = Event.None;
    this.policyData = null;
    this.currentDefaultAccount = null;
    this.copilotTokenInfo = null;
    this.onDidChangeCopilotTokenInfo = Event.None;
    this.managedSettingsFetchStatus = null;
    this.managedSettingsFetchedAt = null;
    this.managedSettingsRawResponse = null;
  }
  async getDefaultAccount() {
    return null;
  }
  setDefaultAccountProvider() {
  }
  async refresh() {
    return null;
  }
  getDefaultAccountAuthenticationProvider() {
    return { id: "default", name: "Default", enterprise: false };
  }
  resolveGitHubUrl(path) {
    return `https://github.com/${path}`;
  }
  async signIn() {
    return null;
  }
  async signOut() {
  }
}
registerSingleton(IWebWorkerService, StandaloneWebWorkerService, InstantiationType.Eager);
registerSingleton(ILogService, StandaloneLogService, InstantiationType.Eager);
registerSingleton(IConfigurationService, StandaloneConfigurationService, InstantiationType.Eager);
registerSingleton(ITextResourceConfigurationService, StandaloneResourceConfigurationService, InstantiationType.Eager);
registerSingleton(ITextResourcePropertiesService, StandaloneResourcePropertiesService, InstantiationType.Eager);
registerSingleton(IWorkspaceContextService, StandaloneWorkspaceContextService, InstantiationType.Eager);
registerSingleton(ILabelService, StandaloneUriLabelService, InstantiationType.Eager);
registerSingleton(ITelemetryService, StandaloneTelemetryService, InstantiationType.Eager);
registerSingleton(IDialogService, StandaloneDialogService, InstantiationType.Eager);
registerSingleton(IEnvironmentService, StandaloneEnvironmentService, InstantiationType.Eager);
registerSingleton(INotificationService, StandaloneNotificationService, InstantiationType.Eager);
registerSingleton(IMarkerService, MarkerService, InstantiationType.Eager);
registerSingleton(ILanguageService, StandaloneLanguageService, InstantiationType.Eager);
registerSingleton(IStandaloneThemeService, StandaloneThemeService, InstantiationType.Eager);
registerSingleton(IModelService, ModelService, InstantiationType.Eager);
registerSingleton(IMarkerDecorationsService, MarkerDecorationsService, InstantiationType.Eager);
registerSingleton(IContextKeyService, ContextKeyService, InstantiationType.Eager);
registerSingleton(IProgressService, StandaloneProgressService, InstantiationType.Eager);
registerSingleton(IEditorProgressService, StandaloneEditorProgressService, InstantiationType.Eager);
registerSingleton(IStorageService, InMemoryStorageService, InstantiationType.Eager);
registerSingleton(IBulkEditService, StandaloneBulkEditService, InstantiationType.Eager);
registerSingleton(IWorkspaceTrustManagementService, StandaloneWorkspaceTrustManagementService, InstantiationType.Eager);
registerSingleton(ITextModelService, StandaloneTextModelService, InstantiationType.Eager);
registerSingleton(IAccessibilityService, AccessibilityService, InstantiationType.Eager);
registerSingleton(IListService, ListService, InstantiationType.Eager);
registerSingleton(ICommandService, StandaloneCommandService, InstantiationType.Eager);
registerSingleton(IKeybindingService, StandaloneKeybindingService, InstantiationType.Eager);
registerSingleton(IQuickInputService, StandaloneQuickInputService, InstantiationType.Eager);
registerSingleton(IContextViewService, StandaloneContextViewService, InstantiationType.Eager);
registerSingleton(IOpenerService, OpenerService, InstantiationType.Eager);
registerSingleton(IClipboardService, BrowserClipboardService, InstantiationType.Eager);
registerSingleton(IContextMenuService, StandaloneContextMenuService, InstantiationType.Eager);
registerSingleton(IMenuService, MenuService, InstantiationType.Eager);
registerSingleton(IAccessibilitySignalService, StandaloneAccessbilitySignalService, InstantiationType.Eager);
registerSingleton(ITreeSitterLibraryService, StandaloneTreeSitterLibraryService, InstantiationType.Eager);
registerSingleton(ILoggerService, NullLoggerService, InstantiationType.Eager);
registerSingleton(IDataChannelService, NullDataChannelService, InstantiationType.Eager);
registerSingleton(IDefaultAccountService, StandaloneDefaultAccountService, InstantiationType.Eager);
registerSingleton(IRenameSymbolTrackerService, NullRenameSymbolTrackerService, InstantiationType.Eager);
registerSingleton(IUserInteractionService, UserInteractionService, InstantiationType.Eager);
var StandaloneServices;
((StandaloneServices2) => {
  const serviceCollection = new ServiceCollection();
  for (const [id, descriptor] of getSingletonServiceDescriptors()) {
    serviceCollection.set(id, descriptor);
  }
  const instantiationService = new InstantiationService(serviceCollection, true);
  serviceCollection.set(IInstantiationService, instantiationService);
  function get(serviceId) {
    if (!initialized) {
      initialize({});
    }
    const r = serviceCollection.get(serviceId);
    if (!r) {
      throw new Error("Missing service " + serviceId);
    }
    if (r instanceof SyncDescriptor) {
      return instantiationService.invokeFunction((accessor) => accessor.get(serviceId));
    } else {
      return r;
    }
  }
  StandaloneServices2.get = get;
  let initialized = false;
  const onDidInitialize = new Emitter();
  function initialize(overrides) {
    if (initialized) {
      return instantiationService;
    }
    initialized = true;
    for (const [id, descriptor] of getSingletonServiceDescriptors()) {
      if (!serviceCollection.get(id)) {
        serviceCollection.set(id, descriptor);
      }
    }
    for (const serviceId in overrides) {
      if (overrides.hasOwnProperty(serviceId)) {
        const serviceIdentifier = createDecorator(serviceId);
        const r = serviceCollection.get(serviceIdentifier);
        if (r instanceof SyncDescriptor) {
          serviceCollection.set(serviceIdentifier, overrides[serviceId]);
        }
      }
    }
    const editorFeatures = getEditorFeatures();
    for (const feature of editorFeatures) {
      try {
        instantiationService.createInstance(feature);
      } catch (err) {
        onUnexpectedError(err);
      }
    }
    onDidInitialize.fire();
    return instantiationService;
  }
  StandaloneServices2.initialize = initialize;
  function withServices(callback) {
    if (initialized) {
      return callback();
    }
    const disposable = new DisposableStore();
    const listener = disposable.add(onDidInitialize.event(() => {
      listener.dispose();
      disposable.add(callback());
    }));
    return disposable;
  }
  StandaloneServices2.withServices = withServices;
})(StandaloneServices || (StandaloneServices = {}));
export {
  StandaloneCommandService,
  StandaloneConfigurationService,
  StandaloneKeybindingService,
  StandaloneNotificationService,
  StandaloneServices,
  updateConfigurationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZVNlcnZpY2VzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkb1NlcnZpY2UuanMnO1xuaW1wb3J0ICcuLi8uLi9icm93c2VyL3NlcnZpY2VzL2lubGluZUNvbXBsZXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5qcyc7XG5pbXBvcnQgJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9zZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi9zdGFuZGFsb25lQ29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL3N0YW5kYWxvbmVMYXlvdXRTZXJ2aWNlLmpzJztcblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50LCBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJUG9saWN5RGF0YSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQsIFZhbHVlV2l0aENoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZUNob3JkLCBLZXliaW5kaW5nLCBSZXNvbHZlZEtleWJpbmRpbmcsIGRlY29kZUtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlLCBJbW1vcnRhbFJlZmVyZW5jZSwgY29tYmluZWREaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgT1MsIGlzTGludXgsIGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5TW9kYWxpdHksIEFjY2Vzc2liaWxpdHlTaWduYWwsIElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSwgU291bmQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL21lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2Jyb3dzZXIvY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZEV2ZW50LCBJQ29tbWFuZEhhbmRsZXIsIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50LCBJQ29uZmlndXJhdGlvbkRhdGEsIElDb25maWd1cmF0aW9uTW9kZWwsIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb24sIENvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgQ29uZmlndXJhdGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbk1vZGVscy5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByZXNzaW9uLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dE1lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld0RlbGVnYXRlLCBJQ29udGV4dFZpZXdTZXJ2aWNlLCBJT3BlbkNvbnRleHRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGF0YUNoYW5uZWxTZXJ2aWNlLCBOdWxsRGF0YUNoYW5uZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGF0YUNoYW5uZWwvY29tbW9uL2RhdGFDaGFubmVsLmpzJztcbmltcG9ydCB7IElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpcm1hdGlvbiwgSUNvbmZpcm1hdGlvblJlc3VsdCwgSURpYWxvZ1NlcnZpY2UsIElJbnB1dFJlc3VsdCwgSVByb21wdCwgSVByb21wdEJhc2VCdXR0b24sIElQcm9tcHRSZXN1bHQsIElQcm9tcHRSZXN1bHRXaXRoQ2FuY2VsLCBJUHJvbXB0V2l0aEN1c3RvbUNhbmNlbCwgSVByb21wdFdpdGhEZWZhdWx0Q2FuY2VsIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25LaW5kLCBJRW52aXJvbm1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uSG9zdERlYnVnUGFyYW1zIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycywgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZUlkZW50aWZpZXIsIGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEFic3RyYWN0S2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9hYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSwgSUtleWJvYXJkRXZlbnQsIEtleWJpbmRpbmdzU2NoZW1hQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nUmVzb2x2ZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdJdGVtLCBLZXliaW5kaW5nc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vcmVzb2x2ZWRLZXliaW5kaW5nSXRlbS5qcyc7XG5pbXBvcnQgeyBVU0xheW91dFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL3VzTGF5b3V0UmVzb2x2ZWRLZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElGb3JtYXR0ZXJDaGFuZ2VFdmVudCwgSUxhYmVsU2VydmljZSwgUmVzb3VyY2VMYWJlbEZvcm1hdHRlciwgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnNvbGVMb2dnZXIsIElMb2dTZXJ2aWNlLCBJTG9nZ2VyU2VydmljZSwgTnVsbExvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2dTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uLCBJTm90aWZpY2F0aW9uSGFuZGxlLCBJTm90aWZpY2F0aW9uU2VydmljZSwgSU5vdGlmaWNhdGlvblNvdXJjZSwgSU5vdGlmaWNhdGlvblNvdXJjZUZpbHRlciwgSVByb21wdENob2ljZSwgSVByb21wdE9wdGlvbnMsIElTdGF0dXNIYW5kbGUsIElTdGF0dXNNZXNzYWdlT3B0aW9ucywgTm9PcE5vdGlmaWNhdGlvbiwgTm90aWZpY2F0aW9uc0ZpbHRlciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzLCBJUHJvZ3Jlc3NDb21wb3NpdGVPcHRpb25zLCBJUHJvZ3Jlc3NEaWFsb2dPcHRpb25zLCBJUHJvZ3Jlc3NOb3RpZmljYXRpb25PcHRpb25zLCBJUHJvZ3Jlc3NPcHRpb25zLCBJUHJvZ3Jlc3NSdW5uZXIsIElQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc1N0ZXAsIElQcm9ncmVzc1dpbmRvd09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS93ZWJXb3JrZXIvYnJvd3Nlci93ZWJXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQsIElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50LCBJV29ya3NwYWNlSWRlbnRpZmllciwgU1RBTkRBTE9ORV9FRElUT1JfV09SS1NQQUNFX0lELCBXb3JrYmVuY2hTdGF0ZSwgV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudCwgSVdvcmtzcGFjZVRydXN0VXJpSW5mbyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdE9wdGlvbnMsIElCdWxrRWRpdFJlc3VsdCwgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VFZGl0LCBSZXNvdXJjZVRleHRFZGl0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9vcGVuZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSwgTnVsbFJlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9yZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0RpZmZFZGl0b3JDb25maWd1cmF0aW9uS2V5LCBpc0VkaXRvckNvbmZpZ3VyYXRpb25LZXkgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24sIElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIGFzIFBvcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yRmVhdHVyZXMgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlRWRpdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCwgSVRleHRTbmFwc2hvdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbWFya2VyRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL21hcmtlckRlY29yYXRpb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN0YW5kYWxvbmVTZXJ2aWNlc05MUyB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGFuZGFsb25lU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zdGFuZGFsb25lVGhlbWUuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi9xdWlja0lucHV0L3N0YW5kYWxvbmVRdWlja0lucHV0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFsb25lV2ViV29ya2VyU2VydmljZSB9IGZyb20gJy4vc2VydmljZXMvc3RhbmRhbG9uZVdlYldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4vc3RhbmRhbG9uZVRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFsb25lVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi9zdGFuZGFsb25lVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcblxuY2xhc3MgU2ltcGxlTW9kZWwgaW1wbGVtZW50cyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2U6IEVtaXR0ZXI8dm9pZD47XG5cblx0Y29uc3RydWN0b3IobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHR0aGlzLm1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fb25XaWxsRGlzcG9zZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uV2lsbERpc3Bvc2UoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIHJlc29sdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHVibGljIGdldCB0ZXh0RWRpdG9yTW9kZWwoKTogSVRleHRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU25hcHNob3QoKTogSVRleHRTbmFwc2hvdCB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuY3JlYXRlU25hcHNob3QoKTtcblx0fVxuXG5cdHB1YmxpYyBpc1JlYWRvbmx5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZWQgPSBmYWxzZTtcblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlZCA9IHRydWU7XG5cblx0XHR0aGlzLl9vbldpbGxEaXNwb3NlLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBpc0Rpc3Bvc2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRpc3Bvc2VkO1xuXHR9XG5cblx0cHVibGljIGlzUmVzb2x2ZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFuZ3VhZ2VJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0fVxufVxuXG5jbGFzcyBTdGFuZGFsb25lVGV4dE1vZGVsU2VydmljZSBpbXBsZW1lbnRzIElUZXh0TW9kZWxTZXJ2aWNlIHtcblx0cHVibGljIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZVxuXHQpIHsgfVxuXG5cdHB1YmxpYyBjcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKTtcblxuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoYE1vZGVsIG5vdCBmb3VuZGApKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5ldyBJbW1vcnRhbFJlZmVyZW5jZShuZXcgU2ltcGxlTW9kZWwobW9kZWwpKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoc2NoZW1lOiBzdHJpbmcsIHByb3ZpZGVyOiBJVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiBmdW5jdGlvbiAoKSB7IC8qIG5vIG9wICovIH1cblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGNhbkhhbmRsZVJlc291cmNlKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZUVkaXRvclByb2dyZXNzU2VydmljZSBpbXBsZW1lbnRzIElFZGl0b3JQcm9ncmVzc1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyBOVUxMX1BST0dSRVNTX1JVTk5FUjogSVByb2dyZXNzUnVubmVyID0ge1xuXHRcdGRvbmU6ICgpID0+IHsgfSxcblx0XHR0b3RhbDogKCkgPT4geyB9LFxuXHRcdHdvcmtlZDogKCkgPT4geyB9XG5cdH07XG5cblx0c2hvdyhpbmZpbml0ZTogdHJ1ZSwgZGVsYXk/OiBudW1iZXIpOiBJUHJvZ3Jlc3NSdW5uZXI7XG5cdHNob3codG90YWw6IG51bWJlciwgZGVsYXk/OiBudW1iZXIpOiBJUHJvZ3Jlc3NSdW5uZXI7XG5cdHNob3coKTogSVByb2dyZXNzUnVubmVyIHtcblx0XHRyZXR1cm4gU3RhbmRhbG9uZUVkaXRvclByb2dyZXNzU2VydmljZS5OVUxMX1BST0dSRVNTX1JVTk5FUjtcblx0fVxuXG5cdGFzeW5jIHNob3dXaGlsZShwcm9taXNlOiBQcm9taXNlPHVua25vd24+LCBkZWxheT86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHByb21pc2U7XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZVByb2dyZXNzU2VydmljZSBpbXBsZW1lbnRzIElQcm9ncmVzc1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHdpdGhQcm9ncmVzczxSPihfb3B0aW9uczogSVByb2dyZXNzT3B0aW9ucyB8IElQcm9ncmVzc0RpYWxvZ09wdGlvbnMgfCBJUHJvZ3Jlc3NOb3RpZmljYXRpb25PcHRpb25zIHwgSVByb2dyZXNzV2luZG93T3B0aW9ucyB8IElQcm9ncmVzc0NvbXBvc2l0ZU9wdGlvbnMsIHRhc2s6IChwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+KSA9PiBQcm9taXNlPFI+LCBvbkRpZENhbmNlbD86ICgoY2hvaWNlPzogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCk6IFByb21pc2U8Uj4ge1xuXHRcdHJldHVybiB0YXNrKHtcblx0XHRcdHJlcG9ydDogKCkgPT4geyB9LFxuXHRcdH0pO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVFbnZpcm9ubWVudFNlcnZpY2UgaW1wbGVtZW50cyBJRW52aXJvbm1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBzdGF0ZVJlc291cmNlOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ3N0YXRlUmVzb3VyY2UnIH0pO1xuXHRyZWFkb25seSB1c2VyUm9hbWluZ0RhdGFIb21lOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ3VzZXJSb2FtaW5nRGF0YUhvbWUnIH0pO1xuXHRyZWFkb25seSBrZXlib2FyZExheW91dFJlc291cmNlOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ2tleWJvYXJkTGF5b3V0UmVzb3VyY2UnIH0pO1xuXHRyZWFkb25seSBhcmd2UmVzb3VyY2U6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9uYWNvJywgYXV0aG9yaXR5OiAnYXJndlJlc291cmNlJyB9KTtcblx0cmVhZG9ubHkgdW50aXRsZWRXb3Jrc3BhY2VzSG9tZTogVVJJID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb25hY28nLCBhdXRob3JpdHk6ICd1bnRpdGxlZFdvcmtzcGFjZXNIb21lJyB9KTtcblx0cmVhZG9ubHkgd29ya3NwYWNlU3RvcmFnZUhvbWU6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9uYWNvJywgYXV0aG9yaXR5OiAnd29ya3NwYWNlU3RvcmFnZUhvbWUnIH0pO1xuXHRyZWFkb25seSBhcHBTaGFyZWREYXRhSG9tZTogVVJJID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb25hY28nLCBhdXRob3JpdHk6ICdhcHBTaGFyZWREYXRhSG9tZScgfSk7XG5cdHJlYWRvbmx5IGxvY2FsSGlzdG9yeUhvbWU6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9uYWNvJywgYXV0aG9yaXR5OiAnbG9jYWxIaXN0b3J5SG9tZScgfSk7XG5cdHJlYWRvbmx5IGNhY2hlSG9tZTogVVJJID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb25hY28nLCBhdXRob3JpdHk6ICdjYWNoZUhvbWUnIH0pO1xuXHRyZWFkb25seSB1c2VyRGF0YVN5bmNIb21lOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ3VzZXJEYXRhU3luY0hvbWUnIH0pO1xuXHRyZWFkb25seSBzeW5jOiAnb24nIHwgJ29mZicgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbnRpbnVlT24/OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGVkaXRTZXNzaW9uSWQ/OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRlYnVnRXh0ZW5zaW9uSG9zdDogSUV4dGVuc2lvbkhvc3REZWJ1Z1BhcmFtcyA9IHsgcG9ydDogbnVsbCwgYnJlYWs6IGZhbHNlIH07XG5cdHJlYWRvbmx5IGlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgZGlzYWJsZUV4dGVuc2lvbnM6IGJvb2xlYW4gfCBzdHJpbmdbXSA9IGZhbHNlO1xuXHRyZWFkb25seSBkaXNhYmxlRXhwZXJpbWVudHM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgZW5hYmxlRXh0ZW5zaW9ucz86IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRyZWFkb25seSBleHRlbnNpb25EZXZlbG9wbWVudExvY2F0aW9uVVJJPzogVVJJW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbkRldmVsb3BtZW50S2luZD86IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uVGVzdHNMb2NhdGlvblVSST86IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbG9nc0hvbWU6IFVSSSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnbW9uYWNvJywgYXV0aG9yaXR5OiAnbG9nc0hvbWUnIH0pO1xuXHRyZWFkb25seSBsb2dMZXZlbD86IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uTG9nTGV2ZWw/OiBbc3RyaW5nLCBzdHJpbmddW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHZlcmJvc2U6IGJvb2xlYW4gPSBmYWxzZTtcblx0cmVhZG9ubHkgaXNCdWlsdDogYm9vbGVhbiA9IGZhbHNlO1xuXHRyZWFkb25seSBkaXNhYmxlVGVsZW1ldHJ5OiBib29sZWFuID0gZmFsc2U7XG5cdHJlYWRvbmx5IHNlcnZpY2VNYWNoaW5lSWRSZXNvdXJjZTogVVJJID0gVVJJLmZyb20oeyBzY2hlbWU6ICdtb25hY28nLCBhdXRob3JpdHk6ICdzZXJ2aWNlTWFjaGluZUlkUmVzb3VyY2UnIH0pO1xuXHRyZWFkb25seSBhZ2VudFNlc3Npb25zV29ya3NwYWNlOiBVUkkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ21vbmFjbycsIGF1dGhvcml0eTogJ2FnZW50U2Vzc2lvbnNXb3Jrc3BhY2UnIH0pO1xuXHRyZWFkb25seSBwb2xpY3lGaWxlPzogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBTdGFuZGFsb25lRGlhbG9nU2VydmljZSBpbXBsZW1lbnRzIElEaWFsb2dTZXJ2aWNlIHtcblxuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25XaWxsU2hvd0RpYWxvZyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG9uRGlkU2hvd0RpYWxvZyA9IEV2ZW50Lk5vbmU7XG5cblx0YXN5bmMgY29uZmlybShjb25maXJtYXRpb246IElDb25maXJtYXRpb24pOiBQcm9taXNlPElDb25maXJtYXRpb25SZXN1bHQ+IHtcblx0XHRjb25zdCBjb25maXJtZWQgPSB0aGlzLmRvQ29uZmlybShjb25maXJtYXRpb24ubWVzc2FnZSwgY29uZmlybWF0aW9uLmRldGFpbCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlybWVkLFxuXHRcdFx0Y2hlY2tib3hDaGVja2VkOiBmYWxzZSAvLyB1bnN1cHBvcnRlZFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGRvQ29uZmlybShtZXNzYWdlOiBzdHJpbmcsIGRldGFpbD86IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGxldCBtZXNzYWdlVGV4dCA9IG1lc3NhZ2U7XG5cdFx0aWYgKGRldGFpbCkge1xuXHRcdFx0bWVzc2FnZVRleHQgPSBtZXNzYWdlVGV4dCArICdcXG5cXG4nICsgZGV0YWlsO1xuXHRcdH1cblxuXHRcdHJldHVybiBtYWluV2luZG93LmNvbmZpcm0obWVzc2FnZVRleHQpO1xuXHR9XG5cblx0cHJvbXB0PFQ+KHByb21wdDogSVByb21wdFdpdGhDdXN0b21DYW5jZWw8VD4pOiBQcm9taXNlPElQcm9tcHRSZXN1bHRXaXRoQ2FuY2VsPFQ+Pjtcblx0cHJvbXB0PFQ+KHByb21wdDogSVByb21wdDxUPik6IFByb21pc2U8SVByb21wdFJlc3VsdDxUPj47XG5cdHByb21wdDxUPihwcm9tcHQ6IElQcm9tcHRXaXRoRGVmYXVsdENhbmNlbDxUPik6IFByb21pc2U8SVByb21wdFJlc3VsdDxUPj47XG5cdGFzeW5jIHByb21wdDxUPihwcm9tcHQ6IElQcm9tcHQ8VD4gfCBJUHJvbXB0V2l0aEN1c3RvbUNhbmNlbDxUPik6IFByb21pc2U8SVByb21wdFJlc3VsdDxUPiB8IElQcm9tcHRSZXN1bHRXaXRoQ2FuY2VsPFQ+PiB7XG5cdFx0bGV0IHJlc3VsdDogVCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25maXJtZWQgPSB0aGlzLmRvQ29uZmlybShwcm9tcHQubWVzc2FnZSwgcHJvbXB0LmRldGFpbCk7XG5cdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0Y29uc3QgcHJvbXB0QnV0dG9uczogSVByb21wdEJhc2VCdXR0b248VD5bXSA9IFsuLi4ocHJvbXB0LmJ1dHRvbnMgPz8gW10pXTtcblx0XHRcdGlmIChwcm9tcHQuY2FuY2VsQnV0dG9uICYmIHR5cGVvZiBwcm9tcHQuY2FuY2VsQnV0dG9uICE9PSAnc3RyaW5nJyAmJiB0eXBlb2YgcHJvbXB0LmNhbmNlbEJ1dHRvbiAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdHByb21wdEJ1dHRvbnMucHVzaChwcm9tcHQuY2FuY2VsQnV0dG9uKTtcblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0ID0gYXdhaXQgcHJvbXB0QnV0dG9uc1swXT8ucnVuKHsgY2hlY2tib3hDaGVja2VkOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyByZXN1bHQgfTtcblx0fVxuXG5cdGFzeW5jIGluZm8obWVzc2FnZTogc3RyaW5nLCBkZXRhaWw/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnByb21wdCh7IHR5cGU6IFNldmVyaXR5LkluZm8sIG1lc3NhZ2UsIGRldGFpbCB9KTtcblx0fVxuXG5cdGFzeW5jIHdhcm4obWVzc2FnZTogc3RyaW5nLCBkZXRhaWw/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnByb21wdCh7IHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsIG1lc3NhZ2UsIGRldGFpbCB9KTtcblx0fVxuXG5cdGFzeW5jIGVycm9yKG1lc3NhZ2U6IHN0cmluZywgZGV0YWlsPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5wcm9tcHQoeyB0eXBlOiBTZXZlcml0eS5FcnJvciwgbWVzc2FnZSwgZGV0YWlsIH0pO1xuXHR9XG5cblx0aW5wdXQoKTogUHJvbWlzZTxJSW5wdXRSZXN1bHQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgY29uZmlybWVkOiBmYWxzZSB9KTsgLy8gdW5zdXBwb3J0ZWRcblx0fVxuXG5cdGFib3V0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhbmRhbG9uZU5vdGlmaWNhdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJTm90aWZpY2F0aW9uU2VydmljZSB7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWx0ZXI6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblxuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5PX09QOiBJTm90aWZpY2F0aW9uSGFuZGxlID0gbmV3IE5vT3BOb3RpZmljYXRpb24oKTtcblxuXHRwdWJsaWMgaW5mbyhtZXNzYWdlOiBzdHJpbmcpOiBJTm90aWZpY2F0aW9uSGFuZGxlIHtcblx0XHRyZXR1cm4gdGhpcy5ub3RpZnkoeyBzZXZlcml0eTogU2V2ZXJpdHkuSW5mbywgbWVzc2FnZSB9KTtcblx0fVxuXG5cdHB1YmxpYyB3YXJuKG1lc3NhZ2U6IHN0cmluZyk6IElOb3RpZmljYXRpb25IYW5kbGUge1xuXHRcdHJldHVybiB0aGlzLm5vdGlmeSh7IHNldmVyaXR5OiBTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlIH0pO1xuXHR9XG5cblx0cHVibGljIGVycm9yKGVycm9yOiBzdHJpbmcgfCBFcnJvcik6IElOb3RpZmljYXRpb25IYW5kbGUge1xuXHRcdHJldHVybiB0aGlzLm5vdGlmeSh7IHNldmVyaXR5OiBTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogZXJyb3IgfSk7XG5cdH1cblxuXHRwdWJsaWMgbm90aWZ5KG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbik6IElOb3RpZmljYXRpb25IYW5kbGUge1xuXHRcdHN3aXRjaCAobm90aWZpY2F0aW9uLnNldmVyaXR5KSB7XG5cdFx0XHRjYXNlIFNldmVyaXR5LkVycm9yOlxuXHRcdFx0XHRjb25zb2xlLmVycm9yKG5vdGlmaWNhdGlvbi5tZXNzYWdlKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFNldmVyaXR5Lldhcm5pbmc6XG5cdFx0XHRcdGNvbnNvbGUud2Fybihub3RpZmljYXRpb24ubWVzc2FnZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Y29uc29sZS5sb2cobm90aWZpY2F0aW9uLm1lc3NhZ2UpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gU3RhbmRhbG9uZU5vdGlmaWNhdGlvblNlcnZpY2UuTk9fT1A7XG5cdH1cblxuXHRwdWJsaWMgcHJvbXB0KHNldmVyaXR5OiBTZXZlcml0eSwgbWVzc2FnZTogc3RyaW5nLCBjaG9pY2VzOiBJUHJvbXB0Q2hvaWNlW10sIG9wdGlvbnM/OiBJUHJvbXB0T3B0aW9ucyk6IElOb3RpZmljYXRpb25IYW5kbGUge1xuXHRcdHJldHVybiBTdGFuZGFsb25lTm90aWZpY2F0aW9uU2VydmljZS5OT19PUDtcblx0fVxuXG5cdHB1YmxpYyBzdGF0dXMobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIG9wdGlvbnM/OiBJU3RhdHVzTWVzc2FnZU9wdGlvbnMpOiBJU3RhdHVzSGFuZGxlIHtcblx0XHRyZXR1cm4geyBjbG9zZTogKCkgPT4geyB9IH07XG5cdH1cblxuXHRwdWJsaWMgc2V0RmlsdGVyKGZpbHRlcjogTm90aWZpY2F0aW9uc0ZpbHRlciB8IElOb3RpZmljYXRpb25Tb3VyY2VGaWx0ZXIpOiB2b2lkIHsgfVxuXG5cdHB1YmxpYyBnZXRGaWx0ZXIoc291cmNlPzogSU5vdGlmaWNhdGlvblNvdXJjZSk6IE5vdGlmaWNhdGlvbnNGaWx0ZXIge1xuXHRcdHJldHVybiBOb3RpZmljYXRpb25zRmlsdGVyLk9GRjtcblx0fVxuXG5cdHB1YmxpYyBnZXRGaWx0ZXJzKCk6IElOb3RpZmljYXRpb25Tb3VyY2VGaWx0ZXJbXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUZpbHRlcihzb3VyY2VJZDogc3RyaW5nKTogdm9pZCB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0YW5kYWxvbmVDb21tYW5kU2VydmljZSBpbXBsZW1lbnRzIElDb21tYW5kU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRXhlY3V0ZUNvbW1hbmQgPSBuZXcgRW1pdHRlcjxJQ29tbWFuZEV2ZW50PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEV4ZWN1dGVDb21tYW5kID0gbmV3IEVtaXR0ZXI8SUNvbW1hbmRFdmVudD4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbEV4ZWN1dGVDb21tYW5kOiBFdmVudDxJQ29tbWFuZEV2ZW50PiA9IHRoaXMuX29uV2lsbEV4ZWN1dGVDb21tYW5kLmV2ZW50O1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQ8SUNvbW1hbmRFdmVudD4gPSB0aGlzLl9vbkRpZEV4ZWN1dGVDb21tYW5kLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHR9XG5cblx0cHVibGljIGV4ZWN1dGVDb21tYW5kPFQ+KGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoaWQpO1xuXHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgY29tbWFuZCAnJHtpZH0nIG5vdCBmb3VuZGApKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb25XaWxsRXhlY3V0ZUNvbW1hbmQuZmlyZSh7IGNvbW1hbmRJZDogaWQsIGFyZ3MgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbi5hcHBseSh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgW2NvbW1hbmQuaGFuZGxlciwgLi4uYXJnc10pIGFzIFQ7XG5cblx0XHRcdHRoaXMuX29uRGlkRXhlY3V0ZUNvbW1hbmQuZmlyZSh7IGNvbW1hbmRJZDogaWQsIGFyZ3MgfSk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJS2V5YmluZGluZ1J1bGUge1xuXHRrZXliaW5kaW5nOiBudW1iZXI7XG5cdGNvbW1hbmQ/OiBzdHJpbmcgfCBudWxsO1xuXHRjb21tYW5kQXJncz86IHVua25vd247XG5cdHdoZW4/OiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IG51bGw7XG59XG5cbmV4cG9ydCBjbGFzcyBTdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdEtleWJpbmRpbmdTZXJ2aWNlIHtcblx0cHJpdmF0ZSBfY2FjaGVkUmVzb2x2ZXI6IEtleWJpbmRpbmdSZXNvbHZlciB8IG51bGw7XG5cdHByaXZhdGUgX2R5bmFtaWNLZXliaW5kaW5nczogSUtleWJpbmRpbmdJdGVtW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGVMaXN0ZW5lcnM6IERvbU5vZGVMaXN0ZW5lcnNbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihjb250ZXh0S2V5U2VydmljZSwgY29tbWFuZFNlcnZpY2UsIHRlbGVtZXRyeVNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5fY2FjaGVkUmVzb2x2ZXIgPSBudWxsO1xuXHRcdHRoaXMuX2R5bmFtaWNLZXliaW5kaW5ncyA9IFtdO1xuXHRcdHRoaXMuX2RvbU5vZGVMaXN0ZW5lcnMgPSBbXTtcblxuXHRcdGNvbnN0IGFkZENvbnRhaW5lciA9IChkb21Ob2RlOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdC8vIGZvciBzdGFuZGFyZCBrZXliaW5kaW5nc1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5RXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRoaXMuX2Rpc3BhdGNoKGtleUV2ZW50LCBrZXlFdmVudC50YXJnZXQpO1xuXHRcdFx0XHRpZiAoc2hvdWxkUHJldmVudERlZmF1bHQpIHtcblx0XHRcdFx0XHRrZXlFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGtleUV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIGZvciBzaW5nbGUgbW9kaWZpZXIgY2hvcmQga2V5YmluZGluZ3MgKGUuZy4gc2hpZnQgc2hpZnQpXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkb21Ob2RlLCBkb20uRXZlbnRUeXBlLktFWV9VUCwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5RXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRjb25zdCBzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRoaXMuX3NpbmdsZU1vZGlmaWVyRGlzcGF0Y2goa2V5RXZlbnQsIGtleUV2ZW50LnRhcmdldCk7XG5cdFx0XHRcdGlmIChzaG91bGRQcmV2ZW50RGVmYXVsdCkge1xuXHRcdFx0XHRcdGtleUV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fZG9tTm9kZUxpc3RlbmVycy5wdXNoKG5ldyBEb21Ob2RlTGlzdGVuZXJzKGRvbU5vZGUsIGRpc3Bvc2FibGVzKSk7XG5cdFx0fTtcblx0XHRjb25zdCByZW1vdmVDb250YWluZXIgPSAoZG9tTm9kZTogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZG9tTm9kZUxpc3RlbmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBkb21Ob2RlTGlzdGVuZXJzID0gdGhpcy5fZG9tTm9kZUxpc3RlbmVyc1tpXTtcblx0XHRcdFx0aWYgKGRvbU5vZGVMaXN0ZW5lcnMuZG9tTm9kZSA9PT0gZG9tTm9kZSkge1xuXHRcdFx0XHRcdHRoaXMuX2RvbU5vZGVMaXN0ZW5lcnMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdGRvbU5vZGVMaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGFkZENvZGVFZGl0b3IgPSAoY29kZUVkaXRvcjogSUNvZGVFZGl0b3IpID0+IHtcblx0XHRcdGlmIChjb2RlRWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uaW5EaWZmRWRpdG9yKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhZGRDb250YWluZXIoY29kZUVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkpO1xuXHRcdH07XG5cdFx0Y29uc3QgcmVtb3ZlQ29kZUVkaXRvciA9IChjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcikgPT4ge1xuXHRcdFx0aWYgKGNvZGVFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbkRpZmZFZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJlbW92ZUNvbnRhaW5lcihjb2RlRWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKSk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yU2VydmljZS5vbkNvZGVFZGl0b3JBZGQoYWRkQ29kZUVkaXRvcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvZGVFZGl0b3JTZXJ2aWNlLm9uQ29kZUVkaXRvclJlbW92ZShyZW1vdmVDb2RlRWRpdG9yKSk7XG5cdFx0Y29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkuZm9yRWFjaChhZGRDb2RlRWRpdG9yKTtcblxuXHRcdGNvbnN0IGFkZERpZmZFZGl0b3IgPSAoZGlmZkVkaXRvcjogSURpZmZFZGl0b3IpID0+IHtcblx0XHRcdGFkZENvbnRhaW5lcihkaWZmRWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKSk7XG5cdFx0fTtcblx0XHRjb25zdCByZW1vdmVEaWZmRWRpdG9yID0gKGRpZmZFZGl0b3I6IElEaWZmRWRpdG9yKSA9PiB7XG5cdFx0XHRyZW1vdmVDb250YWluZXIoZGlmZkVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkpO1xuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29kZUVkaXRvclNlcnZpY2Uub25EaWZmRWRpdG9yQWRkKGFkZERpZmZFZGl0b3IpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb2RlRWRpdG9yU2VydmljZS5vbkRpZmZFZGl0b3JSZW1vdmUocmVtb3ZlRGlmZkVkaXRvcikpO1xuXHRcdGNvZGVFZGl0b3JTZXJ2aWNlLmxpc3REaWZmRWRpdG9ycygpLmZvckVhY2goYWRkRGlmZkVkaXRvcik7XG5cdH1cblxuXHRwdWJsaWMgYWRkRHluYW1pY0tleWJpbmRpbmcoY29tbWFuZDogc3RyaW5nLCBrZXliaW5kaW5nOiBudW1iZXIsIGhhbmRsZXI6IElDb21tYW5kSGFuZGxlciwgd2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGNvbW1hbmQsIGhhbmRsZXIpLFxuXHRcdFx0dGhpcy5hZGREeW5hbWljS2V5YmluZGluZ3MoW3tcblx0XHRcdFx0a2V5YmluZGluZyxcblx0XHRcdFx0Y29tbWFuZCxcblx0XHRcdFx0d2hlblxuXHRcdFx0fV0pXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBhZGREeW5hbWljS2V5YmluZGluZ3MocnVsZXM6IElLZXliaW5kaW5nUnVsZVtdKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGVudHJpZXM6IElLZXliaW5kaW5nSXRlbVtdID0gcnVsZXMubWFwKChydWxlKSA9PiB7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nID0gZGVjb2RlS2V5YmluZGluZyhydWxlLmtleWJpbmRpbmcsIE9TKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtleWJpbmRpbmcsXG5cdFx0XHRcdGNvbW1hbmQ6IHJ1bGUuY29tbWFuZCA/PyBudWxsLFxuXHRcdFx0XHRjb21tYW5kQXJnczogcnVsZS5jb21tYW5kQXJncyxcblx0XHRcdFx0d2hlbjogcnVsZS53aGVuLFxuXHRcdFx0XHR3ZWlnaHQxOiAxMDAwLFxuXHRcdFx0XHR3ZWlnaHQyOiAwLFxuXHRcdFx0XHRleHRlbnNpb25JZDogbnVsbCxcblx0XHRcdFx0aXNCdWlsdGluRXh0ZW5zaW9uOiBmYWxzZVxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLl9keW5hbWljS2V5YmluZGluZ3MgPSB0aGlzLl9keW5hbWljS2V5YmluZGluZ3MuY29uY2F0KGVudHJpZXMpO1xuXG5cdFx0dGhpcy51cGRhdGVSZXNvbHZlcigpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHQvLyBTZWFyY2ggdGhlIGZpcnN0IGVudHJ5IGFuZCByZW1vdmUgdGhlbSBhbGwgc2luY2UgdGhleSB3aWxsIGJlIGNvbnRpZ3VvdXNcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fZHluYW1pY0tleWJpbmRpbmdzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9keW5hbWljS2V5YmluZGluZ3NbaV0gPT09IGVudHJpZXNbMF0pIHtcblx0XHRcdFx0XHR0aGlzLl9keW5hbWljS2V5YmluZGluZ3Muc3BsaWNlKGksIGVudHJpZXMubGVuZ3RoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVJlc29sdmVyKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVJlc29sdmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhY2hlZFJlc29sdmVyID0gbnVsbDtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUtleWJpbmRpbmdzLmZpcmUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0UmVzb2x2ZXIoKTogS2V5YmluZGluZ1Jlc29sdmVyIHtcblx0XHRpZiAoIXRoaXMuX2NhY2hlZFJlc29sdmVyKSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IHRoaXMuX3RvTm9ybWFsaXplZEtleWJpbmRpbmdJdGVtcyhLZXliaW5kaW5nc1JlZ2lzdHJ5LmdldERlZmF1bHRLZXliaW5kaW5ncygpLCB0cnVlKTtcblx0XHRcdGNvbnN0IG92ZXJyaWRlcyA9IHRoaXMuX3RvTm9ybWFsaXplZEtleWJpbmRpbmdJdGVtcyh0aGlzLl9keW5hbWljS2V5YmluZGluZ3MsIGZhbHNlKTtcblx0XHRcdHRoaXMuX2NhY2hlZFJlc29sdmVyID0gbmV3IEtleWJpbmRpbmdSZXNvbHZlcihkZWZhdWx0cywgb3ZlcnJpZGVzLCAoc3RyKSA9PiB0aGlzLl9sb2coc3RyKSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRSZXNvbHZlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBfZG9jdW1lbnRIYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gbWFpbldpbmRvdy5kb2N1bWVudC5oYXNGb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Ob3JtYWxpemVkS2V5YmluZGluZ0l0ZW1zKGl0ZW1zOiBJS2V5YmluZGluZ0l0ZW1bXSwgaXNEZWZhdWx0OiBib29sZWFuKTogUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdIHtcblx0XHRjb25zdCByZXN1bHQ6IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0Y29uc3Qgd2hlbiA9IGl0ZW0ud2hlbiB8fCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nID0gaXRlbS5rZXliaW5kaW5nO1xuXG5cdFx0XHRpZiAoIWtleWJpbmRpbmcpIHtcblx0XHRcdFx0Ly8gVGhpcyBtaWdodCBiZSBhIHJlbW92YWwga2V5YmluZGluZyBpdGVtIGluIHVzZXIgc2V0dGluZ3MgPT4gYWNjZXB0IGl0XG5cdFx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbSh1bmRlZmluZWQsIGl0ZW0uY29tbWFuZCwgaXRlbS5jb21tYW5kQXJncywgd2hlbiwgaXNEZWZhdWx0LCBudWxsLCBmYWxzZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmdzID0gVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcucmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZywgT1MpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlc29sdmVkS2V5YmluZGluZyBvZiByZXNvbHZlZEtleWJpbmRpbmdzKSB7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtKHJlc29sdmVkS2V5YmluZGluZywgaXRlbS5jb21tYW5kLCBpdGVtLmNvbW1hbmRBcmdzLCB3aGVuLCBpc0RlZmF1bHQsIG51bGwsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZzogS2V5YmluZGluZyk6IFJlc29sdmVkS2V5YmluZGluZ1tdIHtcblx0XHRyZXR1cm4gVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcucmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZywgT1MpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVLZXlib2FyZEV2ZW50KGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KTogUmVzb2x2ZWRLZXliaW5kaW5nIHtcblx0XHRjb25zdCBjaG9yZCA9IG5ldyBLZXlDb2RlQ2hvcmQoXG5cdFx0XHRrZXlib2FyZEV2ZW50LmN0cmxLZXksXG5cdFx0XHRrZXlib2FyZEV2ZW50LnNoaWZ0S2V5LFxuXHRcdFx0a2V5Ym9hcmRFdmVudC5hbHRLZXksXG5cdFx0XHRrZXlib2FyZEV2ZW50Lm1ldGFLZXksXG5cdFx0XHRrZXlib2FyZEV2ZW50LmtleUNvZGVcblx0XHQpO1xuXHRcdHJldHVybiBuZXcgVVNMYXlvdXRSZXNvbHZlZEtleWJpbmRpbmcoW2Nob3JkXSwgT1MpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVVc2VyQmluZGluZyh1c2VyQmluZGluZzogc3RyaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBfZHVtcERlYnVnSW5mbygpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHB1YmxpYyBfZHVtcERlYnVnSW5mb0pTT04oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJTY2hlbWFDb250cmlidXRpb24oY29udHJpYnV0aW9uOiBLZXliaW5kaW5nc1NjaGVtYUNvbnRyaWJ1dGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0LyoqXG5cdCAqIG5vdCB5ZXQgc3VwcG9ydGVkXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKGNvbW1hbmRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBEb21Ob2RlTGlzdGVuZXJzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudCxcblx0XHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZGlzcG9zYWJsZXMpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzQ29uZmlndXJhdGlvbk92ZXJyaWRlcyh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzIHtcblx0cmV0dXJuICEhdGhpbmdcblx0XHQmJiB0eXBlb2YgdGhpbmcgPT09ICdvYmplY3QnXG5cdFx0JiYgKCEodGhpbmcgYXMgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpLm92ZXJyaWRlSWRlbnRpZmllciB8fCB0eXBlb2YgKHRoaW5nIGFzIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKS5vdmVycmlkZUlkZW50aWZpZXIgPT09ICdzdHJpbmcnKVxuXHRcdCYmICghKHRoaW5nIGFzIElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKS5yZXNvdXJjZSB8fCAodGhpbmcgYXMgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpLnJlc291cmNlIGluc3RhbmNlb2YgVVJJKTtcbn1cblxuZXhwb3J0IGNsYXNzIFN0YW5kYWxvbmVDb25maWd1cmF0aW9uU2VydmljZSBpbXBsZW1lbnRzIElDb25maWd1cmF0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gbmV3IEVtaXR0ZXI8SUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRXZlbnQ8SUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgZGVmYXVsdENvbmZpZ3VyYXRpb24gPSBuZXcgRGVmYXVsdENvbmZpZ3VyYXRpb24obG9nU2VydmljZSk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbiA9IG5ldyBDb25maWd1cmF0aW9uKFxuXHRcdFx0ZGVmYXVsdENvbmZpZ3VyYXRpb24ucmVsb2FkKCksXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0bmV3IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0bmV3IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSxcblx0XHRcdGxvZ1NlcnZpY2Vcblx0XHQpO1xuXHRcdGRlZmF1bHRDb25maWd1cmF0aW9uLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldFZhbHVlPFQ+KCk6IFQ7XG5cdGdldFZhbHVlPFQ+KHNlY3Rpb246IHN0cmluZyk6IFQ7XG5cdGdldFZhbHVlPFQ+KG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUO1xuXHRnZXRWYWx1ZTxUPihzZWN0aW9uOiBzdHJpbmcsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUO1xuXHRnZXRWYWx1ZShhcmcxPzogdW5rbm93biwgYXJnMj86IHVua25vd24pOiB1bmtub3duIHtcblx0XHRjb25zdCBzZWN0aW9uID0gdHlwZW9mIGFyZzEgPT09ICdzdHJpbmcnID8gYXJnMSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvdmVycmlkZXMgPSBpc0NvbmZpZ3VyYXRpb25PdmVycmlkZXMoYXJnMSkgPyBhcmcxIDogaXNDb25maWd1cmF0aW9uT3ZlcnJpZGVzKGFyZzIpID8gYXJnMiA6IHt9O1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmdldFZhbHVlKHNlY3Rpb24sIG92ZXJyaWRlcywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVWYWx1ZXModmFsdWVzOiBbc3RyaW5nLCB1bmtub3duXVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB7IGRhdGE6IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCkgfTtcblxuXHRcdGNvbnN0IGNoYW5nZWRLZXlzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB2YWx1ZXMpIHtcblx0XHRcdGNvbnN0IFtrZXksIHZhbHVlXSA9IGVudHJ5O1xuXHRcdFx0aWYgKHRoaXMuZ2V0VmFsdWUoa2V5KSA9PT0gdmFsdWUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZVZhbHVlKGtleSwgdmFsdWUpO1xuXHRcdFx0Y2hhbmdlZEtleXMucHVzaChrZXkpO1xuXHRcdH1cblxuXHRcdGlmIChjaGFuZ2VkS2V5cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQgPSBuZXcgQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KHsga2V5czogY2hhbmdlZEtleXMsIG92ZXJyaWRlczogW10gfSwgcHJldmlvdXMsIHRoaXMuX2NvbmZpZ3VyYXRpb24sIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudC5zb3VyY2UgPSBDb25maWd1cmF0aW9uVGFyZ2V0Lk1FTU9SWTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5maXJlKGNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgYXJnMz86IHVua25vd24sIGFyZzQ/OiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMudXBkYXRlVmFsdWVzKFtba2V5LCB2YWx1ZV1dKTtcblx0fVxuXG5cdHB1YmxpYyBpbnNwZWN0PEM+KGtleTogc3RyaW5nLCBvcHRpb25zOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyA9IHt9KTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxDPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uaW5zcGVjdDxDPihrZXksIG9wdGlvbnMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMga2V5cygpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5rZXlzKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVsb2FkQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29uZmlndXJhdGlvbkRhdGEoKTogSUNvbmZpZ3VyYXRpb25EYXRhIHwgbnVsbCB7XG5cdFx0Y29uc3QgZW1wdHlNb2RlbDogSUNvbmZpZ3VyYXRpb25Nb2RlbCA9IHtcblx0XHRcdGNvbnRlbnRzOiB7fSxcblx0XHRcdGtleXM6IFtdLFxuXHRcdFx0b3ZlcnJpZGVzOiBbXVxuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlZmF1bHRzOiBlbXB0eU1vZGVsLFxuXHRcdFx0cG9saWN5OiBlbXB0eU1vZGVsLFxuXHRcdFx0YXBwbGljYXRpb246IGVtcHR5TW9kZWwsXG5cdFx0XHR1c2VyTG9jYWw6IGVtcHR5TW9kZWwsXG5cdFx0XHR1c2VyUmVtb3RlOiBlbXB0eU1vZGVsLFxuXHRcdFx0d29ya3NwYWNlOiBlbXB0eU1vZGVsLFxuXHRcdFx0Zm9sZGVyczogW11cblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmZpcmUoeyBhZmZlY3RlZEtleXM6IGUuYWZmZWN0ZWRLZXlzLCBhZmZlY3RzQ29uZmlndXJhdGlvbjogKHJlc291cmNlOiBVUkksIGNvbmZpZ3VyYXRpb246IHN0cmluZykgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihjb25maWd1cmF0aW9uKSB9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXRWYWx1ZTxUPihyZXNvdXJjZTogVVJJLCBzZWN0aW9uPzogc3RyaW5nKTogVDtcblx0Z2V0VmFsdWU8VD4ocmVzb3VyY2U6IFVSSSwgcG9zaXRpb24/OiBJUG9zaXRpb24sIHNlY3Rpb24/OiBzdHJpbmcpOiBUO1xuXHRnZXRWYWx1ZTxUPihyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBhcmcyPzogdW5rbm93biwgYXJnMz86IHVua25vd24pIHtcblx0XHRjb25zdCBwb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCA9IFBvcy5pc0lQb3NpdGlvbihhcmcyKSA/IGFyZzIgOiBudWxsO1xuXHRcdGNvbnN0IHNlY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZCA9IHBvc2l0aW9uID8gKHR5cGVvZiBhcmczID09PSAnc3RyaW5nJyA/IGFyZzMgOiB1bmRlZmluZWQpIDogKHR5cGVvZiBhcmcyID09PSAnc3RyaW5nJyA/IGFyZzIgOiB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gcmVzb3VyY2UgPyB0aGlzLmdldExhbmd1YWdlKHJlc291cmNlLCBwb3NpdGlvbikgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBzZWN0aW9uID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8VD4oe1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFQ+KHNlY3Rpb24sIHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0b3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZVxuXHRcdH0pO1xuXHR9XG5cblx0aW5zcGVjdDxUPihyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBwb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCwgc2VjdGlvbjogc3RyaW5nKTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxSZWFkb25seTxUPj4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlID0gcmVzb3VyY2UgPyB0aGlzLmdldExhbmd1YWdlKHJlc291cmNlLCBwb3NpdGlvbikgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxUPihzZWN0aW9uLCB7IHJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IGxhbmd1YWdlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMYW5ndWFnZShyZXNvdXJjZTogVVJJLCBwb3NpdGlvbjogSVBvc2l0aW9uIHwgbnVsbCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHBvc2l0aW9uID8gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24ocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSA6IG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZShyZXNvdXJjZSk7XG5cdH1cblxuXHR1cGRhdGVWYWx1ZShyZXNvdXJjZTogVVJJLCBrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIGNvbmZpZ3VyYXRpb25UYXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoa2V5LCB2YWx1ZSwgeyByZXNvdXJjZSB9LCBjb25maWd1cmF0aW9uVGFyZ2V0KTtcblx0fVxufVxuXG5jbGFzcyBTdGFuZGFsb25lUmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSBpbXBsZW1lbnRzIElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0Z2V0RU9MKHJlc291cmNlOiBVUkksIGxhbmd1YWdlPzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBlb2wgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdmaWxlcy5lb2wnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbGFuZ3VhZ2UsIHJlc291cmNlIH0pO1xuXHRcdGlmIChlb2wgJiYgdHlwZW9mIGVvbCA9PT0gJ3N0cmluZycgJiYgZW9sICE9PSAnYXV0bycpIHtcblx0XHRcdHJldHVybiBlb2w7XG5cdFx0fVxuXHRcdHJldHVybiAoaXNMaW51eCB8fCBpc01hY2ludG9zaCkgPyAnXFxuJyA6ICdcXHJcXG4nO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVUZWxlbWV0cnlTZXJ2aWNlIGltcGxlbWVudHMgSVRlbGVtZXRyeVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGVsZW1ldHJ5TGV2ZWwgPSBUZWxlbWV0cnlMZXZlbC5OT05FO1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSAnc29tZVZhbHVlLnNlc3Npb25JZCc7XG5cdHJlYWRvbmx5IG1hY2hpbmVJZCA9ICdzb21lVmFsdWUubWFjaGluZUlkJztcblx0cmVhZG9ubHkgc3FtSWQgPSAnc29tZVZhbHVlLnNxbUlkJztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQgPSAnc29tZVZhbHVlLmRldkRldmljZUlkJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICdzb21lVmFsdWUuZmlyc3RTZXNzaW9uRGF0ZSc7XG5cdHJlYWRvbmx5IHNlbmRFcnJvclRlbGVtZXRyeSA9IGZhbHNlO1xuXHRzZXRFbmFibGVkKCk6IHZvaWQgeyB9XG5cdHNldEV4cGVyaW1lbnRQcm9wZXJ0eSgpOiB2b2lkIHsgfVxuXHRzZXRDb21tb25Qcm9wZXJ0eSgpOiB2b2lkIHsgfVxuXHRwdWJsaWNMb2coKSB7IH1cblx0cHVibGljTG9nMigpIHsgfVxuXHRwdWJsaWNMb2dFcnJvcigpIHsgfVxuXHRwdWJsaWNMb2dFcnJvcjIoKSB7IH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGltcGxlbWVudHMgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHtcblxuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNDSEVNRSA9ICdpbm1lbW9yeSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya3NwYWNlTmFtZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50PigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVyczogRXZlbnQ8SVdvcmtzcGFjZUZvbGRlcnNXaWxsQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBuZXcgRW1pdHRlcjxJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50PigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzOiBFdmVudDxJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlID0gbmV3IEVtaXR0ZXI8V29ya2JlbmNoU3RhdGU+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlOiBFdmVudDxXb3JrYmVuY2hTdGF0ZT4gPSB0aGlzLl9vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlOiBJV29ya3NwYWNlO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFN0YW5kYWxvbmVXb3Jrc3BhY2VDb250ZXh0U2VydmljZS5TQ0hFTUUsIGF1dGhvcml0eTogJ21vZGVsJywgcGF0aDogJy8nIH0pO1xuXHRcdHRoaXMud29ya3NwYWNlID0geyBpZDogU1RBTkRBTE9ORV9FRElUT1JfV09SS1NQQUNFX0lELCBmb2xkZXJzOiBbbmV3IFdvcmtzcGFjZUZvbGRlcih7IHVyaTogcmVzb3VyY2UsIG5hbWU6ICcnLCBpbmRleDogMCB9KV0gfTtcblx0fVxuXG5cdGdldENvbXBsZXRlV29ya3NwYWNlKCk6IFByb21pc2U8SVdvcmtzcGFjZT4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5nZXRXb3Jrc3BhY2UoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V29ya3NwYWNlKCk6IElXb3Jrc3BhY2Uge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXb3JrYmVuY2hTdGF0ZSgpOiBXb3JrYmVuY2hTdGF0ZSB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlKSB7XG5cdFx0XHRpZiAodGhpcy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFdvcmtiZW5jaFN0YXRlLkZPTERFUjtcblx0XHR9XG5cdFx0cmV0dXJuIFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHR9XG5cblx0cHVibGljIGhhc1dvcmtzcGFjZURhdGEoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlOiBVUkkpOiBJV29ya3NwYWNlRm9sZGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHJlc291cmNlICYmIHJlc291cmNlLnNjaGVtZSA9PT0gU3RhbmRhbG9uZVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLlNDSEVNRSA/IHRoaXMud29ya3NwYWNlLmZvbGRlcnNbMF0gOiBudWxsO1xuXHR9XG5cblx0cHVibGljIGlzSW5zaWRlV29ya3NwYWNlKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcmVzb3VyY2UgJiYgcmVzb3VyY2Uuc2NoZW1lID09PSBTdGFuZGFsb25lV29ya3NwYWNlQ29udGV4dFNlcnZpY2UuU0NIRU1FO1xuXHR9XG5cblx0cHVibGljIGlzQ3VycmVudFdvcmtzcGFjZSh3b3Jrc3BhY2VJZE9yRm9sZGVyOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyIHwgVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHNvdXJjZTogYW55LCBpc0RpZmZFZGl0b3I6IGJvb2xlYW4pOiB2b2lkIHtcblx0aWYgKCFzb3VyY2UpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKCEoY29uZmlndXJhdGlvblNlcnZpY2UgaW5zdGFuY2VvZiBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGNvbnN0IHRvVXBkYXRlOiBbc3RyaW5nLCB1bmtub3duXVtdID0gW107XG5cdE9iamVjdC5rZXlzKHNvdXJjZSkuZm9yRWFjaCgoa2V5KSA9PiB7XG5cdFx0aWYgKGlzRWRpdG9yQ29uZmlndXJhdGlvbktleShrZXkpKSB7XG5cdFx0XHR0b1VwZGF0ZS5wdXNoKFtgZWRpdG9yLiR7a2V5fWAsIHNvdXJjZVtrZXldXSk7XG5cdFx0fVxuXHRcdGlmIChpc0RpZmZFZGl0b3IgJiYgaXNEaWZmRWRpdG9yQ29uZmlndXJhdGlvbktleShrZXkpKSB7XG5cdFx0XHR0b1VwZGF0ZS5wdXNoKFtgZGlmZkVkaXRvci4ke2tleX1gLCBzb3VyY2Vba2V5XV0pO1xuXHRcdH1cblx0fSk7XG5cdGlmICh0b1VwZGF0ZS5sZW5ndGggPiAwKSB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWVzKHRvVXBkYXRlKTtcblx0fVxufVxuXG5jbGFzcyBTdGFuZGFsb25lQnVsa0VkaXRTZXJ2aWNlIGltcGxlbWVudHMgSUJ1bGtFZGl0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZVxuXHQpIHtcblx0XHQvL1xuXHR9XG5cblx0aGFzUHJldmlld0hhbmRsZXIoKTogZmFsc2Uge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHNldFByZXZpZXdIYW5kbGVyKCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0YXN5bmMgYXBwbHkoZWRpdHNJbjogUmVzb3VyY2VFZGl0W10gfCBXb3Jrc3BhY2VFZGl0LCBfb3B0aW9ucz86IElCdWxrRWRpdE9wdGlvbnMpOiBQcm9taXNlPElCdWxrRWRpdFJlc3VsdD4ge1xuXHRcdGNvbnN0IGVkaXRzID0gQXJyYXkuaXNBcnJheShlZGl0c0luKSA/IGVkaXRzSW4gOiBSZXNvdXJjZUVkaXQuY29udmVydChlZGl0c0luKTtcblx0XHRjb25zdCB0ZXh0RWRpdHMgPSBuZXcgTWFwPElUZXh0TW9kZWwsIElTaW5nbGVFZGl0T3BlcmF0aW9uW10+KCk7XG5cblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRcdGlmICghKGVkaXQgaW5zdGFuY2VvZiBSZXNvdXJjZVRleHRFZGl0KSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2JhZCBlZGl0IC0gb25seSB0ZXh0IGVkaXRzIGFyZSBzdXBwb3J0ZWQnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWxTZXJ2aWNlLmdldE1vZGVsKGVkaXQucmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2JhZCBlZGl0IC0gbW9kZWwgbm90IGZvdW5kJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGVkaXQudmVyc2lvbklkID09PSAnbnVtYmVyJyAmJiBtb2RlbC5nZXRWZXJzaW9uSWQoKSAhPT0gZWRpdC52ZXJzaW9uSWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdiYWQgc3RhdGUgLSBtb2RlbCBjaGFuZ2VkIGluIHRoZSBtZWFudGltZScpO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGFycmF5ID0gdGV4dEVkaXRzLmdldChtb2RlbCk7XG5cdFx0XHRpZiAoIWFycmF5KSB7XG5cdFx0XHRcdGFycmF5ID0gW107XG5cdFx0XHRcdHRleHRFZGl0cy5zZXQobW9kZWwsIGFycmF5KTtcblx0XHRcdH1cblx0XHRcdGFycmF5LnB1c2goRWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShSYW5nZS5saWZ0KGVkaXQudGV4dEVkaXQucmFuZ2UpLCBlZGl0LnRleHRFZGl0LnRleHQpKTtcblx0XHR9XG5cblxuXHRcdGxldCB0b3RhbEVkaXRzID0gMDtcblx0XHRsZXQgdG90YWxGaWxlcyA9IDA7XG5cdFx0Zm9yIChjb25zdCBbbW9kZWwsIGVkaXRzXSBvZiB0ZXh0RWRpdHMpIHtcblx0XHRcdG1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbXSwgZWRpdHMsICgpID0+IFtdKTtcblx0XHRcdG1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHRvdGFsRmlsZXMgKz0gMTtcblx0XHRcdHRvdGFsRWRpdHMgKz0gZWRpdHMubGVuZ3RoO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRhcmlhU3VtbWFyeTogc3RyaW5ncy5mb3JtYXQoU3RhbmRhbG9uZVNlcnZpY2VzTkxTLmJ1bGtFZGl0U2VydmljZVN1bW1hcnksIHRvdGFsRWRpdHMsIHRvdGFsRmlsZXMpLFxuXHRcdFx0aXNBcHBsaWVkOiB0b3RhbEVkaXRzID4gMFxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgU3RhbmRhbG9uZVVyaUxhYmVsU2VydmljZSBpbXBsZW1lbnRzIElMYWJlbFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUZvcm1hdHRlcnM6IEV2ZW50PElGb3JtYXR0ZXJDaGFuZ2VFdmVudD4gPSBFdmVudC5Ob25lO1xuXG5cdHB1YmxpYyBnZXRVcmlMYWJlbChyZXNvdXJjZTogVVJJLCBvcHRpb25zPzogeyByZWxhdGl2ZT86IGJvb2xlYW47IGZvcmNlTm9UaWxkaWZ5PzogYm9vbGVhbiB9KTogc3RyaW5nIHtcblx0XHRpZiAocmVzb3VyY2Uuc2NoZW1lID09PSAnZmlsZScpIHtcblx0XHRcdHJldHVybiByZXNvdXJjZS5mc1BhdGg7XG5cdFx0fVxuXHRcdHJldHVybiByZXNvdXJjZS5wYXRoO1xuXHR9XG5cblx0Z2V0VXJpQmFzZW5hbWVMYWJlbChyZXNvdXJjZTogVVJJKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYmFzZW5hbWUocmVzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIGdldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB8IFVSSSB8IElXb3Jrc3BhY2UsIG9wdGlvbnM/OiB7IHZlcmJvc2U6IFZlcmJvc2l0eSB9KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2VwYXJhdG9yKHNjaGVtZTogc3RyaW5nLCBhdXRob3JpdHk/OiBzdHJpbmcpOiAnLycgfCAnXFxcXCcge1xuXHRcdHJldHVybiAnLyc7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJGb3JtYXR0ZXIoZm9ybWF0dGVyOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJDYWNoZWRGb3JtYXR0ZXIoZm9ybWF0dGVyOiBSZXNvdXJjZUxhYmVsRm9ybWF0dGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLnJlZ2lzdGVyRm9ybWF0dGVyKGZvcm1hdHRlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SG9zdExhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHVibGljIGdldEhvc3RUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5cbmNsYXNzIFN0YW5kYWxvbmVDb250ZXh0Vmlld1NlcnZpY2UgZXh0ZW5kcyBDb250ZXh0Vmlld1NlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJTGF5b3V0U2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGxheW91dFNlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2hvd0NvbnRleHRWaWV3KGRlbGVnYXRlOiBJQ29udGV4dFZpZXdEZWxlZ2F0ZSwgY29udGFpbmVyPzogSFRNTEVsZW1lbnQsIHNoYWRvd1Jvb3Q/OiBib29sZWFuKTogSU9wZW5Db250ZXh0VmlldyB7XG5cdFx0aWYgKCFjb250YWluZXIpIHtcblx0XHRcdGNvbnN0IGNvZGVFZGl0b3IgPSB0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5nZXRGb2N1c2VkQ29kZUVkaXRvcigpIHx8IHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLmdldEFjdGl2ZUNvZGVFZGl0b3IoKTtcblx0XHRcdGlmIChjb2RlRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnRhaW5lciA9IGNvZGVFZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuc2hvd0NvbnRleHRWaWV3KGRlbGVnYXRlLCBjb250YWluZXIsIHNoYWRvd1Jvb3QpO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfbmV2ZXJFbWl0dGVyID0gbmV3IEVtaXR0ZXI8bmV2ZXI+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVRydXN0OiBFdmVudDxib29sZWFuPiA9IHRoaXMuX25ldmVyRW1pdHRlci5ldmVudDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVyczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9uZXZlckVtaXR0ZXIuZXZlbnQ7XG5cdHB1YmxpYyByZWFkb25seSB3b3Jrc3BhY2VSZXNvbHZlZCA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwdWJsaWMgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZCA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWNjZXB0c091dE9mV29ya3NwYWNlRmlsZXMgPSB0cnVlO1xuXG5cdGlzV29ya3NwYWNlVHJ1c3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpc1dvcmtzcGFjZVRydXN0Rm9yY2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjYW5TZXRQYXJlbnRGb2xkZXJUcnVzdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0YXN5bmMgc2V0UGFyZW50Rm9sZGVyVHJ1c3QodHJ1c3RlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vb3Bcblx0fVxuXHRjYW5TZXRXb3Jrc3BhY2VUcnVzdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0YXN5bmMgc2V0V29ya3NwYWNlVHJ1c3QodHJ1c3RlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vb3Bcblx0fVxuXHRnZXRVcmlUcnVzdEluZm8odXJpOiBVUkkpOiBQcm9taXNlPElXb3Jrc3BhY2VUcnVzdFVyaUluZm8+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3Qgc3VwcG9ydGVkLicpO1xuXHR9XG5cdGFzeW5jIHNldFVyaXNUcnVzdCh1cmk6IFVSSVtdLCB0cnVzdGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cdGdldFRydXN0ZWRVcmlzKCk6IFVSSVtdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0YXN5bmMgc2V0VHJ1c3RlZFVyaXModXJpczogVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub29wXG5cdH1cblx0YWRkV29ya3NwYWNlVHJ1c3RUcmFuc2l0aW9uUGFydGljaXBhbnQocGFydGljaXBhbnQ6IElXb3Jrc3BhY2VUcnVzdFRyYW5zaXRpb25QYXJ0aWNpcGFudCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3Qgc3VwcG9ydGVkLicpO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVMYW5ndWFnZVNlcnZpY2UgZXh0ZW5kcyBMYW5ndWFnZVNlcnZpY2Uge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVMb2dTZXJ2aWNlIGV4dGVuZHMgTG9nU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKG5ldyBDb25zb2xlTG9nZ2VyKCkpO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVDb250ZXh0TWVudVNlcnZpY2UgZXh0ZW5kcyBDb250ZXh0TWVudVNlcnZpY2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodGVsZW1ldHJ5U2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgY29udGV4dFZpZXdTZXJ2aWNlLCBrZXliaW5kaW5nU2VydmljZSwgbWVudVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNvbmZpZ3VyZSh7IGJsb2NrTW91c2U6IGZhbHNlIH0pOyAvLyB3ZSBkbyBub3Qgd2FudCB0aGF0IGluIHRoZSBzdGFuZGFsb25lIGVkaXRvclxuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVBY2Nlc3NiaWxpdHlTaWduYWxTZXJ2aWNlIGltcGxlbWVudHMgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRhc3luYyBwbGF5U2lnbmFsKGN1ZTogQWNjZXNzaWJpbGl0eVNpZ25hbCwgb3B0aW9uczoge30pOiBQcm9taXNlPHZvaWQ+IHtcblx0fVxuXG5cdGFzeW5jIHBsYXlTaWduYWxzKGN1ZXM6IEFjY2Vzc2liaWxpdHlTaWduYWxbXSk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG5cblx0Z2V0RW5hYmxlZFN0YXRlKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgdXNlckdlc3R1cmU6IGJvb2xlYW4sIG1vZGFsaXR5PzogQWNjZXNzaWJpbGl0eU1vZGFsaXR5IHwgdW5kZWZpbmVkKTogSVZhbHVlV2l0aENoYW5nZUV2ZW50PGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gVmFsdWVXaXRoQ2hhbmdlRXZlbnQuY29uc3QoZmFsc2UpO1xuXHR9XG5cblx0Z2V0RGVsYXlNcyhzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWwsIG1vZGFsaXR5OiBBY2Nlc3NpYmlsaXR5TW9kYWxpdHkpOiBudW1iZXIge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0aXNTb3VuZEVuYWJsZWQoY3VlOiBBY2Nlc3NpYmlsaXR5U2lnbmFsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aXNBbm5vdW5jZW1lbnRFbmFibGVkKGN1ZTogQWNjZXNzaWJpbGl0eVNpZ25hbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdG9uU291bmRFbmFibGVkQ2hhbmdlZChjdWU6IEFjY2Vzc2liaWxpdHlTaWduYWwpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIEV2ZW50Lk5vbmU7XG5cdH1cblxuXHRhc3luYyBwbGF5U291bmQoY3VlOiBTb3VuZCwgYWxsb3dNYW55SW5QYXJhbGxlbD86IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0fVxuXHRwbGF5U2lnbmFsTG9vcChjdWU6IEFjY2Vzc2liaWxpdHlTaWduYWwpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pO1xuXHR9XG59XG5cbmNsYXNzIFN0YW5kYWxvbmVEZWZhdWx0QWNjb3VudFNlcnZpY2UgaW1wbGVtZW50cyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudDogRXZlbnQ8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBvbGljeURhdGE6IEV2ZW50PElQb2xpY3lEYXRhIHwgbnVsbD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBjdXJyZW50RGVmYXVsdEFjY291bnQ6IElEZWZhdWx0QWNjb3VudCB8IG51bGwgPSBudWxsO1xuXHRyZWFkb25seSBjb3BpbG90VG9rZW5JbmZvID0gbnVsbDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvOiBFdmVudDxudWxsPiA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IG1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzOiBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzRmV0Y2hlZEF0OiBudWxsID0gbnVsbDtcblx0cmVhZG9ubHkgbWFuYWdlZFNldHRpbmdzUmF3UmVzcG9uc2U6IHVua25vd24gPSBudWxsO1xuXG5cdGFzeW5jIGdldERlZmF1bHRBY2NvdW50KCk6IFByb21pc2U8SURlZmF1bHRBY2NvdW50IHwgbnVsbD4ge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0c2V0RGVmYXVsdEFjY291bnRQcm92aWRlcigpOiB2b2lkIHtcblx0XHQvLyBuby1vcFxuXHR9XG5cblx0YXN5bmMgcmVmcmVzaCgpOiBQcm9taXNlPElEZWZhdWx0QWNjb3VudCB8IG51bGw+IHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGdldERlZmF1bHRBY2NvdW50QXV0aGVudGljYXRpb25Qcm92aWRlcigpOiBJRGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblx0XHRyZXR1cm4geyBpZDogJ2RlZmF1bHQnLCBuYW1lOiAnRGVmYXVsdCcsIGVudGVycHJpc2U6IGZhbHNlIH07XG5cdH1cblxuXHRyZXNvbHZlR2l0SHViVXJsKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGBodHRwczovL2dpdGh1Yi5jb20vJHtwYXRofWA7XG5cdH1cblxuXHRhc3luYyBzaWduSW4oKTogUHJvbWlzZTxJRGVmYXVsdEFjY291bnQgfCBudWxsPiB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRhc3luYyBzaWduT3V0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIG5vLW9wXG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yT3ZlcnJpZGVTZXJ2aWNlcyB7XG5cdFtpbmRleDogc3RyaW5nXTogdW5rbm93bjtcbn1cblxuXG5yZWdpc3RlclNpbmdsZXRvbihJV2ViV29ya2VyU2VydmljZSwgU3RhbmRhbG9uZVdlYldvcmtlclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElMb2dTZXJ2aWNlLCBTdGFuZGFsb25lTG9nU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBTdGFuZGFsb25lQ29uZmlndXJhdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSwgU3RhbmRhbG9uZVJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSwgU3RhbmRhbG9uZVJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgU3RhbmRhbG9uZVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJTGFiZWxTZXJ2aWNlLCBTdGFuZGFsb25lVXJpTGFiZWxTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJVGVsZW1ldHJ5U2VydmljZSwgU3RhbmRhbG9uZVRlbGVtZXRyeVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElEaWFsb2dTZXJ2aWNlLCBTdGFuZGFsb25lRGlhbG9nU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUVudmlyb25tZW50U2VydmljZSwgU3RhbmRhbG9uZUVudmlyb25tZW50U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU5vdGlmaWNhdGlvblNlcnZpY2UsIFN0YW5kYWxvbmVOb3RpZmljYXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJTWFya2VyU2VydmljZSwgTWFya2VyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUxhbmd1YWdlU2VydmljZSwgU3RhbmRhbG9uZUxhbmd1YWdlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UsIFN0YW5kYWxvbmVUaGVtZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElNb2RlbFNlcnZpY2UsIE1vZGVsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSU1hcmtlckRlY29yYXRpb25zU2VydmljZSwgTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJQ29udGV4dEtleVNlcnZpY2UsIENvbnRleHRLZXlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJUHJvZ3Jlc3NTZXJ2aWNlLCBTdGFuZGFsb25lUHJvZ3Jlc3NTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBTdGFuZGFsb25lRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJU3RvcmFnZVNlcnZpY2UsIEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElCdWxrRWRpdFNlcnZpY2UsIFN0YW5kYWxvbmVCdWxrRWRpdFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBTdGFuZGFsb25lV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSVRleHRNb2RlbFNlcnZpY2UsIFN0YW5kYWxvbmVUZXh0TW9kZWxTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJQWNjZXNzaWJpbGl0eVNlcnZpY2UsIEFjY2Vzc2liaWxpdHlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJQ29tbWFuZFNlcnZpY2UsIFN0YW5kYWxvbmVDb21tYW5kU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUtleWJpbmRpbmdTZXJ2aWNlLCBTdGFuZGFsb25lS2V5YmluZGluZ1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElRdWlja0lucHV0U2VydmljZSwgU3RhbmRhbG9uZVF1aWNrSW5wdXRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJQ29udGV4dFZpZXdTZXJ2aWNlLCBTdGFuZGFsb25lQ29udGV4dFZpZXdTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJT3BlbmVyU2VydmljZSwgT3BlbmVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xucmVnaXN0ZXJTaW5nbGV0b24oSUNsaXBib2FyZFNlcnZpY2UsIEJyb3dzZXJDbGlwYm9hcmRTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJQ29udGV4dE1lbnVTZXJ2aWNlLCBTdGFuZGFsb25lQ29udGV4dE1lbnVTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJTWVudVNlcnZpY2UsIE1lbnVTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsIFN0YW5kYWxvbmVBY2Nlc3NiaWxpdHlTaWduYWxTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLCBTdGFuZGFsb25lVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJTG9nZ2VyU2VydmljZSwgTnVsbExvZ2dlclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElEYXRhQ2hhbm5lbFNlcnZpY2UsIE51bGxEYXRhQ2hhbm5lbFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElEZWZhdWx0QWNjb3VudFNlcnZpY2UsIFN0YW5kYWxvbmVEZWZhdWx0QWNjb3VudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbnJlZ2lzdGVyU2luZ2xldG9uKElSZW5hbWVTeW1ib2xUcmFja2VyU2VydmljZSwgTnVsbFJlbmFtZVN5bWJvbFRyYWNrZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG5yZWdpc3RlclNpbmdsZXRvbihJVXNlckludGVyYWN0aW9uU2VydmljZSwgVXNlckludGVyYWN0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuXG4vKipcbiAqIFdlIGRvbid0IHdhbnQgdG8gZWFnZXJseSBpbnN0YW50aWF0ZSBzZXJ2aWNlcyBiZWNhdXNlIGVtYmVkZGVycyBnZXQgYSBvbmUgdGltZSBjaGFuY2VcbiAqIHRvIG92ZXJyaWRlIHNlcnZpY2VzIHdoZW4gdGhleSBjcmVhdGUgdGhlIGZpcnN0IGVkaXRvci5cbiAqL1xuZXhwb3J0IG5hbWVzcGFjZSBTdGFuZGFsb25lU2VydmljZXMge1xuXG5cdGNvbnN0IHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdGZvciAoY29uc3QgW2lkLCBkZXNjcmlwdG9yXSBvZiBnZXRTaW5nbGV0b25TZXJ2aWNlRGVzY3JpcHRvcnMoKSkge1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uLnNldChpZCwgZGVzY3JpcHRvcik7XG5cdH1cblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlQ29sbGVjdGlvbiwgdHJ1ZSk7XG5cdHNlcnZpY2VDb2xsZWN0aW9uLnNldChJSW5zdGFudGlhdGlvblNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRleHBvcnQgZnVuY3Rpb24gZ2V0PFQ+KHNlcnZpY2VJZDogU2VydmljZUlkZW50aWZpZXI8VD4pOiBUIHtcblx0XHRpZiAoIWluaXRpYWxpemVkKSB7XG5cdFx0XHRpbml0aWFsaXplKHt9KTtcblx0XHR9XG5cdFx0Y29uc3QgciA9IHNlcnZpY2VDb2xsZWN0aW9uLmdldChzZXJ2aWNlSWQpO1xuXHRcdGlmICghcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHNlcnZpY2UgJyArIHNlcnZpY2VJZCk7XG5cdFx0fVxuXHRcdGlmIChyIGluc3RhbmNlb2YgU3luY0Rlc2NyaXB0b3IpIHtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IGFjY2Vzc29yLmdldChzZXJ2aWNlSWQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGluaXRpYWxpemVkID0gZmFsc2U7XG5cdGNvbnN0IG9uRGlkSW5pdGlhbGl6ZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdGV4cG9ydCBmdW5jdGlvbiBpbml0aWFsaXplKG92ZXJyaWRlczogSUVkaXRvck92ZXJyaWRlU2VydmljZXMpOiBJSW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRcdGlmIChpbml0aWFsaXplZCkge1xuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdH1cblx0XHRpbml0aWFsaXplZCA9IHRydWU7XG5cblx0XHQvLyBBZGQgc2luZ2xldG9ucyB0aGF0IHdlcmUgcmVnaXN0ZXJlZCBhZnRlciB0aGlzIG1vZHVsZSBsb2FkZWRcblx0XHRmb3IgKGNvbnN0IFtpZCwgZGVzY3JpcHRvcl0gb2YgZ2V0U2luZ2xldG9uU2VydmljZURlc2NyaXB0b3JzKCkpIHtcblx0XHRcdGlmICghc2VydmljZUNvbGxlY3Rpb24uZ2V0KGlkKSkge1xuXHRcdFx0XHRzZXJ2aWNlQ29sbGVjdGlvbi5zZXQoaWQsIGRlc2NyaXB0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHNlcnZpY2UgY29sbGVjdGlvbiB3aXRoIHRoZSBvdmVycmlkZXMsIGJ1dCBvbmx5IGlmIHRoZVxuXHRcdC8vIHNlcnZpY2Ugd2FzIG5vdCBpbnN0YW50aWF0ZWQgaW4gdGhlIG1lYW50aW1lLlxuXHRcdGZvciAoY29uc3Qgc2VydmljZUlkIGluIG92ZXJyaWRlcykge1xuXHRcdFx0aWYgKG92ZXJyaWRlcy5oYXNPd25Qcm9wZXJ0eShzZXJ2aWNlSWQpKSB7XG5cdFx0XHRcdGNvbnN0IHNlcnZpY2VJZGVudGlmaWVyID0gY3JlYXRlRGVjb3JhdG9yKHNlcnZpY2VJZCk7XG5cdFx0XHRcdGNvbnN0IHIgPSBzZXJ2aWNlQ29sbGVjdGlvbi5nZXQoc2VydmljZUlkZW50aWZpZXIpO1xuXHRcdFx0XHRpZiAociBpbnN0YW5jZW9mIFN5bmNEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdFx0c2VydmljZUNvbGxlY3Rpb24uc2V0KHNlcnZpY2VJZGVudGlmaWVyLCBvdmVycmlkZXNbc2VydmljZUlkXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbnN0YW50aWF0ZSBhbGwgZWRpdG9yIGZlYXR1cmVzXG5cdFx0Y29uc3QgZWRpdG9yRmVhdHVyZXMgPSBnZXRFZGl0b3JGZWF0dXJlcygpO1xuXHRcdGZvciAoY29uc3QgZmVhdHVyZSBvZiBlZGl0b3JGZWF0dXJlcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoZmVhdHVyZSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRvbkRpZEluaXRpYWxpemUuZmlyZSgpO1xuXG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4ZWN1dGVzIGNhbGxiYWNrIG9uY2Ugc2VydmljZXMgYXJlIGluaXRpYWxpemVkLlxuXHQgKi9cblx0ZXhwb3J0IGZ1bmN0aW9uIHdpdGhTZXJ2aWNlcyhjYWxsYmFjazogKCkgPT4gSURpc3Bvc2FibGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKGluaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soKTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBkaXNwb3NhYmxlLmFkZChvbkRpZEluaXRpYWxpemUuZXZlbnQoKCkgPT4ge1xuXHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZS5hZGQoY2FsbGJhY2soKSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGU7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsT0FBTztBQUVQLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQVMsT0FBOEIsNEJBQTRCO0FBQzVFLFNBQVMsY0FBOEMsd0JBQXdCO0FBQy9FLFNBQVMsWUFBWSxpQkFBMEMsbUJBQW1CLG9CQUFvQixvQkFBb0I7QUFDMUgsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxJQUFJLFNBQVMsbUJBQW1CO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLE9BQU8sY0FBYztBQUNyQixZQUFZLGFBQWE7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXFELG1DQUEwQztBQUMvRixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5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
