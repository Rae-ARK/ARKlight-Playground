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
import { appendFile, mkdir } from "fs/promises";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { joinPath, dirname as uriDirname, extUriBiasedIgnorePathCase } from "../../../../base/common/resources.js";
import { compare as compareStrings } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { basename, isAbsolute, dirname as nodeDirname } from "../../../../base/common/path.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { CustomizationLoadStatus, CustomizationType, customizationId } from "../../common/state/sessionState.js";
import { toAgentCustomizationMeta } from "../../common/meta/agentCustomizationMeta.js";
import { raceCancellationError } from "../../../../base/common/async.js";
var DiscoveredType = /* @__PURE__ */ ((DiscoveredType2) => {
  DiscoveredType2["Agent"] = "agent";
  DiscoveredType2["Skill"] = "skill";
  DiscoveredType2["Instruction"] = "instruction";
  DiscoveredType2["Hook"] = "hook";
  DiscoveredType2["AgentInstruction"] = "agentInstruction";
  return DiscoveredType2;
})(DiscoveredType || {});
function areDiscoveredDirectoriesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.type !== right.type || left.uri.toString() !== right.uri.toString() || !areDiscoveredFilesEqual(left.files, right.files)) {
      return false;
    }
  }
  return true;
}
function compareDiscoveredDirectory(a, b) {
  const byType = compareStrings(a.type, b.type);
  if (byType !== 0) {
    return byType;
  }
  return compareStrings(a.uri.toString(), b.uri.toString());
}
function areDiscoveredFilesEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.uri.toString() !== right.uri.toString() || left.etag !== right.etag) {
      return false;
    }
  }
  return true;
}
function compareDiscoveredFile(a, b) {
  return compareStrings(a.uri.toString(), b.uri.toString());
}
function compareDirectoryCustomization(a, b) {
  const byUri = compareStrings(a.uri, b.uri);
  if (byUri !== 0) {
    return byUri;
  }
  return compareStrings(a.contents, b.contents);
}
const MAX_INSTRUCTIONS_RECURSION_DEPTH = 5;
const MAX_HOOKS_RECURSION_DEPTH = 8;
const AGENT_FILE_SUFFIX = ".agent.md";
const MARKDOWN_SUFFIX = ".md";
const INSTRUCTION_FILE_SUFFIX = ".instructions.md";
const HOOK_FILE_SUFFIX = ".json";
const SKILL_FILENAME = "SKILL.md";
const README_FILENAME = "README.md";
const CUSTOMIZATION_DISCOVERY_DEBUG_LOG_PATH = void 0;
const AGENT_INSTRUCTION_FILENAMES = /* @__PURE__ */ new Set(["agents.md", "claude.md", "gemini.md", "copilot-instructions.md"]);
const searchRoots = {
  workspace: [
    { path: [".github", "agents"], type: "agent" /* Agent */, name: ".github" },
    { path: [".claude", "agents"], type: "agent" /* Agent */, name: ".claude" },
    { path: [".github", "skills"], recursive: true, type: "skill" /* Skill */, name: ".github" },
    { path: [".agents", "skills"], recursive: true, type: "skill" /* Skill */, name: ".agents" },
    { path: [".claude", "skills"], recursive: true, type: "skill" /* Skill */, name: ".claude" },
    { path: [".github", "instructions"], recursive: true, type: "instruction" /* Instruction */, name: ".github" },
    { path: [".github", "hooks"], recursive: true, type: "hook" /* Hook */, name: ".github" }
  ],
  user: [
    { path: [".copilot", "agents"], type: "agent" /* Agent */, name: "~/.copilot" },
    { path: [".agents", "skills"], recursive: true, type: "skill" /* Skill */, name: "~/.agents" },
    { path: [".copilot", "skills"], recursive: true, type: "skill" /* Skill */, name: "~/.copilot" },
    { path: [".copilot", "instructions"], recursive: true, type: "instruction" /* Instruction */, name: "~/.copilot" },
    { path: [".copilot", "hooks"], recursive: true, type: "hook" /* Hook */, name: "~/.copilot" }
  ]
};
const fixedDiscoveryFiles = {
  workspace: [
    { path: [".github"], filenames: ["copilot-instructions.md"], type: "agentInstruction" /* AgentInstruction */ },
    { path: [], filenames: ["AGENTS.md", "CLAUDE.md", "GEMINI.md"], type: "agentInstruction" /* AgentInstruction */ },
    { path: [".claude"], filenames: ["CLAUDE.md"], type: "agentInstruction" /* AgentInstruction */ },
    { path: [".github", "copilot"], filenames: ["settings.json", "settings.local.json"], type: "hook" /* Hook */ },
    { path: [".claude"], filenames: ["settings.json", "settings.local.json"], type: "hook" /* Hook */ }
  ],
  user: [
    { path: [".copilot"], filenames: ["copilot-instructions.md"], type: "agentInstruction" /* AgentInstruction */ }
  ]
};
const agentInstructions = fixedDiscoveryFiles;
function throwIfCancelled(token) {
  if (token.isCancellationRequested) {
    throw new CancellationError();
  }
}
function addWatch(map, watchUri, recursive, resourceToWatch) {
  let entry = map.get(watchUri);
  if (!entry) {
    entry = { recursive, resourcesToWatch: new ResourceSet() };
    map.set(watchUri, entry);
  } else if (recursive && !entry.recursive) {
    entry = { recursive: true, resourcesToWatch: entry.resourcesToWatch };
    map.set(watchUri, entry);
  }
  entry.resourcesToWatch.add(resourceToWatch);
}
let SessionCustomizationDiscovery = class extends Disposable {
  constructor(_workingDirectories, _userHome, _pathToUri = URI.file, _fileService, _logService) {
    super();
    this._workingDirectories = _workingDirectories;
    this._userHome = _userHome;
    this._pathToUri = _pathToUri;
    this._fileService = _fileService;
    this._logService = _logService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._discoveredDirectories = void 0;
    this._watchers = new ResourceMap();
    if (_workingDirectories.length === 0) {
      this.dispose();
      throw new Error("SessionCustomizationDiscovery requires at least one working directory (index 0 = primary root).");
    }
    this._register({ dispose: () => this._disposeAllWatchers() });
    this._register(this._fileService.onDidFilesChange((e) => {
      for (const watcher of this._watchers.values()) {
        for (const uri of watcher.resourcesToWatch) {
          if (e.affects(uri)) {
            this._scheduleRefresh();
            return;
          }
        }
      }
    }));
  }
  _scheduleRefresh() {
    this._onDidChange.fire();
  }
  /**
   * True when `uri` is one of the workspace roots or the user home — i.e. an
   * ancestor-walk boundary. With a single root this is exactly the previous
   * `isEqual(uri, workingDirectory) || isEqual(uri, userHome)` check.
   */
  _isDiscoveryBoundary(uri) {
    if (extUriBiasedIgnorePathCase.isEqual(uri, this._userHome)) {
      return true;
    }
    return this._workingDirectories.some((root) => extUriBiasedIgnorePathCase.isEqual(uri, root));
  }
  /**
   * The workspace root that contains (or equals) `uri`, or `undefined` when it
   * lives under none of them. Prefers the most specific root when roots nest.
   */
  _containingWorkspaceRoot(uri) {
    let best;
    for (const root of this._workingDirectories) {
      if (extUriBiasedIgnorePathCase.isEqualOrParent(uri, root) && (!best || root.path.length > best.path.length)) {
        best = root;
      }
    }
    return best;
  }
  /**
   * Maps an SDK-supplied `projectPath` (an fs path string) back to the original
   * workspace-root {@link URI}, preserving its scheme/authority. Returns
   * `undefined` when the path matches none of the roots.
   */
  _rootForProjectPath(projectPath) {
    if (!projectPath) {
      return void 0;
    }
    const target = this._pathToUri(projectPath);
    return this._workingDirectories.find((root) => extUriBiasedIgnorePathCase.isEqual(root, target));
  }
  /**
   * The working-directory roots that hooks are discovered from.
   *
   * **Hooks are discovered from the PRIMARY working directory only** (index 0 of
   * {@link _workingDirectories}, which callers MUST order primary-first). Hooks
   * from non-primary roots are intentionally NOT discovered because the Copilot
   * agent currently applies hooks from a single primary directory only. Every
   * other customization types (agents, skills, and instructions) are discovered
   * across all roots.
   *
   * Example: for roots `[B, A, C]` (with `B` selected as primary), hooks are
   * discovered from `B` only; hooks under `A`/`C` are ignored.
   *
   * This may expand to all roots in the future — see `MULTI_ROOT_CHANGES.md`.
   */
  get _hookWorkingDirectories() {
    return this._workingDirectories.slice(0, 1);
  }
  async writeCustomizationDiscoveryDebugLog(payload) {
    if (!CUSTOMIZATION_DISCOVERY_DEBUG_LOG_PATH) {
      return;
    }
    try {
      await mkdir(nodeDirname(CUSTOMIZATION_DISCOVERY_DEBUG_LOG_PATH), { recursive: true });
      await appendFile(CUSTOMIZATION_DISCOVERY_DEBUG_LOG_PATH, `${JSON.stringify({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        ...payload
      }, void 0, 2)}
`, "utf8");
    } catch (err) {
      this._logService.error(`[SessionCustomizationDiscovery] Failed to write discovery debug log: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  async getDiscoveredDirectories(client, token) {
    throwIfCancelled(token);
    const p = { projectPaths: this._workingDirectories.map((uri) => uri.fsPath) };
    const result = this.getHooksDiscoveryPaths();
    const workspaceAgentInstructionFilesByRoot = new ResourceMap();
    const userAgentInstructionFiles = [];
    try {
      const [agentDiscovery, instructionDiscovery, skillDiscovery] = await Promise.all([
        raceCancellationError(client.rpc.agents.getDiscoveryPaths(p), token),
        raceCancellationError(client.rpc.instructions.getDiscoveryPaths(p), token),
        raceCancellationError(client.rpc.skills.getDiscoveryPaths(p), token)
      ]);
      for (const agentPath of agentDiscovery?.paths ?? []) {
        throwIfCancelled(token);
        result.push({
          uri: this._pathToUri(agentPath.path),
          type: "agent" /* Agent */,
          files: [],
          name: basename(agentPath.path),
          writable: true
        });
      }
      for (const instructionPath of instructionDiscovery?.paths ?? []) {
        throwIfCancelled(token);
        if (instructionPath.kind === "file") {
          const fileUri = this._pathToUri(instructionPath.path);
          const discoveredFile = { uri: fileUri, etag: "" };
          const containingRoot = this._containingWorkspaceRoot(fileUri);
          if (containingRoot) {
            const files = workspaceAgentInstructionFilesByRoot.get(containingRoot) ?? [];
            files.push(discoveredFile);
            workspaceAgentInstructionFilesByRoot.set(containingRoot, files);
          } else if (extUriBiasedIgnorePathCase.isEqualOrParent(fileUri, this._userHome)) {
            userAgentInstructionFiles.push(discoveredFile);
          }
          continue;
        } else if (instructionPath.kind === "directory") {
          result.push({
            uri: this._pathToUri(instructionPath.path),
            type: "instruction" /* Instruction */,
            files: [],
            name: basename(instructionPath.path),
            writable: true
          });
        }
      }
      for (const [root, files] of workspaceAgentInstructionFilesByRoot) {
        if (files.length > 0) {
          result.push({
            uri: root,
            type: "agentInstruction" /* AgentInstruction */,
            files,
            name: "",
            writable: false
          });
        }
      }
      if (userAgentInstructionFiles.length > 0) {
        result.push({
          uri: this._userHome,
          type: "agentInstruction" /* AgentInstruction */,
          files: userAgentInstructionFiles,
          name: "",
          writable: false
        });
      }
      for (const skillPath of skillDiscovery?.paths ?? []) {
        throwIfCancelled(token);
        result.push({
          uri: this._pathToUri(skillPath.path),
          type: "skill" /* Skill */,
          files: [],
          name: basename(skillPath.path),
          writable: true
        });
      }
    } catch (err) {
      if (err instanceof CancellationError) {
        throw err;
      }
      this._logService.debug(`[SessionCustomizationDiscovery] Error getting discovery paths: ${err instanceof Error ? err.message : String(err)}`);
    }
    return result.sort(compareDiscoveredDirectory);
  }
  getHooksDiscoveryPaths() {
    const byUri = new ResourceMap();
    const add = (uri, name) => {
      if (!byUri.has(uri)) {
        byUri.set(uri, { uri, type: "hook" /* Hook */, files: [], name, writable: true });
      }
    };
    for (const root of searchRoots.workspace) {
      if (root.type === "hook" /* Hook */) {
        for (const workingDirectory of this._hookWorkingDirectories) {
          add(joinPath(workingDirectory, ...root.path), root.name);
        }
      }
    }
    for (const root of searchRoots.user) {
      if (root.type === "hook" /* Hook */) {
        add(joinPath(this._userHome, ...root.path), root.name);
      }
    }
    for (const root of fixedDiscoveryFiles.workspace) {
      if (root.type === "hook" /* Hook */) {
        for (const workingDirectory of this._hookWorkingDirectories) {
          add(joinPath(workingDirectory, ...root.path), basename(joinPath(workingDirectory, ...root.path).path));
        }
      }
    }
    for (const root of fixedDiscoveryFiles.user) {
      if (root.type === "hook" /* Hook */) {
        add(joinPath(this._userHome, ...root.path), basename(joinPath(this._userHome, ...root.path).path));
      }
    }
    return [...byUri.values()];
  }
  async _updateWatchers(discoveredDirectories, token) {
    const nextWatchRootUris = new ResourceMap();
    const toResolve = new ResourceSet();
    const recursiveByDirectory = new ResourceMap();
    for (const discoveredDir of discoveredDirectories) {
      throwIfCancelled(token);
      const dirUri = discoveredDir.uri;
      const recursive = discoveredDir.type === "skill" /* Skill */ || discoveredDir.type === "instruction" /* Instruction */ || discoveredDir.type === "hook" /* Hook */;
      recursiveByDirectory.set(dirUri, recursive);
      toResolve.add(dirUri);
      let current = dirUri;
      while (!this._isDiscoveryBoundary(current)) {
        const parent = uriDirname(current);
        if (extUriBiasedIgnorePathCase.isEqual(parent, current)) {
          break;
        }
        toResolve.add(parent);
        current = parent;
      }
      for (const file of discoveredDir.files) {
        throwIfCancelled(token);
        let currentFilePath = file.uri;
        while (!this._isDiscoveryBoundary(currentFilePath)) {
          const parent = uriDirname(currentFilePath);
          if (extUriBiasedIgnorePathCase.isEqual(parent, currentFilePath)) {
            break;
          }
          toResolve.add(parent);
          currentFilePath = parent;
        }
      }
    }
    throwIfCancelled(token);
    const toResolveArray = [...toResolve];
    const statResults = await this._fileService.resolveAll(toResolveArray.map((resource) => ({ resource })));
    const existingDirectories = new ResourceSet();
    for (let i = 0; i < statResults.length; i++) {
      const result = statResults[i];
      if (result.success && result.stat?.isDirectory) {
        existingDirectories.add(toResolveArray[i]);
      }
    }
    for (const discoveredDir of discoveredDirectories) {
      throwIfCancelled(token);
      const dirUri = discoveredDir.uri;
      const recursive = recursiveByDirectory.get(dirUri) ?? false;
      if (existingDirectories.has(dirUri)) {
        addWatch(nextWatchRootUris, dirUri, recursive, dirUri);
      }
      let current = dirUri;
      while (!this._isDiscoveryBoundary(current)) {
        const parent = uriDirname(current);
        if (extUriBiasedIgnorePathCase.isEqual(parent, current)) {
          break;
        }
        if (existingDirectories.has(parent)) {
          addWatch(nextWatchRootUris, parent, false, current);
        }
        current = parent;
      }
      for (const file of discoveredDir.files) {
        throwIfCancelled(token);
        let currentFilePath = file.uri;
        while (!this._isDiscoveryBoundary(currentFilePath)) {
          const parent = uriDirname(currentFilePath);
          if (extUriBiasedIgnorePathCase.isEqual(parent, currentFilePath)) {
            break;
          }
          if (existingDirectories.has(parent)) {
            addWatch(nextWatchRootUris, parent, false, currentFilePath);
          }
          currentFilePath = parent;
        }
      }
    }
    this._reconcileWatchers(nextWatchRootUris);
  }
  async discover(client, token) {
    await this.writeCustomizationDiscoveryDebugLog({
      method: "discover",
      workingDirectories: this._workingDirectories.map((d) => d.toString()),
      userHome: this._userHome.toString()
    });
    if (!this._discoveredDirectories) {
      this._discoveredDirectories = await this.getDiscoveredDirectories(client, token);
    }
    throwIfCancelled(token);
    const p = { projectPaths: this._workingDirectories.map((uri) => uri.fsPath) };
    try {
      const [agents, rules, skills, hooks] = await Promise.all([
        this.discoverAgents(p, client, token),
        this.discoverRules(p, client, token),
        this.discoverSkills(p, client, token),
        this.discoverHooks(token),
        this._updateWatchers(this._discoveredDirectories, token)
      ]);
      throwIfCancelled(token);
      const result = [];
      await this.toDirectoryCustomizations(CustomizationType.Agent, agents, this._discoveredDirectories, result);
      await this.toDirectoryCustomizations(CustomizationType.Rule, rules, this._discoveredDirectories, result);
      await this.toDirectoryCustomizations(CustomizationType.Skill, skills, this._discoveredDirectories, result);
      await this.toDirectoryCustomizations(CustomizationType.Hook, hooks, this._discoveredDirectories, result);
      const sortedResult = result.sort(compareDirectoryCustomization);
      await this.writeCustomizationDiscoveryDebugLog({
        method: "discover",
        result: sortedResult.map((customization) => ({
          contents: customization.contents,
          uri: customization.uri,
          children: (customization.children ?? []).map((child) => ({ type: child.type, uri: child.uri, name: child.name }))
        }))
      });
      return sortedResult;
    } catch (err) {
      this._logService.error(`[SessionCustomizationDiscovery] Error during discovery: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }
  async discoverAgents(discoveryRequest, client, token) {
    const agents = [];
    const agentDiscovery = await raceCancellationError(client.rpc.agents.discover(discoveryRequest), token);
    for (const agent of agentDiscovery.agents) {
      if (agent.path) {
        const uri = this._pathToUri(agent.path);
        agents.push({ type: CustomizationType.Agent, uri: uri.toString(), id: agent.id, name: agent.name, description: agent.description, _meta: toAgentCustomizationMeta({ userInvocable: agent.userInvocable }) });
      }
    }
    return agents;
  }
  async discoverRules(discoveryRequest, client, token) {
    const rules = [];
    const seenRuleUris = /* @__PURE__ */ new Set();
    const instructionDiscovery = await raceCancellationError(client.rpc.instructions.discover(discoveryRequest), token);
    await this.writeCustomizationDiscoveryDebugLog({
      method: "discoverRules.instructions.discover",
      sources: instructionDiscovery.sources.map((source) => ({
        id: source.id,
        label: source.label,
        sourcePath: source.sourcePath,
        applyTo: source.applyTo,
        type: source.type
      }))
    });
    for (const instruction of instructionDiscovery.sources) {
      let uri;
      if (isAbsolute(instruction.sourcePath)) {
        uri = this._pathToUri(instruction.sourcePath);
      } else {
        const anchor = this._rootForProjectPath(instruction.projectPath) ?? this._workingDirectories[0];
        uri = joinPath(anchor, instruction.sourcePath);
      }
      const uriString = uri.toString();
      rules.push({
        type: CustomizationType.Rule,
        uri: uriString,
        id: instruction.id,
        name: instruction.label,
        description: instruction.description,
        globs: instruction.applyTo ? [...instruction.applyTo] : void 0,
        alwaysApply: this._isAgentInstructionSource(instruction)
      });
      seenRuleUris.add(uriString);
    }
    for (const directory of this._discoveredDirectories ?? []) {
      if (directory.type !== "agentInstruction" /* AgentInstruction */) {
        continue;
      }
      for (const file of directory.files) {
        const uri = file.uri.toString();
        if (seenRuleUris.has(uri)) {
          continue;
        }
        rules.push({
          type: CustomizationType.Rule,
          uri,
          id: customizationId(uri),
          name: basename(file.uri.path),
          alwaysApply: true
        });
        seenRuleUris.add(uri);
      }
    }
    return rules;
  }
  _isAgentInstructionSource(instruction) {
    if (instruction.type === "home" || instruction.type === "repo" || instruction.type === "model") {
      return true;
    }
    const filename = basename(instruction.sourcePath).toLowerCase();
    return AGENT_INSTRUCTION_FILENAMES.has(filename);
  }
  async discoverSkills(discoveryRequest, client, token) {
    const skills = [];
    const skillDiscovery = await raceCancellationError(client.rpc.skills.discover(discoveryRequest), token);
    for (const skill of skillDiscovery.skills) {
      if (skill.path) {
        const uri = this._pathToUri(skill.path);
        skills.push({ type: CustomizationType.Skill, uri: uri.toString(), id: skill.path, name: skill.name, description: skill.description });
      }
    }
    return skills;
  }
  async discoverHooks(token) {
    const seen = new ResourceSet();
    const discoveredDirectories = [];
    const hookRootsWorkspace = searchRoots.workspace.filter((root) => root.type === "hook" /* Hook */);
    const hookRootsUser = searchRoots.user.filter((root) => root.type === "hook" /* Hook */);
    const fixedHookFilesWorkspace = fixedDiscoveryFiles.workspace.filter((root) => root.type === "hook" /* Hook */);
    const fixedHookFilesUser = fixedDiscoveryFiles.user.filter((root) => root.type === "hook" /* Hook */);
    await Promise.all([
      // Hooks: primary working directory only (Copilot limitation — see _hookWorkingDirectories).
      ...this._hookWorkingDirectories.flatMap((workingDirectory) => hookRootsWorkspace.map((root) => this._discoverHookRoot(workingDirectory, root, seen, discoveredDirectories, token))),
      ...hookRootsUser.map((root) => this._discoverHookRoot(this._userHome, root, seen, discoveredDirectories, token)),
      ...this._hookWorkingDirectories.map((workingDirectory) => this._discoverFixedHookFiles(workingDirectory, fixedHookFilesWorkspace, seen, discoveredDirectories, token)),
      this._discoverFixedHookFiles(this._userHome, fixedHookFilesUser, seen, discoveredDirectories, token)
    ]);
    const hooks = [];
    for (const directory of discoveredDirectories) {
      for (const file of directory.files) {
        const uri = file.uri.toString();
        hooks.push({
          type: CustomizationType.Hook,
          id: customizationId(uri),
          uri,
          name: basename(file.uri.path)
        });
      }
    }
    hooks.sort((a, b) => compareStrings(a.uri, b.uri));
    return hooks;
  }
  async _discoverHookRoot(base, root, seen, result, token) {
    const rootUri = joinPath(base, ...root.path);
    let stat = void 0;
    try {
      stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
    } catch {
    }
    await this._scanForHooks(root, rootUri, stat, seen, result, token);
  }
  async _discoverFixedHookFiles(base, roots, seen, result, token) {
    for (const root of roots) {
      throwIfCancelled(token);
      const rootUri = joinPath(base, ...root.path);
      const files = [];
      let stat = void 0;
      try {
        stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
      } catch {
      }
      for (const child of stat?.children ?? []) {
        throwIfCancelled(token);
        if (child.isFile && root.filenames.includes(child.name)) {
          if (!seen.has(child.resource)) {
            seen.add(child.resource);
            files.push({ uri: child.resource, etag: child.etag });
          }
        }
      }
      if (files.length > 0) {
        result.push({ uri: rootUri, type: "hook" /* Hook */, files: files.sort(compareDiscoveredFile), name: basename(rootUri.path), writable: true });
      }
    }
  }
  async toDirectoryCustomizations(type, customizations, allDiscoveredDirectories, result) {
    const discoveredDirectories = allDiscoveredDirectories.filter((d) => {
      if (type === CustomizationType.Agent) {
        return d.type === "agent" /* Agent */;
      }
      if (type === CustomizationType.Rule) {
        return d.type === "instruction" /* Instruction */ || d.type === "agentInstruction" /* AgentInstruction */;
      }
      if (type === CustomizationType.Hook) {
        return d.type === "hook" /* Hook */;
      }
      return d.type === "skill" /* Skill */;
    });
    const candidateOutputDirectories = type === CustomizationType.Rule ? discoveredDirectories.filter((d) => d.type !== "agentInstruction" /* AgentInstruction */ || this._isDiscoveryBoundary(d.uri)) : discoveredDirectories;
    const outputDirectories = type === CustomizationType.Skill ? candidateOutputDirectories.filter((directory) => !candidateOutputDirectories.some(
      (candidate) => !extUriBiasedIgnorePathCase.isEqual(directory.uri, candidate.uri) && extUriBiasedIgnorePathCase.isEqualOrParent(directory.uri, candidate.uri)
    )) : candidateOutputDirectories;
    const byParent = new ResourceMap();
    for (const discoveredDirectory of outputDirectories) {
      byParent.set(discoveredDirectory.uri, {
        uri: discoveredDirectory.uri,
        name: discoveredDirectory.name || basename(discoveredDirectory.uri.path),
        writable: discoveredDirectory.writable,
        children: []
      });
    }
    const fixedHookDirectoryUris = type === CustomizationType.Hook ? new ResourceSet([
      // Hooks: primary working directory only (Copilot limitation).
      ...this._hookWorkingDirectories.flatMap((workingDirectory) => fixedDiscoveryFiles.workspace.filter((root) => root.type === "hook" /* Hook */).map((root) => joinPath(workingDirectory, ...root.path))),
      ...fixedDiscoveryFiles.user.filter((root) => root.type === "hook" /* Hook */).map((root) => joinPath(this._userHome, ...root.path))
    ]) : void 0;
    const agentInstructionDirectoryUris = new ResourceSet(
      outputDirectories.filter((directory) => directory.type === "agentInstruction" /* AgentInstruction */).map((directory) => directory.uri)
    );
    for (const customization of customizations) {
      if (customization.type !== type) {
        continue;
      }
      const childUri = URI.parse(customization.uri);
      let bestParent = outputDirectories.find((d) => extUriBiasedIgnorePathCase.isEqualOrParent(childUri, d.uri));
      if (!bestParent && customization.type === CustomizationType.Rule && customization.alwaysApply && customization.name.match(/\.md$/i)) {
        bestParent = outputDirectories.find(
          (d) => d.type === "agentInstruction" /* AgentInstruction */ && extUriBiasedIgnorePathCase.isEqualOrParent(childUri, d.uri)
        ) ?? outputDirectories.find((d) => d.type === "agentInstruction" /* AgentInstruction */);
      }
      if (bestParent) {
        for (const candidate of outputDirectories) {
          if (extUriBiasedIgnorePathCase.isEqualOrParent(childUri, candidate.uri) && candidate.uri.path.length > bestParent.uri.path.length) {
            bestParent = candidate;
          }
        }
      }
      const parentUri = bestParent?.uri ?? uriDirname(childUri);
      let entry = byParent.get(parentUri);
      if (!entry) {
        this._logService.error(`[SessionCustomizationDiscovery] BUG: customization '${customization.uri}' of type '${customization.type}' is outside discovered directories; creating fallback directory '${parentUri.toString()}'.`);
        entry = {
          uri: parentUri,
          name: basename(parentUri.path),
          writable: true,
          children: []
        };
        byParent.set(parentUri, entry);
      }
      entry.children.push(customization);
    }
    for (const { uri, name, writable, children } of byParent.values()) {
      if (type === CustomizationType.Hook && fixedHookDirectoryUris?.has(uri) && children.length === 0) {
        continue;
      }
      if (type === CustomizationType.Rule && agentInstructionDirectoryUris.has(uri)) {
        const existingChildren = [];
        for (const child of children) {
          const childUri = URI.parse(child.uri);
          try {
            const stat = await this._fileService.resolve(childUri, { resolveMetadata: true });
            if (stat.isFile) {
              existingChildren.push(child);
            }
          } catch {
          }
        }
        if (existingChildren.length === 0) {
          continue;
        }
        children.length = 0;
        children.push(...existingChildren);
      }
      children.sort((a, b) => compareStrings(a.uri, b.uri));
      result.push({
        type: CustomizationType.Directory,
        id: customizationId(uri.toString()),
        uri: uri.toString(),
        name,
        enabled: true,
        contents: type,
        writable,
        load: { kind: CustomizationLoadStatus.Loaded },
        children
      });
    }
  }
  /**
   * Returns the list of discovered customization directories and files in a sorted way.
   * Also sets up watchers for all discovered root directories (recursively if specified by the root or if already watching recursively).
   * Each call performs a fresh scan scoped to the provided cancellation token.
   */
  async scan(token) {
    await this.writeCustomizationDiscoveryDebugLog({
      method: "scan",
      workingDirectories: this._workingDirectories.map((d) => d.toString()),
      userHome: this._userHome.toString()
    });
    throwIfCancelled(token);
    const nextWatchRootUris = new ResourceMap();
    const seen = new ResourceSet();
    const result = [];
    const workspaceFixedHook = fixedDiscoveryFiles.workspace.filter((root) => root.type === "hook" /* Hook */);
    const workspaceFixedNonHook = fixedDiscoveryFiles.workspace.filter((root) => root.type !== "hook" /* Hook */);
    await Promise.all([
      ...searchRoots.workspace.flatMap((root) => (root.type === "hook" /* Hook */ ? this._hookWorkingDirectories : this._workingDirectories).map((workingDirectory) => this._scanRoot(workingDirectory, root, seen, result, nextWatchRootUris, token))),
      ...searchRoots.user.map((root) => this._scanRoot(this._userHome, root, seen, result, nextWatchRootUris, token)),
      ...this._workingDirectories.map((workingDirectory) => this._scanFixedDiscoveryFiles(workingDirectory, workspaceFixedNonHook, seen, result, nextWatchRootUris, token)),
      ...this._hookWorkingDirectories.map((workingDirectory) => this._scanFixedDiscoveryFiles(workingDirectory, workspaceFixedHook, seen, result, nextWatchRootUris, token)),
      this._scanFixedDiscoveryFiles(this._userHome, fixedDiscoveryFiles.user, seen, result, nextWatchRootUris, token)
    ]);
    throwIfCancelled(token);
    this._reconcileWatchers(nextWatchRootUris);
    const sortedResult = result.sort(compareDiscoveredDirectory);
    await this.writeCustomizationDiscoveryDebugLog({
      method: "scan",
      result: sortedResult.map((directory) => ({
        type: directory.type,
        uri: directory.uri.toString(),
        files: directory.files.map((file) => file.uri.toString())
      }))
    });
    return sortedResult;
  }
  /**
   * Walk the ancestor chain of `path` from `base`. For every ancestor
   * directory that exists, register a non-recursive watcher whose trigger
   * URI is the next path segment, so the handler fires when an intermediate
   * directory (e.g. `.github`, `.github/agents`, `.copilot`) is created and
   * a re-scan is needed to pick up newly-discoverable content.
   *
   * Returns true when every ancestor exists as a directory (i.e. the leaf
   * may exist). Returns false when an ancestor is missing or not a directory,
   * in which case the caller can short-circuit.
   */
  async _watchAncestors(base, path, watchRootUris, token) {
    let current = base;
    for (const segment of path) {
      const parent = current;
      const child = joinPath(parent, segment);
      if (!watchRootUris.has(parent)) {
        throwIfCancelled(token);
        try {
          const stat = await this._fileService.resolve(parent);
          if (!stat.isDirectory) {
            return false;
          }
        } catch {
          return false;
        }
      }
      addWatch(watchRootUris, parent, false, child);
      current = child;
    }
    return true;
  }
  _reconcileWatchers(nextWatchRootUris) {
    for (const [rootUri, watcher] of this._watchers.entries()) {
      const next = nextWatchRootUris.get(rootUri);
      if (!next || next.recursive !== watcher.recursive) {
        watcher.disposable.dispose();
        this._watchers.delete(rootUri);
      }
    }
    for (const [rootUri, next] of nextWatchRootUris.entries()) {
      const existing = this._watchers.get(rootUri);
      if (existing) {
        existing.resourcesToWatch.clear();
        for (const uri of next.resourcesToWatch) {
          existing.resourcesToWatch.add(uri);
        }
        continue;
      }
      try {
        const disposable = this._fileService.watch(rootUri, { recursive: next.recursive, excludes: [] });
        this._watchers.set(rootUri, { recursive: next.recursive, resourcesToWatch: next.resourcesToWatch, disposable });
      } catch (err) {
        this._logService.warn(`[SessionCustomizationDiscovery] Failed to watch '${rootUri.toString()}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  _disposeAllWatchers() {
    for (const watcher of this._watchers.values()) {
      watcher.disposable.dispose();
    }
    this._watchers.clear();
  }
  /**
   * For fixed discovery files (e.g. AGENTS.md, copilot-instructions.md,
   * settings.json), create one discovered directory per type at the base.
   */
  async _scanFixedDiscoveryFiles(base, roots, seen, result, watchRootUris, token) {
    const filesByType = /* @__PURE__ */ new Map();
    await Promise.all(roots.map(async (root) => {
      throwIfCancelled(token);
      if (!await this._watchAncestors(base, root.path, watchRootUris, token)) {
        return;
      }
      const rootUri = joinPath(base, ...root.path);
      let stat;
      try {
        stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
      } catch {
        return;
      }
      if (!stat.isDirectory || !stat.children) {
        return;
      }
      for (const filename of root.filenames) {
        addWatch(watchRootUris, rootUri, false, joinPath(rootUri, filename));
      }
      for (const entry of stat.children) {
        throwIfCancelled(token);
        if (entry.isFile && root.filenames.includes(entry.name)) {
          const uri = joinPath(rootUri, entry.name);
          if (!seen.has(uri)) {
            seen.add(uri);
            const files = filesByType.get(root.type) ?? [];
            files.push({ uri, etag: entry.etag });
            filesByType.set(root.type, files);
          }
        }
      }
    }));
    for (const [type, files] of filesByType.entries()) {
      if (files.length > 0) {
        result.push({ uri: base, type, files: files.sort(compareDiscoveredFile), name: "", writable: false });
      }
    }
  }
  async _scanRoot(base, root, seen, result, watchRootUris, token) {
    throwIfCancelled(token);
    const rootUri = joinPath(base, ...root.path);
    let stat = void 0;
    let children = [];
    try {
      stat = await this._fileService.resolve(rootUri, { resolveMetadata: true });
      children = stat.children ?? [];
    } catch {
    }
    await this._watchAncestors(base, root.path, watchRootUris, token);
    addWatch(watchRootUris, rootUri, root.recursive ?? false, rootUri);
    if (root.type === "skill" /* Skill */) {
      const files = [];
      await Promise.all(children.map(async (child) => {
        throwIfCancelled(token);
        if (child.isDirectory) {
          const skillFile = joinPath(child.resource, SKILL_FILENAME);
          try {
            const skillStat = await this._fileService.resolve(skillFile, { resolveMetadata: true });
            if (skillStat.isFile && !seen.has(skillFile)) {
              seen.add(skillFile);
              files.push({ uri: skillFile, etag: skillStat.etag });
            }
          } catch {
          }
        }
      }));
      result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
    } else if (root.type === "agent" /* Agent */) {
      const files = [];
      for (const child of children) {
        throwIfCancelled(token);
        if (child.isFile) {
          const filename = child.name;
          if (filename.endsWith(MARKDOWN_SUFFIX) && filename !== README_FILENAME && !seen.has(child.resource)) {
            seen.add(child.resource);
            files.push({ uri: child.resource, etag: child.etag });
          }
        }
      }
      result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
    } else if (root.type === "instruction" /* Instruction */) {
      const files = [];
      const findInstructions = async (stat2, recursionLevel) => {
        throwIfCancelled(token);
        for (const child of stat2.children ?? []) {
          throwIfCancelled(token);
          if (child.isFile) {
            const name = child.name.toLowerCase();
            if (name.endsWith(INSTRUCTION_FILE_SUFFIX) && !seen.has(child.resource)) {
              seen.add(child.resource);
              files.push({ uri: child.resource, etag: child.etag });
            }
          } else if (child.isDirectory && recursionLevel < MAX_INSTRUCTIONS_RECURSION_DEPTH) {
            let childStat = void 0;
            try {
              childStat = await this._fileService.resolve(child.resource, { resolveMetadata: true });
            } catch {
            }
            if (childStat) {
              await findInstructions(childStat, recursionLevel + 1);
            }
          }
        }
      };
      if (stat) {
        await findInstructions(stat, 0);
      }
      result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
    } else if (root.type === "hook" /* Hook */) {
      await this._scanForHooks(root, rootUri, stat, seen, result, token);
    } else {
      this._logService.warn(`[SessionCustomizationDiscovery] Unrecognized root type '${root.type}' for root '${rootUri.toString()}'`);
    }
  }
  async _scanForHooks(root, rootUri, stat, seen, result, token) {
    const files = [];
    const findHooks = async (directoryStat, recursionLevel) => {
      throwIfCancelled(token);
      for (const child of directoryStat.children ?? []) {
        throwIfCancelled(token);
        if (child.isFile) {
          const name = child.name.toLowerCase();
          if (name.endsWith(HOOK_FILE_SUFFIX) && !seen.has(child.resource)) {
            seen.add(child.resource);
            files.push({ uri: child.resource, etag: child.etag });
          }
        } else if (child.isDirectory && recursionLevel < MAX_HOOKS_RECURSION_DEPTH) {
          let childStat = void 0;
          try {
            childStat = await this._fileService.resolve(child.resource, { resolveMetadata: true });
          } catch {
          }
          if (childStat) {
            await findHooks(childStat, recursionLevel + 1);
          }
        }
      }
    };
    if (stat) {
      await findHooks(stat, 0);
    }
    result.push({ uri: rootUri, type: root.type, files: files.sort(compareDiscoveredFile), name: root.name, writable: true });
  }
};
SessionCustomizationDiscovery = __decorateClass([
  __decorateParam(3, IFileService),
  __decorateParam(4, ILogService)
], SessionCustomizationDiscovery);
const _internal = {
  AGENT_FILE_SUFFIX,
  INSTRUCTION_FILE_SUFFIX,
  SKILL_FILENAME,
  searchRoots,
  fixedDiscoveryFiles,
  agentInstructions
};
export {
  DiscoveredType,
  SessionCustomizationDiscovery,
  _internal,
  areDiscoveredDirectoriesEqual
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3Qvc2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IENvcGlsb3RDbGllbnQgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCB7IGFwcGVuZEZpbGUsIG1rZGlyIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0eXBlIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCwgZGlybmFtZSBhcyB1cmlEaXJuYW1lLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIGFzIGNvbXBhcmVTdHJpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGlzQWJzb2x1dGUsIGRpcm5hbWUgYXMgbm9kZURpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBBZ2VudHNEaXNjb3ZlclJlcXVlc3QsIEluc3RydWN0aW9uU291cmNlIH0gZnJvbSAnLi9jb3BpbG90UkNQLmpzJztcbmltcG9ydCB7IEFnZW50Q3VzdG9taXphdGlvbiwgQ2hpbGRDdXN0b21pemF0aW9uLCBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgQ3VzdG9taXphdGlvblR5cGUsIERpcmVjdG9yeUN1c3RvbWl6YXRpb24sIEhvb2tDdXN0b21pemF0aW9uLCBSdWxlQ3VzdG9taXphdGlvbiwgU2tpbGxDdXN0b21pemF0aW9uLCBjdXN0b21pemF0aW9uSWQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IENoaWxkQ3VzdG9taXphdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgdG9BZ2VudEN1c3RvbWl6YXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRDdXN0b21pemF0aW9uTWV0YS5qcyc7XG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbi8qKlxuICogVGhlIGtpbmRzIG9mIGN1c3RvbWl6YXRpb25zIHRoZSBhZ2VudCBob3N0IGRpc2NvdmVycyBmcm9tIGRpc2suXG4gKlxuICogUmUtZGVjbGFyZWQgb24gdGhlIHBsYXRmb3JtIHNpZGUgc28gdGhpcyBtb2R1bGUgaGFzIG5vIGRlcGVuZGVuY3kgb24gdGhlXG4gKiB3b3JrYmVuY2gtc2lkZSBgUHJvbXB0c1R5cGVgIGVudW0uXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIERpc2NvdmVyZWRUeXBlIHtcblx0QWdlbnQgPSAnYWdlbnQnLFxuXHRTa2lsbCA9ICdza2lsbCcsXG5cdEluc3RydWN0aW9uID0gJ2luc3RydWN0aW9uJyxcblx0SG9vayA9ICdob29rJyxcblx0QWdlbnRJbnN0cnVjdGlvbiA9ICdhZ2VudEluc3RydWN0aW9uJyxcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlzY292ZXJlZERpcmVjdG9yeSB7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSB0eXBlOiBEaXNjb3ZlcmVkVHlwZTtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSB3cml0YWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgZmlsZXM6IHJlYWRvbmx5IElEaXNjb3ZlcmVkRmlsZVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaXNjb3ZlcmVkRmlsZSB7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBldGFnOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcmVEaXNjb3ZlcmVkRGlyZWN0b3JpZXNFcXVhbChhOiByZWFkb25seSBJRGlzY292ZXJlZERpcmVjdG9yeVtdLCBiOiByZWFkb25seSBJRGlzY292ZXJlZERpcmVjdG9yeVtdKTogYm9vbGVhbiB7XG5cdGlmIChhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBsZWZ0ID0gYVtpXTtcblx0XHRjb25zdCByaWdodCA9IGJbaV07XG5cdFx0aWYgKGxlZnQudHlwZSAhPT0gcmlnaHQudHlwZSB8fCBsZWZ0LnVyaS50b1N0cmluZygpICE9PSByaWdodC51cmkudG9TdHJpbmcoKSB8fCAhYXJlRGlzY292ZXJlZEZpbGVzRXF1YWwobGVmdC5maWxlcywgcmlnaHQuZmlsZXMpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVEaXNjb3ZlcmVkRGlyZWN0b3J5KGE6IElEaXNjb3ZlcmVkRGlyZWN0b3J5LCBiOiBJRGlzY292ZXJlZERpcmVjdG9yeSk6IG51bWJlciB7XG5cdGNvbnN0IGJ5VHlwZSA9IGNvbXBhcmVTdHJpbmdzKGEudHlwZSwgYi50eXBlKTtcblx0aWYgKGJ5VHlwZSAhPT0gMCkge1xuXHRcdHJldHVybiBieVR5cGU7XG5cdH1cblx0cmV0dXJuIGNvbXBhcmVTdHJpbmdzKGEudXJpLnRvU3RyaW5nKCksIGIudXJpLnRvU3RyaW5nKCkpO1xufVxuXG5mdW5jdGlvbiBhcmVEaXNjb3ZlcmVkRmlsZXNFcXVhbChhOiByZWFkb25seSBJRGlzY292ZXJlZEZpbGVbXSwgYjogcmVhZG9ubHkgSURpc2NvdmVyZWRGaWxlW10pOiBib29sZWFuIHtcblx0aWYgKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYS5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IGxlZnQgPSBhW2ldO1xuXHRcdGNvbnN0IHJpZ2h0ID0gYltpXTtcblx0XHRpZiAobGVmdC51cmkudG9TdHJpbmcoKSAhPT0gcmlnaHQudXJpLnRvU3RyaW5nKCkgfHwgbGVmdC5ldGFnICE9PSByaWdodC5ldGFnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVEaXNjb3ZlcmVkRmlsZShhOiBJRGlzY292ZXJlZEZpbGUsIGI6IElEaXNjb3ZlcmVkRmlsZSk6IG51bWJlciB7XG5cdHJldHVybiBjb21wYXJlU3RyaW5ncyhhLnVyaS50b1N0cmluZygpLCBiLnVyaS50b1N0cmluZygpKTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZURpcmVjdG9yeUN1c3RvbWl6YXRpb24oYTogRGlyZWN0b3J5Q3VzdG9taXphdGlvbiwgYjogRGlyZWN0b3J5Q3VzdG9taXphdGlvbik6IG51bWJlciB7XG5cdGNvbnN0IGJ5VXJpID0gY29tcGFyZVN0cmluZ3MoYS51cmksIGIudXJpKTtcblx0aWYgKGJ5VXJpICE9PSAwKSB7XG5cdFx0cmV0dXJuIGJ5VXJpO1xuXHR9XG5cdHJldHVybiBjb21wYXJlU3RyaW5ncyhhLmNvbnRlbnRzLCBiLmNvbnRlbnRzKTtcbn1cblxuLyoqXG4gKiBNYXhpbXVtIHJlY3Vyc2lvbiBkZXB0aCB3aGVuIHRyYXZlcnNpbmcgc3ViZGlyZWN0b3JpZXMgZm9yIGluc3RydWN0aW9uIGZpbGVzLlxuICovXG5jb25zdCBNQVhfSU5TVFJVQ1RJT05TX1JFQ1VSU0lPTl9ERVBUSCA9IDU7XG5jb25zdCBNQVhfSE9PS1NfUkVDVVJTSU9OX0RFUFRIID0gODtcblxuY29uc3QgQUdFTlRfRklMRV9TVUZGSVggPSAnLmFnZW50Lm1kJztcbmNvbnN0IE1BUktET1dOX1NVRkZJWCA9ICcubWQnO1xuY29uc3QgSU5TVFJVQ1RJT05fRklMRV9TVUZGSVggPSAnLmluc3RydWN0aW9ucy5tZCc7XG5jb25zdCBIT09LX0ZJTEVfU1VGRklYID0gJy5qc29uJztcbmNvbnN0IFNLSUxMX0ZJTEVOQU1FID0gJ1NLSUxMLm1kJztcbmNvbnN0IFJFQURNRV9GSUxFTkFNRSA9ICdSRUFETUUubWQnO1xuY29uc3QgQ1VTVE9NSVpBVElPTl9ESVNDT1ZFUllfREVCVUdfTE9HX1BBVEggPSB1bmRlZmluZWQ7IC8vJy90bXAvY29waWxvdC1jdXN0b21pemF0aW9uLWRpc2NvdmVyeS1kZWJ1Zy5sb2cnO1xuY29uc3QgQUdFTlRfSU5TVFJVQ1RJT05fRklMRU5BTUVTID0gbmV3IFNldChbJ2FnZW50cy5tZCcsICdjbGF1ZGUubWQnLCAnZ2VtaW5pLm1kJywgJ2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJ10pO1xuXG5pbnRlcmZhY2UgSVNlYXJjaFJvb3Qge1xuXHRyZWFkb25seSBwYXRoOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgdHlwZTogRGlzY292ZXJlZFR5cGU7XG5cdHJlYWRvbmx5IHJlY3Vyc2l2ZT86IGJvb2xlYW47IC8vIHdoZXRoZXIgdG8gd2F0Y2ggcmVjdXJzaXZlbHkgZm9yIGNoYW5nZXMgKGRlZmF1bHRzIHRvIGZhbHNlKVxuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJRml4ZWREaXNjb3ZlcnlGaWxlIHtcblx0cmVhZG9ubHkgcGF0aDogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGZpbGVuYW1lczogc3RyaW5nW107XG5cdHJlYWRvbmx5IHR5cGU6IERpc2NvdmVyZWRUeXBlO1xufVxuXG50eXBlIFBhdGhUb1VyaSA9IChwYXRoOiBzdHJpbmcpID0+IFVSSTtcblxuLyoqXG4gKiBCdWlsZHMgdGhlIGxpc3Qgb2Ygc2VhcmNoIHJvb3RzIGZvciBhIGdpdmVuIHdvcmtpbmcgZGlyZWN0b3J5IGFuZCB1c2VyIGhvbWUuXG4gKiBTa2lsbHMgcmVxdWlyZSBhIGRlcHRoLTIgc2NhbiAoYDxza2lsbERpcj4vU0tJTEwubWRgKSwgYWdlbnRzIGFyZSBzY2FubmVkIGF0XG4gKiBhIHNpbmdsZSBkaXJlY3RvcnkgZGVwdGgsIGFuZCBpbnN0cnVjdGlvbnMvaG9va3MgYXJlIHJlY3Vyc2l2ZWx5IHNjYW5uZWQuXG4gKi9cbmNvbnN0IHNlYXJjaFJvb3RzOiB7IHdvcmtzcGFjZTogSVNlYXJjaFJvb3RbXTsgdXNlcjogSVNlYXJjaFJvb3RbXSB9ID0ge1xuXHR3b3Jrc3BhY2U6IFtcblx0XHR7IHBhdGg6IFsnLmdpdGh1YicsICdhZ2VudHMnXSwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQsIG5hbWU6ICcuZ2l0aHViJyB9LFxuXHRcdHsgcGF0aDogWycuY2xhdWRlJywgJ2FnZW50cyddLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCwgbmFtZTogJy5jbGF1ZGUnIH0sXG5cdFx0eyBwYXRoOiBbJy5naXRodWInLCAnc2tpbGxzJ10sIHJlY3Vyc2l2ZTogdHJ1ZSwgdHlwZTogRGlzY292ZXJlZFR5cGUuU2tpbGwsIG5hbWU6ICcuZ2l0aHViJyB9LFxuXHRcdHsgcGF0aDogWycuYWdlbnRzJywgJ3NraWxscyddLCByZWN1cnNpdmU6IHRydWUsIHR5cGU6IERpc2NvdmVyZWRUeXBlLlNraWxsLCBuYW1lOiAnLmFnZW50cycgfSxcblx0XHR7IHBhdGg6IFsnLmNsYXVkZScsICdza2lsbHMnXSwgcmVjdXJzaXZlOiB0cnVlLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCwgbmFtZTogJy5jbGF1ZGUnIH0sXG5cdFx0eyBwYXRoOiBbJy5naXRodWInLCAnaW5zdHJ1Y3Rpb25zJ10sIHJlY3Vyc2l2ZTogdHJ1ZSwgdHlwZTogRGlzY292ZXJlZFR5cGUuSW5zdHJ1Y3Rpb24sIG5hbWU6ICcuZ2l0aHViJyB9LFxuXHRcdHsgcGF0aDogWycuZ2l0aHViJywgJ2hvb2tzJ10sIHJlY3Vyc2l2ZTogdHJ1ZSwgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vaywgbmFtZTogJy5naXRodWInIH0sXG5cblx0XSxcblx0dXNlcjogW1xuXHRcdHsgcGF0aDogWycuY29waWxvdCcsICdhZ2VudHMnXSwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQsIG5hbWU6ICd+Ly5jb3BpbG90JyB9LFxuXHRcdHsgcGF0aDogWycuYWdlbnRzJywgJ3NraWxscyddLCByZWN1cnNpdmU6IHRydWUsIHR5cGU6IERpc2NvdmVyZWRUeXBlLlNraWxsLCBuYW1lOiAnfi8uYWdlbnRzJyB9LFxuXHRcdHsgcGF0aDogWycuY29waWxvdCcsICdza2lsbHMnXSwgcmVjdXJzaXZlOiB0cnVlLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCwgbmFtZTogJ34vLmNvcGlsb3QnIH0sXG5cdFx0eyBwYXRoOiBbJy5jb3BpbG90JywgJ2luc3RydWN0aW9ucyddLCByZWN1cnNpdmU6IHRydWUsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkluc3RydWN0aW9uLCBuYW1lOiAnfi8uY29waWxvdCcgfSxcblx0XHR7IHBhdGg6IFsnLmNvcGlsb3QnLCAnaG9va3MnXSwgcmVjdXJzaXZlOiB0cnVlLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ib29rLCBuYW1lOiAnfi8uY29waWxvdCcgfSxcblx0XSxcbn07XG5cblxuLyoqXG4gKiBCdWlsZHMgdGhlIGxpc3Qgb2YgaW5zdHJ1Y3Rpb24gZmlsZSBjYW5kaWRhdGVzIHVzZWQgYnkgdGhlIENvcGlsb3QgQ0xJLlxuICpcbiAqIFJldHVybnMgcGF0aHMgd2l0aCBmaWxlbmFtZXMgZm9yIHdvcmtzcGFjZSBhbmQgdXNlci1ob21lXG4gKiBsb2NhdGlvbnNcbiAqL1xuY29uc3QgZml4ZWREaXNjb3ZlcnlGaWxlczogeyB3b3Jrc3BhY2U6IElGaXhlZERpc2NvdmVyeUZpbGVbXTsgdXNlcjogSUZpeGVkRGlzY292ZXJ5RmlsZVtdIH0gPSB7XG5cdHdvcmtzcGFjZTogW1xuXHRcdHsgcGF0aDogWycuZ2l0aHViJ10sIGZpbGVuYW1lczogWydjb3BpbG90LWluc3RydWN0aW9ucy5tZCddLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uIH0sXG5cdFx0eyBwYXRoOiBbXSwgZmlsZW5hbWVzOiBbJ0FHRU5UUy5tZCcsICdDTEFVREUubWQnLCAnR0VNSU5JLm1kJ10sIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb24gfSxcblx0XHR7IHBhdGg6IFsnLmNsYXVkZSddLCBmaWxlbmFtZXM6IFsnQ0xBVURFLm1kJ10sIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb24gfSxcblx0XHR7IHBhdGg6IFsnLmdpdGh1YicsICdjb3BpbG90J10sIGZpbGVuYW1lczogWydzZXR0aW5ncy5qc29uJywgJ3NldHRpbmdzLmxvY2FsLmpzb24nXSwgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vayB9LFxuXHRcdHsgcGF0aDogWycuY2xhdWRlJ10sIGZpbGVuYW1lczogWydzZXR0aW5ncy5qc29uJywgJ3NldHRpbmdzLmxvY2FsLmpzb24nXSwgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vayB9LFxuXHRdLFxuXHR1c2VyOiBbXG5cdFx0eyBwYXRoOiBbJy5jb3BpbG90J10sIGZpbGVuYW1lczogWydjb3BpbG90LWluc3RydWN0aW9ucy5tZCddLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uIH0sXG5cdF0sXG59O1xuXG4vLyBCYWNrLWNvbXBhdCBhbGlhcyBmb3IgdGVzdHMgYW5kIGNhbGxlcnMgdGhhdCByZWZlcmVuY2VkIHRoZSBvbGQgc3ltYm9sIG5hbWUuXG5jb25zdCBhZ2VudEluc3RydWN0aW9ucyA9IGZpeGVkRGlzY292ZXJ5RmlsZXM7XG5cbmZ1bmN0aW9uIHRocm93SWZDYW5jZWxsZWQodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogdm9pZCB7XG5cdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJV2F0Y2hTcGVjIHtcblx0cmVhZG9ubHkgcmVjdXJzaXZlOiBib29sZWFuO1xuXHRyZWFkb25seSByZXNvdXJjZXNUb1dhdGNoOiBSZXNvdXJjZVNldDtcbn1cblxuLyoqXG4gKiBSZWdpc3RlciBhIHdhdGNoZXIgZm9yIGB3YXRjaFVyaWAgYW5kIGFkZCBgcmVzb3VyY2VUb1dhdGNoYCB0byBpdHMgc2V0IG9mXG4gKiB0cmlnZ2VyIFVSSXMuIElmIGEgbm9uLXJlY3Vyc2l2ZSBlbnRyeSBhbHJlYWR5IGV4aXN0cyBhbmQgYHJlY3Vyc2l2ZWAgaXNcbiAqIHRydWUsIHVwZ3JhZGUgaXQgdG8gcmVjdXJzaXZlIHdoaWxlIHByZXNlcnZpbmcgdGhlIGFjY3VtdWxhdGVkIHRyaWdnZXIgVVJJcy5cbiAqL1xuZnVuY3Rpb24gYWRkV2F0Y2gobWFwOiBSZXNvdXJjZU1hcDxJV2F0Y2hTcGVjPiwgd2F0Y2hVcmk6IFVSSSwgcmVjdXJzaXZlOiBib29sZWFuLCByZXNvdXJjZVRvV2F0Y2g6IFVSSSk6IHZvaWQge1xuXHRsZXQgZW50cnkgPSBtYXAuZ2V0KHdhdGNoVXJpKTtcblx0aWYgKCFlbnRyeSkge1xuXHRcdGVudHJ5ID0geyByZWN1cnNpdmUsIHJlc291cmNlc1RvV2F0Y2g6IG5ldyBSZXNvdXJjZVNldCgpIH07XG5cdFx0bWFwLnNldCh3YXRjaFVyaSwgZW50cnkpO1xuXHR9IGVsc2UgaWYgKHJlY3Vyc2l2ZSAmJiAhZW50cnkucmVjdXJzaXZlKSB7XG5cdFx0ZW50cnkgPSB7IHJlY3Vyc2l2ZTogdHJ1ZSwgcmVzb3VyY2VzVG9XYXRjaDogZW50cnkucmVzb3VyY2VzVG9XYXRjaCB9O1xuXHRcdG1hcC5zZXQod2F0Y2hVcmksIGVudHJ5KTtcblx0fVxuXHRlbnRyeS5yZXNvdXJjZXNUb1dhdGNoLmFkZChyZXNvdXJjZVRvV2F0Y2gpO1xufVxuXG4vKipcbiAqIERpc2NvdmVycyBjdXN0b21pemF0aW9uIGZpbGVzIChhZ2VudHMsIHNraWxscywgaW5zdHJ1Y3Rpb25zLCBhbmQgaG9va3MpXG4gKiB1bmRlciB3ZWxsLWtub3duIGRpcmVjdG9yaWVzIG9mIHRoZSBzZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3RvcmllcyBhbmQgdGhlXG4gKiB1c2VyJ3MgaG9tZSwgYW5kIGVtaXRzIHtAbGluayBvbkRpZENoYW5nZX0gd2hlbiBhbnkgb2YgdGhvc2UgZGlyZWN0b3JpZXNcbiAqIGNoYW5nZSBvbiBkaXNrLlxuICpcbiAqXG4gKiBXb3Jrc3BhY2Ugcm9vdHMgdGFrZSBwcmVjZWRlbmNlIG92ZXIgdXNlci1ob21lIHJvb3RzIHdoZW4gdGhlIHNhbWUgVVJJIGlzXG4gKiBkaXNjb3ZlcmVkIHRocm91Z2ggbXVsdGlwbGUgcGF0aHMgKGRlLWR1cGVkIGJ5IFVSSSkuXG4gKlxuICogYF93b3JraW5nRGlyZWN0b3JpZXNgIE1VU1QgYmUgKipub24tZW1wdHkqKiBhbmQgKipwcmltYXJ5LWZpcnN0Kio6IGluZGV4IDAgaXNcbiAqIHRoZSBwcmltYXJ5IHJvb3QgKHRoZSBwcm9jZXNzIGN3ZCAvIHdvcmt0cmVlKSBhbmQgaXMgdXNlZCBhcyB0aGUgYW5jaG9yIGZvclxuICogc291cmNlcyB0aGUgU0RLIGRvZXMgbm90IGF0dHJpYnV0ZSB0byBhIHNwZWNpZmljIHJvb3QgKHNlZSB7QGxpbmsgZGlzY292ZXJSdWxlc30pXG4gKiBhbmQgYXMgdGhlIHNvbGUgcm9vdCBmb3IgaG9va3MgKHNlZSB7QGxpbmsgX2hvb2tXb3JraW5nRGlyZWN0b3JpZXN9KTsgaW5kaWNlc1xuICogMS4uTiBhcmUgdGhlIGFkZGl0aW9uYWwgbXVsdGktcm9vdCBmb2xkZXJzLiBUaGUgY29uc3RydWN0b3IgYXNzZXJ0cyB0aGlzIHNvIGFcbiAqIGNhbGxlciB0aGF0IHBhc3NlcyBhbiBlbXB0eSBzZXQgZmFpbHMgZmFzdCB3aXRoIGEgY2xlYXIgZXJyb3IgaW5zdGVhZCBvZiBhXG4gKiBjb25mdXNpbmcgYHVuZGVmaW5lZGAtcm9vdCBjcmFzaCBkZWVwIGluc2lkZSBkaXNjb3ZlcnkuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgX2Rpc2NvdmVyZWREaXJlY3RvcmllczogcmVhZG9ubHkgSURpc2NvdmVyZWREaXJlY3RvcnlbXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93YXRjaGVycyA9IG5ldyBSZXNvdXJjZU1hcDxJV2F0Y2hTcGVjICYgeyByZWFkb25seSBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdXNlckhvbWU6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wYXRoVG9Vcmk6IFBhdGhUb1VyaSA9IFVSSS5maWxlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0aWYgKF93b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBEaXNwb3NlIHRoZSBiYXNlIHN0b3JlIGJlZm9yZSB0aHJvd2luZyBzbyBhIHJlamVjdGVkIGNvbnN0cnVjdGlvblxuXHRcdFx0Ly8gZG9lcyBub3QgbGVhayBhIHRyYWNrZWQgKG5ldmVyLWRpc3Bvc2VkKSBkaXNwb3NhYmxlLlxuXHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5IHJlcXVpcmVzIGF0IGxlYXN0IG9uZSB3b3JraW5nIGRpcmVjdG9yeSAoaW5kZXggMCA9IHByaW1hcnkgcm9vdCkuJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gdGhpcy5fZGlzcG9zZUFsbFdhdGNoZXJzKCkgfSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGZvciAoY29uc3Qgd2F0Y2hlciBvZiB0aGlzLl93YXRjaGVycy52YWx1ZXMoKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiB3YXRjaGVyLnJlc291cmNlc1RvV2F0Y2gpIHtcblx0XHRcdFx0XHRpZiAoZS5hZmZlY3RzKHVyaSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlUmVmcmVzaCgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlUmVmcmVzaCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJ1ZSB3aGVuIGB1cmlgIGlzIG9uZSBvZiB0aGUgd29ya3NwYWNlIHJvb3RzIG9yIHRoZSB1c2VyIGhvbWUgXHUyMDE0IGkuZS4gYW5cblx0ICogYW5jZXN0b3Itd2FsayBib3VuZGFyeS4gV2l0aCBhIHNpbmdsZSByb290IHRoaXMgaXMgZXhhY3RseSB0aGUgcHJldmlvdXNcblx0ICogYGlzRXF1YWwodXJpLCB3b3JraW5nRGlyZWN0b3J5KSB8fCBpc0VxdWFsKHVyaSwgdXNlckhvbWUpYCBjaGVjay5cblx0ICovXG5cdHByaXZhdGUgX2lzRGlzY292ZXJ5Qm91bmRhcnkodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbCh1cmksIHRoaXMuX3VzZXJIb21lKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMuc29tZShyb290ID0+IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwodXJpLCByb290KSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHdvcmtzcGFjZSByb290IHRoYXQgY29udGFpbnMgKG9yIGVxdWFscykgYHVyaWAsIG9yIGB1bmRlZmluZWRgIHdoZW4gaXRcblx0ICogbGl2ZXMgdW5kZXIgbm9uZSBvZiB0aGVtLiBQcmVmZXJzIHRoZSBtb3N0IHNwZWNpZmljIHJvb3Qgd2hlbiByb290cyBuZXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY29udGFpbmluZ1dvcmtzcGFjZVJvb3QodXJpOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGxldCBiZXN0OiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCByb290IG9mIHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudCh1cmksIHJvb3QpICYmICghYmVzdCB8fCByb290LnBhdGgubGVuZ3RoID4gYmVzdC5wYXRoLmxlbmd0aCkpIHtcblx0XHRcdFx0YmVzdCA9IHJvb3Q7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBiZXN0O1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcHMgYW4gU0RLLXN1cHBsaWVkIGBwcm9qZWN0UGF0aGAgKGFuIGZzIHBhdGggc3RyaW5nKSBiYWNrIHRvIHRoZSBvcmlnaW5hbFxuXHQgKiB3b3Jrc3BhY2Utcm9vdCB7QGxpbmsgVVJJfSwgcHJlc2VydmluZyBpdHMgc2NoZW1lL2F1dGhvcml0eS4gUmV0dXJuc1xuXHQgKiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBwYXRoIG1hdGNoZXMgbm9uZSBvZiB0aGUgcm9vdHMuXG5cdCAqL1xuXHRwcml2YXRlIF9yb290Rm9yUHJvamVjdFBhdGgocHJvamVjdFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFwcm9qZWN0UGF0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fcGF0aFRvVXJpKHByb2plY3RQYXRoKTtcblx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzLmZpbmQocm9vdCA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKHJvb3QsIHRhcmdldCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSB3b3JraW5nLWRpcmVjdG9yeSByb290cyB0aGF0IGhvb2tzIGFyZSBkaXNjb3ZlcmVkIGZyb20uXG5cdCAqXG5cdCAqICoqSG9va3MgYXJlIGRpc2NvdmVyZWQgZnJvbSB0aGUgUFJJTUFSWSB3b3JraW5nIGRpcmVjdG9yeSBvbmx5KiogKGluZGV4IDAgb2Zcblx0ICoge0BsaW5rIF93b3JraW5nRGlyZWN0b3JpZXN9LCB3aGljaCBjYWxsZXJzIE1VU1Qgb3JkZXIgcHJpbWFyeS1maXJzdCkuIEhvb2tzXG5cdCAqIGZyb20gbm9uLXByaW1hcnkgcm9vdHMgYXJlIGludGVudGlvbmFsbHkgTk9UIGRpc2NvdmVyZWQgYmVjYXVzZSB0aGUgQ29waWxvdFxuXHQgKiBhZ2VudCBjdXJyZW50bHkgYXBwbGllcyBob29rcyBmcm9tIGEgc2luZ2xlIHByaW1hcnkgZGlyZWN0b3J5IG9ubHkuIEV2ZXJ5XG5cdCAqIG90aGVyIGN1c3RvbWl6YXRpb24gdHlwZXMgKGFnZW50cywgc2tpbGxzLCBhbmQgaW5zdHJ1Y3Rpb25zKSBhcmUgZGlzY292ZXJlZFxuXHQgKiBhY3Jvc3MgYWxsIHJvb3RzLlxuXHQgKlxuXHQgKiBFeGFtcGxlOiBmb3Igcm9vdHMgYFtCLCBBLCBDXWAgKHdpdGggYEJgIHNlbGVjdGVkIGFzIHByaW1hcnkpLCBob29rcyBhcmVcblx0ICogZGlzY292ZXJlZCBmcm9tIGBCYCBvbmx5OyBob29rcyB1bmRlciBgQWAvYENgIGFyZSBpZ25vcmVkLlxuXHQgKlxuXHQgKiBUaGlzIG1heSBleHBhbmQgdG8gYWxsIHJvb3RzIGluIHRoZSBmdXR1cmUgXHUyMDE0IHNlZSBgTVVMVElfUk9PVF9DSEFOR0VTLm1kYC5cblx0ICovXG5cdHByaXZhdGUgZ2V0IF9ob29rV29ya2luZ0RpcmVjdG9yaWVzKCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzLnNsaWNlKDAsIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3cml0ZUN1c3RvbWl6YXRpb25EaXNjb3ZlcnlEZWJ1Z0xvZyhwYXlsb2FkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghQ1VTVE9NSVpBVElPTl9ESVNDT1ZFUllfREVCVUdfTE9HX1BBVEgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbWtkaXIobm9kZURpcm5hbWUoQ1VTVE9NSVpBVElPTl9ESVNDT1ZFUllfREVCVUdfTE9HX1BBVEgpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGF3YWl0IGFwcGVuZEZpbGUoQ1VTVE9NSVpBVElPTl9ESVNDT1ZFUllfREVCVUdfTE9HX1BBVEgsIGAke0pTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0dGltZXN0YW1wOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdC4uLnBheWxvYWQsXG5cdFx0XHR9LCB1bmRlZmluZWQsIDIpfVxcbmAsICd1dGY4Jyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnldIEZhaWxlZCB0byB3cml0ZSBkaXNjb3ZlcnkgZGVidWcgbG9nOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldERpc2NvdmVyZWREaXJlY3RvcmllcyhjbGllbnQ6IENvcGlsb3RDbGllbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgSURpc2NvdmVyZWREaXJlY3RvcnlbXT4ge1xuXHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0Y29uc3QgcDogQWdlbnRzRGlzY292ZXJSZXF1ZXN0ID0geyBwcm9qZWN0UGF0aHM6IHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcy5tYXAodXJpID0+IHVyaS5mc1BhdGgpIH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5nZXRIb29rc0Rpc2NvdmVyeVBhdGhzKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlQWdlbnRJbnN0cnVjdGlvbkZpbGVzQnlSb290ID0gbmV3IFJlc291cmNlTWFwPElEaXNjb3ZlcmVkRmlsZVtdPigpO1xuXHRcdGNvbnN0IHVzZXJBZ2VudEluc3RydWN0aW9uRmlsZXM6IElEaXNjb3ZlcmVkRmlsZVtdID0gW107XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgW2FnZW50RGlzY292ZXJ5LCBpbnN0cnVjdGlvbkRpc2NvdmVyeSwgc2tpbGxEaXNjb3ZlcnldID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRyYWNlQ2FuY2VsbGF0aW9uRXJyb3IoY2xpZW50LnJwYy5hZ2VudHMuZ2V0RGlzY292ZXJ5UGF0aHMocCksIHRva2VuKSxcblx0XHRcdFx0cmFjZUNhbmNlbGxhdGlvbkVycm9yKGNsaWVudC5ycGMuaW5zdHJ1Y3Rpb25zLmdldERpc2NvdmVyeVBhdGhzKHApLCB0b2tlbiksXG5cdFx0XHRcdHJhY2VDYW5jZWxsYXRpb25FcnJvcihjbGllbnQucnBjLnNraWxscy5nZXREaXNjb3ZlcnlQYXRocyhwKSwgdG9rZW4pXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gUHJvY2VzcyBhZ2VudCBkaXNjb3ZlcnkgcGF0aHNcblx0XHRcdGZvciAoY29uc3QgYWdlbnRQYXRoIG9mIGFnZW50RGlzY292ZXJ5Py5wYXRocyA/PyBbXSkge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHVyaTogdGhpcy5fcGF0aFRvVXJpKGFnZW50UGF0aC5wYXRoKSxcblx0XHRcdFx0XHR0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCxcblx0XHRcdFx0XHRmaWxlczogW10sXG5cdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUoYWdlbnRQYXRoLnBhdGgpLFxuXHRcdFx0XHRcdHdyaXRhYmxlOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcm9jZXNzIGluc3RydWN0aW9uIGRpc2NvdmVyeSBwYXRoc1xuXHRcdFx0Zm9yIChjb25zdCBpbnN0cnVjdGlvblBhdGggb2YgaW5zdHJ1Y3Rpb25EaXNjb3Zlcnk/LnBhdGhzID8/IFtdKSB7XG5cdFx0XHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0XHRpZiAoaW5zdHJ1Y3Rpb25QYXRoLmtpbmQgPT09ICdmaWxlJykge1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVVcmkgPSB0aGlzLl9wYXRoVG9VcmkoaW5zdHJ1Y3Rpb25QYXRoLnBhdGgpO1xuXHRcdFx0XHRcdGNvbnN0IGRpc2NvdmVyZWRGaWxlOiBJRGlzY292ZXJlZEZpbGUgPSB7IHVyaTogZmlsZVVyaSwgZXRhZzogJycgfTtcblx0XHRcdFx0XHRjb25zdCBjb250YWluaW5nUm9vdCA9IHRoaXMuX2NvbnRhaW5pbmdXb3Jrc3BhY2VSb290KGZpbGVVcmkpO1xuXHRcdFx0XHRcdGlmIChjb250YWluaW5nUm9vdCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlsZXMgPSB3b3Jrc3BhY2VBZ2VudEluc3RydWN0aW9uRmlsZXNCeVJvb3QuZ2V0KGNvbnRhaW5pbmdSb290KSA/PyBbXTtcblx0XHRcdFx0XHRcdGZpbGVzLnB1c2goZGlzY292ZXJlZEZpbGUpO1xuXHRcdFx0XHRcdFx0d29ya3NwYWNlQWdlbnRJbnN0cnVjdGlvbkZpbGVzQnlSb290LnNldChjb250YWluaW5nUm9vdCwgZmlsZXMpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KGZpbGVVcmksIHRoaXMuX3VzZXJIb21lKSkge1xuXHRcdFx0XHRcdFx0dXNlckFnZW50SW5zdHJ1Y3Rpb25GaWxlcy5wdXNoKGRpc2NvdmVyZWRGaWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaW5zdHJ1Y3Rpb25QYXRoLmtpbmQgPT09ICdkaXJlY3RvcnknKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0dXJpOiB0aGlzLl9wYXRoVG9VcmkoaW5zdHJ1Y3Rpb25QYXRoLnBhdGgpLFxuXHRcdFx0XHRcdFx0dHlwZTogRGlzY292ZXJlZFR5cGUuSW5zdHJ1Y3Rpb24sXG5cdFx0XHRcdFx0XHRmaWxlczogW10sXG5cdFx0XHRcdFx0XHRuYW1lOiBiYXNlbmFtZShpbnN0cnVjdGlvblBhdGgucGF0aCksXG5cdFx0XHRcdFx0XHR3cml0YWJsZTogdHJ1ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IFtyb290LCBmaWxlc10gb2Ygd29ya3NwYWNlQWdlbnRJbnN0cnVjdGlvbkZpbGVzQnlSb290KSB7XG5cdFx0XHRcdGlmIChmaWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0dXJpOiByb290LFxuXHRcdFx0XHRcdFx0dHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbixcblx0XHRcdFx0XHRcdGZpbGVzLFxuXHRcdFx0XHRcdFx0bmFtZTogJycsXG5cdFx0XHRcdFx0XHR3cml0YWJsZTogZmFsc2Vcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHVzZXJBZ2VudEluc3RydWN0aW9uRmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0dXJpOiB0aGlzLl91c2VySG9tZSxcblx0XHRcdFx0XHR0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uLFxuXHRcdFx0XHRcdGZpbGVzOiB1c2VyQWdlbnRJbnN0cnVjdGlvbkZpbGVzLFxuXHRcdFx0XHRcdG5hbWU6ICcnLFxuXHRcdFx0XHRcdHdyaXRhYmxlOiBmYWxzZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJvY2VzcyBza2lsbCBkaXNjb3ZlcnkgcGF0aHNcblx0XHRcdGZvciAoY29uc3Qgc2tpbGxQYXRoIG9mIHNraWxsRGlzY292ZXJ5Py5wYXRocyA/PyBbXSkge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdHVyaTogdGhpcy5fcGF0aFRvVXJpKHNraWxsUGF0aC5wYXRoKSxcblx0XHRcdFx0XHR0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCxcblx0XHRcdFx0XHRmaWxlczogW10sXG5cdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUoc2tpbGxQYXRoLnBhdGgpLFxuXHRcdFx0XHRcdHdyaXRhYmxlOiB0cnVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW1Nlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5XSBFcnJvciBnZXR0aW5nIGRpc2NvdmVyeSBwYXRoczogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdC5zb3J0KGNvbXBhcmVEaXNjb3ZlcmVkRGlyZWN0b3J5KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SG9va3NEaXNjb3ZlcnlQYXRocygpOiBJRGlzY292ZXJlZERpcmVjdG9yeVtdIHtcblx0XHRjb25zdCBieVVyaSA9IG5ldyBSZXNvdXJjZU1hcDxJRGlzY292ZXJlZERpcmVjdG9yeT4oKTtcblx0XHRjb25zdCBhZGQgPSAodXJpOiBVUkksIG5hbWU6IHN0cmluZyk6IHZvaWQgPT4ge1xuXHRcdFx0aWYgKCFieVVyaS5oYXModXJpKSkge1xuXHRcdFx0XHRieVVyaS5zZXQodXJpLCB7IHVyaSwgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vaywgZmlsZXM6IFtdLCBuYW1lLCB3cml0YWJsZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCByb290IG9mIHNlYXJjaFJvb3RzLndvcmtzcGFjZSkge1xuXHRcdFx0aWYgKHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaykge1xuXHRcdFx0XHQvLyBIb29rczogcHJpbWFyeSB3b3JraW5nIGRpcmVjdG9yeSBvbmx5IChDb3BpbG90IGxpbWl0YXRpb24pLlxuXHRcdFx0XHRmb3IgKGNvbnN0IHdvcmtpbmdEaXJlY3Rvcnkgb2YgdGhpcy5faG9va1dvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0XHRcdGFkZChqb2luUGF0aCh3b3JraW5nRGlyZWN0b3J5LCAuLi5yb290LnBhdGgpLCByb290Lm5hbWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiBzZWFyY2hSb290cy51c2VyKSB7XG5cdFx0XHRpZiAocm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKSB7XG5cdFx0XHRcdGFkZChqb2luUGF0aCh0aGlzLl91c2VySG9tZSwgLi4ucm9vdC5wYXRoKSwgcm9vdC5uYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCByb290IG9mIGZpeGVkRGlzY292ZXJ5RmlsZXMud29ya3NwYWNlKSB7XG5cdFx0XHRpZiAocm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKSB7XG5cdFx0XHRcdC8vIEhvb2tzOiBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5IG9ubHkgKENvcGlsb3QgbGltaXRhdGlvbikuXG5cdFx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0RpcmVjdG9yeSBvZiB0aGlzLl9ob29rV29ya2luZ0RpcmVjdG9yaWVzKSB7XG5cdFx0XHRcdFx0YWRkKGpvaW5QYXRoKHdvcmtpbmdEaXJlY3RvcnksIC4uLnJvb3QucGF0aCksIGJhc2VuYW1lKGpvaW5QYXRoKHdvcmtpbmdEaXJlY3RvcnksIC4uLnJvb3QucGF0aCkucGF0aCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qgcm9vdCBvZiBmaXhlZERpc2NvdmVyeUZpbGVzLnVzZXIpIHtcblx0XHRcdGlmIChyb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2spIHtcblx0XHRcdFx0YWRkKGpvaW5QYXRoKHRoaXMuX3VzZXJIb21lLCAuLi5yb290LnBhdGgpLCBiYXNlbmFtZShqb2luUGF0aCh0aGlzLl91c2VySG9tZSwgLi4ucm9vdC5wYXRoKS5wYXRoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbLi4uYnlVcmkudmFsdWVzKCldO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlV2F0Y2hlcnMoZGlzY292ZXJlZERpcmVjdG9yaWVzOiByZWFkb25seSBJRGlzY292ZXJlZERpcmVjdG9yeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBuZXh0V2F0Y2hSb290VXJpcyA9IG5ldyBSZXNvdXJjZU1hcDxJV2F0Y2hTcGVjPigpO1xuXHRcdGNvbnN0IHRvUmVzb2x2ZSA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGNvbnN0IHJlY3Vyc2l2ZUJ5RGlyZWN0b3J5ID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KCk7XG5cblx0XHRmb3IgKGNvbnN0IGRpc2NvdmVyZWREaXIgb2YgZGlzY292ZXJlZERpcmVjdG9yaWVzKSB7XG5cdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0Y29uc3QgZGlyVXJpID0gZGlzY292ZXJlZERpci51cmk7XG5cdFx0XHRjb25zdCByZWN1cnNpdmUgPSBkaXNjb3ZlcmVkRGlyLnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLlNraWxsIHx8XG5cdFx0XHRcdGRpc2NvdmVyZWREaXIudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSW5zdHJ1Y3Rpb24gfHxcblx0XHRcdFx0ZGlzY292ZXJlZERpci50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rO1xuXHRcdFx0cmVjdXJzaXZlQnlEaXJlY3Rvcnkuc2V0KGRpclVyaSwgcmVjdXJzaXZlKTtcblx0XHRcdHRvUmVzb2x2ZS5hZGQoZGlyVXJpKTtcblxuXHRcdFx0bGV0IGN1cnJlbnQgPSBkaXJVcmk7XG5cdFx0XHR3aGlsZSAoIXRoaXMuX2lzRGlzY292ZXJ5Qm91bmRhcnkoY3VycmVudCkpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50ID0gdXJpRGlybmFtZShjdXJyZW50KTtcblx0XHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwocGFyZW50LCBjdXJyZW50KSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRvUmVzb2x2ZS5hZGQocGFyZW50KTtcblx0XHRcdFx0Y3VycmVudCA9IHBhcmVudDtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGRpc2NvdmVyZWREaXIuZmlsZXMpIHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdFx0bGV0IGN1cnJlbnRGaWxlUGF0aCA9IGZpbGUudXJpO1xuXHRcdFx0XHR3aGlsZSAoIXRoaXMuX2lzRGlzY292ZXJ5Qm91bmRhcnkoY3VycmVudEZpbGVQYXRoKSkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcmVudCA9IHVyaURpcm5hbWUoY3VycmVudEZpbGVQYXRoKTtcblx0XHRcdFx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChwYXJlbnQsIGN1cnJlbnRGaWxlUGF0aCkpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0b1Jlc29sdmUuYWRkKHBhcmVudCk7XG5cdFx0XHRcdFx0Y3VycmVudEZpbGVQYXRoID0gcGFyZW50O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRjb25zdCB0b1Jlc29sdmVBcnJheSA9IFsuLi50b1Jlc29sdmVdO1xuXHRcdGNvbnN0IHN0YXRSZXN1bHRzID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZUFsbCh0b1Jlc29sdmVBcnJheS5tYXAocmVzb3VyY2UgPT4gKHsgcmVzb3VyY2UgfSkpKTtcblx0XHRjb25zdCBleGlzdGluZ0RpcmVjdG9yaWVzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdGF0UmVzdWx0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RhdFJlc3VsdHNbaV07XG5cdFx0XHRpZiAocmVzdWx0LnN1Y2Nlc3MgJiYgcmVzdWx0LnN0YXQ/LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGV4aXN0aW5nRGlyZWN0b3JpZXMuYWRkKHRvUmVzb2x2ZUFycmF5W2ldKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGRpc2NvdmVyZWREaXIgb2YgZGlzY292ZXJlZERpcmVjdG9yaWVzKSB7XG5cdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0Y29uc3QgZGlyVXJpID0gZGlzY292ZXJlZERpci51cmk7XG5cdFx0XHRjb25zdCByZWN1cnNpdmUgPSByZWN1cnNpdmVCeURpcmVjdG9yeS5nZXQoZGlyVXJpKSA/PyBmYWxzZTtcblx0XHRcdGlmIChleGlzdGluZ0RpcmVjdG9yaWVzLmhhcyhkaXJVcmkpKSB7XG5cdFx0XHRcdGFkZFdhdGNoKG5leHRXYXRjaFJvb3RVcmlzLCBkaXJVcmksIHJlY3Vyc2l2ZSwgZGlyVXJpKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGN1cnJlbnQgPSBkaXJVcmk7XG5cdFx0XHR3aGlsZSAoIXRoaXMuX2lzRGlzY292ZXJ5Qm91bmRhcnkoY3VycmVudCkpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50ID0gdXJpRGlybmFtZShjdXJyZW50KTtcblx0XHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwocGFyZW50LCBjdXJyZW50KSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleGlzdGluZ0RpcmVjdG9yaWVzLmhhcyhwYXJlbnQpKSB7XG5cdFx0XHRcdFx0YWRkV2F0Y2gobmV4dFdhdGNoUm9vdFVyaXMsIHBhcmVudCwgZmFsc2UsIGN1cnJlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN1cnJlbnQgPSBwYXJlbnQ7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBkaXNjb3ZlcmVkRGlyLmZpbGVzKSB7XG5cdFx0XHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0XHRcdGxldCBjdXJyZW50RmlsZVBhdGggPSBmaWxlLnVyaTtcblx0XHRcdFx0d2hpbGUgKCF0aGlzLl9pc0Rpc2NvdmVyeUJvdW5kYXJ5KGN1cnJlbnRGaWxlUGF0aCkpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJlbnQgPSB1cmlEaXJuYW1lKGN1cnJlbnRGaWxlUGF0aCk7XG5cdFx0XHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwocGFyZW50LCBjdXJyZW50RmlsZVBhdGgpKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGV4aXN0aW5nRGlyZWN0b3JpZXMuaGFzKHBhcmVudCkpIHtcblx0XHRcdFx0XHRcdGFkZFdhdGNoKG5leHRXYXRjaFJvb3RVcmlzLCBwYXJlbnQsIGZhbHNlLCBjdXJyZW50RmlsZVBhdGgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjdXJyZW50RmlsZVBhdGggPSBwYXJlbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZWNvbmNpbGVXYXRjaGVycyhuZXh0V2F0Y2hSb290VXJpcyk7XG5cdH1cblxuXG5cdHB1YmxpYyBhc3luYyBkaXNjb3ZlcihjbGllbnQ6IENvcGlsb3RDbGllbnQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgRGlyZWN0b3J5Q3VzdG9taXphdGlvbltdPiB7XG5cdFx0YXdhaXQgdGhpcy53cml0ZUN1c3RvbWl6YXRpb25EaXNjb3ZlcnlEZWJ1Z0xvZyh7XG5cdFx0XHRtZXRob2Q6ICdkaXNjb3ZlcicsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcy5tYXAoZCA9PiBkLnRvU3RyaW5nKCkpLFxuXHRcdFx0dXNlckhvbWU6IHRoaXMuX3VzZXJIb21lLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdFx0aWYgKCF0aGlzLl9kaXNjb3ZlcmVkRGlyZWN0b3JpZXMpIHtcblx0XHRcdHRoaXMuX2Rpc2NvdmVyZWREaXJlY3RvcmllcyA9IGF3YWl0IHRoaXMuZ2V0RGlzY292ZXJlZERpcmVjdG9yaWVzKGNsaWVudCwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0Y29uc3QgcDogQWdlbnRzRGlzY292ZXJSZXF1ZXN0ID0geyBwcm9qZWN0UGF0aHM6IHRoaXMuX3dvcmtpbmdEaXJlY3Rvcmllcy5tYXAodXJpID0+IHVyaS5mc1BhdGgpIH07XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgW2FnZW50cywgcnVsZXMsIHNraWxscywgaG9va3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLmRpc2NvdmVyQWdlbnRzKHAsIGNsaWVudCwgdG9rZW4pLFxuXHRcdFx0XHR0aGlzLmRpc2NvdmVyUnVsZXMocCwgY2xpZW50LCB0b2tlbiksXG5cdFx0XHRcdHRoaXMuZGlzY292ZXJTa2lsbHMocCwgY2xpZW50LCB0b2tlbiksXG5cdFx0XHRcdHRoaXMuZGlzY292ZXJIb29rcyh0b2tlbiksXG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVdhdGNoZXJzKHRoaXMuX2Rpc2NvdmVyZWREaXJlY3RvcmllcywgdG9rZW4pXG5cdFx0XHRdKTtcblx0XHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBEaXJlY3RvcnlDdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRcdGF3YWl0IHRoaXMudG9EaXJlY3RvcnlDdXN0b21pemF0aW9ucyhDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgYWdlbnRzLCB0aGlzLl9kaXNjb3ZlcmVkRGlyZWN0b3JpZXMsIHJlc3VsdCk7XG5cdFx0XHRhd2FpdCB0aGlzLnRvRGlyZWN0b3J5Q3VzdG9taXphdGlvbnMoQ3VzdG9taXphdGlvblR5cGUuUnVsZSwgcnVsZXMsIHRoaXMuX2Rpc2NvdmVyZWREaXJlY3RvcmllcywgcmVzdWx0KTtcblx0XHRcdGF3YWl0IHRoaXMudG9EaXJlY3RvcnlDdXN0b21pemF0aW9ucyhDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgc2tpbGxzLCB0aGlzLl9kaXNjb3ZlcmVkRGlyZWN0b3JpZXMsIHJlc3VsdCk7XG5cdFx0XHRhd2FpdCB0aGlzLnRvRGlyZWN0b3J5Q3VzdG9taXphdGlvbnMoQ3VzdG9taXphdGlvblR5cGUuSG9vaywgaG9va3MsIHRoaXMuX2Rpc2NvdmVyZWREaXJlY3RvcmllcywgcmVzdWx0KTtcblx0XHRcdGNvbnN0IHNvcnRlZFJlc3VsdCA9IHJlc3VsdC5zb3J0KGNvbXBhcmVEaXJlY3RvcnlDdXN0b21pemF0aW9uKTtcblx0XHRcdGF3YWl0IHRoaXMud3JpdGVDdXN0b21pemF0aW9uRGlzY292ZXJ5RGVidWdMb2coe1xuXHRcdFx0XHRtZXRob2Q6ICdkaXNjb3ZlcicsXG5cdFx0XHRcdHJlc3VsdDogc29ydGVkUmVzdWx0Lm1hcChjdXN0b21pemF0aW9uID0+ICh7XG5cdFx0XHRcdFx0Y29udGVudHM6IGN1c3RvbWl6YXRpb24uY29udGVudHMsXG5cdFx0XHRcdFx0dXJpOiBjdXN0b21pemF0aW9uLnVyaSxcblx0XHRcdFx0XHRjaGlsZHJlbjogKGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiAoeyB0eXBlOiBjaGlsZC50eXBlLCB1cmk6IGNoaWxkLnVyaSwgbmFtZTogY2hpbGQubmFtZSB9KSksXG5cdFx0XHRcdH0pKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHNvcnRlZFJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeV0gRXJyb3IgZHVyaW5nIGRpc2NvdmVyeTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkaXNjb3ZlckFnZW50cyhkaXNjb3ZlcnlSZXF1ZXN0OiBBZ2VudHNEaXNjb3ZlclJlcXVlc3QsIGNsaWVudDogQ29waWxvdENsaWVudCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBZ2VudEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IGFnZW50czogQWdlbnRDdXN0b21pemF0aW9uW10gPSBbXTtcblxuXHRcdGNvbnN0IGFnZW50RGlzY292ZXJ5ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKGNsaWVudC5ycGMuYWdlbnRzLmRpc2NvdmVyKGRpc2NvdmVyeVJlcXVlc3QpLCB0b2tlbik7XG5cdFx0Zm9yIChjb25zdCBhZ2VudCBvZiBhZ2VudERpc2NvdmVyeS5hZ2VudHMpIHtcblx0XHRcdGlmIChhZ2VudC5wYXRoKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IHRoaXMuX3BhdGhUb1VyaShhZ2VudC5wYXRoKTtcblx0XHRcdFx0YWdlbnRzLnB1c2goeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgdXJpOiB1cmkudG9TdHJpbmcoKSwgaWQ6IGFnZW50LmlkLCBuYW1lOiBhZ2VudC5uYW1lLCBkZXNjcmlwdGlvbjogYWdlbnQuZGVzY3JpcHRpb24sIF9tZXRhOiB0b0FnZW50Q3VzdG9taXphdGlvbk1ldGEoeyB1c2VySW52b2NhYmxlOiBhZ2VudC51c2VySW52b2NhYmxlIH0pIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYWdlbnRzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkaXNjb3ZlclJ1bGVzKGRpc2NvdmVyeVJlcXVlc3Q6IEFnZW50c0Rpc2NvdmVyUmVxdWVzdCwgY2xpZW50OiBDb3BpbG90Q2xpZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJ1bGVDdXN0b21pemF0aW9uW10+IHtcblx0XHRjb25zdCBydWxlczogUnVsZUN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW5SdWxlVXJpcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb25EaXNjb3ZlcnkgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IoY2xpZW50LnJwYy5pbnN0cnVjdGlvbnMuZGlzY292ZXIoZGlzY292ZXJ5UmVxdWVzdCksIHRva2VuKTtcblx0XHRhd2FpdCB0aGlzLndyaXRlQ3VzdG9taXphdGlvbkRpc2NvdmVyeURlYnVnTG9nKHtcblx0XHRcdG1ldGhvZDogJ2Rpc2NvdmVyUnVsZXMuaW5zdHJ1Y3Rpb25zLmRpc2NvdmVyJyxcblx0XHRcdHNvdXJjZXM6IGluc3RydWN0aW9uRGlzY292ZXJ5LnNvdXJjZXMubWFwKHNvdXJjZSA9PiAoe1xuXHRcdFx0XHRpZDogc291cmNlLmlkLFxuXHRcdFx0XHRsYWJlbDogc291cmNlLmxhYmVsLFxuXHRcdFx0XHRzb3VyY2VQYXRoOiBzb3VyY2Uuc291cmNlUGF0aCxcblx0XHRcdFx0YXBwbHlUbzogc291cmNlLmFwcGx5VG8sXG5cdFx0XHRcdHR5cGU6IHNvdXJjZS50eXBlLFxuXHRcdFx0fSkpLFxuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBpbnN0cnVjdGlvbiBvZiBpbnN0cnVjdGlvbkRpc2NvdmVyeS5zb3VyY2VzKSB7XG5cdFx0XHRsZXQgdXJpOiBVUkk7XG5cdFx0XHRpZiAoaXNBYnNvbHV0ZShpbnN0cnVjdGlvbi5zb3VyY2VQYXRoKSkge1xuXHRcdFx0XHR1cmkgPSB0aGlzLl9wYXRoVG9VcmkoaW5zdHJ1Y3Rpb24uc291cmNlUGF0aCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBSZXNvbHZlIHRoZSByZWxhdGl2ZSBzb3VyY2UgYWdhaW5zdCB0aGUgd29ya3NwYWNlIHJvb3QgdGhlIFNESyBhdHRyaWJ1dGVkXG5cdFx0XHRcdC8vIGl0IHRvIChgcHJvamVjdFBhdGhgIGRpc2FtYmlndWF0ZXMgc2FtZS1uYW1lZCBmaWxlcyBhY3Jvc3MgbXVsdGlwbGUgcm9vdHMpLlxuXHRcdFx0XHQvLyBGYWxsIGJhY2sgdG8gdGhlIHByaW1hcnkgcm9vdCBmb3Igc291cmNlcyB3aXRob3V0IGFuIGF0dHJpYnV0ZWQgcHJvamVjdC5cblx0XHRcdFx0Y29uc3QgYW5jaG9yID0gdGhpcy5fcm9vdEZvclByb2plY3RQYXRoKGluc3RydWN0aW9uLnByb2plY3RQYXRoKSA/PyB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXNbMF07XG5cdFx0XHRcdHVyaSA9IGpvaW5QYXRoKGFuY2hvciwgaW5zdHJ1Y3Rpb24uc291cmNlUGF0aCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cmlTdHJpbmcgPSB1cmkudG9TdHJpbmcoKTtcblx0XHRcdHJ1bGVzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5SdWxlLFxuXHRcdFx0XHR1cmk6IHVyaVN0cmluZyxcblx0XHRcdFx0aWQ6IGluc3RydWN0aW9uLmlkLFxuXHRcdFx0XHRuYW1lOiBpbnN0cnVjdGlvbi5sYWJlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGluc3RydWN0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRnbG9iczogaW5zdHJ1Y3Rpb24uYXBwbHlUbyA/IFsuLi5pbnN0cnVjdGlvbi5hcHBseVRvXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0YWx3YXlzQXBwbHk6IHRoaXMuX2lzQWdlbnRJbnN0cnVjdGlvblNvdXJjZShpbnN0cnVjdGlvbiksXG5cdFx0XHR9KTtcblx0XHRcdHNlZW5SdWxlVXJpcy5hZGQodXJpU3RyaW5nKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGRpcmVjdG9yeSBvZiB0aGlzLl9kaXNjb3ZlcmVkRGlyZWN0b3JpZXMgPz8gW10pIHtcblx0XHRcdGlmIChkaXJlY3RvcnkudHlwZSAhPT0gRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGRpcmVjdG9yeS5maWxlcykge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBmaWxlLnVyaS50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAoc2VlblJ1bGVVcmlzLmhhcyh1cmkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRydWxlcy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5SdWxlLFxuXHRcdFx0XHRcdHVyaSxcblx0XHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKHVyaSksXG5cdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUoZmlsZS51cmkucGF0aCksXG5cdFx0XHRcdFx0YWx3YXlzQXBwbHk6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZWVuUnVsZVVyaXMuYWRkKHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJ1bGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNBZ2VudEluc3RydWN0aW9uU291cmNlKGluc3RydWN0aW9uOiBJbnN0cnVjdGlvblNvdXJjZSk6IGJvb2xlYW4ge1xuXHRcdGlmIChpbnN0cnVjdGlvbi50eXBlID09PSAnaG9tZScgfHwgaW5zdHJ1Y3Rpb24udHlwZSA9PT0gJ3JlcG8nIHx8IGluc3RydWN0aW9uLnR5cGUgPT09ICdtb2RlbCcpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVuYW1lID0gYmFzZW5hbWUoaW5zdHJ1Y3Rpb24uc291cmNlUGF0aCkudG9Mb3dlckNhc2UoKTtcblx0XHRyZXR1cm4gQUdFTlRfSU5TVFJVQ1RJT05fRklMRU5BTUVTLmhhcyhmaWxlbmFtZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRpc2NvdmVyU2tpbGxzKGRpc2NvdmVyeVJlcXVlc3Q6IEFnZW50c0Rpc2NvdmVyUmVxdWVzdCwgY2xpZW50OiBDb3BpbG90Q2xpZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFNraWxsQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0Y29uc3Qgc2tpbGxzOiBTa2lsbEN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3Qgc2tpbGxEaXNjb3ZlcnkgPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IoY2xpZW50LnJwYy5za2lsbHMuZGlzY292ZXIoZGlzY292ZXJ5UmVxdWVzdCksIHRva2VuKTtcblx0XHRmb3IgKGNvbnN0IHNraWxsIG9mIHNraWxsRGlzY292ZXJ5LnNraWxscykge1xuXHRcdFx0aWYgKHNraWxsLnBhdGgpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gdGhpcy5fcGF0aFRvVXJpKHNraWxsLnBhdGgpO1xuXHRcdFx0XHRza2lsbHMucHVzaCh7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCB1cmk6IHVyaS50b1N0cmluZygpLCBpZDogc2tpbGwucGF0aCwgbmFtZTogc2tpbGwubmFtZSwgZGVzY3JpcHRpb246IHNraWxsLmRlc2NyaXB0aW9uIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2tpbGxzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkaXNjb3Zlckhvb2tzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SG9va0N1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRjb25zdCBkaXNjb3ZlcmVkRGlyZWN0b3JpZXM6IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10gPSBbXTtcblxuXHRcdGNvbnN0IGhvb2tSb290c1dvcmtzcGFjZSA9IHNlYXJjaFJvb3RzLndvcmtzcGFjZS5maWx0ZXIocm9vdCA9PiByb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2spO1xuXHRcdGNvbnN0IGhvb2tSb290c1VzZXIgPSBzZWFyY2hSb290cy51c2VyLmZpbHRlcihyb290ID0+IHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vayk7XG5cdFx0Y29uc3QgZml4ZWRIb29rRmlsZXNXb3Jrc3BhY2UgPSBmaXhlZERpc2NvdmVyeUZpbGVzLndvcmtzcGFjZS5maWx0ZXIocm9vdCA9PiByb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2spO1xuXHRcdGNvbnN0IGZpeGVkSG9va0ZpbGVzVXNlciA9IGZpeGVkRGlzY292ZXJ5RmlsZXMudXNlci5maWx0ZXIocm9vdCA9PiByb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2spO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0Ly8gSG9va3M6IHByaW1hcnkgd29ya2luZyBkaXJlY3Rvcnkgb25seSAoQ29waWxvdCBsaW1pdGF0aW9uIFx1MjAxNCBzZWUgX2hvb2tXb3JraW5nRGlyZWN0b3JpZXMpLlxuXHRcdFx0Li4udGhpcy5faG9va1dvcmtpbmdEaXJlY3Rvcmllcy5mbGF0TWFwKHdvcmtpbmdEaXJlY3RvcnkgPT5cblx0XHRcdFx0aG9va1Jvb3RzV29ya3NwYWNlLm1hcChyb290ID0+IHRoaXMuX2Rpc2NvdmVySG9va1Jvb3Qod29ya2luZ0RpcmVjdG9yeSwgcm9vdCwgc2VlbiwgZGlzY292ZXJlZERpcmVjdG9yaWVzLCB0b2tlbikpKSxcblx0XHRcdC4uLmhvb2tSb290c1VzZXIubWFwKHJvb3QgPT4gdGhpcy5fZGlzY292ZXJIb29rUm9vdCh0aGlzLl91c2VySG9tZSwgcm9vdCwgc2VlbiwgZGlzY292ZXJlZERpcmVjdG9yaWVzLCB0b2tlbikpLFxuXHRcdFx0Li4udGhpcy5faG9va1dvcmtpbmdEaXJlY3Rvcmllcy5tYXAod29ya2luZ0RpcmVjdG9yeSA9PlxuXHRcdFx0XHR0aGlzLl9kaXNjb3ZlckZpeGVkSG9va0ZpbGVzKHdvcmtpbmdEaXJlY3RvcnksIGZpeGVkSG9va0ZpbGVzV29ya3NwYWNlLCBzZWVuLCBkaXNjb3ZlcmVkRGlyZWN0b3JpZXMsIHRva2VuKSksXG5cdFx0XHR0aGlzLl9kaXNjb3ZlckZpeGVkSG9va0ZpbGVzKHRoaXMuX3VzZXJIb21lLCBmaXhlZEhvb2tGaWxlc1VzZXIsIHNlZW4sIGRpc2NvdmVyZWREaXJlY3RvcmllcywgdG9rZW4pLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgaG9va3M6IEhvb2tDdXN0b21pemF0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGRpcmVjdG9yeSBvZiBkaXNjb3ZlcmVkRGlyZWN0b3JpZXMpIHtcblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBkaXJlY3RvcnkuZmlsZXMpIHtcblx0XHRcdFx0Y29uc3QgdXJpID0gZmlsZS51cmkudG9TdHJpbmcoKTtcblx0XHRcdFx0aG9va3MucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuSG9vayxcblx0XHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKHVyaSksXG5cdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lKGZpbGUudXJpLnBhdGgpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aG9va3Muc29ydCgoYSwgYikgPT4gY29tcGFyZVN0cmluZ3MoYS51cmksIGIudXJpKSk7XG5cdFx0cmV0dXJuIGhvb2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzY292ZXJIb29rUm9vdChiYXNlOiBVUkksIHJvb3Q6IElTZWFyY2hSb290LCBzZWVuOiBSZXNvdXJjZVNldCwgcmVzdWx0OiBJRGlzY292ZXJlZERpcmVjdG9yeVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByb290VXJpID0gam9pblBhdGgoYmFzZSwgLi4ucm9vdC5wYXRoKTtcblx0XHRsZXQgc3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShyb290VXJpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFJvb3QgZG9lcyBub3QgZXhpc3QgKG9yIGlzIHVucmVhZGFibGUpIFx1MjAxNCBzdGlsbCBkaXNjb3ZlciBhcyBhbiBlbXB0eSBzb3VyY2UgZm9sZGVyLlxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9zY2FuRm9ySG9va3Mocm9vdCwgcm9vdFVyaSwgc3RhdCwgc2VlbiwgcmVzdWx0LCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kaXNjb3ZlckZpeGVkSG9va0ZpbGVzKGJhc2U6IFVSSSwgcm9vdHM6IHJlYWRvbmx5IElGaXhlZERpc2NvdmVyeUZpbGVbXSwgc2VlbjogUmVzb3VyY2VTZXQsIHJlc3VsdDogSURpc2NvdmVyZWREaXJlY3RvcnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCByb290IG9mIHJvb3RzKSB7XG5cdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0Y29uc3Qgcm9vdFVyaSA9IGpvaW5QYXRoKGJhc2UsIC4uLnJvb3QucGF0aCk7XG5cdFx0XHRjb25zdCBmaWxlczogSURpc2NvdmVyZWRGaWxlW10gPSBbXTtcblx0XHRcdGxldCBzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShyb290VXJpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBSb290IGRvZXMgbm90IGV4aXN0IChvciBpcyB1bnJlYWRhYmxlKSBcdTIwMTQgc3RpbGwgZGlzY292ZXIgYXMgYW4gZW1wdHkgc291cmNlIGZvbGRlci5cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0Py5jaGlsZHJlbiA/PyBbXSkge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0XHRpZiAoY2hpbGQuaXNGaWxlICYmIHJvb3QuZmlsZW5hbWVzLmluY2x1ZGVzKGNoaWxkLm5hbWUpKSB7XG5cdFx0XHRcdFx0aWYgKCFzZWVuLmhhcyhjaGlsZC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKGNoaWxkLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdGZpbGVzLnB1c2goeyB1cmk6IGNoaWxkLnJlc291cmNlLCBldGFnOiBjaGlsZC5ldGFnIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyB1cmk6IHJvb3RVcmksIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2ssIGZpbGVzOiBmaWxlcy5zb3J0KGNvbXBhcmVEaXNjb3ZlcmVkRmlsZSksIG5hbWU6IGJhc2VuYW1lKHJvb3RVcmkucGF0aCksIHdyaXRhYmxlOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdG9EaXJlY3RvcnlDdXN0b21pemF0aW9ucyh0eXBlOiBDaGlsZEN1c3RvbWl6YXRpb25UeXBlLCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ2hpbGRDdXN0b21pemF0aW9uW10sIGFsbERpc2NvdmVyZWREaXJlY3RvcmllczogcmVhZG9ubHkgSURpc2NvdmVyZWREaXJlY3RvcnlbXSwgcmVzdWx0OiBEaXJlY3RvcnlDdXN0b21pemF0aW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaXNjb3ZlcmVkRGlyZWN0b3JpZXMgPSBhbGxEaXNjb3ZlcmVkRGlyZWN0b3JpZXMuZmlsdGVyKGQgPT4ge1xuXHRcdFx0aWYgKHR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50KSB7XG5cdFx0XHRcdHJldHVybiBkLnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkFnZW50O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUpIHtcblx0XHRcdFx0cmV0dXJuIGQudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSW5zdHJ1Y3Rpb24gfHwgZC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkhvb2spIHtcblx0XHRcdFx0cmV0dXJuIGQudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaztcblx0XHRcdH1cblx0XHRcdHJldHVybiBkLnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLlNraWxsO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZU91dHB1dERpcmVjdG9yaWVzID0gdHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUnVsZVxuXHRcdFx0PyBkaXNjb3ZlcmVkRGlyZWN0b3JpZXMuZmlsdGVyKGQgPT4gZC50eXBlICE9PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uIHx8IHRoaXMuX2lzRGlzY292ZXJ5Qm91bmRhcnkoZC51cmkpKVxuXHRcdFx0OiBkaXNjb3ZlcmVkRGlyZWN0b3JpZXM7XG5cdFx0Y29uc3Qgb3V0cHV0RGlyZWN0b3JpZXMgPSB0eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbFxuXHRcdFx0PyBjYW5kaWRhdGVPdXRwdXREaXJlY3Rvcmllcy5maWx0ZXIoZGlyZWN0b3J5ID0+ICFjYW5kaWRhdGVPdXRwdXREaXJlY3Rvcmllcy5zb21lKGNhbmRpZGF0ZSA9PlxuXHRcdFx0XHQhZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChkaXJlY3RvcnkudXJpLCBjYW5kaWRhdGUudXJpKVxuXHRcdFx0XHQmJiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQoZGlyZWN0b3J5LnVyaSwgY2FuZGlkYXRlLnVyaSlcblx0XHRcdCkpXG5cdFx0XHQ6IGNhbmRpZGF0ZU91dHB1dERpcmVjdG9yaWVzO1xuXHRcdGNvbnN0IGJ5UGFyZW50ID0gbmV3IFJlc291cmNlTWFwPHsgcmVhZG9ubHkgdXJpOiBVUkk7IHJlYWRvbmx5IG5hbWU6IHN0cmluZzsgcmVhZG9ubHkgd3JpdGFibGU6IGJvb2xlYW47IHJlYWRvbmx5IGNoaWxkcmVuOiBDaGlsZEN1c3RvbWl6YXRpb25bXSB9PigpO1xuXHRcdGZvciAoY29uc3QgZGlzY292ZXJlZERpcmVjdG9yeSBvZiBvdXRwdXREaXJlY3Rvcmllcykge1xuXHRcdFx0YnlQYXJlbnQuc2V0KGRpc2NvdmVyZWREaXJlY3RvcnkudXJpLCB7XG5cdFx0XHRcdHVyaTogZGlzY292ZXJlZERpcmVjdG9yeS51cmksXG5cdFx0XHRcdG5hbWU6IGRpc2NvdmVyZWREaXJlY3RvcnkubmFtZSB8fCBiYXNlbmFtZShkaXNjb3ZlcmVkRGlyZWN0b3J5LnVyaS5wYXRoKSxcblx0XHRcdFx0d3JpdGFibGU6IGRpc2NvdmVyZWREaXJlY3Rvcnkud3JpdGFibGUsXG5cdFx0XHRcdGNoaWxkcmVuOiBbXVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZml4ZWRIb29rRGlyZWN0b3J5VXJpcyA9IHR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkhvb2tcblx0XHRcdD8gbmV3IFJlc291cmNlU2V0KFtcblx0XHRcdFx0Ly8gSG9va3M6IHByaW1hcnkgd29ya2luZyBkaXJlY3Rvcnkgb25seSAoQ29waWxvdCBsaW1pdGF0aW9uKS5cblx0XHRcdFx0Li4udGhpcy5faG9va1dvcmtpbmdEaXJlY3Rvcmllcy5mbGF0TWFwKHdvcmtpbmdEaXJlY3RvcnkgPT4gZml4ZWREaXNjb3ZlcnlGaWxlcy53b3Jrc3BhY2Vcblx0XHRcdFx0XHQuZmlsdGVyKHJvb3QgPT4gcm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKVxuXHRcdFx0XHRcdC5tYXAocm9vdCA9PiBqb2luUGF0aCh3b3JraW5nRGlyZWN0b3J5LCAuLi5yb290LnBhdGgpKSksXG5cdFx0XHRcdC4uLmZpeGVkRGlzY292ZXJ5RmlsZXMudXNlclxuXHRcdFx0XHRcdC5maWx0ZXIocm9vdCA9PiByb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2spXG5cdFx0XHRcdFx0Lm1hcChyb290ID0+IGpvaW5QYXRoKHRoaXMuX3VzZXJIb21lLCAuLi5yb290LnBhdGgpKSxcblx0XHRcdF0pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGFnZW50SW5zdHJ1Y3Rpb25EaXJlY3RvcnlVcmlzID0gbmV3IFJlc291cmNlU2V0KFxuXHRcdFx0b3V0cHV0RGlyZWN0b3JpZXNcblx0XHRcdFx0LmZpbHRlcihkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb24pXG5cdFx0XHRcdC5tYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS51cmkpXG5cdFx0KTtcblxuXHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiBjdXN0b21pemF0aW9ucykge1xuXHRcdFx0aWYgKGN1c3RvbWl6YXRpb24udHlwZSAhPT0gdHlwZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hpbGRVcmkgPSBVUkkucGFyc2UoY3VzdG9taXphdGlvbi51cmkpO1xuXHRcdFx0bGV0IGJlc3RQYXJlbnQgPSBvdXRwdXREaXJlY3Rvcmllcy5maW5kKGQgPT4gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KGNoaWxkVXJpLCBkLnVyaSkpO1xuXHRcdFx0aWYgKCFiZXN0UGFyZW50ICYmIGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUnVsZSAmJiBjdXN0b21pemF0aW9uLmFsd2F5c0FwcGx5ICYmIGN1c3RvbWl6YXRpb24ubmFtZS5tYXRjaCgvXFwubWQkL2kpKSB7XG5cdFx0XHRcdGJlc3RQYXJlbnQgPSBvdXRwdXREaXJlY3Rvcmllcy5maW5kKGQgPT5cblx0XHRcdFx0XHRkLnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkFnZW50SW5zdHJ1Y3Rpb24gJiYgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbE9yUGFyZW50KGNoaWxkVXJpLCBkLnVyaSlcblx0XHRcdFx0KSA/PyBvdXRwdXREaXJlY3Rvcmllcy5maW5kKGQgPT4gZC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmIChiZXN0UGFyZW50KSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIG91dHB1dERpcmVjdG9yaWVzKSB7XG5cdFx0XHRcdFx0aWYgKGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWxPclBhcmVudChjaGlsZFVyaSwgY2FuZGlkYXRlLnVyaSkgJiYgY2FuZGlkYXRlLnVyaS5wYXRoLmxlbmd0aCA+IGJlc3RQYXJlbnQudXJpLnBhdGgubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRiZXN0UGFyZW50ID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXJlbnRVcmkgPSBiZXN0UGFyZW50Py51cmkgPz8gdXJpRGlybmFtZShjaGlsZFVyaSk7XG5cdFx0XHRsZXQgZW50cnkgPSBieVBhcmVudC5nZXQocGFyZW50VXJpKTtcblx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1Nlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5XSBCVUc6IGN1c3RvbWl6YXRpb24gJyR7Y3VzdG9taXphdGlvbi51cml9JyBvZiB0eXBlICcke2N1c3RvbWl6YXRpb24udHlwZX0nIGlzIG91dHNpZGUgZGlzY292ZXJlZCBkaXJlY3RvcmllczsgY3JlYXRpbmcgZmFsbGJhY2sgZGlyZWN0b3J5ICcke3BhcmVudFVyaS50b1N0cmluZygpfScuYCk7XG5cdFx0XHRcdGVudHJ5ID0ge1xuXHRcdFx0XHRcdHVyaTogcGFyZW50VXJpLFxuXHRcdFx0XHRcdG5hbWU6IGJhc2VuYW1lKHBhcmVudFVyaS5wYXRoKSxcblx0XHRcdFx0XHR3cml0YWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRjaGlsZHJlbjogW11cblx0XHRcdFx0fTtcblx0XHRcdFx0YnlQYXJlbnQuc2V0KHBhcmVudFVyaSwgZW50cnkpO1xuXHRcdFx0fVxuXHRcdFx0ZW50cnkuY2hpbGRyZW4ucHVzaChjdXN0b21pemF0aW9uKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHsgdXJpLCBuYW1lLCB3cml0YWJsZSwgY2hpbGRyZW4gfSBvZiBieVBhcmVudC52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKHR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkhvb2sgJiYgZml4ZWRIb29rRGlyZWN0b3J5VXJpcz8uaGFzKHVyaSkgJiYgY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUnVsZSAmJiBhZ2VudEluc3RydWN0aW9uRGlyZWN0b3J5VXJpcy5oYXModXJpKSkge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ0NoaWxkcmVuOiBDaGlsZEN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRVcmkgPSBVUkkucGFyc2UoY2hpbGQudXJpKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUoY2hpbGRVcmksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0aWYgKHN0YXQuaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRcdGV4aXN0aW5nQ2hpbGRyZW4ucHVzaChjaGlsZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBJZ25vcmUgbWlzc2luZyBhZ2VudC1pbnN0cnVjdGlvbiBmaWxlczsgdGhleSBzaG91bGQgbm90IHN1cmZhY2UuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChleGlzdGluZ0NoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNoaWxkcmVuLmxlbmd0aCA9IDA7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goLi4uZXhpc3RpbmdDaGlsZHJlbik7XG5cdFx0XHR9XG5cblx0XHRcdGNoaWxkcmVuLnNvcnQoKGEsIGIpID0+IGNvbXBhcmVTdHJpbmdzKGEudXJpLCBiLnVyaSkpO1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnksXG5cdFx0XHRcdGlkOiBjdXN0b21pemF0aW9uSWQodXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHR1cmk6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRjb250ZW50czogdHlwZSxcblx0XHRcdFx0d3JpdGFibGUsXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRcdGNoaWxkcmVuLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbGlzdCBvZiBkaXNjb3ZlcmVkIGN1c3RvbWl6YXRpb24gZGlyZWN0b3JpZXMgYW5kIGZpbGVzIGluIGEgc29ydGVkIHdheS5cblx0ICogQWxzbyBzZXRzIHVwIHdhdGNoZXJzIGZvciBhbGwgZGlzY292ZXJlZCByb290IGRpcmVjdG9yaWVzIChyZWN1cnNpdmVseSBpZiBzcGVjaWZpZWQgYnkgdGhlIHJvb3Qgb3IgaWYgYWxyZWFkeSB3YXRjaGluZyByZWN1cnNpdmVseSkuXG5cdCAqIEVhY2ggY2FsbCBwZXJmb3JtcyBhIGZyZXNoIHNjYW4gc2NvcGVkIHRvIHRoZSBwcm92aWRlZCBjYW5jZWxsYXRpb24gdG9rZW4uXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgc2Nhbih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10+IHtcblx0XHRhd2FpdCB0aGlzLndyaXRlQ3VzdG9taXphdGlvbkRpc2NvdmVyeURlYnVnTG9nKHtcblx0XHRcdG1ldGhvZDogJ3NjYW4nLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiB0aGlzLl93b3JraW5nRGlyZWN0b3JpZXMubWFwKGQgPT4gZC50b1N0cmluZygpKSxcblx0XHRcdHVzZXJIb21lOiB0aGlzLl91c2VySG9tZS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0Y29uc3QgbmV4dFdhdGNoUm9vdFVyaXMgPSBuZXcgUmVzb3VyY2VNYXA8SVdhdGNoU3BlYz4oKTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFJlc291cmNlU2V0KCk7XG5cdFx0Y29uc3QgcmVzdWx0OiBJRGlzY292ZXJlZERpcmVjdG9yeVtdID0gW107XG5cblx0XHQvLyBXb3Jrc3BhY2UgZmlyc3Qgc28gaXQgd2lucyBvbiBVUkkgY29uZmxpY3RzLiBIb29rcyBhcmUgZGlzY292ZXJlZCBmcm9tIHRoZVxuXHRcdC8vIFBSSU1BUlkgd29ya2luZyBkaXJlY3Rvcnkgb25seSAoQ29waWxvdCBsaW1pdGF0aW9uIFx1MjAxNCBzZWUgX2hvb2tXb3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdC8vIGV2ZXJ5IG90aGVyIHR5cGUgaXMgZGlzY292ZXJlZCBhY3Jvc3MgYWxsIHJvb3RzLlxuXHRcdGNvbnN0IHdvcmtzcGFjZUZpeGVkSG9vayA9IGZpeGVkRGlzY292ZXJ5RmlsZXMud29ya3NwYWNlLmZpbHRlcihyb290ID0+IHJvb3QudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vayk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRml4ZWROb25Ib29rID0gZml4ZWREaXNjb3ZlcnlGaWxlcy53b3Jrc3BhY2UuZmlsdGVyKHJvb3QgPT4gcm9vdC50eXBlICE9PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHQuLi5zZWFyY2hSb290cy53b3Jrc3BhY2UuZmxhdE1hcChyb290ID0+XG5cdFx0XHRcdChyb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkhvb2sgPyB0aGlzLl9ob29rV29ya2luZ0RpcmVjdG9yaWVzIDogdGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzKVxuXHRcdFx0XHRcdC5tYXAod29ya2luZ0RpcmVjdG9yeSA9PiB0aGlzLl9zY2FuUm9vdCh3b3JraW5nRGlyZWN0b3J5LCByb290LCBzZWVuLCByZXN1bHQsIG5leHRXYXRjaFJvb3RVcmlzLCB0b2tlbikpKSxcblx0XHRcdC4uLnNlYXJjaFJvb3RzLnVzZXIubWFwKHJvb3QgPT4gdGhpcy5fc2NhblJvb3QodGhpcy5fdXNlckhvbWUsIHJvb3QsIHNlZW4sIHJlc3VsdCwgbmV4dFdhdGNoUm9vdFVyaXMsIHRva2VuKSksXG5cdFx0XHQuLi50aGlzLl93b3JraW5nRGlyZWN0b3JpZXMubWFwKHdvcmtpbmdEaXJlY3RvcnkgPT5cblx0XHRcdFx0dGhpcy5fc2NhbkZpeGVkRGlzY292ZXJ5RmlsZXMod29ya2luZ0RpcmVjdG9yeSwgd29ya3NwYWNlRml4ZWROb25Ib29rLCBzZWVuLCByZXN1bHQsIG5leHRXYXRjaFJvb3RVcmlzLCB0b2tlbikpLFxuXHRcdFx0Li4udGhpcy5faG9va1dvcmtpbmdEaXJlY3Rvcmllcy5tYXAod29ya2luZ0RpcmVjdG9yeSA9PlxuXHRcdFx0XHR0aGlzLl9zY2FuRml4ZWREaXNjb3ZlcnlGaWxlcyh3b3JraW5nRGlyZWN0b3J5LCB3b3Jrc3BhY2VGaXhlZEhvb2ssIHNlZW4sIHJlc3VsdCwgbmV4dFdhdGNoUm9vdFVyaXMsIHRva2VuKSksXG5cdFx0XHR0aGlzLl9zY2FuRml4ZWREaXNjb3ZlcnlGaWxlcyh0aGlzLl91c2VySG9tZSwgZml4ZWREaXNjb3ZlcnlGaWxlcy51c2VyLCBzZWVuLCByZXN1bHQsIG5leHRXYXRjaFJvb3RVcmlzLCB0b2tlbilcblx0XHRdKTtcblxuXHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0dGhpcy5fcmVjb25jaWxlV2F0Y2hlcnMobmV4dFdhdGNoUm9vdFVyaXMpO1xuXHRcdGNvbnN0IHNvcnRlZFJlc3VsdCA9IHJlc3VsdC5zb3J0KGNvbXBhcmVEaXNjb3ZlcmVkRGlyZWN0b3J5KTtcblx0XHRhd2FpdCB0aGlzLndyaXRlQ3VzdG9taXphdGlvbkRpc2NvdmVyeURlYnVnTG9nKHtcblx0XHRcdG1ldGhvZDogJ3NjYW4nLFxuXHRcdFx0cmVzdWx0OiBzb3J0ZWRSZXN1bHQubWFwKGRpcmVjdG9yeSA9PiAoe1xuXHRcdFx0XHR0eXBlOiBkaXJlY3RvcnkudHlwZSxcblx0XHRcdFx0dXJpOiBkaXJlY3RvcnkudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGZpbGVzOiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gZmlsZS51cmkudG9TdHJpbmcoKSksXG5cdFx0XHR9KSksXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHNvcnRlZFJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXYWxrIHRoZSBhbmNlc3RvciBjaGFpbiBvZiBgcGF0aGAgZnJvbSBgYmFzZWAuIEZvciBldmVyeSBhbmNlc3RvclxuXHQgKiBkaXJlY3RvcnkgdGhhdCBleGlzdHMsIHJlZ2lzdGVyIGEgbm9uLXJlY3Vyc2l2ZSB3YXRjaGVyIHdob3NlIHRyaWdnZXJcblx0ICogVVJJIGlzIHRoZSBuZXh0IHBhdGggc2VnbWVudCwgc28gdGhlIGhhbmRsZXIgZmlyZXMgd2hlbiBhbiBpbnRlcm1lZGlhdGVcblx0ICogZGlyZWN0b3J5IChlLmcuIGAuZ2l0aHViYCwgYC5naXRodWIvYWdlbnRzYCwgYC5jb3BpbG90YCkgaXMgY3JlYXRlZCBhbmRcblx0ICogYSByZS1zY2FuIGlzIG5lZWRlZCB0byBwaWNrIHVwIG5ld2x5LWRpc2NvdmVyYWJsZSBjb250ZW50LlxuXHQgKlxuXHQgKiBSZXR1cm5zIHRydWUgd2hlbiBldmVyeSBhbmNlc3RvciBleGlzdHMgYXMgYSBkaXJlY3RvcnkgKGkuZS4gdGhlIGxlYWZcblx0ICogbWF5IGV4aXN0KS4gUmV0dXJucyBmYWxzZSB3aGVuIGFuIGFuY2VzdG9yIGlzIG1pc3Npbmcgb3Igbm90IGEgZGlyZWN0b3J5LFxuXHQgKiBpbiB3aGljaCBjYXNlIHRoZSBjYWxsZXIgY2FuIHNob3J0LWNpcmN1aXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF93YXRjaEFuY2VzdG9ycyhiYXNlOiBVUkksIHBhdGg6IHJlYWRvbmx5IHN0cmluZ1tdLCB3YXRjaFJvb3RVcmlzOiBSZXNvdXJjZU1hcDxJV2F0Y2hTcGVjPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IGN1cnJlbnQgPSBiYXNlO1xuXHRcdGZvciAoY29uc3Qgc2VnbWVudCBvZiBwYXRoKSB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBjdXJyZW50O1xuXHRcdFx0Y29uc3QgY2hpbGQgPSBqb2luUGF0aChwYXJlbnQsIHNlZ21lbnQpO1xuXHRcdFx0aWYgKCF3YXRjaFJvb3RVcmlzLmhhcyhwYXJlbnQpKSB7XG5cdFx0XHRcdHRocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKHBhcmVudCk7XG5cdFx0XHRcdFx0aWYgKCFzdGF0LmlzRGlyZWN0b3J5KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGFkZFdhdGNoKHdhdGNoUm9vdFVyaXMsIHBhcmVudCwgZmFsc2UsIGNoaWxkKTtcblx0XHRcdGN1cnJlbnQgPSBjaGlsZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbmNpbGVXYXRjaGVycyhuZXh0V2F0Y2hSb290VXJpczogUmVzb3VyY2VNYXA8SVdhdGNoU3BlYz4pOiB2b2lkIHtcblx0XHQvLyBEaXNwb3NlIHdhdGNoZXJzIHRoYXQgYXJlIGdvbmUgb3Igd2hvc2UgcmVjdXJzaXZlIGZsYWcgY2hhbmdlZC5cblx0XHRmb3IgKGNvbnN0IFtyb290VXJpLCB3YXRjaGVyXSBvZiB0aGlzLl93YXRjaGVycy5lbnRyaWVzKCkpIHtcblx0XHRcdGNvbnN0IG5leHQgPSBuZXh0V2F0Y2hSb290VXJpcy5nZXQocm9vdFVyaSk7XG5cdFx0XHRpZiAoIW5leHQgfHwgbmV4dC5yZWN1cnNpdmUgIT09IHdhdGNoZXIucmVjdXJzaXZlKSB7XG5cdFx0XHRcdHdhdGNoZXIuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3dhdGNoZXJzLmRlbGV0ZShyb290VXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFtyb290VXJpLCBuZXh0XSBvZiBuZXh0V2F0Y2hSb290VXJpcy5lbnRyaWVzKCkpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fd2F0Y2hlcnMuZ2V0KHJvb3RVcmkpO1xuXHRcdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRcdC8vIFJlZnJlc2ggdHJpZ2dlciBVUklzIGluIHBsYWNlOyB0aGUgdW5kZXJseWluZyB3YXRjaGVyIGlzIHVuY2hhbmdlZC5cblx0XHRcdFx0ZXhpc3RpbmcucmVzb3VyY2VzVG9XYXRjaC5jbGVhcigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiBuZXh0LnJlc291cmNlc1RvV2F0Y2gpIHtcblx0XHRcdFx0XHRleGlzdGluZy5yZXNvdXJjZXNUb1dhdGNoLmFkZCh1cmkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX2ZpbGVTZXJ2aWNlLndhdGNoKHJvb3RVcmksIHsgcmVjdXJzaXZlOiBuZXh0LnJlY3Vyc2l2ZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdFx0XHR0aGlzLl93YXRjaGVycy5zZXQocm9vdFVyaSwgeyByZWN1cnNpdmU6IG5leHQucmVjdXJzaXZlLCByZXNvdXJjZXNUb1dhdGNoOiBuZXh0LnJlc291cmNlc1RvV2F0Y2gsIGRpc3Bvc2FibGUgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnldIEZhaWxlZCB0byB3YXRjaCAnJHtyb290VXJpLnRvU3RyaW5nKCl9JzogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZUFsbFdhdGNoZXJzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgd2F0Y2hlciBvZiB0aGlzLl93YXRjaGVycy52YWx1ZXMoKSkge1xuXHRcdFx0d2F0Y2hlci5kaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fd2F0Y2hlcnMuY2xlYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3IgZml4ZWQgZGlzY292ZXJ5IGZpbGVzIChlLmcuIEFHRU5UUy5tZCwgY29waWxvdC1pbnN0cnVjdGlvbnMubWQsXG5cdCAqIHNldHRpbmdzLmpzb24pLCBjcmVhdGUgb25lIGRpc2NvdmVyZWQgZGlyZWN0b3J5IHBlciB0eXBlIGF0IHRoZSBiYXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2NhbkZpeGVkRGlzY292ZXJ5RmlsZXMoYmFzZTogVVJJLCByb290czogSUZpeGVkRGlzY292ZXJ5RmlsZVtdLCBzZWVuOiBSZXNvdXJjZVNldCwgcmVzdWx0OiBJRGlzY292ZXJlZERpcmVjdG9yeVtdLCB3YXRjaFJvb3RVcmlzOiBSZXNvdXJjZU1hcDxJV2F0Y2hTcGVjPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZXNCeVR5cGUgPSBuZXcgTWFwPERpc2NvdmVyZWRUeXBlLCBJRGlzY292ZXJlZEZpbGVbXT4oKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChyb290cy5tYXAoYXN5bmMgcm9vdCA9PiB7XG5cdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl93YXRjaEFuY2VzdG9ycyhiYXNlLCByb290LnBhdGgsIHdhdGNoUm9vdFVyaXMsIHRva2VuKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJvb3RVcmkgPSBqb2luUGF0aChiYXNlLCAuLi5yb290LnBhdGgpO1xuXHRcdFx0bGV0IHN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKHJvb3RVcmksIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIFJvb3QgZG9lcyBub3QgZXhpc3QgKG9yIGlzIHVucmVhZGFibGUpIFx1MjAxNCBub3RoaW5nIHRvIGRpc2NvdmVyIG9yIHdhdGNoLlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXN0YXQuaXNEaXJlY3RvcnkgfHwgIXN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUcmlnZ2VyIHJlZnJlc2ggb25seSBmb3IgdGhlIHNwZWNpZmljIGZpbGVuYW1lcyB0aGlzIHJvb3QgY2FyZXMgYWJvdXRcblx0XHRcdC8vIChlLmcuIEFHRU5UUy5tZCBhdCB0aGUgd29ya3NwYWNlIHJvb3QpIFx1MjAxNCBub3QgZm9yIGV2ZXJ5IGRpcmVjdCBjaGlsZC5cblx0XHRcdGZvciAoY29uc3QgZmlsZW5hbWUgb2Ygcm9vdC5maWxlbmFtZXMpIHtcblx0XHRcdFx0YWRkV2F0Y2god2F0Y2hSb290VXJpcywgcm9vdFVyaSwgZmFsc2UsIGpvaW5QYXRoKHJvb3RVcmksIGZpbGVuYW1lKSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdFx0aWYgKGVudHJ5LmlzRmlsZSAmJiByb290LmZpbGVuYW1lcy5pbmNsdWRlcyhlbnRyeS5uYW1lKSkge1xuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IGpvaW5QYXRoKHJvb3RVcmksIGVudHJ5Lm5hbWUpO1xuXHRcdFx0XHRcdGlmICghc2Vlbi5oYXModXJpKSkge1xuXHRcdFx0XHRcdFx0c2Vlbi5hZGQodXJpKTtcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGVzID0gZmlsZXNCeVR5cGUuZ2V0KHJvb3QudHlwZSkgPz8gW107XG5cdFx0XHRcdFx0XHRmaWxlcy5wdXNoKHsgdXJpLCBldGFnOiBlbnRyeS5ldGFnIH0pO1xuXHRcdFx0XHRcdFx0ZmlsZXNCeVR5cGUuc2V0KHJvb3QudHlwZSwgZmlsZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGZvciAoY29uc3QgW3R5cGUsIGZpbGVzXSBvZiBmaWxlc0J5VHlwZS5lbnRyaWVzKCkpIHtcblx0XHRcdGlmIChmaWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpOiBiYXNlLCB0eXBlLCBmaWxlczogZmlsZXMuc29ydChjb21wYXJlRGlzY292ZXJlZEZpbGUpLCBuYW1lOiAnJywgd3JpdGFibGU6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NjYW5Sb290KGJhc2U6IFVSSSwgcm9vdDogSVNlYXJjaFJvb3QsIHNlZW46IFJlc291cmNlU2V0LCByZXN1bHQ6IElEaXNjb3ZlcmVkRGlyZWN0b3J5W10sIHdhdGNoUm9vdFVyaXM6IFJlc291cmNlTWFwPElXYXRjaFNwZWM+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGNvbnN0IHJvb3RVcmkgPSBqb2luUGF0aChiYXNlLCAuLi5yb290LnBhdGgpO1xuXHRcdGxldCBzdGF0OiBJRmlsZVN0YXRXaXRoTWV0YWRhdGEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoaWxkcmVuOiBJRmlsZVN0YXRXaXRoTWV0YWRhdGFbXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShyb290VXJpLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdGNoaWxkcmVuID0gc3RhdC5jaGlsZHJlbiA/PyBbXTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFJvb3QgZG9lcyBub3QgZXhpc3QgKG9yIGlzIHVucmVhZGFibGUpIFx1MjAxNCBzdGlsbCBkaXNjb3ZlciBpdCBhcyBhIHBvc3NpYmxlIHNvdXJjZSBmb2xkZXIuXG5cdFx0fVxuXG5cdFx0Ly8gRmlsZW5hbWVzIGFyZSBkeW5hbWljIGZvciB0aGVzZSByb290cywgc28gd2Ugd2F0Y2ggdGhlIHdob2xlIGRpcmVjdG9yeS5cblx0XHQvLyBgYWRkV2F0Y2hgIHVwZ3JhZGVzIHRvIHJlY3Vyc2l2ZSBpZiBhbnkgcm9vdCByZXF1ZXN0cyBpdC5cblx0XHRhd2FpdCB0aGlzLl93YXRjaEFuY2VzdG9ycyhiYXNlLCByb290LnBhdGgsIHdhdGNoUm9vdFVyaXMsIHRva2VuKTtcblx0XHRhZGRXYXRjaCh3YXRjaFJvb3RVcmlzLCByb290VXJpLCByb290LnJlY3Vyc2l2ZSA/PyBmYWxzZSwgcm9vdFVyaSk7XG5cblx0XHRpZiAocm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCkge1xuXHRcdFx0Y29uc3QgZmlsZXM6IElEaXNjb3ZlcmVkRmlsZVtdID0gW107XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChjaGlsZHJlbi5tYXAoYXN5bmMgY2hpbGQgPT4ge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0XHRpZiAoY2hpbGQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0XHRjb25zdCBza2lsbEZpbGUgPSBqb2luUGF0aChjaGlsZC5yZXNvdXJjZSwgU0tJTExfRklMRU5BTUUpO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBza2lsbFN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKHNraWxsRmlsZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHRpZiAoc2tpbGxTdGF0LmlzRmlsZSAmJiAhc2Vlbi5oYXMoc2tpbGxGaWxlKSkge1xuXHRcdFx0XHRcdFx0XHRzZWVuLmFkZChza2lsbEZpbGUpO1xuXHRcdFx0XHRcdFx0XHRmaWxlcy5wdXNoKHsgdXJpOiBza2lsbEZpbGUsIGV0YWc6IHNraWxsU3RhdC5ldGFnIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdFx0Ly8gU0tJTEwubWQgbWlzc2luZyBcdTIwMTQgc2tpcCB0aGlzIHNraWxsIGRpcmVjdG9yeS5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpOiByb290VXJpLCB0eXBlOiByb290LnR5cGUsIGZpbGVzOiBmaWxlcy5zb3J0KGNvbXBhcmVEaXNjb3ZlcmVkRmlsZSksIG5hbWU6IHJvb3QubmFtZSwgd3JpdGFibGU6IHRydWUgfSk7XG5cdFx0fSBlbHNlIGlmIChyb290LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkFnZW50KSB7XG5cdFx0XHRjb25zdCBmaWxlczogSURpc2NvdmVyZWRGaWxlW10gPSBbXTtcblx0XHRcdC8vIGFnZW50cyBhcmUgbWFya2Rvd24gZmlsZXMgZGlyZWN0bHkgdW5kZXIgdGhlIHJvb3QgKG5vIHN1YmRpcmVjdG9yeSBzY2FubmluZyksXG5cdFx0XHQvLyBleGNsdWRpbmcgb25seSBleGFjdC1jYXNlIFJFQURNRS5tZC5cblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY2hpbGRyZW4pIHtcblx0XHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdFx0aWYgKGNoaWxkLmlzRmlsZSkge1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVuYW1lID0gY2hpbGQubmFtZTtcblx0XHRcdFx0XHRpZiAoZmlsZW5hbWUuZW5kc1dpdGgoTUFSS0RPV05fU1VGRklYKSAmJiBmaWxlbmFtZSAhPT0gUkVBRE1FX0ZJTEVOQU1FICYmICFzZWVuLmhhcyhjaGlsZC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKGNoaWxkLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdGZpbGVzLnB1c2goeyB1cmk6IGNoaWxkLnJlc291cmNlLCBldGFnOiBjaGlsZC5ldGFnIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goeyB1cmk6IHJvb3RVcmksIHR5cGU6IHJvb3QudHlwZSwgZmlsZXM6IGZpbGVzLnNvcnQoY29tcGFyZURpc2NvdmVyZWRGaWxlKSwgbmFtZTogcm9vdC5uYW1lLCB3cml0YWJsZTogdHJ1ZSB9KTtcblxuXHRcdH0gZWxzZSBpZiAocm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5JbnN0cnVjdGlvbikge1xuXHRcdFx0Y29uc3QgZmlsZXM6IElEaXNjb3ZlcmVkRmlsZVtdID0gW107XG5cdFx0XHQvLyBpbnN0cnVjdGlvbnMgYXJlIGFsbCAuaW5zdHJ1Y3Rpb25zLm1kIGZpbGVzIGRpcmVjdGx5IHVuZGVyIHRoZSByb290IG9yIGluIGEgc3ViZGlyZWN0b3J5XG5cdFx0XHRjb25zdCBmaW5kSW5zdHJ1Y3Rpb25zID0gYXN5bmMgKHN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgcmVjdXJzaW9uTGV2ZWw6IG51bWJlcik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4gPz8gW10pIHtcblx0XHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0XHRcdGlmIChjaGlsZC5pc0ZpbGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBjaGlsZC5uYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRpZiAobmFtZS5lbmRzV2l0aChJTlNUUlVDVElPTl9GSUxFX1NVRkZJWCkgJiYgIXNlZW4uaGFzKGNoaWxkLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHRzZWVuLmFkZChjaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdGZpbGVzLnB1c2goeyB1cmk6IGNoaWxkLnJlc291cmNlLCBldGFnOiBjaGlsZC5ldGFnIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY2hpbGQuaXNEaXJlY3RvcnkgJiYgcmVjdXJzaW9uTGV2ZWwgPCBNQVhfSU5TVFJVQ1RJT05TX1JFQ1VSU0lPTl9ERVBUSCkge1xuXHRcdFx0XHRcdFx0bGV0IGNoaWxkU3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y2hpbGRTdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShjaGlsZC5yZXNvdXJjZSwgeyByZXNvbHZlTWV0YWRhdGE6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0Ly8gSWdub3JlIHVucmVhZGFibGUgc3ViZGlyZWN0b3JpZXMuXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGRTdGF0KSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGZpbmRJbnN0cnVjdGlvbnMoY2hpbGRTdGF0LCByZWN1cnNpb25MZXZlbCArIDEpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGlmIChzdGF0KSB7XG5cdFx0XHRcdGF3YWl0IGZpbmRJbnN0cnVjdGlvbnMoc3RhdCwgMCk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogcm9vdFVyaSwgdHlwZTogcm9vdC50eXBlLCBmaWxlczogZmlsZXMuc29ydChjb21wYXJlRGlzY292ZXJlZEZpbGUpLCBuYW1lOiByb290Lm5hbWUsIHdyaXRhYmxlOiB0cnVlIH0pO1xuXHRcdH0gZWxzZSBpZiAocm9vdC50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5Ib29rKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zY2FuRm9ySG9va3Mocm9vdCwgcm9vdFVyaSwgc3RhdCwgc2VlbiwgcmVzdWx0LCB0b2tlbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Nlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5XSBVbnJlY29nbml6ZWQgcm9vdCB0eXBlICcke3Jvb3QudHlwZX0nIGZvciByb290ICcke3Jvb3RVcmkudG9TdHJpbmcoKX0nYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2NhbkZvckhvb2tzKHJvb3Q6IElTZWFyY2hSb290LCByb290VXJpOiBVUkksIHN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB8IHVuZGVmaW5lZCwgc2VlbjogUmVzb3VyY2VTZXQsIHJlc3VsdDogSURpc2NvdmVyZWREaXJlY3RvcnlbXSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZmlsZXM6IElEaXNjb3ZlcmVkRmlsZVtdID0gW107XG5cdFx0Ly8gaG9va3MgYXJlIHJlY3Vyc2l2ZWx5IGRpc2NvdmVyZWQgYXMgYCouanNvbmAgdW5kZXIgdGhlIHJvb3QuXG5cdFx0Y29uc3QgZmluZEhvb2tzID0gYXN5bmMgKGRpcmVjdG9yeVN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgcmVjdXJzaW9uTGV2ZWw6IG51bWJlcik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0dGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgZGlyZWN0b3J5U3RhdC5jaGlsZHJlbiA/PyBbXSkge1xuXHRcdFx0XHR0aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdFx0XHRpZiAoY2hpbGQuaXNGaWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmFtZSA9IGNoaWxkLm5hbWUudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0XHRpZiAobmFtZS5lbmRzV2l0aChIT09LX0ZJTEVfU1VGRklYKSAmJiAhc2Vlbi5oYXMoY2hpbGQucmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRzZWVuLmFkZChjaGlsZC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRmaWxlcy5wdXNoKHsgdXJpOiBjaGlsZC5yZXNvdXJjZSwgZXRhZzogY2hpbGQuZXRhZyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoY2hpbGQuaXNEaXJlY3RvcnkgJiYgcmVjdXJzaW9uTGV2ZWwgPCBNQVhfSE9PS1NfUkVDVVJTSU9OX0RFUFRIKSB7XG5cdFx0XHRcdFx0bGV0IGNoaWxkU3RhdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjaGlsZFN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZXNvbHZlKGNoaWxkLnJlc291cmNlLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIElnbm9yZSB1bnJlYWRhYmxlIHN1YmRpcmVjdG9yaWVzLlxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY2hpbGRTdGF0KSB7XG5cdFx0XHRcdFx0XHRhd2FpdCBmaW5kSG9va3MoY2hpbGRTdGF0LCByZWN1cnNpb25MZXZlbCArIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0aWYgKHN0YXQpIHtcblx0XHRcdGF3YWl0IGZpbmRIb29rcyhzdGF0LCAwKTtcblx0XHR9XG5cdFx0cmVzdWx0LnB1c2goeyB1cmk6IHJvb3RVcmksIHR5cGU6IHJvb3QudHlwZSwgZmlsZXM6IGZpbGVzLnNvcnQoY29tcGFyZURpc2NvdmVyZWRGaWxlKSwgbmFtZTogcm9vdC5uYW1lLCB3cml0YWJsZTogdHJ1ZSB9KTtcblxuXHR9XG59XG5cblxuXG4vLyBUZXN0LW9ubHkgaGVscGVycyBcdTIwMTQgZXhwb3J0ZWQgYXMgYF9pbnRlcm5hbGAgdG8gZGlzY291cmFnZSBwcm9kdWN0aW9uIHVzZS5cbmV4cG9ydCBjb25zdCBfaW50ZXJuYWwgPSB7XG5cdEFHRU5UX0ZJTEVfU1VGRklYLFxuXHRJTlNUUlVDVElPTl9GSUxFX1NVRkZJWCxcblx0U0tJTExfRklMRU5BTUUsXG5cdHNlYXJjaFJvb3RzLFxuXHRmaXhlZERpc2NvdmVyeUZpbGVzLFxuXHRhZ2VudEluc3RydWN0aW9ucyxcbn07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsWUFBWSxhQUFhO0FBRWxDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBb0M7QUFDN0MsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLFVBQVUsV0FBVyxZQUFZLGtDQUFrQztBQUM1RSxTQUFTLFdBQVcsc0JBQXNCO0FBQzFDLFNBQVMsV0FBVztBQUNwQixTQUFTLFVBQVUsWUFBWSxXQUFXLG1CQUFtQjtBQUM3RCxTQUFTLG9CQUEyQztBQUNwRCxTQUFTLG1CQUFtQjtBQUU1QixTQUFpRCx5QkFBeUIsbUJBQXFHLHVCQUF1QjtBQUV0TSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQVEvQixJQUFXLGlCQUFYLGtCQUFXQSxvQkFBWDtBQUNOLEVBQUFBLGdCQUFBLFdBQVE7QUFDUixFQUFBQSxnQkFBQSxXQUFRO0FBQ1IsRUFBQUEsZ0JBQUEsaUJBQWM7QUFDZCxFQUFBQSxnQkFBQSxVQUFPO0FBQ1AsRUFBQUEsZ0JBQUEsc0JBQW1CO0FBTEYsU0FBQUE7QUFBQSxHQUFBO0FBcUJYLFNB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RUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQUEsVUFDdEYsUUFBUTtBQUFBLFVBRVI7QUFDQSxjQUFJLFdBQVc7QUFDZCxrQkFBTSxVQUFVLFdBQVcsaUJBQWlCLENBQUM7QUFBQSxVQUM5QztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFFBQUksTUFBTTtBQUNULFlBQU0sVUFBVSxNQUFNLENBQUM7QUFBQSxJQUN4QjtBQUNBLFdBQU8sS0FBSyxFQUFFLEtBQUssU0FBUyxNQUFNLEtBQUssTUFBTSxPQUFPLE1BQU0sS0FBSyxxQkFBcUIsR0FBRyxNQUFNLEtBQUssTUFBTSxVQUFVLEtBQUssQ0FBQztBQUFBLEVBRXpIO0FBQ0Q7QUF0OUJhLGdDQUFOO0FBQUEsRUFhSjtBQUFBLEVBQ0E7QUFBQSxHQWRVO0FBMjlCTixNQUFNLFlBQVk7QUFBQSxFQUN4QjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7IiwKICAibmFtZXMiOiBbIkRpc2NvdmVyZWRUeXBlIiwgInN0YXQiXQp9Cg==
