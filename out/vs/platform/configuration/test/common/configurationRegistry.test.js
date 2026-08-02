import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Extensions as ConfigurationExtensions, isConfigurationDefaultSourceEquals } from "../../common/configurationRegistry.js";
import { Registry } from "../../../registry/common/platform.js";
import { PolicyCategory } from "../../../../base/common/policy.js";
suite("ConfigurationRegistry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
  setup(() => reset());
  teardown(() => reset());
  function reset() {
    configurationRegistry.deregisterConfigurations(configurationRegistry.getConfigurations());
    configurationRegistry.deregisterDefaultConfigurations(configurationRegistry.getRegisteredDefaultConfigurations());
  }
  test("configuration override", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "config": { a: 1, b: 2 } } }]);
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "[lang]": { a: 2, c: 3 } } }]);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 1, b: 2 });
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"].default, { a: 2, c: 3 });
  });
  test("configuration override defaults - prevent overriding default value", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config.preventDefaultValueOverride": {
          "type": "object",
          default: { a: 0 },
          "disallowConfigurationDefault": true
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "config.preventDefaultValueOverride": { a: 1, b: 2 } } }]);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config.preventDefaultValueOverride"].default, { a: 0 });
  });
  test("configuration override defaults - merges defaults", async () => {
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "[lang]": { a: 1, b: 2 } } }]);
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "[lang]": { a: 2, c: 3 } } }]);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"].default, { a: 2, b: 2, c: 3 });
  });
  test("configuration defaults - merge object default overrides", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "config": { a: 1, b: 2 } } }]);
    configurationRegistry.registerDefaultConfigurations([{ overrides: { "config": { a: 2, c: 3 } } }]);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
  });
  test("registering multiple settings with same policy", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "policy1": {
          "type": "object",
          policy: {
            name: "policy",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "", value: "" } }
          }
        },
        "policy2": {
          "type": "object",
          policy: {
            name: "policy",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "", value: "" } }
          }
        }
      }
    });
    const actual = configurationRegistry.getConfigurationProperties();
    assert.ok(actual["policy1"] !== void 0);
    assert.ok(actual["policy2"] === void 0);
  });
  test("a policyReference attaches a subordinate setting to an owning policy", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "policy.owner": {
          "type": "boolean",
          policy: {
            name: "sharedPolicy",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "owner", value: "" } }
          }
        },
        "policy.subordinate": {
          "type": "boolean",
          policyReference: {
            name: "sharedPolicy"
          }
        }
      }
    });
    const actual = configurationRegistry.getConfigurationProperties();
    assert.ok(actual["policy.owner"] !== void 0);
    assert.ok(actual["policy.subordinate"] !== void 0);
    assert.strictEqual(configurationRegistry.getPolicyConfigurations().get("sharedPolicy"), "policy.owner");
    assert.deepStrictEqual([...configurationRegistry.getPolicyReferenceConfigurations().get("sharedPolicy") ?? []], ["policy.subordinate"]);
  });
  test("a policyReference does not require its owner to be registered", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "policy.orphanReference": {
          "type": "boolean",
          policyReference: {
            name: "externallyOwnedPolicy"
          }
        }
      }
    });
    const actual = configurationRegistry.getConfigurationProperties();
    assert.ok(actual["policy.orphanReference"] !== void 0);
    assert.strictEqual(configurationRegistry.getPolicyConfigurations().get("externallyOwnedPolicy"), void 0);
    assert.deepStrictEqual([...configurationRegistry.getPolicyReferenceConfigurations().get("externallyOwnedPolicy") ?? []], ["policy.orphanReference"]);
  });
  test("a setting declaring both policy and policyReference is rejected", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "policy.both": {
          "type": "boolean",
          policy: {
            name: "policyBoth",
            category: PolicyCategory.Extensions,
            minimumVersion: "1.0.0",
            localization: { description: { key: "both", value: "" } }
          },
          policyReference: {
            name: "policyBothReference"
          }
        }
      }
    });
    const actual = configurationRegistry.getConfigurationProperties();
    assert.ok(actual["policy.both"] === void 0);
    assert.strictEqual(configurationRegistry.getPolicyConfigurations().get("policyBoth"), void 0);
    assert.strictEqual(configurationRegistry.getPolicyReferenceConfigurations().get("policyBothReference"), void 0);
  });
  test("configuration defaults - deregister merged object default override", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "config": { a: 1, b: 2 } }, source: { id: "source1", displayName: "source1" } }];
    const overrides2 = [{ overrides: { "config": { a: 2, c: 3 } }, source: { id: "source2", displayName: "source2" } }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 1, b: 2 });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, {});
  });
  test("configuration defaults - deregister merged object default override without source", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "config": { a: 1, b: 2 } } }];
    const overrides2 = [{ overrides: { "config": { a: 2, c: 3 } } }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 1, b: 2 });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, {});
  });
  test("configuration defaults - deregister merged object default language overrides", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "[lang]": { "config": { a: 1, b: 2 } } }, source: { id: "source1", displayName: "source1" } }];
    const overrides2 = [{ overrides: { "[lang]": { "config": { a: 2, c: 3 } } }, source: { id: "source2", displayName: "source2" } }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"].default, { "config": { a: 2, b: 2, c: 3 } });
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"].default, { "config": { a: 1, b: 2 } });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["[lang]"], void 0);
  });
  test("configuration defaults - string source", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "config": { a: 1, b: 2 } }, source: "source1" }];
    const overrides2 = [{ overrides: { "config": { a: 2, c: 3 } }, source: "source2" }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].defaultValueSource instanceof Map, true);
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 1, b: 2 });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, {});
  });
  test("configuration defaults - deregister with string source and extension source", async () => {
    configurationRegistry.registerConfiguration({
      "id": "_test_default",
      "type": "object",
      "properties": {
        "config": {
          "type": "object"
        }
      }
    });
    const overrides1 = [{ overrides: { "config": { a: 1, b: 2 } }, source: "stringSource" }];
    const overrides2 = [{ overrides: { "config": { a: 2, c: 3 } }, source: { id: "extSource", displayName: "Extension Source" } }];
    configurationRegistry.registerDefaultConfigurations(overrides1);
    configurationRegistry.registerDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, b: 2, c: 3 });
    configurationRegistry.deregisterDefaultConfigurations(overrides1);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, { a: 2, c: 3 });
    configurationRegistry.deregisterDefaultConfigurations(overrides2);
    assert.deepStrictEqual(configurationRegistry.getConfigurationProperties()["config"].default, {});
  });
  suite("isConfigurationDefaultSourceEquals", () => {
    test("both undefined", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals(void 0, void 0), true);
    });
    test("one undefined", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals("source", void 0), false);
      assert.strictEqual(isConfigurationDefaultSourceEquals(void 0, "source"), false);
      assert.strictEqual(isConfigurationDefaultSourceEquals({ id: "ext" }, void 0), false);
      assert.strictEqual(isConfigurationDefaultSourceEquals(void 0, { id: "ext" }), false);
    });
    test("same string source", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals("source", "source"), true);
    });
    test("different string sources", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals("source1", "source2"), false);
    });
    test("same extension source", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals({ id: "ext" }, { id: "ext" }), true);
    });
    test("different extension sources", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals({ id: "ext1" }, { id: "ext2" }), false);
    });
    test("string vs extension source", () => {
      assert.strictEqual(isConfigurationDefaultSourceEquals("ext", { id: "ext" }), false);
      assert.strictEqual(isConfigurationDefaultSourceEquals({ id: "ext" }, "ext"), false);
    });
    test("same reference", () => {
      const source = { id: "ext", displayName: "Extension" };
      assert.strictEqual(isConfigurationDefaultSourceEquals(source, source), true);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMgfSBmcm9tICcuLi8uLi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFBvbGljeUNhdGVnb3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcblxuc3VpdGUoJ0NvbmZpZ3VyYXRpb25SZWdpc3RyeScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblxuXHRzZXR1cCgoKSA9PiByZXNldCgpKTtcblx0dGVhcmRvd24oKCkgPT4gcmVzZXQoKSk7XG5cblx0ZnVuY3Rpb24gcmVzZXQoKSB7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJDb25maWd1cmF0aW9ucyhjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvbnMoKSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFJlZ2lzdGVyZWREZWZhdWx0Q29uZmlndXJhdGlvbnMoKSk7XG5cdH1cblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIG92ZXJyaWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0X2RlZmF1bHQnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlnJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDEsIGI6IDIgfSB9IH1dKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzOiB7ICdbbGFuZ10nOiB7IGE6IDIsIGM6IDMgfSB9IH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHsgYTogMSwgYjogMiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydbbGFuZ10nXS5kZWZhdWx0LCB7IGE6IDIsIGM6IDMgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyYXRpb24gb3ZlcnJpZGUgZGVmYXVsdHMgLSBwcmV2ZW50IG92ZXJyaWRpbmcgZGVmYXVsdCB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZy5wcmV2ZW50RGVmYXVsdFZhbHVlT3ZlcnJpZGUnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZWZhdWx0OiB7IGE6IDAgfSxcblx0XHRcdFx0XHQnZGlzYWxsb3dDb25maWd1cmF0aW9uRGVmYXVsdCc6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFt7IG92ZXJyaWRlczogeyAnY29uZmlnLnByZXZlbnREZWZhdWx0VmFsdWVPdmVycmlkZSc6IHsgYTogMSwgYjogMiB9IH0gfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnLnByZXZlbnREZWZhdWx0VmFsdWVPdmVycmlkZSddLmRlZmF1bHQsIHsgYTogMCB9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhdGlvbiBvdmVycmlkZSBkZWZhdWx0cyAtIG1lcmdlcyBkZWZhdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzOiB7ICdbbGFuZ10nOiB7IGE6IDEsIGI6IDIgfSB9IH1dKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMoW3sgb3ZlcnJpZGVzOiB7ICdbbGFuZ10nOiB7IGE6IDIsIGM6IDMgfSB9IH1dKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ1tsYW5nXSddLmRlZmF1bHQsIHsgYTogMiwgYjogMiwgYzogMyB9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhdGlvbiBkZWZhdWx0cyAtIG1lcmdlIG9iamVjdCBkZWZhdWx0IG92ZXJyaWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFt7IG92ZXJyaWRlczogeyAnY29uZmlnJzogeyBhOiAxLCBiOiAyIH0gfSB9XSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKFt7IG92ZXJyaWRlczogeyAnY29uZmlnJzogeyBhOiAyLCBjOiAzIH0gfSB9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7IGE6IDIsIGI6IDIsIGM6IDMgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyaW5nIG11bHRpcGxlIHNldHRpbmdzIHdpdGggc2FtZSBwb2xpY3knLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3RfZGVmYXVsdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdwb2xpY3kxJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0XHRuYW1lOiAncG9saWN5Jyxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdwb2xpY3kyJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdFx0XHRuYW1lOiAncG9saWN5Jyxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnJywgdmFsdWU6ICcnIH0sIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRhc3NlcnQub2soYWN0dWFsWydwb2xpY3kxJ10gIT09IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbFsncG9saWN5MiddID09PSB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHBvbGljeVJlZmVyZW5jZSBhdHRhY2hlcyBhIHN1Ym9yZGluYXRlIHNldHRpbmcgdG8gYW4gb3duaW5nIHBvbGljeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3BvbGljeS5vd25lcic6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdzaGFyZWRQb2xpY3knLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMC4wJyxcblx0XHRcdFx0XHRcdGxvY2FsaXphdGlvbjogeyBkZXNjcmlwdGlvbjogeyBrZXk6ICdvd25lcicsIHZhbHVlOiAnJyB9LCB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQncG9saWN5LnN1Ym9yZGluYXRlJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdHBvbGljeVJlZmVyZW5jZToge1xuXHRcdFx0XHRcdFx0bmFtZTogJ3NoYXJlZFBvbGljeScsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbFsncG9saWN5Lm93bmVyJ10gIT09IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdHVhbFsncG9saWN5LnN1Ym9yZGluYXRlJ10gIT09IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRQb2xpY3lDb25maWd1cmF0aW9ucygpLmdldCgnc2hhcmVkUG9saWN5JyksICdwb2xpY3kub3duZXInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi4oY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zKCkuZ2V0KCdzaGFyZWRQb2xpY3knKSA/PyBbXSldLCBbJ3BvbGljeS5zdWJvcmRpbmF0ZSddKTtcblx0fSk7XG5cblx0dGVzdCgnYSBwb2xpY3lSZWZlcmVuY2UgZG9lcyBub3QgcmVxdWlyZSBpdHMgb3duZXIgdG8gYmUgcmVnaXN0ZXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3BvbGljeS5vcnBoYW5SZWZlcmVuY2UnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0cG9saWN5UmVmZXJlbmNlOiB7XG5cdFx0XHRcdFx0XHRuYW1lOiAnZXh0ZXJuYWxseU93bmVkUG9saWN5Jyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRhc3NlcnQub2soYWN0dWFsWydwb2xpY3kub3JwaGFuUmVmZXJlbmNlJ10gIT09IHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRQb2xpY3lDb25maWd1cmF0aW9ucygpLmdldCgnZXh0ZXJuYWxseU93bmVkUG9saWN5JyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRQb2xpY3lSZWZlcmVuY2VDb25maWd1cmF0aW9ucygpLmdldCgnZXh0ZXJuYWxseU93bmVkUG9saWN5JykgPz8gW10pXSwgWydwb2xpY3kub3JwaGFuUmVmZXJlbmNlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHNldHRpbmcgZGVjbGFyaW5nIGJvdGggcG9saWN5IGFuZCBwb2xpY3lSZWZlcmVuY2UgaXMgcmVqZWN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3RfZGVmYXVsdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdwb2xpY3kuYm90aCc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdwb2xpY3lCb3RoJyxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5FeHRlbnNpb25zLFxuXHRcdFx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAnYm90aCcsIHZhbHVlOiAnJyB9LCB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRwb2xpY3lSZWZlcmVuY2U6IHtcblx0XHRcdFx0XHRcdG5hbWU6ICdwb2xpY3lCb3RoUmVmZXJlbmNlJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBhY3R1YWwgPSBjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRhc3NlcnQub2soYWN0dWFsWydwb2xpY3kuYm90aCddID09PSB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0UG9saWN5Q29uZmlndXJhdGlvbnMoKS5nZXQoJ3BvbGljeUJvdGgnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldFBvbGljeVJlZmVyZW5jZUNvbmZpZ3VyYXRpb25zKCkuZ2V0KCdwb2xpY3lCb3RoUmVmZXJlbmNlJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpZ3VyYXRpb24gZGVmYXVsdHMgLSBkZXJlZ2lzdGVyIG1lcmdlZCBvYmplY3QgZGVmYXVsdCBvdmVycmlkZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdCdpZCc6ICdfdGVzdF9kZWZhdWx0Jyxcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2NvbmZpZyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBvdmVycmlkZXMxID0gW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDEsIGI6IDIgfSB9LCBzb3VyY2U6IHsgaWQ6ICdzb3VyY2UxJywgZGlzcGxheU5hbWU6ICdzb3VyY2UxJyB9IH1dO1xuXHRcdGNvbnN0IG92ZXJyaWRlczIgPSBbeyBvdmVycmlkZXM6IHsgJ2NvbmZpZyc6IHsgYTogMiwgYzogMyB9IH0sIHNvdXJjZTogeyBpZDogJ3NvdXJjZTInLCBkaXNwbGF5TmFtZTogJ3NvdXJjZTInIH0gfV07XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwgeyBhOiAyLCBiOiAyLCBjOiAzIH0pO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7IGE6IDEsIGI6IDIgfSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMxKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHt9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhdGlvbiBkZWZhdWx0cyAtIGRlcmVnaXN0ZXIgbWVyZ2VkIG9iamVjdCBkZWZhdWx0IG92ZXJyaWRlIHdpdGhvdXQgc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0X2RlZmF1bHQnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlnJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IG92ZXJyaWRlczEgPSBbeyBvdmVycmlkZXM6IHsgJ2NvbmZpZyc6IHsgYTogMSwgYjogMiB9IH0gfV07XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzMiA9IFt7IG92ZXJyaWRlczogeyAnY29uZmlnJzogeyBhOiAyLCBjOiAzIH0gfSB9XTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMxKTtcblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7IGE6IDIsIGI6IDIsIGM6IDMgfSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHsgYTogMSwgYjogMiB9KTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIGRlZmF1bHRzIC0gZGVyZWdpc3RlciBtZXJnZWQgb2JqZWN0IGRlZmF1bHQgbGFuZ3VhZ2Ugb3ZlcnJpZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ190ZXN0X2RlZmF1bHQnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnY29uZmlnJzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IG92ZXJyaWRlczEgPSBbeyBvdmVycmlkZXM6IHsgJ1tsYW5nXSc6IHsgJ2NvbmZpZyc6IHsgYTogMSwgYjogMiB9IH0gfSwgc291cmNlOiB7IGlkOiAnc291cmNlMScsIGRpc3BsYXlOYW1lOiAnc291cmNlMScgfSB9XTtcblx0XHRjb25zdCBvdmVycmlkZXMyID0gW3sgb3ZlcnJpZGVzOiB7ICdbbGFuZ10nOiB7ICdjb25maWcnOiB7IGE6IDIsIGM6IDMgfSB9IH0sIHNvdXJjZTogeyBpZDogJ3NvdXJjZTInLCBkaXNwbGF5TmFtZTogJ3NvdXJjZTInIH0gfV07XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnW2xhbmddJ10uZGVmYXVsdCwgeyAnY29uZmlnJzogeyBhOiAyLCBiOiAyLCBjOiAzIH0gfSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ1tsYW5nXSddLmRlZmF1bHQsIHsgJ2NvbmZpZyc6IHsgYTogMSwgYjogMiB9IH0pO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydbbGFuZ10nXSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlndXJhdGlvbiBkZWZhdWx0cyAtIHN0cmluZyBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3RfZGVmYXVsdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3ZlcnJpZGVzMSA9IFt7IG92ZXJyaWRlczogeyAnY29uZmlnJzogeyBhOiAxLCBiOiAyIH0gfSwgc291cmNlOiAnc291cmNlMScgfV07XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzMiA9IFt7IG92ZXJyaWRlczogeyAnY29uZmlnJzogeyBhOiAyLCBjOiAzIH0gfSwgc291cmNlOiAnc291cmNlMicgfV07XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwgeyBhOiAyLCBiOiAyLCBjOiAzIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHRWYWx1ZVNvdXJjZSBpbnN0YW5jZW9mIE1hcCwgdHJ1ZSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHsgYTogMSwgYjogMiB9KTtcblxuXHRcdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczEpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwge30pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb25maWd1cmF0aW9uIGRlZmF1bHRzIC0gZGVyZWdpc3RlciB3aXRoIHN0cmluZyBzb3VyY2UgYW5kIGV4dGVuc2lvbiBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQnaWQnOiAnX3Rlc3RfZGVmYXVsdCcsXG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdjb25maWcnOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgb3ZlcnJpZGVzMSA9IFt7IG92ZXJyaWRlczogeyAnY29uZmlnJzogeyBhOiAxLCBiOiAyIH0gfSwgc291cmNlOiAnc3RyaW5nU291cmNlJyB9XTtcblx0XHRjb25zdCBvdmVycmlkZXMyID0gW3sgb3ZlcnJpZGVzOiB7ICdjb25maWcnOiB7IGE6IDIsIGM6IDMgfSB9LCBzb3VyY2U6IHsgaWQ6ICdleHRTb3VyY2UnLCBkaXNwbGF5TmFtZTogJ0V4dGVuc2lvbiBTb3VyY2UnIH0gfV07XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMSk7XG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyRGVmYXVsdENvbmZpZ3VyYXRpb25zKG92ZXJyaWRlczIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWd1cmF0aW9uUmVnaXN0cnkuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKVsnY29uZmlnJ10uZGVmYXVsdCwgeyBhOiAyLCBiOiAyLCBjOiAzIH0pO1xuXG5cdFx0Y29uZmlndXJhdGlvblJlZ2lzdHJ5LmRlcmVnaXN0ZXJEZWZhdWx0Q29uZmlndXJhdGlvbnMob3ZlcnJpZGVzMSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpWydjb25maWcnXS5kZWZhdWx0LCB7IGE6IDIsIGM6IDMgfSk7XG5cblx0XHRjb25maWd1cmF0aW9uUmVnaXN0cnkuZGVyZWdpc3RlckRlZmF1bHRDb25maWd1cmF0aW9ucyhvdmVycmlkZXMyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbJ2NvbmZpZyddLmRlZmF1bHQsIHt9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdib3RoIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbmUgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMoJ3NvdXJjZScsIHVuZGVmaW5lZCksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKHVuZGVmaW5lZCwgJ3NvdXJjZScpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscyh7IGlkOiAnZXh0JyB9LCB1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscyh1bmRlZmluZWQsIHsgaWQ6ICdleHQnIH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzYW1lIHN0cmluZyBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscygnc291cmNlJywgJ3NvdXJjZScpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RpZmZlcmVudCBzdHJpbmcgc291cmNlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKCdzb3VyY2UxJywgJ3NvdXJjZTInKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2FtZSBleHRlbnNpb24gc291cmNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMoeyBpZDogJ2V4dCcgfSwgeyBpZDogJ2V4dCcgfSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlmZmVyZW50IGV4dGVuc2lvbiBzb3VyY2VzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQ29uZmlndXJhdGlvbkRlZmF1bHRTb3VyY2VFcXVhbHMoeyBpZDogJ2V4dDEnIH0sIHsgaWQ6ICdleHQyJyB9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaW5nIHZzIGV4dGVuc2lvbiBzb3VyY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscygnZXh0JywgeyBpZDogJ2V4dCcgfSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0NvbmZpZ3VyYXRpb25EZWZhdWx0U291cmNlRXF1YWxzKHsgaWQ6ICdleHQnIH0sICdleHQnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2FtZSByZWZlcmVuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2UgPSB7IGlkOiAnZXh0JywgZGlzcGxheU5hbWU6ICdFeHRlbnNpb24nIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNDb25maWd1cmF0aW9uRGVmYXVsdFNvdXJjZUVxdWFscyhzb3VyY2UsIHNvdXJjZSksIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsY0FBYyx5QkFBaUQsMENBQTBDO0FBQ2xILFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBRS9CLE1BQU0seUJBQXlCLE1BQU07QUFFcEMsMENBQXdDO0FBRXhDLFFBQU0sd0JBQXdCLFNBQVMsR0FBMkIsd0JBQXdCLGFBQWE7QUFFdkcsUUFBTSxNQUFNLE1BQU0sQ0FBQztBQUNuQixXQUFTLE1BQU0sTUFBTSxDQUFDO0FBRXRCLFdBQVMsUUFBUTtBQUNoQiwwQkFBc0IseUJBQXlCLHNCQUFzQixrQkFBa0IsQ0FBQztBQUN4RiwwQkFBc0IsZ0NBQWdDLHNCQUFzQixtQ0FBbUMsQ0FBQztBQUFBLEVBQ2pIO0FBRUEsT0FBSywwQkFBMEIsWUFBWTtBQUMxQywwQkFBc0Isc0JBQXNCO0FBQUEsTUFDM0MsTUFBTTtBQUFBLE1BQ04sUUFBUTtBQUFBLE1BQ1IsY0FBYztBQUFBLFFBQ2IsVUFBVTtBQUFBLFVBQ1QsUUFBUTtBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsMEJBQXNCLDhCQUE4QixDQUFDLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFDakcsMEJBQXNCLDhCQUE4QixDQUFDLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQUM7QUFFakcsV0FBTyxnQkFBZ0Isc0JBQXNCLDJCQUEyQixFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsR0FB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
