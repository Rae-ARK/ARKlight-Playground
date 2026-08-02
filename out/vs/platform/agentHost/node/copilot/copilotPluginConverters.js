import { spawn } from "child_process";
import { Schemas } from "../../../../base/common/network.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { parseFrontMatter } from "../../../../base/common/yaml.js";
import { McpServerType } from "../../../mcp/common/mcpPlatformTypes.js";
import { dirname } from "../../../../base/common/path.js";
function toSdkMcpServers(defs) {
  const result = {};
  for (const def of defs) {
    result[def.name] = toSdkMcpServer(def.name, def.configuration);
  }
  return result;
}
function toSdkMcpServersFromConfigMap(servers) {
  const result = {};
  for (const [name, config] of Object.entries(servers)) {
    if (isSupportedMcpServerConfiguration(config)) {
      result[name] = toSdkMcpServer(name, config);
    }
  }
  return result;
}
function isSupportedMcpServerConfiguration(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  if (candidate.type === McpServerType.LOCAL) {
    return typeof candidate.command === "string";
  }
  if (candidate.type === McpServerType.REMOTE) {
    return typeof candidate.url === "string";
  }
  return false;
}
function toSdkMcpServer(_name, config) {
  if (config.type === McpServerType.LOCAL) {
    return {
      type: "local",
      command: config.command,
      args: config.args ? [...config.args] : [],
      tools: ["*"],
      ...config.env && { env: toStringEnv(config.env) },
      ...config.cwd && { cwd: config.cwd }
    };
  }
  return {
    type: "http",
    url: config.url,
    tools: ["*"],
    ...config.headers && { headers: { ...config.headers } }
  };
}
function toStringEnv(env) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== null) {
      result[key] = String(value);
    }
  }
  return result;
}
async function toSdkCustomAgents(agents, fileService) {
  const configs = [];
  for (const agent of agents) {
    try {
      const content = await fileService.readFile(agent.uri);
      const raw = content.value.toString();
      const md = parseFrontMatter(raw);
      if (!md) {
        configs.push({
          name: agent.name,
          prompt: raw
        });
      } else {
        const name = md.getStringValue("name")?.trim() || agent.name;
        const description = md.getStringValue("description");
        const tools = md.getStringArrayValue("tools");
        const skills = md.getStringArrayValue("skills");
        let infer = md.getBooleanValue("infer");
        const disableModelInvocation = md.getBooleanValue("disable-model-invocation");
        if (infer === void 0 && disableModelInvocation === true) {
          infer = false;
        }
        const prompt = md.body ?? raw;
        let model = md.getStringValue("model") ?? void 0;
        const models = md.getStringArrayValue("model") ?? void 0;
        if (!model && models && Array.isArray(models) && models.length > 0) {
          model = models[0];
        }
        configs.push({
          name,
          ...description ? { description } : {},
          ...model ? { model } : {},
          tools: tools && tools.length > 0 ? tools : null,
          ...skills !== void 0 ? { skills } : {},
          ...infer !== void 0 ? { infer } : {},
          prompt
        });
      }
    } catch {
    }
  }
  return configs;
}
async function toSdkSessionCustomAgents(plugins, resolvedAgentName, fileService) {
  const pluginsWithoutDirs = plugins.filter((p) => !p.pluginDir || p.pluginDir.scheme !== Schemas.file);
  const customAgents = await toSdkCustomAgents(pluginsWithoutDirs.flatMap((p) => p.agents), fileService);
  if (resolvedAgentName && !customAgents.some((agent) => agent.name === resolvedAgentName)) {
    const selectedAgents = plugins.flatMap((p) => p.agents).filter((agent) => agent.name === resolvedAgentName);
    for (const config of await toSdkCustomAgents(selectedAgents, fileService)) {
      if (!customAgents.some((agent) => agent.name === config.name)) {
        customAgents.push(config);
      }
    }
  }
  return customAgents;
}
function toAgentCustomizations(agents) {
  return agents.map((a) => a.customization);
}
function toChildCustomizations(plugins) {
  const byId = /* @__PURE__ */ new Map();
  const add = (c) => {
    if (!byId.has(c.id)) {
      byId.set(c.id, c);
    }
  };
  for (const plugin of plugins) {
    for (const a of plugin.agents) {
      add(a.customization);
    }
    for (const s of plugin.skills) {
      add(s.customization);
    }
    for (const r of plugin.instructions) {
      add(r.customization);
    }
    for (const h of plugin.hooks) {
      add(h.customization);
    }
    for (const m of plugin.mcpServers) {
      add(m.customization);
    }
  }
  return [...byId.values()];
}
function toSdkSkillDirectories(skills) {
  return toSdkResourceDirectories(skills);
}
function toSdkInstructionDirectories(instructions) {
  return toSdkResourceDirectories(instructions);
}
function toSdkResourceDirectories(resources) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const resource of resources) {
    const dir = dirname(resource.uri.fsPath);
    if (!seen.has(dir)) {
      seen.add(dir);
      result.push(dir);
    }
  }
  return result;
}
function resolveEffectiveCommand(hook, os) {
  if (os === OperatingSystem.Windows && hook.windows) {
    return hook.windows;
  } else if (os === OperatingSystem.Macintosh && hook.osx) {
    return hook.osx;
  } else if (os === OperatingSystem.Linux && hook.linux) {
    return hook.linux;
  }
  return hook.command;
}
function executeHookCommand(hook, stdin) {
  const command = resolveEffectiveCommand(hook, OS);
  if (!command) {
    return Promise.resolve("");
  }
  const timeout = (hook.timeout ?? 30) * 1e3;
  const cwd = hook.cwd?.fsPath;
  return new Promise((resolve, reject) => {
    const isWindows = OS === OperatingSystem.Windows;
    const shell = isWindows ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];
    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env, ...hook.env },
      stdio: ["pipe", "pipe", "pipe"],
      timeout
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Hook command exited with code ${code}: ${stderr || stdout}`));
      }
    });
  });
}
async function runHookCommands(commands, input) {
  if (!commands) {
    return void 0;
  }
  const stdin = JSON.stringify(input);
  for (const cmd of commands) {
    try {
      const output = await executeHookCommand(cmd, stdin);
      if (output.trim()) {
        try {
          const parsed = JSON.parse(output);
          if (parsed && typeof parsed === "object") {
            return parsed;
          }
        } catch {
        }
      }
    } catch {
    }
  }
  return void 0;
}
const HOOK_TYPE_TO_SDK_KEY = {
  "PreToolUse": "onPreToolUse",
  "PostToolUse": "onPostToolUse",
  "UserPromptSubmit": "onUserPromptSubmitted",
  "SessionStart": "onSessionStart",
  "SessionEnd": "onSessionEnd",
  "ErrorOccurred": "onErrorOccurred"
};
function toSdkHooks(hookGroups, editTrackingHooks) {
  const commandsByKey = /* @__PURE__ */ new Map();
  for (const group of hookGroups) {
    const sdkKey = HOOK_TYPE_TO_SDK_KEY[group.type];
    if (!sdkKey) {
      continue;
    }
    const existing = commandsByKey.get(sdkKey) ?? [];
    existing.push(...group.commands);
    commandsByKey.set(sdkKey, existing);
  }
  const hooks = {};
  const preToolCommands = commandsByKey.get("onPreToolUse");
  if (preToolCommands?.length || editTrackingHooks) {
    hooks.onPreToolUse = async (input) => {
      await editTrackingHooks?.onPreToolUse(input);
      return runHookCommands(preToolCommands, input);
    };
  }
  const postToolCommands = commandsByKey.get("onPostToolUse");
  if (postToolCommands?.length || editTrackingHooks) {
    hooks.onPostToolUse = async (input) => {
      await editTrackingHooks?.onPostToolUse(input);
      return runHookCommands(postToolCommands, input);
    };
  }
  const promptCommands = commandsByKey.get("onUserPromptSubmitted");
  if (promptCommands?.length) {
    hooks.onUserPromptSubmitted = async (input) => {
      const stdin = JSON.stringify(input);
      for (const cmd of promptCommands) {
        try {
          await executeHookCommand(cmd, stdin);
        } catch {
        }
      }
    };
  }
  const startCommands = commandsByKey.get("onSessionStart");
  if (startCommands?.length) {
    hooks.onSessionStart = async (input) => {
      const stdin = JSON.stringify(input);
      for (const cmd of startCommands) {
        try {
          await executeHookCommand(cmd, stdin);
        } catch {
        }
      }
    };
  }
  const endCommands = commandsByKey.get("onSessionEnd");
  if (endCommands?.length) {
    hooks.onSessionEnd = async (input) => {
      const stdin = JSON.stringify(input);
      for (const cmd of endCommands) {
        try {
          await executeHookCommand(cmd, stdin);
        } catch {
        }
      }
    };
  }
  const errorCommands = commandsByKey.get("onErrorOccurred");
  if (errorCommands?.length) {
    hooks.onErrorOccurred = async (input) => {
      const stdin = JSON.stringify(input);
      for (const cmd of errorCommands) {
        try {
          await executeHookCommand(cmd, stdin);
        } catch {
        }
      }
    };
  }
  return hooks;
}
function parsedPluginsEqual(a, b) {
  const serialize = (plugins) => {
    return JSON.stringify(plugins.map((p) => ({
      format: p.format,
      hooks: p.hooks.map((h) => ({ type: h.type, commands: h.commands.map((c) => ({ command: c.command, windows: c.windows, linux: c.linux, osx: c.osx, cwd: c.cwd?.toString(), env: c.env, timeout: c.timeout })) })),
      mcpServers: p.mcpServers.map((m) => ({ name: m.name, configuration: m.configuration })),
      skills: p.skills.map((s) => ({ uri: s.uri.toString(), name: s.name })),
      agents: p.agents.map((a2) => ({ uri: a2.uri.toString(), name: a2.name })),
      instructions: p.instructions.map((i) => ({ uri: i.uri.toString(), name: i.name }))
    })));
  };
  return serialize(a) === serialize(b);
}
export {
  parsedPluginsEqual,
  toAgentCustomizations,
  toChildCustomizations,
  toSdkCustomAgents,
  toSdkHooks,
  toSdkInstructionDirectories,
  toSdkMcpServers,
  toSdkMcpServersFromConfigMap,
  toSdkSessionCustomAgents,
  toSdkSkillDirectories
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2NvcGlsb3QvY29waWxvdFBsdWdpbkNvbnZlcnRlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzcGF3biB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHR5cGUgeyBDdXN0b21BZ2VudENvbmZpZywgTUNQU2VydmVyQ29uZmlnLCBTZXNzaW9uQ29uZmlnIH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHBhcnNlRnJvbnRNYXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi95YW1sLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJUeXBlLCB0eXBlIElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB0eXBlIHsgSU1jcFNlcnZlckRlZmluaXRpb24sIElOYW1lZFBsdWdpblJlc291cmNlLCBJUGFyc2VkQWdlbnQsIElQYXJzZWRIb29rQ29tbWFuZCwgSVBhcnNlZEhvb2tHcm91cCwgSVBhcnNlZFBsdWdpbiB9IGZyb20gJy4uLy4uLy4uL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyB0eXBlIEFnZW50Q3VzdG9taXphdGlvbiwgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuXG50eXBlIFNlc3Npb25Ib29rcyA9IE5vbk51bGxhYmxlPFNlc3Npb25Db25maWdbJ2hvb2tzJ10+O1xudHlwZSBQcmVUb29sVXNlSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uUHJlVG9vbFVzZSddPj5bMF07XG50eXBlIFBvc3RUb29sVXNlSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uUG9zdFRvb2xVc2UnXT4+WzBdO1xudHlwZSBVc2VyUHJvbXB0U3VibWl0dGVkSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uVXNlclByb21wdFN1Ym1pdHRlZCddPj5bMF07XG50eXBlIFNlc3Npb25TdGFydEhvb2tJbnB1dCA9IFBhcmFtZXRlcnM8Tm9uTnVsbGFibGU8U2Vzc2lvbkhvb2tzWydvblNlc3Npb25TdGFydCddPj5bMF07XG50eXBlIFNlc3Npb25FbmRIb29rSW5wdXQgPSBQYXJhbWV0ZXJzPE5vbk51bGxhYmxlPFNlc3Npb25Ib29rc1snb25TZXNzaW9uRW5kJ10+PlswXTtcbnR5cGUgRXJyb3JPY2N1cnJlZEhvb2tJbnB1dCA9IFBhcmFtZXRlcnM8Tm9uTnVsbGFibGU8U2Vzc2lvbkhvb2tzWydvbkVycm9yT2NjdXJyZWQnXT4+WzBdO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIE1DUCBzZXJ2ZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBDb252ZXJ0cyBwYXJzZWQgTUNQIHNlcnZlciBkZWZpbml0aW9ucyBpbnRvIHRoZSBTREsncyBgbWNwU2VydmVyc2AgY29uZmlnLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9TZGtNY3BTZXJ2ZXJzKGRlZnM6IHJlYWRvbmx5IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10pOiBSZWNvcmQ8c3RyaW5nLCBNQ1BTZXJ2ZXJDb25maWc+IHtcblx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBNQ1BTZXJ2ZXJDb25maWc+ID0ge307XG5cdGZvciAoY29uc3QgZGVmIG9mIGRlZnMpIHtcblx0XHRyZXN1bHRbZGVmLm5hbWVdID0gdG9TZGtNY3BTZXJ2ZXIoZGVmLm5hbWUsIGRlZi5jb25maWd1cmF0aW9uKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIENvbnZlcnRzIHJvb3QgTUNQIHNlcnZlciBjb25maWcgbWFwcyBpbnRvIHRoZSBTREsncyBgbWNwU2VydmVyc2AgY29uZmlnLlxuICpcbiAqIFRoZSBtYXAgb3JpZ2luYXRlcyBmcm9tIHVzZXItY29udHJvbGxlZCByb290IGNvbmZpZywgd2hlcmUgdGhlIHNjaGVtYSBjYW5ub3RcbiAqIGV4cHJlc3MgcGVyLWVudHJ5IHZhbGlkYXRpb24gKG5vIGBhZGRpdGlvbmFsUHJvcGVydGllc2ApLiBFbnRyaWVzIGFyZVxuICogdGhlcmVmb3JlIHRyZWF0ZWQgYXMgYHVua25vd25gIGFuZCBzaWxlbnRseSBza2lwcGVkIHVubGVzcyB0aGV5IG1hdGNoIG9uZSBvZlxuICogdGhlIHR3byBzdXBwb3J0ZWQgc2hhcGVzIChgc3RkaW9gIHdpdGggYSBgY29tbWFuZGAsIG9yIGBodHRwYCB3aXRoIGEgYHVybGApLFxuICogc28gYSBtYWxmb3JtZWQgZW50cnkgY2FuJ3Qgc3VyZmFjZSBhcyBgY29tbWFuZGAvYHVybDogdW5kZWZpbmVkYCBpbiB0aGUgU0RLXG4gKiBjb25maWcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1Nka01jcFNlcnZlcnNGcm9tQ29uZmlnTWFwKHNlcnZlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUmVjb3JkPHN0cmluZywgTUNQU2VydmVyQ29uZmlnPiB7XG5cdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgTUNQU2VydmVyQ29uZmlnPiA9IHt9O1xuXHRmb3IgKGNvbnN0IFtuYW1lLCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKHNlcnZlcnMpKSB7XG5cdFx0aWYgKGlzU3VwcG9ydGVkTWNwU2VydmVyQ29uZmlndXJhdGlvbihjb25maWcpKSB7XG5cdFx0XHRyZXN1bHRbbmFtZV0gPSB0b1Nka01jcFNlcnZlcihuYW1lLCBjb25maWcpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIE5hcnJvd3MgYW4gdW50cnVzdGVkIHZhbHVlIHRvIGEgc3VwcG9ydGVkIHtAbGluayBJTWNwU2VydmVyQ29uZmlndXJhdGlvbn06XG4gKiBhIGBzdGRpb2Agc2VydmVyIHdpdGggYSBzdHJpbmcgYGNvbW1hbmRgLCBvciBhbiBgaHR0cGAgc2VydmVyIHdpdGggYSBzdHJpbmdcbiAqIGB1cmxgLlxuICovXG5mdW5jdGlvbiBpc1N1cHBvcnRlZE1jcFNlcnZlckNvbmZpZ3VyYXRpb24odmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiB7XG5cdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBjYW5kaWRhdGUgPSB2YWx1ZSBhcyB7IHR5cGU/OiB1bmtub3duOyBjb21tYW5kPzogdW5rbm93bjsgdXJsPzogdW5rbm93biB9O1xuXHRpZiAoY2FuZGlkYXRlLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRyZXR1cm4gdHlwZW9mIGNhbmRpZGF0ZS5jb21tYW5kID09PSAnc3RyaW5nJztcblx0fVxuXHRpZiAoY2FuZGlkYXRlLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuUkVNT1RFKSB7XG5cdFx0cmV0dXJuIHR5cGVvZiBjYW5kaWRhdGUudXJsID09PSAnc3RyaW5nJztcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHRvU2RrTWNwU2VydmVyKF9uYW1lOiBzdHJpbmcsIGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiBNQ1BTZXJ2ZXJDb25maWcge1xuXHRpZiAoY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2xvY2FsJyxcblx0XHRcdGNvbW1hbmQ6IGNvbmZpZy5jb21tYW5kLFxuXHRcdFx0YXJnczogY29uZmlnLmFyZ3MgPyBbLi4uY29uZmlnLmFyZ3NdIDogW10sXG5cdFx0XHR0b29sczogWycqJ10sXG5cdFx0XHQuLi4oY29uZmlnLmVudiAmJiB7IGVudjogdG9TdHJpbmdFbnYoY29uZmlnLmVudikgfSksXG5cdFx0XHQuLi4oY29uZmlnLmN3ZCAmJiB7IGN3ZDogY29uZmlnLmN3ZCB9KSxcblx0XHR9O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0dHlwZTogJ2h0dHAnLFxuXHRcdHVybDogY29uZmlnLnVybCxcblx0XHR0b29sczogWycqJ10sXG5cdFx0Li4uKGNvbmZpZy5oZWFkZXJzICYmIHsgaGVhZGVyczogeyAuLi5jb25maWcuaGVhZGVycyB9IH0pLFxuXHR9O1xufVxuXG4vKipcbiAqIEVuc3VyZXMgYWxsIGVudiB2YWx1ZXMgYXJlIHN0cmluZ3MgKHRoZSBTREsgcmVxdWlyZXMgYFJlY29yZDxzdHJpbmcsIHN0cmluZz5gKS5cbiAqL1xuZnVuY3Rpb24gdG9TdHJpbmdFbnYoZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCBudWxsPik6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZW52KSkge1xuXHRcdGlmICh2YWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0cmVzdWx0W2tleV0gPSBTdHJpbmcodmFsdWUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEN1c3RvbSBhZ2VudHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIENvbnZlcnRzIHBhcnNlZCBwbHVnaW4gYWdlbnRzIGludG8gdGhlIFNESydzIGBjdXN0b21BZ2VudHNgIGNvbmZpZy5cbiAqXG4gKiBFYWNoIGFnZW50IGZpbGUgaXMgcmVhZCBhbmQgKHdoZW4gcHJlc2VudCkgaXRzIFlBTUwgZnJvbnRtYXR0ZXIgaXMgcGFyc2VkOlxuICogIC0gYG5hbWVgIGZhbGxzIGJhY2sgdG8gdGhlIGFnZW50J3MgcmVzb3VyY2UgbmFtZSAoZmlsZW5hbWUgc3RlbSkuXG4gKiAgLSBgZGVzY3JpcHRpb25gIGlzIGZvcndhcmRlZCB2ZXJiYXRpbS5cbiAqICAtIGB0b29sc2AgaXMgZm9yd2FyZGVkIGFzIHRoZSBTREsncyBhbGxvdy1saXN0OyBhbiBlbXB0eSAvIG1pc3NpbmcgYXJyYXlcbiAqICAgIGJlY29tZXMgYG51bGxgIHNvIHRoZSBTREsgZ3JhbnRzIHRoZSBhZ2VudCBhY2Nlc3MgdG8gYWxsIHRvb2xzLlxuICogIC0gYHByb21wdGAgaXMgdGhlIG1hcmtkb3duIGJvZHkgdGhhdCBmb2xsb3dzIHRoZSBmcm9udG1hdHRlciAob3IgdGhlXG4gKiAgICBmdWxsIGZpbGUgY29udGVudCB3aGVuIHRoZXJlIGlzIG5vIGZyb250bWF0dGVyKS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRvU2RrQ3VzdG9tQWdlbnRzKGFnZW50czogcmVhZG9ubHkgSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8Q3VzdG9tQWdlbnRDb25maWdbXT4ge1xuXHRjb25zdCBjb25maWdzOiBDdXN0b21BZ2VudENvbmZpZ1tdID0gW107XG5cdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShhZ2VudC51cmkpO1xuXHRcdFx0Y29uc3QgcmF3ID0gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgbWQgPSBwYXJzZUZyb250TWF0dGVyKHJhdyk7XG5cdFx0XHRpZiAoIW1kKSB7XG5cdFx0XHRcdGNvbmZpZ3MucHVzaCh7XG5cdFx0XHRcdFx0bmFtZTogYWdlbnQubmFtZSxcblx0XHRcdFx0XHRwcm9tcHQ6IHJhdyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBNYXRjaCBgcGFyc2VBZ2VudEZpbGVgJ3MgbmFtZSBkZXJpdmF0aW9uICh0cmltICsgZmFsc3kgZmFsbGJhY2spIHNvXG5cdFx0XHRcdC8vIHRoZSBTREsgY29uZmlnIG5hbWUgZXF1YWxzIHRoZSBgcmVzb2x2ZWRBZ2VudE5hbWVgIHJlc29sdmVkIGZyb20gdGhlXG5cdFx0XHRcdC8vIHBhcnNlZCBwbHVnaW4gYWdlbnQ7IG90aGVyd2lzZSBhIHdoaXRlc3BhY2UtcGFkZGVkIGZyb250bWF0dGVyIGBuYW1lYFxuXHRcdFx0XHQvLyB3b3VsZCBtYWtlIHRoZSBTREsgcmVqZWN0IHRoZSBzZXNzaW9uLXN0YXJ0IGBhZ2VudDpgIGFzIG5vdCBmb3VuZC5cblx0XHRcdFx0Y29uc3QgbmFtZSA9IG1kLmdldFN0cmluZ1ZhbHVlKCduYW1lJyk/LnRyaW0oKSB8fCBhZ2VudC5uYW1lO1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IG1kLmdldFN0cmluZ1ZhbHVlKCdkZXNjcmlwdGlvbicpO1xuXHRcdFx0XHRjb25zdCB0b29scyA9IG1kLmdldFN0cmluZ0FycmF5VmFsdWUoJ3Rvb2xzJyk7XG5cdFx0XHRcdGNvbnN0IHNraWxscyA9IG1kLmdldFN0cmluZ0FycmF5VmFsdWUoJ3NraWxscycpO1xuXHRcdFx0XHRsZXQgaW5mZXIgPSBtZC5nZXRCb29sZWFuVmFsdWUoJ2luZmVyJyk7XG5cdFx0XHRcdGNvbnN0IGRpc2FibGVNb2RlbEludm9jYXRpb24gPSBtZC5nZXRCb29sZWFuVmFsdWUoJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbicpO1xuXHRcdFx0XHRpZiAoaW5mZXIgPT09IHVuZGVmaW5lZCAmJiBkaXNhYmxlTW9kZWxJbnZvY2F0aW9uID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0aW5mZXIgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwcm9tcHQgPSBtZC5ib2R5ID8/IHJhdztcblx0XHRcdFx0bGV0IG1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBtZC5nZXRTdHJpbmdWYWx1ZSgnbW9kZWwnKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IG1vZGVscyA9IG1kLmdldFN0cmluZ0FycmF5VmFsdWUoJ21vZGVsJykgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIW1vZGVsICYmIG1vZGVscyAmJiBBcnJheS5pc0FycmF5KG1vZGVscykgJiYgbW9kZWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRtb2RlbCA9IG1vZGVsc1swXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25maWdzLnB1c2goe1xuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0Li4uKGRlc2NyaXB0aW9uID8geyBkZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihtb2RlbCA/IHsgbW9kZWwgfSA6IHt9KSxcblx0XHRcdFx0XHR0b29sczogdG9vbHMgJiYgdG9vbHMubGVuZ3RoID4gMCA/IHRvb2xzIDogbnVsbCxcblx0XHRcdFx0XHQuLi4oc2tpbGxzICE9PSB1bmRlZmluZWQgPyB7IHNraWxscyB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihpbmZlciAhPT0gdW5kZWZpbmVkID8geyBpbmZlciB9IDoge30pLFxuXHRcdFx0XHRcdHByb21wdCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBTa2lwIGFnZW50cyB3aG9zZSBmaWxlIGNhbm5vdCBiZSByZWFkXG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb25maWdzO1xufVxuXG4vKiogQSBwbHVnaW4ncyBhZ2VudHMgdG9nZXRoZXIgd2l0aCBpdHMgb24tZGlzayBsb2NhdGlvbiAoaWYgYW55KS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBsdWdpbkFnZW50c0ZvclNkayB7XG5cdHJlYWRvbmx5IHBsdWdpbkRpcj86IFVSSTtcblx0cmVhZG9ubHkgYWdlbnRzOiByZWFkb25seSBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdO1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgU0RLJ3MgYGN1c3RvbUFnZW50c2AgY29uZmlnIGZvciBhIHNlc3Npb24uXG4gKlxuICogQWdlbnRzIGNvbnRyaWJ1dGVkIGJ5IHBsdWdpbnMgbWF0ZXJpYWxpemVkIGludG8gYW4gb24tZGlzayAoZmlsZS1zY2hlbWUpXG4gKiBkaXJlY3RvcnkgYXJlIG5vcm1hbGx5IGxlZnQgb3V0IG9mIGBjdXN0b21BZ2VudHNgIGFuZCBkaXNjb3ZlcmVkIGJ5IHRoZSBTREtcbiAqIHRocm91Z2ggYHBsdWdpbkRpcmVjdG9yaWVzYCBpbnN0ZWFkLCB0byBhdm9pZCBkdXBsaWNhdGVzLiBIb3dldmVyLCB0aGUgU0RLXG4gKiB2YWxpZGF0ZXMgdGhlIHNlc3Npb24tc3RhcnQgYGFnZW50OmAgb3B0aW9uIGFnYWluc3QgYGN1c3RvbUFnZW50c2AgKmJ5IG5hbWVcbiAqIG9ubHkqIFx1MjAxNCBpdCBkb2VzIE5PVCBjb25zdWx0IGBwbHVnaW5EaXJlY3Rvcmllc2AuIFNvIGEgc2VsZWN0ZWQgcGx1Z2luIG9yXG4gKiBleHRlbnNpb24gYWdlbnQgKGUuZy4gb25lIGNob3NlbiBpbiB0aGUgYWdlbnQgcGlja2VyKSB3b3VsZCBvdGhlcndpc2UgZmFpbFxuICogd2l0aCBcIkN1c3RvbSBhZ2VudCAnPG5hbWU+JyBub3QgZm91bmRcIi4gVGhpcyBmb3JjZXMgdGhlIHJlc29sdmVkIHNlbGVjdGlvblxuICogaW50byBgY3VzdG9tQWdlbnRzYCBzbyBpdCBjYW4gYmUgYWN0aXZhdGVkLCB3aGlsZSBldmVyeSBvdGhlciBmaWxlLWRpciBhZ2VudFxuICogY29udGludWVzIHRvIGxvYWQgdmlhIGBwbHVnaW5EaXJlY3Rvcmllc2AuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0b1Nka1Nlc3Npb25DdXN0b21BZ2VudHMoXG5cdHBsdWdpbnM6IHJlYWRvbmx5IElQbHVnaW5BZ2VudHNGb3JTZGtbXSxcblx0cmVzb2x2ZWRBZ2VudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcbik6IFByb21pc2U8Q3VzdG9tQWdlbnRDb25maWdbXT4ge1xuXHRjb25zdCBwbHVnaW5zV2l0aG91dERpcnMgPSBwbHVnaW5zLmZpbHRlcihwID0+ICFwLnBsdWdpbkRpciB8fCBwLnBsdWdpbkRpci5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSk7XG5cdGNvbnN0IGN1c3RvbUFnZW50cyA9IGF3YWl0IHRvU2RrQ3VzdG9tQWdlbnRzKHBsdWdpbnNXaXRob3V0RGlycy5mbGF0TWFwKHAgPT4gcC5hZ2VudHMpLCBmaWxlU2VydmljZSk7XG5cdGlmIChyZXNvbHZlZEFnZW50TmFtZSAmJiAhY3VzdG9tQWdlbnRzLnNvbWUoYWdlbnQgPT4gYWdlbnQubmFtZSA9PT0gcmVzb2x2ZWRBZ2VudE5hbWUpKSB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRBZ2VudHMgPSBwbHVnaW5zLmZsYXRNYXAocCA9PiBwLmFnZW50cykuZmlsdGVyKGFnZW50ID0+IGFnZW50Lm5hbWUgPT09IHJlc29sdmVkQWdlbnROYW1lKTtcblx0XHRmb3IgKGNvbnN0IGNvbmZpZyBvZiBhd2FpdCB0b1Nka0N1c3RvbUFnZW50cyhzZWxlY3RlZEFnZW50cywgZmlsZVNlcnZpY2UpKSB7XG5cdFx0XHRpZiAoIWN1c3RvbUFnZW50cy5zb21lKGFnZW50ID0+IGFnZW50Lm5hbWUgPT09IGNvbmZpZy5uYW1lKSkge1xuXHRcdFx0XHRjdXN0b21BZ2VudHMucHVzaChjb25maWcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gY3VzdG9tQWdlbnRzO1xufVxuXG4vKipcbiAqIFByb2plY3RzIHBhcnNlZCBwbHVnaW4gYWdlbnRzIGludG8gdGhlaXIgcHJvdG9jb2wtbGV2ZWxcbiAqIHtAbGluayBBZ2VudEN1c3RvbWl6YXRpb259IHNoYXBlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9BZ2VudEN1c3RvbWl6YXRpb25zKGFnZW50czogcmVhZG9ubHkgSVBhcnNlZEFnZW50W10pOiBBZ2VudEN1c3RvbWl6YXRpb25bXSB7XG5cdHJldHVybiBhZ2VudHMubWFwKGEgPT4gYS5jdXN0b21pemF0aW9uKTtcbn1cblxuLyoqXG4gKiBDb2xsZWN0cyBldmVyeSBjaGlsZCBjdXN0b21pemF0aW9uIChhZ2VudCwgc2tpbGwsIHJ1bGUsIGhvb2ssIE1DUFxuICogc2VydmVyKSBwcm9kdWNlZCBieSBhIHBhcnNlZCBwbHVnaW4sIGRlZHVwZWQgYnkgaWQuIFRoaXMgaXMgdGhlIHNpbmdsZVxuICogc291cmNlIG9mIHRydXRoIGZvciBwb3B1bGF0aW5nIGEgY29udGFpbmVyIGN1c3RvbWl6YXRpb24ncyBgY2hpbGRyZW5gXG4gKiBhcnJheSBcdTIwMTQgZXZlcnkgcHJvamVjdG9yIHRoYXQgcHJvZHVjZWQgYW4gU0RLIGNvbmZpZyBhYm92ZSBkZXJpdmVzIGl0c1xuICogbWF0Y2hpbmcgcHJvdG9jb2wgY2hpbGQgZnJvbSB0aGUgc2FtZSBwYXJzZWQgcHJpbWl0aXZlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9DaGlsZEN1c3RvbWl6YXRpb25zKHBsdWdpbnM6IHJlYWRvbmx5IElQYXJzZWRQbHVnaW5bXSk6IENoaWxkQ3VzdG9taXphdGlvbltdIHtcblx0Y29uc3QgYnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBDaGlsZEN1c3RvbWl6YXRpb24+KCk7XG5cdGNvbnN0IGFkZCA9IChjOiBDaGlsZEN1c3RvbWl6YXRpb24pID0+IHtcblx0XHRpZiAoIWJ5SWQuaGFzKGMuaWQpKSB7XG5cdFx0XHRieUlkLnNldChjLmlkLCBjKTtcblx0XHR9XG5cdH07XG5cdGZvciAoY29uc3QgcGx1Z2luIG9mIHBsdWdpbnMpIHtcblx0XHRmb3IgKGNvbnN0IGEgb2YgcGx1Z2luLmFnZW50cykgeyBhZGQoYS5jdXN0b21pemF0aW9uKTsgfVxuXHRcdGZvciAoY29uc3QgcyBvZiBwbHVnaW4uc2tpbGxzKSB7IGFkZChzLmN1c3RvbWl6YXRpb24pOyB9XG5cdFx0Zm9yIChjb25zdCByIG9mIHBsdWdpbi5pbnN0cnVjdGlvbnMpIHsgYWRkKHIuY3VzdG9taXphdGlvbik7IH1cblx0XHRmb3IgKGNvbnN0IGggb2YgcGx1Z2luLmhvb2tzKSB7IGFkZChoLmN1c3RvbWl6YXRpb24pOyB9XG5cdFx0Zm9yIChjb25zdCBtIG9mIHBsdWdpbi5tY3BTZXJ2ZXJzKSB7IGFkZChtLmN1c3RvbWl6YXRpb24pOyB9XG5cdH1cblx0cmV0dXJuIFsuLi5ieUlkLnZhbHVlcygpXTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTa2lsbCBkaXJlY3Rvcmllc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQ29udmVydHMgcGFyc2VkIHBsdWdpbiBza2lsbHMgaW50byB0aGUgU0RLJ3MgYHNraWxsRGlyZWN0b3JpZXNgIGNvbmZpZy5cbiAqIFRoZSBTREsgZXhwZWN0cyBkaXJlY3RvcnkgcGF0aHM7IHdlIGV4dHJhY3QgdGhlIHBhcmVudCBkaXJlY3Rvcnkgb2YgZWFjaCBTS0lMTC5tZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvU2RrU2tpbGxEaXJlY3Rvcmllcyhza2lsbHM6IHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10pOiBzdHJpbmdbXSB7XG5cdHJldHVybiB0b1Nka1Jlc291cmNlRGlyZWN0b3JpZXMoc2tpbGxzKTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBwYXJzZWQgcGx1Z2luIGluc3RydWN0aW9ucyBpbnRvIHRoZSBTREsnc1xuICogYGluc3RydWN0aW9uRGlyZWN0b3JpZXNgIGNvbmZpZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvU2RrSW5zdHJ1Y3Rpb25EaXJlY3RvcmllcyhpbnN0cnVjdGlvbnM6IHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10pOiBzdHJpbmdbXSB7XG5cdHJldHVybiB0b1Nka1Jlc291cmNlRGlyZWN0b3JpZXMoaW5zdHJ1Y3Rpb25zKTtcbn1cblxuZnVuY3Rpb24gdG9TZGtSZXNvdXJjZURpcmVjdG9yaWVzKHJlc291cmNlczogcmVhZG9ubHkgSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0Y29uc3QgZGlyID0gZGlybmFtZShyZXNvdXJjZS51cmkuZnNQYXRoKTtcblx0XHRpZiAoIXNlZW4uaGFzKGRpcikpIHtcblx0XHRcdHNlZW4uYWRkKGRpcik7XG5cdFx0XHRyZXN1bHQucHVzaChkaXIpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEhvb2tzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgZWZmZWN0aXZlIGNvbW1hbmQgZm9yIHRoZSBjdXJyZW50IHBsYXRmb3JtIGZyb20gYSBwYXJzZWQgaG9vayBjb21tYW5kLlxuICovXG5mdW5jdGlvbiByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rOiBJUGFyc2VkSG9va0NvbW1hbmQsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzICYmIGhvb2sud2luZG93cykge1xuXHRcdHJldHVybiBob29rLndpbmRvd3M7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggJiYgaG9vay5vc3gpIHtcblx0XHRyZXR1cm4gaG9vay5vc3g7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCAmJiBob29rLmxpbnV4KSB7XG5cdFx0cmV0dXJuIGhvb2subGludXg7XG5cdH1cblx0cmV0dXJuIGhvb2suY29tbWFuZDtcbn1cblxuLyoqXG4gKiBFeGVjdXRlcyBhIGhvb2sgY29tbWFuZCBhcyBhIHNoZWxsIHByb2Nlc3MuIFJldHVybnMgdGhlIHN0ZG91dCBvbiBzdWNjZXNzLFxuICogb3IgdGhyb3dzIG9uIG5vbi16ZXJvIGV4aXQgY29kZSBvciB0aW1lb3V0LlxuICovXG5mdW5jdGlvbiBleGVjdXRlSG9va0NvbW1hbmQoaG9vazogSVBhcnNlZEhvb2tDb21tYW5kLCBzdGRpbj86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IGNvbW1hbmQgPSByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPUyk7XG5cdGlmICghY29tbWFuZCkge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoJycpO1xuXHR9XG5cblx0Y29uc3QgdGltZW91dCA9IChob29rLnRpbWVvdXQgPz8gMzApICogMTAwMDtcblx0Y29uc3QgY3dkID0gaG9vay5jd2Q/LmZzUGF0aDtcblxuXHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgaXNXaW5kb3dzID0gT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzO1xuXHRcdGNvbnN0IHNoZWxsID0gaXNXaW5kb3dzID8gJ2NtZC5leGUnIDogJy9iaW4vc2gnO1xuXHRcdGNvbnN0IHNoZWxsQXJncyA9IGlzV2luZG93cyA/IFsnL2MnLCBjb21tYW5kXSA6IFsnLWMnLCBjb21tYW5kXTtcblxuXHRcdGNvbnN0IGNoaWxkID0gc3Bhd24oc2hlbGwsIHNoZWxsQXJncywge1xuXHRcdFx0Y3dkLFxuXHRcdFx0ZW52OiB7IC4uLnByb2Nlc3MuZW52LCAuLi5ob29rLmVudiB9LFxuXHRcdFx0c3RkaW86IFsncGlwZScsICdwaXBlJywgJ3BpcGUnXSxcblx0XHRcdHRpbWVvdXQsXG5cdFx0fSk7XG5cblx0XHRsZXQgc3Rkb3V0ID0gJyc7XG5cdFx0bGV0IHN0ZGVyciA9ICcnO1xuXG5cdFx0Y2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4geyBzdGRvdXQgKz0gZGF0YS50b1N0cmluZygpOyB9KTtcblx0XHRjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7IHN0ZGVyciArPSBkYXRhLnRvU3RyaW5nKCk7IH0pO1xuXG5cdFx0aWYgKHN0ZGluKSB7XG5cdFx0XHRjaGlsZC5zdGRpbi53cml0ZShzdGRpbik7XG5cdFx0XHRjaGlsZC5zdGRpbi5lbmQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hpbGQuc3RkaW4uZW5kKCk7XG5cdFx0fVxuXG5cdFx0Y2hpbGQub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRjaGlsZC5vbignY2xvc2UnLCAoY29kZSkgPT4ge1xuXHRcdFx0aWYgKGNvZGUgPT09IDApIHtcblx0XHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgSG9vayBjb21tYW5kIGV4aXRlZCB3aXRoIGNvZGUgJHtjb2RlfTogJHtzdGRlcnIgfHwgc3Rkb3V0fWApKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59XG5cbi8qKlxuICogUnVucyBhIGxpc3Qgb2YgaG9vayBjb21tYW5kcyBzZXF1ZW50aWFsbHksIHBhc3NpbmcgYGlucHV0YCBhcyBKU09OIHN0ZGluLlxuICogUmV0dXJucyB0aGUgcGFyc2VkIG91dHB1dCBvZiB0aGUgZmlyc3QgY29tbWFuZCB0aGF0IGVtaXRzIGEgdmFsaWQgSlNPTiBvYmplY3QsXG4gKiBvciBgdW5kZWZpbmVkYCBpZiBubyBjb21tYW5kIHByb2R1Y2VzIHBhcnNlYWJsZSBKU09OIG91dHB1dC5cbiAqIENvbW1hbmQgZmFpbHVyZXMgYXJlIHN3YWxsb3dlZCBcdTIwMTQgaG9va3MgYXJlIG5vbi1mYXRhbC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcnVuSG9va0NvbW1hbmRzKGNvbW1hbmRzOiByZWFkb25seSBJUGFyc2VkSG9va0NvbW1hbmRbXSB8IHVuZGVmaW5lZCwgaW5wdXQ6IHVua25vd24pOiBQcm9taXNlPG9iamVjdCB8IHVuZGVmaW5lZD4ge1xuXHRpZiAoIWNvbW1hbmRzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdGRpbiA9IEpTT04uc3RyaW5naWZ5KGlucHV0KTtcblx0Zm9yIChjb25zdCBjbWQgb2YgY29tbWFuZHMpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZXhlY3V0ZUhvb2tDb21tYW5kKGNtZCwgc3RkaW4pO1xuXHRcdFx0aWYgKG91dHB1dC50cmltKCkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG91dHB1dCk7XG5cdFx0XHRcdFx0aWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIE5vbi1KU09OIG91dHB1dCBpcyBmaW5lIFx1MjAxNCBubyBtb2RpZmljYXRpb25cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSG9vayBmYWlsdXJlcyBhcmUgbm9uLWZhdGFsXG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogTWFwcGluZyBmcm9tIGNhbm9uaWNhbCBob29rIHR5cGUgaWRlbnRpZmllcnMgdG8gU0RLIFNlc3Npb25Ib29rcyBoYW5kbGVyIGtleXMuXG4gKi9cbmNvbnN0IEhPT0tfVFlQRV9UT19TREtfS0VZOiBSZWNvcmQ8c3RyaW5nLCBrZXlvZiBTZXNzaW9uSG9va3M+ID0ge1xuXHQnUHJlVG9vbFVzZSc6ICdvblByZVRvb2xVc2UnLFxuXHQnUG9zdFRvb2xVc2UnOiAnb25Qb3N0VG9vbFVzZScsXG5cdCdVc2VyUHJvbXB0U3VibWl0JzogJ29uVXNlclByb21wdFN1Ym1pdHRlZCcsXG5cdCdTZXNzaW9uU3RhcnQnOiAnb25TZXNzaW9uU3RhcnQnLFxuXHQnU2Vzc2lvbkVuZCc6ICdvblNlc3Npb25FbmQnLFxuXHQnRXJyb3JPY2N1cnJlZCc6ICdvbkVycm9yT2NjdXJyZWQnLFxufTtcblxuLyoqXG4gKiBDb252ZXJ0cyBwYXJzZWQgcGx1Z2luIGhvb2tzIGludG8gU0RLIHtAbGluayBTZXNzaW9uSG9va3N9IGhhbmRsZXIgZnVuY3Rpb25zLlxuICpcbiAqIEVhY2ggaGFuZGxlciBleGVjdXRlcyB0aGUgaG9vaydzIHNoZWxsIGNvbW1hbmRzIHNlcXVlbnRpYWxseSB3aGVuIGludm9rZWQuXG4gKiBIb29rIHR5cGVzIHRoYXQgZG9uJ3QgbWFwIHRvIFNESyBoYW5kbGVyIGtleXMgYXJlIHNpbGVudGx5IGlnbm9yZWQuXG4gKlxuICogVGhlIG9wdGlvbmFsIGBlZGl0VHJhY2tpbmdIb29rc2AgcGFyYW1ldGVyIHByb3ZpZGVzIGludGVybmFsIGVkaXQtdHJhY2tpbmdcbiAqIGNhbGxiYWNrcyBmcm9tIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufSB0aGF0IGFyZSBtZXJnZWQgd2l0aCBwbHVnaW4gaG9va3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1Nka0hvb2tzKFxuXHRob29rR3JvdXBzOiByZWFkb25seSBJUGFyc2VkSG9va0dyb3VwW10sXG5cdGVkaXRUcmFja2luZ0hvb2tzPzoge1xuXHRcdHJlYWRvbmx5IG9uUHJlVG9vbFVzZTogKGlucHV0OiBQcmVUb29sVXNlSG9va0lucHV0KSA9PiBQcm9taXNlPHZvaWQ+O1xuXHRcdHJlYWRvbmx5IG9uUG9zdFRvb2xVc2U6IChpbnB1dDogUG9zdFRvb2xVc2VIb29rSW5wdXQpID0+IFByb21pc2U8dm9pZD47XG5cdH0sXG4pOiBTZXNzaW9uSG9va3Mge1xuXHQvLyBHcm91cCBhbGwgY29tbWFuZHMgYnkgU0RLIGhhbmRsZXIga2V5XG5cdGNvbnN0IGNvbW1hbmRzQnlLZXkgPSBuZXcgTWFwPGtleW9mIFNlc3Npb25Ib29rcywgSVBhcnNlZEhvb2tDb21tYW5kW10+KCk7XG5cdGZvciAoY29uc3QgZ3JvdXAgb2YgaG9va0dyb3Vwcykge1xuXHRcdGNvbnN0IHNka0tleSA9IEhPT0tfVFlQRV9UT19TREtfS0VZW2dyb3VwLnR5cGVdO1xuXHRcdGlmICghc2RrS2V5KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBjb21tYW5kc0J5S2V5LmdldChzZGtLZXkpID8/IFtdO1xuXHRcdGV4aXN0aW5nLnB1c2goLi4uZ3JvdXAuY29tbWFuZHMpO1xuXHRcdGNvbW1hbmRzQnlLZXkuc2V0KHNka0tleSwgZXhpc3RpbmcpO1xuXHR9XG5cblx0Y29uc3QgaG9va3M6IFNlc3Npb25Ib29rcyA9IHt9O1xuXG5cdC8vIFByZS10b29sLXVzZSBoYW5kbGVyXG5cdGNvbnN0IHByZVRvb2xDb21tYW5kcyA9IGNvbW1hbmRzQnlLZXkuZ2V0KCdvblByZVRvb2xVc2UnKTtcblx0aWYgKHByZVRvb2xDb21tYW5kcz8ubGVuZ3RoIHx8IGVkaXRUcmFja2luZ0hvb2tzKSB7XG5cdFx0aG9va3Mub25QcmVUb29sVXNlID0gYXN5bmMgKGlucHV0OiBQcmVUb29sVXNlSG9va0lucHV0KSA9PiB7XG5cdFx0XHRhd2FpdCBlZGl0VHJhY2tpbmdIb29rcz8ub25QcmVUb29sVXNlKGlucHV0KTtcblx0XHRcdHJldHVybiBydW5Ib29rQ29tbWFuZHMocHJlVG9vbENvbW1hbmRzLCBpbnB1dCk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIFBvc3QtdG9vbC11c2UgaGFuZGxlclxuXHRjb25zdCBwb3N0VG9vbENvbW1hbmRzID0gY29tbWFuZHNCeUtleS5nZXQoJ29uUG9zdFRvb2xVc2UnKTtcblx0aWYgKHBvc3RUb29sQ29tbWFuZHM/Lmxlbmd0aCB8fCBlZGl0VHJhY2tpbmdIb29rcykge1xuXHRcdGhvb2tzLm9uUG9zdFRvb2xVc2UgPSBhc3luYyAoaW5wdXQ6IFBvc3RUb29sVXNlSG9va0lucHV0KSA9PiB7XG5cdFx0XHRhd2FpdCBlZGl0VHJhY2tpbmdIb29rcz8ub25Qb3N0VG9vbFVzZShpbnB1dCk7XG5cdFx0XHRyZXR1cm4gcnVuSG9va0NvbW1hbmRzKHBvc3RUb29sQ29tbWFuZHMsIGlucHV0KTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gVXNlci1wcm9tcHQtc3VibWl0dGVkIGhhbmRsZXJcblx0Y29uc3QgcHJvbXB0Q29tbWFuZHMgPSBjb21tYW5kc0J5S2V5LmdldCgnb25Vc2VyUHJvbXB0U3VibWl0dGVkJyk7XG5cdGlmIChwcm9tcHRDb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0aG9va3Mub25Vc2VyUHJvbXB0U3VibWl0dGVkID0gYXN5bmMgKGlucHV0OiBVc2VyUHJvbXB0U3VibWl0dGVkSG9va0lucHV0KSA9PiB7XG5cdFx0XHRjb25zdCBzdGRpbiA9IEpTT04uc3RyaW5naWZ5KGlucHV0KTtcblx0XHRcdGZvciAoY29uc3QgY21kIG9mIHByb21wdENvbW1hbmRzKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgZXhlY3V0ZUhvb2tDb21tYW5kKGNtZCwgc3RkaW4pO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBIb29rIGZhaWx1cmVzIGFyZSBub24tZmF0YWxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBTZXNzaW9uLXN0YXJ0IGhhbmRsZXJcblx0Y29uc3Qgc3RhcnRDb21tYW5kcyA9IGNvbW1hbmRzQnlLZXkuZ2V0KCdvblNlc3Npb25TdGFydCcpO1xuXHRpZiAoc3RhcnRDb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0aG9va3Mub25TZXNzaW9uU3RhcnQgPSBhc3luYyAoaW5wdXQ6IFNlc3Npb25TdGFydEhvb2tJbnB1dCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RkaW4gPSBKU09OLnN0cmluZ2lmeShpbnB1dCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNtZCBvZiBzdGFydENvbW1hbmRzKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgZXhlY3V0ZUhvb2tDb21tYW5kKGNtZCwgc3RkaW4pO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBIb29rIGZhaWx1cmVzIGFyZSBub24tZmF0YWxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBTZXNzaW9uLWVuZCBoYW5kbGVyXG5cdGNvbnN0IGVuZENvbW1hbmRzID0gY29tbWFuZHNCeUtleS5nZXQoJ29uU2Vzc2lvbkVuZCcpO1xuXHRpZiAoZW5kQ29tbWFuZHM/Lmxlbmd0aCkge1xuXHRcdGhvb2tzLm9uU2Vzc2lvbkVuZCA9IGFzeW5jIChpbnB1dDogU2Vzc2lvbkVuZEhvb2tJbnB1dCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RkaW4gPSBKU09OLnN0cmluZ2lmeShpbnB1dCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNtZCBvZiBlbmRDb21tYW5kcykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGV4ZWN1dGVIb29rQ29tbWFuZChjbWQsIHN0ZGluKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gSG9vayBmYWlsdXJlcyBhcmUgbm9uLWZhdGFsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Ly8gRXJyb3Itb2NjdXJyZWQgaGFuZGxlclxuXHRjb25zdCBlcnJvckNvbW1hbmRzID0gY29tbWFuZHNCeUtleS5nZXQoJ29uRXJyb3JPY2N1cnJlZCcpO1xuXHRpZiAoZXJyb3JDb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0aG9va3Mub25FcnJvck9jY3VycmVkID0gYXN5bmMgKGlucHV0OiBFcnJvck9jY3VycmVkSG9va0lucHV0KSA9PiB7XG5cdFx0XHRjb25zdCBzdGRpbiA9IEpTT04uc3RyaW5naWZ5KGlucHV0KTtcblx0XHRcdGZvciAoY29uc3QgY21kIG9mIGVycm9yQ29tbWFuZHMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBleGVjdXRlSG9va0NvbW1hbmQoY21kLCBzdGRpbik7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIEhvb2sgZmFpbHVyZXMgYXJlIG5vbi1mYXRhbFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHJldHVybiBob29rcztcbn1cblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciB0d28gc2V0cyBvZiBwYXJzZWQgcGx1Z2lucyBwcm9kdWNlIGVxdWl2YWxlbnQgU0RLIGNvbmZpZy5cbiAqIFVzZWQgdG8gZGV0ZXJtaW5lIGlmIGEgc2Vzc2lvbiBuZWVkcyB0byBiZSByZWZyZXNoZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZWRQbHVnaW5zRXF1YWwoYTogcmVhZG9ubHkgSVBhcnNlZFBsdWdpbltdLCBiOiByZWFkb25seSBJUGFyc2VkUGx1Z2luW10pOiBib29sZWFuIHtcblx0Ly8gU2ltcGxlIHN0cnVjdHVyYWwgY29tcGFyaXNvbiB2aWEgSlNPTiBzZXJpYWxpemF0aW9uLlxuXHQvLyBXZSBzZXJpYWxpemUgb25seSB0aGUgZXNzZW50aWFsIGZpZWxkcywgcmVwbGFjaW5nIFVSSXMgd2l0aCBzdHJpbmdzLlxuXHRjb25zdCBzZXJpYWxpemUgPSAocGx1Z2luczogcmVhZG9ubHkgSVBhcnNlZFBsdWdpbltdKSA9PiB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHBsdWdpbnMubWFwKHAgPT4gKHtcblx0XHRcdGZvcm1hdDogcC5mb3JtYXQsXG5cdFx0XHRob29rczogcC5ob29rcy5tYXAoaCA9PiAoeyB0eXBlOiBoLnR5cGUsIGNvbW1hbmRzOiBoLmNvbW1hbmRzLm1hcChjID0+ICh7IGNvbW1hbmQ6IGMuY29tbWFuZCwgd2luZG93czogYy53aW5kb3dzLCBsaW51eDogYy5saW51eCwgb3N4OiBjLm9zeCwgY3dkOiBjLmN3ZD8udG9TdHJpbmcoKSwgZW52OiBjLmVudiwgdGltZW91dDogYy50aW1lb3V0IH0pKSB9KSksXG5cdFx0XHRtY3BTZXJ2ZXJzOiBwLm1jcFNlcnZlcnMubWFwKG0gPT4gKHsgbmFtZTogbS5uYW1lLCBjb25maWd1cmF0aW9uOiBtLmNvbmZpZ3VyYXRpb24gfSkpLFxuXHRcdFx0c2tpbGxzOiBwLnNraWxscy5tYXAocyA9PiAoeyB1cmk6IHMudXJpLnRvU3RyaW5nKCksIG5hbWU6IHMubmFtZSB9KSksXG5cdFx0XHRhZ2VudHM6IHAuYWdlbnRzLm1hcChhID0+ICh7IHVyaTogYS51cmkudG9TdHJpbmcoKSwgbmFtZTogYS5uYW1lIH0pKSxcblx0XHRcdGluc3RydWN0aW9uczogcC5pbnN0cnVjdGlvbnMubWFwKGkgPT4gKHsgdXJpOiBpLnVyaS50b1N0cmluZygpLCBuYW1lOiBpLm5hbWUgfSkpLFxuXHRcdH0pKSk7XG5cdH07XG5cdHJldHVybiBzZXJpYWxpemUoYSkgPT09IHNlcmlhbGl6ZShiKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsYUFBYTtBQUV0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUIsVUFBVTtBQUVwQyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLHFCQUFtRDtBQUc1RCxTQUFTLGVBQWU7QUFpQmpCLFNBQVMsZ0JBQWdCLE1BQXdFO0FBQ3ZHLFFBQU0sU0FBMEMsQ0FBQztBQUNqRCxhQUFXLE9BQU8sTUFBTTtBQUN2QixXQUFPLElBQUksSUFBSSxJQUFJLGVBQWUsSUFBSSxNQUFNLElBQUksYUFBYTtBQUFBLEVBQzlEO0FBQ0EsU0FBTztBQUNSO0FBWU8sU0FBUyw2QkFBNkIsU0FBbUU7QUFDL0csUUFBTSxTQUEwQyxDQUFDO0FBQ2pELGFBQVcsQ0FBQyxNQUFNLE1BQU0sS0FBSyxPQUFPLFFBQVEsT0FBTyxHQUFHO0FBQ3JELFFBQUksa0NBQWtDLE1BQU0sR0FBRztBQUM5QyxhQUFPLElB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
