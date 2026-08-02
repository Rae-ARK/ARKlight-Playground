import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { collectManagedSettingsDefinitions, hasManagedSettingsDefinitions, managedSettingValue, projectManagedSettings, pickManagedSettings } from "../../common/copilotManagedSettings.js";
suite("Copilot managed settings projection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const definitions = {
    PolicyA: {
      type: "boolean",
      managedSettings: { "permissions.disableBypassPermissionsMode": { type: "string" } }
    },
    PolicyB: {
      type: "number",
      managedSettings: { "limits.maxFoo": { type: "number" }, "flags.enableBar": { type: "boolean" } }
    },
    PolicyC: {
      type: "string"
    }
  };
  test("collectManagedSettingsDefinitions aggregates declarations across all policies", () => {
    assert.deepStrictEqual(collectManagedSettingsDefinitions(definitions), {
      "permissions.disableBypassPermissionsMode": { type: "string" },
      "limits.maxFoo": { type: "number" },
      "flags.enableBar": { type: "boolean" }
    });
  });
  test("collectManagedSettingsDefinitions returns empty when nothing is declared", () => {
    assert.deepStrictEqual(collectManagedSettingsDefinitions({ P: { type: "string" } }), {});
  });
  test("hasManagedSettingsDefinitions detects whether any policy declares a managed key", () => {
    assert.deepStrictEqual(
      {
        withKeys: hasManagedSettingsDefinitions(definitions),
        none: hasManagedSettingsDefinitions({ P: { type: "string" } }),
        empty: hasManagedSettingsDefinitions({})
      },
      { withKeys: true, none: false, empty: false }
    );
  });
  test("managedSettingValue locks to the managed value when set, else undefined", () => {
    const value = managedSettingValue("permissions.disableBypassPermissionsMode");
    assert.deepStrictEqual(
      {
        set: value({ managedSettings: { "permissions.disableBypassPermissionsMode": "disable" } }),
        otherKey: value({ managedSettings: { "other.key": "x" } }),
        noBag: value({})
      },
      { set: "disable", otherKey: void 0, noBag: void 0 }
    );
  });
  test("managedSettingValue returns the same memoized callback per key (stable reference identity)", () => {
    assert.strictEqual(
      managedSettingValue("permissions.disableBypassPermissionsMode"),
      managedSettingValue("permissions.disableBypassPermissionsMode")
    );
    assert.notStrictEqual(
      managedSettingValue("permissions.disableBypassPermissionsMode"),
      managedSettingValue("some.other.key")
    );
  });
  test("projectManagedSettings keeps declared+typed keys, drops undeclared and type-mismatched", () => {
    const projected = projectManagedSettings({
      "permissions.disableBypassPermissionsMode": "disable",
      // declared string -> kept
      "limits.maxFoo": 5,
      // declared number -> kept
      "flags.enableBar": "true",
      // declared boolean, got string -> dropped
      "unknown.key": "x"
      // undeclared -> dropped
    }, collectManagedSettingsDefinitions(definitions));
    assert.deepStrictEqual(projected, {
      "permissions.disableBypassPermissionsMode": "disable",
      "limits.maxFoo": 5
    });
  });
  test("projectManagedSettings validates without coercing (string stays a string)", () => {
    assert.deepStrictEqual(
      projectManagedSettings(
        { "permissions.disableBypassPermissionsMode": "false" },
        { "permissions.disableBypassPermissionsMode": { type: "string" } }
      ),
      { "permissions.disableBypassPermissionsMode": "false" }
    );
  });
  test("projectManagedSettings warns once per type mismatch", () => {
    const warnings = [];
    projectManagedSettings(
      { "flags.enableBar": "true" },
      { "flags.enableBar": { type: "boolean" } },
      (msg) => warnings.push(msg)
    );
    assert.strictEqual(warnings.length, 1);
  });
});
suite("Copilot managed settings per-key precedence (pickManagedSettings)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("distinct keys each win from their highest-precedence channel; a lower channel fills a gap the higher ones leave", () => {
    const pick = pickManagedSettings(
      { "shared": "native", "nativeOnly": "n" },
      { "shared": "server", "serverOnly": "s" },
      { "shared": "file", "fileOnly": "f" }
    );
    assert.deepStrictEqual(pick.values, { "shared": "native", "nativeOnly": "n", "serverOnly": "s", "fileOnly": "f" });
    assert.deepStrictEqual(pick.activeSources, ["nativeMdm", "server", "file"]);
    assert.deepStrictEqual(pick.resolutions.get("shared"), {
      value: "native",
      source: "nativeMdm",
      contributions: [
        { channel: "nativeMdm", value: "native" },
        { channel: "server", value: "server" },
        { channel: "file", value: "file" }
      ]
    });
  });
  test("with native absent, the mid-tier server wins a contested key over file", () => {
    const pick = pickManagedSettings(void 0, { "k": "server" }, { "k": "file" });
    assert.deepStrictEqual(pick.resolutions.get("k"), {
      value: "server",
      source: "server",
      contributions: [
        { channel: "server", value: "server" },
        { channel: "file", value: "file" }
      ]
    });
    assert.deepStrictEqual(pick.activeSources, ["server"]);
  });
  test("falsy-but-present values are real contributions and win over a lower channel", () => {
    const pick = pickManagedSettings(
      { "flag": false, "count": 0, "name": "" },
      void 0,
      { "flag": true, "count": 99, "name": "lower" }
    );
    assert.deepStrictEqual(pick.values, { "flag": false, "count": 0, "name": "" });
    assert.deepStrictEqual(pick.activeSources, ["nativeMdm"]);
  });
  test("an explicit `undefined` hole in a higher channel falls through to a lower channel", () => {
    const pick = pickManagedSettings(
      { "a": void 0, "b": "native" },
      { "a": "server" },
      void 0
    );
    assert.deepStrictEqual(pick.values, { "a": "server", "b": "native" });
    assert.strictEqual(pick.resolutions.get("a").source, "server");
  });
  test("the merged bag is a fresh object, never an alias of an input channel bag", () => {
    const native = { "a": "native" };
    const pick = pickManagedSettings(native, void 0, void 0);
    assert.notStrictEqual(pick.values, native);
    assert.deepStrictEqual(pick.values, { "a": "native" });
  });
  test("empty/absent channels contribute nothing and activeSources skips a non-contributing middle channel", () => {
    assert.deepStrictEqual(
      {
        partial: pickManagedSettings({}, { "b": "server" }, void 0),
        // native + file contribute, server does not — activeSources must skip the gap.
        gap: pickManagedSettings({ "x": "n" }, void 0, { "y": "f" }).activeSources,
        allUndefined: pickManagedSettings(void 0, void 0, void 0),
        allEmpty: pickManagedSettings({}, {}, {})
      },
      {
        partial: { values: { "b": "server" }, resolutions: /* @__PURE__ */ new Map([["b", { value: "server", source: "server", contributions: [{ channel: "server", value: "server" }] }]]), activeSources: ["server"] },
        gap: ["nativeMdm", "file"],
        allUndefined: { values: {}, resolutions: /* @__PURE__ */ new Map(), activeSources: [] },
        allEmpty: { values: {}, resolutions: /* @__PURE__ */ new Map(), activeSources: [] }
      }
    );
  });
  test("a malicious `__proto__` key does not pollute any prototype chain", () => {
    const malicious = JSON.parse('{ "__proto__": { "polluted": true } }');
    const pick = pickManagedSettings(malicious, void 0, void 0);
    assert.strictEqual({}.polluted, void 0);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
    assert.strictEqual(Object.getPrototypeOf(pick.values), Object.prototype);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3BvbGljeS90ZXN0L2NvbW1vbi9jb3BpbG90TWFuYWdlZFNldHRpbmdzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElQb2xpY3lEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBjb2xsZWN0TWFuYWdlZFNldHRpbmdzRGVmaW5pdGlvbnMsIGhhc01hbmFnZWRTZXR0aW5nc0RlZmluaXRpb25zLCBtYW5hZ2VkU2V0dGluZ1ZhbHVlLCBwcm9qZWN0TWFuYWdlZFNldHRpbmdzLCBwaWNrTWFuYWdlZFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RNYW5hZ2VkU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgUG9saWN5RGVmaW5pdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9wb2xpY3kuanMnO1xuXG5zdWl0ZSgnQ29waWxvdCBtYW5hZ2VkIHNldHRpbmdzIHByb2plY3Rpb24nLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgZGVmaW5pdGlvbnM6IElTdHJpbmdEaWN0aW9uYXJ5PFBvbGljeURlZmluaXRpb24+ID0ge1xuXHRcdFBvbGljeUE6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hbmFnZWRTZXR0aW5nczogeyAncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZSc6IHsgdHlwZTogJ3N0cmluZycgfSB9LFxuXHRcdH0sXG5cdFx0UG9saWN5Qjoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHsgJ2xpbWl0cy5tYXhGb28nOiB7IHR5cGU6ICdudW1iZXInIH0sICdmbGFncy5lbmFibGVCYXInOiB7IHR5cGU6ICdib29sZWFuJyB9IH0sXG5cdFx0fSxcblx0XHRQb2xpY3lDOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHR9LFxuXHR9O1xuXG5cdHRlc3QoJ2NvbGxlY3RNYW5hZ2VkU2V0dGluZ3NEZWZpbml0aW9ucyBhZ2dyZWdhdGVzIGRlY2xhcmF0aW9ucyBhY3Jvc3MgYWxsIHBvbGljaWVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdE1hbmFnZWRTZXR0aW5nc0RlZmluaXRpb25zKGRlZmluaXRpb25zKSwge1xuXHRcdFx0J3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHQnbGltaXRzLm1heEZvbyc6IHsgdHlwZTogJ251bWJlcicgfSxcblx0XHRcdCdmbGFncy5lbmFibGVCYXInOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsZWN0TWFuYWdlZFNldHRpbmdzRGVmaW5pdGlvbnMgcmV0dXJucyBlbXB0eSB3aGVuIG5vdGhpbmcgaXMgZGVjbGFyZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0TWFuYWdlZFNldHRpbmdzRGVmaW5pdGlvbnMoeyBQOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSksIHt9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFzTWFuYWdlZFNldHRpbmdzRGVmaW5pdGlvbnMgZGV0ZWN0cyB3aGV0aGVyIGFueSBwb2xpY3kgZGVjbGFyZXMgYSBtYW5hZ2VkIGtleScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHR3aXRoS2V5czogaGFzTWFuYWdlZFNldHRpbmdzRGVmaW5pdGlvbnMoZGVmaW5pdGlvbnMpLFxuXHRcdFx0XHRub25lOiBoYXNNYW5hZ2VkU2V0dGluZ3NEZWZpbml0aW9ucyh7IFA6IHsgdHlwZTogJ3N0cmluZycgfSB9KSxcblx0XHRcdFx0ZW1wdHk6IGhhc01hbmFnZWRTZXR0aW5nc0RlZmluaXRpb25zKHt9KSxcblx0XHRcdH0sXG5cdFx0XHR7IHdpdGhLZXlzOiB0cnVlLCBub25lOiBmYWxzZSwgZW1wdHk6IGZhbHNlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbWFuYWdlZFNldHRpbmdWYWx1ZSBsb2NrcyB0byB0aGUgbWFuYWdlZCB2YWx1ZSB3aGVuIHNldCwgZWxzZSB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBtYW5hZ2VkU2V0dGluZ1ZhbHVlKCdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0c2V0OiB2YWx1ZSh7IG1hbmFnZWRTZXR0aW5nczogeyAncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZSc6ICdkaXNhYmxlJyB9IH0gYXMgSVBvbGljeURhdGEpLFxuXHRcdFx0XHRvdGhlcktleTogdmFsdWUoeyBtYW5hZ2VkU2V0dGluZ3M6IHsgJ290aGVyLmtleSc6ICd4JyB9IH0gYXMgSVBvbGljeURhdGEpLFxuXHRcdFx0XHRub0JhZzogdmFsdWUoe30gYXMgSVBvbGljeURhdGEpLFxuXHRcdFx0fSxcblx0XHRcdHsgc2V0OiAnZGlzYWJsZScsIG90aGVyS2V5OiB1bmRlZmluZWQsIG5vQmFnOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYW5hZ2VkU2V0dGluZ1ZhbHVlIHJldHVybnMgdGhlIHNhbWUgbWVtb2l6ZWQgY2FsbGJhY2sgcGVyIGtleSAoc3RhYmxlIHJlZmVyZW5jZSBpZGVudGl0eSknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0bWFuYWdlZFNldHRpbmdWYWx1ZSgncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZScpLFxuXHRcdFx0bWFuYWdlZFNldHRpbmdWYWx1ZSgncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZScpLFxuXHRcdCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKFxuXHRcdFx0bWFuYWdlZFNldHRpbmdWYWx1ZSgncGVybWlzc2lvbnMuZGlzYWJsZUJ5cGFzc1Blcm1pc3Npb25zTW9kZScpLFxuXHRcdFx0bWFuYWdlZFNldHRpbmdWYWx1ZSgnc29tZS5vdGhlci5rZXknKSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9qZWN0TWFuYWdlZFNldHRpbmdzIGtlZXBzIGRlY2xhcmVkK3R5cGVkIGtleXMsIGRyb3BzIHVuZGVjbGFyZWQgYW5kIHR5cGUtbWlzbWF0Y2hlZCcsICgpID0+IHtcblx0XHRjb25zdCBwcm9qZWN0ZWQgPSBwcm9qZWN0TWFuYWdlZFNldHRpbmdzKHtcblx0XHRcdCdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJzogJ2Rpc2FibGUnLCAvLyBkZWNsYXJlZCBzdHJpbmcgLT4ga2VwdFxuXHRcdFx0J2xpbWl0cy5tYXhGb28nOiA1LCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGRlY2xhcmVkIG51bWJlciAtPiBrZXB0XG5cdFx0XHQnZmxhZ3MuZW5hYmxlQmFyJzogJ3RydWUnLCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gZGVjbGFyZWQgYm9vbGVhbiwgZ290IHN0cmluZyAtPiBkcm9wcGVkXG5cdFx0XHQndW5rbm93bi5rZXknOiAneCcsICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdW5kZWNsYXJlZCAtPiBkcm9wcGVkXG5cdFx0fSwgY29sbGVjdE1hbmFnZWRTZXR0aW5nc0RlZmluaXRpb25zKGRlZmluaXRpb25zKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2plY3RlZCwge1xuXHRcdFx0J3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiAnZGlzYWJsZScsXG5cdFx0XHQnbGltaXRzLm1heEZvbyc6IDUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb2plY3RNYW5hZ2VkU2V0dGluZ3MgdmFsaWRhdGVzIHdpdGhvdXQgY29lcmNpbmcgKHN0cmluZyBzdGF5cyBhIHN0cmluZyknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHByb2plY3RNYW5hZ2VkU2V0dGluZ3MoXG5cdFx0XHRcdHsgJ3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiAnZmFsc2UnIH0sXG5cdFx0XHRcdHsgJ3Blcm1pc3Npb25zLmRpc2FibGVCeXBhc3NQZXJtaXNzaW9uc01vZGUnOiB7IHR5cGU6ICdzdHJpbmcnIH0gfSxcblx0XHRcdCksXG5cdFx0XHR7ICdwZXJtaXNzaW9ucy5kaXNhYmxlQnlwYXNzUGVybWlzc2lvbnNNb2RlJzogJ2ZhbHNlJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb2plY3RNYW5hZ2VkU2V0dGluZ3Mgd2FybnMgb25jZSBwZXIgdHlwZSBtaXNtYXRjaCcsICgpID0+IHtcblx0XHRjb25zdCB3YXJuaW5nczogc3RyaW5nW10gPSBbXTtcblx0XHRwcm9qZWN0TWFuYWdlZFNldHRpbmdzKFxuXHRcdFx0eyAnZmxhZ3MuZW5hYmxlQmFyJzogJ3RydWUnIH0sXG5cdFx0XHR7ICdmbGFncy5lbmFibGVCYXInOiB7IHR5cGU6ICdib29sZWFuJyB9IH0sXG5cdFx0XHRtc2cgPT4gd2FybmluZ3MucHVzaChtc2cpLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhcm5pbmdzLmxlbmd0aCwgMSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDb3BpbG90IG1hbmFnZWQgc2V0dGluZ3MgcGVyLWtleSBwcmVjZWRlbmNlIChwaWNrTWFuYWdlZFNldHRpbmdzKScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdkaXN0aW5jdCBrZXlzIGVhY2ggd2luIGZyb20gdGhlaXIgaGlnaGVzdC1wcmVjZWRlbmNlIGNoYW5uZWw7IGEgbG93ZXIgY2hhbm5lbCBmaWxscyBhIGdhcCB0aGUgaGlnaGVyIG9uZXMgbGVhdmUnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGhlYWRsaW5lIHBlci1rZXkgYmVoYXZpb3I6IGBzaGFyZWRgIGlzIGNvbnRlc3RlZCBieSBhbGwgdGhyZWUgKG5hdGl2ZSB3aW5zKSB3aGlsZVxuXHRcdC8vIGBuYXRpdmVPbmx5YC9gc2VydmVyT25seWAvYGZpbGVPbmx5YCBhcmUgZWFjaCBzdXBwbGllZCBieSBhIHNpbmdsZSBjaGFubmVsIGFuZCBhbGwgc3Vydml2ZS5cblx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyhcblx0XHRcdHsgJ3NoYXJlZCc6ICduYXRpdmUnLCAnbmF0aXZlT25seSc6ICduJyB9LFxuXHRcdFx0eyAnc2hhcmVkJzogJ3NlcnZlcicsICdzZXJ2ZXJPbmx5JzogJ3MnIH0sXG5cdFx0XHR7ICdzaGFyZWQnOiAnZmlsZScsICdmaWxlT25seSc6ICdmJyB9LFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrLnZhbHVlcywgeyAnc2hhcmVkJzogJ25hdGl2ZScsICduYXRpdmVPbmx5JzogJ24nLCAnc2VydmVyT25seSc6ICdzJywgJ2ZpbGVPbmx5JzogJ2YnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay5hY3RpdmVTb3VyY2VzLCBbJ25hdGl2ZU1kbScsICdzZXJ2ZXInLCAnZmlsZSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2sucmVzb2x1dGlvbnMuZ2V0KCdzaGFyZWQnKSwge1xuXHRcdFx0dmFsdWU6ICduYXRpdmUnLFxuXHRcdFx0c291cmNlOiAnbmF0aXZlTWRtJyxcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IFtcblx0XHRcdFx0eyBjaGFubmVsOiAnbmF0aXZlTWRtJywgdmFsdWU6ICduYXRpdmUnIH0sXG5cdFx0XHRcdHsgY2hhbm5lbDogJ3NlcnZlcicsIHZhbHVlOiAnc2VydmVyJyB9LFxuXHRcdFx0XHR7IGNoYW5uZWw6ICdmaWxlJywgdmFsdWU6ICdmaWxlJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCBuYXRpdmUgYWJzZW50LCB0aGUgbWlkLXRpZXIgc2VydmVyIHdpbnMgYSBjb250ZXN0ZWQga2V5IG92ZXIgZmlsZScsICgpID0+IHtcblx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyh1bmRlZmluZWQsIHsgJ2snOiAnc2VydmVyJyB9LCB7ICdrJzogJ2ZpbGUnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay5yZXNvbHV0aW9ucy5nZXQoJ2snKSwge1xuXHRcdFx0dmFsdWU6ICdzZXJ2ZXInLFxuXHRcdFx0c291cmNlOiAnc2VydmVyJyxcblx0XHRcdGNvbnRyaWJ1dGlvbnM6IFtcblx0XHRcdFx0eyBjaGFubmVsOiAnc2VydmVyJywgdmFsdWU6ICdzZXJ2ZXInIH0sXG5cdFx0XHRcdHsgY2hhbm5lbDogJ2ZpbGUnLCB2YWx1ZTogJ2ZpbGUnIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay5hY3RpdmVTb3VyY2VzLCBbJ3NlcnZlciddKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsc3ktYnV0LXByZXNlbnQgdmFsdWVzIGFyZSByZWFsIGNvbnRyaWJ1dGlvbnMgYW5kIHdpbiBvdmVyIGEgbG93ZXIgY2hhbm5lbCcsICgpID0+IHtcblx0XHQvLyBgZmFsc2VgLCBgMGAgYW5kIGAnJ2AgbXVzdCBub3QgYmUgbWlzdGFrZW4gZm9yIFwidW5zZXRcIiBcdTIwMTQgYSBoaWdoZXIgY2hhbm5lbCB0aGF0IHNldHMgdGhlbVxuXHRcdC8vIHN0aWxsIGxvY2tzIHRoZSBrZXkgYWdhaW5zdCBhIGxvd2VyIGNoYW5uZWwncyB2YWx1ZS5cblx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyhcblx0XHRcdHsgJ2ZsYWcnOiBmYWxzZSwgJ2NvdW50JzogMCwgJ25hbWUnOiAnJyB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0eyAnZmxhZyc6IHRydWUsICdjb3VudCc6IDk5LCAnbmFtZSc6ICdsb3dlcicgfSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay52YWx1ZXMsIHsgJ2ZsYWcnOiBmYWxzZSwgJ2NvdW50JzogMCwgJ25hbWUnOiAnJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2suYWN0aXZlU291cmNlcywgWyduYXRpdmVNZG0nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGV4cGxpY2l0IGB1bmRlZmluZWRgIGhvbGUgaW4gYSBoaWdoZXIgY2hhbm5lbCBmYWxscyB0aHJvdWdoIHRvIGEgbG93ZXIgY2hhbm5lbCcsICgpID0+IHtcblx0XHQvLyBBIGtleSBwcmVzZW50LWJ1dC11bmRlZmluZWQgaXMgc2tpcHBlZCwgc28gYSBsb3dlciBjaGFubmVsIGNhbiBzdXBwbHkgaXQuXG5cdFx0Y29uc3QgcGljayA9IHBpY2tNYW5hZ2VkU2V0dGluZ3MoXG5cdFx0XHR7ICdhJzogdW5kZWZpbmVkIGFzIHVua25vd24gYXMgc3RyaW5nLCAnYic6ICduYXRpdmUnIH0sXG5cdFx0XHR7ICdhJzogJ3NlcnZlcicgfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGljay52YWx1ZXMsIHsgJ2EnOiAnc2VydmVyJywgJ2InOiAnbmF0aXZlJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGljay5yZXNvbHV0aW9ucy5nZXQoJ2EnKSEuc291cmNlLCAnc2VydmVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBtZXJnZWQgYmFnIGlzIGEgZnJlc2ggb2JqZWN0LCBuZXZlciBhbiBhbGlhcyBvZiBhbiBpbnB1dCBjaGFubmVsIGJhZycsICgpID0+IHtcblx0XHQvLyBBY2NvdW50UG9saWN5U2VydmljZSBwcm9qZWN0cyBgcGljay52YWx1ZXNgIGRpcmVjdGx5LCByZWx5aW5nIG9uIGl0IG5vdCBhbGlhc2luZy9tdXRhdGluZyBhXG5cdFx0Ly8gY2hhbm5lbCdzIGJhZy5cblx0XHRjb25zdCBuYXRpdmUgPSB7ICdhJzogJ25hdGl2ZScgfTtcblx0XHRjb25zdCBwaWNrID0gcGlja01hbmFnZWRTZXR0aW5ncyhuYXRpdmUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGljay52YWx1ZXMsIG5hdGl2ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrLnZhbHVlcywgeyAnYSc6ICduYXRpdmUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eS9hYnNlbnQgY2hhbm5lbHMgY29udHJpYnV0ZSBub3RoaW5nIGFuZCBhY3RpdmVTb3VyY2VzIHNraXBzIGEgbm9uLWNvbnRyaWJ1dGluZyBtaWRkbGUgY2hhbm5lbCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRwYXJ0aWFsOiBwaWNrTWFuYWdlZFNldHRpbmdzKHt9LCB7ICdiJzogJ3NlcnZlcicgfSwgdW5kZWZpbmVkKSxcblx0XHRcdFx0Ly8gbmF0aXZlICsgZmlsZSBjb250cmlidXRlLCBzZXJ2ZXIgZG9lcyBub3QgXHUyMDE0IGFjdGl2ZVNvdXJjZXMgbXVzdCBza2lwIHRoZSBnYXAuXG5cdFx0XHRcdGdhcDogcGlja01hbmFnZWRTZXR0aW5ncyh7ICd4JzogJ24nIH0sIHVuZGVmaW5lZCwgeyAneSc6ICdmJyB9KS5hY3RpdmVTb3VyY2VzLFxuXHRcdFx0XHRhbGxVbmRlZmluZWQ6IHBpY2tNYW5hZ2VkU2V0dGluZ3ModW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGFsbEVtcHR5OiBwaWNrTWFuYWdlZFNldHRpbmdzKHt9LCB7fSwge30pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0cGFydGlhbDogeyB2YWx1ZXM6IHsgJ2InOiAnc2VydmVyJyB9LCByZXNvbHV0aW9uczogbmV3IE1hcChbWydiJywgeyB2YWx1ZTogJ3NlcnZlcicsIHNvdXJjZTogJ3NlcnZlcicsIGNvbnRyaWJ1dGlvbnM6IFt7IGNoYW5uZWw6ICdzZXJ2ZXInLCB2YWx1ZTogJ3NlcnZlcicgfV0gfV1dKSwgYWN0aXZlU291cmNlczogWydzZXJ2ZXInXSB9LFxuXHRcdFx0XHRnYXA6IFsnbmF0aXZlTWRtJywgJ2ZpbGUnXSxcblx0XHRcdFx0YWxsVW5kZWZpbmVkOiB7IHZhbHVlczoge30sIHJlc29sdXRpb25zOiBuZXcgTWFwKCksIGFjdGl2ZVNvdXJjZXM6IFtdIH0sXG5cdFx0XHRcdGFsbEVtcHR5OiB7IHZhbHVlczoge30sIHJlc29sdXRpb25zOiBuZXcgTWFwKCksIGFjdGl2ZVNvdXJjZXM6IFtdIH0sXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgbWFsaWNpb3VzIGBfX3Byb3RvX19gIGtleSBkb2VzIG5vdCBwb2xsdXRlIGFueSBwcm90b3R5cGUgY2hhaW4nLCAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzIGEgSlNPTi1wYXJzZWQgYmFnIGNhcnJ5aW5nIGFuIG93biBgX19wcm90b19fYCBrZXkgd2l0aCBhbiBvYmplY3QgdmFsdWUgKHRoZVxuXHRcdC8vIGNsYXNzaWMgcHJvdG90eXBlLXBvbGx1dGlvbiB2ZWN0b3IpLiBNZXJnaW5nIGl0IG11c3QgbmVpdGhlciBwb2xsdXRlIE9iamVjdC5wcm90b3R5cGUgbm9yXG5cdFx0Ly8gY29ycnVwdCB0aGUgcmV0dXJuZWQgYmFnJ3Mgb3duIHByb3RvdHlwZS5cblx0XHRjb25zdCBtYWxpY2lvdXMgPSBKU09OLnBhcnNlKCd7IFwiX19wcm90b19fXCI6IHsgXCJwb2xsdXRlZFwiOiB0cnVlIH0gfScpIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdFx0Y29uc3QgcGljayA9IHBpY2tNYW5hZ2VkU2V0dGluZ3MobWFsaWNpb3VzLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh7fSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikucG9sbHV0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChPYmplY3QucHJvdG90eXBlLCAncG9sbHV0ZWQnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3QuZ2V0UHJvdG90eXBlT2YocGljay52YWx1ZXMpLCBPYmplY3QucHJvdG90eXBlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUduQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG1DQUFtQywrQkFBK0IscUJBQXFCLHdCQUF3QiwyQkFBMkI7QUFHbkosTUFBTSx1Q0FBdUMsTUFBTTtBQUVsRCwwQ0FBd0M7QUFFeEMsUUFBTSxjQUFtRDtBQUFBLElBQ3hELFNBQVM7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLGlCQUFpQixFQUFFLDRDQUE0QyxFQUFFLE1BQU0sU0FBUyxFQUFFO0FBQUEsSUFDbkY7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNSLE1BQU07QUFBQSxNQUNOLGlCQUFpQixFQUFFLGlCQUFpQixFQUFFLE1BQU0sU0FBUyxHQUFHLG1CQUFtQixFQUFFLE1BQU0sVUFBVSxFQUFFO0FBQUEsSUFDaEc7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNSLE1BQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUVBLE9BQUssaUZBQWlGLE1BQU07QUFDM0YsV0FBTyxnQkFBZ0Isa0NBQWtDLFdBQVcsR0FBRztBQUFBLE1BQ3RFLDRDQUE0QyxFQUFFLE1BQU0sU0FBUztBQUFBLE1BQzdELGlCQUFpQixFQUFFLE1BQU0sU0FBUztBQUFBLE1BQ2xDLG1CQUFtQixFQUFFLE1BQU0sVUFBVTtBQUFBLElBQ3RDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFdBQU8sZ0JBQWdCLGtDQUFrQyxFQUFFLEdBQUcsRUFBRSxNQUFNLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDeEYsQ0FBQztBQUVELE9BQUssbUZBQW1GLE1BQU07QUFDN0YsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLFVBQVUsOEJBQThCLFdBQVc7QUFBQSxRQUNuRCxNQUFNLDhCQUE4QixFQUFFLEdBQUcsRUFBRSxNQUFNLFNBQVMsRUFBRSxDQUFDO0FBQUEsUUFDN0QsT0FBTyw4QkFBOEIsQ0FBQyxDQUFDO0FBQUEsTUFDeEM7QUFBQSxNQUNBLEVBQUUsVUFBVSxNQUFNLE1BQU0sT0FBTyxPQUFPLE1BQU07QUFBQSxJQUM3QztBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMkVBQTJFLE1BQU07QUFDckYsVUFBTSxRQUFRLG9CQUFvQiwwQ0FBMEM7QUFDNUUsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLEtBQUssTUFBTSxFQUFFLGlCQUFpQixFQUFFLDRDQUE0QyxVQUFVLEVBQUUsQ0FBZ0I7QUFBQSxRQUN4RyxVQUFVLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxhQUFhLElBQUksRUFBRSxDQUFnQjtBQUFBLFFBQ3hFLE9BQU8sTUFBTSxDQUFDLENBQWdCO0FBQUEsTUFDL0I7QUFBQSxNQUNBLEVBQUUsS0FBSyxXQUFXLFVBQVUsUUFBVyxPQUFPLE9BQVU7QUFBQSxJQUN6RDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssOEZBQThGLE1BQU07QUFDeEcsV0FBTztBQUFBLE1BQ04sb0JBQW9CLDBDQUEwQztBQUFBLE1BQzlELG9CQUFvQiwwQ0FBMEM7QUFBQSxJQUMvRDtBQUNBLFdBQU87QUFBQSxNQUNOLG9CQUFvQiwwQ0FBMEM7QUFBQSxNQUM5RCxvQkFBb0IsZ0JBQWdCO0FBQUEsSUFDckM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDBGQUEwRixNQUFNO0FBQ3BHLFVBQU0sWUFBWSx1QkFBdUI7QUFBQSxNQUN4Qyw0Q0FBNEM7QUFBQTtBQUFBLE1BQzVDLGlCQUFpQjtBQUFBO0FBQUEsTUFDakIsbUJBQW1CO0FBQUE7QUFBQSxNQUNuQixlQUFlO0FBQUE7QUFBQSxJQUNoQixHQUFHLGtDQUFrQyxXQUFXLENBQUM7QUFFakQsV0FBTyxnQkFBZ0IsV0FBVztBQUFBLE1BQ2pDLDRDQUE0QztBQUFBLE1BQzVDLGlCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxNQUFNO0FBQ3ZGLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxFQUFFLDRDQUE0QyxRQUFRO0FBQUEsUUFDdEQsRUFBRSw0Q0FBNEMsRUFBRSxNQUFNLFNBQVMsRUFBRTtBQUFBLE1BQ2xFO0FBQUEsTUFDQSxFQUFFLDRDQUE0QyxRQUFRO0FBQUEsSUFDdkQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFVBQU0sV0FBcUIsQ0FBQztBQUM1QjtBQUFBLE1BQ0MsRUFBRSxtQkFBbUIsT0FBTztBQUFBLE1BQzVCLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxVQUFVLEVBQUU7QUFBQSxNQUN6QyxTQUFPLFNBQVMsS0FBSyxHQUFHO0FBQUEsSUFDekI7QUFDQSxXQUFPLFlBQVksU0FBUyxRQUFRLENBQUM7QUFBQSxFQUN0QyxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0scUVBQXFFLE1BQU07QUFFaEYsMENBQXdDO0FBRXhDLE9BQUssbUhBQW1ILE1BQU07QUFHN0gsVUFBTSxPQUFPO0FBQUEsTUFDWixFQUFFLFVBQVUsVUFBVSxjQUFjLElBQUk7QUFBQSxNQUN4QyxFQUFFLFVBQVUsVUFBVSxjQUFjLElBQUk7QUFBQSxNQUN4QyxFQUFFLFVBQVUsUUFBUSxZQUFZLElBQUk7QUFBQSxJQUNyQztBQUNBLFdBQU8sZ0JBQWdCLEtBQUssUUFBUSxFQUFFLFVBQVUsVUFBVSxjQUFjLEtBQUssY0FBYyxLQUFLLFlBQVksSUFBSSxDQUFDO0FBQ2pILFdBQU8sZ0JBQWdCLEtBQUssZUFBZSxDQUFDLGFBQWEsVUFBVSxNQUFNLENBQUM7QUFDMUUsV0FBTyxnQkFBZ0IsS0FBSyxZQUFZLElBQUksUUFBUSxHQUFHO0FBQUEsTUFDdEQsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsZUFBZTtBQUFBLFFBQ2QsRUFBRSxTQUFTLGFBQWEsT0FBTyxTQUFTO0FBQUEsUUFDeEMsRUFBRSxTQUFTLFVBQVUsT0FBTyxTQUFTO0FBQUEsUUFDckMsRUFBRSxTQUFTLFFBQVEsT0FBTyxPQUFPO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFVBQU0sT0FBTyxvQkFBb0IsUUFBVyxFQUFFLEtBQUssU0FBUyxHQUFHLEVBQUUsS0FBSyxPQUFPLENBQUM7QUFDOUUsV0FBTyxnQkFBZ0IsS0FBSyxZQUFZLElBQUksR0FBRyxHQUFHO0FBQUEsTUFDakQsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsZUFBZTtBQUFBLFFBQ2QsRUFBRSxTQUFTLFVBQVUsT0FBTyxTQUFTO0FBQUEsUUFDckMsRUFBRSxTQUFTLFFBQVEsT0FBTyxPQUFPO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLGdCQUFnQixLQUFLLGVBQWUsQ0FBQyxRQUFRLENBQUM7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsTUFBTTtBQUcxRixVQUFNLE9BQU87QUFBQSxNQUNaLEVBQUUsUUFBUSxPQUFPLFNBQVMsR0FBRyxRQUFRLEdBQUc7QUFBQSxNQUN4QztBQUFBLE1BQ0EsRUFBRSxRQUFRLE1BQU0sU0FBUyxJQUFJLFFBQVEsUUFBUTtBQUFBLElBQzlDO0FBQ0EsV0FBTyxnQkFBZ0IsS0FBSyxRQUFRLEVBQUUsUUFBUSxPQUFPLFNBQVMsR0FBRyxRQUFRLEdBQUcsQ0FBQztBQUM3RSxXQUFPLGdCQUFnQixLQUFLLGVBQWUsQ0FBQyxXQUFXLENBQUM7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyxxRkFBcUYsTUFBTTtBQUUvRixVQUFNLE9BQU87QUFBQSxNQUNaLEVBQUUsS0FBSyxRQUFnQyxLQUFLLFNBQVM7QUFBQSxNQUNyRCxFQUFFLEtBQUssU0FBUztBQUFBLE1BQ2hCO0FBQUEsSUFDRDtBQUNBLFdBQU8sZ0JBQWdCLEtBQUssUUFBUSxFQUFFLEtBQUssVUFBVSxLQUFLLFNBQVMsQ0FBQztBQUNwRSxXQUFPLFlBQVksS0FBSyxZQUFZLElBQUksR0FBRyxFQUFHLFFBQVEsUUFBUTtBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLDRFQUE0RSxNQUFNO0FBR3RGLFVBQU0sU0FBUyxFQUFFLEtBQUssU0FBUztBQUMvQixVQUFNLE9BQU8sb0JBQW9CLFFBQVEsUUFBVyxNQUFTO0FBQzdELFdBQU8sZUFBZSxLQUFLLFFBQVEsTUFBTTtBQUN6QyxXQUFPLGdCQUFnQixLQUFLLFFBQVEsRUFBRSxLQUFLLFNBQVMsQ0FBQztBQUFBLEVBQ3RELENBQUM7QUFFRCxPQUFLLHNHQUFzRyxNQUFNO0FBQ2hILFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxTQUFTLG9CQUFvQixDQUFDLEdBQUcsRUFBRSxLQUFLLFNBQVMsR0FBRyxNQUFTO0FBQUE7QUFBQSxRQUU3RCxLQUFLLG9CQUFvQixFQUFFLEtBQUssSUFBSSxHQUFHLFFBQVcsRUFBRSxLQUFLLElBQUksQ0FBQyxFQUFFO0FBQUEsUUFDaEUsY0FBYyxvQkFBb0IsUUFBVyxRQUFXLE1BQVM7QUFBQSxRQUNqRSxVQUFVLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3pDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsU0FBUyxFQUFFLFFBQVEsRUFBRSxLQUFLLFNBQVMsR0FBRyxhQUFhLG9CQUFJLElBQUksQ0FBQyxDQUFDLEtBQUssRUFBRSxPQUFPLFVBQVUsUUFBUSxVQUFVLGVBQWUsQ0FBQyxFQUFFLFNBQVMsVUFBVSxPQUFPLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsZUFBZSxDQUFDLFFBQVEsRUFBRTtBQUFBLFFBQy9MLEtBQUssQ0FBQyxhQUFhLE1BQU07QUFBQSxRQUN6QixjQUFjLEVBQUUsUUFBUSxDQUFDLEdBQUcsYUFBYSxvQkFBSSxJQUFJLEdBQUcsZUFBZSxDQUFDLEVBQUU7QUFBQSxRQUN0RSxVQUFVLEVBQUUsUUFBUSxDQUFDLEdBQUcsYUFBYSxvQkFBSSxJQUFJLEdBQUcsZUFBZSxDQUFDLEVBQUU7QUFBQSxNQUNuRTtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBSTlFLFVBQU0sWUFBWSxLQUFLLE1BQU0sdUNBQXVDO0FBQ3BFLFVBQU0sT0FBTyxvQkFBb0IsV0FBVyxRQUFXLE1BQVM7QUFDaEUsV0FBTyxZQUFhLENBQUMsRUFBOEIsVUFBVSxNQUFTO0FBQ3RFLFdBQU8sWUFBWSxPQUFPLFVBQVUsZUFBZSxLQUFLLE9BQU8sV0FBVyxVQUFVLEdBQUcsS0FBSztBQUM1RixXQUFPLFlBQVksT0FBTyxlQUFlLEtBQUssTUFBTSxHQUFHLE9BQU8sU0FBUztBQUFBLEVBQ3hFLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
