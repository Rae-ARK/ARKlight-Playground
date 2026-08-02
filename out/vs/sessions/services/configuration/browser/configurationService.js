import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { Promises, Queue } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { parse } from "../../../../base/common/json.js";
import { applyEdits, setProperty } from "../../../../base/common/jsonEdit.js";
import { deepClone, equals } from "../../../../base/common/objects.js";
import { distinct, equals as arrayEquals } from "../../../../base/common/arrays.js";
import { OS, OperatingSystem } from "../../../../base/common/platform.js";
import { ConfigurationTarget, isConfigurationOverrides, isConfigurationUpdateOverrides } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
import { ConfigurationChangeEvent, ConfigurationModel } from "../../../../platform/configuration/common/configurationModels.js";
import { NullPolicyConfiguration, PolicyConfiguration } from "../../../../platform/configuration/common/configurations.js";
import { Extensions, keyFromOverrideIdentifiers } from "../../../../platform/configuration/common/configurationRegistry.js";
import { FileOperationResult } from "../../../../platform/files/common/files.js";
import { NullPolicyService } from "../../../../platform/policy/common/policy.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { DefaultConfiguration, FolderConfiguration, UserConfiguration, WorkspaceConfiguration } from "../../../../workbench/services/configuration/browser/configuration.js";
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, FOLDER_CONFIG_FOLDER_NAME, FOLDER_SETTINGS_PATH } from "../../../../workbench/services/configuration/common/configuration.js";
import { Configuration } from "../../../../workbench/services/configuration/common/configurationModels.js";
import "../../../../workbench/services/configuration/browser/configurationService.js";
class SessionsDefaultConfiguration extends DefaultConfiguration {
  getDefaultValue(_key, propertySchema) {
    if (propertySchema.agentsWindow && propertySchema.defaultValueSource !== "experiments") {
      return deepClone(propertySchema.agentsWindow.default);
    }
    return super.getDefaultValue(_key, propertySchema);
  }
}
class ConfigurationService extends Disposable {
  constructor(userDataProfileService, workspaceService, uriIdentityService, fileService, policyService, logService, configurationCache, environmentService) {
    super();
    this.workspaceService = workspaceService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.logService = logService;
    this.cachedFolderConfigs = this._register(new DisposableMap(new ResourceMap()));
    this.agentsWindowReadOnlyKeys = /* @__PURE__ */ new Set();
    this._onDidChangeConfiguration = this._register(new Emitter());
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this.onDidChangeRestrictedSettings = Event.None;
    this.restrictedSettings = { default: [] };
    this.configurationRegistry = Registry.as(Extensions.Configuration);
    this.settingsResource = userDataProfileService.currentProfile.settingsResource;
    this.defaultConfiguration = this._register(new SessionsDefaultConfiguration(userDataProfileService.currentProfile.id, configurationCache, environmentService, logService));
    this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
    this.initAgentsWindowReadOnlyKeys();
    this.userConfiguration = this._register(new UserConfiguration(userDataProfileService.currentProfile.settingsResource, userDataProfileService.currentProfile.tasksResource, userDataProfileService.currentProfile.mcpResource, { exclude: [...this.agentsWindowReadOnlyKeys] }, fileService, uriIdentityService, logService));
    this.workspaceConfiguration = this._register(new WorkspaceConfiguration({ needsCaching: () => false, read: async () => "", write: async () => {
    }, remove: async () => {
    } }, fileService, uriIdentityService, logService));
    this.configurationEditing = new ConfigurationEditing(fileService, this);
    this._configuration = new Configuration(
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      ConfigurationModel.createEmptyModel(logService),
      new ResourceMap(),
      this.workspaceService.getWorkspace(),
      this.logService
    );
    this._register(this.defaultConfiguration.onDidChangeConfiguration(({ defaults, properties }) => this.onDefaultConfigurationChanged(defaults, properties)));
    this._register(this.policyConfiguration.onDidChangeConfiguration((configurationModel) => this.onPolicyConfigurationChanged(configurationModel)));
    this._register(this.userConfiguration.onDidChangeConfiguration((userConfiguration) => this.onUserConfigurationChanged(userConfiguration)));
    this._register(this.workspaceConfiguration.onDidUpdateConfiguration(() => this.onWorkspaceConfigurationChanged()));
    this._register(this.workspaceService.onWillChangeWorkspaceFolders((e) => e.join(this.loadFolderConfigurations(e.changes.added))));
    this._register(this.workspaceService.onDidChangeWorkspaceFolders((e) => this.onWorkspaceFoldersChanged(e)));
  }
  async initialize() {
    const workspace = this.workspaceService.getWorkspace();
    const workspaceIdentifier = { id: workspace.id, configPath: workspace.configuration };
    const [defaultModel, policyModel, userModel] = await Promise.all([
      this.defaultConfiguration.initialize(),
      this.policyConfiguration.initialize(),
      this.userConfiguration.initialize(),
      this.workspaceConfiguration.initialize(workspaceIdentifier, true)
    ]);
    this.workspaceConfiguration.reparseWorkspaceSettings({ exclude: [...this.agentsWindowReadOnlyKeys] });
    this._configuration = new Configuration(
      defaultModel,
      policyModel,
      ConfigurationModel.createEmptyModel(this.logService),
      userModel,
      ConfigurationModel.createEmptyModel(this.logService),
      this.workspaceConfiguration.getConfiguration(),
      new ResourceMap(),
      ConfigurationModel.createEmptyModel(this.logService),
      new ResourceMap(),
      workspace,
      this.logService
    );
    await this.loadFolderConfigurations(workspace.folders);
  }
  // #region IWorkbenchConfigurationService
  getConfigurationData() {
    return this._configuration.toData();
  }
  getValue(arg1, arg2) {
    const section = typeof arg1 === "string" ? arg1 : void 0;
    const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : void 0;
    return this._configuration.getValue(section, overrides);
  }
  async updateValue(key, value, arg3, arg4, _options) {
    const overrides = isConfigurationUpdateOverrides(arg3) ? arg3 : isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : void 0 } : void 0;
    let target = overrides ? arg4 : arg3;
    if (key === ChatAIDisabledSettingId) {
      target = ConfigurationTarget.WORKSPACE;
    }
    const targets = target ? [target] : [];
    if (overrides?.overrideIdentifiers) {
      overrides.overrideIdentifiers = distinct(overrides.overrideIdentifiers);
      overrides.overrideIdentifiers = overrides.overrideIdentifiers.length ? overrides.overrideIdentifiers : void 0;
    }
    const inspect = this.inspect(key, { resource: overrides?.resource, overrideIdentifier: overrides?.overrideIdentifiers ? overrides.overrideIdentifiers[0] : void 0 });
    if (inspect.policyValue !== void 0) {
      throw new Error(`Unable to write ${key} because it is configured in system policy.`);
    }
    if (this.agentsWindowReadOnlyKeys.has(key)) {
      throw new Error(`Unable to write ${key} because it is read-only in the Agents window.`);
    }
    if (!targets.length) {
      targets.push(...this.deriveConfigurationTargets(key, value, inspect));
      if (equals(value, inspect.defaultValue) && targets.length === 1 && targets[0] === ConfigurationTarget.USER) {
        value = void 0;
      }
    }
    if (overrides?.overrideIdentifiers?.length && overrides.overrideIdentifiers.length > 1) {
      const overrideIdentifiers = overrides.overrideIdentifiers.sort();
      const existingOverrides = this._configuration.localUserConfiguration.overrides.find((override) => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
      if (existingOverrides) {
        overrides.overrideIdentifiers = existingOverrides.identifiers;
      }
    }
    await Promises.settled(targets.map((t) => this.writeConfigurationValue(key, value, t, overrides)));
  }
  async writeConfigurationValue(key, value, target, overrides) {
    let path = overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];
    const settingsResource = this.getSettingsResource(target, overrides?.resource ?? void 0);
    if (this.isWorkspaceConfigurationResource(settingsResource)) {
      path = ["settings", ...path];
    }
    await this.configurationEditing.write(settingsResource, path, value);
    await this.reloadConfiguration();
  }
  deriveConfigurationTargets(_key, value, inspect) {
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
    if (inspect.userValue !== void 0) {
      definedTargets.push(ConfigurationTarget.USER);
    }
    if (value === void 0) {
      return definedTargets;
    }
    return [definedTargets[0] || ConfigurationTarget.USER];
  }
  isWorkspaceConfigurationResource(resource) {
    const workspace = this.workspaceService.getWorkspace();
    return !!(workspace.configuration && this.uriIdentityService.extUri.isEqual(workspace.configuration, resource));
  }
  getSettingsResource(target, resource) {
    if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
      if (resource) {
        const folder = this.workspaceService.getWorkspaceFolder(resource);
        if (folder) {
          return this.uriIdentityService.extUri.joinPath(folder.uri, FOLDER_SETTINGS_PATH);
        }
      }
    }
    if (target === ConfigurationTarget.WORKSPACE) {
      const workspace = this.workspaceService.getWorkspace();
      if (workspace.configuration) {
        return workspace.configuration;
      }
    }
    return this.settingsResource;
  }
  inspect(key, overrides) {
    return this._configuration.inspect(key, overrides);
  }
  keys() {
    return this._configuration.keys();
  }
  async reloadConfiguration(_target) {
    this.reloadDefaultConfiguration();
    if (_target === ConfigurationTarget.DEFAULT) {
      return;
    }
    const userModel = await this.userConfiguration.initialize();
    const previousData = this._configuration.toData();
    const change = this._configuration.compareAndUpdateLocalUserConfiguration(userModel);
    const workspaceChange = await this.loadWorkspaceConfiguration();
    change.keys.push(...workspaceChange.keys);
    change.overrides.push(...workspaceChange.overrides);
    for (const folder of this.workspaceService.getWorkspace().folders) {
      const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
      if (folderConfiguration) {
        const folderModel = await folderConfiguration.loadConfiguration();
        const folderChange = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderModel);
        change.keys.push(...folderChange.keys);
        change.overrides.push(...folderChange.overrides);
      }
    }
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.USER);
  }
  reloadDefaultConfiguration() {
    this.onDefaultConfigurationChanged(this.defaultConfiguration.reload());
  }
  hasCachedConfigurationDefaultsOverrides() {
    return this.defaultConfiguration.hasCachedConfigurationDefaultsOverrides();
  }
  async whenRemoteConfigurationLoaded() {
  }
  isSettingAppliedForAllProfiles(key) {
    const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
    if (scope && APPLICATION_SCOPES.includes(scope)) {
      return true;
    }
    const allProfilesSettings = this.getValue(APPLY_ALL_PROFILES_SETTING) ?? [];
    return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
  }
  // #endregion
  initAgentsWindowReadOnlyKeys() {
    const properties = this.configurationRegistry.getConfigurationProperties();
    for (const key in properties) {
      if (properties[key].agentsWindow?.readOnly) {
        this.agentsWindowReadOnlyKeys.add(key);
      }
    }
  }
  updateAgentsWindowReadOnlyKeys(changedProperties) {
    const properties = this.configurationRegistry.getConfigurationProperties();
    for (const key of changedProperties) {
      if (properties[key]?.agentsWindow?.readOnly) {
        this.agentsWindowReadOnlyKeys.add(key);
      } else {
        this.agentsWindowReadOnlyKeys.delete(key);
      }
    }
  }
  // #region Configuration change handlers
  onDefaultConfigurationChanged(defaults, properties) {
    if (properties) {
      this.updateAgentsWindowReadOnlyKeys(properties);
    }
    const previousData = this._configuration.toData();
    const change = this._configuration.compareAndUpdateDefaultConfiguration(defaults, properties);
    this._configuration.updateLocalUserConfiguration(this.userConfiguration.reparse({ exclude: [...this.agentsWindowReadOnlyKeys] }));
    this._configuration.updateWorkspaceConfiguration(this.workspaceConfiguration.reparseWorkspaceSettings({ exclude: [...this.agentsWindowReadOnlyKeys] }));
    for (const folder of this.workspaceService.getWorkspace().folders) {
      const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
      if (folderConfiguration) {
        this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration.reparse());
      }
    }
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.DEFAULT);
  }
  onPolicyConfigurationChanged(policyConfiguration) {
    const previousData = this._configuration.toData();
    const change = this._configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.DEFAULT);
  }
  onUserConfigurationChanged(userConfiguration) {
    const previousData = this._configuration.toData();
    const change = this._configuration.compareAndUpdateLocalUserConfiguration(userConfiguration);
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.USER);
  }
  async onWorkspaceConfigurationChanged() {
    const previousData = this._configuration.toData();
    const change = await this.loadWorkspaceConfiguration();
    this.triggerConfigurationChange(change, previousData, ConfigurationTarget.WORKSPACE);
  }
  async loadWorkspaceConfiguration() {
    await this.workspaceConfiguration.reload();
    this.workspaceConfiguration.reparseWorkspaceSettings({ exclude: [...this.agentsWindowReadOnlyKeys] });
    return this._configuration.compareAndUpdateWorkspaceConfiguration(this.workspaceConfiguration.getConfiguration());
  }
  onWorkspaceFoldersChanged(e) {
    const previousData = this._configuration.toData();
    const keys = [];
    const overrides = [];
    for (const folder of e.removed) {
      const change = this._configuration.compareAndDeleteFolderConfiguration(folder.uri);
      keys.push(...change.keys);
      overrides.push(...change.overrides);
      this.cachedFolderConfigs.deleteAndDispose(folder.uri);
    }
    if (keys.length || overrides.length) {
      this.triggerConfigurationChange({ keys, overrides }, previousData, ConfigurationTarget.WORKSPACE_FOLDER);
    }
  }
  onWorkspaceFolderConfigurationChanged(folder) {
    const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
    if (folderConfiguration) {
      folderConfiguration.loadConfiguration().then((configurationModel) => {
        const previousData = this._configuration.toData();
        const change = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, configurationModel);
        this.triggerConfigurationChange(change, previousData, ConfigurationTarget.WORKSPACE_FOLDER);
      }, onUnexpectedError);
    }
  }
  async loadFolderConfigurations(folders) {
    for (const folder of folders) {
      let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
      if (!folderConfiguration) {
        folderConfiguration = new FolderConfiguration(false, folder, FOLDER_CONFIG_FOLDER_NAME, WorkbenchState.WORKSPACE, true, this.fileService, this.uriIdentityService, this.logService, { needsCaching: () => false, read: async () => "", write: async () => {
        }, remove: async () => {
        } });
        folderConfiguration.addRelated(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
        this.cachedFolderConfigs.set(folder.uri, folderConfiguration);
      }
      const configurationModel = await folderConfiguration.loadConfiguration();
      this._configuration.updateFolderConfiguration(folder.uri, configurationModel);
    }
  }
  triggerConfigurationChange(change, previousData, target) {
    if (change.keys.length) {
      const workspace = this.workspaceService.getWorkspace();
      const event = new ConfigurationChangeEvent(change, { data: previousData, workspace }, this._configuration, workspace, this.logService);
      event.source = target;
      this._onDidChangeConfiguration.fire(event);
    }
  }
  // #endregion
}
class ConfigurationEditing {
  constructor(fileService, configurationService) {
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.queue = new Queue();
  }
  write(settingsResource, path, value) {
    return this.queue.queue(() => this.doWriteConfiguration(settingsResource, path, value));
  }
  async doWriteConfiguration(settingsResource, path, value) {
    let content;
    try {
      const fileContent = await this.fileService.readFile(settingsResource);
      content = fileContent.value.toString();
    } catch (error) {
      if (error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        content = "{}";
      } else {
        throw error;
      }
    }
    const parseErrors = [];
    parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
    if (parseErrors.length > 0) {
      throw new Error("Unable to write into the settings file. Please open the file to correct errors/warnings in the file and try again.");
    }
    const edits = this.getEdits(content, path, value);
    content = applyEdits(content, edits);
    await this.fileService.writeFile(settingsResource, VSBuffer.fromString(content));
  }
  getEdits(content, path, value) {
    const { tabSize, insertSpaces, eol } = this.formattingOptions;
    if (!path.length) {
      const newContent = JSON.stringify(value, null, insertSpaces ? " ".repeat(tabSize) : "	");
      return [{
        content: newContent,
        length: content.length,
        offset: 0
      }];
    }
    return setProperty(content, path, value, { tabSize, insertSpaces, eol });
  }
  get formattingOptions() {
    if (!this._formattingOptions) {
      let eol = OS === OperatingSystem.Linux || OS === OperatingSystem.Macintosh ? "\n" : "\r\n";
      const configuredEol = this.configurationService.getValue("files.eol", { overrideIdentifier: "jsonc" });
      if (configuredEol && typeof configuredEol === "string" && configuredEol !== "auto") {
        eol = configuredEol;
      }
      this._formattingOptions = {
        eol,
        insertSpaces: !!this.configurationService.getValue("editor.insertSpaces", { overrideIdentifier: "jsonc" }),
        tabSize: this.configurationService.getValue("editor.tabSize", { overrideIdentifier: "jsonc" })
      };
    }
    return this._formattingOptions;
  }
}
export {
  ConfigurationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vYnJvd3Nlci9jb25maWd1cmF0aW9uU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMsIFF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSlNPTlBhdGgsIFBhcnNlRXJyb3IsIHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBhcHBseUVkaXRzLCBzZXRQcm9wZXJ0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FZGl0LmpzJztcbmltcG9ydCB7IEVkaXQsIEZvcm1hdHRpbmdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkZvcm1hdHRlci5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUsIGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgZGlzdGluY3QsIGVxdWFscyBhcyBhcnJheUVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBPUywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25DaGFuZ2UsIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uRGF0YSwgSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMsIElDb25maWd1cmF0aW9uVXBkYXRlT3B0aW9ucywgSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMsIElDb25maWd1cmF0aW9uVmFsdWUsIENvbmZpZ3VyYXRpb25UYXJnZXQsIGlzQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgaXNDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL2NoYXRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIENvbmZpZ3VyYXRpb25Nb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25Nb2RlbHMuanMnO1xuaW1wb3J0IHsgSVBvbGljeUNvbmZpZ3VyYXRpb24sIE51bGxQb2xpY3lDb25maWd1cmF0aW9uLCBQb2xpY3lDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgSVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIGtleUZyb21PdmVycmlkZUlkZW50aWZpZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVBvbGljeVNlcnZpY2UsIE51bGxQb2xpY3lTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcG9saWN5L2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQsIElXb3Jrc3BhY2VGb2xkZXIsIFdvcmtiZW5jaFN0YXRlLCBXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBEZWZhdWx0Q29uZmlndXJhdGlvbiwgRm9sZGVyQ29uZmlndXJhdGlvbiwgVXNlckNvbmZpZ3VyYXRpb24sIFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvbi9icm93c2VyL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQVBQTElDQVRJT05fU0NPUEVTLCBBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORywgRk9MREVSX0NPTkZJR19GT0xERVJfTkFNRSwgRk9MREVSX1NFVFRJTkdTX1BBVEgsIElDb25maWd1cmF0aW9uQ2FjaGUsIElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSwgUmVzdHJpY3RlZFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uTW9kZWxzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcblxuLy8gSW1wb3J0IHRvIHJlZ2lzdGVyIGNvbmZpZ3VyYXRpb24gY29udHJpYnV0aW9uc1xuaW1wb3J0ICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvbi9icm93c2VyL2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcblxuY2xhc3MgU2Vzc2lvbnNEZWZhdWx0Q29uZmlndXJhdGlvbiBleHRlbmRzIERlZmF1bHRDb25maWd1cmF0aW9uIHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0RGVmYXVsdFZhbHVlKF9rZXk6IHN0cmluZywgcHJvcGVydHlTY2hlbWE6IElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hKTogdW5rbm93biB7XG5cdFx0aWYgKHByb3BlcnR5U2NoZW1hLmFnZW50c1dpbmRvdyAmJiBwcm9wZXJ0eVNjaGVtYS5kZWZhdWx0VmFsdWVTb3VyY2UgIT09ICdleHBlcmltZW50cycpIHtcblx0XHRcdHJldHVybiBkZWVwQ2xvbmUocHJvcGVydHlTY2hlbWEuYWdlbnRzV2luZG93LmRlZmF1bHQpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuZ2V0RGVmYXVsdFZhbHVlKF9rZXksIHByb3BlcnR5U2NoZW1hKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2NvbmZpZ3VyYXRpb246IENvbmZpZ3VyYXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdENvbmZpZ3VyYXRpb246IERlZmF1bHRDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBvbGljeUNvbmZpZ3VyYXRpb246IElQb2xpY3lDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVzZXJDb25maWd1cmF0aW9uOiBVc2VyQ29uZmlndXJhdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb25maWd1cmF0aW9uOiBXb3Jrc3BhY2VDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlZEZvbGRlckNvbmZpZ3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxVUkksIEZvbGRlckNvbmZpZ3VyYXRpb24+KG5ldyBSZXNvdXJjZU1hcCgpKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWdlbnRzV2luZG93UmVhZE9ubHlLZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5ldmVudDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlc3RyaWN0ZWRTZXR0aW5ncyA9IEV2ZW50Lk5vbmU7XG5cdHJlYWRvbmx5IHJlc3RyaWN0ZWRTZXR0aW5nczogUmVzdHJpY3RlZFNldHRpbmdzID0geyBkZWZhdWx0OiBbXSB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNldHRpbmdzUmVzb3VyY2U6IFVSSTtcblx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uRWRpdGluZzogQ29uZmlndXJhdGlvbkVkaXRpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHBvbGljeVNlcnZpY2U6IElQb2xpY3lTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0Y29uZmlndXJhdGlvbkNhY2hlOiBJQ29uZmlndXJhdGlvbkNhY2hlLFxuXHRcdGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnNldHRpbmdzUmVzb3VyY2UgPSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2U7XG5cdFx0dGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTZXNzaW9uc0RlZmF1bHRDb25maWd1cmF0aW9uKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuaWQsIGNvbmZpZ3VyYXRpb25DYWNoZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5wb2xpY3lDb25maWd1cmF0aW9uID0gcG9saWN5U2VydmljZSBpbnN0YW5jZW9mIE51bGxQb2xpY3lTZXJ2aWNlID8gbmV3IE51bGxQb2xpY3lDb25maWd1cmF0aW9uKCkgOiB0aGlzLl9yZWdpc3RlcihuZXcgUG9saWN5Q29uZmlndXJhdGlvbih0aGlzLmRlZmF1bHRDb25maWd1cmF0aW9uLCBwb2xpY3lTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5pbml0QWdlbnRzV2luZG93UmVhZE9ubHlLZXlzKCk7XG5cdFx0dGhpcy51c2VyQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBVc2VyQ29uZmlndXJhdGlvbih1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UsIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUudGFza3NSZXNvdXJjZSwgdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZSwgeyBleGNsdWRlOiBbLi4udGhpcy5hZ2VudHNXaW5kb3dSZWFkT25seUtleXNdIH0sIGZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgV29ya3NwYWNlQ29uZmlndXJhdGlvbih7IG5lZWRzQ2FjaGluZzogKCkgPT4gZmFsc2UsIHJlYWQ6IGFzeW5jICgpID0+ICcnLCB3cml0ZTogYXN5bmMgKCkgPT4geyB9LCByZW1vdmU6IGFzeW5jICgpID0+IHsgfSB9LCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uRWRpdGluZyA9IG5ldyBDb25maWd1cmF0aW9uRWRpdGluZyhmaWxlU2VydmljZSwgdGhpcyk7XG5cblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gbmV3IENvbmZpZ3VyYXRpb24oXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbChsb2dTZXJ2aWNlKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwobG9nU2VydmljZSksXG5cdFx0XHRuZXcgUmVzb3VyY2VNYXAoKSxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKGxvZ1NlcnZpY2UpLFxuXHRcdFx0bmV3IFJlc291cmNlTWFwPENvbmZpZ3VyYXRpb25Nb2RlbD4oKSxcblx0XHRcdHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKSBhcyBXb3Jrc3BhY2UsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Vcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKHsgZGVmYXVsdHMsIHByb3BlcnRpZXMgfSkgPT4gdGhpcy5vbkRlZmF1bHRDb25maWd1cmF0aW9uQ2hhbmdlZChkZWZhdWx0cywgcHJvcGVydGllcykpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb25Nb2RlbCA9PiB0aGlzLm9uUG9saWN5Q29uZmlndXJhdGlvbkNoYW5nZWQoY29uZmlndXJhdGlvbk1vZGVsKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckNvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKHVzZXJDb25maWd1cmF0aW9uID0+IHRoaXMub25Vc2VyQ29uZmlndXJhdGlvbkNoYW5nZWQodXNlckNvbmZpZ3VyYXRpb24pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLm9uRGlkVXBkYXRlQ29uZmlndXJhdGlvbigoKSA9PiB0aGlzLm9uV29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZWQoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlU2VydmljZS5vbldpbGxDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGUgPT4gZS5qb2luKHRoaXMubG9hZEZvbGRlckNvbmZpZ3VyYXRpb25zKGUuY2hhbmdlcy5hZGRlZCkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhlID0+IHRoaXMub25Xb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlZChlKSkpO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkgYXMgV29ya3NwYWNlO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUlkZW50aWZpZXIgPSB7IGlkOiB3b3Jrc3BhY2UuaWQsIGNvbmZpZ1BhdGg6IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uISB9O1xuXHRcdGNvbnN0IFtkZWZhdWx0TW9kZWwsIHBvbGljeU1vZGVsLCB1c2VyTW9kZWxdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5pbml0aWFsaXplKCksXG5cdFx0XHR0aGlzLnBvbGljeUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSgpLFxuXHRcdFx0dGhpcy51c2VyQ29uZmlndXJhdGlvbi5pbml0aWFsaXplKCksXG5cdFx0XHR0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24uaW5pdGlhbGl6ZSh3b3Jrc3BhY2VJZGVudGlmaWVyLCB0cnVlKSxcblx0XHRdKTtcblx0XHR0aGlzLndvcmtzcGFjZUNvbmZpZ3VyYXRpb24ucmVwYXJzZVdvcmtzcGFjZVNldHRpbmdzKHsgZXhjbHVkZTogWy4uLnRoaXMuYWdlbnRzV2luZG93UmVhZE9ubHlLZXlzXSB9KTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uID0gbmV3IENvbmZpZ3VyYXRpb24oXG5cdFx0XHRkZWZhdWx0TW9kZWwsXG5cdFx0XHRwb2xpY3lNb2RlbCxcblx0XHRcdENvbmZpZ3VyYXRpb25Nb2RlbC5jcmVhdGVFbXB0eU1vZGVsKHRoaXMubG9nU2VydmljZSksXG5cdFx0XHR1c2VyTW9kZWwsXG5cdFx0XHRDb25maWd1cmF0aW9uTW9kZWwuY3JlYXRlRW1wdHlNb2RlbCh0aGlzLmxvZ1NlcnZpY2UpLFxuXHRcdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLmdldENvbmZpZ3VyYXRpb24oKSxcblx0XHRcdG5ldyBSZXNvdXJjZU1hcCgpLFxuXHRcdFx0Q29uZmlndXJhdGlvbk1vZGVsLmNyZWF0ZUVtcHR5TW9kZWwodGhpcy5sb2dTZXJ2aWNlKSxcblx0XHRcdG5ldyBSZXNvdXJjZU1hcDxDb25maWd1cmF0aW9uTW9kZWw+KCksXG5cdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Vcblx0XHQpO1xuXHRcdGF3YWl0IHRoaXMubG9hZEZvbGRlckNvbmZpZ3VyYXRpb25zKHdvcmtzcGFjZS5mb2xkZXJzKTtcblx0fVxuXG5cdC8vICNyZWdpb24gSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cblx0Z2V0Q29uZmlndXJhdGlvbkRhdGEoKTogSUNvbmZpZ3VyYXRpb25EYXRhIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKTtcblx0fVxuXG5cdGdldFZhbHVlPFQ+KCk6IFQ7XG5cdGdldFZhbHVlPFQ+KHNlY3Rpb246IHN0cmluZyk6IFQ7XG5cdGdldFZhbHVlPFQ+KG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUO1xuXHRnZXRWYWx1ZTxUPihzZWN0aW9uOiBzdHJpbmcsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMpOiBUO1xuXHRnZXRWYWx1ZShhcmcxPzogdW5rbm93biwgYXJnMj86IHVua25vd24pOiB1bmtub3duIHtcblx0XHRjb25zdCBzZWN0aW9uID0gdHlwZW9mIGFyZzEgPT09ICdzdHJpbmcnID8gYXJnMSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvdmVycmlkZXMgPSBpc0NvbmZpZ3VyYXRpb25PdmVycmlkZXMoYXJnMSkgPyBhcmcxIDogaXNDb25maWd1cmF0aW9uT3ZlcnJpZGVzKGFyZzIpID8gYXJnMiA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5nZXRWYWx1ZShzZWN0aW9uLCBvdmVycmlkZXMpO1xuXHR9XG5cblx0dXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPjtcblx0dXBkYXRlVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzIHwgSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMpOiBQcm9taXNlPHZvaWQ+O1xuXHR1cGRhdGVWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IFByb21pc2U8dm9pZD47XG5cdHVwZGF0ZVZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcyB8IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzLCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIG9wdGlvbnM/OiBJQ29uZmlndXJhdGlvblVwZGF0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRhc3luYyB1cGRhdGVWYWx1ZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIGFyZzM/OiB1bmtub3duLCBhcmc0PzogdW5rbm93biwgX29wdGlvbnM/OiBJQ29uZmlndXJhdGlvblVwZGF0ZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzIHwgdW5kZWZpbmVkID0gaXNDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzKGFyZzMpID8gYXJnM1xuXHRcdFx0OiBpc0NvbmZpZ3VyYXRpb25PdmVycmlkZXMoYXJnMykgPyB7IHJlc291cmNlOiBhcmczLnJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXJzOiBhcmczLm92ZXJyaWRlSWRlbnRpZmllciA/IFthcmczLm92ZXJyaWRlSWRlbnRpZmllcl0gOiB1bmRlZmluZWQgfSA6IHVuZGVmaW5lZDtcblx0XHRsZXQgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkID0gKG92ZXJyaWRlcyA/IGFyZzQgOiBhcmczKSBhcyBDb25maWd1cmF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQWx3YXlzIHVwZGF0ZSBjaGF0LmRpc2FibGVBSUZlYXR1cmVzIGF0IHdvcmtzcGFjZSBzY29wZSBpbiB0aGUgYWdlbnRzIHdpbmRvd1xuXHRcdGlmIChrZXkgPT09IENoYXRBSURpc2FibGVkU2V0dGluZ0lkKSB7XG5cdFx0XHR0YXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRzOiBDb25maWd1cmF0aW9uVGFyZ2V0W10gPSB0YXJnZXQgPyBbdGFyZ2V0XSA6IFtdO1xuXG5cdFx0aWYgKG92ZXJyaWRlcz8ub3ZlcnJpZGVJZGVudGlmaWVycykge1xuXHRcdFx0b3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMgPSBkaXN0aW5jdChvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycyk7XG5cdFx0XHRvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycyA9IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzLmxlbmd0aCA/IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3BlY3QgPSB0aGlzLmluc3BlY3Qoa2V5LCB7IHJlc291cmNlOiBvdmVycmlkZXM/LnJlc291cmNlLCBvdmVycmlkZUlkZW50aWZpZXI6IG92ZXJyaWRlcz8ub3ZlcnJpZGVJZGVudGlmaWVycyA/IG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzWzBdIDogdW5kZWZpbmVkIH0pO1xuXHRcdGlmIChpbnNwZWN0LnBvbGljeVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHdyaXRlICR7a2V5fSBiZWNhdXNlIGl0IGlzIGNvbmZpZ3VyZWQgaW4gc3lzdGVtIHBvbGljeS5gKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hZ2VudHNXaW5kb3dSZWFkT25seUtleXMuaGFzKGtleSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIHdyaXRlICR7a2V5fSBiZWNhdXNlIGl0IGlzIHJlYWQtb25seSBpbiB0aGUgQWdlbnRzIHdpbmRvdy5gKTtcblx0XHR9XG5cblx0XHRpZiAoIXRhcmdldHMubGVuZ3RoKSB7XG5cdFx0XHR0YXJnZXRzLnB1c2goLi4udGhpcy5kZXJpdmVDb25maWd1cmF0aW9uVGFyZ2V0cyhrZXksIHZhbHVlLCBpbnNwZWN0KSk7XG5cblx0XHRcdC8vIFJlbW92ZSB0aGUgc2V0dGluZywgaWYgdGhlIHZhbHVlIGlzIHNhbWUgYXMgZGVmYXVsdCB2YWx1ZSBhbmQgaXMgdXBkYXRlZCBvbmx5IGluIHVzZXIgdGFyZ2V0XG5cdFx0XHRpZiAoZXF1YWxzKHZhbHVlLCBpbnNwZWN0LmRlZmF1bHRWYWx1ZSkgJiYgdGFyZ2V0cy5sZW5ndGggPT09IDEgJiYgdGFyZ2V0c1swXSA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKSB7XG5cdFx0XHRcdHZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvdmVycmlkZXM/Lm92ZXJyaWRlSWRlbnRpZmllcnM/Lmxlbmd0aCAmJiBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBvdmVycmlkZUlkZW50aWZpZXJzID0gb3ZlcnJpZGVzLm92ZXJyaWRlSWRlbnRpZmllcnMuc29ydCgpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdPdmVycmlkZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uLmxvY2FsVXNlckNvbmZpZ3VyYXRpb24ub3ZlcnJpZGVzLmZpbmQob3ZlcnJpZGUgPT4gYXJyYXlFcXVhbHMoWy4uLm92ZXJyaWRlLmlkZW50aWZpZXJzXS5zb3J0KCksIG92ZXJyaWRlSWRlbnRpZmllcnMpKTtcblx0XHRcdGlmIChleGlzdGluZ092ZXJyaWRlcykge1xuXHRcdFx0XHRvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycyA9IGV4aXN0aW5nT3ZlcnJpZGVzLmlkZW50aWZpZXJzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQodGFyZ2V0cy5tYXAodCA9PiB0aGlzLndyaXRlQ29uZmlndXJhdGlvblZhbHVlKGtleSwgdmFsdWUsIHQsIG92ZXJyaWRlcykpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd3JpdGVDb25maWd1cmF0aW9uVmFsdWUoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgcGF0aCA9IG92ZXJyaWRlcz8ub3ZlcnJpZGVJZGVudGlmaWVycz8ubGVuZ3RoID8gW2tleUZyb21PdmVycmlkZUlkZW50aWZpZXJzKG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzKSwga2V5XSA6IFtrZXldO1xuXG5cdFx0Y29uc3Qgc2V0dGluZ3NSZXNvdXJjZSA9IHRoaXMuZ2V0U2V0dGluZ3NSZXNvdXJjZSh0YXJnZXQsIG92ZXJyaWRlcz8ucmVzb3VyY2UgPz8gdW5kZWZpbmVkKTtcblxuXHRcdC8vIFdoZW4gd3JpdGluZyB0byB0aGUgd29ya3NwYWNlIGNvbmZpZ3VyYXRpb24gZmlsZSwgc2V0dGluZ3MgZ28gdW5kZXIgdGhlIFwic2V0dGluZ3NcIiBrZXlcblx0XHRpZiAodGhpcy5pc1dvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZXNvdXJjZShzZXR0aW5nc1Jlc291cmNlKSkge1xuXHRcdFx0cGF0aCA9IFsnc2V0dGluZ3MnLCAuLi5wYXRoXTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25FZGl0aW5nLndyaXRlKHNldHRpbmdzUmVzb3VyY2UsIHBhdGgsIHZhbHVlKTtcblx0XHRhd2FpdCB0aGlzLnJlbG9hZENvbmZpZ3VyYXRpb24oKTtcblx0fVxuXG5cdHByaXZhdGUgZGVyaXZlQ29uZmlndXJhdGlvblRhcmdldHMoX2tleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93biwgaW5zcGVjdDogSUNvbmZpZ3VyYXRpb25WYWx1ZTx1bmtub3duPik6IENvbmZpZ3VyYXRpb25UYXJnZXRbXSB7XG5cdFx0aWYgKGVxdWFscyh2YWx1ZSwgaW5zcGVjdC52YWx1ZSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZpbmVkVGFyZ2V0czogQ29uZmlndXJhdGlvblRhcmdldFtdID0gW107XG5cdFx0aWYgKGluc3BlY3Qud29ya3NwYWNlRm9sZGVyVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVmaW5lZFRhcmdldHMucHVzaChDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpO1xuXHRcdH1cblx0XHRpZiAoaW5zcGVjdC53b3Jrc3BhY2VWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkZWZpbmVkVGFyZ2V0cy5wdXNoKENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHR9XG5cdFx0aWYgKGluc3BlY3QudXNlclZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlZmluZWRUYXJnZXRzLnB1c2goQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHR9XG5cblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gUmVtb3ZlIHRoZSBzZXR0aW5nIGluIGFsbCBkZWZpbmVkIHRhcmdldHNcblx0XHRcdHJldHVybiBkZWZpbmVkVGFyZ2V0cztcblx0XHR9XG5cblx0XHRyZXR1cm4gW2RlZmluZWRUYXJnZXRzWzBdIHx8IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl07XG5cdH1cblxuXHRwcml2YXRlIGlzV29ya3NwYWNlQ29uZmlndXJhdGlvblJlc291cmNlKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0cmV0dXJuICEhKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uLCByZXNvdXJjZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXR0aW5nc1Jlc291cmNlKHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCB8IHVuZGVmaW5lZCwgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IFVSSSB7XG5cdFx0aWYgKHRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKSB7XG5cdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGZvbGRlci51cmksIEZPTERFUl9TRVRUSU5HU19QQVRIKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuc2V0dGluZ3NSZXNvdXJjZTtcblx0fVxuXG5cdGluc3BlY3Q8VD4oa2V5OiBzdHJpbmcsIG92ZXJyaWRlcz86IElDb25maWd1cmF0aW9uT3ZlcnJpZGVzKTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uaW5zcGVjdDxUPihrZXksIG92ZXJyaWRlcyk7XG5cdH1cblxuXHRrZXlzKCk6IHsgZGVmYXVsdDogc3RyaW5nW107IHBvbGljeTogc3RyaW5nW107IHVzZXI6IHN0cmluZ1tdOyB3b3Jrc3BhY2U6IHN0cmluZ1tdOyB3b3Jrc3BhY2VGb2xkZXI6IHN0cmluZ1tdIH0ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmtleXMoKTtcblx0fVxuXG5cdGFzeW5jIHJlbG9hZENvbmZpZ3VyYXRpb24oX3RhcmdldD86IENvbmZpZ3VyYXRpb25UYXJnZXQgfCBJV29ya3NwYWNlRm9sZGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZWxvYWREZWZhdWx0Q29uZmlndXJhdGlvbigpO1xuXHRcdGlmIChfdGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB1c2VyTW9kZWwgPSBhd2FpdCB0aGlzLnVzZXJDb25maWd1cmF0aW9uLmluaXRpYWxpemUoKTtcblx0XHRjb25zdCBwcmV2aW91c0RhdGEgPSB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpO1xuXHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZUxvY2FsVXNlckNvbmZpZ3VyYXRpb24odXNlck1vZGVsKTtcblxuXHRcdC8vIFJlbG9hZCB3b3Jrc3BhY2UgY29uZmlndXJhdGlvblxuXHRcdGNvbnN0IHdvcmtzcGFjZUNoYW5nZSA9IGF3YWl0IHRoaXMubG9hZFdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oKTtcblx0XHRjaGFuZ2Uua2V5cy5wdXNoKC4uLndvcmtzcGFjZUNoYW5nZS5rZXlzKTtcblx0XHRjaGFuZ2Uub3ZlcnJpZGVzLnB1c2goLi4ud29ya3NwYWNlQ2hhbmdlLm92ZXJyaWRlcyk7XG5cblx0XHQvLyBSZWxvYWQgZm9sZGVyIGNvbmZpZ3VyYXRpb25zXG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdGNvbnN0IGZvbGRlckNvbmZpZ3VyYXRpb24gPSB0aGlzLmNhY2hlZEZvbGRlckNvbmZpZ3MuZ2V0KGZvbGRlci51cmkpO1xuXHRcdFx0aWYgKGZvbGRlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0Y29uc3QgZm9sZGVyTW9kZWwgPSBhd2FpdCBmb2xkZXJDb25maWd1cmF0aW9uLmxvYWRDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IGZvbGRlckNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZUZvbGRlckNvbmZpZ3VyYXRpb24oZm9sZGVyLnVyaSwgZm9sZGVyTW9kZWwpO1xuXHRcdFx0XHRjaGFuZ2Uua2V5cy5wdXNoKC4uLmZvbGRlckNoYW5nZS5rZXlzKTtcblx0XHRcdFx0Y2hhbmdlLm92ZXJyaWRlcy5wdXNoKC4uLmZvbGRlckNoYW5nZS5vdmVycmlkZXMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91c0RhdGEsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIHJlbG9hZERlZmF1bHRDb25maWd1cmF0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMub25EZWZhdWx0Q29uZmlndXJhdGlvbkNoYW5nZWQodGhpcy5kZWZhdWx0Q29uZmlndXJhdGlvbi5yZWxvYWQoKSk7XG5cdH1cblxuXHRoYXNDYWNoZWRDb25maWd1cmF0aW9uRGVmYXVsdHNPdmVycmlkZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdENvbmZpZ3VyYXRpb24uaGFzQ2FjaGVkQ29uZmlndXJhdGlvbkRlZmF1bHRzT3ZlcnJpZGVzKCk7XG5cdH1cblxuXHRhc3luYyB3aGVuUmVtb3RlQ29uZmlndXJhdGlvbkxvYWRlZCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGlzU2V0dGluZ0FwcGxpZWRGb3JBbGxQcm9maWxlcyhrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNjb3BlID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVtrZXldPy5zY29wZTtcblx0XHRpZiAoc2NvcGUgJiYgQVBQTElDQVRJT05fU0NPUEVTLmluY2x1ZGVzKHNjb3BlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGFsbFByb2ZpbGVzU2V0dGluZ3MgPSB0aGlzLmdldFZhbHVlPHN0cmluZ1tdPihBUFBMWV9BTExfUFJPRklMRVNfU0VUVElORykgPz8gW107XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkoYWxsUHJvZmlsZXNTZXR0aW5ncykgJiYgYWxsUHJvZmlsZXNTZXR0aW5ncy5pbmNsdWRlcyhrZXkpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgaW5pdEFnZW50c1dpbmRvd1JlYWRPbmx5S2V5cygpOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzID0gdGhpcy5jb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRpZiAocHJvcGVydGllc1trZXldLmFnZW50c1dpbmRvdz8ucmVhZE9ubHkpIHtcblx0XHRcdFx0dGhpcy5hZ2VudHNXaW5kb3dSZWFkT25seUtleXMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBZ2VudHNXaW5kb3dSZWFkT25seUtleXMoY2hhbmdlZFByb3BlcnRpZXM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvcGVydGllcyA9IHRoaXMuY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgY2hhbmdlZFByb3BlcnRpZXMpIHtcblx0XHRcdGlmIChwcm9wZXJ0aWVzW2tleV0/LmFnZW50c1dpbmRvdz8ucmVhZE9ubHkpIHtcblx0XHRcdFx0dGhpcy5hZ2VudHNXaW5kb3dSZWFkT25seUtleXMuYWRkKGtleSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFnZW50c1dpbmRvd1JlYWRPbmx5S2V5cy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAjcmVnaW9uIENvbmZpZ3VyYXRpb24gY2hhbmdlIGhhbmRsZXJzXG5cblx0cHJpdmF0ZSBvbkRlZmF1bHRDb25maWd1cmF0aW9uQ2hhbmdlZChkZWZhdWx0czogQ29uZmlndXJhdGlvbk1vZGVsLCBwcm9wZXJ0aWVzPzogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRpZiAocHJvcGVydGllcykge1xuXHRcdFx0dGhpcy51cGRhdGVBZ2VudHNXaW5kb3dSZWFkT25seUtleXMocHJvcGVydGllcyk7XG5cdFx0fVxuXHRcdGNvbnN0IHByZXZpb3VzRGF0YSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCk7XG5cdFx0Y29uc3QgY2hhbmdlID0gdGhpcy5fY29uZmlndXJhdGlvbi5jb21wYXJlQW5kVXBkYXRlRGVmYXVsdENvbmZpZ3VyYXRpb24oZGVmYXVsdHMsIHByb3BlcnRpZXMpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlTG9jYWxVc2VyQ29uZmlndXJhdGlvbih0aGlzLnVzZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoeyBleGNsdWRlOiBbLi4udGhpcy5hZ2VudHNXaW5kb3dSZWFkT25seUtleXNdIH0pKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24odGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLnJlcGFyc2VXb3Jrc3BhY2VTZXR0aW5ncyh7IGV4Y2x1ZGU6IFsuLi50aGlzLmFnZW50c1dpbmRvd1JlYWRPbmx5S2V5c10gfSkpO1xuXHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHRjb25zdCBmb2xkZXJDb25maWd1cmF0aW9uID0gdGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmdldChmb2xkZXIudXJpKTtcblx0XHRcdGlmIChmb2xkZXJDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlRm9sZGVyQ29uZmlndXJhdGlvbihmb2xkZXIudXJpLCBmb2xkZXJDb25maWd1cmF0aW9uLnJlcGFyc2UoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91c0RhdGEsIENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCk7XG5cdH1cblxuXHRwcml2YXRlIG9uUG9saWN5Q29uZmlndXJhdGlvbkNoYW5nZWQocG9saWN5Q29uZmlndXJhdGlvbjogQ29uZmlndXJhdGlvbk1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNEYXRhID0gdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKTtcblx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmRVcGRhdGVQb2xpY3lDb25maWd1cmF0aW9uKHBvbGljeUNvbmZpZ3VyYXRpb24pO1xuXHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91c0RhdGEsIENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCk7XG5cdH1cblxuXHRwcml2YXRlIG9uVXNlckNvbmZpZ3VyYXRpb25DaGFuZ2VkKHVzZXJDb25maWd1cmF0aW9uOiBDb25maWd1cmF0aW9uTW9kZWwpOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c0RhdGEgPSB0aGlzLl9jb25maWd1cmF0aW9uLnRvRGF0YSgpO1xuXHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZUxvY2FsVXNlckNvbmZpZ3VyYXRpb24odXNlckNvbmZpZ3VyYXRpb24pO1xuXHRcdHRoaXMudHJpZ2dlckNvbmZpZ3VyYXRpb25DaGFuZ2UoY2hhbmdlLCBwcmV2aW91c0RhdGEsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uV29ya3NwYWNlQ29uZmlndXJhdGlvbkNoYW5nZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJldmlvdXNEYXRhID0gdGhpcy5fY29uZmlndXJhdGlvbi50b0RhdGEoKTtcblx0XHRjb25zdCBjaGFuZ2UgPSBhd2FpdCB0aGlzLmxvYWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uKCk7XG5cdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHByZXZpb3VzRGF0YSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkV29ya3NwYWNlQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPElDb25maWd1cmF0aW9uQ2hhbmdlPiB7XG5cdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uLnJlbG9hZCgpO1xuXHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5yZXBhcnNlV29ya3NwYWNlU2V0dGluZ3MoeyBleGNsdWRlOiBbLi4udGhpcy5hZ2VudHNXaW5kb3dSZWFkT25seUtleXNdIH0pO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmRVcGRhdGVXb3Jrc3BhY2VDb25maWd1cmF0aW9uKHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvbi5nZXRDb25maWd1cmF0aW9uKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbldvcmtzcGFjZUZvbGRlcnNDaGFuZ2VkKGU6IElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBSZW1vdmUgY29uZmlndXJhdGlvbnMgZm9yIHJlbW92ZWQgZm9sZGVyc1xuXHRcdGNvbnN0IHByZXZpb3VzRGF0YSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCk7XG5cdFx0Y29uc3Qga2V5czogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBvdmVycmlkZXM6IFtzdHJpbmcsIHN0cmluZ1tdXVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2UgPSB0aGlzLl9jb25maWd1cmF0aW9uLmNvbXBhcmVBbmREZWxldGVGb2xkZXJDb25maWd1cmF0aW9uKGZvbGRlci51cmkpO1xuXHRcdFx0a2V5cy5wdXNoKC4uLmNoYW5nZS5rZXlzKTtcblx0XHRcdG92ZXJyaWRlcy5wdXNoKC4uLmNoYW5nZS5vdmVycmlkZXMpO1xuXHRcdFx0dGhpcy5jYWNoZWRGb2xkZXJDb25maWdzLmRlbGV0ZUFuZERpc3Bvc2UoZm9sZGVyLnVyaSk7XG5cdFx0fVxuXHRcdGlmIChrZXlzLmxlbmd0aCB8fCBvdmVycmlkZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKHsga2V5cywgb3ZlcnJpZGVzIH0sIHByZXZpb3VzRGF0YSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbkNoYW5nZWQoZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5nZXQoZm9sZGVyLnVyaSk7XG5cdFx0aWYgKGZvbGRlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdGZvbGRlckNvbmZpZ3VyYXRpb24ubG9hZENvbmZpZ3VyYXRpb24oKS50aGVuKGNvbmZpZ3VyYXRpb25Nb2RlbCA9PiB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzRGF0YSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24udG9EYXRhKCk7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb24uY29tcGFyZUFuZFVwZGF0ZUZvbGRlckNvbmZpZ3VyYXRpb24oZm9sZGVyLnVyaSwgY29uZmlndXJhdGlvbk1vZGVsKTtcblx0XHRcdFx0dGhpcy50cmlnZ2VyQ29uZmlndXJhdGlvbkNoYW5nZShjaGFuZ2UsIHByZXZpb3VzRGF0YSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKTtcblx0XHRcdH0sIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvYWRGb2xkZXJDb25maWd1cmF0aW9ucyhmb2xkZXJzOiByZWFkb25seSBJV29ya3NwYWNlRm9sZGVyW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBmb2xkZXJzKSB7XG5cdFx0XHRsZXQgZm9sZGVyQ29uZmlndXJhdGlvbiA9IHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5nZXQoZm9sZGVyLnVyaSk7XG5cdFx0XHRpZiAoIWZvbGRlckNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0Zm9sZGVyQ29uZmlndXJhdGlvbiA9IG5ldyBGb2xkZXJDb25maWd1cmF0aW9uKGZhbHNlLCBmb2xkZXIsIEZPTERFUl9DT05GSUdfRk9MREVSX05BTUUsIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSwgdHJ1ZSwgdGhpcy5maWxlU2VydmljZSwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgeyBuZWVkc0NhY2hpbmc6ICgpID0+IGZhbHNlLCByZWFkOiBhc3luYyAoKSA9PiAnJywgd3JpdGU6IGFzeW5jICgpID0+IHsgfSwgcmVtb3ZlOiBhc3luYyAoKSA9PiB7IH0gfSk7XG5cdFx0XHRcdGZvbGRlckNvbmZpZ3VyYXRpb24uYWRkUmVsYXRlZChmb2xkZXJDb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMub25Xb3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uQ2hhbmdlZChmb2xkZXIpKSk7XG5cdFx0XHRcdHRoaXMuY2FjaGVkRm9sZGVyQ29uZmlncy5zZXQoZm9sZGVyLnVyaSwgZm9sZGVyQ29uZmlndXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uTW9kZWwgPSBhd2FpdCBmb2xkZXJDb25maWd1cmF0aW9uLmxvYWRDb25maWd1cmF0aW9uKCk7XG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnVwZGF0ZUZvbGRlckNvbmZpZ3VyYXRpb24oZm9sZGVyLnVyaSwgY29uZmlndXJhdGlvbk1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRyaWdnZXJDb25maWd1cmF0aW9uQ2hhbmdlKGNoYW5nZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2UsIHByZXZpb3VzRGF0YTogSUNvbmZpZ3VyYXRpb25EYXRhLCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpOiB2b2lkIHtcblx0XHRpZiAoY2hhbmdlLmtleXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkgYXMgV29ya3NwYWNlO1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KGNoYW5nZSwgeyBkYXRhOiBwcmV2aW91c0RhdGEsIHdvcmtzcGFjZSB9LCB0aGlzLl9jb25maWd1cmF0aW9uLCB3b3Jrc3BhY2UsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRldmVudC5zb3VyY2UgPSB0YXJnZXQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZmlyZShldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxufVxuXG5jbGFzcyBDb25maWd1cmF0aW9uRWRpdGluZyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBxdWV1ZSA9IG5ldyBRdWV1ZTx2b2lkPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHR3cml0ZShzZXR0aW5nc1Jlc291cmNlOiBVUkksIHBhdGg6IEpTT05QYXRoLCB2YWx1ZTogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnF1ZXVlLnF1ZXVlKCgpID0+IHRoaXMuZG9Xcml0ZUNvbmZpZ3VyYXRpb24oc2V0dGluZ3NSZXNvdXJjZSwgcGF0aCwgdmFsdWUpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Xcml0ZUNvbmZpZ3VyYXRpb24oc2V0dGluZ3NSZXNvdXJjZTogVVJJLCBwYXRoOiBKU09OUGF0aCwgdmFsdWU6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgY29udGVudDogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoc2V0dGluZ3NSZXNvdXJjZSk7XG5cdFx0XHRjb250ZW50ID0gZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKChlcnJvciBhcyBGaWxlT3BlcmF0aW9uRXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0Y29udGVudCA9ICd7fSc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZUVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdFx0cGFyc2UoY29udGVudCwgcGFyc2VFcnJvcnMsIHsgYWxsb3dUcmFpbGluZ0NvbW1hOiB0cnVlLCBhbGxvd0VtcHR5Q29udGVudDogdHJ1ZSB9KTtcblx0XHRpZiAocGFyc2VFcnJvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmFibGUgdG8gd3JpdGUgaW50byB0aGUgc2V0dGluZ3MgZmlsZS4gUGxlYXNlIG9wZW4gdGhlIGZpbGUgdG8gY29ycmVjdCBlcnJvcnMvd2FybmluZ3MgaW4gdGhlIGZpbGUgYW5kIHRyeSBhZ2Fpbi4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0cyA9IHRoaXMuZ2V0RWRpdHMoY29udGVudCwgcGF0aCwgdmFsdWUpO1xuXHRcdGNvbnRlbnQgPSBhcHBseUVkaXRzKGNvbnRlbnQsIGVkaXRzKTtcblxuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNldHRpbmdzUmVzb3VyY2UsIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0cyhjb250ZW50OiBzdHJpbmcsIHBhdGg6IEpTT05QYXRoLCB2YWx1ZTogdW5rbm93bik6IEVkaXRbXSB7XG5cdFx0Y29uc3QgeyB0YWJTaXplLCBpbnNlcnRTcGFjZXMsIGVvbCB9ID0gdGhpcy5mb3JtYXR0aW5nT3B0aW9ucztcblxuXHRcdGlmICghcGF0aC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5ld0NvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgbnVsbCwgaW5zZXJ0U3BhY2VzID8gJyAnLnJlcGVhdCh0YWJTaXplKSA6ICdcXHQnKTtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRjb250ZW50OiBuZXdDb250ZW50LFxuXHRcdFx0XHRsZW5ndGg6IGNvbnRlbnQubGVuZ3RoLFxuXHRcdFx0XHRvZmZzZXQ6IDBcblx0XHRcdH1dO1xuXHRcdH1cblxuXHRcdHJldHVybiBzZXRQcm9wZXJ0eShjb250ZW50LCBwYXRoLCB2YWx1ZSwgeyB0YWJTaXplLCBpbnNlcnRTcGFjZXMsIGVvbCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2Zvcm1hdHRpbmdPcHRpb25zOiBSZXF1aXJlZDxGb3JtYXR0aW5nT3B0aW9ucz4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IGZvcm1hdHRpbmdPcHRpb25zKCk6IFJlcXVpcmVkPEZvcm1hdHRpbmdPcHRpb25zPiB7XG5cdFx0aWYgKCF0aGlzLl9mb3JtYXR0aW5nT3B0aW9ucykge1xuXHRcdFx0bGV0IGVvbCA9IE9TID09PSBPcGVyYXRpbmdTeXN0ZW0uTGludXggfHwgT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggPyAnXFxuJyA6ICdcXHJcXG4nO1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZEVvbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignZmlsZXMuZW9sJywgeyBvdmVycmlkZUlkZW50aWZpZXI6ICdqc29uYycgfSk7XG5cdFx0XHRpZiAoY29uZmlndXJlZEVvbCAmJiB0eXBlb2YgY29uZmlndXJlZEVvbCA9PT0gJ3N0cmluZycgJiYgY29uZmlndXJlZEVvbCAhPT0gJ2F1dG8nKSB7XG5cdFx0XHRcdGVvbCA9IGNvbmZpZ3VyZWRFb2w7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9mb3JtYXR0aW5nT3B0aW9ucyA9IHtcblx0XHRcdFx0ZW9sLFxuXHRcdFx0XHRpbnNlcnRTcGFjZXM6ICEhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmluc2VydFNwYWNlcycsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiAnanNvbmMnIH0pLFxuXHRcdFx0XHR0YWJTaXplOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IudGFiU2l6ZScsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiAnanNvbmMnIH0pXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZm9ybWF0dGluZ09wdGlvbnM7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSxxQkFBcUI7QUFDMUMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxVQUFVLGFBQWE7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBK0IsYUFBYTtBQUM1QyxTQUFTLFlBQVksbUJBQW1CO0FBRXhDLFNBQVMsV0FBVyxjQUFjO0FBQ2xDLFNBQVMsVUFBVSxVQUFVLG1CQUFtQjtBQUNoRCxTQUFTLElBQUksdUJBQXVCO0FBQ3BDLFNBQXdMLHFCQUFxQiwwQkFBMEIsc0NBQXNDO0FBQzdRLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCLDBCQUEwQjtBQUM3RCxT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
