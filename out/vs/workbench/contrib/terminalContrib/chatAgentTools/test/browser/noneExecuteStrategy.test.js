import assert from "assert";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { NoneExecuteStrategy } from "../../browser/executeStrategy/noneExecuteStrategy.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
suite("NoneExecuteStrategy", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createLogService() {
    return new class extends NullLogService {
      constructor() {
        super(...arguments);
        this._logBrand = void 0;
      }
    }();
  }
  function createMockTerminalAndXterm(contentsAsText, cursorLineText) {
    const onDataEmitter = store.add(new Emitter());
    const activeBuffer = {};
    const alternateBuffer = {};
    const mockXterm = {
      raw: {
        registerMarker: () => ({
          line: 0,
          isDisposed: false,
          onDispose: Event.None,
          dispose: () => {
          }
        }),
        buffer: {
          active: {
            ...activeBuffer,
            baseY: 0,
            cursorY: 1,
            getLine: () => ({
              translateToString: () => cursorLineText
            })
          },
          alternate: alternateBuffer,
          onBufferChange: () => ({ dispose: () => {
          } })
        },
        onWriteParsed: Event.None
      },
      getContentsAsText: () => contentsAsText
    };
    const mockInstance = {
      xtermReadyPromise: Promise.resolve(mockXterm),
      onData: onDataEmitter.event,
      sendText: () => {
      }
    };
    return { instance: mockInstance, onDataEmitter };
  }
  test('should report "Command produced no output" when output is empty', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const { instance } = createMockTerminalAndXterm(
      "   \n   \n   ",
      // only whitespace between markers
      "user@host:~$ "
      // prompt at cursor line → triggers prompt detection
    );
    const logService = createLogService();
    const configService = new TestConfigurationService();
    const strategy = store.add(new NoneExecuteStrategy(instance, () => false, configService, logService));
    const cts = store.add(new CancellationTokenSource());
    const result = await strategy.execute("echo test", cts.token);
    assert.strictEqual(result.additionalInformation, "Command produced no output");
  }));
  test("should not leak sandbox command echo as output when command produces no output", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const promptLine = "[ user@host:~/src (main) ] $ ";
    const sandboxCommandEcho = `ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/node_modules/@vscode/ripgrep/bin" TMPDIR="/var/folders/bb/_8jjjyy971x2frm3nr3g7m4r0000gn/T" "/app/Contents/MacOS/Code - Insiders" "/app/Contents/Resources/app/node_modules/@vscode/sandbox-runtime/dist/cli.js" --settings "/var/folders/bb/_8jjjyy971x2frm3nr3g7m4r0000gn/T/vscode-sandbox-settings.json" -c ' git diff 0e5d5949d13f..2c357a926df6 -- '\\''src/foo.ts'\\'' | grep -A3 -B3 '\\''someFunc'\\'''`;
    const terminalContent = `${promptLine}${sandboxCommandEcho}
${" ".repeat(80)}
${promptLine}`;
    const { instance } = createMockTerminalAndXterm(
      terminalContent,
      promptLine
      // prompt at cursor line → triggers prompt detection
    );
    const logService = createLogService();
    const configService = new TestConfigurationService();
    const strategy = store.add(new NoneExecuteStrategy(instance, () => false, configService, logService));
    const cts = store.add(new CancellationTokenSource());
    const result = await strategy.execute(
      "git diff 0e5d5949d13f..2c357a926df6 -- 'src/foo.ts' | grep -A3 -B3 'someFunc'",
      cts.token
    );
    assert.strictEqual(result.output?.includes("sandbox-runtime") ?? false, false, "Output should not leak sandbox-runtime path");
    assert.strictEqual(result.output?.includes("ELECTRON_RUN_AS_NODE") ?? false, false, "Output should not leak ELECTRON_RUN_AS_NODE");
    assert.strictEqual(result.additionalInformation, "Command produced no output");
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy90ZXN0L2Jyb3dzZXIvbm9uZUV4ZWN1dGVTdHJhdGVneS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlIHsgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBOb25lRXhlY3V0ZVN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9leGVjdXRlU3RyYXRlZ3kvbm9uZUV4ZWN1dGVTdHJhdGVneS5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbnN1aXRlKCdOb25lRXhlY3V0ZVN0cmF0ZWd5JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUxvZ1NlcnZpY2UoKTogSVRlcm1pbmFsTG9nU2VydmljZSB7XG5cdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHsgcmVhZG9ubHkgX2xvZ0JyYW5kID0gdW5kZWZpbmVkOyB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBtb2NrIHRlcm1pbmFsIGluc3RhbmNlIGFuZCB4dGVybSBmb3IgdGVzdGluZyBOb25lRXhlY3V0ZVN0cmF0ZWd5LlxuXHQgKlxuXHQgKiBAcGFyYW0gY29udGVudHNBc1RleHQgVGhlIHRleHQgdGhhdCBgeHRlcm0uZ2V0Q29udGVudHNBc1RleHQoKWAgd2lsbCByZXR1cm4gKHNpbXVsYXRlc1xuXHQgKiB0aGUgdGVybWluYWwgYnVmZmVyIGNvbnRlbnQgYmV0d2VlbiB0aGUgc3RhcnQgYW5kIGVuZCBtYXJrZXJzKVxuXHQgKiBAcGFyYW0gY3Vyc29yTGluZVRleHQgVGhlIHRleHQgYXQgdGhlIGN1cnNvciBsaW5lLCB1c2VkIGJ5IHByb21wdCBkZXRlY3Rpb24gaGV1cmlzdGljc1xuXHQgKi9cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1Rlcm1pbmFsQW5kWHRlcm0oY29udGVudHNBc1RleHQ6IHN0cmluZywgY3Vyc29yTGluZVRleHQ6IHN0cmluZyk6IHtcblx0XHRpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0b25EYXRhRW1pdHRlcjogRW1pdHRlcjxzdHJpbmc+O1xuXHR9IHtcblx0XHRjb25zdCBvbkRhdGFFbWl0dGVyID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3QgYWN0aXZlQnVmZmVyID0ge307XG5cdFx0Y29uc3QgYWx0ZXJuYXRlQnVmZmVyID0ge307IC8vIGRpZmZlcmVudCBvYmplY3QgXHUyMTkyIG5vdCBhbHQgYnVmZmVyXG5cblx0XHRjb25zdCBtb2NrWHRlcm0gPSB7XG5cdFx0XHRyYXc6IHtcblx0XHRcdFx0cmVnaXN0ZXJNYXJrZXI6ICgpID0+ICh7XG5cdFx0XHRcdFx0bGluZTogMCxcblx0XHRcdFx0XHRpc0Rpc3Bvc2VkOiBmYWxzZSxcblx0XHRcdFx0XHRvbkRpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0YWN0aXZlOiB7XG5cdFx0XHRcdFx0XHQuLi5hY3RpdmVCdWZmZXIsXG5cdFx0XHRcdFx0XHRiYXNlWTogMCxcblx0XHRcdFx0XHRcdGN1cnNvclk6IDEsXG5cdFx0XHRcdFx0XHRnZXRMaW5lOiAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0XHR0cmFuc2xhdGVUb1N0cmluZzogKCkgPT4gY3Vyc29yTGluZVRleHQsXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFsdGVybmF0ZTogYWx0ZXJuYXRlQnVmZmVyLFxuXHRcdFx0XHRcdG9uQnVmZmVyQ2hhbmdlOiAoKSA9PiAoeyBkaXNwb3NlOiAoKSA9PiB7IH0gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9uV3JpdGVQYXJzZWQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q29udGVudHNBc1RleHQ6ICgpID0+IGNvbnRlbnRzQXNUZXh0LFxuXHRcdH07XG5cblx0XHRjb25zdCBtb2NrSW5zdGFuY2UgPSB7XG5cdFx0XHR4dGVybVJlYWR5UHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKG1vY2tYdGVybSksXG5cdFx0XHRvbkRhdGE6IG9uRGF0YUVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRzZW5kVGV4dDogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblxuXHRcdHJldHVybiB7IGluc3RhbmNlOiBtb2NrSW5zdGFuY2UsIG9uRGF0YUVtaXR0ZXIgfTtcblx0fVxuXG5cdHRlc3QoJ3Nob3VsZCByZXBvcnQgXCJDb21tYW5kIHByb2R1Y2VkIG5vIG91dHB1dFwiIHdoZW4gb3V0cHV0IGlzIGVtcHR5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGUgYSBjb21tYW5kIHRoYXQgcHJvZHVjZXMgbm8gb3V0cHV0LiBCZXR3ZWVuIHRoZSBzdGFydCBhbmQgZW5kIG1hcmtlcnMsXG5cdFx0Ly8gZ2V0Q29udGVudHNBc1RleHQgcmV0dXJucyBvbmx5IHdoaXRlc3BhY2UgKG5vIGFjdHVhbCBjb21tYW5kIG91dHB1dCkuXG5cdFx0Y29uc3QgeyBpbnN0YW5jZSB9ID0gY3JlYXRlTW9ja1Rlcm1pbmFsQW5kWHRlcm0oXG5cdFx0XHQnICAgXFxuICAgXFxuICAgJywgIC8vIG9ubHkgd2hpdGVzcGFjZSBiZXR3ZWVuIG1hcmtlcnNcblx0XHRcdCd1c2VyQGhvc3Q6fiQgJyAgICAvLyBwcm9tcHQgYXQgY3Vyc29yIGxpbmUgXHUyMTkyIHRyaWdnZXJzIHByb21wdCBkZXRlY3Rpb25cblx0XHQpO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IGNyZWF0ZUxvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0cmF0ZWd5ID0gc3RvcmUuYWRkKG5ldyBOb25lRXhlY3V0ZVN0cmF0ZWd5KGluc3RhbmNlLCAoKSA9PiBmYWxzZSwgY29uZmlnU2VydmljZSwgbG9nU2VydmljZSkpO1xuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKCdlY2hvIHRlc3QnLCBjdHMudG9rZW4pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hZGRpdGlvbmFsSW5mb3JtYXRpb24sICdDb21tYW5kIHByb2R1Y2VkIG5vIG91dHB1dCcpO1xuXHR9KSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBsZWFrIHNhbmRib3ggY29tbWFuZCBlY2hvIGFzIG91dHB1dCB3aGVuIGNvbW1hbmQgcHJvZHVjZXMgbm8gb3V0cHV0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBzaW11bGF0ZXMgdGhlIGV4YWN0IHNjZW5hcmlvIGZyb20gaXNzdWUgIzMwMzUzMTpcblx0XHQvLyBBIHNhbmRib3hlZCBjb21tYW5kIHByb2R1Y2VzIG5vIG91dHB1dCwgYnV0IGdldENvbnRlbnRzQXNUZXh0IHJldHVybnMgdGhlXG5cdFx0Ly8gcHJvbXB0ICsgc2FuZGJveC13cmFwcGVkIGNvbW1hbmQgZWNobyArIG5leHQgcHJvbXB0IGxpbmUuXG5cdFx0Y29uc3QgcHJvbXB0TGluZSA9ICdbIHVzZXJAaG9zdDp+L3NyYyAobWFpbikgXSAkICc7XG5cdFx0Y29uc3Qgc2FuZGJveENvbW1hbmRFY2hvID0gJ0VMRUNUUk9OX1JVTl9BU19OT0RFPTEgUEFUSD1cIiRQQVRIOi9hcHAvbm9kZV9tb2R1bGVzL0B2c2NvZGUvcmlwZ3JlcC9iaW5cIiAnXG5cdFx0XHQrICdUTVBESVI9XCIvdmFyL2ZvbGRlcnMvYmIvXzhqamp5eTk3MXgyZnJtM25yM2c3bTRyMDAwMGduL1RcIiAnXG5cdFx0XHQrICdcIi9hcHAvQ29udGVudHMvTWFjT1MvQ29kZSAtIEluc2lkZXJzXCIgXCIvYXBwL0NvbnRlbnRzL1Jlc291cmNlcy9hcHAvbm9kZV9tb2R1bGVzL0B2c2NvZGUvc2FuZGJveC1ydW50aW1lL2Rpc3QvY2xpLmpzXCIgJ1xuXHRcdFx0KyAnLS1zZXR0aW5ncyBcIi92YXIvZm9sZGVycy9iYi9fOGpqanl5OTcxeDJmcm0zbnIzZzdtNHIwMDAwZ24vVC92c2NvZGUtc2FuZGJveC1zZXR0aW5ncy5qc29uXCIgJ1xuXHRcdFx0KyAnLWMgXFwnIGdpdCBkaWZmIDBlNWQ1OTQ5ZDEzZi4uMmMzNTdhOTI2ZGY2IC0tIFxcJ1xcXFxcXCdcXCdzcmMvZm9vLnRzXFwnXFxcXFxcJ1xcJyB8IGdyZXAgLUEzIC1CMyBcXCdcXFxcXFwnXFwnc29tZUZ1bmNcXCdcXFxcXFwnXFwnXFwnJztcblx0XHRjb25zdCB0ZXJtaW5hbENvbnRlbnQgPSBgJHtwcm9tcHRMaW5lfSR7c2FuZGJveENvbW1hbmRFY2hvfVxcbiR7JyAnLnJlcGVhdCg4MCl9XFxuJHtwcm9tcHRMaW5lfWA7XG5cblx0XHRjb25zdCB7IGluc3RhbmNlIH0gPSBjcmVhdGVNb2NrVGVybWluYWxBbmRYdGVybShcblx0XHRcdHRlcm1pbmFsQ29udGVudCxcblx0XHRcdHByb21wdExpbmUgICAgICAgIC8vIHByb21wdCBhdCBjdXJzb3IgbGluZSBcdTIxOTIgdHJpZ2dlcnMgcHJvbXB0IGRldGVjdGlvblxuXHRcdCk7XG5cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gY3JlYXRlTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IE5vbmVFeGVjdXRlU3RyYXRlZ3koaW5zdGFuY2UsICgpID0+IGZhbHNlLCBjb25maWdTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN0cmF0ZWd5LmV4ZWN1dGUoXG5cdFx0XHQnZ2l0IGRpZmYgMGU1ZDU5NDlkMTNmLi4yYzM1N2E5MjZkZjYgLS0gXFwnc3JjL2Zvby50c1xcJyB8IGdyZXAgLUEzIC1CMyBcXCdzb21lRnVuY1xcJycsXG5cdFx0XHRjdHMudG9rZW5cblx0XHQpO1xuXG5cdFx0Ly8gVGhlIG91dHB1dCBzaG91bGQgTk9UIGNvbnRhaW4gc2FuZGJveCB3cmFwcGVyIGFydGlmYWN0c1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQub3V0cHV0Py5pbmNsdWRlcygnc2FuZGJveC1ydW50aW1lJykgPz8gZmFsc2UsIGZhbHNlLCAnT3V0cHV0IHNob3VsZCBub3QgbGVhayBzYW5kYm94LXJ1bnRpbWUgcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQub3V0cHV0Py5pbmNsdWRlcygnRUxFQ1RST05fUlVOX0FTX05PREUnKSA/PyBmYWxzZSwgZmFsc2UsICdPdXRwdXQgc2hvdWxkIG5vdCBsZWFrIEVMRUNUUk9OX1JVTl9BU19OT0RFJyk7XG5cblx0XHQvLyBTaG91bGQgcmVwb3J0IHRoYXQgdGhlIGNvbW1hbmQgcHJvZHVjZWQgbm8gb3V0cHV0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hZGRpdGlvbmFsSW5mb3JtYXRpb24sICdDb21tYW5kIHByb2R1Y2VkIG5vIG91dHB1dCcpO1xuXHR9KSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGdDQUFnQztBQUV6QyxNQUFNLHVCQUF1QixNQUFNO0FBQ2xDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsV0FBUyxtQkFBd0M7QUFDaEQsV0FBTyxJQUFJLGNBQWMsZUFBZTtBQUFBLE1BQTdCO0FBQUE7QUFBK0IsYUFBUyxZQUFZO0FBQUE7QUFBQSxJQUFXO0FBQUEsRUFDM0U7QUFTQSxXQUFTLDJCQUEyQixnQkFBd0IsZ0JBRzFEO0FBQ0QsVUFBTSxnQkFBZ0IsTUFBTSxJQUFJLElBQUksUUFBZ0IsQ0FBQztBQUNyRCxVQUFNLGVBQWUsQ0FBQztBQUN0QixVQUFNLGtCQUFrQixDQUFDO0FBRXpCLFVBQU0sWUFBWTtBQUFBLE1BQ2pCLEtBQUs7QUFBQSxRQUNKLGdCQUFnQixPQUFPO0FBQUEsVUFDdEIsTUFBTTtBQUFBLFVBQ04sWUFBWTtBQUFBLFVBQ1osV0FBVyxNQUFNO0FBQUEsVUFDakIsU0FBUyxNQUFNO0FBQUEsVUFBRTtBQUFBLFFBQ2xCO0FBQUEsUUFDQSxRQUFRO0FBQUEsVUFDUCxRQUFRO0FBQUEsWUFDUCxHQUFHO0FBQUEsWUFDSCxPQUFPO0FBQUEsWUFDUCxTQUFTO0FBQUEsWUFDVCxTQUFTLE9BQU87QUFBQSxjQUNmLG1CQUFtQixNQUFNO0FBQUEsWUFDMUI7QUFBQSxVQUNEO0FBQUEsVUFDQSxXQUFXO0FBQUEsVUFDWCxnQkFBZ0IsT0FBTyxFQUFFLFNBQVMsTUFBTTtBQUFBLFVBQUUsRUFBRTtBQUFBLFFBQzdDO0FBQUEsUUFDQSxlQUFlLE1BQU07QUFBQSxNQUN0QjtBQUFBLE1BQ0EsbUJBQW1CLE1BQU07QUFBQSxJQUMxQjtBQUVBLFVBQU0sZUFBZTtBQUFBLE1BQ3BCLG1CQUFtQixRQUFRLFFBQVEsU0FBUztBQUFBLE1BQzVDLFFBQVEsY0FBYztBQUFBLE1BQ3RCLFVBQVUsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNuQjtBQUVBLFdBQU8sRUFBRSxVQUFVLGNBQWMsY0FBYztBQUFBLEVBQ2hEO0FBRUEsT0FBSyxtRUFBbUUsTUFBTSxtQkFBbUIsRUFBRSxlQUFlLEtBQUssR0FBRyxZQUFZO0FBR3JJLFVBQU0sRUFBRSxTQUFTLElBQUk7QUFBQSxNQUNwQjtBQUFBO0FBQUEsTUFDQTtBQUFBO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxpQkFBaUI7QUFDcEMsVUFBTSxnQkFBZ0IsSUFBSSx5QkFBeUI7QUFDbkQsVUFBTSxXQUFXLE1BQU0sSUFBSSxJQUFJLG9CQUFvQixVQUFVLE1BQU0sT0FBTyxlQUFlLFVBQVUsQ0FBQztBQUNwRyxVQUFNLE1BQU0sTUFBTSxJQUFJLElBQUksd0JBQXdCLENBQUM7QUFFbkQsVUFBTSxTQUFTLE1BQU0sU0FBUyxRQUFRLGFBQWEsSUFBSSxLQUFLO0FBRTVELFdBQU8sWUFBWSxPQUFPLHVCQUF1Qiw0QkFBNEI7QUFBQSxFQUM5RSxDQUFDLENBQUM7QUFFRixPQUFLLGtGQUFrRixNQUFNLG1CQUFtQixFQUFFLGVBQWUsS0FBSyxHQUFHLFlBQVk7QUFJcEosVUFBTSxhQUFhO0FBQ25CLFVBQU0scUJBQXFCO0FBSzNCLFVBQU0sa0JBQWtCLEdBQUcsVUFBVSxHQUFHLGtCQUFrQjtBQUFBLEVBQUssSUFBSSxPQUFPLEVBQUUsQ0FBQztBQUFBLEVBQUssVUFBVTtBQUU1RixVQUFNLEVBQUUsU0FBUyxJQUFJO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUE7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLGlCQUFpQjtBQUNwQyxVQUFNLGdCQUFnQixJQUFJLHlCQUF5QjtBQUNuRCxVQUFNLFdBQVcsTUFBTSxJQUFJLElBQUksb0JBQW9CLFVBQVUsTUFBTSxPQUFPLGVBQWUsVUFBVSxDQUFDO0FBQ3BHLFVBQU0sTUFBTSxNQUFNLElBQUksSUFBSSx3QkFBd0IsQ0FBQztBQUVuRCxVQUFNLFNBQVMsTUFBTSxTQUFTO0FBQUEsTUFDN0I7QUFBQSxNQUNBLElBQUk7QUFBQSxJQUNMO0FBR0EsV0FBTyxZQUFZLE9BQU8sUUFBUSxTQUFTLGlCQUFpQixLQUFLLE9BQU8sT0FBTyw2Q0FBNkM7QUFDNUgsV0FBTyxZQUFZLE9BQU8sUUFBUSxTQUFTLHNCQUFzQixLQUFLLE9BQU8sT0FBTyw2Q0FBNkM7QUFHakksV0FBTyxZQUFZLE9BQU8sdUJBQXVCLDRCQUE0QjtBQUFBLEVBQzlFLENBQUMsQ0FBQztBQUNILENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
