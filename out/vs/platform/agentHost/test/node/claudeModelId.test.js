import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { parseClaudeModelId, toSdkModelId, tryParseClaudeModelId } from "../../node/claude/claudeModelId.js";
suite("parseClaudeModelId", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parsing SDK model IDs", () => {
    test("parses claude-{name}-{major}-{minor}-{date}", () => {
      const result = parseClaudeModelId("claude-opus-4-5-20251101");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.5", modifiers: "20251101" }
      );
    });
    test("parses claude-{major}-{minor}-{name}-{date} (old format)", () => {
      const result = parseClaudeModelId("claude-3-5-sonnet-20241022");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "3.5", modifiers: "20241022" }
      );
    });
    test("parses claude-{name}-{major}-{date}", () => {
      const result = parseClaudeModelId("claude-sonnet-4-20250514");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "4", modifiers: "20250514" }
      );
    });
    test("parses claude-{major}-{name}-{date} (old format)", () => {
      const result = parseClaudeModelId("claude-3-opus-20240229");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "3", modifiers: "20240229" }
      );
    });
    test("parses SDK ID without date suffix", () => {
      const result = parseClaudeModelId("claude-opus-4-5");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.5", modifiers: "" }
      );
    });
  });
  suite("parsing endpoint model IDs", () => {
    test("parses claude-{name}-{major}.{minor}", () => {
      const result = parseClaudeModelId("claude-opus-4.5");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.5", modifiers: "" }
      );
    });
    test("parses claude-{name}-{major}", () => {
      const result = parseClaudeModelId("claude-sonnet-4");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "4", modifiers: "" }
      );
    });
    test("parses claude-haiku-3.5", () => {
      const result = parseClaudeModelId("claude-haiku-3.5");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "haiku", version: "3.5", modifiers: "" }
      );
    });
  });
  suite("modifiers (non-date suffixes)", () => {
    test("parses endpoint ID with 1m context variant (dot version)", () => {
      const result = parseClaudeModelId("claude-opus-4.6-1m");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.6", modifiers: "1m" }
      );
    });
    test("parses SDK ID with 1m context variant (dash version)", () => {
      const result = parseClaudeModelId("claude-opus-4-6-1m");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.6", modifiers: "1m" }
      );
    });
    test("parses SDK ID with both 1m modifier and date suffix", () => {
      const result = parseClaudeModelId("claude-opus-4-6-1m-20251101");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "opus", version: "4.6", modifiers: "1m-20251101" }
      );
    });
    test("parses single-version ID with modifier", () => {
      const result = parseClaudeModelId("claude-sonnet-4-1m");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "4", modifiers: "1m" }
      );
    });
    test("1m on opus converts to correct SDK model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4.6-1m").toSdkModelId(), "claude-opus-4-6-1m");
    });
    test("1m on opus converts to correct endpoint model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-6-1m").toEndpointModelId(), "claude-opus-4.6-1m");
    });
    test("1m on non-opus model is not included in SDK model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-sonnet-4-1m").toSdkModelId(), "claude-sonnet-4");
    });
    test("1m on non-opus model is not included in endpoint model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-sonnet-4-1m").toEndpointModelId(), "claude-sonnet-4");
    });
    test("1m with date suffix on opus keeps only 1m in SDK model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-6-1m-20251101").toSdkModelId(), "claude-opus-4-6-1m");
    });
    test("1m with date suffix on opus keeps only 1m in endpoint model ID", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-6-1m-20251101").toEndpointModelId(), "claude-opus-4.6-1m");
    });
  });
  suite("bare model names", () => {
    test("parses a bare name with no version", () => {
      const result = parseClaudeModelId("foo");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "foo", version: "", modifiers: "" }
      );
    });
    test("toSdkModelId returns the bare name", () => {
      assert.strictEqual(parseClaudeModelId("foo").toSdkModelId(), "foo");
    });
    test("toEndpointModelId returns the bare name", () => {
      assert.strictEqual(parseClaudeModelId("foo").toEndpointModelId(), "foo");
    });
    test('parses bare "claude" as a bare name', () => {
      const result = parseClaudeModelId("claude");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "claude", version: "", modifiers: "" }
      );
    });
  });
  suite("unparseable inputs", () => {
    test("throws for hyphenated non-Claude IDs", () => {
      assert.throws(() => parseClaudeModelId("gpt-4o"), /Unable to parse Claude model ID: 'gpt-4o'/);
    });
    test("throws for garbage with hyphens", () => {
      assert.throws(() => parseClaudeModelId("invalid-model-id"));
    });
  });
  suite("tryParseClaudeModelId", () => {
    test("returns undefined for hyphenated non-Claude IDs", () => {
      assert.strictEqual(tryParseClaudeModelId("gpt-4o"), void 0);
    });
    test("returns a result for bare names", () => {
      const result = tryParseClaudeModelId("foo");
      assert.ok(result);
      assert.deepStrictEqual({ name: result.name, version: result.version }, { name: "foo", version: "" });
    });
    test("returns a result for valid Claude IDs", () => {
      const result = tryParseClaudeModelId("claude-sonnet-4");
      assert.ok(result);
      assert.deepStrictEqual({ name: result.name, version: result.version }, { name: "sonnet", version: "4" });
    });
  });
  suite("case insensitivity", () => {
    test("parses uppercase input", () => {
      const result = parseClaudeModelId("CLAUDE-OPUS-4-5");
      assert.deepStrictEqual(
        { name: result.name, version: result.version },
        { name: "opus", version: "4.5" }
      );
    });
    test("parses mixed case input", () => {
      const result = parseClaudeModelId("Claude-Sonnet-4-20250514");
      assert.deepStrictEqual(
        { name: result.name, version: result.version, modifiers: result.modifiers },
        { name: "sonnet", version: "4", modifiers: "20250514" }
      );
    });
  });
  suite("caching", () => {
    test("returns the same object for repeated calls", () => {
      const first = parseClaudeModelId("claude-opus-4-5-20251101");
      const second = parseClaudeModelId("claude-opus-4-5-20251101");
      assert.strictEqual(first, second);
    });
    test("returns the same object for different casing of the same ID", () => {
      const lower = parseClaudeModelId("claude-haiku-3-5");
      const upper = parseClaudeModelId("CLAUDE-HAIKU-3-5");
      assert.strictEqual(lower, upper);
    });
  });
  suite("toSdkModelId", () => {
    test("produces dash-separated version for major.minor", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4.5").toSdkModelId(), "claude-opus-4-5");
    });
    test("produces single-digit version when no minor", () => {
      assert.strictEqual(parseClaudeModelId("claude-sonnet-4").toSdkModelId(), "claude-sonnet-4");
    });
    test("normalizes old-format SDK IDs to new format", () => {
      assert.strictEqual(parseClaudeModelId("claude-3-5-sonnet-20241022").toSdkModelId(), "claude-sonnet-3-5");
    });
    test("strips date suffix from SDK IDs", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-5-20251101").toSdkModelId(), "claude-opus-4-5");
    });
  });
  suite("toEndpointModelId", () => {
    test("produces dot-separated version for major.minor", () => {
      assert.strictEqual(parseClaudeModelId("claude-opus-4-5-20251101").toEndpointModelId(), "claude-opus-4.5");
    });
    test("produces single-digit version when no minor", () => {
      assert.strictEqual(parseClaudeModelId("claude-sonnet-4-20250514").toEndpointModelId(), "claude-sonnet-4");
    });
    test("normalizes old-format SDK IDs", () => {
      assert.strictEqual(parseClaudeModelId("claude-3-5-sonnet-20241022").toEndpointModelId(), "claude-sonnet-3.5");
    });
    test("is identity for endpoint-format IDs", () => {
      assert.strictEqual(parseClaudeModelId("claude-haiku-4.5").toEndpointModelId(), "claude-haiku-4.5");
    });
  });
  suite("toSdkModelId (standalone)", () => {
    test("normalizes endpoint-format Claude IDs to SDK format; passes through SDK-format and non-Claude IDs unchanged", () => {
      assert.deepStrictEqual(
        ["claude-haiku-4.5", "claude-opus-4.5", "claude-haiku-4-5", "claude-sonnet-4", "gpt-4o"].map(toSdkModelId),
        ["claude-haiku-4-5", "claude-opus-4-5", "claude-haiku-4-5", "claude-sonnet-4", "gpt-4o"]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L25vZGUvY2xhdWRlTW9kZWxJZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBwYXJzZUNsYXVkZU1vZGVsSWQsIHRvU2RrTW9kZWxJZCwgdHJ5UGFyc2VDbGF1ZGVNb2RlbElkIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlTW9kZWxJZC5qcyc7XG5cbnN1aXRlKCdwYXJzZUNsYXVkZU1vZGVsSWQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3BhcnNpbmcgU0RLIG1vZGVsIElEcycsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZXMgY2xhdWRlLXtuYW1lfS17bWFqb3J9LXttaW5vcn0te2RhdGV9JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LTUtMjAyNTExMDEnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnb3B1cycsIHZlcnNpb246ICc0LjUnLCBtb2RpZmllcnM6ICcyMDI1MTEwMScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgY2xhdWRlLXttYWpvcn0te21pbm9yfS17bmFtZX0te2RhdGV9IChvbGQgZm9ybWF0KScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLTMtNS1zb25uZXQtMjAyNDEwMjInKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnc29ubmV0JywgdmVyc2lvbjogJzMuNScsIG1vZGlmaWVyczogJzIwMjQxMDIyJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBjbGF1ZGUte25hbWV9LXttYWpvcn0te2RhdGV9JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtc29ubmV0LTQtMjAyNTA1MTQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnc29ubmV0JywgdmVyc2lvbjogJzQnLCBtb2RpZmllcnM6ICcyMDI1MDUxNCcgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgY2xhdWRlLXttYWpvcn0te25hbWV9LXtkYXRlfSAob2xkIGZvcm1hdCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS0zLW9wdXMtMjAyNDAyMjknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnb3B1cycsIHZlcnNpb246ICczJywgbW9kaWZpZXJzOiAnMjAyNDAyMjknIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIFNESyBJRCB3aXRob3V0IGRhdGUgc3VmZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LTUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnb3B1cycsIHZlcnNpb246ICc0LjUnLCBtb2RpZmllcnM6ICcnIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2luZyBlbmRwb2ludCBtb2RlbCBJRHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgncGFyc2VzIGNsYXVkZS17bmFtZX0te21ham9yfS57bWlub3J9JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LjUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnb3B1cycsIHZlcnNpb246ICc0LjUnLCBtb2RpZmllcnM6ICcnIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGNsYXVkZS17bmFtZX0te21ham9yfScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLXNvbm5ldC00Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiwgbW9kaWZpZXJzOiByZXN1bHQubW9kaWZpZXJzIH0sXG5cdFx0XHRcdHsgbmFtZTogJ3Nvbm5ldCcsIHZlcnNpb246ICc0JywgbW9kaWZpZXJzOiAnJyB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBjbGF1ZGUtaGFpa3UtMy41JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtaGFpa3UtMy41Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiwgbW9kaWZpZXJzOiByZXN1bHQubW9kaWZpZXJzIH0sXG5cdFx0XHRcdHsgbmFtZTogJ2hhaWt1JywgdmVyc2lvbjogJzMuNScsIG1vZGlmaWVyczogJycgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtb2RpZmllcnMgKG5vbi1kYXRlIHN1ZmZpeGVzKScsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZXMgZW5kcG9pbnQgSUQgd2l0aCAxbSBjb250ZXh0IHZhcmlhbnQgKGRvdCB2ZXJzaW9uKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC42LTFtJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiwgbW9kaWZpZXJzOiByZXN1bHQubW9kaWZpZXJzIH0sXG5cdFx0XHRcdHsgbmFtZTogJ29wdXMnLCB2ZXJzaW9uOiAnNC42JywgbW9kaWZpZXJzOiAnMW0nIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIFNESyBJRCB3aXRoIDFtIGNvbnRleHQgdmFyaWFudCAoZGFzaCB2ZXJzaW9uKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC02LTFtJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiwgbW9kaWZpZXJzOiByZXN1bHQubW9kaWZpZXJzIH0sXG5cdFx0XHRcdHsgbmFtZTogJ29wdXMnLCB2ZXJzaW9uOiAnNC42JywgbW9kaWZpZXJzOiAnMW0nIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIFNESyBJRCB3aXRoIGJvdGggMW0gbW9kaWZpZXIgYW5kIGRhdGUgc3VmZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LTYtMW0tMjAyNTExMDEnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnb3B1cycsIHZlcnNpb246ICc0LjYnLCBtb2RpZmllcnM6ICcxbS0yMDI1MTEwMScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgc2luZ2xlLXZlcnNpb24gSUQgd2l0aCBtb2RpZmllcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLXNvbm5ldC00LTFtJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiwgbW9kaWZpZXJzOiByZXN1bHQubW9kaWZpZXJzIH0sXG5cdFx0XHRcdHsgbmFtZTogJ3Nvbm5ldCcsIHZlcnNpb246ICc0JywgbW9kaWZpZXJzOiAnMW0nIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnMW0gb24gb3B1cyBjb252ZXJ0cyB0byBjb3JyZWN0IFNESyBtb2RlbCBJRCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQuNi0xbScpLnRvU2RrTW9kZWxJZCgpLCAnY2xhdWRlLW9wdXMtNC02LTFtJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcxbSBvbiBvcHVzIGNvbnZlcnRzIHRvIGNvcnJlY3QgZW5kcG9pbnQgbW9kZWwgSUQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtb3B1cy00LTYtMW0nKS50b0VuZHBvaW50TW9kZWxJZCgpLCAnY2xhdWRlLW9wdXMtNC42LTFtJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcxbSBvbiBub24tb3B1cyBtb2RlbCBpcyBub3QgaW5jbHVkZWQgaW4gU0RLIG1vZGVsIElEJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLXNvbm5ldC00LTFtJykudG9TZGtNb2RlbElkKCksICdjbGF1ZGUtc29ubmV0LTQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJzFtIG9uIG5vbi1vcHVzIG1vZGVsIGlzIG5vdCBpbmNsdWRlZCBpbiBlbmRwb2ludCBtb2RlbCBJRCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1zb25uZXQtNC0xbScpLnRvRW5kcG9pbnRNb2RlbElkKCksICdjbGF1ZGUtc29ubmV0LTQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJzFtIHdpdGggZGF0ZSBzdWZmaXggb24gb3B1cyBrZWVwcyBvbmx5IDFtIGluIFNESyBtb2RlbCBJRCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQtNi0xbS0yMDI1MTEwMScpLnRvU2RrTW9kZWxJZCgpLCAnY2xhdWRlLW9wdXMtNC02LTFtJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcxbSB3aXRoIGRhdGUgc3VmZml4IG9uIG9wdXMga2VlcHMgb25seSAxbSBpbiBlbmRwb2ludCBtb2RlbCBJRCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQtNi0xbS0yMDI1MTEwMScpLnRvRW5kcG9pbnRNb2RlbElkKCksICdjbGF1ZGUtb3B1cy00LjYtMW0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2JhcmUgbW9kZWwgbmFtZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgncGFyc2VzIGEgYmFyZSBuYW1lIHdpdGggbm8gdmVyc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnZm9vJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiwgbW9kaWZpZXJzOiByZXN1bHQubW9kaWZpZXJzIH0sXG5cdFx0XHRcdHsgbmFtZTogJ2ZvbycsIHZlcnNpb246ICcnLCBtb2RpZmllcnM6ICcnIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG9TZGtNb2RlbElkIHJldHVybnMgdGhlIGJhcmUgbmFtZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2ZvbycpLnRvU2RrTW9kZWxJZCgpLCAnZm9vJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b0VuZHBvaW50TW9kZWxJZCByZXR1cm5zIHRoZSBiYXJlIG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbElkKCdmb28nKS50b0VuZHBvaW50TW9kZWxJZCgpLCAnZm9vJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgYmFyZSBcImNsYXVkZVwiIGFzIGEgYmFyZSBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgbmFtZTogcmVzdWx0Lm5hbWUsIHZlcnNpb246IHJlc3VsdC52ZXJzaW9uLCBtb2RpZmllcnM6IHJlc3VsdC5tb2RpZmllcnMgfSxcblx0XHRcdFx0eyBuYW1lOiAnY2xhdWRlJywgdmVyc2lvbjogJycsIG1vZGlmaWVyczogJycgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd1bnBhcnNlYWJsZSBpbnB1dHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgndGhyb3dzIGZvciBoeXBoZW5hdGVkIG5vbi1DbGF1ZGUgSURzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBwYXJzZUNsYXVkZU1vZGVsSWQoJ2dwdC00bycpLCAvVW5hYmxlIHRvIHBhcnNlIENsYXVkZSBtb2RlbCBJRDogJ2dwdC00bycvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBmb3IgZ2FyYmFnZSB3aXRoIGh5cGhlbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHBhcnNlQ2xhdWRlTW9kZWxJZCgnaW52YWxpZC1tb2RlbC1pZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RyeVBhcnNlQ2xhdWRlTW9kZWxJZCcsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgaHlwaGVuYXRlZCBub24tQ2xhdWRlIElEcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cnlQYXJzZUNsYXVkZU1vZGVsSWQoJ2dwdC00bycpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBhIHJlc3VsdCBmb3IgYmFyZSBuYW1lcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRyeVBhcnNlQ2xhdWRlTW9kZWxJZCgnZm9vJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBuYW1lOiByZXN1bHQubmFtZSwgdmVyc2lvbjogcmVzdWx0LnZlcnNpb24gfSwgeyBuYW1lOiAnZm9vJywgdmVyc2lvbjogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGEgcmVzdWx0IGZvciB2YWxpZCBDbGF1ZGUgSURzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdHJ5UGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtc29ubmV0LTQnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiB9LCB7IG5hbWU6ICdzb25uZXQnLCB2ZXJzaW9uOiAnNCcgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjYXNlIGluc2Vuc2l0aXZpdHknLCAoKSA9PiB7XG5cdFx0dGVzdCgncGFyc2VzIHVwcGVyY2FzZSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnQ0xBVURFLU9QVVMtNC01Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiB9LFxuXHRcdFx0XHR7IG5hbWU6ICdvcHVzJywgdmVyc2lvbjogJzQuNScgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgbWl4ZWQgY2FzZSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnQ2xhdWRlLVNvbm5ldC00LTIwMjUwNTE0Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG5hbWU6IHJlc3VsdC5uYW1lLCB2ZXJzaW9uOiByZXN1bHQudmVyc2lvbiwgbW9kaWZpZXJzOiByZXN1bHQubW9kaWZpZXJzIH0sXG5cdFx0XHRcdHsgbmFtZTogJ3Nvbm5ldCcsIHZlcnNpb246ICc0JywgbW9kaWZpZXJzOiAnMjAyNTA1MTQnIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2FjaGluZycsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBzYW1lIG9iamVjdCBmb3IgcmVwZWF0ZWQgY2FsbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaXJzdCA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC01LTIwMjUxMTAxJyk7XG5cdFx0XHRjb25zdCBzZWNvbmQgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQtNS0yMDI1MTEwMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LCBzZWNvbmQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB0aGUgc2FtZSBvYmplY3QgZm9yIGRpZmZlcmVudCBjYXNpbmcgb2YgdGhlIHNhbWUgSUQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb3dlciA9IHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLWhhaWt1LTMtNScpO1xuXHRcdFx0Y29uc3QgdXBwZXIgPSBwYXJzZUNsYXVkZU1vZGVsSWQoJ0NMQVVERS1IQUlLVS0zLTUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb3dlciwgdXBwZXIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndG9TZGtNb2RlbElkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Byb2R1Y2VzIGRhc2gtc2VwYXJhdGVkIHZlcnNpb24gZm9yIG1ham9yLm1pbm9yJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC41JykudG9TZGtNb2RlbElkKCksICdjbGF1ZGUtb3B1cy00LTUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2R1Y2VzIHNpbmdsZS1kaWdpdCB2ZXJzaW9uIHdoZW4gbm8gbWlub3InLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VDbGF1ZGVNb2RlbElkKCdjbGF1ZGUtc29ubmV0LTQnKS50b1Nka01vZGVsSWQoKSwgJ2NsYXVkZS1zb25uZXQtNCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyBvbGQtZm9ybWF0IFNESyBJRHMgdG8gbmV3IGZvcm1hdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS0zLTUtc29ubmV0LTIwMjQxMDIyJykudG9TZGtNb2RlbElkKCksICdjbGF1ZGUtc29ubmV0LTMtNScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIGRhdGUgc3VmZml4IGZyb20gU0RLIElEcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1vcHVzLTQtNS0yMDI1MTEwMScpLnRvU2RrTW9kZWxJZCgpLCAnY2xhdWRlLW9wdXMtNC01Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0b0VuZHBvaW50TW9kZWxJZCcsICgpID0+IHtcblx0XHR0ZXN0KCdwcm9kdWNlcyBkb3Qtc2VwYXJhdGVkIHZlcnNpb24gZm9yIG1ham9yLm1pbm9yJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLW9wdXMtNC01LTIwMjUxMTAxJykudG9FbmRwb2ludE1vZGVsSWQoKSwgJ2NsYXVkZS1vcHVzLTQuNScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvZHVjZXMgc2luZ2xlLWRpZ2l0IHZlcnNpb24gd2hlbiBubyBtaW5vcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNsYXVkZU1vZGVsSWQoJ2NsYXVkZS1zb25uZXQtNC0yMDI1MDUxNCcpLnRvRW5kcG9pbnRNb2RlbElkKCksICdjbGF1ZGUtc29ubmV0LTQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vcm1hbGl6ZXMgb2xkLWZvcm1hdCBTREsgSURzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLTMtNS1zb25uZXQtMjAyNDEwMjInKS50b0VuZHBvaW50TW9kZWxJZCgpLCAnY2xhdWRlLXNvbm5ldC0zLjUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzIGlkZW50aXR5IGZvciBlbmRwb2ludC1mb3JtYXQgSURzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ2xhdWRlTW9kZWxJZCgnY2xhdWRlLWhhaWt1LTQuNScpLnRvRW5kcG9pbnRNb2RlbElkKCksICdjbGF1ZGUtaGFpa3UtNC41Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0b1Nka01vZGVsSWQgKHN0YW5kYWxvbmUpJywgKCkgPT4ge1xuXHRcdHRlc3QoJ25vcm1hbGl6ZXMgZW5kcG9pbnQtZm9ybWF0IENsYXVkZSBJRHMgdG8gU0RLIGZvcm1hdDsgcGFzc2VzIHRocm91Z2ggU0RLLWZvcm1hdCBhbmQgbm9uLUNsYXVkZSBJRHMgdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0WydjbGF1ZGUtaGFpa3UtNC41JywgJ2NsYXVkZS1vcHVzLTQuNScsICdjbGF1ZGUtaGFpa3UtNC01JywgJ2NsYXVkZS1zb25uZXQtNCcsICdncHQtNG8nXS5tYXAodG9TZGtNb2RlbElkKSxcblx0XHRcdFx0WydjbGF1ZGUtaGFpa3UtNC01JywgJ2NsYXVkZS1vcHVzLTQtNScsICdjbGF1ZGUtaGFpa3UtNC01JywgJ2NsYXVkZS1zb25uZXQtNCcsICdncHQtNG8nXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0IsY0FBYyw2QkFBNkI7QUFFeEUsTUFBTSxzQkFBc0IsTUFBTTtBQUVqQywwQ0FBd0M7QUFFeEMsUUFBTSx5QkFBeUIsTUFBTTtBQUNwQyxTQUFLLCtDQUErQyxNQUFNO0FBQ3pELFlBQU0sU0FBUyxtQkFBbUIsMEJBQTBCO0FBQzVELGFBQU87QUFBQSxRQUNOLEVBQUUsTUFBTSxPQUFPLE1BQU0sU0FBUyxPQUFPLFNBQVMsV0FBVyxPQUFPLFVBQVU7QUFBQSxRQUMxRSxFQUFFLE1BQU0sUUFBUSxTQUFTLE9BQU8sV0FBVyxXQUFXO0FBQUEsTUFDdkQ7QUFBQSxJQUNELENBQUM7QUFF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
