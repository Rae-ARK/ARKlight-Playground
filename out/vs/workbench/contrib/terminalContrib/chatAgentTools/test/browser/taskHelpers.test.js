import * as assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { collectTerminalResults } from "../../browser/taskHelpers.js";
import { OutputMonitorState } from "../../browser/tools/monitoring/types.js";
suite("Task Helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("collectTerminalResults reads output from invocation start marker", async () => {
    const lines = ["old output", "more old output", "new output line 1", "new output line 2"];
    let markerDisposed = false;
    const marker = {
      line: 2,
      dispose: () => {
        markerDisposed = true;
      }
    };
    const terminal = {
      instanceId: 1,
      title: "task-terminal",
      shellLaunchConfig: { name: "task-terminal" },
      registerMarker: () => marker,
      xterm: {
        raw: {
          buffer: {
            active: {
              length: lines.length,
              getLine: (y) => ({ translateToString: () => lines[y] })
            }
          }
        }
      }
    };
    const task = {
      _label: "my-task",
      configurationProperties: {}
    };
    const invocationContext = {
      sessionResource: URI.parse("vscode-chat-session://test")
    };
    const instantiationService = {
      createInstance: (_ctor, execution) => {
        const didFinishEmitter = new Emitter();
        const monitor = {
          onDidFinishCommand: didFinishEmitter.event,
          pollingResult: {
            output: execution.getOutput(),
            pollDurationMs: 1,
            state: OutputMonitorState.Idle
          },
          outputMonitorTelemetryCounters: {
            inputToolManualAcceptCount: 0,
            inputToolManualRejectCount: 0,
            inputToolManualChars: 0,
            inputToolAutoAcceptCount: 0,
            inputToolAutoChars: 0,
            inputToolManualShownCount: 0,
            inputToolFreeFormInputShownCount: 0,
            inputToolFreeFormInputCount: 0
          },
          dispose: () => didFinishEmitter.dispose()
        };
        setTimeout(() => didFinishEmitter.fire(), 0);
        return monitor;
      }
    };
    const disposableStore = new DisposableStore();
    const results = await collectTerminalResults(
      [terminal],
      task,
      instantiationService,
      invocationContext,
      { report: () => {
      } },
      CancellationToken.None,
      disposableStore
    );
    disposableStore.dispose();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].output, "new output line 1\nnew output line 2");
    assert.strictEqual(markerDisposed, true);
  });
  test("collectTerminalResults uses provided pre-run marker when present", async () => {
    const lines = ["old output", "new output line 1", "new output line 2", "* Terminal will be reused by tasks, press any key to close it."];
    let defaultMarkerDisposed = false;
    let preRunMarkerDisposed = false;
    const defaultMarker = {
      line: 3,
      dispose: () => {
        defaultMarkerDisposed = true;
      }
    };
    const preRunMarker = {
      id: 1,
      line: 1,
      isDisposed: false,
      onDispose: new Emitter().event,
      dispose: () => {
        preRunMarkerDisposed = true;
      }
    };
    const terminal = {
      instanceId: 1,
      title: "task-terminal",
      shellLaunchConfig: { name: "task-terminal" },
      registerMarker: () => defaultMarker,
      xterm: {
        raw: {
          buffer: {
            active: {
              length: lines.length,
              getLine: (y) => ({ translateToString: () => lines[y] })
            }
          }
        }
      }
    };
    const task = {
      _label: "my-task",
      configurationProperties: {}
    };
    const invocationContext = {
      sessionResource: URI.parse("vscode-chat-session://test")
    };
    const instantiationService = {
      createInstance: (_ctor, execution) => {
        const didFinishEmitter = new Emitter();
        const monitor = {
          onDidFinishCommand: didFinishEmitter.event,
          pollingResult: {
            output: execution.getOutput(),
            pollDurationMs: 1,
            state: OutputMonitorState.Idle
          },
          outputMonitorTelemetryCounters: {
            inputToolManualAcceptCount: 0,
            inputToolManualRejectCount: 0,
            inputToolManualChars: 0,
            inputToolAutoAcceptCount: 0,
            inputToolAutoChars: 0,
            inputToolManualShownCount: 0,
            inputToolFreeFormInputShownCount: 0,
            inputToolFreeFormInputCount: 0
          },
          dispose: () => didFinishEmitter.dispose()
        };
        setTimeout(() => didFinishEmitter.fire(), 0);
        return monitor;
      }
    };
    const startMarkersByTerminalInstanceId = /* @__PURE__ */ new Map();
    startMarkersByTerminalInstanceId.set(terminal.instanceId, preRunMarker);
    const disposableStore = new DisposableStore();
    const results = await collectTerminalResults(
      [terminal],
      task,
      instantiationService,
      invocationContext,
      { report: () => {
      } },
      CancellationToken.None,
      disposableStore,
      void 0,
      void 0,
      void 0,
      startMarkersByTerminalInstanceId
    );
    disposableStore.dispose();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].output, "new output line 1\nnew output line 2\n* Terminal will be reused by tasks, press any key to close it.");
    assert.strictEqual(preRunMarkerDisposed, true);
    assert.strictEqual(defaultMarkerDisposed, false);
  });
  test("collectTerminalResults reads full output when pre-run marker map has no marker for terminal", async () => {
    const lines = ["new output line 1", "new output line 2", "* Terminal will be reused by tasks, press any key to close it."];
    let defaultMarkerDisposed = false;
    const defaultMarker = {
      line: 1,
      dispose: () => {
        defaultMarkerDisposed = true;
      }
    };
    const terminal = {
      instanceId: 1,
      title: "task-terminal",
      shellLaunchConfig: { name: "task-terminal" },
      registerMarker: () => defaultMarker,
      xterm: {
        raw: {
          buffer: {
            active: {
              length: lines.length,
              getLine: (y) => ({ translateToString: () => lines[y] })
            }
          }
        }
      }
    };
    const task = {
      _label: "my-task",
      configurationProperties: {}
    };
    const invocationContext = {
      sessionResource: URI.parse("vscode-chat-session://test")
    };
    const instantiationService = {
      createInstance: (_ctor, execution) => {
        const didFinishEmitter = new Emitter();
        const monitor = {
          onDidFinishCommand: didFinishEmitter.event,
          pollingResult: {
            output: execution.getOutput(),
            pollDurationMs: 1,
            state: OutputMonitorState.Idle
          },
          outputMonitorTelemetryCounters: {
            inputToolManualAcceptCount: 0,
            inputToolManualRejectCount: 0,
            inputToolManualChars: 0,
            inputToolAutoAcceptCount: 0,
            inputToolAutoChars: 0,
            inputToolManualShownCount: 0,
            inputToolFreeFormInputShownCount: 0,
            inputToolFreeFormInputCount: 0
          },
          dispose: () => didFinishEmitter.dispose()
        };
        setTimeout(() => didFinishEmitter.fire(), 0);
        return monitor;
      }
    };
    const startMarkersByTerminalInstanceId = /* @__PURE__ */ new Map();
    const disposableStore = new DisposableStore();
    const results = await collectTerminalResults(
      [terminal],
      task,
      instantiationService,
      invocationContext,
      { report: () => {
      } },
      CancellationToken.None,
      disposableStore,
      void 0,
      void 0,
      void 0,
      startMarkersByTerminalInstanceId
    );
    disposableStore.dispose();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].output, "new output line 1\nnew output line 2\n* Terminal will be reused by tasks, press any key to close it.");
    assert.strictEqual(defaultMarkerDisposed, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvdGFza0hlbHBlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElUb29sSW52b2NhdGlvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRhc2sgfSBmcm9tICcuLi8uLi8uLi8uLi90YXNrcy9jb21tb24vdGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGNvbGxlY3RUZXJtaW5hbFJlc3VsdHMgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rhc2tIZWxwZXJzLmpzJztcbmltcG9ydCB7IElFeGVjdXRpb24sIE91dHB1dE1vbml0b3JTdGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvbW9uaXRvcmluZy90eXBlcy5qcyc7XG5cbnN1aXRlKCdUYXNrIEhlbHBlcnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NvbGxlY3RUZXJtaW5hbFJlc3VsdHMgcmVhZHMgb3V0cHV0IGZyb20gaW52b2NhdGlvbiBzdGFydCBtYXJrZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbJ29sZCBvdXRwdXQnLCAnbW9yZSBvbGQgb3V0cHV0JywgJ25ldyBvdXRwdXQgbGluZSAxJywgJ25ldyBvdXRwdXQgbGluZSAyJ107XG5cdFx0bGV0IG1hcmtlckRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgbWFya2VyID0ge1xuXHRcdFx0bGluZTogMixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgbWFya2VyRGlzcG9zZWQgPSB0cnVlOyB9XG5cdFx0fTtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHtcblx0XHRcdGluc3RhbmNlSWQ6IDEsXG5cdFx0XHR0aXRsZTogJ3Rhc2stdGVybWluYWwnLFxuXHRcdFx0c2hlbGxMYXVuY2hDb25maWc6IHsgbmFtZTogJ3Rhc2stdGVybWluYWwnIH0sXG5cdFx0XHRyZWdpc3Rlck1hcmtlcjogKCkgPT4gbWFya2VyLFxuXHRcdFx0eHRlcm06IHtcblx0XHRcdFx0cmF3OiB7XG5cdFx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0XHRhY3RpdmU6IHtcblx0XHRcdFx0XHRcdFx0bGVuZ3RoOiBsaW5lcy5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdGdldExpbmU6ICh5OiBudW1iZXIpID0+ICh7IHRyYW5zbGF0ZVRvU3RyaW5nOiAoKSA9PiBsaW5lc1t5XSB9KVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRjb25zdCB0YXNrID0ge1xuXHRcdFx0X2xhYmVsOiAnbXktdGFzaycsXG5cdFx0XHRjb25maWd1cmF0aW9uUHJvcGVydGllczoge31cblx0XHR9IGFzIFRhc2s7XG5cdFx0Y29uc3QgaW52b2NhdGlvbkNvbnRleHQ6IElUb29sSW52b2NhdGlvbkNvbnRleHQgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL3Rlc3QnKVxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVJbnN0YW5jZTogKF9jdG9yOiB1bmtub3duLCBleGVjdXRpb246IElFeGVjdXRpb24pID0+IHtcblx0XHRcdFx0Y29uc3QgZGlkRmluaXNoRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRcdGNvbnN0IG1vbml0b3IgPSB7XG5cdFx0XHRcdFx0b25EaWRGaW5pc2hDb21tYW5kOiBkaWRGaW5pc2hFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdHBvbGxpbmdSZXN1bHQ6IHtcblx0XHRcdFx0XHRcdG91dHB1dDogZXhlY3V0aW9uLmdldE91dHB1dCgpLFxuXHRcdFx0XHRcdFx0cG9sbER1cmF0aW9uTXM6IDEsXG5cdFx0XHRcdFx0XHRzdGF0ZTogT3V0cHV0TW9uaXRvclN0YXRlLklkbGVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVyczoge1xuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsQWNjZXB0Q291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxSZWplY3RDb3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbENoYXJzOiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sQXV0b0FjY2VwdENvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sQXV0b0NoYXJzOiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsU2hvd25Db3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50OiAwLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlkRmluaXNoRW1pdHRlci5kaXNwb3NlKClcblx0XHRcdFx0fTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBkaWRGaW5pc2hFbWl0dGVyLmZpcmUoKSwgMCk7XG5cdFx0XHRcdHJldHVybiBtb25pdG9yO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IGNvbGxlY3RUZXJtaW5hbFJlc3VsdHMoXG5cdFx0XHRbdGVybWluYWxdLFxuXHRcdFx0dGFzayxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0aW52b2NhdGlvbkNvbnRleHQsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlXG5cdFx0KTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0c1swXS5vdXRwdXQsICduZXcgb3V0cHV0IGxpbmUgMVxcbm5ldyBvdXRwdXQgbGluZSAyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlckRpc3Bvc2VkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY29sbGVjdFRlcm1pbmFsUmVzdWx0cyB1c2VzIHByb3ZpZGVkIHByZS1ydW4gbWFya2VyIHdoZW4gcHJlc2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IFsnb2xkIG91dHB1dCcsICduZXcgb3V0cHV0IGxpbmUgMScsICduZXcgb3V0cHV0IGxpbmUgMicsICcqIFRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLCBwcmVzcyBhbnkga2V5IHRvIGNsb3NlIGl0LiddO1xuXHRcdGxldCBkZWZhdWx0TWFya2VyRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRsZXQgcHJlUnVuTWFya2VyRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRjb25zdCBkZWZhdWx0TWFya2VyID0ge1xuXHRcdFx0bGluZTogMyxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgZGVmYXVsdE1hcmtlckRpc3Bvc2VkID0gdHJ1ZTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgcHJlUnVuTWFya2VyID0ge1xuXHRcdFx0aWQ6IDEsXG5cdFx0XHRsaW5lOiAxLFxuXHRcdFx0aXNEaXNwb3NlZDogZmFsc2UsXG5cdFx0XHRvbkRpc3Bvc2U6IG5ldyBFbWl0dGVyPHZvaWQ+KCkuZXZlbnQsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IHByZVJ1bk1hcmtlckRpc3Bvc2VkID0gdHJ1ZTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgdGVybWluYWwgPSB7XG5cdFx0XHRpbnN0YW5jZUlkOiAxLFxuXHRcdFx0dGl0bGU6ICd0YXNrLXRlcm1pbmFsJyxcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnOiB7IG5hbWU6ICd0YXNrLXRlcm1pbmFsJyB9LFxuXHRcdFx0cmVnaXN0ZXJNYXJrZXI6ICgpID0+IGRlZmF1bHRNYXJrZXIsXG5cdFx0XHR4dGVybToge1xuXHRcdFx0XHRyYXc6IHtcblx0XHRcdFx0XHRidWZmZXI6IHtcblx0XHRcdFx0XHRcdGFjdGl2ZToge1xuXHRcdFx0XHRcdFx0XHRsZW5ndGg6IGxpbmVzLmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0Z2V0TGluZTogKHk6IG51bWJlcikgPT4gKHsgdHJhbnNsYXRlVG9TdHJpbmc6ICgpID0+IGxpbmVzW3ldIH0pXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IHRhc2sgPSB7XG5cdFx0XHRfbGFiZWw6ICdteS10YXNrJyxcblx0XHRcdGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiB7fVxuXHRcdH0gYXMgVGFzaztcblx0XHRjb25zdCBpbnZvY2F0aW9uQ29udGV4dDogSVRvb2xJbnZvY2F0aW9uQ29udGV4dCA9IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vdGVzdCcpXG5cdFx0fTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHtcblx0XHRcdGNyZWF0ZUluc3RhbmNlOiAoX2N0b3I6IHVua25vd24sIGV4ZWN1dGlvbjogSUV4ZWN1dGlvbikgPT4ge1xuXHRcdFx0XHRjb25zdCBkaWRGaW5pc2hFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdFx0Y29uc3QgbW9uaXRvciA9IHtcblx0XHRcdFx0XHRvbkRpZEZpbmlzaENvbW1hbmQ6IGRpZEZpbmlzaEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0cG9sbGluZ1Jlc3VsdDoge1xuXHRcdFx0XHRcdFx0b3V0cHV0OiBleGVjdXRpb24uZ2V0T3V0cHV0KCksXG5cdFx0XHRcdFx0XHRwb2xsRHVyYXRpb25NczogMSxcblx0XHRcdFx0XHRcdHN0YXRlOiBPdXRwdXRNb25pdG9yU3RhdGUuSWRsZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b3V0cHV0TW9uaXRvclRlbGVtZXRyeUNvdW50ZXJzOiB7XG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxBY2NlcHRDb3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbFJlamVjdENvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsQ2hhcnM6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xBdXRvQWNjZXB0Q291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xBdXRvQ2hhcnM6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxTaG93bkNvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dFNob3duQ291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0Q291bnQ6IDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBkaWRGaW5pc2hFbWl0dGVyLmRpc3Bvc2UoKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IGRpZEZpbmlzaEVtaXR0ZXIuZmlyZSgpLCAwKTtcblx0XHRcdFx0cmV0dXJuIG1vbml0b3I7XG5cdFx0XHR9XG5cdFx0fSBhcyB1bmtub3duIGFzIElJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRcdGNvbnN0IHN0YXJ0TWFya2Vyc0J5VGVybWluYWxJbnN0YW5jZUlkID0gbmV3IE1hcDxudW1iZXIsIFJldHVyblR5cGU8SVRlcm1pbmFsSW5zdGFuY2VbJ3JlZ2lzdGVyTWFya2VyJ10+PigpO1xuXHRcdHN0YXJ0TWFya2Vyc0J5VGVybWluYWxJbnN0YW5jZUlkLnNldCh0ZXJtaW5hbC5pbnN0YW5jZUlkLCBwcmVSdW5NYXJrZXIgYXMgUmV0dXJuVHlwZTxJVGVybWluYWxJbnN0YW5jZVsncmVnaXN0ZXJNYXJrZXInXT4pO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBjb2xsZWN0VGVybWluYWxSZXN1bHRzKFxuXHRcdFx0W3Rlcm1pbmFsXSxcblx0XHRcdHRhc2ssXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdGludm9jYXRpb25Db250ZXh0LFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdGRpc3Bvc2FibGVTdG9yZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHN0YXJ0TWFya2Vyc0J5VGVybWluYWxJbnN0YW5jZUlkXG5cdFx0KTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0c1swXS5vdXRwdXQsICduZXcgb3V0cHV0IGxpbmUgMVxcbm5ldyBvdXRwdXQgbGluZSAyXFxuKiBUZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcywgcHJlc3MgYW55IGtleSB0byBjbG9zZSBpdC4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlUnVuTWFya2VyRGlzcG9zZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZhdWx0TWFya2VyRGlzcG9zZWQsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY29sbGVjdFRlcm1pbmFsUmVzdWx0cyByZWFkcyBmdWxsIG91dHB1dCB3aGVuIHByZS1ydW4gbWFya2VyIG1hcCBoYXMgbm8gbWFya2VyIGZvciB0ZXJtaW5hbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IFsnbmV3IG91dHB1dCBsaW5lIDEnLCAnbmV3IG91dHB1dCBsaW5lIDInLCAnKiBUZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcywgcHJlc3MgYW55IGtleSB0byBjbG9zZSBpdC4nXTtcblx0XHRsZXQgZGVmYXVsdE1hcmtlckRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgZGVmYXVsdE1hcmtlciA9IHtcblx0XHRcdGxpbmU6IDEsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IGRlZmF1bHRNYXJrZXJEaXNwb3NlZCA9IHRydWU7IH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlcm1pbmFsID0ge1xuXHRcdFx0aW5zdGFuY2VJZDogMSxcblx0XHRcdHRpdGxlOiAndGFzay10ZXJtaW5hbCcsXG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZzogeyBuYW1lOiAndGFzay10ZXJtaW5hbCcgfSxcblx0XHRcdHJlZ2lzdGVyTWFya2VyOiAoKSA9PiBkZWZhdWx0TWFya2VyLFxuXHRcdFx0eHRlcm06IHtcblx0XHRcdFx0cmF3OiB7XG5cdFx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0XHRhY3RpdmU6IHtcblx0XHRcdFx0XHRcdFx0bGVuZ3RoOiBsaW5lcy5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdGdldExpbmU6ICh5OiBudW1iZXIpID0+ICh7IHRyYW5zbGF0ZVRvU3RyaW5nOiAoKSA9PiBsaW5lc1t5XSB9KVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRjb25zdCB0YXNrID0ge1xuXHRcdFx0X2xhYmVsOiAnbXktdGFzaycsXG5cdFx0XHRjb25maWd1cmF0aW9uUHJvcGVydGllczoge31cblx0XHR9IGFzIFRhc2s7XG5cdFx0Y29uc3QgaW52b2NhdGlvbkNvbnRleHQ6IElUb29sSW52b2NhdGlvbkNvbnRleHQgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL3Rlc3QnKVxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVJbnN0YW5jZTogKF9jdG9yOiB1bmtub3duLCBleGVjdXRpb246IElFeGVjdXRpb24pID0+IHtcblx0XHRcdFx0Y29uc3QgZGlkRmluaXNoRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRcdGNvbnN0IG1vbml0b3IgPSB7XG5cdFx0XHRcdFx0b25EaWRGaW5pc2hDb21tYW5kOiBkaWRGaW5pc2hFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdHBvbGxpbmdSZXN1bHQ6IHtcblx0XHRcdFx0XHRcdG91dHB1dDogZXhlY3V0aW9uLmdldE91dHB1dCgpLFxuXHRcdFx0XHRcdFx0cG9sbER1cmF0aW9uTXM6IDEsXG5cdFx0XHRcdFx0XHRzdGF0ZTogT3V0cHV0TW9uaXRvclN0YXRlLklkbGVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVyczoge1xuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsQWNjZXB0Q291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxSZWplY3RDb3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbENoYXJzOiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sQXV0b0FjY2VwdENvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sQXV0b0NoYXJzOiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsU2hvd25Db3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50OiAwLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlkRmluaXNoRW1pdHRlci5kaXNwb3NlKClcblx0XHRcdFx0fTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBkaWRGaW5pc2hFbWl0dGVyLmZpcmUoKSwgMCk7XG5cdFx0XHRcdHJldHVybiBtb25pdG9yO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHRjb25zdCBzdGFydE1hcmtlcnNCeVRlcm1pbmFsSW5zdGFuY2VJZCA9IG5ldyBNYXA8bnVtYmVyLCBSZXR1cm5UeXBlPElUZXJtaW5hbEluc3RhbmNlWydyZWdpc3Rlck1hcmtlciddPj4oKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgY29sbGVjdFRlcm1pbmFsUmVzdWx0cyhcblx0XHRcdFt0ZXJtaW5hbF0sXG5cdFx0XHR0YXNrLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRpbnZvY2F0aW9uQ29udGV4dCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRzdGFydE1hcmtlcnNCeVRlcm1pbmFsSW5zdGFuY2VJZFxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNbMF0ub3V0cHV0LCAnbmV3IG91dHB1dCBsaW5lIDFcXG5uZXcgb3V0cHV0IGxpbmUgMlxcbiogVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXQuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHRNYXJrZXJEaXNwb3NlZCwgZmFsc2UpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFFcEIsU0FBUywrQ0FBK0M7QUFJeEQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBcUIsMEJBQTBCO0FBRS9DLE1BQU0sZ0JBQWdCLE1BQU07QUFDM0IsMENBQXdDO0FBRXhDLE9BQUssb0VBQW9FLFlBQVk7QUFDcEYsVUFBTSxRQUFRLENBQUMsY0FBYyxtQkFBbUIscUJBQXFCLG1CQUFtQjtBQUN4RixRQUFJLGlCQUFpQjtBQUNyQixVQUFNLFNBQVM7QUFBQSxNQUNkLE1BQU07QUFBQSxNQUNOLFNBQVMsTUFBTTtBQUFFLHlCQUFpQjtBQUFBLE1BQU07QUFBQSxJQUN6QztBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCLFlBQVk7QUFBQSxNQUNaLE9BQU87QUFBQSxNQUNQLG1CQUFtQixFQUFFLE1BQU0sZ0JBQWdCO0FBQUEsTUFDM0MsZ0JBQWdCLE1BQU07QUFBQSxNQUN0QixPQUFPO0FBQUEsUUFDTixLQUFLO0FBQUEsVUFDSixRQUFRO0FBQUEsWUFDUCxRQUFRO0FBQUEsY0FDUCxRQUFRLE1BQU07QUFBQSxjQUNkLFNB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
