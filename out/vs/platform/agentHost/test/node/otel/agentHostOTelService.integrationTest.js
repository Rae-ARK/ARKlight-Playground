import { deepStrictEqual, notStrictEqual, ok, strictEqual } from "assert";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { INativeEnvironmentService } from "../../../../environment/common/environment.js";
import { TestInstantiationService } from "../../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../log/common/log.js";
import { OTelSqliteStore } from "../../../../otel/node/sqlite/otelSqliteStore.js";
import { OTLP_TRACES_PATH } from "../../../../otel/node/otlp/localOtlpReceiver.js";
import {
  OtlpSpanKind
} from "../../../../otel/node/otlp/otlpJsonTypes.js";
import { AgentHostSessionTitleAttribute, AgentHostSessionTitleSpanName, AgentHostSessionUriAttribute, IAgentHostOTelService } from "../../../common/otel/agentHostOTelService.js";
import { AgentHostOTelService, readAgentHostOTelEnv } from "../../../node/otel/agentHostOTelService.js";
import { AgentHostOTelSpansDbSubPath } from "../../../common/agentService.js";
async function postOtlp(endpoint, payload) {
  const httpModule = await import("http");
  const url = new URL(endpoint);
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  return new Promise((resolve, reject) => {
    const req = httpModule.request({
      host: url.hostname,
      port: Number(url.port),
      method: "POST",
      path: OTLP_TRACES_PATH,
      headers: {
        "content-type": "application/json",
        "content-length": String(body.length)
      }
    });
    req.on("response", (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        statusCode: res.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8")
      }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
function makeOtlpRequest(traceId, spanId) {
  const nowNs = `${Date.now()}000000`;
  const endNs = `${Date.now() + 500}000000`;
  return {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "agent-host-test" } }
        ]
      },
      scopeSpans: [{
        scope: { name: "github.copilot.agent" },
        spans: [{
          traceId,
          spanId,
          name: "invoke_agent copilotcli",
          kind: OtlpSpanKind.INTERNAL,
          startTimeUnixNano: nowNs,
          endTimeUnixNano: endNs,
          attributes: [
            { key: "gen_ai.operation.name", value: { stringValue: "invoke_agent" } },
            { key: "gen_ai.provider.name", value: { stringValue: "github.copilot" } },
            { key: "gen_ai.agent.name", value: { stringValue: "copilotcli" } },
            { key: "gen_ai.conversation.id", value: { stringValue: "conv-1" } },
            { key: "gen_ai.request.model", value: { stringValue: "gpt-4o" } }
          ]
        }]
      }]
    }]
  };
}
const OTEL_ENV_KEYS = [
  "COPILOT_OTEL_ENABLED",
  "COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED",
  "COPILOT_OTEL_EXPORTER_TYPE",
  "COPILOT_OTEL_ENDPOINT",
  "COPILOT_OTEL_FILE_EXPORTER_PATH",
  "COPILOT_OTEL_SOURCE_NAME",
  "COPILOT_OTEL_PROTOCOL",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT",
  "OTEL_RESOURCE_ATTRIBUTES",
  "OTEL_SERVICE_NAME"
];
function saveEnv() {
  const saved = {};
  for (const key of OTEL_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  return saved;
}
function restoreEnv(saved) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === void 0) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
function makeEnvService(userDataPath) {
  const env = { _serviceBrand: void 0, userDataPath };
  return env;
}
suite("platform/agentHost - AgentHostOTelService (integration)", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("readAgentHostOTelEnv: disabled when no relevant env vars are set", () => {
    const cfg = readAgentHostOTelEnv({});
    strictEqual(cfg.enabled, false);
    strictEqual(cfg.dbSpanExporter, false);
    strictEqual(cfg.exporterType, "otlp-http");
  });
  test("readAgentHostOTelEnv: db mode implies enabled", () => {
    const cfg = readAgentHostOTelEnv({ COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED: "true" });
    strictEqual(cfg.enabled, true);
    strictEqual(cfg.dbSpanExporter, true);
  });
  test("readAgentHostOTelEnv: protocol=grpc downgrades to otlp-grpc exporter type", () => {
    const cfg = readAgentHostOTelEnv({
      COPILOT_OTEL_ENABLED: "true",
      COPILOT_OTEL_EXPORTER_TYPE: "otlp-http",
      OTEL_EXPORTER_OTLP_PROTOCOL: "grpc"
    });
    strictEqual(cfg.exporterType, "otlp-grpc");
  });
  test("readAgentHostOTelEnv: parses headers and resource attributes", () => {
    const cfg = readAgentHostOTelEnv({
      COPILOT_OTEL_ENABLED: "true",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=Bearer xyz,x-tenant=acme",
      OTEL_RESOURCE_ATTRIBUTES: "deployment.environment.name=dev,custom=value%20with%20spaces,service.name=ignored",
      OTEL_SERVICE_NAME: "agent-host"
    });
    deepStrictEqual({ headers: cfg.headers, resourceAttributes: cfg.resourceAttributes }, {
      headers: { authorization: "Bearer xyz", "x-tenant": "acme" },
      resourceAttributes: {
        "deployment.environment.name": "dev",
        custom: "value with spaces",
        "service.name": "agent-host"
      }
    });
  });
  test("getSdkTelemetryConfig: returns undefined when fully disabled", async () => {
    const saved = saveEnv();
    try {
      const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
      store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => void 0) });
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      di.set(IAgentHostOTelService, svc);
      strictEqual(await svc.getSdkTelemetryConfig(), void 0);
      strictEqual(svc.getSpansDbPath(), void 0);
    } finally {
      restoreEnv(saved);
    }
  });
  test("getSdkTelemetryConfig: pass-through mode returns user-configured exporter settings", async () => {
    const saved = saveEnv();
    try {
      process.env.COPILOT_OTEL_ENABLED = "true";
      process.env.COPILOT_OTEL_EXPORTER_TYPE = "console";
      process.env.COPILOT_OTEL_SOURCE_NAME = "agent-host";
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = "true";
      const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
      store.add({ dispose: () => void rm(tmp, { recursive: true, force: true }).catch(() => void 0) });
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      const cfg = await svc.getSdkTelemetryConfig();
      ok(cfg, "expected a TelemetryConfig");
      strictEqual(cfg.exporterType, "console");
      strictEqual(cfg.sourceName, "agent-host");
      strictEqual(cfg.captureContent, true);
      strictEqual(svc.getSpansDbPath(), void 0);
    } finally {
      restoreEnv(saved);
    }
  });
  test("DB mode: starts loopback, persists posted spans to SQLite, and exposes db path", async () => {
    const saved = saveEnv();
    const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
    const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => void 0);
    try {
      process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = "true";
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      const cfg = await svc.getSdkTelemetryConfig();
      ok(cfg, "expected a TelemetryConfig");
      strictEqual(cfg.exporterType, "otlp-http");
      ok(cfg.otlpEndpoint?.startsWith("http://127.0.0.1:"), `expected loopback endpoint, got ${cfg.otlpEndpoint}`);
      const dbPath = svc.getSpansDbPath();
      ok(dbPath, "expected a db path in DB mode");
      ok(dbPath.fsPath.replace(/\\/g, "/").endsWith(AgentHostOTelSpansDbSubPath));
      const traceId = "1122334455667788aabbccddeeff0011";
      const spanIdA = "0000000000000001";
      const spanIdB = "0000000000000002";
      const res1 = await postOtlp(cfg.otlpEndpoint, makeOtlpRequest(traceId, spanIdA));
      strictEqual(res1.statusCode, 200, `unexpected res1: ${res1.body}`);
      const res2 = await postOtlp(cfg.otlpEndpoint, makeOtlpRequest(traceId, spanIdB));
      strictEqual(res2.statusCode, 200, `unexpected res2: ${res2.body}`);
      await svc.flush();
      const cfg2 = await svc.getSdkTelemetryConfig();
      strictEqual(cfg2.otlpEndpoint, cfg.otlpEndpoint);
      const reader = new OTelSqliteStore(dbPath.fsPath);
      try {
        const persisted = reader.getSpansByTraceId(traceId);
        strictEqual(persisted.length, 2, `expected 2 persisted spans, got ${persisted.length} (res1.body=${res1.body})`);
        const names = persisted.map((s) => s.name).sort();
        deepStrictEqual(names, ["invoke_agent copilotcli", "invoke_agent copilotcli"]);
        const operationNames = persisted.map((s) => s.operation_name);
        ok(operationNames.every((op) => op === "invoke_agent"));
        notStrictEqual(persisted[0].request_model, null);
      } finally {
        reader.close();
      }
    } finally {
      restoreEnv(saved);
      await cleanup();
    }
  });
  test("DB mode: emits session title metadata spans when content capture is enabled", async () => {
    const saved = saveEnv();
    const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
    const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => void 0);
    try {
      process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = "true";
      process.env.OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT = "true";
      process.env.OTEL_SERVICE_NAME = "agent-host-test";
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      await svc.getSdkTelemetryConfig();
      svc.emitSessionTitleChanged("conv-title", "copilotcli:/conv-title", `Updated title ${"x".repeat(300)}`);
      await svc.flush();
      const dbPath = svc.getSpansDbPath();
      ok(dbPath);
      const reader = new OTelSqliteStore(dbPath.fsPath);
      try {
        const spans = reader.getSpansByConversationId("conv-title");
        strictEqual(spans.length, 1);
        strictEqual(spans[0].name, AgentHostSessionTitleSpanName);
        strictEqual(reader.getSpanAttribute(spans[0].span_id, AgentHostSessionTitleAttribute)?.length, 200);
        strictEqual(reader.getSpanAttribute(spans[0].span_id, AgentHostSessionUriAttribute), "copilotcli:/conv-title");
        strictEqual(reader.getSpanAttribute(spans[0].span_id, "service.name"), "agent-host-test");
      } finally {
        reader.close();
      }
    } finally {
      restoreEnv(saved);
      await cleanup();
    }
  });
  test("DB mode + external endpoint: outbound forwarder is configured (best-effort)", async () => {
    const saved = saveEnv();
    const tmp = await mkdtemp(join(tmpdir(), "vscode-otel-svc-"));
    const cleanup = () => rm(tmp, { recursive: true, force: true }).catch(() => void 0);
    try {
      process.env.COPILOT_OTEL_DB_SPAN_EXPORTER_ENABLED = "true";
      process.env.COPILOT_OTEL_EXPORTER_TYPE = "otlp-http";
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
      const di = store.add(new TestInstantiationService());
      di.set(ILogService, new NullLogService());
      di.set(INativeEnvironmentService, makeEnvService(tmp));
      const svc = store.add(di.createInstance(AgentHostOTelService, void 0));
      const cfg = await svc.getSdkTelemetryConfig();
      ok(cfg.otlpEndpoint?.startsWith("http://127.0.0.1:"));
      notStrictEqual(cfg.otlpEndpoint, process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
      const traceId = "ffeeddccbbaa99887766554433221100";
      const res = await postOtlp(cfg.otlpEndpoint, makeOtlpRequest(traceId, "00000000000000ff"));
      strictEqual(res.statusCode, 200);
      await svc.flush();
    } finally {
      restoreEnv(saved);
      await cleanup();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5pbnRlZ3JhdGlvblRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG5vdFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkdGVtcCwgcm0gfSBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgT1RlbFNxbGl0ZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vb3RlbC9ub2RlL3NxbGl0ZS9vdGVsU3FsaXRlU3RvcmUuanMnO1xuaW1wb3J0IHsgT1RMUF9UUkFDRVNfUEFUSCB9IGZyb20gJy4uLy4uLy4uLy4uL290ZWwvbm9kZS9vdGxwL2xvY2FsT3RscFJlY2VpdmVyLmpzJztcbmltcG9ydCB7XG5cdElPdGxwRXhwb3J0VHJhY2VTZXJ2aWNlUmVxdWVzdCxcblx0T3RscFNwYW5LaW5kLFxufSBmcm9tICcuLi8uLi8uLi8uLi9vdGVsL25vZGUvb3RscC9vdGxwSnNvblR5cGVzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25UaXRsZUF0dHJpYnV0ZSwgQWdlbnRIb3N0U2Vzc2lvblRpdGxlU3Bhbk5hbWUsIEFnZW50SG9zdFNlc3Npb25VcmlBdHRyaWJ1dGUsIElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdE9UZWxTZXJ2aWNlLCByZWFkQWdlbnRIb3N0T1RlbEVudiB9IGZyb20gJy4uLy4uLy4uL25vZGUvb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPVGVsU3BhbnNEYlN1YlBhdGggfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIElQb3N0UmVzcG9uc2Uge1xuXHRzdGF0dXNDb2RlOiBudW1iZXI7XG5cdGJvZHk6IHN0cmluZztcbn1cblxuYXN5bmMgZnVuY3Rpb24gcG9zdE90bHAoZW5kcG9pbnQ6IHN0cmluZywgcGF5bG9hZDogb2JqZWN0KTogUHJvbWlzZTxJUG9zdFJlc3BvbnNlPiB7XG5cdGNvbnN0IGh0dHBNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0Y29uc3QgdXJsID0gbmV3IFVSTChlbmRwb2ludCk7XG5cdGNvbnN0IGJvZHkgPSBCdWZmZXIuZnJvbShKU09OLnN0cmluZ2lmeShwYXlsb2FkKSwgJ3V0ZjgnKTtcblx0cmV0dXJuIG5ldyBQcm9taXNlPElQb3N0UmVzcG9uc2U+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCByZXE6IGh0dHAuQ2xpZW50UmVxdWVzdCA9IGh0dHBNb2R1bGUucmVxdWVzdCh7XG5cdFx0XHRob3N0OiB1cmwuaG9zdG5hbWUsXG5cdFx0XHRwb3J0OiBOdW1iZXIodXJsLnBvcnQpLFxuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRwYXRoOiBPVExQX1RSQUNFU19QQVRILFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHQnY29udGVudC10eXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQnY29udGVudC1sZW5ndGgnOiBTdHJpbmcoYm9keS5sZW5ndGgpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRyZXEub24oJ3Jlc3BvbnNlJywgcmVzID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHJlcy5vbignZGF0YScsIChjaHVuazogQnVmZmVyKSA9PiBjaHVua3MucHVzaChjaHVuaykpO1xuXHRcdFx0cmVzLm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKHtcblx0XHRcdFx0c3RhdHVzQ29kZTogcmVzLnN0YXR1c0NvZGUgPz8gMCxcblx0XHRcdFx0Ym9keTogQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGY4JyksXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXMub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0XHRyZXEub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRyZXEud3JpdGUoYm9keSk7XG5cdFx0cmVxLmVuZCgpO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gbWFrZU90bHBSZXF1ZXN0KHRyYWNlSWQ6IHN0cmluZywgc3BhbklkOiBzdHJpbmcpOiBJT3RscEV4cG9ydFRyYWNlU2VydmljZVJlcXVlc3Qge1xuXHQvLyBVc2UgYSBjdXJyZW50LXRpbWUgc3BhbiBzbyB0aGUgNy1kYXkgcmV0ZW50aW9uIHN3ZWVwIHJ1biB3aGVuIGEgc2Vjb25kXG5cdC8vIChyZWFkZXIpIGNvbm5lY3Rpb24gb3BlbnMgZG9lcyBub3QgZGVsZXRlIHRoZSByb3cuXG5cdGNvbnN0IG5vd05zID0gYCR7RGF0ZS5ub3coKX0wMDAwMDBgO1xuXHRjb25zdCBlbmROcyA9IGAke0RhdGUubm93KCkgKyA1MDB9MDAwMDAwYDtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZVNwYW5zOiBbe1xuXHRcdFx0cmVzb3VyY2U6IHtcblx0XHRcdFx0YXR0cmlidXRlczogW1xuXHRcdFx0XHRcdHsga2V5OiAnc2VydmljZS5uYW1lJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdhZ2VudC1ob3N0LXRlc3QnIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sXG5cdFx0XHRzY29wZVNwYW5zOiBbe1xuXHRcdFx0XHRzY29wZTogeyBuYW1lOiAnZ2l0aHViLmNvcGlsb3QuYWdlbnQnIH0sXG5cdFx0XHRcdHNwYW5zOiBbe1xuXHRcdFx0XHRcdHRyYWNlSWQsXG5cdFx0XHRcdFx0c3BhbklkLFxuXHRcdFx0XHRcdG5hbWU6ICdpbnZva2VfYWdlbnQgY29waWxvdGNsaScsXG5cdFx0XHRcdFx0a2luZDogT3RscFNwYW5LaW5kLklOVEVSTkFMLFxuXHRcdFx0XHRcdHN0YXJ0VGltZVVuaXhOYW5vOiBub3dOcyxcblx0XHRcdFx0XHRlbmRUaW1lVW5peE5hbm86IGVuZE5zLFxuXHRcdFx0XHRcdGF0dHJpYnV0ZXM6IFtcblx0XHRcdFx0XHRcdHsga2V5OiAnZ2VuX2FpLm9wZXJhdGlvbi5uYW1lJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdpbnZva2VfYWdlbnQnIH0gfSxcblx0XHRcdFx0XHRcdHsga2V5OiAnZ2VuX2FpLnByb3ZpZGVyLm5hbWUnLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogJ2dpdGh1Yi5jb3BpbG90JyB9IH0sXG5cdFx0XHRcdFx0XHR7IGtleTogJ2dlbl9haS5hZ2VudC5uYW1lJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdjb3BpbG90Y2xpJyB9IH0sXG5cdFx0XHRcdFx0XHR7IGtleTogJ2dlbl9haS5jb252ZXJzYXRpb24uaWQnLCB2YWx1ZTogeyBzdHJpbmdWYWx1ZTogJ2NvbnYtMScgfSB9LFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdnZW5fYWkucmVxdWVzdC5tb2RlbCcsIHZhbHVlOiB7IHN0cmluZ1ZhbHVlOiAnZ3B0LTRvJyB9IH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9XSxcblx0XHR9XSxcblx0fTtcbn1cblxuaW50ZXJmYWNlIElTYXZlZEVudiB7XG5cdFtrZXk6IHN0cmluZ106IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgT1RFTF9FTlZfS0VZUyA9IFtcblx0J0NPUElMT1RfT1RFTF9FTkFCTEVEJyxcblx0J0NPUElMT1RfT1RFTF9EQl9TUEFOX0VYUE9SVEVSX0VOQUJMRUQnLFxuXHQnQ09QSUxPVF9PVEVMX0VYUE9SVEVSX1RZUEUnLFxuXHQnQ09QSUxPVF9PVEVMX0VORFBPSU5UJyxcblx0J0NPUElMT1RfT1RFTF9GSUxFX0VYUE9SVEVSX1BBVEgnLFxuXHQnQ09QSUxPVF9PVEVMX1NPVVJDRV9OQU1FJyxcblx0J0NPUElMT1RfT1RFTF9QUk9UT0NPTCcsXG5cdCdPVEVMX0VYUE9SVEVSX09UTFBfRU5EUE9JTlQnLFxuXHQnT1RFTF9FWFBPUlRFUl9PVExQX1BST1RPQ09MJyxcblx0J09URUxfRVhQT1JURVJfT1RMUF9IRUFERVJTJyxcblx0J09URUxfSU5TVFJVTUVOVEFUSU9OX0dFTkFJX0NBUFRVUkVfTUVTU0FHRV9DT05URU5UJyxcblx0J09URUxfUkVTT1VSQ0VfQVRUUklCVVRFUycsXG5cdCdPVEVMX1NFUlZJQ0VfTkFNRScsXG5dIGFzIGNvbnN0O1xuXG5mdW5jdGlvbiBzYXZlRW52KCk6IElTYXZlZEVudiB7XG5cdGNvbnN0IHNhdmVkOiBJU2F2ZWRFbnYgPSB7fTtcblx0Zm9yIChjb25zdCBrZXkgb2YgT1RFTF9FTlZfS0VZUykge1xuXHRcdHNhdmVkW2tleV0gPSBwcm9jZXNzLmVudltrZXldO1xuXHRcdGRlbGV0ZSBwcm9jZXNzLmVudltrZXldO1xuXHR9XG5cdHJldHVybiBzYXZlZDtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZUVudihzYXZlZDogSVNhdmVkRW52KTogdm9pZCB7XG5cdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHNhdmVkKSkge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRkZWxldGUgcHJvY2Vzcy5lbnZba2V5XTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvY2Vzcy5lbnZba2V5XSA9IHZhbHVlO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlRW52U2VydmljZSh1c2VyRGF0YVBhdGg6IHN0cmluZyk6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2Uge1xuXHRjb25zdCBlbnY6IFBhcnRpYWw8SU5hdGl2ZUVudmlyb25tZW50U2VydmljZT4gPSB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgdXNlckRhdGFQYXRoIH07XG5cdHJldHVybiBlbnYgYXMgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZTtcbn1cblxuc3VpdGUoJ3BsYXRmb3JtL2FnZW50SG9zdCAtIEFnZW50SG9zdE9UZWxTZXJ2aWNlIChpbnRlZ3JhdGlvbiknLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVhZEFnZW50SG9zdE9UZWxFbnY6IGRpc2FibGVkIHdoZW4gbm8gcmVsZXZhbnQgZW52IHZhcnMgYXJlIHNldCcsICgpID0+IHtcblx0XHRjb25zdCBjZmcgPSByZWFkQWdlbnRIb3N0T1RlbEVudih7fSk7XG5cdFx0c3RyaWN0RXF1YWwoY2ZnLmVuYWJsZWQsIGZhbHNlKTtcblx0XHRzdHJpY3RFcXVhbChjZmcuZGJTcGFuRXhwb3J0ZXIsIGZhbHNlKTtcblx0XHRzdHJpY3RFcXVhbChjZmcuZXhwb3J0ZXJUeXBlLCAnb3RscC1odHRwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRBZ2VudEhvc3RPVGVsRW52OiBkYiBtb2RlIGltcGxpZXMgZW5hYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBjZmcgPSByZWFkQWdlbnRIb3N0T1RlbEVudih7IENPUElMT1RfT1RFTF9EQl9TUEFOX0VYUE9SVEVSX0VOQUJMRUQ6ICd0cnVlJyB9KTtcblx0XHRzdHJpY3RFcXVhbChjZmcuZW5hYmxlZCwgdHJ1ZSk7XG5cdFx0c3RyaWN0RXF1YWwoY2ZnLmRiU3BhbkV4cG9ydGVyLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZEFnZW50SG9zdE9UZWxFbnY6IHByb3RvY29sPWdycGMgZG93bmdyYWRlcyB0byBvdGxwLWdycGMgZXhwb3J0ZXIgdHlwZScsICgpID0+IHtcblx0XHRjb25zdCBjZmcgPSByZWFkQWdlbnRIb3N0T1RlbEVudih7XG5cdFx0XHRDT1BJTE9UX09URUxfRU5BQkxFRDogJ3RydWUnLFxuXHRcdFx0Q09QSUxPVF9PVEVMX0VYUE9SVEVSX1RZUEU6ICdvdGxwLWh0dHAnLFxuXHRcdFx0T1RFTF9FWFBPUlRFUl9PVExQX1BST1RPQ09MOiAnZ3JwYycsXG5cdFx0fSk7XG5cdFx0c3RyaWN0RXF1YWwoY2ZnLmV4cG9ydGVyVHlwZSwgJ290bHAtZ3JwYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkQWdlbnRIb3N0T1RlbEVudjogcGFyc2VzIGhlYWRlcnMgYW5kIHJlc291cmNlIGF0dHJpYnV0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2ZnID0gcmVhZEFnZW50SG9zdE9UZWxFbnYoe1xuXHRcdFx0Q09QSUxPVF9PVEVMX0VOQUJMRUQ6ICd0cnVlJyxcblx0XHRcdE9URUxfRVhQT1JURVJfT1RMUF9IRUFERVJTOiAnYXV0aG9yaXphdGlvbj1CZWFyZXIgeHl6LHgtdGVuYW50PWFjbWUnLFxuXHRcdFx0T1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTOiAnZGVwbG95bWVudC5lbnZpcm9ubWVudC5uYW1lPWRldixjdXN0b209dmFsdWUlMjB3aXRoJTIwc3BhY2VzLHNlcnZpY2UubmFtZT1pZ25vcmVkJyxcblx0XHRcdE9URUxfU0VSVklDRV9OQU1FOiAnYWdlbnQtaG9zdCcsXG5cdFx0fSk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHsgaGVhZGVyczogY2ZnLmhlYWRlcnMsIHJlc291cmNlQXR0cmlidXRlczogY2ZnLnJlc291cmNlQXR0cmlidXRlcyB9LCB7XG5cdFx0XHRoZWFkZXJzOiB7IGF1dGhvcml6YXRpb246ICdCZWFyZXIgeHl6JywgJ3gtdGVuYW50JzogJ2FjbWUnIH0sXG5cdFx0XHRyZXNvdXJjZUF0dHJpYnV0ZXM6IHtcblx0XHRcdFx0J2RlcGxveW1lbnQuZW52aXJvbm1lbnQubmFtZSc6ICdkZXYnLFxuXHRcdFx0XHRjdXN0b206ICd2YWx1ZSB3aXRoIHNwYWNlcycsXG5cdFx0XHRcdCdzZXJ2aWNlLm5hbWUnOiAnYWdlbnQtaG9zdCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZGtUZWxlbWV0cnlDb25maWc6IHJldHVybnMgdW5kZWZpbmVkIHdoZW4gZnVsbHkgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2F2ZWQgPSBzYXZlRW52KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRtcCA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ3ZzY29kZS1vdGVsLXN2Yy0nKSk7XG5cdFx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiB2b2lkIHJtKHRtcCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pLmNhdGNoKCgpID0+IHVuZGVmaW5lZCkgfSk7XG5cblx0XHRcdGNvbnN0IGRpID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGRpLnNldChJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBtYWtlRW52U2VydmljZSh0bXApKTtcblx0XHRcdGNvbnN0IHN2YyA9IHN0b3JlLmFkZChkaS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RPVGVsU2VydmljZSwgdW5kZWZpbmVkKSk7XG5cdFx0XHRkaS5zZXQoSUFnZW50SG9zdE9UZWxTZXJ2aWNlLCBzdmMpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBzdmMuZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnKCksIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdmMuZ2V0U3BhbnNEYlBhdGgoKSwgdW5kZWZpbmVkKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVzdG9yZUVudihzYXZlZCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZGtUZWxlbWV0cnlDb25maWc6IHBhc3MtdGhyb3VnaCBtb2RlIHJldHVybnMgdXNlci1jb25maWd1cmVkIGV4cG9ydGVyIHNldHRpbmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNhdmVkID0gc2F2ZUVudigpO1xuXHRcdHRyeSB7XG5cdFx0XHRwcm9jZXNzLmVudi5DT1BJTE9UX09URUxfRU5BQkxFRCA9ICd0cnVlJztcblx0XHRcdHByb2Nlc3MuZW52LkNPUElMT1RfT1RFTF9FWFBPUlRFUl9UWVBFID0gJ2NvbnNvbGUnO1xuXHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX1NPVVJDRV9OQU1FID0gJ2FnZW50LWhvc3QnO1xuXHRcdFx0cHJvY2Vzcy5lbnYuT1RFTF9JTlNUUlVNRU5UQVRJT05fR0VOQUlfQ0FQVFVSRV9NRVNTQUdFX0NPTlRFTlQgPSAndHJ1ZSc7XG5cblx0XHRcdGNvbnN0IHRtcCA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ3ZzY29kZS1vdGVsLXN2Yy0nKSk7XG5cdFx0XHRzdG9yZS5hZGQoeyBkaXNwb3NlOiAoKSA9PiB2b2lkIHJtKHRtcCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pLmNhdGNoKCgpID0+IHVuZGVmaW5lZCkgfSk7XG5cblx0XHRcdGNvbnN0IGRpID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGRpLnNldChJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBtYWtlRW52U2VydmljZSh0bXApKTtcblx0XHRcdGNvbnN0IHN2YyA9IHN0b3JlLmFkZChkaS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RPVGVsU2VydmljZSwgdW5kZWZpbmVkKSk7XG5cblx0XHRcdGNvbnN0IGNmZyA9IGF3YWl0IHN2Yy5nZXRTZGtUZWxlbWV0cnlDb25maWcoKTtcblx0XHRcdG9rKGNmZywgJ2V4cGVjdGVkIGEgVGVsZW1ldHJ5Q29uZmlnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjZmchLmV4cG9ydGVyVHlwZSwgJ2NvbnNvbGUnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNmZyEuc291cmNlTmFtZSwgJ2FnZW50LWhvc3QnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNmZyEuY2FwdHVyZUNvbnRlbnQsIHRydWUpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc3ZjLmdldFNwYW5zRGJQYXRoKCksIHVuZGVmaW5lZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlc3RvcmVFbnYoc2F2ZWQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnREIgbW9kZTogc3RhcnRzIGxvb3BiYWNrLCBwZXJzaXN0cyBwb3N0ZWQgc3BhbnMgdG8gU1FMaXRlLCBhbmQgZXhwb3NlcyBkYiBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNhdmVkID0gc2F2ZUVudigpO1xuXHRcdGNvbnN0IHRtcCA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ3ZzY29kZS1vdGVsLXN2Yy0nKSk7XG5cdFx0Y29uc3QgY2xlYW51cCA9ICgpID0+IHJtKHRtcCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0dHJ5IHtcblx0XHRcdHByb2Nlc3MuZW52LkNPUElMT1RfT1RFTF9EQl9TUEFOX0VYUE9SVEVSX0VOQUJMRUQgPSAndHJ1ZSc7XG5cblx0XHRcdGNvbnN0IGRpID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGRpLnNldChJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBtYWtlRW52U2VydmljZSh0bXApKTtcblx0XHRcdGNvbnN0IHN2YyA9IHN0b3JlLmFkZChkaS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RPVGVsU2VydmljZSwgdW5kZWZpbmVkKSk7XG5cblx0XHRcdGNvbnN0IGNmZyA9IGF3YWl0IHN2Yy5nZXRTZGtUZWxlbWV0cnlDb25maWcoKTtcblx0XHRcdG9rKGNmZywgJ2V4cGVjdGVkIGEgVGVsZW1ldHJ5Q29uZmlnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjZmchLmV4cG9ydGVyVHlwZSwgJ290bHAtaHR0cCcpO1xuXHRcdFx0b2soY2ZnIS5vdGxwRW5kcG9pbnQ/LnN0YXJ0c1dpdGgoJ2h0dHA6Ly8xMjcuMC4wLjE6JyksIGBleHBlY3RlZCBsb29wYmFjayBlbmRwb2ludCwgZ290ICR7Y2ZnIS5vdGxwRW5kcG9pbnR9YCk7XG5cblx0XHRcdGNvbnN0IGRiUGF0aCA9IHN2Yy5nZXRTcGFuc0RiUGF0aCgpO1xuXHRcdFx0b2soZGJQYXRoLCAnZXhwZWN0ZWQgYSBkYiBwYXRoIGluIERCIG1vZGUnKTtcblx0XHRcdC8vIE5vcm1hbGl6ZSBzZXBhcmF0b3JzIHNpbmNlIFVSSS5mc1BhdGggdXNlcyAnXFxcXCcgb24gV2luZG93cyBidXRcblx0XHRcdC8vIEFnZW50SG9zdE9UZWxTcGFuc0RiU3ViUGF0aCBpcyBkZWNsYXJlZCB3aXRoIFBPU0lYIHNlcGFyYXRvcnMuXG5cdFx0XHRvayhkYlBhdGghLmZzUGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJykuZW5kc1dpdGgoQWdlbnRIb3N0T1RlbFNwYW5zRGJTdWJQYXRoKSk7XG5cblx0XHRcdC8vIFBvc3QgYSB2YWxpZCBPVExQL0pTT04gcGF5bG9hZCB0byB0aGUgbG9vcGJhY2sgZW5kcG9pbnQuXG5cdFx0XHRjb25zdCB0cmFjZUlkID0gJzExMjIzMzQ0NTU2Njc3ODhhYWJiY2NkZGVlZmYwMDExJztcblx0XHRcdGNvbnN0IHNwYW5JZEEgPSAnMDAwMDAwMDAwMDAwMDAwMSc7XG5cdFx0XHRjb25zdCBzcGFuSWRCID0gJzAwMDAwMDAwMDAwMDAwMDInO1xuXHRcdFx0Y29uc3QgcmVzMSA9IGF3YWl0IHBvc3RPdGxwKGNmZyEub3RscEVuZHBvaW50ISwgbWFrZU90bHBSZXF1ZXN0KHRyYWNlSWQsIHNwYW5JZEEpKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlczEuc3RhdHVzQ29kZSwgMjAwLCBgdW5leHBlY3RlZCByZXMxOiAke3JlczEuYm9keX1gKTtcblx0XHRcdGNvbnN0IHJlczIgPSBhd2FpdCBwb3N0T3RscChjZmchLm90bHBFbmRwb2ludCEsIG1ha2VPdGxwUmVxdWVzdCh0cmFjZUlkLCBzcGFuSWRCKSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMyLnN0YXR1c0NvZGUsIDIwMCwgYHVuZXhwZWN0ZWQgcmVzMjogJHtyZXMyLmJvZHl9YCk7XG5cblx0XHRcdGF3YWl0IHN2Yy5mbHVzaCgpO1xuXG5cdFx0XHQvLyBDYWxsaW5nIGFnYWluIHJldHVybnMgdGhlIHNhbWUgbG9vcGJhY2sgZW5kcG9pbnQgKGlkZW1wb3RlbnQgc3RhcnQpLlxuXHRcdFx0Y29uc3QgY2ZnMiA9IGF3YWl0IHN2Yy5nZXRTZGtUZWxlbWV0cnlDb25maWcoKTtcblx0XHRcdHN0cmljdEVxdWFsKGNmZzIhLm90bHBFbmRwb2ludCwgY2ZnIS5vdGxwRW5kcG9pbnQpO1xuXG5cdFx0XHQvLyBWZXJpZnkgc3BhbnMgbGFuZGVkIGluIFNRTGl0ZSB2aWEgYSBzZXBhcmF0ZSByZWFkLW9ubHkgY29ubmVjdGlvbi5cblx0XHRcdC8vIChUaGUgc3RvcmUga2VlcHMgdGhlIHdyaXRlciBvcGVuIHdpdGggV0FMOyBhIHBhcmFsbGVsIHJlYWRlciBpcyBzYWZlLilcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBPVGVsU3FsaXRlU3RvcmUoZGJQYXRoIS5mc1BhdGgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gcmVhZGVyLmdldFNwYW5zQnlUcmFjZUlkKHRyYWNlSWQpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChwZXJzaXN0ZWQubGVuZ3RoLCAyLCBgZXhwZWN0ZWQgMiBwZXJzaXN0ZWQgc3BhbnMsIGdvdCAke3BlcnNpc3RlZC5sZW5ndGh9IChyZXMxLmJvZHk9JHtyZXMxLmJvZHl9KWApO1xuXHRcdFx0XHRjb25zdCBuYW1lcyA9IHBlcnNpc3RlZC5tYXAocyA9PiBzLm5hbWUpLnNvcnQoKTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKG5hbWVzLCBbJ2ludm9rZV9hZ2VudCBjb3BpbG90Y2xpJywgJ2ludm9rZV9hZ2VudCBjb3BpbG90Y2xpJ10pO1xuXHRcdFx0XHRjb25zdCBvcGVyYXRpb25OYW1lcyA9IHBlcnNpc3RlZC5tYXAocyA9PiBzLm9wZXJhdGlvbl9uYW1lKTtcblx0XHRcdFx0b2sob3BlcmF0aW9uTmFtZXMuZXZlcnkob3AgPT4gb3AgPT09ICdpbnZva2VfYWdlbnQnKSk7XG5cdFx0XHRcdG5vdFN0cmljdEVxdWFsKHBlcnNpc3RlZFswXS5yZXF1ZXN0X21vZGVsLCBudWxsKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHJlYWRlci5jbG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXN0b3JlRW52KHNhdmVkKTtcblx0XHRcdGF3YWl0IGNsZWFudXAoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0RCIG1vZGU6IGVtaXRzIHNlc3Npb24gdGl0bGUgbWV0YWRhdGEgc3BhbnMgd2hlbiBjb250ZW50IGNhcHR1cmUgaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzYXZlZCA9IHNhdmVFbnYoKTtcblx0XHRjb25zdCB0bXAgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICd2c2NvZGUtb3RlbC1zdmMtJykpO1xuXHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiBybSh0bXAsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRwcm9jZXNzLmVudi5DT1BJTE9UX09URUxfREJfU1BBTl9FWFBPUlRFUl9FTkFCTEVEID0gJ3RydWUnO1xuXHRcdFx0cHJvY2Vzcy5lbnYuT1RFTF9JTlNUUlVNRU5UQVRJT05fR0VOQUlfQ0FQVFVSRV9NRVNTQUdFX0NPTlRFTlQgPSAndHJ1ZSc7XG5cdFx0XHRwcm9jZXNzLmVudi5PVEVMX1NFUlZJQ0VfTkFNRSA9ICdhZ2VudC1ob3N0LXRlc3QnO1xuXG5cdFx0XHRjb25zdCBkaSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0ZGkuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSwgbWFrZUVudlNlcnZpY2UodG1wKSk7XG5cdFx0XHRjb25zdCBzdmMgPSBzdG9yZS5hZGQoZGkuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0T1RlbFNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXG5cdFx0XHRhd2FpdCBzdmMuZ2V0U2RrVGVsZW1ldHJ5Q29uZmlnKCk7XG5cdFx0XHRzdmMuZW1pdFNlc3Npb25UaXRsZUNoYW5nZWQoJ2NvbnYtdGl0bGUnLCAnY29waWxvdGNsaTovY29udi10aXRsZScsIGBVcGRhdGVkIHRpdGxlICR7J3gnLnJlcGVhdCgzMDApfWApO1xuXHRcdFx0YXdhaXQgc3ZjLmZsdXNoKCk7XG5cblx0XHRcdGNvbnN0IGRiUGF0aCA9IHN2Yy5nZXRTcGFuc0RiUGF0aCgpO1xuXHRcdFx0b2soZGJQYXRoKTtcblx0XHRcdGNvbnN0IHJlYWRlciA9IG5ldyBPVGVsU3FsaXRlU3RvcmUoZGJQYXRoIS5mc1BhdGgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc3BhbnMgPSByZWFkZXIuZ2V0U3BhbnNCeUNvbnZlcnNhdGlvbklkKCdjb252LXRpdGxlJyk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHNwYW5zLmxlbmd0aCwgMSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKHNwYW5zWzBdLm5hbWUsIEFnZW50SG9zdFNlc3Npb25UaXRsZVNwYW5OYW1lKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwocmVhZGVyLmdldFNwYW5BdHRyaWJ1dGUoc3BhbnNbMF0uc3Bhbl9pZCwgQWdlbnRIb3N0U2Vzc2lvblRpdGxlQXR0cmlidXRlKT8ubGVuZ3RoLCAyMDApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChyZWFkZXIuZ2V0U3BhbkF0dHJpYnV0ZShzcGFuc1swXS5zcGFuX2lkLCBBZ2VudEhvc3RTZXNzaW9uVXJpQXR0cmlidXRlKSwgJ2NvcGlsb3RjbGk6L2NvbnYtdGl0bGUnKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwocmVhZGVyLmdldFNwYW5BdHRyaWJ1dGUoc3BhbnNbMF0uc3Bhbl9pZCwgJ3NlcnZpY2UubmFtZScpLCAnYWdlbnQtaG9zdC10ZXN0Jyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRyZWFkZXIuY2xvc2UoKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVzdG9yZUVudihzYXZlZCk7XG5cdFx0XHRhd2FpdCBjbGVhbnVwKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdEQiBtb2RlICsgZXh0ZXJuYWwgZW5kcG9pbnQ6IG91dGJvdW5kIGZvcndhcmRlciBpcyBjb25maWd1cmVkIChiZXN0LWVmZm9ydCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2F2ZWQgPSBzYXZlRW52KCk7XG5cdFx0Y29uc3QgdG1wID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAndnNjb2RlLW90ZWwtc3ZjLScpKTtcblx0XHRjb25zdCBjbGVhbnVwID0gKCkgPT4gcm0odG1wLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHR0cnkge1xuXHRcdFx0cHJvY2Vzcy5lbnYuQ09QSUxPVF9PVEVMX0RCX1NQQU5fRVhQT1JURVJfRU5BQkxFRCA9ICd0cnVlJztcblx0XHRcdHByb2Nlc3MuZW52LkNPUElMT1RfT1RFTF9FWFBPUlRFUl9UWVBFID0gJ290bHAtaHR0cCc7XG5cdFx0XHQvLyBQb2ludCB0aGUgZm9yd2FyZGVyIGF0IGFuIHVucmVhY2hhYmxlIHBvcnQ7IHRoZSBmb3J3YXJkZXIgaXMgXCJiZXN0LWVmZm9ydFwiXG5cdFx0XHQvLyBhbmQgbXVzdCBub3QgZmFpbCBpbmdlc3Rpb24gd2hlbiB0aGUgZXh0ZXJuYWwgc2luayBpcyBkb3duLlxuXHRcdFx0cHJvY2Vzcy5lbnYuT1RFTF9FWFBPUlRFUl9PVExQX0VORFBPSU5UID0gJ2h0dHA6Ly8xMjcuMC4wLjE6MSc7XG5cblx0XHRcdGNvbnN0IGRpID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRkaS5zZXQoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGRpLnNldChJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBtYWtlRW52U2VydmljZSh0bXApKTtcblx0XHRcdGNvbnN0IHN2YyA9IHN0b3JlLmFkZChkaS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RPVGVsU2VydmljZSwgdW5kZWZpbmVkKSk7XG5cblx0XHRcdGNvbnN0IGNmZyA9IGF3YWl0IHN2Yy5nZXRTZGtUZWxlbWV0cnlDb25maWcoKTtcblx0XHRcdG9rKGNmZyEub3RscEVuZHBvaW50Py5zdGFydHNXaXRoKCdodHRwOi8vMTI3LjAuMC4xOicpKTtcblx0XHRcdC8vIFRoZSBTREsgaXMgc3RpbGwgcG9pbnRlZCBhdCBvdXIgbG9vcGJhY2ssIG5vdCB0aGUgdXNlcidzIGVuZHBvaW50LlxuXHRcdFx0bm90U3RyaWN0RXF1YWwoY2ZnIS5vdGxwRW5kcG9pbnQsIHByb2Nlc3MuZW52Lk9URUxfRVhQT1JURVJfT1RMUF9FTkRQT0lOVCk7XG5cblx0XHRcdGNvbnN0IHRyYWNlSWQgPSAnZmZlZWRkY2NiYmFhOTk4ODc3NjY1NTQ0MzMyMjExMDAnO1xuXHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgcG9zdE90bHAoY2ZnIS5vdGxwRW5kcG9pbnQhLCBtYWtlT3RscFJlcXVlc3QodHJhY2VJZCwgJzAwMDAwMDAwMDAwMDAwZmYnKSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXMuc3RhdHVzQ29kZSwgMjAwKTtcblx0XHRcdC8vIGZsdXNoKCkgYXdhaXRzIHRoZSBmb3J3YXJkZXIgUXVldWUgXHUyMDE0IG11c3Qgbm90IHRocm93IGV2ZW4gdGhvdWdoIHRoZVxuXHRcdFx0Ly8gdXBzdHJlYW0gaXMgdW5yZWFjaGFibGUuXG5cdFx0XHRhd2FpdCBzdmMuZmx1c2goKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVzdG9yZUVudihzYXZlZCk7XG5cdFx0XHRhd2FpdCBjbGVhbnVwKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsZ0JBQWdCLElBQUksbUJBQW1CO0FBQ2pFLFNBQVMsU0FBUyxVQUFVO0FBRTVCLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHdCQUF3QjtBQUNqQztBQUFBLEVBRUM7QUFBQSxPQUNNO0FBQ1AsU0FBUyxnQ0FBZ0MsK0JBQStCLDhCQUE4Qiw2QkFBNkI7QUFDbkksU0FBUyxzQkFBc0IsNEJBQTRCO0FBQzNELFNBQVMsbUNBQW1DO0FBTzVDLGVBQWUsU0FBUyxVQUFrQixTQUF5QztBQUNsRixRQUFNLGFBQWEsTUFBTSxPQUFPLE1BQU07QUFDdEMsUUFBTSxNQUFNLElBQUksSUFBSSxRQUFRO0FBQzVCLFFBQU0sT0FBTyxPQUFPLEtBQUssS0FBSyxVQUFVLE9BQU8sR0FBRyxNQUFNO0FBQ3hELFNBQU8sSUFBSSxRQUF1QixDQUFDLFNBQVMsV0FBVztBQUN0RCxVQUFNLE1BQTBCLFdBQVcsUUFBUTtBQUFBLE1BQ2xELE1BQU0sSUFBSTtBQUFBLE1BQ1YsTUFBTSxPQUFPLElBQUksSUFBSTtBQUFBLE1BQ3JCLFFBQVE7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxRQUNSLGdCQUFnQjtBQUFBLFFBQ2hCLGtCQUFrQixPQUFPLEtBQUssTUFBTTtBQUFBLE1BQ3JDO0FBQUEsSUFDRCxDQUFDO0FBQ0QsUUFBSSxHQUFHLFlBQVksU0FBTztBQUN6QixZQUFNLFNBQW1CLENBQUM7QUFDMUIsVUFBSSxHQUFHLFFBQVEsQ0FBQyxVQUFrQixPQUFPLEtBQUssS0FBSyxDQUFDO0FBQ3BELFVBQUksR0FBRyxPQUFPLE1BQU0sUUFBUTtBQUFBLFFBQzNCLFlBQVksSUFBSSxjQUFjO0FBQUEsUUFDOUIsTUFBTSxPQUFPLE9BQU8sTUFBTSxFQUFFLFNBQVMsTUFBTTtBQUFBLE1BQzVDLENBQUMsQ0FBQztBQUNGLFVBQUksR0FBRyxTQUFTLE1BQU07QUFBQSxJQUN2QixDQUFDO0FBQ0QsUUFBSSxHQUFHLFNBQVMsTUFBTTtBQUN0QixRQUFJLE1BQU0sSUFBSTtBQUNkLFFBQUksSUFBSTtBQUFBLEVBQ1QsQ0FBQztBQUNGO0FBRUEsU0FBUyxnQkFBZ0IsU0FBaUIsUUFBZ0Q7QUFHekYsUUFBTSxRQUFRLEdBQUcsS0FBSyxJQUFJLENBQUM7QUFDM0IsUUFBTSxRQUFRLEdBQUcsS0FBSyxJQUFJLElBQUksR0FBRztBQUNqQyxTQUFPO0FBQUEsSUFDTixlQUFlLENBQUM7QUFBQSxNQUNmLFVBQVU7QUFBQSxRQUNULFlBQVk7QUFBQSxVQUNYLEVBQUUsS0FBSyxnQkFBZ0IsT0FBTyxFQUFFLGFBQWEsa0JBQWtCLEVBQUU7QUFBQSxRQUNsRTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFlBQVksQ0FBQztBQUFBLFFBQ1osT0FBTyxFQUFFLE1BQU0sdUJBQXVCO0FBQUEsUUFDdEMsT0FBTyxDQUFDO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxVQUNBLE1BQU07QUFBQSxVQUNOLE1BQU0sYUFBYTtBQUFBLFVBQ25CLG1CQUFtQjtBQUFBLFVBQ25CLGlCQUFpQjtBQUFBLFVBQ2pCLFlBQVk7QUFBQSxZQUNYLEVBQUUsS0FBSyx5QkFBeUIsT0FBTyxFQUFFLGFBQWEsZUFBZSxFQUFFO0FBQUEsWUFDdkUsRUFBRSxLQUFLLHdCQUF3QixPQUFPLEVBQUUsYUFBYSxpQkFBaUIsRUFBRTtBQUFBLFlBQ3hFLEVBQUUsS0FBSyxxQkFBcUIsT0FBTyxFQUFFLGFBQWEsYUFBYSxFQUFFO0FBQUEsWUFDakUsRUFBRSxLQUFLLDBCQUEwQixPQUFPLEVBQUUsYUFBYSxTQUFTLEVBQUU7QUFBQSxZQUNsRSxFQUFFLEtBQUssd0JBQXdCLE9BQU8sRUFBRSxhQUFhLFNBQVMsRUFBRTtBQUFBLFVBQ2pFO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBTUEsTUFBTSxnQkFBZ0I7QUFBQSxFQUNyQjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEO0FBRUEsU0FBUyxVQUFxQjtBQUM3QixRQUFNLFFBQW1CLENBQUM7QUFDMUIsYUFBVyxPQUFPLGVBQWU7QUFDaEMsVUFBTSxHQUFHLElBQUksUUFBUSxJQUFJLEdBQUc7QUFDNUIsV0FBTyxRQUFRLElBQUksR0FBRztBQUFBLEVBQ3ZCO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxXQUFXLE9BQXdCO0FBQzNDLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsS0FBSyxHQUFHO0FBQ2pELFFBQUksVUFBVSxRQUFXO0FBQ3hCLGFBQU8sUUFBUSxJQUFJLEdBQUc7QUFBQSxJQUN2QixPQUFPO0FBQ04sY0FBUSxJQUFJLEdBQUcsSUFBSTtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUNEO0FBRUEsU0FBUyxlQUFlLGNBQWlEO0FBQ3hFLFFBQU0sTUFBMEMsRUFBRSxlQUFlLFFBQVcsYUFBYTtBQUN6RixTQUFPO0FBQ1I7QUFFQSxNQUFNLDJEQUEyRCxNQUFNO0FBQ3RFLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxVQUFNLE1BQU0scUJBQXFCLENBQUMsQ0FBQztBQUNuQyxnQkFBWSxJQUFJLFNBQVMsS0FBSztBQUM5QixnQkFBWSxJQUFJLGdCQUFnQixLQUFLO0FBQ3JDLGdCQUFZLElBQUksY0FBYyxXQUFXO0FBQUEsRUFDMUMsQ0FBQztBQUVELE9BQUssaURBQWlELE1BQU07QUFDM0QsVUFBTSxNQUFNLHFCQUFxQixFQUFFLHVDQUF1QyxPQUFPLENBQUM7QUFDbEYsZ0JBQVksSUFBSSxTQUFTLElBQUk7QUFDN0IsZ0JBQVksSUFBSSxnQkFBZ0IsSUFBSTtBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxNQUFNO0FBQ3ZGLFVBQU0sTUFBTSxxQkFBcUI7QUFBQSxNQUNoQyxzQkFBc0I7QUFBQSxNQUN0Qiw0QkFBNEI7QUFBQSxNQUM1Qiw2QkFBNkI7QUFBQSxJQUM5QixDQUFDO0FBQ0QsZ0JBQVksSUFBSSxjQUFjLFdBQVc7QUFBQSxFQUMxQyxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxVQUFNLE1BQU0scUJBQXFCO0FBQUEsTUFDaEMsc0JBQXNCO0FBQUEsTUFDdEIsNEJBQTRCO0FBQUEsTUFDNUIsMEJBQTBCO0FBQUEsTUFDMUIsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUNELG9CQUFnQixFQUFFLFNBQVMsSUFBSSxTQUFTLG9CQUFvQixJQUFJLG1CQUFtQixHQUFHO0FBQUEsTUFDckYsU0FBUyxFQUFFLGVBQWUsY0FBYyxZQUFZLE9BQU87QUFBQSxNQUMzRCxvQkFBb0I7QUFBQSxRQUNuQiwrQkFBK0I7QUFBQSxRQUMvQixRQUFRO0FBQUEsUUFDUixnQkFBZ0I7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0VBQWdFLFlBQVk7QUFDaEYsVUFBTSxRQUFRLFFBQVE7QUFDdEIsUUFBSTtBQUNILFlBQU0sTUFBTSxNQUFNLFFBQVEsS0FBSyxPQUFPLEdBQUcsa0JBQWtCLENBQUM7QUFDNUQsWUFBTSxJQUFJLEVBQUUsU0FBUyxNQUFNLEtBQUssR0FBRyxLQUFLLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDLEVBQUUsTUFBTSxNQUFNLE1BQVMsRUFBRSxDQUFDO0FBRWxHLFlBQU0sS0FBSyxNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUNuRCxTQUFHLElBQUksYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4QyxTQUFHLElBQUksMkJBQTJCLGVBQWUsR0FBRyxDQUFDO0FBQ3JELFlBQU0sTUFBTSxNQUFNLElBQUksR0FBRyxlQUFlLHNCQUFzQixNQUFTLENBQUM7QUFDeEUsU0FBRyxJQUFJLHVCQUF1QixHQUFHO0FBRWpDLGtCQUFZLE1BQU0sSUFBSSxzQkFBc0IsR0FBRyxNQUFTO0FBQ3hELGtCQUFZLElBQUksZUFBZSxHQUFHLE1BQVM7QUFBQSxJQUM1QyxVQUFFO0FBQ0QsaUJBQVcsS0FBSztBQUFBLElBQ2pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzRkFBc0YsWUFBWTtBQUN0RyxVQUFNLFFBQVEsUUFBUTtBQUN0QixRQUFJO0FBQ0gsY0FBUSxJQUFJLHVCQUF1QjtBQUNuQyxjQUFRLElBQUksNkJBQTZCO0FBQ3pDLGNBQVEsSUFBSSwyQkFBMkI7QUFDdkMsY0FBUSxJQUFJLHFEQUFxRDtBQUVqRSxZQUFNLE1BQU0sTUFBTSxRQUFRLEtBQUssT0FBTyxHQUFHLGtCQUFrQixDQUFDO0FBQzVELFlBQU0sSUFBSSxFQUFFLFNBQVMsTUFBTSxLQUFLLEdBQUcsS0FBSyxFQUFFLFdBQVcsTUFBTSxPQUFPLEtBQUssQ0FBQyxFQUFFLE1BQU0sTUFBTSxNQUFTLEVBQUUsQ0FBQztBQUVsRyxZQUFNLEtBQUssTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDbkQsU0FBRyxJQUFJLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDeEMsU0FBRyxJQUFJLDJCQUEyQixlQUFlLEdBQUcsQ0FBQztBQUNyRCxZQUFNLE1BQU0sTUFBTSxJQUFJLEdBQUcsZUFBZSxzQkFBc0IsTUFBUyxDQUFDO0FBRXhFLFlBQU0sTUFBTSxNQUFNLElBQUksc0JBQXNCO0FBQzVDLFNBQUcsS0FBSyw0QkFBNEI7QUFDcEMsa0JBQVksSUFBSyxjQUFjLFNBQVM7QUFDeEMsa0JBQVksSUFBSyxZQUFZLFlBQVk7QUFDekMsa0JBQVksSUFBSyxnQkFBZ0IsSUFBSTtBQUNyQyxrQkFBWSxJQUFJLGVBQWUsR0FBRyxNQUFTO0FBQUEsSUFDNUMsVUFBRTtBQUNELGlCQUFXLEtBQUs7QUFBQSxJQUNqQjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0ZBQWtGLFlBQVk7QUFDbEcsVUFBTSxRQUFRLFFBQVE7QUFDdEIsVUFBTSxNQUFNLE1BQU0sUUFBUSxLQUFLLE9BQU8sR0FBRyxrQkFBa0IsQ0FBQztBQUM1RCxVQUFNLFVBQVUsTUFBTSxHQUFHLEtBQUssRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUMsRUFBRSxNQUFNLE1BQU0sTUFBUztBQUNyRixRQUFJO0FBQ0gsY0FBUSxJQUFJLHdDQUF3QztBQUVwRCxZQUFNLEtBQUssTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDbkQsU0FBRyxJQUFJLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDeEMsU0FBRyxJQUFJLDJCQUEyQixlQUFlLEdBQUcsQ0FBQztBQUNyRCxZQUFNLE1BQU0sTUFBTSxJQUFJLEdBQUcsZUFBZSxzQkFBc0IsTUFBUyxDQUFDO0FBRXhFLFlBQU0sTUFBTSxNQUFNLElBQUksc0JBQXNCO0FBQzVDLFNBQUcsS0FBSyw0QkFBNEI7QUFDcEMsa0JBQVksSUFBSyxjQUFjLFdBQVc7QUFDMUMsU0FBRyxJQUFLLGNBQWMsV0FBVyxtQkFBbUIsR0FBRyxtQ0FBbUMsSUFBSyxZQUFZLEVBQUU7QUFFN0csWUFBTSxTQUFTLElBQUksZUFBZTtBQUNsQyxTQUFHLFFBQVEsK0JBQStCO0FBRzFDLFNBQUcsT0FBUSxPQUFPLFFBQVEsT0FBTyxHQUFHLEVBQUUsU0FBUywyQkFBMkIsQ0FBQztBQUczRSxZQUFNLFVBQVU7QUFDaEIsWUFBTSxVQUFVO0FBQ2hCLFlBQU0sVUFBVTtBQUNoQixZQUFNLE9BQU8sTUFBTSxTQUFTLElBQUssY0FBZSxnQkFBZ0IsU0FBUyxPQUFPLENBQUM7QUFDakYsa0JBQVksS0FBSyxZQUFZLEtBQUssb0JBQW9CLEtBQUssSUFBSSxFQUFFO0FBQ2pFLFlBQU0sT0FBTyxNQUFNLFNBQVMsSUFBSyxjQUFlLGdCQUFnQixTQUFTLE9BQU8sQ0FBQztBQUNqRixrQkFBWSxLQUFLLFlBQVksS0FBSyxvQkFBb0IsS0FBSyxJQUFJLEVBQUU7QUFFakUsWUFBTSxJQUFJLE1BQU07QUFHaEIsWUFBTSxPQUFPLE1BQU0sSUFBSSxzQkFBc0I7QUFDN0Msa0JBQVksS0FBTSxjQUFjLElBQUssWUFBWTtBQUlqRCxZQUFNLFNBQVMsSUFBSSxnQkFBZ0IsT0FBUSxNQUFNO0FBQ2pELFVBQUk7QUFDSCxjQUFNLFlBQVksT0FBTyxrQkFBa0IsT0FBTztBQUNsRCxvQkFBWSxVQUFVLFFBQVEsR0FBRyxtQ0FBbUMsVUFBVSxNQUFNLGVBQWUsS0FBSyxJQUFJLEdBQUc7QUFDL0csY0FBTSxRQUFRLFVBQVUsSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUs7QUFDOUMsd0JBQWdCLE9BQU8sQ0FBQywyQkFBMkIseUJBQXlCLENBQUM7QUFDN0UsY0FBTSxpQkFBaUIsVUFBVSxJQUFJLE9BQUssRUFBRSxjQUFjO0FBQzFELFdBQUcsZUFBZSxNQUFNLFFBQU0sT0FBTyxjQUFjLENBQUM7QUFDcEQsdUJBQWUsVUFBVSxDQUFDLEVBQUUsZUFBZSxJQUFJO0FBQUEsTUFDaEQsVUFBRTtBQUNELGVBQU8sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxJQUNELFVBQUU7QUFDRCxpQkFBVyxLQUFLO0FBQ2hCLFlBQU0sUUFBUTtBQUFBLElBQ2Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFVBQU0sTUFBTSxNQUFNLFFBQVEsS0FBSyxPQUFPLEdBQUcsa0JBQWtCLENBQUM7QUFDNUQsVUFBTSxVQUFVLE1BQU0sR0FBRyxLQUFLLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDLEVBQUUsTUFBTSxNQUFNLE1BQVM7QUFDckYsUUFBSTtBQUNILGNBQVEsSUFBSSx3Q0FBd0M7QUFDcEQsY0FBUSxJQUFJLHFEQUFxRDtBQUNqRSxjQUFRLElBQUksb0JBQW9CO0FBRWhDLFlBQU0sS0FBSyxNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUNuRCxTQUFHLElBQUksYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4QyxTQUFHLElBQUksMkJBQTJCLGVBQWUsR0FBRyxDQUFDO0FBQ3JELFlBQU0sTUFBTSxNQUFNLElBQUksR0FBRyxlQUFlLHNCQUFzQixNQUFTLENBQUM7QUFFeEUsWUFBTSxJQUFJLHNCQUFzQjtBQUNoQyxVQUFJLHdCQUF3QixjQUFjLDBCQUEwQixpQkFBaUIsSUFBSSxPQUFPLEdBQUcsQ0FBQyxFQUFFO0FBQ3RHLFlBQU0sSUFBSSxNQUFNO0FBRWhCLFlBQU0sU0FBUyxJQUFJLGVBQWU7QUFDbEMsU0FBRyxNQUFNO0FBQ1QsWUFBTSxTQUFTLElBQUksZ0JBQWdCLE9BQVEsTUFBTTtBQUNqRCxVQUFJO0FBQ0gsY0FBTSxRQUFRLE9BQU8seUJBQXlCLFlBQVk7QUFDMUQsb0JBQVksTUFBTSxRQUFRLENBQUM7QUFDM0Isb0JBQVksTUFBTSxDQUFDLEVBQUUsTUFBTSw2QkFBNkI7QUFDeEQsb0JBQVksT0FBTyxpQkFBaUIsTUFBTSxDQUFDLEVBQUUsU0FBUyw4QkFBOEIsR0FBRyxRQUFRLEdBQUc7QUFDbEcsb0JBQVksT0FBTyxpQkFBaUIsTUFBTSxDQUFDLEVBQUUsU0FBUyw0QkFBNEIsR0FBRyx3QkFBd0I7QUFDN0csb0JBQVksT0FBTyxpQkFBaUIsTUFBTSxDQUFDLEVBQUUsU0FBUyxjQUFjLEdBQUcsaUJBQWlCO0FBQUEsTUFDekYsVUFBRTtBQUNELGVBQU8sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxJQUNELFVBQUU7QUFDRCxpQkFBVyxLQUFLO0FBQ2hCLFlBQU0sUUFBUTtBQUFBLElBQ2Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFVBQU0sTUFBTSxNQUFNLFFBQVEsS0FBSyxPQUFPLEdBQUcsa0JBQWtCLENBQUM7QUFDNUQsVUFBTSxVQUFVLE1BQU0sR0FBRyxLQUFLLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDLEVBQUUsTUFBTSxNQUFNLE1BQVM7QUFDckYsUUFBSTtBQUNILGNBQVEsSUFBSSx3Q0FBd0M7QUFDcEQsY0FBUSxJQUFJLDZCQUE2QjtBQUd6QyxjQUFRLElBQUksOEJBQThCO0FBRTFDLFlBQU0sS0FBSyxNQUFNLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUNuRCxTQUFHLElBQUksYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUN4QyxTQUFHLElBQUksMkJBQTJCLGVBQWUsR0FBRyxDQUFDO0FBQ3JELFlBQU0sTUFBTSxNQUFNLElBQUksR0FBRyxlQUFlLHNCQUFzQixNQUFTLENBQUM7QUFFeEUsWUFBTSxNQUFNLE1BQU0sSUFBSSxzQkFBc0I7QUFDNUMsU0FBRyxJQUFLLGNBQWMsV0FBVyxtQkFBbUIsQ0FBQztBQUVyRCxxQkFBZSxJQUFLLGNBQWMsUUFBUSxJQUFJLDJCQUEyQjtBQUV6RSxZQUFNLFVBQVU7QUFDaEIsWUFBTSxNQUFNLE1BQU0sU0FBUyxJQUFLLGNBQWUsZ0JBQWdCLFNBQVMsa0JBQWtCLENBQUM7QUFDM0Ysa0JBQVksSUFBSSxZQUFZLEdBQUc7QUFHL0IsWUFBTSxJQUFJLE1BQU07QUFBQSxJQUNqQixVQUFFO0FBQ0QsaUJBQVcsS0FBSztBQUNoQixZQUFNLFFBQVE7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
