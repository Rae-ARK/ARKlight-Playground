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
import { defineFixture, defineFixtureGroup, defineFixtureVariants } from "@vscode/component-explorer";
import { DisposableStore, DisposableTracker, setDisposableTracker, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ModifierKeyEmitter } from "../../../../base/browser/dom.js";
import "../../../../../../build/vite/style.css";
import "../../../browser/media/style.css";
import "../../../browser/parts/auxiliarybar/media/auxiliaryBarPart.css";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ThemeTypeSelector } from "../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ColorThemeData } from "../../../services/themes/common/colorThemeData.js";
import { ExtensionData } from "../../../services/themes/common/workbenchThemeService.js";
import { ensureGlobalStylesInstalled, getStylesheetDocumentFiles, overrideStylesheetOrder } from "./fixtureUtilsCss.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { IInlineCompletionsService, InlineCompletionsService } from "../../../../editor/browser/services/inlineCompletionsService.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../editor/common/languages/languageConfigurationRegistry.js";
import { IEditorWorkerService } from "../../../../editor/common/services/editorWorker.js";
import { ILanguageFeatureDebounceService, LanguageFeatureDebounceService } from "../../../../editor/common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../editor/common/services/languageFeaturesService.js";
import { LanguageService } from "../../../../editor/common/services/languageService.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ModelService } from "../../../../editor/common/services/modelService.js";
import { ITextResourcePropertiesService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { ITreeSitterLibraryService } from "../../../../editor/common/services/treeSitter/treeSitterLibraryService.js";
import { ICodeLensCache } from "../../../../editor/contrib/codelens/browser/codeLensCache.js";
import { TestCodeEditorService, TestCommandService } from "../../../../editor/test/browser/editorTestServices.js";
import { TestLanguageConfigurationService } from "../../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { TestEditorWorkerService } from "../../../../editor/test/common/services/testEditorWorkerService.js";
import { TestTextResourcePropertiesService } from "../../../../editor/test/common/services/testTextResourcePropertiesService.js";
import { TestTreeSitterLibraryService } from "../../../../editor/test/common/services/testTreeSitterLibraryService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { TestAccessibilityService } from "../../../../platform/accessibility/test/common/testAccessibilityService.js";
import { IActionViewItemService, NullActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { IChatPhoneInputPresenter } from "../../../contrib/chat/browser/widget/input/chatPhoneInputPresenter.js";
import { IMenuService } from "../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { TestClipboardService } from "../../../../platform/clipboard/test/common/testClipboardService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IDataChannelService, NullDataChannelService } from "../../../../platform/dataChannel/common/dataChannel.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { TestDialogService } from "../../../../platform/dialogs/test/common/testDialogService.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { MockContextKeyService, MockKeybindingService } from "../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ILoggerService, ILogService, NullLoggerService, NullLogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../platform/notification/test/common/testNotificationService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { NullOpenerService } from "../../../../platform/opener/test/common/nullOpenerService.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryServiceShape } from "../../../../platform/telemetry/common/telemetryUtils.js";
import { TestThemeService } from "../../../../platform/theme/test/common/testThemeService.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { UndoRedoService } from "../../../../platform/undoRedo/common/undoRedoService.js";
import { IUserInteractionService, MockUserInteractionService } from "../../../../platform/userInteraction/browser/userInteractionService.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { TestMenuService } from "../workbenchTestServices.js";
import { IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, IAgentFeedbackService } from "../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js";
import { IChatEditingService } from "../../../contrib/chat/common/editing/chatEditingService.js";
import { ISessionsManagementService } from "../../../../sessions/services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../sessions/services/sessions/browser/sessionsService.js";
import { ICodeReviewService, PRReviewStateKind } from "../../../../sessions/contrib/codeReview/browser/codeReviewService.js";
import { constObservable } from "../../../../base/common/observable.js";
import "./fixtures.css";
import { installFakeRunWhenIdle } from "../../../../base/common/async.js";
import { buildHistoryFromTasks, renderSwimlanes } from "../../../../base/test/common/executionGraph.js";
import { pushRandomOverwrite } from "../../../../base/test/common/randomOverwrite.js";
import {
  captureGlobalTimeApi,
  createLoggingTimeApi,
  createTraceRoot,
  createVirtualTimeApi,
  drainMicrotasksEmbedding,
  nextMacrotask,
  pushGlobalTimeApi,
  TraceContext,
  untilTime,
  VirtualClock,
  VirtualTimeProcessor
} from "../../../../base/test/common/virtualScheduling/index.js";
import "../../../../platform/theme/common/colors/baseColors.js";
import "../../../../platform/theme/common/colors/editorColors.js";
import "../../../../platform/theme/common/colors/listColors.js";
import "../../../../platform/theme/common/colors/miscColors.js";
import "../../../common/theme.js";
import sourceMapSupport from "source-map-support";
sourceMapSupport.install({
  environment: "browser",
  handleUncaughtExceptions: false,
  retrieveSourceMap: (source) => {
    const mapUrl = source + ".map";
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", mapUrl, false);
      xhr.send();
      if (xhr.status === 200) {
        return { url: null, map: xhr.responseText };
      }
    } catch {
    }
    return null;
  }
});
class NullStorageService {
  constructor() {
    this._onDidChangeValue = new Emitter();
    this._onDidChangeTarget = new Emitter();
    this.onDidChangeTarget = this._onDidChangeTarget.event;
    this._onWillSaveState = new Emitter();
    this.onWillSaveState = this._onWillSaveState.event;
  }
  onDidChangeValue(scope, key, disposable) {
    return Event.filter(this._onDidChangeValue.event, (e) => e.scope === scope && (key === void 0 || e.key === key), disposable);
  }
  get(_key, _scope, fallbackValue) {
    return fallbackValue;
  }
  getBoolean(_key, _scope, fallbackValue) {
    return fallbackValue;
  }
  getNumber(_key, _scope, fallbackValue) {
    return fallbackValue;
  }
  getObject(_key, _scope, fallbackValue) {
    return fallbackValue;
  }
  store(_key, _value, _scope, _target) {
  }
  storeAll(_entries, _external) {
  }
  remove(_key, _scope) {
  }
  isNew(_scope) {
    return true;
  }
  flush(_reason) {
    return Promise.resolve();
  }
  optimize(_scope) {
    return Promise.resolve();
  }
  log() {
  }
  keys(_scope, _target) {
    return [];
  }
  switch() {
    return Promise.resolve();
  }
  hasScope(_scope) {
    return false;
  }
}
import dark_modern from "../../../../../../extensions/theme-defaults/themes/dark_modern.json";
import dark_plus from "../../../../../../extensions/theme-defaults/themes/dark_plus.json";
import dark_vs from "../../../../../../extensions/theme-defaults/themes/dark_vs.json";
import hc_black from "../../../../../../extensions/theme-defaults/themes/hc_black.json";
import light_modern from "../../../../../../extensions/theme-defaults/themes/light_modern.json";
import light_plus from "../../../../../../extensions/theme-defaults/themes/light_plus.json";
import light_vs from "../../../../../../extensions/theme-defaults/themes/light_vs.json";
const themeJsonModules = {
  "/extensions/theme-defaults/themes/dark_modern.json": dark_modern,
  "/extensions/theme-defaults/themes/dark_plus.json": dark_plus,
  "/extensions/theme-defaults/themes/dark_vs.json": dark_vs,
  "/extensions/theme-defaults/themes/hc_black.json": hc_black,
  "/extensions/theme-defaults/themes/light_modern.json": light_modern,
  "/extensions/theme-defaults/themes/light_plus.json": light_plus,
  "/extensions/theme-defaults/themes/light_vs.json": light_vs
};
const fixtureExtensionResourceLoaderService = new class {
  async readExtensionResource(uri) {
    const content = themeJsonModules[uri.path];
    if (content === void 0) {
      throw new Error(`Fixture extension resource not found: ${uri.toString()}`);
    }
    return content;
  }
  supportsExtensionGalleryResources() {
    return Promise.resolve(false);
  }
  isExtensionGalleryResource() {
    return Promise.resolve(false);
  }
  getExtensionGalleryResourceURL() {
    return Promise.resolve(void 0);
  }
}();
function createBuiltInTheme(themePath, uiTheme) {
  const location = URI.parse(`file://${themePath}`);
  return ColorThemeData.fromExtensionTheme(
    { id: themePath, path: themePath, uiTheme, _watch: false },
    location,
    ExtensionData.fromName("vscode", "theme-defaults", true)
  );
}
const darkTheme = createBuiltInTheme("/extensions/theme-defaults/themes/dark_modern.json", ThemeTypeSelector.VS_DARK);
const lightTheme = createBuiltInTheme("/extensions/theme-defaults/themes/light_modern.json", ThemeTypeSelector.VS);
const darkHighContrastTheme = createBuiltInTheme("/extensions/theme-defaults/themes/hc_black.json", ThemeTypeSelector.HC_BLACK);
const darkThemeVariant = { label: "Dark", background: "dark", theme: darkTheme, scopeThemingParticipants: false };
const lightThemeVariant = { label: "Light", background: "light", theme: lightTheme, scopeThemingParticipants: false };
const additionalThemeVariants = {
  darkHighContrast: { label: "DarkHighContrast", background: "dark", theme: darkHighContrastTheme, scopeThemingParticipants: true }
};
const themeLoadedPromises = /* @__PURE__ */ new WeakMap();
function ensureThemeLoaded(theme) {
  let themeLoadedPromise = themeLoadedPromises.get(theme);
  if (!themeLoadedPromise) {
    themeLoadedPromise = theme.ensureLoaded(fixtureExtensionResourceLoaderService);
    themeLoadedPromises.set(theme, themeLoadedPromise);
  }
  return themeLoadedPromise;
}
async function setupTheme(container, theme, scopeThemingParticipants = false) {
  await ensureThemeLoaded(theme);
  await ensureGlobalStylesInstalled(theme, scopeThemingParticipants);
  container.classList.add("monaco-workbench", getPlatformClass(), "disable-animations", ...theme.classNames);
}
function parseFixtureInput(input) {
  if (!input || typeof input !== "object") {
    return { reverseStylesheets: false, outputTimeTrace: false, outputStylesheetFiles: false };
  }
  const record = input;
  return {
    reverseStylesheets: parseReverseOption(record.reverseStylesheets),
    outputTimeTrace: !!record.outputTimeTrace,
    outputStylesheetFiles: !!record.outputStylesheetFiles
  };
}
function parseReverseOption(value) {
  if (value === true) {
    return true;
  }
  if (value && typeof value === "object") {
    const range = value;
    if (typeof range.fromIndex === "number" && typeof range.toIndex === "number") {
      return { fromIndex: range.fromIndex, toIndex: range.toIndex };
    }
  }
  return false;
}
function getPlatformClass() {
  const alwaysUseMac = true;
  if (alwaysUseMac) {
    return "mac";
  } else {
    const ua = navigator.userAgent;
    if (ua.includes("Macintosh")) {
      return "mac";
    }
    if (ua.includes("Linux")) {
      return "linux";
    }
    return "windows";
  }
}
class FixtureLogService extends NullLogService {
  warn(message, ...args) {
    console.warn(message, ...args);
  }
  error(message, ...args) {
    console.error(message, ...args);
  }
  critical(message, ...args) {
    console.error(message, ...args);
  }
}
class FixtureModelService extends ModelService {
  dispose() {
    for (const model of this.getModels()) {
      if (!model.isDisposed()) {
        model.dispose();
      }
    }
    super.dispose();
  }
}
let FixtureTextModelService = class extends mock() {
  constructor(_modelService) {
    super();
    this._modelService = _modelService;
  }
  async createModelReference(resource) {
    const model = this._modelService.getModel(resource);
    if (!model) {
      throw new Error(`FixtureTextModelService: no model registered for ${resource.toString()}`);
    }
    return {
      // eslint-disable-next-line local/code-no-dangerous-type-assertions
      object: { textEditorModel: model },
      dispose() {
      }
    };
  }
  registerTextModelContentProvider() {
    return { dispose() {
    } };
  }
  canHandleResource() {
    return false;
  }
};
FixtureTextModelService = __decorateClass([
  __decorateParam(0, IModelService)
], FixtureTextModelService);
function createEditorServices(disposables, options) {
  const services = new ServiceCollection();
  const serviceIdentifiers = [];
  const define = (id, ctor) => {
    if (!services.has(id)) {
      services.set(id, new SyncDescriptor(ctor));
    }
    serviceIdentifiers.push(id);
  };
  const defineInstance = (id, instance) => {
    if (!services.has(id)) {
      services.set(id, instance);
    }
    serviceIdentifiers.push(id);
  };
  const definePartialInstance = (id, instance) => {
    defineInstance(id, instance);
  };
  define(IAccessibilityService, TestAccessibilityService);
  define(IKeybindingService, MockKeybindingService);
  define(IClipboardService, TestClipboardService);
  define(IEditorWorkerService, TestEditorWorkerService);
  defineInstance(IOpenerService, NullOpenerService);
  define(INotificationService, TestNotificationService);
  define(IDialogService, TestDialogService);
  define(IUndoRedoService, UndoRedoService);
  define(ILanguageService, LanguageService);
  define(ILanguageConfigurationService, TestLanguageConfigurationService);
  define(IConfigurationService, TestConfigurationService);
  define(ITextResourcePropertiesService, TestTextResourcePropertiesService);
  defineInstance(IStorageService, new NullStorageService());
  if (options?.colorTheme) {
    defineInstance(IThemeService, new TestThemeService(options.colorTheme));
  } else {
    define(IThemeService, TestThemeService);
  }
  define(ILogService, FixtureLogService);
  define(IModelService, FixtureModelService);
  define(ICodeEditorService, TestCodeEditorService);
  define(IContextKeyService, MockContextKeyService);
  define(ICommandService, TestCommandService);
  define(ITelemetryService, NullTelemetryServiceShape);
  define(ILoggerService, NullLoggerService);
  define(IDataChannelService, NullDataChannelService);
  define(IEnvironmentService, class extends mock() {
    constructor() {
      super(...arguments);
      this.isBuilt = true;
      this.isExtensionDevelopment = false;
    }
  });
  define(ILanguageFeatureDebounceService, LanguageFeatureDebounceService);
  define(ILanguageFeaturesService, LanguageFeaturesService);
  define(ITreeSitterLibraryService, TestTreeSitterLibraryService);
  define(IInlineCompletionsService, InlineCompletionsService);
  defineInstance(ICodeLensCache, {
    _serviceBrand: void 0,
    put: () => {
    },
    get: () => void 0,
    delete: () => {
    }
  });
  defineInstance(IHoverService, {
    _serviceBrand: void 0,
    showDelayedHover: () => void 0,
    setupDelayedHover: () => ({ dispose: () => {
    } }),
    setupDelayedHoverAtMouse: () => ({ dispose: () => {
    } }),
    showInstantHover: () => void 0,
    hideHover: () => {
    },
    showAndFocusLastHover: () => {
    },
    setupManagedHover: () => ({ dispose: () => {
    }, show: () => {
    }, hide: () => {
    }, update: () => {
    } }),
    showManagedHover: () => {
    }
  });
  defineInstance(IDefaultAccountService, {
    _serviceBrand: void 0,
    onDidChangeDefaultAccount: new Emitter().event,
    onDidChangePolicyData: new Emitter().event,
    policyData: null,
    currentDefaultAccount: null,
    copilotTokenInfo: null,
    onDidChangeCopilotTokenInfo: new Emitter().event,
    managedSettingsFetchStatus: null,
    managedSettingsFetchedAt: null,
    managedSettingsRawResponse: null,
    getDefaultAccount: async () => null,
    getDefaultAccountAuthenticationProvider: () => ({ id: "test", name: "Test", scopes: [], enterprise: false }),
    resolveGitHubUrl: (path) => `https://github.com/${path}`,
    setDefaultAccountProvider: () => {
    },
    refresh: async () => null,
    signIn: async () => null,
    signOut: async () => {
    }
  });
  defineInstance(IUserInteractionService, new MockUserInteractionService(true, false));
  definePartialInstance(IActionWidgetService, {
    _serviceBrand: void 0,
    show: () => {
    },
    hide: () => {
    },
    get isVisible() {
      return false;
    }
  });
  defineInstance(IAccessibilitySignalService, {
    _serviceBrand: void 0,
    playSignal: async () => {
    },
    playSignals: async () => {
    },
    playSignalLoop: () => ({ dispose: () => {
    } }),
    getEnabledState: () => ({ value: false, onDidChange: Event.None, onChange: () => ({ dispose: () => {
    } }) }),
    getDelayMs: () => 0,
    playSound: async () => {
    },
    isSoundEnabled: () => false,
    isAnnouncementEnabled: () => false,
    onSoundEnabledChanged: () => Event.None
  });
  define(ITextModelService, FixtureTextModelService);
  defineInstance(IAgentFeedbackService, {
    _serviceBrand: void 0,
    onDidChangeFeedback: Event.None,
    onDidChangeNavigation: Event.None,
    onDidChangeFeedbackScope: Event.None,
    activeFeedbackSessionResource: constObservable(AGENT_FEEDBACK_NEW_SESSION_RESOURCE),
    onDidAddFeedback: Event.None,
    onDidConvertFeedback: Event.None,
    onDidAddReply: Event.None,
    onDidSubmitFeedback: Event.None,
    onDidRevealSessionComment: Event.None,
    addFeedback: () => void 0,
    removeFeedback: () => {
    },
    updateFeedback: () => {
    },
    acceptFeedback: () => {
    },
    addReply: () => {
    },
    getFeedback: () => [],
    hasLoadedFeedback: () => true,
    getSessionForFile: () => void 0,
    getFeedbackSessionResource: () => void 0,
    registerFeedbackResourceScope: () => toDisposable(() => {
    }),
    getMostRecentSessionForResource: () => void 0,
    revealFeedback: async () => {
    },
    revealSessionComment: async () => {
    },
    getNextFeedback: () => void 0,
    getNextNavigableItem: () => void 0,
    setNavigationAnchor: () => {
    },
    getNavigationBearing: () => ({ activeIdx: -1, totalCount: 0 }),
    clearFeedback: () => {
    },
    markFeedbackSubmitted: () => {
    },
    submitFeedback: async () => false,
    addFeedbackAndSubmit: async () => {
    },
    setFeedbackResolved: async () => {
    }
  });
  definePartialInstance(IChatEditingService, {
    _serviceBrand: void 0,
    editingSessionsObs: constObservable([]),
    startOrContinueGlobalEditingSession: () => void 0,
    getEditingSession: () => void 0
  });
  definePartialInstance(ISessionsManagementService, {
    _serviceBrand: void 0,
    getSession: () => void 0,
    getSessions: () => []
  });
  definePartialInstance(ISessionsService, {
    _serviceBrand: void 0,
    activeSession: constObservable(void 0)
  });
  definePartialInstance(ICodeReviewService, {
    _serviceBrand: void 0,
    getPRReviewState: () => constObservable({ kind: PRReviewStateKind.None }),
    resolvePRReviewThread: async () => {
    },
    markPRReviewCommentConverted: () => {
    }
  });
  options?.additionalServices?.({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    define: (id, ctor) => {
      services.set(id, new SyncDescriptor(ctor));
      serviceIdentifiers.push(id);
    },
    defineInstance: (id, instance) => {
      services.set(id, instance);
      serviceIdentifiers.push(id);
    },
    definePartialInstance: (id, instance) => {
      services.set(id, instance);
      serviceIdentifiers.push(id);
    }
  });
  const instantiationService = disposables.add(new TestInstantiationService(services, true, void 0, true));
  disposables.add(toDisposable(() => {
    for (const id of serviceIdentifiers) {
      const instanceOrDescriptor = services.get(id);
      if (typeof instanceOrDescriptor?.dispose === "function") {
        instanceOrDescriptor.dispose();
      }
    }
  }));
  return instantiationService;
}
function registerWorkbenchServices(registration) {
  registration.defineInstance(IContextMenuService, {
    showContextMenu: () => {
    },
    onDidShowContextMenu: () => ({ dispose: () => {
    } }),
    onDidHideContextMenu: () => ({ dispose: () => {
    } }),
    _serviceBrand: void 0
  });
  registration.defineInstance(IContextViewService, {
    showContextView: () => ({ close: () => {
    } }),
    hideContextView: () => {
    },
    getContextViewElement: () => {
      throw new Error("Not implemented");
    },
    layout: () => {
    },
    anchorAlignment: 0,
    _serviceBrand: void 0
  });
  registration.defineInstance(ILabelService, {
    getUriLabel: (uri) => uri.path,
    getUriBasenameLabel: (uri) => uri.path.split("/").pop() ?? "",
    getWorkspaceLabel: () => "",
    getHostLabel: () => "",
    getSeparator: () => "/",
    registerFormatter: () => ({ dispose: () => {
    } }),
    onDidChangeFormatters: () => ({ dispose: () => {
    } }),
    registerCachedFormatter: () => ({ dispose: () => {
    } }),
    _serviceBrand: void 0,
    getHostTooltip: () => ""
  });
  registration.define(IMenuService, TestMenuService);
  registration.define(IActionViewItemService, NullActionViewItemService);
  registration.defineInstance(IChatPhoneInputPresenter, {
    _serviceBrand: void 0,
    enabled: constObservable(false),
    showCombinedModeAndModelSheet: () => Promise.resolve(),
    setImpl: () => ({ dispose: () => {
    } })
  });
  registration.defineInstance(IWorkspaceTrustManagementService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeTrust = Event.None;
      this.workspaceTrustInitialized = Promise.resolve();
    }
    isWorkspaceTrusted() {
      return true;
    }
  }());
  registration.defineInstance(IWorkspaceTrustRequestService, new class extends mock() {
    async requestWorkspaceTrust() {
      return true;
    }
  }());
}
function createTextModel(instantiationService, text, uri, languageId) {
  const modelService = instantiationService.get(IModelService);
  const languageService = instantiationService.get(ILanguageService);
  const languageSelection = languageId ? languageService.createById(languageId) : null;
  return modelService.createModel(text, languageSelection, uri);
}
function resolveLabels(labels) {
  const result = [];
  if (labels?.kind === "screenshot") {
    result.push(".screenshot");
  } else if (labels?.kind === "animated") {
    result.push("animated");
  }
  if (labels?.blocksCi) {
    result.push("blocks-ci");
  }
  if (labels?.flaky) {
    result.push("flaky");
  }
  return result;
}
class DisposableStackStore {
  constructor() {
    this._items = [];
    this._isDisposed = false;
  }
  add(item) {
    if (this._isDisposed) {
      item.dispose();
      console.warn("Adding to a disposed DisposableStackStore");
    } else {
      this._items.push(item);
    }
    return item;
  }
  dispose() {
    this._isDisposed = true;
    while (this._items.length > 0) {
      this._items.pop().dispose();
    }
  }
}
const realTimeApi = captureGlobalTimeApi();
const logOutsideTime = false;
if (logOutsideTime) {
  const loggingTimeApi = createLoggingTimeApi(realTimeApi, (name, stack, handler) => {
    const handlerStr = typeof handler === "function" ? handler.toString().slice(0, 500) : String(handler);
    console.warn(`[ComponentFixture] Real ${name} called outside of virtual time.
Handler: ${handlerStr}
Stack: ${stack}`);
  });
  pushGlobalTimeApi(loggingTimeApi);
}
let fixtureRenderCounter = 0;
function defineComponentFixture(options) {
  const createFixture = (themeVariant) => defineFixture({
    isolation: "none",
    displayMode: { type: "component" },
    background: themeVariant.background,
    render: async (container, context) => {
      const disposableStore = new DisposableStore();
      const input = parseFixtureInput(context.input);
      const { label: themeLabel, theme, scopeThemingParticipants } = themeVariant;
      disposableStore.add(pushRandomOverwrite(42));
      const virtualTimeEnabled = (options.virtualTime?.enabled ?? true) && context.host.kind !== "explorer-ui";
      const leakDetectionEnabled = context.host.kind !== "explorer-ui";
      if (leakDetectionEnabled) {
        ModifierKeyEmitter.getInstance();
      }
      const tracker = leakDetectionEnabled ? new DisposableTracker() : void 0;
      if (tracker) {
        setDisposableTracker(tracker);
      }
      const clock = new VirtualClock((/* @__PURE__ */ new Date("2026-05-14T12:00:00Z")).getTime());
      const p = new VirtualTimeProcessor(
        clock,
        drainMicrotasksEmbedding(realTimeApi),
        realTimeApi,
        { defaultMaxEvents: 100 }
      );
      const virtualTimeApi = createVirtualTimeApi(clock, { fakeRequestAnimationFrame: true });
      const teardownDrainMs = options.virtualTime?.teardownDrainMs ?? 1100;
      context.addDisposable({
        dispose: async () => {
          let teardownTimeApi;
          if (virtualTimeEnabled) {
            teardownTimeApi = pushGlobalTimeApi(virtualTimeApi);
          }
          try {
            disposableStore.dispose();
          } catch (e) {
            console.error(`[ComponentFixture] error disposing fixture: ${e instanceof Error ? e.stack : e}`);
          }
          if (virtualTimeEnabled) {
            try {
              await p.run({
                until: untilTime(clock.now + teardownDrainMs),
                maxEvents: 1e3,
                maxTraceDepth: 5
              });
            } catch (e) {
              console.error(`[ComponentFixture] error draining virtual time during teardown: ${e instanceof Error ? e.stack : e}`);
            }
          }
          teardownTimeApi?.dispose();
          p.dispose();
          if (tracker) {
            setDisposableTracker(null);
            const result = tracker.computeLeakingDisposables();
            if (result) {
              throw new Error(`There are ${result.leaks.length} undisposed disposables!${result.details}`);
            }
          }
        }
      });
      async function actualRender() {
        await setupTheme(container, theme, scopeThemingParticipants);
        if (input.reverseStylesheets !== false) {
          disposableStore.add(overrideStylesheetOrder(input.reverseStylesheets));
        }
        let renderTimeApi;
        if (virtualTimeEnabled) {
          renderTimeApi = pushGlobalTimeApi(virtualTimeApi);
          disposableStore.add(installFakeRunWhenIdle((_targetWindow, callback, _timeout) => {
            const stackTrace = new Error().stack;
            const trace = TraceContext.instance.currentTrace().child("runWhenIdle", stackTrace);
            return clock.schedule({
              time: clock.now,
              run: () => {
                const deadline = {
                  didTimeout: true,
                  timeRemaining: () => 50
                };
                callback(deadline);
              },
              source: {
                toString() {
                  return "runWhenIdle";
                },
                stackTrace
              },
              trace
            });
          }));
        }
        try {
          const disposableStackStore = disposableStore.add(new DisposableStackStore());
          const result = options.render({ container, disposableStore, disposableStackStore, theme });
          const p2 = virtualTimeEnabled ? p.run({
            until: untilTime(clock.now + (options.virtualTime?.durationMs ?? 1e3)),
            maxEvents: 200,
            maxTraceDepth: 5
          }) : Promise.resolve();
          await Promise.all([
            result instanceof Promise ? result : Promise.resolve(),
            p2
          ]);
        } catch (e) {
          if (virtualTimeEnabled && p.history.length > 0) {
            const startTime = p.history[0].time;
            const history = buildHistoryFromTasks(p.history, startTime);
            console.error(`[ComponentFixture] ${themeLabel} virtual-time history (${p.history.length} tasks):
${renderSwimlanes(history)}`);
          }
          throw e;
        } finally {
          renderTimeApi?.dispose();
        }
      }
      const fixtureRoot = createTraceRoot(`render#${++fixtureRenderCounter}(${themeLabel})`);
      await TraceContext.instance.runAsHandler(fixtureRoot, actualRender, {
        // Trace-reset escapes virtual time so it actually fires.
        afterMicrotaskClosure: (cb) => nextMacrotask(realTimeApi, cb)
      });
      if (input.outputTimeTrace && virtualTimeEnabled && p.history.length > 0) {
        const startTime = p.history[0].time;
        const history = buildHistoryFromTasks(p.history, startTime);
        return { output: renderSwimlanes(history) };
      }
      if (input.outputStylesheetFiles) {
        return { output: { stylesheetFiles: await getStylesheetDocumentFiles() } };
      }
      return void 0;
    }
  });
  const labels = resolveLabels(options.labels);
  const additionalFixtures = Object.fromEntries((options.additionalThemes ?? []).map((additionalTheme) => {
    const themeVariant = additionalThemeVariants[additionalTheme];
    return [themeVariant.label, createFixture(themeVariant)];
  }));
  return defineFixtureVariants(labels.length > 0 ? { labels } : {}, {
    Dark: createFixture(darkThemeVariant),
    Light: createFixture(lightThemeVariant),
    ...additionalFixtures
  });
}
function defineThemedFixtureGroup(optionsOrFixtures, fixtures) {
  if (fixtures) {
    const options = optionsOrFixtures;
    return defineFixtureGroup({
      labels: resolveLabels(options.labels),
      path: options.path
    }, fixtures);
  }
  return defineFixtureGroup(optionsOrFixtures);
}
export {
  DisposableStackStore,
  FixtureLogService,
  FixtureModelService,
  FixtureTextModelService,
  createEditorServices,
  createTextModel,
  darkTheme,
  defineComponentFixture,
  defineThemedFixtureGroup,
  lightTheme,
  registerWorkbenchServices,
  setupTheme
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZml4dHVyZVV0aWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLy8gVGhpcyBzaG91bGQgYmUgdGhlIG9ubHkgcGxhY2UgdGhhdCBpcyBhbGxvd2VkIHRvIGltcG9ydCBmcm9tIEB2c2NvZGUvY29tcG9uZW50LWV4cGxvcmVyXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IGRlZmluZUZpeHR1cmUsIGRlZmluZUZpeHR1cmVHcm91cCwgZGVmaW5lRml4dHVyZVZhcmlhbnRzIH0gZnJvbSAnQHZzY29kZS9jb21wb25lbnQtZXhwbG9yZXInO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlVHJhY2tlciwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UsIHNldERpc3Bvc2FibGVUcmFja2VyLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1vZGlmaWVyS2V5RW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uLy4uL2J1aWxkL3ZpdGUvc3R5bGUuY3NzJztcbmltcG9ydCAnLi4vLi4vLi4vYnJvd3Nlci9tZWRpYS9zdHlsZS5jc3MnO1xuLy8gSW1wb3J0IGF1eGlsaWFyeUJhclBhcnQuY3NzIGhlcmUgKGJlZm9yZSBhbnkgY29udHJpYi9jaGF0IENTUykgc28gdGhlIGNhc2NhZGVcbi8vIG1hdGNoZXMgdGhlIHByb2R1Y3Q6IGNoYXQuY3NzIGxvYWRzIGxhdGVyIGFuZCBvdmVycmlkZXMgdGhlIGF1eGlsaWFyeWJhclxuLy8gcnVsZXMgd2hlcmUgYXBwbGljYWJsZS4gRml4dHVyZXMgdGhhdCB3cmFwIGNvbnRlbnQgaW4gYC5wYXJ0LmF1eGlsaWFyeWJhcmBcbi8vIHJlbHkgb24gdGhlc2UgcnVsZXMgdG8gcmVjb2xvciBpbmxpbmUgZWRpdG9ycyB3aXRoIGAtLXZzY29kZS1zaWRlQmFyLWJhY2tncm91bmRgLlxuaW1wb3J0ICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2F1eGlsaWFyeWJhci9tZWRpYS9hdXhpbGlhcnlCYXJQYXJ0LmNzcyc7XG5cbi8vIFRoZW1lXG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25SZXNvdXJjZUxvYWRlci9jb21tb24vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIuanMnO1xuaW1wb3J0IHsgVGhlbWVUeXBlU2VsZWN0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbG9yVGhlbWVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi9jb2xvclRoZW1lRGF0YS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlR2xvYmFsU3R5bGVzSW5zdGFsbGVkLCBnZXRTdHlsZXNoZWV0RG9jdW1lbnRGaWxlcywgb3ZlcnJpZGVTdHlsZXNoZWV0T3JkZXIsIFJldmVyc2VTdHlsZXNoZWV0c09wdGlvbiB9IGZyb20gJy4vZml4dHVyZVV0aWxzQ3NzLmpzJztcblxuLy8gSW5zdGFudGlhdGlvblxuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5cbi8vIFRlc3Qgc2VydmljZSBpbXBsZW1lbnRhdGlvbnNcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLCBJbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9pbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLCBMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZURlYm91bmNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVTaXR0ZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlTGVuc0NhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZWxlbnMvYnJvd3Nlci9jb2RlTGVuc0NhY2hlLmpzJztcbmltcG9ydCB7IFRlc3RDb2RlRWRpdG9yU2VydmljZSwgVGVzdENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci9lZGl0b3JUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vbW9kZXMvdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vc2VydmljZXMvdGVzdEVkaXRvcldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFRleHRSZXNvdXJjZVByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3NlcnZpY2VzL3Rlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3NlcnZpY2VzL3Rlc3RUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXN0QWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L3Rlc3QvY29tbW9uL3Rlc3RBY2Nlc3NpYmlsaXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLCBOdWxsQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBob25lSW5wdXRQcmVzZW50ZXIgfSBmcm9tICcuLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdFBob25lSW5wdXRQcmVzZW50ZXIuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC90ZXN0L2NvbW1vbi90ZXN0Q2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UsIElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSURhdGFDaGFubmVsU2VydmljZSwgTnVsbERhdGFDaGFubmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RhdGFDaGFubmVsL2NvbW1vbi9kYXRhQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBUZXN0RGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvdGVzdC9jb21tb24vdGVzdERpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UsIE1vY2tLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ2dlclNlcnZpY2UsIElMb2dTZXJ2aWNlLCBOdWxsTG9nZ2VyU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL3Rlc3QvY29tbW9uL3Rlc3ROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgTnVsbE9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvdGVzdC9jb21tb24vbnVsbE9wZW5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQsIElBcHBsaWNhdGlvblN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50LCBJUHJvZmlsZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50LCBJU3RvcmFnZUVudHJ5LCBJU3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlVGFyZ2V0Q2hhbmdlRXZlbnQsIElTdG9yYWdlVmFsdWVDaGFuZ2VFdmVudCwgSVdpbGxTYXZlU3RhdGVFdmVudCwgSVdvcmtzcGFjZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50LCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQsIFdpbGxTYXZlU3RhdGVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2VTaGFwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBVbmRvUmVkb1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91bmRvUmVkby9jb21tb24vdW5kb1JlZG9TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckludGVyYWN0aW9uU2VydmljZSwgTW9ja1VzZXJJbnRlcmFjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VySW50ZXJhY3Rpb24vYnJvd3Nlci91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVGVzdE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSwgSUFnZW50RmVlZGJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJQ29kZVJldmlld1NlcnZpY2UsIFBSUmV2aWV3U3RhdGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9jb2RlUmV2aWV3L2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5cbi8vIEVkaXRvclxuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuXG5pbXBvcnQgJy4vZml4dHVyZXMuY3NzJztcblxuLy8gSW1wb3J0IGNvbG9yIHJlZ2lzdHJhdGlvbnMgdG8gZW5zdXJlIGNvbG9ycyBhcmUgYXZhaWxhYmxlXG5pbXBvcnQgeyBJZGxlRGVhZGxpbmUsIGluc3RhbGxGYWtlUnVuV2hlbklkbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBidWlsZEhpc3RvcnlGcm9tVGFza3MsIHJlbmRlclN3aW1sYW5lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vZXhlY3V0aW9uR3JhcGguanMnO1xuaW1wb3J0IHsgcHVzaFJhbmRvbU92ZXJ3cml0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vcmFuZG9tT3ZlcndyaXRlLmpzJztcbmltcG9ydCB7XG5cdGNhcHR1cmVHbG9iYWxUaW1lQXBpLFxuXHRjcmVhdGVMb2dnaW5nVGltZUFwaSxcblx0Y3JlYXRlVHJhY2VSb290LFxuXHRjcmVhdGVWaXJ0dWFsVGltZUFwaSxcblx0ZHJhaW5NaWNyb3Rhc2tzRW1iZWRkaW5nLFxuXHRuZXh0TWFjcm90YXNrLFxuXHRwdXNoR2xvYmFsVGltZUFwaSxcblx0VHJhY2VDb250ZXh0LFxuXHR1bnRpbFRpbWUsXG5cdFZpcnR1YWxDbG9jayxcblx0VmlydHVhbFRpbWVQcm9jZXNzb3IsXG59IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdmlydHVhbFNjaGVkdWxpbmcvaW5kZXguanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2Jhc2VDb2xvcnMuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2VkaXRvckNvbG9ycy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvbGlzdENvbG9ycy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvbWlzY0NvbG9ycy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHNvdXJjZU1hcFN1cHBvcnQgZnJvbSAnc291cmNlLW1hcC1zdXBwb3J0JztcbnNvdXJjZU1hcFN1cHBvcnQuaW5zdGFsbCh7XG5cdGVudmlyb25tZW50OiAnYnJvd3NlcicsXG5cdGhhbmRsZVVuY2F1Z2h0RXhjZXB0aW9uczogZmFsc2UsXG5cdHJldHJpZXZlU291cmNlTWFwOiAoc291cmNlOiBzdHJpbmcpID0+IHtcblx0XHRjb25zdCBtYXBVcmwgPSBzb3VyY2UgKyAnLm1hcCc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdFx0eGhyLm9wZW4oJ0dFVCcsIG1hcFVybCwgZmFsc2UpO1xuXHRcdFx0eGhyLnNlbmQoKTtcblx0XHRcdGlmICh4aHIuc3RhdHVzID09PSAyMDApIHtcblx0XHRcdFx0cmV0dXJuIHsgdXJsOiBudWxsIGFzIG5ldmVyLCBtYXA6IHhoci5yZXNwb25zZVRleHQgfTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHsgfVxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxufSk7XG5cbi8qKlxuICogQSBzdG9yYWdlIHNlcnZpY2UgdGhhdCBuZXZlciBzdG9yZXMgYW55dGhpbmcgYW5kIGFsd2F5cyByZXR1cm5zIHRoZSBkZWZhdWx0L2ZhbGxiYWNrIHZhbHVlLlxuICogVGhpcyBpcyB1c2VmdWwgZm9yIGZpeHR1cmVzIHdoZXJlIHdlIHdhbnQgY29uc2lzdGVudCBiZWhhdmlvciB3aXRob3V0IHBlcnNpc3RlZCBzdGF0ZS5cbiAqL1xuY2xhc3MgTnVsbFN0b3JhZ2VTZXJ2aWNlIGltcGxlbWVudHMgSVN0b3JhZ2VTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZhbHVlID0gbmV3IEVtaXR0ZXI8SVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50PigpO1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SVdvcmtzcGFjZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLlBST0ZJTEUsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJUHJvZmlsZVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50Pjtcblx0b25EaWRDaGFuZ2VWYWx1ZShzY29wZTogU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SUFwcGxpY2F0aW9uU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT05fU0hBUkVELCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlKTogRXZlbnQ8SUFwcGxpY2F0aW9uU2hhcmVkU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+O1xuXHRvbkRpZENoYW5nZVZhbHVlKHNjb3BlOiBTdG9yYWdlU2NvcGUsIGtleTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQ+IHtcblx0XHRyZXR1cm4gRXZlbnQuZmlsdGVyKHRoaXMuX29uRGlkQ2hhbmdlVmFsdWUuZXZlbnQsIGUgPT4gZS5zY29wZSA9PT0gc2NvcGUgJiYgKGtleSA9PT0gdW5kZWZpbmVkIHx8IGUua2V5ID09PSBrZXkpLCBkaXNwb3NhYmxlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVGFyZ2V0ID0gbmV3IEVtaXR0ZXI8SVN0b3JhZ2VUYXJnZXRDaGFuZ2VFdmVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUYXJnZXQ6IEV2ZW50PElTdG9yYWdlVGFyZ2V0Q2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VUYXJnZXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsU2F2ZVN0YXRlID0gbmV3IEVtaXR0ZXI8SVdpbGxTYXZlU3RhdGVFdmVudD4oKTtcblx0cmVhZG9ubHkgb25XaWxsU2F2ZVN0YXRlOiBFdmVudDxJV2lsbFNhdmVTdGF0ZUV2ZW50PiA9IHRoaXMuX29uV2lsbFNhdmVTdGF0ZS5ldmVudDtcblxuXHRnZXQoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IHN0cmluZyk6IHN0cmluZztcblx0Z2V0KGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQoX2tleTogc3RyaW5nLCBfc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdH1cblxuXHRnZXRCb29sZWFuKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlOiBib29sZWFuKTogYm9vbGVhbjtcblx0Z2V0Qm9vbGVhbihrZXk6IHN0cmluZywgc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IGJvb2xlYW4pOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRnZXRCb29sZWFuKF9rZXk6IHN0cmluZywgX3Njb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBib29sZWFuKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdH1cblxuXHRnZXROdW1iZXIoa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IG51bWJlcik6IG51bWJlcjtcblx0Z2V0TnVtYmVyKGtleTogc3RyaW5nLCBzY29wZTogU3RvcmFnZVNjb3BlLCBmYWxsYmFja1ZhbHVlPzogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRnZXROdW1iZXIoX2tleTogc3RyaW5nLCBfc2NvcGU6IFN0b3JhZ2VTY29wZSwgZmFsbGJhY2tWYWx1ZT86IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdH1cblxuXHRnZXRPYmplY3Q8VCBleHRlbmRzIG9iamVjdD4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU6IFQpOiBUO1xuXHRnZXRPYmplY3Q8VCBleHRlbmRzIG9iamVjdD4oa2V5OiBzdHJpbmcsIHNjb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBUKTogVCB8IHVuZGVmaW5lZDtcblx0Z2V0T2JqZWN0PFQgZXh0ZW5kcyBvYmplY3Q+KF9rZXk6IHN0cmluZywgX3Njb3BlOiBTdG9yYWdlU2NvcGUsIGZhbGxiYWNrVmFsdWU/OiBUKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGZhbGxiYWNrVmFsdWU7XG5cdH1cblxuXHRzdG9yZShfa2V5OiBzdHJpbmcsIF92YWx1ZTogc3RyaW5nIHwgYm9vbGVhbiB8IG51bWJlciB8IHVuZGVmaW5lZCB8IG51bGwsIF9zY29wZTogU3RvcmFnZVNjb3BlLCBfdGFyZ2V0OiBTdG9yYWdlVGFyZ2V0KTogdm9pZCB7XG5cdFx0Ly8gbm8tb3Bcblx0fVxuXG5cdHN0b3JlQWxsKF9lbnRyaWVzOiBJU3RvcmFnZUVudHJ5W10sIF9leHRlcm5hbDogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIG5vLW9wXG5cdH1cblxuXHRyZW1vdmUoX2tleTogc3RyaW5nLCBfc2NvcGU6IFN0b3JhZ2VTY29wZSk6IHZvaWQge1xuXHRcdC8vIG5vLW9wXG5cdH1cblxuXHRpc05ldyhfc2NvcGU6IFN0b3JhZ2VTY29wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Zmx1c2goX3JlYXNvbj86IFdpbGxTYXZlU3RhdGVSZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRvcHRpbWl6ZShfc2NvcGU6IFN0b3JhZ2VTY29wZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdGxvZygpOiB2b2lkIHtcblx0XHQvLyBuby1vcFxuXHR9XG5cblx0a2V5cyhfc2NvcGU6IFN0b3JhZ2VTY29wZSwgX3RhcmdldDogU3RvcmFnZVRhcmdldCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRzd2l0Y2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0aGFzU2NvcGUoX3Njb3BlOiBJQW55V29ya3NwYWNlSWRlbnRpZmllciB8IElVc2VyRGF0YVByb2ZpbGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUaGVtZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gRWFnZXJseSBidW5kbGUgYWxsIGJ1aWx0LWluIHRoZW1lIEpTT04gZmlsZXMgc28gdGhleSBjYW4gYmUgc2VydmVkIHRvXG4vLyBgX2xvYWRDb2xvclRoZW1lYCB2aWEgdGhlIElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgY29kZSBwYXRoLiBUaGVcbi8vIHJzcGFjayBjb25maWcgbWFwcyB0aGVzZSBKU09OIGZpbGVzIHRvIGBhc3NldC9zb3VyY2VgLCBzbyB0aGV5IGFyZSBpbXBvcnRlZFxuLy8gYXMgcmF3IHRleHQgKG5vdCBwYXJzZWQgSlNPTikgXHUyMDE0IHRoaXMgbGV0cyBWUyBDb2RlJ3MgSlNPTkMgcGFyc2VyIGhhbmRsZVxuLy8gY29tbWVudHMgYW5kIHRyYWlsaW5nIGNvbW1hcyB0aGUgd2F5IGl0IGRvZXMgaW4gdGhlIHJlYWwgcHJvZHVjdC5cbi8qIGVzbGludC1kaXNhYmxlIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zICovXG5pbXBvcnQgZGFya19tb2Rlcm4gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvZGFya19tb2Rlcm4uanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuaW1wb3J0IGRhcmtfcGx1cyBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9kYXJrX3BsdXMuanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuaW1wb3J0IGRhcmtfdnMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvZGFya192cy5qc29uJyB3aXRoIHsgdHlwZTogJ2pzb24nIH07XG5pbXBvcnQgaGNfYmxhY2sgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvaGNfYmxhY2suanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuaW1wb3J0IGxpZ2h0X21vZGVybiBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9saWdodF9tb2Rlcm4uanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuaW1wb3J0IGxpZ2h0X3BsdXMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvbGlnaHRfcGx1cy5qc29uJyB3aXRoIHsgdHlwZTogJ2pzb24nIH07XG5pbXBvcnQgbGlnaHRfdnMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvbGlnaHRfdnMuanNvbicgd2l0aCB7IHR5cGU6ICdqc29uJyB9O1xuLyogZXNsaW50LWVuYWJsZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJucyAqL1xuXG5jb25zdCB0aGVtZUpzb25Nb2R1bGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHQnL2V4dGVuc2lvbnMvdGhlbWUtZGVmYXVsdHMvdGhlbWVzL2RhcmtfbW9kZXJuLmpzb24nOiBkYXJrX21vZGVybiBhcyB1bmtub3duIGFzIHN0cmluZyxcblx0Jy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9kYXJrX3BsdXMuanNvbic6IGRhcmtfcGx1cyBhcyB1bmtub3duIGFzIHN0cmluZyxcblx0Jy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9kYXJrX3ZzLmpzb24nOiBkYXJrX3ZzIGFzIHVua25vd24gYXMgc3RyaW5nLFxuXHQnL2V4dGVuc2lvbnMvdGhlbWUtZGVmYXVsdHMvdGhlbWVzL2hjX2JsYWNrLmpzb24nOiBoY19ibGFjayBhcyB1bmtub3duIGFzIHN0cmluZyxcblx0Jy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9saWdodF9tb2Rlcm4uanNvbic6IGxpZ2h0X21vZGVybiBhcyB1bmtub3duIGFzIHN0cmluZyxcblx0Jy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9saWdodF9wbHVzLmpzb24nOiBsaWdodF9wbHVzIGFzIHVua25vd24gYXMgc3RyaW5nLFxuXHQnL2V4dGVuc2lvbnMvdGhlbWUtZGVmYXVsdHMvdGhlbWVzL2xpZ2h0X3ZzLmpzb24nOiBsaWdodF92cyBhcyB1bmtub3duIGFzIHN0cmluZyxcbn07XG5cbmNvbnN0IGZpeHR1cmVFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGFzeW5jIHJlYWRFeHRlbnNpb25SZXNvdXJjZSh1cmk6IFVSSSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29udGVudCA9IHRoZW1lSnNvbk1vZHVsZXNbdXJpLnBhdGhdO1xuXHRcdGlmIChjb250ZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgRml4dHVyZSBleHRlbnNpb24gcmVzb3VyY2Ugbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXHRzdXBwb3J0c0V4dGVuc2lvbkdhbGxlcnlSZXNvdXJjZXMoKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpOyB9XG5cdGlzRXh0ZW5zaW9uR2FsbGVyeVJlc291cmNlKCk6IFByb21pc2U8Ym9vbGVhbj4geyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTsgfVxuXHRnZXRFeHRlbnNpb25HYWxsZXJ5UmVzb3VyY2VVUkwoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpOyB9XG59O1xuXG5mdW5jdGlvbiBjcmVhdGVCdWlsdEluVGhlbWUodGhlbWVQYXRoOiBzdHJpbmcsIHVpVGhlbWU6IFRoZW1lVHlwZVNlbGVjdG9yKTogQ29sb3JUaGVtZURhdGEge1xuXHRjb25zdCBsb2NhdGlvbiA9IFVSSS5wYXJzZShgZmlsZTovLyR7dGhlbWVQYXRofWApO1xuXHRyZXR1cm4gQ29sb3JUaGVtZURhdGEuZnJvbUV4dGVuc2lvblRoZW1lKFxuXHRcdHsgaWQ6IHRoZW1lUGF0aCwgcGF0aDogdGhlbWVQYXRoLCB1aVRoZW1lLCBfd2F0Y2g6IGZhbHNlIH0sXG5cdFx0bG9jYXRpb24sXG5cdFx0RXh0ZW5zaW9uRGF0YS5mcm9tTmFtZSgndnNjb2RlJywgJ3RoZW1lLWRlZmF1bHRzJywgdHJ1ZSlcblx0KTtcbn1cblxuZXhwb3J0IGNvbnN0IGRhcmtUaGVtZSA9IGNyZWF0ZUJ1aWx0SW5UaGVtZSgnL2V4dGVuc2lvbnMvdGhlbWUtZGVmYXVsdHMvdGhlbWVzL2RhcmtfbW9kZXJuLmpzb24nLCBUaGVtZVR5cGVTZWxlY3Rvci5WU19EQVJLKTtcbmV4cG9ydCBjb25zdCBsaWdodFRoZW1lID0gY3JlYXRlQnVpbHRJblRoZW1lKCcvZXh0ZW5zaW9ucy90aGVtZS1kZWZhdWx0cy90aGVtZXMvbGlnaHRfbW9kZXJuLmpzb24nLCBUaGVtZVR5cGVTZWxlY3Rvci5WUyk7XG5jb25zdCBkYXJrSGlnaENvbnRyYXN0VGhlbWUgPSBjcmVhdGVCdWlsdEluVGhlbWUoJy9leHRlbnNpb25zL3RoZW1lLWRlZmF1bHRzL3RoZW1lcy9oY19ibGFjay5qc29uJywgVGhlbWVUeXBlU2VsZWN0b3IuSENfQkxBQ0spO1xuXG50eXBlIENvbXBvbmVudEZpeHR1cmVUaGVtZVZhcmlhbnQgPSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJhY2tncm91bmQ6ICdkYXJrJyB8ICdsaWdodCc7XG5cdHJlYWRvbmx5IHRoZW1lOiBDb2xvclRoZW1lRGF0YTtcblx0cmVhZG9ubHkgc2NvcGVUaGVtaW5nUGFydGljaXBhbnRzOiBib29sZWFuO1xufTtcbnR5cGUgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZVZhcmlhbnQgPSBDb21wb25lbnRGaXh0dXJlVGhlbWVWYXJpYW50ICYgeyByZWFkb25seSBzY29wZVRoZW1pbmdQYXJ0aWNpcGFudHM6IHRydWUgfTtcblxuY29uc3QgZGFya1RoZW1lVmFyaWFudCA9IHsgbGFiZWw6ICdEYXJrJywgYmFja2dyb3VuZDogJ2RhcmsnLCB0aGVtZTogZGFya1RoZW1lLCBzY29wZVRoZW1pbmdQYXJ0aWNpcGFudHM6IGZhbHNlIH0gYXMgY29uc3Qgc2F0aXNmaWVzIENvbXBvbmVudEZpeHR1cmVUaGVtZVZhcmlhbnQ7XG5jb25zdCBsaWdodFRoZW1lVmFyaWFudCA9IHsgbGFiZWw6ICdMaWdodCcsIGJhY2tncm91bmQ6ICdsaWdodCcsIHRoZW1lOiBsaWdodFRoZW1lLCBzY29wZVRoZW1pbmdQYXJ0aWNpcGFudHM6IGZhbHNlIH0gYXMgY29uc3Qgc2F0aXNmaWVzIENvbXBvbmVudEZpeHR1cmVUaGVtZVZhcmlhbnQ7XG5jb25zdCBhZGRpdGlvbmFsVGhlbWVWYXJpYW50cyA9IHtcblx0ZGFya0hpZ2hDb250cmFzdDogeyBsYWJlbDogJ0RhcmtIaWdoQ29udHJhc3QnLCBiYWNrZ3JvdW5kOiAnZGFyaycsIHRoZW1lOiBkYXJrSGlnaENvbnRyYXN0VGhlbWUsIHNjb3BlVGhlbWluZ1BhcnRpY2lwYW50czogdHJ1ZSB9LFxufSBhcyBjb25zdCBzYXRpc2ZpZXMgUmVjb3JkPHN0cmluZywgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZVZhcmlhbnQ+O1xuZXhwb3J0IHR5cGUgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZSA9IGtleW9mIHR5cGVvZiBhZGRpdGlvbmFsVGhlbWVWYXJpYW50cztcblxuY29uc3QgdGhlbWVMb2FkZWRQcm9taXNlcyA9IG5ldyBXZWFrTWFwPENvbG9yVGhlbWVEYXRhLCBQcm9taXNlPHZvaWQ+PigpO1xuZnVuY3Rpb24gZW5zdXJlVGhlbWVMb2FkZWQodGhlbWU6IENvbG9yVGhlbWVEYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cdGxldCB0aGVtZUxvYWRlZFByb21pc2UgPSB0aGVtZUxvYWRlZFByb21pc2VzLmdldCh0aGVtZSk7XG5cdGlmICghdGhlbWVMb2FkZWRQcm9taXNlKSB7XG5cdFx0dGhlbWVMb2FkZWRQcm9taXNlID0gdGhlbWUuZW5zdXJlTG9hZGVkKGZpeHR1cmVFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UpO1xuXHRcdHRoZW1lTG9hZGVkUHJvbWlzZXMuc2V0KHRoZW1lLCB0aGVtZUxvYWRlZFByb21pc2UpO1xuXHR9XG5cdHJldHVybiB0aGVtZUxvYWRlZFByb21pc2U7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzZXR1cFRoZW1lKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRoZW1lOiBDb2xvclRoZW1lRGF0YSwgc2NvcGVUaGVtaW5nUGFydGljaXBhbnRzID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0YXdhaXQgZW5zdXJlVGhlbWVMb2FkZWQodGhlbWUpO1xuXHRhd2FpdCBlbnN1cmVHbG9iYWxTdHlsZXNJbnN0YWxsZWQodGhlbWUsIHNjb3BlVGhlbWluZ1BhcnRpY2lwYW50cyk7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28td29ya2JlbmNoJywgZ2V0UGxhdGZvcm1DbGFzcygpLCAnZGlzYWJsZS1hbmltYXRpb25zJywgLi4udGhlbWUuY2xhc3NOYW1lcyk7XG59XG5cbi8qKlxuICogVGhlIHJlY29nbml6ZWQgZmllbGRzIG9mIHRoZSBwZXItcmVuZGVyIGBpbnB1dGAgKHBhc3NlZCB2aWEgdGhlIENMSSBgLS1pbnB1dGBcbiAqIGZsYWcpLCBwYXJzZWQgb25jZSBpbnRvIGEgdHlwZWQgc2hhcGUgYnkge0BsaW5rIHBhcnNlRml4dHVyZUlucHV0fS5cbiAqL1xuaW50ZXJmYWNlIEZpeHR1cmVSZW5kZXJJbnB1dCB7XG5cdC8qKiBTZWUge0BsaW5rIFJldmVyc2VTdHlsZXNoZWV0c09wdGlvbn07IGBmYWxzZWAgd2hlbiBubyByZXZlcnNhbCBpcyByZXF1ZXN0ZWQuICovXG5cdHJlYWRvbmx5IHJldmVyc2VTdHlsZXNoZWV0czogUmV2ZXJzZVN0eWxlc2hlZXRzT3B0aW9uO1xuXHQvKiogV2hldGhlciB0aGUgcmVuZGVyIHNob3VsZCByZXR1cm4gaXRzIHZpcnR1YWwtdGltZSB0cmFjZSBhcyBgb3V0cHV0YC4gKi9cblx0cmVhZG9ubHkgb3V0cHV0VGltZVRyYWNlOiBib29sZWFuO1xuXHQvKiogV2hldGhlciB0aGUgcmVuZGVyIHNob3VsZCByZXR1cm4gdGhlIGJ1bmRsZWQgc3R5bGVzaGVldCBmaWxlcyBhcyBgb3V0cHV0YC4gKi9cblx0cmVhZG9ubHkgb3V0cHV0U3R5bGVzaGVldEZpbGVzOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFBhcnNlcyB0aGUgdW50eXBlZCByZW5kZXIgYGlucHV0YCBpbnRvIHRoZSByZWNvZ25pemVkIHtAbGluayBGaXh0dXJlUmVuZGVySW5wdXR9XG4gKiBmaWVsZHMuIFVua25vd24vZXh0cmEgZmllbGRzIGFyZSBpZ25vcmVkOyBtaXNzaW5nIGZpZWxkcyBkZWZhdWx0IHRvIG9mZi5cbiAqL1xuZnVuY3Rpb24gcGFyc2VGaXh0dXJlSW5wdXQoaW5wdXQ6IHVua25vd24pOiBGaXh0dXJlUmVuZGVySW5wdXQge1xuXHRpZiAoIWlucHV0IHx8IHR5cGVvZiBpbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4geyByZXZlcnNlU3R5bGVzaGVldHM6IGZhbHNlLCBvdXRwdXRUaW1lVHJhY2U6IGZhbHNlLCBvdXRwdXRTdHlsZXNoZWV0RmlsZXM6IGZhbHNlIH07XG5cdH1cblx0Y29uc3QgcmVjb3JkID0gaW5wdXQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdHJldHVybiB7XG5cdFx0cmV2ZXJzZVN0eWxlc2hlZXRzOiBwYXJzZVJldmVyc2VPcHRpb24ocmVjb3JkLnJldmVyc2VTdHlsZXNoZWV0cyksXG5cdFx0b3V0cHV0VGltZVRyYWNlOiAhIXJlY29yZC5vdXRwdXRUaW1lVHJhY2UsXG5cdFx0b3V0cHV0U3R5bGVzaGVldEZpbGVzOiAhIXJlY29yZC5vdXRwdXRTdHlsZXNoZWV0RmlsZXMsXG5cdH07XG59XG5cbi8qKlxuICogVmFsaWRhdGVzIGEgYHJldmVyc2VTdHlsZXNoZWV0c2AgaW5wdXQgdmFsdWU6IGB0cnVlYCAocmV2ZXJzZSBhbGwgc3R5bGVzaGVldFxuICogZG9jdW1lbnRzKSwgYHsgZnJvbUluZGV4LCB0b0luZGV4IH1gIChyZXZlcnNlIG9ubHkgdGhhdCBpbmRleCB3aW5kb3csIHVzZWQgYnlcbiAqIHRoZSBvcmRlci1kZXBlbmRlbmN5IGJpc2VjdGlvbiksIG9yIGBmYWxzZWAgd2hlbiBhYnNlbnQvdW5yZWNvZ25pemVkLlxuICovXG5mdW5jdGlvbiBwYXJzZVJldmVyc2VPcHRpb24odmFsdWU6IHVua25vd24pOiBSZXZlcnNlU3R5bGVzaGVldHNPcHRpb24ge1xuXHRpZiAodmFsdWUgPT09IHRydWUpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdGNvbnN0IHJhbmdlID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0aWYgKHR5cGVvZiByYW5nZS5mcm9tSW5kZXggPT09ICdudW1iZXInICYmIHR5cGVvZiByYW5nZS50b0luZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHsgZnJvbUluZGV4OiByYW5nZS5mcm9tSW5kZXgsIHRvSW5kZXg6IHJhbmdlLnRvSW5kZXggfTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBnZXRQbGF0Zm9ybUNsYXNzKCk6IHN0cmluZyB7XG5cdGNvbnN0IGFsd2F5c1VzZU1hYyA9IHRydWU7XG5cdGlmIChhbHdheXNVc2VNYWMpIHtcblx0XHRyZXR1cm4gJ21hYyc7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgdWEgPSBuYXZpZ2F0b3IudXNlckFnZW50O1xuXHRcdGlmICh1YS5pbmNsdWRlcygnTWFjaW50b3NoJykpIHtcblx0XHRcdHJldHVybiAnbWFjJztcblx0XHR9XG5cdFx0aWYgKHVhLmluY2x1ZGVzKCdMaW51eCcpKSB7XG5cdFx0XHRyZXR1cm4gJ2xpbnV4Jztcblx0XHR9XG5cdFx0cmV0dXJuICd3aW5kb3dzJztcblx0fVxufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNlcnZpY2VzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VydmljZVJlZ2lzdHJhdGlvbiB7XG5cdGRlZmluZTxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGN0b3I6IG5ldyAoLi4uYXJnczogbmV2ZXJbXSkgPT4gVCk6IHZvaWQ7XG5cdGRlZmluZUluc3RhbmNlPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFQpOiB2b2lkO1xuXHQvKiogTGlrZSBkZWZpbmVJbnN0YW5jZSBidXQgYWNjZXB0cyBhIHBhcnRpYWwgbW9jayAtIHByb3ZpZGVzIHR5cGUgY2hlY2tpbmcgb24gcHJvdmlkZWQgcHJvcGVydGllcyAqL1xuXHRkZWZpbmVQYXJ0aWFsSW5zdGFuY2U8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBpbnN0YW5jZTogUGFydGlhbDxUPik6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ3JlYXRlU2VydmljZXNPcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSBjb2xvciB0aGVtZSB0byB1c2UgZm9yIHRoZSB0aGVtZSBzZXJ2aWNlLlxuXHQgKi9cblx0Y29sb3JUaGVtZT86IElDb2xvclRoZW1lO1xuXHQvKipcblx0ICogQWRkaXRpb25hbCBzZXJ2aWNlcyB0byByZWdpc3RlciBhZnRlciB0aGUgYmFzZSBlZGl0b3Igc2VydmljZXMuXG5cdCAqL1xuXHRhZGRpdGlvbmFsU2VydmljZXM/OiAocmVnaXN0cmF0aW9uOiBTZXJ2aWNlUmVnaXN0cmF0aW9uKSA9PiB2b2lkO1xufVxuXG4vKipcbiAqIGBJTG9nU2VydmljZWAgZm9yIGZpeHR1cmVzIHRoYXQgZm9yd2FyZHMgYHdhcm5gLCBgZXJyb3JgLCBhbmQgYGNyaXRpY2FsYFxuICogdG8gdGhlIGJyb3dzZXIgY29uc29sZSBzbyB0aGF0IGVycm9ycyBsb2dnZWQgZHVyaW5nIHJlbmRlciAoZS5nLiBmcm9tXG4gKiBgdHJ5L2NhdGNoYCBibG9ja3MgdGhhdCBzd2FsbG93IGVycm9ycyBpbnRvIHRoZSBsb2cpIGJlY29tZSB2aXNpYmxlIGluXG4gKiB0aGUgY29tcG9uZW50LWV4cGxvcmVyIGNvbnNvbGUgcGFuZWwuXG4gKi9cbmV4cG9ydCBjbGFzcyBGaXh0dXJlTG9nU2VydmljZSBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0b3ZlcnJpZGUgd2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnNvbGUud2FybihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXHRvdmVycmlkZSBlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc29sZS5lcnJvcihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxuXHRvdmVycmlkZSBjcml0aWNhbChtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc29sZS5lcnJvcihtZXNzYWdlLCAuLi5hcmdzKTtcblx0fVxufVxuXG4vKipcbiAqIGBNb2RlbFNlcnZpY2VgIGZvciBmaXh0dXJlcyB0aGF0IGRpc3Bvc2VzIGFsbCBvd25lZCB0ZXh0IG1vZGVscyB3aGVuIHRoZVxuICogc2VydmljZSBpdHNlbGYgaXMgZGlzcG9zZWQuIFRoaXMgaXMgc2FmZSBiZWNhdXNlIGBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2VgXG4gKiBpcyB0aGUgZmlyc3QgaXRlbSBhZGRlZCB0byB0aGUgZml4dHVyZSdzIGBEaXNwb3NhYmxlU3RvcmVgLCBzbyBpdCBkaXNwb3Nlc1xuICogbGFzdCAoTElGTykgXHUyMDE0IGFmdGVyIGFsbCB3aWRnZXRzIGhhdmUgYWxyZWFkeSB0b3JuIGRvd24uXG4gKi9cbmV4cG9ydCBjbGFzcyBGaXh0dXJlTW9kZWxTZXJ2aWNlIGV4dGVuZHMgTW9kZWxTZXJ2aWNlIHtcblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IG1vZGVsIG9mIHRoaXMuZ2V0TW9kZWxzKCkpIHtcblx0XHRcdGlmICghbW9kZWwuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogYElUZXh0TW9kZWxTZXJ2aWNlYCBmb3IgZml4dHVyZXMgdGhhdCByZXNvbHZlcyBVUklzIGFnYWluc3QgYElNb2RlbFNlcnZpY2VgLlxuICogTW9kZWxzIGNyZWF0ZWQgdmlhIGBjcmVhdGVUZXh0TW9kZWxgICh3aGljaCB1c2VzIGBJTW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsYClcbiAqIGFyZSBhdXRvbWF0aWNhbGx5IHJlc29sdmFibGUuIFVSSXMgd2l0aG91dCBhIGJhY2tpbmcgbW9kZWwgZmFpbCBsb3VkbHkgc29cbiAqIHRoYXQgY2FsbGVycyBkb24ndCBzaWxlbnRseSByZWNlaXZlIGEgbnVsbCBgdGV4dEVkaXRvck1vZGVsYC5cbiAqL1xuZXhwb3J0IGNsYXNzIEZpeHR1cmVUZXh0TW9kZWxTZXJ2aWNlIGV4dGVuZHMgbW9jazxJVGV4dE1vZGVsU2VydmljZT4oKSB7XG5cdGNvbnN0cnVjdG9yKEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGaXh0dXJlVGV4dE1vZGVsU2VydmljZTogbm8gbW9kZWwgcmVnaXN0ZXJlZCBmb3IgJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0b2JqZWN0OiB7IHRleHRFZGl0b3JNb2RlbDogbW9kZWwgfSBhcyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsXG5cdFx0XHRkaXNwb3NlKCkgeyB9LFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSByZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9O1xuXHR9XG5cblx0b3ZlcnJpZGUgY2FuSGFuZGxlUmVzb3VyY2UoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB3aXRoIGFsbCBzZXJ2aWNlcyBuZWVkZWQgZm9yIENvZGVFZGl0b3JXaWRnZXQuXG4gKiBBZGRpdGlvbmFsIHNlcnZpY2VzIGNhbiBiZSByZWdpc3RlcmVkIHZpYSB0aGUgb3B0aW9ucyBjYWxsYmFjay5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG9wdGlvbnM/OiBDcmVhdGVTZXJ2aWNlc09wdGlvbnMpOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uge1xuXHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbigpO1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRjb25zdCBzZXJ2aWNlSWRlbnRpZmllcnM6IFNlcnZpY2VJZGVudGlmaWVyPGFueT5bXSA9IFtdO1xuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdGNvbnN0IGRlZmluZSA9IDxUPihpZDogU2VydmljZUlkZW50aWZpZXI8VD4sIGN0b3I6IG5ldyAoLi4uYXJnczogYW55W10pID0+IFQpID0+IHtcblx0XHRpZiAoIXNlcnZpY2VzLmhhcyhpZCkpIHtcblx0XHRcdHNlcnZpY2VzLnNldChpZCwgbmV3IFN5bmNEZXNjcmlwdG9yKGN0b3IpKTtcblx0XHR9XG5cdFx0c2VydmljZUlkZW50aWZpZXJzLnB1c2goaWQpO1xuXHR9O1xuXG5cdGNvbnN0IGRlZmluZUluc3RhbmNlID0gPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFQpID0+IHtcblx0XHRpZiAoIXNlcnZpY2VzLmhhcyhpZCkpIHtcblx0XHRcdHNlcnZpY2VzLnNldChpZCwgaW5zdGFuY2UpO1xuXHRcdH1cblx0XHRzZXJ2aWNlSWRlbnRpZmllcnMucHVzaChpZCk7XG5cdH07XG5cblx0Y29uc3QgZGVmaW5lUGFydGlhbEluc3RhbmNlID0gPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFBhcnRpYWw8VD4pID0+IHtcblx0XHRkZWZpbmVJbnN0YW5jZShpZCwgaW5zdGFuY2UgYXMgVCk7XG5cdH07XG5cblx0Ly8gQmFzZSBlZGl0b3Igc2VydmljZXNcblx0ZGVmaW5lKElBY2Nlc3NpYmlsaXR5U2VydmljZSwgVGVzdEFjY2Vzc2liaWxpdHlTZXJ2aWNlKTtcblx0ZGVmaW5lKElLZXliaW5kaW5nU2VydmljZSwgTW9ja0tleWJpbmRpbmdTZXJ2aWNlKTtcblx0ZGVmaW5lKElDbGlwYm9hcmRTZXJ2aWNlLCBUZXN0Q2xpcGJvYXJkU2VydmljZSk7XG5cdGRlZmluZShJRWRpdG9yV29ya2VyU2VydmljZSwgVGVzdEVkaXRvcldvcmtlclNlcnZpY2UpO1xuXHRkZWZpbmVJbnN0YW5jZShJT3BlbmVyU2VydmljZSwgTnVsbE9wZW5lclNlcnZpY2UpO1xuXHRkZWZpbmUoSU5vdGlmaWNhdGlvblNlcnZpY2UsIFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0ZGVmaW5lKElEaWFsb2dTZXJ2aWNlLCBUZXN0RGlhbG9nU2VydmljZSk7XG5cdGRlZmluZShJVW5kb1JlZG9TZXJ2aWNlLCBVbmRvUmVkb1NlcnZpY2UpO1xuXHRkZWZpbmUoSUxhbmd1YWdlU2VydmljZSwgTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0ZGVmaW5lKElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGRlZmluZShJQ29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGRlZmluZShJVGV4dFJlc291cmNlUHJvcGVydGllc1NlcnZpY2UsIFRlc3RUZXh0UmVzb3VyY2VQcm9wZXJ0aWVzU2VydmljZSk7XG5cdGRlZmluZUluc3RhbmNlKElTdG9yYWdlU2VydmljZSwgbmV3IE51bGxTdG9yYWdlU2VydmljZSgpKTtcblx0aWYgKG9wdGlvbnM/LmNvbG9yVGhlbWUpIHtcblx0XHRkZWZpbmVJbnN0YW5jZShJVGhlbWVTZXJ2aWNlLCBuZXcgVGVzdFRoZW1lU2VydmljZShvcHRpb25zLmNvbG9yVGhlbWUpKTtcblx0fSBlbHNlIHtcblx0XHRkZWZpbmUoSVRoZW1lU2VydmljZSwgVGVzdFRoZW1lU2VydmljZSk7XG5cdH1cblx0ZGVmaW5lKElMb2dTZXJ2aWNlLCBGaXh0dXJlTG9nU2VydmljZSk7XG5cdGRlZmluZShJTW9kZWxTZXJ2aWNlLCBGaXh0dXJlTW9kZWxTZXJ2aWNlKTtcblx0ZGVmaW5lKElDb2RlRWRpdG9yU2VydmljZSwgVGVzdENvZGVFZGl0b3JTZXJ2aWNlKTtcblx0ZGVmaW5lKElDb250ZXh0S2V5U2VydmljZSwgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKTtcblx0ZGVmaW5lKElDb21tYW5kU2VydmljZSwgVGVzdENvbW1hbmRTZXJ2aWNlKTtcblx0ZGVmaW5lKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZVNoYXBlKTtcblx0ZGVmaW5lKElMb2dnZXJTZXJ2aWNlLCBOdWxsTG9nZ2VyU2VydmljZSk7XG5cdGRlZmluZShJRGF0YUNoYW5uZWxTZXJ2aWNlLCBOdWxsRGF0YUNoYW5uZWxTZXJ2aWNlKTtcblx0ZGVmaW5lKElFbnZpcm9ubWVudFNlcnZpY2UsIGNsYXNzIGV4dGVuZHMgbW9jazxJRW52aXJvbm1lbnRTZXJ2aWNlPigpIHtcblx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRvdmVycmlkZSBpc0J1aWx0OiBib29sZWFuID0gdHJ1ZTtcblx0XHRvdmVycmlkZSBpc0V4dGVuc2lvbkRldmVsb3BtZW50OiBib29sZWFuID0gZmFsc2U7XG5cdH0pO1xuXHRkZWZpbmUoSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSwgTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlKTtcblx0ZGVmaW5lKElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRkZWZpbmUoSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSwgVGVzdFRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSk7XG5cdGRlZmluZShJSW5saW5lQ29tcGxldGlvbnNTZXJ2aWNlLCBJbmxpbmVDb21wbGV0aW9uc1NlcnZpY2UpO1xuXHRkZWZpbmVJbnN0YW5jZShJQ29kZUxlbnNDYWNoZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRwdXQ6ICgpID0+IHsgfSxcblx0XHRnZXQ6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRkZWxldGU6ICgpID0+IHsgfSxcblx0fSk7XG5cdGRlZmluZUluc3RhbmNlKElIb3ZlclNlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0c2hvd0RlbGF5ZWRIb3ZlcjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHNldHVwRGVsYXllZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0c2V0dXBEZWxheWVkSG92ZXJBdE1vdXNlOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0c2hvd0luc3RhbnRIb3ZlcjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGhpZGVIb3ZlcjogKCkgPT4geyB9LFxuXHRcdHNob3dBbmRGb2N1c0xhc3RIb3ZlcjogKCkgPT4geyB9LFxuXHRcdHNldHVwTWFuYWdlZEhvdmVyOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0sIHNob3c6ICgpID0+IHsgfSwgaGlkZTogKCkgPT4geyB9LCB1cGRhdGU6ICgpID0+IHsgfSB9KSxcblx0XHRzaG93TWFuYWdlZEhvdmVyOiAoKSA9PiB7IH0sXG5cdH0pO1xuXHRkZWZpbmVJbnN0YW5jZShJRGVmYXVsdEFjY291bnRTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlRGVmYXVsdEFjY291bnQ6IG5ldyBFbWl0dGVyPG51bGw+KCkuZXZlbnQsXG5cdFx0b25EaWRDaGFuZ2VQb2xpY3lEYXRhOiBuZXcgRW1pdHRlcjxudWxsPigpLmV2ZW50LFxuXHRcdHBvbGljeURhdGE6IG51bGwsXG5cdFx0Y3VycmVudERlZmF1bHRBY2NvdW50OiBudWxsLFxuXHRcdGNvcGlsb3RUb2tlbkluZm86IG51bGwsXG5cdFx0b25EaWRDaGFuZ2VDb3BpbG90VG9rZW5JbmZvOiBuZXcgRW1pdHRlcjxudWxsPigpLmV2ZW50LFxuXHRcdG1hbmFnZWRTZXR0aW5nc0ZldGNoU3RhdHVzOiBudWxsLFxuXHRcdG1hbmFnZWRTZXR0aW5nc0ZldGNoZWRBdDogbnVsbCxcblx0XHRtYW5hZ2VkU2V0dGluZ3NSYXdSZXNwb25zZTogbnVsbCxcblx0XHRnZXREZWZhdWx0QWNjb3VudDogYXN5bmMgKCkgPT4gbnVsbCxcblx0XHRnZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXI6ICgpID0+ICh7IGlkOiAndGVzdCcsIG5hbWU6ICdUZXN0Jywgc2NvcGVzOiBbXSwgZW50ZXJwcmlzZTogZmFsc2UgfSksXG5cdFx0cmVzb2x2ZUdpdEh1YlVybDogKHBhdGg6IHN0cmluZykgPT4gYGh0dHBzOi8vZ2l0aHViLmNvbS8ke3BhdGh9YCxcblx0XHRzZXREZWZhdWx0QWNjb3VudFByb3ZpZGVyOiAoKSA9PiB7IH0sXG5cdFx0cmVmcmVzaDogYXN5bmMgKCkgPT4gbnVsbCxcblx0XHRzaWduSW46IGFzeW5jICgpID0+IG51bGwsXG5cdFx0c2lnbk91dDogYXN5bmMgKCkgPT4geyB9LFxuXHR9KTtcblxuXHQvLyBVc2VyIGludGVyYWN0aW9uIHNlcnZpY2Ugd2l0aCBmb2N1cyBzaW11bGF0aW9uIGVuYWJsZWQgKGFsbCBlbGVtZW50cyBhcHBlYXIgZm9jdXNlZCBpbiBmaXh0dXJlcylcblx0ZGVmaW5lSW5zdGFuY2UoSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UsIG5ldyBNb2NrVXNlckludGVyYWN0aW9uU2VydmljZSh0cnVlLCBmYWxzZSkpO1xuXG5cdGRlZmluZVBhcnRpYWxJbnN0YW5jZShJQWN0aW9uV2lkZ2V0U2VydmljZSwge1xuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRzaG93OiAoKSA9PiB7IH0sXG5cdFx0aGlkZTogKCkgPT4geyB9LFxuXHRcdGdldCBpc1Zpc2libGUoKSB7IHJldHVybiBmYWxzZTsgfSxcblx0fSk7XG5cblx0ZGVmaW5lSW5zdGFuY2UoSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdHBsYXlTaWduYWw6IGFzeW5jICgpID0+IHsgfSxcblx0XHRwbGF5U2lnbmFsczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdHBsYXlTaWduYWxMb29wOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0Z2V0RW5hYmxlZFN0YXRlOiAoKSA9PiAoeyB2YWx1ZTogZmFsc2UsIG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLCBvbkNoYW5nZTogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pIH0pLFxuXHRcdGdldERlbGF5TXM6ICgpID0+IDAsXG5cdFx0cGxheVNvdW5kOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0aXNTb3VuZEVuYWJsZWQ6ICgpID0+IGZhbHNlLFxuXHRcdGlzQW5ub3VuY2VtZW50RW5hYmxlZDogKCkgPT4gZmFsc2UsXG5cdFx0b25Tb3VuZEVuYWJsZWRDaGFuZ2VkOiAoKSA9PiBFdmVudC5Ob25lLFxuXHR9KTtcblxuXHRkZWZpbmUoSVRleHRNb2RlbFNlcnZpY2UsIEZpeHR1cmVUZXh0TW9kZWxTZXJ2aWNlKTtcblxuXHRkZWZpbmVJbnN0YW5jZShJQWdlbnRGZWVkYmFja1NlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VGZWVkYmFjazogRXZlbnQuTm9uZSxcblx0XHRvbkRpZENoYW5nZU5hdmlnYXRpb246IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRDaGFuZ2VGZWVkYmFja1Njb3BlOiBFdmVudC5Ob25lLFxuXHRcdGFjdGl2ZUZlZWRiYWNrU2Vzc2lvblJlc291cmNlOiBjb25zdE9ic2VydmFibGUoQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UpLFxuXHRcdG9uRGlkQWRkRmVlZGJhY2s6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRDb252ZXJ0RmVlZGJhY2s6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRBZGRSZXBseTogRXZlbnQuTm9uZSxcblx0XHRvbkRpZFN1Ym1pdEZlZWRiYWNrOiBFdmVudC5Ob25lLFxuXHRcdG9uRGlkUmV2ZWFsU2Vzc2lvbkNvbW1lbnQ6IEV2ZW50Lk5vbmUsXG5cdFx0YWRkRmVlZGJhY2s6ICgpID0+IHVuZGVmaW5lZCEsXG5cdFx0cmVtb3ZlRmVlZGJhY2s6ICgpID0+IHsgfSxcblx0XHR1cGRhdGVGZWVkYmFjazogKCkgPT4geyB9LFxuXHRcdGFjY2VwdEZlZWRiYWNrOiAoKSA9PiB7IH0sXG5cdFx0YWRkUmVwbHk6ICgpID0+IHsgfSxcblx0XHRnZXRGZWVkYmFjazogKCkgPT4gW10sXG5cdFx0aGFzTG9hZGVkRmVlZGJhY2s6ICgpID0+IHRydWUsXG5cdFx0Z2V0U2Vzc2lvbkZvckZpbGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRnZXRGZWVkYmFja1Nlc3Npb25SZXNvdXJjZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdHJlZ2lzdGVyRmVlZGJhY2tSZXNvdXJjZVNjb3BlOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRnZXRNb3N0UmVjZW50U2Vzc2lvbkZvclJlc291cmNlOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0cmV2ZWFsRmVlZGJhY2s6IGFzeW5jICgpID0+IHsgfSxcblx0XHRyZXZlYWxTZXNzaW9uQ29tbWVudDogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGdldE5leHRGZWVkYmFjazogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGdldE5leHROYXZpZ2FibGVJdGVtOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0c2V0TmF2aWdhdGlvbkFuY2hvcjogKCkgPT4geyB9LFxuXHRcdGdldE5hdmlnYXRpb25CZWFyaW5nOiAoKSA9PiAoeyBhY3RpdmVJZHg6IC0xLCB0b3RhbENvdW50OiAwIH0pLFxuXHRcdGNsZWFyRmVlZGJhY2s6ICgpID0+IHsgfSxcblx0XHRtYXJrRmVlZGJhY2tTdWJtaXR0ZWQ6ICgpID0+IHsgfSxcblx0XHRzdWJtaXRGZWVkYmFjazogYXN5bmMgKCkgPT4gZmFsc2UsXG5cdFx0YWRkRmVlZGJhY2tBbmRTdWJtaXQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRzZXRGZWVkYmFja1Jlc29sdmVkOiBhc3luYyAoKSA9PiB7IH0sXG5cdH0pO1xuXG5cdGRlZmluZVBhcnRpYWxJbnN0YW5jZShJQ2hhdEVkaXRpbmdTZXJ2aWNlLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGVkaXRpbmdTZXNzaW9uc09iczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHRzdGFydE9yQ29udGludWVHbG9iYWxFZGl0aW5nU2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkISxcblx0XHRnZXRFZGl0aW5nU2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHR9KTtcblxuXHRkZWZpbmVQYXJ0aWFsSW5zdGFuY2UoSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0Z2V0U2Vzc2lvbjogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGdldFNlc3Npb25zOiAoKSA9PiBbXSxcblx0fSk7XG5cblx0ZGVmaW5lUGFydGlhbEluc3RhbmNlKElTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0YWN0aXZlU2Vzc2lvbjogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdH0pO1xuXG5cdGRlZmluZVBhcnRpYWxJbnN0YW5jZShJQ29kZVJldmlld1NlcnZpY2UsIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0Z2V0UFJSZXZpZXdTdGF0ZTogKCkgPT4gY29uc3RPYnNlcnZhYmxlKHsga2luZDogUFJSZXZpZXdTdGF0ZUtpbmQuTm9uZSB9KSxcblx0XHRyZXNvbHZlUFJSZXZpZXdUaHJlYWQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRtYXJrUFJSZXZpZXdDb21tZW50Q29udmVydGVkOiAoKSA9PiB7IH0sXG5cdH0pO1xuXG5cdC8vIEFsbG93IGFkZGl0aW9uYWwgc2VydmljZXMgdG8gb3ZlcnJpZGUgZGVmYXVsdHNcblx0b3B0aW9ucz8uYWRkaXRpb25hbFNlcnZpY2VzPy4oe1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0ZGVmaW5lOiA8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBjdG9yOiBuZXcgKC4uLmFyZ3M6IGFueVtdKSA9PiBUKSA9PiB7XG5cdFx0XHRzZXJ2aWNlcy5zZXQoaWQsIG5ldyBTeW5jRGVzY3JpcHRvcihjdG9yKSk7XG5cdFx0XHRzZXJ2aWNlSWRlbnRpZmllcnMucHVzaChpZCk7XG5cdFx0fSxcblx0XHRkZWZpbmVJbnN0YW5jZTogPFQ+KGlkOiBTZXJ2aWNlSWRlbnRpZmllcjxUPiwgaW5zdGFuY2U6IFQpID0+IHtcblx0XHRcdHNlcnZpY2VzLnNldChpZCwgaW5zdGFuY2UpO1xuXHRcdFx0c2VydmljZUlkZW50aWZpZXJzLnB1c2goaWQpO1xuXHRcdH0sXG5cdFx0ZGVmaW5lUGFydGlhbEluc3RhbmNlOiA8VD4oaWQ6IFNlcnZpY2VJZGVudGlmaWVyPFQ+LCBpbnN0YW5jZTogUGFydGlhbDxUPikgPT4ge1xuXHRcdFx0c2VydmljZXMuc2V0KGlkLCBpbnN0YW5jZSBhcyBUKTtcblx0XHRcdHNlcnZpY2VJZGVudGlmaWVycy5wdXNoKGlkKTtcblx0XHR9LFxuXHR9KTtcblxuXHQvLyBQYXNzIGBfcHJvcGVyRGlzcG9zZTogdHJ1ZWAgc28gdGhlIHVuZGVybHlpbmcgYEluc3RhbnRpYXRpb25TZXJ2aWNlYCdzXG5cdC8vIGRpc3Bvc2UgcnVucywgd2hpY2ggZGlzcG9zZXMgc2VydmljZXMgaXQgaW5zdGFudGlhdGVkIGxhemlseSBmcm9tXG5cdC8vIGBTeW5jRGVzY3JpcHRvcmBzIChlLmcuIE1lbnVTZXJ2aWNlLCBDb250ZXh0S2V5U2VydmljZSkuIFdpdGhvdXQgdGhpcyxcblx0Ly8gcHJvZHVjdGlvbiBzZXJ2aWNlcyB3aXRoIGludGVybmFsIERpc3Bvc2FibGVzIGxlYWsgcGFzdCB0aGUgZml4dHVyZS5cblx0Ly9cblx0Ly8gRG9uJ3QgYWRkIFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB0byBkaXNwb3NhYmxlcyBpbW1lZGlhdGVseSBcdTIwMTQgaXQgbXVzdFxuXHQvLyBkaXNwb3NlIHJ1bnMsIHdoaWNoIGRpc3Bvc2VzIHNlcnZpY2VzIGl0IGluc3RhbnRpYXRlZCBsYXppbHkgZnJvbVxuXHQvLyBgU3luY0Rlc2NyaXB0b3JgcyAoZS5nLiBNZW51U2VydmljZSwgQ29udGV4dEtleVNlcnZpY2UpLiBXaXRob3V0IHRoaXMsXG5cdC8vIHByb2R1Y3Rpb24gc2VydmljZXMgd2l0aCBpbnRlcm5hbCBEaXNwb3NhYmxlcyBsZWFrIHBhc3QgdGhlIGZpeHR1cmUuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uoc2VydmljZXMsIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSkpO1xuXG5cdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdGZvciAoY29uc3QgaWQgb2Ygc2VydmljZUlkZW50aWZpZXJzKSB7XG5cdFx0XHRjb25zdCBpbnN0YW5jZU9yRGVzY3JpcHRvciA9IHNlcnZpY2VzLmdldChpZCk7XG5cdFx0XHRpZiAodHlwZW9mIGluc3RhbmNlT3JEZXNjcmlwdG9yPy5kaXNwb3NlID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdGluc3RhbmNlT3JEZXNjcmlwdG9yLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pKTtcblxuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2U7XG59XG5cbi8qKlxuICogUmVnaXN0ZXJzIGFkZGl0aW9uYWwgc2VydmljZXMgbmVlZGVkIGJ5IHdvcmtiZW5jaCBjb21wb25lbnRzIChtZXJnZSBlZGl0b3IsIGV0Yy4pLlxuICogVXNlIHdpdGggY3JlYXRlRWRpdG9yU2VydmljZXMgYWRkaXRpb25hbFNlcnZpY2VzIG9wdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnaXN0cmF0aW9uOiBTZXJ2aWNlUmVnaXN0cmF0aW9uKTogdm9pZCB7XG5cdHJlZ2lzdHJhdGlvbi5kZWZpbmVJbnN0YW5jZShJQ29udGV4dE1lbnVTZXJ2aWNlLCB7XG5cdFx0c2hvd0NvbnRleHRNZW51OiAoKSA9PiB7IH0sXG5cdFx0b25EaWRTaG93Q29udGV4dE1lbnU6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRvbkRpZEhpZGVDb250ZXh0TWVudTogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0fSk7XG5cblx0cmVnaXN0cmF0aW9uLmRlZmluZUluc3RhbmNlKElDb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRzaG93Q29udGV4dFZpZXc6ICgpID0+ICh7IGNsb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0aGlkZUNvbnRleHRWaWV3OiAoKSA9PiB7IH0sXG5cdFx0Z2V0Q29udGV4dFZpZXdFbGVtZW50OiAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0bGF5b3V0OiAoKSA9PiB7IH0sXG5cdFx0YW5jaG9yQWxpZ25tZW50OiAwLFxuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0fSk7XG5cblx0cmVnaXN0cmF0aW9uLmRlZmluZUluc3RhbmNlKElMYWJlbFNlcnZpY2UsIHtcblx0XHRnZXRVcmlMYWJlbDogKHVyaTogVVJJKSA9PiB1cmkucGF0aCxcblx0XHRnZXRVcmlCYXNlbmFtZUxhYmVsOiAodXJpOiBVUkkpID0+IHVyaS5wYXRoLnNwbGl0KCcvJykucG9wKCkgPz8gJycsXG5cdFx0Z2V0V29ya3NwYWNlTGFiZWw6ICgpID0+ICcnLFxuXHRcdGdldEhvc3RMYWJlbDogKCkgPT4gJycsXG5cdFx0Z2V0U2VwYXJhdG9yOiAoKSA9PiAnLycsXG5cdFx0cmVnaXN0ZXJGb3JtYXR0ZXI6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRvbkRpZENoYW5nZUZvcm1hdHRlcnM6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRyZWdpc3RlckNhY2hlZEZvcm1hdHRlcjogKCkgPT4gKHsgZGlzcG9zZTogKCkgPT4geyB9IH0pLFxuXHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRnZXRIb3N0VG9vbHRpcDogKCkgPT4gJycsXG5cdH0pO1xuXG5cdHJlZ2lzdHJhdGlvbi5kZWZpbmUoSU1lbnVTZXJ2aWNlLCBUZXN0TWVudVNlcnZpY2UpO1xuXHRyZWdpc3RyYXRpb24uZGVmaW5lKElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsIE51bGxBY3Rpb25WaWV3SXRlbVNlcnZpY2UpO1xuXG5cdC8vIE5vLW9wIHBob25lIHByZXNlbnRlciBzbyBjaGF0LWlucHV0IGZpeHR1cmVzIGRvbid0IGNyYXNoIG9uXG5cdC8vIGBjaGF0UGhvbmVJbnB1dFByZXNlbnRlci5lbmFibGVkLmdldCgpYC4gVGhlIHJlYWwgaW1wbCBpcyBpblxuXHQvLyBgdnMvc2Vzc2lvbnNgIGFuZCBvbmx5IGF0dGFjaGVzIGluIHRoZSBhZ2VudHMgd2luZG93IFx1MjAxNCBkZXNrdG9wXG5cdC8vIGZpeHR1cmVzIHNlZSB0aGUgbm8tb3AgKGBlbmFibGVkID09PSBmYWxzZWAsIHNoZWV0IGNhbGxzIHJlc29sdmVcblx0Ly8gaW1tZWRpYXRlbHkpIHdoaWNoIG1hdGNoZXMgZGVza3RvcCBydW50aW1lIGJlaGF2aW9yLlxuXHRyZWdpc3RyYXRpb24uZGVmaW5lSW5zdGFuY2UoSUNoYXRQaG9uZUlucHV0UHJlc2VudGVyLCB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdGVuYWJsZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0c2hvd0NvbWJpbmVkTW9kZUFuZE1vZGVsU2hlZXQ6ICgpID0+IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdHNldEltcGw6ICgpID0+ICh7IGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0fSk7XG5cblx0Ly8gV29ya3NwYWNlIHRydXN0IHN0dWJzIHNvIGNoYXQtaW5wdXQgZml4dHVyZXMgY2FuIGluc3RhbnRpYXRlIHRoZSBtb2RlbFxuXHQvLyBwaWNrZXIgKE1vZGVsUGlja2VyV2lkZ2V0IHJlYWRzIHdvcmtzcGFjZSB0cnVzdCB0byBkZXRlY3QgUmVzdHJpY3RlZCBNb2RlKS5cblx0Ly8gUmVwb3J0cyB0aGUgd29ya3NwYWNlIGFzIHRydXN0ZWQgc28gdGhlIHBpY2tlciByZW5kZXJzIG5vcm1hbGx5LlxuXHRyZWdpc3RyYXRpb24uZGVmaW5lSW5zdGFuY2UoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlVHJ1c3QgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWQgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRvdmVycmlkZSBpc1dvcmtzcGFjZVRydXN0ZWQoKSB7IHJldHVybiB0cnVlOyB9XG5cdH0oKSk7XG5cdHJlZ2lzdHJhdGlvbi5kZWZpbmVJbnN0YW5jZShJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmVxdWVzdFdvcmtzcGFjZVRydXN0KCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHR9KCkpO1xufVxuXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFRleHQgTW9kZWxzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQ3JlYXRlcyBhIHRleHQgbW9kZWwgdXNpbmcgdGhlIE1vZGVsU2VydmljZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRleHRNb2RlbChcblx0aW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSxcblx0dGV4dDogc3RyaW5nLFxuXHR1cmk6IFVSSSxcblx0bGFuZ3VhZ2VJZD86IHN0cmluZ1xuKTogSVRleHRNb2RlbCB7XG5cdGNvbnN0IG1vZGVsU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRjb25zdCBsYW5ndWFnZVNlbGVjdGlvbiA9IGxhbmd1YWdlSWQgPyBsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZUlkKSA6IG51bGw7XG5cdHJldHVybiBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwodGV4dCwgbGFuZ3VhZ2VTZWxlY3Rpb24sIHVyaSk7XG59XG5cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRml4dHVyZSBBZGFwdGVyc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgaW50ZXJmYWNlIFRoZW1lZEZpeHR1cmVHcm91cExhYmVscyB7XG5cdHJlYWRvbmx5IGtpbmQ/OiAnc2NyZWVuc2hvdCcgfCAnYW5pbWF0ZWQnO1xuXHRyZWFkb25seSBibG9ja3NDaT86IHRydWU7XG5cdHJlYWRvbmx5IGZsYWt5PzogdHJ1ZTtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZUxhYmVscyhsYWJlbHM6IFRoZW1lZEZpeHR1cmVHcm91cExhYmVscyB8IHVuZGVmaW5lZCk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRpZiAobGFiZWxzPy5raW5kID09PSAnc2NyZWVuc2hvdCcpIHtcblx0XHRyZXN1bHQucHVzaCgnLnNjcmVlbnNob3QnKTtcblx0fSBlbHNlIGlmIChsYWJlbHM/LmtpbmQgPT09ICdhbmltYXRlZCcpIHtcblx0XHRyZXN1bHQucHVzaCgnYW5pbWF0ZWQnKTtcblx0fVxuXHRpZiAobGFiZWxzPy5ibG9ja3NDaSkge1xuXHRcdHJlc3VsdC5wdXNoKCdibG9ja3MtY2knKTtcblx0fVxuXHRpZiAobGFiZWxzPy5mbGFreSkge1xuXHRcdHJlc3VsdC5wdXNoKCdmbGFreScpO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNwb3NhYmxlU3RhY2tTdG9yZSBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaXRlbXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXG5cdGFkZDxUIGV4dGVuZHMgSURpc3Bvc2FibGU+KGl0ZW06IFQpOiBUIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0aXRlbS5kaXNwb3NlKCk7XG5cdFx0XHRjb25zb2xlLndhcm4oJ0FkZGluZyB0byBhIGRpc3Bvc2VkIERpc3Bvc2FibGVTdGFja1N0b3JlJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2l0ZW1zLnB1c2goaXRlbSk7XG5cdFx0fVxuXHRcdHJldHVybiBpdGVtO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR3aGlsZSAodGhpcy5faXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5faXRlbXMucG9wKCkhLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21wb25lbnRGaXh0dXJlQ29udGV4dCB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlO1xuXHRkaXNwb3NhYmxlU3RhY2tTdG9yZTogRGlzcG9zYWJsZVN0YWNrU3RvcmU7XG5cdHRoZW1lOiBDb2xvclRoZW1lRGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21wb25lbnRGaXh0dXJlT3B0aW9ucyB7XG5cdHJlbmRlcjogKGNvbnRleHQ6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPjtcblx0bGFiZWxzPzogVGhlbWVkRml4dHVyZUdyb3VwTGFiZWxzO1xuXHR2aXJ0dWFsVGltZT86IHsgZW5hYmxlZD86IGJvb2xlYW47IGR1cmF0aW9uTXM/OiBudW1iZXI7IHRlYXJkb3duRHJhaW5Ncz86IG51bWJlciB9O1xuXHRhZGRpdGlvbmFsVGhlbWVzPzogcmVhZG9ubHkgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZVtdO1xufVxuXG50eXBlIFRoZW1lZEZpeHR1cmVzID0gUmV0dXJuVHlwZTx0eXBlb2YgZGVmaW5lRml4dHVyZVZhcmlhbnRzPjtcblxuLy8gUGVybWFuZW50IGxvZ2dpbmcgbGF5ZXIgdGhhdCBkZXRlY3RzIHJlYWwgdGltZXIgQVBJIHVzYWdlLlxuLy8gSW5jbHVkZXMgaGFuZGxlciBzb3VyY2UgZm9yIGlkZW50aWZpY2F0aW9uIHNpbmNlIGJ1bmRsZWQgc3RhY2sgdHJhY2VzIGFyZSBub3QgdXNlZnVsLlxuY29uc3QgcmVhbFRpbWVBcGkgPSBjYXB0dXJlR2xvYmFsVGltZUFwaSgpO1xuY29uc3QgbG9nT3V0c2lkZVRpbWUgPSBmYWxzZTtcbmlmIChsb2dPdXRzaWRlVGltZSkge1xuXHRjb25zdCBsb2dnaW5nVGltZUFwaSA9IGNyZWF0ZUxvZ2dpbmdUaW1lQXBpKHJlYWxUaW1lQXBpLCAobmFtZSwgc3RhY2ssIGhhbmRsZXIpID0+IHtcblx0XHRjb25zdCBoYW5kbGVyU3RyID0gdHlwZW9mIGhhbmRsZXIgPT09ICdmdW5jdGlvbicgPyBoYW5kbGVyLnRvU3RyaW5nKCkuc2xpY2UoMCwgNTAwKSA6IFN0cmluZyhoYW5kbGVyKTtcblx0XHRjb25zb2xlLndhcm4oYFtDb21wb25lbnRGaXh0dXJlXSBSZWFsICR7bmFtZX0gY2FsbGVkIG91dHNpZGUgb2YgdmlydHVhbCB0aW1lLlxcbkhhbmRsZXI6ICR7aGFuZGxlclN0cn1cXG5TdGFjazogJHtzdGFja31gKTtcblx0fSk7XG5cdHB1c2hHbG9iYWxUaW1lQXBpKGxvZ2dpbmdUaW1lQXBpKTtcbn1cblxubGV0IGZpeHR1cmVSZW5kZXJDb3VudGVyID0gMDtcblxuLyoqXG4gKiBDcmVhdGVzIERhcmsgYW5kIExpZ2h0IGZpeHR1cmUgdmFyaWFudHMgZnJvbSBhIHNpbmdsZSByZW5kZXIgZnVuY3Rpb24sIHdpdGggb3B0aW9uYWwgYWRkaXRpb25hbCB0aGVtZSB2YXJpYW50cy5cbiAqIFRoZSByZW5kZXIgZnVuY3Rpb24gcmVjZWl2ZXMgYSBjb250ZXh0IHdpdGggY29udGFpbmVyIGFuZCBkaXNwb3NhYmxlU3RvcmUuXG4gKlxuICogTm90ZTogSWYgcmVuZGVyIHJldHVybnMgYSBQcm9taXNlLCB0aGUgYXN5bmMgd29yayB3aWxsIHJ1biBpbiBiYWNrZ3JvdW5kLlxuICogQ29tcG9uZW50LWV4cGxvcmVyIHdhaXRzIDIgYW5pbWF0aW9uIGZyYW1lcyBhZnRlciBzeW5jIHJlbmRlciByZXR1cm5zLFxuICogd2hpY2ggc2hvdWxkIGJlIHN1ZmZpY2llbnQgZm9yIG1vc3QgYXN5bmMgc2V0dXAsIGJ1dCB0aW1pbmcgaXMgbm90IGd1YXJhbnRlZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKG9wdGlvbnM6IENvbXBvbmVudEZpeHR1cmVPcHRpb25zKTogVGhlbWVkRml4dHVyZXMge1xuXHRjb25zdCBjcmVhdGVGaXh0dXJlID0gKHRoZW1lVmFyaWFudDogQ29tcG9uZW50Rml4dHVyZVRoZW1lVmFyaWFudCkgPT4gZGVmaW5lRml4dHVyZSh7XG5cdFx0aXNvbGF0aW9uOiAnbm9uZScsXG5cdFx0ZGlzcGxheU1vZGU6IHsgdHlwZTogJ2NvbXBvbmVudCcgfSxcblx0XHRiYWNrZ3JvdW5kOiB0aGVtZVZhcmlhbnQuYmFja2dyb3VuZCxcblx0XHRyZW5kZXI6IGFzeW5jIChjb250YWluZXI6IEhUTUxFbGVtZW50LCBjb250ZXh0KSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHBhcnNlRml4dHVyZUlucHV0KGNvbnRleHQuaW5wdXQpO1xuXHRcdFx0Y29uc3QgeyBsYWJlbDogdGhlbWVMYWJlbCwgdGhlbWUsIHNjb3BlVGhlbWluZ1BhcnRpY2lwYW50cyB9ID0gdGhlbWVWYXJpYW50O1xuXG5cdFx0XHQvLyBSZXBsYWNlIE1hdGgucmFuZG9tIHdpdGggYSBzZWVkZWQgUFJORyBzbyBmaXh0dXJlcyByZW5kZXIgZGV0ZXJtaW5pc3RpY2FsbHkuXG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHB1c2hSYW5kb21PdmVyd3JpdGUoNDIpKTtcblxuXHRcdFx0Ly8gRG8gbm90IGVuYWJsZSB2aXJ0dWFsIHRpbWUgaW4gZXhwbG9yZXIgdWksIGFzIG11bHRpcGxlIGZpeHR1cmVzIGFyZSByZW5kZXJlZCBpbiBwYXJhbGxlbC5cblx0XHRcdGNvbnN0IHZpcnR1YWxUaW1lRW5hYmxlZCA9IChvcHRpb25zLnZpcnR1YWxUaW1lPy5lbmFibGVkID8/IHRydWUpICYmIGNvbnRleHQuaG9zdC5raW5kICE9PSAnZXhwbG9yZXItdWknO1xuXHRcdFx0Ly8gRGV0ZWN0IGRpc3Bvc2FibGUgbGVha3MgdGhlIHNhbWUgd2F5IHVuaXQgdGVzdHMgZG8gKGBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGVgKS5cblx0XHRcdC8vIFRoZSB0cmFja2VyIGlzIGdsb2JhbCBhbmQgdGhlcmVmb3JlIHVuc2FmZSB3aGVuIGZpeHR1cmVzIHJlbmRlciBpbiBwYXJhbGxlbCxcblx0XHRcdC8vIHNvIGl0IGlzIG9ubHkgZW5hYmxlZCBvdXRzaWRlIHRoZSBleHBsb3JlciBVSSAoZS5nLiBpbiBzY3JlZW5zaG90L0NJIG1vZGUpLlxuXHRcdFx0Y29uc3QgbGVha0RldGVjdGlvbkVuYWJsZWQgPSB0cnVlICYmIGNvbnRleHQuaG9zdC5raW5kICE9PSAnZXhwbG9yZXItdWknO1xuXHRcdFx0Ly8gV2FybSB1cCB0aGUgYE1vZGlmaWVyS2V5RW1pdHRlcmAgc2luZ2xldG9uIGJlZm9yZSB0aGUgbGVhayB0cmFja2VyXG5cdFx0XHQvLyBzdGFydHMgc28gaXRzIGxvbmctbGl2ZWQgYERpc3Bvc2FibGVTdG9yZWAgKGNyZWF0ZWQgb24gZmlyc3Rcblx0XHRcdC8vIGBNZW51RW50cnlBY3Rpb25WaWV3SXRlbS5yZW5kZXJgKSBkb2Vzbid0IHNob3cgdXAgYXMgYSBsZWFrIGluXG5cdFx0XHQvLyB0aGUgZmlyc3QgZml4dHVyZSB0aGF0IHVzZXMgYSBtZW51IHRvb2xiYXIuXG5cdFx0XHRpZiAobGVha0RldGVjdGlvbkVuYWJsZWQpIHtcblx0XHRcdFx0TW9kaWZpZXJLZXlFbWl0dGVyLmdldEluc3RhbmNlKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0cmFja2VyID0gbGVha0RldGVjdGlvbkVuYWJsZWQgPyBuZXcgRGlzcG9zYWJsZVRyYWNrZXIoKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0cmFja2VyKSB7XG5cdFx0XHRcdHNldERpc3Bvc2FibGVUcmFja2VyKHRyYWNrZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBWaXJ0dWFsIHRpbWUgaW5mcmFzdHJ1Y3R1cmUgbGl2ZXMgYWNyb3NzIHRoZSB3aG9sZSBmaXh0dXJlXG5cdFx0XHQvLyBsaWZldGltZSAocmVuZGVyICsgZGlzcG9zZSkuIFRoaXMgbGV0cyB1cyBhZHZhbmNlIHZpcnR1YWwgdGltZVxuXHRcdFx0Ly8gZHVyaW5nIGRpc3Bvc2UgdG8gZHJhaW4gYXN5bmMgY2xlYW51cCB3b3JrIChlLmcuIGBQcm9taXNlLnJhY2VgXG5cdFx0XHQvLyBndWFyZHMgYmVoaW5kIGB0aW1lb3V0KDEwMDApYCB0aGF0IGhvbGQgcmVmZXJlbmNlcyB1bnRpbCB0aGV5XG5cdFx0XHQvLyBzZXR0bGUpIGJlZm9yZSB0aGUgbGVhayB0cmFja2VyIGNoZWNrcyBmb3IgdW5kaXNwb3NlZCBvYmplY3RzLlxuXHRcdFx0Ly9cblx0XHRcdC8vIFNlZWQgdGhlIGNsb2NrIHdpdGggYSBmaXhlZCB3YWxsLWNsb2NrIHRpbWUgc28gYW55IGNvZGUgdW5kZXJcblx0XHRcdC8vIHRlc3QgdGhhdCByZWFkcyBgRGF0ZS5ub3coKWAgLyBgbmV3IERhdGUoKWAgcHJvZHVjZXMgdGhlIHNhbWVcblx0XHRcdC8vIHZhbHVlcyBydW4gYWZ0ZXIgcnVuLiBSZWFsIHRpbWUgd291bGQgb3RoZXJ3aXNlIGxlYWsgaW5cblx0XHRcdC8vIHRocm91Z2ggdGhpcyBzZWVkIGFuZCBtYWtlIHNjcmVlbnNob3RzIHRoYXQgaW5jbHVkZVxuXHRcdFx0Ly8gdGltZS1kZXJpdmVkIGxhYmVscyAoZS5nLiBcIjEgaG91ciBhZ29cIiwgXCJUb2RheVwiKSBkcmlmdFxuXHRcdFx0Ly8gYWNyb3NzIGRheXMsIGhvdXIgYm91bmRhcmllcywgYW5kIERTVCBjaGFuZ2VzLlxuXHRcdFx0Y29uc3QgY2xvY2sgPSBuZXcgVmlydHVhbENsb2NrKG5ldyBEYXRlKCcyMDI2LTA1LTE0VDEyOjAwOjAwWicpLmdldFRpbWUoKSk7XG5cdFx0XHRjb25zdCBwID0gbmV3IFZpcnR1YWxUaW1lUHJvY2Vzc29yKFxuXHRcdFx0XHRjbG9jayxcblx0XHRcdFx0ZHJhaW5NaWNyb3Rhc2tzRW1iZWRkaW5nKHJlYWxUaW1lQXBpKSxcblx0XHRcdFx0cmVhbFRpbWVBcGksXG5cdFx0XHRcdHsgZGVmYXVsdE1heEV2ZW50czogMTAwIH0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdmlydHVhbFRpbWVBcGkgPSBjcmVhdGVWaXJ0dWFsVGltZUFwaShjbG9jaywgeyBmYWtlUmVxdWVzdEFuaW1hdGlvbkZyYW1lOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgdGVhcmRvd25EcmFpbk1zID0gb3B0aW9ucy52aXJ0dWFsVGltZT8udGVhcmRvd25EcmFpbk1zID8/IDExMDA7XG5cblx0XHRcdC8vIFNpbmdsZSBhc3luYyBkaXNwb3NlIG9yY2hlc3RyYXRlcyB0ZWFyZG93biBvcmRlcjpcblx0XHRcdC8vICAgMS4gZGlzcG9zZSB1c2VyIGRpc3Bvc2FibGVzIChzeW5jaHJvbm91cyBwYXJ0KVxuXHRcdFx0Ly8gICAyLiBkcmFpbiB2aXJ0dWFsIHRpbWUgKHNvIHRpbWVycyBzY2hlZHVsZWQgZHVyaW5nIGRpc3Bvc2Vcblx0XHRcdC8vICAgICAgXHUyMDE0IGxpa2UgYFByb21pc2UucmFjZShbLi4uLCB0aW1lb3V0KDEwMDApXSlgIFx1MjAxNCBzZXR0bGUgYW5kXG5cdFx0XHQvLyAgICAgIHJlbGVhc2UgdGhlaXIgY2FwdHVyZWQgcmVmZXJlbmNlcylcblx0XHRcdC8vICAgMy4gdGVhciBkb3duIHZpcnR1YWwgdGltZSAodW5pbnN0YWxsIGdsb2JhbCBBUEksIGRpc3Bvc2UgYHBgKVxuXHRcdFx0Ly8gICA0LiBzdG9wIHRyYWNrZXIgYW5kIGNoZWNrIGZvciBsZWFrc1xuXHRcdFx0Ly8gQWxsIG9uIG9uZSBkaXNwb3NhYmxlIHNvIHRoZSBzdGVwcyBydW4gaW4gb3JkZXIuXG5cdFx0XHRjb250ZXh0LmFkZERpc3Bvc2FibGUoe1xuXHRcdFx0XHRkaXNwb3NlOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gUmUtcHVzaCB2aXJ0dWFsIHRpbWUgc28gYW55IGBzZXRUaW1lb3V0YC9gc2V0SW50ZXJ2YWxgXG5cdFx0XHRcdFx0Ly8gY2FsbHMgbWFkZSBieSBgZGlzcG9zZSgpYCBvZiBmaXh0dXJlLW93bmVkIG9iamVjdHNcblx0XHRcdFx0XHQvLyBsYW5kIGluIGBwYCBhbmQgY2FuIGJlIGRyYWluZWQgYmVsb3cuIFJlbmRlciB1bnB1c2hlc1xuXHRcdFx0XHRcdC8vIHZpcnR1YWwgdGltZSB3aGVuIGl0IGNvbXBsZXRlcyAoc28gc2NyZWVuc2hvdCBjYXB0dXJlXG5cdFx0XHRcdFx0Ly8gZXRjLiBjYW4gdXNlIHJlYWwgdGltZXJzKSwgc28gd2UgaGF2ZSB0byBwdXNoIGFnYWluLlxuXHRcdFx0XHRcdGxldCB0ZWFyZG93blRpbWVBcGk6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh2aXJ0dWFsVGltZUVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdHRlYXJkb3duVGltZUFwaSA9IHB1c2hHbG9iYWxUaW1lQXBpKHZpcnR1YWxUaW1lQXBpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRjb25zb2xlLmVycm9yKGBbQ29tcG9uZW50Rml4dHVyZV0gZXJyb3IgZGlzcG9zaW5nIGZpeHR1cmU6ICR7ZSBpbnN0YW5jZW9mIEVycm9yID8gZS5zdGFjayA6IGV9YCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHZpcnR1YWxUaW1lRW5hYmxlZCkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgcC5ydW4oe1xuXHRcdFx0XHRcdFx0XHRcdHVudGlsOiB1bnRpbFRpbWUoY2xvY2subm93ICsgdGVhcmRvd25EcmFpbk1zKSxcblx0XHRcdFx0XHRcdFx0XHRtYXhFdmVudHM6IDEwMDAsXG5cdFx0XHRcdFx0XHRcdFx0bWF4VHJhY2VEZXB0aDogNSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFtDb21wb25lbnRGaXh0dXJlXSBlcnJvciBkcmFpbmluZyB2aXJ0dWFsIHRpbWUgZHVyaW5nIHRlYXJkb3duOiAke2UgaW5zdGFuY2VvZiBFcnJvciA/IGUuc3RhY2sgOiBlfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRlYXJkb3duVGltZUFwaT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHAuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdFx0aWYgKHRyYWNrZXIpIHtcblx0XHRcdFx0XHRcdHNldERpc3Bvc2FibGVUcmFja2VyKG51bGwpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdHJhY2tlci5jb21wdXRlTGVha2luZ0Rpc3Bvc2FibGVzKCk7XG5cdFx0XHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVGhlcmUgYXJlICR7cmVzdWx0LmxlYWtzLmxlbmd0aH0gdW5kaXNwb3NlZCBkaXNwb3NhYmxlcyEke3Jlc3VsdC5kZXRhaWxzfWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3luYyBmdW5jdGlvbiBhY3R1YWxSZW5kZXIoKSB7XG5cdFx0XHRcdGF3YWl0IHNldHVwVGhlbWUoY29udGFpbmVyLCB0aGVtZSwgc2NvcGVUaGVtaW5nUGFydGljaXBhbnRzKTtcblxuXHRcdFx0XHQvLyBUaGUgb3JkZXItZGVwZW5kZW5jeSBmdXp6ZXIgcmVvcmRlcnMgdGhlIGJ1bmRsZWQgQ1NTIGZvciBqdXN0XG5cdFx0XHRcdC8vIHRoaXMgcmVuZGVyOyB0aGUgb3ZlcnJpZGUgaXMgc2NvcGVkIHRvIHRoZSBmaXh0dXJlJ3MgbGlmZXRpbWVcblx0XHRcdFx0Ly8gKGRpc3Bvc2VkIGF0IHRlYXJkb3duLCB3aGVyZSBpdCBpcyBhbHNvIGxlYWstY2hlY2tlZCkuXG5cdFx0XHRcdGlmIChpbnB1dC5yZXZlcnNlU3R5bGVzaGVldHMgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChvdmVycmlkZVN0eWxlc2hlZXRPcmRlcihpbnB1dC5yZXZlcnNlU3R5bGVzaGVldHMpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxldCByZW5kZXJUaW1lQXBpOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHZpcnR1YWxUaW1lRW5hYmxlZCkge1xuXHRcdFx0XHRcdHJlbmRlclRpbWVBcGkgPSBwdXNoR2xvYmFsVGltZUFwaSh2aXJ0dWFsVGltZUFwaSk7XG5cblx0XHRcdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbGxGYWtlUnVuV2hlbklkbGUoKF90YXJnZXRXaW5kb3csIGNhbGxiYWNrLCBfdGltZW91dD8pID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHN0YWNrVHJhY2UgPSBuZXcgRXJyb3IoKS5zdGFjaztcblx0XHRcdFx0XHRcdGNvbnN0IHRyYWNlID0gVHJhY2VDb250ZXh0Lmluc3RhbmNlLmN1cnJlbnRUcmFjZSgpLmNoaWxkKCdydW5XaGVuSWRsZScsIHN0YWNrVHJhY2UpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNsb2NrLnNjaGVkdWxlKHtcblx0XHRcdFx0XHRcdFx0dGltZTogY2xvY2subm93LFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBkZWFkbGluZTogSWRsZURlYWRsaW5lID0ge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZGlkVGltZW91dDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdHRpbWVSZW1haW5pbmc6ICgpID0+IDUwLFxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdFx0Y2FsbGJhY2soZGVhZGxpbmUpO1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRzb3VyY2U6IHtcblx0XHRcdFx0XHRcdFx0XHR0b1N0cmluZygpIHsgcmV0dXJuICdydW5XaGVuSWRsZSc7IH0sXG5cdFx0XHRcdFx0XHRcdFx0c3RhY2tUcmFjZSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dHJhY2UsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVTdGFja1N0b3JlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0YWNrU3RvcmUoKSk7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gb3B0aW9ucy5yZW5kZXIoeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSwgZGlzcG9zYWJsZVN0YWNrU3RvcmUsIHRoZW1lIH0pO1xuXG5cdFx0XHRcdFx0Y29uc3QgcDIgPSB2aXJ0dWFsVGltZUVuYWJsZWRcblx0XHRcdFx0XHRcdD8gcC5ydW4oe1xuXHRcdFx0XHRcdFx0XHR1bnRpbDogdW50aWxUaW1lKGNsb2NrLm5vdyArIChvcHRpb25zLnZpcnR1YWxUaW1lPy5kdXJhdGlvbk1zID8/IDEwMDApKSxcblx0XHRcdFx0XHRcdFx0bWF4RXZlbnRzOiAyMDAsXG5cdFx0XHRcdFx0XHRcdG1heFRyYWNlRGVwdGg6IDUsXG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0OiBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRcdHJlc3VsdCBpbnN0YW5jZW9mIFByb21pc2UgPyByZXN1bHQgOiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdFx0XHRcdHAyLFxuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0aWYgKHZpcnR1YWxUaW1lRW5hYmxlZCAmJiBwLmhpc3RvcnkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gcC5oaXN0b3J5WzBdLnRpbWU7XG5cdFx0XHRcdFx0XHRjb25zdCBoaXN0b3J5ID0gYnVpbGRIaXN0b3J5RnJvbVRhc2tzKHAuaGlzdG9yeSwgc3RhcnRUaW1lKTtcblx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFtDb21wb25lbnRGaXh0dXJlXSAke3RoZW1lTGFiZWx9IHZpcnR1YWwtdGltZSBoaXN0b3J5ICgke3AuaGlzdG9yeS5sZW5ndGh9IHRhc2tzKTpcXG4ke3JlbmRlclN3aW1sYW5lcyhoaXN0b3J5KX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHQvLyBVbnB1c2ggdmlydHVhbCB0aW1lIHNvIHRoZSBwb3N0LXJlbmRlciBmbG93IChzY3JlZW5zaG90XG5cdFx0XHRcdFx0Ly8gY2FwdHVyZSwgc3RhYmlsaXR5IGNoZWNrcywgXHUyMDI2KSBydW5zIHdpdGggcmVhbCB0aW1lcnMuXG5cdFx0XHRcdFx0cmVuZGVyVGltZUFwaT8uZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEV2ZXJ5IHJlbmRlciBnZXRzIGl0cyBvd24gdHJhY2Ugcm9vdCBzbyB0aGF0IGFueSBkaWFnbm9zdGljc1xuXHRcdFx0Ly8gb3V0cHV0IGJ5IHRoZSBzY2hlZHVsZXIgLyBwcm9jZXNzb3Igc2hvd3MgZXhhY3RseSB3aGljaCBmaXh0dXJlXG5cdFx0XHQvLyBjYXVzZWQgZWFjaCBxdWV1ZWQgb3IgaGlzdG9yaWNhbCB0aW1lciwgcGx1cyB0aGUgZnVsbCBjaGFpbiBvZlxuXHRcdFx0Ly8gc2V0VGltZW91dC9yQUYgY2FsbHMgdGhhdCBsZWQgdG8gaXQuXG5cdFx0XHRjb25zdCBmaXh0dXJlUm9vdCA9IGNyZWF0ZVRyYWNlUm9vdChgcmVuZGVyIyR7KytmaXh0dXJlUmVuZGVyQ291bnRlcn0oJHt0aGVtZUxhYmVsfSlgKTtcblxuXHRcdFx0YXdhaXQgVHJhY2VDb250ZXh0Lmluc3RhbmNlLnJ1bkFzSGFuZGxlcihmaXh0dXJlUm9vdCwgYWN0dWFsUmVuZGVyLCB7XG5cdFx0XHRcdC8vIFRyYWNlLXJlc2V0IGVzY2FwZXMgdmlydHVhbCB0aW1lIHNvIGl0IGFjdHVhbGx5IGZpcmVzLlxuXHRcdFx0XHRhZnRlck1pY3JvdGFza0Nsb3N1cmU6IGNiID0+IG5leHRNYWNyb3Rhc2socmVhbFRpbWVBcGksIGNiKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoaW5wdXQub3V0cHV0VGltZVRyYWNlICYmIHZpcnR1YWxUaW1lRW5hYmxlZCAmJiBwLmhpc3RvcnkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBzdGFydFRpbWUgPSBwLmhpc3RvcnlbMF0udGltZTtcblx0XHRcdFx0Y29uc3QgaGlzdG9yeSA9IGJ1aWxkSGlzdG9yeUZyb21UYXNrcyhwLmhpc3RvcnksIHN0YXJ0VGltZSk7XG5cdFx0XHRcdHJldHVybiB7IG91dHB1dDogcmVuZGVyU3dpbWxhbmVzKGhpc3RvcnkpIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZSBvcmRlci1kZXBlbmRlbmN5IGJpc2VjdGlvbiBkcml2ZXIgYXNrcyBmb3IgdGhlIGxpc3Qgb2YgYnVuZGxlZFxuXHRcdFx0Ly8gc3R5bGVzaGVldCBkb2N1bWVudHMgc28gaXQgY2FuIG5hbWUgYSBjb25mbGljdGluZyBkb2N1bWVudCBieSBpbmRleFxuXHRcdFx0Ly8gd2l0aG91dCBpdHNlbGYgcGFyc2luZyB0aGUgYnVuZGxlLiBLZWVwaW5nIHRoaXMga25vd2xlZGdlIGluIHRoZVxuXHRcdFx0Ly8gcnVudGltZSBtZWFucyB0aGUgZHJpdmVyIG9ubHkgZGVhbHMgaW4gaW5kaWNlcyBhbmQgaW1hZ2UgaGFzaGVzLlxuXHRcdFx0aWYgKGlucHV0Lm91dHB1dFN0eWxlc2hlZXRGaWxlcykge1xuXHRcdFx0XHRyZXR1cm4geyBvdXRwdXQ6IHsgc3R5bGVzaGVldEZpbGVzOiBhd2FpdCBnZXRTdHlsZXNoZWV0RG9jdW1lbnRGaWxlcygpIH0gfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0fSk7XG5cblx0Y29uc3QgbGFiZWxzID0gcmVzb2x2ZUxhYmVscyhvcHRpb25zLmxhYmVscyk7XG5cdGNvbnN0IGFkZGl0aW9uYWxGaXh0dXJlcyA9IE9iamVjdC5mcm9tRW50cmllcygob3B0aW9ucy5hZGRpdGlvbmFsVGhlbWVzID8/IFtdKS5tYXAoYWRkaXRpb25hbFRoZW1lID0+IHtcblx0XHRjb25zdCB0aGVtZVZhcmlhbnQgPSBhZGRpdGlvbmFsVGhlbWVWYXJpYW50c1thZGRpdGlvbmFsVGhlbWVdO1xuXHRcdHJldHVybiBbdGhlbWVWYXJpYW50LmxhYmVsLCBjcmVhdGVGaXh0dXJlKHRoZW1lVmFyaWFudCldO1xuXHR9KSk7XG5cdHJldHVybiBkZWZpbmVGaXh0dXJlVmFyaWFudHMobGFiZWxzLmxlbmd0aCA+IDAgPyB7IGxhYmVscyB9IDoge30sIHtcblx0XHREYXJrOiBjcmVhdGVGaXh0dXJlKGRhcmtUaGVtZVZhcmlhbnQpLFxuXHRcdExpZ2h0OiBjcmVhdGVGaXh0dXJlKGxpZ2h0VGhlbWVWYXJpYW50KSxcblx0XHQuLi5hZGRpdGlvbmFsRml4dHVyZXMsXG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgVGhlbWVkRml4dHVyZUdyb3VwT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHBhdGg/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVscz86IFRoZW1lZEZpeHR1cmVHcm91cExhYmVscztcbn1cblxudHlwZSBUaGVtZWRGaXh0dXJlR3JvdXBGaXh0dXJlcyA9IFJlY29yZDxzdHJpbmcsIFRoZW1lZEZpeHR1cmVzIHwgUmV0dXJuVHlwZTx0eXBlb2YgZGVmaW5lRml4dHVyZUdyb3VwPj47XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5lc3RlZCBmaXh0dXJlIGdyb3VwIGZyb20gdGhlbWVkIGZpeHR1cmVzLlxuICogRS5nLiwgeyBNZXJnZUVkaXRvcjogeyBEYXJrOiAuLi4sIExpZ2h0OiAuLi4gfSB9IGJlY29tZXMgYSBuZXN0ZWQgZ3JvdXA6IE1lcmdlRWRpdG9yID4gRGFyay9MaWdodFxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKG9wdGlvbnM6IFRoZW1lZEZpeHR1cmVHcm91cE9wdGlvbnMsIGZpeHR1cmVzOiBUaGVtZWRGaXh0dXJlR3JvdXBGaXh0dXJlcyk6IFJldHVyblR5cGU8dHlwZW9mIGRlZmluZUZpeHR1cmVHcm91cD47XG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKGZpeHR1cmVzOiBUaGVtZWRGaXh0dXJlR3JvdXBGaXh0dXJlcyk6IFJldHVyblR5cGU8dHlwZW9mIGRlZmluZUZpeHR1cmVHcm91cD47XG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKG9wdGlvbnNPckZpeHR1cmVzOiBUaGVtZWRGaXh0dXJlR3JvdXBPcHRpb25zIHwgVGhlbWVkRml4dHVyZUdyb3VwRml4dHVyZXMsIGZpeHR1cmVzPzogVGhlbWVkRml4dHVyZUdyb3VwRml4dHVyZXMpOiBSZXR1cm5UeXBlPHR5cGVvZiBkZWZpbmVGaXh0dXJlR3JvdXA+IHtcblx0aWYgKGZpeHR1cmVzKSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IG9wdGlvbnNPckZpeHR1cmVzIGFzIFRoZW1lZEZpeHR1cmVHcm91cE9wdGlvbnM7XG5cdFx0cmV0dXJuIGRlZmluZUZpeHR1cmVHcm91cCh7XG5cdFx0XHRsYWJlbHM6IHJlc29sdmVMYWJlbHMob3B0aW9ucy5sYWJlbHMpLFxuXHRcdFx0cGF0aDogb3B0aW9ucy5wYXRoLFxuXHRcdH0sIGZpeHR1cmVzIGFzIFRoZW1lZEZpeHR1cmVHcm91cEZpeHR1cmVzKTtcblx0fVxuXHRyZXR1cm4gZGVmaW5lRml4dHVyZUdyb3VwKG9wdGlvbnNPckZpeHR1cmVzIGFzIFRoZW1lZEZpeHR1cmVHcm91cEZpeHR1cmVzKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBUyxlQUFlLG9CQUFvQiw2QkFBNkI7QUFDekUsU0FBUyxpQkFBaUIsbUJBQTRDLHNCQUFzQixvQkFBb0I7QUFDaEgsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMEJBQTBCO0FBRW5DLE9BQU87QUFDUCxPQUFPO0FBS1AsT0FBTztBQUdQLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQXNCLHFCQUFxQjtBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2Qiw0QkFBNEIsK0JBQXlEO0FBRzNILFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWTtBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQixnQ0FBZ0M7QUFDcEUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxpQ0FBaUMsc0NBQXNDO0FBQ2hGLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0NB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
