import { parse as parseJSONC } from "../../../base/common/json.js";
import { cloneAndChange, equals as objectEquals } from "../../../base/common/objects.js";
import { isAbsolute } from "../../../base/common/path.js";
import { basename, extname, isEqualOrParent, joinPath, normalizePath, isEqual as isURLEquals, dirname } from "../../../base/common/resources.js";
import { escapeRegExpCharacters } from "../../../base/common/strings.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { parseFrontMatter } from "../../../base/common/yaml.js";
import { McpServerType } from "../../mcp/common/mcpPlatformTypes.js";
import { CustomizationType, McpServerStatus } from "../../agentHost/common/state/protocol/state.js";
import { DEFAULT_MCP_APP } from "../../agentHost/common/state/protocol/mcpAppDefaults.js";
import { customizationId } from "../../agentHost/common/state/sessionState.js";
import { readAgentPluginManifest } from "./agentPluginParser.js";
var IParsedHookCommand;
((IParsedHookCommand2) => {
  function isEquals(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.command === b.command && a.windows === b.windows && a.linux === b.linux && a.osx === b.osx && isURLEquals(a.cwd, b.cwd) && objectEquals(a.env, b.env) && a.timeout === b.timeout && isURLEquals(a.sourceUri, b.sourceUri);
  }
  IParsedHookCommand2.isEquals = isEquals;
})(IParsedHookCommand || (IParsedHookCommand = {}));
var PluginFormat = /* @__PURE__ */ ((PluginFormat2) => {
  PluginFormat2[PluginFormat2["Copilot"] = 0] = "Copilot";
  PluginFormat2[PluginFormat2["Claude"] = 1] = "Claude";
  PluginFormat2[PluginFormat2["OpenPlugin"] = 2] = "OpenPlugin";
  PluginFormat2[PluginFormat2["AgentPlugin"] = 3] = "AgentPlugin";
  return PluginFormat2;
})(PluginFormat || {});
const COPILOT_FORMAT = {
  format: 0 /* Copilot */,
  manifestPath: "plugin.json",
  hookConfigPath: "hooks.json",
  pluginRootTokens: ["${PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"],
  pluginRootEnvVars: ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"],
  parseHooks(hookUri, json, _pluginUri, workspaceRoot, userHome) {
    return parseHooksJson(hookUri, json, workspaceRoot, userHome);
  }
};
const CLAUDE_FORMAT = {
  format: 1 /* Claude */,
  manifestPath: ".claude-plugin/plugin.json",
  hookConfigPath: "hooks/hooks.json",
  pluginRootTokens: ["${PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"],
  pluginRootEnvVars: ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"],
  parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
    return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, "${CLAUDE_PLUGIN_ROOT}", "CLAUDE_PLUGIN_ROOT");
  }
};
const OPEN_PLUGIN_FORMAT = {
  format: 2 /* OpenPlugin */,
  manifestPath: ".plugin/plugin.json",
  hookConfigPath: "hooks/hooks.json",
  pluginRootTokens: ["${PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"],
  pluginRootEnvVars: ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"],
  parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
    return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, "${PLUGIN_ROOT}", "PLUGIN_ROOT");
  }
};
const AGENT_PLUGIN_FORMAT = {
  format: 3 /* AgentPlugin */,
  manifestPath: "plugin.json",
  hookConfigPath: "",
  componentPaths: {
    commands: false,
    skills: "skills",
    agents: false,
    rules: false,
    hooks: false,
    mcpServers: "mcp.json"
  },
  requiresManifest: true,
  pluginRootTokens: [],
  pluginRootEnvVars: [],
  parseHooks() {
    return [];
  }
};
async function detectPluginFormat(pluginUri, fileService) {
  if (await readAgentPluginManifest(pluginUri, fileService)) {
    return AGENT_PLUGIN_FORMAT;
  }
  if (await pathExists(joinPath(pluginUri, ".plugin", "plugin.json"), fileService)) {
    return OPEN_PLUGIN_FORMAT;
  }
  const isInClaudeDirectory = pluginUri.path.split("/").includes(".claude");
  if (isInClaudeDirectory || await pathExists(joinPath(pluginUri, ".claude-plugin", "plugin.json"), fileService)) {
    return CLAUDE_FORMAT;
  }
  return COPILOT_FORMAT;
}
async function readPluginManifest(pluginUri, format, fileService) {
  if (format.format === 3 /* AgentPlugin */) {
    const manifest = await readAgentPluginManifest(pluginUri, fileService);
    return manifest ? { ...manifest } : void 0;
  }
  const json = await readJsonFile(joinPath(pluginUri, format.manifestPath), fileService);
  return json && typeof json === "object" && !Array.isArray(json) ? json : void 0;
}
function getPluginManifestComponent(format, component, manifest) {
  return format.componentPaths && Object.hasOwn(format.componentPaths, component) ? void 0 : manifest?.[component];
}
function resolvePluginComponentDirs(pluginUri, format, component, fallbackPath, manifestSection, boundaryUri) {
  const componentPath = format.componentPaths?.[component];
  if (format.componentPaths && Object.hasOwn(format.componentPaths, component)) {
    return typeof componentPath === "string" ? resolveComponentDirs(pluginUri, componentPath, emptyComponentPathConfig, boundaryUri) : [];
  }
  return resolveComponentDirs(
    pluginUri,
    fallbackPath,
    parseComponentPathConfig(manifestSection),
    boundaryUri
  );
}
function buildChildId(uri, disambiguator) {
  const base = customizationId(uri.toString());
  if (!disambiguator) {
    return base;
  }
  return `${base.replace(/#/g, "%23")}#${disambiguator}`;
}
function makeAgentCustomization(resource) {
  const uri = resource.uri.toString();
  return {
    type: CustomizationType.Agent,
    id: buildChildId(resource.uri),
    uri,
    name: resource.name,
    ...resource.description ? { description: resource.description } : {}
  };
}
function makeSkillCustomization(resource) {
  const uri = resource.uri.toString();
  return {
    type: CustomizationType.Skill,
    id: buildChildId(resource.uri),
    uri,
    name: resource.name,
    ...resource.description ? { description: resource.description } : {}
  };
}
function makeRuleCustomization(resource) {
  const uri = resource.uri.toString();
  return {
    type: CustomizationType.Rule,
    id: buildChildId(resource.uri),
    uri,
    name: resource.name,
    ...resource.description ? { description: resource.description } : {}
  };
}
function makeHookCustomization(hookUri) {
  return {
    type: CustomizationType.Hook,
    id: buildChildId(hookUri),
    uri: hookUri.toString(),
    name: basename(hookUri)
  };
}
function makeMcpServerCustomization(definitionUri, name) {
  return {
    type: CustomizationType.McpServer,
    id: buildChildId(definitionUri, `mcp=${encodeURIComponent(name)}`),
    uri: definitionUri.toString(),
    name,
    enabled: true,
    state: { kind: McpServerStatus.Stopped },
    mcpApp: DEFAULT_MCP_APP
  };
}
const emptyComponentPathConfig = { paths: [], exclusive: false };
function parseComponentPathConfig(raw) {
  if (raw === void 0 || raw === null) {
    return emptyComponentPathConfig;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? { paths: [trimmed], exclusive: false } : emptyComponentPathConfig;
  }
  if (Array.isArray(raw)) {
    const paths = raw.filter((v) => typeof v === "string").map((v) => v.trim()).filter((v) => v.length > 0);
    return { paths, exclusive: false };
  }
  if (typeof raw === "object") {
    const obj = raw;
    if (Array.isArray(obj["paths"])) {
      const paths = obj["paths"].filter((v) => typeof v === "string").map((v) => v.trim()).filter((v) => v.length > 0);
      const exclusive = obj["exclusive"] === true;
      return { paths, exclusive };
    }
  }
  return emptyComponentPathConfig;
}
function resolveComponentDirs(pluginUri, defaultDir, config, boundaryUri) {
  const boundary = boundaryUri && isEqualOrParent(pluginUri, boundaryUri) ? boundaryUri : pluginUri;
  const dirs = [];
  if (!config.exclusive) {
    dirs.push(joinPath(pluginUri, defaultDir));
  }
  for (const p of config.paths) {
    const resolved = normalizePath(joinPath(pluginUri, p));
    if (isEqualOrParent(resolved, boundary)) {
      dirs.push(resolved);
    }
  }
  return dirs;
}
function resolveMcpServersMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return void 0;
  }
  const obj = raw;
  return Object.hasOwn(obj, "mcpServers") ? obj.mcpServers : obj;
}
function normalizeMcpServerConfiguration(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object") {
    return void 0;
  }
  const candidate = rawConfig;
  const type = typeof candidate["type"] === "string" ? candidate["type"] : void 0;
  const command = typeof candidate["command"] === "string" ? candidate["command"] : void 0;
  const url = typeof candidate["url"] === "string" ? candidate["url"] : void 0;
  const args = Array.isArray(candidate["args"]) ? candidate["args"].filter((value) => typeof value === "string") : void 0;
  const env = candidate["env"] && typeof candidate["env"] === "object" ? Object.fromEntries(Object.entries(candidate["env"]).filter(([, value]) => typeof value === "string" || typeof value === "number" || value === null).map(([key, value]) => [key, value])) : void 0;
  const envFile = typeof candidate["envFile"] === "string" ? candidate["envFile"] : void 0;
  const cwd = typeof candidate["cwd"] === "string" ? candidate["cwd"] : void 0;
  const headers = candidate["headers"] && typeof candidate["headers"] === "object" ? Object.fromEntries(Object.entries(candidate["headers"]).filter(([, value]) => typeof value === "string").map(([key, value]) => [key, value])) : void 0;
  const dev = candidate["dev"] && typeof candidate["dev"] === "object" ? candidate["dev"] : void 0;
  if (type === "ws") {
    return void 0;
  }
  if (type === McpServerType.LOCAL || !type && command) {
    if (!command) {
      return void 0;
    }
    return { type: McpServerType.LOCAL, command, args, env, envFile, cwd, dev };
  }
  if (type === McpServerType.REMOTE || type === "streamable-http" || type === "sse" || !type && url) {
    if (!url) {
      return void 0;
    }
    return { type: McpServerType.REMOTE, url, headers, dev };
  }
  return void 0;
}
const shellUnsafeChars = /[\s&|<>()^;!`"']/;
function shellQuotePluginRootInCommand(command, fsPath, token) {
  if (!command.includes(token)) {
    return command;
  }
  if (!shellUnsafeChars.test(fsPath)) {
    return command.replaceAll(token, fsPath);
  }
  const escapedToken = escapeRegExpCharacters(token);
  const pattern = new RegExp(
    `(["']?)` + escapedToken + `([\\w./\\\\~:-]*)`,
    "g"
  );
  return command.replace(pattern, (_match, leadingQuote, suffix) => {
    const fullPath = fsPath + suffix;
    if (leadingQuote) {
      return leadingQuote + fullPath;
    }
    return '"' + fullPath.replace(/"/g, '\\"') + '"';
  });
}
function interpolateMcpPluginRoot(def, fsPath, tokens, envVars) {
  const replace = (s) => tokens.reduce((result, token) => result.replaceAll(token, fsPath), s);
  const config = def.configuration;
  let interpolated;
  if (config.type === McpServerType.LOCAL) {
    const local = { ...config };
    local.command = replace(local.command);
    if (local.args) {
      local.args = local.args.map(replace);
    }
    if (local.cwd) {
      local.cwd = replace(local.cwd);
    }
    local.env = { ...local.env };
    for (const [k, v] of Object.entries(local.env)) {
      if (typeof v === "string") {
        local.env[k] = replace(v);
      }
    }
    for (const envVar of envVars) {
      local.env[envVar] = fsPath;
    }
    if (local.envFile) {
      local.envFile = replace(local.envFile);
    }
    interpolated = local;
  } else {
    const remote = { ...config };
    remote.url = replace(remote.url);
    if (remote.headers) {
      remote.headers = Object.fromEntries(
        Object.entries(remote.headers).map(([k, v]) => [k, replace(v)])
      );
    }
    interpolated = remote;
  }
  return { name: def.name, configuration: interpolated, uri: def.uri, customization: def.customization };
}
const BARE_ENV_VAR_RE = /\$\{(?![A-Za-z]+:)([A-Z_][A-Z0-9_]*)\}/g;
function convertBareEnvVarsToVsCodeSyntax(def) {
  return cloneAndChange(def, (value) => {
    if (URI.isUri(value)) {
      return value;
    }
    if (typeof value === "string") {
      const replaced = value.replace(BARE_ENV_VAR_RE, "${env:$1}");
      return replaced !== value ? replaced : void 0;
    }
    return void 0;
  });
}
const HOOK_TYPE_MAP = {
  // PascalCase (VS Code / Claude)
  "SessionStart": "SessionStart",
  "SessionEnd": "SessionEnd",
  "UserPromptSubmit": "UserPromptSubmit",
  "PreToolUse": "PreToolUse",
  "PostToolUse": "PostToolUse",
  "PreCompact": "PreCompact",
  "SubagentStart": "SubagentStart",
  "SubagentStop": "SubagentStop",
  "Stop": "Stop",
  "ErrorOccurred": "ErrorOccurred",
  // camelCase (GitHub Copilot CLI)
  "sessionStart": "SessionStart",
  "sessionEnd": "SessionEnd",
  "userPromptSubmitted": "UserPromptSubmit",
  "preToolUse": "PreToolUse",
  "postToolUse": "PostToolUse",
  "agentStop": "Stop",
  "subagentStop": "SubagentStop",
  "errorOccurred": "ErrorOccurred"
};
function normalizeHookCommand(raw) {
  if (raw.type !== void 0 && raw.type !== "command") {
    return void 0;
  }
  const hasCommand = typeof raw.command === "string" && raw.command.length > 0;
  const hasBash = typeof raw.bash === "string" && raw.bash.length > 0;
  const hasPowerShell = typeof raw.powershell === "string" && raw.powershell.length > 0;
  const hasWindows = typeof raw.windows === "string" && raw.windows.length > 0;
  const hasLinux = typeof raw.linux === "string" && raw.linux.length > 0;
  const hasOsx = typeof raw.osx === "string" && raw.osx.length > 0;
  if (!hasCommand && !hasBash && !hasPowerShell && !hasWindows && !hasLinux && !hasOsx) {
    return void 0;
  }
  const windows = hasWindows ? raw.windows : hasPowerShell ? raw.powershell : void 0;
  const linux = hasLinux ? raw.linux : hasBash ? raw.bash : void 0;
  const osx = hasOsx ? raw.osx : hasBash ? raw.bash : void 0;
  const timeout = typeof raw.timeout === "number" ? raw.timeout : typeof raw.timeoutSec === "number" ? raw.timeoutSec : void 0;
  return {
    ...hasCommand && { command: raw.command },
    ...windows && { windows },
    ...linux && { linux },
    ...osx && { osx },
    ...typeof raw.env === "object" && raw.env !== null && { env: raw.env },
    ...timeout !== void 0 && { timeout }
  };
}
function resolveHookCommand(raw, workspaceRoot, userHome) {
  const normalized = normalizeHookCommand(raw);
  if (!normalized) {
    return void 0;
  }
  let cwdUri;
  const rawCwd = typeof raw.cwd === "string" ? raw.cwd : void 0;
  if (rawCwd) {
    if (rawCwd.startsWith("~/")) {
      cwdUri = URI.joinPath(userHome, rawCwd.substring(2));
    } else if (isAbsolute(rawCwd)) {
      cwdUri = URI.file(rawCwd);
    } else if (workspaceRoot) {
      cwdUri = joinPath(workspaceRoot, rawCwd);
    }
  } else {
    cwdUri = workspaceRoot;
  }
  return { ...normalized, cwd: cwdUri };
}
function extractHookCommands(item, workspaceRoot, userHome) {
  if (!item || typeof item !== "object") {
    return [];
  }
  const itemObj = item;
  const commands = [];
  const nestedHooks = itemObj.hooks;
  if (nestedHooks !== void 0 && Array.isArray(nestedHooks)) {
    for (const nested of nestedHooks) {
      if (!nested || typeof nested !== "object") {
        continue;
      }
      const resolved = resolveHookCommand(nested, workspaceRoot, userHome);
      if (resolved) {
        commands.push(resolved);
      }
    }
  } else {
    const resolved = resolveHookCommand(itemObj, workspaceRoot, userHome);
    if (resolved) {
      commands.push(resolved);
    }
  }
  return commands;
}
function parseHooksJson(hookUri, json, workspaceRoot, userHome) {
  if (!json || typeof json !== "object") {
    return [];
  }
  const root = json;
  if (root.disableAllHooks === true) {
    return [];
  }
  const hooks = root.hooks;
  if (!hooks || typeof hooks !== "object") {
    return [];
  }
  const hooksObj = hooks;
  const result = [];
  const customization = makeHookCustomization(hookUri);
  for (const originalId of Object.keys(hooksObj)) {
    const canonicalType = HOOK_TYPE_MAP[originalId];
    if (!canonicalType) {
      continue;
    }
    const hookArray = hooksObj[originalId];
    if (!Array.isArray(hookArray)) {
      continue;
    }
    const commands = [];
    for (const item of hookArray) {
      commands.push(...extractHookCommands(item, workspaceRoot, userHome));
    }
    if (commands.length > 0) {
      result.push({ type: canonicalType, commands, uri: hookUri, originalId, customization });
    }
  }
  return result;
}
function interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, token, envVar) {
  const fsPath = pluginUri.fsPath;
  const typedJson = json;
  const mutateHookCommand = (hook) => {
    for (const field of ["command", "windows", "linux", "osx"]) {
      if (typeof hook[field] === "string") {
        hook[field] = shellQuotePluginRootInCommand(hook[field], fsPath, token);
      }
    }
    if (!hook.env || typeof hook.env !== "object") {
      hook.env = {};
    }
    hook.env[envVar] = fsPath;
  };
  for (const lifecycle of Object.values(typedJson.hooks ?? {})) {
    if (!Array.isArray(lifecycle)) {
      continue;
    }
    for (const lifecycleEntry of lifecycle) {
      if (!lifecycleEntry || typeof lifecycleEntry !== "object") {
        continue;
      }
      const entry = lifecycleEntry;
      if (Array.isArray(entry.hooks)) {
        for (const hook of entry.hooks) {
          mutateHookCommand(hook);
        }
      } else {
        mutateHookCommand(entry);
      }
    }
  }
  const replacer = (v) => {
    return typeof v === "string" ? v.replaceAll(token, pluginUri.fsPath) : void 0;
  };
  return parseHooksJson(hookUri, cloneAndChange(json, replacer), workspaceRoot, userHome);
}
async function readJsonFile(uri, fileService) {
  try {
    const fileContents = await fileService.readFile(uri);
    return parseJSONC(fileContents.value.toString());
  } catch {
    return void 0;
  }
}
async function pathExists(resource, fileService) {
  try {
    await fileService.resolve(resource);
    return true;
  } catch {
    return false;
  }
}
const COMMAND_FILE_SUFFIX = ".md";
const RULE_FILE_SUFFIX = ".mdc";
const INSTRUCTION_FILE_SUFFIX = ".instructions.md";
async function readSkills(pluginRoot, dirs, fileService, options) {
  const seen = /* @__PURE__ */ new Set();
  const skills = [];
  const addSkill = async (name, skillMd) => {
    if (options?.containmentRoot && !await isResolvedWithin(options.containmentRoot, skillMd, fileService)) {
      return;
    }
    let description;
    try {
      const parsedInfo = await parseSkillFile(skillMd, fileService);
      description = parsedInfo.description;
      name = parsedInfo.name || name;
    } catch {
    }
    if (seen.has(name)) {
      return;
    }
    seen.add(name);
    skills.push({ uri: skillMd, name, ...description ? { description } : {} });
  };
  await Promise.all(dirs.map(async (dir) => {
    if (!options?.childDirectoriesOnly) {
      const skillMd = URI.joinPath(dir, "SKILL.md");
      if (await pathExists(skillMd, fileService)) {
        await addSkill(basename(dir), skillMd);
        return;
      }
    }
    let stat;
    try {
      stat = await fileService.resolve(dir);
    } catch {
      return;
    }
    if (!stat.isDirectory || !stat.children) {
      return;
    }
    await Promise.all(stat.children.map(async (child) => {
      const childSkillMd = URI.joinPath(child.resource, "SKILL.md");
      if (await pathExists(childSkillMd, fileService)) {
        await addSkill(basename(child.resource), childSkillMd);
      }
    }));
  }));
  if (!options?.childDirectoriesOnly && skills.length === 0) {
    const rootSkillMd = URI.joinPath(pluginRoot, "SKILL.md");
    if (await pathExists(rootSkillMd, fileService)) {
      await addSkill(basename(pluginRoot), rootSkillMd);
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}
async function readPluginSkills(pluginRoot, dirs, format, fileService) {
  return readSkills(pluginRoot, dirs, fileService, format.format === 3 /* AgentPlugin */ ? { childDirectoriesOnly: true, containmentRoot: pluginRoot } : void 0);
}
async function isResolvedWithin(root, resource, fileService) {
  try {
    const [resolvedRoot, resolvedResource] = await Promise.all([
      fileService.realpath(root),
      fileService.realpath(resource)
    ]);
    return isEqualOrParent(resolvedResource ?? normalizePath(resource), resolvedRoot ?? normalizePath(root));
  } catch {
    return false;
  }
}
async function readMarkdownComponents(dirs, fileService) {
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  const addItem = (name, uri) => {
    if (!seen.has(name)) {
      seen.add(name);
      items.push({ uri, name });
    }
  };
  for (const dir of dirs) {
    let stat;
    try {
      stat = await fileService.resolve(dir);
    } catch {
      continue;
    }
    if (stat.isFile && extname(dir).toLowerCase() === COMMAND_FILE_SUFFIX) {
      addItem(basename(dir).slice(0, -COMMAND_FILE_SUFFIX.length), dir);
      continue;
    }
    if (!stat.isDirectory || !stat.children) {
      continue;
    }
    for (const child of stat.children) {
      if (!child.isFile || extname(child.resource).toLowerCase() !== COMMAND_FILE_SUFFIX) {
        continue;
      }
      addItem(basename(child.resource).slice(0, -COMMAND_FILE_SUFFIX.length), child.resource);
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}
function getInstructionFileName(resource) {
  const fileName = basename(resource);
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(RULE_FILE_SUFFIX)) {
    return fileName.slice(0, -RULE_FILE_SUFFIX.length);
  }
  if (lowerName.endsWith(INSTRUCTION_FILE_SUFFIX)) {
    return fileName.slice(0, -INSTRUCTION_FILE_SUFFIX.length);
  }
  return void 0;
}
async function readInstructionComponents(dirs, fileService) {
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  const addItem = (name, uri) => {
    if (!seen.has(name)) {
      seen.add(name);
      items.push({ uri, name });
    }
  };
  for (const dir of dirs) {
    let stat;
    try {
      stat = await fileService.resolve(dir);
    } catch {
      continue;
    }
    if (stat.isFile) {
      const instructionName = getInstructionFileName(dir);
      if (instructionName) {
        addItem(instructionName, dir);
      }
      continue;
    }
    if (!stat.isDirectory || !stat.children) {
      continue;
    }
    for (const child of stat.children) {
      if (!child.isFile) {
        continue;
      }
      const instructionName = getInstructionFileName(child.resource);
      if (instructionName) {
        addItem(instructionName, child.resource);
      }
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}
async function readAgentComponents(dirs, fileService) {
  const files = await readMarkdownComponents(dirs, fileService);
  if (files.length === 0) {
    return files;
  }
  const enriched = await Promise.all(files.map(async (file) => {
    try {
      const { name, description } = await parseAgentFile(file.uri, fileService);
      return {
        uri: file.uri,
        name: name || file.name,
        ...description ? { description } : {}
      };
    } catch {
      return file;
    }
  }));
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of enriched) {
    if (seen.has(item.name)) {
      continue;
    }
    seen.add(item.name);
    result.push(item);
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
async function parseAgentFile(uri, fileService) {
  const nameFromFile = basename(uri).replace(/(\.agent)?\.md$/i, "");
  try {
    const content = await fileService.readFile(uri);
    const frontmatter = parseFrontMatter(content.value.toString());
    const name = frontmatter?.getStringValue("name")?.trim() || nameFromFile;
    const description = frontmatter?.getStringValue("description")?.trim();
    const userInvocable = frontmatter?.getBooleanValue("user-invocable");
    return { name, description, userInvocable };
  } catch {
    return { name: nameFromFile };
  }
}
async function parseSkillFile(uri, fileService) {
  try {
    const content = await fileService.readFile(uri);
    const frontmatter = parseFrontMatter(content.value.toString());
    const name = frontmatter?.getStringValue("name")?.trim() || basename(dirname(uri));
    const description = frontmatter?.getStringValue("description")?.trim();
    const userInvokable = frontmatter?.getBooleanValue("user-invocable");
    return { name, description, userInvokable };
  } catch {
    return { name: basename(dirname(uri)) };
  }
}
async function parseRuleFile(uri, fileService) {
  const nameFromFile = basename(uri).replace(/(\.instructions)?\.md$/i, "");
  try {
    const content = await fileService.readFile(uri);
    const frontmatter = parseFrontMatter(content.value.toString());
    const name = frontmatter?.getStringValue("name")?.trim() || nameFromFile;
    const description = frontmatter?.getStringValue("description")?.trim();
    const globs = frontmatter?.getStringArrayValue("globs") ?? frontmatter?.getStringArrayValue("applyTo") ?? frontmatter?.getStringArrayValue("paths") ?? void 0;
    const alwaysApply = frontmatter?.getBooleanValue("alwaysApply");
    return { name, description, globs, alwaysApply };
  } catch {
    return { name: nameFromFile };
  }
}
async function readHooks(pluginUri, paths, formatConfig, fileService, workspaceRoot, userHome) {
  for (const hookPath of paths) {
    const json = await readJsonFile(hookPath, fileService);
    if (!json) {
      continue;
    }
    return formatConfig.parseHooks(hookPath, json, pluginUri, workspaceRoot, userHome);
  }
  return [];
}
async function readMcpServers(pluginUri, paths, formatConfig, fileService) {
  const merged = /* @__PURE__ */ new Map();
  for (const mcpPath of paths) {
    if (formatConfig.format === 3 /* AgentPlugin */ && !await isResolvedWithin(pluginUri, mcpPath, fileService)) {
      continue;
    }
    const json = await readJsonFile(mcpPath, fileService);
    for (const def of parseMcpServerDefinitionMap(mcpPath, json, pluginUri.fsPath, formatConfig)) {
      if (!merged.has(def.name)) {
        merged.set(def.name, def);
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
async function readPluginMcpServers(pluginUri, paths, format, fileService) {
  return readMcpServers(pluginUri, paths, format, fileService);
}
function parseMcpServerDefinitionMap(definitionURI, raw, pluginFsPath, formatConfig) {
  const mcpServers = resolveMcpServersMap(raw);
  if (!mcpServers) {
    return [];
  }
  const definitions = [];
  for (const [name, configValue] of Object.entries(mcpServers)) {
    const configuration = normalizeMcpServerConfiguration(configValue);
    if (!configuration) {
      continue;
    }
    let def = {
      name,
      configuration,
      uri: definitionURI,
      customization: makeMcpServerCustomization(definitionURI, name)
    };
    def = interpolateMcpPluginRoot(def, pluginFsPath, formatConfig.pluginRootTokens, formatConfig.pluginRootEnvVars);
    if (formatConfig.format !== 3 /* AgentPlugin */ && def.configuration.type === McpServerType.LOCAL && def.configuration.cwd === void 0) {
      def = { ...def, configuration: { ...def.configuration, cwd: pluginFsPath } };
    }
    if (formatConfig.format !== 3 /* AgentPlugin */) {
      def = convertBareEnvVarsToVsCodeSyntax(def);
    }
    definitions.push(def);
  }
  return definitions;
}
async function parsePlugin(pluginUri, fileService, workspaceRoot, userHome, boundaryUri) {
  const formatConfig = await detectPluginFormat(pluginUri, fileService);
  const manifest = await readPluginManifest(pluginUri, formatConfig, fileService);
  if (formatConfig.requiresManifest && !manifest) {
    throw new Error(`Plugin manifest '${joinPath(pluginUri, formatConfig.manifestPath).toString()}' is missing`);
  }
  const hookDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "hooks", formatConfig.hookConfigPath, manifest?.["hooks"], boundaryUri);
  const mcpDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "mcpServers", ".mcp.json", manifest?.["mcpServers"], boundaryUri);
  const skillDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "skills", "skills", manifest?.["skills"], boundaryUri);
  const agentDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "agents", "agents", manifest?.["agents"], boundaryUri);
  const instructionDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "rules", "rules", manifest?.["rules"], boundaryUri);
  let embeddedMcp = [];
  const mcpSection = getPluginManifestComponent(formatConfig, "mcpServers", manifest);
  if (mcpSection && typeof mcpSection === "object" && !Array.isArray(mcpSection) && !hasKey(mcpSection, { paths: true })) {
    embeddedMcp = parseMcpServerDefinitionMap(
      joinPath(pluginUri, formatConfig.manifestPath),
      { mcpServers: mcpSection },
      pluginUri.fsPath,
      formatConfig
    );
  }
  let embeddedHooks = [];
  const hooksSection = getPluginManifestComponent(formatConfig, "hooks", manifest);
  if (hooksSection && typeof hooksSection === "object" && !Array.isArray(hooksSection) && !hasKey(hooksSection, { paths: true })) {
    const manifestUri = joinPath(pluginUri, formatConfig.manifestPath);
    embeddedHooks = formatConfig.parseHooks(manifestUri, { hooks: hooksSection }, pluginUri, workspaceRoot, userHome);
  }
  const [hooks, mcpServers, skills, agents, instructions] = await Promise.all([
    embeddedHooks.length > 0 ? Promise.resolve(embeddedHooks) : readHooks(pluginUri, hookDirs, formatConfig, fileService, workspaceRoot, userHome),
    embeddedMcp.length > 0 ? Promise.resolve(embeddedMcp) : readPluginMcpServers(pluginUri, mcpDirs, formatConfig, fileService),
    readPluginSkills(pluginUri, skillDirs, formatConfig, fileService),
    readAgentComponents(agentDirs, fileService),
    readInstructionComponents(instructionDirs, fileService)
  ]);
  return {
    format: formatConfig.format,
    hooks,
    mcpServers,
    skills: skills.map(toParsedSkill),
    agents: agents.map(toParsedAgent),
    instructions: instructions.map(toParsedRule)
  };
}
function toParsedAgent(resource) {
  return { ...resource, customization: makeAgentCustomization(resource) };
}
function toParsedSkill(resource) {
  return { ...resource, customization: makeSkillCustomization(resource) };
}
function toParsedRule(resource) {
  return { ...resource, customization: makeRuleCustomization(resource) };
}
export {
  IParsedHookCommand,
  PluginFormat,
  convertBareEnvVarsToVsCodeSyntax,
  detectPluginFormat,
  getPluginManifestComponent,
  interpolateHookPluginRoot,
  interpolateMcpPluginRoot,
  makeMcpServerCustomization,
  normalizeMcpServerConfiguration,
  parseAgentFile,
  parseComponentPathConfig,
  parseHooksJson,
  parseMcpServerDefinitionMap,
  parsePlugin,
  parseRuleFile,
  parseSkillFile,
  pathExists,
  readAgentComponents,
  readInstructionComponents,
  readJsonFile,
  readMarkdownComponents,
  readPluginManifest,
  readPluginMcpServers,
  readPluginSkills,
  readSkills,
  resolveComponentDirs,
  resolveMcpServersMap,
  resolvePluginComponentDirs,
  shellQuotePluginRootInCommand,
  toParsedAgent,
  toParsedSkill
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHBhcnNlIGFzIHBhcnNlSlNPTkMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IGNsb25lQW5kQ2hhbmdlLCBlcXVhbHMgYXMgb2JqZWN0RXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc0Fic29sdXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZXh0bmFtZSwgaXNFcXVhbE9yUGFyZW50LCBqb2luUGF0aCwgbm9ybWFsaXplUGF0aCwgaXNFcXVhbCBhcyBpc1VSTEVxdWFscywgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIE11dGFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IHBhcnNlRnJvbnRNYXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi95YW1sLmpzJztcbmltcG9ydCB7IElNY3BSZW1vdGVTZXJ2ZXJDb25maWd1cmF0aW9uLCBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiwgSU1jcFN0ZGlvU2VydmVyQ29uZmlndXJhdGlvbiwgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyU3RhdHVzLCB0eXBlIEFnZW50Q3VzdG9taXphdGlvbiwgdHlwZSBIb29rQ3VzdG9taXphdGlvbiwgdHlwZSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCB0eXBlIFJ1bGVDdXN0b21pemF0aW9uLCB0eXBlIFNraWxsQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9NQ1BfQVBQIH0gZnJvbSAnLi4vLi4vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9tY3BBcHBEZWZhdWx0cy5qcyc7XG5pbXBvcnQgeyBjdXN0b21pemF0aW9uSWQgfSBmcm9tICcuLi8uLi9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyByZWFkQWdlbnRQbHVnaW5NYW5pZmVzdCB9IGZyb20gJy4vYWdlbnRQbHVnaW5QYXJzZXIuanMnO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFR5cGVzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqIEEgc2luZ2xlIGhvb2sgY29tbWFuZCB0byBleGVjdXRlLiBQbGF0Zm9ybSByZXNvbHV0aW9uIGhhcHBlbnMgYXQgY29udmVyc2lvbiB0aW1lLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUGFyc2VkSG9va0NvbW1hbmQge1xuXHQvKiogQ3Jvc3MtcGxhdGZvcm0gZGVmYXVsdCBjb21tYW5kLiAqL1xuXHRyZWFkb25seSBjb21tYW5kPzogc3RyaW5nO1xuXHQvKiogV2luZG93cy1zcGVjaWZpYyBjb21tYW5kLiAqL1xuXHRyZWFkb25seSB3aW5kb3dzPzogc3RyaW5nO1xuXHQvKiogTGludXgtc3BlY2lmaWMgY29tbWFuZC4gKi9cblx0cmVhZG9ubHkgbGludXg/OiBzdHJpbmc7XG5cdC8qKiBtYWNPUy1zcGVjaWZpYyBjb21tYW5kLiAqL1xuXHRyZWFkb25seSBvc3g/OiBzdHJpbmc7XG5cdC8qKiBXb3JraW5nIGRpcmVjdG9yeS4gKi9cblx0cmVhZG9ubHkgY3dkPzogVVJJO1xuXHQvKiogRW52aXJvbm1lbnQgdmFyaWFibGVzLiAqL1xuXHRyZWFkb25seSBlbnY/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKiogVGltZW91dCBpbiBzZWNvbmRzLiAqL1xuXHRyZWFkb25seSB0aW1lb3V0PzogbnVtYmVyO1xuXHQvKiogVVJJIG9mIHRoZSBmaWxlIHRoaXMgaG9vayB3YXMgZGVmaW5lZCBpbi4gKi9cblx0cmVhZG9ubHkgc291cmNlVXJpPzogVVJJO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIElQYXJzZWRIb29rQ29tbWFuZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpc0VxdWFscyhhOiBJUGFyc2VkSG9va0NvbW1hbmQgfCB1bmRlZmluZWQsIGI6IElQYXJzZWRIb29rQ29tbWFuZCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFhIHx8ICFiKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBhLmNvbW1hbmQgPT09IGIuY29tbWFuZFxuXHRcdFx0JiYgYS53aW5kb3dzID09PSBiLndpbmRvd3Ncblx0XHRcdCYmIGEubGludXggPT09IGIubGludXhcblx0XHRcdCYmIGEub3N4ID09PSBiLm9zeFxuXHRcdFx0JiYgaXNVUkxFcXVhbHMoYS5jd2QsIGIuY3dkKVxuXHRcdFx0JiYgb2JqZWN0RXF1YWxzKGEuZW52LCBiLmVudilcblx0XHRcdCYmIGEudGltZW91dCA9PT0gYi50aW1lb3V0XG5cdFx0XHQmJiBpc1VSTEVxdWFscyhhLnNvdXJjZVVyaSwgYi5zb3VyY2VVcmkpO1xuXHR9XG59XG5cbi8qKiBBIGdyb3VwIG9mIGhvb2tzIGZvciBhIHNpbmdsZSBsaWZlY3ljbGUgZXZlbnQuICovXG5leHBvcnQgaW50ZXJmYWNlIElQYXJzZWRIb29rR3JvdXAge1xuXHQvKiogQ2Fub25pY2FsIGhvb2sgdHlwZSBpZGVudGlmaWVyIChlLmcuIGAnU2Vzc2lvblN0YXJ0J2AsIGAnUHJlVG9vbFVzZSdgKS4gKi9cblx0cmVhZG9ubHkgdHlwZTogc3RyaW5nO1xuXHQvKiogVGhlIGNvbW1hbmRzIHRvIGV4ZWN1dGUgZm9yIHRoaXMgaG9vayB0eXBlLiAqL1xuXHRyZWFkb25seSBjb21tYW5kczogcmVhZG9ubHkgSVBhcnNlZEhvb2tDb21tYW5kW107XG5cdC8qKiBVUkkgd2hlcmUgdGhpcyBob29rIGlzIGRlZmluZWQuICovXG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHQvKiogT3JpZ2luYWwga2V5IGFzIGl0IGFwcGVhcnMgaW4gdGhlIGhvb2sgZmlsZS4gKi9cblx0cmVhZG9ubHkgb3JpZ2luYWxJZDogc3RyaW5nO1xuXHQvKipcblx0ICogUHJvdG9jb2wtbGV2ZWwgcHJvamVjdGlvbiBvZiB0aGlzIGhvb2sgZ3JvdXAgYXMgYSBjaGlsZCBjdXN0b21pemF0aW9uLlxuXHQgKiBNdWx0aXBsZSBncm91cHMgcGFyc2VkIGZyb20gdGhlIHNhbWUgZmlsZSBzaGFyZSB0aGUgc2FtZSBgY3VzdG9taXphdGlvbi5pZGBcblx0ICogc28gY29uc3VtZXJzIGNhbiBkZWR1cGUgYnkgaWQgd2hlbiBjb2xsZWN0aW5nIGN1c3RvbWl6YXRpb25zLlxuXHQgKi9cblx0cmVhZG9ubHkgY3VzdG9taXphdGlvbjogSG9va0N1c3RvbWl6YXRpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcFNlcnZlckRlZmluaXRpb24ge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb246IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uO1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0LyoqIFByb3RvY29sLWxldmVsIHByb2plY3Rpb24gb2YgdGhpcyBNQ1Agc2VydmVyIGFzIGEgY2hpbGQgY3VzdG9taXphdGlvbi4gKi9cblx0cmVhZG9ubHkgY3VzdG9taXphdGlvbjogTWNwU2VydmVyQ3VzdG9taXphdGlvbjtcbn1cblxuLyoqIEEgbmFtZWQgcmVzb3VyY2UgKHNraWxsLCBhZ2VudCwgY29tbWFuZCwgb3IgaW5zdHJ1Y3Rpb24pIHdpdGhpbiBhIHBsdWdpbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU5hbWVkUGx1Z2luUmVzb3VyY2Uge1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHQvKipcblx0ICogT3B0aW9uYWwgc2hvcnQgZGVzY3JpcHRpb24sIHBvcHVsYXRlZCBmb3IgcmVzb3VyY2VzIHdob3NlIHJlYWRlcnNcblx0ICogcGFyc2UgaXQgZnJvbSB0aGUgZmlsZSdzIFlBTUwgZnJvbnRtYXR0ZXIgKGUuZy4gYWdlbnRzKS5cblx0ICovXG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG4vKiogQSBwYXJzZWQgYWdlbnQgcGFpcmVkIHdpdGggaXRzIHByb3RvY29sLWxldmVsIGNoaWxkIGN1c3RvbWl6YXRpb24uICovXG5leHBvcnQgaW50ZXJmYWNlIElQYXJzZWRBZ2VudCBleHRlbmRzIElOYW1lZFBsdWdpblJlc291cmNlIHtcblx0cmVhZG9ubHkgY3VzdG9taXphdGlvbjogQWdlbnRDdXN0b21pemF0aW9uO1xufVxuXG4vKiogQSBwYXJzZWQgc2tpbGwgcGFpcmVkIHdpdGggaXRzIHByb3RvY29sLWxldmVsIGNoaWxkIGN1c3RvbWl6YXRpb24uICovXG5leHBvcnQgaW50ZXJmYWNlIElQYXJzZWRTa2lsbCBleHRlbmRzIElOYW1lZFBsdWdpblJlc291cmNlIHtcblx0cmVhZG9ubHkgY3VzdG9taXphdGlvbjogU2tpbGxDdXN0b21pemF0aW9uO1xufVxuXG4vKiogQSBwYXJzZWQgcnVsZSAoaW5zdHJ1Y3Rpb24pIHBhaXJlZCB3aXRoIGl0cyBwcm90b2NvbC1sZXZlbCBjaGlsZCBjdXN0b21pemF0aW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUGFyc2VkUnVsZSBleHRlbmRzIElOYW1lZFBsdWdpblJlc291cmNlIHtcblx0cmVhZG9ubHkgY3VzdG9taXphdGlvbjogUnVsZUN1c3RvbWl6YXRpb247XG59XG5cbi8qKiBUaGUgcmVzdWx0IG9mIHBhcnNpbmcgYSBzaW5nbGUgcGx1Z2luIGRpcmVjdG9yeS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlZFBsdWdpbiB7XG5cdHJlYWRvbmx5IGZvcm1hdDogUGx1Z2luRm9ybWF0O1xuXHRyZWFkb25seSBob29rczogcmVhZG9ubHkgSVBhcnNlZEhvb2tHcm91cFtdO1xuXHRyZWFkb25seSBtY3BTZXJ2ZXJzOiByZWFkb25seSBJTWNwU2VydmVyRGVmaW5pdGlvbltdO1xuXHRyZWFkb25seSBza2lsbHM6IHJlYWRvbmx5IElQYXJzZWRTa2lsbFtdO1xuXHRyZWFkb25seSBhZ2VudHM6IHJlYWRvbmx5IElQYXJzZWRBZ2VudFtdO1xuXHRyZWFkb25seSBpbnN0cnVjdGlvbnM6IHJlYWRvbmx5IElQYXJzZWRSdWxlW107XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gUGx1Z2luIGZvcm1hdCBkZXRlY3Rpb25cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgZW51bSBQbHVnaW5Gb3JtYXQge1xuXHRDb3BpbG90LFxuXHRDbGF1ZGUsXG5cdE9wZW5QbHVnaW4sXG5cdEFnZW50UGx1Z2luLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQbHVnaW5Gb3JtYXRDb25maWcge1xuXHRyZWFkb25seSBmb3JtYXQ6IFBsdWdpbkZvcm1hdDtcblx0cmVhZG9ubHkgbWFuaWZlc3RQYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhvb2tDb25maWdQYXRoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbXBvbmVudFBhdGhzPzogUmVhZG9ubHk8UGFydGlhbDxSZWNvcmQ8UGx1Z2luQ29tcG9uZW50LCBzdHJpbmcgfCBmYWxzZT4+Pjtcblx0cmVhZG9ubHkgcmVxdWlyZXNNYW5pZmVzdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBsdWdpblJvb3RUb2tlbnM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBwbHVnaW5Sb290RW52VmFyczogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKiBQYXJzZXMgaG9va3MgZnJvbSBhIEpTT04gb2JqZWN0IHVzaW5nIHRoZSBmb3JtYXQncyBjb252ZW50aW9ucy4gKi9cblx0cGFyc2VIb29rcyhob29rVXJpOiBVUkksIGpzb246IHVua25vd24sIHBsdWdpblVyaTogVVJJLCB3b3Jrc3BhY2VSb290OiBVUkkgfCB1bmRlZmluZWQsIHVzZXJIb21lOiBVUkkpOiBJUGFyc2VkSG9va0dyb3VwW107XG59XG5cbmV4cG9ydCB0eXBlIFBsdWdpbkNvbXBvbmVudCA9ICdjb21tYW5kcycgfCAnc2tpbGxzJyB8ICdhZ2VudHMnIHwgJ3J1bGVzJyB8ICdob29rcycgfCAnbWNwU2VydmVycyc7XG5cbmNvbnN0IENPUElMT1RfRk9STUFUOiBJUGx1Z2luRm9ybWF0Q29uZmlnID0ge1xuXHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRtYW5pZmVzdFBhdGg6ICdwbHVnaW4uanNvbicsXG5cdGhvb2tDb25maWdQYXRoOiAnaG9va3MuanNvbicsXG5cdHBsdWdpblJvb3RUb2tlbnM6IFsnJHtQTFVHSU5fUk9PVH0nLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9J10sXG5cdHBsdWdpblJvb3RFbnZWYXJzOiBbJ1BMVUdJTl9ST09UJywgJ0NMQVVERV9QTFVHSU5fUk9PVCddLFxuXHRwYXJzZUhvb2tzKGhvb2tVcmksIGpzb24sIF9wbHVnaW5VcmksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKSB7XG5cdFx0cmV0dXJuIHBhcnNlSG9va3NKc29uKGhvb2tVcmksIGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0fSxcbn07XG5cbmNvbnN0IENMQVVERV9GT1JNQVQ6IElQbHVnaW5Gb3JtYXRDb25maWcgPSB7XG5cdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNsYXVkZSxcblx0bWFuaWZlc3RQYXRoOiAnLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb24nLFxuXHRob29rQ29uZmlnUGF0aDogJ2hvb2tzL2hvb2tzLmpzb24nLFxuXHRwbHVnaW5Sb290VG9rZW5zOiBbJyR7UExVR0lOX1JPT1R9JywgJyR7Q0xBVURFX1BMVUdJTl9ST09UfSddLFxuXHRwbHVnaW5Sb290RW52VmFyczogWydQTFVHSU5fUk9PVCcsICdDTEFVREVfUExVR0lOX1JPT1QnXSxcblx0cGFyc2VIb29rcyhob29rVXJpLCBqc29uLCBwbHVnaW5VcmksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKSB7XG5cdFx0cmV0dXJuIGludGVycG9sYXRlSG9va1BsdWdpblJvb3QoaG9va1VyaSwganNvbiwgcGx1Z2luVXJpLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSwgJyR7Q0xBVURFX1BMVUdJTl9ST09UfScsICdDTEFVREVfUExVR0lOX1JPT1QnKTtcblx0fSxcbn07XG5cbmNvbnN0IE9QRU5fUExVR0lOX0ZPUk1BVDogSVBsdWdpbkZvcm1hdENvbmZpZyA9IHtcblx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuT3BlblBsdWdpbixcblx0bWFuaWZlc3RQYXRoOiAnLnBsdWdpbi9wbHVnaW4uanNvbicsXG5cdGhvb2tDb25maWdQYXRoOiAnaG9va3MvaG9va3MuanNvbicsXG5cdHBsdWdpblJvb3RUb2tlbnM6IFsnJHtQTFVHSU5fUk9PVH0nLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9J10sXG5cdHBsdWdpblJvb3RFbnZWYXJzOiBbJ1BMVUdJTl9ST09UJywgJ0NMQVVERV9QTFVHSU5fUk9PVCddLFxuXHRwYXJzZUhvb2tzKGhvb2tVcmksIGpzb24sIHBsdWdpblVyaSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpIHtcblx0XHRyZXR1cm4gaW50ZXJwb2xhdGVIb29rUGx1Z2luUm9vdChob29rVXJpLCBqc29uLCBwbHVnaW5VcmksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lLCAnJHtQTFVHSU5fUk9PVH0nLCAnUExVR0lOX1JPT1QnKTtcblx0fSxcbn07XG5cbmNvbnN0IEFHRU5UX1BMVUdJTl9GT1JNQVQ6IElQbHVnaW5Gb3JtYXRDb25maWcgPSB7XG5cdGZvcm1hdDogUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luLFxuXHRtYW5pZmVzdFBhdGg6ICdwbHVnaW4uanNvbicsXG5cdGhvb2tDb25maWdQYXRoOiAnJyxcblx0Y29tcG9uZW50UGF0aHM6IHtcblx0XHRjb21tYW5kczogZmFsc2UsXG5cdFx0c2tpbGxzOiAnc2tpbGxzJyxcblx0XHRhZ2VudHM6IGZhbHNlLFxuXHRcdHJ1bGVzOiBmYWxzZSxcblx0XHRob29rczogZmFsc2UsXG5cdFx0bWNwU2VydmVyczogJ21jcC5qc29uJyxcblx0fSxcblx0cmVxdWlyZXNNYW5pZmVzdDogdHJ1ZSxcblx0cGx1Z2luUm9vdFRva2VuczogW10sXG5cdHBsdWdpblJvb3RFbnZWYXJzOiBbXSxcblx0cGFyc2VIb29rcygpIHtcblx0XHRyZXR1cm4gW107XG5cdH0sXG59O1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGV0ZWN0UGx1Z2luRm9ybWF0KHBsdWdpblVyaTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxJUGx1Z2luRm9ybWF0Q29uZmlnPiB7XG5cdGlmIChhd2FpdCByZWFkQWdlbnRQbHVnaW5NYW5pZmVzdChwbHVnaW5VcmksIGZpbGVTZXJ2aWNlKSkge1xuXHRcdHJldHVybiBBR0VOVF9QTFVHSU5fRk9STUFUO1xuXHR9XG5cdGlmIChhd2FpdCBwYXRoRXhpc3RzKGpvaW5QYXRoKHBsdWdpblVyaSwgJy5wbHVnaW4nLCAncGx1Z2luLmpzb24nKSwgZmlsZVNlcnZpY2UpKSB7XG5cdFx0cmV0dXJuIE9QRU5fUExVR0lOX0ZPUk1BVDtcblx0fVxuXG5cdGNvbnN0IGlzSW5DbGF1ZGVEaXJlY3RvcnkgPSBwbHVnaW5VcmkucGF0aC5zcGxpdCgnLycpLmluY2x1ZGVzKCcuY2xhdWRlJyk7XG5cdGlmIChpc0luQ2xhdWRlRGlyZWN0b3J5IHx8IGF3YWl0IHBhdGhFeGlzdHMoam9pblBhdGgocGx1Z2luVXJpLCAnLmNsYXVkZS1wbHVnaW4nLCAncGx1Z2luLmpzb24nKSwgZmlsZVNlcnZpY2UpKSB7XG5cdFx0cmV0dXJuIENMQVVERV9GT1JNQVQ7XG5cdH1cblxuXHRyZXR1cm4gQ09QSUxPVF9GT1JNQVQ7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkUGx1Z2luTWFuaWZlc3QocGx1Z2luVXJpOiBVUkksIGZvcm1hdDogSVBsdWdpbkZvcm1hdENvbmZpZywgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ+IHtcblx0aWYgKGZvcm1hdC5mb3JtYXQgPT09IFBsdWdpbkZvcm1hdC5BZ2VudFBsdWdpbikge1xuXHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgcmVhZEFnZW50UGx1Z2luTWFuaWZlc3QocGx1Z2luVXJpLCBmaWxlU2VydmljZSk7XG5cdFx0cmV0dXJuIG1hbmlmZXN0ID8geyAuLi5tYW5pZmVzdCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGpzb24gPSBhd2FpdCByZWFkSnNvbkZpbGUoam9pblBhdGgocGx1Z2luVXJpLCBmb3JtYXQubWFuaWZlc3RQYXRoKSwgZmlsZVNlcnZpY2UpO1xuXHRyZXR1cm4ganNvbiAmJiB0eXBlb2YganNvbiA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkoanNvbikgPyBqc29uIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UGx1Z2luTWFuaWZlc3RDb21wb25lbnQoZm9ybWF0OiBJUGx1Z2luRm9ybWF0Q29uZmlnLCBjb21wb25lbnQ6IFBsdWdpbkNvbXBvbmVudCwgbWFuaWZlc3Q6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogdW5rbm93biB7XG5cdHJldHVybiBmb3JtYXQuY29tcG9uZW50UGF0aHMgJiYgT2JqZWN0Lmhhc093bihmb3JtYXQuY29tcG9uZW50UGF0aHMsIGNvbXBvbmVudCkgPyB1bmRlZmluZWQgOiBtYW5pZmVzdD8uW2NvbXBvbmVudF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlUGx1Z2luQ29tcG9uZW50RGlycyhcblx0cGx1Z2luVXJpOiBVUkksXG5cdGZvcm1hdDogSVBsdWdpbkZvcm1hdENvbmZpZyxcblx0Y29tcG9uZW50OiBQbHVnaW5Db21wb25lbnQsXG5cdGZhbGxiYWNrUGF0aDogc3RyaW5nLFxuXHRtYW5pZmVzdFNlY3Rpb246IHVua25vd24sXG5cdGJvdW5kYXJ5VXJpPzogVVJJLFxuKTogcmVhZG9ubHkgVVJJW10ge1xuXHRjb25zdCBjb21wb25lbnRQYXRoID0gZm9ybWF0LmNvbXBvbmVudFBhdGhzPy5bY29tcG9uZW50XTtcblx0aWYgKGZvcm1hdC5jb21wb25lbnRQYXRocyAmJiBPYmplY3QuaGFzT3duKGZvcm1hdC5jb21wb25lbnRQYXRocywgY29tcG9uZW50KSkge1xuXHRcdHJldHVybiB0eXBlb2YgY29tcG9uZW50UGF0aCA9PT0gJ3N0cmluZydcblx0XHRcdD8gcmVzb2x2ZUNvbXBvbmVudERpcnMocGx1Z2luVXJpLCBjb21wb25lbnRQYXRoLCBlbXB0eUNvbXBvbmVudFBhdGhDb25maWcsIGJvdW5kYXJ5VXJpKVxuXHRcdFx0OiBbXTtcblx0fVxuXHRyZXR1cm4gcmVzb2x2ZUNvbXBvbmVudERpcnMoXG5cdFx0cGx1Z2luVXJpLFxuXHRcdGZhbGxiYWNrUGF0aCxcblx0XHRwYXJzZUNvbXBvbmVudFBhdGhDb25maWcobWFuaWZlc3RTZWN0aW9uKSxcblx0XHRib3VuZGFyeVVyaSxcblx0KTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBDaGlsZCBjdXN0b21pemF0aW9uIGhlbHBlcnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIE1pbnRzIGEgY2hpbGQtY3VzdG9taXphdGlvbiBpZCBmcm9tIGEgc291cmNlIHVyaSBwbHVzIGFuIG9wdGlvbmFsIG9wYXF1ZVxuICogZGlzYW1iaWd1YXRvci4gVXNlZCB3aGVuIG11bHRpcGxlIGN1c3RvbWl6YXRpb25zIGFyZSBkZWNsYXJlZCBpbmxpbmUgaW5cbiAqIGEgc2luZ2xlIGZpbGUgKGUuZy4gdHdvIE1DUCBzZXJ2ZXJzIGluIG9uZSBgLm1jcC5qc29uYCwgb3IgdHdvIGhvb2tcbiAqIGxpZmVjeWNsZSBncm91cHMgaW4gb25lIGhvb2sgZmlsZSkuXG4gKlxuICogUGVyY2VudC1lbmNvZGVzIGFueSBwcmUtZXhpc3RpbmcgYCNgIGluIHRoZSBVUkkgYmVmb3JlIGFwcGVuZGluZyB0aGVcbiAqIGRpc2FtYmlndWF0aW5nIGZyYWdtZW50IHNvIHRoZSByZXN1bHRpbmcgaWQgY2FuIG5ldmVyIGNvbGxpZGUgd2l0aCBhXG4gKiBVUkkgdGhhdCBoYXBwZW5zIHRvIGFscmVhZHkgY29udGFpbiBhIG1hdGNoaW5nIGZyYWdtZW50LlxuICovXG5mdW5jdGlvbiBidWlsZENoaWxkSWQodXJpOiBVUkksIGRpc2FtYmlndWF0b3I/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBiYXNlID0gY3VzdG9taXphdGlvbklkKHVyaS50b1N0cmluZygpKTtcblx0aWYgKCFkaXNhbWJpZ3VhdG9yKSB7XG5cdFx0cmV0dXJuIGJhc2U7XG5cdH1cblx0cmV0dXJuIGAke2Jhc2UucmVwbGFjZSgvIy9nLCAnJTIzJyl9IyR7ZGlzYW1iaWd1YXRvcn1gO1xufVxuXG5mdW5jdGlvbiBtYWtlQWdlbnRDdXN0b21pemF0aW9uKHJlc291cmNlOiBJTmFtZWRQbHVnaW5SZXNvdXJjZSk6IEFnZW50Q3VzdG9taXphdGlvbiB7XG5cdGNvbnN0IHVyaSA9IHJlc291cmNlLnVyaS50b1N0cmluZygpO1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRcdGlkOiBidWlsZENoaWxkSWQocmVzb3VyY2UudXJpKSxcblx0XHR1cmksXG5cdFx0bmFtZTogcmVzb3VyY2UubmFtZSxcblx0XHQuLi4ocmVzb3VyY2UuZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiByZXNvdXJjZS5kZXNjcmlwdGlvbiB9IDoge30pLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlU2tpbGxDdXN0b21pemF0aW9uKHJlc291cmNlOiBJTmFtZWRQbHVnaW5SZXNvdXJjZSk6IFNraWxsQ3VzdG9taXphdGlvbiB7XG5cdGNvbnN0IHVyaSA9IHJlc291cmNlLnVyaS50b1N0cmluZygpO1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLFxuXHRcdGlkOiBidWlsZENoaWxkSWQocmVzb3VyY2UudXJpKSxcblx0XHR1cmksXG5cdFx0bmFtZTogcmVzb3VyY2UubmFtZSxcblx0XHQuLi4ocmVzb3VyY2UuZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiByZXNvdXJjZS5kZXNjcmlwdGlvbiB9IDoge30pLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUnVsZUN1c3RvbWl6YXRpb24ocmVzb3VyY2U6IElOYW1lZFBsdWdpblJlc291cmNlKTogUnVsZUN1c3RvbWl6YXRpb24ge1xuXHRjb25zdCB1cmkgPSByZXNvdXJjZS51cmkudG9TdHJpbmcoKTtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5SdWxlLFxuXHRcdGlkOiBidWlsZENoaWxkSWQocmVzb3VyY2UudXJpKSxcblx0XHR1cmksXG5cdFx0bmFtZTogcmVzb3VyY2UubmFtZSxcblx0XHQuLi4ocmVzb3VyY2UuZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiByZXNvdXJjZS5kZXNjcmlwdGlvbiB9IDoge30pLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlSG9va0N1c3RvbWl6YXRpb24oaG9va1VyaTogVVJJKTogSG9va0N1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkhvb2ssXG5cdFx0aWQ6IGJ1aWxkQ2hpbGRJZChob29rVXJpKSxcblx0XHR1cmk6IGhvb2tVcmkudG9TdHJpbmcoKSxcblx0XHRuYW1lOiBiYXNlbmFtZShob29rVXJpKSxcblx0fTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIHByb3RvY29sIHtAbGluayBNY3BTZXJ2ZXJDdXN0b21pemF0aW9ufSBmb3IgYW4gTUNQIHNlcnZlclxuICogZGVjbGFyZWQgYXQgYGRlZmluaXRpb25VcmlgICh0aGUgbWFuaWZlc3QgLyBzZXR0aW5ncyAvIGAubWNwLmpzb25gIGZpbGVcbiAqIHRoZSBzZXJ2ZXIgaXMgZGVmaW5lZCBpbikuIFRoZSBpZCBpcyBkaXNhbWJpZ3VhdGVkIGJ5IHNlcnZlciBgbmFtZWAgc29cbiAqIG11bHRpcGxlIHNlcnZlcnMgZGVjbGFyZWQgaW4gb25lIGZpbGUgZ2V0IGRpc3RpbmN0IGlkcywgYW5kIHRoZSBlbnRyeVxuICogY2FycmllcyB7QGxpbmsgREVGQVVMVF9NQ1BfQVBQfSBzbyBNQ1AgQXBwIHN1cHBvcnQgaXMgYWR2ZXJ0aXNlZFxuICogY29uc2lzdGVudGx5IHdpdGggZXZlcnkgb3RoZXIgTUNQIGN1c3RvbWl6YXRpb24uXG4gKlxuICogVGhlIHNlZWQgc3RhdGUgaXMge0BsaW5rIE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkfTogYSBkZWNsYXJlZC1idXQtbm90LXlldFxuICogY29ubmVjdGVkIHNlcnZlciBoYXMgbm90IGJlZW4gc3RhcnRlZCBieSBhbnkgU0RLLCBzbyBpdCBtdXN0IG5vdCBjbGFpbSB0b1xuICogYmUge0BsaW5rIE1jcFNlcnZlclN0YXR1cy5TdGFydGluZ30uIFRoZSBsaXZlIHN0YXRlIGlzIGVucmljaGVkIGZyb20gdGhlXG4gKiBTREsncyByZXBvcnRlZCBzdGF0dXMgb25jZSBhIHNlc3Npb24gbWF0ZXJpYWxpemVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb24oZGVmaW5pdGlvblVyaTogVVJJLCBuYW1lOiBzdHJpbmcpOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsXG5cdFx0aWQ6IGJ1aWxkQ2hpbGRJZChkZWZpbml0aW9uVXJpLCBgbWNwPSR7ZW5jb2RlVVJJQ29tcG9uZW50KG5hbWUpfWApLFxuXHRcdHVyaTogZGVmaW5pdGlvblVyaS50b1N0cmluZygpLFxuXHRcdG5hbWUsXG5cdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9LFxuXHRcdG1jcEFwcDogREVGQVVMVF9NQ1BfQVBQLFxuXHR9O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIENvbXBvbmVudCBwYXRoIGNvbmZpZ1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvbmVudFBhdGhDb25maWcge1xuXHRyZWFkb25seSBwYXRoczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGV4Y2x1c2l2ZTogYm9vbGVhbjtcbn1cblxuY29uc3QgZW1wdHlDb21wb25lbnRQYXRoQ29uZmlnOiBJQ29tcG9uZW50UGF0aENvbmZpZyA9IHsgcGF0aHM6IFtdLCBleGNsdXNpdmU6IGZhbHNlIH07XG5cbi8qKlxuICogUGFyc2VzIGEgbWFuaWZlc3QgY29tcG9uZW50IHBhdGggZmllbGQgaW50byBhIG5vcm1hbGl6ZWQgY29uZmlnLlxuICogU3VwcG9ydHMgYHVuZGVmaW5lZGAsIGBzdHJpbmdgLCBgc3RyaW5nW11gLCBhbmQgYHsgcGF0aHM6IHN0cmluZ1tdLCBleGNsdXNpdmU/OiBib29sZWFuIH1gLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDb21wb25lbnRQYXRoQ29uZmlnKHJhdzogdW5rbm93bik6IElDb21wb25lbnRQYXRoQ29uZmlnIHtcblx0aWYgKHJhdyA9PT0gdW5kZWZpbmVkIHx8IHJhdyA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBlbXB0eUNvbXBvbmVudFBhdGhDb25maWc7XG5cdH1cblxuXHRpZiAodHlwZW9mIHJhdyA9PT0gJ3N0cmluZycpIHtcblx0XHRjb25zdCB0cmltbWVkID0gcmF3LnRyaW0oKTtcblx0XHRyZXR1cm4gdHJpbW1lZCA/IHsgcGF0aHM6IFt0cmltbWVkXSwgZXhjbHVzaXZlOiBmYWxzZSB9IDogZW1wdHlDb21wb25lbnRQYXRoQ29uZmlnO1xuXHR9XG5cblx0aWYgKEFycmF5LmlzQXJyYXkocmF3KSkge1xuXHRcdGNvbnN0IHBhdGhzID0gcmF3XG5cdFx0XHQuZmlsdGVyKHYgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnKVxuXHRcdFx0Lm1hcCh2ID0+IHYudHJpbSgpKVxuXHRcdFx0LmZpbHRlcih2ID0+IHYubGVuZ3RoID4gMCk7XG5cdFx0cmV0dXJuIHsgcGF0aHMsIGV4Y2x1c2l2ZTogZmFsc2UgfTtcblx0fVxuXG5cdGlmICh0eXBlb2YgcmF3ID09PSAnb2JqZWN0Jykge1xuXHRcdGNvbnN0IG9iaiA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShvYmpbJ3BhdGhzJ10pKSB7XG5cdFx0XHRjb25zdCBwYXRocyA9IChvYmpbJ3BhdGhzJ10gYXMgdW5rbm93bltdKVxuXHRcdFx0XHQuZmlsdGVyKHYgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQubWFwKHYgPT4gdi50cmltKCkpXG5cdFx0XHRcdC5maWx0ZXIodiA9PiB2Lmxlbmd0aCA+IDApO1xuXHRcdFx0Y29uc3QgZXhjbHVzaXZlID0gb2JqWydleGNsdXNpdmUnXSA9PT0gdHJ1ZTtcblx0XHRcdHJldHVybiB7IHBhdGhzLCBleGNsdXNpdmUgfTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gZW1wdHlDb21wb25lbnRQYXRoQ29uZmlnO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBkaXJlY3RvcmllcyB0byBzY2FuIGZvciBhIGdpdmVuIGNvbXBvbmVudCB0eXBlLCBjb21iaW5pbmdcbiAqIHRoZSBkZWZhdWx0IGRpcmVjdG9yeSB3aXRoIGFueSBjdXN0b20gcGF0aHMgZnJvbSB0aGUgbWFuaWZlc3QgY29uZmlnLlxuICogUGF0aHMgdGhhdCByZXNvbHZlIG91dHNpZGUgdGhlIGJvdW5kYXJ5IGFyZSBzaWxlbnRseSBpZ25vcmVkLlxuICogQHBhcmFtIGJvdW5kYXJ5VXJpIFRoZSBvdXRlcm1vc3QgZGlyZWN0b3J5IHRoYXQgcmVzb2x2ZWQgcGF0aHMgbXVzdCBzdGF5IHdpdGhpbi4gRGVmYXVsdHMgdG8ge0BsaW5rIHBsdWdpblVyaX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlQ29tcG9uZW50RGlycyhwbHVnaW5Vcmk6IFVSSSwgZGVmYXVsdERpcjogc3RyaW5nLCBjb25maWc6IElDb21wb25lbnRQYXRoQ29uZmlnLCBib3VuZGFyeVVyaT86IFVSSSk6IHJlYWRvbmx5IFVSSVtdIHtcblx0Y29uc3QgYm91bmRhcnkgPSAoYm91bmRhcnlVcmkgJiYgaXNFcXVhbE9yUGFyZW50KHBsdWdpblVyaSwgYm91bmRhcnlVcmkpKSA/IGJvdW5kYXJ5VXJpIDogcGx1Z2luVXJpO1xuXHRjb25zdCBkaXJzOiBVUklbXSA9IFtdO1xuXHRpZiAoIWNvbmZpZy5leGNsdXNpdmUpIHtcblx0XHRkaXJzLnB1c2goam9pblBhdGgocGx1Z2luVXJpLCBkZWZhdWx0RGlyKSk7XG5cdH1cblx0Zm9yIChjb25zdCBwIG9mIGNvbmZpZy5wYXRocykge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gbm9ybWFsaXplUGF0aChqb2luUGF0aChwbHVnaW5VcmksIHApKTtcblx0XHRpZiAoaXNFcXVhbE9yUGFyZW50KHJlc29sdmVkLCBib3VuZGFyeSkpIHtcblx0XHRcdGRpcnMucHVzaChyZXNvbHZlZCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBkaXJzO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIE1DUCBzZXJ2ZXIgaGVscGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogRXh0cmFjdHMgdGhlIE1DUCBzZXJ2ZXIgbWFwIGZyb20gYSByYXcgSlNPTiB2YWx1ZS4gQWNjZXB0cyBib3RoIHRoZVxuICogd3JhcHBlZCBmb3JtYXQgYHsgbWNwU2VydmVyczogeyBcdTIwMjYgfSB9YCBhbmQgdGhlIGZsYXQgZm9ybWF0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZU1jcFNlcnZlcnNNYXAocmF3OiB1bmtub3duKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJhdyB8fCB0eXBlb2YgcmF3ICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHJhdykpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG9iaiA9IHJhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0cmV0dXJuIE9iamVjdC5oYXNPd24ob2JqLCAnbWNwU2VydmVycycpXG5cdFx0PyAob2JqLm1jcFNlcnZlcnMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pXG5cdFx0OiBvYmo7XG59XG5cbi8qKlxuICogTm9ybWFsaXplcyBhIHJhdyBKU09OIHZhbHVlIGludG8gYSB0eXBlZCBNQ1Agc2VydmVyIGNvbmZpZ3VyYXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKHJhd0NvbmZpZzogdW5rbm93bik6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyYXdDb25maWcgfHwgdHlwZW9mIHJhd0NvbmZpZyAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgY2FuZGlkYXRlID0gcmF3Q29uZmlnIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRjb25zdCB0eXBlID0gdHlwZW9mIGNhbmRpZGF0ZVsndHlwZSddID09PSAnc3RyaW5nJyA/IGNhbmRpZGF0ZVsndHlwZSddIDogdW5kZWZpbmVkO1xuXG5cdGNvbnN0IGNvbW1hbmQgPSB0eXBlb2YgY2FuZGlkYXRlWydjb21tYW5kJ10gPT09ICdzdHJpbmcnID8gY2FuZGlkYXRlWydjb21tYW5kJ10gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IHVybCA9IHR5cGVvZiBjYW5kaWRhdGVbJ3VybCddID09PSAnc3RyaW5nJyA/IGNhbmRpZGF0ZVsndXJsJ10gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGFyZ3MgPSBBcnJheS5pc0FycmF5KGNhbmRpZGF0ZVsnYXJncyddKSA/IGNhbmRpZGF0ZVsnYXJncyddLmZpbHRlcigodmFsdWUpOiB2YWx1ZSBpcyBzdHJpbmcgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGVudiA9IGNhbmRpZGF0ZVsnZW52J10gJiYgdHlwZW9mIGNhbmRpZGF0ZVsnZW52J10gPT09ICdvYmplY3QnXG5cdFx0PyBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMoY2FuZGlkYXRlWydlbnYnXSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilcblx0XHRcdC5maWx0ZXIoKFssIHZhbHVlXSkgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHZhbHVlID09PSBudWxsKVxuXHRcdFx0Lm1hcCgoW2tleSwgdmFsdWVdKSA9PiBba2V5LCB2YWx1ZSBhcyBzdHJpbmcgfCBudW1iZXIgfCBudWxsXSkpXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IGVudkZpbGUgPSB0eXBlb2YgY2FuZGlkYXRlWydlbnZGaWxlJ10gPT09ICdzdHJpbmcnID8gY2FuZGlkYXRlWydlbnZGaWxlJ10gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGN3ZCA9IHR5cGVvZiBjYW5kaWRhdGVbJ2N3ZCddID09PSAnc3RyaW5nJyA/IGNhbmRpZGF0ZVsnY3dkJ10gOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGhlYWRlcnMgPSBjYW5kaWRhdGVbJ2hlYWRlcnMnXSAmJiB0eXBlb2YgY2FuZGlkYXRlWydoZWFkZXJzJ10gPT09ICdvYmplY3QnXG5cdFx0PyBPYmplY3QuZnJvbUVudHJpZXMoT2JqZWN0LmVudHJpZXMoY2FuZGlkYXRlWydoZWFkZXJzJ10gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pXG5cdFx0XHQuZmlsdGVyKChbLCB2YWx1ZV0pID0+IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpXG5cdFx0XHQubWFwKChba2V5LCB2YWx1ZV0pID0+IFtrZXksIHZhbHVlIGFzIHN0cmluZ10pKVxuXHRcdDogdW5kZWZpbmVkO1xuXHRjb25zdCBkZXYgPSBjYW5kaWRhdGVbJ2RldiddICYmIHR5cGVvZiBjYW5kaWRhdGVbJ2RldiddID09PSAnb2JqZWN0JyA/IGNhbmRpZGF0ZVsnZGV2J10gYXMgSU1jcFN0ZGlvU2VydmVyQ29uZmlndXJhdGlvblsnZGV2J10gOiB1bmRlZmluZWQ7XG5cblx0aWYgKHR5cGUgPT09ICd3cycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0aWYgKHR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwgfHwgKCF0eXBlICYmIGNvbW1hbmQpKSB7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLCBjb21tYW5kLCBhcmdzLCBlbnYsIGVudkZpbGUsIGN3ZCwgZGV2IH07XG5cdH1cblxuXHRpZiAodHlwZSA9PT0gTWNwU2VydmVyVHlwZS5SRU1PVEUgfHwgdHlwZSA9PT0gJ3N0cmVhbWFibGUtaHR0cCcgfHwgdHlwZSA9PT0gJ3NzZScgfHwgKCF0eXBlICYmIHVybCkpIHtcblx0XHRpZiAoIXVybCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdHlwZTogTWNwU2VydmVyVHlwZS5SRU1PVEUsIHVybCwgaGVhZGVycywgZGV2IH07XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIENoYXJhY3RlcnMgaW4gYSBmaWxlIHBhdGggdGhhdCByZXF1aXJlIHNoZWxsIHF1b3RpbmcgdG8gcHJldmVudFxuICogd29yZCBzcGxpdHRpbmcgb3IgaW50ZXJwcmV0YXRpb24gYnkgY29tbW9uIHNoZWxscy5cbiAqL1xuY29uc3Qgc2hlbGxVbnNhZmVDaGFycyA9IC9bXFxzJnw8PigpXjshYFwiJ10vO1xuXG4vKipcbiAqIFJlcGxhY2VzIGEgcGx1Z2luLXJvb3QgdG9rZW4gaW4gYSBzaGVsbCBjb21tYW5kIHN0cmluZyB3aXRoIHRoZVxuICogZ2l2ZW4gZnNQYXRoLCBzaGVsbC1xdW90aW5nIGlmIHRoZSBwYXRoIGNvbnRhaW5zIHNwZWNpYWwgY2hhcmFjdGVycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKGNvbW1hbmQ6IHN0cmluZywgZnNQYXRoOiBzdHJpbmcsIHRva2VuOiBzdHJpbmcpIHtcblx0aWYgKCFjb21tYW5kLmluY2x1ZGVzKHRva2VuKSkge1xuXHRcdHJldHVybiBjb21tYW5kO1xuXHR9XG5cblx0aWYgKCFzaGVsbFVuc2FmZUNoYXJzLnRlc3QoZnNQYXRoKSkge1xuXHRcdHJldHVybiBjb21tYW5kLnJlcGxhY2VBbGwodG9rZW4sIGZzUGF0aCk7XG5cdH1cblxuXHRjb25zdCBlc2NhcGVkVG9rZW4gPSBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHRva2VuKTtcblx0Y29uc3QgcGF0dGVybiA9IG5ldyBSZWdFeHAoXG5cdFx0YChbXCInXT8pYCArIGVzY2FwZWRUb2tlbiArIGAoW1xcXFx3Li9cXFxcXFxcXH46LV0qKWAsXG5cdFx0J2cnLFxuXHQpO1xuXG5cdHJldHVybiBjb21tYW5kLnJlcGxhY2UocGF0dGVybiwgKF9tYXRjaCwgbGVhZGluZ1F1b3RlOiBzdHJpbmcsIHN1ZmZpeDogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3QgZnVsbFBhdGggPSBmc1BhdGggKyBzdWZmaXg7XG5cdFx0aWYgKGxlYWRpbmdRdW90ZSkge1xuXHRcdFx0cmV0dXJuIGxlYWRpbmdRdW90ZSArIGZ1bGxQYXRoO1xuXHRcdH1cblx0XHRyZXR1cm4gJ1wiJyArIGZ1bGxQYXRoLnJlcGxhY2UoL1wiL2csICdcXFxcXCInKSArICdcIic7XG5cdH0pO1xufVxuXG4vKipcbiAqIFJlcGxhY2VzIHBsdWdpbi1yb290IHRva2VuIHJlZmVyZW5jZXMgaW4gTUNQIHNlcnZlciBkZWZpbml0aW9uIHN0cmluZyBmaWVsZHNcbiAqIHdpdGggdGhlIHBsdWdpbiByb290IGZpbGVzeXN0ZW0gcGF0aC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludGVycG9sYXRlTWNwUGx1Z2luUm9vdChcblx0ZGVmOiBJTWNwU2VydmVyRGVmaW5pdGlvbixcblx0ZnNQYXRoOiBzdHJpbmcsXG5cdHRva2VuczogcmVhZG9ubHkgc3RyaW5nW10sXG5cdGVudlZhcnM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuKTogSU1jcFNlcnZlckRlZmluaXRpb24ge1xuXHRjb25zdCByZXBsYWNlID0gKHM6IHN0cmluZykgPT4gdG9rZW5zLnJlZHVjZSgocmVzdWx0LCB0b2tlbikgPT4gcmVzdWx0LnJlcGxhY2VBbGwodG9rZW4sIGZzUGF0aCksIHMpO1xuXG5cdGNvbnN0IGNvbmZpZyA9IGRlZi5jb25maWd1cmF0aW9uO1xuXHRsZXQgaW50ZXJwb2xhdGVkOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbjtcblxuXHRpZiAoY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRjb25zdCBsb2NhbDogTXV0YWJsZTxJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uPiA9IHsgLi4uY29uZmlnIH07XG5cdFx0bG9jYWwuY29tbWFuZCA9IHJlcGxhY2UobG9jYWwuY29tbWFuZCk7XG5cdFx0aWYgKGxvY2FsLmFyZ3MpIHtcblx0XHRcdGxvY2FsLmFyZ3MgPSBsb2NhbC5hcmdzLm1hcChyZXBsYWNlKTtcblx0XHR9XG5cdFx0aWYgKGxvY2FsLmN3ZCkge1xuXHRcdFx0bG9jYWwuY3dkID0gcmVwbGFjZShsb2NhbC5jd2QpO1xuXHRcdH1cblx0XHRsb2NhbC5lbnYgPSB7IC4uLmxvY2FsLmVudiB9O1xuXHRcdGZvciAoY29uc3QgW2ssIHZdIG9mIE9iamVjdC5lbnRyaWVzKGxvY2FsLmVudikpIHtcblx0XHRcdGlmICh0eXBlb2YgdiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0bG9jYWwuZW52W2tdID0gcmVwbGFjZSh2KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBlbnZWYXIgb2YgZW52VmFycykge1xuXHRcdFx0bG9jYWwuZW52W2VudlZhcl0gPSBmc1BhdGg7XG5cdFx0fVxuXHRcdGlmIChsb2NhbC5lbnZGaWxlKSB7XG5cdFx0XHRsb2NhbC5lbnZGaWxlID0gcmVwbGFjZShsb2NhbC5lbnZGaWxlKTtcblx0XHR9XG5cdFx0aW50ZXJwb2xhdGVkID0gbG9jYWw7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgcmVtb3RlOiBNdXRhYmxlPElNY3BSZW1vdGVTZXJ2ZXJDb25maWd1cmF0aW9uPiA9IHsgLi4uY29uZmlnIH07XG5cdFx0cmVtb3RlLnVybCA9IHJlcGxhY2UocmVtb3RlLnVybCk7XG5cdFx0aWYgKHJlbW90ZS5oZWFkZXJzKSB7XG5cdFx0XHRyZW1vdGUuaGVhZGVycyA9IE9iamVjdC5mcm9tRW50cmllcyhcblx0XHRcdFx0T2JqZWN0LmVudHJpZXMocmVtb3RlLmhlYWRlcnMpLm1hcCgoW2ssIHZdKSA9PiBbaywgcmVwbGFjZSh2KV0pXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpbnRlcnBvbGF0ZWQgPSByZW1vdGU7XG5cdH1cblxuXHRyZXR1cm4geyBuYW1lOiBkZWYubmFtZSwgY29uZmlndXJhdGlvbjogaW50ZXJwb2xhdGVkLCB1cmk6IGRlZi51cmksIGN1c3RvbWl6YXRpb246IGRlZi5jdXN0b21pemF0aW9uIH07XG59XG5cbi8qKlxuICogUmVnZXggbWF0Y2hpbmcgYmFyZSBgJHtWQVJfTkFNRX1gIHJlZmVyZW5jZXMgKHVwcGVyY2FzZSBvbmx5KSB0aGF0IGFyZSBOT1RcbiAqIHVzaW5nIFZTIENvZGUncyBgJHtlbnY6VkFSfWAgY29sb24tZGVsaW1pdGVkIHN5bnRheC5cbiAqL1xuY29uc3QgQkFSRV9FTlZfVkFSX1JFID0gL1xcJFxceyg/IVtBLVphLXpdKzopKFtBLVpfXVtBLVowLTlfXSopXFx9L2c7XG5cbi8qKlxuICogQ29udmVydHMgYmFyZSBgJHtWQVJ9YCBlbnZpcm9ubWVudC12YXJpYWJsZSByZWZlcmVuY2VzIHRvIFZTIENvZGUgYCR7ZW52OlZBUn1gIHN5bnRheC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KFxuXHRkZWY6IElNY3BTZXJ2ZXJEZWZpbml0aW9uLFxuKTogSU1jcFNlcnZlckRlZmluaXRpb24ge1xuXHRyZXR1cm4gY2xvbmVBbmRDaGFuZ2UoZGVmLCAodmFsdWUpID0+IHtcblx0XHRpZiAoVVJJLmlzVXJpKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29uc3QgcmVwbGFjZWQgPSB2YWx1ZS5yZXBsYWNlKEJBUkVfRU5WX1ZBUl9SRSwgJyR7ZW52OiQxfScpO1xuXHRcdFx0cmV0dXJuIHJlcGxhY2VkICE9PSB2YWx1ZSA/IHJlcGxhY2VkIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9KTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBIb29rIHBhcnNpbmcgaGVscGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogTWFwcyBrbm93biBob29rIHR5cGUgaWRlbnRpZmllcnMgZnJvbSBhbGwgZm9ybWF0cyAoVlMgQ29kZSBQYXNjYWxDYXNlLFxuICogQ29waWxvdCBDTEkgY2FtZWxDYXNlLCBDbGF1ZGUgUGFzY2FsQ2FzZSkgdG8gY2Fub25pY2FsIGlkZW50aWZpZXJzLlxuICovXG5jb25zdCBIT09LX1RZUEVfTUFQOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHQvLyBQYXNjYWxDYXNlIChWUyBDb2RlIC8gQ2xhdWRlKVxuXHQnU2Vzc2lvblN0YXJ0JzogJ1Nlc3Npb25TdGFydCcsXG5cdCdTZXNzaW9uRW5kJzogJ1Nlc3Npb25FbmQnLFxuXHQnVXNlclByb21wdFN1Ym1pdCc6ICdVc2VyUHJvbXB0U3VibWl0Jyxcblx0J1ByZVRvb2xVc2UnOiAnUHJlVG9vbFVzZScsXG5cdCdQb3N0VG9vbFVzZSc6ICdQb3N0VG9vbFVzZScsXG5cdCdQcmVDb21wYWN0JzogJ1ByZUNvbXBhY3QnLFxuXHQnU3ViYWdlbnRTdGFydCc6ICdTdWJhZ2VudFN0YXJ0Jyxcblx0J1N1YmFnZW50U3RvcCc6ICdTdWJhZ2VudFN0b3AnLFxuXHQnU3RvcCc6ICdTdG9wJyxcblx0J0Vycm9yT2NjdXJyZWQnOiAnRXJyb3JPY2N1cnJlZCcsXG5cdC8vIGNhbWVsQ2FzZSAoR2l0SHViIENvcGlsb3QgQ0xJKVxuXHQnc2Vzc2lvblN0YXJ0JzogJ1Nlc3Npb25TdGFydCcsXG5cdCdzZXNzaW9uRW5kJzogJ1Nlc3Npb25FbmQnLFxuXHQndXNlclByb21wdFN1Ym1pdHRlZCc6ICdVc2VyUHJvbXB0U3VibWl0Jyxcblx0J3ByZVRvb2xVc2UnOiAnUHJlVG9vbFVzZScsXG5cdCdwb3N0VG9vbFVzZSc6ICdQb3N0VG9vbFVzZScsXG5cdCdhZ2VudFN0b3AnOiAnU3RvcCcsXG5cdCdzdWJhZ2VudFN0b3AnOiAnU3ViYWdlbnRTdG9wJyxcblx0J2Vycm9yT2NjdXJyZWQnOiAnRXJyb3JPY2N1cnJlZCcsXG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZXMgYSByYXcgaG9vayBjb21tYW5kIG9iamVjdCwgdmFsaWRhdGluZyBzdHJ1Y3R1cmUgYW5kIG1hcHBpbmdcbiAqIGxlZ2FjeSBgYmFzaGAvYHBvd2Vyc2hlbGxgIGZpZWxkcyB0byBwbGF0Zm9ybS1zcGVjaWZpYyBvdmVycmlkZXMuXG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUhvb2tDb21tYW5kKHJhdzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBJUGFyc2VkSG9va0NvbW1hbmQgfCB1bmRlZmluZWQge1xuXHQvLyBBbGxvdyBvbWl0dGVkIHR5cGUgKENsYXVkZSBjb21wYXRpYmlsaXR5KSBcdTIwMTQgdHJlYXQgYXMgJ2NvbW1hbmQnXG5cdGlmIChyYXcudHlwZSAhPT0gdW5kZWZpbmVkICYmIHJhdy50eXBlICE9PSAnY29tbWFuZCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgaGFzQ29tbWFuZCA9IHR5cGVvZiByYXcuY29tbWFuZCA9PT0gJ3N0cmluZycgJiYgcmF3LmNvbW1hbmQubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzQmFzaCA9IHR5cGVvZiByYXcuYmFzaCA9PT0gJ3N0cmluZycgJiYgKHJhdy5iYXNoIGFzIHN0cmluZykubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzUG93ZXJTaGVsbCA9IHR5cGVvZiByYXcucG93ZXJzaGVsbCA9PT0gJ3N0cmluZycgJiYgKHJhdy5wb3dlcnNoZWxsIGFzIHN0cmluZykubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzV2luZG93cyA9IHR5cGVvZiByYXcud2luZG93cyA9PT0gJ3N0cmluZycgJiYgKHJhdy53aW5kb3dzIGFzIHN0cmluZykubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzTGludXggPSB0eXBlb2YgcmF3LmxpbnV4ID09PSAnc3RyaW5nJyAmJiAocmF3LmxpbnV4IGFzIHN0cmluZykubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzT3N4ID0gdHlwZW9mIHJhdy5vc3ggPT09ICdzdHJpbmcnICYmIChyYXcub3N4IGFzIHN0cmluZykubGVuZ3RoID4gMDtcblxuXHRpZiAoIWhhc0NvbW1hbmQgJiYgIWhhc0Jhc2ggJiYgIWhhc1Bvd2VyU2hlbGwgJiYgIWhhc1dpbmRvd3MgJiYgIWhhc0xpbnV4ICYmICFoYXNPc3gpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3Qgd2luZG93cyA9IGhhc1dpbmRvd3MgPyByYXcud2luZG93cyBhcyBzdHJpbmcgOiAoaGFzUG93ZXJTaGVsbCA/IHJhdy5wb3dlcnNoZWxsIGFzIHN0cmluZyA6IHVuZGVmaW5lZCk7XG5cdGNvbnN0IGxpbnV4ID0gaGFzTGludXggPyByYXcubGludXggYXMgc3RyaW5nIDogKGhhc0Jhc2ggPyByYXcuYmFzaCBhcyBzdHJpbmcgOiB1bmRlZmluZWQpO1xuXHRjb25zdCBvc3ggPSBoYXNPc3ggPyByYXcub3N4IGFzIHN0cmluZyA6IChoYXNCYXNoID8gcmF3LmJhc2ggYXMgc3RyaW5nIDogdW5kZWZpbmVkKTtcblxuXHRjb25zdCB0aW1lb3V0ID0gdHlwZW9mIHJhdy50aW1lb3V0ID09PSAnbnVtYmVyJ1xuXHRcdD8gcmF3LnRpbWVvdXRcblx0XHQ6ICh0eXBlb2YgcmF3LnRpbWVvdXRTZWMgPT09ICdudW1iZXInID8gcmF3LnRpbWVvdXRTZWMgOiB1bmRlZmluZWQpO1xuXG5cdHJldHVybiB7XG5cdFx0Li4uKGhhc0NvbW1hbmQgJiYgeyBjb21tYW5kOiByYXcuY29tbWFuZCBhcyBzdHJpbmcgfSksXG5cdFx0Li4uKHdpbmRvd3MgJiYgeyB3aW5kb3dzIH0pLFxuXHRcdC4uLihsaW51eCAmJiB7IGxpbnV4IH0pLFxuXHRcdC4uLihvc3ggJiYgeyBvc3ggfSksXG5cdFx0Li4uKHR5cGVvZiByYXcuZW52ID09PSAnb2JqZWN0JyAmJiByYXcuZW52ICE9PSBudWxsICYmIHsgZW52OiByYXcuZW52IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSksXG5cdFx0Li4uKHRpbWVvdXQgIT09IHVuZGVmaW5lZCAmJiB7IHRpbWVvdXQgfSksXG5cdH07XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgYSByYXcgaG9vayBjb21tYW5kIEpTT04gb2JqZWN0IGludG8gYSB7QGxpbmsgSVBhcnNlZEhvb2tDb21tYW5kfSxcbiAqIG5vcm1hbGl6aW5nIGZpZWxkcyBhbmQgcmVzb2x2aW5nIHRoZSB3b3JraW5nIGRpcmVjdG9yeS5cbiAqL1xuZnVuY3Rpb24gcmVzb2x2ZUhvb2tDb21tYW5kKHJhdzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHdvcmtzcGFjZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZCwgdXNlckhvbWU6IFVSSSk6IElQYXJzZWRIb29rQ29tbWFuZCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVIb29rQ29tbWFuZChyYXcpO1xuXHRpZiAoIW5vcm1hbGl6ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0bGV0IGN3ZFVyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRjb25zdCByYXdDd2QgPSB0eXBlb2YgcmF3LmN3ZCA9PT0gJ3N0cmluZycgPyByYXcuY3dkIDogdW5kZWZpbmVkO1xuXHRpZiAocmF3Q3dkKSB7XG5cdFx0aWYgKHJhd0N3ZC5zdGFydHNXaXRoKCd+LycpKSB7XG5cdFx0XHRjd2RVcmkgPSBVUkkuam9pblBhdGgodXNlckhvbWUsIHJhd0N3ZC5zdWJzdHJpbmcoMikpO1xuXHRcdH0gZWxzZSBpZiAoaXNBYnNvbHV0ZShyYXdDd2QpKSB7XG5cdFx0XHRjd2RVcmkgPSBVUkkuZmlsZShyYXdDd2QpO1xuXHRcdH0gZWxzZSBpZiAod29ya3NwYWNlUm9vdCkge1xuXHRcdFx0Y3dkVXJpID0gam9pblBhdGgod29ya3NwYWNlUm9vdCwgcmF3Q3dkKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y3dkVXJpID0gd29ya3NwYWNlUm9vdDtcblx0fVxuXG5cdHJldHVybiB7IC4uLm5vcm1hbGl6ZWQsIGN3ZDogY3dkVXJpIH07XG59XG5cbi8qKlxuICogRXh0cmFjdHMgaG9vayBjb21tYW5kcyBmcm9tIGFuIGl0ZW0gdGhhdCBtYXkgYmUgYSBkaXJlY3QgY29tbWFuZCBvYmplY3RcbiAqIG9yIGEgbmVzdGVkIHN0cnVjdHVyZSB3aXRoIGEgYG1hdGNoZXJgIChDbGF1ZGUgZm9ybWF0KS5cbiAqL1xuZnVuY3Rpb24gZXh0cmFjdEhvb2tDb21tYW5kcyhpdGVtOiB1bmtub3duLCB3b3Jrc3BhY2VSb290OiBVUkkgfCB1bmRlZmluZWQsIHVzZXJIb21lOiBVUkkpOiBJUGFyc2VkSG9va0NvbW1hbmRbXSB7XG5cdGlmICghaXRlbSB8fCB0eXBlb2YgaXRlbSAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBpdGVtT2JqID0gaXRlbSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0Y29uc3QgY29tbWFuZHM6IElQYXJzZWRIb29rQ29tbWFuZFtdID0gW107XG5cblx0Ly8gTmVzdGVkIGhvb2tzIHdpdGggbWF0Y2hlciAoQ2xhdWRlIHN0eWxlKTogeyBtYXRjaGVyOiBcIi4uLlwiLCBob29rczogWy4uLl0gfVxuXHRjb25zdCBuZXN0ZWRIb29rcyA9IGl0ZW1PYmouaG9va3M7XG5cdGlmIChuZXN0ZWRIb29rcyAhPT0gdW5kZWZpbmVkICYmIEFycmF5LmlzQXJyYXkobmVzdGVkSG9va3MpKSB7XG5cdFx0Zm9yIChjb25zdCBuZXN0ZWQgb2YgbmVzdGVkSG9va3MpIHtcblx0XHRcdGlmICghbmVzdGVkIHx8IHR5cGVvZiBuZXN0ZWQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlSG9va0NvbW1hbmQobmVzdGVkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0Y29tbWFuZHMucHVzaChyZXNvbHZlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZUhvb2tDb21tYW5kKGl0ZW1PYmosIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdGNvbW1hbmRzLnB1c2gocmVzb2x2ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBjb21tYW5kcztcbn1cblxuLyoqXG4gKiBQYXJzZXMgaG9va3MgZnJvbSBhIEpTT04gb2JqZWN0IChhbnkgc3VwcG9ydGVkIGZvcm1hdCkuXG4gKlxuICogSGFuZGxlcyBDbGF1ZGUncyBgZGlzYWJsZUFsbEhvb2tzYCBzaG9ydC1jaXJjdWl0LCB0aGUgYEhPT0tfVFlQRV9NQVBgXG4gKiBjYW5vbmljYWxpemF0aW9uLCBhbmQgdGhlIG5lc3RlZCBgeyBtYXRjaGVyLCBob29rczogWy4uLl0gfWAgY29tbWFuZFxuICogZm9ybS4gUmV0dXJucyBvbmUge0BsaW5rIElQYXJzZWRIb29rR3JvdXB9IHBlciByZWNvZ25pemVkIGxpZmVjeWNsZVxuICogZXZlbnQ7IGFsbCBncm91cHMgcGFyc2VkIGZyb20gdGhlIHNhbWUgZmlsZSBzaGFyZSBhIHNpbmdsZVxuICoge0BsaW5rIElQYXJzZWRIb29rR3JvdXAuY3VzdG9taXphdGlvbn0gKGtleWVkIG9uIGBob29rVXJpYCksIHNvIGNhbGxlcnNcbiAqIHRoYXQgb25seSBuZWVkIHRoZSBmaWxlLWxldmVsIGN1c3RvbWl6YXRpb24gY2FuIHJlYWQgaXQgb2ZmIGFueSBncm91cC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlSG9va3NKc29uKFxuXHRob29rVXJpOiBVUkksXG5cdGpzb246IHVua25vd24sXG5cdHdvcmtzcGFjZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZCxcblx0dXNlckhvbWU6IFVSSSxcbik6IElQYXJzZWRIb29rR3JvdXBbXSB7XG5cdGlmICghanNvbiB8fCB0eXBlb2YganNvbiAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCByb290ID0ganNvbiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblxuXHQvLyBDbGF1ZGUncyBkaXNhYmxlQWxsSG9va3Ncblx0aWYgKHJvb3QuZGlzYWJsZUFsbEhvb2tzID09PSB0cnVlKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgaG9va3MgPSByb290Lmhvb2tzO1xuXHRpZiAoIWhvb2tzIHx8IHR5cGVvZiBob29rcyAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBob29rc09iaiA9IGhvb2tzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRjb25zdCByZXN1bHQ6IElQYXJzZWRIb29rR3JvdXBbXSA9IFtdO1xuXHRjb25zdCBjdXN0b21pemF0aW9uID0gbWFrZUhvb2tDdXN0b21pemF0aW9uKGhvb2tVcmkpO1xuXG5cdGZvciAoY29uc3Qgb3JpZ2luYWxJZCBvZiBPYmplY3Qua2V5cyhob29rc09iaikpIHtcblx0XHRjb25zdCBjYW5vbmljYWxUeXBlID0gSE9PS19UWVBFX01BUFtvcmlnaW5hbElkXTtcblx0XHRpZiAoIWNhbm9uaWNhbFR5cGUpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvb2tBcnJheSA9IGhvb2tzT2JqW29yaWdpbmFsSWRdO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShob29rQXJyYXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kczogSVBhcnNlZEhvb2tDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaG9va0FycmF5KSB7XG5cdFx0XHRjb21tYW5kcy5wdXNoKC4uLmV4dHJhY3RIb29rQ29tbWFuZHMoaXRlbSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpKTtcblx0XHR9XG5cblx0XHRpZiAoY29tbWFuZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyB0eXBlOiBjYW5vbmljYWxUeXBlLCBjb21tYW5kcywgdXJpOiBob29rVXJpLCBvcmlnaW5hbElkLCBjdXN0b21pemF0aW9uIH0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQXBwbGllcyBwbHVnaW4tcm9vdCB0b2tlbiBpbnRlcnBvbGF0aW9uIHRvIGhvb2sgY29tbWFuZHMgZm9yXG4gKiBDbGF1ZGUgYW5kIE9wZW5QbHVnaW4gZm9ybWF0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludGVycG9sYXRlSG9va1BsdWdpblJvb3QoXG5cdGhvb2tVcmk6IFVSSSxcblx0anNvbjogdW5rbm93bixcblx0cGx1Z2luVXJpOiBVUkksXG5cdHdvcmtzcGFjZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZCxcblx0dXNlckhvbWU6IFVSSSxcblx0dG9rZW46IHN0cmluZyxcblx0ZW52VmFyOiBzdHJpbmcsXG4pOiBJUGFyc2VkSG9va0dyb3VwW10ge1xuXHRjb25zdCBmc1BhdGggPSBwbHVnaW5VcmkuZnNQYXRoO1xuXHRjb25zdCB0eXBlZEpzb24gPSBqc29uIGFzIHsgaG9va3M/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duW10+IH07XG5cblx0Y29uc3QgbXV0YXRlSG9va0NvbW1hbmQgPSAoaG9vazogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkID0+IHtcblx0XHRmb3IgKGNvbnN0IGZpZWxkIG9mIFsnY29tbWFuZCcsICd3aW5kb3dzJywgJ2xpbnV4JywgJ29zeCddIGFzIGNvbnN0KSB7XG5cdFx0XHRpZiAodHlwZW9mIGhvb2tbZmllbGRdID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRob29rW2ZpZWxkXSA9IHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKGhvb2tbZmllbGRdIGFzIHN0cmluZywgZnNQYXRoLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFob29rLmVudiB8fCB0eXBlb2YgaG9vay5lbnYgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRob29rLmVudiA9IHt9O1xuXHRcdH1cblx0XHQoaG9vay5lbnYgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPilbZW52VmFyXSA9IGZzUGF0aDtcblx0fTtcblxuXHRmb3IgKGNvbnN0IGxpZmVjeWNsZSBvZiBPYmplY3QudmFsdWVzKHR5cGVkSnNvbi5ob29rcyA/PyB7fSkpIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkobGlmZWN5Y2xlKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbGlmZWN5Y2xlRW50cnkgb2YgbGlmZWN5Y2xlKSB7XG5cdFx0XHRpZiAoIWxpZmVjeWNsZUVudHJ5IHx8IHR5cGVvZiBsaWZlY3ljbGVFbnRyeSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRyeSA9IGxpZmVjeWNsZUVudHJ5IGFzIHsgaG9va3M/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPltdIH0gJiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGVudHJ5Lmhvb2tzKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGhvb2sgb2YgZW50cnkuaG9va3MpIHtcblx0XHRcdFx0XHRtdXRhdGVIb29rQ29tbWFuZChob29rKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bXV0YXRlSG9va0NvbW1hbmQoZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHJlcGxhY2VyID0gKHY6IHVua25vd24pOiB1bmtub3duID0+IHtcblx0XHRyZXR1cm4gdHlwZW9mIHYgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IHYucmVwbGFjZUFsbCh0b2tlbiwgcGx1Z2luVXJpLmZzUGF0aClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9O1xuXG5cdHJldHVybiBwYXJzZUhvb2tzSnNvbihob29rVXJpLCBjbG9uZUFuZENoYW5nZShqc29uLCByZXBsYWNlciksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBGaWxlc3lzdGVtIGhlbHBlcnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZEpzb25GaWxlKHVyaTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTx1bmtub3duIHwgdW5kZWZpbmVkPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRyZXR1cm4gcGFyc2VKU09OQyhmaWxlQ29udGVudHMudmFsdWUudG9TdHJpbmcoKSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhdGhFeGlzdHMocmVzb3VyY2U6IFVSSSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHR0cnkge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBDb21wb25lbnQgcmVhZGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IENPTU1BTkRfRklMRV9TVUZGSVggPSAnLm1kJztcbmNvbnN0IFJVTEVfRklMRV9TVUZGSVggPSAnLm1kYyc7XG5jb25zdCBJTlNUUlVDVElPTl9GSUxFX1NVRkZJWCA9ICcuaW5zdHJ1Y3Rpb25zLm1kJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRTa2lsbHMoXG5cdHBsdWdpblJvb3Q6IFVSSSxcblx0ZGlyczogcmVhZG9ubHkgVVJJW10sXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdG9wdGlvbnM/OiB7IHJlYWRvbmx5IGNoaWxkRGlyZWN0b3JpZXNPbmx5PzogYm9vbGVhbjsgcmVhZG9ubHkgY29udGFpbm1lbnRSb290PzogVVJJIH0sXG4pOiBQcm9taXNlPHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10+IHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBza2lsbHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbXTtcblxuXHRjb25zdCBhZGRTa2lsbCA9IGFzeW5jIChuYW1lOiBzdHJpbmcsIHNraWxsTWQ6IFVSSSkgPT4ge1xuXHRcdGlmIChvcHRpb25zPy5jb250YWlubWVudFJvb3QgJiYgIWF3YWl0IGlzUmVzb2x2ZWRXaXRoaW4ob3B0aW9ucy5jb250YWlubWVudFJvb3QsIHNraWxsTWQsIGZpbGVTZXJ2aWNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkSW5mbyA9IGF3YWl0IHBhcnNlU2tpbGxGaWxlKHNraWxsTWQsIGZpbGVTZXJ2aWNlKTtcblx0XHRcdGRlc2NyaXB0aW9uID0gcGFyc2VkSW5mby5kZXNjcmlwdGlvbjtcblx0XHRcdG5hbWUgPSBwYXJzZWRJbmZvLm5hbWUgfHwgbmFtZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIEtlZXAgdGhlIGV4aXN0aW5nIGJlc3QtZWZmb3J0IGRpc2NvdmVyeSBiZWhhdmlvciBmb3IgbWFsZm9ybWVkIHNraWxscy5cblx0XHR9XG5cdFx0aWYgKHNlZW4uaGFzKG5hbWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlZW4uYWRkKG5hbWUpO1xuXHRcdHNraWxscy5wdXNoKHsgdXJpOiBza2lsbE1kLCBuYW1lLCAuLi4oZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uIH0gOiB7fSkgfSk7XG5cdH07XG5cblx0YXdhaXQgUHJvbWlzZS5hbGwoZGlycy5tYXAoYXN5bmMgZGlyID0+IHtcblx0XHRpZiAoIW9wdGlvbnM/LmNoaWxkRGlyZWN0b3JpZXNPbmx5KSB7XG5cdFx0XHRjb25zdCBza2lsbE1kID0gVVJJLmpvaW5QYXRoKGRpciwgJ1NLSUxMLm1kJyk7XG5cdFx0XHRpZiAoYXdhaXQgcGF0aEV4aXN0cyhza2lsbE1kLCBmaWxlU2VydmljZSkpIHtcblx0XHRcdFx0YXdhaXQgYWRkU2tpbGwoYmFzZW5hbWUoZGlyKSwgc2tpbGxNZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoZGlyKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXQuaXNEaXJlY3RvcnkgfHwgIXN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChzdGF0LmNoaWxkcmVuLm1hcChhc3luYyBjaGlsZCA9PiB7XG5cdFx0XHRjb25zdCBjaGlsZFNraWxsTWQgPSBVUkkuam9pblBhdGgoY2hpbGQucmVzb3VyY2UsICdTS0lMTC5tZCcpO1xuXHRcdFx0aWYgKGF3YWl0IHBhdGhFeGlzdHMoY2hpbGRTa2lsbE1kLCBmaWxlU2VydmljZSkpIHtcblx0XHRcdFx0YXdhaXQgYWRkU2tpbGwoYmFzZW5hbWUoY2hpbGQucmVzb3VyY2UpLCBjaGlsZFNraWxsTWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fSkpO1xuXG5cdGlmICghb3B0aW9ucz8uY2hpbGREaXJlY3Rvcmllc09ubHkgJiYgc2tpbGxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdGNvbnN0IHJvb3RTa2lsbE1kID0gVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdTS0lMTC5tZCcpO1xuXHRcdGlmIChhd2FpdCBwYXRoRXhpc3RzKHJvb3RTa2lsbE1kLCBmaWxlU2VydmljZSkpIHtcblx0XHRcdGF3YWl0IGFkZFNraWxsKGJhc2VuYW1lKHBsdWdpblJvb3QpLCByb290U2tpbGxNZCk7XG5cdFx0fVxuXHR9XG5cblx0c2tpbGxzLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXHRyZXR1cm4gc2tpbGxzO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZFBsdWdpblNraWxscyhwbHVnaW5Sb290OiBVUkksIGRpcnM6IHJlYWRvbmx5IFVSSVtdLCBmb3JtYXQ6IElQbHVnaW5Gb3JtYXRDb25maWcsIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10+IHtcblx0cmV0dXJuIHJlYWRTa2lsbHMocGx1Z2luUm9vdCwgZGlycywgZmlsZVNlcnZpY2UsIGZvcm1hdC5mb3JtYXQgPT09IFBsdWdpbkZvcm1hdC5BZ2VudFBsdWdpblxuXHRcdD8geyBjaGlsZERpcmVjdG9yaWVzT25seTogdHJ1ZSwgY29udGFpbm1lbnRSb290OiBwbHVnaW5Sb290IH1cblx0XHQ6IHVuZGVmaW5lZCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGlzUmVzb2x2ZWRXaXRoaW4ocm9vdDogVVJJLCByZXNvdXJjZTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgW3Jlc29sdmVkUm9vdCwgcmVzb2x2ZWRSZXNvdXJjZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRmaWxlU2VydmljZS5yZWFscGF0aChyb290KSxcblx0XHRcdGZpbGVTZXJ2aWNlLnJlYWxwYXRoKHJlc291cmNlKSxcblx0XHRdKTtcblx0XHRyZXR1cm4gaXNFcXVhbE9yUGFyZW50KHJlc29sdmVkUmVzb3VyY2UgPz8gbm9ybWFsaXplUGF0aChyZXNvdXJjZSksIHJlc29sdmVkUm9vdCA/PyBub3JtYWxpemVQYXRoKHJvb3QpKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkTWFya2Rvd25Db21wb25lbnRzKGRpcnM6IHJlYWRvbmx5IFVSSVtdLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxyZWFkb25seSBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdPiB7XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgaXRlbXM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbXTtcblxuXHRjb25zdCBhZGRJdGVtID0gKG5hbWU6IHN0cmluZywgdXJpOiBVUkkpID0+IHtcblx0XHRpZiAoIXNlZW4uaGFzKG5hbWUpKSB7XG5cdFx0XHRzZWVuLmFkZChuYW1lKTtcblx0XHRcdGl0ZW1zLnB1c2goeyB1cmksIG5hbWUgfSk7XG5cdFx0fVxuXHR9O1xuXG5cdGZvciAoY29uc3QgZGlyIG9mIGRpcnMpIHtcblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoZGlyKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0LmlzRmlsZSAmJiBleHRuYW1lKGRpcikudG9Mb3dlckNhc2UoKSA9PT0gQ09NTUFORF9GSUxFX1NVRkZJWCkge1xuXHRcdFx0YWRkSXRlbShiYXNlbmFtZShkaXIpLnNsaWNlKDAsIC1DT01NQU5EX0ZJTEVfU1VGRklYLmxlbmd0aCksIGRpcik7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXQuaXNEaXJlY3RvcnkgfHwgIXN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0aWYgKCFjaGlsZC5pc0ZpbGUgfHwgZXh0bmFtZShjaGlsZC5yZXNvdXJjZSkudG9Mb3dlckNhc2UoKSAhPT0gQ09NTUFORF9GSUxFX1NVRkZJWCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGFkZEl0ZW0oYmFzZW5hbWUoY2hpbGQucmVzb3VyY2UpLnNsaWNlKDAsIC1DT01NQU5EX0ZJTEVfU1VGRklYLmxlbmd0aCksIGNoaWxkLnJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRpdGVtcy5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKTtcblx0cmV0dXJuIGl0ZW1zO1xufVxuXG5mdW5jdGlvbiBnZXRJbnN0cnVjdGlvbkZpbGVOYW1lKHJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBmaWxlTmFtZSA9IGJhc2VuYW1lKHJlc291cmNlKTtcblx0Y29uc3QgbG93ZXJOYW1lID0gZmlsZU5hbWUudG9Mb3dlckNhc2UoKTtcblx0aWYgKGxvd2VyTmFtZS5lbmRzV2l0aChSVUxFX0ZJTEVfU1VGRklYKSkge1xuXHRcdHJldHVybiBmaWxlTmFtZS5zbGljZSgwLCAtUlVMRV9GSUxFX1NVRkZJWC5sZW5ndGgpO1xuXHR9XG5cdGlmIChsb3dlck5hbWUuZW5kc1dpdGgoSU5TVFJVQ1RJT05fRklMRV9TVUZGSVgpKSB7XG5cdFx0cmV0dXJuIGZpbGVOYW1lLnNsaWNlKDAsIC1JTlNUUlVDVElPTl9GSUxFX1NVRkZJWC5sZW5ndGgpO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmVhZHMgcnVsZS9pbnN0cnVjdGlvbiBmaWxlcyBmcm9tIHBsdWdpbiBgcnVsZXNgIGNvbXBvbmVudCBkaXJlY3Rvcmllcy5cbiAqXG4gKiBPcGVuIFBsdWdpbnMgcnVsZXMgYXJlIGNvbnZlbnRpb25hbGx5IGAubWRjYCBmaWxlcy4gV2UgYWxzbyBhY2NlcHRcbiAqIGAuaW5zdHJ1Y3Rpb25zLm1kYCBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIFZTIENvZGUtZGlzY292ZXJlZCBpbnN0cnVjdGlvbnNcbiAqIGJ1bmRsZWQgYXMgc3ludGhldGljIHBsdWdpbnMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkSW5zdHJ1Y3Rpb25Db21wb25lbnRzKGRpcnM6IHJlYWRvbmx5IFVSSVtdLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxyZWFkb25seSBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdPiB7XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgaXRlbXM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbXTtcblxuXHRjb25zdCBhZGRJdGVtID0gKG5hbWU6IHN0cmluZywgdXJpOiBVUkkpID0+IHtcblx0XHRpZiAoIXNlZW4uaGFzKG5hbWUpKSB7XG5cdFx0XHRzZWVuLmFkZChuYW1lKTtcblx0XHRcdGl0ZW1zLnB1c2goeyB1cmksIG5hbWUgfSk7XG5cdFx0fVxuXHR9O1xuXG5cdGZvciAoY29uc3QgZGlyIG9mIGRpcnMpIHtcblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoZGlyKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0LmlzRmlsZSkge1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25OYW1lID0gZ2V0SW5zdHJ1Y3Rpb25GaWxlTmFtZShkaXIpO1xuXHRcdFx0aWYgKGluc3RydWN0aW9uTmFtZSkge1xuXHRcdFx0XHRhZGRJdGVtKGluc3RydWN0aW9uTmFtZSwgZGlyKTtcblx0XHRcdH1cblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSB8fCAhc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoIWNoaWxkLmlzRmlsZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluc3RydWN0aW9uTmFtZSA9IGdldEluc3RydWN0aW9uRmlsZU5hbWUoY2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0aWYgKGluc3RydWN0aW9uTmFtZSkge1xuXHRcdFx0XHRhZGRJdGVtKGluc3RydWN0aW9uTmFtZSwgY2hpbGQucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGl0ZW1zLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXHRyZXR1cm4gaXRlbXM7XG59XG5cbi8qKlxuICogUmVhZHMgYC5tZGAgZmlsZXMgaW4gYWdlbnQgZGlyZWN0b3JpZXMgYW5kIGVucmljaGVzIGVhY2ggZW50cnkgd2l0aFxuICogdGhlIG9wdGlvbmFsIGBuYW1lYCAvIGBkZXNjcmlwdGlvbmAgZnJvbSBZQU1MIGZyb250bWF0dGVyLiBGYWxscyBiYWNrXG4gKiB0byB0aGUgZmlsZS1kZXJpdmVkIG5hbWUgd2hlbiBmcm9udG1hdHRlciBpcyBtaXNzaW5nIG9yIHVucmVhZGFibGUuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkQWdlbnRDb21wb25lbnRzKGRpcnM6IHJlYWRvbmx5IFVSSVtdLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxyZWFkb25seSBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdPiB7XG5cdGNvbnN0IGZpbGVzID0gYXdhaXQgcmVhZE1hcmtkb3duQ29tcG9uZW50cyhkaXJzLCBmaWxlU2VydmljZSk7XG5cdGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmlsZXM7XG5cdH1cblx0Y29uc3QgZW5yaWNoZWQgPSBhd2FpdCBQcm9taXNlLmFsbChmaWxlcy5tYXAoYXN5bmMgZmlsZSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgbmFtZSwgZGVzY3JpcHRpb24gfSA9IGF3YWl0IHBhcnNlQWdlbnRGaWxlKGZpbGUudXJpLCBmaWxlU2VydmljZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IGZpbGUudXJpLFxuXHRcdFx0XHRuYW1lOiBuYW1lIHx8IGZpbGUubmFtZSxcblx0XHRcdFx0Li4uKGRlc2NyaXB0aW9uID8geyBkZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSU5hbWVkUGx1Z2luUmVzb3VyY2U7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmlsZTtcblx0XHR9XG5cdH0pKTtcblx0Ly8gRGUtZHVwZSBhZ2FpbiBpbiBjYXNlIGZyb250bWF0dGVyIGBuYW1lYCBjb2xsaWRlczsgZmlyc3Qtc2VlbiB3aW5zLlxuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHJlc3VsdDogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgZW5yaWNoZWQpIHtcblx0XHRpZiAoc2Vlbi5oYXMoaXRlbS5uYW1lKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHNlZW4uYWRkKGl0ZW0ubmFtZSk7XG5cdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdH1cblx0cmVzdWx0LnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VBZ2VudEZpbGUodXJpOiBVUkksIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPHsgbmFtZTogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZzsgdXNlckludm9jYWJsZT86IGJvb2xlYW4gfT4ge1xuXHQvLyBVc2UgcmVnZXggdG8gc3RyaXAgdGhlIHRyYWlsaW5nIGAuYWdlbnQubWRgIG9yIC5tZCBiZWZvcmUgcGFyc2luZywgc28gd2UgY2FuIGZhbGwgYmFjayB0byBhIGNsZWFuZXIgbmFtZSBpZiBmcm9udG1hdHRlciBpcyBtaXNzaW5nIG9yIGJyb2tlbi5cblx0Y29uc3QgbmFtZUZyb21GaWxlID0gYmFzZW5hbWUodXJpKS5yZXBsYWNlKC8oXFwuYWdlbnQpP1xcLm1kJC9pLCAnJyk7XG5cdHRyeSB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0Y29uc3QgZnJvbnRtYXR0ZXIgPSBwYXJzZUZyb250TWF0dGVyKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGZyb250bWF0dGVyPy5nZXRTdHJpbmdWYWx1ZSgnbmFtZScpPy50cmltKCkgfHwgbmFtZUZyb21GaWxlO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZnJvbnRtYXR0ZXI/LmdldFN0cmluZ1ZhbHVlKCdkZXNjcmlwdGlvbicpPy50cmltKCk7XG5cdFx0Y29uc3QgdXNlckludm9jYWJsZSA9IGZyb250bWF0dGVyPy5nZXRCb29sZWFuVmFsdWUoJ3VzZXItaW52b2NhYmxlJyk7XG5cdFx0cmV0dXJuIHsgbmFtZSwgZGVzY3JpcHRpb24sIHVzZXJJbnZvY2FibGUgfTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHsgbmFtZTogbmFtZUZyb21GaWxlIH07XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhcnNlU2tpbGxGaWxlKHVyaTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTx7IG5hbWU6IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmc7IHVzZXJJbnZva2FibGU/OiBib29sZWFuIH0+IHtcblx0dHJ5IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRjb25zdCBmcm9udG1hdHRlciA9IHBhcnNlRnJvbnRNYXR0ZXIoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBuYW1lID0gZnJvbnRtYXR0ZXI/LmdldFN0cmluZ1ZhbHVlKCduYW1lJyk/LnRyaW0oKSB8fCBiYXNlbmFtZShkaXJuYW1lKHVyaSkpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZnJvbnRtYXR0ZXI/LmdldFN0cmluZ1ZhbHVlKCdkZXNjcmlwdGlvbicpPy50cmltKCk7XG5cdFx0Y29uc3QgdXNlckludm9rYWJsZSA9IGZyb250bWF0dGVyPy5nZXRCb29sZWFuVmFsdWUoJ3VzZXItaW52b2NhYmxlJyk7XG5cdFx0cmV0dXJuIHsgbmFtZSwgZGVzY3JpcHRpb24sIHVzZXJJbnZva2FibGUgfTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHsgbmFtZTogYmFzZW5hbWUoZGlybmFtZSh1cmkpKSB9O1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVJ1bGVGaWxlKHVyaTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTx7IG5hbWU6IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmc7IGdsb2JzPzogc3RyaW5nW107IGFsd2F5c0FwcGx5PzogYm9vbGVhbiB9PiB7XG5cdGNvbnN0IG5hbWVGcm9tRmlsZSA9IGJhc2VuYW1lKHVyaSkucmVwbGFjZSgvKFxcLmluc3RydWN0aW9ucyk/XFwubWQkL2ksICcnKTtcblx0dHJ5IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRjb25zdCBmcm9udG1hdHRlciA9IHBhcnNlRnJvbnRNYXR0ZXIoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBuYW1lID0gZnJvbnRtYXR0ZXI/LmdldFN0cmluZ1ZhbHVlKCduYW1lJyk/LnRyaW0oKSB8fCBuYW1lRnJvbUZpbGU7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBmcm9udG1hdHRlcj8uZ2V0U3RyaW5nVmFsdWUoJ2Rlc2NyaXB0aW9uJyk/LnRyaW0oKTtcblx0XHRjb25zdCBnbG9icyA9IGZyb250bWF0dGVyPy5nZXRTdHJpbmdBcnJheVZhbHVlKCdnbG9icycpID8/IGZyb250bWF0dGVyPy5nZXRTdHJpbmdBcnJheVZhbHVlKCdhcHBseVRvJykgPz8gZnJvbnRtYXR0ZXI/LmdldFN0cmluZ0FycmF5VmFsdWUoJ3BhdGhzJykgPz8gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFsd2F5c0FwcGx5ID0gZnJvbnRtYXR0ZXI/LmdldEJvb2xlYW5WYWx1ZSgnYWx3YXlzQXBwbHknKTtcblx0XHRyZXR1cm4geyBuYW1lLCBkZXNjcmlwdGlvbiwgZ2xvYnMsIGFsd2F5c0FwcGx5IH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB7IG5hbWU6IG5hbWVGcm9tRmlsZSB9O1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRIb29rcyhcblx0cGx1Z2luVXJpOiBVUkksXG5cdHBhdGhzOiByZWFkb25seSBVUklbXSxcblx0Zm9ybWF0Q29uZmlnOiBJUGx1Z2luRm9ybWF0Q29uZmlnLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHR3b3Jrc3BhY2VSb290OiBVUkkgfCB1bmRlZmluZWQsXG5cdHVzZXJIb21lOiBVUkksXG4pOiBQcm9taXNlPHJlYWRvbmx5IElQYXJzZWRIb29rR3JvdXBbXT4ge1xuXHRmb3IgKGNvbnN0IGhvb2tQYXRoIG9mIHBhdGhzKSB7XG5cdFx0Y29uc3QganNvbiA9IGF3YWl0IHJlYWRKc29uRmlsZShob29rUGF0aCwgZmlsZVNlcnZpY2UpO1xuXHRcdGlmICghanNvbikge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZvcm1hdENvbmZpZy5wYXJzZUhvb2tzKGhvb2tQYXRoLCBqc29uLCBwbHVnaW5VcmksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0fVxuXHRyZXR1cm4gW107XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRNY3BTZXJ2ZXJzKFxuXHRwbHVnaW5Vcmk6IFVSSSxcblx0cGF0aHM6IHJlYWRvbmx5IFVSSVtdLFxuXHRmb3JtYXRDb25maWc6IElQbHVnaW5Gb3JtYXRDb25maWcsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG4pOiBQcm9taXNlPHJlYWRvbmx5IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10+IHtcblx0Y29uc3QgbWVyZ2VkID0gbmV3IE1hcDxzdHJpbmcsIElNY3BTZXJ2ZXJEZWZpbml0aW9uPigpO1xuXHRmb3IgKGNvbnN0IG1jcFBhdGggb2YgcGF0aHMpIHtcblx0XHRpZiAoZm9ybWF0Q29uZmlnLmZvcm1hdCA9PT0gUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luICYmICFhd2FpdCBpc1Jlc29sdmVkV2l0aGluKHBsdWdpblVyaSwgbWNwUGF0aCwgZmlsZVNlcnZpY2UpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QganNvbiA9IGF3YWl0IHJlYWRKc29uRmlsZShtY3BQYXRoLCBmaWxlU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBkZWYgb2YgcGFyc2VNY3BTZXJ2ZXJEZWZpbml0aW9uTWFwKG1jcFBhdGgsIGpzb24sIHBsdWdpblVyaS5mc1BhdGgsIGZvcm1hdENvbmZpZykpIHtcblx0XHRcdGlmICghbWVyZ2VkLmhhcyhkZWYubmFtZSkpIHtcblx0XHRcdFx0bWVyZ2VkLnNldChkZWYubmFtZSwgZGVmKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIFsuLi5tZXJnZWQudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZFBsdWdpbk1jcFNlcnZlcnMoXG5cdHBsdWdpblVyaTogVVJJLFxuXHRwYXRoczogcmVhZG9ubHkgVVJJW10sXG5cdGZvcm1hdDogSVBsdWdpbkZvcm1hdENvbmZpZyxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcbik6IFByb21pc2U8cmVhZG9ubHkgSU1jcFNlcnZlckRlZmluaXRpb25bXT4ge1xuXHRyZXR1cm4gcmVhZE1jcFNlcnZlcnMocGx1Z2luVXJpLCBwYXRocywgZm9ybWF0LCBmaWxlU2VydmljZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1jcFNlcnZlckRlZmluaXRpb25NYXAoXG5cdGRlZmluaXRpb25VUkk6IFVSSSxcblx0cmF3OiB1bmtub3duLFxuXHRwbHVnaW5Gc1BhdGg6IHN0cmluZyxcblx0Zm9ybWF0Q29uZmlnOiBJUGx1Z2luRm9ybWF0Q29uZmlnLFxuKTogSU1jcFNlcnZlckRlZmluaXRpb25bXSB7XG5cdGNvbnN0IG1jcFNlcnZlcnMgPSByZXNvbHZlTWNwU2VydmVyc01hcChyYXcpO1xuXHRpZiAoIW1jcFNlcnZlcnMpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBkZWZpbml0aW9uczogSU1jcFNlcnZlckRlZmluaXRpb25bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IFtuYW1lLCBjb25maWdWYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMobWNwU2VydmVycykpIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gbm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbihjb25maWdWYWx1ZSk7XG5cdFx0aWYgKCFjb25maWd1cmF0aW9uKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRsZXQgZGVmOiBJTWNwU2VydmVyRGVmaW5pdGlvbiA9IHtcblx0XHRcdG5hbWUsXG5cdFx0XHRjb25maWd1cmF0aW9uLFxuXHRcdFx0dXJpOiBkZWZpbml0aW9uVVJJLFxuXHRcdFx0Y3VzdG9taXphdGlvbjogbWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb24oZGVmaW5pdGlvblVSSSwgbmFtZSksXG5cdFx0fTtcblx0XHRkZWYgPSBpbnRlcnBvbGF0ZU1jcFBsdWdpblJvb3QoZGVmLCBwbHVnaW5Gc1BhdGgsIGZvcm1hdENvbmZpZy5wbHVnaW5Sb290VG9rZW5zLCBmb3JtYXRDb25maWcucGx1Z2luUm9vdEVudlZhcnMpO1xuXHRcdGlmIChmb3JtYXRDb25maWcuZm9ybWF0ICE9PSBQbHVnaW5Gb3JtYXQuQWdlbnRQbHVnaW4gJiYgZGVmLmNvbmZpZ3VyYXRpb24udHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCAmJiBkZWYuY29uZmlndXJhdGlvbi5jd2QgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVmID0geyAuLi5kZWYsIGNvbmZpZ3VyYXRpb246IHsgLi4uZGVmLmNvbmZpZ3VyYXRpb24sIGN3ZDogcGx1Z2luRnNQYXRoIH0gfTtcblx0XHR9XG5cdFx0aWYgKGZvcm1hdENvbmZpZy5mb3JtYXQgIT09IFBsdWdpbkZvcm1hdC5BZ2VudFBsdWdpbikge1xuXHRcdFx0ZGVmID0gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoZGVmKTtcblx0XHR9XG5cdFx0ZGVmaW5pdGlvbnMucHVzaChkZWYpO1xuXHR9XG5cblx0cmV0dXJuIGRlZmluaXRpb25zO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFRvcC1sZXZlbCBwYXJzZSBmdW5jdGlvblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogUGFyc2VzIGEgcGx1Z2luIGRpcmVjdG9yeSB0byBleHRyYWN0IGhvb2tzLCBNQ1Agc2VydmVycywgc2tpbGxzLCBhZ2VudHMsXG4gKiBhbmQgaW5zdHJ1Y3Rpb25zLlxuICogVGhpcyBpcyB0aGUgbWFpbiBlbnRyeSBwb2ludCBmb3IgdGhlIGFnZW50IGhvc3QgdG8gZGlzY292ZXIgcGx1Z2luIGNvbnRlbnRzLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VQbHVnaW4oXG5cdHBsdWdpblVyaTogVVJJLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHR3b3Jrc3BhY2VSb290OiBVUkkgfCB1bmRlZmluZWQsXG5cdHVzZXJIb21lOiBVUkksXG5cdGJvdW5kYXJ5VXJpPzogVVJJLFxuKTogUHJvbWlzZTxJUGFyc2VkUGx1Z2luPiB7XG5cdGNvbnN0IGZvcm1hdENvbmZpZyA9IGF3YWl0IGRldGVjdFBsdWdpbkZvcm1hdChwbHVnaW5VcmksIGZpbGVTZXJ2aWNlKTtcblxuXHQvLyBSZWFkIG1hbmlmZXN0XG5cdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgcmVhZFBsdWdpbk1hbmlmZXN0KHBsdWdpblVyaSwgZm9ybWF0Q29uZmlnLCBmaWxlU2VydmljZSk7XG5cdGlmIChmb3JtYXRDb25maWcucmVxdWlyZXNNYW5pZmVzdCAmJiAhbWFuaWZlc3QpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFBsdWdpbiBtYW5pZmVzdCAnJHtqb2luUGF0aChwbHVnaW5VcmksIGZvcm1hdENvbmZpZy5tYW5pZmVzdFBhdGgpLnRvU3RyaW5nKCl9JyBpcyBtaXNzaW5nYCk7XG5cdH1cblxuXHQvLyBSZXNvbHZlIGNvbXBvbmVudCBkaXJlY3RvcmllcyBmcm9tIG1hbmlmZXN0XG5cdGNvbnN0IGhvb2tEaXJzID0gcmVzb2x2ZVBsdWdpbkNvbXBvbmVudERpcnMocGx1Z2luVXJpLCBmb3JtYXRDb25maWcsICdob29rcycsIGZvcm1hdENvbmZpZy5ob29rQ29uZmlnUGF0aCwgbWFuaWZlc3Q/LlsnaG9va3MnXSwgYm91bmRhcnlVcmkpO1xuXHRjb25zdCBtY3BEaXJzID0gcmVzb2x2ZVBsdWdpbkNvbXBvbmVudERpcnMocGx1Z2luVXJpLCBmb3JtYXRDb25maWcsICdtY3BTZXJ2ZXJzJywgJy5tY3AuanNvbicsIG1hbmlmZXN0Py5bJ21jcFNlcnZlcnMnXSwgYm91bmRhcnlVcmkpO1xuXHRjb25zdCBza2lsbERpcnMgPSByZXNvbHZlUGx1Z2luQ29tcG9uZW50RGlycyhwbHVnaW5VcmksIGZvcm1hdENvbmZpZywgJ3NraWxscycsICdza2lsbHMnLCBtYW5pZmVzdD8uWydza2lsbHMnXSwgYm91bmRhcnlVcmkpO1xuXHRjb25zdCBhZ2VudERpcnMgPSByZXNvbHZlUGx1Z2luQ29tcG9uZW50RGlycyhwbHVnaW5VcmksIGZvcm1hdENvbmZpZywgJ2FnZW50cycsICdhZ2VudHMnLCBtYW5pZmVzdD8uWydhZ2VudHMnXSwgYm91bmRhcnlVcmkpO1xuXHRjb25zdCBpbnN0cnVjdGlvbkRpcnMgPSByZXNvbHZlUGx1Z2luQ29tcG9uZW50RGlycyhwbHVnaW5VcmksIGZvcm1hdENvbmZpZywgJ3J1bGVzJywgJ3J1bGVzJywgbWFuaWZlc3Q/LlsncnVsZXMnXSwgYm91bmRhcnlVcmkpO1xuXG5cdC8vIEhhbmRsZSBlbWJlZGRlZCBNQ1Agc2VydmVycyBpbiBtYW5pZmVzdFxuXHRsZXQgZW1iZWRkZWRNY3A6IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10gPSBbXTtcblx0Y29uc3QgbWNwU2VjdGlvbiA9IGdldFBsdWdpbk1hbmlmZXN0Q29tcG9uZW50KGZvcm1hdENvbmZpZywgJ21jcFNlcnZlcnMnLCBtYW5pZmVzdCk7XG5cdGlmIChtY3BTZWN0aW9uICYmIHR5cGVvZiBtY3BTZWN0aW9uID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShtY3BTZWN0aW9uKSAmJiAhKGhhc0tleShtY3BTZWN0aW9uLCB7IHBhdGhzOiB0cnVlIH0pKSkge1xuXHRcdGVtYmVkZGVkTWNwID0gcGFyc2VNY3BTZXJ2ZXJEZWZpbml0aW9uTWFwKFxuXHRcdFx0am9pblBhdGgocGx1Z2luVXJpLCBmb3JtYXRDb25maWcubWFuaWZlc3RQYXRoKSxcblx0XHRcdHsgbWNwU2VydmVyczogbWNwU2VjdGlvbiB9LFxuXHRcdFx0cGx1Z2luVXJpLmZzUGF0aCxcblx0XHRcdGZvcm1hdENvbmZpZyxcblx0XHQpO1xuXHR9XG5cblx0Ly8gSGFuZGxlIGVtYmVkZGVkIGhvb2tzIGluIG1hbmlmZXN0XG5cdGxldCBlbWJlZGRlZEhvb2tzOiBJUGFyc2VkSG9va0dyb3VwW10gPSBbXTtcblx0Y29uc3QgaG9va3NTZWN0aW9uID0gZ2V0UGx1Z2luTWFuaWZlc3RDb21wb25lbnQoZm9ybWF0Q29uZmlnLCAnaG9va3MnLCBtYW5pZmVzdCk7XG5cdGlmIChob29rc1NlY3Rpb24gJiYgdHlwZW9mIGhvb2tzU2VjdGlvbiA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkoaG9va3NTZWN0aW9uKSAmJiAhKGhhc0tleShob29rc1NlY3Rpb24sIHsgcGF0aHM6IHRydWUgfSkpKSB7XG5cdFx0Y29uc3QgbWFuaWZlc3RVcmkgPSBqb2luUGF0aChwbHVnaW5VcmksIGZvcm1hdENvbmZpZy5tYW5pZmVzdFBhdGgpO1xuXHRcdGVtYmVkZGVkSG9va3MgPSBmb3JtYXRDb25maWcucGFyc2VIb29rcyhtYW5pZmVzdFVyaSwgeyBob29rczogaG9va3NTZWN0aW9uIH0sIHBsdWdpblVyaSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHR9XG5cblx0Y29uc3QgW2hvb2tzLCBtY3BTZXJ2ZXJzLCBza2lsbHMsIGFnZW50cywgaW5zdHJ1Y3Rpb25zXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRlbWJlZGRlZEhvb2tzLmxlbmd0aCA+IDBcblx0XHRcdD8gUHJvbWlzZS5yZXNvbHZlKGVtYmVkZGVkSG9va3MpXG5cdFx0XHQ6IHJlYWRIb29rcyhwbHVnaW5VcmksIGhvb2tEaXJzLCBmb3JtYXRDb25maWcsIGZpbGVTZXJ2aWNlLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSksXG5cdFx0ZW1iZWRkZWRNY3AubGVuZ3RoID4gMFxuXHRcdFx0PyBQcm9taXNlLnJlc29sdmUoZW1iZWRkZWRNY3ApXG5cdFx0XHQ6IHJlYWRQbHVnaW5NY3BTZXJ2ZXJzKHBsdWdpblVyaSwgbWNwRGlycywgZm9ybWF0Q29uZmlnLCBmaWxlU2VydmljZSksXG5cdFx0cmVhZFBsdWdpblNraWxscyhwbHVnaW5VcmksIHNraWxsRGlycywgZm9ybWF0Q29uZmlnLCBmaWxlU2VydmljZSksXG5cdFx0cmVhZEFnZW50Q29tcG9uZW50cyhhZ2VudERpcnMsIGZpbGVTZXJ2aWNlKSxcblx0XHRyZWFkSW5zdHJ1Y3Rpb25Db21wb25lbnRzKGluc3RydWN0aW9uRGlycywgZmlsZVNlcnZpY2UpLFxuXHRdKTtcblxuXHRyZXR1cm4ge1xuXHRcdGZvcm1hdDogZm9ybWF0Q29uZmlnLmZvcm1hdCxcblx0XHRob29rcyxcblx0XHRtY3BTZXJ2ZXJzLFxuXHRcdHNraWxsczogc2tpbGxzLm1hcCh0b1BhcnNlZFNraWxsKSxcblx0XHRhZ2VudHM6IGFnZW50cy5tYXAodG9QYXJzZWRBZ2VudCksXG5cdFx0aW5zdHJ1Y3Rpb25zOiBpbnN0cnVjdGlvbnMubWFwKHRvUGFyc2VkUnVsZSksXG5cdH07XG59XG5cbi8qKiBQYWlycyBhbiBhZ2VudCB7QGxpbmsgSU5hbWVkUGx1Z2luUmVzb3VyY2V9IHdpdGggaXRzIHByb3RvY29sLWxldmVsIHtAbGluayBBZ2VudEN1c3RvbWl6YXRpb259LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvUGFyc2VkQWdlbnQocmVzb3VyY2U6IElOYW1lZFBsdWdpblJlc291cmNlKTogSVBhcnNlZEFnZW50IHtcblx0cmV0dXJuIHsgLi4ucmVzb3VyY2UsIGN1c3RvbWl6YXRpb246IG1ha2VBZ2VudEN1c3RvbWl6YXRpb24ocmVzb3VyY2UpIH07XG59XG5cbi8qKiBQYWlycyBhIHNraWxsIHtAbGluayBJTmFtZWRQbHVnaW5SZXNvdXJjZX0gd2l0aCBpdHMgcHJvdG9jb2wtbGV2ZWwge0BsaW5rIFNraWxsQ3VzdG9taXphdGlvbn0uICovXG5leHBvcnQgZnVuY3Rpb24gdG9QYXJzZWRTa2lsbChyZXNvdXJjZTogSU5hbWVkUGx1Z2luUmVzb3VyY2UpOiBJUGFyc2VkU2tpbGwge1xuXHRyZXR1cm4geyAuLi5yZXNvdXJjZSwgY3VzdG9taXphdGlvbjogbWFrZVNraWxsQ3VzdG9taXphdGlvbihyZXNvdXJjZSkgfTtcbn1cblxuZnVuY3Rpb24gdG9QYXJzZWRSdWxlKHJlc291cmNlOiBJTmFtZWRQbHVnaW5SZXNvdXJjZSk6IElQYXJzZWRSdWxlIHtcblx0cmV0dXJuIHsgLi4ucmVzb3VyY2UsIGN1c3RvbWl6YXRpb246IG1ha2VSdWxlQ3VzdG9taXphdGlvbihyZXNvdXJjZSkgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxrQkFBa0I7QUFDcEMsU0FBUyxnQkFBZ0IsVUFBVSxvQkFBb0I7QUFDdkQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLFNBQVMsaUJBQWlCLFVBQVUsZUFBZSxXQUFXLGFBQWEsZUFBZTtBQUM3RyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGNBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUVwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUErRixxQkFBcUI7QUFDcEgsU0FBUyxtQkFBbUIsdUJBQXNKO0FBQ2xMLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0JBQStCO0FBMEJqQyxJQUFVO0FBQUEsQ0FBVixDQUFVQSx3QkFBVjtBQUNDLFdBQVMsU0FBUyxHQUFtQyxHQUE0QztBQUN2RyxRQUFJLE1BQU0sR0FBRztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEVBQUUsWUFBWSxFQUFFLFdBQ25CLEVBQUUsWUFBWSxFQUFFLFdBQ2hCLEVBQUUsVUFBVSxFQUFFLFNBQ2QsRUFBRSxRQUFRLEVBQUUsT0FDWixZQUFZLEVBQUUsS0FBSyxFQUFFLEdBQUcs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
