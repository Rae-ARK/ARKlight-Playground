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
import { localize } from "../../../../nls.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { IExtensionManagementService, IGlobalExtensionEnablementService, ENABLED_EXTENSIONS_STORAGE_PATH, DISABLED_EXTENSIONS_STORAGE_PATH, InstallOperation, IAllowedExtensionsService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IWorkbenchExtensionManagementService, ExtensionInstallLocation } from "../common/extensionManagement.js";
import { areSameExtensions, BetterMergeId, getExtensionDependencies, isMalicious } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { ExtensionType, isAuthenticationProviderExtension, isLanguagePackExtension, isResolverExtension } from "../../../../platform/extensions/common/extensions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { StorageManager } from "../../../../platform/extensionManagement/common/extensionEnablementService.js";
import { webWorkerExtHostConfig } from "../../extensions/common/extensions.js";
import { IUserDataSyncAccountService } from "../../../../platform/userDataSync/common/userDataSyncAccount.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../host/browser/host.js";
import { IExtensionBisectService } from "./extensionBisect.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IExtensionManifestPropertiesService } from "../../extensions/common/extensionManifestPropertiesService.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { equals } from "../../../../base/common/arrays.js";
import { isString } from "../../../../base/common/types.js";
import { Delayer } from "../../../../base/common/async.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IChatEntitlementService } from "../../chat/common/chatEntitlementService.js";
import { IDefaultAccountService } from "../../../../platform/defaultAccount/common/defaultAccount.js";
const SOURCE = "IWorkbenchExtensionEnablementService";
const EXTENSION_UNIFICATION_SETTING = "chat.extensionUnification.enabled";
const MALICIOUS_EXTENSIONS_STORAGE_KEY = "extensionsEnablement/malicious";
let ExtensionEnablementService = class extends Disposable {
  constructor(storageService, globalExtensionEnablementService, contextService, environmentService, extensionManagementService, configurationService, extensionManagementServerService, userDataSyncEnablementService, defaultAccountService, userDataSyncAccountService, lifecycleService, notificationService, hostService, extensionBisectService, allowedExtensionsService, workspaceTrustManagementService, workspaceTrustRequestService, extensionManifestPropertiesService, chatEntitlementService, instantiationService, logService, productService) {
    super();
    this.storageService = storageService;
    this.globalExtensionEnablementService = globalExtensionEnablementService;
    this.contextService = contextService;
    this.environmentService = environmentService;
    this.extensionManagementService = extensionManagementService;
    this.configurationService = configurationService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.defaultAccountService = defaultAccountService;
    this.userDataSyncAccountService = userDataSyncAccountService;
    this.lifecycleService = lifecycleService;
    this.notificationService = notificationService;
    this.extensionBisectService = extensionBisectService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.chatEntitlementService = chatEntitlementService;
    this.logService = logService;
    this._onEnablementChanged = this._register(new Emitter());
    this.onEnablementChanged = this._onEnablementChanged.event;
    this.extensionsDisabledExtensions = [];
    this.delayer = this._register(new Delayer(0));
    this.storageManager = this._register(new StorageManager(storageService));
    const uninstallDisposable = this._register(Event.filter(extensionManagementService.onDidUninstallExtension, (e) => !e.error)(({ identifier }) => this._reset(identifier)));
    let isDisposed = false;
    this._register(toDisposable(() => isDisposed = true));
    this.extensionsManager = this._register(instantiationService.createInstance(ExtensionsManager));
    this.extensionsManager.whenInitialized().then(() => {
      if (!isDisposed) {
        uninstallDisposable.dispose();
        this._onDidChangeExtensions([], [], false);
        this._register(this.extensionsManager.onDidChangeExtensions(({ added, removed, isProfileSwitch }) => this._onDidChangeExtensions(added, removed, isProfileSwitch)));
        this.loopCheckForMaliciousExtensions();
      }
    });
    this._register(this.globalExtensionEnablementService.onDidChangeEnablement(({ extensions, source }) => this._onDidChangeGloballyDisabledExtensions(extensions, source)));
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this._onDidChangeExtensions([], [], false)));
    this._register(this.storageService.onDidChangeValue(StorageScope.APPLICATION, MALICIOUS_EXTENSIONS_STORAGE_KEY, this._store)(() => this._maliciousExtensionsCache = void 0));
    this._completionsExtensionId = productService.defaultChatAgent?.extensionId.toLowerCase();
    this._chatExtensionId = productService.defaultChatAgent?.chatExtensionId.toLowerCase();
    this._sessionsWindowAllowedExtensions = new Set((productService.sessionsWindowAllowedExtensions ?? []).map((id) => id.toLowerCase()));
    const unificationExtensions = [this._completionsExtensionId, this._chatExtensionId].filter((id) => !!id);
    if (isWeb && this.environmentService.remoteAuthority === void 0) {
      this._extensionUnificationEnabled = false;
    } else {
      this._extensionUnificationEnabled = this.configurationService.getValue(EXTENSION_UNIFICATION_SETTING);
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(EXTENSION_UNIFICATION_SETTING)) {
        const extensionUnificationEnabled = this.configurationService.getValue(EXTENSION_UNIFICATION_SETTING);
        if (!extensionUnificationEnabled) {
          this._extensionUnificationEnabled = false;
          this._onEnablementChanged.fire(this.extensionsManager.extensions.filter((ext) => unificationExtensions.includes(ext.identifier.id.toLowerCase())));
        }
      }
    }));
    if (this.allUserExtensionsDisabled) {
      this.lifecycleService.when(LifecyclePhase.Eventually).then(() => {
        this.notificationService.prompt(Severity.Info, localize("extensionsDisabled", "All installed extensions are temporarily disabled."), [{
          label: localize("Reload", "Reload and Enable Extensions"),
          run: () => hostService.reload({ disableExtensions: false })
        }], {
          sticky: true,
          priority: NotificationPriority.URGENT
        });
      });
    }
    this.ensureChatExtensionInitialDisabledState();
  }
  ensureChatExtensionInitialDisabledState() {
    if (!this._chatExtensionId || this.environmentService.isSessionsWindow || this.environmentService.skipBuiltinExtensions?.some((id) => id.toLowerCase() === this._chatExtensionId)) {
      return;
    }
    const builtinChatExtensionEnablementMigrationKey = "builtinChatExtensionEnablementMigration";
    const builtinChatExtensionEnablementMigration = this.storageService.getBoolean(builtinChatExtensionEnablementMigrationKey, StorageScope.PROFILE) === true;
    if (builtinChatExtensionEnablementMigration) {
      return;
    }
    this.logService.debug("Running builtin chat extension enablement migration");
    this.storageService.store(builtinChatExtensionEnablementMigrationKey, true, StorageScope.PROFILE, StorageTarget.MACHINE);
    const context = this.chatEntitlementService.context;
    if (context) {
      if (context.value.state.completed) {
        if (this._isDisabledGlobally({ id: this._chatExtensionId })) {
          if (this.configurationService.getValue(ChatAIDisabledSettingId) !== true) {
            this.logService.debug("Disabling AI features because builtin chat extension is disabled");
            this.configurationService.updateValue(ChatAIDisabledSettingId, true).catch((err) => this.logService.error("Failed to update chat.disableAIFeatures setting during builtin chat extension enablement migration", err));
          }
        }
      } else {
        try {
          this.logService.debug("Disabling builtin chat extension as chat set up is not completed");
          this._disableExtension({ id: this._chatExtensionId });
        } catch (error) {
          this.logService.error("Failed to disable builtin chat extension during enablement migration", error);
        }
      }
    }
  }
  get hasWorkspace() {
    return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  get allUserExtensionsDisabled() {
    return this.environmentService.disableExtensions === true;
  }
  getEnablementState(extension) {
    return this._computeEnablementState(extension, this.extensionsManager.extensions, this.getWorkspaceType());
  }
  getEnablementStates(extensions, workspaceTypeOverrides = {}) {
    const extensionsEnablements = /* @__PURE__ */ new Map();
    const workspaceType = { ...this.getWorkspaceType(), ...workspaceTypeOverrides };
    return extensions.map((extension) => this._computeEnablementState(extension, extensions, workspaceType, extensionsEnablements));
  }
  getDependenciesEnablementStates(extension) {
    return getExtensionDependencies(this.extensionsManager.extensions, extension).map((e) => [e, this.getEnablementState(e)]);
  }
  canChangeEnablement(extension) {
    try {
      this.throwErrorIfCannotChangeEnablement(extension);
      return true;
    } catch (error) {
      return false;
    }
  }
  canChangeWorkspaceEnablement(extension) {
    if (!this.canChangeEnablement(extension)) {
      return false;
    }
    try {
      this.throwErrorIfCannotChangeWorkspaceEnablement(extension);
      return true;
    } catch (error) {
      return false;
    }
  }
  isDefaultOrSettingsSyncAuthProviderExtension(manifest) {
    if (!isAuthenticationProviderExtension(manifest)) {
      return false;
    }
    const defaultAccountAuthProvider = this.defaultAccountService.getDefaultAccountAuthenticationProvider();
    if (manifest.contributes.authentication.some((a) => a.id === defaultAccountAuthProvider.id)) {
      return true;
    }
    if (this.userDataSyncEnablementService.isEnabled() && this.userDataSyncAccountService.account && manifest.contributes.authentication.some((a) => a.id === this.userDataSyncAccountService.account.authenticationProviderId)) {
      return true;
    }
    return false;
  }
  throwErrorIfCannotChangeEnablement(extension, donotCheckDependencies) {
    if (isLanguagePackExtension(extension.manifest)) {
      throw new Error(localize("cannot disable language pack extension", "Cannot change enablement of {0} extension because it contributes language packs.", extension.manifest.displayName || extension.identifier.id));
    }
    if (this.isDefaultOrSettingsSyncAuthProviderExtension(extension.manifest)) {
      throw new Error(localize("cannot disable settings sync auth extension", "Cannot change enablement of {0} extension because Settings Sync depends on it.", extension.manifest.displayName || extension.identifier.id));
    }
    if (this._isEnabledInEnv(extension)) {
      throw new Error(localize("cannot change enablement environment", "Cannot change enablement of {0} extension because it is enabled in environment", extension.manifest.displayName || extension.identifier.id));
    }
    this.throwErrorIfEnablementStateCannotBeChanged(extension, this.getEnablementState(extension), donotCheckDependencies);
  }
  throwErrorIfEnablementStateCannotBeChanged(extension, enablementStateOfExtension, donotCheckDependencies) {
    switch (enablementStateOfExtension) {
      case EnablementState.DisabledByEnvironment:
        throw new Error(localize("cannot change disablement environment", "Cannot change enablement of {0} extension because it is disabled in environment", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByMalicious:
        throw new Error(localize("cannot change enablement malicious", "Cannot change enablement of {0} extension because it is malicious", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByVirtualWorkspace:
        throw new Error(localize("cannot change enablement virtual workspace", "Cannot change enablement of {0} extension because it does not support virtual workspaces", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByExtensionKind:
        throw new Error(localize("cannot change enablement extension kind", "Cannot change enablement of {0} extension because of its extension kind", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByAllowlist:
        throw new Error(localize("cannot change disallowed extension enablement", "Cannot change enablement of {0} extension because it is disallowed", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByInvalidExtension:
        throw new Error(localize("cannot change invalid extension enablement", "Cannot change enablement of {0} extension because of it is invalid", extension.manifest.displayName || extension.identifier.id));
      case EnablementState.DisabledByExtensionDependency:
        if (donotCheckDependencies) {
          break;
        }
        for (const dependency of getExtensionDependencies(this.extensionsManager.extensions, extension)) {
          if (this.isEnabled(dependency)) {
            continue;
          }
          throw new Error(localize("cannot change enablement dependency", "Cannot enable '{0}' extension because it depends on '{1}' extension that cannot be enabled", extension.manifest.displayName || extension.identifier.id, dependency.manifest.displayName || dependency.identifier.id));
        }
    }
  }
  throwErrorIfCannotChangeWorkspaceEnablement(extension) {
    if (!this.hasWorkspace) {
      throw new Error(localize("noWorkspace", "No workspace."));
    }
    if (this.isDefaultOrSettingsSyncAuthProviderExtension(extension.manifest)) {
      throw new Error(localize("cannot disable settings sync auth extension in workspace", "Cannot change enablement of {0} extension in workspace because Settings Sync depends on it.", extension.manifest.displayName || extension.identifier.id));
    }
  }
  async setEnablement(extensions, newState) {
    await this.extensionsManager.whenInitialized();
    if (newState === EnablementState.EnabledGlobally || newState === EnablementState.EnabledWorkspace) {
      extensions.push(...this.getExtensionsToEnableRecursively(extensions, this.extensionsManager.extensions, newState, { dependencies: true, pack: true }));
    }
    const workspace = newState === EnablementState.DisabledWorkspace || newState === EnablementState.EnabledWorkspace;
    for (const extension of extensions) {
      if (workspace) {
        this.throwErrorIfCannotChangeWorkspaceEnablement(extension);
      } else {
        this.throwErrorIfCannotChangeEnablement(extension);
      }
    }
    const result = [];
    for (const extension of extensions) {
      const enablementState = this.getEnablementState(extension);
      if (enablementState === EnablementState.DisabledByTrustRequirement || enablementState === EnablementState.DisabledByExtensionDependency && this.getDependenciesEnablementStates(extension).every(([, e]) => this.isEnabledEnablementState(e) || e === EnablementState.DisabledByTrustRequirement)) {
        const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust();
        result.push(trustState ?? false);
      } else {
        result.push(await this._setUserEnablementState(extension, newState));
      }
    }
    const changedExtensions = extensions.filter((e, index) => result[index]);
    if (changedExtensions.length) {
      this._onEnablementChanged.fire(changedExtensions);
    }
    return result;
  }
  getExtensionsToEnableRecursively(extensions, allExtensions, enablementState, options, checked = []) {
    if (!options.dependencies && !options.pack) {
      return [];
    }
    const toCheck = extensions.filter((e) => checked.indexOf(e) === -1);
    if (!toCheck.length) {
      return [];
    }
    for (const extension of toCheck) {
      checked.push(extension);
    }
    const extensionsToEnable = [];
    for (const extension of allExtensions) {
      if (checked.some((e) => areSameExtensions(e.identifier, extension.identifier))) {
        continue;
      }
      const enablementStateOfExtension = this.getEnablementState(extension);
      if (this.isEnabledEnablementState(enablementStateOfExtension)) {
        continue;
      }
      if (enablementStateOfExtension === EnablementState.DisabledByExtensionKind) {
        continue;
      }
      if (extensions.some((e) => options.dependencies && e.manifest.extensionDependencies?.some((id) => areSameExtensions({ id }, extension.identifier)) || options.pack && e.manifest.extensionPack?.some((id) => areSameExtensions({ id }, extension.identifier)))) {
        const index = extensionsToEnable.findIndex((e) => areSameExtensions(e.identifier, extension.identifier));
        if (index === -1) {
          extensionsToEnable.push(extension);
        } else {
          try {
            this.throwErrorIfEnablementStateCannotBeChanged(extension, enablementStateOfExtension, true);
            extensionsToEnable.splice(index, 1, extension);
          } catch (error) {
          }
        }
      }
    }
    if (extensionsToEnable.length) {
      extensionsToEnable.push(...this.getExtensionsToEnableRecursively(extensionsToEnable, allExtensions, enablementState, options, checked));
    }
    return extensionsToEnable;
  }
  _setUserEnablementState(extension, newState) {
    const currentState = this._getUserEnablementState(extension.identifier);
    if (currentState === newState) {
      return Promise.resolve(false);
    }
    switch (newState) {
      case EnablementState.EnabledGlobally:
        this._enableExtension(extension.identifier);
        break;
      case EnablementState.DisabledGlobally:
        this._disableExtension(extension.identifier);
        break;
      case EnablementState.EnabledWorkspace:
        this._enableExtensionInWorkspace(extension.identifier);
        break;
      case EnablementState.DisabledWorkspace:
        this._disableExtensionInWorkspace(extension.identifier);
        break;
    }
    return Promise.resolve(true);
  }
  isEnabled(extension) {
    const enablementState = this.getEnablementState(extension);
    return this.isEnabledEnablementState(enablementState);
  }
  isEnabledEnablementState(enablementState) {
    return enablementState === EnablementState.EnabledByEnvironment || enablementState === EnablementState.EnabledWorkspace || enablementState === EnablementState.EnabledGlobally;
  }
  isDisabledGlobally(extension) {
    return this._isDisabledGlobally(extension.identifier);
  }
  _computeEnablementState(extension, extensions, workspaceType, computedEnablementStates) {
    computedEnablementStates = computedEnablementStates ?? /* @__PURE__ */ new Map();
    let enablementState = computedEnablementStates.get(extension);
    if (enablementState !== void 0) {
      return enablementState;
    }
    if (extension.identifier.id.toLowerCase() === this._chatExtensionId) {
      this.ensureChatExtensionInitialDisabledState();
    }
    enablementState = this._getUserEnablementState(extension.identifier);
    const isEnabled = this.isEnabledEnablementState(enablementState);
    if (isMalicious(extension.identifier, this.getMaliciousExtensionsForCheck())) {
      enablementState = EnablementState.DisabledByMalicious;
    } else if (isEnabled && extension.type === ExtensionType.User && this.allowedExtensionsService.isAllowed(extension) !== true) {
      enablementState = EnablementState.DisabledByAllowlist;
    } else if (isEnabled && !extension.isValid) {
      enablementState = EnablementState.DisabledByInvalidExtension;
    } else if (this.extensionBisectService.isDisabledByBisect(extension)) {
      enablementState = EnablementState.DisabledByEnvironment;
    } else if (this._isDisabledInEnv(extension)) {
      enablementState = EnablementState.DisabledByEnvironment;
    } else if (this._isDisabledByVirtualWorkspace(extension, workspaceType)) {
      enablementState = EnablementState.DisabledByVirtualWorkspace;
    } else if (isEnabled && this._isDisabledByWorkspaceTrust(extension, workspaceType)) {
      enablementState = EnablementState.DisabledByTrustRequirement;
    } else if (this._isDisabledByExtensionKind(extension)) {
      enablementState = EnablementState.DisabledByExtensionKind;
    } else if (this._isDisabledBySessionsWindow(extension)) {
      enablementState = EnablementState.DisabledByEnvironment;
    } else if (isEnabled && this._isDisabledByExtensionDependency(extension, extensions, workspaceType, computedEnablementStates)) {
      enablementState = EnablementState.DisabledByExtensionDependency;
    } else if (this._isDisabledByUnification(extension.identifier)) {
      enablementState = EnablementState.DisabledByUnification;
    } else if (!isEnabled && this._isEnabledInEnv(extension)) {
      enablementState = EnablementState.EnabledByEnvironment;
    }
    computedEnablementStates.set(extension, enablementState);
    return enablementState;
  }
  _isDisabledInEnv(extension) {
    if (this.allUserExtensionsDisabled) {
      return !extension.isBuiltin && !isResolverExtension(extension.manifest, this.environmentService.remoteAuthority);
    }
    const disabledExtensions = this.environmentService.disableExtensions;
    if (Array.isArray(disabledExtensions)) {
      return disabledExtensions.some((id) => areSameExtensions({ id }, extension.identifier));
    }
    if (areSameExtensions({ id: BetterMergeId.value }, extension.identifier)) {
      return true;
    }
    return false;
  }
  _isEnabledInEnv(extension) {
    const enabledExtensions = this.environmentService.enableExtensions;
    if (Array.isArray(enabledExtensions)) {
      return enabledExtensions.some((id) => areSameExtensions({ id }, extension.identifier));
    }
    return false;
  }
  _isDisabledByVirtualWorkspace(extension, workspaceType) {
    if (!workspaceType.virtual) {
      return false;
    }
    if (this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.manifest) !== false) {
      return false;
    }
    if (this.extensionManagementServerService.getExtensionManagementServer(extension) === this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWeb(extension.manifest)) {
      return false;
    }
    return true;
  }
  _isDisabledByExtensionKind(extension) {
    if (this.extensionManagementServerService.remoteExtensionManagementServer || this.extensionManagementServerService.webExtensionManagementServer) {
      const installLocation = this.extensionManagementServerService.getExtensionInstallLocation(extension);
      for (const extensionKind of this.extensionManifestPropertiesService.getExtensionKind(extension.manifest)) {
        if (extensionKind === "ui") {
          if (installLocation === ExtensionInstallLocation.Local) {
            return false;
          }
        }
        if (extensionKind === "workspace") {
          if (installLocation === ExtensionInstallLocation.Remote) {
            return false;
          }
        }
        if (extensionKind === "web") {
          if (this.extensionManagementServerService.webExtensionManagementServer) {
            if (installLocation === ExtensionInstallLocation.Web || installLocation === ExtensionInstallLocation.Remote) {
              return false;
            }
          } else if (installLocation === ExtensionInstallLocation.Local) {
            const enableLocalWebWorker = this.configurationService.getValue(webWorkerExtHostConfig);
            if (enableLocalWebWorker === true || enableLocalWebWorker === "auto") {
              return false;
            }
          }
        }
      }
      return true;
    }
    return false;
  }
  _isDisabledByWorkspaceTrust(extension, workspaceType) {
    if (workspaceType.trusted) {
      return false;
    }
    if (this.contextService.isInsideWorkspace(extension.location)) {
      return true;
    }
    return this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.manifest) === false;
  }
  _isDisabledByExtensionDependency(extension, extensions, workspaceType, computedEnablementStates) {
    if (!extension.manifest.extensionDependencies) {
      return false;
    }
    const dependencyExtensions = extensions.filter((e) => extension.manifest.extensionDependencies?.some((id) => areSameExtensions(e.identifier, { id }) && (this.extensionManagementServerService.getExtensionManagementServer(e) === this.extensionManagementServerService.getExtensionManagementServer(extension) || (e.manifest.main || e.manifest.browser) && e.manifest.api === "none")));
    if (!dependencyExtensions.length) {
      return false;
    }
    const hasEnablementState = computedEnablementStates.has(extension);
    if (!hasEnablementState) {
      computedEnablementStates.set(extension, EnablementState.EnabledGlobally);
    }
    try {
      for (const dependencyExtension of dependencyExtensions) {
        const enablementState = this._computeEnablementState(dependencyExtension, extensions, workspaceType, computedEnablementStates);
        if (!this.isEnabledEnablementState(enablementState) && enablementState !== EnablementState.DisabledByExtensionKind) {
          return true;
        }
      }
    } finally {
      if (!hasEnablementState) {
        computedEnablementStates.delete(extension);
      }
    }
    return false;
  }
  _getUserEnablementState(identifier) {
    if (this.hasWorkspace) {
      if (this._getWorkspaceEnabledExtensions().filter((e) => areSameExtensions(e, identifier))[0]) {
        return EnablementState.EnabledWorkspace;
      }
      if (this._getWorkspaceDisabledExtensions().filter((e) => areSameExtensions(e, identifier))[0]) {
        return EnablementState.DisabledWorkspace;
      }
    }
    if (this._isDisabledGlobally(identifier)) {
      return EnablementState.DisabledGlobally;
    }
    return EnablementState.EnabledGlobally;
  }
  _isDisabledGlobally(identifier) {
    return this.globalExtensionEnablementService.getDisabledExtensions().some((e) => areSameExtensions(e, identifier));
  }
  _isDisabledByUnification(identifier) {
    return this._extensionUnificationEnabled && identifier.id.toLowerCase() === this._completionsExtensionId;
  }
  _isDisabledBySessionsWindow(extension) {
    if (!this.environmentService.isSessionsWindow) {
      return false;
    }
    if (this._sessionsWindowAllowedExtensions.has(extension.identifier.id.toLowerCase())) {
      return false;
    }
    if (extension.isBuiltin) {
      if (extension.identifier.id.toLowerCase() === this._chatExtensionId) {
        return false;
      }
      const contributes = extension.manifest.contributes;
      if (contributes?.debuggers || contributes?.views || contributes?.viewsContainers || contributes?.walkthroughs) {
        return true;
      }
      return false;
    }
    return !this.extensionManifestPropertiesService.canExecuteOnSessionsWindow(extension.manifest);
  }
  _enableExtension(identifier) {
    this._removeFromWorkspaceDisabledExtensions(identifier);
    this._removeFromWorkspaceEnabledExtensions(identifier);
    return this.globalExtensionEnablementService.enableExtension(identifier, SOURCE);
  }
  _disableExtension(identifier) {
    this._removeFromWorkspaceDisabledExtensions(identifier);
    this._removeFromWorkspaceEnabledExtensions(identifier);
    return this.globalExtensionEnablementService.disableExtension(identifier, SOURCE);
  }
  _enableExtensionInWorkspace(identifier) {
    this._removeFromWorkspaceDisabledExtensions(identifier);
    this._addToWorkspaceEnabledExtensions(identifier);
  }
  _disableExtensionInWorkspace(identifier) {
    this._addToWorkspaceDisabledExtensions(identifier);
    this._removeFromWorkspaceEnabledExtensions(identifier);
  }
  _addToWorkspaceDisabledExtensions(identifier) {
    if (!this.hasWorkspace) {
      return Promise.resolve(false);
    }
    const disabledExtensions = this._getWorkspaceDisabledExtensions();
    if (disabledExtensions.every((e) => !areSameExtensions(e, identifier))) {
      disabledExtensions.push(identifier);
      this._setDisabledExtensions(disabledExtensions);
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }
  async _removeFromWorkspaceDisabledExtensions(identifier) {
    if (!this.hasWorkspace) {
      return false;
    }
    const disabledExtensions = this._getWorkspaceDisabledExtensions();
    for (let index = 0; index < disabledExtensions.length; index++) {
      const disabledExtension = disabledExtensions[index];
      if (areSameExtensions(disabledExtension, identifier)) {
        disabledExtensions.splice(index, 1);
        this._setDisabledExtensions(disabledExtensions);
        return true;
      }
    }
    return false;
  }
  _addToWorkspaceEnabledExtensions(identifier) {
    if (!this.hasWorkspace) {
      return false;
    }
    const enabledExtensions = this._getWorkspaceEnabledExtensions();
    if (enabledExtensions.every((e) => !areSameExtensions(e, identifier))) {
      enabledExtensions.push(identifier);
      this._setEnabledExtensions(enabledExtensions);
      return true;
    }
    return false;
  }
  _removeFromWorkspaceEnabledExtensions(identifier) {
    if (!this.hasWorkspace) {
      return false;
    }
    const enabledExtensions = this._getWorkspaceEnabledExtensions();
    for (let index = 0; index < enabledExtensions.length; index++) {
      const disabledExtension = enabledExtensions[index];
      if (areSameExtensions(disabledExtension, identifier)) {
        enabledExtensions.splice(index, 1);
        this._setEnabledExtensions(enabledExtensions);
        return true;
      }
    }
    return false;
  }
  _getWorkspaceEnabledExtensions() {
    return this._getExtensions(ENABLED_EXTENSIONS_STORAGE_PATH);
  }
  _setEnabledExtensions(enabledExtensions) {
    this._setExtensions(ENABLED_EXTENSIONS_STORAGE_PATH, enabledExtensions);
  }
  _getWorkspaceDisabledExtensions() {
    return this._getExtensions(DISABLED_EXTENSIONS_STORAGE_PATH);
  }
  _setDisabledExtensions(disabledExtensions) {
    this._setExtensions(DISABLED_EXTENSIONS_STORAGE_PATH, disabledExtensions);
  }
  _getExtensions(storageId) {
    if (!this.hasWorkspace) {
      return [];
    }
    return this.storageManager.get(storageId, StorageScope.WORKSPACE);
  }
  _setExtensions(storageId, extensions) {
    this.storageManager.set(storageId, extensions, StorageScope.WORKSPACE);
  }
  async _onDidChangeGloballyDisabledExtensions(extensionIdentifiers, source) {
    if (source !== SOURCE) {
      await this.extensionsManager.whenInitialized();
      const extensions = this.extensionsManager.extensions.filter((installedExtension) => extensionIdentifiers.some((identifier) => areSameExtensions(identifier, installedExtension.identifier)));
      this._onEnablementChanged.fire(extensions);
    }
  }
  _onDidChangeExtensions(added, removed, isProfileSwitch) {
    const changedExtensions = added.filter((e) => !this.isEnabledEnablementState(this.getEnablementState(e)));
    const existingDisabledExtensions = this.extensionsDisabledExtensions;
    this.extensionsDisabledExtensions = this.extensionsManager.extensions.filter((extension) => {
      const enablementState = this.getEnablementState(extension);
      return enablementState === EnablementState.DisabledByExtensionDependency || enablementState === EnablementState.DisabledByAllowlist || enablementState === EnablementState.DisabledByMalicious;
    });
    for (const extension of existingDisabledExtensions) {
      if (this.extensionsDisabledExtensions.every((e) => !areSameExtensions(e.identifier, extension.identifier))) {
        changedExtensions.push(extension);
      }
    }
    for (const extension of this.extensionsDisabledExtensions) {
      if (existingDisabledExtensions.every((e) => !areSameExtensions(e.identifier, extension.identifier))) {
        changedExtensions.push(extension);
      }
    }
    if (changedExtensions.length) {
      this._onEnablementChanged.fire(changedExtensions);
    }
    if (!isProfileSwitch) {
      removed.forEach(({ identifier }) => this._reset(identifier));
    }
  }
  async updateExtensionsEnablementsWhenWorkspaceTrustChanges() {
    await this.extensionsManager.whenInitialized();
    const computeEnablementStates = (workspaceType2) => {
      const extensionsEnablements = /* @__PURE__ */ new Map();
      return this.extensionsManager.extensions.map((extension) => [extension, this._computeEnablementState(extension, this.extensionsManager.extensions, workspaceType2, extensionsEnablements)]);
    };
    const workspaceType = this.getWorkspaceType();
    const enablementStatesWithTrustedWorkspace = computeEnablementStates({ ...workspaceType, trusted: true });
    const enablementStatesWithUntrustedWorkspace = computeEnablementStates({ ...workspaceType, trusted: false });
    const enablementChangedExtensionsBecauseOfTrust = enablementStatesWithTrustedWorkspace.filter(([, enablementState], index) => enablementState !== enablementStatesWithUntrustedWorkspace[index][1]).map(([extension]) => extension);
    if (enablementChangedExtensionsBecauseOfTrust.length) {
      this._onEnablementChanged.fire(enablementChangedExtensionsBecauseOfTrust);
    }
  }
  getWorkspaceType() {
    return { trusted: this.workspaceTrustManagementService.isWorkspaceTrusted(), virtual: isVirtualWorkspace(this.contextService.getWorkspace()) };
  }
  _reset(extension) {
    this._removeFromWorkspaceDisabledExtensions(extension);
    this._removeFromWorkspaceEnabledExtensions(extension);
    this.globalExtensionEnablementService.enableExtension(extension);
  }
  loopCheckForMaliciousExtensions() {
    this.checkForMaliciousExtensions().then(() => this.delayer.trigger(() => {
    }, 1e3 * 60 * 5)).then(() => this.loopCheckForMaliciousExtensions());
  }
  async checkForMaliciousExtensions() {
    try {
      const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
      const changed = this.storeMaliciousExtensions(extensionsControlManifest.malicious.map(({ extensionOrPublisher }) => extensionOrPublisher));
      if (changed) {
        this._onDidChangeExtensions([], [], false);
      }
    } catch (err) {
      this.logService.error(err);
    }
  }
  getMaliciousExtensions() {
    return this.storageService.getObject(MALICIOUS_EXTENSIONS_STORAGE_KEY, StorageScope.APPLICATION, []);
  }
  getMaliciousExtensionsForCheck() {
    if (!this._maliciousExtensionsCache) {
      this._maliciousExtensionsCache = this.getMaliciousExtensions().map((extensionOrPublisher) => ({ extensionOrPublisher }));
    }
    return this._maliciousExtensionsCache;
  }
  storeMaliciousExtensions(extensions) {
    const existing = this.getMaliciousExtensions();
    if (equals(existing, extensions, (a, b) => !isString(a) && !isString(b) ? areSameExtensions(a, b) : a === b)) {
      return false;
    }
    this._maliciousExtensionsCache = void 0;
    this.storageService.store(MALICIOUS_EXTENSIONS_STORAGE_KEY, JSON.stringify(extensions), StorageScope.APPLICATION, StorageTarget.MACHINE);
    return true;
  }
};
ExtensionEnablementService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, IGlobalExtensionEnablementService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IExtensionManagementService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IExtensionManagementServerService),
  __decorateParam(7, IUserDataSyncEnablementService),
  __decorateParam(8, IDefaultAccountService),
  __decorateParam(9, IUserDataSyncAccountService),
  __decorateParam(10, ILifecycleService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IHostService),
  __decorateParam(13, IExtensionBisectService),
  __decorateParam(14, IAllowedExtensionsService),
  __decorateParam(15, IWorkspaceTrustManagementService),
  __decorateParam(16, IWorkspaceTrustRequestService),
  __decorateParam(17, IExtensionManifestPropertiesService),
  __decorateParam(18, IChatEntitlementService),
  __decorateParam(19, IInstantiationService),
  __decorateParam(20, ILogService),
  __decorateParam(21, IProductService)
], ExtensionEnablementService);
let ExtensionsManager = class extends Disposable {
  constructor(extensionManagementService, extensionManagementServerService, logService) {
    super();
    this.extensionManagementService = extensionManagementService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.logService = logService;
    this._extensions = [];
    this._onDidChangeExtensions = this._register(new Emitter());
    this.onDidChangeExtensions = this._onDidChangeExtensions.event;
    this.disposed = false;
    this._register(toDisposable(() => this.disposed = true));
    this.initializePromise = this.initialize();
  }
  get extensions() {
    return this._extensions;
  }
  whenInitialized() {
    return this.initializePromise;
  }
  async initialize() {
    try {
      this._extensions = [
        ...await this.extensionManagementService.getInstalled(),
        ...await this.extensionManagementService.getInstalledWorkspaceExtensions(true)
      ];
      if (this.disposed) {
        return;
      }
      this._onDidChangeExtensions.fire({ added: this.extensions, removed: [], isProfileSwitch: false });
    } catch (error) {
      this.logService.error(error);
    }
    this._register(this.extensionManagementService.onDidInstallExtensions((e) => this.updateExtensions(e.reduce((result, { local, operation }) => {
      if (local && operation !== InstallOperation.Migrate) {
        result.push(local);
      }
      return result;
    }, []), [], void 0, false)));
    this._register(Event.filter(this.extensionManagementService.onDidUninstallExtension, ((e) => !e.error))((e) => this.updateExtensions([], [e.identifier], e.server, false)));
    this._register(this.extensionManagementService.onDidChangeProfile(({ added, removed, server }) => {
      this.updateExtensions(added, removed.map(({ identifier }) => identifier), server, true);
    }));
  }
  updateExtensions(added, identifiers, server, isProfileSwitch) {
    if (added.length) {
      for (const extension of added) {
        const extensionServer = this.extensionManagementServerService.getExtensionManagementServer(extension);
        const index = this._extensions.findIndex((e) => areSameExtensions(e.identifier, extension.identifier) && this.extensionManagementServerService.getExtensionManagementServer(e) === extensionServer);
        if (index !== -1) {
          this._extensions.splice(index, 1);
        }
      }
      this._extensions.push(...added);
    }
    const removed = [];
    for (const identifier of identifiers) {
      const index = this._extensions.findIndex((e) => areSameExtensions(e.identifier, identifier) && this.extensionManagementServerService.getExtensionManagementServer(e) === server);
      if (index !== -1) {
        removed.push(...this._extensions.splice(index, 1));
      }
    }
    if (added.length || removed.length) {
      this._onDidChangeExtensions.fire({ added, removed, isProfileSwitch });
    }
  }
};
ExtensionsManager = __decorateClass([
  __decorateParam(0, IWorkbenchExtensionManagementService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, ILogService)
], ExtensionsManager);
registerSingleton(IWorkbenchExtensionEnablementService, ExtensionEnablementService, InstantiationType.Delayed);
export {
  ExtensionEnablementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2Jyb3dzZXIvZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElFeHRlbnNpb25JZGVudGlmaWVyLCBJR2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIEVOQUJMRURfRVhURU5TSU9OU19TVE9SQUdFX1BBVEgsIERJU0FCTEVEX0VYVEVOU0lPTlNfU1RPUkFHRV9QQVRILCBJbnN0YWxsT3BlcmF0aW9uLCBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLCBNYWxpY2lvdXNFeHRlbnNpb25JbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIEVuYWJsZW1lbnRTdGF0ZSwgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBFeHRlbnNpb25JbnN0YWxsTG9jYXRpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBhcmVTYW1lRXh0ZW5zaW9ucywgQmV0dGVyTWVyZ2VJZCwgZ2V0RXh0ZW5zaW9uRGVwZW5kZW5jaWVzLCBpc01hbGljaW91cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbiwgSUV4dGVuc2lvbk1hbmlmZXN0LCBpc0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJFeHRlbnNpb24sIGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uLCBpc1Jlc29sdmVyRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBSURpc2FibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hhdC9jb21tb24vY2hhdFNldHRpbmdzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3RvcmFnZU1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyB3ZWJXb3JrZXJFeHRIb3N0Q29uZmlnLCBXZWJXb3JrZXJFeHRIb3N0Q29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jQWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UgfSBmcm9tICcuL2V4dGVuc2lvbkJpc2VjdC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1ZpcnR1YWxXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcblxuY29uc3QgU09VUkNFID0gJ0lXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSc7XG5cbnR5cGUgV29ya3NwYWNlVHlwZSA9IHsgcmVhZG9ubHkgdmlydHVhbDogYm9vbGVhbjsgcmVhZG9ubHkgdHJ1c3RlZDogYm9vbGVhbiB9O1xuXG5jb25zdCBFWFRFTlNJT05fVU5JRklDQVRJT05fU0VUVElORyA9ICdjaGF0LmV4dGVuc2lvblVuaWZpY2F0aW9uLmVuYWJsZWQnO1xuY29uc3QgTUFMSUNJT1VTX0VYVEVOU0lPTlNfU1RPUkFHRV9LRVkgPSAnZXh0ZW5zaW9uc0VuYWJsZW1lbnQvbWFsaWNpb3VzJztcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25FbmFibGVtZW50Q2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElFeHRlbnNpb25bXT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkVuYWJsZW1lbnRDaGFuZ2VkOiBFdmVudDxyZWFkb25seSBJRXh0ZW5zaW9uW10+ID0gdGhpcy5fb25FbmFibGVtZW50Q2hhbmdlZC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgZXh0ZW5zaW9uc01hbmFnZXI6IEV4dGVuc2lvbnNNYW5hZ2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VNYW5hZ2VyOiBTdG9yYWdlTWFuYWdlcjtcblx0cHJpdmF0ZSBleHRlbnNpb25zRGlzYWJsZWRFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMCkpO1xuXG5cdC8vIEV4dGVuc2lvbiB1bmlmaWNhdGlvblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0aW9uc0V4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFeHRlbnNpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9leHRlbnNpb25VbmlmaWNhdGlvbkVuYWJsZWQ6IGJvb2xlYW47XG5cblx0Ly8gU2Vzc2lvbnMgd2luZG93IGFsbG93LWxpc3QgKGxvd2VyY2FzZWQgZXh0ZW5zaW9uIGlkcylcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNXaW5kb3dBbGxvd2VkRXh0ZW5zaW9uczogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblxuXHRwcml2YXRlIF9tYWxpY2lvdXNFeHRlbnNpb25zQ2FjaGU6IFJlYWRvbmx5QXJyYXk8TWFsaWNpb3VzRXh0ZW5zaW9uSW5mbz4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZ2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASURlZmF1bHRBY2NvdW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jQWNjb3VudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNBY2NvdW50U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uQmlzZWN0U2VydmljZTogSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc3RvcmFnZU1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RvcmFnZU1hbmFnZXIoc3RvcmFnZVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHVuaW5zdGFsbERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIoZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxFeHRlbnNpb24sIGUgPT4gIWUuZXJyb3IpKCh7IGlkZW50aWZpZXIgfSkgPT4gdGhpcy5fcmVzZXQoaWRlbnRpZmllcikpKTtcblx0XHRsZXQgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBpc0Rpc3Bvc2VkID0gdHJ1ZSkpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25zTWFuYWdlcikpO1xuXHRcdHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIud2hlbkluaXRpYWxpemVkKCkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoIWlzRGlzcG9zZWQpIHtcblx0XHRcdFx0dW5pbnN0YWxsRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9ucyhbXSwgW10sIGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25zTWFuYWdlci5vbkRpZENoYW5nZUV4dGVuc2lvbnMoKHsgYWRkZWQsIHJlbW92ZWQsIGlzUHJvZmlsZVN3aXRjaCB9KSA9PiB0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnMoYWRkZWQsIHJlbW92ZWQsIGlzUHJvZmlsZVN3aXRjaCkpKTtcblx0XHRcdFx0dGhpcy5sb29wQ2hlY2tGb3JNYWxpY2lvdXNFeHRlbnNpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW5hYmxlbWVudCgoeyBleHRlbnNpb25zLCBzb3VyY2UgfSkgPT4gdGhpcy5fb25EaWRDaGFuZ2VHbG9iYWxseURpc2FibGVkRXh0ZW5zaW9ucyhleHRlbnNpb25zLCBzb3VyY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZSgoKSA9PiB0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnMoW10sIFtdLCBmYWxzZSkpKTtcblxuXHRcdC8vIEludmFsaWRhdGUgdGhlIGNhY2hlZCBtYWxpY2lvdXMgZXh0ZW5zaW9ucyBsaXN0IHdoZW4gdGhlIHN0b3JlZCB2YWx1ZSBjaGFuZ2VzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc3RvcmFnZVNlcnZpY2Uub25EaWRDaGFuZ2VWYWx1ZShTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIE1BTElDSU9VU19FWFRFTlNJT05TX1NUT1JBR0VfS0VZLCB0aGlzLl9zdG9yZSkoKCkgPT4gdGhpcy5fbWFsaWNpb3VzRXh0ZW5zaW9uc0NhY2hlID0gdW5kZWZpbmVkKSk7XG5cblx0XHQvLyBFeHRlbnNpb24gdW5pZmljYXRpb25cblx0XHR0aGlzLl9jb21wbGV0aW9uc0V4dGVuc2lvbklkID0gcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uZXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKTtcblx0XHR0aGlzLl9jaGF0RXh0ZW5zaW9uSWQgPSBwcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQudG9Mb3dlckNhc2UoKTtcblx0XHR0aGlzLl9zZXNzaW9uc1dpbmRvd0FsbG93ZWRFeHRlbnNpb25zID0gbmV3IFNldDxzdHJpbmc+KChwcm9kdWN0U2VydmljZS5zZXNzaW9uc1dpbmRvd0FsbG93ZWRFeHRlbnNpb25zID8/IFtdKS5tYXAoaWQgPT4gaWQudG9Mb3dlckNhc2UoKSkpO1xuXHRcdGNvbnN0IHVuaWZpY2F0aW9uRXh0ZW5zaW9ucyA9IFt0aGlzLl9jb21wbGV0aW9uc0V4dGVuc2lvbklkLCB0aGlzLl9jaGF0RXh0ZW5zaW9uSWRdLmZpbHRlcihpZCA9PiAhIWlkKTtcblxuXHRcdC8vIERpc2FibGluZyBleHRlbnNpb24gdW5pZmljYXRpb24gc2hvdWxkIGltbWVkaWF0ZWx5IGRpc2FibGUgdGhlIHVuaWZpZWQgZXh0ZW5zaW9uIGZsb3dcblx0XHQvLyBFbmFibGluZyBleHRlbnNpb24gdW5pZmljYXRpb24gd2lsbCBvbmx5IHRha2UgZWZmZWN0IGFmdGVyIHJlc3RhcnRcblx0XHQvLyBFeHRlbnNpb24gVW5pZmljYXRpb24gaXMgZGlzYWJsZWQgaW4gd2ViIHdoZW4gdGhlcmUgaXMgbm8gcmVtb3RlIGF1dGhvcml0eVxuXHRcdGlmIChpc1dlYiAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uVW5pZmljYXRpb25FbmFibGVkID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2V4dGVuc2lvblVuaWZpY2F0aW9uRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oRVhURU5TSU9OX1VOSUZJQ0FUSU9OX1NFVFRJTkcpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEVYVEVOU0lPTl9VTklGSUNBVElPTl9TRVRUSU5HKSkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25VbmlmaWNhdGlvbkVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEVYVEVOU0lPTl9VTklGSUNBVElPTl9TRVRUSU5HKTtcblx0XHRcdFx0aWYgKCFleHRlbnNpb25VbmlmaWNhdGlvbkVuYWJsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9leHRlbnNpb25VbmlmaWNhdGlvbkVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9vbkVuYWJsZW1lbnRDaGFuZ2VkLmZpcmUodGhpcy5leHRlbnNpb25zTWFuYWdlci5leHRlbnNpb25zLmZpbHRlcihleHQgPT4gdW5pZmljYXRpb25FeHRlbnNpb25zLmluY2x1ZGVzKGV4dC5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBkZWxheSBub3RpZmljYXRpb24gZm9yIGV4dGVuc2lvbnMgZGlzYWJsZWQgdW50aWwgd29ya2JlbmNoIHJlc3RvcmVkXG5cdFx0aWYgKHRoaXMuYWxsVXNlckV4dGVuc2lvbnNEaXNhYmxlZCkge1xuXHRcdFx0dGhpcy5saWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbG9jYWxpemUoJ2V4dGVuc2lvbnNEaXNhYmxlZCcsIFwiQWxsIGluc3RhbGxlZCBleHRlbnNpb25zIGFyZSB0ZW1wb3JhcmlseSBkaXNhYmxlZC5cIiksIFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdSZWxvYWQnLCBcIlJlbG9hZCBhbmQgRW5hYmxlIEV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBob3N0U2VydmljZS5yZWxvYWQoeyBkaXNhYmxlRXh0ZW5zaW9uczogZmFsc2UgfSlcblx0XHRcdFx0fV0sIHtcblx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuZW5zdXJlQ2hhdEV4dGVuc2lvbkluaXRpYWxEaXNhYmxlZFN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZUNoYXRFeHRlbnNpb25Jbml0aWFsRGlzYWJsZWRTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NoYXRFeHRlbnNpb25JZCB8fCB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93IHx8IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnNraXBCdWlsdGluRXh0ZW5zaW9ucz8uc29tZShpZCA9PiBpZC50b0xvd2VyQ2FzZSgpID09PSB0aGlzLl9jaGF0RXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVpbHRpbkNoYXRFeHRlbnNpb25FbmFibGVtZW50TWlncmF0aW9uS2V5ID0gJ2J1aWx0aW5DaGF0RXh0ZW5zaW9uRW5hYmxlbWVudE1pZ3JhdGlvbic7XG5cdFx0Y29uc3QgYnVpbHRpbkNoYXRFeHRlbnNpb25FbmFibGVtZW50TWlncmF0aW9uID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKGJ1aWx0aW5DaGF0RXh0ZW5zaW9uRW5hYmxlbWVudE1pZ3JhdGlvbktleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpID09PSB0cnVlO1xuXHRcdGlmIChidWlsdGluQ2hhdEV4dGVuc2lvbkVuYWJsZW1lbnRNaWdyYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1J1bm5pbmcgYnVpbHRpbiBjaGF0IGV4dGVuc2lvbiBlbmFibGVtZW50IG1pZ3JhdGlvbicpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoYnVpbHRpbkNoYXRFeHRlbnNpb25FbmFibGVtZW50TWlncmF0aW9uS2V5LCB0cnVlLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRjb25zdCBjb250ZXh0ID0gKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZSBhcyBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlKS5jb250ZXh0O1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRpZiAoY29udGV4dC52YWx1ZS5zdGF0ZS5jb21wbGV0ZWQpIHtcblx0XHRcdFx0Ly8gVXNlciBoYXMgdXNlZCBjaGF0IGZlYXR1cmVzIGJlZm9yZVxuXHRcdFx0XHRpZiAodGhpcy5faXNEaXNhYmxlZEdsb2JhbGx5KHsgaWQ6IHRoaXMuX2NoYXRFeHRlbnNpb25JZCB9KSkge1xuXHRcdFx0XHRcdC8vIFVzZXIgaGFkIHNwZWNpZmljYWxseSBkaXNhYmxlZCB0aGUgY2hhdCBleHRlbnNpb24gdG8gZGlzYWJsZSBBSSBmZWF0dXJlc1xuXHRcdFx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKENoYXRBSURpc2FibGVkU2V0dGluZ0lkKSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0Ly8gSG9ub3IgdGhhdCBjaG9pY2UgYnkgZGlzYWJsaW5nIEFJIGZlYXR1cmVzXG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0Rpc2FibGluZyBBSSBmZWF0dXJlcyBiZWNhdXNlIGJ1aWx0aW4gY2hhdCBleHRlbnNpb24gaXMgZGlzYWJsZWQnKTtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIHRydWUpXG5cdFx0XHRcdFx0XHRcdC5jYXRjaChlcnIgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gdXBkYXRlIGNoYXQuZGlzYWJsZUFJRmVhdHVyZXMgc2V0dGluZyBkdXJpbmcgYnVpbHRpbiBjaGF0IGV4dGVuc2lvbiBlbmFibGVtZW50IG1pZ3JhdGlvbicsIGVycikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBVc2VyIGhhcyBub3QgdXNlZCBjaGF0IGZlYXR1cmVzIGJlZm9yZSBzbyBhdm9pZCBhY3RpdmF0aW5nIHRoZSBjaGF0IGV4dGVuc2lvbiBieSBkaXNhYmxpbmcgaXRcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0Rpc2FibGluZyBidWlsdGluIGNoYXQgZXh0ZW5zaW9uIGFzIGNoYXQgc2V0IHVwIGlzIG5vdCBjb21wbGV0ZWQnKTtcblx0XHRcdFx0XHR0aGlzLl9kaXNhYmxlRXh0ZW5zaW9uKHsgaWQ6IHRoaXMuX2NoYXRFeHRlbnNpb25JZCB9KTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBkaXNhYmxlIGJ1aWx0aW4gY2hhdCBleHRlbnNpb24gZHVyaW5nIGVuYWJsZW1lbnQgbWlncmF0aW9uJywgZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgaGFzV29ya3NwYWNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgYWxsVXNlckV4dGVuc2lvbnNEaXNhYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZGlzYWJsZUV4dGVuc2lvbnMgPT09IHRydWU7XG5cdH1cblxuXHRnZXRFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogRW5hYmxlbWVudFN0YXRlIHtcblx0XHRyZXR1cm4gdGhpcy5fY29tcHV0ZUVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24sIHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIuZXh0ZW5zaW9ucywgdGhpcy5nZXRXb3Jrc3BhY2VUeXBlKCkpO1xuXHR9XG5cblx0Z2V0RW5hYmxlbWVudFN0YXRlcyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10sIHdvcmtzcGFjZVR5cGVPdmVycmlkZXM6IFBhcnRpYWw8V29ya3NwYWNlVHlwZT4gPSB7fSk6IEVuYWJsZW1lbnRTdGF0ZVtdIHtcblx0XHRjb25zdCBleHRlbnNpb25zRW5hYmxlbWVudHMgPSBuZXcgTWFwPElFeHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZT4oKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VUeXBlID0geyAuLi50aGlzLmdldFdvcmtzcGFjZVR5cGUoKSwgLi4ud29ya3NwYWNlVHlwZU92ZXJyaWRlcyB9O1xuXHRcdHJldHVybiBleHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gdGhpcy5fY29tcHV0ZUVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24sIGV4dGVuc2lvbnMsIHdvcmtzcGFjZVR5cGUsIGV4dGVuc2lvbnNFbmFibGVtZW50cykpO1xuXHR9XG5cblx0Z2V0RGVwZW5kZW5jaWVzRW5hYmxlbWVudFN0YXRlcyhleHRlbnNpb246IElFeHRlbnNpb24pOiBbSUV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlXVtdIHtcblx0XHRyZXR1cm4gZ2V0RXh0ZW5zaW9uRGVwZW5kZW5jaWVzKHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIuZXh0ZW5zaW9ucywgZXh0ZW5zaW9uKS5tYXAoZSA9PiBbZSwgdGhpcy5nZXRFbmFibGVtZW50U3RhdGUoZSldKTtcblx0fVxuXG5cdGNhbkNoYW5nZUVuYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMudGhyb3dFcnJvcklmQ2Fubm90Q2hhbmdlRW5hYmxlbWVudChleHRlbnNpb24pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRjYW5DaGFuZ2VXb3Jrc3BhY2VFbmFibGVtZW50KGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5jYW5DaGFuZ2VFbmFibGVtZW50KGV4dGVuc2lvbikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy50aHJvd0Vycm9ySWZDYW5ub3RDaGFuZ2VXb3Jrc3BhY2VFbmFibGVtZW50KGV4dGVuc2lvbik7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNEZWZhdWx0T3JTZXR0aW5nc1N5bmNBdXRoUHJvdmlkZXJFeHRlbnNpb24obWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdGlmICghaXNBdXRoZW50aWNhdGlvblByb3ZpZGVyRXh0ZW5zaW9uKG1hbmlmZXN0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmF1bHRBY2NvdW50QXV0aFByb3ZpZGVyID0gdGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCk7XG5cdFx0aWYgKG1hbmlmZXN0LmNvbnRyaWJ1dGVzIS5hdXRoZW50aWNhdGlvbiEuc29tZShhID0+IGEuaWQgPT09IGRlZmF1bHRBY2NvdW50QXV0aFByb3ZpZGVyLmlkKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkgJiYgdGhpcy51c2VyRGF0YVN5bmNBY2NvdW50U2VydmljZS5hY2NvdW50ICYmXG5cdFx0XHRtYW5pZmVzdC5jb250cmlidXRlcyEuYXV0aGVudGljYXRpb24hLnNvbWUoYSA9PiBhLmlkID09PSB0aGlzLnVzZXJEYXRhU3luY0FjY291bnRTZXJ2aWNlLmFjY291bnQhLmF1dGhlbnRpY2F0aW9uUHJvdmlkZXJJZCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgdGhyb3dFcnJvcklmQ2Fubm90Q2hhbmdlRW5hYmxlbWVudChleHRlbnNpb246IElFeHRlbnNpb24sIGRvbm90Q2hlY2tEZXBlbmRlbmNpZXM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKGV4dGVuc2lvbi5tYW5pZmVzdCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGRpc2FibGUgbGFuZ3VhZ2UgcGFjayBleHRlbnNpb24nLCBcIkNhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBvZiB7MH0gZXh0ZW5zaW9uIGJlY2F1c2UgaXQgY29udHJpYnV0ZXMgbGFuZ3VhZ2UgcGFja3MuXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzRGVmYXVsdE9yU2V0dGluZ3NTeW5jQXV0aFByb3ZpZGVyRXh0ZW5zaW9uKGV4dGVuc2lvbi5tYW5pZmVzdCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGRpc2FibGUgc2V0dGluZ3Mgc3luYyBhdXRoIGV4dGVuc2lvbicsIFwiQ2Fubm90IGNoYW5nZSBlbmFibGVtZW50IG9mIHswfSBleHRlbnNpb24gYmVjYXVzZSBTZXR0aW5ncyBTeW5jIGRlcGVuZHMgb24gaXQuXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc0VuYWJsZWRJbkVudihleHRlbnNpb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2Nhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBlbnZpcm9ubWVudCcsIFwiQ2Fubm90IGNoYW5nZSBlbmFibGVtZW50IG9mIHswfSBleHRlbnNpb24gYmVjYXVzZSBpdCBpcyBlbmFibGVkIGluIGVudmlyb25tZW50XCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdH1cblxuXHRcdHRoaXMudGhyb3dFcnJvcklmRW5hYmxlbWVudFN0YXRlQ2Fubm90QmVDaGFuZ2VkKGV4dGVuc2lvbiwgdGhpcy5nZXRFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uKSwgZG9ub3RDaGVja0RlcGVuZGVuY2llcyk7XG5cdH1cblxuXHRwcml2YXRlIHRocm93RXJyb3JJZkVuYWJsZW1lbnRTdGF0ZUNhbm5vdEJlQ2hhbmdlZChleHRlbnNpb246IElFeHRlbnNpb24sIGVuYWJsZW1lbnRTdGF0ZU9mRXh0ZW5zaW9uOiBFbmFibGVtZW50U3RhdGUsIGRvbm90Q2hlY2tEZXBlbmRlbmNpZXM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3dpdGNoIChlbmFibGVtZW50U3RhdGVPZkV4dGVuc2lvbikge1xuXHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUVudmlyb25tZW50OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2Nhbm5vdCBjaGFuZ2UgZGlzYWJsZW1lbnQgZW52aXJvbm1lbnQnLCBcIkNhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBvZiB7MH0gZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgZGlzYWJsZWQgaW4gZW52aXJvbm1lbnRcIiwgZXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0XHRjYXNlIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5TWFsaWNpb3VzOlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2Nhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBtYWxpY2lvdXMnLCBcIkNhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBvZiB7MH0gZXh0ZW5zaW9uIGJlY2F1c2UgaXQgaXMgbWFsaWNpb3VzXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVZpcnR1YWxXb3Jrc3BhY2U6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGNoYW5nZSBlbmFibGVtZW50IHZpcnR1YWwgd29ya3NwYWNlJywgXCJDYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgb2YgezB9IGV4dGVuc2lvbiBiZWNhdXNlIGl0IGRvZXMgbm90IHN1cHBvcnQgdmlydHVhbCB3b3Jrc3BhY2VzXCIsIGV4dGVuc2lvbi5tYW5pZmVzdC5kaXNwbGF5TmFtZSB8fCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xuXHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbktpbmQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGNoYW5nZSBlbmFibGVtZW50IGV4dGVuc2lvbiBraW5kJywgXCJDYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgb2YgezB9IGV4dGVuc2lvbiBiZWNhdXNlIG9mIGl0cyBleHRlbnNpb24ga2luZFwiLCBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHRcdGNhc2UgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlBbGxvd2xpc3Q6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGNoYW5nZSBkaXNhbGxvd2VkIGV4dGVuc2lvbiBlbmFibGVtZW50JywgXCJDYW5ub3QgY2hhbmdlIGVuYWJsZW1lbnQgb2YgezB9IGV4dGVuc2lvbiBiZWNhdXNlIGl0IGlzIGRpc2FsbG93ZWRcIiwgZXh0ZW5zaW9uLm1hbmlmZXN0LmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKSk7XG5cdFx0XHRjYXNlIEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5SW52YWxpZEV4dGVuc2lvbjpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgY2hhbmdlIGludmFsaWQgZXh0ZW5zaW9uIGVuYWJsZW1lbnQnLCBcIkNhbm5vdCBjaGFuZ2UgZW5hYmxlbWVudCBvZiB7MH0gZXh0ZW5zaW9uIGJlY2F1c2Ugb2YgaXQgaXMgaW52YWxpZFwiLCBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHRcdGNhc2UgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25EZXBlbmRlbmN5OlxuXHRcdFx0XHRpZiAoZG9ub3RDaGVja0RlcGVuZGVuY2llcykge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIENhbiBiZSBjaGFuZ2VkIG9ubHkgd2hlbiBhbGwgaXRzIGRlcGVuZGVuY2llcyBlbmFibGVtZW50cyBjYW4gYmUgY2hhbmdlZFxuXHRcdFx0XHRmb3IgKGNvbnN0IGRlcGVuZGVuY3kgb2YgZ2V0RXh0ZW5zaW9uRGVwZW5kZW5jaWVzKHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIuZXh0ZW5zaW9ucywgZXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzRW5hYmxlZChkZXBlbmRlbmN5KSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgnY2Fubm90IGNoYW5nZSBlbmFibGVtZW50IGRlcGVuZGVuY3knLCBcIkNhbm5vdCBlbmFibGUgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgaXQgZGVwZW5kcyBvbiAnezF9JyBleHRlbnNpb24gdGhhdCBjYW5ub3QgYmUgZW5hYmxlZFwiLCBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIGRlcGVuZGVuY3kubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZGVwZW5kZW5jeS5pZGVudGlmaWVyLmlkKSk7XG5cdFx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRocm93RXJyb3JJZkNhbm5vdENoYW5nZVdvcmtzcGFjZUVuYWJsZW1lbnQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhhc1dvcmtzcGFjZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdub1dvcmtzcGFjZScsIFwiTm8gd29ya3NwYWNlLlwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNEZWZhdWx0T3JTZXR0aW5nc1N5bmNBdXRoUHJvdmlkZXJFeHRlbnNpb24oZXh0ZW5zaW9uLm1hbmlmZXN0KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdjYW5ub3QgZGlzYWJsZSBzZXR0aW5ncyBzeW5jIGF1dGggZXh0ZW5zaW9uIGluIHdvcmtzcGFjZScsIFwiQ2Fubm90IGNoYW5nZSBlbmFibGVtZW50IG9mIHswfSBleHRlbnNpb24gaW4gd29ya3NwYWNlIGJlY2F1c2UgU2V0dGluZ3MgU3luYyBkZXBlbmRzIG9uIGl0LlwiLCBleHRlbnNpb24ubWFuaWZlc3QuZGlzcGxheU5hbWUgfHwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZXRFbmFibGVtZW50KGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgbmV3U3RhdGU6IEVuYWJsZW1lbnRTdGF0ZSk6IFByb21pc2U8Ym9vbGVhbltdPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zTWFuYWdlci53aGVuSW5pdGlhbGl6ZWQoKTtcblxuXHRcdGlmIChuZXdTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSB8fCBuZXdTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpIHtcblx0XHRcdGV4dGVuc2lvbnMucHVzaCguLi50aGlzLmdldEV4dGVuc2lvbnNUb0VuYWJsZVJlY3Vyc2l2ZWx5KGV4dGVuc2lvbnMsIHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIuZXh0ZW5zaW9ucywgbmV3U3RhdGUsIHsgZGVwZW5kZW5jaWVzOiB0cnVlLCBwYWNrOiB0cnVlIH0pKTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBuZXdTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlIHx8IG5ld1N0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHRoaXMudGhyb3dFcnJvcklmQ2Fubm90Q2hhbmdlV29ya3NwYWNlRW5hYmxlbWVudChleHRlbnNpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50aHJvd0Vycm9ySWZDYW5ub3RDaGFuZ2VFbmFibGVtZW50KGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBib29sZWFuW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50U3RhdGUgPSB0aGlzLmdldEVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24pO1xuXHRcdFx0aWYgKGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlUcnVzdFJlcXVpcmVtZW50XG5cdFx0XHRcdC8qIEFsbCBpdHMgZGlzYWJsZWQgZGVwZW5kZW5jaWVzIGFyZSBkaXNhYmxlZCBieSBUcnVzdCBSZXF1aXJlbWVudCAqL1xuXHRcdFx0XHR8fCAoZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3kgJiYgdGhpcy5nZXREZXBlbmRlbmNpZXNFbmFibGVtZW50U3RhdGVzKGV4dGVuc2lvbikuZXZlcnkoKFssIGVdKSA9PiB0aGlzLmlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZShlKSB8fCBlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVRydXN0UmVxdWlyZW1lbnQpKVxuXHRcdFx0KSB7XG5cdFx0XHRcdGNvbnN0IHRydXN0U3RhdGUgPSBhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UucmVxdWVzdFdvcmtzcGFjZVRydXN0KCk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRydXN0U3RhdGUgPz8gZmFsc2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goYXdhaXQgdGhpcy5fc2V0VXNlckVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24sIG5ld1N0YXRlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhbmdlZEV4dGVuc2lvbnMgPSBleHRlbnNpb25zLmZpbHRlcigoZSwgaW5kZXgpID0+IHJlc3VsdFtpbmRleF0pO1xuXHRcdGlmIChjaGFuZ2VkRXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX29uRW5hYmxlbWVudENoYW5nZWQuZmlyZShjaGFuZ2VkRXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dGVuc2lvbnNUb0VuYWJsZVJlY3Vyc2l2ZWx5KGV4dGVuc2lvbnM6IElFeHRlbnNpb25bXSwgYWxsRXh0ZW5zaW9uczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uPiwgZW5hYmxlbWVudFN0YXRlOiBFbmFibGVtZW50U3RhdGUsIG9wdGlvbnM6IHsgZGVwZW5kZW5jaWVzOiBib29sZWFuOyBwYWNrOiBib29sZWFuIH0sIGNoZWNrZWQ6IElFeHRlbnNpb25bXSA9IFtdKTogSUV4dGVuc2lvbltdIHtcblx0XHRpZiAoIW9wdGlvbnMuZGVwZW5kZW5jaWVzICYmICFvcHRpb25zLnBhY2spIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCB0b0NoZWNrID0gZXh0ZW5zaW9ucy5maWx0ZXIoZSA9PiBjaGVja2VkLmluZGV4T2YoZSkgPT09IC0xKTtcblx0XHRpZiAoIXRvQ2hlY2subGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdG9DaGVjaykge1xuXHRcdFx0Y2hlY2tlZC5wdXNoKGV4dGVuc2lvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uc1RvRW5hYmxlOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBhbGxFeHRlbnNpb25zKSB7XG5cdFx0XHQvLyBFeHRlbnNpb24gaXMgYWxyZWFkeSBjaGVja2VkXG5cdFx0XHRpZiAoY2hlY2tlZC5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbmFibGVtZW50U3RhdGVPZkV4dGVuc2lvbiA9IHRoaXMuZ2V0RW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbik7XG5cdFx0XHQvLyBFeHRlbnNpb24gaXMgZW5hYmxlZFxuXHRcdFx0aWYgKHRoaXMuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGVuYWJsZW1lbnRTdGF0ZU9mRXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2tpcCBpZiBkZXBlbmRlbmN5IGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBieSBleHRlbnNpb24ga2luZFxuXHRcdFx0aWYgKGVuYWJsZW1lbnRTdGF0ZU9mRXh0ZW5zaW9uID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbktpbmQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIHRoZSBleHRlbnNpb24gaXMgYSBkZXBlbmRlbmN5IG9yIGluIGV4dGVuc2lvbiBwYWNrXG5cdFx0XHRpZiAoZXh0ZW5zaW9ucy5zb21lKGUgPT5cblx0XHRcdFx0KG9wdGlvbnMuZGVwZW5kZW5jaWVzICYmIGUubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzPy5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQgfSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSlcblx0XHRcdFx0fHwgKG9wdGlvbnMucGFjayAmJiBlLm1hbmlmZXN0LmV4dGVuc2lvblBhY2s/LnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpKSkpIHtcblxuXHRcdFx0XHRjb25zdCBpbmRleCA9IGV4dGVuc2lvbnNUb0VuYWJsZS5maW5kSW5kZXgoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cblx0XHRcdFx0Ly8gRXh0ZW5zaW9uIGlzIG5vdCBhZGRlZCB0byB0aGUgZGlzYWJsZW1lbnQgbGlzdCBzbyBhZGQgaXRcblx0XHRcdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbnNUb0VuYWJsZS5wdXNoKGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBFeHRlbnNpb24gaXMgdGhlcmUgYWxyZWFkeSBpbiB0aGUgZGlzYWJsZW1lbnQgbGlzdC5cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdC8vIFJlcGxhY2Ugb25seSBpZiB0aGUgZW5hYmxlbWVudCBzdGF0ZSBjYW4gYmUgY2hhbmdlZFxuXHRcdFx0XHRcdFx0dGhpcy50aHJvd0Vycm9ySWZFbmFibGVtZW50U3RhdGVDYW5ub3RCZUNoYW5nZWQoZXh0ZW5zaW9uLCBlbmFibGVtZW50U3RhdGVPZkV4dGVuc2lvbiwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRleHRlbnNpb25zVG9FbmFibGUuc3BsaWNlKGluZGV4LCAxLCBleHRlbnNpb24pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7IC8qRG8gbm90IGFkZCovIH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb25zVG9FbmFibGUubGVuZ3RoKSB7XG5cdFx0XHRleHRlbnNpb25zVG9FbmFibGUucHVzaCguLi50aGlzLmdldEV4dGVuc2lvbnNUb0VuYWJsZVJlY3Vyc2l2ZWx5KGV4dGVuc2lvbnNUb0VuYWJsZSwgYWxsRXh0ZW5zaW9ucywgZW5hYmxlbWVudFN0YXRlLCBvcHRpb25zLCBjaGVja2VkKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4dGVuc2lvbnNUb0VuYWJsZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFVzZXJFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCBuZXdTdGF0ZTogRW5hYmxlbWVudFN0YXRlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0aGlzLl9nZXRVc2VyRW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbi5pZGVudGlmaWVyKTtcblxuXHRcdGlmIChjdXJyZW50U3RhdGUgPT09IG5ld1N0YXRlKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKG5ld1N0YXRlKSB7XG5cdFx0XHRjYXNlIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHk6XG5cdFx0XHRcdHRoaXMuX2VuYWJsZUV4dGVuc2lvbihleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRHbG9iYWxseTpcblx0XHRcdFx0dGhpcy5fZGlzYWJsZUV4dGVuc2lvbihleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZTpcblx0XHRcdFx0dGhpcy5fZW5hYmxlRXh0ZW5zaW9uSW5Xb3Jrc3BhY2UoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlOlxuXHRcdFx0XHR0aGlzLl9kaXNhYmxlRXh0ZW5zaW9uSW5Xb3Jrc3BhY2UoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHR9XG5cblx0aXNFbmFibGVkKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuZ2V0RW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbik7XG5cdFx0cmV0dXJuIHRoaXMuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGVuYWJsZW1lbnRTdGF0ZSk7XG5cdH1cblxuXHRpc0VuYWJsZWRFbmFibGVtZW50U3RhdGUoZW5hYmxlbWVudFN0YXRlOiBFbmFibGVtZW50U3RhdGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEJ5RW52aXJvbm1lbnQgfHwgZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHk7XG5cdH1cblxuXHRpc0Rpc2FibGVkR2xvYmFsbHkoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzRGlzYWJsZWRHbG9iYWxseShleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlRW5hYmxlbWVudFN0YXRlKGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgZXh0ZW5zaW9uczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uPiwgd29ya3NwYWNlVHlwZTogV29ya3NwYWNlVHlwZSwgY29tcHV0ZWRFbmFibGVtZW50U3RhdGVzPzogTWFwPElFeHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZT4pOiBFbmFibGVtZW50U3RhdGUge1xuXHRcdGNvbXB1dGVkRW5hYmxlbWVudFN0YXRlcyA9IGNvbXB1dGVkRW5hYmxlbWVudFN0YXRlcyA/PyBuZXcgTWFwPElFeHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZT4oKTtcblx0XHRsZXQgZW5hYmxlbWVudFN0YXRlID0gY29tcHV0ZWRFbmFibGVtZW50U3RhdGVzLmdldChleHRlbnNpb24pO1xuXHRcdGlmIChlbmFibGVtZW50U3RhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGVuYWJsZW1lbnRTdGF0ZTtcblx0XHR9XG5cblx0XHQvLyBFbnN1cmUgdGhlIGNoYXQgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGluIGZyZXNoIHByb2ZpbGVzIHdoZXJlIGNoYXQgc2V0dXAgaXMgbm90IGNvbXBsZXRlZC5cblx0XHQvLyBUaGlzIGlzIGNhbGxlZCBoZXJlIChpbiBhZGRpdGlvbiB0byB0aGUgY29uc3RydWN0b3IpIGJlY2F1c2Ugb24gcHJvZmlsZSBzd2l0Y2ggdGhlXG5cdFx0Ly8gZW5hYmxlbWVudCBzZXJ2aWNlIGlzIG5vdCByZWNyZWF0ZWQsIGJ1dCB0aGUgc3RvcmFnZSBzY29wZSBjaGFuZ2VzIHRvIHRoZSBuZXcgcHJvZmlsZS5cblx0XHRpZiAoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSA9PT0gdGhpcy5fY2hhdEV4dGVuc2lvbklkKSB7XG5cdFx0XHR0aGlzLmVuc3VyZUNoYXRFeHRlbnNpb25Jbml0aWFsRGlzYWJsZWRTdGF0ZSgpO1xuXHRcdH1cblxuXHRcdGVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuX2dldFVzZXJFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IGlzRW5hYmxlZCA9IHRoaXMuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGVuYWJsZW1lbnRTdGF0ZSk7XG5cblx0XHRpZiAoaXNNYWxpY2lvdXMoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIHRoaXMuZ2V0TWFsaWNpb3VzRXh0ZW5zaW9uc0ZvckNoZWNrKCkpKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeU1hbGljaW91cztcblx0XHR9XG5cblx0XHRlbHNlIGlmIChpc0VuYWJsZWQgJiYgZXh0ZW5zaW9uLnR5cGUgPT09IEV4dGVuc2lvblR5cGUuVXNlciAmJiB0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoZXh0ZW5zaW9uKSAhPT0gdHJ1ZSkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlBbGxvd2xpc3Q7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoaXNFbmFibGVkICYmICFleHRlbnNpb24uaXNWYWxpZCkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlJbnZhbGlkRXh0ZW5zaW9uO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHRoaXMuZXh0ZW5zaW9uQmlzZWN0U2VydmljZS5pc0Rpc2FibGVkQnlCaXNlY3QoZXh0ZW5zaW9uKSkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFbnZpcm9ubWVudDtcblx0XHR9XG5cblx0XHRlbHNlIGlmICh0aGlzLl9pc0Rpc2FibGVkSW5FbnYoZXh0ZW5zaW9uKSkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFbnZpcm9ubWVudDtcblx0XHR9XG5cblx0XHRlbHNlIGlmICh0aGlzLl9pc0Rpc2FibGVkQnlWaXJ0dWFsV29ya3NwYWNlKGV4dGVuc2lvbiwgd29ya3NwYWNlVHlwZSkpIHtcblx0XHRcdGVuYWJsZW1lbnRTdGF0ZSA9IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5VmlydHVhbFdvcmtzcGFjZTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChpc0VuYWJsZWQgJiYgdGhpcy5faXNEaXNhYmxlZEJ5V29ya3NwYWNlVHJ1c3QoZXh0ZW5zaW9uLCB3b3Jrc3BhY2VUeXBlKSkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlUcnVzdFJlcXVpcmVtZW50O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHRoaXMuX2lzRGlzYWJsZWRCeUV4dGVuc2lvbktpbmQoZXh0ZW5zaW9uKSkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25LaW5kO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHRoaXMuX2lzRGlzYWJsZWRCeVNlc3Npb25zV2luZG93KGV4dGVuc2lvbikpIHtcblx0XHRcdGVuYWJsZW1lbnRTdGF0ZSA9IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RW52aXJvbm1lbnQ7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoaXNFbmFibGVkICYmIHRoaXMuX2lzRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3koZXh0ZW5zaW9uLCBleHRlbnNpb25zLCB3b3Jrc3BhY2VUeXBlLCBjb21wdXRlZEVuYWJsZW1lbnRTdGF0ZXMpKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3k7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAodGhpcy5faXNEaXNhYmxlZEJ5VW5pZmljYXRpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRlbmFibGVtZW50U3RhdGUgPSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVVuaWZpY2F0aW9uO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKCFpc0VuYWJsZWQgJiYgdGhpcy5faXNFbmFibGVkSW5FbnYoZXh0ZW5zaW9uKSkge1xuXHRcdFx0ZW5hYmxlbWVudFN0YXRlID0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRCeUVudmlyb25tZW50O1xuXHRcdH1cblxuXHRcdGNvbXB1dGVkRW5hYmxlbWVudFN0YXRlcy5zZXQoZXh0ZW5zaW9uLCBlbmFibGVtZW50U3RhdGUpO1xuXHRcdHJldHVybiBlbmFibGVtZW50U3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIF9pc0Rpc2FibGVkSW5FbnYoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuYWxsVXNlckV4dGVuc2lvbnNEaXNhYmxlZCkge1xuXHRcdFx0cmV0dXJuICFleHRlbnNpb24uaXNCdWlsdGluICYmICFpc1Jlc29sdmVyRXh0ZW5zaW9uKGV4dGVuc2lvbi5tYW5pZmVzdCwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNhYmxlZEV4dGVuc2lvbnMgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5kaXNhYmxlRXh0ZW5zaW9ucztcblx0XHRpZiAoQXJyYXkuaXNBcnJheShkaXNhYmxlZEV4dGVuc2lvbnMpKSB7XG5cdFx0XHRyZXR1cm4gZGlzYWJsZWRFeHRlbnNpb25zLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgdGhlIGJldHRlciBtZXJnZSBleHRlbnNpb24gd2hpY2ggd2FzIG1pZ3JhdGVkIHRvIGEgYnVpbHQtaW4gZXh0ZW5zaW9uXG5cdFx0aWYgKGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IEJldHRlck1lcmdlSWQudmFsdWUgfSwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9pc0VuYWJsZWRJbkVudihleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBlbmFibGVkRXh0ZW5zaW9ucyA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmVuYWJsZUV4dGVuc2lvbnM7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZW5hYmxlZEV4dGVuc2lvbnMpKSB7XG5cdFx0XHRyZXR1cm4gZW5hYmxlZEV4dGVuc2lvbnMuc29tZShpZCA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkIH0sIGV4dGVuc2lvbi5pZGVudGlmaWVyKSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGlzYWJsZWRCeVZpcnR1YWxXb3Jrc3BhY2UoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCB3b3Jrc3BhY2VUeXBlOiBXb3Jrc3BhY2VUeXBlKTogYm9vbGVhbiB7XG5cdFx0Ly8gTm90IGEgdmlydHVhbCB3b3Jrc3BhY2Vcblx0XHRpZiAoIXdvcmtzcGFjZVR5cGUudmlydHVhbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFN1cHBvcnRzIHZpcnR1YWwgd29ya3NwYWNlXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5nZXRFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUoZXh0ZW5zaW9uLm1hbmlmZXN0KSAhPT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBXZWIgZXh0ZW5zaW9uIGZyb20gd2ViIGV4dGVuc2lvbiBtYW5hZ2VtZW50IHNlcnZlclxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIoZXh0ZW5zaW9uKSA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS53ZWJFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5jYW5FeGVjdXRlT25XZWIoZXh0ZW5zaW9uLm1hbmlmZXN0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEaXNhYmxlZEJ5RXh0ZW5zaW9uS2luZChleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIHx8IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0Y29uc3QgaW5zdGFsbExvY2F0aW9uID0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25JbnN0YWxsTG9jYXRpb24oZXh0ZW5zaW9uKTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uS2luZCBvZiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uS2luZChleHRlbnNpb24ubWFuaWZlc3QpKSB7XG5cdFx0XHRcdGlmIChleHRlbnNpb25LaW5kID09PSAndWknKSB7XG5cdFx0XHRcdFx0aWYgKGluc3RhbGxMb2NhdGlvbiA9PT0gRXh0ZW5zaW9uSW5zdGFsbExvY2F0aW9uLkxvY2FsKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleHRlbnNpb25LaW5kID09PSAnd29ya3NwYWNlJykge1xuXHRcdFx0XHRcdGlmIChpbnN0YWxsTG9jYXRpb24gPT09IEV4dGVuc2lvbkluc3RhbGxMb2NhdGlvbi5SZW1vdGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgPT09ICd3ZWInKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAvKiB3ZWIgKi8pIHtcblx0XHRcdFx0XHRcdGlmIChpbnN0YWxsTG9jYXRpb24gPT09IEV4dGVuc2lvbkluc3RhbGxMb2NhdGlvbi5XZWIgfHwgaW5zdGFsbExvY2F0aW9uID09PSBFeHRlbnNpb25JbnN0YWxsTG9jYXRpb24uUmVtb3RlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGluc3RhbGxMb2NhdGlvbiA9PT0gRXh0ZW5zaW9uSW5zdGFsbExvY2F0aW9uLkxvY2FsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbmFibGVMb2NhbFdlYldvcmtlciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8V2ViV29ya2VyRXh0SG9zdENvbmZpZ1ZhbHVlPih3ZWJXb3JrZXJFeHRIb3N0Q29uZmlnKTtcblx0XHRcdFx0XHRcdGlmIChlbmFibGVMb2NhbFdlYldvcmtlciA9PT0gdHJ1ZSB8fCBlbmFibGVMb2NhbFdlYldvcmtlciA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRcdFx0XHRcdC8vIFdlYiBleHRlbnNpb25zIGFyZSBlbmFibGVkIG9uIGFsbCBjb25maWd1cmF0aW9uc1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEaXNhYmxlZEJ5V29ya3NwYWNlVHJ1c3QoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLCB3b3Jrc3BhY2VUeXBlOiBXb3Jrc3BhY2VUeXBlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHdvcmtzcGFjZVR5cGUudHJ1c3RlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmlzSW5zaWRlV29ya3NwYWNlKGV4dGVuc2lvbi5sb2NhdGlvbikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUoZXh0ZW5zaW9uLm1hbmlmZXN0KSA9PT0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9pc0Rpc2FibGVkQnlFeHRlbnNpb25EZXBlbmRlbmN5KGV4dGVuc2lvbjogSUV4dGVuc2lvbiwgZXh0ZW5zaW9uczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uPiwgd29ya3NwYWNlVHlwZTogV29ya3NwYWNlVHlwZSwgY29tcHV0ZWRFbmFibGVtZW50U3RhdGVzOiBNYXA8SUV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlPik6IGJvb2xlYW4ge1xuXG5cdFx0aWYgKCFleHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCBkZXBlbmRlbmN5IHRoYXQgaXMgZnJvbSB0aGUgc2FtZSBzZXJ2ZXIgb3IgZG9lcyBub3QgZXhwb3J0cyBhbnkgQVBJXG5cdFx0Y29uc3QgZGVwZW5kZW5jeUV4dGVuc2lvbnMgPSBleHRlbnNpb25zLmZpbHRlcihlID0+XG5cdFx0XHRleHRlbnNpb24ubWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzPy5zb21lKGlkID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgeyBpZCB9KVxuXHRcdFx0XHQmJiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5nZXRFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKGUpID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIoZXh0ZW5zaW9uKSB8fCAoKGUubWFuaWZlc3QubWFpbiB8fCBlLm1hbmlmZXN0LmJyb3dzZXIpICYmIGUubWFuaWZlc3QuYXBpID09PSAnbm9uZScpKSkpO1xuXG5cdFx0aWYgKCFkZXBlbmRlbmN5RXh0ZW5zaW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNFbmFibGVtZW50U3RhdGUgPSBjb21wdXRlZEVuYWJsZW1lbnRTdGF0ZXMuaGFzKGV4dGVuc2lvbik7XG5cdFx0aWYgKCFoYXNFbmFibGVtZW50U3RhdGUpIHtcblx0XHRcdC8vIFBsYWNlaG9sZGVyIHRvIGhhbmRsZSBjeWNsaWMgZGVwc1xuXHRcdFx0Y29tcHV0ZWRFbmFibGVtZW50U3RhdGVzLnNldChleHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Zm9yIChjb25zdCBkZXBlbmRlbmN5RXh0ZW5zaW9uIG9mIGRlcGVuZGVuY3lFeHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuX2NvbXB1dGVFbmFibGVtZW50U3RhdGUoZGVwZW5kZW5jeUV4dGVuc2lvbiwgZXh0ZW5zaW9ucywgd29ya3NwYWNlVHlwZSwgY29tcHV0ZWRFbmFibGVtZW50U3RhdGVzKTtcblx0XHRcdFx0aWYgKCF0aGlzLmlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZShlbmFibGVtZW50U3RhdGUpICYmIGVuYWJsZW1lbnRTdGF0ZSAhPT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25LaW5kKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKCFoYXNFbmFibGVtZW50U3RhdGUpIHtcblx0XHRcdFx0Ly8gcmVtb3ZlIHRoZSBwbGFjZWhvbGRlclxuXHRcdFx0XHRjb21wdXRlZEVuYWJsZW1lbnRTdGF0ZXMuZGVsZXRlKGV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VXNlckVuYWJsZW1lbnRTdGF0ZShpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IEVuYWJsZW1lbnRTdGF0ZSB7XG5cdFx0aWYgKHRoaXMuaGFzV29ya3NwYWNlKSB7XG5cdFx0XHRpZiAodGhpcy5fZ2V0V29ya3NwYWNlRW5hYmxlZEV4dGVuc2lvbnMoKS5maWx0ZXIoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLCBpZGVudGlmaWVyKSlbMF0pIHtcblx0XHRcdFx0cmV0dXJuIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fZ2V0V29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKCkuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZSwgaWRlbnRpZmllcikpWzBdKSB7XG5cdFx0XHRcdHJldHVybiBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9pc0Rpc2FibGVkR2xvYmFsbHkoaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRHbG9iYWxseTtcblx0XHR9XG5cdFx0cmV0dXJuIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHk7XG5cdH1cblxuXHRwcml2YXRlIF9pc0Rpc2FibGVkR2xvYmFsbHkoaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5nbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREaXNhYmxlZEV4dGVuc2lvbnMoKS5zb21lKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZSwgaWRlbnRpZmllcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNEaXNhYmxlZEJ5VW5pZmljYXRpb24oaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZXh0ZW5zaW9uVW5pZmljYXRpb25FbmFibGVkICYmIGlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKSA9PT0gdGhpcy5fY29tcGxldGlvbnNFeHRlbnNpb25JZDtcblx0fVxuXG5cdHByaXZhdGUgX2lzRGlzYWJsZWRCeVNlc3Npb25zV2luZG93KGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEFsbG93LWxpc3RlZCBleHRlbnNpb25zIGFyZSBhbHdheXMgZW5hYmxlZCBpbiB0aGUgc2Vzc2lvbnMgd2luZG93LlxuXHRcdGlmICh0aGlzLl9zZXNzaW9uc1dpbmRvd0FsbG93ZWRFeHRlbnNpb25zLmhhcyhleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEJ1aWx0LWluIGV4dGVuc2lvbnMgYXJlIGVuYWJsZWQgaW4gc2Vzc2lvbnMgd2luZG93IGV4Y2VwdCB0aGUgY2hhdCBleHRlbnNpb24gYW5kIGV4dGVuc2lvbnMgdGhhdCBjb250cmlidXRlIG5vdCBzdXBwb3J0ZWQgZmVhdHVyZXMuXG5cdFx0aWYgKGV4dGVuc2lvbi5pc0J1aWx0aW4pIHtcblx0XHRcdGlmIChleHRlbnNpb24uaWRlbnRpZmllci5pZC50b0xvd2VyQ2FzZSgpID09PSB0aGlzLl9jaGF0RXh0ZW5zaW9uSWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250cmlidXRlcyA9IGV4dGVuc2lvbi5tYW5pZmVzdC5jb250cmlidXRlcztcblx0XHRcdGlmIChjb250cmlidXRlcz8uZGVidWdnZXJzIHx8IGNvbnRyaWJ1dGVzPy52aWV3cyB8fCBjb250cmlidXRlcz8udmlld3NDb250YWluZXJzIHx8IGNvbnRyaWJ1dGVzPy53YWxrdGhyb3VnaHMpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gIXRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5jYW5FeGVjdXRlT25TZXNzaW9uc1dpbmRvdyhleHRlbnNpb24ubWFuaWZlc3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5hYmxlRXh0ZW5zaW9uKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fcmVtb3ZlRnJvbVdvcmtzcGFjZURpc2FibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyKTtcblx0XHR0aGlzLl9yZW1vdmVGcm9tV29ya3NwYWNlRW5hYmxlZEV4dGVuc2lvbnMoaWRlbnRpZmllcik7XG5cdFx0cmV0dXJuIHRoaXMuZ2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlRXh0ZW5zaW9uKGlkZW50aWZpZXIsIFNPVVJDRSk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNhYmxlRXh0ZW5zaW9uKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5fcmVtb3ZlRnJvbVdvcmtzcGFjZURpc2FibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyKTtcblx0XHR0aGlzLl9yZW1vdmVGcm9tV29ya3NwYWNlRW5hYmxlZEV4dGVuc2lvbnMoaWRlbnRpZmllcik7XG5cdFx0cmV0dXJuIHRoaXMuZ2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZGlzYWJsZUV4dGVuc2lvbihpZGVudGlmaWVyLCBTT1VSQ0UpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5hYmxlRXh0ZW5zaW9uSW5Xb3Jrc3BhY2UoaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW1vdmVGcm9tV29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKGlkZW50aWZpZXIpO1xuXHRcdHRoaXMuX2FkZFRvV29ya3NwYWNlRW5hYmxlZEV4dGVuc2lvbnMoaWRlbnRpZmllcik7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNhYmxlRXh0ZW5zaW9uSW5Xb3Jrc3BhY2UoaWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9hZGRUb1dvcmtzcGFjZURpc2FibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyKTtcblx0XHR0aGlzLl9yZW1vdmVGcm9tV29ya3NwYWNlRW5hYmxlZEV4dGVuc2lvbnMoaWRlbnRpZmllcik7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRUb1dvcmtzcGFjZURpc2FibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5oYXNXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHRcdH1cblx0XHRjb25zdCBkaXNhYmxlZEV4dGVuc2lvbnMgPSB0aGlzLl9nZXRXb3Jrc3BhY2VEaXNhYmxlZEV4dGVuc2lvbnMoKTtcblx0XHRpZiAoZGlzYWJsZWRFeHRlbnNpb25zLmV2ZXJ5KGUgPT4gIWFyZVNhbWVFeHRlbnNpb25zKGUsIGlkZW50aWZpZXIpKSkge1xuXHRcdFx0ZGlzYWJsZWRFeHRlbnNpb25zLnB1c2goaWRlbnRpZmllcik7XG5cdFx0XHR0aGlzLl9zZXREaXNhYmxlZEV4dGVuc2lvbnMoZGlzYWJsZWRFeHRlbnNpb25zKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVtb3ZlRnJvbVdvcmtzcGFjZURpc2FibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5oYXNXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZGlzYWJsZWRFeHRlbnNpb25zID0gdGhpcy5fZ2V0V29ya3NwYWNlRGlzYWJsZWRFeHRlbnNpb25zKCk7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGRpc2FibGVkRXh0ZW5zaW9ucy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGRpc2FibGVkRXh0ZW5zaW9uID0gZGlzYWJsZWRFeHRlbnNpb25zW2luZGV4XTtcblx0XHRcdGlmIChhcmVTYW1lRXh0ZW5zaW9ucyhkaXNhYmxlZEV4dGVuc2lvbiwgaWRlbnRpZmllcikpIHtcblx0XHRcdFx0ZGlzYWJsZWRFeHRlbnNpb25zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdHRoaXMuX3NldERpc2FibGVkRXh0ZW5zaW9ucyhkaXNhYmxlZEV4dGVuc2lvbnMpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkVG9Xb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucyhpZGVudGlmaWVyOiBJRXh0ZW5zaW9uSWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5oYXNXb3Jrc3BhY2UpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZW5hYmxlZEV4dGVuc2lvbnMgPSB0aGlzLl9nZXRXb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucygpO1xuXHRcdGlmIChlbmFibGVkRXh0ZW5zaW9ucy5ldmVyeShlID0+ICFhcmVTYW1lRXh0ZW5zaW9ucyhlLCBpZGVudGlmaWVyKSkpIHtcblx0XHRcdGVuYWJsZWRFeHRlbnNpb25zLnB1c2goaWRlbnRpZmllcik7XG5cdFx0XHR0aGlzLl9zZXRFbmFibGVkRXh0ZW5zaW9ucyhlbmFibGVkRXh0ZW5zaW9ucyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRnJvbVdvcmtzcGFjZUVuYWJsZWRFeHRlbnNpb25zKGlkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmhhc1dvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVkRXh0ZW5zaW9ucyA9IHRoaXMuX2dldFdvcmtzcGFjZUVuYWJsZWRFeHRlbnNpb25zKCk7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGVuYWJsZWRFeHRlbnNpb25zLmxlbmd0aDsgaW5kZXgrKykge1xuXHRcdFx0Y29uc3QgZGlzYWJsZWRFeHRlbnNpb24gPSBlbmFibGVkRXh0ZW5zaW9uc1tpbmRleF07XG5cdFx0XHRpZiAoYXJlU2FtZUV4dGVuc2lvbnMoZGlzYWJsZWRFeHRlbnNpb24sIGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdGVuYWJsZWRFeHRlbnNpb25zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRcdHRoaXMuX3NldEVuYWJsZWRFeHRlbnNpb25zKGVuYWJsZWRFeHRlbnNpb25zKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0V29ya3NwYWNlRW5hYmxlZEV4dGVuc2lvbnMoKTogSUV4dGVuc2lvbklkZW50aWZpZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEV4dGVuc2lvbnMoRU5BQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRFbmFibGVkRXh0ZW5zaW9ucyhlbmFibGVkRXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3NldEV4dGVuc2lvbnMoRU5BQkxFRF9FWFRFTlNJT05TX1NUT1JBR0VfUEFUSCwgZW5hYmxlZEV4dGVuc2lvbnMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRXb3Jrc3BhY2VEaXNhYmxlZEV4dGVuc2lvbnMoKTogSUV4dGVuc2lvbklkZW50aWZpZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEV4dGVuc2lvbnMoRElTQUJMRURfRVhURU5TSU9OU19TVE9SQUdFX1BBVEgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0RGlzYWJsZWRFeHRlbnNpb25zKGRpc2FibGVkRXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3NldEV4dGVuc2lvbnMoRElTQUJMRURfRVhURU5TSU9OU19TVE9SQUdFX1BBVEgsIGRpc2FibGVkRXh0ZW5zaW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFeHRlbnNpb25zKHN0b3JhZ2VJZDogc3RyaW5nKTogSUV4dGVuc2lvbklkZW50aWZpZXJbXSB7XG5cdFx0aWYgKCF0aGlzLmhhc1dvcmtzcGFjZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlTWFuYWdlci5nZXQoc3RvcmFnZUlkLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEV4dGVuc2lvbnMoc3RvcmFnZUlkOiBzdHJpbmcsIGV4dGVuc2lvbnM6IElFeHRlbnNpb25JZGVudGlmaWVyW10pOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VNYW5hZ2VyLnNldChzdG9yYWdlSWQsIGV4dGVuc2lvbnMsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb25EaWRDaGFuZ2VHbG9iYWxseURpc2FibGVkRXh0ZW5zaW9ucyhleHRlbnNpb25JZGVudGlmaWVyczogUmVhZG9ubHlBcnJheTxJRXh0ZW5zaW9uSWRlbnRpZmllcj4sIHNvdXJjZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzb3VyY2UgIT09IFNPVVJDRSkge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zTWFuYWdlci53aGVuSW5pdGlhbGl6ZWQoKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSB0aGlzLmV4dGVuc2lvbnNNYW5hZ2VyLmV4dGVuc2lvbnMuZmlsdGVyKGluc3RhbGxlZEV4dGVuc2lvbiA9PiBleHRlbnNpb25JZGVudGlmaWVycy5zb21lKGlkZW50aWZpZXIgPT4gYXJlU2FtZUV4dGVuc2lvbnMoaWRlbnRpZmllciwgaW5zdGFsbGVkRXh0ZW5zaW9uLmlkZW50aWZpZXIpKSk7XG5cdFx0XHR0aGlzLl9vbkVuYWJsZW1lbnRDaGFuZ2VkLmZpcmUoZXh0ZW5zaW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VFeHRlbnNpb25zKGFkZGVkOiBSZWFkb25seUFycmF5PElFeHRlbnNpb24+LCByZW1vdmVkOiBSZWFkb25seUFycmF5PElFeHRlbnNpb24+LCBpc1Byb2ZpbGVTd2l0Y2g6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjaGFuZ2VkRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdID0gYWRkZWQuZmlsdGVyKGUgPT4gIXRoaXMuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKHRoaXMuZ2V0RW5hYmxlbWVudFN0YXRlKGUpKSk7XG5cdFx0Y29uc3QgZXhpc3RpbmdEaXNhYmxlZEV4dGVuc2lvbnMgPSB0aGlzLmV4dGVuc2lvbnNEaXNhYmxlZEV4dGVuc2lvbnM7XG5cdFx0dGhpcy5leHRlbnNpb25zRGlzYWJsZWRFeHRlbnNpb25zID0gdGhpcy5leHRlbnNpb25zTWFuYWdlci5leHRlbnNpb25zLmZpbHRlcihleHRlbnNpb24gPT4ge1xuXHRcdFx0Y29uc3QgZW5hYmxlbWVudFN0YXRlID0gdGhpcy5nZXRFbmFibGVtZW50U3RhdGUoZXh0ZW5zaW9uKTtcblx0XHRcdHJldHVybiBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RXh0ZW5zaW9uRGVwZW5kZW5jeSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5QWxsb3dsaXN0IHx8IGVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlNYWxpY2lvdXM7XG5cdFx0fSk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXhpc3RpbmdEaXNhYmxlZEV4dGVuc2lvbnMpIHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbnNEaXNhYmxlZEV4dGVuc2lvbnMuZXZlcnkoZSA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdGNoYW5nZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdGhpcy5leHRlbnNpb25zRGlzYWJsZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRpZiAoZXhpc3RpbmdEaXNhYmxlZEV4dGVuc2lvbnMuZXZlcnkoZSA9PiAhYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBleHRlbnNpb24uaWRlbnRpZmllcikpKSB7XG5cdFx0XHRcdGNoYW5nZWRFeHRlbnNpb25zLnB1c2goZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNoYW5nZWRFeHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fb25FbmFibGVtZW50Q2hhbmdlZC5maXJlKGNoYW5nZWRFeHRlbnNpb25zKTtcblx0XHR9XG5cdFx0aWYgKCFpc1Byb2ZpbGVTd2l0Y2gpIHtcblx0XHRcdHJlbW92ZWQuZm9yRWFjaCgoeyBpZGVudGlmaWVyIH0pID0+IHRoaXMuX3Jlc2V0KGlkZW50aWZpZXIpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlRXh0ZW5zaW9uc0VuYWJsZW1lbnRzV2hlbldvcmtzcGFjZVRydXN0Q2hhbmdlcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNNYW5hZ2VyLndoZW5Jbml0aWFsaXplZCgpO1xuXG5cdFx0Y29uc3QgY29tcHV0ZUVuYWJsZW1lbnRTdGF0ZXMgPSAod29ya3NwYWNlVHlwZTogV29ya3NwYWNlVHlwZSk6IFtJRXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGVdW10gPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc0VuYWJsZW1lbnRzID0gbmV3IE1hcDxJRXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGU+KCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zTWFuYWdlci5leHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gW2V4dGVuc2lvbiwgdGhpcy5fY29tcHV0ZUVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24sIHRoaXMuZXh0ZW5zaW9uc01hbmFnZXIuZXh0ZW5zaW9ucywgd29ya3NwYWNlVHlwZSwgZXh0ZW5zaW9uc0VuYWJsZW1lbnRzKV0pO1xuXHRcdH07XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VUeXBlID0gdGhpcy5nZXRXb3Jrc3BhY2VUeXBlKCk7XG5cdFx0Y29uc3QgZW5hYmxlbWVudFN0YXRlc1dpdGhUcnVzdGVkV29ya3NwYWNlID0gY29tcHV0ZUVuYWJsZW1lbnRTdGF0ZXMoeyAuLi53b3Jrc3BhY2VUeXBlLCB0cnVzdGVkOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGVuYWJsZW1lbnRTdGF0ZXNXaXRoVW50cnVzdGVkV29ya3NwYWNlID0gY29tcHV0ZUVuYWJsZW1lbnRTdGF0ZXMoeyAuLi53b3Jrc3BhY2VUeXBlLCB0cnVzdGVkOiBmYWxzZSB9KTtcblx0XHRjb25zdCBlbmFibGVtZW50Q2hhbmdlZEV4dGVuc2lvbnNCZWNhdXNlT2ZUcnVzdCA9IGVuYWJsZW1lbnRTdGF0ZXNXaXRoVHJ1c3RlZFdvcmtzcGFjZS5maWx0ZXIoKFssIGVuYWJsZW1lbnRTdGF0ZV0sIGluZGV4KSA9PiBlbmFibGVtZW50U3RhdGUgIT09IGVuYWJsZW1lbnRTdGF0ZXNXaXRoVW50cnVzdGVkV29ya3NwYWNlW2luZGV4XVsxXSkubWFwKChbZXh0ZW5zaW9uXSkgPT4gZXh0ZW5zaW9uKTtcblxuXHRcdGlmIChlbmFibGVtZW50Q2hhbmdlZEV4dGVuc2lvbnNCZWNhdXNlT2ZUcnVzdC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX29uRW5hYmxlbWVudENoYW5nZWQuZmlyZShlbmFibGVtZW50Q2hhbmdlZEV4dGVuc2lvbnNCZWNhdXNlT2ZUcnVzdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2VUeXBlKCk6IFdvcmtzcGFjZVR5cGUge1xuXHRcdHJldHVybiB7IHRydXN0ZWQ6IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSwgdmlydHVhbDogaXNWaXJ0dWFsV29ya3NwYWNlKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpIH07XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldChleHRlbnNpb246IElFeHRlbnNpb25JZGVudGlmaWVyKSB7XG5cdFx0dGhpcy5fcmVtb3ZlRnJvbVdvcmtzcGFjZURpc2FibGVkRXh0ZW5zaW9ucyhleHRlbnNpb24pO1xuXHRcdHRoaXMuX3JlbW92ZUZyb21Xb3Jrc3BhY2VFbmFibGVkRXh0ZW5zaW9ucyhleHRlbnNpb24pO1xuXHRcdHRoaXMuZ2xvYmFsRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlRXh0ZW5zaW9uKGV4dGVuc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIGxvb3BDaGVja0Zvck1hbGljaW91c0V4dGVuc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGVja0Zvck1hbGljaW91c0V4dGVuc2lvbnMoKVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5kZWxheWVyLnRyaWdnZXIoKCkgPT4geyB9LCAxMDAwICogNjAgKiA1KSkgLy8gZXZlcnkgZml2ZSBtaW51dGVzXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLmxvb3BDaGVja0Zvck1hbGljaW91c0V4dGVuc2lvbnMoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNoZWNrRm9yTWFsaWNpb3VzRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IHRoaXMuc3RvcmVNYWxpY2lvdXNFeHRlbnNpb25zKGV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QubWFsaWNpb3VzLm1hcCgoeyBleHRlbnNpb25PclB1Ymxpc2hlciB9KSA9PiBleHRlbnNpb25PclB1Ymxpc2hlcikpO1xuXHRcdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zKFtdLCBbXSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYWxpY2lvdXNFeHRlbnNpb25zKCk6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvbklkZW50aWZpZXIgfCBzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3QoTUFMSUNJT1VTX0VYVEVOU0lPTlNfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYWxpY2lvdXNFeHRlbnNpb25zRm9yQ2hlY2soKTogUmVhZG9ubHlBcnJheTxNYWxpY2lvdXNFeHRlbnNpb25JbmZvPiB7XG5cdFx0aWYgKCF0aGlzLl9tYWxpY2lvdXNFeHRlbnNpb25zQ2FjaGUpIHtcblx0XHRcdHRoaXMuX21hbGljaW91c0V4dGVuc2lvbnNDYWNoZSA9IHRoaXMuZ2V0TWFsaWNpb3VzRXh0ZW5zaW9ucygpLm1hcChleHRlbnNpb25PclB1Ymxpc2hlciA9PiAoeyBleHRlbnNpb25PclB1Ymxpc2hlciB9KSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tYWxpY2lvdXNFeHRlbnNpb25zQ2FjaGU7XG5cdH1cblxuXHRwcml2YXRlIHN0b3JlTWFsaWNpb3VzRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBSZWFkb25seUFycmF5PElFeHRlbnNpb25JZGVudGlmaWVyIHwgc3RyaW5nPik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5nZXRNYWxpY2lvdXNFeHRlbnNpb25zKCk7XG5cdFx0aWYgKGVxdWFscyhleGlzdGluZywgZXh0ZW5zaW9ucywgKGEsIGIpID0+ICFpc1N0cmluZyhhKSAmJiAhaXNTdHJpbmcoYikgPyBhcmVTYW1lRXh0ZW5zaW9ucyhhLCBiKSA6IGEgPT09IGIpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX21hbGljaW91c0V4dGVuc2lvbnNDYWNoZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKE1BTElDSU9VU19FWFRFTlNJT05TX1NUT1JBR0VfS0VZLCBKU09OLnN0cmluZ2lmeShleHRlbnNpb25zKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmNsYXNzIEV4dGVuc2lvbnNNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdID0gW107XG5cdGdldCBleHRlbnNpb25zKCk6IHJlYWRvbmx5IElFeHRlbnNpb25bXSB7IHJldHVybiB0aGlzLl9leHRlbnNpb25zOyB9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VFeHRlbnNpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBhZGRlZDogcmVhZG9ubHkgSUV4dGVuc2lvbltdOyByZW1vdmVkOiByZWFkb25seSBJRXh0ZW5zaW9uW107IHJlYWRvbmx5IGlzUHJvZmlsZVN3aXRjaDogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFeHRlbnNpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5pdGlhbGl6ZVByb21pc2U7XG5cdHByaXZhdGUgZGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmRpc3Bvc2VkID0gdHJ1ZSkpO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZVByb21pc2UgPSB0aGlzLmluaXRpYWxpemUoKTtcblx0fVxuXG5cdHdoZW5Jbml0aWFsaXplZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5pbml0aWFsaXplUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9ucyA9IFtcblx0XHRcdFx0Li4uYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoKSxcblx0XHRcdFx0Li4uYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWRXb3Jrc3BhY2VFeHRlbnNpb25zKHRydWUpXG5cdFx0XHRdO1xuXHRcdFx0aWYgKHRoaXMuZGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VFeHRlbnNpb25zLmZpcmUoeyBhZGRlZDogdGhpcy5leHRlbnNpb25zLCByZW1vdmVkOiBbXSwgaXNQcm9maWxlU3dpdGNoOiBmYWxzZSB9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zKGUgPT5cblx0XHRcdHRoaXMudXBkYXRlRXh0ZW5zaW9ucyhlLnJlZHVjZTxJRXh0ZW5zaW9uW10+KChyZXN1bHQsIHsgbG9jYWwsIG9wZXJhdGlvbiB9KSA9PiB7XG5cdFx0XHRcdGlmIChsb2NhbCAmJiBvcGVyYXRpb24gIT09IEluc3RhbGxPcGVyYXRpb24uTWlncmF0ZSkgeyByZXN1bHQucHVzaChsb2NhbCk7IH0gcmV0dXJuIHJlc3VsdDtcblx0XHRcdH0sIFtdKSwgW10sIHVuZGVmaW5lZCwgZmFsc2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxFeHRlbnNpb24sIChlID0+ICFlLmVycm9yKSkoZSA9PiB0aGlzLnVwZGF0ZUV4dGVuc2lvbnMoW10sIFtlLmlkZW50aWZpZXJdLCBlLnNlcnZlciwgZmFsc2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVByb2ZpbGUoKHsgYWRkZWQsIHJlbW92ZWQsIHNlcnZlciB9KSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUV4dGVuc2lvbnMoYWRkZWQsIHJlbW92ZWQubWFwKCh7IGlkZW50aWZpZXIgfSkgPT4gaWRlbnRpZmllciksIHNlcnZlciwgdHJ1ZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHRlbnNpb25zKGFkZGVkOiBJRXh0ZW5zaW9uW10sIGlkZW50aWZpZXJzOiBJRXh0ZW5zaW9uSWRlbnRpZmllcltdLCBzZXJ2ZXI6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIHwgdW5kZWZpbmVkLCBpc1Byb2ZpbGVTd2l0Y2g6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoYWRkZWQubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBhZGRlZCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25TZXJ2ZXIgPSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIoZXh0ZW5zaW9uKTtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9leHRlbnNpb25zLmZpbmRJbmRleChlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcihlKSA9PT0gZXh0ZW5zaW9uU2VydmVyKTtcblx0XHRcdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0XHRcdHRoaXMuX2V4dGVuc2lvbnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZXh0ZW5zaW9ucy5wdXNoKC4uLmFkZGVkKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVtb3ZlZDogSUV4dGVuc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIGlkZW50aWZpZXJzKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2V4dGVuc2lvbnMuZmluZEluZGV4KGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoZS5pZGVudGlmaWVyLCBpZGVudGlmaWVyKSAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmdldEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIoZSkgPT09IHNlcnZlcik7XG5cdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHJlbW92ZWQucHVzaCguLi50aGlzLl9leHRlbnNpb25zLnNwbGljZShpbmRleCwgMSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYWRkZWQubGVuZ3RoIHx8IHJlbW92ZWQubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnMuZmlyZSh7IGFkZGVkLCByZW1vdmVkLCBpc1Byb2ZpbGVTd2l0Y2ggfSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsNkJBQW1ELG1DQUFtQyxpQ0FBaUMsa0NBQWtDLGtCQUFrQixpQ0FBeUQ7QUFDN08sU0FBUyxzQ0FBc0MsaUJBQWlCLG1DQUFtQyxzQ0FBa0UsZ0NBQWdDO0FBQ3JNLFNBQVMsbUJBQW1CLGVBQWUsMEJBQTBCLG1CQUFtQjtBQUN4RixTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxlQUErQyxtQ0FBbUMseUJBQXlCLDJCQUEyQjtBQUMvSSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBMkQ7QUFDcEUsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsc0JBQXNCLHNCQUFzQixnQkFBZ0I7QUFDckUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxrQ0FBa0Ms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
