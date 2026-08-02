import { strictEqual, rejects } from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { BasicExecuteStrategy } from "../../browser/executeStrategy/basicExecuteStrategy.js";
function createLogService() {
  return new class extends NullLogService {
    constructor() {
      super(...arguments);
      this._logBrand = void 0;
    }
  }();
}
suite("BasicExecuteStrategy", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
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
      sendText: () => {
        queueMicrotask(() => onExitEmitter.fire(1));
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new BasicExecuteStrategy(
      instance,
      () => false,
      commandDetection,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("exit 1", CancellationToken.None);
    strictEqual(result.exitCode, 1);
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
      sendText: () => {
        throw new Error("sendText should not be called when pty already exited");
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new BasicExecuteStrategy(
      instance,
      () => false,
      commandDetection,
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
      sendText: () => {
        throw new Error("sendText should not be called when terminal is disposed");
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new BasicExecuteStrategy(
      instance,
      () => false,
      commandDetection,
      new TestConfigurationService(),
      createLogService()
    ));
    await rejects(
      () => strategy.execute("echo hello", CancellationToken.None),
      /The terminal was closed/
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvYmFzaWNFeGVjdXRlU3RyYXRlZ3kudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHN0cmljdEVxdWFsLCByZWplY3RzIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgQmFzaWNFeGVjdXRlU3RyYXRlZ3kgfSBmcm9tICcuLi8uLi9icm93c2VyL2V4ZWN1dGVTdHJhdGVneS9iYXNpY0V4ZWN1dGVTdHJhdGVneS5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlTG9nU2VydmljZSgpOiBJVGVybWluYWxMb2dTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHsgcmVhZG9ubHkgX2xvZ0JyYW5kID0gdW5kZWZpbmVkOyB9O1xufVxuXG5zdWl0ZSgnQmFzaWNFeGVjdXRlU3RyYXRlZ3knLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY29tcGxldGVzIHdoZW4gdGVybWluYWwgcHJvY2VzcyBleGl0cyB3aXRob3V0IHNoZWxsIGludGVncmF0aW9uIHNlcXVlbmNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGdldE91dHB1dCgpOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfT4oKTtcblx0XHRjb25zdCBvbkV4aXRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXG5cdFx0Y29uc3QgbWFya2VyID0ge1xuXHRcdFx0bGluZTogMCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdG9uRGlzcG9zZTogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHRcdGNvbnN0IHh0ZXJtID0ge1xuXHRcdFx0cmF3OiB7XG5cdFx0XHRcdHJlZ2lzdGVyTWFya2VyOiAoKSA9PiBtYXJrZXIsXG5cdFx0XHRcdGJ1ZmZlcjoge1xuXHRcdFx0XHRcdGFjdGl2ZToge30sXG5cdFx0XHRcdFx0YWx0ZXJuYXRlOiB7fSxcblx0XHRcdFx0XHRvbkJ1ZmZlckNoYW5nZTogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldENvbnRlbnRzQXNUZXh0OiAoKSA9PiAnc29tZSBvdXRwdXQnLFxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB7XG5cdFx0XHR4dGVybVJlYWR5UHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKHh0ZXJtKSxcblx0XHRcdG9uRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlzcG9zZWQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkV4aXQ6IG9uRXhpdEVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRzZW5kVGV4dDogKCkgPT4ge1xuXHRcdFx0XHQvLyBTaW11bGF0ZSBwcm9jZXNzIGV4aXRpbmcgd2l0aG91dCBmaXJpbmcgb25Db21tYW5kRmluaXNoZWRcblx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gb25FeGl0RW1pdHRlci5maXJlKDEpKTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IEJhc2ljRXhlY3V0ZVN0cmF0ZWd5KFxuXHRcdFx0aW5zdGFuY2UsXG5cdFx0XHQoKSA9PiBmYWxzZSxcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKCdleGl0IDEnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5leGl0Q29kZSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgaW1tZWRpYXRlbHkgd2l0aCBjYXB0dXJlZCBleGl0IGNvZGUgd2hlbiBwdHkgaGFzIGFscmVhZHkgZXhpdGVkIGJlZm9yZSBleGVjdXRlKCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzIHRoZSBzY2VuYXJpbyB3aGVyZSB0aGUgc2hlbGwgcHJvY2VzcyBmcm9tIGEgcHJldmlvdXMgY29tbWFuZFxuXHRcdC8vIGhhcyBhbHJlYWR5IGRpZWQsIHNvIG9uRXhpdCBoYXMgYWxyZWFkeSBmaXJlZCBhbmQgRXZlbnQudG9Qcm9taXNlKG9uRXhpdClcblx0XHQvLyB3b3VsZCBuZXZlciByZXNvbHZlLiBUaGUgc3RyYXRlZ3kgbXVzdCBzaG9ydC1jaXJjdWl0IHVzaW5nIHRoZVxuXHRcdC8vIGluc3RhbmNlJ3MgYWxyZWFkeS1jYXB0dXJlZCBleGl0Q29kZS5cblx0XHRjb25zdCBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGdldE91dHB1dCgpOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfT4oKTtcblx0XHRjb25zdCBvbkV4aXRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRcdGNvbnN0IGluc3RhbmNlID0ge1xuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZSh7fSksXG5cdFx0XHRvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpc3Bvc2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0b25FeGl0OiBvbkV4aXRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0aXNEaXNwb3NlZDogZmFsc2UsXG5cdFx0XHRleGl0Q29kZTogMSxcblx0XHRcdHNlbmRUZXh0OiAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignc2VuZFRleHQgc2hvdWxkIG5vdCBiZSBjYWxsZWQgd2hlbiBwdHkgYWxyZWFkeSBleGl0ZWQnKTsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHtcblx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkOiBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eTtcblx0XHRjb25zdCBzdHJhdGVneSA9IHN0b3JlLmFkZChuZXcgQmFzaWNFeGVjdXRlU3RyYXRlZ3koXG5cdFx0XHRpbnN0YW5jZSxcblx0XHRcdCgpID0+IGZhbHNlLFxuXHRcdFx0Y29tbWFuZERldGVjdGlvbixcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZUxvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0cmF0ZWd5LmV4ZWN1dGUoJ1JzY3JpcHQgL2FwcC9hcnMuUicsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmV4aXRDb2RlLCAxKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQub3V0cHV0LCB1bmRlZmluZWQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5hZGRpdGlvbmFsSW5mb3JtYXRpb24sICdDb21tYW5kIGV4aXRlZCB3aXRoIGNvZGUgMScpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aHJvd3MgXCJUaGUgdGVybWluYWwgd2FzIGNsb3NlZFwiIHdoZW4gaW5zdGFuY2UgaXMgYWxyZWFkeSBkaXNwb3NlZCBiZWZvcmUgZXhlY3V0ZSgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgZ2V0T3V0cHV0KCk6IHN0cmluZzsgZXhpdENvZGU6IG51bWJlciB9PigpO1xuXHRcdGNvbnN0IGluc3RhbmNlID0ge1xuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZSh7fSksXG5cdFx0XHRvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpc3Bvc2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0b25FeGl0OiBFdmVudC5Ob25lLFxuXHRcdFx0aXNEaXNwb3NlZDogdHJ1ZSxcblx0XHRcdGV4aXRDb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRzZW5kVGV4dDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3NlbmRUZXh0IHNob3VsZCBub3QgYmUgY2FsbGVkIHdoZW4gdGVybWluYWwgaXMgZGlzcG9zZWQnKTsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0Y29uc3QgY29tbWFuZERldGVjdGlvbiA9IHtcblx0XHRcdG9uQ29tbWFuZEZpbmlzaGVkOiBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZXZlbnQsXG5cdFx0fSBhcyB1bmtub3duIGFzIElDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eTtcblx0XHRjb25zdCBzdHJhdGVneSA9IHN0b3JlLmFkZChuZXcgQmFzaWNFeGVjdXRlU3RyYXRlZ3koXG5cdFx0XHRpbnN0YW5jZSxcblx0XHRcdCgpID0+IGZhbHNlLFxuXHRcdFx0Y29tbWFuZERldGVjdGlvbixcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZUxvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGF3YWl0IHJlamVjdHMoXG5cdFx0XHQoKSA9PiBzdHJhdGVneS5leGVjdXRlKCdlY2hvIGhlbGxvJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHQvVGhlIHRlcm1pbmFsIHdhcyBjbG9zZWQvXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsYUFBYSxlQUFlO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsNEJBQTRCO0FBSXJDLFNBQVMsbUJBQXdDO0FBQ2hELFNBQU8sSUFBSSxjQUFjLGVBQWU7QUFBQSxJQUE3QjtBQUFBO0FBQStCLFdBQVMsWUFBWTtBQUFBO0FBQUEsRUFBVztBQUMzRTtBQUVBLE1BQU0sd0JBQXdCLE1BQU07QUFDbkMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLDZFQUE2RSxZQUFZO0FBQzdGLFVBQU0sMkJBQTJCLElBQUksUUFBbUQ7QUFDeEYsVUFBTSxnQkFBZ0IsSUFBSSxRQUE0QjtBQUV0RCxVQUFNLFNBQVM7QUFBQSxNQUNkLE1BQU07QUFBQSxNQUNOLFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFB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
