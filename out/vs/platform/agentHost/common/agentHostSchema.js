import { localize } from "../../../nls.js";
import { structuralEquals } from "../../../base/common/equals.js";
import { ConfigurationTarget } from "../../configuration/common/configuration.js";
import { TelemetryConfiguration, TelemetryLevel } from "../../telemetry/common/telemetry.js";
import { SessionConfigKey } from "./sessionConfigKeys.js";
import { JsonRpcErrorCodes, ProtocolError } from "./state/sessionProtocol.js";
function schemaProperty(protocol) {
  const assertFn = buildAssert(protocol);
  const assertValid = (value, path = "") => assertFn(value, path);
  const validate = (value) => {
    try {
      assertFn(value, "");
      return true;
    } catch {
      return false;
    }
  };
  return { protocol, validate, assertValid };
}
function createSchema(definition) {
  return {
    definition,
    toProtocol() {
      const properties = {};
      for (const key of Object.keys(definition)) {
        properties[key] = definition[key].protocol;
      }
      return { type: "object", properties };
    },
    values(values) {
      const raw = values;
      for (const key of Object.keys(definition)) {
        const value = raw[key];
        if (value === void 0) {
          continue;
        }
        const prop = definition[key];
        prop.assertValid(value, key);
      }
      return { ...raw };
    },
    validate(key, value) {
      const prop = definition[key];
      return prop ? prop.validate(value) : false;
    },
    assertValid(key, value) {
      const prop = definition[key];
      if (!prop) {
        throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unknown schema key '${key}'`);
      }
      const narrowed = prop;
      narrowed.assertValid(value, key);
    },
    validateOrDefault(values, defaults) {
      const result = {};
      const raw = values ?? {};
      for (const key of Object.keys(definition)) {
        const prop = definition[key];
        const candidate = raw[key];
        if (candidate !== void 0 && prop.validate(candidate)) {
          result[key] = candidate;
        } else if (Object.prototype.hasOwnProperty.call(defaults, key)) {
          result[key] = defaults[key];
        }
      }
      return result;
    }
  };
}
function buildAssert(schema) {
  if (schema.type === "object" && schema.properties) {
    const propAsserts = {};
    for (const key of Object.keys(schema.properties)) {
      propAsserts[key] = buildAssert(schema.properties[key]);
    }
    const required = new Set(schema.required ?? []);
    return (value, path) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw invalidParams(path, "object", value);
      }
      const obj = value;
      for (const key of Object.keys(propAsserts)) {
        const childPath = joinPath(path, key);
        if (obj[key] === void 0) {
          if (required.has(key)) {
            throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Missing required property at '${childPath}'`);
          }
          continue;
        }
        propAsserts[key](obj[key], childPath);
      }
    };
  }
  if (schema.type === "array" && schema.items) {
    const itemAssert = buildAssert(schema.items);
    return (value, path) => {
      if (!Array.isArray(value)) {
        throw invalidParams(path, "array", value);
      }
      for (let i = 0; i < value.length; i++) {
        itemAssert(value[i], `${path}[${i}]`);
      }
    };
  }
  return buildPrimitiveAssert(schema);
}
function buildPrimitiveAssert(schema) {
  const enumDynamic = schema.enumDynamic === true;
  return (value, path) => {
    switch (schema.type) {
      case "string":
        if (typeof value !== "string") {
          throw invalidParams(path, "string", value);
        }
        break;
      case "number":
        if (typeof value !== "number") {
          throw invalidParams(path, "number", value);
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          throw invalidParams(path, "boolean", value);
        }
        break;
      case "array":
        if (!Array.isArray(value)) {
          throw invalidParams(path, "array", value);
        }
        break;
      case "object":
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          throw invalidParams(path, "object", value);
        }
        break;
    }
    if (schema.enum && !enumDynamic && !schema.enum.includes(value)) {
      throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Invalid value at '${path || "<root>"}': ${safeStringify(value)} is not one of [${schema.enum.map((v) => JSON.stringify(v)).join(", ")}]`);
    }
  };
}
function invalidParams(path, expected, value) {
  return new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Invalid value at '${path || "<root>"}': expected ${expected}, got ${safeStringify(value)}`);
}
function joinPath(parent, key) {
  return parent ? `${parent}.${key}` : key;
}
function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
const permissionsProperty = schemaProperty({
  type: "object",
  title: localize("agentHost.sessionConfig.permissions", "Permissions"),
  description: localize("agentHost.sessionConfig.permissionsDescription", 'Per-tool session permissions. Updated automatically when approving a tool "in this Session".'),
  properties: {
    allow: {
      type: "array",
      title: localize("agentHost.sessionConfig.permissions.allow", "Allowed tools"),
      items: {
        type: "string",
        title: localize("agentHost.sessionConfig.permissions.toolName", "Tool name")
      }
    },
    deny: {
      type: "array",
      title: localize("agentHost.sessionConfig.permissions.deny", "Denied tools"),
      items: {
        type: "string",
        title: localize("agentHost.sessionConfig.permissions.toolName", "Tool name")
      }
    }
  },
  default: { allow: [], deny: [] },
  sessionMutable: true
});
const platformSessionSchema = createSchema({
  [SessionConfigKey.AutoApprove]: schemaProperty({
    type: "string",
    title: localize("agentHost.sessionConfig.autoApprove", "Approvals"),
    description: localize("agentHost.sessionConfig.autoApproveDescription", "Tool approval behavior for this session"),
    enum: ["default", "assisted", "autoApprove"],
    enumLabels: [
      localize("agentHost.sessionConfig.autoApprove.default", "Default approvals"),
      localize("agentHost.sessionConfig.autoApprove.assisted", "Assisted permissions"),
      localize("agentHost.sessionConfig.autoApprove.bypass", "Allow all")
    ],
    enumDescriptions: [
      localize("agentHost.sessionConfig.autoApprove.defaultDescription", "Asks when approval settings don't apply"),
      localize("agentHost.sessionConfig.autoApprove.assistedDescription", "Evaluates risk before running tools"),
      localize("agentHost.sessionConfig.autoApprove.bypassDescription", "Runs tool calls without asking")
    ],
    default: "default",
    sessionMutable: true
  }),
  [SessionConfigKey.Permissions]: permissionsProperty,
  [SessionConfigKey.Mode]: schemaProperty({
    type: "string",
    title: localize("agentHost.sessionConfig.mode", "Agent Mode"),
    description: localize("agentHost.sessionConfig.modeDescription", "How the agent should approach this turn"),
    enum: ["interactive", "plan", "autopilot"],
    enumLabels: [
      localize("agentHost.sessionConfig.mode.interactive", "Interactive"),
      localize("agentHost.sessionConfig.mode.plan", "Plan"),
      localize("agentHost.sessionConfig.mode.autopilot", "Autopilot")
    ],
    enumDescriptions: [
      localize("agentHost.sessionConfig.mode.interactiveDescription", "Step-by-step collaboration"),
      localize("agentHost.sessionConfig.mode.planDescription", "Plan first, execute when ready"),
      localize("agentHost.sessionConfig.mode.autopilotDescription", "Autonomously iterates from start to finish")
    ],
    default: "interactive",
    sessionMutable: true
  })
});
function migrateLegacyAutopilotConfig(config) {
  if (!config || config[SessionConfigKey.AutoApprove] !== "autopilot") {
    return config;
  }
  const migrated = { ...config };
  if (migrated[SessionConfigKey.Mode] !== "plan") {
    migrated[SessionConfigKey.Mode] = "autopilot";
  }
  migrated[SessionConfigKey.AutoApprove] = "default";
  return migrated;
}
const AgentHostTelemetryLevelConfigKey = "telemetryLevel";
const AgentHostEditTelemetryEnabledConfigKey = "editTelemetryEnabled";
const EDIT_TELEMETRY_ENABLED_SETTING_ID = "telemetry.editStats.enabled";
const AgentHostDisableRepoInfoTelemetryConfigKey = "disableRepoInfoTelemetry";
const DISABLE_REPO_INFO_TELEMETRY_SETTING_ID = "chat.advanced.debug.disableRepoInfoTelemetry";
const AgentHostSessionSyncEnabledConfigKey = "sessionSyncEnabled";
const AgentHostCodexEnabledConfigKey = "codexAgentEnabled";
const AgentHostTerminalAutoApproveEnabledConfigKey = "terminalAutoApproveEnabled";
const TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID = "chat.tools.terminal.enableAutoApprove";
const AgentHostGlobalAutoApproveEnabledConfigKey = "globalAutoApproveEnabled";
const GLOBAL_AUTO_APPROVE_SETTING_ID = "chat.tools.global.autoApprove";
const AgentHostAutoReplyEnabledConfigKey = "autoReplyEnabled";
const AgentHostAutoReplyAnswer = "The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.";
const AUTO_REPLY_SETTING_ID = "chat.autoReply";
const AgentHostPreferLongContextEnabledConfigKey = "preferLongContextEnabled";
const PREFER_LONG_CONTEXT_SETTING_ID = "github.copilot.chat.preferLongContext.enabled";
const AgentHostSystemProxyEnabledConfigKey = "systemProxyEnabled";
const AgentHostCopilotMultiRootEnabledConfigKey = "copilotMultiRootEnabled";
const AgentHostClaudeMultiRootEnabledConfigKey = "claudeMultiRootEnabled";
const AgentHostCodexMultiRootEnabledConfigKey = "codexMultiRootEnabled";
const AgentHostTerminalAutoApproveRulesConfigKey = "terminalAutoApproveRules";
const TERMINAL_AUTO_APPROVE_SETTING_ID = "chat.tools.terminal.autoApprove";
const TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID = "chat.tools.terminal.ignoreDefaultAutoApproveRules";
function getAgentHostTerminalAutoApproveRulesConfig(configurationService) {
  const config = configurationService.getValue(TERMINAL_AUTO_APPROVE_SETTING_ID);
  const configInspectValue = configurationService.inspect(TERMINAL_AUTO_APPROVE_SETTING_ID);
  const ignoreDefaults = configurationService.getValue(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID) === true;
  return normalizeAgentHostTerminalAutoApproveRulesConfig(config, configInspectValue, ignoreDefaults);
}
function normalizeAgentHostTerminalAutoApproveRulesConfig(config, configInspectValue, ignoreDefaults) {
  if (!config) {
    return {};
  }
  const rules = {};
  for (const [key, value] of Object.entries(config)) {
    if (ignoreDefaults && isDefaultOnlyAutoApproveRule(key, value, configInspectValue)) {
      continue;
    }
    rules[key] = value;
  }
  return rules;
}
function isDefaultOnlyAutoApproveRule(key, value, configInspectValue) {
  const defaultValue = configInspectValue.default?.value;
  const isDefaultRule = hasMatchingRule(defaultValue, key, value);
  if (!isDefaultRule) {
    return false;
  }
  const sourceTarget = getAutoApproveRuleSourceTarget(key, value, configInspectValue);
  return sourceTarget === ConfigurationTarget.DEFAULT;
}
function getAutoApproveRuleSourceTarget(key, value, configInspectValue) {
  if (hasMatchingRule(configInspectValue.workspaceFolderValue, key, value)) {
    return ConfigurationTarget.WORKSPACE_FOLDER;
  }
  if (hasMatchingRule(configInspectValue.workspaceValue, key, value)) {
    return ConfigurationTarget.WORKSPACE;
  }
  if (hasMatchingRule(configInspectValue.userRemoteValue, key, value)) {
    return ConfigurationTarget.USER_REMOTE;
  }
  if (hasMatchingRule(configInspectValue.userLocalValue, key, value)) {
    return ConfigurationTarget.USER_LOCAL;
  }
  if (hasMatchingRule(configInspectValue.userValue, key, value)) {
    return ConfigurationTarget.USER;
  }
  if (hasMatchingRule(configInspectValue.applicationValue, key, value)) {
    return ConfigurationTarget.APPLICATION;
  }
  return ConfigurationTarget.DEFAULT;
}
function hasMatchingRule(config, key, value) {
  return !!config && Object.prototype.hasOwnProperty.call(config, key) && structuralEquals(config[key], value);
}
const AgentHostMcpServersConfigKey = "mcpServers";
const SESSION_SYNC_ENABLED_SETTING_ID = "chat.sessionSync.enabled";
function telemetryLevelToAgentHostConfigValue(telemetryLevel) {
  switch (telemetryLevel) {
    case TelemetryLevel.NONE:
      return TelemetryConfiguration.OFF;
    case TelemetryLevel.CRASH:
      return TelemetryConfiguration.CRASH;
    case TelemetryLevel.ERROR:
      return TelemetryConfiguration.ERROR;
    case TelemetryLevel.USAGE:
      return TelemetryConfiguration.ON;
  }
}
function agentHostConfigValueToTelemetryLevel(value) {
  switch (value) {
    case TelemetryConfiguration.OFF:
      return TelemetryLevel.NONE;
    case TelemetryConfiguration.CRASH:
      return TelemetryLevel.CRASH;
    case TelemetryConfiguration.ERROR:
      return TelemetryLevel.ERROR;
    case TelemetryConfiguration.ON:
      return TelemetryLevel.USAGE;
    default:
      return void 0;
  }
}
const mcpServerConfigProperties = {
  type: {
    type: "string",
    title: localize("agentHost.config.mcpServers.type.title", "Server Type"),
    description: localize("agentHost.config.mcpServers.type.description", "The transport used to reach the server: `stdio` for a local command, `http` for a remote endpoint."),
    enum: ["stdio", "http"]
  },
  command: {
    type: "string",
    title: localize("agentHost.config.mcpServers.command.title", "Command"),
    description: localize("agentHost.config.mcpServers.command.description", "For `stdio` servers, the executable to spawn.")
  },
  args: {
    type: "array",
    title: localize("agentHost.config.mcpServers.args.title", "Arguments"),
    description: localize("agentHost.config.mcpServers.args.description", "For `stdio` servers, the arguments passed to the command."),
    items: { type: "string", title: localize("agentHost.config.mcpServers.arg.title", "Argument") }
  },
  env: {
    type: "object",
    title: localize("agentHost.config.mcpServers.env.title", "Environment"),
    description: localize("agentHost.config.mcpServers.env.description", "For `stdio` servers, environment variables set on the spawned process.")
  },
  cwd: {
    type: "string",
    title: localize("agentHost.config.mcpServers.cwd.title", "Working Directory"),
    description: localize("agentHost.config.mcpServers.cwd.description", "For `stdio` servers, the working directory the command runs in.")
  },
  url: {
    type: "string",
    title: localize("agentHost.config.mcpServers.url.title", "URL"),
    description: localize("agentHost.config.mcpServers.url.description", "For `http` servers, the endpoint URL of the MCP server.")
  },
  headers: {
    type: "object",
    title: localize("agentHost.config.mcpServers.headers.title", "Headers"),
    description: localize("agentHost.config.mcpServers.headers.description", "For `http` servers, HTTP headers sent with every request.")
  }
};
const mcpServersValueProperties = {
  "<serverName>": {
    type: "object",
    title: localize("agentHost.config.mcpServers.entry.title", "MCP Server"),
    description: localize("agentHost.config.mcpServers.entry.description", "A single MCP server entry. The property key is the server name."),
    properties: mcpServerConfigProperties
  }
};
const platformRootSchema = createSchema({
  [SessionConfigKey.Permissions]: permissionsProperty,
  [AgentHostDisableRepoInfoTelemetryConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.disableRepoInfoTelemetry.title", "Disable Repository Information Telemetry"),
    description: localize("agentHost.config.disableRepoInfoTelemetry.description", "Whether repository information telemetry is disabled for Agent Host sessions."),
    default: false
  }),
  [AgentHostTelemetryLevelConfigKey]: schemaProperty({
    type: "string",
    title: localize("agentHost.config.telemetryLevel.title", "Telemetry Level"),
    description: localize("agentHost.config.telemetryLevel.description", "Most restrictive telemetry level requested by connected clients."),
    enum: [TelemetryConfiguration.ON, TelemetryConfiguration.ERROR, TelemetryConfiguration.CRASH, TelemetryConfiguration.OFF],
    default: TelemetryConfiguration.ON
  }),
  [AgentHostEditTelemetryEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.editTelemetryEnabled.title", "Edit Telemetry"),
    description: localize("agentHost.config.editTelemetryEnabled.description", "Whether edit attribution telemetry is enabled for Agent Host sessions."),
    default: true
  }),
  [AgentHostSessionSyncEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.sessionSyncEnabled.title", "Session Sync"),
    description: localize("agentHost.config.sessionSyncEnabled.description", "Whether remote session sync is enabled for the copilot-sdk CLI."),
    default: false
  }),
  [AgentHostCodexEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.codexAgentEnabled.title", "Codex Agent"),
    description: localize("agentHost.config.codexAgentEnabled.description", "Whether the Codex provider is enabled."),
    default: false
  }),
  [AgentHostTerminalAutoApproveEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.terminalAutoApproveEnabled.title", "Terminal Auto Approve"),
    description: localize("agentHost.config.terminalAutoApproveEnabled.description", "Whether terminal auto-approve rules forwarded by the connected client are allowed to apply to agent-host shell permission requests."),
    default: true
  }),
  [AgentHostGlobalAutoApproveEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.globalAutoApproveEnabled.title", "Global Auto Approve"),
    description: localize("agentHost.config.globalAutoApproveEnabled.description", "Whether VS Code's global auto-approve setting is enabled. When `true`, every tool call is auto-approved, equivalent to a session using Allow all."),
    default: false
  }),
  [AgentHostAutoReplyEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.autoReplyEnabled.title", "Auto Reply"),
    description: localize("agentHost.config.autoReplyEnabled.description", "Whether VS Code's auto-reply setting is enabled. When `true`, `ask_user` questions are auto-answered instead of blocking on the user, mirroring autopilot mode."),
    default: false
  }),
  [AgentHostPreferLongContextEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.preferLongContextEnabled.title", "Prefer Long Context"),
    description: localize("agentHost.config.preferLongContextEnabled.description", "Whether Copilot Chat's prefer-long-context setting is enabled. When `true`, models with a free long context window only show the long context option in the picker. When `false` (default), the smaller default context option stays selectable."),
    default: false
  }),
  [AgentHostSystemProxyEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.systemProxyEnabled.title", "System Proxy Discovery"),
    description: localize("agentHost.config.systemProxyEnabled.description", "Whether Copilot sessions automatically discover and use the operating system's proxy configuration."),
    default: true
  }),
  [AgentHostCopilotMultiRootEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.copilotMultiRootEnabled.title", "Copilot Multiple Working Directories"),
    description: localize("agentHost.config.copilotMultiRootEnabled.description", "Whether the Copilot provider advertises support for multiple working directories, letting a session span every folder of a multi-root workspace."),
    default: false
  }),
  [AgentHostClaudeMultiRootEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.claudeMultiRootEnabled.title", "Claude Multiple Working Directories"),
    description: localize("agentHost.config.claudeMultiRootEnabled.description", "Whether the Claude provider advertises support for multiple working directories, letting a session span every folder of a multi-root workspace."),
    default: false
  }),
  [AgentHostCodexMultiRootEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.codexMultiRootEnabled.title", "Codex Multiple Working Directories"),
    description: localize("agentHost.config.codexMultiRootEnabled.description", "Whether the Codex provider advertises support for multiple working directories, letting a session span every folder of a multi-root workspace."),
    default: false
  }),
  [AgentHostTerminalAutoApproveRulesConfigKey]: schemaProperty({
    type: "object",
    title: localize("agentHost.config.terminalAutoApproveRules.title", "Terminal Auto Approve Rules"),
    description: localize("agentHost.config.terminalAutoApproveRules.description", "Terminal auto-approve rules forwarded by the connected client for agent-host shell permission checks."),
    default: {}
  }),
  [AgentHostMcpServersConfigKey]: schemaProperty({
    type: "object",
    title: localize("agentHost.config.mcpServers.title", "MCP Servers"),
    description: localize("agentHost.config.mcpServers.description", "Agent-host-level MCP servers exposed to every session, keyed by server name. Each value is a server configuration (see `<serverName>`)."),
    properties: mcpServersValueProperties,
    default: {}
  })
});
export {
  AUTO_REPLY_SETTING_ID,
  AgentHostAutoReplyAnswer,
  AgentHostAutoReplyEnabledConfigKey,
  AgentHostClaudeMultiRootEnabledConfigKey,
  AgentHostCodexEnabledConfigKey,
  AgentHostCodexMultiRootEnabledConfigKey,
  AgentHostCopilotMultiRootEnabledConfigKey,
  AgentHostDisableRepoInfoTelemetryConfigKey,
  AgentHostEditTelemetryEnabledConfigKey,
  AgentHostGlobalAutoApproveEnabledConfigKey,
  AgentHostMcpServersConfigKey,
  AgentHostPreferLongContextEnabledConfigKey,
  AgentHostSessionSyncEnabledConfigKey,
  AgentHostSystemProxyEnabledConfigKey,
  AgentHostTelemetryLevelConfigKey,
  AgentHostTerminalAutoApproveEnabledConfigKey,
  AgentHostTerminalAutoApproveRulesConfigKey,
  DISABLE_REPO_INFO_TELEMETRY_SETTING_ID,
  EDIT_TELEMETRY_ENABLED_SETTING_ID,
  GLOBAL_AUTO_APPROVE_SETTING_ID,
  PREFER_LONG_CONTEXT_SETTING_ID,
  SESSION_SYNC_ENABLED_SETTING_ID,
  TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID,
  TERMINAL_AUTO_APPROVE_SETTING_ID,
  TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID,
  agentHostConfigValueToTelemetryLevel,
  createSchema,
  getAgentHostTerminalAutoApproveRulesConfig,
  migrateLegacyAutopilotConfig,
  normalizeAgentHostTerminalAutoApproveRulesConfig,
  platformRootSchema,
  platformSessionSchema,
  schemaProperty,
  telemetryLevelToAgentHostConfigValue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U2NoZW1hLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgc3RydWN0dXJhbEVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2VxdWFscy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCB0eXBlIElDb25maWd1cmF0aW9uU2VydmljZSwgdHlwZSBJQ29uZmlndXJhdGlvblZhbHVlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24sIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEsIFNlc3Npb25Db25maWdTY2hlbWEgfSBmcm9tICcuL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEpzb25ScGNFcnJvckNvZGVzLCBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuXG4vLyAtLS0tIFNjaGVtYSBidWlsZGVyIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQSBzY2hlbWEgcHJvcGVydHkgd2l0aCBhIHBoYW50b20gVHlwZVNjcmlwdCB0eXBlIGFuZCBhIHByZWNvbXB1dGVkXG4gKiBydW50aW1lIHZhbGlkYXRvci5cbiAqXG4gKiBUaGUgYDxUPmAgdHlwZSBwYXJhbWV0ZXIgaXMgdGhlIGRldmVsb3BlcidzIGFzc2VydGlvbiBhYm91dCB0aGVcbiAqIHByb3BlcnR5J3MgcnVudGltZSBzaGFwZTsgdGhlIHZhbGlkYXRvciBkZXJpdmVkIGZyb20gYHByb3RvY29sYFxuICogKGB0eXBlYCwgYGVudW1gLCBgaXRlbXNgLCBgcHJvcGVydGllc2AsIGByZXF1aXJlZGApIGVuZm9yY2VzIGl0IGF0XG4gKiBydW50aW1lLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTY2hlbWFQcm9wZXJ0eTxUPiB7XG5cdHJlYWRvbmx5IHByb3RvY29sOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWE7XG5cdC8qKlxuXHQgKiBSZXR1cm5zIGB0cnVlYCBpZmYgYHZhbHVlYCBjb25mb3JtcyB0byB7QGxpbmsgcHJvdG9jb2x9LiBOYXJyb3dzXG5cdCAqIHRoZSB0eXBlIHRvIGBUYCBmb3IgY2FsbGVycy4gVGhlIGJvb2xlYW4gZm9ybSBpcyBwcmVmZXJyZWQgZm9yXG5cdCAqIGNvbnRyb2wgZmxvdzsgdXNlIHtAbGluayBhc3NlcnRWYWxpZH0gd2hlbiB5b3Ugd2FudCBhIGRlc2NyaXB0aXZlXG5cdCAqIGVycm9yIGZvciB0aGUgb2ZmZW5kaW5nIHBhdGguXG5cdCAqL1xuXHR2YWxpZGF0ZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFQ7XG5cdC8qKlxuXHQgKiBUaHJvd3MgYSB7QGxpbmsgUHJvdG9jb2xFcnJvcn0gd2l0aCBgSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtc2Bcblx0ICogZGVzY3JpYmluZyB0aGUgb2ZmZW5kaW5nIHBhdGggKGUuZy4gYCdwZXJtaXNzaW9ucy5hbGxvd1syXSdgKSB3aGVuXG5cdCAqIGB2YWx1ZWAgZG9lcyBub3QgY29uZm9ybSB0byB7QGxpbmsgcHJvdG9jb2x9LiBPdGhlcndpc2UgcmV0dXJucyBhbmRcblx0ICogbmFycm93cyB0aGUgdHlwZSB0byBgVGAuXG5cdCAqXG5cdCAqIEBwYXJhbSBwYXRoIERvdHRlZCBwYXRoIHByZWZpeCB0byBlbWJlZCBpbiBlcnJvciBtZXNzYWdlcy4gRGVmYXVsdHNcblx0ICogdG8gZW1wdHkgKHRoZSB2YWx1ZSBpdHNlbGYpLlxuXHQgKi9cblx0YXNzZXJ0VmFsaWQodmFsdWU6IHVua25vd24sIHBhdGg/OiBzdHJpbmcpOiBhc3NlcnRzIHZhbHVlIGlzIFQ7XG59XG5cbi8qKlxuICogRGVmaW5lcyBhIHN0cm9uZ2x5LXR5cGVkIHNjaGVtYSBwcm9wZXJ0eSB3aG9zZSBydW50aW1lIHZhbGlkYXRvciBpc1xuICogZGVyaXZlZCBmcm9tIHRoZSBzdXBwbGllZCBKU09OLXNjaGVtYSBkZXNjcmlwdG9yLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2NoZW1hUHJvcGVydHk8VD4ocHJvdG9jb2w6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSk6IElTY2hlbWFQcm9wZXJ0eTxUPiB7XG5cdGNvbnN0IGFzc2VydEZuID0gYnVpbGRBc3NlcnQocHJvdG9jb2wpO1xuXHRjb25zdCBhc3NlcnRWYWxpZCA9ICh2YWx1ZTogdW5rbm93biwgcGF0aDogc3RyaW5nID0gJycpOiBhc3NlcnRzIHZhbHVlIGlzIFQgPT4gYXNzZXJ0Rm4odmFsdWUsIHBhdGgpO1xuXHRjb25zdCB2YWxpZGF0ZSA9ICh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFQgPT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnRGbih2YWx1ZSwgJycpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9O1xuXHRyZXR1cm4geyBwcm90b2NvbCwgdmFsaWRhdGUsIGFzc2VydFZhbGlkIH07XG59XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5leHBvcnQgdHlwZSBTY2hlbWFEZWZpbml0aW9uID0gUmVjb3JkPHN0cmluZywgSVNjaGVtYVByb3BlcnR5PGFueT4+O1xuXG5leHBvcnQgdHlwZSBTY2hlbWFWYWx1ZTxQPiA9IFAgZXh0ZW5kcyBJU2NoZW1hUHJvcGVydHk8aW5mZXIgVD4gPyBUIDogbmV2ZXI7XG5cbmV4cG9ydCB0eXBlIFNjaGVtYVZhbHVlczxEIGV4dGVuZHMgU2NoZW1hRGVmaW5pdGlvbj4gPSB7XG5cdFtLIGluIGtleW9mIERdPzogU2NoZW1hVmFsdWU8RFtLXT47XG59O1xuXG4vKipcbiAqIEEgYnVuZGxlIG9mIG5hbWVkIHNjaGVtYSBwcm9wZXJ0aWVzIHBsdXMgaGVscGVycyBmb3Igc2VyaWFsaXppbmcgdG8gdGhlXG4gKiBwcm90b2NvbCBzaGFwZSwgdmFsaWRhdGluZyBhIHZhbHVlcyBiYWcgYXQgd3JpdGUgc2l0ZXMsIGFuZCB2YWxpZGF0aW5nXG4gKiBhIHNpbmdsZSBrZXkgYXQgcmVhZCBzaXRlcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2NoZW1hPEQgZXh0ZW5kcyBTY2hlbWFEZWZpbml0aW9uPiB7XG5cdHJlYWRvbmx5IGRlZmluaXRpb246IEQ7XG5cdC8qKiBSZXR1cm5zIHRoZSBwcm90b2NvbC1zZXJpYWxpemFibGUgc2NoZW1hIGZvciB0aGlzIGJ1bmRsZS4gKi9cblx0dG9Qcm90b2NvbCgpOiBTZXNzaW9uQ29uZmlnU2NoZW1hO1xuXHQvKipcblx0ICogVmFsaWRhdGVzIGVhY2gga25vd24ga2V5IGluIGB2YWx1ZXNgIGFnYWluc3QgaXRzIHNjaGVtYSBhbmQgcmV0dXJuc1xuXHQgKiBhIG5ldyBwbGFpbiByZWNvcmQuIFRocm93cyBhIHtAbGluayBQcm90b2NvbEVycm9yfSB3aXRoIGEgcGF0aCBsaWtlXG5cdCAqIGAncGVybWlzc2lvbnMuYWxsb3dbMl0nYCB3aGVuIGFueSBzdXBwbGllZCB2YWx1ZSBmYWlscyB2YWxpZGF0aW9uLlxuXHQgKiBVbmtub3duIGtleXMgYXJlIHBhc3NlZCB0aHJvdWdoIHVudG91Y2hlZCBmb3IgZm9yd2FyZC1jb21wYXRpYmlsaXR5LlxuXHQgKi9cblx0dmFsdWVzKHZhbHVlczogU2NoZW1hVmFsdWVzPEQ+KTogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdC8qKlxuXHQgKiBSZXR1cm5zIGB0cnVlYCBpZmYgYHZhbHVlYCB2YWxpZGF0ZXMgYWdhaW5zdCB0aGUgc2NoZW1hIGZvciBga2V5YC5cblx0ICogVW5rbm93biBrZXlzIHJldHVybiBgZmFsc2VgLlxuXHQgKi9cblx0dmFsaWRhdGU8SyBleHRlbmRzIGtleW9mIEQgJiBzdHJpbmc+KGtleTogSywgdmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBTY2hlbWFWYWx1ZTxEW0tdPjtcblx0LyoqXG5cdCAqIFRocm93cyBhIHtAbGluayBQcm90b2NvbEVycm9yfSBkZXNjcmliaW5nIHRoZSBvZmZlbmRpbmcgcGF0aCB3aGVuXG5cdCAqIGB2YWx1ZWAgZG9lcyBub3QgdmFsaWRhdGUgYWdhaW5zdCB0aGUgc2NoZW1hIGZvciBga2V5YCwgb3Igd2hlblxuXHQgKiBga2V5YCBpcyBub3QgZGVmaW5lZCBpbiB0aGUgc2NoZW1hLlxuXHQgKi9cblx0YXNzZXJ0VmFsaWQ8SyBleHRlbmRzIGtleW9mIEQgJiBzdHJpbmc+KGtleTogSywgdmFsdWU6IHVua25vd24pOiBhc3NlcnRzIHZhbHVlIGlzIFNjaGVtYVZhbHVlPERbS10+O1xuXHQvKipcblx0ICogUmV0dXJucyBhIGZ1bGx5LXR5cGVkIHZhbHVlcyBiYWcgYnkgdmFsaWRhdGluZyBlYWNoIGtleSBvZiB0aGVcblx0ICogc2NoZW1hIGFnYWluc3QgYHZhbHVlc2AgYW5kIGZhbGxpbmcgYmFjayB0byB0aGUgZGVmYXVsdCB3aGVuXG5cdCAqIHRoZSBpbmNvbWluZyB2YWx1ZSBpcyBtaXNzaW5nIG9yIGZhaWxzIHZhbGlkYXRpb24uXG5cdCAqXG5cdCAqIFNlbWFudGljczogZm9yIGV2ZXJ5IGtleSBkZWNsYXJlZCBpbiB0aGUgc2NoZW1hIGBkZWZpbml0aW9uYDpcblx0ICogLSBpZiBgdmFsdWVzW2tleV1gIHZhbGlkYXRlcywgaXQgaXMga2VwdDtcblx0ICogLSBlbHNlIGlmIGBrZXlgIGlzIHByZXNlbnQgaW4gYGRlZmF1bHRzYCwgdGhlIGRlZmF1bHQgaXMgdXNlZDtcblx0ICogLSBlbHNlIHRoZSBrZXkgaXMgb21pdHRlZCBmcm9tIHRoZSByZXN1bHQuXG5cdCAqXG5cdCAqIFRoaXMgbWVhbnMgY2FsbGVycyBNQVkgc3VwcGx5IGRlZmF1bHRzIGZvciBvbmx5IGEgc3Vic2V0IG9mIHRoZVxuXHQgKiBzY2hlbWEgXHUyMDE0IGtleXMgbm90IHByZXNlbnQgaW4gYGRlZmF1bHRzYCBhcmUgc2ltcGx5IGxlZnQgdW5zZXRcblx0ICogd2hlbiB0aGUgaW5jb21pbmcgdmFsdWUgaXMgbWlzc2luZyBvciBpbnZhbGlkLiBUaGlzIGlzIHVzZWZ1bFxuXHQgKiB3aGVuIHNvbWUgcHJvcGVydGllcyAoZS5nLiBwZXItc2Vzc2lvbiBgcGVybWlzc2lvbnNgKSBzaG91bGQgYmVcblx0ICogaW5oZXJpdGVkIGZyb20gYSBoaWdoZXIgc2NvcGUgcmF0aGVyIHRoYW4gbWF0ZXJpYWxpemVkIG9uIGV2ZXJ5XG5cdCAqIG5ldyBzZXNzaW9uLlxuXHQgKlxuXHQgKiBJbnRlbmRlZCBmb3Igc2FuaXRpemluZyB1bnRydXN0ZWQgaW5wdXQgYXQgcHJvdG9jb2wgYm91bmRhcmllc1xuXHQgKiAoZS5nLiBgcmVzb2x2ZVNlc3Npb25Db25maWdgKS4gS2V5cyB0aGF0IGZhaWwgdmFsaWRhdGlvbiBhcmVcblx0ICogc2lsZW50bHkgcmVwbGFjZWQgd2l0aCB0aGVpciBkZWZhdWx0IG9yIGRyb3BwZWQ7IHVzZVxuXHQgKiB7QGxpbmsgdmFsdWVzfSBvciB7QGxpbmsgYXNzZXJ0VmFsaWR9IHdoZW4geW91IHdhbnQgYSBkZXNjcmlwdGl2ZVxuXHQgKiB7QGxpbmsgUHJvdG9jb2xFcnJvcn0gaW5zdGVhZC5cblx0ICovXG5cdHZhbGlkYXRlT3JEZWZhdWx0PFQgZXh0ZW5kcyBQYXJ0aWFsPHsgW0sgaW4ga2V5b2YgRF06IFNjaGVtYVZhbHVlPERbS10+IH0+Pih2YWx1ZXM6IHsgW0sgaW4ga2V5b2YgVF0/OiB1bmtub3duIH0gfCB1bmRlZmluZWQsIGRlZmF1bHRzOiBUKTogVDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNjaGVtYTxEIGV4dGVuZHMgU2NoZW1hRGVmaW5pdGlvbj4oZGVmaW5pdGlvbjogRCk6IElTY2hlbWE8RD4ge1xuXHRyZXR1cm4ge1xuXHRcdGRlZmluaXRpb24sXG5cdFx0dG9Qcm90b2NvbCgpOiBTZXNzaW9uQ29uZmlnU2NoZW1hIHtcblx0XHRcdGNvbnN0IHByb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYT4gPSB7fTtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGRlZmluaXRpb24pKSB7XG5cdFx0XHRcdHByb3BlcnRpZXNba2V5XSA9IGRlZmluaXRpb25ba2V5XS5wcm90b2NvbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzIH07XG5cdFx0fSxcblx0XHR2YWx1ZXModmFsdWVzKSB7XG5cdFx0XHRjb25zdCByYXcgPSB2YWx1ZXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhkZWZpbml0aW9uKSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHJhd1trZXldO1xuXHRcdFx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIExvY2FsIHdpdGggZXhwbGljaXQgYW5ub3RhdGlvbiBzbyBUeXBlU2NyaXB0IGFjY2VwdHMgdGhlXG5cdFx0XHRcdC8vIGFzc2VydGlvbi1zaWduYXR1cmUgY2FsbCAocGVyIFRTNDEwNCkuXG5cdFx0XHRcdGNvbnN0IHByb3A6IElTY2hlbWFQcm9wZXJ0eTx1bmtub3duPiA9IGRlZmluaXRpb25ba2V5XTtcblx0XHRcdFx0cHJvcC5hc3NlcnRWYWxpZCh2YWx1ZSwga2V5KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IC4uLnJhdyB9O1xuXHRcdH0sXG5cdFx0dmFsaWRhdGU8SyBleHRlbmRzIGtleW9mIEQgJiBzdHJpbmc+KGtleTogSywgdmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBTY2hlbWFWYWx1ZTxEW0tdPiB7XG5cdFx0XHRjb25zdCBwcm9wID0gZGVmaW5pdGlvbltrZXldO1xuXHRcdFx0cmV0dXJuIHByb3AgPyBwcm9wLnZhbGlkYXRlKHZhbHVlKSA6IGZhbHNlO1xuXHRcdH0sXG5cdFx0YXNzZXJ0VmFsaWQ8SyBleHRlbmRzIGtleW9mIEQgJiBzdHJpbmc+KGtleTogSywgdmFsdWU6IHVua25vd24pOiBhc3NlcnRzIHZhbHVlIGlzIFNjaGVtYVZhbHVlPERbS10+IHtcblx0XHRcdGNvbnN0IHByb3A6IElTY2hlbWFQcm9wZXJ0eTx1bmtub3duPiB8IHVuZGVmaW5lZCA9IGRlZmluaXRpb25ba2V5XTtcblx0XHRcdGlmICghcHJvcCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zLCBgVW5rbm93biBzY2hlbWEga2V5ICcke2tleX0nYCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZS1iaW5kIHBvc3QtbmFycm93aW5nIHRvIGtlZXAgdGhlIGNhbGwgdGFyZ2V0IGV4cGxpY2l0bHkgdHlwZWRcblx0XHRcdC8vIChyZXF1aXJlZCBmb3IgYXNzZXJ0aW9uLXNpZ25hdHVyZSBjYWxscywgVFM0MTA0KS5cblx0XHRcdGNvbnN0IG5hcnJvd2VkOiBJU2NoZW1hUHJvcGVydHk8dW5rbm93bj4gPSBwcm9wO1xuXHRcdFx0bmFycm93ZWQuYXNzZXJ0VmFsaWQodmFsdWUsIGtleSk7XG5cdFx0fSxcblx0XHR2YWxpZGF0ZU9yRGVmYXVsdDxUIGV4dGVuZHMgUGFydGlhbDx7IFtLIGluIGtleW9mIERdOiBTY2hlbWFWYWx1ZTxEW0tdPiB9Pj4odmFsdWVzOiB7IFtLIGluIGtleW9mIFRdPzogdW5rbm93biB9IHwgdW5kZWZpbmVkLCBkZWZhdWx0czogVCk6IFQge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdFx0Y29uc3QgcmF3OiB7IFtLIGluIGtleW9mIFRdPzogdW5rbm93biB9ID0gdmFsdWVzID8/IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZGVmaW5pdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgcHJvcCA9IGRlZmluaXRpb25ba2V5XTtcblx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gcmF3W2tleV07XG5cdFx0XHRcdGlmIChjYW5kaWRhdGUgIT09IHVuZGVmaW5lZCAmJiBwcm9wLnZhbGlkYXRlKGNhbmRpZGF0ZSkpIHtcblx0XHRcdFx0XHRyZXN1bHRba2V5XSA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0fSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGVmYXVsdHMsIGtleSkpIHtcblx0XHRcdFx0XHRyZXN1bHRba2V5XSA9IChkZWZhdWx0cyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBlbHNlOiBrZXkgbm90IGluIGRlZmF1bHRzIGFuZCBpbmNvbWluZyB2YWx1ZSBtaXNzaW5nL2ludmFsaWRcblx0XHRcdFx0Ly8gXHUyMTkyIGxlYXZlIHVuc2V0IHNvIGhpZ2hlci1zY29wZSBkZWZhdWx0cyBjYW4gZmlsbCBpbi5cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQgYXMgVDtcblx0XHR9LFxuXHR9O1xufVxuXG4vLyAtLS0tIFZhbGlkYXRvciBkZXJpdmF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQSB2YWxpZGF0b3IgdGhhdCB0aHJvd3MgYSB7QGxpbmsgUHJvdG9jb2xFcnJvcn0gYW5ub3RhdGVkIHdpdGggdGhlXG4gKiBvZmZlbmRpbmcgcGF0aCB3aGVuIGB2YWx1ZWAgZG9lcyBub3QgY29uZm9ybSwgb3IgcmV0dXJucyBub3JtYWxseVxuICogd2hlbiBpdCBkb2VzLlxuICovXG50eXBlIEFzc2VydFZhbGlkYXRvciA9ICh2YWx1ZTogdW5rbm93biwgcGF0aDogc3RyaW5nKSA9PiB2b2lkO1xuXG5mdW5jdGlvbiBidWlsZEFzc2VydChzY2hlbWE6IFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSk6IEFzc2VydFZhbGlkYXRvciB7XG5cdGlmIChzY2hlbWEudHlwZSA9PT0gJ29iamVjdCcgJiYgc2NoZW1hLnByb3BlcnRpZXMpIHtcblx0XHRjb25zdCBwcm9wQXNzZXJ0czogUmVjb3JkPHN0cmluZywgQXNzZXJ0VmFsaWRhdG9yPiA9IHt9O1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKHNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0cHJvcEFzc2VydHNba2V5XSA9IGJ1aWxkQXNzZXJ0KHNjaGVtYS5wcm9wZXJ0aWVzW2tleV0gYXMgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVxdWlyZWQgPSBuZXcgU2V0KHNjaGVtYS5yZXF1aXJlZCA/PyBbXSk7XG5cdFx0cmV0dXJuICh2YWx1ZSwgcGF0aCkgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgdmFsdWUgPT09IG51bGwgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0dGhyb3cgaW52YWxpZFBhcmFtcyhwYXRoLCAnb2JqZWN0JywgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb2JqID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhwcm9wQXNzZXJ0cykpIHtcblx0XHRcdFx0Y29uc3QgY2hpbGRQYXRoID0gam9pblBhdGgocGF0aCwga2V5KTtcblx0XHRcdFx0aWYgKG9ialtrZXldID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRpZiAocmVxdWlyZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBNaXNzaW5nIHJlcXVpcmVkIHByb3BlcnR5IGF0ICcke2NoaWxkUGF0aH0nYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByb3BBc3NlcnRzW2tleV0ob2JqW2tleV0sIGNoaWxkUGF0aCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXHRpZiAoc2NoZW1hLnR5cGUgPT09ICdhcnJheScgJiYgc2NoZW1hLml0ZW1zKSB7XG5cdFx0Y29uc3QgaXRlbUFzc2VydCA9IGJ1aWxkQXNzZXJ0KHNjaGVtYS5pdGVtcyBhcyBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEpO1xuXHRcdHJldHVybiAodmFsdWUsIHBhdGgpID0+IHtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0dGhyb3cgaW52YWxpZFBhcmFtcyhwYXRoLCAnYXJyYXknLCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGl0ZW1Bc3NlcnQodmFsdWVbaV0sIGAke3BhdGh9WyR7aX1dYCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXHRyZXR1cm4gYnVpbGRQcmltaXRpdmVBc3NlcnQoc2NoZW1hKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRQcmltaXRpdmVBc3NlcnQoc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEpOiBBc3NlcnRWYWxpZGF0b3Ige1xuXHRjb25zdCBlbnVtRHluYW1pYyA9IHNjaGVtYS5lbnVtRHluYW1pYyA9PT0gdHJ1ZTtcblx0cmV0dXJuICh2YWx1ZSwgcGF0aCkgPT4ge1xuXHRcdHN3aXRjaCAoc2NoZW1hLnR5cGUpIHtcblx0XHRcdGNhc2UgJ3N0cmluZyc6IGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7IHRocm93IGludmFsaWRQYXJhbXMocGF0aCwgJ3N0cmluZycsIHZhbHVlKTsgfSBicmVhaztcblx0XHRcdGNhc2UgJ251bWJlcic6IGlmICh0eXBlb2YgdmFsdWUgIT09ICdudW1iZXInKSB7IHRocm93IGludmFsaWRQYXJhbXMocGF0aCwgJ251bWJlcicsIHZhbHVlKTsgfSBicmVhaztcblx0XHRcdGNhc2UgJ2Jvb2xlYW4nOiBpZiAodHlwZW9mIHZhbHVlICE9PSAnYm9vbGVhbicpIHsgdGhyb3cgaW52YWxpZFBhcmFtcyhwYXRoLCAnYm9vbGVhbicsIHZhbHVlKTsgfSBicmVhaztcblx0XHRcdGNhc2UgJ2FycmF5JzogaWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSkgeyB0aHJvdyBpbnZhbGlkUGFyYW1zKHBhdGgsICdhcnJheScsIHZhbHVlKTsgfSBicmVhaztcblx0XHRcdGNhc2UgJ29iamVjdCc6IGlmICh0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IHZhbHVlID09PSBudWxsIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7IHRocm93IGludmFsaWRQYXJhbXMocGF0aCwgJ29iamVjdCcsIHZhbHVlKTsgfSBicmVhaztcblx0XHR9XG5cdFx0aWYgKHNjaGVtYS5lbnVtICYmICFlbnVtRHluYW1pYyAmJiAhc2NoZW1hLmVudW0uaW5jbHVkZXModmFsdWUgYXMgc3RyaW5nKSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtcywgYEludmFsaWQgdmFsdWUgYXQgJyR7cGF0aCB8fCAnPHJvb3Q+J30nOiAke3NhZmVTdHJpbmdpZnkodmFsdWUpfSBpcyBub3Qgb25lIG9mIFske3NjaGVtYS5lbnVtLm1hcCh2ID0+IEpTT04uc3RyaW5naWZ5KHYpKS5qb2luKCcsICcpfV1gKTtcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIGludmFsaWRQYXJhbXMocGF0aDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IFByb3RvY29sRXJyb3Ige1xuXHRyZXR1cm4gbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtcywgYEludmFsaWQgdmFsdWUgYXQgJyR7cGF0aCB8fCAnPHJvb3Q+J30nOiBleHBlY3RlZCAke2V4cGVjdGVkfSwgZ290ICR7c2FmZVN0cmluZ2lmeSh2YWx1ZSl9YCk7XG59XG5cbmZ1bmN0aW9uIGpvaW5QYXRoKHBhcmVudDogc3RyaW5nLCBrZXk6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBwYXJlbnQgPyBgJHtwYXJlbnR9LiR7a2V5fWAgOiBrZXk7XG59XG5cbmZ1bmN0aW9uIHNhZmVTdHJpbmdpZnkodmFsdWU6IHVua25vd24pOiBzdHJpbmcge1xuXHR0cnkge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBTdHJpbmcodmFsdWUpO1xuXHR9XG59XG5cbi8vIC0tLS0gUGxhdGZvcm0tb3duZWQgc2NoZW1hIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IHR5cGUgQXV0b0FwcHJvdmVMZXZlbCA9ICdkZWZhdWx0JyB8ICdhc3Npc3RlZCcgfCAnYXV0b0FwcHJvdmUnO1xuXG5leHBvcnQgdHlwZSBTZXNzaW9uTW9kZSA9ICdpbnRlcmFjdGl2ZScgfCAncGxhbicgfCAnYXV0b3BpbG90JztcblxuZXhwb3J0IGludGVyZmFjZSBJUGVybWlzc2lvbnNWYWx1ZSB7XG5cdHJlYWRvbmx5IGFsbG93OiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgZGVueTogcmVhZG9ubHkgc3RyaW5nW107XG59XG5cbmNvbnN0IHBlcm1pc3Npb25zUHJvcGVydHkgPSBzY2hlbWFQcm9wZXJ0eTxJUGVybWlzc2lvbnNWYWx1ZT4oe1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9ucycsIFwiUGVybWlzc2lvbnNcIiksXG5cdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcucGVybWlzc2lvbnNEZXNjcmlwdGlvbicsIFwiUGVyLXRvb2wgc2Vzc2lvbiBwZXJtaXNzaW9ucy4gVXBkYXRlZCBhdXRvbWF0aWNhbGx5IHdoZW4gYXBwcm92aW5nIGEgdG9vbCBcXFwiaW4gdGhpcyBTZXNzaW9uXFxcIi5cIiksXG5cdHByb3BlcnRpZXM6IHtcblx0XHRhbGxvdzoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcucGVybWlzc2lvbnMuYWxsb3cnLCBcIkFsbG93ZWQgdG9vbHNcIiksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9ucy50b29sTmFtZScsIFwiVG9vbCBuYW1lXCIpLFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdGRlbnk6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zLmRlbnknLCBcIkRlbmllZCB0b29sc1wiKSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zLnRvb2xOYW1lJywgXCJUb29sIG5hbWVcIiksXG5cdFx0XHR9LFxuXHRcdH0sXG5cdH0sXG5cdGRlZmF1bHQ6IHsgYWxsb3c6IFtdLCBkZW55OiBbXSB9LFxuXHRzZXNzaW9uTXV0YWJsZTogdHJ1ZSxcbn0pO1xuXG4vKipcbiAqIFNlc3Npb24tY29uZmlnIHByb3BlcnRpZXMgb3duZWQgYnkgdGhlIHBsYXRmb3JtIGl0c2VsZiBcdTIwMTQgaS5lLiBjb25zdW1lZFxuICogYnkgdGhlIGFnZW50IGhvc3QgcmF0aGVyIHRoYW4gYnkgYW55IHBhcnRpY3VsYXIgYWdlbnQuXG4gKlxuICogQWdlbnRzIGV4dGVuZCB0aGlzIHNjaGVtYSBieSBzcHJlYWRpbmcgYHBsYXRmb3JtU2Vzc2lvblNjaGVtYS5kZWZpbml0aW9uYFxuICogaW50byB0aGVpciBvd24ge0BsaW5rIGNyZWF0ZVNjaGVtYX0gY2FsbCB0b2dldGhlciB3aXRoIGFueVxuICogcHJvdmlkZXItc3BlY2lmaWMgcHJvcGVydGllcy5cbiAqL1xuZXhwb3J0IGNvbnN0IHBsYXRmb3JtU2Vzc2lvblNjaGVtYSA9IGNyZWF0ZVNjaGVtYSh7XG5cdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogc2NoZW1hUHJvcGVydHk8QXV0b0FwcHJvdmVMZXZlbD4oe1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuYXV0b0FwcHJvdmUnLCBcIkFwcHJvdmFsc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmF1dG9BcHByb3ZlRGVzY3JpcHRpb24nLCBcIlRvb2wgYXBwcm92YWwgYmVoYXZpb3IgZm9yIHRoaXMgc2Vzc2lvblwiKSxcblx0XHRlbnVtOiBbJ2RlZmF1bHQnLCAnYXNzaXN0ZWQnLCAnYXV0b0FwcHJvdmUnXSxcblx0XHRlbnVtTGFiZWxzOiBbXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuYXV0b0FwcHJvdmUuZGVmYXVsdCcsIFwiRGVmYXVsdCBhcHByb3ZhbHNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuYXV0b0FwcHJvdmUuYXNzaXN0ZWQnLCBcIkFzc2lzdGVkIHBlcm1pc3Npb25zXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmF1dG9BcHByb3ZlLmJ5cGFzcycsIFwiQWxsb3cgYWxsXCIpLFxuXHRcdF0sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmF1dG9BcHByb3ZlLmRlZmF1bHREZXNjcmlwdGlvbicsIFwiQXNrcyB3aGVuIGFwcHJvdmFsIHNldHRpbmdzIGRvbid0IGFwcGx5XCIpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmF1dG9BcHByb3ZlLmFzc2lzdGVkRGVzY3JpcHRpb24nLCBcIkV2YWx1YXRlcyByaXNrIGJlZm9yZSBydW5uaW5nIHRvb2xzXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmF1dG9BcHByb3ZlLmJ5cGFzc0Rlc2NyaXB0aW9uJywgXCJSdW5zIHRvb2wgY2FsbHMgd2l0aG91dCBhc2tpbmdcIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnZGVmYXVsdCcsXG5cdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdH0pLFxuXHRbU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc106IHBlcm1pc3Npb25zUHJvcGVydHksXG5cdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiBzY2hlbWFQcm9wZXJ0eTxTZXNzaW9uTW9kZT4oe1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcubW9kZScsIFwiQWdlbnQgTW9kZVwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLm1vZGVEZXNjcmlwdGlvbicsIFwiSG93IHRoZSBhZ2VudCBzaG91bGQgYXBwcm9hY2ggdGhpcyB0dXJuXCIpLFxuXHRcdGVudW06IFsnaW50ZXJhY3RpdmUnLCAncGxhbicsICdhdXRvcGlsb3QnXSxcblx0XHRlbnVtTGFiZWxzOiBbXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcubW9kZS5pbnRlcmFjdGl2ZScsIFwiSW50ZXJhY3RpdmVcIiksXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcubW9kZS5wbGFuJywgXCJQbGFuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLm1vZGUuYXV0b3BpbG90JywgXCJBdXRvcGlsb3RcIiksXG5cdFx0XSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcubW9kZS5pbnRlcmFjdGl2ZURlc2NyaXB0aW9uJywgXCJTdGVwLWJ5LXN0ZXAgY29sbGFib3JhdGlvblwiKSxcblx0XHRcdGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5tb2RlLnBsYW5EZXNjcmlwdGlvbicsIFwiUGxhbiBmaXJzdCwgZXhlY3V0ZSB3aGVuIHJlYWR5XCIpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLm1vZGUuYXV0b3BpbG90RGVzY3JpcHRpb24nLCBcIkF1dG9ub21vdXNseSBpdGVyYXRlcyBmcm9tIHN0YXJ0IHRvIGZpbmlzaFwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdpbnRlcmFjdGl2ZScsXG5cdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdH0pLFxufSk7XG5cbi8qKlxuICogUmV3cml0ZXMgYSBsZWdhY3kgYGF1dG9BcHByb3ZlPSdhdXRvcGlsb3QnYCBjb25maWcgdmFsdWUgXHUyMDE0IHVzZWQgYmVmb3JlXG4gKiBBdXRvcGlsb3QgbW92ZWQgZnJvbSB0aGUgYGF1dG9BcHByb3ZlYCBheGlzIG9udG8gdGhlIG9ydGhvZ29uYWwgYG1vZGVgXG4gKiBheGlzIFx1MjAxNCBpbnRvIHRoZSBjdXJyZW50IHR3by1heGlzIHNoYXBlOlxuICpcbiAqICAtIGBhdXRvQXBwcm92ZT0nYXV0b3BpbG90J2AgKyBgbW9kZT0ncGxhbidgICBcdTIxOTIgYG1vZGU9J3BsYW4nYCwgYGF1dG9BcHByb3ZlPSdkZWZhdWx0J2BcbiAqICAgIChsZWdhY3kgYHBsYW5gIHRvb2sgcHJlY2VkZW5jZSBvdmVyIGF1dG9waWxvdCB3aGVuIHJlc29sdmluZyB0aGUgU0RLIG1vZGUpLlxuICogIC0gYGF1dG9BcHByb3ZlPSdhdXRvcGlsb3QnYCArIGFueSBvdGhlciBtb2RlIFx1MjE5MiBgbW9kZT0nYXV0b3BpbG90J2AsIGBhdXRvQXBwcm92ZT0nZGVmYXVsdCdgLlxuICpcbiAqIFJldHVybnMgYSBzaGFsbG93IGNvcHkgd2l0aCB0aGUgbWlncmF0aW9uIGFwcGxpZWQsIG9yIHRoZSBvcmlnaW5hbFxuICogcmVmZXJlbmNlIHVuY2hhbmdlZCB3aGVuIG5vIGxlZ2FjeSB2YWx1ZSBpcyBwcmVzZW50LiBTYWZlIHRvIGNhbGwgb25cbiAqIGB1bmRlZmluZWRgLlxuICpcbiAqIFdpdGhvdXQgdGhpcywgYSBzZXNzaW9uIHBlcnNpc3RlZCAob3IgYSBcInJlbWVtYmVyZWRcIiBwaWNrZXIgdmFsdWUgc2VlZGVkKVxuICogd2l0aCBgYXV0b0FwcHJvdmU9J2F1dG9waWxvdCdgIHdvdWxkIGZhaWwgdGhlIG5ldyBzY2hlbWEncyBlbnVtIHZhbGlkYXRpb25cbiAqIGFuZCBzaWxlbnRseSBmYWxsIGJhY2sgdG8gYGRlZmF1bHRgLCBkb3duZ3JhZGluZyB0aGUgc2Vzc2lvbiBmcm9tXG4gKiBhdXRvbm9tb3VzIEF1dG9waWxvdCB0byBtYW51YWwgcGVyLXRvb2wgY29uZmlybWF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZzxUIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ+KGNvbmZpZzogVCk6IFQge1xuXHRpZiAoIWNvbmZpZyB8fCBjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV0gIT09ICdhdXRvcGlsb3QnKSB7XG5cdFx0cmV0dXJuIGNvbmZpZztcblx0fVxuXHRjb25zdCBtaWdyYXRlZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLmNvbmZpZyB9O1xuXHRpZiAobWlncmF0ZWRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSAhPT0gJ3BsYW4nKSB7XG5cdFx0bWlncmF0ZWRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSA9ICdhdXRvcGlsb3QnIHNhdGlzZmllcyBTZXNzaW9uTW9kZTtcblx0fVxuXHRtaWdyYXRlZFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXSA9ICdkZWZhdWx0JyBzYXRpc2ZpZXMgQXV0b0FwcHJvdmVMZXZlbDtcblx0cmV0dXJuIG1pZ3JhdGVkIGFzIFQ7XG59XG5cbi8qKlxuICogUm9vdCAoYWdlbnQgaG9zdCkgY29uZmlnIHByb3BlcnRpZXMgb3duZWQgYnkgdGhlIHBsYXRmb3JtIGl0c2VsZi5cbiAqXG4gKiBSb290IGNvbmZpZyBhY3RzIGFzIHRoZSBiYXNlbGluZSB0aGF0IGFwcGxpZXMgdG8gZXZlcnkgc2Vzc2lvbjpcbiAqXG4gKiAtIHtAbGluayBTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zfSBcdTIwMTQgaG9zdC13aWRlIGFsbG93L2RlbnkgbGlzdHNcbiAqICAgdW5pb25lZCB3aXRoIGVhY2ggc2Vzc2lvbidzIG93biBwZXJtaXNzaW9ucyB3aGVuIGV2YWx1YXRpbmcgdG9vbFxuICogICBhdXRvLWFwcHJvdmFsLiBTZWUgYFNlc3Npb25QZXJtaXNzaW9uTWFuYWdlcmAgZm9yIHRoZSBldmFsdWF0aW9uXG4gKiAgIHJ1bGVzLlxuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxDb25maWdLZXkgPSAndGVsZW1ldHJ5TGV2ZWwnO1xuXG4vKiogV2hldGhlciBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gdGVsZW1ldHJ5IGlzIGVuYWJsZWQuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXkgPSAnZWRpdFRlbGVtZXRyeUVuYWJsZWQnO1xuXG4vKiogVlMgQ29kZSBzZXR0aW5nIGZvcndhcmRlZCBpbnRvIHtAbGluayBBZ2VudEhvc3RFZGl0VGVsZW1ldHJ5RW5hYmxlZENvbmZpZ0tleX0uICovXG5leHBvcnQgY29uc3QgRURJVF9URUxFTUVUUllfRU5BQkxFRF9TRVRUSU5HX0lEID0gJ3RlbGVtZXRyeS5lZGl0U3RhdHMuZW5hYmxlZCc7XG5cbi8qKiBMZWdhY3kgQ29waWxvdCBDaGF0IGRlYnVnIHN3aXRjaCB0aGF0IGRpc2FibGVzIGByZXF1ZXN0LnJlcG9JbmZvYCBjb2xsZWN0aW9uLiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdERpc2FibGVSZXBvSW5mb1RlbGVtZXRyeUNvbmZpZ0tleSA9ICdkaXNhYmxlUmVwb0luZm9UZWxlbWV0cnknO1xuXG4vKiogVlMgQ29kZSBzZXR0aW5nIGZvcndhcmRlZCBpbnRvIHtAbGluayBBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXl9LiAqL1xuZXhwb3J0IGNvbnN0IERJU0FCTEVfUkVQT19JTkZPX1RFTEVNRVRSWV9TRVRUSU5HX0lEID0gJ2NoYXQuYWR2YW5jZWQuZGVidWcuZGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5JztcblxuLyoqXG4gKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIHdoZW4gVlMgQ29kZSdzXG4gKiBgY2hhdC5zZXNzaW9uU3luYy5lbmFibGVkYCBzZXR0aW5nIGNoYW5nZXMuIENvbnRyb2xzIHRoZSBgcmVtb3RlYCBmbGFnXG4gKiBwYXNzZWQgdG8gdGhlIGNvcGlsb3Qtc2RrIGBDb3BpbG90Q2xpZW50T3B0aW9uc2AuXG4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXkgPSAnc2Vzc2lvblN5bmNFbmFibGVkJztcblxuLyoqXG4gKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIGNhcnJ5aW5nIHRoZSBleHBlcmltZW50LWF3YXJlXG4gKiB2YWx1ZSBvZiBgY2hhdC5hZ2VudEhvc3QuY29kZXhBZ2VudC5lbmFibGVkYC4gVGhlIGhvc3QgcmVnaXN0ZXJzIHRoZSBDb2RleFxuICogcHJvdmlkZXIgd2hlbiB0aGlzIGlzIGB0cnVlYDsgZGlzYWJsaW5nIHJlcXVpcmVzIGFuIGFnZW50IGhvc3QgcmVzdGFydC5cbiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdENvZGV4RW5hYmxlZENvbmZpZ0tleSA9ICdjb2RleEFnZW50RW5hYmxlZCc7XG5cbi8qKlxuICogUm9vdCBjb25maWcga2V5IGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciB3aGVuIFZTIENvZGUnc1xuICogYGNoYXQudG9vbHMudGVybWluYWwuZW5hYmxlQXV0b0FwcHJvdmVgIHNldHRpbmcgY2hhbmdlcy4gQ29udHJvbHMgd2hldGhlclxuICogYWdlbnQtaG9zdCBzaGVsbCBwZXJtaXNzaW9uIGNoZWNrcyBtYXkgYXBwbHkgdGVybWluYWwgYXV0by1hcHByb3ZlIHJ1bGVzLlxuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXkgPSAndGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWQnO1xuXG4vKipcbiAqIFRoZSBWUyBDb2RlIHNldHRpbmcgSUQgZm9yIHRlcm1pbmFsIGF1dG8gYXBwcm92ZSBlbmFibGVtZW50LiBEZWZpbmVkIGhlcmUgc29cbiAqIHJlbmRlcmVyLXNpZGUgYWdlbnQtaG9zdCBjbGllbnRzIGNhbiBmb3J3YXJkIGl0IHdpdGhvdXQgaW1wb3J0aW5nIGZyb21cbiAqIHdvcmtiZW5jaCB0ZXJtaW5hbCBjb250cmlidXRpb25zLlxuICovXG5leHBvcnQgY29uc3QgVEVSTUlOQUxfQVVUT19BUFBST1ZFX0VOQUJMRURfU0VUVElOR19JRCA9ICdjaGF0LnRvb2xzLnRlcm1pbmFsLmVuYWJsZUF1dG9BcHByb3ZlJztcblxuLyoqXG4gKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIHdoZW4gVlMgQ29kZSdzXG4gKiBgY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmVgIHNldHRpbmcgY2hhbmdlcy4gV2hlbiBgdHJ1ZWAsIHRoZSBnbG9iYWxcbiAqIGF1dG8tYXBwcm92ZSAoXCJhcHByb3ZlIGV2ZXJ5dGhpbmdcIikgc2V0dGluZyBpcyBlbmFibGVkIGFuZCB0aGUgYWdlbnQgaG9zdFxuICogdHJlYXRzIGV2ZXJ5IHRvb2wgY2FsbCBhcyBhdXRvLWFwcHJvdmVkIFx1MjAxNCBlcXVpdmFsZW50IHRvIGEgc2Vzc2lvbiBydW5uaW5nXG4gKiB3aXRoIEFsbG93IGFsbC5cbiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSA9ICdnbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWQnO1xuXG4vKipcbiAqIFRoZSBWUyBDb2RlIHNldHRpbmcgSUQgZm9yIGdsb2JhbCBhdXRvIGFwcHJvdmUuIERlZmluZWQgaGVyZSBzbyByZW5kZXJlci1zaWRlXG4gKiBhZ2VudC1ob3N0IGNsaWVudHMgY2FuIGZvcndhcmQgaXQgd2l0aG91dCBpbXBvcnRpbmcgZnJvbSBgd29ya2JlbmNoL2NvbnRyaWIvY2hhdGAuXG4gKi9cbmV4cG9ydCBjb25zdCBHTE9CQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQgPSAnY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmUnO1xuXG4vKipcbiAqIFJvb3QgY29uZmlnIGtleSBmb3J3YXJkZWQgZnJvbSB0aGUgcmVuZGVyZXIgd2hlbiBWUyBDb2RlJ3MgYGNoYXQuYXV0b1JlcGx5YFxuICogc2V0dGluZyBjaGFuZ2VzLiBXaGVuIGB0cnVlYCwgdGhlIGFnZW50IGhvc3QgYXV0by1hbnN3ZXJzIGBhc2tfdXNlcmBcbiAqIHF1ZXN0aW9ucyBpbnN0ZWFkIG9mIGJsb2NraW5nIG9uIHRoZSB1c2VyIFx1MjAxNCB0aGUgdXNlciBpcyB0cmVhdGVkIGFzXG4gKiB1bmF2YWlsYWJsZSBhbmQgdGhlIGFnZW50IGlzIHRvbGQgdG8gdXNlIGl0cyBiZXN0IGp1ZGdtZW50LCBtaXJyb3JpbmcgdGhlXG4gKiBiZWhhdmlvciBvZiBgYXV0b3BpbG90YCBtb2RlLlxuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0QXV0b1JlcGx5RW5hYmxlZENvbmZpZ0tleSA9ICdhdXRvUmVwbHlFbmFibGVkJztcblxuZXhwb3J0IGNvbnN0IEFnZW50SG9zdEF1dG9SZXBseUFuc3dlciA9ICdUaGUgdXNlciBpcyBub3QgYXZhaWxhYmxlIHRvIGFuc3dlciB5b3VyIHF1ZXN0aW9uLiBDaG9vc2UgYSBwcmFnbWF0aWMgb3B0aW9uIGJlc3QgYWxpZ25lZCB3aXRoIHRoZSBjb250ZXh0IG9mIHRoZSByZXF1ZXN0Lic7XG5cbi8qKlxuICogVGhlIFZTIENvZGUgc2V0dGluZyBJRCBmb3IgYXV0by1yZXBseS4gRGVmaW5lZCBoZXJlIHNvIHJlbmRlcmVyLXNpZGVcbiAqIGFnZW50LWhvc3QgY2xpZW50cyBjYW4gZm9yd2FyZCBpdCB3aXRob3V0IGltcG9ydGluZyBmcm9tIGB3b3JrYmVuY2gvY29udHJpYi9jaGF0YC5cbiAqL1xuZXhwb3J0IGNvbnN0IEFVVE9fUkVQTFlfU0VUVElOR19JRCA9ICdjaGF0LmF1dG9SZXBseSc7XG5cbi8vIFJvb3QgY29uZmlnIGtleSBmb3J3YXJkZWQgZnJvbSB0aGUgcmVuZGVyZXIgd2hlbiBDb3BpbG90IENoYXQncyBgZ2l0aHViLmNvcGlsb3QuY2hhdC5wcmVmZXJMb25nQ29udGV4dC5lbmFibGVkYCBzZXR0aW5nIGNoYW5nZXMuXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0UHJlZmVyTG9uZ0NvbnRleHRFbmFibGVkQ29uZmlnS2V5ID0gJ3ByZWZlckxvbmdDb250ZXh0RW5hYmxlZCc7XG5cbi8vIFRoZSBDb3BpbG90IENoYXQgc2V0dGluZyBJRCBmb3IgcHJlZmVycmluZyBsb25nIGNvbnRleHQsIGZvcndhcmRlZCBpbnRvIHRoZSBhZ2VudCBob3N0IHJvb3QgY29uZmlnLlxuZXhwb3J0IGNvbnN0IFBSRUZFUl9MT05HX0NPTlRFWFRfU0VUVElOR19JRCA9ICdnaXRodWIuY29waWxvdC5jaGF0LnByZWZlckxvbmdDb250ZXh0LmVuYWJsZWQnO1xuXG4vKiogUm9vdCBjb25maWcga2V5IGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciBmb3IgYXV0b21hdGljIE9TIHN5c3RlbSBwcm94eSBkaXNjb3ZlcnkuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5ID0gJ3N5c3RlbVByb3h5RW5hYmxlZCc7XG5cbi8qKlxuICogUm9vdCBjb25maWcga2V5IGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciB0aGF0IGdhdGVzIG11bHRpcGxlLXdvcmtpbmctZGlyZWN0b3J5XG4gKiBzdXBwb3J0IGZvciB0aGUgQ29waWxvdCBwcm92aWRlci4gV2hlbiBgdHJ1ZWAsIHRoZSBDb3BpbG90IHByb3ZpZGVyIGFkdmVydGlzZXNcbiAqIHRoZSBgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXNgIGNhcGFiaWxpdHkuIE1pcnJvcnMgdGhlIGhpZGRlblxuICogYGNoYXQuYWdlbnRIb3N0LmNvcGlsb3RBZ2VudC5tdWx0aVJvb3RFbmFibGVkYCBWUyBDb2RlIHNldHRpbmcuXG4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSA9ICdjb3BpbG90TXVsdGlSb290RW5hYmxlZCc7XG5cbi8qKlxuICogUm9vdCBjb25maWcga2V5IGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciB0aGF0IGdhdGVzIG11bHRpcGxlLXdvcmtpbmctZGlyZWN0b3J5XG4gKiBzdXBwb3J0IGZvciB0aGUgQ2xhdWRlIHByb3ZpZGVyLiBXaGVuIGB0cnVlYCwgdGhlIENsYXVkZSBwcm92aWRlciBhZHZlcnRpc2VzXG4gKiB0aGUgYG11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzYCBjYXBhYmlsaXR5LiBNaXJyb3JzIHRoZSBoaWRkZW5cbiAqIGBjaGF0LmFnZW50SG9zdC5jbGF1ZGVBZ2VudC5tdWx0aVJvb3RFbmFibGVkYCBWUyBDb2RlIHNldHRpbmcuXG4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5ID0gJ2NsYXVkZU11bHRpUm9vdEVuYWJsZWQnO1xuXG4vKiogUm9vdCBjb25maWcga2V5IGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciB0aGF0IGdhdGVzIENvZGV4IG11bHRpcGxlLXdvcmtpbmctZGlyZWN0b3J5IHN1cHBvcnQuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5ID0gJ2NvZGV4TXVsdGlSb290RW5hYmxlZCc7XG5cbi8qKlxuICogUm9vdCBjb25maWcga2V5IGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciB3aGVuIFZTIENvZGUnc1xuICogYGNoYXQudG9vbHMudGVybWluYWwuYXV0b0FwcHJvdmVgIHNldHRpbmcgY2hhbmdlcy4gSG9sZHMgdGhlIGVmZmVjdGl2ZVxuICogdGVybWluYWwgYXV0by1hcHByb3ZlIHJ1bGUgb2JqZWN0IGZvciBhZ2VudC1ob3N0IHNoZWxsIHBlcm1pc3Npb24gY2hlY2tzLlxuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5ID0gJ3Rlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlIHtcblx0cmVhZG9ubHkgYXBwcm92ZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCB0eXBlIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlVmFsdWUgPSBib29sZWFuIHwgbnVsbCB8IElBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZTtcbmV4cG9ydCB0eXBlIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyA9IFJlY29yZDxzdHJpbmcsIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlVmFsdWU+O1xuXG4vKipcbiAqIFRoZSBWUyBDb2RlIHNldHRpbmcgSURzIGZvciB0ZXJtaW5hbCBhdXRvIGFwcHJvdmUgcnVsZXMuIERlZmluZWQgaGVyZSBzb1xuICogcmVuZGVyZXItc2lkZSBhZ2VudC1ob3N0IGNsaWVudHMgY2FuIGZvcndhcmQgdGhlbSB3aXRob3V0IGltcG9ydGluZyBmcm9tXG4gKiB3b3JrYmVuY2ggdGVybWluYWwgY29udHJpYnV0aW9ucy5cbiAqL1xuZXhwb3J0IGNvbnN0IFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEID0gJ2NoYXQudG9vbHMudGVybWluYWwuYXV0b0FwcHJvdmUnO1xuZXhwb3J0IGNvbnN0IFRFUk1JTkFMX0lHTk9SRV9ERUZBVUxUX0FVVE9fQVBQUk9WRV9SVUxFU19TRVRUSU5HX0lEID0gJ2NoYXQudG9vbHMudGVybWluYWwuaWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMge1xuXHRjb25zdCBjb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgfCB1bmRlZmluZWQ+KFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEKTtcblx0Y29uc3QgY29uZmlnSW5zcGVjdFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxSZWFkb25seTxBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXM+PihURVJNSU5BTF9BVVRPX0FQUFJPVkVfU0VUVElOR19JRCk7XG5cdGNvbnN0IGlnbm9yZURlZmF1bHRzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oVEVSTUlOQUxfSUdOT1JFX0RFRkFVTFRfQVVUT19BUFBST1ZFX1JVTEVTX1NFVFRJTkdfSUQpID09PSB0cnVlO1xuXHRyZXR1cm4gbm9ybWFsaXplQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnKGNvbmZpZywgY29uZmlnSW5zcGVjdFZhbHVlLCBpZ25vcmVEZWZhdWx0cyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWcoY29uZmlnOiBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgfCB1bmRlZmluZWQsIGNvbmZpZ0luc3BlY3RWYWx1ZTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxSZWFkb25seTxBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXM+PiwgaWdub3JlRGVmYXVsdHM6IGJvb2xlYW4pOiBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMge1xuXHRpZiAoIWNvbmZpZykge1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdGNvbnN0IHJ1bGVzOiBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMgPSB7fTtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnKSkge1xuXHRcdGlmIChpZ25vcmVEZWZhdWx0cyAmJiBpc0RlZmF1bHRPbmx5QXV0b0FwcHJvdmVSdWxlKGtleSwgdmFsdWUsIGNvbmZpZ0luc3BlY3RWYWx1ZSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRydWxlc1trZXldID0gdmFsdWU7XG5cdH1cblx0cmV0dXJuIHJ1bGVzO1xufVxuXG5mdW5jdGlvbiBpc0RlZmF1bHRPbmx5QXV0b0FwcHJvdmVSdWxlKGtleTogc3RyaW5nLCB2YWx1ZTogQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVWYWx1ZSwgY29uZmlnSW5zcGVjdFZhbHVlOiBJQ29uZmlndXJhdGlvblZhbHVlPFJlYWRvbmx5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4+KTogYm9vbGVhbiB7XG5cdGNvbnN0IGRlZmF1bHRWYWx1ZSA9IGNvbmZpZ0luc3BlY3RWYWx1ZS5kZWZhdWx0Py52YWx1ZTtcblx0Y29uc3QgaXNEZWZhdWx0UnVsZSA9IGhhc01hdGNoaW5nUnVsZShkZWZhdWx0VmFsdWUsIGtleSwgdmFsdWUpO1xuXHRpZiAoIWlzRGVmYXVsdFJ1bGUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdCBzb3VyY2VUYXJnZXQgPSBnZXRBdXRvQXBwcm92ZVJ1bGVTb3VyY2VUYXJnZXQoa2V5LCB2YWx1ZSwgY29uZmlnSW5zcGVjdFZhbHVlKTtcblxuXHRyZXR1cm4gc291cmNlVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQ7XG59XG5cbmZ1bmN0aW9uIGdldEF1dG9BcHByb3ZlUnVsZVNvdXJjZVRhcmdldChrZXk6IHN0cmluZywgdmFsdWU6IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlVmFsdWUsIGNvbmZpZ0luc3BlY3RWYWx1ZTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxSZWFkb25seTxBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXM+Pik6IENvbmZpZ3VyYXRpb25UYXJnZXQge1xuXHRpZiAoaGFzTWF0Y2hpbmdSdWxlKGNvbmZpZ0luc3BlY3RWYWx1ZS53b3Jrc3BhY2VGb2xkZXJWYWx1ZSwga2V5LCB2YWx1ZSkpIHtcblx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSO1xuXHR9XG5cdGlmIChoYXNNYXRjaGluZ1J1bGUoY29uZmlnSW5zcGVjdFZhbHVlLndvcmtzcGFjZVZhbHVlLCBrZXksIHZhbHVlKSkge1xuXHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTtcblx0fVxuXHRpZiAoaGFzTWF0Y2hpbmdSdWxlKGNvbmZpZ0luc3BlY3RWYWx1ZS51c2VyUmVtb3RlVmFsdWUsIGtleSwgdmFsdWUpKSB7XG5cdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU7XG5cdH1cblx0aWYgKGhhc01hdGNoaW5nUnVsZShjb25maWdJbnNwZWN0VmFsdWUudXNlckxvY2FsVmFsdWUsIGtleSwgdmFsdWUpKSB7XG5cdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDtcblx0fVxuXHRpZiAoaGFzTWF0Y2hpbmdSdWxlKGNvbmZpZ0luc3BlY3RWYWx1ZS51c2VyVmFsdWUsIGtleSwgdmFsdWUpKSB7XG5cdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjtcblx0fVxuXHRpZiAoaGFzTWF0Y2hpbmdSdWxlKGNvbmZpZ0luc3BlY3RWYWx1ZS5hcHBsaWNhdGlvblZhbHVlLCBrZXksIHZhbHVlKSkge1xuXHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OO1xuXHR9XG5cdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQ7XG59XG5cbmZ1bmN0aW9uIGhhc01hdGNoaW5nUnVsZShjb25maWc6IFJlYWRvbmx5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4gfCB1bmRlZmluZWQsIGtleTogc3RyaW5nLCB2YWx1ZTogQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVWYWx1ZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFjb25maWcgJiYgT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGNvbmZpZywga2V5KSAmJiBzdHJ1Y3R1cmFsRXF1YWxzKGNvbmZpZ1trZXldLCB2YWx1ZSk7XG59XG5cbi8qKlxuICogUm9vdCBjb25maWcga2V5IGhvbGRpbmcgYWdlbnQtaG9zdC1sZXZlbCBNQ1Agc2VydmVyIGRlZmluaXRpb25zLlxuICpcbiAqIFRoZSB2YWx1ZSBpcyBhIG1hcCBvZiBzZXJ2ZXIgbmFtZSBcdTIxOTIge0BsaW5rIElNY3BTZXJ2ZXJDb25maWd1cmF0aW9ufVxuICogKHRoZSBzYW1lIGBzZXJ2ZXJzYCBzaGFwZSB1c2VkIGJ5IGBtY3AuanNvbmApLiBUaGVzZSBzZXJ2ZXJzIGFyZVxuICogZXhwb3NlZCB0byBldmVyeSBzZXNzaW9uIGNyZWF0ZWQgYnkgdGhlIGhvc3QsIG1lcmdlZCB3aXRoIGFueVxuICogcGx1Z2luLXByb3ZpZGVkIE1DUCBzZXJ2ZXJzIHdoZW4gbGF1bmNoaW5nIHRoZSBjb3BpbG90LXNkayBjbGllbnQuXG4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5ID0gJ21jcFNlcnZlcnMnO1xuXG4vKipcbiAqIE1hcCBvZiBzZXJ2ZXIgbmFtZSBcdTIxOTIgTUNQIHNlcnZlciBjb25maWd1cmF0aW9uLCBhcyBzdG9yZWQgaW4gdGhlXG4gKiB7QGxpbmsgQWdlbnRIb3N0TWNwU2VydmVyc0NvbmZpZ0tleX0gcm9vdCBjb25maWcgdmFsdWUuXG4gKi9cbmV4cG9ydCB0eXBlIEFnZW50SG9zdE1jcFNlcnZlcnMgPSBSZWNvcmQ8c3RyaW5nLCBJTWNwU2VydmVyQ29uZmlndXJhdGlvbj47XG5cbi8qKlxuICogVGhlIFZTIENvZGUgc2V0dGluZyBJRCBmb3Igc2Vzc2lvbiBzeW5jLiBEZWZpbmVkIGhlcmUgc28gdGhlIHBsYXRmb3JtXG4gKiBsYXllciAocmVuZGVyZXItc2lkZSBmb3J3YXJkaW5nKSBjYW4gcmVmZXJlbmNlIGl0IHdpdGhvdXQgaW1wb3J0aW5nIGZyb21cbiAqIGB3b3JrYmVuY2gvY29udHJpYi9jaGF0YC5cbiAqL1xuZXhwb3J0IGNvbnN0IFNFU1NJT05fU1lOQ19FTkFCTEVEX1NFVFRJTkdfSUQgPSAnY2hhdC5zZXNzaW9uU3luYy5lbmFibGVkJztcblxuZXhwb3J0IGZ1bmN0aW9uIHRlbGVtZXRyeUxldmVsVG9BZ2VudEhvc3RDb25maWdWYWx1ZSh0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwpOiBUZWxlbWV0cnlDb25maWd1cmF0aW9uIHtcblx0c3dpdGNoICh0ZWxlbWV0cnlMZXZlbCkge1xuXHRcdGNhc2UgVGVsZW1ldHJ5TGV2ZWwuTk9ORTpcblx0XHRcdHJldHVybiBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9GRjtcblx0XHRjYXNlIFRlbGVtZXRyeUxldmVsLkNSQVNIOlxuXHRcdFx0cmV0dXJuIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uQ1JBU0g7XG5cdFx0Y2FzZSBUZWxlbWV0cnlMZXZlbC5FUlJPUjpcblx0XHRcdHJldHVybiBUZWxlbWV0cnlDb25maWd1cmF0aW9uLkVSUk9SO1xuXHRcdGNhc2UgVGVsZW1ldHJ5TGV2ZWwuVVNBR0U6XG5cdFx0XHRyZXR1cm4gVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PTjtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYWdlbnRIb3N0Q29uZmlnVmFsdWVUb1RlbGVtZXRyeUxldmVsKHZhbHVlOiB1bmtub3duKTogVGVsZW1ldHJ5TGV2ZWwgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0Y2FzZSBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9GRjpcblx0XHRcdHJldHVybiBUZWxlbWV0cnlMZXZlbC5OT05FO1xuXHRcdGNhc2UgVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5DUkFTSDpcblx0XHRcdHJldHVybiBUZWxlbWV0cnlMZXZlbC5DUkFTSDtcblx0XHRjYXNlIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uRVJST1I6XG5cdFx0XHRyZXR1cm4gVGVsZW1ldHJ5TGV2ZWwuRVJST1I7XG5cdFx0Y2FzZSBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9OOlxuXHRcdFx0cmV0dXJuIFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogRmllbGQgZGVzY3JpcHRvcnMgZm9yIGEgc2luZ2xlIE1DUCBzZXJ2ZXIgZW50cnksIHNoYXJlZCBieSB0aGUgc3RkaW8gYW5kXG4gKiBodHRwIHNoYXBlcy4gVGhlIGFnZW50LWhvc3QgY29uZmlnIHNjaGVtYSBoYXMgbm8gYG9uZU9mYCwgc28gYm90aCB2YXJpYW50cydcbiAqIGZpZWxkcyBhcmUgZGVzY3JpYmVkIHRvZ2V0aGVyOyBgdHlwZWAgc2VsZWN0cyB3aGljaCBmaWVsZHMgYXBwbHlcbiAqIChgc3RkaW9gIHVzZXMgYGNvbW1hbmRgL2BhcmdzYC9gZW52YC9gY3dkYCwgYGh0dHBgIHVzZXMgYHVybGAvYGhlYWRlcnNgKS5cbiAqL1xuY29uc3QgbWNwU2VydmVyQ29uZmlnUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiA9IHtcblx0dHlwZToge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnR5cGUudGl0bGUnLCBcIlNlcnZlciBUeXBlXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnR5cGUuZGVzY3JpcHRpb24nLCBcIlRoZSB0cmFuc3BvcnQgdXNlZCB0byByZWFjaCB0aGUgc2VydmVyOiBgc3RkaW9gIGZvciBhIGxvY2FsIGNvbW1hbmQsIGBodHRwYCBmb3IgYSByZW1vdGUgZW5kcG9pbnQuXCIpLFxuXHRcdGVudW06IFsnc3RkaW8nLCAnaHR0cCddLFxuXHR9LFxuXHRjb21tYW5kOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1jcFNlcnZlcnMuY29tbWFuZC50aXRsZScsIFwiQ29tbWFuZFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcubWNwU2VydmVycy5jb21tYW5kLmRlc2NyaXB0aW9uJywgXCJGb3IgYHN0ZGlvYCBzZXJ2ZXJzLCB0aGUgZXhlY3V0YWJsZSB0byBzcGF3bi5cIiksXG5cdH0sXG5cdGFyZ3M6IHtcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmFyZ3MudGl0bGUnLCBcIkFyZ3VtZW50c1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcubWNwU2VydmVycy5hcmdzLmRlc2NyaXB0aW9uJywgXCJGb3IgYHN0ZGlvYCBzZXJ2ZXJzLCB0aGUgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZC5cIiksXG5cdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmFyZy50aXRsZScsIFwiQXJndW1lbnRcIikgfSxcblx0fSxcblx0ZW52OiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1jcFNlcnZlcnMuZW52LnRpdGxlJywgXCJFbnZpcm9ubWVudFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcubWNwU2VydmVycy5lbnYuZGVzY3JpcHRpb24nLCBcIkZvciBgc3RkaW9gIHNlcnZlcnMsIGVudmlyb25tZW50IHZhcmlhYmxlcyBzZXQgb24gdGhlIHNwYXduZWQgcHJvY2Vzcy5cIiksXG5cdH0sXG5cdGN3ZDoge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmN3ZC50aXRsZScsIFwiV29ya2luZyBEaXJlY3RvcnlcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1jcFNlcnZlcnMuY3dkLmRlc2NyaXB0aW9uJywgXCJGb3IgYHN0ZGlvYCBzZXJ2ZXJzLCB0aGUgd29ya2luZyBkaXJlY3RvcnkgdGhlIGNvbW1hbmQgcnVucyBpbi5cIiksXG5cdH0sXG5cdHVybDoge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnVybC50aXRsZScsIFwiVVJMXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnVybC5kZXNjcmlwdGlvbicsIFwiRm9yIGBodHRwYCBzZXJ2ZXJzLCB0aGUgZW5kcG9pbnQgVVJMIG9mIHRoZSBNQ1Agc2VydmVyLlwiKSxcblx0fSxcblx0aGVhZGVyczoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmhlYWRlcnMudGl0bGUnLCBcIkhlYWRlcnNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1jcFNlcnZlcnMuaGVhZGVycy5kZXNjcmlwdGlvbicsIFwiRm9yIGBodHRwYCBzZXJ2ZXJzLCBIVFRQIGhlYWRlcnMgc2VudCB3aXRoIGV2ZXJ5IHJlcXVlc3QuXCIpLFxuXHR9LFxufTtcblxuLyoqXG4gKiBEb2N1bWVudHMgdGhlIHZhbHVlIHNoYXBlIG9mIHRoZSB7QGxpbmsgQWdlbnRIb3N0TWNwU2VydmVyc0NvbmZpZ0tleX0gbWFwLlxuICpcbiAqIFRoZSBjb25maWcgdmFsdWUgaXMgYSBtYXAgb2Ygc2VydmVyIG5hbWUgXHUyMTkyIHNlcnZlciBjb25maWcuIFRoZSBzY2hlbWFcbiAqIGxhbmd1YWdlIGhhcyBubyBgYWRkaXRpb25hbFByb3BlcnRpZXNgLCBzbyB0aGUgcGVyLWVudHJ5IHNoYXBlIGlzIGF0dGFjaGVkXG4gKiB1bmRlciBhIHBsYWNlaG9sZGVyIGtleSAoYDxzZXJ2ZXJOYW1lPmApIHJhdGhlciB0aGFuIGF0IHRoZSBtYXAgbGV2ZWwgXHUyMDE0XG4gKiB0aGlzIGtlZXBzIHRoZSBmaWVsZCBkZXNjcmlwdGlvbnMgZGlzY292ZXJhYmxlIHdpdGhvdXQgdGhlIHJ1bnRpbWVcbiAqIHZhbGlkYXRvciBtaXN0YWtpbmcgYSByZWFsIHNlcnZlciBuYW1lZCBlLmcuIGBjb21tYW5kYCBmb3IgdGhlIGBjb21tYW5kYFxuICogZmllbGQuIFJlYWwgZW50cmllcyAoa2V5ZWQgYnkgYWN0dWFsIHNlcnZlciBuYW1lcykgYXJlIHBhc3NlZCB0aHJvdWdoLlxuICovXG5jb25zdCBtY3BTZXJ2ZXJzVmFsdWVQcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWE+ID0ge1xuXHQnPHNlcnZlck5hbWU+Jzoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmVudHJ5LnRpdGxlJywgXCJNQ1AgU2VydmVyXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmVudHJ5LmRlc2NyaXB0aW9uJywgXCJBIHNpbmdsZSBNQ1Agc2VydmVyIGVudHJ5LiBUaGUgcHJvcGVydHkga2V5IGlzIHRoZSBzZXJ2ZXIgbmFtZS5cIiksXG5cdFx0cHJvcGVydGllczogbWNwU2VydmVyQ29uZmlnUHJvcGVydGllcyxcblx0fSxcbn07XG5cbmV4cG9ydCBjb25zdCBwbGF0Zm9ybVJvb3RTY2hlbWEgPSBjcmVhdGVTY2hlbWEoe1xuXHRbU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc106IHBlcm1pc3Npb25zUHJvcGVydHksXG5cdFtBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5kaXNhYmxlUmVwb0luZm9UZWxlbWV0cnkudGl0bGUnLCBcIkRpc2FibGUgUmVwb3NpdG9yeSBJbmZvcm1hdGlvbiBUZWxlbWV0cnlcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmRpc2FibGVSZXBvSW5mb1RlbGVtZXRyeS5kZXNjcmlwdGlvbicsIFwiV2hldGhlciByZXBvc2l0b3J5IGluZm9ybWF0aW9uIHRlbGVtZXRyeSBpcyBkaXNhYmxlZCBmb3IgQWdlbnQgSG9zdCBzZXNzaW9ucy5cIiksXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdH0pLFxuXHRbQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxUZWxlbWV0cnlDb25maWd1cmF0aW9uPih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLnRlbGVtZXRyeUxldmVsLnRpdGxlJywgXCJUZWxlbWV0cnkgTGV2ZWxcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLnRlbGVtZXRyeUxldmVsLmRlc2NyaXB0aW9uJywgXCJNb3N0IHJlc3RyaWN0aXZlIHRlbGVtZXRyeSBsZXZlbCByZXF1ZXN0ZWQgYnkgY29ubmVjdGVkIGNsaWVudHMuXCIpLFxuXHRcdGVudW06IFtUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9OLCBUZWxlbWV0cnlDb25maWd1cmF0aW9uLkVSUk9SLCBUZWxlbWV0cnlDb25maWd1cmF0aW9uLkNSQVNILCBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9GRl0sXG5cdFx0ZGVmYXVsdDogVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PTixcblx0fSksXG5cdFtBZ2VudEhvc3RFZGl0VGVsZW1ldHJ5RW5hYmxlZENvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmVkaXRUZWxlbWV0cnlFbmFibGVkLnRpdGxlJywgXCJFZGl0IFRlbGVtZXRyeVwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuZWRpdFRlbGVtZXRyeUVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgZWRpdCBhdHRyaWJ1dGlvbiB0ZWxlbWV0cnkgaXMgZW5hYmxlZCBmb3IgQWdlbnQgSG9zdCBzZXNzaW9ucy5cIiksXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0fSksXG5cdFtBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5zZXNzaW9uU3luY0VuYWJsZWQudGl0bGUnLCBcIlNlc3Npb24gU3luY1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuc2Vzc2lvblN5bmNFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHJlbW90ZSBzZXNzaW9uIHN5bmMgaXMgZW5hYmxlZCBmb3IgdGhlIGNvcGlsb3Qtc2RrIENMSS5cIiksXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdH0pLFxuXHRbQWdlbnRIb3N0Q29kZXhFbmFibGVkQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oe1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuY29kZXhBZ2VudEVuYWJsZWQudGl0bGUnLCBcIkNvZGV4IEFnZW50XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5jb2RleEFnZW50RW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0aGUgQ29kZXggcHJvdmlkZXIgaXMgZW5hYmxlZC5cIiksXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdH0pLFxuXHRbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy50ZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZC50aXRsZScsIFwiVGVybWluYWwgQXV0byBBcHByb3ZlXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy50ZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMgZm9yd2FyZGVkIGJ5IHRoZSBjb25uZWN0ZWQgY2xpZW50IGFyZSBhbGxvd2VkIHRvIGFwcGx5IHRvIGFnZW50LWhvc3Qgc2hlbGwgcGVybWlzc2lvbiByZXF1ZXN0cy5cIiksXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0fSksXG5cdFtBZ2VudEhvc3RHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5nbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWQudGl0bGUnLCBcIkdsb2JhbCBBdXRvIEFwcHJvdmVcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciBWUyBDb2RlJ3MgZ2xvYmFsIGF1dG8tYXBwcm92ZSBzZXR0aW5nIGlzIGVuYWJsZWQuIFdoZW4gYHRydWVgLCBldmVyeSB0b29sIGNhbGwgaXMgYXV0by1hcHByb3ZlZCwgZXF1aXZhbGVudCB0byBhIHNlc3Npb24gdXNpbmcgQWxsb3cgYWxsLlwiKSxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0fSksXG5cdFtBZ2VudEhvc3RBdXRvUmVwbHlFbmFibGVkQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oe1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuYXV0b1JlcGx5RW5hYmxlZC50aXRsZScsIFwiQXV0byBSZXBseVwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuYXV0b1JlcGx5RW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciBWUyBDb2RlJ3MgYXV0by1yZXBseSBzZXR0aW5nIGlzIGVuYWJsZWQuIFdoZW4gYHRydWVgLCBgYXNrX3VzZXJgIHF1ZXN0aW9ucyBhcmUgYXV0by1hbnN3ZXJlZCBpbnN0ZWFkIG9mIGJsb2NraW5nIG9uIHRoZSB1c2VyLCBtaXJyb3JpbmcgYXV0b3BpbG90IG1vZGUuXCIpLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHR9KSxcblx0W0FnZW50SG9zdFByZWZlckxvbmdDb250ZXh0RW5hYmxlZENvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLnByZWZlckxvbmdDb250ZXh0RW5hYmxlZC50aXRsZScsIFwiUHJlZmVyIExvbmcgQ29udGV4dFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcucHJlZmVyTG9uZ0NvbnRleHRFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIENvcGlsb3QgQ2hhdCdzIHByZWZlci1sb25nLWNvbnRleHQgc2V0dGluZyBpcyBlbmFibGVkLiBXaGVuIGB0cnVlYCwgbW9kZWxzIHdpdGggYSBmcmVlIGxvbmcgY29udGV4dCB3aW5kb3cgb25seSBzaG93IHRoZSBsb25nIGNvbnRleHQgb3B0aW9uIGluIHRoZSBwaWNrZXIuIFdoZW4gYGZhbHNlYCAoZGVmYXVsdCksIHRoZSBzbWFsbGVyIGRlZmF1bHQgY29udGV4dCBvcHRpb24gc3RheXMgc2VsZWN0YWJsZS5cIiksXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdH0pLFxuXHRbQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oe1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuc3lzdGVtUHJveHlFbmFibGVkLnRpdGxlJywgXCJTeXN0ZW0gUHJveHkgRGlzY292ZXJ5XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5zeXN0ZW1Qcm94eUVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgQ29waWxvdCBzZXNzaW9ucyBhdXRvbWF0aWNhbGx5IGRpc2NvdmVyIGFuZCB1c2UgdGhlIG9wZXJhdGluZyBzeXN0ZW0ncyBwcm94eSBjb25maWd1cmF0aW9uLlwiKSxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHR9KSxcblx0W0FnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oe1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuY29waWxvdE11bHRpUm9vdEVuYWJsZWQudGl0bGUnLCBcIkNvcGlsb3QgTXVsdGlwbGUgV29ya2luZyBEaXJlY3Rvcmllc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuY29waWxvdE11bHRpUm9vdEVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdGhlIENvcGlsb3QgcHJvdmlkZXIgYWR2ZXJ0aXNlcyBzdXBwb3J0IGZvciBtdWx0aXBsZSB3b3JraW5nIGRpcmVjdG9yaWVzLCBsZXR0aW5nIGEgc2Vzc2lvbiBzcGFuIGV2ZXJ5IGZvbGRlciBvZiBhIG11bHRpLXJvb3Qgd29ya3NwYWNlLlwiKSxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0fSksXG5cdFtBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oe1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuY2xhdWRlTXVsdGlSb290RW5hYmxlZC50aXRsZScsIFwiQ2xhdWRlIE11bHRpcGxlIFdvcmtpbmcgRGlyZWN0b3JpZXNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmNsYXVkZU11bHRpUm9vdEVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdGhlIENsYXVkZSBwcm92aWRlciBhZHZlcnRpc2VzIHN1cHBvcnQgZm9yIG11bHRpcGxlIHdvcmtpbmcgZGlyZWN0b3JpZXMsIGxldHRpbmcgYSBzZXNzaW9uIHNwYW4gZXZlcnkgZm9sZGVyIG9mIGEgbXVsdGktcm9vdCB3b3Jrc3BhY2UuXCIpLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHR9KSxcblx0W0FnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmNvZGV4TXVsdGlSb290RW5hYmxlZC50aXRsZScsIFwiQ29kZXggTXVsdGlwbGUgV29ya2luZyBEaXJlY3Rvcmllc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuY29kZXhNdWx0aVJvb3RFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRoZSBDb2RleCBwcm92aWRlciBhZHZlcnRpc2VzIHN1cHBvcnQgZm9yIG11bHRpcGxlIHdvcmtpbmcgZGlyZWN0b3JpZXMsIGxldHRpbmcgYSBzZXNzaW9uIHNwYW4gZXZlcnkgZm9sZGVyIG9mIGEgbXVsdGktcm9vdCB3b3Jrc3BhY2UuXCIpLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHR9KSxcblx0W0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4oe1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy50ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMudGl0bGUnLCBcIlRlcm1pbmFsIEF1dG8gQXBwcm92ZSBSdWxlc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcudGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzLmRlc2NyaXB0aW9uJywgXCJUZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMgZm9yd2FyZGVkIGJ5IHRoZSBjb25uZWN0ZWQgY2xpZW50IGZvciBhZ2VudC1ob3N0IHNoZWxsIHBlcm1pc3Npb24gY2hlY2tzLlwiKSxcblx0XHRkZWZhdWx0OiB7fSxcblx0fSksXG5cdFtBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8QWdlbnRIb3N0TWNwU2VydmVycz4oe1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnRpdGxlJywgXCJNQ1AgU2VydmVyc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcubWNwU2VydmVycy5kZXNjcmlwdGlvbicsIFwiQWdlbnQtaG9zdC1sZXZlbCBNQ1Agc2VydmVycyBleHBvc2VkIHRvIGV2ZXJ5IHNlc3Npb24sIGtleWVkIGJ5IHNlcnZlciBuYW1lLiBFYWNoIHZhbHVlIGlzIGEgc2VydmVyIGNvbmZpZ3VyYXRpb24gKHNlZSBgPHNlcnZlck5hbWU+YCkuXCIpLFxuXHRcdHByb3BlcnRpZXM6IG1jcFNlcnZlcnNWYWx1ZVByb3BlcnRpZXMsXG5cdFx0ZGVmYXVsdDoge30sXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUFpRjtBQUUxRixTQUFTLHdCQUF3QixzQkFBc0I7QUFDdkQsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxtQkFBbUIscUJBQXFCO0FBc0MxQyxTQUFTLGVBQWtCLFVBQTJEO0FBQzVGLFFBQU0sV0FBVyxZQUFZLFFBQVE7QUFDckMsUUFBTSxjQUFjLENBQUMsT0FBZ0IsT0FBZSxPQUEyQixTQUFTLE9BQU8s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
