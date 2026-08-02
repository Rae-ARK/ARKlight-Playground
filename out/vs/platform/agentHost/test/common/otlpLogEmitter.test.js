import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { LogLevel } from "../../../log/common/log.js";
import {
  buildOtlpLogsChannelUri,
  extractLevelFromOtlpLogsUri,
  iterateOtlpLogRecords,
  levelToSeverityNumber,
  logLevelToOtlpLevelName,
  logLevelToOtlpSeverity,
  OtelData,
  OtlpEmitterLogger,
  OtlpLogEmitter,
  parseOtlpLogLevel,
  severityNumberToLogLevel,
  toResourceLogsPayload
} from "../../common/otlp/otlpLogEmitter.js";
suite("OtlpLogEmitter", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("level <-> severity number mappings are inverse-ish", () => {
    const cases = [
      [LogLevel.Trace, 1],
      [LogLevel.Debug, 5],
      [LogLevel.Info, 9],
      [LogLevel.Warning, 13],
      [LogLevel.Error, 17]
    ];
    const observed = cases.map(([level]) => {
      const { severityNumber, severityText } = logLevelToOtlpSeverity(level);
      return { level, severityNumber, severityText, roundTrip: severityNumberToLogLevel(severityNumber) };
    });
    assert.deepStrictEqual(observed, [
      { level: LogLevel.Trace, severityNumber: 1, severityText: "trace", roundTrip: LogLevel.Trace },
      { level: LogLevel.Debug, severityNumber: 5, severityText: "debug", roundTrip: LogLevel.Debug },
      { level: LogLevel.Info, severityNumber: 9, severityText: "info", roundTrip: LogLevel.Info },
      { level: LogLevel.Warning, severityNumber: 13, severityText: "warn", roundTrip: LogLevel.Warning },
      { level: LogLevel.Error, severityNumber: 17, severityText: "error", roundTrip: LogLevel.Error }
    ]);
  });
  test("parseOtlpLogLevel + level name helpers", () => {
    assert.deepStrictEqual(
      {
        trace: parseOtlpLogLevel("trace"),
        TRACE: parseOtlpLogLevel("TRACE"),
        fatal: parseOtlpLogLevel("Fatal"),
        bogus: parseOtlpLogLevel("verbose"),
        off: logLevelToOtlpLevelName(LogLevel.Off),
        info: logLevelToOtlpLevelName(LogLevel.Info),
        traceBoundary: levelToSeverityNumber("trace"),
        warnBoundary: levelToSeverityNumber("warn")
      },
      {
        trace: "trace",
        TRACE: "trace",
        fatal: "fatal",
        bogus: void 0,
        off: void 0,
        info: "info",
        traceBoundary: 1,
        warnBoundary: 13
      }
    );
  });
  test("OtlpEmitterLogger fans logs onto the shared emitter", () => {
    const emitter = disposables.add(new OtlpLogEmitter());
    const logger = disposables.add(new OtlpEmitterLogger(emitter, LogLevel.Trace));
    const received = [];
    disposables.add(emitter.onDidLog((record) => received.push(record)));
    logger.trace("hello trace");
    logger.debug("hello debug");
    logger.info("hello info");
    logger.warn("hello warn");
    logger.error("hello error");
    const sanitised = received.map((r) => ({ severityNumber: r.severityNumber, severityText: r.severityText, body: r.body }));
    assert.deepStrictEqual(sanitised, [
      { severityNumber: 1, severityText: "trace", body: "hello trace" },
      { severityNumber: 5, severityText: "debug", body: "hello debug" },
      { severityNumber: 9, severityText: "info", body: "hello info" },
      { severityNumber: 13, severityText: "warn", body: "hello warn" },
      { severityNumber: 17, severityText: "error", body: "hello error" }
    ]);
  });
  test("logger level gates which records reach the OTLP emitter", () => {
    const emitter = disposables.add(new OtlpLogEmitter());
    const otlpLogger = disposables.add(new OtlpEmitterLogger(emitter, LogLevel.Warning));
    const received = [];
    disposables.add(emitter.onDidLog((record) => received.push(record)));
    otlpLogger.trace("should-drop");
    otlpLogger.debug("should-drop");
    otlpLogger.info("should-drop");
    otlpLogger.warn("should-pass");
    otlpLogger.error("should-pass");
    assert.deepStrictEqual(received.map((r) => r.body), ["should-pass", "should-pass"]);
  });
  test("toResourceLogsPayload + iterateOtlpLogRecords round-trip", () => {
    const record = {
      timeUnixNano: "123000000",
      severityNumber: 9,
      severityText: "info",
      body: "a body"
    };
    const payload = toResourceLogsPayload(record);
    const decoded = [...iterateOtlpLogRecords(payload)];
    assert.deepStrictEqual(decoded, [record]);
  });
  test("OtelData attributes survive the OtlpEmitterLogger round-trip and stay out of the body", () => {
    const emitter = disposables.add(new OtlpLogEmitter());
    const logger = disposables.add(new OtlpEmitterLogger(emitter, LogLevel.Trace));
    const received = [];
    disposables.add(emitter.onDidLog((record) => received.push(record)));
    logger.info("MCP server started", new OtelData({ infoType: "mcp", attempt: 2, enabled: true }));
    logger.warn("plain warning");
    const roundTripped = received.map((r) => [...iterateOtlpLogRecords(toResourceLogsPayload(r))][0]);
    const sanitised = roundTripped.map((r) => ({ severityText: r.severityText, body: r.body, attributes: r.attributes }));
    assert.deepStrictEqual(sanitised, [
      { severityText: "info", body: "MCP server started", attributes: { infoType: "mcp", attempt: 2, enabled: true } },
      { severityText: "warn", body: "plain warning", attributes: void 0 }
    ]);
  });
  test("integer attributes are string-encoded on the OTLP wire", () => {
    const record = {
      timeUnixNano: "123000000",
      severityNumber: 9,
      severityText: "info",
      body: "a body",
      attributes: { count: 2, ratio: 1.5, label: "ready", enabled: true }
    };
    assert.deepStrictEqual(toResourceLogsPayload(record), {
      resourceLogs: [{
        resource: { attributes: [] },
        scopeLogs: [{
          scope: { name: "vscode.agentHost" },
          logRecords: [{
            timeUnixNano: "123000000",
            observedTimeUnixNano: "123000000",
            severityNumber: 9,
            severityText: "info",
            body: { stringValue: "a body" },
            attributes: [
              { key: "count", value: { intValue: "2" } },
              { key: "ratio", value: { doubleValue: 1.5 } },
              { key: "label", value: { stringValue: "ready" } },
              { key: "enabled", value: { boolValue: true } }
            ]
          }]
        }]
      }]
    });
  });
  test("invalid numeric OTLP attributes are ignored", () => {
    const decoded = [...iterateOtlpLogRecords({
      resourceLogs: [{
        scopeLogs: [{
          logRecords: [{
            timeUnixNano: "123000000",
            severityNumber: 9,
            severityText: "info",
            body: { stringValue: "a body" },
            attributes: [
              { key: "validInt", value: { intValue: "2" } },
              { key: "nanInt", value: { intValue: "not-a-number" } },
              { key: "unsafeInt", value: { intValue: "9007199254740992" } },
              { key: "infiniteDouble", value: { doubleValue: Infinity } }
            ]
          }]
        }]
      }]
    })];
    assert.deepStrictEqual(decoded, [{
      timeUnixNano: "123000000",
      severityNumber: 9,
      severityText: "info",
      body: "a body",
      attributes: { validInt: 2 }
    }]);
  });
  test("iterateOtlpLogRecords tolerates malformed shapes", () => {
    const decoded = [
      ...iterateOtlpLogRecords({ resourceLogs: [{ scopeLogs: [{ logRecords: [null, { severityNumber: "bad" }] }] }] }),
      ...iterateOtlpLogRecords({ resourceLogs: "nope" }),
      ...iterateOtlpLogRecords(void 0)
    ];
    assert.deepStrictEqual(decoded, [{
      timeUnixNano: "0",
      severityNumber: 0,
      severityText: "trace",
      body: ""
    }]);
  });
  test("buildOtlpLogsChannelUri + extractLevelFromOtlpLogsUri round-trip", () => {
    const cases = ["trace", "debug", "info", "warn", "error", "fatal"];
    assert.deepStrictEqual(
      cases.map((level) => ({ level, uri: buildOtlpLogsChannelUri(level), parsed: extractLevelFromOtlpLogsUri(buildOtlpLogsChannelUri(level)) })),
      cases.map((level) => ({ level, uri: `ahp-otlp://logs/${level}`, parsed: level }))
    );
  });
  test("extractLevelFromOtlpLogsUri rejects unknown shapes", () => {
    assert.deepStrictEqual(
      {
        bareScheme: extractLevelFromOtlpLogsUri("ahp-otlp://logs"),
        unknownLevel: extractLevelFromOtlpLogsUri("ahp-otlp://logs/verbose"),
        wrongScheme: extractLevelFromOtlpLogsUri("ahp-state://logs/info")
      },
      {
        bareScheme: void 0,
        unknownLevel: void 0,
        wrongScheme: void 0
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9vdGxwTG9nRW1pdHRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRidWlsZE90bHBMb2dzQ2hhbm5lbFVyaSxcblx0ZXh0cmFjdExldmVsRnJvbU90bHBMb2dzVXJpLFxuXHRpdGVyYXRlT3RscExvZ1JlY29yZHMsXG5cdGxldmVsVG9TZXZlcml0eU51bWJlcixcblx0bG9nTGV2ZWxUb090bHBMZXZlbE5hbWUsXG5cdGxvZ0xldmVsVG9PdGxwU2V2ZXJpdHksXG5cdE90ZWxEYXRhLFxuXHRPdGxwRW1pdHRlckxvZ2dlcixcblx0T3RscExvZ0VtaXR0ZXIsXG5cdHBhcnNlT3RscExvZ0xldmVsLFxuXHRzZXZlcml0eU51bWJlclRvTG9nTGV2ZWwsXG5cdHRvUmVzb3VyY2VMb2dzUGF5bG9hZCxcblx0dHlwZSBJT3RscExvZ1JlY29yZCxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL290bHAvb3RscExvZ0VtaXR0ZXIuanMnO1xuXG5zdWl0ZSgnT3RscExvZ0VtaXR0ZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2xldmVsIDwtPiBzZXZlcml0eSBudW1iZXIgbWFwcGluZ3MgYXJlIGludmVyc2UtaXNoJywgKCkgPT4ge1xuXHRcdC8vIEVhY2ggVlMgQ29kZSBsZXZlbCBcdTIxOTIgc2V2ZXJpdHkgbnVtYmVyLCB0aGVuIGJhY2ssIHNob3VsZCBsYW5kIG9uXG5cdFx0Ly8gdGhlIHNhbWUgbGV2ZWwgKHRoZSBib3VuZGFyeSBudW1iZXJzIGFyZSBwaWNrZWQgdG8gbWFrZSB0aGlzIGhvbGQpLlxuXHRcdGNvbnN0IGNhc2VzOiBbTG9nTGV2ZWwsIG51bWJlcl1bXSA9IFtcblx0XHRcdFtMb2dMZXZlbC5UcmFjZSwgMV0sXG5cdFx0XHRbTG9nTGV2ZWwuRGVidWcsIDVdLFxuXHRcdFx0W0xvZ0xldmVsLkluZm8sIDldLFxuXHRcdFx0W0xvZ0xldmVsLldhcm5pbmcsIDEzXSxcblx0XHRcdFtMb2dMZXZlbC5FcnJvciwgMTddLFxuXHRcdF07XG5cdFx0Y29uc3Qgb2JzZXJ2ZWQgPSBjYXNlcy5tYXAoKFtsZXZlbF0pID0+IHtcblx0XHRcdGNvbnN0IHsgc2V2ZXJpdHlOdW1iZXIsIHNldmVyaXR5VGV4dCB9ID0gbG9nTGV2ZWxUb090bHBTZXZlcml0eShsZXZlbCk7XG5cdFx0XHRyZXR1cm4geyBsZXZlbCwgc2V2ZXJpdHlOdW1iZXIsIHNldmVyaXR5VGV4dCwgcm91bmRUcmlwOiBzZXZlcml0eU51bWJlclRvTG9nTGV2ZWwoc2V2ZXJpdHlOdW1iZXIpIH07XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvYnNlcnZlZCwgW1xuXHRcdFx0eyBsZXZlbDogTG9nTGV2ZWwuVHJhY2UsIHNldmVyaXR5TnVtYmVyOiAxLCBzZXZlcml0eVRleHQ6ICd0cmFjZScsIHJvdW5kVHJpcDogTG9nTGV2ZWwuVHJhY2UgfSxcblx0XHRcdHsgbGV2ZWw6IExvZ0xldmVsLkRlYnVnLCBzZXZlcml0eU51bWJlcjogNSwgc2V2ZXJpdHlUZXh0OiAnZGVidWcnLCByb3VuZFRyaXA6IExvZ0xldmVsLkRlYnVnIH0sXG5cdFx0XHR7IGxldmVsOiBMb2dMZXZlbC5JbmZvLCBzZXZlcml0eU51bWJlcjogOSwgc2V2ZXJpdHlUZXh0OiAnaW5mbycsIHJvdW5kVHJpcDogTG9nTGV2ZWwuSW5mbyB9LFxuXHRcdFx0eyBsZXZlbDogTG9nTGV2ZWwuV2FybmluZywgc2V2ZXJpdHlOdW1iZXI6IDEzLCBzZXZlcml0eVRleHQ6ICd3YXJuJywgcm91bmRUcmlwOiBMb2dMZXZlbC5XYXJuaW5nIH0sXG5cdFx0XHR7IGxldmVsOiBMb2dMZXZlbC5FcnJvciwgc2V2ZXJpdHlOdW1iZXI6IDE3LCBzZXZlcml0eVRleHQ6ICdlcnJvcicsIHJvdW5kVHJpcDogTG9nTGV2ZWwuRXJyb3IgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VPdGxwTG9nTGV2ZWwgKyBsZXZlbCBuYW1lIGhlbHBlcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0dHJhY2U6IHBhcnNlT3RscExvZ0xldmVsKCd0cmFjZScpLFxuXHRcdFx0XHRUUkFDRTogcGFyc2VPdGxwTG9nTGV2ZWwoJ1RSQUNFJyksXG5cdFx0XHRcdGZhdGFsOiBwYXJzZU90bHBMb2dMZXZlbCgnRmF0YWwnKSxcblx0XHRcdFx0Ym9ndXM6IHBhcnNlT3RscExvZ0xldmVsKCd2ZXJib3NlJyksXG5cdFx0XHRcdG9mZjogbG9nTGV2ZWxUb090bHBMZXZlbE5hbWUoTG9nTGV2ZWwuT2ZmKSxcblx0XHRcdFx0aW5mbzogbG9nTGV2ZWxUb090bHBMZXZlbE5hbWUoTG9nTGV2ZWwuSW5mbyksXG5cdFx0XHRcdHRyYWNlQm91bmRhcnk6IGxldmVsVG9TZXZlcml0eU51bWJlcigndHJhY2UnKSxcblx0XHRcdFx0d2FybkJvdW5kYXJ5OiBsZXZlbFRvU2V2ZXJpdHlOdW1iZXIoJ3dhcm4nKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRyYWNlOiAndHJhY2UnLFxuXHRcdFx0XHRUUkFDRTogJ3RyYWNlJyxcblx0XHRcdFx0ZmF0YWw6ICdmYXRhbCcsXG5cdFx0XHRcdGJvZ3VzOiB1bmRlZmluZWQsXG5cdFx0XHRcdG9mZjogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbmZvOiAnaW5mbycsXG5cdFx0XHRcdHRyYWNlQm91bmRhcnk6IDEsXG5cdFx0XHRcdHdhcm5Cb3VuZGFyeTogMTMsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ090bHBFbWl0dGVyTG9nZ2VyIGZhbnMgbG9ncyBvbnRvIHRoZSBzaGFyZWQgZW1pdHRlcicsICgpID0+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPdGxwTG9nRW1pdHRlcigpKTtcblx0XHRjb25zdCBsb2dnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE90bHBFbWl0dGVyTG9nZ2VyKGVtaXR0ZXIsIExvZ0xldmVsLlRyYWNlKSk7XG5cdFx0Y29uc3QgcmVjZWl2ZWQ6IElPdGxwTG9nUmVjb3JkW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZW1pdHRlci5vbkRpZExvZyhyZWNvcmQgPT4gcmVjZWl2ZWQucHVzaChyZWNvcmQpKSk7XG5cblx0XHRsb2dnZXIudHJhY2UoJ2hlbGxvIHRyYWNlJyk7XG5cdFx0bG9nZ2VyLmRlYnVnKCdoZWxsbyBkZWJ1ZycpO1xuXHRcdGxvZ2dlci5pbmZvKCdoZWxsbyBpbmZvJyk7XG5cdFx0bG9nZ2VyLndhcm4oJ2hlbGxvIHdhcm4nKTtcblx0XHRsb2dnZXIuZXJyb3IoJ2hlbGxvIGVycm9yJyk7XG5cblx0XHQvLyBGaWx0ZXIgb3V0IHRpbWVzdGFtcCBmb3Igc3RhYmxlIGFzc2VydGlvbiAodGltZVVuaXhOYW5vIGlzIHJlYWwtdGltZSkuXG5cdFx0Y29uc3Qgc2FuaXRpc2VkID0gcmVjZWl2ZWQubWFwKHIgPT4gKHsgc2V2ZXJpdHlOdW1iZXI6IHIuc2V2ZXJpdHlOdW1iZXIsIHNldmVyaXR5VGV4dDogci5zZXZlcml0eVRleHQsIGJvZHk6IHIuYm9keSB9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzYW5pdGlzZWQsIFtcblx0XHRcdHsgc2V2ZXJpdHlOdW1iZXI6IDEsIHNldmVyaXR5VGV4dDogJ3RyYWNlJywgYm9keTogJ2hlbGxvIHRyYWNlJyB9LFxuXHRcdFx0eyBzZXZlcml0eU51bWJlcjogNSwgc2V2ZXJpdHlUZXh0OiAnZGVidWcnLCBib2R5OiAnaGVsbG8gZGVidWcnIH0sXG5cdFx0XHR7IHNldmVyaXR5TnVtYmVyOiA5LCBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ2hlbGxvIGluZm8nIH0sXG5cdFx0XHR7IHNldmVyaXR5TnVtYmVyOiAxMywgc2V2ZXJpdHlUZXh0OiAnd2FybicsIGJvZHk6ICdoZWxsbyB3YXJuJyB9LFxuXHRcdFx0eyBzZXZlcml0eU51bWJlcjogMTcsIHNldmVyaXR5VGV4dDogJ2Vycm9yJywgYm9keTogJ2hlbGxvIGVycm9yJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2dnZXIgbGV2ZWwgZ2F0ZXMgd2hpY2ggcmVjb3JkcyByZWFjaCB0aGUgT1RMUCBlbWl0dGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE90bHBMb2dFbWl0dGVyKCkpO1xuXHRcdGNvbnN0IG90bHBMb2dnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE90bHBFbWl0dGVyTG9nZ2VyKGVtaXR0ZXIsIExvZ0xldmVsLldhcm5pbmcpKTtcblx0XHRjb25zdCByZWNlaXZlZDogSU90bHBMb2dSZWNvcmRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlbWl0dGVyLm9uRGlkTG9nKHJlY29yZCA9PiByZWNlaXZlZC5wdXNoKHJlY29yZCkpKTtcblxuXHRcdG90bHBMb2dnZXIudHJhY2UoJ3Nob3VsZC1kcm9wJyk7XG5cdFx0b3RscExvZ2dlci5kZWJ1Zygnc2hvdWxkLWRyb3AnKTtcblx0XHRvdGxwTG9nZ2VyLmluZm8oJ3Nob3VsZC1kcm9wJyk7XG5cdFx0b3RscExvZ2dlci53YXJuKCdzaG91bGQtcGFzcycpO1xuXHRcdG90bHBMb2dnZXIuZXJyb3IoJ3Nob3VsZC1wYXNzJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY2VpdmVkLm1hcChyID0+IHIuYm9keSksIFsnc2hvdWxkLXBhc3MnLCAnc2hvdWxkLXBhc3MnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvUmVzb3VyY2VMb2dzUGF5bG9hZCArIGl0ZXJhdGVPdGxwTG9nUmVjb3JkcyByb3VuZC10cmlwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlY29yZDogSU90bHBMb2dSZWNvcmQgPSB7XG5cdFx0XHR0aW1lVW5peE5hbm86ICcxMjMwMDAwMDAnLFxuXHRcdFx0c2V2ZXJpdHlOdW1iZXI6IDksXG5cdFx0XHRzZXZlcml0eVRleHQ6ICdpbmZvJyxcblx0XHRcdGJvZHk6ICdhIGJvZHknLFxuXHRcdH07XG5cdFx0Y29uc3QgcGF5bG9hZCA9IHRvUmVzb3VyY2VMb2dzUGF5bG9hZChyZWNvcmQpO1xuXHRcdGNvbnN0IGRlY29kZWQgPSBbLi4uaXRlcmF0ZU90bHBMb2dSZWNvcmRzKHBheWxvYWQpXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlY29kZWQsIFtyZWNvcmRdKTtcblx0fSk7XG5cblx0dGVzdCgnT3RlbERhdGEgYXR0cmlidXRlcyBzdXJ2aXZlIHRoZSBPdGxwRW1pdHRlckxvZ2dlciByb3VuZC10cmlwIGFuZCBzdGF5IG91dCBvZiB0aGUgYm9keScsICgpID0+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPdGxwTG9nRW1pdHRlcigpKTtcblx0XHRjb25zdCBsb2dnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE90bHBFbWl0dGVyTG9nZ2VyKGVtaXR0ZXIsIExvZ0xldmVsLlRyYWNlKSk7XG5cdFx0Y29uc3QgcmVjZWl2ZWQ6IElPdGxwTG9nUmVjb3JkW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZW1pdHRlci5vbkRpZExvZyhyZWNvcmQgPT4gcmVjZWl2ZWQucHVzaChyZWNvcmQpKSk7XG5cblx0XHRsb2dnZXIuaW5mbygnTUNQIHNlcnZlciBzdGFydGVkJywgbmV3IE90ZWxEYXRhKHsgaW5mb1R5cGU6ICdtY3AnLCBhdHRlbXB0OiAyLCBlbmFibGVkOiB0cnVlIH0pKTtcblx0XHRsb2dnZXIud2FybigncGxhaW4gd2FybmluZycpO1xuXG5cdFx0Y29uc3Qgcm91bmRUcmlwcGVkID0gcmVjZWl2ZWQubWFwKHIgPT4gWy4uLml0ZXJhdGVPdGxwTG9nUmVjb3Jkcyh0b1Jlc291cmNlTG9nc1BheWxvYWQocikpXVswXSk7XG5cdFx0Y29uc3Qgc2FuaXRpc2VkID0gcm91bmRUcmlwcGVkLm1hcChyID0+ICh7IHNldmVyaXR5VGV4dDogci5zZXZlcml0eVRleHQsIGJvZHk6IHIuYm9keSwgYXR0cmlidXRlczogci5hdHRyaWJ1dGVzIH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNhbml0aXNlZCwgW1xuXHRcdFx0eyBzZXZlcml0eVRleHQ6ICdpbmZvJywgYm9keTogJ01DUCBzZXJ2ZXIgc3RhcnRlZCcsIGF0dHJpYnV0ZXM6IHsgaW5mb1R5cGU6ICdtY3AnLCBhdHRlbXB0OiAyLCBlbmFibGVkOiB0cnVlIH0gfSxcblx0XHRcdHsgc2V2ZXJpdHlUZXh0OiAnd2FybicsIGJvZHk6ICdwbGFpbiB3YXJuaW5nJywgYXR0cmlidXRlczogdW5kZWZpbmVkIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludGVnZXIgYXR0cmlidXRlcyBhcmUgc3RyaW5nLWVuY29kZWQgb24gdGhlIE9UTFAgd2lyZScsICgpID0+IHtcblx0XHRjb25zdCByZWNvcmQ6IElPdGxwTG9nUmVjb3JkID0ge1xuXHRcdFx0dGltZVVuaXhOYW5vOiAnMTIzMDAwMDAwJyxcblx0XHRcdHNldmVyaXR5TnVtYmVyOiA5LFxuXHRcdFx0c2V2ZXJpdHlUZXh0OiAnaW5mbycsXG5cdFx0XHRib2R5OiAnYSBib2R5Jyxcblx0XHRcdGF0dHJpYnV0ZXM6IHsgY291bnQ6IDIsIHJhdGlvOiAxLjUsIGxhYmVsOiAncmVhZHknLCBlbmFibGVkOiB0cnVlIH0sXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9SZXNvdXJjZUxvZ3NQYXlsb2FkKHJlY29yZCksIHtcblx0XHRcdHJlc291cmNlTG9nczogW3tcblx0XHRcdFx0cmVzb3VyY2U6IHsgYXR0cmlidXRlczogW10gfSxcblx0XHRcdFx0c2NvcGVMb2dzOiBbe1xuXHRcdFx0XHRcdHNjb3BlOiB7IG5hbWU6ICd2c2NvZGUuYWdlbnRIb3N0JyB9LFxuXHRcdFx0XHRcdGxvZ1JlY29yZHM6IFt7XG5cdFx0XHRcdFx0XHR0aW1lVW5peE5hbm86ICcxMjMwMDAwMDAnLFxuXHRcdFx0XHRcdFx0b2JzZXJ2ZWRUaW1lVW5peE5hbm86ICcxMjMwMDAwMDAnLFxuXHRcdFx0XHRcdFx0c2V2ZXJpdHlOdW1iZXI6IDksXG5cdFx0XHRcdFx0XHRzZXZlcml0eVRleHQ6ICdpbmZvJyxcblx0XHRcdFx0XHRcdGJvZHk6IHsgc3RyaW5nVmFsdWU6ICdhIGJvZHknIH0sXG5cdFx0XHRcdFx0XHRhdHRyaWJ1dGVzOiBbXG5cdFx0XHRcdFx0XHRcdHsga2V5OiAnY291bnQnLCB2YWx1ZTogeyBpbnRWYWx1ZTogJzInIH0gfSxcblx0XHRcdFx0XHRcdFx0eyBrZXk6ICdyYXRpbycsIHZhbHVlOiB7IGRvdWJsZVZhbHVlOiAxLjUgfSB9LFxuXHRcdFx0XHRcdFx0XHR7IGtleTogJ2xhYmVsJywgdmFsdWU6IHsgc3RyaW5nVmFsdWU6ICdyZWFkeScgfSB9LFxuXHRcdFx0XHRcdFx0XHR7IGtleTogJ2VuYWJsZWQnLCB2YWx1ZTogeyBib29sVmFsdWU6IHRydWUgfSB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCBudW1lcmljIE9UTFAgYXR0cmlidXRlcyBhcmUgaWdub3JlZCcsICgpID0+IHtcblx0XHRjb25zdCBkZWNvZGVkID0gWy4uLml0ZXJhdGVPdGxwTG9nUmVjb3Jkcyh7XG5cdFx0XHRyZXNvdXJjZUxvZ3M6IFt7XG5cdFx0XHRcdHNjb3BlTG9nczogW3tcblx0XHRcdFx0XHRsb2dSZWNvcmRzOiBbe1xuXHRcdFx0XHRcdFx0dGltZVVuaXhOYW5vOiAnMTIzMDAwMDAwJyxcblx0XHRcdFx0XHRcdHNldmVyaXR5TnVtYmVyOiA5LFxuXHRcdFx0XHRcdFx0c2V2ZXJpdHlUZXh0OiAnaW5mbycsXG5cdFx0XHRcdFx0XHRib2R5OiB7IHN0cmluZ1ZhbHVlOiAnYSBib2R5JyB9LFxuXHRcdFx0XHRcdFx0YXR0cmlidXRlczogW1xuXHRcdFx0XHRcdFx0XHR7IGtleTogJ3ZhbGlkSW50JywgdmFsdWU6IHsgaW50VmFsdWU6ICcyJyB9IH0sXG5cdFx0XHRcdFx0XHRcdHsga2V5OiAnbmFuSW50JywgdmFsdWU6IHsgaW50VmFsdWU6ICdub3QtYS1udW1iZXInIH0gfSxcblx0XHRcdFx0XHRcdFx0eyBrZXk6ICd1bnNhZmVJbnQnLCB2YWx1ZTogeyBpbnRWYWx1ZTogJzkwMDcxOTkyNTQ3NDA5OTInIH0gfSxcblx0XHRcdFx0XHRcdFx0eyBrZXk6ICdpbmZpbml0ZURvdWJsZScsIHZhbHVlOiB7IGRvdWJsZVZhbHVlOiBJbmZpbml0eSB9IH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdH1dLFxuXHRcdH0pXTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb2RlZCwgW3tcblx0XHRcdHRpbWVVbml4TmFubzogJzEyMzAwMDAwMCcsXG5cdFx0XHRzZXZlcml0eU51bWJlcjogOSxcblx0XHRcdHNldmVyaXR5VGV4dDogJ2luZm8nLFxuXHRcdFx0Ym9keTogJ2EgYm9keScsXG5cdFx0XHRhdHRyaWJ1dGVzOiB7IHZhbGlkSW50OiAyIH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpdGVyYXRlT3RscExvZ1JlY29yZHMgdG9sZXJhdGVzIG1hbGZvcm1lZCBzaGFwZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGVjb2RlZCA9IFtcblx0XHRcdC4uLml0ZXJhdGVPdGxwTG9nUmVjb3Jkcyh7IHJlc291cmNlTG9nczogW3sgc2NvcGVMb2dzOiBbeyBsb2dSZWNvcmRzOiBbbnVsbCwgeyBzZXZlcml0eU51bWJlcjogJ2JhZCcgfV0gfV0gfV0gfSksXG5cdFx0XHQuLi5pdGVyYXRlT3RscExvZ1JlY29yZHMoeyByZXNvdXJjZUxvZ3M6ICdub3BlJyB9KSxcblx0XHRcdC4uLml0ZXJhdGVPdGxwTG9nUmVjb3Jkcyh1bmRlZmluZWQpLFxuXHRcdF07XG5cdFx0Ly8gT25lIG1hbGZvcm1lZCByZWNvcmQgcGFzc2VzIHRocm91Z2ggd2l0aCBzZW5zaWJsZSBkZWZhdWx0czsgdGhlXG5cdFx0Ly8gcmVzdCBhcmUgc2lsZW50bHkgZHJvcHBlZCB3aXRob3V0IHRocm93aW5nLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb2RlZCwgW3tcblx0XHRcdHRpbWVVbml4TmFubzogJzAnLFxuXHRcdFx0c2V2ZXJpdHlOdW1iZXI6IDAsXG5cdFx0XHRzZXZlcml0eVRleHQ6ICd0cmFjZScsXG5cdFx0XHRib2R5OiAnJyxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkT3RscExvZ3NDaGFubmVsVXJpICsgZXh0cmFjdExldmVsRnJvbU90bHBMb2dzVXJpIHJvdW5kLXRyaXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FzZXMgPSBbJ3RyYWNlJywgJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvcicsICdmYXRhbCddIGFzIGNvbnN0O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRjYXNlcy5tYXAobGV2ZWwgPT4gKHsgbGV2ZWwsIHVyaTogYnVpbGRPdGxwTG9nc0NoYW5uZWxVcmkobGV2ZWwpLCBwYXJzZWQ6IGV4dHJhY3RMZXZlbEZyb21PdGxwTG9nc1VyaShidWlsZE90bHBMb2dzQ2hhbm5lbFVyaShsZXZlbCkpIH0pKSxcblx0XHRcdGNhc2VzLm1hcChsZXZlbCA9PiAoeyBsZXZlbCwgdXJpOiBgYWhwLW90bHA6Ly9sb2dzLyR7bGV2ZWx9YCwgcGFyc2VkOiBsZXZlbCB9KSksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdExldmVsRnJvbU90bHBMb2dzVXJpIHJlamVjdHMgdW5rbm93biBzaGFwZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0YmFyZVNjaGVtZTogZXh0cmFjdExldmVsRnJvbU90bHBMb2dzVXJpKCdhaHAtb3RscDovL2xvZ3MnKSxcblx0XHRcdFx0dW5rbm93bkxldmVsOiBleHRyYWN0TGV2ZWxGcm9tT3RscExvZ3NVcmkoJ2FocC1vdGxwOi8vbG9ncy92ZXJib3NlJyksXG5cdFx0XHRcdHdyb25nU2NoZW1lOiBleHRyYWN0TGV2ZWxGcm9tT3RscExvZ3NVcmkoJ2FocC1zdGF0ZTovL2xvZ3MvaW5mbycpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0YmFyZVNjaGVtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1bmtub3duTGV2ZWw6IHVuZGVmaW5lZCxcblx0XHRcdFx0d3JvbmdTY2hlbWU6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BRU07QUFFUCxNQUFNLGtCQUFrQixNQUFNO0FBRTdCLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxXQUFTLE1BQU0sWUFBWSxNQUFNLENBQUM7QUFDbEMsMENBQXdDO0FBRXhDLE9BQUssc0RBQXNELE1BQU07QUFHaEUsVUFBTSxRQUE4QjtBQUFBLE1BQ25DLENBQUMsU0FBUyxPQUFPLENBQUM7QUFBQSxNQUNsQixDQUFDLFNBQVMsT0FBTyxDQUFDO0FBQUEsTUFDbEIsQ0FBQyxTQUFTLE1BQU0sQ0FBQztBQUFBLE1BQ2pCLENBQUMsU0FBUyxTQUFTLEVBQUU7QUFBQSxNQUNyQixDQUFDLFNBQVMsT0FBTyxFQUFFO0FBQUEsSUFDcEI7QUFDQSxVQUFNLFdBQVcsTUFBTSxJQUFJLENBQUMsQ0FBQyxLQUFLLE1BQU07QUFDdkMsWUFBTSxFQUFFLGdCQUFnQixhQUFhLElBQUksdUJBQXVCLEtBQUs7QUFDckUsYUFBTyxFQUFFLE9BQU8sZ0JBQWdCLGNBQWMsV0FBVyx5QkFBeUIsY0FBYyxFQUFFO0FBQUEsSUFDbkcsQ0FBQztBQUNELFdBQU8sZ0JBQWdCLFVBQVU7QUFBQSxNQUNoQyxFQUFFLE9BQU8sU0FBUyxPQUFPLGdCQUFnQixHQUFHLGNBQWMs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
