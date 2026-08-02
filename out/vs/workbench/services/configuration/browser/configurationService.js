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
import { URI } from "../../../../base/common/uri.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { equals } from "../../../../base/common/objects.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Queue, Barrier, Promises, Delayer, Throttler } from "../../../../base/common/async.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { IWorkspaceContextService, Workspace as BaseWorkspace, WorkbenchState, toWorkspaceFolder, isWorkspaceFolder, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from "../../../../platform/workspace/common/workspace.js";
import { ConfigurationModel, ConfigurationChangeEvent, mergeChanges } from "../../../../platform/configuration/common/configurationModels.js";
import { ConfigurationTarget, isConfigurationOverrides, ConfigurationTargetToString, isConfigurationUpdateOverrides, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { NullPolicyConfiguration, PolicyConfiguration } from "../../../../platform/configuration/common/configurations.js";
import { Configuration } from "../common/configurationModels.js";
import { FOLDER_CONFIG_FOLDER_NAME, defaultSettingsSchemaId, userSettingsSchemaId, workspaceSettingsSchemaId, folderSettingsSchemaId, machineSettingsSchemaId, LOCAL_MACHINE_SCOPES, PROFILE_SCOPES, LOCAL_MACHINE_PROFILE_SCOPES, profileSettingsSchemaId, APPLY_ALL_PROFILES_SETTING, APPLICATION_SCOPES } from "../common/configuration.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions, allSettings, windowSettings, resourceSettings, applicationSettings, machineSettings, machineOverridableSettings, ConfigurationScope, keyFromOverrideIdentifiers, OVERRIDE_PROPERTY_PATTERN, resourceLanguageSettingsSchemaId, configurationDefaultsSchemaId, applicationMachineSettings, isConfigurationDefaultSourceEquals } from "../../../../platform/configuration/common/configurationRegistry.js";
import { isStoredWorkspaceFolder, getStoredWorkspaceFolder, toWorkspaceFolders } from "../../../../platform/workspaces/common/workspaces.js";
import { ConfigurationEditing, EditableConfigurationTarget } from "../common/configurationEditing.js";
import { WorkspaceConfiguration, FolderConfiguration, RemoteUserConfiguration, UserConfiguration, DefaultConfiguration, ApplicationConfiguration } from "./configuration.js";
import { mark } from "../../../../base/common/performance.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { delta, distinct, equals as arrayEquals } from "../../../../base/common/arrays.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IWorkbenchAssignmentService } from "../../assignment/common/assignmentService.js";
import { isUndefined } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { NullPolicyService } from "../../../../platform/policy/common/policy.js";
import { IJSONEditingService } from "../common/jsonEditing.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { runWhenWindowIdle } from "../../../../base/browser/dom.js";
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { fixSettingLinks } from "../../preferences/common/preferencesModels.js";
function getLocalUserConfigurationScopes(userDataProfile, hasRemote) {
  const isDefaultProfile = userDataProfile.isDefault || userDataProfile.useDefaultFlags?.settings;
  if (isDefaultProfile) {
    return hasRemote ? LOCAL_MACHINE_SCOPES : void 0;
  }
  return hasRemote ? LOCAL_MACHINE_PROFILE_SCOPES : PROFILE_SCOPES;
}
class Workspace extends BaseWorkspace {
  constructor() {
    super(...arguments);
    this.initialized = false;
  }
}
class WorkspaceService extends Disposable {
  constructor({ remoteAuthority, configurationCache }, environmentService, userDataProfileService, userDataProfilesService, fileService, remoteAgentService, uriIdentityService, logService, policyService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.fileService = fileService;
    this.remoteAgentService = remoteAgentService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.initialized = false;
    this.applicationConfiguration = null;
    this.remoteUserConfiguration = null;
    this.cachedFolderConfigs = this._register(new DisposableMap(new ResourceMap()));
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._onWillChangeWorkspaceFolders = this._register(new Emitter());
    this.onWillChangeWorkspaceFolders = this._onWillChangeWorkspaceFolders.event;
    this._onDidChangeWorkspaceFolders = this._register(new Emitter());
    this.onDidChangeWorkspaceFolders = this._onDidChangeWorkspaceFolders.event;
    this._onDidChangeWorkspaceName = this._register(new Emitter());
    this.onDidChangeWorkspaceName = this._onDidChangeWorkspaceName.event;
    this._onDidChangeWorkbenchState = this._register(new Emitter());
    this.onDidChangeWorkbenchState = this._onDidChangeWorkbenchState.event;
    this.isWorkspaceTrusted = true;
    this._restrictedSettings = { default: [] };
    this._onDidChangeRestrictedSettings = this._register(new Emitter());
    this.onDidChangeRestrictedSettings = this._onDidChangeRestrictedSettings.event;
    this.configurationRegistry = Registry.as(Extensions.Configuration);
    this.initRemoteUserConfigurationBarrier = new Barrier();
    this.completeWorkspaceBarrier = new Barrier();
    this.defaultConfiguration = this._register(new DefaultConfiguration(userDataProfileService.currentProfile.id, configurationCache, environmentService, logService));
    this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
    this.configurationCache = configurationCache;
    this._configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), ConfigurationModel.createEmptyModel(logService), new ResourceMap(), this.workspace, logService);
    this.applicationConfigurationDisposables = this._register(new DisposableStore());
    this.createApplicationConfiguration();
    this.localUserConfiguration = this._register(new UserConfiguration(userDataProfileService.currentProfile.settingsResource, userDataProfileService.currentProfile.tasksResource, userDataProfileService.currentProfile.mcpResource, { scopes: getLocalUserConfigurationScopes(userDataProfileService.currentProfile, !!remoteAuthority) }, fileService, uriIdentityService, logService));
    this._register(this.localUserConfiguration.onDidChangeConfiguration((userConfiguration) => this.onLocalUserConfigurationChanged(userConfiguration)));
    if (remoteAuthority) {
      const remoteUserConfiguration = this.remoteUserConfiguration = this._register(new RemoteUserConfiguration(remoteAuthority, configurationCache, fileService, uriIdentityService, remoteAgentService, logService));
      this._register(remoteUserConfiguration.onDidInitialize((remoteUserConfigurationModel) => {
        this._register(remoteUserConfiguration.onDidChangeConfiguration((remoteUserConfigurationModel2) => this.onRemoteUserConfigurationChanged(remoteUserConfigurationModel2)));
        this.onRemoteUserConfigurationChanged(remoteUserConfigurationModel);
        this.initRemoteUserConfigurationBarrier.open();
      }));
    } else {
      this.initRemoteUserConfigurationBarrier.open();
    }
    this.workspaceConfiguration = this._register(new WorkspaceConfiguration(configurationCache, fileService, uriIdentityService, logService));
    this._register(this.workspaceConfiguration.onDidUpdateConfiguration((fromCache) => {
      this.onWorkspaceConfigurationChanged(fromCache).then(() => {
        this.workspace.initialized = this.workspaceConfiguration.initialized;
        this.checkAndMarkWorkspaceComplete(fromCache);
      });
    }));
    this._register(this.defaultConfiguration.onDidChangeConfiguration(({ properties, defaults }) => this.onDefaultConfigurationChanged(defaults, properties)));
    this._register(this.policyConfiguration.onDidChangeConfiguration((configurationModel) => this.onPolicyConfigurationChanged(configurationModel)));
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => this.onUserDataProfileChanged(e)));
    this.workspaceEditingQueue = new Queue();
  }
  get restrictedSettings() {
    return this._restrictedSettings;
  }
  createApplicationConfiguration() {
    this.applicationConfigurationDisposables.clear();
    if (this.userDataProfileService.currentProfile.isDefault || this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
      this.applicationConfiguration = null;
    } else {
      this.applicationConfiguration = this.applicationConfigurationDisposables.add(this._register(new ApplicationConfiguration(this.userDataProfilesService, this.fileService, this.uriIdentityService, this.logService)));
      this.applicationConfigurationDisposables.add(this.applicationConfiguration.onDidChangeConfiguration((configurationModel) => this.onApplicationConfigurationChanged(configurationModel)));
    }
  }
  // Workspace Context Service Impl
  async getCompleteWorkspace() {
    await this.completeWorkspaceBarrier.wait();
    return this.getWorkspace();
  }
  getWorkspace() {
    return this.workspace;
  }
  getWorkbenchState() {
    if (this.workspace.configuration) {
      return WorkbenchState.WORKSPACE;
    }
    if (this.workspace.folders.length === 1) {
      return WorkbenchState.FOLDER;
    }
    return WorkbenchState.EMPTY;
  }
  hasWorkspaceData() {
    return this.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  getWorkspaceFolder(resource) {
    return this.workspace.getFolder(resource);
  }
  addFolders(foldersToAdd, index) {
    return this.updateFolders(foldersToAdd, [], index);
  }
  removeFolders(foldersToRemove) {
    return this.updateFolders([], foldersToRemove);
  }
  async updateFolders(foldersToAdd, foldersToRemove, index) {
    return this.workspaceEditingQueue.queue(() => this.doUpdateFolders(foldersToAdd, foldersToRemove, index));
  }
  isInsideWorkspace(resource) {
    return !!this.getWorkspaceFolder(resource);
  }
  isCurrentWorkspace(workspaceIdOrFolder) {
    switch (this.getWorkbenchState()) {
      case WorkbenchState.FOLDER: {
        let folderUri = void 0;
        if (URI.isUri(workspaceIdOrFolder)) {
          folderUri = workspaceIdOrFolder;
        } else if (isSingleFolderWorkspaceIdentifier(workspaceIdOrFolder)) {
          folderUri = workspaceIdOrFolder.uri;
        }
        return URI.isUri(folderUri) && this.uriIdentityService.extUri.isEqual(folderUri, this.workspace.folders[0].uri);
      }
      case WorkbenchState.WORKSPACE:
        return isWorkspaceIdentifier(workspaceIdOrFolder) && this.workspace.id === workspaceIdOrFolder.id;
    }
    return false;
  }
  async doUpdateFolders(foldersToAdd, foldersToRemove, index) {
    if (this.getWorkbenchState() !== WorkbenchState.WORKSPACE) {
      return Promise.resolve(void 0);
    }
    if (foldersToAdd.length + foldersToRemove.length === 0) {
      return Promise.resolve(void 0);
    }
    let foldersHaveChanged = false;
    let currentWorkspaceFolders = this.getWorkspace().folders;
    let newStoredFolders = currentWorkspaceFolders.map((f) => f.raw).filter((folder, index2) => {
      if (!isStoredWorkspaceFolder(folder)) {
        return true;
      }
      return !this.contains(foldersToRemove, currentWorkspaceFolders[index2].uri);
    });
    foldersHaveChanged = currentWorkspaceFolders.length !== newStoredFolders.length;
    if (foldersToAdd.length) {
      const workspaceConfigPath = this.getWorkspace().configuration;
      const workspaceConfigFolder = this.uriIdentityService.extUri.dirname(workspaceConfigPath);
      currentWorkspaceFolders = toWorkspaceFolders(newStoredFolders, workspaceConfigPath, this.uriIdentityService.extUri);
      const currentWorkspaceFolderUris = currentWorkspaceFolders.map((folder) => folder.uri);
      const storedFoldersToAdd = [];
      for (const folderToAdd of foldersToAdd) {
        const folderURI = folderToAdd.uri;
        if (this.contains(currentWorkspaceFolderUris, folderURI)) {
          continue;
        }
        try {
          const result = await this.fileService.stat(folderURI);
          if (!result.isDirectory) {
            continue;
          }
        } catch (e) {
        }
        storedFoldersToAdd.push(getStoredWorkspaceFolder(folderURI, false, folderToAdd.name, workspaceConfigFolder, this.uriIdentityService.extUri));
      }
      if (storedFoldersToAdd.length > 0) {
        foldersHaveChanged = true;
        if (typeof index === "number" && index >= 0 && index < newStoredFolders.length) {
          newStoredFolders = newStoredFolders.slice(0);
          newStoredFolders.splice(index, 0, ...storedFoldersToAdd);
        } else {
          newStoredFolders = [...newStoredFolders, ...storedFoldersToAdd];
        }
      }
    }
    if (foldersHaveChanged) {
      return this.setFolders(newStoredFolders);
    }
    return Promise.resolve(void 0);
  }
  async setFolders(folders) {
    if (!this.instantiationService) {
      throw new Error("Cannot update workspace folders because workspace service is not yet ready to accept writes.");
    }
    await this.instantiationService.invokeFunction((accessor) => this.workspaceConfiguration.setFolders(folders, accessor.get(IJSONEditingService)));
    return this.onWorkspaceConfigurationChanged(false);
  }
  contains(resources, toCheck) {
    return resources.some((resource) => this.uriIdentityService.extUri.isEqual(resource, toCheck));
  }
  // Workspace Configuration Service Impl
  getConfigurationData() {
    return this._configuration.toData();
  }
  getValue(arg1, arg2) {
    const section = typeof arg1 === "string" ? arg1 : void 0;
    const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : void 0;
    return this._configuration.getValue(section, overrides);
  }
  async updateValue(key, value, arg3, arg4, options) {
    const overrides = isConfigurationUpdateOverrides(arg3) ? arg3 : isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : void 0 } : void 0;
    const target = overrides ? arg4 : arg3;
    const targets = target ? [target] : [];
    if (overrides?.overrideIdentifiers) {
      overrides.overrideIdentifiers = distinct(overrides.overrideIdentifiers);
      overrides.overrideIdentifiers = overrides.overrideIdentifiers.length ? overrides.overrideIdentifiers : void 0;
    }
    if (!targets.length) {
      if (overrides?.overrideIdentifiers && overrides.overrideIdentifiers.length > 1) {
        throw new Error("Configuration Target is required while updating the value for multiple override identifiers");
      }
      const inspect = this.inspect(key, { resource: overrides?.resource, overrideIdentifier: overrides?.overrideIdentifiers ? overrides.overrideIdentifiers[0] : void 0 });
      targets.push(...this.deriveConfigurationTargets(key, value, inspect));
      if (equals(value, inspect.defaultValue) && targets.length === 1 && (targets[0] === ConfigurationTarget.USER || targets[0] === ConfigurationTarget.USER_LOCAL)) {
        value = void 0;
      }
    }
    await Promises.settled(targets.map((target2) => this.writeConfigurationValue(key, value, target2, overrides, options)));
  }
  async reloadConfiguration(target) {
    if (target === void 0) {
      this.reloadDefaultConfiguration();
      const application = await this.reloadApplicationConfiguration(true);
      const { local, remote } = await this.reloadUserConfiguration();
      await this.reloadWorkspaceConfiguration();
      await this.loadConfiguration(application, local, remote, true);
      return;
    }
    if (isWorkspaceFolder(target)) {
      await this.reloadWorkspaceFolderConfiguration(target);
      return;
    }
    switch (target) {
      case ConfigurationTarget.DEFAULT:
        this.reloadDefaultConfiguration();
        return;
      case ConfigurationTarget.USER: {
        const { local, remote } = await this.reloadUserConfiguration();
        await this.loadConfiguration(this._configuration.applicationConfiguration, local, remote, true);
        return;
      }
      case ConfigurationTarget.USER_LOCAL:
        await this.reloadLocalUserConfiguration();
        return;
      case ConfigurationTarget.USER_REMOTE:
        await this.reloadRemoteUserConfiguration();
        return;
      case ConfigurationTarget.WORKSPACE:
      case ConfigurationTarget.WORKSPACE_FOLDER:
        await this.reloadWorkspaceConfiguration();
        return;
    }
  }
  hasCachedConfigurationDefaultsOverrides() {
    return this.defaultConfiguration.hasCachedConfigurationDefaultsOverrides();
  }
  inspect(key, overrides) {
    return this._configuration.inspect(key, overrides);
  }
  keys() {
    return this._configuration.keys();
  }
  async whenRemoteConfigurationLoaded() {
    await this.initRemoteUserConfigurationBarrier.wait();
  }
  /**
   * At present, all workspaces (empty, single-folder, multi-root) in local and remote
   * can be initialized without requiring extension host except following case:
   *
   * A multi root workspace with .code-workspace file that has to be resolved by an extension.
   * Because of readonly `rootPath` property in extension API we have to resolve multi root workspace
   * before extension host starts so that `rootPath` can be set to first folder.
   *
   * This restriction is lifted partially for web in `MainThreadWorkspace`.
   * In web, we start extension host with empty `rootPath` in this case.
   *
   * Related root path issue discussion is being tracked here - https://github.com/microsoft/vscode/issues/69335
   */
  async initialize(arg) {
    mark("code/willInitWorkspaceService");
    const trigger = this.initialized;
    this.initialized = false;
    const workspace = await this.createWorkspace(arg);
    await this.updateWorkspaceAndInitializeConfiguration(workspace, trigger);
    this.checkAndMarkWorkspaceComplete(false);
    mark("code/didInitWorkspaceService");
  }
  updateWorkspaceTrust(trusted) {
    if (this.isWorkspaceTrusted !== trusted) {
      this.isWorkspaceTrusted = trusted;
      const data = this._configuration.toData();
      const folderConfigurationModels = [];
      for (const folder of this.workspace.folders) {
        const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
        let configurationModel;
        if (folderConfiguration) {
          configurationModel = folderConfiguration.updateWorkspaceTrust(this.isWorkspaceTrusted);
          this._configuration.updateFolderConfiguration(folder.uri, configurationModel);
        }
        folderConfigurationModels.push(configurationModel);
      }
      if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
        if (folderConfigurationModels[0]) {
          this._configuration.updateWorkspaceConfiguration(folderConfigurationModels[0]);
        }
      } else {
        this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.updateWorkspaceTrust(this.isWorkspaceTrusted));
      }
      this.updateRestrictedSettings();
      let keys = [];
      if (this.restrictedSettings.userLocal) {
        keys.push(...this.restrictedSettings.userLocal);
      }
      if (this.restrictedSettings.userRemote) {
        keys.push(...this.restrictedSettings.userRemote);
      }
      if (this.restrictedSettings.workspace) {
        keys.push(...this.restrictedSettings.workspace);
      }
      this.restrictedSettings.workspaceFolder?.forEach((value) => keys.push(...value));
      keys = distinct(keys);
      if (keys.length) {
        this.triggerConfigurationChange({ keys, overrides: [] }, { data, workspace: this.workspace }, ConfigurationTarget.WORKSPACE);
      }
    }
  }
  acquireInstantiationService(instantiationService) {
    this.instantiationService = instantiationService;
  }
  isSettingAppliedForAllProfiles(key) {
    const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
    if (scope && APPLICATION_SCOPES.includes(scope)) {
      return true;
    }
    const allProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
  }
  async createWorkspace(arg) {
    if (isWorkspaceIdentifier(arg)) {
      return this.createMultiFolderWorkspace(arg);
    }
    if (isSingleFolderWorkspaceIdentifier(arg)) {
      return this.createSingleFolderWorkspace(arg);
    }
    return this.createEmptyWorkspace(arg);
  }
  async createMultiFolderWorkspace(workspaceIdentifier) {
    await this.workspaceConfiguration.initialize({ id: workspaceIdentifier.id, configPath: workspaceIdentifier.configPath }, this.isWorkspaceTrusted);
    const workspaceConfigPath = workspaceIdentifier.configPath;
    const workspaceFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), workspaceConfigPath, this.uriIdentityService.extUri);
    const workspaceId = workspaceIdentifier.id;
    const workspace = new Workspace(workspaceId, workspaceFolders, this.workspaceConfiguration.isTransient(), workspaceConfigPath, (uri) => this.uriIdentityService.extUri.ignorePathCasing(uri));
    workspace.initialized = this.workspaceConfiguration.initialized;
    return workspace;
  }
  createSingleFolderWorkspace(singleFolderWorkspaceIdentifier) {
    const workspace = new Workspace(singleFolderWorkspaceIdentifier.id, [toWorkspaceFolder(singleFolderWorkspaceIdentifier.uri)], false, null, (uri) => this.uriIdentityService.extUri.ignorePathCasing(uri));
    workspace.initialized = true;
    return workspace;
  }
  createEmptyWorkspace(emptyWorkspaceIdentifier) {
    const workspace = new Workspace(emptyWorkspaceIdentifier.id, [], false, null, (uri) => this.uriIdentityService.extUri.ignorePathCasing(uri));
    workspace.initialized = true;
    return Promise.resolve(workspace);
  }
  checkAndMarkWorkspaceComplete(fromCache) {
    if (!this.completeWorkspaceBarrier.isOpen() && this.workspace.initialized) {
      this.completeWorkspaceBarrier.open();
      this.validateWorkspaceFoldersAndReload(fromCache);
    }
  }
  async updateWorkspaceAndInitializeConfiguration(workspace, trigger) {
    const hasWorkspaceBefore = !!this.workspace;
    let previousState;
    let previousWorkspacePath;
    let previousFolders = [];
    if (hasWorkspaceBefore) {
      previousState = this.getWorkbenchState();
      previousWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : void 0;
      previousFolders = this.workspace.folders;
      this.workspace.update(workspace);
    } else {
      this.workspace = workspace;
    }
    await this.initializeConfiguration(trigger);
    if (hasWorkspaceBefore) {
      const newState = this.getWorkbenchState();
      if (previousState && newState !== previousState) {
        this._onDidChangeWorkbenchState.fire(newState);
      }
      const newWorkspacePath = this.workspace.configuration ? this.workspace.configuration.fsPath : void 0;
      if (previousWorkspacePath && newWorkspacePath !== previousWorkspacePath || newState !== previousState) {
        this._onDidChangeWorkspaceName.fire();
      }
      const folderChanges = this.compareFolders(previousFolders, this.workspace.folders);
      if (folderChanges && (folderChanges.added.length || folderChanges.removed.length || folderChanges.changed.length)) {
        await this.handleWillChangeWorkspaceFolders(folderChanges, false);
        this._onDidChangeWorkspaceFolders.fire(folderChanges);
      }
    }
    if (!this.localUserConfiguration.hasTasksLoaded) {
      this._register(runWhenWindowIdle(mainWindow, () => this.reloadLocalUserConfiguration(false, this._configuration.localUserConfiguration)));
    }
  }
  compareFolders(currentFolders, newFolders) {
    const result = { added: [], removed: [], changed: [] };
    result.added = newFolders.filter((newFolder) => !currentFolders.some((currentFolder) => newFolder.uri.toString() === currentFolder.uri.toString()));
    for (let currentIndex = 0; currentIndex < currentFolders.length; currentIndex++) {
      const currentFolder = currentFolders[currentIndex];
      let newIndex = 0;
      for (newIndex = 0; newIndex < newFolders.length && currentFolder.uri.toString() !== newFolders[newIndex].uri.toString(); newIndex++) {
      }
      if (newIndex < newFolders.length) {
        if (currentIndex !== newIndex || currentFolder.name !== newFolders[newIndex].name) {
          result.changed.push(currentFolder);
        }
      } else {
        result.removed.push(currentFolder);
      }
    }
    return result;
  }
  async initializeConfiguration(trigger) {
    await this.defaultConfiguration.initialize();
    const initPolicyConfigurationPromise = this.policyConfiguration.initialize();
    const initApplicationConfigurationPromise = this.applicationConfiguration ? this.applicationConfiguration.initialize() : Promise.resolve(ConfigurationModel.createEmptyModel(this.logService));
    const initUserConfiguration = async () => {
      mark("code/willInitUserConfiguration");
      const result = await Promise.all([this.localUserConfiguration.initialize(), this.remoteUserConfiguration ? this.remoteUserConfiguration.initialize() : Promise.resolve(ConfigurationModel.createEmptyModel(this.logService))]);
      if (this.applicationConfiguration) {
        const applicationConfigurationModel = await initApplicationConfigurationPromise;
        result[0] = this.localUserConfiguration.reparse({ exclude: applicationConfigurationModel.getValue(APPLY_ALL_PROFILES_SETTING) });
      }
      mark("code/didInitUserConfiguration");
      return result;
    };
    const [, application, [local, remote]] = await Promise.all([
      initPolicyConfigurationPromise,
      initApplicationConfigurationPromise,
      initUserConfiguration()
    ]);
    mark("code/willInitWorkspaceConfiguration");
    await this.loadConfiguration(application, local, remote, trigger);
    mark("code/didInitWorkspaceConfiguration");
  }
  reloadDefaultConfiguration() {
    this.onDefaultConfigurationChanged(this.defaultConfiguration.reload());
  }
  async reloadApplicationConfiguration(donotTrigger) {
    if (!this.applicationConfiguration) {
      return ConfigurationModel.createEmptyModel(this.logService);
    }
    const model = await this.applicationConfiguration.loadConfiguration();
    if (!donotTrigger) {
      this.onApplicationConfigurationChanged(model);
    }
    return model;
  }
  async reloadUserConfiguration() {
    const [local, remote] = await Promise.all([this.reloadLocalUserConfiguration(true), this.reloadRemoteUserConfiguration(true)]);
    return { local, remote };
  }
  async reloadLocalUserConfiguration(donotTrigger, settingsConfiguration) {
    const model = await this.localUserConfiguration.reload(settingsConfiguration);
    if (!donotTrigger) {
      this.onLocalUserConfigurationChanged(model);
    }
    return model;
  }
  async reloadRemoteUserConfiguration(donotTrigger) {
    if (this.remoteUserConfiguration) {
      const model = await this.remoteUserConfiguration.reload();
      if (!donotTrigger) {
        this.onRemoteUserConfigurationChanged(model);
      }
      return model;
    }
    return ConfigurationModel.createEmptyModel(this.logService);
  }
  async reloadWorkspaceConfiguration() {
    const workbenchState = this.getWorkbenchState();
    if (workbenchState === WorkbenchState.FOLDER) {
      return this.onWorkspaceFolderConfigurationChanged(this.workspace.folders[0]);
    }
    if (workbenchState === WorkbenchState.WORKSPACE) {
      return this.workspaceConfiguration.reload().then(() => this.onWorkspaceConfigurationChanged(false));
    }
  }
  reloadWorkspaceFolderConfiguration(folder) {
    return this.onWorkspaceFolderConfigurationChanged(folder);
  }
  async loadConfiguration(applicationConfigurationModel, userConfigurationModel, remoteUserConfigurationModel, trigger) {
    this.cachedFolderConfigs.clearAndDisposeAll();
    const folders = this.workspace.folders;
    const folderConfigurations = await this.loadFolderConfigurations(folders);
    const workspaceConfiguration = this.getWorkspaceConfigurationModel(folderConfigurations);
    const folderConfigurationModels = new ResourceMap();
    folderConfigurations.forEach((folderConfiguration, index) => folderConfigurationModels.set(folders[index].uri, folderConfiguration));
    const currentConfiguration = this._configuration;
    this._configuration = new Configuration(this.defaultConfiguration.configurationModel, this.policyConfiguration.configurationModel, applicationConfigurationModel, userConfigurationModel, remoteUserConfigurationModel, workspaceConfiguration, folderConfigurationModels, ConfigurationModel.createEmptyModel(this.logService), new ResourceMap(), this.workspace, this.logService);
    this.initialized = true;
    if (trigger) {
      const change = this._configuration.compare(currentConfiguration);
      this.triggerConfigurationChange(change, { data: currentConfiguration.toData(), workspace: this.workspace }, ConfigurationTarget.WORKSPACE);
    }
    this.updateRestrictedSettings();
  }
  getWorkspaceConfigurationModel(folderConfigurations) {
    switch (this.getWorkbenchState()) {
      case WorkbenchState.FOLDER:
        return folderConfigurations[0];
      case WorkbenchState.WORKSPACE:
        return this.workspaceConfiguration.getConfiguration();
      default:
        return ConfigurationModel.createEmptyModel(this.logService);
    }
  }
  onUserDataProfileChanged(e) {
    e.join((async () => {
      const promises = [];
      promises.push(this.localUserConfiguration.reset(e.profile.settingsResource, e.profile.tasksResource, e.profile.mcpResource, { scopes: getLocalUserConfigurationScopes(e.profile, !!this.remoteUserConfiguration) }));
      if (e.previous.isDefault !== e.profile.isDefault || !!e.previous.useDefaultFlags?.settings !== !!e.profile.useDefaultFlags?.settings) {
        this.createApplicationConfiguration();
        if (this.applicationConfiguration) {
          promises.push(this.reloadApplicationConfiguration(true));
        }
      }
      let [localUser, application] = await Promise.all(promises);
      application = application ?? this._configuration.applicationConfiguration;
      if (this.applicationConfiguration) {
        localUser = this.localUserConfiguration.reparse({ exclude: application.getValue(APPLY_ALL_PROFILES_SETTING) });
      }
      await this.loadConfiguration(application, localUser, this._configuration.remoteUserConfiguration, true);
    })());
  }
  onDefaultConfigurationChanged(configurationModel, properties) {
    if (this.workspace) {
      const previousData = this._configuration.toData();
      const change = this._configuration.compareAndUpdateDefaultConfiguration(configurationModel, properties);
      if (this.applicationConfiguration) {
        this._configuration.updateApplicationConfiguration(this.applicationConfiguration.reparse());
      }
      if (this.remoteUserConfiguration) {
        this._configuration.updateLocalUserConfiguration(this.localUserConfiguration.reparse());
        this._configuration.updateRemoteUserConfiguration(this.remoteUserConfiguration.reparse());
      }
      if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
        const folderConfiguration = this.cachedFolderConfigs.get(this.workspace.folders[0].uri);
        if (folderConfiguration) {
          this._configuration.updateWorkspaceConfiguration(folderConfiguration.reparse());
          this._configuration.updateFolderConfiguration(this.workspace.folders[0].uri, folderConfiguration.reparse());
        }
      } else {
        this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.reparseWorkspaceSettings());
        for (const folder of this.workspace.folders) {
          const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
          if (folderConfiguration) {
            this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration.reparse());
          }
        }
      }
      this.triggerConfigurationChange(change, { data: previousData, workspace: this.workspace }, ConfigurationTarget.DEFAULT);
      this.updateRestrictedSettings();
    }
  }
  onPolicyConfigurationChanged(policyConfiguration) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const change = this._configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
    this.triggerConfigurationChange(change, previous, ConfigurationTarget.DEFAULT);
  }
  onApplicationConfigurationChanged(applicationConfiguration) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const previousAllProfilesSettings = this._configuration.applicationConfiguration.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    const change = this._configuration.compareAndUpdateApplicationConfiguration(applicationConfiguration);
    const currentAllProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    const configurationProperties = this.configurationRegistry.getConfigurationProperties();
    const changedKeys = [];
    for (const changedKey of change.keys) {
      const scope = configurationProperties[changedKey]?.scope;
      if (scope && APPLICATION_SCOPES.includes(scope)) {
        changedKeys.push(changedKey);
        if (changedKey === APPLY_ALL_PROFILES_SETTING) {
          for (const previousAllProfileSetting of previousAllProfilesSettings) {
            if (!currentAllProfilesSettings.includes(previousAllProfileSetting)) {
              changedKeys.push(previousAllProfileSetting);
            }
          }
          for (const currentAllProfileSetting of currentAllProfilesSettings) {
            if (!previousAllProfilesSettings.includes(currentAllProfileSetting)) {
              changedKeys.push(currentAllProfileSetting);
            }
          }
        }
      } else if (currentAllProfilesSettings.includes(changedKey)) {
        changedKeys.push(changedKey);
      }
    }
    change.keys = changedKeys;
    if (change.keys.includes(APPLY_ALL_PROFILES_SETTING)) {
      this._configuration.updateLocalUserConfiguration(this.localUserConfiguration.reparse({ exclude: currentAllProfilesSettings }));
    }
    this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
  }
  onLocalUserConfigurationChanged(userConfiguration) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const change = this._configuration.compareAndUpdateLocalUserConfiguration(userConfiguration);
    this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
  }
  onRemoteUserConfigurationChanged(userConfiguration) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const change = this._configuration.compareAndUpdateRemoteUserConfiguration(userConfiguration);
    this.triggerConfigurationChange(change, previous, ConfigurationTarget.USER);
  }
  async onWorkspaceConfigurationChanged(fromCache) {
    if (this.workspace && this.workspace.configuration) {
      let newFolders = toWorkspaceFolders(this.workspaceConfiguration.getFolders(), this.workspace.configuration, this.uriIdentityService.extUri);
      if (this.workspace.initialized) {
        const { added, removed, changed } = this.compareFolders(this.workspace.folders, newFolders);
        if (added.length || removed.length || changed.length) {
          newFolders = await this.toValidWorkspaceFolders(newFolders);
        } else {
          newFolders = this.workspace.folders;
        }
      }
      await this.updateWorkspaceConfiguration(newFolders, this.workspaceConfiguration.getConfiguration(), fromCache);
    }
  }
  updateRestrictedSettings() {
    const changed = [];
    const allProperties = this.configurationRegistry.getConfigurationProperties();
    const defaultRestrictedSettings = Object.keys(allProperties).filter((key) => allProperties[key].restricted).sort((a, b) => a.localeCompare(b));
    const defaultDelta = delta(defaultRestrictedSettings, this._restrictedSettings.default, (a, b) => a.localeCompare(b));
    changed.push(...defaultDelta.added, ...defaultDelta.removed);
    const application = (this.applicationConfiguration?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
    const applicationDelta = delta(application, this._restrictedSettings.application || [], (a, b) => a.localeCompare(b));
    changed.push(...applicationDelta.added, ...applicationDelta.removed);
    const userLocal = this.localUserConfiguration.getRestrictedSettings().sort((a, b) => a.localeCompare(b));
    const userLocalDelta = delta(userLocal, this._restrictedSettings.userLocal || [], (a, b) => a.localeCompare(b));
    changed.push(...userLocalDelta.added, ...userLocalDelta.removed);
    const userRemote = (this.remoteUserConfiguration?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
    const userRemoteDelta = delta(userRemote, this._restrictedSettings.userRemote || [], (a, b) => a.localeCompare(b));
    changed.push(...userRemoteDelta.added, ...userRemoteDelta.removed);
    const workspaceFolderMap = new ResourceMap();
    for (const workspaceFolder of this.workspace.folders) {
      const cachedFolderConfig = this.cachedFolderConfigs.get(workspaceFolder.uri);
      const folderRestrictedSettings = (cachedFolderConfig?.getRestrictedSettings() || []).sort((a, b) => a.localeCompare(b));
      if (folderRestrictedSettings.length) {
        workspaceFolderMap.set(workspaceFolder.uri, folderRestrictedSettings);
      }
      const previous = this._restrictedSettings.workspaceFolder?.get(workspaceFolder.uri) || [];
      const workspaceFolderDelta = delta(folderRestrictedSettings, previous, (a, b) => a.localeCompare(b));
      changed.push(...workspaceFolderDelta.added, ...workspaceFolderDelta.removed);
    }
    const workspace = this.getWorkbenchState() === WorkbenchState.WORKSPACE ? this.workspaceConfiguration.getRestrictedSettings().sort((a, b) => a.localeCompare(b)) : this.workspace.folders[0] ? workspaceFolderMap.get(this.workspace.folders[0].uri) || [] : [];
    const workspaceDelta = delta(workspace, this._restrictedSettings.workspace || [], (a, b) => a.localeCompare(b));
    changed.push(...workspaceDelta.added, ...workspaceDelta.removed);
    if (changed.length) {
      this._restrictedSettings = {
        default: defaultRestrictedSettings,
        application: application.length ? application : void 0,
        userLocal: userLocal.length ? userLocal : void 0,
        userRemote: userRemote.length ? userRemote : void 0,
        workspace: workspace.length ? workspace : void 0,
        workspaceFolder: workspaceFolderMap.size ? workspaceFolderMap : void 0
      };
      this._onDidChangeRestrictedSettings.fire(this.restrictedSettings);
    }
  }
  async updateWorkspaceConfiguration(workspaceFolders, configuration, fromCache) {
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const change = this._configuration.compareAndUpdateWorkspaceConfiguration(configuration);
    const changes = this.compareFolders(this.workspace.folders, workspaceFolders);
    if (changes.added.length || changes.removed.length || changes.changed.length) {
      this.workspace.folders = workspaceFolders;
      const change2 = await this.onFoldersChanged();
      await this.handleWillChangeWorkspaceFolders(changes, fromCache);
      this.triggerConfigurationChange(change2, previous, ConfigurationTarget.WORKSPACE_FOLDER);
      this._onDidChangeWorkspaceFolders.fire(changes);
    } else {
      this.triggerConfigurationChange(change, previous, ConfigurationTarget.WORKSPACE);
    }
    this.updateRestrictedSettings();
  }
  async handleWillChangeWorkspaceFolders(changes, fromCache) {
    const joiners = [];
    this._onWillChangeWorkspaceFolders.fire({
      join(updateWorkspaceTrustStatePromise) {
        joiners.push(updateWorkspaceTrustStatePromise);
      },
      changes,
      fromCache
    });
    try {
      await Promises.settled(joiners);
    } catch (error) {
    }
  }
  async onWorkspaceFolderConfigurationChanged(folder) {
    const [folderConfiguration] = await this.loadFolderConfigurations([folder]);
    const previous = { data: this._configuration.toData(), workspace: this.workspace };
    const folderConfigurationChange = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderConfiguration);
    if (this.getWorkbenchState() === WorkbenchState.FOLDER) {
      const workspaceConfigurationChange = this._configuration.compareAndUpdateWorkspaceConfiguration(folderConfiguration);
      this.triggerConfigurationChange(mergeChanges(folderConfigurationChange, workspaceConfigurationChange), previous, ConfigurationTarget.WORKSPACE);
    } else {
      this.triggerConfigurationChange(folderConfigurationChange, previous, ConfigurationTarget.WORKSPACE_FOLDER);
    }
    this.updateRestrictedSettings();
  }
  async onFoldersChanged() {
    const changes = [];
    for (const key of this.cachedFolderConfigs.keys()) {
      if (!this.workspace.folders.filter((folder) => folder.uri.toString() === key.toString())[0]) {
        this.cachedFolderConfigs.deleteAndDispose(key);
        changes.push(this._configuration.compareAndDeleteFolderConfiguration(key));
      }
    }
    const toInitialize = this.workspace.folders.filter((folder) => !this.cachedFolderConfigs.has(folder.uri));
    if (toInitialize.length) {
      const folderConfigurations = await this.loadFolderConfigurations(toInitialize);
      folderConfigurations.forEach((folderConfiguration, index) => {
        changes.push(this._configuration.compareAndUpdateFolderConfiguration(toInitialize[index].uri, folderConfiguration));
      });
    }
    return mergeChanges(...changes);
  }
  loadFolderConfigurations(folders) {
    return Promise.all([...folders.map((folder) => {
      let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
      if (!folderConfiguration) {
        folderConfiguration = new FolderConfiguration(!this.initialized, folder, FOLDER_CONFIG_FOLDER_NAME, this.getWorkbenchState(), this.isWorkspaceTrusted, this.fileService, this.uriIdentityService, this.logService, this.configurationCache);
        folderConfiguration.addRelated(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
        this.cachedFolderConfigs.set(folder.uri, folderConfiguration);
      }
      return folderConfiguration.loadConfiguration();
    })]);
  }
  async validateWorkspaceFoldersAndReload(fromCache) {
    const validWorkspaceFolders = await this.toValidWorkspaceFolders(this.workspace.folders);
    const { removed } = this.compareFolders(this.workspace.folders, validWorkspaceFolders);
    if (removed.length) {
      await this.updateWorkspaceConfiguration(validWorkspaceFolders, this.workspaceConfiguration.getConfiguration(), fromCache);
    }
  }
  // Filter out workspace folders which are files (not directories)
  // Workspace folders those cannot be resolved are not filtered because they are handled by the Explorer.
  async toValidWorkspaceFolders(workspaceFolders) {
    const validWorkspaceFolders = [];
    for (const workspaceFolder of workspaceFolders) {
      try {
        const result = await this.fileService.stat(workspaceFolder.uri);
        if (!result.isDirectory) {
          continue;
        }
      } catch (e) {
        this.logService.warn(`Ignoring the error while validating workspace folder ${workspaceFolder.uri.toString()} - ${toErrorMessage(e)}`);
      }
      validWorkspaceFolders.push(workspaceFolder);
    }
    return validWorkspaceFolders;
  }
  async writeConfigurationValue(key, value, target, overrides, options) {
    if (!this.instantiationService) {
      throw new Error("Cannot write configuration because the configuration service is not yet ready to accept writes.");
    }
    if (target === ConfigurationTarget.DEFAULT) {
      throw new Error("Invalid configuration target");
    }
    if (target === ConfigurationTarget.MEMORY) {
      const previous = { data: this._configuration.toData(), workspace: this.workspace };
      this._configuration.updateValue(key, value, overrides);
      this.triggerConfigurationChange({ keys: overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key], overrides: overrides?.overrideIdentifiers?.length ? overrides.overrideIdentifiers.map((overrideIdentifier) => [overrideIdentifier, [key]]) : [] }, previous, target);
      return;
    }
    const editableConfigurationTarget = this.toEditableConfigurationTarget(target, key);
    if (!editableConfigurationTarget) {
      throw new Error("Invalid configuration target");
    }
    if (editableConfigurationTarget === EditableConfigurationTarget.USER_REMOTE && !this.remoteUserConfiguration) {
      throw new Error("Invalid configuration target");
    }
    if (overrides?.overrideIdentifiers?.length && overrides.overrideIdentifiers.length > 1) {
      const configurationModel = this.getConfigurationModelForEditableConfigurationTarget(editableConfigurationTarget, overrides.resource);
      if (configurationModel) {
        const overrideIdentifiers = overrides.overrideIdentifiers.sort();
        const existingOverrides = configurationModel.overrides.find((override) => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
        if (existingOverrides) {
          overrides.overrideIdentifiers = existingOverrides.identifiers;
        }
      }
    }
    this.configurationEditing = this.configurationEditing ?? this.createConfigurationEditingService(this.instantiationService);
    await (await this.configurationEditing).writeConfiguration(editableConfigurationTarget, { key, value }, { scopes: overrides, ...options });
    switch (editableConfigurationTarget) {
      case EditableConfigurationTarget.USER_LOCAL:
        if (this.applicationConfiguration && this.isSettingAppliedForAllProfiles(key)) {
          await this.reloadApplicationConfiguration();
        } else {
          await this.reloadLocalUserConfiguration();
        }
        return;
      case EditableConfigurationTarget.USER_REMOTE:
        return this.reloadRemoteUserConfiguration().then(() => void 0);
      case EditableConfigurationTarget.WORKSPACE:
        return this.reloadWorkspaceConfiguration();
      case EditableConfigurationTarget.WORKSPACE_FOLDER: {
        const workspaceFolder = overrides && overrides.resource ? this.workspace.getFolder(overrides.resource) : null;
        if (workspaceFolder) {
          return this.reloadWorkspaceFolderConfiguration(workspaceFolder);
        }
      }
    }
  }
  async createConfigurationEditingService(instantiationService) {
    const remoteSettingsResource = (await this.remoteAgentService.getEnvironment())?.settingsPath ?? null;
    return instantiationService.createInstance(ConfigurationEditing, remoteSettingsResource);
  }
  getConfigurationModelForEditableConfigurationTarget(target, resource) {
    switch (target) {
      case EditableConfigurationTarget.USER_LOCAL:
        return this._configuration.localUserConfiguration;
      case EditableConfigurationTarget.USER_REMOTE:
        return this._configuration.remoteUserConfiguration;
      case EditableConfigurationTarget.WORKSPACE:
        return this._configuration.workspaceConfiguration;
      case EditableConfigurationTarget.WORKSPACE_FOLDER:
        return resource ? this._configuration.folderConfigurations.get(resource) : void 0;
    }
  }
  getConfigurationModel(target, resource) {
    switch (target) {
      case ConfigurationTarget.USER_LOCAL:
        return this._configuration.localUserConfiguration;
      case ConfigurationTarget.USER_REMOTE:
        return this._configuration.remoteUserConfiguration;
      case ConfigurationTarget.WORKSPACE:
        return this._configuration.workspaceConfiguration;
      case ConfigurationTarget.WORKSPACE_FOLDER:
        return resource ? this._configuration.folderConfigurations.get(resource) : void 0;
      default:
        return void 0;
    }
  }
  deriveConfigurationTargets(key, value, inspect) {
    if (equals(value, inspect.value)) {
      return [];
    }
    const definedTargets = [];
    if (inspect.workspaceFolderValue !== void 0) {
      definedTargets.push(ConfigurationTarget.WORKSPACE_FOLDER);
    }
    if (inspect.workspaceValue !== void 0) {
      definedTargets.push(ConfigurationTarget.WORKSPACE);
    }
    if (inspect.userRemoteValue !== void 0) {
      definedTargets.push(ConfigurationTarget.USER_REMOTE);
    }
    if (inspect.userLocalValue !== void 0) {
      definedTargets.push(ConfigurationTarget.USER_LOCAL);
    }
    if (inspect.applicationValue !== void 0) {
      definedTargets.push(ConfigurationTarget.APPLICATION);
    }
    if (value === void 0) {
      return definedTargets;
    }
    return [definedTargets[0] || ConfigurationTarget.USER];
  }
  triggerConfigurationChange(change, previous, target) {
    if (change.keys.length) {
      if (target !== ConfigurationTarget.DEFAULT) {
        this.logService.debug(`Configuration keys changed in ${ConfigurationTargetToString(target)} target`, ...change.keys);
      }
      const configurationChangeEvent = new ConfigurationChangeEvent(change, previous, this._configuration, this.workspace, this.logService);
      configurationChangeEvent.source = target;
      this._onDidChangeConfiguration.fire(configurationChangeEvent);
    }
  }
  toEditableConfigurationTarget(target, key) {
    if (target === ConfigurationTarget.APPLICATION) {
      return EditableConfigurationTarget.USER_LOCAL;
    }
    if (target === ConfigurationTarget.USER) {
      if (this.remoteUserConfiguration) {
        const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
        if (scope === ConfigurationScope.MACHINE || scope === ConfigurationScope.MACHINE_OVERRIDABLE || scope === ConfigurationScope.APPLICATION_MACHINE) {
          return EditableConfigurationTarget.USER_REMOTE;
        }
        if (this.inspect(key).userRemoteValue !== void 0) {
          return EditableConfigurationTarget.USER_REMOTE;
        }
      }
      return EditableConfigurationTarget.USER_LOCAL;
    }
    if (target === ConfigurationTarget.USER_LOCAL) {
      return EditableConfigurationTarget.USER_LOCAL;
    }
    if (target === ConfigurationTarget.USER_REMOTE) {
      return EditableConfigurationTarget.USER_REMOTE;
    }
    if (target === ConfigurationTarget.WORKSPACE) {
      return EditableConfigurationTarget.WORKSPACE;
    }
    if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
      return EditableConfigurationTarget.WORKSPACE_FOLDER;
    }
    return null;
  }
}
let RegisterConfigurationSchemasContribution = class extends Disposable {
  constructor(workspaceContextService, environmentService, workspaceTrustManagementService, extensionService, lifecycleService) {
    super();
    this.workspaceContextService = workspaceContextService;
    this.environmentService = environmentService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    extensionService.whenInstalledExtensionsRegistered().then(() => {
      this.registerConfigurationSchemas();
      const configurationRegistry2 = Registry.as(Extensions.Configuration);
      const delayer = this._register(new Delayer(50));
      this._register(Event.any(configurationRegistry2.onDidUpdateConfiguration, configurationRegistry2.onDidSchemaChange, workspaceTrustManagementService.onDidChangeTrust)(() => delayer.trigger(
        () => this.registerConfigurationSchemas(),
        lifecycleService.phase === LifecyclePhase.Eventually ? void 0 : 2500
        /* delay longer in early phases */
      )));
    });
  }
  registerConfigurationSchemas() {
    for (const key of Object.keys(allSettings.properties)) {
      const prop = allSettings.properties[key];
      if (prop.markdownDeprecationMessage && prop.deprecationMessage === prop.markdownDeprecationMessage) {
        prop.deprecationMessage = renderAsPlaintext({ value: fixSettingLinks(prop.markdownDeprecationMessage) });
      }
    }
    const allSettingsSchema = {
      properties: allSettings.properties,
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const userSettingsSchema = this.environmentService.remoteAuthority ? {
      properties: Object.assign(
        {},
        applicationSettings.properties,
        windowSettings.properties,
        resourceSettings.properties
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    } : allSettingsSchema;
    const profileSettingsSchema = {
      properties: Object.assign(
        {},
        machineSettings.properties,
        machineOverridableSettings.properties,
        windowSettings.properties,
        resourceSettings.properties
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const machineSettingsSchema = {
      properties: Object.assign(
        {},
        applicationMachineSettings.properties,
        machineSettings.properties,
        machineOverridableSettings.properties,
        windowSettings.properties,
        resourceSettings.properties
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const workspaceSettingsSchema = {
      properties: Object.assign(
        {},
        this.checkAndFilterPropertiesRequiringTrust(machineOverridableSettings.properties),
        this.checkAndFilterPropertiesRequiringTrust(windowSettings.properties),
        this.checkAndFilterPropertiesRequiringTrust(resourceSettings.properties)
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const defaultSettingsSchema = {
      properties: Object.keys(allSettings.properties).reduce((result, key) => {
        result[key] = Object.assign({ deprecationMessage: void 0 }, allSettings.properties[key]);
        return result;
      }, {}),
      patternProperties: Object.keys(allSettings.patternProperties).reduce((result, key) => {
        result[key] = Object.assign({ deprecationMessage: void 0 }, allSettings.patternProperties[key]);
        return result;
      }, {}),
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    };
    const folderSettingsSchema = WorkbenchState.WORKSPACE === this.workspaceContextService.getWorkbenchState() ? {
      properties: Object.assign(
        {},
        this.checkAndFilterPropertiesRequiringTrust(machineOverridableSettings.properties),
        this.checkAndFilterPropertiesRequiringTrust(resourceSettings.properties)
      ),
      patternProperties: allSettings.patternProperties,
      additionalProperties: true,
      allowTrailingCommas: true,
      allowComments: true
    } : workspaceSettingsSchema;
    const configDefaultsSchema = {
      type: "object",
      description: localize("configurationDefaults.description", "Contribute defaults for configurations"),
      properties: Object.assign(
        {},
        this.filterDefaultOverridableProperties(machineOverridableSettings.properties),
        this.filterDefaultOverridableProperties(windowSettings.properties),
        this.filterDefaultOverridableProperties(resourceSettings.properties)
      ),
      patternProperties: {
        [OVERRIDE_PROPERTY_PATTERN]: {
          type: "object",
          default: {},
          $ref: resourceLanguageSettingsSchemaId
        }
      },
      additionalProperties: false
    };
    this.registerSchemas({
      defaultSettingsSchema,
      userSettingsSchema,
      profileSettingsSchema,
      machineSettingsSchema,
      workspaceSettingsSchema,
      folderSettingsSchema,
      configDefaultsSchema
    });
  }
  registerSchemas(schemas) {
    const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
    jsonRegistry.registerSchema(defaultSettingsSchemaId, schemas.defaultSettingsSchema);
    jsonRegistry.registerSchema(userSettingsSchemaId, schemas.userSettingsSchema);
    jsonRegistry.registerSchema(profileSettingsSchemaId, schemas.profileSettingsSchema);
    jsonRegistry.registerSchema(machineSettingsSchemaId, schemas.machineSettingsSchema);
    jsonRegistry.registerSchema(workspaceSettingsSchemaId, schemas.workspaceSettingsSchema);
    jsonRegistry.registerSchema(folderSettingsSchemaId, schemas.folderSettingsSchema);
    jsonRegistry.registerSchema(configurationDefaultsSchemaId, schemas.configDefaultsSchema);
  }
  checkAndFilterPropertiesRequiringTrust(properties) {
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      return properties;
    }
    const result = {};
    Object.entries(properties).forEach(([key, value]) => {
      if (!value.restricted) {
        result[key] = value;
      }
    });
    return result;
  }
  filterDefaultOverridableProperties(properties) {
    const result = {};
    Object.entries(properties).forEach(([key, value]) => {
      if (!value.disallowConfigurationDefault) {
        result[key] = value;
      }
    });
    return result;
  }
};
RegisterConfigurationSchemasContribution = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IWorkbenchEnvironmentService),
  __decorateParam(2, IWorkspaceTrustManagementService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, ILifecycleService)
], RegisterConfigurationSchemasContribution);
let ConfigurationDefaultOverridesContribution = class extends Disposable {
  constructor(workbenchAssignmentService, extensionService, configurationService, environmentService, logService) {
    super();
    this.workbenchAssignmentService = workbenchAssignmentService;
    this.extensionService = extensionService;
    this.configurationService = configurationService;
    this.environmentService = environmentService;
    this.logService = logService;
    this.processedExperimentalSettings = /* @__PURE__ */ new Set();
    this.autoExperimentalSettings = /* @__PURE__ */ new Set();
    this.configurationRegistry = Registry.as(Extensions.Configuration);
    this.throttler = this._register(new Throttler());
    this.throttler.queue(() => this.updateDefaults());
    this._register(workbenchAssignmentService.onDidRefetchAssignments(() => this.throttler.queue(() => this.processExperimentalSettings(this.autoExperimentalSettings, true))));
    this._register(this.configurationRegistry.onDidUpdateConfiguration(({ properties }) => this.processExperimentalSettings(properties, false)));
  }
  async updateDefaults() {
    this.logService.trace("ConfigurationService#updateDefaults: begin");
    try {
      await this.processExperimentalSettings(Object.keys(this.configurationRegistry.getConfigurationProperties()), false);
    } finally {
      await this.extensionService.whenInstalledExtensionsRegistered();
      this.logService.trace("ConfigurationService#updateDefaults: resetting the defaults");
      this.configurationService.reloadConfiguration(ConfigurationTarget.DEFAULT);
    }
  }
  async processExperimentalSettings(properties, autoRefetch) {
    const overrides = {};
    const allProperties = this.configurationRegistry.getConfigurationProperties();
    const defaultConfigurationsPreventingExperimentOverrides = this.configurationRegistry.getRegisteredDefaultConfigurations().filter((configuration) => configuration.preventExperimentOverride);
    for (const property of properties) {
      const schema = allProperties[property];
      if (!schema?.experiment) {
        continue;
      }
      const defaultValueSource = schema.defaultValueSource && !(schema.defaultValueSource instanceof Map) ? schema.defaultValueSource : void 0;
      if (defaultValueSource && defaultConfigurationsPreventingExperimentOverrides.some((configuration) => isConfigurationDefaultSourceEquals(configuration.source, defaultValueSource) && configuration.overrides?.[property] !== void 0)) {
        continue;
      }
      if (!autoRefetch && this.processedExperimentalSettings.has(property)) {
        continue;
      }
      this.processedExperimentalSettings.add(property);
      if (schema.experiment.mode === "auto") {
        this.autoExperimentalSettings.add(property);
      }
      try {
        const value = await this.workbenchAssignmentService.getTreatment(schema.experiment.name ?? `config.${property}`);
        if (this.shouldOverride(value, schema)) {
          overrides[property] = value;
        }
      } catch (error) {
      }
    }
    if (Object.keys(overrides).length) {
      this.configurationRegistry.registerDefaultConfigurations([{ overrides, source: "experiments" }]);
    }
  }
  shouldOverride(value, schema) {
    if (isUndefined(value)) {
      return false;
    }
    if (this.environmentService.isSessionsWindow && schema.agentsWindow?.default !== void 0) {
      return !equals(value, schema.agentsWindow?.default);
    }
    return !equals(value, schema.default);
  }
};
ConfigurationDefaultOverridesContribution.ID = "workbench.contrib.configurationDefaultOverridesContribution";
ConfigurationDefaultOverridesContribution = __decorateClass([
  __decorateParam(0, IWorkbenchAssignmentService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, ILogService)
], ConfigurationDefaultOverridesContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(RegisterConfigurationSchemasContribution, LifecyclePhase.Restored);
registerWorkbenchContribution2(ConfigurationDefaultOverridesContribution.ID, ConfigurationDefaultOverridesContribution, WorkbenchPhase.BlockRestore);
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    [APPLY_ALL_PROFILES_SETTING]: {
      "type": "array",
      description: localize("setting description", "Configure settings to be applied for all profiles."),
      "default": [],
      "scope": ConfigurationScope.APPLICATION,
      additionalProperties: true,
      uniqueItems: true
    }
  }
});
export {
  WorkspaceService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2Jyb3dzZXIvY29uZmlndXJhdGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBRdWV1ZSwgQmFycmllciwgUHJvbWlzZXMsIERlbGF5ZXIsIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya3NwYWNlIGFzIEJhc2VXb3Jrc3BhY2UsIFdvcmtiZW5jaFN0YXRlLCBJV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50LCBXb3Jrc3BhY2VGb2xkZXIsIHRvV29ya3NwYWNlRm9sZGVyLCBpc1dvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlcnNXaWxsQ2hhbmdlRXZlbnQsIElFbXB0eVdvcmtzcGFjZUlkZW50aWZpZXIsIElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzV29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUlkZW50aWZpZXIsIElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbk1vZGVsLCBDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIG1lcmdlQ2hhbmdlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25Nb2RlbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCwgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIGlzQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgSUNvbmZpZ3VyYXRpb25EYXRhLCBJQ29uZmlndXJhdGlvblZhbHVlLCBJQ29uZmlndXJhdGlvbkNoYW5nZSwgQ29uZmlndXJhdGlvblRhcmdldFRvU3RyaW5nLCBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcywgaXNDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzLCBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVXBkYXRlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVBvbGljeUNvbmZpZ3VyYXRpb24sIE51bGxQb2xpY3lDb25maWd1cmF0aW9uLCBQb2xpY3lDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uTW9kZWxzLmpzJztcbmltcG9ydCB7IEZPTERFUl9DT05GSUdfRk9MREVSX05BTUUsIGRlZmF1bHRTZXR0aW5nc1NjaGVtYUlkLCB1c2VyU2V0dGluZ3NTY2hlbWFJZCwgd29ya3NwYWNlU2V0dGluZ3NTY2hlbWFJZCwgZm9sZGVyU2V0dGluZ3NTY2hlbWFJZCwgSUNvbmZpZ3VyYXRpb25DYWNoZSwgbWFjaGluZVNldHRpbmdzU2NoZW1hSWQsIExPQ0FMX01BQ0hJTkVfU0NPUEVTLCBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsIFJlc3RyaWN0ZWRTZXR0aW5ncywgUFJPRklMRV9TQ09QRVMsIExPQ0FMX01BQ0hJTkVfUFJPRklMRV9TQ09QRVMsIHByb2ZpbGVTZXR0aW5nc1NjaGVtYUlkLCBBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORywgQVBQTElDQVRJT05fU0NPUEVTIH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucywgYWxsU2V0dGluZ3MsIHdpbmRvd1NldHRpbmdzLCByZXNvdXJjZVNldHRpbmdzLCBhcHBsaWNhdGlvblNldHRpbmdzLCBtYWNoaW5lU2V0dGluZ3MsIG1hY2hpbmVPdmVycmlkYWJsZVNldHRpbmdzLCBDb25maWd1cmF0aW9uU2NvcGUsIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIGtleUZyb21PdmVycmlkZUlkZW50aWZpZXJzLCBPVkVSUklERV9QUk9QRVJUWV9QQVRURVJOLCByZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCwgY29uZmlndXJhdGlvbkRlZmF1bHRzU2NoZW1hSWQsIGFwcGxpY2F0aW9uTWFjaGluZVNldHRpbmdzLCBpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzLCBDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJU3RvcmVkV29ya3NwYWNlRm9sZGVyLCBpc1N0b3JlZFdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlckNyZWF0aW9uRGF0YSwgZ2V0U3RvcmVkV29ya3NwYWNlRm9sZGVyLCB0b1dvcmtzcGFjZUZvbGRlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkVkaXRpbmcsIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uL2NvbW1vbi9jb25maWd1cmF0aW9uRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VDb25maWd1cmF0aW9uLCBGb2xkZXJDb25maWd1cmF0aW9uLCBSZW1vdGVVc2VyQ29uZmlndXJhdGlvbiwgVXNlckNvbmZpZ3VyYXRpb24sIERlZmF1bHRDb25maWd1cmF0aW9uLCBBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gfSBmcm9tICcuL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBtYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBXb3JrYmVuY2hQaGFzZSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IGRlbHRhLCBkaXN0aW5jdCwgZXF1YWxzIGFzIGFycmF5RXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Fzc2lnbm1lbnQvY29tbW9uL2Fzc2lnbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRGlkQ2hhbmdlVXNlckRhdGFQcm9maWxlRXZlbnQsIElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVBvbGljeVNlcnZpY2UsIE51bGxQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZSwgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSUpTT05FZGl0aW5nU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9qc29uRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IHJ1bldoZW5XaW5kb3dJZGxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGZpeFNldHRpbmdMaW5rcyB9IGZyb20gJy4uLy4uL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlc01vZGVscy5qcyc7XG5cbmZ1bmN0aW9uIGdldExvY2FsVXNlckNvbmZpZ3VyYXRpb25TY29wZXModXNlckRhdGFQcm9maWxlOiBJVXNlckRhdGFQcm9maWxlLCBoYXNSZW1vdGU6IGJvb2xlYW4pOiBDb25maWd1cmF0aW9uU2NvcGVbXSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGlzRGVmYXVsdFByb2ZpbGUgPSB1c2VyRGF0YVByb2ZpbGUuaXNEZWZhdWx0IHx8IHVzZXJEYXRhUHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LnNldHRpbmdzO1xuXHRpZiAoaXNEZWZhdWx0UHJvZmlsZSkge1xuXHRcdHJldHVybiBoYXNSZW1vdGUgPyBMT0NBTF9NQUNISU5FX1NDT1BFUyA6IHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gaGFzUmVtb3RlID8gTE9DQUxfTUFDSElORV9QUk9GSUxFX1NDT1BFUyA6IFBST0ZJTEVfU0NPUEVTO1xufVxuXG5jbGFzcyBXb3Jrc3BhY2UgZXh0ZW5kcyBCYXNlV29ya3NwYWNlIHtcblx0aW5pdGlhbGl6ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Uge1xuXG5cdHB1YmxpYyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB3b3Jrc3BhY2UhOiBXb3Jrc3BhY2U7XG5cdHByaXZhdGUgaW5pdFJlbW90ZVVzZXJDb25maWd1cmF0aW9uQmFycmllcjogQmFycmllcjtcblx0cHJpdmF0ZSBjb21wbGV0ZVdvcmtzcGFjZUJhcnJpZXI6IEJhcnJpZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvbkNhY2hlOiBJQ29uZmlndXJhdGlvbkNhY2hlO1xuXHRwcml2YXRlIF9jb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIGluaXRpYWxpemVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdENvbmZpZ3VyYXRpb246IERlZmF1bHRDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBvbGljeUNvbmZpZ3VyYXRpb246IElQb2xpY3lDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIGFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbjogQXBwbGljYXRpb25Db25maWd1cmF0aW9uIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgYXBwbGljYXRpb25Db25maWd1cmF0aW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbFVzZXJDb25maWd1cmF0aW9uOiBVc2VyQ29uZmlndXJhdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSByZW1vdGVVc2VyQ29uZmlndXJhdGlvbjogUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb25maWd1cmF0aW9uOiBXb3Jrc3BhY2VDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIGNhY2hlZEZvbGRlckNvbmZpZ3M6IERpc3Bvc2FibGVNYXA8VVJJLCBGb2xkZXJDb25maWd1cmF0aW9uPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwKG5ldyBSZXNvdXJjZU1hcCgpKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlRWRpdGluZ1F1ZXVlOiBRdWV1ZTx2b2lkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb246IEVtaXR0ZXI8SUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRXZlbnQ8SUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbldpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzOiBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnM6IEV2ZW50PElXb3Jrc3BhY2VGb2xkZXJzV2lsbENoYW5nZUV2ZW50PiA9IHRoaXMuX29uV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzOiBFbWl0dGVyPElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnM6IEV2ZW50PElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya3NwYWNlTmFtZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlTmFtZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlOiBFbWl0dGVyPFdvcmtiZW5jaFN0YXRlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdvcmtiZW5jaFN0YXRlPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGU6IEV2ZW50PFdvcmtiZW5jaFN0YXRlPiA9IHRoaXMuX29uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSBpc1dvcmtzcGFjZVRydXN0ZWQ6IGJvb2xlYW4gPSB0cnVlO1xuXG5cdHByaXZhdGUgX3Jlc3RyaWN0ZWRTZXR0aW5nczogUmVzdHJpY3RlZFNldHRpbmdzID0geyBkZWZhdWx0OiBbXSB9O1xuXHRnZXQgcmVzdHJpY3RlZFNldHRpbmdzKCkgeyByZXR1cm4gdGhpcy5fcmVzdHJpY3RlZFNldHRpbmdzOyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVzdHJpY3RlZFNldHRpbmdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8UmVzdHJpY3RlZFNldHRpbmdzPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVzdHJpY3RlZFNldHRpbmdzID0gdGhpcy5fb25EaWRDaGFuZ2VSZXN0cmljdGVkU2V0dGluZ3MuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uUmVnaXN0cnk6IElDb25maWd1cmF0aW9uUmVnaXN0cnk7XG5cblx0cHJpdmF0ZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNvbmZpZ3VyYXRpb25FZGl0aW5nOiBQcm9taXNlPENvbmZpZ3VyYXRpb25FZGl0aW5nPiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR7IHJlbW90ZUF1dGhvcml0eSwgY29uZmlndXJhdGlvbkNhY2hlIH06IHsgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nOyBjb25maWd1cmF0aW9uQ2FjaGU6IElDb25maWd1cmF0aW9uQ2FjaGUgfSxcblx0XHRlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHBvbGljeVNlcnZpY2U6IElQb2xpY3lTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cblx0XHR0aGlzLmluaXRSZW1vdGVVc2VyQ29uZmlndXJhdGlvbkJhcnJpZXIgPSBuZXcgQmFycmllcigpO1xuXHRcdHRoaXMuY29tcGxldGVXb3Jrc3BhY2VCYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblx0XHR0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlZmF1bHRDb25maWd1cmF0aW9uKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQsIGNvbmZpZ3VyYXRpb25DYWNoZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5wb2xpY3lDb25maWd1cmF0aW9uID0gcG9saWN5U2VydmljZSBpbnN0YW5jZW9mIE51bGxQb2xpY3lTZXJ2aWNlID8gbmV3IE51bGxQb2xpY3lDb25maWd1cmF0aW9uKCkgOiB0aGlzLl9yZWdpc3RlcihuZXcgUG9saWN5Q29uZmlndXJhdGlvbih0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uLCBwb2xpY3lTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uQ2FjaGUgPSBjb25maWd1cmF0aW9uQ2FjaGU7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbiA9IG5ldyBDb25maWd1cmF0aW9uKHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLCB0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLCBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSwgQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksIENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLCBDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSwgbmV3IFJlc291cmNlTWFwKCksIENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLCBuZXcgUmVzb3VyY2VNYXA8Q29uZmlndXJhdGlvbk1vZGVsPigpLCB0aGlzLndvcmtzcGFjZSwgbG9nU2VydmljZSk7XG5cdFx0dGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy5jcmVhdGVBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oKTtcblx0XHR0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgVXNlckNvbmZpZ3VyYXRpb24odXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnRhc2tzUmVzb3VyY2UsIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubWNwUmVzb3VyY2UsIHsgc2NvcGVzOiBnZXRMb2NhbFVzZXJDb25maWd1cmF0aW9uU2NvcGVzKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUsICEhcmVtb3RlQXV0aG9yaXR5KSB9LCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbih1c2VyQ29uZmlndXJhdGlvbiA9PiB0aGlzLm9uTG9jYWxVc2VyQ29uZmlndXJhdGlvbkNoYW5nZWQodXNlckNvbmZpZ3VyYXRpb24pKSk7XG5cdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0Y29uc3QgcmVtb3RlVXNlckNvbmZpZ3VyYXRpb24gPSB0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlbW90ZVVzZXJDb25maWd1cmF0aW9uKHJlbW90ZUF1dGhvcml0eSwgY29uZmlndXJhdGlvbkNhY2hlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCByZW1vdGVBZ2VudFNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlbW90ZVVzZXJDb25maWd1cmF0aW9uLm9uRGlkSW5pdGlhbGl6ZShyZW1vdGVVc2VyQ29uZmlndXJhdGlvbk1vZGVsID0+IHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKHJlbW90ZVVzZXJDb25maWd1cmF0aW9uTW9kZWwgPT4gdGhpcy5vblJlbW90ZVVzZXJDb25maWd1cmF0aW9uQ2hhbmdlZChyZW1vdGVVc2VyQ29uZmlndXJhdGlvbk1vZGVsKSkpO1xuXHRcdFx0XHR0aGlzLm9uUmVtb3RlVXNlckNvbmZpZ3VyYXRpb25DaGFuZ2VkKHJlbW90ZVVzZXJDb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdFx0XHR0aGlzLmluaXRSZW1vdGVVc2VyQ29uZmlndXJhdGlvbkJhcnJpZXIub3BlbigpO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmluaXRSZW1vdGVVc2VyQ29uZmlndXJhdGlvbkJhcnJpZXIub3BlbigpO1xuXHRcdH1cblxuXHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBXb3Jrc3BhY2VDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25DYWNoZSwgZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24oZnJvbUNhY2hlID0+IHtcblx0XHRcdHRoaXMub25Xb3Jrc3BhY2VDb25maWd1cmF0aW9uQ2hhbmdlZChmcm9tQ2FjaGUpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLndvcmtzcGFjZS5pbml0aWFsaXplZCA9IHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5pbml0aWFsaXplZDtcblx0XHRcdFx0dGhpcy5jaGVja0FuZE1hcmtXb3Jrc3BhY2VDb21wbGV0ZShmcm9tQ2FjaGUpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKHsgcHJvcGVydGllcywgZGVmYXVsdHMgfSkgPT4gdGhpcy5vbkRlZmF1bHRDb25maWd1cmF0aW9uQ2hhbmdlZChkZWZhdWx0cywgcHJvcGVydGllcykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25Nb2RlbCA9PiB0aGlzLm9uUG9saWN5Q29uZmlndXJhdGlvbkNoYW5nZWQoY29uZmlndXJhdGlvbk1vZGVsKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IHRoaXMub25Vc2VyRGF0YVByb2ZpbGVDaGFuZ2VkKGUpKSk7XG5cblx0XHR0aGlzLndvcmtzcGFjZUVkaXRpbmdRdWV1ZSA9IG5ldyBRdWV1ZTx2b2lkPigpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25EaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGlmICh0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaXNEZWZhdWx0IHx8IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS51c2VEZWZhdWx0RmxhZ3M/LnNldHRpbmdzKSB7XG5cdFx0XHR0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbiA9IG51bGw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uID0gdGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25EaXNwb3NhYmxlcy5hZGQodGhpcy5fcmVnaXN0ZXIobmV3IEFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbih0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy5sb2dTZXJ2aWNlKSkpO1xuXHRcdFx0dGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25EaXNwb3NhYmxlcy5hZGQodGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25Nb2RlbCA9PiB0aGlzLm9uQXBwbGljYXRpb25Db25maWd1cmF0aW9uQ2hhbmdlZChjb25maWd1cmF0aW9uTW9kZWwpKSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gV29ya3NwYWNlIENvbnRleHQgU2VydmljZSBJbXBsXG5cblx0cHVibGljIGFzeW5jIGdldENvbXBsZXRlV29ya3NwYWNlKCk6IFByb21pc2U8V29ya3NwYWNlPiB7XG5cdFx0YXdhaXQgdGhpcy5jb21wbGV0ZVdvcmtzcGFjZUJhcnJpZXIud2FpdCgpO1xuXHRcdHJldHVybiB0aGlzLmdldFdvcmtzcGFjZSgpO1xuXHR9XG5cblx0cHVibGljIGdldFdvcmtzcGFjZSgpOiBXb3Jrc3BhY2Uge1xuXHRcdHJldHVybiB0aGlzLndvcmtzcGFjZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXb3JrYmVuY2hTdGF0ZSgpOiBXb3JrYmVuY2hTdGF0ZSB7XG5cdFx0Ly8gV29ya3NwYWNlIGhhcyBjb25maWd1cmF0aW9uIGZpbGVcblx0XHRpZiAodGhpcy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbikge1xuXHRcdFx0cmV0dXJuIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblx0XHR9XG5cblx0XHQvLyBGb2xkZXIgaGFzIHNpbmdsZSByb290XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gV29ya2JlbmNoU3RhdGUuRk9MREVSO1xuXHRcdH1cblxuXHRcdC8vIEVtcHR5XG5cdFx0cmV0dXJuIFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHR9XG5cblx0cHVibGljIGhhc1dvcmtzcGFjZURhdGEoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlOiBVUkkpOiBJV29ya3NwYWNlRm9sZGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlLmdldEZvbGRlcihyZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgYWRkRm9sZGVycyhmb2xkZXJzVG9BZGQ6IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSwgaW5kZXg/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGVGb2xkZXJzKGZvbGRlcnNUb0FkZCwgW10sIGluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVGb2xkZXJzKGZvbGRlcnNUb1JlbW92ZTogVVJJW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGVGb2xkZXJzKFtdLCBmb2xkZXJzVG9SZW1vdmUpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHVwZGF0ZUZvbGRlcnMoZm9sZGVyc1RvQWRkOiBJV29ya3NwYWNlRm9sZGVyQ3JlYXRpb25EYXRhW10sIGZvbGRlcnNUb1JlbW92ZTogVVJJW10sIGluZGV4PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlRWRpdGluZ1F1ZXVlLnF1ZXVlKCgpID0+IHRoaXMuZG9VcGRhdGVGb2xkZXJzKGZvbGRlcnNUb0FkZCwgZm9sZGVyc1RvUmVtb3ZlLCBpbmRleCkpO1xuXHR9XG5cblx0cHVibGljIGlzSW5zaWRlV29ya3NwYWNlKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLmdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgaXNDdXJyZW50V29ya3NwYWNlKHdvcmtzcGFjZUlkT3JGb2xkZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIgfCBVUkkpOiBib29sZWFuIHtcblx0XHRzd2l0Y2ggKHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKSkge1xuXHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5GT0xERVI6IHtcblx0XHRcdFx0bGV0IGZvbGRlclVyaTogVVJJIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKHdvcmtzcGFjZUlkT3JGb2xkZXIpKSB7XG5cdFx0XHRcdFx0Zm9sZGVyVXJpID0gd29ya3NwYWNlSWRPckZvbGRlcjtcblx0XHRcdFx0fSBlbHNlIGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlSWRPckZvbGRlcikpIHtcblx0XHRcdFx0XHRmb2xkZXJVcmkgPSB3b3Jrc3BhY2VJZE9yRm9sZGVyLnVyaTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBVUkkuaXNVcmkoZm9sZGVyVXJpKSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChmb2xkZXJVcmksIHRoaXMud29ya3NwYWNlLmZvbGRlcnNbMF0udXJpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFOlxuXHRcdFx0XHRyZXR1cm4gaXNXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZUlkT3JGb2xkZXIpICYmIHRoaXMud29ya3NwYWNlLmlkID09PSB3b3Jrc3BhY2VJZE9yRm9sZGVyLmlkO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvVXBkYXRlRm9sZGVycyhmb2xkZXJzVG9BZGQ6IElXb3Jrc3BhY2VGb2xkZXJDcmVhdGlvbkRhdGFbXSwgZm9sZGVyc1RvUmVtb3ZlOiBVUklbXSwgaW5kZXg/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTsgLy8gd2UgbmVlZCBhIHdvcmtzcGFjZSB0byBiZWdpbiB3aXRoXG5cdFx0fVxuXG5cdFx0aWYgKGZvbGRlcnNUb0FkZC5sZW5ndGggKyBmb2xkZXJzVG9SZW1vdmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7IC8vIG5vdGhpbmcgdG8gZG9cblx0XHR9XG5cblx0XHRsZXQgZm9sZGVyc0hhdmVDaGFuZ2VkID0gZmFsc2U7XG5cblx0XHQvLyBSZW1vdmUgZmlyc3QgKGlmIGFueSlcblx0XHRsZXQgY3VycmVudFdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0bGV0IG5ld1N0b3JlZEZvbGRlcnM6IElTdG9yZWRXb3Jrc3BhY2VGb2xkZXJbXSA9IGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJzLm1hcChmID0+IGYucmF3KS5maWx0ZXIoKGZvbGRlciwgaW5kZXgpOiBmb2xkZXIgaXMgSVN0b3JlZFdvcmtzcGFjZUZvbGRlciA9PiB7XG5cdFx0XHRpZiAoIWlzU3RvcmVkV29ya3NwYWNlRm9sZGVyKGZvbGRlcikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIGtlZXAgZW50cmllcyB3aGljaCBhcmUgdW5yZWxhdGVkXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiAhdGhpcy5jb250YWlucyhmb2xkZXJzVG9SZW1vdmUsIGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJzW2luZGV4XS51cmkpOyAvLyBrZWVwIGVudHJpZXMgd2hpY2ggYXJlIHVucmVsYXRlZFxuXHRcdH0pO1xuXG5cdFx0Zm9sZGVyc0hhdmVDaGFuZ2VkID0gY3VycmVudFdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoICE9PSBuZXdTdG9yZWRGb2xkZXJzLmxlbmd0aDtcblxuXHRcdC8vIEFkZCBhZnRlcndhcmRzIChpZiBhbnkpXG5cdFx0aWYgKGZvbGRlcnNUb0FkZC5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gUmVjb21wdXRlIGN1cnJlbnQgd29ya3NwYWNlIGZvbGRlcnMgaWYgd2UgaGF2ZSBmb2xkZXJzIHRvIGFkZFxuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlnUGF0aCA9IHRoaXMuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbiE7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWdGb2xkZXIgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZGlybmFtZSh3b3Jrc3BhY2VDb25maWdQYXRoKTtcblx0XHRcdGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJzID0gdG9Xb3Jrc3BhY2VGb2xkZXJzKG5ld1N0b3JlZEZvbGRlcnMsIHdvcmtzcGFjZUNvbmZpZ1BhdGgsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaSk7XG5cdFx0XHRjb25zdCBjdXJyZW50V29ya3NwYWNlRm9sZGVyVXJpcyA9IGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSk7XG5cblx0XHRcdGNvbnN0IHN0b3JlZEZvbGRlcnNUb0FkZDogSVN0b3JlZFdvcmtzcGFjZUZvbGRlcltdID0gW107XG5cblx0XHRcdGZvciAoY29uc3QgZm9sZGVyVG9BZGQgb2YgZm9sZGVyc1RvQWRkKSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlclVSSSA9IGZvbGRlclRvQWRkLnVyaTtcblx0XHRcdFx0aWYgKHRoaXMuY29udGFpbnMoY3VycmVudFdvcmtzcGFjZUZvbGRlclVyaXMsIGZvbGRlclVSSSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gYWxyZWFkeSBleGlzdGluZ1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KGZvbGRlclVSSSk7XG5cdFx0XHRcdFx0aWYgKCFyZXN1bHQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZSkgeyAvKiBJZ25vcmUgKi8gfVxuXHRcdFx0XHRzdG9yZWRGb2xkZXJzVG9BZGQucHVzaChnZXRTdG9yZWRXb3Jrc3BhY2VGb2xkZXIoZm9sZGVyVVJJLCBmYWxzZSwgZm9sZGVyVG9BZGQubmFtZSwgd29ya3NwYWNlQ29uZmlnRm9sZGVyLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXBwbHkgdG8gYXJyYXkgb2YgbmV3U3RvcmVkRm9sZGVyc1xuXHRcdFx0aWYgKHN0b3JlZEZvbGRlcnNUb0FkZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGZvbGRlcnNIYXZlQ2hhbmdlZCA9IHRydWU7XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ251bWJlcicgJiYgaW5kZXggPj0gMCAmJiBpbmRleCA8IG5ld1N0b3JlZEZvbGRlcnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0bmV3U3RvcmVkRm9sZGVycyA9IG5ld1N0b3JlZEZvbGRlcnMuc2xpY2UoMCk7XG5cdFx0XHRcdFx0bmV3U3RvcmVkRm9sZGVycy5zcGxpY2UoaW5kZXgsIDAsIC4uLnN0b3JlZEZvbGRlcnNUb0FkZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3U3RvcmVkRm9sZGVycyA9IFsuLi5uZXdTdG9yZWRGb2xkZXJzLCAuLi5zdG9yZWRGb2xkZXJzVG9BZGRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IGZvbGRlcnMgaWYgd2UgcmVjb3JkZWQgYSBjaGFuZ2Vcblx0XHRpZiAoZm9sZGVyc0hhdmVDaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZXRGb2xkZXJzKG5ld1N0b3JlZEZvbGRlcnMpO1xuXHRcdH1cblxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0Rm9sZGVycyhmb2xkZXJzOiBJU3RvcmVkV29ya3NwYWNlRm9sZGVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHVwZGF0ZSB3b3Jrc3BhY2UgZm9sZGVycyBiZWNhdXNlIHdvcmtzcGFjZSBzZXJ2aWNlIGlzIG5vdCB5ZXQgcmVhZHkgdG8gYWNjZXB0IHdyaXRlcy4nKTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5zZXRGb2xkZXJzKGZvbGRlcnMsIGFjY2Vzc29yLmdldChJSlNPTkVkaXRpbmdTZXJ2aWNlKSkpO1xuXHRcdHJldHVybiB0aGlzLm9uV29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZWQoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb250YWlucyhyZXNvdXJjZXM6IFVSSVtdLCB0b0NoZWNrOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcmVzb3VyY2VzLnNvbWUocmVzb3VyY2UgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRvQ2hlY2spKTtcblx0fVxuXG5cdC8vIFdvcmtzcGFjZSBDb25maWd1cmF0aW9uIFNlcnZpY2UgSW1wbFxuXG5cdGdldENvbmZpZ3VyYXRpb25EYXRhKCk6IElDb25maWd1cmF0aW9uRGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCk7XG5cdH1cblxuXHRnZXRWYWx1ZTxUPigpOiBUO1xuXHRnZXRWYWx1ZTxUPihzZWN0aW9uOiBzdHJpbmcpOiBUO1xuXHRnZXRWYWx1ZTxUPihvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogVDtcblx0Z2V0VmFsdWU8VD4oc2VjdGlvbjogc3RyaW5nLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogVDtcblx0Z2V0VmFsdWUoYXJnMT86IHVua25vd24sIGFyZzI/OiB1bmtub3duKTogdW5rbm93biB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IHR5cGVvZiBhcmcxID09PSAnc3RyaW5nJyA/IGFyZzEgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzID0gaXNDb25maWd1cmF0aW9uT3ZlcnJpZGVzKGFyZzEpID8gYXJnMSA6IGlzQ29uZmlndXJhdGlvbk92ZXJyaWRlcyhhcmcyKSA/IGFyZzIgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uZ2V0VmFsdWUoc2VjdGlvbiwgb3ZlcnJpZGVzKTtcblx0fVxuXG5cdHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD47XG5cdHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyB8IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzKTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpOiBQcm9taXNlPHZvaWQ+O1xuXHR1cGRhdGVWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMgfCBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcywgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCBvcHRpb25zPzogSUNvbmZpZ3VyYXRpb25VcGRhdGVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0YXN5bmMgdXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBhcmczPzogdW5rbm93biwgYXJnND86IHVua25vd24sIG9wdGlvbnM/OiBJQ29uZmlndXJhdGlvblVwZGF0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzIHwgdW5kZWZpbmVkID0gaXNDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzKGFyZzMpID8gYXJnM1xuXHRcdFx0OiBpc0NvbmZpZ3VyYXRpb25PdmVycmlkZXMoYXJnMykgPyB7IHJlc291cmNlOiBhcmczLnJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXJzOiBhcmczLm92ZXJyaWRlSWRlbnRpZmllciA/IFthcmczLm92ZXJyaWRlSWRlbnRpZmllcl0gOiB1bmRlZmluZWQgfSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQgfCB1bmRlZmluZWQgPSAob3ZlcnJpZGVzID8gYXJnNCA6IGFyZzMpIGFzIENvbmZpZ3VyYXRpb25UYXJnZXQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdGFyZ2V0czogQ29uZmlndXJhdGlvblRhcmdldFtdID0gdGFyZ2V0ID8gW3RhcmdldF0gOiBbXTtcblxuXHRcdGlmIChvdmVycmlkZXM/Lm92ZXJyaWRlSWRlbnRpZmllcnMpIHtcblx0XHRcdG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzID0gZGlzdGluY3Qob3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMpO1xuXHRcdFx0b3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMgPSBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycy5sZW5ndGggPyBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycyA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRhcmdldHMubGVuZ3RoKSB7XG5cdFx0XHRpZiAob3ZlcnJpZGVzPy5vdmVycmlkZUlkZW50aWZpZXJzICYmIG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb25maWd1cmF0aW9uIFRhcmdldCBpcyByZXF1aXJlZCB3aGlsZSB1cGRhdGluZyB0aGUgdmFsdWUgZm9yIG11bHRpcGxlIG92ZXJyaWRlIGlkZW50aWZpZXJzJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnNwZWN0ID0gdGhpcy5pbnNwZWN0KGtleSwgeyByZXNvdXJjZTogb3ZlcnJpZGVzPy5yZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBvdmVycmlkZXM/Lm92ZXJyaWRlSWRlbnRpZmllcnMgPyBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVyc1swXSA6IHVuZGVmaW5lZCB9KTtcblx0XHRcdHRhcmdldHMucHVzaCguLi50aGlzLmRlcml2ZUNvbmZpZ3VyYXRpb25UYXJnZXRzKGtleSwgdmFsdWUsIGluc3BlY3QpKTtcblxuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBzZXR0aW5nLCBpZiB0aGUgdmFsdWUgaXMgc2FtZSBhcyBkZWZhdWx0IHZhbHVlIGFuZCBpcyB1cGRhdGVkIG9ubHkgaW4gdXNlciB0YXJnZXRcblx0XHRcdGlmIChlcXVhbHModmFsdWUsIGluc3BlY3QuZGVmYXVsdFZhbHVlKSAmJiB0YXJnZXRzLmxlbmd0aCA9PT0gMSAmJiAodGFyZ2V0c1swXSA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSIHx8IHRhcmdldHNbMF0gPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkpIHtcblx0XHRcdFx0dmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh0YXJnZXRzLm1hcCh0YXJnZXQgPT4gdGhpcy53cml0ZUNvbmZpZ3VyYXRpb25WYWx1ZShrZXksIHZhbHVlLCB0YXJnZXQsIG92ZXJyaWRlcywgb3B0aW9ucykpKTtcblx0fVxuXG5cdGFzeW5jIHJlbG9hZENvbmZpZ3VyYXRpb24odGFyZ2V0PzogQ29uZmlndXJhdGlvblRhcmdldCB8IElXb3Jrc3BhY2VGb2xkZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMucmVsb2FkRGVmYXVsdENvbmZpZ3VyYXRpb24oKTtcblx0XHRcdGNvbnN0IGFwcGxpY2F0aW9uID0gYXdhaXQgdGhpcy5yZWxvYWRBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24odHJ1ZSk7XG5cdFx0XHRjb25zdCB7IGxvY2FsLCByZW1vdGUgfSA9IGF3YWl0IHRoaXMucmVsb2FkVXNlckNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdGF3YWl0IHRoaXMucmVsb2FkV29ya3NwYWNlQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0YXdhaXQgdGhpcy5sb2FkQ29uZmlndXJhdGlvbihhcHBsaWNhdGlvbiwgbG9jYWwsIHJlbW90ZSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzV29ya3NwYWNlRm9sZGVyKHRhcmdldCkpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVsb2FkV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbih0YXJnZXQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAodGFyZ2V0KSB7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVDpcblx0XHRcdFx0dGhpcy5yZWxvYWREZWZhdWx0Q29uZmlndXJhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSOiB7XG5cdFx0XHRcdGNvbnN0IHsgbG9jYWwsIHJlbW90ZSB9ID0gYXdhaXQgdGhpcy5yZWxvYWRVc2VyQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmxvYWRDb25maWd1cmF0aW9uKHRoaXMuX2NvbmZpZ3VyYXRpb24uYXBwbGljYXRpb25Db25maWd1cmF0aW9uLCBsb2NhbCwgcmVtb3RlLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw6XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVsb2FkTG9jYWxVc2VyQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRSZW1vdGVVc2VyQ29uZmlndXJhdGlvbigpO1xuXHRcdFx0XHRyZXR1cm47XG5cblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjpcblx0XHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRoYXNDYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24uaGFzQ2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKCk7XG5cdH1cblxuXHRpbnNwZWN0PFQ+KGtleTogc3RyaW5nLCBvdmVycmlkZXM/OiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyk6IElDb25maWd1cmF0aW9uVmFsdWU8VD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmluc3BlY3Q8VD4oa2V5LCBvdmVycmlkZXMpO1xuXHR9XG5cblx0a2V5cygpOiB7XG5cdFx0ZGVmYXVsdDogc3RyaW5nW107XG5cdFx0cG9saWN5OiBzdHJpbmdbXTtcblx0XHR1c2VyOiBzdHJpbmdbXTtcblx0XHR3b3Jrc3BhY2U6IHN0cmluZ1tdO1xuXHRcdHdvcmtzcGFjZUZvbGRlcjogc3RyaW5nW107XG5cdH0ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmtleXMoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB3aGVuUmVtb3RlQ29uZmlndXJhdGlvbkxvYWRlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmluaXRSZW1vdGVVc2VyQ29uZmlndXJhdGlvbkJhcnJpZXIud2FpdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEF0IHByZXNlbnQsIGFsbCB3b3Jrc3BhY2VzIChlbXB0eSwgc2luZ2xlLWZvbGRlciwgbXVsdGktcm9vdCkgaW4gbG9jYWwgYW5kIHJlbW90ZVxuXHQgKiBjYW4gYmUgaW5pdGlhbGl6ZWQgd2l0aG91dCByZXF1aXJpbmcgZXh0ZW5zaW9uIGhvc3QgZXhjZXB0IGZvbGxvd2luZyBjYXNlOlxuXHQgKlxuXHQgKiBBIG11bHRpIHJvb3Qgd29ya3NwYWNlIHdpdGggLmNvZGUtd29ya3NwYWNlIGZpbGUgdGhhdCBoYXMgdG8gYmUgcmVzb2x2ZWQgYnkgYW4gZXh0ZW5zaW9uLlxuXHQgKiBCZWNhdXNlIG9mIHJlYWRvbmx5IGByb290UGF0aGAgcHJvcGVydHkgaW4gZXh0ZW5zaW9uIEFQSSB3ZSBoYXZlIHRvIHJlc29sdmUgbXVsdGkgcm9vdCB3b3Jrc3BhY2Vcblx0ICogYmVmb3JlIGV4dGVuc2lvbiBob3N0IHN0YXJ0cyBzbyB0aGF0IGByb290UGF0aGAgY2FuIGJlIHNldCB0byBmaXJzdCBmb2xkZXIuXG5cdCAqXG5cdCAqIFRoaXMgcmVzdHJpY3Rpb24gaXMgbGlmdGVkIHBhcnRpYWxseSBmb3Igd2ViIGluIGBNYWluVGhyZWFkV29ya3NwYWNlYC5cblx0ICogSW4gd2ViLCB3ZSBzdGFydCBleHRlbnNpb24gaG9zdCB3aXRoIGVtcHR5IGByb290UGF0aGAgaW4gdGhpcyBjYXNlLlxuXHQgKlxuXHQgKiBSZWxhdGVkIHJvb3QgcGF0aCBpc3N1ZSBkaXNjdXNzaW9uIGlzIGJlaW5nIHRyYWNrZWQgaGVyZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82OTMzNVxuXHQgKi9cblx0YXN5bmMgaW5pdGlhbGl6ZShhcmc6IElBbnlXb3Jrc3BhY2VJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bWFyaygnY29kZS93aWxsSW5pdFdvcmtzcGFjZVNlcnZpY2UnKTtcblxuXHRcdGNvbnN0IHRyaWdnZXIgPSB0aGlzLmluaXRpYWxpemVkO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZWQgPSBmYWxzZTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBhd2FpdCB0aGlzLmNyZWF0ZVdvcmtzcGFjZShhcmcpO1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlV29ya3NwYWNlQW5kSW5pdGlhbGl6ZUNvbmZpZ3VyYXRpb24od29ya3NwYWNlLCB0cmlnZ2VyKTtcblx0XHR0aGlzLmNoZWNrQW5kTWFya1dvcmtzcGFjZUNvbXBsZXRlKGZhbHNlKTtcblxuXHRcdG1hcmsoJ2NvZGUvZGlkSW5pdFdvcmtzcGFjZVNlcnZpY2UnKTtcblx0fVxuXG5cdHVwZGF0ZVdvcmtzcGFjZVRydXN0KHRydXN0ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc1dvcmtzcGFjZVRydXN0ZWQgIT09IHRydXN0ZWQpIHtcblx0XHRcdHRoaXMuaXNXb3Jrc3BhY2VUcnVzdGVkID0gdHJ1c3RlZDtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpO1xuXHRcdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVsczogKENvbmZpZ3VyYXRpb25Nb2RlbCB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2UuZm9sZGVycykge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uID0gdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmdldChmb2xkZXIudXJpKTtcblx0XHRcdFx0bGV0IGNvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZm9sZGVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25Nb2RlbCA9IGZvbGRlckNvbmZpZ3VyYXRpb24udXBkYXRlV29ya3NwYWNlVHJ1c3QodGhpcy5pc1dvcmtzcGFjZVRydXN0ZWQpO1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihmb2xkZXIudXJpLCBjb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbHMucHVzaChjb25maWd1cmF0aW9uTW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRk9MREVSKSB7XG5cdFx0XHRcdGlmIChmb2xkZXJDb25maWd1cmF0aW9uTW9kZWxzWzBdKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKGZvbGRlckNvbmZpZ3VyYXRpb25Nb2RlbHNbMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24odGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLnVwZGF0ZVdvcmtzcGFjZVRydXN0KHRoaXMuaXNXb3Jrc3BhY2VUcnVzdGVkKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZVJlc3RyaWN0ZWRTZXR0aW5ncygpO1xuXG5cdFx0XHRsZXQga2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRcdGlmICh0aGlzLnJlc3RyaWN0ZWRTZXR0aW5ncy51c2VyTG9jYWwpIHtcblx0XHRcdFx0a2V5cy5wdXNoKC4uLnRoaXMucmVzdHJpY3RlZFNldHRpbmdzLnVzZXJMb2NhbCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5yZXN0cmljdGVkU2V0dGluZ3MudXNlclJlbW90ZSkge1xuXHRcdFx0XHRrZXlzLnB1c2goLi4udGhpcy5yZXN0cmljdGVkU2V0dGluZ3MudXNlclJlbW90ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5yZXN0cmljdGVkU2V0dGluZ3Mud29ya3NwYWNlKSB7XG5cdFx0XHRcdGtleXMucHVzaCguLi50aGlzLnJlc3RyaWN0ZWRTZXR0aW5ncy53b3Jrc3BhY2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZXN0cmljdGVkU2V0dGluZ3Mud29ya3NwYWNlRm9sZGVyPy5mb3JFYWNoKCh2YWx1ZSkgPT4ga2V5cy5wdXNoKC4uLnZhbHVlKSk7XG5cdFx0XHRrZXlzID0gZGlzdGluY3Qoa2V5cyk7XG5cdFx0XHRpZiAoa2V5cy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZSh7IGtleXMsIG92ZXJyaWRlczogW10gfSwgeyBkYXRhLCB3b3Jrc3BhY2U6IHRoaXMud29ya3NwYWNlIH0sIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhY3F1aXJlSW5zdGFudGlhdGlvblNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IHZvaWQge1xuXHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZTtcblx0fVxuXG5cdGlzU2V0dGluZ0FwcGxpZWRGb3JBbGxQcm9maWxlcyhrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNjb3BlID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVtrZXldPy5zY29wZTtcblx0XHRpZiAoc2NvcGUgJiYgQVBQTElDQVRJT05fU0NPUEVTLmluY2x1ZGVzKHNjb3BlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGFsbFByb2ZpbGVzU2V0dGluZ3MgPSB0aGlzLmdldFZhbHVlPHN0cmluZ1tdPihBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORykgPz8gW107XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkoYWxsUHJvZmlsZXNTZXR0aW5ncykgJiYgYWxsUHJvZmlsZXNTZXR0aW5ncy5pbmNsdWRlcyhrZXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVXb3Jrc3BhY2UoYXJnOiBJQW55V29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8V29ya3NwYWNlPiB7XG5cdFx0aWYgKGlzV29ya3NwYWNlSWRlbnRpZmllcihhcmcpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVNdWx0aUZvbGRlcldvcmtzcGFjZShhcmcpO1xuXHRcdH1cblxuXHRcdGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIoYXJnKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlU2luZ2xlRm9sZGVyV29ya3NwYWNlKGFyZyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlRW1wdHlXb3Jrc3BhY2UoYXJnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlTXVsdGlGb2xkZXJXb3Jrc3BhY2Uod29ya3NwYWNlSWRlbnRpZmllcjogSVdvcmtzcGFjZUlkZW50aWZpZXIpOiBQcm9taXNlPFdvcmtzcGFjZT4ge1xuXHRcdGF3YWl0IHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5pbml0aWFsaXplKHsgaWQ6IHdvcmtzcGFjZUlkZW50aWZpZXIuaWQsIGNvbmZpZ1BhdGg6IHdvcmtzcGFjZUlkZW50aWZpZXIuY29uZmlnUGF0aCB9LCB0aGlzLmlzV29ya3NwYWNlVHJ1c3RlZCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlnUGF0aCA9IHdvcmtzcGFjZUlkZW50aWZpZXIuY29uZmlnUGF0aDtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gdG9Xb3Jrc3BhY2VGb2xkZXJzKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5nZXRGb2xkZXJzKCksIHdvcmtzcGFjZUNvbmZpZ1BhdGgsIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlSWQgPSB3b3Jrc3BhY2VJZGVudGlmaWVyLmlkO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IG5ldyBXb3Jrc3BhY2Uod29ya3NwYWNlSWQsIHdvcmtzcGFjZUZvbGRlcnMsIHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5pc1RyYW5zaWVudCgpLCB3b3Jrc3BhY2VDb25maWdQYXRoLCB1cmkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlnbm9yZVBhdGhDYXNpbmcodXJpKSk7XG5cdFx0d29ya3NwYWNlLmluaXRpYWxpemVkID0gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmluaXRpYWxpemVkO1xuXHRcdHJldHVybiB3b3Jrc3BhY2U7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNpbmdsZUZvbGRlcldvcmtzcGFjZShzaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyOiBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcik6IFdvcmtzcGFjZSB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IFdvcmtzcGFjZShzaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLmlkLCBbdG9Xb3Jrc3BhY2VGb2xkZXIoc2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllci51cmkpXSwgZmFsc2UsIG51bGwsIHVyaSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaWdub3JlUGF0aENhc2luZyh1cmkpKTtcblx0XHR3b3Jrc3BhY2UuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdHJldHVybiB3b3Jrc3BhY2U7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVtcHR5V29ya3NwYWNlKGVtcHR5V29ya3NwYWNlSWRlbnRpZmllcjogSUVtcHR5V29ya3NwYWNlSWRlbnRpZmllcik6IFByb21pc2U8V29ya3NwYWNlPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gbmV3IFdvcmtzcGFjZShlbXB0eVdvcmtzcGFjZUlkZW50aWZpZXIuaWQsIFtdLCBmYWxzZSwgbnVsbCwgdXJpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pZ25vcmVQYXRoQ2FzaW5nKHVyaSkpO1xuXHRcdHdvcmtzcGFjZS5pbml0aWFsaXplZCA9IHRydWU7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh3b3Jrc3BhY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBjaGVja0FuZE1hcmtXb3Jrc3BhY2VDb21wbGV0ZShmcm9tQ2FjaGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29tcGxldGVXb3Jrc3BhY2VCYXJyaWVyLmlzT3BlbigpICYmIHRoaXMud29ya3NwYWNlLmluaXRpYWxpemVkKSB7XG5cdFx0XHR0aGlzLmNvbXBsZXRlV29ya3NwYWNlQmFycmllci5vcGVuKCk7XG5cdFx0XHR0aGlzLnZhbGlkYXRlV29ya3NwYWNlRm9sZGVyc0FuZFJlbG9hZChmcm9tQ2FjaGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlV29ya3NwYWNlQW5kSW5pdGlhbGl6ZUNvbmZpZ3VyYXRpb24od29ya3NwYWNlOiBXb3Jrc3BhY2UsIHRyaWdnZXI6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBoYXNXb3Jrc3BhY2VCZWZvcmUgPSAhIXRoaXMud29ya3NwYWNlO1xuXHRcdGxldCBwcmV2aW91c1N0YXRlOiBXb3JrYmVuY2hTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcHJldmlvdXNXb3Jrc3BhY2VQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHByZXZpb3VzRm9sZGVyczogV29ya3NwYWNlRm9sZGVyW10gPSBbXTtcblxuXHRcdGlmIChoYXNXb3Jrc3BhY2VCZWZvcmUpIHtcblx0XHRcdHByZXZpb3VzU3RhdGUgPSB0aGlzLmdldFdvcmtiZW5jaFN0YXRlKCk7XG5cdFx0XHRwcmV2aW91c1dvcmtzcGFjZVBhdGggPSB0aGlzLndvcmtzcGFjZS5jb25maWd1cmF0aW9uID8gdGhpcy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbi5mc1BhdGggOiB1bmRlZmluZWQ7XG5cdFx0XHRwcmV2aW91c0ZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZS5mb2xkZXJzO1xuXHRcdFx0dGhpcy53b3Jrc3BhY2UudXBkYXRlKHdvcmtzcGFjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMud29ya3NwYWNlID0gd29ya3NwYWNlO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuaW5pdGlhbGl6ZUNvbmZpZ3VyYXRpb24odHJpZ2dlcik7XG5cblx0XHQvLyBUcmlnZ2VyIGNoYW5nZXMgYWZ0ZXIgY29uZmlndXJhdGlvbiBpbml0aWFsaXphdGlvbiBzbyB0aGF0IGNvbmZpZ3VyYXRpb24gaXMgdXAgdG8gZGF0ZS5cblx0XHRpZiAoaGFzV29ya3NwYWNlQmVmb3JlKSB7XG5cdFx0XHRjb25zdCBuZXdTdGF0ZSA9IHRoaXMuZ2V0V29ya2JlbmNoU3RhdGUoKTtcblx0XHRcdGlmIChwcmV2aW91c1N0YXRlICYmIG5ld1N0YXRlICE9PSBwcmV2aW91c1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUuZmlyZShuZXdTdGF0ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld1dvcmtzcGFjZVBhdGggPSB0aGlzLndvcmtzcGFjZS5jb25maWd1cmF0aW9uID8gdGhpcy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbi5mc1BhdGggOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocHJldmlvdXNXb3Jrc3BhY2VQYXRoICYmIG5ld1dvcmtzcGFjZVBhdGggIT09IHByZXZpb3VzV29ya3NwYWNlUGF0aCB8fCBuZXdTdGF0ZSAhPT0gcHJldmlvdXNTdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUuZmlyZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb2xkZXJDaGFuZ2VzID0gdGhpcy5jb21wYXJlRm9sZGVycyhwcmV2aW91c0ZvbGRlcnMsIHRoaXMud29ya3NwYWNlLmZvbGRlcnMpO1xuXHRcdFx0aWYgKGZvbGRlckNoYW5nZXMgJiYgKGZvbGRlckNoYW5nZXMuYWRkZWQubGVuZ3RoIHx8IGZvbGRlckNoYW5nZXMucmVtb3ZlZC5sZW5ndGggfHwgZm9sZGVyQ2hhbmdlcy5jaGFuZ2VkLmxlbmd0aCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5oYW5kbGVXaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhmb2xkZXJDaGFuZ2VzLCBmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5maXJlKGZvbGRlckNoYW5nZXMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLmhhc1Rhc2tzTG9hZGVkKSB7XG5cdFx0XHQvLyBSZWxvYWQgbG9jYWwgdXNlciBjb25maWd1cmF0aW9uIGFnYWluIHRvIGxvYWQgdXNlciB0YXNrc1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocnVuV2hlbldpbmRvd0lkbGUobWFpbldpbmRvdywgKCkgPT4gdGhpcy5yZWxvYWRMb2NhbFVzZXJDb25maWd1cmF0aW9uKGZhbHNlLCB0aGlzLl9jb25maWd1cmF0aW9uLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24pKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjb21wYXJlRm9sZGVycyhjdXJyZW50Rm9sZGVyczogSVdvcmtzcGFjZUZvbGRlcltdLCBuZXdGb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10pOiBJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50IHtcblx0XHRjb25zdCByZXN1bHQ6IElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQgPSB7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH07XG5cdFx0cmVzdWx0LmFkZGVkID0gbmV3Rm9sZGVycy5maWx0ZXIobmV3Rm9sZGVyID0+ICFjdXJyZW50Rm9sZGVycy5zb21lKGN1cnJlbnRGb2xkZXIgPT4gbmV3Rm9sZGVyLnVyaS50b1N0cmluZygpID09PSBjdXJyZW50Rm9sZGVyLnVyaS50b1N0cmluZygpKSk7XG5cdFx0Zm9yIChsZXQgY3VycmVudEluZGV4ID0gMDsgY3VycmVudEluZGV4IDwgY3VycmVudEZvbGRlcnMubGVuZ3RoOyBjdXJyZW50SW5kZXgrKykge1xuXHRcdFx0Y29uc3QgY3VycmVudEZvbGRlciA9IGN1cnJlbnRGb2xkZXJzW2N1cnJlbnRJbmRleF07XG5cdFx0XHRsZXQgbmV3SW5kZXggPSAwO1xuXHRcdFx0Zm9yIChuZXdJbmRleCA9IDA7IG5ld0luZGV4IDwgbmV3Rm9sZGVycy5sZW5ndGggJiYgY3VycmVudEZvbGRlci51cmkudG9TdHJpbmcoKSAhPT0gbmV3Rm9sZGVyc1tuZXdJbmRleF0udXJpLnRvU3RyaW5nKCk7IG5ld0luZGV4KyspIHsgfVxuXHRcdFx0aWYgKG5ld0luZGV4IDwgbmV3Rm9sZGVycy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKGN1cnJlbnRJbmRleCAhPT0gbmV3SW5kZXggfHwgY3VycmVudEZvbGRlci5uYW1lICE9PSBuZXdGb2xkZXJzW25ld0luZGV4XS5uYW1lKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmNoYW5nZWQucHVzaChjdXJyZW50Rm9sZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0LnJlbW92ZWQucHVzaChjdXJyZW50Rm9sZGVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaW5pdGlhbGl6ZUNvbmZpZ3VyYXRpb24odHJpZ2dlcjogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpO1xuXG5cdFx0Y29uc3QgaW5pdFBvbGljeUNvbmZpZ3VyYXRpb25Qcm9taXNlID0gdGhpcy5wb2xpY3lDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBpbml0QXBwbGljYXRpb25Db25maWd1cmF0aW9uUHJvbWlzZSA9IHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uID8gdGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpIDogUHJvbWlzZS5yZXNvbHZlKENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGluaXRVc2VyQ29uZmlndXJhdGlvbiA9IGFzeW5jICgpID0+IHtcblx0XHRcdG1hcmsoJ2NvZGUvd2lsbEluaXRVc2VyQ29uZmlndXJhdGlvbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgUHJvbWlzZS5hbGwoW3RoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5pbml0aWFsaXplKCksIHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24gPyB0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKSA6IFByb21pc2UucmVzb2x2ZShDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpKV0pO1xuXHRcdFx0aWYgKHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbk1vZGVsID0gYXdhaXQgaW5pdEFwcGxpY2F0aW9uQ29uZmlndXJhdGlvblByb21pc2U7XG5cdFx0XHRcdHJlc3VsdFswXSA9IHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5yZXBhcnNlKHsgZXhjbHVkZTogYXBwbGljYXRpb25Db25maWd1cmF0aW9uTW9kZWwuZ2V0VmFsdWUoQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpIH0pO1xuXHRcdFx0fVxuXHRcdFx0bWFyaygnY29kZS9kaWRJbml0VXNlckNvbmZpZ3VyYXRpb24nKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IFssIGFwcGxpY2F0aW9uLCBbbG9jYWwsIHJlbW90ZV1dID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0aW5pdFBvbGljeUNvbmZpZ3VyYXRpb25Qcm9taXNlLFxuXHRcdFx0aW5pdEFwcGxpY2F0aW9uQ29uZmlndXJhdGlvblByb21pc2UsXG5cdFx0XHRpbml0VXNlckNvbmZpZ3VyYXRpb24oKVxuXHRcdF0pO1xuXG5cdFx0bWFyaygnY29kZS93aWxsSW5pdFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24nKTtcblx0XHRhd2FpdCB0aGlzLmxvYWRDb25maWd1cmF0aW9uKGFwcGxpY2F0aW9uLCBsb2NhbCwgcmVtb3RlLCB0cmlnZ2VyKTtcblx0XHRtYXJrKCdjb2RlL2RpZEluaXRXb3Jrc3BhY2VDb25maWd1cmF0aW9uJyk7XG5cdH1cblxuXHRwcml2YXRlIHJlbG9hZERlZmF1bHRDb25maWd1cmF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMub25EZWZhdWx0Q29uZmlndXJhdGlvbkNoYW5nZWQodGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5yZWxvYWQoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbG9hZEFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbihkb25vdFRyaWdnZXI/OiBib29sZWFuKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWw+IHtcblx0XHRpZiAoIXRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLmFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbi5sb2FkQ29uZmlndXJhdGlvbigpO1xuXHRcdGlmICghZG9ub3RUcmlnZ2VyKSB7XG5cdFx0XHR0aGlzLm9uQXBwbGljYXRpb25Db25maWd1cmF0aW9uQ2hhbmdlZChtb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVsb2FkVXNlckNvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTx7IGxvY2FsOiBDb25maWd1cmF0aW9uTW9kZWw7IHJlbW90ZTogQ29uZmlndXJhdGlvbk1vZGVsIH0+IHtcblx0XHRjb25zdCBbbG9jYWwsIHJlbW90ZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbdGhpcy5yZWxvYWRMb2NhbFVzZXJDb25maWd1cmF0aW9uKHRydWUpLCB0aGlzLnJlbG9hZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uKHRydWUpXSk7XG5cdFx0cmV0dXJuIHsgbG9jYWwsIHJlbW90ZSB9O1xuXHR9XG5cblx0YXN5bmMgcmVsb2FkTG9jYWxVc2VyQ29uZmlndXJhdGlvbihkb25vdFRyaWdnZXI/OiBib29sZWFuLCBzZXR0aW5nc0NvbmZpZ3VyYXRpb24/OiBDb25maWd1cmF0aW9uTW9kZWwpOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLnJlbG9hZChzZXR0aW5nc0NvbmZpZ3VyYXRpb24pO1xuXHRcdGlmICghZG9ub3RUcmlnZ2VyKSB7XG5cdFx0XHR0aGlzLm9uTG9jYWxVc2VyQ29uZmlndXJhdGlvbkNoYW5nZWQobW9kZWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbG9hZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uKGRvbm90VHJpZ2dlcj86IGJvb2xlYW4pOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD4ge1xuXHRcdGlmICh0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24ucmVsb2FkKCk7XG5cdFx0XHRpZiAoIWRvbm90VHJpZ2dlcikge1xuXHRcdFx0XHR0aGlzLm9uUmVtb3RlVXNlckNvbmZpZ3VyYXRpb25DaGFuZ2VkKG1vZGVsKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBtb2RlbDtcblx0XHR9XG5cdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlbG9hZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgd29ya2JlbmNoU3RhdGUgPSB0aGlzLmdldFdvcmtiZW5jaFN0YXRlKCk7XG5cdFx0aWYgKHdvcmtiZW5jaFN0YXRlID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdHJldHVybiB0aGlzLm9uV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbkNoYW5nZWQodGhpcy53b3Jrc3BhY2UuZm9sZGVyc1swXSk7XG5cdFx0fVxuXHRcdGlmICh3b3JrYmVuY2hTdGF0ZSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLnJlbG9hZCgpLnRoZW4oKCkgPT4gdGhpcy5vbldvcmtzcGFjZUNvbmZpZ3VyYXRpb25DaGFuZ2VkKGZhbHNlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWxvYWRXb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLm9uV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbkNoYW5nZWQoZm9sZGVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbG9hZENvbmZpZ3VyYXRpb24oYXBwbGljYXRpb25Db25maWd1cmF0aW9uTW9kZWw6IENvbmZpZ3VyYXRpb25Nb2RlbCwgdXNlckNvbmZpZ3VyYXRpb25Nb2RlbDogQ29uZmlndXJhdGlvbk1vZGVsLCByZW1vdGVVc2VyQ29uZmlndXJhdGlvbk1vZGVsOiBDb25maWd1cmF0aW9uTW9kZWwsIHRyaWdnZXI6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyByZXNldCBjYWNoZXNcblx0XHR0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cblx0XHRjb25zdCBmb2xkZXJzID0gdGhpcy53b3Jrc3BhY2UuZm9sZGVycztcblx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9ucyA9IGF3YWl0IHRoaXMubG9hZEZvbGRlckNvbmZpZ3VyYXRpb25zKGZvbGRlcnMpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IHRoaXMuZ2V0V29ya3NwYWNlQ29uZmlndXJhdGlvbk1vZGVsKGZvbGRlckNvbmZpZ3VyYXRpb25zKTtcblx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uTW9kZWxzID0gbmV3IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4oKTtcblx0XHRmb2xkZXJDb25maWd1cmF0aW9ucy5mb3JFYWNoKChmb2xkZXJDb25maWd1cmF0aW9uLCBpbmRleCkgPT4gZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVscy5zZXQoZm9sZGVyc1tpbmRleF0udXJpLCBmb2xkZXJDb25maWd1cmF0aW9uKSk7XG5cblx0XHRjb25zdCBjdXJyZW50Q29uZmlndXJhdGlvbiA9IHRoaXMuX2NvbmZpZ3VyYXRpb247XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbiA9IG5ldyBDb25maWd1cmF0aW9uKHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLCB0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24uY29uZmlndXJhdGlvbk1vZGVsLCBhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb25Nb2RlbCwgdXNlckNvbmZpZ3VyYXRpb25Nb2RlbCwgcmVtb3RlVXNlckNvbmZpZ3VyYXRpb25Nb2RlbCwgd29ya3NwYWNlQ29uZmlndXJhdGlvbiwgZm9sZGVyQ29uZmlndXJhdGlvbk1vZGVscywgQ29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKSwgbmV3IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSwgdGhpcy53b3Jrc3BhY2UsIHRoaXMubG9nU2VydmljZSk7XG5cblx0XHR0aGlzLmluaXRpYWxpemVkID0gdHJ1ZTtcblxuXHRcdGlmICh0cmlnZ2VyKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmUoY3VycmVudENvbmZpZ3VyYXRpb24pO1xuXHRcdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHsgZGF0YTogY3VycmVudENvbmZpZ3VyYXRpb24udG9EYXRhKCksIHdvcmtzcGFjZTogdGhpcy53b3Jrc3BhY2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlUmVzdHJpY3RlZFNldHRpbmdzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25Nb2RlbChmb2xkZXJDb25maWd1cmF0aW9uczogQ29uZmlndXJhdGlvbk1vZGVsW10pOiBDb25maWd1cmF0aW9uTW9kZWwge1xuXHRcdHN3aXRjaCAodGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpKSB7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkZPTERFUjpcblx0XHRcdFx0cmV0dXJuIGZvbGRlckNvbmZpZ3VyYXRpb25zWzBdO1xuXHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0U6XG5cdFx0XHRcdHJldHVybiB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24uZ2V0Q29uZmlndXJhdGlvbigpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblVzZXJEYXRhUHJvZmlsZUNoYW5nZWQoZTogRGlkQ2hhbmdlVXNlckRhdGFQcm9maWxlRXZlbnQpOiB2b2lkIHtcblx0XHRlLmpvaW4oKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPENvbmZpZ3VyYXRpb25Nb2RlbD5bXSA9IFtdO1xuXHRcdFx0cHJvbWlzZXMucHVzaCh0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ucmVzZXQoZS5wcm9maWxlLnNldHRpbmdzUmVzb3VyY2UsIGUucHJvZmlsZS50YXNrc1Jlc291cmNlLCBlLnByb2ZpbGUubWNwUmVzb3VyY2UsIHsgc2NvcGVzOiBnZXRMb2NhbFVzZXJDb25maWd1cmF0aW9uU2NvcGVzKGUucHJvZmlsZSwgISF0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uKSB9KSk7XG5cdFx0XHRpZiAoZS5wcmV2aW91cy5pc0RlZmF1bHQgIT09IGUucHJvZmlsZS5pc0RlZmF1bHRcblx0XHRcdFx0fHwgISFlLnByZXZpb3VzLnVzZURlZmF1bHRGbGFncz8uc2V0dGluZ3MgIT09ICEhZS5wcm9maWxlLnVzZURlZmF1bHRGbGFncz8uc2V0dGluZ3MpIHtcblx0XHRcdFx0dGhpcy5jcmVhdGVBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oKTtcblx0XHRcdFx0aWYgKHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdFx0cHJvbWlzZXMucHVzaCh0aGlzLnJlbG9hZEFwcGxpY2F0aW9uQ29uZmlndXJhdGlvbih0cnVlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGxldCBbbG9jYWxVc2VyLCBhcHBsaWNhdGlvbl0gPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdFx0XHRhcHBsaWNhdGlvbiA9IGFwcGxpY2F0aW9uID8/IHRoaXMuX2NvbmZpZ3VyYXRpb24uYXBwbGljYXRpb25Db25maWd1cmF0aW9uO1xuXHRcdFx0aWYgKHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdGxvY2FsVXNlciA9IHRoaXMubG9jYWxVc2VyQ29uZmlndXJhdGlvbi5yZXBhcnNlKHsgZXhjbHVkZTogYXBwbGljYXRpb24uZ2V0VmFsdWUoQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpIH0pO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5sb2FkQ29uZmlndXJhdGlvbihhcHBsaWNhdGlvbiwgbG9jYWxVc2VyLCB0aGlzLl9jb25maWd1cmF0aW9uLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLCB0cnVlKTtcblx0XHR9KSgpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EZWZhdWx0Q29uZmlndXJhdGlvbkNoYW5nZWQoY29uZmlndXJhdGlvbk1vZGVsOiBDb25maWd1cmF0aW9uTW9kZWwsIHByb3BlcnRpZXM/OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZSkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNEYXRhID0gdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKTtcblx0XHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZURlZmF1bHRDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25Nb2RlbCwgcHJvcGVydGllcyk7XG5cdFx0XHRpZiAodGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24odGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24ucmVwYXJzZSgpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlTG9jYWxVc2VyQ29uZmlndXJhdGlvbih0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ucmVwYXJzZSgpKTtcblx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVSZW1vdGVVc2VyQ29uZmlndXJhdGlvbih0aGlzLnJlbW90ZVVzZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5nZXQodGhpcy53b3Jrc3BhY2UuZm9sZGVyc1swXS51cmkpO1xuXHRcdFx0XHRpZiAoZm9sZGVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbihmb2xkZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoKSk7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi51cGRhdGVGb2xkZXJDb25maWd1cmF0aW9uKHRoaXMud29ya3NwYWNlLmZvbGRlcnNbMF0udXJpLCBmb2xkZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbih0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24ucmVwYXJzZVdvcmtzcGFjZVNldHRpbmdzKCkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLndvcmtzcGFjZS5mb2xkZXJzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5nZXQoZm9sZGVyLnVyaSk7XG5cdFx0XHRcdFx0aWYgKGZvbGRlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihmb2xkZXIudXJpLCBmb2xkZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZSwgeyBkYXRhOiBwcmV2aW91c0RhdGEsIHdvcmtzcGFjZTogdGhpcy53b3Jrc3BhY2UgfSwgQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKTtcblx0XHRcdHRoaXMudXBkYXRlUmVzdHJpY3RlZFNldHRpbmdzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblBvbGljeUNvbmZpZ3VyYXRpb25DaGFuZ2VkKHBvbGljeUNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzID0geyBkYXRhOiB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpLCB3b3Jrc3BhY2U6IHRoaXMud29ya3NwYWNlIH07XG5cdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlUG9saWN5Q29uZmlndXJhdGlvbihwb2xpY3lDb25maWd1cmF0aW9uKTtcblx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZSwgcHJldmlvdXMsIENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCk7XG5cdH1cblxuXHRwcml2YXRlIG9uQXBwbGljYXRpb25Db25maWd1cmF0aW9uQ2hhbmdlZChhcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb25Nb2RlbCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzID0geyBkYXRhOiB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpLCB3b3Jrc3BhY2U6IHRoaXMud29ya3NwYWNlIH07XG5cdFx0Y29uc3QgcHJldmlvdXNBbGxQcm9maWxlc1NldHRpbmdzID0gdGhpcy5fY29uZmlndXJhdGlvbi5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24uZ2V0VmFsdWU8c3RyaW5nW10+KEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKSA/PyBbXTtcblx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmRVcGRhdGVBcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24oYXBwbGljYXRpb25Db25maWd1cmF0aW9uKTtcblx0XHRjb25zdCBjdXJyZW50QWxsUHJvZmlsZXNTZXR0aW5ncyA9IHRoaXMuZ2V0VmFsdWU8c3RyaW5nW10+KEFQUExZX0FMTF9QUk9GSUxFU19TRVRUSU5HKSA/PyBbXTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Y29uc3QgY2hhbmdlZEtleXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2VkS2V5IG9mIGNoYW5nZS5rZXlzKSB7XG5cdFx0XHRjb25zdCBzY29wZSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW2NoYW5nZWRLZXldPy5zY29wZTtcblx0XHRcdGlmIChzY29wZSAmJiBBUFBMSUNBVElPTl9TQ09QRVMuaW5jbHVkZXMoc2NvcGUpKSB7XG5cdFx0XHRcdGNoYW5nZWRLZXlzLnB1c2goY2hhbmdlZEtleSk7XG5cdFx0XHRcdGlmIChjaGFuZ2VkS2V5ID09PSBBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcHJldmlvdXNBbGxQcm9maWxlU2V0dGluZyBvZiBwcmV2aW91c0FsbFByb2ZpbGVzU2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdGlmICghY3VycmVudEFsbFByb2ZpbGVzU2V0dGluZ3MuaW5jbHVkZXMocHJldmlvdXNBbGxQcm9maWxlU2V0dGluZykpIHtcblx0XHRcdFx0XHRcdFx0Y2hhbmdlZEtleXMucHVzaChwcmV2aW91c0FsbFByb2ZpbGVTZXR0aW5nKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjdXJyZW50QWxsUHJvZmlsZVNldHRpbmcgb2YgY3VycmVudEFsbFByb2ZpbGVzU2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdGlmICghcHJldmlvdXNBbGxQcm9maWxlc1NldHRpbmdzLmluY2x1ZGVzKGN1cnJlbnRBbGxQcm9maWxlU2V0dGluZykpIHtcblx0XHRcdFx0XHRcdFx0Y2hhbmdlZEtleXMucHVzaChjdXJyZW50QWxsUHJvZmlsZVNldHRpbmcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoY3VycmVudEFsbFByb2ZpbGVzU2V0dGluZ3MuaW5jbHVkZXMoY2hhbmdlZEtleSkpIHtcblx0XHRcdFx0Y2hhbmdlZEtleXMucHVzaChjaGFuZ2VkS2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y2hhbmdlLmtleXMgPSBjaGFuZ2VkS2V5cztcblx0XHRpZiAoY2hhbmdlLmtleXMuaW5jbHVkZXMoQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpKSB7XG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZUxvY2FsVXNlckNvbmZpZ3VyYXRpb24odGhpcy5sb2NhbFVzZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoeyBleGNsdWRlOiBjdXJyZW50QWxsUHJvZmlsZXNTZXR0aW5ncyB9KSk7XG5cdFx0fVxuXHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91cywgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0fVxuXG5cdHByaXZhdGUgb25Mb2NhbFVzZXJDb25maWd1cmF0aW9uQ2hhbmdlZCh1c2VyQ29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB7IGRhdGE6IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCksIHdvcmtzcGFjZTogdGhpcy53b3Jrc3BhY2UgfTtcblx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmRVcGRhdGVMb2NhbFVzZXJDb25maWd1cmF0aW9uKHVzZXJDb25maWd1cmF0aW9uKTtcblx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZSwgcHJldmlvdXMsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIG9uUmVtb3RlVXNlckNvbmZpZ3VyYXRpb25DaGFuZ2VkKHVzZXJDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHsgZGF0YTogdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKSwgd29ya3NwYWNlOiB0aGlzLndvcmtzcGFjZSB9O1xuXHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZVJlbW90ZVVzZXJDb25maWd1cmF0aW9uKHVzZXJDb25maWd1cmF0aW9uKTtcblx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZSwgcHJldmlvdXMsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uV29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZWQoZnJvbUNhY2hlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlICYmIHRoaXMud29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGxldCBuZXdGb2xkZXJzID0gdG9Xb3Jrc3BhY2VGb2xkZXJzKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5nZXRGb2xkZXJzKCksIHRoaXMud29ya3NwYWNlLmNvbmZpZ3VyYXRpb24sIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaSk7XG5cblx0XHRcdC8vIFZhbGlkYXRlIG9ubHkgaWYgd29ya3NwYWNlIGlzIGluaXRpYWxpemVkXG5cdFx0XHRpZiAodGhpcy53b3Jrc3BhY2UuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0Y29uc3QgeyBhZGRlZCwgcmVtb3ZlZCwgY2hhbmdlZCB9ID0gdGhpcy5jb21wYXJlRm9sZGVycyh0aGlzLndvcmtzcGFjZS5mb2xkZXJzLCBuZXdGb2xkZXJzKTtcblxuXHRcdFx0XHQvKiBJZiBjaGFuZ2VkIHZhbGlkYXRlIG5ldyBmb2xkZXJzICovXG5cdFx0XHRcdGlmIChhZGRlZC5sZW5ndGggfHwgcmVtb3ZlZC5sZW5ndGggfHwgY2hhbmdlZC5sZW5ndGgpIHtcblx0XHRcdFx0XHRuZXdGb2xkZXJzID0gYXdhaXQgdGhpcy50b1ZhbGlkV29ya3NwYWNlRm9sZGVycyhuZXdGb2xkZXJzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvKiBPdGhlcndpc2UgdXNlIGV4aXN0aW5nICovXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdG5ld0ZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZS5mb2xkZXJzO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbihuZXdGb2xkZXJzLCB0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24uZ2V0Q29uZmlndXJhdGlvbigpLCBmcm9tQ2FjaGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUmVzdHJpY3RlZFNldHRpbmdzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYW5nZWQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBhbGxQcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBkZWZhdWx0UmVzdHJpY3RlZFNldHRpbmdzOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKGFsbFByb3BlcnRpZXMpLmZpbHRlcihrZXkgPT4gYWxsUHJvcGVydGllc1trZXldLnJlc3RyaWN0ZWQpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0Y29uc3QgZGVmYXVsdERlbHRhID0gZGVsdGEoZGVmYXVsdFJlc3RyaWN0ZWRTZXR0aW5ncywgdGhpcy5fcmVzdHJpY3RlZFNldHRpbmdzLmRlZmF1bHQsIChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdGNoYW5nZWQucHVzaCguLi5kZWZhdWx0RGVsdGEuYWRkZWQsIC4uLmRlZmF1bHREZWx0YS5yZW1vdmVkKTtcblxuXHRcdGNvbnN0IGFwcGxpY2F0aW9uID0gKHRoaXMuYXBwbGljYXRpb25Db25maWd1cmF0aW9uPy5nZXRSZXN0cmljdGVkU2V0dGluZ3MoKSB8fCBbXSkuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblx0XHRjb25zdCBhcHBsaWNhdGlvbkRlbHRhID0gZGVsdGEoYXBwbGljYXRpb24sIHRoaXMuX3Jlc3RyaWN0ZWRTZXR0aW5ncy5hcHBsaWNhdGlvbiB8fCBbXSwgKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0Y2hhbmdlZC5wdXNoKC4uLmFwcGxpY2F0aW9uRGVsdGEuYWRkZWQsIC4uLmFwcGxpY2F0aW9uRGVsdGEucmVtb3ZlZCk7XG5cblx0XHRjb25zdCB1c2VyTG9jYWwgPSB0aGlzLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24uZ2V0UmVzdHJpY3RlZFNldHRpbmdzKCkuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblx0XHRjb25zdCB1c2VyTG9jYWxEZWx0YSA9IGRlbHRhKHVzZXJMb2NhbCwgdGhpcy5fcmVzdHJpY3RlZFNldHRpbmdzLnVzZXJMb2NhbCB8fCBbXSwgKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0Y2hhbmdlZC5wdXNoKC4uLnVzZXJMb2NhbERlbHRhLmFkZGVkLCAuLi51c2VyTG9jYWxEZWx0YS5yZW1vdmVkKTtcblxuXHRcdGNvbnN0IHVzZXJSZW1vdGUgPSAodGhpcy5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbj8uZ2V0UmVzdHJpY3RlZFNldHRpbmdzKCkgfHwgW10pLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSk7XG5cdFx0Y29uc3QgdXNlclJlbW90ZURlbHRhID0gZGVsdGEodXNlclJlbW90ZSwgdGhpcy5fcmVzdHJpY3RlZFNldHRpbmdzLnVzZXJSZW1vdGUgfHwgW10sIChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdGNoYW5nZWQucHVzaCguLi51c2VyUmVtb3RlRGVsdGEuYWRkZWQsIC4uLnVzZXJSZW1vdGVEZWx0YS5yZW1vdmVkKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlck1hcCA9IG5ldyBSZXNvdXJjZU1hcDxSZWFkb25seUFycmF5PHN0cmluZz4+KCk7XG5cdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VGb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2UuZm9sZGVycykge1xuXHRcdFx0Y29uc3QgY2FjaGVkRm9sZGVyQ29uZmlnID0gdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmdldCh3b3Jrc3BhY2VGb2xkZXIudXJpKTtcblx0XHRcdGNvbnN0IGZvbGRlclJlc3RyaWN0ZWRTZXR0aW5ncyA9IChjYWNoZWRGb2xkZXJDb25maWc/LmdldFJlc3RyaWN0ZWRTZXR0aW5ncygpIHx8IFtdKS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdFx0aWYgKGZvbGRlclJlc3RyaWN0ZWRTZXR0aW5ncy5sZW5ndGgpIHtcblx0XHRcdFx0d29ya3NwYWNlRm9sZGVyTWFwLnNldCh3b3Jrc3BhY2VGb2xkZXIudXJpLCBmb2xkZXJSZXN0cmljdGVkU2V0dGluZ3MpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9yZXN0cmljdGVkU2V0dGluZ3Mud29ya3NwYWNlRm9sZGVyPy5nZXQod29ya3NwYWNlRm9sZGVyLnVyaSkgfHwgW107XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJEZWx0YSA9IGRlbHRhKGZvbGRlclJlc3RyaWN0ZWRTZXR0aW5ncywgcHJldmlvdXMsIChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdFx0Y2hhbmdlZC5wdXNoKC4uLndvcmtzcGFjZUZvbGRlckRlbHRhLmFkZGVkLCAuLi53b3Jrc3BhY2VGb2xkZXJEZWx0YS5yZW1vdmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSA/IHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5nZXRSZXN0cmljdGVkU2V0dGluZ3MoKS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpXG5cdFx0XHQ6IHRoaXMud29ya3NwYWNlLmZvbGRlcnNbMF0gPyAod29ya3NwYWNlRm9sZGVyTWFwLmdldCh0aGlzLndvcmtzcGFjZS5mb2xkZXJzWzBdLnVyaSkgfHwgW10pIDogW107XG5cdFx0Y29uc3Qgd29ya3NwYWNlRGVsdGEgPSBkZWx0YSh3b3Jrc3BhY2UsIHRoaXMuX3Jlc3RyaWN0ZWRTZXR0aW5ncy53b3Jrc3BhY2UgfHwgW10sIChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdGNoYW5nZWQucHVzaCguLi53b3Jrc3BhY2VEZWx0YS5hZGRlZCwgLi4ud29ya3NwYWNlRGVsdGEucmVtb3ZlZCk7XG5cblx0XHRpZiAoY2hhbmdlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3Jlc3RyaWN0ZWRTZXR0aW5ncyA9IHtcblx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdFJlc3RyaWN0ZWRTZXR0aW5ncyxcblx0XHRcdFx0YXBwbGljYXRpb246IGFwcGxpY2F0aW9uLmxlbmd0aCA/IGFwcGxpY2F0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VyTG9jYWw6IHVzZXJMb2NhbC5sZW5ndGggPyB1c2VyTG9jYWwgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJSZW1vdGU6IHVzZXJSZW1vdGUubGVuZ3RoID8gdXNlclJlbW90ZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0d29ya3NwYWNlOiB3b3Jrc3BhY2UubGVuZ3RoID8gd29ya3NwYWNlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHdvcmtzcGFjZUZvbGRlck1hcC5zaXplID8gd29ya3NwYWNlRm9sZGVyTWFwIDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlUmVzdHJpY3RlZFNldHRpbmdzLmZpcmUodGhpcy5yZXN0cmljdGVkU2V0dGluZ3MpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXJzOiBXb3Jrc3BhY2VGb2xkZXJbXSwgY29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsLCBmcm9tQ2FjaGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHsgZGF0YTogdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKSwgd29ya3NwYWNlOiB0aGlzLndvcmtzcGFjZSB9O1xuXHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oY29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IHRoaXMuY29tcGFyZUZvbGRlcnModGhpcy53b3Jrc3BhY2UuZm9sZGVycywgd29ya3NwYWNlRm9sZGVycyk7XG5cdFx0aWYgKGNoYW5nZXMuYWRkZWQubGVuZ3RoIHx8IGNoYW5nZXMucmVtb3ZlZC5sZW5ndGggfHwgY2hhbmdlcy5jaGFuZ2VkLmxlbmd0aCkge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2UuZm9sZGVycyA9IHdvcmtzcGFjZUZvbGRlcnM7XG5cdFx0XHRjb25zdCBjaGFuZ2UgPSBhd2FpdCB0aGlzLm9uRm9sZGVyc0NoYW5nZWQoKTtcblx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoY2hhbmdlcywgZnJvbUNhY2hlKTtcblx0XHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91cywgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5maXJlKGNoYW5nZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZSwgcHJldmlvdXMsIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHR9XG5cdFx0dGhpcy51cGRhdGVSZXN0cmljdGVkU2V0dGluZ3MoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoY2hhbmdlczogSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCwgZnJvbUNhY2hlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgam9pbmVyczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0dGhpcy5fb25XaWxsQ2hhbmdlV29ya3NwYWNlRm9sZGVycy5maXJlKHtcblx0XHRcdGpvaW4odXBkYXRlV29ya3NwYWNlVHJ1c3RTdGF0ZVByb21pc2UpIHtcblx0XHRcdFx0am9pbmVycy5wdXNoKHVwZGF0ZVdvcmtzcGFjZVRydXN0U3RhdGVQcm9taXNlKTtcblx0XHRcdH0sXG5cdFx0XHRjaGFuZ2VzLFxuXHRcdFx0ZnJvbUNhY2hlXG5cdFx0fSk7XG5cdFx0dHJ5IHsgYXdhaXQgUHJvbWlzZXMuc2V0dGxlZChqb2luZXJzKTsgfSBjYXRjaCAoZXJyb3IpIHsgLyogSWdub3JlICovIH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25Xb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlZChmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBbZm9sZGVyQ29uZmlndXJhdGlvbl0gPSBhd2FpdCB0aGlzLmxvYWRGb2xkZXJDb25maWd1cmF0aW9ucyhbZm9sZGVyXSk7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB7IGRhdGE6IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCksIHdvcmtzcGFjZTogdGhpcy53b3Jrc3BhY2UgfTtcblx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihmb2xkZXIudXJpLCBmb2xkZXJDb25maWd1cmF0aW9uKTtcblx0XHRpZiAodGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25DaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmRVcGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKGZvbGRlckNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShtZXJnZUNoYW5nZXMoZm9sZGVyQ29uZmlndXJhdGlvbkNoYW5nZSwgd29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZSksIHByZXZpb3VzLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoZm9sZGVyQ29uZmlndXJhdGlvbkNoYW5nZSwgcHJldmlvdXMsIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUik7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlUmVzdHJpY3RlZFNldHRpbmdzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRm9sZGVyc0NoYW5nZWQoKTogUHJvbWlzZTxJQ29uZmlndXJhdGlvbkNoYW5nZT4ge1xuXHRcdGNvbnN0IGNoYW5nZXM6IElDb25maWd1cmF0aW9uQ2hhbmdlW10gPSBbXTtcblxuXHRcdC8vIFJlbW92ZSB0aGUgY29uZmlndXJhdGlvbnMgb2YgZGVsZXRlZCBmb2xkZXJzXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmtleXMoKSkge1xuXHRcdFx0aWYgKCF0aGlzLndvcmtzcGFjZS5mb2xkZXJzLmZpbHRlcihmb2xkZXIgPT4gZm9sZGVyLnVyaS50b1N0cmluZygpID09PSBrZXkudG9TdHJpbmcoKSlbMF0pIHtcblx0XHRcdFx0dGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmRlbGV0ZUFuZERpc3Bvc2Uoa2V5KTtcblx0XHRcdFx0Y2hhbmdlcy5wdXNoKHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZERlbGV0ZUZvbGRlckNvbmZpZ3VyYXRpb24oa2V5KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9Jbml0aWFsaXplID0gdGhpcy53b3Jrc3BhY2UuZm9sZGVycy5maWx0ZXIoZm9sZGVyID0+ICF0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuaGFzKGZvbGRlci51cmkpKTtcblx0XHRpZiAodG9Jbml0aWFsaXplLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbnMgPSBhd2FpdCB0aGlzLmxvYWRGb2xkZXJDb25maWd1cmF0aW9ucyh0b0luaXRpYWxpemUpO1xuXHRcdFx0Zm9sZGVyQ29uZmlndXJhdGlvbnMuZm9yRWFjaCgoZm9sZGVyQ29uZmlndXJhdGlvbiwgaW5kZXgpID0+IHtcblx0XHRcdFx0Y2hhbmdlcy5wdXNoKHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZUZvbGRlckNvbmZpZ3VyYXRpb24odG9Jbml0aWFsaXplW2luZGV4XS51cmksIGZvbGRlckNvbmZpZ3VyYXRpb24pKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gbWVyZ2VDaGFuZ2VzKC4uLmNoYW5nZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkRm9sZGVyQ29uZmlndXJhdGlvbnMoZm9sZGVyczogSVdvcmtzcGFjZUZvbGRlcltdKTogUHJvbWlzZTxDb25maWd1cmF0aW9uTW9kZWxbXT4ge1xuXHRcdHJldHVybiBQcm9taXNlLmFsbChbLi4uZm9sZGVycy5tYXAoZm9sZGVyID0+IHtcblx0XHRcdGxldCBmb2xkZXJDb25maWd1cmF0aW9uID0gdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmdldChmb2xkZXIudXJpKTtcblx0XHRcdGlmICghZm9sZGVyQ29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRmb2xkZXJDb25maWd1cmF0aW9uID0gbmV3IEZvbGRlckNvbmZpZ3VyYXRpb24oIXRoaXMuaW5pdGlhbGl6ZWQsIGZvbGRlciwgRk9MREVSX0NPTkZJR19GT0xERVJfTkFNRSwgdGhpcy5nZXRXb3JrYmVuY2hTdGF0ZSgpLCB0aGlzLmlzV29ya3NwYWNlVHJ1c3RlZCwgdGhpcy5maWxlU2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uQ2FjaGUpO1xuXHRcdFx0XHRmb2xkZXJDb25maWd1cmF0aW9uLmFkZFJlbGF0ZWQoZm9sZGVyQ29uZmlndXJhdGlvbi5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLm9uV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbkNoYW5nZWQoZm9sZGVyKSkpO1xuXHRcdFx0XHR0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3Muc2V0KGZvbGRlci51cmksIGZvbGRlckNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZvbGRlckNvbmZpZ3VyYXRpb24ubG9hZENvbmZpZ3VyYXRpb24oKTtcblx0XHR9KV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVdvcmtzcGFjZUZvbGRlcnNBbmRSZWxvYWQoZnJvbUNhY2hlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmFsaWRXb3Jrc3BhY2VGb2xkZXJzID0gYXdhaXQgdGhpcy50b1ZhbGlkV29ya3NwYWNlRm9sZGVycyh0aGlzLndvcmtzcGFjZS5mb2xkZXJzKTtcblx0XHRjb25zdCB7IHJlbW92ZWQgfSA9IHRoaXMuY29tcGFyZUZvbGRlcnModGhpcy53b3Jrc3BhY2UuZm9sZGVycywgdmFsaWRXb3Jrc3BhY2VGb2xkZXJzKTtcblx0XHRpZiAocmVtb3ZlZC5sZW5ndGgpIHtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlV29ya3NwYWNlQ29uZmlndXJhdGlvbih2YWxpZFdvcmtzcGFjZUZvbGRlcnMsIHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5nZXRDb25maWd1cmF0aW9uKCksIGZyb21DYWNoZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gRmlsdGVyIG91dCB3b3Jrc3BhY2UgZm9sZGVycyB3aGljaCBhcmUgZmlsZXMgKG5vdCBkaXJlY3Rvcmllcylcblx0Ly8gV29ya3NwYWNlIGZvbGRlcnMgdGhvc2UgY2Fubm90IGJlIHJlc29sdmVkIGFyZSBub3QgZmlsdGVyZWQgYmVjYXVzZSB0aGV5IGFyZSBoYW5kbGVkIGJ5IHRoZSBFeHBsb3Jlci5cblx0cHJpdmF0ZSBhc3luYyB0b1ZhbGlkV29ya3NwYWNlRm9sZGVycyh3b3Jrc3BhY2VGb2xkZXJzOiBXb3Jrc3BhY2VGb2xkZXJbXSk6IFByb21pc2U8V29ya3NwYWNlRm9sZGVyW10+IHtcblx0XHRjb25zdCB2YWxpZFdvcmtzcGFjZUZvbGRlcnM6IFdvcmtzcGFjZUZvbGRlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VGb2xkZXIgb2Ygd29ya3NwYWNlRm9sZGVycykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHdvcmtzcGFjZUZvbGRlci51cmkpO1xuXHRcdFx0XHRpZiAoIXJlc3VsdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBJZ25vcmluZyB0aGUgZXJyb3Igd2hpbGUgdmFsaWRhdGluZyB3b3Jrc3BhY2UgZm9sZGVyICR7d29ya3NwYWNlRm9sZGVyLnVyaS50b1N0cmluZygpfSAtICR7dG9FcnJvck1lc3NhZ2UoZSl9YCk7XG5cdFx0XHR9XG5cdFx0XHR2YWxpZFdvcmtzcGFjZUZvbGRlcnMucHVzaCh3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsaWRXb3Jrc3BhY2VGb2xkZXJzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3cml0ZUNvbmZpZ3VyYXRpb25WYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElDb25maWd1cmF0aW9uVXBkYXRlT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgd3JpdGUgY29uZmlndXJhdGlvbiBiZWNhdXNlIHRoZSBjb25maWd1cmF0aW9uIHNlcnZpY2UgaXMgbm90IHlldCByZWFkeSB0byBhY2NlcHQgd3JpdGVzLicpO1xuXHRcdH1cblxuXHRcdGlmICh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNvbmZpZ3VyYXRpb24gdGFyZ2V0Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5NRU1PUlkpIHtcblx0XHRcdGNvbnN0IHByZXZpb3VzID0geyBkYXRhOiB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpLCB3b3Jrc3BhY2U6IHRoaXMud29ya3NwYWNlIH07XG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZVZhbHVlKGtleSwgdmFsdWUsIG92ZXJyaWRlcyk7XG5cdFx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKHsga2V5czogb3ZlcnJpZGVzPy5vdmVycmlkZUlkZW50aWZpZXJzPy5sZW5ndGggPyBba2V5RnJvbU92ZXJyaWRlSWRlbnRpZmllcnMob3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMpLCBrZXldIDogW2tleV0sIG92ZXJyaWRlczogb3ZlcnJpZGVzPy5vdmVycmlkZUlkZW50aWZpZXJzPy5sZW5ndGggPyBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycy5tYXAob3ZlcnJpZGVJZGVudGlmaWVyID0+IChbb3ZlcnJpZGVJZGVudGlmaWVyLCBba2V5XV0pKSA6IFtdIH0sIHByZXZpb3VzLCB0YXJnZXQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCA9IHRoaXMudG9FZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQodGFyZ2V0LCBrZXkpO1xuXHRcdGlmICghZWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY29uZmlndXJhdGlvbiB0YXJnZXQnKTtcblx0XHR9XG5cblx0XHRpZiAoZWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUgJiYgIXRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb25maWd1cmF0aW9uIHRhcmdldCcpO1xuXHRcdH1cblxuXHRcdGlmIChvdmVycmlkZXM/Lm92ZXJyaWRlSWRlbnRpZmllcnM/Lmxlbmd0aCAmJiBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uTW9kZWwgPSB0aGlzLmdldENvbmZpZ3VyYXRpb25Nb2RlbEZvckVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldChlZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQsIG92ZXJyaWRlcy5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvbk1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllcnMgPSBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycy5zb3J0KCk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nT3ZlcnJpZGVzID0gY29uZmlndXJhdGlvbk1vZGVsLm92ZXJyaWRlcy5maW5kKG92ZXJyaWRlID0+IGFycmF5RXF1YWxzKFsuLi5vdmVycmlkZS5pZGVudGlmaWVyc10uc29ydCgpLCBvdmVycmlkZUlkZW50aWZpZXJzKSk7XG5cdFx0XHRcdGlmIChleGlzdGluZ092ZXJyaWRlcykge1xuXHRcdFx0XHRcdG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzID0gZXhpc3RpbmdPdmVycmlkZXMuaWRlbnRpZmllcnM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVc2Ugc2FtZSBpbnN0YW5jZSBvZiBDb25maWd1cmF0aW9uRWRpdGluZyB0byBtYWtlIHN1cmUgYWxsIHdyaXRlcyBnbyB0aHJvdWdoIHRoZSBzYW1lIHF1ZXVlXG5cdFx0dGhpcy5jb25maWd1cmF0aW9uRWRpdGluZyA9IHRoaXMuY29uZmlndXJhdGlvbkVkaXRpbmcgPz8gdGhpcy5jcmVhdGVDb25maWd1cmF0aW9uRWRpdGluZ1NlcnZpY2UodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0YXdhaXQgKGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbkVkaXRpbmcpLndyaXRlQ29uZmlndXJhdGlvbihlZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQsIHsga2V5LCB2YWx1ZSB9LCB7IHNjb3Blczogb3ZlcnJpZGVzLCAuLi5vcHRpb25zIH0pO1xuXHRcdHN3aXRjaCAoZWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0KSB7XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0XHRpZiAodGhpcy5hcHBsaWNhdGlvbkNvbmZpZ3VyYXRpb24gJiYgdGhpcy5pc1NldHRpbmdBcHBsaWVkRm9yQWxsUHJvZmlsZXMoa2V5KSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVsb2FkQXBwbGljYXRpb25Db25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5yZWxvYWRMb2NhbFVzZXJDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbG9hZFJlbW90ZVVzZXJDb25maWd1cmF0aW9uKCkudGhlbigoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZWxvYWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOiB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IG92ZXJyaWRlcyAmJiBvdmVycmlkZXMucmVzb3VyY2UgPyB0aGlzLndvcmtzcGFjZS5nZXRGb2xkZXIob3ZlcnJpZGVzLnJlc291cmNlKSA6IG51bGw7XG5cdFx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yZWxvYWRXb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUNvbmZpZ3VyYXRpb25FZGl0aW5nU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogUHJvbWlzZTxDb25maWd1cmF0aW9uRWRpdGluZz4ge1xuXHRcdGNvbnN0IHJlbW90ZVNldHRpbmdzUmVzb3VyY2UgPSAoYXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKSk/LnNldHRpbmdzUGF0aCA/PyBudWxsO1xuXHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb25maWd1cmF0aW9uRWRpdGluZywgcmVtb3RlU2V0dGluZ3NSZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyYXRpb25Nb2RlbEZvckVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCh0YXJnZXQ6IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCwgcmVzb3VyY2U/OiBVUkkgfCBudWxsKTogQ29uZmlndXJhdGlvbk1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHRhcmdldCkge1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDogcmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ubG9jYWxVc2VyQ29uZmlndXJhdGlvbjtcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOiByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5yZW1vdGVVc2VyQ29uZmlndXJhdGlvbjtcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTogcmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ud29ya3NwYWNlQ29uZmlndXJhdGlvbjtcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6IHJldHVybiByZXNvdXJjZSA/IHRoaXMuX2NvbmZpZ3VyYXRpb24uZm9sZGVyQ29uZmlndXJhdGlvbnMuZ2V0KHJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uTW9kZWwodGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCByZXNvdXJjZT86IFVSSSB8IG51bGwpOiBDb25maWd1cmF0aW9uTW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHN3aXRjaCAodGFyZ2V0KSB7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDogcmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ubG9jYWxVc2VyQ29uZmlndXJhdGlvbjtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTogcmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ucmVtb3RlVXNlckNvbmZpZ3VyYXRpb247XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOiByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi53b3Jrc3BhY2VDb25maWd1cmF0aW9uO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6IHJldHVybiByZXNvdXJjZSA/IHRoaXMuX2NvbmZpZ3VyYXRpb24uZm9sZGVyQ29uZmlndXJhdGlvbnMuZ2V0KHJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkZXJpdmVDb25maWd1cmF0aW9uVGFyZ2V0cyhrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIGluc3BlY3Q6IElDb25maWd1cmF0aW9uVmFsdWU8dW5rbm93bj4pOiBDb25maWd1cmF0aW9uVGFyZ2V0W10ge1xuXHRcdGlmIChlcXVhbHModmFsdWUsIGluc3BlY3QudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVmaW5lZFRhcmdldHM6IENvbmZpZ3VyYXRpb25UYXJnZXRbXSA9IFtdO1xuXHRcdGlmIChpbnNwZWN0LndvcmtzcGFjZUZvbGRlclZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlZmluZWRUYXJnZXRzLnB1c2goQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKTtcblx0XHR9XG5cdFx0aWYgKGluc3BlY3Qud29ya3NwYWNlVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVmaW5lZFRhcmdldHMucHVzaChDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0fVxuXHRcdGlmIChpbnNwZWN0LnVzZXJSZW1vdGVWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkZWZpbmVkVGFyZ2V0cy5wdXNoKENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpO1xuXHRcdH1cblx0XHRpZiAoaW5zcGVjdC51c2VyTG9jYWxWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkZWZpbmVkVGFyZ2V0cy5wdXNoKENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCk7XG5cdFx0fVxuXHRcdGlmIChpbnNwZWN0LmFwcGxpY2F0aW9uVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVmaW5lZFRhcmdldHMucHVzaChDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBzZXR0aW5nIGluIGFsbCBkZWZpbmVkIHRhcmdldHNcblx0XHRcdHJldHVybiBkZWZpbmVkVGFyZ2V0cztcblx0XHR9XG5cblx0XHRyZXR1cm4gW2RlZmluZWRUYXJnZXRzWzBdIHx8IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl07XG5cdH1cblxuXHRwcml2YXRlIHRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2UsIHByZXZpb3VzOiB7IGRhdGE6IElDb25maWd1cmF0aW9uRGF0YTsgd29ya3NwYWNlPzogV29ya3NwYWNlIH0gfCB1bmRlZmluZWQsIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IHZvaWQge1xuXHRcdGlmIChjaGFuZ2Uua2V5cy5sZW5ndGgpIHtcblx0XHRcdGlmICh0YXJnZXQgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYENvbmZpZ3VyYXRpb24ga2V5cyBjaGFuZ2VkIGluICR7Q29uZmlndXJhdGlvblRhcmdldFRvU3RyaW5nKHRhcmdldCl9IHRhcmdldGAsIC4uLmNoYW5nZS5rZXlzKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCA9IG5ldyBDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQoY2hhbmdlLCBwcmV2aW91cywgdGhpcy5fY29uZmlndXJhdGlvbiwgdGhpcy53b3Jrc3BhY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRjb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQuc291cmNlID0gdGFyZ2V0O1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmZpcmUoY29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0KHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwga2V5OiBzdHJpbmcpOiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQgfCBudWxsIHtcblx0XHRpZiAodGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OKSB7XG5cdFx0XHRyZXR1cm4gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw7XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUikge1xuXHRcdFx0aWYgKHRoaXMucmVtb3RlVXNlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0Y29uc3Qgc2NvcGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpW2tleV0/LnNjb3BlO1xuXHRcdFx0XHRpZiAoc2NvcGUgPT09IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FIHx8IHNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORV9PVkVSUklEQUJMRSB8fCBzY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OX01BQ0hJTkUpIHtcblx0XHRcdFx0XHRyZXR1cm4gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLmluc3BlY3Qoa2V5KS51c2VyUmVtb3RlVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDtcblx0XHR9XG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSB7XG5cdFx0XHRyZXR1cm4gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw7XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpIHtcblx0XHRcdHJldHVybiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU7XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSB7XG5cdFx0XHRyZXR1cm4gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTtcblx0XHR9XG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKSB7XG5cdFx0XHRyZXR1cm4gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG5cbmNsYXNzIFJlZ2lzdGVyQ29uZmlndXJhdGlvblNjaGVtYXNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRleHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWdpc3RlckNvbmZpZ3VyYXRpb25TY2hlbWFzKCk7XG5cblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdFx0XHRjb25zdCBkZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oNTApKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShjb25maWd1cmF0aW9uUmVnaXN0cnkub25EaWRVcGRhdGVDb25maWd1cmF0aW9uLCBjb25maWd1cmF0aW9uUmVnaXN0cnkub25EaWRTY2hlbWFDaGFuZ2UsIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCkoKCkgPT5cblx0XHRcdFx0ZGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMucmVnaXN0ZXJDb25maWd1cmF0aW9uU2NoZW1hcygpLCBsaWZlY3ljbGVTZXJ2aWNlLnBoYXNlID09PSBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5ID8gdW5kZWZpbmVkIDogMjUwMCAvKiBkZWxheSBsb25nZXIgaW4gZWFybHkgcGhhc2VzICovKSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbmZpZ3VyYXRpb25TY2hlbWFzKCk6IHZvaWQge1xuXHRcdC8vIEVuc3VyZSBkZXByZWNhdGlvbk1lc3NhZ2UgaXMgcGxhaW4gdGV4dCBmb3IgcHJvcGVydGllcyB3aGVyZSBpdCB3YXMgZGVyaXZlZCBmcm9tXG5cdFx0Ly8gbWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2UsIHNpbmNlIHRoZSBKU09OIGVkaXRvciBkaWFnbm9zdGljcyBkb24ndCBzdXBwb3J0IG1hcmtkb3duLlxuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGFsbFNldHRpbmdzLnByb3BlcnRpZXMpKSB7XG5cdFx0XHRjb25zdCBwcm9wID0gYWxsU2V0dGluZ3MucHJvcGVydGllc1trZXldO1xuXHRcdFx0aWYgKHByb3AubWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2UgJiYgcHJvcC5kZXByZWNhdGlvbk1lc3NhZ2UgPT09IHByb3AubWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdFx0cHJvcC5kZXByZWNhdGlvbk1lc3NhZ2UgPSByZW5kZXJBc1BsYWludGV4dCh7IHZhbHVlOiBmaXhTZXR0aW5nTGlua3MocHJvcC5tYXJrZG93bkRlcHJlY2F0aW9uTWVzc2FnZSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0cHJvcGVydGllczogYWxsU2V0dGluZ3MucHJvcGVydGllcyxcblx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiBhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllcyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxuXHRcdFx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0XHRcdGFsbG93Q29tbWVudHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgdXNlclNldHRpbmdzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSA/XG5cdFx0XHR7XG5cdFx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5hc3NpZ24oe30sXG5cdFx0XHRcdFx0YXBwbGljYXRpb25TZXR0aW5ncy5wcm9wZXJ0aWVzLFxuXHRcdFx0XHRcdHdpbmRvd1NldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdFx0cmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzXG5cdFx0XHRcdCksXG5cdFx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiBhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllcyxcblx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdFx0XHRcdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdFx0XHRcdGFsbG93Q29tbWVudHM6IHRydWVcblx0XHRcdH1cblx0XHRcdDogYWxsU2V0dGluZ3NTY2hlbWE7XG5cblx0XHRjb25zdCBwcm9maWxlU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0cHJvcGVydGllczogT2JqZWN0LmFzc2lnbih7fSxcblx0XHRcdFx0bWFjaGluZVNldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdG1hY2hpbmVPdmVycmlkYWJsZVNldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdHdpbmRvd1NldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdHJlc291cmNlU2V0dGluZ3MucHJvcGVydGllc1xuXHRcdFx0KSxcblx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiBhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllcyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxuXHRcdFx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0XHRcdGFsbG93Q29tbWVudHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFjaGluZVNldHRpbmdzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5hc3NpZ24oe30sXG5cdFx0XHRcdGFwcGxpY2F0aW9uTWFjaGluZVNldHRpbmdzLnByb3BlcnRpZXMsXG5cdFx0XHRcdG1hY2hpbmVTZXR0aW5ncy5wcm9wZXJ0aWVzLFxuXHRcdFx0XHRtYWNoaW5lT3ZlcnJpZGFibGVTZXR0aW5ncy5wcm9wZXJ0aWVzLFxuXHRcdFx0XHR3aW5kb3dTZXR0aW5ncy5wcm9wZXJ0aWVzLFxuXHRcdFx0XHRyZXNvdXJjZVNldHRpbmdzLnByb3BlcnRpZXNcblx0XHRcdCksXG5cdFx0XHRwYXR0ZXJuUHJvcGVydGllczogYWxsU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXMsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHRcdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdFx0XHRhbGxvd0NvbW1lbnRzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZVNldHRpbmdzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5hc3NpZ24oe30sXG5cdFx0XHRcdHRoaXMuY2hlY2tBbmRGaWx0ZXJQcm9wZXJ0aWVzUmVxdWlyaW5nVHJ1c3QobWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MucHJvcGVydGllcyksXG5cdFx0XHRcdHRoaXMuY2hlY2tBbmRGaWx0ZXJQcm9wZXJ0aWVzUmVxdWlyaW5nVHJ1c3Qod2luZG93U2V0dGluZ3MucHJvcGVydGllcyksXG5cdFx0XHRcdHRoaXMuY2hlY2tBbmRGaWx0ZXJQcm9wZXJ0aWVzUmVxdWlyaW5nVHJ1c3QocmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzKVxuXHRcdFx0KSxcblx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiBhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllcyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxuXHRcdFx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0XHRcdGFsbG93Q29tbWVudHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGVmYXVsdFNldHRpbmdzU2NoZW1hID0ge1xuXHRcdFx0cHJvcGVydGllczogT2JqZWN0LmtleXMoYWxsU2V0dGluZ3MucHJvcGVydGllcykucmVkdWNlPElKU09OU2NoZW1hTWFwPigocmVzdWx0LCBrZXkpID0+IHtcblx0XHRcdFx0cmVzdWx0W2tleV0gPSBPYmplY3QuYXNzaWduKHsgZGVwcmVjYXRpb25NZXNzYWdlOiB1bmRlZmluZWQgfSwgYWxsU2V0dGluZ3MucHJvcGVydGllc1trZXldKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0sIHt9KSxcblx0XHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiBPYmplY3Qua2V5cyhhbGxTZXR0aW5ncy5wYXR0ZXJuUHJvcGVydGllcykucmVkdWNlPElKU09OU2NoZW1hTWFwPigocmVzdWx0LCBrZXkpID0+IHtcblx0XHRcdFx0cmVzdWx0W2tleV0gPSBPYmplY3QuYXNzaWduKHsgZGVwcmVjYXRpb25NZXNzYWdlOiB1bmRlZmluZWQgfSwgYWxsU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXNba2V5XSk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9LCB7fSksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHRcdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdFx0XHRhbGxvd0NvbW1lbnRzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGZvbGRlclNldHRpbmdzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSA9PT0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID9cblx0XHRcdHtcblx0XHRcdFx0cHJvcGVydGllczogT2JqZWN0LmFzc2lnbih7fSxcblx0XHRcdFx0XHR0aGlzLmNoZWNrQW5kRmlsdGVyUHJvcGVydGllc1JlcXVpcmluZ1RydXN0KG1hY2hpbmVPdmVycmlkYWJsZVNldHRpbmdzLnByb3BlcnRpZXMpLFxuXHRcdFx0XHRcdHRoaXMuY2hlY2tBbmRGaWx0ZXJQcm9wZXJ0aWVzUmVxdWlyaW5nVHJ1c3QocmVzb3VyY2VTZXR0aW5ncy5wcm9wZXJ0aWVzKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwYXR0ZXJuUHJvcGVydGllczogYWxsU2V0dGluZ3MucGF0dGVyblByb3BlcnRpZXMsXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxuXHRcdFx0XHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRcdFx0XHRhbGxvd0NvbW1lbnRzOiB0cnVlXG5cdFx0XHR9IDogd29ya3NwYWNlU2V0dGluZ3NTY2hlbWE7XG5cblx0XHRjb25zdCBjb25maWdEZWZhdWx0c1NjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29uZmlndXJhdGlvbkRlZmF1bHRzLmRlc2NyaXB0aW9uJywgJ0NvbnRyaWJ1dGUgZGVmYXVsdHMgZm9yIGNvbmZpZ3VyYXRpb25zJyksXG5cdFx0XHRwcm9wZXJ0aWVzOiBPYmplY3QuYXNzaWduKHt9LFxuXHRcdFx0XHR0aGlzLmZpbHRlckRlZmF1bHRPdmVycmlkYWJsZVByb3BlcnRpZXMobWFjaGluZU92ZXJyaWRhYmxlU2V0dGluZ3MucHJvcGVydGllcyksXG5cdFx0XHRcdHRoaXMuZmlsdGVyRGVmYXVsdE92ZXJyaWRhYmxlUHJvcGVydGllcyh3aW5kb3dTZXR0aW5ncy5wcm9wZXJ0aWVzKSxcblx0XHRcdFx0dGhpcy5maWx0ZXJEZWZhdWx0T3ZlcnJpZGFibGVQcm9wZXJ0aWVzKHJlc291cmNlU2V0dGluZ3MucHJvcGVydGllcylcblx0XHRcdCksXG5cdFx0XHRwYXR0ZXJuUHJvcGVydGllczoge1xuXHRcdFx0XHRbT1ZFUlJJREVfUFJPUEVSVFlfUEFUVEVSTl06IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdFx0XHQkcmVmOiByZXNvdXJjZUxhbmd1YWdlU2V0dGluZ3NTY2hlbWFJZCxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxuXHRcdH07XG5cdFx0dGhpcy5yZWdpc3RlclNjaGVtYXMoe1xuXHRcdFx0ZGVmYXVsdFNldHRpbmdzU2NoZW1hLFxuXHRcdFx0dXNlclNldHRpbmdzU2NoZW1hLFxuXHRcdFx0cHJvZmlsZVNldHRpbmdzU2NoZW1hLFxuXHRcdFx0bWFjaGluZVNldHRpbmdzU2NoZW1hLFxuXHRcdFx0d29ya3NwYWNlU2V0dGluZ3NTY2hlbWEsXG5cdFx0XHRmb2xkZXJTZXR0aW5nc1NjaGVtYSxcblx0XHRcdGNvbmZpZ0RlZmF1bHRzU2NoZW1hLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNjaGVtYXMoc2NoZW1hczoge1xuXHRcdGRlZmF1bHRTZXR0aW5nc1NjaGVtYTogSUpTT05TY2hlbWE7XG5cdFx0dXNlclNldHRpbmdzU2NoZW1hOiBJSlNPTlNjaGVtYTtcblx0XHRwcm9maWxlU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hO1xuXHRcdG1hY2hpbmVTZXR0aW5nc1NjaGVtYTogSUpTT05TY2hlbWE7XG5cdFx0d29ya3NwYWNlU2V0dGluZ3NTY2hlbWE6IElKU09OU2NoZW1hO1xuXHRcdGZvbGRlclNldHRpbmdzU2NoZW1hOiBJSlNPTlNjaGVtYTtcblx0XHRjb25maWdEZWZhdWx0c1NjaGVtYTogSUpTT05TY2hlbWE7XG5cdH0pOiB2b2lkIHtcblx0XHRjb25zdCBqc29uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblx0XHRqc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEoZGVmYXVsdFNldHRpbmdzU2NoZW1hSWQsIHNjaGVtYXMuZGVmYXVsdFNldHRpbmdzU2NoZW1hKTtcblx0XHRqc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEodXNlclNldHRpbmdzU2NoZW1hSWQsIHNjaGVtYXMudXNlclNldHRpbmdzU2NoZW1hKTtcblx0XHRqc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEocHJvZmlsZVNldHRpbmdzU2NoZW1hSWQsIHNjaGVtYXMucHJvZmlsZVNldHRpbmdzU2NoZW1hKTtcblx0XHRqc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEobWFjaGluZVNldHRpbmdzU2NoZW1hSWQsIHNjaGVtYXMubWFjaGluZVNldHRpbmdzU2NoZW1hKTtcblx0XHRqc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEod29ya3NwYWNlU2V0dGluZ3NTY2hlbWFJZCwgc2NoZW1hcy53b3Jrc3BhY2VTZXR0aW5nc1NjaGVtYSk7XG5cdFx0anNvblJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKGZvbGRlclNldHRpbmdzU2NoZW1hSWQsIHNjaGVtYXMuZm9sZGVyU2V0dGluZ3NTY2hlbWEpO1xuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShjb25maWd1cmF0aW9uRGVmYXVsdHNTY2hlbWFJZCwgc2NoZW1hcy5jb25maWdEZWZhdWx0c1NjaGVtYSk7XG5cdH1cblxuXHRwcml2YXRlIGNoZWNrQW5kRmlsdGVyUHJvcGVydGllc1JlcXVpcmluZ1RydXN0KHByb3BlcnRpZXM6IElTdHJpbmdEaWN0aW9uYXJ5PElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWE+KTogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4ge1xuXHRcdGlmICh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdHJldHVybiBwcm9wZXJ0aWVzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4gPSB7fTtcblx0XHRPYmplY3QuZW50cmllcyhwcm9wZXJ0aWVzKS5mb3JFYWNoKChba2V5LCB2YWx1ZV0pID0+IHtcblx0XHRcdGlmICghdmFsdWUucmVzdHJpY3RlZCkge1xuXHRcdFx0XHRyZXN1bHRba2V5XSA9IHZhbHVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGZpbHRlckRlZmF1bHRPdmVycmlkYWJsZVByb3BlcnRpZXMocHJvcGVydGllczogSVN0cmluZ0RpY3Rpb25hcnk8SUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYT4pOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiA9IHt9O1xuXHRcdE9iamVjdC5lbnRyaWVzKHByb3BlcnRpZXMpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZS5kaXNhbGxvd0NvbmZpZ3VyYXRpb25EZWZhdWx0KSB7XG5cdFx0XHRcdHJlc3VsdFtrZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBDb25maWd1cmF0aW9uRGVmYXVsdE92ZXJyaWRlc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNDb250cmlidXRpb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvY2Vzc2VkRXhwZXJpbWVudGFsU2V0dGluZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBhdXRvRXhwZXJpbWVudGFsU2V0dGluZ3MgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBXb3Jrc3BhY2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnRocm90dGxlci5xdWV1ZSgoKSA9PiB0aGlzLnVwZGF0ZURlZmF1bHRzKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLm9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzKCgpID0+IHRoaXMudGhyb3R0bGVyLnF1ZXVlKCgpID0+IHRoaXMucHJvY2Vzc0V4cGVyaW1lbnRhbFNldHRpbmdzKHRoaXMuYXV0b0V4cGVyaW1lbnRhbFNldHRpbmdzLCB0cnVlKSkpKTtcblxuXHRcdC8vIFdoZW4gY29uZmlndXJhdGlvbiBpcyB1cGRhdGVkIG1ha2Ugc3VyZSB0byBhcHBseSBleHBlcmltZW50YWwgY29uZmlndXJhdGlvbiBvdmVycmlkZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5vbkRpZFVwZGF0ZUNvbmZpZ3VyYXRpb24oKHsgcHJvcGVydGllcyB9KSA9PiB0aGlzLnByb2Nlc3NFeHBlcmltZW50YWxTZXR0aW5ncyhwcm9wZXJ0aWVzLCBmYWxzZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlRGVmYXVsdHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdDb25maWd1cmF0aW9uU2VydmljZSN1cGRhdGVEZWZhdWx0czogYmVnaW4nKTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gQ2hlY2sgZm9yIGV4cGVyaW1lbnRzXG5cdFx0XHRhd2FpdCB0aGlzLnByb2Nlc3NFeHBlcmltZW50YWxTZXR0aW5ncyhPYmplY3Qua2V5cyh0aGlzLmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpKSwgZmFsc2UpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBJbnZhbGlkYXRlIGRlZmF1bHRzIGNhY2hlIGFmdGVyIGV4dGVuc2lvbnMgaGF2ZSByZWdpc3RlcmVkXG5cdFx0XHQvLyBhbmQgYWZ0ZXIgdGhlIGV4cGVyaW1lbnRzIGhhdmUgYmVlbiByZXNvbHZlZCB0byBwcmV2ZW50XG5cdFx0XHQvLyByZXNldHRpbmcgdGhlIG92ZXJyaWRlcyB0b28gZWFybHkuXG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0NvbmZpZ3VyYXRpb25TZXJ2aWNlI3VwZGF0ZURlZmF1bHRzOiByZXNldHRpbmcgdGhlIGRlZmF1bHRzJyk7XG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlbG9hZENvbmZpZ3VyYXRpb24oQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHByb2Nlc3NFeHBlcmltZW50YWxTZXR0aW5ncyhwcm9wZXJ0aWVzOiBJdGVyYWJsZTxzdHJpbmc+LCBhdXRvUmVmZXRjaDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG92ZXJyaWRlczogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gPSB7fTtcblx0XHRjb25zdCBhbGxQcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBkZWZhdWx0Q29uZmlndXJhdGlvbnNQcmV2ZW50aW5nRXhwZXJpbWVudE92ZXJyaWRlcyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFJlZ2lzdGVyZWREZWZhdWx0Q29uZmlndXJhdGlvbnMoKS5maWx0ZXIoY29uZmlndXJhdGlvbiA9PiBjb25maWd1cmF0aW9uLnByZXZlbnRFeHBlcmltZW50T3ZlcnJpZGUpO1xuXHRcdGZvciAoY29uc3QgcHJvcGVydHkgb2YgcHJvcGVydGllcykge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gYWxsUHJvcGVydGllc1twcm9wZXJ0eV07XG5cdFx0XHRpZiAoIXNjaGVtYT8uZXhwZXJpbWVudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlZmF1bHRWYWx1ZVNvdXJjZTogQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2UgfCB1bmRlZmluZWQgPSBzY2hlbWEuZGVmYXVsdFZhbHVlU291cmNlICYmICEoc2NoZW1hLmRlZmF1bHRWYWx1ZVNvdXJjZSBpbnN0YW5jZW9mIE1hcCkgPyBzY2hlbWEuZGVmYXVsdFZhbHVlU291cmNlIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGRlZmF1bHRWYWx1ZVNvdXJjZSAmJiBkZWZhdWx0Q29uZmlndXJhdGlvbnNQcmV2ZW50aW5nRXhwZXJpbWVudE92ZXJyaWRlcy5zb21lKGNvbmZpZ3VyYXRpb24gPT4gaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscyhjb25maWd1cmF0aW9uLnNvdXJjZSwgZGVmYXVsdFZhbHVlU291cmNlKSAmJiBjb25maWd1cmF0aW9uLm92ZXJyaWRlcz8uW3Byb3BlcnR5XSAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghYXV0b1JlZmV0Y2ggJiYgdGhpcy5wcm9jZXNzZWRFeHBlcmltZW50YWxTZXR0aW5ncy5oYXMocHJvcGVydHkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5wcm9jZXNzZWRFeHBlcmltZW50YWxTZXR0aW5ncy5hZGQocHJvcGVydHkpO1xuXHRcdFx0aWYgKHNjaGVtYS5leHBlcmltZW50Lm1vZGUgPT09ICdhdXRvJykge1xuXHRcdFx0XHR0aGlzLmF1dG9FeHBlcmltZW50YWxTZXR0aW5ncy5hZGQocHJvcGVydHkpO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLndvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLmdldFRyZWF0bWVudChzY2hlbWEuZXhwZXJpbWVudC5uYW1lID8/IGBjb25maWcuJHtwcm9wZXJ0eX1gKTtcblx0XHRcdFx0aWYgKHRoaXMuc2hvdWxkT3ZlcnJpZGUodmFsdWUsIHNjaGVtYSkpIHtcblx0XHRcdFx0XHRvdmVycmlkZXNbcHJvcGVydHldID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7LyppZ25vcmUgKi8gfVxuXHRcdH1cblx0XHRpZiAoT2JqZWN0LmtleXMob3ZlcnJpZGVzKS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFt7IG92ZXJyaWRlcywgc291cmNlOiAnZXhwZXJpbWVudHMnIH1dKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZE92ZXJyaWRlKHZhbHVlOiB1bmtub3duLCBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpOiBib29sZWFuIHtcblx0XHRpZiAoaXNVbmRlZmluZWQodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ICYmIHNjaGVtYS5hZ2VudHNXaW5kb3c/LmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuICFlcXVhbHModmFsdWUsIHNjaGVtYS5hZ2VudHNXaW5kb3c/LmRlZmF1bHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gIWVxdWFscyh2YWx1ZSwgc2NoZW1hLmRlZmF1bHQpO1xuXHR9XG59XG5cbmNvbnN0IHdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKTtcbndvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihSZWdpc3RlckNvbmZpZ3VyYXRpb25TY2hlbWFzQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoQ29uZmlndXJhdGlvbkRlZmF1bHRPdmVycmlkZXNDb250cmlidXRpb24uSUQsIENvbmZpZ3VyYXRpb25EZWZhdWx0T3ZlcnJpZGVzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUpO1xuXG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdC4uLndvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0cHJvcGVydGllczoge1xuXHRcdFtBUFBMWV9BTExfUFJPRklMRVNfU0VUVElOR106IHtcblx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2V0dGluZyBkZXNjcmlwdGlvbicsIFwiQ29uZmlndXJlIHNldHRpbmdzIHRvIGJlIGFwcGxpZWQgZm9yIGFsbCBwcm9maWxlcy5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IFtdLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdFx0XHR1bmlxdWVJdGVtczogdHJ1ZSxcblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxt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QSxJQUNoRztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsT0FBZ0IsUUFBK0M7QUFDckYsUUFBSSxZQUFZLEtBQUssR0FBRztBQUN2QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBSyxtQkFBbUIsb0JBQW9CLE9BQU8sY0FBYyxZQUFZLFFBQVc7QUFDM0YsYUFBTyxDQUFDLE9BQU8sT0FBTyxPQUFPLGNBQWMsT0FBTztBQUFBLElBQ25EO0FBQ0EsV0FBTyxDQUFDLE9BQU8sT0FBTyxPQUFPLE9BQU87QUFBQSxFQUNyQztBQUNEO0FBakZNLDBDQUVXLEtBQUs7QUFGaEIsNENBQU47QUFBQSxFQVVHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBZEc7QUFtRk4sTUFBTSxpQ0FBaUMsU0FBUyxHQUFvQyxvQkFBb0IsU0FBUztBQUNqSCwrQkFBK0IsOEJBQThCLDBDQUEwQyxlQUFlLFFBQVE7QUFDOUgsK0JBQStCLDBDQUEwQyxJQUFJLDJDQUEyQyxlQUFlLFlBQVk7QUFFbkosTUFBTSx3QkFBd0IsU0FBUyxHQUEyQixXQUFXLGFBQWE7QUFDMUYsc0JBQXNCLHNCQUFzQjtBQUFBLEVBQzNDLEdBQUc7QUFBQSxFQUNILFlBQVk7QUFBQSxJQUNYLENBQUMsMEJBQTBCLEdBQUc7QUFBQSxNQUM3QixRQUFRO0FBQUEsTUFDUixhQUFhLFNBQVMsdUJBQXVCLG9EQUFvRDtBQUFBLE1BQ2pHLFdBQVcsQ0FBQztBQUFBLE1BQ1osU0FBUyxtQkFBbUI7QUFBQSxNQUM1QixzQkFBc0I7QUFBQSxNQUN0QixhQUFhO0FBQUEsSUFDZDtBQUFBLEVBQ0Q7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJyZW1vdGVVc2VyQ29uZmlndXJhdGlvbk1vZGVsIiwgImluZGV4IiwgInRhcmdldCIsICJjaGFuZ2UiLCAiY29uZmlndXJhdGlvblJlZ2lzdHJ5Il0KfQo=
