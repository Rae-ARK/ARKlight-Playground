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
import { URI } from "../../../../../../base/common/uri.js";
import { isAbsolute } from "../../../../../../base/common/path.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import * as nls from "../../../../../../nls.js";
import { FileOperation, FileOperationError, FileOperationResult, IFileService } from "../../../../../../platform/files/common/files.js";
import { getPromptFileLocationsConfigKey, isTildePath, PromptsConfig } from "../config/config.js";
import { basename, dirname, isEqual, isEqualOrParent, joinPath } from "../../../../../../base/common/resources.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { AGENTS_SOURCE_FOLDER, CLAUDE_CONFIG_FOLDER, COPILOT_CONFIG_FOLDER, GITHUB_CONFIG_FOLDER, getPromptFileExtension, getPromptFileType, LEGACY_MODE_FILE_EXTENSION, getCleanPromptName, AGENT_FILE_EXTENSION, getPromptFileDefaultLocations, SKILL_FILENAME } from "../config/promptFileLocations.js";
import { PromptFileSource, PromptsType } from "../promptTypes.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { getExcludes, ISearchService, QueryType } from "../../../../../services/search/common/search.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../../../base/common/errors.js";
import { AgentInstructionFileType, PromptsStorage } from "../service/promptsService.js";
import { IUserDataProfileService } from "../../../../../services/userDataProfile/common/userDataProfile.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { equalsIgnoreCase } from "../../../../../../base/common/strings.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { AGENT_HOST_SCHEME } from "../../../../../../platform/agentHost/common/agentHostUri.js";
const MAX_INSTRUCTIONS_RECURSION_DEPTH = 5;
let PromptFilesLocator = class {
  constructor(fileService, configService, workspaceService, environmentService, searchService, userDataService, logService, pathService, workspaceTrustManagementService) {
    this.fileService = fileService;
    this.configService = configService;
    this.workspaceService = workspaceService;
    this.environmentService = environmentService;
    this.searchService = searchService;
    this.userDataService = userDataService;
    this.logService = logService;
    this.pathService = pathService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    const userDataPromptsHome = this.userDataService.currentProfile.promptsHome;
    this.userDataFolder = {
      uri: userDataPromptsHome,
      searchRoot: userDataPromptsHome,
      filePattern: void 0,
      source: PromptFileSource.UserData,
      storage: PromptsStorage.user,
      displayPath: nls.localize("promptsUserDataFolder", "User Data"),
      isDefault: true
    };
  }
  getWorkspaceFolders() {
    return this.workspaceService.getWorkspace().folders.filter((f) => f.uri.scheme !== AGENT_HOST_SCHEME);
  }
  getWorkspaceFolder(resource) {
    return this.workspaceService.getWorkspaceFolder(resource) ?? void 0;
  }
  onDidChangeWorkspaceFolders() {
    return Event.map(this.workspaceService.onDidChangeWorkspaceFolders, () => void 0);
  }
  /**
   * Returns the configured prompt source folders for the given type.
   * Subclasses can override to filter out unsupported sources.
   */
  getPromptSourceFolders(type) {
    return PromptsConfig.promptSourceFolders(this.configService, type);
  }
  /**
   * Returns the default prompt source folders for the given type.
   * Subclasses can override to filter out unsupported sources.
   */
  getDefaultSourceFolders(type) {
    return getPromptFileDefaultLocations(type);
  }
  async getWorkspaceFolderRoots(includeParents, logger) {
    const workspaceFolders = this.getWorkspaceFolders();
    if (includeParents) {
      const roots = new ResourceSet();
      const userHome = await this.pathService.userHome();
      for (const workspaceFolder of workspaceFolders) {
        roots.add(workspaceFolder.uri);
        const parents = await this.findParentRepoFolders(workspaceFolder.uri, userHome, roots, logger);
        for (const parent of parents) {
          roots.add(parent);
        }
      }
      return [...roots];
    }
    return workspaceFolders.map((f) => f.uri);
  }
  /**
   * Walks up from {@link folderUri} collecting parent folders until a
   * repository root (a folder containing `.git`) is found.  Returns the
   * intermediate parent folders only when a repo root is found; returns
   * an empty array when the walk reaches the filesystem root, the user
   * home directory, or a folder already present in {@link seen}.
   */
  async findParentRepoFolders(folderUri, userHome, seen, logger) {
    const candidates = [];
    let current = folderUri;
    while (true) {
      try {
        const isRepoRoot = await this.fileService.exists(joinPath(current, ".git"));
        if (isRepoRoot) {
          if ((await this.workspaceTrustManagementService.getUriTrustInfo(current)).trusted) {
            candidates.push(current);
            return candidates;
          }
          logger?.logInfo(`Repository root found at ${current.toString()}, but it is not trusted. Skipping parent folder inclusion for this workspace folder.`);
          return [];
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logger?.logInfo(`No repository root found for folder ${folderUri.toString()}. Error accessing ${joinPath(current, ".git")}: ${msg}.`);
        return [];
      }
      candidates.push(current);
      const parent = dirname(current);
      if (isEqual(current, parent) || current.path === "/" || isEqual(userHome, parent) || seen.has(parent)) {
        break;
      }
      current = parent;
    }
    logger?.logInfo(`No repository root found for folder ${folderUri.toString()}.`);
    return [];
  }
  /**
   * List all prompt files from the filesystem.
   *
   * @returns List of prompt files found in the workspace.
   */
  async listFiles(type, storage, token) {
    if (storage !== PromptsStorage.user && storage !== PromptsStorage.local) {
      throw new Error(`Unsupported prompt file storage: ${storage}`);
    }
    const configuredLocations = this.getPromptSourceFolders(type);
    const absoluteLocations = await this.toAbsoluteLocations(type, configuredLocations.filter((loc) => loc.storage === storage));
    if (storage === PromptsStorage.user && (type === PromptsType.agent || type === PromptsType.instructions || type === PromptsType.prompt)) {
      absoluteLocations.push(this.userDataFolder);
    }
    const paths = new ResourceSet();
    for (const { searchRoot, filePattern } of absoluteLocations) {
      const files = filePattern === void 0 ? await this.resolveFilesAtLocation(searchRoot, type, token) : await this.searchFilesInLocation(searchRoot, filePattern, token);
      for (const file of files) {
        if (getPromptFileType(file) === type) {
          paths.add(file);
        }
      }
      if (token.isCancellationRequested) {
        return [];
      }
    }
    return [...paths];
  }
  createFilesUpdatedEvent(type) {
    const disposables = new DisposableStore();
    const eventEmitter = disposables.add(new Emitter());
    const token = disposables.add(new CancellationTokenSource()).token;
    const externalFolderWatchers = disposables.add(new DisposableStore());
    const key = getPromptFileLocationsConfigKey(type);
    const userDataFolder = this.userDataService.currentProfile.promptsHome;
    let parentFolders = [];
    const updateExternalFolderWatchers = () => {
      externalFolderWatchers.clear();
      for (const folder of parentFolders) {
        if (!this.getWorkspaceFolder(folder.searchRoot)) {
          const recursive = folder.filePattern !== void 0 || type === PromptsType.instructions;
          externalFolderWatchers.add(this.fileService.watch(folder.searchRoot, { recursive, excludes: [] }));
        }
      }
    };
    const update = async () => {
      try {
        const configuredLocations = this.getPromptSourceFolders(type);
        parentFolders = await this.toAbsoluteLocations(type, configuredLocations, void 0);
        if (token.isCancellationRequested) {
          return;
        }
        updateExternalFolderWatchers();
      } catch (err) {
        this.logService.error(`Error updating prompt file watchers after config change:`, err);
      }
    };
    disposables.add(this.configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(key) || e.affectsConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS)) {
        void update();
        eventEmitter.fire();
      }
    }));
    disposables.add(this.onDidChangeWorkspaceFolders()(() => {
      void update();
      eventEmitter.fire();
    }));
    disposables.add(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
      void update();
      eventEmitter.fire();
    }));
    disposables.add(this.fileService.onDidFilesChange((e) => {
      if (e.affects(userDataFolder)) {
        eventEmitter.fire();
        return;
      }
      if (parentFolders.some((folder) => e.affects(folder.searchRoot))) {
        eventEmitter.fire();
        return;
      }
    }));
    disposables.add(this.fileService.watch(userDataFolder));
    void update();
    return { event: eventEmitter.event, dispose: () => disposables.dispose() };
  }
  createAgentInstructionsUpdatedEvent() {
    const disposables = new DisposableStore();
    const eventEmitter = disposables.add(new Emitter());
    const cts = new CancellationTokenSource();
    disposables.add(toDisposable(() => cts.dispose(true)));
    const token = cts.token;
    const watchers = disposables.add(new DisposableStore());
    const watchedRoots = new ResourceSet();
    const addWatch = (resource) => {
      if (token.isCancellationRequested) {
        return;
      }
      if (watchedRoots.has(resource)) {
        return;
      }
      watchedRoots.add(resource);
      watchers.add(this.fileService.watch(resource));
    };
    const updateWatchers = async () => {
      watchers.clear();
      watchedRoots.clear();
      const watchWorkspaceRoots = this.configService.getValue(PromptsConfig.USE_AGENT_MD) || this.configService.getValue(PromptsConfig.USE_CLAUDE_MD);
      const watchClaudeFolders = this.configService.getValue(PromptsConfig.USE_CLAUDE_MD);
      const watchCopilotFolders = this.configService.getValue(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES);
      const includeParents = this.configService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true;
      const workspaceRoots = await this.getWorkspaceFolderRoots(includeParents);
      if (token.isCancellationRequested) {
        return;
      }
      const userHome = await this.pathService.userHome();
      if (token.isCancellationRequested) {
        return;
      }
      for (const workspaceRoot of workspaceRoots) {
        if (watchWorkspaceRoots) {
          addWatch(workspaceRoot);
        }
        if (watchClaudeFolders) {
          addWatch(joinPath(workspaceRoot, CLAUDE_CONFIG_FOLDER));
        }
        if (watchCopilotFolders) {
          addWatch(joinPath(workspaceRoot, GITHUB_CONFIG_FOLDER));
        }
      }
      if (watchClaudeFolders) {
        addWatch(joinPath(userHome, CLAUDE_CONFIG_FOLDER));
      }
      if (watchCopilotFolders) {
        addWatch(joinPath(userHome, COPILOT_CONFIG_FOLDER));
      }
    };
    const refresh = () => {
      void updateWatchers();
      eventEmitter.fire();
    };
    disposables.add(this.configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(PromptsConfig.USE_AGENT_MD) || e.affectsConfiguration(PromptsConfig.USE_CLAUDE_MD) || e.affectsConfiguration(PromptsConfig.USE_COPILOT_INSTRUCTION_FILES) || e.affectsConfiguration(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS)) {
        refresh();
      }
    }));
    disposables.add(this.onDidChangeWorkspaceFolders()(() => {
      refresh();
    }));
    disposables.add(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => {
      refresh();
    }));
    disposables.add(this.fileService.onDidFilesChange((e) => {
      for (const watchedRoot of watchedRoots) {
        if (e.affects(watchedRoot)) {
          eventEmitter.fire();
          return;
        }
      }
    }));
    disposables.add(this.fileService.onDidRunOperation((e) => {
      for (const watchedRoot of watchedRoots) {
        if (isEqualOrParent(e.resource, watchedRoot)) {
          eventEmitter.fire();
          return;
        }
        if (e.isOperation(FileOperation.CREATE) || e.isOperation(FileOperation.MOVE) || e.isOperation(FileOperation.COPY)) {
          if (isEqualOrParent(e.target.resource, watchedRoot)) {
            eventEmitter.fire();
            return;
          }
        }
      }
    }));
    void updateWatchers();
    return { event: eventEmitter.event, dispose: () => disposables.dispose() };
  }
  /**
   * Gets the hook source folders for creating new hooks.
   * Returns configured hook folders, excluding Claude paths (which are read-only).
   */
  async getHookSourceFolders() {
    const configuredLocations = this.getPromptSourceFolders(PromptsType.hook);
    const allowedHookFolders = configuredLocations.filter(
      (loc) => !loc.path.startsWith(".claude/") && !loc.path.includes("/.claude/")
    );
    const absoluteLocations = await this.toAbsoluteLocations(PromptsType.hook, allowedHookFolders);
    const seen = new ResourceSet();
    const result = [];
    for (const location of absoluteLocations) {
      if (!seen.has(location.searchRoot)) {
        seen.add(location.searchRoot);
        result.push({ ...location, uri: location.searchRoot, filePattern: void 0 });
      }
    }
    return result;
  }
  /**
   * Get all possible unambiguous prompt file source folders based on
   * the current workspace folder structure.
   *
   * This method is currently primarily used by the `> Create Prompt`
   * command that providers users with the list of destination folders
   * for a newly created prompt file. Because such a list cannot contain
   * paths that include `glob pattern` in them, we need to process config
   * values and try to create a list of clear and unambiguous locations.
   *
   * @returns List of possible unambiguous prompt file folders.
   */
  async getConfigBasedSourceFolders(type) {
    const configuredLocations = this.getPromptSourceFolders(type);
    const absoluteLocations = await this.toAbsoluteLocations(type, configuredLocations);
    if (type !== PromptsType.prompt && type !== PromptsType.instructions) {
      return absoluteLocations.map((l) => l.uri);
    }
    const result = new ResourceSet();
    for (const absoluteLocation of absoluteLocations) {
      let location = absoluteLocation.uri;
      const baseName = basename(location);
      const filePatterns = ["*.md", `*${getPromptFileExtension(type)}`];
      for (const filePattern of filePatterns) {
        if (baseName === filePattern) {
          location = dirname(location);
          continue;
        }
      }
      if (baseName === "*") {
        location = dirname(location);
      }
      if (isValidGlob(location.path) === true) {
        continue;
      }
      result.add(location);
    }
    return [...result];
  }
  /**
   * Gets all resolved source folders for the given prompt type with metadata.
   * This method merges configured locations with default locations and resolves them
   * to absolute paths, including displayPath and isDefault information.
   *
   * The returned order prefers workspace (local) folders first, then user folders.
   * This is used for UX like the "Create Prompt" command where workspace is preferred.
   *
   * @param type The type of prompt files.
   * @returns List of resolved source folders with metadata.
   */
  async getResolvedSourceFolders(type) {
    const absoluteLocations = await this.getLocalStorageFolders(type);
    const localFolders = absoluteLocations.filter((loc) => loc.storage === PromptsStorage.local);
    const userFolders = absoluteLocations.filter((loc) => loc.storage === PromptsStorage.user);
    return this.dedupeSourceFolders([...localFolders, ...userFolders]);
  }
  /**
   * Gets all resolved source folders in the same order that file discovery
   * searches them (user folders first, then local/workspace folders).
   * This matches the order used by {@link listFiles} and should be used
   * for debug/diagnostic output so the displayed order is accurate.
   */
  async getSourceFoldersInDiscoveryOrder(type) {
    const absoluteLocations = await this.getLocalStorageFolders(type);
    const userFolders = absoluteLocations.filter((loc) => loc.storage === PromptsStorage.user);
    const localFolders = absoluteLocations.filter((loc) => loc.storage === PromptsStorage.local);
    return this.dedupeSourceFolders([...userFolders, ...localFolders]);
  }
  /**
   * Gets all local (workspace) storage folders for the given prompt type.
   * This merges default folders with configured locations.
   */
  async getLocalStorageFolders(type) {
    const configuredLocations = this.getPromptSourceFolders(type);
    const defaultFolders = this.getDefaultSourceFolders(type);
    const isConfigured = PromptsConfig.getLocationsValue(this.configService, type) !== void 0;
    const allFolders = isConfigured ? configuredLocations : defaultFolders;
    const absoluteLocations = await this.toAbsoluteLocations(type, allFolders, defaultFolders);
    if (type === PromptsType.agent || type === PromptsType.instructions || type === PromptsType.prompt) {
      absoluteLocations.push(this.userDataFolder);
    }
    return absoluteLocations;
  }
  /**
   * Deduplicates source folders by URI.
   */
  dedupeSourceFolders(folders) {
    const seen = new ResourceSet();
    const result = [];
    for (const folder of folders) {
      if (!seen.has(folder.uri)) {
        seen.add(folder.uri);
        result.push(folder);
      }
    }
    return result;
  }
  /**
   * Converts locations defined in `settings` to absolute filesystem path URIs with metadata.
   * This conversion is needed because locations in settings can be relative,
   * hence we need to resolve them based on the current workspace folders.
   * If userHome is provided, paths starting with `~` will be expanded. Otherwise these paths are ignored.
   * Preserves the type and location properties from the source folder definitions.
   */
  async toAbsoluteLocations(type, configuredLocations, defaultLocations) {
    const result = [];
    const seen = new ResourceSet();
    const userHome = await this.pathService.userHome();
    const rootFolders = await this.getWorkspaceFolderRoots(this.configService.getValue(PromptsConfig.USE_CUSTOMIZATIONS_IN_PARENT_REPOS) === true);
    const defaultPaths = new Set(defaultLocations?.map((loc) => loc.path));
    const validLocations = configuredLocations.filter((sourceFolder) => {
      if (type === PromptsType.instructions || type === PromptsType.prompt) {
        const path = sourceFolder.path;
        if (hasGlobPattern(path)) {
          if (type === PromptsType.prompt) {
            this.logService.warn(`[Deprecated] Glob patterns (* and **) in prompt file locations are deprecated: "${path}". Consider using explicit paths instead.`);
          } else if (type === PromptsType.instructions) {
            this.logService.info(`Glob patterns (* and **) detected in instruction file location: "${path}". Consider using explicit paths for better performance.`);
          }
        }
        return true;
      }
      const configuredLocation = sourceFolder.path;
      if (!isValidPromptFolderPath(configuredLocation)) {
        this.logService.warn(`Skipping invalid path (glob patterns and absolute paths not supported): ${configuredLocation}`);
        return false;
      }
      return true;
    });
    for (const sourceFolder of validLocations) {
      const configuredLocation = sourceFolder.path;
      const isDefault = defaultPaths?.has(configuredLocation);
      try {
        if (isTildePath(configuredLocation)) {
          const uri = joinPath(userHome, configuredLocation.substring(2));
          if (!seen.has(uri)) {
            seen.add(uri);
            const { searchRoot, filePattern } = resolveSearchLocation(type, uri);
            result.push({ uri, searchRoot, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
          }
          continue;
        }
        if (isAbsolute(configuredLocation)) {
          let uri = URI.file(configuredLocation);
          const remoteAuthority = this.environmentService.remoteAuthority;
          if (remoteAuthority) {
            uri = uri.with({ scheme: Schemas.vscodeRemote, authority: remoteAuthority });
          }
          if (!seen.has(uri)) {
            seen.add(uri);
            const { searchRoot, filePattern } = resolveSearchLocation(type, uri);
            result.push({ uri, searchRoot, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
          }
        } else {
          for (const folder of rootFolders) {
            const absolutePath = joinPath(folder, configuredLocation);
            if (!seen.has(absolutePath)) {
              seen.add(absolutePath);
              const { searchRoot, filePattern } = resolveSearchLocation(type, absolutePath);
              result.push({ uri: absolutePath, searchRoot, filePattern, source: sourceFolder.source, storage: sourceFolder.storage, displayPath: configuredLocation, isDefault });
            }
          }
        }
      } catch (error) {
        this.logService.error(`Failed to resolve prompt file location: ${configuredLocation}`, error);
      }
    }
    return result;
  }
  /**
   * Uses the file service to resolve the provided location and return either the file at the location of files in the directory.
   * For instruction folders, this searches recursively (up to {@link MAX_INSTRUCTIONS_RECURSION_DEPTH} levels deep) provided
   * the location is not a workspace folder root and does not contain wildcards, to support subdirectories while avoiding
   * accidentally broad traversal.
   */
  async resolveFilesAtLocation(location, type, token, depth = 0) {
    if (type === PromptsType.skill) {
      return this.findAgentSkillsInFolder(location, token);
    }
    const isWorkspaceRoot = depth === 0 && this.getWorkspaceFolders().some((f) => isEqual(f.uri, location));
    const recursive = type === PromptsType.instructions && !isWorkspaceRoot && !hasGlobPattern(location.path) && depth < MAX_INSTRUCTIONS_RECURSION_DEPTH;
    try {
      const info = await this.fileService.resolve(location);
      if (token.isCancellationRequested) {
        return [];
      }
      if (info.isFile) {
        return [info.resource];
      } else if (info.isDirectory && info.children) {
        const result = [];
        for (const child of info.children) {
          if (child.isFile) {
            result.push(child.resource);
          } else if (recursive && child.isDirectory) {
            const subFiles = await this.resolveFilesAtLocation(child.resource, type, token, depth + 1);
            result.push(...subFiles);
          }
        }
        return result;
      }
    } catch (e) {
      if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
      } else {
        this.logService.error(`Failed to resolve files at location: ${location.toString()}`, e);
      }
    }
    return [];
  }
  /**
   * Uses the search service to find all files at the provided location.
   * Requires a FileSearchProvider to be available for the folder's scheme.
   */
  async searchFilesInLocation(folder, filePattern, token) {
    if (!this.searchService.schemeHasFileSearchProvider(folder.scheme)) {
      this.logService.warn(`[PromptFilesLocator] No FileSearchProvider available for scheme '${folder.scheme}'. Cannot search for pattern '${filePattern}' in ${folder.toString()}`);
      return [];
    }
    const disregardIgnoreFiles = this.configService.getValue("explorer.excludeGitIgnore");
    const workspaceRoot = this.getWorkspaceFolder(folder);
    const getExcludePattern = (folder2) => getExcludes(this.configService.getValue({ resource: folder2 })) || {};
    const searchOptions = {
      folderQueries: [{ folder, disregardIgnoreFiles }],
      type: QueryType.File,
      shouldGlobMatchFilePattern: true,
      excludePattern: workspaceRoot ? getExcludePattern(workspaceRoot.uri) : void 0,
      ignoreGlobCase: true,
      sortByScore: true,
      filePattern
    };
    try {
      const searchResult = await this.searchService.fileSearch(searchOptions, token);
      if (token.isCancellationRequested) {
        return [];
      }
      return searchResult.results.map((r) => r.resource);
    } catch (e) {
      if (!isCancellationError(e)) {
        throw e;
      }
    }
    return [];
  }
  /**
   * Gets list of `AGENTS.md` files anywhere in the workspace.
   */
  async findAgentMDsInWorkspace(token) {
    const result = await Promise.all(this.getWorkspaceFolders().map((folder) => this.findAgentMDsInFolder(folder.uri, token)));
    return result.flat(1);
  }
  async findAgentMDsInFolder(folder, token) {
    if (this.searchService.schemeHasFileSearchProvider(folder.scheme)) {
      const disregardIgnoreFiles = this.configService.getValue("explorer.excludeGitIgnore");
      const getExcludePattern = (folder2) => getExcludes(this.configService.getValue({ resource: folder2 })) || {};
      const searchOptions = {
        folderQueries: [{ folder, disregardIgnoreFiles }],
        type: QueryType.File,
        shouldGlobMatchFilePattern: true,
        excludePattern: getExcludePattern(folder),
        filePattern: "**/AGENTS.md",
        ignoreGlobCase: true
      };
      try {
        const searchResult = await this.searchService.fileSearch(searchOptions, token);
        if (token.isCancellationRequested) {
          return [];
        }
        const results = [];
        for (const r of searchResult.results) {
          const realPath = void 0;
          results.push({ uri: r.resource, realPath, type: AgentInstructionFileType.agentsMd });
        }
        return results;
      } catch (e) {
        if (!isCancellationError(e)) {
          throw e;
        }
      }
      return [];
    } else {
      return this.findAgentMDsUsingFileService(folder, token);
    }
  }
  /**
   * Recursively traverses a folder using the file service to find AGENTS.md files.
   * This is used as a fallback when no FileSearchProvider is available for the scheme.
   */
  async findAgentMDsUsingFileService(folder, token) {
    const result = [];
    const agentsMdFileName = "agents.md";
    const traverse = async (uri) => {
      if (token.isCancellationRequested) {
        return;
      }
      try {
        const stat = await this.fileService.resolve(uri);
        if (stat.isFile && stat.name.toLowerCase() === agentsMdFileName) {
          const realPath = stat.isSymbolicLink ? await this.fileService.realpath(stat.resource) : void 0;
          result.push({ uri: stat.resource, realPath, type: AgentInstructionFileType.agentsMd });
        } else if (stat.isDirectory && stat.children) {
          for (const child of stat.children) {
            await traverse(child.resource);
          }
        }
      } catch (error) {
        this.logService.trace(`[PromptFilesLocator] Error traversing ${uri.toString()}: ${error}`);
      }
    };
    await traverse(folder);
    return result;
  }
  async findFilesInRoots(roots, folder, paths, token, result = []) {
    const toResolve = roots.map((root) => ({ resource: folder !== void 0 ? joinPath(root, folder) : root }));
    const resolvedRoots = await this.fileService.resolveAll(toResolve);
    if (token.isCancellationRequested) {
      return result;
    }
    for (const root of resolvedRoots) {
      if (root.success && root.stat?.children) {
        for (const child of root.stat.children) {
          if (child.isFile) {
            const matchingPath = paths.find((p) => equalsIgnoreCase(p.fileName, child.name));
            if (matchingPath) {
              const realPath = child.isSymbolicLink ? await this.fileService.realpath(child.resource) : void 0;
              result.push({ uri: child.resource, realPath, type: matchingPath.type });
            }
          }
        }
      }
    }
    return result;
  }
  getAgentFileURIFromModeFile(oldURI) {
    if (oldURI.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
      let newLocation;
      const workspaceFolder = this.getWorkspaceFolder(oldURI);
      if (workspaceFolder) {
        newLocation = joinPath(workspaceFolder.uri, AGENTS_SOURCE_FOLDER, getCleanPromptName(oldURI) + AGENT_FILE_EXTENSION);
      } else if (isEqualOrParent(oldURI, this.userDataService.currentProfile.promptsHome)) {
        newLocation = joinPath(this.userDataService.currentProfile.promptsHome, getCleanPromptName(oldURI) + AGENT_FILE_EXTENSION);
      }
      return newLocation;
    }
    return void 0;
  }
  async findAgentSkillsInFolder(uri, token) {
    try {
      const result = [];
      const stat = await this.fileService.resolve(uri);
      if (stat.isDirectory && stat.children) {
        for (const child of stat.children) {
          try {
            if (token.isCancellationRequested) {
              return [];
            }
            if (child.isDirectory) {
              const skillFile = joinPath(child.resource, SKILL_FILENAME);
              const skillStat = await this.fileService.resolve(skillFile);
              if (skillStat.isFile) {
                result.push(skillStat.resource);
              }
            }
          } catch (error) {
          }
        }
      }
      return result;
    } catch (e) {
      if (!isCancellationError(e)) {
        this.logService.trace(`[PromptFilesLocator] Error searching for skills in ${uri.toString()}: ${e}`);
      }
      return [];
    }
  }
  /**
   * Searches for skills in all configured locations.
   */
  async findAgentSkills(token) {
    const configuredLocations = this.getPromptSourceFolders(PromptsType.skill);
    const absoluteLocations = await this.toAbsoluteLocations(PromptsType.skill, configuredLocations);
    const allResults = [];
    for (const { uri, source, storage } of absoluteLocations) {
      if (token.isCancellationRequested) {
        return [];
      }
      const results = await this.findAgentSkillsInFolder(uri, token);
      for (const skillUri of results) {
        allResults.push({ uri: skillUri, source, storage, type: PromptsType.skill });
      }
    }
    return allResults;
  }
};
PromptFilesLocator = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, ISearchService),
  __decorateParam(5, IUserDataProfileService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IPathService),
  __decorateParam(8, IWorkspaceTrustManagementService)
], PromptFilesLocator);
function hasGlobPattern(path) {
  return path.includes("*");
}
function isValidGlob(pattern) {
  let squareBrackets = false;
  let squareBracketsCount = 0;
  let curlyBrackets = false;
  let curlyBracketsCount = 0;
  let previousCharacter;
  for (const char of pattern) {
    if (previousCharacter === "\\") {
      previousCharacter = char;
      continue;
    }
    if (char === "*") {
      return true;
    }
    if (char === "?") {
      return true;
    }
    if (char === "[") {
      squareBrackets = true;
      squareBracketsCount++;
      previousCharacter = char;
      continue;
    }
    if (char === "]") {
      squareBrackets = true;
      squareBracketsCount--;
      previousCharacter = char;
      continue;
    }
    if (char === "{") {
      curlyBrackets = true;
      curlyBracketsCount++;
      continue;
    }
    if (char === "}") {
      curlyBrackets = true;
      curlyBracketsCount--;
      previousCharacter = char;
      continue;
    }
    previousCharacter = char;
  }
  if (squareBrackets && squareBracketsCount === 0) {
    return true;
  }
  if (curlyBrackets && curlyBracketsCount === 0) {
    return true;
  }
  return false;
}
function resolveSearchLocation(type, location) {
  if (type !== PromptsType.instructions && type !== PromptsType.prompt) {
    return { searchRoot: location };
  }
  const segments = location.path.split("/");
  let i = 0;
  while (i < segments.length && isValidGlob(segments[i]) === false) {
    i++;
  }
  if (i === segments.length) {
    return { searchRoot: location };
  }
  const parent = location.with({ path: segments.slice(0, i).join("/") });
  if (i === segments.length - 1 && segments[i] === "*" || segments[i] === ``) {
    return { searchRoot: parent };
  }
  return {
    searchRoot: parent,
    filePattern: segments.slice(i).join("/")
  };
}
const VALID_PROMPT_FOLDER_PATTERN = "^(?![A-Za-z]:[\\\\/])(?!/)(?!~(?!/))(?!.*\\\\)(?!.*[*?\\[\\]{}]).*\\S.*$";
const VALID_PROMPT_FOLDER_REGEX = new RegExp(VALID_PROMPT_FOLDER_PATTERN);
function isValidPromptFolderPath(path) {
  return VALID_PROMPT_FOLDER_REGEX.test(path);
}
export {
  PromptFilesLocator,
  VALID_PROMPT_FOLDER_PATTERN,
  hasGlobPattern,
  isValidGlob,
  isValidPromptFolderPath
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC91dGlscy9wcm9tcHRGaWxlc0xvY2F0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uLCBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRGaWxlTG9jYXRpb25zQ29uZmlnS2V5LCBpc1RpbGRlUGF0aCwgUHJvbXB0c0NvbmZpZyB9IGZyb20gJy4uL2NvbmZpZy9jb25maWcuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGRpcm5hbWUsIGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBR0VOVFNfU09VUkNFX0ZPTERFUiwgQ0xBVURFX0NPTkZJR19GT0xERVIsIENPUElMT1RfQ09ORklHX0ZPTERFUiwgR0lUSFVCX0NPTkZJR19GT0xERVIsIGdldFByb21wdEZpbGVFeHRlbnNpb24sIGdldFByb21wdEZpbGVUeXBlLCBMRUdBQ1lfTU9ERV9GSUxFX0VYVEVOU0lPTiwgZ2V0Q2xlYW5Qcm9tcHROYW1lLCBBR0VOVF9GSUxFX0VYVEVOU0lPTiwgZ2V0UHJvbXB0RmlsZURlZmF1bHRMb2NhdGlvbnMsIFNLSUxMX0ZJTEVOQU1FLCBJUHJvbXB0U291cmNlRm9sZGVyLCBJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXIgfSBmcm9tICcuLi9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRGaWxlU291cmNlLCBQcm9tcHRzVHlwZSB9IGZyb20gJy4uL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGdldEV4Y2x1ZGVzLCBJRmlsZVF1ZXJ5LCBJU2VhcmNoQ29uZmlndXJhdGlvbiwgSVNlYXJjaFNlcnZpY2UsIFF1ZXJ5VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZSwgSVByb21wdFBhdGgsIElBZ2VudEluc3RydWN0aW9uRmlsZSwgTG9nZ2VyLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uL3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXF1YWxzSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfU0NIRU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuXG4vKipcbiAqIE1heGltdW0gcmVjdXJzaW9uIGRlcHRoIHdoZW4gdHJhdmVyc2luZyBzdWJkaXJlY3RvcmllcyBmb3IgaW5zdHJ1Y3Rpb24gZmlsZXMuXG4gKi9cbmNvbnN0IE1BWF9JTlNUUlVDVElPTlNfUkVDVVJTSU9OX0RFUFRIID0gNTtcblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlSW5zdHJ1Y3Rpb25GaWxlIHtcblx0cmVhZG9ubHkgZmlsZU5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgdHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlO1xufVxuXG4vKipcbiAqIFV0aWxpdHkgY2xhc3MgdG8gbG9jYXRlIHByb21wdCBmaWxlcy5cbiAqL1xuZXhwb3J0IGNsYXNzIFByb21wdEZpbGVzTG9jYXRvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YUZvbGRlcjogSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdGNvbnN0IHVzZXJEYXRhUHJvbXB0c0hvbWUgPSB0aGlzLnVzZXJEYXRhU2VydmljZS5jdXJyZW50UHJvZmlsZS5wcm9tcHRzSG9tZTtcblx0XHR0aGlzLnVzZXJEYXRhRm9sZGVyID0ge1xuXHRcdFx0dXJpOiB1c2VyRGF0YVByb21wdHNIb21lLFxuXHRcdFx0c2VhcmNoUm9vdDogdXNlckRhdGFQcm9tcHRzSG9tZSxcblx0XHRcdGZpbGVQYXR0ZXJuOiB1bmRlZmluZWQsXG5cdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuVXNlckRhdGEsXG5cdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0ZGlzcGxheVBhdGg6IG5scy5sb2NhbGl6ZSgncHJvbXB0c1VzZXJEYXRhRm9sZGVyJywgXCJVc2VyIERhdGFcIiksXG5cdFx0XHRpc0RlZmF1bHQ6IHRydWVcblx0XHR9O1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFdvcmtzcGFjZUZvbGRlcnMoKTogcmVhZG9ubHkgSVdvcmtzcGFjZUZvbGRlcltdIHtcblx0XHQvLyBBZ2VudCBob3N0IHdvcmtzcGFjZSBmb2xkZXJzIHN1cmZhY2UgY3VzdG9taXphdGlvbnMgdGhyb3VnaCBBSFBcblx0XHQvLyAoc2Vzc2lvbiBzdGF0ZSArIGZpbmRBZ2VudFNraWxscyksIG5vdCB2aWEgZmlsZXN5c3RlbSBzY2FubmluZy5cblx0XHQvLyBJbmNsdWRpbmcgdGhlbSBoZXJlIHdvdWxkIGlzc3VlIGEgYHJlc291cmNlTGlzdGAgSlNPTi1SUEMgcGVyXG5cdFx0Ly8gY29uZmlndXJlZCBsb2NhdGlvbiBmb3IgZXZlcnkgbm9uZXhpc3RlbnQgYC5naXRodWJgIC8gYC5jbGF1ZGVgXG5cdFx0Ly8gZm9sZGVyIG9uIHRoZSByZW1vdGUuXG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmZpbHRlcihmID0+IGYudXJpLnNjaGVtZSAhPT0gQUdFTlRfSE9TVF9TQ0hFTUUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZTogVVJJKTogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2UpID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiBFdmVudC5tYXAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycywgKCkgPT4gdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjb25maWd1cmVkIHByb21wdCBzb3VyY2UgZm9sZGVycyBmb3IgdGhlIGdpdmVuIHR5cGUuXG5cdCAqIFN1YmNsYXNzZXMgY2FuIG92ZXJyaWRlIHRvIGZpbHRlciBvdXQgdW5zdXBwb3J0ZWQgc291cmNlcy5cblx0ICovXG5cdHByb3RlY3RlZCBnZXRQcm9tcHRTb3VyY2VGb2xkZXJzKHR5cGU6IFByb21wdHNUeXBlKTogSVByb21wdFNvdXJjZUZvbGRlcltdIHtcblx0XHRyZXR1cm4gUHJvbXB0c0NvbmZpZy5wcm9tcHRTb3VyY2VGb2xkZXJzKHRoaXMuY29uZmlnU2VydmljZSwgdHlwZSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgZGVmYXVsdCBwcm9tcHQgc291cmNlIGZvbGRlcnMgZm9yIHRoZSBnaXZlbiB0eXBlLlxuXHQgKiBTdWJjbGFzc2VzIGNhbiBvdmVycmlkZSB0byBmaWx0ZXIgb3V0IHVuc3VwcG9ydGVkIHNvdXJjZXMuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0RGVmYXVsdFNvdXJjZUZvbGRlcnModHlwZTogUHJvbXB0c1R5cGUpOiByZWFkb25seSBJUHJvbXB0U291cmNlRm9sZGVyW10ge1xuXHRcdHJldHVybiBnZXRQcm9tcHRGaWxlRGVmYXVsdExvY2F0aW9ucyh0eXBlKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRXb3Jrc3BhY2VGb2xkZXJSb290cyhpbmNsdWRlUGFyZW50czogYm9vbGVhbiwgbG9nZ2VyPzogTG9nZ2VyKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLmdldFdvcmtzcGFjZUZvbGRlcnMoKTtcblx0XHRpZiAoaW5jbHVkZVBhcmVudHMpIHtcblx0XHRcdGNvbnN0IHJvb3RzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRcdGZvciAoY29uc3Qgd29ya3NwYWNlRm9sZGVyIG9mIHdvcmtzcGFjZUZvbGRlcnMpIHtcblx0XHRcdFx0cm9vdHMuYWRkKHdvcmtzcGFjZUZvbGRlci51cmkpO1xuXHRcdFx0XHQvLyBXYWxrIHVwIGZyb20gdGhlIHdvcmtzcGFjZSBmb2xkZXIgdG8gZmluZCB0aGUgcmVwb3NpdG9yeSByb290XG5cdFx0XHRcdC8vICguZ2l0IGZvbGRlcikuIE9ubHkgaW5jbHVkZSBwYXJlbnQgZm9sZGVycyBpZiBhIHJlcG8gcm9vdCBpc1xuXHRcdFx0XHQvLyBhY3R1YWxseSBmb3VuZDsgb3RoZXJ3aXNlIGtlZXAgb25seSB0aGUgd29ya3NwYWNlIGZvbGRlci5cblx0XHRcdFx0Y29uc3QgcGFyZW50cyA9IGF3YWl0IHRoaXMuZmluZFBhcmVudFJlcG9Gb2xkZXJzKHdvcmtzcGFjZUZvbGRlci51cmksIHVzZXJIb21lLCByb290cywgbG9nZ2VyKTtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXJlbnQgb2YgcGFyZW50cykge1xuXHRcdFx0XHRcdHJvb3RzLmFkZChwYXJlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gWy4uLnJvb3RzXTtcblx0XHR9XG5cdFx0cmV0dXJuIHdvcmtzcGFjZUZvbGRlcnMubWFwKGYgPT4gZi51cmkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdhbGtzIHVwIGZyb20ge0BsaW5rIGZvbGRlclVyaX0gY29sbGVjdGluZyBwYXJlbnQgZm9sZGVycyB1bnRpbCBhXG5cdCAqIHJlcG9zaXRvcnkgcm9vdCAoYSBmb2xkZXIgY29udGFpbmluZyBgLmdpdGApIGlzIGZvdW5kLiAgUmV0dXJucyB0aGVcblx0ICogaW50ZXJtZWRpYXRlIHBhcmVudCBmb2xkZXJzIG9ubHkgd2hlbiBhIHJlcG8gcm9vdCBpcyBmb3VuZDsgcmV0dXJuc1xuXHQgKiBhbiBlbXB0eSBhcnJheSB3aGVuIHRoZSB3YWxrIHJlYWNoZXMgdGhlIGZpbGVzeXN0ZW0gcm9vdCwgdGhlIHVzZXJcblx0ICogaG9tZSBkaXJlY3RvcnksIG9yIGEgZm9sZGVyIGFscmVhZHkgcHJlc2VudCBpbiB7QGxpbmsgc2Vlbn0uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGZpbmRQYXJlbnRSZXBvRm9sZGVycyhmb2xkZXJVcmk6IFVSSSwgdXNlckhvbWU6IFVSSSwgc2VlbjogUmVzb3VyY2VTZXQsIGxvZ2dlcj86IExvZ2dlcik6IFByb21pc2U8VVJJW10+IHtcblx0XHRjb25zdCBjYW5kaWRhdGVzOiBVUklbXSA9IFtdO1xuXHRcdGxldCBjdXJyZW50ID0gZm9sZGVyVXJpO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBpc1JlcG9Sb290ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoam9pblBhdGgoY3VycmVudCwgJy5naXQnKSk7XG5cdFx0XHRcdGlmIChpc1JlcG9Sb290KSB7XG5cdFx0XHRcdFx0aWYgKChhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvKGN1cnJlbnQpKS50cnVzdGVkKSB7XG5cdFx0XHRcdFx0XHRjYW5kaWRhdGVzLnB1c2goY3VycmVudCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY2FuZGlkYXRlcztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bG9nZ2VyPy5sb2dJbmZvKGBSZXBvc2l0b3J5IHJvb3QgZm91bmQgYXQgJHtjdXJyZW50LnRvU3RyaW5nKCl9LCBidXQgaXQgaXMgbm90IHRydXN0ZWQuIFNraXBwaW5nIHBhcmVudCBmb2xkZXIgaW5jbHVzaW9uIGZvciB0aGlzIHdvcmtzcGFjZSBmb2xkZXIuYCk7XG5cdFx0XHRcdFx0cmV0dXJuIFtdOyAvLyBpZiB0aGUgcmVwbyByb290IGlzbid0IHRydXN0ZWQsIGRvbid0IGluY2x1ZGUgaXQgb3IgYW55IHBhcmVudHNcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zdCBtc2cgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG5cdFx0XHRcdGxvZ2dlcj8ubG9nSW5mbyhgTm8gcmVwb3NpdG9yeSByb290IGZvdW5kIGZvciBmb2xkZXIgJHtmb2xkZXJVcmkudG9TdHJpbmcoKX0uIEVycm9yIGFjY2Vzc2luZyAke2pvaW5QYXRoKGN1cnJlbnQsICcuZ2l0Jyl9OiAke21zZ30uYCk7XG5cdFx0XHRcdHJldHVybiBbXTsgLy8gaWYgd2UgY2FuJ3QgYWNjZXNzIHRoZSBmb2xkZXIsIHJldHVybiBhbiBlbXB0eSBsaXN0IHRvIGF2b2lkIHRyZWF0aW5nIGl0IGFzIGEgbm9uLXJlcG9zaXRvcnkgd2hlbiB3ZSBtaWdodCBqdXN0IGhhdmUgYSBwZXJtaXNzaW9uIGlzc3VlXG5cdFx0XHR9XG5cdFx0XHRjYW5kaWRhdGVzLnB1c2goY3VycmVudCk7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBkaXJuYW1lKGN1cnJlbnQpO1xuXHRcdFx0Ly8gU3RvcCB3YWxraW5nIHVwIHdoZW4gd2UgcmVhY2ggYSBmaWxlc3lzdGVtIHJvb3QgKGZpeGVkLXBvaW50XG5cdFx0XHQvLyBvZiBkaXJuYW1lLCBlLmcuICcvJyBvciBhIFdpbmRvd3MgZHJpdmUgcm9vdCBsaWtlICdEOlxcJyksXG5cdFx0XHQvLyB0aGUgdXNlciBob21lIGRpcmVjdG9yeSwgb3IgYW4gYWxyZWFkeS1zZWVuIGZvbGRlci5cblx0XHRcdGlmIChpc0VxdWFsKGN1cnJlbnQsIHBhcmVudCkgfHwgY3VycmVudC5wYXRoID09PSAnLycgfHwgaXNFcXVhbCh1c2VySG9tZSwgcGFyZW50KSB8fCBzZWVuLmhhcyhwYXJlbnQpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudCA9IHBhcmVudDtcblx0XHR9XG5cdFx0Ly8gbm8gcmVwbyBmb3VuZFxuXHRcdGxvZ2dlcj8ubG9nSW5mbyhgTm8gcmVwb3NpdG9yeSByb290IGZvdW5kIGZvciBmb2xkZXIgJHtmb2xkZXJVcmkudG9TdHJpbmcoKX0uYCk7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpc3QgYWxsIHByb21wdCBmaWxlcyBmcm9tIHRoZSBmaWxlc3lzdGVtLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBMaXN0IG9mIHByb21wdCBmaWxlcyBmb3VuZCBpbiB0aGUgd29ya3NwYWNlLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGxpc3RGaWxlcyh0eXBlOiBQcm9tcHRzVHlwZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgVVJJW10+IHtcblx0XHRpZiAoc3RvcmFnZSAhPT0gUHJvbXB0c1N0b3JhZ2UudXNlciAmJiBzdG9yYWdlICE9PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbnN1cHBvcnRlZCBwcm9tcHQgZmlsZSBzdG9yYWdlOiAke3N0b3JhZ2V9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJlZExvY2F0aW9ucyA9IHRoaXMuZ2V0UHJvbXB0U291cmNlRm9sZGVycyh0eXBlKTtcblx0XHRjb25zdCBhYnNvbHV0ZUxvY2F0aW9ucyA9IGF3YWl0IHRoaXMudG9BYnNvbHV0ZUxvY2F0aW9ucyh0eXBlLCBjb25maWd1cmVkTG9jYXRpb25zLmZpbHRlcihsb2MgPT4gbG9jLnN0b3JhZ2UgPT09IHN0b3JhZ2UpKTtcblxuXHRcdGlmIChzdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyICYmICh0eXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCB8fCB0eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfHwgdHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0KSkge1xuXHRcdFx0YWJzb2x1dGVMb2NhdGlvbnMucHVzaCh0aGlzLnVzZXJEYXRhRm9sZGVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXRocyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdFx0Zm9yIChjb25zdCB7IHNlYXJjaFJvb3QsIGZpbGVQYXR0ZXJuIH0gb2YgYWJzb2x1dGVMb2NhdGlvbnMpIHtcblx0XHRcdGNvbnN0IGZpbGVzID0gKGZpbGVQYXR0ZXJuID09PSB1bmRlZmluZWQpXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5yZXNvbHZlRmlsZXNBdExvY2F0aW9uKHNlYXJjaFJvb3QsIHR5cGUsIHRva2VuKSAvLyBpZiB0aGUgbG9jYXRpb24gZG9lcyBub3QgY29udGFpbiBhIGdsb2IgcGF0dGVybiwgcmVzb2x2ZSB0aGUgbG9jYXRpb24gZGlyZWN0bHlcblx0XHRcdFx0OiBhd2FpdCB0aGlzLnNlYXJjaEZpbGVzSW5Mb2NhdGlvbihzZWFyY2hSb290LCBmaWxlUGF0dGVybiwgdG9rZW4pO1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRcdGlmIChnZXRQcm9tcHRGaWxlVHlwZShmaWxlKSA9PT0gdHlwZSkge1xuXHRcdFx0XHRcdHBhdGhzLmFkZChmaWxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5wYXRoc107XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlRmlsZXNVcGRhdGVkRXZlbnQodHlwZTogUHJvbXB0c1R5cGUpOiB7IHJlYWRvbmx5IGV2ZW50OiBFdmVudDx2b2lkPjsgZGlzcG9zZTogKCkgPT4gdm9pZCB9IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBldmVudEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3QgdG9rZW4gPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpLnRva2VuOyAvLyB0cmFjayB0aGUgZGlzcG9zYWwgb2YgdGhlIGV2ZW50IGxpc3RlbmVycyBzbyB3ZSBjYW4gY2FuY2VsIGFueSBpbi1mbGlnaHQgYXN5bmMgb3BlcmF0aW9ucyB3aGVuIHRoZSBldmVudCBpcyBkaXNwb3NlZFxuXG5cdFx0Y29uc3QgZXh0ZXJuYWxGb2xkZXJXYXRjaGVycyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGtleSA9IGdldFByb21wdEZpbGVMb2NhdGlvbnNDb25maWdLZXkodHlwZSk7XG5cdFx0Y29uc3QgdXNlckRhdGFGb2xkZXIgPSB0aGlzLnVzZXJEYXRhU2VydmljZS5jdXJyZW50UHJvZmlsZS5wcm9tcHRzSG9tZTtcblxuXHRcdGxldCBwYXJlbnRGb2xkZXJzOiByZWFkb25seSBJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXJbXSA9IFtdO1xuXG5cdFx0Y29uc3QgdXBkYXRlRXh0ZXJuYWxGb2xkZXJXYXRjaGVycyA9ICgpID0+IHtcblx0XHRcdGV4dGVybmFsRm9sZGVyV2F0Y2hlcnMuY2xlYXIoKTtcblx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHBhcmVudEZvbGRlcnMpIHtcblx0XHRcdFx0aWYgKCF0aGlzLmdldFdvcmtzcGFjZUZvbGRlcihmb2xkZXIuc2VhcmNoUm9vdCkpIHtcblx0XHRcdFx0XHQvLyBpZiB0aGUgZm9sZGVyIGlzIG5vdCBwYXJ0IG9mIHRoZSB3b3Jrc3BhY2UsIHdlIG5lZWQgdG8gd2F0Y2ggaXRcblx0XHRcdFx0XHRjb25zdCByZWN1cnNpdmUgPSBmb2xkZXIuZmlsZVBhdHRlcm4gIT09IHVuZGVmaW5lZCB8fCB0eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM7IC8vIGluc3RydWN0aW9ucyBjYW4gYmUgaW4gc3ViZm9sZGVycywgc28gd2F0Y2ggcmVjdXJzaXZlbHlcblx0XHRcdFx0XHRleHRlcm5hbEZvbGRlcldhdGNoZXJzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKGZvbGRlci5zZWFyY2hSb290LCB7IHJlY3Vyc2l2ZSwgZXhjbHVkZXM6IFtdIH0pKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGUgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkTG9jYXRpb25zID0gdGhpcy5nZXRQcm9tcHRTb3VyY2VGb2xkZXJzKHR5cGUpO1xuXHRcdFx0XHRwYXJlbnRGb2xkZXJzID0gYXdhaXQgdGhpcy50b0Fic29sdXRlTG9jYXRpb25zKHR5cGUsIGNvbmZpZ3VyZWRMb2NhdGlvbnMsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVwZGF0ZUV4dGVybmFsRm9sZGVyV2F0Y2hlcnMoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHVwZGF0aW5nIHByb21wdCBmaWxlIHdhdGNoZXJzIGFmdGVyIGNvbmZpZyBjaGFuZ2U6YCwgZXJyKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oa2V5KSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPUykpIHtcblx0XHRcdFx0dm9pZCB1cGRhdGUoKTtcblx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCkoKCkgPT4ge1xuXHRcdFx0dm9pZCB1cGRhdGUoKTtcblx0XHRcdGV2ZW50RW1pdHRlci5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycygoKSA9PiB7XG5cdFx0XHR2b2lkIHVwZGF0ZSgpO1xuXHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHModXNlckRhdGFGb2xkZXIpKSB7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChwYXJlbnRGb2xkZXJzLnNvbWUoZm9sZGVyID0+IGUuYWZmZWN0cyhmb2xkZXIuc2VhcmNoUm9vdCkpKSB7XG5cdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uud2F0Y2godXNlckRhdGFGb2xkZXIpKTtcblxuXHRcdHZvaWQgdXBkYXRlKCk7XG5cblx0XHRyZXR1cm4geyBldmVudDogZXZlbnRFbWl0dGVyLmV2ZW50LCBkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkgfTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVBZ2VudEluc3RydWN0aW9uc1VwZGF0ZWRFdmVudCgpOiB7IHJlYWRvbmx5IGV2ZW50OiBFdmVudDx2b2lkPjsgZGlzcG9zZTogKCkgPT4gdm9pZCB9IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBldmVudEVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdGNvbnN0IHRva2VuID0gY3RzLnRva2VuO1xuXHRcdGNvbnN0IHdhdGNoZXJzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3Qgd2F0Y2hlZFJvb3RzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0XHRjb25zdCBhZGRXYXRjaCA9IChyZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdhdGNoZWRSb290cy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0d2F0Y2hlZFJvb3RzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHR3YXRjaGVycy5hZGQodGhpcy5maWxlU2VydmljZS53YXRjaChyZXNvdXJjZSkpO1xuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVXYXRjaGVycyA9IGFzeW5jICgpID0+IHtcblx0XHRcdHdhdGNoZXJzLmNsZWFyKCk7XG5cdFx0XHR3YXRjaGVkUm9vdHMuY2xlYXIoKTtcblxuXHRcdFx0Y29uc3Qgd2F0Y2hXb3Jrc3BhY2VSb290cyA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9BR0VOVF9NRCkgfHwgdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NMQVVERV9NRCk7XG5cdFx0XHRjb25zdCB3YXRjaENsYXVkZUZvbGRlcnMgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfQ0xBVURFX01EKTtcblx0XHRcdGNvbnN0IHdhdGNoQ29waWxvdEZvbGRlcnMgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWUoUHJvbXB0c0NvbmZpZy5VU0VfQ09QSUxPVF9JTlNUUlVDVElPTl9GSUxFUyk7XG5cdFx0XHRjb25zdCBpbmNsdWRlUGFyZW50cyA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZShQcm9tcHRzQ29uZmlnLlVTRV9DVVNUT01JWkFUSU9OU19JTl9QQVJFTlRfUkVQT1MpID09PSB0cnVlO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlUm9vdHMgPSBhd2FpdCB0aGlzLmdldFdvcmtzcGFjZUZvbGRlclJvb3RzKGluY2x1ZGVQYXJlbnRzKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3Qgd29ya3NwYWNlUm9vdCBvZiB3b3Jrc3BhY2VSb290cykge1xuXHRcdFx0XHRpZiAod2F0Y2hXb3Jrc3BhY2VSb290cykge1xuXHRcdFx0XHRcdGFkZFdhdGNoKHdvcmtzcGFjZVJvb3QpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh3YXRjaENsYXVkZUZvbGRlcnMpIHtcblx0XHRcdFx0XHRhZGRXYXRjaChqb2luUGF0aCh3b3Jrc3BhY2VSb290LCBDTEFVREVfQ09ORklHX0ZPTERFUikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh3YXRjaENvcGlsb3RGb2xkZXJzKSB7XG5cdFx0XHRcdFx0YWRkV2F0Y2goam9pblBhdGgod29ya3NwYWNlUm9vdCwgR0lUSFVCX0NPTkZJR19GT0xERVIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAod2F0Y2hDbGF1ZGVGb2xkZXJzKSB7XG5cdFx0XHRcdGFkZFdhdGNoKGpvaW5QYXRoKHVzZXJIb21lLCBDTEFVREVfQ09ORklHX0ZPTERFUikpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHdhdGNoQ29waWxvdEZvbGRlcnMpIHtcblx0XHRcdFx0YWRkV2F0Y2goam9pblBhdGgodXNlckhvbWUsIENPUElMT1RfQ09ORklHX0ZPTERFUikpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCByZWZyZXNoID0gKCkgPT4ge1xuXHRcdFx0dm9pZCB1cGRhdGVXYXRjaGVycygpO1xuXHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoKTtcblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29uZmlnU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQUdFTlRfTUQpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ0xBVURFX01EKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFByb21wdHNDb25maWcuVVNFX0NPUElMT1RfSU5TVFJVQ1RJT05fRklMRVMpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUHJvbXB0c0NvbmZpZy5VU0VfQ1VTVE9NSVpBVElPTlNfSU5fUEFSRU5UX1JFUE9TKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCkoKCkgPT4ge1xuXHRcdFx0cmVmcmVzaCgpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3RlZEZvbGRlcnMoKCkgPT4ge1xuXHRcdFx0cmVmcmVzaCgpO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB3YXRjaGVkUm9vdCBvZiB3YXRjaGVkUm9vdHMpIHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0cyh3YXRjaGVkUm9vdCkpIHtcblx0XHRcdFx0XHRldmVudEVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5maWxlU2VydmljZS5vbkRpZFJ1bk9wZXJhdGlvbihlID0+IHtcblx0XHRcdGZvciAoY29uc3Qgd2F0Y2hlZFJvb3Qgb2Ygd2F0Y2hlZFJvb3RzKSB7XG5cdFx0XHRcdGlmIChpc0VxdWFsT3JQYXJlbnQoZS5yZXNvdXJjZSwgd2F0Y2hlZFJvb3QpKSB7XG5cdFx0XHRcdFx0ZXZlbnRFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5DUkVBVEUpIHx8IGUuaXNPcGVyYXRpb24oRmlsZU9wZXJhdGlvbi5NT1ZFKSB8fCBlLmlzT3BlcmF0aW9uKEZpbGVPcGVyYXRpb24uQ09QWSkpIHtcblx0XHRcdFx0XHRpZiAoaXNFcXVhbE9yUGFyZW50KGUudGFyZ2V0LnJlc291cmNlLCB3YXRjaGVkUm9vdCkpIHtcblx0XHRcdFx0XHRcdGV2ZW50RW1pdHRlci5maXJlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dm9pZCB1cGRhdGVXYXRjaGVycygpO1xuXG5cdFx0cmV0dXJuIHsgZXZlbnQ6IGV2ZW50RW1pdHRlci5ldmVudCwgZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpIH07XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgaG9vayBzb3VyY2UgZm9sZGVycyBmb3IgY3JlYXRpbmcgbmV3IGhvb2tzLlxuXHQgKiBSZXR1cm5zIGNvbmZpZ3VyZWQgaG9vayBmb2xkZXJzLCBleGNsdWRpbmcgQ2xhdWRlIHBhdGhzICh3aGljaCBhcmUgcmVhZC1vbmx5KS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBnZXRIb29rU291cmNlRm9sZGVycygpOiBQcm9taXNlPHJlYWRvbmx5IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlcltdPiB7XG5cdFx0Y29uc3QgY29uZmlndXJlZExvY2F0aW9ucyA9IHRoaXMuZ2V0UHJvbXB0U291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5ob29rKTtcblxuXHRcdC8vIElnbm9yZSBjbGF1ZGUgZm9sZGVycyBzaW5jZSB0aGV5IGFyZW4ndCBmaXJzdC1jbGFzcyBzdXBwb3J0ZWQsIHNvIHdlIGRvbid0IHdhbnQgdG8gY3JlYXRlIGludmFsaWQgZm9ybWF0c1xuXHRcdC8vIENoZWNrIGZvciAuY2xhdWRlIGFzIGFuIGFjdHVhbCBwYXRoIHNlZ21lbnQgKHN0YXJ0cyB3aXRoIFwiLmNsYXVkZS9cIiBvciBjb250YWlucyBcIi8uY2xhdWRlL1wiKVxuXHRcdGNvbnN0IGFsbG93ZWRIb29rRm9sZGVycyA9IGNvbmZpZ3VyZWRMb2NhdGlvbnMuZmlsdGVyKGxvYyA9PlxuXHRcdFx0IWxvYy5wYXRoLnN0YXJ0c1dpdGgoJy5jbGF1ZGUvJykgJiYgIWxvYy5wYXRoLmluY2x1ZGVzKCcvLmNsYXVkZS8nKVxuXHRcdCk7XG5cblx0XHQvLyBDb252ZXJ0IHRvIGFic29sdXRlIGxvY2F0aW9ucyB3aXRoIG1ldGFkYXRhXG5cdFx0Y29uc3QgYWJzb2x1dGVMb2NhdGlvbnMgPSBhd2FpdCB0aGlzLnRvQWJzb2x1dGVMb2NhdGlvbnMoUHJvbXB0c1R5cGUuaG9vaywgYWxsb3dlZEhvb2tGb2xkZXJzKTtcblxuXHRcdC8vIERlZHVwbGljYXRlIGJ5IHNlYXJjaCByb290LCBrZWVwaW5nIHRoZSBmaXJzdCBvY2N1cnJlbmNlXG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGNvbnN0IHJlc3VsdDogSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGxvY2F0aW9uIG9mIGFic29sdXRlTG9jYXRpb25zKSB7XG5cdFx0XHQvLyBGb3IgaG9vayBjb25maWdzLCBlbnRyaWVzIGFyZSBkaXJlY3RvcmllcyB1bmxlc3MgdGhlIHBhdGggZW5kcyB3aXRoIC5qc29uIChzcGVjaWZpYyBmaWxlKVxuXHRcdFx0Ly8gRGVmYXVsdCBlbnRyaWVzIGhhdmUgZmlsZVBhdHRlcm4sIHVzZXIgZW50cmllcyBkb24ndCBidXQgYXJlIHN0aWxsIGRpcmVjdG9yaWVzXG5cdFx0XHQvLyBzZWFyY2hSb290IGFscmVhZHkgcG9pbnRzIHRvIHRoZSBjb3JyZWN0IGRpcmVjdG9yeSBvciBzcGVjaWZpYyBmaWxlIHRvIHVzZSBpbiBib3RoIGNhc2VzXG5cdFx0XHRpZiAoIXNlZW4uaGFzKGxvY2F0aW9uLnNlYXJjaFJvb3QpKSB7XG5cdFx0XHRcdHNlZW4uYWRkKGxvY2F0aW9uLnNlYXJjaFJvb3QpO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IC4uLmxvY2F0aW9uLCB1cmk6IGxvY2F0aW9uLnNlYXJjaFJvb3QsIGZpbGVQYXR0ZXJuOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYWxsIHBvc3NpYmxlIHVuYW1iaWd1b3VzIHByb21wdCBmaWxlIHNvdXJjZSBmb2xkZXJzIGJhc2VkIG9uXG5cdCAqIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBmb2xkZXIgc3RydWN0dXJlLlxuXHQgKlxuXHQgKiBUaGlzIG1ldGhvZCBpcyBjdXJyZW50bHkgcHJpbWFyaWx5IHVzZWQgYnkgdGhlIGA+IENyZWF0ZSBQcm9tcHRgXG5cdCAqIGNvbW1hbmQgdGhhdCBwcm92aWRlcnMgdXNlcnMgd2l0aCB0aGUgbGlzdCBvZiBkZXN0aW5hdGlvbiBmb2xkZXJzXG5cdCAqIGZvciBhIG5ld2x5IGNyZWF0ZWQgcHJvbXB0IGZpbGUuIEJlY2F1c2Ugc3VjaCBhIGxpc3QgY2Fubm90IGNvbnRhaW5cblx0ICogcGF0aHMgdGhhdCBpbmNsdWRlIGBnbG9iIHBhdHRlcm5gIGluIHRoZW0sIHdlIG5lZWQgdG8gcHJvY2VzcyBjb25maWdcblx0ICogdmFsdWVzIGFuZCB0cnkgdG8gY3JlYXRlIGEgbGlzdCBvZiBjbGVhciBhbmQgdW5hbWJpZ3VvdXMgbG9jYXRpb25zLlxuXHQgKlxuXHQgKiBAcmV0dXJucyBMaXN0IG9mIHBvc3NpYmxlIHVuYW1iaWd1b3VzIHByb21wdCBmaWxlIGZvbGRlcnMuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0Q29uZmlnQmFzZWRTb3VyY2VGb2xkZXJzKHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxyZWFkb25seSBVUklbXT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRMb2NhdGlvbnMgPSB0aGlzLmdldFByb21wdFNvdXJjZUZvbGRlcnModHlwZSk7XG5cdFx0Y29uc3QgYWJzb2x1dGVMb2NhdGlvbnMgPSBhd2FpdCB0aGlzLnRvQWJzb2x1dGVMb2NhdGlvbnModHlwZSwgY29uZmlndXJlZExvY2F0aW9ucyk7XG5cblx0XHQvLyBGb3IgYW55dGhpbmcgdGhhdCBkb2Vzbid0IHN1cHBvcnQgZ2xvYiBwYXR0ZXJucywgd2UgY2FuIHJldHVyblxuXHRcdGlmICh0eXBlICE9PSBQcm9tcHRzVHlwZS5wcm9tcHQgJiYgdHlwZSAhPT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRyZXR1cm4gYWJzb2x1dGVMb2NhdGlvbnMubWFwKGwgPT4gbC51cmkpO1xuXHRcdH1cblxuXHRcdC8vIGxvY2F0aW9ucyBpbiB0aGUgc2V0dGluZ3MgY2FuIGNvbnRhaW4gZ2xvYiBwYXR0ZXJucyBzbyB3ZSBuZWVkXG5cdFx0Ly8gdG8gcHJvY2VzcyB0aGVtIHRvIGdldCBcImNsZWFuXCIgcGF0aHM7IHRoZSBnb2FsIGhlcmUgaXMgdG8gaGF2ZVxuXHRcdC8vIGEgbGlzdCBvZiB1bmFtYmlndW91cyBmb2xkZXIgcGF0aHMgd2hlcmUgcHJvbXB0IGZpbGVzIGFyZSBzdG9yZWRcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRmb3IgKGNvbnN0IGFic29sdXRlTG9jYXRpb24gb2YgYWJzb2x1dGVMb2NhdGlvbnMpIHtcblx0XHRcdGxldCBsb2NhdGlvbiA9IGFic29sdXRlTG9jYXRpb24udXJpO1xuXHRcdFx0Y29uc3QgYmFzZU5hbWUgPSBiYXNlbmFtZShsb2NhdGlvbik7XG5cblx0XHRcdC8vIGlmIGEgcGF0aCBlbmRzIHdpdGggYSB3ZWxsLWtub3duIFwiYW55IGZpbGVcIiBwYXR0ZXJuLCByZW1vdmVcblx0XHRcdC8vIGl0IHNvIHdlIGNhbiBnZXQgdGhlIGRpcm5hbWUgcGF0aCBvZiB0aGF0IHNldHRpbmcgdmFsdWVcblx0XHRcdGNvbnN0IGZpbGVQYXR0ZXJucyA9IFsnKi5tZCcsIGAqJHtnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uKHR5cGUpfWBdO1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlUGF0dGVybiBvZiBmaWxlUGF0dGVybnMpIHtcblx0XHRcdFx0aWYgKGJhc2VOYW1lID09PSBmaWxlUGF0dGVybikge1xuXHRcdFx0XHRcdGxvY2F0aW9uID0gZGlybmFtZShsb2NhdGlvbik7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gbGlrZXdpc2UsIGlmIHRoZSBwYXR0ZXJuIGVuZHMgd2l0aCBzaW5nbGUgYCpgIChhbnkgZmlsZSBuYW1lKVxuXHRcdFx0Ly8gcmVtb3ZlIGl0IHRvIGdldCB0aGUgZGlybmFtZSBwYXRoIG9mIHRoZSBzZXR0aW5nIHZhbHVlXG5cdFx0XHRpZiAoYmFzZU5hbWUgPT09ICcqJykge1xuXHRcdFx0XHRsb2NhdGlvbiA9IGRpcm5hbWUobG9jYXRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBpZiBhZnRlciByZXBsYWNpbmcgdGhlIFwiZmlsZSBuYW1lXCIgZ2xvYiBwYXR0ZXJuLCB0aGUgcGF0aFxuXHRcdFx0Ly8gc3RpbGwgY29udGFpbnMgYSBnbG9iIHBhdHRlcm4sIHRoZW4gaWdub3JlIHRoZSBwYXRoXG5cdFx0XHRpZiAoaXNWYWxpZEdsb2IobG9jYXRpb24ucGF0aCkgPT09IHRydWUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5hZGQobG9jYXRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiBbLi4ucmVzdWx0XTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGFsbCByZXNvbHZlZCBzb3VyY2UgZm9sZGVycyBmb3IgdGhlIGdpdmVuIHByb21wdCB0eXBlIHdpdGggbWV0YWRhdGEuXG5cdCAqIFRoaXMgbWV0aG9kIG1lcmdlcyBjb25maWd1cmVkIGxvY2F0aW9ucyB3aXRoIGRlZmF1bHQgbG9jYXRpb25zIGFuZCByZXNvbHZlcyB0aGVtXG5cdCAqIHRvIGFic29sdXRlIHBhdGhzLCBpbmNsdWRpbmcgZGlzcGxheVBhdGggYW5kIGlzRGVmYXVsdCBpbmZvcm1hdGlvbi5cblx0ICpcblx0ICogVGhlIHJldHVybmVkIG9yZGVyIHByZWZlcnMgd29ya3NwYWNlIChsb2NhbCkgZm9sZGVycyBmaXJzdCwgdGhlbiB1c2VyIGZvbGRlcnMuXG5cdCAqIFRoaXMgaXMgdXNlZCBmb3IgVVggbGlrZSB0aGUgXCJDcmVhdGUgUHJvbXB0XCIgY29tbWFuZCB3aGVyZSB3b3Jrc3BhY2UgaXMgcHJlZmVycmVkLlxuXHQgKlxuXHQgKiBAcGFyYW0gdHlwZSBUaGUgdHlwZSBvZiBwcm9tcHQgZmlsZXMuXG5cdCAqIEByZXR1cm5zIExpc3Qgb2YgcmVzb2x2ZWQgc291cmNlIGZvbGRlcnMgd2l0aCBtZXRhZGF0YS5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBnZXRSZXNvbHZlZFNvdXJjZUZvbGRlcnModHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPHJlYWRvbmx5IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlcltdPiB7XG5cdFx0Y29uc3QgYWJzb2x1dGVMb2NhdGlvbnMgPSBhd2FpdCB0aGlzLmdldExvY2FsU3RvcmFnZUZvbGRlcnModHlwZSk7XG5cblx0XHRjb25zdCBsb2NhbEZvbGRlcnMgPSBhYnNvbHV0ZUxvY2F0aW9ucy5maWx0ZXIobG9jID0+IGxvYy5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cdFx0Y29uc3QgdXNlckZvbGRlcnMgPSBhYnNvbHV0ZUxvY2F0aW9ucy5maWx0ZXIobG9jID0+IGxvYy5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKTtcblx0XHRyZXR1cm4gdGhpcy5kZWR1cGVTb3VyY2VGb2xkZXJzKFsuLi5sb2NhbEZvbGRlcnMsIC4uLnVzZXJGb2xkZXJzXSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBhbGwgcmVzb2x2ZWQgc291cmNlIGZvbGRlcnMgaW4gdGhlIHNhbWUgb3JkZXIgdGhhdCBmaWxlIGRpc2NvdmVyeVxuXHQgKiBzZWFyY2hlcyB0aGVtICh1c2VyIGZvbGRlcnMgZmlyc3QsIHRoZW4gbG9jYWwvd29ya3NwYWNlIGZvbGRlcnMpLlxuXHQgKiBUaGlzIG1hdGNoZXMgdGhlIG9yZGVyIHVzZWQgYnkge0BsaW5rIGxpc3RGaWxlc30gYW5kIHNob3VsZCBiZSB1c2VkXG5cdCAqIGZvciBkZWJ1Zy9kaWFnbm9zdGljIG91dHB1dCBzbyB0aGUgZGlzcGxheWVkIG9yZGVyIGlzIGFjY3VyYXRlLlxuXHQgKi9cblx0cHVibGljIGFzeW5jIGdldFNvdXJjZUZvbGRlcnNJbkRpc2NvdmVyeU9yZGVyKHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxyZWFkb25seSBJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXJbXT4ge1xuXHRcdGNvbnN0IGFic29sdXRlTG9jYXRpb25zID0gYXdhaXQgdGhpcy5nZXRMb2NhbFN0b3JhZ2VGb2xkZXJzKHR5cGUpO1xuXHRcdGNvbnN0IHVzZXJGb2xkZXJzID0gYWJzb2x1dGVMb2NhdGlvbnMuZmlsdGVyKGxvYyA9PiBsb2Muc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UudXNlcik7XG5cdFx0Y29uc3QgbG9jYWxGb2xkZXJzID0gYWJzb2x1dGVMb2NhdGlvbnMuZmlsdGVyKGxvYyA9PiBsb2Muc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpO1xuXHRcdHJldHVybiB0aGlzLmRlZHVwZVNvdXJjZUZvbGRlcnMoWy4uLnVzZXJGb2xkZXJzLCAuLi5sb2NhbEZvbGRlcnNdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGFsbCBsb2NhbCAod29ya3NwYWNlKSBzdG9yYWdlIGZvbGRlcnMgZm9yIHRoZSBnaXZlbiBwcm9tcHQgdHlwZS5cblx0ICogVGhpcyBtZXJnZXMgZGVmYXVsdCBmb2xkZXJzIHdpdGggY29uZmlndXJlZCBsb2NhdGlvbnMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIGdldExvY2FsU3RvcmFnZUZvbGRlcnModHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPHJlYWRvbmx5IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlcltdPiB7XG5cdFx0Y29uc3QgY29uZmlndXJlZExvY2F0aW9ucyA9IHRoaXMuZ2V0UHJvbXB0U291cmNlRm9sZGVycyh0eXBlKTtcblx0XHRjb25zdCBkZWZhdWx0Rm9sZGVycyA9IHRoaXMuZ2V0RGVmYXVsdFNvdXJjZUZvbGRlcnModHlwZSk7XG5cblx0XHQvLyBXaGVuIHRoZSBsb2NhdGlvbnMgc2V0dGluZyBpcyBjb25maWd1cmVkLCBgZ2V0UHJvbXB0U291cmNlRm9sZGVycygpYFxuXHRcdC8vIGFscmVhZHkgcmV0dXJucyB0aGUgZW5hYmxlZCBkZWZhdWx0cyBwbHVzIGFueSBjdXN0b20gbG9jYXRpb25zIGFuZFxuXHRcdC8vIG9taXRzIGV4cGxpY2l0bHkgZGlzYWJsZWQgZGVmYXVsdHM7IHVzZSBpdCBkaXJlY3RseSBzbyBhIGRpc2FibGVkXG5cdFx0Ly8gZGVmYXVsdCAoZS5nLiBcImNoYXQuYWdlbnRTa2lsbHNMb2NhdGlvbnNcIjogeyBcIi5naXRodWIvc2tpbGxzXCI6IGZhbHNlIH0pXG5cdFx0Ly8gZG9lcyBub3QgcmVhcHBlYXIuIE9ubHkgZmFsbCBiYWNrIHRvIHRoZSByYXcgZGVmYXVsdHMgd2hlbiB0aGUgc2V0dGluZ1xuXHRcdC8vIGlzIHVuc2V0IChpbiB3aGljaCBjYXNlIGBnZXRQcm9tcHRTb3VyY2VGb2xkZXJzKClgIHJldHVybnMgYW4gZW1wdHkgbGlzdCkuXG5cdFx0Y29uc3QgaXNDb25maWd1cmVkID0gUHJvbXB0c0NvbmZpZy5nZXRMb2NhdGlvbnNWYWx1ZSh0aGlzLmNvbmZpZ1NlcnZpY2UsIHR5cGUpICE9PSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWxsRm9sZGVycyA9IGlzQ29uZmlndXJlZCA/IGNvbmZpZ3VyZWRMb2NhdGlvbnMgOiBkZWZhdWx0Rm9sZGVycztcblxuXHRcdGNvbnN0IGFic29sdXRlTG9jYXRpb25zID0gYXdhaXQgdGhpcy50b0Fic29sdXRlTG9jYXRpb25zKHR5cGUsIGFsbEZvbGRlcnMsIGRlZmF1bHRGb2xkZXJzKTtcblx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQgfHwgdHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIHx8IHR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCkge1xuXHRcdFx0YWJzb2x1dGVMb2NhdGlvbnMucHVzaCh0aGlzLnVzZXJEYXRhRm9sZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFic29sdXRlTG9jYXRpb25zO1xuXHR9XG5cblx0LyoqXG5cdCAqIERlZHVwbGljYXRlcyBzb3VyY2UgZm9sZGVycyBieSBVUkkuXG5cdCAqL1xuXHRwcml2YXRlIGRlZHVwZVNvdXJjZUZvbGRlcnMoZm9sZGVyczogcmVhZG9ubHkgSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10pOiBJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXJbXSB7XG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGNvbnN0IHJlc3VsdDogSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBmb2xkZXJzKSB7XG5cdFx0XHRpZiAoIXNlZW4uaGFzKGZvbGRlci51cmkpKSB7XG5cdFx0XHRcdHNlZW4uYWRkKGZvbGRlci51cmkpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChmb2xkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGxvY2F0aW9ucyBkZWZpbmVkIGluIGBzZXR0aW5nc2AgdG8gYWJzb2x1dGUgZmlsZXN5c3RlbSBwYXRoIFVSSXMgd2l0aCBtZXRhZGF0YS5cblx0ICogVGhpcyBjb252ZXJzaW9uIGlzIG5lZWRlZCBiZWNhdXNlIGxvY2F0aW9ucyBpbiBzZXR0aW5ncyBjYW4gYmUgcmVsYXRpdmUsXG5cdCAqIGhlbmNlIHdlIG5lZWQgdG8gcmVzb2x2ZSB0aGVtIGJhc2VkIG9uIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBmb2xkZXJzLlxuXHQgKiBJZiB1c2VySG9tZSBpcyBwcm92aWRlZCwgcGF0aHMgc3RhcnRpbmcgd2l0aCBgfmAgd2lsbCBiZSBleHBhbmRlZC4gT3RoZXJ3aXNlIHRoZXNlIHBhdGhzIGFyZSBpZ25vcmVkLlxuXHQgKiBQcmVzZXJ2ZXMgdGhlIHR5cGUgYW5kIGxvY2F0aW9uIHByb3BlcnRpZXMgZnJvbSB0aGUgc291cmNlIGZvbGRlciBkZWZpbml0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgdG9BYnNvbHV0ZUxvY2F0aW9ucyh0eXBlOiBQcm9tcHRzVHlwZSwgY29uZmlndXJlZExvY2F0aW9uczogcmVhZG9ubHkgSVByb21wdFNvdXJjZUZvbGRlcltdLCBkZWZhdWx0TG9jYXRpb25zPzogcmVhZG9ubHkgSVByb21wdFNvdXJjZUZvbGRlcltdKTogUHJvbWlzZTxJUmVzb2x2ZWRQcm9tcHRTb3VyY2VGb2xkZXJbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10gPSBbXTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMucGF0aFNlcnZpY2UudXNlckhvbWUoKTtcblx0XHRjb25zdCByb290Rm9sZGVycyA9IGF3YWl0IHRoaXMuZ2V0V29ya3NwYWNlRm9sZGVyUm9vdHModGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlKFByb21wdHNDb25maWcuVVNFX0NVU1RPTUlaQVRJT05TX0lOX1BBUkVOVF9SRVBPUykgPT09IHRydWUpO1xuXG5cdFx0Ly8gQ3JlYXRlIGEgc2V0IG9mIGRlZmF1bHQgcGF0aHMgZm9yIHF1aWNrIGxvb2t1cFxuXHRcdGNvbnN0IGRlZmF1bHRQYXRocyA9IG5ldyBTZXQoZGVmYXVsdExvY2F0aW9ucz8ubWFwKGxvYyA9PiBsb2MucGF0aCkpO1xuXG5cdFx0Ly8gRmlsdGVyIGFuZCB2YWxpZGF0ZSBza2lsbCBwYXRocyBiZWZvcmUgcmVzb2x2aW5nXG5cdFx0Y29uc3QgdmFsaWRMb2NhdGlvbnMgPSBjb25maWd1cmVkTG9jYXRpb25zLmZpbHRlcihzb3VyY2VGb2xkZXIgPT4ge1xuXHRcdFx0Ly8gVE9ETzogZGVwcmVjYXRlIGdsb2IgcGF0dGVybnMgZm9yIHByb21wdHMgYW5kIGluc3RydWN0aW9ucyBpbiB0aGUgZnV0dXJlXG5cdFx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zIHx8IHR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCkge1xuXHRcdFx0XHRjb25zdCBwYXRoID0gc291cmNlRm9sZGVyLnBhdGg7XG5cdFx0XHRcdGlmIChoYXNHbG9iUGF0dGVybihwYXRoKSkge1xuXHRcdFx0XHRcdGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbRGVwcmVjYXRlZF0gR2xvYiBwYXR0ZXJucyAoKiBhbmQgKiopIGluIHByb21wdCBmaWxlIGxvY2F0aW9ucyBhcmUgZGVwcmVjYXRlZDogXCIke3BhdGh9XCIuIENvbnNpZGVyIHVzaW5nIGV4cGxpY2l0IHBhdGhzIGluc3RlYWQuYCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBHbG9iIHBhdHRlcm5zICgqIGFuZCAqKikgZGV0ZWN0ZWQgaW4gaW5zdHJ1Y3Rpb24gZmlsZSBsb2NhdGlvbjogXCIke3BhdGh9XCIuIENvbnNpZGVyIHVzaW5nIGV4cGxpY2l0IHBhdGhzIGZvciBiZXR0ZXIgcGVyZm9ybWFuY2UuYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29uZmlndXJlZExvY2F0aW9uID0gc291cmNlRm9sZGVyLnBhdGg7XG5cdFx0XHRpZiAoIWlzVmFsaWRQcm9tcHRGb2xkZXJQYXRoKGNvbmZpZ3VyZWRMb2NhdGlvbikpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFNraXBwaW5nIGludmFsaWQgcGF0aCAoZ2xvYiBwYXR0ZXJucyBhbmQgYWJzb2x1dGUgcGF0aHMgbm90IHN1cHBvcnRlZCk6ICR7Y29uZmlndXJlZExvY2F0aW9ufWApO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3Qgc291cmNlRm9sZGVyIG9mIHZhbGlkTG9jYXRpb25zKSB7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkTG9jYXRpb24gPSBzb3VyY2VGb2xkZXIucGF0aDtcblx0XHRcdGNvbnN0IGlzRGVmYXVsdCA9IGRlZmF1bHRQYXRocz8uaGFzKGNvbmZpZ3VyZWRMb2NhdGlvbik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHQvLyBIYW5kbGUgdGlsZGUgcGF0aHMgd2hlbiB1c2VySG9tZSBpcyBwcm92aWRlZFxuXHRcdFx0XHRpZiAoaXNUaWxkZVBhdGgoY29uZmlndXJlZExvY2F0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IGpvaW5QYXRoKHVzZXJIb21lLCBjb25maWd1cmVkTG9jYXRpb24uc3Vic3RyaW5nKDIpKTtcblx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKHVyaSk7XG5cdFx0XHRcdFx0XHRjb25zdCB7IHNlYXJjaFJvb3QsIGZpbGVQYXR0ZXJuIH0gPSByZXNvbHZlU2VhcmNoTG9jYXRpb24odHlwZSwgdXJpKTtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpLCBzZWFyY2hSb290OiBzZWFyY2hSb290LCBmaWxlUGF0dGVybiwgc291cmNlOiBzb3VyY2VGb2xkZXIuc291cmNlLCBzdG9yYWdlOiBzb3VyY2VGb2xkZXIuc3RvcmFnZSwgZGlzcGxheVBhdGg6IGNvbmZpZ3VyZWRMb2NhdGlvbiwgaXNEZWZhdWx0IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc0Fic29sdXRlKGNvbmZpZ3VyZWRMb2NhdGlvbikpIHtcblx0XHRcdFx0XHRsZXQgdXJpID0gVVJJLmZpbGUoY29uZmlndXJlZExvY2F0aW9uKTtcblx0XHRcdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHk7XG5cdFx0XHRcdFx0aWYgKHJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0Ly8gaWYgdGhlIGxvY2F0aW9uIGlzIGFic29sdXRlIGFuZCB3ZSBhcmUgaW4gYSByZW1vdGUgZW52aXJvbm1lbnQsXG5cdFx0XHRcdFx0XHQvLyB3ZSBuZWVkIHRvIGNvbnZlcnQgaXQgdG8gYSBmaWxlIFVSSSB3aXRoIHRoZSByZW1vdGUgYXV0aG9yaXR5XG5cdFx0XHRcdFx0XHR1cmkgPSB1cmkud2l0aCh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVSZW1vdGUsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIXNlZW4uaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKHVyaSk7XG5cdFx0XHRcdFx0XHRjb25zdCB7IHNlYXJjaFJvb3QsIGZpbGVQYXR0ZXJuIH0gPSByZXNvbHZlU2VhcmNoTG9jYXRpb24odHlwZSwgdXJpKTtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpLCBzZWFyY2hSb290OiBzZWFyY2hSb290LCBmaWxlUGF0dGVybiwgc291cmNlOiBzb3VyY2VGb2xkZXIuc291cmNlLCBzdG9yYWdlOiBzb3VyY2VGb2xkZXIuc3RvcmFnZSwgZGlzcGxheVBhdGg6IGNvbmZpZ3VyZWRMb2NhdGlvbiwgaXNEZWZhdWx0IH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiByb290Rm9sZGVycykge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWJzb2x1dGVQYXRoID0gam9pblBhdGgoZm9sZGVyLCBjb25maWd1cmVkTG9jYXRpb24pO1xuXHRcdFx0XHRcdFx0aWYgKCFzZWVuLmhhcyhhYnNvbHV0ZVBhdGgpKSB7XG5cdFx0XHRcdFx0XHRcdHNlZW4uYWRkKGFic29sdXRlUGF0aCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHsgc2VhcmNoUm9vdCwgZmlsZVBhdHRlcm4gfSA9IHJlc29sdmVTZWFyY2hMb2NhdGlvbih0eXBlLCBhYnNvbHV0ZVBhdGgpO1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogYWJzb2x1dGVQYXRoLCBzZWFyY2hSb290OiBzZWFyY2hSb290LCBmaWxlUGF0dGVybiwgc291cmNlOiBzb3VyY2VGb2xkZXIuc291cmNlLCBzdG9yYWdlOiBzb3VyY2VGb2xkZXIuc3RvcmFnZSwgZGlzcGxheVBhdGg6IGNvbmZpZ3VyZWRMb2NhdGlvbiwgaXNEZWZhdWx0IH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gcmVzb2x2ZSBwcm9tcHQgZmlsZSBsb2NhdGlvbjogJHtjb25maWd1cmVkTG9jYXRpb259YCwgZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogVXNlcyB0aGUgZmlsZSBzZXJ2aWNlIHRvIHJlc29sdmUgdGhlIHByb3ZpZGVkIGxvY2F0aW9uIGFuZCByZXR1cm4gZWl0aGVyIHRoZSBmaWxlIGF0IHRoZSBsb2NhdGlvbiBvZiBmaWxlcyBpbiB0aGUgZGlyZWN0b3J5LlxuXHQgKiBGb3IgaW5zdHJ1Y3Rpb24gZm9sZGVycywgdGhpcyBzZWFyY2hlcyByZWN1cnNpdmVseSAodXAgdG8ge0BsaW5rIE1BWF9JTlNUUlVDVElPTlNfUkVDVVJTSU9OX0RFUFRIfSBsZXZlbHMgZGVlcCkgcHJvdmlkZWRcblx0ICogdGhlIGxvY2F0aW9uIGlzIG5vdCBhIHdvcmtzcGFjZSBmb2xkZXIgcm9vdCBhbmQgZG9lcyBub3QgY29udGFpbiB3aWxkY2FyZHMsIHRvIHN1cHBvcnQgc3ViZGlyZWN0b3JpZXMgd2hpbGUgYXZvaWRpbmdcblx0ICogYWNjaWRlbnRhbGx5IGJyb2FkIHRyYXZlcnNhbC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZUZpbGVzQXRMb2NhdGlvbihsb2NhdGlvbjogVVJJLCB0eXBlOiBQcm9tcHRzVHlwZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBkZXB0aDogbnVtYmVyID0gMCk6IFByb21pc2U8VVJJW10+IHtcblx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdHJldHVybiB0aGlzLmZpbmRBZ2VudFNraWxsc0luRm9sZGVyKGxvY2F0aW9uLCB0b2tlbik7XG5cdFx0fVxuXHRcdC8vIFJlY3Vyc2UgaW50byBzdWJkaXJlY3RvcmllcyBmb3IgaW5zdHJ1Y3Rpb24gZm9sZGVycywgYnV0IG9ubHkgaWY6XG5cdFx0Ly8gLSB0aGUgbG9jYXRpb24gaXMgbm90IGEgd29ya3NwYWNlIGZvbGRlciByb290ICh0byBhdm9pZCBmdWxsIHdvcmtzcGFjZSB0cmF2ZXJzYWwpXG5cdFx0Ly8gLSB0aGUgcGF0aCBkb2VzIG5vdCBjb250YWluIHdpbGRjYXJkcyAoYWxyZWFkeSBmaWx0ZXJlZCB1cHN0cmVhbSwgYnV0IGd1YXJkIGhlcmUgdG9vKVxuXHRcdC8vIC0gdGhlIHJlY3Vyc2lvbiBkZXB0aCBoYXNuJ3QgZXhjZWVkZWQgdGhlIGxpbWl0XG5cdFx0Y29uc3QgaXNXb3Jrc3BhY2VSb290ID0gZGVwdGggPT09IDAgJiYgdGhpcy5nZXRXb3Jrc3BhY2VGb2xkZXJzKCkuc29tZShmID0+IGlzRXF1YWwoZi51cmksIGxvY2F0aW9uKSk7XG5cdFx0Y29uc3QgcmVjdXJzaXZlID0gdHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXG5cdFx0XHQmJiAhaXNXb3Jrc3BhY2VSb290XG5cdFx0XHQmJiAhaGFzR2xvYlBhdHRlcm4obG9jYXRpb24ucGF0aClcblx0XHRcdCYmIGRlcHRoIDwgTUFYX0lOU1RSVUNUSU9OU19SRUNVUlNJT05fREVQVEg7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGluZm8gPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUobG9jYXRpb24pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGlmIChpbmZvLmlzRmlsZSkge1xuXHRcdFx0XHRyZXR1cm4gW2luZm8ucmVzb3VyY2VdO1xuXHRcdFx0fSBlbHNlIGlmIChpbmZvLmlzRGlyZWN0b3J5ICYmIGluZm8uY2hpbGRyZW4pIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0OiBVUklbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGluZm8uY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRpZiAoY2hpbGQuaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChjaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChyZWN1cnNpdmUgJiYgY2hpbGQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRcdC8vIFJlY3Vyc2l2ZWx5IHNlYXJjaCBzdWJkaXJlY3RvcmllcyBmb3IgaW5zdHJ1Y3Rpb25zXG5cdFx0XHRcdFx0XHRjb25zdCBzdWJGaWxlcyA9IGF3YWl0IHRoaXMucmVzb2x2ZUZpbGVzQXRMb2NhdGlvbihjaGlsZC5yZXNvdXJjZSwgdHlwZSwgdG9rZW4sIGRlcHRoICsgMSk7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCguLi5zdWJGaWxlcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBGaWxlT3BlcmF0aW9uRXJyb3IgJiYgZS5maWxlT3BlcmF0aW9uUmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gcmVzb2x2ZSBmaWxlcyBhdCBsb2NhdGlvbjogJHtsb2NhdGlvbi50b1N0cmluZygpfWAsIGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHQvKipcblx0ICogVXNlcyB0aGUgc2VhcmNoIHNlcnZpY2UgdG8gZmluZCBhbGwgZmlsZXMgYXQgdGhlIHByb3ZpZGVkIGxvY2F0aW9uLlxuXHQgKiBSZXF1aXJlcyBhIEZpbGVTZWFyY2hQcm92aWRlciB0byBiZSBhdmFpbGFibGUgZm9yIHRoZSBmb2xkZXIncyBzY2hlbWUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHNlYXJjaEZpbGVzSW5Mb2NhdGlvbihmb2xkZXI6IFVSSSwgZmlsZVBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdC8vIENoZWNrIGlmIGEgRmlsZVNlYXJjaFByb3ZpZGVyIGlzIGF2YWlsYWJsZSBmb3IgdGhpcyBzY2hlbWVcblx0XHRpZiAoIXRoaXMuc2VhcmNoU2VydmljZS5zY2hlbWVIYXNGaWxlU2VhcmNoUHJvdmlkZXIoZm9sZGVyLnNjaGVtZSkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbUHJvbXB0RmlsZXNMb2NhdG9yXSBObyBGaWxlU2VhcmNoUHJvdmlkZXIgYXZhaWxhYmxlIGZvciBzY2hlbWUgJyR7Zm9sZGVyLnNjaGVtZX0nLiBDYW5ub3Qgc2VhcmNoIGZvciBwYXR0ZXJuICcke2ZpbGVQYXR0ZXJufScgaW4gJHtmb2xkZXIudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNyZWdhcmRJZ25vcmVGaWxlcyA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZXhwbG9yZXIuZXhjbHVkZUdpdElnbm9yZScpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IHRoaXMuZ2V0V29ya3NwYWNlRm9sZGVyKGZvbGRlcik7XG5cblx0XHRjb25zdCBnZXRFeGNsdWRlUGF0dGVybiA9IChmb2xkZXI6IFVSSSkgPT4gZ2V0RXhjbHVkZXModGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPih7IHJlc291cmNlOiBmb2xkZXIgfSkpIHx8IHt9O1xuXHRcdGNvbnN0IHNlYXJjaE9wdGlvbnM6IElGaWxlUXVlcnkgPSB7XG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBbeyBmb2xkZXIsIGRpc3JlZ2FyZElnbm9yZUZpbGVzIH1dLFxuXHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRzaG91bGRHbG9iTWF0Y2hGaWxlUGF0dGVybjogdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB3b3Jrc3BhY2VSb290ID8gZ2V0RXhjbHVkZVBhdHRlcm4od29ya3NwYWNlUm9vdC51cmkpIDogdW5kZWZpbmVkLFxuXHRcdFx0aWdub3JlR2xvYkNhc2U6IHRydWUsXG5cdFx0XHRzb3J0QnlTY29yZTogdHJ1ZSxcblx0XHRcdGZpbGVQYXR0ZXJuXG5cdFx0fTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzZWFyY2hSZXN1bHQgPSBhd2FpdCB0aGlzLnNlYXJjaFNlcnZpY2UuZmlsZVNlYXJjaChzZWFyY2hPcHRpb25zLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlYXJjaFJlc3VsdC5yZXN1bHRzLm1hcChyID0+IHIucmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlKSkge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBsaXN0IG9mIGBBR0VOVFMubWRgIGZpbGVzIGFueXdoZXJlIGluIHRoZSB3b3Jrc3BhY2UuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZmluZEFnZW50TURzSW5Xb3Jrc3BhY2UodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UuYWxsKHRoaXMuZ2V0V29ya3NwYWNlRm9sZGVycygpLm1hcChmb2xkZXIgPT4gdGhpcy5maW5kQWdlbnRNRHNJbkZvbGRlcihmb2xkZXIudXJpLCB0b2tlbikpKTtcblx0XHRyZXR1cm4gcmVzdWx0LmZsYXQoMSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZpbmRBZ2VudE1Ec0luRm9sZGVyKGZvbGRlcjogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElBZ2VudEluc3RydWN0aW9uRmlsZVtdPiB7XG5cdFx0Ly8gQ2hlY2sgaWYgYSBGaWxlU2VhcmNoUHJvdmlkZXIgaXMgYXZhaWxhYmxlIGZvciB0aGlzIHNjaGVtZVxuXHRcdGlmICh0aGlzLnNlYXJjaFNlcnZpY2Uuc2NoZW1lSGFzRmlsZVNlYXJjaFByb3ZpZGVyKGZvbGRlci5zY2hlbWUpKSB7XG5cdFx0XHQvLyBVc2UgdGhlIHNlYXJjaCBzZXJ2aWNlIGlmIGEgRmlsZVNlYXJjaFByb3ZpZGVyIGlzIGF2YWlsYWJsZVxuXHRcdFx0Y29uc3QgZGlzcmVnYXJkSWdub3JlRmlsZXMgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2V4cGxvcmVyLmV4Y2x1ZGVHaXRJZ25vcmUnKTtcblx0XHRcdGNvbnN0IGdldEV4Y2x1ZGVQYXR0ZXJuID0gKGZvbGRlcjogVVJJKSA9PiBnZXRFeGNsdWRlcyh0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IGZvbGRlciB9KSkgfHwge307XG5cdFx0XHRjb25zdCBzZWFyY2hPcHRpb25zOiBJRmlsZVF1ZXJ5ID0ge1xuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbeyBmb2xkZXIsIGRpc3JlZ2FyZElnbm9yZUZpbGVzIH1dLFxuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdFx0c2hvdWxkR2xvYk1hdGNoRmlsZVBhdHRlcm46IHRydWUsXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBnZXRFeGNsdWRlUGF0dGVybihmb2xkZXIpLFxuXHRcdFx0XHRmaWxlUGF0dGVybjogJyoqL0FHRU5UUy5tZCcsXG5cdFx0XHRcdGlnbm9yZUdsb2JDYXNlOiB0cnVlLFxuXHRcdFx0fTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc2VhcmNoUmVzdWx0ID0gYXdhaXQgdGhpcy5zZWFyY2hTZXJ2aWNlLmZpbGVTZWFyY2goc2VhcmNoT3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gUmVzb2x2ZSByZWFsIHBhdGhzIGZvciBkdXBsaWNhdGUgZGV0ZWN0aW9uXG5cdFx0XHRcdGNvbnN0IHJlc3VsdHM6IElBZ2VudEluc3RydWN0aW9uRmlsZVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgciBvZiBzZWFyY2hSZXN1bHQucmVzdWx0cykge1xuXHRcdFx0XHRcdGNvbnN0IHJlYWxQYXRoID0gdW5kZWZpbmVkOyAvLyBXZSBjYW4gc2tpcCByZWFscGF0aCByZXNvbHV0aW9uIGhlcmUgZm9yIHBlcmZvcm1hbmNlOyBkdXBsaWNhdGVzIGNhbiBiZSBoYW5kbGVkIGxhdGVyIGlmIG5lZWRlZFxuXHRcdFx0XHRcdHJlc3VsdHMucHVzaCh7IHVyaTogci5yZXNvdXJjZSwgcmVhbFBhdGgsIHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5hZ2VudHNNZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0cztcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBGYWxsYmFjayB0byByZWN1cnNpdmUgdHJhdmVyc2FsIHVzaW5nIGZpbGUgc2VydmljZVxuXHRcdFx0cmV0dXJuIHRoaXMuZmluZEFnZW50TURzVXNpbmdGaWxlU2VydmljZShmb2xkZXIsIHRva2VuKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVjdXJzaXZlbHkgdHJhdmVyc2VzIGEgZm9sZGVyIHVzaW5nIHRoZSBmaWxlIHNlcnZpY2UgdG8gZmluZCBBR0VOVFMubWQgZmlsZXMuXG5cdCAqIFRoaXMgaXMgdXNlZCBhcyBhIGZhbGxiYWNrIHdoZW4gbm8gRmlsZVNlYXJjaFByb3ZpZGVyIGlzIGF2YWlsYWJsZSBmb3IgdGhlIHNjaGVtZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgZmluZEFnZW50TURzVXNpbmdGaWxlU2VydmljZShmb2xkZXI6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQWdlbnRJbnN0cnVjdGlvbkZpbGVbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10gPSBbXTtcblx0XHRjb25zdCBhZ2VudHNNZEZpbGVOYW1lID0gJ2FnZW50cy5tZCc7XG5cblx0XHRjb25zdCB0cmF2ZXJzZSA9IGFzeW5jICh1cmk6IFVSSSk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZSh1cmkpO1xuXHRcdFx0XHRpZiAoc3RhdC5pc0ZpbGUgJiYgc3RhdC5uYW1lLnRvTG93ZXJDYXNlKCkgPT09IGFnZW50c01kRmlsZU5hbWUpIHtcblx0XHRcdFx0XHRjb25zdCByZWFsUGF0aCA9IHN0YXQuaXNTeW1ib2xpY0xpbmsgPyBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWxwYXRoKHN0YXQucmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpOiBzdGF0LnJlc291cmNlLCByZWFsUGF0aCwgdHlwZTogQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLmFnZW50c01kIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHN0YXQuaXNEaXJlY3RvcnkgJiYgc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdC8vIFJlY3Vyc2l2ZWx5IHRyYXZlcnNlIHN1YmRpcmVjdG9yaWVzXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0cmF2ZXJzZShjaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBJZ25vcmUgZXJyb3JzIGZvciBpbmRpdmlkdWFsIGZpbGVzL2ZvbGRlcnMgKGUuZy4sIHBlcm1pc3Npb24gZGVuaWVkKVxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtQcm9tcHRGaWxlc0xvY2F0b3JdIEVycm9yIHRyYXZlcnNpbmcgJHt1cmkudG9TdHJpbmcoKX06ICR7ZXJyb3J9YCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGF3YWl0IHRyYXZlcnNlKGZvbGRlcik7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cblxuXHRwdWJsaWMgYXN5bmMgZmluZEZpbGVzSW5Sb290cyhyb290czogVVJJW10sIGZvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkLCBwYXRoczogSVdvcmtzcGFjZUluc3RydWN0aW9uRmlsZVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHJlc3VsdDogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10gPSBbXSk6IFByb21pc2U8SUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10+IHtcblx0XHRjb25zdCB0b1Jlc29sdmUgPSByb290cy5tYXAocm9vdCA9PiAoeyByZXNvdXJjZTogZm9sZGVyICE9PSB1bmRlZmluZWQgPyBqb2luUGF0aChyb290LCBmb2xkZXIpIDogcm9vdCB9KSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRSb290cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZUFsbCh0b1Jlc29sdmUpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByb290IG9mIHJlc29sdmVkUm9vdHMpIHtcblx0XHRcdGlmIChyb290LnN1Y2Nlc3MgJiYgcm9vdC5zdGF0Py5jaGlsZHJlbikge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHJvb3Quc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGlmIChjaGlsZC5pc0ZpbGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoaW5nUGF0aCA9IHBhdGhzLmZpbmQocCA9PiBlcXVhbHNJZ25vcmVDYXNlKHAuZmlsZU5hbWUsIGNoaWxkLm5hbWUpKTtcblx0XHRcdFx0XHRcdGlmIChtYXRjaGluZ1BhdGgpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVhbFBhdGggPSBjaGlsZC5pc1N5bWJvbGljTGluayA/IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhbHBhdGgoY2hpbGQucmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogY2hpbGQucmVzb3VyY2UsIHJlYWxQYXRoLCB0eXBlOiBtYXRjaGluZ1BhdGgudHlwZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRBZ2VudEZpbGVVUklGcm9tTW9kZUZpbGUob2xkVVJJOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGlmIChvbGRVUkkucGF0aC5lbmRzV2l0aChMRUdBQ1lfTU9ERV9GSUxFX0VYVEVOU0lPTikpIHtcblx0XHRcdGxldCBuZXdMb2NhdGlvbjtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuZ2V0V29ya3NwYWNlRm9sZGVyKG9sZFVSSSk7XG5cdFx0XHRpZiAod29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRcdG5ld0xvY2F0aW9uID0gam9pblBhdGgod29ya3NwYWNlRm9sZGVyLnVyaSwgQUdFTlRTX1NPVVJDRV9GT0xERVIsIGdldENsZWFuUHJvbXB0TmFtZShvbGRVUkkpICsgQUdFTlRfRklMRV9FWFRFTlNJT04pO1xuXHRcdFx0fSBlbHNlIGlmIChpc0VxdWFsT3JQYXJlbnQob2xkVVJJLCB0aGlzLnVzZXJEYXRhU2VydmljZS5jdXJyZW50UHJvZmlsZS5wcm9tcHRzSG9tZSkpIHtcblx0XHRcdFx0bmV3TG9jYXRpb24gPSBqb2luUGF0aCh0aGlzLnVzZXJEYXRhU2VydmljZS5jdXJyZW50UHJvZmlsZS5wcm9tcHRzSG9tZSwgZ2V0Q2xlYW5Qcm9tcHROYW1lKG9sZFVSSSkgKyBBR0VOVF9GSUxFX0VYVEVOU0lPTik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3TG9jYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZpbmRBZ2VudFNraWxsc0luRm9sZGVyKHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogVVJJW10gPSBbXTtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUodXJpKTtcblx0XHRcdGlmIChzdGF0LmlzRGlyZWN0b3J5ICYmIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0Ly8gUmVjdXJzaXZlbHkgdHJhdmVyc2Ugc3ViZGlyZWN0b3JpZXNcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2tpbGxGaWxlID0gam9pblBhdGgoY2hpbGQucmVzb3VyY2UsIFNLSUxMX0ZJTEVOQU1FKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2tpbGxTdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHNraWxsRmlsZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChza2lsbFN0YXQuaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goc2tpbGxTdGF0LnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHQvLyBJZ25vcmUgZXJyb3JzIGZvciBpbmRpdmlkdWFsIGZpbGVzL2ZvbGRlcnMgKGUuZy4sIHBlcm1pc3Npb24gZGVuaWVkKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbUHJvbXB0RmlsZXNMb2NhdG9yXSBFcnJvciBzZWFyY2hpbmcgZm9yIHNraWxscyBpbiAke3VyaS50b1N0cmluZygpfTogJHtlfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTZWFyY2hlcyBmb3Igc2tpbGxzIGluIGFsbCBjb25maWd1cmVkIGxvY2F0aW9ucy5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBmaW5kQWdlbnRTa2lsbHModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJvbXB0UGF0aFtdPiB7XG5cdFx0Y29uc3QgY29uZmlndXJlZExvY2F0aW9ucyA9IHRoaXMuZ2V0UHJvbXB0U291cmNlRm9sZGVycyhQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0Y29uc3QgYWJzb2x1dGVMb2NhdGlvbnMgPSBhd2FpdCB0aGlzLnRvQWJzb2x1dGVMb2NhdGlvbnMoUHJvbXB0c1R5cGUuc2tpbGwsIGNvbmZpZ3VyZWRMb2NhdGlvbnMpO1xuXHRcdGNvbnN0IGFsbFJlc3VsdHM6IElQcm9tcHRQYXRoW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgeyB1cmksIHNvdXJjZSwgc3RvcmFnZSB9IG9mIGFic29sdXRlTG9jYXRpb25zKSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZmluZEFnZW50U2tpbGxzSW5Gb2xkZXIodXJpLCB0b2tlbik7XG5cdFx0XHRmb3IgKGNvbnN0IHNraWxsVXJpIG9mIHJlc3VsdHMpIHtcblx0XHRcdFx0YWxsUmVzdWx0cy5wdXNoKHsgdXJpOiBza2lsbFVyaSwgc291cmNlLCBzdG9yYWdlLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYWxsUmVzdWx0cztcblx0fVxufVxuXG5cbi8qKlxuICogQ2hlY2tzIGlmIHRoZSBwcm92aWRlZCBwYXRoIGNvbnRhaW5zIGEgZ2xvYiBwYXR0ZXJuICgqIG9yICoqKS5cbiAqIFVzZWQgdG8gZGV0ZWN0IGRlcHJlY2F0ZWQgZ2xvYiB1c2FnZSBpbiBwcm9tcHQgZmlsZSBsb2NhdGlvbnMuXG4gKlxuICogQHBhcmFtIHBhdGggLSBwYXRoIHRvIGNoZWNrXG4gKiBAcmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHBhdGggY29udGFpbnMgYCpgIG9yIGAqKmAsIGBmYWxzZWAgb3RoZXJ3aXNlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNHbG9iUGF0dGVybihwYXRoOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIHBhdGguaW5jbHVkZXMoJyonKTtcbn1cblxuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgcHJvdmlkZWQgYHBhdHRlcm5gIGNvdWxkIGJlIGEgdmFsaWQgZ2xvYiBwYXR0ZXJuLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNWYWxpZEdsb2IocGF0dGVybjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGxldCBzcXVhcmVCcmFja2V0cyA9IGZhbHNlO1xuXHRsZXQgc3F1YXJlQnJhY2tldHNDb3VudCA9IDA7XG5cblx0bGV0IGN1cmx5QnJhY2tldHMgPSBmYWxzZTtcblx0bGV0IGN1cmx5QnJhY2tldHNDb3VudCA9IDA7XG5cblx0bGV0IHByZXZpb3VzQ2hhcmFjdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3QgY2hhciBvZiBwYXR0ZXJuKSB7XG5cdFx0Ly8gc2tpcCBhbGwgZXNjYXBlZCBjaGFyYWN0ZXJzXG5cdFx0aWYgKHByZXZpb3VzQ2hhcmFjdGVyID09PSAnXFxcXCcpIHtcblx0XHRcdHByZXZpb3VzQ2hhcmFjdGVyID0gY2hhcjtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChjaGFyID09PSAnKicpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChjaGFyID09PSAnPycpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChjaGFyID09PSAnWycpIHtcblx0XHRcdHNxdWFyZUJyYWNrZXRzID0gdHJ1ZTtcblx0XHRcdHNxdWFyZUJyYWNrZXRzQ291bnQrKztcblxuXHRcdFx0cHJldmlvdXNDaGFyYWN0ZXIgPSBjaGFyO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXIgPT09ICddJykge1xuXHRcdFx0c3F1YXJlQnJhY2tldHMgPSB0cnVlO1xuXHRcdFx0c3F1YXJlQnJhY2tldHNDb3VudC0tO1xuXHRcdFx0cHJldmlvdXNDaGFyYWN0ZXIgPSBjaGFyO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNoYXIgPT09ICd7Jykge1xuXHRcdFx0Y3VybHlCcmFja2V0cyA9IHRydWU7XG5cdFx0XHRjdXJseUJyYWNrZXRzQ291bnQrKztcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChjaGFyID09PSAnfScpIHtcblx0XHRcdGN1cmx5QnJhY2tldHMgPSB0cnVlO1xuXHRcdFx0Y3VybHlCcmFja2V0c0NvdW50LS07XG5cdFx0XHRwcmV2aW91c0NoYXJhY3RlciA9IGNoYXI7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRwcmV2aW91c0NoYXJhY3RlciA9IGNoYXI7XG5cdH1cblxuXHQvLyBpZiBzcXVhcmUgYnJhY2tldHMgZXhpc3QgYW5kIGFyZSBpbiBwYWlycywgdGhpcyBpcyBhIGB2YWxpZCBnbG9iYFxuXHRpZiAoc3F1YXJlQnJhY2tldHMgJiYgKHNxdWFyZUJyYWNrZXRzQ291bnQgPT09IDApKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvLyBpZiBjdXJseSBicmFja2V0cyBleGlzdCBhbmQgYXJlIGluIHBhaXJzLCB0aGlzIGlzIGEgYHZhbGlkIGdsb2JgXG5cdGlmIChjdXJseUJyYWNrZXRzICYmIChjdXJseUJyYWNrZXRzQ291bnQgPT09IDApKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmludGVyZmFjZSBJU2VhcmNoTG9jYXRpb25SZXN1bHQge1xuXHRyZWFkb25seSBzZWFyY2hSb290OiBVUkk7XG5cdHJlYWRvbmx5IGZpbGVQYXR0ZXJuPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBzZWFyY2ggcm9vdCBhbmQgb3B0aW9uYWwgZmlsZSBwYXR0ZXJuIGZvciB0aGUgcHJvdmlkZWQgbG9jYXRpb24uXG4gKiBGb3IgcGF0aHMgd2l0aCBnbG9iIHBhdHRlcm5zLCBmaW5kcyB0aGUgZGVlcGVzdCBub24tZ2xvYiBhbmNlc3RvciBkaXJlY3RvcnkuXG4gKlxuICogQXNzdW1lcyB0aGF0IHRoZSBsb2NhdGlvbiB0aGF0IGlzIHByb3ZpZGVkIGhhcyBhIHZhbGlkIHBhdGggKGlzIGFic3RyYWN0KVxuICpcbiAqICMjIEV4YW1wbGVzXG4gKlxuICogYGBgdHlwZXNjcmlwdFxuICogYXNzZXJ0LnN0cmljdERlZXBFcXVhbChcbiAqICAgICByZXNvbHZlU2VhcmNoTG9jYXRpb24oUHJvbXB0c1R5cGUucHJvbXB0LCBVUkkuZmlsZSgnL2hvbWUvdXNlci97Zm9sZGVyMSxmb2xkZXIyfS9maWxlLm1kJykpLFxuICogICAgIHsgc2VhcmNoUm9vdDogVVJJLmZpbGUoJy9ob21lL3VzZXInKSwgZmlsZVBhdHRlcm46ICd7Zm9sZGVyMSxmb2xkZXIyfS9maWxlLm1kJyB9LFxuICogICAgICdNdXN0IGZpbmQgY29ycmVjdCBub24tZ2xvYiBzZWFyY2ggcm9vdC4nLFxuICogKTtcbiAqIGBgYFxuICovXG5mdW5jdGlvbiByZXNvbHZlU2VhcmNoTG9jYXRpb24odHlwZTogUHJvbXB0c1R5cGUsIGxvY2F0aW9uOiBVUkkpOiBJU2VhcmNoTG9jYXRpb25SZXN1bHQge1xuXHRpZiAodHlwZSAhPT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zICYmIHR5cGUgIT09IFByb21wdHNUeXBlLnByb21wdCkge1xuXHRcdC8vIG9ubHkgaW5zdHJ1Y3Rpb25zIGFuZCBwcm9tcHRzIHN1cHBvcnQgZ2xvYiBwYXR0ZXJucywgc28gd2UgY2FuIHJldHVybiB0aGUgbG9jYXRpb24gYXMgaXNcblx0XHRyZXR1cm4geyBzZWFyY2hSb290OiBsb2NhdGlvbiB9O1xuXHR9XG5cblx0Y29uc3Qgc2VnbWVudHMgPSBsb2NhdGlvbi5wYXRoLnNwbGl0KCcvJyk7XG5cdGxldCBpID0gMDtcblx0d2hpbGUgKGkgPCBzZWdtZW50cy5sZW5ndGggJiYgaXNWYWxpZEdsb2Ioc2VnbWVudHNbaV0pID09PSBmYWxzZSkge1xuXHRcdGkrKztcblx0fVxuXHRpZiAoaSA9PT0gc2VnbWVudHMubGVuZ3RoKSB7XG5cdFx0Ly8gdGhlIHBhdGggZG9lcyBub3QgY29udGFpbiBhIGdsb2IgcGF0dGVybiwgc28gd2UgY2FuXG5cdFx0Ly8ganVzdCBmaW5kIGFsbCBwcm9tcHQgZmlsZXMgaW4gdGhlIHByb3ZpZGVkIGxvY2F0aW9uXG5cdFx0cmV0dXJuIHsgc2VhcmNoUm9vdDogbG9jYXRpb24gfTtcblx0fVxuXHRjb25zdCBwYXJlbnQgPSBsb2NhdGlvbi53aXRoKHsgcGF0aDogc2VnbWVudHMuc2xpY2UoMCwgaSkuam9pbignLycpIH0pO1xuXHRpZiAoaSA9PT0gc2VnbWVudHMubGVuZ3RoIC0gMSAmJiBzZWdtZW50c1tpXSA9PT0gJyonIHx8IHNlZ21lbnRzW2ldID09PSBgYCkge1xuXHRcdHJldHVybiB7IHNlYXJjaFJvb3Q6IHBhcmVudCB9O1xuXHR9XG5cblx0Ly8gdGhlIHBhdGggY29udGFpbnMgYSBnbG9iIHBhdHRlcm4sIHNvIHdlIHNlYXJjaCBpbiBsYXN0IGZvbGRlciB0aGF0IGRvZXMgbm90IGNvbnRhaW4gYSBnbG9iIHBhdHRlcm5cblx0cmV0dXJuIHtcblx0XHRzZWFyY2hSb290OiBwYXJlbnQsXG5cdFx0ZmlsZVBhdHRlcm46IHNlZ21lbnRzLnNsaWNlKGkpLmpvaW4oJy8nKVxuXHR9O1xufVxuXG5cbi8qKlxuICogUmVnZXggcGF0dGVybiBzdHJpbmcgZm9yIHZhbGlkYXRpbmcgcGF0aHMgZm9yIGFsbCBwcm9tcHQgZmlsZXMuXG4gKiBQYXRocyBvbmx5IHN1cHBvcnQ6XG4gKiAtIFJlbGF0aXZlIHBhdGhzOiBzb21lRm9sZGVyLCAuL3NvbWVGb2xkZXJcbiAqIC0gVXNlciBob21lIHBhdGhzOiB+L2ZvbGRlciAob25seSBmb3J3YXJkIHNsYXNoLCBub3QgYmFja3NsYXNoIGZvciBjcm9zcy1wbGF0Zm9ybSBzaGFyaW5nKVxuICogLSBQYXJlbnQgcmVsYXRpdmUgcGF0aHMgZm9yIG1vbm9yZXBvczogLi4vZm9sZGVyXG4gKlxuICogTk9UIHN1cHBvcnRlZDpcbiAqIC0gQWJzb2x1dGUgcGF0aHMgKHBvcnRhYmlsaXR5IGlzc3VlKVxuICogLSBHbG9iIHBhdHRlcm5zIHdpdGggKiBvciAqKiAocGVyZm9ybWFuY2UgaXNzdWUpXG4gKiAtIEJhY2tzbGFzaGVzIChwYXRocyBzaG91bGQgYmUgc2hhcmVhYmxlIGluIHJlcG9zIGFjcm9zcyBwbGF0Zm9ybXMpXG4gKiAtIFRpbGRlIHdpdGhvdXQgZm9yd2FyZCBzbGFzaCAoZS5nLiwgfmFiYywgflxcZm9sZGVyKVxuICogLSBFbXB0eSBvciB3aGl0ZXNwYWNlLW9ubHkgcGF0aHNcbiAqXG4gKiBUaGUgcmVnZXggdmFsaWRhdGVzOlxuICogLSBOb3QgYSBXaW5kb3dzIGFic29sdXRlIHBhdGggKGUuZy4sIEM6XFwsIEM6LylcbiAqIC0gTm90IHN0YXJ0aW5nIHdpdGggLyAoVW5peCBhYnNvbHV0ZSBwYXRoKVxuICogLSBObyBiYWNrc2xhc2hlcyBhbnl3aGVyZSAodXNlIGZvcndhcmQgc2xhc2hlcyBvbmx5KVxuICogLSBJZiBzdGFydHMgd2l0aCB+LCBtdXN0IGJlIGZvbGxvd2VkIGJ5IC9cbiAqIC0gTm8gZ2xvYiBwYXR0ZXJuIGNoYXJhY3RlcnM6ICogPyBbIF0geyB9XG4gKiAtIEF0IGxlYXN0IG9uZSBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXJcbiAqL1xuZXhwb3J0IGNvbnN0IFZBTElEX1BST01QVF9GT0xERVJfUEFUVEVSTiA9ICdeKD8hW0EtWmEtel06W1xcXFxcXFxcL10pKD8hLykoPyF+KD8hLykpKD8hLipcXFxcXFxcXCkoPyEuKlsqP1xcXFxbXFxcXF17fV0pLipcXFxcUy4qJCc7XG5jb25zdCBWQUxJRF9QUk9NUFRfRk9MREVSX1JFR0VYID0gbmV3IFJlZ0V4cChWQUxJRF9QUk9NUFRfRk9MREVSX1BBVFRFUk4pO1xuXG4vKipcbiAqIFZhbGlkYXRlcyBpZiBhIHBhdGggaXMgYWxsb3dlZCBmb3Igc2ltcGxpZmllZCBwYXRoIGNvbmZpZ3VyYXRpb25zLlxuICogT25seSBmb3J3YXJkIHNsYXNoZXMgYXJlIHN1cHBvcnRlZCB0byBlbnN1cmUgcGF0aHMgYXJlIHNoYXJlYWJsZSBhY3Jvc3MgcGxhdGZvcm1zLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNWYWxpZFByb21wdEZvbGRlclBhdGgocGF0aDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBWQUxJRF9QUk9NUFRfRk9MREVSX1JFR0VYLnRlc3QocGF0aCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlLG9CQUFvQixxQkFBcUIsb0JBQW9CO0FBQ3JGLFNBQVMsaUNBQWlDLGFBQWEscUJBQXFCO0FBQzVFLFNBQVMsVUFBVSxTQUFTLFNBQVMsaUJBQWlCLGdCQUFnQjtBQUN0RSxTQUFTLGdDQUFrRDtBQUMzRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQixzQkFBc0IsdUJBQXVCLHNCQUFzQix3QkFBd0IsbUJBQW1CLDRCQUE0QixvQkFBb0Isc0JBQXNCLCtCQUErQixzQkFBd0U7QUFDMVQsU0FBUyxrQkFBa0IsbUJBQW1CO0FBQzlDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQStDLGdCQUFnQixpQkFBaUI7QUFDekYsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQXNFLHNCQUFzQjtBQUNyRyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3Q0FBd0M7QUFDakQsU0FBUyx5QkFBeUI7QUFLbEMsTUFBTSxtQ0FBbUM7QUFVbEMsSUFBTSxxQkFBTixNQUF5QjtBQUFBLEVBSS9CLFlBQ2dDLGFBQ1MsZUFDRyxrQkFDSSxvQkFDZCxlQUNTLGlCQUNaLFlBQ0MsYUFDb0IsaUNBQ2xEO0FBVDhCO0FBQ1M7QUFDRztBQUNJO0FBQ2Q7QUFDUztBQUNaO0FBQ0M7QUFDb0I7QUFHbkQsVUFBTSxzQkFBc0IsS0FBSyxnQkFBZ0IsZUFBZTtBQUNoRSxTQUFLLGlCQUFpQjtBQUFBLE1BQ3JCLEtBQUs7QUFBQSxNQUNMLFlBQVk7QUFBQSxNQUNaLGFBQWE7QUFBQSxNQUNiLFFBQVEsaUJBQWlCO0FBQUEsTUFDekIsU0FBUyxlQUFlO0FBQUEsTUFDeEIsYUFBYSxJQUFJLFNBQVMseUJBQXlCLFdBQVc7QUFBQSxNQUM5RCxXQUFXO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFBQSxFQUVVLHNCQUFtRDtBQU01RCxXQUFPLEtBQUssaUJBQWlCLGFBQWEsRUFBRSxRQUFRLE9BQU8sT0FBSyxFQUFFLElBQUksV0FBVyxpQkFBaUI7QUFBQSxFQUNuRztBQUFBLEVBRVUsbUJBQW1CLFVBQTZDO0FBQ3pFLFdBQU8sS0FBSyxpQkFBaUIsbUJBQW1CLFFBQVEsS0FBSztBQUFBLEVBQzlEO0FBQUEsRUFFVSw4QkFBMkM7QUFDcEQsV0FBTyxNQUFNLElBQUksS0FBSyxpQkFBaUIsNkJBQTZCLE1BQU0sTUFBUztBQUFBLEVBQ3BGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1VLHVCQUF1QixNQUEwQztBQUMxRSxXQUFPLGNBQWMsb0JBQW9CLEtBQUssZUFBZSxJQUFJO0FBQUEsRUFDbEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVUsd0JBQXdCLE1BQW1EO0FBQ3BGLFdBQU8sOEJBQThCLElBQUk7QUFBQSxFQUMxQztBQUFBLEVBRUEsTUFBYSx3QkFBd0IsZ0JBQXlCLFFBQWlDO0FBQzlGLFVBQU0sbUJBQW1CLEtBQUssb0JBQW9CO0FBQ2xELFFBQUksZ0JBQWdCO0FBQ25CLFlBQU0sUUFBUSxJQUFJLFlBQVk7QUFDOUIsWUFBTSxXQUFXLE1BQU0sS0FBSyxZQUFZLFNBQVM7QUFDakQsaUJBQVcsbUJBQW1CLGtCQUFrQjtBQUMvQyxjQUFNLElBQUksZ0JBQWdCLEdBQUc7QUFJN0IsY0FBTSxVQUFVLE1BQU0sS0FBSyxzQkFBc0IsZ0JBQWdCLEtBQUssVUFBVSxPQUFPLE1BQU07QUFDN0YsbUJBQVcsVUFBVSxTQUFTO0FBQzdCLGdCQUFNLElBQUksTUFBTTtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLGFBQU8sQ0FBQyxHQUFHLEtBQUs7QUFBQSxJQUNqQjtBQUNBLFdBQU8saUJBQWlCLElBQUksT0FBSyxFQUFFLEdBQUc7QUFBQSxFQUN2QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSxNQUFjLHNCQUFzQixXQUFnQixVQUFlLE1BQW1CLFFBQWlDO0FBQ3RILFVBQU0sYUFBb0IsQ0FBQztBQUMzQixRQUFJLFVBQVU7QUFDZCxXQUFPLE1BQU07QUFDWixVQUFJO0FBQ0gsY0FBTSxhQUFhLE1BQU0sS0FBSyxZQUFZLE9BQU8sU0FBUyxTQUFTLE1BQU0sQ0FBQztBQUMxRSxZQUFJLFlBQVk7QUFDZixlQUFLLE1BQU0sS0FBSyxnQ0FBZ0MsZ0JBQWdCLE9BQU8sR0FBRyxTQUFTO0FBQ2xGLHVCQUFXLEtBQUssT0FBTztBQUN2QixtQkFBTztBQUFBLFVBQ1I7QUFDQSxrQkFBUSxRQUFRLDRCQUE0QixRQUFRLFNBQVMsQ0FBQyxzRkFBc0Y7QUFDcEosaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFBQSxNQUNELFNBQVMsR0FBRztBQUNYLGNBQU0sTUFBTSxhQUFhLFFBQVEsRUFBRSxVQUFVLE9BQU8sQ0FBQztBQUNyRCxnQkFBUSxRQUFRLHVDQUF1QyxVQUFVLFNBQVMsQ0FBQyxxQkFBcUIsU0FBUyxTQUFTLE1BQU0sQ0FBQyxLQUFLLEdBQUcsR0FBRztBQUNwSSxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQ0EsaUJBQVcsS0FBSyxPQUFPO0FBQ3ZCLFlBQU0sU0FBUyxRQUFRLE9BQU87QUFJOUIsVUFBSSxRQUFRLFNBQVMsTUFBTSxLQUFLLFFBQVEsU0FBUyxPQUFPLFFBQVEsVUFBVSxNQUFNLEtBQUssS0FBSyxJQUFJLE1BQU0sR0FBRztBQUN0RztBQUFBLE1BQ0Q7QUFDQSxnQkFBVTtBQUFBLElBQ1g7QUFFQSxZQUFRLFFBQVEsdUNBQXVDLFVBQVUsU0FBUyxDQUFDLEdBQUc7QUFDOUUsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQWEsVUFBVSxNQUFtQixTQUF5QixPQUFtRDtBQUNySCxRQUFJLFlBQVksZUFBZSxRQUFRLFlBQVksZUFBZSxPQUFPO0FBQ3hFLFlBQU0sSUFBSSxNQUFNLG9DQUFvQyxPQUFPLEVBQUU7QUFBQSxJQUM5RDtBQUVBLFVBQU0sc0JBQXNCLEtBQUssdUJBQXVCLElBQUk7QUFDNUQsVUFBTSxvQkFBb0IsTUFBTSxLQUFLLG9CQUFvQixNQUFNLG9CQUFvQixPQUFPLFNBQU8sSUFBSSxZQUFZLE9BQU8sQ0FBQztBQUV6SCxRQUFJLFlBQVksZUFBZSxTQUFTLFNBQVMsWUFBWSxTQUFTLFNBQVMsWUFBWSxnQkFBZ0IsU0FBUyxZQUFZLFNBQVM7QUFDeEksd0JBQWtCLEtBQUssS0FBSyxjQUFjO0FBQUEsSUFDM0M7QUFFQSxVQUFNLFFBQVEsSUFBSSxZQUFZO0FBRTlCLGVBQVcsRUFBRSxZQUFZLFlBQVksS0FBSyxtQkFBbUI7QUFDNUQsWUFBTSxRQUFTLGdCQUFnQixTQUM1QixNQUFNLEtBQUssdUJBQXVCLFlBQVksTUFBTSxLQUFLLElBQ3pELE1BQU0sS0FBSyxzQkFBc0IsWUFBWSxhQUFhLEtBQUs7QUFDbEUsaUJBQVcsUUFBUSxPQUFPO0FBQ3pCLFlBQUksa0JBQWtCLElBQUksTUFBTSxNQUFNO0FBQ3JDLGdCQUFNLElBQUksSUFBSTtBQUFBLFFBQ2Y7QUFBQSxNQUNEO0FBQ0EsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUNBLFdBQU8sQ0FBQyxHQUFHLEtBQUs7QUFBQSxFQUNqQjtBQUFBLEVBRU8sd0JBQXdCLE1BQXlFO0FBQ3ZHLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLGVBQWUsWUFBWSxJQUFJLElBQUksUUFBYyxDQUFDO0FBQ3hELFVBQU0sUUFBUSxZQUFZLElBQUksSUFBSSx3QkFBd0IsQ0FBQyxFQUFFO0FBRTdELFVBQU0seUJBQXlCLFlBQVksSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBQ3BFLFVBQU0sTUFBTSxnQ0FBZ0MsSUFBSTtBQUNoRCxVQUFNLGlCQUFpQixLQUFLLGdCQUFnQixlQUFlO0FBRTNELFFBQUksZ0JBQXdELENBQUM7QUFFN0QsVUFBTSwrQkFBK0IsTUFBTTtBQUMxQyw2QkFBdUIsTUFBTTtBQUM3QixpQkFBVyxVQUFVLGVBQWU7QUFDbkMsWUFBSSxDQUFDLEtBQUssbUJBQW1CLE9BQU8sVUFBVSxHQUFHO0FBRWhELGdCQUFNLFlBQVksT0FBTyxnQkFBZ0IsVUFBYSxTQUFTLFlBQVk7QUFDM0UsaUNBQXVCLElBQUksS0FBSyxZQUFZLE1BQU0sT0FBTyxZQUFZLEVBQUUsV0FBVyxVQUFVLENBQUMsRUFBRSxDQUFDLENBQUM7QUFBQSxRQUNsRztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLFlBQVk7QUFDMUIsVUFBSTtBQUNILGNBQU0sc0JBQXNCLEtBQUssdUJBQXVCLElBQUk7QUFDNUQsd0JBQWdCLE1BQU0sS0FBSyxvQkFBb0IsTUFBTSxxQkFBcUIsTUFBUztBQUVuRixZQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsUUFDRDtBQUNBLHFDQUE2QjtBQUFBLE1BQzlCLFNBQVMsS0FBSztBQUNiLGFBQUssV0FBVyxNQUFNLDREQUE0RCxHQUFHO0FBQUEsTUFDdEY7QUFBQSxJQUNEO0FBQ0EsZ0JBQVksSUFBSSxLQUFLLGNBQWMseUJBQXlCLE9BQUs7QUFDaEUsVUFBSSxFQUFFLHFCQUFxQixHQUFHLEtBQUssRUFBRSxxQkFBcUIsY0FBYyxrQ0FBa0MsR0FBRztBQUM1RyxhQUFLLE9BQU87QUFDWixxQkFBYSxLQUFLO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLGdCQUFZLElBQUksS0FBSyw0QkFBNEIsRUFBRSxNQUFNO0FBQ3hELFdBQUssT0FBTztBQUNaLG1CQUFhLEtBQUs7QUFBQSxJQUNuQixDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLEtBQUssZ0NBQWdDLDBCQUEwQixNQUFNO0FBQ3BGLFdBQUssT0FBTztBQUNaLG1CQUFhLEtBQUs7QUFBQSxJQUNuQixDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLEtBQUssWUFBWSxpQkFBaUIsT0FBSztBQUN0RCxVQUFJLEVBQUUsUUFBUSxjQUFjLEdBQUc7QUFDOUIscUJBQWEsS0FBSztBQUNsQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLGNBQWMsS0FBSyxZQUFVLEVBQUUsUUFBUSxPQUFPLFVBQVUsQ0FBQyxHQUFHO0FBQy9ELHFCQUFhLEtBQUs7QUFDbEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLEtBQUssWUFBWSxNQUFNLGNBQWMsQ0FBQztBQUV0RCxTQUFLLE9BQU87QUFFWixXQUFPLEVBQUUsT0FBTyxhQUFhLE9BQU8sU0FBUyxNQUFNLFlBQVksUUFBUSxFQUFFO0FBQUEsRUFDMUU7QUFBQSxFQUVPLHNDQUE0RjtBQUNsRyxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsVUFBTSxlQUFlLFlBQVksSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUN4RCxVQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFDeEMsZ0JBQVksSUFBSSxhQUFhLE1BQU0sSUFBSSxRQUFRLElBQUksQ0FBQyxDQUFDO0FBQ3JELFVBQU0sUUFBUSxJQUFJO0FBQ2xCLFVBQU0sV0FBVyxZQUFZLElBQUksSUFBSSxnQkFBZ0IsQ0FBQztBQUN0RCxVQUFNLGVBQWUsSUFBSSxZQUFZO0FBRXJDLFVBQU0sV0FBVyxDQUFDLGFBQWtCO0FBQ25DLFVBQUksTUFBTSx5QkFBeUI7QUFDbEM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxhQUFhLElBQUksUUFBUSxHQUFHO0FBQy9CO0FBQUEsTUFDRDtBQUVBLG1CQUFhLElBQUksUUFBUTtBQUN6QixlQUFTLElBQUksS0FBSyxZQUFZLE1BQU0sUUFBUSxDQUFDO0FBQUEsSUFDOUM7QUFFQSxVQUFNLGlCQUFpQixZQUFZO0FBQ2xDLGVBQVMsTUFBTTtBQUNmLG1CQUFhLE1BQU07QUFFbkIsWUFBTSxzQkFBc0IsS0FBSyxjQUFjLFNBQVMsY0FBYyxZQUFZLEtBQUssS0FBSyxjQUFjLFNBQVMsY0FBYyxhQUFhO0FBQzlJLFlBQU0scUJBQXFCLEtBQUssY0FBYyxTQUFTLGNBQWMsYUFBYTtBQUNsRixZQUFNLHNCQUFzQixLQUFLLGNBQWMsU0FBUyxjQUFjLDZCQUE2QjtBQUNuRyxZQUFNLGlCQUFpQixLQUFLLGNBQWMsU0FBUyxjQUFjLGtDQUFrQyxNQUFNO0FBQ3pHLFlBQU0saUJBQWlCLE1BQU0sS0FBSyx3QkFBd0IsY0FBYztBQUN4RSxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsTUFDRDtBQUNBLFlBQU0sV0FBVyxNQUFNLEtBQUssWUFBWSxTQUFTO0FBQ2pELFVBQUksTUFBTSx5QkFBeUI7QUFDbEM7QUFBQSxNQUNEO0FBRUEsaUJBQVcsaUJBQWlCLGdCQUFnQjtBQUMzQyxZQUFJLHFCQUFxQjtBQUN4QixtQkFBUyxhQUFhO0FBQUEsUUFDdkI7QUFDQSxZQUFJLG9CQUFvQjtBQUN2QixtQkFBUyxTQUFTLGVBQWUsb0JBQW9CLENBQUM7QUFBQSxRQUN2RDtBQUNBLFlBQUkscUJBQXFCO0FBQ3hCLG1CQUFTLFNBQVMsZUFBZSxvQkFBb0IsQ0FBQztBQUFBLFFBQ3ZEO0FBQUEsTUFDRDtBQUVBLFVBQUksb0JBQW9CO0FBQ3ZCLGlCQUFTLFNBQVMsVUFBVSxvQkFBb0IsQ0FBQztBQUFBLE1BQ2xEO0FBQ0EsVUFBSSxxQkFBcUI7QUFDeEIsaUJBQVMsU0FBUyxVQUFVLHFCQUFxQixDQUFDO0FBQUEsTUFDbkQ7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLE1BQU07QUFDckIsV0FBSyxlQUFlO0FBQ3BCLG1CQUFhLEtBQUs7QUFBQSxJQUNuQjtBQUVBLGdCQUFZLElBQUksS0FBSyxjQUFjLHlCQUF5QixPQUFLO0FBQ2hFLFVBQ0MsRUFBRSxxQkFBcUIsY0FBYyxZQUFZLEtBQ2pELEVBQUUscUJBQXFCLGNBQWMsYUFBYSxLQUNsRCxFQUFFLHFCQUFxQixjQUFjLDZCQUE2QixLQUNsRSxFQUFFLHFCQUFxQixjQUFjLGtDQUFrQyxHQUN0RTtBQUNELGdCQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxLQUFLLDRCQUE0QixFQUFFLE1BQU07QUFDeEQsY0FBUTtBQUFBLElBQ1QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxLQUFLLGdDQUFnQywwQkFBMEIsTUFBTTtBQUNwRixjQUFRO0FBQUEsSUFDVCxDQUFDLENBQUM7QUFDRixnQkFBWSxJQUFJLEtBQUssWUFBWSxpQkFBaUIsT0FBSztBQUN0RCxpQkFBVyxlQUFlLGNBQWM7QUFDdkMsWUFBSSxFQUFFLFFBQVEsV0FBVyxHQUFHO0FBQzNCLHVCQUFhLEtBQUs7QUFDbEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsZ0JBQVksSUFBSSxLQUFLLFlBQVksa0JBQWtCLE9BQUs7QUFDdkQsaUJBQVcsZUFBZSxjQUFjO0FBQ3ZDLFlBQUksZ0JBQWdCLEVBQUUsVUFBVSxXQUFXLEdBQUc7QUFDN0MsdUJBQWEsS0FBSztBQUNsQjtBQUFBLFFBQ0Q7QUFDQSxZQUFJLEVBQUUsWUFBWSxjQUFjLE1BQU0sS0FBSyxFQUFFLFlBQVksY0FBYyxJQUFJLEtBQUssRUFBRSxZQUFZLGNBQWMsSUFBSSxHQUFHO0FBQ2xILGNBQUksZ0JBQWdCLEVBQUUsT0FBTyxVQUFVLFdBQVcsR0FBRztBQUNwRCx5QkFBYSxLQUFLO0FBQ2xCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLGVBQWU7QUFFcEIsV0FBTyxFQUFFLE9BQU8sYUFBYSxPQUFPLFNBQVMsTUFBTSxZQUFZLFFBQVEsRUFBRTtBQUFBLEVBQzFFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWEsdUJBQXdFO0FBQ3BGLFVBQU0sc0JBQXNCLEtBQUssdUJBQXVCLFlBQVksSUFBSTtBQUl4RSxVQUFNLHFCQUFxQixvQkFBb0I7QUFBQSxNQUFPLFNBQ3JELENBQUMsSUFBSSxLQUFLLFdBQVcsVUFBVSxLQUFLLENBQUMsSUFBSSxLQUFLLFNBQVMsV0FBVztBQUFBLElBQ25FO0FBR0EsVUFBTSxvQkFBb0IsTUFBTSxLQUFLLG9CQUFvQixZQUFZLE1BQU0sa0JBQWtCO0FBRzdGLFVBQU0sT0FBTyxJQUFJLFlBQVk7QUFDN0IsVUFBTSxTQUF3QyxDQUFDO0FBQy9DLGVBQVcsWUFBWSxtQkFBbUI7QUFJekMsVUFBSSxDQUFDLEtBQUssSUFBSSxTQUFTLFVBQVUsR0FBRztBQUNuQyxhQUFLLElBQUksU0FBUyxVQUFVO0FBQzVCLGVBQU8sS0FBSyxFQUFFLEdBQUcsVUFBVSxLQUFLLFNBQVMsWUFBWSxhQUFhLE9BQVUsQ0FBQztBQUFBLE1BQzlFO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFjQSxNQUFhLDRCQUE0QixNQUE0QztBQUNwRixVQUFNLHNCQUFzQixLQUFLLHVCQUF1QixJQUFJO0FBQzVELFVBQU0sb0JBQW9CLE1BQU0sS0FBSyxvQkFBb0IsTUFBTSxtQkFBbUI7QUFHbEYsUUFBSSxTQUFTLFlBQVksVUFBVSxTQUFTLFlBQVksY0FBYztBQUNyRSxhQUFPLGtCQUFrQixJQUFJLE9BQUssRUFBRSxHQUFHO0FBQUEsSUFDeEM7QUFLQSxVQUFNLFNBQVMsSUFBSSxZQUFZO0FBQy9CLGVBQVcsb0JBQW9CLG1CQUFtQjtBQUNqRCxVQUFJLFdBQVcsaUJBQWlCO0FBQ2hDLFlBQU0sV0FBVyxTQUFTLFFBQVE7QUFJbEMsWUFBTSxlQUFlLENBQUMsUUFBUSxJQUFJLHVCQUF1QixJQUFJLENBQUMsRUFBRTtBQUNoRSxpQkFBVyxlQUFlLGNBQWM7QUFDdkMsWUFBSSxhQUFhLGFBQWE7QUFDN0IscUJBQVcsUUFBUSxRQUFRO0FBQzNCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFJQSxVQUFJLGFBQWEsS0FBSztBQUNyQixtQkFBVyxRQUFRLFFBQVE7QUFBQSxNQUM1QjtBQUlBLFVBQUksWUFBWSxTQUFTLElBQUksTUFBTSxNQUFNO0FBQ3hDO0FBQUEsTUFDRDtBQUVBLGFBQU8sSUFBSSxRQUFRO0FBQUEsSUFDcEI7QUFFQSxXQUFPLENBQUMsR0FBRyxNQUFNO0FBQUEsRUFDbEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhQSxNQUFhLHlCQUF5QixNQUFvRTtBQUN6RyxVQUFNLG9CQUFvQixNQUFNLEtBQUssdUJBQXVCLElBQUk7QUFFaEUsVUFBTSxlQUFlLGtCQUFrQixPQUFPLFNBQU8sSUFBSSxZQUFZLGVBQWUsS0FBSztBQUN6RixVQUFNLGNBQWMsa0JBQWtCLE9BQU8sU0FBTyxJQUFJLFlBQVksZUFBZSxJQUFJO0FBQ3ZGLFdBQU8sS0FBSyxvQkFBb0IsQ0FBQyxHQUFHLGNBQWMsR0FBRyxXQUFXLENBQUM7QUFBQSxFQUNsRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBYSxpQ0FBaUMsTUFBb0U7QUFDakgsVUFBTSxvQkFBb0IsTUFBTSxLQUFLLHVCQUF1QixJQUFJO0FBQ2hFLFVBQU0sY0FBYyxrQkFBa0IsT0FBTyxTQUFPLElBQUksWUFBWSxlQUFlLElBQUk7QUFDdkYsVUFBTSxlQUFlLGtCQUFrQixPQUFPLFNBQU8sSUFBSSxZQUFZLGVBQWUsS0FBSztBQUN6RixXQUFPLEtBQUssb0JBQW9CLENBQUMsR0FBRyxhQUFhLEdBQUcsWUFBWSxDQUFDO0FBQUEsRUFDbEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBYyx1QkFBdUIsTUFBb0U7QUFDeEcsVUFBTSxzQkFBc0IsS0FBSyx1QkFBdUIsSUFBSTtBQUM1RCxVQUFNLGlCQUFpQixLQUFLLHdCQUF3QixJQUFJO0FBUXhELFVBQU0sZUFBZSxjQUFjLGtCQUFrQixLQUFLLGVBQWUsSUFBSSxNQUFNO0FBQ25GLFVBQU0sYUFBYSxlQUFlLHNCQUFzQjtBQUV4RCxVQUFNLG9CQUFvQixNQUFNLEtBQUssb0JBQW9CLE1BQU0sWUFBWSxjQUFjO0FBQ3pGLFFBQUksU0FBUyxZQUFZLFNBQVMsU0FBUyxZQUFZLGdCQUFnQixTQUFTLFlBQVksUUFBUTtBQUNuRyx3QkFBa0IsS0FBSyxLQUFLLGNBQWM7QUFBQSxJQUMzQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLUSxvQkFBb0IsU0FBZ0Y7QUFDM0csVUFBTSxPQUFPLElBQUksWUFBWTtBQUM3QixVQUFNLFNBQXdDLENBQUM7QUFDL0MsZUFBVyxVQUFVLFNBQVM7QUFDN0IsVUFBSSxDQUFDLEtBQUssSUFBSSxPQUFPLEdBQUcsR0FBRztBQUMxQixhQUFLLElBQUksT0FBTyxHQUFHO0FBQ25CLGVBQU8sS0FBSyxNQUFNO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU0EsTUFBYyxvQkFBb0IsTUFBbUIscUJBQXFELGtCQUEyRjtBQUNwTSxVQUFNLFNBQXdDLENBQUM7QUFDL0MsVUFBTSxPQUFPLElBQUksWUFBWTtBQUU3QixVQUFNLFdBQVcsTUFBTSxLQUFLLFlBQVksU0FBUztBQUNqRCxVQUFNLGNBQWMsTUFBTSxLQUFLLHdCQUF3QixLQUFLLGNBQWMsU0FBUyxjQUFjLGtDQUFrQyxNQUFNLElBQUk7QUFHN0ksVUFBTSxlQUFlLElBQUksSUFBSSxrQkFBa0IsSUFBSSxTQUFPLElBQUksSUFBSSxDQUFDO0FBR25FLFVBQU0saUJBQWlCLG9CQUFvQixPQUFPLGtCQUFnQjtBQUVqRSxVQUFJLFNBQVMsWUFBWSxnQkFBZ0IsU0FBUyxZQUFZLFFBQVE7QUFDckUsY0FBTSxPQUFPLGFBQWE7QUFDMUIsWUFBSSxlQUFlLElBQUksR0FBRztBQUN6QixjQUFJLFNBQVMsWUFBWSxRQUFRO0FBQ2hDLGlCQUFLLFdBQVcsS0FBSyxtRkFBbUYsSUFBSSwyQ0FBMkM7QUFBQSxVQUN4SixXQUFXLFNBQVMsWUFBWSxjQUFjO0FBQzdDLGlCQUFLLFdBQVcsS0FBSyxvRUFBb0UsSUFBSSwwREFBMEQ7QUFBQSxVQUN4SjtBQUFBLFFBQ0Q7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0scUJBQXFCLGFBQWE7QUFDeEMsVUFBSSxDQUFDLHdCQUF3QixrQkFBa0IsR0FBRztBQUNqRCxhQUFLLFdBQVcsS0FBSywyRUFBMkUsa0JBQWtCLEVBQUU7QUFDcEgsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsZUFBVyxnQkFBZ0IsZ0JBQWdCO0FBQzFDLFlBQU0scUJBQXFCLGFBQWE7QUFDeEMsWUFBTSxZQUFZLGNBQWMsSUFBSSxrQkFBa0I7QUFDdEQsVUFBSTtBQUVILFlBQUksWUFBWSxrQkFBa0IsR0FBRztBQUNwQyxnQkFBTSxNQUFNLFNBQVMsVUFBVSxtQkFBbUIsVUFBVSxDQUFDLENBQUM7QUFDOUQsY0FBSSxDQUFDLEtBQUssSUFBSSxHQUFHLEdBQUc7QUFDbkIsaUJBQUssSUFBSSxHQUFHO0FBQ1osa0JBQU0sRUFBRSxZQUFZLFlBQVksSUFBSSxzQkFBc0IsTUFBTSxHQUFHO0FBQ25FLG1CQUFPLEtBQUssRUFBRSxLQUFLLFlBQXdCLGFBQWEsUUFBUSxhQUFhLFFBQVEsU0FBUyxhQUFhLFNBQVMsYUFBYSxvQkFBb0IsVUFBVSxDQUFDO0FBQUEsVUFDaks7QUFDQTtBQUFBLFFBQ0Q7QUFFQSxZQUFJLFdBQVcsa0JBQWtCLEdBQUc7QUFDbkMsY0FBSSxNQUFNLElBQUksS0FBSyxrQkFBa0I7QUFDckMsZ0JBQU0sa0JBQWtCLEtBQUssbUJBQW1CO0FBQ2hELGNBQUksaUJBQWlCO0FBR3BCLGtCQUFNLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxjQUFjLFdBQVcsZ0JBQWdCLENBQUM7QUFBQSxVQUM1RTtBQUNBLGNBQUksQ0FBQyxLQUFLLElBQUksR0FBRyxHQUFHO0FBQ25CLGlCQUFLLElBQUksR0FBRztBQUNaLGtCQUFNLEVBQUUsWUFBWSxZQUFZLElBQUksc0JBQXNCLE1BQU0sR0FBRztBQUNuRSxtQkFBTyxLQUFLLEVBQUUsS0FBSyxZQUF3QixhQUFhLFFBQVEsYUFBYSxRQUFRLFNBQVMsYUFBYSxTQUFTLGFBQWEsb0JBQW9CLFVBQVUsQ0FBQztBQUFBLFVBQ2pLO0FBQUEsUUFDRCxPQUFPO0FBQ04scUJBQVcsVUFBVSxhQUFhO0FBQ2pDLGtCQUFNLGVBQWUsU0FBUyxRQUFRLGtCQUFrQjtBQUN4RCxnQkFBSSxDQUFDLEtBQUssSUFBSSxZQUFZLEdBQUc7QUFDNUIsbUJBQUssSUFBSSxZQUFZO0FBQ3JCLG9CQUFNLEVBQUUsWUFBWSxZQUFZLElBQUksc0JBQXNCLE1BQU0sWUFBWTtBQUM1RSxxQkFBTyxLQUFLLEVBQUUsS0FBSyxjQUFjLFlBQXdCLGFBQWEsUUFBUSxhQUFhLFFBQVEsU0FBUyxhQUFhLFNBQVMsYUFBYSxvQkFBb0IsVUFBVSxDQUFDO0FBQUEsWUFDL0s7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsYUFBSyxXQUFXLE1BQU0sMkNBQTJDLGtCQUFrQixJQUFJLEtBQUs7QUFBQSxNQUM3RjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBYyx1QkFBdUIsVUFBZSxNQUFtQixPQUEwQixRQUFnQixHQUFtQjtBQUNuSSxRQUFJLFNBQVMsWUFBWSxPQUFPO0FBQy9CLGFBQU8sS0FBSyx3QkFBd0IsVUFBVSxLQUFLO0FBQUEsSUFDcEQ7QUFLQSxVQUFNLGtCQUFrQixVQUFVLEtBQUssS0FBSyxvQkFBb0IsRUFBRSxLQUFLLE9BQUssUUFBUSxFQUFFLEtBQUssUUFBUSxDQUFDO0FBQ3BHLFVBQU0sWUFBWSxTQUFTLFlBQVksZ0JBQ25DLENBQUMsbUJBQ0QsQ0FBQyxlQUFlLFNBQVMsSUFBSSxLQUM3QixRQUFRO0FBQ1osUUFBSTtBQUNILFlBQU0sT0FBTyxNQUFNLEtBQUssWUFBWSxRQUFRLFFBQVE7QUFDcEQsVUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxlQUFPLENBQUM7QUFBQSxNQUNUO0FBQ0EsVUFBSSxLQUFLLFFBQVE7QUFDaEIsZUFBTyxDQUFDLEtBQUssUUFBUTtBQUFBLE1BQ3RCLFdBQVcsS0FBSyxlQUFlLEtBQUssVUFBVTtBQUM3QyxjQUFNLFNBQWdCLENBQUM7QUFDdkIsbUJBQVcsU0FBUyxLQUFLLFVBQVU7QUFDbEMsY0FBSSxNQUFNLFFBQVE7QUFDakIsbUJBQU8sS0FBSyxNQUFNLFFBQVE7QUFBQSxVQUMzQixXQUFXLGFBQWEsTUFBTSxhQUFhO0FBRTFDLGtCQUFNLFdBQVcsTUFBTSxLQUFLLHVCQUF1QixNQUFNLFVBQVUsTUFBTSxPQUFPLFFBQVEsQ0FBQztBQUN6RixtQkFBTyxLQUFLLEdBQUcsUUFBUTtBQUFBLFVBQ3hCO0FBQUEsUUFDRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxTQUFTLEdBQUc7QUFDWCxVQUFJLGFBQWEsc0JBQXNCLEVBQUUsd0JBQXdCLG9CQUFvQixnQkFBZ0I7QUFBQSxNQUVyRyxPQUFPO0FBQ04sYUFBSyxXQUFXLE1BQU0sd0NBQXdDLFNBQVMsU0FBUyxDQUFDLElBQUksQ0FBQztBQUFBLE1BQ3ZGO0FBQUEsSUFDRDtBQUNBLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBYyxzQkFBc0IsUUFBYSxhQUFpQyxPQUEwQztBQUUzSCxRQUFJLENBQUMsS0FBSyxjQUFjLDRCQUE0QixPQUFPLE1BQU0sR0FBRztBQUNuRSxXQUFLLFdBQVcsS0FBSyxvRUFBb0UsT0FBTyxNQUFNLGlDQUFpQyxXQUFXLFFBQVEsT0FBTyxTQUFTLENBQUMsRUFBRTtBQUM3SyxhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSx1QkFBdUIsS0FBSyxjQUFjLFNBQWtCLDJCQUEyQjtBQUU3RixVQUFNLGdCQUFnQixLQUFLLG1CQUFtQixNQUFNO0FBRXBELFVBQU0sb0JBQW9CLENBQUNBLFlBQWdCLFlBQVksS0FBSyxjQUFjLFNBQStCLEVBQUUsVUFBVUEsUUFBTyxDQUFDLENBQUMsS0FBSyxDQUFDO0FBQ3BJLFVBQU0sZ0JBQTRCO0FBQUEsTUFDakMsZUFBZSxDQUFDLEVBQUUsUUFBUSxxQkFBcUIsQ0FBQztBQUFBLE1BQ2hELE1BQU0sVUFBVTtBQUFBLE1BQ2hCLDRCQUE0QjtBQUFBLE1BQzVCLGdCQUFnQixnQkFBZ0Isa0JBQWtCLGNBQWMsR0FBRyxJQUFJO0FBQUEsTUFDdkUsZ0JBQWdCO0FBQUEsTUFDaEIsYUFBYTtBQUFBLE1BQ2I7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNILFlBQU0sZUFBZSxNQUFNLEtBQUssY0FBYyxXQUFXLGVBQWUsS0FBSztBQUM3RSxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFDQSxhQUFPLGFBQWEsUUFBUSxJQUFJLE9BQUssRUFBRSxRQUFRO0FBQUEsSUFDaEQsU0FBUyxHQUFHO0FBQ1gsVUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUc7QUFDNUIsY0FBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQ0EsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYSx3QkFBd0IsT0FBNEQ7QUFDaEcsVUFBTSxTQUFTLE1BQU0sUUFBUSxJQUFJLEtBQUssb0JBQW9CLEVBQUUsSUFBSSxZQUFVLEtBQUsscUJBQXFCLE9BQU8sS0FBSyxLQUFLLENBQUMsQ0FBQztBQUN2SCxXQUFPLE9BQU8sS0FBSyxDQUFDO0FBQUEsRUFDckI7QUFBQSxFQUVBLE1BQWMscUJBQXFCLFFBQWEsT0FBNEQ7QUFFM0csUUFBSSxLQUFLLGNBQWMsNEJBQTRCLE9BQU8sTUFBTSxHQUFHO0FBRWxFLFlBQU0sdUJBQXVCLEtBQUssY0FBYyxTQUFrQiwyQkFBMkI7QUFDN0YsWUFBTSxvQkFBb0IsQ0FBQ0EsWUFBZ0IsWUFBWSxLQUFLLGNBQWMsU0FBK0IsRUFBRSxVQUFVQSxRQUFPLENBQUMsQ0FBQyxLQUFLLENBQUM7QUFDcEksWUFBTSxnQkFBNEI7QUFBQSxRQUNqQyxlQUFlLENBQUMsRUFBRSxRQUFRLHFCQUFxQixDQUFDO0FBQUEsUUFDaEQsTUFBTSxVQUFVO0FBQUEsUUFDaEIsNEJBQTRCO0FBQUEsUUFDNUIsZ0JBQWdCLGtCQUFrQixNQUFNO0FBQUEsUUFDeEMsYUFBYTtBQUFBLFFBQ2IsZ0JBQWdCO0FBQUEsTUFDakI7QUFFQSxVQUFJO0FBQ0gsY0FBTSxlQUFlLE1BQU0sS0FBSyxjQUFjLFdBQVcsZUFBZSxLQUFLO0FBQzdFLFlBQUksTUFBTSx5QkFBeUI7QUFDbEMsaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFFQSxjQUFNLFVBQW1DLENBQUM7QUFDMUMsbUJBQVcsS0FBSyxhQUFhLFNBQVM7QUFDckMsZ0JBQU0sV0FBVztBQUNqQixrQkFBUSxLQUFLLEVBQUUsS0FBSyxFQUFFLFVBQVUsVUFBVSxNQUFNLHlCQUF5QixTQUFTLENBQUM7QUFBQSxRQUNwRjtBQUNBLGVBQU87QUFBQSxNQUNSLFNBQVMsR0FBRztBQUNYLFlBQUksQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHO0FBQzVCLGdCQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFDQSxhQUFPLENBQUM7QUFBQSxJQUNULE9BQU87QUFFTixhQUFPLEtBQUssNkJBQTZCLFFBQVEsS0FBSztBQUFBLElBQ3ZEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFjLDZCQUE2QixRQUFhLE9BQTREO0FBQ25ILFVBQU0sU0FBa0MsQ0FBQztBQUN6QyxVQUFNLG1CQUFtQjtBQUV6QixVQUFNLFdBQVcsT0FBTyxRQUE0QjtBQUNuRCxVQUFJLE1BQU0seUJBQXlCO0FBQ2xDO0FBQUEsTUFDRDtBQUVBLFVBQUk7QUFDSCxjQUFNLE9BQU8sTUFBTSxLQUFLLFlBQVksUUFBUSxHQUFHO0FBQy9DLFlBQUksS0FBSyxVQUFVLEtBQUssS0FBSyxZQUFZLE1BQU0sa0JBQWtCO0FBQ2hFLGdCQUFNLFdBQVcsS0FBSyxpQkFBaUIsTUFBTSxLQUFLLFlBQVksU0FBUyxLQUFLLFFBQVEsSUFBSTtBQUN4RixpQkFBTyxLQUFLLEVBQUUsS0FBSyxLQUFLLFVBQVUsVUFBVSxNQUFNLHlCQUF5QixTQUFTLENBQUM7QUFBQSxRQUN0RixXQUFXLEtBQUssZUFBZSxLQUFLLFVBQVU7QUFFN0MscUJBQVcsU0FBUyxLQUFLLFVBQVU7QUFDbEMsa0JBQU0sU0FBUyxNQUFNLFFBQVE7QUFBQSxVQUM5QjtBQUFBLFFBQ0Q7QUFBQSxNQUNELFNBQVMsT0FBTztBQUVmLGFBQUssV0FBVyxNQUFNLHlDQUF5QyxJQUFJLFNBQVMsQ0FBQyxLQUFLLEtBQUssRUFBRTtBQUFBLE1BQzFGO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxNQUFNO0FBQ3JCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFJQSxNQUFhLGlCQUFpQixPQUFjLFFBQTRCLE9BQW9DLE9BQTBCLFNBQWtDLENBQUMsR0FBcUM7QUFDN00sVUFBTSxZQUFZLE1BQU0sSUFBSSxXQUFTLEVBQUUsVUFBVSxXQUFXLFNBQVksU0FBUyxNQUFNLE1BQU0sSUFBSSxLQUFLLEVBQUU7QUFDeEcsVUFBTSxnQkFBZ0IsTUFBTSxLQUFLLFlBQVksV0FBVyxTQUFTO0FBQ2pFLFFBQUksTUFBTSx5QkFBeUI7QUFDbEMsYUFBTztBQUFBLElBQ1I7QUFDQSxlQUFXLFFBQVEsZUFBZTtBQUNqQyxVQUFJLEtBQUssV0FBVyxLQUFLLE1BQU0sVUFBVTtBQUN4QyxtQkFBVyxTQUFTLEtBQUssS0FBSyxVQUFVO0FBQ3ZDLGNBQUksTUFBTSxRQUFRO0FBQ2pCLGtCQUFNLGVBQWUsTUFBTSxLQUFLLE9BQUssaUJBQWlCLEVBQUUsVUFBVSxNQUFNLElBQUksQ0FBQztBQUM3RSxnQkFBSSxjQUFjO0FBQ2pCLG9CQUFNLFdBQVcsTUFBTSxpQkFBaUIsTUFBTSxLQUFLLFlBQVksU0FBUyxNQUFNLFFBQVEsSUFBSTtBQUMxRixxQkFBTyxLQUFLLEVBQUUsS0FBSyxNQUFNLFVBQVUsVUFBVSxNQUFNLGFBQWEsS0FBSyxDQUFDO0FBQUEsWUFDdkU7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLDRCQUE0QixRQUE4QjtBQUNoRSxRQUFJLE9BQU8sS0FBSyxTQUFTLDBCQUEwQixHQUFHO0FBQ3JELFVBQUk7QUFDSixZQUFNLGtCQUFrQixLQUFLLG1CQUFtQixNQUFNO0FBQ3RELFVBQUksaUJBQWlCO0FBQ3BCLHNCQUFjLFNBQVMsZ0JBQWdCLEtBQUssc0JBQXNCLG1CQUFtQixNQUFNLElBQUksb0JBQW9CO0FBQUEsTUFDcEgsV0FBVyxnQkFBZ0IsUUFBUSxLQUFLLGdCQUFnQixlQUFlLFdBQVcsR0FBRztBQUNwRixzQkFBYyxTQUFTLEtBQUssZ0JBQWdCLGVBQWUsYUFBYSxtQkFBbUIsTUFBTSxJQUFJLG9CQUFvQjtBQUFBLE1BQzFIO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyx3QkFBd0IsS0FBVSxPQUEwQztBQUN6RixRQUFJO0FBQ0gsWUFBTSxTQUFnQixDQUFDO0FBQ3ZCLFlBQU0sT0FBTyxNQUFNLEtBQUssWUFBWSxRQUFRLEdBQUc7QUFDL0MsVUFBSSxLQUFLLGVBQWUsS0FBSyxVQUFVO0FBRXRDLG1CQUFXLFNBQVMsS0FBSyxVQUFVO0FBQ2xDLGNBQUk7QUFDSCxnQkFBSSxNQUFNLHlCQUF5QjtBQUNsQyxxQkFBTyxDQUFDO0FBQUEsWUFDVDtBQUNBLGdCQUFJLE1BQU0sYUFBYTtBQUN0QixvQkFBTSxZQUFZLFNBQVMsTUFBTSxVQUFVLGNBQWM7QUFDekQsb0JBQU0sWUFBWSxNQUFNLEtBQUssWUFBWSxRQUFRLFNBQVM7QUFDMUQsa0JBQUksVUFBVSxRQUFRO0FBQ3JCLHVCQUFPLEtBQUssVUFBVSxRQUFRO0FBQUEsY0FDL0I7QUFBQSxZQUNEO0FBQUEsVUFDRCxTQUFTLE9BQU87QUFBQSxVQUVoQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsYUFBTztBQUFBLElBQ1IsU0FBUyxHQUFHO0FBQ1gsVUFBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUc7QUFDNUIsYUFBSyxXQUFXLE1BQU0sc0RBQXNELElBQUksU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFO0FBQUEsTUFDbkc7QUFDQSxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYSxnQkFBZ0IsT0FBa0Q7QUFDOUUsVUFBTSxzQkFBc0IsS0FBSyx1QkFBdUIsWUFBWSxLQUFLO0FBQ3pFLFVBQU0sb0JBQW9CLE1BQU0sS0FBSyxvQkFBb0IsWUFBWSxPQUFPLG1CQUFtQjtBQUMvRixVQUFNLGFBQTRCLENBQUM7QUFFbkMsZUFBVyxFQUFFLEtBQUssUUFBUSxRQUFRLEtBQUssbUJBQW1CO0FBQ3pELFVBQUksTUFBTSx5QkFBeUI7QUFDbEMsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUNBLFlBQU0sVUFBVSxNQUFNLEtBQUssd0JBQXdCLEtBQUssS0FBSztBQUM3RCxpQkFBVyxZQUFZLFNBQVM7QUFDL0IsbUJBQVcsS0FBSyxFQUFFLEtBQUssVUFBVSxRQUFRLFNBQVMsTUFBTSxZQUFZLE1BQU0sQ0FBQztBQUFBLE1BQzVFO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFuMEJhLHFCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FiVTtBQTYwQk4sU0FBUyxlQUFlLE1BQXVCO0FBQ3JELFNBQU8sS0FBSyxTQUFTLEdBQUc7QUFDekI7QUFNTyxTQUFTLFlBQVksU0FBMEI7QUFDckQsTUFBSSxpQkFBaUI7QUFDckIsTUFBSSxzQkFBc0I7QUFFMUIsTUFBSSxnQkFBZ0I7QUFDcEIsTUFBSSxxQkFBcUI7QUFFekIsTUFBSTtBQUNKLGFBQVcsUUFBUSxTQUFTO0FBRTNCLFFBQUksc0JBQXNCLE1BQU07QUFDL0IsMEJBQW9CO0FBQ3BCO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUyxLQUFLO0FBQ2pCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxTQUFTLEtBQUs7QUFDakIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLFNBQVMsS0FBSztBQUNqQix1QkFBaUI7QUFDakI7QUFFQSwwQkFBb0I7QUFDcEI7QUFBQSxJQUNEO0FBRUEsUUFBSSxTQUFTLEtBQUs7QUFDakIsdUJBQWlCO0FBQ2pCO0FBQ0EsMEJBQW9CO0FBQ3BCO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUyxLQUFLO0FBQ2pCLHNCQUFnQjtBQUNoQjtBQUNBO0FBQUEsSUFDRDtBQUVBLFFBQUksU0FBUyxLQUFLO0FBQ2pCLHNCQUFnQjtBQUNoQjtBQUNBLDBCQUFvQjtBQUNwQjtBQUFBLElBQ0Q7QUFFQSx3QkFBb0I7QUFBQSxFQUNyQjtBQUdBLE1BQUksa0JBQW1CLHdCQUF3QixHQUFJO0FBQ2xELFdBQU87QUFBQSxFQUNSO0FBR0EsTUFBSSxpQkFBa0IsdUJBQXVCLEdBQUk7QUFDaEQsV0FBTztBQUFBLEVBQ1I7QUFFQSxTQUFPO0FBQ1I7QUF1QkEsU0FBUyxzQkFBc0IsTUFBbUIsVUFBc0M7QUFDdkYsTUFBSSxTQUFTLFlBQVksZ0JBQWdCLFNBQVMsWUFBWSxRQUFRO0FBRXJFLFdBQU8sRUFBRSxZQUFZLFNBQVM7QUFBQSxFQUMvQjtBQUVBLFFBQU0sV0FBVyxTQUFTLEtBQUssTUFBTSxHQUFHO0FBQ3hDLE1BQUksSUFBSTtBQUNSLFNBQU8sSUFBSSxTQUFTLFVBQVUsWUFBWSxTQUFTLENBQUMsQ0FBQyxNQUFNLE9BQU87QUFDakU7QUFBQSxFQUNEO0FBQ0EsTUFBSSxNQUFNLFNBQVMsUUFBUTtBQUcxQixXQUFPLEVBQUUsWUFBWSxTQUFTO0FBQUEsRUFDL0I7QUFDQSxRQUFNLFNBQVMsU0FBUyxLQUFLLEVBQUUsTUFBTSxTQUFTLE1BQU0sR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLEVBQUUsQ0FBQztBQUNyRSxNQUFJLE1BQU0sU0FBUyxTQUFTLEtBQUssU0FBUyxDQUFDLE1BQU0sT0FBTyxTQUFTLENBQUMsTUFBTSxJQUFJO0FBQzNFLFdBQU8sRUFBRSxZQUFZLE9BQU87QUFBQSxFQUM3QjtBQUdBLFNBQU87QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLGFBQWEsU0FBUyxNQUFNLENBQUMsRUFBRSxLQUFLLEdBQUc7QUFBQSxFQUN4QztBQUNEO0FBeUJPLE1BQU0sOEJBQThCO0FBQzNDLE1BQU0sNEJBQTRCLElBQUksT0FBTywyQkFBMkI7QUFNakUsU0FBUyx3QkFBd0IsTUFBdUI7QUFDOUQsU0FBTywwQkFBMEIsS0FBSyxJQUFJO0FBQzNDOyIsCiAgIm5hbWVzIjogWyJmb2xkZXIiXQp9Cg==
