import { rejects, strictEqual } from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { RichExecuteStrategy } from "../../browser/executeStrategy/richExecuteStrategy.js";
function createLogService() {
  return new class extends NullLogService {
    constructor() {
      super(...arguments);
      this._logBrand = void 0;
    }
  }();
}
suite("RichExecuteStrategy", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("passes separate command line metadata when running a wrapped command", async () => {
    const onCommandFinishedEmitter = new Emitter();
    let actualCommandLine;
    let actualCommandId;
    let actualCommandLineForMetadata;
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      raw: {
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: () => toDisposable(() => {
          })
        },
        getContentsAsText: () => ""
      }
    };
    const instance = {
      xtermReadyPromise: Promise.resolve(xterm),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: Event.None,
      runCommand: (commandLine, _shouldExecute, commandId, _forceBracketedPasteMode, commandLineForMetadata) => {
        actualCommandLine = commandLine;
        actualCommandId = commandId;
        actualCommandLineForMetadata = commandLineForMetadata;
        queueMicrotask(() => onCommandFinishedEmitter.fire({ getOutput: () => "output", exitCode: 0 }));
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    await strategy.execute("sandbox:echo hello", CancellationToken.None, "tool-command-id", "echo hello");
    strictEqual(actualCommandLine, "sandbox:echo hello");
    strictEqual(actualCommandId, "tool-command-id");
    strictEqual(actualCommandLineForMetadata, "echo hello");
  });
  test("completes when terminal process exits without shell integration sequences", async () => {
    const onCommandFinishedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      raw: {
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: () => toDisposable(() => {
          })
        },
        getContentsAsText: () => "some output"
      }
    };
    const instance = {
      xtermReadyPromise: Promise.resolve(xterm),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: onExitEmitter.event,
      runCommand: () => {
        queueMicrotask(() => onExitEmitter.fire(1));
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("exit 1", CancellationToken.None);
    strictEqual(result.exitCode, 1);
  });
  test("handles ITerminalLaunchError on process exit", async () => {
    const onCommandFinishedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      raw: {
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: () => toDisposable(() => {
          })
        },
        getContentsAsText: () => ""
      }
    };
    const instance = {
      xtermReadyPromise: Promise.resolve(xterm),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: onExitEmitter.event,
      runCommand: () => {
        queueMicrotask(() => onExitEmitter.fire({ message: "Failed to launch", code: 127 }));
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("bad-command", CancellationToken.None);
    strictEqual(result.exitCode, 127);
  });
  test("returns immediately with captured exit code when pty has already exited before execute()", async () => {
    const onCommandFinishedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const instance = {
      xtermReadyPromise: Promise.resolve({}),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: onExitEmitter.event,
      isDisposed: false,
      exitCode: 1,
      runCommand: () => {
        throw new Error("runCommand should not be called when pty already exited");
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("Rscript /app/ars.R", CancellationToken.None);
    strictEqual(result.exitCode, 1);
    strictEqual(result.output, void 0);
    strictEqual(result.additionalInformation, "Command exited with code 1");
  });
  test('throws "The terminal was closed" when instance is already disposed before execute()', async () => {
    const onCommandFinishedEmitter = new Emitter();
    const instance = {
      xtermReadyPromise: Promise.resolve({}),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: Event.None,
      isDisposed: true,
      exitCode: void 0,
      runCommand: () => {
        throw new Error("runCommand should not be called when terminal is disposed");
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    await rejects(
      () => strategy.execute("echo hello", CancellationToken.None),
      /The terminal was closed/
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvcmljaEV4ZWN1dGVTdHJhdGVneS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmVqZWN0cywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBSaWNoRXhlY3V0ZVN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9leGVjdXRlU3RyYXRlZ3kvcmljaEV4ZWN1dGVTdHJhdGVneS5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlTG9nU2VydmljZSgpOiBJVGVybWluYWxMb2dTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHsgcmVhZG9ubHkgX2xvZ0JyYW5kID0gdW5kZWZpbmVkOyB9O1xufVxuXG5zdWl0ZSgnUmljaEV4ZWN1dGVTdHJhdGVneScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwYXNzZXMgc2VwYXJhdGUgY29tbWFuZCBsaW5lIG1ldGFkYXRhIHdoZW4gcnVubmluZyBhIHdyYXBwZWQgY29tbWFuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGdldE91dHB1dCgpOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfT4oKTtcblx0XHRsZXQgYWN0dWFsQ29tbWFuZExpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWN0dWFsQ29tbWFuZElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGFjdHVhbENvbW1hbmRMaW5lRm9yTWV0YWRhdGE6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG1hcmtlciA9IHtcblx0XHRcdGxpbmU6IDAsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRvbkRpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0XHRjb25zdCB4dGVybSA9IHtcblx0XHRcdHJhdzoge1xuXHRcdFx0XHRyZWdpc3Rlck1hcmtlcjogKCkgPT4gbWFya2VyLFxuXHRcdFx0XHRidWZmZXI6IHtcblx0XHRcdFx0XHRhY3RpdmU6IHt9LFxuXHRcdFx0XHRcdGFsdGVybmF0ZToge30sXG5cdFx0XHRcdFx0b25CdWZmZXJDaGFuZ2U6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRDb250ZW50c0FzVGV4dDogKCkgPT4gJycsXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHtcblx0XHRcdHh0ZXJtUmVhZHlQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoeHRlcm0pLFxuXHRcdFx0b25EYXRhOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaXNwb3NlZDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRXhpdDogRXZlbnQuTm9uZSxcblx0XHRcdHJ1bkNvbW1hbmQ6IChjb21tYW5kTGluZTogc3RyaW5nLCBfc2hvdWxkRXhlY3V0ZTogYm9vbGVhbiwgY29tbWFuZElkPzogc3RyaW5nLCBfZm9yY2VCcmFja2V0ZWRQYXN0ZU1vZGU/OiBib29sZWFuLCBjb21tYW5kTGluZUZvck1ldGFkYXRhPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGFjdHVhbENvbW1hbmRMaW5lID0gY29tbWFuZExpbmU7XG5cdFx0XHRcdGFjdHVhbENvbW1hbmRJZCA9IGNvbW1hbmRJZDtcblx0XHRcdFx0YWN0dWFsQ29tbWFuZExpbmVGb3JNZXRhZGF0YSA9IGNvbW1hbmRMaW5lRm9yTWV0YWRhdGE7XG5cdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlci5maXJlKHsgZ2V0T3V0cHV0OiAoKSA9PiAnb3V0cHV0JywgZXhpdENvZGU6IDAgfSkpO1xuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHtcblx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkOiBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eTtcblx0XHRjb25zdCBzdHJhdGVneSA9IHN0b3JlLmFkZChuZXcgUmljaEV4ZWN1dGVTdHJhdGVneShcblx0XHRcdGluc3RhbmNlLFxuXHRcdFx0Y29tbWFuZERldGVjdGlvbixcblx0XHRcdGZhbHNlLFxuXHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlTG9nU2VydmljZSgpLFxuXHRcdCkpO1xuXG5cdFx0YXdhaXQgc3RyYXRlZ3kuZXhlY3V0ZSgnc2FuZGJveDplY2hvIGhlbGxvJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgJ3Rvb2wtY29tbWFuZC1pZCcsICdlY2hvIGhlbGxvJyk7XG5cblx0XHRzdHJpY3RFcXVhbChhY3R1YWxDb21tYW5kTGluZSwgJ3NhbmRib3g6ZWNobyBoZWxsbycpO1xuXHRcdHN0cmljdEVxdWFsKGFjdHVhbENvbW1hbmRJZCwgJ3Rvb2wtY29tbWFuZC1pZCcpO1xuXHRcdHN0cmljdEVxdWFsKGFjdHVhbENvbW1hbmRMaW5lRm9yTWV0YWRhdGEsICdlY2hvIGhlbGxvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBsZXRlcyB3aGVuIHRlcm1pbmFsIHByb2Nlc3MgZXhpdHMgd2l0aG91dCBzaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb25Db21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBnZXRPdXRwdXQoKTogc3RyaW5nOyBleGl0Q29kZTogbnVtYmVyIH0+KCk7XG5cdFx0Y29uc3Qgb25FeGl0RW1pdHRlciA9IG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblxuXHRcdGNvbnN0IG1hcmtlciA9IHtcblx0XHRcdGxpbmU6IDAsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRvbkRpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0XHRjb25zdCB4dGVybSA9IHtcblx0XHRcdHJhdzoge1xuXHRcdFx0XHRyZWdpc3Rlck1hcmtlcjogKCkgPT4gbWFya2VyLFxuXHRcdFx0XHRidWZmZXI6IHtcblx0XHRcdFx0XHRhY3RpdmU6IHt9LFxuXHRcdFx0XHRcdGFsdGVybmF0ZToge30sXG5cdFx0XHRcdFx0b25CdWZmZXJDaGFuZ2U6ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRDb250ZW50c0FzVGV4dDogKCkgPT4gJ3NvbWUgb3V0cHV0Jyxcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbmNlID0ge1xuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZSh4dGVybSksXG5cdFx0XHRvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpc3Bvc2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0b25FeGl0OiBvbkV4aXRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0cnVuQ29tbWFuZDogKCkgPT4ge1xuXHRcdFx0XHQvLyBTaW11bGF0ZSBwcm9jZXNzIGV4aXRpbmcgd2l0aG91dCBmaXJpbmcgb25Db21tYW5kRmluaXNoZWRcblx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gb25FeGl0RW1pdHRlci5maXJlKDEpKTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IFJpY2hFeGVjdXRlU3RyYXRlZ3koXG5cdFx0XHRpbnN0YW5jZSxcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRmYWxzZSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZUxvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0cmF0ZWd5LmV4ZWN1dGUoJ2V4aXQgMScsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmV4aXRDb2RlLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBJVGVybWluYWxMYXVuY2hFcnJvciBvbiBwcm9jZXNzIGV4aXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb25Db21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBnZXRPdXRwdXQoKTogc3RyaW5nOyBleGl0Q29kZTogbnVtYmVyIH0+KCk7XG5cdFx0Y29uc3Qgb25FeGl0RW1pdHRlciA9IG5ldyBFbWl0dGVyPG51bWJlciB8IHsgbWVzc2FnZTogc3RyaW5nOyBjb2RlPzogbnVtYmVyIH0gfCB1bmRlZmluZWQ+KCk7XG5cblx0XHRjb25zdCBtYXJrZXIgPSB7XG5cdFx0XHRsaW5lOiAwLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0b25EaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0Y29uc3QgeHRlcm0gPSB7XG5cdFx0XHRyYXc6IHtcblx0XHRcdFx0cmVnaXN0ZXJNYXJrZXI6ICgpID0+IG1hcmtlcixcblx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0YWN0aXZlOiB7fSxcblx0XHRcdFx0XHRhbHRlcm5hdGU6IHt9LFxuXHRcdFx0XHRcdG9uQnVmZmVyQ2hhbmdlOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0Q29udGVudHNBc1RleHQ6ICgpID0+ICcnLFxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB7XG5cdFx0XHR4dGVybVJlYWR5UHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKHh0ZXJtKSxcblx0XHRcdG9uRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlzcG9zZWQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkV4aXQ6IG9uRXhpdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRydW5Db21tYW5kOiAoKSA9PiB7XG5cdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IG9uRXhpdEVtaXR0ZXIuZmlyZSh7IG1lc3NhZ2U6ICdGYWlsZWQgdG8gbGF1bmNoJywgY29kZTogMTI3IH0pKTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IFJpY2hFeGVjdXRlU3RyYXRlZ3koXG5cdFx0XHRpbnN0YW5jZSxcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRmYWxzZSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZUxvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0cmF0ZWd5LmV4ZWN1dGUoJ2JhZC1jb21tYW5kJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuZXhpdENvZGUsIDEyNyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgaW1tZWRpYXRlbHkgd2l0aCBjYXB0dXJlZCBleGl0IGNvZGUgd2hlbiBwdHkgaGFzIGFscmVhZHkgZXhpdGVkIGJlZm9yZSBleGVjdXRlKCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzIHRoZSBzY2VuYXJpbyB3aGVyZSB0aGUgc2hlbGwgcHJvY2VzcyBmcm9tIGEgcHJldmlvdXMgY29tbWFuZFxuXHRcdC8vIGhhcyBhbHJlYWR5IGRpZWQsIHNvIG9uRXhpdCBoYXMgYWxyZWFkeSBmaXJlZCBhbmQgRXZlbnQudG9Qcm9taXNlKG9uRXhpdClcblx0XHQvLyB3b3VsZCBuZXZlciByZXNvbHZlLiBUaGUgc3RyYXRlZ3kgbXVzdCBzaG9ydC1jaXJjdWl0IHVzaW5nIHRoZVxuXHRcdC8vIGluc3RhbmNlJ3MgYWxyZWFkeS1jYXB0dXJlZCBleGl0Q29kZS5cblx0XHRjb25zdCBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGdldE91dHB1dCgpOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfT4oKTtcblx0XHRjb25zdCBvbkV4aXRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRcdGNvbnN0IGluc3RhbmNlID0ge1xuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZSh7fSksXG5cdFx0XHRvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpc3Bvc2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0b25FeGl0OiBvbkV4aXRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0aXNEaXNwb3NlZDogZmFsc2UsXG5cdFx0XHRleGl0Q29kZTogMSxcblx0XHRcdHJ1bkNvbW1hbmQ6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdydW5Db21tYW5kIHNob3VsZCBub3QgYmUgY2FsbGVkIHdoZW4gcHR5IGFscmVhZHkgZXhpdGVkJyk7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IFJpY2hFeGVjdXRlU3RyYXRlZ3koXG5cdFx0XHRpbnN0YW5jZSxcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRmYWxzZSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZUxvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0cmF0ZWd5LmV4ZWN1dGUoJ1JzY3JpcHQgL2FwcC9hcnMuUicsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmV4aXRDb2RlLCAxKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQub3V0cHV0LCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5hZGRpdGlvbmFsSW5mb3JtYXRpb24sICdDb21tYW5kIGV4aXRlZCB3aXRoIGNvZGUgMScpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aHJvd3MgXCJUaGUgdGVybWluYWwgd2FzIGNsb3NlZFwiIHdoZW4gaW5zdGFuY2UgaXMgYWxyZWFkeSBkaXNwb3NlZCBiZWZvcmUgZXhlY3V0ZSgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgZ2V0T3V0cHV0KCk6IHN0cmluZzsgZXhpdENvZGU6IG51bWJlciB9PigpO1xuXHRcdGNvbnN0IGluc3RhbmNlID0ge1xuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZSh7fSksXG5cdFx0XHRvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpc3Bvc2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0b25FeGl0OiBFdmVudC5Ob25lLFxuXHRcdFx0aXNEaXNwb3NlZDogdHJ1ZSxcblx0XHRcdGV4aXRDb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRydW5Db21tYW5kOiAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigncnVuQ29tbWFuZCBzaG91bGQgbm90IGJlIGNhbGxlZCB3aGVuIHRlcm1pbmFsIGlzIGRpc3Bvc2VkJyk7IH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IFJpY2hFeGVjdXRlU3RyYXRlZ3koXG5cdFx0XHRpbnN0YW5jZSxcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRmYWxzZSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZUxvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGF3YWl0IHJlamVjdHMoXG5cdFx0XHQoKSA9PiBzdHJhdGVneS5leGVjdXRlKCdlY2hvIGhlbGxvJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHQvVGhlIHRlcm1pbmFsIHdhcyBjbG9zZWQvXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxtQkFBbUI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUywyQkFBMkI7QUFJcEMsU0FBUyxtQkFBd0M7QUFDaEQsU0FBTyxJQUFJLGNBQWMsZUFBZTtBQUFBLElBQTdCO0FBQUE7QUFBK0IsV0FBUyxZQUFZO0FBQUE7QUFBQSxFQUFXO0FBQzNFO0FBRUEsTUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE9BQUssd0VBQXdFLFlBQVk7QUFDeEYsVUFBTSwyQkFBMkIsSUFBSSxRQUFtRDtBQUN4RixRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFFSixVQUFNLFNBQVM7QUFBQSxNQUNkLE1BQU07QUFBQSxNQUNOLFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFBQSxNQUNqQixXQUFXLE1BQU07QUFBQSxJQUNsQjtBQUNBLFVBQU0sUUFBUTtBQUFBLE1BQ2IsS0FBSztBQUFBLFFBQ0osZ0JBQWdCLE1BQU07QUFBQSxRQUN0QixRQUFRO0FBQUEsVUFDUCxRQUFRLENBQUM7QUFBQSxVQUNULFdBQVcsQ0FBQztBQUFBLFVBQ1osZ0JBQWdCLE1BQU0sYUFBYSxNQUFNO0FBQUEsVUFBRSxDQUFDO0FBQUEsUUFDN0M7QUFBQSxRQUNBLG1CQUFtQixN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
