import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { LogLevel } from "../../../log/common/log.js";
import { ClaudeToolCallRegistry } from "../../node/claude/claudeToolCallRegistry.js";
class CapturingLog {
  constructor() {
    this.warns = [];
  }
  warn(message) {
    this.warns.push(message);
  }
  error() {
  }
  info() {
  }
  trace() {
  }
  debug() {
  }
  getLevel() {
    return LogLevel.Off;
  }
}
suite("claudeToolCallRegistry \u2014 Phase 8.5 input/info tracking", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("begin \u2192 appendInputDelta \u2192 finalize stashes rich info and parsed input", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_1", "Bash", "turn-1");
    registry.appendInputDelta("tu_1", '{"comma');
    registry.appendInputDelta("tu_1", 'nd":"git status"}');
    registry.finalize("tu_1");
    const entry = registry.lookup("tu_1");
    assert.deepStrictEqual(
      {
        turnId: entry?.turnId,
        toolName: entry?.toolName,
        parsedInput: entry?.info?.parsedInput,
        displayName: entry?.info?.displayName,
        invocationMessage: entry?.info?.invocationMessage,
        toolInput: entry?.info?.toolInput
      },
      {
        turnId: "turn-1",
        toolName: "Bash",
        parsedInput: { command: "git status" },
        displayName: "Run shell command",
        invocationMessage: { markdown: "Running `git status`" },
        toolInput: "git status"
      }
    );
  });
  test("finalize with malformed JSON falls back to undefined parsedInput, preserves raw buffer as toolInput", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_2", "Read", "turn-1");
    registry.appendInputDelta("tu_2", "{not valid json");
    registry.finalize("tu_2");
    const entry = registry.lookup("tu_2");
    assert.deepStrictEqual(
      {
        parsedInput: entry?.info?.parsedInput,
        displayName: entry?.info?.displayName,
        invocationMessage: entry?.info?.invocationMessage,
        // Raw buffer preserved so the UI still shows the SDK's payload
        // instead of an empty input section.
        toolInput: entry?.info?.toolInput
      },
      {
        parsedInput: void 0,
        displayName: "Read file",
        invocationMessage: "Reading file",
        toolInput: "{not valid json"
      }
    );
  });
  test("finalize with no deltas yields info with undefined parsedInput", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_3", "Grep", "turn-1");
    registry.finalize("tu_3");
    assert.deepStrictEqual(registry.lookup("tu_3")?.info?.parsedInput, void 0);
  });
  test("lookup before finalize returns attribution with undefined info", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_4", "Bash", "turn-2");
    registry.appendInputDelta("tu_4", '{"command":"ls"}');
    const entry = registry.lookup("tu_4");
    assert.deepStrictEqual(
      { turnId: entry?.turnId, toolName: entry?.toolName, info: entry?.info },
      { turnId: "turn-2", toolName: "Bash", info: void 0 }
    );
  });
  test("lookup of unknown id returns undefined; appendInputDelta / finalize are no-ops on unknown id", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.appendInputDelta("nope", "x");
    registry.finalize("nope");
    assert.strictEqual(registry.lookup("nope"), void 0);
  });
  test("complete removes the entry; subsequent lookup is undefined", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_5", "Bash", "turn-1");
    registry.finalize("tu_5");
    registry.complete("tu_5");
    assert.strictEqual(registry.lookup("tu_5"), void 0);
  });
  test("clearPending warns once per orphan and drains all entries", () => {
    const registry = new ClaudeToolCallRegistry();
    const log = new CapturingLog();
    registry.begin("tu_6", "Bash", "turn-1");
    registry.begin("tu_7", "Read", "turn-1");
    registry.clearPending(log);
    assert.strictEqual(registry.lookup("tu_6"), void 0);
    assert.strictEqual(registry.lookup("tu_7"), void 0);
    assert.strictEqual(log.warns.length, 2);
    assert.ok(log.warns[0].includes("tu_6") && log.warns[0].includes("Bash"));
    assert.ok(log.warns[1].includes("tu_7") && log.warns[1].includes("Read"));
  });
  test("clearPending is a silent no-op when nothing is pending", () => {
    const registry = new ClaudeToolCallRegistry();
    const log = new CapturingLog();
    registry.clearPending(log);
    assert.deepStrictEqual(log.warns, []);
  });
  test("seedParsedInput populates info from a pre-parsed object (inner subagent path)", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_seed", "Bash", "turn-1");
    registry.seedParsedInput("tu_seed", { command: "git status", description: "check" });
    const entry = registry.lookup("tu_seed");
    assert.deepStrictEqual({
      turnId: entry?.turnId,
      toolName: entry?.toolName,
      parsedInput: entry?.info?.parsedInput,
      invocationMessage: entry?.info?.invocationMessage,
      toolInput: entry?.info?.toolInput
    }, {
      turnId: "turn-1",
      toolName: "Bash",
      parsedInput: { command: "git status", description: "check" },
      invocationMessage: { markdown: "Running `git status`" },
      toolInput: "git status"
    });
  });
  test("seedParsedInput with non-object input yields info with undefined parsedInput", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.begin("tu_seed_bad", "Bash", "turn-1");
    registry.seedParsedInput("tu_seed_bad", "not an object");
    const info = registry.lookup("tu_seed_bad")?.info;
    assert.strictEqual(info?.parsedInput, void 0);
    assert.strictEqual(info?.toolInput, void 0);
  });
  test("seedParsedInput on unknown id is a silent no-op", () => {
    const registry = new ClaudeToolCallRegistry();
    registry.seedParsedInput("tu_unknown", { command: "ls" });
    assert.strictEqual(registry.lookup("tu_unknown"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlVG9vbENhbGxSZWdpc3RyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBMb2dMZXZlbCwgdHlwZSBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5LmpzJztcblxuY2xhc3MgQ2FwdHVyaW5nTG9nIGltcGxlbWVudHMgUGFydGlhbDxJTG9nU2VydmljZT4ge1xuXHRyZWFkb25seSB3YXJuczogc3RyaW5nW10gPSBbXTtcblx0d2FybihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHsgdGhpcy53YXJucy5wdXNoKG1lc3NhZ2UpOyB9XG5cdGVycm9yKCk6IHZvaWQgeyAvKiB1bnVzZWQgKi8gfVxuXHRpbmZvKCk6IHZvaWQgeyAvKiB1bnVzZWQgKi8gfVxuXHR0cmFjZSgpOiB2b2lkIHsgLyogdW51c2VkICovIH1cblx0ZGVidWcoKTogdm9pZCB7IC8qIHVudXNlZCAqLyB9XG5cdGdldExldmVsKCk6IExvZ0xldmVsIHsgcmV0dXJuIExvZ0xldmVsLk9mZjsgfVxufVxuXG5zdWl0ZSgnY2xhdWRlVG9vbENhbGxSZWdpc3RyeSBcdTIwMTQgUGhhc2UgOC41IGlucHV0L2luZm8gdHJhY2tpbmcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYmVnaW4gXHUyMTkyIGFwcGVuZElucHV0RGVsdGEgXHUyMTkyIGZpbmFsaXplIHN0YXNoZXMgcmljaCBpbmZvIGFuZCBwYXJzZWQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQ2xhdWRlVG9vbENhbGxSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LmJlZ2luKCd0dV8xJywgJ0Jhc2gnLCAndHVybi0xJyk7XG5cdFx0cmVnaXN0cnkuYXBwZW5kSW5wdXREZWx0YSgndHVfMScsICd7XCJjb21tYScpO1xuXHRcdHJlZ2lzdHJ5LmFwcGVuZElucHV0RGVsdGEoJ3R1XzEnLCAnbmRcIjpcImdpdCBzdGF0dXNcIn0nKTtcblx0XHRyZWdpc3RyeS5maW5hbGl6ZSgndHVfMScpO1xuXG5cdFx0Y29uc3QgZW50cnkgPSByZWdpc3RyeS5sb29rdXAoJ3R1XzEnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHR0dXJuSWQ6IGVudHJ5Py50dXJuSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiBlbnRyeT8udG9vbE5hbWUsXG5cdFx0XHRcdHBhcnNlZElucHV0OiBlbnRyeT8uaW5mbz8ucGFyc2VkSW5wdXQsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBlbnRyeT8uaW5mbz8uZGlzcGxheU5hbWUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBlbnRyeT8uaW5mbz8uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xJbnB1dDogZW50cnk/LmluZm8/LnRvb2xJbnB1dCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnQmFzaCcsXG5cdFx0XHRcdHBhcnNlZElucHV0OiB7IGNvbW1hbmQ6ICdnaXQgc3RhdHVzJyB9LFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBzaGVsbCBjb21tYW5kJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdSdW5uaW5nIGBnaXQgc3RhdHVzYCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAnZ2l0IHN0YXR1cycsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmFsaXplIHdpdGggbWFsZm9ybWVkIEpTT04gZmFsbHMgYmFjayB0byB1bmRlZmluZWQgcGFyc2VkSW5wdXQsIHByZXNlcnZlcyByYXcgYnVmZmVyIGFzIHRvb2xJbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkuYmVnaW4oJ3R1XzInLCAnUmVhZCcsICd0dXJuLTEnKTtcblx0XHRyZWdpc3RyeS5hcHBlbmRJbnB1dERlbHRhKCd0dV8yJywgJ3tub3QgdmFsaWQganNvbicpO1xuXHRcdHJlZ2lzdHJ5LmZpbmFsaXplKCd0dV8yJyk7XG5cblx0XHRjb25zdCBlbnRyeSA9IHJlZ2lzdHJ5Lmxvb2t1cCgndHVfMicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7XG5cdFx0XHRcdHBhcnNlZElucHV0OiBlbnRyeT8uaW5mbz8ucGFyc2VkSW5wdXQsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBlbnRyeT8uaW5mbz8uZGlzcGxheU5hbWUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBlbnRyeT8uaW5mbz8uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdC8vIFJhdyBidWZmZXIgcHJlc2VydmVkIHNvIHRoZSBVSSBzdGlsbCBzaG93cyB0aGUgU0RLJ3MgcGF5bG9hZFxuXHRcdFx0XHQvLyBpbnN0ZWFkIG9mIGFuIGVtcHR5IGlucHV0IHNlY3Rpb24uXG5cdFx0XHRcdHRvb2xJbnB1dDogZW50cnk/LmluZm8/LnRvb2xJbnB1dCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHBhcnNlZElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZCBmaWxlJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkaW5nIGZpbGUnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7bm90IHZhbGlkIGpzb24nLFxuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5hbGl6ZSB3aXRoIG5vIGRlbHRhcyB5aWVsZHMgaW5mbyB3aXRoIHVuZGVmaW5lZCBwYXJzZWRJbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkuYmVnaW4oJ3R1XzMnLCAnR3JlcCcsICd0dXJuLTEnKTtcblx0XHRyZWdpc3RyeS5maW5hbGl6ZSgndHVfMycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWdpc3RyeS5sb29rdXAoJ3R1XzMnKT8uaW5mbz8ucGFyc2VkSW5wdXQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvb2t1cCBiZWZvcmUgZmluYWxpemUgcmV0dXJucyBhdHRyaWJ1dGlvbiB3aXRoIHVuZGVmaW5lZCBpbmZvJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0XHRyZWdpc3RyeS5iZWdpbigndHVfNCcsICdCYXNoJywgJ3R1cm4tMicpO1xuXHRcdHJlZ2lzdHJ5LmFwcGVuZElucHV0RGVsdGEoJ3R1XzQnLCAne1wiY29tbWFuZFwiOlwibHNcIn0nKTtcblxuXHRcdGNvbnN0IGVudHJ5ID0gcmVnaXN0cnkubG9va3VwKCd0dV80Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgdHVybklkOiBlbnRyeT8udHVybklkLCB0b29sTmFtZTogZW50cnk/LnRvb2xOYW1lLCBpbmZvOiBlbnRyeT8uaW5mbyB9LFxuXHRcdFx0eyB0dXJuSWQ6ICd0dXJuLTInLCB0b29sTmFtZTogJ0Jhc2gnLCBpbmZvOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb29rdXAgb2YgdW5rbm93biBpZCByZXR1cm5zIHVuZGVmaW5lZDsgYXBwZW5kSW5wdXREZWx0YSAvIGZpbmFsaXplIGFyZSBuby1vcHMgb24gdW5rbm93biBpZCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkuYXBwZW5kSW5wdXREZWx0YSgnbm9wZScsICd4Jyk7XG5cdFx0cmVnaXN0cnkuZmluYWxpemUoJ25vcGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkubG9va3VwKCdub3BlJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBsZXRlIHJlbW92ZXMgdGhlIGVudHJ5OyBzdWJzZXF1ZW50IGxvb2t1cCBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQ2xhdWRlVG9vbENhbGxSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LmJlZ2luKCd0dV81JywgJ0Jhc2gnLCAndHVybi0xJyk7XG5cdFx0cmVnaXN0cnkuZmluYWxpemUoJ3R1XzUnKTtcblx0XHRyZWdpc3RyeS5jb21wbGV0ZSgndHVfNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5sb29rdXAoJ3R1XzUnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xlYXJQZW5kaW5nIHdhcm5zIG9uY2UgcGVyIG9ycGhhbiBhbmQgZHJhaW5zIGFsbCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgQ2FwdHVyaW5nTG9nKCk7XG5cdFx0cmVnaXN0cnkuYmVnaW4oJ3R1XzYnLCAnQmFzaCcsICd0dXJuLTEnKTtcblx0XHRyZWdpc3RyeS5iZWdpbigndHVfNycsICdSZWFkJywgJ3R1cm4tMScpO1xuXHRcdHJlZ2lzdHJ5LmNsZWFyUGVuZGluZyhsb2cgYXMgdW5rbm93biBhcyBJTG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVnaXN0cnkubG9va3VwKCd0dV82JyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdHJ5Lmxvb2t1cCgndHVfNycpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2cud2FybnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2sobG9nLndhcm5zWzBdLmluY2x1ZGVzKCd0dV82JykgJiYgbG9nLndhcm5zWzBdLmluY2x1ZGVzKCdCYXNoJykpO1xuXHRcdGFzc2VydC5vayhsb2cud2FybnNbMV0uaW5jbHVkZXMoJ3R1XzcnKSAmJiBsb2cud2FybnNbMV0uaW5jbHVkZXMoJ1JlYWQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyUGVuZGluZyBpcyBhIHNpbGVudCBuby1vcCB3aGVuIG5vdGhpbmcgaXMgcGVuZGluZycsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IENhcHR1cmluZ0xvZygpO1xuXHRcdHJlZ2lzdHJ5LmNsZWFyUGVuZGluZyhsb2cgYXMgdW5rbm93biBhcyBJTG9nU2VydmljZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cud2FybnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFBhcnNlZElucHV0IHBvcHVsYXRlcyBpbmZvIGZyb20gYSBwcmUtcGFyc2VkIG9iamVjdCAoaW5uZXIgc3ViYWdlbnQgcGF0aCknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQ2xhdWRlVG9vbENhbGxSZWdpc3RyeSgpO1xuXHRcdHJlZ2lzdHJ5LmJlZ2luKCd0dV9zZWVkJywgJ0Jhc2gnLCAndHVybi0xJyk7XG5cdFx0cmVnaXN0cnkuc2VlZFBhcnNlZElucHV0KCd0dV9zZWVkJywgeyBjb21tYW5kOiAnZ2l0IHN0YXR1cycsIGRlc2NyaXB0aW9uOiAnY2hlY2snIH0pO1xuXG5cdFx0Y29uc3QgZW50cnkgPSByZWdpc3RyeS5sb29rdXAoJ3R1X3NlZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHR1cm5JZDogZW50cnk/LnR1cm5JZCxcblx0XHRcdHRvb2xOYW1lOiBlbnRyeT8udG9vbE5hbWUsXG5cdFx0XHRwYXJzZWRJbnB1dDogZW50cnk/LmluZm8/LnBhcnNlZElucHV0LFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGVudHJ5Py5pbmZvPy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHRvb2xJbnB1dDogZW50cnk/LmluZm8/LnRvb2xJbnB1dCxcblx0XHR9LCB7XG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0dG9vbE5hbWU6ICdCYXNoJyxcblx0XHRcdHBhcnNlZElucHV0OiB7IGNvbW1hbmQ6ICdnaXQgc3RhdHVzJywgZGVzY3JpcHRpb246ICdjaGVjaycgfSxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnUnVubmluZyBgZ2l0IHN0YXR1c2AnIH0sXG5cdFx0XHR0b29sSW5wdXQ6ICdnaXQgc3RhdHVzJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZFBhcnNlZElucHV0IHdpdGggbm9uLW9iamVjdCBpbnB1dCB5aWVsZHMgaW5mbyB3aXRoIHVuZGVmaW5lZCBwYXJzZWRJbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkuYmVnaW4oJ3R1X3NlZWRfYmFkJywgJ0Jhc2gnLCAndHVybi0xJyk7XG5cdFx0cmVnaXN0cnkuc2VlZFBhcnNlZElucHV0KCd0dV9zZWVkX2JhZCcsICdub3QgYW4gb2JqZWN0Jyk7XG5cblx0XHRjb25zdCBpbmZvID0gcmVnaXN0cnkubG9va3VwKCd0dV9zZWVkX2JhZCcpPy5pbmZvO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmZvPy5wYXJzZWRJbnB1dCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5mbz8udG9vbElucHV0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWVkUGFyc2VkSW5wdXQgb24gdW5rbm93biBpZCBpcyBhIHNpbGVudCBuby1vcCcsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5KCk7XG5cdFx0cmVnaXN0cnkuc2VlZFBhcnNlZElucHV0KCd0dV91bmtub3duJywgeyBjb21tYW5kOiAnbHMnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RyeS5sb29rdXAoJ3R1X3Vua25vd24nKSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFrQztBQUMzQyxTQUFTLDhCQUE4QjtBQUV2QyxNQUFNLGFBQTZDO0FB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
