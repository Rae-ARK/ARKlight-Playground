import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { mcpSchemaId } from "../../../services/configuration/common/configuration.js";
import { inputsSchema } from "../../../services/configurationResolver/common/configurationResolverSchema.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
const mcpActivationEventPrefix = "onMcpCollection:";
const mcpActivationEvent = (contributedCollectionId) => mcpActivationEventPrefix + contributedCollectionId;
var DiscoverySource = /* @__PURE__ */ ((DiscoverySource2) => {
  DiscoverySource2["ClaudeDesktop"] = "claude-desktop";
  DiscoverySource2["Windsurf"] = "windsurf";
  DiscoverySource2["CursorGlobal"] = "cursor-global";
  DiscoverySource2["CursorWorkspace"] = "cursor-workspace";
  return DiscoverySource2;
})(DiscoverySource || {});
const allDiscoverySources = Object.keys({
  ["claude-desktop" /* ClaudeDesktop */]: true,
  ["windsurf" /* Windsurf */]: true,
  ["cursor-global" /* CursorGlobal */]: true,
  ["cursor-workspace" /* CursorWorkspace */]: true
});
const discoverySourceLabel = {
  ["claude-desktop" /* ClaudeDesktop */]: localize("mcp.discovery.source.claude-desktop", "Claude Desktop"),
  ["windsurf" /* Windsurf */]: localize("mcp.discovery.source.windsurf", "Windsurf"),
  ["cursor-global" /* CursorGlobal */]: localize("mcp.discovery.source.cursor-global", "Cursor (Global)"),
  ["cursor-workspace" /* CursorWorkspace */]: localize("mcp.discovery.source.cursor-workspace", "Cursor (Workspace)")
};
const discoverySourceSettingsLabel = {
  ["claude-desktop" /* ClaudeDesktop */]: localize("mcp.discovery.source.claude-desktop.config", "Claude Desktop configuration (`claude_desktop_config.json`)"),
  ["windsurf" /* Windsurf */]: localize("mcp.discovery.source.windsurf.config", "Windsurf configurations (`~/.codeium/windsurf/mcp_config.json`)"),
  ["cursor-global" /* CursorGlobal */]: localize("mcp.discovery.source.cursor-global.config", "Cursor global configuration (`~/.cursor/mcp.json`)"),
  ["cursor-workspace" /* CursorWorkspace */]: localize("mcp.discovery.source.cursor-workspace.config", "Cursor workspace configuration (`.cursor/mcp.json`)")
};
const mcpConfigurationSection = "mcp";
const mcpDiscoverySection = "chat.mcp.discovery.enabled";
const mcpServerSamplingSection = "chat.mcp.serverSampling";
const mcpServerCollisionBehaviorSection = "chat.mcp.collisionBehavior";
const mcpEnterpriseManagedAuthIdpSection = "mcp.enterpriseManagedAuth.idp";
var McpCollisionBehavior = /* @__PURE__ */ ((McpCollisionBehavior2) => {
  McpCollisionBehavior2["Disable"] = "disable";
  McpCollisionBehavior2["Suffix"] = "suffix";
  return McpCollisionBehavior2;
})(McpCollisionBehavior || {});
const mcpSchemaExampleServers = {
  "mcp-server-time": {
    command: "python",
    args: ["-m", "mcp_server_time", "--local-timezone=America/Los_Angeles"],
    env: {}
  }
};
const httpSchemaExamples = {
  "my-mcp-server": {
    url: "http://localhost:3001/mcp",
    headers: {}
  }
};
const mcpDevModeProps = (stdio) => ({
  dev: {
    type: "object",
    markdownDescription: localize("app.mcp.dev", "Enabled development mode for the server. When present, the server will be started eagerly and output will be included in its output. Properties inside the `dev` object can configure additional behavior."),
    examples: [{ watch: "src/**/*.ts", debug: { type: "node" } }],
    properties: {
      watch: {
        description: localize("app.mcp.dev.watch", "A glob pattern or list of glob patterns relative to the workspace folder to watch. The MCP server will be restarted when these files change."),
        examples: ["src/**/*.ts"],
        oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
      },
      ...stdio && {
        debug: {
          markdownDescription: localize("app.mcp.dev.debug", "If set, debugs the MCP server using the given runtime as it's started."),
          oneOf: [
            {
              type: "object",
              required: ["type"],
              properties: {
                type: {
                  type: "string",
                  enum: ["node"],
                  description: localize("app.mcp.dev.debug.type.node", "Debug the MCP server using Node.js.")
                }
              },
              additionalProperties: false
            },
            {
              type: "object",
              required: ["type"],
              properties: {
                type: {
                  type: "string",
                  enum: ["debugpy"],
                  description: localize("app.mcp.dev.debug.type.python", "Debug the MCP server using Python and debugpy.")
                },
                debugpyPath: {
                  type: "string",
                  description: localize("app.mcp.dev.debug.debugpyPath", "Path to the debugpy executable.")
                }
              },
              additionalProperties: false
            }
          ]
        }
      }
    }
  }
});
const mcpStdioServerSchema = {
  type: "object",
  additionalProperties: false,
  examples: [mcpSchemaExampleServers["mcp-server-time"]],
  properties: {
    type: {
      type: "string",
      enum: ["stdio"],
      description: localize("app.mcp.json.type", "The type of the server.")
    },
    sandboxEnabled: {
      type: "boolean",
      default: false,
      description: localize("app.mcp.json.sandboxEnabled", "Whether to run the server in a sandboxed environment.")
    },
    command: {
      type: "string",
      description: localize("app.mcp.json.command", "The command to run the server.")
    },
    cwd: {
      type: "string",
      description: localize("app.mcp.json.cwd", "The working directory for the server command. Defaults to the workspace folder when run in a workspace."),
      examples: ["${workspaceFolder}"]
    },
    args: {
      type: "array",
      description: localize("app.mcp.args.command", "Arguments passed to the server."),
      items: {
        type: "string"
      }
    },
    envFile: {
      type: "string",
      description: localize("app.mcp.envFile.command", "Path to a file containing environment variables for the server."),
      examples: ["${workspaceFolder}/.env"]
    },
    env: {
      description: localize("app.mcp.env.command", "Environment variables passed to the server."),
      additionalProperties: {
        anyOf: [
          { type: "null" },
          { type: "string" },
          { type: "number" }
        ]
      }
    },
    ...mcpDevModeProps(true)
  }
};
const mcpServerSchema = {
  id: mcpSchemaId,
  type: "object",
  title: localize("app.mcp.json.title", "Model Context Protocol Servers"),
  allowTrailingCommas: true,
  allowComments: true,
  additionalProperties: false,
  properties: {
    sandbox: {
      description: localize("app.mcp.json.sandbox", "Sandbox config that determines file system and network access. Sandboxing is enabled when sandboxEnabled property is set at the server level on Mac OS and Linux only."),
      type: "object",
      additionalProperties: false,
      properties: {
        network: {
          description: localize("app.mcp.json.sandbox.network", "Network access settings for the sandboxed server."),
          type: "object",
          additionalProperties: false,
          properties: {
            allowedDomains: {
              description: localize("app.mcp.json.sandbox.network.allowedDomains", "List of domains that the server is allowed to access. Wildcards are supported, e.g. `*.example.com`."),
              type: "array",
              items: { type: "string" },
              default: []
            },
            deniedDomains: {
              description: localize("app.mcp.json.sandbox.network.deniedDomains", "List of domains that the server is not allowed to access. e.g. `invalid.example.com`."),
              type: "array",
              items: { type: "string" },
              default: []
            }
          }
        },
        filesystem: {
          description: localize("app.mcp.json.sandbox.filesystem", "Filesystem access settings for the sandboxed server. Glob patterns are supported for Mac OS only."),
          type: "object",
          additionalProperties: false,
          properties: {
            denyRead: {
              description: localize("app.mcp.json.sandbox.filesystem.denyRead", "List of file paths that the server is not allowed to read. By default, all files are allowed to be read. e.g. `~/src/secrets`."),
              type: "array",
              items: { type: "string" },
              default: []
            },
            allowWrite: {
              description: localize("app.mcp.json.sandbox.filesystem.allowWrite", "List of file paths that the server is allowed to write to. e.g. `~/src/`."),
              type: "array",
              items: { type: "string" },
              default: []
            },
            denyWrite: {
              description: localize("app.mcp.json.sandbox.filesystem.denyWrite", "List of file paths that the server is not allowed to write to. e.g. `~/src/auth/`."),
              type: "array",
              items: { type: "string" },
              default: []
            }
          }
        }
      }
    },
    servers: {
      examples: [
        mcpSchemaExampleServers,
        httpSchemaExamples
      ],
      additionalProperties: {
        oneOf: [
          mcpStdioServerSchema,
          {
            type: "object",
            additionalProperties: false,
            required: ["url"],
            examples: [httpSchemaExamples["my-mcp-server"]],
            properties: {
              type: {
                type: "string",
                enum: ["http", "sse"],
                description: localize("app.mcp.json.type", "The type of the server.")
              },
              url: {
                type: "string",
                format: "uri",
                pattern: "^https?:\\/\\/.+",
                patternErrorMessage: localize("app.mcp.json.url.pattern", "The URL must start with 'http://' or 'https://'."),
                description: localize("app.mcp.json.url", "The URL of the Streamable HTTP or SSE endpoint.")
              },
              headers: {
                type: "object",
                description: localize("app.mcp.json.headers", "Additional headers sent to the server."),
                additionalProperties: { type: "string" }
              },
              oauth: {
                type: "object",
                description: localize("app.mcp.json.oauth", "OAuth configuration for authenticating with the server."),
                additionalProperties: false,
                minProperties: 1,
                properties: {
                  clientId: {
                    type: "string",
                    minLength: 1,
                    markdownDescription: localize("app.mcp.json.oauth.clientId", "The OAuth client ID to use when authenticating with the server. When `enterpriseManaged` is `true`, this is the **resource** authorization server's client ID (the client trusted by the protected resource), not the IdP's. To set the matching client secret, use the *Set Client Secret* code lens above this field \u2014 secrets are stored in the OS secret store, not in this file.")
                  },
                  enterpriseManaged: {
                    type: "boolean",
                    default: false,
                    markdownDescription: localize("app.mcp.json.oauth.enterpriseManaged", "(Preview) When set to `true`, this MCP server authenticates through the SSO issuer configured by `#mcp.enterpriseManagedAuth.idp#` using OAuth Identity Assertion Authorization Grant (ID-JAG). After a one-time sign-in, subsequent enterprise-managed servers connect silently. The IdP issuer and client credentials are read from the `#mcp.enterpriseManagedAuth.idp#` setting; the `clientId` on this server entry is passed to the resource authorization server.")
                  }
                }
              },
              ...mcpDevModeProps(false)
            }
          }
        ]
      }
    },
    inputs: inputsSchema.definitions.inputs
  }
};
const mcpContributionPoint = {
  extensionPoint: "mcpServerDefinitionProviders",
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      if (contrib.id) {
        yield mcpActivationEvent(contrib.id);
      }
    }
  },
  jsonSchema: {
    description: localize("vscode.extension.contributes.mcp", "Contributes Model Context Protocol servers. Users of this should also use `vscode.lm.registerMcpServerDefinitionProvider`."),
    type: "array",
    defaultSnippets: [{ body: [{ id: "", label: "" }] }],
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{ body: { id: "", label: "" } }],
      properties: {
        id: {
          description: localize("vscode.extension.contributes.mcp.id", "Unique ID for the collection."),
          type: "string"
        },
        label: {
          description: localize("vscode.extension.contributes.mcp.label", "Display name for the collection."),
          type: "string"
        },
        when: {
          description: localize("vscode.extension.contributes.mcp.when", "Condition which must be true to enable this collection."),
          type: "string"
        }
      }
    }
  }
};
class McpServerDefinitionsProviderRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.mcpServerDefinitionProviders && Array.isArray(manifest.contributes.mcpServerDefinitionProviders) && manifest.contributes.mcpServerDefinitionProviders.length > 0;
  }
  render(manifest) {
    const mcpServerDefinitionProviders = manifest.contributes?.mcpServerDefinitionProviders ?? [];
    const headers = [localize("id", "ID"), localize("name", "Name")];
    const rows = mcpServerDefinitionProviders.map((mcpServerDefinitionProvider) => {
      return [
        new MarkdownString().appendMarkdown(`\`${mcpServerDefinitionProvider.id}\``),
        mcpServerDefinitionProvider.label
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: mcpConfigurationSection,
  label: localize("mcpServerDefinitionProviders", "MCP Servers"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(McpServerDefinitionsProviderRenderer)
});
export {
  DiscoverySource,
  McpCollisionBehavior,
  allDiscoverySources,
  discoverySourceLabel,
  discoverySourceSettingsLabel,
  mcpActivationEvent,
  mcpConfigurationSection,
  mcpContributionPoint,
  mcpDiscoverySection,
  mcpEnterpriseManagedAuthIdpSection,
  mcpSchemaExampleServers,
  mcpServerCollisionBehaviorSection,
  mcpServerSamplingSection,
  mcpServerSchema,
  mcpStdioServerSchema
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwQ29uZmlndXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCwgSU1jcENvbGxlY3Rpb25Db250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbWNwU2NoZW1hSWQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlucHV0c1NjaGVtYSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyU2NoZW1hLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElSZW5kZXJlZERhdGEsIElSb3dEYXRhLCBJVGFibGVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblBvaW50RGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5cbmNvbnN0IG1jcEFjdGl2YXRpb25FdmVudFByZWZpeCA9ICdvbk1jcENvbGxlY3Rpb246JztcblxuLyoqXG4gKiBub3RlOiBgY29udHJpYnV0ZWRDb2xsZWN0aW9uSWRgIGlzIF9ub3RfIHRoZSBjb2xsZWN0aW9uIElELiBUaGUgY29sbGVjdGlvblxuICogSUQgaXMgZm9ybWVkIGJ5IHBhc3NpbmcgdGhlIGNvbnRyaWJ1dGVkIElEIHRocm91Z2ggYGV4dGVuc2lvblByZWZpeGVkSWRlbnRpZmllcmBcbiAqL1xuZXhwb3J0IGNvbnN0IG1jcEFjdGl2YXRpb25FdmVudCA9IChjb250cmlidXRlZENvbGxlY3Rpb25JZDogc3RyaW5nKSA9PlxuXHRtY3BBY3RpdmF0aW9uRXZlbnRQcmVmaXggKyBjb250cmlidXRlZENvbGxlY3Rpb25JZDtcblxuZXhwb3J0IGNvbnN0IGVudW0gRGlzY292ZXJ5U291cmNlIHtcblx0Q2xhdWRlRGVza3RvcCA9ICdjbGF1ZGUtZGVza3RvcCcsXG5cdFdpbmRzdXJmID0gJ3dpbmRzdXJmJyxcblx0Q3Vyc29yR2xvYmFsID0gJ2N1cnNvci1nbG9iYWwnLFxuXHRDdXJzb3JXb3Jrc3BhY2UgPSAnY3Vyc29yLXdvcmtzcGFjZScsXG59XG5cbmV4cG9ydCBjb25zdCBhbGxEaXNjb3ZlcnlTb3VyY2VzID0gT2JqZWN0LmtleXMoe1xuXHRbRGlzY292ZXJ5U291cmNlLkNsYXVkZURlc2t0b3BdOiB0cnVlLFxuXHRbRGlzY292ZXJ5U291cmNlLldpbmRzdXJmXTogdHJ1ZSxcblx0W0Rpc2NvdmVyeVNvdXJjZS5DdXJzb3JHbG9iYWxdOiB0cnVlLFxuXHRbRGlzY292ZXJ5U291cmNlLkN1cnNvcldvcmtzcGFjZV06IHRydWUsXG59IHNhdGlzZmllcyBSZWNvcmQ8RGlzY292ZXJ5U291cmNlLCB0cnVlPikgYXMgRGlzY292ZXJ5U291cmNlW107XG5cbmV4cG9ydCBjb25zdCBkaXNjb3ZlcnlTb3VyY2VMYWJlbDogUmVjb3JkPERpc2NvdmVyeVNvdXJjZSwgc3RyaW5nPiA9IHtcblx0W0Rpc2NvdmVyeVNvdXJjZS5DbGF1ZGVEZXNrdG9wXTogbG9jYWxpemUoJ21jcC5kaXNjb3Zlcnkuc291cmNlLmNsYXVkZS1kZXNrdG9wJywgXCJDbGF1ZGUgRGVza3RvcFwiKSxcblx0W0Rpc2NvdmVyeVNvdXJjZS5XaW5kc3VyZl06IGxvY2FsaXplKCdtY3AuZGlzY292ZXJ5LnNvdXJjZS53aW5kc3VyZicsIFwiV2luZHN1cmZcIiksXG5cdFtEaXNjb3ZlcnlTb3VyY2UuQ3Vyc29yR2xvYmFsXTogbG9jYWxpemUoJ21jcC5kaXNjb3Zlcnkuc291cmNlLmN1cnNvci1nbG9iYWwnLCBcIkN1cnNvciAoR2xvYmFsKVwiKSxcblx0W0Rpc2NvdmVyeVNvdXJjZS5DdXJzb3JXb3Jrc3BhY2VdOiBsb2NhbGl6ZSgnbWNwLmRpc2NvdmVyeS5zb3VyY2UuY3Vyc29yLXdvcmtzcGFjZScsIFwiQ3Vyc29yIChXb3Jrc3BhY2UpXCIpLFxufTtcbmV4cG9ydCBjb25zdCBkaXNjb3ZlcnlTb3VyY2VTZXR0aW5nc0xhYmVsOiBSZWNvcmQ8RGlzY292ZXJ5U291cmNlLCBzdHJpbmc+ID0ge1xuXHRbRGlzY292ZXJ5U291cmNlLkNsYXVkZURlc2t0b3BdOiBsb2NhbGl6ZSgnbWNwLmRpc2NvdmVyeS5zb3VyY2UuY2xhdWRlLWRlc2t0b3AuY29uZmlnJywgXCJDbGF1ZGUgRGVza3RvcCBjb25maWd1cmF0aW9uIChgY2xhdWRlX2Rlc2t0b3BfY29uZmlnLmpzb25gKVwiKSxcblx0W0Rpc2NvdmVyeVNvdXJjZS5XaW5kc3VyZl06IGxvY2FsaXplKCdtY3AuZGlzY292ZXJ5LnNvdXJjZS53aW5kc3VyZi5jb25maWcnLCBcIldpbmRzdXJmIGNvbmZpZ3VyYXRpb25zIChgfi8uY29kZWl1bS93aW5kc3VyZi9tY3BfY29uZmlnLmpzb25gKVwiKSxcblx0W0Rpc2NvdmVyeVNvdXJjZS5DdXJzb3JHbG9iYWxdOiBsb2NhbGl6ZSgnbWNwLmRpc2NvdmVyeS5zb3VyY2UuY3Vyc29yLWdsb2JhbC5jb25maWcnLCBcIkN1cnNvciBnbG9iYWwgY29uZmlndXJhdGlvbiAoYH4vLmN1cnNvci9tY3AuanNvbmApXCIpLFxuXHRbRGlzY292ZXJ5U291cmNlLkN1cnNvcldvcmtzcGFjZV06IGxvY2FsaXplKCdtY3AuZGlzY292ZXJ5LnNvdXJjZS5jdXJzb3Itd29ya3NwYWNlLmNvbmZpZycsIFwiQ3Vyc29yIHdvcmtzcGFjZSBjb25maWd1cmF0aW9uIChgLmN1cnNvci9tY3AuanNvbmApXCIpLFxufTtcblxuZXhwb3J0IGNvbnN0IG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uID0gJ21jcCc7XG5leHBvcnQgY29uc3QgbWNwRGlzY292ZXJ5U2VjdGlvbiA9ICdjaGF0Lm1jcC5kaXNjb3ZlcnkuZW5hYmxlZCc7XG5leHBvcnQgY29uc3QgbWNwU2VydmVyU2FtcGxpbmdTZWN0aW9uID0gJ2NoYXQubWNwLnNlcnZlclNhbXBsaW5nJztcbmV4cG9ydCBjb25zdCBtY3BTZXJ2ZXJDb2xsaXNpb25CZWhhdmlvclNlY3Rpb24gPSAnY2hhdC5tY3AuY29sbGlzaW9uQmVoYXZpb3InO1xuLyoqXG4gKiBDb25maWd1cmF0aW9uIGtleSBmb3IgdGhlIGVudGVycHJpc2UtbWFuYWdlZCBNQ1AgSWRQIGJhZy4gVGhlIHNldHRpbmcgaXNcbiAqIHJlZ2lzdGVyZWQgd2l0aCBgaW5jbHVkZWQ6IGZhbHNlYCBzbyBpdCBpcyBoaWRkZW4gZnJvbSB0aGUgU2V0dGluZ3MgVUkgYW5kXG4gKiBzZXR0aW5ncy5qc29uIEludGVsbGlTZW5zZTsgaXQgaXMgaW50ZW5kZWQgdG8gYmUgZGVsaXZlcmVkIHRocm91Z2ggZW50ZXJwcmlzZVxuICogcG9saWN5IChXaW5kb3dzIEdyb3VwIFBvbGljeSAvIG1hY09TIG1hbmFnZWQgcHJlZmVyZW5jZXMgLyBMaW51eFxuICogYC9ldGMvdnNjb2RlL3BvbGljeS5qc29uYCksIHdpdGggaGFuZC1lZGl0aW5nIG9mIGBzZXR0aW5ncy5qc29uYCBhcyBhXG4gKiBkZXZlbG9wZXIgZXNjYXBlIGhhdGNoLlxuICovXG5leHBvcnQgY29uc3QgbWNwRW50ZXJwcmlzZU1hbmFnZWRBdXRoSWRwU2VjdGlvbiA9ICdtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcCc7XG5cbi8qKlxuICogU2hhcGUgb2YgdGhlIHtAbGluayBtY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBTZWN0aW9ufSBzZXR0aW5nLiBBbGwgZmllbGRzXG4gKiBhcmUgb3B0aW9uYWwgc28gcGFydGlhbCBjb25maWd1cmF0aW9ucyAoZS5nLiBqdXN0IHRoZSBpc3N1ZXIpIHJlbWFpbiB2YWxpZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJTWNwRW50ZXJwcmlzZU1hbmFnZWRBdXRoSWRwQ29uZmlnIHtcblx0cmVhZG9ubHkgaXNzdWVyPzogc3RyaW5nO1xuXHRyZWFkb25seSBjbGllbnRJZD86IHN0cmluZztcblx0cmVhZG9ubHkgY2xpZW50U2VjcmV0Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBNY3BDb2xsaXNpb25CZWhhdmlvciB7XG5cdERpc2FibGUgPSAnZGlzYWJsZScsXG5cdFN1ZmZpeCA9ICdzdWZmaXgnLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNY3BTZXJ2ZXJTYW1wbGluZ0NvbmZpZ3VyYXRpb24ge1xuXHRhbGxvd2VkRHVyaW5nQ2hhdD86IGJvb2xlYW47XG5cdGFsbG93ZWRPdXRzaWRlQ2hhdD86IGJvb2xlYW47XG5cdGFsbG93ZWRNb2RlbHM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNvbnN0IG1jcFNjaGVtYUV4YW1wbGVTZXJ2ZXJzID0ge1xuXHQnbWNwLXNlcnZlci10aW1lJzoge1xuXHRcdGNvbW1hbmQ6ICdweXRob24nLFxuXHRcdGFyZ3M6IFsnLW0nLCAnbWNwX3NlcnZlcl90aW1lJywgJy0tbG9jYWwtdGltZXpvbmU9QW1lcmljYS9Mb3NfQW5nZWxlcyddLFxuXHRcdGVudjoge30sXG5cdH1cbn07XG5cbmNvbnN0IGh0dHBTY2hlbWFFeGFtcGxlcyA9IHtcblx0J215LW1jcC1zZXJ2ZXInOiB7XG5cdFx0dXJsOiAnaHR0cDovL2xvY2FsaG9zdDozMDAxL21jcCcsXG5cdFx0aGVhZGVyczoge30sXG5cdH1cbn07XG5cbmNvbnN0IG1jcERldk1vZGVQcm9wcyA9IChzdGRpbzogYm9vbGVhbik6IElKU09OU2NoZW1hTWFwID0+ICh7XG5cdGRldjoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmRldicsICdFbmFibGVkIGRldmVsb3BtZW50IG1vZGUgZm9yIHRoZSBzZXJ2ZXIuIFdoZW4gcHJlc2VudCwgdGhlIHNlcnZlciB3aWxsIGJlIHN0YXJ0ZWQgZWFnZXJseSBhbmQgb3V0cHV0IHdpbGwgYmUgaW5jbHVkZWQgaW4gaXRzIG91dHB1dC4gUHJvcGVydGllcyBpbnNpZGUgdGhlIGBkZXZgIG9iamVjdCBjYW4gY29uZmlndXJlIGFkZGl0aW9uYWwgYmVoYXZpb3IuJyksXG5cdFx0ZXhhbXBsZXM6IFt7IHdhdGNoOiAnc3JjLyoqLyoudHMnLCBkZWJ1ZzogeyB0eXBlOiAnbm9kZScgfSB9XSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHR3YXRjaDoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuZGV2LndhdGNoJywgJ0EgZ2xvYiBwYXR0ZXJuIG9yIGxpc3Qgb2YgZ2xvYiBwYXR0ZXJucyByZWxhdGl2ZSB0byB0aGUgd29ya3NwYWNlIGZvbGRlciB0byB3YXRjaC4gVGhlIE1DUCBzZXJ2ZXIgd2lsbCBiZSByZXN0YXJ0ZWQgd2hlbiB0aGVzZSBmaWxlcyBjaGFuZ2UuJyksXG5cdFx0XHRcdGV4YW1wbGVzOiBbJ3NyYy8qKi8qLnRzJ10sXG5cdFx0XHRcdG9uZU9mOiBbeyB0eXBlOiAnc3RyaW5nJyB9LCB7IHR5cGU6ICdhcnJheScsIGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0gfV0sXG5cdFx0XHR9LFxuXHRcdFx0Li4uKHN0ZGlvICYmIHtcblx0XHRcdFx0ZGVidWc6IHtcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5kZXYuZGVidWcnLCAnSWYgc2V0LCBkZWJ1Z3MgdGhlIE1DUCBzZXJ2ZXIgdXNpbmcgdGhlIGdpdmVuIHJ1bnRpbWUgYXMgaXRcXCdzIHN0YXJ0ZWQuJyksXG5cdFx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3R5cGUnXSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZW51bTogWydub2RlJ10sXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuZGV2LmRlYnVnLnR5cGUubm9kZScsIFwiRGVidWcgdGhlIE1DUCBzZXJ2ZXIgdXNpbmcgTm9kZS5qcy5cIilcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3R5cGUnXSxcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZW51bTogWydkZWJ1Z3B5J10sXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuZGV2LmRlYnVnLnR5cGUucHl0aG9uJywgXCJEZWJ1ZyB0aGUgTUNQIHNlcnZlciB1c2luZyBQeXRob24gYW5kIGRlYnVncHkuXCIpXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRkZWJ1Z3B5UGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuZGV2LmRlYnVnLmRlYnVncHlQYXRoJywgXCJQYXRoIHRvIHRoZSBkZWJ1Z3B5IGV4ZWN1dGFibGUuXCIpXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjb25zdCBtY3BTdGRpb1NlcnZlclNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdGV4YW1wbGVzOiBbbWNwU2NoZW1hRXhhbXBsZVNlcnZlcnNbJ21jcC1zZXJ2ZXItdGltZSddXSxcblx0cHJvcGVydGllczoge1xuXHRcdHR5cGU6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydzdGRpbyddLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24udHlwZScsIFwiVGhlIHR5cGUgb2YgdGhlIHNlcnZlci5cIilcblx0XHR9LFxuXHRcdHNhbmRib3hFbmFibGVkOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnNhbmRib3hFbmFibGVkJywgXCJXaGV0aGVyIHRvIHJ1biB0aGUgc2VydmVyIGluIGEgc2FuZGJveGVkIGVudmlyb25tZW50LlwiKVxuXHRcdH0sXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5jb21tYW5kJywgXCJUaGUgY29tbWFuZCB0byBydW4gdGhlIHNlcnZlci5cIilcblx0XHR9LFxuXHRcdGN3ZDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5jd2QnLCBcIlRoZSB3b3JraW5nIGRpcmVjdG9yeSBmb3IgdGhlIHNlcnZlciBjb21tYW5kLiBEZWZhdWx0cyB0byB0aGUgd29ya3NwYWNlIGZvbGRlciB3aGVuIHJ1biBpbiBhIHdvcmtzcGFjZS5cIiksXG5cdFx0XHRleGFtcGxlczogWycke3dvcmtzcGFjZUZvbGRlcn0nXSxcblx0XHR9LFxuXHRcdGFyZ3M6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuYXJncy5jb21tYW5kJywgXCJBcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBzZXJ2ZXIuXCIpLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRlbnZGaWxlOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5lbnZGaWxlLmNvbW1hbmQnLCBcIlBhdGggdG8gYSBmaWxlIGNvbnRhaW5pbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciB0aGUgc2VydmVyLlwiKSxcblx0XHRcdGV4YW1wbGVzOiBbJyR7d29ya3NwYWNlRm9sZGVyfS8uZW52J10sXG5cdFx0fSxcblx0XHRlbnY6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5lbnYuY29tbWFuZCcsIFwiRW52aXJvbm1lbnQgdmFyaWFibGVzIHBhc3NlZCB0byB0aGUgc2VydmVyLlwiKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnbnVtYmVyJyB9LFxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQuLi5tY3BEZXZNb2RlUHJvcHModHJ1ZSksXG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBtY3BTZXJ2ZXJTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRpZDogbWNwU2NoZW1hSWQsXG5cdHR5cGU6ICdvYmplY3QnLFxuXHR0aXRsZTogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi50aXRsZScsIFwiTW9kZWwgQ29udGV4dCBQcm90b2NvbCBTZXJ2ZXJzXCIpLFxuXHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRhbGxvd0NvbW1lbnRzOiB0cnVlLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRzYW5kYm94OiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5zYW5kYm94JywgXCJTYW5kYm94IGNvbmZpZyB0aGF0IGRldGVybWluZXMgZmlsZSBzeXN0ZW0gYW5kIG5ldHdvcmsgYWNjZXNzLiBTYW5kYm94aW5nIGlzIGVuYWJsZWQgd2hlbiBzYW5kYm94RW5hYmxlZCBwcm9wZXJ0eSBpcyBzZXQgYXQgdGhlIHNlcnZlciBsZXZlbCBvbiBNYWMgT1MgYW5kIExpbnV4IG9ubHkuXCIpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdG5ldHdvcms6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5zYW5kYm94Lm5ldHdvcmsnLCBcIk5ldHdvcmsgYWNjZXNzIHNldHRpbmdzIGZvciB0aGUgc2FuZGJveGVkIHNlcnZlci5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGFsbG93ZWREb21haW5zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnNhbmRib3gubmV0d29yay5hbGxvd2VkRG9tYWlucycsIFwiTGlzdCBvZiBkb21haW5zIHRoYXQgdGhlIHNlcnZlciBpcyBhbGxvd2VkIHRvIGFjY2Vzcy4gV2lsZGNhcmRzIGFyZSBzdXBwb3J0ZWQsIGUuZy4gYCouZXhhbXBsZS5jb21gLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkZW5pZWREb21haW5zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnNhbmRib3gubmV0d29yay5kZW5pZWREb21haW5zJywgXCJMaXN0IG9mIGRvbWFpbnMgdGhhdCB0aGUgc2VydmVyIGlzIG5vdCBhbGxvd2VkIHRvIGFjY2Vzcy4gZS5nLiBgaW52YWxpZC5leGFtcGxlLmNvbWAuXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsZXN5c3RlbToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnNhbmRib3guZmlsZXN5c3RlbScsIFwiRmlsZXN5c3RlbSBhY2Nlc3Mgc2V0dGluZ3MgZm9yIHRoZSBzYW5kYm94ZWQgc2VydmVyLiBHbG9iIHBhdHRlcm5zIGFyZSBzdXBwb3J0ZWQgZm9yIE1hYyBPUyBvbmx5LlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0ZGVueVJlYWQ6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24uc2FuZGJveC5maWxlc3lzdGVtLmRlbnlSZWFkJywgXCJMaXN0IG9mIGZpbGUgcGF0aHMgdGhhdCB0aGUgc2VydmVyIGlzIG5vdCBhbGxvd2VkIHRvIHJlYWQuIEJ5IGRlZmF1bHQsIGFsbCBmaWxlcyBhcmUgYWxsb3dlZCB0byBiZSByZWFkLiBlLmcuIGB+L3NyYy9zZWNyZXRzYC5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IFtdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0YWxsb3dXcml0ZToge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5zYW5kYm94LmZpbGVzeXN0ZW0uYWxsb3dXcml0ZScsIFwiTGlzdCBvZiBmaWxlIHBhdGhzIHRoYXQgdGhlIHNlcnZlciBpcyBhbGxvd2VkIHRvIHdyaXRlIHRvLiBlLmcuIGB+L3NyYy9gLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkZW55V3JpdGU6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24uc2FuZGJveC5maWxlc3lzdGVtLmRlbnlXcml0ZScsIFwiTGlzdCBvZiBmaWxlIHBhdGhzIHRoYXQgdGhlIHNlcnZlciBpcyBub3QgYWxsb3dlZCB0byB3cml0ZSB0by4gZS5nLiBgfi9zcmMvYXV0aC9gLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHNlcnZlcnM6IHtcblx0XHRcdGV4YW1wbGVzOiBbXG5cdFx0XHRcdG1jcFNjaGVtYUV4YW1wbGVTZXJ2ZXJzLFxuXHRcdFx0XHRodHRwU2NoZW1hRXhhbXBsZXMsXG5cdFx0XHRdLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHRtY3BTdGRpb1NlcnZlclNjaGVtYSwge1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0XHRyZXF1aXJlZDogWyd1cmwnXSxcblx0XHRcdFx0XHRcdGV4YW1wbGVzOiBbaHR0cFNjaGVtYUV4YW1wbGVzWydteS1tY3Atc2VydmVyJ11dLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydodHRwJywgJ3NzZSddLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnR5cGUnLCBcIlRoZSB0eXBlIG9mIHRoZSBzZXJ2ZXIuXCIpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHVybDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGZvcm1hdDogJ3VyaScsXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ15odHRwcz86XFxcXC9cXFxcLy4rJyxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnVybC5wYXR0ZXJuJywgXCJUaGUgVVJMIG11c3Qgc3RhcnQgd2l0aCAnaHR0cDovLycgb3IgJ2h0dHBzOi8vJy5cIiksXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24udXJsJywgXCJUaGUgVVJMIG9mIHRoZSBTdHJlYW1hYmxlIEhUVFAgb3IgU1NFIGVuZHBvaW50LlwiKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24uaGVhZGVycycsIFwiQWRkaXRpb25hbCBoZWFkZXJzIHNlbnQgdG8gdGhlIHNlcnZlci5cIiksXG5cdFx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b2F1dGg6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5vYXV0aCcsIFwiT0F1dGggY29uZmlndXJhdGlvbiBmb3IgYXV0aGVudGljYXRpbmcgd2l0aCB0aGUgc2VydmVyLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0bWluUHJvcGVydGllczogMSxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbGllbnRJZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0bWluTGVuZ3RoOiAxLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLm9hdXRoLmNsaWVudElkJywgXCJUaGUgT0F1dGggY2xpZW50IElEIHRvIHVzZSB3aGVuIGF1dGhlbnRpY2F0aW5nIHdpdGggdGhlIHNlcnZlci4gV2hlbiBgZW50ZXJwcmlzZU1hbmFnZWRgIGlzIGB0cnVlYCwgdGhpcyBpcyB0aGUgKipyZXNvdXJjZSoqIGF1dGhvcml6YXRpb24gc2VydmVyJ3MgY2xpZW50IElEICh0aGUgY2xpZW50IHRydXN0ZWQgYnkgdGhlIHByb3RlY3RlZCByZXNvdXJjZSksIG5vdCB0aGUgSWRQJ3MuIFRvIHNldCB0aGUgbWF0Y2hpbmcgY2xpZW50IHNlY3JldCwgdXNlIHRoZSAqU2V0IENsaWVudCBTZWNyZXQqIGNvZGUgbGVucyBhYm92ZSB0aGlzIGZpZWxkIFx1MjAxNCBzZWNyZXRzIGFyZSBzdG9yZWQgaW4gdGhlIE9TIHNlY3JldCBzdG9yZSwgbm90IGluIHRoaXMgZmlsZS5cIilcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRlbnRlcnByaXNlTWFuYWdlZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLm9hdXRoLmVudGVycHJpc2VNYW5hZ2VkJywgXCIoUHJldmlldykgV2hlbiBzZXQgdG8gYHRydWVgLCB0aGlzIE1DUCBzZXJ2ZXIgYXV0aGVudGljYXRlcyB0aHJvdWdoIHRoZSBTU08gaXNzdWVyIGNvbmZpZ3VyZWQgYnkgYCNtY3AuZW50ZXJwcmlzZU1hbmFnZWRBdXRoLmlkcCNgIHVzaW5nIE9BdXRoIElkZW50aXR5IEFzc2VydGlvbiBBdXRob3JpemF0aW9uIEdyYW50IChJRC1KQUcpLiBBZnRlciBhIG9uZS10aW1lIHNpZ24taW4sIHN1YnNlcXVlbnQgZW50ZXJwcmlzZS1tYW5hZ2VkIHNlcnZlcnMgY29ubmVjdCBzaWxlbnRseS4gVGhlIElkUCBpc3N1ZXIgYW5kIGNsaWVudCBjcmVkZW50aWFscyBhcmUgcmVhZCBmcm9tIHRoZSBgI21jcC5lbnRlcnByaXNlTWFuYWdlZEF1dGguaWRwI2Agc2V0dGluZzsgdGhlIGBjbGllbnRJZGAgb24gdGhpcyBzZXJ2ZXIgZW50cnkgaXMgcGFzc2VkIHRvIHRoZSByZXNvdXJjZSBhdXRob3JpemF0aW9uIHNlcnZlci5cIilcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdC4uLm1jcERldk1vZGVQcm9wcyhmYWxzZSksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0aW5wdXRzOiBpbnB1dHNTY2hlbWEuZGVmaW5pdGlvbnMhLmlucHV0c1xuXHR9XG59O1xuXG5leHBvcnQgY29uc3QgbWNwQ29udHJpYnV0aW9uUG9pbnQ6IElFeHRlbnNpb25Qb2ludERlc2NyaXB0b3I8SU1jcENvbGxlY3Rpb25Db250cmlidXRpb25bXT4gPSB7XG5cdGV4dGVuc2lvblBvaW50OiAnbWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVycycsXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnMpIHtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgY29udHJpYnMpIHtcblx0XHRcdGlmIChjb250cmliLmlkKSB7XG5cdFx0XHRcdHlpZWxkIG1jcEFjdGl2YXRpb25FdmVudChjb250cmliLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubWNwJywgJ0NvbnRyaWJ1dGVzIE1vZGVsIENvbnRleHQgUHJvdG9jb2wgc2VydmVycy4gVXNlcnMgb2YgdGhpcyBzaG91bGQgYWxzbyB1c2UgYHZzY29kZS5sbS5yZWdpc3Rlck1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcmAuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IFt7IGlkOiAnJywgbGFiZWw6ICcnIH1dIH1dLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBpZDogJycsIGxhYmVsOiAnJyB9IH1dLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5tY3AuaWQnLCBcIlVuaXF1ZSBJRCBmb3IgdGhlIGNvbGxlY3Rpb24uXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxhYmVsOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1jcC5sYWJlbCcsIFwiRGlzcGxheSBuYW1lIGZvciB0aGUgY29sbGVjdGlvbi5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5tY3Aud2hlbicsIFwiQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBlbmFibGUgdGhpcyBjb2xsZWN0aW9uLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59O1xuXG5jbGFzcyBNY3BTZXJ2ZXJEZWZpbml0aW9uc1Byb3ZpZGVyUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3RhYmxlJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5tY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzICYmIEFycmF5LmlzQXJyYXkobWFuaWZlc3QuY29udHJpYnV0ZXMubWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVycykgJiYgbWFuaWZlc3QuY29udHJpYnV0ZXMubWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVycy5sZW5ndGggPiAwO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBtY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/Lm1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcnMgPz8gW107XG5cdFx0Y29uc3QgaGVhZGVycyA9IFtsb2NhbGl6ZSgnaWQnLCBcIklEXCIpLCBsb2NhbGl6ZSgnbmFtZScsIFwiTmFtZVwiKV07XG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gbWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVyc1xuXHRcdFx0Lm1hcChtY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXIgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGBcXGAke21jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlci5pZH1cXGBgKSxcblx0XHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXIubGFiZWxcblx0XHRcdFx0XTtcblx0XHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6IG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uLFxuXHRsYWJlbDogbG9jYWxpemUoJ21jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcnMnLCBcIk1DUCBTZXJ2ZXJzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoTWNwU2VydmVyRGVmaW5pdGlvbnNQcm92aWRlclJlbmRlcmVyKSxcbn0pO1xuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFtSDtBQUc1SCxNQUFNLDJCQUEyQjtBQU0xQixNQUFNLHFCQUFxQixDQUFDLDRCQUNsQywyQkFBMkI7QUFFckIsSUFBVyxrQkFBWCxrQkFBV0EscUJBQVg7QUFDTixFQUFBQSxpQkFBQSxtQkFBZ0I7QUFDaEIsRUFBQUEsaUJBQUEsY0FBVztBQUNYLEVBQUFBLGlCQUFBLGtCQUFlO0FBQ2YsRUFBQUEsaUJBQUEscUJBQWtCO0FBSkQsU0FBQUE7QUFBQSxHQUFBO0FBT1gsTUFBTSxzQkFBc0IsT0FBTyxLQUFLO0FBQUEsRUFDOUMsQ0FBQyxvQ0FBNkIsR0FBRztBQUFBLEVBQ2pDLENBQUMseUJBQXdCLEdBQUc7QUFBQSxFQUM1QixDQUFDLGtDQUE0QixHQUFHO0FBQUEsRUFDaEMsQ0FBQyx3Q0FBK0IsR0FBRztBQUNwQyxDQUF5QztBQUVsQyxNQUFNLHVCQUF3RDtBQUFBLEVBQ3BF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
