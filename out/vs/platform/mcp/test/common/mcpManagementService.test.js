import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { upcastPartial } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { AbstractCommonMcpManagementService, AbstractMcpResourceManagementService, McpUserResourceManagementService } from "../../common/mcpManagementService.js";
import { GalleryMcpServerStatus, RegistryType, TransportType } from "../../common/mcpManagement.js";
import { McpServerType, McpServerVariableType } from "../../common/mcpPlatformTypes.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Event } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ConfigurationTarget } from "../../../configuration/common/configuration.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { McpResourceScannerService } from "../../common/mcpResourceScannerService.js";
import { UriIdentityService } from "../../../uriIdentity/common/uriIdentityService.js";
class TestMcpManagementService extends AbstractCommonMcpManagementService {
  constructor() {
    super(...arguments);
    this.onInstallMcpServer = Event.None;
    this.onDidInstallMcpServers = Event.None;
    this.onDidUpdateMcpServers = Event.None;
    this.onUninstallMcpServer = Event.None;
    this.onDidUninstallMcpServer = Event.None;
  }
  getInstalled(mcpResource) {
    throw new Error("Method not implemented.");
  }
  install(server, options) {
    throw new Error("Method not implemented.");
  }
  installFromGallery(server, options) {
    throw new Error("Method not implemented.");
  }
  updateMetadata(local, server, profileLocation) {
    throw new Error("Method not implemented.");
  }
  uninstall(server, options) {
    throw new Error("Method not implemented.");
  }
  canInstall(server) {
    throw new Error("Not supported");
  }
}
class TestMcpResourceManagementService extends AbstractMcpResourceManagementService {
  constructor(mcpResource, fileService, uriIdentityService, mcpResourceScannerService, allowedMcpServersService = { _serviceBrand: void 0, onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowed: () => true }) {
    super(
      mcpResource,
      ConfigurationTarget.USER,
      {},
      fileService,
      uriIdentityService,
      new NullLogService(),
      mcpResourceScannerService,
      allowedMcpServersService
    );
  }
  reload(source) {
    return this.updateLocal(source);
  }
  canInstall(_server) {
    throw new Error("Not supported");
  }
  getLocalServerInfo(_name, _mcpServerConfig) {
    return Promise.resolve(void 0);
  }
  installFromUri(_uri) {
    throw new Error("Not supported");
  }
  installFromGallery(_server, _options) {
    throw new Error("Not supported");
  }
  updateMetadata(_local, _server) {
    throw new Error("Not supported");
  }
}
suite("McpManagementService - getMcpServerConfigurationFromManifest", () => {
  let service;
  setup(() => {
    service = new TestMcpManagementService(new NullLogService());
  });
  teardown(() => {
    service.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("NPM Package Tests", () => {
    test("basic NPM package configuration", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "@modelcontextprotocol/server-brave-search",
          transport: { type: TransportType.STDIO },
          version: "1.0.2",
          environmentVariables: [{
            name: "BRAVE_API_KEY",
            value: "test-key"
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "npx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["@modelcontextprotocol/server-brave-search@1.0.2"]);
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "BRAVE_API_KEY": "test-key" });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs, void 0);
    });
    test("NPM package with custom registry URL", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          registryBaseUrl: "https://custom-registry.example.com",
          identifier: "@company/internal-package",
          transport: { type: TransportType.STDIO },
          version: "2.1.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "npx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "--registry",
          "https://custom-registry.example.com",
          "@company/internal-package@2.1.0"
        ]);
      }
    });
    test("NPM package without version", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "@modelcontextprotocol/everything",
          version: "",
          transport: { type: TransportType.STDIO }
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "npx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["@modelcontextprotocol/everything"]);
      }
    });
    test("NPM package with environment variables containing variables", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "test-server",
          version: "1.0.0",
          environmentVariables: [{
            name: "API_KEY",
            value: "key-{api_token}",
            variables: {
              api_token: {
                description: "Your API token",
                isSecret: true,
                isRequired: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "API_KEY": "key-${input:api_token}" });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "api_token");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "Your API token");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
    });
    test("environment variable with empty value should create input variable (GitHub issue #266106)", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "@modelcontextprotocol/server-brave-search",
          version: "1.0.2",
          environmentVariables: [{
            name: "BRAVE_API_KEY",
            value: "",
            // Empty value should create input variable
            description: "Brave Search API Key",
            isRequired: true,
            isSecret: true
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "BRAVE_API_KEY");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "Brave Search API Key");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "BRAVE_API_KEY": "${input:BRAVE_API_KEY}" });
      }
    });
    test("environment variable with choices but empty value should create pick input (GitHub issue #266106)", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "test-server",
          version: "1.0.0",
          environmentVariables: [{
            name: "SSL_MODE",
            value: "",
            // Empty value should create input variable
            description: "SSL connection mode",
            default: "prefer",
            choices: ["disable", "prefer", "require"]
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "SSL_MODE");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "SSL connection mode");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].default, "prefer");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
      assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ["disable", "prefer", "require"]);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "SSL_MODE": "${input:SSL_MODE}" });
      }
    });
    test("NPM package with package arguments", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "snyk",
          version: "1.1298.0",
          packageArguments: [
            { type: "positional", value: "mcp", valueHint: "command", isRepeated: false },
            {
              type: "named",
              name: "-t",
              value: "stdio",
              isRepeated: false
            }
          ]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["snyk@1.1298.0", "mcp", "-t", "stdio"]);
      }
    });
  });
  suite("Python Package Tests", () => {
    test("basic Python package configuration", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          transport: { type: TransportType.STDIO },
          identifier: "weather-mcp-server",
          version: "0.5.0",
          environmentVariables: [{
            name: "WEATHER_API_KEY",
            value: "test-key"
          }, {
            name: "WEATHER_UNITS",
            value: "celsius"
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "uvx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["weather-mcp-server@0.5.0"]);
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, {
          "WEATHER_API_KEY": "test-key",
          "WEATHER_UNITS": "celsius"
        });
      }
    });
    test("Python package with custom registry URL", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          registryBaseUrl: "https://custom-pypi.example.com/simple",
          transport: { type: TransportType.STDIO },
          identifier: "internal-python-server",
          version: "1.2.3"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "uvx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "--index-url",
          "https://custom-pypi.example.com/simple",
          "internal-python-server@1.2.3"
        ]);
      }
    });
    test("Python package without version", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          transport: { type: TransportType.STDIO },
          identifier: "weather-mcp-server",
          version: ""
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.PYTHON);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["weather-mcp-server"]);
      }
    });
  });
  suite("Docker Package Tests", () => {
    test("basic Docker package configuration", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          transport: { type: TransportType.STDIO },
          identifier: "mcp/filesystem",
          version: "1.0.2",
          runtimeArguments: [{
            type: "named",
            name: "--mount",
            value: "type=bind,src=/host/path,dst=/container/path",
            isRepeated: false
          }],
          environmentVariables: [{
            name: "LOG_LEVEL",
            value: "info"
          }],
          packageArguments: [{
            type: "positional",
            value: "/project",
            valueHint: "directory",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "docker");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "--mount",
          "type=bind,src=/host/path,dst=/container/path",
          "-e",
          "LOG_LEVEL",
          "mcp/filesystem:1.0.2",
          "/project"
        ]);
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "LOG_LEVEL": "info" });
      }
    });
    test("Docker package with custom registry URL", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          registryBaseUrl: "registry.company.com",
          transport: { type: TransportType.STDIO },
          identifier: "internal/mcp-server",
          version: "3.2.1"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "docker");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "registry.company.com/internal/mcp-server:3.2.1"
        ]);
      }
    });
    test("Docker package with variables in runtime arguments", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          transport: { type: TransportType.STDIO },
          identifier: "example/database-manager-mcp",
          version: "3.1.0",
          runtimeArguments: [{
            type: "named",
            name: "-e",
            value: "DB_TYPE={db_type}",
            isRepeated: false,
            variables: {
              db_type: {
                description: "Type of database",
                choices: ["postgres", "mysql", "mongodb", "redis"],
                isRequired: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "-e",
          "DB_TYPE=${input:db_type}",
          "example/database-manager-mcp:3.1.0"
        ]);
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "db_type");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
      assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ["postgres", "mysql", "mongodb", "redis"]);
    });
    test("Docker package arguments without values should create input variables (GitHub issue #266106)", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          transport: { type: TransportType.STDIO },
          identifier: "example/database-manager-mcp",
          version: "3.1.0",
          packageArguments: [{
            type: "named",
            name: "--host",
            description: "Database host",
            default: "localhost",
            isRequired: true,
            isRepeated: false
            // Note: No 'value' field - should create input variable
          }, {
            type: "positional",
            valueHint: "database_name",
            description: "Name of the database to connect to",
            isRequired: true,
            isRepeated: false
            // Note: No 'value' field - should create input variable
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
      const hostInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "host");
      assert.strictEqual(hostInput?.description, "Database host");
      assert.strictEqual(hostInput?.default, "localhost");
      assert.strictEqual(hostInput?.type, McpServerVariableType.PROMPT);
      const dbNameInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "database_name");
      assert.strictEqual(dbNameInput?.description, "Name of the database to connect to");
      assert.strictEqual(dbNameInput?.type, McpServerVariableType.PROMPT);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "example/database-manager-mcp:3.1.0",
          "--host",
          "${input:host}",
          "${input:database_name}"
        ]);
      }
    });
    test("Docker Hub backward compatibility", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          identifier: "example/test-image",
          transport: { type: TransportType.STDIO },
          version: "1.0.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "docker");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "example/test-image:1.0.0"
        ]);
      }
    });
  });
  suite("NuGet Package Tests", () => {
    test("basic NuGet package configuration", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NUGET,
          transport: { type: TransportType.STDIO },
          identifier: "Knapcode.SampleMcpServer",
          version: "0.5.0",
          environmentVariables: [{
            name: "WEATHER_CHOICES",
            value: "sunny,cloudy,rainy"
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "dnx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["Knapcode.SampleMcpServer@0.5.0", "--yes"]);
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, { "WEATHER_CHOICES": "sunny,cloudy,rainy" });
      }
    });
    test("NuGet package with custom registry URL", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NUGET,
          registryBaseUrl: "https://nuget.company.com/v3/index.json",
          transport: { type: TransportType.STDIO },
          identifier: "Company.Internal.McpServer",
          version: "4.5.6"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "dnx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "Company.Internal.McpServer@4.5.6",
          "--yes",
          "--source",
          "https://nuget.company.com/v3/index.json"
        ]);
      }
    });
    test("NuGet package with package arguments", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NUGET,
          transport: { type: TransportType.STDIO },
          identifier: "Knapcode.SampleMcpServer",
          version: "0.4.0-beta",
          packageArguments: [{
            type: "positional",
            value: "mcp",
            valueHint: "command",
            isRepeated: false
          }, {
            type: "positional",
            value: "start",
            valueHint: "action",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NUGET);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "Knapcode.SampleMcpServer@0.4.0-beta",
          "--yes",
          "--",
          "mcp",
          "start"
        ]);
      }
    });
  });
  suite("Remote Server Tests", () => {
    test("SSE remote server configuration", () => {
      const manifest = {
        remotes: [{
          type: TransportType.SSE,
          url: "http://mcp-fs.anonymous.modelcontextprotocol.io/sse"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
      if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
        assert.strictEqual(result.mcpServerConfiguration.config.url, "http://mcp-fs.anonymous.modelcontextprotocol.io/sse");
        assert.strictEqual(result.mcpServerConfiguration.config.headers, void 0);
      }
    });
    test("SSE remote server with headers and variables", () => {
      const manifest = {
        remotes: [{
          type: TransportType.SSE,
          url: "https://mcp.anonymous.modelcontextprotocol.io/sse",
          headers: [{
            name: "X-API-Key",
            value: "{api_key}",
            variables: {
              api_key: {
                description: "API key for authentication",
                isRequired: true,
                isSecret: true
              }
            }
          }, {
            name: "X-Region",
            value: "us-east-1"
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
      if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.headers, {
          "X-API-Key": "${input:api_key}",
          "X-Region": "us-east-1"
        });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "api_key");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
    });
    test("streamable HTTP remote server", () => {
      const manifest = {
        remotes: [{
          type: TransportType.STREAMABLE_HTTP,
          url: "https://mcp.anonymous.modelcontextprotocol.io/http"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
      if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
        assert.strictEqual(result.mcpServerConfiguration.config.url, "https://mcp.anonymous.modelcontextprotocol.io/http");
      }
    });
    test("remote headers without values should create input variables", () => {
      const manifest = {
        remotes: [{
          type: TransportType.SSE,
          url: "https://api.example.com/mcp",
          headers: [{
            name: "Authorization",
            description: "API token for authentication",
            isSecret: true,
            isRequired: true
            // Note: No 'value' field - should create input variable
          }, {
            name: "X-Custom-Header",
            description: "Custom header value",
            default: "default-value",
            choices: ["option1", "option2", "option3"]
            // Note: No 'value' field - should create input variable with choices
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.REMOTE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.REMOTE);
      if (result.mcpServerConfiguration.config.type === McpServerType.REMOTE) {
        assert.strictEqual(result.mcpServerConfiguration.config.url, "https://api.example.com/mcp");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.headers, {
          "Authorization": "${input:Authorization}",
          "X-Custom-Header": "${input:X-Custom-Header}"
        });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
      const authInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "Authorization");
      assert.strictEqual(authInput?.description, "API token for authentication");
      assert.strictEqual(authInput?.password, true);
      assert.strictEqual(authInput?.type, McpServerVariableType.PROMPT);
      const customInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "X-Custom-Header");
      assert.strictEqual(customInput?.description, "Custom header value");
      assert.strictEqual(customInput?.default, "default-value");
      assert.strictEqual(customInput?.type, McpServerVariableType.PICK);
      assert.deepStrictEqual(customInput?.options, ["option1", "option2", "option3"]);
    });
  });
  suite("Variable Interpolation Tests", () => {
    test("multiple variables in single value", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          environmentVariables: [{
            name: "CONNECTION_STRING",
            value: "server={host};port={port};database={db_name}",
            variables: {
              host: {
                description: "Database host",
                default: "localhost"
              },
              port: {
                description: "Database port",
                format: "number",
                default: "5432"
              },
              db_name: {
                description: "Database name",
                isRequired: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.env, {
          "CONNECTION_STRING": "server=${input:host};port=${input:port};database=${input:db_name}"
        });
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 3);
      const hostInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "host");
      assert.strictEqual(hostInput?.default, "localhost");
      assert.strictEqual(hostInput?.type, McpServerVariableType.PROMPT);
      const portInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "port");
      assert.strictEqual(portInput?.default, "5432");
      const dbNameInput = result.mcpServerConfiguration.inputs?.find((i) => i.id === "db_name");
      assert.strictEqual(dbNameInput?.description, "Database name");
    });
    test("variable with choices creates pick input", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          runtimeArguments: [{
            type: "named",
            name: "--log-level",
            value: "{level}",
            isRepeated: false,
            variables: {
              level: {
                description: "Log level",
                choices: ["debug", "info", "warn", "error"],
                default: "info"
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PICK);
      assert.deepStrictEqual(result.mcpServerConfiguration.inputs?.[0].options, ["debug", "info", "warn", "error"]);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].default, "info");
    });
    test("variables in package arguments", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.DOCKER,
          identifier: "test-image",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          packageArguments: [{
            type: "named",
            name: "--host",
            value: "{db_host}",
            isRepeated: false,
            variables: {
              db_host: {
                description: "Database host",
                default: "localhost"
              }
            }
          }, {
            type: "positional",
            value: "{database_name}",
            valueHint: "database_name",
            isRepeated: false,
            variables: {
              database_name: {
                description: "Name of the database to connect to",
                isRequired: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.DOCKER);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "run",
          "-i",
          "--rm",
          "test-image:1.0.0",
          "--host",
          "${input:db_host}",
          "${input:database_name}"
        ]);
      }
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 2);
    });
    test("positional arguments with value_hint should create input variables (GitHub issue #266106)", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "@example/math-tool",
          transport: { type: TransportType.STDIO },
          version: "2.0.1",
          packageArguments: [{
            type: "positional",
            valueHint: "calculation_type",
            description: "Type of calculation to enable",
            isRequired: true,
            isRepeated: false
            // Note: No 'value' field, only value_hint - should create input variable
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "calculation_type");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "Type of calculation to enable");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].type, McpServerVariableType.PROMPT);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, [
          "@example/math-tool@2.0.1",
          "${input:calculation_type}"
        ]);
      }
    });
  });
  suite("Edge Cases and Error Handling", () => {
    test("empty manifest should throw error", () => {
      const manifest = {};
      assert.throws(() => {
        service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      }, /No server package found/);
    });
    test("manifest with no matching package type should use first package", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          transport: { type: TransportType.STDIO },
          identifier: "python-server",
          version: "1.0.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.config.type, McpServerType.LOCAL);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "uvx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["python-server@1.0.0"]);
      }
    });
    test("manifest with matching package type should use that package", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.PYTHON,
          transport: { type: TransportType.STDIO },
          identifier: "python-server",
          version: "1.0.0"
        }, {
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "node-server",
          version: "2.0.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.command, "npx");
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["node-server@2.0.0"]);
      }
    });
    test("undefined environment variables should be omitted", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "test-server",
          version: "1.0.0"
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.env, void 0);
      }
    });
    test("named argument without value should only add name", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          transport: { type: TransportType.STDIO },
          identifier: "test-server",
          version: "1.0.0",
          runtimeArguments: [{
            type: "named",
            name: "--verbose",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["--verbose", "test-server@1.0.0"]);
      }
    });
    test("positional argument with undefined value should use value_hint", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          packageArguments: [{
            type: "positional",
            valueHint: "target_directory",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["test-server@1.0.0", "target_directory"]);
      }
    });
    test("named argument with no name should generate notice", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          runtimeArguments: [{
            type: "named",
            value: "some-value",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.notices.length, 1);
      assert.ok(result.notices[0].includes("Named argument is missing a name"));
      assert.ok(result.notices[0].includes("some-value"));
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["test-server@1.0.0"]);
      }
    });
    test("named argument with empty name should generate notice", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          runtimeArguments: [{
            type: "named",
            name: "",
            value: "some-value",
            isRepeated: false
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.notices.length, 1);
      assert.ok(result.notices[0].includes("Named argument is missing a name"));
      assert.ok(result.notices[0].includes("some-value"));
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.deepStrictEqual(result.mcpServerConfiguration.config.args, ["test-server@1.0.0"]);
      }
    });
  });
  suite("Variable Processing Order", () => {
    test("should use explicit variables instead of auto-generating when both are possible", () => {
      const manifest = {
        packages: [{
          registryType: RegistryType.NODE,
          identifier: "test-server",
          transport: { type: TransportType.STDIO },
          version: "1.0.0",
          environmentVariables: [{
            name: "API_KEY",
            value: "Bearer {api_key}",
            description: "Should not be used",
            // This should be ignored since we have explicit variables
            variables: {
              api_key: {
                description: "Your API key",
                isSecret: true
              }
            }
          }]
        }]
      };
      const result = service.getMcpServerConfigurationFromManifest(manifest, RegistryType.NODE);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.length, 1);
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].id, "api_key");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].description, "Your API key");
      assert.strictEqual(result.mcpServerConfiguration.inputs?.[0].password, true);
      if (result.mcpServerConfiguration.config.type === McpServerType.LOCAL) {
        assert.strictEqual(result.mcpServerConfiguration.config.env?.["API_KEY"], "Bearer ${input:api_key}");
      }
    });
  });
});
suite("McpResourceManagementService", () => {
  const mcpResource = URI.from({ scheme: Schemas.inMemory, path: "/mcp.json" });
  let disposables;
  let fileService;
  let uriIdentityService;
  let scannerService;
  let service;
  function createGallery() {
    return {
      name: "test",
      displayName: "Test",
      description: "",
      version: "1.0.0",
      isLatest: true,
      status: GalleryMcpServerStatus.Active,
      configuration: {},
      publisher: "test"
    };
  }
  setup(async () => {
    disposables = new DisposableStore();
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    uriIdentityService = disposables.add(new UriIdentityService(fileService));
    scannerService = disposables.add(new McpResourceScannerService(fileService, uriIdentityService));
    service = disposables.add(new TestMcpResourceManagementService(mcpResource, fileService, uriIdentityService, scannerService));
    await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
      sandbox: {
        network: { allowedDomains: ["example.com"] }
      },
      servers: {
        test: {
          type: "stdio",
          command: "node",
          sandboxEnabled: true
        }
      }
    }, null, "	")));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("fires update when root sandbox changes", async () => {
    const initial = await service.getInstalled();
    assert.strictEqual(initial.length, 1);
    assert.deepStrictEqual(initial[0].rootSandbox, {
      network: { allowedDomains: ["example.com"] }
    });
    let updateCount = 0;
    const updatePromise = new Promise((resolve) => disposables.add(service.onDidUpdateMcpServers((e) => {
      assert.strictEqual(e.length, 1);
      updateCount++;
      resolve();
    })));
    const updatedSandbox = {
      network: { allowedDomains: ["changed.example.com"] }
    };
    await fileService.writeFile(mcpResource, VSBuffer.fromString(JSON.stringify({
      sandbox: updatedSandbox,
      servers: {
        test: {
          type: "stdio",
          command: "node",
          sandboxEnabled: true
        }
      }
    }, null, "	")));
    await service.reload();
    await updatePromise;
    const updated = await service.getInstalled();
    assert.strictEqual(updateCount, 1);
    assert.deepStrictEqual(updated[0].rootSandbox, updatedSandbox);
  });
  test("propagates the gallery source when loading an installed server", async () => {
    const gallery = createGallery();
    const installPromise = Event.toPromise(service.onDidInstallMcpServers);
    await service.reload(gallery);
    const result = await installPromise;
    assert.strictEqual(result[0].source, gallery);
  });
  test("updateMetadata propagates the gallery source when updating an installed server", async () => {
    const galleryResource = URI.from({ scheme: Schemas.inMemory, path: "/gallery-mcp.json" });
    await fileService.writeFile(galleryResource, VSBuffer.fromString(JSON.stringify({
      servers: {
        test: {
          type: "stdio",
          command: "node",
          gallery: true,
          version: "1.0.0"
        }
      }
    }, null, "	")));
    const gallery = createGallery();
    const galleryService = disposables.add(new McpUserResourceManagementService(
      galleryResource,
      upcastPartial({}),
      fileService,
      uriIdentityService,
      new NullLogService(),
      scannerService,
      { _serviceBrand: void 0, onDidChangeAllowedMcpServers: Event.None, isAllowed: () => true, isServerAllowed: () => true },
      upcastPartial({ userRoamingDataHome: URI.from({ scheme: Schemas.inMemory, path: "/user" }) })
    ));
    const [local] = await galleryService.getInstalled();
    const updatePromise = Event.toPromise(galleryService.onDidUpdateMcpServers);
    await galleryService.updateMetadata(local, gallery);
    const result = await updatePromise;
    assert.strictEqual(result[0].source, gallery);
  });
});
suite("McpResourceManagementService - install policy enforcement", () => {
  const mcpResource = URI.from({ scheme: Schemas.inMemory, path: "/mcp-policy.json" });
  let disposables;
  let fileService;
  let uriIdentityService;
  let scannerService;
  const server = { name: "my-server", config: { type: McpServerType.LOCAL, command: "node", args: [] } };
  function createService(isAllowed) {
    const allowedMcpServersService = { _serviceBrand: void 0, onDidChangeAllowedMcpServers: Event.None, isAllowed, isServerAllowed: () => true };
    return disposables.add(new TestMcpResourceManagementService(mcpResource, fileService, uriIdentityService, scannerService, allowedMcpServersService));
  }
  setup(() => {
    disposables = new DisposableStore();
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    uriIdentityService = disposables.add(new UriIdentityService(fileService));
    scannerService = disposables.add(new McpResourceScannerService(fileService, uriIdentityService));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("install throws and does not persist a server blocked by policy", async () => {
    const service = createService(() => new MarkdownString("This mcp server is blocked by your organization."));
    await assert.rejects(() => service.install(server), /blocked by your organization/);
    assert.strictEqual((await service.getInstalled()).find((s) => s.name === server.name), void 0);
  });
  test("install persists a server allowed by policy", async () => {
    const service = createService(() => true);
    const local = await service.install(server);
    assert.strictEqual(local.name, server.name);
    assert.ok((await service.getInstalled()).some((s) => s.name === server.name));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21jcC90ZXN0L2NvbW1vbi9tY3BNYW5hZ2VtZW50U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdENvbW1vbk1jcE1hbmFnZW1lbnRTZXJ2aWNlLCBBYnN0cmFjdE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UsIE1jcFVzZXJSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21jcE1hbmFnZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdhbGxlcnlNY3BTZXJ2ZXJTdGF0dXMsIElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsIElHYWxsZXJ5TWNwU2VydmVyLCBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIElJbnN0YWxsYWJsZU1jcFNlcnZlciwgSUxvY2FsTWNwU2VydmVyLCBJTWNwR2FsbGVyeVNlcnZpY2UsIEluc3RhbGxPcHRpb25zLCBSZWdpc3RyeVR5cGUsIFRyYW5zcG9ydFR5cGUsIFVuaW5zdGFsbE9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24sIE1jcFNlcnZlclR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZSwgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIElNY3BTZXJ2ZXJWYXJpYWJsZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IE1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuXG5jbGFzcyBUZXN0TWNwTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdENvbW1vbk1jcE1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRvdmVycmlkZSBvbkluc3RhbGxNY3BTZXJ2ZXIgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSBvbkRpZEluc3RhbGxNY3BTZXJ2ZXJzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgb25EaWRVcGRhdGVNY3BTZXJ2ZXJzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgb25Vbmluc3RhbGxNY3BTZXJ2ZXIgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSBvbkRpZFVuaW5zdGFsbE1jcFNlcnZlciA9IEV2ZW50Lk5vbmU7XG5cblx0b3ZlcnJpZGUgZ2V0SW5zdGFsbGVkKG1jcFJlc291cmNlPzogVVJJKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXJbXT4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRvdmVycmlkZSBpbnN0YWxsKHNlcnZlcjogSUluc3RhbGxhYmxlTWNwU2VydmVyLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXHRvdmVycmlkZSBpbnN0YWxsRnJvbUdhbGxlcnkoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0b3ZlcnJpZGUgdXBkYXRlTWV0YWRhdGEobG9jYWw6IElMb2NhbE1jcFNlcnZlciwgc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciwgcHJvZmlsZUxvY2F0aW9uPzogVVJJKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ01ldGhvZCBub3QgaW1wbGVtZW50ZWQuJyk7XG5cdH1cblx0b3ZlcnJpZGUgdW5pbnN0YWxsKHNlcnZlcjogSUxvY2FsTWNwU2VydmVyLCBvcHRpb25zPzogVW5pbnN0YWxsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNhbkluc3RhbGwoc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciB8IElJbnN0YWxsYWJsZU1jcFNlcnZlcik6IHRydWUgfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlIHtcblx0Y29uc3RydWN0b3IobWNwUmVzb3VyY2U6IFVSSSwgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlLCB1cmlJZGVudGl0eVNlcnZpY2U6IFVyaUlkZW50aXR5U2VydmljZSwgbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZTogTWNwUmVzb3VyY2VTY2FubmVyU2VydmljZSwgYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlOiBJQWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIG9uRGlkQ2hhbmdlQWxsb3dlZE1jcFNlcnZlcnM6IEV2ZW50Lk5vbmUsIGlzQWxsb3dlZDogKCkgPT4gdHJ1ZSwgaXNTZXJ2ZXJBbGxvd2VkOiAoKSA9PiB0cnVlIH0pIHtcblx0XHRzdXBlcihcblx0XHRcdG1jcFJlc291cmNlLFxuXHRcdFx0Q29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0e30gYXMgSU1jcEdhbGxlcnlTZXJ2aWNlLFxuXHRcdFx0ZmlsZVNlcnZpY2UsXG5cdFx0XHR1cmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UsXG5cdFx0XHRhbGxvd2VkTWNwU2VydmVyc1NlcnZpY2UsXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZWxvYWQoc291cmNlPzogSUdhbGxlcnlNY3BTZXJ2ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGVMb2NhbChzb3VyY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2FuSW5zdGFsbChfc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlciB8IElJbnN0YWxsYWJsZU1jcFNlcnZlcik6IHRydWUgfCBJTWFya2Rvd25TdHJpbmcge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldExvY2FsU2VydmVySW5mbyhfbmFtZTogc3RyaW5nLCBfbWNwU2VydmVyQ29uZmlnOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbikge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpbnN0YWxsRnJvbVVyaShfdXJpOiBVUkkpOiBQcm9taXNlPElMb2NhbE1jcFNlcnZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTm90IHN1cHBvcnRlZCcpO1xuXHR9XG5cblx0b3ZlcnJpZGUgaW5zdGFsbEZyb21HYWxsZXJ5KF9zZXJ2ZXI6IElHYWxsZXJ5TWNwU2VydmVyLCBfb3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxNY3BTZXJ2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vdCBzdXBwb3J0ZWQnKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZU1ldGFkYXRhKF9sb2NhbDogSUxvY2FsTWNwU2VydmVyLCBfc2VydmVyOiBJR2FsbGVyeU1jcFNlcnZlcik6IFByb21pc2U8SUxvY2FsTWNwU2VydmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdOb3Qgc3VwcG9ydGVkJyk7XG5cdH1cbn1cblxuc3VpdGUoJ01jcE1hbmFnZW1lbnRTZXJ2aWNlIC0gZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdCcsICgpID0+IHtcblx0bGV0IHNlcnZpY2U6IFRlc3RNY3BNYW5hZ2VtZW50U2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0c2VydmljZSA9IG5ldyBUZXN0TWNwTWFuYWdlbWVudFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdOUE0gUGFja2FnZSBUZXN0cycsICgpID0+IHtcblx0XHR0ZXN0KCdiYXNpYyBOUE0gcGFja2FnZSBjb25maWd1cmF0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnQG1vZGVsY29udGV4dHByb3RvY29sL3NlcnZlci1icmF2ZS1zZWFyY2gnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4yJyxcblx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdCUkFWRV9BUElfS0VZJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAndGVzdC1rZXknXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuY29tbWFuZCwgJ25weCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9zZXJ2ZXItYnJhdmUtc2VhcmNoQDEuMC4yJ10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnYsIHsgJ0JSQVZFX0FQSV9LRVknOiAndGVzdC1rZXknIH0pO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cywgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ05QTSBwYWNrYWdlIHdpdGggY3VzdG9tIHJlZ2lzdHJ5IFVSTCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0cmVnaXN0cnlCYXNlVXJsOiAnaHR0cHM6Ly9jdXN0b20tcmVnaXN0cnkuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdAY29tcGFueS9pbnRlcm5hbC1wYWNrYWdlJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdHZlcnNpb246ICcyLjEuMCdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuY29tbWFuZCwgJ25weCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbXG5cdFx0XHRcdFx0Jy0tcmVnaXN0cnknLCAnaHR0cHM6Ly9jdXN0b20tcmVnaXN0cnkuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdCdAY29tcGFueS9pbnRlcm5hbC1wYWNrYWdlQDIuMS4wJ1xuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ05QTSBwYWNrYWdlIHdpdGhvdXQgdmVyc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ0Btb2RlbGNvbnRleHRwcm90b2NvbC9ldmVyeXRoaW5nJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9XG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICducHgnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWydAbW9kZWxjb250ZXh0cHJvdG9jb2wvZXZlcnl0aGluZyddKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ05QTSBwYWNrYWdlIHdpdGggZW52aXJvbm1lbnQgdmFyaWFibGVzIGNvbnRhaW5pbmcgdmFyaWFibGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdBUElfS0VZJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAna2V5LXthcGlfdG9rZW59Jyxcblx0XHRcdFx0XHRcdHZhcmlhYmxlczoge1xuXHRcdFx0XHRcdFx0XHRhcGlfdG9rZW46IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1lvdXIgQVBJIHRva2VuJyxcblx0XHRcdFx0XHRcdFx0XHRpc1NlY3JldDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRpc1JlcXVpcmVkOiB0cnVlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTk9ERSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuZW52LCB7ICdBUElfS0VZJzogJ2tleS0ke2lucHV0OmFwaV90b2tlbn0nIH0pO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5pZCwgJ2FwaV90b2tlbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmRlc2NyaXB0aW9uLCAnWW91ciBBUEkgdG9rZW4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5wYXNzd29yZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbnZpcm9ubWVudCB2YXJpYWJsZSB3aXRoIGVtcHR5IHZhbHVlIHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGUgKEdpdEh1YiBpc3N1ZSAjMjY2MTA2KScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnQG1vZGVsY29udGV4dHByb3RvY29sL3NlcnZlci1icmF2ZS1zZWFyY2gnLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMicsXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnQlJBVkVfQVBJX0tFWScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJycsIC8vIEVtcHR5IHZhbHVlIHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGVcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnQnJhdmUgU2VhcmNoIEFQSSBLZXknLFxuXHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGlzU2VjcmV0OiB0cnVlXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHQvLyBCVUc6IEN1cnJlbnRseSB0aGlzIGNyZWF0ZXMgZW52IHdpdGggZW1wdHkgc3RyaW5nIGluc3RlYWQgb2YgaW5wdXQgdmFyaWFibGVcblx0XHRcdC8vIFNob3VsZCBjcmVhdGUgYW4gaW5wdXQgdmFyaWFibGUgc2luY2Ugbm8gbWVhbmluZ2Z1bCB2YWx1ZSBpcyBwcm92aWRlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5pZCwgJ0JSQVZFX0FQSV9LRVknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5kZXNjcmlwdGlvbiwgJ0JyYXZlIFNlYXJjaCBBUEkgS2V5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0ucGFzc3dvcmQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQpO1xuXG5cdFx0XHQvLyBFbnZpcm9ubWVudCBzaG91bGQgdXNlIGlucHV0IHZhcmlhYmxlIGludGVycG9sYXRpb25cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnYsIHsgJ0JSQVZFX0FQSV9LRVknOiAnJHtpbnB1dDpCUkFWRV9BUElfS0VZfScgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbnZpcm9ubWVudCB2YXJpYWJsZSB3aXRoIGNob2ljZXMgYnV0IGVtcHR5IHZhbHVlIHNob3VsZCBjcmVhdGUgcGljayBpbnB1dCAoR2l0SHViIGlzc3VlICMyNjYxMDYpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdTU0xfTU9ERScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJycsIC8vIEVtcHR5IHZhbHVlIHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGVcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnU1NMIGNvbm5lY3Rpb24gbW9kZScsXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAncHJlZmVyJyxcblx0XHRcdFx0XHRcdGNob2ljZXM6IFsnZGlzYWJsZScsICdwcmVmZXInLCAncmVxdWlyZSddXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHQvLyBCVUc6IEN1cnJlbnRseSB0aGlzIGNyZWF0ZXMgZW52IHdpdGggZW1wdHkgc3RyaW5nIGluc3RlYWQgb2YgaW5wdXQgdmFyaWFibGVcblx0XHRcdC8vIFNob3VsZCBjcmVhdGUgYSBwaWNrIGlucHV0IHZhcmlhYmxlIHNpbmNlIGNob2ljZXMgYXJlIHByb3ZpZGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmlkLCAnU1NMX01PREUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5kZXNjcmlwdGlvbiwgJ1NTTCBjb25uZWN0aW9uIG1vZGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5kZWZhdWx0LCAncHJlZmVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0udHlwZSwgTWNwU2VydmVyVmFyaWFibGVUeXBlLlBJQ0spO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5vcHRpb25zLCBbJ2Rpc2FibGUnLCAncHJlZmVyJywgJ3JlcXVpcmUnXSk7XG5cblx0XHRcdC8vIEVudmlyb25tZW50IHNob3VsZCB1c2UgaW5wdXQgdmFyaWFibGUgaW50ZXJwb2xhdGlvblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmVudiwgeyAnU1NMX01PREUnOiAnJHtpbnB1dDpTU0xfTU9ERX0nIH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnTlBNIHBhY2thZ2Ugd2l0aCBwYWNrYWdlIGFyZ3VtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnc255aycsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMTI5OC4wJyxcblx0XHRcdFx0XHRwYWNrYWdlQXJndW1lbnRzOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdwb3NpdGlvbmFsJywgdmFsdWU6ICdtY3AnLCB2YWx1ZUhpbnQ6ICdjb21tYW5kJywgaXNSZXBlYXRlZDogZmFsc2UgfSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ25hbWVkJyxcblx0XHRcdFx0XHRcdFx0bmFtZTogJy10Jyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6ICdzdGRpbycsXG5cdFx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTk9ERSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWydzbnlrQDEuMTI5OC4wJywgJ21jcCcsICctdCcsICdzdGRpbyddKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1B5dGhvbiBQYWNrYWdlIFRlc3RzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Jhc2ljIFB5dGhvbiBwYWNrYWdlIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5QWVRIT04sXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnd2VhdGhlci1tY3Atc2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMC41LjAnLFxuXHRcdFx0XHRcdGVudmlyb25tZW50VmFyaWFibGVzOiBbe1xuXHRcdFx0XHRcdFx0bmFtZTogJ1dFQVRIRVJfQVBJX0tFWScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ3Rlc3Qta2V5J1xuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdG5hbWU6ICdXRUFUSEVSX1VOSVRTJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAnY2Vsc2l1cydcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuUFlUSE9OKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICd1dngnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWyd3ZWF0aGVyLW1jcC1zZXJ2ZXJAMC41LjAnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmVudiwge1xuXHRcdFx0XHRcdCdXRUFUSEVSX0FQSV9LRVknOiAndGVzdC1rZXknLFxuXHRcdFx0XHRcdCdXRUFUSEVSX1VOSVRTJzogJ2NlbHNpdXMnXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUHl0aG9uIHBhY2thZ2Ugd2l0aCBjdXN0b20gcmVnaXN0cnkgVVJMJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuUFlUSE9OLFxuXHRcdFx0XHRcdHJlZ2lzdHJ5QmFzZVVybDogJ2h0dHBzOi8vY3VzdG9tLXB5cGkuZXhhbXBsZS5jb20vc2ltcGxlJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdpbnRlcm5hbC1weXRob24tc2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4yLjMnXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5QWVRIT04pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuY29tbWFuZCwgJ3V2eCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbXG5cdFx0XHRcdFx0Jy0taW5kZXgtdXJsJywgJ2h0dHBzOi8vY3VzdG9tLXB5cGkuZXhhbXBsZS5jb20vc2ltcGxlJyxcblx0XHRcdFx0XHQnaW50ZXJuYWwtcHl0aG9uLXNlcnZlckAxLjIuMydcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdQeXRob24gcGFja2FnZSB3aXRob3V0IHZlcnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5QWVRIT04sXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnd2VhdGhlci1tY3Atc2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuUFlUSE9OKTtcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFsnd2VhdGhlci1tY3Atc2VydmVyJ10pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnRG9ja2VyIFBhY2thZ2UgVGVzdHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnYmFzaWMgRG9ja2VyIHBhY2thZ2UgY29uZmlndXJhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLkRPQ0tFUixcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdtY3AvZmlsZXN5c3RlbScsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4yJyxcblx0XHRcdFx0XHRydW50aW1lQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ25hbWVkJyxcblx0XHRcdFx0XHRcdG5hbWU6ICctLW1vdW50Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiAndHlwZT1iaW5kLHNyYz0vaG9zdC9wYXRoLGRzdD0vY29udGFpbmVyL3BhdGgnLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2Vcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdMT0dfTEVWRUwnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdpbmZvJ1xuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHBhY2thZ2VBcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAncG9zaXRpb25hbCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJy9wcm9qZWN0Jyxcblx0XHRcdFx0XHRcdHZhbHVlSGludDogJ2RpcmVjdG9yeScsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5ET0NLRVIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuY29tbWFuZCwgJ2RvY2tlcicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbXG5cdFx0XHRcdFx0J3J1bicsICctaScsICctLXJtJyxcblx0XHRcdFx0XHQnLS1tb3VudCcsICd0eXBlPWJpbmQsc3JjPS9ob3N0L3BhdGgsZHN0PS9jb250YWluZXIvcGF0aCcsXG5cdFx0XHRcdFx0Jy1lJywgJ0xPR19MRVZFTCcsXG5cdFx0XHRcdFx0J21jcC9maWxlc3lzdGVtOjEuMC4yJyxcblx0XHRcdFx0XHQnL3Byb2plY3QnXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnYsIHsgJ0xPR19MRVZFTCc6ICdpbmZvJyB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ0RvY2tlciBwYWNrYWdlIHdpdGggY3VzdG9tIHJlZ2lzdHJ5IFVSTCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLkRPQ0tFUixcblx0XHRcdFx0XHRyZWdpc3RyeUJhc2VVcmw6ICdyZWdpc3RyeS5jb21wYW55LmNvbScsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnaW50ZXJuYWwvbWNwLXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzMuMi4xJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuRE9DS0VSKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICdkb2NrZXInKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgW1xuXHRcdFx0XHRcdCdydW4nLCAnLWknLCAnLS1ybScsXG5cdFx0XHRcdFx0J3JlZ2lzdHJ5LmNvbXBhbnkuY29tL2ludGVybmFsL21jcC1zZXJ2ZXI6My4yLjEnXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRG9ja2VyIHBhY2thZ2Ugd2l0aCB2YXJpYWJsZXMgaW4gcnVudGltZSBhcmd1bWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5ET0NLRVIsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnZXhhbXBsZS9kYXRhYmFzZS1tYW5hZ2VyLW1jcCcsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzMuMS4wJyxcblx0XHRcdFx0XHRydW50aW1lQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ25hbWVkJyxcblx0XHRcdFx0XHRcdG5hbWU6ICctZScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ0RCX1RZUEU9e2RiX3R5cGV9Jyxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0dmFyaWFibGVzOiB7XG5cdFx0XHRcdFx0XHRcdGRiX3R5cGU6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1R5cGUgb2YgZGF0YWJhc2UnLFxuXHRcdFx0XHRcdFx0XHRcdGNob2ljZXM6IFsncG9zdGdyZXMnLCAnbXlzcWwnLCAnbW9uZ29kYicsICdyZWRpcyddLFxuXHRcdFx0XHRcdFx0XHRcdGlzUmVxdWlyZWQ6IHRydWVcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5ET0NLRVIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFtcblx0XHRcdFx0XHQncnVuJywgJy1pJywgJy0tcm0nLFxuXHRcdFx0XHRcdCctZScsICdEQl9UWVBFPSR7aW5wdXQ6ZGJfdHlwZX0nLFxuXHRcdFx0XHRcdCdleGFtcGxlL2RhdGFiYXNlLW1hbmFnZXItbWNwOjMuMS4wJ1xuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uaWQsICdkYl90eXBlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0udHlwZSwgTWNwU2VydmVyVmFyaWFibGVUeXBlLlBJQ0spO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/LlswXS5vcHRpb25zLCBbJ3Bvc3RncmVzJywgJ215c3FsJywgJ21vbmdvZGInLCAncmVkaXMnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdEb2NrZXIgcGFja2FnZSBhcmd1bWVudHMgd2l0aG91dCB2YWx1ZXMgc2hvdWxkIGNyZWF0ZSBpbnB1dCB2YXJpYWJsZXMgKEdpdEh1YiBpc3N1ZSAjMjY2MTA2KScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLkRPQ0tFUixcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdleGFtcGxlL2RhdGFiYXNlLW1hbmFnZXItbWNwJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMy4xLjAnLFxuXHRcdFx0XHRcdHBhY2thZ2VBcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbmFtZWQnLFxuXHRcdFx0XHRcdFx0bmFtZTogJy0taG9zdCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIGhvc3QnLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ2xvY2FsaG9zdCcsXG5cdFx0XHRcdFx0XHRpc1JlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2Vcblx0XHRcdFx0XHRcdC8vIE5vdGU6IE5vICd2YWx1ZScgZmllbGQgLSBzaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Bvc2l0aW9uYWwnLFxuXHRcdFx0XHRcdFx0dmFsdWVIaW50OiAnZGF0YWJhc2VfbmFtZScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIGRhdGFiYXNlIHRvIGNvbm5lY3QgdG8nLFxuXHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0XHQvLyBOb3RlOiBObyAndmFsdWUnIGZpZWxkIC0gc2hvdWxkIGNyZWF0ZSBpbnB1dCB2YXJpYWJsZVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5ET0NLRVIpO1xuXG5cdFx0XHQvLyBCVUc6IEN1cnJlbnRseSBuYW1lZCBhcmdzIHdpdGhvdXQgdmFsdWUgYXJlIGlnbm9yZWQsIHBvc2l0aW9uYWwgdXNlcyB2YWx1ZV9oaW50IGFzIGxpdGVyYWxcblx0XHRcdC8vIFNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGVzIGZvciBib3RoIGFyZ3VtZW50c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8ubGVuZ3RoLCAyKTtcblxuXHRcdFx0Y29uc3QgaG9zdElucHV0ID0gcmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5maW5kKChpOiBJTWNwU2VydmVyVmFyaWFibGUpID0+IGkuaWQgPT09ICdob3N0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdElucHV0Py5kZXNjcmlwdGlvbiwgJ0RhdGFiYXNlIGhvc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0SW5wdXQ/LmRlZmF1bHQsICdsb2NhbGhvc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0SW5wdXQ/LnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQpO1xuXG5cdFx0XHRjb25zdCBkYk5hbWVJbnB1dCA9IHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uZmluZCgoaTogSU1jcFNlcnZlclZhcmlhYmxlKSA9PiBpLmlkID09PSAnZGF0YWJhc2VfbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRiTmFtZUlucHV0Py5kZXNjcmlwdGlvbiwgJ05hbWUgb2YgdGhlIGRhdGFiYXNlIHRvIGNvbm5lY3QgdG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkYk5hbWVJbnB1dD8udHlwZSwgTWNwU2VydmVyVmFyaWFibGVUeXBlLlBST01QVCk7XG5cblx0XHRcdC8vIEFyZ3Mgc2hvdWxkIHVzZSBpbnB1dCB2YXJpYWJsZSBpbnRlcnBvbGF0aW9uXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgW1xuXHRcdFx0XHRcdCdydW4nLCAnLWknLCAnLS1ybScsXG5cdFx0XHRcdFx0J2V4YW1wbGUvZGF0YWJhc2UtbWFuYWdlci1tY3A6My4xLjAnLFxuXHRcdFx0XHRcdCctLWhvc3QnLCAnJHtpbnB1dDpob3N0fScsXG5cdFx0XHRcdFx0JyR7aW5wdXQ6ZGF0YWJhc2VfbmFtZX0nXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnRG9ja2VyIEh1YiBiYWNrd2FyZCBjb21wYXRpYmlsaXR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuRE9DS0VSLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdleGFtcGxlL3Rlc3QtaW1hZ2UnLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuRE9DS0VSKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICdkb2NrZXInKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgW1xuXHRcdFx0XHRcdCdydW4nLCAnLWknLCAnLS1ybScsXG5cdFx0XHRcdFx0J2V4YW1wbGUvdGVzdC1pbWFnZToxLjAuMCdcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdOdUdldCBQYWNrYWdlIFRlc3RzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2Jhc2ljIE51R2V0IHBhY2thZ2UgY29uZmlndXJhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5VR0VULFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ0tuYXBjb2RlLlNhbXBsZU1jcFNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzAuNS4wJyxcblx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdXRUFUSEVSX0NIT0lDRVMnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdzdW5ueSxjbG91ZHkscmFpbnknXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5VR0VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICdkbngnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWydLbmFwY29kZS5TYW1wbGVNY3BTZXJ2ZXJAMC41LjAnLCAnLS15ZXMnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmVudiwgeyAnV0VBVEhFUl9DSE9JQ0VTJzogJ3N1bm55LGNsb3VkeSxyYWlueScgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdOdUdldCBwYWNrYWdlIHdpdGggY3VzdG9tIHJlZ2lzdHJ5IFVSTCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5VR0VULFxuXHRcdFx0XHRcdHJlZ2lzdHJ5QmFzZVVybDogJ2h0dHBzOi8vbnVnZXQuY29tcGFueS5jb20vdjMvaW5kZXguanNvbicsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnQ29tcGFueS5JbnRlcm5hbC5NY3BTZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICc0LjUuNidcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5VR0VUKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKTtcblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmNvbW1hbmQsICdkbngnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgW1xuXHRcdFx0XHRcdCdDb21wYW55LkludGVybmFsLk1jcFNlcnZlckA0LjUuNicsXG5cdFx0XHRcdFx0Jy0teWVzJyxcblx0XHRcdFx0XHQnLS1zb3VyY2UnLCAnaHR0cHM6Ly9udWdldC5jb21wYW55LmNvbS92My9pbmRleC5qc29uJ1xuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ051R2V0IHBhY2thZ2Ugd2l0aCBwYWNrYWdlIGFyZ3VtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5VR0VULFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ0tuYXBjb2RlLlNhbXBsZU1jcFNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzAuNC4wLWJldGEnLFxuXHRcdFx0XHRcdHBhY2thZ2VBcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAncG9zaXRpb25hbCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ21jcCcsXG5cdFx0XHRcdFx0XHR2YWx1ZUhpbnQ6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Bvc2l0aW9uYWwnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdzdGFydCcsXG5cdFx0XHRcdFx0XHR2YWx1ZUhpbnQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2Vcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTlVHRVQpO1xuXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgW1xuXHRcdFx0XHRcdCdLbmFwY29kZS5TYW1wbGVNY3BTZXJ2ZXJAMC40LjAtYmV0YScsXG5cdFx0XHRcdFx0Jy0teWVzJyxcblx0XHRcdFx0XHQnLS0nLFxuXHRcdFx0XHRcdCdtY3AnLFxuXHRcdFx0XHRcdCdzdGFydCdcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdSZW1vdGUgU2VydmVyIFRlc3RzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ1NTRSByZW1vdGUgc2VydmVyIGNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRyZW1vdGVzOiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRyYW5zcG9ydFR5cGUuU1NFLFxuXHRcdFx0XHRcdHVybDogJ2h0dHA6Ly9tY3AtZnMuYW5vbnltb3VzLm1vZGVsY29udGV4dHByb3RvY29sLmlvL3NzZSdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLlJFTU9URSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5SRU1PVEUpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLlJFTU9URSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnVybCwgJ2h0dHA6Ly9tY3AtZnMuYW5vbnltb3VzLm1vZGVsY29udGV4dHByb3RvY29sLmlvL3NzZScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmhlYWRlcnMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTU0UgcmVtb3RlIHNlcnZlciB3aXRoIGhlYWRlcnMgYW5kIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHJlbW90ZXM6IFt7XG5cdFx0XHRcdFx0dHlwZTogVHJhbnNwb3J0VHlwZS5TU0UsXG5cdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9tY3AuYW5vbnltb3VzLm1vZGVsY29udGV4dHByb3RvY29sLmlvL3NzZScsXG5cdFx0XHRcdFx0aGVhZGVyczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdYLUFQSS1LZXknLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICd7YXBpX2tleX0nLFxuXHRcdFx0XHRcdFx0dmFyaWFibGVzOiB7XG5cdFx0XHRcdFx0XHRcdGFwaV9rZXk6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FQSSBrZXkgZm9yIGF1dGhlbnRpY2F0aW9uJyxcblx0XHRcdFx0XHRcdFx0XHRpc1JlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdGlzU2VjcmV0OiB0cnVlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRuYW1lOiAnWC1SZWdpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICd1cy1lYXN0LTEnXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLlJFTU9URSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5SRU1PVEUpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLlJFTU9URSkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5oZWFkZXJzLCB7XG5cdFx0XHRcdFx0J1gtQVBJLUtleSc6ICcke2lucHV0OmFwaV9rZXl9Jyxcblx0XHRcdFx0XHQnWC1SZWdpb24nOiAndXMtZWFzdC0xJ1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uaWQsICdhcGlfa2V5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0ucGFzc3dvcmQsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyZWFtYWJsZSBIVFRQIHJlbW90ZSBzZXJ2ZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRyZW1vdGVzOiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RSRUFNQUJMRV9IVFRQLFxuXHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vbWNwLmFub255bW91cy5tb2RlbGNvbnRleHRwcm90b2NvbC5pby9odHRwJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuUkVNT1RFKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlLCBNY3BTZXJ2ZXJUeXBlLlJFTU9URSk7XG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuUkVNT1RFKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudXJsLCAnaHR0cHM6Ly9tY3AuYW5vbnltb3VzLm1vZGVsY29udGV4dHByb3RvY29sLmlvL2h0dHAnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW90ZSBoZWFkZXJzIHdpdGhvdXQgdmFsdWVzIHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cmVtb3RlczogW3tcblx0XHRcdFx0XHR0eXBlOiBUcmFuc3BvcnRUeXBlLlNTRSxcblx0XHRcdFx0XHR1cmw6ICdodHRwczovL2FwaS5leGFtcGxlLmNvbS9tY3AnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnQXV0aG9yaXphdGlvbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0FQSSB0b2tlbiBmb3IgYXV0aGVudGljYXRpb24nLFxuXHRcdFx0XHRcdFx0aXNTZWNyZXQ6IHRydWUsXG5cdFx0XHRcdFx0XHRpc1JlcXVpcmVkOiB0cnVlXG5cdFx0XHRcdFx0XHQvLyBOb3RlOiBObyAndmFsdWUnIGZpZWxkIC0gc2hvdWxkIGNyZWF0ZSBpbnB1dCB2YXJpYWJsZVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdG5hbWU6ICdYLUN1c3RvbS1IZWFkZXInLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdDdXN0b20gaGVhZGVyIHZhbHVlJyxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0LXZhbHVlJyxcblx0XHRcdFx0XHRcdGNob2ljZXM6IFsnb3B0aW9uMScsICdvcHRpb24yJywgJ29wdGlvbjMnXVxuXHRcdFx0XHRcdFx0Ly8gTm90ZTogTm8gJ3ZhbHVlJyBmaWVsZCAtIHNob3VsZCBjcmVhdGUgaW5wdXQgdmFyaWFibGUgd2l0aCBjaG9pY2VzXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLlJFTU9URSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSwgTWNwU2VydmVyVHlwZS5SRU1PVEUpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLlJFTU9URSkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnVybCwgJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tL21jcCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5oZWFkZXJzLCB7XG5cdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiAnJHtpbnB1dDpBdXRob3JpemF0aW9ufScsXG5cdFx0XHRcdFx0J1gtQ3VzdG9tLUhlYWRlcic6ICcke2lucHV0OlgtQ3VzdG9tLUhlYWRlcn0nXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlcyBmb3IgaGVhZGVycyB3aXRob3V0IHZhbHVlc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8ubGVuZ3RoLCAyKTtcblxuXHRcdFx0Y29uc3QgYXV0aElucHV0ID0gcmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5maW5kKChpOiBJTWNwU2VydmVyVmFyaWFibGUpID0+IGkuaWQgPT09ICdBdXRob3JpemF0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXV0aElucHV0Py5kZXNjcmlwdGlvbiwgJ0FQSSB0b2tlbiBmb3IgYXV0aGVudGljYXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRoSW5wdXQ/LnBhc3N3b3JkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdXRoSW5wdXQ/LnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQpO1xuXG5cdFx0XHRjb25zdCBjdXN0b21JbnB1dCA9IHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uZmluZCgoaTogSU1jcFNlcnZlclZhcmlhYmxlKSA9PiBpLmlkID09PSAnWC1DdXN0b20tSGVhZGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY3VzdG9tSW5wdXQ/LmRlc2NyaXB0aW9uLCAnQ3VzdG9tIGhlYWRlciB2YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbUlucHV0Py5kZWZhdWx0LCAnZGVmYXVsdC12YWx1ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbUlucHV0Py50eXBlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUElDSyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN1c3RvbUlucHV0Py5vcHRpb25zLCBbJ29wdGlvbjEnLCAnb3B0aW9uMicsICdvcHRpb24zJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVmFyaWFibGUgSW50ZXJwb2xhdGlvbiBUZXN0cycsICgpID0+IHtcblx0XHR0ZXN0KCdtdWx0aXBsZSB2YXJpYWJsZXMgaW4gc2luZ2xlIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdDT05ORUNUSU9OX1NUUklORycsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ3NlcnZlcj17aG9zdH07cG9ydD17cG9ydH07ZGF0YWJhc2U9e2RiX25hbWV9Jyxcblx0XHRcdFx0XHRcdHZhcmlhYmxlczoge1xuXHRcdFx0XHRcdFx0XHRob3N0OiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEYXRhYmFzZSBob3N0Jyxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnbG9jYWxob3N0J1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRwb3J0OiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEYXRhYmFzZSBwb3J0Jyxcblx0XHRcdFx0XHRcdFx0XHRmb3JtYXQ6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICc1NDMyJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkYl9uYW1lOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEYXRhYmFzZSBuYW1lJyxcblx0XHRcdFx0XHRcdFx0XHRpc1JlcXVpcmVkOiB0cnVlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTk9ERSk7XG5cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnYsIHtcblx0XHRcdFx0XHQnQ09OTkVDVElPTl9TVFJJTkcnOiAnc2VydmVyPSR7aW5wdXQ6aG9zdH07cG9ydD0ke2lucHV0OnBvcnR9O2RhdGFiYXNlPSR7aW5wdXQ6ZGJfbmFtZX0nXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8ubGVuZ3RoLCAzKTtcblxuXHRcdFx0Y29uc3QgaG9zdElucHV0ID0gcmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5maW5kKChpOiBJTWNwU2VydmVyVmFyaWFibGUpID0+IGkuaWQgPT09ICdob3N0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdElucHV0Py5kZWZhdWx0LCAnbG9jYWxob3N0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdElucHV0Py50eXBlLCBNY3BTZXJ2ZXJWYXJpYWJsZVR5cGUuUFJPTVBUKTtcblxuXHRcdFx0Y29uc3QgcG9ydElucHV0ID0gcmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5maW5kKChpOiBJTWNwU2VydmVyVmFyaWFibGUpID0+IGkuaWQgPT09ICdwb3J0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocG9ydElucHV0Py5kZWZhdWx0LCAnNTQzMicpO1xuXG5cdFx0XHRjb25zdCBkYk5hbWVJbnB1dCA9IHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uZmluZCgoaTogSU1jcFNlcnZlclZhcmlhYmxlKSA9PiBpLmlkID09PSAnZGJfbmFtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRiTmFtZUlucHV0Py5kZXNjcmlwdGlvbiwgJ0RhdGFiYXNlIG5hbWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhcmlhYmxlIHdpdGggY2hvaWNlcyBjcmVhdGVzIHBpY2sgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0XHRwYWNrYWdlczogW3tcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXNlcnZlcicsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdHJ1bnRpbWVBcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbmFtZWQnLFxuXHRcdFx0XHRcdFx0bmFtZTogJy0tbG9nLWxldmVsJyxcblx0XHRcdFx0XHRcdHZhbHVlOiAne2xldmVsfScsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdHZhcmlhYmxlczoge1xuXHRcdFx0XHRcdFx0XHRsZXZlbDoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTG9nIGxldmVsJyxcblx0XHRcdFx0XHRcdFx0XHRjaG9pY2VzOiBbJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvciddLFxuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdpbmZvJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QSUNLKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0ub3B0aW9ucywgWydkZWJ1ZycsICdpbmZvJywgJ3dhcm4nLCAnZXJyb3InXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uZGVmYXVsdCwgJ2luZm8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhcmlhYmxlcyBpbiBwYWNrYWdlIGFyZ3VtZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLkRPQ0tFUixcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1pbWFnZScsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0XHRcdHBhY2thZ2VBcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbmFtZWQnLFxuXHRcdFx0XHRcdFx0bmFtZTogJy0taG9zdCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ3tkYl9ob3N0fScsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdHZhcmlhYmxlczoge1xuXHRcdFx0XHRcdFx0XHRkYl9ob3N0OiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdEYXRhYmFzZSBob3N0Jyxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnbG9jYWxob3N0J1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Bvc2l0aW9uYWwnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICd7ZGF0YWJhc2VfbmFtZX0nLFxuXHRcdFx0XHRcdFx0dmFsdWVIaW50OiAnZGF0YWJhc2VfbmFtZScsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdHZhcmlhYmxlczoge1xuXHRcdFx0XHRcdFx0XHRkYXRhYmFzZV9uYW1lOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSBkYXRhYmFzZSB0byBjb25uZWN0IHRvJyxcblx0XHRcdFx0XHRcdFx0XHRpc1JlcXVpcmVkOiB0cnVlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuRE9DS0VSKTtcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFtcblx0XHRcdFx0XHQncnVuJywgJy1pJywgJy0tcm0nLFxuXHRcdFx0XHRcdCd0ZXN0LWltYWdlOjEuMC4wJyxcblx0XHRcdFx0XHQnLS1ob3N0JywgJyR7aW5wdXQ6ZGJfaG9zdH0nLFxuXHRcdFx0XHRcdCcke2lucHV0OmRhdGFiYXNlX25hbWV9J1xuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwb3NpdGlvbmFsIGFyZ3VtZW50cyB3aXRoIHZhbHVlX2hpbnQgc2hvdWxkIGNyZWF0ZSBpbnB1dCB2YXJpYWJsZXMgKEdpdEh1YiBpc3N1ZSAjMjY2MTA2KScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ0BleGFtcGxlL21hdGgtdG9vbCcsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMi4wLjEnLFxuXHRcdFx0XHRcdHBhY2thZ2VBcmd1bWVudHM6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAncG9zaXRpb25hbCcsXG5cdFx0XHRcdFx0XHR2YWx1ZUhpbnQ6ICdjYWxjdWxhdGlvbl90eXBlJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVHlwZSBvZiBjYWxjdWxhdGlvbiB0byBlbmFibGUnLFxuXHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0XHQvLyBOb3RlOiBObyAndmFsdWUnIGZpZWxkLCBvbmx5IHZhbHVlX2hpbnQgLSBzaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHQvLyBCVUc6IEN1cnJlbnRseSB2YWx1ZV9oaW50IGlzIHVzZWQgYXMgbGl0ZXJhbCB2YWx1ZSBpbnN0ZWFkIG9mIGNyZWF0aW5nIGlucHV0IHZhcmlhYmxlXG5cdFx0XHQvLyBTaG91bGQgY3JlYXRlIGlucHV0IHZhcmlhYmxlIGluc3RlYWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5pbnB1dHM/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uaWQsICdjYWxjdWxhdGlvbl90eXBlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0uZGVzY3JpcHRpb24sICdUeXBlIG9mIGNhbGN1bGF0aW9uIHRvIGVuYWJsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLnR5cGUsIE1jcFNlcnZlclZhcmlhYmxlVHlwZS5QUk9NUFQpO1xuXG5cdFx0XHQvLyBBcmdzIHNob3VsZCB1c2UgaW5wdXQgdmFyaWFibGUgaW50ZXJwb2xhdGlvblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFtcblx0XHRcdFx0XHQnQGV4YW1wbGUvbWF0aC10b29sQDIuMC4xJyxcblx0XHRcdFx0XHQnJHtpbnB1dDpjYWxjdWxhdGlvbl90eXBlfSdcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdFZGdlIENhc2VzIGFuZCBFcnJvciBIYW5kbGluZycsICgpID0+IHtcblx0XHR0ZXN0KCdlbXB0eSBtYW5pZmVzdCBzaG91bGQgdGhyb3cgZXJyb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYW5pZmVzdDogSUdhbGxlcnlNY3BTZXJ2ZXJDb25maWd1cmF0aW9uID0ge307XG5cblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblx0XHRcdH0sIC9ObyBzZXJ2ZXIgcGFja2FnZSBmb3VuZC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFuaWZlc3Qgd2l0aCBubyBtYXRjaGluZyBwYWNrYWdlIHR5cGUgc2hvdWxkIHVzZSBmaXJzdCBwYWNrYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuUFlUSE9OLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3B5dGhvbi1zZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuY29tbWFuZCwgJ3V2eCcpOyAvLyBQeXRob24gY29tbWFuZCBzaW5jZSB0aGF0J3MgdGhlIHBhY2thZ2UgdHlwZVxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbJ3B5dGhvbi1zZXJ2ZXJAMS4wLjAnXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYW5pZmVzdCB3aXRoIG1hdGNoaW5nIHBhY2thZ2UgdHlwZSBzaG91bGQgdXNlIHRoYXQgcGFja2FnZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLlBZVEhPTixcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdweXRob24tc2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMS4wLjAnXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRyZWdpc3RyeVR5cGU6IFJlZ2lzdHJ5VHlwZS5OT0RFLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ25vZGUtc2VydmVyJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMi4wLjAnXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuY29tbWFuZCwgJ25weCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbJ25vZGUtc2VydmVyQDIuMC4wJ10pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5kZWZpbmVkIGVudmlyb25tZW50IHZhcmlhYmxlcyBzaG91bGQgYmUgb21pdHRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0dHJhbnNwb3J0OiB7IHR5cGU6IFRyYW5zcG9ydFR5cGUuU1RESU8gfSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCdcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnYsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduYW1lZCBhcmd1bWVudCB3aXRob3V0IHZhbHVlIHNob3VsZCBvbmx5IGFkZCBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICd0ZXN0LXNlcnZlcicsXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRydW50aW1lQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ25hbWVkJyxcblx0XHRcdFx0XHRcdG5hbWU6ICctLXZlcmJvc2UnLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2Vcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0LCBSZWdpc3RyeVR5cGUuTk9ERSk7XG5cblx0XHRcdGlmIChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5hcmdzLCBbJy0tdmVyYm9zZScsICd0ZXN0LXNlcnZlckAxLjAuMCddKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bvc2l0aW9uYWwgYXJndW1lbnQgd2l0aCB1bmRlZmluZWQgdmFsdWUgc2hvdWxkIHVzZSB2YWx1ZV9oaW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRwYWNrYWdlQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3Bvc2l0aW9uYWwnLFxuXHRcdFx0XHRcdFx0dmFsdWVIaW50OiAndGFyZ2V0X2RpcmVjdG9yeScsXG5cdFx0XHRcdFx0XHRpc1JlcGVhdGVkOiBmYWxzZVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJ2aWNlLmdldE1jcFNlcnZlckNvbmZpZ3VyYXRpb25Gcm9tTWFuaWZlc3QobWFuaWZlc3QsIFJlZ2lzdHJ5VHlwZS5OT0RFKTtcblxuXHRcdFx0aWYgKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy50eXBlID09PSBNY3BTZXJ2ZXJUeXBlLkxPQ0FMKSB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLmFyZ3MsIFsndGVzdC1zZXJ2ZXJAMS4wLjAnLCAndGFyZ2V0X2RpcmVjdG9yeSddKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hbWVkIGFyZ3VtZW50IHdpdGggbm8gbmFtZSBzaG91bGQgZ2VuZXJhdGUgbm90aWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3QgPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3Qtc2VydmVyJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0cnVudGltZUFyZ3VtZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICduYW1lZCcsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ3NvbWUtdmFsdWUnLFxuXHRcdFx0XHRcdFx0aXNSZXBlYXRlZDogZmFsc2Vcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2VydmljZS5nZXRNY3BTZXJ2ZXJDb25maWd1cmF0aW9uRnJvbU1hbmlmZXN0KG1hbmlmZXN0IGFzIElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHQvLyBTaG91bGQgZ2VuZXJhdGUgYSBub3RpY2UgYWJvdXQgdGhlIG1pc3NpbmcgbmFtZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ub3RpY2VzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lm5vdGljZXNbMF0uaW5jbHVkZXMoJ05hbWVkIGFyZ3VtZW50IGlzIG1pc3NpbmcgYSBuYW1lJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ub3RpY2VzWzBdLmluY2x1ZGVzKCdzb21lLXZhbHVlJykpOyAvLyBTaG91bGQgaW5jbHVkZSB0aGUgYXJndW1lbnQgZGV0YWlscyBpbiBKU09OIGZvcm1hdFxuXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWyd0ZXN0LXNlcnZlckAxLjAuMCddKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hbWVkIGFyZ3VtZW50IHdpdGggZW1wdHkgbmFtZSBzaG91bGQgZ2VuZXJhdGUgbm90aWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFuaWZlc3Q6IElHYWxsZXJ5TWNwU2VydmVyQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdFx0cGFja2FnZXM6IFt7XG5cdFx0XHRcdFx0cmVnaXN0cnlUeXBlOiBSZWdpc3RyeVR5cGUuTk9ERSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAndGVzdC1zZXJ2ZXInLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogeyB0eXBlOiBUcmFuc3BvcnRUeXBlLlNURElPIH0sXG5cdFx0XHRcdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRydW50aW1lQXJndW1lbnRzOiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ25hbWVkJyxcblx0XHRcdFx0XHRcdG5hbWU6ICcnLFxuXHRcdFx0XHRcdFx0dmFsdWU6ICdzb21lLXZhbHVlJyxcblx0XHRcdFx0XHRcdGlzUmVwZWF0ZWQ6IGZhbHNlXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHQvLyBTaG91bGQgZ2VuZXJhdGUgYSBub3RpY2UgYWJvdXQgdGhlIG1pc3NpbmcgbmFtZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ub3RpY2VzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lm5vdGljZXNbMF0uaW5jbHVkZXMoJ05hbWVkIGFyZ3VtZW50IGlzIG1pc3NpbmcgYSBuYW1lJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ub3RpY2VzWzBdLmluY2x1ZGVzKCdzb21lLXZhbHVlJykpOyAvLyBTaG91bGQgaW5jbHVkZSB0aGUgYXJndW1lbnQgZGV0YWlscyBpbiBKU09OIGZvcm1hdFxuXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWNwU2VydmVyQ29uZmlndXJhdGlvbi5jb25maWcuYXJncywgWyd0ZXN0LXNlcnZlckAxLjAuMCddKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1ZhcmlhYmxlIFByb2Nlc3NpbmcgT3JkZXInLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBleHBsaWNpdCB2YXJpYWJsZXMgaW5zdGVhZCBvZiBhdXRvLWdlbmVyYXRpbmcgd2hlbiBib3RoIGFyZSBwb3NzaWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hbmlmZXN0OiBJR2FsbGVyeU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRcdHBhY2thZ2VzOiBbe1xuXHRcdFx0XHRcdHJlZ2lzdHJ5VHlwZTogUmVnaXN0cnlUeXBlLk5PREUsXG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ3Rlc3Qtc2VydmVyJyxcblx0XHRcdFx0XHR0cmFuc3BvcnQ6IHsgdHlwZTogVHJhbnNwb3J0VHlwZS5TVERJTyB9LFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0ZW52aXJvbm1lbnRWYXJpYWJsZXM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnQVBJX0tFWScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogJ0JlYXJlciB7YXBpX2tleX0nLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdTaG91bGQgbm90IGJlIHVzZWQnLCAvLyBUaGlzIHNob3VsZCBiZSBpZ25vcmVkIHNpbmNlIHdlIGhhdmUgZXhwbGljaXQgdmFyaWFibGVzXG5cdFx0XHRcdFx0XHR2YXJpYWJsZXM6IHtcblx0XHRcdFx0XHRcdFx0YXBpX2tleToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnWW91ciBBUEkga2V5Jyxcblx0XHRcdFx0XHRcdFx0XHRpc1NlY3JldDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcnZpY2UuZ2V0TWNwU2VydmVyQ29uZmlndXJhdGlvbkZyb21NYW5pZmVzdChtYW5pZmVzdCwgUmVnaXN0cnlUeXBlLk5PREUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmlkLCAnYXBpX2tleScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmlucHV0cz8uWzBdLmRlc2NyaXB0aW9uLCAnWW91ciBBUEkga2V5Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uaW5wdXRzPy5bMF0ucGFzc3dvcmQsIHRydWUpO1xuXG5cdFx0XHRpZiAocmVzdWx0Lm1jcFNlcnZlckNvbmZpZ3VyYXRpb24uY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5tY3BTZXJ2ZXJDb25maWd1cmF0aW9uLmNvbmZpZy5lbnY/LlsnQVBJX0tFWSddLCAnQmVhcmVyICR7aW5wdXQ6YXBpX2tleX0nKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ01jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IG1jcFJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbWNwLmpzb24nIH0pO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IHVyaUlkZW50aXR5U2VydmljZTogVXJpSWRlbnRpdHlTZXJ2aWNlO1xuXHRsZXQgc2Nhbm5lclNlcnZpY2U6IE1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2U7XG5cdGxldCBzZXJ2aWNlOiBUZXN0TWNwUmVzb3VyY2VNYW5hZ2VtZW50U2VydmljZTtcblxuXHRmdW5jdGlvbiBjcmVhdGVHYWxsZXJ5KCk6IElHYWxsZXJ5TWNwU2VydmVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRpc0xhdGVzdDogdHJ1ZSxcblx0XHRcdHN0YXR1czogR2FsbGVyeU1jcFNlcnZlclN0YXR1cy5BY3RpdmUsXG5cdFx0XHRjb25maWd1cmF0aW9uOiB7fSxcblx0XHRcdHB1Ymxpc2hlcjogJ3Rlc3QnLFxuXHRcdH07XG5cdH1cblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdHVyaUlkZW50aXR5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSk7XG5cdFx0c2Nhbm5lclNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UoZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSkpO1xuXHRcdHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlKG1jcFJlc291cmNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBzY2FubmVyU2VydmljZSkpO1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNhbmRib3g6IHtcblx0XHRcdFx0bmV0d29yazogeyBhbGxvd2VkRG9tYWluczogWydleGFtcGxlLmNvbSddIH1cblx0XHRcdH0sXG5cdFx0XHRzZXJ2ZXJzOiB7XG5cdFx0XHRcdHRlc3Q6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RkaW8nLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0XHRzYW5kYm94RW5hYmxlZDogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgbnVsbCwgJ1xcdCcpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZpcmVzIHVwZGF0ZSB3aGVuIHJvb3Qgc2FuZGJveCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluaXRpYWwgPSBhd2FpdCBzZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbml0aWFsLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbml0aWFsWzBdLnJvb3RTYW5kYm94LCB7XG5cdFx0XHRuZXR3b3JrOiB7IGFsbG93ZWREb21haW5zOiBbJ2V4YW1wbGUuY29tJ10gfVxuXHRcdH0pO1xuXG5cdFx0bGV0IHVwZGF0ZUNvdW50ID0gMDtcblx0XHRjb25zdCB1cGRhdGVQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFVwZGF0ZU1jcFNlcnZlcnMoZSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5sZW5ndGgsIDEpO1xuXHRcdFx0dXBkYXRlQ291bnQrKztcblx0XHRcdHJlc29sdmUoKTtcblx0XHR9KSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlZFNhbmRib3g6IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbiA9IHtcblx0XHRcdG5ldHdvcms6IHsgYWxsb3dlZERvbWFpbnM6IFsnY2hhbmdlZC5leGFtcGxlLmNvbSddIH1cblx0XHR9O1xuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKG1jcFJlc291cmNlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdHNhbmRib3g6IHVwZGF0ZWRTYW5kYm94LFxuXHRcdFx0c2VydmVyczoge1xuXHRcdFx0XHR0ZXN0OiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0ZGlvJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnbm9kZScsXG5cdFx0XHRcdFx0c2FuZGJveEVuYWJsZWQ6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIG51bGwsICdcXHQnKSkpO1xuXHRcdGF3YWl0IHNlcnZpY2UucmVsb2FkKCk7XG5cdFx0YXdhaXQgdXBkYXRlUHJvbWlzZTtcblx0XHRjb25zdCB1cGRhdGVkID0gYXdhaXQgc2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVkWzBdLnJvb3RTYW5kYm94LCB1cGRhdGVkU2FuZGJveCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3BhZ2F0ZXMgdGhlIGdhbGxlcnkgc291cmNlIHdoZW4gbG9hZGluZyBhbiBpbnN0YWxsZWQgc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdhbGxlcnkgPSBjcmVhdGVHYWxsZXJ5KCk7XG5cdFx0Y29uc3QgaW5zdGFsbFByb21pc2UgPSBFdmVudC50b1Byb21pc2Uoc2VydmljZS5vbkRpZEluc3RhbGxNY3BTZXJ2ZXJzKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVsb2FkKGdhbGxlcnkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluc3RhbGxQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5zb3VyY2UsIGdhbGxlcnkpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVNZXRhZGF0YSBwcm9wYWdhdGVzIHRoZSBnYWxsZXJ5IHNvdXJjZSB3aGVuIHVwZGF0aW5nIGFuIGluc3RhbGxlZCBzZXJ2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2FsbGVyeVJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvZ2FsbGVyeS1tY3AuanNvbicgfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGdhbGxlcnlSZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRzZXJ2ZXJzOiB7XG5cdFx0XHRcdHRlc3Q6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RkaW8nLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdub2RlJyxcblx0XHRcdFx0XHRnYWxsZXJ5OiB0cnVlLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxLjAuMCdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIG51bGwsICdcXHQnKSkpO1xuXHRcdGNvbnN0IGdhbGxlcnkgPSBjcmVhdGVHYWxsZXJ5KCk7XG5cdFx0Y29uc3QgZ2FsbGVyeVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1jcFVzZXJSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlKFxuXHRcdFx0Z2FsbGVyeVJlc291cmNlLFxuXHRcdFx0dXBjYXN0UGFydGlhbDxJTWNwR2FsbGVyeVNlcnZpY2U+KHt9KSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0dXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRzY2FubmVyU2VydmljZSxcblx0XHRcdHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBvbkRpZENoYW5nZUFsbG93ZWRNY3BTZXJ2ZXJzOiBFdmVudC5Ob25lLCBpc0FsbG93ZWQ6ICgpID0+IHRydWUsIGlzU2VydmVyQWxsb3dlZDogKCkgPT4gdHJ1ZSB9LFxuXHRcdFx0dXBjYXN0UGFydGlhbDxJRW52aXJvbm1lbnRTZXJ2aWNlPih7IHVzZXJSb2FtaW5nRGF0YUhvbWU6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3VzZXInIH0pIH0pLFxuXHRcdCkpO1xuXHRcdGNvbnN0IFtsb2NhbF0gPSBhd2FpdCBnYWxsZXJ5U2VydmljZS5nZXRJbnN0YWxsZWQoKTtcblx0XHRjb25zdCB1cGRhdGVQcm9taXNlID0gRXZlbnQudG9Qcm9taXNlKGdhbGxlcnlTZXJ2aWNlLm9uRGlkVXBkYXRlTWNwU2VydmVycyk7XG5cblx0XHRhd2FpdCBnYWxsZXJ5U2VydmljZS51cGRhdGVNZXRhZGF0YShsb2NhbCwgZ2FsbGVyeSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdXBkYXRlUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uc291cmNlLCBnYWxsZXJ5KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ01jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2UgLSBpbnN0YWxsIHBvbGljeSBlbmZvcmNlbWVudCcsICgpID0+IHtcblx0Y29uc3QgbWNwUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9tY3AtcG9saWN5Lmpzb24nIH0pO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGZpbGVTZXJ2aWNlOiBGaWxlU2VydmljZTtcblx0bGV0IHVyaUlkZW50aXR5U2VydmljZTogVXJpSWRlbnRpdHlTZXJ2aWNlO1xuXHRsZXQgc2Nhbm5lclNlcnZpY2U6IE1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2U7XG5cblx0Y29uc3Qgc2VydmVyOiBJSW5zdGFsbGFibGVNY3BTZXJ2ZXIgPSB7IG5hbWU6ICdteS1zZXJ2ZXInLCBjb25maWc6IHsgdHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCwgY29tbWFuZDogJ25vZGUnLCBhcmdzOiBbXSB9IH07XG5cblx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShpc0FsbG93ZWQ6IElBbGxvd2VkTWNwU2VydmVyc1NlcnZpY2VbJ2lzQWxsb3dlZCddKTogVGVzdE1jcFJlc291cmNlTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRcdGNvbnN0IGFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZTogSUFsbG93ZWRNY3BTZXJ2ZXJzU2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBvbkRpZENoYW5nZUFsbG93ZWRNY3BTZXJ2ZXJzOiBFdmVudC5Ob25lLCBpc0FsbG93ZWQsIGlzU2VydmVyQWxsb3dlZDogKCkgPT4gdHJ1ZSB9O1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RNY3BSZXNvdXJjZU1hbmFnZW1lbnRTZXJ2aWNlKG1jcFJlc291cmNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlLCBzY2FubmVyU2VydmljZSwgYWxsb3dlZE1jcFNlcnZlcnNTZXJ2aWNlKSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdHVyaUlkZW50aXR5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSk7XG5cdFx0c2Nhbm5lclNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UoZmlsZVNlcnZpY2UsIHVyaUlkZW50aXR5U2VydmljZSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdpbnN0YWxsIHRocm93cyBhbmQgZG9lcyBub3QgcGVyc2lzdCBhIHNlcnZlciBibG9ja2VkIGJ5IHBvbGljeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgoKSA9PiBuZXcgTWFya2Rvd25TdHJpbmcoJ1RoaXMgbWNwIHNlcnZlciBpcyBibG9ja2VkIGJ5IHlvdXIgb3JnYW5pemF0aW9uLicpKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UuaW5zdGFsbChzZXJ2ZXIpLCAvYmxvY2tlZCBieSB5b3VyIG9yZ2FuaXphdGlvbi8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2VydmljZS5nZXRJbnN0YWxsZWQoKSkuZmluZChzID0+IHMubmFtZSA9PT0gc2VydmVyLm5hbWUpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnN0YWxsIHBlcnNpc3RzIGEgc2VydmVyIGFsbG93ZWQgYnkgcG9saWN5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCgpID0+IHRydWUpO1xuXG5cdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCBzZXJ2aWNlLmluc3RhbGwoc2VydmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9jYWwubmFtZSwgc2VydmVyLm5hbWUpO1xuXHRcdGFzc2VydC5vaygoYXdhaXQgc2VydmljZS5nZXRJbnN0YWxsZWQoKSkuc29tZShzID0+IHMubmFtZSA9PT0gc2VydmVyLm5hbWUpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQ0FBb0Msc0NBQXNDLHdDQUF3QztBQUMzSCxTQUFTLHdCQUFrTCxjQUFjLHFCQUF1QztBQUNoUCxTQUFtQyxlQUFlLDZCQUEwRTtBQUM1SCxTQUEwQixzQkFBc0I7QUFDaEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsV0FBVztBQUNwQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDBCQUEwQjtBQUduQyxNQUFNLGlDQUFpQyxtQ0FBbUM7QUFBQSxFQUExRTtBQUFBO0FBRUMsU0FBUyxxQkFBcUIsTUFBTTtBQUNwQyxTQUFTLHlCQUF5QixNQUFNO0FBQ3hDLFNBQVMsd0JBQXdCLE1BQU07QUFDdkMsU0FBUyx1QkFBdUIsTUFBTTtBQUN0QyxTQUFTLDBCQUEwQixNQUFNO0FBQUE7QUFBQSxFQUVoQyxhQUFhLGFBQStDO0FBQ3BFLFVBQU0sSUFBSSxNQUFNLHlC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TUFBSTtBQUVKLFFBQU0sU0FBZ0MsRUFBRSxNQUFNLGFBQWEsUUFBUSxFQUFFLE1BQU0sY0FBYyxPQUFPLFNBQVMsUUFBUSxNQUFNLENBQUMsRUFBRSxFQUFFO0FBRTVILFdBQVMsY0FBYyxXQUFxRjtBQUMzRyxVQUFNLDJCQUFzRCxFQUFFLGVBQWUsUUFBVyw4QkFBOEIsTUFBTSxNQUFNLFdBQVcsaUJBQWlCLE1BQU0sS0FBSztBQUN6SyxXQUFPLFlBQVksSUFBSSxJQUFJLGlDQUFpQyxhQUFhLGFBQWEsb0JBQW9CLGdCQUFnQix3QkFBd0IsQ0FBQztBQUFBLEVBQ3BKO0FBRUEsUUFBTSxNQUFNO0FBQ1gsa0JBQWMsSUFBSSxnQkFBZ0I7QUFDbEMsa0JBQWMsWUFBWSxJQUFJLElBQUksWUFBWSxJQUFJLGVBQWUsQ0FBQyxDQUFDO0FBQ25FLGdCQUFZLElBQUksWUFBWSxpQkFBaUIsUUFBUSxVQUFVLFlBQVksSUFBSSxJQUFJLDJCQUEyQixDQUFDLENBQUMsQ0FBQztBQUNqSCx5QkFBcUIsWUFBWSxJQUFJLElBQUksbUJBQW1CLFdBQVcsQ0FBQztBQUN4RSxxQkFBaUIsWUFBWSxJQUFJLElBQUksMEJBQTBCLGFBQWEsa0JBQWtCLENBQUM7QUFBQSxFQUNoRyxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsT0FBSyxrRUFBa0UsWUFBWTtBQUNsRixVQUFNLFVBQVUsY0FBYyxNQUFNLElBQUksZUFBZSxrREFBa0QsQ0FBQztBQUUxRyxVQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsUUFBUSxNQUFNLEdBQUcsOEJBQThCO0FBQ2xGLFdBQU8sYUFBYSxNQUFNLFFBQVEsYUFBYSxHQUFHLEtBQUssT0FBSyxFQUFFLFNBQVMsT0FBTyxJQUFJLEdBQUcsTUFBUztBQUFBLEVBQy9GLENBQUM7QUFFRCxPQUFLLCtDQUErQyxZQUFZO0FBQy9ELFVBQU0sVUFBVSxjQUFjLE1BQU0sSUFBSTtBQUV4QyxVQUFNLFFBQVEsTUFBTSxRQUFRLFFBQVEsTUFBTTtBQUMxQyxXQUFPLFlBQVksTUFBTSxNQUFNLE9BQU8sSUFBSTtBQUMxQyxXQUFPLElBQUksTUFBTSxRQUFRLGFBQWEsR0FBRyxLQUFLLE9BQUssRUFBRSxTQUFTLE9BQU8sSUFBSSxDQUFDO0FBQUEsRUFDM0UsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
