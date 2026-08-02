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
import { distinct } from "../../../../base/common/arrays.js";
import { sequence } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import * as json from "../../../../base/common/json.js";
import { DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import * as resources from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI as uri } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { OS } from "../../../../base/common/platform.js";
import { launchSchemaId } from "../../../services/configuration/common/configuration.js";
import { ACTIVE_GROUP, IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { CONTEXT_DEBUG_CONFIGURATION_TYPE, DebugConfigurationProviderTriggerKind, isDebugConfig } from "../common/debug.js";
import { launchSchema } from "../common/debugSchemas.js";
import { getEffectiveConfigForPlatform, getVisibleAndSorted } from "../common/debugUtils.js";
import { debugConfigure } from "./debugIcons.js";
const jsonRegistry = Registry.as(JSONExtensions.JSONContribution);
jsonRegistry.registerSchema(launchSchemaId, launchSchema);
const DEBUG_SELECTED_CONFIG_NAME_KEY = "debug.selectedconfigname";
const DEBUG_SELECTED_ROOT = "debug.selectedroot";
const DEBUG_SELECTED_TYPE = "debug.selectedtype";
const DEBUG_RECENT_DYNAMIC_CONFIGURATIONS = "debug.recentdynamicconfigurations";
const ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME = "onDebugDynamicConfigurations";
let ConfigurationManager = class {
  constructor(adapterManager, contextService, configurationService, quickInputService, instantiationService, storageService, extensionService, historyService, uriIdentityService, remoteAgentService, contextKeyService, logService) {
    this.adapterManager = adapterManager;
    this.contextService = contextService;
    this.configurationService = configurationService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.historyService = historyService;
    this.uriIdentityService = uriIdentityService;
    this.remoteAgentService = remoteAgentService;
    this.logService = logService;
    this.getSelectedConfig = () => Promise.resolve(void 0);
    this.selectedDynamic = false;
    this._onDidSelectConfigurationName = new Emitter();
    this._onDidChangeConfigurationProviders = new Emitter();
    this.onDidChangeConfigurationProviders = this._onDidChangeConfigurationProviders.event;
    this.targetOperatingSystem = OS;
    this.configProviders = [];
    this.toDispose = [this._onDidChangeConfigurationProviders, this._onDidSelectConfigurationName];
    this.initLaunches();
    this.setCompoundSchemaValues();
    this.registerListeners();
    const previousSelectedRoot = this.storageService.get(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
    const previousSelectedType = this.storageService.get(DEBUG_SELECTED_TYPE, StorageScope.WORKSPACE);
    const previousSelectedLaunch = this.launches.find((l) => l.uri.toString() === previousSelectedRoot);
    const previousSelectedName = this.storageService.get(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE);
    this.debugConfigurationTypeContext = CONTEXT_DEBUG_CONFIGURATION_TYPE.bindTo(contextKeyService);
    const dynamicConfig = previousSelectedType ? { type: previousSelectedType } : void 0;
    if (previousSelectedLaunch && previousSelectedLaunch.getConfigurationNames().length) {
      this.selectConfiguration(previousSelectedLaunch, previousSelectedName, void 0, dynamicConfig);
    } else if (this.launches.length > 0) {
      this.selectConfiguration(void 0, previousSelectedName, void 0, dynamicConfig);
    }
    this.resolveTargetOperatingSystem();
  }
  resolveTargetOperatingSystem() {
    this.remoteAgentService.getEnvironment().then((environment) => {
      const targetOperatingSystem = environment?.os ?? OS;
      if (this.targetOperatingSystem !== targetOperatingSystem) {
        this.targetOperatingSystem = targetOperatingSystem;
        this._onDidSelectConfigurationName.fire();
      }
    }, () => {
    });
  }
  getTargetOperatingSystem() {
    return this.targetOperatingSystem;
  }
  registerDebugConfigurationProvider(debugConfigurationProvider) {
    this.configProviders.push(debugConfigurationProvider);
    this._onDidChangeConfigurationProviders.fire();
    return {
      dispose: () => {
        this.unregisterDebugConfigurationProvider(debugConfigurationProvider);
        this._onDidChangeConfigurationProviders.fire();
      }
    };
  }
  unregisterDebugConfigurationProvider(debugConfigurationProvider) {
    const ix = this.configProviders.indexOf(debugConfigurationProvider);
    if (ix >= 0) {
      this.configProviders.splice(ix, 1);
    }
  }
  /**
   * if scope is not specified,a value of DebugConfigurationProvideTrigger.Initial is assumed.
   */
  hasDebugConfigurationProvider(debugType, triggerKind) {
    if (triggerKind === void 0) {
      triggerKind = DebugConfigurationProviderTriggerKind.Initial;
    }
    const provider = this.configProviders.find((p) => p.provideDebugConfigurations && p.type === debugType && p.triggerKind === triggerKind);
    return !!provider;
  }
  async resolveConfigurationByProviders(folderUri, type, config, token) {
    const resolveDebugConfigurationForType = async (type2, config2) => {
      if (type2 !== "*") {
        await this.adapterManager.activateDebuggers("onDebugResolve", type2);
      }
      for (const p of this.configProviders) {
        if (p.type === type2 && p.resolveDebugConfiguration && config2) {
          config2 = await p.resolveDebugConfiguration(folderUri, config2, token);
        }
      }
      return config2;
    };
    let resolvedType = config.type ?? type;
    let result = config;
    for (let seen = /* @__PURE__ */ new Set(); result && !seen.has(resolvedType); ) {
      seen.add(resolvedType);
      result = await resolveDebugConfigurationForType(resolvedType, result);
      result = await resolveDebugConfigurationForType("*", result);
      resolvedType = result?.type ?? type;
    }
    return result;
  }
  async resolveDebugConfigurationWithSubstitutedVariables(folderUri, type, config, token) {
    const providers = this.configProviders.filter((p) => p.type === type && p.resolveDebugConfigurationWithSubstitutedVariables).concat(this.configProviders.filter((p) => p.type === "*" && p.resolveDebugConfigurationWithSubstitutedVariables));
    let result = config;
    await sequence(providers.map((provider) => async () => {
      if (result) {
        result = await provider.resolveDebugConfigurationWithSubstitutedVariables(folderUri, result, token);
      }
    }));
    return result;
  }
  async provideDebugConfigurations(folderUri, type, token) {
    await this.adapterManager.activateDebuggers("onDebugInitialConfigurations");
    const results = await Promise.all(this.configProviders.filter((p) => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Initial && p.provideDebugConfigurations).map((p) => p.provideDebugConfigurations(folderUri, token)));
    return results.reduce((first, second) => first.concat(second), []);
  }
  async getDynamicProviders() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const debugDynamicExtensionsTypes = this.extensionService.extensions.reduce((acc, e) => {
      if (!e.activationEvents) {
        return acc;
      }
      const explicitTypes = [];
      let hasGenericEvent = false;
      for (const event of e.activationEvents) {
        if (event === ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME) {
          hasGenericEvent = true;
        } else if (event.startsWith(`${ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME}:`)) {
          explicitTypes.push(event.slice(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME.length + 1));
        }
      }
      if (explicitTypes.length) {
        explicitTypes.forEach((t) => acc.add(t));
      } else if (hasGenericEvent) {
        const debuggerType = e.contributes?.debuggers?.[0].type;
        if (debuggerType) {
          acc.add(debuggerType);
        }
      }
      return acc;
    }, /* @__PURE__ */ new Set());
    for (const configProvider of this.configProviders) {
      if (configProvider.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic) {
        debugDynamicExtensionsTypes.add(configProvider.type);
      }
    }
    return [...debugDynamicExtensionsTypes].map((type) => {
      return {
        label: this.adapterManager.getDebuggerLabel(type),
        getProvider: async () => {
          await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
          return this.configProviders.find((p) => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic && p.provideDebugConfigurations);
        },
        type,
        pick: async () => {
          await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
          const disposables = new DisposableStore();
          const token = new CancellationTokenSource();
          disposables.add(token);
          const input = disposables.add(this.quickInputService.createQuickPick());
          input.busy = true;
          input.placeholder = nls.localize("selectConfiguration", "Select Launch Configuration");
          const chosenPromise = new Promise((resolve) => {
            disposables.add(input.onDidAccept(() => resolve(input.activeItems[0])));
            disposables.add(input.onDidTriggerItemButton(async (context) => {
              resolve(void 0);
              const { launch, config } = context.item;
              await launch.openConfigFile({ preserveFocus: false, type: config.type, suppressInitialConfigs: true });
              await launch.writeConfiguration(config);
              await this.selectConfiguration(launch, config.name);
              this.removeRecentDynamicConfigurations(config.name, config.type);
            }));
            disposables.add(input.onDidHide(() => resolve(void 0)));
          }).finally(() => token.cancel());
          let items;
          try {
            items = await this.getDynamicConfigurationsByType(type, token.token);
          } catch (err) {
            this.logService.error(err);
            disposables.dispose();
            return;
          }
          input.items = items;
          input.busy = false;
          input.show();
          const chosen = await chosenPromise;
          disposables.dispose();
          return chosen;
        }
      };
    });
  }
  async getDynamicConfigurationsByType(type, token = CancellationToken.None) {
    await this.adapterManager.activateDebuggers(ON_DEBUG_DYNAMIC_CONFIGURATIONS_NAME, type);
    const picks = [];
    const provider = this.configProviders.find((p) => p.type === type && p.triggerKind === DebugConfigurationProviderTriggerKind.Dynamic && p.provideDebugConfigurations);
    this.getLaunches().forEach((launch) => {
      if (provider) {
        picks.push(provider.provideDebugConfigurations(launch.workspace?.uri, token).then((configurations) => configurations.map((config) => ({
          label: config.name,
          description: launch.name,
          config,
          buttons: [{
            iconClass: ThemeIcon.asClassName(debugConfigure),
            tooltip: nls.localize("editLaunchConfig", "Edit Debug Configuration in launch.json")
          }],
          launch
        }))));
      }
    });
    return (await Promise.all(picks)).flat();
  }
  getAllConfigurations() {
    const all = [];
    for (const l of this.launches) {
      for (const name of l.getConfigurationNames()) {
        const config = l.getConfiguration(name) || l.getCompound(name);
        if (config) {
          all.push({ launch: l, name, presentation: config.presentation });
        }
      }
    }
    return getVisibleAndSorted(all);
  }
  removeRecentDynamicConfigurations(name, type) {
    const remaining = this.getRecentDynamicConfigurations().filter((c) => c.name !== name || c.type !== type);
    this.storageService.store(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, JSON.stringify(remaining), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    if (this.selectedConfiguration.name === name && this.selectedType === type && this.selectedDynamic) {
      this.selectConfiguration(void 0, void 0);
    } else {
      this._onDidSelectConfigurationName.fire();
    }
  }
  getRecentDynamicConfigurations() {
    return JSON.parse(this.storageService.get(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, StorageScope.WORKSPACE, "[]"));
  }
  registerListeners() {
    this.toDispose.push(Event.any(this.contextService.onDidChangeWorkspaceFolders, this.contextService.onDidChangeWorkbenchState)(() => {
      this.initLaunches();
      this.selectConfiguration(void 0);
      this.setCompoundSchemaValues();
    }));
    this.toDispose.push(this.configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("launch")) {
        await this.selectConfiguration(void 0);
        this.setCompoundSchemaValues();
      }
    }));
    this.toDispose.push(this.adapterManager.onDidDebuggersExtPointRead(() => {
      this.setCompoundSchemaValues();
    }));
  }
  initLaunches() {
    this.launches = this.contextService.getWorkspace().folders.map((folder) => this.instantiationService.createInstance(Launch, this, this.adapterManager, folder));
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      this.launches.push(this.instantiationService.createInstance(WorkspaceLaunch, this, this.adapterManager));
    }
    this.launches.push(this.instantiationService.createInstance(UserLaunch, this, this.adapterManager));
    if (this.selectedLaunch && this.launches.indexOf(this.selectedLaunch) === -1) {
      this.selectConfiguration(void 0);
    }
  }
  setCompoundSchemaValues() {
    const compoundConfigurationsSchema = launchSchema.properties["compounds"].items.properties["configurations"];
    const launchNames = this.launches.map((l) => l.getConfigurationNames(true)).reduce((first, second) => first.concat(second), []);
    compoundConfigurationsSchema.items.oneOf[0].enum = launchNames;
    compoundConfigurationsSchema.items.oneOf[1].properties.name.enum = launchNames;
    const folderNames = this.contextService.getWorkspace().folders.map((f) => f.name);
    compoundConfigurationsSchema.items.oneOf[1].properties.folder.enum = folderNames;
    jsonRegistry.registerSchema(launchSchemaId, launchSchema);
  }
  getLaunches() {
    return this.launches;
  }
  getLaunch(workspaceUri) {
    if (!uri.isUri(workspaceUri)) {
      return void 0;
    }
    return this.launches.find((l) => l.workspace && this.uriIdentityService.extUri.isEqual(l.workspace.uri, workspaceUri));
  }
  get selectedConfiguration() {
    return {
      launch: this.selectedLaunch,
      name: this.selectedName,
      getConfig: this.getSelectedConfig,
      type: this.selectedType
    };
  }
  get onDidSelectConfiguration() {
    return this._onDidSelectConfigurationName.event;
  }
  getWorkspaceLaunch() {
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      return this.launches[this.launches.length - 1];
    }
    return void 0;
  }
  async selectConfiguration(launch, name, config, dynamicConfig) {
    if (typeof launch === "undefined") {
      const rootUri = this.historyService.getLastActiveWorkspaceRoot();
      launch = this.getLaunch(rootUri);
      if (!launch || launch.getConfigurationNames().length === 0) {
        launch = this.launches.find((l) => !!(l && l.getConfigurationNames().length)) || launch || this.launches[0];
      }
    }
    const previousLaunch = this.selectedLaunch;
    const previousName = this.selectedName;
    const previousSelectedDynamic = this.selectedDynamic;
    this.selectedLaunch = launch;
    if (this.selectedLaunch) {
      this.storageService.store(DEBUG_SELECTED_ROOT, this.selectedLaunch.uri.toString(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(DEBUG_SELECTED_ROOT, StorageScope.WORKSPACE);
    }
    const names = launch ? launch.getConfigurationNames() : [];
    this.getSelectedConfig = () => {
      const selected = this.selectedName ? launch?.getConfiguration(this.selectedName) : void 0;
      return Promise.resolve(selected || config);
    };
    let type = config?.type;
    if (name && names.indexOf(name) >= 0) {
      this.setSelectedLaunchName(name);
    } else if (dynamicConfig && dynamicConfig.type) {
      type = dynamicConfig.type;
      if (!config) {
        const providers = (await this.getDynamicProviders()).filter((p) => p.type === type);
        this.getSelectedConfig = async () => {
          const activatedProviders = await Promise.all(providers.map((p) => p.getProvider()));
          const provider = activatedProviders.length > 0 ? activatedProviders[0] : void 0;
          if (provider && launch && launch.workspace) {
            const token = new CancellationTokenSource();
            const dynamicConfigs = await provider.provideDebugConfigurations(launch.workspace.uri, token.token);
            const dynamicConfig2 = dynamicConfigs.find((c) => c.name === name);
            if (dynamicConfig2) {
              return dynamicConfig2;
            }
          }
          return void 0;
        };
      }
      this.setSelectedLaunchName(name);
      let recentDynamicProviders = this.getRecentDynamicConfigurations();
      if (name && dynamicConfig.type) {
        recentDynamicProviders.unshift({ name, type: dynamicConfig.type });
        recentDynamicProviders = distinct(recentDynamicProviders, (t) => `${t.name} : ${t.type}`);
        this.storageService.store(DEBUG_RECENT_DYNAMIC_CONFIGURATIONS, JSON.stringify(recentDynamicProviders), StorageScope.WORKSPACE, StorageTarget.MACHINE);
      }
    } else if (!this.selectedName || names.indexOf(this.selectedName) === -1) {
      const nameToSet = names.length ? names[0] : void 0;
      this.setSelectedLaunchName(nameToSet);
    }
    if (!config && launch && this.selectedName) {
      config = launch.getConfiguration(this.selectedName);
      type = config?.type;
    }
    this.selectedType = dynamicConfig?.type || config?.type;
    this.selectedDynamic = !!dynamicConfig;
    this.storageService.store(DEBUG_SELECTED_TYPE, dynamicConfig ? this.selectedType : void 0, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    if (type) {
      this.debugConfigurationTypeContext.set(type);
    } else {
      this.debugConfigurationTypeContext.reset();
    }
    if (this.selectedLaunch !== previousLaunch || this.selectedName !== previousName || previousSelectedDynamic !== this.selectedDynamic) {
      this._onDidSelectConfigurationName.fire();
    }
  }
  setSelectedLaunchName(selectedName) {
    this.selectedName = selectedName;
    if (this.selectedName) {
      this.storageService.store(DEBUG_SELECTED_CONFIG_NAME_KEY, this.selectedName, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(DEBUG_SELECTED_CONFIG_NAME_KEY, StorageScope.WORKSPACE);
    }
  }
  dispose() {
    this.toDispose = dispose(this.toDispose);
  }
};
ConfigurationManager = __decorateClass([
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IHistoryService),
  __decorateParam(8, IUriIdentityService),
  __decorateParam(9, IRemoteAgentService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, ILogService)
], ConfigurationManager);
class AbstractLaunch {
  constructor(configurationManager, adapterManager) {
    this.configurationManager = configurationManager;
    this.adapterManager = adapterManager;
  }
  getCompound(name) {
    const config = this.getDeduplicatedConfig();
    if (!config || !config.compounds) {
      return void 0;
    }
    return config.compounds.find((compound) => compound.name === name);
  }
  getConfigurationNames(ignoreCompoundsAndPresentation = false) {
    const config = this.getDeduplicatedConfig();
    if (!config || !Array.isArray(config.configurations) && !Array.isArray(config.compounds)) {
      return [];
    } else {
      const configurations = [];
      if (config.configurations) {
        configurations.push(...config.configurations.filter((cfg) => cfg && typeof cfg.name === "string"));
      }
      if (ignoreCompoundsAndPresentation) {
        return configurations.map((c) => c.name);
      }
      if (config.compounds) {
        configurations.push(...config.compounds.filter((compound) => typeof compound.name === "string" && compound.configurations && compound.configurations.length));
      }
      const resolved = configurations.map((c) => isDebugConfig(c) ? getEffectiveConfigForPlatform(c, this.configurationManager.getTargetOperatingSystem()) : c);
      return getVisibleAndSorted(resolved).map((c) => c.name);
    }
  }
  getConfiguration(name) {
    const config = this.getDeduplicatedConfig();
    if (!config || !config.configurations) {
      return void 0;
    }
    const configuration = config.configurations.find((config2) => config2 && config2.name === name);
    if (!configuration) {
      return;
    }
    const effectiveConfiguration = getEffectiveConfigForPlatform(configuration, this.configurationManager.getTargetOperatingSystem());
    if (this instanceof UserLaunch) {
      return { ...effectiveConfiguration, __configurationTarget: ConfigurationTarget.USER };
    } else if (this instanceof WorkspaceLaunch) {
      return { ...effectiveConfiguration, __configurationTarget: ConfigurationTarget.WORKSPACE };
    } else {
      return { ...effectiveConfiguration, __configurationTarget: ConfigurationTarget.WORKSPACE_FOLDER };
    }
  }
  async getInitialConfigurationContent(folderUri, type, useInitialConfigs, token) {
    let content = "";
    const adapter = type ? { debugger: this.adapterManager.getEnabledDebugger(type) } : await this.adapterManager.guessDebugger(true);
    if (adapter?.withConfig && adapter.debugger) {
      content = await adapter.debugger.getInitialConfigurationContent([adapter.withConfig.config]);
    } else if (adapter?.debugger) {
      const initialConfigs = useInitialConfigs ? await this.configurationManager.provideDebugConfigurations(folderUri, adapter.debugger.type, token || CancellationToken.None) : [];
      content = await adapter.debugger.getInitialConfigurationContent(initialConfigs);
    }
    return content;
  }
  get hidden() {
    return false;
  }
  getDeduplicatedConfig() {
    const original = this.getConfig();
    if (!original) {
      return void 0;
    }
    const compounds = original.compounds?.filter((compound) => !!compound && typeof compound.name === "string") ?? [];
    const configurations = original.configurations?.filter((configuration) => !!configuration && typeof configuration.name === "string") ?? [];
    return {
      version: original.version,
      compounds: distinguishConfigsByName(compounds),
      configurations: distinguishConfigsByName(configurations)
    };
  }
}
function distinguishConfigsByName(things) {
  const seen = /* @__PURE__ */ new Map();
  return things.map((thing) => {
    const no = seen.get(thing.name) || 0;
    seen.set(thing.name, no + 1);
    return no === 0 ? thing : { ...thing, name: `${thing.name} (${no})` };
  });
}
let Launch = class extends AbstractLaunch {
  constructor(configurationManager, adapterManager, workspace, fileService, textFileService, editorService, configurationService) {
    super(configurationManager, adapterManager);
    this.workspace = workspace;
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.editorService = editorService;
    this.configurationService = configurationService;
  }
  get uri() {
    return resources.joinPath(this.workspace.uri, "/.vscode/launch.json");
  }
  get name() {
    return this.workspace.name;
  }
  getConfig() {
    return this.configurationService.inspect("launch", { resource: this.workspace.uri }).workspaceFolderValue;
  }
  async openConfigFile({ preserveFocus, type, suppressInitialConfigs }, token) {
    const resource = this.uri;
    let created = false;
    let content = "";
    try {
      const fileContent = await this.fileService.readFile(resource);
      content = fileContent.value.toString();
    } catch {
      content = await this.getInitialConfigurationContent(this.workspace.uri, type, !suppressInitialConfigs, token);
      if (!content) {
        return { editor: null, created: false };
      }
      created = true;
      try {
        await this.textFileService.write(resource, content);
      } catch (error) {
        throw new Error(nls.localize("DebugConfig.failed", "Unable to create 'launch.json' file inside the '.vscode' folder ({0}).", error.message));
      }
    }
    const index = content.indexOf(`"${this.configurationManager.selectedConfiguration.name}"`);
    let startLineNumber = 1;
    for (let i = 0; i < index; i++) {
      if (content.charAt(i) === "\n") {
        startLineNumber++;
      }
    }
    const selection = startLineNumber > 1 ? { startLineNumber, startColumn: 4 } : void 0;
    const editor = await this.editorService.openEditor({
      resource,
      options: {
        selection,
        preserveFocus,
        pinned: created,
        revealIfVisible: true
      }
    }, ACTIVE_GROUP);
    return {
      editor: editor ?? null,
      created
    };
  }
  async writeConfiguration(configuration) {
    const fullConfig = { ...this.getConfig() ?? {} };
    fullConfig.configurations = [...fullConfig.configurations || [], configuration];
    await this.configurationService.updateValue("launch", fullConfig, { resource: this.workspace.uri }, ConfigurationTarget.WORKSPACE_FOLDER);
  }
};
Launch = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IConfigurationService)
], Launch);
let WorkspaceLaunch = class extends AbstractLaunch {
  constructor(configurationManager, adapterManager, editorService, configurationService, contextService) {
    super(configurationManager, adapterManager);
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.contextService = contextService;
  }
  get workspace() {
    return void 0;
  }
  get uri() {
    return this.contextService.getWorkspace().configuration;
  }
  get name() {
    return nls.localize("workspace", "workspace");
  }
  getConfig() {
    return this.configurationService.inspect("launch").workspaceValue;
  }
  async openConfigFile({ preserveFocus, type, useInitialConfigs }, token) {
    const launchExistInFile = !!this.getConfig();
    if (!launchExistInFile) {
      const content = await this.getInitialConfigurationContent(void 0, type, useInitialConfigs, token);
      if (content) {
        await this.configurationService.updateValue("launch", json.parse(content), ConfigurationTarget.WORKSPACE);
      } else {
        return { editor: null, created: false };
      }
    }
    const editor = await this.editorService.openEditor({
      resource: this.contextService.getWorkspace().configuration,
      options: { preserveFocus }
    }, ACTIVE_GROUP);
    return {
      editor: editor ?? null,
      created: false
    };
  }
};
WorkspaceLaunch = __decorateClass([
  __decorateParam(2, IEditorService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IWorkspaceContextService)
], WorkspaceLaunch);
let UserLaunch = class extends AbstractLaunch {
  constructor(configurationManager, adapterManager, configurationService, preferencesService) {
    super(configurationManager, adapterManager);
    this.configurationService = configurationService;
    this.preferencesService = preferencesService;
  }
  get workspace() {
    return void 0;
  }
  get uri() {
    return this.preferencesService.userSettingsResource;
  }
  get name() {
    return nls.localize("user settings", "user settings");
  }
  get hidden() {
    return true;
  }
  getConfig() {
    return this.configurationService.inspect("launch").userValue;
  }
  async openConfigFile({ preserveFocus, type, useInitialContent }) {
    const editor = await this.preferencesService.openUserSettings({ jsonEditor: true, preserveFocus, revealSetting: { key: "launch" } });
    return {
      editor: editor ?? null,
      created: false
    };
  }
};
UserLaunch = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IPreferencesService)
], UserLaunch);
export {
  ConfigurationManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdDb25maWd1cmF0aW9uTWFuYWdlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IHNlcXVlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMganNvbiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSBhcyB1cmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIsIElXb3Jrc3BhY2VGb2xkZXJzQ2hhbmdlRXZlbnQsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgbGF1bmNoU2NoZW1hSWQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hpc3RvcnkvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9ERUJVR19DT05GSUdVUkFUSU9OX1RZUEUsIERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQsIElBZGFwdGVyTWFuYWdlciwgSUNvbXBvdW5kLCBJQ29uZmlnLCBJQ29uZmlnUHJlc2VudGF0aW9uLCBJQ29uZmlndXJhdGlvbk1hbmFnZXIsIElEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciwgSUdsb2JhbENvbmZpZywgSUd1ZXNzZWREZWJ1Z2dlciwgSUxhdW5jaCwgaXNEZWJ1Z0NvbmZpZyB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBsYXVuY2hTY2hlbWEgfSBmcm9tICcuLi9jb21tb24vZGVidWdTY2hlbWFzLmpzJztcbmltcG9ydCB7IGdldEVmZmVjdGl2ZUNvbmZpZ0ZvclBsYXRmb3JtLCBnZXRWaXNpYmxlQW5kU29ydGVkIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnVXRpbHMuanMnO1xuaW1wb3J0IHsgZGVidWdDb25maWd1cmUgfSBmcm9tICcuL2RlYnVnSWNvbnMuanMnO1xuXG5jb25zdCBqc29uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcbmpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShsYXVuY2hTY2hlbWFJZCwgbGF1bmNoU2NoZW1hKTtcblxuY29uc3QgREVCVUdfU0VMRUNURURfQ09ORklHX05BTUVfS0VZID0gJ2RlYnVnLnNlbGVjdGVkY29uZmlnbmFtZSc7XG5jb25zdCBERUJVR19TRUxFQ1RFRF9ST09UID0gJ2RlYnVnLnNlbGVjdGVkcm9vdCc7XG4vLyBEZWJ1ZyB0eXBlIGlzIG9ubHkgc3RvcmVkIGlmIGEgZHluYW1pYyBjb25maWd1cmF0aW9uIGlzIHVzZWQgZm9yIGJldHRlciByZXN0b3JlXG5jb25zdCBERUJVR19TRUxFQ1RFRF9UWVBFID0gJ2RlYnVnLnNlbGVjdGVkdHlwZSc7XG5jb25zdCBERUJVR19SRUNFTlRfRFlOQU1JQ19DT05GSUdVUkFUSU9OUyA9ICdkZWJ1Zy5yZWNlbnRkeW5hbWljY29uZmlndXJhdGlvbnMnO1xuY29uc3QgT05fREVCVUdfRFlOQU1JQ19DT05GSUdVUkFUSU9OU19OQU1FID0gJ29uRGVidWdEeW5hbWljQ29uZmlndXJhdGlvbnMnO1xuXG5pbnRlcmZhY2UgSUR5bmFtaWNQaWNrSXRlbSB7IGxhYmVsOiBzdHJpbmc7IGxhdW5jaDogSUxhdW5jaDsgY29uZmlnOiBJQ29uZmlnIH1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25NYW5hZ2VyIGltcGxlbWVudHMgSUNvbmZpZ3VyYXRpb25NYW5hZ2VyIHtcblx0cHJpdmF0ZSBsYXVuY2hlcyE6IElMYXVuY2hbXTtcblx0cHJpdmF0ZSBzZWxlY3RlZE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZWxlY3RlZExhdW5jaDogSUxhdW5jaCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXRTZWxlY3RlZENvbmZpZzogKCkgPT4gUHJvbWlzZTxJQ29uZmlnIHwgdW5kZWZpbmVkPiA9ICgpID0+IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRwcml2YXRlIHNlbGVjdGVkVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlbGVjdGVkRHluYW1pYyA9IGZhbHNlO1xuXHRwcml2YXRlIHRvRGlzcG9zZTogSURpc3Bvc2FibGVbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RDb25maWd1cmF0aW9uTmFtZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHByaXZhdGUgY29uZmlnUHJvdmlkZXJzOiBJRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJbXTtcblx0cHJpdmF0ZSBkZWJ1Z0NvbmZpZ3VyYXRpb25UeXBlQ29udGV4dDogSUNvbnRleHRLZXk8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uUHJvdmlkZXJzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvblByb3ZpZGVycyA9IHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvblByb3ZpZGVycy5ldmVudDtcblx0cHJpdmF0ZSB0YXJnZXRPcGVyYXRpbmdTeXN0ZW0gPSBPUztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFkYXB0ZXJNYW5hZ2VyOiBJQWRhcHRlck1hbmFnZXIsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmNvbmZpZ1Byb3ZpZGVycyA9IFtdO1xuXHRcdHRoaXMudG9EaXNwb3NlID0gW3RoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvblByb3ZpZGVycywgdGhpcy5fb25EaWRTZWxlY3RDb25maWd1cmF0aW9uTmFtZV07XG5cdFx0dGhpcy5pbml0TGF1bmNoZXMoKTtcblx0XHR0aGlzLnNldENvbXBvdW5kU2NoZW1hVmFsdWVzKCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0ZWRSb290ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoREVCVUdfU0VMRUNURURfUk9PVCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0Y29uc3QgcHJldmlvdXNTZWxlY3RlZFR5cGUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChERUJVR19TRUxFQ1RFRF9UWVBFLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGVkTGF1bmNoID0gdGhpcy5sYXVuY2hlcy5maW5kKGwgPT4gbC51cmkudG9TdHJpbmcoKSA9PT0gcHJldmlvdXNTZWxlY3RlZFJvb3QpO1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0ZWROYW1lID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoREVCVUdfU0VMRUNURURfQ09ORklHX05BTUVfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR0aGlzLmRlYnVnQ29uZmlndXJhdGlvblR5cGVDb250ZXh0ID0gQ09OVEVYVF9ERUJVR19DT05GSUdVUkFUSU9OX1RZUEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBkeW5hbWljQ29uZmlnID0gcHJldmlvdXNTZWxlY3RlZFR5cGUgPyB7IHR5cGU6IHByZXZpb3VzU2VsZWN0ZWRUeXBlIH0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHByZXZpb3VzU2VsZWN0ZWRMYXVuY2ggJiYgcHJldmlvdXNTZWxlY3RlZExhdW5jaC5nZXRDb25maWd1cmF0aW9uTmFtZXMoKS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc2VsZWN0Q29uZmlndXJhdGlvbihwcmV2aW91c1NlbGVjdGVkTGF1bmNoLCBwcmV2aW91c1NlbGVjdGVkTmFtZSwgdW5kZWZpbmVkLCBkeW5hbWljQ29uZmlnKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMubGF1bmNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5zZWxlY3RDb25maWd1cmF0aW9uKHVuZGVmaW5lZCwgcHJldmlvdXNTZWxlY3RlZE5hbWUsIHVuZGVmaW5lZCwgZHluYW1pY0NvbmZpZyk7XG5cdFx0fVxuXHRcdHRoaXMucmVzb2x2ZVRhcmdldE9wZXJhdGluZ1N5c3RlbSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlVGFyZ2V0T3BlcmF0aW5nU3lzdGVtKCk6IHZvaWQge1xuXHRcdHRoaXMucmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCkudGhlbihlbnZpcm9ubWVudCA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRPcGVyYXRpbmdTeXN0ZW0gPSBlbnZpcm9ubWVudD8ub3MgPz8gT1M7XG5cdFx0XHRpZiAodGhpcy50YXJnZXRPcGVyYXRpbmdTeXN0ZW0gIT09IHRhcmdldE9wZXJhdGluZ1N5c3RlbSkge1xuXHRcdFx0XHR0aGlzLnRhcmdldE9wZXJhdGluZ1N5c3RlbSA9IHRhcmdldE9wZXJhdGluZ1N5c3RlbTtcblx0XHRcdFx0dGhpcy5fb25EaWRTZWxlY3RDb25maWd1cmF0aW9uTmFtZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSwgKCkgPT4ge1xuXHRcdFx0Ly8gSWdub3JlIHJlbW90ZSBlbnZpcm9ubWVudCBmYWlsdXJlcyBhbmQgZmFsbCBiYWNrIHRvIHRoZSBsb2NhbCBPUy5cblx0XHR9KTtcblx0fVxuXG5cdGdldFRhcmdldE9wZXJhdGluZ1N5c3RlbSgpIHtcblx0XHRyZXR1cm4gdGhpcy50YXJnZXRPcGVyYXRpbmdTeXN0ZW07XG5cdH1cblxuXHRyZWdpc3RlckRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKGRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyOiBJRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5jb25maWdQcm92aWRlcnMucHVzaChkZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uUHJvdmlkZXJzLmZpcmUoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnVucmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcihkZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcik7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvblByb3ZpZGVycy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHVucmVnaXN0ZXJEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcihkZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlcjogSURlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKTogdm9pZCB7XG5cdFx0Y29uc3QgaXggPSB0aGlzLmNvbmZpZ1Byb3ZpZGVycy5pbmRleE9mKGRlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKTtcblx0XHRpZiAoaXggPj0gMCkge1xuXHRcdFx0dGhpcy5jb25maWdQcm92aWRlcnMuc3BsaWNlKGl4LCAxKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogaWYgc2NvcGUgaXMgbm90IHNwZWNpZmllZCxhIHZhbHVlIG9mIERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVUcmlnZ2VyLkluaXRpYWwgaXMgYXNzdW1lZC5cblx0ICovXG5cdGhhc0RlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyKGRlYnVnVHlwZTogc3RyaW5nLCB0cmlnZ2VyS2luZD86IERlYnVnQ29uZmlndXJhdGlvblByb3ZpZGVyVHJpZ2dlcktpbmQpOiBib29sZWFuIHtcblx0XHRpZiAodHJpZ2dlcktpbmQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dHJpZ2dlcktpbmQgPSBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kLkluaXRpYWw7XG5cdFx0fVxuXHRcdC8vIGNoZWNrIGlmIHRoZXJlIGFyZSBwcm92aWRlcnMgZm9yIHRoZSBnaXZlbiB0eXBlIHRoYXQgY29udHJpYnV0ZSBhIHByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zIG1ldGhvZFxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5jb25maWdQcm92aWRlcnMuZmluZChwID0+IHAucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMgJiYgKHAudHlwZSA9PT0gZGVidWdUeXBlKSAmJiAocC50cmlnZ2VyS2luZCA9PT0gdHJpZ2dlcktpbmQpKTtcblx0XHRyZXR1cm4gISFwcm92aWRlcjtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVDb25maWd1cmF0aW9uQnlQcm92aWRlcnMoZm9sZGVyVXJpOiB1cmkgfCB1bmRlZmluZWQsIHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29uZmlnOiBJQ29uZmlnLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDb25maWcgfCBudWxsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbkZvclR5cGUgPSBhc3luYyAodHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb25maWc6IElDb25maWcgfCBudWxsIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRpZiAodHlwZSAhPT0gJyonKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuYWRhcHRlck1hbmFnZXIuYWN0aXZhdGVEZWJ1Z2dlcnMoJ29uRGVidWdSZXNvbHZlJywgdHlwZSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgcCBvZiB0aGlzLmNvbmZpZ1Byb3ZpZGVycykge1xuXHRcdFx0XHRpZiAocC50eXBlID09PSB0eXBlICYmIHAucmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbiAmJiBjb25maWcpIHtcblx0XHRcdFx0XHRjb25maWcgPSBhd2FpdCBwLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb24oZm9sZGVyVXJpLCBjb25maWcsIHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY29uZmlnO1xuXHRcdH07XG5cblx0XHRsZXQgcmVzb2x2ZWRUeXBlID0gY29uZmlnLnR5cGUgPz8gdHlwZTtcblx0XHRsZXQgcmVzdWx0OiBJQ29uZmlnIHwgbnVsbCB8IHVuZGVmaW5lZCA9IGNvbmZpZztcblx0XHRmb3IgKGxldCBzZWVuID0gbmV3IFNldCgpOyByZXN1bHQgJiYgIXNlZW4uaGFzKHJlc29sdmVkVHlwZSk7KSB7XG5cdFx0XHRzZWVuLmFkZChyZXNvbHZlZFR5cGUpO1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbkZvclR5cGUocmVzb2x2ZWRUeXBlLCByZXN1bHQpO1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgcmVzb2x2ZURlYnVnQ29uZmlndXJhdGlvbkZvclR5cGUoJyonLCByZXN1bHQpO1xuXHRcdFx0cmVzb2x2ZWRUeXBlID0gcmVzdWx0Py50eXBlID8/IHR5cGUhO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzKGZvbGRlclVyaTogdXJpIHwgdW5kZWZpbmVkLCB0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbmZpZzogSUNvbmZpZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ29uZmlnIHwgbnVsbCB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIHBpcGUgdGhlIGNvbmZpZyB0aHJvdWdoIHRoZSBwcm9taXNlcyBzZXF1ZW50aWFsbHkuIEFwcGVuZCBhdCB0aGUgZW5kIHRoZSAnKicgdHlwZXNcblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLmNvbmZpZ1Byb3ZpZGVycy5maWx0ZXIocCA9PiBwLnR5cGUgPT09IHR5cGUgJiYgcC5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzKVxuXHRcdFx0LmNvbmNhdCh0aGlzLmNvbmZpZ1Byb3ZpZGVycy5maWx0ZXIocCA9PiBwLnR5cGUgPT09ICcqJyAmJiBwLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMpKTtcblxuXHRcdGxldCByZXN1bHQ6IElDb25maWcgfCBudWxsIHwgdW5kZWZpbmVkID0gY29uZmlnO1xuXHRcdGF3YWl0IHNlcXVlbmNlKHByb3ZpZGVycy5tYXAocHJvdmlkZXIgPT4gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gSWYgYW55IHByb3ZpZGVyIHJldHVybmVkIHVuZGVmaW5lZCBvciBudWxsIG1ha2Ugc3VyZSB0byByZXNwZWN0IHRoYXQgYW5kIGRvIG5vdCBwYXNzIHRoZSByZXN1bHQgdG8gbW9yZSByZXNvbHZlclxuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXN1bHQgPSBhd2FpdCBwcm92aWRlci5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzIShmb2xkZXJVcmksIHJlc3VsdCwgdG9rZW4pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBwcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyhmb2xkZXJVcmk6IHVyaSB8IHVuZGVmaW5lZCwgdHlwZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGFueVtdPiB7XG5cdFx0YXdhaXQgdGhpcy5hZGFwdGVyTWFuYWdlci5hY3RpdmF0ZURlYnVnZ2Vycygnb25EZWJ1Z0luaXRpYWxDb25maWd1cmF0aW9ucycpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbCh0aGlzLmNvbmZpZ1Byb3ZpZGVycy5maWx0ZXIocCA9PiBwLnR5cGUgPT09IHR5cGUgJiYgcC50cmlnZ2VyS2luZCA9PT0gRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZC5Jbml0aWFsICYmIHAucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMpLm1hcChwID0+IHAucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMhKGZvbGRlclVyaSwgdG9rZW4pKSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0cy5yZWR1Y2UoKGZpcnN0LCBzZWNvbmQpID0+IGZpcnN0LmNvbmNhdChzZWNvbmQpLCBbXSk7XG5cdH1cblxuXHRhc3luYyBnZXREeW5hbWljUHJvdmlkZXJzKCk6IFByb21pc2U8eyBsYWJlbDogc3RyaW5nOyB0eXBlOiBzdHJpbmc7IGdldFByb3ZpZGVyOiAoKSA9PiBQcm9taXNlPElEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlciB8IHVuZGVmaW5lZD47IHBpY2s6ICgpID0+IFByb21pc2U8eyBsYXVuY2g6IElMYXVuY2g7IGNvbmZpZzogSUNvbmZpZzsgbGFiZWw6IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB9W10+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0Y29uc3QgZGVidWdEeW5hbWljRXh0ZW5zaW9uc1R5cGVzID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMucmVkdWNlKChhY2MsIGUpID0+IHtcblx0XHRcdGlmICghZS5hY3RpdmF0aW9uRXZlbnRzKSB7XG5cdFx0XHRcdHJldHVybiBhY2M7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGV4cGxpY2l0VHlwZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsZXQgaGFzR2VuZXJpY0V2ZW50ID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIGUuYWN0aXZhdGlvbkV2ZW50cykge1xuXHRcdFx0XHRpZiAoZXZlbnQgPT09IE9OX0RFQlVHX0RZTkFNSUNfQ09ORklHVVJBVElPTlNfTkFNRSkge1xuXHRcdFx0XHRcdGhhc0dlbmVyaWNFdmVudCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuc3RhcnRzV2l0aChgJHtPTl9ERUJVR19EWU5BTUlDX0NPTkZJR1VSQVRJT05TX05BTUV9OmApKSB7XG5cdFx0XHRcdFx0ZXhwbGljaXRUeXBlcy5wdXNoKGV2ZW50LnNsaWNlKE9OX0RFQlVHX0RZTkFNSUNfQ09ORklHVVJBVElPTlNfTkFNRS5sZW5ndGggKyAxKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGV4cGxpY2l0VHlwZXMubGVuZ3RoKSB7XG5cdFx0XHRcdGV4cGxpY2l0VHlwZXMuZm9yRWFjaCh0ID0+IGFjYy5hZGQodCkpO1xuXHRcdFx0fSBlbHNlIGlmIChoYXNHZW5lcmljRXZlbnQpIHtcblx0XHRcdFx0Y29uc3QgZGVidWdnZXJUeXBlID0gZS5jb250cmlidXRlcz8uZGVidWdnZXJzPy5bMF0udHlwZTtcblx0XHRcdFx0aWYgKGRlYnVnZ2VyVHlwZSkge1xuXHRcdFx0XHRcdGFjYy5hZGQoZGVidWdnZXJUeXBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gYWNjO1xuXHRcdH0sIG5ldyBTZXQ8c3RyaW5nPigpKTtcblxuXHRcdGZvciAoY29uc3QgY29uZmlnUHJvdmlkZXIgb2YgdGhpcy5jb25maWdQcm92aWRlcnMpIHtcblx0XHRcdGlmIChjb25maWdQcm92aWRlci50cmlnZ2VyS2luZCA9PT0gRGVidWdDb25maWd1cmF0aW9uUHJvdmlkZXJUcmlnZ2VyS2luZC5EeW5hbWljKSB7XG5cdFx0XHRcdGRlYnVnRHluYW1pY0V4dGVuc2lvbnNUeXBlcy5hZGQoY29uZmlnUHJvdmlkZXIudHlwZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi5kZWJ1Z0R5bmFtaWNFeHRlbnNpb25zVHlwZXNdLm1hcCh0eXBlID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmdldERlYnVnZ2VyTGFiZWwodHlwZSkhLFxuXHRcdFx0XHRnZXRQcm92aWRlcjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuYWRhcHRlck1hbmFnZXIuYWN0aXZhdGVEZWJ1Z2dlcnMoT05fREVCVUdfRFlOQU1JQ19DT05GSUdVUkFUSU9OU19OQU1FLCB0eXBlKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jb25maWdQcm92aWRlcnMuZmluZChwID0+IHAudHlwZSA9PT0gdHlwZSAmJiBwLnRyaWdnZXJLaW5kID09PSBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kLkR5bmFtaWMgJiYgcC5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdHBpY2s6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHQvLyBEbyBhIGxhdGUgJ29uRGVidWdEeW5hbWljQ29uZmlndXJhdGlvbnNOYW1lJyBhY3RpdmF0aW9uIHNvIGV4dGVuc2lvbnMgYXJlIG5vdCBhY3RpdmF0ZWQgdG9vIGVhcmx5ICMxMDg1Nzhcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmFjdGl2YXRlRGVidWdnZXJzKE9OX0RFQlVHX0RZTkFNSUNfQ09ORklHVVJBVElPTlNfTkFNRSwgdHlwZSk7XG5cblx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRjb25zdCB0b2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbik7XG5cdFx0XHRcdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SUR5bmFtaWNQaWNrSXRlbT4oKSk7XG5cdFx0XHRcdFx0aW5wdXQuYnVzeSA9IHRydWU7XG5cdFx0XHRcdFx0aW5wdXQucGxhY2Vob2xkZXIgPSBubHMubG9jYWxpemUoJ3NlbGVjdENvbmZpZ3VyYXRpb24nLCBcIlNlbGVjdCBMYXVuY2ggQ29uZmlndXJhdGlvblwiKTtcblxuXHRcdFx0XHRcdGNvbnN0IGNob3NlblByb21pc2UgPSBuZXcgUHJvbWlzZTxJRHluYW1pY1BpY2tJdGVtIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZEFjY2VwdCgoKSA9PiByZXNvbHZlKGlucHV0LmFjdGl2ZUl0ZW1zWzBdKSkpO1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGlucHV0Lm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oYXN5bmMgKGNvbnRleHQpID0+IHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IGxhdW5jaCwgY29uZmlnIH0gPSBjb250ZXh0Lml0ZW07XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGxhdW5jaC5vcGVuQ29uZmlnRmlsZSh7IHByZXNlcnZlRm9jdXM6IGZhbHNlLCB0eXBlOiBjb25maWcudHlwZSwgc3VwcHJlc3NJbml0aWFsQ29uZmlnczogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdFx0Ly8gT25seSBMYXVuY2ggaGF2ZSBhIHBpbiB0cmlnZ2VyIGJ1dHRvblxuXHRcdFx0XHRcdFx0XHRhd2FpdCAobGF1bmNoIGFzIExhdW5jaCkud3JpdGVDb25maWd1cmF0aW9uKGNvbmZpZyk7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuc2VsZWN0Q29uZmlndXJhdGlvbihsYXVuY2gsIGNvbmZpZy5uYW1lKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5yZW1vdmVSZWNlbnREeW5hbWljQ29uZmlndXJhdGlvbnMoY29uZmlnLm5hbWUsIGNvbmZpZy50eXBlKTtcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnB1dC5vbkRpZEhpZGUoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0XHRcdFx0fSkuZmluYWxseSgoKSA9PiB0b2tlbi5jYW5jZWwoKSk7XG5cblx0XHRcdFx0XHRsZXQgaXRlbXM6IElEeW5hbWljUGlja0l0ZW1bXTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBhd2FpdCBpbnZva2VzIHRoZSBleHRlbnNpb24gcHJvdmlkZXJzLCB3aGljaCBtaWdodCBmYWlsIGR1ZSB0byBzZXZlcmFsIHJlYXNvbnMsXG5cdFx0XHRcdFx0XHQvLyB0aGVyZWZvcmUgd2UgZ2F0ZSB0aGlzIGxvZ2ljIHVuZGVyIGEgdHJ5L2NhdGNoIHRvIHByZXZlbnQgbGVhdmluZyB0aGUgRGVidWcgVGFiXG5cdFx0XHRcdFx0XHQvLyBzZWxlY3RvciBpbiBhIGJvcmtlZCBzdGF0ZS5cblx0XHRcdFx0XHRcdGl0ZW1zID0gYXdhaXQgdGhpcy5nZXREeW5hbWljQ29uZmlndXJhdGlvbnNCeVR5cGUodHlwZSwgdG9rZW4udG9rZW4pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aW5wdXQuaXRlbXMgPSBpdGVtcztcblx0XHRcdFx0XHRpbnB1dC5idXN5ID0gZmFsc2U7XG5cdFx0XHRcdFx0aW5wdXQuc2hvdygpO1xuXHRcdFx0XHRcdGNvbnN0IGNob3NlbiA9IGF3YWl0IGNob3NlblByb21pc2U7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIGNob3Nlbjtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGdldER5bmFtaWNDb25maWd1cmF0aW9uc0J5VHlwZSh0eXBlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPElEeW5hbWljUGlja0l0ZW1bXT4ge1xuXHRcdC8vIERvIGEgbGF0ZSAnb25EZWJ1Z0R5bmFtaWNDb25maWd1cmF0aW9uc05hbWUnIGFjdGl2YXRpb24gc28gZXh0ZW5zaW9ucyBhcmUgbm90IGFjdGl2YXRlZCB0b28gZWFybHkgIzEwODU3OFxuXHRcdGF3YWl0IHRoaXMuYWRhcHRlck1hbmFnZXIuYWN0aXZhdGVEZWJ1Z2dlcnMoT05fREVCVUdfRFlOQU1JQ19DT05GSUdVUkFUSU9OU19OQU1FLCB0eXBlKTtcblxuXHRcdGNvbnN0IHBpY2tzOiBQcm9taXNlPElEeW5hbWljUGlja0l0ZW1bXT5bXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5jb25maWdQcm92aWRlcnMuZmluZChwID0+IHAudHlwZSA9PT0gdHlwZSAmJiBwLnRyaWdnZXJLaW5kID09PSBEZWJ1Z0NvbmZpZ3VyYXRpb25Qcm92aWRlclRyaWdnZXJLaW5kLkR5bmFtaWMgJiYgcC5wcm92aWRlRGVidWdDb25maWd1cmF0aW9ucyk7XG5cdFx0dGhpcy5nZXRMYXVuY2hlcygpLmZvckVhY2gobGF1bmNoID0+IHtcblx0XHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0XHRwaWNrcy5wdXNoKHByb3ZpZGVyLnByb3ZpZGVEZWJ1Z0NvbmZpZ3VyYXRpb25zIShsYXVuY2gud29ya3NwYWNlPy51cmksIHRva2VuKS50aGVuKGNvbmZpZ3VyYXRpb25zID0+IGNvbmZpZ3VyYXRpb25zLm1hcChjb25maWcgPT4gKHtcblx0XHRcdFx0XHRsYWJlbDogY29uZmlnLm5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxhdW5jaC5uYW1lLFxuXHRcdFx0XHRcdGNvbmZpZyxcblx0XHRcdFx0XHRidXR0b25zOiBbe1xuXHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoZGVidWdDb25maWd1cmUpLFxuXHRcdFx0XHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdlZGl0TGF1bmNoQ29uZmlnJywgXCJFZGl0IERlYnVnIENvbmZpZ3VyYXRpb24gaW4gbGF1bmNoLmpzb25cIilcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRsYXVuY2hcblx0XHRcdFx0fSkpKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gKGF3YWl0IFByb21pc2UuYWxsKHBpY2tzKSkuZmxhdCgpO1xuXHR9XG5cblx0Z2V0QWxsQ29uZmlndXJhdGlvbnMoKTogeyBsYXVuY2g6IElMYXVuY2g7IG5hbWU6IHN0cmluZzsgcHJlc2VudGF0aW9uPzogSUNvbmZpZ1ByZXNlbnRhdGlvbiB9W10ge1xuXHRcdGNvbnN0IGFsbDogeyBsYXVuY2g6IElMYXVuY2g7IG5hbWU6IHN0cmluZzsgcHJlc2VudGF0aW9uPzogSUNvbmZpZ1ByZXNlbnRhdGlvbiB9W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGwgb2YgdGhpcy5sYXVuY2hlcykge1xuXHRcdFx0Zm9yIChjb25zdCBuYW1lIG9mIGwuZ2V0Q29uZmlndXJhdGlvbk5hbWVzKCkpIHtcblx0XHRcdFx0Y29uc3QgY29uZmlnID0gbC5nZXRDb25maWd1cmF0aW9uKG5hbWUpIHx8IGwuZ2V0Q29tcG91bmQobmFtZSk7XG5cdFx0XHRcdGlmIChjb25maWcpIHtcblx0XHRcdFx0XHRhbGwucHVzaCh7IGxhdW5jaDogbCwgbmFtZSwgcHJlc2VudGF0aW9uOiBjb25maWcucHJlc2VudGF0aW9uIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGdldFZpc2libGVBbmRTb3J0ZWQoYWxsKTtcblx0fVxuXG5cdHJlbW92ZVJlY2VudER5bmFtaWNDb25maWd1cmF0aW9ucyhuYW1lOiBzdHJpbmcsIHR5cGU6IHN0cmluZykge1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IHRoaXMuZ2V0UmVjZW50RHluYW1pY0NvbmZpZ3VyYXRpb25zKCkuZmlsdGVyKGMgPT4gYy5uYW1lICE9PSBuYW1lIHx8IGMudHlwZSAhPT0gdHlwZSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShERUJVR19SRUNFTlRfRFlOQU1JQ19DT05GSUdVUkFUSU9OUywgSlNPTi5zdHJpbmdpZnkocmVtYWluaW5nKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRpZiAodGhpcy5zZWxlY3RlZENvbmZpZ3VyYXRpb24ubmFtZSA9PT0gbmFtZSAmJiB0aGlzLnNlbGVjdGVkVHlwZSA9PT0gdHlwZSAmJiB0aGlzLnNlbGVjdGVkRHluYW1pYykge1xuXHRcdFx0dGhpcy5zZWxlY3RDb25maWd1cmF0aW9uKHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3RDb25maWd1cmF0aW9uTmFtZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0UmVjZW50RHluYW1pY0NvbmZpZ3VyYXRpb25zKCk6IHsgbmFtZTogc3RyaW5nOyB0eXBlOiBzdHJpbmcgfVtdIHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChERUJVR19SRUNFTlRfRFlOQU1JQ19DT05GSUdVUkFUSU9OUywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJ1tdJykpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKEV2ZW50LmFueTxJV29ya3NwYWNlRm9sZGVyc0NoYW5nZUV2ZW50IHwgV29ya2JlbmNoU3RhdGU+KHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzLCB0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUpKCgpID0+IHtcblx0XHRcdHRoaXMuaW5pdExhdW5jaGVzKCk7XG5cdFx0XHR0aGlzLnNlbGVjdENvbmZpZ3VyYXRpb24odW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuc2V0Q29tcG91bmRTY2hlbWFWYWx1ZXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdsYXVuY2gnKSkge1xuXHRcdFx0XHQvLyBBIGNoYW5nZSBoYXBwZW4gaW4gdGhlIGxhdW5jaC5qc29uLiBJZiB0aGVyZSBpcyBhbHJlYWR5IGEgbGF1bmNoIGNvbmZpZ3VyYXRpb24gc2VsZWN0ZWQsIGRvIG5vdCBjaGFuZ2UgdGhlIHNlbGVjdGlvbi5cblx0XHRcdFx0YXdhaXQgdGhpcy5zZWxlY3RDb25maWd1cmF0aW9uKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuc2V0Q29tcG91bmRTY2hlbWFWYWx1ZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmFkYXB0ZXJNYW5hZ2VyLm9uRGlkRGVidWdnZXJzRXh0UG9pbnRSZWFkKCgpID0+IHtcblx0XHRcdHRoaXMuc2V0Q29tcG91bmRTY2hlbWFWYWx1ZXMoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRMYXVuY2hlcygpOiB2b2lkIHtcblx0XHR0aGlzLmxhdW5jaGVzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYXVuY2gsIHRoaXMsIHRoaXMuYWRhcHRlck1hbmFnZXIsIGZvbGRlcikpO1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0dGhpcy5sYXVuY2hlcy5wdXNoKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlTGF1bmNoLCB0aGlzLCB0aGlzLmFkYXB0ZXJNYW5hZ2VyKSk7XG5cdFx0fVxuXHRcdHRoaXMubGF1bmNoZXMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVzZXJMYXVuY2gsIHRoaXMsIHRoaXMuYWRhcHRlck1hbmFnZXIpKTtcblxuXHRcdGlmICh0aGlzLnNlbGVjdGVkTGF1bmNoICYmIHRoaXMubGF1bmNoZXMuaW5kZXhPZih0aGlzLnNlbGVjdGVkTGF1bmNoKSA9PT0gLTEpIHtcblx0XHRcdHRoaXMuc2VsZWN0Q29uZmlndXJhdGlvbih1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0Q29tcG91bmRTY2hlbWFWYWx1ZXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tcG91bmRDb25maWd1cmF0aW9uc1NjaGVtYSA9ICg8SUpTT05TY2hlbWE+bGF1bmNoU2NoZW1hLnByb3BlcnRpZXMhWydjb21wb3VuZHMnXS5pdGVtcykucHJvcGVydGllcyFbJ2NvbmZpZ3VyYXRpb25zJ107XG5cdFx0Y29uc3QgbGF1bmNoTmFtZXMgPSB0aGlzLmxhdW5jaGVzLm1hcChsID0+XG5cdFx0XHRsLmdldENvbmZpZ3VyYXRpb25OYW1lcyh0cnVlKSkucmVkdWNlKChmaXJzdCwgc2Vjb25kKSA9PiBmaXJzdC5jb25jYXQoc2Vjb25kKSwgW10pO1xuXHRcdCg8SUpTT05TY2hlbWE+Y29tcG91bmRDb25maWd1cmF0aW9uc1NjaGVtYS5pdGVtcykub25lT2YhWzBdLmVudW0gPSBsYXVuY2hOYW1lcztcblx0XHQoPElKU09OU2NoZW1hPmNvbXBvdW5kQ29uZmlndXJhdGlvbnNTY2hlbWEuaXRlbXMpLm9uZU9mIVsxXS5wcm9wZXJ0aWVzIS5uYW1lLmVudW0gPSBsYXVuY2hOYW1lcztcblxuXHRcdGNvbnN0IGZvbGRlck5hbWVzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmID0+IGYubmFtZSk7XG5cdFx0KDxJSlNPTlNjaGVtYT5jb21wb3VuZENvbmZpZ3VyYXRpb25zU2NoZW1hLml0ZW1zKS5vbmVPZiFbMV0ucHJvcGVydGllcyEuZm9sZGVyLmVudW0gPSBmb2xkZXJOYW1lcztcblxuXHRcdGpzb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYShsYXVuY2hTY2hlbWFJZCwgbGF1bmNoU2NoZW1hKTtcblx0fVxuXG5cdGdldExhdW5jaGVzKCk6IElMYXVuY2hbXSB7XG5cdFx0cmV0dXJuIHRoaXMubGF1bmNoZXM7XG5cdH1cblxuXHRnZXRMYXVuY2god29ya3NwYWNlVXJpOiB1cmkgfCB1bmRlZmluZWQpOiBJTGF1bmNoIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXVyaS5pc1VyaSh3b3Jrc3BhY2VVcmkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmxhdW5jaGVzLmZpbmQobCA9PiBsLndvcmtzcGFjZSAmJiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChsLndvcmtzcGFjZS51cmksIHdvcmtzcGFjZVVyaSkpO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGVkQ29uZmlndXJhdGlvbigpOiB7IGxhdW5jaDogSUxhdW5jaCB8IHVuZGVmaW5lZDsgbmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkOyBnZXRDb25maWc6ICgpID0+IFByb21pc2U8SUNvbmZpZyB8IHVuZGVmaW5lZD47IHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGF1bmNoOiB0aGlzLnNlbGVjdGVkTGF1bmNoLFxuXHRcdFx0bmFtZTogdGhpcy5zZWxlY3RlZE5hbWUsXG5cdFx0XHRnZXRDb25maWc6IHRoaXMuZ2V0U2VsZWN0ZWRDb25maWcsXG5cdFx0XHR0eXBlOiB0aGlzLnNlbGVjdGVkVHlwZVxuXHRcdH07XG5cdH1cblxuXHRnZXQgb25EaWRTZWxlY3RDb25maWd1cmF0aW9uKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRTZWxlY3RDb25maWd1cmF0aW9uTmFtZS5ldmVudDtcblx0fVxuXG5cdGdldFdvcmtzcGFjZUxhdW5jaCgpOiBJTGF1bmNoIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdHJldHVybiB0aGlzLmxhdW5jaGVzW3RoaXMubGF1bmNoZXMubGVuZ3RoIC0gMV07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHNlbGVjdENvbmZpZ3VyYXRpb24obGF1bmNoOiBJTGF1bmNoIHwgdW5kZWZpbmVkLCBuYW1lPzogc3RyaW5nLCBjb25maWc/OiBJQ29uZmlnLCBkeW5hbWljQ29uZmlnPzogeyB0eXBlPzogc3RyaW5nIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodHlwZW9mIGxhdW5jaCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGNvbnN0IHJvb3RVcmkgPSB0aGlzLmhpc3RvcnlTZXJ2aWNlLmdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290KCk7XG5cdFx0XHRsYXVuY2ggPSB0aGlzLmdldExhdW5jaChyb290VXJpKTtcblx0XHRcdGlmICghbGF1bmNoIHx8IGxhdW5jaC5nZXRDb25maWd1cmF0aW9uTmFtZXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0bGF1bmNoID0gdGhpcy5sYXVuY2hlcy5maW5kKGwgPT4gISEobCAmJiBsLmdldENvbmZpZ3VyYXRpb25OYW1lcygpLmxlbmd0aCkpIHx8IGxhdW5jaCB8fCB0aGlzLmxhdW5jaGVzWzBdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzTGF1bmNoID0gdGhpcy5zZWxlY3RlZExhdW5jaDtcblx0XHRjb25zdCBwcmV2aW91c05hbWUgPSB0aGlzLnNlbGVjdGVkTmFtZTtcblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGVkRHluYW1pYyA9IHRoaXMuc2VsZWN0ZWREeW5hbWljO1xuXHRcdHRoaXMuc2VsZWN0ZWRMYXVuY2ggPSBsYXVuY2g7XG5cblx0XHRpZiAodGhpcy5zZWxlY3RlZExhdW5jaCkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShERUJVR19TRUxFQ1RFRF9ST09ULCB0aGlzLnNlbGVjdGVkTGF1bmNoLnVyaS50b1N0cmluZygpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShERUJVR19TRUxFQ1RFRF9ST09ULCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR9XG5cblx0XHRjb25zdCBuYW1lcyA9IGxhdW5jaCA/IGxhdW5jaC5nZXRDb25maWd1cmF0aW9uTmFtZXMoKSA6IFtdO1xuXHRcdHRoaXMuZ2V0U2VsZWN0ZWRDb25maWcgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3RlZCA9IHRoaXMuc2VsZWN0ZWROYW1lID8gbGF1bmNoPy5nZXRDb25maWd1cmF0aW9uKHRoaXMuc2VsZWN0ZWROYW1lKSA6IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoc2VsZWN0ZWQgfHwgY29uZmlnKTtcblx0XHR9O1xuXG5cdFx0bGV0IHR5cGUgPSBjb25maWc/LnR5cGU7XG5cdFx0aWYgKG5hbWUgJiYgbmFtZXMuaW5kZXhPZihuYW1lKSA+PSAwKSB7XG5cdFx0XHR0aGlzLnNldFNlbGVjdGVkTGF1bmNoTmFtZShuYW1lKTtcblx0XHR9IGVsc2UgaWYgKGR5bmFtaWNDb25maWcgJiYgZHluYW1pY0NvbmZpZy50eXBlKSB7XG5cdFx0XHQvLyBXZSBjb3VsZCBub3QgZmluZCB0aGUgcHJldmlvdXNseSB1c2VkIG5hbWUgYW5kIGNvbmZpZyBpcyBub3QgcGFzc2VkLiBXZSBzaG91bGQgZ2V0IGFsbCBkeW5hbWljIGNvbmZpZ3VyYXRpb25zIGZyb20gcHJvdmlkZXJzXG5cdFx0XHQvLyBBbmQgcG90ZW50aWFsbHkgYXV0byBzZWxlY3QgdGhlIHByZXZpb3VzbHkgdXNlZCBkeW5hbWljIGNvbmZpZ3VyYXRpb24gIzk2MjkzXG5cdFx0XHR0eXBlID0gZHluYW1pY0NvbmZpZy50eXBlO1xuXHRcdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJzID0gKGF3YWl0IHRoaXMuZ2V0RHluYW1pY1Byb3ZpZGVycygpKS5maWx0ZXIocCA9PiBwLnR5cGUgPT09IHR5cGUpO1xuXHRcdFx0XHR0aGlzLmdldFNlbGVjdGVkQ29uZmlnID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2YXRlZFByb3ZpZGVycyA9IGF3YWl0IFByb21pc2UuYWxsKHByb3ZpZGVycy5tYXAocCA9PiBwLmdldFByb3ZpZGVyKCkpKTtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlciA9IGFjdGl2YXRlZFByb3ZpZGVycy5sZW5ndGggPiAwID8gYWN0aXZhdGVkUHJvdmlkZXJzWzBdIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChwcm92aWRlciAmJiBsYXVuY2ggJiYgbGF1bmNoLndvcmtzcGFjZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9rZW4gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGR5bmFtaWNDb25maWdzID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMhKGxhdW5jaC53b3Jrc3BhY2UudXJpLCB0b2tlbi50b2tlbik7XG5cdFx0XHRcdFx0XHRjb25zdCBkeW5hbWljQ29uZmlnID0gZHluYW1pY0NvbmZpZ3MuZmluZChjID0+IGMubmFtZSA9PT0gbmFtZSk7XG5cdFx0XHRcdFx0XHRpZiAoZHluYW1pY0NvbmZpZykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZHluYW1pY0NvbmZpZztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZXRTZWxlY3RlZExhdW5jaE5hbWUobmFtZSk7XG5cblx0XHRcdGxldCByZWNlbnREeW5hbWljUHJvdmlkZXJzID0gdGhpcy5nZXRSZWNlbnREeW5hbWljQ29uZmlndXJhdGlvbnMoKTtcblx0XHRcdGlmIChuYW1lICYmIGR5bmFtaWNDb25maWcudHlwZSkge1xuXHRcdFx0XHQvLyBXZSBuZWVkIHRvIHN0b3JlIHRoZSByZWNlbnRseSB1c2VkIGR5bmFtaWMgY29uZmlndXJhdGlvbnMgdG8gYmUgYWJsZSB0byBzaG93IHRoZW0gaW4gVUkgIzExMDAwOVxuXHRcdFx0XHRyZWNlbnREeW5hbWljUHJvdmlkZXJzLnVuc2hpZnQoeyBuYW1lLCB0eXBlOiBkeW5hbWljQ29uZmlnLnR5cGUgfSk7XG5cdFx0XHRcdHJlY2VudER5bmFtaWNQcm92aWRlcnMgPSBkaXN0aW5jdChyZWNlbnREeW5hbWljUHJvdmlkZXJzLCB0ID0+IGAke3QubmFtZX0gOiAke3QudHlwZX1gKTtcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShERUJVR19SRUNFTlRfRFlOQU1JQ19DT05GSUdVUkFUSU9OUywgSlNPTi5zdHJpbmdpZnkocmVjZW50RHluYW1pY1Byb3ZpZGVycyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghdGhpcy5zZWxlY3RlZE5hbWUgfHwgbmFtZXMuaW5kZXhPZih0aGlzLnNlbGVjdGVkTmFtZSkgPT09IC0xKSB7XG5cdFx0XHQvLyBXZSBjb3VsZCBub3QgZmluZCB0aGUgY29uZmlndXJhdGlvbiB0byBzZWxlY3QsIHBpY2sgdGhlIGZpcnN0IG9uZSwgb3IgcmVzZXQgdGhlIHNlbGVjdGlvbiBpZiB0aGVyZSBpcyBubyBsYXVuY2ggY29uZmlndXJhdGlvblxuXHRcdFx0Y29uc3QgbmFtZVRvU2V0ID0gbmFtZXMubGVuZ3RoID8gbmFtZXNbMF0gOiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnNldFNlbGVjdGVkTGF1bmNoTmFtZShuYW1lVG9TZXQpO1xuXHRcdH1cblxuXHRcdGlmICghY29uZmlnICYmIGxhdW5jaCAmJiB0aGlzLnNlbGVjdGVkTmFtZSkge1xuXHRcdFx0Y29uZmlnID0gbGF1bmNoLmdldENvbmZpZ3VyYXRpb24odGhpcy5zZWxlY3RlZE5hbWUpO1xuXHRcdFx0dHlwZSA9IGNvbmZpZz8udHlwZTtcblx0XHR9XG5cblx0XHR0aGlzLnNlbGVjdGVkVHlwZSA9IGR5bmFtaWNDb25maWc/LnR5cGUgfHwgY29uZmlnPy50eXBlO1xuXHRcdHRoaXMuc2VsZWN0ZWREeW5hbWljID0gISFkeW5hbWljQ29uZmlnO1xuXHRcdC8vIE9ubHkgc3RvcmUgdGhlIHNlbGVjdGVkIHR5cGUgaWYgd2UgYXJlIGhhdmluZyBhIGR5bmFtaWMgY29uZmlndXJhdGlvbi4gT3RoZXJ3aXNlIHJlc3RvcmluZyB0aGlzIGNvbmZpZ3VyYXRpb24gZnJvbSBzdG9yYWdlIG1pZ2h0IGJlIG1pc2luZGVudGlmaWVkIGFzIGEgZHluYW1pYyBjb25maWd1cmF0aW9uXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShERUJVR19TRUxFQ1RFRF9UWVBFLCBkeW5hbWljQ29uZmlnID8gdGhpcy5zZWxlY3RlZFR5cGUgOiB1bmRlZmluZWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHRpZiAodHlwZSkge1xuXHRcdFx0dGhpcy5kZWJ1Z0NvbmZpZ3VyYXRpb25UeXBlQ29udGV4dC5zZXQodHlwZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGVidWdDb25maWd1cmF0aW9uVHlwZUNvbnRleHQucmVzZXQoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zZWxlY3RlZExhdW5jaCAhPT0gcHJldmlvdXNMYXVuY2ggfHwgdGhpcy5zZWxlY3RlZE5hbWUgIT09IHByZXZpb3VzTmFtZSB8fCBwcmV2aW91c1NlbGVjdGVkRHluYW1pYyAhPT0gdGhpcy5zZWxlY3RlZER5bmFtaWMpIHtcblx0XHRcdHRoaXMuX29uRGlkU2VsZWN0Q29uZmlndXJhdGlvbk5hbWUuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0U2VsZWN0ZWRMYXVuY2hOYW1lKHNlbGVjdGVkTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RlZE5hbWUgPSBzZWxlY3RlZE5hbWU7XG5cblx0XHRpZiAodGhpcy5zZWxlY3RlZE5hbWUpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoREVCVUdfU0VMRUNURURfQ09ORklHX05BTUVfS0VZLCB0aGlzLnNlbGVjdGVkTmFtZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoREVCVUdfU0VMRUNURURfQ09ORklHX05BTUVfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMudG9EaXNwb3NlID0gZGlzcG9zZSh0aGlzLnRvRGlzcG9zZSk7XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RMYXVuY2ggaW1wbGVtZW50cyBJTGF1bmNoIHtcblx0YWJzdHJhY3QgcmVhZG9ubHkgdXJpOiB1cmk7XG5cdGFic3RyYWN0IHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0YWJzdHJhY3QgcmVhZG9ubHkgd29ya3NwYWNlOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0Q29uZmlnKCk6IElHbG9iYWxDb25maWcgfCB1bmRlZmluZWQ7XG5cdGFic3RyYWN0IG9wZW5Db25maWdGaWxlKG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogYm9vbGVhbjsgdHlwZT86IHN0cmluZyB8IHVuZGVmaW5lZDsgc3VwcHJlc3NJbml0aWFsQ29uZmlncz86IGJvb2xlYW4gfCB1bmRlZmluZWQgfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8eyBlZGl0b3I6IElFZGl0b3JQYW5lIHwgbnVsbDsgY3JlYXRlZDogYm9vbGVhbiB9PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcm90ZWN0ZWQgY29uZmlndXJhdGlvbk1hbmFnZXI6IENvbmZpZ3VyYXRpb25NYW5hZ2VyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWRhcHRlck1hbmFnZXI6IElBZGFwdGVyTWFuYWdlclxuXHQpIHsgfVxuXG5cdGdldENvbXBvdW5kKG5hbWU6IHN0cmluZyk6IElDb21wb3VuZCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5nZXREZWR1cGxpY2F0ZWRDb25maWcoKTtcblx0XHRpZiAoIWNvbmZpZyB8fCAhY29uZmlnLmNvbXBvdW5kcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29uZmlnLmNvbXBvdW5kcy5maW5kKGNvbXBvdW5kID0+IGNvbXBvdW5kLm5hbWUgPT09IG5hbWUpO1xuXHR9XG5cblx0Z2V0Q29uZmlndXJhdGlvbk5hbWVzKGlnbm9yZUNvbXBvdW5kc0FuZFByZXNlbnRhdGlvbiA9IGZhbHNlKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuZ2V0RGVkdXBsaWNhdGVkQ29uZmlnKCk7XG5cdFx0aWYgKCFjb25maWcgfHwgKCFBcnJheS5pc0FycmF5KGNvbmZpZy5jb25maWd1cmF0aW9ucykgJiYgIUFycmF5LmlzQXJyYXkoY29uZmlnLmNvbXBvdW5kcykpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25zOiAoSUNvbmZpZyB8IElDb21wb3VuZClbXSA9IFtdO1xuXHRcdFx0aWYgKGNvbmZpZy5jb25maWd1cmF0aW9ucykge1xuXHRcdFx0XHRjb25maWd1cmF0aW9ucy5wdXNoKC4uLmNvbmZpZy5jb25maWd1cmF0aW9ucy5maWx0ZXIoY2ZnID0+IGNmZyAmJiB0eXBlb2YgY2ZnLm5hbWUgPT09ICdzdHJpbmcnKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpZ25vcmVDb21wb3VuZHNBbmRQcmVzZW50YXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25zLm1hcChjID0+IGMubmFtZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25maWcuY29tcG91bmRzKSB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25zLnB1c2goLi4uY29uZmlnLmNvbXBvdW5kcy5maWx0ZXIoY29tcG91bmQgPT4gdHlwZW9mIGNvbXBvdW5kLm5hbWUgPT09ICdzdHJpbmcnICYmIGNvbXBvdW5kLmNvbmZpZ3VyYXRpb25zICYmIGNvbXBvdW5kLmNvbmZpZ3VyYXRpb25zLmxlbmd0aCkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBjb25maWd1cmF0aW9ucy5tYXAoYyA9PiBpc0RlYnVnQ29uZmlnKGMpID8gZ2V0RWZmZWN0aXZlQ29uZmlnRm9yUGxhdGZvcm0oYywgdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5nZXRUYXJnZXRPcGVyYXRpbmdTeXN0ZW0oKSkgOiBjKTtcblx0XHRcdHJldHVybiBnZXRWaXNpYmxlQW5kU29ydGVkKHJlc29sdmVkKS5tYXAoYyA9PiBjLm5hbWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldENvbmZpZ3VyYXRpb24obmFtZTogc3RyaW5nKTogSUNvbmZpZyB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gV2UgbmVlZCB0byBjbG9uZSB0aGUgY29uZmlndXJhdGlvbiBpbiBvcmRlciB0byBiZSBhYmxlIHRvIG1ha2UgY2hhbmdlcyB0byBpdCAjNDIxOThcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLmdldERlZHVwbGljYXRlZENvbmZpZygpO1xuXHRcdGlmICghY29uZmlnIHx8ICFjb25maWcuY29uZmlndXJhdGlvbnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBjb25maWcuY29uZmlndXJhdGlvbnMuZmluZChjb25maWcgPT4gY29uZmlnICYmIGNvbmZpZy5uYW1lID09PSBuYW1lKTtcblx0XHRpZiAoIWNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZmZlY3RpdmVDb25maWd1cmF0aW9uID0gZ2V0RWZmZWN0aXZlQ29uZmlnRm9yUGxhdGZvcm0oY29uZmlndXJhdGlvbiwgdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5nZXRUYXJnZXRPcGVyYXRpbmdTeXN0ZW0oKSk7XG5cblx0XHRpZiAodGhpcyBpbnN0YW5jZW9mIFVzZXJMYXVuY2gpIHtcblx0XHRcdHJldHVybiB7IC4uLmVmZmVjdGl2ZUNvbmZpZ3VyYXRpb24sIF9fY29uZmlndXJhdGlvblRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSIH07XG5cdFx0fSBlbHNlIGlmICh0aGlzIGluc3RhbmNlb2YgV29ya3NwYWNlTGF1bmNoKSB7XG5cdFx0XHRyZXR1cm4geyAuLi5lZmZlY3RpdmVDb25maWd1cmF0aW9uLCBfX2NvbmZpZ3VyYXRpb25UYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7IC4uLmVmZmVjdGl2ZUNvbmZpZ3VyYXRpb24sIF9fY29uZmlndXJhdGlvblRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIH07XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0SW5pdGlhbENvbmZpZ3VyYXRpb25Db250ZW50KGZvbGRlclVyaT86IHVyaSwgdHlwZT86IHN0cmluZywgdXNlSW5pdGlhbENvbmZpZ3M/OiBib29sZWFuLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRsZXQgY29udGVudCA9ICcnO1xuXHRcdGNvbnN0IGFkYXB0ZXI6IFBhcnRpYWw8SUd1ZXNzZWREZWJ1Z2dlcj4gfCB1bmRlZmluZWQgPSB0eXBlXG5cdFx0XHQ/IHsgZGVidWdnZXI6IHRoaXMuYWRhcHRlck1hbmFnZXIuZ2V0RW5hYmxlZERlYnVnZ2VyKHR5cGUpIH1cblx0XHRcdDogYXdhaXQgdGhpcy5hZGFwdGVyTWFuYWdlci5ndWVzc0RlYnVnZ2VyKHRydWUpO1xuXG5cdFx0aWYgKGFkYXB0ZXI/LndpdGhDb25maWcgJiYgYWRhcHRlci5kZWJ1Z2dlcikge1xuXHRcdFx0Y29udGVudCA9IGF3YWl0IGFkYXB0ZXIuZGVidWdnZXIuZ2V0SW5pdGlhbENvbmZpZ3VyYXRpb25Db250ZW50KFthZGFwdGVyLndpdGhDb25maWcuY29uZmlnXSk7XG5cdFx0fSBlbHNlIGlmIChhZGFwdGVyPy5kZWJ1Z2dlcikge1xuXHRcdFx0Y29uc3QgaW5pdGlhbENvbmZpZ3MgPSB1c2VJbml0aWFsQ29uZmlncyA/XG5cdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIucHJvdmlkZURlYnVnQ29uZmlndXJhdGlvbnMoZm9sZGVyVXJpLCBhZGFwdGVyLmRlYnVnZ2VyLnR5cGUsIHRva2VuIHx8IENhbmNlbGxhdGlvblRva2VuLk5vbmUpIDpcblx0XHRcdFx0W107XG5cdFx0XHRjb250ZW50ID0gYXdhaXQgYWRhcHRlci5kZWJ1Z2dlci5nZXRJbml0aWFsQ29uZmlndXJhdGlvbkNvbnRlbnQoaW5pdGlhbENvbmZpZ3MpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb250ZW50O1xuXHR9XG5cblxuXHRnZXQgaGlkZGVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVkdXBsaWNhdGVkQ29uZmlnKCk6IElHbG9iYWxDb25maWcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gdGhpcy5nZXRDb25maWcoKTtcblx0XHRpZiAoIW9yaWdpbmFsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjb21wb3VuZHMgPSBvcmlnaW5hbC5jb21wb3VuZHM/LmZpbHRlcigoY29tcG91bmQpOiBjb21wb3VuZCBpcyBJQ29tcG91bmQgPT4gISFjb21wb3VuZCAmJiB0eXBlb2YgY29tcG91bmQubmFtZSA9PT0gJ3N0cmluZycpID8/IFtdO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25zID0gb3JpZ2luYWwuY29uZmlndXJhdGlvbnM/LmZpbHRlcigoY29uZmlndXJhdGlvbik6IGNvbmZpZ3VyYXRpb24gaXMgSUNvbmZpZyA9PiAhIWNvbmZpZ3VyYXRpb24gJiYgdHlwZW9mIGNvbmZpZ3VyYXRpb24ubmFtZSA9PT0gJ3N0cmluZycpID8/IFtdO1xuXHRcdHJldHVybiB7XG5cdFx0XHR2ZXJzaW9uOiBvcmlnaW5hbC52ZXJzaW9uLFxuXHRcdFx0Y29tcG91bmRzOiBkaXN0aW5ndWlzaENvbmZpZ3NCeU5hbWUoY29tcG91bmRzKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25zOiBkaXN0aW5ndWlzaENvbmZpZ3NCeU5hbWUoY29uZmlndXJhdGlvbnMpLFxuXHRcdH07XG5cdH1cbn1cblxuZnVuY3Rpb24gZGlzdGluZ3Vpc2hDb25maWdzQnlOYW1lPFQgZXh0ZW5kcyB7IG5hbWU6IHN0cmluZyB9Pih0aGluZ3M6IHJlYWRvbmx5IFRbXSk6IFRbXSB7XG5cdGNvbnN0IHNlZW4gPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRyZXR1cm4gdGhpbmdzLm1hcCh0aGluZyA9PiB7XG5cdFx0Y29uc3Qgbm8gPSBzZWVuLmdldCh0aGluZy5uYW1lKSB8fCAwO1xuXHRcdHNlZW4uc2V0KHRoaW5nLm5hbWUsIG5vICsgMSk7XG5cdFx0cmV0dXJuIG5vID09PSAwID8gdGhpbmcgOiB7IC4uLnRoaW5nLCBuYW1lOiBgJHt0aGluZy5uYW1lfSAoJHtub30pYCB9O1xuXHR9KTtcbn1cblxuY2xhc3MgTGF1bmNoIGV4dGVuZHMgQWJzdHJhY3RMYXVuY2ggaW1wbGVtZW50cyBJTGF1bmNoIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb25maWd1cmF0aW9uTWFuYWdlcjogQ29uZmlndXJhdGlvbk1hbmFnZXIsXG5cdFx0YWRhcHRlck1hbmFnZXI6IElBZGFwdGVyTWFuYWdlcixcblx0XHRwdWJsaWMgd29ya3NwYWNlOiBJV29ya3NwYWNlRm9sZGVyLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGNvbmZpZ3VyYXRpb25NYW5hZ2VyLCBhZGFwdGVyTWFuYWdlcik7XG5cdH1cblxuXHRnZXQgdXJpKCk6IHVyaSB7XG5cdFx0cmV0dXJuIHJlc291cmNlcy5qb2luUGF0aCh0aGlzLndvcmtzcGFjZS51cmksICcvLnZzY29kZS9sYXVuY2guanNvbicpO1xuXHR9XG5cblx0Z2V0IG5hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2UubmFtZTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDb25maWcoKTogSUdsb2JhbENvbmZpZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxJR2xvYmFsQ29uZmlnPignbGF1bmNoJywgeyByZXNvdXJjZTogdGhpcy53b3Jrc3BhY2UudXJpIH0pLndvcmtzcGFjZUZvbGRlclZhbHVlO1xuXHR9XG5cblx0YXN5bmMgb3BlbkNvbmZpZ0ZpbGUoeyBwcmVzZXJ2ZUZvY3VzLCB0eXBlLCBzdXBwcmVzc0luaXRpYWxDb25maWdzIH06IHsgcHJlc2VydmVGb2N1czogYm9vbGVhbjsgdHlwZT86IHN0cmluZzsgc3VwcHJlc3NJbml0aWFsQ29uZmlncz86IGJvb2xlYW4gfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBlZGl0b3I6IElFZGl0b3JQYW5lIHwgbnVsbDsgY3JlYXRlZDogYm9vbGVhbiB9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnVyaTtcblx0XHRsZXQgY3JlYXRlZCA9IGZhbHNlO1xuXHRcdGxldCBjb250ZW50ID0gJyc7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShyZXNvdXJjZSk7XG5cdFx0XHRjb250ZW50ID0gZmlsZUNvbnRlbnQudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGxhdW5jaC5qc29uIG5vdCBmb3VuZDogY3JlYXRlIG9uZSBieSBjb2xsZWN0aW5nIGxhdW5jaCBjb25maWdzIGZyb20gZGVidWdDb25maWdQcm92aWRlcnNcblx0XHRcdGNvbnRlbnQgPSBhd2FpdCB0aGlzLmdldEluaXRpYWxDb25maWd1cmF0aW9uQ29udGVudCh0aGlzLndvcmtzcGFjZS51cmksIHR5cGUsICFzdXBwcmVzc0luaXRpYWxDb25maWdzLCB0b2tlbik7XG5cdFx0XHRpZiAoIWNvbnRlbnQpIHtcblx0XHRcdFx0Ly8gQ2FuY2VsbGVkXG5cdFx0XHRcdHJldHVybiB7IGVkaXRvcjogbnVsbCwgY3JlYXRlZDogZmFsc2UgfTtcblx0XHRcdH1cblxuXHRcdFx0Y3JlYXRlZCA9IHRydWU7IC8vIHBpbiBvbmx5IGlmIGNvbmZpZyBmaWxlIGlzIGNyZWF0ZWQgIzg3Mjdcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLndyaXRlKHJlc291cmNlLCBjb250ZW50KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihubHMubG9jYWxpemUoJ0RlYnVnQ29uZmlnLmZhaWxlZCcsIFwiVW5hYmxlIHRvIGNyZWF0ZSAnbGF1bmNoLmpzb24nIGZpbGUgaW5zaWRlIHRoZSAnLnZzY29kZScgZm9sZGVyICh7MH0pLlwiLCBlcnJvci5tZXNzYWdlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSBjb250ZW50LmluZGV4T2YoYFwiJHt0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLnNlbGVjdGVkQ29uZmlndXJhdGlvbi5uYW1lfVwiYCk7XG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IDE7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbmRleDsgaSsrKSB7XG5cdFx0XHRpZiAoY29udGVudC5jaGFyQXQoaSkgPT09ICdcXG4nKSB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcisrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBzdGFydExpbmVOdW1iZXIgPiAxID8geyBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiA0IH0gOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0XHRwaW5uZWQ6IGNyZWF0ZWQsXG5cdFx0XHRcdHJldmVhbElmVmlzaWJsZTogdHJ1ZVxuXHRcdFx0fSxcblx0XHR9LCBBQ1RJVkVfR1JPVVApO1xuXG5cdFx0cmV0dXJuICh7XG5cdFx0XHRlZGl0b3I6IGVkaXRvciA/PyBudWxsLFxuXHRcdFx0Y3JlYXRlZFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgd3JpdGVDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb246IElDb25maWcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub3RlOiB3ZSBkb24ndCBnZXQgdGhlIGRlZHVwbGljYXRlZCBjb25maWcgc2luY2Ugd2UgZG9uJ3Qgd2FudCB0aGF0IHRvICdsZWFrJyBpbnRvIHRoZSBmaWxlXG5cdFx0Y29uc3QgZnVsbENvbmZpZzogUGFydGlhbDxJR2xvYmFsQ29uZmlnPiA9IHsgLi4uKHRoaXMuZ2V0Q29uZmlnKCkgPz8ge30pIH07XG5cdFx0ZnVsbENvbmZpZy5jb25maWd1cmF0aW9ucyA9IFsuLi5mdWxsQ29uZmlnLmNvbmZpZ3VyYXRpb25zIHx8IFtdLCBjb25maWd1cmF0aW9uXTtcblx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdsYXVuY2gnLCBmdWxsQ29uZmlnLCB7IHJlc291cmNlOiB0aGlzLndvcmtzcGFjZS51cmkgfSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKTtcblx0fVxufVxuXG5jbGFzcyBXb3Jrc3BhY2VMYXVuY2ggZXh0ZW5kcyBBYnN0cmFjdExhdW5jaCBpbXBsZW1lbnRzIElMYXVuY2gge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb25maWd1cmF0aW9uTWFuYWdlcjogQ29uZmlndXJhdGlvbk1hbmFnZXIsXG5cdFx0YWRhcHRlck1hbmFnZXI6IElBZGFwdGVyTWFuYWdlcixcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihjb25maWd1cmF0aW9uTWFuYWdlciwgYWRhcHRlck1hbmFnZXIpO1xuXHR9XG5cblx0Z2V0IHdvcmtzcGFjZSgpOiB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdXJpKCk6IHVyaSB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbiE7XG5cdH1cblxuXHRnZXQgbmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ3dvcmtzcGFjZScsIFwid29ya3NwYWNlXCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldENvbmZpZygpOiBJR2xvYmFsQ29uZmlnIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PElHbG9iYWxDb25maWc+KCdsYXVuY2gnKS53b3Jrc3BhY2VWYWx1ZTtcblx0fVxuXG5cdGFzeW5jIG9wZW5Db25maWdGaWxlKHsgcHJlc2VydmVGb2N1cywgdHlwZSwgdXNlSW5pdGlhbENvbmZpZ3MgfTogeyBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuOyB0eXBlPzogc3RyaW5nOyB1c2VJbml0aWFsQ29uZmlncz86IGJvb2xlYW4gfSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyBlZGl0b3I6IElFZGl0b3JQYW5lIHwgbnVsbDsgY3JlYXRlZDogYm9vbGVhbiB9PiB7XG5cdFx0Y29uc3QgbGF1bmNoRXhpc3RJbkZpbGUgPSAhIXRoaXMuZ2V0Q29uZmlnKCk7XG5cdFx0aWYgKCFsYXVuY2hFeGlzdEluRmlsZSkge1xuXHRcdFx0Ly8gTGF1bmNoIHByb3BlcnR5IGluIHdvcmtzcGFjZSBjb25maWcgbm90IGZvdW5kOiBjcmVhdGUgb25lIGJ5IGNvbGxlY3RpbmcgbGF1bmNoIGNvbmZpZ3MgZnJvbSBkZWJ1Z0NvbmZpZ1Byb3ZpZGVyc1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZ2V0SW5pdGlhbENvbmZpZ3VyYXRpb25Db250ZW50KHVuZGVmaW5lZCwgdHlwZSwgdXNlSW5pdGlhbENvbmZpZ3MsIHRva2VuKTtcblx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2xhdW5jaCcsIGpzb24ucGFyc2UoY29udGVudCksIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7IGVkaXRvcjogbnVsbCwgY3JlYXRlZDogZmFsc2UgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3IgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uISxcblx0XHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1cyB9XG5cdFx0fSwgQUNUSVZFX0dST1VQKTtcblxuXHRcdHJldHVybiAoe1xuXHRcdFx0ZWRpdG9yOiBlZGl0b3IgPz8gbnVsbCxcblx0XHRcdGNyZWF0ZWQ6IGZhbHNlXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgVXNlckxhdW5jaCBleHRlbmRzIEFic3RyYWN0TGF1bmNoIGltcGxlbWVudHMgSUxhdW5jaCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29uZmlndXJhdGlvbk1hbmFnZXI6IENvbmZpZ3VyYXRpb25NYW5hZ2VyLFxuXHRcdGFkYXB0ZXJNYW5hZ2VyOiBJQWRhcHRlck1hbmFnZXIsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoY29uZmlndXJhdGlvbk1hbmFnZXIsIGFkYXB0ZXJNYW5hZ2VyKTtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2UoKTogdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0IHVyaSgpOiB1cmkge1xuXHRcdHJldHVybiB0aGlzLnByZWZlcmVuY2VzU2VydmljZS51c2VyU2V0dGluZ3NSZXNvdXJjZTtcblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndXNlciBzZXR0aW5ncycsIFwidXNlciBzZXR0aW5nc1wiKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBoaWRkZW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Q29uZmlnKCk6IElHbG9iYWxDb25maWcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8SUdsb2JhbENvbmZpZz4oJ2xhdW5jaCcpLnVzZXJWYWx1ZTtcblx0fVxuXG5cdGFzeW5jIG9wZW5Db25maWdGaWxlKHsgcHJlc2VydmVGb2N1cywgdHlwZSwgdXNlSW5pdGlhbENvbnRlbnQgfTogeyBwcmVzZXJ2ZUZvY3VzOiBib29sZWFuOyB0eXBlPzogc3RyaW5nOyB1c2VJbml0aWFsQ29udGVudD86IGJvb2xlYW4gfSk6IFByb21pc2U8eyBlZGl0b3I6IElFZGl0b3JQYW5lIHwgbnVsbDsgY3JlYXRlZDogYm9vbGVhbiB9PiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyh7IGpzb25FZGl0b3I6IHRydWUsIHByZXNlcnZlRm9jdXMsIHJldmVhbFNldHRpbmc6IHsga2V5OiAnbGF1bmNoJyB9IH0pO1xuXHRcdHJldHVybiAoe1xuXHRcdFx0ZWRpdG9yOiBlZGl0b3IgPz8gbnVsbCxcblx0XHRcdGNyZWF0ZWQ6IGZhbHNlXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsK0JBQStC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
