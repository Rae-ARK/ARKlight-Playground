import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CLAUDE_THINKING_LEVEL_KEY, toRuntimeEffortLevel, createClaudeThinkingLevelSchema, isClaudeEffortLevel, resolveClaudeEffort } from "../../common/claudeModelConfig.js";
suite("resolveClaudeEffort (Phase 6.1 / Cycle E)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns the SDK enum value for each accepted thinkingLevel string", () => {
    const accepted = ["low", "medium", "high", "xhigh", "max"];
    const actual = accepted.map((level) => resolveClaudeEffort({
      id: "claude-opus-4.6",
      config: { [CLAUDE_THINKING_LEVEL_KEY]: level }
    }));
    assert.deepStrictEqual(actual, ["low", "medium", "high", "xhigh", "max"]);
  });
  test("returns undefined for absent / unrecognized inputs (SDK default takes over)", () => {
    const cases = [
      void 0,
      { id: "claude-opus-4.6" },
      { id: "claude-opus-4.6", config: {} },
      { id: "claude-opus-4.6", config: { unrelated: "high" } },
      { id: "claude-opus-4.6", config: { [CLAUDE_THINKING_LEVEL_KEY]: "turbo" } }
    ];
    assert.deepStrictEqual(cases.map(resolveClaudeEffort), [void 0, void 0, void 0, void 0, void 0]);
  });
});
suite("toRuntimeEffortLevel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("passes every level through unchanged \u2014 including `max` \u2014 and preserves undefined", () => {
    const inputs = [void 0, "low", "medium", "high", "xhigh", "max"];
    assert.deepStrictEqual(
      inputs.map(toRuntimeEffortLevel),
      [void 0, "low", "medium", "high", "xhigh", "max"]
    );
  });
});
suite("isClaudeEffortLevel (Phase 6.1 / Cycle D3)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepts the canonical 5-value union, rejects anything else", () => {
    const inputs = ["low", "medium", "high", "xhigh", "max", "", "LOW", "turbo", "minimal", "High"];
    assert.deepStrictEqual(inputs.map(isClaudeEffortLevel), [true, true, true, true, true, false, false, false, false, false]);
  });
});
suite("createClaudeThinkingLevelSchema (Phase 6.1 / Cycle D3)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("per-model variation: enum + enumLabels + default track the supplied list; empty list returns undefined", () => {
    const fullUnion = ["low", "medium", "high", "xhigh", "max"];
    const lowMediumHigh = ["low", "medium", "high"];
    const highOnly = ["high"];
    const noHigh = ["max", "low"];
    const empty = [];
    assert.deepStrictEqual({
      fullUnion: createClaudeThinkingLevelSchema(fullUnion),
      lowMediumHigh: createClaudeThinkingLevelSchema(lowMediumHigh),
      highOnly: createClaudeThinkingLevelSchema(highOnly),
      noHigh: createClaudeThinkingLevelSchema(noHigh),
      empty: createClaudeThinkingLevelSchema(empty)
    }, {
      fullUnion: {
        type: "object",
        properties: {
          thinkingLevel: {
            type: "string",
            title: "Thinking Level",
            description: "Controls how much reasoning effort Claude uses.",
            enum: ["low", "medium", "high", "xhigh", "max"],
            enumLabels: ["Low", "Medium", "High", "Extra High", "Max"],
            enumDescriptions: ["Faster responses with less reasoning", "Balanced reasoning and speed", "Greater reasoning depth but slower", "Highest reasoning depth but slowest", "Absolute maximum capability with no constraints"],
            default: "high"
          }
        }
      },
      lowMediumHigh: {
        type: "object",
        properties: {
          thinkingLevel: {
            type: "string",
            title: "Thinking Level",
            description: "Controls how much reasoning effort Claude uses.",
            enum: ["low", "medium", "high"],
            enumLabels: ["Low", "Medium", "High"],
            enumDescriptions: ["Faster responses with less reasoning", "Balanced reasoning and speed", "Greater reasoning depth but slower"],
            default: "high"
          }
        }
      },
      highOnly: {
        type: "object",
        properties: {
          thinkingLevel: {
            type: "string",
            title: "Thinking Level",
            description: "Controls how much reasoning effort Claude uses.",
            enum: ["high"],
            enumLabels: ["High"],
            enumDescriptions: ["Greater reasoning depth but slower"],
            default: "high"
          }
        }
      },
      noHigh: {
        type: "object",
        properties: {
          thinkingLevel: {
            type: "string",
            title: "Thinking Level",
            description: "Controls how much reasoning effort Claude uses.",
            enum: ["max", "low"],
            enumLabels: ["Max", "Low"],
            enumDescriptions: ["Absolute maximum capability with no constraints", "Faster responses with less reasoning"]
          }
        }
      },
      empty: void 0
    });
  });
  test(`emits default: 'high' iff 'high' is in the supported list, never substitutes another value`, () => {
    const cases = [
      { input: ["high"], expected: "high" },
      { input: ["low", "high"], expected: "high" },
      { input: ["low", "medium", "high", "xhigh", "max"], expected: "high" },
      { input: ["low"], expected: void 0 },
      { input: ["low", "medium"], expected: void 0 },
      { input: ["xhigh"], expected: void 0 },
      { input: ["xhigh", "max"], expected: void 0 }
    ];
    assert.deepStrictEqual(
      cases.map((c) => createClaudeThinkingLevelSchema(c.input)?.properties.thinkingLevel.default),
      cases.map((c) => c.expected)
    );
  });
  test("input array is not mutated and the returned enum is independent of subsequent input mutation", () => {
    const input = ["low", "high"];
    const schema = createClaudeThinkingLevelSchema(input);
    input.push("max");
    assert.deepStrictEqual({
      input,
      enum: schema?.properties.thinkingLevel.enum,
      default: schema?.properties.thinkingLevel.default
    }, {
      input: ["low", "high", "max"],
      enum: ["low", "high"],
      default: "high"
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9jbGF1ZGVNb2RlbENvbmZpZy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDTEFVREVfVEhJTktJTkdfTEVWRUxfS0VZLCB0b1J1bnRpbWVFZmZvcnRMZXZlbCwgY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYSwgaXNDbGF1ZGVFZmZvcnRMZXZlbCwgcmVzb2x2ZUNsYXVkZUVmZm9ydCwgdHlwZSBDbGF1ZGVFZmZvcnRMZXZlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jbGF1ZGVNb2RlbENvbmZpZy5qcyc7XG5pbXBvcnQgdHlwZSB7IE1vZGVsU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcblxuc3VpdGUoJ3Jlc29sdmVDbGF1ZGVFZmZvcnQgKFBoYXNlIDYuMSAvIEN5Y2xlIEUpJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgdGhlIFNESyBlbnVtIHZhbHVlIGZvciBlYWNoIGFjY2VwdGVkIHRoaW5raW5nTGV2ZWwgc3RyaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjY2VwdGVkID0gWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnLCAneGhpZ2gnLCAnbWF4J10gYXMgY29uc3Q7XG5cdFx0Y29uc3QgYWN0dWFsID0gYWNjZXB0ZWQubWFwKGxldmVsID0+IHJlc29sdmVDbGF1ZGVFZmZvcnQoe1xuXHRcdFx0aWQ6ICdjbGF1ZGUtb3B1cy00LjYnLFxuXHRcdFx0Y29uZmlnOiB7IFtDTEFVREVfVEhJTktJTkdfTEVWRUxfS0VZXTogbGV2ZWwgfSxcblx0XHR9KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFsnbG93JywgJ21lZGl1bScsICdoaWdoJywgJ3hoaWdoJywgJ21heCddKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGFic2VudCAvIHVucmVjb2duaXplZCBpbnB1dHMgKFNESyBkZWZhdWx0IHRha2VzIG92ZXIpJywgKCkgPT4ge1xuXHRcdC8vIEVhY2ggaW5wdXQgcmVwcmVzZW50cyBhIHJlYWwgZmFpbHVyZSBtb2RlIHRoZSBtYXRlcmlhbGl6ZSBzaXRlIGNhblxuXHRcdC8vIGhpdDogbm8gbW9kZWwgcGlja2VkLCBtb2RlbCB3aXRoIG5vIGNvbmZpZyBiYWcsIG1vZGVsIHdpdGggZW1wdHlcblx0XHQvLyBjb25maWcgYmFnLCBtb2RlbCB3aXRoIGNvbmZpZyBidXQgbm8gdGhpbmtpbmdMZXZlbCBrZXksIGFuZCBhIG1vZGVsXG5cdFx0Ly8gd2hvc2UgdGhpbmtpbmdMZXZlbCBzdHJpbmcgaXMgb3V0c2lkZSB0aGUgdW5pb24uIEFsbCBmaXZlIG11c3Rcblx0XHQvLyBkZWdyYWRlIHRvIGB1bmRlZmluZWRgIHNvIHRoZSBTREsgZmFsbHMgdGhyb3VnaCB0byBpdHMgb3duIGRlZmF1bHRcblx0XHQvLyBpbnN0ZWFkIG9mIGJlaW5nIHRvbGQgdG8gdXNlIGEgdmFsdWUgaXQgZG9lc24ndCB1bmRlcnN0YW5kLlxuXHRcdGNvbnN0IGNhc2VzOiByZWFkb25seSAoTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQpW10gPSBbXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IGlkOiAnY2xhdWRlLW9wdXMtNC42JyB9LFxuXHRcdFx0eyBpZDogJ2NsYXVkZS1vcHVzLTQuNicsIGNvbmZpZzoge30gfSxcblx0XHRcdHsgaWQ6ICdjbGF1ZGUtb3B1cy00LjYnLCBjb25maWc6IHsgdW5yZWxhdGVkOiAnaGlnaCcgfSB9LFxuXHRcdFx0eyBpZDogJ2NsYXVkZS1vcHVzLTQuNicsIGNvbmZpZzogeyBbQ0xBVURFX1RISU5LSU5HX0xFVkVMX0tFWV06ICd0dXJibycgfSB9LFxuXHRcdF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYXNlcy5tYXAocmVzb2x2ZUNsYXVkZUVmZm9ydCksIFt1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZF0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndG9SdW50aW1lRWZmb3J0TGV2ZWwnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGFzc2VzIGV2ZXJ5IGxldmVsIHRocm91Z2ggdW5jaGFuZ2VkIFx1MjAxNCBpbmNsdWRpbmcgYG1heGAgXHUyMDE0IGFuZCBwcmVzZXJ2ZXMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBTREsncyBydW50aW1lIGBTZXR0aW5ncy5lZmZvcnRMZXZlbGAgdHlwZSBkZWNsYXJlcyBpdCBjYW4ndCBhY2NlcHRcblx0XHQvLyBgJ21heCdgLCBidXQgdGhlIEFudGhyb3BpYyBBUEkgLyBDQVBJIGRvIGFjY2VwdCBpdCwgc28gdGhlIGNsYW1wXG5cdFx0Ly8gZGVsaWJlcmF0ZWx5IGxldHMgYCdtYXgnYCBmbG93IHRocm91Z2ggcmF0aGVyIHRoYW4gZGVncmFkaW5nIGl0IHRvXG5cdFx0Ly8gYCd4aGlnaCdgLiBUaGUgZGVjbGFyZWQgcmV0dXJuIHR5cGUgc3RpbGwgZXhjbHVkZXMgYCdtYXgnYDsgdGhlIHZhbHVlXG5cdFx0Ly8gY2FycmllZCBhdCBydW50aW1lIGRvZXMgbm90LlxuXHRcdGNvbnN0IGlucHV0czogcmVhZG9ubHkgKENsYXVkZUVmZm9ydExldmVsIHwgdW5kZWZpbmVkKVtdID0gW3VuZGVmaW5lZCwgJ2xvdycsICdtZWRpdW0nLCAnaGlnaCcsICd4aGlnaCcsICdtYXgnXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0aW5wdXRzLm1hcCh0b1J1bnRpbWVFZmZvcnRMZXZlbCksXG5cdFx0XHRbdW5kZWZpbmVkLCAnbG93JywgJ21lZGl1bScsICdoaWdoJywgJ3hoaWdoJywgJ21heCddLFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdpc0NsYXVkZUVmZm9ydExldmVsIChQaGFzZSA2LjEgLyBDeWNsZSBEMyknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYWNjZXB0cyB0aGUgY2Fub25pY2FsIDUtdmFsdWUgdW5pb24sIHJlamVjdHMgYW55dGhpbmcgZWxzZScsICgpID0+IHtcblx0XHQvLyBQaWNrZXItc2lkZSBhbmQgcmVhZC1zaWRlIG11c3QgYWdyZWUgb24gdGhlIHNhbWUgdW5pb246IHRoZSBwaWNrZXJcblx0XHQvLyBvbmx5IGVtaXRzIHRoZXNlIGZpdmUgc3RyaW5ncywgYW5kIGB0b0FnZW50TW9kZWxJbmZvYCBmaWx0ZXJzXG5cdFx0Ly8gQ0FQSSdzIGByZWFzb25pbmdfZWZmb3J0YCBhcnJheSB0aHJvdWdoIHRoaXMgZ3VhcmQgYmVmb3JlIHBhc3Npbmdcblx0XHQvLyBpdCBpbnRvIGBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hYC4gQSBkcmlmdCBiZXR3ZWVuIHRoZSB0d29cblx0XHQvLyB3b3VsZCBzdXJmYWNlIGFzIGEgbW9kZWwgd2hvc2UgZW51bSBhZHZlcnRpc2VzIGEgdmFsdWUgdGhlXG5cdFx0Ly8gbWF0ZXJpYWxpemUgc2l0ZSBjYW4ndCBob25vci5cblx0XHRjb25zdCBpbnB1dHMgPSBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCcsICd4aGlnaCcsICdtYXgnLCAnJywgJ0xPVycsICd0dXJibycsICdtaW5pbWFsJywgJ0hpZ2gnXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGlucHV0cy5tYXAoaXNDbGF1ZGVFZmZvcnRMZXZlbCksIFt0cnVlLCB0cnVlLCB0cnVlLCB0cnVlLCB0cnVlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2NyZWF0ZUNsYXVkZVRoaW5raW5nTGV2ZWxTY2hlbWEgKFBoYXNlIDYuMSAvIEN5Y2xlIEQzKScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwZXItbW9kZWwgdmFyaWF0aW9uOiBlbnVtICsgZW51bUxhYmVscyArIGRlZmF1bHQgdHJhY2sgdGhlIHN1cHBsaWVkIGxpc3Q7IGVtcHR5IGxpc3QgcmV0dXJucyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Ly8gU2luZ2xlIHNuYXBzaG90IGNvdmVyaW5nIGV2ZXJ5IHNoYXBlIHRoZSBjYWxsZXIgY2FuIGhhbmQgaW46IHRoZVxuXHRcdC8vIGZ1bGwgNS12YWx1ZSB1bmlvbiwgYSAzLXZhbHVlIHN1YnNldCAobW9zdCBjb21tb24gQ2xhdWRlIGNhc2UpLCBhXG5cdFx0Ly8gc2luZ2xlLXZhbHVlIGxpc3QsIGFuIG91dC1vZi1jYW5vbmljYWwtb3JkZXIgbGlzdCB0aGF0IG9taXRzXG5cdFx0Ly8gJ2hpZ2gnIChubyBgZGVmYXVsdGAgZW1pdHRlZCksIGFuZCB0aGUgZW1wdHkgbGlzdCAobm8gc2NoZW1hXG5cdFx0Ly8gcmVuZGVyZWQsIHBpY2tlciBoaWRlcyB0aGUgY29udHJvbCkuIEFzc2VydGluZyB0aGVtIHRvZ2V0aGVyXG5cdFx0Ly8gbG9ja3MgKGEpIGBlbnVtYCBvcmRlcmluZyBhbmQgYGVudW1MYWJlbHNgIG9yZGVyaW5nIHN0YXkgMToxIHdpdGhcblx0XHQvLyB0aGUgaW5wdXQsIGFuZCAoYikgYGRlZmF1bHQ6ICdoaWdoJ2AgaXMgZW1pdHRlZCBpZmYgJ2hpZ2gnIGlzIGluXG5cdFx0Ly8gdGhlIHN1cHBvcnRlZCBsaXN0IChtaXJyb3Igb2YgdGhlIGV4dGVuc2lvbidzIHJ1bGUgYXRcblx0XHQvLyBleHRlbnNpb25zL2NvcGlsb3QvLi4uL2NsYXVkZUNvZGVNb2RlbHMudHM6MjMwKS5cblx0XHRjb25zdCBmdWxsVW5pb246IHJlYWRvbmx5IENsYXVkZUVmZm9ydExldmVsW10gPSBbJ2xvdycsICdtZWRpdW0nLCAnaGlnaCcsICd4aGlnaCcsICdtYXgnXTtcblx0XHRjb25zdCBsb3dNZWRpdW1IaWdoOiByZWFkb25seSBDbGF1ZGVFZmZvcnRMZXZlbFtdID0gWydsb3cnLCAnbWVkaXVtJywgJ2hpZ2gnXTtcblx0XHRjb25zdCBoaWdoT25seTogcmVhZG9ubHkgQ2xhdWRlRWZmb3J0TGV2ZWxbXSA9IFsnaGlnaCddO1xuXHRcdGNvbnN0IG5vSGlnaDogcmVhZG9ubHkgQ2xhdWRlRWZmb3J0TGV2ZWxbXSA9IFsnbWF4JywgJ2xvdyddO1xuXHRcdGNvbnN0IGVtcHR5OiByZWFkb25seSBDbGF1ZGVFZmZvcnRMZXZlbFtdID0gW107XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZ1bGxVbmlvbjogY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShmdWxsVW5pb24pLFxuXHRcdFx0bG93TWVkaXVtSGlnaDogY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShsb3dNZWRpdW1IaWdoKSxcblx0XHRcdGhpZ2hPbmx5OiBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hKGhpZ2hPbmx5KSxcblx0XHRcdG5vSGlnaDogY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShub0hpZ2gpLFxuXHRcdFx0ZW1wdHk6IGNyZWF0ZUNsYXVkZVRoaW5raW5nTGV2ZWxTY2hlbWEoZW1wdHkpLFxuXHRcdH0sIHtcblx0XHRcdGZ1bGxVbmlvbjoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHRoaW5raW5nTGV2ZWw6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdUaGlua2luZyBMZXZlbCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbnRyb2xzIGhvdyBtdWNoIHJlYXNvbmluZyBlZmZvcnQgQ2xhdWRlIHVzZXMuJyxcblx0XHRcdFx0XHRcdGVudW06IFsnbG93JywgJ21lZGl1bScsICdoaWdoJywgJ3hoaWdoJywgJ21heCddLFxuXHRcdFx0XHRcdFx0ZW51bUxhYmVsczogWydMb3cnLCAnTWVkaXVtJywgJ0hpZ2gnLCAnRXh0cmEgSGlnaCcsICdNYXgnXSxcblx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFsnRmFzdGVyIHJlc3BvbnNlcyB3aXRoIGxlc3MgcmVhc29uaW5nJywgJ0JhbGFuY2VkIHJlYXNvbmluZyBhbmQgc3BlZWQnLCAnR3JlYXRlciByZWFzb25pbmcgZGVwdGggYnV0IHNsb3dlcicsICdIaWdoZXN0IHJlYXNvbmluZyBkZXB0aCBidXQgc2xvd2VzdCcsICdBYnNvbHV0ZSBtYXhpbXVtIGNhcGFiaWxpdHkgd2l0aCBubyBjb25zdHJhaW50cyddLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ2hpZ2gnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0bG93TWVkaXVtSGlnaDoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHRoaW5raW5nTGV2ZWw6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdUaGlua2luZyBMZXZlbCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbnRyb2xzIGhvdyBtdWNoIHJlYXNvbmluZyBlZmZvcnQgQ2xhdWRlIHVzZXMuJyxcblx0XHRcdFx0XHRcdGVudW06IFsnbG93JywgJ21lZGl1bScsICdoaWdoJ10sXG5cdFx0XHRcdFx0XHRlbnVtTGFiZWxzOiBbJ0xvdycsICdNZWRpdW0nLCAnSGlnaCddLFxuXHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogWydGYXN0ZXIgcmVzcG9uc2VzIHdpdGggbGVzcyByZWFzb25pbmcnLCAnQmFsYW5jZWQgcmVhc29uaW5nIGFuZCBzcGVlZCcsICdHcmVhdGVyIHJlYXNvbmluZyBkZXB0aCBidXQgc2xvd2VyJ10sXG5cdFx0XHRcdFx0XHRkZWZhdWx0OiAnaGlnaCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRoaWdoT25seToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHRoaW5raW5nTGV2ZWw6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdUaGlua2luZyBMZXZlbCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbnRyb2xzIGhvdyBtdWNoIHJlYXNvbmluZyBlZmZvcnQgQ2xhdWRlIHVzZXMuJyxcblx0XHRcdFx0XHRcdGVudW06IFsnaGlnaCddLFxuXHRcdFx0XHRcdFx0ZW51bUxhYmVsczogWydIaWdoJ10sXG5cdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbJ0dyZWF0ZXIgcmVhc29uaW5nIGRlcHRoIGJ1dCBzbG93ZXInXSxcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdoaWdoJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdG5vSGlnaDoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHRoaW5raW5nTGV2ZWw6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdUaGlua2luZyBMZXZlbCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbnRyb2xzIGhvdyBtdWNoIHJlYXNvbmluZyBlZmZvcnQgQ2xhdWRlIHVzZXMuJyxcblx0XHRcdFx0XHRcdGVudW06IFsnbWF4JywgJ2xvdyddLFxuXHRcdFx0XHRcdFx0ZW51bUxhYmVsczogWydNYXgnLCAnTG93J10sXG5cdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbJ0Fic29sdXRlIG1heGltdW0gY2FwYWJpbGl0eSB3aXRoIG5vIGNvbnN0cmFpbnRzJywgJ0Zhc3RlciByZXNwb25zZXMgd2l0aCBsZXNzIHJlYXNvbmluZyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZW1wdHk6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdChgZW1pdHMgZGVmYXVsdDogJ2hpZ2gnIGlmZiAnaGlnaCcgaXMgaW4gdGhlIHN1cHBvcnRlZCBsaXN0LCBuZXZlciBzdWJzdGl0dXRlcyBhbm90aGVyIHZhbHVlYCwgKCkgPT4ge1xuXHRcdC8vICdoaWdoJyBpcyB0aGUgY2Fub25pY2FsIENsYXVkZSBkZWZhdWx0IChzZXJ2ZXItc2lkZSBmYWxsYmFjayB3aGVuXG5cdFx0Ly8gYWRhcHRpdmUgdGhpbmtpbmcgaXMgZW5hYmxlZCkuIFdoZW4gYSBtb2RlbCBvbWl0cyAnaGlnaCcgdGhlXG5cdFx0Ly8gaGVscGVyIG11c3QgTk9UIHBpY2sgYW5vdGhlciB2YWx1ZSBhcyBhIHN0YW5kLWluIGRlZmF1bHQgXHUyMDE0IHRoZVxuXHRcdC8vIHBpY2tlciBzaG91bGQgb3BlbiB3aXRoIG5vIHByZS1zZWxlY3Rpb24gc28gdGhlIFNESyBmYWxscyB0aHJvdWdoXG5cdFx0Ly8gdG8gaXRzIG93biBkZWZhdWx0IHJhdGhlciB0aGFuIGJlaW5nIHRvbGQgdG8gdXNlIGEgdmFsdWUgdGhlIHVzZXJcblx0XHQvLyBkaWRuJ3QgcGljay5cblx0XHRjb25zdCBjYXNlczogcmVhZG9ubHkgeyBpbnB1dDogcmVhZG9ubHkgQ2xhdWRlRWZmb3J0TGV2ZWxbXTsgZXhwZWN0ZWQ6IENsYXVkZUVmZm9ydExldmVsIHwgdW5kZWZpbmVkIH1bXSA9IFtcblx0XHRcdHsgaW5wdXQ6IFsnaGlnaCddLCBleHBlY3RlZDogJ2hpZ2gnIH0sXG5cdFx0XHR7IGlucHV0OiBbJ2xvdycsICdoaWdoJ10sIGV4cGVjdGVkOiAnaGlnaCcgfSxcblx0XHRcdHsgaW5wdXQ6IFsnbG93JywgJ21lZGl1bScsICdoaWdoJywgJ3hoaWdoJywgJ21heCddLCBleHBlY3RlZDogJ2hpZ2gnIH0sXG5cdFx0XHR7IGlucHV0OiBbJ2xvdyddLCBleHBlY3RlZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGlucHV0OiBbJ2xvdycsICdtZWRpdW0nXSwgZXhwZWN0ZWQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBpbnB1dDogWyd4aGlnaCddLCBleHBlY3RlZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IGlucHV0OiBbJ3hoaWdoJywgJ21heCddLCBleHBlY3RlZDogdW5kZWZpbmVkIH0sXG5cdFx0XTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Y2FzZXMubWFwKGMgPT4gY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShjLmlucHV0KT8ucHJvcGVydGllcy50aGlua2luZ0xldmVsLmRlZmF1bHQpLFxuXHRcdFx0Y2FzZXMubWFwKGMgPT4gYy5leHBlY3RlZCksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5wdXQgYXJyYXkgaXMgbm90IG11dGF0ZWQgYW5kIHRoZSByZXR1cm5lZCBlbnVtIGlzIGluZGVwZW5kZW50IG9mIHN1YnNlcXVlbnQgaW5wdXQgbXV0YXRpb24nLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGhlbHBlciBpcyBpbnZva2VkIG9uY2UgcGVyIG1vZGVsIGF0IGF1dGhlbnRpY2F0ZS10aW1lOyB0aGVcblx0XHQvLyBjYWxsZXIncyBhcnJheSBpcyB0aGUgcG9zdC1gZmlsdGVyYCB2aWV3IG9mIGByZWFzb25pbmdfZWZmb3J0YC5cblx0XHQvLyBJZiB0aGUgc2NoZW1hJ3MgYGVudW1gIGFsaWFzZWQgdGhlIGlucHV0IGFycmF5LCBhIHN1YnNlcXVlbnRcblx0XHQvLyBtdXRhdGlvbiAoZS5nLiBhbm90aGVyIGNhbGxlciByZXVzaW5nIGEgYnVmZmVyKSB3b3VsZCBzaWxlbnRseVxuXHRcdC8vIHJld3JpdGUgYW4gYWxyZWFkeS1wdWJsaXNoZWQgYElBZ2VudE1vZGVsSW5mby5jb25maWdTY2hlbWFgLlxuXHRcdGNvbnN0IGlucHV0OiBDbGF1ZGVFZmZvcnRMZXZlbFtdID0gWydsb3cnLCAnaGlnaCddO1xuXHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZUNsYXVkZVRoaW5raW5nTGV2ZWxTY2hlbWEoaW5wdXQpO1xuXHRcdGlucHV0LnB1c2goJ21heCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW5wdXQsXG5cdFx0XHRlbnVtOiBzY2hlbWE/LnByb3BlcnRpZXMudGhpbmtpbmdMZXZlbC5lbnVtLFxuXHRcdFx0ZGVmYXVsdDogc2NoZW1hPy5wcm9wZXJ0aWVzLnRoaW5raW5nTGV2ZWwuZGVmYXVsdCxcblx0XHR9LCB7XG5cdFx0XHRpbnB1dDogWydsb3cnLCAnaGlnaCcsICdtYXgnXSxcblx0XHRcdGVudW06IFsnbG93JywgJ2hpZ2gnXSxcblx0XHRc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
