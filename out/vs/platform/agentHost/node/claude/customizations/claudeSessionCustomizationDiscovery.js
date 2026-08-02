import { URI } from "../../../../../base/common/uri.js";
import { isEqualOrParent } from "../../../../../base/common/resources.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { makeMcpServerCustomization, parseAgentFile, toParsedAgent } from "../../../../agentPlugins/common/pluginParsers.js";
import { CustomizationType } from "../../../common/state/protocol/channels-session/state.js";
import { CustomizationLoadStatus, customizationId } from "../../../common/state/sessionState.js";
import { isHostInjectedMcpServerName } from "../claudeMcpServerNames.js";
import { deriveMcpState } from "./scan/claudeMcpScan.js";
import { claudeMemoryFiles } from "./scan/claudeRuleScan.js";
import { CLAUDE_BUILTIN_AGENTS, buildClaudeBuiltinSkillsContainer, buildSdkBuiltinSkillsContainer } from "./claudeBuiltinCommands.js";
import { distinctClaudeWorkingDirectories } from "./claudeMultiRootCustomizationDiscovery.js";
import { findMostSpecificClaudeWorkspaceRoot } from "./claudeCustomizationPolicy.js";
const CLAUDE_SDK_DEFAULT_AGENT_NAME = "general-purpose";
const CLAUDE_INTERNAL_SCHEME = "claude-internal";
function makeDirectory(base, sub, contents, children) {
  const uri = URI.joinPath(base, ".claude", sub).toString();
  return {
    type: CustomizationType.Directory,
    id: customizationId(uri),
    uri,
    name: sub,
    enabled: true,
    contents,
    writable: true,
    load: { kind: CustomizationLoadStatus.Loaded },
    children: [...children]
  };
}
function makePlugin(plugin) {
  const uri = plugin.root.toString();
  const children = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (child) => {
    if (!seen.has(child.id)) {
      seen.add(child.id);
      children.push(child);
    }
  };
  for (const agent of plugin.parsed.agents) {
    push(agent.customization);
  }
  for (const skill of plugin.parsed.skills) {
    push(skill.customization);
  }
  for (const rule of plugin.parsed.instructions) {
    push(rule.customization);
  }
  for (const hook of plugin.parsed.hooks) {
    push(hook.customization);
  }
  for (const mcp of plugin.parsed.mcpServers) {
    push(mcp.customization);
  }
  return {
    type: CustomizationType.Plugin,
    id: customizationId(uri),
    uri,
    name: plugin.id,
    enabled: true,
    load: { kind: CustomizationLoadStatus.Loaded },
    children
  };
}
function createBucket(base) {
  return { base, agents: [], skills: [], rules: [], hooks: [] };
}
function findCustomizationBucket(uri, workspaceBuckets, userBucket) {
  const root = findMostSpecificClaudeWorkspaceRoot(uri, workspaceBuckets.map((bucket) => bucket.base));
  if (workspaceBuckets.length > 1 && uri.scheme === userBucket.base.scheme && isEqualOrParent(uri, userBucket.base) && (!root || userBucket.base.path.length > root.path.length)) {
    return userBucket;
  }
  return workspaceBuckets.find((bucket) => bucket.base === root) ?? userBucket;
}
function mapDiscoveredCustomizations(discovered, mcpServers, hooks, nativePlugins, workingDirectories, userHome) {
  const roots = distinctClaudeWorkingDirectories(Array.isArray(workingDirectories) ? workingDirectories : workingDirectories ? [workingDirectories] : []);
  const workspaceBuckets = roots.map(createBucket);
  const userBucket = createBucket(userHome);
  for (const d of discovered) {
    const bucket = findCustomizationBucket(d.uri, workspaceBuckets, userBucket);
    if (d.customization.type === CustomizationType.Agent) {
      bucket.agents.push(d.customization);
    } else if (d.customization.type === CustomizationType.Skill) {
      bucket.skills.push(d.customization);
    } else {
      bucket.rules.push(d.customization);
    }
  }
  for (const hook of hooks) {
    findCustomizationBucket(URI.parse(hook.uri), workspaceBuckets, userBucket).hooks.push(hook);
  }
  const result = [];
  for (const bucket of [...workspaceBuckets, userBucket]) {
    if (bucket.agents.length > 0) {
      result.push(makeDirectory(bucket.base, "agents", CustomizationType.Agent, bucket.agents));
    }
    if (bucket.skills.length > 0) {
      result.push(makeDirectory(bucket.base, "skills", CustomizationType.Skill, bucket.skills));
    }
    if (bucket.rules.length > 0) {
      result.push(makeDirectory(bucket.base, "rules", CustomizationType.Rule, bucket.rules));
    }
    if (bucket.hooks.length > 0) {
      result.push(makeDirectory(bucket.base, "hooks", CustomizationType.Hook, bucket.hooks));
    }
  }
  for (const plugin of nativePlugins) {
    result.push(makePlugin(plugin));
  }
  result.push(...mcpServers);
  return result;
}
function nonEditableUri(kind, name) {
  return URI.from({ scheme: CLAUDE_INTERNAL_SCHEME, path: `/${kind}/${encodeURIComponent(name)}` });
}
async function resolveClaudeAgentName(agent, fileService, logService, sessionId) {
  if (!agent) {
    return void 0;
  }
  const uri = URI.parse(agent.uri);
  if (uri.scheme === CLAUDE_INTERNAL_SCHEME) {
    const last = uri.path.split("/").pop() ?? "";
    const name2 = last ? decodeURIComponent(last) : "";
    if (!name2) {
      logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: could not extract agent name from URI '${agent.uri}'`);
      return void 0;
    }
    return name2;
  }
  try {
    const parsed = await parseAgentFile(uri, fileService);
    if (parsed.name) {
      return parsed.name;
    }
  } catch (err) {
    logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: failed to parse agent file '${agent.uri}', falling back to basename`, err);
  }
  const basename = uri.path.split("/").pop() ?? "";
  const name = basename.replace(/\.md$/i, "");
  if (!name) {
    logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: could not extract agent name from URI '${agent.uri}'`);
    return void 0;
  }
  return name;
}
function buildDiscoveredCustomizations(discovered, mcpServers, hooks, nativePlugins, workingDirectories, userHome, sdk) {
  const visiblePlugins = [];
  const pluginAgentNames = /* @__PURE__ */ new Set();
  const pluginSkillNames = /* @__PURE__ */ new Set();
  const pluginMcpNames = /* @__PURE__ */ new Set();
  if (sdk) {
    for (const p of nativePlugins) {
      const sdkPlugin = sdk.plugins.find((s) => s.source === p.id || URI.file(s.path).fsPath === p.root.fsPath);
      if (!sdkPlugin) {
        continue;
      }
      visiblePlugins.push(p);
      const ns = sdkPlugin.name;
      const add = (set, name) => {
        set.add(name);
        if (ns) {
          set.add(`${ns}:${name}`);
        }
      };
      for (const a of p.parsed.agents) {
        add(pluginAgentNames, a.name);
      }
      for (const s of p.parsed.skills) {
        add(pluginSkillNames, s.name);
      }
      for (const m of p.parsed.mcpServers) {
        add(pluginMcpNames, m.name);
      }
    }
  } else {
    visiblePlugins.push(...nativePlugins);
  }
  const diskSkillNames = new Set(
    discovered.filter((d) => d.customization.type === CustomizationType.Skill).map((d) => d.name)
  );
  const builtinSkills = sdk ? buildSdkBuiltinSkillsContainer(sdk.commands.filter((c) => !pluginSkillNames.has(c.name)), diskSkillNames) : buildClaudeBuiltinSkillsContainer(diskSkillNames);
  const withBuiltinSkills = (list) => builtinSkills ? [...list, builtinSkills] : list;
  if (!sdk) {
    const diskAgentNames = new Set(
      discovered.filter((d) => d.customization.type === CustomizationType.Agent).map((d) => d.name)
    );
    const builtinAgents = CLAUDE_BUILTIN_AGENTS.filter((a) => a.name !== CLAUDE_SDK_DEFAULT_AGENT_NAME && !diskAgentNames.has(a.name)).map((a) => toParsedAgent({ uri: nonEditableUri("agent", a.name), name: a.name, description: a.description() }));
    return withBuiltinSkills(mapDiscoveredCustomizations([...discovered, ...builtinAgents], mcpServers, hooks, nativePlugins, workingDirectories, userHome));
  }
  const agentNames = new Set(sdk.agents.map((a) => a.name));
  const commandNames = new Set(sdk.commands.map((c) => c.name));
  const mcpByName = new Map(sdk.mcpServers.map((s) => [s.name, s]));
  const seenAgents = /* @__PURE__ */ new Set();
  const entries = [];
  for (const d of discovered) {
    if (d.customization.type === CustomizationType.Agent) {
      if (d.name === CLAUDE_SDK_DEFAULT_AGENT_NAME) {
        continue;
      }
      if (agentNames.has(d.name)) {
        entries.push(d);
        seenAgents.add(d.name);
      }
    } else if (d.customization.type === CustomizationType.Skill) {
      if (commandNames.has(d.name)) {
        entries.push(d);
      }
    } else {
      entries.push(d);
    }
  }
  for (const agent of sdk.agents) {
    if (agent.name === CLAUDE_SDK_DEFAULT_AGENT_NAME || seenAgents.has(agent.name) || pluginAgentNames.has(agent.name)) {
      continue;
    }
    entries.push(toParsedAgent({ uri: nonEditableUri("agent", agent.name), name: agent.name, ...agent.description ? { description: agent.description } : {} }));
  }
  const seenMcp = /* @__PURE__ */ new Set();
  const servers = [];
  for (const server of mcpServers) {
    const sdkServer = mcpByName.get(server.name);
    if (!sdkServer) {
      continue;
    }
    seenMcp.add(server.name);
    servers.push({ ...server, state: deriveMcpState(sdkServer.status) });
  }
  for (const [name, sdkServer] of mcpByName) {
    if (seenMcp.has(name) || pluginMcpNames.has(name)) {
      continue;
    }
    if (isHostInjectedMcpServerName(name)) {
      continue;
    }
    servers.push({ ...makeMcpServerCustomization(nonEditableUri("mcp", name), name), state: deriveMcpState(sdkServer.status) });
  }
  return withBuiltinSkills(mapDiscoveredCustomizations(entries, servers, hooks, visiblePlugins, workingDirectories, userHome));
}
const CLAUDE_CUSTOMIZATION_SUBPATHS = Object.freeze([
  "agents",
  "skills",
  "commands",
  "rules",
  "plugins",
  "CLAUDE.md",
  "settings.json",
  "settings.local.json"
]);
const _ClaudeCustomizationWatcher = class _ClaudeCustomizationWatcher extends Disposable {
  constructor(workingDirectories, userHome, fileService, logService, debounceMs = _ClaudeCustomizationWatcher.DEBOUNCE_MS) {
    super();
    const roots = distinctClaudeWorkingDirectories(Array.isArray(workingDirectories) ? workingDirectories : workingDirectories ? [workingDirectories] : []);
    const triggers = [];
    const watched = /* @__PURE__ */ new Set();
    const watch = (uri, recursive) => {
      const key = `${recursive}:${uri.toString()}`;
      if (watched.has(key)) {
        return;
      }
      watched.add(key);
      try {
        this._register(fileService.watch(uri, { recursive, excludes: [] }));
      } catch (err) {
        logService.warn(`[ClaudeCustomizationWatcher] failed to watch '${uri.toString()}': ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    const addClaudeTriggers = (base) => {
      for (const sub of CLAUDE_CUSTOMIZATION_SUBPATHS) {
        triggers.push(URI.joinPath(base, sub));
      }
    };
    const primary = roots[0];
    if (primary) {
      const projectClaude = URI.joinPath(primary, ".claude");
      watch(projectClaude, true);
      addClaudeTriggers(projectClaude);
      watch(primary, false);
      triggers.push(URI.joinPath(primary, ".mcp.json"));
    }
    for (const additional of roots.slice(1)) {
      const projectClaude = URI.joinPath(additional, ".claude");
      watch(projectClaude, true);
      triggers.push(
        URI.joinPath(projectClaude, "agents"),
        URI.joinPath(projectClaude, "skills"),
        URI.joinPath(projectClaude, "settings.json"),
        URI.joinPath(projectClaude, "settings.local.json")
      );
    }
    const userClaude = URI.joinPath(userHome, ".claude");
    watch(userClaude, true);
    addClaudeTriggers(userClaude);
    triggers.push(...claudeMemoryFiles(primary, userHome));
    this.onDidChange = Event.signal(Event.debounce(
      Event.filter(fileService.onDidFilesChange, (e) => triggers.some((t) => e.affects(t)), this._store),
      (_last, e) => e,
      debounceMs,
      void 0,
      void 0,
      void 0,
      this._store
    ));
  }
};
_ClaudeCustomizationWatcher.DEBOUNCE_MS = 300;
let ClaudeCustomizationWatcher = _ClaudeCustomizationWatcher;
export {
  CLAUDE_SDK_DEFAULT_AGENT_NAME,
  ClaudeCustomizationWatcher,
  buildDiscoveredCustomizations,
  mapDiscoveredCustomizations,
  resolveClaudeAgentName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NsYXVkZS9jdXN0b21pemF0aW9ucy9jbGF1ZGVTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsT3JQYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG1ha2VNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCBwYXJzZUFnZW50RmlsZSwgdG9QYXJzZWRBZ2VudCwgdHlwZSBJUGFyc2VkQWdlbnQsIHR5cGUgSVBhcnNlZFJ1bGUsIHR5cGUgSVBhcnNlZFNraWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIEFnZW50U2VsZWN0aW9uLCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgY3VzdG9taXphdGlvbklkLCB0eXBlIEFnZW50Q3VzdG9taXphdGlvbiwgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb24sIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBEaXJlY3RvcnlDdXN0b21pemF0aW9uLCB0eXBlIEhvb2tDdXN0b21pemF0aW9uLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgUnVsZUN1c3RvbWl6YXRpb24sIHR5cGUgU2tpbGxDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZGtSZXNvbHZlZEN1c3RvbWl6YXRpb25zIH0gZnJvbSAnLi4vY2xhdWRlU2RrUGlwZWxpbmUuanMnO1xuaW1wb3J0IHsgaXNIb3N0SW5qZWN0ZWRNY3BTZXJ2ZXJOYW1lIH0gZnJvbSAnLi4vY2xhdWRlTWNwU2VydmVyTmFtZXMuanMnO1xuaW1wb3J0IHsgZGVyaXZlTWNwU3RhdGUgfSBmcm9tICcuL3NjYW4vY2xhdWRlTWNwU2Nhbi5qcyc7XG5pbXBvcnQgeyBjbGF1ZGVNZW1vcnlGaWxlcyB9IGZyb20gJy4vc2Nhbi9jbGF1ZGVSdWxlU2Nhbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZXNvbHZlZE5hdGl2ZVBsdWdpbiB9IGZyb20gJy4vc2Nhbi9jbGF1ZGVOYXRpdmVQbHVnaW5TY2FuLmpzJztcbmltcG9ydCB7IENMQVVERV9CVUlMVElOX0FHRU5UUywgYnVpbGRDbGF1ZGVCdWlsdGluU2tpbGxzQ29udGFpbmVyLCBidWlsZFNka0J1aWx0aW5Ta2lsbHNDb250YWluZXIgfSBmcm9tICcuL2NsYXVkZUJ1aWx0aW5Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdENsYXVkZVdvcmtpbmdEaXJlY3RvcmllcyB9IGZyb20gJy4vY2xhdWRlTXVsdGlSb290Q3VzdG9taXphdGlvbkRpc2NvdmVyeS5qcyc7XG5pbXBvcnQgeyBmaW5kTW9zdFNwZWNpZmljQ2xhdWRlV29ya3NwYWNlUm9vdCB9IGZyb20gJy4vY2xhdWRlQ3VzdG9taXphdGlvblBvbGljeS5qcyc7XG5cbi8qKlxuICogVGhlIENsYXVkZSBTREsncyBidWlsdC1pbiBkZWZhdWx0IGFnZW50LiBIaWRkZW4gZnJvbSB0aGUgcGlja2VyOlxuICogc2VsZWN0aW5nIGl0IHdvdWxkIGJlIGVxdWl2YWxlbnQgdG8gXCJubyBzZWxlY3Rpb25cIiBzaW5jZSB0aGUgU0RLXG4gKiB1c2VzIGl0IGFzIHRoZSBmYWxsYmFjayB3aGVuIGBPcHRpb25zLmFnZW50YCBpcyBvbWl0dGVkLlxuICovXG5leHBvcnQgY29uc3QgQ0xBVURFX1NES19ERUZBVUxUX0FHRU5UX05BTUUgPSAnZ2VuZXJhbC1wdXJwb3NlJztcblxuLyoqXG4gKiBTY2hlbWUgZm9yIHN5bnRoZXRpYywgbm9uLW9wZW5hYmxlIFVSSXMgdGhhdCBtYXJrIFNESy1vbmx5IGN1c3RvbWl6YXRpb25zXG4gKiB0aGUgZGlzayBzY2FuIGNvdWxkbid0IGxvY2F0ZSAoRGVjaXNpb24gRDIpLiBJdCBoYXMgbm8gZmlsZSBwcm92aWRlciwgc29cbiAqIHRoZSB3b3JrYmVuY2ggcmVuZGVycyBzdWNoIGVudHJpZXMgcmVhZC1vbmx5LiBUaGUgd3JpdGVyICh7QGxpbmsgbm9uRWRpdGFibGVVcml9KVxuICogYW5kIHJlYWRlciAoe0BsaW5rIHJlc29sdmVDbGF1ZGVBZ2VudE5hbWV9KSBzaGFyZSB0aGlzIGNvbnN0YW50IHNvIHRoZSB0d29cbiAqIG5ldmVyIGRyaWZ0LlxuICovXG5jb25zdCBDTEFVREVfSU5URVJOQUxfU0NIRU1FID0gJ2NsYXVkZS1pbnRlcm5hbCc7XG5cbmZ1bmN0aW9uIG1ha2VEaXJlY3RvcnkoYmFzZTogVVJJLCBzdWI6IHN0cmluZywgY29udGVudHM6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50IHwgQ3VzdG9taXphdGlvblR5cGUuU2tpbGwgfCBDdXN0b21pemF0aW9uVHlwZS5SdWxlIHwgQ3VzdG9taXphdGlvblR5cGUuSG9vaywgY2hpbGRyZW46IHJlYWRvbmx5IChBZ2VudEN1c3RvbWl6YXRpb24gfCBTa2lsbEN1c3RvbWl6YXRpb24gfCBSdWxlQ3VzdG9taXphdGlvbiB8IEhvb2tDdXN0b21pemF0aW9uKVtdKTogRGlyZWN0b3J5Q3VzdG9taXphdGlvbiB7XG5cdGNvbnN0IHVyaSA9IFVSSS5qb2luUGF0aChiYXNlLCAnLmNsYXVkZScsIHN1YikudG9TdHJpbmcoKTtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnksXG5cdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCh1cmkpLFxuXHRcdHVyaSxcblx0XHRuYW1lOiBzdWIsXG5cdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRjb250ZW50cyxcblx0XHR3cml0YWJsZTogdHJ1ZSxcblx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdGNoaWxkcmVuOiBbLi4uY2hpbGRyZW5dLFxuXHR9O1xufVxuXG4vKipcbiAqIFByb2plY3RzIGEgcmVzb2x2ZWQgQ2xhdWRlLW5hdGl2ZSBwbHVnaW4gaW50byBhIHRvcC1sZXZlbFxuICoge0BsaW5rIFBsdWdpbkN1c3RvbWl6YXRpb259IChpdHMgb3duIHByb3RvY29sIGNvbnRhaW5lciB0eXBlIFx1MjAxNCAqbm90KiBhXG4gKiBwZXItc2NvcGUge0BsaW5rIERpcmVjdG9yeUN1c3RvbWl6YXRpb259LCBtaXJyb3JpbmcgaG93IE1DUCBzZXJ2ZXJzIGFyZVxuICogdG9wLWxldmVsKS4gVGhlIGNvbnRhaW5lciBgdXJpYCBpcyB0aGUgcmVhbCBwbHVnaW4gcm9vdCBkaXJlY3Rvcnk7IGl0c1xuICogYG5hbWVgIGlzIHRoZSBgZW5hYmxlZFBsdWdpbnNgIGlkICh0aGUgbWFuaWZlc3QgY2FycmllcyBubyBkaXNwbGF5IG5hbWVcbiAqIHRocm91Z2gge0BsaW5rIElSZXNvbHZlZE5hdGl2ZVBsdWdpbn0pLiBDaGlsZHJlbiBhcmUgdGhlIHBsdWdpbidzIGJ1bmRsZWRcbiAqIGNvbXBvbmVudHMsIGRlZHVwZWQgYnkgaWQgKGEgcGx1Z2luJ3MgaG9va3Mgc2hhcmUgb25lIHNldHRpbmdzLWZpbGVcbiAqIGN1c3RvbWl6YXRpb24sIHNvIHRoZSBncm91cHMgd291bGQgb3RoZXJ3aXNlIHJlcGVhdCkuXG4gKi9cbmZ1bmN0aW9uIG1ha2VQbHVnaW4ocGx1Z2luOiBJUmVzb2x2ZWROYXRpdmVQbHVnaW4pOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0Y29uc3QgdXJpID0gcGx1Z2luLnJvb3QudG9TdHJpbmcoKTtcblx0Y29uc3QgY2hpbGRyZW46IENoaWxkQ3VzdG9taXphdGlvbltdID0gW107XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgcHVzaCA9IChjaGlsZDogQ2hpbGRDdXN0b21pemF0aW9uKSA9PiB7XG5cdFx0aWYgKCFzZWVuLmhhcyhjaGlsZC5pZCkpIHtcblx0XHRcdHNlZW4uYWRkKGNoaWxkLmlkKTtcblx0XHRcdGNoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdH1cblx0fTtcblx0Zm9yIChjb25zdCBhZ2VudCBvZiBwbHVnaW4ucGFyc2VkLmFnZW50cykgeyBwdXNoKGFnZW50LmN1c3RvbWl6YXRpb24pOyB9XG5cdGZvciAoY29uc3Qgc2tpbGwgb2YgcGx1Z2luLnBhcnNlZC5za2lsbHMpIHsgcHVzaChza2lsbC5jdXN0b21pemF0aW9uKTsgfVxuXHRmb3IgKGNvbnN0IHJ1bGUgb2YgcGx1Z2luLnBhcnNlZC5pbnN0cnVjdGlvbnMpIHsgcHVzaChydWxlLmN1c3RvbWl6YXRpb24pOyB9XG5cdGZvciAoY29uc3QgaG9vayBvZiBwbHVnaW4ucGFyc2VkLmhvb2tzKSB7IHB1c2goaG9vay5jdXN0b21pemF0aW9uKTsgfVxuXHRmb3IgKGNvbnN0IG1jcCBvZiBwbHVnaW4ucGFyc2VkLm1jcFNlcnZlcnMpIHsgcHVzaChtY3AuY3VzdG9taXphdGlvbik7IH1cblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCh1cmkpLFxuXHRcdHVyaSxcblx0XHRuYW1lOiBwbHVnaW4uaWQsXG5cdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdGNoaWxkcmVuLFxuXHR9O1xufVxuXG4vKipcbiAqIEEgVVJJLWJhY2tlZCBzY29wZSBidWNrZXQuIFRoZSBiYXNlIFVSSSBkaXN0aW5ndWlzaGVzIHdvcmtzcGFjZSBBLFxuICogd29ya3NwYWNlIEIsIGFuZCB1c2VyIHNjb3BlIHdpdGhvdXQgYSBzZXBhcmF0ZSBzY29wZSBlbnVtLlxuICovXG5pbnRlcmZhY2UgSUN1c3RvbWl6YXRpb25CdWNrZXQge1xuXHRyZWFkb25seSBiYXNlOiBVUkk7XG5cdHJlYWRvbmx5IGFnZW50czogQWdlbnRDdXN0b21pemF0aW9uW107XG5cdHJlYWRvbmx5IHNraWxsczogU2tpbGxDdXN0b21pemF0aW9uW107XG5cdHJlYWRvbmx5IHJ1bGVzOiBSdWxlQ3VzdG9taXphdGlvbltdO1xuXHRyZWFkb25seSBob29rczogSG9va0N1c3RvbWl6YXRpb25bXTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQnVja2V0KGJhc2U6IFVSSSk6IElDdXN0b21pemF0aW9uQnVja2V0IHtcblx0cmV0dXJuIHsgYmFzZSwgYWdlbnRzOiBbXSwgc2tpbGxzOiBbXSwgcnVsZXM6IFtdLCBob29rczogW10gfTtcbn1cblxuZnVuY3Rpb24gZmluZEN1c3RvbWl6YXRpb25CdWNrZXQodXJpOiBVUkksIHdvcmtzcGFjZUJ1Y2tldHM6IHJlYWRvbmx5IElDdXN0b21pemF0aW9uQnVja2V0W10sIHVzZXJCdWNrZXQ6IElDdXN0b21pemF0aW9uQnVja2V0KTogSUN1c3RvbWl6YXRpb25CdWNrZXQge1xuXHRjb25zdCByb290ID0gZmluZE1vc3RTcGVjaWZpY0NsYXVkZVdvcmtzcGFjZVJvb3QodXJpLCB3b3Jrc3BhY2VCdWNrZXRzLm1hcChidWNrZXQgPT4gYnVja2V0LmJhc2UpKTtcblx0aWYgKHdvcmtzcGFjZUJ1Y2tldHMubGVuZ3RoID4gMSAmJiB1cmkuc2NoZW1lID09PSB1c2VyQnVja2V0LmJhc2Uuc2NoZW1lICYmIGlzRXF1YWxPclBhcmVudCh1cmksIHVzZXJCdWNrZXQuYmFzZSkgJiYgKCFyb290IHx8IHVzZXJCdWNrZXQuYmFzZS5wYXRoLmxlbmd0aCA+IHJvb3QucGF0aC5sZW5ndGgpKSB7XG5cdFx0cmV0dXJuIHVzZXJCdWNrZXQ7XG5cdH1cblx0cmV0dXJuIHdvcmtzcGFjZUJ1Y2tldHMuZmluZChidWNrZXQgPT4gYnVja2V0LmJhc2UgPT09IHJvb3QpID8/IHVzZXJCdWNrZXQ7XG59XG5cbi8qKlxuICogTWFwcyB0aGUgZGlzay1kaXNjb3ZlcmVkIGN1c3RvbWl6YXRpb25zIGludG8gdGhlIHByb3RvY29sXG4gKiB7QGxpbmsgQ3VzdG9taXphdGlvbn0gc3VyZmFjZS4gQWdlbnRzLCBza2lsbHMgYW5kIHJ1bGVzIGFyZSB3cmFwcGVkIGluXG4gKiB7QGxpbmsgRGlyZWN0b3J5Q3VzdG9taXphdGlvbn0gY29udGFpbmVycyAodGhlIHByb3RvY29sJ3MgYEN1c3RvbWl6YXRpb25gXG4gKiB1bmlvbiBoYXMgbm8gYmFyZSBhZ2VudC9za2lsbC9ydWxlIG1lbWJlciksIG9uZSBjb250YWluZXIgcGVyIChzY29wZSwga2luZCk6XG4gKiB0aGUgY29udGFpbmVyIGB1cmlgIGlzIHRoZSByZWFsIGA8c2NvcGU+Ly5jbGF1ZGUvPHN1Yj5gIGRpcmVjdG9yeSBzbyB0aGVcbiAqIHdvcmtiZW5jaCBkZXJpdmVzIHRoZSBcIldvcmtzcGFjZVwiIHZzIFwiVXNlclwiIGxhYmVsIGZyb20gaXQgKG1pcnJvcmluZ1xuICogQ29waWxvdEFnZW50KS4gRWFjaCBjaGlsZCBjYXJyaWVzIGl0cyByZWFsIHNvdXJjZS1maWxlIGB1cmlgIHNvIHRoZVxuICogd29ya2JlbmNoIGNhbiBvcGVuIGl0IGZvciBlZGl0aW5nLiBNQ1Agc2VydmVycyBhcmUgdG9wLWxldmVsIGVudHJpZXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXBEaXNjb3ZlcmVkQ3VzdG9taXphdGlvbnMoXG5cdGRpc2NvdmVyZWQ6IHJlYWRvbmx5IChJUGFyc2VkQWdlbnQgfCBJUGFyc2VkU2tpbGwgfCBJUGFyc2VkUnVsZSlbXSxcblx0bWNwU2VydmVyczogcmVhZG9ubHkgTWNwU2VydmVyQ3VzdG9taXphdGlvbltdLFxuXHRob29rczogcmVhZG9ubHkgSG9va0N1c3RvbWl6YXRpb25bXSxcblx0bmF0aXZlUGx1Z2luczogcmVhZG9ubHkgSVJlc29sdmVkTmF0aXZlUGx1Z2luW10sXG5cdHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCBVUkkgfCB1bmRlZmluZWQsXG5cdHVzZXJIb21lOiBVUkksXG4pOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHRjb25zdCByb290cyA9IGRpc3RpbmN0Q2xhdWRlV29ya2luZ0RpcmVjdG9yaWVzKEFycmF5LmlzQXJyYXkod29ya2luZ0RpcmVjdG9yaWVzKSA/IHdvcmtpbmdEaXJlY3RvcmllcyA6IHdvcmtpbmdEaXJlY3RvcmllcyA/IFt3b3JraW5nRGlyZWN0b3JpZXNdIDogW10pO1xuXHRjb25zdCB3b3Jrc3BhY2VCdWNrZXRzID0gcm9vdHMubWFwKGNyZWF0ZUJ1Y2tldCk7XG5cdGNvbnN0IHVzZXJCdWNrZXQgPSBjcmVhdGVCdWNrZXQodXNlckhvbWUpO1xuXHRmb3IgKGNvbnN0IGQgb2YgZGlzY292ZXJlZCkge1xuXHRcdGNvbnN0IGJ1Y2tldCA9IGZpbmRDdXN0b21pemF0aW9uQnVja2V0KGQudXJpLCB3b3Jrc3BhY2VCdWNrZXRzLCB1c2VyQnVja2V0KTtcblx0XHRpZiAoZC5jdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50KSB7XG5cdFx0XHRidWNrZXQuYWdlbnRzLnB1c2goZC5jdXN0b21pemF0aW9uKTtcblx0XHR9IGVsc2UgaWYgKGQuY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCkge1xuXHRcdFx0YnVja2V0LnNraWxscy5wdXNoKGQuY3VzdG9taXphdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJ1Y2tldC5ydWxlcy5wdXNoKGQuY3VzdG9taXphdGlvbik7XG5cdFx0fVxuXHR9XG5cdC8vIEhvb2tzIGFycml2ZSBhbHJlYWR5IHByb2plY3RlZCAob25lIHBlciBkZWNsYXJpbmcgc2V0dGluZ3MgZmlsZSk7IHRoZXlcblx0Ly8gY2Fycnkgbm8gYElQYXJzZWQqYCB3cmFwcGVyLCBzbyBhdHRyaWJ1dGUgdGhlbSB0byBzY29wZSB2aWEgdGhlaXIgc291cmNlXG5cdC8vIHNldHRpbmdzLWZpbGUgdXJpLlxuXHRmb3IgKGNvbnN0IGhvb2sgb2YgaG9va3MpIHtcblx0XHRmaW5kQ3VzdG9taXphdGlvbkJ1Y2tldChVUkkucGFyc2UoaG9vay51cmkpLCB3b3Jrc3BhY2VCdWNrZXRzLCB1c2VyQnVja2V0KS5ob29rcy5wdXNoKGhvb2spO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0OiBDdXN0b21pemF0aW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCBidWNrZXQgb2YgWy4uLndvcmtzcGFjZUJ1Y2tldHMsIHVzZXJCdWNrZXRdKSB7XG5cdFx0aWYgKGJ1Y2tldC5hZ2VudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmVzdWx0LnB1c2gobWFrZURpcmVjdG9yeShidWNrZXQuYmFzZSwgJ2FnZW50cycsIEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBidWNrZXQuYWdlbnRzKSk7XG5cdFx0fVxuXHRcdGlmIChidWNrZXQuc2tpbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2VEaXJlY3RvcnkoYnVja2V0LmJhc2UsICdza2lsbHMnLCBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgYnVja2V0LnNraWxscykpO1xuXHRcdH1cblx0XHRpZiAoYnVja2V0LnJ1bGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2VEaXJlY3RvcnkoYnVja2V0LmJhc2UsICdydWxlcycsIEN1c3RvbWl6YXRpb25UeXBlLlJ1bGUsIGJ1Y2tldC5ydWxlcykpO1xuXHRcdH1cblx0XHRpZiAoYnVja2V0Lmhvb2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2VEaXJlY3RvcnkoYnVja2V0LmJhc2UsICdob29rcycsIEN1c3RvbWl6YXRpb25UeXBlLkhvb2ssIGJ1Y2tldC5ob29rcykpO1xuXHRcdH1cblx0fVxuXG5cdC8vIE5hdGl2ZSBwbHVnaW5zIGFyZSB0b3AtbGV2ZWwgZW50cmllcyAobGlrZSBNQ1Agc2VydmVycyksIGVhY2ggY2Fycnlpbmdcblx0Ly8gaXRzIGJ1bmRsZWQgY29tcG9uZW50cyBhcyBjaGlsZHJlbi5cblx0Zm9yIChjb25zdCBwbHVnaW4gb2YgbmF0aXZlUGx1Z2lucykge1xuXHRcdHJlc3VsdC5wdXNoKG1ha2VQbHVnaW4ocGx1Z2luKSk7XG5cdH1cblxuXHRyZXN1bHQucHVzaCguLi5tY3BTZXJ2ZXJzKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBBIHN5bnRoZXRpYywgbm9uLW9wZW5hYmxlIFVSSSB0aGF0IG1hcmtzIGFuIFNESy1vbmx5IGN1c3RvbWl6YXRpb24gdGhlXG4gKiBkaXNrIHNjYW4gY291bGRuJ3QgbG9jYXRlLiBUaGUgYGNsYXVkZS1pbnRlcm5hbDpgIHNjaGVtZSBoYXMgbm8gZmlsZVxuICogcHJvdmlkZXIsIHNvIHRoZSB3b3JrYmVuY2ggcmVuZGVycyB0aGUgZW50cnkgcmVhZC1vbmx5IChEZWNpc2lvbiBEMikuXG4gKi9cbmZ1bmN0aW9uIG5vbkVkaXRhYmxlVXJpKGtpbmQ6IHN0cmluZywgbmFtZTogc3RyaW5nKTogVVJJIHtcblx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiBDTEFVREVfSU5URVJOQUxfU0NIRU1FLCBwYXRoOiBgLyR7a2luZH0vJHtlbmNvZGVVUklDb21wb25lbnQobmFtZSl9YCB9KTtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyBhbiB7QGxpbmsgQWdlbnRTZWxlY3Rpb259IFVSSSB0byB0aGUgU0RLIGFnZW50IG5hbWUgdGhlIFNES1xuICogZXhwZWN0cyBvbiBgT3B0aW9ucy5hZ2VudGAuIHtAbGluayBBZ2VudFNlbGVjdGlvbn0gY2FycmllcyBvbmx5IGEgYHVyaWAsXG4gKiBzbyB0aGUgbmFtZSBpcyByZWNvdmVyZWQgZnJvbSB0aGUgc291cmNlOlxuICpcbiAqIC0gQSBgY2xhdWRlLWludGVybmFsOmAgVVJJIFx1MjAxNCBhbiBTREstb25seSBhZ2VudCB0aGUgZGlzayBzY2FuIGNvdWxkbid0XG4gKiAgIGxvY2F0ZSAoRGVjaXNpb24gRDIpOyB0aGUgbmFtZSBpcyB0aGUgcGF0aCBzZWdtZW50IGVuY29kZWQgYnlcbiAqICAge0BsaW5rIG5vbkVkaXRhYmxlVXJpfSAodGhpcyBpcyBpdHMgaW52ZXJzZSkuXG4gKiAtIEEgcmVhbCBgZmlsZTpgIGFnZW50IFx1MjAxNCB0aGUgU0RLIGtleXMgYWdlbnRzIGJ5IHRoZWlyIGZyb250bWF0dGVyXG4gKiAgIGBuYW1lYCwgd2hpY2ggbWF5IGRpZmZlciBmcm9tIHRoZSBmaWxlbmFtZSwgc28gaXQgaXMgcGFyc2VkIChmYWxsaW5nXG4gKiAgIGJhY2sgdG8gdGhlIGJhc2VuYW1lIHdoZW4gdGhlIGZpbGUgY2FuJ3QgYmUgcmVhZCkuXG4gKlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vIGFnZW50IGlzIHNlbGVjdGVkIChvciB0aGUgbmFtZSBjYW4ndCBiZVxuICogcmVjb3ZlcmVkKSBzbyB0aGUgU0RLIGZhbGxzIGJhY2sgdG8gaXRzIGRlZmF1bHQgKG5vIGAtLWFnZW50YCBmbGFnKS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlc29sdmVDbGF1ZGVBZ2VudE5hbWUoXG5cdGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdHNlc3Npb25JZDogc3RyaW5nLFxuKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0aWYgKCFhZ2VudCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGFnZW50LnVyaSk7XG5cblx0Ly8gU0RLLW9ubHkgKG5vbi1lZGl0YWJsZSkgYWdlbnRzIGVuY29kZSB0aGUgbmFtZSBpbiB0aGUgcGF0aDpcblx0Ly8gYGNsYXVkZS1pbnRlcm5hbDovYWdlbnQvPGVuY29kZWQtbmFtZT5gIChpbnZlcnNlIG9mIG5vbkVkaXRhYmxlVXJpKS5cblx0aWYgKHVyaS5zY2hlbWUgPT09IENMQVVERV9JTlRFUk5BTF9TQ0hFTUUpIHtcblx0XHRjb25zdCBsYXN0ID0gdXJpLnBhdGguc3BsaXQoJy8nKS5wb3AoKSA/PyAnJztcblx0XHRjb25zdCBuYW1lID0gbGFzdCA/IGRlY29kZVVSSUNvbXBvbmVudChsYXN0KSA6ICcnO1xuXHRcdGlmICghbmFtZSkge1xuXHRcdFx0bG9nU2VydmljZS53YXJuKGBbQ2xhdWRlOiR7c2Vzc2lvbklkfV0gcmVzb2x2ZUNsYXVkZUFnZW50TmFtZTogY291bGQgbm90IGV4dHJhY3QgYWdlbnQgbmFtZSBmcm9tIFVSSSAnJHthZ2VudC51cml9J2ApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5hbWU7XG5cdH1cblxuXHQvLyBSZWFsIG9uLWRpc2sgYWdlbnQ6IHRoZSBTREsgaWRlbnRpZmllcyBpdCBieSBpdHMgZnJvbnRtYXR0ZXIgYG5hbWVgLFxuXHQvLyB3aGljaCB0aGUgZmlsZW5hbWUgbmVlZCBub3QgbWF0Y2guXG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gYXdhaXQgcGFyc2VBZ2VudEZpbGUodXJpLCBmaWxlU2VydmljZSk7XG5cdFx0aWYgKHBhcnNlZC5uYW1lKSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VkLm5hbWU7XG5cdFx0fVxuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRsb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGU6JHtzZXNzaW9uSWR9XSByZXNvbHZlQ2xhdWRlQWdlbnROYW1lOiBmYWlsZWQgdG8gcGFyc2UgYWdlbnQgZmlsZSAnJHthZ2VudC51cml9JywgZmFsbGluZyBiYWNrIHRvIGJhc2VuYW1lYCwgZXJyKTtcblx0fVxuXG5cdGNvbnN0IGJhc2VuYW1lID0gdXJpLnBhdGguc3BsaXQoJy8nKS5wb3AoKSA/PyAnJztcblx0Y29uc3QgbmFtZSA9IGJhc2VuYW1lLnJlcGxhY2UoL1xcLm1kJC9pLCAnJyk7XG5cdGlmICghbmFtZSkge1xuXHRcdGxvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3Nlc3Npb25JZH1dIHJlc29sdmVDbGF1ZGVBZ2VudE5hbWU6IGNvdWxkIG5vdCBleHRyYWN0IGFnZW50IG5hbWUgZnJvbSBVUkkgJyR7YWdlbnQudXJpfSdgKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBuYW1lO1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgZGlzY292ZXJlZC1jdXN0b21pemF0aW9uIHByb2plY3Rpb24gZm9yIGEgc2Vzc2lvbiwgYXBwbHlpbmdcbiAqIHRoZSBsaXZlIFNESyBzbmFwc2hvdCBhcyBhIHBvc3QtbWF0ZXJpYWxpemUgZmlsdGVyLlxuICpcbiAqIC0gYHNkayA9PT0gdW5kZWZpbmVkYCAocHJvdmlzaW9uYWwpOiB0aGUgZnVsbCBkaXNrLWRpc2NvdmVyZWQgc2V0IGlzXG4gKiAgIHJldHVybmVkIHVuZmlsdGVyZWQgXHUyMDE0IG5vIGxpdmUgc2Vzc2lvbiB5ZXQgdG8gc2F5IHdoYXQncyBhY3RpdmUuXG4gKiAtIGBzZGtgIHByZXNlbnQgKG1hdGVyaWFsaXplZCk6IGRpc2sgZW50cmllcyBhcmUga2VwdCBvbmx5IHdoZW4gdGhlIGxpdmVcbiAqICAgc2Vzc2lvbiBrbm93cyB0aGVtIChtYXRjaGVkIGJ5IG5hbWUsIHBlciB0eXBlIFx1MjAxNCBhZ2VudHMgYWdhaW5zdCB0aGUgU0RLXG4gKiAgIGFnZW50IHNldDsgc2tpbGxzIGFnYWluc3QgdGhlIFNESyBjb21tYW5kIHNldDsgTUNQIGFnYWluc3QgdGhlIFNES1xuICogICBzZXJ2ZXIgc2V0LCBlbnJpY2hlZCB3aXRoIGxpdmUgc3RhdGUpLiBTREsta25vd24gQUdFTlRTIGFuZCBNQ1Agc2VydmVyc1xuICogICB3aXRoIG5vIG1hdGNoaW5nIGRpc2sgZmlsZSBhcmUgc3VyZmFjZWQgYXMgTk9OLUVESVRBQkxFIGVudHJpZXNcbiAqICAgKGBjbGF1ZGUtaW50ZXJuYWw6YCBcdTIwMTQgRGVjaXNpb24gRDIpOiBhIG5vbi1lZGl0YWJsZSBhZ2VudCBpcyBzdGlsbFxuICogICBzZWxlY3RhYmxlIGFuZCBhIG5vbi1lZGl0YWJsZSBNQ1Agc2VydmVyIHN0aWxsIHNob3dzIHN0YXR1cy4gU0RLLW9ubHlcbiAqICAgU0tJTExTIChDbGF1ZGUncyBidWlsdC1pbiBzbGFzaCBjb21tYW5kcyBsaWtlIGAvaW5pdGApIGFyZSBOT1QgbWl4ZWQgaW5cbiAqICAgYW1vbmcgdGhlIGVkaXRhYmxlIGRpc2sgc2tpbGxzIFx1MjAxNCBpbnN0ZWFkIHRoZXkgYXBwZWFyLCByZWFkLW9ubHksIGluIHRoZVxuICogICBzZXBhcmF0ZSBcIkJ1aWx0LWluXCIgc2tpbGxzIGNvbnRhaW5lciB0aGlzIGZ1bmN0aW9uIGFwcGVuZHMuIFRoZSBTREsnc1xuICogICBidWlsdC1pbiBkZWZhdWx0IGFnZW50IGlzIGhpZGRlbi4gUnVsZXMgKENMQVVERS5tZCArIGAuY2xhdWRlL3J1bGVzYClcbiAqICAgaGF2ZSBubyBTREsgY291bnRlcnBhcnQgYW5kIGFyZSBhbHdheXMga2VwdC5cbiAqXG4gKiBUaGUgXCJCdWlsdC1pblwiIHN1cmZhY2luZyBmb3IgQk9USCBhZ2VudHMgYW5kIHNraWxscyBpcyBkZWNpZGVkIGhlcmUgKHRoZVxuICogc2luZ2xlIHBsYWNlIHRoYXQgaGFzIHRoZSBkaXNrIHNldCBhbmQgdGhlIG9wdGlvbmFsIGBzZGtgIHNuYXBzaG90KTogYnVpbHQtaW5cbiAqIGFnZW50cyBtZXJnZSBpbnRvIHRoZSBhZ2VudCBzZXQgKHNlbGVjdGFibGUsIGBjbGF1ZGUtaW50ZXJuYWw6YCk7IGJ1aWx0LWluXG4gKiBza2lsbHMgYXJlIGEgc2VwYXJhdGUgcmVhZC1vbmx5IGNvbnRhaW5lciBhcHBlbmRlZCB0byB0aGUgcmVzdWx0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGREaXNjb3ZlcmVkQ3VzdG9taXphdGlvbnMoXG5cdGRpc2NvdmVyZWQ6IHJlYWRvbmx5IChJUGFyc2VkQWdlbnQgfCBJUGFyc2VkU2tpbGwgfCBJUGFyc2VkUnVsZSlbXSxcblx0bWNwU2VydmVyczogcmVhZG9ubHkgTWNwU2VydmVyQ3VzdG9taXphdGlvbltdLFxuXHRob29rczogcmVhZG9ubHkgSG9va0N1c3RvbWl6YXRpb25bXSxcblx0bmF0aXZlUGx1Z2luczogcmVhZG9ubHkgSVJlc29sdmVkTmF0aXZlUGx1Z2luW10sXG5cdHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCBVUkkgfCB1bmRlZmluZWQsXG5cdHVzZXJIb21lOiBVUkksXG5cdHNkazogSVNka1Jlc29sdmVkQ3VzdG9taXphdGlvbnMgfCB1bmRlZmluZWQsXG4pOiByZWFkb25seSBDdXN0b21pemF0aW9uW10ge1xuXHQvLyBOYXRpdmUgcGx1Z2lucyB0aGUgbGl2ZSBzZXNzaW9uIGFjdHVhbGx5IGxvYWRlZCBcdTIxOTIgc3VyZmFjZWQgYXMgdG9wLWxldmVsXG5cdC8vIGNvbnRhaW5lcnMgKHBhc3NlZCB0byB0aGUgbWFwcGVyIGF0IHRoZSBlbmQpLiBUaGUgU0RLIGBpbml0LnBsdWdpbnNgXG5cdC8vIHJlcG9ydHMgZWFjaCBsb2FkZWQgcGx1Z2luJ3MgYHNvdXJjZWAgKGl0cyBgPHBsdWdpbj5APG1hcmtldHBsYWNlPmAgaWQpXG5cdC8vIGFuZCBhIGBwYXRoYC4gTWF0Y2ggb24gYHNvdXJjZWAgYWdhaW5zdCB0aGUgcmVzb2x2ZWQgcGx1Z2luIGlkIGZpcnN0IFx1MjAxNCBpdFxuXHQvLyBpcyBleGFjdCBhbmQgc3RhYmxlIFx1MjAxNCBhbmQgZmFsbCBiYWNrIHRvIGEgbm9ybWFsaXplZCBgcGF0aGAgbWF0Y2ggKG9sZGVyXG5cdC8vIFNES3Mgd2l0aG91dCBgc291cmNlYCkuIFRoZSBgcGF0aGAgYWxvbmUgaXMgdW5yZWxpYWJsZTogZm9yIGFcblx0Ly8gd29ya3NwYWNlLWBsb2NhbGAtc2NvcGVkIHBsdWdpbiB0aGUgU0RLIGNhbiByZXBvcnQgYSBub24tY2FjaGUgcGF0aCB0aGF0XG5cdC8vIG5ldmVyIG1hdGNoZXMgdGhlIHJlc29sdmVkIHJvb3QuIFRoZSBwbHVnaW4gaXMgdGhlIGF0b21pYyBmaWx0ZXJpbmcgdW5pdC5cblx0Ly9cblx0Ly8gQSBwbHVnaW4ncyBidW5kbGVkIGNvbXBvbmVudHMgYXJlIEFMU08gcmVwb3J0ZWQgYnkgdGhlIGxpdmUgU0RLIGFzXG5cdC8vIGFnZW50cyAvIGNvbW1hbmRzIC8gTUNQIHNlcnZlcnMuIENvbGxlY3QgZWFjaCBzdXJmYWNlZCBwbHVnaW4ncyBvd25cblx0Ly8gcGFyc2VkIGNvbXBvbmVudCBuYW1lcyBzbyB0aG9zZSBTREsgZW50cmllcyBhcmUgc3VwcHJlc3NlZCBmcm9tIHRoZVxuXHQvLyBzdGFuZGFsb25lIGZhbGxiYWNrcyBiZWxvdyBcdTIwMTQgZWFjaCBjb21wb25lbnQgdGhlbiBhcHBlYXJzIG9uY2UsIHVuZGVyIGl0c1xuXHQvLyBwbHVnaW4gY29udGFpbmVyLCBub3QgYWxzbyBsb29zZSBpbiB0aGUgcGVyLXNjb3BlIGxpc3RzIChEZWNpc2lvbiBQQi0xMCkuXG5cdC8vIFRoZSBTREsgbmFtZXMgcGx1Z2luIGNvbXBvbmVudHMgaW5jb25zaXN0ZW50bHkgKGFnZW50cyBuYW1lc3BhY2VkIGFzXG5cdC8vIGA8cGx1Z2luPjo8bmFtZT5gLCBza2lsbHMgdXN1YWxseSBiYXJlKSwgc28gYm90aCBmb3JtcyBhcmUgcmVnaXN0ZXJlZC5cblx0Ly8gT25seSAqc3VyZmFjZWQqIHBsdWdpbnMgY29udHJpYnV0ZSwgc28gYSBsb2FkZWQtYnV0LXVuc3VyZmFjZWQgcGx1Z2luJ3Ncblx0Ly8gY29tcG9uZW50cyBhcmUgbmV2ZXIgc2lsZW50bHkgZHJvcHBlZC4gQSBzaW5nbGUgcGFzcyBtYXRjaGVzIGVhY2ggbmF0aXZlXG5cdC8vIHBsdWdpbiB0byBpdHMgU0RLIGVudHJ5LCBidWlsZGluZyB0aGUgdmlzaWJsZSBzZXQgYW5kIHRoZSBzdXBwcmVzc2lvblxuXHQvLyBuYW1lIHNldHMgdG9nZXRoZXIgKG5vIHNlY29uZCBgZmluZGApLlxuXHRjb25zdCB2aXNpYmxlUGx1Z2luczogSVJlc29sdmVkTmF0aXZlUGx1Z2luW10gPSBbXTtcblx0Y29uc3QgcGx1Z2luQWdlbnROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBwbHVnaW5Ta2lsbE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHBsdWdpbk1jcE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGlmIChzZGspIHtcblx0XHRmb3IgKGNvbnN0IHAgb2YgbmF0aXZlUGx1Z2lucykge1xuXHRcdFx0Y29uc3Qgc2RrUGx1Z2luID0gc2RrLnBsdWdpbnMuZmluZChzID0+IHMuc291cmNlID09PSBwLmlkIHx8IFVSSS5maWxlKHMucGF0aCkuZnNQYXRoID09PSBwLnJvb3QuZnNQYXRoKTtcblx0XHRcdGlmICghc2RrUGx1Z2luKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dmlzaWJsZVBsdWdpbnMucHVzaChwKTtcblx0XHRcdGNvbnN0IG5zID0gc2RrUGx1Z2luLm5hbWU7XG5cdFx0XHRjb25zdCBhZGQgPSAoc2V0OiBTZXQ8c3RyaW5nPiwgbmFtZTogc3RyaW5nKSA9PiB7IHNldC5hZGQobmFtZSk7IGlmIChucykgeyBzZXQuYWRkKGAke25zfToke25hbWV9YCk7IH0gfTtcblx0XHRcdGZvciAoY29uc3QgYSBvZiBwLnBhcnNlZC5hZ2VudHMpIHsgYWRkKHBsdWdpbkFnZW50TmFtZXMsIGEubmFtZSk7IH1cblx0XHRcdGZvciAoY29uc3QgcyBvZiBwLnBhcnNlZC5za2lsbHMpIHsgYWRkKHBsdWdpblNraWxsTmFtZXMsIHMubmFtZSk7IH1cblx0XHRcdGZvciAoY29uc3QgbSBvZiBwLnBhcnNlZC5tY3BTZXJ2ZXJzKSB7IGFkZChwbHVnaW5NY3BOYW1lcywgbS5uYW1lKTsgfVxuXHRcdH1cblx0fSBlbHNlIHtcblx0XHR2aXNpYmxlUGx1Z2lucy5wdXNoKC4uLm5hdGl2ZVBsdWdpbnMpO1xuXHR9XG5cblx0Ly8gVGhlIHJlYWQtb25seSBcIkJ1aWx0LWluXCIgc2tpbGxzIGNvbnRhaW5lcjogcHJlLW1hdGVyaWFsaXplIHRoZSBjdXJhdGVkXG5cdC8vIGxpc3QsIHBvc3QtbWF0ZXJpYWxpemUgdGhlIGxpdmUgU0RLIGNvbW1hbmQgc2V0IG1pbnVzIHRoZSBkaXNrIHNraWxsc1xuXHQvLyAoYW5kIG1pbnVzIHBsdWdpbi1jb250cmlidXRlZCBza2lsbHMsIHdoaWNoIGJlbG9uZyB0byBhIHBsdWdpbiBjb250YWluZXIpLlxuXHQvLyBBcHBlbmRlZCB0byB3aGljaGV2ZXIgcHJvamVjdGlvbiBpcyByZXR1cm5lZCBiZWxvdyBzbyB0aGUgU0RLLXZzLWN1cmF0ZWRcblx0Ly8gZGVjaXNpb24gZm9yIGJ1aWx0LWluIHNraWxscyBzaXRzIG5leHQgdG8gdGhlIG9uZSBmb3IgYnVpbHQtaW4gYWdlbnRzLlxuXHRjb25zdCBkaXNrU2tpbGxOYW1lcyA9IG5ldyBTZXQoXG5cdFx0ZGlzY292ZXJlZC5maWx0ZXIoZCA9PiBkLmN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuU2tpbGwpLm1hcChkID0+IGQubmFtZSlcblx0KTtcblx0Y29uc3QgYnVpbHRpblNraWxscyA9IHNka1xuXHRcdD8gYnVpbGRTZGtCdWlsdGluU2tpbGxzQ29udGFpbmVyKHNkay5jb21tYW5kcy5maWx0ZXIoYyA9PiAhcGx1Z2luU2tpbGxOYW1lcy5oYXMoYy5uYW1lKSksIGRpc2tTa2lsbE5hbWVzKVxuXHRcdDogYnVpbGRDbGF1ZGVCdWlsdGluU2tpbGxzQ29udGFpbmVyKGRpc2tTa2lsbE5hbWVzKTtcblx0Y29uc3Qgd2l0aEJ1aWx0aW5Ta2lsbHMgPSAobGlzdDogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdID0+XG5cdFx0YnVpbHRpblNraWxscyA/IFsuLi5saXN0LCBidWlsdGluU2tpbGxzXSA6IGxpc3Q7XG5cblx0aWYgKCFzZGspIHtcblx0XHQvLyBQcmUtbWF0ZXJpYWxpemUgdGhlcmUgaXMgbm8gbGl2ZSBhZ2VudCBzZXQsIHNvIHNlZWQgdGhlIGN1cmF0ZWRcblx0XHQvLyBidWlsdC1pbiBhZ2VudHMgYWxvbmdzaWRlIHRoZSBkaXNrIGFnZW50cy4gVGhleSB1c2UgdGhlIHNhbWVcblx0XHQvLyBub24tZWRpdGFibGUgYGNsYXVkZS1pbnRlcm5hbDpgIHNoYXBlIHRoZSBTREsgZmFsbGJhY2sgcHJvZHVjZXNcblx0XHQvLyBwb3N0LW1hdGVyaWFsaXplIChzZWxlY3RhYmxlLCBuYW1lIHJvdW5kLXRyaXBzKSwgc28gdGhlIHNhbWUgYWdlbnRcblx0XHQvLyBsb29rcyBpZGVudGljYWwgYmVmb3JlIGFuZCBhZnRlciBtYXRlcmlhbGl6ZS4gQSBkaXNrIGFnZW50IG9mIHRoZVxuXHRcdC8vIHNhbWUgbmFtZSB3aW5zOyB0aGUgU0RLIGRlZmF1bHQgYWdlbnQgaXMgaGlkZGVuLlxuXHRcdGNvbnN0IGRpc2tBZ2VudE5hbWVzID0gbmV3IFNldChcblx0XHRcdGRpc2NvdmVyZWQuZmlsdGVyKGQgPT4gZC5jdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50KS5tYXAoZCA9PiBkLm5hbWUpXG5cdFx0KTtcblx0XHRjb25zdCBidWlsdGluQWdlbnRzID0gQ0xBVURFX0JVSUxUSU5fQUdFTlRTXG5cdFx0XHQuZmlsdGVyKGEgPT4gYS5uYW1lICE9PSBDTEFVREVfU0RLX0RFRkFVTFRfQUdFTlRfTkFNRSAmJiAhZGlza0FnZW50TmFtZXMuaGFzKGEubmFtZSkpXG5cdFx0XHQubWFwKGEgPT4gdG9QYXJzZWRBZ2VudCh7IHVyaTogbm9uRWRpdGFibGVVcmkoJ2FnZW50JywgYS5uYW1lKSwgbmFtZTogYS5uYW1lLCBkZXNjcmlwdGlvbjogYS5kZXNjcmlwdGlvbigpIH0pKTtcblx0XHRyZXR1cm4gd2l0aEJ1aWx0aW5Ta2lsbHMobWFwRGlzY292ZXJlZEN1c3RvbWl6YXRpb25zKFsuLi5kaXNjb3ZlcmVkLCAuLi5idWlsdGluQWdlbnRzXSwgbWNwU2VydmVycywgaG9va3MsIG5hdGl2ZVBsdWdpbnMsIHdvcmtpbmdEaXJlY3RvcmllcywgdXNlckhvbWUpKTtcblx0fVxuXG5cdGNvbnN0IGFnZW50TmFtZXMgPSBuZXcgU2V0KHNkay5hZ2VudHMubWFwKGEgPT4gYS5uYW1lKSk7XG5cdGNvbnN0IGNvbW1hbmROYW1lcyA9IG5ldyBTZXQoc2RrLmNvbW1hbmRzLm1hcChjID0+IGMubmFtZSkpO1xuXHRjb25zdCBtY3BCeU5hbWUgPSBuZXcgTWFwKHNkay5tY3BTZXJ2ZXJzLm1hcChzID0+IFtzLm5hbWUsIHNdIGFzIGNvbnN0KSk7XG5cblx0Ly8gS2VlcCBkaXNrIGVudHJpZXMgdGhlIGxpdmUgc2Vzc2lvbiBhY3R1YWxseSBsb2FkZWQuIEEgbG9hZGVkIHNraWxsXG5cdC8vIHN1cmZhY2VzIGluIHRoZSBTREsncyBgc3VwcG9ydGVkQ29tbWFuZHMoKWAgc2V0LCBzbyBkaXNrIHNraWxscyBhcmVcblx0Ly8gbWF0Y2hlZCBhZ2FpbnN0IGBjb21tYW5kTmFtZXNgLlxuXHRjb25zdCBzZWVuQWdlbnRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGVudHJpZXM6IChJUGFyc2VkQWdlbnQgfCBJUGFyc2VkU2tpbGwgfCBJUGFyc2VkUnVsZSlbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGQgb2YgZGlzY292ZXJlZCkge1xuXHRcdGlmIChkLmN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuQWdlbnQpIHtcblx0XHRcdC8vIEhpZGUgdGhlIFNESydzIGJ1aWx0LWluIGRlZmF1bHQgYWdlbnQgZXZlbiB3aGVuIGEgc2FtZS1uYW1lZFxuXHRcdFx0Ly8gZmlsZSBleGlzdHMgb24gZGlzayBcdTIwMTQgc2VsZWN0aW5nIGl0IGlzIGVxdWl2YWxlbnQgdG8gXCJub1xuXHRcdFx0Ly8gc2VsZWN0aW9uXCIsIHNvIGl0IG11c3QgbmV2ZXIgcmVhY2ggdGhlIHBpY2tlciBwb3N0LW1hdGVyaWFsaXplLlxuXHRcdFx0aWYgKGQubmFtZSA9PT0gQ0xBVURFX1NES19ERUZBVUxUX0FHRU5UX05BTUUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYWdlbnROYW1lcy5oYXMoZC5uYW1lKSkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goZCk7XG5cdFx0XHRcdHNlZW5BZ2VudHMuYWRkKGQubmFtZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChkLmN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuU2tpbGwpIHtcblx0XHRcdGlmIChjb21tYW5kTmFtZXMuaGFzKGQubmFtZSkpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKGQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBSdWxlcyAoQ0xBVURFLm1kICsgYC5jbGF1ZGUvcnVsZXNgKSBoYXZlIG5vIFNESyBjb3VudGVycGFydCwgc29cblx0XHRcdC8vIHRoZXkgYXJlIG5ldmVyIGZpbHRlcmVkIFx1MjAxNCBhbHdheXMga2VlcCB0aGVtLlxuXHRcdFx0ZW50cmllcy5wdXNoKGQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFNESy1rbm93bi1idXQtbm90LW9uLWRpc2sgQUdFTlRTIFx1MjE5MiBub24tZWRpdGFibGUgZmFsbGJhY2sgKERlY2lzaW9uIEQyKTpcblx0Ly8gc3RpbGwgc2VsZWN0YWJsZSBhcyB0aGUgc2Vzc2lvbiBhZ2VudCBldmVuIHdpdGhvdXQgYW4gZWRpdGFibGUgZmlsZS5cblx0Ly8gKFNraWxscyBnZXQgbm8gc3VjaCBmYWxsYmFjayBcdTIwMTQgc2VlIHRoZSBkb2MgY29tbWVudDogYSBub24tb3BlbmFibGVcblx0Ly8gc2tpbGwgZW50cnkgaXMgb25seSBldmVyIGEgZGVhZCBsaW5rLilcblx0Zm9yIChjb25zdCBhZ2VudCBvZiBzZGsuYWdlbnRzKSB7XG5cdFx0aWYgKGFnZW50Lm5hbWUgPT09IENMQVVERV9TREtfREVGQVVMVF9BR0VOVF9OQU1FIHx8IHNlZW5BZ2VudHMuaGFzKGFnZW50Lm5hbWUpIHx8IHBsdWdpbkFnZW50TmFtZXMuaGFzKGFnZW50Lm5hbWUpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0ZW50cmllcy5wdXNoKHRvUGFyc2VkQWdlbnQoeyB1cmk6IG5vbkVkaXRhYmxlVXJpKCdhZ2VudCcsIGFnZW50Lm5hbWUpLCBuYW1lOiBhZ2VudC5uYW1lLCAuLi4oYWdlbnQuZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbiB9IDoge30pIH0pKTtcblx0fVxuXG5cdC8vIE1DUDoga2VlcCBkaXNrIHNlcnZlcnMgdGhlIFNESyBsb2FkZWQgKGVucmljaGVkIHdpdGggbGl2ZSBzdGF0ZSk7IGFkZFxuXHQvLyBTREstb25seSBzZXJ2ZXJzIGFzIG5vbi1lZGl0YWJsZSBlbnRyaWVzIChzdGF0dXMgaXMgc3RpbGwgaW5mb3JtYXRpdmUpLlxuXHRjb25zdCBzZWVuTWNwID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHNlcnZlcnM6IE1jcFNlcnZlckN1c3RvbWl6YXRpb25bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHNlcnZlciBvZiBtY3BTZXJ2ZXJzKSB7XG5cdFx0Y29uc3Qgc2RrU2VydmVyID0gbWNwQnlOYW1lLmdldChzZXJ2ZXIubmFtZSk7XG5cdFx0aWYgKCFzZGtTZXJ2ZXIpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRzZWVuTWNwLmFkZChzZXJ2ZXIubmFtZSk7XG5cdFx0c2VydmVycy5wdXNoKHsgLi4uc2VydmVyLCBzdGF0ZTogZGVyaXZlTWNwU3RhdGUoc2RrU2VydmVyLnN0YXR1cykgfSk7XG5cdH1cblx0Zm9yIChjb25zdCBbbmFtZSwgc2RrU2VydmVyXSBvZiBtY3BCeU5hbWUpIHtcblx0XHRpZiAoc2Vlbk1jcC5oYXMobmFtZSkgfHwgcGx1Z2luTWNwTmFtZXMuaGFzKG5hbWUpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Ly8gVGhlIGFnZW50IGhvc3QgaW5qZWN0cyBpdHMgb3duIGluLXByb2Nlc3MgTUNQIHNlcnZlcnMgKHRoZSBjbGllbnQtdG9vbFxuXHRcdC8vIGFuZCBzZXJ2ZXItdG9vbCBicmlkZ2VzKSBpbnRvIGBPcHRpb25zLm1jcFNlcnZlcnNgLCBhbmQgdGhlIFNESyByZXBvcnRzXG5cdFx0Ly8gdGhlbSBoZXJlIGFsb25nc2lkZSByZWFsIG9uZXMuIFRoZXkgYXJlIGludGVybmFsIHBsdW1iaW5nIHdpdGggbm9cblx0XHQvLyBkZWZpbml0aW9uIHRoZSB1c2VyIGNhbiBhY3Qgb24sIHNvIGFuIFNESy1vbmx5IGVudHJ5IHVuZGVyIG9uZSBvZiB0aG9zZVxuXHRcdC8vIG5hbWVzIGlzIG91cnM6IHN1cmZhY2luZyBpdCB3b3VsZCBzaG93IGEgcGhhbnRvbSBjdXN0b21pemF0aW9uIEFORCBmZWVkXG5cdFx0Ly8gaXRzIG5hbWUgaW50byB0aGUgc2Vzc2lvbidzIE1DUCBlbmFibGVtZW50IHJlY29uY2lsaWF0aW9uLCB3aGljaCB0aGVuXG5cdFx0Ly8gdHJpZXMgdG8gdG9nZ2xlIGEgc2VydmVyIHRoZSBDTEkgaGFzIG5vIGNvbmZpZ3VyYXRpb24gZm9yXG5cdFx0Ly8gKGBTZXJ2ZXIgbm90IGZvdW5kOiA8bmFtZT5gKS4gQSBzZXJ2ZXIgdGhlIGRpc2sgc2NhbiBkaWQgZGVmaW5lIHVuZGVyXG5cdFx0Ly8gdGhlIHNhbWUgbmFtZSBpcyBtYXRjaGVkIGFib3ZlIGFuZCBrZXB0LCBzbyBhIHVzZXItY29uZmlndXJlZCBzZXJ2ZXIgaXNcblx0XHQvLyBuZXZlciBoaWRkZW4gYnkgdGhpcy5cblx0XHRpZiAoaXNIb3N0SW5qZWN0ZWRNY3BTZXJ2ZXJOYW1lKG5hbWUpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0c2VydmVycy5wdXNoKHsgLi4ubWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb24obm9uRWRpdGFibGVVcmkoJ21jcCcsIG5hbWUpLCBuYW1lKSwgc3RhdGU6IGRlcml2ZU1jcFN0YXRlKHNka1NlcnZlci5zdGF0dXMpIH0pO1xuXHR9XG5cblx0Ly8gTmF0aXZlIHBsdWdpbnMgd2VyZSBtYXRjaGVkIHRvIHRoZSBsaXZlIFNESyBzZXQgYXQgdGhlIHRvcCBvZiB0aGlzXG5cdC8vIGZ1bmN0aW9uIChgdmlzaWJsZVBsdWdpbnNgKTsgc3VyZmFjZSB0aGVtIGFzIHRvcC1sZXZlbCBjb250YWluZXJzLlxuXHRyZXR1cm4gd2l0aEJ1aWx0aW5Ta2lsbHMobWFwRGlzY292ZXJlZEN1c3RvbWl6YXRpb25zKGVudHJpZXMsIHNlcnZlcnMsIGhvb2tzLCB2aXNpYmxlUGx1Z2lucywgd29ya2luZ0RpcmVjdG9yaWVzLCB1c2VySG9tZSkpO1xufVxuXG4vKipcbiAqIFRoZSBjdXN0b21pemF0aW9uLXNvdXJjZSBzdWJwYXRocyB1bmRlciBhIGAuY2xhdWRlYCBkaXJlY3RvcnkuIE9ubHkgZWRpdHNcbiAqIHRvIHRoZXNlIHNob3VsZCBmb3JjZSBhIHJlLXNjYW4uIEV2ZXJ5dGhpbmcgZWxzZSB1bmRlciBgLmNsYXVkZWAgaXMgQ2xhdWRlXG4gKiBTREsgcnVudGltZSBjaHVybiBcdTIwMTQgYGhpc3RvcnkuanNvbmxgLCBgcHJvamVjdHMvYCAocGVyLW1lc3NhZ2UgdHJhbnNjcmlwdHMpLFxuICogYHRhc2tzL2AsIGBmaWxlLWhpc3RvcnkvYCwgYHNlc3Npb25zL2AsIGBzaGVsbC1zbmFwc2hvdHMvYCwgYGJhY2t1cHMvYCxcbiAqIGBzZXNzaW9uLWVudi9gLCBgc3RhdHNpZ2AsIGFuZCBhc3NvcnRlZCBgKi1jYWNoZS5qc29uYCBmaWxlcyBcdTIwMTQgYWxsIG9mIHdoaWNoXG4gKiB0aGUgU0RLIHJld3JpdGVzIGNvbnN0YW50bHkgZHVyaW5nIGEgdHVybi4gVHJpZ2dlcmluZyBvbiB0aG9zZSBwcm9kdWNlZCBhXG4gKiBzdG9ybSBvZiBgU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZGAgZW52ZWxvcGVzICh0aG91c2FuZHMgcGVyIHNlc3Npb24pLFxuICogc28gdGhlIHdhdGNoZXIgZGVsaWJlcmF0ZWx5IHRyaWdnZXJzIG9uIHRoaXMgYWxsb3dsaXN0IG9ubHkuXG4gKi9cbmNvbnN0IENMQVVERV9DVVNUT01JWkFUSU9OX1NVQlBBVEhTOiByZWFkb25seSBzdHJpbmdbXSA9IE9iamVjdC5mcmVlemUoW1xuXHQnYWdlbnRzJyxcblx0J3NraWxscycsXG5cdCdjb21tYW5kcycsXG5cdCdydWxlcycsXG5cdCdwbHVnaW5zJyxcblx0J0NMQVVERS5tZCcsXG5cdCdzZXR0aW5ncy5qc29uJyxcblx0J3NldHRpbmdzLmxvY2FsLmpzb24nLFxuXSk7XG5cbi8qKlxuICogV2F0Y2hlcyBhIHNlc3Npb24ncyBvbi1kaXNrIENsYXVkZSBjdXN0b21pemF0aW9uIHNvdXJjZXMgYW5kIGZpcmVzXG4gKiB7QGxpbmsgb25EaWRDaGFuZ2V9IChkZWJvdW5jZWQpIHdoZW5ldmVyIGFueSBvZiB0aGVtIGlzIGNyZWF0ZWQsIGVkaXRlZCxcbiAqIG9yIHJlbW92ZWQsIHNvIHRoZSB3b3JrYmVuY2ggcmUtZmV0Y2hlcyBgZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zYC5cbiAqXG4gKiBXYXRjaGVkIHJvb3RzOlxuICogIC0gYDxjd2Q+Ly5jbGF1ZGVgIGFuZCBgPHVzZXJIb21lPi8uY2xhdWRlYCAocmVjdXJzaXZlKSBcdTIwMTQgY292ZXIgdGhlXG4gKiAgICBhZ2VudHMgLyBza2lsbHMgLyBjb21tYW5kcyB0cmVlcywgdGhlIGAuY2xhdWRlL3J1bGVzYCArIGAuY2xhdWRlL0NMQVVERS5tZGBcbiAqICAgIGluc3RydWN0aW9uIHNvdXJjZXMsIHBsdXMgdGhlIGlubGluZSBgc2V0dGluZ3MuanNvbmAgTUNQIGNvbmZpZy5cbiAqICAtIGA8Y3dkPmAgKG5vbi1yZWN1cnNpdmUpIFx1MjAxNCB3YXRjaGVkIHRvIGNhdGNoIHRoZSBzaWJsaW5nIGAubWNwLmpzb25gIGFuZFxuICogICAgdGhlIHJvb3QgYENMQVVERS5tZGAgLyBgQ0xBVURFLmxvY2FsLm1kYCBtZW1vcnkgZmlsZXMuXG4gKlxuICogVGhlIHJlY3Vyc2l2ZSBgLmNsYXVkZWAgd2F0Y2hlcyBrZWVwIE9TLWxldmVsIHdhdGNoZXIgY291bnQgbG93LCBidXQgdGhlXG4gKiBjaGFuZ2UgKnRyaWdnZXJzKiBhcmUgbmFycm93ZWQgdG8ge0BsaW5rIENMQVVERV9DVVNUT01JWkFUSU9OX1NVQlBBVEhTfSAoYW5kXG4gKiB0aGUgc3BlY2lmaWMgbWVtb3J5IC8gYC5tY3AuanNvbmAgZmlsZXMpIHNvIHRoZSBTREsncyBoaWdoLWZyZXF1ZW5jeSBydW50aW1lXG4gKiB3cml0ZXMgZWxzZXdoZXJlIHVuZGVyIGAuY2xhdWRlYCAoYW5kIHVucmVsYXRlZCBlZGl0cyBpbiB0aGUgd29ya3NwYWNlIHJvb3QpXG4gKiBkb24ndCBmb3JjZSBhIHJlLXNjYW4uXG4gKi9cbmV4cG9ydCBjbGFzcyBDbGF1ZGVDdXN0b21pemF0aW9uV2F0Y2hlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFQk9VTkNFX01TID0gMzAwO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgVVJJIHwgdW5kZWZpbmVkLFxuXHRcdHVzZXJIb21lOiBVUkksXG5cdFx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRkZWJvdW5jZU1zOiBudW1iZXIgPSBDbGF1ZGVDdXN0b21pemF0aW9uV2F0Y2hlci5ERUJPVU5DRV9NUyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHJvb3RzID0gZGlzdGluY3RDbGF1ZGVXb3JraW5nRGlyZWN0b3JpZXMoQXJyYXkuaXNBcnJheSh3b3JraW5nRGlyZWN0b3JpZXMpID8gd29ya2luZ0RpcmVjdG9yaWVzIDogd29ya2luZ0RpcmVjdG9yaWVzID8gW3dvcmtpbmdEaXJlY3Rvcmllc10gOiBbXSk7XG5cdFx0Ly8gVVJJcyB3aG9zZSBzdWJ0cmVlIChvciBleGFjdCBmaWxlLCBmb3IgYC5tY3AuanNvbmApIHNpZ25hbHMgYSByZS1zY2FuLlxuXHRcdGNvbnN0IHRyaWdnZXJzOiBVUklbXSA9IFtdO1xuXHRcdGNvbnN0IHdhdGNoZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCB3YXRjaCA9ICh1cmk6IFVSSSwgcmVjdXJzaXZlOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBrZXkgPSBgJHtyZWN1cnNpdmV9OiR7dXJpLnRvU3RyaW5nKCl9YDtcblx0XHRcdGlmICh3YXRjaGVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHdhdGNoZWQuYWRkKGtleSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS53YXRjaCh1cmksIHsgcmVjdXJzaXZlLCBleGNsdWRlczogW10gfSkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2Uud2FybihgW0NsYXVkZUN1c3RvbWl6YXRpb25XYXRjaGVyXSBmYWlsZWQgdG8gd2F0Y2ggJyR7dXJpLnRvU3RyaW5nKCl9JzogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFRyaWdnZXIgb25seSBvbiB0aGUgY3VzdG9taXphdGlvbiBzb3VyY2VzIHVuZGVyIGEgYC5jbGF1ZGVgIHJvb3QsIG5vdFxuXHRcdC8vIG9uIHRoZSByb290IGl0c2VsZiBcdTIwMTQgdGhhdCB3b3VsZCBmaXJlIG9uIGV2ZXJ5IFNESyBydW50aW1lIHdyaXRlIChzZWVcblx0XHQvLyBDTEFVREVfQ1VTVE9NSVpBVElPTl9TVUJQQVRIUykuXG5cdFx0Y29uc3QgYWRkQ2xhdWRlVHJpZ2dlcnMgPSAoYmFzZTogVVJJKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHN1YiBvZiBDTEFVREVfQ1VTVE9NSVpBVElPTl9TVUJQQVRIUykge1xuXHRcdFx0XHR0cmlnZ2Vycy5wdXNoKFVSSS5qb2luUGF0aChiYXNlLCBzdWIpKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJpbWFyeSA9IHJvb3RzWzBdO1xuXHRcdGlmIChwcmltYXJ5KSB7XG5cdFx0XHRjb25zdCBwcm9qZWN0Q2xhdWRlID0gVVJJLmpvaW5QYXRoKHByaW1hcnksICcuY2xhdWRlJyk7XG5cdFx0XHR3YXRjaChwcm9qZWN0Q2xhdWRlLCB0cnVlKTtcblx0XHRcdGFkZENsYXVkZVRyaWdnZXJzKHByb2plY3RDbGF1ZGUpO1xuXHRcdFx0d2F0Y2gocHJpbWFyeSwgZmFsc2UpO1xuXHRcdFx0dHJpZ2dlcnMucHVzaChVUkkuam9pblBhdGgocHJpbWFyeSwgJy5tY3AuanNvbicpKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBhZGRpdGlvbmFsIG9mIHJvb3RzLnNsaWNlKDEpKSB7XG5cdFx0XHRjb25zdCBwcm9qZWN0Q2xhdWRlID0gVVJJLmpvaW5QYXRoKGFkZGl0aW9uYWwsICcuY2xhdWRlJyk7XG5cdFx0XHR3YXRjaChwcm9qZWN0Q2xhdWRlLCB0cnVlKTtcblx0XHRcdHRyaWdnZXJzLnB1c2goXG5cdFx0XHRcdFVSSS5qb2luUGF0aChwcm9qZWN0Q2xhdWRlLCAnYWdlbnRzJyksXG5cdFx0XHRcdFVSSS5qb2luUGF0aChwcm9qZWN0Q2xhdWRlLCAnc2tpbGxzJyksXG5cdFx0XHRcdFVSSS5qb2luUGF0aChwcm9qZWN0Q2xhdWRlLCAnc2V0dGluZ3MuanNvbicpLFxuXHRcdFx0XHRVUkkuam9pblBhdGgocHJvamVjdENsYXVkZSwgJ3NldHRpbmdzLmxvY2FsLmpzb24nKSxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGNvbnN0IHVzZXJDbGF1ZGUgPSBVUkkuam9pblBhdGgodXNlckhvbWUsICcuY2xhdWRlJyk7XG5cdFx0d2F0Y2godXNlckNsYXVkZSwgdHJ1ZSk7XG5cdFx0YWRkQ2xhdWRlVHJpZ2dlcnModXNlckNsYXVkZSk7XG5cblx0XHQvLyBNZW1vcnkgZmlsZXMgKENMQVVERS5tZCAvIENMQVVERS5sb2NhbC5tZCkgXHUyMDE0IHJldXNlIHRoZSBzY2FubmVyJ3Ncblx0XHQvLyBjYW5vbmljYWwgbGlzdCBzbyB0aGUgd2F0Y2hlciBuZXZlciBkcmlmdHMgZnJvbSB3aGF0IGl0IGFjdHVhbGx5XG5cdFx0Ly8gcmVhZHMuIEVudHJpZXMgYWxyZWFkeSB1bmRlciBhIHJlY3Vyc2l2ZWx5LXdhdGNoZWQgYC5jbGF1ZGVgIHJvb3Rcblx0XHQvLyAoZS5nLiBgLmNsYXVkZS9DTEFVREUubWRgKSBhcmUgaGFybWxlc3MgZHVwbGljYXRlIHRyaWdnZXJzLlxuXHRcdHRyaWdnZXJzLnB1c2goLi4uY2xhdWRlTWVtb3J5RmlsZXMocHJpbWFyeSwgdXNlckhvbWUpKTtcblxuXHRcdC8vIENvbGxhcHNlIHRoZSByYXcgZmlsZS1jaGFuZ2Ugc3RyZWFtIGludG8gYSBzaW5nbGUgZGVib3VuY2VkIHNpZ25hbC5cblx0XHQvLyBUaGUgYERpc3Bvc2FibGVTdG9yZWAgYXJndW1lbnQgaXMgcmVxdWlyZWQgYmVjYXVzZSBgb25EaWRDaGFuZ2VgIGlzIGFcblx0XHQvLyBwdWJsaWMgcHJvcGVydHkgKHNlZSB0aGUgYEV2ZW50LmRlYm91bmNlYCBsZWFrLXNhZmV0eSBub3RlKS5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlID0gRXZlbnQuc2lnbmFsKEV2ZW50LmRlYm91bmNlKFxuXHRcdFx0RXZlbnQuZmlsdGVyKGZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UsIGUgPT4gdHJpZ2dlcnMuc29tZSh0ID0+IGUuYWZmZWN0cyh0KSksIHRoaXMuX3N0b3JlKSxcblx0XHRcdChfbGFzdCwgZSkgPT4gZSxcblx0XHRcdGRlYm91bmNlTXMsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0aGlzLl9zdG9yZSxcblx0XHQpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUczQixTQUFTLDRCQUE0QixnQkFBZ0IscUJBQTZFO0FBQ2xJLFNBQVMseUJBQTJFO0FBQ3BGLFNBQVMseUJBQXlCLHVCQUE2TjtBQUUvUCxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHVCQUF1QixtQ0FBbUMsc0NBQXNDO0FBQ3pHLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsMkNBQTJDO0FBTzdDLE1BQU0sZ0NBQWdDO0FBUzdDLE1BQU0seUJBQXlCO0FBRS9CLFNBQVMsY0FBYyxNQUFXLEtBQWEsVUFB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
