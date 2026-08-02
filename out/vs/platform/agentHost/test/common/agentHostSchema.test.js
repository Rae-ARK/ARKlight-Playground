import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { createSchema, migrateLegacyAutopilotConfig, normalizeAgentHostTerminalAutoApproveRulesConfig, platformSessionSchema, schemaProperty } from "../../common/agentHostSchema.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { JsonRpcErrorCodes, ProtocolError } from "../../common/state/sessionProtocol.js";
function captureProtocolError(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof ProtocolError, `expected ProtocolError, got: ${err}`);
    return err;
  }
  assert.fail("expected fn to throw, but it did not");
}
suite("agentHostSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("schemaProperty", () => {
    test("validates primitive types", () => {
      const str = schemaProperty({ type: "string", title: "s" });
      assert.strictEqual(str.validate("hello"), true);
      assert.strictEqual(str.validate(42), false);
      assert.strictEqual(str.validate(void 0), false);
      assert.strictEqual(str.validate(null), false);
      const num = schemaProperty({ type: "number", title: "n" });
      assert.strictEqual(num.validate(42), true);
      assert.strictEqual(num.validate("42"), false);
      const bool = schemaProperty({ type: "boolean", title: "b" });
      assert.strictEqual(bool.validate(true), true);
      assert.strictEqual(bool.validate(0), false);
    });
    test("enforces enum values", () => {
      const prop = schemaProperty({
        type: "string",
        title: "letters",
        enum: ["a", "b"]
      });
      assert.strictEqual(prop.validate("a"), true);
      assert.strictEqual(prop.validate("b"), true);
      assert.strictEqual(prop.validate("c"), false);
      assert.strictEqual(prop.validate(42), false);
    });
    test("enumDynamic bypasses enum check but keeps type check", () => {
      const prop = schemaProperty({
        type: "string",
        title: "dyn",
        enum: ["seed"],
        enumDynamic: true
      });
      assert.strictEqual(prop.validate("seed"), true);
      assert.strictEqual(prop.validate("anything-else"), true);
      assert.strictEqual(prop.validate(42), false);
    });
    test("validates nested objects and required keys", () => {
      const prop = schemaProperty({
        type: "object",
        title: "person",
        properties: {
          name: { type: "string", title: "name" },
          age: { type: "number", title: "age" }
        },
        required: ["name"]
      });
      assert.strictEqual(prop.validate({ name: "alice" }), true);
      assert.strictEqual(prop.validate({ name: "alice", age: 30 }), true);
      assert.strictEqual(prop.validate({ age: 30 }), false);
      assert.strictEqual(prop.validate({ name: 42 }), false);
      assert.strictEqual(prop.validate([]), false);
      assert.strictEqual(prop.validate(null), false);
    });
    test("validates arrays with item schema", () => {
      const prop = schemaProperty({
        type: "array",
        title: "names",
        items: { type: "string", title: "name" }
      });
      assert.strictEqual(prop.validate(["a", "b"]), true);
      assert.strictEqual(prop.validate([]), true);
      assert.strictEqual(prop.validate(["a", 42]), false);
      assert.strictEqual(prop.validate("a"), false);
    });
    test("assertValid throws ProtocolError with offending path for primitive mismatch", () => {
      const prop = schemaProperty({ type: "string", title: "s" });
      const err = captureProtocolError(() => prop.assertValid(42, "myKey"));
      assert.strictEqual(err.code, JsonRpcErrorCodes.InvalidParams);
      assert.ok(err.message.includes("myKey"), err.message);
      assert.ok(err.message.includes("string"), err.message);
    });
    test("assertValid path annotates array index and nested property", () => {
      const prop = schemaProperty({
        type: "object",
        title: "perms",
        properties: {
          allow: {
            type: "array",
            title: "allow",
            items: { type: "string", title: "name" }
          }
        }
      });
      const err = captureProtocolError(() => prop.assertValid({ allow: ["ok", 42] }, "permissions"));
      assert.ok(err.message.includes("permissions.allow[1]"), err.message);
      assert.ok(err.message.includes("string"), err.message);
    });
    test("assertValid path reports missing required property", () => {
      const prop = schemaProperty({
        type: "object",
        title: "person",
        properties: { name: { type: "string", title: "name" } },
        required: ["name"]
      });
      const err = captureProtocolError(() => prop.assertValid({}, "person"));
      assert.ok(err.message.includes("person.name"), err.message);
      assert.ok(err.message.toLowerCase().includes("required"), err.message);
    });
    test("assertValid reports enum violation with the allowed set", () => {
      const prop = schemaProperty({
        type: "string",
        title: "letters",
        enum: ["a", "b"]
      });
      const err = captureProtocolError(() => prop.assertValid("c", "choice"));
      assert.ok(err.message.includes("choice"), err.message);
      assert.ok(err.message.includes('"a"'), err.message);
      assert.ok(err.message.includes('"b"'), err.message);
    });
  });
  suite("createSchema", () => {
    const fixture = () => createSchema({
      name: schemaProperty({ type: "string", title: "name" }),
      count: schemaProperty({ type: "number", title: "count" }),
      level: schemaProperty({
        type: "string",
        title: "level",
        enum: ["low", "high"]
      })
    });
    test("toProtocol emits a JSON-Schema-compatible object", () => {
      const schema = fixture();
      const protocol = schema.toProtocol();
      assert.strictEqual(protocol.type, "object");
      assert.deepStrictEqual(Object.keys(protocol.properties), ["name", "count", "level"]);
      assert.strictEqual(protocol.properties.name.type, "string");
      assert.deepStrictEqual(protocol.properties.level.enum, ["low", "high"]);
    });
    test("validate returns false for unknown keys", () => {
      const schema = fixture();
      assert.strictEqual(schema.validate("name", "ok"), true);
      assert.strictEqual(schema.validate("name", 42), false);
      assert.strictEqual(schema.validate("unknown", "ok"), false);
    });
    test("assertValid throws for unknown keys", () => {
      const schema = fixture();
      const err = captureProtocolError(() => schema.assertValid("unknown", "x"));
      assert.ok(err.message.includes("unknown"), err.message);
    });
    test("values returns a shallow copy and passes through unknown keys", () => {
      const schema = fixture();
      const input = { name: "alice", count: 3, extra: "forward-compat" };
      const out = schema.values(input);
      assert.notStrictEqual(out, input);
      assert.deepStrictEqual(out, input);
    });
    test("values skips undefined entries without throwing", () => {
      const schema = fixture();
      const out = schema.values({ name: "alice" });
      assert.deepStrictEqual(out, { name: "alice" });
    });
    test("values throws a path-annotated ProtocolError on invalid entry", () => {
      const schema = fixture();
      const err = captureProtocolError(() => schema.values({ name: 42 }));
      assert.strictEqual(err.code, JsonRpcErrorCodes.InvalidParams);
      assert.ok(err.message.includes("name"), err.message);
    });
    test("definition is preserved for spread-based composition", () => {
      const base = createSchema({
        a: schemaProperty({ type: "string", title: "a" })
      });
      const extended = createSchema({
        ...base.definition,
        b: schemaProperty({ type: "number", title: "b" })
      });
      assert.deepStrictEqual(Object.keys(extended.toProtocol().properties), ["a", "b"]);
      assert.strictEqual(extended.validate("a", "hi"), true);
      assert.strictEqual(extended.validate("b", 3), true);
    });
  });
  suite("validateOrDefault", () => {
    const fixture = () => createSchema({
      name: schemaProperty({ type: "string", title: "name" }),
      count: schemaProperty({ type: "number", title: "count" })
    });
    test("substitutes defaults for missing or invalid values", () => {
      const schema = fixture();
      const defaults = { name: "default", count: 0 };
      const result = schema.validateOrDefault({ name: 42, count: 5 }, defaults);
      assert.deepStrictEqual(result, { name: "default", count: 5 });
    });
    test("passes through all-valid values", () => {
      const schema = fixture();
      const result = schema.validateOrDefault({ name: "alice", count: 3 }, { name: "d", count: 0 });
      assert.deepStrictEqual(result, { name: "alice", count: 3 });
    });
    test("uses defaults when input is undefined", () => {
      const schema = fixture();
      const result = schema.validateOrDefault(void 0, { name: "d", count: 7 });
      assert.deepStrictEqual(result, { name: "d", count: 7 });
    });
    test("ignores keys not in defaults", () => {
      const schema = fixture();
      const result = schema.validateOrDefault({ name: "a", count: 1, ignored: true }, { name: "d", count: 0 });
      assert.deepStrictEqual(result, { name: "a", count: 1 });
    });
    test("omits schema keys that are missing from both values and defaults", () => {
      const schema = fixture();
      const result = schema.validateOrDefault({ count: 9 }, { count: 0 });
      assert.deepStrictEqual(result, { count: 9 });
      assert.ok(!result.hasOwnProperty("name"), "`name` should be absent when neither values nor defaults supply it");
    });
    test("omits schema keys when value is invalid and no default is supplied", () => {
      const schema = fixture();
      const result = schema.validateOrDefault({ name: 42, count: 3 }, { count: 0 });
      assert.deepStrictEqual(result, { count: 3 });
    });
  });
  suite("platformSessionSchema", () => {
    test("validates the autoApprove levels", () => {
      const levels = ["default", "assisted", "autoApprove"];
      for (const level of levels) {
        assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, level), true, level);
      }
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, "autopilot"), false);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, "bogus"), false);
    });
    test("exposes approval choices in picker order with current copy", () => {
      const property = platformSessionSchema.toProtocol().properties[SessionConfigKey.AutoApprove];
      assert.deepStrictEqual({
        enum: property.enum,
        enumLabels: property.enumLabels,
        enumDescriptions: property.enumDescriptions
      }, {
        enum: ["default", "assisted", "autoApprove"],
        enumLabels: ["Default approvals", "Assisted permissions", "Allow all"],
        enumDescriptions: [
          "Asks when approval settings don't apply",
          "Evaluates risk before running tools",
          "Runs tool calls without asking"
        ]
      });
    });
    test("validates permissions shape", () => {
      const ok = { allow: ["read"], deny: [] };
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, ok), true);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, { allow: [42], deny: [] }), false);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, { allow: [] }), true);
    });
    test("validates the agent modes", () => {
      const modes = ["interactive", "plan", "autopilot"];
      for (const mode of modes) {
        assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Mode, mode), true, mode);
      }
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Mode, "shell"), false);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Mode, 42), false);
    });
  });
  suite("migrateLegacyAutopilotConfig", () => {
    test("maps legacy autoApprove=autopilot to mode=autopilot + autoApprove=default", () => {
      const result = migrateLegacyAutopilotConfig({ [SessionConfigKey.AutoApprove]: "autopilot" });
      assert.deepStrictEqual(result, { mode: "autopilot", autoApprove: "default" });
    });
    test("preserves plan mode (legacy plan took precedence over autopilot)", () => {
      const result = migrateLegacyAutopilotConfig({ [SessionConfigKey.Mode]: "plan", [SessionConfigKey.AutoApprove]: "autopilot" });
      assert.deepStrictEqual(result, { mode: "plan", autoApprove: "default" });
    });
    test("overwrites a stale interactive mode with autopilot", () => {
      const result = migrateLegacyAutopilotConfig({ [SessionConfigKey.Mode]: "interactive", [SessionConfigKey.AutoApprove]: "autopilot" });
      assert.deepStrictEqual(result, { mode: "autopilot", autoApprove: "default" });
    });
    test("passes through configs without the legacy value untouched", () => {
      const input = { [SessionConfigKey.AutoApprove]: "assisted", [SessionConfigKey.Mode]: "interactive" };
      assert.strictEqual(migrateLegacyAutopilotConfig(input), input);
    });
    test("migrated config validates against the schema", () => {
      const input = { [SessionConfigKey.AutoApprove]: "autopilot" };
      const result = migrateLegacyAutopilotConfig(input);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Mode, result[SessionConfigKey.Mode]), true);
      assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, result[SessionConfigKey.AutoApprove]), true);
    });
    test("handles undefined", () => {
      assert.strictEqual(migrateLegacyAutopilotConfig(void 0), void 0);
    });
  });
  suite("normalizeAgentHostTerminalAutoApproveRulesConfig", () => {
    test("keeps null entries and object rules", () => {
      const inspectValue = {};
      const result = normalizeAgentHostTerminalAutoApproveRulesConfig({
        echo: null,
        python: true,
        "/^npm run build$/": { approve: true, matchCommandLine: true }
      }, inspectValue, false);
      assert.deepStrictEqual(result, {
        echo: null,
        python: true,
        "/^npm run build$/": { approve: true, matchCommandLine: true }
      });
    });
    test("removes default-only entries when default rules are ignored", () => {
      const inspectValue = {
        default: { value: { echo: true, ls: true, python: false } },
        user: { value: { echo: null } }
      };
      const result = normalizeAgentHostTerminalAutoApproveRulesConfig({
        echo: null,
        ls: true,
        python: true
      }, inspectValue, true);
      assert.deepStrictEqual(result, {
        echo: null,
        python: true
      });
    });
    test("keeps entries that match defaults when they come from a non-default target", () => {
      const inspectValue = {
        default: { value: { echo: true, ls: true } },
        userValue: { ls: true }
      };
      const result = normalizeAgentHostTerminalAutoApproveRulesConfig({
        echo: true,
        ls: true
      }, inspectValue, true);
      assert.deepStrictEqual(result, {
        ls: true
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC90ZXN0L2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29uZmlndXJhdGlvblZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTY2hlbWEsIG1pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcsIG5vcm1hbGl6ZUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZywgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBzY2hlbWFQcm9wZXJ0eSwgdHlwZSBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMsIHR5cGUgQXV0b0FwcHJvdmVMZXZlbCwgdHlwZSBJUGVybWlzc2lvbnNWYWx1ZSwgdHlwZSBTZXNzaW9uTW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBKc29uUnBjRXJyb3JDb2RlcywgUHJvdG9jb2xFcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuXG4vKipcbiAqIEludm9rZXMgYGZuYCBhbmQgcmV0dXJucyB0aGUgdGhyb3duIHtAbGluayBQcm90b2NvbEVycm9yfS4gQXZvaWRzXG4gKiBwYXNzaW5nIGFuIGFycm93LWZ1bmN0aW9uIHZhbGlkYXRvciB0byBgYXNzZXJ0LnRocm93c2AgXHUyMDE0IHRoZSB1bml0LXRlc3RcbiAqIGFzc2VydCBzaGltIGRvZXMgYGFjdHVhbCBpbnN0YW5jZW9mIGV4cGVjdGVkYCB3aXRoIHRoYXQgdmFsaWRhdG9yLCBhbmRcbiAqIGFycm93IGZ1bmN0aW9ucyBoYXZlIG5vIGBwcm90b3R5cGVgIHByb3BlcnR5LCB3aGljaCBXZWJLaXQgcmVqZWN0cy5cbiAqL1xuZnVuY3Rpb24gY2FwdHVyZVByb3RvY29sRXJyb3IoZm46ICgpID0+IHZvaWQpOiBQcm90b2NvbEVycm9yIHtcblx0dHJ5IHtcblx0XHRmbigpO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvciwgYGV4cGVjdGVkIFByb3RvY29sRXJyb3IsIGdvdDogJHtlcnJ9YCk7XG5cdFx0cmV0dXJuIGVycjtcblx0fVxuXHRhc3NlcnQuZmFpbCgnZXhwZWN0ZWQgZm4gdG8gdGhyb3csIGJ1dCBpdCBkaWQgbm90Jyk7XG59XG5cbnN1aXRlKCdhZ2VudEhvc3RTY2hlbWEnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLSBzY2hlbWFQcm9wZXJ0eSAvIGluZGl2aWR1YWwgdmFsaWRhdG9ycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnc2NoZW1hUHJvcGVydHknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZXMgcHJpbWl0aXZlIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RyID0gc2NoZW1hUHJvcGVydHk8c3RyaW5nPih7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ3MnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ci52YWxpZGF0ZSgnaGVsbG8nKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyLnZhbGlkYXRlKDQyKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0ci52YWxpZGF0ZSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyLnZhbGlkYXRlKG51bGwpLCBmYWxzZSk7XG5cblx0XHRcdGNvbnN0IG51bSA9IHNjaGVtYVByb3BlcnR5PG51bWJlcj4oeyB0eXBlOiAnbnVtYmVyJywgdGl0bGU6ICduJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChudW0udmFsaWRhdGUoNDIpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChudW0udmFsaWRhdGUoJzQyJyksIGZhbHNlKTtcblxuXHRcdFx0Y29uc3QgYm9vbCA9IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHsgdHlwZTogJ2Jvb2xlYW4nLCB0aXRsZTogJ2InIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvb2wudmFsaWRhdGUodHJ1ZSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvb2wudmFsaWRhdGUoMCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VuZm9yY2VzIGVudW0gdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvcCA9IHNjaGVtYVByb3BlcnR5PCdhJyB8ICdiJz4oe1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0dGl0bGU6ICdsZXR0ZXJzJyxcblx0XHRcdFx0ZW51bTogWydhJywgJ2InXSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoJ2EnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZSgnYicpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKCdjJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKDQyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW51bUR5bmFtaWMgYnlwYXNzZXMgZW51bSBjaGVjayBidXQga2VlcHMgdHlwZSBjaGVjaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3AgPSBzY2hlbWFQcm9wZXJ0eTxzdHJpbmc+KHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHRpdGxlOiAnZHluJyxcblx0XHRcdFx0ZW51bTogWydzZWVkJ10sXG5cdFx0XHRcdGVudW1EeW5hbWljOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZSgnc2VlZCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKCdhbnl0aGluZy1lbHNlJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoNDIpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZXMgbmVzdGVkIG9iamVjdHMgYW5kIHJlcXVpcmVkIGtleXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9wID0gc2NoZW1hUHJvcGVydHk8eyBuYW1lOiBzdHJpbmc7IGFnZT86IG51bWJlciB9Pih7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHR0aXRsZTogJ3BlcnNvbicsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ25hbWUnIH0sXG5cdFx0XHRcdFx0YWdlOiB7IHR5cGU6ICdudW1iZXInLCB0aXRsZTogJ2FnZScgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVxdWlyZWQ6IFsnbmFtZSddLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZSh7IG5hbWU6ICdhbGljZScgfSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoeyBuYW1lOiAnYWxpY2UnLCBhZ2U6IDMwIH0pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9wLnZhbGlkYXRlKHsgYWdlOiAzMCB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoeyBuYW1lOiA0MiB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoW10pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZShudWxsKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIGFycmF5cyB3aXRoIGl0ZW0gc2NoZW1hJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvcCA9IHNjaGVtYVByb3BlcnR5PHN0cmluZ1tdPih7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdHRpdGxlOiAnbmFtZXMnLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICduYW1lJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZShbJ2EnLCAnYiddKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvcC52YWxpZGF0ZShbXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoWydhJywgNDJdKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3AudmFsaWRhdGUoJ2EnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXNzZXJ0VmFsaWQgdGhyb3dzIFByb3RvY29sRXJyb3Igd2l0aCBvZmZlbmRpbmcgcGF0aCBmb3IgcHJpbWl0aXZlIG1pc21hdGNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvcCA9IHNjaGVtYVByb3BlcnR5PHN0cmluZz4oeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdzJyB9KTtcblx0XHRcdGNvbnN0IGVyciA9IGNhcHR1cmVQcm90b2NvbEVycm9yKCgpID0+IHByb3AuYXNzZXJ0VmFsaWQoNDIsICdteUtleScpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIuY29kZSwgSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtcyk7XG5cdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ215S2V5JyksIGVyci5tZXNzYWdlKTtcblx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnc3RyaW5nJyksIGVyci5tZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fzc2VydFZhbGlkIHBhdGggYW5ub3RhdGVzIGFycmF5IGluZGV4IGFuZCBuZXN0ZWQgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9wID0gc2NoZW1hUHJvcGVydHk8eyBhbGxvdzogc3RyaW5nW10gfT4oe1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0dGl0bGU6ICdwZXJtcycsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhbGxvdzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnYWxsb3cnLFxuXHRcdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnbmFtZScgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBlcnIgPSBjYXB0dXJlUHJvdG9jb2xFcnJvcigoKSA9PiBwcm9wLmFzc2VydFZhbGlkKHsgYWxsb3c6IFsnb2snLCA0Ml0gfSwgJ3Blcm1pc3Npb25zJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdwZXJtaXNzaW9ucy5hbGxvd1sxXScpLCBlcnIubWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ3N0cmluZycpLCBlcnIubWVzc2FnZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhc3NlcnRWYWxpZCBwYXRoIHJlcG9ydHMgbWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3AgPSBzY2hlbWFQcm9wZXJ0eTx7IG5hbWU6IHN0cmluZyB9Pih7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHR0aXRsZTogJ3BlcnNvbicsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHsgbmFtZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICduYW1lJyB9IH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnXSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZXJyID0gY2FwdHVyZVByb3RvY29sRXJyb3IoKCkgPT4gcHJvcC5hc3NlcnRWYWxpZCh7fSwgJ3BlcnNvbicpKTtcblx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygncGVyc29uLm5hbWUnKSwgZXJyLm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoJ3JlcXVpcmVkJyksIGVyci5tZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fzc2VydFZhbGlkIHJlcG9ydHMgZW51bSB2aW9sYXRpb24gd2l0aCB0aGUgYWxsb3dlZCBzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm9wID0gc2NoZW1hUHJvcGVydHk8J2EnIHwgJ2InPih7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR0aXRsZTogJ2xldHRlcnMnLFxuXHRcdFx0XHRlbnVtOiBbJ2EnLCAnYiddLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBlcnIgPSBjYXB0dXJlUHJvdG9jb2xFcnJvcigoKSA9PiBwcm9wLmFzc2VydFZhbGlkKCdjJywgJ2Nob2ljZScpKTtcblx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnY2hvaWNlJyksIGVyci5tZXNzYWdlKTtcblx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnXCJhXCInKSwgZXJyLm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdcImJcIicpLCBlcnIubWVzc2FnZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gY3JlYXRlU2NoZW1hIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdjcmVhdGVTY2hlbWEnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBmaXh0dXJlID0gKCkgPT4gY3JlYXRlU2NoZW1hKHtcblx0XHRcdG5hbWU6IHNjaGVtYVByb3BlcnR5PHN0cmluZz4oeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICduYW1lJyB9KSxcblx0XHRcdGNvdW50OiBzY2hlbWFQcm9wZXJ0eTxudW1iZXI+KHsgdHlwZTogJ251bWJlcicsIHRpdGxlOiAnY291bnQnIH0pLFxuXHRcdFx0bGV2ZWw6IHNjaGVtYVByb3BlcnR5PCdsb3cnIHwgJ2hpZ2gnPih7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR0aXRsZTogJ2xldmVsJyxcblx0XHRcdFx0ZW51bTogWydsb3cnLCAnaGlnaCddLFxuXHRcdFx0fSksXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b1Byb3RvY29sIGVtaXRzIGEgSlNPTi1TY2hlbWEtY29tcGF0aWJsZSBvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBmaXh0dXJlKCk7XG5cdFx0XHRjb25zdCBwcm90b2NvbCA9IHNjaGVtYS50b1Byb3RvY29sKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdG9jb2wudHlwZSwgJ29iamVjdCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChPYmplY3Qua2V5cyhwcm90b2NvbC5wcm9wZXJ0aWVzKSwgWyduYW1lJywgJ2NvdW50JywgJ2xldmVsJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3RvY29sLnByb3BlcnRpZXMubmFtZS50eXBlLCAnc3RyaW5nJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3RvY29sLnByb3BlcnRpZXMubGV2ZWwuZW51bSwgWydsb3cnLCAnaGlnaCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZhbGlkYXRlIHJldHVybnMgZmFsc2UgZm9yIHVua25vd24ga2V5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGZpeHR1cmUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY2hlbWEudmFsaWRhdGUoJ25hbWUnLCAnb2snKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hLnZhbGlkYXRlKCduYW1lJywgNDIpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NoZW1hLnZhbGlkYXRlKCd1bmtub3duJyBhcyAnbmFtZScsICdvaycpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhc3NlcnRWYWxpZCB0aHJvd3MgZm9yIHVua25vd24ga2V5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGZpeHR1cmUoKTtcblx0XHRcdGNvbnN0IGVyciA9IGNhcHR1cmVQcm90b2NvbEVycm9yKCgpID0+IHNjaGVtYS5hc3NlcnRWYWxpZCgndW5rbm93bicgYXMgJ25hbWUnLCAneCcpKTtcblx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygndW5rbm93bicpLCBlcnIubWVzc2FnZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWx1ZXMgcmV0dXJucyBhIHNoYWxsb3cgY29weSBhbmQgcGFzc2VzIHRocm91Z2ggdW5rbm93biBrZXlzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Y29uc3QgaW5wdXQgPSB7IG5hbWU6ICdhbGljZScsIGNvdW50OiAzLCBleHRyYTogJ2ZvcndhcmQtY29tcGF0JyB9O1xuXHRcdFx0Y29uc3Qgb3V0ID0gc2NoZW1hLnZhbHVlcyhpbnB1dCk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwob3V0LCBpbnB1dCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG91dCwgaW5wdXQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsdWVzIHNraXBzIHVuZGVmaW5lZCBlbnRyaWVzIHdpdGhvdXQgdGhyb3dpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBmaXh0dXJlKCk7XG5cdFx0XHRjb25zdCBvdXQgPSBzY2hlbWEudmFsdWVzKHsgbmFtZTogJ2FsaWNlJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0LCB7IG5hbWU6ICdhbGljZScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWx1ZXMgdGhyb3dzIGEgcGF0aC1hbm5vdGF0ZWQgUHJvdG9jb2xFcnJvciBvbiBpbnZhbGlkIGVudHJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Y29uc3QgZXJyID0gY2FwdHVyZVByb3RvY29sRXJyb3IoKCkgPT4gc2NoZW1hLnZhbHVlcyh7IG5hbWU6IDQyIGFzIHVua25vd24gYXMgc3RyaW5nIH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlcnIuY29kZSwgSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtcyk7XG5cdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ25hbWUnKSwgZXJyLm1lc3NhZ2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVmaW5pdGlvbiBpcyBwcmVzZXJ2ZWQgZm9yIHNwcmVhZC1iYXNlZCBjb21wb3NpdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGJhc2UgPSBjcmVhdGVTY2hlbWEoe1xuXHRcdFx0XHRhOiBzY2hlbWFQcm9wZXJ0eTxzdHJpbmc+KHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnYScgfSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGV4dGVuZGVkID0gY3JlYXRlU2NoZW1hKHtcblx0XHRcdFx0Li4uYmFzZS5kZWZpbml0aW9uLFxuXHRcdFx0XHRiOiBzY2hlbWFQcm9wZXJ0eTxudW1iZXI+KHsgdHlwZTogJ251bWJlcicsIHRpdGxlOiAnYicgfSksXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoT2JqZWN0LmtleXMoZXh0ZW5kZWQudG9Qcm90b2NvbCgpLnByb3BlcnRpZXMpLCBbJ2EnLCAnYiddKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbmRlZC52YWxpZGF0ZSgnYScsICdoaScpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRlbmRlZC52YWxpZGF0ZSgnYicsIDMpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSB2YWxpZGF0ZU9yRGVmYXVsdCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3ZhbGlkYXRlT3JEZWZhdWx0JywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgZml4dHVyZSA9ICgpID0+IGNyZWF0ZVNjaGVtYSh7XG5cdFx0XHRuYW1lOiBzY2hlbWFQcm9wZXJ0eTxzdHJpbmc+KHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnbmFtZScgfSksXG5cdFx0XHRjb3VudDogc2NoZW1hUHJvcGVydHk8bnVtYmVyPih7IHR5cGU6ICdudW1iZXInLCB0aXRsZTogJ2NvdW50JyB9KSxcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1YnN0aXR1dGVzIGRlZmF1bHRzIGZvciBtaXNzaW5nIG9yIGludmFsaWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdHMgPSB7IG5hbWU6ICdkZWZhdWx0JywgY291bnQ6IDAgfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdCh7IG5hbWU6IDQyLCBjb3VudDogNSB9LCBkZWZhdWx0cyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBuYW1lOiAnZGVmYXVsdCcsIGNvdW50OiA1IH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFzc2VzIHRocm91Z2ggYWxsLXZhbGlkIHZhbHVlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGZpeHR1cmUoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdCh7IG5hbWU6ICdhbGljZScsIGNvdW50OiAzIH0sIHsgbmFtZTogJ2QnLCBjb3VudDogMCB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG5hbWU6ICdhbGljZScsIGNvdW50OiAzIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBkZWZhdWx0cyB3aGVuIGlucHV0IGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGZpeHR1cmUoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdCh1bmRlZmluZWQsIHsgbmFtZTogJ2QnLCBjb3VudDogNyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG5hbWU6ICdkJywgY291bnQ6IDcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZ25vcmVzIGtleXMgbm90IGluIGRlZmF1bHRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvcjogdGVzdCB0aGF0IGV4dHJhIGtleXMgbm90IGluIHRoZSBkZWZhdWx0cyBhcmUgaWdub3JlZCwgZXZlbiBpZiB0aGV5IHBhc3MgdmFsaWRhdGlvbi5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdCh7IG5hbWU6ICdhJywgY291bnQ6IDEsIGlnbm9yZWQ6IHRydWUgfSwgeyBuYW1lOiAnZCcsIGNvdW50OiAwIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgbmFtZTogJ2EnLCBjb3VudDogMSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIHNjaGVtYSBrZXlzIHRoYXQgYXJlIG1pc3NpbmcgZnJvbSBib3RoIHZhbHVlcyBhbmQgZGVmYXVsdHMnLCAoKSA9PiB7XG5cdFx0XHQvLyBSZWdyZXNzaW9uIGNvdmVyYWdlIGZvciB0aGUgcGFydGlhbC1kZWZhdWx0cyBjb250cmFjdCB0aGF0XG5cdFx0XHQvLyB1bmRlcnBpbnMgaG9zdC1sZXZlbCBpbmhlcml0YW5jZTogaWYgdGhlIGNhbGxlciBkb2Vzbid0IHN1cHBseVxuXHRcdFx0Ly8gYSBkZWZhdWx0IGFuZCBubyBpbmNvbWluZyB2YWx1ZSBpcyB2YWxpZCwgdGhlIGtleSBpcyBsZWZ0IG91dFxuXHRcdFx0Ly8gZW50aXJlbHkgc28gaGlnaGVyLXNjb3BlIGRlZmF1bHRzIGNhbiBmaWxsIGluLlxuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KHsgY291bnQ6IDkgfSwgeyBjb3VudDogMCB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGNvdW50OiA5IH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaGFzT3duUHJvcGVydHkoJ25hbWUnKSwgJ2BuYW1lYCBzaG91bGQgYmUgYWJzZW50IHdoZW4gbmVpdGhlciB2YWx1ZXMgbm9yIGRlZmF1bHRzIHN1cHBseSBpdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgc2NoZW1hIGtleXMgd2hlbiB2YWx1ZSBpcyBpbnZhbGlkIGFuZCBubyBkZWZhdWx0IGlzIHN1cHBsaWVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gZml4dHVyZSgpO1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvcjogdGVzdCB0aGF0IGludmFsaWQgdmFsdWVzIGFyZSBkcm9wcGVkIGV2ZW4gd2hlbiB0aGUgY2FsbGVyIGRvZXNuJ3QgcHJvdmlkZSBhIGRlZmF1bHQuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzY2hlbWEudmFsaWRhdGVPckRlZmF1bHQoeyBuYW1lOiA0MiwgY291bnQ6IDMgfSwgeyBjb3VudDogMCB9KTtcblx0XHRcdC8vIGBuYW1lYCBoYXMgbm8gZGVmYXVsdCBhbmQgdGhlIGluY29taW5nIHZhbHVlIGlzIGludmFsaWQgXHUyMTkyIGRyb3BwZWQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBjb3VudDogMyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBwbGF0Zm9ybVNlc3Npb25TY2hlbWEgc2FuaXR5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3BsYXRmb3JtU2Vzc2lvblNjaGVtYScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3ZhbGlkYXRlcyB0aGUgYXV0b0FwcHJvdmUgbGV2ZWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGV2ZWxzOiBBdXRvQXBwcm92ZUxldmVsW10gPSBbJ2RlZmF1bHQnLCAnYXNzaXN0ZWQnLCAnYXV0b0FwcHJvdmUnXTtcblx0XHRcdGZvciAoY29uc3QgbGV2ZWwgb2YgbGV2ZWxzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSwgbGV2ZWwpLCB0cnVlLCBsZXZlbCk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhdGZvcm1TZXNzaW9uU2NoZW1hLnZhbGlkYXRlKFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUsICdhdXRvcGlsb3QnKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsYXRmb3JtU2Vzc2lvblNjaGVtYS52YWxpZGF0ZShTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlLCAnYm9ndXMnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhwb3NlcyBhcHByb3ZhbCBjaG9pY2VzIGluIHBpY2tlciBvcmRlciB3aXRoIGN1cnJlbnQgY29weScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3BlcnR5ID0gcGxhdGZvcm1TZXNzaW9uU2NoZW1hLnRvUHJvdG9jb2woKS5wcm9wZXJ0aWVzW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGVudW06IHByb3BlcnR5LmVudW0sXG5cdFx0XHRcdGVudW1MYWJlbHM6IHByb3BlcnR5LmVudW1MYWJlbHMsXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IHByb3BlcnR5LmVudW1EZXNjcmlwdGlvbnMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVudW06IFsnZGVmYXVsdCcsICdhc3Npc3RlZCcsICdhdXRvQXBwcm92ZSddLFxuXHRcdFx0XHRlbnVtTGFiZWxzOiBbJ0RlZmF1bHQgYXBwcm92YWxzJywgJ0Fzc2lzdGVkIHBlcm1pc3Npb25zJywgJ0FsbG93IGFsbCddLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0J0Fza3Mgd2hlbiBhcHByb3ZhbCBzZXR0aW5ncyBkb25cXCd0IGFwcGx5Jyxcblx0XHRcdFx0XHQnRXZhbHVhdGVzIHJpc2sgYmVmb3JlIHJ1bm5pbmcgdG9vbHMnLFxuXHRcdFx0XHRcdCdSdW5zIHRvb2wgY2FsbHMgd2l0aG91dCBhc2tpbmcnLFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZGF0ZXMgcGVybWlzc2lvbnMgc2hhcGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvazogSVBlcm1pc3Npb25zVmFsdWUgPSB7IGFsbG93OiBbJ3JlYWQnXSwgZGVueTogW10gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9ucywgb2spLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9ucywgeyBhbGxvdzogWzQyXSwgZGVueTogW10gfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9ucywgeyBhbGxvdzogW10gfSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWRhdGVzIHRoZSBhZ2VudCBtb2RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVzOiBTZXNzaW9uTW9kZVtdID0gWydpbnRlcmFjdGl2ZScsICdwbGFuJywgJ2F1dG9waWxvdCddO1xuXHRcdFx0Zm9yIChjb25zdCBtb2RlIG9mIG1vZGVzKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlLCBtb2RlKSwgdHJ1ZSwgbW9kZSk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhdGZvcm1TZXNzaW9uU2NoZW1hLnZhbGlkYXRlKFNlc3Npb25Db25maWdLZXkuTW9kZSwgJ3NoZWxsJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbGF0Zm9ybVNlc3Npb25TY2hlbWEudmFsaWRhdGUoU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlLCA0MiksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBsZWdhY3kgYXV0b3BpbG90IG1pZ3JhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ21pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXBzIGxlZ2FjeSBhdXRvQXBwcm92ZT1hdXRvcGlsb3QgdG8gbW9kZT1hdXRvcGlsb3QgKyBhdXRvQXBwcm92ZT1kZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyh7IFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2F1dG9waWxvdCcgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBtb2RlOiAnYXV0b3BpbG90JywgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBwbGFuIG1vZGUgKGxlZ2FjeSBwbGFuIHRvb2sgcHJlY2VkZW5jZSBvdmVyIGF1dG9waWxvdCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBtaWdyYXRlTGVnYWN5QXV0b3BpbG90Q29uZmlnKHsgW1Nlc3Npb25Db25maWdLZXkuTW9kZV06ICdwbGFuJywgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b3BpbG90JyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG1vZGU6ICdwbGFuJywgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ292ZXJ3cml0ZXMgYSBzdGFsZSBpbnRlcmFjdGl2ZSBtb2RlIHdpdGggYXV0b3BpbG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyh7IFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdOiAnaW50ZXJhY3RpdmUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdhdXRvcGlsb3QnIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgbW9kZTogJ2F1dG9waWxvdCcsIGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhyb3VnaCBjb25maWdzIHdpdGhvdXQgdGhlIGxlZ2FjeSB2YWx1ZSB1bnRvdWNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHsgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXNzaXN0ZWQnLCBbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogJ2ludGVyYWN0aXZlJyB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pZ3JhdGVMZWdhY3lBdXRvcGlsb3RDb25maWcoaW5wdXQpLCBpbnB1dCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWdyYXRlZCBjb25maWcgdmFsaWRhdGVzIGFnYWluc3QgdGhlIHNjaGVtYScsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHsgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b3BpbG90JyB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyhpbnB1dCkhO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsYXRmb3JtU2Vzc2lvblNjaGVtYS52YWxpZGF0ZShTZXNzaW9uQ29uZmlnS2V5Lk1vZGUsIHJlc3VsdFtTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGxhdGZvcm1TZXNzaW9uU2NoZW1hLnZhbGlkYXRlKFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUsIHJlc3VsdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZyh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlIGZvcndhcmRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnbm9ybWFsaXplQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgna2VlcHMgbnVsbCBlbnRyaWVzIGFuZCBvYmplY3QgcnVsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnNwZWN0VmFsdWU6IElDb25maWd1cmF0aW9uVmFsdWU8UmVhZG9ubHk8QWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzPj4gPSB7fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZyh7XG5cdFx0XHRcdGVjaG86IG51bGwsXG5cdFx0XHRcdHB5dGhvbjogdHJ1ZSxcblx0XHRcdFx0Jy9ebnBtIHJ1biBidWlsZCQvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHR9LCBpbnNwZWN0VmFsdWUsIGZhbHNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0ZWNobzogbnVsbCxcblx0XHRcdFx0cHl0aG9uOiB0cnVlLFxuXHRcdFx0XHQnL15ucG0gcnVuIGJ1aWxkJC8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyBkZWZhdWx0LW9ubHkgZW50cmllcyB3aGVuIGRlZmF1bHQgcnVsZXMgYXJlIGlnbm9yZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnNwZWN0VmFsdWU6IElDb25maWd1cmF0aW9uVmFsdWU8UmVhZG9ubHk8QWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzPj4gPSB7XG5cdFx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6IHsgZWNobzogdHJ1ZSwgbHM6IHRydWUsIHB5dGhvbjogZmFsc2UgfSB9LFxuXHRcdFx0XHR1c2VyOiB7IHZhbHVlOiB7IGVjaG86IG51bGwgfSB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZyh7XG5cdFx0XHRcdGVjaG86IG51bGwsXG5cdFx0XHRcdGxzOiB0cnVlLFxuXHRcdFx0XHRweXRob246IHRydWUsXG5cdFx0XHR9LCBpbnNwZWN0VmFsdWUsIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRlY2hvOiBudWxsLFxuXHRcdFx0XHRweXRob246IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGVudHJpZXMgdGhhdCBtYXRjaCBkZWZhdWx0cyB3aGVuIHRoZXkgY29tZSBmcm9tIGEgbm9uLWRlZmF1bHQgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zcGVjdFZhbHVlOiBJQ29uZmlndXJhdGlvblZhbHVlPFJlYWRvbmx5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4+ID0ge1xuXHRcdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiB7IGVjaG86IHRydWUsIGxzOiB0cnVlIH0gfSxcblx0XHRcdFx0dXNlclZhbHVlOiB7IGxzOiB0cnVlIH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnKHtcblx0XHRcdFx0ZWNobzogdHJ1ZSxcblx0XHRcdFx0bHM6IHRydWUsXG5cdFx0XHR9LCBpbnNwZWN0VmFsdWUsIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRsczogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsY0FBYyw4QkFBOEIsa0RBQWtELHVCQUF1QixzQkFBK0g7QUFDN1AsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUIscUJBQXFCO0FBUWpELFNBQVMscUJBQXFCLElBQStCO0FBQzVELE1BQUk7QUFDSCxPQUFHO0FBQUEsRUFDSixTQUFTLEtBQUs7QUFDYixXQUFPLEdBQUcsZUFBZSxlQUFlLGdDQUFnQyxHQUFHLEVBQUU7QUFDN0UsV0FBTztBQUFBLEVBQ1I7QUFDQSxTQUFPLEtBQUssc0NBQXNDO0FBQ25EO0FBRUEsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QiwwQ0FBd0M7QUFJeEMsUUFBTSxrQkFBa0IsTUFBTTtBQUU3QixTQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLFlBQU0sTUFBTSxl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
