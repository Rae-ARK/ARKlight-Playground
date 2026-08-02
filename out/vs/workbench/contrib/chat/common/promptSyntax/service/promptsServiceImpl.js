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
import { CancellationToken, CancellationTokenPool } from "../../../../../../base/common/cancellation.js";
import { CancellationError, isCancellationError } from "../../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { parse as parseJSONC } from "../../../../../../base/common/json.js";
import { getParseErrorMessage } from "../../../../../../base/common/jsonErrorMessages.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { StopWatch } from "../../../../../../base/common/stopwatch.js";
import { autorun, observableFromEvent } from "../../../../../../base/common/observable.js";
import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { basename, dirname, isEqual, joinPath } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { OffsetRange } from "../../../../../../editor/common/core/ranges/offsetRange.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IUserDataProfileService } from "../../../../../services/userDataProfile/common/userDataProfile.js";
import { PromptsConfig } from "../config/config.js";
import { AGENT_MD_FILENAME, CLAUDE_CONFIG_FOLDER, CLAUDE_LOCAL_MD_FILENAME, CLAUDE_MD_FILENAME, COPILOT_CONFIG_FOLDER, COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, DICTATION_INSTRUCTIONS_FILENAME, getCleanPromptName, getSkillFolderName, GITHUB_CONFIG_FOLDER, isInClaudeRulesFolder, VOICE_INSTRUCTIONS_FILENAME } from "../config/promptFileLocations.js";
import { PROMPT_LANGUAGE_ID, PromptFileSource, PromptsType, Target, getPromptsTypeForLanguageId } from "../promptTypes.js";
import { PromptFilesLocator } from "../utils/promptFilesLocator.js";
import { evaluateApplyToPattern, PromptFileParser, PromptHeaderAttributes } from "../promptFileParser.js";
import { IAgentSource, PromptsStorage, AgentInstructionFileType, matchesSessionType } from "./promptsService.js";
import { Delayer, raceCancellationError } from "../../../../../../base/common/async.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { parseSubagentHooksFromYaml } from "../hookSchema.js";
import { HookSourceFormat, parseHooksFromFile } from "../hookCompatibility.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { getTarget, mapClaudeModels, mapClaudeTools } from "../languageProviders/promptFileAttributes.js";
import { getCanonicalPluginCommandId, IAgentPluginService } from "../../plugins/agentPluginService.js";
import { isContributionEnabled } from "../../enablement.js";
import { assertNever } from "../../../../../../base/common/assert.js";
import { ExtensionPromptFileService } from "./extensionPromptFileService.js";
import { COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG, COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG } from "../../../../../../platform/policy/common/copilotManagedSettings.js";
import { isPromptTypeBlocked } from "../../customizationLockdown.js";
import { isAgentPluginForceEnabledByPolicy } from "../../plugins/agentPluginEnablement.js";
import { ChatConfiguration } from "../../constants.js";
let PromptsService = class extends Disposable {
  constructor(logger, labelService, modelService, instantiationService, userDataService, configurationService, fileService, storageService, telemetryService, workspaceService, pathService, agentPluginService, workspaceTrustService) {
    super();
    this.logger = logger;
    this.labelService = labelService;
    this.modelService = modelService;
    this.instantiationService = instantiationService;
    this.userDataService = userDataService;
    this.configurationService = configurationService;
    this.fileService = fileService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.workspaceService = workspaceService;
    this.pathService = pathService;
    this.agentPluginService = agentPluginService;
    this.workspaceTrustService = workspaceTrustService;
    this.agentInstructionsWatcher = this._register(new MutableDisposable());
    this._onDidChangeAgentInstructions = this._register(new Emitter({
      onWillAddFirstListener: () => {
        const store = new DisposableStore();
        const agentInstructionsUpdatedEvent = this.fileLocator.createAgentInstructionsUpdatedEvent();
        store.add(agentInstructionsUpdatedEvent);
        store.add(agentInstructionsUpdatedEvent.event(() => this._onDidChangeAgentInstructions.fire()));
        this.agentInstructionsWatcher.value = store;
      },
      onDidRemoveLastListener: () => {
        this.agentInstructionsWatcher.clear();
      }
    }));
    /**
     * Synchronous mirror of the names exposed by {@link getPromptSlashCommands},
     * maintained for {@link hasPromptSlashCommand} so callers (e.g. the chat request
     * parser) can disambiguate `<cmd>:<sub>` vs bare `<cmd>` without an async hop.
     */
    this.knownPromptSlashCommandNames = /* @__PURE__ */ new Set();
    /**
     * Cache for parsed prompt files keyed by URI.
     * The number in the returned tuple is textModel.getVersionId(), which is an internal VS Code counter that increments every time the text model's content changes.
     */
    this.cachedParsedPromptFromModels = new ResourceMap();
    /**
     * Cached file locations commands. Caching only happens if the corresponding `fileLocatorEvents` event is used.
     */
    this.cachedFileLocations = {};
    /**
     * Lazily created events that notify listeners when the file locations for a given prompt type change.
     * An event is created on demand for each prompt type and can be used by consumers to react to updates
     * in the set of prompt files (e.g., when prompt files are added, removed, or modified).
     */
    this.fileLocatorEvents = {};
    this._onDidPluginPromptFilesChange = this._register(new Emitter());
    this._onDidPluginHooksChange = this._register(new Emitter());
    this._pluginPromptFilesByType = /* @__PURE__ */ new Map();
    this.knownPromptSlashCommandsHydrationStarted = false;
    // --- Enabled Prompt Files -----------------------------------------------------------
    this.disabledPromptsStorageKeyPrefix = "chat.disabledPromptFiles.";
    this.fileLocator = this.createPromptFilesLocator();
    this._register(this.modelService.onModelRemoved((model) => {
      this.cachedParsedPromptFromModels.delete(model.uri);
    }));
    this.extensionPromptFiles = this._register(this.instantiationService.createInstance(ExtensionPromptFileService));
    const onDidChangeExtensionPromptFiles = this.extensionPromptFiles.onDidChange;
    const onDidChangeCustomizationLockdown = Event.filter(
      this.configurationService.onDidChangeConfiguration,
      (e) => e.affectsConfiguration(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG) || e.affectsConfiguration(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG)
    );
    this._register(onDidChangeCustomizationLockdown(() => {
      this.cachedFileLocations[PromptsType.agent] = void 0;
      this.cachedFileLocations[PromptsType.skill] = void 0;
      this.cachedFileLocations[PromptsType.hook] = void 0;
      this.cachedFileLocations[PromptsType.instructions] = void 0;
      this._onDidChangeAgentInstructions.fire();
    }));
    this._register(onDidChangeExtensionPromptFiles((e) => {
      this.cachedFileLocations[e.type] = void 0;
    }));
    const modelChangeEvent = this._register(new ModelChangeTracker(this.modelService)).onDidPromptChange;
    this.cachedCustomAgents = this._register(new CachedPromise(
      (token) => this.computeAgentDiscoveryInfo(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.agent),
        Event.filter(modelChangeEvent, (e) => e.promptType === PromptsType.agent),
        Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(PromptsConfig.USE_CHAT_HOOKS)),
        Event.filter(onDidChangeExtensionPromptFiles, (e) => e.type === PromptsType.agent),
        Event.filter(this._onDidPluginPromptFilesChange.event, (t) => t === PromptsType.agent),
        onDidChangeCustomizationLockdown,
        this.workspaceTrustService.onDidChangeTrust
      )
    ));
    this.cachedSlashCommands = this._register(new CachedPromise(
      (token) => this.computeSlashCommandDiscoveryInfo(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.prompt),
        this.getFileLocatorEvent(PromptsType.skill),
        Event.filter(modelChangeEvent, (e) => e.promptType === PromptsType.prompt),
        Event.filter(modelChangeEvent, (e) => e.promptType === PromptsType.skill),
        Event.filter(onDidChangeExtensionPromptFiles, (e) => e.type === PromptsType.prompt || e.type === PromptsType.skill),
        Event.filter(this._onDidPluginPromptFilesChange.event, (t) => t === PromptsType.prompt || t === PromptsType.skill),
        onDidChangeCustomizationLockdown
      )
    ));
    this.cachedSkills = this._register(new CachedPromise(
      (token) => this.computeSkillDiscovery(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.skill),
        Event.filter(modelChangeEvent, (e) => e.promptType === PromptsType.skill),
        Event.filter(onDidChangeExtensionPromptFiles, (e) => e.type === PromptsType.skill),
        Event.filter(this._onDidPluginPromptFilesChange.event, (t) => t === PromptsType.skill),
        onDidChangeCustomizationLockdown
      )
    ));
    this.cachedHooks = this._register(new CachedPromise(
      (token) => this.computeHooks(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.hook),
        Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(PromptsConfig.USE_CHAT_HOOKS) || e.affectsConfiguration(PromptsConfig.USE_CLAUDE_HOOKS)),
        onDidChangeCustomizationLockdown,
        this._onDidPluginHooksChange.event,
        this.workspaceTrustService.onDidChangeTrust
      )
    ));
    this.cachedInstructions = this._register(new CachedPromise(
      (token) => this.computeInstructionFiles(token),
      () => Event.any(
        this.getFileLocatorEvent(PromptsType.instructions),
        Event.filter(onDidChangeExtensionPromptFiles, (e) => e.type === PromptsType.instructions),
        Event.filter(this._onDidPluginPromptFilesChange.event, (t) => t === PromptsType.instructions),
        onDidChangeCustomizationLockdown
      )
    ));
    this._register(this.watchPluginPromptFilesForType(
      PromptsType.prompt,
      (plugin, reader) => plugin.commands.read(reader)
    ));
    this._register(this.watchPluginPromptFilesForType(
      PromptsType.skill,
      (plugin, reader) => plugin.skills.read(reader)
    ));
    this._register(this.watchPluginPromptFilesForType(
      PromptsType.agent,
      (plugin, reader) => plugin.agents.read(reader)
    ));
    this._register(this.watchPluginPromptFilesForType(
      PromptsType.instructions,
      (plugin, reader) => plugin.instructions.read(reader)
    ));
    const managedHooksOnly = observableFromEvent(
      this,
      onDidChangeCustomizationLockdown,
      () => this.configurationService.getValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true
    );
    const enabledPluginsPolicy = observableFromEvent(
      this,
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.EnabledPlugins)),
      () => this.configurationService.inspect(ChatConfiguration.EnabledPlugins).policyValue
    );
    this._register(autorun((reader) => {
      const plugins = this.agentPluginService.plugins.read(reader);
      const managedHooksOnlyValue = managedHooksOnly.read(reader);
      const enabledPluginsPolicyValue = enabledPluginsPolicy.read(reader);
      const hookFiles = [];
      for (const plugin of plugins) {
        if (isContributionEnabled(plugin.enablement.read(reader)) && (!managedHooksOnlyValue || isAgentPluginForceEnabledByPolicy(plugin, enabledPluginsPolicyValue))) {
          for (const hook of plugin.hooks.read(reader)) {
            hookFiles.push({
              uri: hook.uri,
              storage: PromptsStorage.plugin,
              type: PromptsType.hook,
              name: getCanonicalPluginCommandId(plugin, hook.originalId),
              pluginUri: plugin.uri,
              pluginLabel: plugin.label,
              source: PromptFileSource.Plugin
            });
          }
        }
      }
      this._pluginPromptFilesByType.set(PromptsType.hook, hookFiles);
      this.cachedFileLocations[PromptsType.hook] = void 0;
      this._onDidPluginHooksChange.fire();
    }));
  }
  watchPluginPromptFilesForType(type, getItems) {
    return autorun((reader) => {
      const plugins = this.agentPluginService.plugins.read(reader);
      const nextFiles = [];
      for (const plugin of plugins) {
        if (!isContributionEnabled(plugin.enablement.read(reader))) {
          continue;
        }
        for (const item of getItems(plugin, reader)) {
          nextFiles.push({
            uri: item.uri,
            storage: PromptsStorage.plugin,
            type,
            name: getCanonicalPluginCommandId(plugin, item.name),
            pluginUri: plugin.uri,
            pluginLabel: plugin.label,
            source: PromptFileSource.Plugin
          });
        }
      }
      nextFiles.sort((a, b) => `${a.name ?? ""}|${a.uri.toString()}`.localeCompare(`${b.name ?? ""}|${b.uri.toString()}`));
      this._pluginPromptFilesByType.set(type, nextFiles);
      this.cachedFileLocations[type] = void 0;
      this._onDidPluginPromptFilesChange.fire(type);
    });
  }
  createPromptFilesLocator() {
    return this.instantiationService.createInstance(PromptFilesLocator);
  }
  getFileLocatorEvent(type) {
    let event = this.fileLocatorEvents[type];
    if (!event) {
      event = this.fileLocatorEvents[type] = this._register(this.fileLocator.createFilesUpdatedEvent(type)).event;
      this._register(event(() => {
        this.cachedFileLocations[type] = void 0;
      }));
    }
    return event;
  }
  getParsedPromptFile(textModel) {
    const cached = this.cachedParsedPromptFromModels.get(textModel.uri);
    if (cached && cached[0] === textModel.getVersionId()) {
      return cached[1];
    }
    const ast = new PromptFileParser().parse(textModel.uri, textModel.getValue());
    if (!cached || cached[0] < textModel.getVersionId()) {
      this.cachedParsedPromptFromModels.set(textModel.uri, [textModel.getVersionId(), ast]);
    }
    return ast;
  }
  async listPromptFiles(type, token) {
    let listPromise = this.cachedFileLocations[type];
    if (!listPromise) {
      listPromise = this.computeListPromptFiles(type, token);
      if (!this.fileLocatorEvents[type]) {
        return listPromise;
      }
      this.cachedFileLocations[type] = listPromise;
      return listPromise;
    }
    return listPromise;
  }
  async computeListPromptFiles(type, token) {
    const allowStandalone = !this.areStandalonePromptFilesBlocked(type);
    const prompts = await Promise.all([
      allowStandalone ? this.fileLocator.listFiles(type, PromptsStorage.user, token).then((uris) => uris.map((uri) => ({ uri, storage: PromptsStorage.user, type }))) : [],
      allowStandalone ? this.fileLocator.listFiles(type, PromptsStorage.local, token).then((uris) => uris.map((uri) => ({ uri, storage: PromptsStorage.local, type }))) : [],
      this.getExtensionPromptFiles(type, token),
      this._pluginPromptFilesByType.get(type) ?? [],
      this.getBuiltinPromptFiles(type, token)
    ]);
    return prompts.flat();
  }
  /**
   * Collects diagnostic information about which source folders were searched for display in the debug panel.
   */
  async _collectSourceFolderDiagnostics(type) {
    if (this.areStandalonePromptFilesBlocked(type)) {
      return [];
    }
    const resolvedFolders = await this.fileLocator.getSourceFoldersInDiscoveryOrder(type);
    return resolvedFolders.map((folder) => ({
      uri: folder.uri,
      storage: folder.storage
    }));
  }
  /**
   * Registers a prompt file provider (CustomAgentProvider, InstructionsProvider, or PromptFileProvider).
   * This will be called by the extension host bridge when
   * an extension registers a provider via vscode.chat.registerCustomAgentProvider(),
   * registerInstructionsProvider(), or registerPromptFileProvider().
   */
  registerPromptFileProvider(extension, type, provider) {
    return this.extensionPromptFiles.registerPromptFileProvider(extension, type, provider);
  }
  async listPromptFilesForStorage(type, storage, token) {
    let promptPaths;
    switch (storage) {
      case PromptsStorage.extension:
        promptPaths = await this.getExtensionPromptFiles(type, token);
        break;
      case PromptsStorage.local:
        promptPaths = this.areStandalonePromptFilesBlocked(type) ? [] : await this.fileLocator.listFiles(type, PromptsStorage.local, token).then((uris) => uris.map((uri) => ({ uri, storage: PromptsStorage.local, type })));
        break;
      case PromptsStorage.user:
        promptPaths = this.areStandalonePromptFilesBlocked(type) ? [] : await this.fileLocator.listFiles(type, PromptsStorage.user, token).then((uris) => uris.map((uri) => ({ uri, storage: PromptsStorage.user, type })));
        break;
      case PromptsStorage.plugin:
        promptPaths = this._pluginPromptFilesByType.get(type) ?? [];
        break;
      case PromptsStorage.builtIn:
        promptPaths = await this.getBuiltinPromptFiles(type, token);
        break;
      default:
        throw new Error(`[listPromptFilesForStorage] Unsupported prompt storage type: ${storage}`);
    }
    return promptPaths;
  }
  getExtensionPromptFiles(type, token) {
    return this.extensionPromptFiles.getExtensionPromptFiles(type, token);
  }
  /**
   * Returns the built-in prompt files of the given type. The base service ships
   * no built-in prompts; subclasses (e.g. the Agents app) override this to
   * contribute bundled prompts such as built-in skills.
   */
  async getBuiltinPromptFiles(type, token) {
    return [];
  }
  async getSourceFolders(type) {
    if (this.areStandalonePromptFilesBlocked(type)) {
      return [];
    }
    const result = [];
    if (type === PromptsType.hook) {
      const hooksFolders = await this.fileLocator.getHookSourceFolders();
      for (const folder of hooksFolders) {
        result.push({ uri: folder.uri, storage: folder.storage, type, source: folder.source });
      }
      return result;
    }
    if (type === PromptsType.skill) {
      const resolvedFolders = await this.fileLocator.getResolvedSourceFolders(type);
      for (const folder of resolvedFolders) {
        result.push({ uri: folder.searchRoot, storage: folder.storage, type, source: folder.source });
      }
      return result;
    }
    for (const uri of await this.fileLocator.getConfigBasedSourceFolders(type)) {
      result.push({ uri, storage: PromptsStorage.local, type });
    }
    const userHome = this.userDataService.currentProfile.promptsHome;
    result.push({ uri: userHome, storage: PromptsStorage.user, type });
    return result;
  }
  async getResolvedSourceFolders(type) {
    if (this.areStandalonePromptFilesBlocked(type)) {
      return [];
    }
    return this.fileLocator.getResolvedSourceFolders(type);
  }
  areStandalonePromptFilesBlocked(type) {
    const strictPluginOnly = this.configurationService.getValue(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
    return isPromptTypeBlocked(strictPluginOnly, type) || type === PromptsType.hook && this.configurationService.getValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true;
  }
  areAgentHooksAllowed(promptPath) {
    if (this.configurationService.getValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true) {
      if (promptPath.storage !== PromptsStorage.plugin || !promptPath.pluginUri) {
        return false;
      }
      const plugin = this.agentPluginService.plugins.get().find((candidate) => isEqual(candidate.uri, promptPath.pluginUri));
      const enabledPluginsPolicy = this.configurationService.inspect(ChatConfiguration.EnabledPlugins).policyValue;
      return plugin !== void 0 && isAgentPluginForceEnabledByPolicy(plugin, enabledPluginsPolicy);
    }
    const strictPluginOnly = this.configurationService.getValue(COPILOT_STRICT_PLUGIN_ONLY_CUSTOMIZATION_CONFIG);
    return !isPromptTypeBlocked(strictPluginOnly, PromptsType.hook) || promptPath.storage !== PromptsStorage.local && promptPath.storage !== PromptsStorage.user;
  }
  // slash prompt commands
  /**
   * Emitter for slash commands change events.
   */
  get onDidChangeSlashCommands() {
    return this.cachedSlashCommands.onDidChangePromise;
  }
  async getPromptSlashCommands(token) {
    const discoveryInfo = await this.cachedSlashCommands.get(token);
    const result = this.slashCommandsFromDiscoveryInfo(discoveryInfo);
    return result;
  }
  /**
   * Computes discovery info for slash commands, combining prompts and skills.
   */
  async computeSlashCommandDiscoveryInfo(token) {
    const stopWatch = StopWatch.create(true);
    const promptFiles = await this.listPromptFiles(PromptsType.prompt, token);
    const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
    const skills = useAgentSkills ? await this.listPromptFiles(PromptsType.skill, token) : [];
    const disabledSkills = this.getDisabledPromptFiles(PromptsType.skill);
    const enabledSkills = skills.filter((s) => !disabledSkills.has(s.uri)).sort((a, b) => this.getSkillPriority(a) - this.getSkillPriority(b));
    const slashCommandFiles = [
      ...promptFiles,
      ...enabledSkills
    ];
    const parseResults = await Promise.all(slashCommandFiles.map(async (promptPath) => {
      try {
        const parsedPromptFile = await this.parseNew(promptPath.uri, token);
        let rawName;
        if (promptPath.type === PromptsType.skill) {
          rawName = getSkillFolderName(promptPath.uri);
        } else {
          rawName = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(promptPath.uri);
        }
        const name = promptPath.source === PromptFileSource.Plugin && promptPath.pluginUri ? getCanonicalPluginCommandId({ uri: promptPath.pluginUri, label: promptPath.pluginLabel }, rawName) : rawName;
        const description = parsedPromptFile?.header?.description ?? promptPath.description;
        const argumentHint = parsedPromptFile?.header?.argumentHint;
        const userInvocable = parsedPromptFile?.header?.userInvocable;
        return { status: "loaded", promptPath: this.withPromptPathMetadata(promptPath, name, description), argumentHint, userInvocable };
      } catch (e) {
        this.logger.error(`[computeSlashCommandDiscoveryInfo] Failed to parse prompt file for slash command: ${promptPath.uri}`, e instanceof Error ? e.message : String(e));
        return { status: "skipped", skipReason: "parse-error", errorMessage: e instanceof Error ? e.message : String(e), promptPath };
      }
    }));
    const seenSkillNames = /* @__PURE__ */ new Set();
    const files = [];
    for (const result of parseResults) {
      if (result.status === "loaded" && result.promptPath.type === PromptsType.skill) {
        const name = result.promptPath.name;
        if (name !== void 0) {
          if (seenSkillNames.has(name)) {
            files.push({ status: "skipped", skipReason: "duplicate-name", promptPath: result.promptPath });
            continue;
          }
          seenSkillNames.add(name);
        }
      }
      files.push(result);
    }
    const promptSourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.prompt);
    const sourceFolders = [...promptSourceFolders];
    if (useAgentSkills) {
      const skillSourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.skill);
      sourceFolders.push(...skillSourceFolders);
    }
    return { type: PromptsType.prompt, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
  }
  /**
   * Derives IChatPromptSlashCommand[] from cached discovery info.
   */
  slashCommandsFromDiscoveryInfo(discoveryInfo) {
    const result = [];
    const seen = new ResourceSet();
    for (const file of discoveryInfo.files) {
      if (file.status === "loaded") {
        result.push(this.asChatPromptSlashCommand(file.argumentHint, file.userInvocable, file.promptPath));
        seen.add(file.promptPath.uri);
      }
    }
    for (const model of this.modelService.getModels()) {
      if (model.getLanguageId() === PROMPT_LANGUAGE_ID && model.uri.scheme === Schemas.untitled && !seen.has(model.uri)) {
        const parsedPromptFile = this.getParsedPromptFile(model);
        const name = parsedPromptFile?.header?.name ?? getCleanPromptName(model.uri);
        const description = parsedPromptFile?.header?.description;
        result.push(this.asChatPromptSlashCommand(parsedPromptFile?.header?.argumentHint, parsedPromptFile?.header?.userInvocable, { uri: model.uri, storage: PromptsStorage.local, type: PromptsType.prompt, name, description }));
      }
    }
    return result;
  }
  isValidSlashCommandName(command) {
    return command.match(/^[\p{L}\d_\-\.:]+$/u) !== null;
  }
  hasPromptSlashCommand(name) {
    if (!this.knownPromptSlashCommandsHydrationStarted) {
      this.knownPromptSlashCommandsHydrationStarted = true;
      this.refreshKnownPromptSlashCommandNames();
      this._register(this.onDidChangeSlashCommands(() => this.refreshKnownPromptSlashCommandNames()));
    }
    return this.knownPromptSlashCommandNames.has(name);
  }
  refreshKnownPromptSlashCommandNames() {
    this.getPromptSlashCommands(CancellationToken.None).then((commands) => {
      this.knownPromptSlashCommandNames.clear();
      for (const cmd of commands) {
        this.knownPromptSlashCommandNames.add(cmd.name);
      }
    }, () => {
    });
  }
  async resolvePromptSlashCommand(name, sessionType, token) {
    const commands = await this.getPromptSlashCommands(token);
    const command = commands.find((cmd) => cmd.name === name && matchesSessionType(cmd.sessionTypes, sessionType));
    if (command) {
      return {
        ...command,
        parsedPromptFile: await this.parseNew(command.uri, token)
      };
    }
    return void 0;
  }
  asChatPromptSlashCommand(argumentHint, userInvocable, promptPath) {
    let name = promptPath.name ?? getCleanPromptName(promptPath.uri);
    name = name.replace(/[^\p{L}\d_\-\.:]+/gu, "-");
    return {
      uri: promptPath.uri,
      name,
      source: promptPath.source,
      storage: promptPath.storage,
      type: promptPath.type,
      extension: promptPath.extension,
      pluginUri: promptPath.pluginUri,
      pluginLabel: promptPath.pluginLabel,
      description: promptPath.description,
      argumentHint,
      userInvocable: userInvocable ?? true,
      sessionTypes: promptPath.sessionTypes
    };
  }
  async getPromptSlashCommandName(uri, token) {
    const slashCommands = await this.getPromptSlashCommands(token);
    const slashCommand = slashCommands.find((c) => isEqual(c.uri, uri));
    if (!slashCommand) {
      return getCleanPromptName(uri);
    }
    return slashCommand.name;
  }
  // custom agents
  /**
   * Emitter for custom agents change events.
   */
  get onDidChangeCustomAgents() {
    return this.cachedCustomAgents.onDidChangePromise;
  }
  get onDidChangeInstructions() {
    return this.cachedInstructions.onDidChangePromise;
  }
  get onDidChangeAgentInstructions() {
    return this._onDidChangeAgentInstructions.event;
  }
  async getCustomAgents(token) {
    const discoveryInfo = await this.cachedCustomAgents.get(token);
    const result = this.agentsFromDiscoveryInfo(discoveryInfo);
    return result;
  }
  /**
   * Derives ICustomAgent[] from cached discovery info.
   */
  agentsFromDiscoveryInfo(discoveryInfo) {
    const result = [];
    for (const file of discoveryInfo.files) {
      if (file.agent) {
        result.push(file.agent);
      }
    }
    return result;
  }
  async computeAgentDiscoveryInfo(token) {
    const stopWatch = StopWatch.create(true);
    const allAgentFiles = await this.listPromptFiles(PromptsType.agent, token);
    const disabledAgents = this.getDisabledPromptFiles(PromptsType.agent);
    const useChatHooks = this.configurationService.getValue(PromptsConfig.USE_CHAT_HOOKS);
    const isWorkspaceTrusted = this.workspaceTrustService.isWorkspaceTrusted();
    const userHomeUri = await this.pathService.userHome();
    const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
    const defaultFolder = this.workspaceService.getWorkspace().folders[0];
    const files = await Promise.all(allAgentFiles.map(async (promptPath) => {
      const uri = promptPath.uri;
      const isEnabled = !disabledAgents.has(uri);
      try {
        const ast = await this.parseNew(uri, token);
        let hooks;
        const hooksRaw = ast.header?.hooksRaw;
        if (useChatHooks && isWorkspaceTrusted && hooksRaw && this.areAgentHooksAllowed(promptPath)) {
          const hookWorkspaceFolder = this.workspaceService.getWorkspaceFolder(uri) ?? defaultFolder;
          const workspaceRootUri = hookWorkspaceFolder?.uri;
          const target = getTarget(PromptsType.agent, ast.header ?? promptPath.uri);
          hooks = parseSubagentHooksFromYaml(hooksRaw, workspaceRootUri, userHome, target);
        }
        const extra = {
          sessionTypes: promptPath.sessionTypes,
          hooks,
          name: promptPath.name,
          description: promptPath.description,
          source: IAgentSource.fromPromptPath(promptPath),
          enabled: isEnabled
        };
        const agent = CustomAgent.fromParsedPromptFile(ast, extra);
        const status = isEnabled ? "loaded" : "skipped";
        const skipReason = isEnabled ? void 0 : "disabled";
        return { status, skipReason, promptPath: this.withPromptPathMetadata(promptPath, agent.name, agent.description), agent };
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
          this.logger.warn(`[computeAgentDiscoveryInfo] Skipping agent file that does not exist: ${uri}`, error.message);
        } else if (!isCancellationError(e)) {
          this.logger.error(`[computeAgentDiscoveryInfo] Failed to parse agent file: ${uri}`, error);
        }
        return {
          status: "skipped",
          skipReason: "parse-error",
          errorMessage: error.message,
          promptPath
        };
      }
    }));
    const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.agent);
    return { type: PromptsType.agent, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
  }
  async parseNew(uri, token) {
    const model = this.modelService.getModel(uri);
    if (model) {
      return this.getParsedPromptFile(model);
    }
    const fileContent = await this.fileService.readFile(uri);
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    return new PromptFileParser().parse(uri, fileContent.value.toString());
  }
  registerContributedFile(type, uri, extension, name, description, when, sessionTypes) {
    return this.extensionPromptFiles.registerContributedFile(type, uri, extension, name, description, when, sessionTypes);
  }
  getPromptLocationLabel(promptPath) {
    switch (promptPath.storage) {
      case PromptsStorage.local:
        return this.labelService.getUriLabel(dirname(promptPath.uri), { relative: true });
      case PromptsStorage.user:
        return localize("user-data-dir.capitalized", "User Data");
      case PromptsStorage.extension: {
        return localize("extension.with.id", "Extension: {0}", promptPath.extension.displayName ?? promptPath.extension.id);
      }
      case PromptsStorage.plugin:
        return localize("plugin.capitalized", "Plugin");
      case PromptsStorage.builtIn:
        return localize("builtin.capitalized", "Built-in");
      default:
        assertNever(promptPath, "Unknown prompt storage type");
    }
  }
  async listNestedAgentMDs(token) {
    if (this.areStandalonePromptFilesBlocked(PromptsType.instructions)) {
      return [];
    }
    const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
    if (!useAgentMD) {
      return [];
    }
    const useNestedAgentMD = this.configurationService.getValue(PromptsConfig.USE_NESTED_AGENT_MD);
    if (useNestedAgentMD) {
      return await this.fileLocator.findAgentMDsInWorkspace(token);
    }
    return [];
  }
  async listAgentInstructions(token, logger) {
    if (this.areStandalonePromptFilesBlocked(PromptsType.instructions)) {
      return [];
    }
    const resolvedAgentFiles = [];
    const promises = [];
    const includeParents = this.configurationService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true;
    const rootFolders = await this.fileLocator.getWorkspaceFolderRoots(includeParents, logger);
    const rootFiles = [];
    const useAgentMD = this.configurationService.getValue(PromptsConfig.USE_AGENT_MD);
    if (!useAgentMD) {
      logger?.logInfo("Agent MD files are disabled via configuration.");
    } else {
      rootFiles.push({ fileName: AGENT_MD_FILENAME, type: AgentInstructionFileType.agentsMd });
    }
    const useClaudeMD = this.configurationService.getValue(PromptsConfig.USE_CLAUDE_MD);
    if (!useClaudeMD) {
      logger?.logInfo("Claude MD files are disabled via configuration.");
    } else {
      const claudeMdFile = { fileName: CLAUDE_MD_FILENAME, type: AgentInstructionFileType.claudeMd };
      rootFiles.push(claudeMdFile);
      rootFiles.push({ fileName: CLAUDE_LOCAL_MD_FILENAME, type: AgentInstructionFileType.claudeMd });
      promises.push(this.fileLocator.findFilesInRoots(rootFolders, CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles));
      promises.push(this.fileLocator.findFilesInRoots([await this.pathService.userHome()], CLAUDE_CONFIG_FOLDER, [claudeMdFile], token, resolvedAgentFiles));
    }
    const useCopilotInstructionsFiles = this.configurationService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
    if (!useCopilotInstructionsFiles) {
      logger?.logInfo("Copilot instructions files are disabled via configuration.");
    } else {
      const copilotInstructionsFile = { fileName: COPILOT_CUSTOM_INSTRUCTIONS_FILENAME, type: AgentInstructionFileType.copilotInstructionsMd };
      promises.push(this.fileLocator.findFilesInRoots(rootFolders, GITHUB_CONFIG_FOLDER, [copilotInstructionsFile], token, resolvedAgentFiles));
      promises.push(this.fileLocator.findFilesInRoots([await this.pathService.userHome()], COPILOT_CONFIG_FOLDER, [copilotInstructionsFile], token, resolvedAgentFiles));
    }
    promises.push(this.fileLocator.findFilesInRoots(rootFolders, void 0, rootFiles, token, resolvedAgentFiles));
    await Promise.all(promises);
    if (token.isCancellationRequested) {
      return [];
    }
    const seenFileURI = new ResourceSet();
    const symlinks = [];
    const result = [];
    const add = (file) => {
      if (file.realPath) {
        symlinks.push(file);
      } else {
        result.push(file);
        seenFileURI.add(file.uri);
      }
      return true;
    };
    resolvedAgentFiles.forEach(add);
    for (const symlink of symlinks) {
      if (seenFileURI.has(symlink.realPath)) {
        logger?.logInfo(`Skipping symlinked agent instructions file ${symlink.uri} as target already included: ${symlink.realPath}`);
      } else {
        result.push(symlink);
        seenFileURI.add(symlink.realPath);
      }
    }
    return result.sort((a, b) => a.uri.toString().localeCompare(b.uri.toString()));
  }
  async getVoiceInstructions(token) {
    return this.getSpeechInstructions(VOICE_INSTRUCTIONS_FILENAME, "voice", token);
  }
  async getDictationInstructions(token) {
    return this.getSpeechInstructions(DICTATION_INSTRUCTIONS_FILENAME, "dictation", token);
  }
  async getSpeechInstructions(fileName, kind, token) {
    const userHome = await this.pathService.userHome();
    if (token.isCancellationRequested) {
      return void 0;
    }
    const candidates = [joinPath(userHome, COPILOT_CONFIG_FOLDER, fileName)];
    if (this.workspaceTrustService.isWorkspaceTrusted()) {
      const workspaceRoots = await this.fileLocator.getWorkspaceFolderRoots(false);
      if (token.isCancellationRequested) {
        return void 0;
      }
      candidates.push(...workspaceRoots.map((root) => joinPath(root, GITHUB_CONFIG_FOLDER, fileName)));
    }
    const contents = [];
    for (const candidate of candidates) {
      if (token.isCancellationRequested) {
        return void 0;
      }
      try {
        const content = (await this.fileService.readFile(candidate, void 0, token)).value.toString().trim();
        if (token.isCancellationRequested) {
          return void 0;
        }
        if (content) {
          contents.push(content);
        }
      } catch (error) {
        if (token.isCancellationRequested || isCancellationError(error)) {
          return void 0;
        }
        if (!(error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
          this.logger.warn(`[PromptsService] Failed to read ${kind} instructions from ${candidate.toString()}: ${error}`);
        }
      }
    }
    return contents.length > 0 ? contents.join("\n\n") : void 0;
  }
  getAgentFileURIFromModeFile(oldURI) {
    return this.fileLocator.getAgentFileURIFromModeFile(oldURI);
  }
  getDisabledPromptFiles(type) {
    const disabledKey = this.disabledPromptsStorageKeyPrefix + type;
    const value = this.storageService.get(disabledKey, StorageScope.PROFILE, "[]");
    const result = new ResourceSet();
    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr)) {
        for (const s of arr) {
          try {
            result.add(URI.revive(s));
          } catch {
          }
        }
      }
    } catch {
    }
    return result;
  }
  setDisabledPromptFiles(type, uris) {
    const disabled = Array.from(uris).map((uri) => uri.toJSON());
    this.storageService.store(this.disabledPromptsStorageKeyPrefix + type, JSON.stringify(disabled), StorageScope.PROFILE, StorageTarget.USER);
    if (type === PromptsType.agent) {
      this.cachedCustomAgents.refresh();
    } else if (type === PromptsType.skill) {
      this.cachedSkills.refresh();
      this.cachedSlashCommands.refresh();
    }
  }
  // Agent skills
  sanitizeAgentSkillText(text) {
    return text.replace(/<[^>]+>/g, "");
  }
  truncateAgentSkillName(name, uri) {
    const MAX_NAME_LENGTH = 64;
    const sanitized = this.sanitizeAgentSkillText(name);
    if (sanitized !== name) {
      this.logger.debug(`[findAgentSkills] Agent skill name contains XML tags, removed: ${uri}`);
    }
    if (sanitized.length > MAX_NAME_LENGTH) {
      this.logger.debug(`[findAgentSkills] Agent skill name exceeds ${MAX_NAME_LENGTH} characters, truncated: ${uri}`);
      return sanitized.substring(0, MAX_NAME_LENGTH);
    }
    return sanitized;
  }
  truncateAgentSkillDescription(description, uri) {
    if (!description) {
      return void 0;
    }
    const MAX_DESCRIPTION_LENGTH = 1024;
    const sanitized = this.sanitizeAgentSkillText(description);
    if (sanitized !== description) {
      this.logger.debug(`[findAgentSkills] Agent skill description contains XML tags, removed: ${uri}`);
    }
    if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
      this.logger.debug(`[findAgentSkills] Agent skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters, truncated: ${uri}`);
      return sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
    }
    return sanitized;
  }
  get onDidChangeSkills() {
    return this.cachedSkills.onDidChangePromise;
  }
  get onDidChangeHooks() {
    return this.cachedHooks.onDidChangePromise;
  }
  async findAgentSkills(token) {
    const useAgentSkills = this.configurationService.getValue(PromptsConfig.USE_AGENT_SKILLS);
    if (!useAgentSkills) {
      return void 0;
    }
    const discoveryInfo = await this.cachedSkills.get(token);
    const result = this.skillsFromDiscoveryInfo(discoveryInfo);
    return result;
  }
  /**
   * Derives IAgentSkill[] from cached discovery info.
   */
  skillsFromDiscoveryInfo(discoveryInfo) {
    const result = [];
    for (const file of discoveryInfo.files) {
      if (file.status === "loaded" && file.promptPath.name) {
        const sanitizedDescription = this.truncateAgentSkillDescription(file.promptPath.description, file.promptPath.uri);
        result.push({
          uri: file.promptPath.uri,
          storage: file.promptPath.storage,
          name: file.promptPath.name,
          description: sanitizedDescription,
          disableModelInvocation: file.disableModelInvocation ?? false,
          userInvocable: file.userInvocable ?? true,
          pluginUri: file.promptPath.pluginUri,
          pluginLabel: file.promptPath.pluginLabel,
          extension: file.promptPath.extension,
          sessionTypes: file.promptPath.sessionTypes
        });
      }
    }
    return result;
  }
  /**
   * Computes the full skill discovery info, including source folders and telemetry.
   */
  async computeSkillDiscovery(token) {
    const stopWatch = StopWatch.create(true);
    const files = await this.computeSkillDiscoveryInfo(token);
    const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.skill);
    const skillsBySource = /* @__PURE__ */ new Map();
    for (const file of files) {
      if (file.status === "loaded" && file.promptPath.name) {
        const source = file.promptPath.source;
        if (source) {
          skillsBySource.set(source, (skillsBySource.get(source) || 0) + 1);
        }
      }
    }
    let skippedMissingName = 0;
    let skippedMissingDescription = 0;
    let skippedDuplicateName = 0;
    let skippedParseFailed = 0;
    let skippedNameMismatch = 0;
    for (const file of files) {
      if (file.status === "skipped") {
        switch (file.skipReason) {
          case "missing-name":
            skippedMissingName++;
            break;
          case "missing-description":
            skippedMissingDescription++;
            break;
          case "duplicate-name":
            skippedDuplicateName++;
            break;
          case "name-mismatch":
            skippedNameMismatch++;
            break;
          case "parse-error":
            skippedParseFailed++;
            break;
        }
      }
    }
    const totalSkillsFound = files.filter((f) => f.status === "loaded" && f.promptPath.name).length;
    this.telemetryService.publicLog2("agentSkillsFound", {
      totalSkillsFound,
      claudePersonal: skillsBySource.get(PromptFileSource.ClaudePersonal) ?? 0,
      claudeWorkspace: skillsBySource.get(PromptFileSource.ClaudeWorkspace) ?? 0,
      copilotPersonal: skillsBySource.get(PromptFileSource.CopilotPersonal) ?? 0,
      githubWorkspace: skillsBySource.get(PromptFileSource.GitHubWorkspace) ?? 0,
      agentsPersonal: skillsBySource.get(PromptFileSource.AgentsPersonal) ?? 0,
      agentsWorkspace: skillsBySource.get(PromptFileSource.AgentsWorkspace) ?? 0,
      configWorkspace: skillsBySource.get(PromptFileSource.ConfigWorkspace) ?? 0,
      configPersonal: skillsBySource.get(PromptFileSource.ConfigPersonal) ?? 0,
      extensionContribution: skillsBySource.get(PromptFileSource.ExtensionContribution) ?? 0,
      extensionAPI: skillsBySource.get(PromptFileSource.ExtensionAPI) ?? 0,
      plugin: skillsBySource.get(PromptFileSource.Plugin) ?? 0,
      skippedDuplicateName,
      skippedMissingName,
      skippedMissingDescription,
      skippedNameMismatch,
      skippedParseFailed
    });
    return { type: PromptsType.skill, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
  }
  async getHooks(token) {
    const discoveryInfo = await this.cachedHooks.get(token);
    const result = discoveryInfo.hooksInfo;
    return result;
  }
  async getDiscoveryInfo(type, token) {
    switch (type) {
      case PromptsType.instructions:
        return this.cachedInstructions.get(token);
      case PromptsType.prompt:
        return this.cachedSlashCommands.get(token);
      case PromptsType.agent:
        return this.cachedCustomAgents.get(token);
      case PromptsType.skill:
        return this.cachedSkills.get(token);
      case PromptsType.hook:
        return this.cachedHooks.get(token);
    }
  }
  async getInstructionFiles(token) {
    const discoveryInfo = await this.cachedInstructions.get(token);
    const result = this.instructionsFromDiscoveryInfo(discoveryInfo);
    return result;
  }
  instructionsFromDiscoveryInfo(discoveryInfo) {
    const result = [];
    for (const file of discoveryInfo.files) {
      if (file.status === "loaded" && file.promptPath.name) {
        result.push({
          uri: file.promptPath.uri,
          storage: file.promptPath.storage,
          extension: file.promptPath.extension,
          pluginUri: file.promptPath.pluginUri,
          source: file.promptPath.source,
          name: file.promptPath.name,
          description: file.promptPath.description,
          pattern: file.pattern,
          sessionTypes: file.promptPath.sessionTypes
        });
      }
    }
    return result;
  }
  withPromptPathMetadata(promptPath, name, description) {
    return { ...promptPath, name, description };
  }
  async computeInstructionFiles(token) {
    return await this.getInstructionsDiscoveryInfo(token);
  }
  async computeHooks(token) {
    const stopWatch = StopWatch.create(true);
    const useChatHooks = this.configurationService.getValue(PromptsConfig.USE_CHAT_HOOKS);
    if (!useChatHooks || !this.workspaceTrustService.isWorkspaceTrusted()) {
      const hookFiles2 = await this.listPromptFiles(PromptsType.hook, token);
      const skipReason = !useChatHooks ? "disabled" : "workspace-untrusted";
      const files2 = hookFiles2.map((promptPath) => ({
        status: "skipped",
        skipReason,
        promptPath: this.withPromptPathMetadata(promptPath, basename(promptPath.uri), promptPath.description)
      }));
      const sourceFolders2 = await this._collectSourceFolderDiagnostics(PromptsType.hook);
      return { type: PromptsType.hook, files: files2, sourceFolders: sourceFolders2, hooksInfo: void 0, durationInMillis: stopWatch.elapsed() };
    }
    const useClaudeHooks = this.configurationService.getValue(PromptsConfig.USE_CLAUDE_HOOKS);
    const hookFiles = await this.listPromptFiles(PromptsType.hook, token);
    this.logger.trace(`[PromptsService] Found ${hookFiles.length} hook file(s).`);
    const userHomeUri = await this.pathService.userHome();
    const userHome = userHomeUri.scheme === Schemas.file ? userHomeUri.fsPath : userHomeUri.path;
    const defaultFolder = this.workspaceService.getWorkspace().folders[0];
    const fileResults = await Promise.all(hookFiles.map(async (hookFile) => {
      const name = basename(hookFile.uri);
      if (hookFile.storage === PromptsStorage.plugin) {
        return {
          file: {
            status: "loaded",
            promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
          }
        };
      }
      try {
        const content = await this.fileService.readFile(hookFile.uri);
        const parseErrors = [];
        const json = parseJSONC(content.value.toString(), parseErrors);
        if (parseErrors.length > 0) {
          const first = parseErrors[0];
          const message = getParseErrorMessage(first.error) || "Invalid JSON";
          return {
            file: {
              status: "skipped",
              skipReason: "parse-error",
              errorMessage: `${message} at offset ${first.offset}`,
              promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
            }
          };
        }
        if (!json || typeof json !== "object") {
          return {
            file: {
              status: "skipped",
              skipReason: "parse-error",
              errorMessage: "Invalid hooks file: must be a JSON object",
              promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
            }
          };
        }
        const hookWorkspaceFolder = this.workspaceService.getWorkspaceFolder(hookFile.uri) ?? defaultFolder;
        const workspaceRootUri = hookWorkspaceFolder?.uri;
        const { format, hooks: parsedHooks, disabledAllHooks } = parseHooksFromFile(hookFile.uri, json, workspaceRootUri, userHome);
        if (disabledAllHooks) {
          this.logger.trace(`[PromptsService] Skipping hook file with disableAllHooks: ${hookFile.uri}`);
          return {
            file: {
              status: "skipped",
              skipReason: "all-hooks-disabled",
              promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
            }
          };
        }
        if (format === HookSourceFormat.Claude && useClaudeHooks === false) {
          const hasAnyCommands = [...parsedHooks.values()].some(({ hooks: cmds }) => cmds.length > 0);
          this.logger.trace(`[PromptsService] Skipping Claude hook file (disabled via setting): ${hookFile.uri}`);
          return {
            file: {
              status: "skipped",
              skipReason: "claude-hooks-disabled",
              promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
            },
            hasDisabledClaudeHooks: hasAnyCommands
          };
        }
        const hooks = /* @__PURE__ */ new Map();
        for (const [hookType, { hooks: commands }] of parsedHooks) {
          for (const command of commands) {
            let bucket = hooks.get(hookType);
            if (!bucket) {
              bucket = [];
              hooks.set(hookType, bucket);
            }
            bucket.push(command);
            this.logger.trace(`[PromptsService] Collected ${hookType} hook from ${hookFile.uri} (format: ${format})`);
          }
        }
        return {
          file: { status: "loaded", promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description) },
          hooks,
          sourceUri: hookFile.uri
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[PromptsService] Failed to parse hook file: ${hookFile.uri}`, error);
        return {
          file: {
            status: "skipped",
            skipReason: "parse-error",
            errorMessage: msg,
            promptPath: this.withPromptPathMetadata(hookFile, name, hookFile.description)
          }
        };
      }
    }));
    const files = [];
    let hasDisabledClaudeHooks = false;
    const collectedHooks = /* @__PURE__ */ new Map();
    for (const { file, hooks, sourceUri, hasDisabledClaudeHooks: disabled } of fileResults) {
      if (file) {
        files.push(file);
      }
      if (disabled) {
        hasDisabledClaudeHooks = true;
      }
      if (hooks && sourceUri) {
        for (const [hookType, commands] of hooks) {
          let bucket = collectedHooks.get(hookType);
          if (!bucket) {
            bucket = [];
            collectedHooks.set(hookType, bucket);
          }
          for (const command of commands) {
            bucket.push({ ...command, sourceUri });
          }
        }
      }
    }
    const plugins = this.agentPluginService.plugins.get();
    const managedHooksOnlyValue = this.configurationService.getValue(COPILOT_ALLOW_MANAGED_HOOKS_ONLY_CONFIG) === true;
    const enabledPluginsPolicyValue = this.configurationService.inspect(ChatConfiguration.EnabledPlugins).policyValue;
    for (const plugin of plugins) {
      if (!isContributionEnabled(plugin.enablement.get()) || managedHooksOnlyValue && !isAgentPluginForceEnabledByPolicy(plugin, enabledPluginsPolicyValue)) {
        continue;
      }
      for (const hook of plugin.hooks.get()) {
        let bucket = collectedHooks.get(hook.type);
        if (!bucket) {
          bucket = [];
          collectedHooks.set(hook.type, bucket);
        }
        for (const command of hook.hooks) {
          bucket.push({ ...command, sourceUri: hook.uri });
        }
      }
    }
    const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.hook);
    if (collectedHooks.size === 0) {
      this.logger.trace("[PromptsService] No valid hooks collected.");
      return { type: PromptsType.hook, files, sourceFolders, hooksInfo: void 0, durationInMillis: stopWatch.elapsed() };
    }
    const result = Object.fromEntries(collectedHooks);
    this.logger.trace(`[PromptsService] Collected hooks: ${JSON.stringify(Object.keys(result))}`);
    return { type: PromptsType.hook, files, sourceFolders, hooksInfo: { hooks: result, hasDisabledClaudeHooks }, durationInMillis: stopWatch.elapsed() };
  }
  /**
   * Precedence used when deduplicating skills that share the same canonical
   * name: workspace > personal > plugin > extension API > extension contribution.
   * Lower numbers win.
   */
  getSkillPriority(skill) {
    if (skill.storage === PromptsStorage.local) {
      return 0;
    }
    if (skill.storage === PromptsStorage.user) {
      return 1;
    }
    if (skill.storage === PromptsStorage.plugin) {
      return 2;
    }
    if (skill.source === PromptFileSource.ExtensionAPI) {
      return 3;
    }
    if (skill.source === PromptFileSource.ExtensionContribution) {
      return 4;
    }
    return 5;
  }
  /**
   * Returns the discovery results for skill files.
   */
  async computeSkillDiscoveryInfo(token) {
    const files = [];
    const seenNames = /* @__PURE__ */ new Set();
    const nameToUri = /* @__PURE__ */ new Map();
    const allSkills = [];
    const standaloneSkills = this.areStandalonePromptFilesBlocked(PromptsType.skill) ? [] : await this.fileLocator.findAgentSkills(token);
    const skills = await Promise.all([
      Promise.resolve(standaloneSkills),
      this.getExtensionPromptFiles(PromptsType.skill, token),
      Promise.resolve(this._pluginPromptFilesByType.get(PromptsType.skill) ?? []),
      this.getBuiltinPromptFiles(PromptsType.skill, token)
    ]);
    for (const skillList of skills) {
      allSkills.push(...skillList);
    }
    allSkills.sort((a, b) => this.getSkillPriority(a) - this.getSkillPriority(b));
    for (const skill of allSkills) {
      const uri = skill.uri;
      const promptPath = skill;
      try {
        const parsedFile = await this.parseNew(uri, token);
        const folderName = getSkillFolderName(uri);
        let name = parsedFile.header?.name;
        const description = parsedFile.header?.description;
        if (!name) {
          this.logger.debug(`[computeSkillDiscoveryInfo] Agent skill file missing name attribute, using folder name "${folderName}": ${uri}`);
          name = folderName;
        }
        let sanitizedName = this.truncateAgentSkillName(name, uri);
        if (sanitizedName !== folderName) {
          this.logger.debug(`[computeSkillDiscoveryInfo] Agent skill name "${sanitizedName}" does not match folder name "${folderName}", using folder name: ${uri}`);
          sanitizedName = folderName;
        }
        if (seenNames.has(sanitizedName)) {
          this.logger.debug(`[computeSkillDiscoveryInfo] Skipping duplicate agent skill name: ${sanitizedName} at ${uri}`);
          files.push({ status: "skipped", skipReason: "duplicate-name", duplicateOf: nameToUri.get(sanitizedName), promptPath: this.withPromptPathMetadata(promptPath, sanitizedName, description) });
          continue;
        }
        seenNames.add(sanitizedName);
        nameToUri.set(sanitizedName, uri);
        const disableModelInvocation = parsedFile.header?.disableModelInvocation === true;
        const userInvocable = parsedFile.header?.userInvocable !== false;
        files.push({ status: "loaded", promptPath: this.withPromptPathMetadata(promptPath, sanitizedName, description), disableModelInvocation, userInvocable });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`[computeSkillDiscoveryInfo] Failed to validate Agent skill file: ${uri}`, msg);
        files.push({
          status: "skipped",
          skipReason: "parse-error",
          errorMessage: msg,
          promptPath
        });
      }
    }
    return files;
  }
  async getInstructionsDiscoveryInfo(token) {
    const stopWatch = StopWatch.create(true);
    const files = [];
    const instructionsFiles = await this.listPromptFiles(PromptsType.instructions, token);
    for (const promptPath of instructionsFiles) {
      const uri = promptPath.uri;
      try {
        const parsedPromptFile = await this.parseNew(uri, token);
        const name = parsedPromptFile?.header?.name ?? promptPath.name ?? getCleanPromptName(uri);
        const description = parsedPromptFile?.header?.description ?? promptPath.description;
        const pattern = evaluateApplyToPattern(parsedPromptFile.header, isInClaudeRulesFolder(uri));
        files.push({
          status: "loaded",
          pattern,
          promptPath: this.withPromptPathMetadata(promptPath, name, description)
        });
      } catch (e) {
        files.push({
          status: "skipped",
          skipReason: "parse-error",
          errorMessage: e instanceof Error ? e.message : String(e),
          promptPath
        });
      }
    }
    const sourceFolders = await this._collectSourceFolderDiagnostics(PromptsType.instructions);
    return { type: PromptsType.instructions, files, sourceFolders, durationInMillis: stopWatch.elapsed() };
  }
};
PromptsService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IModelService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IUserDataProfileService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IFileService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IPathService),
  __decorateParam(11, IAgentPluginService),
  __decorateParam(12, IWorkspaceTrustManagementService)
], PromptsService);
class CachedPromise extends Disposable {
  constructor(computeFn, getEvent, delay = 0) {
    super();
    this.computeFn = computeFn;
    this.getEvent = getEvent;
    this.delay = delay;
    this.cachedPromise = void 0;
    this.cachedPool = void 0;
    this.onDidUpdatePromiseEmitter = this._register(new Emitter());
    const delayer = this._register(new Delayer(this.delay));
    this._register(this.getEvent()(() => {
      this.cachedPromise = void 0;
      delayer.trigger(() => this.onDidUpdatePromiseEmitter.fire());
    }));
  }
  get onDidChangePromise() {
    return this.onDidUpdatePromiseEmitter.event;
  }
  get(token) {
    if (this.cachedPool?.token.isCancellationRequested) {
      this.cachedPromise = void 0;
      this.cachedPool = void 0;
    }
    let pool = this.cachedPool;
    if (this.cachedPromise === void 0) {
      pool = new CancellationTokenPool();
      const promise = this.computeFn(pool.token).catch((err) => {
        if (this.cachedPromise === promise) {
          this.cachedPromise = void 0;
        }
        throw err;
      });
      promise.finally(() => {
        if (this.cachedPool === pool) {
          this.cachedPool = void 0;
        }
        pool.dispose();
      });
      this.cachedPromise = promise;
      this.cachedPool = pool;
    }
    pool?.add(token);
    return raceCancellationError(this.cachedPromise, token);
  }
  refresh() {
    this.cachedPromise = void 0;
    this.onDidUpdatePromiseEmitter?.fire();
  }
}
class ModelChangeTracker extends Disposable {
  constructor(modelService) {
    super();
    this.listeners = new ResourceMap();
    this.onDidPromptModelChange = this._register(new Emitter());
    const onAdd = (model) => {
      const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
      if (promptType !== void 0) {
        this.listeners.set(model.uri, model.onDidChangeContent(() => this.onDidPromptModelChange.fire({ uri: model.uri, promptType })));
      }
      return promptType;
    };
    const onRemove = (languageId, uri) => {
      const promptType = getPromptsTypeForLanguageId(languageId);
      if (promptType !== void 0) {
        this.listeners.get(uri)?.dispose();
        this.listeners.delete(uri);
      }
      return promptType;
    };
    this._register(modelService.onModelAdded((model) => onAdd(model)));
    this._register(modelService.onModelLanguageChanged((e) => {
      const removedPromptType = onRemove(e.oldLanguageId, e.model.uri);
      const addedPromptType = onAdd(e.model);
      if (removedPromptType !== addedPromptType) {
        if (removedPromptType) {
          this.onDidPromptModelChange.fire({ uri: e.model.uri, promptType: removedPromptType });
        }
        if (addedPromptType) {
          this.onDidPromptModelChange.fire({ uri: e.model.uri, promptType: addedPromptType });
        }
      }
    }));
    this._register(modelService.onModelRemoved((model) => onRemove(model.getLanguageId(), model.uri)));
  }
  get onDidPromptChange() {
    return this.onDidPromptModelChange.event;
  }
  dispose() {
    super.dispose();
    this.listeners.forEach((listener) => listener.dispose());
    this.listeners.clear();
  }
}
var CustomAgent;
((CustomAgent2) => {
  function fromParsedPromptFile(ast, extra) {
    const uri = ast.uri;
    const { hooks, sessionTypes, enabled } = extra;
    let metadata;
    if (ast.header) {
      const advanced = ast.header.getAttribute(PromptHeaderAttributes.advancedOptions);
      if (advanced && advanced.value.type === "map") {
        metadata = {};
        for (const [key, value] of Object.entries(advanced.value)) {
          if (value.type === "scalar") {
            metadata[key] = value;
          }
        }
      }
    }
    const toolReferences = [];
    if (ast.body) {
      const bodyOffset = ast.body.offset;
      const bodyVarRefs = ast.body.variableReferences;
      for (let i = bodyVarRefs.length - 1; i >= 0; i--) {
        const { name: name2, offset, fullLength } = bodyVarRefs[i];
        const range = new OffsetRange(offset - bodyOffset, offset - bodyOffset + fullLength);
        toolReferences.push({ name: name2, range });
      }
    }
    const agentInstructions = { content: ast.body?.getContent() ?? "", toolReferences, metadata };
    const name = ast.header?.name ?? extra.name ?? getCleanPromptName(uri);
    const description = ast.header?.description ?? extra.description;
    const target = getTarget(PromptsType.agent, ast.header ?? uri);
    const id = uri.toString();
    const source = extra.source;
    if (!ast.header) {
      return { id, uri, name, agentInstructions, source, target, visibility: { userInvocable: true, agentInvocable: true }, sessionTypes, hooks, enabled };
    }
    const visibility = {
      userInvocable: ast.header.userInvocable !== false,
      agentInvocable: ast.header.infer !== void 0 ? ast.header.infer === true : ast.header.disableModelInvocation !== true
    };
    let model = ast.header.model;
    if (target === Target.Claude && model) {
      model = mapClaudeModels(model);
    }
    let { tools, handOffs, argumentHint, agents } = ast.header;
    if (target === Target.Claude && tools) {
      tools = mapClaudeTools(tools);
    }
    return { id, uri, name, description, model, tools, handOffs, argumentHint, target, visibility, agents, agentInstructions, source, sessionTypes, hooks, enabled };
  }
  CustomAgent2.fromParsedPromptFile = fromParsedPromptFile;
})(CustomAgent || (CustomAgent = {}));
export {
  CustomAgent,
  PromptsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblBvb2wgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBQYXJzZUVycm9yLCBwYXJzZSBhcyBwYXJzZUpTT05DIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBnZXRQYXJzZUVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FcnJvck1lc3NhZ2VzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGlzRXF1YWwsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVmFyaWFibGVSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgUHJvbXB0c0NvbmZpZyB9IGZyb20gJy4uL2NvbmZpZy9jb25maWcuanMnO1xuaW1wb3J0IHsgQUdFTlRfTURfRklMRU5BTUUsIENMQVVERV9DT05GSUdfRk9MREVSLCBDTEFVREVfTE9DQUxfTURfRklMRU5BTUUsIENMQVVERV9NRF9GSUxFTkFNRSwgQ09QSUxPVF9DT05GSUdfRk9MREVSLCBDT1BJTE9UX0NVU1RPTV9JTlNUUlVDVElPTlNfRklMRU5BTUUsIERJQ1RBVElPTl9JTlNUUlVDVElPTlNfRklMRU5BTUUsIGdldENsZWFuUHJvbXB0TmFtZSwgZ2V0U2tpbGxGb2xkZXJOYW1lLCBHSVRIVUJfQ09ORklHX0ZPTERFUiwgSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyLCBpc0luQ2xhdWRlUnVsZXNGb2xkZXIsIFZPSUNFX0lOU1RSVUNUSU9OU19GSUxFTkFNRSB9IGZyb20gJy4uL2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFBST01QVF9MQU5HVUFHRV9JRCwgUHJvbXB0RmlsZVNvdXJjZSwgUHJvbXB0c1R5cGUsIFRhcmdldCwgZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkIH0gZnJvbSAnLi4vcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUluc3RydWN0aW9uRmlsZSwgUHJvbXB0RmlsZXNMb2NhdG9yIH0gZnJvbSAnLi4vdXRpbHMvcHJvbXB0RmlsZXNMb2NhdG9yLmpzJztcbmltcG9ydCB7IGV2YWx1YXRlQXBwbHlUb1BhdHRlcm4sIFByb21wdEZpbGVQYXJzZXIsIFBhcnNlZFByb21wdEZpbGUsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMgfSBmcm9tICcuLi9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IElBZ2VudEluc3RydWN0aW9ucywgSUFnZW50U291cmNlLCBJQ2hhdFByb21wdFNsYXNoQ29tbWFuZCwgSUNvbmZpZ3VyZWRIb29rc0luZm8sIElDdXN0b21BZ2VudCwgSUV4dGVuc2lvblByb21wdFBhdGgsIElMb2NhbFByb21wdFBhdGgsIElQbHVnaW5Qcm9tcHRQYXRoLCBJQnVpbHRpblByb21wdFBhdGgsIElQcm9tcHRQYXRoLCBJUHJvbXB0c1NlcnZpY2UsIElBZ2VudFNraWxsLCBJSW5zdHJ1Y3Rpb25EaXNjb3ZlcnlJbmZvLCBJSW5zdHJ1Y3Rpb25EaXNjb3ZlcnlSZXN1bHQsIElJbnN0cnVjdGlvbkZpbGUsIElVc2VyUHJvbXB0UGF0aCwgUHJvbXB0c1N0b3JhZ2UsIElQcm9tcHRGaWxlQ29udGV4dCwgSVByb21wdEZpbGVSZXNvdXJjZSwgSVByb21wdERpc2NvdmVyeUluZm8sIElQcm9tcHRGaWxlRGlzY292ZXJ5UmVzdWx0LCBJUHJvbXB0U291cmNlRm9sZGVyUmVzdWx0LCBJQ3VzdG9tQWdlbnRWaXNpYmlsaXR5LCBJQWdlbnRJbnN0cnVjdGlvbkZpbGUsIEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZSwgTG9nZ2VyLCBJU2xhc2hDb21tYW5kRGlzY292ZXJ5SW5mbywgSVNsYXNoQ29tbWFuZERpc2NvdmVyeVJlc3VsdCwgSUFnZW50RGlzY292ZXJ5SW5mbywgSUFnZW50RGlzY292ZXJ5UmVzdWx0LCBJSG9va0Rpc2NvdmVyeUluZm8sIElSZXNvbHZlZENoYXRQcm9tcHRTbGFzaENvbW1hbmQsIG1hdGNoZXNTZXNzaW9uVHlwZSB9IGZyb20gJy4vcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRGVsYXllciwgcmFjZUNhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RIb29rcywgcGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWwgfSBmcm9tICcuLi9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IHR5cGUgSVBhcnNlZEhvb2tDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB7IEhvb2tUeXBlIH0gZnJvbSAnLi4vaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IEhvb2tTb3VyY2VGb3JtYXQsIHBhcnNlSG9va3NGcm9tRmlsZSB9IGZyb20gJy4uL2hvb2tDb21wYXRpYmlsaXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRUYXJnZXQsIG1hcENsYXVkZU1vZGVscywgbWFwQ2xhdWRlVG9vbHMgfSBmcm9tICcuLi9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRGaWxlQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBnZXRDYW5vbmljYWxQbHVnaW5Db21tYW5kSWQsIElBZ2VudFBsdWdpbiwgSUFnZW50UGx1Z2luU2VydmljZSB9IGZyb20gJy4uLy4uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzQ29udHJpYnV0aW9uRW5hYmxlZCB9IGZyb20gJy4uLy4uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uUHJvbXB0RmlsZVNlcnZpY2UgfSBmcm9tICcuL2V4dGVuc2lvblByb21wdEZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0NPTkZJRywgQ09QSUxPVF9TVFJJQ1RfUExVR0lOX09OTFlfQ1VTVE9NSVpBVElPTl9DT05GSUcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgaXNQcm9tcHRUeXBlQmxvY2tlZCwgU3RyaWN0UGx1Z2luT25seUN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jdXN0b21pemF0aW9uTG9ja2Rvd24uanMnO1xuaW1wb3J0IHsgaXNBZ2VudFBsdWdpbkZvcmNlRW5hYmxlZEJ5UG9saWN5IH0gZnJvbSAnLi4vLi4vcGx1Z2lucy9hZ2VudFBsdWdpbkVuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi9jb25zdGFudHMuanMnO1xuXG4vKipcbiAqIFByb3ZpZGVzIHByb21wdCBzZXJ2aWNlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb21wdHNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQcm9tcHRzU2VydmljZSB7XG5cdHB1YmxpYyBkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogUHJvbXB0IGZpbGVzIGxvY2F0b3IgdXRpbGl0eS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgZmlsZUxvY2F0b3I6IFByb21wdEZpbGVzTG9jYXRvcjtcblxuXHQvKipcblx0ICogQ2FjaGVkIGFnZW50IGRpc2NvdmVyeSBpbmZvLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZWRDdXN0b21BZ2VudHM6IENhY2hlZFByb21pc2U8SUFnZW50RGlzY292ZXJ5SW5mbz47XG5cblx0LyoqXG5cdCAqIENhY2hlZCBzbGFzaCBjb21tYW5kIGRpc2NvdmVyeSBpbmZvLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZWRTbGFzaENvbW1hbmRzOiBDYWNoZWRQcm9taXNlPElTbGFzaENvbW1hbmREaXNjb3ZlcnlJbmZvPjtcblxuXHQvKipcblx0ICogQ2FjaGVkIGhvb2tzLiBJbnZhbGlkYXRlZCB3aGVuIGhvb2sgZmlsZXMgY2hhbmdlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBjYWNoZWRIb29rczogQ2FjaGVkUHJvbWlzZTxJSG9va0Rpc2NvdmVyeUluZm8+O1xuXG5cdC8qKlxuXHQgKiBDYWNoZWQgc2tpbGwgZGlzY292ZXJ5IGluZm8uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlZFNraWxsczogQ2FjaGVkUHJvbWlzZTxJUHJvbXB0RGlzY292ZXJ5SW5mbz47XG5cblx0LyoqXG5cdCAqIENhY2hlZCBpbnN0cnVjdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlZEluc3RydWN0aW9uczogQ2FjaGVkUHJvbWlzZTxJSW5zdHJ1Y3Rpb25EaXNjb3ZlcnlJbmZvPjtcblx0cHJpdmF0ZSByZWFkb25seSBhZ2VudEluc3RydWN0aW9uc1dhdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oe1xuXHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgYWdlbnRJbnN0cnVjdGlvbnNVcGRhdGVkRXZlbnQgPSB0aGlzLmZpbGVMb2NhdG9yLmNyZWF0ZUFnZW50SW5zdHJ1Y3Rpb25zVXBkYXRlZEV2ZW50KCk7XG5cdFx0XHRzdG9yZS5hZGQoYWdlbnRJbnN0cnVjdGlvbnNVcGRhdGVkRXZlbnQpO1xuXHRcdFx0c3RvcmUuYWRkKGFnZW50SW5zdHJ1Y3Rpb25zVXBkYXRlZEV2ZW50LmV2ZW50KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQWdlbnRJbnN0cnVjdGlvbnMuZmlyZSgpKSk7XG5cdFx0XHR0aGlzLmFnZW50SW5zdHJ1Y3Rpb25zV2F0Y2hlci52YWx1ZSA9IHN0b3JlO1xuXHRcdH0sXG5cdFx0b25EaWRSZW1vdmVMYXN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdHRoaXMuYWdlbnRJbnN0cnVjdGlvbnNXYXRjaGVyLmNsZWFyKCk7XG5cdFx0fVxuXHR9KSk7XG5cblx0LyoqXG5cdCAqIFN5bmNocm9ub3VzIG1pcnJvciBvZiB0aGUgbmFtZXMgZXhwb3NlZCBieSB7QGxpbmsgZ2V0UHJvbXB0U2xhc2hDb21tYW5kc30sXG5cdCAqIG1haW50YWluZWQgZm9yIHtAbGluayBoYXNQcm9tcHRTbGFzaENvbW1hbmR9IHNvIGNhbGxlcnMgKGUuZy4gdGhlIGNoYXQgcmVxdWVzdFxuXHQgKiBwYXJzZXIpIGNhbiBkaXNhbWJpZ3VhdGUgYDxjbWQ+OjxzdWI+YCB2cyBiYXJlIGA8Y21kPmAgd2l0aG91dCBhbiBhc3luYyBob3AuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGtub3duUHJvbXB0U2xhc2hDb21tYW5kTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHQvKipcblx0ICogQ2FjaGUgZm9yIHBhcnNlZCBwcm9tcHQgZmlsZXMga2V5ZWQgYnkgVVJJLlxuXHQgKiBUaGUgbnVtYmVyIGluIHRoZSByZXR1cm5lZCB0dXBsZSBpcyB0ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCksIHdoaWNoIGlzIGFuIGludGVybmFsIFZTIENvZGUgY291bnRlciB0aGF0IGluY3JlbWVudHMgZXZlcnkgdGltZSB0aGUgdGV4dCBtb2RlbCdzIGNvbnRlbnQgY2hhbmdlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FjaGVkUGFyc2VkUHJvbXB0RnJvbU1vZGVscyA9IG5ldyBSZXNvdXJjZU1hcDxbbnVtYmVyLCBQYXJzZWRQcm9tcHRGaWxlXT4oKTtcblxuXHQvKipcblx0ICogQ2FjaGVkIGZpbGUgbG9jYXRpb25zIGNvbW1hbmRzLiBDYWNoaW5nIG9ubHkgaGFwcGVucyBpZiB0aGUgY29ycmVzcG9uZGluZyBgZmlsZUxvY2F0b3JFdmVudHNgIGV2ZW50IGlzIHVzZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGNhY2hlZEZpbGVMb2NhdGlvbnM6IHsgW2tleSBpbiBQcm9tcHRzVHlwZV0/OiBQcm9taXNlPHJlYWRvbmx5IElQcm9tcHRQYXRoW10+IH0gPSB7fTtcblxuXHQvKipcblx0ICogTGF6aWx5IGNyZWF0ZWQgZXZlbnRzIHRoYXQgbm90aWZ5IGxpc3RlbmVycyB3aGVuIHRoZSBmaWxlIGxvY2F0aW9ucyBmb3IgYSBnaXZlbiBwcm9tcHQgdHlwZSBjaGFuZ2UuXG5cdCAqIEFuIGV2ZW50IGlzIGNyZWF0ZWQgb24gZGVtYW5kIGZvciBlYWNoIHByb21wdCB0eXBlIGFuZCBjYW4gYmUgdXNlZCBieSBjb25zdW1lcnMgdG8gcmVhY3QgdG8gdXBkYXRlc1xuXHQgKiBpbiB0aGUgc2V0IG9mIHByb21wdCBmaWxlcyAoZS5nLiwgd2hlbiBwcm9tcHQgZmlsZXMgYXJlIGFkZGVkLCByZW1vdmVkLCBvciBtb2RpZmllZCkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVMb2NhdG9yRXZlbnRzOiB7IFtrZXkgaW4gUHJvbXB0c1R5cGVdPzogRXZlbnQ8dm9pZD4gfSA9IHt9O1xuXG5cblx0LyoqXG5cdCAqIE93bnMgdGhlIHJlZ2lzdHJ5IG9mIGV4dGVuc2lvbi1jb250cmlidXRlZCBwcm9tcHQgZmlsZXMgKGJvdGggdmlhXG5cdCAqIGNvbnRyaWJ1dGlvbiBwb2ludHMgYW5kIHZpYSBwcm92aWRlciBBUEkpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25Qcm9tcHRGaWxlczogRXh0ZW5zaW9uUHJvbXB0RmlsZVNlcnZpY2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQbHVnaW5Qcm9tcHRGaWxlc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFByb21wdHNUeXBlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQbHVnaW5Ib29rc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIF9wbHVnaW5Qcm9tcHRGaWxlc0J5VHlwZSA9IG5ldyBNYXA8UHJvbXB0c1R5cGUsIHJlYWRvbmx5IElQbHVnaW5Qcm9tcHRQYXRoW10+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHB1YmxpYyByZWFkb25seSBsb2dnZXI6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5maWxlTG9jYXRvciA9IHRoaXMuY3JlYXRlUHJvbXB0RmlsZXNMb2NhdG9yKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsU2VydmljZS5vbk1vZGVsUmVtb3ZlZCgobW9kZWwpID0+IHtcblx0XHRcdHRoaXMuY2FjaGVkUGFyc2VkUHJvbXB0RnJvbU1vZGVscy5kZWxldGUobW9kZWwudXJpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmV4dGVuc2lvblByb21wdEZpbGVzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeHRlbnNpb25Qcm9tcHRGaWxlU2VydmljZSkpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlRXh0ZW5zaW9uUHJvbXB0RmlsZXMgPSB0aGlzLmV4dGVuc2lvblByb21wdEZpbGVzLm9uRGlkQ2hhbmdlO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbkxvY2tkb3duID0gRXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLFxuXHRcdFx0ZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENPUElMT1RfU1RSSUNUX1BMVUdJTl9PTkxZX0NVU1RPTUlaQVRJT05fQ09ORklHKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0NPTkZJRykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbkxvY2tkb3duKCgpID0+IHtcblx0XHRcdHRoaXMuY2FjaGVkRmlsZUxvY2F0aW9uc1tQcm9tcHRzVHlwZS5hZ2VudF0gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmNhY2hlZEZpbGVMb2NhdGlvbnNbUHJvbXB0c1R5cGUuc2tpbGxdID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5jYWNoZWRGaWxlTG9jYXRpb25zW1Byb21wdHNUeXBlLmhvb2tdID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5jYWNoZWRGaWxlTG9jYXRpb25zW1Byb21wdHNUeXBlLmluc3RydWN0aW9uc10gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBJbnZhbGlkYXRlIHRoZSBjYWNoZWQgZmlsZSBsb2NhdGlvbiBsaXN0IHdoZW5ldmVyIGFuIGV4dGVuc2lvbiBjb250cmlidXRpb25cblx0XHQvLyBvciBwcm92aWRlciBmb3IgdGhlIHNhbWUgdHlwZSBjaGFuZ2VzIChvciBpdHMgYHdoZW5gIHJlLWV2YWx1YXRlcykuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VFeHRlbnNpb25Qcm9tcHRGaWxlcyhlID0+IHtcblx0XHRcdHRoaXMuY2FjaGVkRmlsZUxvY2F0aW9uc1tlLnR5cGVdID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVsQ2hhbmdlRXZlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTW9kZWxDaGFuZ2VUcmFja2VyKHRoaXMubW9kZWxTZXJ2aWNlKSkub25EaWRQcm9tcHRDaGFuZ2U7XG5cdFx0dGhpcy5jYWNoZWRDdXN0b21BZ2VudHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FjaGVkUHJvbWlzZShcblx0XHRcdCh0b2tlbikgPT4gdGhpcy5jb21wdXRlQWdlbnREaXNjb3ZlcnlJbmZvKHRva2VuKSxcblx0XHRcdCgpID0+IEV2ZW50LmFueShcblx0XHRcdFx0dGhpcy5nZXRGaWxlTG9jYXRvckV2ZW50KFByb21wdHNUeXBlLmFnZW50KSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKG1vZGVsQ2hhbmdlRXZlbnQsIGUgPT4gZS5wcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NIQVRfSE9PS1MpKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKG9uRGlkQ2hhbmdlRXh0ZW5zaW9uUHJvbXB0RmlsZXMsIGUgPT4gZS50eXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLl9vbkRpZFBsdWdpblByb21wdEZpbGVzQ2hhbmdlLmV2ZW50LCB0ID0+IHQgPT09IFByb21wdHNUeXBlLmFnZW50KSxcblx0XHRcdFx0b25EaWRDaGFuZ2VDdXN0b21pemF0aW9uTG9ja2Rvd24sXG5cdFx0XHRcdHRoaXMud29ya3NwYWNlVHJ1c3RTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QsXG5cdFx0XHQpXG5cdFx0KSk7XG5cblx0XHR0aGlzLmNhY2hlZFNsYXNoQ29tbWFuZHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FjaGVkUHJvbWlzZShcblx0XHRcdCh0b2tlbikgPT4gdGhpcy5jb21wdXRlU2xhc2hDb21tYW5kRGlzY292ZXJ5SW5mbyh0b2tlbiksXG5cdFx0XHQoKSA9PiBFdmVudC5hbnkoXG5cdFx0XHRcdHRoaXMuZ2V0RmlsZUxvY2F0b3JFdmVudChQcm9tcHRzVHlwZS5wcm9tcHQpLFxuXHRcdFx0XHR0aGlzLmdldEZpbGVMb2NhdG9yRXZlbnQoUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIobW9kZWxDaGFuZ2VFdmVudCwgZSA9PiBlLnByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcihtb2RlbENoYW5nZUV2ZW50LCBlID0+IGUucHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIob25EaWRDaGFuZ2VFeHRlbnNpb25Qcm9tcHRGaWxlcywgZSA9PiBlLnR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCB8fCBlLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuX29uRGlkUGx1Z2luUHJvbXB0RmlsZXNDaGFuZ2UuZXZlbnQsIHQgPT4gdCA9PT0gUHJvbXB0c1R5cGUucHJvbXB0IHx8IHQgPT09IFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0b25EaWRDaGFuZ2VDdXN0b21pemF0aW9uTG9ja2Rvd24pLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5jYWNoZWRTa2lsbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FjaGVkUHJvbWlzZShcblx0XHRcdCh0b2tlbikgPT4gdGhpcy5jb21wdXRlU2tpbGxEaXNjb3ZlcnkodG9rZW4pLFxuXHRcdFx0KCkgPT4gRXZlbnQuYW55KFxuXHRcdFx0XHR0aGlzLmdldEZpbGVMb2NhdG9yRXZlbnQoUHJvbXB0c1R5cGUuc2tpbGwpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIobW9kZWxDaGFuZ2VFdmVudCwgZSA9PiBlLnByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKG9uRGlkQ2hhbmdlRXh0ZW5zaW9uUHJvbXB0RmlsZXMsIGUgPT4gZS50eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCksXG5cdFx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLl9vbkRpZFBsdWdpblByb21wdEZpbGVzQ2hhbmdlLmV2ZW50LCB0ID0+IHQgPT09IFByb21wdHNUeXBlLnNraWxsKSxcblx0XHRcdFx0b25EaWRDaGFuZ2VDdXN0b21pemF0aW9uTG9ja2Rvd24pXG5cdFx0KSk7XG5cblx0XHR0aGlzLmNhY2hlZEhvb2tzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhY2hlZFByb21pc2UoXG5cdFx0XHQodG9rZW4pID0+IHRoaXMuY29tcHV0ZUhvb2tzKHRva2VuKSxcblx0XHRcdCgpID0+IEV2ZW50LmFueShcblx0XHRcdFx0dGhpcy5nZXRGaWxlTG9jYXRvckV2ZW50KFByb21wdHNUeXBlLmhvb2spLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NMQVVERV9IT09LUykpLFxuXHRcdFx0XHRvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25Mb2NrZG93bixcblx0XHRcdFx0dGhpcy5fb25EaWRQbHVnaW5Ib29rc0NoYW5nZS5ldmVudCxcblx0XHRcdFx0dGhpcy53b3Jrc3BhY2VUcnVzdFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCxcblx0XHRcdClcblx0XHQpKTtcblxuXHRcdHRoaXMuY2FjaGVkSW5zdHJ1Y3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhY2hlZFByb21pc2UoXG5cdFx0XHQodG9rZW4pID0+IHRoaXMuY29tcHV0ZUluc3RydWN0aW9uRmlsZXModG9rZW4pLFxuXHRcdFx0KCkgPT4gRXZlbnQuYW55KFxuXHRcdFx0XHR0aGlzLmdldEZpbGVMb2NhdG9yRXZlbnQoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSxcblx0XHRcdFx0RXZlbnQuZmlsdGVyKG9uRGlkQ2hhbmdlRXh0ZW5zaW9uUHJvbXB0RmlsZXMsIGUgPT4gZS50eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpLFxuXHRcdFx0XHRFdmVudC5maWx0ZXIodGhpcy5fb25EaWRQbHVnaW5Qcm9tcHRGaWxlc0NoYW5nZS5ldmVudCwgdCA9PiB0ID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpLFxuXHRcdFx0XHRvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25Mb2NrZG93bixcblx0XHRcdClcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2F0Y2hQbHVnaW5Qcm9tcHRGaWxlc0ZvclR5cGUoXG5cdFx0XHRQcm9tcHRzVHlwZS5wcm9tcHQsXG5cdFx0XHQocGx1Z2luLCByZWFkZXIpID0+IHBsdWdpbi5jb21tYW5kcy5yZWFkKHJlYWRlciksXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53YXRjaFBsdWdpblByb21wdEZpbGVzRm9yVHlwZShcblx0XHRcdFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0KHBsdWdpbiwgcmVhZGVyKSA9PiBwbHVnaW4uc2tpbGxzLnJlYWQocmVhZGVyKSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndhdGNoUGx1Z2luUHJvbXB0RmlsZXNGb3JUeXBlKFxuXHRcdFx0UHJvbXB0c1R5cGUuYWdlbnQsXG5cdFx0XHQocGx1Z2luLCByZWFkZXIpID0+IHBsdWdpbi5hZ2VudHMucmVhZChyZWFkZXIpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2F0Y2hQbHVnaW5Qcm9tcHRGaWxlc0ZvclR5cGUoXG5cdFx0XHRQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHQocGx1Z2luLCByZWFkZXIpID0+IHBsdWdpbi5pbnN0cnVjdGlvbnMucmVhZChyZWFkZXIpLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgbWFuYWdlZEhvb2tzT25seSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgb25EaWRDaGFuZ2VDdXN0b21pemF0aW9uTG9ja2Rvd24sXG5cdFx0XHQoKSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENPUElMT1RfQUxMT1dfTUFOQUdFRF9IT09LU19PTkxZX0NPTkZJRykgPT09IHRydWUpO1xuXHRcdGNvbnN0IGVuYWJsZWRQbHVnaW5zUG9saWN5ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRW5hYmxlZFBsdWdpbnMpKSxcblx0XHRcdCgpID0+IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxSZWNvcmQ8c3RyaW5nLCBib29sZWFuPj4oQ2hhdENvbmZpZ3VyYXRpb24uRW5hYmxlZFBsdWdpbnMpLnBvbGljeVZhbHVlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpbnMgPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IG1hbmFnZWRIb29rc09ubHlWYWx1ZSA9IG1hbmFnZWRIb29rc09ubHkucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZW5hYmxlZFBsdWdpbnNQb2xpY3lWYWx1ZSA9IGVuYWJsZWRQbHVnaW5zUG9saWN5LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGhvb2tGaWxlczogSVBsdWdpblByb21wdFBhdGhbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBwbHVnaW4gb2YgcGx1Z2lucykge1xuXHRcdFx0XHRpZiAoaXNDb250cmlidXRpb25FbmFibGVkKHBsdWdpbi5lbmFibGVtZW50LnJlYWQocmVhZGVyKSlcblx0XHRcdFx0XHQmJiAoIW1hbmFnZWRIb29rc09ubHlWYWx1ZSB8fCBpc0FnZW50UGx1Z2luRm9yY2VFbmFibGVkQnlQb2xpY3kocGx1Z2luLCBlbmFibGVkUGx1Z2luc1BvbGljeVZhbHVlKSkpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGhvb2sgb2YgcGx1Z2luLmhvb2tzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdFx0aG9va0ZpbGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR1cmk6IGhvb2sudXJpLFxuXHRcdFx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sXG5cdFx0XHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmhvb2ssXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGdldENhbm9uaWNhbFBsdWdpbkNvbW1hbmRJZChwbHVnaW4sIGhvb2sub3JpZ2luYWxJZCksXG5cdFx0XHRcdFx0XHRcdHBsdWdpblVyaTogcGx1Z2luLnVyaSxcblx0XHRcdFx0XHRcdFx0cGx1Z2luTGFiZWw6IHBsdWdpbi5sYWJlbCxcblx0XHRcdFx0XHRcdFx0c291cmNlOiBQcm9tcHRGaWxlU291cmNlLlBsdWdpbixcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wbHVnaW5Qcm9tcHRGaWxlc0J5VHlwZS5zZXQoUHJvbXB0c1R5cGUuaG9vaywgaG9va0ZpbGVzKTtcblx0XHRcdHRoaXMuY2FjaGVkRmlsZUxvY2F0aW9uc1tQcm9tcHRzVHlwZS5ob29rXSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkUGx1Z2luSG9va3NDaGFuZ2UuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgd2F0Y2hQbHVnaW5Qcm9tcHRGaWxlc0ZvclR5cGUoXG5cdFx0dHlwZTogUHJvbXB0c1R5cGUsXG5cdFx0Z2V0SXRlbXM6IChwbHVnaW46IElBZ2VudFBsdWdpbiwgcmVhZGVyOiBJUmVhZGVyKSA9PiByZWFkb25seSB7IHVyaTogVVJJOyBuYW1lOiBzdHJpbmcgfVtdLFxuXHQpIHtcblx0XHRyZXR1cm4gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2lucyA9IHRoaXMuYWdlbnRQbHVnaW5TZXJ2aWNlLnBsdWdpbnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbmV4dEZpbGVzOiBJUGx1Z2luUHJvbXB0UGF0aFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHBsdWdpbiBvZiBwbHVnaW5zKSB7XG5cdFx0XHRcdGlmICghaXNDb250cmlidXRpb25FbmFibGVkKHBsdWdpbi5lbmFibGVtZW50LnJlYWQocmVhZGVyKSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZ2V0SXRlbXMocGx1Z2luLCByZWFkZXIpKSB7XG5cdFx0XHRcdFx0bmV4dEZpbGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0dXJpOiBpdGVtLnVyaSxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbixcblx0XHRcdFx0XHRcdHR5cGUsXG5cdFx0XHRcdFx0XHRuYW1lOiBnZXRDYW5vbmljYWxQbHVnaW5Db21tYW5kSWQocGx1Z2luLCBpdGVtLm5hbWUpLFxuXHRcdFx0XHRcdFx0cGx1Z2luVXJpOiBwbHVnaW4udXJpLFxuXHRcdFx0XHRcdFx0cGx1Z2luTGFiZWw6IHBsdWdpbi5sYWJlbCxcblx0XHRcdFx0XHRcdHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5QbHVnaW4sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bmV4dEZpbGVzLnNvcnQoKGEsIGIpID0+IGAke2EubmFtZSA/PyAnJ318JHthLnVyaS50b1N0cmluZygpfWAubG9jYWxlQ29tcGFyZShgJHtiLm5hbWUgPz8gJyd9fCR7Yi51cmkudG9TdHJpbmcoKX1gKSk7XG5cdFx0XHR0aGlzLl9wbHVnaW5Qcm9tcHRGaWxlc0J5VHlwZS5zZXQodHlwZSwgbmV4dEZpbGVzKTtcblx0XHRcdHRoaXMuY2FjaGVkRmlsZUxvY2F0aW9uc1t0eXBlXSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX29uRGlkUGx1Z2luUHJvbXB0RmlsZXNDaGFuZ2UuZmlyZSh0eXBlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVQcm9tcHRGaWxlc0xvY2F0b3IoKTogUHJvbXB0RmlsZXNMb2NhdG9yIHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlc0xvY2F0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRGaWxlTG9jYXRvckV2ZW50KHR5cGU6IFByb21wdHNUeXBlKTogRXZlbnQ8dm9pZD4ge1xuXHRcdGxldCBldmVudCA9IHRoaXMuZmlsZUxvY2F0b3JFdmVudHNbdHlwZV07XG5cdFx0aWYgKCFldmVudCkge1xuXHRcdFx0ZXZlbnQgPSB0aGlzLmZpbGVMb2NhdG9yRXZlbnRzW3R5cGVdID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlTG9jYXRvci5jcmVhdGVGaWxlc1VwZGF0ZWRFdmVudCh0eXBlKSkuZXZlbnQ7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihldmVudCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2FjaGVkRmlsZUxvY2F0aW9uc1t0eXBlXSA9IHVuZGVmaW5lZDtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIGV2ZW50O1xuXHR9XG5cblx0cHVibGljIGdldFBhcnNlZFByb21wdEZpbGUodGV4dE1vZGVsOiBJVGV4dE1vZGVsKTogUGFyc2VkUHJvbXB0RmlsZSB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jYWNoZWRQYXJzZWRQcm9tcHRGcm9tTW9kZWxzLmdldCh0ZXh0TW9kZWwudXJpKTtcblx0XHRpZiAoY2FjaGVkICYmIGNhY2hlZFswXSA9PT0gdGV4dE1vZGVsLmdldFZlcnNpb25JZCgpKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGVkWzFdO1xuXHRcdH1cblx0XHRjb25zdCBhc3QgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHRleHRNb2RlbC51cmksIHRleHRNb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHRpZiAoIWNhY2hlZCB8fCBjYWNoZWRbMF0gPCB0ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCkpIHtcblx0XHRcdHRoaXMuY2FjaGVkUGFyc2VkUHJvbXB0RnJvbU1vZGVscy5zZXQodGV4dE1vZGVsLnVyaSwgW3RleHRNb2RlbC5nZXRWZXJzaW9uSWQoKSwgYXN0XSk7XG5cdFx0fVxuXHRcdHJldHVybiBhc3Q7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgbGlzdFByb21wdEZpbGVzKHR5cGU6IFByb21wdHNUeXBlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElQcm9tcHRQYXRoW10+IHtcblx0XHRsZXQgbGlzdFByb21pc2UgPSB0aGlzLmNhY2hlZEZpbGVMb2NhdGlvbnNbdHlwZV07XG5cdFx0aWYgKCFsaXN0UHJvbWlzZSkge1xuXHRcdFx0bGlzdFByb21pc2UgPSB0aGlzLmNvbXB1dGVMaXN0UHJvbXB0RmlsZXModHlwZSwgdG9rZW4pO1xuXHRcdFx0aWYgKCF0aGlzLmZpbGVMb2NhdG9yRXZlbnRzW3R5cGVdKSB7XG5cdFx0XHRcdHJldHVybiBsaXN0UHJvbWlzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY2FjaGVkRmlsZUxvY2F0aW9uc1t0eXBlXSA9IGxpc3RQcm9taXNlO1xuXHRcdFx0cmV0dXJuIGxpc3RQcm9taXNlO1xuXHRcdH1cblx0XHRyZXR1cm4gbGlzdFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVMaXN0UHJvbXB0RmlsZXModHlwZTogUHJvbXB0c1R5cGUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgSVByb21wdFBhdGhbXT4ge1xuXHRcdGNvbnN0IGFsbG93U3RhbmRhbG9uZSA9ICF0aGlzLmFyZVN0YW5kYWxvbmVQcm9tcHRGaWxlc0Jsb2NrZWQodHlwZSk7XG5cdFx0Y29uc3QgcHJvbXB0cyA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGFsbG93U3RhbmRhbG9uZSA/IHRoaXMuZmlsZUxvY2F0b3IubGlzdEZpbGVzKHR5cGUsIFByb21wdHNTdG9yYWdlLnVzZXIsIHRva2VuKS50aGVuKHVyaXMgPT4gdXJpcy5tYXAodXJpID0+ICh7IHVyaSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZSB9IHNhdGlzZmllcyBJVXNlclByb21wdFBhdGgpKSkgOiBbXSxcblx0XHRcdGFsbG93U3RhbmRhbG9uZSA/IHRoaXMuZmlsZUxvY2F0b3IubGlzdEZpbGVzKHR5cGUsIFByb21wdHNTdG9yYWdlLmxvY2FsLCB0b2tlbikudGhlbih1cmlzID0+IHVyaXMubWFwKHVyaSA9PiAoeyB1cmksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlIH0gc2F0aXNmaWVzIElMb2NhbFByb21wdFBhdGgpKSkgOiBbXSxcblx0XHRcdHRoaXMuZ2V0RXh0ZW5zaW9uUHJvbXB0RmlsZXModHlwZSwgdG9rZW4pLFxuXHRcdFx0dGhpcy5fcGx1Z2luUHJvbXB0RmlsZXNCeVR5cGUuZ2V0KHR5cGUpID8/IFtdLFxuXHRcdFx0dGhpcy5nZXRCdWlsdGluUHJvbXB0RmlsZXModHlwZSwgdG9rZW4pLFxuXHRcdF0pO1xuXG5cdFx0cmV0dXJuIHByb21wdHMuZmxhdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbGxlY3RzIGRpYWdub3N0aWMgaW5mb3JtYXRpb24gYWJvdXQgd2hpY2ggc291cmNlIGZvbGRlcnMgd2VyZSBzZWFyY2hlZCBmb3IgZGlzcGxheSBpbiB0aGUgZGVidWcgcGFuZWwuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jb2xsZWN0U291cmNlRm9sZGVyRGlhZ25vc3RpY3ModHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPElQcm9tcHRTb3VyY2VGb2xkZXJSZXN1bHRbXT4ge1xuXHRcdGlmICh0aGlzLmFyZVN0YW5kYWxvbmVQcm9tcHRGaWxlc0Jsb2NrZWQodHlwZSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb2x2ZWRGb2xkZXJzID0gYXdhaXQgdGhpcy5maWxlTG9jYXRvci5nZXRTb3VyY2VGb2xkZXJzSW5EaXNjb3ZlcnlPcmRlcih0eXBlKTtcblx0XHRyZXR1cm4gcmVzb2x2ZWRGb2xkZXJzLm1hcChmb2xkZXIgPT4gKHtcblx0XHRcdHVyaTogZm9sZGVyLnVyaSxcblx0XHRcdHN0b3JhZ2U6IGZvbGRlci5zdG9yYWdlLFxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBwcm9tcHQgZmlsZSBwcm92aWRlciAoQ3VzdG9tQWdlbnRQcm92aWRlciwgSW5zdHJ1Y3Rpb25zUHJvdmlkZXIsIG9yIFByb21wdEZpbGVQcm92aWRlcikuXG5cdCAqIFRoaXMgd2lsbCBiZSBjYWxsZWQgYnkgdGhlIGV4dGVuc2lvbiBob3N0IGJyaWRnZSB3aGVuXG5cdCAqIGFuIGV4dGVuc2lvbiByZWdpc3RlcnMgYSBwcm92aWRlciB2aWEgdnNjb2RlLmNoYXQucmVnaXN0ZXJDdXN0b21BZ2VudFByb3ZpZGVyKCksXG5cdCAqIHJlZ2lzdGVySW5zdHJ1Y3Rpb25zUHJvdmlkZXIoKSwgb3IgcmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoKS5cblx0ICovXG5cdHB1YmxpYyByZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdHlwZTogUHJvbXB0c1R5cGUsIHByb3ZpZGVyOiB7XG5cdFx0b25EaWRDaGFuZ2VQcm9tcHRGaWxlcz86IEV2ZW50PHZvaWQ+O1xuXHRcdHByb3ZpZGVQcm9tcHRGaWxlczogKGNvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPElQcm9tcHRGaWxlUmVzb3VyY2VbXSB8IHVuZGVmaW5lZD47XG5cdH0pOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uUHJvbXB0RmlsZXMucmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uLCB0eXBlLCBwcm92aWRlcik7XG5cdH1cblxuXG5cdHB1YmxpYyBhc3luYyBsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlKHR5cGU6IFByb21wdHNUeXBlLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJUHJvbXB0UGF0aFtdPiB7XG5cdFx0bGV0IHByb21wdFBhdGhzOiByZWFkb25seSBJUHJvbXB0UGF0aFtdO1xuXHRcdHN3aXRjaCAoc3RvcmFnZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb246XG5cdFx0XHRcdHByb21wdFBhdGhzID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25Qcm9tcHRGaWxlcyh0eXBlLCB0b2tlbik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5sb2NhbDpcblx0XHRcdFx0cHJvbXB0UGF0aHMgPSB0aGlzLmFyZVN0YW5kYWxvbmVQcm9tcHRGaWxlc0Jsb2NrZWQodHlwZSkgPyBbXSA6IGF3YWl0IHRoaXMuZmlsZUxvY2F0b3IubGlzdEZpbGVzKHR5cGUsIFByb21wdHNTdG9yYWdlLmxvY2FsLCB0b2tlbikudGhlbih1cmlzID0+IHVyaXMubWFwKHVyaSA9PiAoeyB1cmksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlIH0gc2F0aXNmaWVzIElMb2NhbFByb21wdFBhdGgpKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS51c2VyOlxuXHRcdFx0XHRwcm9tcHRQYXRocyA9IHRoaXMuYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZCh0eXBlKSA/IFtdIDogYXdhaXQgdGhpcy5maWxlTG9jYXRvci5saXN0RmlsZXModHlwZSwgUHJvbXB0c1N0b3JhZ2UudXNlciwgdG9rZW4pLnRoZW4odXJpcyA9PiB1cmlzLm1hcCh1cmkgPT4gKHsgdXJpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlIH0gc2F0aXNmaWVzIElVc2VyUHJvbXB0UGF0aCkpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLnBsdWdpbjpcblx0XHRcdFx0cHJvbXB0UGF0aHMgPSB0aGlzLl9wbHVnaW5Qcm9tcHRGaWxlc0J5VHlwZS5nZXQodHlwZSkgPz8gW107XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5idWlsdEluOlxuXHRcdFx0XHRwcm9tcHRQYXRocyA9IGF3YWl0IHRoaXMuZ2V0QnVpbHRpblByb21wdEZpbGVzKHR5cGUsIHRva2VuKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlXSBVbnN1cHBvcnRlZCBwcm9tcHQgc3RvcmFnZSB0eXBlOiAke3N0b3JhZ2V9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb21wdFBhdGhzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFeHRlbnNpb25Qcm9tcHRGaWxlcyh0eXBlOiBQcm9tcHRzVHlwZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJRXh0ZW5zaW9uUHJvbXB0UGF0aFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uUHJvbXB0RmlsZXMuZ2V0RXh0ZW5zaW9uUHJvbXB0RmlsZXModHlwZSwgdG9rZW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGJ1aWx0LWluIHByb21wdCBmaWxlcyBvZiB0aGUgZ2l2ZW4gdHlwZS4gVGhlIGJhc2Ugc2VydmljZSBzaGlwc1xuXHQgKiBubyBidWlsdC1pbiBwcm9tcHRzOyBzdWJjbGFzc2VzIChlLmcuIHRoZSBBZ2VudHMgYXBwKSBvdmVycmlkZSB0aGlzIHRvXG5cdCAqIGNvbnRyaWJ1dGUgYnVuZGxlZCBwcm9tcHRzIHN1Y2ggYXMgYnVpbHQtaW4gc2tpbGxzLlxuXHQgKi9cblx0cHJvdGVjdGVkIGFzeW5jIGdldEJ1aWx0aW5Qcm9tcHRGaWxlcyh0eXBlOiBQcm9tcHRzVHlwZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJQnVpbHRpblByb21wdFBhdGhbXT4ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRTb3VyY2VGb2xkZXJzKHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxyZWFkb25seSBJUHJvbXB0UGF0aFtdPiB7XG5cdFx0aWYgKHRoaXMuYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZCh0eXBlKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IElQcm9tcHRQYXRoW10gPSBbXTtcblxuXHRcdGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5ob29rKSB7XG5cdFx0XHQvLyBGb3IgaG9va3MsIHJldHVybiB0aGUgQ29waWxvdCBob29rcyBmb2xkZXIgZm9yIGNyZWF0aW5nIG5ldyBob29rc1xuXHRcdFx0Ly8gKENsYXVkZSBwYXRocyBhcmUgcmVhZC1vbmx5IGFuZCBub3QgaW5jbHVkZWQgaGVyZSlcblx0XHRcdGNvbnN0IGhvb2tzRm9sZGVycyA9IGF3YWl0IHRoaXMuZmlsZUxvY2F0b3IuZ2V0SG9va1NvdXJjZUZvbGRlcnMoKTtcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIGhvb2tzRm9sZGVycykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogZm9sZGVyLnVyaSwgc3RvcmFnZTogZm9sZGVyLnN0b3JhZ2UsIHR5cGUsIHNvdXJjZTogZm9sZGVyLnNvdXJjZSB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHQvLyBTa2lsbHMgaGF2ZSBib3RoIHdvcmtzcGFjZSBhbmQgdXNlci1sZXZlbCBzb3VyY2UgZm9sZGVycyAoZS5nLlxuXHRcdFx0Ly8gfi8uY29waWxvdC9za2lsbHMpLiBVc2UgdGhlIHJlc29sdmVkIHNvdXJjZSBmb2xkZXJzIHNvIGVhY2hcblx0XHRcdC8vIGxvY2F0aW9uIHJlcG9ydHMgaXRzIGFjdHVhbCBzdG9yYWdlIChsb2NhbCB2cyB1c2VyKSwgb3RoZXJ3aXNlXG5cdFx0XHQvLyBjcmVhdGluZyBhIHVzZXItbGV2ZWwgc2tpbGwgZmFpbHMgd2l0aCBcIk5vIHNraWxsIHNvdXJjZSBmb2xkZXJzIGZvdW5kXCIuXG5cdFx0XHRjb25zdCByZXNvbHZlZEZvbGRlcnMgPSBhd2FpdCB0aGlzLmZpbGVMb2NhdG9yLmdldFJlc29sdmVkU291cmNlRm9sZGVycyh0eXBlKTtcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHJlc29sdmVkRm9sZGVycykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogZm9sZGVyLnNlYXJjaFJvb3QsIHN0b3JhZ2U6IGZvbGRlci5zdG9yYWdlLCB0eXBlLCBzb3VyY2U6IGZvbGRlci5zb3VyY2UgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgdXJpIG9mIGF3YWl0IHRoaXMuZmlsZUxvY2F0b3IuZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzKHR5cGUpKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHVyaSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGUgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlckhvbWUgPSB0aGlzLnVzZXJEYXRhU2VydmljZS5jdXJyZW50UHJvZmlsZS5wcm9tcHRzSG9tZTtcblx0XHRyZXN1bHQucHVzaCh7IHVyaTogdXNlckhvbWUsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGUgfSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFJlc29sdmVkU291cmNlRm9sZGVycyh0eXBlOiBQcm9tcHRzVHlwZSk6IFByb21pc2U8cmVhZG9ubHkgSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10+IHtcblx0XHRpZiAodGhpcy5hcmVTdGFuZGFsb25lUHJvbXB0RmlsZXNCbG9ja2VkKHR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmZpbGVMb2NhdG9yLmdldFJlc29sdmVkU291cmNlRm9sZGVycyh0eXBlKTtcblx0fVxuXG5cdHByaXZhdGUgYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZCh0eXBlOiBQcm9tcHRzVHlwZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0cmljdFBsdWdpbk9ubHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uPihDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRyk7XG5cdFx0cmV0dXJuIGlzUHJvbXB0VHlwZUJsb2NrZWQoc3RyaWN0UGx1Z2luT25seSwgdHlwZSlcblx0XHRcdHx8ICh0eXBlID09PSBQcm9tcHRzVHlwZS5ob29rICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHKSA9PT0gdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFyZUFnZW50SG9va3NBbGxvd2VkKHByb21wdFBhdGg6IElQcm9tcHRQYXRoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHKSA9PT0gdHJ1ZSkge1xuXHRcdFx0aWYgKHByb21wdFBhdGguc3RvcmFnZSAhPT0gUHJvbXB0c1N0b3JhZ2UucGx1Z2luIHx8ICFwcm9tcHRQYXRoLnBsdWdpblVyaSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwbHVnaW4gPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpLmZpbmQoY2FuZGlkYXRlID0+IGlzRXF1YWwoY2FuZGlkYXRlLnVyaSwgcHJvbXB0UGF0aC5wbHVnaW5VcmkpKTtcblx0XHRcdGNvbnN0IGVuYWJsZWRQbHVnaW5zUG9saWN5ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5FbmFibGVkUGx1Z2lucykucG9saWN5VmFsdWU7XG5cdFx0XHRyZXR1cm4gcGx1Z2luICE9PSB1bmRlZmluZWQgJiYgaXNBZ2VudFBsdWdpbkZvcmNlRW5hYmxlZEJ5UG9saWN5KHBsdWdpbiwgZW5hYmxlZFBsdWdpbnNQb2xpY3kpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0cmljdFBsdWdpbk9ubHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFN0cmljdFBsdWdpbk9ubHlDdXN0b21pemF0aW9uPihDT1BJTE9UX1NUUklDVF9QTFVHSU5fT05MWV9DVVNUT01JWkFUSU9OX0NPTkZJRyk7XG5cdFx0cmV0dXJuICFpc1Byb21wdFR5cGVCbG9ja2VkKHN0cmljdFBsdWdpbk9ubHksIFByb21wdHNUeXBlLmhvb2spXG5cdFx0XHR8fCAocHJvbXB0UGF0aC5zdG9yYWdlICE9PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCAmJiBwcm9tcHRQYXRoLnN0b3JhZ2UgIT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHR9XG5cblx0Ly8gc2xhc2ggcHJvbXB0IGNvbW1hbmRzXG5cblx0LyoqXG5cdCAqIEVtaXR0ZXIgZm9yIHNsYXNoIGNvbW1hbmRzIGNoYW5nZSBldmVudHMuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVkU2xhc2hDb21tYW5kcy5vbkRpZENoYW5nZVByb21pc2U7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0UHJvbXB0U2xhc2hDb21tYW5kcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElDaGF0UHJvbXB0U2xhc2hDb21tYW5kW10+IHtcblx0XHRjb25zdCBkaXNjb3ZlcnlJbmZvID0gYXdhaXQgdGhpcy5jYWNoZWRTbGFzaENvbW1hbmRzLmdldCh0b2tlbik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5zbGFzaENvbW1hbmRzRnJvbURpc2NvdmVyeUluZm8oZGlzY292ZXJ5SW5mbyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyBkaXNjb3ZlcnkgaW5mbyBmb3Igc2xhc2ggY29tbWFuZHMsIGNvbWJpbmluZyBwcm9tcHRzIGFuZCBza2lsbHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVTbGFzaENvbW1hbmREaXNjb3ZlcnlJbmZvKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNsYXNoQ29tbWFuZERpc2NvdmVyeUluZm8+IHtcblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKHRydWUpO1xuXHRcdGNvbnN0IHByb21wdEZpbGVzID0gYXdhaXQgdGhpcy5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUucHJvbXB0LCB0b2tlbik7XG5cdFx0Y29uc3QgdXNlQWdlbnRTa2lsbHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUyk7XG5cdFx0Y29uc3Qgc2tpbGxzID0gdXNlQWdlbnRTa2lsbHMgPyBhd2FpdCB0aGlzLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgdG9rZW4pIDogW107XG5cdFx0Y29uc3QgZGlzYWJsZWRTa2lsbHMgPSB0aGlzLmdldERpc2FibGVkUHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdC8vIE9yZGVyIHNraWxscyBieSBwcmVjZWRlbmNlIGJlZm9yZSBwYXJzaW5nIHNvIHRoYXQgdGhlIGR1cGxpY2F0ZS1uYW1lXG5cdFx0Ly8gZGVkdXAgYmVsb3cga2VlcHMgYSBkZXRlcm1pbmlzdGljIHdpbm5lciAoZS5nLiB3b3Jrc3BhY2Ugb3ZlciBwZXJzb25hbCkuXG5cdFx0Y29uc3QgZW5hYmxlZFNraWxscyA9IHNraWxsc1xuXHRcdFx0LmZpbHRlcihzID0+ICFkaXNhYmxlZFNraWxscy5oYXMocy51cmkpKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IHRoaXMuZ2V0U2tpbGxQcmlvcml0eShhKSAtIHRoaXMuZ2V0U2tpbGxQcmlvcml0eShiKSk7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kRmlsZXMgPSBbXG5cdFx0XHQuLi5wcm9tcHRGaWxlcyxcblx0XHRcdC4uLmVuYWJsZWRTa2lsbHMsXG5cdFx0XTtcblxuXHRcdGNvbnN0IHBhcnNlUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHNsYXNoQ29tbWFuZEZpbGVzLm1hcChhc3luYyBwcm9tcHRQYXRoID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFByb21wdEZpbGUgPSBhd2FpdCB0aGlzLnBhcnNlTmV3KHByb21wdFBhdGgudXJpLCB0b2tlbik7XG5cdFx0XHRcdGxldCByYXdOYW1lOiBzdHJpbmc7XG5cdFx0XHRcdGlmIChwcm9tcHRQYXRoLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHRcdFx0Ly8gRm9yIHNraWxscywgYWx3YXlzIHVzZSB0aGUgZm9sZGVyIG5hbWUgYXMgdGhlIGNhbm9uaWNhbCBuYW1lXG5cdFx0XHRcdFx0Ly8gKGNvbnNpc3RlbnQgd2l0aCBjb21wdXRlU2tpbGxEaXNjb3ZlcnlJbmZvKVxuXHRcdFx0XHRcdHJhd05hbWUgPSBnZXRTa2lsbEZvbGRlck5hbWUocHJvbXB0UGF0aC51cmkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJhd05hbWUgPSBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/Lm5hbWUgPz8gcHJvbXB0UGF0aC5uYW1lID8/IGdldENsZWFuUHJvbXB0TmFtZShwcm9tcHRQYXRoLnVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRm9yIHBsdWdpbiByZXNvdXJjZXMsIGVuc3VyZSB0aGUgY2Fub25pY2FsIHBsdWdpbiBwcmVmaXggaXMgYWx3YXlzIHByZXNlcnZlZCBldmVuIHdoZW4gdGhlXG5cdFx0XHRcdC8vIGZpbGUncyBmcm9udG1hdHRlciBvdmVycmlkZXMgdGhlIG5hbWUuXG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBwcm9tcHRQYXRoLnNvdXJjZSA9PT0gUHJvbXB0RmlsZVNvdXJjZS5QbHVnaW4gJiYgcHJvbXB0UGF0aC5wbHVnaW5Vcmlcblx0XHRcdFx0XHQ/IGdldENhbm9uaWNhbFBsdWdpbkNvbW1hbmRJZCh7IHVyaTogcHJvbXB0UGF0aC5wbHVnaW5VcmksIGxhYmVsOiBwcm9tcHRQYXRoLnBsdWdpbkxhYmVsIH0sIHJhd05hbWUpXG5cdFx0XHRcdFx0OiByYXdOYW1lO1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8uZGVzY3JpcHRpb24gPz8gcHJvbXB0UGF0aC5kZXNjcmlwdGlvbjtcblx0XHRcdFx0Y29uc3QgYXJndW1lbnRIaW50ID0gcGFyc2VkUHJvbXB0RmlsZT8uaGVhZGVyPy5hcmd1bWVudEhpbnQ7XG5cdFx0XHRcdGNvbnN0IHVzZXJJbnZvY2FibGUgPSBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/LnVzZXJJbnZvY2FibGU7XG5cdFx0XHRcdHJldHVybiB7IHN0YXR1czogJ2xvYWRlZCcsIHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShwcm9tcHRQYXRoLCBuYW1lLCBkZXNjcmlwdGlvbiksIGFyZ3VtZW50SGludCwgdXNlckludm9jYWJsZSB9IHNhdGlzZmllcyBJU2xhc2hDb21tYW5kRGlzY292ZXJ5UmVzdWx0O1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgW2NvbXB1dGVTbGFzaENvbW1hbmREaXNjb3ZlcnlJbmZvXSBGYWlsZWQgdG8gcGFyc2UgcHJvbXB0IGZpbGUgZm9yIHNsYXNoIGNvbW1hbmQ6ICR7cHJvbXB0UGF0aC51cml9YCwgZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpKTtcblx0XHRcdFx0cmV0dXJuIHsgc3RhdHVzOiAnc2tpcHBlZCcsIHNraXBSZWFzb246ICdwYXJzZS1lcnJvcicsIGVycm9yTWVzc2FnZTogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpLCBwcm9tcHRQYXRoIH0gc2F0aXNmaWVzIElTbGFzaENvbW1hbmREaXNjb3ZlcnlSZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGVkdXBsaWNhdGUgc2tpbGxzIHRoYXQgcmVzb2x2ZSB0byB0aGUgc2FtZSBjYW5vbmljYWwgbmFtZS4gVGhpcyBjYW5cblx0XHQvLyBoYXBwZW4gd2hlbiB0d28gc2tpbGwgbG9jYXRpb25zIHBvaW50IGF0IHRoZSBzYW1lIGZpbGVzLCBlLmcuIHdoZW5cblx0XHQvLyBgfi8uY2xhdWRlL3NraWxsc2AgaXMgYSBzeW1saW5rIHRvIGB+Ly5hZ2VudHMvc2tpbGxzYCAoY3JlYXRlZCBieVxuXHRcdC8vIGBucHggc2tpbGxzYCkuIFdpdGhvdXQgdGhpcywgZXZlcnkgc3VjaCBza2lsbCB3b3VsZCBhcHBlYXIgdHdpY2UgaW5cblx0XHQvLyB0aGUgYC9gIG1lbnUuIGBwYXJzZVJlc3VsdHNgIHByZXNlcnZlcyBpbnB1dCBvcmRlciwgc28gc2tpbGxzIGFyZVxuXHRcdC8vIGFscmVhZHkgc29ydGVkIGJ5IHByZWNlZGVuY2U7IHRoZSBmaXJzdCBvY2N1cnJlbmNlIG9mIGEgbmFtZSB3aW5zLlxuXHRcdGNvbnN0IHNlZW5Ta2lsbE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgZmlsZXM6IElTbGFzaENvbW1hbmREaXNjb3ZlcnlSZXN1bHRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVzdWx0IG9mIHBhcnNlUmVzdWx0cykge1xuXHRcdFx0aWYgKHJlc3VsdC5zdGF0dXMgPT09ICdsb2FkZWQnICYmIHJlc3VsdC5wcm9tcHRQYXRoLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSByZXN1bHQucHJvbXB0UGF0aC5uYW1lO1xuXHRcdFx0XHRpZiAobmFtZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aWYgKHNlZW5Ta2lsbE5hbWVzLmhhcyhuYW1lKSkge1xuXHRcdFx0XHRcdFx0ZmlsZXMucHVzaCh7IHN0YXR1czogJ3NraXBwZWQnLCBza2lwUmVhc29uOiAnZHVwbGljYXRlLW5hbWUnLCBwcm9tcHRQYXRoOiByZXN1bHQucHJvbXB0UGF0aCB9KTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzZWVuU2tpbGxOYW1lcy5hZGQobmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZpbGVzLnB1c2gocmVzdWx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9tcHRTb3VyY2VGb2xkZXJzID0gYXdhaXQgdGhpcy5fY29sbGVjdFNvdXJjZUZvbGRlckRpYWdub3N0aWNzKFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0Y29uc3Qgc291cmNlRm9sZGVycyA9IFsuLi5wcm9tcHRTb3VyY2VGb2xkZXJzXTtcblxuXHRcdGlmICh1c2VBZ2VudFNraWxscykge1xuXHRcdFx0Y29uc3Qgc2tpbGxTb3VyY2VGb2xkZXJzID0gYXdhaXQgdGhpcy5fY29sbGVjdFNvdXJjZUZvbGRlckRpYWdub3N0aWNzKFByb21wdHNUeXBlLnNraWxsKTtcblx0XHRcdHNvdXJjZUZvbGRlcnMucHVzaCguLi5za2lsbFNvdXJjZUZvbGRlcnMpO1xuXHRcdH1cblx0XHRyZXR1cm4geyB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIGZpbGVzLCBzb3VyY2VGb2xkZXJzLCBkdXJhdGlvbkluTWlsbGlzOiBzdG9wV2F0Y2guZWxhcHNlZCgpIH07XG5cdH1cblxuXHQvKipcblx0ICogRGVyaXZlcyBJQ2hhdFByb21wdFNsYXNoQ29tbWFuZFtdIGZyb20gY2FjaGVkIGRpc2NvdmVyeSBpbmZvLlxuXHQgKi9cblx0cHJpdmF0ZSBzbGFzaENvbW1hbmRzRnJvbURpc2NvdmVyeUluZm8oZGlzY292ZXJ5SW5mbzogSVNsYXNoQ29tbWFuZERpc2NvdmVyeUluZm8pOiByZWFkb25seSBJQ2hhdFByb21wdFNsYXNoQ29tbWFuZFtdIHtcblx0XHRjb25zdCByZXN1bHQ6IElDaGF0UHJvbXB0U2xhc2hDb21tYW5kW10gPSBbXTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZGlzY292ZXJ5SW5mby5maWxlcykge1xuXHRcdFx0aWYgKGZpbGUuc3RhdHVzID09PSAnbG9hZGVkJykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLmFzQ2hhdFByb21wdFNsYXNoQ29tbWFuZChmaWxlLmFyZ3VtZW50SGludCwgZmlsZS51c2VySW52b2NhYmxlLCBmaWxlLnByb21wdFBhdGgpKTtcblx0XHRcdFx0c2Vlbi5hZGQoZmlsZS5wcm9tcHRQYXRoLnVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSW5jbHVkZSB1bnRpdGxlZCBwcm9tcHQgbW9kZWxzIG5vdCBjb3ZlcmVkIGJ5IGRpc2NvdmVyeVxuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWxzKCkpIHtcblx0XHRcdGlmIChtb2RlbC5nZXRMYW5ndWFnZUlkKCkgPT09IFBST01QVF9MQU5HVUFHRV9JRCAmJiBtb2RlbC51cmkuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkICYmICFzZWVuLmhhcyhtb2RlbC51cmkpKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFByb21wdEZpbGUgPSB0aGlzLmdldFBhcnNlZFByb21wdEZpbGUobW9kZWwpO1xuXHRcdFx0XHRjb25zdCBuYW1lID0gcGFyc2VkUHJvbXB0RmlsZT8uaGVhZGVyPy5uYW1lID8/IGdldENsZWFuUHJvbXB0TmFtZShtb2RlbC51cmkpO1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8uZGVzY3JpcHRpb247XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuYXNDaGF0UHJvbXB0U2xhc2hDb21tYW5kKHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8uYXJndW1lbnRIaW50LCBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/LnVzZXJJbnZvY2FibGUsIHsgdXJpOiBtb2RlbC51cmksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWUsIGRlc2NyaXB0aW9uIH0pKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGlzVmFsaWRTbGFzaENvbW1hbmROYW1lKGNvbW1hbmQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjb21tYW5kLm1hdGNoKC9eW1xccHtMfVxcZF9cXC1cXC46XSskL3UpICE9PSBudWxsO1xuXHR9XG5cblx0cHVibGljIGhhc1Byb21wdFNsYXNoQ29tbWFuZChuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMua25vd25Qcm9tcHRTbGFzaENvbW1hbmRzSHlkcmF0aW9uU3RhcnRlZCkge1xuXHRcdFx0dGhpcy5rbm93blByb21wdFNsYXNoQ29tbWFuZHNIeWRyYXRpb25TdGFydGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMucmVmcmVzaEtub3duUHJvbXB0U2xhc2hDb21tYW5kTmFtZXMoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzKCgpID0+IHRoaXMucmVmcmVzaEtub3duUHJvbXB0U2xhc2hDb21tYW5kTmFtZXMoKSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5rbm93blByb21wdFNsYXNoQ29tbWFuZE5hbWVzLmhhcyhuYW1lKTtcblx0fVxuXG5cdHByaXZhdGUga25vd25Qcm9tcHRTbGFzaENvbW1hbmRzSHlkcmF0aW9uU3RhcnRlZCA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVmcmVzaEtub3duUHJvbXB0U2xhc2hDb21tYW5kTmFtZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLnRoZW4oY29tbWFuZHMgPT4ge1xuXHRcdFx0dGhpcy5rbm93blByb21wdFNsYXNoQ29tbWFuZE5hbWVzLmNsZWFyKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNtZCBvZiBjb21tYW5kcykge1xuXHRcdFx0XHR0aGlzLmtub3duUHJvbXB0U2xhc2hDb21tYW5kTmFtZXMuYWRkKGNtZC5uYW1lKTtcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7IC8qIGRpc2NvdmVyeSBmYWlsdXJlcyBhbHJlYWR5IGxvZ2dlZDsgc3luYyBjYWNoZSBzdGF5cyBhcy1pcyAqLyB9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlUHJvbXB0U2xhc2hDb21tYW5kKG5hbWU6IHN0cmluZywgc2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmVzb2x2ZWRDaGF0UHJvbXB0U2xhc2hDb21tYW5kIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCB0aGlzLmdldFByb21wdFNsYXNoQ29tbWFuZHModG9rZW4pO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBjb21tYW5kcy5maW5kKGNtZCA9PiBjbWQubmFtZSA9PT0gbmFtZSAmJiBtYXRjaGVzU2Vzc2lvblR5cGUoY21kLnNlc3Npb25UeXBlcywgc2Vzc2lvblR5cGUpKTtcblx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uY29tbWFuZCxcblx0XHRcdFx0cGFyc2VkUHJvbXB0RmlsZTogYXdhaXQgdGhpcy5wYXJzZU5ldyhjb21tYW5kLnVyaSwgdG9rZW4pLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXNDaGF0UHJvbXB0U2xhc2hDb21tYW5kKGFyZ3VtZW50SGludDogc3RyaW5nIHwgdW5kZWZpbmVkLCB1c2VySW52b2NhYmxlOiBib29sZWFuIHwgdW5kZWZpbmVkLCBwcm9tcHRQYXRoOiBJUHJvbXB0UGF0aCk6IElDaGF0UHJvbXB0U2xhc2hDb21tYW5kIHtcblx0XHRsZXQgbmFtZSA9IHByb21wdFBhdGgubmFtZSA/PyBnZXRDbGVhblByb21wdE5hbWUocHJvbXB0UGF0aC51cmkpO1xuXHRcdG5hbWUgPSBuYW1lLnJlcGxhY2UoL1teXFxwe0x9XFxkX1xcLVxcLjpdKy9ndSwgJy0nKTsgLy8gcmVwbGFjZSBzcGFjZXMgd2l0aCBkYXNoZXNcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiBwcm9tcHRQYXRoLnVyaSxcblx0XHRcdG5hbWU6IG5hbWUsXG5cdFx0XHRzb3VyY2U6IHByb21wdFBhdGguc291cmNlLFxuXHRcdFx0c3RvcmFnZTogcHJvbXB0UGF0aC5zdG9yYWdlLFxuXHRcdFx0dHlwZTogcHJvbXB0UGF0aC50eXBlLFxuXHRcdFx0ZXh0ZW5zaW9uOiBwcm9tcHRQYXRoLmV4dGVuc2lvbixcblx0XHRcdHBsdWdpblVyaTogcHJvbXB0UGF0aC5wbHVnaW5VcmksXG5cdFx0XHRwbHVnaW5MYWJlbDogcHJvbXB0UGF0aC5wbHVnaW5MYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiBwcm9tcHRQYXRoLmRlc2NyaXB0aW9uLFxuXHRcdFx0YXJndW1lbnRIaW50OiBhcmd1bWVudEhpbnQsXG5cdFx0XHR1c2VySW52b2NhYmxlOiB1c2VySW52b2NhYmxlID8/IHRydWUsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IHByb21wdFBhdGguc2Vzc2lvblR5cGVzLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0UHJvbXB0U2xhc2hDb21tYW5kTmFtZSh1cmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gYXdhaXQgdGhpcy5nZXRQcm9tcHRTbGFzaENvbW1hbmRzKHRva2VuKTtcblx0XHRjb25zdCBzbGFzaENvbW1hbmQgPSBzbGFzaENvbW1hbmRzLmZpbmQoYyA9PiBpc0VxdWFsKGMudXJpLCB1cmkpKTtcblx0XHRpZiAoIXNsYXNoQ29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIGdldENsZWFuUHJvbXB0TmFtZSh1cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2xhc2hDb21tYW5kLm5hbWU7XG5cdH1cblxuXHQvLyBjdXN0b20gYWdlbnRzXG5cblx0LyoqXG5cdCAqIEVtaXR0ZXIgZm9yIGN1c3RvbSBhZ2VudHMgY2hhbmdlIGV2ZW50cy5cblx0ICovXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNhY2hlZEN1c3RvbUFnZW50cy5vbkRpZENoYW5nZVByb21pc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5jYWNoZWRJbnN0cnVjdGlvbnMub25EaWRDaGFuZ2VQcm9taXNlO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zKCk6IEV2ZW50PHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VBZ2VudEluc3RydWN0aW9ucy5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRDdXN0b21BZ2VudHModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJQ3VzdG9tQWdlbnRbXT4ge1xuXHRcdGNvbnN0IGRpc2NvdmVyeUluZm8gPSBhd2FpdCB0aGlzLmNhY2hlZEN1c3RvbUFnZW50cy5nZXQodG9rZW4pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuYWdlbnRzRnJvbURpc2NvdmVyeUluZm8oZGlzY292ZXJ5SW5mbyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXJpdmVzIElDdXN0b21BZ2VudFtdIGZyb20gY2FjaGVkIGRpc2NvdmVyeSBpbmZvLlxuXHQgKi9cblx0cHJpdmF0ZSBhZ2VudHNGcm9tRGlzY292ZXJ5SW5mbyhkaXNjb3ZlcnlJbmZvOiBJQWdlbnREaXNjb3ZlcnlJbmZvKTogcmVhZG9ubHkgSUN1c3RvbUFnZW50W10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUN1c3RvbUFnZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZGlzY292ZXJ5SW5mby5maWxlcykge1xuXHRcdFx0aWYgKGZpbGUuYWdlbnQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goZmlsZS5hZ2VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVBZ2VudERpc2NvdmVyeUluZm8odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWdlbnREaXNjb3ZlcnlJbmZvPiB7XG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSh0cnVlKTtcblx0XHRjb25zdCBhbGxBZ2VudEZpbGVzID0gYXdhaXQgdGhpcy5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuYWdlbnQsIHRva2VuKTtcblx0XHRjb25zdCBkaXNhYmxlZEFnZW50cyA9IHRoaXMuZ2V0RGlzYWJsZWRQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0Y29uc3QgdXNlQ2hhdEhvb2tzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTKTtcblx0XHRjb25zdCBpc1dvcmtzcGFjZVRydXN0ZWQgPSB0aGlzLndvcmtzcGFjZVRydXN0U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKTtcblxuXHRcdC8vIEdldCB1c2VyIGhvbWUgZm9yIHRpbGRlIGV4cGFuc2lvbiBpbiBob29rIGN3ZCBwYXRoc1xuXHRcdGNvbnN0IHVzZXJIb21lVXJpID0gYXdhaXQgdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdGNvbnN0IHVzZXJIb21lID0gdXNlckhvbWVVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyB1c2VySG9tZVVyaS5mc1BhdGggOiB1c2VySG9tZVVyaS5wYXRoO1xuXHRcdGNvbnN0IGRlZmF1bHRGb2xkZXIgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXTtcblxuXHRcdGNvbnN0IGZpbGVzID0gYXdhaXQgUHJvbWlzZS5hbGwoYWxsQWdlbnRGaWxlcy5tYXAoYXN5bmMgKHByb21wdFBhdGgpOiBQcm9taXNlPElBZ2VudERpc2NvdmVyeVJlc3VsdD4gPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gcHJvbXB0UGF0aC51cmk7XG5cdFx0XHRjb25zdCBpc0VuYWJsZWQgPSAhZGlzYWJsZWRBZ2VudHMuaGFzKHVyaSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFzdCA9IGF3YWl0IHRoaXMucGFyc2VOZXcodXJpLCB0b2tlbik7XG5cblx0XHRcdFx0Ly8gUGFyc2UgaG9va3MgZnJvbSB0aGUgZnJvbnRtYXR0ZXIgaWYgcHJlc2VudFxuXHRcdFx0XHRsZXQgaG9va3M6IENoYXRSZXF1ZXN0SG9va3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGhvb2tzUmF3ID0gYXN0LmhlYWRlcj8uaG9va3NSYXc7XG5cdFx0XHRcdGlmICh1c2VDaGF0SG9va3MgJiYgaXNXb3Jrc3BhY2VUcnVzdGVkICYmIGhvb2tzUmF3ICYmIHRoaXMuYXJlQWdlbnRIb29rc0FsbG93ZWQocHJvbXB0UGF0aCkpIHtcblx0XHRcdFx0XHRjb25zdCBob29rV29ya3NwYWNlRm9sZGVyID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcih1cmkpID8/IGRlZmF1bHRGb2xkZXI7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlUm9vdFVyaSA9IGhvb2tXb3Jrc3BhY2VGb2xkZXI/LnVyaTtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSBnZXRUYXJnZXQoUHJvbXB0c1R5cGUuYWdlbnQsIGFzdC5oZWFkZXIgPz8gcHJvbXB0UGF0aC51cmkpO1xuXHRcdFx0XHRcdGhvb2tzID0gcGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWwoaG9va3NSYXcsIHdvcmtzcGFjZVJvb3RVcmksIHVzZXJIb21lLCB0YXJnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGV4dHJhID0ge1xuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogcHJvbXB0UGF0aC5zZXNzaW9uVHlwZXMsXG5cdFx0XHRcdFx0aG9va3MsXG5cdFx0XHRcdFx0bmFtZTogcHJvbXB0UGF0aC5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBwcm9tcHRQYXRoLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHNvdXJjZTogSUFnZW50U291cmNlLmZyb21Qcm9tcHRQYXRoKHByb21wdFBhdGgpLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IGlzRW5hYmxlZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSBDdXN0b21BZ2VudC5mcm9tUGFyc2VkUHJvbXB0RmlsZShhc3QsIGV4dHJhKTtcblx0XHRcdFx0Y29uc3Qgc3RhdHVzID0gaXNFbmFibGVkID8gJ2xvYWRlZCcgOiAnc2tpcHBlZCc7XG5cdFx0XHRcdGNvbnN0IHNraXBSZWFzb24gPSBpc0VuYWJsZWQgPyB1bmRlZmluZWQgOiAnZGlzYWJsZWQnO1xuXHRcdFx0XHRyZXR1cm4geyBzdGF0dXMsIHNraXBSZWFzb24sIHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShwcm9tcHRQYXRoLCBhZ2VudC5uYW1lLCBhZ2VudC5kZXNjcmlwdGlvbiksIGFnZW50IH07XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IG5ldyBFcnJvcihTdHJpbmcoZSkpO1xuXHRcdFx0XHRpZiAoZXJyb3IgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZXJyb3IuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLndhcm4oYFtjb21wdXRlQWdlbnREaXNjb3ZlcnlJbmZvXSBTa2lwcGluZyBhZ2VudCBmaWxlIHRoYXQgZG9lcyBub3QgZXhpc3Q6ICR7dXJpfWAsIGVycm9yLm1lc3NhZ2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IoYFtjb21wdXRlQWdlbnREaXNjb3ZlcnlJbmZvXSBGYWlsZWQgdG8gcGFyc2UgYWdlbnQgZmlsZTogJHt1cml9YCwgZXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRcdFx0c2tpcFJlYXNvbjogJ3BhcnNlLWVycm9yJyxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IGVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdFx0cHJvbXB0UGF0aCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzb3VyY2VGb2xkZXJzID0gYXdhaXQgdGhpcy5fY29sbGVjdFNvdXJjZUZvbGRlckRpYWdub3N0aWNzKFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRyZXR1cm4geyB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCwgZmlsZXMsIHNvdXJjZUZvbGRlcnMsIGR1cmF0aW9uSW5NaWxsaXM6IHN0b3BXYXRjaC5lbGFwc2VkKCkgfTtcblx0fVxuXG5cblx0cHVibGljIGFzeW5jIHBhcnNlTmV3KHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFBhcnNlZFByb21wdEZpbGU+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHVyaSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsKTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlQ29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFByb21wdEZpbGVQYXJzZXIoKS5wYXJzZSh1cmksIGZpbGVDb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKHR5cGU6IFByb21wdHNUeXBlLCB1cmk6IFVSSSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIG5hbWU/OiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nLCB3aGVuPzogc3RyaW5nLCBzZXNzaW9uVHlwZXM/OiByZWFkb25seSBzdHJpbmdbXSkge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvblByb21wdEZpbGVzLnJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKHR5cGUsIHVyaSwgZXh0ZW5zaW9uLCBuYW1lLCBkZXNjcmlwdGlvbiwgd2hlbiwgc2Vzc2lvblR5cGVzKTtcblx0fVxuXG5cdGdldFByb21wdExvY2F0aW9uTGFiZWwocHJvbXB0UGF0aDogSVByb21wdFBhdGgpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAocHJvbXB0UGF0aC5zdG9yYWdlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLmxvY2FsOiByZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZGlybmFtZShwcm9tcHRQYXRoLnVyaSksIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLnVzZXI6IHJldHVybiBsb2NhbGl6ZSgndXNlci1kYXRhLWRpci5jYXBpdGFsaXplZCcsICdVc2VyIERhdGEnKTtcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uOiB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZXh0ZW5zaW9uLndpdGguaWQnLCAnRXh0ZW5zaW9uOiB7MH0nLCBwcm9tcHRQYXRoLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBwcm9tcHRQYXRoLmV4dGVuc2lvbi5pZCk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLnBsdWdpbjogcmV0dXJuIGxvY2FsaXplKCdwbHVnaW4uY2FwaXRhbGl6ZWQnLCAnUGx1Z2luJyk7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLmJ1aWx0SW46IHJldHVybiBsb2NhbGl6ZSgnYnVpbHRpbi5jYXBpdGFsaXplZCcsICdCdWlsdC1pbicpO1xuXHRcdFx0ZGVmYXVsdDogYXNzZXJ0TmV2ZXIocHJvbXB0UGF0aCwgJ1Vua25vd24gcHJvbXB0IHN0b3JhZ2UgdHlwZScpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBsaXN0TmVzdGVkQWdlbnRNRHModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXT4ge1xuXHRcdGlmICh0aGlzLmFyZVN0YW5kYWxvbmVQcm9tcHRGaWxlc0Jsb2NrZWQoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCB1c2VBZ2VudE1EID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9NRCk7XG5cdFx0aWYgKCF1c2VBZ2VudE1EKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHVzZU5lc3RlZEFnZW50TUQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX05FU1RFRF9BR0VOVF9NRCk7XG5cdFx0aWYgKHVzZU5lc3RlZEFnZW50TUQpIHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmZpbGVMb2NhdG9yLmZpbmRBZ2VudE1Ec0luV29ya3NwYWNlKHRva2VuKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGxpc3RBZ2VudEluc3RydWN0aW9ucyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGxvZ2dlcjogTG9nZ2VyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXT4ge1xuXHRcdGlmICh0aGlzLmFyZVN0YW5kYWxvbmVQcm9tcHRGaWxlc0Jsb2NrZWQoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXNvbHZlZEFnZW50RmlsZXM6IElBZ2VudEluc3RydWN0aW9uRmlsZVtdID0gW107XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8SUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10+W10gPSBbXTtcblxuXHRcdGNvbnN0IGluY2x1ZGVQYXJlbnRzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1MpID09PSB0cnVlO1xuXHRcdGNvbnN0IHJvb3RGb2xkZXJzID0gYXdhaXQgdGhpcy5maWxlTG9jYXRvci5nZXRXb3Jrc3BhY2VGb2xkZXJSb290cyhpbmNsdWRlUGFyZW50cywgbG9nZ2VyKTtcblxuXHRcdGNvbnN0IHJvb3RGaWxlczogSVdvcmtzcGFjZUluc3RydWN0aW9uRmlsZVtdID0gW107XG5cdFx0Y29uc3QgdXNlQWdlbnRNRCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfTUQpO1xuXHRcdGlmICghdXNlQWdlbnRNRCkge1xuXHRcdFx0bG9nZ2VyPy5sb2dJbmZvKCdBZ2VudCBNRCBmaWxlcyBhcmUgZGlzYWJsZWQgdmlhIGNvbmZpZ3VyYXRpb24uJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJvb3RGaWxlcy5wdXNoKHsgZmlsZU5hbWU6IEFHRU5UX01EX0ZJTEVOQU1FLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuYWdlbnRzTWQgfSk7XG5cdFx0fVxuXHRcdGNvbnN0IHVzZUNsYXVkZU1EID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9DTEFVREVfTUQpO1xuXHRcdGlmICghdXNlQ2xhdWRlTUQpIHtcblx0XHRcdGxvZ2dlcj8ubG9nSW5mbygnQ2xhdWRlIE1EIGZpbGVzIGFyZSBkaXNhYmxlZCB2aWEgY29uZmlndXJhdGlvbi4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY2xhdWRlTWRGaWxlID0geyBmaWxlTmFtZTogQ0xBVURFX01EX0ZJTEVOQU1FLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuY2xhdWRlTWQgfTtcblx0XHRcdHJvb3RGaWxlcy5wdXNoKGNsYXVkZU1kRmlsZSk7IC8vIENMQVVERS5tZCBpbiB3b3Jrc3BhY2Ugcm9vdFxuXHRcdFx0cm9vdEZpbGVzLnB1c2goeyBmaWxlTmFtZTogQ0xBVURFX0xPQ0FMX01EX0ZJTEVOQU1FLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuY2xhdWRlTWQgfSk7IC8vIENMQVVERS5sb2NhbC5tZCBpbiB3b3Jrc3BhY2Ugcm9vdFxuXG5cdFx0XHRwcm9taXNlcy5wdXNoKHRoaXMuZmlsZUxvY2F0b3IuZmluZEZpbGVzSW5Sb290cyhyb290Rm9sZGVycywgQ0xBVURFX0NPTkZJR19GT0xERVIsIFtjbGF1ZGVNZEZpbGVdLCB0b2tlbiwgcmVzb2x2ZWRBZ2VudEZpbGVzKSk7IC8vIENMQVVERS5tZCBpbiAuY2xhdWRlIGZvbGRlciB1bmRlciB3b3Jrc3BhY2Ugcm9vdFxuXHRcdFx0cHJvbWlzZXMucHVzaCh0aGlzLmZpbGVMb2NhdG9yLmZpbmRGaWxlc0luUm9vdHMoW2F3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKV0sIENMQVVERV9DT05GSUdfRk9MREVSLCBbY2xhdWRlTWRGaWxlXSwgdG9rZW4sIHJlc29sdmVkQWdlbnRGaWxlcykpOyAvLyBDTEFVREUubWQgaW4gaW4gfi8uY2xhdWRlIGZvbGRlclxuXHRcdH1cblx0XHRjb25zdCB1c2VDb3BpbG90SW5zdHJ1Y3Rpb25zRmlsZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NPUElMT1RfSU5TVFJVQ1RJT05fRklMRVMpO1xuXHRcdGlmICghdXNlQ29waWxvdEluc3RydWN0aW9uc0ZpbGVzKSB7XG5cdFx0XHRsb2dnZXI/LmxvZ0luZm8oJ0NvcGlsb3QgaW5zdHJ1Y3Rpb25zIGZpbGVzIGFyZSBkaXNhYmxlZCB2aWEgY29uZmlndXJhdGlvbi4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY29waWxvdEluc3RydWN0aW9uc0ZpbGUgPSB7IGZpbGVOYW1lOiBDT1BJTE9UX0NVU1RPTV9JTlNUUlVDVElPTlNfRklMRU5BTUUsIHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5jb3BpbG90SW5zdHJ1Y3Rpb25zTWQgfTtcblx0XHRcdHByb21pc2VzLnB1c2godGhpcy5maWxlTG9jYXRvci5maW5kRmlsZXNJblJvb3RzKHJvb3RGb2xkZXJzLCBHSVRIVUJfQ09ORklHX0ZPTERFUiwgW2NvcGlsb3RJbnN0cnVjdGlvbnNGaWxlXSwgdG9rZW4sIHJlc29sdmVkQWdlbnRGaWxlcykpOyAvLyBjb3BpbG90LWluc3RydWN0aW9ucy5tZCBpbiAuZ2l0aHViIGZvbGRlciB1bmRlciB3b3Jrc3BhY2Ugcm9vdFxuXHRcdFx0cHJvbWlzZXMucHVzaCh0aGlzLmZpbGVMb2NhdG9yLmZpbmRGaWxlc0luUm9vdHMoW2F3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKV0sIENPUElMT1RfQ09ORklHX0ZPTERFUiwgW2NvcGlsb3RJbnN0cnVjdGlvbnNGaWxlXSwgdG9rZW4sIHJlc29sdmVkQWdlbnRGaWxlcykpOyAvLyBjb3BpbG90LWluc3RydWN0aW9ucy5tZCBpbiB+Ly5jb3BpbG90IGZvbGRlclxuXHRcdH1cblxuXHRcdHByb21pc2VzLnB1c2godGhpcy5maWxlTG9jYXRvci5maW5kRmlsZXNJblJvb3RzKHJvb3RGb2xkZXJzLCB1bmRlZmluZWQsIHJvb3RGaWxlcywgdG9rZW4sIHJlc29sdmVkQWdlbnRGaWxlcykpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHQvLyBmaXJzdCBsb29rIGF0IG5vbi1zeW1saW5rZWQgZmlsZXMsIHRoZW4gYWRkIHN5bWxpbmtzIG9ubHkgaWYgdGFyZ2V0IG5vdCBhbHJlYWR5IGluY2x1ZGVkXG5cdFx0Y29uc3Qgc2VlbkZpbGVVUkkgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRjb25zdCBzeW1saW5rczogKElBZ2VudEluc3RydWN0aW9uRmlsZSAmIHsgcmVhbFBhdGg6IFVSSSB9KVtdID0gW107XG5cdFx0Y29uc3QgcmVzdWx0OiBJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXSA9IFtdO1xuXHRcdGNvbnN0IGFkZCA9IChmaWxlOiBJQWdlbnRJbnN0cnVjdGlvbkZpbGUpID0+IHtcblx0XHRcdGlmIChmaWxlLnJlYWxQYXRoKSB7XG5cdFx0XHRcdHN5bWxpbmtzLnB1c2goZmlsZSBhcyBJQWdlbnRJbnN0cnVjdGlvbkZpbGUgJiB7IHJlYWxQYXRoOiBVUkkgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQucHVzaChmaWxlKTtcblx0XHRcdFx0c2VlbkZpbGVVUkkuYWRkKGZpbGUudXJpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH07XG5cdFx0cmVzb2x2ZWRBZ2VudEZpbGVzLmZvckVhY2goYWRkKTtcblx0XHRmb3IgKGNvbnN0IHN5bWxpbmsgb2Ygc3ltbGlua3MpIHtcblx0XHRcdGlmIChzZWVuRmlsZVVSSS5oYXMoc3ltbGluay5yZWFsUGF0aCkpIHtcblx0XHRcdFx0bG9nZ2VyPy5sb2dJbmZvKGBTa2lwcGluZyBzeW1saW5rZWQgYWdlbnQgaW5zdHJ1Y3Rpb25zIGZpbGUgJHtzeW1saW5rLnVyaX0gYXMgdGFyZ2V0IGFscmVhZHkgaW5jbHVkZWQ6ICR7c3ltbGluay5yZWFsUGF0aH1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHN5bWxpbmspO1xuXHRcdFx0XHRzZWVuRmlsZVVSSS5hZGQoc3ltbGluay5yZWFsUGF0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQuc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRWb2ljZUluc3RydWN0aW9ucyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldFNwZWVjaEluc3RydWN0aW9ucyhWT0lDRV9JTlNUUlVDVElPTlNfRklMRU5BTUUsICd2b2ljZScsIHRva2VuKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXREaWN0YXRpb25JbnN0cnVjdGlvbnModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTcGVlY2hJbnN0cnVjdGlvbnMoRElDVEFUSU9OX0lOU1RSVUNUSU9OU19GSUxFTkFNRSwgJ2RpY3RhdGlvbicsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0U3BlZWNoSW5zdHJ1Y3Rpb25zKGZpbGVOYW1lOiBzdHJpbmcsIGtpbmQ6ICd2b2ljZScgfCAnZGljdGF0aW9uJywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBbam9pblBhdGgodXNlckhvbWUsIENPUElMT1RfQ09ORklHX0ZPTERFUiwgZmlsZU5hbWUpXTtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZVJvb3RzID0gYXdhaXQgdGhpcy5maWxlTG9jYXRvci5nZXRXb3Jrc3BhY2VGb2xkZXJSb290cyhmYWxzZSk7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNhbmRpZGF0ZXMucHVzaCguLi53b3Jrc3BhY2VSb290cy5tYXAocm9vdCA9PiBqb2luUGF0aChyb290LCBHSVRIVUJfQ09ORklHX0ZPTERFUiwgZmlsZU5hbWUpKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgY2FuZGlkYXRlcykge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoY2FuZGlkYXRlLCB1bmRlZmluZWQsIHRva2VuKSkudmFsdWUudG9TdHJpbmcoKS50cmltKCk7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRjb250ZW50cy5wdXNoKGNvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghKGVycm9yIGluc3RhbmNlb2YgRmlsZU9wZXJhdGlvbkVycm9yICYmIGVycm9yLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIud2FybihgW1Byb21wdHNTZXJ2aWNlXSBGYWlsZWQgdG8gcmVhZCAke2tpbmR9IGluc3RydWN0aW9ucyBmcm9tICR7Y2FuZGlkYXRlLnRvU3RyaW5nKCl9OiAke2Vycm9yfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZW50cy5sZW5ndGggPiAwID8gY29udGVudHMuam9pbignXFxuXFxuJykgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWdlbnRGaWxlVVJJRnJvbU1vZGVGaWxlKG9sZFVSSTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlTG9jYXRvci5nZXRBZ2VudEZpbGVVUklGcm9tTW9kZUZpbGUob2xkVVJJKTtcblx0fVxuXG5cdC8vIC0tLSBFbmFibGVkIFByb21wdCBGaWxlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzYWJsZWRQcm9tcHRzU3RvcmFnZUtleVByZWZpeCA9ICdjaGF0LmRpc2FibGVkUHJvbXB0RmlsZXMuJztcblxuXHRwdWJsaWMgZ2V0RGlzYWJsZWRQcm9tcHRGaWxlcyh0eXBlOiBQcm9tcHRzVHlwZSk6IFJlc291cmNlU2V0IHtcblx0XHQvLyBNaWdyYXRpb246IGlmIGRpc2FibGVkIGtleSBhYnNlbnQgYnV0IGxlZ2FjeSBlbmFibGVkIGtleSBwcmVzZW50LCBjb252ZXJ0IG9uY2UuXG5cdFx0Y29uc3QgZGlzYWJsZWRLZXkgPSB0aGlzLmRpc2FibGVkUHJvbXB0c1N0b3JhZ2VLZXlQcmVmaXggKyB0eXBlO1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoZGlzYWJsZWRLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnW10nKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYXJyID0gSlNPTi5wYXJzZSh2YWx1ZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShhcnIpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgcyBvZiBhcnIpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LmFkZChVUkkucmV2aXZlKHMpKTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlIGludmFsaWQgc3RvcmFnZSB2YWx1ZXNcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBzZXREaXNhYmxlZFByb21wdEZpbGVzKHR5cGU6IFByb21wdHNUeXBlLCB1cmlzOiBSZXNvdXJjZVNldCk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc2FibGVkID0gQXJyYXkuZnJvbSh1cmlzKS5tYXAodXJpID0+IHVyaS50b0pTT04oKSk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLmRpc2FibGVkUHJvbXB0c1N0b3JhZ2VLZXlQcmVmaXggKyB0eXBlLCBKU09OLnN0cmluZ2lmeShkaXNhYmxlZCksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdFx0dGhpcy5jYWNoZWRDdXN0b21BZ2VudHMucmVmcmVzaCgpO1xuXHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdHRoaXMuY2FjaGVkU2tpbGxzLnJlZnJlc2goKTtcblx0XHRcdHRoaXMuY2FjaGVkU2xhc2hDb21tYW5kcy5yZWZyZXNoKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWdlbnQgc2tpbGxzXG5cblx0cHJpdmF0ZSBzYW5pdGl6ZUFnZW50U2tpbGxUZXh0KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Ly8gUmVtb3ZlIFhNTCB0YWdzXG5cdFx0cmV0dXJuIHRleHQucmVwbGFjZSgvPFtePl0rPi9nLCAnJyk7XG5cdH1cblxuXHRwcml2YXRlIHRydW5jYXRlQWdlbnRTa2lsbE5hbWUobmFtZTogc3RyaW5nLCB1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgTUFYX05BTUVfTEVOR1RIID0gNjQ7XG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gdGhpcy5zYW5pdGl6ZUFnZW50U2tpbGxUZXh0KG5hbWUpO1xuXHRcdGlmIChzYW5pdGl6ZWQgIT09IG5hbWUpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbZmluZEFnZW50U2tpbGxzXSBBZ2VudCBza2lsbCBuYW1lIGNvbnRhaW5zIFhNTCB0YWdzLCByZW1vdmVkOiAke3VyaX1gKTtcblx0XHR9XG5cdFx0aWYgKHNhbml0aXplZC5sZW5ndGggPiBNQVhfTkFNRV9MRU5HVEgpIHtcblx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbZmluZEFnZW50U2tpbGxzXSBBZ2VudCBza2lsbCBuYW1lIGV4Y2VlZHMgJHtNQVhfTkFNRV9MRU5HVEh9IGNoYXJhY3RlcnMsIHRydW5jYXRlZDogJHt1cml9YCk7XG5cdFx0XHRyZXR1cm4gc2FuaXRpemVkLnN1YnN0cmluZygwLCBNQVhfTkFNRV9MRU5HVEgpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2FuaXRpemVkO1xuXHR9XG5cblx0cHJpdmF0ZSB0cnVuY2F0ZUFnZW50U2tpbGxEZXNjcmlwdGlvbihkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCB1cmk6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFkZXNjcmlwdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgTUFYX0RFU0NSSVBUSU9OX0xFTkdUSCA9IDEwMjQ7XG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gdGhpcy5zYW5pdGl6ZUFnZW50U2tpbGxUZXh0KGRlc2NyaXB0aW9uKTtcblx0XHRpZiAoc2FuaXRpemVkICE9PSBkZXNjcmlwdGlvbikge1xuXHRcdFx0dGhpcy5sb2dnZXIuZGVidWcoYFtmaW5kQWdlbnRTa2lsbHNdIEFnZW50IHNraWxsIGRlc2NyaXB0aW9uIGNvbnRhaW5zIFhNTCB0YWdzLCByZW1vdmVkOiAke3VyaX1gKTtcblx0XHR9XG5cdFx0aWYgKHNhbml0aXplZC5sZW5ndGggPiBNQVhfREVTQ1JJUFRJT05fTEVOR1RIKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW2ZpbmRBZ2VudFNraWxsc10gQWdlbnQgc2tpbGwgZGVzY3JpcHRpb24gZXhjZWVkcyAke01BWF9ERVNDUklQVElPTl9MRU5HVEh9IGNoYXJhY3RlcnMsIHRydW5jYXRlZDogJHt1cml9YCk7XG5cdFx0XHRyZXR1cm4gc2FuaXRpemVkLnN1YnN0cmluZygwLCBNQVhfREVTQ1JJUFRJT05fTEVOR1RIKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNhbml0aXplZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VTa2lsbHMoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNhY2hlZFNraWxscy5vbkRpZENoYW5nZVByb21pc2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlSG9va3MoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNhY2hlZEhvb2tzLm9uRGlkQ2hhbmdlUHJvbWlzZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBmaW5kQWdlbnRTa2lsbHModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWdlbnRTa2lsbFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdXNlQWdlbnRTa2lsbHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0FHRU5UX1NLSUxMUyk7XG5cdFx0aWYgKCF1c2VBZ2VudFNraWxscykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNjb3ZlcnlJbmZvID0gYXdhaXQgdGhpcy5jYWNoZWRTa2lsbHMuZ2V0KHRva2VuKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnNraWxsc0Zyb21EaXNjb3ZlcnlJbmZvKGRpc2NvdmVyeUluZm8pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogRGVyaXZlcyBJQWdlbnRTa2lsbFtdIGZyb20gY2FjaGVkIGRpc2NvdmVyeSBpbmZvLlxuXHQgKi9cblx0cHJpdmF0ZSBza2lsbHNGcm9tRGlzY292ZXJ5SW5mbyhkaXNjb3ZlcnlJbmZvOiBJUHJvbXB0RGlzY292ZXJ5SW5mbyk6IElBZ2VudFNraWxsW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUFnZW50U2tpbGxbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBkaXNjb3ZlcnlJbmZvLmZpbGVzKSB7XG5cdFx0XHRpZiAoZmlsZS5zdGF0dXMgPT09ICdsb2FkZWQnICYmIGZpbGUucHJvbXB0UGF0aC5uYW1lKSB7XG5cdFx0XHRcdGNvbnN0IHNhbml0aXplZERlc2NyaXB0aW9uID0gdGhpcy50cnVuY2F0ZUFnZW50U2tpbGxEZXNjcmlwdGlvbihmaWxlLnByb21wdFBhdGguZGVzY3JpcHRpb24sIGZpbGUucHJvbXB0UGF0aC51cmkpO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0dXJpOiBmaWxlLnByb21wdFBhdGgudXJpLFxuXHRcdFx0XHRcdHN0b3JhZ2U6IGZpbGUucHJvbXB0UGF0aC5zdG9yYWdlLFxuXHRcdFx0XHRcdG5hbWU6IGZpbGUucHJvbXB0UGF0aC5uYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBzYW5pdGl6ZWREZXNjcmlwdGlvbixcblx0XHRcdFx0XHRkaXNhYmxlTW9kZWxJbnZvY2F0aW9uOiBmaWxlLmRpc2FibGVNb2RlbEludm9jYXRpb24gPz8gZmFsc2UsXG5cdFx0XHRcdFx0dXNlckludm9jYWJsZTogZmlsZS51c2VySW52b2NhYmxlID8/IHRydWUsXG5cdFx0XHRcdFx0cGx1Z2luVXJpOiBmaWxlLnByb21wdFBhdGgucGx1Z2luVXJpLFxuXHRcdFx0XHRcdHBsdWdpbkxhYmVsOiBmaWxlLnByb21wdFBhdGgucGx1Z2luTGFiZWwsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBmaWxlLnByb21wdFBhdGguZXh0ZW5zaW9uLFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczogZmlsZS5wcm9tcHRQYXRoLnNlc3Npb25UeXBlcyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgdGhlIGZ1bGwgc2tpbGwgZGlzY292ZXJ5IGluZm8sIGluY2x1ZGluZyBzb3VyY2UgZm9sZGVycyBhbmQgdGVsZW1ldHJ5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBjb21wdXRlU2tpbGxEaXNjb3ZlcnkodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJvbXB0RGlzY292ZXJ5SW5mbz4ge1xuXHRcdGNvbnN0IHN0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUodHJ1ZSk7XG5cdFx0Y29uc3QgZmlsZXMgPSBhd2FpdCB0aGlzLmNvbXB1dGVTa2lsbERpc2NvdmVyeUluZm8odG9rZW4pO1xuXHRcdGNvbnN0IHNvdXJjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLl9jb2xsZWN0U291cmNlRm9sZGVyRGlhZ25vc3RpY3MoUHJvbXB0c1R5cGUuc2tpbGwpO1xuXG5cdFx0Ly8gQ291bnQgYnkgc291cmNlIGZvciB0ZWxlbWV0cnlcblx0XHRjb25zdCBza2lsbHNCeVNvdXJjZSA9IG5ldyBNYXA8UHJvbXB0RmlsZVNvdXJjZSwgbnVtYmVyPigpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0aWYgKGZpbGUuc3RhdHVzID09PSAnbG9hZGVkJyAmJiBmaWxlLnByb21wdFBhdGgubmFtZSkge1xuXHRcdFx0XHRjb25zdCBzb3VyY2UgPSBmaWxlLnByb21wdFBhdGguc291cmNlO1xuXHRcdFx0XHRpZiAoc291cmNlKSB7XG5cdFx0XHRcdFx0c2tpbGxzQnlTb3VyY2Uuc2V0KHNvdXJjZSwgKHNraWxsc0J5U291cmNlLmdldChzb3VyY2UpIHx8IDApICsgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb3VudCBza2lwIHJlYXNvbnMgZm9yIHRlbGVtZXRyeVxuXHRcdGxldCBza2lwcGVkTWlzc2luZ05hbWUgPSAwO1xuXHRcdGxldCBza2lwcGVkTWlzc2luZ0Rlc2NyaXB0aW9uID0gMDtcblx0XHRsZXQgc2tpcHBlZER1cGxpY2F0ZU5hbWUgPSAwO1xuXHRcdGxldCBza2lwcGVkUGFyc2VGYWlsZWQgPSAwO1xuXHRcdGxldCBza2lwcGVkTmFtZU1pc21hdGNoID0gMDtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdGlmIChmaWxlLnN0YXR1cyA9PT0gJ3NraXBwZWQnKSB7XG5cdFx0XHRcdHN3aXRjaCAoZmlsZS5za2lwUmVhc29uKSB7XG5cdFx0XHRcdFx0Y2FzZSAnbWlzc2luZy1uYW1lJzogc2tpcHBlZE1pc3NpbmdOYW1lKys7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ21pc3NpbmctZGVzY3JpcHRpb24nOiBza2lwcGVkTWlzc2luZ0Rlc2NyaXB0aW9uKys7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ2R1cGxpY2F0ZS1uYW1lJzogc2tpcHBlZER1cGxpY2F0ZU5hbWUrKzsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnbmFtZS1taXNtYXRjaCc6IHNraXBwZWROYW1lTWlzbWF0Y2grKzsgYnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncGFyc2UtZXJyb3InOiBza2lwcGVkUGFyc2VGYWlsZWQrKzsgYnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTZW5kIHRlbGVtZXRyeSBhYm91dCBza2lsbCB1c2FnZVxuXHRcdHR5cGUgQWdlbnRTa2lsbHNGb3VuZEV2ZW50ID0ge1xuXHRcdFx0dG90YWxTa2lsbHNGb3VuZDogbnVtYmVyO1xuXHRcdFx0Y2xhdWRlUGVyc29uYWw6IG51bWJlcjtcblx0XHRcdGNsYXVkZVdvcmtzcGFjZTogbnVtYmVyO1xuXHRcdFx0Y29waWxvdFBlcnNvbmFsOiBudW1iZXI7XG5cdFx0XHRnaXRodWJXb3Jrc3BhY2U6IG51bWJlcjtcblx0XHRcdGFnZW50c1BlcnNvbmFsOiBudW1iZXI7XG5cdFx0XHRhZ2VudHNXb3Jrc3BhY2U6IG51bWJlcjtcblx0XHRcdGNvbmZpZ1BlcnNvbmFsOiBudW1iZXI7XG5cdFx0XHRjb25maWdXb3Jrc3BhY2U6IG51bWJlcjtcblx0XHRcdGV4dGVuc2lvbkNvbnRyaWJ1dGlvbjogbnVtYmVyO1xuXHRcdFx0ZXh0ZW5zaW9uQVBJOiBudW1iZXI7XG5cdFx0XHRwbHVnaW46IG51bWJlcjtcblx0XHRcdHNraXBwZWREdXBsaWNhdGVOYW1lOiBudW1iZXI7XG5cdFx0XHRza2lwcGVkTWlzc2luZ05hbWU6IG51bWJlcjtcblx0XHRcdHNraXBwZWRNaXNzaW5nRGVzY3JpcHRpb246IG51bWJlcjtcblx0XHRcdHNraXBwZWROYW1lTWlzbWF0Y2g6IG51bWJlcjtcblx0XHRcdHNraXBwZWRQYXJzZUZhaWxlZDogbnVtYmVyO1xuXHRcdH07XG5cblx0XHR0eXBlIEFnZW50U2tpbGxzRm91bmRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdHRvdGFsU2tpbGxzRm91bmQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUb3RhbCBudW1iZXIgb2YgYWdlbnQgc2tpbGxzIGZvdW5kLicgfTtcblx0XHRcdGNsYXVkZVBlcnNvbmFsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIENsYXVkZSBwZXJzb25hbCBza2lsbHMuJyB9O1xuXHRcdFx0Y2xhdWRlV29ya3NwYWNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIENsYXVkZSB3b3Jrc3BhY2Ugc2tpbGxzLicgfTtcblx0XHRcdGNvcGlsb3RQZXJzb25hbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBDb3BpbG90IHBlcnNvbmFsIHNraWxscy4nIH07XG5cdFx0XHRnaXRodWJXb3Jrc3BhY2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgR2l0SHViIHdvcmtzcGFjZSBza2lsbHMuJyB9O1xuXHRcdFx0YWdlbnRzUGVyc29uYWw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgLmFnZW50cyBwZXJzb25hbCBza2lsbHMuJyB9O1xuXHRcdFx0YWdlbnRzV29ya3NwYWNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIC5hZ2VudHMgd29ya3NwYWNlIHNraWxscy4nIH07XG5cdFx0XHRjb25maWdQZXJzb25hbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBjdXN0b20gY29uZmlndXJlZCBwZXJzb25hbCBza2lsbHMuJyB9O1xuXHRcdFx0Y29uZmlnV29ya3NwYWNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGN1c3RvbSBjb25maWd1cmVkIHdvcmtzcGFjZSBza2lsbHMuJyB9O1xuXHRcdFx0ZXh0ZW5zaW9uQ29udHJpYnV0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGV4dGVuc2lvbiBjb250cmlidXRlZCBza2lsbHMuJyB9O1xuXHRcdFx0ZXh0ZW5zaW9uQVBJOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIGV4dGVuc2lvbiBBUEkgcHJvdmlkZWQgc2tpbGxzLicgfTtcblx0XHRcdHBsdWdpbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBwbHVnaW4gcHJvdmlkZWQgc2tpbGxzLicgfTtcblx0XHRcdHNraXBwZWREdXBsaWNhdGVOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHNraWxscyBza2lwcGVkIGR1ZSB0byBkdXBsaWNhdGUgbmFtZXMuJyB9O1xuXHRcdFx0c2tpcHBlZE1pc3NpbmdOYW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnTnVtYmVyIG9mIHNraWxscyBza2lwcGVkIGR1ZSB0byBtaXNzaW5nIG5hbWUgYXR0cmlidXRlLicgfTtcblx0XHRcdHNraXBwZWRNaXNzaW5nRGVzY3JpcHRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2Ygc2tpbGxzIHNraXBwZWQgZHVlIHRvIG1pc3NpbmcgZGVzY3JpcHRpb24gYXR0cmlidXRlLicgfTtcblx0XHRcdHNraXBwZWROYW1lTWlzbWF0Y2g6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2Ygc2tpbGxzIHNraXBwZWQgZHVlIHRvIG5hbWUgbm90IG1hdGNoaW5nIGZvbGRlciBuYW1lLicgfTtcblx0XHRcdHNraXBwZWRQYXJzZUZhaWxlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBza2lsbHMgc2tpcHBlZCBkdWUgdG8gcGFyc2UgZmFpbHVyZXMuJyB9O1xuXHRcdFx0b3duZXI6ICdwd2FuZzM0Nyc7XG5cdFx0XHRjb21tZW50OiAnVHJhY2tzIGFnZW50IHNraWxsIHVzYWdlLCBkaXNjb3ZlcnksIGFuZCBza2lwcGVkIGZpbGVzLic7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRvdGFsU2tpbGxzRm91bmQgPSBmaWxlcy5maWx0ZXIoZiA9PiBmLnN0YXR1cyA9PT0gJ2xvYWRlZCcgJiYgZi5wcm9tcHRQYXRoLm5hbWUpLmxlbmd0aDtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZ2VudFNraWxsc0ZvdW5kRXZlbnQsIEFnZW50U2tpbGxzRm91bmRDbGFzc2lmaWNhdGlvbj4oJ2FnZW50U2tpbGxzRm91bmQnLCB7XG5cdFx0XHR0b3RhbFNraWxsc0ZvdW5kLFxuXHRcdFx0Y2xhdWRlUGVyc29uYWw6IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLkNsYXVkZVBlcnNvbmFsKSA/PyAwLFxuXHRcdFx0Y2xhdWRlV29ya3NwYWNlOiBza2lsbHNCeVNvdXJjZS5nZXQoUHJvbXB0RmlsZVNvdXJjZS5DbGF1ZGVXb3Jrc3BhY2UpID8/IDAsXG5cdFx0XHRjb3BpbG90UGVyc29uYWw6IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLkNvcGlsb3RQZXJzb25hbCkgPz8gMCxcblx0XHRcdGdpdGh1YldvcmtzcGFjZTogc2tpbGxzQnlTb3VyY2UuZ2V0KFByb21wdEZpbGVTb3VyY2UuR2l0SHViV29ya3NwYWNlKSA/PyAwLFxuXHRcdFx0YWdlbnRzUGVyc29uYWw6IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLkFnZW50c1BlcnNvbmFsKSA/PyAwLFxuXHRcdFx0YWdlbnRzV29ya3NwYWNlOiBza2lsbHNCeVNvdXJjZS5nZXQoUHJvbXB0RmlsZVNvdXJjZS5BZ2VudHNXb3Jrc3BhY2UpID8/IDAsXG5cdFx0XHRjb25maWdXb3Jrc3BhY2U6IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLkNvbmZpZ1dvcmtzcGFjZSkgPz8gMCxcblx0XHRcdGNvbmZpZ1BlcnNvbmFsOiBza2lsbHNCeVNvdXJjZS5nZXQoUHJvbXB0RmlsZVNvdXJjZS5Db25maWdQZXJzb25hbCkgPz8gMCxcblx0XHRcdGV4dGVuc2lvbkNvbnRyaWJ1dGlvbjogc2tpbGxzQnlTb3VyY2UuZ2V0KFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQ29udHJpYnV0aW9uKSA/PyAwLFxuXHRcdFx0ZXh0ZW5zaW9uQVBJOiBza2lsbHNCeVNvdXJjZS5nZXQoUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25BUEkpID8/IDAsXG5cdFx0XHRwbHVnaW46IHNraWxsc0J5U291cmNlLmdldChQcm9tcHRGaWxlU291cmNlLlBsdWdpbikgPz8gMCxcblx0XHRcdHNraXBwZWREdXBsaWNhdGVOYW1lLFxuXHRcdFx0c2tpcHBlZE1pc3NpbmdOYW1lLFxuXHRcdFx0c2tpcHBlZE1pc3NpbmdEZXNjcmlwdGlvbixcblx0XHRcdHNraXBwZWROYW1lTWlzbWF0Y2gsXG5cdFx0XHRza2lwcGVkUGFyc2VGYWlsZWRcblx0XHR9KTtcblxuXHRcdHJldHVybiB7IHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBmaWxlcywgc291cmNlRm9sZGVycywgZHVyYXRpb25Jbk1pbGxpczogc3RvcFdhdGNoLmVsYXBzZWQoKSB9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldEhvb2tzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNvbmZpZ3VyZWRIb29rc0luZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBkaXNjb3ZlcnlJbmZvID0gYXdhaXQgdGhpcy5jYWNoZWRIb29rcy5nZXQodG9rZW4pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGRpc2NvdmVyeUluZm8uaG9va3NJbmZvO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0RGlzY292ZXJ5SW5mbyh0eXBlOiBQcm9tcHRzVHlwZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJvbXB0RGlzY292ZXJ5SW5mbz4ge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRcdHJldHVybiB0aGlzLmNhY2hlZEluc3RydWN0aW9ucy5nZXQodG9rZW4pO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmNhY2hlZFNsYXNoQ29tbWFuZHMuZ2V0KHRva2VuKTtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmNhY2hlZEN1c3RvbUFnZW50cy5nZXQodG9rZW4pO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDpcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2FjaGVkU2tpbGxzLmdldCh0b2tlbik7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmhvb2s6XG5cdFx0XHRcdHJldHVybiB0aGlzLmNhY2hlZEhvb2tzLmdldCh0b2tlbik7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldEluc3RydWN0aW9uRmlsZXModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJSW5zdHJ1Y3Rpb25GaWxlW10+IHtcblx0XHRjb25zdCBkaXNjb3ZlcnlJbmZvID0gYXdhaXQgdGhpcy5jYWNoZWRJbnN0cnVjdGlvbnMuZ2V0KHRva2VuKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmluc3RydWN0aW9uc0Zyb21EaXNjb3ZlcnlJbmZvKGRpc2NvdmVyeUluZm8pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGluc3RydWN0aW9uc0Zyb21EaXNjb3ZlcnlJbmZvKGRpc2NvdmVyeUluZm86IElJbnN0cnVjdGlvbkRpc2NvdmVyeUluZm8pOiBJSW5zdHJ1Y3Rpb25GaWxlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUluc3RydWN0aW9uRmlsZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGRpc2NvdmVyeUluZm8uZmlsZXMpIHtcblx0XHRcdGlmIChmaWxlLnN0YXR1cyA9PT0gJ2xvYWRlZCcgJiYgZmlsZS5wcm9tcHRQYXRoLm5hbWUpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHVyaTogZmlsZS5wcm9tcHRQYXRoLnVyaSxcblx0XHRcdFx0XHRzdG9yYWdlOiBmaWxlLnByb21wdFBhdGguc3RvcmFnZSxcblx0XHRcdFx0XHRleHRlbnNpb246IGZpbGUucHJvbXB0UGF0aC5leHRlbnNpb24sXG5cdFx0XHRcdFx0cGx1Z2luVXJpOiBmaWxlLnByb21wdFBhdGgucGx1Z2luVXJpLFxuXHRcdFx0XHRcdHNvdXJjZTogZmlsZS5wcm9tcHRQYXRoLnNvdXJjZSxcblx0XHRcdFx0XHRuYW1lOiBmaWxlLnByb21wdFBhdGgubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZmlsZS5wcm9tcHRQYXRoLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHBhdHRlcm46IGZpbGUucGF0dGVybixcblx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IGZpbGUucHJvbXB0UGF0aC5zZXNzaW9uVHlwZXMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoUHJvbXB0UGF0aE1ldGFkYXRhKHByb21wdFBhdGg6IElQcm9tcHRQYXRoLCBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJUHJvbXB0UGF0aCB7XG5cdFx0cmV0dXJuIHsgLi4ucHJvbXB0UGF0aCwgbmFtZSwgZGVzY3JpcHRpb24gfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZUluc3RydWN0aW9uRmlsZXModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJSW5zdHJ1Y3Rpb25EaXNjb3ZlcnlJbmZvPiB7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuZ2V0SW5zdHJ1Y3Rpb25zRGlzY292ZXJ5SW5mbyh0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVIb29rcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElIb29rRGlzY292ZXJ5SW5mbz4ge1xuXHRcdGNvbnN0IHN0b3BXYXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUodHJ1ZSk7XG5cdFx0Y29uc3QgdXNlQ2hhdEhvb2tzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9DSEFUX0hPT0tTKTtcblxuXHRcdGlmICghdXNlQ2hhdEhvb2tzIHx8ICF0aGlzLndvcmtzcGFjZVRydXN0U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0Y29uc3QgaG9va0ZpbGVzID0gYXdhaXQgdGhpcy5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaG9vaywgdG9rZW4pO1xuXHRcdFx0Y29uc3Qgc2tpcFJlYXNvbjogSVByb21wdEZpbGVEaXNjb3ZlcnlSZXN1bHRbJ3NraXBSZWFzb24nXSA9ICF1c2VDaGF0SG9va3MgPyAnZGlzYWJsZWQnIDogJ3dvcmtzcGFjZS11bnRydXN0ZWQnO1xuXHRcdFx0Y29uc3QgZmlsZXMgPSBob29rRmlsZXMubWFwKHByb21wdFBhdGggPT4gKHtcblx0XHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcgYXMgY29uc3QsXG5cdFx0XHRcdHNraXBSZWFzb24sXG5cdFx0XHRcdHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShwcm9tcHRQYXRoLCBiYXNlbmFtZShwcm9tcHRQYXRoLnVyaSksIHByb21wdFBhdGguZGVzY3JpcHRpb24pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3Qgc291cmNlRm9sZGVycyA9IGF3YWl0IHRoaXMuX2NvbGxlY3RTb3VyY2VGb2xkZXJEaWFnbm9zdGljcyhQcm9tcHRzVHlwZS5ob29rKTtcblx0XHRcdHJldHVybiB7IHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIGZpbGVzLCBzb3VyY2VGb2xkZXJzLCBob29rc0luZm86IHVuZGVmaW5lZCwgZHVyYXRpb25Jbk1pbGxpczogc3RvcFdhdGNoLmVsYXBzZWQoKSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZUNsYXVkZUhvb2tzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihQcm9tcHRzQ29uZmlnLlVTRV9DTEFVREVfSE9PS1MpO1xuXHRcdGNvbnN0IGhvb2tGaWxlcyA9IGF3YWl0IHRoaXMubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmhvb2ssIHRva2VuKTtcblxuXHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbUHJvbXB0c1NlcnZpY2VdIEZvdW5kICR7aG9va0ZpbGVzLmxlbmd0aH0gaG9vayBmaWxlKHMpLmApO1xuXG5cdFx0Ly8gR2V0IHVzZXIgaG9tZSBmb3IgdGlsZGUgZXhwYW5zaW9uXG5cdFx0Y29uc3QgdXNlckhvbWVVcmkgPSBhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSB1c2VySG9tZVVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSA/IHVzZXJIb21lVXJpLmZzUGF0aCA6IHVzZXJIb21lVXJpLnBhdGg7XG5cblx0XHRjb25zdCBkZWZhdWx0Rm9sZGVyID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF07XG5cblx0XHQvLyBQcm9jZXNzIGVhY2ggaG9vayBmaWxlIGluIHBhcmFsbGVsXG5cdFx0Y29uc3QgZmlsZVJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChob29rRmlsZXMubWFwKGFzeW5jIChob29rRmlsZSk6IFByb21pc2U8e1xuXHRcdFx0ZmlsZT86IElQcm9tcHRGaWxlRGlzY292ZXJ5UmVzdWx0O1xuXHRcdFx0aG9va3M/OiBNYXA8SG9va1R5cGUsIElQYXJzZWRIb29rQ29tbWFuZFtdPjtcblx0XHRcdHNvdXJjZVVyaT86IFVSSTtcblx0XHRcdGhhc0Rpc2FibGVkQ2xhdWRlSG9va3M/OiBib29sZWFuO1xuXHRcdH0+ID0+IHtcblx0XHRcdGNvbnN0IG5hbWUgPSBiYXNlbmFtZShob29rRmlsZS51cmkpO1xuXG5cdFx0XHQvLyBQbHVnaW5zIGFyZSBoYW5kbGVkIHNlcGFyYXRlbHkgZG93biBiZWxvdyBiZWNhdXNlIHRoZXkgZG8gdGhlaXIgb3duIHBhcnNpbmcraW50ZXJwb2xhdGlvblxuXHRcdFx0aWYgKGhvb2tGaWxlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbikge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZpbGU6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogJ2xvYWRlZCcsXG5cdFx0XHRcdFx0XHRwcm9tcHRQYXRoOiB0aGlzLndpdGhQcm9tcHRQYXRoTWV0YWRhdGEoaG9va0ZpbGUsIG5hbWUsIGhvb2tGaWxlLmRlc2NyaXB0aW9uKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShob29rRmlsZS51cmkpO1xuXHRcdFx0XHRjb25zdCBwYXJzZUVycm9yczogUGFyc2VFcnJvcltdID0gW107XG5cdFx0XHRcdGNvbnN0IGpzb24gPSBwYXJzZUpTT05DKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgcGFyc2VFcnJvcnMpO1xuXG5cdFx0XHRcdGlmIChwYXJzZUVycm9ycy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlyc3QgPSBwYXJzZUVycm9yc1swXTtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZ2V0UGFyc2VFcnJvck1lc3NhZ2UoZmlyc3QuZXJyb3IpIHx8ICdJbnZhbGlkIEpTT04nO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRmaWxlOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXR1czogJ3NraXBwZWQnLFxuXHRcdFx0XHRcdFx0XHRza2lwUmVhc29uOiAncGFyc2UtZXJyb3InLFxuXHRcdFx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IGAke21lc3NhZ2V9IGF0IG9mZnNldCAke2ZpcnN0Lm9mZnNldH1gLFxuXHRcdFx0XHRcdFx0XHRwcm9tcHRQYXRoOiB0aGlzLndpdGhQcm9tcHRQYXRoTWV0YWRhdGEoaG9va0ZpbGUsIG5hbWUsIGhvb2tGaWxlLmRlc2NyaXB0aW9uKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFZhbGlkYXRlIGl0J3MgYW4gb2JqZWN0XG5cdFx0XHRcdGlmICghanNvbiB8fCB0eXBlb2YganNvbiAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZmlsZToge1xuXHRcdFx0XHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0XHRcdFx0c2tpcFJlYXNvbjogJ3BhcnNlLWVycm9yJyxcblx0XHRcdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiAnSW52YWxpZCBob29rcyBmaWxlOiBtdXN0IGJlIGEgSlNPTiBvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRwcm9tcHRQYXRoOiB0aGlzLndpdGhQcm9tcHRQYXRoTWV0YWRhdGEoaG9va0ZpbGUsIG5hbWUsIGhvb2tGaWxlLmRlc2NyaXB0aW9uKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlc29sdmUgdGhlIHdvcmtzcGFjZSBmb2xkZXIgdGhhdCBjb250YWlucyB0aGlzIGhvb2sgZmlsZSBmb3IgY3dkIHJlc29sdXRpb24sXG5cdFx0XHRcdC8vIGZhbGxpbmcgYmFjayB0byB0aGUgZmlyc3Qgd29ya3NwYWNlIGZvbGRlciBmb3IgdXNlci1sZXZlbCBob29rcyBvdXRzaWRlIHRoZSB3b3Jrc3BhY2Vcblx0XHRcdFx0Y29uc3QgaG9va1dvcmtzcGFjZUZvbGRlciA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoaG9va0ZpbGUudXJpKSA/PyBkZWZhdWx0Rm9sZGVyO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VSb290VXJpID0gaG9va1dvcmtzcGFjZUZvbGRlcj8udXJpO1xuXG5cdFx0XHRcdC8vIFVzZSBmb3JtYXQtYXdhcmUgcGFyc2luZyB0aGF0IGhhbmRsZXMgQ29waWxvdCBhbmQgQ2xhdWRlIGZvcm1hdHNcblx0XHRcdFx0Y29uc3QgeyBmb3JtYXQsIGhvb2tzOiBwYXJzZWRIb29rcywgZGlzYWJsZWRBbGxIb29rcyB9ID0gcGFyc2VIb29rc0Zyb21GaWxlKGhvb2tGaWxlLnVyaSwganNvbiwgd29ya3NwYWNlUm9vdFVyaSwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdC8vIFNraXAgZmlsZXMgdGhhdCBoYXZlIGFsbCBob29rcyBkaXNhYmxlZFxuXHRcdFx0XHRpZiAoZGlzYWJsZWRBbGxIb29rcykge1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbUHJvbXB0c1NlcnZpY2VdIFNraXBwaW5nIGhvb2sgZmlsZSB3aXRoIGRpc2FibGVBbGxIb29rczogJHtob29rRmlsZS51cml9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGZpbGU6IHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRcdFx0XHRcdHNraXBSZWFzb246ICdhbGwtaG9va3MtZGlzYWJsZWQnLFxuXHRcdFx0XHRcdFx0XHRwcm9tcHRQYXRoOiB0aGlzLndpdGhQcm9tcHRQYXRoTWV0YWRhdGEoaG9va0ZpbGUsIG5hbWUsIGhvb2tGaWxlLmRlc2NyaXB0aW9uKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNraXAgQ2xhdWRlIGhvb2tzIHdoZW4gdGhlIHNldHRpbmcgaXMgZGlzYWJsZWQgKGFmdGVyIHBhcnNpbmcgdG8gY2hlY2sgZm9yIGNvbW1hbmRzKVxuXHRcdFx0XHRpZiAoZm9ybWF0ID09PSBIb29rU291cmNlRm9ybWF0LkNsYXVkZSAmJiB1c2VDbGF1ZGVIb29rcyA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRjb25zdCBoYXNBbnlDb21tYW5kcyA9IFsuLi5wYXJzZWRIb29rcy52YWx1ZXMoKV0uc29tZSgoeyBob29rczogY21kcyB9KSA9PiBjbWRzLmxlbmd0aCA+IDApO1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbUHJvbXB0c1NlcnZpY2VdIFNraXBwaW5nIENsYXVkZSBob29rIGZpbGUgKGRpc2FibGVkIHZpYSBzZXR0aW5nKTogJHtob29rRmlsZS51cml9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGZpbGU6IHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRcdFx0XHRcdHNraXBSZWFzb246ICdjbGF1ZGUtaG9va3MtZGlzYWJsZWQnLFxuXHRcdFx0XHRcdFx0XHRwcm9tcHRQYXRoOiB0aGlzLndpdGhQcm9tcHRQYXRoTWV0YWRhdGEoaG9va0ZpbGUsIG5hbWUsIGhvb2tGaWxlLmRlc2NyaXB0aW9uKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRoYXNEaXNhYmxlZENsYXVkZUhvb2tzOiBoYXNBbnlDb21tYW5kcyxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaG9va3MgPSBuZXcgTWFwPEhvb2tUeXBlLCBJUGFyc2VkSG9va0NvbW1hbmRbXT4oKTtcblx0XHRcdFx0Zm9yIChjb25zdCBbaG9va1R5cGUsIHsgaG9va3M6IGNvbW1hbmRzIH1dIG9mIHBhcnNlZEhvb2tzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRcdFx0XHRsZXQgYnVja2V0ID0gaG9va3MuZ2V0KGhvb2tUeXBlKTtcblx0XHRcdFx0XHRcdGlmICghYnVja2V0KSB7XG5cdFx0XHRcdFx0XHRcdGJ1Y2tldCA9IFtdO1xuXHRcdFx0XHRcdFx0XHRob29rcy5zZXQoaG9va1R5cGUsIGJ1Y2tldCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRidWNrZXQucHVzaChjb21tYW5kKTtcblx0XHRcdFx0XHRcdHRoaXMubG9nZ2VyLnRyYWNlKGBbUHJvbXB0c1NlcnZpY2VdIENvbGxlY3RlZCAke2hvb2tUeXBlfSBob29rIGZyb20gJHtob29rRmlsZS51cml9IChmb3JtYXQ6ICR7Zm9ybWF0fSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGZpbGU6IHsgc3RhdHVzOiAnbG9hZGVkJywgcHJvbXB0UGF0aDogdGhpcy53aXRoUHJvbXB0UGF0aE1ldGFkYXRhKGhvb2tGaWxlLCBuYW1lLCBob29rRmlsZS5kZXNjcmlwdGlvbikgfSxcblx0XHRcdFx0XHRob29rcyxcblx0XHRcdFx0XHRzb3VyY2VVcmk6IGhvb2tGaWxlLnVyaSxcblx0XHRcdFx0fTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGNvbnN0IG1zZyA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcblx0XHRcdFx0dGhpcy5sb2dnZXIud2FybihgW1Byb21wdHNTZXJ2aWNlXSBGYWlsZWQgdG8gcGFyc2UgaG9vayBmaWxlOiAke2hvb2tGaWxlLnVyaX1gLCBlcnJvcik7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZmlsZToge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRcdFx0XHRza2lwUmVhc29uOiAncGFyc2UtZXJyb3InLFxuXHRcdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBtc2csXG5cdFx0XHRcdFx0XHRwcm9tcHRQYXRoOiB0aGlzLndpdGhQcm9tcHRQYXRoTWV0YWRhdGEoaG9va0ZpbGUsIG5hbWUsIGhvb2tGaWxlLmRlc2NyaXB0aW9uKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE1lcmdlIHJlc3VsdHMgZnJvbSBwYXJhbGxlbCBwcm9jZXNzaW5nXG5cdFx0Y29uc3QgZmlsZXM6IElQcm9tcHRGaWxlRGlzY292ZXJ5UmVzdWx0W10gPSBbXTtcblx0XHRsZXQgaGFzRGlzYWJsZWRDbGF1ZGVIb29rcyA9IGZhbHNlO1xuXHRcdGNvbnN0IGNvbGxlY3RlZEhvb2tzID0gbmV3IE1hcDxIb29rVHlwZSwgSVBhcnNlZEhvb2tDb21tYW5kW10+KCk7XG5cblx0XHRmb3IgKGNvbnN0IHsgZmlsZSwgaG9va3MsIHNvdXJjZVVyaSwgaGFzRGlzYWJsZWRDbGF1ZGVIb29rczogZGlzYWJsZWQgfSBvZiBmaWxlUmVzdWx0cykge1xuXHRcdFx0aWYgKGZpbGUpIHtcblx0XHRcdFx0ZmlsZXMucHVzaChmaWxlKTtcblx0XHRcdH1cblx0XHRcdGlmIChkaXNhYmxlZCkge1xuXHRcdFx0XHRoYXNEaXNhYmxlZENsYXVkZUhvb2tzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmIChob29rcyAmJiBzb3VyY2VVcmkpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBbaG9va1R5cGUsIGNvbW1hbmRzXSBvZiBob29rcykge1xuXHRcdFx0XHRcdGxldCBidWNrZXQgPSBjb2xsZWN0ZWRIb29rcy5nZXQoaG9va1R5cGUpO1xuXHRcdFx0XHRcdGlmICghYnVja2V0KSB7XG5cdFx0XHRcdFx0XHRidWNrZXQgPSBbXTtcblx0XHRcdFx0XHRcdGNvbGxlY3RlZEhvb2tzLnNldChob29rVHlwZSwgYnVja2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNvbW1hbmRzKSB7XG5cdFx0XHRcdFx0XHRidWNrZXQucHVzaCh7IC4uLmNvbW1hbmQsIHNvdXJjZVVyaSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDb2xsZWN0IGhvb2tzIGZyb20gYWdlbnQgcGx1Z2luc1xuXHRcdGNvbnN0IHBsdWdpbnMgPSB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpO1xuXHRcdGNvbnN0IG1hbmFnZWRIb29rc09ubHlWYWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ09QSUxPVF9BTExPV19NQU5BR0VEX0hPT0tTX09OTFlfQ09ORklHKSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBlbmFibGVkUGx1Z2luc1BvbGljeVZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5FbmFibGVkUGx1Z2lucykucG9saWN5VmFsdWU7XG5cdFx0Zm9yIChjb25zdCBwbHVnaW4gb2YgcGx1Z2lucykge1xuXHRcdFx0aWYgKCFpc0NvbnRyaWJ1dGlvbkVuYWJsZWQocGx1Z2luLmVuYWJsZW1lbnQuZ2V0KCkpXG5cdFx0XHRcdHx8IChtYW5hZ2VkSG9va3NPbmx5VmFsdWUgJiYgIWlzQWdlbnRQbHVnaW5Gb3JjZUVuYWJsZWRCeVBvbGljeShwbHVnaW4sIGVuYWJsZWRQbHVnaW5zUG9saWN5VmFsdWUpKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgaG9vayBvZiBwbHVnaW4uaG9va3MuZ2V0KCkpIHtcblx0XHRcdFx0bGV0IGJ1Y2tldCA9IGNvbGxlY3RlZEhvb2tzLmdldChob29rLnR5cGUpO1xuXHRcdFx0XHRpZiAoIWJ1Y2tldCkge1xuXHRcdFx0XHRcdGJ1Y2tldCA9IFtdO1xuXHRcdFx0XHRcdGNvbGxlY3RlZEhvb2tzLnNldChob29rLnR5cGUsIGJ1Y2tldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGhvb2suaG9va3MpIHtcblx0XHRcdFx0XHRidWNrZXQucHVzaCh7IC4uLmNvbW1hbmQsIHNvdXJjZVVyaTogaG9vay51cmkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzb3VyY2VGb2xkZXJzID0gYXdhaXQgdGhpcy5fY29sbGVjdFNvdXJjZUZvbGRlckRpYWdub3N0aWNzKFByb21wdHNUeXBlLmhvb2spO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgYW55IGhvb2tzIHdlcmUgY29sbGVjdGVkXG5cdFx0aWYgKGNvbGxlY3RlZEhvb2tzLnNpemUgPT09IDApIHtcblx0XHRcdHRoaXMubG9nZ2VyLnRyYWNlKCdbUHJvbXB0c1NlcnZpY2VdIE5vIHZhbGlkIGhvb2tzIGNvbGxlY3RlZC4nKTtcblx0XHRcdHJldHVybiB7IHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIGZpbGVzLCBzb3VyY2VGb2xkZXJzLCBob29rc0luZm86IHVuZGVmaW5lZCwgZHVyYXRpb25Jbk1pbGxpczogc3RvcFdhdGNoLmVsYXBzZWQoKSB9O1xuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIHRoZSByZXN1bHRcblx0XHRjb25zdCByZXN1bHQ6IENoYXRSZXF1ZXN0SG9va3MgPSBPYmplY3QuZnJvbUVudHJpZXMoY29sbGVjdGVkSG9va3MpIGFzIENoYXRSZXF1ZXN0SG9va3M7XG5cblx0XHR0aGlzLmxvZ2dlci50cmFjZShgW1Byb21wdHNTZXJ2aWNlXSBDb2xsZWN0ZWQgaG9va3M6ICR7SlNPTi5zdHJpbmdpZnkoT2JqZWN0LmtleXMocmVzdWx0KSl9YCk7XG5cdFx0cmV0dXJuIHsgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgZmlsZXMsIHNvdXJjZUZvbGRlcnMsIGhvb2tzSW5mbzogeyBob29rczogcmVzdWx0LCBoYXNEaXNhYmxlZENsYXVkZUhvb2tzIH0sIGR1cmF0aW9uSW5NaWxsaXM6IHN0b3BXYXRjaC5lbGFwc2VkKCkgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcmVjZWRlbmNlIHVzZWQgd2hlbiBkZWR1cGxpY2F0aW5nIHNraWxscyB0aGF0IHNoYXJlIHRoZSBzYW1lIGNhbm9uaWNhbFxuXHQgKiBuYW1lOiB3b3Jrc3BhY2UgPiBwZXJzb25hbCA+IHBsdWdpbiA+IGV4dGVuc2lvbiBBUEkgPiBleHRlbnNpb24gY29udHJpYnV0aW9uLlxuXHQgKiBMb3dlciBudW1iZXJzIHdpbi5cblx0ICovXG5cdHByaXZhdGUgZ2V0U2tpbGxQcmlvcml0eShza2lsbDogSVByb21wdFBhdGgpOiBudW1iZXIge1xuXHRcdGlmIChza2lsbC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCkge1xuXHRcdFx0cmV0dXJuIDA7IC8vIHdvcmtzcGFjZVxuXHRcdH1cblx0XHRpZiAoc2tpbGwuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlcikge1xuXHRcdFx0cmV0dXJuIDE7IC8vIHBlcnNvbmFsXG5cdFx0fVxuXHRcdGlmIChza2lsbC5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5wbHVnaW4pIHtcblx0XHRcdHJldHVybiAyOyAvLyBwbHVnaW5cblx0XHR9XG5cdFx0aWYgKHNraWxsLnNvdXJjZSA9PT0gUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25BUEkpIHtcblx0XHRcdHJldHVybiAzO1xuXHRcdH1cblx0XHRpZiAoc2tpbGwuc291cmNlID09PSBQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkNvbnRyaWJ1dGlvbikge1xuXHRcdFx0cmV0dXJuIDQ7XG5cdFx0fVxuXHRcdHJldHVybiA1O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGRpc2NvdmVyeSByZXN1bHRzIGZvciBza2lsbCBmaWxlcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZVNraWxsRGlzY292ZXJ5SW5mbyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcm9tcHRGaWxlRGlzY292ZXJ5UmVzdWx0W10+IHtcblx0XHRjb25zdCBmaWxlczogSVByb21wdEZpbGVEaXNjb3ZlcnlSZXN1bHRbXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW5OYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IG5hbWVUb1VyaSA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cblx0XHQvLyBDb2xsZWN0IGFsbCBza2lsbHMgd2l0aCB0aGVpciBtZXRhZGF0YSBmb3Igc29ydGluZ1xuXHRcdGNvbnN0IGFsbFNraWxsczogQXJyYXk8SVByb21wdFBhdGg+ID0gW107XG5cdFx0Y29uc3Qgc3RhbmRhbG9uZVNraWxscyA9IHRoaXMuYXJlU3RhbmRhbG9uZVByb21wdEZpbGVzQmxvY2tlZChQcm9tcHRzVHlwZS5za2lsbClcblx0XHRcdD8gW11cblx0XHRcdDogYXdhaXQgdGhpcy5maWxlTG9jYXRvci5maW5kQWdlbnRTa2lsbHModG9rZW4pO1xuXHRcdGNvbnN0IHNraWxscyA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFByb21pc2UucmVzb2x2ZShzdGFuZGFsb25lU2tpbGxzKSxcblx0XHRcdHRoaXMuZ2V0RXh0ZW5zaW9uUHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuc2tpbGwsIHRva2VuKSxcblx0XHRcdFByb21pc2UucmVzb2x2ZSh0aGlzLl9wbHVnaW5Qcm9tcHRGaWxlc0J5VHlwZS5nZXQoUHJvbXB0c1R5cGUuc2tpbGwpID8/IFtdKSxcblx0XHRcdHRoaXMuZ2V0QnVpbHRpblByb21wdEZpbGVzKFByb21wdHNUeXBlLnNraWxsLCB0b2tlbilcblx0XHRdKTtcblx0XHRmb3IgKGNvbnN0IHNraWxsTGlzdCBvZiBza2lsbHMpIHtcblx0XHRcdGFsbFNraWxscy5wdXNoKC4uLnNraWxsTGlzdCk7XG5cdFx0fVxuXHRcdC8vIFN0YWJsZSBzb3J0OyB3ZSBzaG91bGQga2VlcCBvcmRlciBjb25zaXN0ZW50IHRvIHRoZSBvcmRlciBpbiB0aGUgdXNlcidzIGNvbmZpZ3VyYXRpb24gb2JqZWN0XG5cdFx0YWxsU2tpbGxzLnNvcnQoKGEsIGIpID0+IHRoaXMuZ2V0U2tpbGxQcmlvcml0eShhKSAtIHRoaXMuZ2V0U2tpbGxQcmlvcml0eShiKSk7XG5cblx0XHRmb3IgKGNvbnN0IHNraWxsIG9mIGFsbFNraWxscykge1xuXHRcdFx0Y29uc3QgdXJpID0gc2tpbGwudXJpO1xuXHRcdFx0Y29uc3QgcHJvbXB0UGF0aCA9IHNraWxsO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBwYXJzZWRGaWxlID0gYXdhaXQgdGhpcy5wYXJzZU5ldyh1cmksIHRva2VuKTtcblx0XHRcdFx0Y29uc3QgZm9sZGVyTmFtZSA9IGdldFNraWxsRm9sZGVyTmFtZSh1cmkpO1xuXG5cdFx0XHRcdGxldCBuYW1lID0gcGFyc2VkRmlsZS5oZWFkZXI/Lm5hbWU7XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gcGFyc2VkRmlsZS5oZWFkZXI/LmRlc2NyaXB0aW9uO1xuXG5cdFx0XHRcdGlmICghbmFtZSkge1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLmRlYnVnKGBbY29tcHV0ZVNraWxsRGlzY292ZXJ5SW5mb10gQWdlbnQgc2tpbGwgZmlsZSBtaXNzaW5nIG5hbWUgYXR0cmlidXRlLCB1c2luZyBmb2xkZXIgbmFtZSBcIiR7Zm9sZGVyTmFtZX1cIjogJHt1cml9YCk7XG5cdFx0XHRcdFx0bmFtZSA9IGZvbGRlck5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGV0IHNhbml0aXplZE5hbWUgPSB0aGlzLnRydW5jYXRlQWdlbnRTa2lsbE5hbWUobmFtZSwgdXJpKTtcblx0XHRcdFx0aWYgKHNhbml0aXplZE5hbWUgIT09IGZvbGRlck5hbWUpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW2NvbXB1dGVTa2lsbERpc2NvdmVyeUluZm9dIEFnZW50IHNraWxsIG5hbWUgXCIke3Nhbml0aXplZE5hbWV9XCIgZG9lcyBub3QgbWF0Y2ggZm9sZGVyIG5hbWUgXCIke2ZvbGRlck5hbWV9XCIsIHVzaW5nIGZvbGRlciBuYW1lOiAke3VyaX1gKTtcblx0XHRcdFx0XHRzYW5pdGl6ZWROYW1lID0gZm9sZGVyTmFtZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzZWVuTmFtZXMuaGFzKHNhbml0aXplZE5hbWUpKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dnZXIuZGVidWcoYFtjb21wdXRlU2tpbGxEaXNjb3ZlcnlJbmZvXSBTa2lwcGluZyBkdXBsaWNhdGUgYWdlbnQgc2tpbGwgbmFtZTogJHtzYW5pdGl6ZWROYW1lfSBhdCAke3VyaX1gKTtcblx0XHRcdFx0XHRmaWxlcy5wdXNoKHsgc3RhdHVzOiAnc2tpcHBlZCcsIHNraXBSZWFzb246ICdkdXBsaWNhdGUtbmFtZScsIGR1cGxpY2F0ZU9mOiBuYW1lVG9VcmkuZ2V0KHNhbml0aXplZE5hbWUpLCBwcm9tcHRQYXRoOiB0aGlzLndpdGhQcm9tcHRQYXRoTWV0YWRhdGEocHJvbXB0UGF0aCwgc2FuaXRpemVkTmFtZSwgZGVzY3JpcHRpb24pIH0pO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c2Vlbk5hbWVzLmFkZChzYW5pdGl6ZWROYW1lKTtcblx0XHRcdFx0bmFtZVRvVXJpLnNldChzYW5pdGl6ZWROYW1lLCB1cmkpO1xuXHRcdFx0XHRjb25zdCBkaXNhYmxlTW9kZWxJbnZvY2F0aW9uID0gcGFyc2VkRmlsZS5oZWFkZXI/LmRpc2FibGVNb2RlbEludm9jYXRpb24gPT09IHRydWU7XG5cdFx0XHRcdGNvbnN0IHVzZXJJbnZvY2FibGUgPSBwYXJzZWRGaWxlLmhlYWRlcj8udXNlckludm9jYWJsZSAhPT0gZmFsc2U7XG5cblx0XHRcdFx0ZmlsZXMucHVzaCh7IHN0YXR1czogJ2xvYWRlZCcsIHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShwcm9tcHRQYXRoLCBzYW5pdGl6ZWROYW1lLCBkZXNjcmlwdGlvbiksIGRpc2FibGVNb2RlbEludm9jYXRpb24sIHVzZXJJbnZvY2FibGUgfSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnN0IG1zZyA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcblx0XHRcdFx0dGhpcy5sb2dnZXIuZXJyb3IoYFtjb21wdXRlU2tpbGxEaXNjb3ZlcnlJbmZvXSBGYWlsZWQgdG8gdmFsaWRhdGUgQWdlbnQgc2tpbGwgZmlsZTogJHt1cml9YCwgbXNnKTtcblx0XHRcdFx0ZmlsZXMucHVzaCh7XG5cdFx0XHRcdFx0c3RhdHVzOiAnc2tpcHBlZCcsXG5cdFx0XHRcdFx0c2tpcFJlYXNvbjogJ3BhcnNlLWVycm9yJyxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IG1zZyxcblx0XHRcdFx0XHRwcm9tcHRQYXRoLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmlsZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEluc3RydWN0aW9uc0Rpc2NvdmVyeUluZm8odG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJSW5zdHJ1Y3Rpb25EaXNjb3ZlcnlJbmZvPiB7XG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZSh0cnVlKTtcblx0XHRjb25zdCBmaWxlczogSUluc3RydWN0aW9uRGlzY292ZXJ5UmVzdWx0W10gPSBbXTtcblxuXHRcdGNvbnN0IGluc3RydWN0aW9uc0ZpbGVzID0gYXdhaXQgdGhpcy5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCB0b2tlbik7XG5cdFx0Zm9yIChjb25zdCBwcm9tcHRQYXRoIG9mIGluc3RydWN0aW9uc0ZpbGVzKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBwcm9tcHRQYXRoLnVyaTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkUHJvbXB0RmlsZSA9IGF3YWl0IHRoaXMucGFyc2VOZXcodXJpLCB0b2tlbik7XG5cdFx0XHRcdGNvbnN0IG5hbWUgPSBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/Lm5hbWUgPz8gcHJvbXB0UGF0aC5uYW1lID8/IGdldENsZWFuUHJvbXB0TmFtZSh1cmkpO1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHBhcnNlZFByb21wdEZpbGU/LmhlYWRlcj8uZGVzY3JpcHRpb24gPz8gcHJvbXB0UGF0aC5kZXNjcmlwdGlvbjtcblx0XHRcdFx0Y29uc3QgcGF0dGVybiA9IGV2YWx1YXRlQXBwbHlUb1BhdHRlcm4ocGFyc2VkUHJvbXB0RmlsZS5oZWFkZXIsIGlzSW5DbGF1ZGVSdWxlc0ZvbGRlcih1cmkpKTtcblx0XHRcdFx0ZmlsZXMucHVzaCh7XG5cdFx0XHRcdFx0c3RhdHVzOiAnbG9hZGVkJyxcblx0XHRcdFx0XHRwYXR0ZXJuLFxuXHRcdFx0XHRcdHByb21wdFBhdGg6IHRoaXMud2l0aFByb21wdFBhdGhNZXRhZGF0YShwcm9tcHRQYXRoLCBuYW1lLCBkZXNjcmlwdGlvbiksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRmaWxlcy5wdXNoKHtcblx0XHRcdFx0XHRzdGF0dXM6ICdza2lwcGVkJyxcblx0XHRcdFx0XHRza2lwUmVhc29uOiAncGFyc2UtZXJyb3InLFxuXHRcdFx0XHRcdGVycm9yTWVzc2FnZTogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpLFxuXHRcdFx0XHRcdHByb21wdFBhdGgsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNvdXJjZUZvbGRlcnMgPSBhd2FpdCB0aGlzLl9jb2xsZWN0U291cmNlRm9sZGVyRGlhZ25vc3RpY3MoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRyZXR1cm4geyB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGZpbGVzLCBzb3VyY2VGb2xkZXJzLCBkdXJhdGlvbkluTWlsbGlzOiBzdG9wV2F0Y2guZWxhcHNlZCgpIH07XG5cdH1cbn1cblxuLy8gaGVscGVyc1xuXG5jbGFzcyBDYWNoZWRQcm9taXNlPFQ+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgY2FjaGVkUHJvbWlzZTogUHJvbWlzZTxUPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYWNoZWRQb29sOiBDYW5jZWxsYXRpb25Ub2tlblBvb2wgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRVcGRhdGVQcm9taXNlRW1pdHRlcjogRW1pdHRlcjx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGNvbXB1dGVGbjogKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxUPiwgcHJpdmF0ZSByZWFkb25seSBnZXRFdmVudDogKCkgPT4gRXZlbnQ8dm9pZD4sIHByaXZhdGUgcmVhZG9ubHkgZGVsYXk6IG51bWJlciA9IDApIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub25EaWRVcGRhdGVQcm9taXNlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IGRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPih0aGlzLmRlbGF5KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5nZXRFdmVudCgpKCgpID0+IHtcblx0XHRcdHRoaXMuY2FjaGVkUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdGRlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLm9uRGlkVXBkYXRlUHJvbWlzZUVtaXR0ZXIuZmlyZSgpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlUHJvbWlzZSgpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMub25EaWRVcGRhdGVQcm9taXNlRW1pdHRlci5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxUPiB7XG5cdFx0Ly8gSWYgYSBwcmV2aW91cyBpbi1mbGlnaHQgY29tcHV0YXRpb24gaGFkIGFsbCBvZiBpdHMgY2FsbGVycyBjYW5jZWwsIHRoZSBwb29sJ3Ncblx0XHQvLyB0b2tlbiB3aWxsIGhhdmUgZmlyZWQgYW5kIHRoZSBjb21wdXRhdGlvbiBtYXkgaGF2ZSByZWplY3RlZC9hYm9ydGVkLiBBIG5ld1xuXHRcdC8vIGNhbGxlciBhcnJpdmluZyBpbiB0aGF0IHdpbmRvdyBtdXN0IG5vdCBpbmhlcml0IHRoYXQgY2FuY2VsbGF0aW9uLCBzbyBzdGFydFxuXHRcdC8vIGZyZXNoLlxuXHRcdGlmICh0aGlzLmNhY2hlZFBvb2w/LnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLmNhY2hlZFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLmNhY2hlZFBvb2wgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBwb29sID0gdGhpcy5jYWNoZWRQb29sO1xuXHRcdGlmICh0aGlzLmNhY2hlZFByb21pc2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gQWdncmVnYXRlIGNhbGxlcnMnIHRva2VucyBzbyB0aGUgc2hhcmVkIGNvbXB1dGF0aW9uIGlzIGNhbmNlbGxlZFxuXHRcdFx0Ly8gb25seSBhZnRlciBldmVyeSBsaXZlIGNhbGxlciBoYXMgY2FuY2VsbGVkLiBBIHNpbmdsZSBjYWxsZXInc1xuXHRcdFx0Ly8gY2FuY2VsbGF0aW9uIG5vIGxvbmdlciBhYm9ydHMgdGhlIHdvcmsgZm9yIHRoZSBvdGhlcnMuXG5cdFx0XHRwb29sID0gbmV3IENhbmNlbGxhdGlvblRva2VuUG9vbCgpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IHRoaXMuY29tcHV0ZUZuKHBvb2wudG9rZW4pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmNhY2hlZFByb21pc2UgPT09IHByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLmNhY2hlZFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fSk7XG5cdFx0XHQvLyBUaGUgcG9vbCBpcyBvbmx5IG1lYW5pbmdmdWwgd2hpbGUgdGhlIGNvbXB1dGF0aW9uIGlzIGluIGZsaWdodC5cblx0XHRcdHByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmNhY2hlZFBvb2wgPT09IHBvb2wpIHtcblx0XHRcdFx0XHR0aGlzLmNhY2hlZFBvb2wgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cG9vbCEuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNhY2hlZFByb21pc2UgPSBwcm9taXNlO1xuXHRcdFx0dGhpcy5jYWNoZWRQb29sID0gcG9vbDtcblx0XHR9XG5cdFx0cG9vbD8uYWRkKHRva2VuKTtcblx0XHRyZXR1cm4gcmFjZUNhbmNlbGxhdGlvbkVycm9yKHRoaXMuY2FjaGVkUHJvbWlzZSwgdG9rZW4pO1xuXHR9XG5cblx0cHVibGljIHJlZnJlc2goKTogdm9pZCB7XG5cdFx0dGhpcy5jYWNoZWRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMub25EaWRVcGRhdGVQcm9taXNlRW1pdHRlcj8uZmlyZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBNb2RlbENoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGU7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xufVxuXG5jbGFzcyBNb2RlbENoYW5nZVRyYWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGxpc3RlbmVycyA9IG5ldyBSZXNvdXJjZU1hcDxJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZFByb21wdE1vZGVsQ2hhbmdlOiBFbWl0dGVyPE1vZGVsQ2hhbmdlRXZlbnQ+O1xuXG5cdHB1YmxpYyBnZXQgb25EaWRQcm9tcHRDaGFuZ2UoKTogRXZlbnQ8TW9kZWxDaGFuZ2VFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLm9uRGlkUHJvbXB0TW9kZWxDaGFuZ2UuZXZlbnQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub25EaWRQcm9tcHRNb2RlbENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPE1vZGVsQ2hhbmdlRXZlbnQ+KCkpO1xuXHRcdGNvbnN0IG9uQWRkID0gKG1vZGVsOiBJVGV4dE1vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9tcHRUeXBlID0gZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkKG1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0XHRpZiAocHJvbXB0VHlwZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLnNldChtb2RlbC51cmksIG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLm9uRGlkUHJvbXB0TW9kZWxDaGFuZ2UuZmlyZSh7IHVyaTogbW9kZWwudXJpLCBwcm9tcHRUeXBlIH0pKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcHJvbXB0VHlwZTtcblx0XHR9O1xuXHRcdGNvbnN0IG9uUmVtb3ZlID0gKGxhbmd1YWdlSWQ6IHN0cmluZywgdXJpOiBVUkkpID0+IHtcblx0XHRcdGNvbnN0IHByb21wdFR5cGUgPSBnZXRQcm9tcHRzVHlwZUZvckxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdFx0XHRpZiAocHJvbXB0VHlwZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLmdldCh1cmkpPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMubGlzdGVuZXJzLmRlbGV0ZSh1cmkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHByb21wdFR5cGU7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbFNlcnZpY2Uub25Nb2RlbEFkZGVkKG1vZGVsID0+IG9uQWRkKG1vZGVsKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsU2VydmljZS5vbk1vZGVsTGFuZ3VhZ2VDaGFuZ2VkKGUgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3ZlZFByb21wdFR5cGUgPSBvblJlbW92ZShlLm9sZExhbmd1YWdlSWQsIGUubW9kZWwudXJpKTtcblx0XHRcdGNvbnN0IGFkZGVkUHJvbXB0VHlwZSA9IG9uQWRkKGUubW9kZWwpO1xuXHRcdFx0aWYgKHJlbW92ZWRQcm9tcHRUeXBlICE9PSBhZGRlZFByb21wdFR5cGUpIHtcblx0XHRcdFx0aWYgKHJlbW92ZWRQcm9tcHRUeXBlKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZFByb21wdE1vZGVsQ2hhbmdlLmZpcmUoeyB1cmk6IGUubW9kZWwudXJpLCBwcm9tcHRUeXBlOiByZW1vdmVkUHJvbXB0VHlwZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWRkZWRQcm9tcHRUeXBlKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkRpZFByb21wdE1vZGVsQ2hhbmdlLmZpcmUoeyB1cmk6IGUubW9kZWwudXJpLCBwcm9tcHRUeXBlOiBhZGRlZFByb21wdFR5cGUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKG1vZGVsID0+IG9uUmVtb3ZlKG1vZGVsLmdldExhbmd1YWdlSWQoKSwgbW9kZWwudXJpKSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMubGlzdGVuZXJzLmZvckVhY2gobGlzdGVuZXIgPT4gbGlzdGVuZXIuZGlzcG9zZSgpKTtcblx0XHR0aGlzLmxpc3RlbmVycy5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ3VzdG9tQWdlbnQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVBhcnNlZFByb21wdEZpbGUoYXN0OiBQYXJzZWRQcm9tcHRGaWxlLCBleHRyYTogeyBuYW1lPzogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZzsgc291cmNlOiBJQWdlbnRTb3VyY2U7IGhvb2tzPzogQ2hhdFJlcXVlc3RIb29rczsgc2Vzc2lvblR5cGVzOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZDsgZW5hYmxlZDogYm9vbGVhbiB9KTogSUN1c3RvbUFnZW50IHtcblx0XHRjb25zdCB1cmkgPSBhc3QudXJpO1xuXHRcdGNvbnN0IHsgaG9va3MsIHNlc3Npb25UeXBlcywgZW5hYmxlZCB9ID0gZXh0cmE7XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdGxldCBtZXRhZGF0YTogYW55IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChhc3QuaGVhZGVyKSB7XG5cdFx0XHRjb25zdCBhZHZhbmNlZCA9IGFzdC5oZWFkZXIuZ2V0QXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWR2YW5jZWRPcHRpb25zKTtcblx0XHRcdGlmIChhZHZhbmNlZCAmJiBhZHZhbmNlZC52YWx1ZS50eXBlID09PSAnbWFwJykge1xuXHRcdFx0XHRtZXRhZGF0YSA9IHt9O1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhhZHZhbmNlZC52YWx1ZSkpIHtcblx0XHRcdFx0XHRpZiAodmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0XHRcdG1ldGFkYXRhW2tleV0gPSB2YWx1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgdG9vbFJlZmVyZW5jZXM6IElWYXJpYWJsZVJlZmVyZW5jZVtdID0gW107XG5cdFx0aWYgKGFzdC5ib2R5KSB7XG5cdFx0XHRjb25zdCBib2R5T2Zmc2V0ID0gYXN0LmJvZHkub2Zmc2V0O1xuXHRcdFx0Y29uc3QgYm9keVZhclJlZnMgPSBhc3QuYm9keS52YXJpYWJsZVJlZmVyZW5jZXM7XG5cdFx0XHRmb3IgKGxldCBpID0gYm9keVZhclJlZnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHsgLy8gaW4gcmV2ZXJzZSBvcmRlclxuXHRcdFx0XHRjb25zdCB7IG5hbWUsIG9mZnNldCwgZnVsbExlbmd0aCB9ID0gYm9keVZhclJlZnNbaV07XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IE9mZnNldFJhbmdlKG9mZnNldCAtIGJvZHlPZmZzZXQsIG9mZnNldCAtIGJvZHlPZmZzZXQgKyBmdWxsTGVuZ3RoKTtcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXMucHVzaCh7IG5hbWUsIHJhbmdlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGFnZW50SW5zdHJ1Y3Rpb25zID0geyBjb250ZW50OiBhc3QuYm9keT8uZ2V0Q29udGVudCgpID8/ICcnLCB0b29sUmVmZXJlbmNlcywgbWV0YWRhdGEgfSBzYXRpc2ZpZXMgSUFnZW50SW5zdHJ1Y3Rpb25zO1xuXG5cdFx0Y29uc3QgbmFtZSA9IGFzdC5oZWFkZXI/Lm5hbWUgPz8gZXh0cmEubmFtZSA/PyBnZXRDbGVhblByb21wdE5hbWUodXJpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGFzdC5oZWFkZXI/LmRlc2NyaXB0aW9uID8/IGV4dHJhLmRlc2NyaXB0aW9uO1xuXHRcdGNvbnN0IHRhcmdldCA9IGdldFRhcmdldChQcm9tcHRzVHlwZS5hZ2VudCwgYXN0LmhlYWRlciA/PyB1cmkpO1xuXHRcdGNvbnN0IGlkID0gdXJpLnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBzb3VyY2UgPSBleHRyYS5zb3VyY2U7XG5cdFx0aWYgKCFhc3QuaGVhZGVyKSB7XG5cdFx0XHRyZXR1cm4geyBpZCwgdXJpLCBuYW1lLCBhZ2VudEluc3RydWN0aW9ucywgc291cmNlLCB0YXJnZXQsIHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSwgc2Vzc2lvblR5cGVzLCBob29rcywgZW5hYmxlZCB9O1xuXHRcdH1cblx0XHRjb25zdCB2aXNpYmlsaXR5ID0ge1xuXHRcdFx0dXNlckludm9jYWJsZTogYXN0LmhlYWRlci51c2VySW52b2NhYmxlICE9PSBmYWxzZSxcblx0XHRcdGFnZW50SW52b2NhYmxlOiBhc3QuaGVhZGVyLmluZmVyICE9PSB1bmRlZmluZWQgPyBhc3QuaGVhZGVyLmluZmVyID09PSB0cnVlIDogYXN0LmhlYWRlci5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uICE9PSB0cnVlLFxuXHRcdH0gc2F0aXNmaWVzIElDdXN0b21BZ2VudFZpc2liaWxpdHk7XG5cblx0XHRsZXQgbW9kZWwgPSBhc3QuaGVhZGVyLm1vZGVsO1xuXHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUgJiYgbW9kZWwpIHtcblx0XHRcdG1vZGVsID0gbWFwQ2xhdWRlTW9kZWxzKG1vZGVsKTtcblx0XHR9XG5cdFx0bGV0IHsgdG9vbHMsIGhhbmRPZmZzLCBhcmd1bWVudEhpbnQsIGFnZW50cyB9ID0gYXN0LmhlYWRlcjtcblx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlICYmIHRvb2xzKSB7XG5cdFx0XHR0b29scyA9IG1hcENsYXVkZVRvb2xzKHRvb2xzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgaWQsIHVyaSwgbmFtZSwgZGVzY3JpcHRpb24sIG1vZGVsLCB0b29scywgaGFuZE9mZnMsIGFyZ3VtZW50SGludCwgdGFyZ2V0LCB2aXNpYmlsaXR5LCBhZ2VudHMsIGFnZW50SW5zdHJ1Y3Rpb25zLCBzb3VyY2UsIHNlc3Npb25UeXBlcywgaG9va3MsIGVuYWJsZWQgfTtcblxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CLDZCQUE2QjtBQUN6RCxTQUFTLG1CQUFtQiwyQkFBMkI7QUFDdkQsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBcUIsU0FBUyxrQkFBa0I7QUFDaEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFrQiwyQkFBMkI7QUFDdEQsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLFVBQVUsU0FBUyxTQUFTLGdCQUFnQjtBQUNyRCxTQUFTLFdBQVc7QUFDcEIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxvQkFBb0IscUJBQXFCLG9CQUFvQjtBQUN0RSxTQUFTLDZCQUE2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QyxDQUFDO0FBQzlDLFFBQUksSUFBSSxNQUFNO0FBQ2IsWUFBTSxhQUFhLElBQUksS0FBSztBQUM1QixZQUFNLGNBQWMsSUFBSSxLQUFLO0FBQzdCLGVBQVMsSUFBSSxZQUFZLFNBQVMsR0FBRyxLQUFLLEdBQUcsS0FBSztBQUNqRCxjQUFNLEVBQUUsTUFBQUMsT0FBTSxRQUFRLFdBQVcsSUFBSSxZQUFZLENBQUM7QUFDbEQsY0FBTSxRQUFRLElBQUksWUFBWSxTQUFTLFlBQVksU0FBUyxhQUFhLFVBQVU7QUFDbkYsdUJBQWUsS0FBSyxFQUFFLE1BQUFBLE9BQU0sTUFBTSxDQUFDO0FBQUEsTUFDcEM7QUFBQSxJQUNEO0FBRUEsVUFBTSxvQkFBb0IsRUFBRSxTQUFTLElBQUksTUFBTSxXQUFXLEtBQUssSUFBSSxnQkFBZ0IsU0FBUztBQUU1RixVQUFNLE9BQU8sSUFBSSxRQUFRLFFBQVEsTUFBTSxRQUFRLG1CQUFtQixHQUFHO0FBQ3JFLFVBQU0sY0FBYyxJQUFJLFFBQVEsZUFBZSxNQUFNO0FBQ3JELFVBQU0sU0FBUyxVQUFVLFlBQVksT0FBTyxJQUFJLFVBQVUsR0FBRztBQUM3RCxVQUFNLEtBQUssSUFBSSxTQUFTO0FBRXhCLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFFBQUksQ0FBQyxJQUFJLFFBQVE7QUFDaEIsYUFBTyxFQUFFLElBQUksS0FBSyxNQUFNLG1CQUFtQixRQUFRLFFBQVEsWUFBWSxFQUFFLGVBQWUsTUFBTSxnQkFBZ0IsS0FBSyxHQUFHLGNBQWMsT0FBTyxRQUFRO0FBQUEsSUFDcEo7QUFDQSxVQUFNLGFBQWE7QUFBQSxNQUNsQixlQUFlLElBQUksT0FBTyxrQkFBa0I7QUFBQSxNQUM1QyxnQkFBZ0IsSUFBSSxPQUFPLFVBQVUsU0FBWSxJQUFJLE9BQU8sVUFBVSxPQUFPLElBQUksT0FBTywyQkFBMkI7QUFBQSxJQUNwSDtBQUVBLFFBQUksUUFBUSxJQUFJLE9BQU87QUFDdkIsUUFBSSxXQUFXLE9BQU8sVUFBVSxPQUFPO0FBQ3RDLGNBQVEsZ0JBQWdCLEtBQUs7QUFBQSxJQUM5QjtBQUNBLFFBQUksRUFBRSxPQUFPLFVBQVUsY0FBYyxPQUFPLElBQUksSUFBSTtBQUNwRCxRQUFJLFdBQVcsT0FBTyxVQUFVLE9BQU87QUFDdEMsY0FBUSxlQUFlLEtBQUs7QUFBQSxJQUM3QjtBQUNBLFdBQU8sRUFBRSxJQUFJLEtBQUssTUFBTSxhQUFhLE9BQU8sT0FBTyxVQUFVLGNBQWMsUUFBUSxZQUFZLFFBQVEsbUJBQW1CLFFBQVEsY0FBYyxPQUFPLFFBQVE7QUFBQSxFQUVoSztBQXRETyxFQUFBRCxhQUFTO0FBQUEsR0FEQTsiLAogICJuYW1lcyI6IFsiaG9va0ZpbGVzIiwgImZpbGVzIiwgInNvdXJjZUZvbGRlcnMiLCAiQ3VzdG9tQWdlbnQiLCAibmFtZSJdCn0K
