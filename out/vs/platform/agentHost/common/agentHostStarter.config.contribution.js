import * as nls from "../../../nls.js";
import { PolicyCategory } from "../../../base/common/policy.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../configuration/common/configurationRegistry.js";
import { COPILOT_OTEL_CAPTURE_CONTENT_KEY, COPILOT_OTEL_ENABLED_KEY, COPILOT_OTEL_ENDPOINT_KEY, COPILOT_OTEL_HEADERS_KEY, COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY, COPILOT_OTEL_PROTOCOL_KEY, COPILOT_OTEL_RESOURCE_ATTRIBUTES_KEY, COPILOT_OTEL_SERVICE_NAME_KEY, managedSettingValue } from "../../policy/common/copilotManagedSettings.js";
import product from "../../product/common/product.js";
import { Registry } from "../../registry/common/platform.js";
import {
  AgentHostByokModelsEnabledSettingId,
  AgentHostClaudeAgentEnabledSettingId,
  AgentHostClaudeMultiRootEnabledSettingId,
  AgentHostCodexAgentBinaryArgsSettingId,
  AgentHostCodexAgentEnabledSettingId,
  AgentHostCodexMultiRootEnabledSettingId,
  AgentHostCodexAgentSdkRootSettingId,
  AgentHostCodexAgentCodexHomeSettingId,
  AgentHostCopilotMultiRootEnabledSettingId,
  AgentHostOTelCaptureContentSettingId,
  AgentHostOTelDbSpanExporterEnabledSettingId,
  AgentHostOTelEnabledSettingId,
  AgentHostOTelExporterTypeSettingId,
  AgentHostOTelOtlpEndpointSettingId,
  AgentHostOTelOtlpProtocolSettingId,
  AgentHostOTelOutfileSettingId,
  AgentHostOTelResourceAttributesSettingId,
  AgentHostOTelServiceNameSettingId,
  AgentHostSystemProxyEnabledSettingId
} from "./agentService.js";
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
function managedOTelProtocolValue(policyData) {
  const protocol = policyData.managedSettings?.[COPILOT_OTEL_PROTOCOL_KEY];
  if (protocol === "grpc") {
    return "otlp-grpc";
  }
  if (protocol === "http/protobuf" || protocol === "http/json") {
    return "otlp-http";
  }
  return void 0;
}
function managedOTelCaptureContentValue(policyData) {
  const captureContent = policyData.managedSettings?.[COPILOT_OTEL_CAPTURE_CONTENT_KEY];
  if (typeof captureContent === "boolean") {
    return captureContent;
  }
  return policyData.managedSettings?.[COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY] === true ? false : void 0;
}
function managedOTelOutfileValue(policyData) {
  const managedSettings = policyData.managedSettings;
  if (managedSettings?.[COPILOT_OTEL_ENDPOINT_KEY] !== void 0 || managedSettings?.[COPILOT_OTEL_PROTOCOL_KEY] !== void 0) {
    return "";
  }
  return void 0;
}
configurationRegistry.registerConfiguration({
  id: "chatAgentHostStarter",
  title: nls.localize("chatAgentHostStarterConfigurationTitle", "Chat Agent Host Starter"),
  type: "object",
  properties: {
    [AgentHostSystemProxyEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.systemProxy.enabled", "When enabled, Copilot sessions automatically discover and use the operating system's proxy configuration when no proxy environment variable is set."),
      default: true,
      tags: ["experimental", "advanced"],
      experiment: { mode: "startup" }
    },
    [AgentHostCopilotMultiRootEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.copilotAgent.multiRootEnabled", "When enabled, Copilot agent-host sessions advertise support for multiple working directories, so a session created in a multi-root workspace can span every workspace folder. Experimental; newly created sessions pick up a change without restarting the agent host."),
      default: false,
      // Hidden from the Settings UI while the feature is dogfooded internally.
      // Still settable via `settings.json`; flip `default` (e.g. to
      // `product.quality !== 'stable'`) to enable it for a build channel.
      included: false
    },
    [AgentHostClaudeMultiRootEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.claudeAgent.multiRootEnabled", "When enabled, Claude agent-host sessions advertise support for multiple working directories, so a session created in a multi-root workspace can span every workspace folder. Experimental; newly created sessions pick up a change without restarting the agent host."),
      default: false,
      // Hidden from the Settings UI while the feature is dogfooded internally.
      // Still settable via `settings.json`; flip `default` (e.g. to
      // `product.quality !== 'stable'`) to enable it for a build channel.
      included: false
    },
    [AgentHostCodexMultiRootEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.codexAgent.multiRootEnabled", "When enabled, Codex agent-host sessions advertise support for multiple working directories, so a session created in a multi-root workspace can span every workspace folder. Experimental; newly created sessions pick up a change without restarting the agent host."),
      default: false,
      included: false
    },
    [AgentHostClaudeAgentEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.claudeAgent.enabled", "When enabled, the agent host registers the Claude provider (subject to the Claude SDK being reachable). Independent of `#chat.agents.claude.preferAgentHost#` and `#chat.editor.claude.preferAgentHost#`, which choose which integration surfaces Claude. Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect."),
      default: true,
      tags: ["experimental", "advanced"],
      // Owns the `Claude3PIntegration` policy; gating here disables Claude across all surfaces.
      // The user-facing copilot-chat setting `github.copilot.chat.claudeAgent.enabled` attaches
      // to this policy via a `policyReference` declared in the distro `product.json`. Ownership
      // lives here (not in `product.json`) so the policy can carry a `value` callback that honors
      // the account-side editor preview-features flag.
      policy: {
        name: "Claude3PIntegration",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.113",
        value: (policyData) => policyData.chat_preview_features_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.agentHost.claudeAgent.enabled.policy",
            value: nls.localize("chat.agentHost.claudeAgent.enabled.policy", "Enable Claude Agent sessions in VS Code. Start and resume agentic coding sessions powered by Anthropic Claude Agent SDK directly in the editor. Uses your existing Copilot subscription.")
          }
        }
      }
    },
    [AgentHostByokModelsEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.byokModels.enabled", "When enabled, the agent host wires up the BYOK ('bring your own key') language-model bridge so extension-provided BYOK models can run in agent-host sessions. Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect."),
      default: false,
      tags: ["experimental", "advanced"],
      experiment: { mode: "startup" }
    },
    [AgentHostCodexAgentEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.codexAgent.enabled", "When enabled, the agent host registers the Codex provider (subject to the Codex SDK being reachable). Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect."),
      default: false,
      tags: ["experimental", "advanced"],
      // Allow the default to be overridden by an experiment. Uses `startup`
      // (matching the sibling agent-host settings) since the agent host
      // process must be restarted for a change to take effect anyway.
      experiment: { mode: "startup" },
      // Owns the `Codex3PIntegration` policy; gating here disables Codex across all agent-host surfaces.
      policy: {
        name: "Codex3PIntegration",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.126",
        value: (policyData) => policyData.chat_preview_features_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.agentHost.codexAgent.enabled.policy",
            value: nls.localize("chat.agentHost.codexAgent.enabled.policy", "Enable Codex Agent sessions in VS Code. Start and resume agentic coding sessions powered by OpenAI Codex. Usage can be routed through GitHub Copilot or authenticated directly with an OpenAI account.")
          }
        }
      }
    },
    [AgentHostCodexAgentSdkRootSettingId]: {
      type: "string",
      description: nls.localize("chat.agentHost.codexAgent.sdkRoot", "Experimental, for local SDK development only. Absolute path to a directory containing `node_modules/@openai/codex`. When set, the agent host spawns the Codex binary from this tree instead of downloading the SDK. Empty (the default) falls through to the SDK distribution shipped with this build. Requires `#chat.agentHost.enabled#`. The agent host process must be restarted for changes to take effect."),
      default: "",
      tags: ["experimental", "advanced"],
      included: product.quality !== "stable"
    },
    [AgentHostCodexAgentCodexHomeSettingId]: {
      type: "string",
      description: nls.localize("chat.agentHost.codexAgent.codexHome", "Optional override for `$CODEX_HOME`. Controls where the codex binary reads config and writes rollouts. When empty, codex uses its default (`~/.codex`)."),
      default: "",
      tags: ["experimental", "advanced"],
      included: product.quality !== "stable"
    },
    [AgentHostCodexAgentBinaryArgsSettingId]: {
      type: "array",
      items: { type: "string" },
      description: nls.localize("chat.agentHost.codexAgent.binaryArgs", "Additional command-line arguments passed to `codex app-server`. Primarily useful for debugging (for example, `--log-level=debug`)."),
      default: [],
      tags: ["experimental", "advanced"],
      included: product.quality !== "stable"
    },
    [AgentHostOTelEnabledSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.otel.enabled", "When enabled, the agent host emits OpenTelemetry traces from the Copilot SDK. Configurable in user settings only. Requires `#chat.agentHost.enabled#`. Either configure `#chat.agentHost.otel.otlpEndpoint#` to ship traces to an external collector or enable `#chat.agentHost.otel.dbSpanExporter.enabled#` to capture them locally."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelEnabled`; the copilot-chat setting `github.copilot.chat.otel.enabled`
      // attaches to it via a `policyReference` in the extension's package.json.
      policy: {
        name: "CopilotOtelEnabled",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_ENABLED_KEY),
        managedSettings: {
          [COPILOT_OTEL_ENABLED_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.enabled.policy",
            value: nls.localize("chat.agentHost.otel.enabled.policy", "Controls whether Copilot OpenTelemetry export is enabled. When managed, users cannot override the enterprise value.")
          }
        }
      }
    },
    [AgentHostOTelExporterTypeSettingId]: {
      type: "string",
      enum: ["otlp-http", "otlp-grpc", "console", "file"],
      markdownDescription: nls.localize("chat.agentHost.otel.exporterType", "Exporter backend used by the Copilot SDK when `#chat.agentHost.otel.enabled#` is on. Configurable in user settings only. `otlp-grpc` is downgraded to `otlp-http` transparently in the CLI runtime."),
      default: "otlp-http",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelProtocol`; the managed `telemetry.protocol` string is mapped onto
      // the exporter type (`grpc` -> `otlp-grpc`, `http/*` -> `otlp-http`).
      policy: {
        name: "CopilotOtelProtocol",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedOTelProtocolValue,
        managedSettings: {
          [COPILOT_OTEL_PROTOCOL_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.protocol.policy",
            value: nls.localize("chat.agentHost.otel.protocol.policy", "Controls the enterprise-managed OTLP protocol for Copilot OpenTelemetry export.")
          },
          enumDescriptions: [
            { key: "chat.agentHost.otel.protocol.policy.otlpHttp", value: nls.localize("chat.agentHost.otel.protocol.policy.otlpHttp", "Use OTLP over HTTP.") },
            { key: "chat.agentHost.otel.protocol.policy.otlpGrpc", value: nls.localize("chat.agentHost.otel.protocol.policy.otlpGrpc", "Use OTLP over gRPC.") },
            { key: "chat.agentHost.otel.protocol.policy.console", value: nls.localize("chat.agentHost.otel.protocol.policy.console", "Console exporter is not selected by enterprise managed settings.") },
            { key: "chat.agentHost.otel.protocol.policy.file", value: nls.localize("chat.agentHost.otel.protocol.policy.file", "File exporter is not selected by enterprise managed settings.") }
          ]
        }
      }
    },
    [AgentHostOTelOtlpProtocolSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.otel.otlpProtocol", "Enterprise-managed OTLP wire protocol (`http/json`, `http/protobuf`, or `grpc`) for Copilot OpenTelemetry export. Policy-only: there is no user-facing setting; it carries the managed `telemetry.protocol` so the agent host's `OTEL_EXPORTER_OTLP_PROTOCOL` distinguishes protobuf from json."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      // Policy-only delivery slot — no user-writable surface (mirrors `chat.plugins.extraMarketplaces`).
      included: false,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelOtlpProtocol`; passes the raw managed `telemetry.protocol` through so the
      // starters can set `OTEL_EXPORTER_OTLP_PROTOCOL` (the `exporterType` policy only carries transport).
      policy: {
        name: "CopilotOtelOtlpProtocol",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_PROTOCOL_KEY),
        managedSettings: {
          [COPILOT_OTEL_PROTOCOL_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.otlpProtocol.policy",
            value: nls.localize("chat.agentHost.otel.otlpProtocol.policy", "Controls the enterprise-managed OTLP wire protocol (protobuf vs JSON) for Copilot OpenTelemetry export.")
          }
        }
      }
    },
    [AgentHostOTelOtlpEndpointSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.otel.otlpEndpoint", "OTLP endpoint URL when exporter type is `otlp-http` or `otlp-grpc`. Configurable in user settings only. Sets `OTEL_EXPORTER_OTLP_ENDPOINT` inside the agent host process."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelEndpoint`.
      policy: {
        name: "CopilotOtelEndpoint",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_ENDPOINT_KEY),
        managedSettings: {
          [COPILOT_OTEL_ENDPOINT_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.otlpEndpoint.policy",
            value: nls.localize("chat.agentHost.otel.otlpEndpoint.policy", "Controls the enterprise-managed OTLP collector endpoint for Copilot OpenTelemetry export.")
          }
        }
      }
    },
    [AgentHostOTelCaptureContentSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.otel.captureContent", "When enabled, includes prompt and response content in OTel span attributes. Configurable in user settings only. Sets `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`. Privacy-sensitive: do not enable in environments that ship spans to shared sinks."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelCaptureContent`; explicit managed value wins, otherwise
      // `telemetry.lockCaptureContent` forces capture off.
      policy: {
        name: "CopilotOtelCaptureContent",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedOTelCaptureContentValue,
        managedSettings: {
          [COPILOT_OTEL_CAPTURE_CONTENT_KEY]: { type: "boolean" },
          [COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.captureContent.policy",
            value: nls.localize("chat.agentHost.otel.captureContent.policy", "Controls whether Copilot OpenTelemetry export captures prompt, response, and tool content.")
          }
        }
      }
    },
    [AgentHostOTelOutfileSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.otel.outfile", "Output path for span JSON lines when exporter type is `file`. Configurable in user settings only. Sets `COPILOT_OTEL_FILE_EXPORTER_PATH`."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelOutfile`; suppresses local file export when the enterprise mandates an OTLP sink.
      policy: {
        name: "CopilotOtelOutfile",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedOTelOutfileValue,
        managedSettings: {
          [COPILOT_OTEL_ENDPOINT_KEY]: { type: "string" },
          [COPILOT_OTEL_PROTOCOL_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.outfile.policy",
            value: nls.localize("chat.agentHost.otel.outfile.policy", "Prevents local file export when enterprise-managed Copilot OpenTelemetry export is configured.")
          }
        }
      }
    },
    [AgentHostOTelDbSpanExporterEnabledSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.otel.dbSpanExporter.enabled", "When enabled, the agent host persists every emitted OTel span to a local SQLite database. Configurable in user settings only. Spans can be inspected via the `Export Agent Host Traces Database` command. Compatible with external exporters: spans are written to SQLite *and* forwarded to the user-configured sink."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [AgentHostOTelServiceNameSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.otel.serviceName", "Enterprise-managed OTel `service.name` resource attribute for Copilot OpenTelemetry export. Policy-only: there is no user-facing setting; it carries the managed `telemetry.serviceName` so the agent host's `OTEL_SERVICE_NAME` identifies spans from this deployment."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      // Policy-only delivery slot — no user-writable surface (mirrors `chat.agentHost.otel.otlpProtocol`).
      included: false,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelServiceName`; passes the raw managed `telemetry.serviceName` through so the
      // starters can set `OTEL_SERVICE_NAME` on the agent host process.
      policy: {
        name: "CopilotOtelServiceName",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_SERVICE_NAME_KEY),
        managedSettings: {
          [COPILOT_OTEL_SERVICE_NAME_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.serviceName.policy",
            value: nls.localize("chat.agentHost.otel.serviceName.policy", "Controls the enterprise-managed OTel `service.name` resource attribute for Copilot OpenTelemetry export.")
          }
        }
      }
    },
    [AgentHostOTelResourceAttributesSettingId]: {
      // Policy-only delivery slot — no user-writable surface (mirrors `chat.plugins.extraMarketplaces`).
      // Carried as a `{ [key]: string }` object; the starters serialize it into `OTEL_RESOURCE_ATTRIBUTES`.
      type: "object",
      additionalProperties: { type: ["string"] },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      included: false,
      tags: ["experimental", "advanced"],
      markdownDescription: nls.localize("chat.agentHost.otel.resourceAttributes", "Enterprise-managed OTel resource attributes for Copilot OpenTelemetry export. Policy-only: there is no user-facing setting; it carries the managed `telemetry.resourceAttributes` map so the agent host's `OTEL_RESOURCE_ATTRIBUTES` includes the deployment's attributes."),
      policy: {
        name: "CopilotOtelResourceAttributes",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_RESOURCE_ATTRIBUTES_KEY),
        managedSettings: {
          [COPILOT_OTEL_RESOURCE_ATTRIBUTES_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.resourceAttributes.policy",
            value: nls.localize("chat.agentHost.otel.resourceAttributes.policy", "Controls the enterprise-managed OTel resource attributes for Copilot OpenTelemetry export.")
          }
        }
      }
    },
    // Extension-only policy delivery slot for managed OTLP exporter headers (e.g. auth tokens).
    // Deliberately NOT delivered to the agent host: headers would have to travel via env vars,
    // which the agent host leaks into the tool subprocesses it spawns, exposing the secret. The
    // Copilot Chat extension applies these headers directly to its OTLP exporter instead.
    ["chat.agentHost.otel.headers"]: {
      type: "object",
      additionalProperties: { type: ["string"] },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      included: false,
      tags: ["experimental", "advanced"],
      markdownDescription: nls.localize("chat.agentHost.otel.headers", "Enterprise-managed OTLP exporter headers (e.g. auth tokens) for Copilot OpenTelemetry export. Policy-only and extension-only: applied directly to the Copilot Chat extension's OTLP exporter, never delivered to the agent host process."),
      policy: {
        name: "CopilotOtelHeaders",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_HEADERS_KEY),
        managedSettings: {
          [COPILOT_OTEL_HEADERS_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.headers.policy",
            value: nls.localize("chat.agentHost.otel.headers.policy", "Controls the enterprise-managed OTLP exporter headers for Copilot OpenTelemetry export.")
          }
        }
      }
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0U3RhcnRlci5jb25maWcuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUG9saWN5RGF0YSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX09URUxfQ0FQVFVSRV9DT05URU5UX0tFWSwgQ09QSUxPVF9PVEVMX0VOQUJMRURfS0VZLCBDT1BJTE9UX09URUxfRU5EUE9JTlRfS0VZLCBDT1BJTE9UX09URUxfSEVBREVSU19LRVksIENPUElMT1RfT1RFTF9MT0NLX0NBUFRVUkVfQ09OVEVOVF9LRVksIENPUElMT1RfT1RFTF9QUk9UT0NPTF9LRVksIENPUElMT1RfT1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTX0tFWSwgQ09QSUxPVF9PVEVMX1NFUlZJQ0VfTkFNRV9LRVksIG1hbmFnZWRTZXR0aW5nVmFsdWUgfSBmcm9tICcuLi8uLi9wb2xpY3kvY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudEhvc3RCeW9rTW9kZWxzRW5hYmxlZFNldHRpbmdJZCxcblx0QWdlbnRIb3N0Q2xhdWRlQWdlbnRFbmFibGVkU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RDb2RleEFnZW50QmluYXJ5QXJnc1NldHRpbmdJZCxcblx0QWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZCxcblx0QWdlbnRIb3N0Q29kZXhBZ2VudFNka1Jvb3RTZXR0aW5nSWQsXG5cdEFnZW50SG9zdENvZGV4QWdlbnRDb2RleEhvbWVTZXR0aW5nSWQsXG5cdEFnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RPVGVsQ2FwdHVyZUNvbnRlbnRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdE9UZWxEYlNwYW5FeHBvcnRlckVuYWJsZWRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdE9UZWxFbmFibGVkU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RPVGVsRXhwb3J0ZXJUeXBlU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RPVGVsT3RscEVuZHBvaW50U2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RPVGVsT3RscFByb3RvY29sU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RPVGVsT3V0ZmlsZVNldHRpbmdJZCxcblx0QWdlbnRIb3N0T1RlbFJlc291cmNlQXR0cmlidXRlc1NldHRpbmdJZCxcblx0QWdlbnRIb3N0T1RlbFNlcnZpY2VOYW1lU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRTZXR0aW5nSWQsXG59IGZyb20gJy4vYWdlbnRTZXJ2aWNlLmpzJztcblxuLy8gU2V0dGluZ3MgY29uc3VtZWQgYnkgdGhlIGFnZW50IGhvc3Qgc3RhcnRlciAoYGVsZWN0cm9uQWdlbnRIb3N0U3RhcnRlci50c2Bcbi8vIGFuZCBgbm9kZUFnZW50SG9zdFN0YXJ0ZXIudHNgKSB0byBwb3B1bGF0ZSB0aGUgc3Bhd25lZCBhZ2VudCBob3N0IHByb2Nlc3Mnc1xuLy8gZW52aXJvbm1lbnQuIFRoZSBzdGFydGVyIGV4aXN0cyBpbiBib3RoIHRoZSBkZXNrdG9wIG1haW4gcHJvY2VzcyBhbmQgdGhlXG4vLyByZW1vdGUgc2VydmVyIHByb2Nlc3MsIHNvIHRoaXMgcmVnaXN0cmF0aW9uIGhhcyB0byBiZSB2aXNpYmxlIHRvIGJvdGggXHUyMDE0XG4vLyBlYWNoIHN0YXJ0ZXIgZmlsZSBzaWRlLWVmZmVjdC1pbXBvcnRzIHRoaXMgY29udHJpYnV0aW9uLCB3aGljaCBjYXVzZXMgdGhlXG4vLyByZWdpc3RyYXRpb24gdG8gcnVuIGFzIHNvb24gYXMgdGhlIHN0YXJ0ZXIgbW9kdWxlIGlzIGxvYWRlZC4gVGhlIHJlbmRlcmVyXG4vLyBhbHNvIGltcG9ydHMgdGhpcyBzbyB0aGUgc2FtZSBkZWZhdWx0cyBzaG93IHVwIGluIHRoZSBzZXR0aW5ncyBVSS5cbi8vXG4vLyBTaWRlLWVmZmVjdCBpbXBvcnRzIG9mIHRoaXMgZmlsZTpcbi8vICAgLSBgc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9lbGVjdHJvbi1tYWluL2VsZWN0cm9uQWdlbnRIb3N0U3RhcnRlci50c2Bcbi8vICAgICAobWFpbiBwcm9jZXNzLCBsb2FkZWQgdHJhbnNpdGl2ZWx5IGZyb20gYGFwcC50c2ApLlxuLy8gICAtIGBzcmMvdnMvcGxhdGZvcm0vYWdlbnRIb3N0L25vZGUvbm9kZUFnZW50SG9zdFN0YXJ0ZXIudHNgXG4vLyAgICAgKHJlbW90ZSBzZXJ2ZXIsIGxvYWRlZCB0cmFuc2l0aXZlbHkgZnJvbSBgc2VydmVyU2VydmljZXMudHNgKS5cbi8vICAgLSBgc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LnNoYXJlZC5jb250cmlidXRpb24udHNgXG4vLyAgICAgKHJlbmRlcmVyIHJlZ2lzdHJhdGlvbiBmb3IgdGhlIHNldHRpbmdzIFVJKS5cblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cbi8vIEN1c3RvbSBtYW5hZ2VkLXNldHRpbmdzIHJlc29sdmVycyBmb3IgdGhlIGVudGVycHJpc2UgT1RlbCBwb2xpY2llcy4gVGhlIHNpbXBsZSBwYXNzLXRocm91Z2hcbi8vIGtleXMgdXNlIGBtYW5hZ2VkU2V0dGluZ1ZhbHVlKEtFWSlgOyB0aGVzZSB0aHJlZSBjb21iaW5lIG9yIHRyYW5zZm9ybSB0aGUgbWFuYWdlZCB2YWx1ZTpcbi8vICAgLSBwcm90b2NvbDogdGhlIHNjaGVtYSdzIE9UTFAgcHJvdG9jb2wgc3RyaW5nIG1hcHMgb250byB0aGUgYWdlbnQtaG9zdCBleHBvcnRlciB0eXBlLlxuLy8gICAtIGNhcHR1cmVDb250ZW50OiBleHBsaWNpdCBib29sZWFuIHdpbnM7IG90aGVyd2lzZSBgbG9ja0NhcHR1cmVDb250ZW50YCBmb3JjZXMgaXQgb2ZmLlxuLy8gICAtIG91dGZpbGU6IHdoZW4gdGhlIGVudGVycHJpc2UgbWFuZGF0ZXMgYW4gT1RMUCBlbmRwb2ludC9wcm90b2NvbCwgbG9jYWwgZmlsZSBleHBvcnQgaXNcbi8vICAgICBzdXBwcmVzc2VkIHNvIHNwYW5zIGNhbid0IGJlIGRpdmVydGVkIHRvIGRpc2suXG5mdW5jdGlvbiBtYW5hZ2VkT1RlbFByb3RvY29sVmFsdWUocG9saWN5RGF0YTogSVBvbGljeURhdGEpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBwcm90b2NvbCA9IHBvbGljeURhdGEubWFuYWdlZFNldHRpbmdzPy5bQ09QSUxPVF9PVEVMX1BST1RPQ09MX0tFWV07XG5cdGlmIChwcm90b2NvbCA9PT0gJ2dycGMnKSB7XG5cdFx0cmV0dXJuICdvdGxwLWdycGMnO1xuXHR9XG5cdGlmIChwcm90b2NvbCA9PT0gJ2h0dHAvcHJvdG9idWYnIHx8IHByb3RvY29sID09PSAnaHR0cC9qc29uJykge1xuXHRcdHJldHVybiAnb3RscC1odHRwJztcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBtYW5hZ2VkT1RlbENhcHR1cmVDb250ZW50VmFsdWUocG9saWN5RGF0YTogSVBvbGljeURhdGEpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2FwdHVyZUNvbnRlbnQgPSBwb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncz8uW0NPUElMT1RfT1RFTF9DQVBUVVJFX0NPTlRFTlRfS0VZXTtcblx0aWYgKHR5cGVvZiBjYXB0dXJlQ29udGVudCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0cmV0dXJuIGNhcHR1cmVDb250ZW50O1xuXHR9XG5cdHJldHVybiBwb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncz8uW0NPUElMT1RfT1RFTF9MT0NLX0NBUFRVUkVfQ09OVEVOVF9LRVldID09PSB0cnVlID8gZmFsc2UgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIG1hbmFnZWRPVGVsT3V0ZmlsZVZhbHVlKHBvbGljeURhdGE6IElQb2xpY3lEYXRhKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWFuYWdlZFNldHRpbmdzID0gcG9saWN5RGF0YS5tYW5hZ2VkU2V0dGluZ3M7XG5cdGlmIChtYW5hZ2VkU2V0dGluZ3M/LltDT1BJTE9UX09URUxfRU5EUE9JTlRfS0VZXSAhPT0gdW5kZWZpbmVkIHx8IG1hbmFnZWRTZXR0aW5ncz8uW0NPUElMT1RfT1RFTF9QUk9UT0NPTF9LRVldICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnY2hhdEFnZW50SG9zdFN0YXJ0ZXInLFxuXHR0aXRsZTogbmxzLmxvY2FsaXplKCdjaGF0QWdlbnRIb3N0U3RhcnRlckNvbmZpZ3VyYXRpb25UaXRsZScsIFwiQ2hhdCBBZ2VudCBIb3N0IFN0YXJ0ZXJcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W0FnZW50SG9zdFN5c3RlbVByb3h5RW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LnN5c3RlbVByb3h5LmVuYWJsZWQnLCBcIldoZW4gZW5hYmxlZCwgQ29waWxvdCBzZXNzaW9ucyBhdXRvbWF0aWNhbGx5IGRpc2NvdmVyIGFuZCB1c2UgdGhlIG9wZXJhdGluZyBzeXN0ZW0ncyBwcm94eSBjb25maWd1cmF0aW9uIHdoZW4gbm8gcHJveHkgZW52aXJvbm1lbnQgdmFyaWFibGUgaXMgc2V0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvcGlsb3RBZ2VudC5tdWx0aVJvb3RFbmFibGVkJywgXCJXaGVuIGVuYWJsZWQsIENvcGlsb3QgYWdlbnQtaG9zdCBzZXNzaW9ucyBhZHZlcnRpc2Ugc3VwcG9ydCBmb3IgbXVsdGlwbGUgd29ya2luZyBkaXJlY3Rvcmllcywgc28gYSBzZXNzaW9uIGNyZWF0ZWQgaW4gYSBtdWx0aS1yb290IHdvcmtzcGFjZSBjYW4gc3BhbiBldmVyeSB3b3Jrc3BhY2UgZm9sZGVyLiBFeHBlcmltZW50YWw7IG5ld2x5IGNyZWF0ZWQgc2Vzc2lvbnMgcGljayB1cCBhIGNoYW5nZSB3aXRob3V0IHJlc3RhcnRpbmcgdGhlIGFnZW50IGhvc3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHQvLyBIaWRkZW4gZnJvbSB0aGUgU2V0dGluZ3MgVUkgd2hpbGUgdGhlIGZlYXR1cmUgaXMgZG9nZm9vZGVkIGludGVybmFsbHkuXG5cdFx0XHQvLyBTdGlsbCBzZXR0YWJsZSB2aWEgYHNldHRpbmdzLmpzb25gOyBmbGlwIGBkZWZhdWx0YCAoZS5nLiB0b1xuXHRcdFx0Ly8gYHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZSdgKSB0byBlbmFibGUgaXQgZm9yIGEgYnVpbGQgY2hhbm5lbC5cblx0XHRcdGluY2x1ZGVkOiBmYWxzZSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY2xhdWRlQWdlbnQubXVsdGlSb290RW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCBDbGF1ZGUgYWdlbnQtaG9zdCBzZXNzaW9ucyBhZHZlcnRpc2Ugc3VwcG9ydCBmb3IgbXVsdGlwbGUgd29ya2luZyBkaXJlY3Rvcmllcywgc28gYSBzZXNzaW9uIGNyZWF0ZWQgaW4gYSBtdWx0aS1yb290IHdvcmtzcGFjZSBjYW4gc3BhbiBldmVyeSB3b3Jrc3BhY2UgZm9sZGVyLiBFeHBlcmltZW50YWw7IG5ld2x5IGNyZWF0ZWQgc2Vzc2lvbnMgcGljayB1cCBhIGNoYW5nZSB3aXRob3V0IHJlc3RhcnRpbmcgdGhlIGFnZW50IGhvc3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHQvLyBIaWRkZW4gZnJvbSB0aGUgU2V0dGluZ3MgVUkgd2hpbGUgdGhlIGZlYXR1cmUgaXMgZG9nZm9vZGVkIGludGVybmFsbHkuXG5cdFx0XHQvLyBTdGlsbCBzZXR0YWJsZSB2aWEgYHNldHRpbmdzLmpzb25gOyBmbGlwIGBkZWZhdWx0YCAoZS5nLiB0b1xuXHRcdFx0Ly8gYHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZSdgKSB0byBlbmFibGUgaXQgZm9yIGEgYnVpbGQgY2hhbm5lbC5cblx0XHRcdGluY2x1ZGVkOiBmYWxzZSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb2RleEFnZW50Lm11bHRpUm9vdEVuYWJsZWQnLCBcIldoZW4gZW5hYmxlZCwgQ29kZXggYWdlbnQtaG9zdCBzZXNzaW9ucyBhZHZlcnRpc2Ugc3VwcG9ydCBmb3IgbXVsdGlwbGUgd29ya2luZyBkaXJlY3Rvcmllcywgc28gYSBzZXNzaW9uIGNyZWF0ZWQgaW4gYSBtdWx0aS1yb290IHdvcmtzcGFjZSBjYW4gc3BhbiBldmVyeSB3b3Jrc3BhY2UgZm9sZGVyLiBFeHBlcmltZW50YWw7IG5ld2x5IGNyZWF0ZWQgc2Vzc2lvbnMgcGljayB1cCBhIGNoYW5nZSB3aXRob3V0IHJlc3RhcnRpbmcgdGhlIGFnZW50IGhvc3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0Q2xhdWRlQWdlbnRFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY2xhdWRlQWdlbnQuZW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCB0aGUgYWdlbnQgaG9zdCByZWdpc3RlcnMgdGhlIENsYXVkZSBwcm92aWRlciAoc3ViamVjdCB0byB0aGUgQ2xhdWRlIFNESyBiZWluZyByZWFjaGFibGUpLiBJbmRlcGVuZGVudCBvZiBgI2NoYXQuYWdlbnRzLmNsYXVkZS5wcmVmZXJBZ2VudEhvc3QjYCBhbmQgYCNjaGF0LmVkaXRvci5jbGF1ZGUucHJlZmVyQWdlbnRIb3N0I2AsIHdoaWNoIGNob29zZSB3aGljaCBpbnRlZ3JhdGlvbiBzdXJmYWNlcyBDbGF1ZGUuIFJlcXVpcmVzIGAjY2hhdC5hZ2VudEhvc3QuZW5hYmxlZCNgLiBUaGUgYWdlbnQgaG9zdCBwcm9jZXNzIG11c3QgYmUgcmVzdGFydGVkIGZvciBjaGFuZ2VzIHRvIHRha2UgZWZmZWN0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gT3ducyB0aGUgYENsYXVkZTNQSW50ZWdyYXRpb25gIHBvbGljeTsgZ2F0aW5nIGhlcmUgZGlzYWJsZXMgQ2xhdWRlIGFjcm9zcyBhbGwgc3VyZmFjZXMuXG5cdFx0XHQvLyBUaGUgdXNlci1mYWNpbmcgY29waWxvdC1jaGF0IHNldHRpbmcgYGdpdGh1Yi5jb3BpbG90LmNoYXQuY2xhdWRlQWdlbnQuZW5hYmxlZGAgYXR0YWNoZXNcblx0XHRcdC8vIHRvIHRoaXMgcG9saWN5IHZpYSBhIGBwb2xpY3lSZWZlcmVuY2VgIGRlY2xhcmVkIGluIHRoZSBkaXN0cm8gYHByb2R1Y3QuanNvbmAuIE93bmVyc2hpcFxuXHRcdFx0Ly8gbGl2ZXMgaGVyZSAobm90IGluIGBwcm9kdWN0Lmpzb25gKSBzbyB0aGUgcG9saWN5IGNhbiBjYXJyeSBhIGB2YWx1ZWAgY2FsbGJhY2sgdGhhdCBob25vcnNcblx0XHRcdC8vIHRoZSBhY2NvdW50LXNpZGUgZWRpdG9yIHByZXZpZXctZmVhdHVyZXMgZmxhZy5cblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ2xhdWRlM1BJbnRlZ3JhdGlvbicsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMTMnLFxuXHRcdFx0XHR2YWx1ZTogKHBvbGljeURhdGEpID0+IHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPT09IGZhbHNlID8gZmFsc2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5jbGF1ZGVBZ2VudC5lbmFibGVkLnBvbGljeScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jbGF1ZGVBZ2VudC5lbmFibGVkLnBvbGljeScsIFwiRW5hYmxlIENsYXVkZSBBZ2VudCBzZXNzaW9ucyBpbiBWUyBDb2RlLiBTdGFydCBhbmQgcmVzdW1lIGFnZW50aWMgY29kaW5nIHNlc3Npb25zIHBvd2VyZWQgYnkgQW50aHJvcGljIENsYXVkZSBBZ2VudCBTREsgZGlyZWN0bHkgaW4gdGhlIGVkaXRvci4gVXNlcyB5b3VyIGV4aXN0aW5nIENvcGlsb3Qgc3Vic2NyaXB0aW9uLlwiKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0Qnlva01vZGVsc0VuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5ieW9rTW9kZWxzLmVuYWJsZWQnLCBcIldoZW4gZW5hYmxlZCwgdGhlIGFnZW50IGhvc3Qgd2lyZXMgdXAgdGhlIEJZT0sgKCdicmluZyB5b3VyIG93biBrZXknKSBsYW5ndWFnZS1tb2RlbCBicmlkZ2Ugc28gZXh0ZW5zaW9uLXByb3ZpZGVkIEJZT0sgbW9kZWxzIGNhbiBydW4gaW4gYWdlbnQtaG9zdCBzZXNzaW9ucy4gUmVxdWlyZXMgYCNjaGF0LmFnZW50SG9zdC5lbmFibGVkI2AuIFRoZSBhZ2VudCBob3N0IHByb2Nlc3MgbXVzdCBiZSByZXN0YXJ0ZWQgZm9yIGNoYW5nZXMgdG8gdGFrZSBlZmZlY3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQuZW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCB0aGUgYWdlbnQgaG9zdCByZWdpc3RlcnMgdGhlIENvZGV4IHByb3ZpZGVyIChzdWJqZWN0IHRvIHRoZSBDb2RleCBTREsgYmVpbmcgcmVhY2hhYmxlKS4gUmVxdWlyZXMgYCNjaGF0LmFnZW50SG9zdC5lbmFibGVkI2AuIFRoZSBhZ2VudCBob3N0IHByb2Nlc3MgbXVzdCBiZSByZXN0YXJ0ZWQgZm9yIGNoYW5nZXMgdG8gdGFrZSBlZmZlY3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gQWxsb3cgdGhlIGRlZmF1bHQgdG8gYmUgb3ZlcnJpZGRlbiBieSBhbiBleHBlcmltZW50LiBVc2VzIGBzdGFydHVwYFxuXHRcdFx0Ly8gKG1hdGNoaW5nIHRoZSBzaWJsaW5nIGFnZW50LWhvc3Qgc2V0dGluZ3MpIHNpbmNlIHRoZSBhZ2VudCBob3N0XG5cdFx0XHQvLyBwcm9jZXNzIG11c3QgYmUgcmVzdGFydGVkIGZvciBhIGNoYW5nZSB0byB0YWtlIGVmZmVjdCBhbnl3YXkuXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdzdGFydHVwJyB9LFxuXHRcdFx0Ly8gT3ducyB0aGUgYENvZGV4M1BJbnRlZ3JhdGlvbmAgcG9saWN5OyBnYXRpbmcgaGVyZSBkaXNhYmxlcyBDb2RleCBhY3Jvc3MgYWxsIGFnZW50LWhvc3Qgc3VyZmFjZXMuXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NvZGV4M1BJbnRlZ3JhdGlvbicsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjYnLFxuXHRcdFx0XHR2YWx1ZTogKHBvbGljeURhdGEpID0+IHBvbGljeURhdGEuY2hhdF9wcmV2aWV3X2ZlYXR1cmVzX2VuYWJsZWQgPT09IGZhbHNlID8gZmFsc2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5jb2RleEFnZW50LmVuYWJsZWQucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQuZW5hYmxlZC5wb2xpY3knLCBcIkVuYWJsZSBDb2RleCBBZ2VudCBzZXNzaW9ucyBpbiBWUyBDb2RlLiBTdGFydCBhbmQgcmVzdW1lIGFnZW50aWMgY29kaW5nIHNlc3Npb25zIHBvd2VyZWQgYnkgT3BlbkFJIENvZGV4LiBVc2FnZSBjYW4gYmUgcm91dGVkIHRocm91Z2ggR2l0SHViIENvcGlsb3Qgb3IgYXV0aGVudGljYXRlZCBkaXJlY3RseSB3aXRoIGFuIE9wZW5BSSBhY2NvdW50LlwiKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0Q29kZXhBZ2VudFNka1Jvb3RTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQuc2RrUm9vdCcsIFwiRXhwZXJpbWVudGFsLCBmb3IgbG9jYWwgU0RLIGRldmVsb3BtZW50IG9ubHkuIEFic29sdXRlIHBhdGggdG8gYSBkaXJlY3RvcnkgY29udGFpbmluZyBgbm9kZV9tb2R1bGVzL0BvcGVuYWkvY29kZXhgLiBXaGVuIHNldCwgdGhlIGFnZW50IGhvc3Qgc3Bhd25zIHRoZSBDb2RleCBiaW5hcnkgZnJvbSB0aGlzIHRyZWUgaW5zdGVhZCBvZiBkb3dubG9hZGluZyB0aGUgU0RLLiBFbXB0eSAodGhlIGRlZmF1bHQpIGZhbGxzIHRocm91Z2ggdG8gdGhlIFNESyBkaXN0cmlidXRpb24gc2hpcHBlZCB3aXRoIHRoaXMgYnVpbGQuIFJlcXVpcmVzIGAjY2hhdC5hZ2VudEhvc3QuZW5hYmxlZCNgLiBUaGUgYWdlbnQgaG9zdCBwcm9jZXNzIG11c3QgYmUgcmVzdGFydGVkIGZvciBjaGFuZ2VzIHRvIHRha2UgZWZmZWN0LlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGluY2x1ZGVkOiBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdENvZGV4QWdlbnRDb2RleEhvbWVTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQuY29kZXhIb21lJywgXCJPcHRpb25hbCBvdmVycmlkZSBmb3IgYCRDT0RFWF9IT01FYC4gQ29udHJvbHMgd2hlcmUgdGhlIGNvZGV4IGJpbmFyeSByZWFkcyBjb25maWcgYW5kIHdyaXRlcyByb2xsb3V0cy4gV2hlbiBlbXB0eSwgY29kZXggdXNlcyBpdHMgZGVmYXVsdCAoYH4vLmNvZGV4YCkuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0aW5jbHVkZWQ6IHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZScsXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0Q29kZXhBZ2VudEJpbmFyeUFyZ3NTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQuYmluYXJ5QXJncycsIFwiQWRkaXRpb25hbCBjb21tYW5kLWxpbmUgYXJndW1lbnRzIHBhc3NlZCB0byBgY29kZXggYXBwLXNlcnZlcmAuIFByaW1hcmlseSB1c2VmdWwgZm9yIGRlYnVnZ2luZyAoZm9yIGV4YW1wbGUsIGAtLWxvZy1sZXZlbD1kZWJ1Z2ApLlwiKSxcblx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGluY2x1ZGVkOiBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdE9UZWxFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLmVuYWJsZWQnLCBcIldoZW4gZW5hYmxlZCwgdGhlIGFnZW50IGhvc3QgZW1pdHMgT3BlblRlbGVtZXRyeSB0cmFjZXMgZnJvbSB0aGUgQ29waWxvdCBTREsuIENvbmZpZ3VyYWJsZSBpbiB1c2VyIHNldHRpbmdzIG9ubHkuIFJlcXVpcmVzIGAjY2hhdC5hZ2VudEhvc3QuZW5hYmxlZCNgLiBFaXRoZXIgY29uZmlndXJlIGAjY2hhdC5hZ2VudEhvc3Qub3RlbC5vdGxwRW5kcG9pbnQjYCB0byBzaGlwIHRyYWNlcyB0byBhbiBleHRlcm5hbCBjb2xsZWN0b3Igb3IgZW5hYmxlIGAjY2hhdC5hZ2VudEhvc3Qub3RlbC5kYlNwYW5FeHBvcnRlci5lbmFibGVkI2AgdG8gY2FwdHVyZSB0aGVtIGxvY2FsbHkuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdC8vIE93bnMgYENvcGlsb3RPdGVsRW5hYmxlZGA7IHRoZSBjb3BpbG90LWNoYXQgc2V0dGluZyBgZ2l0aHViLmNvcGlsb3QuY2hhdC5vdGVsLmVuYWJsZWRgXG5cdFx0XHQvLyBhdHRhY2hlcyB0byBpdCB2aWEgYSBgcG9saWN5UmVmZXJlbmNlYCBpbiB0aGUgZXh0ZW5zaW9uJ3MgcGFja2FnZS5qc29uLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbEVuYWJsZWQnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTI3Jyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9PVEVMX0VOQUJMRURfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9FTkFCTEVEX0tFWV06IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLmVuYWJsZWQucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuZW5hYmxlZC5wb2xpY3knLCBcIkNvbnRyb2xzIHdoZXRoZXIgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydCBpcyBlbmFibGVkLiBXaGVuIG1hbmFnZWQsIHVzZXJzIGNhbm5vdCBvdmVycmlkZSB0aGUgZW50ZXJwcmlzZSB2YWx1ZS5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsRXhwb3J0ZXJUeXBlU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ290bHAtaHR0cCcsICdvdGxwLWdycGMnLCAnY29uc29sZScsICdmaWxlJ10sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuZXhwb3J0ZXJUeXBlJywgXCJFeHBvcnRlciBiYWNrZW5kIHVzZWQgYnkgdGhlIENvcGlsb3QgU0RLIHdoZW4gYCNjaGF0LmFnZW50SG9zdC5vdGVsLmVuYWJsZWQjYCBpcyBvbi4gQ29uZmlndXJhYmxlIGluIHVzZXIgc2V0dGluZ3Mgb25seS4gYG90bHAtZ3JwY2AgaXMgZG93bmdyYWRlZCB0byBgb3RscC1odHRwYCB0cmFuc3BhcmVudGx5IGluIHRoZSBDTEkgcnVudGltZS5cIiksXG5cdFx0XHRkZWZhdWx0OiAnb3RscC1odHRwJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gT3ducyBgQ29waWxvdE90ZWxQcm90b2NvbGA7IHRoZSBtYW5hZ2VkIGB0ZWxlbWV0cnkucHJvdG9jb2xgIHN0cmluZyBpcyBtYXBwZWQgb250b1xuXHRcdFx0Ly8gdGhlIGV4cG9ydGVyIHR5cGUgKGBncnBjYCAtPiBgb3RscC1ncnBjYCwgYGh0dHAvKmAgLT4gYG90bHAtaHR0cGApLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbFByb3RvY29sJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNycsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkT1RlbFByb3RvY29sVmFsdWUsXG5cdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfUFJPVE9DT0xfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3knLCBcIkNvbnRyb2xzIHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgT1RMUCBwcm90b2NvbCBmb3IgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydC5cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwucHJvdG9jb2wucG9saWN5Lm90bHBIdHRwJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3kub3RscEh0dHAnLCBcIlVzZSBPVExQIG92ZXIgSFRUUC5cIiksIH0sXG5cdFx0XHRcdFx0XHR7IGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwucHJvdG9jb2wucG9saWN5Lm90bHBHcnBjJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3kub3RscEdycGMnLCBcIlVzZSBPVExQIG92ZXIgZ1JQQy5cIiksIH0sXG5cdFx0XHRcdFx0XHR7IGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwucHJvdG9jb2wucG9saWN5LmNvbnNvbGUnLCB2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLnByb3RvY29sLnBvbGljeS5jb25zb2xlJywgXCJDb25zb2xlIGV4cG9ydGVyIGlzIG5vdCBzZWxlY3RlZCBieSBlbnRlcnByaXNlIG1hbmFnZWQgc2V0dGluZ3MuXCIpLCB9LFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLnByb3RvY29sLnBvbGljeS5maWxlJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3kuZmlsZScsIFwiRmlsZSBleHBvcnRlciBpcyBub3Qgc2VsZWN0ZWQgYnkgZW50ZXJwcmlzZSBtYW5hZ2VkIHNldHRpbmdzLlwiKSwgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsT3RscFByb3RvY29sU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm90ZWwub3RscFByb3RvY29sJywgXCJFbnRlcnByaXNlLW1hbmFnZWQgT1RMUCB3aXJlIHByb3RvY29sIChgaHR0cC9qc29uYCwgYGh0dHAvcHJvdG9idWZgLCBvciBgZ3JwY2ApIGZvciBDb3BpbG90IE9wZW5UZWxlbWV0cnkgZXhwb3J0LiBQb2xpY3ktb25seTogdGhlcmUgaXMgbm8gdXNlci1mYWNpbmcgc2V0dGluZzsgaXQgY2FycmllcyB0aGUgbWFuYWdlZCBgdGVsZW1ldHJ5LnByb3RvY29sYCBzbyB0aGUgYWdlbnQgaG9zdCdzIGBPVEVMX0VYUE9SVEVSX09UTFBfUFJPVE9DT0xgIGRpc3Rpbmd1aXNoZXMgcHJvdG9idWYgZnJvbSBqc29uLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdC8vIFBvbGljeS1vbmx5IGRlbGl2ZXJ5IHNsb3QgXHUyMDE0IG5vIHVzZXItd3JpdGFibGUgc3VyZmFjZSAobWlycm9ycyBgY2hhdC5wbHVnaW5zLmV4dHJhTWFya2V0cGxhY2VzYCkuXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gT3ducyBgQ29waWxvdE90ZWxPdGxwUHJvdG9jb2xgOyBwYXNzZXMgdGhlIHJhdyBtYW5hZ2VkIGB0ZWxlbWV0cnkucHJvdG9jb2xgIHRocm91Z2ggc28gdGhlXG5cdFx0XHQvLyBzdGFydGVycyBjYW4gc2V0IGBPVEVMX0VYUE9SVEVSX09UTFBfUFJPVE9DT0xgICh0aGUgYGV4cG9ydGVyVHlwZWAgcG9saWN5IG9ubHkgY2FycmllcyB0cmFuc3BvcnQpLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbE90bHBQcm90b2NvbCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZFNldHRpbmdWYWx1ZShDT1BJTE9UX09URUxfUFJPVE9DT0xfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9QUk9UT0NPTF9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLm90bHBQcm90b2NvbC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdGxwUHJvdG9jb2wucG9saWN5JywgXCJDb250cm9scyB0aGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE9UTFAgd2lyZSBwcm90b2NvbCAocHJvdG9idWYgdnMgSlNPTikgZm9yIENvcGlsb3QgT3BlblRlbGVtZXRyeSBleHBvcnQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0T1RlbE90bHBFbmRwb2ludFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLm90bHBFbmRwb2ludCcsIFwiT1RMUCBlbmRwb2ludCBVUkwgd2hlbiBleHBvcnRlciB0eXBlIGlzIGBvdGxwLWh0dHBgIG9yIGBvdGxwLWdycGNgLiBDb25maWd1cmFibGUgaW4gdXNlciBzZXR0aW5ncyBvbmx5LiBTZXRzIGBPVEVMX0VYUE9SVEVSX09UTFBfRU5EUE9JTlRgIGluc2lkZSB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHQvLyBPd25zIGBDb3BpbG90T3RlbEVuZHBvaW50YC5cblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ29waWxvdE90ZWxFbmRwb2ludCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZFNldHRpbmdWYWx1ZShDT1BJTE9UX09URUxfRU5EUE9JTlRfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9FTkRQT0lOVF9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLm90bHBFbmRwb2ludC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdGxwRW5kcG9pbnQucG9saWN5JywgXCJDb250cm9scyB0aGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE9UTFAgY29sbGVjdG9yIGVuZHBvaW50IGZvciBDb3BpbG90IE9wZW5UZWxlbWV0cnkgZXhwb3J0LlwiKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdE9UZWxDYXB0dXJlQ29udGVudFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5jYXB0dXJlQ29udGVudCcsIFwiV2hlbiBlbmFibGVkLCBpbmNsdWRlcyBwcm9tcHQgYW5kIHJlc3BvbnNlIGNvbnRlbnQgaW4gT1RlbCBzcGFuIGF0dHJpYnV0ZXMuIENvbmZpZ3VyYWJsZSBpbiB1c2VyIHNldHRpbmdzIG9ubHkuIFNldHMgYE9URUxfSU5TVFJVTUVOVEFUSU9OX0dFTkFJX0NBUFRVUkVfTUVTU0FHRV9DT05URU5UYC4gUHJpdmFjeS1zZW5zaXRpdmU6IGRvIG5vdCBlbmFibGUgaW4gZW52aXJvbm1lbnRzIHRoYXQgc2hpcCBzcGFucyB0byBzaGFyZWQgc2lua3MuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdC8vIE93bnMgYENvcGlsb3RPdGVsQ2FwdHVyZUNvbnRlbnRgOyBleHBsaWNpdCBtYW5hZ2VkIHZhbHVlIHdpbnMsIG90aGVyd2lzZVxuXHRcdFx0Ly8gYHRlbGVtZXRyeS5sb2NrQ2FwdHVyZUNvbnRlbnRgIGZvcmNlcyBjYXB0dXJlIG9mZi5cblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ29waWxvdE90ZWxDYXB0dXJlQ29udGVudCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZE9UZWxDYXB0dXJlQ29udGVudFZhbHVlLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9PVEVMX0NBUFRVUkVfQ09OVEVOVF9LRVldOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfTE9DS19DQVBUVVJFX0NPTlRFTlRfS0VZXTogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuY2FwdHVyZUNvbnRlbnQucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuY2FwdHVyZUNvbnRlbnQucG9saWN5JywgXCJDb250cm9scyB3aGV0aGVyIENvcGlsb3QgT3BlblRlbGVtZXRyeSBleHBvcnQgY2FwdHVyZXMgcHJvbXB0LCByZXNwb25zZSwgYW5kIHRvb2wgY29udGVudC5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsT3V0ZmlsZVNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLm91dGZpbGUnLCBcIk91dHB1dCBwYXRoIGZvciBzcGFuIEpTT04gbGluZXMgd2hlbiBleHBvcnRlciB0eXBlIGlzIGBmaWxlYC4gQ29uZmlndXJhYmxlIGluIHVzZXIgc2V0dGluZ3Mgb25seS4gU2V0cyBgQ09QSUxPVF9PVEVMX0ZJTEVfRVhQT1JURVJfUEFUSGAuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdC8vIE93bnMgYENvcGlsb3RPdGVsT3V0ZmlsZWA7IHN1cHByZXNzZXMgbG9jYWwgZmlsZSBleHBvcnQgd2hlbiB0aGUgZW50ZXJwcmlzZSBtYW5kYXRlcyBhbiBPVExQIHNpbmsuXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NvcGlsb3RPdGVsT3V0ZmlsZScsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZE9UZWxPdXRmaWxlVmFsdWUsXG5cdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfRU5EUE9JTlRfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfUFJPVE9DT0xfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdXRmaWxlLnBvbGljeScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLm91dGZpbGUucG9saWN5JywgXCJQcmV2ZW50cyBsb2NhbCBmaWxlIGV4cG9ydCB3aGVuIGVudGVycHJpc2UtbWFuYWdlZCBDb3BpbG90IE9wZW5UZWxlbWV0cnkgZXhwb3J0IGlzIGNvbmZpZ3VyZWQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0T1RlbERiU3BhbkV4cG9ydGVyRW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5kYlNwYW5FeHBvcnRlci5lbmFibGVkJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBhZ2VudCBob3N0IHBlcnNpc3RzIGV2ZXJ5IGVtaXR0ZWQgT1RlbCBzcGFuIHRvIGEgbG9jYWwgU1FMaXRlIGRhdGFiYXNlLiBDb25maWd1cmFibGUgaW4gdXNlciBzZXR0aW5ncyBvbmx5LiBTcGFucyBjYW4gYmUgaW5zcGVjdGVkIHZpYSB0aGUgYEV4cG9ydCBBZ2VudCBIb3N0IFRyYWNlcyBEYXRhYmFzZWAgY29tbWFuZC4gQ29tcGF0aWJsZSB3aXRoIGV4dGVybmFsIGV4cG9ydGVyczogc3BhbnMgYXJlIHdyaXR0ZW4gdG8gU1FMaXRlICphbmQqIGZvcndhcmRlZCB0byB0aGUgdXNlci1jb25maWd1cmVkIHNpbmsuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsU2VydmljZU5hbWVTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5zZXJ2aWNlTmFtZScsIFwiRW50ZXJwcmlzZS1tYW5hZ2VkIE9UZWwgYHNlcnZpY2UubmFtZWAgcmVzb3VyY2UgYXR0cmlidXRlIGZvciBDb3BpbG90IE9wZW5UZWxlbWV0cnkgZXhwb3J0LiBQb2xpY3ktb25seTogdGhlcmUgaXMgbm8gdXNlci1mYWNpbmcgc2V0dGluZzsgaXQgY2FycmllcyB0aGUgbWFuYWdlZCBgdGVsZW1ldHJ5LnNlcnZpY2VOYW1lYCBzbyB0aGUgYWdlbnQgaG9zdCdzIGBPVEVMX1NFUlZJQ0VfTkFNRWAgaWRlbnRpZmllcyBzcGFucyBmcm9tIHRoaXMgZGVwbG95bWVudC5cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHQvLyBQb2xpY3ktb25seSBkZWxpdmVyeSBzbG90IFx1MjAxNCBubyB1c2VyLXdyaXRhYmxlIHN1cmZhY2UgKG1pcnJvcnMgYGNoYXQuYWdlbnRIb3N0Lm90ZWwub3RscFByb3RvY29sYCkuXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gT3ducyBgQ29waWxvdE90ZWxTZXJ2aWNlTmFtZWA7IHBhc3NlcyB0aGUgcmF3IG1hbmFnZWQgYHRlbGVtZXRyeS5zZXJ2aWNlTmFtZWAgdGhyb3VnaCBzbyB0aGVcblx0XHRcdC8vIHN0YXJ0ZXJzIGNhbiBzZXQgYE9URUxfU0VSVklDRV9OQU1FYCBvbiB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbFNlcnZpY2VOYW1lJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNycsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkU2V0dGluZ1ZhbHVlKENPUElMT1RfT1RFTF9TRVJWSUNFX05BTUVfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9TRVJWSUNFX05BTUVfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5hZ2VudEhvc3Qub3RlbC5zZXJ2aWNlTmFtZS5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5zZXJ2aWNlTmFtZS5wb2xpY3knLCBcIkNvbnRyb2xzIHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgT1RlbCBgc2VydmljZS5uYW1lYCByZXNvdXJjZSBhdHRyaWJ1dGUgZm9yIENvcGlsb3QgT3BlblRlbGVtZXRyeSBleHBvcnQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0T1RlbFJlc291cmNlQXR0cmlidXRlc1NldHRpbmdJZF06IHtcblx0XHRcdC8vIFBvbGljeS1vbmx5IGRlbGl2ZXJ5IHNsb3QgXHUyMDE0IG5vIHVzZXItd3JpdGFibGUgc3VyZmFjZSAobWlycm9ycyBgY2hhdC5wbHVnaW5zLmV4dHJhTWFya2V0cGxhY2VzYCkuXG5cdFx0XHQvLyBDYXJyaWVkIGFzIGEgYHsgW2tleV06IHN0cmluZyB9YCBvYmplY3Q7IHRoZSBzdGFydGVycyBzZXJpYWxpemUgaXQgaW50byBgT1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTYC5cblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogWydzdHJpbmcnXSBhcyBbJ3N0cmluZyddIH0sXG5cdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLnJlc291cmNlQXR0cmlidXRlcycsIFwiRW50ZXJwcmlzZS1tYW5hZ2VkIE9UZWwgcmVzb3VyY2UgYXR0cmlidXRlcyBmb3IgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydC4gUG9saWN5LW9ubHk6IHRoZXJlIGlzIG5vIHVzZXItZmFjaW5nIHNldHRpbmc7IGl0IGNhcnJpZXMgdGhlIG1hbmFnZWQgYHRlbGVtZXRyeS5yZXNvdXJjZUF0dHJpYnV0ZXNgIG1hcCBzbyB0aGUgYWdlbnQgaG9zdCdzIGBPVEVMX1JFU09VUkNFX0FUVFJJQlVURVNgIGluY2x1ZGVzIHRoZSBkZXBsb3ltZW50J3MgYXR0cmlidXRlcy5cIiksXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NvcGlsb3RPdGVsUmVzb3VyY2VBdHRyaWJ1dGVzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNycsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkU2V0dGluZ1ZhbHVlKENPUElMT1RfT1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTX0tFWSksXG5cdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfUkVTT1VSQ0VfQVRUUklCVVRFU19LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLnJlc291cmNlQXR0cmlidXRlcy5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5yZXNvdXJjZUF0dHJpYnV0ZXMucG9saWN5JywgXCJDb250cm9scyB0aGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE9UZWwgcmVzb3VyY2UgYXR0cmlidXRlcyBmb3IgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydC5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdC8vIEV4dGVuc2lvbi1vbmx5IHBvbGljeSBkZWxpdmVyeSBzbG90IGZvciBtYW5hZ2VkIE9UTFAgZXhwb3J0ZXIgaGVhZGVycyAoZS5nLiBhdXRoIHRva2VucykuXG5cdFx0Ly8gRGVsaWJlcmF0ZWx5IE5PVCBkZWxpdmVyZWQgdG8gdGhlIGFnZW50IGhvc3Q6IGhlYWRlcnMgd291bGQgaGF2ZSB0byB0cmF2ZWwgdmlhIGVudiB2YXJzLFxuXHRcdC8vIHdoaWNoIHRoZSBhZ2VudCBob3N0IGxlYWtzIGludG8gdGhlIHRvb2wgc3VicHJvY2Vzc2VzIGl0IHNwYXducywgZXhwb3NpbmcgdGhlIHNlY3JldC4gVGhlXG5cdFx0Ly8gQ29waWxvdCBDaGF0IGV4dGVuc2lvbiBhcHBsaWVzIHRoZXNlIGhlYWRlcnMgZGlyZWN0bHkgdG8gaXRzIE9UTFAgZXhwb3J0ZXIgaW5zdGVhZC5cblx0XHRbJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuaGVhZGVycyddOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6IFsnc3RyaW5nJ10gYXMgWydzdHJpbmcnXSB9LFxuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5oZWFkZXJzJywgXCJFbnRlcnByaXNlLW1hbmFnZWQgT1RMUCBleHBvcnRlciBoZWFkZXJzIChlLmcuIGF1dGggdG9rZW5zKSBmb3IgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydC4gUG9saWN5LW9ubHkgYW5kIGV4dGVuc2lvbi1vbmx5OiBhcHBsaWVkIGRpcmVjdGx5IHRvIHRoZSBDb3BpbG90IENoYXQgZXh0ZW5zaW9uJ3MgT1RMUCBleHBvcnRlciwgbmV2ZXIgZGVsaXZlcmVkIHRvIHRoZSBhZ2VudCBob3N0IHByb2Nlc3MuXCIpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbEhlYWRlcnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTI3Jyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9PVEVMX0hFQURFUlNfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9IRUFERVJTX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuaGVhZGVycy5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5oZWFkZXJzLnBvbGljeScsIFwiQ29udHJvbHMgdGhlIGVudGVycHJpc2UtbWFuYWdlZCBPVExQIGV4cG9ydGVyIGhlYWRlcnMgZm9yIENvcGlsb3QgT3BlblRlbGVtZXRyeSBleHBvcnQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0IsY0FBYywrQkFBdUQ7QUFDbEcsU0FBUyxrQ0FBa0MsMEJBQTBCLDJCQUEyQiwwQkFBMEIsdUNBQXVDLDJCQUEyQixzQ0FBc0MsK0JBQStCLDJCQUEyQjtBQUM1UixPQUFPLGFBQWE7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekI7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQWtCUCxNQUFNLHdCQUF3QixTQUFTLEdBQTJCLHdCQUF3QixhQUFhO0FBUXZHLFNBQVMseUJBQXlCLFlBQTZDO0FBQzlFLFFBQU0sV0FBVyxXQUFXLGtCQUFrQix5QkFBeUI7QUFDdkUsTUFBSSxhQUFhLFFBQVE7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLGFBQWEsbUJBQW1CLGFBQWEsYUFBYTtBQUM3RCxXQUFPO0FB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O0FBQUEsSUFDRDtBQUFBLElBQ0EsQ0FBQyx3Q0FBd0MsR0FBRztBQUFBO0FBQUE7QUFBQSxNQUczQyxNQUFNO0FBQUEsTUFDTixzQkFBc0IsRUFBRSxNQUFNLENBQUMsUUFBUSxFQUFnQjtBQUFBLE1BQ3ZELFNBQVMsQ0FBQztBQUFBLE1BQ1YsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixVQUFVO0FBQUEsTUFDVixNQUFNLENBQUMsZ0JBQWdCLFVBQVU7QUFBQSxNQUNqQyxxQkFBcUIsSUFBSSxTQUFTLDBDQUEwQyw0UUFBNFE7QUFBQSxNQUN4VixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixPQUFPLG9CQUFvQixvQ0FBb0M7QUFBQSxRQUMvRCxpQkFBaUI7QUFBQSxVQUNoQixDQUFDLG9DQUFvQyxHQUFHLEVBQUUsTUFBTSxTQUFTO0FBQUEsUUFDMUQ7QUFBQSxRQUNBLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sSUFBSSxTQUFTLGlEQUFpRCw0RkFBNEY7QUFBQSxVQUNsSztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFLQSxDQUFDLDZCQUE2QixHQUFHO0FBQUEsTUFDaEMsTUFBTTtBQUFBLE1BQ04sc0JBQXNCLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBZ0I7QUFBQSxNQUN2RCxTQUFTLENBQUM7QUFBQSxNQUNWLE9BQU8sbUJBQW1CO0FBQUEsTUFDMUIsVUFBVTtBQUFBLE1BQ1YsTUFBTSxDQUFDLGdCQUFnQixVQUFVO0FBQUEsTUFDakMscUJBQXFCLElBQUksU0FBUywrQkFBK0IsME9BQTBPO0FBQUEsTUFDM1MsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sVUFBVSxlQUFlO0FBQUEsUUFDekIsZ0JBQWdCO0FBQUEsUUFDaEIsT0FBTyxvQkFBb0Isd0JBQXdCO0FBQUEsUUFDbkQsaUJBQWlCO0FBQUEsVUFDaEIsQ0FBQyx3QkFBd0IsR0FBRyxFQUFFLE1BQU0sU0FBUztBQUFBLFFBQzlDO0FBQUEsUUFDQSxjQUFjO0FBQUEsVUFDYixhQUFhO0FBQUEsWUFDWixLQUFLO0FBQUEsWUFDTCxPQUFPLElBQUksU0FBUyxzQ0FBc0MseUZBQXlGO0FBQUEsVUFDcEo7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
